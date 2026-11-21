// catalog/studio-schema.js where it meets other modules: the default pivot (rigs/bones.js groundOf), meta that feeds the catalogue, the value budget, bone lengths for IK (engine/motion.js ik2), shared tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as S from '../../catalog/studio-schema.js';
import { groundOf } from '../../rigs/bones.js';

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${name}.json`, import.meta.url), 'utf8'));
const newt = () => load('newt');
const errs = (r) => r.errors.join('\n').toLowerCase();
const warnText = (r) => r.warnings.join('\n').toLowerCase();

// ---- the default pivot ------------------------------------------------------------------------------------------

test('the default pivot of every frame size stands on the row rigs/bones.js plants feet on', () => {
  for (const [w, h] of S.FRAME_SIZES) {
    const p = S.defaultPivot([w, h]);
    assert.equal(p[1], groundOf({ size: [w, h] }), `${w}x${h}`);
    assert.ok(Number.isInteger(p[0]) && p[0] > 0 && p[0] < w, `${w}x${h} x`);
    assert.deepEqual(S.STUDIO_PIVOTS[`${w}x${h}`], p, `${w}x${h} table`);
  }
});

test('the default pivot x is the style guide\'s for the sizes it lists, else the middle', () => {
  const want = { '16x16': 8, '32x32': 16, '32x48': 16, '32x64': 16, '48x48': 24, '64x48': 28, '64x64': 28, '64x80': 32, '96x96': 44, '128x96': 56, '96x64': 48 };
  for (const [k, x] of Object.entries(want)) assert.equal(S.STUDIO_PIVOTS[k][0], x, k);
  assert.deepEqual(S.STUDIO_PIVOTS['64x64'], [28, 58]);
  assert.deepEqual(S.STUDIO_PIVOTS['64x48'], [28, 43]);
  assert.deepEqual(S.STUDIO_PIVOTS['32x32'], [16, 28]);
});

test('a bone rig with no pivot gets the default of its size; a thing that does not stand gets the frame centre', () => {
  const d = newt(); delete d.pivot;
  assert.deepEqual(S.validateStudioSprite(d).value.pivot, [24, 42]);
  const f = newt(); delete f.pivot; f.grounded = false;
  assert.deepEqual(S.validateStudioSprite(f).value.pivot, [24, 24]);
  assert.deepEqual(S.defaultPivot([48, 48], false), [24, 24]);
  const given = newt(); given.pivot = [20, 40];
  assert.deepEqual(S.validateStudioSprite(given).value.pivot, [20, 40]);
});

// ---- meta: a draft may have gaps, never bad values ------------------------------------------------------------

test('journey (a): a new draft whose meta is only type, role and view passes without strict, with advice', () => {
  const d = newt(); d.meta = { type: 'creature', role: 'characters/enemy', view: 'side' };
  const r = S.validateStudioSprite(d);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(warnText(r).includes('themes'));
  assert.deepEqual(r.value.meta, { type: 'creature', role: 'characters/enemy', view: 'side' });
  assert.equal(S.validateStudioSprite(d, { strict: true }).ok, false, 'strict is the library file\'s bar');
});

test('meta type, role, view and license: control or invisible characters are refused in every mode', () => {
  for (const [k, v] of [['type', 'crea‮ture'], ['role', 'characters/​enemy'], ['view', 'side\u0000'], ['license', 'dr⁦aft']]) {
    const d = newt(); d.meta[k] = v;
    const r = S.validateStudioSprite(d);
    assert.equal(r.ok, false, `${k} ${JSON.stringify(v)}`);
    assert.ok(errs(r).includes('invisible'), errs(r));
  }
});

test('meta values that are present but not in Contract 1\'s lists are errors in every mode, not advice', () => {
  const cases = [['type', 'a‮b'], ['type', 'dragon'], ['role', '<img src=x onerror=alert(1)>'], ['role', 'characters/boss-of-all'],
    ['view', 'sideways'], ['license', 'cc0'], ['themes', ['forest', 'javascript:alert(1)']], ['gameTypes', ['mmo']]];
  for (const [k, v] of cases) {
    const d = newt(); d.meta[k] = v;
    const r = S.validateStudioSprite(d);
    assert.equal(r.ok, false, `${k} ${JSON.stringify(v)} should be refused`);
    assert.ok(errs(r).includes(k.toLowerCase()), errs(r));
    assert.equal(S.validateStudioSprite(d, { strict: true }).ok, false);
  }
  const ok = S.validateStudioSprite(newt());
  assert.equal(ok.ok, true, ok.errors.join('\n'));
});

// ---- the value budget ---------------------------------------------------------------------------------------------
// The messages are the guard: with both budget checks removed, both tests fail (the second on its message and its time).

test('the 40,000-value budget: many small lists that add up are refused, quickly, by the budget', () => {
  const d = newt();
  d.junk = Array.from({ length: 30 }, () => Array.from({ length: 2000 }, () => 0));   // 60,000 values, no list over the cap
  const t0 = performance.now();
  const r = S.validateStudioSprite(d);
  assert.ok(performance.now() - t0 < 100, `took ${performance.now() - t0} ms`);   // cold, about 15-45 ms; 250 ms without the budget
  assert.equal(r.ok, false);
  assert.ok(errs(r).includes('40,000 values'), errs(r));
});

test('the budget: one list longer than the budget is refused before it is walked', () => {
  const d = newt();
  d.body.rig.shapes = Array.from({ length: 100000 }, (_, i) => ({ id: `s${i}`, bone: 'body', kind: 'dot', at: [0, 0], size: 1, paint: 'eye' }));
  const t0 = performance.now();
  const r = S.validateStudioSprite(d);
  assert.ok(performance.now() - t0 < 100, `took ${performance.now() - t0} ms`);   // cold, about 15-45 ms; 250 ms without the budget
  assert.equal(r.ok, false);
  assert.ok(errs(r).includes('100000 entries') && errs(r).includes('cannot fit in 64 kb'), errs(r));
});

// ---- bone lengths -------------------------------------------------------------------------------------------------

test('a bone is at least 1 px long, so a two-bone IK chain can always be solved', () => {
  const r = newt().body.rig;
  r.bones.find((b) => b.id === 'thighF').length = 0;
  r.bones.find((b) => b.id === 'shinF').length = 0.2;
  const v = S.validateStudioRig(r);
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.ok(warnText(v).includes('kept as 1'), warnText(v));
  assert.equal(v.value.bones.find((b) => b.id === 'thighF').length, 1);
  assert.equal(v.value.bones.find((b) => b.id === 'shinF').length, 1);
  assert.equal(S.validateStudioRig(v.value).warnings.some((w) => /length/.test(w)), false, 'the cleaned copy is clean');
});

// ---- shared tables cannot be changed by an importer ---------------------------------------------------------------

test('RESERVED_IDS is frozen, and changing it could not weaken the check anyway', () => {
  assert.ok(Object.isFrozen(S.RESERVED_IDS));
  for (const r of ['constructor', 'prototype', 'toString', '__proto__']) assert.ok(S.RESERVED_IDS.includes(r), r);
  assert.throws(() => { S.RESERVED_IDS.length = 0; });
  assert.throws(() => { S.RESERVED_IDS.pop(); });
  const r = newt().body.rig; r.bones[0].id = 'constructor';
  assert.equal(S.validateStudioRig(r).ok, false);
});

test('every exported table is frozen', () => {
  for (const [k, v] of Object.entries(S)) if (v && typeof v === 'object' && !(v instanceof RegExp)) assert.ok(Object.isFrozen(v), k);
});
