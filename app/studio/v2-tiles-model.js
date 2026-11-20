// The studio's tile editor, its model (build item B19d; docs/data-sprites.md 2.3 and section 6, "Tileset: tile grid
// painter"; Contract 15): pure changes to a tiles body and the small test map a maker paints to see the joins work.
//   - Every field the editor shows has a DOCUMENTED TYPE (GROUP_FIELDS, MATERIAL_FIELDS, EDGE_FIELDS, BAND_FIELDS,
//     DECAL_FIELDS), in the vocabulary of the generators' argument types (engine/gen/args.js: px, count, word, flag,
//     paint ...), so the editor gives each the input its type takes and nothing is ever typed as code.
//   - A group changed by its kind, its piece sets and its fills keeps to what the validator takes (a group that draws
//     no middles has no fills; N fills, N fill versions; a platform names no pieces).
//   - A decal placed on its tile by a click; the tile it is seen on, by its place.
//   - THE TEST MAP: cells painted with a brush (a group of the join rules, a decal, a hand-placed tile). Which tile
//     goes in a cell is picked by the join rules of engine/tile-rules.js (tileRules: the rules a game reads, which that
//     module derives from the picker in engine/tiles.js), the first rule whose needs hold, the fill versions mixed by
//     position as the picker mixes them (fillVariant). tests/unit/studio-v2-tiles.test.mjs checks the result against
//     the picker itself (layoutTiles) on many maps. As tools/tilemap.mjs, the map carries on past its edges as its
//     edge cells, and top-down the first floor lies under every cell.
// Pure: no DOM, no Node, no clock. Runs unchanged in the browser and in the tests.
import { tileRules, AROUND } from '../../engine/tile-rules.js';
import { fillVariant } from '../../engine/tiles.js';
import { TILE_GROUP_PIECES, groupDrawsMiddles, tileClips } from '../../engine/gen/tiles-clips.js';
import { TILE_GROUP_KINDS, TILE_EDGES, DECAL_PLACES, SPRITE_LIMITS as L } from '../../catalog/sprite-schema.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const title = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** How many of each thing a tiles body may hold, read from the validator's limits (catalog/sprite-schema.js SPRITE_LIMITS) so the editor never offers more than it takes. */
export const TILE_LIMITS = Object.freeze({ groups: L.tileGroups, decals: L.decals, extra: L.extraTiles, profiles: L.profiles, profileLength: L.profileLength, bands: L.bandRules, fills: L.fillVersions, frames: L.framesPerClip });

/** The block uses a group may have (engine/tiles.js blockKind): ground stood on, a wall that blocks the way, a hole. */
export const TILE_USES = Object.freeze(['ground', 'wall', 'hole']);

/** The four edges of a material, in the order the editor shows them. */
export const EDGES = Object.freeze([...TILE_EDGES]);

/** A group kind in everyday words. */
export const KIND_WORDS = Object.freeze({ block: 'ground or wall', floor: 'floor', liquid: 'liquid', platform: 'thin platform', slope: 'slopes', stack: 'stacks up and down' });

/** A piece set in everyday words (engine/gen/tiles-clips.js names the tiles each one adds). */
export const PIECE_WORDS = Object.freeze({
  block: 'edges, corners and inside corners (13)', narrow: 'one tile thick: strips, columns, a single (7)', lanes: 'paths one tile wide: bends, forks, a crossing (9)',
  thin: 'a thin platform of it (3)', slope: 'its two slopes', inner: 'inside corners (already in "edges")', cap: 'the top end', mid: 'the middle', foot: 'the bottom end (a liquid: where a fall lands)',
});

const middles = (g) => groupDrawsMiddles({ ...g, name: g.name || 'g' });
const hasThin = (g) => g.kind === 'platform' || (g.kind === 'block' && Array.isArray(g.pieces) && g.pieces.includes('thin'));

/**
 * The fields of a tile group the editor shows, each { key, type, about, lo?, hi?, values?, optional?, when?(group) }:
 * its documented type, the words beside it, and (when) whether it applies to a group of that kind.
 */
export const GROUP_FIELDS = Object.freeze([
  { key: 'name', type: 'name', about: 'The first word of every tile of the group: grass-top, grass-fill' },
  { key: 'kind', type: 'word', values: [...TILE_GROUP_KINDS], about: 'What it is: ground or a wall (block), a floor under everything, a liquid, a thin platform, slopes, or something that stacks (a ladder)' },
  { key: 'use', type: 'word', values: [...TILE_USES], optional: true, about: 'For a game: ground is stood on (top-down: walked over), a wall blocks the way, a hole is fallen into', when: (g) => ['block', 'floor', 'liquid'].includes(g.kind) },
  { key: 'pieces', type: 'pieces', about: 'Which tiles it has: each set adds the tiles a map needs for that shape', when: (g) => piecesOffered(g.kind, g.pieces).length > 0 },
  { key: 'fills', type: 'count', lo: 1, hi: L.fillVersions, optional: true, about: 'How many versions of the middle tile: a large area mixes them so it does not look like a grid', when: (g) => middles(g) },
  { key: 'label', type: 'text', optional: true, about: 'The word before each tile\'s name in lists (default: the group name)' },
  { key: 'frames', type: 'count', lo: 1, hi: L.framesPerClip, optional: true, about: 'Frames of every tile, for an animated tileset (a liquid has 8 unless it says)' },
  { key: 'fps', type: 'number', lo: 1, hi: 60, optional: true, about: 'Frames a second of an animated tileset' },
  { key: 'thickness', type: 'px', lo: 4, hi: 32, optional: true, about: 'How thick a thin platform is, in pixels (default 12)', when: hasThin },
  { key: 'outline', type: 'flag', optional: true, about: 'Whether the pictures drawn by hand are outlined once in ink (default on)', when: (g) => isObj(g.pictures) },
]);

