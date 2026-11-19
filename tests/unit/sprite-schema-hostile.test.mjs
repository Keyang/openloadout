// catalog/sprite-schema.js: the plain-data wall for version 2 (docs/data-sprites.md 3.4: JSON text at most 128 KB,
// prototype keys dropped, unknown fields dropped, nesting at most 20) and hostile definitions: each refused or cleaned
// with a plain message, nothing in them ever run, the validator never throwing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite, parseSpriteJson, plainSpriteData, SPRITE_LIMITS } from '../../catalog/sprite-schema.js';
import { stubRegistry, stubPieces } from '../fixtures/v2/registry.mjs';

const text = (n) => fs.readFileSync(new URL(`../fixtures/v2/${n}.json`, import.meta.url), 'utf8');
const load = (n) => JSON.parse(text(n));
const opts = { generators: stubRegistry(), pieces: stubPieces() };
const check = (d, o = opts) => validateSprite(d, o);

test('JSON text: read with prototype keys dropped; over 128 KB or nested over 20 refused before it is parsed', () => {
  const t = text('coin').replace('"name": "Coin"', '"name": "Coin", "__proto__": { "polluted": true }, "constructor": { "prototype": 1 }');
  const r = check(t);
  assert.equal(r.ok, true);
  assert.match(r.warnings.join('\n'), /__proto__/);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(r.value), Object.prototype);
  const huge = text('coin').replace('"blurb": "A spinning gold coin."', `"blurb": "${'x'.repeat(SPRITE_LIMITS.jsonBytes)}"`);
  const h = check(huge);
  assert.equal(h.ok, false);
  assert.match(h.errors[0], /128 KB/);
  const deep = `${'['.repeat(25)}${']'.repeat(25)}`;
  assert.match(check(deep).errors[0], /nested more than 20/);
  assert.match(check('{"format": "loadout-sprite",').errors[0], /not JSON/);
  assert.equal(parseSpriteJson(text('coin')).ok, true);
  assert.equal(parseSpriteJson(42).ok, false);
});

test('a version 2 definition may be up to 128 KB (v1\'s cap is 64 KB)', () => {
  const d = load('coin');
  d.body.pictures.draw.push(...Array.from({ length: 300 }, (_, i) => ({ id: `pad${i}`, kind: 'stamp', on: 'coin', at: [0, 0], rows: Array(4).fill('a'.repeat(32)), key: { a: 'gold' } })));
  const n = JSON.stringify(d).length;
  assert.ok(n > 64 * 1024 && n < 128 * 1024, `the test definition is ${n} characters`);
  assert.equal(check(d).errors.some((e) => /KB/.test(e)), false);
});

test('objects: functions, getters, class instances, loops, holes, undefined, symbols and non-finite numbers refused', () => {
  const cases = [
    [(d) => { d.body.pictures.draw[0].r = () => [5, 5]; }, /function/],
    [(d) => { Object.defineProperty(d, 'name', { get() { throw new Error('ran'); }, enumerable: true }); }, /getter/],
    [(d) => { d.meta = new Map(); }, /Map/],
    [(d) => { d.body.pictures.self = d.body; }, /itself/],
    [(d) => { d.palette = [d.palette[0], , d.palette[1]]; }, /empty place/],
    [(d) => { d.palette.push(undefined); }, /undefined/],
    [(d) => { d.body.pictures.draw[0].z = Infinity; }, /finite/],
    [(d) => { d.body.pictures.draw[0].z = NaN; }, /finite/],
    [(d) => { d.name = Symbol('x'); }, /symbol/],
    [(d) => { d.body.pictures.draw[0].r[0] = 10n; }, /bigint/],
  ];
  for (const [f, re] of cases) {
    const d = load('coin');
    f(d);
    const r = check(d);
    assert.equal(r.ok, false, String(re));
    assert.match(r.errors.join('\n'), re);
  }
  let trapped = false;
  const p = new Proxy(load('coin'), { get(t, k) { trapped = true; return t[k]; } });
  check(p);
  assert.equal(trapped, false, 'a proxy\'s get trap is never run');
});

