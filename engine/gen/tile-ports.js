// Tile generators of build item T2 (docs/data-sprites.md section 9; the tilesets castle, village, meadow, water and
// shore redrawn as data): family "tile": tile.castle, tile.village.cobbles, tile.village.wood, tile.village.wall (the
// village's 18 colours, a generator's paints being at most 12), tile.meadow, tile.water and tile.shore. Each draws ONE
// TILE of one library tileset exactly as its code drew it, for a
// data tileset (`body.tiles`) whose groups give every piece as a picture naming the generator with that piece:
//
//   "pictures": { "top": [ { "gen": "tile.meadow", "v": 1, "at": [16, 16], "piece": "path-top",
//                            "edge": { "from": "edge", "map": [[3, 3], [7, 7]] }, ..., "grass": "grass", "sand": "sand", ... } ] }
//
// Why these tilesets are drawn by tile generators and not by the tiles layout's material as data (engine/gen/tiles.js):
// their code reads a setting where the material's tables cannot (the meadow and village borders' outline moves by a
// different amount at each column for each Edge, a profile x amount cannot hold that; the castle's moss cushions take
// more than the 16 band rules an edge may have; the shore has six versions of the open water, the layout four; the
// water's surface rises by two waves travelling opposite ways and its foam and waterfall are lanes and billows; the
// fills move with the clip and change at every Texture, Wear and Moss step, which traced stamps cannot hold within the
// 8,192 stamp pixels a sprite may have). So the drawing is ported, as migration batches M2, M3 and M9 ported theirs:
// the code's own drawing (engine/gen/ports/tiles-<id>.js, a copy of the sprite's, calling the same engine/tiles.js
// joins the tiles layout calls) runs with every colour it worked out handed in as a PAINT the asset names, the code's
// colour rule written in the asset (raisedGround, pavingTone, textureTone, stoneShade, mix, ramp ...), never the colour
// it gives at the swatches.
//
// How a paint reaches a pixel: each paint argument (a "role") is given a stand-in colour (SENTINELS, all different, as
// are their ramps' light, dark and deep tones), the code draws one tile with those on a 32 x 32 grid, and every pixel
// is read back as the paint whose stand-in (or a tone of it, or an extra colour a port names) it is: so a pixel takes
// exactly the paint the code gave it, at any colour a person picks. A pixel in a colour no paint gives is an error, so
// a port can never leave a stand-in colour on the screen. The tile comes back as stamps keyed to paint refs.
//
// Pure: no DOM, no clock, no randomness; runs the same in Node and the browser.
import { defineGenerator } from './registry.js';
import { point, share, count, word, flag, paint } from './args.js';
import { Pixels, toneOf, mixOf, workCost } from './pixels.js';
import { fixed } from './port-surface.js';
import { Surface } from '../surface.js';
import { col, ramp, mix, INK, hslToRgb } from '../color.js';
import { drawMeadow, MEADOW_PIECES } from './ports/tiles-meadow.js';
import { drawVillage, VILLAGE_PIECES } from './ports/tiles-village.js';
import { drawCastle, CASTLE_PIECES } from './ports/tiles-castle.js';
import { drawWater, WATER_PIECES } from './ports/tiles-water.js';
import { drawShore, SHORE_PIECES } from './ports/tiles-shore.js';

const TILE = 32;
const TONES = ['light', 'dark', 'deep'];
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/**
 * The stand-in colours a tile port draws with, one per paint argument, in order: mid colours spread round the hue
 * circle whose ramp tones (engine/color.js ramp: light, dark, deep) are all different from each other, from every
 * other stand-in's, from the outline colour and from white. No arguments: a frozen list of '#rrggbb'.
 */