/** The fields of a tile material (data, not a piece), each { key, path, type, about, lo?, hi?, bind? (may a control set it) }. */
export const MATERIAL_FIELDS = Object.freeze([
  { key: 'base', path: ['fill', 'base'], type: 'paint', about: 'The colour the middle is painted' },
  { key: 'ink', path: ['ink'], type: 'paint', optional: true, about: 'The outline\'s colour (default ink; "none" for no outline: a floor laid on a floor)' },
  { key: 'round', path: ['round'], type: 'px', lo: 0, hi: 14, bind: true, optional: true, about: 'How much each outer corner is cut (0 to 3; soft ground: the radius, up to 14)' },
  { key: 'soft', path: ['soft'], type: 'flag', optional: true, about: 'Soft ground: round corners and outlines that wander' },
  { key: 'behind', path: ['behind'], type: 'flag', optional: true, about: 'Edge tiles show a version of the middle behind their edge, not always the first' },
]);

/** The fields of one edge of a material, each { key, type, about, lo?, hi?, bind? }. */
export const EDGE_FIELDS = Object.freeze([
  { key: 'depth', type: 'px', lo: 0, hi: 32, bind: true, about: 'How deep the edge band is, in pixels from the outline' },
  { key: 'wrap', type: 'px', lo: 0, hi: 32, bind: true, optional: true, about: 'How far the band wraps round the sides at an outer corner' },
  { key: 'tuck', type: 'flag', optional: true, about: 'The sides tuck under the band (a grass cap over soil)' },
  { key: 'inset', type: 'profile', optional: true, about: 'The outline dips along the edge by a profile times an amount (bumps)' },
  { key: 'ragged', type: 'profile', optional: true, about: 'The band\'s inner line is ragged by a profile times an amount' },
]);

/** The ways a band rule says its rows (docs/data-sprites.md 2.3 "band rule"), each { id, about }. */
export const BAND_ROWS = Object.freeze([
  { id: 'rows', about: 'rows from and to, counted from the outline (1 is the edge row)' },
  { id: 'last', about: 'the band\'s deepest row: the shadow it casts' },
  { id: 'last-1', about: 'the row above the shadow' },
  { id: 'profile', about: 'rows 1 to a profile\'s value at each column (a run hanging from the edge)' },
]);

/** The fields of a band rule, each { key, type, about, lo?, hi?, values? }; the first rule that matches a pixel paints it. */
export const BAND_FIELDS = Object.freeze([
  { key: 'rows', type: 'word', values: BAND_ROWS.map((r) => r.id), about: 'Which rows of the band it paints' },
  { key: 'from', type: 'count', lo: 1, hi: 99, about: 'The first row it paints (1 is the edge row)' },
  { key: 'to', type: 'count', lo: 1, hi: 99, about: 'The last row it paints (99: to the end of the band)' },
  { key: 'profile', type: 'profile', about: 'The profile whose value at each column is how many rows it paints' },
  { key: 'where', type: 'profile', optional: true, about: 'Only at columns where a profile has one of some values' },
  { key: 'paint', type: 'paint', about: 'The colour it paints ("clear": the fill shows there)' },
]);

/** The fields of a decal, each { key, type, about, values?, lo?, hi? }. */
export const DECAL_FIELDS = Object.freeze([
  { key: 'name', type: 'name', about: 'Its letter: the tile is <group>-deco-<letter>' },
  { key: 'place', type: 'word', values: [...DECAL_PLACES], about: 'Where a game puts it: on the group, above its top, below its bottom, on a wall\'s face, hanging from its rim' },
  { key: 'label', type: 'text', optional: true, about: 'What it is, in a word or two' },
  { key: 'outline', type: 'flag', optional: true, about: 'Outline what it draws in ink' },
  { key: 'frames', type: 'count', lo: 1, hi: L.framesPerClip, optional: true, about: 'Frames, when it moves' },
]);

/** The fields of GROUP_FIELDS that apply to a group (by its kind and pieces). Arguments: group. */
export function fieldsForGroup(group) {
  const g = isObj(group) ? group : {};
  return GROUP_FIELDS.filter((f) => !f.when || f.when(g));
}

