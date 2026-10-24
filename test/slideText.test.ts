import { strToU8, zipSync } from 'fflate';
import { buildPresentation, buildTextIndex, parseZip, PptxViewer, type TextIndexEntry } from '@aiden0z/pptx-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import { findShapeElement, paragraphPieces } from '../src/slideText';
import { slideUnits } from '../src/slideMarks';
import { spansInPieces } from '../src/textRanges';

const ns = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const run = (t: string) => `<a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r>`;
const para = (runs: string[], ppr = '') => `<a:p>${ppr}${runs.map(run).join('')}</a:p>`;
const sp = (id: number, paras: string, x = 0, y = 0, w = 3000000, h = 400000) =>
	`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="S"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
const slide = (shapes: string) => `<p:sld ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`;

function deck(shapes: string): ArrayBuffer {
	const z = zipSync({
		'ppt/presentation.xml': strToU8(`<p:presentation ${ns}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`),
		'ppt/_rels/presentation.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/slide" Target="slides/slide1.xml"/></Relationships>`),
		'ppt/slides/slide1.xml': strToU8(slide(shapes)),
	});
	return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}

let viewer: PptxViewer | null = null;
afterEach(() => { viewer?.destroy(); viewer = null; document.body.replaceChildren(); });

async function render(shapes: string) {
	const buf = deck(shapes);
	const index = buildTextIndex(buildPresentation(await parseZip(buf)), { includeShapes: true, includeTables: true, includeGroups: true });
	const host = document.createElement('div');
	document.body.appendChild(host);
	viewer = await PptxViewer.open(buf, host, { renderMode: 'slide', fitMode: 'none' });
	await viewer.goToSlide(0);
	return { host, index };
}
const entryOf = (index: TextIndexEntry[], id: string) => index.find(e => e.nodeId === id)!;
const paragraphsOf = (e: TextIndexEntry) => e.text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

describe('findShapeElement', () => {
	it('finds each text box by the slide-space box the index reports', async () => {
		const { host, index } = await render(sp(2, para(['first']), 0, 0) + sp(3, para(['second']), 914400, 1371600));
		expect(findShapeElement(host, entryOf(index, '2'))?.textContent).toBe('first');
		expect(findShapeElement(host, entryOf(index, '3'))?.textContent).toBe('second');
	});
	it('tells shapes apart that differ in only one of x, y, width or height', async () => {
		const shapes =
			sp(2, para(['base']), 0, 0, 3000000, 400000) +
			sp(3, para(['moved-x']), 914400, 0, 3000000, 400000) +
			sp(4, para(['moved-y']), 0, 1371600, 3000000, 400000) +
			sp(5, para(['wider']), 0, 0, 4000000, 400000) +
			sp(6, para(['taller']), 0, 0, 3000000, 900000);
		const { host, index } = await render(shapes);
		const text = (id: string) => findShapeElement(host, entryOf(index, id))?.textContent;
		expect(text('3')).toBe('moved-x');
		expect(text('4')).toBe('moved-y');
		expect(text('5')).toBe('wider');
		expect(text('6')).toBe('taller');
		expect(text('2')).toBe('base');
	});
	it('does not take a plain container div that happens to share the box for a text box', async () => {
		const { host, index } = await render(sp(2, para(['real'])));
		const fake = document.createElement('div');
		const real = findShapeElement(host, entryOf(index, '2'))!;
		for (const k of ['left', 'top', 'width', 'height'] as const) fake.style[k] = real.style[k];
		fake.textContent = 'impostor';
		real.parentElement!.appendChild(fake);
		expect(findShapeElement(host, entryOf(index, '2'))?.textContent).toBe('real');
	});
	it('returns null instead of guessing when two shapes sit in exactly the same place', async () => {
		const { host, index } = await render(sp(2, para(['under']), 0, 0) + sp(3, para(['over']), 0, 0));
		expect(findShapeElement(host, entryOf(index, '2'))).toBeNull();
	});
	it('returns null when nothing fits', async () => {
		const { host, index } = await render(sp(2, para(['x'])));
		const moved = { ...entryOf(index, '2'), bounds: { x: 500, y: 500, w: 10, h: 10 } } as TextIndexEntry;
		expect(findShapeElement(host, moved)).toBeNull();
	});
});

