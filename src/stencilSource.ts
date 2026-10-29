/**
 * The official libraries come from a fixed release of draw.io, not from its development branch: draw.io moved the
 * stencil files out of the repository after this release (they are now built into its scripts), so the branch no
 * longer has them. A tag never changes, and neither do the files in it.
 */
export const STENCIL_REF = 'v31.7.0';

const RAW = `https://raw.githubusercontent.com/jgraph/drawio/${STENCIL_REF}/src/main/webapp`;

function safePath(path: string): string {
	if (path === '' || path.startsWith('/') || path.split('/').some(part => part === '' || part === '.' || part === '..')) {
		throw new Error(`unsafe library path: ${JSON.stringify(path)}`);
	}
	return path;
}

/** Address of a stencil file: `aws4` for a single-file library, `cisco/buildings` for a file in a directory library. */
export function stencilFileUrl(path: string): string {
	return `${RAW}/stencils/${safePath(path)}.xml`;
}

/** Address of an image under `img/lib/`, e.g. `ibm/social/communities.svg`. */
export function imageUrl(relPath: string): string {
	return `${RAW}/img/lib/${safePath(relPath)}`;
}

/**
 * The files of each directory library at that release. They are listed here instead of asked of the GitHub API,
 * which allows only 60 unauthenticated requests an hour and then fails the download; a tag's contents cannot change.
 */
export const STENCIL_DIR_FILES: Readonly<Record<string, readonly string[]>> = {
	cisco: [
		'buildings', 'computers_and_peripherals', 'controllers_and_modules', 'directors', 'hubs_and_gateways', 'misc',
		'modems_and_phones', 'people', 'routers', 'security', 'servers', 'storage', 'switches', 'wireless',
	],
	rack: [
		'apc', 'cisco', 'dell', 'f5', 'general', 'hp', 'ibm', 'oracle',
	],
	mockup: [
		'advertising', 'calendars', 'carousel', 'charts_and_tables', 'controls', 'form_elements', 'menus_and_buttons',
		'misc', 'tabs',
	],
	signs: [
		'animals', 'food', 'healthcare', 'nature', 'people', 'safety', 'science', 'sports', 'tech', 'transportation',
		'travel',
	],
	electrical: [
		'abstract', 'capacitors', 'diodes', 'electro-mechanical', 'iec417', 'iec_logic_gates', 'inductors', 'instruments',
		'logic_gates', 'miscellaneous', 'mosfets1', 'mosfets2', 'op_amps', 'opto_electronics', 'plc_ladder',
		'power_semiconductors', 'radio', 'resistors', 'rot_mech', 'signal_sources', 'thermionic_devices', 'transistors',
		'transmission', 'waveforms',
	],
	pid: [
		'agitators', 'apparatus_elements', 'centrifuges', 'compressors', 'compressors_iso', 'crushers_grinding', 'driers',
		'engines', 'feeders', 'filters', 'fittings', 'flow_sensors', 'heat_exchangers', 'instruments', 'misc', 'mixers',
		'piping', 'pumps', 'pumps_din', 'pumps_iso', 'separators', 'shaping_machines', 'valves', 'vessels',
	],
};

export const DIR_LIBS: readonly string[] = Object.keys(STENCIL_DIR_FILES);

export const isDirLib = (lib: string): boolean => lib in STENCIL_DIR_FILES;

export const stencilDirFiles = (lib: string): readonly string[] => STENCIL_DIR_FILES[lib] ?? [];
