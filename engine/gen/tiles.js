// The `tiles` layout (docs/data-sprites.md 2.3, 3.3 "tile", 4.3; build item B15). A tileset is data: `body.tiles` holds
// groups that name their pieces (engine/gen/tiles-clips.js names the clips), and a MATERIAL AS DATA that says what the
// inside and each edge look like. This module turns that data into the material engine/tiles.js draws (its paints and
// insets become framework functions reading the data's tables), draws the clip's piece with the tile helper's own
// renderer, and returns the tile as one stamp (whole pixels, never sampled). So every piece of a data tileset joins
// every other exactly as a code tileset's do, and the picker, engine/tile-rules.js, the checker and the export read it
// unchanged. Nothing in the data runs: the functions are this file's, built from numbers and names.
//
// THE JOINS (TILE_JOINS): what draws a clip is decided by its group and piece, from this fixed list:
//   block    a group of kind "block": the 13 pieces of style guide section 6 (edges, outer and inner corners, the fill
//            and its versions), the narrow ones (strips, columns, a single tile), the lane pieces (bends, forks, a
//            crossing), by engine/tiles.js drawBlock
//   soft     the same pieces when the material says soft: true (arc corners, outlines that wander up to 8 px), drawSoftBlock
//   face     the same pieces when the material has a face (a top-down wall): the bottom row and a wall one tile deep show
//            the face picture, drawBlock's front face
//   thin     a thin platform ("-thin-l", "-m", "-r"): the group's thickness (default 12) and its own underside (`under`)
//   slope    the two 45 degree slopes, by drawSlope
//   liquid   a group of kind "liquid": its surface ("-top") and body ("-fill" and versions), by drawLiquid
//   floor    a group of kind "floor": the fill and its versions alone
//   picture  a piece the group draws by hand (`pictures`: { "cap": [primitives], ... }): stacks, platforms of planks;
//            outlined once unless the group says outline: false
//   decal    a group's decal: its draw list, outlined when it says outline: true
//   extra    a tile the naming scheme does not cover: its draw list
//
// THE MATERIAL AS DATA (a group's `material`, else the tileset's; or a material piece { use: "material:<id>", v }):
//   fill     { base: paint, versions: [[primitives], ...] }: version v is the base with its list drawn over it (32 x 32,
//            frame pixels; generators such as scatter@1 and pieces allowed). Keep marks off the outer 3 px
//   behind   true: an edge piece has version fillBehind(piece) behind its edge (engine/tiles.js), not always version 0
//   edges    { top, left, right, bottom }: { depth, wrap, tuck (true or px), inset { profile, amount }, ragged { profile,
//            amount }, bands: [band rules] }. A profile is a name in body.tiles.profiles or a list; its value at u (the
//            position along the edge, repeating) times amount is the inset (rounded, 0..3; 0..8 soft) or the ragged px
//            (an inset's or a ragged's profile may also be picked by a choice or an on/off, { from, pick: { option:
//            profile } }: engine/resolve.js hands this layout the picked one; tests/unit/tiles-profile-binding.test.mjs)
//   band     { rows: [from, to] | "last" | "last-1" | { profile }, where?: { profile, in: [values] }, paint, when? }: d px
//            in from the outline (1 = the first), first match wins, "last" is the band's deepest row (the shadow it
//            casts) and "last-1" the row above it, { profile } rows 1 to the profile's value at that column (a run
//            hanging from the edge: slime, drips, icicles); a `when` drops the rule at other settings (the rules after
//            it then decide); no match (or paint "clear") shows the fill there
//   ink      the outline's paint (default ink); "none" for no outline (floor laid on floor)
//   round    how much each outer corner is cut (0..3; soft ground: the radius, 0..14)
//   soft     true: soft ground (drawSoftBlock)
//   face     { draw: [primitives], top?, base?, shadow? }: a top-down wall's front face as one 32 x 32 picture read at frame
//            rows, so a full face and a low one (under the 8 px sliver of cap) keep their courses in line; top paints the
//            face's first row, base the base line (default the ink), shadow the two rows under it ("none": see-through)
//   liquid   { level, rise?: { profile, amount, travel }, surface: [band rules] }: the line's row when still; the profile
//            (asked at even columns) times amount lifts it, moving `travel` whole profile lengths along per clip so the
//            loop closes; surface bands count rows from the line (1 = the line itself)
//   outside  [{ x?, y?, out?, paint, when? }]: the pixels beyond the outline (a drip under a ceiling, the bank round a
//            hole): tile columns x and rows y as [from, to], on soft ground also out, px beyond the line (1 = the first);
//            first match wins; no match leaves them see-through; a `when` drops a rule at other settings
//   fills    a group asking for N fills draws N different middles: its material gives N versions (the validator
//            refuses fewer, and this layout refuses them from a material piece)
//
// A MATERIAL PIECE (pieces/material-<name>.v<v>.json) is a material as above, checked by the same rules
// (catalog/sprite-schema.js checkMaterialPiece, run by engine/resolve.js wherever a tileset uses one), with its own
// `profiles` beside it in its body: its profile names are read there and never from the tileset, so a shared material
// draws the same in every tileset that uses it.
//
// Choices (B15, listed in the builder's report): colours reach the stamp as '#rrggbb' worked out from the palette (the
// fill and edge bands are pixels of a 32 x 32 grid, not shapes); a band paint that names a colour the palette cannot
// give is an error; 16 px tiles are refused here and by the validator (engine/tiles.js draws 32 px tiles). A fill
// version's and a face's draw list are drawn once per group and phase and shared by every clip (GRIDS below), so they
// must not depend on the clip.
//
// Pure: no DOM, no Node, no clock, no randomness. Runs unchanged in the browser and in Node.
import { defineGenerator } from './registry.js';
import { primitives, profile, count, flag, paint } from './args.js';
import { tileClips, STACK_PIECES, groupDrawsMiddles } from './tiles-clips.js';
import { Surface } from '../surface.js';
import { INK, col } from '../color.js';
import { TILE, pieceOf, drawBlock, drawSoftBlock, drawThin, drawSlope, drawLiquid, fillBehind } from '../tiles.js';
import { drawList } from '../draw-list.js';
import { paintHex } from '../resolve.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const wrapT = (v) => ((Math.floor(v) % TILE) + TILE) % TILE;

