// The effect behaviours build item B12 adds (docs/data-sprites.md section 9, row B12; 2.5c; 3.3 "fx"): ports of
// engine/fx.js (particles, starburst, glow, ring, streaks, puffs) and of the blaster bolt's bar of light (engine/shots.js
// lightShape on sprites/blaster-bolt.js's three shapes) that RETURN PRIMITIVES (stamps) instead of drawing. Each is
// pinned by the goldens harness (tests/helpers/gen-harness.mjs: pinned output, determinism, no clock or dice, fuzz,
// cost, loop closure) and checked pixel for pixel against the code it replaces, drawn on a Surface with the same colours.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-b12-fx.test.mjs (writes only files that do not exist).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract, paintSimple } from '../helpers/gen-harness.mjs';
import { Surface } from '../../engine/surface.js';
import * as FX from '../../engine/fx.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { steps } from '../../engine/fx.js';
import boltCode from '../../sprites/blaster-bolt.js';

const RAD = Math.PI / 180;
const P5 = ['p0', 'p1', 'p2', 'p3', 'p4'];
const HEX = { p0: '#ffffff', p1: '#f0ead8', p2: '#f1c584', p3: '#f2a030', p4: '#8a5410', s0: '#c2c9d6', s1: '#9aa6c0', s2: '#6b7896' };

const CASES = {
  'particles@1': [
    { args: { at: [16, 16], count: 8, seed: 2, loop: false, arc: 360, dist: 10, size: 2, paints: ['p0', 'p1', 'p2'] }, ctx: { t: 0.25, loop: false, frames: 5, frame: 1 } },
    { args: { at: [24, 40], count: 10, seed: 3, angle: 180, arc: 60, dist: 14, gravity: -4, size: 3, spread: 2, wobble: 1.5, lifespan: 0.7, paints: P5 }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3 } },
    { args: { at: [23.5, 23.5], count: 6, seed: 5, loop: false, stagger: 0.15, arc: 360, dist: 18, size: 3.6, paints: ['p1', 'p2', 'p3', 'p3', 'p4'] }, ctx: { t: 0.5, loop: false, frames: 8, frame: 4 } },
    { args: { at: [16, 16], count: 4, seed: 9, loop: false, arc: 360, dist: 8, size: 6, begin: 0.2, end: 0.8, paints: P5 }, ctx: { t: 0.4, loop: false, frames: 6, frame: 2 } },
  ],
  'starburst@1': [
    { args: { at: [15.5, 15.5], points: 6, r: [0, 9.5], width: 5.3, paints: ['p1', 'p3'] } },
    { args: { at: [16, 16], points: 4, r: [3, 9], paints: ['p0'] } },
    { args: { at: [23.5, 23.5], points: 8, r: [0, 8], push: 6, short: 3, width: 0.4, turn: 197.2, paints: ['p2'] } },
    { args: { at: [17.5, 7.5], points: 4, r: [2.5, 5.2], width: 1.7, turn: 45, cut: 1, paints: ['p1', 'p3'] } },
    // B12b: twist (a share of half the spacing) and cooling through a list with the rim two steps cooler
    { args: { at: [15.5, 15.5], points: 5, r: [2, 11], width: 2.5, twist: 0.6, paints: ['p1', 'p2', 'p3', 'p4'], rim: 2, cool: 1 } },
  ],
  'glow@1': [
    { args: { at: [23.5, 23.5], r: 10.3, paints: ['p0', 'p0', 'p1', 'p3'] } },
    { args: { at: [16, 16], r: 4, paints: ['p2', 'p4'] } },
    { args: { at: [12.5, 20], r: 7, paints: P5 } },
  ],
  'ring@1': [
    { args: { at: [23.5, 23.5], r0: 8.3, r1: 16, thick: 3, seed: 2, paints: ['p1', 'p2', 'p3', 'p3', 'p4'] }, ctx: { t: 0.3, loop: false } },
    { args: { at: [23.5, 23.5], r0: 8.3, r1: 16, thick: 3, seed: 2, paints: ['p1', 'p2', 'p3', 'p3', 'p4'] }, ctx: { t: 0.8, loop: false } },
    { args: { at: [16, 20], r0: 2, r1: 12, thick: 2, squash: 0.5, seed: 4, paints: ['p1', 'p3', 'p4'], begin: 0.25 }, ctx: { t: 0.75, loop: false } },
    { args: { at: [17.5, 7.5], r0: 2, r1: 4.2, thick: 2, seed: 4, paints: ['p1', 'p3', 'p3', 'p4'] }, ctx: { t: 1, loop: false } },
  ],
  'streaks@1': [
    { args: { at: [9, 8], count: 2, seed: 3, angle: -90, length: 7, reach: 3, spread: 1.5, paints: ['p3', 'p3', 'p4'] }, ctx: { t: 0.25, loop: true, frames: 4, frame: 1 } },
    { args: { at: [16, 16], count: 3, paints: ['p0'] } },
    { args: { at: [24, 10], count: 5, seed: 7, cycles: 2, angle: 0, length: 4, reach: 10, spread: 6, paints: P5 }, ctx: { t: 0.6, loop: true } },
  ],
  'puffs@1': [
    { args: { at: [23.5, 24.5], count: 5, seed: 3, stagger: 0.3, angle: 180, arc: 360, dist: 9, rise: 3, size: 3.1, lobes: 2, paints: ['s0', 's1', 's2'] }, ctx: { t: 0.4, loop: false } },
    { args: { at: [16, 20], count: 4, seed: 1, loop: true, dist: 6, rise: 5, size: 3, shape: 'chunky', paints: ['s0', 's1', 's2'] }, ctx: { t: 0.5, loop: true } },
    { args: { at: [16, 24], count: 3, seed: 6, dist: 8, size: 2.5, shape: 'wispy', floor: 27, lobes: 3, paints: ['s0', 's1', 's2'] }, ctx: { t: 0.7, loop: false } },
  ],
  'shot.bar@1': [
    { args: { at: [16, 8], length: 16.5, thick: 4, paints: ['p1', 'p3', 'p4'] } },
    { args: { at: [16, 8], length: 16.5, thick: 4, style: 'pulse', beat: 1, flicker: 2, paints: ['p1', 'p3', 'p4'] } },
    { args: { at: [16, 8], length: 21, thick: 5.4, style: 'needle', beat: -1, flicker: 3, lead: 0, paints: ['p1', 'p3', 'p4'] } },
  ],
};

