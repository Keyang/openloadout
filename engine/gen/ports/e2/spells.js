// PORT (migration batch E2): a copy of engine/spells.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/spells.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
// Spell and weapon-hit effects: what a battle screen plays over a fighter. A crescent slash, a
// lightning bolt, ice crystals, a snowflake, rising shaped motes and sparks that spiral inward.
// They sit beside engine/fx.js and follow its rules (docs/style-guide.md sections 2, 4 and 14):
// hard pixel edges, no Math.random, light rimmed with a darker tone of its own colour (never ink),
// and nothing outside the frame's 1 px empty border, or outside `box` when one is given.
// Everything is drawn through the Surface's own calls (fill and dot), so it suits any pixel style.
//
//   import { crescent, bolt, boltPath, crystal, snowflake, motes, swirl } from '../engine/spells.js';
//   const C = steps(p.edge, { core: p.core, white: false });            // [core, middle, edge, rim]: hottest first
//   crescent(g, { x0: 48, y0: 14, x1: 16, y1: 50, bulge: 8, width: 6, colours: C });    // a sword cut, top right to bottom left
//   bolt(g, { x0: 32, y0: 2, x1: 30, y1: 89, zigzag: 4, sway: 6, width: 3, forks: 2, colours: C });   // a lightning strike
//   crystal(g, { x: 32, y: 58, length: 30, width: 9, colours: C, box: [1, 1, 63, 58] });  // an ice spike standing on row 57
//   snowflake(g, { x: 32.5, y: 30.5, r: 14, colours: C });
//   motes(g, { t, x: 32, y: 56, count: 6, rise: 40, shape: 'plus', loop: false, colours: C });   // healing motes rising
//   swirl(g, { t, x: 32, y: 48, r0: 15, turns: 0.6, colours: C });                         // sparks gathering into a point
//
// Shared options, as in engine/fx.js:
//   colour | colours   one '#rrggbb' (turned into steps(colour, { white: false })), or a list hottest
//                      first whose LAST entry is the rim. A list of one colour draws no rim.
//   box                [x0, y0, x1, y1]: draw only where x0 <= x < x1 and y0 <= y < y1.
//   seed               integer: a different seed gives a different but repeatable pattern.
// Angles use the rig convention: 0 = down, PI / 2 = right, PI = up.

import { hash, fract, clamp, lerp, easeOut, TAU, PI } from '../../../motion.js';
import { steps, stepAt, lifeOf } from './fx.js';
import { crossIn, starIn, heartIn } from './shapes.js';
import { leafIn } from './creature.js';

// ---- shared pieces ----------------------------------------------------------------------------

function boxOf(g, box) {
  const b = [1, 1, g.w - 1, g.h - 1];
  if (box) { b[0] = Math.max(b[0], Math.floor(box[0])); b[1] = Math.max(b[1], Math.floor(box[1])); b[2] = Math.min(b[2], Math.floor(box[2])); b[3] = Math.min(b[3], Math.floor(box[3])); }
  return b;
}
const coloursOf = (o, fallback) => (Array.isArray(o.colours) && o.colours.length ? o.colours : steps(o.colour ?? fallback, { white: false }));
const inBox = (B) => (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
const put = (g, B, x, y, c) => { x = Math.floor(x); y = Math.floor(y); if (x >= B[0] && y >= B[1] && x < B[2] && y < B[3]) g.dot(x, y, c); };
const keepIn = (v, lo, hi) => Math.min(Math.max(v, lo + 0.01), hi - 0.01);

/**
 * Paints a shape as nested layers of light: a 1 px rim (the last colour) round it, the body in the colour
 * before that, then each hotter colour `depth` px further inside, as far as the shape is thick enough.
 * A thin part therefore stays in the outer colours, which is how a tail cools. Returns the pixels covered.
 */
function layered(g, B, inside, colours, depth = 1) {
  const w = B[2] - B[0], h = B[3] - B[1];
  if (w <= 0 || h <= 0) return 0;
  let m = new Uint8Array(w * h), n = 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (inside(B[0] + xx + 0.5, B[1] + yy + 0.5)) { m[yy * w + xx] = 1; n++; }
  if (!n) return 0;
  const test = (mask) => (px, py) => { const xx = Math.floor(px) - B[0], yy = Math.floor(py) - B[1]; return xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx] === 1; };
  const clip = inBox(B), last = colours.length - 1;
  if (last === 0) g.fill(B[0], B[1], B[2], B[3], test(m), colours[0], { clip });
  else g.fill(B[0], B[1], B[2], B[3], test(m), colours[last - 1], { outline: colours[last], clip });
  for (let j = last - 2; j >= 0; j--) {
    for (let d = 0; d < Math.max(1, Math.round(depth)); d++) {
      const e = new Uint8Array(w * h);
      let left = 0;
      for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
        const i = yy * w + xx;
        if (m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w]) { e[i] = 1; left++; }
      }
      m = e;
      if (!left) return n;
    }
    g.fill(B[0], B[1], B[2], B[3], test(m), colours[j], { clip });
  }
  return n;
}

