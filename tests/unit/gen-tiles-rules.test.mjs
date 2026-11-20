// A data tileset in a download and in the playground (build item B15; Contract 8; docs/data-sprites.md 2.3 "so
// engine/tile-rules.js, the picker, the checker and the export are unchanged"):
//   - the download's tile rules and patterns (engine/tile-rules.js tileRules through engine/sheet-info.js describeSheet)
//     come out exactly as for the code tileset with the same tiles, and its text passes the download checker
//   - every rule replays the picker (engine/tiles.js pickClip) for every arrangement of neighbours
//   - the playground's level builder (app/play/level.js tileIndex, levelFeatures, makeLevel, levelTiles, which call
//     engine/tiles.js classifyTiles and layoutTiles) lays out a level from a data tileset tile for tile as from the code one
// for the forest fixture (tests/fixtures/v2/tiles-forest.json against sprites/tiles-forest.js) and the two library
// tilesets redrawn as data (tests/fixtures/v2/tiles/: tiles-cave, side view; tiles-dungeon, top-down).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderSheet, defaultParams } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { tileRules, AROUND, applyRules } from '../../engine/tile-rules.js';
import { classifyTiles, pickClip } from '../../engine/tiles.js';
import { tileIndex, levelFeatures, makeLevel, levelTiles } from '../../app/play/level.js';
import { spriteGuide } from '../../app/guide.js';
import { rowFromSprite } from '../../app/play/roles.js';
import { guideFaults } from '../helpers/download-check.mjs';
import { testPieces } from '../fixtures/resolve/helpers.mjs';
import forestCode from '../../sprites/tiles-forest.js';
import caveCode from '../../sprites/tiles-cave.js';
import dungeonCode from '../../sprites/tiles-dungeon.js';

const FIX = new URL('../fixtures/v2/', import.meta.url);
const load = (p) => JSON.parse(fs.readFileSync(new URL(p, FIX), 'utf8'));
const CASES = [
  { name: 'forest', data: () => dataSprite(load('tiles-forest.json'), { pieces: testPieces() }), code: forestCode, view: 'side' },
  { name: 'cave', data: () => dataSprite(load('tiles/tiles-cave.json')), code: caveCode, view: 'side' },
  { name: 'dungeon', data: () => dataSprite(load('tiles/tiles-dungeon.json')), code: dungeonCode, view: 'top-down' },
];
// the code tileset's clip table, cut to the tiles the data tileset has (a redraw may leave a decal out), labels aside
const cut = (code, names) => Object.fromEntries(names.filter((n) => Object.hasOwn(code.clips, n)).map((n) => [n, { ...code.clips[n] }]));
const noLabels = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'label' ? undefined : v)));

for (const c of CASES) {
  test(`${c.name}: every tile the data tileset has is one the code tileset has, with the same block kind and decal place`, () => {
    const s = c.data();
    for (const [n, e] of Object.entries(s.clips)) {
      assert.ok(Object.hasOwn(c.code.clips, n), `${n} is a tile of the code tileset`);
      assert.equal(e.block, c.code.clips[n].block, `${n} block`);
      assert.equal(e.place, c.code.clips[n].place, `${n} place`);
    }
  });

  test(`${c.name}: the download's tile rules and patterns are the code tileset's, and the picker replays them`, () => {
    const s = c.data();
    const names = Object.keys(s.clips);
    const mine = tileRules(s.clips, { view: c.view }), theirs = tileRules(cut(c.code, names), { view: c.view });
    assert.deepEqual(noLabels(mine), noLabels(theirs));
    // through the sheet's JSON (Contract 8): the same `tiles` section
    const p = defaultParams(s);
    const json = describeSheet(s, renderSheet(s, p).meta, p);
    assert.equal(json.kind, 'tileset');
    assert.deepEqual(noLabels(json.tiles.groups), noLabels(theirs.groups));
    // every rule list replays the picker, every arrangement of the eight neighbours
    const T = classifyTiles(s.clips);
    for (const b of T.blocks.filter((x) => !x.liquid)) {
      const group = mine.groups.find((g) => g.name === b.prefix);
      for (let m = 0; m < 256; m++) {
        const around = Object.fromEntries(AROUND.map(([k], i) => [k, !!(m & (1 << i))]));
        const solid = (x, y) => (x === 0 && y === 0) || !!around[AROUND.find(([, dx, dy]) => dx === x && dy === y)?.[0]];
        const want = pickClip(b, solid, 0, 0), got = applyRules(group.rules, around);
        const fills = new Set(b.fills);
        assert.ok(got === want || (fills.has(got) && fills.has(want)), `${b.prefix} ${m}: rules say ${got}, the picker ${want}`);
      }
    }
  });

  test(`${c.name}: the download's text is right for a tileset (the download checker)`, () => {
    const s = c.data();
    const p = defaultParams(s);
    const json = describeSheet(s, renderSheet(s, p).meta, p);
    json.sounds = {};
    const text = spriteGuide({ json, description: s.blurb ?? '', licence: s.meta?.license });
    assert.deepEqual(guideFaults({ row: { ...rowFromSprite(s), license: s.meta?.license }, json, text }), []);
  });

  test(`${c.name}: the playground lays out a level from the data tileset tile for tile as from the code one`, () => {
    const s = c.data();
    const names = Object.keys(s.clips);
    const mode = c.view === 'side' ? 'side' : 'top';
    const build = (clips) => { const index = tileIndex([{ key: 'x', names: Object.keys(clips), clips }]); const level = makeLevel(mode, levelFeatures(index, mode)); return { level, ...levelTiles(level, index) }; };
    const a = build(s.clips), b = build(cut(c.code, names));
    assert.ok(a.tiles.length > 10, `${a.tiles.length} tiles laid`);
    assert.deepEqual(a.tiles, b.tiles);
    assert.deepEqual(a.plain, b.plain);
    assert.deepEqual(a.level.cells, b.level.cells);
  });
}
