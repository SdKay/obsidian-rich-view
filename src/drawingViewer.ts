import { Platform } from 'obsidian';
import { canCopyVisioObject } from './copyVisioObject';
import { StencilLibs } from './stencilLibs';
import { parseDrawioCached, type DrawioPage } from './drawioParser';
import { parseVisioFile, type VisioPage } from './visioParser';
import { GraphRenderer } from './graphRenderer';
import { VisioRenderer } from './visioRenderer';
import type { DrawingRenderer, BoundingBox } from './drawingRenderer';
import type { RichViewSettings } from './settings';
import { patchCellLink } from './cellLink';
import { LinkHover } from './linkHover';
import { PanZoomController, type ViewportHost } from './viewportController';
import { ViewerFrame } from './frame/viewerFrame';
import type { FrameContent } from './frame/types';
import { Magnifier } from './magnifier';
import { switchFile } from './switchFile';
import type { FileContent } from './diagramFileContent';
import { RichViewer, type ViewerContext } from './richViewer';
import { SearchMarks } from './searchMarks';
import { drawioPageUnits, pageOfAnchor, visioPageUnits } from './pageUnits';
import { offsetKeepingPoint, revealShift } from './revealShift';
import { bodyFontPx, readableScale } from './readableZoom';
import type { SearchRequest } from './searchRequest';
import type { MarkableUnit } from './matchTargets';

/** Either format's page — both carry a `name` for tabs/param-string purposes. */
type AnyPage = DrawioPage | VisioPage;

/** Canvas viewer (draw.io, Visio): pan/zoom a page's shapes inside the shared frame. */
export class DrawingViewer extends RichViewer {
	private pages: AnyPage[] = [];
	/** Set from renderContent(): true for a .vsdx page tree, false for .drawio. */
	private isVisio = false;
	/** The .vsdx as read, kept so one page can be copied out as a Visio object. */
	private visioBytes: Uint8Array | null = null;
	private currentPage = 0;
	private currentBbox: BoundingBox = { x: 0, y: 0, width: 400, height: 300 };

	// Default view state — saved after first render, used by dblclick-reset
	private defaultZoom = 100;
	private defaultDisplayX = 0;
	private defaultDisplayY = 0;

	private renderer: DrawingRenderer | null = null;
	private frame: ViewerFrame | null = null;
	private magnifier: Magnifier | null = null;
	private graphEl: HTMLElement | null = null;
	private linkHover: LinkHover | null = null;
	/** Inner element that @maxgraph renders into; CSS-transformed for pan/zoom. */
	private panEl: HTMLElement | null = null;
	/** Owns all viewport pan/zoom (mouse, touch, wheel) and the visual transform. */
	private controller: PanZoomController | null = null;

	/** draw.io only — null for Visio, which has no stencil-library concept. */
	private stencilLibs: StencilLibs | null = null;
	private searchMarks: SearchMarks | null = null;
	/** A search hit asked to be shown once the page it names has been drawn. */
	private pendingReveal = false;

	constructor(
		ctx: ViewerContext,
		/** Live plugin settings (shared reference; reflects changes without reload). */
		private readonly settings: RichViewSettings,
		private readonly stencilsDir: string,
	) {
		super(ctx);
	}

	/**
	 * Apply changed content in place, keeping pan/zoom. Only draw.io can: same
	 * number of pages and a live renderer means just re-loading the XML, far
	 * cheaper than rebuilding the DOM. .vsdx has no soft-reload path.
	 */
	protected async softReload(content: FileContent): Promise<boolean> {
		if (typeof content !== 'string' || !this.renderer) return false;
		const diagram = parseDrawioCached(content);
		if (diagram.pages.length !== this.pages.length) return false;

		this.pages = diagram.pages;
		const page = diagram.pages[this.currentPage];
		if (page) {
			this.controller?.clearVisual();
			const processedXml = await (this.stencilLibs?.prepareForRender(page.xml) ?? Promise.resolve(page.xml));
			if (this.unloaded || !this.renderer) return true;
			// Preserve current pan/zoom: load() resets the @maxgraph view.
			this.currentBbox = this.renderer.loadPreserveView(processedXml);
			this.updateStatus();
		}
		return true;
	}

	protected teardown(): void {
		this.renderer?.destroy();
		this.renderer = null;
	}

