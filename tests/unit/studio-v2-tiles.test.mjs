// The studio's tile editor, its model (build item B19d; docs/data-sprites.md 2.3 and section 6, "Tileset: tile grid
// painter"): pure changes to a tiles body (groups and their piece sets, fills, material fields, edges, band rules,
// decals placed on a tile), each field described by a documented type, and the small test map whose tiles are picked
// by the join rules of engine/tile-rules.js (tileRules, the same rules a game reads), checked here against the picker
// itself (engine/tiles.js layoutTiles) on many maps.
//   node --test tests/unit/studio-v2-tiles.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../app/studio/v2-tiles-model.js';
import { v2Template } from '../../app/studio/v2-templates.js';
import { checkFull, spriteOf } from '../../app/studio/v2-check.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { nodePieceStore } from '../../tools/lib/pieces-index.mjs';
import { tileClips } from '../../engine/gen/tiles-clips.js';
import { layoutTiles, classifyTiles } from '../../engine/tiles.js';
import { TILE_GROUP_KINDS, DECAL_PLACES } from '../../catalog/sprite-schema.js';

const lib = (id) => JSON.parse(fs.readFileSync(new URL(`../../sprites/${id}.json`, import.meta.url), 'utf8'));
const clipsOf = (def) => tileClips(def.body.tiles);
const viewOf = (def) => (def.meta?.view === 'top-down' ? 'top-down' : 'side');
const brushesOf = (def) => T.mapBrushes(clipsOf(def), viewOf(def));
const template = () => v2Template('tiles', { name: 'Ground' });

const pieces = nodePieceStore();
async function passes(def) {
  await pieces.loadFor(def);
  return checkFull(def, { pieces });
}

test('every field the editor shows has a documented type, in the generators\' vocabulary', () => {
  const TYPES = new Set(['name', 'text', 'word', 'pieces', 'count', 'number', 'px', 'flag', 'paint', 'profile']);
  for (const [list, name] of [[T.GROUP_FIELDS, 'GROUP_FIELDS'], [T.MATERIAL_FIELDS, 'MATERIAL_FIELDS'], [T.EDGE_FIELDS, 'EDGE_FIELDS'], [T.DECAL_FIELDS, 'DECAL_FIELDS'], [T.BAND_FIELDS, 'BAND_FIELDS']]) {
    assert.ok(Array.isArray(list) && list.length, name);
    for (const f of list) {
      assert.equal(typeof f.key, 'string', `${name}: a key`);
      assert.ok(TYPES.has(f.type), `${name}.${f.key}: type ${f.type}`);
      assert.equal(typeof f.about, 'string', `${name}.${f.key}: words`);
      assert.ok(f.about.length > 8, `${name}.${f.key}: words`);
      if (f.type === 'word') assert.ok(Array.isArray(f.values) && f.values.length, `${name}.${f.key}: values`);
      if (['count', 'number', 'px'].includes(f.type)) assert.ok(Number.isFinite(f.lo) && Number.isFinite(f.hi) && f.lo <= f.hi, `${name}.${f.key}: range`);
    }
  }
  const kind = T.GROUP_FIELDS.find((f) => f.key === 'kind');
  assert.deepEqual(kind.values, [...TILE_GROUP_KINDS]);
  assert.deepEqual(T.DECAL_FIELDS.find((f) => f.key === 'place').values, [...DECAL_PLACES]);
  assert.equal(T.GROUP_FIELDS.find((f) => f.key === 'fills').hi, 6);
  assert.deepEqual(T.BAND_ROWS.map((r) => r.id), ['rows', 'last', 'last-1', 'profile']);
});

