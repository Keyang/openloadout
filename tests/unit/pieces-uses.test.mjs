// B7: finding the pieces a definition names, and checking them against the index without loading them.
// usesOf walks a definition (every form of 2.2 to 2.7 in docs/data-sprites.md: a `use` object, a `kind: "use"`
// shape, `extends`, a generator's `place`, a material, a skin, a text's `font`). checkPieceUses is the
// synchronous check the v2 schema (B1) calls: the piece and version exist, the paint and args name what the piece
// has, the kind fits the place, and the whole set of pieces (with what they use in turn) stays within the caps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { usesOf, checkPieceUses, PIECE_LIMITS } from '../../engine/pieces.js';

const entry = (ref, { slots = [], args = [], uses = [] } = {}) => {
  args = Object.fromEntries(args.map((a) => [a, { type: 'px' }]));
  const [id, v] = ref.split('@');
  return { ref, id, kind: id.split(':')[0], v: Number(v), file: `pieces/${id.replace(':', '-')}.v${v}.json`, slots, args, uses };
};
const INDEX = {
  format: 'loadout-pieces', version: 1,
  pieces: [
    entry('base:person-side@1', { slots: [{ id: 'skin', default: '#e0a878' }, { id: 'outfit', default: '#3a6ea5' }], uses: ['part:hair@1'] }),
    entry('part:hair@1', { slots: [{ id: 'hair', default: '#5a3a22' }], args: ['style', 'length'] }),
    entry('part:hair@2', { slots: [{ id: 'hair', default: '#5a3a22' }], args: ['style', 'length', 'shine'] }),
    entry('held:sword@1', { slots: [{ id: 'blade' }], args: ['length'] }),
    entry('stamp:clod@1', { slots: [{ id: 'a' }] }),
    entry('font:chunky@1', { slots: [{ id: 'ink', default: '#231b33' }] }),
    entry('skin:wood@1', { slots: [{ id: 'face', default: '#8a5a33' }, { id: 'frame', default: '#5a3a22' }] }),
    entry('material:grass@1', { slots: [{ id: 'grass', default: '#3a6e2a' }], uses: ['stamp:clod@1'] }),
  ],
};

const knight = () => ({
  format: 'loadout-sprite', version: 2, id: 'knight',
  body: { rig: {
    extends: { use: 'base:person-side', v: 1 },
    shapes: [
      { id: 'hair', kind: 'use', use: 'part:hair', v: 1, on: 'head', args: { length: { from: 'hairLength', map: [[0, 2], [1, 7]] } }, paint: { hair: 'hair' } },
      { id: 'sword', kind: 'use', use: 'held:sword', v: 1, on: 'handF', paint: { blade: 'metal' } },
      { id: 'label', kind: 'text', font: 'font:chunky@1', text: 'HI', paint: 'ink' },
    ] } },
});

test('usesOf finds every form, with the path and the place it stands in', () => {
  const def = knight();
  def.body.rig.shapes.push({ gen: 'scatter', v: 1, place: { use: 'stamp:clod', v: 1, paint: { a: 'soil.dark' } } });
  const u = usesOf(def);
  assert.deepEqual(u.map((x) => [x.ref, x.path, x.place]), [
    ['base:person-side@1', 'body.rig.extends', 'extends'],
    ['part:hair@1', 'body.rig.shapes[0]', null],
    ['held:sword@1', 'body.rig.shapes[1]', null],
    ['font:chunky@1', 'body.rig.shapes[2].font', 'font'],
    ['stamp:clod@1', 'body.rig.shapes[3].place', 'place'],
  ]);
});

test('a `use` without a kind is not a piece (a tile group says use: "ground")', () => {
  assert.deepEqual(usesOf({ body: { tiles: { groups: [{ name: 'grass', use: 'ground' }] } } }), []);
  const bad = usesOf({ body: { pictures: { draw: [{ kind: 'use', use: 'part:x' }] } } });
  assert.equal(bad.length, 1);
  assert.match(bad[0].error, /version/);
});

test('a good definition passes and lists its pieces, with what they use in turn', () => {
  const r = checkPieceUses(knight(), INDEX);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.refs, ['base:person-side@1', 'font:chunky@1', 'held:sword@1', 'part:hair@1']);
  assert.deepEqual(r.closure, ['base:person-side@1', 'font:chunky@1', 'held:sword@1', 'part:hair@1']);
});

test('an unknown piece or version is refused, naming the versions that exist', () => {
  const d = knight(); d.body.rig.shapes[0].v = 3;
  assert.match(checkPieceUses(d, INDEX).errors.join(' '), /part:hair.*version 3.*1, 2/);
  const e = knight(); e.body.rig.shapes[1].use = 'held:axe';
  assert.match(checkPieceUses(e, INDEX).errors.join(' '), /no piece called held:axe/);
});

