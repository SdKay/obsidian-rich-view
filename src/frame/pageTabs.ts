import { Component } from 'obsidian';

/**
 * The page/slide tab strip on the status bar's left. Scrolls horizontally
 * when there are more pages than fit, and keeps the active tab in view.
 * Hidden-by-emptiness: fewer than two pages renders no tabs at all.
 */
export class PageTabs extends Component {
	readonly el: HTMLElement;
	private tabs: HTMLElement[] = [];

	constructor(parent: HTMLElement) {
		super();
		this.el = parent.createDiv('rich-view-tabs');
		this.el.setAttribute('role', 'tablist');
	}

	onload(): void {
		// Let a vertical mouse wheel scroll the strip sideways.
		this.registerDomEvent(this.el, 'wheel', (e: WheelEvent) => {
			if (this.el.scrollWidth <= this.el.clientWidth || e.deltaX !== 0) return;
			e.preventDefault();
			this.el.scrollLeft += e.deltaY;
		}, { passive: false });
	}

	setPages(names: readonly string[], current: number, onSelect: (index: number) => void): void {
		this.el.empty();
		this.tabs = [];
		if (names.length < 2) return;
		names.forEach((name, i) => {
			const tab = this.el.createSpan({
				cls: 'rich-view-tab',
				text: name,
				attr: { role: 'tab', 'aria-label': name },
			});
			tab.addEventListener('click', () => onSelect(i));
			tab.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); }
			});
			this.tabs.push(tab);
		});
		this.setCurrent(current);
	}

	setCurrent(index: number): void {
		this.tabs.forEach((tab, i) => {
			const active = i === index;
			tab.toggleClass('is-active', active);
			tab.setAttribute('aria-selected', String(active));
			tab.setAttribute('tabindex', active ? '0' : '-1');
			if (active) tab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
		});
	}
}
