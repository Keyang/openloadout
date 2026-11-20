// Effect behaviours of fire and blasts (docs/data-sprites.md 2.5c and 3.3, family "fx"; build item B12c): what an
// `emitters` body names for flames, embers, cartoon blasts, poof rings and rings of sparkles. Each is a port of an
// engine helper that RETURNS PRIMITIVES (stamps keyed to the paints its call names) instead of drawing, pixel for pixel:
//   flame@1       engine/fx.js flame          nested layers of fire licking from a point, with an optional round head
//   embers@1      engine/bursts.js embers     glowing beads thrown out from a blast, cooling to single pixels
//   spark.ring@1  engine/bursts.js sparkRing  a ring of light marks that spreads, drifts up and thins out
//   blast.ball@1  engine/bursts.js blastBall  a scalloped or spiked ball in nested tones that can open into a ring
//   puff.ring@1   engine/bursts.js puffRing   round puffs on a widening ring, joined into one cloud, thinning
// Angles are degrees (rig convention: 0 down, 90 right, 180 up) where the code took radians. Shared rules:
// engine/gen/fx-common.js. Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same
// in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, flag, angle, word, paint, paints } from './args.js';
import { workCost } from './pixels.js';
import { hash, fract, clamp, lerp, easeOut, TAU, PI } from '../motion.js';
import { RAD, beginArg, endArg, areaArg, phaseOf, boxOf, boxIn, emptyBox, gridOf, gridAround, put, clipOf, within, isNone, sparkMark, SPARK_STYLES, tilesOf, areaOf, charge, innerOf, boxPixels } from './fx-common.js';

// ---- flame@1 -------------------------------------------------------------------------------------------------------

/**
 * The tongues of flame@1: the main one along `angle`, then `tongues - 1` more on alternate sides (the first to the
 * right of the way it points), the outermost `spread` px across from the main one's foot, leaning `fan` degrees
 * outward (below 0: inward), `shorten` shorter and `slim` narrower, swaying 0.6 as much, each 0.37 of a ripple later.
 */
function flameTongues(a) {
  const A = a.angle * RAD, ux = Math.sin(A), uy = Math.cos(A);
  const list = [{ angle: A, length: a.length, width: a.width, sway: a.sway, phase: 0, at: [0, 0] }];
  const ranks = Math.ceil((a.tongues - 1) / 2);
  for (let i = 1; i < a.tongues; i++) {
    const s = i % 2 ? 1 : -1, u = Math.ceil(i / 2) / ranks;
    list.push({ angle: (a.angle - s * a.fan * u) * RAD, length: a.length * (1 - a.shorten * u), width: a.width * (1 - a.slim * u), sway: a.sway * 0.6, phase: 0.37 * i, at: [-uy * s * a.spread * u, ux * s * a.spread * u] });
  }
  return list;
}
/** How far from `at` a flame's pixels can reach, with its rim and a margin: its head, its spread, its longest tongue. */
const flameReach = (a) => 1.3 * a.head + a.spread + a.length + 1.15 * a.width + a.sway + 5;

/**
 * flame@1: a flame in nested layers of `paints` (hottest first, the last its 1 px rim): rippling tongues streaming from
 * `at` along `angle`, `length` px long and `width` px across at their widest (half-width), their tips swaying `sway` px,
 * the ripple running `cycles` times a loop so the loop closes; `heat` 0..1 how far the inner layers reach. No `head`: a
 * torch or candle flame (round foot, pointed tip); a `head` radius: the tongues taper from a round head into a tail, a
 * fireball or a rocket flame. `tongues` 2 to 9 add licks beside the main one (see `spread`, `fan`, `shorten`, `slim`).
 * Port of engine/fx.js flame (its tongue list made by these arguments), pixel for pixel.
 */
