import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownSectionInformation, Plugin, TFile, normalizePath } from 'obsidian';
import { migrateLegacyParams, parseViewParams, type ViewOptions } from './viewParams';
import { DrawingViewer } from './drawingViewer';
import { SlideViewer } from './slideViewer';
import { DEFAULT_SETTINGS, RichViewSettingTab, type RichViewSettings } from './settings';
import { RICH_FILE_VIEW_TYPE, RichFileView } from './richFileView';
import { ViewRegistry } from './viewRegistration';
import { createProvider, SEARCH_EXTENSIONS } from './search/provider';
import type { RichSearchProvider } from './richSearchApi';
import { openDiagramFilePicker } from './diagramFilePicker';
import { t } from './i18n';
import { BlockRefUpdater } from './blockRefUpdater';
import { renderStatusCard } from './statusCard';

/**
 * Replace a `rich-view` code block's parameter line with `newParams`,
 * preserving indentation. Shared by the live viewer's write-back paths (⊙
 * button, resize handle — both via RichCodeBlock.onload's onUpdate) and the
 * blank-block import button / legacy-format migration below, which run
 * before any RichCodeBlock/DrawingViewer instance exists for this block.
 */
function rewriteBlockParams(
	content: string,
	newParams: string,
	sectionInfo: MarkdownSectionInformation | null,
	originalSource: string,
): string {
	if (sectionInfo) {
		// Precise line-based replacement using the section's known position.
		// sectionInfo.lineStart = opening fence line; lineEnd = closing fence.
		const sep = content.includes('\r\n') ? '\r\n' : '\n';
		const lines = content.split(/\r?\n/);
		const indent = lines[sectionInfo.lineStart]?.match(/^[ \t]*/)?.[0] ?? '';
		const before = lines.slice(0, sectionInfo.lineStart + 1);
		const after  = lines.slice(sectionInfo.lineEnd);
		return [...before, indent + newParams, ...after].join(sep);
	}
	// Fallback: replace only the first block matching the original content.
	const escContent = originalSource.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(
		'([ \\t]*)(`{3,})rich-view[^\\n]*[\\r\\n]+' +
		'[ \\t]*' + escContent + '[ \\t]*[\\r\\n]+' +
		'[ \\t]*\\2',
		'g',
	);
	let replaced = false;
	return content.replace(pattern, (whole, indent, fence) => {
		if (replaced) return whole;
		replaced = true;
		return `${indent}${fence}rich-view\n${indent}${newParams}\n${indent}${fence}`;
	});
}

/** Look up the note by path and atomically rewrite this block's params into it. */
async function writeBlockParams(
	app: typeof Plugin.prototype.app,
	sourcePath: string,
	sectionInfo: MarkdownSectionInformation | null,
	originalSource: string,
	newParams: string,
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(sourcePath);
	if (!(file instanceof TFile)) return;
	// Vault.process edits the file atomically (no races with other plugins);
	// it's the recommended API for content transforms not tied to the cursor.
	await app.vault.process(file, content => rewriteBlockParams(content, newParams, sectionInfo, originalSource));
}

class RichCodeBlock extends MarkdownRenderChild {
	constructor(
		el: HTMLElement,
		private app_: typeof Plugin.prototype.app,
		private options: ViewOptions,
		private sourcePath: string,
		private originalSource: string,
		private sectionInfo: MarkdownSectionInformation | null,
		private settings: RichViewSettings,
		private stencilsDir: string,
	) {
		super(el);
	}

	onload(): void {
		const onUpdate = async (newParams: string) => {
			await writeBlockParams(this.app_, this.sourcePath, this.sectionInfo, this.originalSource, newParams);
		};

		const ctx = { app: this.app_, container: this.containerEl, options: this.options, sourcePath: this.sourcePath, writeParams: onUpdate };
		const viewer = this.options.filename.toLowerCase().endsWith('.pptx')
			? new SlideViewer(ctx)
			: new DrawingViewer(ctx, this.settings, this.stencilsDir);
		this.addChild(viewer);
		viewer.load();
	}
}

