import { describe, expect, it } from 'vitest';
import { diagRoundRectPath, ribbonSimplePath, type PathOp } from '../src/builtinShapePaths';

const pts = (ops: PathOp[]) => ops.filter(o => o.op === 'move' || o.op === 'line').map(o => [(o as { x: number }).x, (o as { y: number }).y]);

describe('ribbonSimplePath: mxgraph.infographic.ribbonSimple', () => {
	it('is a six-point ribbon: a notch on the left and a point on the right', () => {
		const ops = ribbonSimplePath(200, 60, 20, 20);
		expect(pts(ops)).toEqual([[0, 60], [20, 30], [0, 0], [180, 0], [200, 30], [180, 60]]);
		expect(ops[0]!.op).toBe('move');
		expect(ops[ops.length - 1]!.op).toBe('close');
	});
	it('moves the notch and the point with their sizes', () => {
		expect(pts(ribbonSimplePath(200, 60, 40, 10))).toEqual([[0, 60], [40, 30], [0, 0], [190, 0], [200, 30], [190, 60]]);
	});
	it('keeps both ends inside the shape, however large the sizes are', () => {
		for (const p of pts(ribbonSimplePath(100, 40, 500, 500))) {
			expect(p[0]).toBeGreaterThanOrEqual(0);
			expect(p[0]).toBeLessThanOrEqual(100);
		}
	});
	it('treats a negative size as zero', () => {
		expect(pts(ribbonSimplePath(100, 40, -5, -5))).toEqual([[0, 40], [0, 20], [0, 0], [100, 0], [100, 20], [100, 40]]);
	});
	it('puts the tip of the point on the vertical middle', () => {
		const p = pts(ribbonSimplePath(120, 50, 10, 10));
		expect(p[1]![1]).toBe(25);
		expect(p[4]![1]).toBe(25);
	});
});

describe('diagRoundRectPath: mxgraph.basic.diag_round_rect', () => {
	it('rounds the top-left and bottom-right corners and leaves the other two square', () => {
		const ops = diagRoundRectPath(100, 60, 6);
		expect(ops[0]).toEqual({ op: 'move', x: 12, y: 0 });                 // start after the top-left corner
		expect(ops.filter(o => o.op === 'arc')).toHaveLength(2);
		const corners = pts(ops);
		expect(corners).toContainEqual([100, 0]);                              // top-right is square
		expect(corners).toContainEqual([0, 60]);                               // bottom-left is square
	});
	it('doubles the size it is given, as draw.io does', () => {
		const arc = diagRoundRectPath(100, 60, 6).find(o => o.op === 'arc') as { rx: number };
		expect(arc.rx).toBe(12);
	});
	it('ends each arc on the neighbouring side and draws them clockwise', () => {
		const arcs = diagRoundRectPath(100, 60, 6).filter(o => o.op === 'arc') as { x: number; y: number; sweep: boolean }[];
		expect(arcs[0]).toMatchObject({ x: 88, y: 60, sweep: true });          // bottom-right corner: ends at the bottom edge
		expect(arcs[1]).toMatchObject({ x: 12, y: 0, sweep: true });           // top-left corner: ends at the top edge
	});
	it('starts each arc exactly one radius away from its corner, so the rounding is a quarter circle', () => {
		const ops = diagRoundRectPath(100, 60, 6);
		const before = (i: number) => ops[i - 1] as { x: number; y: number };
		const arcs = ops.map((o, i) => [o, i] as const).filter(([o]) => o.op === 'arc');
		const [[, first], [, second]] = arcs as [[unknown, number], [unknown, number]];
		expect(before(first)).toMatchObject({ x: 100, y: 48 });   // 12 above the bottom-right corner
		expect(before(second)).toMatchObject({ x: 0, y: 12 });    // 12 below the top-left corner
	});
	it('never rounds past half of the shorter side', () => {
		const arc = diagRoundRectPath(100, 40, 50).find(o => o.op === 'arc') as { rx: number };
		expect(arc.rx).toBe(20);
	});
	it('is a plain rectangle when the size is zero', () => {
		const ops = diagRoundRectPath(100, 60, 0);
		expect(pts(ops)).toContainEqual([100, 0]);
		expect(ops.filter(o => o.op === 'arc').every(o => (o as { rx: number }).rx === 0)).toBe(true);
	});
	it('ignores a negative size', () => {
		expect((diagRoundRectPath(100, 60, -9).find(o => o.op === 'arc') as { rx: number }).rx).toBe(0);
	});
	it('closes the outline', () => {
		const ops = diagRoundRectPath(100, 60, 6);
		expect(ops[ops.length - 1]!.op).toBe('close');
	});
});
