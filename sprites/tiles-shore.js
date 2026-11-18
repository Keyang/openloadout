// Water and shore: ponds, rivers and coast for the Hearthvale map, seen from above and in front (three-quarter
// view). It has no ground of its own: lay it over the grass of `tiles-meadow`. Every water tile has 8 frames.
//
//   water-left  -top  -right         the block `water`, a hole: you cannot walk on it. Outside its outline a tile is
//   water-side-l -fill -side-r       see-through, so the grass under it shows. Inside the outline comes the bank
//   water-bottom-l -bottom -bottom-r (sand: a cap and a face along the north shore, which you look at from the
//   water-inner-tl -tr -bl -br       south; a thin lip elsewhere), an ink line on the waterline, shallow water
//   water-strip-l -m -r              with a foam line that moves out and back, and the deep water with its streaks
//   water-col-t -m -b, water-single  of light. The narrow pieces make a stream one tile wide and a lone pool
//   bridge-h, bridge-v               plank bridges, laid over water tiles; each repeats along its length
//   water-deco-a lily pads (they bob), water-deco-b a rock: laid over a water-fill tile
//
// The shore, the lapping water, the streaks, the lily pad and the bridge are the framework's (engine/water.js),
// and so is the rule that lifts the bank's colour (engine/ground.js); this file says how wide each part of the
// bank is, where the outline wanders and which colours go where.
//
// What to copy for another top-down hole:
//   - the water's body is drawn a step darker than its colour (waterTones): `water` and `meadow` are equally light
//     in the palette, and most whole-bundle looks keep lightness and replace hue. The colour itself is the shallows
//   - the bank is drawn a step lighter than its colour (raisedGround), exactly as the meadow's path is, so a path
//     that runs down to the water meets sand of its own tone
//   - open water carries nothing but its streaks, in a tone of the water itself: every tile of a lake is the same
//     picture, so any mark brighter than that (a glint, a white tip) shows as a grid of dots across the lake.
//     Sparkle therefore works through what is there already: it brightens the streaks and the foam line
//   - the lips run out at every tile corner (THIN is 0 at both ends), and once more along each edge so that those
//     gaps are not the only ones: a stream one tile wide then bends and forks with no bite out of its bank
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { ramp, mix } from '../engine/color.js';
import { lerp, wave } from '../engine/motion.js';
import { PALETTE, swatchesBetween } from '../engine/palettes.js';
import { blockClips, pieceOf, drawDecal, textureLight } from '../engine/tiles.js';
import { rock } from '../engine/fx.js';
import { raisedGround } from '../engine/ground.js';
import { waterTones, rippleFill, drawShore, wakeRing, lilyPad, plankBridge } from '../engine/water.js';

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
// Which arrangement of streaks the open water has. Every tile of a lake shows the same one, so it was picked (of
// 100, by measuring) for being even: on every frame, at every setting of Waves, about the same number of streaks
// show, and no patch of the tile is left bare for the eye to count the tiles by.
const STREAKS = 42;

// Everything the framework needs to draw a water tile, from the controls.
function paints(p, t) {
  const W = waterTones(p.water, { foam: p.foam });
  const calm = 1 - p.waves;
  // the streaks: with Sparkle they catch the light (the water's light tone); without it they are a soft swell
  const body = rippleFill(W.body, t, {
    light: p.sparkle ? W.light : textureLight(W.body, W.body, 0.5),
    count: Math.round(lerp(5, 9, p.waves)), length: lerp(5, 9, p.waves), stir: lerp(1, 4, p.waves), seed: STREAKS,
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

// ---- the decals: laid over a water-fill tile, see-through round them -----------------------------------------

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
    ...blockClips('water', { kind: 'hole', narrow: true, frames: 8, fps: speedOf }),
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
    return drawShore(g, pieceOf(clip).piece, shoreOf(p.edge), paints(p, t), t);
  },
});
