// Burst pieces (added with batch P13: sparkles, poofs and small explosions), the partners of
// engine/fx.js for effects made of a few deliberate marks instead of many particles:
//   sparkMark    one small mark of light in a named style (a plus, a diamond, a dot)
//   sparkRing    a ring of such marks that spreads, drifts up and thins to single pixels (one-shot)
//   sparkOrbit   marks round a point that flare up in turn and are gone again (a loop)
//   blastBall    a cartoon blast: a scalloped or spiked ball in nested tones, which can open into a ring
//   driftUp      where a few things are while they float up and sway (stars over a poof, notes, hearts)
//   sparkFlash   the white flash a burst of sparks starts with, in the same three styles
//   embers       glowing beads thrown outward from a blast, which cool and end as single pixels
//   puffRing     round puffs on a ring that widens while they thin: a poof breaking up, a smoke ring
// Like fx.js: hard pixels, no Math.random, everything stays inside the frame's 1 px empty border (or
// inside `box`), colour lists are hottest first with the rim last (fx.steps), and a one-shot keeps
// pixels on its last frame. Draw these AFTER g.outline(INK): light is rimmed with its own dark tone.
// They write pixels directly, as fx.js does, so they suit pixel-grid styles only.
//
//   import { steps } from '../engine/fx.js';
//   import { sparkRing, sparkOrbit, blastBall, driftUp } from '../engine/bursts.js';
//   const C = steps(p.edge, { core: p.core, white: false });                      // [core, middle, edge, rim]
//   sparkRing(g, { t, x: 15.5, y: 15.5, count: 6, r0: 4, r1: 11, style: 'plus', reach: 2, colours: C });
//   sparkOrbit(g, { t, x: 15.5, y: 15.5, count: 6, r: 9, rise: 3, style: 'diamond', reach: 2, colours: C });
//   blastBall(g, { x: 24, y: 24, r: 12, bumps: 7, bump: 0.18, colours: C });      // frames 1 to 2 of an explosion
//   blastBall(g, { x: 24, y: 24, r: 14, hole: 8, colours: C.slice(1) });          // ... opening into a ring
//   for (const s of driftUp({ t, x: 24, y: 22, count: 3, rise: 12, from: 0.5 })) drawMark(g, 'star', s.x, s.y, 7, p.core);

import { steps } from './fx.js';
import { col } from './color.js';
import { hash, fract, clamp, lerp, easeOut, TAU, PI } from './motion.js';

function boxOf(g, box) {
  const b = [1, 1, g.w - 1, g.h - 1];
  if (box) { b[0] = Math.max(b[0], Math.floor(box[0])); b[1] = Math.max(b[1], Math.floor(box[1])); b[2] = Math.min(b[2], Math.floor(box[2])); b[3] = Math.min(b[3], Math.floor(box[3])); }
  return b;
}

function put(g, B, x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < B[0] || y < B[1] || x >= B[2] || y >= B[3]) return;
  g.dot(x, y, c);
}

const listOf = (o, fallback = '#f2c230') => (Array.isArray(o.colours) ? o.colours : steps(o.colour ?? fallback, { white: false }));
const within = (v, lo, hi) => (hi < lo ? (lo + hi) / 2 : v < lo ? lo : v > hi ? hi : v);

/** The styles sparkMark, sparkRing and sparkOrbit draw: plus (a four-point twinkle), diamond (a filled lozenge), dot (a round bead). No arguments: a frozen list. */
export const SPARK_STYLES = Object.freeze(['plus', 'diamond', 'dot']);

/**
 * Draws one small mark of light at (x, y) in a named style, `reach` pixels from its middle to its tips: its arms or edge in the edge colour, its middle in the core colour, and from reach 2 its tips in the rim colour.
 * Arguments: g (the Surface); x, y (the middle); reach (0 one pixel, 1 to 4 bigger: a plus is 2 * reach + 1 across, a diamond the same, a dot reach + 1); style (one of SPARK_STYLES); colours (a steps list, hottest first with the rim last, or one colour for the arms); options { core (the colour of the middle; default the first of the list, or white), full (true: on a plus the core colour also fills each arm up to the pixel before its tip, so the core colour is most of the mark; default false), box }.
 */
