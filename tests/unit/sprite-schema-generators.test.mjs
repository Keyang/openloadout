// catalog/sprite-schema.js: generators are named by id and version and checked against the registry the caller gives
// (docs/data-sprites.md 3.1, 3.2, 3.4): unknown id, version or argument refused, every argument checked against its
// type before anything draws, every count capped, the summed cost under the budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite, SPRITE_LIMITS } from '../../catalog/sprite-schema.js';
import { stubRegistry, stubPieces } from '../fixtures/v2/registry.mjs';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../fixtures/v2/${n}.json`, import.meta.url), 'utf8'));
const opts = { generators: stubRegistry(), pieces: stubPieces() };
const check = (d, o = opts) => validateSprite(d, o);
const errs = (d, o) => check(d, o).errors.join('\n');
/** The coin with one more item in its draw list. */
const coinWith = (item) => { const d = load('coin'); d.body.pictures.draw.push(item); return d; };

test('a generator is named by id and version; an unknown id or version is refused, naming the versions there are', () => {
  assert.match(errs(coinWith({ gen: 'sparkle', v: 1 })), /no generator "sparkle"/);
  assert.match(errs(coinWith({ gen: 'star', v: 3, at: [0, 0], points: 5, r: [2, 4], paint: 'gold' })), /star.*version 3.*1, 2/);
  assert.match(errs(coinWith({ gen: 'star', at: [0, 0], points: 5, r: [2, 4], paint: 'gold' })), /v/);
  assert.match(errs(coinWith({ gen: 'star', v: '1', at: [0, 0], points: 5, r: [2, 4], paint: 'gold' })), /whole number/);
  assert.match(errs(coinWith({ gen: 'Star!', v: 1 })), /generator/);
  assert.equal(check(coinWith({ gen: 'star', v: 2, at: [0, 0], points: 14, r: [2, 4], paint: 'gold' })).ok, true, 'each version has its own arguments');
  assert.match(errs(coinWith({ gen: 'star', v: 1, at: [0, 0], points: 14, r: [2, 4], paint: 'gold' })), /points/);
});

test('arguments: unknown ones refused, missing ones named, each against its type and range (refused, never clamped)', () => {
  const star = { gen: 'star', v: 1, at: [0, 0], points: 5, r: [2, 4], paint: 'gold' };
  assert.equal(check(coinWith(star)).ok, true);
  assert.match(errs(coinWith({ ...star, colour: 'red' })), /"colour".*not an argument of star@1/);
  const { points, ...noPoints } = star;
  assert.match(errs(coinWith(noPoints)), /points.*missing/);
  assert.match(errs(coinWith({ ...star, points: 2 })), /points.*3 to 12/);
  assert.match(errs(coinWith({ ...star, points: 4.5 })), /whole/);
  assert.match(errs(coinWith({ ...star, r: [2, 99] })), /r/);
  assert.match(errs(coinWith({ ...star, paint: 'chrome' })), /"chrome"/);
  assert.match(errs(coinWith({ gen: 'starburst', v: 1, at: [0, 0], points: 4, r: [1, 2], paints: ['gold', 'gold', 'gold', 'gold'] })), /paints.*3/);
  assert.match(errs(coinWith({ gen: 'ridge', v: 1, base: 10, seed: 10000, peaks: 2, paint: 'gold' })), /seed/);
  assert.match(errs(coinWith({ gen: 'ridge', v: 1, base: 10, seed: 3, peaks: 2, paint: 'gold', shape: 'wavy' })), /wavy/);
  assert.match(errs(coinWith({ gen: 'ridge', v: 1, base: 10, seed: 3, peaks: 2, paint: 'gold', rough: 1.5 })), /rough/);
  assert.match(errs(coinWith({ gen: 'ridge', v: 1, base: 10, seed: 3, peaks: 2, paint: 'gold', litEdge: { depth: 0.5 } })), /litEdge.*paint/);
  assert.match(errs(coinWith({ gen: 'ridge', v: 1, base: 10, seed: 3, peaks: 2, paint: 'gold', litEdge: { depth: 0.5, paint: 'gold', glow: 1 } })), /glow/);
  assert.match(errs(coinWith({ gen: 'particles', v: 1, at: [0, 0], count: 3, seed: 1, dist: 4, size: 1, paints: ['gold'], loop: 'yes' })), /loop/);
  assert.match(errs(coinWith({ gen: 'particles', v: 1, at: [0, 0], count: 3, seed: 1, dist: 4, size: 1, paints: ['gold'], arc: 9999 })), /arc/);
});

test('a number argument takes a binding; a count needs round "px"; words and flags take picks', () => {
  const ok = coinWith({ gen: 'star', v: 1, at: [0, 0], points: { from: 'size', map: [[0, 4], [1, 8]], round: 'px' }, r: [2, { from: 'size', map: [[0, 3], [1, 6]] }], paint: 'gold' });
  assert.equal(check(ok).ok, true);
  assert.match(errs(coinWith({ gen: 'star', v: 1, at: [0, 0], points: { from: 'size', map: [[0, 4], [1, 8]] }, r: [2, 4], paint: 'gold' })), /round/);
  assert.match(errs(coinWith({ gen: 'star', v: 1, at: [0, 0], points: { from: 'size', map: [[0, 4], [1, 20]], round: 'px' }, r: [2, 4], paint: 'gold' })), /points.*20|3 to 12/);
  const word = load('knight');
  word.body.rig.shapes[2].args.style = { from: 'hair', pick: { short: 'crop', long: 'mohawk' } };
  assert.match(errs(word), /mohawk/);
  const flag = load('ui-button');
  flag.body.panel.piece.nails = { from: 'corner' };
  assert.match(errs(flag), /nails/);
  const words = load('ui-button');
  words.controls[0].options = ['plain', 'framed', 'gilded'];
  assert.match(errs(words), /gilded/, 'a choice bound as it is must offer only words the argument takes');
});

test('nested arguments: place (a piece, a stamp or another generator), shape and primitives are checked as deeply', () => {
  const d = load('bg-forest');
  d.body.layers[0].draw[1].place = { gen: 'cloud', v: 1, paint: 'nope' };
  assert.match(errs(d), /"nope"/);
  const d2 = load('bg-forest'); d2.body.layers[0].draw[1].place = { gen: 'nothing', v: 1 };
  assert.match(errs(d2), /"nothing"/);
  const d3 = load('bg-forest'); d3.body.layers[0].draw[1].place = { kind: 'stamp', rows: ['ab'], key: { a: 'cloud', b: 'cloud.dark' } };
  assert.equal(check(d3).ok, true, 'a stamp');
  const d4 = load('bg-forest'); d4.body.layers[0].draw[1].place = 'cloud';
  assert.match(errs(d4), /place/);
  const g = coinWith({ gen: 'group.of', v: 1, shape: { kind: 'ellipse', at: [0, 0], r: [2, 2], paint: 'gold' }, draw: [{ kind: 'rect', at: [0, 0], size: [2, 2], paint: 'gold' }] });
  assert.equal(check(g).ok, true);
  const g2 = coinWith({ gen: 'group.of', v: 1, shape: { kind: 'blob', paint: 'gold' } });
  assert.match(errs(g2), /blob/);
  const g3 = coinWith({ gen: 'group.of', v: 1, shape: { kind: 'ellipse', at: [0, 0], r: [2, 2], paint: 'gold' }, draw: [{ gen: 'nothing', v: 1 }] });
  assert.match(errs(g3), /"nothing"/);
  const p = coinWith({ gen: 'edge.wave', v: 1, profile: [0, 1, 2, 1], paint: 'gold' });
  assert.equal(check(p).ok, true, 'a profile given as numbers');
  const p2 = coinWith({ gen: 'edge.wave', v: 1, profile: 'dips', paint: 'gold' });
  assert.match(errs(p2), /"dips" is not a profile/);
});

test('colour rules from the registry: { rule, v, ...args } with typed args; an unknown rule refused', () => {
  const d = load('bg-forest');
  d.body.layers[0].draw[0].paint = { rule: 'sky.look', v: 1, of: 'sky', time: 2 };
  assert.match(errs(d), /time/);
  const d2 = load('bg-forest'); d2.body.layers[0].draw[0].paint = { rule: 'sky.paint', v: 1, of: 'sky' };
  assert.match(errs(d2), /"sky.paint"/);
  const d3 = load('bg-forest'); d3.body.layers[0].draw[0].paint = { rule: 'ridge', v: 1, base: 1 };
  assert.match(errs(d3), /colour rule/);
});

test('every generator call is counted: at most 64 calls, and the summed cost stays under the budget', () => {
  const r = check(load('hit-spark'));
  assert.equal(r.cost.generators, 2);
  assert.equal(r.cost.budget, SPRITE_LIMITS.expanded);
  assert.equal(r.cost.expanded, (1 + 12) + 4, 'particles at its largest count, plus starburst');
  const many = load('coin');
  for (let i = 0; i < 65; i++) many.body.pictures.draw.push({ gen: 'glint', v: 1, every: 4, paint: 'gold' });
  assert.match(errs(many), /64 generator/);
  const dear = coinWith({ gen: 'costly', v: 1, count: 5000 });
  const rd = check(dear);
  assert.equal(rd.ok, false);
  assert.match(rd.errors.join('\n'), /cost|budget/);
  assert.ok(rd.cost.expanded > SPRITE_LIMITS.expanded);
  const bound = coinWith({ gen: 'costly', v: 1, count: { from: 'size', map: [[0, 1], [1, 5000]], round: 'px' } });
  assert.match(errs(bound), /cost|budget/, 'a binding costs what its largest value costs');
});

test('a registry that misbehaves (throws, a cost that is not a number) gives plain messages, never a crash', () => {
  const throwing = { generator() { throw new Error('boom'); } };
  const r = check(coinWith({ gen: 'star', v: 1 }), { generators: throwing });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /star/);
  const bad = stubRegistry([{ id: 'nan', v: 1, family: 'shape', args: {}, cost: () => NaN }, { id: 'oops', v: 1, family: 'shape', args: {}, cost: () => { throw new Error('x'); } }]);
  assert.match(errs(coinWith({ gen: 'nan', v: 1 }), { generators: bad }), /cost/);
  assert.match(errs(coinWith({ gen: 'oops', v: 1 }), { generators: bad }), /cost/);
  const odd = stubRegistry([{ id: 'odd', v: 1, family: 'shape', args: { x: { type: 'hologram' } }, cost: () => 1 }]);
  assert.match(errs(coinWith({ gen: 'odd', v: 1, x: 1 }), { generators: odd }), /type/);
});

test('pieces: when a piece list is given, an unknown piece, version, slot or argument is refused', () => {
  const k = load('knight'); k.body.rig.shapes[3].use = 'part:helmet-horned';
  assert.match(errs(k), /part:helmet-horned/);
  const k2 = load('knight'); k2.body.rig.shapes[4].v = 2;
  assert.match(errs(k2), /held:sword.*version 2/);
  const k3 = load('knight'); k3.body.rig.shapes[4].paint = { edge: 'metal' };
  assert.match(errs(k3), /"edge".*held:sword/);
  const k4 = load('knight'); k4.body.rig.shapes[4].args = { length: 99 };
  assert.match(errs(k4), /length/);
  const k5 = load('knight'); k5.body.rig.shapes[4].use = 'sword';
  assert.match(errs(k5, { generators: stubRegistry() }), /piece/, 'a piece id has a kind before the colon, checked with or without a list');
  const many = load('knight');
  for (let i = 0; i < 25; i++) many.body.rig.shapes.push({ id: `s${i}`, kind: 'use', use: 'part:helmet-plumed', v: 1, on: 'head' });
  assert.match(errs(many), /24/);
});
