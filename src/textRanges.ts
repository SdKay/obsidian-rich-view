/** A piece of the text shown for one paragraph, in reading order. `counts` is false for decoration such as a bullet. */
export interface TextPiece {
	length: number;
	counts: boolean;
}

/** Where a match falls inside one piece: [start, end) in that piece's own characters. */
export interface PieceSpan {
	piece: number;
	start: number;
	end: number;
}

/**
 * Maps a match [start, end) in the paragraph's searchable text onto the pieces that display it.
 * Decoration (a bullet's text) takes up room in the DOM but not in the searchable text, so it is skipped
 * when counting. A match that crosses several pieces yields one span per piece.
 */
export function spansInPieces(pieces: readonly TextPiece[], start: number, end: number): PieceSpan[] {
	const out: PieceSpan[] = [];
	if (end <= start) return out;
	let offset = 0;
	pieces.forEach((piece, index) => {
		if (!piece.counts) return;
		const from = Math.max(start, offset);
		const to = Math.min(end, offset + piece.length);
		if (to > from) out.push({ piece: index, start: from - offset, end: to - offset });
		offset += piece.length;
	});
	return out;
}

/** True when the pieces together spell exactly `expected`: the check that the DOM and the searchable text agree. */
export function piecesSpell(texts: readonly string[], counts: readonly boolean[], expected: string): boolean {
	return texts.filter((_, i) => counts[i]).join('') === expected;
}
