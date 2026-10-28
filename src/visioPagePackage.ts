import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

const PAGES = 'visio/pages/pages.xml';
const PAGES_RELS = 'visio/pages/_rels/pages.xml.rels';
const CONTENT_TYPES = '[Content_Types].xml';
const ROOT_RELS = '_rels/.rels';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const parse = (text: string) => new DOMParser().parseFromString(text, 'application/xml');
const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc);

/**
 * A copy of a Visio package that holds only the page at `pageIndex` (its position in pages.xml), as Visio puts only
 * the selected page on the clipboard. The page is found through the relationships, never by file number: real files
 * number their pages in a different order from the one they list them in. Null when the bytes are not a Visio
 * package, the index is out of range, or the page's file cannot be found.
 */
export function extractPage(vsdx: Uint8Array, pageIndex: number): Uint8Array | null {
	let files: Record<string, Uint8Array>;
	try { files = unzipSync(vsdx); } catch { return null; }
	if (!files[PAGES] || !files[PAGES_RELS] || !files[CONTENT_TYPES]) return null;

	const pagesDoc = parse(strFromU8(files[PAGES]));
	const pageEls = Array.from(pagesDoc.documentElement.children).filter(c => c.localName === 'Page');
	const wanted = pageEls[pageIndex];
	if (pageIndex < 0 || !wanted) return null;

	const rel = Array.from(wanted.children).find(c => c.localName === 'Rel');
	const rid = rel?.getAttributeNS(R_NS, 'id') ?? rel?.getAttribute('r:id');
	if (!rid) return null;

	const relsDoc = parse(strFromU8(files[PAGES_RELS]));
	const relationships = Array.from(relsDoc.documentElement.children).filter(c => c.localName === 'Relationship');
	const target = relationships.find(r => r.getAttribute('Id') === rid)?.getAttribute('Target');
	if (!target) return null;
	const keepPath = `visio/pages/${target}`;
	if (!files[keepPath]) return null;

	const removed = new Set<string>();
	for (const r of relationships) {
		const t = r.getAttribute('Target');
		if (!t || t === target) continue;
		removed.add(`visio/pages/${t}`);
		removed.add(`visio/pages/_rels/${t}.rels`);
		r.parentNode?.removeChild(r);
	}
	for (const p of pageEls) if (p !== wanted) p.parentNode?.removeChild(p);

	const typesDoc = parse(strFromU8(files[CONTENT_TYPES]));
	for (const o of Array.from(typesDoc.documentElement.children)) {
		if (o.localName === 'Override' && removed.has((o.getAttribute('PartName') ?? '').replace(/^\//, ''))) o.parentNode?.removeChild(o);
	}

	// The thumbnail shows the first page; it would be wrong for any other, and nothing needs it.
	const thumbnails = new Set<string>();
	let rootRels = files[ROOT_RELS];
	if (rootRels) {
		const rootDoc = parse(strFromU8(rootRels));
		for (const r of Array.from(rootDoc.documentElement.children)) {
			if (r.localName === 'Relationship' && /thumbnail/i.test(r.getAttribute('Type') ?? '')) {
				thumbnails.add((r.getAttribute('Target') ?? '').replace(/^\//, ''));
				r.parentNode?.removeChild(r);
			}
		}
		rootRels = strToU8(serialize(rootDoc));
	}

	// Any other page file is dropped, listed or not: what is copied out must not carry the content of other pages.
	const isPageFile = (name: string) => /^visio\/pages\/(_rels\/)?page\d+\.xml(\.rels)?$/.test(name);
	const keep = new Set([keepPath, `visio/pages/_rels/${target}.rels`]);
	const out: Zippable = {};
	for (const [name, data] of Object.entries(files)) {
		if (removed.has(name) || thumbnails.has(name) || (isPageFile(name) && !keep.has(name))) continue;
		out[name] = data;
	}
	out[PAGES] = strToU8(serialize(pagesDoc));
	out[PAGES_RELS] = strToU8(serialize(relsDoc));
	out[CONTENT_TYPES] = strToU8(serialize(typesDoc));
	if (rootRels) out[ROOT_RELS] = rootRels;
	return zipSync(out);
}
