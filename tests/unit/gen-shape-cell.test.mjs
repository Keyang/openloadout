// cell@1 and cell.pulse@1 (engine/gen/cell.js, migration batch M1): the health cell, a port of sprites/health-cell.js
// (frozen in tests/fixtures/redraws/health-cell.json) built on engine/gadgets.js cellIn, drawCharge and haloIn; and the
// motion that beats it. The port is held pixel for pixel to the code it replaces: the same Surface calls, made here.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { dataSprite } from '../../engine/data-sprite.js';
import { defaultParams, renderFrame } from '../../engine/sprite.js';
import { keys } from '../../engine/motion.js';
import { oldReplay } from '../helpers/old-replay.mjs';

const OLD = oldReplay('gen-shape-cell');   // what engine/gadgets.js (deleted by R3) drew, recorded in the order of the calls (tests/helpers/old-replay.mjs)
const PAL = { casing: '#c2c9d6', glow: '#4fd17a' };

/** What sprites/health-cell.js painted for one look, on a 32 x 32 Surface centred on (16, 17): the body, then (layer halo) the halo. */
function oldCell({ shape, height, level, beat, scale = 1, squash = 0, bare = false }, layer) {
  return OLD.surface(32, 32);
}
/** What cell@1 paints for the same look, drawn through a data sprite. */
function newCell(o, layer) {
  const call = { gen: 'cell', v: 1, at: [16, 17], shape: o.shape, height: o.height, level: o.level, beat: o.beat, layer, scale: o.scale ?? 1, squash: o.squash ?? 0, bare: !!o.bare,
    casing: 'casing', charge: 'glow', shine: 'shine' };
  assert.ok(registry.checkCall(call).ok, registry.checkCall(call).errors.join('; '));
  const def = {
    format: 'loadout-sprite', version: 2, id: 'cell-test', name: 'Cell test', size: [32, 32], pivot: [16, 30], grounded: false, preview: 'still',
    meta: { type: 'pickup', role: 'items/pickup', themes: ['sci-fi'], gameTypes: ['arcade'], view: 'front', words: ['cell', 'health', 'test', 'glow', 'heal', 'pickup'], license: 'draft' },
    palette: [{ id: 'casing', label: 'Casing', default: PAL.casing, material: 'metal' }, { id: 'glow', label: 'Glow', default: PAL.glow, material: 'light' }, { id: 'shine', default: '#ffffff', material: 'light', detail: true }],
    controls: [{ key: 'casing', kind: 'colour', label: 'Casing' }, { key: 'glow', kind: 'colour', label: 'Glow' }],
    body: { pictures: { nodes: [{ id: 'n', parent: null, at: [0, 0] }], draw: [{ ...call, on: 'n' }] } },
    clips: { still: { frames: 1, fps: 1 } },
  };
  const s = dataSprite(def);
  return renderFrame(s, 'still', 0, defaultParams(s));
}

test('cell@1 passes the goldens harness', () => {
  const paints = { casing: 'steel', charge: 'heal', shine: 'shine' };
  checkGeneratorContract(registry, registry.generator('cell', 1), { cases: [
    { args: { at: [16, 17], shape: 'cell', height: 18, ...paints } },
    { args: { at: [16, 17], shape: 'syringe', height: 22, level: 0.3, beat: 0.5, ...paints } },
    { args: { at: [0, 0], shape: 'pack', height: 16, level: 1, beat: 1, layer: 'halo', ...paints } },
    { args: { at: [16, 17], shape: 'pack', height: 20, beat: 0.7, scale: 0.6, squash: 0.2, bare: true, ...paints } },
    // the halo between its two thresholds (shows from 0.6, goes white from 0.95): it pins both without the old code
    { args: { at: [16, 17], shape: 'cell', height: 18, level: 0.8, beat: 0.7, layer: 'halo', ...paints } },
    { args: { at: [16, 17], shape: 'syringe', height: 22, level: 1, beat: 0.92, layer: 'halo', ...paints } },
  ] });
});

test('cell@1 paints what sprites/health-cell.js painted, pixel for pixel, body and halo', () => {
  for (const shape of ['cell', 'syringe', 'pack']) for (const height of [15, 18, 22, 24]) for (const level of [0, 0.5, 0.8, 1]) for (const beat of [0, 0.4, 0.9, 1]) {
    const o = { shape, height, level, beat };
    for (const layer of ['body', 'halo']) {
      const a = oldCell(o, layer), b = newCell(o, layer);
      let off = 0;
      for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) off++;
      assert.equal(off, 0, `${layer} ${JSON.stringify(o)}: ${off} pixels differ`);
    }
  }
  for (const o of [{ shape: 'cell', height: 20, level: 0.8, beat: 0, scale: 1.1, squash: -0.1 }, { shape: 'pack', height: 16, level: 0.2, beat: 0, scale: 0.5, squash: 0.18, bare: true }]) {
    const a = oldCell(o, 'body'), b = newCell(o, 'body');
    let off = 0;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) off++;
    assert.equal(off, 0, `${JSON.stringify(o)}: ${off} pixels differ`);
  }
});

test('cell.pulse@1 beats twice a loop (frames 1 and 3) and rests, or swells and shrinks in a collect', async () => {
  const { heartbeat } = await import('../../engine/pickups.js');
  const e = registry.generator('cell.pulse', 1);
  assert.ok(e, 'cell.pulse@1 is registered');
  assert.equal(e.family, 'motion');
  const ctx = (t, loop) => Object.freeze({ t, frame: 0, frames: 8, loop, size: [32, 32], clip: 'x', direction: null });
  for (let f = 0; f < 8; f++) assert.ok(Math.abs(e.run({ mode: 'beat' }, ctx(f / 8, true))[0].args['cell.beat'] - heartbeat(f / 8)) < 1e-9);
  assert.deepEqual(e.run({ mode: 'beat' }, ctx(1, true)), e.run({ mode: 'beat' }, ctx(0, true)));
  for (const t of [0, 3 / 7, 4 / 7, 5 / 7, 1]) {
    const [m] = e.run({ mode: 'collect' }, ctx(t, false));
    const scale = keys(t, [[0, 1], [0.5, 1], [0.58, 1.1], [0.75, 0.5], [0.86, 0]]);
    assert.ok(Math.abs(m.args['cell.scale'] - scale) < 1e-9);
    assert.equal(m.args['cell.bare'], scale < 0.9);
    assert.equal(m.args['cell.beat'], 0);
  }
});
