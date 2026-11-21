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
const PAL = { casing: '#c2c9d6', glow: '#4fd17a' };

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