test('which group fields apply follows the kind (fills only where middles are drawn, use not on a platform)', () => {
  const keys = (g) => T.fieldsForGroup(g).map((f) => f.key);
  assert.ok(keys({ name: 'g', kind: 'block', pieces: ['block'] }).includes('fills'));
  assert.ok(!keys({ name: 'g', kind: 'block', pieces: ['thin'] }).includes('fills'));
  assert.ok(keys({ name: 'g', kind: 'block', pieces: ['block', 'thin'] }).includes('thickness'));
  assert.ok(!keys({ name: 'g', kind: 'platform' }).includes('use'));
  assert.ok(!keys({ name: 'g', kind: 'stack' }).includes('fills'));
  assert.ok(keys({ name: 'g', kind: 'floor' }).includes('fills'));
  assert.ok(keys({ name: 'g', kind: 'liquid' }).includes('frames'));
  assert.deepEqual(T.piecesOffered('block', []), ['block', 'narrow', 'lanes', 'thin', 'slope']);
  assert.deepEqual(T.piecesOffered('block', ['inner']), ['block', 'narrow', 'lanes', 'thin', 'slope', 'inner']);
  assert.deepEqual(T.piecesOffered('stack', []), ['cap', 'mid', 'foot']);
  assert.deepEqual(T.piecesOffered('floor', []), []);
});

test('changing a group: kind, piece sets and fills keep it valid, never in place', async () => {
  const d = template();
  const g = d.body.tiles.groups[0];
  const before = JSON.stringify(g);
  // fills 3: the material gets fill versions up to 3 (the first may be empty)
  const g3 = T.withFills(g, 3);
  assert.equal(g3.fills, 3);
  assert.equal(g3.material.fill.versions.length, 3);
  assert.equal(JSON.stringify(g), before);
  // a block of thin pieces only draws no middles: fills goes
  const thin = T.withPiece(T.withPiece(T.withPiece(g3, 'block', false), 'narrow', false), 'thin', true);
  assert.deepEqual(thin.pieces, ['thin']);
  assert.equal(thin.fills, undefined);
  // and back: the narrow pieces on again
  const back = T.withPiece(thin, 'narrow', true);
  assert.deepEqual(back.pieces, ['thin', 'narrow']);
  // kind platform: pieces and use go (a platform names its pieces itself); then stack: its three pieces
  const plat = T.withKind(g3, 'platform');
  assert.equal(plat.kind, 'platform');
  assert.equal(plat.use, undefined);
  assert.equal(plat.pieces, undefined);
  assert.equal(plat.fills, undefined);
  const stack = T.withKind(g3, 'stack');
  assert.deepEqual(stack.pieces, ['cap', 'mid', 'foot']);
  // a kind with no such piece set offered keeps none of the old ones
  assert.deepEqual(T.withKind({ ...g, pieces: ['block', 'narrow'] }, 'block').pieces, ['block', 'narrow']);
  // each change passes the validator in a whole definition
  for (const gg of [g3, back]) {
    const dd = JSON.parse(JSON.stringify(d));
    dd.body.tiles.groups[0] = gg;
    const v = await passes(dd);
    assert.deepEqual(v.errors, [], JSON.stringify(gg.pieces));
  }
});

test('a new group of each kind passes the validator beside the template\'s, and each of its tiles draws', async () => {
  for (const kind of TILE_GROUP_KINDS) {
    const d = template();
    const g = T.newGroup(d, kind);
    assert.equal(g.kind, kind);
    assert.notEqual(g.name, 'grass');
    d.body.tiles.groups.push(g);
    const v = await passes(d);
    assert.deepEqual(v.errors, [], kind);
    const m = spriteOf(v.value, { pieces });
    assert.equal(m.ok, true, kind);
    const mine = Object.keys(m.sprite.clips).filter((c) => c.startsWith(`${g.name}-`));
    assert.ok(mine.length, kind);
    for (const c of mine) assert.ok(renderFrame(m.sprite, c, 0, defaultParams(m.sprite)).data.some((x) => x), `${kind}: ${c} draws`);
  }
  // names are free ones
  const d = template();
  d.body.tiles.groups.push(T.newGroup(d, 'block'));
  assert.notEqual(T.newGroup(d, 'block').name, d.body.tiles.groups[1].name);
});

