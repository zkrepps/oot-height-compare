# Python extractor

The same map extraction as the web page, as a command-line tool. Needs Python 3 with `numpy` and `zstandard`.

    python oot_height_export.py list --nup "C:\path\to\game.nup"
    python oot_height_export.py all --nup "C:\path\to\game.nup" --out maps
    python oot_height_export.py map KokiriForest KokiriForest_Child --nup "C:\path\to\game.nup" --out maps

On Windows you can drag the .nup onto `export_maps.bat` instead. The output `.ohm.gz` files can be dragged onto the
page with **Add map files…**.

`phive.py`, `gamefiles.py`, `nupfs.py` and `byml.py` are from sloperina's `tools/` folder (GPL-3.0); `phive.py`
carries the ground-placement fix described in `../../docs/sloperina-pr.md`.
