// Effect helpers: repeatable particles, twinkles, expanding rings, shards, smoke puffs
// and the white-core-to-dark-rim colour steps of an effect (docs/style-guide.md
// sections 2, 4 and 14). Every function draws onto a Surface with hard pixel edges,
// uses no Math.random (each particle's life is fract(t + hash(i))), and stays inside
// the frame's 1 px empty border, or inside `box` when one is given.
//
//   import { steps, particles, sparkles, ring, shards, smoke, glow, twinkle } from '../engine/fx.js';
//   const C = steps(p.edge, { core: p.core });              // ['#ffffff', core, mid, edge, rim]: hottest first
//   glow(g, 24, 24, 6 * (1 - t), C);                         // frame 0 of a burst: the white core
//   ring(g, { t, x: 24, y: 24, r1: 20, colours: C });        // one-shot shockwave
//   particles(g, { t, x: 24, y: 44, count: 8, colour: p.core });   // looping sparks; t = 0 and t = 1 match
//
// Shared options (all optional except t and, where there is one, x / y):
//   t        clip phase 0..1. Looping helpers close exactly at whole `cycles`.
//   seed     integer: a different seed gives a different but repeatable pattern.
//   colour   one '#rrggbb' (turned into steps(colour)), or colours: a list hottest first
//            (usually steps(...)). Every helper takes either. Helpers that need one body colour
//            (smoke, shards, the arms of a twinkle) use `colour`, or the edge step colours.at(-2).
//   white    false: steps without the white core, for things that are not hot (dust, slime).
//   box      [x0, y0, x1, y1]: draw only where x0 <= x < x1 and y0 <= y < y1. Always inside
//            the frame's 1 px border.
//   loop     true: each particle repeats on its own timer; false: one burst over the clip.
//            One-shots (particles with loop: false, shards, ring) keep every piece inside the box
//            (pieces stop at its edge, a ring stops growing at it), so no frame is ever empty.
//            ring() throws if its centre is outside the box.
// Angles use the rig convention: 0 = down, PI/2 = right, PI = up.
//
// Draw these AFTER g.outline(INK): light is rimmed with a darker tone of its own colour,
// never with ink (section 2). smoke() and shards() add that rim themselves.

import { tone, mix, ramp, col } from './color.js';
import { hash, fract, clamp, lerp, easeOut, TAU, PI } from './motion.js';

// ---- colours ----------------------------------------------------------------

/**
 * The colour steps of an effect, hottest first:
 * [white, core, mid, edge, rim] where rim = tone(edge, -1).
 * opt.core: the inside colour (default: edge lightened toward yellow).
 * opt.white: false drops the white step (smoke, slime: things that are not hot).
 */
export function steps(edge, { core, white = true } = {}) {
  const c = core ?? tone(edge, 1.6);
  const list = [c, mix(c, edge, 0.5), edge, tone(edge, -1)];
  return white ? ['#ffffff', ...list] : list;
}

/** Pick a step by heat: 1 = the hottest (first), 0 = the rim (last). */
export function stepAt(list, heat) {
  const k = clamp(heat);
  return list[Math.round((1 - k) * (list.length - 1))];
}

const coloursOf = (o, fallback = '#f2c230') => (Array.isArray(o.colours) ? o.colours : steps(o.colour ?? fallback, o.white === false ? { white: false } : {}));
/** One body colour: `colour`, else the edge step of `colours` (second from last). */
const baseOf = (o, fallback) => (typeof o.colour === 'string' ? o.colour : Array.isArray(o.colours) ? o.colours.at(-2) ?? o.colours[0] : fallback);
const inside01 = (v, lo, hi) => Math.min(Math.max(v, lo + 0.01), hi - 0.01);

// ---- timing -----------------------------------------------------------------

/**
 * Life 0..1 of particle i at clip phase t.
 * loop (default): fract(cycles * t + hash(i)), so the clip closes at whole cycles.
 * one-shot (loop: false): each particle waits at 0 (in the hot core) for a delay of up to
 * `stagger` of the clip, then ages, reaching 1 exactly at t = 1. So frame 0 of a burst is the
 * whole cluster at its brightest.
 */
export function lifeOf(t, i, { seed = 0, loop = true, cycles = 1, stagger = 0.6 } = {}) {
  const h = hash(i, seed * 64 + 1);
  if (loop) return fract(cycles * t + h);
  const tt = clamp(t), delay = h * stagger;
  if (tt <= delay) return 0;
  return delay >= 1 ? 1 : (tt - delay) / (1 - delay);
}

