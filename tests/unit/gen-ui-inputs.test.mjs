// The input-picture port generators of migration batch M9 (engine/gen/ui-inputs.js): key.cap@1, key.wide@1, pad.dpad@1,
// pad.face@1, pad.shoulder@1, mouse@1 and stick@1, each the drawing of one library code sprite (frozen in
// tests/fixtures/code-sprites/) on the engine/inputs*.js helpers ported to paint refs (engine/gen/ports/). Each passes
// the goldens harness here; tests/unit/m9-ui-redraws.test.mjs holds the redraws that name them to their code sprites
// pixel for pixel.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const KEY = { body: 'top', frame: 'side', lit: 'glow' };
const SHOULDER = { body: 'pad', lamp: 'glow', face: 'face', shine: 'shine' };
const CASES = {
  'pad.shoulder': [
    { args: { at: [16, 16], ...SHOULDER } },
    { args: { at: [16, 16], picture: 'press', button: 'trigger', side: 'right', size: 1, ...SHOULDER }, ctx: { frame: 4 } },
    { args: { at: [0, 0], picture: 'press', style: 'angled', lit: false, size: 0, ...SHOULDER }, ctx: { frame: 5 } },
  ],
  'key.cap': [
    { args: { at: [16, 16], ...KEY } },
    { args: { at: [16, 16], picture: 'tap', mark: 'up', size: 1, corner: 0, depth: 1, ...KEY }, ctx: { frame: 4 } },
    { args: { at: [0, 0], picture: 'down', mark: 'left', lights: false, size: 0, ...KEY } },
  ],
  'key.wide': [
    { args: { at: [32, 16], ...KEY } },
    { args: { at: [32, 16], picture: 'tap', shape: 'long', size: 1, ...KEY }, ctx: { frame: 5 } },
    { args: { at: [10, 4], picture: 'down', mark: 'back', corner: 1, depth: 0, ...KEY } },
  ],
  'pad.dpad': [
    { args: { at: [16, 16], body: 'pad', lit: 'glow' } },
    { args: { at: [16, 16], picture: 'press', style: 'rocker', direction: 'all', body: 'pad', lit: 'glow' }, ctx: { frame: 3 } },
    { args: { at: [0, 0], picture: 'press', style: 'round', direction: 'left-right', size: 1, depth: 1, body: 'pad', lit: 'glow' }, ctx: { frame: 4 } },
  ],
  'pad.face': [
    { args: { at: [16, 16], body: 'pad', lit: 'glow' } },
    { args: { at: [16, 16], picture: 'press', button: 'all', size: 1, body: 'pad', lit: 'glow' }, ctx: { frame: 4 } },
    { args: { at: [5, 5], style: 'single', size: 0, depth: 1, body: 'pad', lit: 'glow' } },
  ],
  mouse: [
    { args: { at: [16, 16], body: 'pad', lit: 'glow' } },
    { args: { at: [16, 16], picture: 'show', action: 'middle', cable: true, body: 'pad', lit: 'glow' }, ctx: { frame: 2 } },
    { args: { at: [0, 0], picture: 'show', action: 'move', shape: 'slim', size: 1, body: 'pad', lit: 'glow' }, ctx: { frame: 3 } },
    { args: { at: [16, 16], picture: 'show', action: 'wheel', size: 0, body: 'pad', lit: 'glow' }, ctx: { frame: 6 } },
  ],
  stick: [
    { args: { at: [16, 16], body: 'pad', accent: 'ring', lit: 'glow' } },
    { args: { at: [16, 16], picture: 'move', motion: 'spin', reach: 1, body: 'pad', accent: 'ring', lit: 'glow' }, ctx: { frame: 3 } },
    { args: { at: [0, 0], picture: 'move', motion: 'press', style: 'ridged', size: 1, body: 'pad', accent: 'ring', lit: 'glow' }, ctx: { frame: 4 } },
    { args: { at: [16, 16], picture: 'move', motion: 'left', style: 'flat', size: 0, body: 'pad', accent: 'ring', lit: 'glow' }, ctx: { frame: 2 } },
  ],
};

for (const [id, cases] of Object.entries(CASES)) {
  test(`${id}@1 passes the goldens harness`, () => {
    const entry = registry.generator(id, 1);
    assert.ok(entry, `${id}@1 is registered`);
    assert.equal(entry.family, 'ui');
    checkGeneratorContract(registry, entry, { cases });
  });
}

test('a port draws the same picture wherever it is put, moved by whole pixels', () => {
  const a = registry.runGenerator({ gen: 'key.cap', v: 1, at: [16, 16], mark: 'up', ...KEY }, {}).primitives;
  const b = registry.runGenerator({ gen: 'key.cap', v: 1, at: [3, -7], mark: 'up', ...KEY }, {}).primitives;
  assert.deepEqual(b, a.map((p) => ({ ...p, at: [p.at[0] - 13, p.at[1] - 23] })));
});
