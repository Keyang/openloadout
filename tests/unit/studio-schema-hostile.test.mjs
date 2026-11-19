// catalog/studio-schema.js: hostile input (docs/studio.md, section 6). No data may pollute prototypes, hang the
// validator, sneak code or markup through, or make it throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateStudio, validateStudioSprite, validateStudioRig, parseStudioJson, STUDIO_LIMITS as L } from '../../catalog/studio-schema.js';

const text = (name) => fs.readFileSync(new URL(`../fixtures/studio/${name}.json`, import.meta.url), 'utf8');
const newt = () => JSON.parse(text('newt'));
const errs = (r) => r.errors.join('\n').toLowerCase();

/** every key anywhere in a value */
function allKeys(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { out.add(k); allKeys(v[k], out); }
  return out;
}

test('prototype keys in the text are dropped everywhere and pollute nothing', () => {
  const r = validateStudio(text('hostile-proto'));
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(({}).isAdmin, undefined);
  const keys = allKeys(r.value);
  for (const k of ['__proto__', 'constructor', 'prototype', 'polluted']) assert.ok(!keys.has(k), `no "${k}" key in the value`);
  assert.deepEqual(Object.keys(r.value.clips), ['idle']);
  assert.deepEqual(r.value.parts, {});
  assert.equal(Object.getPrototypeOf(r.value), Object.prototype);
});

test('prototype keys in an object (own properties, as JSON.parse makes them) are dropped too', () => {
  const d = JSON.parse(text('hostile-proto'));
  assert.ok(Object.hasOwn(d, '__proto__'));
  const r = validateStudioSprite(d);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(!allKeys(r.value).has('__proto__'));
  assert.equal(({}).polluted, undefined);
});

