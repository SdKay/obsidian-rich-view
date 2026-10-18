import { FileView, type TFile, type WorkspaceLeaf } from 'obsidian';
import { parseViewParams } from './viewParams';
import { DrawingViewer } from './drawingViewer';
import { SlideViewer } from './slideViewer';
import type { RichViewSettings } from './settings';
import { PendingSearchRequest, readSearchRequest } from './searchRequest';
import type { RichViewer } from './richViewer';

export const RICH_FILE_VIEW_TYPE = 'rich-view-file';

/**
 * A draw.io / Visio / PowerPoint file shown in a normal tab, not inside a note.
 * It reuses the same viewers as the code block; the differences are that it
 * fills the tab and has no code block to write view parameters back to.
 */
export class RichFileView extends FileView {
	private viewer: RichViewer | null = null;
	/** A search hit can arrive before the viewer exists or after it is up; this holds it until it can be used. */
	private readonly pending = new PendingSearchRequest();

	constructor(
		leaf: WorkspaceLeaf,
		private readonly settings: RichViewSettings,
		private readonly stencilsDir: string,
	) {
		super(leaf);
		this.navigation = true;
	}

	getViewType(): string {
		return RICH_FILE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Rich View';
	}

	getIcon(): string {
		return 'layout-dashboard';
	}

	override setEphemeralState(state: unknown): void {
		super.setEphemeralState(state);
		const request = readSearchRequest(state);
		if (request) this.pending.submit(request);
	}

	override onLoadFile(file: TFile): Promise<void> {
		this.closeViewer();
		this.contentEl.empty();
		this.contentEl.addClass('rich-view-file');

		const options = parseViewParams(`file=${file.path}`);
		const ctx = { app: this.app, container: this.contentEl, options, sourcePath: file.path, writeParams: null };
		const viewer = file.extension.toLowerCase() === 'pptx'
			? new SlideViewer(ctx)
			: new DrawingViewer(ctx, this.settings, this.stencilsDir);
		this.viewer = viewer;
		this.addChild(viewer);
		viewer.load();
		return Promise.resolve();
	}

	override onUnloadFile(): Promise<void> {
		this.closeViewer();
		return Promise.resolve();
	}

	private closeViewer(): void {
		this.pending.setConsumer(null);
		if (this.viewer) this.removeChild(this.viewer);
		this.viewer = null;
	}
}