export const flame = defineGenerator({
  id: 'flame', v: 1, family: 'fx',
  about: 'A flame in nested layers of fire licking from a point, with an optional round head: a torch, a fireball, a rocket flame.',
  args: {
    at: point({ about: 'The foot of the flame (the middle of its head, when it has one)' }),
    head: px(0, 64, { default: 0, about: 'The radius of a round head the tongues stream from (0: none, a torch flame)' }),
    angle: angle({ default: 180, about: 'The way the main tongue streams: 180 up, -90 left, 90 right' }),
    length: px(0, 128, { default: 12, about: 'How long the main tongue is' }),
    width: px(0, 32, { default: 4, about: 'Half the main tongue\'s width at its widest' }),
    sway: px(0, 16, { default: 1.5, about: 'How far a tongue\'s tip ripples sideways' }),
    cycles: count(1, 8, { default: 1, about: 'Ripples per loop of the clip' }),
    heat: share({ default: 0.5, about: 'How far the hotter layers reach into the flame' }),
    tongues: count(1, 9, { default: 1, about: 'How many tongues: the main one and licks on alternate sides of it' }),
    fan: angle({ default: 30, about: 'How far the outermost licks lean out from the main one, in degrees (below 0: in)' }),
    spread: px(0, 64, { default: 0, about: 'How far across from the main tongue\'s foot the outermost licks stand' }),
    shorten: share({ default: 0.3, about: 'How much shorter the outermost licks are' }),
    slim: share({ default: 0.4, about: 'How much narrower the outermost licks are' }),
    paints: paints(8, { about: 'Hottest first; the last is the 1 px rim' }),
    area: areaArg(),
  },
  keyable: ['length', 'width', 'sway', 'head', 'spread', 'angle', 'fan', 'heat', 'shorten', 'slim'],
  // its box (its reach each way): every layer tests each pixel against every tongue (and the head), and the scans
  cost: (a) => { const side = 2 * flameReach(a) + 2; return charge(side, side, Math.max(1, a.paints.length - 1) * (8 * a.tongues + 12) * areaOf(side, side)); },
  run(a, ctx) {
    const B = boxOf(ctx, a.area), [x, y] = a.at, head = a.head, t = ctx.t, cycles = a.cycles;
    const C = a.paints, n = C.length;
    const list = flameTongues(a).map((T) => ({ angle: T.angle, length: Math.max(0.01, T.length), width: T.width, phase: T.phase, sway: T.sway, ax: T.at[0], ay: T.at[1] }));
    const profile = head > 0 ? (hk) => (1 - hk) ** 0.8 : (hk) => Math.sin(PI * Math.sqrt(0.05 + 0.95 * hk)) ** 0.75;
    const lx = head > 0 ? -Math.sin(list[0].angle) : 0, ly = head > 0 ? -Math.cos(list[0].angle) : 0;
    const layerIn = (k) => {
      const kw = k ** 0.8, hr = head * (0.3 + 0.7 * k), hx = x + lx * head * 0.3 * (1 - k), hy = y + ly * head * 0.3 * (1 - k);
      return (px0, py0) => {
        if (head > 0 && (px0 - hx) ** 2 + (py0 - hy) ** 2 <= hr * hr) return true;
        for (const T of list) {
          const ux = Math.sin(T.angle), uy = Math.cos(T.angle);
          const dx = px0 - x - T.ax, dy = py0 - y - T.ay;
          const along = dx * ux + dy * uy;
          const hk = along / (T.length * k);
          if (hk < 0 || hk > 1) continue;
          const hh = along / T.length;
          const mid = T.sway * hh * Math.sin(TAU * (1.3 * hh - cycles * t + T.phase));
          const wd = T.width * kw * profile(hk) * (1 + 0.15 * Math.sin(TAU * (2 * hh - 2 * cycles * t + 3 * T.phase)));
          if (Math.abs(dy * ux - dx * uy - mid) <= Math.max(0.55, wd)) return true;
        }
        return false;
      };
    };
    // the box the flame and its rim lie in (flameReach), cut to the frame's border: with a margin of empty pixels its
    // layers come out as over the whole frame
    const R = flameReach(a), S = boxIn(B, x - R, y - R, x + R + 1, y + R + 1);
    if (emptyBox(S)) return [];
    const g = gridOf(S), w = S[2] - S[0], hgt = S[3] - S[1];
    let prev = null;
    const e = lerp(1.5, 0.7, clamp(a.heat));
    for (let j = n - 2; j >= 0; j--) {
      const k = n === 2 ? 1 : ((j + 1) / (n - 1)) ** e;
      const test = layerIn(j === n - 2 ? 1 : k);
      const m = new Uint8Array(w * hgt);
      const was = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < hgt && prev[yy * w + xx] === 1;
      for (let yy = 0; yy < hgt; yy++) for (let xx = 0; xx < w; xx++) {
        if (!test(S[0] + xx + 0.5, S[1] + yy + 0.5)) continue;
        if (prev && !(was(xx, yy) && was(xx - 1, yy) && was(xx + 1, yy) && was(xx, yy - 1) && was(xx, yy + 1))) continue;
        m[yy * w + xx] = 1;
      }
      const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < hgt && m[yy * w + xx] === 1;
      const cc = g.id(C[j]), cr = g.id(C[n - 1]);
      for (let yy = 0; yy < hgt; yy++) for (let xx = 0; xx < w; xx++) {
        if (m[yy * w + xx]) g.setId(S[0] + xx, S[1] + yy, cc);
        else if (!prev && (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1))) g.setId(S[0] + xx, S[1] + yy, cr);
      }
      prev = m;
    }
    return g.stamps();
  },
});