/** The joins: the fixed list of ways a tile clip is drawn, each with what it covers (the header says more). */
export const TILE_JOINS = Object.freeze({
  block: 'fills, edges, outer and inner corners, strips, columns, a single tile, lanes (bends, forks, a crossing) and fill versions, from the material (engine/tiles.js drawBlock)',
  soft: 'the same pieces as soft ground: arc corners, outlines that wander up to 8 px (drawSoftBlock)',
  face: 'a top-down wall: its cap from the material, its bottom row and a wall one tile deep showing the face picture',
  thin: 'a thin platform of the material: left end, middle, right end, its thickness and underside (drawThin)',
  slope: 'the two 45 degree slopes of the material (drawSlope)',
  liquid: 'a liquid\'s surface and body: a line at a level that may rise and travel, bands under it (drawLiquid)',
  floor: 'a lone fill and its versions: the ground everything else lies on',
  picture: 'a piece drawn by hand (a stack\'s cap, middle and foot; a platform of planks), outlined once',
  decal: 'a decoration over or beside a group (on, above, below, face, rim), outlined when it says so',
  extra: 'a tile the naming scheme does not cover (stairs), placed by hand',
});

/** Pieces of a top-down wall that are a face under an 8 px sliver of cap (engine/tiles.js FACES): their face rows start at 8. */
const SLIVER = Object.freeze({ 'strip-l': 8, 'strip-m': 8, 'strip-r': 8, single: 8 });

// ---- reading the data ------------------------------------------------------------------------------------------------

