export interface Size { width: number; height: number }

const MIN_ZOOM_PERCENT = 10;
const MAX_ZOOM_PERCENT = 400;
/** Breathing room kept around a fitted slide, in px. */
const FIT_PADDING = 8;

/** Zoom percent (relative to the slide's native size) at which the whole slide fits the viewport. */
export function fitZoomPercent(slide: Size, viewport: Size): number {
	if (slide.width <= 0 || slide.height <= 0) return 100;
	const availW = Math.max(1, viewport.width - FIT_PADDING * 2);
	const availH = Math.max(1, viewport.height - FIT_PADDING * 2);
	return clampZoomPercent(Math.min(availW / slide.width, availH / slide.height) * 100);
}

export function clampZoomPercent(percent: number): number {
	return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, Math.round(percent)));
}

/** Zoom after one wheel notch; `deltaY < 0` zooms in. Multiplicative so each notch feels the same at any zoom. */
export function wheelZoomPercent(current: number, deltaY: number): number {
	const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
	return clampZoomPercent(current * factor);
}
