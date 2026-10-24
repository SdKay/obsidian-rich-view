import type { TextIndexEntry } from '@aiden0z/pptx-renderer';
import { strToU8, zipSync } from 'fflate';
import { buildPresentation, buildTextIndex, parseZip } from '@aiden0z/pptx-renderer';
import { describe, expect, it } from 'vitest';
import { extractPptx } from '../src/search/pptxExtract';
import { markStyle, openedPosition, slideAnchor, slideUnits, toSearchResult, uniqueByShape } from '../src/slideMarks';
import { chooseMarks, type MarkTarget } from '../src/matchTargets';
import type { MatchOptions, RichSearchHostApi, Span } from '../src/richSearchApi';

const entry = (slideIndex: number, nodeId: string, text: string): TextIndexEntry => ({
	slideIndex, nodeId, nodePath: nodeId, nodeType: 'shape', textKind: 'shape', text, bounds: { x: 1, y: 2, w: 30, h: 40 },
} as unknown as TextIndexEntry);

describe('slideUnits', () => {
	const index = [entry(0, '2', 'Title'), entry(0, '3', 'one\n  two  \n\nthree'), entry(1, '2', 'Second slide')];

	it('keeps only the asked slide and splits a text box into trimmed, non-blank paragraphs', () => {
		const units = slideUnits(index, 0);
		expect(units.map(u => u.text)).toEqual(['Title', 'one', 'two', 'three']);
		expect(slideUnits(index, 1).map(u => u.text)).toEqual(['Second slide']);
		expect(slideUnits(index, 5)).toEqual([]);
	});

	it('anchors a unit by 1-based slide and node id, the way extract does', () => {
		expect(slideUnits(index, 1)[0]!.anchor).toEqual({ slide: 2, nodeId: '2', line: 0 });
		expect(slideAnchor(index[0]!, 3)).toEqual({ slide: 1, nodeId: '2', line: 3 });
	});
});

describe('toSearchResult', () => {
	it('turns an index entry into a whole-shape result the library can highlight', () => {
		const r = toSearchResult(entry(2, '9', 'hello'));
		expect(r).toMatchObject({ slideIndex: 2, nodeId: '9', matchStart: 0, matchEnd: 5, snippet: 'hello', bounds: { x: 1, y: 2, w: 30, h: 40 } });
	});
});

describe('uniqueByShape', () => {
	it('marks a text box once however many of its paragraphs matched, and keeps separate boxes', () => {
		const units = slideUnits([entry(0, '3', 'a\nb\nc'), entry(0, '4', 'd')], 0);
		expect(units.length).toBe(4);
		expect(uniqueByShape(units).map(u => u.entry.nodeId)).toEqual(['3', '4']);
	});
	it('treats the same node id on different slides as different shapes', () => {
		const units = [...slideUnits([entry(0, '2', 'a')], 0), ...slideUnits([entry(1, '2', 'b')], 1)];
		expect(uniqueByShape(units).length).toBe(2);
	});
});

