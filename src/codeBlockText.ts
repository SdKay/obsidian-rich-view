/** A `rich-view` fenced block holding `params`, ready to paste into a note. */
export function formatCodeBlock(params: string): string {
	const longestRun = Math.max(0, ...(params.match(/`+/g) ?? []).map(run => run.length));
	const fence = '`'.repeat(Math.max(3, longestRun + 1));
	return `${fence}rich-view\n${params}\n${fence}`;
}

const DEFAULT_BLOCK_HEIGHT = 400;
const MIN_BLOCK_HEIGHT = 120;

/**
 * The `height=` to write into a copied block. Zoom and offset are measured against the viewport on screen, so the
 * block must be as tall as that viewport, whether or not the original block set a height (a file tab fills the
 * tab; a block without `height=` is 400). A fullscreen view is as tall as the screen, which would not fit a note,
 * so it falls back to the height the block was configured with.
 */
export function blockHeight(view: { measured: number; fullscreen: boolean; configured: number }): number {
	const fallback = view.configured > 0 ? view.configured : DEFAULT_BLOCK_HEIGHT;
	if (view.fullscreen || !Number.isFinite(view.measured) || view.measured <= 0) return fallback;
	return Math.max(MIN_BLOCK_HEIGHT, Math.round(view.measured));
}