test('band rules: which kind of rows, changed between kinds; a new band and a new edge', () => {
  assert.equal(T.bandRowsKind({ rows: [1, 2] }), 'rows');
  assert.equal(T.bandRowsKind({ rows: 'last' }), 'last');
  assert.equal(T.bandRowsKind({ rows: 'last-1' }), 'last-1');
  assert.equal(T.bandRowsKind({ rows: { profile: 'hang' } }), 'profile');
  const r = { rows: [2, 4], paint: 'grass' };
  assert.deepEqual(T.withBandRows(r, 'last', ['hang']).rows, 'last');
  assert.deepEqual(T.withBandRows(r, 'profile', ['hang']).rows, { profile: 'hang' });
  assert.equal(T.withBandRows(r, 'profile', []), null);                  // no profile to name
  assert.deepEqual(T.withBandRows({ rows: 'last', paint: 'x' }, 'rows', []).rows, [1, 1]);
  assert.deepEqual(r.rows, [2, 4]);
  const d = template();
  const b = T.newBand(d);
  assert.deepEqual(b.rows, [1, 1]);
  assert.equal(b.paint, 'soil');
  const e = T.newEdge(d);
  assert.ok(Number.isFinite(e.depth) && Array.isArray(e.bands) && e.bands.length);
  assert.deepEqual(T.EDGES, ['top', 'left', 'right', 'bottom']);
});

test('decals: a new one has a free letter and a stamp; placed on its tile by a click; its host tile by its place', async () => {
  const d = template();
  const g = d.body.tiles.groups[0];
  const n = T.newDecal(g, d);
  assert.equal(n.name, 'b');                                   // the template has decal "a"
  assert.equal(n.place, 'on');
  assert.equal(n.draw[0].kind, 'stamp');
  const dd = JSON.parse(JSON.stringify(d));
  dd.body.tiles.groups[0].decals.push(n);
  assert.deepEqual((await passes(dd)).errors, []);
  // placing: the first stamp's top left goes to the pixel, kept inside the tile
  const placed = T.placeDecal(g.decals[0], 0, 4, 20, 32);
  assert.deepEqual(placed.draw[0].at, [4, 20]);
  assert.deepEqual(g.decals[0].draw[0].at, [10, 30]);
  const edge = T.placeDecal(g.decals[0], 0, 31, 31, 32);
  assert.deepEqual(edge.draw[0].at, [32 - 12, 32 - 2]);       // a 12 x 2 stamp stays on the tile
  assert.equal(T.placeDecal({ name: 'q', draw: [{ kind: 'outline' }] }, 0, 1, 1, 32), null);
  // its host: where it is seen in a map, by its place
  assert.deepEqual(T.decalHost('grass', 'on'), { host: 'grass-fill', at: [0, 0], decal: [0, 0] });
  assert.deepEqual(T.decalHost('grass', 'above'), { host: 'grass-top', at: [0, 1], decal: [0, 0] });
  assert.deepEqual(T.decalHost('grass', 'below'), { host: 'grass-bottom', at: [0, 0], decal: [0, 1] });
  assert.equal(T.decalHost('grass', 'rim').host, 'grass-top');
  assert.equal(T.decalHost('grass', 'face').host, 'grass-bottom');
});

test('the brushes of a tileset are the join rules\' groups, its decals and its hand-placed tiles', () => {
  const forest = brushesOf(lib('tiles-forest'));
  assert.deepEqual(forest.filter((b) => b.type === 'terrain').map((b) => b.id), ['block:grass', 'platform:grass', 'slope:grass']);
  assert.deepEqual(forest.filter((b) => b.type === 'decal').map((b) => b.id), ['decal:grass-deco-a', 'decal:grass-deco-b', 'decal:grass-deco-c']);
  const shore = brushesOf(lib('tiles-shore'));
  assert.deepEqual(shore.filter((b) => b.type === 'terrain').map((b) => b.id), ['block:water']);
  assert.deepEqual(shore.filter((b) => b.type === 'tile').map((b) => b.id), ['tile:bridge-h', 'tile:bridge-v']);
  for (const b of [...forest, ...shore]) { assert.equal(typeof b.label, 'string'); assert.ok(b.label.length); }
});