test('B12 registers its behaviours in the site registry, family fx, and the emitters layout, family layout', () => {
  const fam = Object.fromEntries(registry.generators().map((g) => [g.key, g.family]));
  for (const key of Object.keys(CASES)) assert.equal(fam[key], 'fx', key);
  assert.equal(fam['emitters@1'], 'layout');
});

test('each B12 behaviour works in frame pixels by design and says so (FRAME_GENERATORS)', () => {
  for (const key of Object.keys(CASES)) assert.ok(Object.hasOwn(registry.FRAME_GENERATORS, key), key);
});

for (const key of Object.keys(CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases: CASES[key] });
  });
}

// ---- the ports draw what engine/fx.js draws ------------------------------------------------------------------------

/** Draws a call's primitives (stamps and dots) on a new Surface with the HEX colours. */
function drawn(call, ctx, size) {
  const r = registry.runGenerator(call, { ...ctx, size });
  assert.ok(r.ok, r.errors.join('; '));
  return paintSimple(new Surface(size[0], size[1]), r.primitives, HEX);
}
const hexes = (list) => list.map((p) => HEX[p]);
function same(a, b, what) {
  let off = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) off++;
  assert.equal(off, 0, `${what}: ${off} pixels differ from engine/fx.js`);
  assert.ok(a.data.some((v) => v >>> 24), `${what}: draws something`);
}

