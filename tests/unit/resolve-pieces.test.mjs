// The settings resolver (engine/resolve.js, B4): pieces named with `use` (engine/pieces.js, B7). Their args from
// values or bindings, held to the piece's own types; their slots coloured as engine/pieces.js bindSlots says (the
// use's paint map, else the palette slot of the same id, else the slot's default); pieces inside pieces; a missing
// piece refused; every expansion capped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSprite } from '../../engine/resolve.js';
import { testPieces } from '../fixtures/resolve/helpers.mjs';
import { stubRegistry } from '../fixtures/v2/registry.mjs';
import { createPieceStore, pieceRegistry } from '../../engine/pieces.js';
import { ramp } from '../../engine/color.js';

const store = testPieces();
const base = (draw, more = {}) => ({
  format: 'loadout-sprite', version: 2, id: 'thing', name: 'Thing', blurb: 'A thing for tests.', size: [32, 32], pivot: [16, 30],
  meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['thing'], license: 'draft' },
  palette: [ { id: 'hair', label: 'Moss', default: '#4f9d57', material: 'plant' }, { id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' } ],
  controls: [ { key: 'tall', kind: 'range', label: 'Tall', default: 0.5 }, { key: 'look', kind: 'choice', label: 'Look', options: ['plain', 'mossy'], default: 'mossy' } ],
  body: { pictures: { nodes: [{ id: 'top', parent: null, at: [16, 16] }], draw: [...draw,
    { id: 'base', kind: 'rect', on: 'top', at: [0, 4], size: [{ from: 'tall', map: [[0, 1], [1, 2]], round: 'px' }, 1], paint: { from: 'look', pick: { plain: 'wood', mossy: 'hair' } } }] } },
  clips: { idle: { frames: 1, fps: 1 } },
  ...more,
});
const R = (def, s = {}, o = {}) => resolveSprite(def, s, { pieces: store, generators: stubRegistry(), ...o });

test('a part with a nested stamp: args from a binding, slots by name and by the paint map, placed at its point', () => {
  const def = base([
    { kind: 'rect', on: 'top', at: [0, 0], size: [4, 4], paint: 'wood' },
    { id: 'tuft', kind: 'use', use: 'part:test-tuft', v: 1, on: 'top', at: [3, -2], z: 5, args: { length: { from: 'tall', map: [[0, 1], [1, 4]] } }, when: { look: ['mossy'] } } ]);
  assert.equal(R(def).ok, true, 'it passes the check');
  // catalog/sprite-schema.js (B1) drops `at` from a use shape today, so the placing is tested on the definition as written
  const r = R(def, {}, { validated: true });
  assert.equal(r.ok, true, r.errors.join('; '));
  const tuft = r.body.pictures.draw.filter((s) => s.id === 'tuft');
  assert.equal(tuft.length, 3, 'two lines and the clod stamp');
  assert.ok(tuft.every((s) => s.on === 'top' && s.z === 5));
  assert.deepEqual(tuft[0].from, [3, -2], 'moved to the use\'s point');
  assert.deepEqual(tuft[0].to, [3, -5]);
  assert.equal(tuft[0].paint, 'hair', 'the tuft\'s hair slot is the sprite\'s hair slot (same id)');
  assert.equal(tuft[1].paint, 'hair.light');
  const clod = tuft[2];
  assert.equal(clod.kind, 'stamp');
  assert.deepEqual(clod.rows, ['b.', 'aa']);
  assert.deepEqual(clod.at, [3, -1], 'the stamp\'s own point plus the use\'s');
  assert.equal(clod.anchor, 'bc');
  // the clod's a is mapped to hair.dark (a tone: a slot of its own), b to hair
  assert.equal(clod.key.b, 'hair');
  const a = clod.key.a;
  assert.notEqual(a, 'hair.dark');
  assert.equal(r.palette[a].hex, ramp('#4f9d57').dark, 'a tone mapped to a slot is a slot of that colour');
  assert.equal(r.palette[a].material, 'plant');
  assert.equal(R(def, { look: 'plain' }, { validated: true }).body.pictures.draw.some((s) => s.id === 'tuft'), false);
});

test('piece args: values, bindings, defaults; held to the piece\'s types', () => {
  const draw = (args) => [{ id: 'h', kind: 'use', use: 'part:hair', v: 1, on: 'top', args, paint: { hair: 'wood' } }];
  const fall = (r) => r.body.pictures.draw.find((s) => s.id === 'h' && s.kind === 'rect');
  assert.equal(fall(R(base(draw({ style: 'fall', length: 12 })))).size[1], 12);
  assert.equal(fall(R(base(draw({ style: 'crop' })))), undefined, 'the default style is crop: no fall');
  assert.equal(fall(R(base(draw({ style: { from: 'look', pick: { plain: 'crop', mossy: 'fall' } } })))).size[1], 4, 'length at its default 3 -> 4 tall');
  assert.equal(R(base(draw({ style: 'fall', length: { from: 'tall', map: [[0, 0], [1, 40]] } }))).ok, false, 'the check refuses a table that leaves the arg\'s range');
  const r = R(base(draw({ style: 'fall', length: { from: 'tall', map: [[0, 0], [1, 40]] } })), { tall: 1 }, { validated: true });
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(fall(r).size[1], 12, 'an arg is held to its type\'s range (length 0..12)');
  const bad = R(base(draw({ style: 'mohawk' })), {}, { validated: true });
  assert.equal(bad.ok, true);
  assert.equal(fall(bad), undefined, 'an option the piece does not have: its default');
  assert.ok(bad.warnings.some((w) => /mohawk/.test(w)));
});

test('pieces inside pieces: args passed down as bindings of the outer piece\'s args', () => {
  const def = base([{ id: 'deep', kind: 'use', use: 'part:deep', v: 1, on: 'top', args: { length: 4 } }]);
  const r = R(def);
  assert.equal(r.ok, true, r.errors.join('; '));
  const items = r.body.pictures.draw.filter((s) => s.id === 'deep');
  assert.equal(items.length, 4, 'the tuft (three) and the dot');
  const line = items.find((s) => s.kind === 'line');
  assert.deepEqual(line.from, [2, 0]);
  const dot = items.find((s) => s.kind === 'dot');
  assert.equal(dot.paint, 'hair.dark', 'the deep piece\'s hair is the sprite\'s hair (same id)');
});

test('a missing or unloaded piece is refused with its name; nothing throws', () => {
  const def = base([{ id: 'x', kind: 'use', use: 'part:hair', v: 1, on: 'top', paint: { hair: 'wood' } }]);
  const empty = createPieceStore();
  const r = resolveSprite(def, {}, { pieces: empty, generators: stubRegistry(), validated: true });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /part:hair@1/);
  const none = resolveSprite(def, {}, { generators: stubRegistry(), validated: true });
  assert.equal(none.ok, false);
  assert.match(none.errors.join(' '), /piece/);
});