test('a painted map: the rules pick each tile (a 3 x 3 block, its inside corner, the fill versions)', () => {
  const def = lib('tiles-forest');
  const brushes = brushesOf(def);
  let m = T.blankMap(8, 6);
  assert.equal(m.cells.length, 48);
  for (let r = 1; r <= 4; r++) for (let c = 1; c <= 5; c++) m = T.paintMap(m, c, r, 'block:grass');
  m = T.paintMap(m, 1, 1, '');                                   // a notch: an inside corner at 2,2
  const before = JSON.stringify(m);
  const laid = T.layMap(m, brushes, 'side');
  assert.equal(JSON.stringify(m), before);
  const at = (c, r) => laid.tiles.find((t) => t.col === c && t.row === r && t.layer !== 6)?.clip;
  assert.equal(at(2, 1), 'grass-left');
  assert.equal(at(3, 1), 'grass-top');
  assert.equal(at(5, 1), 'grass-right');
  assert.equal(at(2, 2), 'grass-inner-tl');
  assert.equal(at(1, 2), 'grass-left');
  assert.equal(at(1, 4), 'grass-bottom-l');
  assert.equal(at(5, 4), 'grass-bottom-r');
  assert.ok(/^grass-fill(-[bc])?$/.test(at(3, 3)));
  assert.equal(at(0, 0), undefined);
  // every tile says the rule that picked it, in words
  const t = laid.tiles.find((x) => x.col === 2 && x.row === 2);
  assert.ok(t.rule && typeof t.rule.needs === 'object');
  assert.match(T.ruleWords(t.rule.needs), /up-left/i);
  assert.equal(T.ruleWords({}), 'always (it is the only choice)');
});

test('the rules agree with the picker (layoutTiles) on 200 random block maps, side view and top-down', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const [id, letter, view] of [['tiles-forest', '#', 'side'], ['tiles-shore', 'O', 'top-down'], ['tiles-cave', '#', 'side']]) {
    const def = lib(id);
    const clips = clipsOf(def);
    const brushes = T.mapBrushes(clips, view);
    const block = brushes.find((b) => b.type === 'terrain' && b.kind === 'block');
    const C = classifyTiles(clips);
    for (let k = 0; k < 200 / 3; k++) {
      let m = T.blankMap(7, 5);
      const rows = [];
      for (let r = 0; r < 5; r++) {
        let s = '';
        for (let c = 0; c < 7; c++) { const on = rnd() < 0.55; s += on ? letter : '.'; if (on) m = T.paintMap(m, c, r, block.id); }
        rows.push(s);
      }
      const want = layoutTiles(rows, C, { view }).tiles.filter((t) => t.layer !== 0 || !C.floors.length || view !== 'top-down');
      const mine = T.layMap(m, brushes, view).tiles;
      const key = (list) => list.filter((t) => clips[t.clip]?.block !== undefined || t.clip.startsWith(`${block.group}-`)).map((t) => `${t.col},${t.row}=${t.clip}`).sort();
      assert.deepEqual(key(mine), key(want), `${id}\n${rows.join('\n')}`);
    }
  }
});