test('particles@1 draws what engine/fx.js particles draws, one-shot and looping', () => {
  const size = [48, 48];
  for (const t of [0, 0.2, 0.5, 0.85, 1]) {
    for (const o of [
      { at: [23.5, 23.5], count: 8, seed: 5, loop: false, stagger: 0.15, angle: 180, arc: 360, dist: 18, size: 3.6, paints: ['p1', 'p2', 'p3', 'p3', 'p4'] },
      { at: [24, 40], count: 12, seed: 2, angle: 180, arc: 70, dist: 20, gravity: 5, size: 2, spread: 3, wobble: 2, lifespan: 0.8, paints: P5 },
      { at: [10, 10], count: 9, seed: 1, loop: false, angle: 90, arc: 40, dist: 60, size: 1, paints: ['p0', 'p3'] },
    ]) {
      const g = new Surface(...size);
      FX.particles(g, { t, x: o.at[0], y: o.at[1], count: o.count, seed: o.seed, loop: o.loop ?? true, stagger: o.stagger, angle: o.angle * RAD, arc: o.arc * RAD, dist: o.dist, gravity: o.gravity, size: o.size, spread: o.spread, wobble: o.wobble, lifespan: o.lifespan, colours: hexes(o.paints) });
      const loop = o.loop ?? true;
      if (!g.data.some((v) => v >>> 24)) continue;
      same(drawn({ gen: 'particles', v: 1, ...o }, { t, loop: loop && t < 1 }, size), g, `particles t ${t} ${JSON.stringify(o).slice(0, 60)}`);
    }
  }
});

test('starburst@1 draws what engine/fx.js starburst draws (push, cut and short move the radii)', () => {
  const size = [32, 32];
  for (const o of [
    { at: [15.5, 15.5], points: 6, r: [0, 9.5], width: 5.3, paints: ['p1', 'p3'] },
    { at: [15.5, 15.5], points: 5, r: [4, 11], width: 0.4, turn: 216, paints: ['p2'] },
    { at: [16, 16], points: 4, r: [3, 9], paints: ['p0'] },
  ]) {
    const g = new Surface(...size);
    FX.starburst(g, { x: o.at[0], y: o.at[1], count: o.points, r0: o.r[0], r1: o.r[1], width: o.width ?? 3, turn: (o.turn ?? 180) * RAD, colour: HEX[o.paints[0]], rim: o.paints[1] ? HEX[o.paints[1]] : null });
    same(drawn({ gen: 'starburst', v: 1, ...o }, {}, size), g, `starburst ${JSON.stringify(o)}`);
  }
  const g = new Surface(...size);
  FX.starburst(g, { x: 15.5, y: 15.5, count: 6, r0: 2 + 5 + 1, r1: 6 + 5 - 2, width: 1.5, turn: 180 * RAD, colour: HEX.p2 });
  same(drawn({ gen: 'starburst', v: 1, at: [15.5, 15.5], points: 6, r: [2, 6], push: 5, cut: 1, short: 2, width: 1.5, paints: ['p2'] }, {}, size), g, 'starburst pushed');
});

