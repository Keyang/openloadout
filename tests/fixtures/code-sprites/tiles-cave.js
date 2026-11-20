// FROZEN COPY, not a sprite: sprites/tiles-cave.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Cave rock tiles: rough rock for caves and the inside of hills, for a side-view level. Built like
// sprites/tiles-forest.js: the rock is described once, as a material, and the tile helper (engine/tiles.js)
// draws every piece of the block and the thin ledge from it, so every piece joins every other.
//
// Where things are (docs/style-guide.md, section 6):
//   rock-left    rock-top    rock-right         thin ledge: rock-thin-l  -thin-m  -thin-r
//   rock-side-l  rock-fill   rock-side-r        back wall:  dark-fill (and -fill-b, -fill-c): the far cave wall, laid
//   rock-bottom-l  -bottom   -bottom-r                      behind the play area; nothing is tested against it but itself
//   inner corners: rock-inner-tl -tr -bl -br    decals:     rock-deco-a stalactites, hang in the empty cell under a bottom tile
//   rock one tile thick: rock-strip-l -m -r,                rock-deco-b stalagmites, stand in the empty cell above a top tile
//   rock-col-t -m -b, rock-single                           rock-deco-c glowing crystals, stand above a top tile too
//   rock-fill-b, rock-fill-c: two more versions of the fill, with other folds and facets; whoever lays out a level
//   mixes the three by position (pickClip in the helper does), so a wall of rock does not show a 32 px grid. The
//   side, bottom and inner-corner pieces have version B or C behind their edge (fillBehind in the helper says
//   which), so a pillar, an underside or a small island, which are nearly all edge pieces, does not repeat one
//   facet every 32 px either
//
// Outside its outline an edge tile is see-through, so it can sit over anything. In a cave that has a back wall, lay
// dark-fill behind the rock's edge tiles too (in the same cells), or the level's backdrop shows in the hollows of
// the broken edges, between the rock and the wall behind it.
//
// The rock is slate, which is dark: its form is carried by the base tone and one lighter tone (the lit facets),
// and the dark tone is kept for creases one pixel wide (style guide, section 3, rule 4). Lit facets and creases
// are drawn in textureLight and textureTone, the nearest tones that no whole-bundle look turns back into plain rock.
import { defineSprite, range, color, toggle } from '../../../engine/sprite.js';
import { ramp, mix, tone } from '../../../engine/color.js';
import { PALETTE, swatches, swatchesBetween } from '../../../engine/palettes.js';
import { polyline } from '../../../engine/surface.js';
import { twinkle } from '../../../engine/fx.js';
import { blockClips, thinClips, decoClips, pieceOf, drawTile, drawDecal, patternFill, lipMarks, fillBehind, textureTone, textureLight } from '../../../engine/tiles.js';

const P = PALETTE.thornwood;

// ---- the outline: how far each edge is pulled in, per position along it, 0..1 (times px from the Edges control) ----
// The helper pins every outline to the tile boundary at both ends of an edge, so each profile starts and ends on 0.
// The top line is level from column 7 to 23: that is where the stalagmites and crystals stand, and it gives a
// hero something flat under its feet however broken the rock is. Either side of that it steps down, by a pixel or two.
const TOP = [0, 0, 0.5, 0.5, 1, 1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 0.5, 0, 0];
// The underside: short points (where it is 0) with hollows between them, and one broad lump from column 8 to 21
// that the stalactites hang from.
const UNDER = [0, 0.33, 0.67, 1, 1, 1, 0.67, 0.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.33, 0.67, 1, 1, 0.67, 0, 0.5, 1, 0.67, 0];
// The two sides, top to bottom: straight but for a few chipped dents.
const WEST = [0, 0, 0, 0, 0.5, 1, 1, 0.5, 0, 0, 0, 0, 0, 0, 0.5, 1, 1, 1, 0.5, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0.5, 0, 0, 0];
const EAST = [0, 0, 0, 0, 0, 0, 1, 1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1, 1, 0.5, 0, 0, 1, 1, 0.5, 0, 0, 0, 0, 0];
// How much shorter the lit rim is at each position (px): its broken inner edge.
const BROKEN = [0, 1, 2, 2, 1, 0, 0, 1, 0, 0, 1, 2, 1, 0, 0, 0, 1, 1, 0, 2, 2, 1, 0, 0, 1, 0, 0, 1, 2, 1, 0, 1];
// Where the rim is wet when Damp is on (columns of its top row), and where water hangs from the underside.
const WET = new Set([4, 5, 10, 11, 12, 13, 20, 21, 26, 27, 28]);
const DRIP = 25;

