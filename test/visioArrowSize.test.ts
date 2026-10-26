import { describe, expect, it } from 'vitest';
import { arrowExtent, arrowheadPath, shortenPolyline } from '../src/visioArrow';

// Measured from Visio's own SVG export of lines drawn with arrow style 4 (the filled triangle): line weight in pt,
// arrow size cell (0..3), and the half-width of the head in pt. The head is twice as long as it is wide.
const MEASURED: [lineWeightPt: number, size: number, halfWidthPt: number][] = [
	[0.25, 1, 2.05], [0.5, 1, 2.3], [0.75, 1, 2.55], [1, 1, 2.8], [1.5, 1, 3.3], [2, 1, 3.8], [3, 1, 4.8], [4, 1, 5.8], [6, 1, 7.8],
	[0.75, 0, 2.19], [0.75, 2, 3.27], [0.75, 3, 3.99],
	[3, 0, 4.44], [3, 2, 5.52], [3, 3, 6.24],
	[0.75, 4, 4.71], [1, 4, 4.96], [3, 4, 6.96],
	[0.75, 5, 9.75], [1, 5, 10], [3, 5, 12],
	[0.75, 6, 18.75], [1, 6, 19], [3, 6, 21],
];
const PX_PER_PT = 96 / 72;

describe('arrowExtent: how big Visio draws an arrow head', () => {
	for (const [w, size, half] of MEASURED) {
		it(`line ${w} pt, size ${size}: half-width ${half} pt`, () => {
			expect(arrowExtent(w * PX_PER_PT, size)).toBeCloseTo(half * PX_PER_PT, 6);
		});
	}
	it('grows with the line weight, so a thick line gets a bigger head', () => {
		expect(arrowExtent(4, 1)).toBeGreaterThan(arrowExtent(1, 1));
	});
	it('grows with the size cell', () => {
		expect(arrowExtent(1, 3)).toBeGreaterThan(arrowExtent(1, 2));
		expect(arrowExtent(1, 2)).toBeGreaterThan(arrowExtent(1, 1));
		expect(arrowExtent(1, 1)).toBeGreaterThan(arrowExtent(1, 0));
	});
	it('treats a missing size as Visio\'s default, the middle one', () => {
		expect(arrowExtent(2, undefined)).toBe(arrowExtent(2, 2));
	});
	it('treats a size above the last one as the last one', () => {
		expect(arrowExtent(2, 9)).toBe(arrowExtent(2, 6));
	});
	it('stays finite and positive for a zero or tiny line weight', () => {
		for (const w of [0, 0.0001]) {
			const e = arrowExtent(w, 1);
			expect(Number.isFinite(e)).toBe(true);
			expect(e).toBeGreaterThan(0);
		}
	});
});

describe('arrowheadPath: the head on a line', () => {
	const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

	it('puts the tip exactly at the end point', () => {
		const n = nums(arrowheadPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 4, 1));
		expect(n.slice(0, 2)).toEqual([100, 0]);
	});
	it('is twice as long as it is wide, along the line', () => {
		const lineWeight = 4;
		const half = arrowExtent(lineWeight, 1);
		const n = nums(arrowheadPath({ x: 0, y: 0 }, { x: 100, y: 0 }, lineWeight, 1));
		const [, , x1, y1, x2, y2] = n;
		expect(100 - x1!).toBeCloseTo(2 * half, 2);
		expect(Math.abs(y1!)).toBeCloseTo(half, 2);
		expect(y1!).toBeCloseTo(-y2!, 5);
		expect(x1!).toBeCloseTo(x2!, 5);
	});
	it('points along any direction, tip at the end point', () => {
		const n = nums(arrowheadPath({ x: 0, y: 0 }, { x: 0, y: 50 }, 2, 1));
		expect(n.slice(0, 2)).toEqual([0, 50]);
		const [, , x1, y1] = n;
		expect(y1!).toBeLessThan(50);
		expect(Math.abs(x1!)).toBeGreaterThan(0);
	});
	it('is a bigger head for a thicker line', () => {
		const small = nums(arrowheadPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 1, 1));
		const big = nums(arrowheadPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 4, 1));
		expect(100 - big[2]!).toBeGreaterThan(100 - small[2]!);
	});
	it('returns nothing for a zero-length direction', () => {
		expect(arrowheadPath({ x: 5, y: 5 }, { x: 5, y: 5 }, 2, 1)).toBe('');
	});
});

describe('shortenPolyline: where a line stops so its head can sit on the end', () => {
	const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
	it('moves the start along the line by the given length, and only the start', () => {
		expect(shortenPolyline(line, 10, 0)).toEqual([{ x: 10, y: 0 }, { x: 100, y: 0 }]);
	});
	it('moves the end back along the line by the given length, and only the end', () => {
		expect(shortenPolyline(line, 0, 10)).toEqual([{ x: 0, y: 0 }, { x: 90, y: 0 }]);
	});
	it('moves both ends', () => {
		expect(shortenPolyline(line, 10, 20)).toEqual([{ x: 10, y: 0 }, { x: 80, y: 0 }]);
	});
	it('follows the direction of the first and last segment of a bent line', () => {
		const bent = [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 80, y: 50 }];
		expect(shortenPolyline(bent, 10, 10)).toEqual([{ x: 0, y: 10 }, { x: 0, y: 50 }, { x: 70, y: 50 }]);
	});
	it('works in any direction, not only along the axes', () => {
		const diag = [{ x: 0, y: 0 }, { x: 30, y: 40 }];
		const [a, b] = shortenPolyline(diag, 5, 5);
		expect(a!.x).toBeCloseTo(3, 9); expect(a!.y).toBeCloseTo(4, 9);
		expect(b!.x).toBeCloseTo(27, 9); expect(b!.y).toBeCloseTo(36, 9);
	});
	it('never takes more than half of a segment from one end, so the line cannot turn inside out', () => {
		const [a, b] = shortenPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 50, 50);
		expect(a!.x).toBeLessThanOrEqual(b!.x);
		expect(a!.x).toBeCloseTo(5, 9);
		expect(b!.x).toBeCloseTo(5, 9);
	});
	it('gives the same result whichever end is cut, so a double-headed short line is symmetric', () => {
		const [a, b] = shortenPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 30, 30);
		expect(a!.x).toBeCloseTo(5, 9);
		expect(b!.x).toBeCloseTo(5, 9);
	});
	it('returns the points unchanged for nothing to cut, and for fewer than two points', () => {
		expect(shortenPolyline(line, 0, 0)).toEqual(line);
		expect(shortenPolyline([{ x: 1, y: 1 }], 5, 5)).toEqual([{ x: 1, y: 1 }]);
	});
	it('does not divide by zero on a zero-length segment', () => {
		const same = [{ x: 3, y: 3 }, { x: 3, y: 3 }];
		expect(shortenPolyline(same, 4, 4).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
	});
	it('does not modify the array it was given', () => {
		const copy = JSON.parse(JSON.stringify(line));
		shortenPolyline(line, 10, 10);
		expect(line).toEqual(copy);
	});
});
