// The studio's version 2 model: pure changes to a `loadout-sprite` version 2 definition (build item B17;
// docs/data-sprites.md sections 2 and 6, Contract 15 rule 7): which body it has, reading and changing a field by its
// path (never in place), the item lists of each body, adding, moving, ordering and deleting shapes, stamps and
// generator calls, a copy of a library sprite (DQ5: editing a library sprite edits a copy), its file <id>.json, and
// the validator's messages matched to the rows they are about.
//   node --test tests/unit/studio-v2-model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../../app/studio/v2-model.js';

const COIN = JSON.parse(fs.readFileSync(new URL('../fixtures/v2/coin.json', import.meta.url), 'utf8'));
const coin = () => JSON.parse(JSON.stringify(COIN));
const DRAW = ['body', 'pictures', 'draw'];

test('the six bodies, and which one a definition has', () => {
  assert.deepEqual(M.BODY_KINDS, ['rig', 'tiles', 'layers', 'panel', 'emitters', 'pictures']);
  for (const k of M.BODY_KINDS) assert.equal(typeof M.BODY_LABELS[k], 'string');
  assert.equal(M.bodyKind(coin()), 'pictures');
  assert.equal(M.bodyKind({ body: { nodes: [], draw: [], emitters: [] } }), 'emitters');
  assert.equal(M.bodyKind({ body: { library: 'humanoid' } }), null);
  assert.equal(M.bodyKind(null), null);
  assert.equal(M.isV2(coin()), true);
  assert.equal(M.isV2({ version: 1 }), false);
});

test('getAt reads by path; setAt, insertAt, removeAt and moveAt give a new definition and leave the old one', () => {
  const d = coin();
  const before = JSON.stringify(d);
  assert.equal(M.getAt(d, ['body', 'pictures', 'nodes', 0, 'id']), 'coin');
  assert.equal(M.getAt(d, ['body', 'nope', 3]), undefined);
  const a = M.setAt(d, ['name'], 'Gold coin');
  assert.equal(a.name, 'Gold coin');
  const b = M.insertAt(d, DRAW, 1, { kind: 'dot', on: 'coin', at: [0, 0], paint: 'gold' });
  assert.equal(b.body.pictures.draw.length, 5);
  assert.equal(b.body.pictures.draw[1].kind, 'dot');
  const c = M.removeAt(d, [...DRAW, 0]);
  assert.equal(c.body.pictures.draw[0].id, 'mark');
  const e = M.moveAt(d, DRAW, 0, 2);
  assert.deepEqual(e.body.pictures.draw.map((x) => x.id ?? x.kind ?? x.gen), ['mark', 'outline', 'face', 'glint']);
  const f = M.setAt(d, ['grounded'], undefined);
  assert.equal('grounded' in f, false, 'undefined removes a field');
  assert.equal(JSON.stringify(d), before);
});

test('paths never reach an object\'s own machinery', () => {
  const d = coin();
  assert.throws(() => M.setAt(d, ['__proto__', 'x'], 1));
  assert.throws(() => M.setAt(d, ['body', 'constructor'], 1));
  assert.equal(M.getAt(d, ['toString']), undefined);
});

test('the kinds of value the field tree edits', () => {
  assert.equal(M.fieldKind(3), 'number');
  assert.equal(M.fieldKind('x'), 'text');
  assert.equal(M.fieldKind(true), 'flag');
  assert.equal(M.fieldKind([1]), 'list');
  assert.equal(M.fieldKind({}), 'object');
  assert.equal(M.fieldKind(null), 'null');
});