// ---- embers@1 ------------------------------------------------------------------------------------------------------

/** The side of one ember's own grid: its bead (3 px and a rim) and its streak behind it. */
const emberSide = (tail) => 2 * Math.ceil(tail + 6) + 1;

/**
 * embers@1: `count` glowing beads thrown out from `at`: the embers of a blast, sparks off an anvil. Each a bead `size`
 * (2 or 3) px across inside a rim, with a streak of `tail` px behind it while it is fast; each flies from radius `r0`
 * to `r1` along its own way at its own speed (the first at `turn` degrees), falls `gravity` px by the end, cools, and
 * after `hold` of its time is one pixel, kept inside the box; one-shot over the clip, its last frame one pixel a bead.
 * Port of engine/bursts.js embers, pixel for pixel.
 */
export const embers = defineGenerator({
  id: 'embers', v: 1, family: 'fx',
  about: 'Glowing beads thrown out from a blast that streak, cool and end as single pixels: embers or anvil sparks.',
  args: {
    at: point({ about: 'The middle of the blast' }),
    count: count(0, 64, { default: 8, about: 'How many beads' }),
    r0: px(0, 320, { default: 0, about: 'How far out the nearest are at the start: outside the fire, so they show' }),
    r1: px(0, 320, { default: 12, about: 'How far the farthest gets' }),
    size: px(0, 8, { default: 2, about: 'Pixels across a bead before its rim (2 or 3; others are rounded into that)' }),
    hold: share({ default: 0.6, about: 'The share of its time a bead keeps its size; after it each is one pixel' }),
    tail: px(0, 16, { default: 3, about: 'Pixels of streak behind a bead at the start; it is gone by `hold`' }),
    gravity: px(-128, 128, { default: 0, about: 'How far they fall by the end (below 0 rise)' }),
    turn: angle({ default: 0, about: 'The way the first bead flies, in degrees (0 down)' }),
    seed: seed({ default: 0, about: 'Each bead\'s head start and speed' }),
    paints: paints(8, { about: 'Hottest first; the last is the rim' }),
    begin: beginArg(),
    end: endArg(),
    area: areaArg(),
  },
  keyable: ['r0', 'r1', 'gravity', 'turn', 'hold'],
  // each bead in its own grid: its pixels and its streak's
  cost: (a) => Math.max(a.count * tilesOf(emberSide(a.tail), emberSide(a.tail)), workCost(a.count * (a.tail + 40))),
  run(a, ctx) {
    const k = phaseOf(a, ctx);
    if (k === null) return [];
    const B = boxOf(ctx, a.area), [x, y] = a.at, C = a.paints, n = C.length, rim = C[n - 1], edge = C[Math.max(0, n - 2)];
    const big = k <= a.hold, s = Math.max(2, Math.min(3, Math.round(a.size)));
    const young = k <= a.hold / 2;
    const lit = C[young ? 0 : Math.min(1, Math.max(0, n - 2))], body = C[Math.min(young ? 1 : 2, Math.max(0, n - 2))], ringOf = young ? edge : rim;
    const streak = big && a.hold > 0 ? Math.round(a.tail * (1 - k / a.hold)) : 0;
    const TURN = a.turn * RAD, reach = Math.ceil(a.tail + 6);
    const out = [];
    for (let i = 0; i < a.count; i++) {
      const h = (ch) => hash(i, a.seed * 64 + ch);
      const an = TURN + ((i + 0.5 + (h(2) - 0.5) * 0.8) * TAU) / a.count, ux = Math.sin(an), uy = Math.cos(an);
      const d = a.r0 + (a.r1 - a.r0) * (0.35 * h(4) + 0.65 * (0.5 + 0.5 * h(3)) * easeOut(k));
      const m = big ? s / 2 + 1 : 0.5;
      const px0 = within(x + ux * d, B[0] + m, B[2] - m), py0 = within(y + uy * d + a.gravity * k * k, B[1] + m, B[3] - m);
      if (!Number.isFinite(px0) || !Number.isFinite(py0)) continue;
      const g = gridAround(B, px0, py0, reach);
      if (!big) { put(g, B, px0, py0, k >= 1 ? rim : edge); out.push(...g.stamps()); continue; }
      for (let q = 1; q <= streak; q++) put(g, B, px0 - ux * (s / 2 + 0.5 + q), py0 - uy * (s / 2 + 0.5 + q), ringOf);
      const bx = Math.round(px0 - s / 2), by = Math.round(py0 - s / 2);
      for (let j = -1; j <= s; j++) for (let q = -1; q <= s; q++) {
        const ex = q < 0 || q >= s, ey = j < 0 || j >= s;
        if (ex && ey) continue;
        put(g, B, bx + q, by + j, ex || ey ? ringOf : q >= s - 1 && j === 0 ? lit : s === 3 && q >= 1 && j <= 1 ? lit : body);
      }
      out.push(...g.stamps());
    }
    return out;
  },
});

