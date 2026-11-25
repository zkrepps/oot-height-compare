// Phive / Havok (hknp) static collision -> world-space triangles, and the compact .ohm map file.
// Port of sloperina's tools/phive.py (github.com/PracticeROM/sloperina, GPL-3.0), with the Hyrule Field fix
// (tiles carrying two ground meshes and a 0x60 placement block). Format notes: sloperina docs/COLLISION.md.

export const MATERIALS = [
  'Undefined', 'Soil', 'Grass', 'Sand', 'HeavySand', 'Snow', 'HeavySnow', 'Stone', 'StoneSlip', 'StoneNoSlip',
  'Metal', 'MetalSlip', 'MetalNoSlip', 'WireNet', 'Wood', 'Ice', 'Cloth', 'Glass', 'Bone', 'Rope', 'Character',
  'Ragdoll', 'Meat', 'Vegetable', 'Bomb', 'MagicBall', 'Barrier', 'AirWall', 'Water', 'HotWater', 'IceWater',
  'Lava', 'Bog', 'ContaminatedWater', 'Gas', 'InvalidateRestartPos', 'HorseSpeedLimit',
  'ForbidDynamicCuttingAreaForHugeCharacter', 'ForbidHorseReturnToSafePosByClimate', 'WaterSlip',
  'HorseDeleteImmediatelyOnDeath', 'DropItem', 'Skulltula', 'PoisonBog', 'WoodSlip', 'IceNoSlip'];
const LAYERS_ENTITY = [
  'Object', 'SmallObject', 'GroundObject', 'Player', 'Character', 'Water', 'GroundHighRes',
  'GroundHighResSmooth', 'GroundHighResRough', 'GroundStaticTree', 'HitOnlyGround', 'CharacterSight',
  'CameraSight', 'CameraBody', 'NoHit', 'CustomReceiver', 'Fluid', 'Smoke', 'Gas', 'LowTree', 'IK',
  'CameraAlphaCtrlCheck'];
const LAYERS_SENSOR = [
  'Object', 'SmallObject', 'Player', 'Enemy', 'NPC', 'Animal', 'TgtHitAll', 'PlayerAttack', 'EnemyAttack',
  'NPCAttack', 'AttackAll', 'ChemicalObject', 'ChemicalElement', 'InDoor', 'StaticGeneralArea', 'QueryOnly',
  'Tree', 'Camera', 'NoHit', 'CustomReceiver', 'PerceptionSensor', 'PerceptionEmitter', 'Fluid',
  'ForbidAutoPlacementArea', 'SpecialChemical', 'GeneralArea', 'EnemyPerceptionSightNoThrough'];
const PLAYER_LAYER_BIT = 1 << 3;
const AIRWALL = new Set(['AirWall']);
const LIQUID = new Set(['Water', 'HotWater', 'IceWater', 'Lava', 'Bog', 'PoisonBog', 'ContaminatedWater']);
export const CATEGORIES = ['solid', 'airwall', 'liquid'];
const category = (material) => (AIRWALL.has(material) ? 1 : LIQUID.has(material) ? 2 : 0);
const nameOf = (table, i) => (i >= 0 && i < table.length ? table[i] : String(i));

const latin1 = new TextDecoder('latin1');

// ---------------------------------------------------------------- Phive container

function view(d) { return d.dv || (d.dv = new DataView(d.buffer, d.byteOffset, d.byteLength)); }

function phiveSections(d, base = 0) {
  if (latin1.decode(d.subarray(base, base + 6)) !== 'Phive\0') throw new Error('not a Phive file');
  const dv = view(d), type = d[base + 10], count = d[base + 11], out = [];
  for (let i = 0; i < count; i++) {
    out.push([base + dv.getUint32(base + 12 + 4 * i, true), dv.getUint32(base + 12 + 4 * count + 4 * i, true)]);
  }
  return { type, sections: out };
}
const isTagfile = (d, o) => d[o + 4] === 0x54 && d[o + 5] === 0x41 && d[o + 6] === 0x47 && d[o + 7] === 0x30; // TAG0
const isPhive = (d, o) => latin1.decode(d.subarray(o, o + 6)) === 'Phive\0';

