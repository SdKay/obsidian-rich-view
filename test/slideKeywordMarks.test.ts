import { strToU8, zipSync } from 'fflate';
import { buildPresentation, buildTextIndex, parseZip, PptxViewer, type TextIndexEntry } from '@aiden0z/pptx-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import type { MatchOptions, RichSearchHostApi, Span } from '../src/richSearchApi';
import { addKeywordMarks } from '../src/slideKeywordMarks';

const ns = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const shapeWith = (paras: string) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="S"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="3000000" cy="400000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
const runs = (...t: string[]) => `<a:p>${t.map(x => `<a:r><a:t>${x}</a:t></a:r>`).join('')}</a:p>`;
const slideOf = (paras: string) => `<p:sld ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapeWith(paras)}</p:spTree></p:cSld></p:sld>`;
const DEFAULT_PARAS = runs('Hello ', 'world');

const literal = (text: string, o: MatchOptions): Span[] => {
	const out: Span[] = [];
	for (let i = text.toLowerCase().indexOf(o.query.toLowerCase()); i !== -1 && o.query; i = text.toLowerCase().indexOf(o.query.toLowerCase(), i + o.query.length)) out.push({ start: i, end: i + o.query.length });
	return out;
};
const host: RichSearchHostApi = { apiVersion: 1, matchLine: literal };

let viewer: PptxViewer | null = null;
afterEach(() => { viewer?.destroy(); viewer = null; document.body.replaceChildren(); });

async function render(paras: string = DEFAULT_PARAS) {
	const z = zipSync({
		'ppt/presentation.xml': strToU8(`<p:presentation ${ns}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`),
		'ppt/_rels/presentation.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/slide" Target="slides/slide1.xml"/></Relationships>`),
		'ppt/slides/slide1.xml': strToU8(slideOf(paras)),
	});
	const buf = z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
	const index = buildTextIndex(buildPresentation(await parseZip(buf)), { includeShapes: true, includeTables: true, includeGroups: true });
	const hostEl = document.createElement('div');
	document.body.appendChild(hostEl);
	viewer = await PptxViewer.open(buf, hostEl, { renderMode: 'slide', fitMode: 'none' });
	await viewer.goToSlide(0);
	const slideEl = hostEl.querySelector<HTMLElement>('div[style*="transform"]')!;
	return { hostEl, slideEl, entry: index[0] as TextIndexEntry };
}


/** Gives jsdom a layout and the Obsidian element helpers; returns a function that undoes both. */
function withLayout(slideEl: HTMLElement, rects: { left: number; top: number; width: number; height: number }[]): () => void {
	const shapeEl = Array.from(slideEl.querySelectorAll<HTMLElement>('div')).find(d => d.style.left === '96px' && d.style.top === '96px')!;
	shapeEl.getBoundingClientRect = () => ({ left: 200, top: 100, width: 2 * 314.96062992125985, height: 84, right: 0, bottom: 0, x: 200, y: 100, toJSON: () => ({}) });
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.createDiv = function (this: HTMLElement, o?: { cls?: string }) { const d = document.createElement('div'); if (o?.cls) d.className = o.cls; this.appendChild(d); return d; };
	proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) { for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v); };
	const original = Range.prototype.getClientRects;
	Range.prototype.getClientRects = function () {
		return rects.map(r => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) })) as unknown as DOMRectList;
	};
	return () => { Range.prototype.getClientRects = original; delete proto.createDiv; delete proto.setCssProps; };
}