test('a definition naming pieces is checked against the pieces it is given', () => {
  const def = base([{ id: 'x', kind: 'use', use: 'part:hair', v: 2, on: 'top' }]);
  const r = R(def);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length);
});

test('expansions are capped: a piece used over and over stops with an error, not a hang', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ id: `t${i}`, kind: 'use', use: 'part:test-tuft', v: 1, on: 'top', at: [i % 30, 0] }));
  const def = base(many);
  const t0 = performance.now();
  const r = resolveSprite(def, {}, { pieces: store, generators: stubRegistry(), validated: true });
  assert.ok(performance.now() - t0 < 2000);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /at most/);
});

test('the base piece is merged by id: the asset replaces a base shape, drops another, adds its own', () => {
  const knightish = {
    format: 'loadout-sprite', version: 2, id: 'squire', name: 'Squire', blurb: 'A squire for tests.', size: [64, 64], pivot: [28, 58],
    meta: { type: 'character', role: 'characters/player', view: 'side', themes: ['fantasy'], gameTypes: ['platformer'], words: ['squire'], license: 'draft' },
    palette: [ { id: 'skin', label: 'Skin', default: '#e0a878', material: 'skin' }, { id: 'outfit', label: 'Tunic', default: '#3a6ea5', material: 'cloth' },
               { id: 'trousers', label: 'Trousers', default: '#554433', material: 'cloth' }, { id: 'metal', label: 'Metal', default: '#b8c4cc', material: 'metal' },
               { id: 'eye', default: '#231b33', detail: true } ],
    body: { rig: { extends: { use: 'base:person-side', v: 1, drop: ['legB'] },
      shapes: [ { id: 'skull', kind: 'ellipse', on: 'head', at: [3, 0], r: [5, 4], paint: 'skin', z: 12 },
                { id: 'eye', kind: 'use', use: 'stamp:eye', v: 1, on: 'head', at: [4, 1], paint: { a: 'eye' }, z: 30 } ] } },
    controls: [], clips: { idle: { from: 'idle' } },
  };
  const r = R(knightish);
  assert.equal(r.ok, true, r.errors.join('; '));
  const shapes = r.body.rig.shapes;
  assert.ok(!shapes.some((s) => s.id === 'legB'), 'dropped');
  assert.deepEqual(shapes.find((s) => s.id === 'skull').r, [5, 4], 'replaced');
  assert.equal(shapes.filter((s) => s.id === 'skull').length, 1);
  assert.equal(shapes.findIndex((s) => s.id === 'skull'), 1, 'in the base\'s place');
  const eye = shapes.find((s) => s.id === 'eye');
  assert.equal(eye.kind, 'stamp');
  assert.deepEqual(eye.variants, { blink: ['.', 'a'] }, 'a stamp piece keeps its variants');
  assert.deepEqual(eye.key, { a: 'eye' });
  assert.equal(shapes.find((s) => s.id === 'torso').paint, 'outfit', 'base slots bound to the palette by id');
});

