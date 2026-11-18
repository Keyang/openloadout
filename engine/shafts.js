// Shafts: holes cut through a hard floor on a top-down map, and what shows down them. The partner of
// engine/plating.js (the floor itself) for the "hole" block of docs/style-guide.md section 6. Added with batch S13
// (sprites/tiles-pit.js, the worked example); a vent shaft, a lift well or a reactor pit can share it.
//
//   import { drawBlock, textureTone, textureLight } from '../engine/tiles.js';
//   import { dashedRim, shaftWall, depthFill, trussIn, cableRun } from '../engine/shafts.js';
//
//   const line = textureTone(p.land), lip = textureLight(p.land, p.land, 0.4);
//   const rim = (first) => dashedRim({ line: first, housing: line, light: p.glow, shift: frame, joint: line });
//   const wall = shaftWall({ rows: 10, tones: [hull.base, hull.dark, hull.deep], seams: [15, 31], shadow: hull.dark });
//   const lit = rim(line);                                    // the north rim: a dark line, the strip of lights, then the wall
//   const pit = {
//     ink: null,                                              // the line is the rim's first row
//     fill: depthFill(VOID, t, { kind: 'stars', count: 5, tones: { faint, bright, heart } }),
//     top: { depth: 2 + 10, paint: (d, u) => (d <= 2 ? lit.paint(d, u) : wall(d - 2, u)) },
//     right: rim(line), bottom: rim(lip), left: rim(lip),     // light from the top right: the lit lip is on the bottom and the left
//   };
//   drawBlock(g, piece, pit, t);
//
// What is different about a hole in a hard floor:
//   - seen in three-quarter view, only its north side shows the inner wall going down; the other three are the cut
//     edge of the floor, one or two pixels of rim. Light comes from the top right, so the rim's lit lip is on the
//     south and the west side; the north and the east side get a dark line
//   - a rim deeper than its line is cut at 45 degrees at both ends of every tile (plating.js rimPlates), so a
//     trench one tile wide bends with no notch; the wall under the north rim simply ends at the tile's side, which
//     is how the end of a wall looks from the south
//   - the depth is not a texture but something far away: a flat dark with a few specks that drift and fade, each on
//     its own timer, so the loop closes and the pattern repeats every 32 px
//
// Everything here is pure and repeatable (no Math.random, no state between calls). depthFill draws its specks on a
// 32x32 pixel pattern, like tiles.js patternFill: it suits the pixel style.

import { Surface } from './surface.js';
import { hash, fract } from './motion.js';
import { rimPlates } from './plating.js';

const T = 32;
const wrap = (v) => ((Math.floor(v) % T) + T) % T;

// ---- the rim ---------------------------------------------------------------------------------------

/**
 * An edge for drawBlock that is the rim of a hole in a hard floor: a line along the tile boundary and a strip cut at 45 degrees at both ends of every tile, with dashes of light along the strip's last row.
 * Arguments: options { depth (px of rim, its line included: 2 or more, default 2), line (the colour of the first row, or null to show the fill), housing (the strip between the lights), light (the colour of the dashes; left out: a plain strip), pitch (px from one dash to the next, default 8), on (px of each dash, default 4), shift (px the dashes have moved along the edge: one more each frame makes them run, and `pitch` px is the same picture again; default 0), joint (the colour of the cut ends of the strip, where two tiles' strips meet; default null: the fill shows) }.
 * Returns { depth, paint(d, u) }: give it to a material as top, bottom, left or right, with `ink: null`. With shift 0 the dashes are the same from both ends of the tile.
 */
export function dashedRim({ depth = 2, line = null, housing = null, light = null, pitch = 8, on = 4, shift = 0, joint = null } = {}) {
  const D = Math.max(2, Math.round(depth)), P = Math.max(2, Math.round(pitch)), N = Math.min(P, Math.max(1, Math.round(on)));
  const rim = rimPlates({ depth: D, line, face: housing });
  const start = T / 2 - N / 2 - Math.round(shift);                      // a dash is centred on the tile's middle
  const lit = (u) => ((((wrap(u) - start) % P) + P) % P) < N;
  return {
    depth: D,
    paint(d, u) {
      if (d < 1 || d > D) return null;
      if (d === 1) return line;
      const c = rim.paint(d, u);
      if (c === null || c === undefined) return joint;
      return d === D && light && lit(u) ? light : c;
    },
  };
}

// ---- the inner wall ----------------------------------------------------------------------------------

/**
 * Makes the paint of the plated inner wall of a shaft, seen going down under a hole's north rim: flat tones that step darker into the depth, with upright panel seams; returns paint(w, u) for the rows of a top edge band below its rim.
 * Arguments: options { rows (px of wall that show, default 10), tones (its colours from the top down, shared out evenly over the rows: give two to four, each clearly darker than the one before), seams (the columns 0..31 of the upright seams, default none; a seam is drawn in the next tone down, and the last tone has none), shadow (a colour for the first row, in the shadow of the rim above it; used only when the first tone has three rows or more; default none) }.
 * paint(w, u): w counts rows from 1 (the first row of wall); it returns null above the wall and below it, so the fill shows there.
 */
