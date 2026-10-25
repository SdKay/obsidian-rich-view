import { buildTextIndex, PptxViewer, RECOMMENDED_ZIP_LIMITS, type SearchHighlightHandle, type TextIndexEntry } from '@aiden0z/pptx-renderer';
import type { FileContent } from './diagramFileContent';
import type { FrameContent } from './frame/types';
import { ViewerFrame } from './frame/viewerFrame';
import { RichViewer, type ViewerContext } from './richViewer';
import { clampZoomPercent, fitZoomPercent, wheelZoomPercent } from './slideFit';
import { switchFile } from './switchFile';
import { chooseMarks } from './matchTargets';
import { findSearchHost, readLiveSearch, SearchSubscription } from './searchHost';
import type { MatchOptions } from './richSearchApi';
import type { SearchRequest } from './searchRequest';
import { markStyle, openedPosition, slideUnits, toSearchResult, uniqueByShape } from './slideMarks';
import { addKeywordMarks } from './slideKeywordMarks';

/**
 * Paginated-document viewer (PPT). A page flow, not an infinite canvas, so it
 * does not share DrawingViewer's pan/zoom controller: zoom is the library's
 * own whole-slide scale, and "pan" is the body's native scrolling once the
 * zoomed slide outgrows the viewport.
 */
export class SlideViewer extends RichViewer {
	private frame: ViewerFrame | null = null;
	private viewer: PptxViewer | null = null;
	private stageEl: HTMLElement | null = null;
	private current = 0;
	/** Zoom to restore on load (`zoom=` in the code block); 0 means fit the whole slide. */
	private pinnedZoom: number;
	/** Text of every box and cell in the deck, built once per opened deck and used to mark search hits. */
	private textIndex: TextIndexEntry[] = [];
	private marks: SearchHighlightHandle[] = [];
	/** Keyword-level marks added straight into text boxes; removed with the rest on every redraw. */
	private keywordMarks: HTMLElement[] = [];
	private readonly search = new SearchSubscription(() => findSearchHost(this.app), () => { void this.refreshMarks(); });
	/** Bumped on every redraw of the marks, so a slow earlier pass cannot draw over a newer one. */
	private markGeneration = 0;
	/** The query that came with the click, used only when the host cannot tell the live one (contract 5.8). */
	private clickedQuery: MatchOptions | undefined;

	constructor(ctx: ViewerContext) {
		super(ctx);
		this.pinnedZoom = ctx.options.zoom;
	}

	protected isBinary(): boolean {
		return true;
	}

	protected teardown(): void {
		this.search.stop();
		this.markGeneration++;
		this.marks = [];
		this.keywordMarks = [];
		this.viewer?.destroy();
		this.viewer = null;
		this.textIndex = [];
	}

	protected renderContent(content: FileContent): void {
		if (typeof content === 'string') return;
		this.teardown();
		if (this.frame) { this.removeChild(this.frame); this.frame = null; }
		this.container.empty();

		this.frame = new ViewerFrame(this.container, this.options.height, {
			onHeightChange: h => { this.onHeightChanged(h); },
			onBodyResize: () => { void this.refit(); },
		});
		this.addChild(this.frame);
		this.stageEl = this.frame.body.createDiv('slide-view-stage');
		this.registerDomEvent(this.stageEl, 'wheel', (e: WheelEvent) => { this.onWheel(e); }, { passive: false });
		void this.open(content);
	}

	private async open(buffer: ArrayBuffer): Promise<void> {
		const stage = this.stageEl;
		if (!stage) return;
		try {
			const viewer = await PptxViewer.open(buffer, stage, {
				zipLimits: RECOMMENDED_ZIP_LIMITS,
				renderMode: 'slide',
				fitMode: 'none',
			});
			if (this.unloaded || this.stageEl !== stage) { viewer.destroy(); return; }
			this.viewer = viewer;
			this.textIndex = viewer.presentationData
				? buildTextIndex(viewer.presentationData, { includeShapes: true, includeTables: true, includeGroups: true })
				: [];
			this.current = this.initialSlide();
			await viewer.goToSlide(this.current);
			await (this.pinnedZoom > 0 ? viewer.setZoom(this.pinnedZoom) : this.refit());
			this.publish();
			this.search.renew();
			await this.refreshMarks();
			this.markReady();
		} catch (err) {
			console.error('SlideViewer:', err);
			stage.empty();
			this.showError(String(err));
		}
	}

	private initialSlide(): number {
		const count = this.viewer?.slideCount ?? 1;
		return Math.min(Math.max(this.options.pageIndex, 0), count - 1);
	}

	/** Fit the whole current slide into the body, whichever dimension is the tighter one. */
	private async refit(): Promise<void> {
		const viewer = this.viewer;
		const stage = this.stageEl;
		if (!viewer || !stage) return;
		await viewer.setZoom(fitZoomPercent(
			{ width: viewer.slideWidth, height: viewer.slideHeight },
			{ width: stage.clientWidth, height: stage.clientHeight },
		));
		this.publish();
	}

	private async goTo(index: number): Promise<void> {
		const viewer = this.viewer;
		if (!viewer) return;
		this.current = Math.min(Math.max(index, 0), viewer.slideCount - 1);
		await viewer.goToSlide(this.current);
		this.frame?.setCurrentPage(this.current);
		this.publish();
		await this.refreshMarks();
	}