export function sparkMark(g, x, y, reach, style, colours, { core, full = false, box } = {}) {
  if (!SPARK_STYLES.includes(style)) throw new Error(`sparkMark: style "${style}" is not one of ${SPARK_STYLES.join(', ')}`);
  const B = boxOf(g, box);
  const list = Array.isArray(colours) ? colours : null;
  const arm = list ? list.at(-2) ?? list[0] : colours;
  const mid = core ?? (list ? list[0] : '#ffffff');
  const tip = list && list.length >= 3 ? list.at(-1) : arm;      // the tips of a bigger mark cool to the rim colour, so it also shows on a pale background
  const r = Math.max(0, Math.min(4, Math.round(reach)));
  x = Math.floor(x); y = Math.floor(y);
  if (r === 0) return put(g, B, x, y, arm);
  if (style === 'dot') {
    // a bead reach + 1 across, its lit corner (top right) in the core colour
    const n = r + 1, x0 = x - ((n - 1) >> 1), y0 = y - ((n - 1) >> 1);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const corner = (i === 0 || i === n - 1) && (j === 0 || j === n - 1);
      if (n >= 4 && corner) continue;
      if (n >= 3 && (i === 0 || j === n - 1) && !(i === n - 1 || j === 0)) { put(g, B, x0 + i, y0 + j, tip); continue; }   // its shaded side, bottom left
      const lit = n === 2 ? i === 1 && j === 0 : n === 3 ? i >= 1 && j <= 1 : i >= 1 && i <= n - 2 && j >= 1 && j <= n - 2;
      put(g, B, x0 + i, y0 + j, lit ? mid : arm);
    }
    return;
  }
  if (style === 'diamond') {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.abs(i) + Math.abs(j);
      if (d <= r) put(g, B, x + i, y + j, d < r ? mid : r >= 2 && (i === 0 || j === 0) ? tip : arm);
    }
    return;
  }
  // plus: four arms, a bright middle, and from reach 3 a small square body so it reads as a star
  for (let i = 1; i <= r; i++) {
    const c = (full ? i < r : r >= 3 && i <= r - 2) ? mid : r >= 2 && i === r ? tip : arm;
    put(g, B, x - i, y, c); put(g, B, x + i, y, c); put(g, B, x, y - i, c); put(g, B, x, y + i, c);
  }
  if (r >= 3) for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, B, x + i, y + j, arm);
  put(g, B, x, y, mid);
}

/**
 * Draws a ring of light marks that spreads from (x, y), drifts up and thins out: the sparkles a collected coin, gem or key leaves; one-shot over the clip, and its last frame keeps one pixel per mark.
 * Arguments: g (the Surface); o: { t (clip phase 0..1), x, y (the middle), count (how many marks), r0, r1 (the ring's radius at the start and at the end), rise (pixels the whole ring drifts up by the end), squash (below 1 flattens the ring), style (one of SPARK_STYLES), reach (the biggest a mark gets, 1 to 4; every other mark is one smaller and fades sooner; all are single pixels at t = 0), turn (angle of the first mark, radians), seed, colour | colours (hottest first, the rim last), core (colour of a mark's middle), full (as sparkMark: the core colour fills the arms of a plus), box }.
 */
