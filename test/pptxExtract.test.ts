import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractPptx, MAX_PPTX_SLIDE_XML_CHARS, MAX_PPTX_TOTAL_XML_CHARS } from '../src/search/pptxExtract';

const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const run = (...texts: string[]) => texts.map(t => `<a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r>`).join('');
/** One text shape. `paragraphs` is a list of paragraphs, each a list of runs. */
const shape = (id: number, paragraphs: string[][]) => `
	<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
	<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
	<p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs.map(p => `<a:p>${run(...p)}</a:p>`).join('')}</p:txBody></p:sp>`;

const slideXml = (shapes: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`;

/** A minimal but valid-enough pptx, built in memory. */
function pptx(slides: string[], extra: Record<string, Uint8Array> = {}): ArrayBuffer {
	const files: Record<string, Uint8Array> = {
		'ppt/presentation.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<p:presentation ${P}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`),
		'ppt/_rels/presentation.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`),
	};
	slides.forEach((s, i) => { files[`ppt/slides/slide${i + 1}.xml`] = strToU8(s); });
	Object.assign(files, extra);
	const z = zipSync(files);
	return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}

const lines = async (buf: ArrayBuffer) => {
	const r = await extractPptx(buf);
	if (!r.ok) throw new Error('expected ok, got: ' + r.error);
	return r.value;
};

describe('extractPptx — text and anchors', () => {
	it('returns a line for a known string, located as "Slide N", anchored by {slide (1-based), nodeId}', async () => {
		const out = await lines(pptx([slideXml(shape(2, [['Hello deck']]))]));
		expect(out).toEqual([{ text: 'Hello deck', location: 'Slide 1', anchor: { slide: 1, nodeId: '2', line: 0 } }]);
	});

	it('gives every paragraph of one text box its own anchor, numbered from 0 in order, so a click can tell them apart', async () => {
		const out = await lines(pptx([slideXml(shape(2, [['first'], ['second'], ['third']]))]));
		expect(out.map(l => (l.anchor as { line: number }).line)).toEqual([0, 1, 2]);
		expect(new Set(out.map(l => JSON.stringify(l.anchor))).size).toBe(3);
	});

	it('does not spend a number on blank paragraphs, so numbering matches what the viewer counts', async () => {
		const out = await lines(pptx([slideXml(shape(2, [['a'], ['   '], [''], ['b']]))]));
		expect(out.map(l => [l.text, (l.anchor as { line: number }).line])).toEqual([['a', 0], ['b', 1]]);
	});

	it('restarts the numbering for each text box', async () => {
		const out = await lines(pptx([slideXml(shape(2, [['x'], ['y']]) + shape(3, [['z']]))]));
		expect(out.map(l => [(l.anchor as { nodeId: string }).nodeId, (l.anchor as { line: number }).line])).toEqual([['2', 0], ['2', 1], ['3', 0]]);
	});

	it('numbers slides from 1 and keeps order across slides', async () => {
		const out = await lines(pptx([slideXml(shape(2, [['first']])), slideXml(shape(2, [['second']])), slideXml(shape(5, [['third']]))]));
		expect(out.map(l => [l.location, l.text])).toEqual([['Slide 1', 'first'], ['Slide 2', 'second'], ['Slide 3', 'third']]);
		expect((out[2]!.anchor as { slide: number }).slide).toBe(3);
	});

	it('gives one line per paragraph within a text box', async () => {
		const out = await lines(pptx([slideXml(shape(2, [['line one'], ['line two']]))]));
		expect(out.map(l => l.text)).toEqual(['line one', 'line two']);
		expect(out.every(l => (l.anchor as { nodeId: string }).nodeId === '2')).toBe(true);
	});

	it('joins the runs of one paragraph into a single line', async () => {
		const out = await lines(pptx([slideXml(shape(2, [['Hel', 'lo ', 'world']]))]));
		expect(out.map(l => l.text)).toEqual(['Hello world']);
	});

	it('drops empty and whitespace-only paragraphs', async () => {
		const out = await lines(pptx([slideXml(shape(2, [[''], ['   '], ['real'], ['']]))]));
		expect(out.map(l => l.text)).toEqual(['real']);
	});

	it('keeps CJK text intact', async () => {
		const out = await lines(pptx([slideXml(shape(2, [['中断向量表生成']]))]));
		expect(out.map(l => l.text)).toEqual(['中断向量表生成']);
	});

	it('returns an empty list, not an error, for a real deck with no text', async () => {
		const r = await extractPptx(pptx([slideXml('')]));
		expect(r).toEqual({ ok: true, value: [] });
	});
});

