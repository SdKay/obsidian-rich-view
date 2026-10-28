import { buildOleEmbed } from './visioOle';
import { extractPage } from './visioPagePackage';

/** The clipboard format Office reads to embed an object. Windows registers it by this name. */
export const EMBED_FORMAT = 'Embed Source';

/** Whether the toolbar offers "copy as Visio object": a Visio file, read, on the desktop app (Electron's clipboard is not on mobile). */
export function canCopyVisioObject(state: { isDesktop: boolean; isVisio: boolean; hasBytes: boolean }): boolean {
	return state.isDesktop && state.isVisio && state.hasBytes;
}

/**
 * What to put on the clipboard so that pasting into PowerPoint or Word embeds the page as a Visio drawing that opens
 * in Visio, as copying from Visio does. Only the one page goes in. Null when the page cannot be cut out.
 */
export function buildVisioClipboard(vsdx: Uint8Array, pageIndex: number): { format: string; data: Uint8Array } | null {
	const page = extractPage(vsdx, pageIndex);
	return page ? { format: EMBED_FORMAT, data: buildOleEmbed(page) } : null;
}
