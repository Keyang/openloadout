// The tiles body after its first review (build item B15; docs/data-sprites.md 2.3, 3.3, 4.3; engine/gen/tiles.js).
// Held to here:
//   - a 16 px tileset is refused by the validator with the layout's own reason, so the studio and route 2 get a
//     validation error and not a load failure
//   - a group asking for N fills draws N different fill versions: the validator refuses fewer versions than fills (and
//     warns of versions it will never draw), the layout refuses them from a shared material, and the forest fixture's
//     three fills differ
//   - a shared material (a `material:` piece) is checked like a material written in place (catalog/sprite-schema.js
//     checkMaterialPiece; engine/resolve.js runs it where a tileset uses one, so a bad one fails at load naming the
//     piece), and its profiles live in the piece: it draws the same in every tileset, whatever their own profiles
//   - `outside`: paint beyond the outline as data (rules by column, row and, on soft ground, px beyond the line), drawn
//     exactly as engine/tiles.js draws a code material's outside function; a rule may carry a `when`
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { Surface } from '../../engine/surface.js';
import { ramp } from '../../engine/color.js';
import { drawBlock, drawSoftBlock, BLOCK_PIECES, NARROW_PIECES } from '../../engine/tiles.js';
import { createPieceStore, pieceRegistry } from '../../engine/pieces.js';
import { validateSprite, checkMaterialPiece } from '../../catalog/sprite-schema.js';
import { testPieces } from '../fixtures/resolve/helpers.mjs';

const FIX = new URL('../fixtures/v2/', import.meta.url);
const load = (p) => JSON.parse(fs.readFileSync(new URL(p, FIX), 'utf8'));
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const draw = (fn) => { const g = new Surface(32, 32); fn(g); return g; };