export function shaftWall({ rows = 10, tones = [], seams = [], shadow = null } = {}) {
  if (!tones.length) throw new Error('shaftWall: give at least one tone, from the top down');
  const R = Math.max(1, Math.round(rows)), n = tones.length;
  const cols = new Set(seams.map(wrap));
  const shade = shadow && Math.floor(R / n) >= 3;
  return (w, u) => {
    if (w < 1 || w > R) return null;
    if (w === 1 && shade) return shadow;
    const z = Math.min(n - 1, Math.floor(((w - 1) * n) / R));
    return z < n - 1 && cols.has(wrap(u)) ? tones[z + 1] : tones[z];
  };
}

// ---- the depth ---------------------------------------------------------------------------------------

/** The kinds of speck depthFill knows: stars (far below, drifting sideways), wisps (flat banks of mist or heat), sparks (rising from something hot). No arguments: a frozen list. */
export const DEPTH_KINDS = Object.freeze(['stars', 'wisps', 'sparks']);

const DRIFT = { stars: [-1, 0], wisps: [1, 0], sparks: [0, -1] };
// how far apart two specks start, across and down (one of the two is enough), so they never touch while they drift
const APART = { stars: [7, 6], wisps: [17, 6], sparks: [6, 9] };
// how far a speck reaches from its own pixel: [left, right, up, down]
const BOX = { stars: [1, 1, 1, 1], wisps: [0, 11, 1, 1], sparks: [0, 1, 0, 1] };
const MOST = 12;

// Where the specks of a seed start: the same list whatever the count, so a slider adds specks and moves none.
// box: [x0, y0, x1, y1], the pixels a start may be on (both ends included).
const starts = new Map();
function startsOf(kind, seed, box) {
  const key = `${kind}/${seed}/${box}`;
  let out = starts.get(key);
  if (out) return out;
  out = [];
  const [x0, y0, x1, y1] = box, wide = x1 - x0 + 1, high = y1 - y0 + 1, round = wide === T && high === T;
  const [gx, gy] = APART[kind], gap = (a, b) => { const d = Math.abs(a - b); return round ? Math.min(d, T - d) : d; };
  for (let k = 0; wide > 0 && high > 0 && out.length < MOST && k < 600; k++) {
    const x = x0 + Math.floor(hash(k, seed * 64 + 11) * wide), y = y0 + Math.floor(hash(k, seed * 64 + 12) * high);
    if (out.every((o) => gap(o.x, x) >= gx || gap(o.y, y) >= gy)) out.push({ x, y });
  }
  starts.set(key, out);
  return out;
}

/**
 * Makes the fill of a hole's depth for one frame: a flat colour with a few specks far below that drift a short way and fade, each on its own timer, so the loop closes and the pattern repeats every 32 px; returns fill(x, y).
 * Arguments: base (the colour of the depth); t (the clip phase: t = 1 draws what t = 0 does); options { kind (one of DEPTH_KINDS: 'stars' are 2 px dots, half of them dim, and a few small crosses; 'wisps' flat banks 7 to 12 px long and three rows thick; 'sparks' 2 px embers that shrink; default 'stars'), count (how many, 0 to 12, default 4; a higher count adds specks to the ones already there), seed (another seed, another layout and other timers), tones ({ faint, bright, heart }: a speck is faint as it comes and goes and bright between; heart is the middle of a cross and a new spark, default: bright), reach (px a speck travels in its life, default 8), drift ([dx, dy]: the way it travels; default left for stars, right for wisps, up for sparks), margin (px every speck keeps from the tile's edges through its whole life. Default 0: specks pass from one tile into the next, so every tile must use the same seed; wisps then keep off the first and last rows, where a level streak would show as a step in a join. With 2 or more nothing ever touches the tile's edge, so tiles of different seeds join each other: give each piece of a block its own seed and a field of them shows no 32 px lattice. A list [left, top, right, bottom] gives each side its own: a piece with the inner wall along its top keeps its specks below it) }.
 * No speck is ever a single pixel. The pattern is drawn when this is called: call it once per frame, not once per pixel.
 */
