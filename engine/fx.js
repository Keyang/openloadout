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

/** Even-odd test: is (px, py) inside the polygon pts = [[x, y], ...]? */
const inPolygon = (pts, px, py) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

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

// ---- leaves -------------------------------------------------------------------


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
