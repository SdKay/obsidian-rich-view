import { describe, expect, it } from 'vitest';
import { unionBounds } from '../src/unionBounds';

describe('unionBounds: the area a set of rectangles covers', () => {
	it('is the rectangle itself for one', () => {
		expect(unionBounds([{ x: 10, y: 20, width: 30, height: 40 }])).toEqual({ x: 10, y: 20, width: 30, height: 40 });
	});
	it('covers two rectangles that do not touch, including the gap between them', () => {
		expect(unionBounds([{ x: 0, y: 0, width: 10, height: 10 }, { x: 90, y: 40, width: 10, height: 10 }])).toEqual({ x: 0, y: 0, width: 100, height: 50 });
	});
	it('is not widened by a rectangle lying inside another', () => {
		expect(unionBounds([{ x: 0, y: 0, width: 100, height: 100 }, { x: 20, y: 20, width: 10, height: 10 }])).toEqual({ x: 0, y: 0, width: 100, height: 100 });
	});
	it('handles negative coordinates', () => {
		expect(unionBounds([{ x: -50, y: -20, width: 10, height: 10 }, { x: 5, y: 5, width: 5, height: 5 }])).toEqual({ x: -50, y: -20, width: 60, height: 30 });
	});
	it('is null for nothing', () => {
		expect(unionBounds([])).toBeNull();
	});
	it('skips rectangles that are not finite numbers instead of poisoning the result', () => {
		expect(unionBounds([{ x: NaN, y: 0, width: 10, height: 10 }, { x: 1, y: 2, width: 3, height: 4 }])).toEqual({ x: 1, y: 2, width: 3, height: 4 });
		expect(unionBounds([{ x: Infinity, y: 0, width: 1, height: 1 }])).toBeNull();
	});
	it('keeps a zero-size rectangle, since a point or a straight line still takes up space', () => {
		expect(unionBounds([{ x: 5, y: 5, width: 0, height: 0 }, { x: 10, y: 10, width: 0, height: 0 }])).toEqual({ x: 5, y: 5, width: 5, height: 5 });
	});
	it('does not depend on the order of the rectangles', () => {
		const a = { x: 0, y: 0, width: 10, height: 10 }, b = { x: 50, y: 60, width: 5, height: 5 }, c = { x: -5, y: 20, width: 3, height: 3 };
		expect(unionBounds([a, b, c])).toEqual(unionBounds([c, a, b]));
	});
});

import { screenRectToGraph } from '../src/unionBounds';

describe('screenRectToGraph: a rectangle measured on screen, in diagram coordinates', () => {
	const rect = { x: 120, y: 90, width: 60, height: 30 };
	it('is unchanged at zoom 1 with no pan and the container at the origin', () => {
		expect(screenRectToGraph(rect, { originX: 0, originY: 0, scale: 1, translateX: 0, translateY: 0 })).toEqual(rect);
	});
	it('divides by the zoom, so the same screen size is a bigger area of the diagram when zoomed out', () => {
		expect(screenRectToGraph({ x: 100, y: 50, width: 40, height: 20 }, { originX: 0, originY: 0, scale: 0.5, translateX: 0, translateY: 0 }))
			.toEqual({ x: 200, y: 100, width: 80, height: 40 });
	});
	it('subtracts where the container sits on the page, because screen positions are page-relative', () => {
		expect(screenRectToGraph(rect, { originX: 20, originY: 10, scale: 1, translateX: 0, translateY: 0 })).toEqual({ x: 100, y: 80, width: 60, height: 30 });
	});
	it('subtracts the pan: the view maps a diagram point p to (p + translate) * scale', () => {
		expect(screenRectToGraph({ x: 110, y: 60, width: 10, height: 10 }, { originX: 0, originY: 0, scale: 2, translateX: 5, translateY: -10 }))
			.toEqual({ x: 50, y: 40, width: 5, height: 5 });
	});
	it('undoes exactly what the view does, for any zoom and pan', () => {
		const view = { originX: 13, originY: 7, scale: 0.37, translateX: 41, translateY: -99 };
		const graph = { x: 250, y: -80, width: 120, height: 33 };
		const onScreen = { x: (graph.x + view.translateX) * view.scale + view.originX, y: (graph.y + view.translateY) * view.scale + view.originY, width: graph.width * view.scale, height: graph.height * view.scale };
		const back = screenRectToGraph(onScreen, view);
		expect(back.x).toBeCloseTo(graph.x, 9); expect(back.y).toBeCloseTo(graph.y, 9);
		expect(back.width).toBeCloseTo(graph.width, 9); expect(back.height).toBeCloseTo(graph.height, 9);
	});
	it('does not divide by a zero zoom', () => {
		const r = screenRectToGraph(rect, { originX: 0, originY: 0, scale: 0, translateX: 0, translateY: 0 });
		expect(Object.values(r).every(Number.isFinite)).toBe(true);
	});
});
