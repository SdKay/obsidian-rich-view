import { buildPresentation, buildTextIndex, parseZip, RECOMMENDED_ZIP_LIMITS } from '@aiden0z/pptx-renderer';
import type { ExtractedLine, ExtractResult } from '../richSearchApi';
import { slideAnchorOf } from './anchors';

/** Text lines allowed per file; a file past this is treated as pathological. */
export const MAX_PPTX_LINES = 50_000;
/**
 * Raw XML size allowed for one slide, checked BEFORE the library models it: its modelling
 * time grows faster than linearly with slide size (measured on synthetic text-only slides:
 * 148 KB ≈ 0.4 s, 296 KB ≈ 1.1 s), so counting result lines afterwards would come too late.
 * Extrapolated from four measurements, not from real decks — calibrate and document.
 */
export const MAX_PPTX_SLIDE_XML_CHARS = 512 * 1024;
/** Total slide XML allowed per file. */
export const MAX_PPTX_TOTAL_XML_CHARS = 16 * 1024 * 1024;

/**
 * Searchable text of a .pptx file, from the renderer library's own text
 * index so what is searchable is what the viewer shows. One line per
 * paragraph of each text box or table cell. Anchor is
 * `{ slide (1-based), nodeId }` — private to Rich View, never interpreted
 * by rich-search; `nodeId` is the library's id for the shape.
 *
 * Not covered: slide notes, and (unverified) text inside SmartArt or charts.
 * Never throws; stateless.
 */
export async function extractPptx(content: ArrayBuffer): Promise<ExtractResult> {
	try {
		if (content.byteLength === 0) return { ok: false, error: 'The file is empty' };

		// The library throws on empty/garbage/truncated zips and enforces size limits while unpacking.
		const files = await parseZip(content, RECOMMENDED_ZIP_LIMITS);
		let total = 0;
		for (const xml of files.slides.values()) {
			total += xml.length;
			if (xml.length > MAX_PPTX_SLIDE_XML_CHARS || total > MAX_PPTX_TOTAL_XML_CHARS) {
				return { ok: false, error: 'A slide holds too much text to search safely' };
			}
		}
		const presentation = buildPresentation(files);

		// The library treats any zip as a presentation and reports it as having zero slides;
		// a real .pptx always has at least one, so zero means "not a PowerPoint file".
		if (presentation.slides.length === 0) return { ok: false, error: 'Not a PowerPoint file (no slides found)' };

		const index = buildTextIndex(presentation, { includeShapes: true, includeTables: true, includeGroups: true });
		const lines: ExtractedLine[] = [];
		for (const entry of index) {
			// The library joins a text box's paragraphs with newlines in one entry.
			let line = 0;
			for (const part of entry.text.split(/\r?\n/)) {
				const text = part.trim();
				if (!text) continue;
				lines.push({
					text,
					location: `Slide ${entry.slideIndex + 1}`,
					anchor: slideAnchorOf(entry.slideIndex + 1, entry.nodeId, line++),
				});
				if (lines.length > MAX_PPTX_LINES) {
					return { ok: false, error: `Too much text to search (over ${MAX_PPTX_LINES} lines)` };  // many small slides; the per-slide guard above handles one huge one
				}
			}
		}
		return { ok: true, value: lines };
	} catch (err) {
		return { ok: false, error: describe(err) };
	}
}

/** The library's messages come from its zip layer ("End of data reached…"); say what they mean. */
function describe(err: unknown): string {
	const msg = err instanceof Error ? err.message : '';
	// Limit check first: its message ("PPTX zip limit exceeded: …") also contains "zip".
	if (/limit|exceed|too large|bomb/i.test(msg)) return 'The presentation is too large to search';
	if (/zip|central directory|end of data|corrupt|signature/i.test(msg)) return 'The file is damaged or is not a PowerPoint file';
	return msg && msg.length < 100 ? msg : 'Could not read the file';
}
