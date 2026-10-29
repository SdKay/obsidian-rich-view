import { describe, expect, it } from 'vitest';
import { imageUrl, stencilFileUrl, stencilDirFiles, STENCIL_REF, isDirLib, DIR_LIBS } from '../src/stencilSource';

describe('where the official libraries are downloaded from', () => {
	it('is a fixed release tag, never a branch, so it keeps working when the branch moves on', () => {
		expect(STENCIL_REF).toMatch(/^v\d+\.\d+\.\d+$/);
		const ref = /jgraph\/drawio\/([^/]+)\//.exec(stencilFileUrl('aws4'))![1];
		expect(ref).toBe(STENCIL_REF);
		expect(['dev', 'main', 'master']).not.toContain(ref);
	});
	it('builds the address of a single-file library from the tag', () => {
		expect(stencilFileUrl('aws4')).toBe(`https://raw.githubusercontent.com/jgraph/drawio/${STENCIL_REF}/src/main/webapp/stencils/aws4.xml`);
	});
	it('builds the address of a file inside a directory library', () => {
		expect(stencilFileUrl('cisco/buildings')).toBe(`https://raw.githubusercontent.com/jgraph/drawio/${STENCIL_REF}/src/main/webapp/stencils/cisco/buildings.xml`);
	});
	it('builds the address of an image from the same tag', () => {
		expect(imageUrl('ibm/social/communities.svg')).toBe(`https://raw.githubusercontent.com/jgraph/drawio/${STENCIL_REF}/src/main/webapp/img/lib/ibm/social/communities.svg`);
	});
	it('refuses a path that climbs out of the folder', () => {
		expect(() => stencilFileUrl('../../etc/passwd')).toThrow();
		expect(() => imageUrl('../secret.svg')).toThrow();
		expect(() => stencilFileUrl('a//b')).toThrow();
	});
});

describe('directory libraries are listed in the plugin, so no API call is needed', () => {
	it('knows the files of every directory library', () => {
		for (const lib of DIR_LIBS) expect(stencilDirFiles(lib).length).toBeGreaterThan(0);
	});
	it('lists each file once, as a bare name without folder or extension', () => {
		for (const lib of DIR_LIBS) {
			const files = stencilDirFiles(lib);
			expect(new Set(files).size).toBe(files.length);
			for (const f of files) expect(f).toMatch(/^[A-Za-z0-9_\-]+$/);
		}
	});
	it('says which names are directory libraries', () => {
		expect(isDirLib('cisco')).toBe(true);
		expect(isDirLib('aws4')).toBe(false);
	});
	it('has the same libraries the library list marks as directories', () => {
		expect([...DIR_LIBS].sort()).toEqual(['cisco', 'electrical', 'mockup', 'pid', 'rack', 'signs']);
	});
	it('gives an empty list for a library it does not know', () => {
		expect(stencilDirFiles('aws4')).toEqual([]);
	});
});
