import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { replaceMetafiles } from '../src/pptxMetafiles';

/** The smallest EMF Windows would accept: header, one rectangle, end record. */
function tinyEmf(): Uint8Array {
	const out = new Uint8Array(132);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, 1, true); dv.setUint32(4, 88, true);
	dv.setInt32(8, 0, true); dv.setInt32(12, 0, true); dv.setInt32(16, 99, true); dv.setInt32(20, 99, true);
	dv.setInt32(24, 0, true); dv.setInt32(28, 0, true); dv.setInt32(32, 2640, true); dv.setInt32(36, 2640, true);
	dv.setUint32(40, 0x464d4520, true); dv.setUint32(44, 0x10000, true);
	dv.setUint32(48, 132, true); dv.setUint32(52, 3, true); dv.setUint32(56, 1, true);
	dv.setInt32(72, 1920, true); dv.setInt32(76, 1080, true); dv.setInt32(80, 508, true); dv.setInt32(84, 286, true);
	dv.setUint32(88, 43, true); dv.setUint32(92, 24, true);
	dv.setInt32(96, 10, true); dv.setInt32(100, 10, true); dv.setInt32(104, 80, true); dv.setInt32(108, 80, true);
	dv.setUint32(112, 14, true); dv.setUint32(116, 20, true); dv.setUint32(120, 0, true); dv.setUint32(124, 16, true); dv.setUint32(128, 20, true);
	return out;
}

/** The smallest placeable WMF: header, one rectangle, end record. */
function tinyWmf(): Uint8Array {
	const u16 = (v: number) => [v & 255, (v >> 8) & 255];
	const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
	const rect = [...u32(7), ...u16(0x041b), ...u16(80), ...u16(80), ...u16(10), ...u16(10)];
	const end = [...u32(3), ...u16(0)];
	const standard = [...u16(1), ...u16(9), ...u16(0x0300), ...u32((18 + rect.length + end.length) / 2), ...u16(0), ...u32(7), ...u16(0)];
	const placeable = [...u32(0x9ac6cdd7), ...u16(0), ...u16(0), ...u16(0), ...u16(100), ...u16(100), ...u16(96), ...u32(0)];
	let checksum = 0;
	for (let i = 0; i < 20; i += 2) checksum ^= placeable[i]! | (placeable[i + 1]! << 8);
	return Uint8Array.from([...placeable, ...u16(checksum), ...standard, ...rect, ...end]);
}