	/** (Re)build the viewer from raw diagram file content (.drawio text or .vsdx binary). */
	protected renderContent(content: FileContent): void {
		// Clear any previous render (e.g. background re-render after a change).
		this.renderer?.destroy();
		this.renderer = null;
		if (this.controller) { this.removeChild(this.controller); this.controller = null; }
		if (this.magnifier) { this.removeChild(this.magnifier); this.magnifier = null; }
		if (this.linkHover) { this.removeChild(this.linkHover); this.linkHover = null; }
		if (this.searchMarks) { this.removeChild(this.searchMarks); this.searchMarks = null; }
		if (this.stencilLibs) { this.removeChild(this.stencilLibs); this.stencilLibs = null; }
		if (this.frame) { this.removeChild(this.frame); this.frame = null; }
		this.container.empty();
		this.graphEl = this.panEl = null;

		this.isVisio = typeof content !== 'string';
		this.visioBytes = typeof content === 'string' ? null : new Uint8Array(content);

		if (this.isVisio) {
			const visio = parseVisioFile(content as ArrayBuffer);
			this.pages = visio.pages;
			if (this.pages.length === 0) {
				this.showError(visio.error ?? 'No pages found.');
				return;
			}
		} else {
			const diagram = parseDrawioCached(content as string);
			this.pages = diagram.pages;
			if (this.pages.length === 0) {
				this.showError(diagram.error ?? 'No diagrams found.');
				return;
			}
		}

		this.currentPage = this.resolvePageIndex();
		this.buildLayout();
		void this.renderCurrentPage();
	}

	/** Resolve the target page: by name first (exact match), then by 1-based index. */
	private resolvePageIndex(): number {
		let targetIdx = this.options.pageIndex;
		if (this.options.pageName) {
			const named = this.pages.findIndex(p => p.name === this.options.pageName);
			if (named !== -1) targetIdx = named;
		}
		return Math.max(0, Math.min(targetIdx, this.pages.length - 1));
	}

	private buildLayout(): void {
		this.frame = new ViewerFrame(this.container, this.options.height, {
			onHeightChange: h => { this.onHeightChanged(h); },
			onBodyResize: () => { this.refitIfAuto(); },
		});
		this.addChild(this.frame);
		const body = this.frame.body;

		// graphEl is the fixed clipping viewport (overflow: hidden).  The inner
		// panEl is what @maxgraph renders into and what we CSS-translate for
		// panning — it can overflow graphEl, so content panned off-screen still
		// exists in the DOM and reappears when panned back.
		this.graphEl = body.createDiv('drawing-view-graph');
		this.panEl = this.graphEl.createDiv('drawing-view-pan');

		this.magnifier = new Magnifier({
			graphEl: this.graphEl,
			panEl: this.panEl,
			setViewportSuspended: suspended => { this.controller?.setSuspended(suspended); },
			isToggleTarget: node => this.frame?.isActionTarget('magnifier', node) ?? false,
			onActiveChange: active => { this.frame?.setActionActive('magnifier', active); },
		});
		this.addChild(this.magnifier);

		// Banner for missing stencil lib notifications.
		if (!this.isVisio) {
			this.stencilLibs = new StencilLibs(body, this.app, this.settings, this.stencilsDir, {
				rerender: () => { void this.renderCurrentPage(); },
				currentPageXml: () => (this.pages[this.currentPage] as DrawioPage | undefined)?.xml ?? '',
			});
			this.addChild(this.stencilLibs);
		}

		this.frame.setContent(this.frameContent());
	}

	/** What this viewer tells the shared status bar: its pages and the actions it supports. */
	private frameContent(): FrameContent {
		const common: FrameContent['common'] = {
			magnifier: () => { this.magnifier?.toggle(); },
			fit: () => { this.autoFitNow(); },
			'copy-block': () => { this.copyAsCodeBlock(this.buildParamString(this.heightForCopy())); },
			'open-external': () => { this.openExternal(); },
		};
		const visio = this.visioBytes;
		if (visio && canCopyVisioObject({ isDesktop: Platform.isDesktop, isVisio: this.isVisio, hasBytes: true })) {
			common['copy-visio'] = () => { this.copyAsVisioObject(visio, this.currentPage); };
		}
		const writeParams = this.writeParams;
		if (writeParams) {
			common['apply-view'] = () => {
				this.applyCurrentView().catch(err => console.error('DrawingViewer update:', err));
			};
			common['switch-file'] = () => { switchFile(this.app, this.options, writeParams); };
		}
		return {
			pages: this.pages.map(p => p.name),
			currentPage: this.currentPage,
			onSelectPage: i => { this.switchPage(i); },
			common,
			specific: [],
		};
	}

