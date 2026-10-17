import { parseDrawioFileStrict } from '../drawioParser';
import { InflateLimitError } from '../boundedInflate';
import type { ExtractedLine, ExtractResult } from '../richSearchApi';
import { htmlLabelToLines } from './labelText';
import { drawioAnchor } from './anchors';

/** Decoded (inflated) diagram text allowed per file. Not measured on real diagrams — calibrate, then document. */
export const MAX_DRAWIO_DECODED_BYTES = 32 * 1024 * 1024;
/** Text lines allowed per file; a file past this is treated as pathological. */
export const MAX_DRAWIO_LINES = 50_000;

/**
 * Searchable text of a .drawio file: one line per cell label (a label with
 * line breaks yields several lines), across all pages. Anchor is
 * `{ page: <page name>, cellId }` — private to Rich View, never interpreted
 * by rich-search; the file view resolves it by page name.
 *
 * Never throws; stateless (does not use the render path's parse cache).
 */
export function extractDrawio(content: ArrayBuffer): Promise<ExtractResult> {
	try {
		return Promise.resolve(extractSync(content));
	} catch (err) {
		return Promise.resolve({ ok: false, error: describe(err) });
	}
}

function extractSync(content: ArrayBuffer): ExtractResult {
	if (content.byteLength === 0) return { ok: false, error: 'The file is empty' };
	const text = new TextDecoder('utf-8').decode(content);

	const file = parseDrawioFileStrict(text, MAX_DRAWIO_DECODED_BYTES);
	if (file.pages.length === 0) return { ok: false, error: 'Not a draw.io file' };

	const lines: ExtractedLine[] = [];
	for (const page of file.pages) {
		for (const cell of cellLabels(page.xml)) {
			for (const [line, part] of htmlLabelToLines(cell.label).entries()) {
				lines.push({ text: part, location: page.name, anchor: drawioAnchor(page.name, cell.id, line) });
				if (lines.length > MAX_DRAWIO_LINES) {
					return { ok: false, error: `Too much text to search (over ${MAX_DRAWIO_LINES} lines)` };
				}
			}
		}
	}
	return { ok: true, value: lines };
}

/** Cells with a non-empty label, in document order. A UserObject wraps its mxCell and carries the label itself. */
export function cellLabels(modelXml: string): { id: string; label: string }[] {
	const doc = new DOMParser().parseFromString(modelXml, 'application/xml');
	if (doc.querySelector('parsererror')) return [];
	const out: { id: string; label: string }[] = [];
	for (const el of Array.from(doc.querySelectorAll('mxCell, UserObject, object'))) {
		const wrapper = el.nodeName === 'UserObject' || el.nodeName === 'object';
		const label = wrapper ? el.getAttribute('label') : el.getAttribute('value');
		// Requiring an id is what keeps a wrapped cell from counting twice: draw.io moves the
		// id up onto the UserObject, so the inner mxCell has none and is skipped here.
		const id = el.getAttribute('id');
		if (label && id) out.push({ id, label });
	}
	return out;
}

function describe(err: unknown): string {
	if (err instanceof InflateLimitError) {
		return `The diagram is too large to search (over ${Math.round(MAX_DRAWIO_DECODED_BYTES / 1048576)} MB of text when unpacked)`;
	}
	if (err instanceof DOMException && err.name === 'InvalidCharacterError') return 'A diagram page is not valid compressed data';
	// pako reports corrupt streams with terse zlib messages ("invalid block type"); name the cause for people.
	if (err instanceof Error && /invalid|incorrect|unexpected|header|stream|distance|code|block/i.test(err.message)) {
		return 'A diagram page could not be unpacked (the file may be damaged)';
	}
	return err instanceof Error && err.message ? err.message : 'Could not read the file';
}
