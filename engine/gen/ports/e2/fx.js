// PORT (migration batch E2): a copy of engine/fx.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/fx.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
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

// HAND CHANGE (E2): engine/color.js col packs a colour into a pixel's number; on a paint-ref grid a pixel's number is
// its paint ref's cell in the grid's table, so every col(c) below is g.table.id(c) (the same pixel, its paint kept).
import { tone, mix, ramp, col } from '../colour.js';
import { hash, fract, clamp, lerp, easeOut, TAU, PI } from '../../../motion.js';

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
    if (c) g.data[y * g.w + x] = g.table.id(c);
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
 * Arguments: g: the Surface; o: { t, count, seed, cycles, big, area, colour | colours, white, box }.
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
 * Arguments: g: the Surface; o: { t, x, y, r0, r1, thick, squash, seed, colour | colours, white, box }.
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
 * Arguments: g: the Surface; o: { t, x, y, count, seed, dist, gravity, size, angle, arc, spin, colour | colours, box }.
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
 * Arguments: g: the Surface; o: { t, x, y, count, seed, loop, cycles, stagger, rise, drift, size, colour | colours, box }.
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
export function rays(g, o) {
  const { x, y, count = 5, angle = PI, arc = PI / 2, r0 = 2, r1 = 12, dash = 3, gap = 2, phase = 0, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o);
  if (r1 <= r0) return;
  const step = dash + gap;
  for (let i = 0; i < count; i++) {
    const a = angle + (count === 1 ? 0 : (i / (count - 1) - 0.5) * arc);
    const sx = Math.sin(a), sy = Math.cos(a);
    const reachOf = r0 + (r1 - r0) * (0.7 + 0.3 * hash(i, seed * 64 + 2));
    const shift = hash(i, seed * 64 + 3) * step;
    let last = null;
    for (let d = r0; d <= reachOf; d += 0.5) {
      const px = Math.floor(x + sx * d), py = Math.floor(y + sy * d);
      if (last && last[0] === px && last[1] === py) continue;
      last = [px, py];
      if (gap > 0 && fract((d - shift) / step - phase) >= dash / step) continue;
      put(g, B, px, py, stepAt(C, 1 - (d - r0) / (r1 - r0)));
    }
  }
}

// ---- added with batch P12 (projectiles and effects): streaks, flame, rockIn, rock, puffs, starburst ----
//
//   streaks(g, { t, x: 6, y: 8, count: 2, length: 5, colours: ['#ffffff', '#f0ead8'] });       // speed lines behind an arrow
//   flame(g, { t, x: 20, y: 16, head: 5, angle: -PI / 2, length: 14, width: 4, colours: C });  // a fireball flying right
//   flame(g, { t, x: 16, y: 40, angle: PI, length: 18, width: 5, colours: C });                // a torch flame (no head)
//   rock(g, { x: 16, y: 16, r: 9, angle: TAU * t, colour: p.stone, cracks: 2 }); g.outline(INK);   // a tumbling boulder
//   puffs(g, { t, x: 16, y: 29, loop: false, angle: PI / 2, dist: 9, rise: 4, floor: 30, colours: D });   // landing dust
//   starburst(g, { x: 16, y: 16, count: 6, r1: 10, width: 5, colour: '#ffffff', rim: p.edge });  // the flash of a hit

/** Even-odd test: is (px, py) inside the polygon pts = [[x, y], ...]? */
const inPolygon = (pts, px, py) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/** Paint the pixels of the box whose centre passes `inside` in `colour`, after a 1 px rim of `rim` (when given) round them. */
function stamp(g, B, inside, colour, rim) {
  const w = B[2] - B[0], h = B[3] - B[1];
  if (w <= 0 || h <= 0) return 0;
  const m = new Uint8Array(w * h);
  let n = 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (inside(B[0] + xx + 0.5, B[1] + yy + 0.5)) { m[yy * w + xx] = 1; n++; }
  const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx] === 1;
  const cr = rim ? g.table.id(rim) : 0, cc = g.table.id(colour);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = (B[1] + yy) * g.w + B[0] + xx;
    if (m[yy * w + xx]) g.data[i] = cc;
    else if (rim && (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1))) g.data[i] = cr;
  }
  return n;
}

/**
 * Speed lines streaming away behind a moving thing at (x, y): the trail of an arrow, a dash or a thrown rock.
 * Each line is 1 px thick, starts beside (x, y), slides `reach` px along `angle` (default: to the left, for
 * something flying right) and shortens from `length` px, on its own evenly staggered timer, so a loop closes
 * and some line is always in view. spread: how far the outer lines sit to either side of the middle one.
 * Arguments: g: the Surface; o: { t, x, y, count, seed, cycles, angle, length, reach, spread, colour | colours, box }.
 */