	private onHeightChanged(height: number): void {
		this.options.height = height;
		this.refitIfAuto();
		// Persist the new height to the code block (preserving other params).
		this.writeParams?.(this.buildParamFromOptions()).catch(err => console.error('DrawingViewer resize:', err));
	}

	/** After the body's size changes, an auto-fit view (no pinned zoom) re-fits; an explicit zoom is kept. */
	private refitIfAuto(): void {
		if (this.options.zoom === 0) this.autoFitNow();
	}

	private switchPage(index: number): void {
		this.currentPage = index;
		this.frame?.setCurrentPage(index);
		void this.renderCurrentPage();
	}

	private async renderCurrentPage(): Promise<void> {
		if (this.unloaded) return;
		const graphEl = this.graphEl;
		const panEl = this.panEl;
		if (!graphEl || !panEl) return;

		const page = this.pages[this.currentPage];
		if (!page) return;

		// Create renderer + controller once (into panEl); reuse for page switches.
		if (!this.renderer) {
			this.renderer = this.isVisio ? new VisioRenderer(panEl) : new GraphRenderer(panEl);
			this.renderer.onViewChange(() => { this.updateStatus(); this.searchMarks?.refresh(); });
			const host: ViewportHost = {
				getCommittedScale: () => this.renderer?.getScale() ?? 1,
				getCommittedOffset: () => this.renderer?.getDisplayOffset() ?? { x: 0, y: 0 },
				commitView: (z, dx, dy) => this.renderer?.setViewFromDisplay(z, dx, dy),
				onViewChange: () => this.updateStatus(),
			};
			this.controller = new PanZoomController(graphEl, panEl, host, () => this.settings);
			this.addChild(this.controller);
			this.setupInteraction(graphEl);
		}

		// Reset the visual CSS transform when (re)loading a page.
		this.controller?.clearVisual();

		let bbox: BoundingBox;
		if (this.isVisio) {
			// Visio has no stencil-library concept (masters are embedded in the
			// .vsdx itself) and visioParser.ts already fully resolved the page —
			// no stencil step needed, just hand the page straight over.
			bbox = this.renderer.load(JSON.stringify(page));
		} else {
			// Register locally-cached libs + inline local SVGs BEFORE the first paint
			// so everything already downloaded renders correctly in a single pass.
			// Only genuinely-missing (network-required) libs are deferred to a banner.
			const pageXml = (page as DrawioPage).xml;
			const processedXml = await (this.stencilLibs?.prepareForRender(pageXml) ?? Promise.resolve(pageXml));
			// The component may have unloaded while the stencil step was awaiting
			// (e.g. a network stencil check) — bail rather than touch a null renderer.
			if (this.unloaded || !this.renderer) return;
			bbox = this.renderer.load(processedXml);
		}
		this.currentBbox = bbox;

		if (this.options.zoom > 0 && this.options.offsetSpecified) {
			// Zoom AND explicit pan offset both given — use as-is.
			this.defaultZoom = this.options.zoom;
			this.defaultDisplayX = this.options.offsetX;
			this.defaultDisplayY = this.options.offsetY;
			this.renderer.setViewFromDisplay(this.options.zoom, this.options.offsetX, this.options.offsetY);
			this.updateStatus();
			this.afterPageDrawn();
		} else {
			// Either auto-fit (zoom=0) or zoom-only (centre at given zoom).
			// Defer until the container has real pixel dimensions.
			window.requestAnimationFrame(() => {
				if (!this.renderer || !this.graphEl) return;
				const rect = this.graphEl.getBoundingClientRect();
				const cw = rect.width || this.graphEl.offsetWidth || 600;
				const ch = rect.height || this.graphEl.offsetHeight || 380;
				if (this.options.zoom > 0) {
					// Zoom specified, no offset — centre diagram at that zoom.
					this.renderer.centerAtZoom(this.options.zoom, cw, ch, bbox);
				} else {
					// No zoom — auto-fit to fill the viewport.
					this.renderer.autoFit(cw, ch, bbox);
				}
				// Save as reset target.
				this.defaultZoom = this.renderer.getScale() * 100;
				const off = this.renderer.getDisplayOffset();
				this.defaultDisplayX = off.x;
				this.defaultDisplayY = off.y;
				this.updateStatus();
				this.afterPageDrawn();
			});
		}
	}

