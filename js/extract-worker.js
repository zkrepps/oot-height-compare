// Reads map collision out of your .nup in a background thread, so the page stays responsive.
import { GameFiles } from './gamefs.js';
import { listMaps, extractMap } from './phive.js';

let files = null, maps = [];

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'open') {
      const wasm = await (await fetch(new URL('../lib/zstd/zstd.wasm', import.meta.url))).arrayBuffer();
      files = await GameFiles.open(msg.file, wasm);
      maps = listMaps(files.nup.index);
      if (!maps.length) throw new Error('No map collision found in this .nup. Is it Ocarina of Time for Switch 2?');
      self.postMessage({ type: 'maps', maps: maps.map((m) => ({ area: m.area, map: m.map, tiles: m.tiles.length })) });
    } else if (msg.type === 'extract') {
      for (let k = 0; k < msg.names.length; k++) {
        const entry = maps.find((m) => m.map === msg.names[k]);
        if (!entry) continue;
        const result = await extractMap(files, entry, (i, n) =>
          self.postMessage({ type: 'progress', map: entry.map, k, of: msg.names.length, tile: i, tiles: n }));
        const buf = await gzip(result.bytes);
        self.postMessage({ type: 'map', name: entry.map, buf, triangles: result.triangles, k, of: msg.names.length }, [buf]);
      }
      self.postMessage({ type: 'done' });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