export function streaks(g, o) {
  const { t = 0, x, y, count = 3, seed = 0, cycles = 1, angle = -PI / 2, length = 6, reach = 6, spread = 3 } = o;
  const B = boxOf(g, o.box);
  const C = Array.isArray(o.colours) ? o.colours : [o.colour ?? '#ffffff'];
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const ux = Math.sin(angle), uy = Math.cos(angle);                  // the way the lines stream
  for (let i = 0; i < count; i++) {
    const life = fract(cycles * t + (i + 0.5 * h(i, 1)) / count);
    const side = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2 * spread;
    const len = Math.max(1, Math.round(length * (0.6 + 0.4 * h(i, 2)) * (1 - 0.7 * life)));
    const d = reach * life;
    const sx = x + ux * d - uy * side, sy = y + uy * d + ux * side;
    const c = stepAt(C, 1 - life);
    for (let j = 0; j < len; j++) put(g, B, sx + ux * j, sy + uy * j, c);
  }
}

/**
 * A flame in nested layers (rim, edge, mid, core): rippling tongues streaming from (x, y), with an optional round head.
 * No head: a torch or candle flame (round foot, pointed tip). head: a radius; the tongues then taper from the
 * head into a tail: a fireball, a comet, a rocket flame. Each tongue is { angle, length, width, phase, sway, at };
 * the top-level angle / length / width / sway are the defaults (angle: rig convention, PI = up, -PI / 2 = left;
 * width: half-width at its widest; sway: px the tip ripples sideways; at: [dx, dy], where the tongue's foot sits
 * from (x, y), for a lick that starts off-centre). The ripple runs `cycles` whole times per
 * loop, so the loop closes. heat 0..1: how far the inner layers reach. colours: hottest first, the last is the
 * rim (default: steps(colour, { white: false })). Inner layers always sit at least 1 px inside the layer round them.
 * Arguments: g: the Surface; o: { t, x, y, head, tongues, angle, length, width, sway, cycles, heat, colour | colours, box }.
 */
export function flame(g, o) {
  const { t = 0, x, y, head = 0, cycles = 1, heat = 0.5 } = o;
  const B = boxOf(g, o.box);
  const C = Array.isArray(o.colours) ? o.colours : steps(o.colour ?? '#e08a2c', { white: false });
  const n = C.length;
  const list = (o.tongues ?? [{}]).map((T) => ({ angle: T.angle ?? o.angle ?? PI, length: Math.max(0.01, T.length ?? o.length ?? 12), width: T.width ?? o.width ?? 4, phase: T.phase ?? 0, sway: T.sway ?? o.sway ?? 1.5, ax: T.at?.[0] ?? 0, ay: T.at?.[1] ?? 0 }));
  const profile = head > 0 ? (hk) => (1 - hk) ** 0.8 : (hk) => Math.sin(PI * Math.sqrt(0.05 + 0.95 * hk)) ** 0.75;
  // the hot centre of a head sits toward the way it travels (away from its first tongue)
  const lx = head > 0 ? -Math.sin(list[0].angle) : 0, ly = head > 0 ? -Math.cos(list[0].angle) : 0;
  const layerIn = (k) => {
    const kw = k ** 0.8, hr = head * (0.3 + 0.7 * k), hx = x + lx * head * 0.3 * (1 - k), hy = y + ly * head * 0.3 * (1 - k);
    return (px, py) => {
      if (head > 0 && (px - hx) ** 2 + (py - hy) ** 2 <= hr * hr) return true;
      for (const T of list) {
        const ux = Math.sin(T.angle), uy = Math.cos(T.angle);
        const dx = px - x - T.ax, dy = py - y - T.ay;
        const along = dx * ux + dy * uy;
        const hk = along / (T.length * k);
        if (hk < 0 || hk > 1) continue;
        const hh = along / T.length;                                   // the ripple is the same in every layer
        const mid = T.sway * hh * Math.sin(TAU * (1.3 * hh - cycles * t + T.phase));
        const wd = T.width * kw * profile(hk) * (1 + 0.15 * Math.sin(TAU * (2 * hh - 2 * cycles * t + 3 * T.phase)));
        if (Math.abs(dy * ux - dx * uy - mid) <= Math.max(0.55, wd)) return true;
      }
      return false;
    };
  };
  const w = B[2] - B[0], hgt = B[3] - B[1];
  if (w <= 0 || hgt <= 0) return;
  let prev = null;
  const e = lerp(1.5, 0.7, clamp(heat));
  for (let j = n - 2; j >= 0; j--) {
    const k = n === 2 ? 1 : ((j + 1) / (n - 1)) ** e;
    const test = layerIn(j === n - 2 ? 1 : k);
    const m = new Uint8Array(w * hgt);
    const was = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < hgt && prev[yy * w + xx] === 1;
    for (let yy = 0; yy < hgt; yy++) for (let xx = 0; xx < w; xx++) {
      if (!test(B[0] + xx + 0.5, B[1] + yy + 0.5)) continue;
      if (prev && !(was(xx, yy) && was(xx - 1, yy) && was(xx + 1, yy) && was(xx, yy - 1) && was(xx, yy + 1))) continue;
      m[yy * w + xx] = 1;
    }
    const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < hgt && m[yy * w + xx] === 1;
    const cc = g.table.id(C[j]), cr = g.table.id(C[n - 1]);
    for (let yy = 0; yy < hgt; yy++) for (let xx = 0; xx < w; xx++) {
      const i = (B[1] + yy) * g.w + B[0] + xx;
      if (m[yy * w + xx]) g.data[i] = cc;
      else if (!prev && (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1))) g.data[i] = cr;
    }
    prev = m;
  }
}

