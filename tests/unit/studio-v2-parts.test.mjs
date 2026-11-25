// Library parts in the studio (build item B20; app/studio/v2-parts.js is the model, app/studio/v2-parts-pane.js the pane):
//   - where the library's sprites wear each part and held piece (engine/pieces.js pieceUsage), written into the pieces
//     index as usedOn by --write and the build;
//   - the pieces that fit a sprite's base (partChoices): the side-view person's parts on a side-view sprite, the
//     top-down family's on a top-down one, each on a node the sprite has;
//   - a piece added as an option of a new or an existing choice, taken out again, and swapped for another; every result
//     passes the full check the studio runs, and the new part changes the picture only when its option is picked.
//   node --test tests/unit/studio-v2-parts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as PT from '../../app/studio/v2-parts.js';
import { spriteOf, checkFull } from '../../app/studio/v2-check.js';
import { renderFrame, cleanParams } from '../../engine/sprite.js';
import { pieceUsage } from '../../engine/pieces.js';
import { nodePieceStore, buildPiecesIndex, writePiecesIndex, ROOT } from '../../tools/lib/pieces-index.mjs';
import { SPRITE_LIMITS } from '../../catalog/sprite-schema.js';

const lib = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));
const store = nodePieceStore();
const index = buildPiecesIndex({ usage: true }).index;
const choice = (def, use) => { const c = PT.partChoices(index, def).find((x) => x.use === use); assert.ok(c, `${use} fits ${def.id}`); return c; };

/** The full check the studio runs before it draws, with the pieces of pieces/: no errors. */
async function passes(def) {
  const r = await store.loadFor(def);
  assert.ok(r.ok, (r.errors ?? []).join('; '));
  const v = checkFull(def, { pieces: store });
  assert.deepEqual(v.errors, [], 'the validator takes it');
  return v;
}
/** The pixels of the preview clip's first frame at some settings. */
async function pixels(def, params = {}) {
  await store.loadFor(def);
  const m = spriteOf(def, { pieces: store });
  assert.ok(m.ok, (m.errors ?? []).join('; '));
  const s = m.sprite;
  const clip = s.preview && s.clips[s.preview] ? s.preview : Object.keys(s.clips)[0];
  return Buffer.from(renderFrame(s, clip, 0, cleanParams(s, params)).bytes());
}

test('pieceUsage: per base, the nodes (with the base node an own node hangs from), z, socket and an example; death-frame poses left out', () => {
  const rig = (base, shapes, extra = {}) => ({ id: extra.id ?? 'a', body: { rig: { extends: { use: base, v: 1 }, shapes, ...extra.rig } }, ...(extra.parts && { parts: extra.parts }) });
  const u = pieceUsage([
    rig('base:x', [{ id: 'cap', kind: 'use', use: 'part:cap', v: 2, on: 'top', z: 50 }, { id: 'axe', kind: 'use', use: 'held:axe', v: 1, on: 'hold' }],
      { id: 'one', rig: { nodes: [{ id: 'hold', parent: 'grip' }], bones: [{ id: 'grip', parent: 'handF' }] }, parts: { hat: { label: 'Hat', params: ['h'], socket: 'head', shapes: ['cap'] } } }),
    rig('base:x', [{ id: 'cap', kind: 'use', use: 'part:cap', v: 2, on: 'top', z: 50 }, { id: 'capLie', kind: 'use', use: 'part:cap', v: 2, on: 'root', z: 6, args: { pose: 'lie' } }], { id: 'two' }),
    { id: 'flat', body: { pictures: { draw: [{ id: 'cap', kind: 'use', use: 'part:cap', v: 2, on: 'top' }] } } },
  ]);
  assert.deepEqual([...u.keys()].sort(), ['held:axe', 'part:cap']);
  const cap = u.get('part:cap');
  assert.equal(cap.length, 1);
  assert.deepEqual({ ...cap[0], example: undefined }, { base: 'base:x', sprites: 2, on: [{ node: 'top', n: 2 }], z: 50, socket: 'head', example: undefined });
  assert.deepEqual(cap[0].example, { sprite: 'one', v: 2, on: 'top', z: 50 });
  assert.deepEqual(u.get('held:axe')[0].on, [{ node: 'hold', at: 'handF', n: 1 }]);
});