// ---- pixels -----------------------------------------------------------------

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

/** Fill pixels whose centre is inside, choosing each pixel's colour with colourAt(px, py) (null skips). */
function paint(g, B, x0, y0, x1, y1, colourAt) {
  const ax = Math.max(B[0], Math.floor(x0)), ay = Math.max(B[1], Math.floor(y0));
  const bx = Math.min(B[2] - 1, Math.ceil(x1)), by = Math.min(B[3] - 1, Math.ceil(y1));
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const c = colourAt(x + 0.5, y + 0.5);
    if (c) g.data[y * g.w + x] = col(c);
  }
}

/** A hard disc; under one pixel across it is one pixel. */
function disc(g, B, cx, cy, r, c) {
  if (r < 0.75) return put(g, B, cx, cy, c);
  paint(g, B, cx - r, cy - r, cx + r, cy + r, (px, py) => ((px - cx) ** 2 + (py - cy) ** 2 <= r * r ? c : null));
}

// ---- helpers ----------------------------------------------------------------

/**
 * A four-point sparkle at (x, y). size 0 = one pixel, 1 = a plus, 2 = a big plus.
 * The centre is white (opt.core) from size 1 up.
 */
export function twinkle(g, x, y, size, colour, { core = '#ffffff', box } = {}) {
  const B = boxOf(g, box);
  if (Array.isArray(colour)) colour = baseOf({ colours: colour });
  const s = Math.max(0, Math.round(size));
  x = Math.floor(x); y = Math.floor(y);
  for (let i = 1; i <= s; i++) { put(g, B, x - i, y, colour); put(g, B, x + i, y, colour); put(g, B, x, y - i, colour); put(g, B, x, y + i, colour); }
  put(g, B, x, y, s ? core : colour);
}

/**
 * Concentric hard discs from the rim (radius r, 1 px wide) in to a white centre:
 * the brightest frame of a burst, a muzzle flash, a glowing orb. colours: hottest first.
 */
export function glow(g, x, y, r, colours, { box } = {}) {
  const B = boxOf(g, box);
  const list = Array.isArray(colours) ? colours : steps(colours);
  const n = list.length;
  if (r <= 0) return;
  disc(g, B, x, y, r, list[n - 1]);
  const inner = r - 1;
  for (let j = n - 2; j >= 0; j--) {
    const rr = inner * (j + 1) / (n - 1);
    if (rr <= 0) continue;
    disc(g, B, x, y, rr, list[j]);
  }
}

/**
 * Particles thrown from (x, y): sparks, embers, bubbles, motes.
 * angle / arc: the direction and the width of the cone (arc 2*PI = all round).
 * dist: how far one travels in its life; gravity: px it falls by the end (negative floats up);
 * size: px across when born (shrinks with age); spread: px of scatter at the start;
 * wobble: px of side-to-side sway; lifespan (loops): fraction of the cycle a particle is seen.
 * A particle's colour runs through the steps from hot to rim as it ages. A one-shot ends
 * with every particle as one rim-coloured pixel, so the last frame is never empty.
 */
export function particles(g, o) {
  const { t = 0, x, y, count = 8, seed = 0, loop = true, cycles = 1, stagger = 0.6, angle = PI, arc = PI / 2, dist = 12, gravity = 0, size = 2, spread = 0, wobble = 0, lifespan = 1 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o);
  const h = (i, ch) => hash(i, seed * 64 + ch);
  for (let i = 0; i < count; i++) {
    const life = lifeOf(t, i, { seed, loop, cycles, stagger });
    if (loop && life >= lifespan) continue;
    const k = loop ? life / lifespan : life;
    const a = angle + (h(i, 2) - 0.5) * arc;
    const d = dist * (0.55 + 0.45 * h(i, 3)) * easeOut(k);
    let px = x + (h(i, 4) - 0.5) * 2 * spread + Math.sin(a) * d + wobble * Math.sin(TAU * (k + h(i, 5)));
    let py = y + Math.cos(a) * d + gravity * k * k;
    if (!loop) { px = inside01(px, B[0], B[2]); py = inside01(py, B[1], B[3]); }   // one-shots stop at the box edge
    const s = size * (1 - k);
    const c = stepAt(C, 1 - k);
    if (loop && s < 0.5) continue;
    if (s < 1.5) put(g, B, px, py, c);
    else if (s < 2.5) { const qx = Math.floor(px - 0.5), qy = Math.floor(py - 0.5); put(g, B, qx, qy, c); put(g, B, qx + 1, qy, c); put(g, B, qx, qy + 1, c); put(g, B, qx + 1, qy + 1, c); }
    else { disc(g, B, px, py, s / 2, C[C.length - 1]); disc(g, B, px, py, s / 2 - 1, c); }
  }
}