/**
 * Shape test for a rough rock outline that can be turned: a boulder, rubble, an asteroid, a thrown chunk.
 * A polygon of `sides` corners about r from (cx, cy); jag 0..0.6 pulls corners in by up to that share of r;
 * squash < 1 flattens it into a slab; angle turns it clockwise on screen (radians), so TAU * t is one roll to the right.
 * Arguments: cx, cy: centre; r: radius; options { seed, sides, jag, squash, angle }. Returns inside(px, py).
 */
export function rockIn(cx, cy, r, { seed = 0, sides = 8, jag = 0.2, squash = 1, angle = 0 } = {}) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (TAU * (i + (hash(i, seed * 64 + 11) - 0.5) * 0.5)) / sides;
    const rr = r * (1 - jag * hash(i, seed * 64 + 12));
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * squash]);
  }
  const c = Math.cos(angle), s = Math.sin(angle);
  return (px, py) => { const dx = px - cx, dy = py - cy; return inPolygon(pts, dx * c + dy * s, dy * c - dx * s); };
}

/**
 * A rigid rock at (x, y), turned by `angle`: a shaded lump with a lit facet, plus cracks, chipped notches and an optional patch (moss, ore, ice) that all turn with it.
 * The light stays put while the rock turns, so the shading shows the roll. cracks, chips: how many (whole numbers);
 * patch: { colour, size (share of r, default 0.6), at (where on the rock, radians) }. Draw it before g.outline(INK).
 * Arguments: g: the Surface; o: { x, y, r, angle, seed, sides, jag, squash, colour, cracks, chips, patch, box }. Returns the rock's shape test.
 */
export function rock(g, o) {
  const { x, y, r = 8, angle = 0, seed = 0, sides = 8, jag = 0.2, squash = 1, colour = '#8f97a8', cracks = 0, chips = 0, patch = null } = o;
  const B = boxOf(g, o.box);
  const R = ramp(colour);
  const c = Math.cos(angle), s = Math.sin(angle);
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c];        // rock space -> the frame
  const polar = (a, d) => at(Math.cos(a) * d, Math.sin(a) * d * squash);
  const whole = rockIn(x, y, r, { seed, sides, jag, squash, angle });
  const bites = [];
  for (let i = 0; i < chips; i++) { const [bx, by] = polar(TAU * h(i, 21), r * 0.96); bites.push([bx, by, r * (0.16 + 0.08 * h(i, 22))]); }
  const body = (px, py) => {
    if (!whole(px, py)) return false;
    for (const [bx, by, br] of bites) if ((px - bx) ** 2 + (py - by) ** 2 <= br * br) return false;
    return true;
  };
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  g.fill(x - r - 1, y - r - 1, x + r + 1, y + r + 1, body, R, { shade: r >= 7 ? 2 : 1, clip });
  // the lit facet: the rock's own outline, smaller and pushed toward the light
  const [sx, sy] = g.shadow;
  const k = 0.56, fx0 = x - sx * r * 0.2, fy0 = y - sy * r * 0.2;
  const facet = (px, py) => body(x + (px - fx0) / k, y + (py - fy0) / k) && body(px - 1, py) && body(px + 1, py) && body(px, py - 1) && body(px, py + 1);
  if (r >= 4) g.fill(x - r - 1, y - r - 1, x + r + 1, y + r + 1, facet, R.light, { clip });
  if (patch) {
    const pr = r * (patch.size ?? 0.6), pa = patch.at ?? 0;
    const lobes = [[...polar(pa, r * 0.62), pr], [...polar(pa + 0.9, r * 0.7), pr * 0.55], [...polar(pa - 0.8, r * 0.74), pr * 0.5]];
    const inPatch = (px, py) => body(px, py) && lobes.some(([lx, ly, lr]) => (px - lx) ** 2 + (py - ly) ** 2 <= lr * lr);
    // a dark line of the patch's own colour where it meets the stone, so the two stay apart by value under any look
    g.fill(x - r - 1, y - r - 1, x + r + 1, y + r + 1, inPatch, ramp(patch.colour), { shade: 1, outline: tone(patch.colour, -1), clip: (px, py) => clip(px, py) && body(px, py) });
  }
  for (let i = 0; i < cracks; i++) {
    const a = TAU * (i / cracks + 0.13 + 0.12 * h(i, 31));
    const pts = [polar(a, r), polar(a + (h(i, 32) - 0.5) * 0.7, r * 0.55), polar(a + (h(i, 33) - 0.5) * 1.4, r * (0.12 + 0.2 * h(i, 34)))];
    for (let q = 0; q < 2; q++) {
      const [ax, ay] = pts[q], [bx, by] = pts[q + 1];
      const stepsN = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let e = 0; e <= stepsN; e++) {
        const px = ax + ((bx - ax) * e) / stepsN, py = ay + ((by - ay) * e) / stepsN;
        const cxp = Math.floor(px) + 0.5, cyp = Math.floor(py) + 0.5;
        if (body(cxp, cyp) && body(cxp + sx, cyp + sy)) put(g, B, px, py, R.dark);
      }
    }
  }
  return body;
}

