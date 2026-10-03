/** The base dictionary: defines every key. Other languages are partial and fall back to this. */
export const en = {
	openExternal: 'Open in external editor',
	autoFit: 'Auto-fit to viewer',
	applyView: 'Pin current view (page, zoom, position) to code block',
	editLink: 'Edit link',
	resizeHandle: 'Drag to resize height',
	magnifier: 'Magnifier (+/- to resize, Esc to exit)',
	fullscreen: 'Fullscreen (Esc to exit)',
	switchFile: 'Switch to another file',
	importFile: 'Import file',
	importFilePickerPlaceholder: 'Search .drawio / .vsdx files…',
	noDiagramFilesInVault: 'No .drawio or .vsdx files found in this vault.',
} as const;

export type StringKey = keyof typeof en;
export type Dictionary = Partial<Record<StringKey, string>>;
