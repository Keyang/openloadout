// Data tilesets pass the quality bar (build item B15): tests/fixtures/v2/tiles-forest.json and the two library tilesets
// redrawn as data (tests/fixtures/v2/tiles/tiles-cave.json, side view; tiles-dungeon.json, top-down) pass checkSprite
// with no errors, so their tiles join exactly (the bar tests every join a block allows, every slope against its corner
// tiles, every fill version's edges, decals standing on the top line) at every tested setting and random look.
// A redraw is a redraw (docs/data-sprites.md decision 3: not pixel for pixel): it keeps the code tileset's id, every
// tile it has, the block kinds and decal places, and the control keys and kinds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite } from '../../engine/data-sprite.js';
import { checkSprite } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { testPieces } from '../fixtures/resolve/helpers.mjs';
import caveCode from '../../sprites/tiles-cave.js';
import dungeonCode from '../../sprites/tiles-dungeon.js';

const FIX = new URL('../fixtures/v2/', import.meta.url);
const load = (p) => JSON.parse(fs.readFileSync(new URL(p, FIX), 'utf8'));
const soundIndex = new Set(fs.readdirSync(new URL('../../sounds/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));

for (const [f, opts] of [['tiles-forest.json', { pieces: testPieces() }], ['tiles/tiles-cave.json', {}], ['tiles/tiles-dungeon.json', {}]]) {
  test(`${f} passes the quality bar (checkSprite) with no errors: every join exact`, () => {
    const r = checkSprite(dataSprite(load(f), opts), { soundIndex, validateMeta });
    assert.deepEqual(r.errors, []);
  });
}

for (const [f, code] of [['tiles/tiles-cave.json', caveCode], ['tiles/tiles-dungeon.json', dungeonCode]]) {
  test(`${f}: a redraw keeps the code tileset's id, every tile, and its control keys and kinds`, () => {
    const s = dataSprite(load(f));
    assert.equal(s.id, code.id);
    assert.deepEqual(Object.keys(s.clips).sort(), Object.keys(code.clips).sort());
    for (const [k, c] of Object.entries(code.params)) {
      assert.ok(Object.hasOwn(s.params, k), `control ${k} kept`);
      assert.equal(s.params[k].kind, c.kind, `control ${k} kind`);
    }
    assert.deepEqual(s.meta, code.meta);
  });
}