test('a newer version is a warning, not an error: a definition keeps the version it was made with', () => {
  const r = checkPieceUses(knight(), INDEX);
  assert.match(r.warnings.join(' '), /part:hair.*version 2/);
});

test('paint and args must name what the piece has; an unmapped slot needs a default', () => {
  const d = knight(); d.body.rig.shapes[0].paint = { fur: 'hair' };
  assert.match(checkPieceUses(d, INDEX).errors.join(' '), /paint.*fur.*hair/);
  const a = knight(); a.body.rig.shapes[0].args.colourful = true;
  assert.match(checkPieceUses(a, INDEX).errors.join(' '), /colourful/);
  const s = knight(); delete s.body.rig.shapes[1].paint;
  assert.match(checkPieceUses(s, INDEX).errors.join(' '), /blade/);
});

test('the kind must fit the place: extends a base, font a font, skin a skin, material a material', () => {
  const d = knight(); d.body.rig.extends = { use: 'part:hair', v: 1 };
  assert.match(checkPieceUses(d, INDEX).errors.join(' '), /extends.*base/);
  const f = knight(); f.body.rig.shapes[2].font = 'stamp:clod@1';
  assert.match(checkPieceUses(f, INDEX).errors.join(' '), /font/);
  const p = { body: { panel: { skin: { use: 'material:grass', v: 1 } } } };
  assert.match(checkPieceUses(p, INDEX).errors.join(' '), /skin/);
  const t = { body: { tiles: { groups: [{ name: 'g', material: { use: 'skin:wood', v: 1 } }] } } };
  assert.match(checkPieceUses(t, INDEX).errors.join(' '), /material/);
  const ok = { body: { tiles: { groups: [{ name: 'g', use: 'ground', material: { use: 'material:grass', v: 1, paint: { grass: 'grass' } } }] } } };
  const r = checkPieceUses(ok, INDEX);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.closure, ['material:grass@1', 'stamp:clod@1']);
});

test('caps: distinct pieces per definition, and the whole set with what they use', () => {
  const pieces = Array.from({ length: PIECE_LIMITS.usesPerAsset + 1 }, (_, i) => entry(`stamp:s${i}@1`));
  const idx = { pieces };
  const d = { body: { pictures: { draw: pieces.map((p) => ({ kind: 'use', use: p.id, v: 1 })) } } };
  assert.match(checkPieceUses(d, idx).errors.join(' '), new RegExp(`${PIECE_LIMITS.usesPerAsset}`));
  // the same piece used many times counts once
  const same = { body: { pictures: { draw: Array.from({ length: 40 }, () => ({ kind: 'use', use: 'stamp:clod', v: 1, paint: { a: 'soil' } })) } } };
  assert.deepEqual(checkPieceUses(same, INDEX).errors, []);
});

test('a loop between pieces, or a chain too deep, is refused', () => {
  const loop = { pieces: [entry('part:a@1', { uses: ['part:b@1'] }), entry('part:b@1', { uses: ['part:a@1'] })] };
  assert.match(checkPieceUses({ x: { use: 'part:a', v: 1 } }, loop).errors.join(' '), /loop/);
  const chain = Array.from({ length: PIECE_LIMITS.depth + 2 }, (_, i) => entry(`part:c${i}@1`, { uses: i < PIECE_LIMITS.depth + 1 ? [`part:c${i + 1}@1`] : [] }));
  assert.match(checkPieceUses({ x: { use: 'part:c0', v: 1 } }, { pieces: chain }).errors.join(' '), /deep/);
});

test('with no index, only the form is checked and a warning says so', () => {
  const r = checkPieceUses(knight(), null);
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join(' '), /not checked/);
  const bad = knight(); bad.body.rig.extends.v = 'one';
  assert.match(checkPieceUses(bad, null).errors.join(' '), /version/);
});

// ---- review fixes (B7 round 2) ------------------------------------------------------------------------------

import fs from 'node:fs';
import { stubPieces } from '../fixtures/v2/registry.mjs';
import { pieceRegistry, bindSlots } from '../../engine/pieces.js';

const KNIGHT = () => JSON.parse(fs.readFileSync(new URL('../fixtures/v2/knight.json', import.meta.url), 'utf8'));
/** B1's stand-in pieces as index rows, with no slot defaults at all (the hard case). */
const STUB_INDEX = () => ({ pieces: stubPieces().pieces().map((p) => ({ ref: `${p.id}@${p.v}`, id: p.id, v: p.v, kind: p.kind,
  slots: (p.slots || []).map((id) => ({ id })), args: p.args || {}, uses: [] })) });

