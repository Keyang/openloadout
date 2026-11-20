// PORT (build item T2): the drawing of sprites/tiles-water.js (frozen at tests/fixtures/code-sprites/tiles-water.js) for
// the tile.water@1 generator (engine/gen/tile-ports.js). Word for word the code's, except where it worked a colour out:
// those colours come in as C (stand-in colours engine/gen/tile-ports.js maps back to the paints the asset names: the
// code's own colour rules, written in sprites/tiles-water.json), and the code's PALETTE.thornwood leaf, cream and
// crimson (the swamp's lily pads) are C.leaf, C.cream and C.crimson. The liquid is engine/tiles.js drawLiquid and
// liquidMarks, the code's and the tiles layout's own. Never change what a released generator version draws through
// it: a different look is a new version.
//
//   C: water, foam (the colour controls); lit (textureLight of water), murk (textureTone of water), froth (mix of
//      foam and water, 0.4); leaf, cream, crimson (the swamp's lily pads and their bud)
//
// Pure: no DOM, no clock, no randomness; runs the same in Node and the browser.
import { ramp } from '../../color.js';
import { lerp, fract, hash, easeOut, wave, TAU } from '../../motion.js';
import { drawLiquid, liquidLine, liquidMarks, pieceOf } from '../../tiles.js';

const LEVEL = 6;                                               // the row of the waterline when the liquid lies still
const wrap = (v) => ((Math.round(v) % 32) + 32) % 32;

// The tones of the liquid, from its two colours. Marks in the body are drawn in textureLight and textureTone:
// the nearest light and dark tones that no whole-bundle look turns back into the plain body colour.
function tones(p, C) {
  return {
    base: C.water,
    light: C.lit,
    dark: C.murk,
    foam: C.foam,
    froth: C.froth,                                            // foam in the shade of the foam above it
  };
}

// ---- the surface -----------------------------------------------------------------------------------------
// rise(u, t): how far the surface stands above the waterline at column u. Everything in it repeats every 32 px
// and every clip, so the surface joins itself and the loop closes.
const crest = (ph) => (0.5 + 0.5 * Math.sin(TAU * ph)) ** 1.5;
// lava: where its two bubbles swell (the even column of a pair of columns), and when in the clip each is born
const BUBBLES = [{ u: 8, born: 0 }, { u: 22, born: 0.5 }];
const POP = 0.75;                                              // a bubble swells for three quarters of its life, then bursts
function bubble(u, t, big) {
  let h = 0;
  for (const b of BUBBLES) {
    const life = fract(t - b.born), d = Math.abs(u - b.u) / 2;
    if (life < POP) h = Math.max(h, Math.round(big * easeOut(life / POP)) - 0.5 * d * d);
  }
  return Math.max(0, Math.round(h));
}
function riseOf(p) {
  const w = p.waves;
  if (p.liquid === 'lava') {                                   // a slow heave that swells and sinks in place, and bubbles
    const heave = lerp(0, 2, w), big = Math.round(lerp(2, 4, w));
    return (u, t) => Math.round(heave * (0.5 + 0.5 * wave(u / 32 + 0.2)) * (0.5 + 0.5 * wave(t))) + bubble(u, t, big);
  }
  if (p.liquid === 'swamp') {                                  // one long low swell that drifts along
    const swell = lerp(0, 2, w);
    return (u, t) => swell * (0.5 + 0.5 * wave(u / 32 - t));
  }
  const a = lerp(1, 4, w);                                     // water: two crests per tile travel right, a longer one left
  return (u, t) => a * (0.75 * crest(u / 16 - t) + 0.25 * crest(u / 32 + t + 0.3));
}
// lava: where the crust is (1) and where the glow shows through it (0), per column
const CRUST = [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1];
// swamp: where scum floats on the line, per column
const SCUM = [0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0];
// surface(d, x, t, line): the colour d px under the surface line, or null for the body
function surfaceOf(p, c) {
  if (p.liquid === 'lava') {
    const big = Math.round(lerp(2, 4, p.waves));
    return (d, x, t, line) => {
      const dome = bubble((wrap(x + 1) >> 1) << 1, t, big) > 0;
      if (d === 0) return dome ? c.foam : CRUST[x] ? c.dark : fract(t + x / 32) < 0.5 ? c.foam : c.light;   // a bubble's skin; crust; the glow in a gap, pulsing
      if (dome) return line + d <= LEVEL + 1 ? c.light : null;
      return d === 1 || (d === 2 && !CRUST[x]) ? c.light : null;                                              // the glow under the crust
    };
  }
  if (p.liquid === 'swamp') return (d, x) => (d === 0 ? (SCUM[x] ? c.foam : c.light) : d === 1 ? (SCUM[x] ? c.light : c.dark) : null);
  // water: a foam line, two deep on a crest, and the crest itself lit down to just under the waterline
  return (d, x, t, line) => (d === 0 || (d === 1 && LEVEL - line >= 2) ? c.foam : line + d <= LEVEL + 1 ? c.light : null);
}
const surfaceFor = (p, c, body) => ({ level: LEVEL, rise: riseOf(p), surface: surfaceOf(p, c), body });

