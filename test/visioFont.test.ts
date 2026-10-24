import { describe, expect, it } from 'vitest';
import { canvasFont, fontStack } from '../src/visioFont';

describe('fontStack', () => {
	it('puts the file\'s font first, quoted, with fallbacks after it', () => {
		const s = fontStack('Calibri')!;
		expect(s.startsWith('"Calibri", ')).toBe(true);
		expect(s).toContain('sans-serif');
	});
	it('is undefined when the file names no font, so the renderer keeps its own', () => {
		for (const v of [undefined, '', '   ', '\t\n']) expect(fontStack(v)).toBeUndefined();
	});
	it('trims the name', () => {
		expect(fontStack('  Arial  ')!.startsWith('"Arial", ')).toBe(true);
	});
	it('keeps a name with spaces and CJK characters intact', () => {
		expect(fontStack('Segoe UI Semibold')!.startsWith('"Segoe UI Semibold", ')).toBe(true);
		expect(fontStack('微软雅黑')!.startsWith('"微软雅黑", ')).toBe(true);
	});
	it('cannot be broken out of: quotes and backslashes in a name are escaped', () => {
		const s = fontStack('Evil"; color: red; x: "')!;
		expect(s.startsWith('"Evil\\"; color: red; x: \\"", ')).toBe(true);
		expect(fontStack('a\\b')!.startsWith('"a\\\\b", ')).toBe(true);
	});
	it('turns a line break in a name into a space, so it stays one value', () => {
		expect(fontStack('A\nB')!.startsWith('"A B", ')).toBe(true);
	});
});

describe('canvasFont', () => {
	it('uses the same stack as the drawing, so the measured width matches the drawn width', () => {
		expect(canvasFont(12, 'Calibri', false, false)).toBe(`12px ${fontStack('Calibri')}`);
	});
	it('falls back to the font it always measured with when the file names none', () => {
		expect(canvasFont(12, undefined, undefined, undefined)).toBe('12px sans-serif');
	});
	it('adds weight and slant when the file asks for them', () => {
		expect(canvasFont(12, undefined, true, false)).toBe('bold 12px sans-serif');
		expect(canvasFont(12, undefined, false, true)).toBe('italic 12px sans-serif');
		expect(canvasFont(12, undefined, true, true)).toBe('italic bold 12px sans-serif');
	});
});
