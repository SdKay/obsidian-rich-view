import { LINE_HEIGHT_EM } from './visioTextLines';
import type { HAlign, VAlign } from './visioTextBox';

export interface MarkBoxInput {
	bbox: { x: number; y: number; width: number; height: number };
	text: string;
	textX: number;
	textY: number;
	textWidth: number;
	textHAlign: HAlign;
	textVAlign: VAlign;
	fontSize: number;
}

export interface Box { x: number; y: number; w: number; h: number }

/**
 * The box a search mark covers for a shape, in page px. Normally the outline. A line carrying a label has an
 * outline with no width or no height, which would draw an invisible mark, so the label's own box is added to it.
 */
export function markBox(s: MarkBoxInput): Box {
	const outline: Box = { x: s.bbox.x, y: s.bbox.y, w: s.bbox.width, h: s.bbox.height };
	if (outline.w > 0 && outline.h > 0) return outline;
	if (s.text === '') return outline;

	const lines = s.text.split(/\r?\n/).length;
	const h = lines * s.fontSize * LINE_HEIGHT_EM;
	const w = s.textWidth;
	if (!Number.isFinite(h) || !Number.isFinite(w)) return outline;

	const x = s.textHAlign === 'start' ? s.textX : s.textHAlign === 'end' ? s.textX - w : s.textX - w / 2;
	const y = s.textVAlign === 'top' ? s.textY : s.textVAlign === 'bottom' ? s.textY - h : s.textY - h / 2;

	const left = Math.min(outline.x, x);
	const top = Math.min(outline.y, y);
	const right = Math.max(outline.x + outline.w, x + w);
	const bottom = Math.max(outline.y + outline.h, y + h);
	return { x: left, y: top, w: right - left, h: bottom - top };
}
