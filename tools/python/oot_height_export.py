"""Export Ocarina of Time (Switch 2) map collision for the OoT Height Compare viewer.

Uses sloperinaGZ's collision decoder (tools/phive.py from github.com/PracticeROM/sloperina) to read
Phive/StaticCompoundBody from your own .nup dump, and writes one compact file per map (<Map>.ohm.gz):
deduplicated vertices in game coordinates (metres, +Y up, the same space sloperina's position watch shows),
triangles grouped as solid / air wall / water-lava.

Easiest on Windows: drag your .nup onto export_maps.bat (it finds Python and runs `all`).

By hand:
    pip install zstandard numpy
    keep this file next to phive.py, gamefiles.py, nupfs.py, byml.py (from sloperina's tools/ folder)
    add --nup "C:\\path\\to\\your\\game.nup" to any command below (or set OOTMENU_NUP)

Use:
    python oot_height_export.py list                                   every map in the dump
    python oot_height_export.py map KokiriForest KokiriForest_Child    one map  -> out/KokiriForest_Child.ohm.gz
    python oot_height_export.py all                                    every map (Hyrule Field alone takes ~2 min)
  options:
    --out DIR      output folder (default: out)
    --grid M       merge vertices onto an M-metre grid to shrink big maps (e.g. 0.05; heights move <= M/2)
    --only TEXT    with 'all': only maps whose name contains TEXT (e.g. --only _Child)
    --nup FILE     your game dump (.nup)
    --tools DIR    where sloperina's tools/ folder is, if this file isn't in it
    --all-layers   keep the detailed Rough twin layer too (sloperina drops it by default; see its COLLISION.md)
"""
import gzip
import json
import os
import re
import sys
import time

import numpy as np

AIRWALL = {"AirWall"}
LIQUID = {"Water", "HotWater", "IceWater", "Lava", "Bog", "PoisonBog", "ContaminatedWater"}
CATEGORIES = ("solid", "airwall", "liquid")
TILE_RE = re.compile(r"^(?P<map>.+?)(?:_X\d+_Z\d+)?\.[^/]*bphsc\.zs$")


def opt(args, name, default=None):
    if name in args:
        i = args.index(name)
        value = args[i + 1]
        del args[i:i + 2]
        return value
    return default


def import_phive(tools_dir):
    here = os.path.dirname(os.path.abspath(__file__))
    for d in [tools_dir, here, os.environ.get("SLOPERINA_TOOLS")]:
        if d and os.path.exists(os.path.join(d, "phive.py")):
            sys.path.insert(0, d)
            import phive
            return phive
    raise SystemExit("Can't find sloperina's phive.py: put this file in sloperina/tools or pass --tools DIR")


def list_maps():
    """{(area, map): tile count} from the dump's index."""
    import gamefiles
    prefix = "romfs/Phive/StaticCompoundBody/"
    maps = {}
    for path in gamefiles.nup().index:
        if not path.startswith(prefix):
            continue
        rest = path[len(prefix):]
        if "/" not in rest:
            continue
        area, name = rest.split("/", 1)
        m = TILE_RE.match(name)
        if m:
            key = (area, m.group("map"))
            maps[key] = maps.get(key, 0) + 1
    return maps


def category(material):
    if material in AIRWALL:
        return 1
    if material in LIQUID:
        return 2
    return 0


def pack(area, mapname, tris, grid=None):
    """tris: [(v0, v1, v2, attrs)] -> bytes of an .ohm file."""
    n = len(tris)
    verts = np.empty((n * 3, 3), dtype=np.float64)
    cats = np.empty(n, dtype=np.uint8)
    for i, (a, b, c, attrs) in enumerate(tris):
        verts[3 * i], verts[3 * i + 1], verts[3 * i + 2] = a, b, c
        cats[i] = category(attrs.get("material", ""))
    step = grid if grid else 0.001  # mm rounding merges exact duplicates without moving anything visibly
    keys = np.round(verts / step).astype(np.int64)
    uniq, inverse = np.unique(keys, axis=0, return_inverse=True)
    positions = (uniq * step).astype(np.float32)
    faces = inverse.reshape(-1, 3).astype(np.uint32)
    keep = (faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])
    faces, cats = faces[keep], cats[keep]
    order = np.argsort(cats, kind="stable")
    faces, cats = faces[order], cats[order]
    groups, start = [], 0
    for k, name in enumerate(CATEGORIES):
        count = int((cats == k).sum())
        groups.append({"cat": name, "start": start, "count": count})
        start += count
    lo, hi = positions.min(axis=0), positions.max(axis=0)
    header = {"format": "ohm1", "area": area, "map": mapname, "vertexCount": int(len(positions)),
              "triangleCount": int(len(faces)), "groups": groups,
              "bbox": [[float(x) for x in lo], [float(x) for x in hi]], "units": "metres, +Y up (game coordinates)",
              "grid": grid, "source": "sloperina tools/phive.py", "exported": time.strftime("%Y-%m-%d")}
    hj = json.dumps(header).encode()
    hj += b" " * (-len(hj) % 4)
    return b"OHM1" + len(hj).to_bytes(4, "little") + hj + positions.tobytes() + faces.tobytes()


def export(phive, area, mapname, out_dir, grid, everything):
    paths = phive.map_tiles(area, mapname)
    if not paths:
        print("  no tiles for %s/%s" % (area, mapname))
        return
    t = time.time()
    _, tris = phive.map_triangles(paths, everything, log=lambda s: None)
    if not tris:
        print("  %s: no triangles" % mapname)
        return
    data = gzip.compress(pack(area, mapname, tris, grid), 6)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, mapname + ".ohm.gz")
    with open(out, "wb") as f:
        f.write(data)
    print("  %s: %d triangles, %.1f MB, %.0f s -> %s" % (mapname, len(tris), len(data) / 1e6, time.time() - t, out))


def main():
    args = sys.argv[1:]
    out_dir = opt(args, "--out", "out")
    grid = opt(args, "--grid")
    grid = float(grid) if grid else None
    only = opt(args, "--only")
    tools = opt(args, "--tools")
    nup = opt(args, "--nup")
    if nup:
        os.environ["OOTMENU_NUP"] = nup.strip('"')
    if args and args[0] in ("list", "map", "all"):
        path = os.environ.get("OOTMENU_NUP")
        if not path or not os.path.isfile(path):
            raise SystemExit("Can't find your .nup dump. Pass --nup \"C:\\path\\to\\game.nup\" (got: %r)" % path)
    everything = "--all-layers" in args
    args = [a for a in args if a != "--all-layers"]
    if not args:
        raise SystemExit(__doc__)
    phive = import_phive(tools)
    if args[0] == "list":
        for (area, name), tiles in sorted(list_maps().items()):
            print("%-28s %-40s %d tile(s)" % (area, name, tiles))
    elif args[0] == "map" and len(args) == 3:
        export(phive, args[1], args[2], out_dir, grid, everything)
    elif args[0] == "all":
        maps = sorted(list_maps())
        if only:
            maps = [m for m in maps if only in m[1]]
        for i, (area, name) in enumerate(maps, 1):
            print("[%d/%d] %s/%s" % (i, len(maps), area, name))
            try:
                export(phive, area, name, out_dir, grid, everything)
            except Exception as e:  # keep going; one odd map shouldn't stop the batch
                print("  failed: %s" % e)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
