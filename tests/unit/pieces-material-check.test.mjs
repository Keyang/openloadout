// Material pieces are checked when a tileset is validated (build item B15b; the B15 reviews' issue 5). Held to here:
//   - engine/pieces.js validatePiece runs the material body check (catalog/sprite-schema.js checkMaterialPiece) on every
//     material piece, with or without a `check` hook of the caller's, so a piece store (createPieceStore().add, a load),
//     tools/lib/pieces-index.mjs buildPiecesIndex and nodePieceStore all refuse a bad one before any tileset uses it
//   - pieceSummary (and so an index row, and pieceRegistry over either) carries a material's number of fill versions
//     (`fills`), so catalog/sprite-schema.js validateSprite refuses a group asking for more fills than its material piece
//     gives at validation, not only when it draws
//   - a piece arg's lo above its hi is refused (the B15 review 3 minor)
//   - the layout's own guard (engine/gen/tiles.js materialFor): fills against fill versions only on groups that draw
//     middles; a group without middles is drawn whatever its fills say (the validator refuses that, separately)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePiece, createPieceStore, pieceSummary, pieceRegistry, indexEntry } from '../../engine/pieces.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { buildPiecesIndex, nodePieceStore } from '../../tools/lib/pieces-index.mjs';
import { tiles } from '../../engine/gen/tiles.js';
import { resolveSprite, expandFrame } from '../../engine/resolve.js';
import { tileClipNames } from '../../engine/gen/tiles-clips.js';

const SOIL = '#7a5236', GRASS = '#5aa040';
const MAT_SLOTS = [{ id: 'm', default: SOIL, material: 'earth' }, { id: 'e', default: GRASS, material: 'plant' }];
const GOOD = {
  fill: { base: 'm', versions: [[], [{ kind: 'rect', at: [10, 12], size: [4, 2], paint: 'm.dark' }]] },
  edges: { top: { depth: 4, bands: [{ rows: [1, 1], paint: 'e.light' }, { rows: [2, 99], paint: 'e' }] } },
};
const BAD = { ...GOOD, outside: [{ x: [0, 31], paint: 'e', when: { nope: [true] } }] };
const json = (body, more = {}) => JSON.stringify({ format: 'loadout-piece', version: 1, id: 'material:test-grass', v: 1, name: 'Test grass', about: 'A test material.', slots: MAT_SLOTS, body, ...more });
const FILE = 'material-test-grass.v1.json';

function tileset(group) {
  return {
    format: 'loadout-sprite', version: 2, id: 'tiles-test', name: 'Test tiles', blurb: 'Tiles for a test.', size: [32, 32], pivot: [16, 16], grounded: false,
    meta: { type: 'tileset', role: 'world/tile', view: 'side', themes: ['forest'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [{ id: 'soil', label: 'Soil', default: SOIL, material: 'earth' }, { id: 'grass', label: 'Grass', default: GRASS, material: 'plant' }],
    controls: [],
    body: { tiles: { tile: 32, groups: [group] } },
  };
}
const usesPiece = (fills) => tileset({ name: 'g', kind: 'block', fills, material: { use: 'material:test-grass', v: 1, paint: { m: 'soil', e: 'grass' } } });

// ---- the piece's own check -----------------------------------------------------------------------------------------

test('validatePiece checks a material piece\'s body with no check hook given, and with another hook too', () => {
  const r = validatePiece(json(BAD), { file: FILE });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /when names "nope"/);
  const other = validatePiece(json(BAD), { file: FILE, check: () => ({ errors: [] }) });
  assert.match(other.errors.join('\n'), /when names "nope"/, 'a caller\'s own hook does not switch the material check off');
  assert.equal(validatePiece(json(GOOD), { file: FILE }).ok, true);
  // other kinds are not material-checked
  const stamp = JSON.stringify({ format: 'loadout-piece', version: 1, id: 'stamp:test-dot', v: 1, name: 'Dot', about: 'A dot.', slots: [{ id: 'a', default: SOIL }], body: { rows: ['a'] } });
  assert.equal(validatePiece(stamp, { file: 'stamp-test-dot.v1.json' }).ok, true);
});

test('a piece store refuses a bad material piece when it is added (the review\'s probe5): it never reaches a tileset', () => {
  const s = createPieceStore();
  assert.throws(() => s.add(json(BAD), FILE), /material:test-grass.*nope/s);
  assert.equal(s.has('material:test-grass', 1), false);
  const ok = createPieceStore();
  ok.add(json(GOOD), FILE);
  assert.equal(ok.has('material:test-grass', 1), true);
});

test('a piece arg whose lo is above its hi is refused', () => {
  const r = validatePiece(json(GOOD, { args: { d: { type: 'count', lo: 8, hi: 1, default: 3 } } }), { file: FILE });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /args\.d: lo 8 is above hi 1/);
  assert.equal(validatePiece(json(GOOD, { args: { d: { type: 'count', lo: 1, hi: 8, default: 3 } } }), { file: FILE }).ok, true);
});