	/** Build the param string representing the current viewer state. */
	private buildParamString(height = this.options.height): string {
		const parts: string[] = [`file=${this.options.filename}`];
		if (height > 0) parts.push(`height=${height}`);

		// Page — use name if available, otherwise page-index (1-based)
		if (this.pages.length > 1) {
			const name = this.pages[this.currentPage]?.name;
			parts.push(name ? `page=${name}` : `page-index=${this.currentPage + 1}`);
		}

		// Zoom (rounded to nearest integer %) — includes uncommitted visual zoom.
		const zoomPct = Math.round(this.currentScale() * 100);
		parts.push(`zoom=${zoomPct}`);

		// Pan offset (rounded to integers) — includes the live CSS offset.
		const off = this.currentDisplayOffset();
		parts.push(`offset=${Math.round(off.x)},${Math.round(off.y)}`);

		return parts.join('|');
	}

	/**
	 * Build a param string from the ORIGINAL options (page/zoom/offset as the
	 * user wrote them) plus the current height.  Used by the resize handle so
	 * that resizing only changes height and never freezes an auto-fit zoom.
	 */
	private buildParamFromOptions(): string {
		const o = this.options;
		const parts: string[] = [`file=${o.filename}`];
		if (o.pageName) parts.push(`page=${o.pageName}`);
		else if (o.pageIndex > 0) parts.push(`page-index=${o.pageIndex + 1}`);
		if (o.height > 0) parts.push(`height=${o.height}`);
		if (o.zoom > 0) parts.push(`zoom=${o.zoom}`);
		if (o.offsetSpecified) parts.push(`offset=${Math.round(o.offsetX)},${Math.round(o.offsetY)}`);
		return parts.join('|');
	}

	/** Write the current page/zoom/offset back into the source code block. */
	private async applyCurrentView(): Promise<void> {
		if (!this.writeParams) return;
		// buildParamString already accounts for the uncommitted visual transform,
		// so no flush is needed — avoids an extra redraw on click.
		await this.writeParams(this.buildParamString());
	}

	private setupInteraction(graphEl: HTMLElement): void {
		// Double-click → reset view.
		this.registerDomEvent(graphEl, 'dblclick', (e: MouseEvent) => {
			if (this.magnifier?.active) return;
			e.preventDefault();
			e.stopPropagation();
			this.resetView();
		}, true);

		// Pan / zoom / pinch are owned by PanZoomController; hover + link follow by LinkHover.

		this.linkHover = new LinkHover(this.app, graphEl, this.panEl!, this.frame?.body ?? this.container, {
			renderer: () => this.renderer,
			visual: () => this.controller?.getVisual() ?? { scale: 1, tx: 0, ty: 0 },
			pointerBusy: () => this.magnifier?.active ?? false,
			didGesture: () => this.controller?.didGesture ?? false,
			clickFollowsLink: () => this.settings.panModifier !== 'none',
			followLink: href => { this.navigateLink(href); },
			editLink: (cellId, link) => this.updateCellLink(cellId, link),
		});
		this.addChild(this.linkHover);

		this.searchMarks = new SearchMarks(this.app, this.panEl!, {
			renderer: () => this.renderer,
			units: () => this.currentUnits(),
			filePath: () => this.options.filename,
			scopePath: () => this.sourcePath,
		});
		this.addChild(this.searchMarks);
	}

	/** The searchable text units of the page on screen. */
	private currentUnits(): MarkableUnit[] {
		const page = this.pages[this.currentPage];
		if (!page) return [];
		return this.isVisio ? visioPageUnits(page as VisioPage) : drawioPageUnits(page as DrawioPage);
	}

	/**
	 * Show a search hit: go to the page its anchor names, then mark the matches and bring the opened one
	 * into view. A stale or foreign anchor leaves the default page and view alone (contract 5.3).
	 */
	override showSearchRequest(request: SearchRequest): void {
		const pageName = pageOfAnchor(request.anchor);
		const index = pageName === null ? -1 : this.pages.findIndex(p => p.name === pageName);
		this.searchMarks?.setClickedQuery(request.query);
		this.pendingReveal = true;
		if (index !== -1 && index !== this.currentPage) this.switchPage(index);
		else this.afterPageDrawn();
	}

	/** Runs once the shown page is laid out: redraw the marks, then reveal a pending hit. */
	private afterPageDrawn(): void {
		this.markReady();
		this.searchMarks?.resubscribe();
		this.searchMarks?.refresh();
		if (!this.pendingReveal) return;
		this.pendingReveal = false;
		this.revealOpened();
	}

