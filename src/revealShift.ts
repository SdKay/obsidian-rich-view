export interface Box { x: number; y: number; w: number; h: number }
export interface Size { width: number; height: number }

/**
 * How far to slide the view so `box` (viewport pixels) is fully visible, or null when it
 * already is. A box bigger than the viewport is lined up by its start (left, top), not centred.
 * Only a pan: zoom is never touched, so a reader's chosen zoom survives a jump to a hit.
 */
export function revealShift(box: Box, viewport: Size, margin = 24): { dx: number; dy: number } | null {
	const dx = axisShift(box.x, box.w, viewport.width, margin);
	const dy = axisShift(box.y, box.h, viewport.height, margin);
	return dx === 0 && dy === 0 ? null : { dx, dy };
}

function axisShift(start: number, length: number, extent: number, margin: number): number {
	const end = start + length;
	if (start >= margin && end <= extent - margin) return 0;
	// Too big to fit: show its beginning, which is where a container's or lane's label sits, not its middle.
	if (length > extent - 2 * margin) return margin - start;
	return start < margin ? margin - start : extent - margin - end;
}

/**
 * The display offset that keeps the point under screen position `anchor` where it is while the scale goes
 * from `from` to `to`. Offsets are in screen pixels: screen = graph * scale + offset.
 */
export function offsetKeepingPoint(anchor: { x: number; y: number }, offset: { x: number; y: number }, from: number, to: number): { x: number; y: number } {
	const gx = (anchor.x - offset.x) / from;
	const gy = (anchor.y - offset.y) / from;
	return { x: anchor.x - gx * to, y: anchor.y - gy * to };
}
