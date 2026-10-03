import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { contentEquals, isBinaryDiagramFormat } from '../src/diagramFileContent';

const bytes = (...n: number[]) => new Uint8Array(n).buffer;

describe('contentEquals', () => {
	it('compares text by value', () => {
		expect(contentEquals('<a/>', '<a/>')).toBe(true);
		expect(contentEquals('<a/>', '<b/>')).toBe(false);
	});

	it('compares binary by length then bytes', () => {
		expect(contentEquals(bytes(1, 2, 3), bytes(1, 2, 3))).toBe(true);
		expect(contentEquals(bytes(1, 2, 3), bytes(1, 2, 4))).toBe(false);
		expect(contentEquals(bytes(1, 2), bytes(1, 2, 3))).toBe(false);
	});

	it('never treats text and binary as equal', () => {
		expect(contentEquals('abc', bytes(97, 98, 99))).toBe(false);
	});
});

describe('isBinaryDiagramFormat', () => {
	it('is true only for .vsdx, case-insensitively', () => {
		const file = (extension: string) => ({ extension }) as TFile;
		expect(isBinaryDiagramFormat(file('vsdx'))).toBe(true);
		expect(isBinaryDiagramFormat(file('VSDX'))).toBe(true);
		expect(isBinaryDiagramFormat(file('drawio'))).toBe(false);
	});
});