/**
 * Soft puffs thrown along a direction, rimmed with their own dark tone: landing dust, a kicked-up puff, a wall-slide trickle, a poof.
 * Each puff is thrown `dist` px along angle (within `arc`), fast at first, and rises `rise` px as it ages; it swells,
 * then thins, keeping its light top until it is nearly gone. shape: 'round' (discs), 'wispy' (thin streaks that lean
 * the way they move) or 'chunky' (square blocks on whole pixels). lobes: 1 to 5 lumps per puff (3 makes a small cloud with a flat
 * underside). floor: the ground row (a puff's rim lands on it, nothing goes below it). Puffs that overlap join into one cloud.
 * loop: puffs are evenly staggered, so one is always in view and the loop closes; one-shot (loop: false): they start
 * close together as one dense cloud and end as a small wisp each, inside the box, so the last frame is never empty.
 * colours: lightest first, the last is the rim.
 * Arguments: g: the Surface; o: { t, x, y, count, seed, loop, cycles, stagger, angle, arc, dist, rise, size, shape, lobes, floor, colour | colours, box }.
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
export function starburst(g, o) {
  const { x, y, count = 6, r0 = 0, r1 = 10, width = 3, turn = PI, colour = '#ffffff', rim = null } = o;
  const B = boxOf(g, o.box);
  if (r1 <= r0 || count < 1) return;
  const spikes = [], hw = (width / 2) * 0.9993;       // a hair inside, so no edge runs exactly through pixel centres
  for (let i = 0; i < count; i++) {
    const a = turn + (i * TAU) / count, ux = Math.sin(a), uy = Math.cos(a), rm = r0 + (r1 - r0) * 0.3;
    spikes.push({ ux, uy, pts: [[x + ux * r0, y + uy * r0], [x + ux * rm - uy * hw, y + uy * rm + ux * hw], [x + ux * r1, y + uy * r1], [x + ux * rm + uy * hw, y + uy * rm - ux * hw]] });
  }
  // the spine of every spike, so a thin one never breaks up (rounded the same way on both sides of the centre)
  const spine = new Set();
  const sround = (v) => Math.sign(v) * Math.floor(Math.abs(v) + 0.5);
  for (const S of spikes) for (let d = r0; d <= r1 - 0.5; d += 0.5) spine.add(Math.floor(y + sround(S.uy * d)) * 4096 + Math.floor(x + sround(S.ux * d)));
  const inside = (px, py) => spine.has(Math.floor(py) * 4096 + Math.floor(px)) || spikes.some((S) => inPolygon(S.pts, px, py));
  stamp(g, B, inside, colour, rim);
}

// ---- added with batch S14 (station props): lamp, hologram, beam ----
//
//   lamp(g, 15, 22, 2, 2, p.glow, blink);                                        // a status light: 0 off, 0.5 dim, 1 lit, 2 flaring
//   hologram(g, starIn(16, 14, 6), p.glow, { scan: fract(t) });                  // a projected shape, a scan line climbing it
//   beam(g, { x: 16, y: 20, w: 6, h: 17, colours: steps(p.glow), phase: t });    // a column of light over an open chest

/**
 * A small light on a machine, w x h px with its top-left corner at (x, y): off (a dark lens), dim, lit (its colour with a white glint) or flaring (white, with a halo of its colour one pixel round it). Draw it after g.outline.
 * Arguments: g (the Surface); x, y, w, h (the lens, in whole pixels); colour (of the light); level (0 off, 0.5 dim, 1 lit, 2 flaring; anything between goes to the nearest of the four); options { box }.
 */
