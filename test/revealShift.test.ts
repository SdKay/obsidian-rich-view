import { describe, expect, it } from 'vitest';
import { offsetKeepingPoint, revealShift } from '../src/revealShift';

const view = { width: 800, height: 600 };

describe('revealShift', () => {
	it('does nothing for a box already well inside the viewport', () => {
		expect(revealShift({ x: 100, y: 100, w: 50, h: 30 }, view)).toBeNull();
	});
	it('does nothing for a box exactly at the margin edges', () => {
		expect(revealShift({ x: 24, y: 24, w: 752, h: 552 }, view)).toBeNull();
	});
	it('slides right/down for a box off the left/top, by just enough to clear the margin', () => {
		expect(revealShift({ x: -100, y: -50, w: 40, h: 20 }, view)).toEqual({ dx: 124, dy: 74 });
	});
	it('slides left/up for a box off the right/bottom, by just enough to clear the margin', () => {
		expect(revealShift({ x: 900, y: 700, w: 40, h: 20 }, view)).toEqual({ dx: -164, dy: -144 });
	});
	it('moves only the axis that needs it', () => {
		expect(revealShift({ x: 100, y: 900, w: 40, h: 20 }, view)).toEqual({ dx: 0, dy: -344 });
		expect(revealShift({ x: 1000, y: 100, w: 40, h: 20 }, view)).toEqual({ dx: -264, dy: 0 });
	});
	it('shows the start (left, top) of a box that is larger than the viewport, where a label usually is', () => {
		// wider than the viewport: the left edge goes to the margin, so its beginning is what the reader sees
		const wide = revealShift({ x: 500, y: 100, w: 1000, h: 100 }, view)!;
		expect(500 + wide.dx).toBe(24);
		expect(wide.dy).toBe(0);
		// taller than the viewport: the top edge goes to the margin
		const tall = revealShift({ x: 100, y: 800, w: 100, h: 2000 }, view)!;
		expect(800 + tall.dy).toBe(24);
		expect(tall.dx).toBe(0);
	});
	it('also pulls an oversized box back when it starts above or left of the viewport', () => {
		const s = revealShift({ x: -900, y: -1500, w: 1200, h: 2000 }, view)!;
		expect(-900 + s.dx).toBe(24);
		expect(-1500 + s.dy).toBe(24);
	});
	it('leaves an oversized box whose start is already at the margin where it is', () => {
		expect(revealShift({ x: 24, y: 24, w: 5000, h: 5000 }, view)).toBeNull();
	});
	it('a box inside the edge margin band still gets pulled in, so it is not hidden under the border', () => {
		expect(revealShift({ x: 10, y: 100, w: 50, h: 20 }, view)).toEqual({ dx: 14, dy: 0 });
		expect(revealShift({ x: 100, y: 10, w: 50, h: 20 }, view)).toEqual({ dx: 0, dy: 14 });
		expect(revealShift({ x: 750, y: 100, w: 40, h: 20 }, view)).toEqual({ dx: -14, dy: 0 });
		expect(revealShift({ x: 100, y: 570, w: 40, h: 20 }, view)).toEqual({ dx: 0, dy: -14 });
	});
	it('a box partly visible still counts as needing a move', () => {
		expect(revealShift({ x: 780, y: 100, w: 100, h: 20 }, view)).toEqual({ dx: -104, dy: 0 });
	});
	it('after applying the shift the box is inside the margins', () => {
		for (const box of [{ x: -300, y: 40, w: 60, h: 60 }, { x: 790, y: 590, w: 30, h: 30 }, { x: 300, y: -400, w: 10, h: 10 }]) {
			const s = revealShift(box, view)!;
			expect(box.x + s.dx).toBeGreaterThanOrEqual(24);
			expect(box.x + s.dx + box.w).toBeLessThanOrEqual(800 - 24);
			expect(box.y + s.dy).toBeGreaterThanOrEqual(24);
			expect(box.y + s.dy + box.h).toBeLessThanOrEqual(600 - 24);
		}
	});
});

describe('offsetKeepingPoint', () => {
	const screenOf = (g: { x: number; y: number }, scale: number, off: { x: number; y: number }) => ({ x: g.x * scale + off.x, y: g.y * scale + off.y });

	it('keeps the chosen screen point on the same graph point after the zoom changes', () => {
		const anchor = { x: 300, y: 200 };
		const off = { x: 40, y: -30 };
		const g = { x: (anchor.x - off.x) / 0.5, y: (anchor.y - off.y) / 0.5 };
		for (const to of [0.25, 1, 2, 4]) {
			const next = offsetKeepingPoint(anchor, off, 0.5, to);
			const s = screenOf(g, to, next);
			expect(s.x).toBeCloseTo(anchor.x, 9);
			expect(s.y).toBeCloseTo(anchor.y, 9);
		}
	});
	it('does not move the offset when the scale does not change', () => {
		expect(offsetKeepingPoint({ x: 10, y: 20 }, { x: 5, y: 6 }, 1, 1)).toEqual({ x: 5, y: 6 });
	});
	it('zooming about the origin only scales the offset', () => {
		expect(offsetKeepingPoint({ x: 0, y: 0 }, { x: 10, y: 20 }, 1, 2)).toEqual({ x: 20, y: 40 });
	});
	it('is its own inverse: zooming in and back out returns the original offset', () => {
		const a = { x: 123, y: 77 }; const off = { x: -15, y: 60 };
		const there = offsetKeepingPoint(a, off, 0.4, 1.7);
		const back = offsetKeepingPoint(a, there, 1.7, 0.4);
		expect(back.x).toBeCloseTo(off.x, 9);
		expect(back.y).toBeCloseTo(off.y, 9);
	});
});
