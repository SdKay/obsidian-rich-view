import { inflateRaw } from 'pako';

// ---------------------------------------------------------------------------
// .drawio page model
// ---------------------------------------------------------------------------

export interface DrawioPage {
	name: string;
	id: string;
	xml: string; // mxGraphModel XML string, ready for @maxgraph/core
}

export interface DrawioFile {
	pages: DrawioPage[];
	/** Set when the XML failed to parse; mirrors the message draw.io's own app shows. */
	error?: string;
}

// ---------------------------------------------------------------------------
// .drawio file parsing
// ---------------------------------------------------------------------------

// Small cache so re-rendering the same file (e.g. after writing view params
// back into the code block) doesn't re-parse the XML.  Keyed by raw content;
// holds only the most recent file to keep memory flat.
let parseCacheKey = '';
let parseCacheValue: DrawioFile | null = null;

export function parseDrawioCached(content: string): DrawioFile {
	if (parseCacheValue && parseCacheKey === content) return parseCacheValue;
	parseCacheValue = parseDrawioFile(content);
	parseCacheKey = content;
	return parseCacheValue;
}

export function parseDrawioFile(content: string): DrawioFile {
	const doc = new DOMParser().parseFromString(content, 'application/xml');
	const parserError = doc.querySelector('parsererror');
	if (parserError) return { pages: [], error: extractParserErrorMessage(parserError) };

	const diagrams = Array.from(doc.querySelectorAll('mxfile > diagram'));
	if (diagrams.length === 0) {
		// Bare mxGraphModel (no mxfile wrapper)
		if (content.includes('<mxGraphModel')) return { pages: [{ name: 'Page', id: '', xml: content }] };
		return { pages: [] };
	}

	return {
		pages: diagrams.map(diagram => {
			const name = diagram.getAttribute('name') ?? 'Page';
			const id = diagram.getAttribute('id') ?? '';

			// Uncompressed: the <diagram> element contains a child <mxGraphModel>.
			// diagram.textContent only returns text nodes (whitespace), not child elements,
			// so we must detect and handle the two cases separately.
			const inlineModel = diagram.querySelector('mxGraphModel');
			if (inlineModel) {
				return { name, id, xml: serializeXml(inlineModel) };
			}

			// Compressed: content is a base64+deflate-encoded string.
			const inner = diagram.textContent?.trim() ?? '';
			const xml = decodeCompressed(inner);
			return { name, id, xml };
		}),
	};
}

// Chromium's <parsererror> textContent embeds the underlying libxml2 message,
// e.g. "This page contains the following errors: error on line 33 at column
// 67: attributes construct error Below is a rendering...". Pull out just the
// "error on line N at column N: ..." fragment so it reads the same as the
// message draw.io's own desktop app shows for the same malformed file.
function extractParserErrorMessage(parserError: Element): string {
	const text = parserError.textContent?.trim() ?? '';
	const match = /error on line \d+ at column \d+:[^\n]*/i.exec(text);
	return match ? match[0].trim() : text;
}

function serializeXml(el: Element): string {
	return new XMLSerializer().serializeToString(el);
}

/** Decode base64+deflateRaw encoded diagram content into an XML string. */
function decodeCompressed(content: string): string {
	if (!content) return '<mxGraphModel/>';
	try {
		const binary = atob(content);
		const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
		return decodeURIComponent(inflateRaw(bytes, { to: 'string' }));
	} catch {
		return content; // fallback: might already be plain XML
	}
}