	/**
	 * Brings the opened hit into view. If the diagram is drawn too small to read, first zooms in (around the
	 * shape, so it stays put) until its text is about as large as the note's body text; a view already larger than
	 * that is left alone. Then pans just enough to show the whole shape.
	 */
	private revealOpened(): void {
		const renderer = this.renderer;
		const graphEl = this.graphEl;
		if (!renderer || !graphEl) return;
		// The jump starts from the committed view; a half-finished gesture would add a second transform on top.
		this.controller?.clearVisual();

		const first = this.searchMarks?.openedBounds();
		if (!first) return;
		const id = this.searchMarks?.openedShapeId() ?? null;
		const rect = graphEl.getBoundingClientRect();
		const viewport = { width: rect.width || graphEl.offsetWidth, height: rect.height || graphEl.offsetHeight };

		const scale = renderer.getScale();
		const target = readableScale(scale, id === null ? null : renderer.getShapeFontSize(id), bodyFontPx(graphEl.ownerDocument));
		if (target !== null) {
			const centre = { x: first.x + first.w / 2, y: first.y + first.h / 2 };
			const next = offsetKeepingPoint(centre, renderer.getDisplayOffset(), scale, target);
			renderer.setViewFromDisplay(target * 100, next.x, next.y);
		}

		// Bounds depend on the view, so read them again after any zoom.
		const box = this.searchMarks?.openedBounds();
		if (!box) return;
		const shift = revealShift(box, viewport);
		if (!shift) return;
		const off = renderer.getDisplayOffset();
		renderer.setViewFromDisplay(renderer.getScale() * 100, off.x + shift.dx, off.y + shift.dy);
	}

	private async updateCellLink(cellId: string, link: string): Promise<void> {
		const file = this.resolveFile(this.options.filename);
		if (!file) return;
		await this.app.vault.process(file, content => patchCellLink(content, cellId, link));
	}

	private navigateLink(href: string): void {
		if (/^https?:\/\//i.test(href)) {
			// activeWindow (not the bare global) so this opens correctly when the
			// note is viewed in an Obsidian popout window.
			activeWindow.open(href, '_blank');
			return;
		}
		// Strip [[...]] wikilink brackets if present, then let Obsidian resolve.
		const cleaned = href.replace(/^\[\[(.+)\]\]$/, '$1');
		void this.app.workspace.openLinkText(cleaned, this.sourcePath, false);
	}

	/** Re-fit the diagram to the current viewer size, ignoring any pinned zoom/offset. */
	private autoFitNow(): void {
		if (!this.renderer || !this.graphEl) return;
		this.controller?.clearVisual();
		const rect = this.graphEl.getBoundingClientRect();
		this.renderer.autoFit(rect.width || 600, rect.height || 380, this.currentBbox);
		this.updateStatus();
	}

	private resetView(): void {
		if (!this.renderer || !this.graphEl) return;
		// Clear the visual CSS transform — the view is set directly in @maxgraph.
		this.controller?.clearVisual();
		if (this.options.zoom > 0) {
			this.renderer.setViewFromDisplay(this.defaultZoom, this.defaultDisplayX, this.defaultDisplayY);
		} else {
			const rect = this.graphEl.getBoundingClientRect();
			this.renderer.autoFit(rect.width || 600, rect.height || 380, this.currentBbox);
		}
		this.updateStatus();
	}

	private updateStatus(): void {
		if (!this.frame || !this.renderer) return;
		const pct = Math.round(this.currentScale() * 100);
		const off = this.currentDisplayOffset();
		this.frame.setStatus(`${pct}% (${Math.round(off.x)}, ${Math.round(off.y)})`);
	}

	/** Effective scale including the uncommitted visual zoom. */
	private currentScale(): number {
		return (this.renderer?.getScale() ?? 1) * (this.controller?.getVisual().scale ?? 1);
	}

	/** Effective visible offset = vT + vScale · @maxgraph display offset. */
	private currentDisplayOffset(): { x: number; y: number } {
		const base = this.renderer?.getDisplayOffset() ?? { x: 0, y: 0 };
		const v = this.controller?.getVisual() ?? { scale: 1, tx: 0, ty: 0 };
		return { x: v.tx + v.scale * base.x, y: v.ty + v.scale * base.y };
	}
}