/** What a clip of a tiles body is: { kind: 'decal' | 'extra' | 'piece', group, decal?, extra?, piece, part } or null. */
function clipOwner(body, clip) {
  for (const x of Array.isArray(body.extra) ? body.extra : []) if (isObj(x) && x.name === clip) return { kind: 'extra', extra: x };
  for (const g of Array.isArray(body.groups) ? body.groups : []) {
    if (!isObj(g) || typeof g.name !== 'string') continue;
    const mine = tileClips({ groups: [g] });
    if (!Object.hasOwn(mine, clip)) continue;
    const part = clip.slice(g.name.length + 1);
    const deco = /^deco-(.+)$/.exec(part);
    if (deco) return { kind: 'decal', group: g, decal: (g.decals ?? []).find((d) => isObj(d) && d.name === deco[1]) };
    return { kind: 'piece', group: g, part };
  }
  return null;
}

/**
 * Where a material's data and its profiles are: a material piece resolved in place carries its data in `body` and its
 * own profiles in body.profiles (a shared material draws the same in every tileset: the tileset's profiles are not
 * read); data written in the group or the tileset is the material itself, its profile names the tileset's.
 * Returns { m, P } (P: an object whose `profiles` the names are read from) or null.
 */
function materialSource(m, body) {
  if (isObj(m) && typeof m.use === 'string' && isObj(m.body)) {
    const b = m.body, data = isObj(b.material) ? b.material : b;
    return { m: data, P: { profiles: isObj(b.profiles) ? b.profiles : {} }, piece: m.use };
  }
  return isObj(m) ? { m, P: body, piece: null } : null;
}

/** A profile's value at u (the list repeats), from a name in the body's profiles or a list. */
function profileAt(body, p, u) {
  const list = typeof p === 'string' ? body.profiles?.[p] : p;
  if (!Array.isArray(list) || !list.length) return 0;
  const n = list.length, v = list[((Math.round(u) % n) + n) % n];
  return fin(v) ? v : 0;
}

/** The colour of a paint at these settings ('#rrggbb'), null for "clear"; an error naming it when the palette cannot give it. */
function hexOf(R, ref, where) {
  if (ref === 'clear') return null;
  const h = paintHex(ref, R.palette, R.params);
  if (!h) throw new Error(`${where}: the paint ${JSON.stringify(ref).slice(0, 40)} is not a colour this palette gives`);
  return h;
}

/** A band rule list as engine/tiles.js paint(d, u, t, depthHere): the first rule whose rows (and profile) match. */
function bandsOf(R, body, rules, where) {
  const list = (Array.isArray(rules) ? rules : []).map((r, i) => ({ ...r, hex: hexOf(R, r.paint, `${where}, band rule ${i + 1}`) }));
  return (d, u, t, here) => {
    for (const r of list) {
      const rows = r.rows;
      const hit = rows === 'last' ? d === here : rows === 'last-1' ? d === here - 1 : Array.isArray(rows) ? d >= rows[0] && d <= rows[1] : isObj(rows) ? d >= 1 && d <= profileAt(body, rows.profile, u) : false;
      if (!hit) continue;
      if (isObj(r.where) && !(Array.isArray(r.where.in) && r.where.in.includes(profileAt(body, r.where.profile, u)))) continue;
      return r.hex;
    }
    return null;
  };
}

/** One edge as engine/tiles.js takes it: { depth, wrap, tuck, inset(u), ragged(u), paint(d, u, t, here) }. */
function edgeOf(R, body, e, where) {
  if (!isObj(e)) return undefined;
  const out = {};
  if (fin(e.depth)) out.depth = e.depth;
  if (fin(e.wrap)) out.wrap = e.wrap;
  if (e.tuck === true || fin(e.tuck)) out.tuck = e.tuck;
  for (const f of ['inset', 'ragged']) {
    const x = e[f];
    if (isObj(x) && x.profile !== undefined) { const amount = fin(x.amount) ? x.amount : 1; out[f] = (u) => profileAt(body, x.profile, u) * amount; }
  }
  if (Array.isArray(e.bands) && e.bands.length) out.paint = bandsOf(R, body, e.bands, where);
  return out;
}

