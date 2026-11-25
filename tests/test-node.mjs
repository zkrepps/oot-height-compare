// node test-node.mjs <game.nup> <python maps dir> [map names...]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { GameFiles } from '../js/gamefs.js';
import { listMaps, extractMap } from '../js/phive.js';
const [nupPath, pyDir, ...want] = process.argv.slice(2);
const t0 = Date.now();
// node's fs.openAsBlob wraps sizes above 4 GiB, so read through a small Blob-like adapter instead
function fileBlob(path) {
  const fd = fs.openSync(path, 'r'), size = fs.fstatSync(fd).size;
  return { size, slice(start, end) { return { arrayBuffer: async () => { const b = Buffer.alloc(end - start); fs.readSync(fd, b, 0, end - start, start); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } }; } };
}
const files = await GameFiles.open(fileBlob(nupPath), fs.readFileSync(new URL('../lib/zstd/zstd.wasm', import.meta.url)));
const maps = listMaps(files.nup.index);
console.log('opened in', Date.now() - t0, 'ms;', files.nup.index.size, 'files;', maps.length, 'maps; dicts', Object.keys(files.dicts));
const head = (buf) => { const hl = buf.readUInt32LE(4); return JSON.parse(buf.subarray(8, 8 + hl).toString()); };
for (const name of want) {
  const e = maps.find((m) => m.map === name);
  const t = Date.now();
  const r = await extractMap(files, e);
  const js = head(Buffer.from(r.bytes));
  let py = null;
  try { py = head(zlib.gunzipSync(fs.readFileSync(`${pyDir}/${name}.ohm.gz`))); } catch (err) {}
  const g = (h) => h.groups.map((x) => x.count).join('/');
  const bb = (h) => h.bbox.flat().map((x) => x.toFixed(3)).join(',');
  console.log(name, e.tiles.length, 'tiles', ((Date.now() - t) / 1000).toFixed(1) + 's', 'JS v', js.vertexCount, 't', js.triangleCount, g(js),
    py ? `| PY v ${py.vertexCount} t ${py.triangleCount} ${g(py)} | bbox ${bb(js) === bb(py) ? 'same' : bb(js) + ' vs ' + bb(py)}` : '| no python file');
}
