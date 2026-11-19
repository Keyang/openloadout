// dataSprite, part 3: hostile input (Contract 14 rule 6: plain data only, capped, nothing in a definition runs).
// A definition handed over as an object (the bag after parsing, window.loadout, the studio page) must get the same
// wall as JSON text, and the top-down `directions` overlay, which catalog/studio-schema.js does not read, must not be
// a way around it. Each test hides the attack deep inside an overlay, where the S1 validator never looks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { types } from 'node:util';
import * as DS from '../../engine/data-sprite.js';

const beetleJson = JSON.parse(fs.readFileSync(new URL('../fixtures/data-sprite/beetle-topdown.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(beetleJson);
const all = (r) => [...r.errors, ...r.warnings].join('\n');

/** Every object and list reachable from v (own data fields only). */
function everything(v, out = []) {
  if (v && typeof v === 'object') { out.push(v); for (const k of Object.keys(v)) everything(Object.getOwnPropertyDescriptor(v, k).value, out); }
  return out;
}

test('data-sprite hostile: a huge overlay given as an object is refused by size, quickly, with few messages', () => {
  const j = clone();
  const shapes = {};
  for (let i = 0; i < 200_000; i++) shapes['x' + i] = { z: 1 };
  j.body.rig.directions.down.shapes = shapes;
  const t0 = Date.now();
  const r = DS.validateDataSprite(j);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length <= DS.MAX_MESSAGES + 1, `${r.errors.length} errors`);
  assert.match(r.errors.join('\n'), /values|KB/);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
});

test('data-sprite hostile: a 10 MB string inside an overlay is refused as too big, as object and as text alike', () => {
  const j = clone();
  j.body.rig.directions.down.shapes.shell = { z: 1, junk: 'x'.repeat(10_000_000) };
  const r = DS.validateDataSprite(j);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /KB/);
  assert.equal(DS.makeDataSprite(j).ok, false);
  assert.throws(() => DS.dataSprite(j), /KB/);
  assert.equal(DS.validateDataSprite(JSON.stringify(j)).ok, false);
});

test('data-sprite hostile: a definition as an object is measured whole, directions included, before anything else', () => {
  // about 70 KB of valid-looking overlay entries for real shape ids: under the value count, over 64 KB
  const j = clone();
  j.body.rig.directions.down.shapes.seam = { points: [[0, 0.5], [9, 0.5], [9, -0.5]], hidden: false };
  for (let i = 0; i < 1500; i++) j.body.rig.directions.up.bones['b' + i] = { angle: 1.234567, length: 2.345678 };
  assert.ok(JSON.stringify(j).length > 64 * 1024);
  const r = DS.validateDataSprite(j);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /KB/);
});

test('data-sprite hostile: a getter deep inside an overlay is refused and never runs', () => {
  let ran = 0;
  const a = clone();
  Object.defineProperty(a.body.rig.directions.down, 'bones', { get() { ran++; return {}; }, enumerable: true });
  const ra = DS.validateDataSprite(a);
  assert.equal(ra.ok, false);
  assert.match(ra.errors.join('\n'), /getter/);
  const b = clone();
  Object.defineProperty(b.body.rig.directions.up.bones.legF, 'angle', { get() { ran++; return 10; }, enumerable: true });
  const rb = DS.validateDataSprite(b);
  assert.equal(rb.ok, false);
  assert.match(rb.errors.join('\n'), /getter/);
  const c = clone();
  Object.defineProperty(c.body.rig.directions.down.shapes.shell.r, 0, { get() { ran++; return 7; }, enumerable: true });
  assert.equal(DS.validateDataSprite(c).ok, false);
  DS.makeDataSprite(a); DS.makeDataSprite(b);
  assert.throws(() => DS.dataSprite(c));
  assert.equal(ran, 0, 'a getter in the definition ran');
});

