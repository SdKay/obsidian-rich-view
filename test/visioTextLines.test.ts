import { describe, expect, it } from 'vitest';
import { BASELINE_BELOW_MIDDLE_EM, firstBaselineY, LINE_HEIGHT_EM } from '../src/visioTextLines';

describe('firstBaselineY', () => {
	const fs = 12, lh = fs * LINE_HEIGHT_EM;

	it('middle: matches the layout that was used before alignment was read', () => {
		// the old code: textY - (lines - 1) * lineHeight / 2 + fontSize * 0.32
		for (const lines of [1, 2, 3, 7]) {
			const old = 100 - (lines - 1) * lh / 2 + fs * BASELINE_BELOW_MIDDLE_EM;
			expect(firstBaselineY('middle', 100, lines, fs)).toBeCloseTo(old, 10);
		}
	});
	it('top: the first line hangs from the anchor, whatever the number of lines', () => {
		const one = firstBaselineY('top', 100, 1, fs);
		expect(firstBaselineY('top', 100, 5, fs)).toBeCloseTo(one, 10);
		expect(one).toBeGreaterThan(100);                           // the baseline is below the top edge
		expect(one).toBeLessThan(100 + lh);                         // but within the first line
	});
	it('top: matches where Visio puts the first baseline (0.9 em below the content top for Calibri 9 pt)', () => {
		// measured on a real file: 8.10 pt below the content area's top for 9 pt text
		expect(firstBaselineY('top', 0, 1, 9) / 9).toBeCloseTo(0.92, 1);
	});
	it('bottom: the last line rests on the anchor, so more lines push the first one up', () => {
		const one = firstBaselineY('bottom', 100, 1, fs);
		const three = firstBaselineY('bottom', 100, 3, fs);
		expect(one - three).toBeCloseTo(2 * lh, 10);
		expect(one).toBeLessThan(100 + fs);                         // the baseline is above the bottom edge plus a descender
		expect(one).toBeGreaterThan(100 - lh);
	});
	it('a block of n lines occupies n line heights: top, middle and bottom differ by half and the whole block', () => {
		const n = 4, t = firstBaselineY('top', 50, n, fs), m = firstBaselineY('middle', 50, n, fs), b = firstBaselineY('bottom', 50, n, fs);
		expect(m - t).toBeCloseTo(-n * lh / 2, 10);
		expect(b - t).toBeCloseTo(-n * lh, 10);
	});
	it('scales with the font size', () => {
		expect(firstBaselineY('top', 0, 1, 24)).toBeCloseTo(2 * firstBaselineY('top', 0, 1, 12), 10);
	});
});
