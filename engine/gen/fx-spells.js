// Effect behaviours of spells (docs/data-sprites.md 2.5c and 3.3, family "fx"; build item B12c): what an `emitters`
// body names for lightning, sparks gathering into a hand and motes rising from a heal. Each is a port of an
// engine/spells.js helper that RETURNS PRIMITIVES (stamps keyed to the paints its call names) instead of drawing:
//   bolt@1   engine/spells.js bolt and boltPath   a jagged stroke of lightning in nested layers, with forks
//   swirl@1  engine/spells.js swirl              sparks spiralling in to a point (or out of it), each with a tail
//   motes@1  engine/spells.js motes              shaped motes (dot, plus, leaf, star, heart) rising and fading
// Angles are degrees (rig convention: 0 down, 90 right, 180 up) where the code took radians. Shared rules:
// engine/gen/fx-common.js. Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same
// in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, flag, angle, word, paints } from './args.js';
import { workCost } from './pixels.js';
import { hash, fract, clamp, lerp, easeOut, TAU, PI } from '../motion.js';
import { crossIn, starIn, heartIn } from '../shapes.js';
import { RAD, beginArg, endArg, areaArg, phaseOf, lifeOf, boxOf, boxIn, emptyBox, gridOf, gridAround, put, clipOf, stepAt, layered, spineOf, leafIn, tilesOf, areaOf, charge, innerOf, boxPixels } from './fx-common.js';

// ---- bolt@1 --------------------------------------------------------------------------------------------------------

