import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseVisioFile } from '../src/visioParser';
import { VisioRenderer } from '../src/visioRenderer';
import {
	extractVisio, MAX_VISIO_ENTRY_BYTES, MAX_VISIO_LINES, MAX_VISIO_PAGE_XML_BYTES, MAX_VISIO_TOTAL_XML_BYTES,
} from '../src/search/visioExtract';

const REL = 'http://schemas.microsoft.com/visio/2010/relationships';
const rels = (items: { id: string; type: string; target: string }[]) =>
	`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
		items.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('')
	}</Relationships>`;

/** A rectangle with geometry, so the parser emits it. `text` goes into <Text> verbatim (may hold entities and \n). */
const box = (id: number, text: string | null, extra = '') =>
	`<Shape ID='${id}'${extra}><Cell N='PinX' V='2'/><Cell N='PinY' V='2'/><Cell N='Width' V='2'/><Cell N='Height' V='1'/>` +
	`<Cell N='LocPinX' V='1'/><Cell N='LocPinY' V='0.5'/><Cell N='TxtWidth' V='2'/>` +
	`<Section N='Geometry' IX='0'><Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>` +
	`<Row T='LineTo' IX='2'><Cell N='X' V='2'/><Cell N='Y' V='0'/></Row><Row T='LineTo' IX='3'><Cell N='X' V='2'/><Cell N='Y' V='1'/></Row>` +
	`<Row T='LineTo' IX='4'><Cell N='X' V='0'/><Cell N='Y' V='1'/></Row></Section>` +
	(text === null ? '' : `<Text>${text}</Text>`) + `</Shape>`;

/** A minimal .vsdx built in memory: one entry per page, each a list of <Shape> strings. */
function vsdx(pages: { name: string; shapes: string[] }[], extra: Record<string, Uint8Array> = {}): ArrayBuffer {
	const files: Record<string, Uint8Array> = {
		'_rels/.rels': strToU8(rels([{ id: 'rId1', type: `${REL}/document`, target: 'visio/document.xml' }])),
		'visio/document.xml': strToU8('<VisioDocument/>'),
		'visio/_rels/document.xml.rels': strToU8(rels([{ id: 'rId1', type: `${REL}/pages`, target: 'pages/pages.xml' }])),
		'visio/pages/pages.xml': strToU8(
			`<Pages xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pages.map((p, i) =>
				`<Page ID='${i}' Name='${p.name}'><PageSheet><Cell N='PageWidth' V='10'/><Cell N='PageHeight' V='8'/></PageSheet><Rel r:id='rId${i + 1}'/></Page>`).join('')}</Pages>`),
		'visio/pages/_rels/pages.xml.rels': strToU8(rels(pages.map((_, i) => ({ id: `rId${i + 1}`, type: `${REL}/page`, target: `page${i + 1}.xml` })))),
	};
	pages.forEach((p, i) => { files[`visio/pages/page${i + 1}.xml`] = strToU8(`<PageContents><Shapes>${p.shapes.join('')}</Shapes></PageContents>`); });
	Object.assign(files, extra);
	const z = zipSync(files);
	return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}

const lines = async (buf: ArrayBuffer) => {
	const r = await extractVisio(buf);
	if (!r.ok) throw new Error('expected ok, got: ' + r.error);
	return r.value;
};

