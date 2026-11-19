// B7: a piece file is checked before anything uses it. validatePiece checks the envelope every piece shares
// (format, id, v, name, about, slots, args, body, the pieces it uses) and calls a hook for the body's own rules,
// which the v2 schema (B1, catalog/sprite-schema.js) supplies. Tests the envelope, the plain-data wall and the hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePiece, PIECE_LIMITS, pieceUses } from '../../engine/pieces.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pieces', 'pieces');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const clod = () => read('stamp-test-clod.v1.json');
const tuft = () => read('part-test-tuft.v1.json');

test('the fixture pieces are valid, frozen, and say what they use', () => {
  for (const [f, uses] of [['stamp-test-clod.v1.json', []], ['part-test-tuft.v1.json', ['stamp:test-clod@1']]]) {
    const r = validatePiece(read(f), { file: f });
    assert.deepEqual(r.errors, [], f);
    assert.equal(r.ok, true);
    assert.equal(Object.isFrozen(r.piece) && Object.isFrozen(r.piece.body) && Object.isFrozen(r.piece.slots[0]), true, 'deep-frozen');
    assert.deepEqual(r.uses, uses);
    assert.deepEqual(pieceUses(r.piece), uses);
  }
});

test('text is accepted too, and bad JSON is an error, not a throw', () => {
  assert.equal(validatePiece(JSON.stringify(clod())).ok, true);
  const r = validatePiece('{ "format": ');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /JSON/);
});

test('every envelope field is checked', () => {
  const cases = [
    [(p) => { p.format = 'loadout-sprite'; }, /format/],
    [(p) => { p.version = 2; }, /version/],
    [(p) => { delete p.id; }, /id/],
    [(p) => { p.id = 'wing:bat'; }, /kind/],
    [(p) => { p.v = 0; }, /v\b/],
    [(p) => { p.name = ''; }, /name/],
    [(p) => { p.name = 'x'.repeat(41); }, /name/],
    [(p) => { delete p.about; }, /about/],
    [(p) => { p.about = 'x'.repeat(PIECE_LIMITS.about + 1); }, /about/],
    [(p) => { p.slots = {}; }, /slots/],
    [(p) => { p.slots = Array.from({ length: PIECE_LIMITS.slots + 1 }, (_, i) => ({ id: `s${i}`, default: '#000000' })); }, /slots/],
    [(p) => { p.slots.push({ id: 'a', default: '#000000' }); }, /twice/],
    [(p) => { p.slots[0].id = 'A b'; }, /slot/],
    [(p) => { p.slots[0].default = 'red'; }, /colour/],
    [(p) => { p.slots[0].material = 'cheese'; }, /material/],
    [(p) => { p.args = { 'bad name': { type: 'px' } }; }, /arg/],
    [(p) => { p.args = { size: {} }; }, /type/],
    [(p) => { p.args = Object.fromEntries(Array.from({ length: PIECE_LIMITS.args + 1 }, (_, i) => [`a${i}`, { type: 'px' }])); }, /args/],
    [(p) => { delete p.body; }, /body/],
    [(p) => { p.body = [1]; }, /body/],
    [(p) => { delete p.body.rows; }, /rows/],
  ];
  for (const [edit, re] of cases) {
    const p = clod(); edit(p);
    const r = validatePiece(p);
    assert.equal(r.ok, false, `${edit}`);
    assert.ok(r.errors.some((e) => re.test(e)), `${edit}: ${r.errors.join(' | ')}`);
  }
});

test('each kind needs the body field it is drawn from', () => {
  const need = { base: 'rig', part: 'draw', held: 'draw', font: 'glyphs', stamp: 'rows' };
  for (const [kind, field] of Object.entries(need)) {
    const p = { ...clod(), id: `${kind}:test-x`, body: {} };
    const r = validatePiece(p);
    assert.ok(r.errors.some((e) => e.includes(field)), `${kind}: ${r.errors.join(' | ')}`);
  }
  for (const kind of ['skin', 'material']) assert.equal(validatePiece({ ...clod(), id: `${kind}:test-x`, body: { anything: 1 } }).ok, true, kind);
});

