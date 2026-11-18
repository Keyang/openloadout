// Water and shore: ponds, rivers and coast for the Hearthvale map, seen from above and in front (three-quarter
// view). It has no ground of its own: lay it over the grass of `tiles-meadow`. Every water tile has 8 frames.
//
//   water-left  -top  -right         the block `water`, a hole: you cannot walk on it. Outside its outline a tile is
//   water-side-l -fill -side-r       see-through, so the grass under it shows. Inside the outline comes the bank
//   water-bottom-l -bottom -bottom-r (sand: a cap and a face along the north shore, which you look at from the
//   water-inner-tl -tr -bl -br       south; a thin lip elsewhere), an ink line on the waterline, shallow water
//   water-strip-l -m -r              with a foam line that moves out and back, and the deep water with its streaks
//   water-col-t -m -b, water-single  of light. The narrow pieces make a stream one tile wide and a lone pool
//   water-fill, -fill-b ... -fill-f  the open water, in six versions: still water, and five with streaks of light in
//                                    other places and other numbers. Whoever lays out a map mixes them by position
//                                    (pickClip and fillVariant in engine/tiles.js), so a lake shows no 32 px grid
//   bridge-h, bridge-v               plank bridges, laid over water tiles; each repeats along its length
//   water-deco-a lily pads (they bob), water-deco-b a rock: laid over a tile of open water
//
// The shore, the lapping water, the lily pad and the bridge are the framework's (engine/water.js), the streaks of
// the open water too (engine/ripples.js), and so is the rule that lifts the bank's colour (engine/ground.js); this
// file says how wide each part of the bank is, where the outline wanders, which version of the open water lies where
// and which colours go where.
//
// What to copy for another top-down hole:
//   - the water's body is drawn a step darker than its colour (waterTones): `water` and `meadow` are equally light
//     in the palette, and most whole-bundle looks keep lightness and replace hue. The colour itself is the shallows
//   - the bank is drawn a step lighter than its colour (raisedGround), exactly as the meadow's path is, so a path
//     that runs down to the water meets sand of its own tone
//   - moving water does NOT hide the grid. One fill tile laid in every cell of a lake shows whatever it holds as a
//     lattice, a streak or a glint at the same place every 32 px, and the lattice moves in step. So the open water
//     comes in versions, as a floor does, and the lessons of `tiles-meadow` hold: version 0 lies in four cells in
//     ten, so anything in it shows as a row of marks wherever those cells touch, and it is bare (still water; its
//     eight frames are one picture, which the checker notes); two more versions are too few, since each then lies in
//     three cells in ten and the eye finds its marks again (tried: with three versions, and with four, rows of the
//     same cluster still showed at 2x), so there are five with streaks; and every mark of every version keeps 3 px from the
//     tile's edges on every frame (rippleVersion), so any version joins any other
//   - a straight shore repeats along its length, so the water behind it is the still version; corners and narrow
//     pieces carry streaks (BEHIND, below)
//   - Sparkle works through what is there already: it brightens the streaks and the foam line
//   - the lips run out at every tile corner (THIN is 0 at both ends), and once more along each edge so that those
//     gaps are not the only ones: a stream one tile wide then bends and forks with no bite out of its bank
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { ramp, mix } from '../engine/color.js';
import { lerp, wave } from '../engine/motion.js';
import { PALETTE, swatchesBetween } from '../engine/palettes.js';
import { blockClips, pieceOf, drawDecal, textureLight } from '../engine/tiles.js';
import { rock } from '../engine/fx.js';
import { raisedGround } from '../engine/ground.js';
import { waterTones, drawShore, wakeRing, lilyPad, plankBridge } from '../engine/water.js';
import { rippleVersion } from '../engine/ripples.js';

const HV = PALETTE.hearthvale;
const speedOf = (p) => 6 * lerp(0.65, 1.45, p.speed);
const digits = (s) => [...s].map(Number);

