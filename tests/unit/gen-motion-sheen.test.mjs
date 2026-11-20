// pickup.sheen@1 (engine/gen/motion-sheen.js, added by migration batch M1): the bright band that sweeps once across a
// floating pickup in the first half of its idle loop, as engine/pickups.js glint did for the code pickups
// (phase lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6))). A motion: it moves nothing and hands `glint.phase` to the glint@2
// calls drawn on its node. Its golden lives with the other motions' (tests/unit/gen-motion-layout-contract.test.mjs,
// tests/fixtures/gen/pickup.sheen@1.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { lerp, clamp } from '../../engine/motion.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { defaultParams, renderFrame } from '../../engine/sprite.js';

const entry = () => registry.generator('pickup.sheen', 1);
const ctx = (t) => Object.freeze({ t, frame: Math.round(t * 8) % 8, frames: 8, loop: true, size: [32, 32], clip: 'idle', direction: null });

test('pickup.sheen@1 is a registered motion that costs nothing and takes from, to, start and end', () => {
  const e = entry();
  assert.ok(e, 'pickup.sheen@1 is registered');
  assert.equal(e.family, 'motion');
  assert.equal(e.cost({}), 0);
  assert.deepEqual(Object.keys(e.args).sort(), ['end', 'from', 'start', 'to']);
  assert.ok(registry.checkCall({ gen: 'pickup.sheen', v: 1 }).ok);
  assert.equal(registry.checkCall({ gen: 'pickup.sheen', v: 1, start: 2 }).ok, false);
  assert.equal(registry.checkCall({ gen: 'pickup.sheen', v: 1, nope: 1 }).ok, false);
});

test('at its defaults it sweeps glint.phase as the code pickups\' glint did, and moves nothing', () => {
  const e = entry();
  const filled = Object.freeze(Object.fromEntries(Object.entries(e.args).map(([k, t]) => [k, t.default])));
  for (let f = 0; f < 8; f++) {
    const t = f / 8;
    const out = e.run(filled, ctx(t));
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].move, [0, 0]);
    assert.deepEqual(Object.keys(out[0].args), ['glint.phase']);
    assert.ok(Math.abs(out[0].args['glint.phase'] - lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6))) < 1e-9, `frame ${f}`);
  }
  // a loop closes: t = 0 and t = 1 put the band at the same place (off the shape)
  assert.deepEqual(e.run(filled, ctx(1)), e.run(filled, ctx(0)));
});

test('in a pictures body it moves the glint@2 on its node across the frames, and no glint on another node', () => {
  const box = { kind: 'poly', points: [[-6, -6], [6, -6], [6, 6], [-6, 6]], paint: 'body' };
  const def = {
    format: 'loadout-sprite', version: 2, id: 'sheen-test', name: 'Sheen test', size: [32, 32], pivot: [16, 30], grounded: false, preview: 'idle',
    meta: { type: 'pickup', role: 'items/pickup', themes: ['neutral'], gameTypes: ['arcade'], view: 'front', words: ['test', 'box', 'shine', 'glint', 'pickup', 'square'], license: 'draft' },
    palette: [{ id: 'body', label: 'Body', default: '#3f86e0', material: 'paint' }, { id: 'shine', default: '#ffffff', material: 'light', detail: true }],
    controls: [{ key: 'body', kind: 'colour', label: 'Body' }],
    body: { pictures: {
      nodes: [{ id: 'a', parent: null, at: [16, 16] }, { id: 'b', parent: null, at: [16, 16] }],
      draw: [{ ...box, on: 'a' }, { id: 'glint', gen: 'glint', v: 2, on: 'a', at: [0, 0], r: 6, phase: -1.5, width: 0.15, within: [box], paint: 'shine', clip: ['idle'] },
        { id: 'still', gen: 'glint', v: 2, on: 'b', at: [0, 0], r: 6, phase: 0, width: 0.15, within: [box], paint: 'shine', clip: ['still'] }],
      motion: [{ gen: 'pickup.sheen', v: 1, node: 'a', clip: ['idle', 'still'] }],
    } },
    clips: { idle: { frames: 8, fps: 10 }, still: { frames: 8, fps: 10 } },
  };
  const s = dataSprite(def), p = defaultParams(s);
  const white = (g) => { const xs = []; for (let i = 0; i < g.data.length; i++) if (g.data[i] === 0xffffffff) xs.push(i % 32); return xs; };
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const where = [1, 2, 3, 4].map((f) => mean(white(renderFrame(s, 'idle', f, p))));
  for (let i = 1; i < where.length; i++) assert.ok(where[i] > where[i - 1], `the band moves right from frame to frame: ${where.join(', ')}`);
  assert.ok(white(renderFrame(s, 'idle', 0, p)).length < white(renderFrame(s, 'idle', 3, p)).length / 2, 'frame 0: the band is (nearly) off the shape');
  // the glint on node b keeps its own phase: the same pixels on every frame
  const still = [0, 2, 5].map((f) => white(renderFrame(s, 'still', f, p)).length);
  assert.ok(still[0] > 0 && still.every((n) => n === still[0]), `still: ${still}`);
});

// pickup.beat@1 (same module): a heart's beat, two quick swells a loop (engine/pickups.js heartbeat), scaling its node
// by 1 + amount * heartbeat(t); amount is a bound argument, so a slider sets how hard it beats.
test('pickup.beat@1 swells its node twice a loop by 1 + amount * heartbeat(t), and rests the second half', async () => {
  const { heartbeat } = await import('../../engine/pickups.js');
  const e = registry.generator('pickup.beat', 1);
  assert.ok(e, 'pickup.beat@1 is registered');
  assert.equal(e.family, 'motion');
  assert.equal(e.cost({}), 0);
  assert.ok(registry.checkCall({ gen: 'pickup.beat', v: 1, amount: 0.2 }).ok);
  assert.equal(registry.checkCall({ gen: 'pickup.beat', v: 1, amount: 2 }).ok, false);
  for (const amount of [0, 0.1, 0.3]) {
    for (let f = 0; f < 8; f++) {
      const out = e.run(Object.freeze({ amount }), ctx(f / 8));
      assert.equal(out.length, 1);
      assert.deepEqual(out[0].move, [0, 0]);
      assert.ok(Math.abs(out[0].scale - (1 + amount * heartbeat(f / 8))) < 1e-9, `amount ${amount} frame ${f}`);
    }
  }
  assert.deepEqual(e.run({ amount: 0.3 }, ctx(1)), e.run({ amount: 0.3 }, ctx(0)), 'the loop closes');
  const big = (f) => e.run({ amount: 0.3 }, ctx(f / 8))[0].scale;
  assert.ok(big(1) > big(2) && big(3) > big(2) && big(6) === 1, 'beats on frames 1 and 3, still by frame 6');
});
