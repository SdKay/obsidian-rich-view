import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildVisioClipboard, canCopyVisioObject } from '../src/copyVisioObject';
import { OleReader } from './oleReader';

const VISIO = 'http://schemas.microsoft.com/visio/2010/relationships/page';
function twoPages(): Uint8Array {
	return zipSync({
		'[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/visio/pages/pages.xml" ContentType="x"/><Override PartName="/visio/pages/page1.xml" ContentType="x"/><Override PartName="/visio/pages/page2.xml" ContentType="x"/></Types>'),
		'_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
		'visio/pages/pages.xml': strToU8(`<Pages xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Page ID="0" NameU="A"><Rel r:id="rId1"/></Page><Page ID="1" NameU="B"><Rel r:id="rId2"/></Page></Pages>`),
		'visio/pages/_rels/pages.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${VISIO}" Target="page1.xml"/><Relationship Id="rId2" Type="${VISIO}" Target="page2.xml"/></Relationships>`),
		'visio/pages/page1.xml': strToU8('<PageContents>page-A</PageContents>'),
		'visio/pages/page2.xml': strToU8('<PageContents>page-B</PageContents>'),
	});
}

describe('canCopyVisioObject: whether the toolbar offers "copy as Visio object"', () => {
	it('is offered for a Visio file on the desktop app', () => {
		expect(canCopyVisioObject({ isDesktop: true, isVisio: true, hasBytes: true })).toBe(true);
	});
	it('is not offered on mobile, where Electron\'s clipboard does not exist', () => {
		expect(canCopyVisioObject({ isDesktop: false, isVisio: true, hasBytes: true })).toBe(false);
	});
	it('is not offered for a draw.io file, which Visio cannot open as an object', () => {
		expect(canCopyVisioObject({ isDesktop: true, isVisio: false, hasBytes: true })).toBe(false);
	});
	it('is not offered before the file has been read', () => {
		expect(canCopyVisioObject({ isDesktop: true, isVisio: true, hasBytes: false })).toBe(false);
	});
});

describe('buildVisioClipboard: the bytes written for the clipboard format "Embed Source"', () => {
	it('names the format Office reads', () => {
		expect(buildVisioClipboard(twoPages(), 0)!.format).toBe('Embed Source');
	});
	it('is an OLE file whose Package is a Visio file holding only the chosen page', () => {
		const clip = buildVisioClipboard(twoPages(), 1)!;
		const ole = new OleReader(clip.data);
		const pkg = unzipSync(ole.stream('Package'));
		expect(strFromU8(pkg['visio/pages/page2.xml']!)).toContain('page-B');
		expect(pkg['visio/pages/page1.xml']).toBeUndefined();
	});
	it('uses the Visio drawing class, so Office opens it in Visio', () => {
		const ole = new OleReader(buildVisioClipboard(twoPages(), 0)!.data);
		expect(ole.entries[0]!.clsid).toBe('151a020000000000c000000000000046');
	});
	it('is null when the page does not exist, so nothing is put on the clipboard', () => {
		expect(buildVisioClipboard(twoPages(), 5)).toBeNull();
	});
	it('is null for bytes that are not a Visio file', () => {
		expect(buildVisioClipboard(new Uint8Array([1, 2, 3]), 0)).toBeNull();
	});
	it('carries nothing that names the user\'s machine', () => {
		const text = new TextDecoder('latin1').decode(buildVisioClipboard(twoPages(), 0)!.data);
		expect(text).not.toMatch(/[A-Za-z]:\\/);
	});
});