export default class RichViewPlugin extends Plugin {
	settings: RichViewSettings = structuredClone(DEFAULT_SETTINGS);
	/** Which file types Obsidian really handed to our tab view; `viewRegistered` and the settings notice read it. */
	readonly viewRegistry = new ViewRegistry();
	/** Found by rich-search at `app.plugins.plugins['rich-view'].richSearch`. */
	richSearch: RichSearchProvider = createProvider(ext => this.viewRegistry.isRegistered(ext));

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new RichViewSettingTab(this.app, this));

		const stencilsDir = normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/stencils`);
		this.registerFileView(stencilsDir);

		const refUpdater = new BlockRefUpdater(this.app, SEARCH_EXTENSIONS);
		this.register(() => { refUpdater.dispose(); });
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { refUpdater.onRename(file, oldPath); }));

		this.registerMarkdownCodeBlockProcessor('rich-view', (source, el, ctx) => {
			const trimmed = source.trim();

			if (!trimmed) {
				renderStatusCard(el, {
					icon: 'file-plus',
					title: t('chooseFile'), hint: t('chooseFileHint'),
					action: { label: t('importFile'), run: () => this.chooseFileFor(el, ctx, source) },
				});
				return;
			}

			// Migrate the pre-viewParams.ts positional format (e.g.
			// "file.drawio|440px|Overview|54%|(418, 15)") if present — silently,
			// same write-back path as the import button above.
			const migrated = migrateLegacyParams(trimmed);
			const options = parseViewParams(migrated ?? trimmed);
			if (migrated) {
				void writeBlockParams(this.app, ctx.sourcePath, ctx.getSectionInfo(el), source, migrated);
			}

			if (!options.filename) {
				renderStatusCard(el, {
					icon: 'file-question', tone: 'error',
					title: t('noFileInBlock'), hint: t('noFileInBlockHint'),
					action: { label: t('importFile'), run: () => this.chooseFileFor(el, ctx, source) },
				});
				return;
			}
			options.filename = this.resolveRelative(options.filename, ctx.sourcePath);
			const sectionInfo = ctx.getSectionInfo(el);
			// Reserve the final height synchronously so the code block occupies its
			// full height the instant Obsidian lays it out.  Without this the block
			// starts at 0 height, Obsidian anchors the scroll there, and the diagram
			// expanding to ~400px afterwards shoves the content above it off-screen.
			el.style.setProperty('min-height', `${options.height > 0 ? options.height : 400}px`);
			// Pass the live settings object so viewers see changes without reload.
			ctx.addChild(new RichCodeBlock(el, this.app, options, ctx.sourcePath, source, sectionInfo, this.settings, stencilsDir));
		});
	}

	/** Asks which file the block should show, then writes `file=` into it (an empty block, or one that names none). */
	private chooseFileFor(el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string): void {
		openDiagramFilePicker(this.app, file => {
			void writeBlockParams(this.app, ctx.sourcePath, ctx.getSectionInfo(el), source, `file=${file.path}`);
		});
	}

	/** The tab view is registered once; each extension separately, because Obsidian may refuse one that another plugin owns. */
	private registerFileView(stencilsDir: string): void {
		try {
			this.registerView(RICH_FILE_VIEW_TYPE, leaf => new RichFileView(leaf, this.settings, stencilsDir));
		} catch (err) {
			console.error('Rich View: could not register the file view', err);
			return;
		}
		this.viewRegistry.register(
			SEARCH_EXTENSIONS,
			ext => this.settings.openInRichView[ext as keyof RichViewSettings['openInRichView']] !== false,
			ext => { this.registerExtensions([ext], RICH_FILE_VIEW_TYPE); },
		);
	}

	async loadSettings(): Promise<void> {
		const saved = ((await this.loadData()) ?? {}) as Partial<RichViewSettings>;
		// Merge the nested switches one by one: a shallow merge would let a saved partial object wipe the other defaults.
		Object.assign(this.settings, DEFAULT_SETTINGS, saved, {
			openInRichView: { ...DEFAULT_SETTINGS.openInRichView, ...saved.openInRichView },
		});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private resolveRelative(filename: string, sourcePath: string): string {
		const norm = normalizePath(filename);
		if (this.app.vault.getAbstractFileByPath(norm)) return norm;
		// Resolve as a vault link relative to the source note (handles bare names).
		const resolved = this.app.metadataCache.getFirstLinkpathDest(norm, sourcePath);
		if (resolved instanceof TFile) return resolved.path;
		return norm;
	}
}
