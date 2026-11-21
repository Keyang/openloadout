// catalog/sprite-schema.js (build item B1, docs/data-sprites.md section 2): every version 1 definition stays valid and
// is read exactly as catalog/studio-schema.js reads it; a v1 bone-rig sprite with its version raised to 2 is a valid v2
// definition too ("v2 extends v1 additively"); a v1 library body is not, in either version: library bodies are gone
// (Contract 15; build item R1), and the two seeded v1 drafts that used one (tests/fixtures/studio/f1-rogue.json and
// waving-hero.json) are refused with the words that tell a person what to do.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite, SPRITE_FORMATS } from '../../catalog/sprite-schema.js';
import { validateStudio } from '../../catalog/studio-schema.js';
import { studioTemplate, STUDIO_TEMPLATE_IDS } from '../../rigs/studio-templates.js';
import { stubRegistry } from '../fixtures/v2/registry.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../fixtures/${p}`, import.meta.url), 'utf8'));
const V1 = {
  'studio/newt': read('studio/newt.json'),
  'studio/newt-rig-doc': read('studio/newt-rig-doc.json'),
  'studio/maximal': read('studio/maximal.json'),
  'data-sprite/beetle-topdown': read('data-sprite/beetle-topdown.json'),
  ...Object.fromEntries(STUDIO_TEMPLATE_IDS.map((id) => [`template/${id}`, studioTemplate(id)])),
};
// saved version 1 drafts that used a library body (the removed path): seeded, never valid
const LIBRARY_BODY_DRAFTS = { 'studio/waving-hero': read('studio/waving-hero.json'), 'studio/f1-rogue': read('studio/f1-rogue.json') };
const opts = { generators: stubRegistry() };
const clone = (x) => JSON.parse(JSON.stringify(x));

test('the formats this file reads: version 2 of both', () => {
  assert.deepEqual({ ...SPRITE_FORMATS }, { 'loadout-sprite': 2, 'loadout-rig': 2 });
});

test('every version 1 definition passes and is cleaned exactly as catalog/studio-schema.js cleans it', () => {
  assert.ok(Object.keys(V1).length >= 12, 'the fixtures and the templates');
  for (const [name, d] of Object.entries(V1)) {
    const want = validateStudio(clone(d));
    const got = validateSprite(clone(d), opts);
    assert.equal(want.ok, true, `${name} is valid v1 (${want.errors.join('; ')})`);
    assert.deepEqual(got.errors, [], name);
    assert.equal(got.ok, true, name);
    assert.equal(got.version, 1, name);
    assert.deepEqual(got.value, want.value, `${name}: same cleaned value`);
    assert.deepEqual(got.warnings, want.warnings, `${name}: same advice`);
    assert.equal(typeof got.cost?.expanded, 'number', `${name}: a cost estimate`);
  }
});

test('a version 1 definition given as JSON text is read the same way', () => {
  const d = V1['studio/newt'];
  assert.deepEqual(validateSprite(JSON.stringify(d), opts).value, validateStudio(JSON.stringify(d)).value);
});

test('version 1 keeps its own rules: what v1 refuses, v1 still refuses, with the same words', () => {
  for (const f of ['hostile-cycle', 'hostile-markup', 'hostile-numbers', 'hostile-proto']) {
    const text = fs.readFileSync(new URL(`../fixtures/studio/${f}.json`, import.meta.url), 'utf8');
    const want = validateStudio(text), got = validateSprite(text, opts);
    assert.equal(got.ok, want.ok, f);
    assert.deepEqual(got.errors, want.errors, f);
  }
  const big = clone(V1['studio/newt']); big.blurb = 'x'.repeat(200); big.meta.words = Array.from({ length: 30 }, (_, i) => `w${i}`);
  big.body.rig.shapes.push(...Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, bone: 'body', kind: 'dot', at: [0, 0], paint: 'skin' })));
  const r = validateSprite(big, opts);
  assert.equal(r.ok, false, 'a v1 rig keeps the v1 cap of 160 shapes');
  assert.deepEqual(r.errors, validateStudio(big).errors);
});

test('every v1 bone-rig sprite and rig with its version raised to 2 is a valid version 2 definition', () => {
  for (const [name, d] of Object.entries(V1)) {
    const v2 = clone(d);
    v2.version = 2;
    const r = validateSprite(v2, opts);
    assert.deepEqual(r.errors, [], name);
    assert.equal(r.ok, true, name);
    assert.equal(r.version, 2, name);
    const v1 = validateStudio(clone(d)).value;
    if (v1.format === 'loadout-sprite') {
      assert.deepEqual(r.value.body.rig.bones, v1.body.rig.bones, `${name}: the same bones`);
      assert.equal(r.value.body.rig.shapes.length, v1.body.rig.shapes.length, `${name}: the same shapes`);
      assert.deepEqual(Object.keys(r.value.clips), Object.keys(v1.clips), `${name}: the same clips`);
      assert.deepEqual(r.value.size, v1.size, name);
      assert.deepEqual(r.value.pivot, v1.pivot, name);
      assert.deepEqual(r.value.controls.map((c) => c.key), v1.controls.map((c) => c.key), `${name}: the same controls`);
    }
  }
});

test('a v1 library body, as saved or raised to version 2, is refused in plain words: library bodies are gone', () => {
  for (const [name, saved] of Object.entries(LIBRARY_BODY_DRAFTS)) {
    const v1 = validateSprite(clone(saved), opts);
    assert.equal(v1.ok, false, name);
    assert.match(v1.errors.join('\n'), /used a library body, which is gone: open the library sprite and edit a copy/, name);
    assert.deepEqual(v1.errors, validateStudio(clone(saved)).errors, `${name}: the version 1 check says the same`);
    const d = clone(saved);
    d.version = 2;
    const r = validateSprite(d, opts);
    assert.equal(r.ok, false, name);
    assert.match(r.errors.join('\n'), /library bod/i, name);
  }
});

test('a version the site does not read yet is refused, never guessed', () => {
  const d = clone(V1['studio/newt']); d.version = 3;
  const r = validateSprite(d, opts);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /newer Loadout/);
  for (const v of [0, 1.5, '2', null]) {
    const e = clone(V1['studio/newt']); e.version = v;
    assert.equal(validateSprite(e, opts).ok, false, String(v));
  }
});
