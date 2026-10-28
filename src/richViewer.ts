import { App, Component, Notice, TFile } from 'obsidian';
import { blockHeight, formatCodeBlock } from './codeBlockText';
import { buildVisioClipboard } from './copyVisioObject';
import { writeClipboardFormat } from './nodeBridge';
import { isFullscreen } from './frame/fullscreen';
import { t } from './i18n';
import type { ViewOptions } from './viewParams';
import type { SearchRequest } from './searchRequest';
import { contentCache, contentEquals, isBinaryDiagramFormat, type FileContent } from './diagramFileContent';

/** Delay before reloading after the viewed file changes on disk, so a burst of saves reloads once. */
const RELOAD_DEBOUNCE_MS = 400;

/** What the plugin hands every viewer, whatever its file format. */
export interface ViewerContext {
	app: App;
	/** The element the viewer owns and draws into. */
	container: HTMLElement;
	options: ViewOptions;
	/** Vault-relative path of the note that contains this code block. */
	sourcePath: string;
	/** Rewrites this code block's param line. Null when the block can't be written back. */
	writeParams: ((newParams: string) => Promise<void>) | null;
}

/**
 * Lifecycle shared by every file-type viewer (the `Rich*` layer): resolve the
 * file, paint from the content cache without a blank flash, verify against
 * disk, and reload when the file changes. A subclass supplies the format
 * itself through three hooks and never touches file reading or debouncing.
 */
export abstract class RichViewer extends Component {
	protected readonly app: App;
	protected readonly container: HTMLElement;
	protected readonly options: ViewOptions;
	protected readonly sourcePath: string;
	protected readonly writeParams: ((newParams: string) => Promise<void>) | null;

	/**
	 * Set in onunload(). Fire-and-forget async chains (file reload debounce,
	 * downloads) can still be in flight when the component unloads — this
	 * flag lets them bail out instead of touching stale DOM or constructing
	 * objects that would never be destroyed.
	 */
	protected unloaded = false;
	private reloadTimer = 0;
	private ready = false;
	private readonly readyListeners: (() => void)[] = [];

	constructor(ctx: ViewerContext) {
		super();
		this.app = ctx.app;
		this.container = ctx.container;
		this.options = ctx.options;
		this.sourcePath = ctx.sourcePath;
		this.writeParams = ctx.writeParams;
	}

	// ── Hooks a format implements ───────────────────────────────────────────

	/** Whether this file must be read as binary (ZIP/OOXML containers) rather than text. */
	protected isBinary(file: TFile): boolean {
		return isBinaryDiagramFormat(file);
	}

	/** (Re)build the whole view from freshly read file content. */
	protected abstract renderContent(content: FileContent): void;

	/**
	 * Try to apply changed content in place, keeping the user's view. Return
	 * true if handled; false falls back to a full `renderContent`.
	 */
	protected softReload(_content: FileContent): Promise<boolean> {
		return Promise.resolve(false);
	}

	/** Release everything the format created (renderers, child components). */
	protected abstract teardown(): void;

	/** Show a hit handed over by Rich Search. Formats that can mark or jump override this; the default ignores it. */
	showSearchRequest(_request: SearchRequest): void {}

	/** Called by a format once its first draw is done; `onReady` fires then, and at once if that already happened. */
	protected markReady(): void {
		this.ready = true;
		this.readyListeners.splice(0).forEach(listener => { listener(); });
	}

	/** Runs `listener` when the viewer can accept a search request. A viewer that never becomes ready never calls it. */
	whenReady(listener: () => void): void {
		if (this.ready) listener();
		else this.readyListeners.push(listener);
	}

	// ── Lifecycle ───────────────────────────────────────────────────────────

	onload(): void {
		void this.initAndLoad();
	}

	onunload(): void {
		this.unloaded = true;
		window.clearTimeout(this.reloadTimer);
		this.teardown();
	}

	protected showError(message: string): void {
		this.container.createDiv({ cls: 'drawing-view-error', text: message });
	}

