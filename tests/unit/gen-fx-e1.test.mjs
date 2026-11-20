// The effect behaviours build item E1 adds (docs/data-sprites.md section 9; 2.5c, 3.3 "fx"), for the redraws of the
// library's hits, blasts and spells as data (engine/gen/fx-e1.js): new versions of B12c behaviours whose keys follow a
// Size slider (a `scale` key, as glow@1 has) and cool through their paints, and ports of the engine helpers those
// effects drew with that no generator had yet. Each is pinned by the goldens harness and held to what it stands for:
// a new version equals its old one where they overlap, a port draws pixel for pixel what its helper drew on a Surface.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-fx-e1.test.mjs (writes only files that do not exist).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { STAMP_BOUNDS, SIZE_KEYS, FRAME_GENERATORS } from '../../engine/gen/index.js';
import { stampPixels } from '../../engine/gen/args.js';
import { Surface } from '../../engine/surface.js';
import * as SPELLS from '../../engine/spells.js';
import { spikesIn } from '../../engine/blast.js';
import * as FLOOR from '../../engine/fx-floor.js';
import { ellipseIn } from '../../engine/surface.js';

const HEX = { p0: '#ffffff', p1: '#f0ead8', p2: '#f1c584', p3: '#f2a030', p4: '#8a5410' };
const P5 = ['p0', 'p1', 'p2', 'p3', 'p4'];
const P4 = ['p1', 'p2', 'p3', 'p4'];
const run = (call, ctx = {}) => {
  const r = registry.runGenerator(call, { size: [64, 64], t: 0, frame: 0, frames: 8, loop: false, ...ctx });
  assert.ok(r.ok, r.errors.join('; '));
  return r.primitives;
};

/** The behaviours E1 adds, each with its golden cases ({ args, ctx? }), at least three. */
const CASES = {
  'blast.grow@1': [
    { args: { at: [24, 24], r: 12, paints: P5 } },
    { args: { at: [24, 24], r: 14, scale: 0.7, hole: 0.4, bumps: 8, bump: 0.4, points: true, turn: 40, cool: 1, heat: 0.7, paints: P5 } },
    { args: { at: [20.5, 22], r: 10, scale: 1, hole: 0.8, gaps: 0.3, seed: 2, cool: 3, paints: P5 } },
  ],
  'beam.lift@1': [
    { args: { at: [32, 60], width: 9, height: 40, paints: P5 } },
    { args: { at: [32.5, 60], width: 12, height: 50, across: 0.5, scale: 0.8, lift: 0.3, reach: 0.9, solid: 0.2, phase: 1.5, seed: 6, paints: P4 } },
    { args: { at: [20, 40], width: 6, height: 30, gap: 3, cycles: 1, paints: P4 }, ctx: { t: 0.25, loop: true } },
  ],
  'flame.grow@1': [
    { args: { at: [32, 60], length: 30, width: 5, tongues: 5, spread: 9, fan: 4, shorten: 0.34, slim: 0, paints: P4 }, ctx: { t: 0.3 } },
    { args: { at: [32, 40], head: 5, length: 16, width: 4, tall: 0.6, wide: 1.2, sway: 2, cycles: 3, heat: 0.55, tongues: 3, fan: 40, spread: 3, paints: P4 }, ctx: { t: 0.5 } },
    { args: { at: [24, 30], length: 12, width: 3, tall: 1.5, wide: 0.5, paints: P5 }, ctx: { t: 0.25, loop: true } },
  ],
  'crescent@1': [
    { args: { at: [32, 32], length: 50, angle: -40, bulge: 12, width: 8, paints: P4 } },
    { args: { at: [30, 22], length: 46, angle: 66, bulge: 9, flip: true, width: 10, start: 0.22, thin: 0.72, jag: 2.4, teeth: 9, seed: 3, cool: 1, paints: P5 } },
    { args: { at: [32, 32], length: 54, angle: 140, bulge: 14, width: 5, claws: 3, gap: 7, head: 0.5, end: 0.6, paints: ['p3', 'p4'] } },
  ],
  'spike.fan@1': [
    { args: { at: [8.5, 15.5], count: 3, angle: 90, arc: 180, length: 16, short: 0.68, width: 5.5, disc: 3.2, paints: ['p1', 'p3'] } },
    { args: { at: [8.5, 15.5], count: 5, angle: 90, arc: 92, length: 18, grow: 1.1, from: 0.28, short: 1, width: 6, thin: 0.55, belly: 0.74, disc: 1.8, cool: 1, paints: P5 } },
    { args: { at: [16, 16], count: 1, angle: 45, arc: 0, length: 12, width: 0.4, hair: false, rim: 7, paints: ['p0'] } },
  ],
  'bolt.grow@1': [
    { args: { at: [38, 2], length: 87, angle: -4, kinks: 6, zigzag: 3, sway: 7, width: 5, forks: 3, forkLength: 0.28, forkAngle: 52, seed: 3, paints: P5 } },
    { args: { at: [38, 2], length: 87, angle: -4, width: 5, thin: 0.68, forks: 3, forkLength: 0.17, cool: 2, seed: 3, paints: P5 } },
    { args: { at: [32, 2], length: 60, width: 3, thin: 0.2, lead: 0.9, fade: 0.1, cool: 3, paints: P5 } },
  ],
  'floor.ring@1': [
    { args: { at: [24, 24], r: 14, squash: 0.66, paints: P4 } },
    { args: { at: [24, 24], r: 14, scale: 1.2, squash: 0.66, thick: 3, sides: 6, turn: 30, gaps: 5, open: 0.4, phase: 70, heat: 0.5, paints: P4 } },
    { args: { at: [24, 24], r: 1, squash: 0.66, rim: false, paints: ['p2', 'p3'] } },
  ],
  'rift@1': [
    { args: { at: [24, 20], length: 21, across: 9, seed: 2, paints: ['p1', 'p3', 'p4'] } },
    { args: { at: [24, 20], length: 21, across: 9, scale: 0.6, open: 0.5, angle: 60, teeth: 4, jag: 0.7, cool: 1, seed: 3, paints: P4 } },
    { args: { at: [24, 20], length: 18, across: 6, rim: false, paints: ['p3', 'p4'] } },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    const entry = registry.generator(id, Number(v));
    assert.ok(entry, `${key} is registered`);
    checkGeneratorContract(registry, entry, { cases });
  });
  test(`${key} is an fx behaviour with a stamp bound, size keys and a frame-pixels reason`, () => {
    const [id, v] = key.split('@');
    const entry = registry.generator(id, Number(v));
    assert.equal(entry.family, 'fx');
    assert.equal(typeof STAMP_BOUNDS[key], 'function');
    assert.ok(Array.isArray(SIZE_KEYS[key]));
    assert.equal(typeof FRAME_GENERATORS[key], 'string');
  });
}

