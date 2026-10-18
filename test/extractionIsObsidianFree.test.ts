// @vitest-environment node
import { build } from 'esbuild';
import { expect, it } from 'vitest';

// esbuild cannot run under jsdom, hence the separate file and environment.
it('the extraction side bundles with obsidian marked external and finds no import of it', async () => {
	const result = await build({
		entryPoints: ['src/search/provider.ts'],
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		external: ['obsidian'],
		logLevel: 'silent',
		metafile: true,
	});
	const imported = Object.values(result.metafile.outputs).flatMap(o => o.imports.map(i => i.path));
	expect(imported).not.toContain('obsidian');
});