// ---- the body --------------------------------------------------------------------------------------------
// Three versions per liquid, each a few marks: [kind, tone, x, y, size, when]. The tile helper moves them
// (liquidMarks in engine/tiles.js) and keeps them 3 px or more from the tile's edges on every frame; version 0
// (the one under the surface) keeps clear of the top 9 rows too.
//   dash    a streak `size` px long that slides to and fro (water: light under the surface; swamp: murk)
//   blob    a patch `size` px across that swells and shrinks (lava: the glow between darker crust)
//   bubble  a bubble that rises from row y and bursts (swamp)
const BODY = {
  water: [
    [['dash', 'light', 6, 13, 7, 0], ['dash', 'dark', 18, 11, 5, 0.7], ['dash', 'dark', 8, 23, 6, 0.2], ['dash', 'light', 17, 27, 5, 0.55]],
    [['dash', 'light', 15, 5, 6, 0.15], ['dash', 'light', 6, 21, 8, 0.6], ['dash', 'dark', 5, 11, 5, 0.85], ['dash', 'dark', 20, 15, 6, 0.3], ['dash', 'dark', 17, 26, 4, 0.5]],
    [['dash', 'light', 18, 9, 7, 0.75], ['dash', 'light', 8, 16, 5, 0.25], ['dash', 'light', 16, 25, 6, 0.05], ['dash', 'dark', 6, 6, 5, 0.45], ['dash', 'dark', 21, 20, 5, 0.9]],
  ],
  lava: [
    [['blob', 'light', 9, 14, 5, 0], ['blob', 'light', 22, 23, 4, 0.5], ['dash', 'dark', 17, 11, 6, 0.3], ['dash', 'dark', 6, 22, 5, 0.8], ['dash', 'dark', 14, 27, 4, 0.1]],
    [['blob', 'light', 20, 8, 5, 0.25], ['blob', 'light', 9, 22, 4, 0.75], ['dash', 'dark', 6, 9, 5, 0.6], ['dash', 'dark', 18, 17, 7, 0.05], ['dash', 'dark', 20, 26, 4, 0.4]],
    [['blob', 'light', 12, 9, 4, 0.6], ['blob', 'light', 21, 19, 5, 0.1], ['dash', 'dark', 5, 16, 6, 0.9], ['dash', 'dark', 13, 25, 6, 0.35], ['dash', 'dark', 22, 6, 4, 0.7]],
  ],
  swamp: [
    [['dash', 'dark', 6, 13, 8, 0], ['dash', 'dark', 17, 20, 7, 0.4], ['dash', 'dark', 8, 26, 6, 0.7], ['bubble', 'light', 22, 27, 2, 0.1], ['bubble', 'light', 13, 24, 1, 0.6]],
    [['dash', 'dark', 16, 6, 7, 0.2], ['dash', 'dark', 5, 14, 6, 0.65], ['dash', 'dark', 18, 24, 8, 0.9], ['bubble', 'light', 9, 26, 2, 0.35], ['bubble', 'light', 24, 20, 1, 0.8]],
    [['dash', 'dark', 7, 8, 6, 0.5], ['dash', 'dark', 19, 13, 7, 0.1], ['dash', 'dark', 6, 21, 8, 0.75], ['bubble', 'light', 15, 27, 2, 0.55], ['bubble', 'light', 25, 26, 1, 0]],
  ],
};
// Sparkle: where glints flash in each version of the body, when, and how big they get: [x, y, when, size].
// The version under the surface has one small glint, so a row of surface tiles does not flash in step; the second
// version has a big one and a small one together, the third a small one half a clip later.
const GLINTS = [
  [[22, 19, 0.25, 1]],
  [[10, 9, 0, 2], [22, 23, 0, 1]],
  [[9, 22, 0.5, 1]],
];
// body(x, y, t, v) for one frame: the marks of version v, moved by the helper. One fill per version is made, on first use.
function bodyFor(p, c, t) {
  const made = [], stir = lerp(1, 3, p.waves);                  // how far the marks move: calm to choppy
  return (x, y, tt, v) => (made[v] ??= liquidMarks(c.base, BODY[p.liquid][v], t, { tones: c, stir, glints: p.sparkle ? GLINTS[v] : [], glint: c.foam }))(x, y);
}

