// Tile rules: what each tile of a tileset is, and what it needs round it, as data a game engine's
// auto-tiling can be set up from (a Rule Tile in Unity, a terrain in Godot's TileSet).
//
// Nothing here decides anything: which tile goes in which cell is decided in engine/tiles.js (classifyTiles,
// pickClip, layoutTiles). This module asks that picker about every arrangement of neighbours and writes the
// answers down as a short list of rules, so the list can never say something the picker does not do
// (tests/unit/download-tiles.test.mjs replays every arrangement through both).
//
//   import { tileRules } from '../engine/tile-rules.js';
//   const t = tileRules(sprite.clips, { view: 'top-down' });
//   t.groups   [{ name: 'path', kind: 'block', use: 'ground', solid: false, tiles: [...], versions: [...],
//                 rules: [{ tile: 'path-cross', needs: { up: true, upRight: false, ... } }, ...],
//                 patterns: [{ tile: 'path-inner-tl', around: { up: true, upRight: true, ..., upLeft: false } }, ...],
//                 decorations: [{ tile: 'path-deco-a', place: 'on' }] }, ...]
//   t.tiles    { 'path-top': { group: 'path', piece: 'top', family: 'edge' }, ... }
//   t.other    ['stairs-down', ...]   tiles the naming scheme does not cover: placed by hand
//
// How to read `rules`: for a cell that holds the group, look at the eight cells round it, go down the list and
// take the first tile whose `needs` all hold. true: that neighbour holds the same group. false: it does not.
// A neighbour that is not listed may be either. A group's `versions` are other pictures of its middle tile:
// wherever a rule gives the middle tile, any of them may be used.
//
// `solid` is true where a group blocks the way. A thin platform is not solid but carries `oneWay: true`: it is
// drawn in the top part of its tile and stood on from above only (a game lets things pass up through it).
//
// How to read `patterns`: the same answer for a tool that has no ordered list and no "may be either" (a terrain in
// Godot matches a tile to its neighbours cell by cell and takes the closest). Each tile a rule picks gets ONE
// complete arrangement, all eight cells said: the fullest one the picker uses it for, counting a corner only when
// the two sides next to it hold the group too (which is all such a tool ever asks about a corner). A rule's `needs`
// must not be used for this: read first-match, the rule of a later tile leaves out what earlier rules already
// settled, so it is only part of the tile's arrangement.
//
// Pure: no canvas, no Node, no state between calls.

import { classifyTiles, pickClip, layoutTiles, pieceOf } from './tiles.js';

/** The eight cells round a cell, in the order the rules name them: [name, dx, dy] with y growing downwards. No arguments: a frozen list. */
export const AROUND = Object.freeze([['up', 0, -1], ['upRight', 1, -1], ['right', 1, 0], ['downRight', 1, 1], ['down', 0, 1], ['downLeft', -1, 1], ['left', -1, 0], ['upLeft', -1, -1]]);

/**
 * The families of the tile naming scheme (docs/style-guide.md, section 6), each with the piece names it covers and one plain sentence a game developer can act on.
 * No arguments: a frozen list of { id, pieces (a test of the piece name), names (how the family is written in a list), words }.
 */
