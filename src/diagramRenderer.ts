export interface BoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A hit-tested shape: id/link plus panEl-relative pixel bounds. */
export interface ShapeHit {
	id: string;
	link: string | null;
	bounds: { x: number; y: number; w: number; h: number };
}

/**
 * Format-agnostic contract viewer.ts depends on instead of a concrete
 * renderer class — the seam for adding renderers for other diagram formats
 * (e.g. Visio) later without touching the viewer's HUD / pan-zoom /
 * magnifier chrome, which only ever talks to a diagram through this
 * interface. `GraphRenderer` (drawio/@maxgraph) is the only implementation
 * today.
 *
 * Coordinate conventions:
 *   - "graph coords": raw units as stored in the source file
 *   - "display offset": screen-pixel equivalent = graph-translate * scale
 */
export interface DiagramRenderer {
	/** Load (or replace) the diagram content; returns its bounding box. */
	load(content: string): BoundingBox;
	/**
	 * Like load(), but restores the current pan/zoom afterwards — used for
	 * soft-reloads (external file edits) where the user's view must survive
	 * the reimport.
	 */
	loadPreserveView(content: string): BoundingBox;
	/** Auto-fit the diagram to fill cw×ch pixels, centred with padding. */
	autoFit(cw: number, ch: number, bbox: BoundingBox): void;
	/** Centre the diagram in cw×ch at a fixed zoom level (no scaling to fit). */
	centerAtZoom(zoomPct: number, cw: number, ch: number, bbox: BoundingBox): void;
	/**
	 * Set view from user-visible values (zoom %, screen-pixel offsets).
	 * displayX/Y = translate * scale (same units as the code block's saved offset).
	 */
	setViewFromDisplay(zoomPct: number, displayX: number, displayY: number): void;
	/** Current scale (1.0 = 100%). */
	getScale(): number;
	/** Current translate expressed as screen-pixel offset. */
	getDisplayOffset(): { x: number; y: number };
	/** Call `callback` whenever the view scale or translate changes. */
	onViewChange(callback: () => void): void;
	/**
	 * Return the shape (id/link/bounds) at panEl-relative pixel coordinates,
	 * for hover highlighting — any non-layer shape, not just linked ones.
	 */
	getShapeAt(px: number, py: number): ShapeHit | null;
	/** Return the link href for the shape at panEl-relative coordinates, or null. */
	getLinkAt(px: number, py: number): string | null;
	destroy(): void;
}