/** engine/spells.js boltPath: the corner points of a lightning path from (x0, y0) to (x1, y1), wandering by `sway` and stepping `zigzag` px to alternate sides at each of `kinks` corners. */
function boltPath(x0, y0, x1, y1, { kinks = 6, zigzag = 3, sway = 0, seed: s = 0 } = {}) {
  const n = Math.max(1, Math.round(kinks) + 1);
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L, ny = dx / L;
  const h = (i, ch) => hash(i, s * 64 + ch);
  const flip = h(0, 1) < 0.5 ? 1 : -1, bend = h(0, 2);
  const pts = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const k = (i + (h(i, 3) - 0.5) * 0.5) / n;
    const off = sway * Math.sin(PI * k) * Math.sin(TAU * (0.8 * k + bend)) + zigzag * flip * (i % 2 ? 1 : -1) * (0.45 + 0.55 * h(i, 4));
    pts.push([x0 + dx * k + nx * off, y0 + dy * k + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}

/** How far from the straight line of a bolt@1 its pixels can lie: its wander, its zigzags, its forks and their zigzags, half its width and a margin. */
const boltMargin = (a) => a.sway + 1.6 * a.zigzag + a.length * a.forkLength + a.width / 2 + 4;
/** The side of the square box a bolt@1 of these arguments lies in, whichever way it points. */
const boltSide = (a) => a.length + 2 * boltMargin(a) + 2;

/**
 * bolt@1: a lightning bolt from `at`, `length` px along `angle` (0 down): a jagged stroke `width` px thick in nested
 * `paints` (hottest inside, the last its 1 px rim), wandering `sway` px and stepping `zigzag` px at each of `kinks`
 * corners, with `forks` that leave its corners (`forkLength` of its length, `forkAngle` degrees off its way) and thin
 * away. `lead` (0..1) is how far down it has reached, `fade` the share gone from its start, `taper` thins its far end;
 * `flicker` re-rolls its path that many times over the clip. Port of engine/spells.js bolt (its from is fade, its to
 * lead), pixel for pixel.
 */
export const bolt = defineGenerator({
  id: 'bolt', v: 1, family: 'fx',
  about: 'A jagged lightning bolt in nested layers of light, with forks, reaching down and fading away.',
  args: {
    at: point({ about: 'Where the bolt starts' }),
    length: px(0, 640, { default: 32, about: 'How far it reaches, in pixels' }),
    angle: angle({ default: 0, about: 'The way it strikes: 0 down, 90 right, 180 up' }),
    kinks: count(0, 16, { default: 6, about: 'Corners between its ends' }),
    zigzag: px(0, 32, { default: 3, about: 'Pixels each corner steps off the line, to alternate sides' }),
    sway: px(0, 64, { default: 0, about: 'Pixels the whole path wanders in a slow bend' }),
    width: px(1, 16, { default: 3, about: 'Pixels thick' }),
    lead: share({ default: 1, about: 'How far down it has reached, 0 to 1 (a leader creeping down)' }),
    fade: share({ default: 0, about: 'The share gone from its start, as it fades away' }),
    taper: share({ default: 0, about: 'How much it thins towards its far end' }),
    forks: count(0, 8, { default: 0, about: 'How many forks leave its corners' }),
    forkLength: share({ default: 0.3, about: 'A fork\'s length, as a share of the bolt\'s' }),
    forkAngle: angle({ default: 40, about: 'How far a fork turns off the bolt\'s way, in degrees' }),
    flicker: count(0, 8, { default: 0, about: 'How many different paths it takes over the clip (0: one)' }),
    seed: seed({ default: 0, about: 'Which path' }),
    paints: paints(8, { about: 'Hottest (its core) first; the last is the rim' }),
    area: areaArg(),
  },
  keyable: ['lead', 'fade', 'taper', 'angle'],
  // its box (a square as long as it is, whichever way it points, and its margin): every pixel tested against every
  // piece of the stroke and its forks, the layers' passes, and the walk along its spines
  cost: (a) => {
    const side = boltSide(a), pieces = Math.round(a.kinks) + 2 + 6 * a.forks;
    return charge(side, side, (pieces + 8 * a.paints.length) * areaOf(side, side) + 4 * (side + 2) * (1 + a.forks));
  },
  run(a, ctx) {
    const B = boxOf(ctx, a.area), C = a.paints, A = a.angle * RAD;
    const x0 = a.at[0], y0 = a.at[1], x1 = x0 + Math.sin(A) * a.length, y1 = y0 + Math.cos(A) * a.length;
    const u = ctx.loop ? fract(ctx.t) : clamp(ctx.t);
    const s = a.seed + (a.flicker > 0 ? Math.min(a.flicker - 1, Math.floor(u * a.flicker)) : 0);
    const zigzag = a.zigzag, from = a.fade, to = a.lead;
    const pts = boltPath(x0, y0, x1, y1, { kinks: a.kinks, zigzag, sway: a.sway, seed: s });
    if (to <= from || pts.length < 2) return [];
    const h = (i, ch) => hash(i, s * 64 + ch);
    const pieces = [], spines = [];
    const add = (path, r0, r1, lo, hi) => {
      let total = 0;
      for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      let done = 0;
      for (let i = 1; i < path.length; i++) {
        const [ax, ay] = path[i - 1], [bx, by] = path[i], len = Math.hypot(bx - ax, by - ay);
        const ka = done / (total || 1), kb = (done + len) / (total || 1);
        done += len;
        const p = Math.max(ka, lo), q = Math.min(kb, hi);
        if (q <= p || len <= 0) continue;
        const fa = (p - ka) / (kb - ka), fb = (q - ka) / (kb - ka);
        pieces.push([ax + (bx - ax) * fa, ay + (by - ay) * fa, ax + (bx - ax) * fb, ay + (by - ay) * fb, lerp(r0, r1, p), lerp(r0, r1, q)]);
      }
      spines.push(spineOf(path, lo, hi));
    };
    const r = Math.max(0.5, a.width / 2);
    add(pts, r, lerp(r, 0.5, clamp(a.taper)), clamp(from), clamp(to));
    const n = pts.length - 1, count = Math.max(0, Math.round(a.forks));
    const mx = pts[n][0] - pts[0][0], my = pts[n][1] - pts[0][1], ML = Math.hypot(mx, my) || 1e-6, main = Math.atan2(mx, my);
    for (let f = 0; f < count; f++) {
      const at = Math.min(n - 1, Math.max(1, Math.round(n * lerp(0.2, 0.72, count === 1 ? 0.45 : f / (count - 1)) + (h(f, 11) - 0.5))));
      const k = at / n;
      if (k < from || k > to) continue;
      const [fx0, fy0] = pts[at];
      const sideOf = (f % 2 ? -1 : 1) * (h(0, 12) < 0.5 ? 1 : -1);
      const an = main + sideOf * (a.forkAngle * RAD) * (0.75 + 0.5 * h(f, 13));
      const len = ML * a.forkLength * (0.6 + 0.4 * h(f, 14)) * (1 - 0.35 * k);
      const fp = boltPath(fx0, fy0, fx0 + Math.sin(an) * len, fy0 + Math.cos(an) * len, { kinks: 2 + Math.round(2 * h(f, 15)), zigzag: zigzag * 0.6, seed: s * 7 + f + 1 });
      add(fp, Math.max(0.5, r * 0.6), 0.5, 0, 1);
    }
    const inside = (px0, py0) => {
      const key = Math.floor(py0) * 4096 + Math.floor(px0);
      for (const sp of spines) if (sp.has(key)) return true;
      for (const [ax, ay, bx, by, ra, rb] of pieces) {
        if (ra <= 0.5 && rb <= 0.5) continue;
        const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-6;
        const q = clamp(((px0 - ax) * ex + (py0 - ay) * ey) / l2), rr = ra + (rb - ra) * q;
        if ((px0 - ax - ex * q) ** 2 + (py0 - ay - ey * q) ** 2 <= rr * rr) return true;
      }
      return false;
    };
    // the box the stroke, its forks and its rim lie in, with a margin of empty pixels, cut to the frame's border:
    // its layers come out as over the whole frame
    const U = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [ax, ay, bx, by, ra, rb] of pieces) {
      const e = Math.max(ra, rb) + 3;
      U[0] = Math.min(U[0], ax - e, bx - e); U[1] = Math.min(U[1], ay - e, by - e); U[2] = Math.max(U[2], ax + e + 1, bx + e + 1); U[3] = Math.max(U[3], ay + e + 1, by + e + 1);
    }
    if (!U.every(Number.isFinite)) return [];
    const S = boxIn(B, ...U);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    layered(g, S, inside, C);
    return g.stamps();
  },
});

// ---- swirl@1 -------------------------------------------------------------------------------------------------------

/**
 * swirl@1: `count` sparks that spiral round `at` from a ring of radius `r0` to radius `r1`, going `turns` round
 * (negative: the other way; `squash` below 1 flattens it), each with a `tail` of pixels: energy gathering into a
 * caster's hand (r1 below r0) or flung out of it. One-shot (`stagger`, `begin`, `end`): each waits at r0 and is at r1 at
 * the end, cool at r0 and hottest at r1; `loop`: each on its own timer. A spark is `size` px across at r1 (2 x 2 with
 * a rim from 1.5). Port of engine/spells.js swirl, pixel for pixel.
 */
export const swirl = defineGenerator({
  id: 'swirl', v: 1, family: 'fx',
  about: 'Sparks spiralling in to a point or out of it, each with a tail: energy gathering into a caster\'s hand.',
  args: {
    at: point({ about: 'The middle they spiral round' }),
    count: count(1, 32, { default: 8, about: 'How many sparks' }),
    seed: seed({ default: 0, about: 'Where each starts and when it sets off' }),
    loop: flag({ default: false, about: 'Each repeats on its own timer (off: one sweep over the clip)' }),
    cycles: count(1, 8, { default: 1, about: 'Sweeps per loop of the clip' }),
    stagger: share({ default: 0.4, about: 'One sweep: the longest a spark waits, as a share of the clip' }),
    r0: px(0, 160, { default: 14, about: 'The radius they start at' }),
    r1: px(0, 160, { default: 1, about: 'The radius they end at (below r0: gathering in)' }),
    turns: px(-4, 4, { default: 0.5, about: 'How far round each goes (0.5 half a turn; below 0 the other way)' }),
    squash: px(0.1, 2, { default: 1, about: 'Below 1 flattens the spiral' }),
    size: px(0, 4, { default: 2, about: 'Pixels across a spark at r1' }),
    tail: count(0, 8, { default: 2, about: 'Pixels of tail behind each spark' }),
    paints: paints(8, { about: 'Hottest first; the last is the rim and the tail\'s end' }),
    begin: beginArg(),
    end: endArg(),
    area: areaArg(),
  },
  keyable: ['r0', 'r1', 'turns', 'squash'],
  // a handful of pixels a spark and its tail, and the scans of its grid (its box: the spiral's widest)
  cost: (a) => { const R = Math.max(a.r0, a.r1), w = 2 * R + 8, h = 2 * R * Math.max(1, a.squash) + 8; return charge(w, h, a.count * (a.tail + 16) + 3 * areaOf(w, h)); },
  run(a, ctx) {
    const t = phaseOf(a, ctx);
    if (t === null) return [];
    const B = boxOf(ctx, a.area), [x, y] = a.at, C = a.paints;
    const ringed = C.length > 1, body = ringed ? C.slice(0, C.length - 1) : C, rim = C[C.length - 1];
    const R = Math.max(a.r0, a.r1), sq = Math.max(1, a.squash);
    const S = boxIn(B, x - R - 3, y - R * sq - 3, x + R + 4, y + R * sq + 4);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    const h = (i, ch) => hash(i, a.seed * 64 + ch);
    const at = (i, life) => {
      const an = TAU * ((i + 0.6 * h(i, 2)) / a.count + a.turns * life);
      const r = lerp(a.r0 * (0.8 + 0.2 * h(i, 3)), a.r1, life ** 1.4);
      return [x + Math.sin(an) * r, y + Math.cos(an) * r * a.squash];
    };
    for (let i = 0; i < a.count; i++) {
      const life = lifeOf(t, i, { seed: a.seed, loop: a.loop, cycles: a.cycles, stagger: a.stagger });
      for (let j = Math.round(a.tail); j >= 1; j--) {
        const back = life - 0.07 * j;
        if (back <= 0) continue;
        put(g, B, ...at(i, back), j === 1 ? body[body.length - 1] : rim);
      }
      const [px0, py0] = at(i, life);
      const c = stepAt(body, 0.25 + 0.75 * life);
      if (a.size * (0.7 + 0.3 * life) < 1.5) put(g, B, px0, py0, c);
      else {
        const qx = Math.floor(px0 - 0.5), qy = Math.floor(py0 - 0.5);
        if (ringed) for (const d of [0, 1]) { put(g, B, qx + d, qy - 1, rim); put(g, B, qx + d, qy + 2, rim); put(g, B, qx - 1, qy + d, rim); put(g, B, qx + 2, qy + d, rim); }
        put(g, B, qx, qy, c); put(g, B, qx + 1, qy, c); put(g, B, qx, qy + 1, c); put(g, B, qx + 1, qy + 1, c);
      }
    }
    return g.stamps();
  },
});

// ---- motes@1 -------------------------------------------------------------------------------------------------------

/** The shapes of motes@1 (engine/spells.js MOTE_SHAPES): dot, plus, leaf, star, heart. */
export const MOTE_SHAPES = Object.freeze(['dot', 'plus', 'leaf', 'star', 'heart']);

/** engine/spells.js moteIn: the shape test of one mote `size` px across centred on a pixel, simplified as it gets smaller. */
function moteIn(shape, cx, cy, size, lean = 1) {
  const S = Math.max(1, size), a = S / 2;
  if (S < 2) return (px0, py0) => Math.abs(px0 - cx) < 0.5 && Math.abs(py0 - cy) < 0.5;
  const small = (px0, py0) => (Math.abs(px0 - cx) < 1.5 && Math.abs(py0 - cy) < 0.5) || (Math.abs(px0 - cx) < 0.5 && Math.abs(py0 - cy) < 1.5);
  if (shape === 'plus') return S < 4 ? small : crossIn(cx, cy, S, S >= 7 ? 3 : 1);
  if (S < 4) return small;
  if (shape === 'leaf') { const d = a * 0.95; return leafIn(cx - lean * d, cy + d, cx + lean * d, cy - d, S * 0.58, { belly: 0.4, blunt: 0 }); }
  if (shape === 'star') return S < 7 ? (px0, py0) => Math.abs(px0 - cx) + Math.abs(py0 - cy) <= a - 0.4 || small(px0, py0) : starIn(cx, cy + 0.4, a + 0.9, 5, { inner: 0.46 });
  if (shape === 'heart') return heartIn(cx, cy + 0.2, S, S - 0.6, 'classic');
  return (px0, py0) => (px0 - cx) ** 2 + (py0 - cy) ** 2 <= (a - 0.1) ** 2;
}
/** The side of one mote's own grid: a mote at most `size` px across (rounded up to odd), its rim and a margin. */
const moteSide = (size) => 2 * (Math.ceil(size / 2) + 5) + 1;

/**
 * motes@1: `count` small shaped motes (`shape`: dot, plus, leaf, star, heart) rising from `at` in a column `width` px
 * across: healing lights, blessings, pollen, souls. Each is born small, grows to `size` px, floats up to its own share
 * of `rise` swaying `sway` px, then shrinks to a pixel; young ones the hottest paint, cooling as they age, each with a
 * 1 px rim of the last. `loop`: each on its own timer (`cycles` a loop); off: they set off one after another over the
 * first `stagger` of the clip and a faded one stays as a rim pixel drifting up. Port of engine/spells.js motes, pixel
 * for pixel.
 */
export const motes = defineGenerator({
  id: 'motes', v: 1, family: 'fx',
  about: 'Small shaped motes rising in a loose column and fading: healing lights, blessings, pollen or souls.',
  args: {
    at: point({ about: 'The foot of the column they rise from' }),
    count: count(1, 32, { default: 6, about: 'How many motes' }),
    seed: seed({ default: 0, about: 'Where each rises and when' }),
    loop: flag({ default: true, about: 'Each repeats on its own timer (off: they set off one after another over the clip)' }),
    cycles: count(1, 8, { default: 1, about: 'Lives of each per loop of the clip' }),
    stagger: share({ default: 0.5, about: 'One set: the share of the clip over which they set off (at most 0.9)' }),
    rise: px(0, 256, { default: 30, about: 'How far the highest one climbs' }),
    width: px(0, 256, { default: 16, about: 'How wide the column is' }),
    size: px(1, 15, { default: 7, about: 'Pixels across a grown mote' }),
    shape: word(MOTE_SHAPES, { default: 'plus', about: 'Dot, plus, leaf, star or heart (under 5 px each is a small plus or a dot)' }),
    sway: px(0, 32, { default: 1.5, about: 'Pixels a mote sways side to side' }),
    paints: paints(8, { about: 'Hottest (a young mote) first; the last is the rim' }),
    begin: beginArg(),
    end: endArg(),
    area: areaArg(),
  },
  keyable: ['rise', 'width', 'sway', 'size'],
  // each mote in its own grid: its rim's tests against a shape of up to ten edges, about sixty a pixel
  cost: (a) => { const side = moteSide(a.size); return Math.max(a.count * tilesOf(side, side), workCost(a.count * 60 * areaOf(side, side))); },
  run(a, ctx) {
    const t = phaseOf(a, ctx);
    if (t === null) return [];
    const B = boxOf(ctx, a.area), [x, y] = a.at, C = a.paints, nC = C.length, rim = C[nC - 1], body = nC > 1 ? C.slice(0, nC - 1) : C;
    const h = (i, ch) => hash(i, a.seed * 64 + ch);
    const clip = clipOf(B), count = a.count, loop = a.loop;
    const keepIn = (v, lo, hi) => Math.min(Math.max(v, lo + 0.01), hi - 0.01);
    const stagger = clamp(a.stagger, 0, 0.9), tt = clamp(t);
    const turn = (i) => (count < 2 ? 0 : ((i * 5) % count) / (count - 1));
    const list = [];
    for (let i = 0; i < count; i++) {
      let life, gone = 0;
      if (loop) life = lifeOf(t, i, { seed: a.seed, loop: true, cycles: a.cycles });
      else {
        const start = stagger * turn(i), raw = (tt - start) / (1 - stagger);
        if (raw < 0) continue;
        life = Math.min(1, raw); gone = Math.max(0, raw - 1);
      }
      const lane = count === 1 ? 0 : ((i * 0.618034 + h(0, 2)) % 1) - 0.5;
      const top = a.rise * (0.45 + 0.55 * h(i, 3));
      let px0 = x + lane * a.width + a.sway * Math.sin(TAU * (life + h(i, 4)));
      let py0 = y - top * lerp(life, easeOut(life), 0.6) - 5 * gone;
      const grown = life < 0.15 ? lerp(0.4, 1, life / 0.15) : life > 0.5 ? lerp(1, 0.1, (life - 0.5) / 0.5) : 1;
      const s = a.size * grown;
      const S = s < 2 ? 1 : 2 * Math.round((s - 1) / 2) + 1;
      if (!loop) { px0 = keepIn(px0, B[0] + S / 2, B[2] - S / 2); py0 = keepIn(py0, B[1] + S / 2, B[3] - S / 2); }
      list.push({ i, life, S, px: Math.floor(px0) + 0.5, py: Math.floor(py0) + 0.5 });
    }
    list.sort((p, q) => q.life - p.life);
    const out = [];
    for (const M of list) {
      if (!Number.isFinite(M.px) || !Number.isFinite(M.py)) continue;
      const r = M.S / 2 + 2;
      const g = gridAround(B, M.px, M.py, Math.ceil(r) + 2);
      if (M.S === 1) {
        if (loop && M.life > 0.97) continue;
        put(g, B, M.px, M.py, !loop && M.life >= 0.95 ? rim : body[body.length - 1]);
        out.push(...g.stamps());
        continue;
      }
      const c = stepAt(body, 1 - M.life * 1.15);
      g.fill(M.px - r, M.py - r, M.px + r, M.py + r, moteIn(a.shape, M.px, M.py, M.S, h(M.i, 5) < 0.5 ? 1 : -1), c, nC > 1 ? { outline: rim, clip } : { clip });
      out.push(...g.stamps());
    }
    return out;
  },
});

// ---- stamp bounds, size keys, frame pixels --------------------------------------------------------------------------

/** The most stamp pixels each behaviour of this file can return in a frame of `size`: "<id>@<v>" -> (args, size) -> pixels (engine/gen/index.js STAMP_BOUNDS). */
export const SPELL_STAMP_BOUNDS = Object.freeze({
  'bolt@1': (a, size) => boxPixels(boltSide(a), boltSide(a), size),
  'swirl@1': (a, size) => { const R = Math.max(a.r0, a.r1); return boxPixels(2 * R + 8, 2 * R * Math.max(1, a.squash) + 8, size); },
  'motes@1': (a, size) => a.count * Math.min(innerOf(size), areaOf(moteSide(a.size), moteSide(a.size))),
});

/** The keyable arguments of each behaviour of this file that its cost or stamp bound reads (engine/gen/index.js SIZE_KEYS). */
export const SPELL_SIZE_KEYS = Object.freeze({
  'bolt@1': Object.freeze([]),
  'swirl@1': Object.freeze(['r0', 'r1', 'squash']),
  'motes@1': Object.freeze(['size']),
});

/** Why each behaviour of this file works in frame pixels (engine/gen/index.js FRAME_GENERATORS). */
export const SPELL_FRAME_GENERATORS = Object.freeze({
  'bolt@1': 'a bolt clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'swirl@1': 'sparks clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'motes@1': 'an effect whose one-shot motes stop at the frame\'s border: name it as an emitter, not in a draw list on a node',
});