/** The pixels an unbroken 1 px line through the points covers, as a Set of y * 4096 + x: keeps a thin stroke whole. */
function spineOf(pts, from = 0, to = 1) {
  const set = new Set();
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let done = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len * 2));
    for (let e = 0; e <= n; e++) {
      const k = (done + (len * e) / n) / (total || 1);
      if (k < from || k > to) continue;
      set.add(Math.floor(ay + ((by - ay) * e) / n) * 4096 + Math.floor(ax + ((bx - ax) * e) / n));
    }
    done += len;
  }
  return set;
}

// ---- a slash ----------------------------------------------------------------------------------

/**
 * A crescent cut along an arc from (x0, y0) to (x1, y1): the mark of a sword, claw or scythe, fat near its leading end and thinning to a point at the tail; returns the point [x, y] of its leading end.
 * The arc bows `bulge` px off the straight line (to the left of the way it travels, as seen on screen; negative: to the right; near 0: a straight streak).
 * from, to (0..1) show only that part of the sweep, so a cut can sweep in (to: 0.6, then 1) and thin away from its tail end (from: 0.3, 0.6, 0.8); the part shown always tapers at both of its ends.
 * Arguments: g: the Surface; o: { x0, y0, x1, y1, bulge, width (px across at its fattest), from, to, head (0..1: where along the shown part it is fattest, default 0.65), jag (px of saw-teeth on its edges, default 0: clean), teeth (how many, default 7), seed, colour | colours, box }.
 */
