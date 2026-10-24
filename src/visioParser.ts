import { roundPolyline } from './visioRounding';
import { placeText, readTextLayout, type HAlign, type VAlign } from './visioTextBox';
import { unzipSync } from 'fflate';

/**
 * .vsdx page/shape model, geometrically resolved and ready for an SVG renderer.
 *
 * Key finding (verified against a real multi-page .vsdx, not just spec-reading):
 * Visio ShapeSheet cells always carry a cached, already-resolved `V` alongside
 * their formula (`F`). Every cell whose formula depends on something that can
 * vary per shape instance (Width, Height, a User.* cell, ...) gets its own V
 * cached at the INSTANCE level, even when `F='Inh'` ("inherit the formula").
 * A cell/row that's entirely absent at the instance level is one whose value
 * is provably identical to the master's (typically a literal-zero corner of a
 * unit rectangle) — so falling back to the *master's own cached V verbatim*
 * for anything missing is exact, not approximate. This means rendering never
 * needs a ShapeSheet formula evaluator: only merge-by-index (master, then
 * instance-overrides-master) and read V. Formulas (`F`) are never evaluated
 * here, by design — not a shortcut, this is the correct approach for a
 * passive viewer of files Visio itself already resolved and cached.
 *
 * Also verified: cell `V` is always in the cell type's canonical internal
 * unit (inches for length, radians for angle) regardless of the `U` display
 * hint (`U='MM'`/`U='PT'`/`U='DEG'` are UI-only annotations) — so no unit
 * conversion is needed anywhere in this module beyond a single inches→px
 * scale applied once, at the page boundary.
 *
 * A handful of internals (extractGeometry/mergeGeometry/buildPath, the Mat
 * helpers) are exported solely so test/visioParser.test.ts can target the
 * geometry math directly instead of building a full synthetic .vsdx zip for
 * every case — they are not meant as a second public API; `parseVisioFile`
 * is still the only entry point real callers should use.
 */

const PX_PER_INCH = 96;

export interface VisioSubpath {
	/** SVG path `d`, already in page px-space (SVG Y-down, origin top-left). */
	d: string;
	fill: string;   // '' = no fill
	stroke: string; // '' = no stroke
}

export interface VisioShape {
	id: string;
	/**
	 * One subpath per Geometry section, plus one synthetic filled triangle
	 * per non-zero Begin/EndArrow — each carries its own resolved fill/stroke
	 * color rather than sharing one shape-wide color, since an arrowhead is
	 * filled in the *line* color, not the shape's fill color. Never
	 * force-closed with an SVG `Z`: whether a subpath looks closed is left
	 * entirely to its own point sequence returning to its start (which is how
	 * Visio's own "closed" shapes, e.g. a plain rectangle, are authored) —
	 * open shapes (lines, elbow connectors) must stay open, or they render as
	 * solid filled triangles/quads instead of lines.
	 */
	subpaths: VisioSubpath[];
	/**
	 * Visio's `FillPattern` cell: 0 = no fill (already reflected in each
	 * subpath's `fill` being ''), 1 = solid, 2+ = one of ~40 textured tile
	 * patterns (hatching, dots, ...). Only the on/off distinction and the
	 * foreground color are resolved into `subpaths[].fill` — the *pattern*
	 * itself (which exact tile) is passed through as this raw index rather
	 * than matching Visio's catalog exactly; a renderer may use it to draw
	 * some generic "textured" look for anything >= 2 instead of solid fill.
	 */
	fillPattern: number;
	/**
	 * Visio's `LinePattern` cell: 0 = no line (already reflected in each
	 * subpath's `stroke` being ''), 1 = solid, 2+ = one of several dash/dot
	 * styles. Same treatment as `fillPattern` — only on/off and color are
	 * resolved into `subpaths[].stroke`; the raw index is passed through for
	 * a renderer to pick some generic dashed/dotted look from, rather than
	 * matching Visio's exact dash catalog.
	 */
	linePattern: number;
	strokeWidth: number; // px
	text: string; // may contain '\n' for multiple lines
	/** Where the text starts, in page px: the content area's left/centre/right edge and top/middle/bottom, per the alignment below. */
	textX: number;
	textY: number;
	/** How the text sits against (textX, textY); `middle`/`middle` is the centre of the shape. */
	textHAlign: HAlign;
	textVAlign: VAlign;
	/** Text-box width (`TxtWidth`, falling back to the shape's own Width), px — the wrap width a renderer should pack `text`'s lines into. Visio wraps long lines to fit this at author time without storing the breaks, so it isn't reflected in `text` itself. */
	textWidth: number;
	fontSize: number; // px
	/** Font settings the file sets for this shape's text; a field is absent when it does not, and the renderer then uses its own. */
	fontFamily?: string;
	fontColor?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	bbox: { x: number; y: number; width: number; height: number }; // px, page space
}

