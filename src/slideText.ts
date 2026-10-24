import type { TextIndexEntry } from '@aiden0z/pptx-renderer';
import { piecesSpell, type TextPiece } from './textRanges';

/**
 * One run (or bullet) of a paragraph as the library drew it. `length` counts only the characters that belong
 * to the searchable text; `skipStart` characters at the front of `node` (leading blanks the searchable text
 * trims away) are added back when a range is built on the node.
 */
export interface DomPiece extends TextPiece {
	node: Text;
	text: string;
	skipStart: number;
}

/**
 * Finds the element the library drew for a text box. The library does not tag shape elements with their
 * node id, but it positions each one with the same slide-space box the text index reports, so the box
 * identifies it. Returns null when no element, or more than one, fits: a wrong guess would mark the wrong text.
 */
export function findShapeElement(slide: HTMLElement, entry: TextIndexEntry): HTMLElement | null {
	const { x, y, w, h } = entry.bounds;
	const close = (value: string, expected: number) => Math.abs(parseFloat(value) - expected) < 0.5;
	const found: HTMLElement[] = [];
	for (const el of Array.from(slide.querySelectorAll<HTMLElement>('div'))) {
		if (!el.style.left || !el.style.top || !el.style.width || !el.style.height) continue;
		if (!close(el.style.left, x) || !close(el.style.top, y) || !close(el.style.width, w) || !close(el.style.height, h)) continue;
		if (!el.querySelector(':scope > svg')) continue;
		found.push(el);
	}
	return found.length === 1 ? found[0]! : null;
}

/**
 * The paragraphs of a shape element, each as its text pieces in reading order, or null for a paragraph whose
 * drawn text cannot be matched to the searchable text. A paragraph is a direct `div` of the text container;
 * a piece is a text node inside it. A bullet (its own leading piece) and blanks at either end are drawn but
 * not part of the searchable text, so they are left out of the counted characters. A paragraph that does not
 * line up is reported as null on its own, so one odd paragraph does not cost the others their exact marks.
 * Returns null altogether when the shape has a different number of paragraphs than expected.
 */
export function paragraphPieces(shape: HTMLElement, paragraphTexts: readonly string[]): (DomPiece[] | null)[] | null {
	const container = Array.from(shape.children).find(c => c.tagName === 'DIV') as HTMLElement | undefined;
	if (!container) return null;
	const paragraphs = Array.from(container.children).filter(c => c.tagName === 'DIV');
	if (paragraphs.length !== paragraphTexts.length) return null;
	return paragraphs.map((paragraph, i) => alignParagraph(textNodesOf(paragraph), paragraphTexts[i]!));
}

function alignParagraph(nodes: readonly Text[], expected: string): DomPiece[] | null {
	// Drop leading pieces (a bullet) until the rest spells the paragraph once blanks at both ends are ignored.
	for (let skip = 0; skip <= nodes.length; skip++) {
		const pieces = trimEnds(toPieces(nodes, skip));
		if (piecesSpell(pieces.map(p => p.text.slice(p.skipStart, p.skipStart + p.length)), pieces.map(p => p.counts), expected)) return pieces;
	}
	return null;
}

/** Marks blanks at the very start and end of the counted text as not belonging to it. */
function trimEnds(pieces: DomPiece[]): DomPiece[] {
	const counted = pieces.filter(p => p.counts);
	if (counted.length === 0) return pieces;
	const first = counted[0]!;
	const last = counted[counted.length - 1]!;
	const lead = first.text.length - first.text.trimStart().length;
	const trail = last.text.length - last.text.trimEnd().length;
	first.skipStart = lead;
	first.length -= lead;
	last.length -= trail;
	return pieces;
}

function textNodesOf(root: Element): Text[] {
	const out: Text[] = [];
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.nodeValue ?? '').length > 0) out.push(n as Text);
	return out;
}

function toPieces(nodes: readonly Text[], skip: number): DomPiece[] {
	return nodes.map((node, i) => ({ node, text: node.nodeValue ?? '', length: (node.nodeValue ?? '').length, counts: i >= skip, skipStart: 0 }));
}