test('the index written by --write carries usedOn on the latest row of every part and held piece a based sprite wears', () => {
  const parts = index.pieces.filter((p) => (p.kind === 'part' || p.kind === 'held') && p.latest);
  assert.equal(parts.length, 64);
  // the four the block puzzles draw on a picture body have no base to fit: every other one is worn on a base
  assert.deepEqual(parts.filter((p) => !p.usedOn).map((p) => p.id).sort(), ['part:badge-cool', 'part:badge-warm', 'part:block-cool', 'part:block-warm']);
  assert.ok(index.pieces.every((p) => p.latest || p.usedOn === undefined), 'only latest rows carry it');
  const axe = parts.find((p) => p.id === 'held:axe').usedOn;
  assert.deepEqual(axe.map((u) => u.base), ['base:person-side']);
  assert.equal(axe[0].on[0].node, 'hold');
  assert.equal(axe[0].on[0].at, 'handF');
  // the top-down family shares its parts across its bases
  assert.ok(parts.find((p) => p.id === 'part:topdown-hair').usedOn.length > 3);
  // the build's writer gives the same rows; a folder with no sprites/ gets none (the index format is unchanged)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-parts-'));
  fs.cpSync(path.join(ROOT, 'pieces'), path.join(tmp, 'pieces'), { recursive: true });
  writePiecesIndex({ root: tmp });
  const written = JSON.parse(fs.readFileSync(path.join(tmp, 'generated', 'pieces.json'), 'utf8'));
  assert.ok(written.pieces.every((p) => p.usedOn === undefined));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('partChoices: what fits the base, on a node the sprite has, newest version first, and what it wears already', () => {
  const side = PT.partChoices(index, lib('cloud-courier'));
  assert.ok(side.length >= 10);
  assert.ok(side.every((c) => !c.use.includes('topdown')), 'no top-down part on a side-view person');
  const crown = side.find((c) => c.use === 'part:crown');
  assert.equal(crown.on, 'headwear');
  assert.equal(crown.v, 4);
  assert.deepEqual(crown.versions, [4, 3, 2, 1].filter((v) => index.pieces.some((p) => p.id === 'part:crown' && p.v === v)));
  assert.equal(crown.used, false);
  assert.equal(side.find((c) => c.use === 'part:hair').used, true);
  // the library hangs held things on its own "hold" node; a sprite without one gets the hand it hangs from
  assert.equal(side.find((c) => c.use === 'held:axe').on, 'handF');
  assert.equal(choice(lib('knight'), 'held:axe').on, 'hold');
  const top = PT.partChoices(index, lib('village-elder'));
  assert.ok(top.every((c) => c.use.includes('topdown')), 'no side-view part on a top-down person');
  const hat = top.find((c) => c.use === 'part:topdown-straw-hat');
  assert.equal(hat.on, 'head');
  assert.equal(hat.z, 50);
  // held things that hang on reachF fit only the bases with carries, not the walker
  assert.ok(!top.some((c) => c.use === 'held:topdown-weapon'));
  assert.ok(PT.partChoices(index, lib('town-guard')).some((c) => c.use === 'held:topdown-weapon'));
  // by name; nothing for a sprite with no base
  const names = top.map((c) => c.name.toLowerCase());
  assert.deepEqual(names, [...names].sort());
  assert.deepEqual(PT.partChoices(index, lib('coin')), []);
  assert.deepEqual(PT.partChoices(null, lib('knight')), []);
});

test('partRows: each parts group a choice heads, its options and the pieces each shows', () => {
  const rows = PT.partRows(lib('knight'));
  const hg = rows.find((r) => r.control === 'headgear');
  assert.equal(hg.label, 'Headgear');
  assert.deepEqual(hg.options.map((o) => [o.value, o.none, o.pieces.map((p) => p.use)]), [['helmet', false, ['part:helmet', 'part:plume']], ['crown', false, ['part:crown']], ['none', true, []]]);
});

test('a side-view part as a new choice: it passes, and changes the picture only when picked', async () => {
  const before = lib('cloud-courier');
  const r = PT.addPartOption(before, { piece: choice(before, 'part:crown'), label: 'Crown', index });
  assert.equal(r.control, 'crown');
  assert.equal(r.option, 'crown');
  const c = r.def.controls.find((x) => x.key === 'crown');
  assert.deepEqual(c, { key: 'crown', kind: 'choice', label: 'Crown', options: ['crown', 'none'], default: 'none' });
  assert.deepEqual(r.def.parts[r.part], { label: 'Crown', params: ['crown'], none: 'none', socket: 'head', shapes: [r.shape] });
  const shape = r.def.body.rig.shapes.find((s) => s.id === r.shape);
  assert.deepEqual(shape, { id: r.shape, kind: 'use', use: 'part:crown', v: 4, on: 'headwear', when: { crown: ['crown'] }, paint: { gold: 'gold', jewel: 'jewel' } });
  // its colours: slots added with the piece's own colours
  assert.deepEqual(r.added, ['gold', 'jewel']);
  assert.equal(r.def.palette.find((s) => s.id === 'gold').default, '#e6c545');
  // the Head slider sizes it with the other things worn on headwear
  assert.ok(r.def.controls.find((x) => x.key === 'head').scales.shapes.includes(r.shape));
  await passes(r.def);
  const none = await pixels(r.def, { crown: 'none' });
  assert.ok(none.equals(await pixels(before)), 'with none picked it looks as before');
  assert.ok(!(await pixels(r.def, { crown: 'crown' })).equals(none), 'the crown shows when picked');
});

test('a top-down part as a new choice on a top-down person: it passes, and shows only when picked', async () => {
  const before = lib('village-elder');
  const r = PT.addPartOption(before, { piece: choice(before, 'part:topdown-straw-hat'), label: 'Sun hat', option: 'straw', index });
  assert.equal(r.control, 'sunHat');
  const shape = r.def.body.rig.shapes.find((s) => s.id === r.shape);
  assert.equal(shape.on, 'head');
  assert.equal(shape.z, 50);
  assert.deepEqual(shape.when, { sunHat: ['straw'] });
  await passes(r.def);
  const none = await pixels(r.def, { sunHat: 'none' });
  assert.ok(none.equals(await pixels(before)));
  assert.ok(!(await pixels(r.def, { sunHat: 'straw' })).equals(none));
});

test('a piece as an option of a choice the sprite has; a held thing on a sprite without a hold node', async () => {
  const before = lib('cloud-courier');
  const r = PT.addPartOption(before, { piece: choice(before, 'part:helmet'), control: 'headgear', index });
  const hg = r.def.controls.find((x) => x.key === 'headgear');
  assert.deepEqual(hg.options, ['goggles', 'cap', 'hood', 'helmet', 'none'], 'before the group\'s none');
  assert.equal(hg.default, before.controls.find((x) => x.key === 'headgear').default);
  assert.ok(r.def.parts.headgear.shapes.includes(r.shape));
  assert.equal(Object.keys(r.def.parts).length, Object.keys(before.parts).length);
  await passes(r.def);
  assert.ok(!(await pixels(r.def, { headgear: 'helmet' })).equals(await pixels(r.def, { headgear: 'none' })));
  // an axe in the hand, as a new choice
  const a = PT.addPartOption(before, { piece: choice(before, 'held:axe'), label: 'Weapon', index });
  assert.equal(a.def.body.rig.shapes.find((s) => s.id === a.shape).on, 'handF');
  await passes(a.def);
  assert.ok(!(await pixels(a.def, { weapon: 'axe' })).equals(await pixels(a.def, { weapon: 'none' })));
  // a second piece for the same look is worn with the first
  const b = PT.addPartOption(r.def, { piece: choice(before, 'part:plume'), control: 'headgear', option: 'helmet', index });
  assert.deepEqual(b.def.controls.find((x) => x.key === 'headgear').options, hg.options);
  await passes(b.def);
});

test('removePartOption: the look goes with what only it showed; an added one goes back to the sprite as it was (palette kept)', async () => {
  const before = lib('cloud-courier');
  const r = PT.addPartOption(before, { piece: choice(before, 'part:crown'), label: 'Crown', index });
  const back = PT.removePartOption(r.def, 'crown', 'crown');
  assert.equal(back.control, false, 'a choice left with one look goes');
  assert.deepEqual(back.removed, [r.shape]);
  assert.deepEqual(back.def, { ...before, palette: r.def.palette });
  // knight: each look of each part taken out still passes
  const k = lib('knight');
  for (const [c, o, gone] of [['headgear', 'crown', ['crown']], ['weapon', 'axe', ['axe']], ['headgear', 'helmet', ['helmet', 'plume', 'nape']], ['cape', 'tattered', ['capeTorn1', 'capeTorn2', 'capeTorn3', 'capeTorn4', 'capeTorn5']]]) {
    const x = PT.removePartOption(k, c, o);
    assert.deepEqual(x.removed, gone, `${c} ${o}`);
    assert.ok(!x.def.controls.find((y) => y.key === c).options.includes(o));
    await passes(x.def);
  }
  // both headgear looks: the choice, its group and the size slider only it used go
  const both = PT.removePartOption(PT.removePartOption(k, 'headgear', 'crown').def, 'headgear', 'helmet');
  assert.equal(both.def.controls.some((x) => x.key === 'headgear' || x.key === 'headgearSize'), false);
  assert.equal(both.def.parts.headgear, undefined);
  await passes(both.def);
  assert.throws(() => PT.removePartOption(k, 'height', 'tall'), /not a choice/);
  assert.throws(() => PT.removePartOption(k, 'headgear', 'tiara'), /no look/);
});

test('swapPartPiece: another piece in a look\'s place', async () => {
  const k = lib('knight');
  const r = PT.swapPartPiece(k, 'headgear', 'crown', { piece: choice(k, 'part:helmet') });
  assert.deepEqual(r.shapes, ['crown']);
  const s = r.def.body.rig.shapes.find((x) => x.id === 'crown');
  assert.equal(s.use, 'part:helmet');
  assert.equal(s.args, undefined, 'the crown\'s size is not the helmet\'s');
  assert.deepEqual(s.paint, { metal: 'metal' });
  await passes(r.def);
  assert.throws(() => PT.swapPartPiece(k, 'headgear', 'none', { piece: choice(k, 'part:helmet') }), /No piece/);
});

test('what cannot be is refused in words; a full palette maps a colour by its material', () => {
  const k = lib('knight');
  const crown = choice(lib('cloud-courier'), 'part:crown');
  assert.throws(() => PT.addPartOption(k, { piece: crown, control: 'height', index }), /not a choice/);
  assert.throws(() => PT.addPartOption(k, { piece: { ...crown, on: 'tail' }, label: 'X', index }), /nothing called tail/);
  assert.throws(() => PT.addPartOption(k, { piece: crown, label: 'X', option: 'none', index }), /none/);
  assert.throws(() => PT.addPartOption(lib('coin'), { piece: crown, label: 'X', index }), /bones/);
  // a palette with 12 slots: the crown's gold (metal) goes to the sprite's metal slot, its jewel (magic) keeps its own colour
  const full = { ...k, palette: [...k.palette, ...Array.from({ length: SPRITE_LIMITS.palette - k.palette.length }, (_, i) => ({ id: `extra${i}`, label: 'Extra', default: '#123456', material: 'cloth' }))] };
  const p = PT.paintFor(full, crown);
  assert.deepEqual(p.added, []);
  assert.deepEqual(p.paint, { gold: 'metal' });
  // control keys and option words
  assert.equal(PT.controlKeyFor('Sun hat', ['sunHat']), 'sunHat2');
  assert.equal(PT.controlKeyFor('9 lives'), 'lives');
  const cap = choice(lib('village-elder'), 'part:topdown-cap-peaked');
  assert.equal(PT.optionFor(cap), cap.name.toLowerCase());
  assert.equal(PT.optionFor('part:topdown-straw-hat'), 'straw hat');
  assert.equal(PT.familyOf('base:person-topdown-walker'), PT.familyOf('base:person-topdown'));
  assert.notEqual(PT.familyOf('base:person-side'), PT.familyOf('base:person-topdown'));
});
