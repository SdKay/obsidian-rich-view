import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractPage } from '../src/visioPagePackage';

const VISIO = 'http://schemas.microsoft.com/visio/2010/relationships/page';
const rels = (items: { id: string; target: string }[]) =>
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
		items.map(r => `<Relationship Id="${r.id}" Type="${VISIO}" Target="${r.target}"/>`).join('')
	}</Relationships>`;

/**
 * A three-page package. The pages are listed in pages.xml as A, B, C, but the relationships are shuffled and the
 * files are numbered 3, 1, 2 — so a reader that guesses file names from positions picks the wrong page.
 */
function threePages(extraParts: Record<string, string> = {}): Uint8Array {
	const page = (id: string, name: string, rid: string) =>
		`<Page ID='${id}' NameU='${name}' Name='${name}'><PageSheet><Cell N='PageWidth' V='4'/></PageSheet><Rel r:id='${rid}'/></Page>`;
	const files: Record<string, Uint8Array> = {
		'[Content_Types].xml': strToU8(
			`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
			`<Default Extension="emf" ContentType="image/x-emf"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
			`<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>` +
			`<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>` +
			`<Override PartName="/visio/pages/page2.xml" ContentType="application/vnd.ms-visio.page+xml"/>` +
			`<Override PartName="/visio/pages/page3.xml" ContentType="application/vnd.ms-visio.page+xml"/>` +
			`<Override PartName="/visio/masters/master1.xml" ContentType="application/vnd.ms-visio.master+xml"/></Types>`),
		'_rels/.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumbnail.emf"/></Relationships>`),
		'docProps/thumbnail.emf': strToU8('EMF-THUMBNAIL-OF-PAGE-A'),
		'visio/document.xml': strToU8('<VisioDocument/>'),
		'visio/masters/master1.xml': strToU8('<MasterContents/>'),
		'visio/pages/pages.xml': strToU8(
			`<?xml version="1.0"?><Pages xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships'>` +
			page('0', 'Alpha', 'rId7') + page('4', 'Beta', 'rId9') + page('5', 'Gamma', 'rId8') + `</Pages>`),
		'visio/pages/_rels/pages.xml.rels': strToU8(rels([
			{ id: 'rId8', target: 'page2.xml' }, { id: 'rId7', target: 'page3.xml' }, { id: 'rId9', target: 'page1.xml' },
		])),
		'visio/pages/page3.xml': strToU8('<PageContents><Shapes><Shape ID="1" Name="in-Alpha"/></Shapes></PageContents>'),
		'visio/pages/page1.xml': strToU8('<PageContents><Shapes><Shape ID="1" Name="in-Beta"/></Shapes></PageContents>'),
		'visio/pages/page2.xml': strToU8('<PageContents><Shapes><Shape ID="1" Name="in-Gamma"/></Shapes></PageContents>'),
		'visio/pages/_rels/page1.xml.rels': strToU8('<Relationships/>'),
		'visio/pages/_rels/page2.xml.rels': strToU8('<Relationships/>'),
		'visio/pages/_rels/page3.xml.rels': strToU8('<Relationships/>'),
	};
	for (const [k, v] of Object.entries(extraParts)) files[k] = strToU8(v);
	return zipSync(files);
}

const read = (bytes: Uint8Array) => {
	const z = unzipSync(bytes);
	return { names: Object.keys(z).sort(), text: (n: string) => strFromU8(z[n]!) };
};