	/** Go to the slide a hit names; the marks follow the slide on screen. A foreign or stale anchor changes nothing. */
	override showSearchRequest(request: SearchRequest): void {
		this.clickedQuery = request.query;
		// The user is using rich-search right now, so it exists even if it was enabled after this view opened.
		this.search.renew();
		const slide = slideOfAnchor(request.anchor);
		const viewer = this.viewer;
		if (slide === null || !viewer || slide < 1 || slide > viewer.slideCount) {
			void this.refreshMarks();
			return;
		}
		void this.goTo(slide - 1);
	}

	/**
	 * Marks the text boxes of the slide on screen that match the search, the opened one brighter. The library
	 * only draws whole-shape overlays (no character-level mark), so a text box is marked once however many of
	 * its paragraphs matched — contract 5.6's floor for this format.
	 */
	private async refreshMarks(): Promise<void> {
		const generation = ++this.markGeneration;
		const viewer = this.viewer;
		if (!viewer || this.unloaded) return;
		for (const mark of this.marks) mark.dispose();
		this.marks = [];
		for (const mark of this.keywordMarks) mark.remove();
		this.keywordMarks = [];

		const host = findSearchHost(this.app);
		const { query, hit } = readLiveSearch(host, this.clickedQuery);
		const units = slideUnits(this.textIndex, this.current);
		const chosen = chooseMarks(host, units, query, hit, this.options.filename);
		const byUnit = new Map(units.map(u => [u, u.entry]));
		const marked = uniqueByShape(chosen.map(c => ({ ...c, entry: byUnit.get(c.unit as (typeof units)[number])! })));
		// The opened match, as (text box, paragraph of that box, match within it). Paragraphs are counted as in the index.
		const openedAt = openedPosition(units, chosen);

		const slideEl = this.stageEl?.querySelector<HTMLElement>('div[style*="transform"]') ?? null;
		for (const m of marked) {
			const here = openedAt && openedAt.nodeId === m.entry.nodeId ? { paragraph: openedAt.paragraph, match: openedAt.match } : null;
			// Exact keywords where the drawn text can be measured; otherwise the whole box, so a hit is never unmarked.
			const exact = query && slideEl ? addKeywordMarks(slideEl, m.entry, host, query, here) : null;
			if (exact) { this.keywordMarks.push(...exact); continue; }
			const opened = here !== null;
			const handle = await viewer.highlightSearchResult(toSearchResult(m.entry), {
				scrollIntoView: false,
				style: markStyle(opened),
			});
			if (generation !== this.markGeneration || this.unloaded) { handle?.dispose(); return; }
			if (handle) this.marks.push(handle);
		}
	}

	private onWheel(e: WheelEvent): void {
		const viewer = this.viewer;
		if (!viewer || !(e.ctrlKey || e.metaKey)) return;
		e.preventDefault();
		void viewer.setZoom(wheelZoomPercent(viewer.zoomPercent, e.deltaY)).then(() => { this.publish(); });
	}

	private onHeightChanged(height: number): void {
		this.options.height = height;
		if (this.pinnedZoom === 0) void this.refit();
		this.writeParams?.(this.paramString({ pinned: false }))
			.catch((err: unknown) => console.error('SlideViewer resize:', err));
	}

	/** Current page + zoom as a code-block param line; `pinned: false` keeps zoom unpinned (auto-fit). */
	private paramString(opts: { pinned: boolean; height?: number }): string {
		const parts = [`file=${this.options.filename}`];
		const height = opts.height ?? this.options.height;
		if (height > 0) parts.push(`height=${height}`);
		if (this.current > 0) parts.push(`page-index=${this.current + 1}`);
		const zoom = opts.pinned ? Math.round(this.viewer?.zoomPercent ?? 0) : this.pinnedZoom;
		if (zoom > 0) parts.push(`zoom=${zoom}`);
		return parts.join('|');
	}

	private publish(): void {
		const viewer = this.viewer;
		if (!viewer || !this.frame) return;
		this.frame.setStatus(`${Math.round(viewer.zoomPercent)}%`);
		this.frame.setContent(this.frameContent(viewer));
	}

	private frameContent(viewer: PptxViewer): FrameContent {
		const common: FrameContent['common'] = {
			fit: () => { this.pinnedZoom = 0; void this.refit(); },
			'copy-block': () => { this.copyAsCodeBlock(this.paramString({ pinned: true, height: this.heightForCopy() })); },
			'open-external': () => { this.openExternal(); },
		};
		const writeParams = this.writeParams;
		if (writeParams) {
			common['apply-view'] = () => {
				this.pinnedZoom = clampZoomPercent(viewer.zoomPercent);
				writeParams(this.paramString({ pinned: true }))
					.catch((err: unknown) => console.error('SlideViewer pin:', err));
			};
			common['switch-file'] = () => { switchFile(this.app, this.options, writeParams); };
		}
		return {
			pages: Array.from({ length: viewer.slideCount }, (_, i) => String(i + 1)),
			currentPage: this.current,
			onSelectPage: i => { void this.goTo(i); },
			common,
			specific: [],
		};
	}
}

function slideOfAnchor(anchor: unknown): number | null {
	if (typeof anchor !== 'object' || anchor === null) return null;
	const slide = (anchor as { slide?: unknown }).slide;
	return typeof slide === 'number' && Number.isInteger(slide) ? slide : null;
}