test('huge lists and too many values are refused without walking them all', () => {
  const d = load('coin');
  d.body.pictures.draw = new Array(1_000_000).fill(0);
  const t0 = Date.now();
  const r = check(d);
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 2000, 'quickly');
  assert.match(r.errors.join('\n'), /values|entries|KB/);
  const many = load('coin');
  many.controls = Array.from({ length: 5000 }, (_, i) => ({ key: `k${i}`, kind: 'range', label: 'K' }));
  assert.equal(check(many).ok, false);
});

test('unknown fields are dropped with a warning naming them; code text in a field is never read as code', () => {
  const d = load('coin');
  d.render = 'function (g) { g.rect(0, 0, 32, 32) }';
  d.body.pictures.draw[0].onDraw = 'alert(1)';
  d.palette[0].formula = 'x * 2';
  const r = check(d);
  assert.equal(r.ok, true);
  assert.match(r.warnings.join('\n'), /render/);
  assert.match(r.warnings.join('\n'), /onDraw/);
  assert.match(r.warnings.join('\n'), /formula/);
  assert.equal(r.value.render, undefined);
  assert.equal(r.value.body.pictures.draw[0].onDraw, undefined);
});

test('ids that every object already has, markup and control characters in text are refused', () => {
  const d = load('coin'); d.body.pictures.nodes[0].id = 'constructor';
  assert.equal(check(d).ok, false);
  const d2 = load('coin'); d2.controls[0].key = 'hasOwnProperty';
  assert.match(check(d2).errors.join('\n'), /every object already has/);
  const d3 = load('coin'); d3.name = 'Coin\u0000';
  assert.match(check(d3).errors.join('\n'), /control or invisible/);
  const d4 = load('coin'); d4.name = '<img src=x onerror=alert(1)>';
  const r4 = check(d4);
  assert.equal(r4.value.name, '<img src=x onerror=alert(1)>', 'text is kept as text, never interpreted; the page shows it with textContent');
});

test('a definition full of junk gets a bounded number of messages, each a plain sentence', () => {
  const d = load('coin');
  d.palette = Array.from({ length: 12 }, () => ({ id: 'Bad Id', default: 'red' }));
  d.controls = Array.from({ length: 48 }, () => ({ key: 9, kind: 'knob' }));
  d.body.pictures.draw = Array.from({ length: 300 }, () => ({ kind: 'nope', paint: 7 }));
  const r = check(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length <= SPRITE_LIMITS.messages + 1, `${r.errors.length} errors`);
  assert.match(r.errors.at(-1), /more/);
  for (const e of r.errors) assert.ok(typeof e === 'string' && e.length < 400, e);
});

test('the validator never throws, whatever it is given', () => {
  const junk = [undefined, null, 0, '', 'x', [], {}, true, () => 1, Symbol('s'), new Date(0), Object.create(null), { format: 'loadout-sprite', version: 2 },
    { format: 'loadout-sprite', version: 2, body: { pictures: null } }, { format: 'loadout-sprite', version: 2, body: { rig: { bones: 'x', shapes: [null] } } },
    { format: 'loadout-sprite', version: 2, body: { tiles: { groups: [{ material: { edges: { top: { bands: [null] } } } }] } } },
    { format: 'loadout-sprite', version: 2, body: { layers: [{ draw: [{ gen: 'ridge', v: 1, litEdge: null }] }] } },
    { format: 'loadout-rig', version: 2 }];
  // and every fixture with one field at a time replaced by something odd
  for (const n of ['coin', 'knight', 'hit-spark', 'ui-button', 'bg-forest', 'tiles-forest']) {
    const base = load(n);
    const paths = [];
    const walk = (x, p) => { if (x && typeof x === 'object') for (const k of Object.keys(x)) { paths.push([...p, k]); walk(x[k], [...p, k]); } };
    walk(base, []);
    paths.forEach((p, i) => {
      const d = load(n);
      let o = d;
      for (const k of p.slice(0, -1)) o = o[k];
      o[p.at(-1)] = [null, -1, 'zz', [], {}, 1e308, [1], { from: 'x' }][i % 8];
      junk.push(d);
    });
  }
  for (const j of junk) {
    let r;
    assert.doesNotThrow(() => { r = validateSprite(j, opts); });
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(Array.isArray(r.errors) && Array.isArray(r.warnings));
    if (!r.ok) assert.equal(r.value, null);
  }
  assert.equal(plainSpriteData(load('coin')).ok, true);
  assert.equal(plainSpriteData(() => 1).ok, false);
});
