import { setIcon } from 'obsidian';

export interface StatusCardSpec {
	/** A Lucide icon name. */
	icon: string;
	title: string;
	/** The file or value the message is about, shown in a monospace line. */
	detail?: string;
	/** One line that says what the user can do about it. */
	hint?: string;
	/** `error` colours the icon; `neutral` is for a block that is simply not set up yet. */
	tone?: 'neutral' | 'error';
	action?: { label: string; run: () => void };
}

/**
 * The one look for everything a block says instead of a diagram: an empty block, a missing file, a file that
 * could not be read, a block with no `file=`. Same icon, title, detail, hint and button in every case, so none of
 * them looks like it came from somewhere else.
 */
export function renderStatusCard(container: HTMLElement, spec: StatusCardSpec): HTMLElement {
	const card = container.createDiv({ cls: `drawing-view-status is-${spec.tone ?? 'neutral'}` });
	setIcon(card.createDiv({ cls: 'drawing-view-status-icon' }), spec.icon);
	card.createDiv({ cls: 'drawing-view-status-title', text: spec.title });
	if (spec.detail) card.createDiv({ cls: 'drawing-view-status-detail', text: spec.detail });
	if (spec.hint) card.createDiv({ cls: 'drawing-view-status-hint', text: spec.hint });
	if (spec.action) addActionButton(card, spec.action.label, spec.action.run);
	return card;
}

/** The button every prompt in the plugin uses; `span role=button` because the theme's `<button>` styles are too aggressive to override. */
export function addActionButton(parent: HTMLElement, label: string, run: () => void, cls = 'drawing-view-action'): HTMLElement {
	const btn = parent.createSpan({ cls, attr: { role: 'button', tabindex: '0', 'aria-label': label }, text: label });
	btn.addEventListener('click', run);
	btn.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); }
	});
	return btn;
}