// ---- the inside: three versions, each two long folds and one large lit plane ---------------------------------
// Folds are creases one pixel wide, drawn only at clean slopes (level, upright, 45 degrees, 1 in 2), so the rock
// breaks in straight angular lines. A fold leaves the tile at one fixed place on each side (row 10 on the left and
// right, column 19 on the top and bottom) in every version, so the folds of neighbouring tiles run on into each
// other, whichever versions meet. No version closes a cell of its own: each joins its four exits in two pairs.
// Version 0 joins left to top and right to bottom; versions 1 and 2 join top to right and left to bottom, along
// different lines. Mixed by position, the folds wander across a wall and enclose faces of every size, so no lump
// repeats every 32 px.
// `lit` planes face the light (top right): [the Texture step (0 to 2) from which it shows, its corners]. Each lies
// flush under a fold on its upper right side and ends in straight edges, so it reads as a face of the rock and not
// as a stone lying on it. The first of each version is always drawn, and the three differ in size and place:
// version 0 a small one in the lower right (about 60 px), version 1 a large one across the lower left (about 255 px),
// version 2 a medium one in the upper right (about 165 px); their middles are 9 px or more apart. Version 2 is the
// one behind the underside (fillBehind), so a cave's ceiling repeats the smaller plane, clear of the rim.
// All planes keep 3 px from the tile's edges. Texture also decides whether the short `extra` creases are drawn
// (from the middle of the slider) and whether creases get their lit lip (at the busy end); `glint` is where the
// rock shines when wet. Version 0 is the plainest, because it is the commonest and lies behind the top row.
const FACETS = [
  {
    creases: [[[0, 10], [1, 10], [7, 13], [19, 1], [19, 0]], [[31, 10], [30, 10], [26, 14], [28, 18], [19, 27], [19, 31]]],
    lit: [[0, [[26, 14], [29, 18], [20, 27], [17, 24], [22, 17]]], [2, [[8, 13], [15, 6], [18, 9], [11, 16]]]],
    extra: [[[8, 18], [12, 22], [12, 26]]],
    glint: [[21, 18], [9, 16]],
  },
  {
    creases: [[[0, 10], [1, 10], [5, 6], [27, 17], [19, 25], [19, 31]], [[19, 0], [19, 1], [26, 8], [30, 10], [31, 10]]],
    lit: [[0, [[7, 7], [28, 18], [19, 27], [18, 28], [3, 20], [3, 15]]], [2, [[20, 3], [26, 9], [26, 13], [20, 10]]]],
    extra: [[[10, 3], [13, 6], [17, 6]]],
    glint: [[11, 13], [22, 10]],
  },
  {
    creases: [[[19, 0], [19, 1], [23, 3], [30, 10], [31, 10]], [[0, 10], [1, 10], [6, 15], [14, 19], [18, 27], [19, 28], [19, 31]]],
    lit: [[0, [[18, 3], [23, 3], [29, 9], [20, 18], [9, 12]]], [2, [[6, 15], [14, 19], [17, 26], [10, 27], [4, 21]]]],
    extra: [[[23, 18], [26, 21], [26, 25]]],
    glint: [[18, 7], [8, 21]],
  },
];
// Cracks, per version: [the Wear step (1 to 3) from which it shows, its points]. Short, steep and kinked.
const CRACKS = [
  [[1, [[23, 4], [25, 7], [24, 10]]], [3, [[4, 20], [6, 23], [5, 26]]]],
  [[1, [[25, 22], [27, 25], [26, 28]]], [2, [[5, 24], [7, 27], [10, 27]]]],
  [[1, [[5, 3], [7, 6], [6, 9]]], [2, [[22, 24], [24, 27], [23, 28]]]],
];