test('blast.grow@1 at scale 1, no hole and no cooling draws what blast.ball@1 draws', () => {
  for (const extra of [{}, { bumps: 8, bump: 0.42, points: true, turn: 80, heat: 0.7 }, { r: 6, heat: 0.2, seed: 3 }]) {
    const a = { at: [24, 24], r: 11, paints: P4, ...extra };
    assert.deepEqual(run({ gen: 'blast.grow', v: 1, ...a }), run({ gen: 'blast.ball', v: 1, ...a }));
  }
});

test('blast.grow@1: scale, hole and cool are blast.ball@1 at r times scale, a hole that share of it, and the hottest paints dropped', () => {
  const a = { at: [24, 24], r: 14, bumps: 7, bump: 0.17, turn: 40, heat: 0.5, gaps: 0.3, seed: 2 };
  assert.deepEqual(run({ gen: 'blast.grow', v: 1, ...a, scale: 0.75, hole: 0.5, cool: 2, paints: P5 }),
    run({ gen: 'blast.ball', v: 1, ...a, r: 14 * 0.75, hole: 14 * 0.75 * 0.5, paints: P5.slice(2) }));
  // cooling past the rim keeps the rim
  assert.deepEqual(run({ gen: 'blast.grow', v: 1, ...a, cool: 7, paints: P5 }), run({ gen: 'blast.ball', v: 1, ...a, paints: ['p4'] }));
  // its keys follow a Size slider: the scale, the hole and the cooling are keyable, the scale is priced (a size key)
  const g = registry.generator('blast.grow', 1);
  for (const k of ['scale', 'hole', 'cool', 'turn', 'heat', 'gaps']) assert.ok(g.keyable.includes(k), k);
  assert.deepEqual([...SIZE_KEYS['blast.grow@1']].sort(), ['r', 'scale']);
});

test('beam.lift@1 at full size with its foot on the row draws what beam@1 draws', () => {
  for (const extra of [{}, { solid: 0.2, phase: 1.5, seed: 6, gap: 3 }, { width: 5, height: 22, dash: 3 }]) {
    const a = { at: [32, 58], width: 10, height: 36, paints: P5, ...extra };
    assert.deepEqual(run({ gen: 'beam.lift', v: 1, ...a }), run({ gen: 'beam', v: 1, ...a }));
  }
});

