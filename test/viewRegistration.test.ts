import { describe, expect, it } from 'vitest';
import { ViewRegistry } from '../src/viewRegistration';

const EXTS = ['drawio', 'vsdx', 'pptx'];
const always = () => true;

describe('ViewRegistry', () => {
	it('registers every enabled extension and records it as registered', () => {
		const registry = new ViewRegistry();
		const seen: string[] = [];
		registry.register(EXTS, always, ext => { seen.push(ext); });
		expect(seen).toEqual(EXTS);
		for (const ext of EXTS) expect(registry.isRegistered(ext)).toBe(true);
		expect(registry.refusals()).toEqual([]);
	});

	it('does not even try an extension the user switched off, and does not call it refused', () => {
		const registry = new ViewRegistry();
		const seen: string[] = [];
		registry.register(EXTS, ext => ext !== 'drawio', ext => { seen.push(ext); });
		expect(seen).toEqual(['vsdx', 'pptx']);
		expect(registry.isRegistered('drawio')).toBe(false);
		expect(registry.outcome('drawio')).toEqual({ status: 'disabled' });
		expect(registry.refusals()).toEqual([]);
	});

	it('one refusal does not stop the others, and does not throw', () => {
		const registry = new ViewRegistry();
		const seen: string[] = [];
		expect(() => registry.register(EXTS, always, ext => {
			if (ext === 'drawio') throw new Error('Attempting to register an existing file extension "drawio"');
			seen.push(ext);
		})).not.toThrow();
		expect(seen).toEqual(['vsdx', 'pptx']);
		expect(registry.isRegistered('drawio')).toBe(false);
		expect(registry.isRegistered('pptx')).toBe(true);
		expect(registry.refusals()).toEqual([{ ext: 'drawio', reason: 'Attempting to register an existing file extension "drawio"' }]);
	});

	it('keeps the reason when what was thrown is not an Error', () => {
		const registry = new ViewRegistry();
		registry.register(['drawio'], always, () => { throw 'nope'; });
		expect(registry.refusals()).toEqual([{ ext: 'drawio', reason: 'nope' }]);
	});

	it('an extension that was never attempted is not registered', () => {
		expect(new ViewRegistry().isRegistered('drawio')).toBe(false);
	});

	it('registering again replaces the earlier outcome (settings changed, plugin reloaded)', () => {
		const registry = new ViewRegistry();
		registry.register(['drawio'], always, () => { throw new Error('taken'); });
		registry.register(['drawio'], always, () => {});
		expect(registry.isRegistered('drawio')).toBe(true);
		expect(registry.refusals()).toEqual([]);
	});
});