// ---- the waterfall ---------------------------------------------------------------------------------------
// The falling water is lanes of streaks. Lanes are 2 to 4 px wide and are counted from column 30, so that one
// lane lies across the tile boundary; each lane's streaks fill 32 px of height and move down a whole number of
// tiles per clip, so the fall joins itself in every direction and the loop closes.
const LANES = [3, 2, 3, 2, 4, 2, 3, 2, 3, 2, 4, 2];
const LANE_OF = (() => { const out = []; LANES.forEach((w, i) => { for (let k = 0; k < w; k++) out.push(i); }); return out; })();
const laneAt = (x) => LANE_OF[wrap(x + 2)];
function fallOf(p, c) {
  const slow = p.liquid !== 'water';
  const foamy = lerp(0.1, 0.45, p.waves);                      // choppy water falls whiter
  const lanes = LANES.map((_, i) => {
    const streaks = [], n = hash(i, 3) < (p.liquid === 'swamp' ? 0.45 : 0.2) ? 0 : hash(i, 4) < 0.5 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const pick = hash(i, 9 + k);
      const tone = p.liquid === 'water' ? (pick < foamy ? c.foam : pick < 0.8 ? c.light : c.dark) : pick < (p.liquid === 'lava' ? 0.5 : 0.65) ? c.dark : c.light;
      streaks.push({ from: Math.floor((hash(i, 1) + k / n) * 32) % 32, len: (slow ? 6 : 8) + Math.floor(hash(i, 5 + k) * 7), tone });
    }
    return { laps: slow ? 1 : 1 + (i % 3 ? 1 : 0), streaks };
  });
  return (x, y, t) => {
    const lane = lanes[laneAt(x)], yy = wrap(y - lane.laps * 32 * t);
    for (const s of lane.streaks) if (wrap(yy - s.from) < s.len) return s.tone;
    return c.base;
  };
}
// How far under the lip each lane's streaks begin (px): the water tips over unevenly.
const LIP = LANES.map((_, i) => 3 + Math.floor(hash(i, 21) * 4));

// The foot: billows of foam on the waterline, a big one and a smaller one by turns, each swelling in its own time.
// A billow stands on the waterline and never rises above row CROWN: the two rows over it are always falling water,
// so the streaks of the fall-fill tile above run on into this one with no step in brightness at the join.
// billow(x): the first row of foam in column x, and how far x is from the middle of the billow it belongs to.
const CROWN = 2;
function drawFoot(g, p, c, t, fall, body) {
  const swell = lerp(0.6, 1.6, p.waves);
  const billow = (x) => {
    let y = 31, off = 0;
    for (let k = -1; k <= 4; k++) {
      const n = (k + 4) % 4, dx = x - (4 + 8 * k), r = n % 2 ? 4 : 5;
      const high = (n % 2 ? 2.4 : 3) - swell * wave(t + n * 0.31);          // how far its crown stands above the waterline
      const top = LEVEL - high * Math.sqrt(Math.max(0, 1 - (dx * dx) / (r * r)));
      if (Math.abs(dx) <= r && top < y) { y = top; off = dx; }
    }
    return { top: Math.min(LEVEL + 1, Math.max(CROWN, Math.round(y))), off };
  };
  const fringe = (x) => LEVEL + 2 + Math.round(1 + wave(x / 16 + t));       // the last row of foam: 7 to 9
  for (let x = 0; x < 32; x++) {
    const { top, off } = billow(x), end = fringe(x);
    for (let y = 0; y < 32; y++) {
      let colour;
      if (y < top) colour = fall(x, y, t);
      else if (y > end) colour = body(x, y, t, 0);
      else if (y > LEVEL + 1) colour = c.froth;                              // the fringe that trails under the waterline
      else colour = off <= -2 && y >= top + 2 ? c.froth : c.foam;            // a billow, shaded on the side away from the light
      g.dot(x, y, colour);
    }
  }
  // spray hopping off the foam, and bubbles driven down under it
  for (let i = 0; i < 4; i++) {
    const x = 5 + 7 * i, life = fract(t + hash(i, 13));
    const from = billow(x).top - 1, y = from - Math.round(Math.min(3, from - 1) * Math.sin(Math.PI * life));   // it hops, but never into the top row
    if (life < 0.8) g.rect(x, y, 2, 1, c.foam);
    const sunk = fract(t + hash(i, 17));
    g.dot(x + 2, fringe(x + 2) + 2 + Math.round(6 * sunk), sunk < 0.5 ? c.foam : c.light);
  }
}

