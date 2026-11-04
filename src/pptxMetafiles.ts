import { convertMetafileToSvg } from 'emf-converter';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

/** A metafile bigger than this is left as it is: converting one is not free, and a picture this large is unusual. */
const DEFAULT_MAX_METAFILE_BYTES = 8 * 1024 * 1024;
const METAFILE = /\.(emf|wmf)$/i;
const MEDIA = /^ppt\/media\//;
const CONTENT_TYPES = '[Content_Types].xml';

export interface MetafileOptions {
	maxMetafileBytes?: number;
}

/**
 * A copy of a PowerPoint file in which every EMF/WMF picture is an SVG. The renderer library only draws the bitmap
 * or PDF that some metafiles carry inside them, and nothing for the common vector kind, so those pictures come out
 * blank; as SVG the library shows them like any other image. Each rename is followed through every relationship
 * file, and a picture that cannot be converted stays as it was. Returns the input itself, untouched, when there is
 * nothing to convert.
 */
export async function replaceMetafiles(pptx: Uint8Array, options: MetafileOptions = {}): Promise<Uint8Array> {
	const limit = options.maxMetafileBytes ?? DEFAULT_MAX_METAFILE_BYTES;
	let files: Record<string, Uint8Array>;
	try { files = unzipSync(pptx); } catch { return pptx; }

	const metafiles = Object.keys(files).filter(name => MEDIA.test(name) && METAFILE.test(name));
	if (metafiles.length === 0) return pptx;

	// old media file name → new one, for every file that converted.
	const renamed = new Map<string, string>();
	const converted = new Map<string, Uint8Array>();
	for (const name of metafiles) {
		const target = name.replace(METAFILE, '.svg');
		if (files[target]) continue;
		const data = files[name]!;
		if (data.length > limit) continue;
		try {
			const svg = await convertMetafileToSvg(data.slice().buffer);
			if (!svg) continue;
			converted.set(target, strToU8(svg));
			renamed.set(name, target);
		} catch (err) {
			console.error(`Rich View: could not convert ${name}`, err);
		}
	}
	if (renamed.size === 0) return pptx;

	const out: Zippable = {};
	for (const [name, data] of Object.entries(files)) {
		if (renamed.has(name)) continue;
		out[name] = name.endsWith('.rels') ? strToU8(retarget(strFromU8(data), renamed)) : data;
	}
	for (const [name, data] of converted) out[name] = data;
	out[CONTENT_TYPES] = strToU8(declareSvg(strFromU8(files[CONTENT_TYPES] ?? new Uint8Array())));
	return zipSync(out);
}

/** Rewrites each `Target="…name.emf"` whose file was converted; targets are relative, so only the file name decides. */
function retarget(rels: string, renamed: ReadonlyMap<string, string>): string {
	const byFile = new Map<string, string>();
	for (const [from, to] of renamed) byFile.set(from.slice(from.lastIndexOf('/') + 1).toLowerCase(), to.slice(to.lastIndexOf('/') + 1));
	return rels.replace(/(Target\s*=\s*")([^"]*)(")/g, (whole, open: string, target: string, close: string) => {
		const slash = target.lastIndexOf('/');
		const to = byFile.get(target.slice(slash + 1).toLowerCase());
		return to ? `${open}${target.slice(0, slash + 1)}${to}${close}` : whole;
	});
}

function declareSvg(types: string): string {
	if (/Extension\s*=\s*"svg"/i.test(types)) return types;
	return types.replace('</Types>', '<Default Extension="svg" ContentType="image/svg+xml"/></Types>');
}
