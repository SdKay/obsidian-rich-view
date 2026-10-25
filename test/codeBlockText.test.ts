import { describe, expect, it } from 'vitest';
import { blockHeight, formatCodeBlock } from '../src/codeBlockText';
import { COMMON_ACTIONS, layoutActions } from '../src/frame/actions';
import { parseViewParams } from '../src/viewParams';

describe('formatCodeBlock', () => {
	it('wraps the parameters in a rich-view fence, ready to paste into a note', () => {
		expect(formatCodeBlock('file=a.drawio|page=P|zoom=80|offset=1,2')).toBe('```rich-view\nfile=a.drawio|page=P|zoom=80|offset=1,2\n```');
	});
	it('puts the parameters on one line, exactly as the viewer reads them back', () => {
		const params = 'file=dir/a b.vsdx|page-index=2|height=600|zoom=75|offset=-10,20';
		const body = formatCodeBlock(params).split('\n');
		expect(body).toEqual(['```rich-view', params, '```']);
		const parsed = parseViewParams(body[1]!);
		expect(parsed.filename).toBe('dir/a b.vsdx');
		expect(parsed.zoom).toBe(75);
	});
	it('does not end with a newline, so pasting does not add a blank line', () => {
		expect(formatCodeBlock('file=a.pptx').endsWith('\n')).toBe(false);
	});
	it('keeps a page name that contains a backtick fence-like run from closing the block early', () => {
		const text = formatCodeBlock('file=a.drawio|page=a```b');
		expect(text.startsWith('````rich-view\n')).toBe(true);
		expect(text.endsWith('\n````')).toBe(true);
	});
});

describe('toolbar action icons', () => {
	it('gives every common action its own icon, so no two buttons look alike', () => {
		const icons = COMMON_ACTIONS.map(a => a.icon);
		expect(new Set(icons).size).toBe(icons.length);
	});
	it('puts copy-as-code-block right after pin, and only shows it when the viewer offers it', () => {
		const slots = layoutActions({ 'apply-view': () => {}, 'copy-block': () => {}, fullscreen: () => {} }, []);
		const ids = slots.flatMap(s => s.kind === 'common' ? [s.spec.id] : []);
		expect(ids).toEqual(['apply-view', 'copy-block', 'fullscreen']);
		const without = layoutActions({ 'apply-view': () => {}, fullscreen: () => {} }, []);
		expect(without.flatMap(s => s.kind === 'common' ? [s.spec.id] : [])).toEqual(['apply-view', 'fullscreen']);
	});
});

describe('blockHeight: the height written into a copied block', () => {
	it('is the height the viewer is showing now, rounded to whole pixels', () => {
		expect(blockHeight({ measured: 812.4, fullscreen: false, configured: 0 })).toBe(812);
	});
	it('is that height even when the block never set one (the viewer fills a tab, the block would default to 400)', () => {
		expect(blockHeight({ measured: 900, fullscreen: false, configured: 0 })).toBe(900);
	});
	it('prefers what is on screen over the configured height, which may have been resized since', () => {
		expect(blockHeight({ measured: 650, fullscreen: false, configured: 400 })).toBe(650);
	});
	it('never copies the height of a fullscreen view, which would blow up the note: it falls back to the configured one', () => {
		expect(blockHeight({ measured: 1080, fullscreen: true, configured: 500 })).toBe(500);
	});
	it('falls back to the default 400 for a fullscreen view whose block never set a height', () => {
		expect(blockHeight({ measured: 1080, fullscreen: true, configured: 0 })).toBe(400);
	});
	it('is never below the smallest height the resize handle allows', () => {
		expect(blockHeight({ measured: 40, fullscreen: false, configured: 0 })).toBe(120);
	});
	it('uses the configured height when the view has no size yet (not laid out)', () => {
		expect(blockHeight({ measured: 0, fullscreen: false, configured: 520 })).toBe(520);
		expect(blockHeight({ measured: 0, fullscreen: false, configured: 0 })).toBe(400);
	});
	it('ignores a measurement that is not a number', () => {
		expect(blockHeight({ measured: NaN, fullscreen: false, configured: 300 })).toBe(300);
	});
});
