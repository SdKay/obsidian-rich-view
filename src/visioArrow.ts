const PT_PER_PX = 72 / 96;

/** Size cell → extra half-width in pt, on top of the line weight. Measured from Visio's own SVG export (filled triangle, style 4). */
const STEP_PT = [1.44, 1.8, 2.52, 3.24, 3.96, 9, 18];

/**
 * Half-width of an arrow head in px, for a line of `lineWeightPx` and Visio's arrow size cell (0..6): the line
 * weight plus a step per size. A missing size cell is Visio's default, 2; a size above 6 is treated as 6.
 */
export function arrowExtent(lineWeightPx: number, size: number | undefined): number {
	const level = size === undefined || !Number.isFinite(size) ? 2 : Math.min(6, Math.max(0, Math.round(size)));
	const weightPt = Math.max(0, lineWeightPx) * PT_PER_PX;
	return (weightPt + STEP_PT[level]!) / PT_PER_PX;
}

/**
 * A filled triangle with its tip at `to`, pointing along `from`→`to`. It is twice as long as it is wide, and its
 * size follows the line weight and the size cell, as Visio draws it. Empty for a zero-length direction.
 */
export function arrowheadPath(
	from: { x: number; y: number },
	to: { x: number; y: number },
	lineWeightPx: number,
	size: number | undefined,
): string {
	const dx = to.x - from.x, dy = to.y - from.y;
	const len = Math.hypot(dx, dy);
	if (len < 1e-6) return '';
	const half = arrowExtent(lineWeightPx, size);
	const ux = dx / len, uy = dy / len;
	const px = -uy, py = ux;
	const baseX = to.x - ux * 2 * half, baseY = to.y - uy * 2 * half;
	const num = (n: number) => String(Math.round(n * 1000) / 1000);
	return `M ${num(to.x)} ${num(to.y)} L ${num(baseX + px * half)} ${num(baseY + py * half)} L ${num(baseX - px * half)} ${num(baseY - py * half)} Z`;
}

/**
 * The points of a line with `startBy` taken off its start and `endBy` off its end, along the first and last
 * segment. Visio ends a line where its head begins, so the square end of a thick line does not stick out beside
 * the tip. At most half of a segment is taken from either end.
 */
export function shortenPolyline(
	points: readonly { x: number; y: number }[],
	startBy: number,
	endBy: number,
): { x: number; y: number }[] {
	const out = points.map(p => ({ x: p.x, y: p.y }));
	if (out.length < 2) return out;
	// Both ends are measured on the original segments, so the result does not depend on which end is moved first.
	const moved = (from: number, toward: number, by: number) => {
		const a = points[from]!, b = points[toward]!;
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		if (len < 1e-9 || by <= 0) return { x: a.x, y: a.y };
		const t = Math.min(by, len / 2) / len;
		return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
	};
	const last = out.length - 1;
	out[0] = moved(0, 1, startBy);
	out[last] = moved(last, last - 1, endBy);
	return out;
}
