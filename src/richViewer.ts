import { App, Component, TFile } from 'obsidian';
import type { ViewOptions } from './viewParams';
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
