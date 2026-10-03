import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from '@aiden0z/pptx-renderer';
import type { FileContent } from './diagramFileContent';
import type { FrameContent } from './frame/types';
import { ViewerFrame } from './frame/viewerFrame';
import { RichViewer, type ViewerContext } from './richViewer';
import { clampZoomPercent, fitZoomPercent, wheelZoomPercent } from './slideFit';
import { switchFile } from './switchFile';

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

	constructor(ctx: ViewerContext) {
		super(ctx);
		this.pinnedZoom = ctx.options.zoom;
	}

	protected isBinary(): boolean {
		return true;
	}

	protected teardown(): void {
		this.viewer?.destroy();
		this.viewer = null;
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
			this.current = this.initialSlide();
			await viewer.goToSlide(this.current);
			await (this.pinnedZoom > 0 ? viewer.setZoom(this.pinnedZoom) : this.refit());
			this.publish();
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
	private paramString(opts: { pinned: boolean }): string {
		const parts = [`file=${this.options.filename}`];
		if (this.options.height > 0) parts.push(`height=${this.options.height}`);
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