export const TILE_FAMILIES = Object.freeze([
  { id: 'fill', pieces: /^fill$/, names: 'fill', words: 'the middle: the same group on every side' },
  { id: 'variant', pieces: /^fill-[b-z]$/, names: 'fill-b, fill-c, ...', words: 'other versions of the middle. Mix them with "fill" from cell to cell so a large area does not look like a grid' },
  { id: 'edge', pieces: /^(top|bottom|side-l|side-r)$/, names: 'top, bottom, side-l, side-r', words: 'the four edges: the group stops on that side (side-l is its left edge, side-r its right edge)' },
  { id: 'corner', pieces: /^(left|right|bottom-l|bottom-r)$/, names: 'left, right, bottom-l, bottom-r', words: 'the four outside corners. "left" and "right" are the two TOP corners; bottom-l and bottom-r the two bottom ones' },
  { id: 'inner-corner', pieces: /^inner-(tl|tr|bl|br)$/, names: 'inner-tl, inner-tr, inner-bl, inner-br', words: 'inside corners: the group on all four sides, and only the one diagonal cell is not (tl: the cell above left, tr: above right, bl: below left, br: below right)' },
  { id: 'strip', pieces: /^strip-[lmr]$/, names: 'strip-l, strip-m, strip-r', words: 'a strip one tile high: its left end, its middle (repeat it) and its right end' },
  { id: 'column', pieces: /^col-[tmb]$/, names: 'col-t, col-m, col-b', words: 'a column one tile wide: its top, its middle (repeat it) and its bottom' },
  { id: 'single', pieces: /^single$/, names: 'single', words: 'one tile on its own, with none of the group next to it' },
  { id: 'lane', pieces: /^(elbow-(tl|tr|bl|br)|tee-[trbl]|cross)$/, names: 'elbow-*, tee-*, cross', words: 'for a lane one tile wide: a bend (elbow, named for its outside corner), a fork (tee, named for its closed side) and a crossing' },
  { id: 'platform', pieces: /^thin-[lmr]$/, names: 'thin-l, thin-m, thin-r', words: 'a thin platform to stand on: its left end, its middle (repeat it) and its right end' },
  { id: 'slope', pieces: /^slope-(up|down)$/, names: 'slope-up, slope-down', words: 'a slope one tile wide and one tile high: slope-up rises to the right, slope-down falls to the right. Put ground under it and at its high end' },
  { id: 'stack', pieces: /^(cap|mid|foot)$/, names: 'cap, mid, foot', words: 'something that repeats up and down (a ladder, a pillar): its top, its middle (repeat it) and its bottom' },
  { id: 'decoration', pieces: /^deco-[a-z0-9]+$/, names: 'deco-a, deco-b, ...', words: 'decorations: small details to put here and there over or beside the group, never a tile of their own' },
]);

/** The liquid family: how the three piece names read when a group is a liquid (its other pieces are left to whatever holds it). No arguments: a frozen { id, names, words }. */
export const LIQUID_FAMILY = Object.freeze({ id: 'liquid', names: 'top, fill, foot', words: 'a liquid: "top" is its surface (nothing of it in the cell above), "fill" its body, and "foot", when there is one, where a fall lands (nothing of it in the cell below)' });

/**
 * The family of the naming scheme a tile belongs to: an entry of TILE_FAMILIES, or null for a name the scheme does not cover.
 * Arguments: clip (the tile's name, such as 'path-inner-tl').
 */
export function tileFamily(clip) {
  const k = pieceOf(clip);
  if (!k) return null;
  const piece = k.kind === 'thin' ? `thin-${k.piece}` : k.kind === 'slope' ? `slope-${k.piece}` : k.kind === 'deco' ? `deco-${k.piece}` : k.piece;
  return TILE_FAMILIES.find((f) => f.pieces.test(piece)) ?? null;
}

/**
 * Turn "which tile for these neighbours" into a short list of rules: [{ tile, needs: { neighbour: true | false } }], read top to bottom, first match wins.
 * Arguments: keys (the neighbours' names, at most 8); pick(around) (the tile for one arrangement: around is { name: true | false }; return null for none).
 * Every arrangement is asked once. A tile gets one rule when the arrangements it wins can be told from the rest by the neighbours they share; where that is not so, an arrangement gets a rule of its own, so the list is always exact.
 */
export function rulesFrom(keys, pick) {
  const total = 1 << keys.length;
  const around = (m) => Object.fromEntries(keys.map((k, i) => [k, !!(m & (1 << i))]));
  const answer = [];
  const order = [];                                      // tiles in the order they first win, fullest arrangement first
  for (let m = total - 1; m >= 0; m--) {
    answer[m] = pick(around(m)) ?? null;
    if (answer[m] !== null && !order.includes(answer[m])) order.push(answer[m]);
  }
  let left = [];
  for (let m = total - 1; m >= 0; m--) if (answer[m] !== null) left.push(m);
  const rules = [];
  while (left.length) {
    let moved = false;
    for (const tile of order) {
      const own = left.filter((m) => answer[m] === tile);
      if (!own.length) continue;
      let on = total - 1, off = total - 1;               // the neighbours that are there in every one of its arrangements, and the ones that never are
      for (const m of own) { on &= m; off &= ~m; }
      const hit = (m) => (m & on) === on && (m & off) === 0;
      if (!left.every((m) => !hit(m) || answer[m] === tile)) continue;      // the rule would also catch another tile's arrangement: later
      rules.push({ tile, needs: Object.fromEntries(keys.flatMap((k, i) => (on & (1 << i) ? [[k, true]] : off & (1 << i) ? [[k, false]] : []))) });
      left = left.filter((m) => !hit(m));
      moved = true;
    }
    if (!moved) {
      const m = left[0];
      rules.push({ tile: answer[m], needs: around(m) });
      left = left.filter((x) => x !== m);
    }
  }
  return rules;
}