/**
 * Twinkles scattered over an area (default: the whole box), each on its own repeating
 * timer: off, a pixel, a plus, a big plus, back down. A looping glint field for gems,
 * stars, magic. area: [x0, y0, x1, y1]; `big`: false keeps them to pluses.
 */
export function sparkles(g, o) {
  const { t = 0, count = 5, seed = 0, cycles = 1, big = true } = o;
  const B = boxOf(g, o.box);
  const A = o.area ? boxOf(g, o.area) : B;
  const C = coloursOf(o);
  const arm = baseOf(o, stepAt(C, 0.5));
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const m = big ? 2 : 1;
  const w = Math.max(1, A[2] - A[0] - 2 * m), hh = Math.max(1, A[3] - A[1] - 2 * m);
  for (let i = 0; i < count; i++) {
    const life = fract(cycles * t + h(i, 1));
    const size = life < 0.12 ? 0 : life < 0.24 ? 1 : life < 0.36 ? m : life < 0.48 ? 1 : life < 0.6 ? 0 : -1;
    if (size < 0) continue;
    const x = A[0] + m + Math.floor(h(i, 2) * w), y = A[1] + m + Math.floor(h(i, 3) * hh);
    twinkle(g, x, y, size, size ? arm : stepAt(C, 0.75), { box: B });
  }
}

/**
 * An expanding ring from (x, y): shockwave, ripple, landing dust ring (squash < 1 flattens it).
 * One-shot over the clip: radius r0 -> r1 easing out, `thick` px thinning to 1, colour from hot
 * to rim, with a 1 px rim on its outside while it is thick enough. From t = 0.6 it breaks into
 * arcs that thin away; the last frame keeps a few rim pixels.
 */
export function ring(g, o) {
  const { t = 0, x, y, r0 = 2, r1 = 12, thick = 3, squash = 1, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o);
  const k = clamp(t);
  if (x < B[0] || x >= B[2] || y < B[1] || y >= B[3]) throw new Error(`fx.ring: centre (${x}, ${y}) is outside the box [${B}], so the ring cannot stay in it`);
  // the ring stops growing where it would leave the box, so its last frame keeps its pixels
  const sq = Math.max(0.1, squash);
  const room = Math.min(x - B[0], B[2] - x, (y - B[1]) / sq, (B[3] - y) / sq);
  const r = Math.min(lerp(r0, r1, easeOut(k)), Math.max(0.6, room));
  const th = Math.max(1, Math.round(thick * (1 - 0.8 * k)));
  const band = stepAt(C, 1 - k * 0.85);
  const rim = C[C.length - 1];
  const fade = k <= 0.6 ? 0 : ((k - 0.6) / 0.4) * 0.85;
  const SECT = 16;
  const keep = (px, py) => {
    if (fade === 0) return true;
    const s = Math.floor(((Math.atan2(px - x, py - y) + PI) / TAU) * SECT) % SECT;
    return s === 0 || s === SECT / 2 || hash(s, seed * 64 + 7) > fade;
  };
  // the band is `th` px thick across and down, so a flat ring stays an unbroken line
  const rx = r, ry = Math.max(0.6, r * sq);
  const inE = (px, py, ax, ay) => ax > 0 && ay > 0 && ((px - x) / ax) ** 2 + ((py - y) / ay) ** 2 <= 1;
  paint(g, B, x - rx - 1, y - ry - 1, x + rx + 1, y + ry + 1, (px, py) => {
    if (!inE(px, py, rx, ry) || inE(px, py, rx - th, ry - th)) return null;
    if (!keep(px, py)) return null;
    if (k >= 1) return rim;
    return th >= 2 && !inE(px, py, rx - 1, ry - 1) ? rim : band;
  });
}

/**
 * Shards flung from (x, y): rock chips, glass, metal scraps, crystal splinters.
 * Each is a small spinning triangle `size` px long, shaded with the surface light and rimmed
 * with tone(colour, -1). They fly `dist` px (outward along angle / arc), fall `gravity` px by
 * the end, shrink a little, and land as one or two pixels each. One-shot over the clip.
 */
