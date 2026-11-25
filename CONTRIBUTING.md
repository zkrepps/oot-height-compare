# Contributing

Thanks for helping. Bug reports from runners are the most useful thing right now: a wrong height, a map that looks
broken, or a jump value that doesn't match the game.

## Never share game files

Don't attach or commit anything taken from the game: no `.nup` dumps, no romfs files (`.zs`, `.bphsc`, `.bphsh`, ...)
and no extracted maps (`.ohm.gz`), not even small pieces. Everyone extracts the maps from their own copy, and keeping
this repository free of Nintendo's files is what keeps it online. Issues or pull requests that include them will be
closed and the files removed.

## Reporting a problem

Open an issue and include:

- **Map**, as shown in the map list (e.g. `KokiriForest_Child`)
- **Game version** (1.0.0 or 1.1.1)
- **Where:** the coordinates from sloperinaGZ's position watch, or the point you clicked in the viewer
- **What you expected and what you saw**, e.g. "Link stands at y 115.90 here; the viewer's floor is at 117.2"
- **Browser** (Chrome, Firefox, Edge, Safari) for page or extraction problems, plus any message the page showed

A screenshot of the viewer is welcome. A screenshot of the game is fine too.

## Pull requests

- Keep them small and say what they fix or add, and how you checked it.
- Changes to the decoder (`js/phive.js`, `js/gamefs.js`) should come with a run of
  `node tests/test-node.mjs <your .nup> <python maps folder> <map names>` showing the JS and Python extractors still
  agree. If you change one extractor, change the other (`tools/python/phive.py`) to match.
- No build step: the site is plain HTML and ES modules. Test it through `start.bat` / `start.sh` (pages opened
  straight from disk can't run the extractor).
- By contributing you agree your work is released under this project's license (GPL-3.0).
