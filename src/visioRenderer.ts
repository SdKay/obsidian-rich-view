import type { BoundingBox, DrawingRenderer, ShapeHit } from './drawingRenderer';
import type { VisioPage, VisioShape } from './visioParser';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface HatchVariant {
	size: number;
	transform?: string;
	lines: { x1: number; y1: number; x2: number; y2: number }[];
	strokeWidth: number;
	opacity: number;
}

/**
 * Generic stand-ins for Visio's ~40-entry FillPattern texture catalog (2 =
 * light dither, up through various hatch/crosshatch densities and angles) —
 * matching that catalog tile-for-tile isn't attempted; these just need to
 * look visibly *different from each other* so a diagram that uses distinct
 * pattern indices to distinguish categories of shape still reads as
 * distinct in this renderer, not simply reduced to "textured vs. solid".
 *
 * Tile size is generous on purpose (legend swatches in real diagrams are
 * often tiny — found one ~57×18px, raw content units, before any auto-fit
 * shrinking — and a fine-grained tile all but disappears once the whole
 * page is fit into a small viewer). But the *stroke*, tried first at the
 * same generous scale as the tile, was reported as covering shape text
 * entirely once actually visible — so stroke stays thin and low-opacity
 * regardless of tile size: a light, sparse texture that survives
 * minification via the tile, not via thick/opaque lines.
 */
const HATCH_VARIANTS: HatchVariant[] = [
	{ size: 12, transform: 'rotate(45)', lines: [{ x1: 0, y1: 0, x2: 0, y2: 12 }], strokeWidth: 1, opacity: 0.55 },
	{ size: 12, transform: 'rotate(-45)', lines: [{ x1: 0, y1: 0, x2: 0, y2: 12 }], strokeWidth: 1, opacity: 0.55 },
	// Bottom-left-to-top-right diagonal ((0,size)→(size,0) — SVG Y grows
	// downward, so that's literally the tile's bottom-left to top-right
	// corner) — explicit coordinates rather than a patternTransform rotate,
	// so the direction is exactly what's specified with no rotation-sense
	// ambiguity to double-check. Smaller tile than the others here (denser).
	{ size: 7, lines: [{ x1: 0, y1: 7, x2: 7, y2: 0 }], strokeWidth: 1, opacity: 0.55 },
	{ size: 10, lines: [{ x1: 5, y1: 0, x2: 5, y2: 10 }], strokeWidth: 1, opacity: 0.55 },
	{ size: 12, lines: [{ x1: 0, y1: 0, x2: 12, y2: 12 }, { x1: 12, y1: 0, x2: 0, y2: 12 }], strokeWidth: 1, opacity: 0.45 },
	{ size: 8, transform: 'rotate(45)', lines: [{ x1: 0, y1: 0, x2: 0, y2: 8 }], strokeWidth: 1, opacity: 0.55 },
];

/** Stable, deterministic mapping from a raw FillPattern index (>= 2) to one of the generic hatch variants above. */
function hatchVariantIndex(fillPattern: number): number {
	return fillPattern % HATCH_VARIANTS.length;
}

/**
 * Generic stand-ins for Visio's LinePattern dash/dot catalog (same "don't
 * match the exact catalog entry" approach as HATCH_VARIANTS/arrowheadPath).
 * Expressed as multiples of the shape's own strokeWidth so dash length
 * scales with line thickness the way a real dashed stroke would, rather
 * than a fixed px pattern that looks disproportionate on a thick line.
 */
const DASH_VARIANTS: number[][] = [
	[4, 3],       // dashed
	[1, 2],       // dotted
	[5, 2, 1, 2], // dash-dot
];

/** Stable, deterministic mapping from a raw LinePattern index (>= 2) to one of the dash variants above, scaled by strokeWidth. */
function lineDasharray(linePattern: number, strokeWidth: number): string | null {
	if (linePattern < 2) return null;
	const variant = DASH_VARIANTS[linePattern % DASH_VARIANTS.length]!;
	return variant.map(v => v * strokeWidth).join(' ');
}

function hatchPatternId(index: number): string {
	return `dv-visio-hatch-${index}`;
}