test('liquids, platforms, stacks and top-down floors are laid as the picker lays them', () => {
  // a liquid: its surface where nothing of it is above
  const water = lib('tiles-water');
  const wb = brushesOf(water);
  let m = T.blankMap(4, 3);
  for (let r = 1; r < 3; r++) for (let c = 0; c < 4; c++) m = T.paintMap(m, c, r, 'liquid:water');
  const lw = T.layMap(m, wb, 'side').tiles;
  assert.ok(lw.filter((t) => t.row === 1).every((t) => t.clip === 'water-top'));
  assert.ok(lw.filter((t) => t.row === 2).every((t) => /^water-fill/.test(t.clip)));
  // a platform: its ends, and the middle where it runs into a block
  const pf = brushesOf(lib('tiles-forest'));
  let p = T.blankMap(6, 3);
  for (const c of [1, 2, 3]) p = T.paintMap(p, c, 1, 'platform:grass');
  p = T.paintMap(p, 4, 1, 'block:grass');
  const lp = T.layMap(p, pf, 'side').tiles;
  assert.deepEqual(lp.filter((t) => t.row === 1 && t.col < 4).map((t) => t.clip), ['grass-thin-l', 'grass-thin-m', 'grass-thin-m']);
  // a stack: cap, mids, foot
  const sb = brushesOf(lib('tiles-platforms'));
  let s = T.blankMap(3, 5);
  for (const r of [0, 1, 2, 3]) s = T.paintMap(s, 1, r, 'stack:ladder');
  assert.deepEqual(T.layMap(s, sb, 'side').tiles.map((t) => t.clip), ['ladder-cap', 'ladder-mid', 'ladder-mid', 'ladder-foot']);
  // top-down: the first floor lies under every cell
  const dun = brushesOf(lib('tiles-dungeon'));
  const ld = T.layMap(T.paintMap(T.blankMap(3, 2), 1, 0, 'block:wall'), dun, 'top-down');
  assert.equal(ld.tiles.filter((t) => t.layer === 0).length, 6);
  assert.ok(ld.tiles.filter((t) => t.layer === 0).every((t) => /^floor-fill/.test(t.clip)));
  // a slope: up where ground is on its right
  let sl = T.paintMap(T.blankMap(3, 1), 1, 0, 'slope:grass');
  sl = T.paintMap(sl, 2, 0, 'block:grass');
  assert.equal(T.layMap(sl, pf, 'side').tiles.find((t) => t.col === 1).clip, 'grass-slope-up');
  // a hand-placed tile is itself
  const shore = brushesOf(lib('tiles-shore'));
  assert.equal(T.layMap(T.paintMap(T.blankMap(2, 2), 0, 0, 'tile:bridge-h'), shore, 'top-down').tiles[0].clip, 'bridge-h');
});

test('decals in the map: drawn over their cell, and a note when the place is wrong', () => {
  const def = lib('tiles-forest');
  const b = brushesOf(def);
  let m = T.blankMap(4, 3);
  for (let c = 0; c < 4; c++) m = T.paintMap(m, c, 2, 'block:grass');
  m = T.paintMap(m, 1, 1, 'decal:grass-deco-a');                 // above the ground: right
  const ok = T.layMap(m, b, 'side');
  assert.ok(ok.tiles.some((t) => t.clip === 'grass-deco-a' && t.col === 1 && t.row === 1 && t.layer === 6));
  assert.deepEqual(ok.notes, []);
  const bad = T.layMap(T.paintMap(m, 2, 0, 'decal:grass-deco-a'), b, 'side');
  assert.equal(bad.notes.length, 1);
  assert.match(bad.notes[0], /grass-deco-a at 2,0/);
  // rubbing out a cell takes its decal too
  const gone = T.paintMap(m, 1, 1, '');
  assert.ok(!T.layMap(gone, b, 'side').tiles.some((t) => t.clip === 'grass-deco-a'));
  // a decal painted over a terrain cell keeps the terrain under it
  const over = T.paintMap(T.paintMap(T.blankMap(3, 3), 1, 1, 'block:grass'), 1, 1, 'decal:grass-deco-a');
  assert.equal(over.cells[4], 'block:grass');
});

test('a starter map for every library tileset and the template, each tile a clip the tileset has', () => {
  const ids = fs.readdirSync(new URL('../../sprites/', import.meta.url)).filter((f) => /^tiles-.*\.json$/.test(f)).map((f) => f.slice(0, -5));
  assert.ok(ids.length >= 13);
  for (const def of [...ids.map(lib), template()]) {
    const clips = clipsOf(def);
    const brushes = T.mapBrushes(clips, viewOf(def));
    const m = T.starterMap(brushes, viewOf(def));
    assert.equal(m.cols, T.MAP_SIZE.cols);
    assert.equal(m.rows, T.MAP_SIZE.rows);
    const laid = T.layMap(m, brushes, viewOf(def));
    assert.ok(laid.tiles.length > 0, def.id);
    for (const t of laid.tiles) assert.ok(Object.hasOwn(clips, t.clip), `${def.id}: ${t.clip}`);
  }
});

