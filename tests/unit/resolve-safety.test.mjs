// The settings resolver (engine/resolve.js, B4): hostile definitions and settings never throw, never hang and never
// reach the prototype; the module runs unchanged in the browser (no Node imports, no page), uses no clock and no
// randomness; every export says what it is for; and engine/sprite.js cleanParams reads old settings of renamed
// controls (the one addition B4 makes there, docs/data-sprites.md section 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from '../../engine/resolve.js';
import { defineSprite, range, choice, cleanParams } from '../../engine/sprite.js';
import { loadV2, testPieces } from '../fixtures/resolve/helpers.mjs';
import { stubRegistry } from '../fixtures/v2/registry.mjs';

const SRC = fs.readFileSync(new URL('../../engine/resolve.js', import.meta.url), 'utf8');
const store = testPieces();

test('browser-safe and deterministic by construction: no Node imports, no page, no clock, no randomness, no eval', () => {
  const imports = [...SRC.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(imports.length > 0);
  for (const m of imports) assert.ok(m.startsWith('./') || m.startsWith('../'), `${m} is a relative module`);
  for (const bad of [/\bnode:/, /\brequire\(/, /\bwindow\./, /\bdocument\./, /Math\.random/, /Date\.now|new Date/, /performance\.now/, /\beval\(/, /new Function/]) assert.doesNotMatch(SRC, bad);
});

test('every export has a one-line description above it', () => {
  const names = Object.keys(R);
  assert.ok(names.length >= 10);
  for (const n of names) {
    const re = new RegExp(`(\\*/|//[^\\n]*)\\s*\\nexport (?:async )?(?:function|const|let|class) ${n}\\b`);
    assert.match(SRC, re, `${n} has a comment directly above it`);
  }
});

test('hostile definitions are refused or resolved, never thrown, never slow', () => {
  const coin = loadV2('coin');
  const deep = {}; let d = deep; for (let i = 0; i < 5000; i++) { d.x = {}; d = d.x; }
  const cyc = { ...coin }; cyc.self = cyc;
  const getter = { ...coin }; Object.defineProperty(getter, 'body', { get() { throw new Error('ran'); }, enumerable: true });
  const bad = [null, undefined, 3, 'text', [], {}, deep, cyc, getter, JSON.parse('{"__proto__": {"polluted": 1}, "format": "loadout-sprite", "version": 2}'),
    { ...coin, version: 9 }, { ...coin, body: { pictures: { draw: Array(5000).fill({ kind: 'dot', at: [0, 0], paint: 'gold' }) } } },
    JSON.stringify(coin), 'x'.repeat(300000)];
  for (const b of bad) {
    const t0 = performance.now();
    let r;
    assert.doesNotThrow(() => { r = R.resolveSprite(b, {}, { generators: stubRegistry(), pieces: store }); });
    assert.ok(performance.now() - t0 < 2000, 'quick');
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(Array.isArray(r.errors));
    if (!r.ok) assert.ok(r.errors.length > 0);
  }
  assert.equal(({}).polluted, undefined);
  const text = R.resolveSprite(JSON.stringify(coin), {}, { generators: stubRegistry(), pieces: store });
  assert.equal(text.ok, true, 'JSON text is read through the wall');
});

test('hostile settings with a good definition resolve at the defaults where they are bad', () => {
  const coin = loadV2('coin');
  const good = R.resolveSprite(coin, {}, { generators: stubRegistry() });
  for (const s of [null, 'x', [1], { size: NaN }, { size: Infinity }, { size: { valueOf() { throw new Error('ran'); } } }, JSON.parse('{"__proto__": {"size": 1}}')]) {
    const r = R.resolveSprite(coin, s, { generators: stubRegistry() });
    assert.equal(r.ok, true, r.errors.join('; '));
    assert.equal(JSON.stringify(r.body), JSON.stringify(good.body));
  }
});

test('a definition that is trusted (validated: true) is still walked within caps', () => {
  const coin = loadV2('coin');
  const huge = { ...coin, body: { pictures: { nodes: coin.body.pictures.nodes, draw: Array.from({ length: 20000 }, () => ({ kind: 'dot', at: [0, 0], paint: 'gold' })) } } };
  const r = R.resolveSprite(huge, {}, { generators: stubRegistry(), validated: true });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /most/);
  const nested = { ...coin, body: { pictures: { nodes: coin.body.pictures.nodes, draw: [] } } };
  let o = nested.body.pictures; for (let i = 0; i < 200; i++) { o.more = {}; o = o.more; }
  const n = R.resolveSprite(nested, {}, { generators: stubRegistry(), validated: true });
  assert.equal(n.ok, false);
  assert.match(n.errors.join(' '), /deep/);
});

test('engine/sprite.js cleanParams: a sprite-level was: { controls } opens old settings under the new key', () => {
  const s = defineSprite({
    id: 'renamed', name: 'Renamed', size: [8, 8], pivot: [4, 8], clips: { idle: { frames: 1, fps: 1 } }, render() {},
    params: { swordLength: range('Blade', 0.5), headgear: choice('Headgear', 'helmet', ['none', 'helmet'], { was: { 'plumed helmet': 'helmet' } }) },
  });
  s.was = { controls: { bladeLength: 'swordLength', hat: 'headgear' } };
  const p = cleanParams(s, { bladeLength: 0.9, hat: 'plumed helmet' });
  assert.equal(p.swordLength, 0.9);
  assert.equal(p.headgear, 'helmet');
  assert.equal(cleanParams(s, { bladeLength: 0.9, swordLength: 0.1 }).swordLength, 0.1, 'the new key wins');
  const plain = defineSprite({ id: 'plain', name: 'P', size: [8, 8], pivot: [4, 8], clips: { idle: { frames: 1, fps: 1 } }, render() {}, params: { a: range('A', 0.5) } });
  assert.deepEqual(cleanParams(plain, { a: 0.2 }), { a: 0.2 }, 'a sprite with no was is as before');
  s.was = { controls: JSON.parse('{"__proto__": "swordLength", "x": "nothing"}') };
  assert.doesNotThrow(() => cleanParams(s, { x: 1 }));
});

test('the cap on values walked holds when no list is too long and nothing is nested too deep', () => {
  const { values, list, depth } = R.RESOLVE_LIMITS;
  const coin = loadV2('coin');
  const per = 3900;                                    // each list under the list cap; nesting 4 deep, far under the depth cap
  assert.ok(per < list && 4 < depth);
  // 128 KB of JSON (the plain-data wall of catalog/sprite-schema.js) holds about 65,000 values at most: lists of zeros get there.
  const withLists = (n) => {
    const pictures = { ...coin.body.pictures };
    for (let i = 0; i < n; i++) pictures[`z${i.toString(36)}`] = Array(per).fill(0);
    return { ...coin, body: { pictures } };
  };
  const walked = (x) => (x !== null && typeof x === 'object' ? 1 + Object.values(x).reduce((s, v) => s + walked(v), 0) : 1);
  const over = withLists(16);
  assert.ok(walked(over.body) > values, `${walked(over.body)} values in the body, over the cap of ${values}`);
  assert.ok(JSON.stringify(over).length < 128 * 1024, 'inside the 128 KB wall, so the resolver\'s own cap is what stops it');
  const t0 = performance.now();
  const r = R.resolveSprite(over, {}, { generators: stubRegistry(), pieces: store, validated: true });
  assert.ok(performance.now() - t0 < 2000, 'quick');
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, [`the definition holds more than ${values} values to work out; at most ${values}`]);
  const under = withLists(14);
  assert.ok(walked(under.body) < values);
  const ok = R.resolveSprite(under, {}, { generators: stubRegistry(), pieces: store, validated: true });
  assert.equal(ok.ok, true, ok.errors.join('; '));
  assert.equal(ok.body.pictures.z0.length, per);
});
