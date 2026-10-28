/**
 * The one place that reaches for Electron. Obsidian resolves it only through a plain synchronous require(): a
 * dynamic import() fails in the desktop app. Only call from code paths guarded by `Platform.isDesktop`.
 */
interface ElectronClipboard {
	clear(): void;
	writeBuffer(format: string, buffer: Uint8Array): void;
}

/** Replaces the clipboard with a single custom-format entry. A second write would clear the first, so one format only. */
export function writeClipboardFormat(format: string, data: Uint8Array): void {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- a dynamic import() does not resolve in Obsidian's desktop runtime
	const mod = require('electron') as unknown as { clipboard: ElectronClipboard };
	mod.clipboard.clear();
	mod.clipboard.writeBuffer(format, data);
}