const SOIL = '#7a5236', GRASS = '#5aa040';
const soil = ramp(SOIL), grass = ramp(GRASS);
function tileset(group, extra = {}) {
  return {
    format: 'loadout-sprite', version: 2, id: 'tiles-test', name: 'Test tiles', blurb: 'Tiles for a test.', size: [32, 32], pivot: [16, 16], grounded: false,
    meta: { type: 'tileset', role: 'world/tile', view: extra.view ?? 'side', themes: ['forest'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [{ id: 'soil', label: 'Soil', default: SOIL, material: 'earth' }, { id: 'grass', label: 'Grass', default: GRASS, material: 'plant' }],
    controls: extra.controls ?? [],
    body: { tiles: { tile: 32, ...(extra.profiles !== null ? { profiles: extra.profiles ?? { dips: [0, 1, 2, 3, 2, 1, 0, 0] } } : {}), groups: [group] } },
  };
}
const plain = (more = {}) => ({ fill: { base: 'soil' }, edges: { top: { depth: 3, bands: [{ rows: [1, 1], paint: 'grass.light' }, { rows: [2, 99], paint: 'grass' }] } }, ...more });
const mark = (x, y) => [{ kind: 'rect', at: [x, y], size: [3, 2], paint: 'soil.dark' }];

// ---- 16 px --------------------------------------------------------------------------------------------------------

test('a 16 px tileset is refused by the validator with the layout\'s reason (not only at load)', () => {
  const d = tileset({ name: 'grass', kind: 'block', material: plain() });
  d.body.tiles.tile = 16; d.size = [16, 16]; d.pivot = [8, 8];
  const r = validateSprite(d);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /16 px tiles are not drawn yet/);
  const odd = tileset({ name: 'grass', kind: 'block', material: plain() });
  odd.body.tiles.tile = 24;
  assert.match(validateSprite(odd).errors.join('\n'), /16 or 32/, 'any other size keeps its message');
});

// ---- fills and fill versions ----------------------------------------------------------------------------------------

test('a group asking for N fills needs N fill versions: fewer is an error naming both numbers, more a warning', () => {
  const few = validateSprite(tileset({ name: 'grass', kind: 'block', fills: 3, material: plain({ fill: { base: 'soil', versions: [mark(8, 8)] } }) }));
  assert.equal(few.ok, false);
  assert.match(few.errors.join('\n'), /fills 3.*1 fill version/);
  const none = validateSprite(tileset({ name: 'grass', kind: 'block', fills: 2, material: plain() }));
  assert.match(none.errors.join('\n'), /fills 2.*no fill versions/);
  const many = validateSprite(tileset({ name: 'grass', kind: 'block', fills: 1, material: plain({ fill: { base: 'soil', versions: [mark(8, 8), mark(20, 20)] } }) }));
  assert.equal(many.ok, true, many.errors.join('; '));
  assert.match(many.warnings.join('\n'), /2 fill versions.*fills 1/);
  const ok = validateSprite(tileset({ name: 'grass', kind: 'block', fills: 2, material: plain({ fill: { base: 'soil', versions: [[], mark(20, 20)] } }) }));
  assert.equal(ok.ok, true, ok.errors.join('; '));
  // a tileset-wide material is held to each group's own count
  const d = tileset({ name: 'a', kind: 'block', fills: 2 });
  d.body.tiles.material = plain({ fill: { base: 'soil', versions: [[], mark(8, 8)] } });
  d.body.tiles.groups.push({ name: 'b', kind: 'floor', fills: 3 });
  assert.match(validateSprite(d).errors.join('\n'), /Group "b".*fills 3.*2 fill versions/);
});

test('the forest fixture\'s three fills are three different pictures', () => {
  const s = dataSprite(load('tiles-forest.json'), { pieces: testPieces() });
  const [a, b, c] = ['grass-fill', 'grass-fill-b', 'grass-fill-c'].map((n) => renderFrame(s, n, 0, {}));
  assert.ok(!same(a, b) && !same(a, c) && !same(b, c), 'no two fill versions alike');
});

// ---- shared materials -------------------------------------------------------------------------------------------

const MAT_SLOTS = [{ id: 'm', default: SOIL, material: 'earth' }, { id: 'e', default: GRASS, material: 'plant' }];
const matPiece = (body, id = 'material:test-grass') => JSON.stringify({ format: 'loadout-piece', version: 1, id, v: 1, name: 'Test grass', about: 'A test material.', slots: MAT_SLOTS, body });
const GOOD = {
  profiles: { bumps: [0, 0, 1, 2, 3, 2, 1, 0] },
  fill: { base: 'm', versions: [[], [{ kind: 'rect', at: [10, 12], size: [4, 2], paint: 'm.dark' }]] },
  edges: { top: { depth: 4, inset: { profile: 'bumps', amount: 1 }, bands: [{ rows: [1, 1], paint: 'e.light' }, { rows: [2, 99], paint: 'e' }] }, left: { depth: 1, bands: [{ rows: [1, 1], paint: 'm.dark' }] } },
};
const storeWith = (body) => { const s = createPieceStore(); s.add(matPiece(body), 'material-test-grass.v1.json'); return s; };
const usesPiece = (profiles) => tileset({ name: 'g', kind: 'block', fills: 2, material: { use: 'material:test-grass', v: 1, paint: { m: 'soil', e: 'grass' } } }, { profiles });

test('checkMaterialPiece holds a shared material to the rules of one written in place, against its own slots and profiles', () => {
  const piece = (body) => ({ id: 'material:test-grass', v: 1, slots: MAT_SLOTS, body });
  assert.deepEqual(checkMaterialPiece(piece(GOOD)).errors, []);
  const bad = { ...GOOD, edges: { top: { depth: 1e9, inset: { profile: 'nope', amount: 1 }, bands: [{ rows: 'x', paint: 'm' }, { rows: [1, 2], paint: 'soil' }] } }, round: 1e9, bogus: { a: 1 } };
  const r = checkMaterialPiece(piece(bad));
  const all = r.errors.join('\n');
  assert.match(all, /depth/);
  assert.match(all, /"nope" is not a profile/);
  assert.match(all, /rows/);
  assert.match(all, /"soil".*not a colour/, 'paints name the piece\'s own slots, not a sprite\'s');
  assert.match(all, /round/);
  assert.match(r.warnings.join('\n'), /bogus/);
  assert.match(checkMaterialPiece(piece({ ...GOOD, face: { draw: [], top: 'm' } })).errors.join('\n'), /face.*top.*tone/, 'a face top in a piece names a tone (only those are renamed)');
  assert.deepEqual(checkMaterialPiece({ id: 'stamp:clod', v: 1, slots: [], body: { rows: ['a'] } }).errors, [], 'other kinds pass through');
});

test('a bad shared material fails at load, naming the piece; a good one draws', () => {
  const bad = { ...GOOD, edges: { top: { depth: 4, inset: { profile: 'nope', amount: 1 }, bands: [{ rows: 'x', paint: 'm' }] } } };
  assert.throws(() => dataSprite(usesPiece(undefined), { pieces: storeWith(bad) }), /material:test-grass.*nope/s);
  const s = dataSprite(usesPiece(undefined), { pieces: storeWith(GOOD) });
  assert.ok(renderFrame(s, 'g-top', 0, {}).data.some((v) => v >>> 24));
});

test('a shared material\'s profiles live in the piece: it draws the same in tilesets with other profiles or none, as the same material written in place', () => {
  const inline = { ...GOOD, edges: GOOD.edges, fill: { base: 'soil', versions: [[], [{ kind: 'rect', at: [10, 12], size: [4, 2], paint: 'soil.dark' }]] } };
  const ren = JSON.parse(JSON.stringify(inline).replaceAll('"e.light"', '"grass.light"').replaceAll('"e"', '"grass"').replaceAll('"m.dark"', '"soil.dark"'));
  delete ren.profiles;
  const want = dataSprite(tileset({ name: 'g', kind: 'block', fills: 2, material: ren }, { profiles: { bumps: GOOD.profiles.bumps } }));
  const a = dataSprite(usesPiece({ bumps: [3, 3, 3, 3] }), { pieces: storeWith(GOOD) });
  const b = dataSprite(usesPiece(null), { pieces: storeWith(GOOD) });
  for (const clip of ['g-top', 'g-left', 'g-side-l', 'g-bottom-r', 'g-inner-tl', 'g-fill', 'g-fill-b']) {
    const w = renderFrame(want, clip, 0, {});
    assert.ok(same(renderFrame(a, clip, 0, {}), w), `${clip}, a tileset with its own "bumps": ${diff(renderFrame(a, clip, 0, {}), w)} px differ`);
    assert.ok(same(renderFrame(b, clip, 0, {}), w), `${clip}, a tileset with no profiles`);
  }
});

test('a shared material with fewer fill versions than the group\'s fills fails at load, naming the piece and both numbers', () => {
  const one = { ...GOOD, fill: { base: 'm', versions: [[]] } };
  assert.throws(() => dataSprite(usesPiece(undefined), { pieces: storeWith(one) }), /fills 2.*material:test-grass has 1 fill version/);
});

// ---- outside ------------------------------------------------------------------------------------------------------

test('outside: paint beyond the outline as data, exactly as engine/tiles.js draws a code material\'s outside', () => {
  const controls = [{ key: 'damp', kind: 'toggle', label: 'Damp', default: true }];
  const def = tileset({ name: 'rock', kind: 'block', pieces: ['block', 'narrow'], material: plain({
    edges: { top: { depth: 3, bands: [{ rows: [1, 99], paint: 'grass' }] }, bottom: { depth: 2, inset: { profile: 'dips', amount: 1 }, bands: [{ rows: [1, 99], paint: 'soil.dark' }] } },
    outside: [{ x: [5, 5], y: [31, 31], paint: 'grass.light', when: { damp: [true] } }, { x: [5, 5], y: [16, 31], paint: 'grass', when: { damp: [true] } }, { x: [20, 22], y: [0, 2], paint: 'soil.dark' }],
  }) }, { controls });
  const r = validateSprite(def);
  assert.equal(r.ok, true, r.errors.join('; '));
  const s = dataSprite(def);
  const D = [0, 1, 2, 3, 2, 1, 0, 0];
  const mat = (damp) => ({
    fill: () => SOIL, top: { depth: 3, paint: () => grass.base }, bottom: { depth: 2, inset: (u) => D[u % 8], paint: () => soil.dark },
    outside: (x, y) => (damp && x === 5 && y === 31 ? grass.light : damp && x === 5 && y >= 16 ? grass.base : x >= 20 && x <= 22 && y <= 2 ? soil.dark : null),
  });
  for (const damp of [true, false]) for (const piece of [...BLOCK_PIECES, ...NARROW_PIECES]) {
    const want = draw((g) => drawBlock(g, piece, mat(damp), 0));
    const got = renderFrame(s, `rock-${piece}`, 0, { damp });
    assert.ok(same(got, want), `${piece}, damp ${damp}: ${diff(got, want)} px differ`);
  }
});

test('outside on soft ground: rules by px beyond the line (out), as drawSoftBlock\'s outside(x, y, t, out)', () => {
  const def = tileset({ name: 'path', kind: 'block', pieces: ['block'], material: { soft: true, ink: 'none', round: 6, fill: { base: 'soil' },
    edges: { top: { depth: 1, bands: [{ rows: [1, 1], paint: 'soil.dark' }] }, bottom: { depth: 1, bands: [{ rows: [1, 1], paint: 'soil.dark' }] }, left: { depth: 1, bands: [{ rows: [1, 1], paint: 'soil.dark' }] }, right: { depth: 1, bands: [{ rows: [1, 1], paint: 'soil.dark' }] } },
    outside: [{ out: [1, 1], paint: 'grass.dark' }, { out: [2, 3], paint: 'grass' }] } }, { view: 'top-down' });
  const r = validateSprite(def);
  assert.equal(r.ok, true, r.errors.join('; '));
  const s = dataSprite(def);
  const mat = { ink: null, round: 6, fill: () => SOIL, top: { depth: 1, paint: () => soil.dark }, bottom: { depth: 1, paint: () => soil.dark }, left: { depth: 1, paint: () => soil.dark }, right: { depth: 1, paint: () => soil.dark },
    outside: (x, y, t, out) => (out === 1 ? grass.dark : out >= 2 && out <= 3 ? grass.base : null) };
  for (const piece of BLOCK_PIECES) {
    const want = draw((g) => drawSoftBlock(g, piece, mat, 0));
    const got = renderFrame(s, `path-${piece}`, 0, {});
    assert.ok(same(got, want), `${piece}: ${diff(got, want)} px differ`);
  }
});

test('outside rules are checked: ranges inside the tile, a paint of the palette', () => {
  const bad = tileset({ name: 'rock', kind: 'block', material: plain({ outside: [{ x: [5, 40], paint: 'grass' }, { y: [0, 3], paint: 'mud' }, { out: [0, 2], paint: 'grass' }, 'no'] }) });
  const all = validateSprite(bad).errors.join('\n');
  assert.match(all, /outside rule 1.*x/);
  assert.match(all, /outside rule 2.*"mud"/);
  assert.match(all, /outside rule 3.*out/);
  assert.match(all, /outside rule 4/);
});

test('a shared material is checked through the pieces given to the validator too: its use passes, its kind is material', () => {
  const store = storeWith(GOOD);
  const r = validateSprite(usesPiece(undefined), { pieces: pieceRegistry(store) });
  assert.equal(r.ok, true, r.errors.join('; '));
});

test('a thin platform draws nothing beyond its outline: outside is for blocks (a drip under a ceiling, not under a ledge)', () => {
  const def = tileset({ name: 'rock', kind: 'block', pieces: ['block', 'thin'], material: plain({ outside: [{ x: [0, 31], y: [0, 31], paint: 'grass.dark' }] }) });
  const s = dataSprite(def);
  for (const clip of ['rock-thin-l', 'rock-thin-m', 'rock-thin-r']) {
    const g = renderFrame(s, clip, 0, {});
    assert.ok(!g.data.slice(20 * 32).some((v) => v >>> 24), `${clip}: below the ledge stays see-through`);
  }
  assert.ok(renderFrame(s, 'rock-top', 0, {}).data.slice(0, 32).some((v) => v >>> 24), 'a block piece paints beyond its outline');
});

test('the cave redraw\'s drips: damp water hangs from the ceiling\'s hollow exactly as the code tileset\'s does, never under a ledge', async () => {
  const { codeSprite } = await import('../helpers/library.mjs');
  const code = await codeSprite('tiles-cave');
  const data = dataSprite(load('tiles/tiles-cave.json'));
  for (const set of [{ damp: true, jagged: 1 }, { damp: true, jagged: 0.5 }, { damp: false, jagged: 1 }]) {
    for (const clip of ['rock-bottom', 'rock-bottom-l', 'rock-bottom-r', 'rock-strip-m', 'rock-thin-m']) {
      const a = renderFrame(code, clip, 0, { ...defaultParams(code), ...set }), b = renderFrame(data, clip, 0, set);
      for (let y = 27; y < 32; y++) assert.equal(b.data[y * 32 + 25], a.data[y * 32 + 25], `${clip} ${JSON.stringify(set)} column 25 row ${y}`);
    }
  }
});
