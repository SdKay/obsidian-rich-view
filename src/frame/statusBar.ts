import { Component } from 'obsidian';
import { ActionStrip } from './actionStrip';
import type { ActionSlot } from './actions';
import { PageTabs } from './pageTabs';

/** The bar under every viewer: page tabs left, status text, then the action strip right. */
export class StatusBar extends Component {
	readonly el: HTMLElement;
	private readonly tabs: PageTabs;
	private readonly statusEl: HTMLElement;
	private readonly actions: ActionStrip;

	constructor(parent: HTMLElement) {
		super();
		this.el = parent.createDiv('rich-view-statusbar');
		this.tabs = new PageTabs(this.el);
		this.statusEl = this.el.createDiv('rich-view-status');
		this.statusEl.setAttribute('aria-live', 'polite');
		this.actions = new ActionStrip(this.el);
		this.addChild(this.tabs);
		this.addChild(this.actions);
	}

	setPages(names: readonly string[], current: number, onSelect: (index: number) => void): void {
		this.tabs.setPages(names, current, onSelect);
	}

	setCurrentPage(index: number): void {
		this.tabs.setCurrent(index);
	}

	setStatus(text: string): void {
		this.statusEl.setText(text);
	}

	setActions(slots: readonly ActionSlot[]): void {
		this.actions.render(slots);
	}

	setActionActive(id: string, active: boolean): void {
		this.actions.setActive(id, active);
	}

	isActionTarget(id: string, node: Node | null): boolean {
		return this.actions.isTarget(id, node);
	}
}