describe('extractVisio — text and anchors', () => {
	it('returns a line for a known string, located by page name, anchored by {page, shapeId}', async () => {
		const out = await lines(vsdx([{ name: 'Overview', shapes: [box(7, 'Hello shape')] }]));
		expect(out).toEqual([{ text: 'Hello shape', location: 'Overview', anchor: { page: 'Overview', shapeId: '7', line: 0 } }]);
	});

	it('covers every page, in order', async () => {
		const out = await lines(vsdx([
			{ name: 'One', shapes: [box(1, 'first')] },
			{ name: 'Two', shapes: [box(1, 'second')] },
		]));
		expect(out.map(l => [l.location, l.text])).toEqual([['One', 'first'], ['Two', 'second']]);
	});

	it('splits a multi-line label into one line per row, all with the same anchor', async () => {
		const out = await lines(vsdx([{ name: 'P', shapes: [box(3, 'top\nbottom')] }]));
		expect(out.map(l => l.text)).toEqual(['top', 'bottom']);
		expect(out.every(l => (l.anchor as { shapeId: string }).shapeId === '3')).toBe(true);
	});

	it('gives each row of one shape its own anchor, and blank rows take no number', async () => {
		const out = await lines(vsdx([{ name: 'P', shapes: [box(3, 'a\n\n  \nb\nc'), box(4, 'z')] }]));
		expect(out.map(l => [(l.anchor as { shapeId: string }).shapeId, (l.anchor as { line: number }).line, l.text])).toEqual([
			['3', 0, 'a'], ['3', 1, 'b'], ['3', 2, 'c'], ['4', 0, 'z'],
		]);
	});

	it('drops blank rows and trims what is left', async () => {
		const out = await lines(vsdx([{ name: 'P', shapes: [box(3, '  a  \n\n   \nb')] }]));
		expect(out.map(l => l.text)).toEqual(['a', 'b']);
	});

	it('decodes XML entities and keeps CJK text intact', async () => {
		const out = await lines(vsdx([{ name: 'P', shapes: [box(4, 'R&amp;D 中断向量表')] }]));
		expect(out.map(l => l.text)).toEqual(['R&D 中断向量表']);
	});

	it('skips shapes with no text', async () => {
		const out = await lines(vsdx([{ name: 'P', shapes: [box(1, null), box(2, 'kept')] }]));
		expect(out.map(l => l.text)).toEqual(['kept']);
	});

	it('returns an empty list, not an error, for a real file with no text', async () => {
		expect(await extractVisio(vsdx([{ name: 'P', shapes: [box(1, null)] }]))).toEqual({ ok: true, value: [] });
	});
});

describe('extractVisio — the search text is what the viewer draws', () => {
	// The viewer is VisioRenderer; stub the Obsidian-only HTMLElement helper it uses.
	function drawn(buf: ArrayBuffer): string[] {
		(globalThis as { createEl?: unknown }).createEl = (tag: string) => document.createElement(tag);
		const container = document.createElement('div') as HTMLElement & { empty: () => void };
		container.empty = () => { container.replaceChildren(); };
		const renderer = new VisioRenderer(container);
		const file = parseVisioFile(buf);
		const out: string[] = [];
		for (const page of file.pages) {
			renderer.load(JSON.stringify(page));
			container.querySelectorAll('tspan').forEach(t => out.push(t.textContent ?? ''));
		}
		return out;
	}
	const squash = (s: string) => s.replace(/\s+/g, '');

	const fixture = () => vsdx([
		{ name: 'A', shapes: [box(1, 'Alpha\nBeta'), box(2, 'R&amp;D'), box(3, '中断向量表生成')] },
		{ name: 'B', shapes: [box(1, 'A fairly long label that the viewer has to wrap inside a narrow box'), box(2, 'path/with/slashes/only')] },
	]);

	it('every row the viewer draws lies inside some extracted line (wrapping only cuts lines, never changes text)', async () => {
		const extracted = (await lines(fixture())).map(l => squash(l.text));
		const rows = drawn(fixture());
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(extracted.some(e => e.includes(squash(row))), `drawn "${row}" is not searchable`).toBe(true);
		}
	});

	it('every extracted line is fully drawn (nothing is searchable that the viewer does not show)', async () => {
		const drawnText = squash(drawn(fixture()).join(''));
		for (const l of await lines(fixture())) {
			expect(drawnText.includes(squash(l.text)), `searchable "${l.text}" is not drawn`).toBe(true);
		}
	});
});