export function depthFill(base, t = 0, { kind = 'stars', count = 4, seed = 0, tones = {}, reach = 8, drift = null, margin = 0 } = {}) {
  if (!DEPTH_KINDS.includes(kind)) throw new Error(`depthFill: "${kind}" is not a kind of speck (${DEPTH_KINDS.join(', ')})`);
  const { faint, bright = faint, heart = bright } = tones;
  const s = new Surface(T, T);
  s.rect(0, 0, T, T, base);
  const put = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) s.dot(wrap(x + i), wrap(y + j), c); };
  const [dx, dy] = drift ?? DRIFT[kind], far = Math.max(0, Math.round(reach));
  const [ml, mt, mr, mb] = (Array.isArray(margin) ? margin : [margin, margin, margin, margin]).map((v) => Math.max(0, Math.round(v)));
  const [bl, br, bu, bd] = BOX[kind];
  const box = ml + mt + mr + mb > 0
    ? [ml + bl + Math.max(0, -dx * far), mt + bu + Math.max(0, -dy * far), T - 1 - mr - br - Math.max(0, dx * far), T - 1 - mb - bd - Math.max(0, dy * far)]
    : kind === 'wisps' ? [0, 2 + Math.max(0, -dy * far), T - 1, T - 3 - Math.max(0, dy * far)] : [0, 0, T - 1, T - 1];
  const all = startsOf(kind, seed | 0, box), n = Math.min(all.length, Math.max(0, Math.round(count)));
  for (let i = 0; i < n; i++) {
    const life = fract(fract(t) + hash(i, (seed | 0) * 64 + 1));
    if (life >= 0.875) continue;                                       // gone, until its timer comes round
    const full = life >= 0.125 && life < 0.625, step = Math.floor(far * life);
    const x = all[i].x + dx * step, y = all[i].y + dy * step, v = hash(i, (seed | 0) * 64 + 3);
    if (kind === 'stars') {
      if (v > 0.8) { put(x - 1, y, 3, 1, full ? bright : faint); put(x, y - 1, 1, 3, full ? bright : faint); if (full) put(x, y, 1, 1, heart); }
      else put(x, y, 2, 2, full && v > 0.45 ? bright : faint);          // the dim ones never brighten: they are further off
    } else if (kind === 'wisps') {
      // a bank three rows thick, its upper side lit; thinner as it comes and goes
      const len = 7 + Math.floor(v * 6);
      if (full) { put(x, y, len, 1, faint); put(x + 1, y + 1, len - 3, 1, faint); put(x + 2, y - 1, len - 4, 1, bright); }
      else { put(x + 1, y, len - 2, 1, faint); put(x + 2, y + 1, len - 5, 1, faint); }
    } else if (life < 0.125) put(x, y, 2, 2, heart);
    else if (full) put(x, y, 2, 2, bright);
    else put(x, y, 1, 2, faint);
  }
  return (x, y) => s.data[wrap(y) * T + wrap(x)];
}

// ---- what hangs over a hole -----------------------------------------------------------------------------

/**
 * Shape test for a lattice girder seen from above or from the side: two straight chords one pixel thick with zigzag lacing between them, lying any way; returns inside(px, py).
 * Arguments: x0, y0, x1, y1 (the two ends of its middle line: put it on pixel centres, x or y ending in .5, for a girder an odd number of pixels wide); options { width (px across, chords included, default 5), bay (px along the girder from one turn of the lacing to the next, default 4), part ('all', the default; 'a' or 'b': one chord alone, 'a' the one on the left as you look from the first end to the second, for a lit or a shaded side; 'web': the lacing alone) }.
 */
export function trussIn(x0, y0, x1, y1, { width = 5, bay = 4, part = 'all' } = {}) {
  if (!['all', 'a', 'b', 'web'].includes(part)) throw new Error(`trussIn: part "${part}" is not all, a, b or web`);
  const len = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const half = Math.max(1.5, width / 2), B = Math.max(2, bay), reach = half - 1;      // the lacing runs between the chords
  const slope = (2 * reach) / B, thick = 0.5 * Math.max(1, slope) + 0.01;
  return (px, py) => {
    const ax = px - x0, ay = py - y0, s = ax * ux + ay * uy, d = ay * ux - ax * uy;
    if (s < 0 || s >= len || Math.abs(d) >= half) return false;
    const chord = Math.abs(d) > reach;
    if (chord) return part === 'all' || (part === 'a' ? d < 0 : part === 'b' ? d > 0 : false);
    if (part === 'a' || part === 'b') return false;
    const k = s / (2 * B), z = reach * (1 - 4 * Math.abs(k - Math.floor(k) - 0.5));   // a triangle wave between the chords
    return Math.abs(d - z) <= thick;
  };
}

/**
 * The points of a cable that hangs from a fixing and leans to one side, more the further down it is (a loose wire, a chain, a vine): [[x, y], ...], one per row, for surface.js polyline.
 * Arguments: x, y (the fixing: its first point); length (px it hangs down: the last point is on row y + length); lean (px its free end is to the side of the fixing, negative to the left; default 0: straight down. Change it over a loop for a cable that sways).
 */
export function cableRun(x, y, length, lean = 0) {
  const n = Math.max(0, Math.round(length)), pts = [];
  for (let i = 0; i <= n; i++) {
    const off = lean * (n ? (i / n) ** 2 : 0);
    pts.push([x + Math.sign(off) * Math.round(Math.abs(off)), y + i]);
  }
  return pts;
}