export const SENTINELS = (() => {
  const out = [], seen = new Set([col(INK), col('#ffffff')]);
  for (let i = 0; out.length < 40 && i < 2000; i++) {
    const h = (i * 137.508) % 360, s = 0.45 + 0.3 * ((i * 7) % 5) / 4, l = 0.38 + 0.22 * ((i * 3) % 4) / 3;
    const [r, g, b] = hslToRgb(h, s, l);
    const c = `#${hex2(r)}${hex2(g)}${hex2(b)}`, R = ramp(c);
    const all = [c, R.light, R.dark, R.deep].map(col);
    if (new Set(all).size !== 4 || all.some((v) => seen.has(v))) continue;
    all.forEach((v) => seen.add(v));
    out.push(c);
  }
  return Object.freeze(out);
})();

/**
 * The stand-in colours of a call and the paint each colour reads back as: { C: { role: '#rrggbb' }, back: Map(packed
 * colour -> paint ref) }. Each role (paint argument) gets a SENTINELS colour; it and its ramp's light, dark and deep
 * tones read back as the role's paint and that paint's tones; the outline colour reads back as ink and white as white;
 * `extra(C)` lists more colours a port's code works out from the stand-ins ([['#rrggbb', paint ref], ...], such as a
 * bridge's side face mixed towards the outline colour). Arguments: roles (names), a (the call's arguments), extra.
 */
export function sentinelTable(roles, a, extra) {
  const C = {}, back = new Map();
  const put = (hex, ref) => { const v = col(hex); if (!back.has(v)) back.set(v, ref); };
  roles.forEach((r, i) => {
    const s = SENTINELS[i], R = ramp(s);
    C[r] = s;
    put(s, a[r]);
    for (const t of TONES) put(R[t], toneOf(a[r], t));
  });
  put(INK, 'ink');
  put('#ffffff', fixed('#ffffff'));
  for (const [h, ref] of extra ? extra(C, a) : []) {
    // an extra colour that is a stand-in or a tone already would read back as the wrong paint: never quietly
    if (back.has(col(h))) throw new Error(`an extra colour ${h} of a tile port is a stand-in colour already`);
    put(h, ref);
  }
  return { C, back };
}

/**
 * Runs a port's drawing on a 32 x 32 grid with the call's stand-in colours and reads every pixel back as its paint:
 * the tile as stamps whose top-left corner is 16 px up and left of `at`. Throws naming the colour and the pixel when a
 * pixel is in a colour no paint gives. Arguments: spec (the port: roles, draw, settings, extra), a (the arguments),
 * ctx (the frame: t).
 */
export function drawTilePort(spec, a, ctx) {
  const { C, back } = sentinelTable(spec.roles.map(([r]) => r), a, spec.extra);
  const p = {};
  for (const k of Object.keys(spec.settings)) p[k] = a[k];
  const t = typeof ctx?.t === 'number' && Number.isFinite(ctx.t) ? ctx.t : 0;
  const g = new Surface(TILE, TILE);
  spec.draw(g, { clip: a.piece, t, p, C });
  const x0 = Math.round(a.at[0]) - TILE / 2, y0 = Math.round(a.at[1]) - TILE / 2;
  const out = new Pixels(x0, y0, TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const v = g.data[y * TILE + x];
    if (!(v >>> 24)) continue;
    const ref = back.get(v);
    if (ref === undefined) throw new Error(`${spec.id}: ${a.piece} has a pixel at ${x}, ${y} in a colour no paint gives (#${[v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map(hex2).join('')})`);
    out.set(x0 + x, y0 + y, ref);
  }
  return out.stamps();
}

/**
 * Declares and registers one tile port: { id, about, pieces (the tileset's clip names, its `piece` word), settings
 * (the code's settings as argument types), roles ([[name, about], ...]: the paints, each 'clear' when not given),
 * draw(g, { clip, t, p, C }) (the code's drawing of one tile), extra(C, a) (optional: more colours its code works
 * out, see sentinelTable), units (its heaviest call measured, in cost units of about 0.01 ms) }. Returns the entry.
 */
