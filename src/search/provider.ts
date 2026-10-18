import type { ExtractResult, RichSearchProvider } from '../richSearchApi';
import { extractDrawio } from './drawioExtract';
import { extractPptx } from './pptxExtract';
import { extractVisio } from './visioExtract';

/**
 * Bump whenever any extractor would return different output for the same bytes
 * (text rules, anchors, limits); rich-search drops its cache entries for a new value.
 */
export const EXTRACT_VERSION = 2;

type Extractor = (content: ArrayBuffer) => Promise<ExtractResult>;

const EXTRACTORS: Readonly<Record<string, Extractor>> = {
	drawio: extractDrawio,
	vsdx: extractVisio,
	pptx: extractPptx,
};

export const SEARCH_EXTENSIONS: readonly string[] = Object.keys(EXTRACTORS);

function extensionOf(path: string): string {
	const dot = path.lastIndexOf('.');
	return dot < 0 ? '' : path.slice(dot + 1).toLowerCase();
}

/**
 * `viewRegistered` answers per extension from the plugin's live registration record,
 * so it stays true to what Obsidian actually accepted.
 */
export function createProvider(isViewRegistered: (ext: string) => boolean): RichSearchProvider {
	return {
		apiVersion: 1,
		extensions: [...SEARCH_EXTENSIONS],
		extractVersion: EXTRACT_VERSION,
		async extract(file) {
			const extractor = EXTRACTORS[extensionOf(file.path)];
			if (!extractor) return { ok: false, error: 'Not a file type Rich View can read' };
			try {
				return await extractor(file.content);
			} catch (err) {
				return { ok: false, error: err instanceof Error && err.message.length < 100 ? err.message : 'Could not read the file' };
			}
		},
		viewRegistered: ext => isViewRegistered(ext.toLowerCase()),
		// A `rich-view` block only names a file and view parameters; the file itself is searched through
		// extract(), so the block contributes no lines of its own.
		blockLanguages: ['rich-view'],
		extractBlock: () => Promise.resolve({ ok: true, value: [] }),
	};
}
