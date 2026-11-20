// The versions build item B10b adds so every generator draws on a node centred at its origin (the first fresh-agent
// test drew a node-centred gem as its lower-right quarter): gem.cut@2, glint@2, icon.paint@2, icon.line@2,
// icon.glint@2, each pinned by the goldens harness (tests/helpers/gen-harness.mjs), with cases at negative coordinates.
// Each draws what its @1 draws inside the frame (checked here against @1 at the same arguments), and keeps what lies
// left of or above the frame's corner. glint@2 also takes generator calls in `within` (a glint across a generated
// stone). To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-b10b-goldens.test.mjs (writes only missing files).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const GEM = { gen: 'gem.cut', v: 2, at: [0, 0], r: [6, 5], paint: 'stone', shine: 'shine' };
const CASES = {
  'gem.cut@2': [
    { args: { at: [0, 0], r: [7, 8], paint: 'stone', shine: 'shine' } },
    { args: { at: [-0.5, 1], r: [4, 5], cut: 'emerald', facets: false, paint: 'stone', shine: 'shine' } },
    { args: { at: [16, 15], r: [10, 12], cut: 'heart', paint: 'ruby', shine: 'shine' } },
    { args: { at: [-3, -2], r: [6, 6], cut: 'round', paint: 'stone', shine: 'shine' } },
  ],
  'glint@2': [
    { args: { at: [0, 0], r: 9, phase: 0, within: [{ kind: 'ellipse', at: [0, 0], r: [9, 7] }], paint: 'shine' } },
    { args: { at: [16, 16], r: 9, phase: -0.8, slant: 0, width: 0.3, within: [{ kind: 'rect', at: [8, 8], size: [16, 16] }], paint: 'shine' } },
    { args: { at: [-4, 2], r: 5, phase: 1.2, slant: 1, width: 0.1, paint: 'metal.light' } },
    { args: { at: [0, 0], r: 6, phase: 0.2, width: 0.25, within: [GEM], paint: 'shine' } },
  ],
  'icon.paint@2': [
    { args: { shapes: [{ kind: 'ellipse', at: [0, 0], r: [6, 7] }], paint: 'body', dark: 2, soft: 0, lit: 1, centre: [0, 0] } },
    { args: { shapes: [{ kind: 'ellipse', at: [0, -1.2], r: [11.5, 9.4] }], minus: [{ kind: 'rect', at: [-12, -1.2], size: [24, 11.2] }], paint: 'cap', turn: 13.28, scale: 0.95, centre: [-2, 3] } },
    { args: { shapes: [{ kind: 'capsule', from: [0, -4], to: [0.6, -9.8], r: 1 }], paint: 'soil', flat: true, centre: [16, 15], scale: 1.1, turn: -26.57, shiny: false } },
  ],
  'icon.line@2': [
    { args: { path: [4.4, -3.6, 3.6, 0, 4.4, 3.4], paint: 'body.dark', centre: [0, 0] } },
    { args: { path: [-3.2, -0.6, -0.2, 0], paint: 'root.dark', turn: 26.57, scale: 1.2, centre: [-5, -5] } },
    { args: { path: [-4.9, -0.4, -7, 1], paint: 'stem.deep', over: true, centre: [15, 17], zoom: 1.2 } },
  ],
  'icon.glint@2': [
    { args: { at: [3.2, -6.4], paint: 'shine', centre: [0, 0] } },
    { args: { at: [1, -3.6], len: 1, dot: false, paint: 'shine', turn: -26.57, centre: [-1, 2] } },
    { args: { at: [3.5, -2.5], corner: true, paint: 'shine', zoom: 1.3, scale: 0.9 } },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  const [id, v] = key.split('@');
  test(`${key} passes the goldens harness`, () => {
    const entry = registry.generator(id, Number(v));
    assert.ok(entry, `${key} is registered`);
    checkGeneratorContract(registry, entry, { cases });
  });
}

/** Pixels a list of stamps and dots paints, as "x,y=paint" strings, in frame pixels 0..31 only. */
function framePixels(prims) {
  const out = new Set();
  for (const p of prims) {
    if (p.kind === 'dot') { if (p.at[0] >= 0 && p.at[1] >= 0 && p.at[0] < 32 && p.at[1] < 32) out.add(`${p.at[0]},${p.at[1]}=${JSON.stringify(p.paint)}`); continue; }
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => {
      const x = p.at[0] + i, y = p.at[1] + j;
      if (ch !== '.' && ch !== ' ' && x >= 0 && y >= 0 && x < 32 && y < 32) out.add(`${x},${y}=${JSON.stringify(p.key[ch])}`);
    }));
  }
  return [...out].sort();
}

