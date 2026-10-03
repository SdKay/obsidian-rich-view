import { Component, setIcon, setTooltip } from 'obsidian';
import { t } from '../i18n';
import type { ActionSlot } from './actions';

/** The row of icon buttons on the status bar's right: common actions, a divider, then format-specific ones. */
export class ActionStrip extends Component {
	readonly el: HTMLElement;
	private buttons = new Map<string, HTMLElement>();

	constructor(parent: HTMLElement) {
		super();
		this.el = parent.createDiv('rich-view-actions');
	}

	render(slots: readonly ActionSlot[]): void {
		this.el.empty();
		this.buttons.clear();
		for (const slot of slots) {
			if (slot.kind === 'separator') {
				this.el.createDiv('rich-view-action-divider');
			} else if (slot.kind === 'common') {
				this.addButton(slot.spec.id, slot.spec.icon, t(slot.spec.labelKey), slot.run);
			} else {
				this.addButton(slot.action.id, slot.action.icon, slot.action.label, slot.action.run);
			}
		}
	}

	setActive(id: string, active: boolean): void {
		this.buttons.get(id)?.toggleClass('is-active', active);
	}

	isTarget(id: string, node: Node | null): boolean {
		const btn = this.buttons.get(id);
		return !!btn && !!node && (btn === node || btn.contains(node));
	}

	private addButton(id: string, icon: string, label: string, run: () => void): void {
		const btn = this.el.createSpan({
			cls: 'rich-view-action',
			attr: { role: 'button', tabindex: '0', 'aria-label': label },
		});
		setIcon(btn, icon);
		setTooltip(btn, label);
		btn.addEventListener('click', run);
		btn.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); }
		});
		this.buttons.set(id, btn);
	}
}
