// engine/data-sprite.js, version 2 (build item B6): which bodies are drawn yet, version 1 untouched, the wall.
// tiles, layers, panel and emitters bodies are refused with a message naming the build item that draws them
// (docs/data-sprites.md section 9: B15, B14, B13, B12), after the definition itself has passed its check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as DS from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { loadV2, testPieces } from '../fixtures/resolve/helpers.mjs';
import { stubRegistry } from '../fixtures/v2/registry.mjs';

const OPTS = { pieces: testPieces(), generators: stubRegistry() };

test('bodies not drawn yet are refused, naming their build item', () => {
  assert.deepEqual({ ...DS.NOT_BUILT_BODIES }, { tiles: 'B15', layers: 'B14', panel: 'B13', emitters: 'B12' });
  for (const [name, item, body] of [['tiles-forest', 'B15', 'tiles'], ['bg-forest', 'B14', 'layers'], ['ui-button', 'B13', 'panel'], ['hit-spark', 'B12', 'emitters']]) {
    const r = DS.makeDataSprite(loadV2(name), OPTS);
    assert.equal(r.ok, false, name);
    assert.equal(r.sprite, null);
    assert.equal(r.errors.length, 1, `${name}: ${r.errors.join('; ')}`);
    assert.match(r.errors[0], new RegExp(`${body}.*not built yet.*${item}`), name);
    assert.throws(() => DS.dataSprite(loadV2(name), OPTS), new RegExp(item));
  }
});

test('a version 2 definition that fails its check reports the check\'s errors, not the body', () => {
  const bad = loadV2('hit-spark');
  bad.palette[0].default = 'red';
  const r = DS.makeDataSprite(bad, OPTS);
  assert.equal(r.ok, false);
  assert.ok(!r.errors.some((e) => /not built yet/.test(e)), r.errors.join('; '));
});

test('version 1 definitions take the version 1 path, unchanged', () => {
  const newt = JSON.parse(fs.readFileSync(new URL('../fixtures/studio/newt.json', import.meta.url), 'utf8'));
  const s = DS.dataSprite(newt);
  assert.equal(s.definition.version, 1);
  assert.equal(typeof s.render, 'function');
  const g = renderFrame(s, s.preview, 0, defaultParams(s));
  assert.ok(g.data.some((v) => v >>> 24));
  assert.equal(DS.validateDataSprite(newt).ok, true);
  assert.equal(typeof DS.framePose, 'function');
  assert.equal(typeof DS.drawOptions, 'function');
  assert.equal(DS.MAX_MESSAGES, 50);
});

test('the wall: hostile version 2 input is refused, never run', () => {
  const ran = [];
  const getter = loadV2('coin');
  Object.defineProperty(getter, 'name', { get() { ran.push('getter'); return 'Coin'; }, enumerable: true });
  for (const input of [
    getter,
    { ...loadV2('coin'), body: { pictures: { draw: [{ kind: 'dot', at: [1, 1], paint: 'gold', run: () => ran.push('fn') }] } } },
    '{ "format": "loadout-sprite", "version": 2, "id": "x", ',
    { ...loadV2('coin'), version: 3 },
    null, 42, 'x'.repeat(200 * 1024),
  ]) {
    const r = DS.makeDataSprite(input, OPTS);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  }
  assert.deepEqual(ran, []);
});
