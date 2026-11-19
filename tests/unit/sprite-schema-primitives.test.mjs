// catalog/sprite-schema.js: the primitives of format v2 (docs/data-sprites.md 2.7) and their caps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite, PRIMITIVE_KINDS, SPRITE_LIMITS } from '../../catalog/sprite-schema.js';
import { stubRegistry, stubPieces } from '../fixtures/v2/registry.mjs';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../fixtures/v2/${n}.json`, import.meta.url), 'utf8'));
const opts = { generators: stubRegistry(), pieces: stubPieces() };
const check = (d, o = opts) => validateSprite(d, o);
const coinWith = (...items) => { const d = load('coin'); d.body.pictures.draw.push(...items); return d; };
const errs = (...items) => check(coinWith(...items)).errors.join('\n');
const okWith = (...items) => { const r = check(coinWith(...items)); assert.deepEqual(r.errors, [], JSON.stringify(items)); return r; };

test('the kinds: v1\'s five, the new primitives, use, and the three operations', () => {
  for (const k of ['limb', 'capsule', 'ellipse', 'poly', 'dot', 'rect', 'line', 'arc', 'ring', 'stamp', 'dither', 'bands', 'text', 'use', 'outline', 'tint', 'cut']) assert.ok(PRIMITIVE_KINDS.includes(k), k);
  assert.match(errs({ kind: 'blob', on: 'coin', paint: 'gold' }), /blob/);
});

test('rect, line, arc, ring: their fields, in the node\'s frame', () => {
  okWith({ kind: 'rect', on: 'coin', at: [-2, -2], size: [4, 3], paint: 'gold' },
    { kind: 'line', on: 'coin', from: [0, 0], to: [4, 2], thick: 1, paint: 'gold.dark' },
    { kind: 'arc', on: 'coin', at: [0, 0], r: 5, a0: 0, a1: 180, paint: 'gold.light' },
    { kind: 'ring', on: 'coin', at: [0, 0], r: 6, thick: 2, paint: 'gold' });
  assert.match(errs({ kind: 'rect', on: 'coin', at: [0, 0], paint: 'gold' }), /size/);
  assert.match(errs({ kind: 'rect', on: 'coin', at: [0, 0], size: [0, 3], paint: 'gold' }), /size/);
  assert.match(errs({ kind: 'line', on: 'coin', from: [0, 0], paint: 'gold' }), /to/);
  assert.match(errs({ kind: 'arc', on: 'coin', at: [0, 0], r: 5, a0: 0, a1: 9999, paint: 'gold' }), /a1/);
  assert.match(errs({ kind: 'ring', on: 'coin', at: [0, 0], r: -1, paint: 'gold' }), /r/);
  assert.match(errs({ kind: 'rect', on: 'nowhere', at: [0, 0], size: [1, 1], paint: 'gold' }), /"nowhere"/);
  assert.match(errs({ kind: 'rect', at: [0, 0], size: [1, 1] }), /paint/);
});

test('stamp: rows of at most 32 by 32, every character in its key (or "." and " " for clear), variants, anchor, mirror', () => {
  const r = okWith({ id: 'gem', kind: 'stamp', on: 'coin', at: [0, 0], anchor: 'c', mirror: 'x', rows: ['.a.', 'aba', '.a.'], key: { a: 'gold', b: 'light' }, variants: { lit: ['.b.', 'bbb', '.b.'] }, alt: { flat: [{ kind: 'ellipse', at: [0, 0], r: [1.5, 1.5], paint: 'gold' }] } });
  assert.ok(r.cost.stampPixels >= 18);
  assert.match(errs({ kind: 'stamp', on: 'coin', at: [0, 0], rows: ['ab', 'a'], key: { a: 'gold', b: 'gold' } }), /same length/);
  assert.match(errs({ kind: 'stamp', on: 'coin', at: [0, 0], rows: ['az'], key: { a: 'gold' } }), /"z"/);
  assert.match(errs({ kind: 'stamp', on: 'coin', at: [0, 0], rows: ['a'.repeat(33)], key: { a: 'gold' } }), /32/);
  assert.match(errs({ kind: 'stamp', on: 'coin', at: [0, 0], rows: Array(33).fill('a'), key: { a: 'gold' } }), /32/);
  assert.match(errs({ kind: 'stamp', on: 'coin', at: [0, 0], rows: ['a'], key: { a: 'gold', bb: 'gold' } }), /one character/);
  assert.match(errs({ kind: 'stamp', on: 'coin', at: [0, 0], rows: ['a'], key: { a: 'gold' }, anchor: 'middle' }), /anchor/);
  assert.match(errs({ kind: 'stamp', on: 'coin', at: [0, 0], rows: ['a'], key: { a: 'gold' }, turn: 45 }) + check(coinWith({ kind: 'stamp', on: 'coin', at: [0, 0], rows: ['a'], key: { a: 'gold' }, turn: 45 })).warnings.join('\n'), /turn/);
  assert.match(errs({ kind: 'stamp', on: 'coin', at: [0, 0], rows: ['a'], key: { a: 'gold' }, variants: { big: ['aa', 'a'] } }), /same length/);
  // 8,192 stamp pixels in all
  const big = Array.from({ length: 9 }, (_, i) => ({ kind: 'stamp', on: 'coin', at: [0, 0], rows: Array(32).fill('a'.repeat(32)), key: { a: 'gold' } }));
  assert.match(errs(...big), /8,192|8192/);
});

test('dither and bands: an area (a shape), a pattern or stops, kept screen-aligned', () => {
  okWith({ kind: 'dither', on: 'coin', area: { kind: 'ellipse', at: [0, 0], r: [4, 4] }, pattern: 'bayer4', amount: { from: 'size', map: [[0, 0.2], [1, 0.6]] }, paint: 'gold.dark' },
    { kind: 'bands', on: 'coin', area: { kind: 'rect', at: [-4, -4], size: [8, 8] }, dir: 'down', stops: ['gold.light', 'gold', 'gold.dark'], edges: 'dither' });
  assert.match(errs({ kind: 'dither', on: 'coin', area: { kind: 'ellipse', at: [0, 0], r: [4, 4] }, pattern: 'noise', amount: 0.5, paint: 'gold' }), /noise/);
  assert.match(errs({ kind: 'dither', on: 'coin', pattern: 'checker', amount: 0.5, paint: 'gold' }), /area/);
  assert.match(errs({ kind: 'dither', on: 'coin', area: { kind: 'stamp', rows: ['a'], key: { a: 'gold' } }, pattern: 'checker', amount: 0.5, paint: 'gold' }), /area/);
  assert.match(errs({ kind: 'bands', on: 'coin', area: { kind: 'rect', at: [0, 0], size: [4, 4] }, dir: 'sideways', stops: ['gold', 'gold.dark'] }), /sideways/);
  assert.match(errs({ kind: 'bands', on: 'coin', area: { kind: 'rect', at: [0, 0], size: [4, 4] }, dir: 'down', stops: ['gold'] }), /stops/);
});

test('text: a font piece, at most 40 characters of that font, shown as text only', () => {
  okWith({ kind: 'text', font: 'font:chunky@1', text: 'GO!', at: [16, 4], align: 'centre', paint: 'gold', outline: 'ink' });
  assert.match(errs({ kind: 'text', font: 'font:chunky@1', text: 'x'.repeat(41), at: [0, 0], paint: 'gold' }), /40/);
  assert.match(errs({ kind: 'text', font: 'font:chunky@1', text: 'go~', at: [0, 0], paint: 'gold' }), /font/);
  assert.match(errs({ kind: 'text', font: 'chunky', text: 'GO', at: [0, 0], paint: 'gold' }), /font/);
  assert.match(errs({ kind: 'text', font: 'font:chunky@1', text: 'A​B', at: [0, 0], paint: 'gold' }), /invisible/);
});

test('operations: outline, tint and cut', () => {
  okWith({ kind: 'outline', paint: 'ink', only: 'body', sides: 'outer' }, { kind: 'tint', paint: 'light', when: { clip: ['collect'] } },
    { kind: 'cut', shape: { kind: 'ellipse', at: [16, 15], r: [2, 2] }, from: 'body' });
  assert.match(errs({ kind: 'outline', paint: 'ink', sides: 'inner' }), /inner/);
  assert.match(errs({ kind: 'cut', from: 'body' }), /shape/);
  assert.match(errs({ kind: 'tint' }), /paint/);
});

test('common fields: z, group, when, hidden, glow, part; ids once across the definition', () => {
  okWith({ id: 'rim', kind: 'ellipse', on: 'coin', at: [0, 0], r: [6, 6], paint: 'gold', z: 5, group: 'body', hidden: true, glow: false });
  assert.match(errs({ kind: 'ellipse', on: 'coin', at: [0, 0], r: [6, 6], paint: 'gold', z: 500 }) + check(coinWith({ kind: 'ellipse', on: 'coin', at: [0, 0], r: [6, 6], paint: 'gold', z: 500 })).warnings.join('\n'), /z/);
  assert.match(errs({ id: 'face', kind: 'ellipse', on: 'coin', at: [0, 0], r: [6, 6], paint: 'gold' }), /"face".*twice/);
  assert.match(errs({ kind: 'ellipse', on: 'coin', at: [0, 0], r: [6, 6], paint: 'gold', part: 'hat' }), /"hat"/);
  assert.match(errs({ kind: 'ellipse', on: 'coin', at: [0, 0], r: [6, 6], paint: 'gold', hidden: 'no' }), /hidden/);
});

test('at most 400 primitives written in a definition', () => {
  const lots = Array.from({ length: SPRITE_LIMITS.primitives }, () => ({ kind: 'rect', on: 'coin', at: [0, 0], size: [1, 1], paint: 'gold' }));
  assert.match(errs(...lots), /400/);
});
