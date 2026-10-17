/** Elements that start and end a line, as in how draw.io shows an HTML label. */
const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE']);

/**
 * Turns a draw.io cell label into plain-text lines. draw.io stores most
 * labels as HTML (`html=1`): tags, entities, and `<br>`/block elements as
 * line breaks. Parsed with DOMParser as `text/html`, which builds an inert
 * document — scripts do not run and nothing touches the live page.
 *
 * The parsed tree is only read, never edited: replacing every `<br>` in place
 * is quadratic on a label with thousands of them (measured: 4 000 breaks ≈ 2 s,
 * 8 000 ≈ 10 s), and a hostile or generated label must not hang the app.
 */
export function htmlLabelToLines(label: string): string[] {
	if (!label.includes('<') && !label.includes('&')) return splitLines(label);

	const doc = new DOMParser().parseFromString(label, 'text/html');
	const parts: string[] = [];
	collectText(doc.body, parts);
	return splitLines(parts.join(''));
}

/** Iterative depth-first walk, so a deeply nested label cannot overflow the call stack. */
function collectText(root: Node, out: string[]): void {
	// A string on the stack is text to emit when reached (the closing newline of a block).
	const stack: (Node | string)[] = [root];
	while (stack.length > 0) {
		const item = stack.pop()!;
		if (typeof item === 'string') { out.push(item); continue; }
		if (item.nodeType === Node.TEXT_NODE) { out.push(item.nodeValue ?? ''); continue; }
		if (item.nodeType !== Node.ELEMENT_NODE) continue;

		const tag = (item as Element).tagName.toUpperCase();
		if (SKIPPED_TAGS.has(tag)) continue;
		if (tag === 'BR') { out.push('\n'); continue; }

		const block = BLOCK_TAGS.has(tag);
		if (block) out.push('\n');
		if (block) stack.push('\n');
		const children = item.childNodes;
		for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
	}
}

function splitLines(text: string): string[] {
	return text
		.replace(/\u00a0/g, ' ')
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line.length > 0);
}