/** The piece sets offered for a kind (TILE_GROUP_PIECES; "inner" only when the group already says it, since "block" has it). Arguments: kind, current (the group's pieces). */
export function piecesOffered(kind, current) {
  const all = TILE_GROUP_PIECES[kind] ?? [];
  if (kind === 'platform' || kind === 'slope') return [];         // a platform or slope group names its pieces itself
  return all.filter((p) => p !== 'inner' || (Array.isArray(current) && current.includes('inner')));
}

/** The body.tiles of a definition, or null. Arguments: def. */
export const tilesBody = (def) => (isObj(def?.body?.tiles) ? def.body.tiles : null);

/** The groups of a tiles body (a list, possibly empty). Arguments: def. */
export const groupsOf = (def) => (Array.isArray(tilesBody(def)?.groups) ? tilesBody(def).groups : []);

/** Drops what the group's kind and pieces no longer use: fills where no middles are drawn, thickness without a thin platform. */
function tidy(g) {
  if (!middles(g)) delete g.fills;
  if (!hasThin(g)) delete g.thickness;
  if (Array.isArray(g.pieces) && !g.pieces.length) delete g.pieces;
  return g;
}

/** The group with another kind: piece sets the kind does not take dropped (a stack gets all three), use and fills only where they mean something. Never in place. Arguments: group, kind. */
export function withKind(group, kind) {
  const g = clone(group);
  if (!TILE_GROUP_KINDS.includes(kind)) return g;
  g.kind = kind;
  const allowed = TILE_GROUP_PIECES[kind] ?? [];
  const kept = Array.isArray(g.pieces) ? g.pieces.filter((p) => allowed.includes(p)) : [];
  if (kind === 'platform' || kind === 'slope' || kind === 'floor') delete g.pieces;
  else if (kind === 'stack') g.pieces = kept.length ? kept : ['cap', 'mid', 'foot'];
  else if (kept.length) g.pieces = kept; else delete g.pieces;
  if (!['block', 'floor', 'liquid'].includes(kind)) delete g.use;
  return tidy(g);
}

/** The group with one piece set on or off (the sets it names by default when it names none: a block's "block", a stack's three). Never in place. Arguments: group, piece, on. */
export function withPiece(group, piece, on) {
  const g = clone(group);
  const now = Array.isArray(g.pieces) && g.pieces.length ? [...g.pieces] : g.kind === 'block' ? ['block'] : g.kind === 'stack' ? ['cap', 'mid', 'foot'] : [];
  const next = on ? (now.includes(piece) ? now : [...now, piece]) : now.filter((p) => p !== piece);
  g.pieces = next;
  return tidy(g);
}

/** The group with n fills (1 to TILE_LIMITS.fills), its own material given fill versions up to n (each extra one an empty list: the plain middle until something is drawn on it); none where it draws no middles. Arguments: group, n. */
export function withFills(group, n) {
  const g = clone(group);
  if (!middles(g)) { delete g.fills; return g; }
  const k = clamp(Math.round(fin(n) ? n : 1), 1, L.fillVersions);
  g.fills = k;
  const m = g.material;
  if (isObj(m) && !Object.hasOwn(m, 'use') && isObj(m.fill)) {
    const vs = Array.isArray(m.fill.versions) ? m.fill.versions : [];
    if (vs.length < k) m.fill.versions = [...vs, ...Array.from({ length: k - vs.length }, () => [])];
  }
  return g;
}

/** The palette's first slot id (a starting paint), or 'ink'. */
function firstSlot(def) {
  const s = (Array.isArray(def?.palette) ? def.palette : []).find((x) => isObj(x) && typeof x.id === 'string' && typeof x.default === 'string');
  return s ? s.id : null;
}

