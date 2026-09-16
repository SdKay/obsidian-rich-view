import { App, Component, setTooltip, TFile } from 'obsidian';
import { stencilManager, OFFICIAL_LIBS } from './stencilManager';
import { parseDrawioCached, type DrawioPage } from './drawioParser';
import type { ViewOptions } from './viewParams';
import { parseVisioFile, type VisioPage } from './visioParser';
import { GraphRenderer } from './graphRenderer';
import { VisioRenderer } from './visioRenderer';
import type { DrawingRenderer, BoundingBox } from './drawingRenderer';
import type { RichViewSettings } from './settings';
import { LinkEditorModal, patchCellLink } from './linkEditor';
import { PanZoomController, type ViewportHost } from './viewportController';
import { t } from './i18n';

/** Either format's page — both carry a `name` for tabs/param-string purposes. */
type AnyPage = DrawioPage | VisioPage;

/**
 * .drawio files are read as text; .vsdx (a ZIP/OOXML container) must be read
 * as binary via vault.readBinary(). Every content-cache/diffing/render path
 * below has to handle both.
 */
type FileContent = string | ArrayBuffer;

function isBinaryDiagramFormat(file: TFile): boolean {
	return file.extension.toLowerCase() === 'vsdx';
}

function contentEquals(a: FileContent, b: FileContent): boolean {
	if (typeof a === 'string' || typeof b === 'string') return a === b;
	if (a.byteLength !== b.byteLength) return false;
	const va = new Uint8Array(a);
	const vb = new Uint8Array(b);
	for (let i = 0; i < va.length; i++) {
		if (va[i] !== vb[i]) return false;
	}
	return true;
}

// Module-level cache of diagram file CONTENT keyed by path.  Crucial for a
// flash-free re-render: when the ⊙ button writes view params into the .md file,
// Obsidian rebuilds the code block, but the diagram file itself is unchanged —
// so the new viewer can paint synchronously from this cache (no async vault
// read gap, which is what caused the blank-flash) and verify in the background.
const contentCache = new Map<string, FileContent>();

export class DrawingViewer extends Component {
	private readonly app: App;
	private readonly container: HTMLElement;
	private readonly options: ViewOptions;
	/** Live plugin settings (shared reference; reflects changes without reload). */
	private readonly settings: RichViewSettings;
	/** Called when the user clicks "apply current view to code block". */
	private readonly onUpdate: ((newParams: string) => Promise<void>) | null;

	private pages: AnyPage[] = [];
	/** Set from renderFromContent(): true for a .vsdx page tree, false for .drawio. */
	private isVisio = false;
	private currentPage = 0;
	private currentBbox: BoundingBox = { x: 0, y: 0, width: 400, height: 300 };

	// Default view state — saved after first render, used by dblclick-reset
	private defaultZoom = 100;
	private defaultDisplayX = 0;
	private defaultDisplayY = 0;

	private renderer: DrawingRenderer | null = null;
	private statusEl: HTMLElement | null = null;
	private tabsEl: HTMLElement | null = null;
	private graphEl: HTMLElement | null = null;
	private tooltipEl: HTMLElement | null = null;
	private tooltipTextEl: HTMLElement | null = null;
	private highlightEl: HTMLElement | null = null;
	/** ID of the draw.io cell currently under the cursor (has a link). */
	private hoveredCellId: string | null = null;
	private hoveredLink: string | null = null;
	/** Timer for delaying tooltip hide when mouse moves from graph to tooltip. */
	private hideTooltipTimer = 0;
	/** Inner element that @maxgraph renders into; CSS-transformed for pan/zoom. */
	private panEl: HTMLElement | null = null;
	/** Owns all viewport pan/zoom (mouse, touch, wheel) and the visual transform. */
	private controller: PanZoomController | null = null;

	// ── Magnifier (loupe) ──────────────────────────────────────────────────
	private magnifierEl: HTMLElement | null = null;
	private magnifierViewportEl: HTMLElement | null = null;
	private magnifierBtnEl: HTMLElement | null = null;
	private magnifierActive = false;
	private magnifierZoom = 2.5;
	private magnifierRadius = 90;
	private magnifierMx = 0;
	private magnifierMy = 0;

	/** Vault-relative path of the note that contains this code block. */
	private readonly sourcePath: string;

	private readonly stencilsDir: string;
	/** Banner shown when stencil libs need to be downloaded. */
	private libsBannerEl: HTMLElement | null = null;
	/**
	 * Set in onunload().  Fire-and-forget async chains (file reload debounce,
	 * stencil-lib download) can still be in flight when the component unloads —
	 * this flag lets them bail out instead of touching stale DOM refs or
	 * constructing a new GraphRenderer that would never get destroy()'d.
	 */
	private unloaded = false;
	/** Debounced .drawio-file-modify → soft-reload timer; cleared in onunload(). */
	private reloadTimer = 0;

