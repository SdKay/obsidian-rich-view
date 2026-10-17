import { Inflate } from 'pako';

/** Input bytes fed to the inflater between limit checks. Bounds the overshoot to ~1032 × this. */
export const INPUT_SLICE_BYTES = 1024;

/** Thrown when decompressed output would exceed the caller's limit. */
export class InflateLimitError extends Error {
	constructor(readonly limitBytes: number) {
		super(`Decompressed data exceeds the ${Math.round(limitBytes / 1048576)} MB limit`);
		this.name = 'InflateLimitError';
	}
}

/**
 * Raw-deflate decompression that gives up as soon as the output passes
 * `limitBytes`, instead of materialising a decompression bomb first. pako's
 * one-shot `inflateRaw` has no cap: a few hundred KB of input can expand to
 * hundreds of MB. Chunks are collected and only joined once the total is
 * known to be within the limit.
 *
 * Throws `InflateLimitError` over the limit, and a plain `Error` for corrupt data.
 */
export function boundedInflateRaw(data: Uint8Array, limitBytes: number): Uint8Array {
	const chunks: Uint8Array[] = [];
	let total = 0;
	let overLimit = false;

	const inflate = new Inflate({ raw: true });
	inflate.onData = (chunk: Uint8Array) => {
		if (overLimit) return;
		total += chunk.length;
		if (total > limitBytes) { overLimit = true; return; }
		chunks.push(chunk);
	};

	// pako cannot be stopped inside one push(), so the limit is only checked
	// between slices. Deflate expands at most ~1032:1, so a slice of N input
	// bytes adds at most ~1032*N bytes of work past the limit — keep N small.
	for (let offset = 0; offset < data.length && !overLimit; offset += INPUT_SLICE_BYTES) {
		const last = offset + INPUT_SLICE_BYTES >= data.length;
		inflate.push(data.subarray(offset, offset + INPUT_SLICE_BYTES), last);
		if (inflate.err) throw new Error(inflate.msg || 'Corrupt compressed data');
	}
	if (overLimit) throw new InflateLimitError(limitBytes);
	if (inflate.err) throw new Error(inflate.msg || 'Corrupt compressed data');

	const out = new Uint8Array(total);
	let pos = 0;
	for (const chunk of chunks) { out.set(chunk, pos); pos += chunk.length; }
	return out;
}