// ---- what a tileset's check knows of it ----------------------------------------------------------------------------

test('pieceSummary, an index row and pieceRegistry carry a material\'s number of fill versions', () => {
  const p = validatePiece(json(GOOD), { file: FILE }).piece;
  assert.equal(pieceSummary(p).fills, 2);
  assert.equal(indexEntry(p).fills, 2);
  assert.equal(pieceRegistry([indexEntry(p)]).piece('material:test-grass', 1).fills, 2);
  const none = validatePiece(json({ ...GOOD, fill: { base: 'm' } }), { file: FILE }).piece;
  assert.equal(pieceSummary(none).fills, 0);
  const stamp = validatePiece(JSON.stringify({ format: 'loadout-piece', version: 1, id: 'stamp:test-dot', v: 1, name: 'Dot', about: 'A dot.', slots: [{ id: 'a', default: SOIL }], body: { rows: ['a'] } }), { file: 'stamp-test-dot.v1.json' }).piece;
  assert.equal(pieceSummary(stamp).fills, undefined, 'only a material has fills');
});

test('validateSprite refuses a group asking for more fills than its material piece has, from a store or from index rows', () => {
  const store = createPieceStore();
  store.add(json(GOOD), FILE);
  const rows = [indexEntry(store.get('material:test-grass', 1))];
  for (const [name, pieces] of [['store', pieceRegistry(store)], ['index rows', pieceRegistry(rows)]]) {
    const three = validateSprite(usesPiece(3), { pieces });
    assert.equal(three.ok, false, name);
    assert.match(three.errors.join('\n'), /fills 3.*material:test-grass.*2 fill versions/s, name);
    assert.deepEqual(validateSprite(usesPiece(2), { pieces }).errors, [], name);
  }
});

test('tools/lib/pieces-index.mjs: buildPiecesIndex and nodePieceStore refuse a bad material piece file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-pieces-'));
  try {
    fs.mkdirSync(path.join(root, 'pieces'));
    fs.writeFileSync(path.join(root, 'pieces', FILE), json(BAD));
    const { index, errors } = buildPiecesIndex({ root });
    assert.match(errors.join('\n'), /material-test-grass\.v1\.json.*nope/s);
    assert.equal(index.pieces.some((e) => e.id === 'material:test-grass'), false);
    await assert.rejects(nodePieceStore({ root }).load('material:test-grass@1'), /nope/);
    fs.writeFileSync(path.join(root, 'pieces', FILE), json(GOOD));
    const good = buildPiecesIndex({ root });
    assert.deepEqual(good.errors, []);
    assert.equal(good.index.pieces.find((e) => e.id === 'material:test-grass').fills, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ---- the layout's fills guard (B15 review 3: no test called the layout directly) ---------------------------------------

/** Lays out one clip of a definition straight through tiles@1 (no validator in front), as engine/data-sprite.js would. */
function layOut(def, clip) {
  const R = resolveSprite(def, {}, { validated: true });   // no validator in front: the layout's own guard is tested
  assert.equal(R.ok, true, (R.errors ?? []).join('; '));
  return tiles.run({ body: R.body.tiles, resolved: R, expand: (list) => expandFrame(R, list, { clip, t: 0, size: [32, 32] }) }, { clip, t: 0 });
}

test('the layout throws on fills above the fill versions only for a group that draws middles; a platform or slope with fills 3 draws', () => {
  const material = { fill: { base: 'soil', versions: [[]] }, edges: { top: { depth: 3, bands: [{ rows: [1, 99], paint: 'grass' }] } } };
  // a block with middles: fills 3 against 1 version is refused by the layout itself
  const block = tileset({ name: 'g', kind: 'block', fills: 3, material });
  assert.throws(() => layOut(block, 'g-fill'), /fills 3.*1 fill version/);
  // groups with no middles: the same fills are not the layout's business (the validator refuses them)
  for (const g of [{ name: 'p', kind: 'platform', fills: 3, material }, { name: 's', kind: 'slope', fills: 3, material }, { name: 't', kind: 'block', pieces: ['thin'], fills: 3, material }]) {
    const def = tileset(g);
    assert.match(validateSprite(def).errors.join('\n'), /draws no middle tiles/, g.name);
    for (const clip of tileClipNames(def.body.tiles)) {
      let r;
      assert.doesNotThrow(() => { r = layOut(def, clip); }, `${g.name} ${clip}`);
      assert.ok(Array.isArray(r.list) && r.list.length === 1 && r.list[0].kind === 'stamp', `${g.name} ${clip}: one stamp`);
    }
  }
});