/**
 * One `<pattern>` per distinct (hatch variant, fill color) pair actually in
 * use. `entries` is built by the caller (buildSvg) — each `{ variantIdx,
 * color }` becomes one `<pattern id="dv-visio-hatch-<its index in this
 * array>">`, referenced back by that same index.
 *
 * Deliberately generates one `<pattern>` per color rather than one shared,
 * `currentColor`-tinted def per variant (which would need far fewer
 * elements) — tried the shared/tinted approach first and it rendered as an
 * empty/white fill in Obsidian's real Chromium instead of a tinted hatch.
 * `currentColor` inside `<pattern>` content is only reliably documented to
 * resolve for `<marker>` referrers, not `<pattern>` — evidently it doesn't
 * reach back to the referencing element's `color` here, so each pattern
 * instead gets its own literal, explicit `stroke` color. More `<pattern>`
 * elements, but guaranteed to render instead of resting on unspecified
 * cross-reference behavior (this is the second time in this file alone that
 * a plausible-sounding SVG cross-reference trick didn't hold up under real
 * rendering — see also the `dominant-baseline` finding elsewhere).
 */
function buildHatchDefs(doc: Document, entries: { variantIdx: number; color: string }[]): SVGDefsElement {
	const defs = doc.createElementNS(SVG_NS, 'defs');
	entries.forEach(({ variantIdx, color }, index) => {
		const variant = HATCH_VARIANTS[variantIdx]!;
		const pattern = doc.createElementNS(SVG_NS, 'pattern');
		pattern.setAttribute('id', hatchPatternId(index));
		pattern.setAttribute('width', String(variant.size));
		pattern.setAttribute('height', String(variant.size));
		pattern.setAttribute('patternUnits', 'userSpaceOnUse');
		if (variant.transform) pattern.setAttribute('patternTransform', variant.transform);
		for (const l of variant.lines) {
			const line = doc.createElementNS(SVG_NS, 'line');
			line.setAttribute('x1', String(l.x1));
			line.setAttribute('y1', String(l.y1));
			line.setAttribute('x2', String(l.x2));
			line.setAttribute('y2', String(l.y2));
			line.setAttribute('stroke', color);
			line.setAttribute('stroke-width', String(variant.strokeWidth));
			line.setAttribute('stroke-opacity', String(variant.opacity));
			pattern.appendChild(line);
		}
		defs.appendChild(pattern);
	});
	return defs;
}

/**
 * Empirical baseline offset (fraction of font-size) that puts a line's
 * vertical center at the given `y`, without relying on SVG's
 * `dominant-baseline` — that property is inconsistent across mixed CJK/Latin
 * content (this plugin's diagrams have both), so lines are positioned with
 * plain per-tspan `y` values instead.
 */
const BASELINE_CENTER_OFFSET = 0.32;

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Lazily created, reused canvas 2D context for text-width measurement. `null` (not re-attempted) if canvas 2D is unavailable (e.g. under jsdom in tests) — callers must treat that as "can't measure" and skip wrapping. */
function getMeasureContext(): CanvasRenderingContext2D | null {
	if (measureCtx === undefined) {
		measureCtx = activeDocument.createElement('canvas').getContext('2d');
	}
	return measureCtx;
}

/**
 * Wraps `line` to fit `maxWidth` px, the way Visio's own text box does at
 * author time (Visio doesn't store the resulting breaks — the source XML
 * still has one long string, e.g. "SPI/SDIO/USB/UART..Interface" with no
 * spaces at all, so this has to reproduce the wrap here). Breaks after any
 * run of whitespace *or* a `/` — plain word-wrap alone would never break a
 * slash-separated label like that example, which has no spaces to wrap on.
 * Returns `[line]` unchanged if `maxWidth`/measurement isn't usable, or if
 * a single unbreakable unit already exceeds it (better to overflow than to
 * cut mid-word).
 */
/** Splits `line` right after each `/` or whitespace char, keeping the separator attached to the preceding unit (no lookbehind — iOS < 16.4 doesn't support it, see the obsidianmd/regex-lookbehind lint rule). */
function splitIntoUnits(line: string): string[] {
	const units: string[] = [];
	let current = '';
	for (const ch of line) {
		current += ch;
		if (ch === '/' || /\s/.test(ch)) {
			units.push(current);
			current = '';
		}
	}
	if (current) units.push(current);
	return units;
}

function wrapLine(line: string, maxWidth: number, fontSize: number): string[] {
	const ctx = getMeasureContext();
	if (!ctx || maxWidth <= 0 || !line) return [line];
	ctx.font = `${fontSize}px sans-serif`;
	const units = splitIntoUnits(line);
	const wrapped: string[] = [];
	let current = '';
	for (const unit of units) {
		const candidate = current + unit;
		if (current && ctx.measureText(candidate).width > maxWidth) {
			wrapped.push(current.trimEnd());
			current = unit;
		} else {
			current = candidate;
		}
	}
	if (current) wrapped.push(current.trimEnd());
	return wrapped.length > 0 ? wrapped : [line];
}

