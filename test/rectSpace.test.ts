import { describe, expect, it } from 'vitest';
import { toLocalRect, visibleRects } from '../src/rectSpace';

describe('toLocalRect', () => {
	it('subtracts the element origin at 100% zoom', () => {
		expect(toLocalRect({ x: 150, y: 80, w: 40, h: 10 }, { x: 100, y: 50, w: 500, h: 300 }, 1)).toEqual({ x: 50, y: 30, w: 40, h: 10 });
	});
	it('divides zoom out of position and size, so the mark follows the slide when it is scaled', () => {
		expect(toLocalRect({ x: 300, y: 150, w: 80, h: 20 }, { x: 100, y: 50, w: 1000, h: 600 }, 2)).toEqual({ x: 100, y: 50, w: 40, h: 10 });
		expect(toLocalRect({ x: 150, y: 80, w: 20, h: 5 }, { x: 100, y: 50, w: 250, h: 150 }, 0.5)).toEqual({ x: 100, y: 60, w: 40, h: 10 });
	});
	it('gives an empty rectangle for a zero, negative or NaN scale instead of dividing by it', () => {
		for (const scale of [0, -1, NaN]) expect(toLocalRect({ x: 1, y: 1, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 }, scale)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
	});
	it('handles a rectangle left of or above the origin', () => {
		expect(toLocalRect({ x: 90, y: 40, w: 10, h: 10 }, { x: 100, y: 50, w: 10, h: 10 }, 1)).toEqual({ x: -10, y: -10, w: 10, h: 10 });
	});
});

describe('visibleRects', () => {
	it('drops zero-sized rectangles and keeps real ones in order', () => {
		const r = (w: number, h: number) => ({ x: 0, y: 0, w, h });
		expect(visibleRects([r(0, 10), r(10, 0), r(5, 5), r(0.2, 20), r(30, 12)])).toEqual([r(5, 5), r(30, 12)]);
	});
});