// The tones of the rock, from its one colour.
function tones(p) {
  const r = ramp(p.rock);
  return {
    base: p.rock,
    lit: textureLight(p.rock, p.rock, 0.5),                    // facets that face the light
    crease: textureTone(p.rock),                               // one-pixel creases and cracks
    rim: r.light,                                              // the lit rim of exposed rock
    hi: tone(p.rock, 1.4),                                     // its top row
    shade: mix(p.rock, r.dark, 0.55),                          // undersides and the side away from the light
    wet: mix(r.light, '#ffffff', 0.7),                         // a glint on wet rock
  };
}

// The rock as a material: everything the helper needs to draw any piece of it.
// `behind` is the version that lies behind the edge of an edge piece (fillBehind in the helper picks one per piece):
// the versions share their edge lines, so a wall's sides and underside need not all repeat version 0.
function rock(p, { drips = true, behind = 0 } = {}) {
  const c = tones(p);
  const edge = Math.round(p.edge), jag = p.jagged;
  const busy = Math.round(p.texture * 2), wear = Math.round(p.wear * 3);
  const versions = FACETS.map((f, v) => patternFill(c.base, (s) => {
    for (const [from, pts] of f.lit) if (busy >= from) s.poly(pts, c.lit);
    for (const pts of f.creases) polyline(s, pts, c.crease);
    if (busy >= 1) for (const pts of f.extra) polyline(s, pts, c.crease);
    if (busy >= 2) lipMarks(s, c.crease, c.base, c.lit);       // the rock just below and left of a crease catches the light
    for (const [from, pts] of CRACKS[v]) if (wear >= from) polyline(s, pts, c.crease);
    if (p.damp) for (const [x, y] of f.glint.slice(0, v === 0 ? 1 : 2)) { s.rect(x, y, 3, 1, c.rim); s.dot(x + 2, y, c.wet); }
  }));
  const dent = (table, px) => (u) => Math.round(table[u] * px * jag);
  const broken = (u) => Math.min(Math.round(BROKEN[u] * Math.min(1, jag * 1.5)), Math.max(0, edge - 2));
  // a nick through the rim where the rock has cracked at its edge
  const nick = (u, d) => (wear >= 2 && ((u === 11 && d <= 2) || (u === 12 && d >= 2))) || (wear >= 3 && ((u === 20 && d >= 1) || (u === 21 && d === 1)));
  const underside = dent(UNDER, 3);
  return {
    round: jag > 0.6 ? 2 : 1,
    fill: (x, y, t, v) => versions[v || behind](x, y),
    // The lit rim, `edge` px deep under the ink line. Its top row is the brightest thing in the tile: the line you walk on.
    top: {
      depth: edge,
      inset: dent(TOP, 3),
      ragged: broken,
      paint: (d, u) => (nick(u, d) ? c.crease : d === 1 ? (p.damp && WET.has(u) ? c.wet : c.hi) : c.rim),
    },
    // The light comes from the top right: the right side keeps a thinner rim, the left side is in shade.
    right: { depth: Math.max(1, edge - 2), inset: dent(EAST, 2), ragged: (u) => Math.min(broken(u), Math.max(0, edge - 3)), paint: () => c.rim },
    left: { depth: 1, inset: dent(WEST, 2), paint: () => c.shade },
    // The underside, in shade, with short points.
    bottom: { depth: 2, inset: underside, paint: () => c.shade },
    // Water hanging in one hollow of the underside (only where the Edges control leaves a hollow).
    outside: p.damp && drips ? (x, y) => (x === DRIP && y > 31 - underside(x) ? (y === 31 ? ramp(P.water).light : P.water) : null) : undefined,
  };
}
// A thin ledge has a tidier underside: 12 px leaves no room for points or drips.
const ledgeUnderside = (p) => ({ depth: 1, inset: (u) => Math.min(1, Math.round(UNDER[u] * 3 * p.jagged)), paint: () => tones(p).shade });