// ---------------------------------------------------------------- Havok tagfile

function varint(d, p) {
  const f = d[p];
  const be = (n, mask) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + d[p + i]; return v % mask; };
  if (f < 0x80) return [f, p + 1];
  if (f < 0xc0) return [be(2, 0x4000), p + 2];
  if (f < 0xe0) return [be(3, 0x200000), p + 3];
  if (f < 0xe8) return [be(4, 0x8000000), p + 4];
  if (f < 0xf0) return [be(5, 0x800000000), p + 5];
  if (f < 0xf8) return [be(8, 2 ** 59), p + 8];
  if (f === 0xf8) { let v = 0; for (let i = 1; i < 6; i++) v = v * 256 + d[p + i]; return [v, p + 6]; }
  if (f === 0xf9) { let v = 0; for (let i = 1; i < 9; i++) v = v * 256 + d[p + i]; return [v, p + 9]; }
  throw new Error('bad varint at ' + p);
}

function chunks(d, p, end) {
  const dv = view(d), out = {};
  while (p + 8 <= end) {
    const header = dv.getUint32(p, false), size = header & 0x3fffffff;
    if (size < 8) break;
    const tag = latin1.decode(d.subarray(p + 4, p + 8));
    out[tag] = header >>> 30 === 0 ? chunks(d, p + 8, p + size) : [p + 8, p + size];
    p += size;
  }
  return out;
}

class Tagfile {
  constructor(d, off) {
    this.d = d;
    const dv = view(d), size = dv.getUint32(off, false) & 0x3fffffff;
    const c = chunks(d, off, off + size).TAG0;
    const base = c.DATA[0], types = c.TYPE;
    const strings = (r) => latin1.decode(d.subarray(r[0], r[1])).split('\0');
    this.tstr = strings(types.TST1);
    this.types = [null];
    let [count, p] = varint(d, types.TNA1[0]);
    for (let i = 1; i < count; i++) {
      let nameIndex, nParams, k, v;
      [nameIndex, p] = varint(d, p); [nParams, p] = varint(d, p);
      const tpl = [];
      for (let j = 0; j < nParams; j++) { [k, p] = varint(d, p); [v, p] = varint(d, p); tpl.push([this.tstr[k], v]); }
      this.types.push({ name: this.tstr[nameIndex], tpl });
    }
    this.items = [];
    for (let q = c.INDX.ITEM[0]; q < c.INDX.ITEM[1]; q += 12) {
      const tf = dv.getUint32(q, true);
      this.items.push([tf & 0xffffff, tf >>> 24, base + dv.getUint32(q + 4, true), dv.getUint32(q + 8, true)]);
    }
    this.objects = new Map();
    for (const [t, flags, offset] of this.items) if (flags & 0x10) this.objects.set(offset, this.tname(t));
  }
  tname(i) {
    if (!i) return '-';
    if (i >= this.types.length) return '?' + i;
    const t = this.types[i];
    return t.tpl.length ? t.name + '<' + t.tpl.map(([k, v]) => (k.startsWith('t') ? this.tname(v) : String(v))).join(',') + '>' : t.name;
  }
  root() { const [t, , offset] = this.items[1]; return [offset, this.tname(t)]; }
}

const relView = (d, p) => [p + view(d).getInt32(p, true), view(d).getInt32(p + 4, true)];
const relArray = (d, p) => [p + Number(view(d).getBigInt64(p, true)), view(d).getInt32(p + 8, true)];
const relPtr = (d, p) => { const o = Number(view(d).getBigInt64(p, true)); return o ? p + o : null; };

// ---------------------------------------------------------------- shapes
// A local shape: { v: Float64Array xyz..., t: Uint32Array a,b,c..., tag: Uint16Array (one per triangle) }

