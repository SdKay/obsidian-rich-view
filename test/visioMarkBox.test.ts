import { describe, expect, it } from 'vitest';
import { markBox, type MarkBoxInput } from '../src/visioMarkBox';

const base: MarkBoxInput = {
	bbox: { x: 100, y: 200, width: 80, height: 40 },
	text: 'label',
	textX: 140, textY: 220, textWidth: 60, textHAlign: 'middle', textVAlign: 'middle', fontSize: 10,
};

describe('markBox: a shape whose outline has room', () => {
	it('is the outline itself, so a normal shape is marked exactly as before', () => {
		expect(markBox(base)).toEqual({ x: 100, y: 200, w: 80, h: 40 });
	});
	it('stays the outline even when the text happens to stick out a little', () => {
		expect(markBox({ ...base, textWidth: 200 })).toEqual({ x: 100, y: 200, w: 80, h: 40 });
	});
});

describe('markBox: a line with a label (the outline has no width or no height)', () => {
	const flat: MarkBoxInput = { ...base, bbox: { x: 100, y: 220, width: 234, height: 0 }, textX: 225, textY: 220, textWidth: 228 };
	const upright: MarkBoxInput = { ...base, bbox: { x: 100, y: 200, width: 0, height: 47 }, textX: 100, textY: 224, textWidth: 160 };

	it('covers the label, so a flat line gets a box as tall as its text', () => {
		const b = markBox(flat);
		expect(b.h).toBeGreaterThan(0);
		expect(b.y).toBeLessThan(220);
		expect(b.y + b.h).toBeGreaterThan(220);
	});
	it('covers the label, so an upright line gets a box as wide as its text', () => {
		const b = markBox(upright);
		expect(b.w).toBeGreaterThan(0);
		expect(b.x).toBeLessThan(100);
		expect(b.x + b.w).toBeGreaterThan(100);
	});
	it('keeps the length of the line it came from', () => {
		const b = markBox(flat);
		expect(b.x).toBeLessThanOrEqual(100);
		expect(b.x + b.w).toBeGreaterThanOrEqual(334);
		const u = markBox(upright);
		expect(u.y).toBeLessThanOrEqual(200);
		expect(u.y + u.h).toBeGreaterThanOrEqual(247);
	});
	it('is as tall as the lines of the label: two lines are twice one line', () => {
		const one = markBox(flat);
		const two = markBox({ ...flat, text: 'a\nb' });
		expect(two.h).toBeCloseTo(one.h * 2, 6);
	});
	it('centres the label box on its anchor when the text is centred', () => {
		const b = markBox({ ...upright, textHAlign: 'middle' });
		expect(b.x + b.w / 2).toBeCloseTo(upright.bbox.x, 6);
	});
	it('hangs the label box to the right of its anchor for left-aligned text, and to the left for right-aligned', () => {
		const left = markBox({ ...upright, textHAlign: 'start' });
		const right = markBox({ ...upright, textHAlign: 'end' });
		expect(left.x + left.w).toBeGreaterThan(right.x + right.w);
		expect(left.x).toBeGreaterThanOrEqual(right.x);
	});
	it('puts a top-aligned label below its anchor and a bottom-aligned one above it', () => {
		const top = markBox({ ...flat, textVAlign: 'top' });
		const bottom = markBox({ ...flat, textVAlign: 'bottom' });
		expect(top.y + top.h).toBeGreaterThan(bottom.y + bottom.h);
	});
});

describe('markBox: nothing to cover', () => {
	it('stays the outline when a flat shape has no text', () => {
		const flat = { ...base, text: '', bbox: { x: 1, y: 2, width: 30, height: 0 } };
		expect(markBox(flat)).toEqual({ x: 1, y: 2, w: 30, h: 0 });
	});
	it('does not produce NaN when the text width or font size is missing', () => {
		const b = markBox({ ...base, bbox: { x: 0, y: 0, width: 0, height: 0 }, textWidth: NaN, fontSize: NaN });
		expect(Object.values(b).every(Number.isFinite)).toBe(true);
	});
});
