// catalog/sprite-schema.js: the six bodies of format v2 (docs/data-sprites.md 2.2 to 2.5), each from its worked example
// in tests/fixtures/v2, and what each body refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite, BODY_KINDS } from '../../catalog/sprite-schema.js';
import { stubRegistry, stubPieces } from '../fixtures/v2/registry.mjs';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../fixtures/v2/${n}.json`, import.meta.url), 'utf8'));
const opts = { generators: stubRegistry(), pieces: stubPieces() };
const check = (d, o = opts) => validateSprite(d, o);
const errs = (d, o) => check(d, o).errors.join('\n');
const FIX = { knight: 'rig', coin: 'pictures', 'hit-spark': 'emitters', 'ui-button': 'panel', 'bg-forest': 'layers', 'tiles-forest': 'tiles' };

test('the bodies are the design\'s six', () => {
  assert.deepEqual([...BODY_KINDS], ['rig', 'tiles', 'layers', 'panel', 'emitters', 'pictures']);
});

test('every worked example of docs/data-sprites.md passes, with its body kept', () => {
  for (const [name, kind] of Object.entries(FIX)) {
    const r = check(load(name));
    assert.deepEqual(r.errors, [], name);
    assert.equal(r.ok, true, name);
    assert.equal(r.version, 2, name);
    assert.deepEqual(Object.keys(r.value.body), [kind], name);
    assert.equal(r.value.format, 'loadout-sprite');
  }
});

test('the examples pass without a piece list too (pieces are then checked by the resolver); generators never go unchecked', () => {
  for (const name of Object.keys(FIX)) assert.equal(check(load(name), { generators: stubRegistry() }).ok, true, name);
  const r = check(load('coin'), { generators: { generator: () => null } });
  assert.equal(r.ok, false, 'a generator the list does not have is refused');
  assert.match(r.errors.join('\n'), /glint/);
  assert.match(check(load('coin'), { generators: 'all of them' }).errors.join('\n'), /generator list/);
});

test('without opts.generators the site\'s registry (engine/gen/index.js) is used', () => {
  const d = load('coin');
  d.body.pictures.draw = [{ gen: 'twinkle', v: 1, on: 'coin', at: [0, 0], size: { from: 'size', map: [[0, 1], [1, 3]], round: 'px' }, paint: 'gold', core: 'light' }];  // twinkle@1 takes a core paint (B2)
  d.body.pictures.motion = []; d.body.pictures.emitters = [];
  d.controls = d.controls.filter((c) => c.key === 'size');
  delete d.clips.collect;
  const r = validateSprite(d);
  assert.deepEqual(r.errors, []);
  assert.ok(r.uses.includes('twinkle@1'));
  d.body.pictures.draw[0].size = 9;
  assert.match(validateSprite(d).errors.join('\n'), /size/, 'twinkle@1 takes a size from 0 to 4');
});

test('the result names every generator and piece used, as id@v, for the quality cache key', () => {
  const r = check(load('bg-forest'));
  for (const u of ['sky.bands@1', 'scatter@1', 'cloud@1', 'ridge@1', 'mist.band@1', 'treeline@1', 'sky.look@1']) assert.ok(r.uses.includes(u), u);
  const k = check(load('knight'));
  for (const u of ['base:person-side@1', 'part:hair@1', 'part:helmet-plumed@1', 'held:sword@1']) assert.ok(k.uses.includes(u), u);
  assert.deepEqual(k.uses, [...new Set(k.uses)].sort(), 'sorted, each once');
});

test('body: exactly one of the six; library bodies are gone', () => {
  const d = load('coin');
  assert.match(errs({ ...d, body: {} }), /one of rig, tiles, layers, panel, emitters, pictures/);
  assert.match(errs({ ...d, body: { ...d.body, rig: {} } }), /only one/);
  assert.match(errs({ ...d, body: { library: 'humanoid', figure: {} } }), /library bod/i);
  assert.match(errs({ ...d, body: 'pictures' }), /Body/);
});

// ---- rig -----------------------------------------------------------------------------------------------------------

test('rig: extends a base piece; shapes may sit on the base\'s bones; clips come from the base', () => {
  const r = check(load('knight'));
  assert.deepEqual(r.value.body.rig.extends, { use: 'base:person-side', v: 1 });
  assert.equal(r.value.clips.attack.from, 'swing');
  const bad = load('knight');
  bad.body.rig.shapes[0].on = 'tail';
  assert.match(errs(bad), /"tail" is not a bone/);
  const b2 = load('knight'); b2.clips.idle.from = 'sleep';
  assert.match(errs(b2), /"sleep" is not a clip of base:person-side/);
  const b3 = load('knight'); b3.body.rig.extends.v = 7;
  assert.match(errs(b3), /base:person-side.*version 7/);
  const b4 = load('knight'); b4.body.rig.extends = { use: 'part:hair', v: 1 };
  assert.match(errs(b4), /extends.*base/);
  const b5 = load('knight'); b5.body.rig.extends.drop = ['torso', 'nothing'];
  assert.match(errs(b5), /"nothing".*not a shape of base:person-side/);
});

test('rig: without a base a v2 rig needs bones; nodes are pivots of length 0; a limb needs a bone with length', () => {
  const d = load('knight');
  delete d.body.rig.extends;
  assert.match(errs(d), /bones/i);
  d.body.rig.bones = [{ id: 'root', parent: null, at: [28, 40], angle: 180, length: 10 }, { id: 'head', parent: 'root', angle: 0, length: 6 }, { id: 'hip', parent: 'root', from: 0, angle: 0, length: 2 }, { id: 'handF', parent: 'root', from: 0.6, angle: 90, length: 4 }];
  d.body.rig.nodes = [{ id: 'lid', parent: 'head', from: 1, angle: 0 }];
  d.controls[0].scales.bones = ['root', 'head'];
  d.body.rig.shapes.push({ id: 'trunk', kind: 'capsule', on: 'root', from: 0, to: 1, r: [4, 3], paint: 'outfit', z: 10, group: 'body' },
    { id: 'lidShape', kind: 'ellipse', on: 'lid', at: [0, 0], r: [2, 1], paint: 'skin', z: 31 });
  d.clips = { idle: { frames: 8, fps: 7, keys: [{ t: 0, bones: { lid: 10 } }, { t: 0.5, bones: { lid: -10 }, swap: { eye: 'blink' } }] } };
  const r = check(d);
  assert.deepEqual(r.errors, []);
  assert.equal(r.value.body.rig.nodes[0].id, 'lid');
  d.body.rig.shapes.push({ id: 'lidLimb', kind: 'limb', on: 'lid', width: 2, paint: 'skin' });
  assert.match(errs(d), /lidLimb.*limb.*length/);
  d.body.rig.shapes.pop();
  d.clips.idle.keys[1].swap = { eye: 'wink' };
  assert.match(errs(d), /"wink" is not a variant of stamp "eye"/);
});

test('rig: a top-down rig\'s directions may overlay stamps too', () => {
  const d = JSON.parse(fs.readFileSync(new URL('../fixtures/data-sprite/beetle-topdown.json', import.meta.url), 'utf8'));
  d.version = 2;
  const head = d.body.rig.bones[1]?.id ?? d.body.rig.bones[0].id;
  d.body.rig.shapes.push({ id: 'face', kind: 'stamp', on: head, at: [0, 0], rows: ['a.a'], key: { a: d.body.rig.colours[0].id }, variants: { back: ['...'] } });
  d.body.rig.directions.up = { ...(d.body.rig.directions.up ?? {}), stamps: { face: { hidden: true } } };
  d.body.rig.directions.down = { ...(d.body.rig.directions.down ?? {}), stamps: { face: { at: [0, 1], variant: 'back' } } };
  const r = check(d);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.body.rig.directions.up.stamps.face, { hidden: true });
  d.body.rig.directions.down.stamps.face.variant = 'nope';
  assert.match(errs(d), /"nope" is not a variant/);
  d.body.rig.directions.down.stamps = { ghost: { hidden: true } };
  assert.match(errs(d), /"ghost" is not a stamp/);
});

// ---- pictures ------------------------------------------------------------------------------------------------------

test('pictures: a node tree, draw lists on nodes, per-clip lists, motion, emitters, fit and icon sets', () => {
  const d = load('coin');
  d.body.pictures.nodes.push({ id: 'lid', parent: 'coin', at: [0, -4], turn: 0, scale: 1 });
  d.body.pictures.per = { collect: { hide: ['mark'], draw: [{ kind: 'rect', on: 'lid', at: [0, 0], size: [2, 2], paint: 'light' }] } };
  d.clips.spin.keys = [{ t: 0, nodes: { lid: { turn: -40 } } }, { t: 0.5, nodes: { lid: { turn: 0, move: [0, -1] } } }];
  const r = check(d);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.body.pictures.per.collect.hide, ['mark']);
  const bad = load('coin'); bad.body.pictures.nodes.push({ id: 'a', parent: 'b', at: [0, 0] }, { id: 'b', parent: 'a', at: [0, 0] });
  assert.match(errs(bad), /loop/);
  const b2 = load('coin'); b2.body.pictures.motion[1].clip = ['twirl'];
  assert.match(errs(b2), /"twirl" is not a clip/);
  const b3 = load('coin'); b3.body.pictures.motion.push({ gen: 'glint', v: 1, every: 4, paint: 'gold' });
  assert.match(errs(b3), /glint.*motion/);
  const b4 = load('coin'); b4.body.pictures.per = { nothing: { hide: ['mark'] } };
  assert.match(errs(b4), /"nothing" is not a clip/);
  const b5 = load('coin'); b5.clips.collect.keys[0].emit = { boom: { amount: 1 } };
  assert.match(errs(b5), /"boom" is not an emitter/);
});

test('pictures: an icon set writes one clip per picture; fit names icon.fit', () => {
  const d = load('coin');
  d.meta = { ...d.meta, type: 'icon', role: 'items/icon', view: 'none' };
  delete d.clips; delete d.preview;
  d.body.pictures.motion = [];
  d.body.pictures.emitters = [];
  d.body.pictures.pictures = { apple: { label: 'Apple', draw: [{ kind: 'ellipse', at: [16, 16], r: [5, 5], paint: 'gold' }] }, pear: { label: 'Pear', angle: 10, draw: [{ kind: 'ellipse', at: [16, 16], r: [4, 6], paint: 'gold' }] } };
  d.body.pictures.fit = { gen: 'icon.fit', v: 1, size: { from: 'size', map: [[0, 0.4], [1, 0.9]] }, tilt: true };
  d.controls = d.controls.filter((c) => c.key !== 'bob' && c.key !== 'speed');
  const r = check(d);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.clips, ['apple', 'pear'], 'the clips the layout writes');
  d.body.pictures.fit = { gen: 'glint', v: 1, every: 4, paint: 'gold' };
  assert.match(errs(d), /fit.*icon/);
});

// ---- emitters ------------------------------------------------------------------------------------------------------

test('emitters: behaviour generators with typed args; keys blend amount, at and keyable args', () => {
  const r = check(load('hit-spark'));
  assert.equal(r.value.body.emitters.length, 2);
  const d = load('hit-spark');
  d.clips.hit.keys[0].emit.sparks.amount = 2;
  assert.match(errs(d), /amount/);
  const d2 = load('hit-spark'); d2.clips.hit.keys[0].emit.flash.points = 6;
  assert.match(errs(d2), /points.*cannot be keyed|not keyable/);
  const d3 = load('hit-spark'); d3.body.emitters[1].id = 'sparks';
  assert.match(errs(d3), /"sparks".*twice/);
  const d4 = load('hit-spark'); d4.body.emitters[0].gen = 'glint'; d4.body.emitters[0] = { id: 'sparks', gen: 'glint', v: 1, every: 4, paint: 'spark' };
  assert.match(errs(d4), /glint.*fx|behaviour/);
});

// ---- panel ---------------------------------------------------------------------------------------------------------

test('panel: a skin piece, a ui piece generator, states as the clips, slice and text area', () => {
  const r = check(load('ui-button'));
  assert.deepEqual(r.clips, ['normal', 'hover', 'pressed', 'disabled']);
  assert.deepEqual(r.value.slice, { left: 6, top: 6, right: 6, bottom: 6 });
  const d = load('ui-button'); d.clips.clicked = { sounds: [] };
  assert.match(errs(d), /"clicked" is not one of the states/);
  const d2 = load('ui-button'); d2.body.panel.piece.gen = 'ridge';
  assert.match(errs(d2), /piece.*ui/);
  const d3 = load('ui-button'); d3.body.panel.skin = { use: 'part:hair', v: 1 };
  assert.match(errs(d3), /skin/);
  const d4 = load('ui-button'); d4.body.panel.states = { normal: {}, pressed: { lip: 2, lift: -1 } };
  assert.deepEqual(check(d4).errors, []);
  d4.body.panel.states.pressed.lip = 'deep';
  assert.match(errs(d4), /lip/);
  const d5 = load('ui-button'); d5.slice = { left: 60, top: 6, right: 60, bottom: 6 };
  assert.match(errs(d5), /slice/);
});

// ---- layers --------------------------------------------------------------------------------------------------------

test('layers: named layers with scroll, each a list of generators; an item may sit on an earlier one', () => {
  const r = check(load('bg-forest'));
  assert.deepEqual(r.clips, ['far', 'mid']);
  assert.equal(r.value.body.layers[0].wraps, true, 'a layer wraps unless it says not');
  const d = load('bg-forest'); d.body.layers[1].draw[1].on = 'mountain';
  assert.match(errs(d), /"mountain" is not an item/);
  const d2 = load('bg-forest'); d2.body.layers[1].name = 'far';
  assert.match(errs(d2), /"far".*twice/);
  const d3 = load('bg-forest'); d3.body.layers[0].scroll = 5;
  assert.match(check(d3).warnings.join('\n'), /scroll/);
});

// ---- tiles ---------------------------------------------------------------------------------------------------------

test('tiles: groups with pieces and a material as data: band rules, profiles, insets, fill versions and decals', () => {
  const r = check(load('tiles-forest'));
  assert.equal(r.value.body.tiles.groups[0].material.edges.top.bands.length, 6);
  const d = load('tiles-forest'); d.body.tiles.groups[0].material.edges.top.inset.profile = 'wobble';
  assert.match(errs(d), /"wobble" is not a profile/);
  const d2 = load('tiles-forest'); d2.body.tiles.groups[0].material.edges.top.bands[0].rows = 'first';
  assert.match(errs(d2), /rows/);
  const d3 = load('tiles-forest'); d3.body.tiles.groups[0].pieces = ['block', 'corner'];
  assert.match(errs(d3), /"corner"/);
  const d4 = load('tiles-forest'); d4.body.tiles.tile = 24;
  assert.match(errs(d4), /16 or 32/);
  const d5 = load('tiles-forest'); d5.body.tiles.profiles.dips.push(...Array(100).fill(0));
  assert.match(errs(d5), /dips/);
  const d6 = load('tiles-forest'); d6.body.tiles.groups[0].material.edges.top.paint = '(d) => d';
  assert.match(check(d6).warnings.join('\n'), /dropped.*paint/);
  const d7 = load('tiles-forest'); d7.body.tiles.groups[0].material = { use: 'material:stone', v: 1, paint: { stone: 'soil' }, args: { clods: { from: 'texture', map: [[0, 0], [1, 3]], round: 'px' }, depth: { from: 'edge' }, bumps: { from: 'bumps' } } };
  assert.equal(check(d7, { generators: stubRegistry() }).ok, true, 'a shared material piece');
  const d8 = load('tiles-forest'); d8.size = [16, 16];
  assert.match(errs(d8), /size.*32/);
});