/** A material's `outside` rules as engine/tiles.js outside(x, y, t, out): the first rule whose columns, rows and px beyond the line (soft ground) match; null leaves the pixel see-through. */
function outsideOf(R, rules, where) {
  const list = (Array.isArray(rules) ? rules : []).filter(isObj).map((r, i) => ({ ...r, hex: hexOf(R, r.paint, `${where}, outside rule ${i + 1}`) }));
  if (!list.length) return undefined;
  const inside = (v, n) => !Array.isArray(v) || (n !== undefined && n >= v[0] && n <= v[1]);
  return (x, y, t, out) => {
    for (const r of list) if (inside(r.x, x) && inside(r.y, y) && inside(r.out, out)) return r.hex;
    return null;
  };
}

// ---- pictures: fill versions, a face, a hand-drawn piece -------------------------------------------------------------

// The pictures of a sprite at one setting, kept while its tiles are drawn: a fill version or a face is drawn once and
// read by every clip of its group (that is what makes a sheet fast), so it is keyed by group and phase, NOT by clip.
// So a fill version's or a face's draw list must not depend on the clip (a generator reading ctx.clip or ctx.frames
// there would draw another clip's picture): a tile's own picture goes in `pictures`, a decal or an extra tile.
const GRIDS = new WeakMap();     // resolved sprite -> Map(key -> Surface)

/** A draw list painted on a 32 x 32 Surface (over `base` when given), through the frame's expand (generators, pieces). */
function picture(input, key, list, base, t) {
  const R = input.resolved;
  let m = GRIDS.get(R);
  if (!m) { m = new Map(); GRIDS.set(R, m); }
  const k = `${key}@${t}`;
  let s = m.get(k);
  if (s) return s;
  s = new Surface(TILE, TILE);
  if (base) s.rect(0, 0, TILE, TILE, base);
  if (Array.isArray(list) && list.length) {
    const x = input.expand(list);
    drawList(s, x.primitives, { palette: x.palette });
  }
  if (m.size > 256) m.clear();
  m.set(k, s);
  return s;
}

