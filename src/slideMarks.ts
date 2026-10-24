import type { TextIndexEntry, TextSearchResult } from '@aiden0z/pptx-renderer';
import type { MarkableUnit, MarkTarget } from './matchTargets';
import { slideAnchorOf } from './search/anchors';

/** The anchor `extractPptx` gives line `line` of this index entry (same numbering: slides count from 1). */
export function slideAnchor(entry: TextIndexEntry, line: number): { slide: number; nodeId: string; line: number } {
	return slideAnchorOf(entry.slideIndex + 1, entry.nodeId, line);
}

/**
 * Text units for one slide, built by the rules `extractPptx` uses: one per paragraph of each text box or
 * cell, trimmed, blanks dropped. Each unit remembers its index entry so a mark can be drawn from it.
 */
export function slideUnits(index: readonly TextIndexEntry[], slideIndex: number): (MarkableUnit & { entry: TextIndexEntry })[] {
	const out: (MarkableUnit & { entry: TextIndexEntry })[] = [];
	for (const entry of index) {
		if (entry.slideIndex !== slideIndex) continue;
		let line = 0;
		for (const part of entry.text.split(/\r?\n/)) {
			const text = part.trim();
			if (text) out.push({ anchor: slideAnchor(entry, line++), text, entry });
		}
	}
	return out;
}

/** Shape-level marking is all the library offers: one result per text box, however many lines matched in it. */
export function toSearchResult(entry: TextIndexEntry): TextSearchResult {
	return { ...entry, matchStart: 0, matchEnd: entry.text.length, snippet: entry.text };
}

/** Keeps the first unit of each text box, so a box with three matching paragraphs is marked once. */
export function uniqueByShape<T extends { entry: TextIndexEntry }>(items: readonly T[]): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of items) {
		const key = `${item.entry.slideIndex}|${item.entry.nodeId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}
	return out;
}

/**
 * The library draws each overlay with inline styles of its own; `style` is applied last, so the look from
 * contract 5.9 / 5.10 goes through it. The colours are CSS variables resolved when painted, so they follow
 * the user's setting in rich-search, with the contract's fallbacks when it is not running.
 */
export function markStyle(opened: boolean): Record<string, string> {
	const bg = 'var(--rs-match-bg, #ccff00)';
	const fg = 'var(--rs-match-fg, #000000)';
	return opened
		? { background: bg, 'mix-blend-mode': 'multiply', 'border-width': '0px', 'border-radius': '2px', 'box-shadow': `0 0 0 1px ${fg}` }
		: { background: `color-mix(in srgb, ${bg} 45%, transparent)`, 'mix-blend-mode': 'multiply', 'border-width': '0px', 'border-radius': '2px', 'box-shadow': 'none' };
}

/**
 * Where the opened match sits: the text box (node id), the paragraph of that box (counted over the box's own
 * non-blank paragraphs, as `slideUnits` splits them) and the match within that paragraph. Null when no unit on
 * this slide holds the opened match.
 */
export function openedPosition(
	units: readonly (MarkableUnit & { entry: TextIndexEntry })[],
	chosen: readonly MarkTarget[],
): { nodeId: string; paragraph: number; match: number } | null {
	const target = chosen.find(c => c.openedIndex !== null);
	if (!target) return null;
	const unit = target.unit as MarkableUnit & { entry: TextIndexEntry };
	// Paragraph number = how many units of the same box come before this one.
	const paragraph = units.filter(u => u.entry.nodeId === unit.entry.nodeId && u.entry.slideIndex === unit.entry.slideIndex).indexOf(unit);
	return { nodeId: unit.entry.nodeId, paragraph: Math.max(0, paragraph), match: target.openedIndex! };
}
