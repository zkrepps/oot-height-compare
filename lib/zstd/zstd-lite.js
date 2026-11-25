// Minimal zstd decompression on top of the zstd.js / zstd.wasm build from @bokuweb/zstd-wasm (MIT; zstd is BSD).
import { Module } from './zstd.js';

let ready = null;

/** Load the wasm. `wasm` is an ArrayBuffer/Uint8Array of zstd.wasm, or a URL string. */
export function init(wasm) {
  if (!ready) {
    ready = new Promise((resolve) => { Module.onRuntimeInitialized = resolve; });
    Module.init(wasm);
  }
  return ready;
}

const UNKNOWN = -1;

function copyIn(bytes) {
  const p = Module._malloc(bytes.byteLength);
  Module.HEAPU8.set(bytes, p);
  return p;
}

function run(src, fallbackSize, call) {
  const ps = copyIn(src);
  let size = Module._ZSTD_getFrameContentSize(ps, src.byteLength);
  if (size === UNKNOWN || size < 0) size = fallbackSize;
  const pd = Module._malloc(size);
  try {
    const n = call(pd, size, ps, src.byteLength);
    if (Module._ZSTD_isError(n)) throw new Error('zstd: could not decompress (code ' + n + ')');
    return Module.HEAPU8.slice(pd, pd + n);
  } finally {
    Module._free(pd);
    Module._free(ps);
  }
}

/** Decompress one complete frame (src must be exactly the frame's bytes). */
export function decompress(src, fallbackSize = 64 << 20) {
  return run(src, fallbackSize, (pd, size, ps, n) => Module._ZSTD_decompress(pd, size, ps, n));
}

/** A dictionary kept in wasm memory for repeated use. */
export function makeDict(bytes) {
  return { p: copyIn(bytes), n: bytes.byteLength, dctx: Module._ZSTD_createDCtx() };
}

export function decompressDict(src, dict, fallbackSize = 128 << 20) {
  return run(src, fallbackSize,
    (pd, size, ps, n) => Module._ZSTD_decompress_usingDict(dict.dctx, pd, size, ps, n, dict.p, dict.n));
}

/** Length in bytes of the zstd frame at the start of b (b may continue past it); -1 if it isn't one. */
export function frameLength(b) {
  if (b.length < 6 || b[0] !== 0x28 || b[1] !== 0xb5 || b[2] !== 0x2f || b[3] !== 0xfd) return -1;
  let p = 4;
  const fhd = b[p++];
  const fcsFlag = fhd >> 6, single = (fhd >> 5) & 1, checksum = (fhd >> 2) & 1, dictFlag = fhd & 3;
  if (!single) p += 1;
  p += [0, 1, 2, 4][dictFlag];
  p += fcsFlag === 0 ? (single ? 1 : 0) : [1, 2, 4, 8][fcsFlag];
  for (;;) {
    if (p + 3 > b.length) return -1;
    const h = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16);
    const last = h & 1, type = (h >> 1) & 3, size = h >>> 3;
    p += 3 + (type === 1 ? 1 : size);
    if (p > b.length) return -1;
    if (last) break;
  }
  if (checksum) p += 4;
  return p <= b.length ? p : -1;
}
