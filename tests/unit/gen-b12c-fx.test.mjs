// The effect behaviours build item B12c adds (docs/data-sprites.md section 9, row B12c; 2.5c; 3.3 "fx"): the other 20
// behaviours the library's 44 effects and 9 projectiles draw with, ports of engine/fx.js (sparkles, shards, smoke, rays,
// flame, beam, leaves, scorch, twinkle as twinkle@2), engine/bursts.js (embers, spark.ring, blast.ball, puff.ring),
// engine/spells.js (bolt, swirl, motes), engine/weather.js (fall.field), engine/shots.js (trail.puffs), engine/mist.js
// (mist) and engine/ripples.js (ripples) that RETURN PRIMITIVES (stamps) instead of drawing. Each is pinned by the
// goldens harness (tests/helpers/gen-harness.mjs) and checked pixel for pixel against the code it replaces, drawn on a
// Surface with the same colours (a colour rule the port names is worked out as engine/data-rules.js does).
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-b12c-fx.test.mjs (writes only files that do not exist).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { Surface } from '../../engine/surface.js';
import { ramp, col } from '../../engine/color.js';
import { paintColour } from '../../engine/data-rules.js';
import * as FX from '../../engine/fx.js';
import { rippleVersion } from '../../engine/ripples.js';

const RAD = Math.PI / 180;
const HEX = { p0: '#ffffff', p1: '#f0ead8', p2: '#f1c584', p3: '#f2a030', p4: '#8a5410', s0: '#c2c9d6', s1: '#9aa6c0', s2: '#6b7896', g0: '#4f9d57', g1: '#c98a4a', w: '#ffffff', b: '#241e2e', m: '#7fe0a0' };
const P5 = ['p0', 'p1', 'p2', 'p3', 'p4'];
const P4 = ['p1', 'p2', 'p3', 'p4'];
const S3 = ['s0', 's1', 's2'];