export interface VisioPage {
	id: string;
	name: string;
	width: number;  // px
	height: number; // px
	shapes: VisioShape[];
}

export interface VisioFile {
	pages: VisioPage[];
	error?: string;
}

export function parseVisioFile(buffer: ArrayBuffer): VisioFile {
	try {
		const zip = unzipSync(new Uint8Array(buffer));

		const rootRels = readRels(zip, '_rels/.rels');
		const documentPath = byTypeSuffix(rootRels, '/officeDocument') ?? 'visio/document.xml';
		const documentRels = readRels(zip, relsPathFor(documentPath));
		const pagesPath = byTypeSuffix(documentRels, '/pages') ?? 'visio/pages/pages.xml';
		const mastersPath = byTypeSuffix(documentRels, '/masters');

		if (!zip[pagesPath]) return { pages: [], error: 'No pages found in .vsdx file.' };
		const pagesDoc = readXml(zip, pagesPath);
		const pagesRels = readRels(zip, relsPathFor(pagesPath));
		const pageEls = Array.from(pagesDoc.getElementsByTagName('Page'));
		if (pageEls.length === 0) return { pages: [], error: 'No pages found in .vsdx file.' };

		const masterCache = new Map<string, MasterInfo | null>();

		const pages: VisioPage[] = pageEls.map((pageEl, i) => {
			const id = pageEl.getAttribute('ID') ?? String(i);
			const name = pageEl.getAttribute('Name') || pageEl.getAttribute('NameU') || `Page ${i + 1}`;
			const pageSheet = directChild(pageEl, 'PageSheet');
			const widthIn = pageSheet ? numCell(pageSheet, 'PageWidth', 8.5) : 8.5;
			const heightIn = pageSheet ? numCell(pageSheet, 'PageHeight', 11) : 11;
			const relId = directChild(pageEl, 'Rel')?.getAttribute('r:id');
			const target = relId ? byId(pagesRels, relId) : undefined;

			// Maps page-space (inches, Y-up, origin bottom-left — Visio's convention)
			// to SVG px-space (Y-down, origin top-left) in one step: every shape's
			// transform chain is rooted here, so the arc-sweep mirror check in
			// buildPath (matrix determinant sign) picks up this flip for free.
			const pageToSvg: Mat = { a: PX_PER_INCH, b: 0, c: 0, d: -PX_PER_INCH, e: 0, f: heightIn * PX_PER_INCH };

			const shapes: VisioShape[] = [];
			if (target && zip[target]) {
				try {
					const contentDoc = readXml(zip, target);
					const rootShapes = contentDoc.getElementsByTagName('Shapes')[0];
					if (rootShapes) collectShapes(rootShapes, pageToSvg, zip, mastersPath, masterCache, shapes);
				} catch (err) {
					console.error('Rich View Visio parse (page content):', err);
				}
			}

			return { id, name, width: widthIn * PX_PER_INCH, height: heightIn * PX_PER_INCH, shapes };
		});

		return { pages };
	} catch (err) {
		return { pages: [], error: err instanceof Error ? err.message : 'Failed to parse Visio file.' };
	}
}

// ---------------------------------------------------------------------------
// OPC container plumbing (zip + relationship resolution)
// ---------------------------------------------------------------------------