function meshShape(d, o) {
  const dv = view(d);
  const inv = [dv.getFloat32(o + 0x50, true), dv.getFloat32(o + 0x54, true), dv.getFloat32(o + 0x58, true)];
  const [tagAt, tagCount] = relView(d, o + 0x60);
  const [secAt, secCount] = relView(d, o + 0x88);
  let nv = 0, np = 0;
  const secs = [];
  for (let s = 0; s < secCount; s++) {
    const sec = secAt + 0x40 * s;
    const [prims, primCount] = relView(d, sec + 0x08);
    const [vb, vbSize] = relView(d, sec + 0x10);
    const so = [dv.getInt32(sec + 0x20, true), dv.getInt32(sec + 0x24, true), dv.getInt32(sec + 0x28, true)];
    const floats = so[0] === 0x7fffffff && so[1] === 0x7fffffff && so[2] === 0x7fffffff;
    const count = floats ? Math.floor(vbSize / 12) : Math.floor(vbSize / 6);
    secs.push({ prims, primCount, vb, so, floats, count, base: nv });
    nv += count; np += primCount;
  }
  const v = new Float64Array(nv * 3), t = new Uint32Array(np * 6), tag = new Uint16Array(np * 2);
  for (const s of secs) {
    for (let j = 0; j < s.count; j++) {
      const w = (s.base + j) * 3;
      if (s.floats) for (let k = 0; k < 3; k++) v[w + k] = dv.getFloat32(s.vb + 12 * j + 4 * k, true);
      else for (let k = 0; k < 3; k++) v[w + k] = (s.so[k] + dv.getUint16(s.vb + 6 * j + 2 * k, true)) * inv[k];
    }
  }
  // shape tags: runs of (first primitive key, tag); keys rise with (section, primitive), so walk the table once
  let n = 0, run = 0, current = 0;
  for (let si = 0; si < secs.length; si++) {
    const s = secs[si];
    for (let pi = 0; pi < s.primCount; pi++) {
      const key = (si << 9) | (pi << 1);
      while (run < tagCount && dv.getUint32(tagAt + 8 * run, true) <= key) { current = dv.getUint16(tagAt + 8 * run + 4, true); run++; }
      const tg = current === 0xffff ? 0 : current;
      const q = s.prims + 4 * pi, a = s.base + d[q], b = s.base + d[q + 1], c = s.base + d[q + 2], e = s.base + d[q + 3];
      t[3 * n] = a; t[3 * n + 1] = b; t[3 * n + 2] = c; tag[n++] = tg;
      if (e !== c) { t[3 * n] = a; t[3 * n + 1] = c; t[3 * n + 2] = e; tag[n++] = tg; }
    }
  }
  return { v, t: t.subarray(0, 3 * n), tag: tag.subarray(0, n) };
}

function capsule(a, b, r, n = 8) {
  const axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...axis) || 1;
  for (let i = 0; i < 3; i++) axis[i] /= len;
  const ref = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cross = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  let u = cross(axis, ref); const ul = Math.hypot(...u); u = u.map((x) => x / ul);
  const w = cross(axis, u);
  const verts = [], tris = [];
  const add = (p) => { verts.push(p[0], p[1], p[2]); return verts.length / 3 - 1; };
  const ring = (c, k) => { const ang = 2 * Math.PI * k / n; return [0, 1, 2].map((i) => c[i] + r * (Math.cos(ang) * u[i] + Math.sin(ang) * w[i])); };
  const tipA = [0, 1, 2].map((i) => a[i] - r * axis[i]), tipB = [0, 1, 2].map((i) => b[i] + r * axis[i]);
  for (let k = 0; k < n; k++) {
    const a0 = add(ring(a, k)), a1 = add(ring(a, k + 1)), b0 = add(ring(b, k)), b1 = add(ring(b, k + 1));
    const ta = add(tipA), tb = add(tipB);
    tris.push(a0, b0, b1, a0, b1, a1, ta, a0, a1, tb, b1, b0);
  }
  return { v: Float64Array.from(verts), t: Uint32Array.from(tris), tag: new Uint16Array(tris.length / 3) };
}

