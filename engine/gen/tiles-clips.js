// The clips of a tileset, named in one place (docs/data-sprites.md 2.3 and 4.3, build item B15). A data tileset
// (`body.tiles`) does not write its clip list: each group names its pieces by kind and piece sets, and this module
// names the clips exactly as engine/tiles.js names a code tileset's (blockClips, thinClips, slopeClips, decoClips,
// liquidClips), so engine/tiles.js classifyTiles and the picker, engine/tile-rules.js, the quality bar and the
// download read a data tileset as they read a code one. engine/resolve.js (clipNames) and catalog/sprite-schema.js
// (layoutClips) both ask tileClips (the design's "tile.clips generator"), so the names cannot disagree.
//
//   tileClips(body)      -> { '<group>-<piece>': { frames, fps, loop, label, block?, place? }, ... } in the helper's order
//   tileClipNames(body)  -> the same names, in order
//
// What a group names, by its kind (body.tiles.groups[]: { name, kind, use?, pieces?, fills?, label?, frames?, fps?, decals? }):
//   block     pieces (default ["block"]): "block" the 13 pieces of style guide section 6 (inner corners included; "inner"
//             says the same and adds nothing), "narrow" the seven for ground one tile thick, "lanes" the nine for a lane
//             that bends, forks and crosses, "thin" a thin platform of the same material, "slope" its two slopes;
//             fills: 1..4 versions of the middle; use: ground, wall or hole (the block kind the picker reads)
//   floor     only the middle and its versions: '<name>-fill', '-fill-b' ... (what everything else lies on, top-down)
//   liquid    a surface and a body: '<name>-top', '<name>-fill' (and versions); 8 frames unless it says otherwise; pieces
//             ["foot"] adds '<name>-foot', where it lands (a waterfall; drawn from the group's pictures)
//   platform  a thin platform alone: '-thin-l', '-thin-m', '-thin-r'
//   slope     the two slopes alone
//   stack     something that repeats up and down: '-cap', '-mid', '-foot' (pieces: which of them; default all three)
// then the group's decals ('<name>-deco-<letter>', each with its place) and last the tileset's extra tiles.
//
// Pure: no DOM, no Node, no clock. Runs unchanged in the browser and in Node.
import { blockClips, thinClips, slopeClips, decoClips, liquidClips } from '../tiles.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const title = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The piece sets each kind of group may ask for (a block's "inner" is part of "block" and adds nothing). */
export const TILE_GROUP_PIECES = Object.freeze({
  block: Object.freeze(['block', 'narrow', 'lanes', 'thin', 'slope', 'inner']),
  floor: Object.freeze([]), liquid: Object.freeze(['foot']), platform: Object.freeze(['thin']), slope: Object.freeze(['slope']), stack: Object.freeze(['cap', 'mid', 'foot']),
});

/** The three pieces of a stack group, top to bottom. */
export const STACK_PIECES = Object.freeze(['cap', 'mid', 'foot']);

// numbers as a definition holds them (fps a number, frames whole)
const entry = (frames, fps, label, extra = {}) => ({ frames, fps, loop: true, label, ...extra });
const opts = (g) => {
  const o = {};
  if (Number.isInteger(g.frames) && g.frames >= 1) o.frames = g.frames;
  if (fin(g.fps) && g.fps > 0) o.fps = g.fps;
  if (typeof g.label === 'string' && g.label) o.label = g.label;
  return o;
};

