import { Notice, TFile, TFolder, normalizePath, type App, type TAbstractFile } from 'obsidian';
import { addRename, expandFolderRename, updateFileRefs } from './blockRefs';
import { t } from './i18n';

/**
 * Keeps `rich-view` blocks pointing at the files they show when those are renamed or moved in Obsidian, which
 * rewrites links but never the `file=` inside a code block.
 */
export class BlockRefUpdater {
	private readonly renames = new Map<string, string>();
	private timer = 0;
	private disposed = false;

	constructor(private readonly app: App, private readonly extensions: readonly string[]) {}

	/** Call for every vault rename event. Notes and files of other types are ignored. */
	onRename(file: TAbstractFile, oldPath: string): void {
		if (file instanceof TFile) {
			if (!this.isViewable(file)) return;
			addRename(this.renames, oldPath, file.path);
		} else if (file instanceof TFolder) {
			const inside = this.app.vault.getFiles().filter(f => this.isViewable(f)).map(f => f.path);
			for (const [from, to] of expandFolderRename(oldPath, file.path, inside)) addRename(this.renames, from, to);
		}
		if (this.renames.size === 0) return;
		// Not a wait: it only lets the events of one operation (a folder move may report every file in it) arrive first,
		// so the notes are scanned once for all of them.
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => { void this.flush(); }, 0);
	}

	dispose(): void {
		this.disposed = true;
		window.clearTimeout(this.timer);
		this.renames.clear();
	}

	private isViewable(file: TFile): boolean {
		return this.extensions.includes(file.extension.toLowerCase());
	}

	private async flush(): Promise<void> {
		this.timer = 0;
		if (this.renames.size === 0) return;
		const renames = new Map(this.renames);
		this.renames.clear();

		let blocks = 0;
		let notes = 0;
		for (const note of this.app.vault.getMarkdownFiles()) {
			if (this.disposed) return;
			// Only notes that have a code block at all are worth reading.
			const sections = this.app.metadataCache.getFileCache(note)?.sections;
			if (sections && !sections.some(s => s.type === 'code')) continue;
			try {
				const resolves = (value: string): boolean => this.stillFindsAFile(value, note.path);
				const text = await this.app.vault.cachedRead(note);
				if (this.disposed) return;
				if (!text.includes('rich-view') || updateFileRefs(text, renames, resolves).count === 0) continue;
				let changed = 0;
				await this.app.vault.process(note, current => {
					const out = updateFileRefs(current, renames, resolves);
					changed = out.count;
					return out.content;
				});
				if (changed > 0) { blocks += changed; notes++; }
			} catch (err) {
				console.error(`Rich View: could not update file references in ${note.path}`, err);
			}
		}
		if (blocks > 0) new Notice(t('updatedFileRefs').replace('{blocks}', String(blocks)).replace('{notes}', String(notes)));
	}

	/** Whether a `file=` value still leads to a file the way the viewer looks it up (see `RichViewPlugin.resolveRelative`). */
	private stillFindsAFile(value: string, sourcePath: string): boolean {
		const path = normalizePath(value);
		if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) return true;
		return this.app.metadataCache.getFirstLinkpathDest(path, sourcePath) instanceof TFile;
	}
}
