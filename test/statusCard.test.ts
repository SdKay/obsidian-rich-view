import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
	setIcon: (el: HTMLElement, name: string) => { el.dataset.icon = name; },
}));

import { addActionButton, renderStatusCard } from '../src/statusCard';

/** The helpers Obsidian adds to HTMLElement, in the small part this module uses. */
function installObsidianDom(): void {
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.createDiv = function (this: HTMLElement, o: { cls?: string; text?: string } | string = {}) {
		const d = document.createElement('div');
		const x = typeof o === 'string' ? { cls: o } : o;
		if (x.cls) d.className = x.cls;
		if (x.text) d.textContent = x.text;
		this.appendChild(d);
		return d;
	};
	proto.createSpan = function (this: HTMLElement, o: { cls?: string; text?: string; attr?: Record<string, string> } = {}) {
		const s = document.createElement('span');
		if (o.cls) s.className = o.cls;
		if (o.text) s.textContent = o.text;
		for (const [k, v] of Object.entries(o.attr ?? {})) s.setAttribute(k, v);
		this.appendChild(s);
		return s;
	};
}

describe('renderStatusCard', () => {
	let host: HTMLElement;
	beforeEach(() => { installObsidianDom(); host = document.createElement('div'); });
	const text = (sel: string) => host.querySelector(sel)?.textContent;

	it('shows the icon, title, detail and hint it is given, in that order', () => {
		renderStatusCard(host, { icon: 'file-x', title: 'File not found', detail: 'a/b.drawio', hint: 'Moved?' });
		expect(host.querySelector<HTMLElement>('.drawing-view-status-icon')!.dataset.icon).toBe('file-x');
		expect(text('.drawing-view-status-title')).toBe('File not found');
		expect(text('.drawing-view-status-detail')).toBe('a/b.drawio');
		expect(text('.drawing-view-status-hint')).toBe('Moved?');
		const order = Array.from(host.querySelector('.drawing-view-status')!.children).map(c => c.className.split(' ')[0]);
		expect(order).toEqual(['drawing-view-status-icon', 'drawing-view-status-title', 'drawing-view-status-detail', 'drawing-view-status-hint']);
	});

	it('leaves out the detail, hint and button when it has none', () => {
		renderStatusCard(host, { icon: 'file-plus', title: 'Choose a file' });
		expect(host.querySelector('.drawing-view-status-detail')).toBeNull();
		expect(host.querySelector('.drawing-view-status-hint')).toBeNull();
		expect(host.querySelector('[role=button]')).toBeNull();
	});

	it('is neutral unless it is told the news is bad', () => {
		expect(renderStatusCard(host, { icon: 'x', title: 't' }).classList.contains('is-neutral')).toBe(true);
		expect(renderStatusCard(host, { icon: 'x', title: 't', tone: 'error' }).classList.contains('is-error')).toBe(true);
	});

	it('renders the action as the button other prompts also use, reachable by keyboard', () => {
		renderStatusCard(host, { icon: 'x', title: 't', action: { label: 'Choose another file', run: () => {} } });
		const btn = host.querySelector('[role=button]')!;
		expect(btn.className).toBe('drawing-view-action');
		expect(btn.getAttribute('tabindex')).toBe('0');
		expect(btn.getAttribute('aria-label')).toBe('Choose another file');
		expect(btn.textContent).toBe('Choose another file');
	});

	it('runs the action on a click, Enter and Space, and not on other keys', () => {
		const run = vi.fn();
		renderStatusCard(host, { icon: 'x', title: 't', action: { label: 'Go', run } });
		const btn = host.querySelector<HTMLElement>('[role=button]')!;
		btn.click();
		expect(run).toHaveBeenCalledTimes(1);
		for (const key of ['Enter', ' ']) btn.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
		expect(run).toHaveBeenCalledTimes(3);
		btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true }));
		btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
		expect(run).toHaveBeenCalledTimes(3);
	});

	it('stops Space from scrolling the note when it triggers the action', () => {
		renderStatusCard(host, { icon: 'x', title: 't', action: { label: 'Go', run: () => {} } });
		const e = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
		host.querySelector('[role=button]')!.dispatchEvent(e);
		expect(e.defaultPrevented).toBe(true);
	});
});

describe('addActionButton', () => {
	beforeEach(() => { installObsidianDom(); });

	it('takes the class it is given, so a small or quiet variant still shares the base look', () => {
		const host = document.createElement('div');
		expect(addActionButton(host, 'Close', () => {}, 'drawing-view-action is-quiet').className).toBe('drawing-view-action is-quiet');
		expect(addActionButton(host, 'Go', () => {}).className).toBe('drawing-view-action');
	});
});