// How far the outline is pulled in along each edge, px. Every row starts and ends on a level stretch. A lone
// column two deep along the bottom is a blade of grass standing in front of the water.
const INSET = {
  top: digits('00001122211000001112211000000000'),
  bottom: digits('00001100210000111000021100010000'),
  left: digits('00000111000011221100000111000000'),
  right: digits('00011100000110000122110000110000'),
};
// How much of its width a lip has along an edge, in halves: h along the south shore, v along the two side shores.
const THIN = {
  h: digits('00122222222100122222222222222100').map((v) => v / 2),
  v: digits('00122222222222222210012222222100').map((v) => v / 2),
};
// The shore's measures for each setting of Edge (made once each: the framework works a piece out once per object).
const SHORES = new Map();
function shoreOf(edge) {
  const E = Math.round(edge);
  if (!SHORES.has(E)) SHORES.set(E, { round: 13, cap: 2, face: E - 2, lip: [E >= 9 ? 3 : 2, E >= 9 ? 2 : 1], thin: THIN, inset: INSET, lap: 5 });
  return SHORES.get(E);
}
// The open water, in six versions: [arrangement, share of the streaks that Waves asks for, a second line under some].
// Version 0 (water-fill) lies in four cells in ten, so it is bare: see the notes at the top. The arrangements of the
// other five were picked together (of 240, by measuring with rippleEvenness): on every frame, at every setting of
// Waves, each shows about the same number of lit pixels; few streaks of two versions share a row (4 of 28 at the
// default); and over a loop every column between the margins is crossed. They differ in how many streaks they
// hold, so a lake has busy patches, quiet patches and still water, and no two neighbours ripple alike.
const OPEN = [null, [151, 1.15, false], [205, 0.8, true], [212, 1, false], [126, 0.65, true], [127, 1, false]];
// Which version lies behind each piece that has a bank. A straight shore (top, bottom, the two sides) repeats along
// its length, so it gets the still water: the foam and the froth are what moves there. A corner stands alone and a
// narrow piece has too little water to show a grid, so those ripple, each with another version, and a pond of four
// tiles or a stream is not left flat.
const BEHIND = {
  left: 1, right: 2, 'bottom-l': 3, 'bottom-r': 5, 'inner-tl': 5, 'inner-tr': 3, 'inner-bl': 2, 'inner-br': 1,
  'strip-l': 2, 'strip-m': 4, 'strip-r': 5, 'col-t': 3, 'col-m': 2, 'col-b': 1, single: 5,
};
const versionOf = (piece) => (/^fill-[b-z]$/.test(piece) ? piece.charCodeAt(5) - 97 : BEHIND[piece] ?? 0);

// The block's clips. Version 0 of the open water says what it is, so nobody takes its flat tile for a fault.
const WATER = blockClips('water', { kind: 'hole', narrow: true, fills: OPEN.length, frames: 8, fps: speedOf });
WATER['water-fill'].label = 'Water: middle, still water';

// Everything the framework needs to draw a water tile, from the controls. v: which version of the open water.
function paints(p, t, v) {
  const W = waterTones(p.water, { foam: p.foam });
  const calm = 1 - p.waves;
  // the streaks: with Sparkle they catch the light (the water's light tone); without it they are a soft swell
  const [seed, share, under] = OPEN[v] ?? [0, 0, false];
  const body = rippleVersion(W.body, t, {
    light: p.sparkle ? W.light : textureLight(W.body, W.body, 0.5),
    count: Math.round(lerp(4, 8, p.waves) * share), length: lerp(5, 9, p.waves), stir: lerp(1, 4, p.waves), seed, under,
  });
  // the bank: sand a step lighter than its colour (as the meadow's path), its face one step down, the foot of the
  // face and the lip on the side the light does not reach one more
  const sand = ramp(raisedGround(p.land));
  const bank = (b) => (b.part === 'face' ? (b.under === 0 ? sand.deep : sand.dark) : b.part === 'lip' && b.side === 'e' ? sand.dark : sand.base);
  // the foam line along the north shore: with Sparkle its thick stretches flash white and its thin ends are foam;
  // without it they are foam and foam thinned with water
  const [crest, ends] = p.sparkle ? [mix(W.foam, '#ffffff', 0.7), W.foam] : [W.foam, W.froth];
  const lap = { foam: crest, froth: ends, shallow: W.shallow, reach: Math.round(lerp(1, 3, p.waves)), rows: 2, gaps: lerp(0.2, 0.5, calm) };
  return { W, body, bank, lap, laps: { s: { foam: null, rows: 1 }, e: { foam: W.froth, froth: W.shallow, reach: 1, rows: 1 }, w: { foam: W.froth, froth: W.shallow, reach: 1, rows: 1 } } };
}

// ---- the decals: laid over a tile of open water, see-through round them ------------------------------------

