export interface Pt { x: number; y: number }

/** A coordinate as short text: a thousandth of a pixel is far below anything visible, and long float tails only bloat the path. */
const num = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * Rounds the corners of a polyline the way Visio's `Rounding` cell does: each corner is replaced by a smooth
 * curve that is tangent to both sides and follows a circle of the given radius. The radius is cut down at a corner when either side is too
 * short to hold it (at most half of each side, so neighbouring arcs never overlap). The ends of an open
 * polyline stay sharp; every corner of a closed one, including the join, is rounded.
 *
 * The curve is a cubic Bézier, not an SVG arc: an arc needs a sweep flag, a large-arc flag and a radius that
 * agrees with its end points, and a browser quietly redraws it as a half circle when any of them is off, which
 * on a rectangle turns four corners into a bow tie. A cubic has none of those, so nothing can come out reversed.
 *
 * `toPage` converts a point from the shape's own units to page pixels; the curves are built from the converted
 * points, so scaling, flips and mirroring need no special case. Returns an SVG path.
 */
export function roundPolyline(
	points: readonly Pt[],
	radius: number,
	closed: boolean,
	toPage: (p: Pt) => Pt,
): string {
	const n = points.length;
	if (n < 2) return '';
	const first = toPage(points[0]!);
	if (!(radius > 0) || n < 3) return plain(points, closed, toPage);

	const parts: string[] = [];
	const corners = closed ? [...Array(n).keys()] : [...Array(n - 2).keys()].map(i => i + 1);
	const rounded = new Map<number, { a: Pt; b: Pt; k: number }>();
	for (const i of corners) {
		const prev = points[(i - 1 + n) % n]!, cur = points[i]!, next = points[(i + 1) % n]!;
		const corner = cornerAt(prev, cur, next, radius);
		if (corner) rounded.set(i, corner);
	}

	if (closed) {
		const start = rounded.get(0);
		const s = toPage(start ? start.b : points[0]!);
		parts.push(`M ${num(s.x)} ${num(s.y)}`);
		for (let k = 1; k <= n; k++) emitCorner(k % n);
		parts.push('Z');
	} else {
		parts.push(`M ${num(first.x)} ${num(first.y)}`);
		for (let k = 1; k < n; k++) emitCorner(k);
	}
	return parts.join(' ');

	function emitCorner(i: number): void {
		const c = rounded.get(i);
		if (!c) {
			const p = toPage(points[i]!);
			parts.push(`L ${num(p.x)} ${num(p.y)}`);
			return;
		}
		const a = toPage(c.a), b = toPage(c.b), corner = toPage(points[i]!);
		parts.push(`L ${num(a.x)} ${num(a.y)}`);
		// Control points lie on the two sides, `k` of the way from each end point toward the corner (about 0.55 for
		// a right angle), which makes the cubic follow a circle closely.
		const c1 = { x: a.x + (corner.x - a.x) * c.k, y: a.y + (corner.y - a.y) * c.k };
		const c2 = { x: b.x + (corner.x - b.x) * c.k, y: b.y + (corner.y - b.y) * c.k };
		parts.push(`C ${num(c1.x)} ${num(c1.y)} ${num(c2.x)} ${num(c2.y)} ${num(b.x)} ${num(b.y)}`);
	}
}

function plain(points: readonly Pt[], closed: boolean, toPage: (p: Pt) => Pt): string {
	const parts = points.map((p, i) => { const q = toPage(p); return `${i === 0 ? 'M' : 'L'} ${num(q.x)} ${num(q.y)}`; });
	if (closed) parts.push('Z');
	return parts.join(' ');
}

/** The two points where the curve leaves the sides at `cur`, and how far toward the corner its control points reach (0..1 of the way from each end point); null for a straight or degenerate corner. */
function cornerAt(prev: Pt, cur: Pt, next: Pt, radius: number): { a: Pt; b: Pt; k: number } | null {
	const v1 = { x: prev.x - cur.x, y: prev.y - cur.y };
	const v2 = { x: next.x - cur.x, y: next.y - cur.y };
	const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
	if (l1 < 1e-9 || l2 < 1e-9) return null;
	const u1 = { x: v1.x / l1, y: v1.y / l1 }, u2 = { x: v2.x / l2, y: v2.y / l2 };
	const cross = u1.x * u2.y - u1.y * u2.x;
	const dot = u1.x * u2.x + u1.y * u2.y;
	if (Math.abs(cross) < 1e-9) return null; // straight on (or doubling back): nothing to round
	const angle = Math.acos(Math.max(-1, Math.min(1, dot)));      // interior angle at the corner
	const tan = Math.tan(angle / 2);
	// distance from the corner to the tangent points for a circle of `radius`
	const wanted = radius / tan;
	const reach = Math.min(wanted, l1 / 2, l2 / 2);
	// The curve turns through `turn` (90° for a right angle). A cubic follows a circle through that angle best when
	// each control point is (4/3)·tan(turn/4) radii along the side from its end point.
	const turn = Math.PI - angle;
	const radiusUsed = reach * tan;
	const k = ((4 / 3) * Math.tan(turn / 4) * radiusUsed) / reach;
	return {
		a: { x: cur.x + u1.x * reach, y: cur.y + u1.y * reach },
		b: { x: cur.x + u2.x * reach, y: cur.y + u2.y * reach },
		k,
	};
}