	/** Open the file in the system's default app (e.g. draw.io desktop, PowerPoint). */
	protected openExternal(): void {
		// openWithDefaultApp is a runtime-only method not exposed in Obsidian's types.
		(this.app as unknown as { openWithDefaultApp(p: string): Promise<void> })
			.openWithDefaultApp(this.options.filename)
			.catch((err: unknown) => console.error('RichViewer open:', err));
	}

	/** The `height=` a copied block gets: as tall as the viewer is on screen now, so zoom and offset still fit. */
	protected heightForCopy(): number {
		return blockHeight({
			measured: this.container.getBoundingClientRect().height,
			fullscreen: isFullscreen(this.container),
			configured: this.options.height,
		});
	}

	/** Put one page of a Visio file on the clipboard as an embeddable object, as copying in Visio does. Desktop only. */
	protected copyAsVisioObject(vsdx: Uint8Array, pageIndex: number): void {
		const clip = buildVisioClipboard(vsdx, pageIndex);
		if (!clip) { new Notice(t('copyFailed')); return; }
		try {
			writeClipboardFormat(clip.format, clip.data);
			new Notice(t('copiedVisioObject'));
		} catch (err) {
			console.error('RichViewer copy Visio object:', err);
			new Notice(t('copyFailed'));
		}
	}

	/** Put a `rich-view` code block for `params` on the clipboard; works in a note and in a file tab alike. */
	protected copyAsCodeBlock(params: string): void {
		// The window this viewer is in, so a popout window writes to its own clipboard.
		this.container.win.navigator.clipboard.writeText(formatCodeBlock(params))
			.then(() => { new Notice(t('copiedCodeBlock')); })
			.catch((err: unknown) => {
				console.error('RichViewer copy:', err);
				new Notice(t('copyFailed'));
			});
	}

	protected resolveFile(filename: string): TFile | null {
		// main.ts already resolved this to a vault-absolute path; a direct lookup
		// avoids iterating all files (which is slow on large vaults).
		const f = this.app.vault.getAbstractFileByPath(filename);
		if (f instanceof TFile) return f;
		// Last-resort link resolution for a bare name.
		const linked = this.app.metadataCache.getFirstLinkpathDest(filename, '');
		return linked instanceof TFile ? linked : null;
	}

	private readContent(file: TFile): Promise<FileContent> {
		return this.isBinary(file) ? this.app.vault.readBinary(file) : this.app.vault.read(file);
	}

	private async initAndLoad(): Promise<void> {
		const file = this.resolveFile(this.options.filename);
		if (!file) {
			this.showError(`File not found: ${this.options.filename}`);
			return;
		}

		const cached = contentCache.get(file.path);
		if (cached !== undefined) this.renderContent(cached);
		void this.verifyAndRender(file, cached);

		this.registerEvent(
			this.app.vault.on('modify', changed => {
				if (!(changed instanceof TFile) || changed.path !== file.path) return;
				window.clearTimeout(this.reloadTimer);
				this.reloadTimer = window.setTimeout(() => {
					this.reloadTimer = 0;
					void this.reloadFile(changed);
				}, RELOAD_DEBOUNCE_MS);
			}),
		);
	}

	/** Read the file fresh and render if its content differs from the cache. */
	private async verifyAndRender(file: TFile, cached: FileContent | undefined): Promise<void> {
		try {
			const content = await this.readContent(file);
			if (cached !== undefined && contentEquals(content, cached)) return;
			contentCache.set(file.path, content);
			this.renderContent(content);
		} catch (err) {
			console.error('RichViewer:', err);
		}
	}

	private async reloadFile(file: TFile): Promise<void> {
		try {
			const content = await this.readContent(file);
			const prev = contentCache.get(file.path);
			if (prev !== undefined && contentEquals(content, prev)) return;
			contentCache.set(file.path, content);
			if (this.unloaded) return;
			if (!(await this.softReload(content))) this.renderContent(content);
		} catch (err) {
			console.error('RichViewer reload:', err);
		}
	}
}