export function tilePort({ id, about, pieces, settings, roles, draw, extra, units }) {
  const spec = { id, roles, settings, draw, extra };
  return defineGenerator({
    id, v: 1, family: 'tile', about,
    args: {
      at: point({ about: 'The middle of the 32 x 32 tile (its top-left corner is 16 px up and left of it)' }),
      piece: word(pieces, { default: pieces[0], about: 'Which tile: the clip of the same name in the tileset it was ported from' }),
      ...settings,
      ...Object.fromEntries(roles.map(([r, about]) => [r, paint({ default: 'clear', about })])),
    },
    // one 32 x 32 stamp (two when a tile holds more than 62 paints) and the work of drawing the tile, measured
    cost: () => 2 + Math.max(workCost(TILE * TILE * 64), units),
    run: (a, ctx) => drawTilePort(spec, a, ctx),
  });
}

// ---- the tilesets ---------------------------------------------------------------------------------------------------

/** tile.meadow@1: one tile of the meadow (grass, a winding soft-edged path with pebbles, four decals), a port of sprites/tiles-meadow.js. */
export const tileMeadow = tilePort({
  id: 'tile.meadow',
  about: 'One tile of a top-down meadow: grass, a winding path with a soft border and pebbles, tufts, flowers and tall grass (port of the meadow tileset).',
  pieces: MEADOW_PIECES,
  settings: {
    edge: count(3, 7, { default: 5, about: 'How deep the path\'s border is, px' }),
    texture: share({ default: 0.5, about: 'Plain to busy: tufts on the grass, grains on the path' }),
    wear: share({ default: 0.4, about: 'New to worn: ruts and pits in the path' }),
    stones: flag({ default: true, about: 'Pebbles along the path\'s border' }),
  },
  roles: [
    ['grass', 'The grass'], ['blade', 'The grass blades (the code\'s textureTone of the grass)'], ['tip', 'The tips of the blades (textureLight of the grass)'],
    ['path', 'The path\'s colour (its border lines are its dark and deep tones)'], ['sand', 'The path\'s body (raisedGround of the path)'],
    ['grain', 'The grains and ruts in the path (textureTone of its body)'], ['cobble', 'The pebbles\' stone'], ['flowers', 'The flowers'],
  ],
  draw: drawMeadow,
  units: 100,
});

// The village draws with 18 colours in all, and a generator takes at most 12 paints (a sprite's palette holds 12), so
// its three parts are three generators drawing through the one port: the paving, the boards and fences, the wall.
const VILLAGE_SETTINGS = () => ({
  style: word(['round', 'square', 'herringbone'], { default: 'round', about: 'Round cobbles, square flags or herringbone bricks' }),
  edge: count(3, 7, { default: 5, about: 'How deep the paving\'s border reaches, px' }),
  texture: share({ default: 0.5, about: 'Plain to busy: darker stones, glints, grain' }),
  wear: share({ default: 0.35, about: 'New to worn: pits, moss, missing and split stones, scuffs, chips' }),
});
const VILLAGE_BASE = [['stone', 'The stone colour (its tones are the slot\'s: the kerb\'s lines, the wall\'s face lines)'], ['growth', 'The moss']];

/** tile.village.cobbles@1: one tile of the village's paving (soft-edged round cobbles, square flags or herringbone with a kerb of border stones), a port of sprites/tiles-village.js. */
export const tileVillageCobbles = tilePort({
  id: 'tile.village.cobbles',
  about: 'One tile of a top-down village square: round cobbles, square flags or herringbone bricks with a kerb of bigger border stones half sunk in the turf (port of the village tileset).',
  pieces: VILLAGE_PIECES.filter((k) => k.startsWith('cobble-')),
  settings: VILLAGE_SETTINGS(),
  roles: [...VILLAGE_BASE,
    ['body', 'The paving (pavingTone of the stone)'], ['deepJoint', 'Pits and cracks in the paving (textureTone of its body)'],
    ['joint', 'The paving\'s joints (stoneShade of its body towards deepJoint, from 0.55)'], ['darker', 'Darker stones (mix of the body and deepJoint, 0.8)'],
    ['glint', 'Glints on the paving (textureLight of its body)'], ['mossOn', 'Moss lying on the paving (textureTone of the moss against the body)'],
  ],
  draw: drawVillage,
  units: 80,
});

