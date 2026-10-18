import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createProvider, EXTRACT_VERSION, SEARCH_EXTENSIONS } from '../src/search/provider';

const enc = (s: string) => strToU8(s).buffer as ArrayBuffer;
const drawio = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Alpha" vertex="1" parent="1"/></root></mxGraphModel>`;

const REL_V = 'http://schemas.microsoft.com/visio/2010/relationships';
const relsXml = (items: { id: string; type: string; target: string }[]) =>
	`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('')}</Relationships>`;
const toBuffer = (z: Uint8Array) => z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;

function tinyVsdx(text: string): ArrayBuffer {
	const shape = `<Shape ID='1'><Cell N='PinX' V='2'/><Cell N='PinY' V='2'/><Cell N='Width' V='2'/><Cell N='Height' V='1'/><Cell N='LocPinX' V='1'/><Cell N='LocPinY' V='0.5'/>` +
		`<Section N='Geometry' IX='0'><Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row><Row T='LineTo' IX='2'><Cell N='X' V='2'/><Cell N='Y' V='0'/></Row></Section><Text>${text}</Text></Shape>`;
	return toBuffer(zipSync({
		'_rels/.rels': strToU8(relsXml([{ id: 'rId1', type: `${REL_V}/document`, target: 'visio/document.xml' }])),
		'visio/document.xml': strToU8('<VisioDocument/>'),
		'visio/_rels/document.xml.rels': strToU8(relsXml([{ id: 'rId1', type: `${REL_V}/pages`, target: 'pages/pages.xml' }])),
		'visio/pages/pages.xml': strToU8(`<Pages xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Page ID='0' Name='P'><PageSheet><Cell N='PageWidth' V='10'/><Cell N='PageHeight' V='8'/></PageSheet><Rel r:id='rId1'/></Page></Pages>`),
		'visio/pages/_rels/pages.xml.rels': strToU8(relsXml([{ id: 'rId1', type: `${REL_V}/page`, target: 'page1.xml' }])),
		'visio/pages/page1.xml': strToU8(`<PageContents><Shapes>${shape}</Shapes></PageContents>`),
	}));
}

function tinyPptx(text: string): ArrayBuffer {
	const ns = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
	const slide = `<p:sld ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
		`<p:sp><p:nvSpPr><p:cNvPr id="2" name="S"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
		`<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
	return toBuffer(zipSync({
		'ppt/presentation.xml': strToU8(`<p:presentation ${ns}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`),
		'ppt/_rels/presentation.xml.rels': strToU8(relsXml([{ id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: 'slides/slide1.xml' }])),
		'ppt/slides/slide1.xml': strToU8(slide),
	}));
}

describe('provider object', () => {
	const provider = createProvider(() => true);

	it('declares apiVersion 1, a numeric extractVersion, and lower-case extensions without a dot', () => {
		expect(provider.apiVersion).toBe(1);
		expect(typeof provider.extractVersion).toBe('number');
		expect(provider.extractVersion).toBe(EXTRACT_VERSION);
		expect([...provider.extensions].sort()).toEqual(['drawio', 'pptx', 'vsdx']);
		for (const ext of provider.extensions) expect(ext).toMatch(/^[a-z0-9]+$/);
	});

	it('is version 2: the anchors gained a line number, and a cached result with the old anchors would mark the wrong line', () => {
		expect(provider.extractVersion).toBe(2);
	});

	it('hands each extension to its own extractor', async () => {
		const r = await provider.extract({ path: 'notes/a.drawio', content: enc(drawio) });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.map(l => [l.text, (l.anchor as { cellId: string }).cellId])).toEqual([['Alpha', 'a']]);
	});

	it('routes .vsdx to the Visio extractor: a shape label comes back with {page, shapeId}', async () => {
		const r = await provider.extract({ path: 'a.vsdx', content: tinyVsdx('Visio label') });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value).toEqual([{ text: 'Visio label', location: 'P', anchor: { page: 'P', shapeId: '1', line: 0 } }]);
	});

	it('routes .pptx to the PowerPoint extractor: a text box comes back with {slide, nodeId}', async () => {
		const r = await provider.extract({ path: 'a.pptx', content: tinyPptx('Slide text') });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value).toEqual([{ text: 'Slide text', location: 'Slide 1', anchor: { slide: 1, nodeId: '2', line: 0 } }]);
	});

	it('picks the extractor by extension regardless of case and folders', async () => {
		const r = await provider.extract({ path: 'A.B/C.DRAWIO', content: enc(drawio) });
		expect(r.ok).toBe(true);
	});

	it('returns ok:false, without throwing, for an extension it does not handle', async () => {
		for (const path of ['a.xlsx', 'noext', '']) {
			const r = await provider.extract({ path, content: enc('x') });
			expect(r.ok).toBe(false);
		}
	});

	it('returns ok:false, without throwing, for damaged content of each supported type', async () => {
		for (const path of ['a.drawio', 'a.vsdx', 'a.pptx']) {
			const r = await provider.extract({ path, content: enc('not a real file') });
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
		}
	});

	it('gives deeply equal output for the same bytes', async () => {
		const content = enc(drawio);
		expect(await provider.extract({ path: 'a.drawio', content })).toEqual(await provider.extract({ path: 'a.drawio', content }));
	});

	it('a rich-view block contributes no lines of its own (its file is searched through extract)', async () => {
		expect(provider.blockLanguages).toEqual(['rich-view']);
		const r = await provider.extractBlock!({ path: 'n.md', language: 'rich-view', source: 'file=secret-name.drawio|page=Overview' });
		expect(r).toEqual({ ok: true, value: [] });
	});

	it('does not implement revealBlock (nothing in a block to jump to)', () => {
		expect(provider.revealBlock).toBeUndefined();
	});
});

describe('viewRegistered', () => {
	it('answers per extension from the live registration record', () => {
		const accepted = new Set(['pptx']);
		const provider = createProvider(ext => accepted.has(ext));
		expect(provider.viewRegistered!('pptx')).toBe(true);
		expect(provider.viewRegistered!('drawio')).toBe(false);
		accepted.add('drawio');
		expect(provider.viewRegistered!('drawio')).toBe(true);
	});

	it('is case-insensitive about the extension it is asked about', () => {
		const provider = createProvider(ext => ext === 'pptx');
		expect(provider.viewRegistered!('PPTX')).toBe(true);
	});
});

describe('supported extensions', () => {
	it('exports the same list the provider advertises', () => {
		expect([...SEARCH_EXTENSIONS]).toEqual(createProvider(() => true).extensions);
	});
});
