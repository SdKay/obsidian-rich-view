import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { boundedInflateRaw, INPUT_SLICE_BYTES, InflateLimitError } from '../src/boundedInflate';
import * as pako from 'pako';

const deflate = (s: string) => new Uint8Array(deflateRawSync(Buffer.from(s)));

describe('boundedInflateRaw', () => {
	it('returns the original bytes when under the limit', () => {
		const out = boundedInflateRaw(deflate('hello world'), 1024);
		expect(new TextDecoder().decode(out)).toBe('hello world');
	});

	it('handles output larger than one internal chunk', () => {
		const text = 'abcdefghij'.repeat(50_000); // 500 KB, well over pako's default 64 KB chunk
		const out = boundedInflateRaw(deflate(text), 10 * 1024 * 1024);
		expect(out.length).toBe(text.length);
		expect(new TextDecoder().decode(out)).toBe(text);
	});

	it('stops with InflateLimitError once the output would exceed the limit', () => {
		const bomb = deflate('x'.repeat(5 * 1024 * 1024)); // ~5 KB compressed, 5 MB inflated
		expect(bomb.length).toBeLessThan(20 * 1024);
		expect(() => boundedInflateRaw(bomb, 1024 * 1024)).toThrow(InflateLimitError);
	});

	it('stops inflating shortly after the limit instead of finishing the bomb', () => {
		// Count how many bytes pako actually produces, by spying on its onData.
		let produced = 0;
		const proto = (pako.Inflate as unknown as { prototype: { push: (...a: unknown[]) => unknown } }).prototype;
		const realPush = proto.push;
		proto.push = function (this: { onData: (c: Uint8Array) => void }, ...args: unknown[]) {
			const orig = this.onData;
			this.onData = (c: Uint8Array) => { produced += c.length; orig.call(this, c); };
			return realPush.apply(this, args);
		};
		try {
			const bomb = deflate('x'.repeat(64 * 1024 * 1024)); // inflates to 64 MB if run to the end
			const limit = 256 * 1024;
			expect(() => boundedInflateRaw(bomb, limit)).toThrow(InflateLimitError);
			// Allowed overshoot: one input slice can expand ~1032x.
			expect(produced).toBeLessThan(limit + INPUT_SLICE_BYTES * 1032 + 64 * 1024);
			expect(produced).toBeLessThan(64 * 1024 * 1024 / 8);
		} finally {
			proto.push = realPush;
		}
	});

	it('accepts output of exactly the limit and rejects one byte over', () => {
		const data = 'y'.repeat(4096);
		expect(boundedInflateRaw(deflate(data), 4096).length).toBe(4096);
		expect(() => boundedInflateRaw(deflate(data), 4095)).toThrow(InflateLimitError);
	});

	it('throws a plain Error (not the limit error) for corrupt data', () => {
		const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		let caught: unknown;
		try { boundedInflateRaw(garbage, 1024); } catch (e) { caught = e; }
		expect(caught).toBeInstanceOf(Error);
		expect(caught).not.toBeInstanceOf(InflateLimitError);
	});
});
