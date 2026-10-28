/** Class id of a Visio drawing (Visio.Drawing.15). Office finds the program to open an embedded object by it. */
export const VISIO_CLSID = '00021a15-0000-0000-c000-000000000046';

const SECTOR = 512;
const MINI_SECTOR = 64;
const MINI_CUTOFF = 4096;
const ENTRIES_PER_DIR_SECTOR = SECTOR / 128;
const FAT_PER_SECTOR = SECTOR / 4;
const FREE = 0xFFFFFFFF, END = 0xFFFFFFFE, FATSECT = 0xFFFFFFFD;
const NOSTREAM = 0xFFFFFFFF;

const ascii = (s: string) => Uint8Array.from(Array.from(s, c => c.charCodeAt(0)));

/** The stream `\x01CompObj`: class, display name, clipboard format and ProgID of the object (MS-OLEDS 2.3.7). */
export function visioCompObj(): Uint8Array {
	const lenString = (s: string) => {
		const body = ascii(s + '\0');
		const out = new Uint8Array(4 + body.length);
		new DataView(out.buffer).setUint32(0, body.length, true);
		out.set(body, 4);
		return out;
	};
	const header = Uint8Array.from([0x01, 0x00, 0xfe, 0xff, 0x03, 0x0a, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff]);
	const parts = [
		header,
		clsidBytes(VISIO_CLSID),
		lenString('Microsoft Visio Drawing'),
		lenString('Visio 15.0 Shapes'),
		lenString('Visio.Drawing.15'),
		Uint8Array.from([0xf4, 0x39, 0xb2, 0x71, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
	];
	return concat(parts);
}

function clsidBytes(clsid: string): Uint8Array {
	const hex = clsid.replace(/-/g, '');
	const b = Uint8Array.from(hex.match(/../g)!.map(h => parseInt(h, 16)));
	// Data1..Data3 are stored little-endian, the last 8 bytes as they are written.
	return Uint8Array.from([b[3]!, b[2]!, b[1]!, b[0]!, b[5]!, b[4]!, b[7]!, b[6]!, ...b.subarray(8)]);
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) { out.set(p, at); at += p.length; }
	return out;
}

const sectorsFor = (bytes: number, size: number) => Math.ceil(bytes / size);

/**
 * An OLE compound file holding `vsdx` as the stream `Package`, which is what Office reads from the clipboard
 * format "Embed Source" to embed a Visio drawing. Layout: version 3, 512-byte sectors, 64-byte mini sectors, a
 * 4096-byte cut-off, as Visio writes it. Sector order: FAT, directory, mini FAT, mini stream, package.
 */
export function buildOleEmbed(vsdx: Uint8Array): Uint8Array {
	const compObj = visioCompObj();
	const packageIsMini = vsdx.length < MINI_CUTOFF;

	// Streams below the cut-off live in the mini stream; the package joins them only when it is small.
	const mini: { data: Uint8Array; start: number }[] = [{ data: compObj, start: 0 }];
	let miniCount = sectorsFor(compObj.length, MINI_SECTOR);
	let packageMiniStart = 0;
	if (packageIsMini && vsdx.length > 0) {
		packageMiniStart = miniCount;
		mini.push({ data: vsdx, start: miniCount });
		miniCount += sectorsFor(vsdx.length, MINI_SECTOR);
	}
	const miniStream = new Uint8Array(miniCount * MINI_SECTOR);
	for (const m of mini) miniStream.set(m.data, m.start * MINI_SECTOR);

	const dirSectors = sectorsFor(3, ENTRIES_PER_DIR_SECTOR);
	const miniFatSectors = sectorsFor(miniCount, FAT_PER_SECTOR);
	const miniStreamSectors = sectorsFor(miniStream.length, SECTOR);
	const packageSectors = packageIsMini ? 0 : sectorsFor(vsdx.length, SECTOR);

	// The FAT describes every sector including its own, so find the smallest count that covers all of them.
	const otherSectors = dirSectors + miniFatSectors + miniStreamSectors + packageSectors;
	let fatSectors = 1;
	while (fatSectors * FAT_PER_SECTOR < fatSectors + otherSectors) fatSectors++;
	if (fatSectors > 109) throw new Error('package is too large to embed');

	let next = 0;
	const take = (n: number) => { const start = next; next += n; return start; };
	const fatStart = take(fatSectors);
	const dirStart = take(dirSectors);
	const miniFatStart = miniFatSectors > 0 ? take(miniFatSectors) : END;
	const miniStreamStart = miniStreamSectors > 0 ? take(miniStreamSectors) : END;
	const packageStart = packageSectors > 0 ? take(packageSectors) : END;
	const total = next;

	const fat = new Array<number>(fatSectors * FAT_PER_SECTOR).fill(FREE);
	for (let i = 0; i < fatSectors; i++) fat[fatStart + i] = FATSECT;
	const chain = (start: number, count: number) => {
		for (let i = 0; i < count; i++) fat[start + i] = i === count - 1 ? END : start + i + 1;
	};
	chain(dirStart, dirSectors);
	if (miniFatSectors > 0) chain(miniFatStart, miniFatSectors);
	if (miniStreamSectors > 0) chain(miniStreamStart, miniStreamSectors);
	if (packageSectors > 0) chain(packageStart, packageSectors);

	const out = new Uint8Array(SECTOR * (1 + total));
	const dv = new DataView(out.buffer);
	const sectorAt = (s: number) => SECTOR * (1 + s);

	// Header
	out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
	dv.setUint16(24, 0x003e, true);          // minor version
	dv.setUint16(26, 3, true);               // major version
	dv.setUint16(28, 0xfffe, true);          // little-endian
	dv.setUint16(30, 9, true);               // sector shift: 512
	dv.setUint16(32, 6, true);               // mini sector shift: 64
	dv.setUint32(40, 0, true);               // directory sectors (0 for version 3)
	dv.setUint32(44, fatSectors, true);
	dv.setUint32(48, dirStart, true);
	dv.setUint32(52, 0, true);
	dv.setUint32(56, MINI_CUTOFF, true);
	dv.setUint32(60, miniFatStart, true);
	dv.setUint32(64, miniFatSectors, true);
	dv.setUint32(68, END, true);             // no DIFAT sectors
	dv.setUint32(72, 0, true);
	for (let i = 0; i < 109; i++) dv.setUint32(76 + i * 4, i < fatSectors ? fatStart + i : FREE, true);

	// FAT
	for (let i = 0; i < fat.length; i++) dv.setUint32(sectorAt(fatStart) + i * 4, fat[i]!, true);

	// Directory: Root Entry, Package, CompObj
	const entry = (index: number, name: string, type: number, clsid: Uint8Array | null, start: number, size: number, ids: { left: number; right: number; child: number }) => {
		const base = sectorAt(dirStart) + index * 128;
		for (let i = 0; i < name.length; i++) dv.setUint16(base + i * 2, name.charCodeAt(i), true);
		dv.setUint16(base + 64, (name.length + 1) * 2, true);
		out[base + 66] = type;
		out[base + 67] = 1;                  // black
		dv.setUint32(base + 68, ids.left, true);
		dv.setUint32(base + 72, ids.right, true);
		dv.setUint32(base + 76, ids.child, true);
		if (clsid) out.set(clsid, base + 80);
		dv.setUint32(base + 116, start, true);
		dv.setBigUint64(base + 120, BigInt(size), true);
	};
	// Unused directory slots in the last directory sector are marked free.
	for (let i = 3; i < dirSectors * ENTRIES_PER_DIR_SECTOR; i++) {
		const base = sectorAt(dirStart) + i * 128;
		dv.setUint32(base + 68, NOSTREAM, true); dv.setUint32(base + 72, NOSTREAM, true); dv.setUint32(base + 76, NOSTREAM, true);
	}
	entry(0, 'Root Entry', 5, clsidBytes(VISIO_CLSID), miniStreamStart, miniStream.length, { left: NOSTREAM, right: NOSTREAM, child: 1 });
	// Names sort by length, then alphabetically: "Package" (7) before "\x01CompObj" (8), so CompObj is the right child.
	entry(1, 'Package', 2, null, packageIsMini ? (vsdx.length > 0 ? packageMiniStart : END) : packageStart, vsdx.length, { left: NOSTREAM, right: 2, child: NOSTREAM });
	entry(2, '\x01CompObj', 2, null, 0, compObj.length, { left: NOSTREAM, right: NOSTREAM, child: NOSTREAM });

	// Mini FAT
	if (miniFatSectors > 0) {
		const miniFat = new Array<number>(miniFatSectors * FAT_PER_SECTOR).fill(FREE);
		const miniChain = (start: number, count: number) => {
			for (let i = 0; i < count; i++) miniFat[start + i] = i === count - 1 ? END : start + i + 1;
		};
		miniChain(0, sectorsFor(compObj.length, MINI_SECTOR));
		if (packageIsMini && vsdx.length > 0) miniChain(packageMiniStart, sectorsFor(vsdx.length, MINI_SECTOR));
		for (let i = 0; i < miniFat.length; i++) dv.setUint32(sectorAt(miniFatStart) + i * 4, miniFat[i]!, true);
	}

	// Mini stream and package data
	if (miniStreamSectors > 0) out.set(miniStream, sectorAt(miniStreamStart));
	if (packageSectors > 0) out.set(vsdx, sectorAt(packageStart));
	return out;
}
