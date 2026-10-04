// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { builtinModules } from 'node:module';
import { replaceImmediate } from '../build/replaceImmediate.mjs';

/**
 * Bundle jszip exactly the way the plugin build does, then use it. Guards the
 * two things that can silently break: the script-injection patterns Obsidian's
 * review rejects creeping back in, and the shimmed schedulers no longer
 * driving jszip's async zip/unzip.
 */
async function bundleJszipEntry(): Promise<string> {
	const result = await build({
		stdin: {
			contents: `
				import JSZip from 'jszip';
				export async function roundTrip() {
					const zip = new JSZip();
					zip.file('a.txt', 'hello');
					zip.file('dir/b.xml', '<x/>');
					const bytes = await zip.generateAsync({ type: 'uint8array' });
					const back = await JSZip.loadAsync(bytes);
					return [await back.file('a.txt').async('string'), await back.file('dir/b.xml').async('string')];
				}
			`,
			resolveDir: process.cwd(),
			loader: 'js',
		},
		bundle: true,
		write: false,
		format: 'cjs',
		platform: 'browser',
		// Same as the plugin build: Node built-ins are left external, not bundled.
		external: [...builtinModules],
		plugins: [replaceImmediate],
	});
	return result.outputFiles[0]!.text;
}

describe('jszip as bundled by the plugin', () => {
	it('contains no runtime script-element creation', async () => {
		const code = await bundleJszipEntry();
		expect(code).not.toMatch(/createElement\(\s*["'`]script["'`]\s*\)/);
		expect(code).not.toContain('document.write');
	});

	it('still zips and unzips correctly through the shimmed schedulers', async () => {
		const code = await bundleJszipEntry();
		const module: { exports: { roundTrip?: () => Promise<string[]> } } = { exports: {} };
		new Function('module', 'exports', code)(module, module.exports);
		expect(await module.exports.roundTrip!()).toEqual(['hello', '<x/>']);
	});
});
