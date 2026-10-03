export function isFullscreen(el: HTMLElement): boolean {
	return el.ownerDocument.fullscreenElement === el;
}

/** Enter or leave native fullscreen for `el` (uses the element's own document, so popout windows work). */
export async function toggleFullscreen(el: HTMLElement): Promise<void> {
	if (isFullscreen(el)) {
		await el.ownerDocument.exitFullscreen();
	} else {
		await el.requestFullscreen();
	}
}
