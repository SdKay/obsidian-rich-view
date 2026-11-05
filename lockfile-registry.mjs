/** The only registry whose addresses `npm ci` is willing to fetch in CI. */
export const OFFICIAL = 'https://registry.npmjs.org/';

/** Mirrors that a local npm may be configured for, and which then end up in the lockfile. */
export const MIRRORS = [
	'https://registry.npmmirror.com/',
	'https://registry.npm.taobao.org/',
];

/**
 * Every lockfile entry that downloads from somewhere other than the official registry. A lockfile written on a
 * machine configured for a mirror records the mirror's address, and npm 12 (what CI installs) refuses to fetch it:
 * `EALLOWREMOTE ... Refusing to fetch`. npm 11 quietly substitutes the configured registry, so the same lockfile
 * installs fine locally and only fails once it is released.
 */
export function findForeignRegistries(lockText) {
	const lock = JSON.parse(lockText);
	const found = [];
	for (const [name, pkg] of Object.entries(lock.packages ?? {})) {
		const url = pkg?.resolved;
		if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
		if (url.startsWith(OFFICIAL)) continue;
		found.push({ name, host: new URL(url).host });
	}
	return found;
}

/**
 * Points every known mirror back at the official registry. Safe because `resolved` only records where the tarball
 * came from: `integrity` is a hash of the tarball itself, and a mirror serves it byte for byte. A textual replace,
 * not a JSON round trip, so only the addresses change and a diff shows nothing else.
 */
export function normalizeRegistries(lockText) {
	let text = lockText;
	let replaced = 0;
	for (const mirror of MIRRORS) {
		const parts = text.split(mirror);
		replaced += parts.length - 1;
		text = parts.join(OFFICIAL);
	}
	return { text, replaced };
}
