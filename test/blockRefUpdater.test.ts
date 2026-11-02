import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notices: string[] = [];
vi.mock('obsidian', () => {
	class TAbstractFile { constructor(public path: string) {} }
	class TFile extends TAbstractFile { get extension() { return this.path.split('.').pop() ?? ''; } }
	class TFolder extends TAbstractFile {}
	return {
		TFile, TFolder,
		Notice: class { constructor(message: string) { notices.push(message); } },
		normalizePath: (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, ''),
		getLanguage: () => 'en',
	};
});

import { TFile, TFolder } from 'obsidian';
import { BlockRefUpdater } from '../src/blockRefUpdater';

const EXT = ['drawio', 'vsdx', 'pptx'];

/** A small vault: notes with text, other files by path. `code` says whether the metadata cache reports a code block. */
function makeVault(notes: Record<string, string>, others: string[], codeSections: Record<string, boolean> = {}) {
	const texts = { ...notes };
	const files = new Map<string, InstanceType<typeof TFile>>();
	for (const p of [...Object.keys(notes), ...others]) files.set(p, new TFile(p));
	const reads: string[] = [];
	const writes: string[] = [];
	const app = {
		vault: {
			getFiles: () => [...files.values()],
			getMarkdownFiles: () => [...files.values()].filter(f => f.path.endsWith('.md')),
			getAbstractFileByPath: (p: string) => files.get(p) ?? null,
			cachedRead: (f: { path: string }) => { reads.push(f.path); return Promise.resolve(texts[f.path]!); },
			process: (f: { path: string }, fn: (s: string) => string) => { writes.push(f.path); texts[f.path] = fn(texts[f.path]!); return Promise.resolve(texts[f.path]); },
		},
		metadataCache: {
			getFileCache: (f: { path: string }) => (f.path in codeSections ? { sections: codeSections[f.path] ? [{ type: 'code' }] : [{ type: 'paragraph' }] } : null),
			// Obsidian's link lookup: a bare name finds the one file with that name, wherever it is.
			getFirstLinkpathDest: (name: string) => [...files.values()].find(f => f.path === name || f.path.endsWith(`/${name}`)) ?? null,
		},
	};
	const rename = (from: string, to: string) => { const f = files.get(from)!; files.delete(from); f.path = to; files.set(to, f); return f; };
	return { app: app as never, texts, files, reads, writes, rename };
}

const block = (params: string) => `\`\`\`rich-view\n${params}\n\`\`\``;

