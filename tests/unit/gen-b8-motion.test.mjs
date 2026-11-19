// The motion generators of build item B8 (docs/data-sprites.md 2.5d and 3.3, family "motion"): pickup.bob@1,
// pickup.spin@1, pickup.collect@1, prop.rock@1. A motion returns node moves, not primitives (engine/data-sprite.js
// LAYOUTS: [{ node?, move: [dx, dy], turn, scale }]); the pictures layout of B8 (engine/gen/pictures.js) also reads
// `args`: values for keyable arguments of the generators drawn on that node, each named "<generator id>.<argument>"
// ("token.spin", "container.lean") so it reaches only the generator it was made for.
// Goldens, fuzz and determinism for every motion: tests/unit/gen-motion-layout-contract.test.mjs.
// So the goldens harness, which holds generators to the shape-list type, checks these here instead: pinned values
// against the code they replace, determinism, no clock or dice, loops that close, arguments checked by type.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { withoutClockOrDice } from '../helpers/gen-harness.mjs';
import { lerp, wave, keys, fract, PI } from '../../engine/motion.js';

const MOTIONS = ['pickup.bob', 'pickup.spin', 'pickup.collect', 'prop.rock'];
const ctxOf = (t, frames, loop = true) => ({ t, frame: Math.round(t * (loop ? frames : frames - 1)) % frames, frames, loop, size: [32, 32], clip: 'x', direction: null });
/** Runs a motion the way the layout does: its arguments with defaults, checked, then entry.run(args, ctx). */
function moves(id, args, ctx) {
  const entry = registry.generator(id, 1);
  const filled = {};
  for (const [k, t] of Object.entries(entry.args)) filled[k] = Object.hasOwn(args, k) ? args[k] : t.default;
  const check = registry.checkCall({ gen: id, v: 1, ...args });
  assert.ok(check.ok, check.errors.join('; '));
  return withoutClockOrDice(() => entry.run(Object.freeze(filled), Object.freeze(ctx)));
}

test('the four motions are registered, documented and take arguments; a motion costs nothing to draw', () => {
  for (const id of MOTIONS) {
    const g = registry.generator(id, 1);
    assert.ok(g, id);
    assert.equal(g.family, 'motion');
    assert.match(g.about, /^[A-Z].*\.$/);
    assert.ok(Object.keys(g.args).length > 0);
    assert.equal(g.cost({}), 0, `${id}: a motion draws nothing`);
  }
});

test('pickup.bob@1 lifts the whole picture as the coin and every pickup float: round(height * wave(t))', () => {
  for (const height of [0, 0.5, 1, 1.5, 2, 4]) for (let f = 0; f < 8; f++) {
    const [m, ...rest] = moves('pickup.bob', { height }, ctxOf(f / 8, 8));
    assert.equal(rest.length, 0);
    assert.equal(m.node, undefined, 'no node: the whole picture');
    assert.deepEqual(m.move, [0, 0 - Math.round(height * wave(f / 8))]);
  }
  assert.deepEqual(moves('pickup.bob', { height: 2 }, ctxOf(1, 8)), moves('pickup.bob', { height: 2 }, ctxOf(0, 8)), 'the loop closes');
});

test('pickup.spin@1 turns the coin half a turn a loop and slides its glint across, as sprites/coin.js spin', () => {
  for (let f = 0; f < 8; f++) {
    const t = f / 8;
    const [m] = moves('pickup.spin', {}, ctxOf(t, 8));
    assert.deepEqual(m.move, [0, 0]);
    assert.equal(m.args['token.spin'], 180 * t);
    assert.equal(m.args['token.sheen'], lerp(-1.6, 1.6, fract(t + 0.5)));
  }
  const [two] = moves('pickup.spin', { turns: 2 }, ctxOf(0.25, 8));
  assert.equal(two.args['token.spin'], 90);
  // the loop closes: a half turn later the coin looks the same (its two faces match), and the glint is back
  const a = moves('pickup.spin', {}, ctxOf(0, 8))[0], b = moves('pickup.spin', {}, ctxOf(1, 8))[0];
  assert.equal(((b.args['token.spin'] - a.args['token.spin']) % 180 + 180) % 180, 0);
  assert.equal(b.args['token.sheen'], a.args['token.sheen']);
});

test('pickup.collect@1 dips, pops, flips, swells and shrinks as sprites/coin.js collect', () => {
  for (const [pop, room] of [[0.5, 4.9], [1, 7.9], [0, 2.9], [1, 2.9]]) for (let f = 0; f < 8; f++) {
    const t = f / 7;
    const top = Math.min(lerp(3, 7, pop), room);
    const lift = keys(t, [[0, 0], [0.14, -1], [0.45, top], [0.6, top + 1], [1, top + 1]]);
    const sq = keys(t, [[0, 0], [0.14, 0.2], [0.3, -0.18], [0.5, 0], [1, 0]]);
    const scale = keys(t, [[0, 1], [0.5, 1], [0.58, 1.12], [0.75, 0.5], [0.86, 0]]);
    const spin = 180 * keys(t, [[0.14, 0], [0.29, 0.34], [0.43, 0.5], [0.57, 1]], (x) => x);
    const [m] = moves('pickup.collect', { pop, room }, ctxOf(t, 8, false));
    assert.deepEqual(m.move, [0, 0 - Math.round(lift)], `move at frame ${f}`);
    assert.deepEqual(m.args, { 'token.scale': scale, 'token.squash': sq, 'token.spin': spin, 'token.sheen': 0, 'token.bare': scale < 0.9 }, `args at frame ${f}`);
  }
});

test('prop.rock@1 knocks a prop over, rocks it back past upright and settles it, as sprites/crate.js hurt', () => {
  const want = [0.15, -0.1, 0.05, 0];
  for (let f = 0; f < 4; f++) {
    const [m] = moves('prop.rock', { lean: 0.15 * 180 / PI }, ctxOf(f / 3, 4, false));
    assert.ok(Math.abs(m.args['container.lean'] - want[f] * 180 / PI) < 1e-9, `frame ${f}: ${m.args['container.lean']}`);
    assert.deepEqual(m.move, [0, 0]);
  }
  const [big] = moves('prop.rock', { lean: 20 }, ctxOf(0, 4, false));
  assert.equal(big.args['container.lean'], 20);
});

test('motions are deterministic and refuse arguments outside their types', () => {
  for (const id of MOTIONS) {
    const a = moves(id, {}, ctxOf(0.3, 8)), b = moves(id, {}, ctxOf(0.3, 8));
    assert.deepEqual(a, b, id);
  }
  for (const [id, args] of [['pickup.bob', { height: 99 }], ['pickup.spin', { turns: 0 }], ['pickup.collect', { pop: 2 }], ['prop.rock', { lean: 'far' }], ['pickup.bob', { height: 1, wobble: 1 }]]) {
    assert.equal(registry.checkCall({ gen: id, v: 1, ...args }).ok, false, `${id} ${JSON.stringify(args)}`);
  }
});