export function sparkRing(g, o) {
  const { t = 0, x, y, count = 6, r0 = 3, r1 = 10, rise = 0, squash = 1, style = 'plus', reach = 2, turn = 0, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = listOf(o), n = C.length, rim = C[n - 1], edge = C[Math.max(0, n - 2)];
  const k = clamp(t);
  for (let i = 0; i < count; i++) {
    const small = i % 2 === 1;
    const a = turn + ((i + 0.5) * TAU) / count + (hash(i, seed * 64 + 2) - 0.5) * 0.12;
    const d = lerp(r0, r1 * (small ? 0.86 : 1), easeOut(k));
    const kk = clamp(k * (small ? 1.2 : 1));
    const top = Math.max(1, Math.round(reach) - (small ? 1 : 0));
    const s = kk < 0.08 ? 0 : kk < 0.4 ? top : kk < 0.6 ? Math.max(0, top - 1) : kk < 0.78 ? Math.max(0, top - 2) : 0;
    const px = within(x + Math.sin(a) * d, B[0] + s + 0.5, B[2] - s - 0.5), py = within(y + Math.cos(a) * d * squash - rise * k, B[1] + s + 0.5, B[3] - s - 0.5);
    if (s === 0) put(g, B, px, py, k >= 1 ? rim : edge);
    else sparkMark(g, px, py, s, style, C, { core: kk < 0.5 ? o.core ?? C[0] : C[Math.min(1, n - 1)], full: o.full, box: B });
  }
}

/**
 * Draws light marks set round (x, y) that flare up one after another and are gone again, each drifting up while it shows: the shimmer round a rare item; a loop that closes, with about `share` of the marks in view at any moment.
 * Arguments: g (the Surface); o: { t (loop phase 0..1), x, y (the middle), count (how many marks), r (how far from the middle they sit), rise (pixels a mark drifts up while it shows), squash (below 1 flattens the circle), style (one of SPARK_STYLES), reach (the biggest a mark gets, 1 to 3), share (0..1: the part of the loop each mark is seen, default 0.5), cycles (whole number of flares per loop, default 1), turn (angle of the first mark), seed, colour | colours (hottest first, the rim last), core (colour of a mark's middle), full (as sparkMark: the core colour fills the arms of a plus), box }.
 */
export function sparkOrbit(g, o) {
  const { t = 0, x, y, count = 6, r = 9, rise = 0, squash = 1, style = 'plus', reach = 2, share = 0.5, cycles = 1, turn = 0, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = listOf(o), n = C.length, edge = C[Math.max(0, n - 2)];
  const top = Math.max(1, Math.round(reach));
  // neighbours do not flare one after the other: the order steps round the circle by a stride that shares no factor with the count
  let stride = Math.max(1, Math.round(count * 0.4));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  while (stride > 1 && gcd(stride, count) !== 1) stride--;
  for (let i = 0; i < count; i++) {
    const turnOf = (i * stride) % count;
    const life = fract(cycles * t + turnOf / count);
    if (life >= share) continue;
    const k = life / share;
    const a = turn + ((i + 0.5) * TAU) / count + (hash(i, seed * 64 + 2) - 0.5) * 0.5;
    const d = r * (0.72 + 0.28 * hash(i, seed * 64 + 3));
    const s = k < 0.2 ? 0 : k < 0.4 ? Math.max(1, top - 1) : k < 0.6 ? top : k < 0.8 ? Math.max(1, top - 1) : 0;
    const px = within(x + Math.sin(a) * d, B[0] + s + 0.5, B[2] - s - 0.5), py = within(y + Math.cos(a) * d * squash - rise * k, B[1] + s + 0.5, B[3] - s - 0.5);
    if (s === 0) put(g, B, px, py, edge);
    else sparkMark(g, px, py, s, style, C, { core: o.core ?? C[0], full: o.full, box: B });
  }
}

/**
 * Draws a cartoon blast at (x, y): a ball with a scalloped or spiked edge in nested tones (hottest in the middle, a rim of the last colour round it), which opens into a ring when `hole` is given.
 * Arguments: g (the Surface); o: { x, y (the middle), r (radius to the tips of its edge), hole (radius of the empty middle; 0 for a ball), bumps (how many scallops or spikes), bump (0..0.6: how deep they are, as a share of r; 0 is a plain disc), points (true: straight spikes, a star; false: round scallops), turn (radians: turns the edge, so it can boil from frame to frame), heat (0..1: how far the hot colours reach, default 0.5), gaps (0..1: the share of a ring broken away, as it thins out), seed, colour | colours (hottest first, the rim last), box }. Returns the number of pixels it painted, the rim not counted.
 */
export function blastBall(g, o) {
  const { x, y, r = 8, hole = 0, bumps = 7, bump = 0.15, points = false, turn = 0, heat = 0.5, gaps = 0, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = listOf(o, '#e08a2c'), n = C.length;
  if (!(r > 0)) return 0;
  const body = n > 1 ? C.slice(0, n - 1) : C, m = body.length, rim = col(C[n - 1]);
  const packed = body.map((c) => col(c));
  const x0 = Math.max(B[0], Math.floor(x - r - 1)), y0 = Math.max(B[1], Math.floor(y - r - 1));
  const x1 = Math.min(B[2] - 1, Math.ceil(x + r + 1)), y1 = Math.min(B[3] - 1, Math.ceil(y + r + 1));
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w <= 0 || h <= 0) return 0;
  const depth = clamp(bump, 0, 0.6), e = lerp(1.7, 0.6, clamp(heat)), SECT = 12;
  // 0 = outside; otherwise 1 + the index of its colour
  const mask = new Uint8Array(w * h);
  let painted = 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const dx = x0 + xx + 0.5 - x, dy = y0 + yy + 0.5 - y, d = Math.hypot(dx, dy);
    const th = Math.atan2(dx, dy) + PI;
    const u = fract(((th + turn) * bumps) / TAU);
    const lobe = points ? 1 - Math.abs(2 * u - 1) : Math.abs(Math.cos(PI * u));
    const ro = r * (1 - depth * (1 - lobe));
    if (d > ro || (hole > 0 && d < hole)) continue;
    if (gaps > 0 && hole > 0) { const s = Math.floor((fract(th / TAU) * SECT)) % SECT; if (hash(s, seed * 64 + 5) < gaps) continue; }
    const deep = hole > 0 ? Math.min(ro - d, d - hole) / Math.max(0.5, (ro - hole) / 2) : (ro - d) / ro;
    mask[yy * w + xx] = 1 + Math.max(0, m - 1 - Math.floor(clamp(deep) ** e * m * 0.999));
    painted++;
  }
  const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx] > 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = (y0 + yy) * g.w + x0 + xx, v = mask[yy * w + xx];
    const edged = !(on(xx - 1, yy) && on(xx + 1, yy) && on(xx, yy - 1) && on(xx, yy + 1));
    if (v) g.data[i] = edged ? packed[m - 1] : packed[v - 1];                 // the coolest colour always lines the edge
    else if (n > 1 && (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1))) g.data[i] = rim;
  }
  return painted;
}

