import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script with no type declarations
import { findForeignRegistries, normalizeRegistries, OFFICIAL } from '../lockfile-registry.mjs';

const lock = (resolved: Record<string, string | undefined>) => JSON.stringify({
	lockfileVersion: 3,
	packages: {
		'': { name: 'x' },
		...Object.fromEntries(Object.entries(resolved).map(([name, url]) => [`node_modules/${name}`, url === undefined ? { version: '1.0.0' } : { version: '1.0.0', resolved: url }])),
	},
}, null, 4);

describe('findForeignRegistries', () => {
	it('finds nothing in a lockfile that only uses the official registry', () => {
		expect(findForeignRegistries(lock({ a: `${OFFICIAL}a/-/a-1.0.0.tgz`, b: `${OFFICIAL}b/-/b-1.0.0.tgz` }))).toEqual([]);
	});

	it('names the package and the host of an entry that came from a mirror', () => {
		const found = findForeignRegistries(lock({ a: `${OFFICIAL}a/-/a-1.0.0.tgz`, 'emf-converter': 'https://registry.npmmirror.com/emf-converter/-/emf-converter-4.25.2.tgz' }));
		expect(found).toEqual([{ name: 'node_modules/emf-converter', host: 'registry.npmmirror.com' }]);
	});

	it('reports every foreign entry, from any host', () => {
		const found = findForeignRegistries(lock({ a: 'https://registry.npm.taobao.org/a/-/a-1.tgz', b: 'https://example.com/b.tgz', c: `${OFFICIAL}c/-/c-1.tgz` }));
		expect(found.map(f => f.name).sort()).toEqual(['node_modules/a', 'node_modules/b']);
	});

	it('does not mistake a host that only starts like the official one for it', () => {
		expect(findForeignRegistries(lock({ a: 'https://registry.npmjs.org.evil.example/a.tgz' }))).toHaveLength(1);
		expect(findForeignRegistries(lock({ a: 'http://registry.npmjs.org/a.tgz' }))).toHaveLength(1);
	});

	it('ignores entries that have no download address (the root, workspace links)', () => {
		expect(findForeignRegistries(lock({ a: undefined }))).toEqual([]);
	});

	it('ignores git and file sources, which npm ci handles on its own terms', () => {
		expect(findForeignRegistries(lock({ a: 'git+ssh://git@github.com/x/a.git#abc', b: 'file:../b' }))).toEqual([]);
	});

	it('reads a lockfile with no packages as clean', () => {
		expect(findForeignRegistries('{"lockfileVersion":3}')).toEqual([]);
	});
});

describe('normalizeRegistries', () => {
	it('points every known mirror back at the official registry and says how many it changed', () => {
		const text = lock({ a: 'https://registry.npmmirror.com/a/-/a-1.0.0.tgz', b: 'https://registry.npm.taobao.org/b/-/b-1.0.0.tgz', c: `${OFFICIAL}c/-/c-1.0.0.tgz` });
		const out = normalizeRegistries(text);
		expect(out.replaced).toBe(2);
		expect(findForeignRegistries(out.text)).toEqual([]);
		expect(out.text).toContain(`${OFFICIAL}a/-/a-1.0.0.tgz`);
	});

	it('leaves the file byte for byte alone when there is nothing to change', () => {
		const text = lock({ a: `${OFFICIAL}a/-/a-1.0.0.tgz` });
		expect(normalizeRegistries(text)).toEqual({ text, replaced: 0 });
	});

	it('changes nothing but the address: formatting and every other line stay as they were', () => {
		const text = lock({ a: 'https://registry.npmmirror.com/a/-/a-1.0.0.tgz' });
		const out = normalizeRegistries(text).text;
		expect(out.replace(OFFICIAL, 'https://registry.npmmirror.com/')).toBe(text);
	});

	it('keeps the integrity hash, which is what makes the rewrite safe', () => {
		const text = JSON.stringify({ packages: { 'node_modules/a': { resolved: 'https://registry.npmmirror.com/a/-/a-1.tgz', integrity: 'sha512-abc' } } });
		expect(normalizeRegistries(text).text).toContain('"integrity":"sha512-abc"');
	});

	it('leaves a host it does not know in place, for findForeignRegistries to report', () => {
		const text = lock({ a: 'https://example.com/a.tgz' });
		const out = normalizeRegistries(text);
		expect(out.replaced).toBe(0);
		expect(findForeignRegistries(out.text)).toHaveLength(1);
	});
});

describe('this repository\'s package-lock.json', () => {
	it('only downloads from the official npm registry, which is the only kind of address npm 12 will fetch in CI', () => {
		const found = findForeignRegistries(readFileSync('package-lock.json', 'utf8'));
		expect(found, `Run: npm run lockfile:normalize\n${found.map((f: { name: string; host: string }) => `  ${f.name} <- ${f.host}`).join('\n')}`).toEqual([]);
	});
});
