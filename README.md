# OoT Height Compare

Compare heights across maps in **The Legend of Zelda: Ocarina of Time (Nintendo Switch 2, 2026)**, for speedrun
routing. Click a point on one map to set a reference height, then switch maps: the reference and the planes above it
(jump apex, ledge grab, step-up, or your own) stay put, and every map is coloured by whether it's below the reference,
within a jump of it, or above.

**Use it:** https://zkrepps.github.io/oot-height-compare/

## Getting the maps

Click **Open your .nup…** and pick your own dump of the game. The page reads the collision for every map out of it
in your browser (about a minute for all 80 maps) and keeps the results in your browser. The .nup is never uploaded,
and this repository contains no game files: everyone gets the maps from their own copy.

Tested with game version 1.1.1 (update v131072). Maps come out in the game's own coordinates: metres, +Y up, the
same numbers sloperinaGZ's position watch shows, so a sloperina reading lands on the floor in the viewer to within a
few centimetres.

### Running it from your own computer

Opening `index.html` straight from disk won't work for extraction: browsers don't run its background worker or load
its wasm from `file://` pages. Double-click `start.bat` (Windows) or run `./start.sh` instead; it serves the folder at
http://localhost:8642 with Python's built-in web server and opens it.

## Using the viewer

- **Set a reference:** click the map (or type a Y, or use a sloperina reading). Save heights you use often.
- **Planes:** jump apex (0.7 m) and ledge grab (2.19 m) start from the game's `JumpHeight` and
  `StartJumpCliffHoldHeight` parameters. Measure them yourself with sloperina's position watch and adjust.
- **Fly mode** (`F`): WASD, Space/E up, Q/C down, Shift for 4×, scroll or the slider for speed, click to measure at
  the crosshair.
- **Cut away everything above:** lifts the roof off dungeons and interiors; `[` and `]` move it by 0.5 m.

## What's in the maps

Only collision that stops the player: static geometry and terrain. Doors, blocks, lifts, chests and other moving
objects aren't in these files. Air walls and water/lava surfaces are kept as separate layers you can show or hide.
Two of the game's file names have typos (`HountedWasteland`, `NaboruStage`); the viewer shows the proper spelling.

## Layout

| Path | What |
|---|---|
| `index.html` | the viewer (three.js and three-mesh-bvh from jsDelivr) |
| `start.bat`, `start.sh` | run the page locally |
| `js/gamefs.js` | reads the .nup package and the game's zstd dictionaries |
| `js/phive.js` | Phive / Havok collision decoder and the `.ohm` map format |
| `js/extract-worker.js` | runs the extraction in a background thread |
| `lib/zstd/` | zstd decompression (wasm) |
| `tools/python/` | the same extraction as a Python command-line tool, for scripting |
| `tests/test-node.mjs` | checks the JS extractor against the Python one: `node tests/test-node.mjs game.nup maps/ KokiriForest_Child` |

The JS extractor produces the same vertices and triangles as the Python tool for every map checked (Kokiri Forest,
Hyrule Field, Kakariko, the dungeons and boss rooms), and runs in a second or two per map.

## Credits

- **sloperinaGZ** by PracticeROM and contributors (github.com/PracticeROM/sloperina): the .nup reader, the zstd
  dictionary handling and the collision decoder (`tools/phive.py`, `docs/COLLISION.md`) that this is ported from.
  This project fixes one case in it: tiles with several ground meshes (Hyrule Field, GerudoThiefStage); see
  `docs/sloperina-pr.md`.
- **gz** by glankk, which sloperina is modelled on.
- **objmap-oot** (zeldamods.org) for a second view of the same collision to check against.
- The **EPD wiki** pages on Bphsh and Common Phive.
- three.js (MIT), three-mesh-bvh (MIT), zstd-wasm by bokuweb (MIT) around Facebook's zstd (BSD).

## Contributing

Bug reports are welcome; see `CONTRIBUTING.md`. Please never attach game files or extracted maps.

## License

GPL-3.0 (see `LICENSE`), because the decoder is a port of sloperina's GPL-3.0 tools. Not affiliated with Nintendo.
The Legend of Zelda is a trademark of Nintendo.
