// Mist: a bank of looping wisps spread along a band and joined into one cloud with one rim: ground fog over a pond
// or a graveyard, steam along a vent, dust hanging over a road. `puffs` in engine/fx.js throws its puffs from one
// point, so tiled or overlapping calls show a rim line wherever two of them meet; a bank starts each wisp at its own
// place along the band and paints every wisp as one body. Light only: draw it after g.outline; no ink.
//
//   import { mistBank } from '../engine/mist.js';
//   mistBank(g, { t, x0: 6, x1: 58, y: 60, count: 5, dist: 10, rise: 3, size: 4, shape: 'round', floor: 61,
//                 colours: [p.body, mix(p.body, p.edge, 0.45), p.edge] });     // lit top, shaded side, rim
//
// Every wisp lives on its own repeating timer (fract(cycles * t + its offset)), so the loop closes; the offsets are
// spread evenly, so most wisps are grown at any moment and the bank is never empty.

import { col } from './color.js';
import { hash, fract, clamp, lerp, PI } from './motion.js';

/** The shapes mistBank draws: round (discs), wispy (flat streaks leaning the way they drift), chunky (square blocks). No arguments: a frozen list. */
export const MIST_SHAPES = Object.freeze(['round', 'wispy', 'chunky']);

// where a wisp's extra lumps sit, in units of its radius: [dx, dy, size]. They share its flat underside.
const LUMPS = [[-0.9, 0.3, 0.7], [0.95, 0.35, 0.62], [0.2, -0.55, 0.6]];
const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };

/**
 * Draws a bank of looping wisps lying along the band from x0 to x1 at row y, joined into one cloud with one rim: each swells, drifts `dist` px along `angle`, lifts `rise` px and thins out on its own timer.
 * Arguments: g (the Surface); o: { t (loop phase 0..1), x0, x1 (the band: where the wisps start, centres kept `size` px inside), y (the row they start on), count (how many wisps), dist (px a wisp drifts in its life), angle (the way it drifts, rig convention; default PI / 2: right), rise (px it lifts by the end of its life), lift (px: every other wisp starts up to this much higher, for a deeper bank; default 0), size (px radius of a grown wisp), shape (one of MIST_SHAPES), lobes (1 to 4 lumps a wisp; default 2), stretch (round wisps only: how many times wider than tall, default 1), floor (the ground row: the rim lands on it, nothing goes below), cycles, seed, colours (lightest first, the rim last: [lit, shaded, rim]), box }.
 */
export function mistBank(g, o) {
  const { t = 0, x0, x1, y, count = 5, dist = 8, angle = PI / 2, rise = 3, lift = 0, size = 4, shape = 'round', lobes = 2, stretch = 1, floor = null, cycles = 1, seed = 0 } = o;
  if (!MIST_SHAPES.includes(shape)) throw new Error(`mistBank: shape "${shape}" is not one of ${MIST_SHAPES.join(', ')}`);
  const B = [1, 1, g.w - 1, g.h - 1];
  if (o.box) { B[0] = Math.max(B[0], Math.floor(o.box[0])); B[1] = Math.max(B[1], Math.floor(o.box[1])); B[2] = Math.min(B[2], Math.floor(o.box[2])); B[3] = Math.min(B[3], Math.floor(o.box[3])); }
  if (floor !== null) B[3] = Math.min(B[3], floor + 1);
  const C = Array.isArray(o.colours) && o.colours.length ? o.colours : ['#f0ead8', '#b8ccc8', '#7fb0b8'];
  const n = C.length, rim = C[n - 1], base = C[0], dark = C[Math.min(1, n - 1)];
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const ux = Math.sin(angle), uy = Math.cos(angle);
  const tests = [], young = [], specks = [];
  for (let i = 0; i < count; i++) {
    const k = fract(cycles * t + (i + 0.4 * h(i, 1)) / count);
    // its place along the band: evenly spread, nudged, so the gaps between wisps are uneven
    const u = count === 1 ? 0.5 : (i + 0.5 + (h(i, 2) - 0.5) * 0.6) / count;
    const sx = lerp(x0 + size, x1 - size - Math.max(0, ux) * dist + Math.min(0, ux) * dist, clamp(u));
    const sy = y - (i % 2 ? lift * (0.5 + 0.5 * h(i, 3)) : 0);
    // grows in over the first tenth of its life, full until four fifths, thins out after
    const thin = Math.min(1, k / 0.1) * (1 - smooth((k - 0.8) / 0.2));
    const r = size * (0.8 + 0.4 * h(i, 4)) * lerp(0.75, 1, k) * thin;
    const px = sx + ux * dist * k;
    let py = sy + uy * dist * k - rise * (0.6 + 0.4 * h(i, 5)) * k ** 1.5;
    if (floor !== null) py = Math.min(py, floor - Math.max(0.5, shape === 'round' ? r / Math.sqrt(stretch) : r));
    if (r < 0.9) { if (r >= 0.5) specks.push([px, py]); continue; }
    // a wispy streak leans the way the wisp moves: along the drift, tipped up by the lift
    const vx = ux * dist + 1e-3, vy = uy * dist - rise * 0.35, vl = Math.hypot(vx, vy), wx = vx / vl, wy = vy / vl;
    const one = (cx, cy, rr) => {
      if (shape === 'chunky') { const q = Math.max(1, Math.round(rr * 0.85)), qx = Math.round(cx), qy = Math.round(cy); return (qx2, qy2) => Math.abs(qx2 - qx) < q && Math.abs(qy2 - qy) < q; }
      if (shape === 'wispy') { const ra = rr * 1.8, rb = Math.max(0.8, rr * 0.5); return (ax, ay) => { const dx = ax - cx, dy = ay - cy; return ((dx * wx + dy * wy) / ra) ** 2 + ((dy * wx - dx * wy) / rb) ** 2 <= 1; }; }
      const rx = rr * Math.sqrt(stretch), ry = rr / Math.sqrt(stretch);     // a round wisp, drawn out sideways by `stretch`
      return (ax, ay) => ((ax - cx) / rx) ** 2 + ((ay - cy) / ry) ** 2 <= 1;
    };
    const flip = h(i, 6) < 0.5 ? -1 : 1, mine = [one(px, py, r)];
    for (let j = 0; j < Math.min(Math.round(lobes) - 1, LUMPS.length); j++) {
      const [lx, ly, ls] = LUMPS[j];
      if (r * ls >= 0.75) mine.push(one(px + flip * lx * r, py + ly * r, r * ls));
    }
    tests.push(...mine);
    if (k < 0.75) young.push(...mine);                  // a wisp that is thinning out takes the shaded tone
  }
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  if (tests.length) {
    const inside = (px, py) => tests.some((f) => f(px, py));
    // one body with one rim round the whole bank: the thinning wisps in the shaded tone, the rest lit over them
    g.fill(B[0] - 1, B[1] - 1, B[2] + 1, B[3] + 1, inside, dark, { outline: rim, clip });
    if (young.length) g.fill(B[0], B[1], B[2], B[3], (px, py) => young.some((f) => f(px, py)), base, { clip });
  }
  for (const [px, py] of specks) { const qx = Math.floor(px), qy = Math.floor(py); if (clip(qx + 0.5, qy + 0.5)) g.dot(qx, qy, dark); }
}