/** The behaviours B12c adds, each with its golden cases ({ args, ctx? }), at least three. */
const CASES = {
  'twinkle@2': [
    { args: { at: [16, 16], size: 2, paint: 'p3', core: 'w' } },
    { args: { at: [1, 5], size: 3, paint: 'p2', core: 'w' } },
    { args: { at: [10.7, 20.2], size: 0, paint: 'p1', core: 'w' } },
  ],
  'sparkles@1': [
    { args: { at: [16, 16], count: 6, seed: 2, reach: [12, 10], paints: P5, core: 'w' }, ctx: { t: 0.3, loop: true } },
    { args: { at: [20, 12], count: 9, seed: 5, cycles: 2, big: false, reach: [16, 8], paints: P4, core: 'w' }, ctx: { t: 0.65, loop: true } },
    { args: { at: [16, 16], count: 12, seed: 1, reach: [14, 14], paints: ['p2', 'p4'], core: 'p0' }, ctx: { t: 0.1, loop: true } },
  ],
  'rays@1': [
    { args: { at: [16, 24], count: 5, r0: 2, r1: 14, paints: P5 } },
    { args: { at: [24, 30], count: 7, angle: 160, arc: 120, r0: 3, r1: 22, dash: 2, gap: 3, phase: 0.4, seed: 3, paints: P4 } },
    { args: { at: [16, 16], count: 3, angle: 90, arc: 40, r0: 0, r1: 12, gap: 0, cycles: 2, paints: ['p1', 'p3'] }, ctx: { t: 0.25, loop: true } },
  ],
  'beam@1': [
    { args: { at: [16, 28], width: 4, height: 18, paints: P5 } },
    { args: { at: [16.5, 30], width: 5, height: 24, phase: 0.5, seed: 2, solid: 0.2, paints: P4 } },
    { args: { at: [20, 26], width: 6, height: 14, gap: 0, cycles: 1, paints: ['p1', 'p3', 'p4'] }, ctx: { t: 0.5, loop: true } },
  ],
  'scorch@1': [
    { args: { at: [16.5, 24], r: [12, 5], paint: 'b', paints: P5 } },
    { args: { at: [16.5, 24], r: [12, 5], spread: 0.4, heat: 0.8, embers: 6, seed: 2, paint: 'b', paints: P5 }, ctx: { frame: 3 } },
    { args: { at: [20.5, 20], r: [9, 4], hole: 0, gaps: 0.4, heat: 0.3, paint: 'b', paints: P4 }, ctx: { frame: 1 } },
  ],
  'shards@1': [
    { args: { at: [16, 16], count: 6, seed: 2, paint: 's1' }, ctx: { t: 0.3, loop: false } },
    { args: { at: [24, 20], count: 8, seed: 4, dist: 18, gravity: 10, size: 6, angle: 180, arc: 200, spin: 2, paint: 'g1' }, ctx: { t: 0.6, loop: false } },
    { args: { at: [16, 16], count: 5, seed: 7, size: 2, begin: 0.2, end: 0.8, paint: 's2' }, ctx: { t: 1, loop: false } },
  ],
  'smoke@1': [
    { args: { at: [16, 26], count: 5, seed: 1, paint: 's1' }, ctx: { t: 0.35, loop: true } },
    { args: { at: [20, 30], count: 6, seed: 3, loop: false, rise: 18, drift: -4, size: 5, paint: 's0' }, ctx: { t: 0.6, loop: false } },
    { args: { at: [16, 24], count: 4, seed: 6, cycles: 2, size: 3, paint: 'g1' }, ctx: { t: 0.8, loop: true } },
  ],
  'leaves@1': [
    { args: { at: [16, 16], count: 5, seed: 1, paints: ['g0'] }, ctx: { t: 0.4, loop: false } },
    { args: { at: [24, 18], count: 7, seed: 3, dist: 12, gravity: 12, size: 6, paints: ['g0', 'g1'], rim: 'b' }, ctx: { t: 0.8, loop: false } },
    { args: { at: [16, 16], count: 3, seed: 9, size: 4, paints: ['g1'] }, ctx: { t: 0, loop: false } },
  ],
  'flame@1': [
    { args: { at: [16, 28], length: 18, width: 5, paints: P4 }, ctx: { t: 0.25, loop: true } },
    { args: { at: [20, 16], head: 5, angle: -90, length: 14, width: 4, paints: P4 }, ctx: { t: 0.5, loop: true } },
    { args: { at: [24, 40], length: 14, width: 4, tongues: 3, fan: 25, spread: 5, cycles: 2, heat: 0.7, paints: P5 }, ctx: { t: 0.125, loop: true } },
  ],
  'embers@1': [
    { args: { at: [24, 24], count: 8, r0: 4, r1: 16, paints: P4 }, ctx: { t: 0.2, loop: false } },
    { args: { at: [24, 24], count: 10, r0: 6, r1: 18, size: 3, tail: 4, gravity: 4, turn: 30, seed: 2, paints: P5 }, ctx: { t: 0.5, loop: false } },
    { args: { at: [16, 16], count: 6, r1: 12, paints: P4 }, ctx: { t: 0.9, loop: false } },
  ],
  'spark.ring@1': [
    { args: { at: [15.5, 15.5], count: 6, r0: 4, r1: 11, paints: P4 }, ctx: { t: 0.3, loop: false } },
    { args: { at: [24, 24], count: 8, r0: 3, r1: 16, rise: 4, squash: 0.8, style: 'diamond', reach: 3, turn: 20, seed: 4, paints: P5, core: 'p0' }, ctx: { t: 0.2, loop: false } },
    { args: { at: [16, 16], count: 5, style: 'dot', reach: 3, full: true, paints: P4 }, ctx: { t: 0.5, loop: false } },
  ],
  'blast.ball@1': [
    { args: { at: [24, 24], r: 12, bumps: 7, bump: 0.18, paints: P4 } },
    { args: { at: [24, 24], r: 14, hole: 8, gaps: 0.3, seed: 3, paints: ['p2', 'p3', 'p4'] } },
    { args: { at: [16.5, 16.5], r: 9, bumps: 6, bump: 0.3, points: true, turn: 20, heat: 0.8, paints: P5 } },
  ],
  'puff.ring@1': [
    { args: { at: [24, 24], count: 6, r0: 4, r1: 14, size: 4, paints: S3 }, ctx: { t: 0.3, loop: false } },
    { args: { at: [24, 26], count: 7, r0: 6, r1: 16, size: 5, hold: 0.2, rise: 4, lobes: 3, seed: 2, paints: S3 }, ctx: { t: 0.6, loop: false } },
    { args: { at: [24, 24], count: 5, r0: 3, r1: 12, size: 4, apart: true, turn: 30, paints: S3 }, ctx: { t: 0.15, loop: false } },
  ],
  'bolt@1': [
    { args: { at: [16, 2], length: 40, angle: 0, paints: P4 } },
    { args: { at: [20, 3], length: 50, angle: -10, zigzag: 4, sway: 5, width: 3, forks: 2, seed: 3, paints: P5 } },
    { args: { at: [6, 20], length: 36, angle: 80, width: 2, lead: 0.7, fade: 0.2, taper: 0.6, seed: 1, paints: P4 } },
  ],
  'swirl@1': [
    { args: { at: [24, 24], count: 8, r0: 15, r1: 1, paints: P4 }, ctx: { t: 0.4, loop: false } },
    { args: { at: [24, 24], count: 10, loop: true, r0: 6, r1: 18, turns: -0.6, squash: 0.6, size: 1, tail: 3, seed: 2, paints: P5 }, ctx: { t: 0.7, loop: true } },
    { args: { at: [16, 16], count: 6, r0: 12, r1: 2, tail: 0, paints: ['p1', 'p3'] }, ctx: { t: 0.9, loop: false } },
  ],
  'motes@1': [
    { args: { at: [24, 40], count: 6, rise: 30, paints: ['m', 'p1', 'p3', 'p4'] }, ctx: { t: 0.3, loop: true } },
    { args: { at: [24, 44], count: 5, loop: false, rise: 28, width: 18, size: 9, shape: 'star', seed: 2, paints: P4 }, ctx: { t: 0.6, loop: false } },
    { args: { at: [16, 28], count: 4, rise: 18, size: 5, shape: 'heart', sway: 2, paints: ['p2', 'p4'] }, ctx: { t: 0.8, loop: true } },
  ],
  'fall.field@1': [
    { args: { at: [1, 1], cols: 8, rows: 2, shape: 'streak', size: 3, paints: ['s0'] }, ctx: { t: 0.3, size: [64, 64] } },
    { args: { at: [1, 1], cols: 6, rows: 3, laps: 2, slant: 'right', sway: 2, shape: 'leaf', size: 4, paints: ['g0', 'g1'], seed: 3 }, ctx: { t: 0.6, size: [64, 64] } },
    { args: { at: [1, 1], cols: 10, rows: 2, axis: 'right', shape: 'grain', size: 3, alt: 'ash', altSize: 3, paints: ['g1', 's1'], core: 'p3', coreEvery: 2, shift: [5, 7] }, ctx: { t: 0.1, size: [64, 64] } },
  ],
  'trail.puffs@1': [
    { args: { at: [20, 16], count: 3, paints: S3.slice(0, 2) }, ctx: { t: 0.25, loop: true } },
    { args: { at: [24, 16], count: 4, angle: -80, dist: 12, size: 6, spread: 1.2, seed: 4, paints: ['s0', 's2'] }, ctx: { t: 0.6, loop: true } },
    { args: { at: [16, 20], count: 2, angle: 180, dist: 8, size: 3, cycles: 2, paints: ['s1'] }, ctx: { t: 0.1, loop: true } },
  ],
  'mist@1': [
    { args: { at: [6, 40], width: 36, count: 5, paints: S3 }, ctx: { t: 0.3, loop: true, size: [64, 56] } },
    { args: { at: [4, 44], width: 40, count: 6, dist: 10, rise: 3, lift: 4, size: 5, shape: 'wispy', floor: 46, seed: 2, paints: S3 }, ctx: { t: 0.7, loop: true, size: [64, 56] } },
    { args: { at: [6, 36], width: 30, count: 4, size: 4, shape: 'chunky', lobes: 3, stretch: 1, paints: S3 }, ctx: { t: 0.5, loop: true, size: [64, 56] } },
  ],
  'ripples@1': [
    { args: { at: [17, 17], paint: 'w' }, ctx: { t: 0.3, size: [34, 34] } },
    { args: { at: [17, 17], count: 7, length: 8, stir: 3, seed: 2, paint: 'w', dark: 's2', tips: 'p3' }, ctx: { t: 0.6, size: [34, 34] } },
    { args: { at: [20.5, 18], count: 4, length: 5, margin: 2, under: false, seed: 5, paint: 'p1' }, ctx: { t: 0.9, size: [40, 36] } },
  ],
};