export function crescent(g, o) {
  const { x0, y0, x1, y1, bulge = 6, width = 5, from = 0, to = 1, head = 0.65, jag = 0, teeth = 7, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#c2c9d6');
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  if (L < 1 || to <= from) return [x0, y0];
  const side = bulge < 0 ? -1 : 1, s = clamp(Math.abs(bulge), 0.6, L / 2);
  const R = (L * L / 4 + s * s) / (2 * s);
  const nx = (side * dy) / L, ny = (-side * dx) / L;                     // the way it bows
  const cx = (x0 + x1) / 2 - nx * (R - s), cy = (y0 + y1) / 2 - ny * (R - s);
  const a0 = Math.atan2(y0 - cy, x0 - cx), A = 2 * Math.asin(Math.min(1, L / (2 * R)));
  const turn = Math.sign((x0 - cx) * (y1 - cy) - (y0 - cy) * (x1 - cx)) || 1;
  const k = Math.log(0.5) / Math.log(clamp(head, 0.2, 0.9));
  const p1 = hash(seed, 3), p2 = hash(seed, 5);
  const inside = (px, py) => {
    const vx = px - cx, vy = py - cy;
    let a = fract(((Math.atan2(vy, vx) - a0) * turn) / TAU) * TAU;
    if (a > A + (TAU - A) / 2) a -= TAU;
    const u = a / A;
    if (u < from || u > to) return false;
    const v = (u - from) / (to - from);
    const tp = Math.sin(PI * v ** k) ** 0.7;
    const w = width * tp;
    let out = 0.25 * w, inn = 0.75 * w;
    if (jag > 0) {
      const bite = Math.sqrt(tp);                                     // the ends stay pointed
      out += jag * bite * (1.7 * fract(u * teeth + p1) - 0.5);                              // barbs on the outside: a slow rise, a sharp drop
      inn += jag * bite * 0.6 * (Math.abs(2 * fract(u * teeth * 0.73 + p2) - 1) - 0.5);    // and a slightly ragged inside
    }
    if (out + inn < 1) { out = 0.5; inn = 0.5; }                       // never thinner than an unbroken line
    const r = Math.hypot(vx, vy);
    return r <= R + out && r >= R - inn;
  };
  layered(g, B, inside, C);
  const ah = a0 + turn * A * clamp(to);
  return [cx + Math.cos(ah) * R, cy + Math.sin(ah) * R];
}

// ---- lightning --------------------------------------------------------------------------------

/**
 * The corner points of a lightning path from (x0, y0) to (x1, y1), [[x, y], ...]: it wanders to one side and back in a slow bend and steps from side to side at every kink, and always starts and ends exactly on the two points.
 * Arguments: x0, y0, x1, y1 (the two ends); options { kinks (how many corners between the ends, default 6), zigzag (px each corner steps off the line, to alternate sides), sway (px the whole path wanders in its slow bend), mirror (true: the same path flipped to the other side of the straight line, so the two cross between every pair of corners like the links of a chain), seed }.
 */
export function boltPath(x0, y0, x1, y1, { kinks = 6, zigzag = 3, sway = 0, mirror = false, seed = 0 } = {}) {
  const n = Math.max(1, Math.round(kinks) + 1);
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L, ny = dx / L;
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const flip = (h(0, 1) < 0.5 ? 1 : -1) * (mirror ? -1 : 1), bend = h(0, 2) + (mirror ? 0.5 : 0);
  const pts = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const k = (i + (h(i, 3) - 0.5) * 0.5) / n;
    const off = sway * Math.sin(PI * k) * Math.sin(TAU * (0.8 * k + bend)) + zigzag * flip * (i % 2 ? 1 : -1) * (0.45 + 0.55 * h(i, 4));
    pts.push([x0 + dx * k + nx * off, y0 + dy * k + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}

/**
 * A lightning bolt from (x0, y0) to (x1, y1): a jagged stroke `width` px thick in nested colours, with forks that leave its corners and thin away; returns the corner points of the main stroke, [[x, y], ...].
 * from, to (0..1) show only that share of its length (a leader creeping down, or broken remnants as it fades); taper 0..1 thins it towards its far end.
 * Arguments: g: the Surface; o: { x0, y0, x1, y1, kinks, zigzag, sway (as boltPath), path (corner points to use instead), width (px, default 3), from, to, taper, forks (how many, default 0), forkLength (share of the bolt's length, default 0.3), forkAngle (radians off the bolt's own way, default 0.7), seed, colour | colours, box }.
 */
export function bolt(g, o) {
  const { x0, y0, x1, y1, kinks = 6, zigzag = 3, sway = 0, width = 3, from = 0, to = 1, taper = 0, forks = 0, forkLength = 0.3, forkAngle = 0.7, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#f4e06a');
  const pts = o.path ?? boltPath(x0, y0, x1, y1, { kinks, zigzag, sway, seed });
  if (to <= from || pts.length < 2) return pts;
  const h = (i, ch) => hash(i, seed * 64 + ch);
  // every stroke is a chain of pieces [ax, ay, bx, by, ra, rb]
  const pieces = [], spines = [];
  const add = (path, r0, r1, lo, hi) => {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    let done = 0;
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i], len = Math.hypot(bx - ax, by - ay);
      const ka = done / (total || 1), kb = (done + len) / (total || 1);
      done += len;
      const a = Math.max(ka, lo), b = Math.min(kb, hi);
      if (b <= a || len <= 0) continue;
      const fa = (a - ka) / (kb - ka), fb = (b - ka) / (kb - ka);
      pieces.push([ax + (bx - ax) * fa, ay + (by - ay) * fa, ax + (bx - ax) * fb, ay + (by - ay) * fb, lerp(r0, r1, a), lerp(r0, r1, b)]);
    }
    spines.push(spineOf(path, lo, hi));
  };
  const r = Math.max(0.5, width / 2);
  add(pts, r, lerp(r, 0.5, clamp(taper)), clamp(from), clamp(to));
  const n = pts.length - 1, count = Math.max(0, Math.round(forks));
  const mx = pts[n][0] - pts[0][0], my = pts[n][1] - pts[0][1], ML = Math.hypot(mx, my) || 1e-6, main = Math.atan2(mx, my);
  for (let f = 0; f < count; f++) {
    // forks leave corners spread along the first three quarters of the bolt, to alternate sides
    const at = Math.min(n - 1, Math.max(1, Math.round(n * lerp(0.2, 0.72, count === 1 ? 0.45 : f / (count - 1)) + (h(f, 11) - 0.5))));
    const k = at / n;
    if (k < from || k > to) continue;
    const [fx0, fy0] = pts[at];
    const sideOf = (f % 2 ? -1 : 1) * (h(0, 12) < 0.5 ? 1 : -1);
    const a = main + sideOf * forkAngle * (0.75 + 0.5 * h(f, 13));
    const len = ML * forkLength * (0.6 + 0.4 * h(f, 14)) * (1 - 0.35 * k);
    const fp = boltPath(fx0, fy0, fx0 + Math.sin(a) * len, fy0 + Math.cos(a) * len, { kinks: 2 + Math.round(2 * h(f, 15)), zigzag: zigzag * 0.6, seed: seed * 7 + f + 1 });
    add(fp, Math.max(0.5, r * 0.6), 0.5, 0, 1);
  }
  const inside = (px, py) => {
    const key = Math.floor(py) * 4096 + Math.floor(px);
    for (const s of spines) if (s.has(key)) return true;
    for (const [ax, ay, bx, by, ra, rb] of pieces) {
      if (ra <= 0.5 && rb <= 0.5) continue;                            // a hairline is its spine
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-6;
      const q = clamp(((px - ax) * ex + (py - ay) * ey) / l2), rr = ra + (rb - ra) * q;
      if ((px - ax - ex * q) ** 2 + (py - ay - ey * q) ** 2 <= rr * rr) return true;
    }
    return false;
  };
  layered(g, B, inside, C);
  return pts;
}

// ---- ice --------------------------------------------------------------------------------------

/** The crystal shapes crystal() draws: spike (a sharp cone), prism (a six-sided column with a pointed cap) and shard (a splinter, fattest a third of the way up). No arguments: a frozen list. */
export const CRYSTAL_SHAPES = Object.freeze(['spike', 'prism', 'shard']);

const CRYSTAL_HALF = {
  spike: (k) => (1 - k) ** 0.85,
  prism: (k) => (k < 0.62 ? lerp(0.78, 1, k / 0.62) : (1 - k) / 0.38),
  shard: (k) => (k < 0.3 ? lerp(0.35, 1, k / 0.3) : ((1 - k) / 0.7) ** 0.9),
};

/**
 * A crystal standing on its foot at (x, y) and pointing along `angle`: an ice spike, a quartz point, a gem splinter, cut into a lit facet, a shaded facet and a hard highlight line along the ridge between them, with a rim; returns its tip [x, y].
 * The facet on the side of the surface light takes the second colour, the other the third, the highlight the first and the rim the last. Give a box that ends on the ground row to make it stand in the ground, and animate `length` to make it grow.
 * Arguments: g: the Surface; o: { x, y (the middle of its foot), angle (PI = up), length, width (px across at its widest), shape (see CRYSTAL_SHAPES, default 'spike'), ridge (-1..1: where the ridge runs across it, 0 the middle, negative towards the shaded side; default -0.2), shine (false: no highlight line), colour | colours, box }.
 */
export function crystal(g, o) {
  const { x, y, angle = PI, length = 16, width = 6, shape = 'spike', ridge = -0.2, shine = true } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#7aa0f4');
  const ux = Math.sin(angle), uy = Math.cos(angle);
  const tip = [x + ux * length, y + uy * length];
  if (length < 1 || width <= 0) return tip;
  // across: the unit vector pointing to the side the light comes from
  const [sx, sy] = g.shadow;
  let ax = uy, ay = -ux;
  if (ax * -sx + ay * -sy < 0) { ax = -ax; ay = -ay; }
  const half = CRYSTAL_HALF[shape] ?? CRYSTAL_HALF.spike;
  const hw = (k) => Math.max(0.5, (width / 2) * half(k));
  const local = (px, py) => { const dx = px - x, dy = py - y; return [(dx * ux + dy * uy) / length, dx * ax + dy * ay]; };
  const whole = (px, py) => { const [k, c] = local(px, py); return k >= 0 && k <= 1 && Math.abs(c) <= hw(k); };
  const lit = (px, py) => { const [k, c] = local(px, py); return k >= 0 && k <= 1 && Math.abs(c) <= hw(k) && c >= ridge * hw(k); };
  const top = shape === 'prism' ? 0.62 : 0.9;
  const line = (px, py) => { const [k, c] = local(px, py); const w = hw(k), rc = ridge * w; return k >= 0.06 && k <= top && w >= 1.8 && c >= rc && c < rc + 1 && Math.abs(c) <= w; };
  const clip = inBox(B);
  const reach = length + width + 2, bx = [x - reach, y - reach, x + reach, y + reach];
  const n = C.length;
  const shade = C[Math.max(0, n - 2)], face = C[Math.max(0, n - 3)], glint = C[0];
  let drew = false;
  g.fill(...bx, (px, py) => { const on = whole(px, py); if (on && clip(px, py)) drew = true; return on; }, shade, n > 1 ? { outline: C[n - 1], clip } : { clip });
  if (!drew) { put(g, B, x + ux * 0.5, y + uy * 0.5, shade); return tip; }
  if (n > 2) g.fill(...bx, lit, face, { clip });
  if (shine && n > 3) g.fill(...bx, line, glint, { clip });
  if (shape === 'prism' && n > 3) {
    // the pointed cap of a prism catches more light than its sides: one tone up on both facets
    const cap = (px, py) => { const [k, c] = local(px, py); return k >= 0.62 && k <= 1 && Math.abs(c) <= hw(k) - 0.5; };
    g.fill(...bx, (px, py) => cap(px, py) && !lit(px, py), face, { clip });
    g.fill(...bx, (px, py) => cap(px, py) && lit(px, py), glint, { clip });
  }
  return tip;
}

/**
 * A snowflake centred on (x, y): straight arms from a small hub, each with pairs of thin twigs angled towards its tip, in one pale colour with a bright line down each arm and a rim; the first arm points up.
 * The arms and twigs take the second colour, the hub and the line down each arm the first, the rim the last.
 * Arguments: g: the Surface; o: { x, y (centre: end both in .5 for a flake that is the same on both sides), r (radius to the arm tips), arms (how many, default 6), twigs (pairs of twigs on each arm, default 2; 0 for bare arms), turn (radians clockwise), thick (half the width of an arm in px, default 1.1; 0.5 or less: one pixel), hub (radius of the middle as a share of r, default 0.18), colour | colours, box }.
 */
export function snowflake(g, o) {
  const { x, y, r = 12, arms = 6, twigs = 2, turn = 0, thick = 1.1, hub = 0.18 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#7aa0f4');
  const nC = C.length, body = C[Math.min(1, Math.max(0, nC - 2))], bright = C[0], rim = nC > 1 ? C[nC - 1] : null;
  if (r < 1) { put(g, B, x, y, body); return; }
  const n = Math.max(2, Math.round(arms)), tw = Math.max(0, Math.round(twigs));
  const bars = [], lines = [], spines = [];
  for (let i = 0; i < n; i++) {
    const a = PI + turn + (i * TAU) / n, ux = Math.sin(a), uy = Math.cos(a);
    bars.push([x, y, x + ux * r, y + uy * r, thick]);
    lines.push([[x, y], [x + ux * r, y + uy * r]]);
    spines.push([[x, y], [x + ux * (r - 1.5), y + uy * (r - 1.5)]]);
    for (let j = 0; j < tw; j++) {
      const k = lerp(0.45, 0.78, tw === 1 ? 0.6 : j / (tw - 1)), len = r * lerp(0.34, 0.2, tw === 1 ? 0.4 : j / (tw - 1));
      const fx = x + ux * r * k, fy = y + uy * r * k;
      for (const s of [-1, 1]) {
        const b = a + s * (PI / 3.4);
        lines.push([[fx, fy], [fx + Math.sin(b) * len, fy + Math.cos(b) * len]]);
      }
    }
  }
  // the 1 px line of every arm and twig, rounded away from the centre the same way on every side, so the flake is symmetrical
  const away = (v) => Math.sign(v) * Math.floor(Math.abs(v) + 0.5 - 1e-6);      // a hair under, so a tie falls the same way on both sides
  const trace = (set, [[ax, ay], [bx, by]]) => {
    const steps2 = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let e = 0; e <= steps2; e++) set.add(Math.floor(y + away(ay + ((by - ay) * e) / steps2 - y)) * 4096 + Math.floor(x + away(ax + ((bx - ax) * e) / steps2 - x)));
  };
  const spine = new Set();
  for (const l of lines) trace(spine, l);
  const hr = r * hub;
  const inside = (px, py) => {
    if ((px - x) ** 2 + (py - y) ** 2 <= hr * hr) return true;
    if (spine.has(Math.floor(py) * 4096 + Math.floor(px))) return true;
    if (thick <= 0.5) return false;
    for (const [ax, ay, bx, by, rr] of bars) {
      const ex = bx - ax, ey = by - ay, q = clamp(((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1e-6));
      if ((px - ax - ex * q) ** 2 + (py - ay - ey * q) ** 2 <= rr * rr) return true;
    }
    return false;
  };
  layered(g, B, inside, rim ? [body, rim] : [body]);
  if (nC > 2 && thick > 0.5) {
    const mid = new Set();
    for (const l of spines) trace(mid, l);
    const clip = inBox(B);
    g.fill(x - r - 1, y - r - 1, x + r + 1, y + r + 1, (px, py) => mid.has(Math.floor(py) * 4096 + Math.floor(px)) || (px - x) ** 2 + (py - y) ** 2 <= (hr - 1) ** 2, bright, { clip });
  }
}

// ---- motes ------------------------------------------------------------------------------------

/** The shapes a mote can take in motes() and moteIn(): dot, plus, leaf, star and heart. No arguments: a frozen list. */
export const MOTE_SHAPES = Object.freeze(['dot', 'plus', 'leaf', 'star', 'heart']);

/**
 * Shape test for one small mote `size` px across, centred on a pixel: a dot, a plus sign, a leaf leaning to one side, a five-point star or a heart, each simplified as it gets smaller so it still reads (under 5 px they are all a small plus or a dot).
 * Arguments: shape (see MOTE_SHAPES); cx, cy (centre: both ending in .5); size (px across: 1, 3, 5, 7, 9 ...); lean (1 or -1: the way a leaf tilts, default 1).
 */
export function moteIn(shape, cx, cy, size, lean = 1) {
  const S = Math.max(1, size), a = S / 2;
  if (S < 2) return (px, py) => Math.abs(px - cx) < 0.5 && Math.abs(py - cy) < 0.5;
  const small = (px, py) => (Math.abs(px - cx) < 1.5 && Math.abs(py - cy) < 0.5) || (Math.abs(px - cx) < 0.5 && Math.abs(py - cy) < 1.5);
  if (shape === 'plus') return S < 4 ? small : crossIn(cx, cy, S, S >= 7 ? 3 : 1);
  if (S < 4) return small;
  if (shape === 'leaf') { const d = a * 0.95; return leafIn(cx - lean * d, cy + d, cx + lean * d, cy - d, S * 0.58, { belly: 0.4, blunt: 0 }); }
  if (shape === 'star') return S < 7 ? (px, py) => Math.abs(px - cx) + Math.abs(py - cy) <= a - 0.4 || small(px, py) : starIn(cx, cy + 0.4, a + 0.9, 5, { inner: 0.46 });
  if (shape === 'heart') return heartIn(cx, cy + 0.2, S, S - 0.6, 'classic');
  return (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= (a - 0.1) ** 2;
}

/**
 * Small shaped motes that rise in a loose column from (x, y) and fade, each at its own height: healing lights, blessings, pollen, souls, bubbles of magic.
 * Each mote is born small, grows to `size`, floats up to its own share of `rise` (swaying a little), then shrinks to a pixel. A young mote is the hottest colour and it cools as it ages; each has a 1 px rim.
 * loop (default): every mote repeats on its own timer, so the clip closes. One-shot (loop: false): they set off one after another over the first `stagger` of the clip (the first at t = 0, the last at t = stagger) and each lives for the rest of it, so the early ones are fading high up while the late ones are still rising; a mote that has faded stays as one rim-coloured pixel drifting up inside the box, so the last frame is never empty.
 * Arguments: g: the Surface; o: { t, x, y, count, seed, loop, cycles, stagger (0..0.9, default 0.5), rise (px the highest one climbs), width (px across the column), size (px across a grown mote), shape (see MOTE_SHAPES), sway (px), colour | colours, box }.
 */
export function motes(g, o) {
  const { t = 0, x, y, count = 6, seed = 0, loop = true, cycles = 1, rise = 30, width = 16, size = 7, shape = 'plus', sway = 1.5 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#7fe0a0');
  const nC = C.length, rim = C[nC - 1], body = nC > 1 ? C.slice(0, nC - 1) : C;
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const clip = inBox(B);
  const stagger = clamp(o.stagger ?? 0.5, 0, 0.9), tt = clamp(t);
  // one-shot: the order they set off in, spread evenly from 0 (the first) to 1 (the last)
  const turn = (i) => (count < 2 ? 0 : ((i * 5) % count) / (count - 1));
  const list = [];
  for (let i = 0; i < count; i++) {
    let life, gone = 0;
    if (loop) life = lifeOf(t, i, { seed, loop: true, cycles });
    else {
      const start = stagger * turn(i), raw = (tt - start) / (1 - stagger);
      if (raw < 0) continue;                                             // not set off yet
      life = Math.min(1, raw); gone = Math.max(0, raw - 1);
    }
    // spread across the column by the golden ratio, so they never bunch on one side
    const lane = count === 1 ? 0 : ((i * 0.618034 + h(0, 2)) % 1) - 0.5;
    const top = rise * (0.45 + 0.55 * h(i, 3));
    let px = x + lane * width + sway * Math.sin(TAU * (life + h(i, 4)));
    let py = y - top * lerp(life, easeOut(life), 0.6) - 5 * gone;
    const grown = life < 0.15 ? lerp(0.4, 1, life / 0.15) : life > 0.5 ? lerp(1, 0.1, (life - 0.5) / 0.5) : 1;
    const s = size * grown;
    const S = s < 2 ? 1 : 2 * Math.round((s - 1) / 2) + 1;               // 1, 3, 5, 7 ...
    if (!loop) { px = keepIn(px, B[0] + S / 2, B[2] - S / 2); py = keepIn(py, B[1] + S / 2, B[3] - S / 2); }
    list.push({ i, life, S, px: Math.floor(px) + 0.5, py: Math.floor(py) + 0.5 });
  }
  list.sort((a, b) => b.life - a.life);                                  // the oldest first, young ones in front
  for (const M of list) {
    if (M.S === 1) {
      if (loop && M.life > 0.97) continue;
      put(g, B, M.px, M.py, !loop && M.life >= 0.95 ? rim : body[body.length - 1]);
      continue;
    }
    const c = stepAt(body, 1 - M.life * 1.15);
    const r = M.S / 2 + 2;
    g.fill(M.px - r, M.py - r, M.px + r, M.py + r, moteIn(shape, M.px, M.py, M.S, h(M.i, 5) < 0.5 ? 1 : -1), c, nC > 1 ? { outline: rim, clip } : { clip });
  }
}

// ---- gathering --------------------------------------------------------------------------------

/**
 * Sparks that spiral from a ring of radius r0 to radius r1 around (x, y), each with a short tail: energy gathering into a caster's hand (r1 smaller than r0) or flung out of it (r1 larger).
 * One-shot over the clip by default: every spark waits at r0, sets off after its own short delay and is at r1 exactly at t = 1; a spark is a cool colour at r0 and the hottest at r1, and its tail is cooler still. loop: true runs each on its own repeating timer.
 * Arguments: g: the Surface; o: { t, x, y, count, seed, loop, cycles, stagger, r0, r1, turns (how far round each one goes: 0.5 = half a turn; negative: the other way), squash (below 1 flattens the spiral into an ellipse), size (px across at r1, default 2), tail (px of tail, default 2; 0 for none), colour | colours, box }.
 */
export function swirl(g, o) {
  const { t = 0, x, y, count = 8, seed = 0, loop = false, cycles = 1, stagger = 0.4, r0 = 14, r1 = 1, turns = 0.5, squash = 1, size = 2, tail = 2 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#f4e06a');
  const body = C.length > 1 ? C.slice(0, C.length - 1) : C, rim = C[C.length - 1];
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const at = (i, life) => {
    const a = TAU * ((i + 0.6 * h(i, 2)) / count + turns * life);
    const r = lerp(r0 * (0.8 + 0.2 * h(i, 3)), r1, life ** 1.4);
    return [x + Math.sin(a) * r, y + Math.cos(a) * r * squash];
  };
  for (let i = 0; i < count; i++) {
    const life = lifeOf(t, i, { seed, loop, cycles, stagger });
    for (let j = Math.round(tail); j >= 1; j--) {
      const back = life - 0.07 * j;
      if (back <= 0) continue;
      put(g, B, ...at(i, back), j === 1 ? body[body.length - 1] : rim);
    }
    const [px, py] = at(i, life);
    const c = stepAt(body, 0.25 + 0.75 * life);
    if (size * (0.7 + 0.3 * life) < 1.5) put(g, B, px, py, c);
    else {
      // a 2 x 2 spark with its rim: eight pixels round it
      const qx = Math.floor(px - 0.5), qy = Math.floor(py - 0.5);
      if (body !== C) for (const d of [0, 1]) { put(g, B, qx + d, qy - 1, rim); put(g, B, qx + d, qy + 2, rim); put(g, B, qx - 1, qy + d, rim); put(g, B, qx + 2, qy + d, rim); }
      put(g, B, qx, qy, c); put(g, B, qx + 1, qy, c); put(g, B, qx, qy + 1, c); put(g, B, qx + 1, qy + 1, c);
    }
  }
}