// ---- spark.ring@1 --------------------------------------------------------------------------------------------------

/**
 * spark.ring@1: `count` light marks (`style` plus, diamond or dot, up to `reach` 1..4 px to their tips; every other one
 * a step smaller and sooner gone) set on a ring round `at` that spreads from radius `r0` to `r1`, drifts `rise` px up
 * and thins to single pixels (`squash` below 1 flattens it; the first mark at `turn` degrees): the sparkles a collected
 * coin, gem or key leaves; one-shot over the clip, its last frame one pixel a mark. A mark's middle is `core` (clear:
 * the first paint) while young, then the second paint. Port of engine/bursts.js sparkRing, pixel for pixel.
 */
export const sparkRing = defineGenerator({
  id: 'spark.ring', v: 1, family: 'fx',
  about: 'A ring of light marks that spreads, drifts up and thins to single pixels: the sparkle a collected coin leaves.',
  args: {
    at: point({ about: 'The middle of the ring' }),
    count: count(1, 32, { default: 6, about: 'How many marks' }),
    r0: px(0, 160, { default: 3, about: 'The ring\'s radius at the start' }),
    r1: px(0, 160, { default: 10, about: 'The ring\'s radius at the end' }),
    rise: px(0, 128, { default: 0, about: 'How far the ring drifts up by the end' }),
    squash: px(0.1, 2, { default: 1, about: 'Below 1 flattens the ring' }),
    style: word(SPARK_STYLES, { default: 'plus', about: 'Plus (a four-point twinkle), diamond (a lozenge) or dot (a round bead)' }),
    reach: count(1, 4, { default: 2, about: 'The biggest a mark gets, in pixels from its middle to its tips' }),
    turn: angle({ default: 0, about: 'Where the first mark sits, in degrees (0 below the middle)' }),
    seed: seed({ default: 0, about: 'The marks\' small shifts round the ring' }),
    paints: paints(8, { about: 'Hottest first; the last is the rim, the one before it the arms' }),
    core: paint({ default: 'clear', about: 'A young mark\'s middle (clear: the first paint)' }),
    full: flag({ default: false, about: 'The middle\'s paint fills a plus\'s arms up to its tips' }),
    begin: beginArg(),
    end: endArg(),
    area: areaArg(),
  },
  keyable: ['r0', 'r1', 'rise', 'squash', 'turn'],
  // one stamp of at most 9 x 9 a mark
  cost: (a) => a.count,
  run(a, ctx) {
    const k = phaseOf(a, ctx);
    if (k === null) return [];
    const B = boxOf(ctx, a.area), [x, y] = a.at, C = a.paints, n = C.length, rim = C[n - 1], edge = C[Math.max(0, n - 2)];
    const core = isNone(a.core) ? C[0] : a.core, TURN = a.turn * RAD;
    const out = [];
    for (let i = 0; i < a.count; i++) {
      const small = i % 2 === 1;
      const an = TURN + ((i + 0.5) * TAU) / a.count + (hash(i, a.seed * 64 + 2) - 0.5) * 0.12;
      const d = lerp(a.r0, a.r1 * (small ? 0.86 : 1), easeOut(k));
      const kk = clamp(k * (small ? 1.2 : 1));
      const top = Math.max(1, Math.round(a.reach) - (small ? 1 : 0));
      const s = kk < 0.08 ? 0 : kk < 0.4 ? top : kk < 0.6 ? Math.max(0, top - 1) : kk < 0.78 ? Math.max(0, top - 2) : 0;
      const px0 = within(x + Math.sin(an) * d, B[0] + s + 0.5, B[2] - s - 0.5), py0 = within(y + Math.cos(an) * d * a.squash - a.rise * k, B[1] + s + 0.5, B[3] - s - 0.5);
      const g = gridAround(B, px0, py0, 4);
      if (s === 0) put(g, B, px0, py0, k >= 1 ? rim : edge);
      else sparkMark(g, B, px0, py0, s, a.style, C, { core: kk < 0.5 ? core : C[Math.min(1, n - 1)], full: a.full });
      out.push(...g.stamps());
    }
    return out;
  },
});

