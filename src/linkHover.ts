import { App, Component, setTooltip } from 'obsidian';
import type { DrawingRenderer } from './drawingRenderer';
import { LinkEditorModal } from './linkEditor';
import { t } from './i18n';

interface VisualTransform { scale: number; tx: number; ty: number }

/** What link hover/follow needs from the viewer that owns it. */
export interface LinkHoverHost {
	/** The renderer for the page currently shown; null while none exists. */
	renderer(): DrawingRenderer | null;
	/** The uncommitted pan/zoom transform applied on top of the renderer's own view. */
	visual(): VisualTransform;
	/** True while another overlay (the magnifier) owns the pointer. */
	pointerBusy(): boolean;
	/** True if the current/last pointer interaction was a pan or pinch rather than a click. */
	didGesture(): boolean;
	/** Plain click follows a link instead of Ctrl+click when the user prefers click-to-follow. */
	clickFollowsLink(): boolean;
	followLink(href: string): void;
	/** Rewrite the hovered cell's link in the source file. */
	editLink(cellId: string, link: string): Promise<void>;
}

/**
 * Hover highlight, link tooltip (with its edit button) and click-to-follow
 * for a canvas viewer whose renderer reports hit-tested shapes and links.
 * Everything here is pointer-driven chrome over the canvas, so it needs no
 * knowledge of which file format produced the shapes.
 */
export class LinkHover extends Component {
	private readonly highlightEl: HTMLElement;
	private readonly tooltipEl: HTMLElement;
	private readonly tooltipTextEl: HTMLElement;
	private hoveredCellId: string | null = null;
	private hoveredLink: string | null = null;
	private hideTooltipTimer = 0;
	private hoverRaf = 0;

