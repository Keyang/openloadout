// The sound quality bar, check added on 2026-11-22 (A-control-choice): a control that changes nothing at the
// defaults is tried again with each choice control (one with `options`) on its other choices before it is called
// dead. The music kit's "Plays along volume" (alongLevel) scales a layer that the default choice of "Plays along"
// (None) leaves silent, so at the defaults it measured 0.0 dB on every track and failed A-control-alive.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSound, THRESHOLDS } from '../../quality/sound.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'quality', 'sounds');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
const has = (list, re) => list.some((m) => re.test(m));
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;
const param = (r, id) => r.metrics.params.find((p) => p.id === id);

// dead-control with a choice "Layer" (None, Hum, Fizz): grit sets the level of the layer, which None leaves silent.
function layered(gritExpr = 'grit') {
  const p = load('dead-control');
  p.params.push({ id: 'layer', label: 'Layer', min: 0, max: 2, default: 0, options: ['None', 'Hum', 'Fizz'] });
  p.nodes.push({ id: 'hum', type: 'osc', wave: 'saw', freq: 'pitch * 0.5' }, { id: 'fizz', type: 'osc', wave: 'square', freq: 'pitch * 3' });
  p.out = `(tone*(1 - buzz) + edge*buzz*0.5 + (layer == 1 ? hum : layer == 2 ? fizz : 0)*${gritExpr}*2)*amp`;
  return p;
}

test('a control that only acts under another choice is measured with that choice, not called dead', () => {
  const r = checkSound(layered());
  const p = param(r, 'grit');
  assert.ok(!has(r.errors, /param 'grit'/), show(r));
  assert.ok(!has(r.warnings, /param 'grit'/), show(r));
  assert.ok(p.heardWith, 'the choice it was heard with is recorded');
  assert.equal(p.heardWith.id, 'layer');
  assert.equal(p.heardWith.value, 2, 'the last choice is tried first');
  assert.equal(p.heardWith.choice, 'Fizz');
  assert.ok(p.heardWith.distanceAtDefaults < THRESHOLDS.deadControlDb);
  assert.ok(p.distance >= THRESHOLDS.audibleChangeDb, `with Fizz it scores ${p.distance} dB`);
  assert.deepEqual(p.flags, []);
});
test('a control that does next to nothing even under the other choice is still warned about', () => {
  const r = checkSound(layered('(0.5 + grit*0.01)'));
  const p = param(r, 'grit');
  assert.ok(p.heardWith && p.distance < THRESHOLDS.audibleChangeDb);
  assert.ok(has(r.warnings, /param 'grit': little audible effect/), show(r));
  assert.ok(!has(r.errors, /param 'grit'/), show(r));
});
test('a control that is dead under every choice is still an error, and a patch with no choices is not rendered more', () => {
  const p = layered("1");
  const r = checkSound(p);
  assert.ok(has(r.errors, /param 'grit': changes nothing/), show(r));
  assert.equal(param(r, 'grit').heardWith, undefined);
  const d = checkSound(load('dead-control'));
  assert.ok(has(d.errors, /param 'grit': changes nothing/), show(d));
  assert.equal(param(d, 'grit').heardWith, undefined);
});
test('controls that are alive at the defaults are not tried under other choices', () => {
  const r = checkSound(layered());
  for (const id of ['pitch', 'length', 'buzz', 'layer']) assert.equal(param(r, id).heardWith, undefined, id);
});
test('with two choice controls each one\'s last choice is tried before any earlier choice', () => {
  const p = layered();
  p.params.splice(p.params.length - 1, 0, { id: 'kind', label: 'Kind', min: 0, max: 3, default: 0, options: ['A', 'B', 'C', 'D'] });
  const r = checkSound(p);
  assert.equal(param(r, 'grit').heardWith.id, 'layer', show(r));
  assert.ok(has(r.errors, /param 'kind': changes nothing/), 'a choice wired to nothing is still dead');
});
test('when the first live choice is under the audible line, the same control\'s other choices are tried and the best kept', () => {
  const p = layered();
  p.out = `(tone*(1 - buzz) + edge*buzz*0.5 + (layer == 1 ? hum*grit*2 : layer == 2 ? fizz*(1 + grit*0.02) : 0))*amp`;   // under Fizz grit barely matters, under Hum it sets the level
  const r = checkSound(p);
  const g = param(r, 'grit');
  assert.equal(g.heardWith.choice, 'Hum', show(r));
  assert.ok(g.distance >= THRESHOLDS.audibleChangeDb);
  assert.ok(g.heardWith.distanceAtDefaults < THRESHOLDS.deadControlDb);
  assert.ok(!has(r.warnings, /param 'grit'/), show(r));
});
