import { describe, expect, it } from 'vitest';
import type { VisioPage, VisioShape } from '../src/visioParser';
import { VisioRenderer } from '../src/visioRenderer';

const shape = (id: string, x: number, y: number, w: number, h: number): VisioShape => ({
	id, subpaths: [], fillPattern: 1, linePattern: 1, strokeWidth: 1, text: '', textX: x, textY: y, textHAlign: 'middle', textVAlign: 'middle', textWidth: w, fontSize: 12,
	bbox: { x, y, width: w, height: h },
});

function renderer(shapes: VisioShape[]): VisioRenderer {
	(globalThis as { createEl?: unknown }).createEl = (tag: string) => document.createElement(tag);
	const container = document.createElement('div') as HTMLElement & { empty: () => void };
	container.empty = () => { container.replaceChildren(); };
	const r = new VisioRenderer(container);
	const page: VisioPage = { id: '0', name: 'P', width: 1000, height: 800, shapes };
	r.load(JSON.stringify(page));
	return r;
}

describe('VisioRenderer.getShapeBounds', () => {
	it('returns the shape box in the same coordinates getShapeAt reports for it', () => {
		const r = renderer([shape('a', 10, 20, 100, 50), shape('b', 300, 300, 40, 40)]);
		r.setViewFromDisplay(200, 30, 40); // scale 2, translate (15, 20)
		const bounds = r.getShapeBounds('a');
		expect(bounds).toEqual({ x: 50, y: 80, w: 200, h: 100 });
		const hit = r.getShapeAt(60, 90);
		expect(hit?.id).toBe('a');
		expect(hit?.bounds).toEqual(bounds);
	});

	it('follows pan and zoom', () => {
		const r = renderer([shape('a', 10, 20, 100, 50)]);
		r.setViewFromDisplay(100, 0, 0);
		expect(r.getShapeBounds('a')).toEqual({ x: 10, y: 20, w: 100, h: 50 });
		r.setViewFromDisplay(50, 100, 0); // scale 0.5, translate (200, 0)
		expect(r.getShapeBounds('a')).toEqual({ x: 105, y: 10, w: 50, h: 25 });
	});

	it('returns null for an id that is not on the page', () => {
		const r = renderer([shape('a', 0, 0, 10, 10)]);
		expect(r.getShapeBounds('missing')).toBeNull();
		expect(r.getShapeBounds('')).toBeNull();
	});

	it('finds the right one among several, by id and not by order', () => {
		const r = renderer([shape('x', 0, 0, 10, 10), shape('y', 500, 500, 20, 20)]);
		r.setViewFromDisplay(100, 0, 0);
		expect(r.getShapeBounds('y')).toEqual({ x: 500, y: 500, w: 20, h: 20 });
	});

	it('is null after destroy', () => {
		const r = renderer([shape('a', 0, 0, 10, 10)]);
		r.destroy();
		expect(r.getShapeBounds('a')).toBeNull();
	});

	describe('a line that carries a label', () => {
		// A connector's outline has no height (or no width), so its bounds alone would be an invisible mark.
		const label = (): VisioShape => ({ ...shape('c', 100, 300, 234, 0), text: 'Linux/Rtos Standard API', textX: 217, textY: 300, textWidth: 228 });

		it('is as tall as its text, and still as long as the line', () => {
			const r = renderer([label()]);
			r.setViewFromDisplay(100, 0, 0);
			const b = r.getShapeBounds('c')!;
			expect(b.h).toBeGreaterThan(0);
			expect(b.x).toBeLessThanOrEqual(100);
			expect(b.x + b.w).toBeGreaterThanOrEqual(334);
		});
		it('scales with the zoom like any other shape', () => {
			const r = renderer([label()]);
			r.setViewFromDisplay(100, 0, 0);
			const one = r.getShapeBounds('c')!;
			r.setViewFromDisplay(200, 0, 0);
			const two = r.getShapeBounds('c')!;
			expect(two.h).toBeCloseTo(one.h * 2, 6);
			expect(two.w).toBeCloseTo(one.w * 2, 6);
		});
	});
});

describe('VisioRenderer leaves what other components put in its container alone', () => {
	function container() {
		(globalThis as { createEl?: unknown }).createEl = (tag: string) => document.createElement(tag);
		const c = document.createElement('div') as HTMLElement & { empty: () => void };
		c.empty = () => { c.replaceChildren(); };
		return c;
	}
	const page = JSON.stringify({ id: '0', name: 'P', width: 1000, height: 800, shapes: [shape('a', 0, 0, 10, 10)] });

	it('keeps a sibling element across load, so a search or hover layer survives a page change', () => {
		const c = container();
		const layer = document.createElement('div');
		c.appendChild(layer);
		const r = new VisioRenderer(c);
		r.load(page);
		r.load(page);
		expect(c.contains(layer)).toBe(true);
	});
	it('still replaces its own drawing on every load: one svg, not one per load', () => {
		const c = container();
		const r = new VisioRenderer(c);
		r.load(page);
		r.load(page);
		r.load(page);
		expect(c.querySelectorAll('svg').length).toBe(1);
	});
	it('destroy removes its drawing and leaves the sibling', () => {
		const c = container();
		const layer = document.createElement('div');
		c.appendChild(layer);
		const r = new VisioRenderer(c);
		r.load(page);
		r.destroy();
		expect(c.querySelectorAll('svg').length).toBe(0);
		expect(c.contains(layer)).toBe(true);
	});
});

describe('VisioRenderer.getShapeFontSize', () => {
	const sized = (id: string, fontSize: number): VisioShape => ({ ...shape(id, 0, 0, 10, 10), fontSize });
	it('returns the shape font size in page pixels, whatever the current zoom', () => {
		const r = renderer([sized('a', 14), sized('b', 20)]);
		r.setViewFromDisplay(300, 0, 0);
		expect(r.getShapeFontSize('a')).toBe(14);
		expect(r.getShapeFontSize('b')).toBe(20);
	});
	it('is null for an id that is not on the page and for a shape without a usable size', () => {
		const r = renderer([sized('a', 0)]);
		expect(r.getShapeFontSize('missing')).toBeNull();
		expect(r.getShapeFontSize('a')).toBeNull();
	});
});
