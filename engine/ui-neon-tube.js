// Neon tube fixes for the pieces moreSkinMarks (engine/ui-skins-more.js) cannot read (added with batch K25 fix round 1,
// bundles/specs/core-sprites-3.md). moreSkinMarks finds a piece's band from its outline inwards and lights the tube
// from the colour just inside it; four flat pieces do not have that shape, and these helpers finish them after the
// marks, in the tones of moreSkinTones('neon', ...):
//
//   neonGapGlow     an open tab: the outline style's gap between the ink and the tube runs out at the open bottom, so
//                   the marks (which draw a ring whole or not at all) leave the Glow out. This paints it: every face
//                   pixel next to both the ink and the tube.
//   neonBarTube     a bar housing (its band between two ink lines: the outline and the ring round the trough) and a
//                   slider rail (all band): there is no inside to light a core from. housing: the band's second pixel
//                   from the outline the core; double: the ring round the trough the second tube; Glow: the trough's
//                   first ring the tube's dark tone. rail: its middle rows the core (double: the lower half the second
//                   tube), its outer ring the band, or with Glow the tube's dark tone.
//   neonGrowBand    Border on a flat box, option or switch, whose band stops at 2 px (box, option) or 1 px (switch):
//                   grows the band inwards over a colour (the face or the track) by whole rings.
//   neonBrackets    the selector's brackets (two 1 px lines of band in an L): line 0 the band, line 1 the core, and
//                   optionally a third line of band (Thick) and a line of the accent inside (double), inked round.
// Every ring is the same all along each side, so a piece that stretched before still stretches. The sign's gaps
// (pixels of another colour on the tube) are kept.

import { col, INK } from './color.js';
import { moreSkinTones } from './ui-skins-more.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const tonesOf = (o) => moreSkinTones('neon', { face: o.face, frame: o.frame, accent: o.accent, style: o.style, state: o.state ?? 'normal' });
const within = (g, b) => ({ x0: Math.max(0, b.x), y0: Math.max(0, b.y), x1: Math.min(g.w, b.x + b.w), y1: Math.min(g.h, b.y + b.h) });

// Depth of every drawn pixel in `box` from the nearest empty pixel (1 on the outline), 4-connected.
function depthMap(g, box) {
  const { x0, y0, x1, y1 } = within(g, box), d = new Map(), key = (x, y) => y * g.w + x;
  const drawn = (x, y) => x >= x0 && y >= y0 && x < x1 && y < y1 && g.get(x, y) !== 0;
  let edge = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (drawn(x, y) && N4.some(([a, b]) => !drawn(x + a, y + b))) { d.set(key(x, y), 1); edge.push([x, y]); }
  }
  for (let k = 2; edge.length; k++) {
    const next = [];
    for (const [x, y] of edge) for (const [a, b] of N4) if (drawn(x + a, y + b) && !d.has(key(x + a, y + b))) { d.set(key(x + a, y + b), k); next.push([x + a, y + b]); }
    edge = next;
  }
  return (x, y) => d.get(key(x, y)) ?? 0;
}

/**
 * Paints the Glow of a neon piece whose outline-style gap the marks left out (an open tab): every face pixel in `body` next to both the ink and the tube (band or core) becomes the tube's dark tone. Returns the number of pixels painted.
 * Arguments: g; body ({ x, y, w, h }); opt { face, frame, accent, style, state, ink }.
 */
export function neonGapGlow(g, body, opt = {}) {
  const T = tonesOf(opt), ink = col(opt.ink ?? INK), tube = new Set([col(T.band), col(T.core)]), face = col(T.face);
  const { x0, y0, x1, y1 } = within(g, body), paint = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (g.get(x, y) !== face) continue;
    const near = N4.map(([a, b]) => g.get(x + a, y + b));
    if (near.includes(ink) && near.some((c) => tube.has(c))) paint.push([x, y]);
  }
  for (const [x, y] of paint) g.dot(x, y, T.tubeDark);
  return paint.length;
}

/**
 * Lights the neon tube of a flat bar housing or slider rail already drawn (and marked) in `body`. Returns the number of pixels painted.
 * Arguments: g; body (the housing's or the rail's rectangle); piece ('housing' or 'rail'); opt { face, frame, accent, style, extras (Glow), opening (housing: the trough, as skinBarHousing returns it; required), ink }.
 */