test('the design\'s knight passes: an unmapped slot binds to the sprite\'s palette slot with the same id', () => {
  const r = checkPieceUses(KNIGHT(), STUB_INDEX());
  assert.deepEqual(r.errors, []);
  // take away a palette slot the base needs and give the base no default: now it is an error that says both ways out
  const k = KNIGHT(); k.palette = k.palette.filter((s) => s.id !== 'metal');
  k.body.rig.shapes = k.body.rig.shapes.filter((s) => s.kind !== 'use');
  const e = checkPieceUses(k, STUB_INDEX()).errors.join(' ');
  assert.match(e, /extends.*"metal".*base:person-side/);
  assert.match(e, /palette/);
  // an explicit paint map still wins, and a slot with a default needs neither
  const m = KNIGHT(); m.body.rig.extends.paint = { metal: 'outfit' }; m.palette = m.palette.filter((s) => s.id !== 'metal');
  m.body.rig.shapes = m.body.rig.shapes.filter((s) => s.kind !== 'use');
  assert.deepEqual(checkPieceUses(m, STUB_INDEX()).errors, []);
});

test('bindSlots: paint map first, then the palette slot of the same id, then the default; the rest need paint', () => {
  const slots = [{ id: 'skin' }, { id: 'hair' }, { id: 'eye', default: '#231b33' }, { id: 'cape' }];
  assert.deepEqual(bindSlots(slots, { hair: 'hairTone' }, ['skin', 'hairTone']), {
    paint: { skin: 'skin', hair: 'hairTone' }, defaults: { eye: '#231b33' }, missing: ['cape'] });
  assert.deepEqual(bindSlots(['a'], {}, []).missing, ['a'], 'slot ids alone (B1 summaries) work too');
  assert.deepEqual(bindSlots([{ id: 'toString' }], {}, []).missing, ['toString'], 'own keys only');
});

test('a piece checked inside a piece binds unmapped slots to the outer piece\'s own slots', () => {
  const idx = { pieces: [
    { ref: 'material:grass@1', id: 'material:grass', v: 1, kind: 'material', slots: [{ id: 'soil' }], args: {}, uses: ['stamp:clod@1'] },
    { ref: 'stamp:clod@1', id: 'stamp:clod', v: 1, kind: 'stamp', slots: [{ id: 'soil' }], args: {}, uses: [] } ] };
  assert.deepEqual(checkPieceUses({ slots: [{ id: 'soil' }], body: { fill: { place: { use: 'stamp:clod', v: 1 } } } }, idx).errors, []);
  assert.match(checkPieceUses({ slots: [{ id: 'mud' }], body: { fill: { place: { use: 'stamp:clod', v: 1 } } } }, idx).errors.join(' '), /"soil"/);
});

test('a slot named like something every object has is never missed', () => {
  const idx = { pieces: [{ ref: 'part:odd@1', id: 'part:odd', v: 1, kind: 'part', slots: [{ id: 'toString' }, { id: 'valueOf' }], args: {}, uses: [] }] };
  const e = checkPieceUses({ x: { kind: 'use', use: 'part:odd', v: 1, paint: {} } }, idx).errors.join(' ');
  assert.match(e, /toString/);
  assert.match(e, /valueOf/);
});

test('a `kind: "use"` shape whose use is not kind:name is an error, not skipped', () => {
  for (const node of [{ kind: 'use', use: 'sword', v: 1 }, { kind: 'use', v: 1 }]) {
    const u = usesOf({ body: { rig: { shapes: [node] } } });
    assert.equal(u.length, 1, JSON.stringify(node));
    assert.match(u[0].error, /kind:name/);
    assert.match(checkPieceUses({ body: { rig: { shapes: [node] } } }, INDEX).errors.join(' '), /shapes\[0\].*kind:name/);
  }
  assert.deepEqual(usesOf({ body: { tiles: { groups: [{ name: 'grass', use: 'ground' }] } } }), [], 'a tile group is still not a piece');
});

test('the registry tells B1 which slots need paint', () => {
  const reg = pieceRegistry(STUB_INDEX());
  assert.deepEqual(reg.piece('base:person-side', 1).needsPaint, ['skin', 'outfit', 'trousers', 'metal', 'eye']);
  assert.deepEqual(pieceRegistry(INDEX).piece('base:person-side', 1).needsPaint, []);
  assert.deepEqual(pieceRegistry(INDEX).piece('held:sword', 1).needsPaint, ['blade']);
});
