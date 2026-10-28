/** The base dictionary: defines every key. Other languages are partial and fall back to this. */
export const en = {
	openExternal: 'Open in external editor',
	autoFit: 'Auto-fit to viewer',
	applyView: 'Pin current view (page, zoom, position) to code block',
	copyAsCodeBlock: 'Copy as code block (current page, zoom, position)',
	copyAsVisioObject: 'Copy as Visio object (paste into PowerPoint or Word)',
	copiedVisioObject: 'Copied the page as a Visio object',
	copiedCodeBlock: 'Copied rich-view code block',
	copyFailed: 'Could not copy to the clipboard',
	editLink: 'Edit link',
	resizeHandle: 'Drag to resize height',
	magnifier: 'Magnifier (+/- to resize, Esc to exit)',
	fullscreen: 'Fullscreen (Esc to exit)',
	switchFile: 'Switch to another file',
	importFile: 'Import file',
	importFilePickerPlaceholder: 'Search .drawio / .vsdx / .pptx files…',
	noDiagramFilesInVault: 'No .drawio, .vsdx or .pptx files found in this vault.',
} as const;

export type StringKey = keyof typeof en;
export type Dictionary = Partial<Record<StringKey, string>>;
