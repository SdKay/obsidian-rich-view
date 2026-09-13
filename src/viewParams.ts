// ---------------------------------------------------------------------------
// View-options parsing — explicit key=value pairs, e.g.:
//   file=diagram.drawio|page=Overview|height=600|zoom=80|offset=190,34
//
// Format-neutral: every diagram format's code block (drawio, Visio, ...)
// shares this exact param syntax and parser. Kept in its own module,
// separate from any format-specific file (drawioParser.ts, visioParser.ts),
// specifically so it's obvious at a glance that nothing here is drawio- or
// Visio-specific.
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
 * Parses the `rich-view` code block's parameter line — explicit `key=value`
 * pairs, e.g. `file=diagram.drawio|page=Overview|height=600|zoom=80|offset=190,34`.
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
