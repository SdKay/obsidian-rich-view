import { describe, expect, it } from 'vitest';
import { migrateLegacyParams, parseViewParams } from '../src/viewParams';

describe('migrateLegacyParams', () => {
	it('returns null for the current key=value format', () => {
		expect(migrateLegacyParams('file=diagram.drawio|zoom=80')).toBeNull();
	});

	it('returns null for an unrelated bare string with no file extension', () => {
		expect(migrateLegacyParams('just some text|80%')).toBeNull();
	});

	it('converts a full legacy string with all five fields', () => {
		const migrated = migrateLegacyParams('diagram.drawio|440px|Overview|54%|(418, 15)');
		expect(migrated).toBe('file=diagram.drawio|height=440|page=Overview|zoom=54|offset=418,15');
	});

	it('converts a legacy string with only file and zoom', () => {
		expect(migrateLegacyParams('diagram.drawio|80%')).toBe('file=diagram.drawio|zoom=80');
	});

	it('converts a legacy .vsdx reference (format predates Visio support but should still round-trip)', () => {
		expect(migrateLegacyParams('chart.vsdx|page-2')).toBe('file=chart.vsdx|page-index=2');
	});

	it('the migrated string parses correctly via parseViewParams', () => {
		const migrated = migrateLegacyParams('diagram.drawio|440px|Overview|54%|(418, 15)');
		expect(migrated).not.toBeNull();
		const opts = parseViewParams(migrated!);
		expect(opts.filename).toBe('diagram.drawio');
		expect(opts.height).toBe(440);
		expect(opts.pageName).toBe('Overview');
		expect(opts.zoom).toBe(54);
		expect(opts.offsetX).toBe(418);
		expect(opts.offsetY).toBe(15);
		expect(opts.offsetSpecified).toBe(true);
	});
});