test('beam.lift@1: across and scale size it, lift raises its foot and reach lowers its top, as beam@1 drawn so', () => {
  const a = { width: 12, height: 40, seed: 6, solid: 0.5, paints: P5 };
  assert.deepEqual(run({ gen: 'beam.lift', v: 1, at: [32, 60], ...a, across: 0.5, scale: 0.75, lift: 0.2, reach: 0.9 }),
    run({ gen: 'beam', v: 1, ...a, at: [32, 60 - 6], width: 6, height: 27 - 6 }));
  assert.deepEqual(run({ gen: 'beam.lift', v: 1, at: [32, 60], ...a, lift: 0.6, reach: 0.6 }), []);
  assert.deepEqual([...SIZE_KEYS['beam.lift@1']].sort(), ['across', 'height', 'scale']);
});

test('flame.grow@1 at tall 1 and wide 1 draws what flame@1 draws; otherwise flame@1 at the scaled length, width, spread and head', () => {
  const a = { at: [32, 58], head: 3, length: 26, width: 4, sway: 1.3, cycles: 3, heat: 0.6, tongues: 5, fan: 10, spread: 8, paints: P4 };
  for (const t of [0, 0.4, 0.9]) {
    assert.deepEqual(run({ gen: 'flame.grow', v: 1, ...a }, { t }), run({ gen: 'flame', v: 1, ...a }, { t }));
    assert.deepEqual(run({ gen: 'flame.grow', v: 1, ...a, tall: 0.5, wide: 1.5 }, { t }),
      run({ gen: 'flame', v: 1, ...a, length: 13, width: 6, spread: 12, head: 4.5 }, { t }));
  }
  assert.deepEqual([...SIZE_KEYS['flame.grow@1']].sort(), ['head', 'length', 'spread', 'sway', 'tall', 'wide', 'width']);
});

/** Draws a call's stamps on a new Surface of `size`, each paint its colour in HEX. */
function drawn(call, size) {
  const g = new Surface(size[0], size[1]);
  for (const p of run(call, { size })) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') g.dot(p.at[0] + i, p.at[1] + j, HEX[p.key[ch]]); }));
  }
  return g;
}
const offBy = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);

test('crescent@1 draws what engine/spells.js crescent draws: its ends through at along angle, start and end its from and to, width x thin, cooled paints, each claw another crescent', () => {
  const size = [64, 64];
  const cases = [
    { at: [32, 32], length: 50, angle: -40, bulge: 12, width: 8, paints: P4 },
    { at: [30, 22], length: 46, angle: 66, bulge: 9, flip: true, width: 10, start: 0.22, thin: 0.72, jag: 2.4, teeth: 9, seed: 3, paints: P5 },
    { at: [32, 32], length: 52, angle: 0, bulge: 20, width: 5, head: 0.5, end: 0.6, paints: ['p3', 'p4'] },
    { at: [32, 32], length: 60, angle: 220, bulge: 0.2, width: 11.5, start: 0.5, end: 1, thin: 0.45, cool: 2, paints: P5 },
    { at: [32, 32], length: 54, angle: 140, bulge: 14, width: 6, claws: 3, gap: 7, paints: P4 },
    // every claw count it takes (review E1, issue 8: only 1 and 3 were held)
    { at: [32, 32], length: 50, angle: 140, bulge: 12, width: 5, claws: 2, gap: 6, paints: P4 },
    { at: [32, 32], length: 44, angle: 150, bulge: 10, width: 4, claws: 4, gap: 5, paints: P4 },
    { at: [32, 32], length: 40, angle: 130, bulge: 9, width: 4, claws: 5, gap: 4, seed: 2, jag: 1, paints: P5 },
  ];
  // the strokes a claw mark draws, written out for each count: [sideways offset, share of the length, share of the width], the middle one last
  const CLAWS = {
    1: () => [[0, 1, 1]],
    2: (gp) => [[-gp, 1 - 0.17, 0.87], [0, 1, 1]],
    3: (gp) => [[-gp, 1 - 0.17, 0.87], [gp, 1 - 0.17, 0.87], [0, 1, 1]],
    4: (gp) => [[-gp, 1 - 0.17, 0.87], [gp, 1 - 0.17, 0.87], [-2 * gp, 1 - 0.17 * 2, 0.87], [0, 1, 1]],
    5: (gp) => [[-gp, 1 - 0.17, 0.87], [gp, 1 - 0.17, 0.87], [-2 * gp, 1 - 0.17 * 2, 0.87], [2 * gp, 1 - 0.17 * 2, 0.87], [0, 1, 1]],
  };
  let lit = 0;
  for (const o of cases) {
    const mine = drawn({ gen: 'crescent', v: 1, ...o }, size);
    const theirs = new Surface(64, 64);
    const C = o.paints.slice(Math.min(o.paints.length - 1, o.cool ?? 0)).map((p) => HEX[p]);
    const A = (o.angle * Math.PI) / 180, ux = Math.sin(A), uy = Math.cos(A);
    const strokes = CLAWS[o.claws ?? 1](o.gap);
    for (const [off, len, wide] of strokes) {
      const cx = o.at[0] - uy * off, cy = o.at[1] + ux * off, h = (o.length * len) / 2;
      SPELLS.crescent(theirs, { x0: cx - ux * h, y0: cy - uy * h, x1: cx + ux * h, y1: cy + uy * h, bulge: o.flip ? -o.bulge : o.bulge, width: o.width * wide * (o.thin ?? 1), from: o.start ?? 0, to: o.end ?? 1,
        head: o.head ?? 0.65, jag: o.jag ?? 0, teeth: o.teeth ?? 7, seed: o.seed ?? 0, colours: C });
    }
    assert.equal(offBy(mine, theirs), 0, JSON.stringify(o));
    if (theirs.data.some((v) => v >>> 24)) lit++;
  }
  assert.equal(lit, cases.length);
});

