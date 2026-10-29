/** One drawing step. Kept separate from the canvas so the outlines can be checked without drawing anything. */
export type PathOp =
	| { op: 'move'; x: number; y: number }
	| { op: 'line'; x: number; y: number }
	| { op: 'arc'; rx: number; ry: number; x: number; y: number; sweep: boolean }
	| { op: 'close' };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * `shape=mxgraph.infographic.ribbonSimple`: a bar with a notch cut into the left end and a point on the right.
 * Ported from draw.io's mxInfographic.js. `notch1` and `notch2` are in pixels; draw.io's editor starts them at 20.
 */
export function ribbonSimplePath(w: number, h: number, notch1: number, notch2: number): PathOp[] {
	const n1 = clamp(notch1, 0, w);
	const n2 = clamp(notch2, 0, w);
	return [
		{ op: 'move', x: 0, y: h },
		{ op: 'line', x: n1, y: h * 0.5 },
		{ op: 'line', x: 0, y: 0 },
		{ op: 'line', x: w - n2, y: 0 },
		{ op: 'line', x: w, y: h * 0.5 },
		{ op: 'line', x: w - n2, y: h },
		{ op: 'close' },
	];
}

/**
 * `shape=mxgraph.basic.diag_round_rect`: a rectangle with the top-left and bottom-right corners rounded.
 * Ported from draw.io's mxBasic.js, which doubles `dx` and keeps it within half of the shorter side.
 */
export function diagRoundRectPath(w: number, h: number, dxStyle: number): PathOp[] {
	const dx = Math.min(w * 0.5, h * 0.5, clamp(dxStyle, 0, w) * 2);
	return [
		{ op: 'move', x: dx, y: 0 },
		{ op: 'line', x: w, y: 0 },
		{ op: 'line', x: w, y: h - dx },
		{ op: 'arc', rx: dx, ry: dx, x: w - dx, y: h, sweep: true },
		{ op: 'line', x: 0, y: h },
		{ op: 'line', x: 0, y: dx },
		{ op: 'arc', rx: dx, ry: dx, x: dx, y: 0, sweep: true },
		{ op: 'close' },
	];
}
