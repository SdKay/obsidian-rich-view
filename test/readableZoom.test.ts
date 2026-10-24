import { describe, expect, it } from 'vitest';
import { bodyFontPx, MAX_JUMP_SCALE, MIN_JUMP_SCALE, readableScale } from '../src/readableZoom';

describe('readableScale', () => {
	it('raises the zoom so the shape text is as large as body text', () => {
		// 12px text, 16px body: needs 16/12 of a scale; currently drawn at 0.3
		expect(readableScale(0.3, 12, 16)).toBeCloseTo(16 / 12, 10);
		expect(readableScale(0.3, 8, 16)).toBeCloseTo(2, 10);
	});
	it('never lowers the zoom: a diagram already large enough is left alone', () => {
		expect(readableScale(2, 12, 16)).toBeNull();
		expect(readableScale(16 / 12, 12, 16)).toBeNull();
	});
	it('raises by a hair when the current zoom is just under the target', () => {
		expect(readableScale(1.3, 12, 16)).toBeCloseTo(16 / 12, 10);
	});
	it('keeps the result within the allowed range', () => {
		expect(readableScale(0.1, 2, 16)).toBe(MAX_JUMP_SCALE);
		expect(readableScale(0.01, 1000, 16)).toBe(MIN_JUMP_SCALE);
	});
	it('leaves the zoom alone when a size is missing, zero, negative or not a number', () => {
		for (const [cur, font, body] of [[1, null, 16], [1, 0, 16], [1, -3, 16], [1, NaN, 16], [1, 12, 0], [1, 12, -1], [1, 12, NaN], [0, 12, 16], [-1, 12, 16], [NaN, 12, 16]] as const) {
			expect(readableScale(cur, font, body)).toBeNull();
		}
	});
	it('does not invent a zoom from an unusable body size, even when the current zoom is below the clamp floor', () => {
		for (const body of [0, -16, NaN]) expect(readableScale(0.1, 12, body)).toBeNull();
	});
	it('a larger body font asks for a larger zoom, a larger shape font for a smaller one', () => {
		expect(readableScale(0.1, 12, 20)!).toBeGreaterThan(readableScale(0.1, 12, 16)!);
		expect(readableScale(0.1, 18, 16)!).toBeLessThan(readableScale(0.1, 12, 16)!);
	});
});

describe('bodyFontPx', () => {
	const withVar = (value: string | null) => {
		const doc = document.implementation.createHTMLDocument('t');
		if (value !== null) doc.body.style.setProperty('--font-text-size', value);
		return doc;
	};
	it('reads the theme\'s text size', () => {
		expect(bodyFontPx(withVar('18px'))).toBe(18);
		expect(bodyFontPx(withVar('15px'))).toBe(15);
	});
	it('falls back to 16 when the variable is missing or unusable', () => {
		expect(bodyFontPx(withVar(null))).toBe(16);
		expect(bodyFontPx(withVar('large'))).toBe(16);
		expect(bodyFontPx(withVar('0px'))).toBe(16);
		expect(bodyFontPx(withVar('-4px'))).toBe(16);
	});
});