/** The material engine/tiles.js draws, built from the data for one piece at one phase. */
function materialFor(input, body, g, piece, t, where) {
  const R = input.resolved;
  const src = materialSource(g.material, body) ?? materialSource(body.material, body);
  if (!src) throw new Error(`${where}: the group has no material and no picture for this piece`);
  const { m, P } = src;
  const fill = isObj(m.fill) ? m.fill : {};
  const baseHex = fill.base !== undefined ? hexOf(R, fill.base, `${where}, fill base`) : null;
  const lists = Array.isArray(fill.versions) && fill.versions.length ? fill.versions : [[]];
  const fills = Number.isInteger(g.fills) && g.fills > 1 ? g.fills : 1, have = Array.isArray(fill.versions) ? fill.versions.length : 0;
  if (fills > have && fills > 1 && groupDrawsMiddles(g)) throw new Error(`${where}: the group asks for fills ${fills}, but its material${src.piece ? ` ${src.piece}` : ''} has ${have ? `${have} fill version${have === 1 ? '' : 's'}` : 'no fill versions'}; give it ${fills}`);
  const grids = lists.map((l, v) => picture(input, `${g.name}/fill/${v}`, l, baseHex, t));
  const behind = m.behind === true ? fillBehind(piece, grids.length) : 0;
  const out = {
    fill: (x, y, tt, v) => (grids[v || behind] ?? grids[0]).data[wrapT(y) * TILE + wrapT(x)],
  };
  if (m.ink === 'none') out.ink = null;
  else if (m.ink !== undefined) out.ink = hexOf(R, m.ink, `${where}, ink`);
  if (fin(m.round)) out.round = m.round;
  const edges = isObj(m.edges) ? m.edges : {};
  for (const side of ['top', 'left', 'right', 'bottom']) { const e = edgeOf(R, P, edges[side], `${where}, ${side} edge`); if (e) out[side] = e; }
  const outside = outsideOf(R, m.outside, where);
  if (outside) out.outside = outside;
  if (isObj(m.face)) {
    const f = m.face, y0 = SLIVER[piece] ?? 0;
    const grid = picture(input, `${g.name}/face`, f.draw, baseHex, t);
    const top = f.top !== undefined ? hexOf(R, f.top, `${where}, face top`) : null;
    out.face = {
      paint: (x, y) => (y === 0 && top ? top : grid.data[wrapT(y + y0) * TILE + wrapT(x)] || out.fill(x, y + y0, t, 0)),
      ...(f.base !== undefined ? { base: hexOf(R, f.base, `${where}, face base`) } : {}),
      ...(f.shadow !== undefined && f.shadow !== 'none' ? { shadow: hexOf(R, f.shadow, `${where}, face shadow`) } : {}),
    };
  }
  if (isObj(m.liquid)) {
    const q = m.liquid, rise = isObj(q.rise) ? q.rise : null;
    const len = rise ? (typeof rise.profile === 'string' ? P.profiles?.[rise.profile]?.length : rise.profile?.length) ?? 1 : 1;
    const amount = rise && fin(rise.amount) ? rise.amount : 1, travel = rise && fin(rise.travel) ? rise.travel : 0;
    const surface = bandsOf(R, P, q.surface, `${where}, liquid surface`);
    out.liquid = {
      level: fin(q.level) ? q.level : 6,
      ...(rise ? { rise: (u, tt) => profileAt(P, rise.profile, u - Math.round(travel * len * tt)) * amount } : {}),
      surface: (d, x) => surface(d + 1, x, t, Infinity),
      body: out.fill,
    };
  }
  out.soft = m.soft === true;
  return out;
}

const NAMES = new WeakMap();      // resolved sprite -> Map(packed colour -> paint ref)

/** Each colour the palette's slots give at these settings (a slot, then its light, dark and deep tones; ink last), by its packed number, as the paint ref that gives it: the first ref wins. */
function namesOf(R) {
  let m = NAMES.get(R);
  if (m) return m;
  m = new Map();
  const put = (ref) => { const h = paintHex(ref, R.palette, R.params); if (h) { const v = col(h); if (!m.has(v)) m.set(v, ref); } };
  for (const id of Object.keys(R.palette ?? {})) put(id);
  for (const id of Object.keys(R.palette ?? {})) for (const t of ['light', 'dark', 'deep']) put(`${id}.${t}`);
  put('ink');
  NAMES.set(R, m);
  return m;
}