test('maps are plain data, sized and capped; a brush that is not there paints nothing', () => {
  const m = T.blankMap(99, 0);
  assert.ok(m.cols <= T.MAP_MAX.cols && m.rows >= 1);
  const p = T.paintMap(T.blankMap(3, 3), 9, 9, 'block:x');
  assert.deepEqual(p.cells, Array(9).fill(''));
  const b = brushesOf(template());
  const laid = T.layMap(T.paintMap(T.blankMap(2, 2), 0, 0, 'block:nothing'), b, 'side');
  assert.deepEqual(laid.tiles, []);
  assert.equal(laid.notes.length, 1);
  assert.match(laid.notes[0], /nothing/);
  assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  // a map written as text (for the e2e tests and a person reading it)
  let q = T.paintMap(T.blankMap(3, 2), 0, 1, 'block:grass');
  q = T.paintMap(q, 1, 0, 'decal:grass-deco-a');
  assert.equal(T.mapText(q, b), '.a.\n#..');
});

test('a group renamed: its own clips and the preview follow; a name that is taken or not a name is refused', async () => {
  const d = lib('tiles-forest');
  d.clips = { 'grass-top': { fps: 4 } };
  d.preview = 'grass-fill';
  const r = T.renameGroup(d, 0, 'moss');
  assert.equal(r.body.tiles.groups[0].name, 'moss');
  assert.deepEqual(Object.keys(r.clips), ['moss-top']);
  assert.equal(r.preview, 'moss-fill');
  assert.equal(d.body.tiles.groups[0].name, 'grass');
  assert.deepEqual((await passes(r)).errors, []);
  assert.equal(T.renameGroup(d, 0, 'Moss Bank'), null);
  assert.equal(T.renameGroup(d, 0, '__proto__'), null);
  const two = JSON.parse(JSON.stringify(d));
  two.body.tiles.groups.push(T.newGroup(two, 'floor'));
  assert.equal(T.renameGroup(two, 1, 'grass'), null);
  assert.equal(T.renameGroup(d, 5, 'x'), null);
});

// ---- after review (B19d, round 2) ----------------------------------------------------------------------------------

test('a group renamed whose name begins another group\'s (stone, stone-2): only its own clips move', async () => {
  let d = template();
  d.body.tiles.groups.push(T.newGroup(d, 'block'));
  d.body.tiles.groups.push(T.newGroup(d, 'block'));
  assert.deepEqual(d.body.tiles.groups.map((g) => g.name), ['grass', 'stone', 'stone-2']);
  d.clips = { 'stone-top': { fps: 4 }, 'stone-2-top': { fps: 9 } };
  d.preview = 'stone-2-fill';
  assert.deepEqual((await passes(d)).errors, []);
  const r = T.renameGroup(d, 1, 'rock');
  assert.deepEqual(r.clips, { 'rock-top': { fps: 4 }, 'stone-2-top': { fps: 9 } });
  assert.equal(r.preview, 'stone-2-fill');
  assert.deepEqual((await passes(r)).errors, []);
  // the other way round: the longer name renamed leaves the shorter one alone
  const r2 = T.renameGroup(d, 2, 'pebble');
  assert.deepEqual(r2.clips, { 'stone-top': { fps: 4 }, 'pebble-top': { fps: 9 } });
  assert.equal(r2.preview, 'pebble-fill');
  assert.deepEqual((await passes(r2)).errors, []);
  // a decal's clip moves with its group
  d = template();
  d.clips = { 'grass-deco-a': { fps: 3 } };
  assert.deepEqual(T.renameGroup(d, 0, 'moss').clips, { 'moss-deco-a': { fps: 3 } });
});

