// The generators build item B8 adds (docs/data-sprites.md section 9, row B8; 3.3): the ports the first slice needs
// (coin, crate, icons-food), each pinned by the goldens harness (tests/helpers/gen-harness.mjs): pinned output at three
// or more argument sets, determinism, no clock or dice, argument fuzz, cost, loop closure.
//   shape  token@1 (a coin, chip or medal turned about its upright axis), container@1 (a crate, barrel or clay pot),
//          leaf@1 (a pointed leaf as a polygon), taper@1 (a stroke tapering from one end to the other)
//   icon   icon.paint@1, icon.line@1, icon.glint@1, icon.fit@1 (the icon pen, shading and fit of engine/icons.js)
//   shape  star@1 (a star of sharp points as a polygon), gem.cut@1 (a cut gem, faceted or polished)
//   shine  gleam@1 (a twinkle that flares once a loop), glint@1 (a slanted band sliding across a shape)
//   fx     pickup.burst@1 (the collect burst), chunks@1 (boards, staves, sherds and splinters thrown and landing)
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-b8-goldens.test.mjs (writes only files that do not exist).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const APPLE = [
  { kind: 'ellipse', at: [-2.5, 0.5], r: [6, 7] },
  { kind: 'ellipse', at: [2.5, 0.5], r: [6, 7] },
];
const CASES = {
  'token@1': [
    { args: { at: [0, 0.5], size: 15, thick: 3, metal: 'metal', field: 'field', gleam: 'gleam', inlay: 'emblem', shine: 'shine', emblem: 'star' } },
    { args: { at: [0, 0.5], size: 10, thick: 2, shape: 'octagon', emblem: 'hole', spin: 60, sheen: 0.4, metal: 'metal', field: 'field', gleam: 'gleam', inlay: 'emblem', shine: 'shine' } },
    { args: { at: [16, 16], size: 19, thick: 5, shape: 'square', emblem: 'gem', rim: false, spin: 150, squash: 0.2, scale: 0.8, metal: 'metal', field: 'metal', gleam: 'gleam', inlay: 'emblem', shine: 'shine' } },
    { args: { at: [16, 16], size: 12, thick: 2, emblem: 'heart', scale: 0.1, metal: 'metal', field: 'field', gleam: 'gleam', inlay: 'emblem', shine: 'shine' } },
  ],
  'container@1': [
    { args: { style: 'crate', size: 19, wood: 'wood', metal: 'metal', markPaint: 'stamp' } },
    { args: { style: 'barrel', size: 15, bands: false, mark: 'skull', wood: 'wood', metal: 'metal', markPaint: 'stamp', lean: 8.6 } },
    { args: { style: 'pot', size: 23, mark: 'star', wood: 'wood', metal: 'metal', markPaint: 'stamp', grow: 1 } },
    { args: { style: 'crate', size: 21, mark: 'leaf', wood: 'wood', metal: 'metal', markPaint: 'stamp', split: true } },
  ],
  'leaf@1': [
    { args: { from: [0.5, -7.6], to: [7.1, -9.6], width: 4.4, belly: 0.45, blunt: 0.25, paint: 'leaf' } },
    { args: { from: [0, 0], to: [0, -10], width: 3, paint: 'leaf' } },
    { args: { from: [10, 10], to: [2, 4], width: 6, belly: 0.7, blunt: 0, paint: 'leaf.dark' } },
  ],
  'taper@1': [
    { args: { from: [0, -4.6], to: [-4.6, -12], r0: 1.6, r1: 0.8, paint: 'accent' } },
    { args: { from: [1.5, 1.5], to: [7, 7], r0: 1.5, paint: 'cream' } },
    { args: { from: [10, 20], to: [22, 6], r0: 0.6, r1: 3, paint: 'leaf.dark' } },
  ],
  'icon.paint@1': [
    { args: { shapes: APPLE, paint: 'body', dark: 2, soft: 0, lit: 1, zoom: 1.3 } },
    { args: { shapes: [{ kind: 'ellipse', at: [0, -1.2], r: [11.5, 9.4] }], minus: [{ kind: 'rect', at: [-12, -1.2], size: [24, 11.2] }], paint: 'cap', turn: 13.28, scale: 0.95 } },
    { args: { shapes: [{ kind: 'capsule', from: [0, -4], to: [0.6, -9.8], r: 1 }], paint: 'soil', flat: true, centre: [16, 15], scale: 1.1, turn: -26.57, shiny: false } },
    { args: { shapes: [{ kind: 'poly', points: [[-9, 5.6], [8.4, 5.6], [8.4, -3.6]] }], within: [{ kind: 'rect', at: [0, -10], size: [20, 20] }], paint: { rule: 'mix', of: 'gold', with: { rule: 'ramp', of: 'gold', tone: 'dark' }, amount: 0.5 }, dark: 1, soft: 2, lit: 1, edge: [0, 1] } },
  ],
  'icon.line@1': [
    { args: { path: [4.4, -3.6, 3.6, 0, 4.4, 3.4], paint: 'body.dark' } },
    { args: { path: [-3.2, -0.6, -0.2, 0], paint: 'root.dark', turn: 26.57, scale: 1.2 } },
    { args: { path: [-4.9, -0.4, -7, 1], paint: 'stem.deep', over: true, centre: [15, 17], zoom: 1.2 } },
  ],
  'icon.glint@1': [
    { args: { at: [3.2, -6.4], paint: 'shine' } },
    { args: { at: [1, -3.6], len: 1, dot: false, paint: 'shine', turn: -26.57 } },
    { args: { at: [3.5, -2.5], corner: true, paint: 'shine', zoom: 1.3, scale: 0.9 } },
    { args: { at: [3.5, -2.5], paint: 'shine', shiny: false } },
  ],
  'icon.fit@1': [
    { args: { draw: [{ gen: 'icon.paint', v: 1, shapes: APPLE, paint: 'body', dark: 2, soft: 0, lit: 1, zoom: 1.3 }], turn: 13.28 } },
    { args: { draw: [{ gen: 'icon.paint', v: 1, shapes: [{ kind: 'ellipse', at: [1.5, 0], r: [9.6, 5.4] }], paint: 'water', soft: 1 }, { gen: 'icon.line', v: 1, path: [4.4, -3.6, 3.6, 0, 4.4, 3.4], paint: 'water.dark', over: true }, { gen: 'icon.glint', v: 1, at: [1, -3.6], len: 1, dot: false, paint: 'shine' }], size: 1, turn: -26.57 } },
    { args: { draw: [{ gen: 'icon.paint', v: 1, shapes: [{ kind: 'rect', at: [-3.4, -1], size: [6.8, 10.6] }], paint: 'cream', soft: 0 }], size: 0, tilt: false, soften: false, shiny: false, fill: 0.88 } },
  ],
  'star@1': [
    { args: { at: [16, 16], r: 7, paint: 'gold' } },
    { args: { at: [10.5, 12], r: 4.5, points: 4, inner: 0.5, angle: 30, paint: 'gold.light' } },
    { args: { at: [20, 9], r: 11, points: 8, angle: -12.5, paint: 'shine' } },
  ],
  'gem.cut@1': [
    { args: { at: [16, 16], r: [7, 8], paint: 'stone', shine: 'shine' } },
    { args: { at: [15.5, 16], r: [4, 5], cut: 'emerald', facets: false, paint: 'stone', shine: 'shine' } },
    { args: { at: [16, 15], r: [10, 12], cut: 'heart', paint: 'ruby', shine: 'shine' } },
    { args: { at: [16, 16], r: [6, 6], cut: 'round', paint: 'stone', shine: 'shine' } },
  ],
  'glint@1': [
    { args: { at: [16, 16], r: 9, phase: 0, within: [{ kind: 'ellipse', at: [16, 16], r: [9, 7] }], paint: 'shine' } },
    { args: { at: [16, 16], r: 9, phase: -0.8, slant: 0, width: 0.3, within: [{ kind: 'rect', at: [8, 8], size: [16, 16] }], paint: 'shine' } },
    { args: { at: [12, 20], r: 5, phase: 1.2, slant: 1, width: 0.1, paint: 'metal.light' } },
  ],
  'gleam@1': [
    { args: { at: [22, 10], paint: 'metal.light', core: 'shine' } },
    { args: { at: [22, 10], paint: 'metal.light', core: 'shine' }, ctx: { t: 0.125, loop: true, frames: 8, frame: 1 } },
    { args: { at: [5.5, 6.2], paint: 'gold', core: 'shine', peak: 0.5, big: 1 }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [22, 10], paint: 'metal.light', core: 'shine' }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3 } },
  ],
  'pickup.burst@1': [
    { args: { at: [16, 11], amount: 0.365, reach: 10.6, paint: 'metal', bright: 'metal.light', core: 'shine' } },
    { args: { at: [16, 11], amount: 0.9, reach: 10.6, paint: 'metal', bright: 'metal.light', core: 'shine' } },
    { args: { at: [16.5, 9], amount: 0.1, reach: 8, sparkle: false, paint: 'gold', bright: 'gold.light', core: 'shine' } },
    { args: { at: [16, 16], amount: 0, reach: 8, paint: 'gold', bright: 'gold.light', core: 'shine' } },
  ],
  'chunks@1': [
    { args: { at: [16, 20.5], amount: 0.4, count: 6, seed: 2, dist: 10.5, rise: 10, size: 8.7, thick: 3, spread: 8, spin: 0.5, floor: 29, land: 0.95, shrink: 0.3, paint: 'wood', area: { x0: 2, y0: 2, x1: 30, y1: 30 }, ink: true } },
    { args: { at: [16, 20.5], amount: 1, count: 6, seed: 11, dist: 13.5, rise: 11.5, size: 2.6, thick: 1, spread: 5.7, spin: 1.5, floor: 29, land: 0.88, shrink: 0.1, paint: 'splinter', area: { x0: 1, y0: 1, x1: 31, y1: 30 } } },
    { args: { at: [12, 22], amount: 1, count: 3, seed: 4, dist: 8.5, rise: 8, size: 6, thick: 2, spread: 2, spin: 0.8, floor: 29, land: 0.95, shrink: 0.25, restThick: 3, restShrink: 0.5, paint: 'wood', area: { x0: 2, y0: 2, x1: 30, y1: 30 }, ink: true } },
  ],
};

