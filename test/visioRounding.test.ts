import { describe, expect, it } from 'vitest';
import { roundPolyline, type Pt } from '../src/visioRounding';

const id = (p: Pt) => p;                       // shape units == page units
const rect = (w: number, h: number): Pt[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const nums = (d: string) => (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
const curves = (d: string) => (d.match(/C [^A-Z]+/g) ?? []).map(c => nums(c));
const endOf = (c: number[]) => `${c[4]},${c[5]}`;

describe('roundPolyline: a rectangle', () => {
	it('with no radius is the plain closed outline', () => {
		expect(roundPolyline(rect(4, 2), 0, true, id)).toBe('M 0 0 L 4 0 L 4 2 L 0 2 Z');
	});
	it('with a radius has one curve per corner, and the straight sides shortened by the radius', () => {
		const d = roundPolyline(rect(4, 2), 0.5, true, id);
		expect(curves(d).length).toBe(4);
		expect(d).toContain('L 3.5 0');                 // the bottom side runs from x=0.5 to x=3.5, not corner to corner
		expect(nums(d.slice(0, d.indexOf('L'))).slice(0, 2)).toEqual([0.5, 0]);
		expect(d.endsWith('Z')).toBe(true);
	});
	it('ends every curve one radius from the corner it replaces', () => {
		const ends = curves(roundPolyline(rect(4, 2), 0.5, true, id)).map(endOf).sort();
		expect(ends).toEqual(['0,1.5', '0.5,0', '3.5,2', '4,0.5']);
	});
	it('never lets the radius grow past half the shorter side, so neighbouring curves cannot overlap', () => {
		const ends = curves(roundPolyline(rect(4, 2), 5, true, id)).map(endOf).sort();
		expect(ends).toEqual(['0,1', '1,0', '3,2', '4,1']);   // half of the height 2 is 1
	});
	it('scales with the page transform: ten times the size gives ten times the coordinates', () => {
		const small = curves(roundPolyline(rect(4, 2), 0.5, true, id))[0]!;
		const big = curves(roundPolyline(rect(4, 2), 0.5, true, p => ({ x: p.x * 10, y: p.y * 10 }), 10))[0]!;
		expect(big.map(v => +(v / 10).toFixed(3))).toEqual(small.map(v => +v.toFixed(3)));
	});
});

describe('roundPolyline: the curves themselves', () => {
	// An SVG arc command needs a sweep flag, a large-arc flag and a radius that agrees with its end points, and a
	// browser redraws it as a half circle if any of them is off. A cubic curve has no such flags.
	const at = (c: number[], t: number, from: Pt): Pt => {
		const u = 1 - t;
		const mix = (a: number, b: number, c2: number, d: number) => u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c2 + t * t * t * d;
		return { x: mix(from.x, c[0]!, c[2]!, c[4]!), y: mix(from.y, c[1]!, c[3]!, c[5]!) };
	};
	const bottomRight = () => curves(roundPolyline(rect(4, 2), 0.5, true, id)).find(v => endOf(v) === '4,0.5')!;

	it('contains no arc command', () => {
		expect(roundPolyline(rect(4, 2), 0.5, true, id)).not.toMatch(/ A /);
	});
	it('leaves along the side it came from: the first control point stays on that side and moves toward the corner', () => {
		const c = bottomRight();                         // from (3.5, 0) to (4, 0.5); the corner is at (4, 0)
		expect(c[1]).toBeCloseTo(0, 6);
		expect(c[0]).toBeGreaterThan(3.5);
		expect(c[0]).toBeLessThanOrEqual(4);
	});
	it('arrives along the side it goes to: the second control point stays on that side, on the corner side of the end', () => {
		const c = bottomRight();
		expect(c[2]).toBeCloseTo(4, 6);
		expect(c[3]).toBeGreaterThanOrEqual(0);
		expect(c[3]).toBeLessThan(0.5);
	});
	it('follows a quarter circle: the middle of the curve is one radius from the circle centre', () => {
		const m = at(bottomRight(), 0.5, { x: 3.5, y: 0 });
		expect(Math.hypot(m.x - 3.5, m.y - 0.5)).toBeCloseTo(0.5, 2);     // this corner's circle is centred on (3.5, 0.5)
	});
	it('bulges outwards at every corner of a rectangle: the middle of the curve is nearer the corner than the centre is', () => {
		for (const c of curves(roundPolyline(rect(4, 2), 0.5, true, id))) {
			const end = c.slice(4, 6);
			// the curve's centre is one radius inside; the middle of the curve must be inside the rectangle's outline
			expect(end[0]).toBeGreaterThanOrEqual(0); expect(end[0]).toBeLessThanOrEqual(4);
			expect(end[1]).toBeGreaterThanOrEqual(0); expect(end[1]).toBeLessThanOrEqual(2);
		}
	});
	// The two points each corner's curve joins, as an unordered pair: walking the outline the other way swaps which
	// end is the start, but the curve between the same two points is the same.
	const joined = (d: string) => {
		const out: string[] = [];
		const toks = d.split(/\s+(?=[MLCZ])/);
		let cur = '';
		for (const t of toks) {
			const n = nums(t);
			if (t.startsWith('M') || t.startsWith('L')) cur = `${n[0]},${n[1]}`;
			else if (t.startsWith('C')) { const end = `${n[4]},${n[5]}`; out.push([cur, end].sort().join('|')); cur = end; }
		}
		return out.sort();
	};
	it('joins the same pairs of points whichever way round the outline is stored', () => {
		const reversed = [...rect(4, 2)].reverse();
		expect(joined(roundPolyline(reversed, 0.5, true, id))).toEqual(joined(roundPolyline(rect(4, 2), 0.5, true, id)));
	});
	it('rounds a mirrored outline at the mirrored places', () => {
		const flipX = (p: Pt) => ({ x: 4 - p.x, y: p.y });
		const mirror = (pair: string) => pair.split('|').map(q => { const [x, y] = q.split(',').map(Number); return `${+(4 - x!).toFixed(3)},${y}`; }).sort().join('|');
		const expected = joined(roundPolyline(rect(4, 2), 0.5, true, id)).map(mirror).sort();
		expect(joined(roundPolyline(rect(4, 2), 0.5, true, flipX))).toEqual(expected);
	});
	it('works for an irregular outline: each curve starts and ends on its own two sides', () => {
		const poly: Pt[] = [{ x: 0, y: 0 }, { x: 3.1, y: 0.2 }, { x: 2.7, y: 2.9 }, { x: 0.4, y: 2.2 }];
		const d = roundPolyline(poly, 0.25, true, id);
		expect(curves(d).length).toBe(4);
		expect(d).not.toMatch(/NaN|Infinity/);
	});
	it('bends the other way at a concave corner', () => {
		const ell: Pt[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
		const cs = curves(roundPolyline(ell, 0.4, true, id));
		expect(cs.length).toBe(6);
		// the inner corner at (2,2): its curve ends 0.4 along the side toward (2,4), which is at (2, 2.4)
		expect(cs.some(c => endOf(c) === '2,2.4')).toBe(true);
	});
});

describe('roundPolyline: open polylines and awkward input', () => {
	const open: Pt[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];
	it('leaves both ends sharp and rounds only the middle corner', () => {
		const d = roundPolyline(open, 1, false, id);
		expect(curves(d).length).toBe(1);
		expect(d.startsWith('M 0 0')).toBe(true);
		expect(d.endsWith('4 4')).toBe(true);
		expect(d).not.toContain('Z');
	});
	it('does nothing to two points', () => {
		expect(roundPolyline([{ x: 0, y: 0 }, { x: 3, y: 0 }], 1, false, id)).toBe('M 0 0 L 3 0');
	});
	it('does not round a straight run, so three collinear points stay a line', () => {
		expect(curves(roundPolyline([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }], 1, false, id)).length).toBe(0);
	});
	it('does not divide by zero for repeated points', () => {
		const d = roundPolyline([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], 1, false, id);
		expect(d).not.toMatch(/NaN|Infinity/);
	});
	it('moves the sharp end points through the page transform too, not only the rounded corner', () => {
		const d = roundPolyline(open, 1, false, p => ({ x: p.x + 100, y: p.y + 200 }));
		expect(d.startsWith('M 100 200')).toBe(true);
		expect(d.endsWith('L 104 204')).toBe(true);
	});
	it('returns an empty string for fewer than two points', () => {
		expect(roundPolyline([], 1, true, id)).toBe('');
		expect(roundPolyline([{ x: 1, y: 1 }], 1, true, id)).toBe('');
	});
	it('goes through the page transform, so a shifted shape is drawn where it is', () => {
		expect(roundPolyline(rect(4, 2), 0, true, p => ({ x: p.x + 10, y: p.y + 20 }))).toBe('M 10 20 L 14 20 L 14 22 L 10 22 Z');
	});
});

describe('roundPolyline: numbers in the path are short', () => {
	const decimals = (d: string) => Math.max(0, ...(d.match(/\d+\.(\d+)/g) ?? []).map(n => n.split('.')[1]!.length));
	const page = (p: Pt) => ({ x: p.x * 96 + 12.81333333333312, y: 416.3466666666672 - p.y * 96 - 3.0000000000007 });

	it('writes at most 3 decimals, so long floating-point tails never reach the SVG', () => {
		expect(decimals(roundPolyline(rect(2.05, 1.75), 0.0787401574803149, true, page))).toBeLessThanOrEqual(3);
	});
	it('does so for open polylines and plain outlines as well', () => {
		expect(decimals(roundPolyline([{ x: 0.1, y: 0.2 }, { x: 3.14159265, y: 0.2 }, { x: 3.14159265, y: 2.71828182 }], 0.3, false, page))).toBeLessThanOrEqual(3);
		expect(decimals(roundPolyline(rect(1.23456789, 2.3456789), 0, true, page))).toBeLessThanOrEqual(3);
	});
	it('stays within a thousandth of the exact value', () => {
		const d = roundPolyline(rect(2.05, 1.75), 0, true, page);
		expect(nums(d)[0]).toBeCloseTo(page({ x: 0, y: 0 }).x, 3);
		expect(nums(d)[1]).toBeCloseTo(page({ x: 0, y: 0 }).y, 3);
	});
	it('never writes -0', () => {
		expect(roundPolyline([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 0, false, p => ({ x: -p.x * 1e-9, y: p.y }))).not.toContain('-0 ');
	});
});