// ---- blast.ball@1 --------------------------------------------------------------------------------------------------

/**
 * blast.ball@1: a cartoon blast at `at`: a ball `r` px to the tips of its edge, scalloped (`bumps` round lumps `bump`
 * of r deep) or spiked (`points`), in nested `paints` (hottest in the middle, the coolest lining its edge, a rim of the
 * last round it), `heat` how far the hot paints reach; `hole` px empties its middle into a ring, `gaps` breaks that ring
 * away; `turn` degrees turns its edge so it boils from frame to frame. Port of engine/bursts.js blastBall, pixel for pixel.
 */
export const blastBall = defineGenerator({
  id: 'blast.ball', v: 1, family: 'fx',
  about: 'A cartoon blast: a scalloped or spiked ball in nested hot tones that can open into a broken ring.',
  args: {
    at: point({ about: 'The middle of the blast' }),
    r: px(0, 160, { default: 8, about: 'The radius to the tips of its edge' }),
    hole: px(0, 160, { default: 0, about: 'The radius of its empty middle (0: a ball)' }),
    bumps: count(0, 32, { default: 7, about: 'How many scallops or spikes round its edge' }),
    bump: px(0, 0.6, { default: 0.15, about: 'How deep they are, as a share of r (0: a plain disc)' }),
    points: flag({ default: false, about: 'Straight spikes, a star (off: round scallops)' }),
    turn: angle({ default: 0, about: 'Turns its edge, in degrees, so it can boil from frame to frame' }),
    heat: share({ default: 0.5, about: 'How far the hot paints reach' }),
    gaps: share({ default: 0, about: 'A ring only: the share of it broken away, as it thins out' }),
    seed: seed({ default: 0, about: 'Where a ring breaks' }),
    paints: paints(8, { about: 'Hottest first; the last is the rim round it' }),
    area: areaArg(),
  },
  keyable: ['r', 'hole', 'bump', 'turn', 'heat', 'gaps'],
  // its box: a few tests a pixel to find its depth, the edge and rim passes, and the scans of its grid
  cost: (a) => { const side = 2 * a.r + 5; return charge(side, side, 20 * areaOf(side, side)); },
  run(a, ctx) {
    const B = boxOf(ctx, a.area), [x, y] = a.at, r = a.r, C = a.paints, n = C.length;
    if (!(r > 0)) return [];
    const body = n > 1 ? C.slice(0, n - 1) : C, m = body.length, rim = C[n - 1];
    const x0 = Math.max(B[0], Math.floor(x - r - 1)), y0 = Math.max(B[1], Math.floor(y - r - 1));
    const x1 = Math.min(B[2] - 1, Math.ceil(x + r + 1)), y1 = Math.min(B[3] - 1, Math.ceil(y + r + 1));
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return [];
    const g = gridOf([x0, y0, x1 + 1, y1 + 1]);
    const depth = clamp(a.bump, 0, 0.6), e = lerp(1.7, 0.6, clamp(a.heat)), SECT = 12, turn = a.turn * RAD, hole = a.hole;
    const mask = new Uint8Array(w * h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const dx = x0 + xx + 0.5 - x, dy = y0 + yy + 0.5 - y, d = Math.hypot(dx, dy);
      const th = Math.atan2(dx, dy) + PI;
      const u = fract(((th + turn) * a.bumps) / TAU);
      const lobe = a.points ? 1 - Math.abs(2 * u - 1) : Math.abs(Math.cos(PI * u));
      const ro = r * (1 - depth * (1 - lobe));
      if (d > ro || (hole > 0 && d < hole)) continue;
      if (a.gaps > 0 && hole > 0) { const s = Math.floor((fract(th / TAU) * SECT)) % SECT; if (hash(s, a.seed * 64 + 5) < a.gaps) continue; }
      const deep = hole > 0 ? Math.min(ro - d, d - hole) / Math.max(0.5, (ro - hole) / 2) : (ro - d) / ro;
      mask[yy * w + xx] = 1 + Math.max(0, m - 1 - Math.floor(clamp(deep) ** e * m * 0.999));
    }
    const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx] > 0;
    const ids = body.map((c) => g.id(c)), rimId = g.id(rim);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const v = mask[yy * w + xx];
      const edged = !(on(xx - 1, yy) && on(xx + 1, yy) && on(xx, yy - 1) && on(xx, yy + 1));
      if (v) g.setId(x0 + xx, y0 + yy, edged ? ids[m - 1] : ids[v - 1]);
      else if (n > 1 && (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1))) g.setId(x0 + xx, y0 + yy, rimId);
    }
    return g.stamps();
  },
});