	constructor(
		private readonly app: App,
		/** Clips and positions the hover layers; also the element pointer events are read from. */
		private readonly graphEl: HTMLElement,
		/** Pan layer the highlight sits in (its coordinates are the renderer's). */
		panEl: HTMLElement,
		/** Frame body the tooltip is positioned against. */
		private readonly bodyEl: HTMLElement,
		private readonly host: LinkHoverHost,
	) {
		super();
		this.highlightEl = panEl.createDiv('drawing-view-highlight');
		this.tooltipEl = bodyEl.createDiv('drawing-view-link-tooltip');
		const editBtn = this.tooltipEl.createSpan({
			cls: 'drawing-view-tooltip-edit',
			text: '✎',
			attr: { role: 'button', tabindex: '0', 'aria-label': t('editLink') },
		});
		setTooltip(editBtn, t('editLink'));
		this.tooltipTextEl = this.tooltipEl.createSpan({ cls: 'drawing-view-tooltip-text' });

		const openEditor = () => {
			const cellId = this.hoveredCellId;
			if (!cellId) return;
			new LinkEditorModal(this.app, this.hoveredLink ?? '', newLink => {
				this.host.editLink(cellId, newLink).catch(
					(err: unknown) => console.error('LinkHover edit:', err),
				);
			}).open();
		};
		this.registerDomEvent(editBtn, 'click', (e: MouseEvent) => {
			e.stopPropagation();
			openEditor();
		});
		this.registerDomEvent(editBtn, 'keydown', (e: KeyboardEvent) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			e.preventDefault();
			openEditor();
		});
	}

	onload(): void {
		this.registerDomEvent(this.graphEl, 'mousemove', (e: MouseEvent) => { this.onMouseMove(e); });

		// Delay hiding the tooltip so the user can move the mouse onto the ✎ button.
		this.registerDomEvent(this.graphEl, 'mouseleave', () => {
			this.graphEl.removeClass('has-link-hover');
			this.highlightEl.removeClass('is-visible');
			this.hideTooltipTimer = window.setTimeout(() => { this.tooltipEl.removeClass('is-visible'); }, 400);
		});
		this.registerDomEvent(this.tooltipEl, 'mouseenter', () => { window.clearTimeout(this.hideTooltipTimer); });
		this.registerDomEvent(this.tooltipEl, 'mouseleave', () => { this.tooltipEl.removeClass('is-visible'); });

		// Capture phase: stops the click reaching the surrounding embed, and
		// follows the link under the pointer when the click rules allow it.
		this.registerDomEvent(this.graphEl, 'click', (e: MouseEvent) => { this.onClick(e); }, true);
	}

	onunload(): void {
		window.clearTimeout(this.hideTooltipTimer);
		window.cancelAnimationFrame(this.hoverRaf);
		this.tooltipEl.remove();
		this.highlightEl.remove();
	}

	/** Pointer position converted into the renderer's own (pan-layer) coordinates. */
	private toPanCoords(clientX: number, clientY: number): { x: number; y: number } {
		const v = this.host.visual();
		const rect = this.graphEl.getBoundingClientRect();
		return { x: (clientX - rect.left - v.tx) / v.scale, y: (clientY - rect.top - v.ty) / v.scale };
	}

	private onMouseMove(e: MouseEvent): void {
		if (this.host.pointerBusy() || this.hoverRaf || !this.host.renderer()) return;
		const { clientX, clientY } = e;
		this.hoverRaf = window.requestAnimationFrame(() => {
			this.hoverRaf = 0;
			const renderer = this.host.renderer();
			if (!renderer) return;
			const p = this.toPanCoords(clientX, clientY);
			const shape = renderer.getShapeAt(p.x, p.y);
			this.graphEl.toggleClass('has-link-hover', shape?.link != null);
			// Only reposition when entering a new cell — keeps the tooltip frozen
			// in place so the user can move the cursor to reach it.
			if (shape?.id === this.hoveredCellId) return;
			this.hoveredCellId = shape?.id ?? null;
			this.hoveredLink = shape?.link ?? null;
			this.updateHighlight(shape?.bounds ?? null);
			this.updateTooltip(shape);
		});
	}

	private updateHighlight(bounds: { x: number; y: number; w: number; h: number } | null): void {
		if (!bounds) { this.highlightEl.removeClass('is-visible'); return; }
		this.highlightEl.setCssProps({
			'--dw-hl-x': `${Math.round(bounds.x)}px`,
			'--dw-hl-y': `${Math.round(bounds.y)}px`,
			'--dw-hl-w': `${Math.round(bounds.w)}px`,
			'--dw-hl-h': `${Math.round(bounds.h)}px`,
		});
		this.highlightEl.addClass('is-visible');
	}

	private updateTooltip(shape: { link: string | null; bounds: { x: number; y: number; w: number; h: number } } | null): void {
		if (!shape) { this.tooltipEl.removeClass('is-visible'); return; }
		window.clearTimeout(this.hideTooltipTimer);
		if (shape.link) {
			const action = this.host.clickFollowsLink() ? 'Click' : 'Ctrl+click';
			const label = shape.link.length > 60 ? shape.link.slice(0, 57) + '…' : shape.link;
			this.tooltipTextEl.setText(`${action} to open: ${label}`);
			this.tooltipTextEl.addClass('is-visible');
		} else {
			this.tooltipTextEl.setText('');
			this.tooltipTextEl.removeClass('is-visible');
		}
		// Anchor to the shape's centre: its bounds are in pan-layer coordinates,
		// so apply the visual transform to get body-relative pixels.
		const v = this.host.visual();
		const bodyRect = this.bodyEl.getBoundingClientRect();
		const graphRect = this.graphEl.getBoundingClientRect();
		const cx = (shape.bounds.x + shape.bounds.w / 2) * v.scale + v.tx + (graphRect.left - bodyRect.left);
		const cy = (shape.bounds.y + shape.bounds.h / 2) * v.scale + v.ty + (graphRect.top - bodyRect.top);
		this.tooltipEl.setCssProps({ '--dw-tip-x': `${Math.round(cx)}px`, '--dw-tip-y': `${Math.round(cy)}px` });
		this.tooltipEl.addClass('is-visible');
	}

	private onClick(e: MouseEvent): void {
		e.stopPropagation();
		const renderer = this.host.renderer();
		if (this.host.pointerBusy() || this.host.didGesture() || !renderer) return;
		const ctrlHeld = e.ctrlKey || e.metaKey;
		// Pan-first: Ctrl+click follows a link. Link-first: a plain click does.
		const shouldFollow = this.host.clickFollowsLink() ? !ctrlHeld : ctrlHeld;
		if (!shouldFollow) return;
		const p = this.toPanCoords(e.clientX, e.clientY);
		const link = renderer.getLinkAt(p.x, p.y);
		if (link) this.host.followLink(link);
	}
}
