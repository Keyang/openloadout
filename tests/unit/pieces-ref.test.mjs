// B7 (docs/data-sprites.md section 9): how an asset names a piece. A piece is named `<kind>:<name>` and a version
// `v`; it lives in one file per version, pieces/<kind>-<name>.v<v>.json. These tests pin the naming both ways.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECE_KINDS, parsePieceRef, pieceFile, refOfFile, refKey } from '../../engine/pieces.js';

test('the piece kinds are the fixed list of the design', () => {
  assert.deepEqual(Object.keys(PIECE_KINDS).sort(), ['base', 'font', 'held', 'material', 'part', 'skin', 'stamp']);
  for (const [k, d] of Object.entries(PIECE_KINDS)) assert.equal(typeof d.about, 'string', `${k} has an about`);
});

test('a reference is an object { use, v }, a pair, or the short text kind:name@v', () => {
  const a = parsePieceRef({ use: 'part:hair-bob', v: 1 });
  assert.equal(a.ok, true);
  assert.deepEqual({ ref: a.ref, id: a.id, kind: a.kind, name: a.name, v: a.v, file: a.file },
    { ref: 'part:hair-bob@1', id: 'part:hair-bob', kind: 'part', name: 'hair-bob', v: 1, file: 'pieces/part-hair-bob.v1.json' });
  assert.equal(parsePieceRef('font:chunky@2').ref, 'font:chunky@2');
  assert.equal(parsePieceRef('base:person-side', 3).ref, 'base:person-side@3');
  assert.equal(refKey('stamp:clod', 1), 'stamp:clod@1');
});

test('bad references are refused with words that say what is wrong', () => {
  const bad = [
    [{ use: 'part:hair-bob' }, /version/],
    [{ use: 'part:hair-bob', v: 0 }, /version/],
    [{ use: 'part:hair-bob', v: 1.5 }, /version/],
    [{ use: 'part:hair-bob', v: '1' }, /version/],
    [{ use: 'wing:bat', v: 1 }, /kind/],
    [{ use: 'part:Hair', v: 1 }, /name/],
    [{ use: 'part:', v: 1 }, /name/],
    [{ use: 'hair-bob', v: 1 }, /kind:name/],
    [{ use: 'part:a/../../x', v: 1 }, /name/],
    ['font:chunky', /version/],
    ['font:chunky@x', /version/],
    [42, /reference/],
    [null, /reference/],
  ];
  for (const [x, re] of bad) {
    const r = parsePieceRef(x);
    assert.equal(r.ok, false, JSON.stringify(x));
    assert.match(r.error, re, JSON.stringify(x));
  }
  assert.equal(parsePieceRef({ use: 'part:x', v: 1000 }).ok, false, 'versions stop at 999');
});

test('file names and references go both ways', () => {
  assert.equal(pieceFile('stamp:clod', 1), 'pieces/stamp-clod.v1.json');
  assert.equal(pieceFile('base:person-side', 12), 'pieces/base-person-side.v12.json');
  assert.deepEqual(refOfFile('base-person-side.v12.json'), { ok: true, ref: 'base:person-side@12', id: 'base:person-side', kind: 'base', name: 'person-side', v: 12, file: 'pieces/base-person-side.v12.json' });
  assert.equal(refOfFile('pieces/stamp-clod.v1.json').ref, 'stamp:clod@1');
  for (const f of ['stamp-clod.json', 'stamp-clod.v0.json', 'wing-bat.v1.json', 'stamp.v1.json', 'README.md', '_pins.json', 'stamp-Clod.v1.json', 'stamp-clod.v1.js'])
    assert.equal(refOfFile(f).ok, false, f);
});
