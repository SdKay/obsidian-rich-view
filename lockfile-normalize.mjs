import { readFileSync, writeFileSync } from 'fs';
import { findForeignRegistries, normalizeRegistries, OFFICIAL } from './lockfile-registry.mjs';

// `node lockfile-normalize.mjs`        rewrite known mirrors in package-lock.json back to the official registry
// `node lockfile-normalize.mjs --check` change nothing, exit 1 if the lockfile would not install in CI
const FILE = 'package-lock.json';
const check = process.argv.includes('--check');

const before = readFileSync(FILE, 'utf8');
const { text, replaced } = check ? { text: before, replaced: 0 } : normalizeRegistries(before);
if (replaced > 0) writeFileSync(FILE, text);

const foreign = findForeignRegistries(text);
if (foreign.length === 0) {
	console.log(replaced > 0 ? `[lockfile] ${replaced} mirror URL(s) pointed back at ${OFFICIAL}` : '[lockfile] ok: every package downloads from the official registry');
} else {
	console.error(`[lockfile] ${foreign.length} package(s) download from somewhere other than ${OFFICIAL}; npm 12 in CI refuses that (EALLOWREMOTE):`);
	for (const f of foreign) console.error(`  ${f.name}  <-  ${f.host}`);
	console.error(check ? 'Fix it with: npm run lockfile:normalize' : 'Unknown host(s): fix them by hand.');
	process.exitCode = 1;
}
