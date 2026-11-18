// Meadow and paths: the ground of the Hearthvale map, seen from above. THE WORKED EXAMPLE for top-down ground:
// a floor (grass) that lies under everything, a second ground (a dirt path) laid over it as a block, and floor decals.
//
//   grass-fill, -fill-b, -fill-c    the floor: three versions with different blade marks, and nothing else under
//                                   this prefix (style guide, section 6). Whoever lays out a map mixes them by
//                                   position (fillVariant in engine/tiles.js), so no 32 px grid shows
//   path-left  -top  -right         the path, a block of soft ground (drawSoftBlock): round corners, an outline that
//   path-side-l -fill -side-r       wanders, and grass blades reaching in over its border. Outside its outline it is
//   path-bottom-l -bottom -bottom-r see-through, so the grass under it shows. Laid on the floor, never inked: you can
//   path-inner-tl -tr -bl -br       walk on both
//   path-fill-b, -fill-c            two more versions of the middle
//   path-strip-l -m -r, path-col-t -m -b, path-single     the path one tile wide: a lane, its ends, a round patch.
//                                   A lane turns, forks and crosses itself with these and the corner pieces above
//   grass-deco-a tuft, -b flowers, -c pebbles, -d tall grass     decals, laid over a grass tile
//
// What to copy for another top-down ground:
//   - the floor is drawn at the colour its control gives; the second ground is drawn a whole step lighter (its ramp's
//     light), with marks one step down from that. `meadow` and `path` are equally light in the palette, and most
//     whole-bundle looks keep lightness and replace hue: at their own colours the path would vanish in six looks.
//     A swatch that is light already (wheat, cream) is raised less or not at all, so it does not bleach to white
//   - no ink anywhere. The path's line is its own deep tone under the turf on the two sides the light does not reach
//     (top and right) and its dark tone on the other two: the path lies a little lower than the grass
//   - every outline is on the tile boundary at both ends of each edge (the helper pins it), so a lane one tile wide
//     needs no extra pieces to turn a corner
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { ramp, mix, brightness } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { blockClips, decoClips, pieceOf, drawBlock, drawSoftBlock, bandStone, patternFill, scatter, textureTone, textureLight } from '../engine/tiles.js';

const HV = PALETTE.hearthvale;