	constructor(
		app: App,
		container: HTMLElement,
		options: ViewOptions,
		settings: RichViewSettings,
		sourcePath: string,
		stencilsDir: string,
		onUpdate?: (newParams: string) => Promise<void>,
	) {
		super();
		this.app = app;
		this.container = container;
		this.options = options;
		this.settings = settings;
		this.sourcePath = sourcePath;
		this.stencilsDir = stencilsDir;
		this.onUpdate = onUpdate ?? null;
	}

	onload(): void {
		void this.initAndLoad();
	}

	private async initAndLoad(): Promise<void> {
		const file = this.resolveFile(this.options.filename);
		if (!file) {
			this.container.createDiv({ cls: 'drawing-view-error', text: `File not found: ${this.options.filename}` });
			return;
		}

		const cached = contentCache.get(file.path);
		if (cached !== undefined) {
			this.renderFromContent(cached);
		}
		void this.verifyAndRender(file, cached);

		this.registerEvent(
			this.app.vault.on('modify', (changedFile) => {
				if (!(changedFile instanceof TFile) || changedFile.path !== file.path) return;
				window.clearTimeout(this.reloadTimer);
				this.reloadTimer = window.setTimeout(() => {
					this.reloadTimer = 0;
					void this.reloadFile(changedFile);
				}, 400);
			}),
		);
	}

	/** Read a diagram file as text (.drawio) or binary (.vsdx), as appropriate. */
	private readFileContent(file: TFile): Promise<FileContent> {
		return isBinaryDiagramFormat(file) ? this.app.vault.readBinary(file) : this.app.vault.read(file);
	}

	/**
	 * Reload a modified diagram file.  For .drawio, uses a soft-reload (only
	 * re-parses and re-loads the XML into the existing renderer) when the page
	 * count is unchanged, which avoids rebuilding the entire DOM and is much
	 * faster; falls back to a full rebuild only when the structure actually
	 * changed. .vsdx has no renderer/soft-reload path yet, so it always goes
	 * through a full rebuild.
	 */
	private async reloadFile(file: TFile): Promise<void> {
		try {
			const content = await this.readFileContent(file);
			const prev = contentCache.get(file.path);
			if (prev !== undefined && contentEquals(content, prev)) return; // no change
			contentCache.set(file.path, content);

			if (typeof content !== 'string') {
				this.renderFromContent(content);
				return;
			}

			const diagram = parseDrawioCached(content);

			// Soft-reload: same number of pages and renderer already exists.
			if (this.renderer && diagram.pages.length === this.pages.length) {
				this.pages = diagram.pages;
				const page = diagram.pages[this.currentPage];
				if (page) {
					this.controller?.clearVisual();
					const processedXml = await this.prepareForRender(page.xml);
					// Preserve current pan/zoom: load() resets the @maxgraph view.
					const bbox = this.renderer.loadPreserveView(processedXml);
					this.currentBbox = bbox;
					this.updateStatus();
				}
				return;
			}

			// Full rebuild needed (page count changed or no renderer yet).
			this.renderFromContent(content);
		} catch (err) {
			console.error('DrawingViewer reload:', err);
		}
	}

	/** Read the file fresh and re-render if its content differs from the cache. */
	private async verifyAndRender(file: TFile, cached: FileContent | undefined): Promise<void> {
		try {
			const content = await this.readFileContent(file);
			if (cached !== undefined && contentEquals(content, cached)) return; // unchanged → nothing to do
			contentCache.set(file.path, content);
			this.renderFromContent(content);
		} catch (err) {
			console.error('DrawingViewer:', err);
		}
	}

	onunload(): void {
		this.unloaded = true;
		if (this.hideTooltipTimer) { window.clearTimeout(this.hideTooltipTimer); this.hideTooltipTimer = 0; }
		if (this.reloadTimer) { window.clearTimeout(this.reloadTimer); this.reloadTimer = 0; }
		this.renderer?.destroy();
		this.renderer = null;
	}