test('starburst@1: twist turns it by a share of half the spacing between spikes, and cool and rim walk a list of paints (B12b)', () => {
  const size = [32, 32];
  // sprites/hit-spark.js: turn = PI + twist * (PI / n), whatever n
  for (const n of [4, 5, 6, 7, 8]) for (const twist of [0.3, 1]) {
    const g = new Surface(...size);
    FX.starburst(g, { x: 15.5, y: 15.5, count: n, r0: 0, r1: 10, width: 3, turn: Math.PI + twist * (Math.PI / n), colour: HEX.p1, rim: HEX.p3 });
    same(drawn({ gen: 'starburst', v: 1, at: [15.5, 15.5], points: n, r: [0, 10], width: 3, twist, paints: ['p1', 'p3'] }, {}, size), g, `twist ${twist}, ${n} spikes`);
  }
  // paints hottest first; the spikes take paints[cool], their rim paints[cool + rim] or none past the end
  const list = ['p0', 'p1', 'p2', 'p3', 'p4'];
  for (const [cool, rim] of [[0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 1], [6, 1], [1.4, 3]]) {
    const c = Math.min(4, Math.round(cool));
    const g = new Surface(...size);
    FX.starburst(g, { x: 15.5, y: 15.5, count: 6, r0: 1, r1: 11, width: 2.5, turn: Math.PI, colour: HEX[list[c]], rim: list[c + rim] ? HEX[list[c + rim]] : null });
    same(drawn({ gen: 'starburst', v: 1, at: [15.5, 15.5], points: 6, r: [1, 11], width: 2.5, paints: list, cool, rim }, {}, size), g, `cool ${cool}, rim ${rim}`);
  }
  // the defaults keep the old meaning of paints: [spikes, rim]
  const g = new Surface(...size);
  FX.starburst(g, { x: 15.5, y: 15.5, count: 6, r0: 0, r1: 9, width: 4, turn: Math.PI, colour: HEX.p1, rim: HEX.p2 });
  same(drawn({ gen: 'starburst', v: 1, at: [15.5, 15.5], points: 6, r: [0, 9], width: 4, paints: ['p1', 'p2'] }, {}, size), g, 'paints [spikes, rim]');
});

test('glow@1 draws what engine/fx.js glow draws', () => {
  for (const [x, y, r, list] of [[23.5, 23.5, 10.3, ['p0', 'p0', 'p1', 'p3']], [16, 16, 4, ['p2', 'p4']], [5, 6, 9, P5], [16, 16, 0.5, ['p3']]]) {
    const g = new Surface(32, 32);
    FX.glow(g, x, y, r, hexes(list));
    same(drawn({ gen: 'glow', v: 1, at: [x, y], r, paints: list }, {}, [32, 32]), g, `glow ${r}`);
  }
});

test('ring@1 draws what engine/fx.js ring draws; begin and end start it later in the clip', () => {
  for (const t of [0, 0.3, 0.6, 0.8, 1]) {
    for (const o of [
      { at: [23.5, 23.5], r0: 8.3, r1: 16, thick: 3, seed: 2, paints: ['p1', 'p2', 'p3', 'p3', 'p4'] },
      { at: [16, 20], r0: 2, r1: 30, thick: 4, squash: 0.45, seed: 9, paints: ['p1', 'p3', 'p4'] },
    ]) {
      const g = new Surface(48, 48);
      FX.ring(g, { t, x: o.at[0], y: o.at[1], r0: o.r0, r1: o.r1, thick: o.thick, squash: o.squash ?? 1, seed: o.seed, colours: hexes(o.paints) });
      same(drawn({ gen: 'ring', v: 1, ...o }, { t, loop: false }, [48, 48]), g, `ring t ${t}`);
    }
  }
  // plasma-burst's after(0.1): the ring's own phase is (t - 0.1) / 0.9, and it is not there before 0.1
  const g = new Surface(48, 48);
  FX.ring(g, { t: (0.5 - 0.1) / 0.9, x: 23.5, y: 23.5, r0: 8, r1: 18, thick: 3, seed: 2, colours: hexes(P5) });
  same(drawn({ gen: 'ring', v: 1, at: [23.5, 23.5], r0: 8, r1: 18, thick: 3, seed: 2, paints: P5, begin: 0.1 }, { t: 0.5, loop: false }, [48, 48]), g, 'ring begin 0.1');
  const early = registry.runGenerator({ gen: 'ring', v: 1, at: [23.5, 23.5], r0: 8, r1: 18, paints: P5, begin: 0.1 }, { t: 0.05, size: [48, 48] });
  assert.deepEqual(early.primitives, [], 'nothing before it begins');
  const off = registry.runGenerator({ gen: 'ring', v: 1, at: [0.5, 16], r0: 2, r1: 8, paints: P5 }, { t: 0.5, size: [32, 32] });
  assert.ok(off.ok, 'a centre outside the frame\'s border draws nothing, where engine/fx.js threw');
  assert.deepEqual(off.primitives, []);
});

