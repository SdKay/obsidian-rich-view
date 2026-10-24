import { describe, expect, it } from 'vitest';
import { extractDrawio } from '../src/search/drawioExtract';
import { strToU8, zipSync } from 'fflate';
import { extractVisio } from '../src/search/visioExtract';
import { parseVisioFile } from '../src/visioParser';
import type { DrawioPage } from '../src/drawioParser';
import type { VisioPage, VisioShape } from '../src/visioParser';
import { drawioPageUnits, pageOfAnchor, shapeIdOfAnchor, visioPageUnits } from '../src/pageUnits';

const REL_V = 'http://schemas.microsoft.com/visio/2010/relationships';
const relsXml = (items: { id: string; type: string; target: string }[]) =>
	`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('')}</Relationships>`;
function tinyVsdx(text: string): ArrayBuffer {
	const shape = `<Shape ID='1'><Cell N='PinX' V='2'/><Cell N='PinY' V='2'/><Cell N='Width' V='2'/><Cell N='Height' V='1'/><Cell N='LocPinX' V='1'/><Cell N='LocPinY' V='0.5'/>` +
		`<Section N='Geometry' IX='0'><Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row><Row T='LineTo' IX='2'><Cell N='X' V='2'/><Cell N='Y' V='0'/></Row></Section><Text>${text}</Text></Shape>`;
	const z = zipSync({
		'_rels/.rels': strToU8(relsXml([{ id: 'rId1', type: `${REL_V}/document`, target: 'visio/document.xml' }])),
		'visio/document.xml': strToU8('<VisioDocument/>'),
		'visio/_rels/document.xml.rels': strToU8(relsXml([{ id: 'rId1', type: `${REL_V}/pages`, target: 'pages/pages.xml' }])),
		'visio/pages/pages.xml': strToU8(`<Pages xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Page ID='0' Name='P'><PageSheet><Cell N='PageWidth' V='10'/><Cell N='PageHeight' V='8'/></PageSheet><Rel r:id='rId1'/></Page></Pages>`),
		'visio/pages/_rels/pages.xml.rels': strToU8(relsXml([{ id: 'rId1', type: `${REL_V}/page`, target: 'page1.xml' }])),
		'visio/pages/page1.xml': strToU8(`<PageContents><Shapes>${shape}</Shapes></PageContents>`),
	});
	return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}

const drawioPage = (cells: string): DrawioPage => ({
	name: 'Overview', id: 'd1',
	xml: `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`,
});
const cell = (id: string, value: string) => `<mxCell id="${id}" value="${value}" vertex="1" parent="1"/>`;

describe('drawioPageUnits', () => {
	it('gives one unit per label line, each with the {page, cellId} anchor extract uses', () => {
		const units = drawioPageUnits(drawioPage(cell('a', 'Alpha') + cell('b', 'x&lt;br&gt;y') + cell('e', '')));
		expect(units).toEqual([
			{ anchor: { page: 'Overview', cellId: 'a', line: 0 }, text: 'Alpha' },
			{ anchor: { page: 'Overview', cellId: 'b', line: 0 }, text: 'x' },
			{ anchor: { page: 'Overview', cellId: 'b', line: 1 }, text: 'y' },
		]);
	});

	it('reads a UserObject-wrapped label once', () => {
		const wrapped = '<UserObject label="Linked" link="n" id="u1"><mxCell value="stale" vertex="1" parent="1"/></UserObject>';
		expect(drawioPageUnits(drawioPage(wrapped)).map(u => u.text)).toEqual(['Linked']);
	});

	it('matches what extract returns for the same page, line for line (text and anchor)', async () => {
		const page = drawioPage(cell('a', 'Alpha') + cell('b', 'R&amp;amp;D&lt;br&gt;two') + cell('c', '&lt;b&gt;Bold&lt;/b&gt;'));
		const file = `<mxfile><diagram name="${page.name}" id="d1">${page.xml}</diagram></mxfile>`;
		const r = await extractDrawio(new TextEncoder().encode(file).buffer as ArrayBuffer);
		expect(r.ok).toBe(true);
		if (r.ok) expect(drawioPageUnits(page)).toEqual(r.value.map(l => ({ anchor: l.anchor, text: l.text })));
	});
});

const vshape = (id: string, text: string): VisioShape => ({
	id, subpaths: [], fillPattern: 1, linePattern: 1, strokeWidth: 1, text, textX: 0, textY: 0, textWidth: 10, fontSize: 12,
	bbox: { x: 0, y: 0, width: 10, height: 10 },
});

describe('visioPageUnits', () => {
	it('gives one unit per non-blank row, anchored {page, shapeId}', () => {
		const page: VisioPage = { id: '0', name: 'P', width: 1, height: 1, shapes: [vshape('1', ' top \n\nbottom'), vshape('2', ''), vshape('3', 'solo')] };
		expect(visioPageUnits(page)).toEqual([
			{ anchor: { page: 'P', shapeId: '1', line: 0 }, text: 'top' },
			{ anchor: { page: 'P', shapeId: '1', line: 1 }, text: 'bottom' },
			{ anchor: { page: 'P', shapeId: '3', line: 0 }, text: 'solo' },
		]);
	});

	it('matches what extract returns for a real .vsdx, line for line (text and anchor)', async () => {
		const buf = tinyVsdx('top\nbottom &amp; more');
		const file = parseVisioFile(buf);
		const r = await extractVisio(buf);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.length).toBeGreaterThan(1);
			expect(file.pages.flatMap(visioPageUnits)).toEqual(r.value.map(l => ({ anchor: l.anchor, text: l.text })));
		}
	});
});

describe('anchor readers', () => {
	it('reads the shape id from either anchor shape', () => {
		expect(shapeIdOfAnchor({ page: 'P', cellId: 'c1' })).toBe('c1');
		expect(shapeIdOfAnchor({ page: 'P', shapeId: 's1' })).toBe('s1');
	});
	it('returns null for anything that is not one of ours', () => {
		for (const bad of [null, undefined, 5, 'x', {}, { cellId: 3 }, { shapeId: null }]) expect(shapeIdOfAnchor(bad)).toBeNull();
	});
	it('reads the page name, and only a string', () => {
		expect(pageOfAnchor({ page: 'Page-2', cellId: 'c' })).toBe('Page-2');
		for (const bad of [null, undefined, 5, {}, { page: 2 }, { slide: 1 }]) expect(pageOfAnchor(bad)).toBeNull();
	});
});