export function shards(g, o) {
  const { t = 0, x, y, count = 6, seed = 0, dist = 14, gravity = 8, size = 3, angle = PI, arc = 2 * PI, spin = 1.5 } = o;
  const B = boxOf(g, o.box);
  const base = baseOf(o, '#8f97a8');
  const R = ramp(base);
  const rim = tone(base, -1);
  const k = clamp(t);
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const [sx, sy] = g.shadow;
  for (let i = 0; i < count; i++) {
    const a = angle + (h(i, 2) - 0.5) * arc;
    const d = dist * (0.5 + 0.5 * h(i, 3)) * easeOut(k);
    const cx = inside01(x + Math.sin(a) * d, B[0] + 0.5, B[2] - 0.5), cy = inside01(y + Math.cos(a) * d + gravity * k * k * (0.6 + 0.4 * h(i, 4)), B[1] + 0.5, B[3] - 0.5);
    const L = Math.max(1, size * (0.7 + 0.6 * h(i, 5)) * (1 - 0.6 * k));
    if (L < 2) { put(g, B, cx, cy, k > 0.9 ? rim : R.base); continue; }
    const rot = TAU * (h(i, 6) + spin * (h(i, 7) - 0.5) * 2 * k);
    const ux = Math.cos(rot), uy = Math.sin(rot);
    const wd = Math.max(1.4, L * 0.6);
    const pts = [[cx + ux * L / 2, cy + uy * L / 2], [cx - ux * L / 2 - uy * wd / 2, cy - uy * L / 2 + ux * wd / 2], [cx - ux * L / 2 + uy * wd / 2, cy - uy * L / 2 - ux * wd / 2]];
    const inside = (px, py) => {
      let hit = false;
      for (let p = 0, q = 2; p < 3; q = p++) {
        const [xi, yi] = pts[p], [xj, yj] = pts[q];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    let drew = false;
    paint(g, B, cx - L, cy - L, cx + L, cy + L, (px, py) => {
      if (!inside(px, py)) return null;
      drew = true;
      if (L >= 5 && !inside(px + sx, py + sy)) return rim;   // the side away from the light (small chips stay their own colour)
      if (L >= 5 && !inside(px - sx, py - sy)) return R.light;   // the lit side
      return R.base;
    });
    if (!drew) put(g, B, cx, cy, R.base);
  }
}

/**
 * Smoke puffs rising from (x, y): chimney smoke, dust clouds, steam, poof.
 * Each puff is born small, swells, drifts `drift` px sideways and rises `rise` px over its life.
 * Young puffs are lighter, old ones darker; each is shaded by the surface light and rimmed with
 * tone(its colour, -1). loop (default): puffs vanish to nothing at the end of their life, so the
 * loop closes; one-shot: they end as small dark wisps.
 */
export function smoke(g, o) {
  const { t = 0, x, y, count = 5, seed = 0, loop = true, cycles = 1, stagger = 0.5, rise = 14, drift = 3, size = 4 } = o;
  const B = boxOf(g, o.box);
  const base = baseOf(o, '#8f97a8');
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const k = lifeOf(t, i, { seed, loop, cycles, stagger });
    const r = loop ? size * (0.5 + 0.5 * k) * Math.sqrt(Math.sin(PI * k)) : size * (0.45 + 0.8 * k) * (1 - 0.8 * k ** 3);
    if (r < 0.6) continue;
    const px = x + (h(i, 2) - 0.5) * 1.2 * size + drift * k + 0.8 * Math.sin(TAU * (k + h(i, 3)));
    const py = y - rise * k;
    puffs.push({ k, r, px, py });
  }
  puffs.sort((a, b) => b.k - a.k);                    // oldest first, the young puffs in front
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  for (const P of puffs) {
    const c = P.k < 0.33 ? tone(base, 0.45) : P.k < 0.66 ? base : tone(base, -0.4);
    if (P.r < 1.5) { put(g, B, P.px, P.py, tone(c, -1)); continue; }
    const paintRamp = { base: c, dark: tone(c, -0.55), light: c };
    g.fill(P.px - P.r, P.py - P.r, P.px + P.r, P.py + P.r, (px, py) => (px - P.px) ** 2 + (py - P.py) ** 2 <= P.r * P.r, paintRamp, { shade: P.r >= 3 ? 1 : 0, outline: tone(c, -1), clip });
  }
}
