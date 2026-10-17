import { describe, expect, it } from 'vitest';
import { htmlLabelToLines } from '../src/search/labelText';

describe('htmlLabelToLines', () => {
	it('returns plain text unchanged, split on newlines, trimmed, blanks dropped', () => {
		expect(htmlLabelToLines('  a \n\n b ')).toEqual(['a', 'b']);
	});
	it('strips tags and decodes entities', () => {
		expect(htmlLabelToLines('<b>Bold</b> &amp; plain')).toEqual(['Bold & plain']);
	});
	it('splits on <br> in all spellings', () => {
		expect(htmlLabelToLines('a<br>b<br/>c<br />d')).toEqual(['a', 'b', 'c', 'd']);
	});
	it('treats block elements as line boundaries and does not glue neighbours', () => {
		expect(htmlLabelToLines('<div>one</div><div>two</div><p>three</p><li>four</li>')).toEqual(['one', 'two', 'three', 'four']);
		expect(htmlLabelToLines('x<div>y</div>z')).toEqual(['x', 'y', 'z']);
	});
	it('handles nested blocks and table rows', () => {
		expect(htmlLabelToLines('<div><div>a</div><div>b</div></div>')).toEqual(['a', 'b']);
		expect(htmlLabelToLines('<table><tr><td>a</td></tr><tr><td>b</td></tr></table>')).toEqual(['a', 'b']);
	});
	it('turns nbsp into an ordinary space', () => {
		expect(htmlLabelToLines('a&nbsp;b')).toEqual(['a b']);
	});
	it('drops script and style content, also when text comes before them (the parser keeps those in the body)', () => {
		expect(htmlLabelToLines('<script>alert(1)</script><style>p{}</style>safe')).toEqual(['safe']);
		expect(htmlLabelToLines('before<script>alert(1)</script>after')).toEqual(['beforeafter']);
		expect(htmlLabelToLines('a<style>p{color:red}</style>b')).toEqual(['ab']);
		expect(htmlLabelToLines('<div>x<script>boom()</script>y</div>')).toEqual(['xy']);
	});
	it('keeps inline elements on one line', () => {
		expect(htmlLabelToLines('a<span>b</span><i>c</i>')).toEqual(['abc']);
	});
	it('returns nothing for an empty or markup-only label', () => {
		expect(htmlLabelToLines('')).toEqual([]);
		expect(htmlLabelToLines('<br><br>')).toEqual([]);
		expect(htmlLabelToLines('<div></div>')).toEqual([]);
	});

	it('stays fast on a label with thousands of line breaks, and loses none', () => {
		const n = 20_000;
		const label = Array.from({ length: n }, (_, i) => 't' + i).join('<br>');
		const t0 = performance.now();
		const lines = htmlLabelToLines(label);
		const elapsed = performance.now() - t0;
		expect(lines.length).toBe(n);
		expect(lines[0]).toBe('t0');
		expect(lines[n - 1]).toBe('t' + (n - 1));
		expect(elapsed).toBeLessThan(2000);
	}, 30_000);

	it('stays fast on thousands of block elements too', () => {
		const n = 20_000;
		const label = Array.from({ length: n }, (_, i) => `<div>t${i}</div>`).join('');
		const t0 = performance.now();
		const lines = htmlLabelToLines(label);
		expect(lines.length).toBe(n);
		expect(performance.now() - t0).toBeLessThan(2000);
	}, 30_000);
});