/** One group's clips (decals included), in the helper's order. */
function groupClips(g) {
  const out = {};
  if (!isObj(g) || typeof g.name !== 'string' || !g.name) return out;
  const name = g.name, o = opts(g), kind = g.kind;
  const use = ['ground', 'wall', 'hole'].includes(g.use) ? g.use : undefined;
  const sets = Array.isArray(g.pieces) && g.pieces.length ? g.pieces : kind === 'block' ? ['block'] : [];
  const fills = Number.isInteger(g.fills) && g.fills >= 1 ? g.fills : 1;
  const word = o.label ?? title(name);
  if (kind === 'block') {
    if (sets.includes('block') || sets.includes('inner') || sets.includes('narrow') || sets.includes('lanes')) Object.assign(out, blockClips(name, { ...o, kind: use, fills, narrow: sets.includes('narrow'), lanes: sets.includes('lanes') }));
    if (sets.includes('thin')) Object.assign(out, thinClips(name, { frames: o.frames, fps: o.fps }));
    if (sets.includes('slope')) Object.assign(out, slopeClips(name, o));
  } else if (kind === 'floor') {
    const e = (label) => entry(o.frames ?? 1, o.fps ?? 6, label, use ? { block: use } : {});
    out[`${name}-fill`] = e(`${word}: middle`);
    for (let i = 1; i < Math.min(26, fills); i++) out[`${name}-fill-${String.fromCharCode(97 + i)}`] = e(`${word}: middle, version ${String.fromCharCode(65 + i)}`);
  } else if (kind === 'liquid') {
    Object.assign(out, liquidClips(name, { ...o, frames: o.frames ?? 8, fills, kind: use }));
    // a lone '<name>-foot' is where the liquid lands (a waterfall); engine/tiles.js classifyTiles gives it to the liquid
    if (sets.includes('foot')) out[`${name}-foot`] = entry(o.frames ?? 8, o.fps ?? 6, `${word}: foot`);
  } else if (kind === 'platform') {
    Object.assign(out, thinClips(name, o));
  } else if (kind === 'slope') {
    Object.assign(out, slopeClips(name, o));
  } else if (kind === 'stack') {
    const words = { cap: 'top end', mid: 'middle', foot: 'bottom end' };
    for (const p of STACK_PIECES.filter((x) => !sets.length || sets.includes(x))) out[`${name}-${p}`] = entry(o.frames ?? 1, o.fps ?? 6, `${word}: ${words[p]}`);
  }
  const decals = Array.isArray(g.decals) ? g.decals.filter((d) => isObj(d) && typeof d.name === 'string' && d.name) : [];
  if (decals.length) {
    // decoClips names them by position; a data decal names its own letter
    const made = decoClips(name, decals.map((d) => ({ place: d.place ?? 'on', ...(typeof d.label === 'string' ? { label: d.label } : {}) })), { label: o.label });
    decals.forEach((d, i) => {
      const c = made[`${name}-deco-${String.fromCharCode(97 + i)}`];
      const label = typeof d.label === 'string' ? d.label : `${word}: detail ${d.name.toUpperCase()}`;
      out[`${name}-deco-${d.name}`] = { ...c, label, ...(Number.isInteger(d.frames) && d.frames >= 1 ? { frames: d.frames } : {}), ...(o.fps ? { fps: o.fps } : {}) };
    });
  }
  return out;
}

/**
 * The clips of a tiles body, named as engine/tiles.js names a code tileset's: { name: { frames, fps, loop, label,
 * block?, place? } } in the helper's order (each group's pieces, then its decals; then the extra tiles). fps is a
 * number. Never throws; a body it cannot read gives {}. Arguments: body (a definition's body.tiles, checked or not).
 */
export function tileClips(body) {
  const out = {};
  try {
    if (!isObj(body)) return out;
    for (const g of Array.isArray(body.groups) ? body.groups.slice(0, 64) : []) {
      for (const [k, v] of Object.entries(groupClips(g))) if (!Object.hasOwn(out, k)) out[k] = v;
    }
    for (const x of Array.isArray(body.extra) ? body.extra.slice(0, 64) : []) {
      if (!isObj(x) || typeof x.name !== 'string' || !x.name || Object.hasOwn(out, x.name)) continue;
      out[x.name] = entry(1, 6, typeof x.label === 'string' ? x.label : title(x.name));
    }
  } catch { return {}; }
  for (const v of Object.values(out)) if (typeof v.fps === 'function') v.fps = 6;
  return out;
}

/** True when a group draws its middle as clips ('<name>-fill' and its versions): a block of block, narrow or lanes pieces, a floor, a liquid; only such a group's `fills` means anything. Arguments: g (a group, checked or not). */
export function groupDrawsMiddles(g) {
  try { return isObj(g) && typeof g.name === 'string' && !!g.name && Object.hasOwn(groupClips({ ...g, fills: 1, decals: undefined }), `${g.name}-fill`); } catch { return false; }
}

/** The clip names of a tiles body, in order (tileClips' keys). Arguments: body (a definition's body.tiles). */
export function tileClipNames(body) {
  return Object.keys(tileClips(body));
}

// tile.clips is this module's tileClips, a framework function and not a registry entry: the registry holds generators
// that return primitives (each with typed arguments, goldens and a drawing: tests/unit/gen-registry-*.test.mjs), and
// naming clips draws nothing. engine/resolve.js and catalog/sprite-schema.js call tileClips directly.