test('data-sprite hostile: an overlay that is not plain data (Map, class, function, loop) is refused', () => {
  const m = clone();
  m.body.rig.directions.down = Object.assign(new Map(), { bones: {} });
  const rm = DS.validateDataSprite(m);
  assert.equal(rm.ok, false);
  assert.match(rm.errors.join('\n'), /Map|plain data/);

  class Pose { constructor() { this.angle = 3; } }
  const k = clone();
  k.body.rig.directions.down.bones.legF = new Pose();
  assert.match(DS.validateDataSprite(k).errors.join('\n'), /Pose|plain data/);

  const f = clone();
  f.body.rig.directions.down.shapes.eye.z = () => 20;
  assert.match(DS.validateDataSprite(f).errors.join('\n'), /code|function/);

  const l = clone();
  const loop = { z: 1 };
  loop.self = loop;
  l.body.rig.directions.down.shapes.shell = loop;
  assert.match(DS.validateDataSprite(l).errors.join('\n'), /loop|itself/);
});

test('data-sprite hostile: a Proxy as directions is read once into plain data; its get trap never runs, and nothing kept is a Proxy', () => {
  const j = clone();
  let gets = 0;
  j.body.rig.directions = new Proxy(structuredClone(beetleJson.body.rig.directions), { get(t, k) { gets++; return t[k]; } });
  const r = DS.validateDataSprite(j);
  assert.equal(gets, 0, 'the get trap ran');
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(everything(r.value).every((o) => !types.isProxy(o)));
  assert.deepEqual(r.value.body.rig.directions, DS.validateDataSprite(beetleJson).value.body.rig.directions);
  const s = DS.dataSprite(j);
  assert.ok(everything(s.definition).every((o) => !types.isProxy(o)));
});

test('data-sprite hostile: prototype keys inside an overlay object are dropped, never applied', () => {
  const j = clone();
  Object.defineProperty(j.body.rig.directions.down.bones, '__proto__', { value: { polluted: 1 }, enumerable: true });
  const r = DS.validateDataSprite(j);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.match(r.warnings.join('\n'), /__proto__/);
  assert.equal({}.polluted, undefined);
  assert.ok(!Object.hasOwn(r.value.body.rig.directions.down.bones, '__proto__'));
});

test('data-sprite hostile: the lists of errors and warnings are capped, ending with how many more there were', () => {
  const j = clone();
  for (let i = 0; i < 3000; i++) j.body.rig.directions.up.bones['q' + i] = {};
  assert.ok(JSON.stringify(j).length < 64 * 1024);
  const r = DS.validateDataSprite(j);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, DS.MAX_MESSAGES + 1);
  assert.match(r.errors.at(-1), /and \d+ more/);
  for (let i = 0; i < 3000; i++) delete j.body.rig.directions.up.bones['q' + i];
  for (let i = 0; i < 1500; i++) j.body.rig.directions.up.bones.legF['w' + i] = 1;
  const w = DS.validateDataSprite(j);
  assert.equal(w.ok, true, w.errors.join('\n'));
  assert.match(w.warnings.join('\n'), /dropped.*w0.*and \d+ more/);
  assert.ok(w.warnings.every((m) => m.length <= 400), `a warning of ${Math.max(...w.warnings.map((m) => m.length))} characters`);
});

// ---- the overlay meets the same checks as the rig (review of S4, issue 4) ----------------------------------------

test('data-sprite hostile: an overlay root position is clamped per axis, as the rig\'s own is (x to [-W, 2W], y to [-H, 2H])', () => {
  const j = clone();
  j.body.rig.size = [64, 48];
  j.size = [64, 48];
  j.body.rig.directions.down.bones.body.at = [-100, 120];
  const r = DS.validateDataSprite(j);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.value.body.rig.directions.down.bones.body.at, [-64, 96]);
  assert.match(r.warnings.join('\n'), /down.*body.*at/);
});

test('data-sprite hostile: the rig checks of catalog/studio-schema.js also run on each direction as overlaid', () => {
  const j = clone();
  j.body.rig.directions.down.shapes['l-legF'] = { width: 1 };
  j.body.rig.directions.up.shapes.skull = { r: [0.2, 0.2] };
  const r = DS.validateDataSprite(j);
  assert.match(r.warnings.join('\n'), /[Ff]acing down.*l-legF.*1 pixel/);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /[Ff]acing up.*skull.*too thin/);
  // and the beetle as written says nothing extra
  assert.ok(!/[Ff]acing (down|up|side)/.test(all(DS.validateDataSprite(beetleJson))), all(DS.validateDataSprite(beetleJson)));
});