describe('BlockRefUpdater', () => {
	beforeEach(() => { vi.useFakeTimers(); notices.length = 0; });
	afterEach(() => { vi.useRealTimers(); });

	it('rewrites a block to the file\'s new path after a move, and says so', async () => {
		const v = makeVault({ 'n.md': `intro\n\n${block('file=a/x.drawio|page=P|zoom=60')}\n` }, ['a/x.drawio']);
		const u = new BlockRefUpdater(v.app, EXT);
		u.onRename(v.rename('a/x.drawio', 'b/x.drawio'), 'a/x.drawio');
		await vi.runAllTimersAsync();
		expect(v.texts['n.md']).toBe(`intro\n\n${block('file=b/x.drawio|page=P|zoom=60')}\n`);
		expect(notices).toEqual(['Updated 1 rich-view block(s) in 1 note(s) to follow the moved file']);
	});

	it('scans once for renames reported together, after they have all arrived', async () => {
		const v = makeVault({ 'n.md': `${block('file=p/a.drawio')}\n${block('file=p/b.vsdx')}` }, ['p/a.drawio', 'p/b.vsdx']);
		const u = new BlockRefUpdater(v.app, EXT);
		u.onRename(v.rename('p/a.drawio', 'x/a.drawio'), 'p/a.drawio');
		u.onRename(v.rename('p/b.vsdx', 'x/b.vsdx'), 'p/b.vsdx');
		expect(v.reads).toEqual([]);
		await vi.runAllTimersAsync();
		expect(v.texts['n.md']).toBe(`${block('file=x/a.drawio')}\n${block('file=x/b.vsdx')}`);
		expect(v.reads.filter(p => p === 'n.md').length).toBeGreaterThan(0);
		expect(v.writes).toEqual(['n.md']);
	});

	it('ignores files that Rich View does not show, and notes', async () => {
		const v = makeVault({ 'n.md': block('file=a/x.drawio'), 'm.md': 'text' }, ['a/x.drawio', 'pic.png']);
		const u = new BlockRefUpdater(v.app, EXT);
		u.onRename(v.rename('pic.png', 'p2.png'), 'pic.png');
		u.onRename(v.rename('m.md', 'm2.md'), 'm.md');
		await vi.runAllTimersAsync();
		expect(v.reads).toEqual([]);
		expect(v.writes).toEqual([]);
	});

	it('leaves a bare file name alone when Obsidian still finds the file by it', async () => {
		const text = block('file=x.drawio');
		const v = makeVault({ 'n.md': text }, ['a/x.drawio']);
		const u = new BlockRefUpdater(v.app, EXT);
		u.onRename(v.rename('a/x.drawio', 'b/x.drawio'), 'a/x.drawio');
		await vi.runAllTimersAsync();
		expect(v.texts['n.md']).toBe(text);
		expect(v.writes).toEqual([]);
		expect(notices).toEqual([]);
	});

	it('follows a bare file name once the file was renamed and the name finds nothing', async () => {
		const v = makeVault({ 'n.md': block('file=x.drawio|zoom=80') }, ['a/x.drawio']);
		const u = new BlockRefUpdater(v.app, EXT);
		u.onRename(v.rename('a/x.drawio', 'a/y.drawio'), 'a/x.drawio');
		await vi.runAllTimersAsync();
		expect(v.texts['n.md']).toBe(block('file=a/y.drawio|zoom=80'));
	});

	it('follows every file of a folder that was moved', async () => {
		const v = makeVault({ 'n.md': `${block('file=docs/a.drawio')}\n${block('file=docs/sub/b.pptx')}` }, ['docs/a.drawio', 'docs/sub/b.pptx']);
		const u = new BlockRefUpdater(v.app, EXT);
		v.rename('docs/a.drawio', 'papers/a.drawio');
		v.rename('docs/sub/b.pptx', 'papers/sub/b.pptx');
		u.onRename(new TFolder('papers'), 'docs');
		await vi.runAllTimersAsync();
		expect(v.texts['n.md']).toBe(`${block('file=papers/a.drawio')}\n${block('file=papers/sub/b.pptx')}`);
		expect(notices).toEqual(['Updated 2 rich-view block(s) in 1 note(s) to follow the moved file']);
	});

	it('does not double-count when a folder move also reports each file', async () => {
		const v = makeVault({ 'n.md': block('file=docs/a.drawio') }, ['docs/a.drawio']);
		const u = new BlockRefUpdater(v.app, EXT);
		const f = v.rename('docs/a.drawio', 'papers/a.drawio');
		u.onRename(f, 'docs/a.drawio');
		u.onRename(new TFolder('papers'), 'docs');
		await vi.runAllTimersAsync();
		expect(v.texts['n.md']).toBe(block('file=papers/a.drawio'));
		expect(notices).toEqual(['Updated 1 rich-view block(s) in 1 note(s) to follow the moved file']);
	});

	it('does not open notes that have no code block', async () => {
		const v = makeVault({ 'plain.md': 'no blocks here', 'n.md': block('file=a/x.drawio') }, ['a/x.drawio'], { 'plain.md': false, 'n.md': true });
		const u = new BlockRefUpdater(v.app, EXT);
		u.onRename(v.rename('a/x.drawio', 'b/x.drawio'), 'a/x.drawio');
		await vi.runAllTimersAsync();
		expect(v.reads).toEqual(['n.md']);
	});

	it('keeps going when one note cannot be updated', async () => {
		const v = makeVault({ 'a.md': block('file=a/x.drawio'), 'b.md': block('file=a/x.drawio') }, ['a/x.drawio']);
		const original = (v.app as { vault: { process: (...a: never[]) => Promise<unknown> } }).vault.process;
		(v.app as { vault: { process: unknown } }).vault.process = (f: { path: string }, fn: never) => (f.path === 'a.md' ? Promise.reject(new Error('locked')) : original(f as never, fn));
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const u = new BlockRefUpdater(v.app, EXT);
		u.onRename(v.rename('a/x.drawio', 'b/x.drawio'), 'a/x.drawio');
		await vi.runAllTimersAsync();
		expect(v.texts['b.md']).toBe(block('file=b/x.drawio'));
		expect(err).toHaveBeenCalled();
		err.mockRestore();
	});

	it('does nothing once disposed', async () => {
		const v = makeVault({ 'n.md': block('file=a/x.drawio') }, ['a/x.drawio']);
		const u = new BlockRefUpdater(v.app, EXT);
		u.onRename(v.rename('a/x.drawio', 'b/x.drawio'), 'a/x.drawio');
		u.dispose();
		await vi.runAllTimersAsync();
		expect(v.writes).toEqual([]);
	});

	it('stops scanning when it is disposed part way through', async () => {
		const v = makeVault({ 'a.md': block('file=a/x.drawio'), 'b.md': block('file=a/x.drawio') }, ['a/x.drawio']);
		const u = new BlockRefUpdater(v.app, EXT);
		const read = (v.app as { vault: { cachedRead: (f: { path: string }) => Promise<string> } }).vault.cachedRead;
		(v.app as { vault: { cachedRead: unknown } }).vault.cachedRead = (f: { path: string }) => { u.dispose(); return read(f); };
		u.onRename(v.rename('a/x.drawio', 'b/x.drawio'), 'a/x.drawio');
		await vi.runAllTimersAsync();
		expect(v.writes).toEqual([]);
		expect(v.reads).toEqual(['a.md']);
	});

	it('says nothing when no block needed updating', async () => {
		const v = makeVault({ 'n.md': block('file=other/y.drawio') }, ['a/x.drawio', 'other/y.drawio']);
		const u = new BlockRefUpdater(v.app, EXT);
		u.onRename(v.rename('a/x.drawio', 'b/x.drawio'), 'a/x.drawio');
		await vi.runAllTimersAsync();
		expect(notices).toEqual([]);
		expect(v.writes).toEqual([]);
	});
});