describe('extractPage: a package holding only one page of a Visio file', () => {
	it('keeps the page asked for, found through the relationships and not by file number', () => {
		const out = read(extractPage(threePages(), 0)!);
		expect(out.names.filter(n => /^visio\/pages\/page\d+\.xml$/.test(n))).toEqual(['visio/pages/page3.xml']);   // Alpha lives in page3.xml
		expect(out.text('visio/pages/page3.xml')).toContain('in-Alpha');
	});
	it('picks the second and third page by their position in pages.xml', () => {
		const beta = read(extractPage(threePages(), 1)!);
		expect(beta.names.filter(n => /^visio\/pages\/page\d+\.xml$/.test(n))).toEqual(['visio/pages/page1.xml']);
		expect(beta.text('visio/pages/page1.xml')).toContain('in-Beta');
		const gamma = read(extractPage(threePages(), 2)!);
		expect(gamma.text('visio/pages/page2.xml')).toContain('in-Gamma');
	});
	it('lists only that page in pages.xml, keeping its own id and name', () => {
		const out = read(extractPage(threePages(), 1)!);
		const pagesXml = out.text('visio/pages/pages.xml');
		expect(pagesXml.match(/<Page /g)).toHaveLength(1);
		expect(pagesXml).toMatch(/NameU=["']Beta["']/);
		expect(pagesXml).toMatch(/\bID=["']4["']/);
		expect(pagesXml).not.toContain('Alpha');
		expect(pagesXml).not.toContain('Gamma');
	});
	it('keeps one relationship for that page, and the Rel inside the page pointing at it', () => {
		const out = read(extractPage(threePages(), 1)!);
		const relsXml = out.text('visio/pages/_rels/pages.xml.rels');
		expect(relsXml.match(/<Relationship /g)).toHaveLength(1);
		expect(relsXml).toContain('Target="page1.xml"');
		const rid = /Id="([^"]+)"/.exec(relsXml)![1];
		expect(out.text('visio/pages/pages.xml')).toMatch(new RegExp(`r:id=["']${rid}["']`));
	});
	it('removes the other pages and their relationship files', () => {
		const out = read(extractPage(threePages(), 1)!);
		expect(out.names).not.toContain('visio/pages/page2.xml');
		expect(out.names).not.toContain('visio/pages/page3.xml');
		expect(out.names).not.toContain('visio/pages/_rels/page2.xml.rels');
		expect(out.names).not.toContain('visio/pages/_rels/page3.xml.rels');
		expect(out.names).toContain('visio/pages/_rels/page1.xml.rels');
	});
	it('drops the content-type entries of the removed pages and keeps the others', () => {
		const types = read(extractPage(threePages(), 1)!).text('[Content_Types].xml');
		expect(types).toContain('/visio/pages/page1.xml');
		expect(types).not.toContain('/visio/pages/page2.xml');
		expect(types).not.toContain('/visio/pages/page3.xml');
		expect(types).toContain('/visio/masters/master1.xml');
		expect(types).toContain('/visio/pages/pages.xml');
	});
	it('leaves the document, the masters and other parts as they were', () => {
		const out = read(extractPage(threePages({ 'visio/extra.xml': '<x/>' }), 2)!);
		expect(out.text('visio/document.xml')).toBe('<VisioDocument/>');
		expect(out.text('visio/masters/master1.xml')).toBe('<MasterContents/>');
		expect(out.text('visio/extra.xml')).toBe('<x/>');
	});
	it('drops the thumbnail of the first page, which would be wrong for any page, and its relationship', () => {
		const out = read(extractPage(threePages(), 1)!);
		expect(out.names).not.toContain('docProps/thumbnail.emf');
		expect(out.text('_rels/.rels')).not.toContain('thumbnail');
		expect(out.text('_rels/.rels')).toContain('visio/document.xml');
	});
	it('gives a package that can be read again, with its page still the one asked for', () => {
		const once = extractPage(threePages(), 2)!;
		const again = read(extractPage(once, 0)!);
		expect(again.text('visio/pages/page2.xml')).toContain('in-Gamma');
	});
	it('does not modify the bytes it was given', () => {
		const input = threePages();
		const copy = input.slice();
		extractPage(input, 1);
		expect(Array.from(input)).toEqual(Array.from(copy));
	});
});

describe('extractPage: input it cannot use', () => {
	it('returns null for a page index past the end, or below zero', () => {
		expect(extractPage(threePages(), 3)).toBeNull();
		expect(extractPage(threePages(), -1)).toBeNull();
	});
	it('returns null for bytes that are not a zip', () => {
		expect(extractPage(new Uint8Array([1, 2, 3, 4]), 0)).toBeNull();
	});
	it('returns null for a zip that is not a Visio file', () => {
		expect(extractPage(zipSync({ 'hello.txt': strToU8('hi') }), 0)).toBeNull();
	});
	it('returns null when the page listed has no relationship to a file', () => {
		const broken = zipSync({ ...unzipSync(threePages()), 'visio/pages/_rels/pages.xml.rels': strToU8(rels([])) });
		expect(extractPage(broken, 0)).toBeNull();
	});
	it('returns null when the relationship points at a file that is missing', () => {
		const files = unzipSync(threePages());
		delete files['visio/pages/page3.xml'];
		expect(extractPage(zipSync(files), 0)).toBeNull();
	});
});

describe('extractPage: a file with a single page', () => {
	it('keeps its page and drops page files nothing refers to', () => {
		const one = zipSync({
			...unzipSync(threePages()),
			'visio/pages/pages.xml': strToU8(`<Pages xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships'><Page ID='0' NameU='Only' Name='Only'><Rel r:id='rId1'/></Page></Pages>`),
			'visio/pages/_rels/pages.xml.rels': strToU8(rels([{ id: 'rId1', target: 'page3.xml' }])),
		});
		const out = read(extractPage(one, 0)!);
		expect(out.names.filter(n => /^visio\/pages\/page\d+\.xml$/.test(n))).toEqual(['visio/pages/page3.xml']);
		expect(out.text('visio/pages/pages.xml')).toMatch(/NameU=["']Only["']/);
	});
});
