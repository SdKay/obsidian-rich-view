import { describe, expect, it } from 'vitest';
import type { VisioPage, VisioShape } from '../src/visioParser';
import { VisioRenderer } from '../src/visioRenderer';

// This file gives the renderer a canvas whose text width it controls: 10 px per character, whatever the font.
// It is a separate file because the renderer keeps its measuring context for the life of the module.
const fonts: string[] = [];
const fakeContext = {
	set font(v: string) { fonts.push(v); },
	get font() { return fonts[fonts.length - 1] ?? ''; },
	measureText: (t: string) => ({ width: [...t].length * 10 }),
};
(globalThis as { createEl?: unknown }).createEl = (tag: string) => {
	const el = document.createElement(tag);
	if (tag === 'canvas') (el as unknown as { getContext: () => unknown }).getContext = () => fakeContext;
	return el;
};

const shape = (over: Partial<VisioShape> = {}): VisioShape => ({
	id: '1', subpaths: [], fillPattern: 1, linePattern: 1, strokeWidth: 1, text: 'aaa bbb ccc', textX: 100, textY: 50,
	textHAlign: 'middle', textVAlign: 'middle', textWidth: 75, fontSize: 12, bbox: { x: 0, y: 0, width: 200, height: 100 }, ...over,
});
function lines(s: VisioShape): string[] {
	const container = document.createElement('div') as HTMLElement & { empty: () => void };
	container.empty = () => { container.replaceChildren(); };
	const page: VisioPage = { id: '0', name: 'P', width: 400, height: 300, shapes: [s] };
	new VisioRenderer(container).load(JSON.stringify(page));
	return Array.from(container.querySelectorAll('tspan')).map(t => t.textContent ?? '');
}

describe('text wrapping measures with the font that is drawn', () => {
	it('wraps to the width it is given: at 10 px a character "aaa bbb ccc" is 110 px, so 75 px forces breaks', () => {
		// the trailing space of "aaa " counts toward the width, as it always has: "aaa bbb " is 80 px and does not fit
		expect(lines(shape())).toEqual(['aaa', 'bbb ccc']);
	});
	it('measures in the file\'s own font, weight and slant, so the breaks match what is drawn', () => {
		fonts.length = 0;
		lines(shape({ fontFamily: 'Calibri', bold: true, italic: true }));
		expect(fonts.length).toBeGreaterThan(0);
		for (const f of fonts) { expect(f).toContain('"Calibri"'); expect(f).toContain('bold'); expect(f).toContain('italic'); expect(f).toContain('12px'); }
	});
	it('keeps measuring in the font it always used when the file names none', () => {
		fonts.length = 0;
		lines(shape());
		for (const f of fonts) expect(f).toBe('12px sans-serif');
	});
	it('wraps within the width left after margins: a narrower text width breaks earlier', () => {
		expect(lines(shape({ textWidth: 45 }))).toEqual(['aaa', 'bbb', 'ccc']);
		expect(lines(shape({ textWidth: 200 }))).toEqual(['aaa bbb ccc']);
	});
});