describe('slide element lookup (the selector SlideViewer uses)', () => {
	it('selects exactly the scaled slide element, once', async () => {
		const { hostEl, slideEl } = await render();
		expect(hostEl.querySelectorAll('div[style*="transform"]').length).toBe(1);
		expect(slideEl.style.transform).toMatch(/scale\(/);
		expect(slideEl.style.width).toBe('960px');
	});
});

describe('addKeywordMarks without layout (jsdom measures nothing, so it must decline rather than mark nothing)', () => {
	it('returns null so the caller marks the whole box', async () => {
		const { slideEl, entry } = await render();
		expect(addKeywordMarks(slideEl, entry, host, { query: 'world' }, null)).toBeNull();
	});
	it('adds nothing to the page when it declines', async () => {
		const { slideEl, entry } = await render();
		addKeywordMarks(slideEl, entry, host, { query: 'world' }, null);
		expect(slideEl.querySelectorAll('.slide-view-keyword-mark').length).toBe(0);
	});
	it('returns null when the host is missing or the text does not occur', async () => {
		const { slideEl, entry } = await render();
		expect(addKeywordMarks(slideEl, entry, null, { query: 'world' }, null)).toBeNull();
		expect(addKeywordMarks(slideEl, entry, host, { query: 'absent' }, null)).toBeNull();
	});
});

describe('addKeywordMarks with measured rectangles', () => {
	it('puts one mark per rectangle inside the text box, in the box\'s own coordinates, styled for the state', async () => {
		const { slideEl, entry } = await render();
		const shapeEl = Array.from(slideEl.querySelectorAll<HTMLElement>('div')).find(d => d.style.left === '96px' && d.style.top === '96px')!;
		// Give jsdom a layout: the box sits at (200,100) on screen, drawn at 2x; "world" measures 60x20 at (230,120).
		shapeEl.getBoundingClientRect = () => ({ left: 200, top: 100, width: 2 * 314.96062992125985, height: 84, right: 0, bottom: 0, x: 200, y: 100, toJSON: () => ({}) });
		// Obsidian adds these to every element; jsdom does not have them.
		const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
		proto.createDiv = function (this: HTMLElement, o?: { cls?: string }) { const d = document.createElement('div'); if (o?.cls) d.className = o.cls; this.appendChild(d); return d; };
		proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) { for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v); };
		const original = Range.prototype.getClientRects;
		Range.prototype.getClientRects = function () {
			return [{ left: 230, top: 120, width: 60, height: 20, right: 290, bottom: 140, x: 230, y: 120, toJSON: () => ({}) }] as unknown as DOMRectList;
		};
		try {
			const marks = addKeywordMarks(slideEl, entry, host, { query: 'world' }, { paragraph: 0, match: 0 })!;
			expect(marks.length).toBeGreaterThan(0);
			const first = marks[0]!;
			expect(first.parentElement).toBe(shapeEl);
			expect(first.style.left).toBe('15px');
			expect(first.style.top).toBe('10px');
			expect(first.style.width).toBe('30px');
			expect(first.style.height).toBe('10px');
			expect(first.style.getPropertyValue('mix-blend-mode')).toBe('multiply');
			expect(first.style.getPropertyValue('box-shadow')).toContain('--rs-match-fg');
			const dim = addKeywordMarks(slideEl, entry, host, { query: 'world' }, null)!;
			expect(dim[0]!.style.getPropertyValue('box-shadow')).toBe('none');
		} finally {
			Range.prototype.getClientRects = original;
			delete proto.createDiv;
			delete proto.setCssProps;
		}
	});
});

describe('each fallback is reached on its own, with every earlier check passing', () => {
	it('declines when the layout reports no rectangles for the match (so the whole box is marked, not nothing)', async () => {
		const { slideEl, entry } = await render();
		const undo = withLayout(slideEl, []);
		try {
			expect(addKeywordMarks(slideEl, entry, host, { query: 'world' }, null)).toBeNull();
			expect(slideEl.querySelectorAll('.slide-view-keyword-mark').length).toBe(0);
		} finally { undo(); }
	});
	it('declines when the layout reports only zero-sized rectangles', async () => {
		const { slideEl, entry } = await render();
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 0, height: 20 }, { left: 230, top: 120, width: 60, height: 0 }]);
		try {
			expect(addKeywordMarks(slideEl, entry, host, { query: 'world' }, null)).toBeNull();
		} finally { undo(); }
	});
	it('declines when the text box element cannot be found', async () => {
		const { slideEl, entry } = await render();
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 60, height: 20 }]);
		try {
			const moved = { ...entry, bounds: { x: 700, y: 400, w: 10, h: 10 } } as TextIndexEntry;
			expect(addKeywordMarks(slideEl, moved, host, { query: 'world' }, null)).toBeNull();
		} finally { undo(); }
	});
	it('declines when the drawn text differs from the searchable text', async () => {
		const { slideEl, entry } = await render();
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 60, height: 20 }]);
		try {
			const other = { ...entry, text: 'completely different text' } as TextIndexEntry;
			expect(addKeywordMarks(slideEl, other, host, { query: 'text' }, null)).toBeNull();
		} finally { undo(); }
	});
});

describe('a keyword spread over several runs gets a mark per run', () => {
	it('"o w" in "Hello " + "world" is covered by two rectangles, one in each run', async () => {
		const { slideEl, entry } = await render();
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 10, height: 20 }]);
		try {
			const marks = addKeywordMarks(slideEl, entry, host, { query: 'o w' }, null)!;
			// the stubbed layout answers once per Range, and the match touches both runs
			expect(marks.length).toBe(2);
		} finally { undo(); }
	});
});

/** Captures the node and offsets of every Range the code measures, answering each with one rectangle. */
function recordRanges() {
	const calls: { text: string; start: number; end: number }[] = [];
	const proto = Range.prototype as unknown as { getClientRects: () => DOMRectList };
	const original = proto.getClientRects;
	proto.getClientRects = function (this: Range) {
		calls.push({ text: (this.startContainer.nodeValue ?? '').slice(this.startOffset, this.endOffset), start: this.startOffset, end: this.endOffset });
		return [{ left: 230, top: 120, width: 30, height: 20, right: 260, bottom: 140, x: 230, y: 120, toJSON: () => ({}) }] as unknown as DOMRectList;
	};
	return { calls, undo: () => { proto.getClientRects = original; } };
}

