// The tiles body after its second review (build item B15; docs/data-sprites.md 2.3, 3.3; engine/gen/tiles.js).
// Held to here:
//   - a shared material (a `material:` piece) may use its own args: a `when` naming a flag arg and a binding to a
//     number arg pass catalog/sprite-schema.js checkMaterialPiece, load, and draw differently by the arg; a `when` or a
//     binding naming an arg the piece lacks, or a value the arg can never be, is still refused
//   - fills against the layout: a group that draws no middles as clips (platform, slope, stack, a block of thin or
//     slope pieces only) is refused fills above 1 by the validator, and the layout never refuses what the validator
//     passed for it
//   - the dungeon redraw's Damp: the puddle in the cracks, the slime on the grate bars, the slime from the pit's rim,
//     the third wet run down the wall and the third wet streak on the floor, at the code tileset's pixels
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { createPieceStore } from '../../engine/pieces.js';
import { validateSprite, checkMaterialPiece } from '../../catalog/sprite-schema.js';

const FIX = new URL('../fixtures/v2/', import.meta.url);
const load = (p) => JSON.parse(fs.readFileSync(new URL(p, FIX), 'utf8'));
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const changed = (a, b) => { const out = []; a.data.forEach((v, i) => { if (v !== b.data[i]) out.push(i); }); return out; };