/**
 * Works out where a few things are while they float up from (x, y) and sway: stars or skulls over a poof, notes, hearts, bubbles; returns a list of { i, x, y, life (0 just out to 1 at the top) } for the ones that have set off.
 * Arguments: o: { t (clip phase 0..1), x, y (where they start), count (how many), rise (pixels the highest one climbs), spread (pixels the outer ones start to either side of x), sway (pixels of side-to-side drift), from (the clip phase at which the first sets off, default 0), stagger (0..1: how much later the last sets off, as a share of what is left of the clip; default 0.3), seed, box ([x0, y0, x1, y1], for example [1, 1, width - 1, height - 1]: when given, every place returned is kept inside it, so a caller never clamps to the frame by hand), pad (pixels kept between a place and each side of the box: half the size of the thing drawn there, plus one for an outline; default 0) }.
 */
export function driftUp(o) {
  const { t = 0, x, y, count = 3, rise = 10, spread = 6, sway = 1.5, from = 0, stagger = 0.3, seed = 0, box = null, pad = 0 } = o;
  const out = [];
  for (let i = 0; i < count; i++) {
    const order = count === 1 ? 0 : ((i * 2 + 1) % count) / (count - 1 || 1);     // not left to right: the middle one need not be last
    const start = from + (1 - from) * clamp(stagger) * clamp(order);
    if (t < start) continue;
    const life = start >= 1 ? 1 : clamp((t - start) / (1 - start));
    const side = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2 * spread;
    let px = x + side + sway * Math.sin(TAU * (0.75 * life + hash(i, seed * 64 + 3)));
    let py = y - rise * (0.65 + 0.35 * hash(i, seed * 64 + 4)) * easeOut(life);
    // inside the box: the centre pixel (the place rounded down) stays `pad` pixels from every side
    if (box) { px = within(px, box[0] + pad, box[2] - pad - 1); py = within(py, box[1] + pad, box[3] - pad - 1); }
    out.push({ i, life, x: px, y: py });
  }
  return out;
}

// ---- added in the first fix round of batch P13: sparkFlash, embers, puffRing ----

/**
 * Draws the flash a burst of sparks starts with at (x, y), in the style of its marks and r pixels from its middle to its tips: a four-point star (plus), a lozenge (diamond) or a disc (dot), white inside, lined with the core colour and rimmed with the edge colour, so frame 0 of a burst is its biggest and brightest picture.
 * Arguments: g (the Surface); x, y (the middle: a pixel centre, ending in .5, gives a flash that is the same on every side); r (pixels from the middle to a tip of the star; the lozenge and the disc are drawn to cover about as much); style (one of SPARK_STYLES); colours (a steps list, hottest first with the rim last, or one colour for the rim); options { core (the colour of its body, default white), box }. Returns the number of pixels it painted, the rim included.
 */