type ZipMap = Record<string, Uint8Array>;

interface Rel {
	id: string;
	type: string;
	target: string;
}

function readXml(zip: ZipMap, path: string): Document {
	const bytes = zip[path];
	if (!bytes) throw new Error(`Missing part in .vsdx: ${path}`);
	const text = new TextDecoder('utf-8').decode(bytes);
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	if (doc.querySelector('parsererror')) throw new Error(`Malformed XML in .vsdx: ${path}`);
	return doc;
}

function dirOf(path: string): string {
	const i = path.lastIndexOf('/');
	return i === -1 ? '' : path.slice(0, i);
}

function basename(path: string): string {
	const i = path.lastIndexOf('/');
	return i === -1 ? path : path.slice(i + 1);
}

function relsPathFor(path: string): string {
	const dir = dirOf(path);
	return `${dir ? dir + '/' : ''}_rels/${basename(path)}.rels`;
}

/** Resolve a `Target` attribute (relative to `base`, or absolute if it starts with `/`). */
function joinPath(base: string, target: string): string {
	const baseParts = target.startsWith('/') ? [] : (base ? base.split('/') : []);
	const rawTarget = target.startsWith('/') ? target.slice(1) : target;
	for (const part of rawTarget.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') baseParts.pop();
		else baseParts.push(part);
	}
	return baseParts.join('/');
}

/** Parse a `.rels` part. Targets resolve relative to the folder that owns the `_rels` dir. */
function readRels(zip: ZipMap, relsPath: string): Rel[] {
	if (!zip[relsPath]) return [];
	const doc = readXml(zip, relsPath);
	const baseDir = dirOf(dirOf(relsPath)); // parent of the `_rels` folder
	return Array.from(doc.getElementsByTagName('Relationship')).map(rel => ({
		id: rel.getAttribute('Id') ?? '',
		type: rel.getAttribute('Type') ?? '',
		target: joinPath(baseDir, rel.getAttribute('Target') ?? ''),
	}));
}

function byId(rels: Rel[], id: string): string | undefined {
	return rels.find(r => r.id === id)?.target;
}

function byTypeSuffix(rels: Rel[], suffix: string): string | undefined {
	return rels.find(r => r.type.endsWith(suffix))?.target;
}

// ---------------------------------------------------------------------------
// ShapeSheet cell / geometry-section extraction
// ---------------------------------------------------------------------------

function directChild(el: Element, tag: string): Element | undefined {
	return Array.from(el.children).find(c => c.tagName === tag);
}

function directCellEl(el: Element, name: string): Element | undefined {
	return Array.from(el.children).find(c => c.tagName === 'Cell' && c.getAttribute('N') === name);
}

function numCell(el: Element, name: string, fallback: number): number {
	const v = directCellEl(el, name)?.getAttribute('V');
	const n = v ? parseFloat(v) : NaN;
	return isNaN(n) ? fallback : n;
}

/** Like numCell, but `undefined` (not a hardcoded default) when the cell is absent — needed wherever "absent" must fall through to a master's own value via `??`, rather than collapsing to a default that masks the fallback. */
function optionalBoolCell(el: Element, name: string): boolean | undefined {
	const v = directCellEl(el, name)?.getAttribute('V');
	if (v === undefined || v === null || v === '') return undefined;
	const n = parseFloat(v);
	return isNaN(n) ? undefined : n === 1;
}

function strCell(el: Element, name: string, fallback: string): string {
	const v = directCellEl(el, name)?.getAttribute('V');
	return v && v.length > 0 ? v : fallback;
}

export interface GeomRow {
	type: string;
	cells: Record<string, number>;
}

