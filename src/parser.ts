import { inflateRaw } from 'pako';

// ---------------------------------------------------------------------------
// .drawio page model
// ---------------------------------------------------------------------------

export interface DiagramPage {
	name: string;
	id: string;
	xml: string; // mxGraphModel XML string, ready for @maxgraph/core
}

export interface DiagramFile {
	pages: DiagramPage[];
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
let parseCacheValue: DiagramFile | null = null;

export function parseDiagramCached(content: string): DiagramFile {
	if (parseCacheValue && parseCacheKey === content) return parseCacheValue;
	parseCacheValue = parseDiagramFile(content);
	parseCacheKey = content;
	return parseCacheValue;
}

export function parseDiagramFile(content: string): DiagramFile {
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

// ---------------------------------------------------------------------------
// View-options parsing — explicit key=value pairs, e.g.:
//   file=diagram.drawio|page=Overview|height=600|zoom=80|offset=190,34
// ---------------------------------------------------------------------------

export interface ViewOptions {
	filename: string;
	pageIndex: number;    // 0-based, used when pageName is ''
	pageName: string;     // if non-empty, look up page by name (overrides pageIndex)
	zoom: number;         // percentage; 0 = auto-fit
	offsetX: number;
	offsetY: number;
	offsetSpecified: boolean; // true only when offset= was explicitly written in syntax
	height: number;       // container height in px; 0 = use CSS default (400px)
}

const DEFAULTS: Omit<ViewOptions, 'filename'> = {
	pageIndex: 0, pageName: '', zoom: 0, offsetX: 0, offsetY: 0, offsetSpecified: false,
	height: 0,
};

/**
 * Parses the `dv` code block's parameter line — explicit `key=value` pairs,
 * e.g. `file=diagram.drawio|page=Overview|height=600|zoom=80|offset=190,34`.
 *
 * Deliberately NOT shape-sniffed (the previous format guessed a bare token's
 * meaning from what it looked like, e.g. `page-2` → page index, `80%` →
 * zoom): a page can legitimately be *named* "Page-2" or "80" — that's
 * Visio's own default page-naming scheme — and shape-sniffing would silently
 * misfile it as a page index or a zoom level instead of a name lookup.
 * `page=` is therefore always a literal, exact name match; use the separate
 * `page-index=` key (1-based) to select by position when the name is
 * unknown or irrelevant.
 */
export function parseViewParams(paramStr: string): ViewOptions {
	const opts: ViewOptions = { filename: '', ...DEFAULTS };
	if (!paramStr.trim()) return opts;

	for (const raw of paramStr.split(/[|\n\r]+/).map(s => s.trim()).filter(Boolean)) {
		const eq = raw.indexOf('=');
		if (eq === -1) continue; // ignore unrecognised bare tokens
		const key = raw.slice(0, eq).trim().toLowerCase();
		const value = raw.slice(eq + 1).trim();
		if (!value) continue;

		switch (key) {
			case 'file':
				opts.filename = value;
				break;
			case 'page':
				opts.pageName = value;
				break;
			case 'page-index': {
				const n = parseInt(value, 10);
				if (!isNaN(n) && n > 0) opts.pageIndex = n - 1;
				break;
			}
			case 'zoom': {
				const n = parseFloat(value);
				if (!isNaN(n)) opts.zoom = n;
				break;
			}
			case 'height': {
				const n = parseInt(value, 10);
				if (!isNaN(n)) opts.height = n;
				break;
			}
			case 'offset': {
				const m = value.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
				if (m) {
					opts.offsetX = parseFloat(m[1]!);
					opts.offsetY = parseFloat(m[2]!);
					opts.offsetSpecified = true;
				}
				break;
			}
			// Unknown keys are ignored rather than treated as an error — keeps
			// the door open for future format-specific fields without breaking
			// old code blocks.
		}
	}
	return opts;
}