test('the item lists of every body', () => {
  const lists = (def) => M.itemListsOf(def).map((l) => l.path.join('.'));
  assert.deepEqual(lists(coin()), ['body.pictures.draw', 'body.pictures.motion', 'body.pictures.emitters']);
  assert.deepEqual(lists({ version: 2, body: { rig: { shapes: [], bones: [] } } }), ['body.rig.shapes']);
  assert.deepEqual(lists({ version: 2, body: { emitters: [], draw: [] } }), ['body.emitters', 'body.draw']);
  assert.deepEqual(lists({ version: 2, body: { layers: [{ name: 'far', draw: [] }, { name: 'mid', draw: [] }] } }), ['body.layers.0.draw', 'body.layers.1.draw']);
  assert.deepEqual(lists({ version: 2, body: { panel: { piece: {}, draw: [] } } }), ['body.panel.draw']);
  assert.deepEqual(lists({ version: 2, body: { tiles: { groups: [] } } }), []);
  const place = Object.fromEntries(M.itemListsOf(coin()).map((l) => [l.path.at(-1), l.place]));
  assert.deepEqual(place, { draw: 'draw', motion: 'motion', emitters: 'emitter' });
  const word = (def) => M.itemListsOf(def).map((l) => l.word);
  assert.deepEqual(word(coin()), ['Draw', 'Motion', 'Emitter']);
  assert.deepEqual(word({ version: 2, body: { layers: [{ name: 'far', draw: [] }] } }), ['Layer "far", item']);
  assert.deepEqual(M.errorsFor(['Layer "far", item 2: seed must be', 'Layer "far", item 12: x'], { word: 'Layer "far", item', index: 1 }), ['Layer "far", item 2: seed must be']);
});

test('nodes, and the paints a definition offers', () => {
  assert.deepEqual(M.nodesOf(coin()), ['coin']);
  assert.deepEqual(M.nodesOf({ body: { rig: { bones: [{ id: 'a' }, { id: 'b' }], nodes: [{ id: 'n' }] } } }), ['a', 'b', 'n']);
  const p = M.paintRefs(coin());
  for (const x of ['gold', 'gold.light', 'gold.dark', 'light', 'ink', 'clear']) assert.ok(p.includes(x), x);
  assert.ok(M.paintRefs({ colours: [{ id: 'skin' }] }).includes('skin.dark'), 'a version 1 rig\'s colours count');
});

test('labels in everyday words', () => {
  const [face, mark, outline, glint] = coin().body.pictures.draw;
  assert.match(M.itemLabel(face), /round/i);
  assert.match(M.itemLabel(face), /face/);
  assert.match(M.itemLabel(mark), /pixels/i);
  assert.match(M.itemLabel(outline), /outline/i);
  assert.match(M.itemLabel(glint), /glint@1/);
});

test('new shapes sit on a node, with a fresh id, and validate in a picture', () => {
  for (const kind of M.SHAPE_KINDS) {
    const s = M.newShape(kind, { on: 'coin', paint: 'gold', taken: ['face'] });
    assert.equal(s.kind, kind);
    if (kind !== 'outline') { assert.equal(s.on, 'coin'); assert.ok(s.id && s.id !== 'face', kind); }
  }
  const r = M.newShape('ellipse', { bone: 'body', paint: 'skin', taken: [] });
  assert.equal(r.bone, 'body');
  assert.equal(r.on, undefined);
});

test('moving an item shifts its points by whole pixels; a bound point is not moved', () => {
  assert.deepEqual(M.moveItem({ kind: 'dot', at: [1, 2] }, 2, -1).at, [3, 1]);
  assert.deepEqual(M.moveItem({ kind: 'line', from: [0, 0], to: [3, 3] }, 1, 1), { kind: 'line', from: [1, 1], to: [4, 4] });
  assert.deepEqual(M.moveItem({ kind: 'poly', points: [[0, 0], [2, 0], [1, 2]] }, -1, 0).points, [[-1, 0], [1, 0], [0, 2]]);
  assert.equal(M.moveItem({ kind: 'dot', at: [{ from: 'size', map: [[0, 1], [1, 2]] }, 0] }, 1, 0), null);
  assert.equal(M.moveItem({ kind: 'outline' }, 1, 0), null);
  assert.deepEqual(M.moveItem({ gen: 'glint', v: 2, at: [0, 0] }, 0, 3).at, [0, 3]);
});