const KEYS = Object.keys(CASES);

test('B12c registers its 20 behaviours in the site registry, family fx', () => {
  assert.equal(KEYS.length, 20);
  const fam = Object.fromEntries(registry.generators().map((g) => [g.key, g.family]));
  for (const key of KEYS) assert.equal(fam[key], 'fx', key);
});

test('each B12c behaviour works in frame pixels by design and says so (FRAME_GENERATORS), and has a stamp bound and its size keys', () => {
  for (const key of KEYS) {
    assert.ok(Object.hasOwn(registry.FRAME_GENERATORS, key), `${key}: FRAME_GENERATORS`);
    assert.equal(typeof registry.STAMP_BOUNDS[key], 'function', `${key}: STAMP_BOUNDS`);
    assert.ok(Array.isArray(registry.SIZE_KEYS[key]), `${key}: SIZE_KEYS`);
  }
});

test('every B12c golden case draws something (a golden of nothing pins nothing; review B12c: mist\'s three were empty)', () => {
  for (const key of KEYS) {
    const [id, v] = key.split('@');
    CASES[key].forEach((c, i) => {
      const r = registry.runGenerator({ gen: id, v: Number(v), ...c.args }, c.ctx ?? {});   // as the harness runs it
      assert.ok(r.ok && r.primitives.length > 0, `${key} case ${i}: draws nothing (${r.errors.join('; ')})`);
    });
  }
});

