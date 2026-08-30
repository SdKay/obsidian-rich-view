import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import {
	apply,
	arrowheadPath,
	buildPath,
	extractGeometry,
	mergeGeometry,
	multiply,
	parseVisioFile,
	shapeLocalMatrix,
	type Mat,
} from '../src/visioParser';

/** Parse a `<Shape>...</Shape>` fragment into its Element, the way visioParser reads real .vsdx XML. */
function shapeEl(xml: string): Element {
	const doc = new DOMParser().parseFromString(xml, 'application/xml');
	const el = doc.documentElement;
	if (!el) throw new Error('fixture did not parse');
	return el;
}

const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

describe('mergeGeometry — instance-overrides-master, cell by cell', () => {
	it('falls back to the master\'s own NoFill when the instance section omits it', () => {
		// Regression: extractGeometry used to collapse "NoFill absent" to a
		// hardcoded `false`, which made mergeGeometry's `i.noFill ?? m.noFill`
		// never fall through to the master (false ?? x === false) — connectors
		// whose master marks the body NoFill=1 rendered filled anyway. Caught
		// against a real .vsdx, not from reading the code.
		const master = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Cell N='NoFill' V='1'/>
				<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
			</Section></Shape>`));
		const instance = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='LineTo' IX='2'><Cell N='X' V='5'/><Cell N='Y' V='5'/></Row>
			</Section></Shape>`));

		const merged = mergeGeometry(master, instance);
		expect(merged.get('0')?.noFill).toBe(true);
		// Row union: master's MoveTo (IX=1, not present on the instance) and the
		// instance's own LineTo (IX=2) must both survive the merge.
		expect(merged.get('0')?.rows.has('1')).toBe(true);
		expect(merged.get('0')?.rows.has('2')).toBe(true);
	});

	it('lets an explicit instance-level flag override the master\'s', () => {
		const master = extractGeometry(shapeEl(`<Shape><Section N='Geometry' IX='0'><Cell N='NoFill' V='1'/></Section></Shape>`));
		const instance = extractGeometry(shapeEl(`<Shape><Section N='Geometry' IX='0'><Cell N='NoFill' V='0'/></Section></Shape>`));
		expect(mergeGeometry(master, instance).get('0')?.noFill).toBe(false);
	});

	it('defaults to "has fill" when neither instance nor master says otherwise', () => {
		const instance = extractGeometry(shapeEl(`<Shape><Section N='Geometry' IX='0'><Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row></Section></Shape>`));
		expect(mergeGeometry(undefined, instance).get('0')?.noFill).toBe(false);
	});

	it('merges cells within the same Row IX individually, not the whole row', () => {
		// Real-world case (plain rectangle instance overriding a master corner):
		// the instance overrides only X on IX=2, Y must still come from the master.
		const master = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='LineTo' IX='2'><Cell N='X' V='1'/><Cell N='Y' V='1'/></Row>
			</Section></Shape>`));
		const instance = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='LineTo' IX='2'><Cell N='X' V='9'/></Row>
			</Section></Shape>`));
		const row = mergeGeometry(master, instance).get('0')?.rows.get('2');
		expect(row?.cells.X).toBe(9);  // instance override
		expect(row?.cells.Y).toBe(1);  // fallen back to master
	});

	it('drops a row the instance marks Del="1" instead of falling back to the master\'s row for that index', () => {
		// Regression, found by comparing a rendered connector against its real
		// Visio source: a "Dynamic connector" master's own geometry is a
		// unit-square placeholder (RelLineTo fractions 0..1) that real routed
		// connector instances delete every row of except the ones they define
		// themselves (MoveTo/LineTo, absolute local coords). One deleted row
		// (`<Row T='LineTo' IX='3' Del='1'/>`, no cells) wasn't being honored —
		// mergeGeometry fell back to the master's row 3 anyway, which is a
		// RelLineTo(1,1): interpreted as an absolute LineTo (since the merged
		// row's type came from... nowhere valid, since Del rows have no type
		// to contribute) to local (1,1) — miles outside a connector whose
		// whole bounding box might be a few tenths of an inch, rendering as a
		// long stray segment shooting off past the shape.
		const master = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
				<Row T='RelLineTo' IX='2'><Cell N='X' V='1'/><Cell N='Y' V='0'/></Row>
				<Row T='RelLineTo' IX='3'><Cell N='X' V='1'/><Cell N='Y' V='1'/></Row>
			</Section></Shape>`));
		const instance = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='MoveTo' IX='1'><Cell N='X' V='0.1'/></Row>
				<Row T='LineTo' IX='2'><Cell N='X' V='0.1'/><Cell N='Y' V='-0.2'/></Row>
				<Row T='LineTo' IX='3' Del='1'/>
			</Section></Shape>`));
		const merged = mergeGeometry(master, instance).get('0');
		expect(merged?.rows.has('3')).toBe(false);
	});
});