// ---- the far cave wall: nearly flat, with a few short kinked strokes where a ledge of it catches no light ------
const BACK = [
  [[[7, 11], [10, 8], [12, 9]], [[20, 21], [23, 24]], [[13, 21], [14, 21]]],
  [[[19, 6], [22, 9]], [[6, 22], [9, 19], [11, 20]], [[25, 18], [26, 18]]],
  [[[11, 17], [15, 14]], [[22, 24], [24, 26], [27, 25]], [[5, 6], [6, 6]]],
];
function back(p) {
  const mark = textureTone(p.shade);
  const n = 1 + Math.round(p.texture * 2);
  const versions = BACK.map((lines) => patternFill(p.shade, (s) => lines.slice(0, n).forEach((pts) => polyline(s, pts, mark))));
  return { ink: null, fill: (x, y, t, v) => versions[v ?? 0](x, y) };
}

// ---- the decals ------------------------------------------------------------------------------------------------
// A spike of rock, row by row from its root: each row is [first column, last column]. `dir` is 1 for one that hangs
// (rows run down from y) and -1 for one that stands (rows run up from y). Lit down its right side, shaded down its left.
function spike(s, y, dir, rows, c) {
  rows.forEach(([a, b], i) => {
    const yy = y + dir * i, w = b - a + 1;
    s.rect(a, yy, w, 1, c.base);
    if (w >= 2) s.rect(b - (w >= 7 ? 1 : 0), yy, w >= 7 ? 2 : 1, 1, c.rim);
    if (w >= 4) s.dot(a, yy, c.shade);
  });
}
const HANGING = [[13, 20], [13, 20], [13, 20], [14, 20], [14, 19], [14, 19], [15, 19], [15, 19], [15, 18], [15, 18], [15, 18], [16, 18], [16, 18], [16, 18], [16, 17], [16, 17], [16, 17], [16, 17], [17, 17], [17, 17], [17, 17]];
const HANGING_SMALL = [[10, 12], [10, 12], [10, 12], [11, 12], [11, 12], [11, 11], [11, 11], [11, 11]];
const STANDING = [[10, 18], [10, 18], [10, 18], [11, 18], [11, 17], [11, 17], [12, 17], [12, 17], [12, 16], [13, 16], [13, 16], [13, 15], [13, 15], [14, 15], [14, 15], [14, 14], [14, 14]];
const STANDING_SMALL = [[19, 21], [19, 21], [19, 21], [19, 20], [20, 20], [20, 20]];

function stalactites(s, p) {
  const c = tones(p);
  spike(s, 0, 1, HANGING_SMALL, c);
  spike(s, 0, 1, HANGING, c);
  s.rect(16, 4, 1, 5, c.crease); s.dot(17, 9, c.crease);       // a crease down the big one
}
function stalagmites(s, p) {
  const c = tones(p);
  spike(s, 31, -1, STANDING_SMALL, c);
  spike(s, 31, -1, STANDING, c);
  s.rect(13, 24, 1, 5, c.crease); s.dot(14, 23, c.crease);
  if (p.damp) { s.dot(14, 16, c.wet); s.rect(15, 20, 1, 2, c.wet); s.dot(20, 27, c.wet); }
}
function crystals(s, p) {
  const c = tones(p), gem = ramp(p.crystal);
  s.poly([[10.5, 31], [9.5, 25], [11.5, 20.5], [13.5, 25], [13.5, 31]], gem, { shade: 1, light: 1 });
  s.poly([[18, 31], [18.5, 24], [20.5, 19.5], [22.5, 24.5], [21.5, 31]], gem, { shade: 1, light: 1 });
  s.poly([[13.5, 31], [13, 18], [15.5, 10.5], [18.5, 18], [18.5, 31]], gem, { shade: 1, light: 1 });
  s.rect(15, 14, 1, 13, gem.light);                                                 // the middle edge of the tall one
  s.rect(10, 29, 12, 3, c.base); s.rect(11, 29, 3, 1, c.rim); s.rect(17, 29, 4, 1, c.rim);            // the rock they grow from
}
// the glow: drawn after the outline, so the light has no ink round it
function crystalGlow(g, p) {
  const gem = ramp(p.crystal);
  twinkle(g, 16, 8, 1, gem.light);
  g.dot(11, 22, '#ffffff'); g.dot(20, 21, '#ffffff'); g.dot(16, 15, '#ffffff'); g.dot(16, 16, '#ffffff');
  g.dot(8, 18, gem.light); g.dot(23, 16, gem.light);
}

