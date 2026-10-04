import { describe, expect, it } from 'vitest';
import { patchCellLink } from '../src/cellLink';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

const PLAIN = '<mxGraphModel><root><mxCell id="0"/><mxCell id="2" value="Box" vertex="1"/></root></mxGraphModel>';
const WRAPPED = '<mxGraphModel><root><mxCell id="0"/><UserObject label="Box" id="2"><mxCell vertex="1"/></UserObject></root></mxGraphModel>';

describe('patchCellLink', () => {
	it('wraps a plain mxCell in a UserObject that carries the id, label and link', () => {
		const doc = parse(patchCellLink(PLAIN, '2', 'notes/page'));
		const user = doc.querySelector('UserObject');
		expect(user?.getAttribute('id')).toBe('2');
		expect(user?.getAttribute('label')).toBe('Box');
		expect(user?.getAttribute('link')).toBe('notes/page');
		// The cell moves inside the wrapper and no longer carries the id/value itself.
		const inner = user?.querySelector('mxCell');
		expect(inner?.getAttribute('id')).toBeNull();
		expect(inner?.getAttribute('value')).toBeNull();
		expect(inner?.getAttribute('vertex')).toBe('1');
	});

	it('creates the wrapper without introducing a namespace', () => {
		const out = patchCellLink(PLAIN, '2', 'x');
		expect(out).not.toContain('xmlns');
	});

	it('updates the link on an existing UserObject', () => {
		const doc = parse(patchCellLink(WRAPPED, '2', 'new'));
		expect(doc.querySelector('UserObject')?.getAttribute('link')).toBe('new');
	});

	it('removes the link when given an empty string', () => {
		const withLink = patchCellLink(WRAPPED, '2', 'old');
		const doc = parse(patchCellLink(withLink, '2', ''));
		expect(doc.querySelector('UserObject')?.hasAttribute('link')).toBe(false);
	});

	it('leaves the file untouched when clearing a link that was never set', () => {
		expect(patchCellLink(PLAIN, '2', '')).toBe(PLAIN);
	});

	it('leaves the file untouched for an unknown cell id', () => {
		expect(patchCellLink(PLAIN, 'missing', 'x')).toBe(PLAIN);
	});

	it('leaves malformed XML untouched', () => {
		const bad = '<mxGraphModel><root></mxGraphModel>';
		expect(patchCellLink(bad, '2', 'x')).toBe(bad);
	});
});