function convexShape(d, o) {
  const dv = view(d);
  const [va, vc] = relView(d, o + 0x38), [fa, fc] = relView(d, o + 0x48), [ia] = relView(d, o + 0x50);
  const vert = (i) => [dv.getFloat32(va + 12 * i, true), dv.getFloat32(va + 12 * i + 4, true), dv.getFloat32(va + 12 * i + 8, true)];
  const radius = dv.getFloat32(o + 0x68, true);
  if (fc === 0 && vc === 2) return capsule(vert(0), vert(1), radius);
  if (fc === 0 && vc === 1) { const c = vert(0); return capsule([c[0], c[1] - 1e-3, c[2]], [c[0], c[1] + 1e-3, c[2]], radius); }
  const v = new Float64Array(vc * 3);
  for (let i = 0; i < vc; i++) { const p = vert(i); v[3 * i] = p[0]; v[3 * i + 1] = p[1]; v[3 * i + 2] = p[2]; }
  const t = [];
  for (let f = 0; f < fc; f++) {
    const first = dv.getUint16(fa + 4 * f, true), count = d[fa + 4 * f + 2];
    for (let k = 1; k < count - 1; k++) t.push(d[ia + first], d[ia + first + k], d[ia + first + k + 1]);
  }
  return { v, t: Uint32Array.from(t), tag: new Uint16Array(t.length / 3) };
}

function compoundInstances(d, o) {
  const dv = view(d), [at, count] = relArray(d, o + 0x38), out = [];
  const f = (p) => dv.getFloat32(p, true);
  for (let i = 0; i < count; i++) {
    const p = at + 64 * i, shape = relPtr(d, p + 0x30);
    if (shape === null) continue;
    out.push({ q: [f(p), f(p + 4), f(p + 8), f(p + 12)], t: [f(p + 0x10), f(p + 0x14), f(p + 0x18)],
      s: [f(p + 0x20), f(p + 0x24), f(p + 0x28)], shapeTag: dv.getUint16(p + 0x2c, true), shape });
  }
  return out;
}

/** Vertices placed by scale, rotation (quaternion x y z w) and translation. */
function place(v, x) {
  const [qx, qy, qz, qw] = x.q, [tx, ty, tz] = x.t, [sx, sy, sz] = x.s, out = new Float64Array(v.length);
  for (let i = 0; i < v.length; i += 3) {
    const vx = v[i] * sx, vy = v[i + 1] * sy, vz = v[i + 2] * sz;
    const cx = 2 * (qy * vz - qz * vy), cy = 2 * (qz * vx - qx * vz), cz = 2 * (qx * vy - qy * vx);
    out[i] = vx + qw * cx + (qy * cz - qz * cy) + tx;
    out[i + 1] = vy + qw * cy + (qz * cx - qx * cz) + ty;
    out[i + 2] = vz + qw * cz + (qx * cy - qy * cx) + tz;
  }
  return out;
}

const CONVEX = new Set(['hknpConvexShape', 'hknpBoxShape', 'hknpCylinderShape', 'hknpConvexPolytopeShape', 'hknpCapsuleShape', 'hknpSphereShape']);
const EMPTY = { v: new Float64Array(0), t: new Uint32Array(0), tag: new Uint16Array(0) };

class ShapeDecoder {
  constructor(tf) { this.tf = tf; this.cache = new Map(); }
  local(o) {
    if (this.cache.has(o)) return this.cache.get(o);
    const kind = this.tf.objects.get(o) || '?', d = this.tf.d;
    let r = EMPTY;
    if (kind === 'hknpMeshShape') r = meshShape(d, o);
    else if (CONVEX.has(kind)) r = convexShape(d, o);
    else if (kind === 'hknpCompoundShape') {
      const parts = compoundInstances(d, o).map((inst) => { const l = this.local(inst.shape); return { v: place(l.v, inst), t: l.t, tag: l.tag }; });
      r = concat(parts);
    }
    this.cache.set(o, r);
    return r;
  }
}

function concat(parts) {
  let nv = 0, nt = 0;
  for (const p of parts) { nv += p.v.length; nt += p.t.length; }
  const v = new Float64Array(nv), t = new Uint32Array(nt), tag = new Uint16Array(nt / 3);
  let ov = 0, ot = 0;
  for (const p of parts) {
    v.set(p.v, ov);
    for (let i = 0; i < p.t.length; i++) t[ot + i] = p.t[i] + ov / 3;
    tag.set(p.tag, ot / 3);
    ov += p.v.length; ot += p.t.length;
  }
  return { v, t, tag };
}

// ---------------------------------------------------------------- files