test('the test map follows a group renamed or given another kind (followMap)', () => {
  const d = template();
  const b0 = brushesOf(d);
  const m0 = T.starterMap(b0, 'side');
  const used = new Set([...m0.cells, ...m0.decals].filter(Boolean));
  assert.ok(used.has('block:grass') && used.has('platform:grass') && used.has('decal:grass-deco-a'), [...used].join(' '));
  // renamed: every cell of the group takes the new name, the decals too
  const moved = T.renameGroup(d, 0, 'moss');
  const b1 = brushesOf(moved);
  assert.ok(T.layMap(m0, b1, 'side').notes.length > 0, 'without following, the map has cells the tileset has nothing for');
  const m1 = T.followMap(m0, b1, { grass: 'moss' });
  assert.deepEqual(T.layMap(m1, b1, 'side').notes, []);
  assert.equal(T.mapText(m1, b1), T.mapText(m0, b0));
  assert.ok(m1.cells.includes('block:moss') && m1.cells.includes('platform:moss') && m1.decals.includes('decal:moss-deco-a'));
  assert.deepEqual(m0.cells.filter(Boolean).length, m1.cells.filter(Boolean).length);
  // given another kind: its cells take the group's brush of the new kind
  const liq = JSON.parse(JSON.stringify(d));
  liq.body.tiles.groups[0] = T.withKind(liq.body.tiles.groups[0], 'liquid');
  const b2 = brushesOf(liq);
  const m2 = T.followMap(m0, b2, { grass: 'grass' });
  assert.ok(m2.cells.includes('liquid:grass'));
  assert.ok(!m2.cells.some((c) => c && !b2.some((b) => b.id === c)), 'no cell the tileset has nothing for');
  // nothing to follow: the same map; never in place
  assert.deepEqual(T.followMap(m0, b0, {}), m0);
  assert.ok(m0.cells.includes('block:grass'));
  // a cell whose group is not followed stays as it is (the note says so)
  assert.ok(T.followMap(m0, b1, {}).cells.includes('block:grass'));
});

test('the follow table: chains of renames end at the live name, a rename back undoes itself', () => {
  let f = T.followName({}, 'grass', 'moss');
  assert.deepEqual(f, { grass: 'moss' });
  f = T.followName(f, 'moss', 'lichen');
  assert.deepEqual(f, { grass: 'lichen', moss: 'lichen' });
  f = T.followName(f, 'lichen', 'grass');
  assert.equal(f.grass, undefined);
  assert.equal(f.moss, 'grass');
  assert.equal(f.lichen, 'grass');
  assert.deepEqual(T.followName({}, 'grass', 'grass'), { grass: 'grass' });
});

test('the tile editor\'s limits are the validator\'s (catalog/sprite-schema.js SPRITE_LIMITS)', async () => {
  const { SPRITE_LIMITS: L } = await import('../../catalog/sprite-schema.js');
  assert.deepEqual(T.TILE_LIMITS, { groups: L.tileGroups, decals: L.decals, extra: L.extraTiles, profiles: L.profiles, profileLength: L.profileLength, bands: L.bandRules, fills: L.fillVersions, frames: L.framesPerClip });
  assert.equal(T.GROUP_FIELDS.find((f) => f.key === 'fills').hi, L.fillVersions);
  assert.equal(T.GROUP_FIELDS.find((f) => f.key === 'frames').hi, L.framesPerClip);
});

test('a piece set\'s words do not repeat its name', () => {
  for (const [p, words] of Object.entries(T.PIECE_WORDS)) assert.ok(!words.toLowerCase().startsWith(p), `${p}: ${words}`);
});

test('a profile\'s curve scales: every scale holds its numbers, and some reach the validator\'s -64 to 64', () => {
  const zero = T.profileScales(Array(32).fill(0));
  assert.deepEqual(zero[0], [0, 3]);
  assert.ok(zero.some(([lo, hi]) => lo === -T.PROFILE_REACH && hi === T.PROFILE_REACH));
  assert.equal(T.PROFILE_REACH, 64);
  for (const vs of [[0, 5, 2], [-3, 1], [40, 0], [0.5, 0.25], [-64, 64]]) {
    const s = T.profileScales(vs);
    assert.ok(s.length > 0, vs.join());
    for (const [lo, hi] of s) assert.ok(vs.every((v) => v >= lo && v <= hi), `${vs} in ${lo}..${hi}`);
  }
  assert.deepEqual(T.profileScales([0.5, 0.25])[0], [0, 1]);
  assert.deepEqual(T.profileScales([-3, 1])[0], [-8, 8]);
});