	/** (Re)build the viewer from raw diagram file content (.drawio text or .vsdx binary). */
	private renderFromContent(content: FileContent): void {
		// Clear any previous render (e.g. background re-render after a change).
		this.renderer?.destroy();
		this.renderer = null;
		if (this.controller) { this.removeChild(this.controller); this.controller = null; }
		this.container.empty();
		this.graphEl = this.panEl = this.statusEl = this.tabsEl = null;

		this.isVisio = typeof content !== 'string';

		if (this.isVisio) {
			const visio = parseVisioFile(content as ArrayBuffer);
			this.pages = visio.pages;
			if (this.pages.length === 0) {
				this.container.createDiv({ cls: 'drawing-view-error', text: visio.error ?? 'No pages found.' });
				return;
			}
		} else {
			const diagram = parseDrawioCached(content as string);
			this.pages = diagram.pages;
			if (this.pages.length === 0) {
				this.container.createDiv({ cls: 'drawing-view-error', text: diagram.error ?? 'No diagrams found.' });
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

	private resolveFile(filename: string): TFile | null {
		// main.ts already resolved this to a vault-absolute path; a direct lookup
		// avoids iterating all files (which is slow on large vaults).
		const f = this.app.vault.getAbstractFileByPath(filename);
		if (f instanceof TFile) return f;
		// Last-resort link resolution for a bare name.
		const linked = this.app.metadataCache.getFirstLinkpathDest(filename, '');
		return linked instanceof TFile ? linked : null;
	}

	private buildLayout(): void {
		this.container.addClass('drawing-view-container');
		// Clear the render-time height reservation (set in main.ts) now that the
		// real container drives height — keeps the resize handle free to shrink.
		this.container.style.removeProperty('min-height');
		if (this.options.height > 0) {
			this.container.style.height = `${this.options.height}px`;
		}

		// graphEl is the fixed clipping viewport (overflow: hidden).  The inner
		// panEl is what @maxgraph renders into and what we CSS-translate for
		// panning — it can overflow graphEl, so content panned off-screen still
		// exists in the DOM and reappears when panned back.
		this.graphEl = this.container.createDiv('drawing-view-graph');
		this.panEl = this.graphEl.createDiv('drawing-view-pan');
		this.highlightEl = this.panEl.createDiv('drawing-view-highlight');

		// Magnifier (loupe): a circular viewport, sibling of panEl so it clips
		// against graphEl's own overflow:hidden box. Empty/hidden until activated.
		this.magnifierEl = this.graphEl.createDiv('drawing-view-magnifier');
		this.magnifierViewportEl = this.magnifierEl.createDiv('drawing-view-magnifier-viewport');

		// HUD: apply button (optional) + status text, bottom-right corner.
		// Kept as a sibling of graphEl (not inside it) so @maxgraph's internal
		// HTML-label overlay cannot interfere with its position.
		const hud = this.container.createDiv('drawing-view-hud');

		const openBtn = hud.createSpan({
			cls: 'drawing-view-open-btn',
			attr: { 'role': 'button', 'aria-label': t('openExternal'), 'tabindex': '0' },
		});
		setTooltip(openBtn, t('openExternal'));
		openBtn.setText('↗');
		this.registerDomEvent(openBtn, 'click', () => { this.openExternal(); });
		this.registerDomEvent(openBtn, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openExternal(); }
		});

		// Always re-fits to the current viewer size, even once the code block
		// has pinned an explicit zoom/offset (double-click's "reset" restores
		// that pinned view instead — see resetView()). This is the only way
		// back to auto-fit once a view has been pinned via ⊙.
		const fitBtn = hud.createSpan({
			cls: 'drawing-view-fit-btn',
			attr: { 'role': 'button', 'aria-label': t('autoFit'), 'tabindex': '0' },
		});
		setTooltip(fitBtn, t('autoFit'));
		fitBtn.setText('⛶');
		this.registerDomEvent(fitBtn, 'click', () => { this.autoFitNow(); });
		this.registerDomEvent(fitBtn, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.autoFitNow(); }
		});

