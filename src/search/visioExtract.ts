import { unzipSync } from 'fflate';
import { parseVisioFile } from '../visioParser';
import type { ExtractedLine, ExtractResult } from '../richSearchApi';
import { visioAnchor } from './anchors';

/** Text lines allowed per file; a file past this is treated as pathological. */
export const MAX_VISIO_LINES = 50_000;
/**
 * Unpacked size allowed for one XML part (a page or a master), checked BEFORE the parser models it:
 * parse time grows with shape count (jsdom: 4 000 shapes ≈ 3 s, 8 000 ≈ 9 s for ~3.8 MB of XML),
 * so counting result lines afterwards would come too late.
 * Measured in jsdom on synthetic pages, not in Obsidian and not on real diagrams — calibrate and document.
 */
export const MAX_VISIO_PAGE_XML_BYTES = 4 * 1024 * 1024;
/** Total unpacked XML allowed per file. */
export const MAX_VISIO_TOTAL_XML_BYTES = 16 * 1024 * 1024;
/** Unpacked size allowed for any single entry, XML or not (embedded images, zip bombs). */
export const MAX_VISIO_ENTRY_BYTES = 32 * 1024 * 1024;

/**
 * Searchable text of a .vsdx file, taken from the same parsed shapes the viewer
 * draws, so what is searchable is what is shown. One line per row of a shape's
 * label, across all pages. Anchor is `{ page: <page name>, shapeId }` — private to
 * Rich View, never interpreted by rich-search.
 *
 * Not covered, because the viewer does not show them either: shapes without
 * geometry (a plain text box) and text a shape inherits from its master.
 * Never throws; stateless.
 */
export function extractVisio(content: ArrayBuffer): Promise<ExtractResult> {
	try {
		return Promise.resolve(extractSync(content));
	} catch (err) {
		return Promise.resolve({ ok: false, error: describe(err) });
	}
}

function extractSync(content: ArrayBuffer): ExtractResult {
	if (content.byteLength === 0) return { ok: false, error: 'The file is empty' };

	const refusal = checkSizes(new Uint8Array(content));
	if (refusal) return { ok: false, error: refusal };

	const file = parseVisioFile(content);
	if (file.error || file.pages.length === 0) return { ok: false, error: file.error ?? 'Not a Visio file (no pages found)' };

	const lines: ExtractedLine[] = [];
	for (const page of file.pages) {
		for (const shape of page.shapes) {
			let line = 0;
			for (const part of shape.text.split(/\r?\n/)) {
				const text = part.trim();
				if (!text) continue;
				lines.push({ text, location: page.name, anchor: visioAnchor(page.name, shape.id, line++) });
				if (lines.length > MAX_VISIO_LINES) return { ok: false, error: `Too much text to search (over ${MAX_VISIO_LINES} lines)` };
			}
		}
	}
	return { ok: true, value: lines };
}

/**
 * Reads only the zip directory (the filter rejects every entry, so nothing is unpacked)
 * and refuses a file whose declared sizes are over the limits. Declared sizes cannot be
 * used to sneak data past the parser: fflate sizes its output buffer from them and
 * truncates anything beyond (checked with fflate 0.8.3 on a header that lied).
 */
function checkSizes(bytes: Uint8Array): string | null {
	let refusal: string | null = null;
	let xmlTotal = 0;
	unzipSync(bytes, {
		filter: info => {
			if (info.originalSize > MAX_VISIO_ENTRY_BYTES) refusal ??= 'The file contains an entry that is too large to search safely';
			if (/\.xml$/i.test(info.name)) {
				xmlTotal += info.originalSize;
				if (info.originalSize > MAX_VISIO_PAGE_XML_BYTES || xmlTotal > MAX_VISIO_TOTAL_XML_BYTES) {
					refusal ??= 'A page holds too much data to search safely';
				}
			}
			return false;
		},
	});
	return refusal;
}

function describe(err: unknown): string {
	const msg = err instanceof Error ? err.message : '';
	if (/zip|data|unexpected|invalid|eof/i.test(msg)) return 'The file is damaged or is not a Visio file';
	return msg && msg.length < 100 ? msg : 'Could not read the file';
}