export function lamp(g, x, y, w, h, colour, level = 1, { box } = {}) {
  const B = boxOf(g, box);
  x = Math.floor(x); y = Math.floor(y); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const lv = level >= 1.5 ? 2 : level >= 0.75 ? 1 : level >= 0.25 ? 0.5 : 0;
  const lens = lv === 2 ? '#ffffff' : lv === 1 ? colour : lv === 0.5 ? tone(colour, -0.9) : tone(colour, -1.9);
  if (lv === 2) {
    for (let i = 0; i < w; i++) { put(g, B, x + i, y - 1, colour); put(g, B, x + i, y + h, colour); }
    for (let j = 0; j < h; j++) { put(g, B, x - 1, y + j, colour); put(g, B, x + w, y + j, colour); }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, B, x + i, y + j, lens);
  if (lv === 1 && w * h >= 2) put(g, B, x + w - 1, y, '#ffffff');
}

/**
 * Paints a shape as a projection of light instead of a solid thing: two tones of one colour (the lighter on the side of the light), a rim one tone darker in place of the ink line, and an optional bright scan line across it. Draw it after g.outline; returns the box [x0, y0, x1, y1] of the shape, or null when it is empty.
 * Arguments: g (the Surface); inside (a shape test, or a list of them joined); colour; options { scan (0..1: where the scan line is, from the bottom of the shape, 0, to its top, 1; leave out for none), light (px of the lighter band on the lit side, default 2; 0 for none), lit (a shape test: the part to paint in the lighter tone instead of that band, such as the top face of a cube), white (the colour of the scan line, default white), rim (false: no rim), box }.
 */
export function hologram(g, inside, colour, { scan = null, light = 2, lit = null, white = '#ffffff', rim = true, box } = {}) {
  const B = boxOf(g, box);
  const tests = Array.isArray(inside) ? inside : [inside];
  const w = B[2] - B[0], h = B[3] - B[1];
  if (w <= 0 || h <= 0) return null;
  const m = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const px = B[0] + xx + 0.5, py = B[1] + yy + 0.5;
    if (!tests.some((f) => f(px, py))) continue;
    m[yy * w + xx] = 1;
    if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
  }
  if (x1 < 0) return null;
  const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx] === 1;
  const [sx, sy] = g.shadow;
  const cBase = g.table.id(colour), cLight = g.table.id(tone(colour, 0.9)), cRim = g.table.id(tone(colour, -1)), cScan = g.table.id(white);
  const row = scan === null || scan === undefined ? -9 : y1 - Math.round(clamp(scan) * (y1 - y0));
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = (B[1] + yy) * g.w + B[0] + xx;
    if (m[yy * w + xx]) g.data[i] = yy === row ? cScan : yy === row + 1 || (lit ? lit(B[0] + xx + 0.5, B[1] + yy + 0.5) : light > 0 && !on(xx - sx * light, yy - sy * light)) ? cLight : cBase;
    else if (rim && (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1))) g.data[i] = cRim;
  }
  return [B[0] + x0, B[1] + y0, B[0] + x1 + 1, B[1] + y1 + 1];
}

/**
 * A column of light standing on a row and rising h px: a loot beam, a teleporter, a scanner. Solid and brightest at its foot, it breaks into dashes that travel upward and cool towards the top; the columns at its sides are dimmer and shorter. The caller animates h and phase. Draw it after g.outline.
 * Arguments: g (the Surface); o: { x (its middle: a whole number for an even width, ending in .5 for an odd one), y (the row just under its foot), w (px across, default 4), h (px tall), phase (0..1 moves the dashes one step up; a whole number closes a loop), dash, gap (px lit and unlit above the solid foot, default 2 and 2; gap 0 = unbroken), solid (share of its height that is unbroken, default 0.4), seed, colour | colours (hottest first), white, box }.
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
import { leafIn as leafShape } from './creature.js';

/**
 * Leaves thrown up and out from (x, y) that tumble and flutter down: what flies from a cut bush, a shaken tree or a beaten forest creature.
 * One-shot over the clip. Each is a pointed leaf `size` px long (it shrinks a little) with a rim (a darker tone of its own
 * colour unless `rim` is given). They fly `dist` px, fall `gravity` px by the end, stay inside the box, and are all still
 * there on the last frame, so that frame is never empty.
 * Arguments: g: the Surface; o: { t, x, y, count, seed, dist, gravity, size, paints (a list of colours or ramps, used in turn) | colour, rim, box }.
 */