		this.magnifierBtnEl = hud.createSpan({
			cls: 'drawing-view-magnifier-btn',
			attr: { 'role': 'button', 'aria-label': t('magnifier'), 'tabindex': '0' },
		});
		setTooltip(this.magnifierBtnEl, t('magnifier'));
		this.magnifierBtnEl.setText('🔍');
		this.registerDomEvent(this.magnifierBtnEl, 'click', () => { this.toggleMagnifier(); });
		this.registerDomEvent(this.magnifierBtnEl, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggleMagnifier(); }
		});

		if (this.onUpdate) {
			const btn = hud.createSpan({
				cls: 'drawing-view-update-btn',
				attr: { 'role': 'button', 'aria-label': t('applyView'), 'tabindex': '0' },
			});
			setTooltip(btn, t('applyView'));
			btn.setText('⊙');
			this.registerDomEvent(btn, 'click', () => {
				this.applyCurrentView().catch(err => console.error('DrawingViewer update:', err));
			});
			this.registerDomEvent(btn, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.applyCurrentView().catch(err => console.error('DrawingViewer update:', err));
				}
			});
		}

		this.statusEl = hud.createDiv('drawing-view-status');
		this.statusEl.setAttribute('aria-live', 'polite');

		if (this.pages.length > 1) {
			// `has-tabs` lifts the HUD above the tab bar (CSS).
			this.container.addClass('has-tabs');
			this.tabsEl = this.container.createDiv('drawing-view-tabs');
			this.tabsEl.setAttribute('role', 'tablist');
			this.buildTabs();
		}

		this.tooltipEl = this.container.createDiv('drawing-view-link-tooltip');
		const tooltipEditBtn = this.tooltipEl.createSpan({
			cls: 'drawing-view-tooltip-edit',
			attr: { role: 'button', tabindex: '0', 'aria-label': t('editLink') },
		});
		setTooltip(tooltipEditBtn, t('editLink'));
		this.tooltipTextEl = this.tooltipEl.createSpan({ cls: 'drawing-view-tooltip-text' });
		tooltipEditBtn.setText('✎');

		// Banner for missing stencil lib notifications.
		this.libsBannerEl = this.container.createDiv({ cls: 'drawing-view-libs-banner' });

		this.registerDomEvent(tooltipEditBtn, 'click', (e: MouseEvent) => {
			e.stopPropagation();
			const cellId = this.hoveredCellId;
			if (!cellId) return;
			new LinkEditorModal(this.app, this.hoveredLink ?? '', (newLink) => {
				this.updateCellLink(cellId, newLink).catch(
					(err: unknown) => console.error('DrawingViewer link edit:', err),
				);
			}).open();
		});
		this.registerDomEvent(tooltipEditBtn, 'keydown', (e: KeyboardEvent) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			e.preventDefault();
			const cellId = this.hoveredCellId;
			if (!cellId) return;
			new LinkEditorModal(this.app, this.hoveredLink ?? '', (newLink) => {
				this.updateCellLink(cellId, newLink).catch(
					(err: unknown) => console.error('DrawingViewer link edit:', err),
				);
			}).open();
		});

		// Bottom-edge resize handle — drag to change the viewer height.
		this.buildResizeHandle();
	}

	private buildResizeHandle(): void {
		const handle = this.container.createDiv('drawing-view-resize-handle');
		handle.setAttribute('aria-label', t('resizeHandle'));
		setTooltip(handle, t('resizeHandle'));

		let resizing = false;
		let startY = 0;
		let startH = 0;
		const MIN_H = 120;

		this.registerDomEvent(handle, 'mousedown', (e: MouseEvent) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			resizing = true;
			startY = e.clientY;
			startH = this.container.getBoundingClientRect().height;
			this.container.addClass('is-resizing');
		}, true);

		this.registerDomEvent(activeDocument, 'mousemove', (e: MouseEvent) => {
			if (!resizing) return;
			const h = Math.max(MIN_H, Math.round(startH + (e.clientY - startY)));
			this.container.style.height = `${h}px`;
		});

		this.registerDomEvent(activeDocument, 'mouseup', () => {
			if (!resizing) return;
			resizing = false;
			this.container.removeClass('is-resizing');
			const h = Math.round(this.container.getBoundingClientRect().height);
			this.options.height = h;
			// Re-fit auto-fit views to the new height; keep explicit zoom as-is.
			if (this.options.zoom === 0 && this.renderer && this.graphEl) {
				const rect = this.graphEl.getBoundingClientRect();
				this.renderer.autoFit(rect.width || 600, rect.height || 380, this.currentBbox);
				this.updateStatus();
			}
			// Persist the new height to the code block (preserving other params).
			if (this.onUpdate) {
				this.onUpdate(this.buildParamFromOptions()).catch(err =>
					console.error('DrawingViewer resize:', err));
			}
		});
	}

	private buildTabs(): void {
		if (!this.tabsEl) return;
		this.tabsEl.empty();
		this.pages.forEach((page, i) => {
			const tab = this.tabsEl!.createEl('button', {
				cls: 'drawing-view-tab' + (i === this.currentPage ? ' is-active' : ''),
				text: page.name,
				attr: {
					role: 'tab',
					tabindex: i === this.currentPage ? '0' : '-1',
					'aria-label': page.name,
					'aria-selected': String(i === this.currentPage),
				},
			});
			this.registerDomEvent(tab, 'click', () => this.switchPage(i));
			this.registerDomEvent(tab, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.switchPage(i); }
			});
		});
	}

	private switchPage(index: number): void {
		this.currentPage = index;
		this.tabsEl?.querySelectorAll<HTMLElement>('.drawing-view-tab').forEach((tab, i) => {
			const active = i === index;
			tab.toggleClass('is-active', active);
			tab.setAttribute('aria-selected', String(active));
			tab.setAttribute('tabindex', active ? '0' : '-1');
		});
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
			this.renderer.onViewChange(() => this.updateStatus());
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
			// no prepareForRender step needed, just hand the page straight over.
			bbox = this.renderer.load(JSON.stringify(page));
		} else {
			// Register locally-cached libs + inline local SVGs BEFORE the first paint
			// so everything already downloaded renders correctly in a single pass.
			// Only genuinely-missing (network-required) libs are deferred to a banner.
			const processedXml = await this.prepareForRender((page as DrawioPage).xml);
			// The component may have unloaded while prepareForRender was awaiting
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
			});
		}
	}

	/** Build the param string representing the current viewer state. */
	private buildParamString(): string {
		const parts: string[] = [`file=${this.options.filename}`];
		if (this.options.height > 0) parts.push(`height=${this.options.height}`);

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

	// ── Stencil libs: local-first render + missing-lib download prompt ────────

	/** Libs (stencil stems) waiting for the user to trigger a download. */
	private pendingStencils: string[] = [];
	/** SVG image ref paths waiting for the user to trigger a download. */
	private pendingImages: string[] = [];

	/**
	 * Register locally-cached stencil libs and inline locally-cached SVGs, then
	 * return the render-ready XML.  Runs BEFORE the first paint so everything
	 * already on disk renders in one pass.  Genuinely-missing (network-required)
	 * libs are detected in the background and surfaced via a banner — they never
	 * block or double-render.
	 */
	private async prepareForRender(pageXml: string): Promise<string> {
		const adapter = this.app.vault.adapter;
		const userDir = this.settings.customStencilDir?.trim() || null;

		const neededLibs = stencilManager.detectUsedLibs(pageXml);
		if (neededLibs.length > 0) {
			await stencilManager.registerLocalLibs(neededLibs, pageXml, adapter, this.stencilsDir, userDir);
		}
		const { xml, missing: missingImages } = await stencilManager.preloadImages(
			pageXml, adapter, this.stencilsDir,
		);

		// Detect what's still missing from disk (background — no blocking).
		void this.checkMissingLibs(neededLibs, missingImages);
		return xml;
	}

	private async checkMissingLibs(neededLibs: string[], missingImages: string[]): Promise<void> {
		const adapter = this.app.vault.adapter;
		const userDir = this.settings.customStencilDir?.trim() || null;
		const missingStencils = await stencilManager.findMissingLibs(
			neededLibs, adapter, this.stencilsDir, userDir,
		);
		if (this.unloaded) return;

		this.pendingStencils = missingStencils;
		this.pendingImages = missingImages;

		if (missingStencils.length === 0 && missingImages.length === 0) {
			this.libsBannerEl?.removeClass('is-visible');
			return;
		}

		// Build human-readable names: stencil libs by catalog name, image refs by
		// their top-level lib folder (e.g. "ibm/social/x.svg" → "IBM").
		const stencilNames = missingStencils.map(lib =>
			OFFICIAL_LIBS.find(e => e.file === lib)?.name ?? lib);
		const imageLibStems = [...new Set(missingImages.map(r => r.split('/')[0]!))];
		const imageNames = imageLibStems.map(stem =>
			OFFICIAL_LIBS.find(e => e.file === stem)?.name ?? stem);
		this.showLibsBanner([...new Set([...stencilNames, ...imageNames])]);
	}

	private showLibsBanner(names: string[]): void {
		const banner = this.libsBannerEl;
		if (!banner) return;
		banner.empty();

		const msg = banner.createSpan({ cls: 'drawio-libs-banner-msg' });
		msg.appendText(`⚠ Missing shape libraries: ${names.join(', ')} `);
		msg.createSpan({ cls: 'drawio-libs-banner-hint', text: '— download here or in plugin settings' });

		const actions = banner.createDiv('drawio-libs-banner-actions');

		const dlBtn = actions.createSpan({
			cls: 'drawio-libs-banner-btn drawio-libs-banner-btn-primary',
			attr: { role: 'button', tabindex: '0' },
			text: 'Download',
		});
		this.registerDomEvent(dlBtn, 'click', () => { void this.downloadPending(); });
		this.registerDomEvent(dlBtn, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void this.downloadPending(); }
		});

		const settingsBtn = actions.createSpan({
			cls: 'drawio-libs-banner-btn',
			attr: { role: 'button', tabindex: '0' },
			text: 'Settings',
		});
		this.registerDomEvent(settingsBtn, 'click', () => { this.openPluginSettings(); });
		this.registerDomEvent(settingsBtn, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openPluginSettings(); }
		});

		const dismissBtn = actions.createSpan({
			cls: 'drawio-libs-banner-btn',
			attr: { role: 'button', tabindex: '0' },
			text: '✕',
		});
		this.registerDomEvent(dismissBtn, 'click', () => { banner.removeClass('is-visible'); });

		banner.addClass('is-visible');
	}

	/** Open Obsidian's settings dialog on this plugin's tab. */
	private openPluginSettings(): void {
		const setting = (this.app as unknown as {
			setting?: { open(): void; openTabById(id: string): void };
		}).setting;
		setting?.open();
		setting?.openTabById('rich-view');
	}

	private async downloadPending(): Promise<void> {
		const banner = this.libsBannerEl;
		if (!banner) return;
		const adapter = this.app.vault.adapter;
		const userDir = this.settings.customStencilDir?.trim() || null;
		const stencils = this.pendingStencils;
		const images = this.pendingImages;

		banner.empty();
		const msg = banner.createSpan({ cls: 'drawio-libs-banner-msg', text: 'Downloading…' });

		const results = await Promise.allSettled([
			...stencils.map(lib => stencilManager.downloadLib(lib, adapter, this.stencilsDir)),
			...images.map(ref => stencilManager.downloadImage(ref, adapter, this.stencilsDir)),
		]);
		// Component may have unloaded while the downloads were in flight — the
		// banner DOM is stale and renderCurrentPage() would otherwise resurrect
		// a GraphRenderer that nothing will ever destroy().
		if (this.unloaded) return;

		if (results.some(r => r.status === 'rejected')) {
			banner.empty();
			banner.createSpan({
				cls: 'drawio-libs-banner-msg drawio-libs-banner-error',
				text: 'Some downloads failed — check your network and reload.',
			});
			const dismiss = banner.createDiv('drawio-libs-banner-actions').createSpan({
				cls: 'drawio-libs-banner-btn', attr: { role: 'button', tabindex: '0' }, text: '✕',
			});
			this.registerDomEvent(dismiss, 'click', () => { banner.removeClass('is-visible'); });
			return;
		}

		msg.setText('Done — rendering…');
		// Register the newly downloaded stencil libs, then re-render once.
		// Stencil libs are a draw.io-only concept (Visio never shows this banner).
		const pageXml = (this.pages[this.currentPage] as DrawioPage | undefined)?.xml ?? '';
		await stencilManager.registerLocalLibs(stencils, pageXml, adapter, this.stencilsDir, userDir);
		banner.removeClass('is-visible');
		void this.renderCurrentPage();
	}

	/** Write the current page/zoom/offset back into the source code block. */
	private async applyCurrentView(): Promise<void> {
		if (!this.onUpdate) return;
		// buildParamString already accounts for the uncommitted visual transform,
		// so no flush is needed — avoids an extra redraw on click.
		await this.onUpdate(this.buildParamString());
	}

	private setupInteraction(graphEl: HTMLElement): void {
		// Double-click → reset view.
		this.registerDomEvent(graphEl, 'dblclick', (e: MouseEvent) => {
			if (this.magnifierActive) return;
			e.preventDefault();
			e.stopPropagation();
			this.resetView();
		}, true);

		this.setupMagnifierInteraction(graphEl);

		// Pan / zoom / pinch are owned by PanZoomController (created alongside the
		// renderer in renderCurrentPage).  What remains here is hover + link follow.

		// ── Hover cursor + link tooltip ───────────────────────────────────────
		let hoverRaf = 0;
		this.registerDomEvent(graphEl, 'mousemove', (e: MouseEvent) => {
			if (this.magnifierActive || hoverRaf || !this.renderer) return;
			const clientX = e.clientX;
			const clientY = e.clientY;
			hoverRaf = window.requestAnimationFrame(() => {
				hoverRaf = 0;
				if (!this.renderer) return;
				const v = this.controller?.getVisual() ?? { scale: 1, tx: 0, ty: 0 };
				const rect = graphEl.getBoundingClientRect();
				const panX = (clientX - rect.left - v.tx) / v.scale;
				const panY = (clientY - rect.top  - v.ty) / v.scale;
				const shape = this.renderer.getShapeAt(panX, panY);
				graphEl.toggleClass('has-link-hover', shape?.link != null);
				// Only reposition the tooltip when entering a new cell — keeps it
				// frozen in place so the user can move the cursor to reach it.
				if (shape?.id !== this.hoveredCellId) {
					this.hoveredCellId = shape?.id ?? null;
					this.hoveredLink   = shape?.link ?? null;
					if (shape && this.highlightEl) {
						this.highlightEl.setCssProps({
							'--dw-hl-x': `${Math.round(shape.bounds.x)}px`,
							'--dw-hl-y': `${Math.round(shape.bounds.y)}px`,
							'--dw-hl-w': `${Math.round(shape.bounds.w)}px`,
							'--dw-hl-h': `${Math.round(shape.bounds.h)}px`,
						});
						this.highlightEl.addClass('is-visible');
					} else {
						this.highlightEl?.removeClass('is-visible');
					}
					if (shape && this.tooltipEl && this.tooltipTextEl) {
						window.clearTimeout(this.hideTooltipTimer);
						if (shape.link) {
							const action = this.settings.panModifier === 'none' ? 'Ctrl+click' : 'Click';
							const label = shape.link.length > 60 ? shape.link.slice(0, 57) + '…' : shape.link;
							this.tooltipTextEl.setText(`${action} to open: ${label}`);
							this.tooltipTextEl.addClass('is-visible');
						} else {
							this.tooltipTextEl.setText('');
							this.tooltipTextEl.removeClass('is-visible');
						}
						// Anchor tooltip to the center of the shape.
						// shape.bounds are in panEl local coords; apply the visual
						// transform to get graphEl-relative pixels.
						const cRect = this.container.getBoundingClientRect();
						const gRect = graphEl.getBoundingClientRect();
						const cx = (shape.bounds.x + shape.bounds.w / 2) * v.scale + v.tx + (gRect.left - cRect.left);
						const cy = (shape.bounds.y + shape.bounds.h / 2) * v.scale + v.ty + (gRect.top  - cRect.top);
						this.tooltipEl.setCssProps({
							'--dw-tip-x': `${Math.round(cx)}px`,
							'--dw-tip-y': `${Math.round(cy)}px`,
						});
						this.tooltipEl.addClass('is-visible');
					} else {
						this.tooltipEl?.removeClass('is-visible');
					}
				}
			});
		});
		// Delay hiding the tooltip so the user can move the mouse onto the ✎ button.
		this.registerDomEvent(graphEl, 'mouseleave', () => {
			graphEl.removeClass('has-link-hover');
			this.highlightEl?.removeClass('is-visible');
			this.hideTooltipTimer = window.setTimeout(() => {
				this.tooltipEl?.removeClass('is-visible');
			}, 400);
		});
		if (this.tooltipEl) {
			this.registerDomEvent(this.tooltipEl, 'mouseenter', () => {
				window.clearTimeout(this.hideTooltipTimer);
			});
			this.registerDomEvent(this.tooltipEl, 'mouseleave', () => {
				this.tooltipEl?.removeClass('is-visible');
			});
		}

		// Click: stop embed propagation; follow link when appropriate.
		this.registerDomEvent(graphEl, 'click', (e: MouseEvent) => {
			e.stopPropagation();
			if (this.magnifierActive || this.controller?.didGesture || !this.renderer) return;
			const ctrlHeld = e.ctrlKey || e.metaKey;
			// pan-first: Ctrl+click follows link; link-first: plain click follows link.
			const shouldFollow = this.settings.panModifier === 'none' ? ctrlHeld : !ctrlHeld;
			if (!shouldFollow) return;
			const v = this.controller?.getVisual() ?? { scale: 1, tx: 0, ty: 0 };
			const rect = graphEl.getBoundingClientRect();
			const panX = (e.clientX - rect.left - v.tx) / v.scale;
			const panY = (e.clientY - rect.top  - v.ty) / v.scale;
			const link = this.renderer.getLinkAt(panX, panY);
			if (link) this.navigateLink(link);
		}, true);
	}

	private openExternal(): void {
		// openWithDefaultApp is a runtime-only method not exposed in Obsidian's types.
		(this.app as unknown as { openWithDefaultApp(p: string): Promise<void> })
			.openWithDefaultApp(this.options.filename)
			.catch((err: unknown) => console.error('DrawingViewer open:', err));
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

	private readonly MAGNIFIER_RADIUS_MIN = 40;
	private readonly MAGNIFIER_RADIUS_MAX = 260;
	private readonly MAGNIFIER_RADIUS_STEP = 15;

	/**
	 * Wires the loupe: a document-wide capture-phase pointerdown listener
	 * closes it on any click outside the toggle button (and, since capture
	 * fires before any bubble-phase listener on graphEl, transparently blocks
	 * the click-to-follow-link handler while active — PanZoomController's own
	 * pan-start is blocked separately via setSuspended(), see toggleMagnifier).
	 * Wheel is intentionally left alone — it keeps zooming the main view, the
	 * magnifier's fixed magnifierZoom is assumed legible on its own.
	 */
	private setupMagnifierInteraction(graphEl: HTMLElement): void {
		this.registerDomEvent(graphEl, 'mousemove', (e: MouseEvent) => {
			if (!this.magnifierActive) return;
			const rect = graphEl.getBoundingClientRect();
			this.magnifierMx = e.clientX - rect.left;
			this.magnifierMy = e.clientY - rect.top;
			this.applyMagnifierTransform();
		});

		this.registerDomEvent(activeDocument, 'pointerdown', (e: PointerEvent) => {
			if (!this.magnifierActive) return;
			const target = e.target as Node | null;
			if (this.magnifierBtnEl && (target === this.magnifierBtnEl || this.magnifierBtnEl.contains(target))) return;
			e.preventDefault();
			e.stopPropagation();
			this.deactivateMagnifier();
		}, true);

		// Capture phase, and on activeDocument rather than graphEl: without this,
		// CodeMirror's own keydown handling on the (still-focused) editor runs
		// first — at the target phase, before the event ever bubbles up here —
		// and types the "+"/"-" character into the note instead of resizing.
		this.registerDomEvent(activeDocument, 'keydown', (e: KeyboardEvent) => {
			if (!this.magnifierActive) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.deactivateMagnifier();
			} else if (e.key === '+' || e.key === '=') {
				e.preventDefault();
				e.stopPropagation();
				this.magnifierRadius = Math.min(this.MAGNIFIER_RADIUS_MAX, this.magnifierRadius + this.MAGNIFIER_RADIUS_STEP);
				this.applyMagnifierTransform();
			} else if (e.key === '-' || e.key === '_') {
				e.preventDefault();
				e.stopPropagation();
				this.magnifierRadius = Math.max(this.MAGNIFIER_RADIUS_MIN, this.magnifierRadius - this.MAGNIFIER_RADIUS_STEP);
				this.applyMagnifierTransform();
			}
		}, true);
	}

	private toggleMagnifier(): void {
		if (this.magnifierActive) { this.deactivateMagnifier(); return; }
		if (!this.panEl || !this.graphEl || !this.magnifierEl || !this.magnifierViewportEl) return;
		this.magnifierActive = true;
		this.controller?.setSuspended(true);
		this.graphEl.addClass('is-magnifying');
		this.magnifierEl.addClass('is-active');
		this.magnifierBtnEl?.addClass('is-active');
		// Clone panEl's current render (including its live --dw-* pan/zoom
		// transform, copied verbatim onto the clone's inline style) so the
		// loupe shows the same content without needing a second live render.
		this.magnifierViewportEl.empty();
		this.magnifierViewportEl.appendChild(this.panEl.cloneNode(true));
		const rect = this.graphEl.getBoundingClientRect();
		this.magnifierMx = rect.width / 2;
		this.magnifierMy = rect.height / 2;
		this.applyMagnifierTransform();
	}

	private deactivateMagnifier(): void {
		this.magnifierActive = false;
		this.controller?.setSuspended(false);
		this.graphEl?.removeClass('is-magnifying');
		this.magnifierEl?.removeClass('is-active');
		this.magnifierBtnEl?.removeClass('is-active');
		this.magnifierViewportEl?.empty();
	}

	private applyMagnifierTransform(): void {
		if (!this.magnifierActive || !this.magnifierEl || !this.magnifierViewportEl || !this.graphEl) return;
		this.magnifierEl.setCssProps({
			'--dw-mag-x': `${this.magnifierMx}px`,
			'--dw-mag-y': `${this.magnifierMy}px`,
			'--dw-mag-size': `${this.magnifierRadius * 2}px`,
		});
		this.magnifierViewportEl.setCssProps({
			'--dw-mag-vp-left': `${this.magnifierRadius - this.magnifierMx}px`,
			'--dw-mag-vp-top': `${this.magnifierRadius - this.magnifierMy}px`,
			'--dw-mag-vp-w': `${this.graphEl.clientWidth}px`,
			'--dw-mag-vp-h': `${this.graphEl.clientHeight}px`,
			'--dw-mag-origin-x': `${this.magnifierMx}px`,
			'--dw-mag-origin-y': `${this.magnifierMy}px`,
			'--dw-mag-zoom': `${this.magnifierZoom}`,
		});
	}

	private updateStatus(): void {
		if (!this.statusEl || !this.renderer) return;
		const pct = Math.round(this.currentScale() * 100);
		const off = this.currentDisplayOffset();
		this.statusEl.setText(`${pct}% (${Math.round(off.x)}, ${Math.round(off.y)})`);
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
