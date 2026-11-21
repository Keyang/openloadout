// Build item R1 (docs/data-sprites.md section 5): the library-body path is removed, and with it the frozen copies of the
// two sprites that were drawn through it (rogue-battler, road-bandit: tests/fixtures/code-sprites/<id>.js). Their redraws
// as data on base:person-side were held to those copies by tests/unit/redraws-m6.test.mjs and redraws-m6b.test.mjs. What
// the copies drew is kept as data instead: tests/fixtures/library-bodies/silhouettes.json holds the silhouette (alpha above
// 0, bit-packed row by row, base64) of every frame of both at their default settings, taken from the copies before they
// went. This test holds the library's sprites to them: the same clips, the same frame size, and the silhouettes overlap
// by at least what redraws-m6.test.mjs asked of every redraw (0.74 on average, 0.4 at the worst frame).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { librarySprite } from '../helpers/library.mjs';

const PINNED = JSON.parse(fs.readFileSync(new URL('../fixtures/library-bodies/silhouettes.json', import.meta.url), 'utf8'));

/** How much of two silhouettes is drawn in both: the overlap over the union. `bits` is the pinned mask, `g` a Surface. */
function overlap(bits, g) {
  let both = 0, either = 0;
  for (let i = 0; i < g.data.length; i++) {
    const p = (bits[i >> 3] >> (i & 7)) & 1, q = g.data[i] >>> 24 ? 1 : 0;
    both += p & q; either += p | q;
  }
  return either ? both / either : 1;
}

test('the fixture is both library-body sprites, every clip and frame, at their frame size', () => {
  assert.deepEqual(Object.keys(PINNED.sprites).sort(), ['road-bandit', 'rogue-battler']);
  for (const [id, s] of Object.entries(PINNED.sprites)) {
    assert.deepEqual(s.size, [64, 64], id);
    const frames = Object.values(s.clips).reduce((n, a) => n + a.length, 0);
    assert.ok(frames >= 40, `${id}: ${frames} frames`);
    for (const a of Object.values(s.clips)) for (const b64 of a) assert.equal(Buffer.from(b64, 'base64').length, 512, id);
  }
});

for (const id of ['rogue-battler', 'road-bandit']) {
  test(`${id}: the data file keeps the clips, the frame size and the silhouettes the library body drew`, async () => {
    const s = await librarySprite(id), pin = PINNED.sprites[id];
    assert.ok(s.definition, `${id} is a data file`);
    assert.deepEqual([...s.size], pin.size, 'the frame size');
    assert.deepEqual(Object.keys(s.clips), Object.keys(pin.clips), 'the same clips, in the same order');
    const p = cleanParams(s, defaultParams(s));
    let sum = 0, n = 0, low = 1, where = '';
    for (const [clip, masks] of Object.entries(pin.clips)) {
      assert.equal(s.clips[clip].frames, masks.length, `${id} ${clip}: the same number of frames`);
      masks.forEach((b64, f) => {
        const o = overlap(Buffer.from(b64, 'base64'), renderFrame(s, clip, f, p));
        sum += o; n++;
        if (o < low) { low = o; where = `${clip} ${f}`; }
      });
    }
    assert.ok(sum / n >= 0.74, `${id}: the silhouettes overlap ${(sum / n).toFixed(2)} on average`);
    assert.ok(low >= 0.4, `${id}: ${where} overlaps the library body's only ${low.toFixed(2)}`);
  });
}