for (const key of KEYS) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases: CASES[key] });
  });
}

// ---- the ports draw what the code draws ----------------------------------------------------------------------------

/** The '#rrggbb' of a paint ref: a slot, a slot tone (engine/color.js ramp) or a colour rule (engine/data-rules.js). */
function hexOf(ref) {
  if (typeof ref === 'string') { const [s, t] = ref.split('.'); return t ? ramp(HEX[s])[t] : HEX[s]; }
  return paintColour(ref, HEX);
}
const hexes = (list) => list.map((p) => HEX[p]);

/** Draws a call's stamps and dots on a new Surface of `size`. */
function drawn(call, ctx, size) {
  const r = registry.runGenerator(call, { ...ctx, size });
  assert.ok(r.ok, r.errors.join('; '));
  const g = new Surface(size[0], size[1]);
  for (const p of r.primitives) {
    if (p.kind === 'dot') { g.dot(p.at[0], p.at[1], hexOf(p.paint)); continue; }
    assert.equal(p.kind, 'stamp');
    assert.ok(!p.anchor || p.anchor === 'tl');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') g.dot(p.at[0] + i, p.at[1] + j, hexOf(p.key[ch])); }));
  }
  return g;
}

/** The code's picture: a new Surface of `size` that fn draws on. */
function code(size, fn) { const g = new Surface(size[0], size[1]); fn(g); return g; }

let compared = 0;
function same(mine, theirs, what) {
  let off = 0;
  for (let i = 0; i < mine.data.length; i++) if (mine.data[i] !== theirs.data[i]) off++;
  assert.equal(off, 0, `${what}: ${off} pixels differ from the code`);
  compared++;
  return theirs.data.some((v) => v >>> 24);
}
/** Compares at every t; at least one picture must have something in it. */
function sameOverTime(ts, mk, what) {
  let any = false;
  for (const t of ts) { const [m, c] = mk(t); any = same(m, c, `${what} t ${t}`) || any; }
  assert.ok(any, `${what}: draws something`);
}
const TS = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];

