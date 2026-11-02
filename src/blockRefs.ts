/** How a vault path is compared: one slash kind, no doubled, leading or `./` parts, case ignored. */
function pathKey(path: string): string {
	return path.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '').toLowerCase();
}

/** Records that `from` became `to`; a move that continues an earlier one extends it, and one that undoes it cancels it. */
export function addRename(renames: Map<string, string>, from: string, to: string): void {
	for (const [origin, current] of renames) {
		if (current !== from) continue;
		if (origin === to) renames.delete(origin);
		else renames.set(origin, to);
		return;
	}
	if (from !== to) renames.set(from, to);
}

/** The (old, new) path of every file inside a folder that was renamed or moved, given the files' paths now. */
export function expandFolderRename(oldFolder: string, newFolder: string, filesNow: readonly string[]): [string, string][] {
	const prefix = `${newFolder}/`;
	return filesNow.filter(p => p.startsWith(prefix)).map(p => [`${oldFolder}/${p.slice(prefix.length)}`, p]);
}

/** The renamed file a `file=` value used to name, or null. A bare name or partial path names a file by the end of its path. */
function renamedFrom(value: string, renames: ReadonlyMap<string, string>): string | null {
	const key = pathKey(value);
	if (!key) return null;
	for (const from of renames.keys()) {
		const old = pathKey(from);
		if (old === key || old.endsWith(`/${key}`)) return from;
	}
	return null;
}

const OPENING_FENCE = /^([ \t>]*)(`{3,}|~{3,})rich-view\b/;
const FILE_SEGMENT = /^(\s*file\s*=\s*)(.*?)(\s*)$/i;

/**
 * Rewrites every `file=` of a `rich-view` block that named a renamed file, to the file's new path; nothing else in the
 * text changes. `resolves(value)` says whether a value still finds a file in the vault: a bare name or partial path that
 * still does (the file only changed folder, or another file has that name) is left as the author wrote it.
 */
export function updateFileRefs(
	content: string,
	renames: ReadonlyMap<string, string>,
	resolves: (value: string) => boolean,
): { content: string; count: number } {
	const lines = content.split('\n');
	let count = 0;
	let closing: RegExp | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (!closing) {
			const open = OPENING_FENCE.exec(line);
			if (open) closing = new RegExp(`^[ \\t>]*${open[2]![0]}{${open[2]!.length},}\\s*$`);
			continue;
		}
		if (closing.test(line)) { closing = null; continue; }

		// Parameters are separated by `|`; a trailing \r (Windows line ending) stays where it is.
		const prefix = /^[ \t>]*/.exec(line)![0];
		const segments = line.slice(prefix.length).split('|');
		let changed = false;
		for (let s = 0; s < segments.length; s++) {
			const m = FILE_SEGMENT.exec(segments[s]!);
			if (!m) continue;
			const from = renamedFrom(m[2]!, renames);
			if (from === null || resolves(m[2]!)) continue;
			segments[s] = `${m[1]}${renames.get(from)!}${m[3]}`;
			count++;
			changed = true;
		}
		if (changed) lines[i] = prefix + segments.join('|');
	}
	return { content: lines.join('\n'), count };
}