// ---- things on the surface -------------------------------------------------------------------------------
// swamp: two lily pads ride the surface, and a bubble blips between them
function lilyPads(g, p, c, t, pool, C) {
  const leaf = ramp(C.leaf);
  for (const [cx, bud] of [[8, false], [23, true]]) {
    const y = liquidLine(pool, cx, t);
    g.rect(cx - 3, y - 2, 7, 1, leaf.light);                    // a pad seen from the side: a lit top, a rim, a shaded lip in the water
    g.rect(cx - 4, y - 1, 9, 1, leaf.base);
    g.rect(cx - 3, y, 7, 1, leaf.dark);
    g.rect(cx + 1, y - 2, 1, 2, leaf.dark);                     // the notch in the pad
    if (bud) { g.rect(cx - 2, y - 3, 2, 1, C.cream); g.dot(cx - 2, y - 4, C.cream); g.dot(cx - 1, y - 4, C.crimson); }
  }
  const life = fract(t + 0.3), y = liquidLine(pool, 15, t);
  if (life < 0.25) g.rect(15, y - 2, 2, 2, c.light);
  else if (life < 0.5) { g.dot(14, y - 2, c.foam); g.dot(17, y - 2, c.foam); g.dot(15, y - 4, c.foam); g.dot(16, y - 3, c.foam); }
}
// lava: sparks thrown up when a bubble bursts
function sparks(g, p, c, t) {
  for (const b of BUBBLES) {
    const life = fract(t - b.born);
    if (life < POP) continue;
    const k = (life - POP) / (1 - POP);
    [[-3, 1], [0, 3], [2, 2]].forEach(([dx, up]) => g.dot(b.u + dx, LEVEL - 2 - Math.round(k * 3) - up, c.foam));
  }
}


/** The tiles of the water, in the code tileset's clip order (its clips' names): what tile.water@1's `piece` names. */
export const WATER_PIECES = Object.freeze(['water-top', 'water-fill', 'water-fill-b', 'water-fill-c', 'fall-top', 'fall-fill', 'fall-foot']);

/** Draws one frame of one tile of the water on a 32 x 32 Surface, as sprites/tiles-water.js rendered it: clip (a WATER_PIECES name), t (the clip phase), p (liquid, waves, sparkle), C (the colours, see the top). */
export function drawWater(g, { clip, t, p, C }) {
  const c = tones(p, C);
  const body = bodyFor(p, c, t);
  const pool = surfaceFor(p, c, body);
  const k = pieceOf(clip);
  if (k.prefix === 'water') {
    drawLiquid(g, k.piece, pool, t);
    if (k.piece === 'top' && p.liquid === 'swamp') lilyPads(g, p, c, t, pool, C);
    if (k.piece === 'top' && p.liquid === 'lava') sparks(g, p, c, t);
    return;
  }
  const fall = fallOf(p, c);
  if (clip === 'fall-fill') drawLiquid(g, 'fill', { body: fall }, t);
  else if (clip === 'fall-top') {
    // the pool's own waterline, then the lip: a foam line, two rows of light, and the streaks start unevenly
    const lip = (d, x) => (d === 0 ? c.foam : d <= 2 ? c.light : d < LIP[laneAt(x)] ? c.base : null);
    drawLiquid(g, 'top', { level: LEVEL, rise: riseOf(p), surface: lip, body: fall }, t);
  } else drawFoot(g, p, c, t, fall, body);
}