/** A group name like `base` no group of the definition has: stone, stone-2 ... */
function freeName(def, base) {
  const taken = new Set(groupsOf(def).map((g) => g?.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

const NEW_NAMES = { block: 'stone', floor: 'floor', liquid: 'water', platform: 'ledge', slope: 'bank', stack: 'ladder' };

/**
 * A new group of a kind that draws and passes the validator in the definition: a free name, a material of the
 * palette's first colour (a fill, a top edge of three bands) or, for a stack, three pictures drawn by hand.
 * Arguments: def, kind.
 */
export function newGroup(def, kind) {
  const k = TILE_GROUP_KINDS.includes(kind) ? kind : 'block';
  const s = firstSlot(def);
  const paint = (tone) => (s ? (tone ? `${s}.${tone}` : s) : 'ink');
  const name = freeName(def, NEW_NAMES[k]);
  const material = { fill: { base: paint() }, edges: { top: { depth: 3, bands: [{ rows: 'last', paint: paint('dark') }, { rows: [1, 1], paint: paint('light') }, { rows: [1, 99], paint: paint() }] } } };
  if (k === 'block') return { name, kind: k, use: 'ground', pieces: ['block'], fills: 1, material };
  if (k === 'floor') return { name, kind: k, fills: 1, material: { ink: 'none', fill: { base: paint() } } };
  if (k === 'liquid') return { name, kind: k, fills: 1, material: { fill: { base: paint() }, liquid: { level: 6, surface: [{ rows: [1, 1], paint: paint('light') }] } } };
  if (k === 'platform' || k === 'slope') return { name, kind: k, material };
  const bar = (at, size) => ({ kind: 'rect', at, size, paint: paint() });
  return { name, kind: 'stack', pieces: ['cap', 'mid', 'foot'], pictures: { cap: [bar([12, 4], [8, 28])], mid: [bar([12, 0], [8, 32])], foot: [bar([12, 0], [8, 28])] } };
}

const GROUP_NAME = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * The definition with group `index` renamed: the clips the definition gives settings of its own and its preview, when
 * they are the group's tiles, follow the new name; null for a name that is not a group name (lowercase letters, digits
 * and dashes, starting with a letter), is taken, or no such group. Never in place. Arguments: def, index, name.
 */
export function renameGroup(def, index, name) {
  const gs = groupsOf(def);
  const g = gs[index];
  if (!isObj(g) || typeof name !== 'string' || !GROUP_NAME.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name)) return null;
  if (gs.some((x, i) => i !== index && x?.name === name)) return null;
  const out = clone(def);
  const old = g.name;
  out.body.tiles.groups[index].name = name;
  if (typeof old === 'string' && old && old !== name) {
    // only the clips this group makes (tileClips of it alone): another group's name may begin with this one's (stone, stone-2)
    const own = new Set(Object.keys(tileClips({ tile: tilesBody(def).tile, groups: [g] })).filter((k) => k.startsWith(`${old}-`)));
    const moved = (k) => (own.has(k) ? `${name}-${k.slice(old.length + 1)}` : k);
    if (isObj(out.clips)) out.clips = Object.fromEntries(Object.entries(out.clips).map(([k, v]) => [moved(k), v]));
    if (typeof out.preview === 'string') out.preview = moved(out.preview);
  }
  return out;
}

/** Which way a band rule says its rows: 'rows', 'last', 'last-1' or 'profile'. Arguments: rule. */
export function bandRowsKind(rule) {
  const r = rule?.rows;
  if (r === 'last' || r === 'last-1') return r;
  if (isObj(r) && Object.hasOwn(r, 'profile')) return 'profile';
  return 'rows';
}

/** The rule with its rows said another way (rows [1, 1]; the first profile), or null when that way needs a profile and there is none. Never in place. Arguments: rule, kind, profiles (the tileset's profile names). */
export function withBandRows(rule, kind, profiles = []) {
  const r = clone(rule);
  if (kind === 'last' || kind === 'last-1') r.rows = kind;
  else if (kind === 'profile') { if (!profiles.length) return null; r.rows = { profile: profiles[0] }; }
  else r.rows = Array.isArray(rule?.rows) ? [...rule.rows] : [1, 1];
  return r;
}

/** A new band rule: the edge row, painted the palette's first colour. Arguments: def. */
export function newBand(def) {
  return { rows: [1, 1], paint: firstSlot(def) ?? 'ink' };
}

/** A new edge: two pixels deep, one band of the palette's first colour. Arguments: def. */
export function newEdge(def) {
  return { depth: 2, bands: [{ rows: [1, 99], paint: firstSlot(def) ?? 'ink' }] };
}

/** A new decal of a group: the first free letter, on the group, a small stamp in the middle of the tile. Arguments: group, def. */
export function newDecal(group, def) {
  const taken = new Set((Array.isArray(group?.decals) ? group.decals : []).map((d) => d?.name));
  const name = [...'abcdefghijklmnopqrstuvwxyz'].find((c) => !taken.has(c)) ?? `d${taken.size}`;
  const s = firstSlot(def);
  return { name, place: 'on', label: `${title(group?.label ?? group?.name ?? 'Tile')}: detail ${name.toUpperCase()}`, outline: false, draw: [{ kind: 'stamp', at: [14, 14], rows: ['.a.', 'aaa'], key: { a: s ? `${s}.dark` : 'ink' } }] };
}

/** The size of a placed item: a stamp's rows, a box's size, else one pixel. */
function itemSize(it) {
  if (it.kind === 'stamp' && Array.isArray(it.rows)) return [Math.max(0, ...it.rows.map((r) => String(r).length)), it.rows.length];
  if (Array.isArray(it.size) && it.size.every(fin)) return it.size;
  return [1, 1];
}

/**
 * The decal with one of its items (index) moved so its top left (a stamp's or a box's; a round's middle) is at pixel
 * x, y of the tile, kept inside the tile; null when that item has no fixed place (an outline, a place bound to a
 * control). Never in place. Arguments: decal, index, x, y, tile (32).
 */
export function placeDecal(decal, index, x, y, tile = 32) {
  const it = decal?.draw?.[index];
  if (!isObj(it) || !Array.isArray(it.at) || it.at.length !== 2 || !it.at.every(fin)) return null;
  const [w, h] = itemSize(it);
  const out = clone(decal);
  out.draw[index].at = [clamp(Math.round(x), 0, Math.max(0, tile - w)), clamp(Math.round(y), 0, Math.max(0, tile - h))];
  return out;
}

/**
 * Where a decal is seen in a map, by its place: { host (the tile it goes with), at (the host's cell), decal (the
 * decal's cell) }, cells in a two-high picture: above the top, under the bottom, else on the tile itself.
 * Arguments: group (its name), place.
 */
export function decalHost(group, place) {
  if (place === 'above') return { host: `${group}-top`, at: [0, 1], decal: [0, 0] };
  if (place === 'below') return { host: `${group}-bottom`, at: [0, 0], decal: [0, 1] };
  if (place === 'rim') return { host: `${group}-top`, at: [0, 0], decal: [0, 0] };
  if (place === 'face') return { host: `${group}-bottom`, at: [0, 0], decal: [0, 0] };
  return { host: `${group}-fill`, at: [0, 0], decal: [0, 0] };
}

// ---- the test map ------------------------------------------------------------------------------------------------

/** The test map's size when it starts (columns, rows). */
export const MAP_SIZE = Object.freeze({ cols: 8, rows: 6 });

/** The largest test map. */
export const MAP_MAX = Object.freeze({ cols: 16, rows: 12 });

const LETTER = { block: '#', platform: '=', slope: '/', stack: '|', liquid: '~', floor: 'F' };
const LAYER = { floor: 0, stack: 1, liquid: 1, ground: 2, slope: 2, hole: 3, wall: 4, platform: 5, decal: 6 };
const DIR = { up: 'up', upRight: 'up-right', right: 'right', downRight: 'down-right', down: 'down', downLeft: 'down-left', left: 'left', upLeft: 'up-left' };
const PLACE_WORDS = { on: 'on the group', above: 'in the empty cell above the group', below: 'in the empty cell under the group', face: 'on a cell of the group', rim: 'on a cell of the group' };

/**
 * The brushes of a tileset: [{ id, type: 'terrain' | 'decal' | 'tile', label, group?, kind?, use?, rules?, versions?,
 * tiles?, place?, tile? }]. Terrain brushes are the groups of the join rules (engine/tile-rules.js tileRules: one for a
 * block, one for its thin platform, one for its slopes ...), then each group's decals, then the tiles placed by hand.
 * Arguments: clips (the sprite's clips: { name: { label, place, block } }), view ('side' or 'top-down').
 */
export function mapBrushes(clips, view = 'side') {
  let t;
  try { t = tileRules(clips ?? {}, { view }); } catch { return []; }
  const out = [];
  const label = (c) => clips?.[c]?.label ?? c;
  for (const g of t.groups) {
    out.push({ id: `${g.kind}:${g.name}`, type: 'terrain', label: `${title(g.name)}, ${g.kind === 'block' && g.use ? g.use : KIND_WORDS[g.kind] ?? g.kind}`, group: g.name, kind: g.kind, use: g.use, rules: g.rules, versions: g.versions, tiles: g.tiles });
  }
  const seen = new Set();
  for (const g of t.groups) for (const d of g.decorations) {
    if (seen.has(d.tile)) continue;
    seen.add(d.tile);
    out.push({ id: `decal:${d.tile}`, type: 'decal', label: label(d.tile), group: g.name, place: d.place ?? 'on', tile: d.tile });
  }
  for (const x of t.other) out.push({ id: `tile:${x}`, type: 'tile', label: label(x), tile: x });
  return out;
}

/** An empty test map: { cols, rows, cells (a brush id or '' a cell, row by row), decals (a decal brush id or '') }, within MAP_MAX. Arguments: cols, rows. */
export function blankMap(cols = MAP_SIZE.cols, rows = MAP_SIZE.rows) {
  const c = clamp(Math.round(fin(cols) ? cols : MAP_SIZE.cols), 1, MAP_MAX.cols), r = clamp(Math.round(fin(rows) ? rows : MAP_SIZE.rows), 1, MAP_MAX.rows);
  return { cols: c, rows: r, cells: Array(c * r).fill(''), decals: Array(c * r).fill('') };
}

/** The map with one cell painted: a terrain or hand-placed brush fills the cell, a decal brush lies over it, '' rubs both out. Outside the map: unchanged. Never in place. Arguments: map, col, row, brush (an id, or '' to rub out). */
export function paintMap(map, col, row, brush) {
  const out = { cols: map.cols, rows: map.rows, cells: [...map.cells], decals: [...(map.decals ?? Array(map.cells.length).fill(''))] };
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= map.cols || row >= map.rows) return out;
  const i = row * map.cols + col;
  if (!brush) { out.cells[i] = ''; out.decals[i] = ''; }
  else if (String(brush).startsWith('decal:')) out.decals[i] = brush;
  else out.cells[i] = brush;
  return out;
}

