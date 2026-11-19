// B7 and B1 agree here: the v2 schema (catalog/sprite-schema.js) takes `pieces: { piece(id, v), pieces() }`, where
// piece(id, v) is { id, v, kind, slots: [slot ids], args: { name: type }, cost, and for a base bones, shapes and
// clips, for a font glyphs } or null (tests/fixtures/v2/registry.mjs stubPieces is the shape B1 tests against).
// pieceRegistry gives that from a store's loaded pieces or from the pieces index, so the schema checks a `use`
// synchronously in the browser (from generated/pieces.json) and in Node (from the folder).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pieceRegistry, pieceSummary, createPieceStore, indexEntry, validatePiece } from '../../engine/pieces.js';
import { buildPiecesIndex } from '../../tools/lib/pieces-index.mjs';
import { stubPieces } from '../fixtures/v2/registry.mjs';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pieces');
const text = (f) => fs.readFileSync(path.join(FIX, 'pieces', f), 'utf8');

const base = () => ({
  format: 'loadout-piece', version: 1, id: 'base:test-person', v: 1, name: 'Test person', about: 'A two-bone person for the tests only.',
  slots: [{ id: 'skin', default: '#e0a878', material: 'skin' }, { id: 'outfit', default: '#3a6ea5', material: 'cloth' }],
  body: {
    rig: { bones: [{ id: 'hip', parent: null, at: [16, 20], angle: 180, length: 6 }, { id: 'head', parent: 'hip', angle: 0, length: 4 }],
      nodes: [{ id: 'eye', parent: 'head', at: [2, 1] }],
      shapes: [{ id: 'torso', kind: 'limb', bone: 'hip', width: 4, paint: 'outfit' }, { id: 'skull', kind: 'ellipse', bone: 'head', at: [2, 0], r: [2, 2], paint: 'skin' }] },
    clips: { idle: { frames: 4, fps: 6 }, walk: { frames: 8, fps: 10 } },
  },
});
const font = () => ({
  format: 'loadout-piece', version: 1, id: 'font:test-tiny', v: 1, name: 'Tiny', about: 'Three glyphs for the tests only.',
  slots: [{ id: 'ink', default: '#231b33' }], body: { height: 3, glyphs: { A: ['.a.', 'aaa', 'a.a'], B: ['aa.', 'aaa', 'aa.'], ' ': ['...', '...', '...'] } },
});

test('the summary has the shape the v2 schema reads (the keys of its stand-in, plus needsPaint)', () => {
  const stub = stubPieces();
  const b = pieceSummary(validatePiece(base()).piece);
  assert.deepEqual(Object.keys(b).filter((k) => k !== 'needsPaint').sort(), Object.keys(stub.piece('base:person-side', 1)).sort());
  assert.deepEqual(b, { id: 'base:test-person', v: 1, kind: 'base', slots: ['skin', 'outfit'], needsPaint: [], bones: ['hip', 'head', 'eye'], shapes: ['torso', 'skull'], clips: { idle: { frames: 4 }, walk: { frames: 8 } }, cost: 2 });
  const t = pieceSummary(validatePiece(text('part-test-tuft.v1.json')).piece);
  assert.deepEqual(t, { id: 'part:test-tuft', v: 1, kind: 'part', slots: ['hair'], needsPaint: [], args: { length: { type: 'px', lo: 1, hi: 4, default: 2 } }, cost: 3 });
  for (const k of Object.keys(t)) assert.ok(k in stub.piece('part:hair', 1) || k === 'args' || k === 'needsPaint', k);
  const f = pieceSummary(validatePiece(font()).piece);
  assert.deepEqual(f, { id: 'font:test-tiny', v: 1, kind: 'font', slots: ['ink'], needsPaint: [], glyphs: ' AB', cost: 0 });
  assert.equal(pieceSummary(validatePiece(text('stamp-test-clod.v1.json')).piece).cost, 1);
  assert.deepEqual(pieceSummary(validatePiece(text('stamp-test-clod.v1.json')).piece).needsPaint, ['b'], 'the slot with no default');
});

test('from a store: only loaded pieces are known, synchronously', async () => {
  const files = { 'pieces/part-test-tuft.v1.json': text('part-test-tuft.v1.json'), 'pieces/stamp-test-clod.v1.json': text('stamp-test-clod.v1.json') };
  const store = createPieceStore({ read: async (rel) => files[rel] });
  const reg = pieceRegistry(store);
  assert.equal(reg.piece('part:test-tuft', 1), null);
  await store.load('part:test-tuft@1');
  assert.equal(reg.piece('part:test-tuft', 1).kind, 'part');
  assert.equal(reg.piece('part:test-tuft', 2), null);
  assert.deepEqual(reg.pieces().map((p) => `${p.id}@${p.v}`), ['part:test-tuft@1', 'stamp:test-clod@1']);
  store.add(base());
  assert.deepEqual(reg.piece('base:test-person', 1).bones, ['hip', 'head', 'eye']);
});

test('from the index (generated/pieces.json): the same answers as from the loaded pieces', () => {
  const { index } = buildPiecesIndex({ root: FIX });
  const reg = pieceRegistry(index);
  for (const f of ['part-test-tuft.v1.json', 'stamp-test-clod.v1.json']) {
    const p = validatePiece(text(f)).piece;
    assert.deepEqual(reg.piece(p.id, p.v), pieceSummary(p), f);
  }
  const rows = [indexEntry(validatePiece(base()).piece), indexEntry(validatePiece(font()).piece)];
  const r2 = pieceRegistry(rows);
  assert.deepEqual(r2.piece('base:test-person', 1), pieceSummary(validatePiece(base()).piece));
  assert.deepEqual(r2.piece('font:test-tiny', 1), pieceSummary(validatePiece(font()).piece));
  assert.equal(pieceRegistry(null).piece('base:test-person', 1), null);
});
