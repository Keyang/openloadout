// PORT (build item T2): the drawing of sprites/tiles-shore.js (frozen at tests/fixtures/code-sprites/tiles-shore.js) for
// the tile.shore@1 generator (engine/gen/tile-ports.js). Word for word the code's, except where it worked a colour out:
// those colours come in as C (stand-in colours engine/gen/tile-ports.js maps back to the paints the asset names: the
// code's own colour rules, written in sprites/tiles-shore.json), and the code's PALETTE.hearthvale leaf, cream, gold and
// cobble (the lily pads and the rock) are C.leaf, C.cream, C.gold and C.cobble. The shore, the lapping water, the lily
// pad and the bridge are engine/water.js's, the streaks of the open water engine/ripples.js's: the code's own helpers.
// A HAND CHANGE note says where it differs. Never change what a released generator version draws through it.
//
//   C: water (the shallows: the colour control), foam, wood (the colour controls); body (engine/water.js waterTones'
//      body: the water a 0.7 step darker), streak (the streaks of light: on the water, waterTones' light, textureLight of
//      body, with Sparkle and textureLight of body from 0.5 without; round the lily pads, waterTones' light), froth (mix
//      of foam and water, 0.5), crest (the foam's flashing stretches with Sparkle: mix of foam and white, 0.7), sand (the
//      bank: raisedGround of the bank's colour); leaf, cream, gold, cobble (the code's fixed colours)
//
// Pure: no DOM, no clock, no randomness; runs the same in Node and the browser.
import { ramp } from '../../color.js';
import { lerp, wave } from '../../motion.js';
import { pieceOf, drawDecal } from '../../tiles.js';
import { rock } from '../../fx.js';
import { drawShore as drawShoreTile, wakeRing, lilyPad, plankBridge } from '../../water.js';
import { rippleVersion } from '../../ripples.js';

// HAND CHANGE: engine/water.js waterTones(p.water, { foam: p.foam }), its tones handed in as paints
// (its dark tone, unused here, is left out); `light` is C.streak, the streaks' colour the asset names for each call
const tonesOf = (C) => ({ body: C.body, shallow: C.water, light: C.streak, foam: C.foam, froth: C.froth });
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


// Everything the framework needs to draw a water tile, from the controls. v: which version of the open water.
function paints(p, t, v, C) {
  const W = tonesOf(C);
  const calm = 1 - p.waves;
  // the streaks: with Sparkle they catch the light (the water's light tone); without it they are a soft swell
  const [seed, share, under] = OPEN[v] ?? [0, 0, false];
  const body = rippleVersion(W.body, t, {
    light: W.light,   // HAND CHANGE: the code's p.sparkle ? W.light : textureLight(W.body, W.body, 0.5), the paint the asset names as streak
    count: Math.round(lerp(4, 8, p.waves) * share), length: lerp(5, 9, p.waves), stir: lerp(1, 4, p.waves), seed, under,
  });
  // the bank: sand a step lighter than its colour (as the meadow's path), its face one step down, the foot of the
  // face and the lip on the side the light does not reach one more
  const sand = ramp(C.sand);
  const bank = (b) => (b.part === 'face' ? (b.under === 0 ? sand.deep : sand.dark) : b.part === 'lip' && b.side === 'e' ? sand.dark : sand.base);
  // the foam line along the north shore: with Sparkle its thick stretches flash white and its thin ends are foam;
  // without it they are foam and foam thinned with water
  const [crest, ends] = p.sparkle ? [C.crest, W.foam] : [W.foam, W.froth];
  const lap = { foam: crest, froth: ends, shallow: W.shallow, reach: Math.round(lerp(1, 3, p.waves)), rows: 2, gaps: lerp(0.2, 0.5, calm) };
  return { W, body, bank, lap, laps: { s: { foam: null, rows: 1 }, e: { foam: W.froth, froth: W.shallow, reach: 1, rows: 1 }, w: { foam: W.froth, froth: W.shallow, reach: 1, rows: 1 } } };
}

// ---- the decals: laid over a tile of open water, see-through round them ------------------------------------

// Two lily pads, a big one in flower and a small one, each bobbing in its own time inside a ring of ripples.
function lilies(g, p, t, C) {
  const W = tonesOf(C);
  const swell = lerp(1, 2, p.waves);
  const up = Math.round(wave(t)), up2 = Math.round(wave(t + 0.4));
  wakeRing(g, { x: 13.5, y: 19, rx: 9, ry: 5, t, grow: swell, colour: W.light, gaps: 0.45, seed: 2 });
  wakeRing(g, { x: 24.5, y: 9, rx: 5, ry: 3, t: t + 0.4, grow: 1, colour: W.light, gaps: 0.5, seed: 5 });
  lilyPad(g, 24.5, 9 + up2, 3.6, 2.4, C.leaf, { notch: 2.4 });
  lilyPad(g, 13.5, 18.5 + up, 7.2, 4.4, C.leaf, { notch: -0.6, flower: C.cream, heart: C.gold });
}
// A rock standing out of the water: the framework's rock, cut level where the water meets it, with foam round its foot.
function boulder(g, p, C) {
  const W = tonesOf(C);
  wakeRing(g, { x: 16, y: 20, rx: 11, ry: 5, t: 0.5, grow: 0, colour: W.shallow, gaps: 0.3, seed: 3 });
  drawDecal(g, (s) => rock(s, { x: 16, y: 15.5, r: 8, squash: 0.8, seed: 4, sides: 9, jag: 0.16, colour: C.cobble, cracks: 2, box: [2, 2, 30, 21] }));
  wakeRing(g, { x: 16, y: 20, rx: 8, ry: 3, t: 0, grow: 0, colour: W.foam, gaps: 0.35, seed: 7, front: true });
}


const BLOCK = ['left', 'top', 'right', 'side-l', 'fill', 'side-r', 'bottom-l', 'bottom', 'bottom-r', 'inner-tl', 'inner-tr', 'inner-bl', 'inner-br',
  'strip-l', 'strip-m', 'strip-r', 'col-t', 'col-m', 'col-b', 'single'];
/** The tiles of the shore, in the code tileset's clip order (its clips' names): what tile.shore@1's `piece` names. */
export const SHORE_PIECES = Object.freeze([
  ...BLOCK.flatMap((k) => (k === 'fill' ? ['fill', 'fill-b', 'fill-c', 'fill-d', 'fill-e', 'fill-f'] : [k])).map((k) => `water-${k}`),
  'bridge-h', 'bridge-v', 'water-deco-a', 'water-deco-b']);

/** Draws one frame of one tile of the shore on a 32 x 32 Surface, as sprites/tiles-shore.js rendered it: clip (a SHORE_PIECES name), t (the clip phase), p (edge, waves, sparkle), C (the colours, see the top). */
export function drawShore(g, { clip, t, p, C }) {
  if (clip === 'bridge-h') return plankBridge(g, 'h', C.wood, { from: 4, to: 28 });
  if (clip === 'bridge-v') return plankBridge(g, 'v', C.wood, { from: 4, to: 27 });
  if (clip === 'water-deco-a') return lilies(g, p, t, C);
  if (clip === 'water-deco-b') return boulder(g, p, C);
  const piece = pieceOf(clip).piece;
  return drawShoreTile(g, piece, shoreOf(p.edge), paints(p, t, versionOf(piece), C), t);
}