/**
 * A first map that shows the joins of a tileset's brushes: side view, ground along the bottom with a mound (outer and
 * inside corners), a thin platform, something that stacks, a pool; top-down, a block with a notch and a lone cell; its
 * decals where they go; its first hand-placed tile. Arguments: brushes (mapBrushes), view, cols, rows.
 */
export function starterMap(brushes, view = 'side', cols = MAP_SIZE.cols, rows = MAP_SIZE.rows) {
  let m = blankMap(cols, rows);
  const C = m.cols, R = m.rows;
  const put = (c, r, id) => { if (typeof id === 'string') m = paintMap(m, c, r, id); };   // '' rubs a cell out
  const terrain = (kind, pred = () => true) => brushes.find((b) => b.type === 'terrain' && b.kind === kind && pred(b))?.id;
  const block = terrain('block', (b) => b.use !== 'wall') ?? terrain('block');
  const liquid = terrain('liquid'), platform = terrain('platform'), stack = terrain('stack'), slope = terrain('slope'), floor = terrain('floor');
  if (view === 'top-down') {
    const main = terrain('block', (b) => b.use === 'wall') ?? block;
    for (let r = 1; r <= Math.min(3, R - 1); r++) for (let c = 1; c <= Math.min(5, C - 1); c++) put(c, r, main);
    put(1, 1, '');
    if (R > 4 && C > 6) put(6, 4, main);
    const other = brushes.filter((b) => b.type === 'terrain' && b.kind === 'block' && b.id !== main);
    other.forEach((b, i) => { for (let c = 0; c < 2; c++) put(C - 2 + c, i, b.id); });
    if (floor && !main) for (let c = 0; c < 3; c++) put(c, R - 1, floor);
  } else if (block) {
    for (let r = R - 2; r < R; r++) for (let c = 0; c < C; c++) put(c, r, block);
    for (let c = 2; c <= 4; c++) put(c, R - 3, block);
    put(3, R - 4, block); put(4, R - 4, block);
    if (slope) { put(1, R - 3, slope); }
    if (liquid) { put(6, R - 2, liquid); put(7, R - 2, liquid); }
    if (platform) { put(5, 1, platform); put(6, 1, platform); }
    if (stack) for (let r = 0; r < R - 2; r++) put(C - 1, r, stack);
    if (floor) for (const [c, r] of [[0, 1], [1, 1], [0, 2], [1, 2]]) put(c, r, floor);
  } else {
    if (liquid) for (let r = Math.floor(R / 2); r < R; r++) for (let c = 0; c < C; c++) put(c, r, liquid);
    const others = brushes.filter((b) => b.type === 'terrain' && b.kind === 'liquid' && b.id !== liquid);
    others.forEach((b, i) => { for (let r = 0; r < Math.floor(R / 2); r++) put(1 + i * 2, r, b.id); });
    if (platform) for (let c = 1; c <= 4; c++) put(c, 2, platform);
    brushes.filter((b) => b.type === 'terrain' && b.kind === 'stack').forEach((b, i) => { for (let r = 1; r < R; r++) put(C - 1 - i * 2, r, b.id); });
    if (floor) for (let c = 0; c < C; c++) put(c, R - 1, floor);
  }
  // decals where they go, the first hand-placed tile in an empty cell
  const empty = (c, r) => !m.cells[r * C + c] && !m.decals[r * C + c];
  for (const d of brushes.filter((b) => b.type === 'decal')) {
    const spot = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (decalFits(m, brushes, c, r, d)) spot.push([c, r]);
    const pick = spot.find(([c, r]) => !m.decals[r * C + c] && (c + r) % 2 === 0) ?? spot.find(([c, r]) => !m.decals[r * C + c]);
    if (pick) put(pick[0], pick[1], d.id);
  }
  const tile = brushes.find((b) => b.type === 'tile');
  if (tile) { const at = [[C - 1, 0], [0, 0], [C - 1, R - 1]].find(([c, r]) => empty(c, r)); if (at) put(at[0], at[1], tile.id); }
  return m;
}

