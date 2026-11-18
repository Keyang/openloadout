// Burst pieces (added with batch P13: sparkles, poofs and small explosions), the partners of
// engine/fx.js for effects made of a few deliberate marks instead of many particles:
//   sparkMark    one small mark of light in a named style (a plus, a diamond, a dot)
//   sparkRing    a ring of such marks that spreads, drifts up and thins to single pixels (one-shot)
//   sparkOrbit   marks round a point that flare up in turn and are gone again (a loop)
//   blastBall    a cartoon blast: a scalloped or spiked ball in nested tones, which can open into a ring
//   driftUp      where a few things are while they float up and sway (stars over a poof, notes, hearts)
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
 * Draws one small mark of light at (x, y) in a named style, `reach` pixels from its middle to its tips: its arms or edge in the edge colour, its middle in the core colour.
 * Arguments: g (the Surface); x, y (the middle); reach (0 one pixel, 1 to 4 bigger: a plus is 2 * reach + 1 across, a diamond the same, a dot reach + 1); style (one of SPARK_STYLES); colours (a steps list, hottest first with the rim last, or one colour for the arms); options { core (the colour of the middle; default the first of the list, or white), box }.
 */
export function sparkMark(g, x, y, reach, style, colours, { core, box } = {}) {
  if (!SPARK_STYLES.includes(style)) throw new Error(`sparkMark: style "${style}" is not one of ${SPARK_STYLES.join(', ')}`);
  const B = boxOf(g, box);
  const list = Array.isArray(colours) ? colours : null;
  const arm = list ? list.at(-2) ?? list[0] : colours;
  const mid = core ?? (list ? list[0] : '#ffffff');
  const r = Math.max(0, Math.min(4, Math.round(reach)));
  x = Math.floor(x); y = Math.floor(y);
  if (r === 0) return put(g, B, x, y, arm);
  if (style === 'dot') {
    // a bead reach + 1 across, its lit corner (top right) in the core colour
    const n = r + 1, x0 = x - ((n - 1) >> 1), y0 = y - ((n - 1) >> 1);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const corner = (i === 0 || i === n - 1) && (j === 0 || j === n - 1);
      if (n >= 4 && corner) continue;
      const lit = n === 2 ? i === 1 && j === 0 : n === 3 ? i >= 1 && j <= 1 : i >= 1 && i <= n - 2 && j >= 1 && j <= n - 2;
      put(g, B, x0 + i, y0 + j, lit ? mid : arm);
    }
    return;
  }
  if (style === 'diamond') {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.abs(i) + Math.abs(j);
      if (d <= r) put(g, B, x + i, y + j, d === r ? arm : mid);
    }
    return;
  }
  // plus: four arms, a bright middle, and from reach 3 a small square body so it reads as a star
  for (let i = 1; i <= r; i++) {
    const c = r >= 3 && i <= r - 2 ? mid : arm;
    put(g, B, x - i, y, c); put(g, B, x + i, y, c); put(g, B, x, y - i, c); put(g, B, x, y + i, c);
  }
  if (r >= 3) for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, B, x + i, y + j, arm);
  put(g, B, x, y, mid);
}

/**
 * Draws a ring of light marks that spreads from (x, y), drifts up and thins out: the sparkles a collected coin, gem or key leaves; one-shot over the clip, and its last frame keeps one pixel per mark.
 * Arguments: g (the Surface); o: { t (clip phase 0..1), x, y (the middle), count (how many marks), r0, r1 (the ring's radius at the start and at the end), rise (pixels the whole ring drifts up by the end), squash (below 1 flattens the ring), style (one of SPARK_STYLES), reach (the biggest a mark gets, 1 to 4; every other mark is one smaller and fades sooner; all are single pixels at t = 0), turn (angle of the first mark, radians), seed, colour | colours (hottest first, the rim last), core (colour of a mark's middle), box }.
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
    else sparkMark(g, px, py, s, style, C, { core: kk < 0.5 ? o.core ?? C[0] : C[Math.min(1, n - 1)], box: B });
  }
}

/**
 * Draws light marks set round (x, y) that flare up one after another and are gone again, each drifting up while it shows: the shimmer round a rare item; a loop that closes, with about `share` of the marks in view at any moment.
 * Arguments: g (the Surface); o: { t (loop phase 0..1), x, y (the middle), count (how many marks), r (how far from the middle they sit), rise (pixels a mark drifts up while it shows), squash (below 1 flattens the circle), style (one of SPARK_STYLES), reach (the biggest a mark gets, 1 to 3), share (0..1: the part of the loop each mark is seen, default 0.5), cycles (whole number of flares per loop, default 1), turn (angle of the first mark), seed, colour | colours (hottest first, the rim last), core (colour of a mark's middle), box }.
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
    else sparkMark(g, px, py, s, style, C, { core: o.core ?? C[0], box: B });
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
 * Arguments: o: { t (clip phase 0..1), x, y (where they start), count (how many), rise (pixels the highest one climbs), spread (pixels the outer ones start to either side of x), sway (pixels of side-to-side drift), from (the clip phase at which the first sets off, default 0), stagger (0..1: how much later the last sets off, as a share of what is left of the clip; default 0.3), seed }.
 */
export function driftUp(o) {
  const { t = 0, x, y, count = 3, rise = 10, spread = 6, sway = 1.5, from = 0, stagger = 0.3, seed = 0 } = o;
  const out = [];
  for (let i = 0; i < count; i++) {
    const order = count === 1 ? 0 : ((i * 2 + 1) % count) / (count - 1 || 1);     // not left to right: the middle one need not be last
    const start = from + (1 - from) * clamp(stagger) * clamp(order);
    if (t < start) continue;
    const life = start >= 1 ? 1 : clamp((t - start) / (1 - start));
    const side = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2 * spread;
    out.push({
      i, life,
      x: x + side + sway * Math.sin(TAU * (0.75 * life + hash(i, seed * 64 + 3))),
      y: y - rise * (0.65 + 0.35 * hash(i, seed * 64 + 4)) * easeOut(life),
    });
  }
  return out;
}
