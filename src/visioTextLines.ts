/** Line height as a multiple of the font size, and how far the baseline sits below a line's middle. */
export const LINE_HEIGHT_EM = 1.2;
export const BASELINE_BELOW_MIDDLE_EM = 0.32;

export type VAlign = 'top' | 'middle' | 'bottom';

/**
 * The y of the first line's baseline, in page px (Y grows downward), for `lineCount` lines of text.
 * `anchorY` is where the block is anchored: its top edge, its middle or its bottom edge according to `vAlign`.
 * A top-aligned first line hangs from the anchor, a bottom-aligned last line rests on it, and a middle-aligned
 * block is centred on it, which is what was drawn before alignment was read.
 */
export function firstBaselineY(vAlign: VAlign, anchorY: number, lineCount: number, fontSize: number): number {
	const lineHeight = fontSize * LINE_HEIGHT_EM;
	const baselineInLine = lineHeight / 2 + fontSize * BASELINE_BELOW_MIDDLE_EM;     // from the top of one line
	const blockHeight = lineCount * lineHeight;
	const top = vAlign === 'top' ? anchorY : vAlign === 'bottom' ? anchorY - blockHeight : anchorY - blockHeight / 2;
	return top + baselineInLine;
}