export function leaves(g, o) {
  const { t = 0, x, y, count = 5, seed = 0, dist = 8, gravity = 9, size = 5 } = o;
  const B = boxOf(g, o.box);
  const k = clamp(t);
  const paints = (o.paints ?? [o.colour ?? '#4f9d57']).map((c) => (typeof c === 'string' ? ramp(c) : c));
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  for (let i = 0; i < count; i++) {
    const a = PI + ((i + 0.5) / count - 0.5) * 3.1 + (hash(i, seed * 64 + 1) - 0.5) * 0.4;
    const far = dist * (0.7 + 0.3 * hash(i, seed * 64 + 3)) * easeOut(k);
    const half = lerp(size, size * 0.72, k) / 2, pad = half + 1.5;
    const cx = inside01(x + Math.sin(a) * far, B[0] + pad, B[2] - pad), cy = inside01(y + Math.cos(a) * far + gravity * k * k, B[1] + pad, B[3] - pad);
    const turn = a + (2.2 + i) * k + 0.8 * Math.sin(TAU * (1.5 * k + i / count));                  // it tumbles and flutters
    const ux = Math.sin(turn) * half, uy = Math.cos(turn) * half, paint = paints[i % paints.length];
    g.fill(cx - pad - 1, cy - pad - 1, cx + pad + 1, cy + pad + 1, leafShape(cx - ux, cy - uy, cx + ux, cy + uy, Math.max(2, size * 0.56), { belly: 0.5, blunt: 0.3 }), paint, { outline: o.rim ?? paint.deep ?? paint.dark, clip });
  }
}

// ---- added in fix round 1 of batch P12 (the boss rock's shatter): rockBreak ----
//
//   const bits = new Surface(32, 32);
//   rockBreak(bits, { t, x: 16, y: 16, r: 9, colour: p.stone, pieces: 4 });   // the rock of rock(), coming apart
//   bits.outline(INK); g.blit(bits);                                          // the outline draws the cracks between the pieces

/**
 * The rock of rock() breaking apart: the same lump cut from its centre into wedges that fly outward, fall, turn a little and wear down to rubble.
 * One-shot over the clip. At t = 0 the wedges sit together on the exact footprint of rock() with the same settings, so the
 * break starts from the whole rock and never from something smaller; once they part, g.outline(INK) draws the cracks
 * between them. Every piece keeps the rock's outline, its notches and its patch (moss, ore), is shaded by the surface
 * light, stays inside the box and is still there at t = 1, so the last frame is never empty.
 * pieces: 2 to 8 wedges; turn: the angle of the first cut (radians, in the rock's own space); uneven 0..1: how unequal
 * the wedges are; dist: px a piece flies from where it sat; gravity: px it falls by the end; spin: turns a piece makes
 * at most; shrink 0..1: how much smaller a piece ends; seam: a colour for the cut lines at t = 0 only (the flash of the break).
 * Arguments: g: the Surface; o: { t, x, y, r, angle, seed, sides, jag, squash, colour, chips, patch (all as rock()), pieces, turn, uneven, dist, gravity, spin, shrink, seam, box }.
 */
