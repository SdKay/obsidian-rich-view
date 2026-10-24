import type { TextIndexEntry } from '@aiden0z/pptx-renderer';
import type { MatchOptions, RichSearchHostApi } from './richSearchApi';
import { matchText } from './searchHost';
import { findShapeElement, paragraphPieces } from './slideText';
import { spansInPieces } from './textRanges';
import { toLocalRect, visibleRects, type Rect } from './rectSpace';
import { markStyle } from './slideMarks';

const MARK_CLASS = 'slide-view-keyword-mark';

/**
 * Draws a small mark over each occurrence of the search in one text box, directly in the box's element so
 * it moves and scales with the slide. Returns the marks it added, or null when it could not place them
 * exactly (box not found, drawn text differs from the searchable text, no layout yet) — the caller then
 * marks the whole box instead, so a hit is never left unmarked.
 */
export function addKeywordMarks(
	slide: HTMLElement,
	entry: TextIndexEntry,
	host: RichSearchHostApi | null,
	query: MatchOptions,
	/** The one match drawn as opened: which paragraph of this box, and which match in it (both 0-based). Null when none here. */
	opened: { paragraph: number; match: number } | null,
): HTMLElement[] | null {
	const shape = findShapeElement(slide, entry);
	if (!shape) return null;
	const paragraphs = entry.text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
	const pieces = paragraphPieces(shape, paragraphs);
	if (!pieces) return null;

	const origin = shape.getBoundingClientRect();
	const declaredWidth = parseFloat(shape.style.width);
	if (!(origin.width > 0) || !(declaredWidth > 0)) return null;
	const scale = origin.width / declaredWidth;
	const originRect: Rect = { x: origin.left, y: origin.top, w: origin.width, h: origin.height };

	const rects: { rect: Rect; opened: boolean }[] = [];
	for (let p = 0; p < paragraphs.length; p++) {
		const spans = matchText(host, paragraphs[p]!, query);
		if (spans.length === 0) continue;
		// A paragraph with a match must be placed exactly; if it cannot be, mark the whole box instead.
		const paragraph = pieces[p];
		if (!paragraph) return null;
		for (const [matchIndex, span] of spans.entries()) {
			const isOpened = opened !== null && opened.paragraph === p && opened.match === matchIndex;
			for (const s of spansInPieces(paragraph, span.start, span.end)) {
				const piece = paragraph[s.piece]!;
				const range = shape.ownerDocument.createRange();
				range.setStart(piece.node, piece.skipStart + s.start);
				range.setEnd(piece.node, piece.skipStart + s.end);
				const client = Array.from(range.getClientRects()).map(r => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
				rects.push(...visibleRects(client).map(r => ({ rect: toLocalRect(r, originRect, scale), opened: isOpened })));
			}
		}
	}
	// A match that produced no rectangle at all means there is no layout to measure; do not claim success.
	if (rects.length === 0) return null;

	return rects.map(({ rect: r, opened: isOpened }) => {
		const el = shape.createDiv({ cls: MARK_CLASS });
		el.setCssProps({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
		for (const [name, value] of Object.entries(markStyle(isOpened))) el.style.setProperty(name, value);
		return el;
	});
}