test('twinkle@2 draws what engine/fx.js twinkle draws, kept inside the frame\'s border', () => {
  const size = [24, 24];
  for (const [at, s] of [[[12, 12], 2], [[1, 1], 3], [[22, 5], 4], [[6.6, 9.2], 0], [[0, 12], 1]]) {
    same(drawn({ gen: 'twinkle', v: 2, at, size: s, paint: 'p3', core: 'w' }, {}, size), code(size, (g) => FX.twinkle(g, at[0], at[1], s, HEX.p3, { core: HEX.w })), `twinkle ${at} ${s}`);
  }
});

test('scorch@1 draws what engine/fx.js scorch draws; its embers flicker by the frame', () => {
  const size = [40, 32];
  for (const o of [{ at: [20.5, 20], r: [14, 6], paint: 'b', paints: P5 }, { at: [20.5, 20], r: [14, 6], spread: 0.3, heat: 0.9, embers: 8, seed: 2, paint: 'b', paints: P5 }, { at: [12, 12], r: [9, 4], hole: 0, gaps: 0.4, start: 0.2, spread: 0.5, heat: 0.3, paint: 'b', paints: P4 }]) {
    for (const frame of [0, 1, 2, 5]) {
      same(drawn({ gen: 'scorch', v: 1, ...o }, { frame }, size), code(size, (g) => FX.scorch(g, { x: o.at[0], y: o.at[1], rx: o.r[0], ry: o.r[1], t: o.spread ?? 1, start: o.start ?? 0.55, hole: o.hole ?? 0.45, gaps: o.gaps ?? 0.18, colour: HEX[o.paint], embers: o.embers ?? 4, heat: o.heat ?? 0, colours: hexes(o.paints), flicker: frame, seed: o.seed ?? 0 })), `scorch frame ${frame} ${JSON.stringify(o).slice(0, 50)}`);
    }
  }
});

/** The tongue list flame@1 draws for its fan arguments (the same rule, for engine/fx.js flame). */
function fanTongues({ angle = 180, length = 12, width = 4, sway = 1.5, tongues = 1, fan = 30, spread = 0, shorten = 0.3, slim = 0.4 }) {
  const a = angle * RAD, ux = Math.sin(a), uy = Math.cos(a), list = [{ angle: a, length, width, sway, phase: 0, at: [0, 0] }];
  const ranks = Math.ceil((tongues - 1) / 2);
  for (let i = 1; i < tongues; i++) {
    const s = i % 2 ? 1 : -1, u = Math.ceil(i / 2) / ranks;
    list.push({ angle: (angle - s * fan * u) * RAD, length: length * (1 - shorten * u), width: width * (1 - slim * u), sway: sway * 0.6, phase: 0.37 * i, at: [-uy * s * spread * u, ux * s * spread * u] });
  }
  return list;
}

test('ripples@1 draws the marks engine/ripples.js rippleVersion lays on its 32 x 32 tile', () => {
  const size = [34, 34];
  for (const o of [{ paint: 'w' }, { count: 7, length: 8, stir: 3, seed: 2, paint: 'w', dark: 's2', tips: 'p3' }, { count: 9, length: 12, margin: 0, under: false, seed: 5, paint: 'p1' }]) {
    sameOverTime([0, 0.2, 0.5, 0.8], (t) => {
      const fill = rippleVersion('#000001', t, { seed: o.seed ?? 0, light: HEX[o.paint], dark: o.dark ? HEX[o.dark] : null, count: o.count ?? 5, length: o.length ?? 6, stir: o.stir ?? 2, margin: o.margin ?? 3, tips: o.tips ? HEX[o.tips] : null, under: o.under ?? true });
      return [drawn({ gen: 'ripples', v: 1, at: [17, 17], ...o }, { t, loop: true }, size), code(size, (g) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const c = fill(x, y); if (c !== col('#000001')) g.data[(y + 1) * 34 + x + 1] = c; } })];
    }, `ripples ${o.seed}`);
  }
});
