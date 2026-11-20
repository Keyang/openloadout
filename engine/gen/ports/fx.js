// PORT (migration batch M9): a copy of engine/fx.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/fx.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
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
// TRIMMED (review M9 round 1, issue 3): the declarations and imports no M9 port reaches are left out, so the copy holds
// only what draws; what is kept is word for word as before.

import { tone, mix, ramp, col } from './colour.js';
import { hash, fract, clamp, lerp, easeOut, TAU, PI } from '../../motion.js';

// ---- colours ----------------------------------------------------------------

/**
 * The colour steps of an effect, hottest first:
 * [white, core, mid, edge, rim] where rim = tone(edge, -1).
 * opt.core: the inside colour (default: edge lightened toward yellow).
 * opt.white: false drops the white step (smoke, slime: things that are not hot).
 * Arguments: edge: the effect's outer colour; options { core, white }.
 */
export function steps(edge, { core, white = true } = {}) {
  const c = core ?? tone(edge, 1.6);
  const list = [c, mix(c, edge, 0.5), edge, tone(edge, -1)];
  return white ? ['#ffffff', ...list] : list;
}

/**
 * Pick a step by heat: 1 = the hottest (first), 0 = the rim (last).
 * Arguments: list: colour steps, hottest first; heat: 0..1.
 */
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
 * Arguments: t: clip phase; i: particle index; options { seed, loop, cycles, stagger }.
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
 * Arguments: g: the Surface; x, y: centre; size: 0, 1 or 2; colour: a colour or a steps list; options { core, box }.
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
 * Arguments: g: the Surface; x, y: centre; r: outer radius; colours: a steps list or one colour; options { box }.
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
 * Arguments: g: the Surface; o: { t, x, y, count, seed, loop, cycles, stagger, angle, arc, dist, gravity, size, spread, wobble, lifespan, colour | colours, white, box }.
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

/**
 * Solid chunks thrown from (x, y): planks, boards, bricks, slabs. Each is a spinning bar that flies up and out, falls, and comes to rest lying flat on the `floor` row, a little shorter than it began; one-shot over the clip.
 * Arguments: g: the Surface; o: { t, x, y, count, seed, dist (px sideways), rise (px up), size (px long), thick (px across), spread (px of scatter at the start), spin (turns), floor (the row they land on), land (0..1: when the last one lands), shrink (0..1: how much shorter they end), rest (false: a chunk is gone once it has landed, so the caller draws what stays), colour | colours, rim (a colour to rim each chunk with, for example the outline colour), box }.
 */
export function chunks(g, o) {
  const { t = 0, x, y, count = 6, seed = 0, dist = 12, rise = 10, size = 6, thick = 2, spread = 3, spin = 1, land = 0.85, shrink = 0.45, rest = true } = o;
  const B = boxOf(g, o.box);
  const base = baseOf(o, '#a06a3c');
  const R = ramp(base);
  const floor = Math.min(o.floor ?? B[3] - 1, B[3] - 1);
  const k = clamp(t);
  const h = (i, ch) => hash(i, seed * 64 + ch);
  for (let i = 0; i < count; i++) {
    // pieces take turns going left and right, so a burst is never one-sided
    const side = i % 2 ? -1 : 1;
    const x0 = x + (h(i, 2) - 0.5) * 2 * spread, y0 = Math.min(y + (h(i, 3) - 0.5) * 2 * spread, floor - 1);
    const T = Math.max(0.2, land * (0.6 + 0.4 * h(i, 4)));
    const up = rise * (0.45 + 0.55 * h(i, 5)), drop = floor - y0;
    const sq = (Math.sqrt(up) + Math.sqrt(up + drop)) / T;          // sqrt of the pull that lands it exactly at T
    const v = 2 * sq * Math.sqrt(up);
    const kk = Math.min(k, T), a = kk / T;
    const L = Math.max(1, size * (0.7 + 0.6 * h(i, 6)) * (1 - shrink * a));
    const th = L < 3 ? 1 : thick;
    const cx = inside01(x0 + side * dist * (0.35 + 0.65 * h(i, 7)) * easeOut(a), B[0] + 0.5, B[2] - 0.5);   // fast off the mark, slowing in the air
    const landed = k >= T;
    if (landed && !rest) continue;
    const cy = landed ? floor + 1 - th / 2 : inside01(y0 - v * kk + sq * sq * kk * kk, B[1] + 0.5, floor + 1 - th / 2);
    const rot = landed ? 0 : TAU * spin * side * (0.5 + h(i, 8)) * (1 - a) + (h(i, 9) - 0.5);
    if (L < 2) { put(g, B, cx, Math.min(cy, floor), R.base); continue; }
    const ux = Math.cos(rot) * L / 2, uy = Math.sin(rot) * L / 2, wx = -Math.sin(rot) * th / 2, wy = Math.cos(rot) * th / 2;
    let pts = [[cx - ux - wx, cy - uy - wy], [cx + ux - wx, cy + uy - wy], [cx + ux + wx, cy + uy + wy], [cx - ux + wx, cy - uy + wy]];
    if (landed) { const l = Math.round(cx - L / 2), w = Math.max(2, Math.round(L)); pts = [[l, floor + 1 - th], [l + w, floor + 1 - th], [l + w, floor + 1], [l, floor + 1]]; }
    let drew = false;
    const inside = (px, py) => {
      if (px < B[0] || py < B[1] || px >= B[2] || py >= floor + 1) return false;
      let hit = false;
      for (let p = 0, q = 3; p < 4; q = p++) {
        const [xi, yi] = pts[p], [xj, yj] = pts[q];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
      }
      if (hit) drew = true;
      return hit;
    };
    const inBox = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
    g.fill(cx - L, cy - L, cx + L, cy + L, inside, R, { shade: th >= 2 ? 1 : 0, clip: inBox, ...(o.rim ? { outline: o.rim } : {}) });
    if (!drew) put(g, B, cx, Math.min(cy, floor), R.base);   // a sliver that falls between pixel centres still shows
  }
}