export function sparkFlash(g, x, y, r, style, colours, { core = '#ffffff', box } = {}) {
  if (!SPARK_STYLES.includes(style)) throw new Error(`sparkFlash: style "${style}" is not one of ${SPARK_STYLES.join(', ')}`);
  const B = boxOf(g, box);
  const list = Array.isArray(colours) ? colours : null;
  const lining = list ? list[0] : core, rim = list ? list.at(-2) ?? list[0] : colours;
  if (!(r > 0)) return 0;
  const P = 0.62, rp = r ** P;
  const inside = style === 'dot' ? (dx, dy) => dx * dx + dy * dy <= (r * 0.6) ** 2
    : style === 'diamond' ? (dx, dy) => Math.abs(dx) + Math.abs(dy) <= r * 0.8
      : (dx, dy) => Math.abs(dx) ** P + Math.abs(dy) ** P <= rp;                // a star with four hollow sides
  const at = (px, py) => inside(px + 0.5 - x, py + 0.5 - y);
  const x0 = Math.floor(x - r - 1), y0 = Math.floor(y - r - 1), x1 = Math.ceil(x + r + 1), y1 = Math.ceil(y + r + 1);
  let painted = 0;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    if (px < B[0] || py < B[1] || px >= B[2] || py >= B[3]) continue;
    const near = at(px - 1, py) && at(px + 1, py) && at(px, py - 1) && at(px, py + 1);
    if (at(px, py)) { g.dot(px, py, near ? core : lining); painted++; }
    else if (at(px - 1, py) || at(px + 1, py) || at(px, py - 1) || at(px, py + 1)) { g.dot(px, py, rim); painted++; }
  }
  return painted;
}

/**
 * Draws glowing beads thrown outward from (x, y): the embers of a blast, sparks off an anvil, hot crumbs. Each is a small hot bead inside a rim of the edge colour, with a short streak behind it while it is fast; it flies from radius r0 to r1 along its own direction at its own speed, cools, and after `hold` is one pixel; one-shot over the clip, and its last frame keeps one pixel per bead.
 * Arguments: g (the Surface); o: { t (clip phase 0..1), x, y (the middle), count (how many), r0 (how far out the nearest are at t = 0: put it outside the fire, so they show against the background), r1 (how far the farthest gets), size (pixels across a bead before its rim: 2 or 3), hold (0..1: the phase up to which a bead keeps its size, default 0.6; after it each is one pixel), tail (pixels of streak behind a bead at t = 0, default 3; it is gone by `hold`), gravity (pixels they fall by the end), turn (angle of the first bead, radians), seed, colour | colours (hottest first, the rim last), box }. Returns the number of beads drawn at full size.
 */
