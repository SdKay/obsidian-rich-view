import { describe, expect, it } from 'vitest';
import { clampZoomPercent, fitZoomPercent, wheelZoomPercent } from '../src/slideFit';

describe('fitZoomPercent', () => {
	const slide = { width: 960, height: 540 };

	it('is limited by width when the viewport is wide-flat relative to the slide', () => {
		// 16:9 slide in a 500x2000 viewport: width is the constraint.
		expect(fitZoomPercent(slide, { width: 500, height: 2000 })).toBe(Math.round(((500 - 16) / 960) * 100));
	});

	it('is limited by height when the viewport is short — the case the library alone gets wrong', () => {
		expect(fitZoomPercent(slide, { width: 2000, height: 300 })).toBe(Math.round(((300 - 16) / 540) * 100));
	});

	it('falls back to 100 for a degenerate slide size', () => {
		expect(fitZoomPercent({ width: 0, height: 0 }, { width: 800, height: 600 })).toBe(100);
	});

	it('never collapses to zero in a tiny viewport', () => {
		expect(fitZoomPercent(slide, { width: 4, height: 4 })).toBe(10);
	});
});

describe('wheelZoomPercent', () => {
	it('zooms in on negative delta and out on positive', () => {
		expect(wheelZoomPercent(100, -100)).toBeGreaterThan(100);
		expect(wheelZoomPercent(100, 100)).toBeLessThan(100);
	});

	it('clamps to the allowed range', () => {
		expect(wheelZoomPercent(400, -100)).toBe(400);
		expect(wheelZoomPercent(10, 100)).toBe(10);
		expect(clampZoomPercent(9999)).toBe(400);
	});
});
