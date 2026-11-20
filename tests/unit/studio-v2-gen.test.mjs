// The studio's generator calls (build item B17; docs/data-sprites.md section 3): which generators each place offers,
// a new call with a starting value for every argument it needs (from the registry's documented types, never code),
// and how each argument type is edited (number, whole number, word, on/off, paint, paints, point, or the field tree).
//   node --test tests/unit/studio-v2-gen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite } from '../../catalog/sprite-schema.js';
import * as G from '../../app/studio/v2-gen.js';

const COIN = JSON.parse(fs.readFileSync(new URL('../fixtures/v2/coin.json', import.meta.url), 'utf8'));

test('each place offers the families the validator takes there', () => {
  const fam = (place) => new Set(G.generatorsFor(place).map((g) => g.family));
  assert.deepEqual([...fam('motion')], ['motion']);
  assert.deepEqual([...fam('emitter')], ['fx']);
  const draw = fam('draw');
  for (const f of ['motion', 'fx', 'layout', 'colour', 'ui']) assert.equal(draw.has(f), false, f);
  for (const f of ['shape', 'shine', 'icon', 'place']) assert.equal(draw.has(f), true, f);
  const one = G.generatorsFor('draw').find((g) => g.id === 'glint' && g.v === 2);
  assert.equal(one.key, 'glint@2');
  assert.equal(typeof one.about, 'string');
  assert.equal(one.args.paint.type, 'paint');
});

test('the newest version of each generator comes first, and old versions are still offered', () => {
  const glints = G.generatorsFor('draw').filter((g) => g.id === 'glint').map((g) => g.v);
  assert.deepEqual(glints, [2, 1]);
});

test('how each argument type is edited', () => {
  assert.deepEqual(G.argInput({ type: 'px', lo: 1, hi: 32 }), { input: 'number', min: 1, max: 32, step: 0.5, binding: true });
  assert.deepEqual(G.argInput({ type: 'share', lo: 0, hi: 1 }), { input: 'number', min: 0, max: 1, step: 0.05, binding: true });
  assert.deepEqual(G.argInput({ type: 'count', lo: 0, hi: 9 }), { input: 'number', min: 0, max: 9, step: 1, binding: true });
  assert.deepEqual(G.argInput({ type: 'seed', lo: 0, hi: 9999 }), { input: 'number', min: 0, max: 9999, step: 1, binding: true });
  assert.deepEqual(G.argInput({ type: 'angle', lo: -720, hi: 720 }), { input: 'number', min: -720, max: 720, step: 1, binding: true });
  assert.deepEqual(G.argInput({ type: 'word', values: ['a', 'b'] }), { input: 'word', options: ['a', 'b'], binding: true });
  assert.deepEqual(G.argInput({ type: 'flag' }), { input: 'flag', binding: true });
  assert.deepEqual(G.argInput({ type: 'paint' }), { input: 'paint', binding: true });
  assert.deepEqual(G.argInput({ type: 'paints', n: 4 }), { input: 'paints', most: 4, binding: true });
  assert.deepEqual(G.argInput({ type: 'point', lo: -640, hi: 640 }), { input: 'point', min: -640, max: 640, step: 0.5, binding: true });
  for (const t of ['shape', 'place', 'primitives', 'struct', 'profile']) assert.equal(G.argInput({ type: t }).input, 'tree', t);
  assert.equal(G.argInput({ type: 'nonsense' }).input, 'tree');
});

