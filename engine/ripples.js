// Open water with no grid in it (added with batch F02: the Hearthvale shore, final pass). A lake is one fill tile
// laid in every cell, so whatever moves in that tile shows as a lattice across the lake: the same streak at the
// same place every 32 px, however much it moves. The cure is the one a floor uses: several versions of the fill,
// which whoever lays out a level mixes by position (fillVariant in engine/tiles.js). For that, versions must be
// able to lie beside each other in any order, so no mark of any version may reach the tile's edge on any frame.
// Worked example: sprites/tiles-shore.json.
//
//   rippleVersion(W.body, t, { light: W.light, count: 6, length: 7, stir: 2, seed: SEEDS[v] })   // the marks of one version of the fill: fill(x, y)
//   rippleEvenness((t) => rippleVersion(W.body, t, { seed }), { base: W.body })                  // how even a seed is over the loop
//   (SEEDS: one arrangement per version of the fill; a tileset asks for 3 fills and engine/gen/ports/tiles-shore.js draws them with these.)
//
// engine/water.js has rippleFill, the same streaks wrapping round the tile's edges: right for a tile that only ever
// lies beside itself (a pool one tile big, a trough), wrong for a field. engine/tiles.js has liquidMarks, marks that
// slide to and fro and never fade, for the body of a side-view liquid. Pure functions: Node and browser, no
// Math.random; everything repeats every 32 px and closes over one loop.
//
// Styles: these paint flat pixels, which suits the pixel style; a smooth style would want its own water.

import { col } from './color.js';
import { hash, fract } from './motion.js';

const TILE = 32;
const wrap = (v) => ((Math.round(v) % TILE) + TILE) % TILE;

/**
 * Makes one version of a moving water surface as a tile fill: level streaks of light that swell, slide and fade on their own timers, each kept inside the tile on every frame so that versions join in any order; returns fill(x, y).
 * Arguments: base (the water's colour); t (clip phase 0..1); options { seed (which arrangement: another whole number, another version, with its own rows, columns, lengths and timers; default 0), light (the streaks' colour, default white), dark (a colour for every third streak, a trough; left out: all light), count (streaks in a tile, 0 to 9, default 5), length (px of the longest, default 6), stir (px a streak slides in its life, default 2), margin (px along each edge of the tile that no mark enters on any frame, default 3: what a version of a fill must leave alone), tips (a colour for the leading pixel of every full-grown streak, where it catches the sun; left out: none), under (false: no second, shorter line under every third streak; default true) }.
 * Streaks lie one to a band of rows, two rows or more apart, a golden step apart in their timers and spread over the columns so that each is crossed about as often, so a tile has no blotch, no bare lane beside its margins, and its streaks do not come and go together. Call it once per frame and version, not once per pixel.
 */
export function rippleVersion(base, t, { seed = 0, light = '#ffffff', dark = null, count = 5, length = 6, stir = 2, margin = 3, tips = null, under = true } = {}) {
  const px = new Uint32Array(TILE * TILE).fill(col(base));
  const lo = Math.min(12, Math.max(0, Math.round(margin))), hi = TILE - lo, span = hi - lo;        // marks stay in lo .. hi - 1
  const n = Math.max(0, Math.min(9, Math.round(count)));
  const s = (seed | 0) * 131 + 17;
  const put = (x, y, c) => { if (x >= lo && x < hi && y >= lo && y < hi) px[y * TILE + x] = col(c); };
  const slide = Math.max(0, Number(stir) || 0), longest = Math.max(2, Math.min(span, Math.round(length)));
  const band = n ? span / n : span, startX = hash(s, 9), startT = hash(s, 23);
  // rows first: one streak to a band of rows, anywhere in it (so the first may lie on the first free row and the last
  // on the last one, and the clear rows along the tile's edges are no wider than the gaps inside), then moved down
  // where two would be closer than two rows
  const rows = [];
  for (let i = 0; i < n; i++) {
    const y = lo + Math.floor(i * band + hash(i, s + 5) * band);
    rows.push(Math.min(hi - 1 - 2 * (n - 1 - i), Math.max(y, i ? rows[i - 1] + 2 : lo)));
  }
  for (let i = 0; i < n; i++) {
    // each streak lives three quarters of the loop: it swells from nothing to its length and back, sliding as it goes
    const life = fract(t + fract(i * 0.618034 + startT));
    const full = Math.max(2, Math.round(longest * (0.6 + 0.4 * hash(i, s + 11))));
    const len = life < 0.75 ? Math.round(full * Math.sin((Math.PI * life) / 0.75)) : 0;
    if (len < 2) continue;
    // where it lies when full grown: anywhere that leaves room for its length (it may touch the margin), more
    // often towards the two sides than in the middle, so that every column of the tile is crossed about as often
    // (streaks placed evenly would leave the columns beside the margins nearly bare: a lane down every tile boundary)
    const u = fract(i * 0.618034 + startX);
    const x0 = lo + Math.round((0.5 - 0.5 * Math.cos(Math.PI * u)) * (span - full));
    // it grows about its middle and slides through its place: half its slide before it is full grown, half after
    const x = Math.min(hi - len, Math.max(lo, Math.round(x0 + (full - len) / 2 + slide * (life / 0.75 - 0.5)))), y = rows[i];
    const c = dark && i % 3 === 2 ? dark : light;
    for (let k = 0; k < len; k++) put(x + k, y, c);
    if (tips && c === light && len >= 4) put(x + len - 1, y, tips);
    // a second, shorter line two rows under it, where a clear row is left between it and the next streak
    if (under && i % 3 === 0 && len >= 5 && (i === n - 1 ? y + 2 < hi : rows[i + 1] - y >= 4)) for (let k = 0; k < len - 3; k++) put(x + 2 + k, y + 2, c);
  }
  return (x, y) => px[wrap(y) * TILE + wrap(x)];
}
