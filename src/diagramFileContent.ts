import type { TFile } from 'obsidian';

/**
 * .drawio files are read as text; .vsdx (a ZIP/OOXML container) must be read
 * as binary via vault.readBinary(). Every content-cache/diffing/render path
 * has to handle both.
 */
export type FileContent = string | ArrayBuffer;

export function isBinaryDiagramFormat(file: TFile): boolean {
	return file.extension.toLowerCase() === 'vsdx';
}

export function contentEquals(a: FileContent, b: FileContent): boolean {
	if (typeof a === 'string' || typeof b === 'string') return a === b;
	if (a.byteLength !== b.byteLength) return false;
	const va = new Uint8Array(a);
	const vb = new Uint8Array(b);
	for (let i = 0; i < va.length; i++) {
		if (va[i] !== vb[i]) return false;
	}
	return true;
}

/**
 * Module-level cache of diagram file CONTENT keyed by path. Crucial for a
 * flash-free re-render: when the pin button writes view params into the .md
 * file, Obsidian rebuilds the code block, but the diagram file itself is
 * unchanged — so the new viewer can paint synchronously from this cache (no
 * async vault read gap, which is what caused the blank-flash) and verify in
 * the background.
 */
export const contentCache = new Map<string, FileContent>();