export interface GeomSection {
	rows: Map<string, GeomRow>; // keyed by Row IX (string, for stable ordering incl. duplicates)
	// Row IXs marked `Del='1'` on THIS section — e.g. a connector instance
	// deleting a placeholder row inherited from its master's unit-square
	// template. Tracked separately from `rows` (not just omitted) because
	// mergeGeometry must actively suppress that row index even though the
	// master still has one for it — omitting it from `rows` alone would just
	// make the merge fall back to the master's row, the opposite of "deleted"
	// (real bug: found a connector master's own RelLineTo(1,1) — a corner of
	// its unit-square geometry placeholder, meaningless for this connector's
	// tiny actual bounding box — surviving into the merged path as an
	// absolute LineTo to local (1,1), producing a stray segment shooting far
	// outside the shape once rendered).
	deletedRows: Set<string>;
	// undefined = not specified on THIS section — mergeGeometry must fall back
	// to the master's own section flag via `??`, so these can't collapse
	// "absent" to a hardcoded false (see mergeGeometry's docstring).
	noFill: boolean | undefined;
	noLine: boolean | undefined;
	noShow: boolean | undefined;
}

/** Extract every `<Section N='Geometry'>` on a `<Shape>` element (page shape or master shape alike). */
export function extractGeometry(shapeEl: Element): Map<string, GeomSection> {
	const sections = new Map<string, GeomSection>();
	const sectionEls = Array.from(shapeEl.children)
		.filter(c => c.tagName === 'Section' && c.getAttribute('N') === 'Geometry');
	for (const sectionEl of sectionEls) {
		const sectionIx = sectionEl.getAttribute('IX') ?? '0';
		const rows = new Map<string, GeomRow>();
		const deletedRows = new Set<string>();
		for (const rowEl of Array.from(sectionEl.children).filter(c => c.tagName === 'Row')) {
			const rowIx = rowEl.getAttribute('IX') ?? '';
			if (rowEl.getAttribute('Del') === '1') {
				deletedRows.add(rowIx);
				continue;
			}
			const type = rowEl.getAttribute('T') ?? 'LineTo';
			const cells: Record<string, number> = {};
			for (const cellEl of Array.from(rowEl.children).filter(c => c.tagName === 'Cell')) {
				const n = cellEl.getAttribute('N');
				const v = parseFloat(cellEl.getAttribute('V') ?? '');
				if (n && !isNaN(v)) cells[n] = v;
			}
			rows.set(rowIx, { type, cells });
		}
		sections.set(sectionIx, {
			rows,
			deletedRows,
			noFill: optionalBoolCell(sectionEl, 'NoFill'),
			noLine: optionalBoolCell(sectionEl, 'NoLine'),
			noShow: optionalBoolCell(sectionEl, 'NoShow'),
		});
	}
	return sections;
}

/** Instance-overrides-master, cell by cell; anything absent on the instance falls back to the master's own cached V (see module docstring — this is exact, not approximate). */
export function mergeGeometry(master: Map<string, GeomSection> | undefined, instance: Map<string, GeomSection>): Map<string, GeomSection> {
	const sectionIxs = new Set([...(master?.keys() ?? []), ...instance.keys()]);
	const merged = new Map<string, GeomSection>();
	for (const sIx of sectionIxs) {
		const m = master?.get(sIx);
		const i = instance.get(sIx);
		const rowIxs = new Set([...(m?.rows.keys() ?? []), ...(i?.rows.keys() ?? [])]);
		const rows = new Map<string, GeomRow>();
		for (const rIx of rowIxs) {
			if (i?.deletedRows.has(rIx)) continue; // instance explicitly deletes this row — never fall back to master's
			const mRow = m?.rows.get(rIx);
			const iRow = i?.rows.get(rIx);
			rows.set(rIx, {
				type: iRow?.type ?? mRow?.type ?? 'LineTo',
				cells: { ...(mRow?.cells ?? {}), ...(iRow?.cells ?? {}) },
			});
		}
		merged.set(sIx, {
			rows,
			deletedRows: new Set(), // fully resolved — nothing further should ever consult this on a merge result
			noFill: i?.noFill ?? m?.noFill ?? false,
			noLine: i?.noLine ?? m?.noLine ?? false,
			noShow: i?.noShow ?? m?.noShow ?? false,
		});
	}
	return merged;
}

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------

interface MasterInfo {
	width: number;
	height: number;
	geometry: Map<string, GeomSection>;
}

