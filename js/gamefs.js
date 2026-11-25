// Reading the game's files from your own .nup dump, in the browser (or node, via fs.openAsBlob).
// Port of sloperina's tools/nupfs.py and tools/gamefiles.py (github.com/PracticeROM/sloperina, GPL-3.0).
import * as Z from '../lib/zstd/zstd-lite.js';

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const isZstd = (b) => b.length >= 4 && ZSTD_MAGIC.every((x, i) => b[i] === x);
const utf8 = new TextDecoder();

const TOC_AT = 0x80, TOC_HEADER_SIZE = 0x30, TITLE_ENTRY_SIZE = 0x40, DIR_ENTRY_SIZE = 24, FILE_ENTRY_SIZE = 80;
const PROBE_SIZE = 1 << 16;

/** A .nup package: the newest title's romfs, by path ("romfs/Pack/ZsDic.pack.zs" -> {size, offset}). */
export class Nup {
  constructor(blob) { this.blob = blob; this.index = new Map(); }

  static async open(blob) {
    const nup = new Nup(blob);
    await nup._load();
    return nup;
  }

  async bytes(offset, length) {
    const end = Math.min(this.blob.size, offset + length);
    return new Uint8Array(await this.blob.slice(offset, end).arrayBuffer());
  }

  async _load() {
    const h = await this.bytes(0, TOC_AT + TOC_HEADER_SIZE);
    const magic = (o) => utf8.decode(h.subarray(o, o + 4));
    if (magic(0) !== 'NUP\x01' || magic(TOC_AT) !== 'TOC\x01') throw new Error('This file is not a .nup package.');
    const dv = new DataView(h.buffer);
    const nTitles = dv.getUint32(TOC_AT + 4, true);
    const nDirs = Number(dv.getBigUint64(TOC_AT + 8, true));
    const nFiles = Number(dv.getBigUint64(TOC_AT + 16, true));
    const stringsOffset = Number(dv.getBigUint64(TOC_AT + 24, true));
    const stringsSize = Number(dv.getBigUint64(TOC_AT + 32, true));
    const titlesAt = TOC_AT + TOC_HEADER_SIZE;
    const dirsAt = titlesAt + TITLE_ENTRY_SIZE * nTitles;
    const filesAt = dirsAt + DIR_ENTRY_SIZE * nDirs;
    const kidsAt = filesAt + FILE_ENTRY_SIZE * nFiles;
    const stringsAt = TOC_AT + stringsOffset;
    const meta = await this.bytes(0, stringsAt + stringsSize);
    const m = new DataView(meta.buffer);
    const name = (off, len) => utf8.decode(meta.subarray(stringsAt + off, stringsAt + off + len));
    // title: (?, ?, exefs root dir, romfs root dir, version); the newest version wins
    let title = null;
    for (let i = 0; i < nTitles; i++) {
      const p = titlesAt + TITLE_ENTRY_SIZE * i;
      const t = { romfs: m.getUint32(p + 16, true), version: m.getUint32(p + 20, true) };
      if (!title || t.version > title.version) title = t;
    }
    const dir = (i) => { const p = dirsAt + DIR_ENTRY_SIZE * i; return [m.getUint32(p, true), m.getUint32(p + 4, true), m.getUint32(p + 8, true), m.getUint32(p + 12, true)]; };
    const stack = [[title.romfs, 'romfs/']];
    while (stack.length) {
      const [d, prefix] = stack.pop();
      const [, , first, count] = dir(d);
      for (let k = first; k < first + count; k++) {
        const kid = m.getUint32(kidsAt + 4 * k, true);
        if (kid < nDirs) {
          const [no, nl] = dir(kid);
          stack.push([kid, prefix + name(no, nl) + '/']);
        } else {
          const p = filesAt + FILE_ENTRY_SIZE * (kid - nDirs);
          this.index.set(prefix + name(m.getUint32(p, true), m.getUint32(p + 4, true)),
            { size: Number(m.getBigUint64(p + 8, true)), offset: Number(m.getBigUint64(p + 16, true)) });
        }
      }
    }
  }

  /** A file's contents, with package-level zstd removed. */
  async read(path) {
    const r = this.index.get(path);
    if (!r) throw new Error('Not in the dump: ' + path);
    const probe = await this.bytes(r.offset, Math.min(r.size, PROBE_SIZE) + 18);
    if (isZstd(probe)) {
      const packed = await this.bytes(r.offset, r.size + (1 << 16));
      const n = Z.frameLength(packed);
      if (n > 0) {
        try {
          const out = Z.decompress(packed.subarray(0, n), r.size);
          if (out.length === r.size) return out;
        } catch (e) { /* stored as is after all */ }
      }
    }
    return this.bytes(r.offset, r.size);
  }
}

/** {name: Uint8Array} of a SARC archive. */
export function sarc(data) {
  if (utf8.decode(data.subarray(0, 4)) !== 'SARC') throw new Error('not SARC');
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const le = data[6] === 0xff && data[7] === 0xfe;
  const dataAt = dv.getUint32(0x0c, le), sfat = dv.getUint16(0x04, le), count = dv.getUint16(sfat + 6, le);
  const entriesAt = sfat + 0x0c, namesAt = entriesAt + count * 0x10 + 8;
  const files = {};
  for (let i = 0; i < count; i++) {
    const e = entriesAt + i * 0x10;
    const attributes = dv.getUint32(e + 4, le), start = dv.getUint32(e + 8, le), end = dv.getUint32(e + 12, le);
    let name = '';
    if (attributes & 0x01000000) {
      const at = namesAt + (attributes & 0xffff) * 4;
      name = utf8.decode(data.subarray(at, data.indexOf(0, at)));
    }
    files[name] = data.subarray(dataAt + start, dataAt + end);
  }
  return files;
}

/** The game's romfs: files decompressed with its zstd dictionaries (romfs/Pack/ZsDic.pack.zs). */
export class GameFiles {
  static async open(blob, wasm) {
    await Z.init(wasm);
    const g = new GameFiles();
    g.nup = await Nup.open(blob);
    let raw = await g.nup.read('romfs/Pack/ZsDic.pack.zs');
    if (isZstd(raw)) raw = Z.decompress(raw.subarray(0, Z.frameLength(raw)), 64 << 20);
    g.dicts = {};
    for (const [name, bytes] of Object.entries(sarc(raw))) g.dicts[name] = Z.makeDict(bytes);
    return g;
  }

  async read(path) {
    const data = await this.nup.read(path);
    if (!path.endsWith('.zs')) return data;
    const name = path.slice(path.lastIndexOf('/') + 1);
    const dict = name.endsWith('.bcett.byml.zs') ? this.dicts['bcett.byml.zsdic']
      : name.endsWith('.pack.zs') ? this.dicts['pack.zsdic'] : this.dicts['zs.zsdic'];
    return dict ? Z.decompressDict(data, dict) : Z.decompress(data.subarray(0, Z.frameLength(data)));
  }
}