/** A 32 x 32 Surface as one stamp primitive: '.' see-through, one key letter per colour, keyed to the paint ref that gives it (namesOf) or else its '#rrggbb'. */
const KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&*+-/:;<=>?@^_~|()[]{},\'"`\\';
function stampOf(s, where, names = new Map()) {
  const letters = new Map(), key = {}, rows = [];
  for (let y = 0; y < s.h; y++) {
    let row = '';
    for (let x = 0; x < s.w; x++) {
      const v = s.data[y * s.w + x];
      if (!(v >>> 24)) { row += '.'; continue; }
      let ch = letters.get(v);
      if (ch === undefined) {
        if (letters.size >= KEYS.length) throw new Error(`${where}: more than ${KEYS.length} colours in one tile`);
        ch = KEYS[letters.size];
        letters.set(v, ch);
        key[ch] = names.get(v) ?? `#${[v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
      }
      row += ch;
    }
    rows.push(row);
  }
  return { kind: 'stamp', at: [0, 0], rows, key };
}

// ---- the layout --------------------------------------------------------------------------------------------------

/** One frame of a tileset: the clip's piece drawn from its group's material (or picture, decal, extra tile). Returns { list, palette }. */
function layout(input, ctx) {
  const body = input.body, R = input.resolved, clip = ctx.clip;
  if (!isObj(body)) throw new Error('a tiles body is missing');
  const T = body.tile ?? TILE;
  if (T !== TILE) throw new Error(`${T} px tiles are not drawn yet: engine/tiles.js draws 32 px tiles (make the tileset 32 px)`);
  const who = clipOwner(body, clip);
  const where = `tile ${clip}`;
  if (!who) throw new Error(`${where}: no group, decal or extra tile names this clip`);
  const t = fin(ctx.t) ? ctx.t : 0;
  const own = (list, outline) => {
    const items = [...(Array.isArray(list) ? list : []), ...(outline ? [{ kind: 'outline', paint: 'ink' }] : [])];
    const x = input.expand(items);
    return { list: x.primitives, palette: x.palette };
  };
  if (who.kind === 'extra') return own(who.extra.draw, false);
  if (who.kind === 'decal') {
    if (!who.decal) throw new Error(`${where}: the decal is missing`);
    return own(who.decal.draw, who.decal.outline === true);
  }
  const g = who.group, part = who.part;
  if (isObj(g.pictures) && Object.hasOwn(g.pictures, part)) {
    // a piece drawn by hand: outlined once (none where it leaves the tile), as tiles-platforms.js does
    const s = new Surface(TILE, TILE);
    const x = input.expand(g.pictures[part]);
    drawList(s, x.primitives, { palette: x.palette });
    if (g.outline !== false) s.outline(INK);
    return { list: [stampOf(s, where, namesOf(R))], palette: R.palette };
  }
  if (g.kind === 'stack' || (STACK_PIECES.includes(part) && g.kind !== 'block')) throw new Error(`${where}: a ${g.kind} group draws its pieces from pictures; give pictures.${part}`);
  const k = pieceOf(clip);
  const mat = materialFor(input, body, g, k?.kind === 'block' ? k.piece.replace(/^fill-[b-z]$/, 'fill') : part, t, where);
  const s = new Surface(TILE, TILE);
  if (g.kind === 'liquid' && mat.liquid) drawLiquid(s, part, mat.liquid, t);
  else if (k?.kind === 'thin') drawThin(s, k.piece, { ...mat, outside: undefined }, t, {   // a thin platform has only air beyond its outline: outside is for blocks
    thickness: fin(g.thickness) ? g.thickness : 12, ...(g.under ? { bottom: edgeOf(R, body, g.under, `${where}, under`) } : {}) });
  else if (k?.kind === 'slope') drawSlope(s, k.piece, mat, t);
  else if (k?.kind === 'block') { if (mat.soft) drawSoftBlock(s, k.piece, mat, t); else drawBlock(s, k.piece, mat, t); }
  else throw new Error(`${where}: not a piece the tile helper draws`);
  return { list: [stampOf(s, where, namesOf(R))], palette: R.palette };
}

/**
 * tiles@1: the layout of a tileset (docs/data-sprites.md 2.3, 4.3). Each clip is one tile, named by tile.clips; it is
 * drawn by the join its group and piece call for (TILE_JOINS) from the group's material as data. Run as a plain
 * generator it draws nothing.
 */
export const tiles = defineGenerator({
  id: 'tiles', v: 1, family: 'layout',
  about: 'Lays out a tileset: each clip is one tile, drawn from its group\'s material as data so every piece joins every other.',
  args: { groups: primitives({ default: [], about: 'The layout reads the whole tiles body from engine/data-sprite.js' }) },
  cost: () => 0,
  run(input, ctx) {
    if (!isObj(input) || !isObj(input.resolved) || typeof input.expand !== 'function') return [];
    return layout(input, ctx);
  },
});

// ---- tile generators ------------------------------------------------------------------------------------------------

/** The most rects tile.courses@1 returns: 32 rows of at most 16 runs each. */
const COURSE_RUNS = 512;

/**
 * tile.courses@1: stone courses in a tile, the port of engine/tiles.js drawCourses (its joints): rows of stones `heights`
 * px high from the top (the last row of each is the joint under it), upright joints at the columns `joints` lists course
 * after course (`counts` says how many each course has), the four corners of each stone cut when `round` (cobbles), all
 * moved `shift` px down round the tile, every joint wrapping round the tile's 32 px so tiles of it join. Returns flat rects
 * in tile pixels (a fill version's or a face's own pixels: it is never drawn on a node).
 */
export const tileCourses = defineGenerator({
  id: 'tile.courses', v: 1, family: 'tile',
  about: 'Stone courses in a tile (port of engine/tiles.js drawCourses): joint rows, upright joints per course, cut corners for cobbles, wrapping round the tile.',
  args: {
    heights: profile({ about: 'The height of each course in px from the top, adding up to 32 (each one\'s last row is its joint)' }),
    joints: profile({ about: 'The columns of the upright joints, course after course (counts says how many each has; a course with none: 0 in counts)' }),
    counts: profile({ about: 'How many upright joints each course has, in order' }),
    shift: count(0, 31, { default: 0, about: 'How far the whole pattern is moved down, round the tile' }),
    round: flag({ default: false, about: 'Cut the four corners of every stone (cobbles)' }),
    paint: paint({ about: 'The joints\' colour (give a tone: the rects are flat)' }),
  },
  // runs a course can give: its joint row and the rows a wrap splits (h), its upright joints on each row (h * n), its cut corners (4 n)
  cost: (a) => {
    const hs = Array.isArray(a.heights) ? a.heights.slice(0, 32) : [], cs = Array.isArray(a.counts) ? a.counts : [];
    const sum = hs.reduce((t, h, i) => t + Math.max(2, Math.round(Math.abs(h))) * (1 + Math.max(0, Math.round(cs[i] ?? 0))) + 4 * Math.max(1, Math.round(cs[i] ?? 0)), 0);
    return Math.min(COURSE_RUNS, sum);
  },
  run(a) {
    const on = new Uint8Array(TILE * TILE);
    const put = (x, y) => { on[wrapT(y) * TILE + wrapT(x)] = 1; };
    const heights = Array.isArray(a.heights) ? a.heights.slice(0, 32) : [];
    const flat = Array.isArray(a.joints) ? a.joints : [], counts = Array.isArray(a.counts) ? a.counts : [];
    let y0 = wrapT(Math.round(a.shift)), k = 0;
    heights.forEach((hRaw, i) => {
      const h = Math.max(2, Math.round(hRaw)), face = h - 1;
      const n0 = Math.max(0, Math.round(counts[i] ?? 0));
      const xs = [...new Set(flat.slice(k, k + n0).map((x) => wrapT(Math.round(x))))].sort((p, q) => p - q), n = xs.length;
      k += n0;
      for (let x = 0; x < TILE; x++) put(x, y0 + face);
      for (const x of xs) for (let y = 0; y < face; y++) put(x, y0 + y);
      for (let j = 0; j < Math.max(1, n); j++) {
        const s = n ? xs[j] + 1 : 0, w = n ? (xs[(j + 1) % n] - xs[j] - 1 + TILE) % TILE : TILE, end = s + w - 1;
        if (w < 1) continue;
        if (a.round && n && w >= 3 && face >= 3) for (const [x, y] of [[s, y0], [end, y0], [s, y0 + face - 1], [end, y0 + face - 1]]) put(x, y);
      }
      y0 = wrapT(y0 + h);
    });
    const out = [];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE;) {
      if (!on[y * TILE + x]) { x++; continue; }
      let e = x;
      while (e + 1 < TILE && on[y * TILE + e + 1]) e++;
      out.push({ kind: 'rect', at: [x, y], size: [e - x + 1, 1], paint: a.paint, shade: 0 });
      x = e + 1;
    }
    return out;
  },
});