export function neonBarTube(g, body, piece, opt = {}) {
  if (piece !== 'housing' && piece !== 'rail') throw new Error(`neonBarTube: piece "${piece}" is not housing or rail`);
  if (piece === 'housing' && !opt.opening) throw new Error('neonBarTube: a housing needs its opening');
  const T = tonesOf(opt), tube = new Set([col(T.band), col(T.core)]), ink = col(opt.ink ?? INK), depth = depthMap(g, body);
  const double = opt.style === 'double', { x0, y0, x1, y1 } = within(g, body), mid = body.y + (body.h >> 1);
  const paint = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!tube.has(g.get(x, y))) continue;
    const d = depth(x, y);
    if (piece === 'housing') paint.push([x, y, d === 3 ? T.core : T.band]);
    else if (d === 2) paint.push([x, y, opt.extras ? T.tubeDark : T.band]);
    else paint.push([x, y, double && y >= mid ? T.accent : T.core]);
  }
  if (piece === 'housing') {
    const o = opt.opening;
    const ring = (r, f) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) f(x, y); };
    if (double) ring({ x: o.x - 1, y: o.y - 1, w: o.w + 2, h: o.h + 2 }, (x, y) => { if (g.get(x, y) === ink) paint.push([x, y, T.accent]); });
    if (opt.extras) ring(o, (x, y) => paint.push([x, y, T.tubeDark]));
  }
  for (const [x, y, c] of paint) g.dot(x, y, c);
  return paint.length;
}

/**
 * Grows the band of a flat neon piece already drawn in `box` inwards over the colour `into` (its face or its track) by `rings` whole rings; a pixel next to ink or the outside is never painted. Returns the number of pixels painted.
 * Arguments: g; box; into (a colour, '#rrggbb' or as Surface.get returns it); rings (whole rings); opt { face, frame, accent, style, ink }.
 */
export function neonGrowBand(g, box, into, rings, opt = {}) {
  const B = tonesOf(opt).band, band = col(B), ink = col(opt.ink ?? INK), from = typeof into === 'string' ? col(into) : into;
  const { x0, y0, x1, y1 } = within(g, box);
  let n = 0;
  for (let r = 0; r < rings; r++) {
    const paint = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (g.get(x, y) !== from) continue;
      const near = N4.map(([a, b]) => g.get(x + a, y + b));
      if (near.includes(band) && !near.some((c) => !c || c === ink)) paint.push([x, y]);
    }
    for (const [x, y] of paint) g.dot(x, y, B);
    n += paint.length;
  }
  return n;
}

/**
 * Turns the four L brackets of a flat selector drawn in `box` into neon tube: in each quarter of the box, the bracket's lines numbered from its outer edges inwards; line 0 the band, line 1 the core; `thick` adds line 2 of the band, double a line of the accent inside the last (the second tube); the sign's gaps carried onto added lines at the bend; added lines inked round. Returns the number of pixels added.
 * Arguments: g; box (the selector's rectangle); opt { face, frame, accent, style, thick (boolean), ink }.
 */
export function neonBrackets(g, box, opt = {}) {
  const T = tonesOf(opt), band = col(T.band), ink = col(opt.ink ?? INK), sign = opt.style === 'sign';
  const lines = opt.thick ? 3 : 2, hw = box.w >> 1, hh = box.h >> 1, added = [];
  for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const q = { x: box.x + qx * (box.w - hw), y: box.y + qy * (box.h - hh), w: hw, h: hh };
    const { x0, y0, x1, y1 } = within(g, q), sx = qx ? -1 : 1, sy = qy ? -1 : 1, px = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const c = g.get(x, y); if (c && c !== ink) px.push([x, y]); }
    if (!px.length) continue;
    const ox = sx > 0 ? Math.min(...px.map((p) => p[0])) : Math.max(...px.map((p) => p[0]));
    const oy = sy > 0 ? Math.min(...px.map((p) => p[1])) : Math.max(...px.map((p) => p[1]));
    const arm = Math.max(...px.map(([x, y]) => Math.max((x - ox) * sx, (y - oy) * sy))) + 1;
    for (const [x, y] of px) if (g.get(x, y) === band) g.dot(x, y, Math.min((x - ox) * sx, (y - oy) * sy) === 1 ? T.core : T.band);
    const extra = [];
    if (lines === 3) extra.push([2, T.band]);
    if (opt.style === 'double') extra.push([lines, T.accent]);
    for (const [k, c] of extra) for (let i = k; i < arm; i++) for (const [u, v] of [[i, k], [k, i]]) {
      const x = ox + sx * u, y = oy + sy * v;
      g.dot(x, y, sign && (u === v || u === v + 1) ? T.faceDark : c);
      added.push([x, y]);
    }
  }
  for (const [x, y] of added) for (const [a, b] of N4) if (x + a >= 0 && y + b >= 0 && x + a < g.w && y + b < g.h && g.get(x + a, y + b) === 0) g.dot(x + a, y + b, opt.ink ?? INK);
  return added.length;
}