// ---- the path's outline -----------------------------------------------------------------------------------
// How far the outline is pulled in at each position along an edge, 0..2 (times a factor that grows with Edge).
// Every row starts and ends on a level stretch: the helper pins outlines to the tile boundary at both ends.
const DIPS = {
  top: [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  bottom: [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
  left: [0, 0, 0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  right: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
};
// Grass that reaches in over the border: [position along the edge, how far in (0..1 of the Edge control)]. The map is
// seen from the south: along the bottom edge the turf stands in front of the path, so its blades are long; along the
// top edge it lies behind the path and only nicks the line; at the sides it bulges in two rows at a time.
const BLADES = {
  top: [[9, 0.3], [10, 0.3], [23, 0.3], [27, 0.2]],
  bottom: [[3, 0.4], [7, 0.9], [8, 0.4], [13, 0.6], [14, 1], [20, 0.7], [25, 0.5], [26, 0.9]],
  left: [[5, 0.4], [6, 0.4], [12, 0.5], [13, 0.3], [24, 0.4], [25, 0.4]],
  right: [[9, 0.4], [10, 0.4], [16, 0.3], [22, 0.5], [23, 0.4]],
};
// Pebbles lying just inside the border, one to an edge: [position along the edge, px along it, px across it].
const PEBBLES = {
  top: [[14, 4, 3]],
  bottom: [[21, 3, 2]],
  left: [[17, 2, 3]],
  right: [[5, 3, 3]],
};
// Where the strip of shade under the turf is two pixels deep instead of one (it starts and ends the same).
const SHADE = [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1];

// ---- marks inside the fills ------------------------------------------------------------------------------
// A grass tuft: blades [column, height]; the top pixel of each is lit, the rest is in the blade tone.
const TUFTS = [
  [[0, 2], [2, 3], [4, 2]],
  [[0, 2], [1, 3]],
  [[0, 1], [2, 2], [3, 3]],
  [[0, 3], [2, 2]],
];
function drawTuft(s, x, y, kind, lit, shade) {
  for (const [dx, h] of TUFTS[kind % TUFTS.length]) {
    if (h > 1) s.rect(x + dx, y - h + 2, 1, h - 1, shade);
    s.dot(x + dx, y - h + 1, lit);
  }
}
// Where the tufts of grass-fill-b and -fill-c stand, [x, y] of each one's foot, and how many of them show at
// Texture low, middle and high (the first so many of the list).
const SPRINKLE = {
  1: { count: [2, 3, 5], at: [[5, 24], [9, 6], [24, 9], [21, 21], [14, 28]] },
  2: { count: [2, 3, 5], at: [[26, 16], [16, 6], [11, 21], [23, 28], [6, 12]] },
};
// A rut: a shallow line worn into the path, 1 px thick, wandering a pixel up and down. It ends inside the tile.
const RUT = [0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 2, 2, 1, 1, 1, 0, 0];

// Everything the helper needs to draw the floor and the path, from the controls.
function materials(p) {
  const blade = textureTone(p.grass), tip = textureLight(p.grass);
  const road = ramp(p.path);
  // the path's body is a step lighter than its colour (its ramp's light), so it stands apart from the grass by value
  // under every look. A colour that is light already is lifted less (wheat) or not at all (cream): a full step would
  // bleach it to lemon or to white
  const raise = Math.min(1, Math.max(0, (0.86 - brightness(p.path)) / 0.2));
  const sand = mix(p.path, road.light, raise), grain = textureTone(sand);
  const stone = ramp(HV.cobble);
  const E = Math.round(p.edge), busy = p.texture, worn = p.wear;

  // the floor, in three versions: a flat green with a few tufts. Version 0 goes in four cells in ten, and any mark in
  // it shows as a dot every 32 px wherever those cells touch: it is bare at every setting.
  // The other two hold the tufts (SPRINKLE, above). With three versions the same one often lies in two or three
  // cells running, so each must look right beside itself: its tufts are spread over the whole tile, about as far from
  // each other as from the next tile's, at no shared row or column, and no tuft of one version lies where a tuft of
  // another does. A stretch of either then reads as sprinkled lawn, not as a stamp, and the bare cells are clearings
  const count = (version) => SPRINKLE[version].count[Math.round(busy * 2)];
  const sprinkle = (version) => (s) => SPRINKLE[version].at.slice(0, count(version)).forEach(([x, y], i) => drawTuft(s, x - 2, y, i + version, tip, blade));
  const floor = [
    patternFill(p.grass),
    patternFill(p.grass, sprinkle(1)),
    patternFill(p.grass, sprinkle(2)),
  ];

  // the path's middle, in three versions: grains of darker sand, and with Wear ruts and small pits
  const grains = Math.round(1 + busy * 4), ruts = Math.round(worn * 3);
  const speck = (s, m, i) => (i % 3 === 0 ? s.rect(m.x, m.y, 2, 1, grain) : s.dot(m.x, m.y, grain));
  const specks = (seed, count) => (s) => scatter(seed, 6, { margin: 5, gap: 7 }).slice(0, count).forEach((m, i) => speck(s, m, i + seed));
  const rut = (s, x, y, len) => RUT.slice(0, len).forEach((dy, i) => s.dot(x + i, y + dy, grain));
  const pit = (s, x, y) => { s.rect(x, y, 3, 1, grain); s.rect(x + 1, y + 1, 3, 1, grain); };
  const middle = [
    patternFill(sand, (s) => { specks(53, Math.max(1, Math.round(grains / 2)))(s); if (ruts >= 2) rut(s, 9, 20, 11); }),      // behind every edge: the plainest
    patternFill(sand, (s) => { specks(61, grains)(s); if (ruts >= 1) { rut(s, 6, 10, 17); rut(s, 10, 22, 13); } if (ruts >= 3) pit(s, 21, 15); }),
    patternFill(sand, (s) => { specks(79, grains)(s); if (ruts >= 1) pit(s, 9, 20); if (ruts >= 2) rut(s, 12, 9, 14); if (ruts >= 3) rut(s, 7, 25, 9); }),
  ];

  // one edge of the path. `shaded`: the turf stands between this edge and the light (top and right)
  const edge = (which, shaded) => {
    const lift = E >= 6 ? 1.5 : E >= 4 ? 1 : 0.5;
    const reach = new Array(32).fill(0);
    for (const [u, k] of BLADES[which]) reach[u] = Math.max(1, Math.round(k * (E - 1)));
    const inset = (u) => Math.round(DIPS[which][u] * lift) + reach[u];
    // the pebbles lie d0 px in from the line; bandStone keeps each one upright and lit from the top right on every edge
    const d0 = Math.min(E, 4);
    const stones = p.stones ? PEBBLES[which].map(([u0, along, across]) => [u0, d0, along, across]) : [];
    return {
      depth: d0 + 3,
      inset,
      paint: (d, u) => bandStone(which, d, u, stones, stone) ?? (shaded ? (d === 1 ? road.deep : d === 2 && SHADE[u] ? road.dark : null) : d === 1 ? road.dark : null),
    };
  };

  return {
    grass: { fill: (x, y, t, v) => floor[v ?? 0](x, y) },
    path: {
      ink: null,                                               // floor on floor: no ink, the band's first pixel is the line
      round: E + 2,
      fill: (x, y, t, v) => middle[v ?? 0](x, y),
      top: edge('top', true), right: edge('right', true), bottom: edge('bottom', false), left: edge('left', false),
    },
  };
}

// ---- the decals: drawn straight on the tile, see-through round them, no outline (they lie on a floor) ------------

function tuft(g, p) {
  const grass = ramp(p.grass), blade = textureTone(p.grass);
  // blades: [column, height]; a low mound of them, the tallest off-centre, tips lit
  for (const [x, h] of [[10, 2], [11, 4], [12, 3], [13, 6], [14, 4], [15, 7], [16, 5], [17, 8], [18, 5], [19, 6], [20, 3], [21, 4], [22, 2]]) {
    g.rect(x, 21 - h, 1, h, x % 3 === 1 ? grass.deep : blade);
    g.dot(x, 21 - h, grass.light);
    if (h >= 6) g.dot(x, 22 - h, grass.light);
  }
  g.rect(11, 21, 11, 1, grass.deep);                           // the dark foot the blades grow from
}
function flowers(g, p) {
  const grass = ramp(p.grass), petal = ramp(p.flowers), blade = textureTone(p.grass);
  // five flowers, each four petals round a light middle, on a short stem with a leaf; the nearer ones are bigger
  for (const [x, y, big] of [[8, 9, 0], [20, 7, 1], [13, 15, 1], [24, 17, 0], [7, 22, 1], [18, 24, 0]]) {
    g.rect(x, y + 1, 1, big ? 4 : 3, blade);
    g.dot(x + 1, y + (big ? 3 : 2), grass.deep);
    if (big) {
      g.rect(x - 1, y - 1, 3, 3, petal.base);
      g.dot(x + 1, y - 1, petal.light); g.dot(x, y - 1, petal.light); g.dot(x - 1, y + 1, petal.dark);
      g.dot(x, y, petal.light);
    } else {
      g.rect(x - 1, y, 3, 1, petal.base); g.rect(x, y - 1, 1, 3, petal.base);
      g.dot(x, y - 1, petal.light); g.dot(x, y, petal.light);
    }
  }
}
function pebbles(g, p) {
  const stone = ramp(HV.cobble), under = textureTone(p.grass);
  // three stones: [x, y, w, h]; lit along the top and the right, dark underneath, on a line of shade in the grass
  for (const [x, y, w, h] of [[7, 10, 7, 5], [18, 15, 6, 4], [10, 20, 4, 3]]) {
    g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, stone, { shade: 1 });
    g.rect(x + 2, y, w - 3, 1, stone.light);
    g.rect(x + 1, y + h, w - 2, 1, under);
  }
}
function tallGrass(g, p) {
  const grass = ramp(p.grass), blade = textureTone(p.grass);
  // a clump that stands up: long blades fanning from one foot, [x at the foot, x at the tip, height]
  for (const [x0, x1, h, lit] of [[13, 7, 11, 0], [14, 11, 15, 1], [15, 14, 18, 0], [16, 17, 20, 1], [17, 20, 16, 0], [18, 23, 13, 1], [19, 26, 9, 0], [12, 5, 7, 1]]) {
    for (let i = 0; i < h; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i * i) / (h * h));
      g.dot(x, 27 - i, i < 3 ? grass.deep : lit ? (i > h - 4 ? grass.light : p.grass) : blade);
    }
  }
  g.rect(11, 27, 9, 1, grass.deep);
}
const DECALS = { 'grass-deco-a': tuft, 'grass-deco-b': flowers, 'grass-deco-c': pebbles, 'grass-deco-d': tallGrass };