export function rockBreak(g, o) {
  const { t = 0, x, y, r = 8, angle = 0, seed = 0, sides = 8, jag = 0.2, squash = 1, colour = '#8f97a8', chips = 0, patch = null, pieces = 4, turn = 0.5, uneven = 0.5, dist = 8, gravity = 5, spin = 0.15, shrink = 0.6, seam = null } = o;
  const B = boxOf(g, o.box);
  const R = ramp(colour);
  const k = clamp(t), n = Math.max(2, Math.min(8, Math.round(pieces)));
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const [sx, sy] = g.shadow;
  const c = Math.cos(angle), s = Math.sin(angle);
  // rock space (u, v): the rock unturned with its centre at (0, 0); the same outline, notches and patch as rock()
  const whole = rockIn(0, 0, r, { seed, sides, jag, squash });
  const bites = [];
  for (let i = 0; i < chips; i++) { const a = TAU * h(i, 21); bites.push([Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96 * squash, r * (0.16 + 0.08 * h(i, 22))]); }
  const body = (u, v) => whole(u, v) && !bites.some(([bx, by, br]) => (u - bx) ** 2 + (v - by) ** 2 <= br * br);
  const lobes = [];
  if (patch) {
    const pr = r * (patch.size ?? 0.6), pa = patch.at ?? 0;
    for (const [da, d, sz] of [[0, 0.62, 1], [0.9, 0.7, 0.55], [-0.8, 0.74, 0.5]]) lobes.push([Math.cos(pa + da) * r * d, Math.sin(pa + da) * r * d * squash, pr * sz]);
  }
  const cuts = [];
  for (let i = 0; i < n; i++) cuts.push(turn + (TAU * (i + (h(i, 41) - 0.5) * 0.8 * clamp(uneven))) / n);
  const wedgeOf = (u, v) => { const a = cuts[0] + fract((Math.atan2(v, u) - cuts[0]) / TAU) * TAU; let w = 0; for (let i = 1; i < n; i++) if (a >= cuts[i]) w = i; return w; };
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  const sc = 1 - clamp(shrink) * k ** 1.5, ext = r * 0.5 * sc;
  for (let i = 0; i < n; i++) {
    const m = (cuts[i] + (i + 1 < n ? cuts[i + 1] : cuts[0] + TAU)) / 2;
    const gu = Math.cos(m) * r * 0.5, gv = Math.sin(m) * r * 0.5 * squash;            // the middle of the wedge: it flies, turns and shrinks about this point
    const hx = gu * c - gv * s, hy = gu * s + gv * c, hl = Math.hypot(hx, hy) || 1;   // the same point in the frame, from the rock's centre
    const d = dist * (0.55 + 0.45 * h(i, 42)) * easeOut(k);
    const cx = inside01(x + hx + (hx / hl) * d, B[0] + ext, B[2] - ext);
    const cy = inside01(y + hy + (hy / hl) * d + gravity * k * k * (0.6 + 0.4 * h(i, 43)), B[1] + ext, B[3] - ext);
    const A = angle + TAU * spin * (h(i, 44) - 0.5) * 2 * k, ca = Math.cos(A), sa = Math.sin(A);
    const toRock = (px, py) => { const qx = px - cx, qy = py - cy; return [gu + (qx * ca + qy * sa) / sc, gv + (qy * ca - qx * sa) / sc]; };
    let drew = false;
    const inside = (px, py) => { const [u, v] = toRock(px, py); return body(u, v) && wedgeOf(u, v) === i; };
    const reach = r * sc * 1.2 + 1, box = [cx - reach, cy - reach, cx + reach, cy + reach];
    g.fill(...box, (px, py) => { const on = inside(px, py); if (on && clip(px, py)) drew = true; return on; }, R, { shade: 1, clip });
    if (!drew) { put(g, B, cx, cy, R.base); continue; }                                // a crumb that falls between pixel centres still shows
    // the lit facet: the piece's own outline, smaller and pushed toward the light
    if (r * sc >= 5) {
      const kf = 0.5, fx0 = cx - sx * r * sc * 0.12, fy0 = cy - sy * r * sc * 0.12;
      const facet = (px, py) => inside(cx + (px - fx0) / kf, cy + (py - fy0) / kf) && inside(px - 1, py) && inside(px + 1, py) && inside(px, py - 1) && inside(px, py + 1);
      g.fill(...box, facet, R.light, { clip });
    }
    if (patch) {
      const inPatch = (px, py) => { const [u, v] = toRock(px, py); return body(u, v) && wedgeOf(u, v) === i && lobes.some(([lx, ly, lr]) => (u - lx) ** 2 + (v - ly) ** 2 <= lr * lr); };
      g.fill(...box, inPatch, ramp(patch.colour), { shade: 1, outline: tone(patch.colour, -1), clip: (px, py) => clip(px, py) && inside(px, py) });
    }
  }
  if (seam && k === 0) {
    // where two wedges meet, one pixel wide
    const at = (px, py) => { const dx = px - x, dy = py - y, u = dx * c + dy * s, v = dy * c - dx * s; return body(u, v) ? wedgeOf(u, v) : -1; };
    paint(g, B, x - r - 1, y - r - 1, x + r + 1, y + r + 1, (px, py) => {
      const w = at(px, py), e = at(px + 1, py), q = at(px, py + 1);
      return w >= 0 && ((e >= 0 && e !== w) || (q >= 0 && q !== w)) ? seam : null;
    });
  }
}