describe('paragraphPieces', () => {
	it('splits a paragraph into one piece per run, in order, and spells the searchable text', async () => {
		const { host, index } = await render(sp(2, para(['Hello ', 'wor', 'ld again'])));
		const e = entryOf(index, '2');
		const pieces = paragraphPieces(findShapeElement(host, e)!, paragraphsOf(e))!;
		expect(pieces.length).toBe(1);
		expect(pieces[0]!.map(p => p.text)).toEqual(['Hello ', 'wor', 'ld again']);
		expect(pieces[0]!.every(p => p.counts)).toBe(true);
	});
	it('gives one list per paragraph', async () => {
		const { host, index } = await render(sp(2, para(['plain one']) + para(['plain two'])));
		const e = entryOf(index, '2');
		const pieces = paragraphPieces(findShapeElement(host, e)!, paragraphsOf(e))!;
		expect(pieces.map(p => p.map(x => x.text).join(''))).toEqual(['plain one', 'plain two']);
	});
	it('marks a bullet as decoration so it does not shift offsets', async () => {
		const bullet = '<a:pPr marL="342900" indent="-342900"><a:buChar char="•"/></a:pPr>';
		const { host, index } = await render(sp(2, para(['bullet text'], bullet)));
		const e = entryOf(index, '2');
		const pieces = paragraphPieces(findShapeElement(host, e)!, paragraphsOf(e))!;
		expect(pieces[0]!.map(p => [p.text, p.counts])).toEqual([['• ', false], ['bullet text', true]]);
	});
	it('ignores empty text nodes, which would otherwise shift which piece is which', async () => {
		const { host, index } = await render(sp(2, para(['abc', 'def'])));
		const e = entryOf(index, '2');
		const el = findShapeElement(host, e)!;
		const span = el.querySelector('span')!;
		span.insertBefore(document.createTextNode(''), span.firstChild);
		const pieces = paragraphPieces(el, paragraphsOf(e))![0]!;
		expect(pieces.map(p => p.text)).toEqual(['abc', 'def']);
	});
	it('returns null for a shape with no text container', () => {
		const empty = document.createElement('div');
		expect(paragraphPieces(empty, ['x'])).toBeNull();
	});
	it('rejects a shape that has more or fewer paragraphs than the searchable text, without throwing', async () => {
		const { host, index } = await render(sp(2, para(['one']) + para(['two']) + para(['three'])));
		const el = findShapeElement(host, entryOf(index, '2'))!;
		expect(paragraphPieces(el, ['one', 'two'])).toBeNull();
		expect(paragraphPieces(el, ['one', 'two', 'three', 'four'])).toBeNull();
		expect(paragraphPieces(el, [])).toBeNull();
	});
	it('gives null for only the paragraph whose drawn text differs, and keeps the others usable', async () => {
		const { host, index } = await render(sp(2, para(['one']) + para(['two']) + para(['three'])));
		const el = findShapeElement(host, entryOf(index, '2'))!;
		const result = paragraphPieces(el, ['one', 'something else', 'three'])!;
		expect(result.map(r => r === null)).toEqual([false, true, false]);
		expect(result[2]!.map(p => p.text).join('')).toBe('three');
	});
	it('accepts a paragraph the library drew with trailing spaces that the searchable text has trimmed away', async () => {
		const { host, index } = await render(sp(2, para(['Integrity      ']) + para(['next'])));
		const el = findShapeElement(host, entryOf(index, '2'))!;
		const result = paragraphPieces(el, ['Integrity', 'next'])!;
		expect(result[0]).not.toBeNull();
		expect(result[1]).not.toBeNull();
	});
	it('accepts leading spaces too, and shifts offsets so the match still lands on the right characters', async () => {
		const { host, index } = await render(sp(2, para(['   indented word'])));
		const el = findShapeElement(host, entryOf(index, '2'))!;
		const pieces = paragraphPieces(el, ['indented word'])![0]!;
		const start = 'indented word'.indexOf('word');
		const spans = spansInPieces(pieces, start, start + 4);
		// Ranges are built on the node, so the blanks trimmed from the front are added back.
		expect(spans.map(x => pieces[x.piece]!.text.slice(pieces[x.piece]!.skipStart + x.start, pieces[x.piece]!.skipStart + x.end))).toEqual(['word']);
	});
	it('keeps CJK text whole', async () => {
		const { host, index } = await render(sp(2, para(['中断向量表生成'])));
		const e = entryOf(index, '2');
		expect(paragraphPieces(findShapeElement(host, e)!, paragraphsOf(e))![0]!.map(p => p.text)).toEqual(['中断向量表生成']);
	});
});

describe('end to end: a keyword spread over runs lands on the right characters', () => {
	it('"world" in "Hello " + "wor" + "ld again" covers wor and ld', async () => {
		const { host, index } = await render(sp(2, para(['Hello ', 'wor', 'ld again'])));
		const e = entryOf(index, '2');
		const unit = slideUnits(index, 0)[0]!;
		expect(unit.text).toBe('Hello world again');
		const pieces = paragraphPieces(findShapeElement(host, e)!, paragraphsOf(e))![0]!;
		const start = unit.text.indexOf('world');
		const spans = spansInPieces(pieces, start, start + 5);
		expect(spans.map(s => [pieces[s.piece]!.text.slice(s.start, s.end)])).toEqual([['wor'], ['ld']]);
	});
});

describe('the shape of a real deck: bullet span, many runs, trailing spaces', () => {
	it('a keyword spread over several runs is placed exactly, next to a paragraph with trailing spaces', async () => {
		const bullet = '<a:pPr marL="342900" indent="-342900"><a:buChar char="•"/></a:pPr>';
		const { host, index } = await render(sp(2,
			para(['Integrity      ']) +
			para(['EAPOL‑Key ', '报文在 ', '4‑Way ', '握手中用 ', 'KCK ', 'MIC'], bullet),
		));
		const e = entryOf(index, '2');
		const paras = paragraphsOf(e);
		const result = paragraphPieces(findShapeElement(host, e)!, paras)!;
		expect(result.every(r => r !== null)).toBe(true);
		const start = paras[1]!.indexOf('4‑Way 握手中');
		const pieces = result[1]!;
		const spans = spansInPieces(pieces, start, start + '4‑Way 握手中'.length);
		expect(spans.map(x => pieces[x.piece]!.text.slice(pieces[x.piece]!.skipStart + x.start, pieces[x.piece]!.skipStart + x.end)).join('|')).toBe('4‑Way |握手中');
	});
});