// ---- puff.ring@1 ---------------------------------------------------------------------------------------------------

/**
 * The side of the box puff.ring@1's puffs can lie in: the ring each way (the puffs sit up to 8% off it), two puff radii
 * (up to 1.12 of its size) each way, what holding them inside the frame can add (their radii differ), and a margin.
 */
const puffRingSide = (a) => 2.16 * Math.max(a.r0, a.r1) + 5 * Math.max(a.size, a.last) + 8;

/**
 * puff.ring@1: `count` round puffs set evenly on a ring round `at` that widens from `r0` to `r1` while every puff
 * thins from `size` to `last` px in radius (after `hold` of its time): a poof breaking up, the smoke ring a blast leaves.
 * Puffs that touch join into one cloud with one rim (the last paint) and one shadow (`apart`: each painted on its own);
 * `lobes` 2 or 3 give each a lump at its side; `cool` the time they take the next paint; `uneven` how much they differ;
 * `rise` px the ring drifts up; the first at `turn` degrees. One-shot, its last frame a speck a puff. Port of
 * engine/bursts.js puffRing (its `end` is `last`), pixel for pixel.
 */
export const puffRing = defineGenerator({
  id: 'puff.ring', v: 1, family: 'fx',
  about: 'Round puffs on a widening ring that thin as they go, joined into one cloud: a poof breaking up, a smoke ring.',
  args: {
    at: point({ about: 'The middle of the ring' }),
    count: count(1, 16, { default: 6, about: 'How many puffs' }),
    r0: px(0, 160, { default: 4, about: 'The ring\'s radius at the start' }),
    r1: px(0, 160, { default: 12, about: 'The ring\'s radius at the end (it eases out)' }),
    size: px(0, 32, { default: 5, about: 'A puff\'s radius at the start' }),
    last: px(0, 32, { default: 0.8, about: 'A puff\'s radius at the end (0.8: a speck)' }),
    hold: share({ default: 0, about: 'The share of its time the puffs keep their full size' }),
    rise: px(0, 128, { default: 0, about: 'How far the ring drifts up by the end' }),
    cool: share({ default: 0.8, about: 'When the puffs lose their light top and take the next paint' }),
    uneven: share({ default: 0.5, about: 'How much the puffs differ in size and place' }),
    apart: flag({ default: false, about: 'Each puff painted on its own, so overlapping puffs stay distinct (off: one cloud)' }),
    lobes: count(1, 3, { default: 1, about: 'Lumps a puff: 1 round, 2 or 3 a small ragged cloud' }),
    turn: angle({ default: 0, about: 'Where the first puff sits, in degrees (0 below the middle)' }),
    seed: seed({ default: 0, about: 'How the puffs differ' }),
    paints: paints(8, { about: 'Lightest first; the last is the rim' }),
    begin: beginArg(),
    end: endArg(),
    area: areaArg(),
  },
  keyable: ['rise', 'turn', 'cool'],
  // its box (puffRingSide each way): up to seven tests of every lump of every puff a pixel, and the scans of its grid
  cost: (a) => { const side = puffRingSide(a); return charge(side, side, (7 * a.count * a.lobes + 3) * areaOf(side, side)); },
  run(a, ctx) {
    const k = phaseOf(a, ctx);
    if (k === null) return [];
    const B = boxOf(ctx, a.area), [x, y] = a.at, C = a.paints, n = C.length, rim = C[n - 1], top = Math.max(0, n - 2);
    const u = a.hold >= 1 ? 0 : clamp((k - a.hold) / (1 - a.hold));
    const idx = k < a.cool ? 0 : 1, base = C[Math.min(idx, top)], dark = C[Math.min(idx + 1, top)];
    const ring = lerp(a.r0, a.r1, easeOut(k)), rad = lerp(a.size, a.last, easeOut(u)), v = clamp(a.uneven), TURN = a.turn * RAD;
    const discs = [], specks = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const U = [Infinity, Infinity, -Infinity, -Infinity];
    const grow = (px0, py0, e) => { U[0] = Math.min(U[0], px0 - e); U[1] = Math.min(U[1], py0 - e); U[2] = Math.max(U[2], px0 + e + 1); U[3] = Math.max(U[3], py0 + e + 1); };
    for (let i = 0; i < a.count; i++) {
      const h = (ch) => hash(i, a.seed * 64 + ch);
      const an = TURN + ((i + (h(2) - 0.5) * 0.4 * v) * TAU) / a.count;
      const d = ring * (1 + (h(3) - 0.5) * 0.16 * v), r = rad * (1 + (h(5) - 0.5) * 0.24 * v);
      const px0 = within(x + Math.sin(an) * d, B[0] + r + 1, B[2] - r - 1), py0 = within(y + Math.cos(an) * d - a.rise * k, B[1] + r + 1, B[3] - r - 1);
      if (r < 0.9) { specks.push([px0, py0]); grow(px0, py0, 1); continue; }
      discs.push([px0, py0, r * r, r]);
      const flip = h(6) < 0.5 ? -1 : 1;
      for (let j = 0; j < Math.min(2, Math.round(a.lobes) - 1); j++) {
        const [lx, ly, ls] = j === 0 ? [-0.85, 0.3, 0.7] : [0.9, 0.38, 0.62];
        if (r * ls >= 0.75) discs.push([px0 + flip * lx * r, py0 + ly * r, (r * ls) ** 2, r * ls]);
      }
      x0 = Math.min(x0, px0 - 2 * r); y0 = Math.min(y0, py0 - r); x1 = Math.max(x1, px0 + 2 * r); y1 = Math.max(y1, py0 + r);
      grow(px0, py0, 2 * r + 2);
    }
    if (!U.every(Number.isFinite)) return [];
    const S = boxIn(B, ...U);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    if (discs.length) {
      const inside = (px1, py1) => { for (const [cx, cy, rr] of discs) if ((px1 - cx) ** 2 + (py1 - cy) ** 2 <= rr) return true; return false; };
      const clip = clipOf(B);
      const paint = { base, dark, light: base }, opt = { shade: rad >= 2.5 ? 1 : 0, outline: rim, clip };
      if (a.apart) for (const [cx, cy, rr, r] of discs) g.fill(cx - r, cy - r, cx + r, cy + r, (px1, py1) => (px1 - cx) ** 2 + (py1 - cy) ** 2 <= rr, paint, opt);
      else g.fill(x0, y0, x1, y1, inside, paint, opt);
    }
    for (const [sx, sy] of specks) put(g, B, sx, sy, k > 0.8 ? rim : base);
    return g.stamps();
  },
});