export default defineSprite({
  id: 'tiles-meadow',
  name: 'Meadow and paths',
  kind: 'Item',
  blurb: 'Grass and winding dirt paths for a top-down map, with tufts, flowers, pebbles and tall grass; change the colours, how ragged the path border is and how worn the path.',
  meta: {
    type: 'tileset',
    role: 'world/tile',
    themes: ['fantasy', 'forest', 'farm'],
    gameTypes: ['turn-based-rpg', 'top-down-rpg'],
    view: 'top-down',
    words: ['grass', 'meadow', 'field', 'lawn', 'path', 'road', 'trail', 'dirt', 'sand', 'flowers', 'ground', 'walk', 'overworld', 'map'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'path-right',
  params: {
    edge: range('Edge', 5, { min: 3, max: 7, step: 1, lo: 'Thin', hi: 'Deep' }),
    texture: range('Texture', 0.5, { lo: 'Plain', hi: 'Busy' }),
    wear: range('Wear', 0.4, { lo: 'New', hi: 'Worn' }),
    stones: toggle('Pebbles', true),
    grass: color('Grass', HV.meadow, [HV.meadow, HV.leaf, HV.pine, HV.wheat]),
    path: color('Path', HV.path, [HV.path, HV.wheat, HV.cobble, HV.cream]),
    flowers: color('Flowers', HV.roof, swatches('hearthvale', 'trim', { lead: 'roof' })),
  },
  clips: {
    'grass-fill': { frames: 1, fps: 1, loop: true, label: 'Grass' },
    'grass-fill-b': { frames: 1, fps: 1, loop: true, label: 'Grass, version B' },
    'grass-fill-c': { frames: 1, fps: 1, loop: true, label: 'Grass, version C' },
    ...blockClips('path', { kind: 'ground', narrow: true, fills: 3 }),
    ...decoClips('grass', [{ place: 'on', label: 'Grass tuft' }, { place: 'on', label: 'Flowers' }, { place: 'on', label: 'Pebbles' }, { place: 'on', label: 'Tall grass' }]),
  },
  render(g, { clip, t, p }) {
    const k = pieceOf(clip);
    if (k.kind === 'deco') return DECALS[clip](g, p);
    const m = materials(p);
    if (k.prefix === 'grass') return drawBlock(g, k.piece, m.grass, t);
    return drawSoftBlock(g, k.piece, m.path, t);
  },
});