/**
 * Renders a `VisioPage` (already fully resolved to page px-space by
 * visioParser.ts — no ShapeSheet knowledge here) as plain SVG.
 * Implements DrawingRenderer — see that file for the coordinate conventions
 * ("graph coords" vs "display offset") shared across renderer backends.
 *
 * `load()`'s `content` parameter is a JSON-serialized `VisioPage`, not XML —
 * the shared interface is string-typed (mirroring draw.io's XML), and this
 * is the simplest way to satisfy that contract without widening it for a
 * second renderer. Own scale/translate are baked into the content `<g>`'s
 * transform, the same way GraphRenderer bakes @maxgraph's view transform
 * into its SVG — "graph coords" here are the page-px coordinates
 * visioParser.ts already computed; "display offset" = translate * scale.
 */
export class VisioRenderer implements DrawingRenderer {
	private readonly container: HTMLElement;
	private svgEl: SVGSVGElement | null = null;
	private groupEl: SVGGElement | null = null;
	private shapes: VisioShape[] = [];
	private pageWidth = 0;
	private pageHeight = 0;
	private scale = 1;
	private tx = 0;
	private ty = 0;
	private viewChangeCb: (() => void) | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	load(content: string): BoundingBox {
		const page = JSON.parse(content) as VisioPage;
		this.shapes = page.shapes;
		this.pageWidth = page.width;
		this.pageHeight = page.height;
		this.buildSvg();
		return this.computeBounds();
	}

	/** Like load(), but restores the current pan/zoom afterwards (soft-reload). */
	loadPreserveView(content: string): BoundingBox {
		const scale = this.getScale();
		const offset = this.getDisplayOffset();
		const bbox = this.load(content);
		this.setViewFromDisplay(scale * 100, offset.x, offset.y);
		return bbox;
	}

	autoFit(cw: number, ch: number, bbox: BoundingBox): void {
		if (bbox.width <= 0 || bbox.height <= 0) return;
		const pad = 20;
		const scale = Math.min((cw - pad * 2) / bbox.width, (ch - pad * 2) / bbox.height, 2);
		this.scale = scale;
		this.tx = cw / (2 * scale) - (bbox.x + bbox.width / 2);
		this.ty = ch / (2 * scale) - (bbox.y + bbox.height / 2);
		this.applyTransform();
	}

	centerAtZoom(zoomPct: number, cw: number, ch: number, bbox: BoundingBox): void {
		const scale = zoomPct / 100;
		this.scale = scale;
		this.tx = cw / (2 * scale) - (bbox.x + bbox.width / 2);
		this.ty = ch / (2 * scale) - (bbox.y + bbox.height / 2);
		this.applyTransform();
	}

	setViewFromDisplay(zoomPct: number, displayX: number, displayY: number): void {
		const scale = zoomPct / 100;
		this.scale = scale;
		this.tx = displayX / scale;
		this.ty = displayY / scale;
		this.applyTransform();
	}

	getScale(): number {
		return this.scale;
	}

	getDisplayOffset(): { x: number; y: number } {
		return { x: this.tx * this.scale, y: this.ty * this.scale };
	}

	onViewChange(callback: () => void): void {
		this.viewChangeCb = callback;
	}

	/**
	 * `px`/`py` arrive in the same post-committed-transform screen space the
	 * content is actually rendered in (viewer.ts already divides out the
	 * uncommitted visual gesture layer before calling this) — so each shape's
	 * raw bbox is transformed by our own scale/translate here to match.
	 * Rectangle-in-bbox hit-testing, not true path containment — an
	 * intentional approximation, consistent with the rest of the v1 Visio
	 * pipeline; good enough for hover highlighting.
	 */
	getShapeAt(px: number, py: number): ShapeHit | null {
		for (let i = this.shapes.length - 1; i >= 0; i--) {
			const s = this.shapes[i]!;
			const x = (s.bbox.x + this.tx) * this.scale;
			const y = (s.bbox.y + this.ty) * this.scale;
			const w = s.bbox.width * this.scale;
			const h = s.bbox.height * this.scale;
			if (px >= x && px <= x + w && py >= y && py <= y + h) {
				return { id: s.id, link: null, bounds: { x, y, w, h } };
			}
		}
		return null;
	}

	/** Visio shape-level hyperlinks aren't parsed yet (see visioParser.ts scope notes) — no links to follow. */
	getLinkAt(_px: number, _py: number): string | null {
		return null;
	}

	destroy(): void {
		this.container.empty();
		this.svgEl = null;
		this.groupEl = null;
	}