describe('blanks around a paragraph and one paragraph that cannot be placed', () => {
	it('measures exactly the characters of the keyword when the paragraph is drawn with leading and trailing blanks', async () => {
		const { slideEl, entry } = await render(runs('   keyword here   '));
		const undo2 = withLayout(slideEl, [{ left: 230, top: 120, width: 30, height: 20 }]);
		const rec = recordRanges();
		try {
			const marks = addKeywordMarks(slideEl, entry, host, { query: 'keyword' }, null);
			expect(marks).not.toBeNull();
			expect(rec.calls.map(c => c.text)).toEqual(['keyword']);
			expect(rec.calls[0]!.start).toBe(3);
		} finally { rec.undo(); undo2(); }
	});

	it('measures the last characters of a paragraph correctly when it is drawn with leading blanks', async () => {
		const { slideEl, entry } = await render(runs('   abcdef'));
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 30, height: 20 }]);
		const rec = recordRanges();
		try {
			addKeywordMarks(slideEl, entry, host, { query: 'ef' }, null);
			expect(rec.calls.map(c => c.text)).toEqual(['ef']);
		} finally { rec.undo(); undo(); }
	});

	it('places a match exactly in a paragraph that lines up even if another paragraph of the box does not', async () => {
		// "odd" is drawn as one text, but the searchable paragraph list is edited below so it no longer lines up.
		const { slideEl, entry } = await render(runs('first paragraph') + runs('second paragraph'));
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 30, height: 20 }]);
		try {
			const edited = { ...entry, text: 'first paragraph\nsomething unrelated' } as TextIndexEntry;
			const marks = addKeywordMarks(slideEl, edited, host, { query: 'first' }, null);
			expect(marks).not.toBeNull();
		} finally { undo(); }
	});

	it('marks the whole box when the keyword is in both a paragraph that lines up and one that does not, so no hit is left unmarked', async () => {
		const { slideEl, entry } = await render(runs('common word here') + runs('common word again'));
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 30, height: 20 }]);
		try {
			const edited = { ...entry, text: 'common word here\ncommon word but different' } as TextIndexEntry;
			expect(addKeywordMarks(slideEl, edited, host, { query: 'common' }, null)).toBeNull();
		} finally { undo(); }
	});
	it('marks the whole box when the match is in the paragraph that does not line up', async () => {
		const { slideEl, entry } = await render(runs('first paragraph') + runs('second paragraph'));
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 30, height: 20 }]);
		try {
			const edited = { ...entry, text: 'first paragraph\nsomething unrelated' } as TextIndexEntry;
			expect(addKeywordMarks(slideEl, edited, host, { query: 'unrelated' }, null)).toBeNull();
		} finally { undo(); }
	});
});


describe('only the opened occurrence is drawn in the active style', () => {
	it('with three matches in one paragraph, exactly the one named is active and the others are dim', async () => {
		const { slideEl, entry } = await render(runs('aa bb aa bb aa'));
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 30, height: 20 }]);
		try {
			for (const match of [0, 1, 2]) {
				const marks = addKeywordMarks(slideEl, entry, host, { query: 'aa' }, { paragraph: 0, match })!;
				const bright = marks.map(m => m.style.getPropertyValue('box-shadow') !== 'none');
				expect(marks.length).toBe(3);
				expect(bright.filter(Boolean).length).toBe(1);
				expect(bright[match]).toBe(true);
				marks.forEach(m => m.remove());
			}
		} finally { undo(); }
	});
	it('a match in a different paragraph than the opened one stays dim', async () => {
		const { slideEl, entry } = await render(runs('aa one') + runs('aa two'));
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 30, height: 20 }]);
		try {
			const marks = addKeywordMarks(slideEl, entry, host, { query: 'aa' }, { paragraph: 1, match: 0 })!;
			const bright = marks.map(m => m.style.getPropertyValue('box-shadow') !== 'none');
			expect(bright).toEqual([false, true]);
			marks.forEach(m => m.remove());
		} finally { undo(); }
	});
	it('with nothing opened here, every mark is dim', async () => {
		const { slideEl, entry } = await render(runs('aa bb aa'));
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 30, height: 20 }]);
		try {
			const marks = addKeywordMarks(slideEl, entry, host, { query: 'aa' }, null)!;
			expect(marks.every(m => m.style.getPropertyValue('box-shadow') === 'none')).toBe(true);
		} finally { undo(); }
	});
	it('the active style has the outline and the full-strength colour; the dim one has neither', async () => {
		const { slideEl, entry } = await render(runs('aa bb aa'));
		const undo = withLayout(slideEl, [{ left: 230, top: 120, width: 30, height: 20 }]);
		try {
			const marks = addKeywordMarks(slideEl, entry, host, { query: 'aa' }, { paragraph: 0, match: 0 })!;
			expect(marks[0]!.style.getPropertyValue('box-shadow')).toContain('--rs-match-fg');
			expect(marks[0]!.style.getPropertyValue('background')).toBe('var(--rs-match-bg, #ccff00)');
			expect(marks[1]!.style.getPropertyValue('box-shadow')).toBe('none');
			expect(marks[1]!.style.getPropertyValue('background')).toContain('color-mix');
		} finally { undo(); }
	});
});