/** Does the cell suit a decal brush's place (on its group; above its top; under its bottom)? */
function decalFits(map, brushes, c, r, d) {
  const C = map.cols;
  const group = (cc, rr) => {
    if (cc < 0 || rr < 0 || cc >= C || rr >= map.rows) return false;
    const b = brushes.find((x) => x.id === map.cells[rr * C + cc]);
    return !!b && b.type === 'terrain' && b.group === d.group && b.kind !== 'platform' && b.kind !== 'slope';
  };
  if (d.place === 'above') return !map.cells[r * C + c] && group(c, r + 1);
  if (d.place === 'below') return !map.cells[r * C + c] && group(c, r - 1);
  return group(c, r);
}

/** The rule of a list whose needs all hold for an arrangement (as engine/tile-rules.js applyRules reads it), or null. */
function ruleFor(rules, around) {
  for (const r of rules ?? []) if (Object.entries(r.needs).every(([k, v]) => !!around[k] === v)) return r;
  return null;
}

/**
 * The tiles of a painted map: { tiles: [{ col, row, clip, layer, brush, rule? }], notes }, by layer (a top-down floor
 * 0, stacks and liquids 1, ground and slopes 2, holes 3, walls 4, platforms 5, decals and hand-placed tiles 6). A cell's
 * tile is the first join rule of its brush whose needs hold (`rule`: { tile, needs }, the one that picked it); a
 * middle is mixed with its versions by position (engine/tiles.js fillVariant). Notes say what cannot be placed (a
 * brush the tileset has not got, a decal in a cell its place does not suit). Arguments: map, brushes (mapBrushes), view.
 */