test('crescent@1 stays within its stamp bound at any length, width, bow, jag and claws, and its keys do not change its price', () => {
  const size = [640, 360];
  for (const [bulge, flip] of [[60, true], [0.3, true], [0.6, false], [8, false], [40, true], [160, false]]) for (const width of [0, 6, 32]) for (const jag of [0, 8]) for (const length of [3, 40, 300]) for (const claws of [1, 4]) {
    const a = { gen: 'crescent', v: 1, at: [320, 180], length, angle: 37, bulge, flip, width, jag, teeth: 32, claws, gap: 9, paints: P5 };
    const filled = { ...a, thin: 1, start: 0, end: 1, head: 0.65, cool: 0, seed: 0 };
    const bound = STAMP_BOUNDS['crescent@1'](filled, size);
    for (const keys of [{}, { head: 0.2 }, { head: 0.9 }, { start: 0.3, end: 0.7 }]) {
      const px = stampPixels(registry.runGenerator({ ...a, ...keys }, { size }).primitives);
      assert.ok(px <= bound, `${JSON.stringify({ bulge, width, jag, length, claws, ...keys })}: ${px} > ${bound}`);
    }
    for (const k of [{ thin: 0 }, { start: 1 }, { end: 0 }, { cool: 7 }]) assert.equal(STAMP_BOUNDS['crescent@1']({ ...filled, ...k }, size), bound);
  }
});

test('spike.fan@1 draws what engine/blast.js spikesIn and a disc draw as one blob, outlined in the paint rim steps cooler', () => {
  const size = [32, 32];
  const clip = (px, py) => px >= 1 && py >= 1 && px < 31 && py < 31;
  const cases = [
    { at: [8.5, 15.5], count: 3, angle: 90, arc: 180, length: 16, short: 0.68, width: 5.5, disc: 3.2, paints: ['p1', 'p3'] },
    { at: [8.5, 15.5], count: 5, angle: 90, arc: 92, length: 18, grow: 1.1, from: 0.28, short: 1, width: 6, thin: 0.55, belly: 0.74, disc: 1.8, cool: 1, paints: P5 },
    { at: [8.5, 15.5], count: 3, angle: 90, arc: 40, length: 20, width: 4, hair: false, rim: 7, paints: ['p0'] },
    { at: [16, 16], count: 1, angle: 45, arc: 0, length: 12, width: 0.4, paints: ['p3', 'p4'] },
  ];
  for (const o of cases) {
    const mine = drawn({ gen: 'spike.fan', v: 1, ...o }, size);
    const theirs = new Surface(32, 32);
    const C = o.paints.slice(Math.min(o.paints.length - 1, o.cool ?? 0)), rim = C[o.rim ?? 1];
    const r1 = o.length * (o.grow ?? 1), r0 = r1 * (o.from ?? 0);
    const fan = spikesIn(o.at[0], o.at[1], { count: o.count, angle: (o.angle * Math.PI) / 180, arc: (o.arc * Math.PI) / 180, r0, r1, short: o.short ?? 0.6, width: o.width * (o.thin ?? 1), belly: o.belly ?? 0.3, hair: o.hair ?? true });
    theirs.blob([fan, ...(o.disc ? [ellipseIn(o.at[0], o.at[1], o.disc, o.disc)] : [])], HEX[C[0]], { shade: 0, clip, ...(rim ? { outline: HEX[rim] } : {}) });
    assert.equal(offBy(mine, theirs), 0, JSON.stringify(o));
    assert.ok(theirs.data.some((v) => v >>> 24));
  }
});

