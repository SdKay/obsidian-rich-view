import { describe, expect, it } from 'vitest';
import { addRename, expandFolderRename, updateFileRefs } from '../src/blockRefs';

const never = () => false;
const block = (params: string, fence = '```') => `${fence}rich-view\n${params}\n${fence}`;
const moved = (from: string, to: string) => new Map([[from, to]]);

describe('updateFileRefs', () => {
	it('points a block at the file\'s new path and keeps every other parameter', () => {
		const out = updateFileRefs(block('file=a/old.drawio|page=Overview|height=460|zoom=54|offset=348,105'), moved('a/old.drawio', 'b/new.drawio'), never);
		expect(out.content).toBe(block('file=b/new.drawio|page=Overview|height=460|zoom=54|offset=348,105'));
		expect(out.count).toBe(1);
	});

	it('changes only the block that names the moved file', () => {
		const text = `${block('file=a/old.drawio')}\n\ntext\n\n${block('file=a/other.drawio|zoom=80')}`;
		const out = updateFileRefs(text, moved('a/old.drawio', 'b/old.drawio'), never);
		expect(out.content).toBe(`${block('file=b/old.drawio')}\n\ntext\n\n${block('file=a/other.drawio|zoom=80')}`);
		expect(out.count).toBe(1);
	});

	it('updates a file= that is not the first parameter, and tolerates spaces around the value', () => {
		const out = updateFileRefs(block('height=300| file = a/old.vsdx |page=P'), moved('a/old.vsdx', 'a/new.vsdx'), never);
		expect(out.content).toBe(block('height=300| file = a/new.vsdx |page=P'));
	});

	it('reads the key in any case, as the parser does', () => {
		expect(updateFileRefs(block('FILE=a/old.pptx'), moved('a/old.pptx', 'a/new.pptx'), never).content).toBe(block('FILE=a/new.pptx'));
	});

	it('follows a block whose parameters are spread over several lines', () => {
		const text = '```rich-view\nfile=a/old.drawio\n|zoom=50\n```';
		expect(updateFileRefs(text, moved('a/old.drawio', 'a/new.drawio'), never).content).toBe('```rich-view\nfile=a/new.drawio\n|zoom=50\n```');
	});

	it('recognises an indented block, a longer fence and a block inside a callout', () => {
		const longer = updateFileRefs(block('  file=a/old.drawio', '````'), moved('a/old.drawio', 'n.drawio'), never);
		expect(longer.content).toBe(block('  file=n.drawio', '````'));
		const indented = updateFileRefs('  ```rich-view\n  file=a/old.drawio\n  ```', moved('a/old.drawio', 'n.drawio'), never);
		expect(indented.content).toBe('  ```rich-view\n  file=n.drawio\n  ```');
		const callout = '> [!note]\n> ```rich-view\n> file=a/old.drawio|zoom=70\n> ```';
		expect(updateFileRefs(callout, moved('a/old.drawio', 'b/old.drawio'), never).content)
			.toBe('> [!note]\n> ```rich-view\n> file=b/old.drawio|zoom=70\n> ```');
	});

	it('only rewrites file=, not another parameter that happens to hold the same text', () => {
		const text = block('file=other.drawio|page=a/old.drawio');
		expect(updateFileRefs(text, moved('a/old.drawio', 'b/x.drawio'), never)).toEqual({ content: text, count: 0 });
		const text2 = block('page=old.drawio|file=a/keep.drawio');
		expect(updateFileRefs(text2, moved('a/old.drawio', 'b/x.drawio'), never).count).toBe(0);
	});

	it('keeps Windows line endings', () => {
		const text = '```rich-view\r\nfile=a/old.drawio|zoom=50\r\n```\r\n';
		expect(updateFileRefs(text, moved('a/old.drawio', 'b/old.drawio'), never).content).toBe('```rich-view\r\nfile=b/old.drawio|zoom=50\r\n```\r\n');
	});

	it('does not touch a file= outside a rich-view block', () => {
		const text = '```js\nfile=a/old.drawio\n```\n\nfile=a/old.drawio\n\n```rich-view\nfile=a/old.drawio\n```';
		const out = updateFileRefs(text, moved('a/old.drawio', 'b/x.drawio'), never);
		expect(out.content).toBe('```js\nfile=a/old.drawio\n```\n\nfile=a/old.drawio\n\n```rich-view\nfile=b/x.drawio\n```');
		expect(out.count).toBe(1);
	});

	it('does not run on past a block\'s closing fence', () => {
		const text = '```rich-view\nfile=a/other.drawio\n```\nfile=a/old.drawio\n```rich-view\nfile=a/old.drawio\n```';
		const out = updateFileRefs(text, moved('a/old.drawio', 'b/x.drawio'), never);
		expect(out.content).toBe('```rich-view\nfile=a/other.drawio\n```\nfile=a/old.drawio\n```rich-view\nfile=b/x.drawio\n```');
	});

	it('reads a path written with a leading slash, backslashes or ./ as the same vault path', () => {
		for (const written of ['/a/old.drawio', 'a\\old.drawio', './a/old.drawio', 'a//old.drawio']) {
			expect(updateFileRefs(block(`file=${written}`), moved('a/old.drawio', 'b/old.drawio'), never).content).toBe(block('file=b/old.drawio'));
		}
	});

	it('matches paths without regard to case, as the viewer\'s link lookup does', () => {
		expect(updateFileRefs(block('file=A/Old.drawio'), moved('a/old.drawio', 'b/new.drawio'), never).count).toBe(1);
	});

	it('follows a bare file name that was renamed, because it no longer finds the file', () => {
		const out = updateFileRefs(block('file=old.drawio|zoom=80'), moved('folder/old.drawio', 'folder/new.drawio'), never);
		expect(out.content).toBe(block('file=folder/new.drawio|zoom=80'));
	});

	it('leaves a bare name alone when it still finds a file, e.g. the file only changed folder', () => {
		const text = block('file=old.drawio');
		const out = updateFileRefs(text, moved('a/old.drawio', 'b/old.drawio'), raw => raw === 'old.drawio');
		expect(out.content).toBe(text);
		expect(out.count).toBe(0);
	});

	it('leaves a partial path alone when it still finds a file', () => {
		const text = block('file=sub/old.drawio');
		expect(updateFileRefs(text, moved('a/sub/old.drawio', 'b/sub/old.drawio'), () => true).content).toBe(text);
	});

	it('does not mistake a longer name for the renamed one', () => {
		const text = block('file=a/old.drawio.bak');
		expect(updateFileRefs(text, moved('a/old.drawio', 'b/x.drawio'), never).count).toBe(0);
		const text2 = block('file=bold.drawio');
		expect(updateFileRefs(text2, moved('a/old.drawio', 'b/x.drawio'), never).count).toBe(0);
	});

	it('leaves a block with no file= and an empty block as they are', () => {
		const text = `${block('height=300')}\n\n\`\`\`rich-view\n\`\`\``;
		expect(updateFileRefs(text, moved('a/old.drawio', 'b/x.drawio'), never)).toEqual({ content: text, count: 0 });
	});

	it('applies several moves in one pass', () => {
		const renames = new Map([['a.drawio', 'x/a.drawio'], ['b.vsdx', 'x/b.vsdx']]);
		const out = updateFileRefs(`${block('file=a.drawio')}\n${block('file=b.vsdx')}`, renames, never);
		expect(out.content).toBe(`${block('file=x/a.drawio')}\n${block('file=x/b.vsdx')}`);
		expect(out.count).toBe(2);
	});

	it('leaves text without a rich-view block byte for byte unchanged', () => {
		const text = '# Title\n\nSome text\n';
		expect(updateFileRefs(text, moved('a', 'b'), never)).toEqual({ content: text, count: 0 });
	});
});