/**
 * Beams of light fanning out from (x, y): the glow from an open chest, a checkpoint, a reward. Each beam is a 1 px dashed line from radius r0 to r1, hottest near the point; the caller animates r1 (growing) and phase (dashes travelling outward).
 * Arguments: g: the Surface; o: { x, y, count, angle, arc (the fan: rig angles, PI = up), r0, r1 (px from the point), dash, gap (px lit and unlit; gap 0 = solid), phase (0..1 moves the dashes one step outward), seed, colour | colours, white, box }.
 */
export function puffs(g, o) {
  const { t = 0, x, y, count = 4, seed = 0, loop = false, cycles = 1, stagger = 0.2, angle = PI / 2, arc = 0.5, dist = 8, rise = 4, size = 3, shape = 'round', lobes = 1, floor = null } = o;
  const B = boxOf(g, o.box);
  const C = Array.isArray(o.colours) ? o.colours : steps(o.colour ?? '#8f97a8', { white: false });
  const n = C.length, rim = C[n - 1];
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const list = [];
  for (let i = 0; i < count; i++) {
    const k = loop ? fract(cycles * t + (i + 0.3 * h(i, 1)) / count) : lifeOf(t, i, { seed, loop: false, stagger });
    const a = angle + (h(i, 2) - 0.5) * arc;
    const d = dist * (0.6 + 0.4 * h(i, 3)) * easeOut(k);
    const up = rise * (0.6 + 0.4 * h(i, 4)) * k ** 1.5;
    // a looping puff is full size from a tenth to four fifths of its life: with the even stagger, one always is
    const grow = lerp(0.85, 1, easeOut(k / 0.3)), thin = loop ? Math.min(1, k / 0.1) * (1 - smoothStep((k - 0.8) / 0.2)) : 1 - 0.64 * smoothStep((k - 0.35) / 0.65) ** 1.2;
    const r = size * (0.8 + 0.4 * h(i, 5)) * (loop ? lerp(0.7, 1, k) * thin : grow * thin);
    let px = x + Math.sin(a) * d, py = y + Math.cos(a) * d - up;
    // which way it is moving, for wisps
    const vx = Math.sin(a) * dist * (1 - k) * 2, vy = Math.cos(a) * dist * (1 - k) * 2 - rise * 1.5 * Math.sqrt(k);
    if (floor !== null) py = Math.min(py, floor - Math.max(0.5, r));     // the body rests on the row above the floor row; its rim lands on it
    if (!loop) { px = inside01(px, B[0] + 0.5, B[2] - 0.5); py = inside01(py, B[1] + 0.5, B[3] - 0.5); }
    list.push({ k, r, px, py, vx, vy, flip: h(i, 6) < 0.5 });
  }
  list.sort((p, q) => q.k - p.k);                       // oldest first, the young puffs in front
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  // where a puff's extra lumps sit, in units of its radius: [dx, dy, size]. They share its flat underside.
  const LUMPS = [[-0.85, 0.3, 0.7], [0.9, 0.38, 0.62], [0.15, -0.62, 0.6], [-0.2, 0.45, 0.55]];
  const drawn = [];
  for (const P of list) {
    const idx = P.k < 0.82 ? 0 : 1;                      // a puff keeps its light top until it is nearly gone
    const base = C[Math.min(idx, n - 2)], dark = C[Math.min(idx + 1, n - 2)];
    if (P.r < 0.9) {
      if (!(loop && P.r < 0.6)) drawn.push({ speck: true, P, colour: P.k > 0.8 ? rim : base });
      continue;
    }
    const one = (cx, cy, r) => {
      if (shape === 'chunky') { const q = Math.max(1, Math.round(r * 0.85)), qx = Math.round(cx), qy = Math.round(cy); return (px, py) => Math.abs(px - qx) < q && Math.abs(py - qy) < q; }
      if (shape === 'wispy') {
        const vl = Math.hypot(P.vx, P.vy) || 1, ux = P.vx / vl, uy = P.vy / vl;
        const ra = r * 1.45, rb = Math.max(0.8, r * 0.5);
        return (px, py) => { const dx = px - cx, dy = py - cy; return ((dx * ux + dy * uy) / ra) ** 2 + ((dy * ux - dx * uy) / rb) ** 2 <= 1; };
      }
      return (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
    };
    const tests = [one(P.px, P.py, P.r)];
    const flip = P.flip ? -1 : 1;
    const apart = loop ? 1 : 1 + 1.2 * smoothStep((P.k - 0.45) / 0.55);     // a one-shot cloud comes apart as it thins
    for (let j = 0; j < Math.min(lobes - 1, LUMPS.length); j++) {
      const [lx, ly, ls] = LUMPS[j];
      if (P.r * ls >= 0.75) tests.push(one(P.px + flip * lx * P.r * apart, P.py + ly * P.r, P.r * ls));
    }
    const inside = (px, py) => tests.some((f) => f(px, py));
    const pad = P.r * 2.4 + 1;
    drawn.push({ P, inside, box: [P.px - pad, P.py - pad, P.px + pad, P.py + pad], paint: { base, dark, light: base }, shade: P.r >= 2.5 && shape !== 'wispy' ? 1 : 0 });
  }
  // every rim first, then every body: puffs that overlap join into one cloud with no line between them
  for (const D of drawn) if (!D.speck) g.fill(...D.box, D.inside, rim, { outline: rim, clip });
  for (const D of drawn) {
    if (D.speck) put(g, B, D.P.px, D.P.py, D.colour);
    else g.fill(...D.box, D.inside, D.paint, { shade: D.shade, clip });
  }
}
/** Smooth 0..1 step used by puffs() (t is clamped). */
function smoothStep(v) { v = clamp(v); return v * v * (3 - 2 * v); }

/**
 * Tapered spikes pointing outward from (x, y), each from radius r0 to r1: the star of a hit, a muzzle flash, a glint, a slash (count 2).
 * With r0 = 0 the spikes join into one star. width: px across a spike at its widest (a third of the way out);
 * a spike thinner than a pixel is still an unbroken 1 px line. turn: the angle of the first spike
 * (rig convention: 0 = down, PI / 2 = right, PI = up). rim: a colour for a 1 px rim round the whole shape.
 * Centre it on a pixel centre (x and y ending in .5) for a star that is the same on both sides, with 1 px tips.
 * Arguments: g: the Surface; o: { x, y, count, r0, r1, width, turn, colour, rim, box }.
 */
export function beam(g, o) {
  const { x, y, w = 4, h = 12, phase = 0, dash = 2, gap = 2, solid = 0.4, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#5fe0f0');
  const n = Math.max(1, Math.round(w)), half = n / 2, step = dash + gap;
  const left = Math.round(x - half);
  for (let i = 0; i < n; i++) {
    const cx = left + i, d = Math.abs(cx + 0.5 - x) / Math.max(0.5, half);      // 0 in the middle, towards 1 at the sides
    const hc = Math.max(1, Math.round(h * (1 - 0.45 * d * d) * (0.85 + 0.15 * hash(i, seed * 64 + 1))));
    const firm = hc * solid * (1 - 0.6 * d);
    const shift = hash(i, seed * 64 + 2) * step;
    for (let k = 0; k < hc; k++) {
      if (k >= firm && gap > 0 && fract((k - shift) / step - phase) >= dash / step) continue;
      // hottest in the middle and at the foot, cooling towards the sides and the top
      put(g, B, cx, y - 1 - k, stepAt(C, 1 - 0.75 * d - 0.6 * (k / Math.max(1, h))));
    }
  }
}

// ---- leaves -------------------------------------------------------------------