test('each @2 paints what its @1 paints inside the frame, at the @1 golden arguments and at corners where @1 cut', () => {
  const corners = { 'gem.cut': [{ at: [16, 16], r: [7, 8], paint: 'stone', shine: 'shine' }, { at: [2, 1], r: [6, 6], cut: 'heart', paint: 'stone', shine: 'shine' }],
    glint: [{ at: [16, 16], r: 9, within: [{ kind: 'ellipse', at: [16, 16], r: [9, 7] }], paint: 'shine' }, { at: [1, 30], r: 8, phase: 0.3, paint: 'shine' }],
    'icon.paint': [{ shapes: [{ kind: 'ellipse', at: [0, 0], r: [6, 7] }], paint: 'body' }, { shapes: [{ kind: 'ellipse', at: [0, 0], r: [6, 7] }], paint: 'body', centre: [2, 30] }],
    'icon.line': [{ path: [4.4, -3.6, 3.6, 0, 4.4, 3.4], paint: 'body.dark' }, { path: [-8, -8, 8, 8], paint: 'body.dark', centre: [31, 1] }],
    'icon.glint': [{ at: [3.2, -6.4], paint: 'shine' }, { at: [0, 0], paint: 'shine', centre: [0, 31] }] };
  for (const [id, list] of Object.entries(corners)) {
    for (const args of list) {
      const one = registry.runGenerator({ gen: id, v: 1, ...args }), two = registry.runGenerator({ gen: id, v: 2, ...args });
      assert.ok(one.ok && two.ok, `${id}: ${[...one.errors, ...two.errors].join('; ')}`);
      assert.deepEqual(framePixels(two.primitives), framePixels(one.primitives), `${id}@2 differs from @1 inside the frame at ${JSON.stringify(args)}`);
    }
  }
});

test('gem.cut@2 centred on the origin draws the whole stone: the same pixels as @1 centred in the frame, moved', () => {
  const at = (x, y) => registry.runGenerator({ gen: 'gem.cut', v: 2, at: [x, y], r: [6, 5], paint: 'stone', shine: 'shine' });
  const moved = (prims, d) => prims.map((p) => ({ ...p, at: [p.at[0] + d, p.at[1] + d] }));
  const origin = at(0, 0), mid = registry.runGenerator({ gen: 'gem.cut', v: 1, at: [16, 16], r: [6, 5], paint: 'stone', shine: 'shine' });
  assert.deepEqual(framePixels(moved(origin.primitives, 16)), framePixels(mid.primitives));
});

test('glint@2 within a generator call keeps to the pixels that call paints (a glint across a generated stone)', () => {
  const stone = registry.runGenerator(GEM);
  const band = registry.runGenerator({ gen: 'glint', v: 2, at: [0, 0], r: 6, phase: 0, width: 0.4, within: [GEM], paint: 'shine' });
  const free = registry.runGenerator({ gen: 'glint', v: 2, at: [0, 0], r: 6, phase: 0, width: 0.4, paint: 'shine' });
  assert.ok(stone.ok && band.ok && free.ok, [...stone.errors, ...band.errors, ...free.errors].join('; '));
  const cells = (prims) => new Set(prims.flatMap((p) => p.rows.flatMap((row, j) => [...row].map((ch, i) => (ch === '.' ? null : `${p.at[0] + i},${p.at[1] + j}`)).filter(Boolean))));
  const s = cells(stone.primitives), b = cells(band.primitives), f = cells(free.primitives);
  assert.ok(b.size > 3, 'the band shows on the stone');
  for (const c of b) assert.ok(s.has(c), `glint pixel ${c} is off the stone`);
  assert.ok(f.size > b.size, 'without `within` the band runs past the stone');
});

test('glint@2 refuses a `within` call it cannot run, and counts its cost', () => {
  const bad = registry.checkCall({ gen: 'glint', v: 2, at: [0, 0], r: 6, within: [{ gen: 'gem.cut', v: 2, at: [0, 0], paint: 'stone', shine: 'shine' }], paint: 'shine' });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /gem\.cut@2\.r: missing/);
  const plain = registry.checkCall({ gen: 'glint', v: 2, at: [0, 0], r: 6, paint: 'shine' });
  const withGem = registry.checkCall({ gen: 'glint', v: 2, at: [0, 0], r: 6, within: [GEM], paint: 'shine' });
  assert.ok(plain.ok && withGem.ok);
  assert.ok(withGem.cost > plain.cost, 'the stone call is charged');
});