function records16(d, offset, size, read) {
  const out = [];
  for (let i = 0; i < Math.floor(size / 16); i++) out.push(read(view(d), offset + 16 * i));
  return out;
}

function decodeBphsh(d, base) {
  const { sections } = phiveSections(d, base);
  const tfOff = sections.find(([o, s]) => s && isTagfile(d, o))[0];
  const tf = new Tagfile(d, tfOff);
  const [root] = tf.root();
  const local = new ShapeDecoder(tf).local(root);
  const rest = sections.filter(([o, s]) => s && o !== tfOff);
  const materials = rest[0] ? records16(d, rest[0][0], rest[0][1], (dv, p) => dv.getUint32(p, true)) : [];
  const masks = rest[1] ? records16(d, rest[1][0], rest[1][1], (dv, p) => dv.getUint32(p, true)) : [];
  return { ...local, materials, masks };
}

/** Placement records of the nested ground meshes (0x2C each: scale, 3 zero words, translation, u32 kind, u32 0). */
function groundPlacements(d, offset, size) {
  if (size % 0x10 || size < 0x2c) return [];
  const dv = view(d), out = [], end = offset + size;
  let p = offset;
  while (p + 0x2c <= end) {
    const f = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => dv.getFloat32(p + 4 * i, true));
    const kind = dv.getUint32(p + 0x24, true), zero = dv.getUint32(p + 0x28, true);
    const ok = f.slice(0, 3).every((x) => Math.abs(x) > 0.001 && Math.abs(x) < 1000) && f[3] === 0 && f[4] === 0 && f[5] === 0 && kind > 0 && kind < 64 && zero === 0;
    if (!ok) break;
    out.push({ s: f.slice(0, 3), t: f.slice(6, 9), q: [0, 0, 0, 1], kind });
    p += 0x2c;
  }
  if (!out.length) return [];
  for (let i = p; i < end; i++) if (d[i]) return [];
  return out;
}

function decodeLayer(d, offset, info, out) {
  const tf = new Tagfile(d, offset), [root, kind] = tf.root(), dec = new ShapeDecoder(tf);
  const instances = kind === 'hknpCompoundShape' ? compoundInstances(d, root) : [];
  for (const inst of instances) { inst.info = info[inst.shapeTag] || null; inst.decoder = dec; }
  const first = instances.length && instances[0].info;
  const key = first ? first.sensor + ':' + first.layer : null;
  const extra = !!(key && !first.sensor && out.layers.some((l) => l.key === key));
  out.layers.push({ instances, key, extra });
}

/** A .bphsc tile -> {name, info, materials, masks, layers, grounds}. */
export function decodeBphsc(d) {
  const { type, sections } = phiveSections(d);
  if (type !== 2) throw new Error('not a static compound');
  const dv = view(d), header = sections[0][0];
  const nameAt = header + 0xca20;
  const name = latin1.decode(d.subarray(nameAt, d.indexOf(0, nameAt)));
  const counts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => dv.getUint32(header + 0xc000 + 4 * i, true));
  const nInfo = counts[5], nMaterials = counts[6];
  const table = (si, count, size, read) => (sections[si][1] ? Array.from({ length: count }, (_, k) => read(sections[si][0] + size * k)) : []);
  const info = table(4, nInfo, 20, (p) => ({ sensor: d[p + 4], layer: d[p + 5], first: dv.getUint32(p + 12, true), count: dv.getUint32(p + 16, true) }));
  const materials = table(5, nMaterials, 16, (p) => dv.getUint32(p, true));
  const masks = table(6, nMaterials, 16, (p) => dv.getUint32(p, true));
  const out = { name, info, materials, masks, layers: [], grounds: [] };
  const placements = [];
  sections.forEach(([o, s], si) => {
    if (!s || si <= 6) return;
    if (isTagfile(d, o)) decodeLayer(d, o, info, out);
    else if (isPhive(d, o)) out.grounds.push(decodeBphsh(d, o));
    else placements.push(...groundPlacements(d, o, s));
  });
  out.grounds.forEach((g, k) => {
    if (!placements.length) return;
    g.xform = placements[Math.min(k, placements.length - 1)];
    g.v = place(g.v, g.xform);
  });
  return out;
}