export default defineSprite({
  id: 'tiles-cave',
  name: 'Cave rock tiles',
  kind: 'Item',
  blurb: 'Rough faceted rock for caves, with a thin ledge, a dark back wall, stalactites, stalagmites and glowing crystals; change the colours, the lit rim, how jagged, cracked and wet it is.',
  meta: {
    type: 'tileset',
    role: 'world/tile',
    themes: ['fantasy', 'dungeon'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['cave', 'rock', 'stone', 'cavern', 'underground', 'mine', 'stalactite', 'stalagmite', 'crystal', 'ground', 'wall', 'ledge', 'walk', 'dark'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'rock-top',
  params: {
    edge: range('Edge', 3, { min: 3, max: 6, step: 1, lo: 'Thin', hi: 'Deep' }),
    jagged: range('Edges', 0.5, { lo: 'Smooth', hi: 'Jagged' }),
    texture: range('Texture', 0.5, { lo: 'Plain', hi: 'Busy' }),
    wear: range('Wear', 0.3, { lo: 'New', hi: 'Worn' }),
    damp: toggle('Damp', false),
    // moss is in the palette's stone list (for mossy castle stone), but a whole cave of it reads as grass: left out here
    rock: color('Rock', P.slate, swatchesBetween('thornwood', ['stone', 'ground'], { lead: 'slate', min: 0.37, max: 0.7 }).filter((c) => c !== P.moss)),
    shade: color('Back wall', P.cavern, [...swatchesBetween('thornwood', ['cavern', 'ground', 'hair'], { lead: 'cavern', max: 0.365 }), '#3a3350']),
    crystal: color('Crystal', P.magic, swatches('thornwood', 'crystal')),
  },
  clips: {
    ...blockClips('rock', { kind: 'ground', narrow: true, fills: 3 }),
    ...thinClips('rock', { label: 'Rock ledge' }),
    'dark-fill': { frames: 1, fps: 6, loop: true, label: 'Back wall' },
    'dark-fill-b': { frames: 1, fps: 6, loop: true, label: 'Back wall, version B' },
    'dark-fill-c': { frames: 1, fps: 6, loop: true, label: 'Back wall, version C' },
    ...decoClips('rock', [{ place: 'below', label: 'Stalactites' }, { place: 'above', label: 'Stalagmites' }, { place: 'above', label: 'Glowing crystals' }]),
  },
  render(g, { clip, t, p }) {
    const piece = pieceOf(clip);
    if (piece.prefix === 'dark') { drawTile(g, clip, back(p), t); return; }
    // block and ledge pieces all come from the one material
    if (drawTile(g, clip, rock(p, { drips: piece.kind !== 'thin', behind: fillBehind(clip, FACETS.length) }), t, { thickness: 12, bottom: ledgeUnderside(p) })) return;
    // the decals are rock, so they get the block's outline; light and water are drawn after it
    if (clip === 'rock-deco-a') {
      drawDecal(g, (s) => stalactites(s, p));
      if (p.damp) { g.dot(17, 22, P.water); g.dot(17, 23, ramp(P.water).light); g.dot(11, 9, P.water); }
    } else if (clip === 'rock-deco-b') drawDecal(g, (s) => stalagmites(s, p));
    else { drawDecal(g, (s) => crystals(s, p)); crystalGlow(g, p); }
  },
});
