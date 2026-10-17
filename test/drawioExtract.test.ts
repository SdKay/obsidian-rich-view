import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractDrawio, MAX_DRAWIO_DECODED_BYTES, MAX_DRAWIO_LINES } from '../src/search/drawioExtract';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

/** What draw.io's own "compressed" option writes: URL-encode, deflate-raw, base64. */
const compress = (xml: string) => deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64');

const model = (cells: string) => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const cell = (id: string, value: string) => `<mxCell id="${id}" value="${value}" vertex="1" parent="1"/>`;
const file = (...pages: { name: string; body: string }[]) =>
	`<mxfile>${pages.map(p => `<diagram name="${p.name}" id="d-${p.name}">${p.body}</diagram>`).join('')}</mxfile>`;

const lines = async (xml: string) => {
	const r = await extractDrawio(enc(xml));
	if (!r.ok) throw new Error('expected ok, got: ' + r.error);
	return r.value;
};

describe('extractDrawio — text and anchors', () => {
	it('returns one line per labelled cell with page name as location and {page, cellId} as anchor', async () => {
		const out = await lines(file({ name: 'Overview', body: model(cell('a1', 'Alpha') + cell('a2', 'Beta')) }));
		expect(out).toEqual([
			{ text: 'Alpha', location: 'Overview', anchor: { page: 'Overview', cellId: 'a1', line: 0 } },
			{ text: 'Beta', location: 'Overview', anchor: { page: 'Overview', cellId: 'a2', line: 0 } },
		]);
	});

	it('gives each line of one label its own anchor, numbered from 0, restarting for the next cell', async () => {
		const out = await lines(file({ name: 'P', body: model(cell('a', 'one&lt;br&gt;two&lt;br&gt;three') + cell('b', 'solo')) }));
		expect(out.map(l => [(l.anchor as { cellId: string }).cellId, (l.anchor as { line: number }).line, l.text])).toEqual([
			['a', 0, 'one'], ['a', 1, 'two'], ['a', 2, 'three'], ['b', 0, 'solo'],
		]);
	});

	it('covers every page, in order', async () => {
		const out = await lines(file(
			{ name: 'One', body: model(cell('x', 'first')) },
			{ name: 'Two', body: model(cell('y', 'second')) },
		));
		expect(out.map(l => [l.location, l.text])).toEqual([['One', 'first'], ['Two', 'second']]);
	});

	it('reads the label of a UserObject-wrapped cell (the shape draw.io writes once a link is set)', async () => {
		// The inner mxCell carries a value too (draw.io can leave one behind); only the UserObject's label may count.
		const wrapped = '<UserObject label="Linked box" link="notes/x" id="u1"><mxCell value="stale inner" vertex="1" parent="1"/></UserObject>';
		const out = await lines(file({ name: 'P', body: model(wrapped) }));
		expect(out).toEqual([{ text: 'Linked box', location: 'P', anchor: { page: 'P', cellId: 'u1', line: 0 } }]);
	});

	it('skips cells with an empty label', async () => {
		const out = await lines(file({ name: 'P', body: model(cell('e', '') + cell('k', 'kept')) }));
		expect(out.map(l => l.text)).toEqual(['kept']);
	});

	it('reads a bare mxGraphModel with no mxfile wrapper', async () => {
		const out = await lines(model(cell('c', 'bare')));
		expect(out.map(l => l.text)).toEqual(['bare']);
	});
});

describe('extractDrawio — compressed diagrams', () => {
	it('finds a label inside a deflate-compressed diagram and never returns the payload', async () => {
		const body = compress(model(cell('c1', 'Hidden in compression')));
		const out = await lines(file({ name: 'P', body }));
		expect(out.map(l => l.text)).toEqual(['Hidden in compression']);
		for (const l of out) {
			expect(l.text).not.toContain(body.slice(0, 40));
			expect(l.text).not.toMatch(/[A-Za-z0-9+/=]{60,}/);
		}
	});

	it('refuses a corrupt compressed page instead of returning its payload as text', async () => {
		const junk = 'Zm9vYmFyYmF6cXV4cXV1eHF1dXh0aGlzaXNub3RkZWZsYXRlZGF0YWF0YWxs'; // valid base64, not deflate data
		const r = await extractDrawio(enc(file({ name: 'P', body: junk })));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toMatch(/damaged|unpacked|compressed/i);
			expect(r.error).not.toContain(junk.slice(0, 20));
		}
	});

	it('refuses compressed content that is not even base64', async () => {
		const r = await extractDrawio(enc(file({ name: 'P', body: '!!! not base64 !!!' })));
		expect(r.ok).toBe(false);
	});
});

