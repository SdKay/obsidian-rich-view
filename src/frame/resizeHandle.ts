import { Component, setTooltip } from 'obsidian';
import { t } from '../i18n';

const MIN_HEIGHT = 120;

/** Grip along the bottom edge of the status bar; dragging it resizes `target`'s height. */
export class ResizeHandle extends Component {
	private readonly el: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly target: HTMLElement,
		private readonly onResizeEnd: (heightPx: number) => void,
	) {
		super();
		this.el = parent.createDiv('rich-view-resize-handle');
		this.el.setAttribute('aria-label', t('resizeHandle'));
		setTooltip(this.el, t('resizeHandle'));
	}

	onload(): void {
		let active = false;
		let startY = 0;
		let startHeight = 0;

		this.registerDomEvent(this.el, 'pointerdown', (e: PointerEvent) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			this.el.setPointerCapture(e.pointerId);
			active = true;
			startY = e.clientY;
			startHeight = this.target.getBoundingClientRect().height;
			this.target.addClass('is-resizing');
		});

		this.registerDomEvent(this.el, 'pointermove', (e: PointerEvent) => {
			if (!active) return;
			const height = Math.max(MIN_HEIGHT, Math.round(startHeight + (e.clientY - startY)));
			this.target.style.setProperty('height', `${height}px`);
		});

		const finish = () => {
			if (!active) return;
			active = false;
			this.target.removeClass('is-resizing');
			this.onResizeEnd(Math.round(this.target.getBoundingClientRect().height));
		};
		this.registerDomEvent(this.el, 'pointerup', finish);
		this.registerDomEvent(this.el, 'pointercancel', finish);
	}
}