const SOIL = '#7a5236', GRASS = '#5aa040';
function tileset(group, extra = {}) {
  return {
    format: 'loadout-sprite', version: 2, id: 'tiles-test', name: 'Test tiles', blurb: 'Tiles for a test.', size: [32, 32], pivot: [16, 16], grounded: false,
    meta: { type: 'tileset', role: 'world/tile', view: 'side', themes: ['forest'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [{ id: 'soil', label: 'Soil', default: SOIL, material: 'earth' }, { id: 'grass', label: 'Grass', default: GRASS, material: 'plant' }],
    controls: [],
    body: { tiles: { tile: 32, groups: [group] } },
  };
}
const plain = (more = {}) => ({ fill: { base: 'soil' }, edges: { top: { depth: 3, bands: [{ rows: [1, 1], paint: 'grass.light' }, { rows: [2, 99], paint: 'grass' }] } }, ...more });

// ---- a material piece with args -------------------------------------------------------------------------------------

const MAT_SLOTS = [{ id: 'm', default: SOIL, material: 'earth' }, { id: 'e', default: GRASS, material: 'plant' }];
const ARGS = { damp: { type: 'flag', default: true }, d: { type: 'count', lo: 1, hi: 8, default: 3 }, look: { type: 'word', options: ['moss', 'bare'], default: 'moss' } };
const ARG_BODY = {
  fill: { base: 'm', versions: [[], [{ kind: 'rect', at: [10, 12], size: [4, 2], paint: 'm.dark', when: { look: ['moss'] } }]] },
  profiles: { dip: [2] },
  edges: { top: { depth: { from: 'd' }, inset: { profile: 'dip', amount: 1 }, bands: [{ rows: [1, 99], paint: 'e' }] } },
  outside: [{ x: [5, 5], y: [0, 31], paint: 'e.dark', when: { damp: [true] } }],
};
const piece = (body, args = ARGS) => ({ id: 'material:test-wet', v: 1, slots: MAT_SLOTS, args, body });
const store = (body, args = ARGS) => { const s = createPieceStore(); s.add(JSON.stringify({ format: 'loadout-piece', version: 1, name: 'Test wet', about: 'A test material.', ...piece(body, args) }), 'material-test-wet.v1.json'); return s; };
const usesArgs = (args) => tileset({ name: 'g', kind: 'block', fills: 2, material: { use: 'material:test-wet', v: 1, paint: { m: 'soil', e: 'grass' }, args } });

test('a material piece may name its own args: a when on a flag or a word, a binding to a count', () => {
  const r = checkMaterialPiece(piece(ARG_BODY));
  assert.deepEqual(r.errors, []);
});

test('a material piece\'s when and bindings are still held to its args: a missing arg, a value it can never be, a table on a flag', () => {
  const missing = checkMaterialPiece(piece({ ...ARG_BODY, outside: [{ paint: 'e', when: { wet: [true] } }] }));
  assert.match(missing.errors.join('\n'), /when names "wet".*\(damp, d, look\)/s);
  const never = checkMaterialPiece(piece({ ...ARG_BODY, outside: [{ paint: 'e', when: { look: ['ice'] } }] }));
  assert.match(never.errors.join('\n'), /"ice".*"look"/s);
  const tooBig = checkMaterialPiece(piece({ ...ARG_BODY, outside: [{ paint: 'e', when: { d: [9] } }] }));
  assert.match(tooBig.errors.join('\n'), /9.*"d"/s);
  const tbl = checkMaterialPiece(piece({ ...ARG_BODY, edges: { top: { depth: { from: 'damp', map: [[0, 1], [1, 4]] }, bands: [{ rows: [1, 99], paint: 'e' }] } } }));
  assert.match(tbl.errors.join('\n'), /on\/off "damp"/);
  assert.match(checkMaterialPiece(piece({ ...ARG_BODY, edges: { top: { depth: { from: 'deep' }, bands: [{ rows: [1, 99], paint: 'e' }] } } })).errors.join('\n'), /bound to "deep"/);
  const none = checkMaterialPiece(piece(ARG_BODY, null));
  assert.match(none.errors.join('\n'), /"d".*not one of the sprite's controls|"damp"/, 'a piece without args cannot name them');
});

test('a material piece with args loads and draws by its args, as the tileset\'s use sets them', () => {
  const s = store(ARG_BODY);
  const at = (args, clip) => renderFrame(dataSprite(usesArgs(args), { pieces: s }), clip, 0, {});
  assert.ok(!same(at({ damp: true, d: 2 }, 'g-top'), at({ damp: false, d: 2 }, 'g-top')), 'damp draws the outside rule');
  assert.ok(!same(at({ damp: true, d: 2 }, 'g-top'), at({ damp: true, d: 6 }, 'g-top')), 'd sets the top edge\'s depth');
  assert.ok(!same(at({ look: 'moss' }, 'g-fill-b'), at({ look: 'bare' }, 'g-fill-b')), 'look draws the fill mark');
  assert.ok(same(at({}, 'g-top'), at({ damp: true, d: 3 }, 'g-top')), 'the defaults are the piece\'s');
});

// ---- fills on groups that draw no middles ---------------------------------------------------------------------------

test('fills above 1 on a group that draws no middles is refused by the validator, naming the kind', () => {
  const one = { fill: { base: 'soil', versions: [[]] } };
  for (const g of [
    { name: 'ledge', kind: 'platform', fills: 3, material: plain(one) },
    { name: 'hill', kind: 'slope', fills: 2, material: plain() },
    { name: 'vine', kind: 'stack', fills: 2, material: plain() },
    { name: 'shelf', kind: 'block', pieces: ['thin', 'slope'], fills: 2, material: plain() },
  ]) {
    const r = validateSprite(tileset(g));
    assert.equal(r.ok, false, `${g.kind} fills ${g.fills} passed`);
    assert.match(r.errors.join('\n'), new RegExp(`Group "${g.name}".*fills ${g.fills}.*no middle`, 's'));
  }
});

test('what the validator passes for a group the layout draws: fills 1 on a platform with a one-version material, a block with fills 2 and two versions', () => {
  for (const g of [
    { name: 'ledge', kind: 'platform', material: plain({ fill: { base: 'soil', versions: [[]] } }) },
    { name: 'hill', kind: 'slope', fills: 1, material: plain() },
    { name: 'rock', kind: 'block', fills: 2, material: plain({ fill: { base: 'soil', versions: [[], [{ kind: 'rect', at: [8, 8], size: [3, 2], paint: 'soil.dark' }]] } }) },
  ]) {
    const d = tileset(g);
    const r = validateSprite(d);
    assert.equal(r.ok, true, r.errors.join('; '));
    const s = dataSprite(d);
    for (const clip of Object.keys(s.clips)) assert.doesNotThrow(() => renderFrame(s, clip, 0, {}), `${g.name} ${clip}`);
  }
});

// ---- the dungeon redraw's Damp ------------------------------------------------------------------------------------

const DAMP_CLIPS = ['floor-deco-a', 'floor-deco-c', 'floor-fill-b', 'floor-fill-c', 'pit-top', 'pit-left', 'pit-strip-m', 'pit-single', 'wall-bottom', 'wall-bottom-l', 'wall-strip-m', 'wall-single'];

test('the dungeon redraw\'s Damp changes the same pixels as the code tileset\'s, and colours the puddle and slime as it does', async () => {
  const { codeSprite } = await import('../helpers/library.mjs');
  const code = await codeSprite('tiles-dungeon');
  const data = dataSprite(load('tiles/tiles-dungeon.json'));
  const P = defaultParams(code);
  for (const clip of DAMP_CLIPS) {
    const c0 = renderFrame(code, clip, 0, { ...P, damp: false }), c1 = renderFrame(code, clip, 0, { ...P, damp: true });
    const d0 = renderFrame(data, clip, 0, { damp: false }), d1 = renderFrame(data, clip, 0, { damp: true });
    const want = changed(c0, c1), got = changed(d0, d1);
    assert.deepEqual(got, want, `${clip}: damp changes ${got.length} px in the data tileset, ${want.length} in the code one`);
    if (['floor-deco-a', 'floor-deco-c', 'pit-top', 'wall-bottom'].includes(clip)) {
      const off = want.filter((i) => d1.data[i] !== c1.data[i]);
      assert.equal(off.length, 0, `${clip}: ${off.length} damp pixels differ in colour`);
    }
  }
});

// ---- band rules: a `when`, and rows down to a profile ---------------------------------------------------------------

test('a band rule may carry a when (the rules after it decide at other settings) and rows { profile } (rows 1 to its value at each column)', () => {
  const runs = [0, 0, 3, 0, 1, 0, 0, 0];
  const mat = plain({ edges: { top: { depth: 6, bands: [
    { rows: { profile: 'runs' }, paint: 'soil.dark', when: { wet: [true] } },
    { rows: [1, 1], paint: 'grass.light' }, { rows: [2, 99], paint: 'grass' },
  ] } } });
  const d = tileset({ name: 'g', kind: 'block', material: mat });
  d.body.tiles.profiles = { runs };
  d.controls = [{ key: 'wet', kind: 'toggle', label: 'Wet', default: false }];
  const r = validateSprite(d);
  assert.equal(r.ok, true, r.errors.join('; '));
  const s = dataSprite(d);
  const dry = renderFrame(s, 'g-top', 0, { wet: false }), wet = renderFrame(s, 'g-top', 0, { wet: true });
  const at = (g, x, y) => g.data[y * 32 + x];
  const plainTop = dataSprite(tileset({ name: 'g', kind: 'block', material: plain({ edges: { top: { depth: 6, bands: [{ rows: [1, 1], paint: 'grass.light' }, { rows: [2, 99], paint: 'grass' }] } } }) }));
  assert.ok(same(dry, renderFrame(plainTop, 'g-top', 0, {})), 'off: the rule is dropped and the others draw');
  const cols = [];
  for (let x = 0; x < 32; x++) for (let y = 1; y <= 6; y++) if (at(wet, x, y) !== at(dry, x, y)) cols.push(`${x}:${y}`);
  const want = [];
  for (let x = 0; x < 32; x++) for (let y = 1; y <= runs[x % 8]; y++) want.push(`${x}:${y}`);
  assert.deepEqual(cols, want, 'on: rows 1 to the profile\'s value, column by column');
});

test('band rules are checked: rows { profile } names a profile of the tileset, a when names a control and values it can be', () => {
  const bad = (band) => { const d = tileset({ name: 'g', kind: 'block', material: plain({ edges: { top: { depth: 4, bands: [band, { rows: [1, 99], paint: 'grass' }] } } }) }); d.body.tiles.profiles = { runs: [1, 2] }; return validateSprite(d); };
  assert.match(bad({ rows: { profile: 'nope' }, paint: 'soil' }).errors.join('\n'), /"nope" is not a profile/);
  assert.match(bad({ rows: { profile: 'runs', more: 1 }, paint: 'soil' }).warnings.join('\n'), /more/);
  assert.match(bad({ rows: [1, 2], paint: 'soil', when: { wet: [true] } }).errors.join('\n'), /when names "wet"/);
  assert.match(bad({ rows: { up: 1 }, paint: 'soil' }).errors.join('\n'), /rows must be.*\{ profile \}/);
});