describe('buildPath — open vs. closed subpaths', () => {
	it('never force-closes a subpath — an elbow connector stays open', () => {
		// Regression: an earlier version always appended an SVG `Z`, which
		// turned every multi-segment connector into a filled/stroked triangle
		// or quad instead of a line (only visible once actually rendered).
		const geometry = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
				<Row T='LineTo' IX='2'><Cell N='X' V='0'/><Cell N='Y' V='5'/></Row>
				<Row T='LineTo' IX='3'><Cell N='X' V='10'/><Cell N='Y' V='5'/></Row>
			</Section></Shape>`));
		const { subpaths } = buildPath(geometry, 10, 5, IDENTITY);
		expect(subpaths).toHaveLength(1);
		expect(subpaths[0]!.d).not.toContain('Z');
		expect(subpaths[0]!.d.trim()).toBe('M 0 0 L 0 5 L 10 5');
	});

	it('a self-closing shape (explicit return-to-start) still looks closed without a Z', () => {
		const geometry = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
				<Row T='LineTo' IX='2'><Cell N='X' V='10'/><Cell N='Y' V='0'/></Row>
				<Row T='LineTo' IX='3'><Cell N='X' V='10'/><Cell N='Y' V='5'/></Row>
				<Row T='LineTo' IX='4'><Cell N='X' V='0'/><Cell N='Y' V='5'/></Row>
				<Row T='LineTo' IX='5'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
			</Section></Shape>`));
		const { subpaths } = buildPath(geometry, 10, 5, IDENTITY);
		expect(subpaths[0]!.d).not.toContain('Z');
		const coords = subpaths[0]!.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
		expect(coords.slice(0, 2)).toEqual(coords.slice(-2)); // first point === last point
	});

	it('skips a section entirely when NoShow is set', () => {
		const geometry = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Cell N='NoShow' V='1'/>
				<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
			</Section></Shape>`));
		expect(buildPath(geometry, 10, 10, IDENTITY).subpaths).toHaveLength(0);
	});

	it('resolves RelLineTo as a fraction of Width/Height, not an absolute coordinate', () => {
		const geometry = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='RelMoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
				<Row T='RelLineTo' IX='2'><Cell N='X' V='1'/><Cell N='Y' V='1'/></Row>
			</Section></Shape>`));
		const { subpaths } = buildPath(geometry, 100, 50, IDENTITY);
		expect(subpaths[0]!.d.trim()).toBe('M 0 0 L 100 50');
	});

	it('carries fillOn/strokeOn from the section\'s NoFill/NoLine, independent of each other', () => {
		const geometry = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Cell N='NoFill' V='1'/>
				<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
			</Section></Shape>`));
		const { subpaths } = buildPath(geometry, 1, 1, IDENTITY);
		expect(subpaths[0]).toMatchObject({ fillOn: false, strokeOn: true });
	});

	it('scales an ArcTo bulge/radius by the transform\'s length scale, not the raw local value', () => {
		// Regression: the radius was computed in the shape's local (pre-transform,
		// inch) unit but written straight into an already px-scaled path string —
		// rounded corners rendered ~96x too tight. Caught by running the parser
		// against a real file, not from reading the code.
		const geometry = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
				<Row T='ArcTo' IX='2'><Cell N='X' V='2'/><Cell N='Y' V='0'/><Cell N='A' V='0.5'/></Row>
			</Section></Shape>`));
		const scale10: Mat = { a: 10, b: 0, c: 0, d: 10, e: 0, f: 0 }; // uniform 10x, det = 100
		const { subpaths } = buildPath(geometry, 2, 2, scale10);
		const arc = subpaths[0]!.d.match(/A ([\d.]+) ([\d.]+) 0 (\d) (\d) ([\d.-]+) ([\d.-]+)/);
		expect(arc).not.toBeNull();
		// half=1, bulge=0.5 (local) -> r_local=(1^2+0.5^2)/(2*0.5)=1.25 -> *lengthScale(10) = 12.5
		expect(Number(arc![1])).toBeCloseTo(12.5, 5);
	});

	it('flips the ArcTo sweep flag when the transform is mirrored (odd number of flips)', () => {
		const geometry = extractGeometry(shapeEl(`
			<Shape><Section N='Geometry' IX='0'>
				<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
				<Row T='ArcTo' IX='2'><Cell N='X' V='2'/><Cell N='Y' V='0'/><Cell N='A' V='0.5'/></Row>
			</Section></Shape>`));
		const plain: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };       // det = +1
		const mirroredX: Mat = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };  // det = -1
		const sweepOf = (m: Mat) => buildPath(geometry, 2, 2, m).subpaths[0]!.d.match(/A [\d.]+ [\d.]+ 0 \d (\d)/)![1];
		expect(sweepOf(plain)).not.toBe(sweepOf(mirroredX));
	});
});

