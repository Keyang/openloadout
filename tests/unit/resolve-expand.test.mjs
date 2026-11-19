// The settings resolver (engine/resolve.js, B4), the frame step: a resolved draw list for one frame (clip and
// direction decide what is left of `when` and `clip`), the named generators run through the registry
// (engine/gen/registry.js, B2), pieces they place drawn, colour rules worked out, giving the shape list that
// engine/draw-list.js (B3) draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSprite, expandFrame, sceneItems } from '../../engine/resolve.js';
import { renderList } from '../../engine/draw-list.js';
import { runGenerator } from '../../engine/gen/index.js';
import { checkPrimitive } from '../../engine/gen/args.js';
import { loadV2, testPieces, testRegistry } from '../fixtures/resolve/helpers.mjs';
import { stubRegistry } from '../fixtures/v2/registry.mjs';
import { tone, ramp } from '../../engine/color.js';

const store = testPieces();
const reg = testRegistry();

test('the coin\'s draw list at a frame: generators run, a shape list the renderer draws in full', () => {
  const r = resolveSprite(loadV2('coin'), {}, { pieces: store, generators: stubRegistry() });
  assert.equal(r.ok, true, r.errors.join('; '));
  const out = expandFrame(r, r.body.pictures.draw, { clip: 'spin', frame: 2, frames: 8, t: 0.25, loop: true, size: [32, 32] }, { generators: reg });
  assert.equal(out.ok, true, out.errors.join('; '));
  assert.deepEqual(out.primitives.map((p) => p.kind), ['ellipse', 'stamp', 'outline', 'dot']);
  const glint = out.primitives[3];
  assert.deepEqual(glint.at, [2, 0]);
  assert.equal(glint.on, 'coin', 'the call\'s node is carried onto what it returns');
  for (const p of out.primitives) assert.deepEqual(checkPrimitive(p, { bindings: false }), [], 'every item is of the shape-list type');
  const { skipped } = renderList(32, 32, out.primitives.map((p) => ({ ...p, on: undefined })), { palette: r.palette });
  assert.deepEqual(skipped, [], 'the renderer understands every item');
  const off = resolveSprite(loadV2('coin'), { shine: false }, { pieces: store, generators: stubRegistry() });
  assert.equal(expandFrame(off, off.body.pictures.draw, { clip: 'spin' }, { generators: reg }).primitives.length, 3);
});

test('clip and direction decide the rest of a condition at the frame', () => {
  const list = [
    { kind: 'dot', at: [1, 1], paint: 'gold', when: { clip: ['collect'] } },
    { kind: 'dot', at: [2, 2], paint: 'gold', when: [{ clip: ['spin'] }, { direction: ['up'] }] },
    { kind: 'dot', at: [3, 3], paint: 'gold' },
    { gen: 'glint', v: 1, every: 4, paint: 'gold', clip: ['collect'] } ];
  assert.deepEqual(sceneItems(list, { clip: 'spin' }).map((p) => p.at?.[0] ?? 'glint'), [2, 3]);
  assert.deepEqual(sceneItems(list, { clip: 'collect' }).map((p) => p.at?.[0] ?? 'glint'), [1, 3, 'glint']);
  assert.deepEqual(sceneItems(list, { clip: 'walk', direction: 'up' }).map((p) => p.at?.[0] ?? 'glint'), [2, 3]);
  assert.ok(sceneItems(list, { clip: 'collect' }).every((p) => p.when === undefined && p.clip === undefined), 'decided conditions are gone');
});