// ---- stamp bounds, size keys, frame pixels --------------------------------------------------------------------------

/** The most stamp pixels each behaviour of this file can return in a frame of `size`: "<id>@<v>" -> (args, size) -> pixels (engine/gen/index.js STAMP_BOUNDS). */
export const FIRE_STAMP_BOUNDS = Object.freeze({
  'flame@1': (a, size) => { const side = 2 * flameReach(a) + 2; return boxPixels(side, side, size); },
  'embers@1': (a, size) => a.count * Math.min(innerOf(size), areaOf(emberSide(a.tail), emberSide(a.tail))),
  'spark.ring@1': (a, size) => a.count * Math.min(innerOf(size), (2 * a.reach + 1) ** 2),
  'blast.ball@1': (a, size) => boxPixels(2 * a.r + 5, 2 * a.r + 5, size),
  'puff.ring@1': (a, size) => { const side = puffRingSide(a); return boxPixels(side, side, size); },
});

/** The keyable arguments of each behaviour of this file that its cost or stamp bound reads (engine/gen/index.js SIZE_KEYS). */
export const FIRE_SIZE_KEYS = Object.freeze({
  'flame@1': Object.freeze(['length', 'width', 'sway', 'head', 'spread']),
  'embers@1': Object.freeze([]),
  'spark.ring@1': Object.freeze([]),
  'blast.ball@1': Object.freeze(['r']),
  'puff.ring@1': Object.freeze([]),
});

/** Why each behaviour of this file works in frame pixels (engine/gen/index.js FRAME_GENERATORS). */
export const FIRE_FRAME_GENERATORS = Object.freeze({
  'flame@1': 'a flame clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'embers@1': 'an effect whose one-shot beads stop at the frame\'s border: name it as an emitter, not in a draw list on a node',
  'spark.ring@1': 'an effect whose marks stop at the frame\'s border: name it as an emitter, not in a draw list on a node',
  'blast.ball@1': 'a blast clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'puff.ring@1': 'an effect whose puffs stop at the frame\'s border: name it as an emitter, not in a draw list on a node',
});