test('B8 registers its generators in the site registry, each in its family', () => {
  const fam = Object.fromEntries(registry.generators().map((g) => [g.key, g.family]));
  for (const [key, family] of Object.entries({
    'token@1': 'shape', 'container@1': 'shape', 'leaf@1': 'shape', 'taper@1': 'shape', 'icon.paint@1': 'icon', 'icon.line@1': 'icon', 'icon.glint@1': 'icon',
    'icon.fit@1': 'icon', 'gleam@1': 'shine', 'star@1': 'shape', 'gem.cut@1': 'shape', 'glint@1': 'shine', 'pickup.burst@1': 'fx', 'chunks@1': 'fx',
    'pickup.bob@1': 'motion', 'pickup.spin@1': 'motion', 'pickup.collect@1': 'motion', 'prop.rock@1': 'motion', 'pictures@1': 'layout',
  })) assert.equal(fam[key], family, key);
});

for (const key of Object.keys(CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases: CASES[key] });
  });
}

test('a pinned B8 golden is real output: drawn things, keyed to the paints the call names', () => {
  const r = registry.runGenerator({ gen: 'token', v: 1, ...CASES['token@1'][0].args });
  assert.ok(r.ok, r.errors.join('; '));
  assert.ok(r.primitives.length >= 1 && r.primitives.every((p) => p.kind === 'stamp'));
  const keys = new Set(r.primitives.flatMap((p) => Object.values(p.key).map((k) => JSON.stringify(k))));
  for (const k of ['"metal"', '"metal.dark"', '"metal.light"', '"field"', '"emblem"']) assert.ok(keys.has(k), `${k} is painted`);
  const tiny = registry.runGenerator({ gen: 'token', v: 1, ...CASES['token@1'][3].args });
  assert.deepEqual(tiny.primitives, [], 'a coin shrunk below 2.4 px across draws nothing (the collect clip\'s end)');
});