test('bolt.grow@1 draws what bolt@1 draws at width x thin with its hottest paints cooled away', () => {
  const a = { at: [38, 2], length: 87, angle: -4, kinks: 6, zigzag: 3, sway: 7, forks: 3, forkAngle: 52, seed: 3 };
  const size = { size: [64, 96] };
  assert.deepEqual(run({ gen: 'bolt.grow', v: 1, ...a, width: 5, forkLength: 0.28, paints: P5 }, size), run({ gen: 'bolt', v: 1, ...a, width: 5, forkLength: 0.28, paints: P5 }, size));
  assert.deepEqual(run({ gen: 'bolt.grow', v: 1, ...a, width: 5, thin: 0.36, forkLength: 0.1, cool: 2, lead: 0.8, paints: P5 }, size),
    run({ gen: 'bolt', v: 1, ...a, width: 1.8, forkLength: 0.1, lead: 0.8, paints: P5.slice(2) }, size));
  assert.deepEqual(run({ gen: 'bolt.grow', v: 1, ...a, width: 5, thin: 0, paints: P5 }, size), run({ gen: 'bolt', v: 1, ...a, width: 1, paints: P5 }, size));
});

test('floor.ring@1 draws what engine/fx-floor.js floorRing draws (r x scale; degrees for its turn and phase)', () => {
  const size = [48, 48];
  const cases = [
    { at: [24, 24], r: 14, squash: 0.66, paints: P4 },
    { at: [24, 24], r: 14, scale: 1.2, squash: 0.66, thick: 3, sides: 6, turn: 30, gaps: 5, open: 0.4, phase: 70, heat: 0.5, paints: P4 },
    { at: [24, 24], r: 1, squash: 0.66, rim: false, paints: ['p2', 'p3'] },
    { at: [24, 24], r: 20, squash: 0.5, thick: 1, gaps: 8, open: 0.68, heat: 0.2, paints: ['p3', 'p3'] },
  ];
  for (const o of cases) {
    const mine = drawn({ gen: 'floor.ring', v: 1, ...o }, size);
    const theirs = new Surface(48, 48);
    FLOOR.floorRing(theirs, { x: o.at[0], y: o.at[1], r: o.r * (o.scale ?? 1), squash: o.squash, thick: o.thick ?? 2, sides: o.sides ?? 0, turn: ((o.turn ?? 0) * Math.PI) / 180,
      gaps: o.gaps ?? 0, open: o.open ?? 0.3, phase: ((o.phase ?? 0) * Math.PI) / 180, heat: o.heat ?? 1, rim: o.rim, colours: o.paints.map((p) => HEX[p]) });
    assert.equal(offBy(mine, theirs), 0, JSON.stringify(o));
    assert.ok(theirs.data.some((v) => v >>> 24));
  }
});

test('rift@1 draws what engine/fx-floor.js riftIn painted with lightShape draws (its heart the first of three paints)', () => {
  const size = [48, 48];
  const cases = [
    { at: [24, 20], length: 21, across: 9, seed: 2, paints: ['p1', 'p3', 'p4'] },
    { at: [24, 20], length: 21, across: 9, scale: 0.6, open: 0.5, angle: 60, teeth: 4, jag: 0.7, seed: 3, paints: ['p3', 'p4'] },
    { at: [24, 20], length: 18, across: 6, rim: false, paints: ['p3', 'p4'] },
  ];
  for (const o of cases) {
    const mine = drawn({ gen: 'rift', v: 1, ...o }, size);
    const theirs = new Surface(48, 48);
    const s = o.scale ?? 1, C = o.paints.map((p) => HEX[p]);
    const tear = FLOOR.riftIn(o.at[0], o.at[1], o.length * s, o.across * s, { seed: o.seed ?? 0, teeth: o.teeth ?? 3, jag: o.jag ?? 0.5, open: o.open ?? 1, angle: ((o.angle ?? 90) * Math.PI) / 180 });
    FLOOR.lightShape(theirs, tear, { colours: C.length >= 3 ? C.slice(1) : C, heart: C.length >= 3 ? C[0] : null, rim: o.rim });
    assert.equal(offBy(mine, theirs), 0, JSON.stringify(o));
    assert.ok(theirs.data.some((v) => v >>> 24));
  }
});