/** tile.village.wood@1: one tile of the village's wooden floor (three versions) or rail fences, a port of sprites/tiles-village.js. */
export const tileVillageWood = tilePort({
  id: 'tile.village.wood',
  about: 'One tile of a top-down village\'s wood: floor boards running left to right with grain, knots and scratches, or a rail fence (port of the village tileset).',
  pieces: VILLAGE_PIECES.filter((k) => k.startsWith('plank-') || k.startsWith('fence-')),
  settings: VILLAGE_SETTINGS(),
  roles: [...VILLAGE_BASE,
    ['wood', 'The wood (the fences\' rails are its tones)'], ['seam', 'The floor\'s seams (textureTone of the wood)'],
    ['fibre', 'The floor\'s grain (stoneShade of the wood towards seam, from 0.55)'], ['sheen', 'The light on a board (textureLight of the wood, from 0.5)'],
  ],
  draw: drawVillage,
  units: 80,
});

/** tile.village.wall@1: one tile of the village's low stone wall (a lit cap of coping slabs, a face of rough stone with moss at its foot), a port of sprites/tiles-village.js. */
export const tileVillageWall = tilePort({
  id: 'tile.village.wall',
  about: 'One tile of a top-down village\'s low stone wall: a lit cap of coping slabs, and a face of rough stone courses with moss at its foot (port of the village tileset).',
  pieces: VILLAGE_PIECES.filter((k) => k.startsWith('wall-')),
  settings: VILLAGE_SETTINGS(),
  roles: [...VILLAGE_BASE,
    ['cap', 'The wall\'s cap (mix of the stone and its light, 0.6)'], ['capJoint', 'The cap\'s joints (textureTone of the cap)'],
    ['capLit', 'The cap\'s lit rim (textureLight of the cap)'], ['capGlint', 'The highlight on the cap\'s slabs: capLit, or the cap itself on a cap brighter than 0.85'],
    ['faceBody', 'The wall\'s face (mix of the stone and its dark, 0.3)'], ['mossFoot', 'The moss at the wall\'s foot (textureTone of the moss against the face)'],
  ],
  draw: drawVillage,
  units: 80,
});

/** tile.castle@1: one tile of the castle (dressed stone in three patterns with a trim course and moss, a ledge on corbels, the back wall, a pillar, a window, a battlement, an archway, two decals), a port of sprites/tiles-castle.js. */
export const tileCastle = tilePort({
  id: 'tile.castle',
  about: 'One tile of side-view castle stone: blocks, cobbles or slabs with a trim course and moss, a ledge on corbels, a brick back wall, a fluted pillar, a window, a battlement and an archway (port of the castle tileset).',
  pieces: CASTLE_PIECES,
  settings: {
    style: word(['blocks', 'cobbles', 'slabs'], { default: 'blocks', about: 'The stone pattern: blocks, cobbles or slabs' }),
    edge: count(3, 9, { default: 5, about: 'How deep the trim course is, px' }),
    texture: share({ default: 0.5, about: 'Plain to busy: lit corners, pits, flutes' }),
    wear: share({ default: 0.3, about: 'New to worn: chipped corners, cracks, nicks, a fallen brick' }),
    overgrowth: share({ default: 0.3, about: 'Clean to overgrown: moss on the top, in the joints and at the foot' }),
  },
  roles: [
    ['stone', 'The stone (its light, dark and deep tones are the slot\'s)'], ['wall', 'The back wall'], ['growth', 'The moss'],
    ['joint', 'The stone\'s joints and cracks (textureTone of the stone)'], ['mortar', 'The back wall\'s mortar (textureTone of the wall)'],
    ['mossOn', 'Moss lying on the stone (textureTone of the moss against the stone)'], ['trim', 'The trim away from the light (mix of the stone and its light, 0.5)'],
    ['lit', 'The stones\' lit corners: the stone\'s light where it is 0.1 brighter than the stone, else the stone'],
    ['frame', 'The window\'s dressed frame (mix of the stone and the back wall, 0.3)'],
  ],
  draw: drawCastle,
  units: 100,
});