const CONTENT_TYPES = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="emf" ContentType="image/x-emf"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`;
const rels = (targets: string[]) =>
	`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
		targets.map((t, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${t}"/>`).join('')
	}</Relationships>`;

function deck(parts: Record<string, Uint8Array | string>): Uint8Array {
	const files: Record<string, Uint8Array> = { '[Content_Types].xml': strToU8(CONTENT_TYPES) };
	for (const [name, data] of Object.entries(parts)) files[name] = typeof data === 'string' ? strToU8(data) : data;
	return zipSync(files);
}
const open = (bytes: Uint8Array) => {
	const z = unzipSync(bytes);
	return { names: Object.keys(z).sort(), text: (n: string) => strFromU8(z[n]!), raw: (n: string) => z[n]! };
};
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('replaceMetafiles', () => {
	it('turns an EMF into an SVG file and points the slide at it', async () => {
		const input = deck({
			'ppt/media/image3.emf': tinyEmf(),
			'ppt/slides/_rels/slide2.xml.rels': rels(['../media/image3.emf']),
		});
		const out = open(await replaceMetafiles(input));
		expect(out.names).toContain('ppt/media/image3.svg');
		expect(out.names).not.toContain('ppt/media/image3.emf');
		expect(out.text('ppt/slides/_rels/slide2.xml.rels')).toContain('Target="../media/image3.svg"');
		expect(out.text('ppt/slides/_rels/slide2.xml.rels')).not.toContain('.emf');
		expect(out.text('ppt/media/image3.svg')).toMatch(/^<svg[\s>]/);
	});

	it('declares the SVG content type, once, and leaves the others', async () => {
		const out = open(await replaceMetafiles(deck({
			'ppt/media/a.emf': tinyEmf(), 'ppt/media/b.emf': tinyEmf(),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/a.emf', '../media/b.emf']),
		})));
		const types = out.text('[Content_Types].xml');
		expect(types.match(/Extension="svg"/g)).toHaveLength(1);
		expect(types).toContain('image/svg+xml');
		expect(types).toContain('Extension="png"');
		expect(types).toContain('Extension="emf"');
	});

	it('does not add the SVG type a second time when the deck already has it', async () => {
		const withSvg = CONTENT_TYPES.replace('</Types>', '<Default Extension="svg" ContentType="image/svg+xml"/></Types>');
		const input = zipSync({
			'[Content_Types].xml': strToU8(withSvg), 'ppt/media/a.emf': tinyEmf(),
			'ppt/slides/_rels/slide1.xml.rels': strToU8(rels(['../media/a.emf'])),
		});
		expect(open(await replaceMetafiles(input)).text('[Content_Types].xml').match(/Extension="svg"/g)).toHaveLength(1);
	});

	it('changes every part that refers to the file, not only slides', async () => {
		const out = open(await replaceMetafiles(deck({
			'ppt/media/logo.emf': tinyEmf(),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/logo.emf']),
			'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels(['../media/logo.emf']),
			'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels(['../media/logo.emf']),
		})));
		for (const n of ['ppt/slides/_rels/slide1.xml.rels', 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', 'ppt/slideMasters/_rels/slideMaster1.xml.rels']) {
			expect(out.text(n), n).toContain('logo.svg');
			expect(out.text(n), n).not.toContain('logo.emf');
		}
	});

	it('converts one file used by several slides once and updates them all', async () => {
		const out = open(await replaceMetafiles(deck({
			'ppt/media/shared.emf': tinyEmf(),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/shared.emf']),
			'ppt/slides/_rels/slide2.xml.rels': rels(['../media/shared.emf']),
		})));
		expect(out.names.filter(n => n.endsWith('.svg'))).toEqual(['ppt/media/shared.svg']);
		expect(out.text('ppt/slides/_rels/slide1.xml.rels')).toContain('shared.svg');
		expect(out.text('ppt/slides/_rels/slide2.xml.rels')).toContain('shared.svg');
	});

	it('matches the extension without regard to case', async () => {
		const out = open(await replaceMetafiles(deck({
			'ppt/media/Image1.EMF': tinyEmf(),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/Image1.EMF']),
		})));
		expect(out.names).toContain('ppt/media/Image1.svg');
		expect(out.text('ppt/slides/_rels/slide1.xml.rels')).toContain('Image1.svg');
	});

	it('converts a WMF the same way as an EMF', async () => {
		const out = open(await replaceMetafiles(deck({
			'ppt/media/old.wmf': tinyWmf(),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/old.wmf']),
		})));
		expect(out.names).toContain('ppt/media/old.svg');
		expect(out.names).not.toContain('ppt/media/old.wmf');
		expect(out.text('ppt/slides/_rels/slide1.xml.rels')).toContain('Target="../media/old.svg"');
		expect(out.text('ppt/media/old.svg')).toMatch(/^<svg[\s>]/);
	});

	it('handles a deck that mixes EMF and WMF', async () => {
		const out = open(await replaceMetafiles(deck({
			'ppt/media/a.emf': tinyEmf(), 'ppt/media/b.wmf': tinyWmf(),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/a.emf', '../media/b.wmf']),
		})));
		expect(out.names.filter(n => n.endsWith('.svg')).sort()).toEqual(['ppt/media/a.svg', 'ppt/media/b.svg']);
	});

	it('only converts pictures in the media folder', async () => {
		const stray = tinyEmf();
		const out = open(await replaceMetafiles(deck({
			'ppt/media/a.emf': tinyEmf(), 'ppt/embeddings/oleObject1.emf': stray,
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/a.emf', '../embeddings/oleObject1.emf']),
		})));
		expect(out.names).toContain('ppt/embeddings/oleObject1.emf');
		expect(out.names).not.toContain('ppt/embeddings/oleObject1.svg');
		expect(out.text('ppt/slides/_rels/slide1.xml.rels')).toContain('../embeddings/oleObject1.emf');
	});

	it('does not rename a target just because a converted file has the same name', async () => {
		const out = open(await replaceMetafiles(deck({
			'ppt/media/a.emf': tinyEmf(),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/a.emf']).replace('</Relationships>',
				'<Relationship Id="rX" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/a.xml" TargetMode="External"/></Relationships>'),
		})));
		expect(out.text('ppt/slides/_rels/slide1.xml.rels')).toContain('Target="https://example.com/a.xml"');
	});

	it('leaves other pictures, and the slide text, exactly as they were', async () => {
		const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
		const out = open(await replaceMetafiles(deck({
			'ppt/media/a.emf': tinyEmf(), 'ppt/media/p.png': png,
			'ppt/slides/slide1.xml': '<p:sld>mentions a.emf in text</p:sld>',
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/a.emf', '../media/p.png']),
		})));
		expect(same(out.raw('ppt/media/p.png'), png)).toBe(true);
		expect(out.text('ppt/slides/slide1.xml')).toBe('<p:sld>mentions a.emf in text</p:sld>');
		expect(out.text('ppt/slides/_rels/slide1.xml.rels')).toContain('../media/p.png');
	});

	it('does not touch a file whose name only contains the name of a metafile', async () => {
		const out = open(await replaceMetafiles(deck({
			'ppt/media/a.emf': tinyEmf(), 'ppt/media/data.emf.png': new Uint8Array([1, 2]),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/a.emf', '../media/data.emf.png']),
		})));
		expect(out.text('ppt/slides/_rels/slide1.xml.rels')).toContain('../media/data.emf.png');
		expect(out.names).toContain('ppt/media/data.emf.png');
	});

	it('keeps a metafile it cannot convert, and leaves the slide pointing at it', async () => {
		const out = open(await replaceMetafiles(deck({
			'ppt/media/bad.emf': new Uint8Array([1, 2, 3, 4]), 'ppt/media/ok.emf': tinyEmf(),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/bad.emf', '../media/ok.emf']),
		})));
		expect(out.names).toContain('ppt/media/bad.emf');
		expect(out.names).toContain('ppt/media/ok.svg');
		const r = out.text('ppt/slides/_rels/slide1.xml.rels');
		expect(r).toContain('../media/bad.emf');
		expect(r).toContain('../media/ok.svg');
	});

	it('does not replace a metafile with an SVG that already has that name', async () => {
		const existing = '<svg xmlns="http://www.w3.org/2000/svg"><!--mine--></svg>';
		const out = open(await replaceMetafiles(deck({
			'ppt/media/a.emf': tinyEmf(), 'ppt/media/a.svg': existing,
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/a.emf', '../media/a.svg']),
		})));
		expect(out.text('ppt/media/a.svg')).toBe(existing);
		expect(out.names).toContain('ppt/media/a.emf');
		expect(out.text('ppt/slides/_rels/slide1.xml.rels')).toContain('../media/a.emf');
	});

	it('returns the very same bytes when the deck has no metafile', async () => {
		const input = deck({ 'ppt/media/p.png': new Uint8Array([1, 2, 3]), 'ppt/slides/_rels/slide1.xml.rels': rels(['../media/p.png']) });
		expect(await replaceMetafiles(input)).toBe(input);
	});

	it('returns the input when it is not a zip, so the viewer can say what is wrong', async () => {
		const junk = new Uint8Array([1, 2, 3, 4, 5]);
		expect(await replaceMetafiles(junk)).toBe(junk);
	});

	it('returns the input when every metafile fails, rather than a rewritten copy of it', async () => {
		const input = deck({
			'ppt/media/bad.emf': new Uint8Array([9, 9, 9]),
			'ppt/slides/_rels/slide1.xml.rels': rels(['../media/bad.emf']),
		});
		expect(await replaceMetafiles(input)).toBe(input);
	});

	it('does not modify the array it was given', async () => {
		const input = deck({ 'ppt/media/a.emf': tinyEmf(), 'ppt/slides/_rels/slide1.xml.rels': rels(['../media/a.emf']) });
		const copy = input.slice();
		await replaceMetafiles(input);
		expect(same(input, copy)).toBe(true);
	});

	it('refuses a metafile bigger than the limit instead of converting it', async () => {
		const big = new Uint8Array(tinyEmf().length);
		big.set(tinyEmf());
		const input = deck({ 'ppt/media/a.emf': big, 'ppt/slides/_rels/slide1.xml.rels': rels(['../media/a.emf']) });
		const out = open(await replaceMetafiles(input, { maxMetafileBytes: 100 }));
		expect(out.names).toContain('ppt/media/a.emf');
		expect(out.names).not.toContain('ppt/media/a.svg');
	});
});
