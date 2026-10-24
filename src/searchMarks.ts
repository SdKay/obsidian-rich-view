import { Component, type App } from 'obsidian';
import type { DrawingRenderer } from './drawingRenderer';
import { chooseMarks, marksPerShape, type MarkableUnit } from './matchTargets';
import { findSearchHost, readLiveSearch, subscribeToSearch } from './searchHost';
import { shapeIdOfAnchor } from './pageUnits';

/** What the marks need from the viewer that owns them. */
export interface SearchMarksHost {
	renderer(): DrawingRenderer | null;
	/** The text units of the page on screen. */
	units(): MarkableUnit[];
	/** Vault path of the file shown, to tell whether an opened hit belongs here. */
	filePath(): string;
}

/**
 * Marks every shape of the shown page that matches the search on screen, and draws the one the
 * user opened brighter (contract 5.8 / 5.10). The marks follow the search panel, not clicks or
 * Escape: they appear while a query is live and go when it is empty or the panel closes.
 * Purely a view over the page — nothing is written to the file.
 */
export class SearchMarks extends Component {
	private layer: HTMLElement | null = null;
	private stop: (() => void) | null = null;

	constructor(
		private readonly app: App,
		/** The pan layer: marks share the diagram's transform. */
		private readonly panEl: HTMLElement,
		private readonly host: SearchMarksHost,
	) {
		super();
	}

	onload(): void {
		this.layer = this.panEl.createDiv('drawing-view-search-layer');
		this.subscribe();
	}

	onunload(): void {
		this.stop?.();
		this.stop = null;
		this.layer?.remove();
		this.layer = null;
	}

	/** Redraw from the current search state; call after the page or the zoom/pan changes. */
	refresh(): void {
		const layer = this.layer;
		if (!layer) return;
		layer.empty();
		const renderer = this.host.renderer();
		if (!renderer) return;

		const searchHost = findSearchHost(this.app);
		const { query, hit } = readLiveSearch(searchHost);
		const marks = chooseMarks(searchHost, this.host.units(), query, hit, this.host.filePath());
		for (const mark of marksPerShape(marks, shapeIdOfAnchor)) {
			const bounds = renderer.getShapeBounds(mark.shapeId);
			if (!bounds) continue;
			const el = layer.createDiv('drawing-view-search-mark');
			el.toggleClass('is-opened', mark.opened);
			el.setCssProps({
				'--dw-hl-x': `${Math.round(bounds.x)}px`,
				'--dw-hl-y': `${Math.round(bounds.y)}px`,
				'--dw-hl-w': `${Math.round(bounds.w)}px`,
				'--dw-hl-h': `${Math.round(bounds.h)}px`,
			});
		}
	}

	/** Bounds of the opened hit's shape on the shown page, if there is one; used to bring it into view. */
	openedBounds(): { x: number; y: number; w: number; h: number } | null {
		const renderer = this.host.renderer();
		if (!renderer) return null;
		const searchHost = findSearchHost(this.app);
		const { query, hit } = readLiveSearch(searchHost);
		const opened = chooseMarks(searchHost, this.host.units(), query, hit, this.host.filePath()).find(m => m.opened);
		const id = opened ? shapeIdOfAnchor(opened.unit.anchor) : null;
		return id === null ? null : renderer.getShapeBounds(id);
	}

	/** Id of the shape that holds the opened hit on the shown page, if any. */
	openedShapeId(): string | null {
		const searchHost = findSearchHost(this.app);
		const { query, hit } = readLiveSearch(searchHost);
		const opened = chooseMarks(searchHost, this.host.units(), query, hit, this.host.filePath()).find(m => m.opened);
		return opened ? shapeIdOfAnchor(opened.unit.anchor) : null;
	}

	/** Re-subscribe, because rich-search may have been enabled or replaced since the view opened. */
	resubscribe(): void {
		this.stop?.();
		this.subscribe();
	}

	private subscribe(): void {
		this.stop = subscribeToSearch(findSearchHost(this.app), () => { this.refresh(); });
	}
}
