import { Component } from 'obsidian';

const RADIUS_MIN = 40;
const RADIUS_MAX = 260;
const RADIUS_STEP = 15;
const ZOOM = 2.5;

export interface MagnifierHost {
	/** The clipping viewport the loupe floats in and tracks the pointer over. */
	graphEl: HTMLElement;
	/** The pan layer whose live render is cloned into the loupe. */
	panEl: HTMLElement;
	/** Pause/resume the main view's own pan/zoom input while the loupe owns the pointer. */
	setViewportSuspended(suspended: boolean): void;
	/** True when `node` is (inside) the control that toggles the loupe, so clicking it isn't read as "click outside". */
	isToggleTarget(node: Node | null): boolean;
	onActiveChange(active: boolean): void;
}

/**
 * A circular loupe over a canvas viewer. Format-agnostic: it only clones the
 * pan layer's DOM, so it works for any renderer that draws into `panEl`.
 *
 * Wheel is intentionally left alone — it keeps zooming the main view; the
 * fixed ZOOM is assumed legible on its own.
 */
export class Magnifier extends Component {
	private readonly el: HTMLElement;
	private readonly viewportEl: HTMLElement;
	private isActive = false;
	private radius = 90;
	private mx = 0;
	private my = 0;

	constructor(private readonly host: MagnifierHost) {
		super();
		// Sibling of panEl so it clips against graphEl's own overflow:hidden box.
		this.el = host.graphEl.createDiv('drawing-view-magnifier');
		this.viewportEl = this.el.createDiv('drawing-view-magnifier-viewport');
	}

	get active(): boolean {
		return this.isActive;
	}

	onload(): void {
		this.registerDomEvent(this.host.graphEl, 'mousemove', (e: MouseEvent) => {
			if (!this.isActive) return;
			const rect = this.host.graphEl.getBoundingClientRect();
			this.mx = e.clientX - rect.left;
			this.my = e.clientY - rect.top;
			this.applyTransform();
		});

		// Capture phase: runs before any bubble-phase listener on graphEl, so a
		// click that dismisses the loupe also never reaches the follow-link handler.
		this.registerDomEvent(activeDocument, 'pointerdown', (e: PointerEvent) => {
			if (!this.isActive || this.host.isToggleTarget(e.target as Node | null)) return;
			e.preventDefault();
			e.stopPropagation();
			this.deactivate();
		}, true);

		// Capture phase on activeDocument: otherwise CodeMirror's own keydown
		// handling on the (still-focused) editor types the "+"/"-" into the note.
		this.registerDomEvent(activeDocument, 'keydown', (e: KeyboardEvent) => {
			if (!this.isActive) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.deactivate();
			} else if (e.key === '+' || e.key === '=') {
				e.preventDefault();
				e.stopPropagation();
				this.radius = Math.min(RADIUS_MAX, this.radius + RADIUS_STEP);
				this.applyTransform();
			} else if (e.key === '-' || e.key === '_') {
				e.preventDefault();
				e.stopPropagation();
				this.radius = Math.max(RADIUS_MIN, this.radius - RADIUS_STEP);
				this.applyTransform();
			}
		}, true);
	}

	onunload(): void {
		this.el.remove();
	}

	toggle(): void {
		if (this.isActive) { this.deactivate(); return; }
		this.isActive = true;
		this.host.setViewportSuspended(true);
		this.host.graphEl.addClass('is-magnifying');
		this.el.addClass('is-active');
		// Clone panEl's current render, including its live --dw-* pan/zoom
		// transform, so the loupe shows the same content without a second render.
		this.viewportEl.empty();
		this.viewportEl.appendChild(this.host.panEl.cloneNode(true));
		const rect = this.host.graphEl.getBoundingClientRect();
		this.mx = rect.width / 2;
		this.my = rect.height / 2;
		this.applyTransform();
		this.host.onActiveChange(true);
	}

	deactivate(): void {
		if (!this.isActive) return;
		this.isActive = false;
		this.host.setViewportSuspended(false);
		this.host.graphEl.removeClass('is-magnifying');
		this.el.removeClass('is-active');
		this.viewportEl.empty();
		this.host.onActiveChange(false);
	}

	private applyTransform(): void {
		if (!this.isActive) return;
		const { graphEl } = this.host;
		this.el.setCssProps({
			'--dw-mag-x': `${this.mx}px`,
			'--dw-mag-y': `${this.my}px`,
			'--dw-mag-size': `${this.radius * 2}px`,
		});
		this.viewportEl.setCssProps({
			'--dw-mag-vp-left': `${this.radius - this.mx}px`,
			'--dw-mag-vp-top': `${this.radius - this.my}px`,
			'--dw-mag-vp-w': `${graphEl.clientWidth}px`,
			'--dw-mag-vp-h': `${graphEl.clientHeight}px`,
			'--dw-mag-origin-x': `${this.mx}px`,
			'--dw-mag-origin-y': `${this.my}px`,
			'--dw-mag-zoom': `${ZOOM}`,
		});
	}
}
