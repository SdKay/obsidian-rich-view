/** Bounds on the zoom a jump to a hit may choose, as a scale (1 = 100%). */
export const MIN_JUMP_SCALE = 0.25;
export const MAX_JUMP_SCALE = 4;

/**
 * The scale at which text of `shapeFontSize` (in diagram units) is drawn the same size as note body text
 * (`bodyFontPx`). The zoom is only ever raised: a diagram already shown larger than that stays as it is, so
 * a jump never shrinks what the reader chose. Returns null when the sizes are unusable, meaning "leave the zoom".
 */
export function readableScale(currentScale: number, shapeFontSize: number | null, bodyFontPx: number): number | null {
	if (!(currentScale > 0) || shapeFontSize === null || !(shapeFontSize > 0) || !(bodyFontPx > 0)) return null;
	const wanted = clamp(bodyFontPx / shapeFontSize, MIN_JUMP_SCALE, MAX_JUMP_SCALE);
	return wanted > currentScale ? wanted : null;
}

function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value));
}

/** Body text size of the note editor in CSS pixels, read from the theme; 16 when it cannot be read. */
export function bodyFontPx(doc: Document): number {
	const raw = doc.body ? getComputedStyle(doc.body).getPropertyValue('--font-text-size') : '';
	const px = parseFloat(raw);
	return px > 0 ? px : 16;
}
