import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const immediateShim = fileURLToPath(new URL('./immediateShim.js', import.meta.url));
const setImmediateShim = fileURLToPath(new URL('./setImmediateShim.js', import.meta.url));
// jszip's package.json `browser` field points at a prebuilt dist/jszip.min.js with
// `immediate` already inlined, so a resolve hook never sees it. Resolve its
// readable source entry instead, which `require`s `lie` -> `immediate` normally.
const jszipSource = path.join(path.dirname(require.resolve('jszip/package.json')), 'lib', 'index.js');

/**
 * esbuild plugin: bundle jszip from source and swap the two scheduling
 * packages it pulls in — `immediate` (under its Promise layer) and the
 * `setimmediate` polyfill — for script-free shims.
 */
export const replaceImmediate = {
	name: 'replace-immediate',
	setup(build) {
		build.onResolve({ filter: /^jszip$/ }, () => ({ path: jszipSource }));
		build.onResolve({ filter: /^immediate$/ }, () => ({ path: immediateShim }));
		build.onResolve({ filter: /^setimmediate$/ }, () => ({ path: setImmediateShim }));
	},
};