// Two lily pads, a big one in flower and a small one, each bobbing in its own time inside a ring of ripples.
function lilies(g, p, t) {
  const W = waterTones(p.water, { foam: p.foam });
  const swell = lerp(1, 2, p.waves);
  const up = Math.round(wave(t)), up2 = Math.round(wave(t + 0.4));
  wakeRing(g, { x: 13.5, y: 19, rx: 9, ry: 5, t, grow: swell, colour: W.light, gaps: 0.45, seed: 2 });
  wakeRing(g, { x: 24.5, y: 9, rx: 5, ry: 3, t: t + 0.4, grow: 1, colour: W.light, gaps: 0.5, seed: 5 });
  lilyPad(g, 24.5, 9 + up2, 3.6, 2.4, HV.leaf, { notch: 2.4 });
  lilyPad(g, 13.5, 18.5 + up, 7.2, 4.4, HV.leaf, { notch: -0.6, flower: HV.cream, heart: HV.gold });
}
// A rock standing out of the water: the framework's rock, cut level where the water meets it, with foam round its foot.
function boulder(g, p) {
  const W = waterTones(p.water, { foam: p.foam });
  wakeRing(g, { x: 16, y: 20, rx: 11, ry: 5, t: 0.5, grow: 0, colour: W.shallow, gaps: 0.3, seed: 3 });
  drawDecal(g, (s) => rock(s, { x: 16, y: 15.5, r: 8, squash: 0.8, seed: 4, sides: 9, jag: 0.16, colour: HV.cobble, cracks: 2, box: [2, 2, 30, 21] }));
  wakeRing(g, { x: 16, y: 20, rx: 8, ry: 3, t: 0, grow: 0, colour: W.foam, gaps: 0.35, seed: 7, front: true });
}

export default defineSprite({
  id: 'tiles-shore',
  name: 'Water and shore',
  kind: 'Item',
  blurb: 'Ponds, rivers and coast for a top-down map, with sandy banks, lapping foam, plank bridges, lily pads and a rock; change the colours, the width of the bank, how choppy the water is, the sparkle and the speed.',
  meta: {
    type: 'tileset',
    role: 'world/tile',
    themes: ['fantasy', 'forest'],
    gameTypes: ['turn-based-rpg', 'top-down-rpg'],
    view: 'top-down',
    words: ['water', 'pond', 'lake', 'river', 'stream', 'shore', 'coast', 'bank', 'beach', 'bridge', 'lily pad', 'foam', 'swim', 'overworld'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'water-single',
  params: {
    edge: range('Edge', 8, { min: 6, max: 10, step: 1, lo: 'Thin', hi: 'Deep' }),
    waves: range('Waves', 0.5, { lo: 'Calm', hi: 'Choppy' }),
    sparkle: toggle('Sparkle', true),
    water: color('Water', HV.water, [HV.water, HV.ice, HV.rogue, HV.magic]),
    foam: color('Foam', HV.cream, [HV.cream, HV.sky, HV.steel, HV.thunder]),
    land: color('Bank', HV.path, [HV.path, HV.wheat, HV.cobble, HV.cream]),
    wood: color('Bridge', HV.wood, swatchesBetween('hearthvale', 'wood', { min: 0.4 }).filter((c) => c !== HV.path)),   // no dark wood (the bridge's side face would close up), and not the bank's own colour
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    ...WATER,
    'bridge-h': { frames: 1, fps: 1, loop: true, label: 'Bridge, left to right' },
    'bridge-v': { frames: 1, fps: 1, loop: true, label: 'Bridge, up and down' },
    'water-deco-a': { frames: 8, fps: speedOf, loop: true, label: 'Lily pads', place: 'on' },
    'water-deco-b': { frames: 1, fps: 1, loop: true, label: 'Rock', place: 'on' },
  },
  render(g, { clip, t, p }) {
    if (clip === 'bridge-h') return plankBridge(g, 'h', p.wood, { from: 4, to: 28 });
    if (clip === 'bridge-v') return plankBridge(g, 'v', p.wood, { from: 4, to: 27 });
    if (clip === 'water-deco-a') return lilies(g, p, t);
    if (clip === 'water-deco-b') return boulder(g, p);
    const piece = pieceOf(clip).piece;
    return drawShore(g, piece, shoreOf(p.edge), paints(p, t, versionOf(piece)), t);
  },
});
