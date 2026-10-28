import { describe, expect, it } from 'vitest';
import { buildOleEmbed, VISIO_CLSID, visioCompObj } from '../src/visioOle';
import { OleReader } from './oleReader';

/** Deterministic non-compressible-looking bytes, so a wrong offset shows up as a wrong value. */
const bytesOf = (n: number, seed = 7): Uint8Array => {
	const out = new Uint8Array(n);
	let x = seed;
	for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; out[i] = x >>> 16; }
	return out;
};
const read = (vsdx: Uint8Array) => new OleReader(buildOleEmbed(vsdx));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('buildOleEmbed: what Office reads from the clipboard format "Embed Source"', () => {
	it('starts with the OLE compound file signature and is a whole number of 512-byte sectors', () => {
		const out = buildOleEmbed(bytesOf(9000));
		expect(Array.from(out.subarray(0, 8))).toEqual([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
		expect(out.length % 512).toBe(0);
	});
	it('holds the package as the stream "Package", byte for byte', () => {
		const vsdx = bytesOf(19248);
		expect(same(read(vsdx).stream('Package'), vsdx)).toBe(true);
	});
	it('holds the class description as the stream "\\x01CompObj"', () => {
		expect(same(read(bytesOf(5000)).stream('\x01CompObj'), visioCompObj())).toBe(true);
	});
	it('names the Visio drawing class on the root entry, which is how Office finds Visio to open it', () => {
		expect(read(bytesOf(5000)).entries[0]!.clsid).toBe('151a020000000000c000000000000046');
		expect(VISIO_CLSID).toBe('00021a15-0000-0000-c000-000000000046');
	});
	it('has exactly a root, the package and the class description', () => {
		const r = read(bytesOf(5000));
		expect(r.entries.filter(e => e.type !== 0).map(e => e.name).sort()).toEqual(['\x01CompObj', 'Package', 'Root Entry'].sort());
	});
	it('does not put the path of the user\'s machine anywhere in the output', () => {
		const text = new TextDecoder('latin1').decode(buildOleEmbed(bytesOf(6000)));
		expect(text).not.toMatch(/[A-Za-z]:\\/);
		expect(text).not.toContain('Users');
	});
	it('gives the same bytes for the same input, so a copy is reproducible', () => {
		const vsdx = bytesOf(7000);
		expect(same(buildOleEmbed(vsdx), buildOleEmbed(vsdx))).toBe(true);
	});
	it('does not modify the array it was given', () => {
		const vsdx = bytesOf(4100);
		const copy = vsdx.slice();
		buildOleEmbed(vsdx);
		expect(same(vsdx, copy)).toBe(true);
	});
});

describe('buildOleEmbed: sizes around every boundary the format has', () => {
	// 4096 is where a stream moves from the mini stream to ordinary sectors; one FAT sector describes 128 sectors,
	// including the FAT's own, so the sizes around 64 KB and 128 KB are where another FAT sector is needed.
	const sizes = [0, 1, 511, 512, 513, 4095, 4096, 4097, 8192, 19248, 63999, 64000, 64001, 64512, 65024, 65535, 65536, 65537, 66000,
		129023, 129024, 129025, 129535, 129536, 129537, 130560, 131072, 200000, 1_000_000];
	for (const n of sizes) {
		it(`round-trips ${n} bytes with every used sector accounted for`, () => {
			const vsdx = bytesOf(n, n + 1);
			const r = read(vsdx);
			expect(same(r.stream('Package'), vsdx)).toBe(true);
			expect(r.usedSectorsAreAccountedFor()).toBe(true);
			expect(same(r.stream('\x01CompObj'), visioCompObj())).toBe(true);
		});
	}
});

describe('buildOleEmbed: the same layout Visio writes', () => {
	it('uses version 3 with 512-byte sectors and 64-byte mini sectors, as Visio\'s own do', () => {
		const r = read(bytesOf(19248));
		expect(r.sectorSize).toBe(512);
		expect(r.miniSectorSize).toBe(64);
		expect(r.miniCutoff).toBe(4096);
	});
});

describe('visioCompObj', () => {
	it('begins with the OLE 1 header and names the class, the clipboard format and the ProgID', () => {
		const c = visioCompObj();
		expect(Array.from(c.subarray(0, 4))).toEqual([0x01, 0x00, 0xfe, 0xff]);
		const text = new TextDecoder('latin1').decode(c);
		expect(text).toContain('Visio.Drawing.15');
		expect(text).toContain('Visio 15.0 Shapes');
	});
});