test('colour rules in paints become colours; pieces a generator places are drawn', () => {
  const def = {
    format: 'loadout-sprite', version: 2, id: 'crate', name: 'Crate', blurb: 'A crate for tests.', size: [32, 32], pivot: [16, 30],
    meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['crate'], license: 'draft' },
    palette: [ { id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' }, { id: 'soil', label: 'Soil', default: '#5a3a22', material: 'earth' } ],
    controls: [ { key: 'dark', kind: 'range', label: 'Dark', default: 0.5 }, { key: 'clods', kind: 'range', label: 'Clods', default: 0.5 } ],
    body: { pictures: { nodes: [{ id: 'box', parent: null, at: [16, 16] }], draw: [
      { kind: 'rect', at: [4, 8], size: [24, 20], paint: { rule: 'tone', of: 'wood', by: { from: 'dark', map: [[0, 0], [1, -1]] } } },
      { gen: 'row', v: 1, from: [6, 28], to: [26, 28], count: { from: 'clods', map: [[0, 1], [1, 5]], round: 'px' }, place: { use: 'stamp:clod', v: 1, paint: { a: 'soil.dark' } } } ] } },
    clips: { idle: { frames: 1, fps: 1 } },
  };
  const r = resolveSprite(def, { dark: 1 }, { pieces: store });
  assert.equal(r.ok, true, r.errors.join('; '));
  const out = expandFrame(r, r.body.pictures.draw, { clip: 'idle', size: [32, 32] });
  assert.equal(out.ok, true, out.errors.join('; '));
  assert.equal(out.palette[out.primitives[0].paint]?.hex, tone('#8a5a2a', -1), 'the rule worked out at the settings, as a slot');
  assert.equal(out.palette[out.primitives[0].paint].material, 'wood', 'with the material of the slot it reads');
  const clods = out.primitives.slice(1);
  assert.equal(clods.length, 3, 'clods 0.5 -> 3');
  assert.ok(clods.every((c) => c.kind === 'stamp' && c.anchor === 'bc'));
  assert.deepEqual(clods.map((c) => c.at), [[6, 28], [16, 28], [26, 28]]);
  const slot = clods[0].key.a;
  assert.equal(r.palette[slot]?.hex ?? out.palette?.[slot]?.hex, ramp('#5a3a22').dark);
  const { skipped } = renderList(32, 32, out.primitives, { palette: out.palette });
  assert.deepEqual(skipped, []);
});

test('the site\'s registry is the default; what it cannot run is an error, never a throw', () => {
  const r = resolveSprite(loadV2('coin'), {}, { pieces: store, generators: stubRegistry() });
  const out = expandFrame(r, r.body.pictures.draw, { clip: 'spin' });
  assert.equal(out.ok, false, 'glint@1 is not in the site\'s registry yet');
  assert.match(out.errors.join(' '), /glint/);
  assert.deepEqual(out.primitives, []);
  for (const bad of [null, 7, 'x', [null], [{ gen: 'twinkle', v: 1 }], [{ kind: 'blob' }]]) assert.doesNotThrow(() => expandFrame(r, bad, {}));
  assert.equal(expandFrame(null, [], {}).ok, false);
});

test('twinkle from the site registry gives what runGenerator gives', () => {
  const def = {
    format: 'loadout-sprite', version: 2, id: 'gleam', name: 'Gleam', blurb: 'A gleam for tests.', size: [16, 16], pivot: [8, 8],
    meta: { type: 'effect', role: 'effects/spark', view: 'none', themes: ['neutral'], gameTypes: ['platformer'], words: ['gleam'], license: 'draft' },
    palette: [ { id: 'gold', label: 'Gold', default: '#e8b23a', material: 'metal' }, { id: 'shine', label: 'Core', default: '#ffffff', material: 'light' } ],
    controls: [ { key: 'size', kind: 'range', label: 'Size', default: 0.5 } ],
    body: { pictures: { nodes: [{ id: 'c', parent: null, at: [8, 8] }], draw: [{ gen: 'twinkle', v: 1, at: [3, 3], size: { from: 'size', map: [[0, 0], [1, 2]], round: 'px' }, paint: 'gold', core: 'shine' }] } },
    clips: { idle: { frames: 1, fps: 1 } },
  };
  const r = resolveSprite(def, { size: 1 });
  assert.equal(r.ok, true, r.errors.join('; '));
  const out = expandFrame(r, r.body.pictures.draw, { clip: 'idle' });
  assert.equal(out.ok, true, out.errors.join('; '));
  assert.deepEqual(out.primitives, runGenerator({ gen: 'twinkle', v: 1, at: [3, 3], size: 2, paint: 'gold', core: 'shine' }).primitives);
});