describe('units agree with extract on a real deck', () => {
	const ns = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
	const box = (id: number, paras: string[]) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="S"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paras.map(t => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
	const slide = (shapes: string) => `<p:sld ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`;
	const deck = (slides: string[]) => {
		const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
		const z = zipSync({
			'ppt/presentation.xml': strToU8(`<p:presentation ${ns}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`),
			'ppt/_rels/presentation.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`),
			...Object.fromEntries(slides.map((s, i) => [`ppt/slides/slide${i + 1}.xml`, strToU8(s)])),
		});
		return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
	};

	it('the units of all slides equal the lines extract returns, text and anchor', async () => {
		const buf = deck([slide(box(2, ['Alpha', 'Beta']) + box(3, ['Gamma'])), slide(box(2, ['Delta']))]);
		const r = await extractPptx(buf);
		expect(r.ok).toBe(true);
		const index = buildTextIndex(buildPresentation(await parseZip(buf)), { includeShapes: true, includeTables: true, includeGroups: true });
		const units = [0, 1].flatMap(i => slideUnits(index, i));
		if (r.ok) {
			expect(r.value.length).toBe(4);
			expect(units.map(u => ({ anchor: u.anchor, text: u.text }))).toEqual(r.value.map(l => ({ anchor: l.anchor, text: l.text })));
		}
	});
});

describe('markStyle', () => {
	it('dims every match to 45% of the user colour, and paints the opened one at full strength with an outline', () => {
		const dim = markStyle(false);
		const bright = markStyle(true);
		expect(dim.background).toBe('color-mix(in srgb, var(--rs-match-bg, #ccff00) 45%, transparent)');
		expect(dim['box-shadow']).toBe('none');
		expect(bright.background).toBe('var(--rs-match-bg, #ccff00)');
		expect(bright['box-shadow']).toBe('0 0 0 1px var(--rs-match-fg, #000000)');
	});
	it('multiplies with the slide below in both states, so a full-strength mark cannot hide the text under it', () => {
		expect(markStyle(false)['mix-blend-mode']).toBe('multiply');
		expect(markStyle(true)['mix-blend-mode']).toBe('multiply');
	});
	it('has no border of its own in either state (the library would otherwise draw its default gold one)', () => {
		expect(markStyle(false)['border-width']).toBe('0px');
		expect(markStyle(true)['border-width']).toBe('0px');
	});
	it('takes colours only from the contract variables, with the contract fallbacks, never from the theme', () => {
		for (const opened of [false, true]) {
			const all = Object.values(markStyle(opened)).join(' ');
			expect(all).not.toMatch(/accent|interactive|--text|--background/);
			expect(all).toContain('--rs-match-bg, #ccff00');
		}
		expect(Object.values(markStyle(true)).join(' ')).toContain('--rs-match-fg, #000000');
	});
});

describe('openedPosition', () => {
	const index = [entry(0, '5', 'first para\nsecond para\nthird para'), entry(0, '6', 'other box')];
	const units = slideUnits(index, 0);
	const target = (i: number, openedIndex: number | null): MarkTarget => ({ unit: units[i]!, openedIndex, opened: openedIndex !== null });

	it('names the box, the paragraph of that box and the match within it', () => {
		expect(openedPosition(units, [target(0, null), target(2, 3)])).toEqual({ nodeId: '5', paragraph: 2, match: 3 });
		expect(openedPosition(units, [target(1, 0)])).toEqual({ nodeId: '5', paragraph: 1, match: 0 });
	});
	it('counts paragraphs within their own box, not across the slide', () => {
		expect(openedPosition(units, [target(3, 1)])).toEqual({ nodeId: '6', paragraph: 0, match: 1 });
	});
	it('is null when nothing is opened', () => {
		expect(openedPosition(units, [target(0, null), target(1, null)])).toBeNull();
		expect(openedPosition(units, [])).toBeNull();
	});
	it('keeps boxes with the same node id on different slides apart', () => {
		const two = [entry(0, '5', 'a\nb'), entry(1, '5', 'c\nd')];
		const all = [...slideUnits(two, 0), ...slideUnits(two, 1)];
		const t: MarkTarget = { unit: all[3]!, openedIndex: 0, opened: true };
		expect(openedPosition(all, [t])).toEqual({ nodeId: '5', paragraph: 1, match: 0 });
	});
});

describe('clicking one of several matching lines of the same text box lights that line (the slide-14 case)', () => {
	// Four paragraphs of one box, each containing the keyword — they share slide and node id.
	const index = [entry(13, '12', 'PTKSA: 4次握手\nGTKSA: Group Key 握手\nSMKSA: SMK握手初始化\nSTKSA: STK 握手')];
	const units = slideUnits(index, 13);
	const literal = (text: string, o: MatchOptions): Span[] => {
		const out: Span[] = [];
		for (let i = text.indexOf(o.query); i !== -1; i = text.indexOf(o.query, i + o.query.length)) out.push({ start: i, end: i + o.query.length });
		return out;
	};
	const host: RichSearchHostApi = { apiVersion: 1, matchLine: literal };
	const file = 'WIFI-Security.pptx';
	const hitOn = (line: number) => ({ path: file, line: 0, index: 0, anchor: units[line]!.anchor });

	it('the four lines have four different anchors', () => {
		expect(new Set(units.map(u => JSON.stringify(u.anchor))).size).toBe(4);
	});
	for (const clicked of [0, 1, 2, 3]) {
		it(`clicking line ${clicked + 1} lights line ${clicked + 1} only`, () => {
			const marks = chooseMarks(host, units, { query: '握手' }, hitOn(clicked), file);
			expect(marks.map(m => m.openedIndex !== null)).toEqual([0, 1, 2, 3].map(i => i === clicked));
			expect(openedPosition(units, marks)).toEqual({ nodeId: '12', paragraph: clicked, match: 0 });
		});
	}
});
