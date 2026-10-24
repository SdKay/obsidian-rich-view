import { describe, expect, it } from 'vitest';
import { piecesSpell, spansInPieces, type TextPiece } from '../src/textRanges';

const p = (length: number, counts = true): TextPiece => ({ length, counts });

describe('spansInPieces', () => {
	// "Hello " | "wor" | "ld again"  =>  Hello world again
	const runs = [p(6), p(3), p(8)];

	it('keeps a match inside one piece in that piece', () => {
		expect(spansInPieces(runs, 0, 5)).toEqual([{ piece: 0, start: 0, end: 5 }]);
		expect(spansInPieces(runs, 13, 17)).toEqual([{ piece: 2, start: 4, end: 8 }]);
	});
	it('splits a match that crosses pieces into one span per piece', () => {
		expect(spansInPieces(runs, 4, 11)).toEqual([
			{ piece: 0, start: 4, end: 6 },
			{ piece: 1, start: 0, end: 3 },
			{ piece: 2, start: 0, end: 2 },
		]);
	});
	it('a match exactly on a piece boundary does not touch the neighbour', () => {
		expect(spansInPieces(runs, 6, 9)).toEqual([{ piece: 1, start: 0, end: 3 }]);
		expect(spansInPieces(runs, 0, 6)).toEqual([{ piece: 0, start: 0, end: 6 }]);
	});
	it('does not count a bullet, so offsets line up with the searchable text', () => {
		const withBullet = [p(2, false), p(11)]; // "• " | "bullet text"
		expect(spansInPieces(withBullet, 0, 6)).toEqual([{ piece: 1, start: 0, end: 6 }]);
		expect(spansInPieces(withBullet, 7, 11)).toEqual([{ piece: 1, start: 7, end: 11 }]);
	});
	it('an empty or inverted match gives no spans', () => {
		expect(spansInPieces(runs, 3, 3)).toEqual([]);
		expect(spansInPieces(runs, 5, 2)).toEqual([]);
	});
	it('a match running past the end is clipped to the end, and one wholly past it gives nothing', () => {
		// total length is 17; a match of 15..99 can only cover the last two characters
		expect(spansInPieces(runs, 15, 99)).toEqual([{ piece: 2, start: 6, end: 8 }]);
		expect(spansInPieces(runs, 40, 50)).toEqual([]);
	});
	it('works with CJK, where one character is one UTF-16 unit', () => {
		expect(spansInPieces([p(7)], 2, 4)).toEqual([{ piece: 0, start: 2, end: 4 }]);
	});
});

describe('piecesSpell', () => {
	it('agrees when the counted pieces spell the searchable text, ignoring decoration', () => {
		expect(piecesSpell(['• ', 'bullet text'], [false, true], 'bullet text')).toBe(true);
		expect(piecesSpell(['Hello ', 'wor', 'ld again'], [true, true, true], 'Hello world again')).toBe(true);
	});
	it('disagrees when they differ, so the caller can fall back to marking the whole box', () => {
		expect(piecesSpell(['Hello'], [true], 'Hello!')).toBe(false);
		expect(piecesSpell(['• ', 'x'], [true, true], 'x')).toBe(false);
	});
});
