// Shafts: holes cut through a hard floor on a top-down map, and what shows down them. The partner of
// engine/plating.js (the floor itself) for the "hole" block of docs/style-guide.md section 6. Added with batch S13
// (sprites/tiles-pit.json, the worked example); a vent shaft, a lift well or a reactor pit can share it.
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
