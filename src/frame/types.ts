/** Actions every viewer kind can offer, rendered in a fixed order so button positions never shift between formats. */
export type CommonActionId = 'magnifier' | 'fit' | 'apply-view' | 'copy-block' | 'copy-visio' | 'switch-file' | 'open-external' | 'fullscreen';

/** An action only one format has (e.g. a presentation mode); shown after the divider. */
export interface FrameAction {
	id: string;
	/** A Lucide icon name (see lucide.dev), rendered via Obsidian's setIcon. */
	icon: string;
	label: string;
	run: () => void;
}

/** Everything a format-specific viewer tells the frame. The frame never imports a concrete viewer. */
export interface FrameContent {
	/** Page/slide titles in order. Fewer than two hides the tab strip. */
	pages: readonly string[];
	currentPage: number;
	onSelectPage(index: number): void;
	/** Common actions this format implements; unlisted ones are not rendered. Fullscreen is built into the frame and must not be listed. */
	common: Partial<Record<Exclude<CommonActionId, 'fullscreen'>, () => void>>;
	specific: readonly FrameAction[];
}

/** Stable callbacks a viewer registers once, independent of the loaded content. */
export interface FrameHooks {
	/** The user finished dragging the height handle. */
	onHeightChange(heightPx: number): void;
	/** The body's size changed without a drag (entering/leaving fullscreen). */
	onBodyResize(): void;
}