describe('extractPptx — failures return ok:false and never throw', () => {
	const fail = async (buf: ArrayBuffer) => {
		const r = await extractPptx(buf);
		expect(r.ok).toBe(false);
		return r.ok ? '' : r.error;
	};
	const bytes = (s: string) => strToU8(s).buffer as ArrayBuffer;

	it('empty file', async () => { expect(await fail(new ArrayBuffer(0))).not.toBe(''); });
	it('garbage that is not a zip', async () => { expect(await fail(bytes('this is not a zip file at all'))).not.toBe(''); });
	it('a truncated zip', async () => { expect(await fail(pptx([slideXml(shape(2, [['x']]))]).slice(0, 40))).not.toBe(''); });

	it('a valid zip that is not a presentation (the library alone reports it as an empty deck)', async () => {
		const z = zipSync({ 'word/document.xml': strToU8('<w:document/>') });
		const msg = await fail(z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer);
		expect(msg).toMatch(/PowerPoint|presentation|slides/i);
	});

	it('error messages are short and readable, not raw library internals', async () => {
		for (const buf of [new ArrayBuffer(0), bytes('garbage garbage garbage')]) {
			const r = await extractPptx(buf);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.length).toBeLessThan(120);
				expect(r.error).not.toMatch(/end of central directory|asked index|jszip/i);
			}
		}
	});

	it('refuses a deck that would otherwise read fine but holds an oversized entry (zip bomb)', async () => {
		// A valid one-slide deck with a 64 MB entry: only the zip limit can reject it,
		// not the "no slides" check, so this fails if the limits are not applied.
		const bomb = strToU8('A'.repeat(64 * 1024 * 1024));
		const buf = pptx([slideXml(shape(2, [['x']]))], { 'ppt/media/big.bin': bomb });
		expect(buf.byteLength).toBeLessThan(2 * 1024 * 1024);
		const msg = await fail(buf);
		expect(msg).toMatch(/too large|limit/i);
	});

	it('the same deck without the oversized entry reads fine (so the refusal above is about the entry)', async () => {
		const out = await lines(pptx([slideXml(shape(2, [['x']]))], { 'ppt/media/small.bin': strToU8('A'.repeat(1024)) }));
		expect(out.map(l => l.text)).toEqual(['x']);
	});

	it('refuses an oversized slide up front, quickly, before the library tries to model it', async () => {
		// The library's modelling time grows faster than linearly with a slide's size
		// (measured: 8 000 paragraphs ≈ 1.1 s, 60 000 ≈ over a minute), so the limit must
		// be applied to the raw slide size, not to the number of lines that come back.
		const paragraphs = Math.ceil(MAX_PPTX_SLIDE_XML_CHARS / 40) + 1000; // each <a:p> below is ~40+ chars
		const many = Array.from({ length: paragraphs }, (_, i) => [`t${i}`]);
		const buf = pptx([slideXml(shape(2, many))]);
		const t0 = performance.now();
		const r = await extractPptx(buf);
		const elapsed = performance.now() - t0;
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/too (large|much)|slide/i);
		expect(elapsed).toBeLessThan(2000);
	});

	it('applies a total slide-text limit too, so many individually acceptable slides cannot add up past it', async () => {
		// Pad each slide's XML with an inert comment so it is large without being slow to model.
		const pad = (n: number) => `<!--${'x'.repeat(n)}-->`;
		const eachChars = Math.floor(MAX_PPTX_SLIDE_XML_CHARS * 0.9);
		const count = Math.ceil(MAX_PPTX_TOTAL_XML_CHARS / eachChars) + 2;
		const slide = slideXml(shape(2, [['x']])).replace('</p:sld>', pad(eachChars) + '</p:sld>');
		expect(slide.length).toBeLessThan(MAX_PPTX_SLIDE_XML_CHARS);
		const r = await extractPptx(pptx(Array.from({ length: count }, () => slide)));
		expect(r.ok).toBe(false);
	});

	it('still reads a slide just under the limit', async () => {
		const paragraphs = 1500; // far under the limit; confirms the guard is not a blanket refusal
		const many = Array.from({ length: paragraphs }, (_, i) => [`t${i}`]);
		const out = await lines(pptx([slideXml(shape(2, many))]));
		expect(out.length).toBe(paragraphs);
	});
});

describe('extractPptx — determinism and statelessness', () => {
	it('two calls on the same bytes are deeply equal, including anchors', async () => {
		const buf = pptx([slideXml(shape(2, [['a'], ['b']])), slideXml(shape(3, [['c']]))]);
		expect(await extractPptx(buf)).toEqual(await extractPptx(buf));
	});

	it('does not carry state between decks', async () => {
		const a = await lines(pptx([slideXml(shape(2, [['FIRST']]))]));
		const b = await lines(pptx([slideXml(shape(2, [['SECOND']]))]));
		expect(a[0]!.text).toBe('FIRST');
		expect(b[0]!.text).toBe('SECOND');
	});
});
