import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
	requestUrl: vi.fn(),
	normalizePath: (p: string) => p.replace(/\/+/g, '/'),
}));

import { stencilManager } from '../src/stencilManager';

/** An in-memory stand-in for the vault adapter: the given paths exist, folders list the files under them. */
function adapterWith(paths: string[]) {
	const set = new Set(paths);
	return {
		exists: async (p: string) => set.has(p) || paths.some(x => x.startsWith(p + '/')),
		list: async (dir: string) => ({
			files: paths.filter(x => x.startsWith(dir + '/') && !x.slice(dir.length + 1).includes('/')),
			folders: [] as string[],
		}),
	} as never;
}

describe('findMissingLibs: which libraries the banner offers to download', () => {
	const dir = '.obsidian/plugins/rich-view/stencils';

	it('offers an official library that is not on disk yet', async () => {
		expect(await stencilManager.findMissingLibs(['aws4'], adapterWith([]), dir, null)).toEqual(['aws4']);
	});
	it('does not offer one that is already downloaded', async () => {
		expect(await stencilManager.findMissingLibs(['azure'], adapterWith([`${dir}/azure.xml`]), dir, null)).toEqual([]);
	});
	it('does not offer a library draw.io has no stencil file for, since the download could only fail', async () => {
		expect(await stencilManager.findMissingLibs(['infographic'], adapterWith([]), dir, null)).toEqual([]);
	});
	it('still uses a file of that name from the user\'s own folder, if there is one', async () => {
		expect(await stencilManager.findMissingLibs(['infographic'], adapterWith(['mine/infographic.xml']), dir, 'mine')).toEqual([]);
	});
	it('offers only the downloadable ones when a diagram uses both kinds', async () => {
		expect(await stencilManager.findMissingLibs(['infographic', 'aws4', 'basic'], adapterWith([]), dir, null)).toEqual(['aws4', 'basic']);
	});
	it('does not offer a library already loaded in this session, even if its file has since gone', async () => {
		await stencilManager.registerLocalLibs(['azure'], '', {
			exists: async (p: string) => p === `${dir}/azure.xml`,
			read: async () => '<shapes name="mxgraph.azure"></shapes>',
			list: async () => ({ files: [], folders: [] }),
		} as never, dir, null);
		expect(await stencilManager.findMissingLibs(['azure'], adapterWith([]), dir, null)).toEqual([]);
	});
	it('offers a directory library with no xml yet, and not one that has files', async () => {
		expect(await stencilManager.findMissingLibs(['cisco'], adapterWith([]), dir, null)).toEqual(['cisco']);
		expect(await stencilManager.findMissingLibs(['cisco'], adapterWith([`${dir}/cisco/buildings.xml`]), dir, null)).toEqual([]);
	});
});