export function layMap(map, brushes, view = 'side') {
  const by = new Map((brushes ?? []).map((b) => [b.id, b]));
  const C = map.cols, R = map.rows;
  const tiles = [], notes = [];
  const note = (t) => { if (!notes.includes(t)) notes.push(t); };
  const idAt = (c, r, keep) => {
    if (keep) { c = clamp(c, 0, C - 1); r = clamp(r, 0, R - 1); }          // the map carries on past its edges as its edge cells
    else if (c < 0 || r < 0 || c >= C || r >= R) return '';
    return map.cells[r * C + c] ?? '';
  };
  const brushAt = (c, r, keep) => by.get(idAt(c, r, keep));
  const joined = (b) => !!b && b.type === 'terrain' && (b.kind === 'block' || b.kind === 'slope');
  const pick = (b, c, r) => {
    let keys, held;
    if (b.kind === 'block') { keys = AROUND.map(([k]) => k); held = (x, y) => { const o = brushAt(x, y, true); return !!o && (o.id === b.id || (o.kind === 'slope' && o.group === b.group)); }; }
    else if (b.kind === 'liquid') { keys = ['up', 'down']; held = (x, y) => idAt(x, y, true) === b.id; }
    else if (b.kind === 'platform') { keys = ['left', 'right']; held = (x, y) => idAt(x, y, false) === b.id || joined(brushAt(x, y, false)); }
    else if (b.kind === 'stack') { keys = ['up', 'down']; held = (x, y) => idAt(x, y, false) === b.id; }
    else keys = [];
    const around = {};
    for (const k of keys) { const [, dx, dy] = AROUND.find(([n]) => n === k); around[k] = held(c + dx, r + dy); }
    const rule = ruleFor(b.rules, around);
    let clip = rule?.tile ?? null;
    if (clip && b.versions?.length > 1 && clip === b.versions[0]) clip = b.versions[fillVariant(c, r, b.versions.length)];
    return { clip, rule };
  };
  const floor = view === 'top-down' ? (brushes ?? []).find((b) => b.type === 'terrain' && b.kind === 'floor') : null;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const i = r * C + c, id = map.cells[i];
    if (floor && id !== floor.id) { const f = pick(floor, c, r); if (f.clip) tiles.push({ col: c, row: r, clip: f.clip, layer: LAYER.floor, brush: floor.id, rule: f.rule }); }
    if (id) {
      const b = by.get(id);
      if (!b) note(`"${id}": the tileset has nothing called that`);
      else if (b.type === 'tile') tiles.push({ col: c, row: r, clip: b.tile, layer: LAYER.decal, brush: id });
      else if (b.kind === 'slope') {
        const up = b.tiles.find((x) => x.endsWith('-slope-up')), down = b.tiles.find((x) => x.endsWith('-slope-down'));
        // no join rule picks a slope (engine/tile-rules.js gives slopes none): it rises towards the ground beside it
        const clip = joined(brushAt(c + 1, r, false)) || !joined(brushAt(c - 1, r, false)) ? up ?? down : down ?? up;
        if (clip) tiles.push({ col: c, row: r, clip, layer: LAYER.slope, brush: id, rule: null });
      } else if (b.type === 'terrain') {
        const { clip, rule } = pick(b, c, r);
        const layer = b.kind === 'block' ? LAYER[b.use] ?? LAYER.ground : LAYER[b.kind] ?? LAYER.ground;
        if (clip) tiles.push({ col: c, row: r, clip, layer, brush: id, rule });
        else note(`${b.label}: no tile fits the cell at ${c},${r}`);
      }
    }
    const did = map.decals?.[i];
    if (did) {
      const d = by.get(did);
      if (!d) note(`"${did}": the tileset has nothing called that`);
      else {
        tiles.push({ col: c, row: r, clip: d.tile, layer: LAYER.decal, brush: did });
        if (!decalFits(map, brushes, c, r, d)) note(`${d.tile} at ${c},${r}: it goes ${PLACE_WORDS[d.place] ?? 'on the group'} (${d.group})`);
      }
    }
  }
  tiles.sort((a, b) => a.layer - b.layer);
  return { tiles, notes };
}