describe('arrowheadPath', () => {
	it('places the tip exactly at `to`, base set back along the from→to direction', () => {
		const d = arrowheadPath({ x: 0, y: 0 }, { x: 10, y: 0 });
		const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
		expect(nums.slice(0, 2)).toEqual([10, 0]); // tip
		// Base corners are symmetric across the (horizontal) direction line.
		const [, , x1, y1, x2, y2] = nums;
		expect(x1).toBeCloseTo(x2!, 5);
		expect(y1).toBeCloseTo(-y2!, 5);
	});

	it('returns empty for a zero-length direction rather than a degenerate path', () => {
		expect(arrowheadPath({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe('');
	});
});

describe('shapeLocalMatrix + apply — Pin/LocPin/Angle/Flip transform', () => {
	it('places the LocPin exactly at PinX/PinY with no rotation/flip', () => {
		const m = shapeLocalMatrix({ width: 10, height: 10, locPinX: 5, locPinY: 5, angle: 0, flipX: false, flipY: false, pinX: 100, pinY: 200 });
		expect(apply(m, 5, 5)).toEqual({ x: 100, y: 200 });
		expect(apply(m, 0, 0)).toEqual({ x: 95, y: 195 });
	});

	it('rotates 90° about the pin', () => {
		const m = shapeLocalMatrix({ width: 10, height: 10, locPinX: 0, locPinY: 0, angle: Math.PI / 2, flipX: false, flipY: false, pinX: 0, pinY: 0 });
		const p = apply(m, 10, 0);
		expect(p.x).toBeCloseTo(0, 9);
		expect(p.y).toBeCloseTo(10, 9);
	});

	it('composes with a parent matrix for nested groups', () => {
		const parent = shapeLocalMatrix({ width: 0, height: 0, locPinX: 0, locPinY: 0, angle: 0, flipX: false, flipY: false, pinX: 1000, pinY: 1000 });
		const child = shapeLocalMatrix({ width: 10, height: 10, locPinX: 5, locPinY: 5, angle: 0, flipX: false, flipY: false, pinX: 50, pinY: 50 });
		const combined = multiply(parent, child);
		expect(apply(combined, 5, 5)).toEqual({ x: 1050, y: 1050 });
	});
});

// ---------------------------------------------------------------------------
// parseVisioFile — end-to-end through a minimal synthetic .vsdx (no real
// vault file needed/committed: everything here is a purpose-built fixture).
// ---------------------------------------------------------------------------

function utf8(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

function buildFixtureVsdx(): ArrayBuffer {
	const rels = (relationships: { id: string; type: string; target: string }[]) =>
		`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
			relationships.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('')
		}</Relationships>`;

	const files: Record<string, Uint8Array> = {
		'_rels/.rels': utf8(rels([
			{ id: 'rId1', type: 'http://schemas.microsoft.com/visio/2010/relationships/document', target: 'visio/document.xml' },
		])),
		'visio/document.xml': utf8('<VisioDocument/>'),
		'visio/_rels/document.xml.rels': utf8(rels([
			{ id: 'rId1', type: 'http://schemas.microsoft.com/visio/2010/relationships/pages', target: 'pages/pages.xml' },
			{ id: 'rId2', type: 'http://schemas.microsoft.com/visio/2010/relationships/masters', target: 'masters/masters.xml' },
		])),
		'visio/pages/pages.xml': utf8(
			`<Pages xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
			`<Page ID='0' Name='Page A'>` +
			`<PageSheet><Cell N='PageWidth' V='10'/><Cell N='PageHeight' V='8'/></PageSheet>` +
			`<Rel r:id='rId1'/></Page></Pages>`,
		),
		'visio/pages/_rels/pages.xml.rels': utf8(rels([
			{ id: 'rId1', type: 'http://schemas.microsoft.com/visio/2010/relationships/page', target: 'page1.xml' },
		])),
		// Shape references Master ID='9' and omits the MoveTo row (IX=1) its
		// master supplies — this only produces a valid path if the OPC
		// relationship chain AND the master-geometry fallback both work.
		'visio/pages/page1.xml': utf8(
			`<PageContents><Shapes>` +
			`<Shape ID='1' Master='9'>` +
			`<Cell N='PinX' V='5'/><Cell N='PinY' V='4'/><Cell N='Width' V='2'/><Cell N='Height' V='1'/>` +
			`<Cell N='LocPinX' V='0'/><Cell N='LocPinY' V='0'/><Cell N='TxtWidth' V='3'/><Cell N='FillPattern' V='2'/><Cell N='LinePattern' V='2'/>` +
			`<Section N='Geometry' IX='0'><Row T='LineTo' IX='2'><Cell N='X' V='2'/><Cell N='Y' V='0'/></Row></Section>` +
			`<Text><cp IX='0'/>Hello\n(World)</Text>` +
			`</Shape></Shapes></PageContents>`,
		),
		'visio/masters/masters.xml': utf8(
			`<Masters xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
			`<Master ID='9'><Rel r:id='rId1'/></Master></Masters>`,
		),
		// Deliberately mismatched numeric suffix (Master ID=9 -> master7.xml) —
		// real .vsdx files do this (confirmed against a real sample where Master
		// ID 4 resolves to master3.xml); a resolver that hardcodes "master<ID>.xml"
		// instead of walking the .rels chain would silently fail here.
		'visio/masters/_rels/masters.xml.rels': utf8(rels([
			{ id: 'rId1', type: 'http://schemas.microsoft.com/visio/2010/relationships/master', target: 'master7.xml' },
		])),
		'visio/masters/master7.xml': utf8(
			`<Masters><Shape ID='1'><Cell N='Width' V='1'/><Cell N='Height' V='1'/>` +
			`<Section N='Geometry' IX='0'><Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row></Section>` +
			`</Shape></Masters>`,
		),
	};

	const zipped = zipSync(files);
	return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

describe('parseVisioFile — end-to-end OPC resolution + master fallback', () => {
	it('resolves pages/masters through the .rels chain (not by guessing filenames) and merges master geometry', () => {
		const result = parseVisioFile(buildFixtureVsdx());
		expect(result.error).toBeUndefined();
		expect(result.pages).toHaveLength(1);

		const page = result.pages[0]!;
		expect(page.name).toBe('Page A');
		expect(page.width).toBeCloseTo(10 * 96);
		expect(page.height).toBeCloseTo(8 * 96);

		expect(page.shapes).toHaveLength(1);
		const shape = page.shapes[0]!;
		// A path starting with 'L' (no leading 'M') would mean the master's
		// MoveTo row never made it into the merge.
		expect(shape.subpaths[0]!.d.trim().startsWith('M')).toBe(true);
	});

	it('preserves literal newlines in shape text (multi-line labels)', () => {
		const result = parseVisioFile(buildFixtureVsdx());
		expect(result.pages[0]!.shapes[0]!.text).toBe('Hello\n(World)');
	});

	it('passes through the raw FillPattern index for a renderer to distinguish textured fills from solid', () => {
		// Regression: FillPattern >= 2 (Visio's ~40-entry hatch/dot/texture
		// catalog, not just solid) was collapsed to a plain on/off "has fill"
		// boolean, so any non-solid pattern rendered as flat solid color —
		// found by comparing a real diagram's patterned boxes against Obsidian.
		const result = parseVisioFile(buildFixtureVsdx());
		expect(result.pages[0]!.shapes[0]!.fillPattern).toBe(2);
	});

	it('passes through the raw LinePattern index for a renderer to distinguish dashed/dotted strokes from solid', () => {
		// Regression: same collapse-to-boolean mistake as FillPattern, but for
		// strokes — LinePattern >= 2 (dashed, dotted, dash-dot, ...) rendered as
		// a plain solid line, found by comparing a real diagram (dashed
		// connectors) against Obsidian.
		const result = parseVisioFile(buildFixtureVsdx());
		expect(result.pages[0]!.shapes[0]!.linePattern).toBe(2);
	});

	it('scales TxtWidth (the renderer\'s wrap width) from local inches to px by the same length scale as ArcTo radii', () => {
		// This fixture's shape has no rotation/flip beyond the page's own
		// Y-flip, so length scale === PX_PER_INCH (96) exactly.
		const result = parseVisioFile(buildFixtureVsdx());
		expect(result.pages[0]!.shapes[0]!.textWidth).toBeCloseTo(3 * 96, 5);
	});

	it('reports an error instead of throwing on a corrupt buffer', () => {
		const result = parseVisioFile(new ArrayBuffer(4));
		expect(result.pages).toHaveLength(0);
		expect(result.error).toBeTruthy();
	});
});
