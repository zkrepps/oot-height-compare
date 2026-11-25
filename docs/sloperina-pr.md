# Pull request for sloperina: place every nested ground mesh

**Title:** phive.py: decode multi-record ground placement blocks (Hyrule Field, GerudoThiefStage)

`decode_bphsc` only recognises the ground-mesh placement block when it is exactly 0x30 bytes, and keeps only the
last nested ground mesh. Two kinds of tile break that:

- **Hyrule Field (child and adult), all 256 tiles:** each tile carries two nested ground meshes (placement kinds 8
  and 7, near-identical: e.g. X8_Z8 has 378,423 and 335,713 triangles over the same area) and one 0x60 block holding
  two placement records. The block isn't recognised, so every tile's terrain stays in tile-local space and all 256
  tiles stack in one 250 m square at the origin.
- **GerudoThiefStage:** one tile with 64 nested ground meshes (an 8×8 grid, ±1000 m) and a 0xB00-byte block of 64
  records. Only the last mesh was kept, unplaced.

A record is 11 words (0x2C): scale xyz, three zero words, translation xyz, u32 kind (6, 7 or 8 seen), u32 0; the
block is padded to 0x10. Records pair with the nested meshes in file order.

**Change** (`sloperina-phive-ground-placement.patch`):

- `ground_placements()` reads any block of one or more such records (and rejects other blocks, e.g. the water-volume
  block, which starts 0, 7.0, 1.0).
- `decode_bphsc` keeps every nested ground mesh in `out["grounds"]`, placed by its record; `out["ground"]` stays the
  last one for existing callers.
- `_tile_triangles` emits every ground mesh, except that where several share one placement (Hyrule Field's pair) it
  keeps the last, which is what the old code emitted for single-ground tiles.

**Checked** against the whole 1.1.1 romfs: 1,772 tiles; only HyruleField_Child/Adult (256 tiles each) and
GerudoThiefStage have more than one ground mesh, and no tile has a ground mesh without a placement record any more.
Kokiri Forest child is unchanged (1,559,553 triangles). Hyrule Field child now spans ±2000 m with terrain under the
whole field.
