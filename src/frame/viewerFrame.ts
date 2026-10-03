import { Component } from 'obsidian';
import { layoutActions } from './actions';
import { isFullscreen, toggleFullscreen } from './fullscreen';
import { ResizeHandle } from './resizeHandle';
import { StatusBar } from './statusBar';
import type { FrameContent, FrameHooks } from './types';

/**
 * The format-agnostic frame every viewer sits in: a body the viewer fills,
 * and a status bar (tabs / status / actions / height handle) below it.
 * Knows nothing about drawio, Visio, slides... — a viewer hands it a
 * `FrameContent` describing its pages and actions, and draws into `body`.
 */
export class ViewerFrame extends Component {
	readonly body: HTMLElement;
	private readonly bar: StatusBar;
	private savedHeight = '';

	constructor(
		private readonly container: HTMLElement,
		heightPx: number,
		private readonly hooks: FrameHooks,
	) {
		super();
		container.addClass('rich-view-frame');
		// Drop the render-time height reservation main.ts set before the real layout existed.
		container.style.removeProperty('min-height');
		if (heightPx > 0) container.style.setProperty('height', `${heightPx}px`);

		this.body = container.createDiv('rich-view-body');
		this.bar = new StatusBar(container);
		this.addChild(this.bar);
		this.addChild(new ResizeHandle(this.bar.el, container, h => hooks.onHeightChange(h)));
	}

	onload(): void {
		this.registerDomEvent(this.container, 'fullscreenchange', () => { this.onFullscreenChange(); });
	}

	setContent(content: FrameContent): void {
		this.bar.setPages(content.pages, content.currentPage, i => content.onSelectPage(i));
		this.bar.setActions(layoutActions(
			{ ...content.common, fullscreen: () => { this.toggleFullscreen(); } },
			content.specific,
		));
	}

	setCurrentPage(index: number): void {
		this.bar.setCurrentPage(index);
	}

	setStatus(text: string): void {
		this.bar.setStatus(text);
	}

	setActionActive(id: string, active: boolean): void {
		this.bar.setActionActive(id, active);
	}

	isActionTarget(id: string, node: Node | null): boolean {
		return this.bar.isActionTarget(id, node);
	}

	private toggleFullscreen(): void {
		toggleFullscreen(this.container).catch((err: unknown) => console.error('ViewerFrame fullscreen:', err));
	}

	/** An inline `height` would beat the fullscreen CSS, so park it while fullscreen and restore after. */
	private onFullscreenChange(): void {
		const entering = isFullscreen(this.container);
		this.container.toggleClass('is-fullscreen', entering);
		if (entering) {
			this.savedHeight = this.container.style.getPropertyValue('height');
			this.container.style.removeProperty('height');
		} else if (this.savedHeight) {
			this.container.style.setProperty('height', this.savedHeight);
		}
		window.requestAnimationFrame(() => { this.hooks.onBodyResize(); });
	}
}