test('parseStudioJson: the reviver drops the keys and reports it', () => {
  const r = parseStudioJson('{"a":1,"__proto__":{"x":1},"b":{"constructor":2,"prototype":3,"c":4}}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { a: 1, b: { c: 4 } });
  assert.match(r.warnings.join('\n'), /3/);
  const bad = parseStudioJson('{"a":');
  assert.equal(bad.ok, false);
  assert.match(errs(bad), /not json|could not be read/);
  assert.equal(parseStudioJson(42).ok, false);
});

test('ids that would be prototype names are refused, not silently lost', () => {
  for (const id of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
    const d = newt(); d.body.rig.bones.push({ id, parent: 'body', angle: 0, length: 2 });
    const r = validateStudioSprite(d);
    assert.equal(r.ok, false, id);
    assert.ok(r.errors.join('\n').includes(id));
  }
});

test('text over 64 KB is refused before it is parsed, quickly, even at 10 MB', () => {
  const big = '{"format":"loadout-sprite","pad":"' + 'x'.repeat(10 * 1024 * 1024) + '"}';
  const t0 = performance.now();
  const r = validateStudio(big);
  assert.ok(performance.now() - t0 < 100, 'refused within 100 ms');
  assert.equal(r.ok, false);
  assert.match(errs(r), /64 kb/);
  const just = '{"format":"loadout-sprite","pad":"' + 'é'.repeat(33000) + '"}';    // under 64 K characters, over 64 KB as UTF-8
  assert.ok(just.length < L.jsonBytes);
  assert.match(errs(validateStudio(just)), /64 kb/);
});

test('an object over 64 KB as JSON is refused too', () => {
  const d = newt(); d.blurb = 'x'.repeat(70 * 1024);
  const r = validateStudioSprite(d);
  assert.equal(r.ok, false);
  assert.match(errs(r), /64 kb/);
});

test('deep nesting is refused without a stack overflow', () => {
  const deep = '{"format":"loadout-sprite","x":' + '['.repeat(20000) + ']'.repeat(20000) + '}';
  assert.ok(deep.length < L.jsonBytes);
  const r = validateStudio(deep);
  assert.equal(r.ok, false);
  assert.match(errs(r), /nested/);
  let o = {}; const root = o;
  for (let i = 0; i < 5000; i++) { o.x = {}; o = o.x; }
  const r2 = validateStudioSprite({ ...newt(), blurb: root });
  assert.equal(r2.ok, false);
  assert.match(errs(r2), /nested/);
});

test('numbers: infinity is refused, huge finite numbers are clamped', () => {
  const r = validateStudio(text('hostile-numbers'));
  assert.equal(r.ok, false);
  assert.match(errs(r), /inf/);
  assert.match(errs(r), /number/);
  const d = JSON.parse(text('hostile-numbers'));
  d.bones.pop();                                     // the infinite one
  const ok = validateStudioRig(d);
  assert.equal(ok.ok, true, ok.errors.join('\n'));
  const [b] = ok.value.bones, [s] = ok.value.shapes;
  assert.deepEqual(b.at, [96, -48]);
  assert.equal(b.angle, 720);
  assert.equal(b.length, 48);
  assert.equal(s.z, -100);
  assert.deepEqual(s.r, [32, 32]);
  assert.equal(s.from, 0); assert.equal(s.to, 1);
  for (const v of [NaN, Infinity, -Infinity]) {
    const x = newt(); x.body.rig.bones[1].angle = v;
    assert.equal(validateStudioSprite(x).ok, false, String(v));
  }
});

test('cycles: bones whose parents loop are refused', () => {
  const r = validateStudio(text('hostile-cycle'));
  assert.equal(r.ok, false);
  const e = errs(r);
  assert.match(e, /loop/);
  assert.ok(e.includes('"a"') && e.includes('"self"'));
});

test('cycles: an object that contains itself is refused', () => {
  const d = newt(); d.meta.self = d.meta;
  const r = validateStudioSprite(d);
  assert.equal(r.ok, false);
  assert.match(errs(r), /itself|loop/);
  const shared = newt(); const xs = [1, 2]; shared.body.rig.bones[0].at = xs; shared.body.rig.points[0].at = xs;
  assert.equal(validateStudioSprite(shared).ok, true, 'the same array used twice is not a loop');
});

test('functions, symbols, big integers, dates, class instances and getters are refused: a definition is data', () => {
  const cases = [
    (d) => { d.clips.walk.render = () => 1; },
    (d) => { d.blurb = Symbol('x'); },
    (d) => { d.body.rig.bones[0].length = 10n; },
    (d) => { d.made.at = new Date(0); },
    (d) => { d.body.rig.colours[0] = new (class Slot { constructor() { this.id = 'skin'; this.label = 'Skin'; this.default = '#4f9d57'; } })(); },
    (d) => { d.body.rig.colours = new Map(); },
    (d) => { Object.defineProperty(d, 'name', { get() { throw new Error('boom'); }, enumerable: true }); },
    (d) => { d.clips.walk.keys[0].bones = new Proxy({}, { ownKeys() { throw new Error('trap'); } }); },
    (d) => { d.body.rig.bones.push(undefined); },
  ];
  for (const [i, f] of cases.entries()) {
    const d = newt(); f(d);
    let r;
    assert.doesNotThrow(() => { r = validateStudioSprite(d); }, `case ${i}`);
    assert.equal(r.ok, false, `case ${i} should be refused`);
  }
});

test('markup in text is kept as text (shown with textContent), control characters are refused', () => {
  const d = JSON.parse(text('hostile-markup'));
  const r = validateStudioRig(d);
  assert.equal(r.ok, false);
  assert.match(errs(r), /control|invisible/);
  d.bones[0].label = 'Bone';
  const ok = validateStudioRig(d);
  assert.equal(ok.ok, true, ok.errors.join('\n'));
  assert.equal(ok.value.name, '<img src=x onerror=alert(1)>');
  assert.equal(ok.value.colours[0].label, '<b>Colour</b>');
});

test('over-count lists are refused without walking them all', () => {
  const d = newt();
  d.body.rig.shapes = Array.from({ length: 100000 }, (_, i) => ({ id: `s${i}`, bone: 'body', kind: 'dot', at: [0, 0], size: 1, paint: 'eye' }));
  const t0 = performance.now();
  const r = validateStudioSprite(d);
  assert.ok(performance.now() - t0 < 500);
  assert.equal(r.ok, false);
});

test('fuzz: a thousand random mutations of the newt never throw and always answer in the right shape', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const junk = [null, true, false, 0, -1, 1e9, -1e9, 0.5, '', 'x', '#zzzzzz', [], {}, [null], [1, 2, 3], { a: 1 }, 'constructor', '__proto__', 'x'.repeat(500)];
  const paths = (v, at = [], out = []) => {
    if (v && typeof v === 'object') for (const k of Object.keys(v)) { out.push([...at, k]); paths(v[k], [...at, k], out); }
    return out;
  };
  const base = newt(), all = paths(base);
  for (let n = 0; n < 1000; n++) {
    const d = newt();
    for (let m = 0; m < 1 + Math.floor(rnd() * 3); m++) {
      const p = all[Math.floor(rnd() * all.length)];
      let o = d;
      for (const k of p.slice(0, -1)) o = o?.[k];
      if (o && typeof o === 'object') {
        if (rnd() < 0.2) delete o[p.at(-1)];
        else o[p.at(-1)] = junk[Math.floor(rnd() * junk.length)];
      }
    }
    let r;
    assert.doesNotThrow(() => { r = validateStudioSprite(d); });
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(Array.isArray(r.errors) && Array.isArray(r.warnings));
    if (r.ok) { assert.ok(r.value && typeof r.value === 'object'); assert.equal(r.errors.length, 0); }
    else { assert.equal(r.value, null); assert.ok(r.errors.length > 0); }
  }
});

test('the value of a valid definition validates again to itself (a fixed point)', () => {
  for (const name of ['newt', 'waving-hero', 'maximal', 'hostile-proto']) {
    const a = validateStudio(text(name));
    assert.equal(a.ok, true, `${name}: ${a.errors.join('\n')}`);
    const b = validateStudio(a.value);
    assert.equal(b.ok, true);
    assert.deepEqual(b.value, a.value, name);
    // what was cleaned is not reported again; only advice (a missing speed control, say) can remain
    for (const w of b.warnings) assert.ok(a.warnings.includes(w), `${name}: new warning on the cleaned copy: ${w}`);
    assert.ok(!b.warnings.some((w) => /kept as|dropped|removed/i.test(w)), `${name}: the cleaned copy needs no more cleaning`);
  }
});