/**
 * Every arrangement of neighbours a map can make when a corner counts only between two sides that are there: a list of { name: true | false }, fullest first. For all eight cells that is the 47 arrangements of a full "blob" tileset.
 * Arguments: keys (the neighbours' names, from AROUND: at most 8). A corner whose two sides are not both among the keys is never counted.
 */
export function meetable(keys) {
  const at = (dx, dy) => AROUND.find(([, x, y]) => x === dx && y === dy)[0];
  const corners = AROUND.filter(([, dx, dy]) => dx && dy).map(([k, dx, dy]) => [k, at(dx, 0), at(0, dy)]);
  const out = [];
  for (let m = (1 << keys.length) - 1; m >= 0; m--) {
    const a = Object.fromEntries(keys.map((k, i) => [k, !!(m & (1 << i))]));
    if (corners.every(([c, s1, s2]) => !a[c] || (a[s1] && a[s2]))) out.push(a);
  }
  return out;
}

/**
 * Turn "which tile for these neighbours" into one complete arrangement for each tile: [{ tile, around: { all eight cells of AROUND: true | false } }], for a tool that matches a tile to its neighbours cell by cell and has no ordered rules (a terrain in Godot).
 * Arguments: keys (the neighbours the picker looks at, from AROUND); pick(around) (the tile for one arrangement, or null for none).
 * A tile's arrangement is the fullest one of meetable(keys) that the picker answers with it, so the picker always gives the tile for its own arrangement; cells the picker does not look at are said as not held. A tile used only where a corner stands without its sides gets the fullest of those instead.
 */
export function patternsFrom(keys, pick) {
  const count = (a) => keys.filter((k) => a[k]).length;
  const best = new Map();
  const offer = (a) => {
    const tile = pick(a) ?? null;
    if (tile !== null && (!best.has(tile) || count(a) > count(best.get(tile)))) best.set(tile, a);
  };
  for (const a of meetable(keys)) offer(a);
  const found = new Set(best.keys());
  for (let m = (1 << keys.length) - 1; m >= 0; m--) {                    // tiles no meetable arrangement gives
    const a = Object.fromEntries(keys.map((k, i) => [k, !!(m & (1 << i))]));
    if (!found.has(pick(a) ?? null)) offer(a);
  }
  return [...best].map(([tile, a]) => ({ tile, around: Object.fromEntries(AROUND.map(([k]) => [k, !!a[k]])) }));
}

/**
 * The first tile of a rule list that fits an arrangement of neighbours, or null: how a game reads the list tileRules() and rulesFrom() make.
 * Arguments: rules ([{ tile, needs }]); around ({ neighbour: true | false }, true where the neighbour holds the same group).
 */
export function applyRules(rules, around) {
  for (const r of rules) if (Object.entries(r.needs).every(([k, v]) => !!around[k] === v)) return r.tile;
  return null;
}

/**
 * Everything a game needs to lay a tileset out by itself: its groups (a ground, a wall, a liquid, a platform, something that stacks), what each tile is, and for each group the rules that pick a tile from its neighbours.
 * Arguments: clips (a sprite's `clips` object, as classifyTiles takes it); opts.view ('side', the default, or 'top-down': it decides which groups block the way).
 * Returns { groups, tiles, other }: see the header of this file. A group's kind is 'block' (ground, wall or hole: `use` says which), 'floor' (a base ground laid under everything, or in a side view a wall behind the action), 'liquid', 'platform', 'slope' or 'stack'; `solid` is true where it blocks the way; a platform is not solid and has `oneWay: true` instead (stood on from above only).
 * Every group has `rules` (ordered, first match wins) and `patterns` (one complete arrangement for each tile the rules pick, in sheet order; empty where the group has no choice to make).
 */
