/** A small, strict reader for OLE compound files, used only by tests to check what `buildOleEmbed` writes. */
export interface OleEntry {
	name: string;
	type: number;            // 1 storage, 2 stream, 5 root
	clsid: string;
	start: number;
	size: number;
	left: number;
	right: number;
	child: number;
}

const FREE = 0xFFFFFFFF, ENDOFCHAIN = 0xFFFFFFFE, FATSECT = 0xFFFFFFFD, DIFSECT = 0xFFFFFFFC;
const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export class OleReader {
	readonly entries: OleEntry[] = [];
	readonly sectorSize: number;
	readonly miniSectorSize: number;
	readonly miniCutoff: number;
	readonly fat: number[] = [];
	private readonly view: DataView;
	private readonly miniFat: number[] = [];
	private ministream = new Uint8Array(0);

	constructor(private readonly bytes: Uint8Array) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('not an OLE file');
		this.sectorSize = 1 << this.view.getUint16(30, true);
		this.miniSectorSize = 1 << this.view.getUint16(32, true);
		this.miniCutoff = this.view.getUint32(56, true);
		if (bytes.length % this.sectorSize !== 0) throw new Error('file length is not a whole number of sectors');

		const fatCount = this.view.getUint32(44, true);
		const dirStart = this.view.getUint32(48, true);
		const miniFatStart = this.view.getUint32(60, true);
		const miniFatCount = this.view.getUint32(64, true);
		const difatStart = this.view.getUint32(68, true);
		const difat: number[] = [];
		for (let i = 0; i < 109; i++) difat.push(this.view.getUint32(76 + i * 4, true));
		let next = difatStart;
		while (next < DIFSECT) {
			const base = this.offset(next);
			for (let i = 0; i < this.sectorSize / 4 - 1; i++) difat.push(this.view.getUint32(base + i * 4, true));
			next = this.view.getUint32(base + this.sectorSize - 4, true);
		}
		for (const s of difat.filter(v => v < DIFSECT).slice(0, fatCount)) {
			const base = this.offset(s);
			for (let i = 0; i < this.sectorSize / 4; i++) this.fat.push(this.view.getUint32(base + i * 4, true));
		}
		if (this.fat.filter(v => v === FATSECT).length !== fatCount) throw new Error('FAT sector count does not match the FAT');

		const dir = this.readChain(dirStart);
		for (let i = 0; i + 128 <= dir.length; i += 128) {
			const dv = new DataView(dir.buffer, dir.byteOffset + i, 128);
			const nameLen = dv.getUint16(64, true);
			let name = '';
			for (let c = 0; c + 2 <= nameLen - 2; c += 2) name += String.fromCharCode(dv.getUint16(c, true));
			const clsid = Array.from(dir.subarray(i + 80, i + 96)).map(b => b.toString(16).padStart(2, '0')).join('');
			this.entries.push({
				name, type: dir[i + 66]!, clsid,
				left: dv.getUint32(68, true), right: dv.getUint32(72, true), child: dv.getUint32(76, true),
				start: dv.getUint32(116, true), size: Number(dv.getBigUint64(120, true)),
			});
		}
		const root = this.entries[0];
		if (!root || root.type !== 5) throw new Error('no root entry');
		this.ministream = this.readChain(root.start).subarray(0, root.size);
		if (miniFatCount > 0) {
			const mf = this.readChain(miniFatStart);
			const mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
			for (let i = 0; i + 4 <= mf.length; i += 4) this.miniFat.push(mdv.getUint32(i, true));
		}
	}

	private offset(sector: number): number {
		const o = (sector + 1) * this.sectorSize;
		if (o + this.sectorSize > this.bytes.length) throw new Error(`sector ${sector} is outside the file`);
		return o;
	}

	private readChain(start: number): Uint8Array {
		const parts: Uint8Array[] = [];
		const seen = new Set<number>();
		for (let s = start; s < DIFSECT; s = this.fat[s] ?? ENDOFCHAIN) {
			if (seen.has(s)) throw new Error('loop in a FAT chain');
			seen.add(s);
			parts.push(this.bytes.subarray(this.offset(s), this.offset(s) + this.sectorSize));
		}
		return concat(parts);
	}

	private readMini(start: number): Uint8Array {
		const parts: Uint8Array[] = [];
		const seen = new Set<number>();
		for (let s = start; s < DIFSECT; s = this.miniFat[s] ?? ENDOFCHAIN) {
			if (seen.has(s)) throw new Error('loop in a mini FAT chain');
			seen.add(s);
			parts.push(this.ministream.subarray(s * this.miniSectorSize, (s + 1) * this.miniSectorSize));
		}
		return concat(parts);
	}

	stream(name: string): Uint8Array {
		const e = this.entries.find(x => x.name === name && x.type === 2);
		if (!e) throw new Error(`no stream ${JSON.stringify(name)}`);
		const data = e.size < this.miniCutoff ? this.readMini(e.start) : this.readChain(e.start);
		if (data.length < e.size) throw new Error(`stream ${JSON.stringify(name)} is shorter than its declared size`);
		return data.subarray(0, e.size);
	}

	/** Every sector the FAT marks as used must be reachable from some chain, and no sector may belong to two. */
	usedSectorsAreAccountedFor(): boolean {
		const owner = new Map<number, string>();
		const claim = (label: string, start: number) => {
			for (let s = start; s < DIFSECT; s = this.fat[s] ?? ENDOFCHAIN) {
				if (owner.has(s)) return false;
				owner.set(s, label);
			}
			return true;
		};
		const dirStart = this.view.getUint32(48, true);
		if (!claim('dir', dirStart)) return false;
		const miniFatStart = this.view.getUint32(60, true);
		if (this.view.getUint32(64, true) > 0 && !claim('minifat', miniFatStart)) return false;
		for (const e of this.entries) {
			if (e.type === 2 && e.size >= this.miniCutoff && !claim(e.name, e.start)) return false;
		}
		if (!claim('ministream', this.entries[0]!.start)) return false;
		for (let s = 0; s < this.fat.length; s++) {
			const v = this.fat[s]!;
			if (v === FATSECT) { if (owner.has(s)) return false; owner.set(s, 'fat'); }
		}
		for (let s = 0; s < this.fat.length; s++) {
			if (this.fat[s] !== FREE && !owner.has(s)) return false;
		}
		return true;
	}
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) { out.set(p, at); at += p.length; }
	return out;
}