export function embers(g, o) {
  const { t = 0, x, y, count = 8, r0 = 0, r1 = 12, size = 2, hold = 0.6, tail = 3, gravity = 0, turn = 0, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = listOf(o, '#e08a2c'), n = C.length, rim = C[n - 1], edge = C[Math.max(0, n - 2)];
  const k = clamp(t), big = k <= hold, s = Math.max(2, Math.min(3, Math.round(size)));
  const young = k <= hold / 2;                                         // young beads are a step hotter, in a brighter rim
  const lit = C[young ? 0 : Math.min(1, Math.max(0, n - 2))], body = C[Math.min(young ? 1 : 2, Math.max(0, n - 2))], ringOf = young ? edge : rim;
  const streak = big && hold > 0 ? Math.round(tail * (1 - k / hold)) : 0;
  let full = 0;
  for (let i = 0; i < count; i++) {
    const h = (ch) => hash(i, seed * 64 + ch);
    const a = turn + ((i + 0.5 + (h(2) - 0.5) * 0.8) * TAU) / count, ux = Math.sin(a), uy = Math.cos(a);
    // each has a head start and a speed of its own, so they never sit on one circle
    const d = r0 + (r1 - r0) * (0.35 * h(4) + 0.65 * (0.5 + 0.5 * h(3)) * easeOut(k));
    const m = big ? s / 2 + 1 : 0.5;
    const px = within(x + ux * d, B[0] + m, B[2] - m), py = within(y + uy * d + gravity * k * k, B[1] + m, B[3] - m);
    if (!big) { put(g, B, px, py, k >= 1 ? rim : edge); continue; }
    for (let q = 1; q <= streak; q++) put(g, B, px - ux * (s / 2 + 0.5 + q), py - uy * (s / 2 + 0.5 + q), ringOf);
    const bx = Math.round(px - s / 2), by = Math.round(py - s / 2);
    for (let j = -1; j <= s; j++) for (let q = -1; q <= s; q++) {
      const ex = q < 0 || q >= s, ey = j < 0 || j >= s;
      if (ex && ey) continue;                                          // no corners on the rim: a round bead
      put(g, B, bx + q, by + j, ex || ey ? ringOf : q >= s - 1 && j === 0 ? lit : s === 3 && q >= 1 && j <= 1 ? lit : body);
    }
    full++;
  }
  return full;
}

/**
 * Draws round puffs set evenly on a ring round (x, y) that widens from r0 to r1 while every puff thins from `size` to a wisp: a poof breaking up, the smoke ring a blast leaves. Puffs that touch join into one cloud with one rim and one shadow; nothing is drawn nearer the middle than the ring's radius less a puff's radius and its rim (with lobes, less 1.6 times its radius); one-shot, and its last frame keeps a speck per puff.
 * Arguments: g (the Surface); o: { t (phase 0..1), x, y (the middle), count (how many puffs), r0, r1 (the ring's radius at the start and at the end; it eases out), size (a puff's radius at the start), end (its radius at the end, default 0.8: a speck), hold (0..1: the phase up to which the puffs keep their full size, default 0; after it they thin fast at first), rise (pixels the ring drifts up by the end), cool (the phase from which the puffs lose their light top and take the next colour, default 0.8), uneven (0..1: how much the puffs differ in size and place, default 0.5), apart (true: every puff is painted on its own, one over the other, so puffs that overlap stay round and distinct; default false: they join into one cloud), lobes (1 to 3 lumps per puff: 1 is a round puff, 2 or 3 a small ragged cloud with a lump at its side, for smoke; default 1), turn (angle of the first puff, radians; 0 puts one straight below the middle), seed, colour | colours (lightest first, the rim last), box }. Returns the number of puffs drawn bigger than a speck.
 */
export function puffRing(g, o) {
  const { t = 0, x, y, count = 6, r0 = 4, r1 = 12, size = 5, end = 0.8, hold = 0, rise = 0, cool = 0.8, uneven = 0.5, apart = false, lobes = 1, turn = 0, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = listOf(o, '#8f97a8'), n = C.length, rim = C[n - 1], top = Math.max(0, n - 2);
  const k = clamp(t), u = hold >= 1 ? 0 : clamp((k - hold) / (1 - hold));
  const idx = k < cool ? 0 : 1, base = C[Math.min(idx, top)], dark = C[Math.min(idx + 1, top)];
  const ring = lerp(r0, r1, easeOut(k)), rad = lerp(size, end, easeOut(u)), v = clamp(uneven);
  const discs = [], specks = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < count; i++) {
    const h = (ch) => hash(i, seed * 64 + ch);
    const a = turn + ((i + (h(2) - 0.5) * 0.4 * v) * TAU) / count;
    const d = ring * (1 + (h(3) - 0.5) * 0.16 * v), r = rad * (1 + (h(5) - 0.5) * 0.24 * v);
    const px = within(x + Math.sin(a) * d, B[0] + r + 1, B[2] - r - 1), py = within(y + Math.cos(a) * d - rise * k, B[1] + r + 1, B[3] - r - 1);
    if (r < 0.9) { specks.push([px, py]); continue; }
    discs.push([px, py, r * r, r]);
    // the extra lumps of a ragged puff sit at its sides, a little lower, and are left out once they are under a pixel
    const flip = h(6) < 0.5 ? -1 : 1;
    for (let j = 0; j < Math.min(2, Math.round(lobes) - 1); j++) {
      const [lx, ly, ls] = j === 0 ? [-0.85, 0.3, 0.7] : [0.9, 0.38, 0.62];
      if (r * ls >= 0.75) discs.push([px + flip * lx * r, py + ly * r, (r * ls) ** 2, r * ls]);
    }
    x0 = Math.min(x0, px - 2 * r); y0 = Math.min(y0, py - r); x1 = Math.max(x1, px + 2 * r); y1 = Math.max(y1, py + r);
  }
  if (discs.length) {
    const inside = (px, py) => { for (const [cx, cy, rr] of discs) if ((px - cx) ** 2 + (py - cy) ** 2 <= rr) return true; return false; };
    const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
    const paint = { base, dark, light: base }, opt = { shade: rad >= 2.5 ? 1 : 0, outline: rim, clip };
    if (apart) for (const [cx, cy, rr, r] of discs) g.fill(cx - r, cy - r, cx + r, cy + r, (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= rr, paint, opt);
    else g.fill(x0, y0, x1, y1, inside, paint, opt);
  }
  for (const [px, py] of specks) put(g, B, px, py, k > 0.8 ? rim : base);
  return discs.length;
}
