import { readFileSync, writeFileSync } from 'fs';

// Run by `npm version` (via the "version" script) with the new version in the environment.
const targetVersion = process.env.npm_package_version;
if (!targetVersion) throw new Error('npm_package_version is not set: run this through `npm version`');

/** Reads a JSON file and writes it back with the indentation and line ending it already had, so only the change shows up in a diff. */
function updateJson(path, change) {
	const text = readFileSync(path, 'utf8');
	const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? '\t';
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const data = change(JSON.parse(text));
	writeFileSync(path, JSON.stringify(data, null, indent).replace(/\n/g, eol) + (text.endsWith('\n') ? eol : ''));
}

let minAppVersion;
updateJson('manifest.json', manifest => {
	minAppVersion = manifest.minAppVersion;
	manifest.version = targetVersion;
	return manifest;
});

// A version already listed keeps the minAppVersion it was released with.
updateJson('versions.json', versions => {
	if (!(targetVersion in versions)) versions[targetVersion] = minAppVersion;
	return versions;
});