describe('addRename', () => {
	it('records a move', () => {
		const m = new Map<string, string>();
		addRename(m, 'a.drawio', 'b.drawio');
		expect([...m]).toEqual([['a.drawio', 'b.drawio']]);
	});

	it('joins a move that continues an earlier one into a single move from the first place to the last', () => {
		const m = new Map<string, string>();
		addRename(m, 'a.drawio', 'b.drawio');
		addRename(m, 'b.drawio', 'c.drawio');
		expect([...m]).toEqual([['a.drawio', 'c.drawio']]);
	});

	it('drops a move that ends where it began', () => {
		const m = new Map<string, string>();
		addRename(m, 'a.drawio', 'b.drawio');
		addRename(m, 'b.drawio', 'a.drawio');
		expect(m.size).toBe(0);
	});

	it('keeps unrelated moves apart', () => {
		const m = new Map<string, string>();
		addRename(m, 'a.drawio', 'b.drawio');
		addRename(m, 'c.drawio', 'd.drawio');
		expect(m.size).toBe(2);
	});
});

describe('expandFolderRename', () => {
	it('gives each file in a moved folder its old path', () => {
		expect(expandFolderRename('old', 'new/old', ['new/old/a.drawio', 'new/old/sub/b.vsdx'])).toEqual([
			['old/a.drawio', 'new/old/a.drawio'],
			['old/sub/b.vsdx', 'new/old/sub/b.vsdx'],
		]);
	});

	it('does the same for a renamed folder', () => {
		expect(expandFolderRename('docs', 'papers', ['papers/x.pptx'])).toEqual([['docs/x.pptx', 'papers/x.pptx']]);
	});

	it('ignores a path that is not inside the folder', () => {
		expect(expandFolderRename('docs', 'papers', ['papers2/x.pptx', 'other/y.pptx'])).toEqual([]);
	});
});
