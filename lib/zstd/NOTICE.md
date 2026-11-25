`zstd.js` and `zstd.wasm` are from `@bokuweb/zstd-wasm` 0.0.27 (MIT, https://github.com/bokuweb/zstd-wasm), a
WebAssembly build of Zstandard (BSD, https://github.com/facebook/zstd). `zstd-lite.js` is this project's small
wrapper around them (adds dictionary reuse and finding a frame's length).
