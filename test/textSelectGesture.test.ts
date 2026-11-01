import { describe, expect, it } from 'vitest';
import { startsTextSelection } from '../src/textSelectGesture';

describe('startsTextSelection', () => {
	it('is true for the main mouse button with Alt held', () => {
		expect(startsTextSelection({ pointerType: 'mouse', button: 0, altKey: true })).toBe(true);
	});
	it('is false without Alt, so a plain drag still pans', () => {
		expect(startsTextSelection({ pointerType: 'mouse', button: 0, altKey: false })).toBe(false);
	});
	it('is false for other mouse buttons', () => {
		expect(startsTextSelection({ pointerType: 'mouse', button: 2, altKey: true })).toBe(false);
		expect(startsTextSelection({ pointerType: 'mouse', button: 1, altKey: true })).toBe(false);
	});
	it('is false for touch and pen, which always pan or pinch', () => {
		expect(startsTextSelection({ pointerType: 'touch', button: 0, altKey: true })).toBe(false);
		expect(startsTextSelection({ pointerType: 'pen', button: 0, altKey: true })).toBe(false);
	});
});