// ---- added with batch S14 (station props): scorch ----
//
//   scorch(g, { x: 16.5, y: 40, rx: 12, ry: 5, t: k / 0.45, colour: tone(p.floor, -0.9),      // what a barrel, a grenade or a mine
//     colours: steps(p.glow), heat: 1 - k, flicker: frame });                                 // leaves on the floor (k: clip phase)

/**
 * The burn mark an explosion leaves on the floor: a flat, broken ring of one dark colour that spreads to its full size, with a few embers that flicker and cool in it. A ground mark with no ink round it: draw it after g.outline, under the blast.
 * Arguments: g (the Surface); o: { x, y (its middle; pixel centres are at .5, so 16.5 is the middle of column 16), rx, ry (how far it reaches across and down when fully spread), t (0..1: how far it has spread, default 1), start (the share of its full size it has at t = 0, default 0.55), hole (0..1: the share of its area left clean in the middle, default 0.45; 0 fills it), gaps (0..1: the share of the ring broken away, in dashes two pixels wide, default 0.18), colour (of the burn, default near black), embers (how many, default 4; none show while heat is 0), heat (1 just blown to 0 cold: the embers glow bright above 0.5, dull below, and are gone at 0; default 0), colours (the steps of the fire, hottest first, as steps() gives them; the embers take its core and edge colours; default an amber fire), flicker (a whole number that changes every frame, such as the frame number: which embers show), seed, box }.
 */
export function scorch(g, o) {
  const { x, y, rx = 10, ry = 4, t = 1, start = 0.55, hole = 0.45, gaps = 0.18, colour = '#241e2e', embers = 4, heat = 0, flicker = 0, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const grown = lerp(clamp(start), 1, clamp(t));
  const ax = rx * grown, ay = ry * grown;
  if (ax > 0 && ay > 0) paint(g, B, x - rx, y - ry, x + rx, y + ry, (px, py) => {
    const q = ((px - x) / ax) ** 2 + ((py - y) / ay) ** 2;
    return q <= 1 && q > hole && hash(Math.floor(px / 2), Math.floor(py) + 7 + seed * 64) > gaps ? colour : null;
  });
  if (heat <= 0) return;
  const C = Array.isArray(o.colours) && o.colours.length ? o.colours : steps('#f2a030');
  const ember = heat > 0.5 ? C[C.length - 4] ?? C[0] : C[C.length - 2] ?? C[0];
  const h = (i, ch) => hash(i, seed * 64 + ch);
  for (let i = 0; i < embers; i++) {
    if (h(i, Math.round(flicker)) <= 0.35) continue;
    put(g, B, Math.floor(x) + Math.round((h(i, 3) - 0.5) * rx * 1.2), Math.floor(y) + Math.round((h(i, 5) - 0.5) * ry), ember);
  }
}

// ---- added with batch S14, fix round 2: meridians ----
//
//   hologram(g, ellipseIn(16, 14, 6, 6), p.glow, { scan: fract(t) });      // an orb of light
//   meridians(g, 16, 14, 6, t, p.glow);                                    // and the lines that show it turning

/**
 * The lines of longitude on a turning ball: upright arcs that sweep from its left edge to its right as it turns, darker on the left half and lighter on the right, the side of the light. Draw them over the ball: a hologram orb, a planet, a bubble.
 * Arguments: g (the Surface); x, y (the ball's middle: it covers rows y - r to y + r - 1); r (its radius in px); t (the turn: each line crosses the ball once per whole number, so t and t + 1 are one picture); colour (of the ball: the lines take a lighter and a darker tone of it); options { count (how many lines, evenly spaced, default 2), light, dark (the tone steps of a line on the lit half and on the other, default 0.9 and -0.6), clip (true: leave out any pixel whose centre is outside the ball, for a ball with nothing round it; default false: every pixel of a line holds part of the ball, so a line just coming round the left edge may lie on the one-pixel rim that hologram() draws there), box }.
 */
export function meridians(g, x, y, r, t, colour, { count = 2, light = 0.9, dark = -0.6, clip = false, box } = {}) {
  const B = boxOf(g, box), n = Math.max(1, Math.round(count));
  for (let i = 0; i < n; i++) {
    const u = Math.sin(PI * (fract(t + i / n) - 0.5));              // -1 at the left edge, 0 in the middle, 1 at the right
    const c = tone(colour, u > 0 ? light : dark);
    for (let j = -r + 1; j < r - 1; j++) {
      const px = Math.floor(x + u * Math.sqrt(r * r - (j + 0.5) ** 2) - (u > 0 ? 1 : 0));
      if (clip && (px + 0.5 - x) ** 2 + (j + 0.5) ** 2 > r * r) continue;
      put(g, B, px, y + j, c);
    }
  }
}