test('a library sprite opens as a copy: a new id, "made from library:<id>", the same drawing (DQ5)', () => {
  const r = M.copyOfLibrary(coin(), { taken: ['coin', 'coin-copy'] });
  assert.equal(r.id, 'coin-copy-2');
  assert.equal(r.name, 'Coin (copy)');
  assert.deepEqual(r.made, { in: 'studio', from: 'library:coin' });
  assert.deepEqual(r.body, COIN.body);
  const same = M.copyOfLibrary(coin(), { keepId: true });
  assert.equal(same.id, 'coin');
  assert.equal(same.name, 'Coin');
  assert.deepEqual(same.made, { in: 'studio', from: 'library:coin' });
  const long = M.copyOfLibrary({ ...coin(), id: 'a'.repeat(40), name: 'N'.repeat(60) });
  assert.ok(long.id.length <= 40 && /^[a-z][a-z0-9-]*$/.test(long.id));
  assert.ok(long.name.length <= 60);
});

test('the file for the library is <id>.json, one-space JSON as the library\'s files are', () => {
  const f = M.fileOf(coin());
  assert.equal(f.name, 'coin.json');
  assert.equal(f.type, 'application/json');
  assert.deepEqual(JSON.parse(f.text), COIN);
  assert.ok(f.text.startsWith('{\n "format": "loadout-sprite",'));
  assert.ok(f.text.endsWith('}\n'));
});

test('validator messages are matched to the rows they are about', () => {
  const msgs = ['Draw 1 "face": r must be a number', 'Draw 12: at is missing', 'Colour "gold": default must be a colour', 'Clip "spin": frames must be', 'Control "size": nothing uses it', 'Emitter "burst": no such generator'];
  assert.deepEqual(M.errorsFor(msgs, { word: 'Draw', index: 0, id: 'face' }), [msgs[0]]);
  assert.deepEqual(M.errorsFor(msgs, { word: 'Draw', index: 11 }), [msgs[1]]);
  assert.deepEqual(M.errorsFor(msgs, { word: 'Draw', index: 1 }), []);
  assert.deepEqual(M.errorsFor(msgs, { word: 'Colour', id: 'gold' }), [msgs[2]]);
  assert.deepEqual(M.errorsFor(msgs, { word: 'Clip', id: 'spin' }), [msgs[3]]);
  assert.deepEqual(M.errorsFor(msgs, { word: 'Control', id: 'size' }), [msgs[4]]);
  assert.deepEqual(M.errorsFor(msgs, { word: 'Emitter', id: 'burst' }), [msgs[5]]);
});

test('palette slots, controls and clips are added and removed as data', () => {
  let d = M.addPaletteSlot(coin(), { label: 'Rim' });
  const slot = d.palette.at(-1);
  assert.match(slot.id, /^[a-z][a-z0-9-]*$/);
  assert.match(slot.default, /^#[0-9a-f]{6}$/);
  assert.equal(slot.label, 'Rim');
  d = M.addControl(d, 'range', { label: 'Glow' });
  const c = d.controls.at(-1);
  assert.equal(c.kind, 'range');
  assert.equal(c.default, 0.5);
  d = M.addControl(d, 'choice', { label: 'Look' });
  assert.deepEqual(d.controls.at(-1).options, ['one', 'two']);
  d = M.addControl(d, 'toggle', { label: 'Shiny' });
  assert.equal(d.controls.at(-1).default, true);
  const k = M.addClip(d, 'wobble', { frames: 6, fps: 8 });
  assert.deepEqual(k.clips.wobble, { label: 'Wobble', frames: 6, fps: 8, loop: true });
  assert.equal(M.addClip(d, 'Bad Name'), null);
  assert.equal(M.addClip(d, 'spin'), null, 'a clip that is there already');
});

test('stamps outside the draw lists are found, to be painted (a tileset\'s decals, a generator\'s place)', () => {
  const def = { version: 2, body: { tiles: { groups: [{ decals: [{ draw: [{ kind: 'stamp', rows: ['a'], key: { a: 'ink' } }] }], material: { fill: { versions: [[{ gen: 'scatter', v: 1, place: { kind: 'stamp', rows: ['b'], key: { b: 'ink' } } }]] } } }] } } };
  assert.deepEqual(M.nestedStamps(def).map((s) => s.path.join('.')), ['body.tiles.groups.0.decals.0.draw.0', 'body.tiles.groups.0.material.fill.versions.0.0.place']);
  assert.deepEqual(M.nestedStamps(coin()), [], 'the coin\'s stamp is an item of its draw list');
});