test('a starting value for every type passes the registry\'s own check', () => {
  const types = [
    { type: 'px', lo: 1, hi: 32 }, { type: 'px', lo: -2, hi: 2 }, { type: 'share', lo: 0, hi: 1 }, { type: 'count', lo: 3, hi: 9 },
    { type: 'angle', lo: -720, hi: 720 }, { type: 'seed', lo: 0, hi: 9999 }, { type: 'word', values: ['x', 'y'] }, { type: 'flag' },
    { type: 'paint' }, { type: 'paints', n: 3 }, { type: 'point', lo: -640, hi: 640 },
  ];
  const ctx = { paints: ['gold', 'gold.light'], frame: [32, 32], onNode: true };
  const v = types.map((t) => G.starterArg(t, ctx));
  assert.deepEqual(v, [4, 0, 0.5, 3, 0, 1, 'x', false, 'gold', ['gold'], [0, 0]]);
  assert.deepEqual(G.starterArg({ type: 'point', lo: -640, hi: 640 }, { ...ctx, onNode: false }), [16, 16]);
  assert.deepEqual(G.starterArg({ type: 'point', lo: 1, hi: 32 }, ctx), [4, 4], 'a size written as a point');
  assert.deepEqual(G.starterArg({ type: 'primitives' }, ctx), []);
  assert.equal(G.starterArg({ type: 'shape' }, ctx).kind, 'rect');
  assert.equal(G.starterArg({ type: 'place' }, ctx).kind, 'dot');
});

test('a new call names the generator and version and gives only the arguments it needs', () => {
  const g = G.generatorsFor('draw').find((x) => x.key === 'glint@2');
  const call = G.newCall(g, { on: 'coin', paints: ['gold', 'gold.light'], frame: [32, 32] });
  assert.equal(call.gen, 'glint');
  assert.equal(call.v, 2);
  assert.equal(call.on, 'coin');
  for (const [k, t] of Object.entries(g.args)) assert.equal(k in call, !t.optional, k);
});

test('every generator a picture may draw gets a new call the validator takes in the coin', () => {
  const failed = [];
  for (const key of ['glint@2', 'gleam@1', 'star@1', 'gem.cut@2', 'icon.line@2']) {
    const g = G.generatorsFor('draw').find((x) => x.key === key);
    if (!g) { failed.push(`${key}: not offered`); continue; }
    const def = JSON.parse(JSON.stringify(COIN));
    def.body.pictures.draw = def.body.pictures.draw.filter((d) => !d.gen);
    def.palette = def.palette.filter((s) => s.id !== 'light');      // painted only by the glint taken out
    def.controls = def.controls.filter((c) => c.key === 'size' || c.key === 'speed');
    def.body.pictures.motion = [];
    def.body.pictures.draw.push(G.newCall(g, { on: 'coin', paints: ['gold', 'gold.light', 'light'], frame: [32, 32] }));
    const v = validateSprite(def);
    if (!v.ok) failed.push(`${key}: ${v.errors[0]}`);
  }
  assert.deepEqual(failed, []);
});

test('optional arguments are listed with their defaults; a value set back to its default can be left out', () => {
  const g = G.generatorsFor('draw').find((x) => x.key === 'glint@2');
  const rows = G.argRows(g, { gen: 'glint', v: 2, at: [0, 0], r: 4, paint: 'gold', slant: 0.5 });
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(by.at.set, true);
  assert.equal(by.slant.set, true);
  assert.equal(by.slant.isDefault, true);
  assert.equal(by.phase.set, false);
  assert.equal(by.phase.default, 0);
  assert.ok(by.paint.about);
});

test('a number argument is bound to a control by a two-point table, never a formula', () => {
  const b = G.bindTo('size', { type: 'px', lo: 1, hi: 32 }, 4);
  assert.deepEqual(b, { from: 'size', map: [[0, 4], [1, 8]] });
  assert.deepEqual(G.bindTo('shape', { type: 'word', values: ['a', 'b'] }, 'a', ['round', 'square']), { from: 'shape', pick: { round: 'a', square: 'a' } });
  assert.equal(G.isBound({ from: 'size', map: [[0, 1], [1, 2]] }), true);
  assert.equal(G.isBound(4), false);
  assert.equal(G.unbind({ from: 'size', map: [[0, 1], [1, 3]] }, { type: 'px' }), 1);
});
