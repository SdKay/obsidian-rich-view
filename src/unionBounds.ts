export interface Rect { x: number; y: number; width: number; height: number }

/** The smallest rectangle covering all of `rects`; null when there is none. Rectangles with a non-finite value are skipped. */
export function unionBounds(rects: readonly Rect[]): Rect | null {
	let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
	for (const r of rects) {
		if (![r.x, r.y, r.width, r.height].every(Number.isFinite)) continue;
		left = Math.min(left, r.x);
		top = Math.min(top, r.y);
		right = Math.max(right, r.x + r.width);
		bottom = Math.max(bottom, r.y + r.height);
	}
	return left === Infinity ? null : { x: left, y: top, width: right - left, height: bottom - top };
}

export interface ViewTransform {
	/** Where the diagram container sits on the page, in the same pixels as the measured rectangle. */
	originX: number;
	originY: number;
	scale: number;
	translateX: number;
	translateY: number;
}

/** A rectangle measured on screen, in diagram coordinates. The view maps a diagram point p to (p + translate) * scale + origin. */
export function screenRectToGraph(r: Rect, view: ViewTransform): Rect {
	const s = view.scale > 0 ? view.scale : 1;
	return {
		x: (r.x - view.originX) / s - view.translateX,
		y: (r.y - view.originY) / s - view.translateY,
		width: r.width / s,
		height: r.height / s,
	};
}