/** A rule's needs in words: "up, left held; up-left empty", or "always (it is the only choice)". Arguments: needs ({ neighbour: true | false }). */
export function ruleWords(needs) {
  const e = Object.entries(isObj(needs) ? needs : {});
  if (!e.length) return 'always (it is the only choice)';
  const held = e.filter(([, v]) => v).map(([k]) => DIR[k] ?? k), open = e.filter(([, v]) => !v).map(([k]) => DIR[k] ?? k);
  return [held.length ? `${held.join(', ')} held` : '', open.length ? `${open.join(', ')} empty` : ''].filter(Boolean).join('; ');
}

/** The map as text, a letter a cell (# block, = platform, / slope, | stack, ~ liquid, F floor, a decal's letter, a hand-placed tile's number, . empty): for tests and for reading. Arguments: map, brushes. */
export function mapText(map, brushes) {
  const by = new Map((brushes ?? []).map((b) => [b.id, b]));
  const tiles = (brushes ?? []).filter((b) => b.type === 'tile');
  const rows = [];
  for (let r = 0; r < map.rows; r++) {
    let s = '';
    for (let c = 0; c < map.cols; c++) {
      const i = r * map.cols + c;
      const d = by.get(map.decals?.[i]);
      const b = by.get(map.cells[i]);
      s += d ? (/-deco-([a-z0-9])/.exec(d.tile)?.[1] ?? '*') : b ? (b.type === 'tile' ? String(tiles.indexOf(b) % 10) : LETTER[b.kind] ?? '?') : map.cells[i] ? '?' : '.';
    }
    rows.push(s);
  }
  return rows.join('\n');
}

// ---- the map following the tileset (a group renamed or given another kind) ---------------------------------------

/**
 * The follow table with a group renamed from `from` to `to` (a kind change is a rename to itself): { old name: the live
 * name } for every name the map may still hold, chains joined (grass → moss → lichen: both lead to lichen), and the
 * live name never a key unless it follows itself. Never in place. Arguments: follow, from, to.
 */
export function followName(follow, from, to) {
  const out = {};
  for (const [k, v] of Object.entries(isObj(follow) ? follow : {})) out[k] = v === from ? to : v;
  if (from !== to) delete out[to];
  out[from] = to;
  return out;
}

/**
 * The map with the cells of followed groups moved to the brushes they are now: a terrain cell "kind:old" whose brush
 * is gone becomes the live group's brush of the same kind, else its first; a decal "decal:old-deco-x" becomes
 * "decal:live-deco-x" when the tileset has it. Cells of groups not followed, and those the tileset still has, stay as
 * they are. Never in place. Arguments: map, brushes (mapBrushes, of the tileset as it is now), follow ({ old: live }).
 */
export function followMap(map, brushes, follow) {
  const ids = new Set((brushes ?? []).map((b) => b.id));
  const f = isObj(follow) ? follow : {};
  const live = (n) => (Object.hasOwn(f, n) ? f[n] : null);
  const cell = (id) => {
    if (!id || ids.has(id)) return id;
    if (id.startsWith('decal:')) {
      const t = id.slice(6), at = t.lastIndexOf('-deco-');
      const to = at > 0 ? live(t.slice(0, at)) : null;
      const next = to ? `decal:${to}${t.slice(at)}` : null;
      return next && ids.has(next) ? next : id;
    }
    const at = id.indexOf(':');
    if (at < 0 || id.startsWith('tile:')) return id;
    const kind = id.slice(0, at), to = live(id.slice(at + 1));
    if (!to) return id;
    const mine = (brushes ?? []).filter((b) => b.type === 'terrain' && b.group === to);
    return (mine.find((b) => b.kind === kind) ?? mine[0])?.id ?? id;
  };
  return { cols: map.cols, rows: map.rows, cells: map.cells.map(cell), decals: (map.decals ?? Array(map.cells.length).fill('')).map(cell) };
}

// ---- profiles ----------------------------------------------------------------------------------------------------

/** How far a profile's numbers may go either way (the validator, catalog/sprite-schema.js, takes -64 to 64). */
export const PROFILE_REACH = 64;

const SCALES = [[0, 3], [0, 8], [0, 16], [0, 32], [0, PROFILE_REACH], [-8, 8], [-32, 32], [-PROFILE_REACH, PROFILE_REACH]];

/**
 * The scales a profile's curve may be drawn at, [lo, hi] each, smallest first, every one holding all its numbers (a
 * list with fractions also 0 to 1 first): a click on the curve sets a column anywhere in the scale picked, so a wider
 * scale reaches past the numbers there now. Arguments: values.
 */
export function profileScales(values) {
  const vs = (Array.isArray(values) ? values : []).filter(fin);
  const ints = vs.every(Number.isInteger);
  const all = ints ? SCALES : [[0, 1], ...SCALES];
  return all.filter(([lo, hi]) => vs.every((v) => v >= lo && v <= hi)).map((s) => [...s]);
}