export function tileRules(clips, opts = {}) {
  const view = opts.view === 'top-down' ? 'top-down' : 'side';
  const T = classifyTiles(clips);
  const names = Array.isArray(clips) ? clips.map((c) => (typeof c === 'string' ? c : c.name)) : Object.keys(clips ?? {});
  const inOrder = (list) => [...new Set(list)].sort((a, b) => names.indexOf(a) - names.indexOf(b));
  const groups = [], tiles = {};
  const decorations = (list) => list.map((d) => ({ tile: d.clip, place: d.only ?? d.place }));
  // the two ways of saying one picker: the ordered rules, and one complete arrangement for each tile (in sheet order)
  const both = (keys, pick) => ({ rules: rulesFrom(keys, pick), patterns: patternsFrom(keys, pick).sort((a, b) => names.indexOf(a.tile) - names.indexOf(b.tile)) });
  const note = (group, clip) => { const k = pieceOf(clip), f = tileFamily(clip); tiles[clip] = { group, piece: k ? k.piece : clip, family: f ? f.id : null }; };
  // the tile layoutTiles puts in the middle of a 3 x 3 map: `kind` is a legend word ('liquid', 'thin', 'stack')
  const middle = (kind, prefix, own, around) => {
    const cell = (dx, dy) => (dx === 0 && dy === 0) || around[AROUND.find(([, x, y]) => x === dx && y === dy)?.[0]] ? 'X' : '.';
    const rows = [-1, 0, 1].map((dy) => [-1, 0, 1].map((dx) => cell(dx, dy)).join(''));
    const laid = layoutTiles(rows, T, { view: 'side', legend: { X: `${kind}:${prefix}` } }).tiles.filter((t) => t.col === 1 && t.row === 1 && own.includes(t.clip));
    return laid.length ? laid[laid.length - 1].clip : null;
  };

  for (const f of T.floors) {
    groups.push({ name: f.prefix, kind: 'floor', solid: false, tiles: inOrder(f.fills), versions: inOrder(f.fills), rules: [{ tile: f.fills[0], needs: {} }], patterns: [], decorations: decorations(f.decals) });
    for (const c of f.fills) note(f.prefix, c);
  }
  for (const b of T.blocks) {
    const own = inOrder([...Object.values(b.pieces), ...b.fills]);
    const base = (clip) => (b.fills.includes(clip) ? b.fills[0] : clip);      // every version of the middle counts as the middle
    let picked;
    if (b.liquid) picked = both(['up', 'down'], (a) => { const c = middle('liquid', b.prefix, own, a); return c && base(c); });
    else {
      picked = both(AROUND.map(([k]) => k), (a) => {
        const solid = (x, y) => (x === 0 && y === 0) || !!a[AROUND.find(([, dx, dy]) => dx === x && dy === y)?.[0]];
        const c = pickClip(b, solid, 0, 0);
        return c && base(c);
      });
    }
    const group = { name: b.prefix, kind: b.liquid ? 'liquid' : 'block', ...(b.liquid ? {} : { use: b.kind }), solid: !b.liquid && (view === 'side' || b.kind !== 'ground'), tiles: own, versions: inOrder(b.fills), ...picked, decorations: decorations(b.decals) };
    groups.push(group);
    for (const c of own) { note(b.prefix, c); if (b.liquid) tiles[c].family = LIQUID_FAMILY.id; }
  }
  for (const t of T.thins) {
    const own = inOrder(Object.values(t.pieces));
    // a thin platform is stood on from above only (docs/style-guide.md, section 6): not a wall (`solid`), and marked so that a game can make it one-way
    groups.push({ name: t.prefix, kind: 'platform', solid: false, oneWay: true, tiles: own, versions: [], ...both(['left', 'right'], (a) => middle('thin', t.prefix, own, a)), decorations: [] });
    for (const c of own) note(t.prefix, c);
  }
  for (const s of T.slopes) {
    const own = inOrder([s.up, s.down].filter(Boolean));
    groups.push({ name: s.prefix, kind: 'slope', solid: true, tiles: own, versions: [], rules: [], patterns: [], decorations: [] });
    for (const c of own) note(s.prefix, c);
  }
  const wet = new Set(T.blocks.filter((b) => b.liquid).flatMap((b) => Object.values(b.pieces)));
  for (const s of T.stacks) {
    const own = inOrder(Object.values(s.pieces)).filter((c) => !wet.has(c));          // a liquid's foot belongs to the liquid
    if (!own.length) continue;
    groups.push({ name: s.prefix, kind: 'stack', solid: false, tiles: own, versions: [], ...both(['up', 'down'], (a) => middle('stack', s.prefix, own, a)), decorations: [] });
    for (const c of own) note(s.prefix, c);
  }
  for (const d of T.decals) note(d.prefix, d.clip);
  return { groups, tiles, other: [...T.extras] };
}