/** tile.water@1: one frame of one tile of the side-view pool and waterfall (water, lava or a swamp: a waving surface, a body with moving marks, a waterfall and its foot), a port of sprites/tiles-water.js. */
export const tileWater = tilePort({
  id: 'tile.water',
  about: 'One frame of a side-view pool or waterfall tile: water with crests and foam, lava with crust and bubbles, or a swamp with scum and lily pads; marks that move in the body; streaks falling and billows at the foot (port of the water tileset).',
  pieces: WATER_PIECES,
  settings: {
    liquid: word(['water', 'lava', 'swamp'], { default: 'water', about: 'Water, lava or a swamp' }),
    waves: share({ default: 0.5, about: 'Calm to choppy: how high the surface rises and how far the marks move' }),
    sparkle: flag({ default: true, about: 'Glints flashing in the body' }),
  },
  roles: [
    ['water', 'The liquid'], ['foam', 'The foam, crust glow and glints'], ['lit', 'Light marks in the body (textureLight of the liquid)'],
    ['murk', 'Dark marks in the body (textureTone of the liquid)'], ['froth', 'Foam in the shade (mix of the foam and the liquid, 0.4)'],
    ['leaf', 'The swamp\'s lily pads'], ['cream', 'The lily bud'], ['crimson', 'The lily bud\'s tip'],
  ],
  draw: drawWater,
  units: 120,
});

/** tile.shore@1: one frame of one tile of the top-down water and shore (a pond's sandy bank with lapping foam, open water in six versions, plank bridges, lily pads, a rock), a port of sprites/tiles-shore.js. */
export const tileShore = tilePort({
  id: 'tile.shore',
  about: 'One frame of a top-down water tile: a sandy bank with a face along the north shore and foam lapping at it, open water with streaks of light in six versions, plank bridges, bobbing lily pads and a rock (port of the shore tileset).',
  pieces: SHORE_PIECES,
  settings: {
    edge: count(6, 10, { default: 8, about: 'How wide the bank is, px' }),
    waves: share({ default: 0.5, about: 'Calm to choppy: streaks, foam reach and lily pads\' swell' }),
    sparkle: flag({ default: true, about: 'The streaks catch the light and the foam flashes white' }),
  },
  roles: [
    ['water', 'The shallows (the water\'s colour)'], ['foam', 'The foam'], ['wood', 'The bridges (their side face is the wood\'s dark mixed with the outline colour)'],
    ['body', 'The open water (engine/water.js waterTones: the water a 0.7 step darker)'],
    ['streak', 'Streaks of light: textureLight of the body with Sparkle (and round the lily pads), from 0.5 without'],
    ['froth', 'Foam thinned with water (mix of the foam and the water, 0.5)'], ['crest', 'The foam\'s flashing stretches with Sparkle (mix of the foam and white, 0.7)'],
    ['sand', 'The bank (raisedGround of the bank\'s colour)'], ['leaf', 'The lily pads'], ['cream', 'The lily flower'], ['gold', 'The flower\'s heart'], ['cobble', 'The rock'],
  ],
  draw: drawShore,
  // the bridge's side face: engine/water.js plankBridge mixes the wood's dark with the outline colour, 0.4
  extra: (C, a) => [[mix(ramp(C.wood).dark, INK, 0.4), mixOf(toneOf(a.wood, 'dark'), 'ink', 0.4)]],
  units: 120,
});