// ---------------------------------------------------------------- map builder (dedupe to mm, like the Python export)

function roundHalfEven(x) {
  const f = Math.floor(x), r = x - f;
  return r < 0.5 ? f : r > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1);
}

class Grow {
  constructor(Type, n = 1 << 16) { this.Type = Type; this.a = new Type(n); this.n = 0; }
  push3(x, y, z) {
    if (this.n + 3 > this.a.length) { const b = new this.Type(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z;
  }
  push(x) {
    if (this.n + 1 > this.a.length) { const b = new this.Type(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = x;
  }
  get view() { return this.a.subarray(0, this.n); }
}

/** Ground meshes to use: where several share one placement (Hyrule Field: two near-identical versions per tile),
 *  keep the last of them; meshes placed at different spots (GerudoThiefStage: an 8x8 grid in one tile) all stay. */
export function keptGrounds(grounds) {
  const last = new Map();
  grounds.forEach((g, i) => last.set(g.xform ? g.xform.t.join(',') : 'none', i));
  return grounds.filter((g, i) => last.get(g.xform ? g.xform.t.join(',') : 'none') === i);
}

export class MapBuilder {
  constructor() {
    this.keys = new Grow(Int32Array); this.tris = new Grow(Uint32Array); this.cats = new Grow(Uint8Array);
    this.mask = (1 << 20) - 1; this.table = new Int32Array(this.mask + 1).fill(-1); this.count = 0;
  }
  _slot(x, y, z) {
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & this.mask;
    const k = this.keys.a;
    for (;;) {
      const id = this.table[h];
      if (id < 0 || (k[3 * id] === x && k[3 * id + 1] === y && k[3 * id + 2] === z)) return h;
      h = (h + 1) & this.mask;
    }
  }
  _id(x, y, z) {
    let h = this._slot(x, y, z);
    if (this.table[h] >= 0) return this.table[h];
    if ((this.count + 1) * 2 > this.mask) { this._grow(); h = this._slot(x, y, z); }
    this.table[h] = this.count; this.keys.push3(x, y, z);
    return this.count++;
  }
  _grow() {
    this.mask = this.mask * 2 + 1; this.table = new Int32Array(this.mask + 1).fill(-1);
    const k = this.keys.a;
    for (let id = 0; id < this.count; id++) this.table[this._slot(k[3 * id], k[3 * id + 1], k[3 * id + 2])] = id;
  }
  /** Add placed triangles; catOf(tri index) gives the category, or -1 to drop the triangle. */
  add(v, t, catOf) {
    const map = new Int32Array(v.length / 3).fill(-1);
    const id = (i) => {
      if (map[i] < 0) map[i] = this._id(roundHalfEven(v[3 * i] / 0.001), roundHalfEven(v[3 * i + 1] / 0.001), roundHalfEven(v[3 * i + 2] / 0.001));
      return map[i];
    };
    for (let k = 0; k < t.length / 3; k++) {
      const c = catOf(k);
      if (c < 0) continue;
      const a = id(t[3 * k]), b = id(t[3 * k + 1]), e = id(t[3 * k + 2]);
      if (a === b || b === e || a === e) continue;
      this.tris.push3(a, b, e); this.cats.push(c);
    }
  }
  /** Add one decoded tile with the default filter (player collision, no Rough twin, no sensors). */
  addTile(sc) {
    for (const layer of sc.layers) {
      if (layer.extra) continue;
      for (const inst of layer.instances) {
        const info = inst.info;
        let layerName = '?', sensor = false, hits = true, first = 0, count = 0;
        if (info) {
          sensor = !!info.sensor; first = info.first; count = info.count;
          layerName = nameOf(sensor ? LAYERS_SENSOR : LAYERS_ENTITY, info.layer);
          hits = false;
          for (let m = first; m < first + count; m++) if (m < sc.masks.length && sc.masks[m] & PLAYER_LAYER_BIT) hits = true;
          hits = hits && !sensor;
        }
        if (sensor || layerName === 'GroundHighResRough') continue;
        const local = inst.decoder.local(inst.shape);
        if (!local.t.length) continue;
        this.add(place(local.v, inst), local.t, (k) => {
          const tag = local.tag[k], m = tag < count ? first + tag : first;
          const material = m < sc.materials.length ? nameOf(MATERIALS, sc.materials[m]) : '?';
          const hit = m < sc.masks.length ? (sc.masks[m] & PLAYER_LAYER_BIT) !== 0 : hits;
          return hit ? category(material) : -1;
        });
      }
    }
    for (const g of keptGrounds(sc.grounds)) {
      this.add(g.v, g.t, (k) => category(nameOf(MATERIALS, g.tag[k] < g.materials.length ? g.materials[g.tag[k]] : 0)));
    }
  }
  /** The .ohm file (uncompressed bytes): "OHM1", u32 header length, JSON header, f32 positions, u32 indices. */
  pack(area, map) {
    const nt = this.cats.n, cats = this.cats.view, tris = this.tris.view;
    const groups = [], order = new Uint32Array(nt * 3);
    let start = 0;
    for (let c = 0; c < 3; c++) {
      let count = 0;
      for (let k = 0; k < nt; k++) {
        if (cats[k] !== c) continue;
        order.set(tris.subarray(3 * k, 3 * k + 3), 3 * (start + count)); count++;
      }
      groups.push({ cat: CATEGORIES[c], start, count }); start += count;
    }
    const positions = new Float32Array(this.count * 3), keys = this.keys.view;
    for (let i = 0; i < positions.length; i++) positions[i] = keys[i] * 0.001;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) { const a = i % 3; if (positions[i] < lo[a]) lo[a] = positions[i]; if (positions[i] > hi[a]) hi[a] = positions[i]; }
    const header = { format: 'ohm1', area, map, vertexCount: this.count, triangleCount: nt, groups, bbox: [lo, hi],
      units: 'metres, +Y up (game coordinates)', grid: null, source: 'OoT Height Compare in-browser extractor', exported: new Date().toISOString().slice(0, 10) };
    let hj = new TextEncoder().encode(JSON.stringify(header));
    const pad = (4 - (hj.length % 4)) % 4;
    const out = new Uint8Array(8 + hj.length + pad + positions.byteLength + order.byteLength);
    out.set([0x4f, 0x48, 0x4d, 0x31]);
    new DataView(out.buffer).setUint32(4, hj.length + pad, true);
    out.set(hj, 8); out.fill(0x20, 8 + hj.length, 8 + hj.length + pad);
    out.set(new Uint8Array(positions.buffer), 8 + hj.length + pad);
    out.set(new Uint8Array(order.buffer), 8 + hj.length + pad + positions.byteLength);
    return out;
  }
}

// ---------------------------------------------------------------- maps in the dump

const TILE_RE = /^(.+?)(?:_X\d+_Z\d+)?\.[^/]*bphsc\.zs$/;
const PREFIX = 'romfs/Phive/StaticCompoundBody/';

/** [{area, map, tiles: [paths]}] for every map in the dump. */
export function listMaps(index) {
  const maps = new Map();
  for (const path of index.keys()) {
    if (!path.startsWith(PREFIX)) continue;
    const rest = path.slice(PREFIX.length), slash = rest.indexOf('/');
    if (slash < 0) continue;
    const area = rest.slice(0, slash), m = TILE_RE.exec(rest.slice(slash + 1));
    if (!m) continue;
    const key = area + '/' + m[1];
    if (!maps.has(key)) maps.set(key, { area, map: m[1], tiles: [] });
    maps.get(key).tiles.push(path);
  }
  return [...maps.values()].sort((a, b) => a.map.localeCompare(b.map));
}

/** Extract one map: read and decode its tiles, return the .ohm bytes (uncompressed). */
export async function extractMap(files, entry, progress = () => {}) {
  const builder = new MapBuilder();
  const tiles = [...entry.tiles].sort();
  for (let i = 0; i < tiles.length; i++) {
    builder.addTile(decodeBphsc(await files.read(tiles[i])));
    progress(i + 1, tiles.length);
  }
  return { bytes: builder.pack(entry.area, entry.map), triangles: builder.cats.n, vertices: builder.count };
}