test('streaks@1 draws what engine/fx.js streaks draws', () => {
  for (const t of [0, 0.25, 0.5, 0.75]) {
    const g = new Surface(32, 16);
    FX.streaks(g, { t, x: 9, y: 8, count: 2, seed: 3, angle: -90 * RAD, length: 7, reach: 3, spread: 1.5, colours: hexes(['p3', 'p3', 'p4']) });
    same(drawn({ gen: 'streaks', v: 1, at: [9, 8], count: 2, seed: 3, angle: -90, length: 7, reach: 3, spread: 1.5, paints: ['p3', 'p3', 'p4'] }, { t, loop: true }, [32, 16]), g, `streaks t ${t}`);
  }
});

test('puffs@1 draws what engine/fx.js puffs draws (round, chunky, wispy; one-shot and looping; a floor)', () => {
  for (const t of [0, 0.3, 0.6, 0.9]) {
    for (const o of [
      { at: [23.5, 24.5], count: 5, seed: 3, stagger: 0.3, angle: 180, arc: 360, dist: 9, rise: 3, size: 3.1, lobes: 2 },
      { at: [16, 20], count: 4, seed: 1, loop: true, dist: 6, rise: 5, size: 3, shape: 'chunky' },
      { at: [16, 24], count: 3, seed: 6, dist: 8, size: 2.5, shape: 'wispy', floor: 27, lobes: 3 },
    ]) {
      const g = new Surface(48, 48);
      FX.puffs(g, { t, x: o.at[0], y: o.at[1], count: o.count, seed: o.seed, loop: o.loop ?? false, stagger: o.stagger ?? 0.2, angle: (o.angle ?? 90) * RAD, arc: (o.arc ?? 30) * RAD, dist: o.dist, rise: o.rise ?? 4, size: o.size, shape: o.shape ?? 'round', lobes: o.lobes ?? 1, floor: o.floor ?? null, colours: hexes(['s0', 's1', 's2']) });
      if (!g.data.some((v) => v >>> 24)) continue;
      same(drawn({ gen: 'puffs', v: 1, ...o, paints: ['s0', 's1', 's2'] }, { t, loop: !!o.loop && t < 1 }, [48, 48]), g, `puffs t ${t} ${o.shape ?? 'round'}`);
    }
  }
});

test('shot.bar@1 draws the blaster bolt\'s bar of light as sprites/blaster-bolt.js does (trail off), every style and beat', () => {
  for (const style of ['bolt', 'pulse', 'needle']) {
    for (const [length, thickness, flicker] of [[0.5, 0.5, 0.5], [0, 1, 0], [1, 0, 1]]) {
      const p = { ...defaultParams(boltCode), style, length, thickness, flicker, trail: false };
      const [, core, , glow, rim] = steps(p.glow, { core: p.core });
      for (let f = 0; f < 4; f++) {
        const code = renderFrame(boltCode, 'fly', f, p);
        const rows = Math.round(3 + (5.4 - 3) * thickness);
        const call = {
          gen: 'shot.bar', v: 1, at: [16, 8], length: 12 + 9 * length, thick: rows, style, beat: [0, 1, 0, -1][f], flicker: Math.round(1 + 2 * flicker), lead: 0, paints: ['c', 'g', 'r'],
        };
        const r = registry.runGenerator(call, { size: [32, 16] });
        assert.ok(r.ok, r.errors.join('; '));
        const g = paintSimple(new Surface(32, 16), r.primitives, { c: core, g: glow, r: rim });
        let off = 0;
        for (let i = 0; i < g.data.length; i++) if (g.data[i] !== code.data[i]) off++;
        assert.equal(off, 0, `${style} length ${length} thickness ${thickness} frame ${f}: ${off} pixels differ`);
      }
    }
  }
});

// ---- after the review: keys that cool a ball and a bar with its own trail ------------------------------------------