describe('extractDrawio — HTML labels', () => {
	it('strips tags, decodes entities, and splits on <br> into separate lines', async () => {
		const label = '&lt;b&gt;Bold&lt;/b&gt; &amp;amp; plain&lt;br&gt;second line';
		const out = await lines(file({ name: 'P', body: model(cell('h', label)) }));
		expect(out.map(l => l.text)).toEqual(['Bold & plain', 'second line']);
		expect(out.every(l => (l.anchor as { cellId: string }).cellId === 'h')).toBe(true);
	});

	it('treats <br/>, <br /> and <div> boundaries as line breaks', async () => {
		const label = 'a&lt;br/&gt;b&lt;br /&gt;c&lt;div&gt;d&lt;/div&gt;';
		const out = await lines(file({ name: 'P', body: model(cell('h', label)) }));
		expect(out.map(l => l.text)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('turns &nbsp; into an ordinary space, so a search with a normal space still matches', async () => {
		const out = await lines(file({ name: 'P', body: model(cell('h', 'a&amp;nbsp;b')) }));
		expect(out.map(l => l.text)).toEqual(['a b']);
		expect(out[0]!.text).not.toContain('\u00a0');
	});

	it('drops blank lines produced by stripping', async () => {
		const out = await lines(file({ name: 'P', body: model(cell('h', '&lt;br&gt;&lt;br&gt;only')) }));
		expect(out.map(l => l.text)).toEqual(['only']);
	});

	it('does not execute or keep script content from a label', async () => {
		const out = await lines(file({ name: 'P', body: model(cell('h', '&lt;script&gt;alert(1)&lt;/script&gt;safe')) }));
		expect(out.map(l => l.text).join('|')).not.toContain('<');
		expect(out.map(l => l.text).join('|')).toContain('safe');
	});
});

describe('extractDrawio — failures return ok:false and never throw', () => {
	const fail = async (buf: ArrayBuffer) => {
		const r = await extractDrawio(buf);
		expect(r.ok).toBe(false);
		return r.ok ? '' : r.error;
	};

	it('empty file', async () => { expect(await fail(new ArrayBuffer(0))).not.toBe(''); });
	it('not XML at all', async () => { expect(await fail(enc('this is not xml <<<'))).not.toBe(''); });
	it('truncated XML', async () => { expect(await fail(enc('<mxfile><diagram name="p"><mxGraphModel><root>'))).not.toBe(''); });
	it('XML that is not a draw.io file', async () => { expect(await fail(enc('<html><body>hi</body></html>'))).not.toBe(''); });

	it('a deflate bomb in a <diagram> is refused, with a readable reason', async () => {
		const bomb = compress('<mxGraphModel>' + 'x'.repeat(MAX_DRAWIO_DECODED_BYTES + 1024 * 1024) + '</mxGraphModel>');
		expect(bomb.length).toBeLessThan(200 * 1024); // small on disk, large when inflated
		const msg = await fail(enc(file({ name: 'P', body: bomb })));
		expect(msg).toMatch(/large|limit|MB/i);
	});

	it('applies the decoded-size limit to the whole file, not to each page separately', async () => {
		// Each page alone is under the limit; together they are over it.
		const half = 'y'.repeat(Math.floor(MAX_DRAWIO_DECODED_BYTES * 0.6));
		const page = (n: string) => ({ name: n, body: compress('<mxGraphModel>' + half + '</mxGraphModel>') });
		const r = await extractDrawio(enc(file(page('A'), page('B'))));
		expect(r.ok).toBe(false);
		const single = await extractDrawio(enc(file(page('A'))));
		expect(single.ok).toBe(true);
	});

	it('refuses a file with an absurd number of text lines (one cell with many rows, so the fixture stays cheap)', async () => {
		const rows = Array.from({ length: MAX_DRAWIO_LINES + 10 }, (_, i) => 't' + i).join('&lt;br&gt;');
		const r = await extractDrawio(enc(file({ name: 'P', body: model(cell('c', rows)) })));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/too much/i);
	});
});

describe('extractDrawio — determinism', () => {
	it('two calls on the same bytes are deeply equal, including anchors', async () => {
		const bytes = enc(file(
			{ name: 'A', body: model(cell('1', 'x&lt;br&gt;y')) },
			{ name: 'B', body: compress(model(cell('2', 'z'))) },
		));
		expect(await extractDrawio(bytes)).toEqual(await extractDrawio(bytes));
	});

	it('does not carry state between files (no module-level cache)', async () => {
		const a = await lines(file({ name: 'P', body: model(cell('a', 'FIRST')) }));
		const b = await lines(file({ name: 'P', body: model(cell('a', 'SECOND')) }));
		expect(a[0]!.text).toBe('FIRST');
		expect(b[0]!.text).toBe('SECOND');
	});
});