test('the file name must be the piece id and version', () => {
  assert.equal(validatePiece(clod(), { file: 'pieces/stamp-test-clod.v1.json' }).ok, true);
  const r = validatePiece(clod(), { file: 'stamp-test-clod.v2.json' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /stamp-test-clod\.v1\.json/);
});

test('the plain-data wall: code, getters, prototype keys and size', () => {
  const f = clod(); f.body.key.a = () => 'x';
  assert.match(validatePiece(f).errors.join(' '), /function/);
  const g = clod(); Object.defineProperty(g.body, 'rows', { get() { throw new Error('ran'); }, enumerable: true });
  assert.match(validatePiece(g).errors.join(' '), /getter/);
  const p = JSON.parse(JSON.stringify(clod()).replace('"body":', '"__proto__": { "polluted": 1 }, "body":'));
  const r = validatePiece(p);
  assert.equal(r.ok, true);
  assert.equal(({}).polluted, undefined);
  const big = clod(); big.body.note = 'x'.repeat(PIECE_LIMITS.jsonBytes);
  assert.match(validatePiece(big).errors.join(' '), /KB/);
  assert.match(validatePiece(JSON.stringify(big)).errors.join(' '), /KB/);
});

test('unknown top-level fields are dropped with a warning', () => {
  const p = { ...clod(), colour: '#ff0000' };
  const r = validatePiece(p);
  assert.equal(r.ok, true);
  assert.equal('colour' in r.piece, false);
  assert.match(r.warnings.join(' '), /colour/);
});

test('the pieces a piece uses are checked: well formed, not itself, not too many', () => {
  const self = tuft(); self.body.draw.push({ kind: 'use', use: 'part:test-tuft', v: 1 });
  assert.match(validatePiece(self).errors.join(' '), /itself/);
  const bad = tuft(); bad.body.draw.push({ kind: 'use', use: 'part:test-tuft' });
  assert.match(validatePiece(bad).errors.join(' '), /version/);
  const many = tuft(); for (let i = 0; i < PIECE_LIMITS.uses + 1; i++) many.body.draw.push({ kind: 'use', use: `stamp:s${i}`, v: 1 });
  assert.match(validatePiece(many).errors.join(' '), /uses \d+ pieces/);
});

test('the hook for the body (B1) is called with the cleaned piece and its words are kept', () => {
  let seen = null;
  const r = validatePiece(tuft(), { check: (piece) => { seen = piece; return { errors: ['body.draw[0]: a line needs a thickness'], warnings: ['w'] }; } });
  assert.equal(seen.id, 'part:test-tuft');
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['body.draw[0]: a line needs a thickness']);
  assert.deepEqual(r.warnings, ['w']);
  assert.equal(validatePiece(tuft(), { check: () => ['plain list of errors'] }).errors[0], 'plain list of errors');
  assert.equal(validatePiece(tuft(), { check: () => undefined }).ok, true);
  const t = validatePiece(tuft(), { check: () => { throw new Error('boom'); } });
  assert.equal(t.ok, false);
  assert.match(t.errors[0], /boom/);
  let called = false;
  validatePiece({ ...tuft(), format: 'nope' }, { check: () => { called = true; } });
  assert.equal(called, false, 'the hook runs only on a piece whose envelope passed');
});

test('ids that every object already has are refused for slots, args and piece names', () => {
  for (const id of ['toString', 'valueOf', 'hasOwnProperty', 'constructor']) {
    const p = clod(); p.slots[0].id = id;
    assert.match(validatePiece(p).errors.join(' '), /every object already has/, id);
  }
  const a = tuft(); a.args = { valueOf: { type: 'px' } };          // (an arg called constructor never gets here: the plain-data wall drops the key)
  assert.match(validatePiece(a).errors.join(' '), /every object already has/);
  const n = clod(); n.id = 'stamp:constructor';
  assert.match(validatePiece(n).errors.join(' '), /every object already has/);
});

test('the size cap counts bytes of UTF-8, not characters', () => {
  const p = clod(); p.body.note = 'é'.repeat(70 * 1024);           // 70 K characters, 140 KB as UTF-8
  assert.match(validatePiece(p).errors.join(' '), /KB/);
  assert.match(validatePiece(JSON.stringify(p)).errors.join(' '), /KB/);
  const q = clod(); q.body.note = 'é'.repeat(50 * 1024);           // 100 KB: fine
  assert.equal(validatePiece(q).ok, true, validatePiece(q).errors.join(' '));
});