test('glow@1 scale and cool: keys shrink a ball and drop its hottest paints, as plasma-burst\'s cooling ball does', () => {
  const list = ['p0', 'p1', 'p2', 'p3', 'p4'];
  for (const [r, scale, cool] of [[9.25, 1, 0], [9.25, 0.9, 1], [9.25, 0.66, 2], [11, 0.4, 3], [7.5, 0.66, 2]]) {
    const g = new Surface(48, 48);
    FX.glow(g, 23.5, 23.5, r * scale, hexes(list.slice(cool)));
    same(drawn({ gen: 'glow', v: 1, at: [23.5, 23.5], r, scale, cool, paints: list }, {}, [48, 48]), g, `glow r ${r} scale ${scale} cool ${cool}`);
  }
  // the last paint (the rim) is never cooled away; the keys are keyable
  const g = new Surface(48, 48);
  FX.glow(g, 23.5, 23.5, 6, hexes(['p4']));
  same(drawn({ gen: 'glow', v: 1, at: [23.5, 23.5], r: 6, cool: 7, paints: list }, {}, [48, 48]), g, 'glow cooled to its rim');
  assert.deepEqual([...registry.generator('glow', 1).keyable].sort(), ['cool', 'r', 'scale']);
});

test('shot.bar@1 trail: the bar draws the blaster bolt\'s speed lines behind its own tail, exactly as sprites/blaster-bolt.js (trail on)', () => {
  for (const style of ['bolt', 'pulse', 'needle']) {
    for (const [length, thickness, flicker] of [[0.5, 0.5, 0.5], [0, 1, 0], [1, 0, 1], [1, 1, 1]]) {
      const p = { ...defaultParams(boltCode), style, length, thickness, flicker, trail: true };
      const [, core, , glow, rim] = steps(p.glow, { core: p.core });
      for (let f = 0; f < 4; f++) {
        const code = renderFrame(boltCode, 'fly', f, p);
        const call = {
          gen: 'shot.bar', v: 1, at: [16, 8], length: 12 + 9 * length, thick: Math.round(3 + (5.4 - 3) * thickness), style, beat: [0, 1, 0, -1][f], flicker: Math.round(1 + 2 * flicker), lead: 2, trail: true, paints: ['c', 'g', 'r'],
        };
        const r = registry.runGenerator(call, { size: [32, 16], t: f / 4, loop: true, frame: f, frames: 4 });
        assert.ok(r.ok, r.errors.join('; '));
        const g = paintSimple(new Surface(32, 16), r.primitives, { c: core, g: glow, r: rim });
        let off = 0;
        for (let i = 0; i < g.data.length; i++) if (g.data[i] !== code.data[i]) off++;
        assert.equal(off, 0, `${style} length ${length} thickness ${thickness} flicker ${flicker} frame ${f}: ${off} pixels differ`);
      }
    }
  }
});

test('shot.bar@1 flat: the bolt flattened against what it hit, as the first frame of sprites/blaster-bolt.js\'s hit', () => {
  for (const [length, thickness] of [[0.5, 0.5], [0, 1], [1, 0], [1, 1], [0, 0]]) {
    const p = { ...defaultParams(boltCode), length, thickness };
    const [white, core, , glow, rim] = steps(p.glow, { core: p.core });
    const code = renderFrame(boltCode, 'hit', 0, p);
    const call = { gen: 'shot.bar', v: 1, at: [17.5, 8], length: 6, thick: Math.round(3 + (5.4 - 3) * thickness), style: 'flat', lead: 0, paints: ['w', 'c', 'g', 'r'] };
    const r = registry.runGenerator(call, { size: [32, 16], t: 0, loop: false, frame: 0, frames: 5 });
    assert.ok(r.ok, r.errors.join('; '));
    const g = paintSimple(new Surface(32, 16), r.primitives, { w: white, c: core, g: glow, r: rim });
    let off = 0;
    for (let i = 0; i < g.data.length; i++) if (g.data[i] !== code.data[i]) off++;
    assert.equal(off, 0, `length ${length} thickness ${thickness}: ${off} pixels differ`);
  }
});
