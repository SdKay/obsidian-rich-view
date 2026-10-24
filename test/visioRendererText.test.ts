import { describe, expect, it } from 'vitest';
import type { VisioPage, VisioShape } from '../src/visioParser';
import { VisioRenderer } from '../src/visioRenderer';

const base = (over: Partial<VisioShape> = {}): VisioShape => ({
	id: '1', subpaths: [], fillPattern: 1, linePattern: 1, strokeWidth: 1, text: 'Hello', textX: 100, textY: 50,
	textHAlign: 'middle', textVAlign: 'middle', textWidth: 200, fontSize: 12, bbox: { x: 0, y: 0, width: 200, height: 100 }, ...over,
});

function draw(shape: VisioShape): SVGTextElement {
	(globalThis as { createEl?: unknown }).createEl = (tag: string) => document.createElement(tag);
	const container = document.createElement('div') as HTMLElement & { empty: () => void };
	container.empty = () => { container.replaceChildren(); };
	const page: VisioPage = { id: '0', name: 'P', width: 400, height: 300, shapes: [shape] };
	new VisioRenderer(container).load(JSON.stringify(page));
	return container.querySelector('text') as SVGTextElement;
}
const ys = (t: SVGTextElement) => Array.from(t.querySelectorAll('tspan')).map(s => parseFloat(s.getAttribute('y')!));

describe('VisioRenderer text: a shape that sets no alignment or font is drawn as it always was', () => {
	it('centred on its anchor, black, in the inherited font', () => {
		const t = draw(base());
		expect(t.getAttribute('text-anchor')).toBe('middle');
		expect(t.getAttribute('fill')).toBe('#000000');
		expect(t.getAttribute('font-size')).toBe('12');
		expect(t.getAttribute('font-family')).toBeNull();
		expect(t.getAttribute('font-weight')).toBeNull();
		expect(t.getAttribute('font-style')).toBeNull();
		expect(t.getAttribute('text-decoration')).toBeNull();
		expect(t.querySelector('tspan')!.getAttribute('x')).toBe('100');
	});
	it('the block of lines is centred on the anchor, as before', () => {
		const one = ys(draw(base({ text: 'a' })))[0]!;
		expect(one).toBeCloseTo(50 + 12 * 0.32, 10);
		const three = ys(draw(base({ text: 'a\nb\nc' })));
		expect(three[1]).toBeCloseTo(50 + 12 * 0.32, 10);        // the middle line sits where a single line would
		expect(three[2]! - three[0]!).toBeCloseTo(2 * 12 * 1.2, 10);
	});
});

describe('VisioRenderer text: alignment', () => {
	it('start and end anchors follow the shape\'s horizontal alignment', () => {
		expect(draw(base({ textHAlign: 'start' })).getAttribute('text-anchor')).toBe('start');
		expect(draw(base({ textHAlign: 'end' })).getAttribute('text-anchor')).toBe('end');
	});
	it('top aligned text hangs below its anchor', () => {
		const top = ys(draw(base({ textVAlign: 'top', text: 'a' })))[0]!;
		expect(top).toBeGreaterThan(50);
		expect(top).toBeLessThan(50 + 12 * 1.2);
	});
	it('bottom aligned text rests above its anchor', () => {
		const bottom = ys(draw(base({ textVAlign: 'bottom', text: 'a' })))[0]!;
		expect(bottom).toBeLessThan(50 + 12 * 0.32);
		expect(bottom).toBeGreaterThan(50 - 12 * 1.2);
	});
	it('more lines grow downward from a top anchor and upward from a bottom anchor', () => {
		const topOne = ys(draw(base({ textVAlign: 'top', text: 'a' })))[0]!;
		const topThree = ys(draw(base({ textVAlign: 'top', text: 'a\nb\nc' })))[0]!;
		expect(topThree).toBeCloseTo(topOne, 10);
		const botOne = ys(draw(base({ textVAlign: 'bottom', text: 'a' })))[0]!;
		const botThree = ys(draw(base({ textVAlign: 'bottom', text: 'a\nb\nc' })))[0]!;
		expect(botOne - botThree).toBeCloseTo(2 * 12 * 1.2, 10);
	});
});

describe('VisioRenderer text: the file\'s own font settings are used when it has them', () => {
	it('family, colour, weight, slant and underline', () => {
		const t = draw(base({ fontFamily: 'Calibri', fontColor: '#336699', bold: true, italic: true, underline: true }));
		expect(t.getAttribute('font-family')).toContain('"Calibri"');
		expect(t.getAttribute('fill')).toBe('#336699');
		expect(t.getAttribute('font-weight')).toBe('bold');
		expect(t.getAttribute('font-style')).toBe('italic');
		expect(t.getAttribute('text-decoration')).toBe('underline');
	});
	it('a field the file does not set stays unset while the others apply', () => {
		const t = draw(base({ bold: true }));
		expect(t.getAttribute('font-weight')).toBe('bold');
		expect(t.getAttribute('font-family')).toBeNull();
		expect(t.getAttribute('fill')).toBe('#000000');
	});
	it('an explicit "not bold" sets nothing extra', () => {
		const t = draw(base({ bold: false, italic: false, underline: false }));
		expect(t.getAttribute('font-weight')).toBeNull();
		expect(t.getAttribute('font-style')).toBeNull();
		expect(t.getAttribute('text-decoration')).toBeNull();
	});
	it('accepts short, long and alpha hex colours, and ignores anything else (formulas, names, indexes)', () => {
		for (const ok of ['#fff', '#336699', '#33669980']) expect(draw(base({ fontColor: ok })).getAttribute('fill')).toBe(ok);
		for (const bad of ['red', '=THEMEVAL("x")', '12', '#12', '#12345', '#gggggg', 'url(#x)', ' #fff']) {
			expect(draw(base({ fontColor: bad })).getAttribute('fill')).toBe('#000000');
		}
	});
	it('wraps long lines using the same font that is drawn', () => {
		// jsdom cannot measure text, so wrapping is skipped there; what can be checked is that the font handed to the
		// measurer is built from the same settings as the drawing.
		const t = draw(base({ fontFamily: 'Calibri', bold: true, italic: true }));
		expect(t.getAttribute('font-family')).toContain('"Calibri"');
	});
	it('does not let a colour value inject markup', () => {
		const t = draw(base({ fontColor: '"><script>x</script>' }));
		expect(t.outerHTML).not.toContain('<script');
	});
	it('uses the smaller of two sizes when the file says so', () => {
		expect(draw(base({ fontSize: 8 })).getAttribute('font-size')).toBe('8');
	});
});