describe('extractVisio — failures return ok:false and never throw', () => {
	const fail = async (buf: ArrayBuffer) => {
		const r = await extractVisio(buf);
		expect(r.ok).toBe(false);
		return r.ok ? '' : r.error;
	};
	const bytes = (s: string) => strToU8(s).buffer as ArrayBuffer;

	it('empty file', async () => { expect(await fail(new ArrayBuffer(0))).not.toBe(''); });
	it('garbage that is not a zip', async () => { expect(await fail(bytes('this is not a zip file at all'))).not.toBe(''); });
	it('a truncated zip', async () => { expect(await fail(vsdx([{ name: 'P', shapes: [box(1, 'x')] }]).slice(0, 40))).not.toBe(''); });

	it('a valid zip that is not a Visio file', async () => {
		const z = zipSync({ 'word/document.xml': strToU8('<w:document/>') });
		expect(await fail(z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer)).not.toBe('');
	});

	it('error messages are short and readable', async () => {
		for (const buf of [new ArrayBuffer(0), bytes('garbage garbage garbage')]) {
			const r = await extractVisio(buf);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.length).toBeLessThan(120);
		}
	});

	it('refuses a file with an absurd number of text lines (one shape, many rows, so the fixture stays cheap)', async () => {
		const rows = Array.from({ length: MAX_VISIO_LINES + 10 }, (_, i) => `t${i}`).join('\n');
		const buf = vsdx([{ name: 'P', shapes: [box(1, rows)] }]);
		expect(buf.byteLength).toBeLessThan(MAX_VISIO_PAGE_XML_BYTES);
		const r = await extractVisio(buf);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/too much/i);
	});

	it('refuses an oversized page up front and quickly, before the parser models its shapes', async () => {
		// Parsing cost grows with shape count (measured in jsdom: 4 000 shapes ≈ 3 s, 8 000 ≈ 9 s),
		// so the limit has to be on the raw page size, not on what comes back.
		const pad = `<!--${'x'.repeat(MAX_VISIO_PAGE_XML_BYTES)}-->`;
		const buf = vsdx([{ name: 'P', shapes: [box(1, 'x'), pad] }]);
		const t0 = performance.now();
		const r = await extractVisio(buf);
		expect(performance.now() - t0).toBeLessThan(2000);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/too (large|much)|page/i);
	});

	it('applies a total page-size limit too, so many acceptable pages cannot add up past it', async () => {
		const each = Math.floor(MAX_VISIO_PAGE_XML_BYTES * 0.9);
		const count = Math.ceil(MAX_VISIO_TOTAL_XML_BYTES / each) + 2;
		const pad = `<!--${'x'.repeat(each)}-->`;
		const pages = Array.from({ length: count }, (_, i) => ({ name: `P${i}`, shapes: [pad] }));
		const r = await extractVisio(vsdx(pages));
		expect(r.ok).toBe(false);
	});

	it('refuses a valid file that holds an oversized entry (zip bomb), and reads the same file without it', async () => {
		// Only the entry-size check can reject this: the Visio content itself is fine.
		const bomb = strToU8('A'.repeat(MAX_VISIO_ENTRY_BYTES + 1024 * 1024));
		const pages = [{ name: 'P', shapes: [box(1, 'x')] }];
		const big = vsdx(pages, { 'visio/media/big.bin': bomb });
		expect(big.byteLength).toBeLessThan(2 * 1024 * 1024);
		const r = await extractVisio(big);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/too large|limit/i);
		expect((await lines(vsdx(pages, { 'visio/media/small.bin': strToU8('A'.repeat(1024)) }))).map(l => l.text)).toEqual(['x']);
	});

	it('still reads a page just under the limit', async () => {
		const out = await lines(vsdx([{ name: 'P', shapes: Array.from({ length: 300 }, (_, i) => box(i + 1, `t${i}`)) }]));
		expect(out.length).toBe(300);
	});
});

describe('extractVisio — determinism and statelessness', () => {
	it('two calls on the same bytes are deeply equal, including anchors', async () => {
		const buf = vsdx([{ name: 'A', shapes: [box(1, 'x\ny'), box(2, 'z')] }, { name: 'B', shapes: [box(1, 'w')] }]);
		expect(await extractVisio(buf)).toEqual(await extractVisio(buf));
	});

	it('does not carry state between files', async () => {
		const a = await lines(vsdx([{ name: 'P', shapes: [box(1, 'FIRST')] }]));
		const b = await lines(vsdx([{ name: 'P', shapes: [box(1, 'SECOND')] }]));
		expect(a[0]!.text).toBe('FIRST');
		expect(b[0]!.text).toBe('SECOND');
	});
});