/** Lazily loaded, cached across the whole file (masters.xml is shared by every page). */
function loadMasterInfo(
	zip: ZipMap,
	mastersPath: string | undefined,
	masterId: string,
	cache: Map<string, MasterInfo | null>,
): MasterInfo | null {
	if (!mastersPath || !zip[mastersPath]) return null;
	const cached = cache.get(masterId);
	if (cached !== undefined) return cached;
	try {
		const mastersDoc = readXml(zip, mastersPath);
		const masterEl = Array.from(mastersDoc.getElementsByTagName('Master')).find(e => e.getAttribute('ID') === masterId);
		const relId = masterEl ? directChild(masterEl, 'Rel')?.getAttribute('r:id') : undefined;
		if (!relId) { cache.set(masterId, null); return null; }
		const mastersRels = readRels(zip, relsPathFor(mastersPath));
		const masterFilePath = byId(mastersRels, relId);
		if (!masterFilePath || !zip[masterFilePath]) { cache.set(masterId, null); return null; }
		const masterDoc = readXml(zip, masterFilePath);
		const shapeEl = masterDoc.getElementsByTagName('Shape')[0];
		if (!shapeEl) { cache.set(masterId, null); return null; }
		const info: MasterInfo = {
			width: numCell(shapeEl, 'Width', 1),
			height: numCell(shapeEl, 'Height', 1),
			geometry: extractGeometry(shapeEl),
		};
		cache.set(masterId, info);
		return info;
	} catch (err) {
		console.error('Rich View Visio parse (master):', err);
		cache.set(masterId, null);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Affine transforms: shape-local space → page px-space
// ---------------------------------------------------------------------------

export interface Mat { a: number; b: number; c: number; d: number; e: number; f: number }

export function multiply(outer: Mat, inner: Mat): Mat {
	return {
		a: outer.a * inner.a + outer.c * inner.b,
		b: outer.b * inner.a + outer.d * inner.b,
		c: outer.a * inner.c + outer.c * inner.d,
		d: outer.b * inner.c + outer.d * inner.d,
		e: outer.a * inner.e + outer.c * inner.f + outer.e,
		f: outer.b * inner.e + outer.d * inner.f + outer.f,
	};
}

export function apply(m: Mat, x: number, y: number): { x: number; y: number } {
	return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** Maps a shape's own local geometry coords onto its parent's local space (page space, for a top-level shape). */
export function shapeLocalMatrix(s: {
	width: number; height: number;
	locPinX: number; locPinY: number;
	angle: number; flipX: boolean; flipY: boolean;
	pinX: number; pinY: number;
}): Mat {
	const flip: Mat = { a: s.flipX ? -1 : 1, b: 0, c: 0, d: s.flipY ? -1 : 1, e: s.flipX ? s.width : 0, f: s.flipY ? s.height : 0 };
	const toOrigin: Mat = { a: 1, b: 0, c: 0, d: 1, e: -s.locPinX, f: -s.locPinY };
	const cos = Math.cos(s.angle), sin = Math.sin(s.angle);
	const rotate: Mat = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
	const toPin: Mat = { a: 1, b: 0, c: 0, d: 1, e: s.pinX, f: s.pinY };
	return multiply(toPin, multiply(rotate, multiply(toOrigin, flip)));
}

// ---------------------------------------------------------------------------
// Geometry → SVG path
// ---------------------------------------------------------------------------

export interface RawSubpath {
	d: string;
	fillOn: boolean;   // section's own NoFill negated — shape-level FillPattern still applies on top
	strokeOn: boolean; // section's own NoLine negated — shape-level LinePattern still applies on top
}

/**
 * Builds one SVG subpath per (merged) Geometry section of a shape.
 *
 * Deliberately never force-closes a subpath with an SVG `Z`: whether a
 * subpath is visually closed is left entirely to its own point sequence —
 * Visio's own closed shapes (e.g. a plain rectangle) are authored with an
 * explicit final segment back to the start point, so they still look closed
 * without help. Open shapes (straight/elbow connectors) have no such
 * closing segment and must stay open — forcing `Z` on everything made every
 * multi-segment connector render as a filled/stroked triangle or quad
 * instead of a line (caught via real-file testing, not just code review).
 *
 * ArcTo's sweep direction is derived from the sign of the transform's
 * determinant (odd number of mirror flips — shape FlipX/FlipY, or the
 * page's guaranteed Y-up→Y-down flip baked into `m` at the root — reverses
 * the sweep). The base convention (which sign of the bulge cell `A` means
 * clockwise before any mirroring) was verified visually correct against a
 * real rounded-rectangle sample.
 * EllipticalArcTo is approximated as a straight line to its endpoint —
 * reconstructing a true ellipse from Visio's (endpoint, control-point,
 * angle, aspect-ratio) representation needs real trig we haven't verified,
 * and a straight segment at least keeps the outline continuous.
 */
export function buildPath(
	sections: Map<string, GeomSection>,
	width: number,
	height: number,
	m: Mat,
	/** Visio's `Rounding` cell: corner radius in the shape's own units (inches). 0 leaves every corner sharp. */
	rounding = 0,
): { subpaths: RawSubpath[]; points: { x: number; y: number }[] } {
	const subpaths: RawSubpath[] = [];
	const points: { x: number; y: number }[] = [];
	const det = m.a * m.d - m.b * m.c;
	const mirrored = det < 0;
	// ArcTo's chord/bulge cells are in the shape's own local (pre-transform, inch)
	// unit; `m` already bakes in rotation/flip/px-scale for point coordinates, so
	// the radius needs the same uniform length scale — sqrt(|det|), since a pure
	// rotation+flip+uniform-scale matrix has determinant = ±scale².
	const lengthScale = Math.sqrt(Math.abs(det));

	for (const section of sections.values()) {
		if (section.noShow) continue;
		const rows = Array.from(section.rows.entries()).sort((a, b) => (parseFloat(a[0]) || 0) - (parseFloat(b[0]) || 0));
		if (rows.length === 0) continue;
		const parts: string[] = [];
		let cx = 0, cy = 0;
		// The section's corners in the shape's own units, kept so a straight-sided outline can be redrawn with
		// rounded corners; a section with any curve is left exactly as built.
		const local: { x: number; y: number }[] = [];
		let straightOnly = true;
		let moves = 0;
		for (const [, row] of rows) {
			const c = row.cells;
			if (row.type === 'MoveTo' || row.type === 'RelMoveTo') moves++;
			else if (row.type !== 'LineTo' && row.type !== 'RelLineTo') straightOnly = false;
			switch (row.type) {
				case 'MoveTo': {
					cx = c.X ?? 0; cy = c.Y ?? 0;
					local.push({ x: cx, y: cy });
					const p = apply(m, cx, cy);
					parts.push(`M ${p.x} ${p.y}`); points.push(p);
					break;
				}
				case 'RelMoveTo': {
					cx = (c.X ?? 0) * width; cy = (c.Y ?? 0) * height;
					local.push({ x: cx, y: cy });
					const p = apply(m, cx, cy);
					parts.push(`M ${p.x} ${p.y}`); points.push(p);
					break;
				}
				case 'RelLineTo': {
					cx = (c.X ?? 0) * width; cy = (c.Y ?? 0) * height;
					local.push({ x: cx, y: cy });
					const p = apply(m, cx, cy);
					parts.push(`L ${p.x} ${p.y}`); points.push(p);
					break;
				}
				case 'ArcTo': {
					const x0 = cx, y0 = cy;
					cx = c.X ?? cx; cy = c.Y ?? cy;
					const bulge = c.A ?? 0;
					const p1 = apply(m, cx, cy);
					const dx = cx - x0, dy = cy - y0;
					const half = Math.sqrt(dx * dx + dy * dy) / 2;
					if (half < 1e-9 || Math.abs(bulge) < 1e-9) {
						parts.push(`L ${p1.x} ${p1.y}`);
					} else {
						const r = ((half * half + bulge * bulge) / (2 * Math.abs(bulge))) * lengthScale;
						const largeArc = Math.abs(bulge) * lengthScale > r ? 1 : 0;
						const sweep = (bulge > 0) !== mirrored ? 1 : 0;
						parts.push(`A ${r} ${r} 0 ${largeArc} ${sweep} ${p1.x} ${p1.y}`);
					}
					points.push(p1);
					break;
				}
				case 'EllipticalArcTo':
				case 'LineTo':
				default: {
					// Unknown row types (NURBSTo, PolylineTo, SplineStart, ...) fall
					// into this same straight-line branch so the path stays valid.
					if (c.X !== undefined) cx = c.X;
					if (c.Y !== undefined) cy = c.Y;
					local.push({ x: cx, y: cy });
					const p = apply(m, cx, cy);
					parts.push(`L ${p.x} ${p.y}`); points.push(p);
					break;
				}
			}
		}
		let d = parts.join(' ');
		if (rounding > 0 && straightOnly && moves === 1 && local.length >= 3) {
			// A rectangle's last LineTo comes back to its start: that is a closed outline, and the repeated
			// end point must not become a corner of its own.
			const first = local[0]!, last = local[local.length - 1]!;
			const closed = Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9;
			const corners = closed ? local.slice(0, -1) : local;
			d = roundPolyline(corners, rounding, closed, p => apply(m, p.x, p.y)) || d;
		}
		subpaths.push({ d, fillOn: !section.noFill, strokeOn: !section.noLine });
	}
	return { subpaths, points };
}

/**
 * A small fixed-size filled triangle, tip at `to`, pointing along the
 * `from`→`to` direction — used for Begin/EndArrow markers. Visio's arrow
 * cells select from a large numbered catalog of styles/sizes; this renders
 * every non-zero style as the same generic triangle rather than matching
 * the exact catalog entry, consistent with this module's "approximate
 * rather than block" approach elsewhere (EllipticalArcTo, master fallback).
 */
export function arrowheadPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
	const ARROW_LEN = 9, ARROW_HALF_WIDTH = 3.5;
	const dx = to.x - from.x, dy = to.y - from.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1e-6) return '';
	const ux = dx / len, uy = dy / len;
	const px = -uy, py = ux;
	const baseX = to.x - ux * ARROW_LEN, baseY = to.y - uy * ARROW_LEN;
	const leftX = baseX + px * ARROW_HALF_WIDTH, leftY = baseY + py * ARROW_HALF_WIDTH;
	const rightX = baseX - px * ARROW_HALF_WIDTH, rightY = baseY - py * ARROW_HALF_WIDTH;
	return `M ${to.x} ${to.y} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`;
}

// ---------------------------------------------------------------------------
// Shape tree walk
// ---------------------------------------------------------------------------

function collectShapes(
	shapesEl: Element,
	parentMatrix: Mat,
	zip: ZipMap,
	mastersPath: string | undefined,
	masterCache: Map<string, MasterInfo | null>,
	out: VisioShape[],
): void {
	for (const shapeEl of Array.from(shapesEl.children).filter(c => c.tagName === 'Shape')) {
		const width = numCell(shapeEl, 'Width', 0);
		const height = numCell(shapeEl, 'Height', 0);
		const local = shapeLocalMatrix({
			width, height,
			locPinX: numCell(shapeEl, 'LocPinX', 0),
			locPinY: numCell(shapeEl, 'LocPinY', 0),
			angle: numCell(shapeEl, 'Angle', 0),
			flipX: numCell(shapeEl, 'FlipX', 0) === 1,
			flipY: numCell(shapeEl, 'FlipY', 0) === 1,
			pinX: numCell(shapeEl, 'PinX', 0),
			pinY: numCell(shapeEl, 'PinY', 0),
		});
		const m = multiply(parentMatrix, local);

		const masterId = shapeEl.getAttribute('Master');
		const master = masterId ? loadMasterInfo(zip, mastersPath, masterId, masterCache) : null;
		const geometry = mergeGeometry(master?.geometry, extractGeometry(shapeEl));
		const { subpaths: rawSubpaths, points } = buildPath(geometry, width, height, m, numCell(shapeEl, 'Rounding', 0));

		if (rawSubpaths.length > 0 && points.length > 0) {
			const fillPatternIndex = numCell(shapeEl, 'FillPattern', 1);
			const fillPatternOn = fillPatternIndex !== 0;
			const linePatternIndex = numCell(shapeEl, 'LinePattern', 1);
			const linePatternOn = linePatternIndex !== 0;
			const fillColor = strCell(shapeEl, 'FillForegnd', '#ffffff');
			const strokeColor = strCell(shapeEl, 'LineColor', '#000000');

			const subpaths: VisioSubpath[] = rawSubpaths.map(sp => ({
				d: sp.d,
				fill: sp.fillOn && fillPatternOn ? fillColor : '',
				stroke: sp.strokeOn && linePatternOn ? strokeColor : '',
			}));

			// Arrowhead markers: filled in the line color, independent of the
			// shape's own fill (a connector's body has no fill at all, but its
			// arrowhead is always a solid triangle).
			if (points.length >= 2) {
				if (numCell(shapeEl, 'BeginArrow', 0) !== 0) {
					const d = arrowheadPath(points[1]!, points[0]!);
					if (d) subpaths.push({ d, fill: strokeColor, stroke: '' });
				}
				if (numCell(shapeEl, 'EndArrow', 0) !== 0) {
					const d = arrowheadPath(points[points.length - 2]!, points[points.length - 1]!);
					if (d) subpaths.push({ d, fill: strokeColor, stroke: '' });
				}
			}

			const text = directChild(shapeEl, 'Text')?.textContent?.trim() ?? '';
			const layout = readTextLayout(shapeEl);
			const placed = placeText({ ...layout.box, width, height });
			const anchor = apply(m, placed.x, placed.y);
			const xs = points.map(p => p.x), ys = points.map(p => p.y);
			const minX = Math.min(...xs), maxX = Math.max(...xs);
			const minY = Math.min(...ys), maxY = Math.max(...ys);
			// TxtWidth is in the shape's own local (pre-transform, inch) unit, same
			// as an ArcTo bulge — needs the same length-scale correction as buildPath
			// applies to radii, not a bare *PX_PER_INCH (see that scaling note above).
			const lengthScale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
			const textWidth = placed.contentWidth * lengthScale;

			out.push({
				id: shapeEl.getAttribute('ID') ?? '',
				subpaths,
				fillPattern: fillPatternIndex,
				linePattern: linePatternIndex,
				strokeWidth: numCell(shapeEl, 'LineWeight', 0.01) * PX_PER_INCH,
				text,
				textX: anchor.x,
				textY: anchor.y,
				textHAlign: placed.hAlign,
				textVAlign: placed.vAlign,
				textWidth,
				fontSize: characterFontSize(shapeEl),
				...(layout.font.family !== undefined ? { fontFamily: layout.font.family } : {}),
				...(layout.font.color !== undefined ? { fontColor: layout.font.color } : {}),
				...(layout.font.bold !== undefined ? { bold: layout.font.bold } : {}),
				...(layout.font.italic !== undefined ? { italic: layout.font.italic } : {}),
				...(layout.font.underline !== undefined ? { underline: layout.font.underline } : {}),
				bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
			});
		}

		const nestedShapes = directChild(shapeEl, 'Shapes');
		if (nestedShapes) collectShapes(nestedShapes, m, zip, mastersPath, masterCache, out);
	}
}

function characterFontSize(shapeEl: Element): number {
	const DEFAULT_SIZE_IN = 0.1389; // ~10pt
	const charSection = Array.from(shapeEl.children).find(c => c.tagName === 'Section' && c.getAttribute('N') === 'Character');
	const row0 = charSection ? Array.from(charSection.children).find(c => c.tagName === 'Row') : undefined;
	const sizeIn = row0 ? numCell(row0, 'Size', DEFAULT_SIZE_IN) : DEFAULT_SIZE_IN;
	return sizeIn * PX_PER_INCH;
}