test('pieceRegistry and the store agree: what validates resolves', () => {
  const reg = pieceRegistry(store);
  assert.ok(reg.piece('part:hair', 1));
});

test('slot order (engine/pieces.js bindSlots): the use\'s paint map first, then the palette slot of the same id, then the slot\'s default', () => {
  const use = (paint) => ({ id: 'h', kind: 'use', use: 'part:hair', v: 1, on: 'top', args: { style: 'fall', length: 6 }, ...(paint ? { paint } : {}) });
  const paints = (r) => r.body.pictures.draw.filter((s) => s.id === 'h').map((s) => s.paint);
  const mapped = R(base([use({ hair: 'wood' })]));
  assert.equal(mapped.ok, true, mapped.errors.join('; '));
  assert.deepEqual(paints(mapped), ['wood', 'wood.dark'], 'the paint map wins over the palette slot "hair" of the same id');
  assert.equal(Object.values(mapped.palette).some((s) => s.piece), false, 'no colour of its own');
  const byName = R(base([use(null)]));
  assert.equal(byName.ok, true, byName.errors.join('; '));
  assert.deepEqual(paints(byName), ['hair', 'hair.dark'], 'no paint map: the palette slot of the same id');
  const noHair = base([use(null)]);
  noHair.palette = noHair.palette.filter((p) => p.id !== 'hair');
  noHair.body.pictures.draw.at(-1).paint = 'wood';
  const byDefault = R(noHair, {}, { validated: true });
  assert.equal(byDefault.ok, true, byDefault.errors.join('; '));
  const [cap, fall] = paints(byDefault);
  assert.equal(fall, `${cap}.dark`);
  assert.equal(byDefault.palette[cap].hex, '#5a3a22', 'neither: the piece slot\'s default');
  assert.equal(byDefault.palette[cap].piece, 'part:hair@1');
  const bun = R(base([{ ...use({ hair: 'wood' }), args: { style: 'bun' } }]));
  assert.deepEqual(bun.body.pictures.draw.find((s) => s.id === 'h' && s.kind === 'stamp').key, { a: 'wood.light', b: 'wood' }, 'a stamp\'s key follows the same map');
});

test('a list item whose binding picks a use shape draws the piece in, like a use shape written there', () => {
  const thing = (item) => ({ format: 'loadout-sprite', version: 2, id: 'thing', name: 'Thing', blurb: 'A thing for tests.', size: [32, 32], pivot: [16, 30],
    meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['thing'], license: 'draft' },
    palette: [ { id: 'hair', label: 'Moss', default: '#4f9d57', material: 'plant' }, { id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' } ],
    controls: [ { key: 'look', kind: 'choice', label: 'Look', options: ['plain', 'mossy'], default: 'mossy' } ],
    body: { pictures: { nodes: [{ id: 'top', parent: null, at: [16, 16] }], draw: [item] } }, clips: { idle: { frames: 1, fps: 1 } } });
  const useHair = { id: 'h', kind: 'use', use: 'part:hair', v: 1, on: 'top', args: { style: 'fall', length: 6 }, paint: { hair: 'wood' } };
  const opts = { pieces: testPieces(), generators: stubRegistry(), validated: true };
  const direct = resolveSprite(thing(useHair), {}, opts);
  assert.equal(direct.ok, true, direct.errors.join('; '));
  const picked = resolveSprite(thing({ from: 'look', pick: { plain: { id: 'p', kind: 'rect', on: 'top', at: [0, 0], size: [2, 2], paint: 'wood' }, mossy: useHair } }), {}, opts);
  assert.equal(picked.ok, true, picked.errors.join('; '));
  assert.equal(picked.body.pictures.draw.some((s) => s.kind === 'use'), false, 'no raw use shape is left');
  assert.deepEqual(picked.body.pictures.draw, direct.body.pictures.draw);
  assert.deepEqual(picked.pieces, direct.pieces);
  const plain = resolveSprite(thing({ from: 'look', pick: { plain: { id: 'p', kind: 'rect', on: 'top', at: [0, 0], size: [2, 2], paint: 'wood' }, mossy: useHair } }), { look: 'plain' }, opts);
  assert.deepEqual(plain.body.pictures.draw.map((s) => s.id), ['p']);
});

test('a piece slot painted with a colour rule takes the material of the slot the rule reads, as a derived slot does', () => {
  const use = { id: 'h', kind: 'use', use: 'part:hair', v: 1, on: 'top', args: { style: 'fall', length: 6 }, paint: { hair: { rule: 'tone', of: 'wood', by: -0.5 } } };
  const r = R(base([use]));
  assert.equal(r.ok, true, r.errors.join('; '));
  const [slot] = r.body.pictures.draw.filter((s) => s.id === 'h').map((s) => s.paint);
  assert.equal(r.palette[slot].material, 'wood', 'the rule reads wood (the piece slot\'s own material is skin)');
  assert.equal(r.materials.slots[slot], 'wood');
});