	private buildSvg(): void {
		this.container.empty();
		const doc = this.container.ownerDocument;
		const svg = doc.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('width', '100%');
		svg.setAttribute('height', '100%');
		svg.classList.add('drawing-view-visio-svg');

		// Visio's FillPattern is one of ~40 textured tiles (hatching, dots, ...),
		// not just solid — matching that whole catalog isn't attempted (same
		// "approximate the category" call as arrowheads/EllipticalArcTo
		// elsewhere in this pipeline); any pattern >= 2 maps to one of a
		// handful of generic hatch variants (hatchVariantIndex) so diagrams
		// that use different pattern indices to distinguish categories of
		// shape still look distinct here, not all reduced to one texture.
		// One <pattern> def per distinct (variant, color) pair actually in use.
		const patternKeyToIndex = new Map<string, number>();
		const patternEntries: { variantIdx: number; color: string }[] = [];
		for (const shape of this.shapes) {
			if (shape.fillPattern < 2) continue;
			const variantIdx = hatchVariantIndex(shape.fillPattern);
			for (const subpath of shape.subpaths) {
				if (!subpath.fill) continue;
				const key = `${variantIdx}|${subpath.fill}`;
				if (!patternKeyToIndex.has(key)) {
					patternKeyToIndex.set(key, patternEntries.length);
					patternEntries.push({ variantIdx, color: subpath.fill });
				}
			}
		}
		svg.appendChild(buildHatchDefs(doc, patternEntries));

		const group = doc.createElementNS(SVG_NS, 'g');
		group.classList.add('drawing-view-visio-content');

		for (const shape of this.shapes) {
			const variantIdx = shape.fillPattern >= 2 ? hatchVariantIndex(shape.fillPattern) : -1;
			for (const subpath of shape.subpaths) {
				const path = doc.createElementNS(SVG_NS, 'path');
				path.setAttribute('d', subpath.d);
				if (subpath.fill && variantIdx >= 0) {
					const patternIdx = patternKeyToIndex.get(`${variantIdx}|${subpath.fill}`)!;
					path.setAttribute('fill', `url(#${hatchPatternId(patternIdx)})`);
				} else {
					path.setAttribute('fill', subpath.fill || 'none');
				}
				path.setAttribute('stroke', subpath.stroke || 'none');
				path.setAttribute('stroke-width', String(shape.strokeWidth || 1));
				if (subpath.stroke) {
					const dasharray = lineDasharray(shape.linePattern, shape.strokeWidth || 1);
					if (dasharray) path.setAttribute('stroke-dasharray', dasharray);
				}
				group.appendChild(path);
			}

			if (shape.text) {
				const fontSize = shape.fontSize || 12;
				// SVG <text> doesn't break lines on '\n' — Visio stores multi-line
				// labels with literal '\n's — and separately, a line with no
				// authored '\n' can still need wrapping: Visio wraps to the text
				// box's width at author time without storing the resulting breaks
				// (see wrapLine's docstring). Apply both, then lay every resulting
				// line out as its own <tspan> with an explicit y (not dy off
				// dominant-baseline — unreliable across mixed CJK/Latin content).
				const lines = shape.text.split('\n').flatMap(l => wrapLine(l.trim(), shape.textWidth, fontSize));
				const lineHeight = fontSize * 1.2;
				const firstLineY = shape.textY - (lines.length - 1) * lineHeight / 2 + fontSize * BASELINE_CENTER_OFFSET;
				const text = doc.createElementNS(SVG_NS, 'text');
				text.setAttribute('text-anchor', 'middle');
				text.setAttribute('font-size', String(fontSize));
				text.setAttribute('fill', '#000000');
				text.classList.add('drawing-view-visio-text');
				lines.forEach((line, i) => {
					const tspan = doc.createElementNS(SVG_NS, 'tspan');
					tspan.setAttribute('x', String(shape.textX));
					tspan.setAttribute('y', String(firstLineY + i * lineHeight));
					tspan.textContent = line;
					text.appendChild(tspan);
				});
				group.appendChild(text);
			}
		}

		svg.appendChild(group);
		this.container.appendChild(svg);
		this.svgEl = svg;
		this.groupEl = group;
		this.applyTransform();
	}

	/** screen = (graph + translate) * scale — matches diagramRenderer.ts's documented convention. */
	private applyTransform(): void {
		this.groupEl?.setAttribute('transform', `scale(${this.scale}) translate(${this.tx} ${this.ty})`);
		this.viewChangeCb?.();
	}

	private computeBounds(): BoundingBox {
		if (this.shapes.length === 0) return { x: 0, y: 0, width: this.pageWidth, height: this.pageHeight };
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const s of this.shapes) {
			minX = Math.min(minX, s.bbox.x);
			minY = Math.min(minY, s.bbox.y);
			maxX = Math.max(maxX, s.bbox.x + s.bbox.width);
			maxY = Math.max(maxY, s.bbox.y + s.bbox.height);
		}
		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
	}
}
