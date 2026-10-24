export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Converts a rectangle in viewport pixels (what `Range.getClientRects()` returns) into the coordinates of
 * an element's own box, which is how a mark inside that element is positioned. `origin` is the element's
 * on-screen box and `scale` how much larger it is drawn than its own units, so zoom is divided out.
 */
export function toLocalRect(client: Rect, origin: Rect, scale: number): Rect {
	if (!(scale > 0)) return { x: 0, y: 0, w: 0, h: 0 };
	return { x: (client.x - origin.x) / scale, y: (client.y - origin.y) / scale, w: client.w / scale, h: client.h / scale };
}

/** Drops empty rectangles; a collapsed or hidden range reports zero-sized ones. */
export function visibleRects(rects: readonly Rect[]): Rect[] {
	return rects.filter(r => r.w > 0.5 && r.h > 0.5);
}
