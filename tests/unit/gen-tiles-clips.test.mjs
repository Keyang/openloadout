// Tile clips are named in one place (build item B15; docs/data-sprites.md 2.3 and 4.3, "A layout does not name clips"):
// engine/gen/tiles-clips.js tileClips(body) names a tiles body's clips from its groups, decals and extra tiles exactly
// as engine/tiles.js blockClips, thinClips, slopeClips, decoClips and liquidClips name them for a code tileset (names,
// order, labels, frames, the block kind and the decal place), and the same list is
//   - what engine/resolve.js clipNames gives a tiles body (so a tileset has every tile, not only the clips it writes),
//   - what catalog/sprite-schema.js checks a tileset's written clips against (layoutClips), as panel states and layers,
//   - (tile.clips in docs/data-sprites.md: tileClips is a framework function, not a registry entry)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tileClips, tileClipNames, TILE_GROUP_PIECES } from '../../engine/gen/tiles-clips.js';
import { blockClips, thinClips, slopeClips, decoClips, liquidClips, classifyTiles } from '../../engine/tiles.js';
import { generator } from '../../engine/gen/index.js';
import { resolveSprite } from '../../engine/resolve.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { pieceRegistry } from '../../engine/pieces.js';
import { testPieces } from '../fixtures/resolve/helpers.mjs';
import { codeSprite } from '../helpers/library.mjs';
const FIX = new URL('../fixtures/v2/', import.meta.url);
const load = (p) => JSON.parse(fs.readFileSync(new URL(p, FIX), 'utf8'));
// a clip table as the code helpers write it, with fps a number (what a data definition holds)
const plain = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v, fps: typeof v.fps === 'function' ? 6 : v.fps }]));

test('a block group: the 13 pieces, the narrow ones, fill versions, lanes, ledge and slopes, as the code helpers name them', () => {
  const body = { tile: 32, groups: [{ name: 'grass', kind: 'block', use: 'ground', pieces: ['block', 'narrow', 'thin', 'slope'], fills: 3, material: {} }] };
  const want = { ...blockClips('grass', { kind: 'ground', narrow: true, fills: 3 }), ...thinClips('grass'), ...slopeClips('grass') };
  assert.deepEqual(tileClips(body), plain(want));
  assert.deepEqual(tileClipNames(body), Object.keys(want));
  const lanes = { tile: 32, groups: [{ name: 'path', kind: 'block', pieces: ['block', 'narrow', 'lanes'], label: 'Path', material: {} }] };
  assert.deepEqual(tileClips(lanes), plain(blockClips('path', { narrow: true, lanes: true, label: 'Path' })));
});

test('every group kind: floor, liquid, platform, slope, stack; decals with their places; extra tiles', () => {
  const body = { tile: 32, groups: [
    { name: 'floor', kind: 'floor', fills: 3, material: {}, label: 'Floor', decals: [{ name: 'a', place: 'on', label: 'Cracks', draw: [] }, { name: 'b', place: 'face', draw: [] }] },
    { name: 'water', kind: 'liquid', fills: 2, frames: 8, fps: 6, label: 'Pool', material: {} },
    { name: 'plank', kind: 'platform', label: 'Platform', material: {} },
    { name: 'hill', kind: 'slope', material: {} },
    { name: 'ladder', kind: 'stack', material: {} },
    { name: 'wall', kind: 'block', use: 'wall', pieces: ['block', 'narrow'], frames: 4, fps: 8, material: {}, decals: [{ name: 'a', place: 'rim', label: 'Girder', frames: 8, draw: [] }] },
  ], extra: [{ name: 'stairs-down', label: 'Stairs going down', draw: [] }] };
  const t = tileClips(body);
  assert.deepEqual(Object.keys(t).filter((n) => n.startsWith('floor-fill')), ['floor-fill', 'floor-fill-b', 'floor-fill-c']);
  assert.equal(t['floor-fill'].label, 'Floor: middle');
  assert.deepEqual(t['floor-deco-a'], plain(decoClips('floor', [{ place: 'on', label: 'Cracks' }]))['floor-deco-a']);
  assert.equal(t['floor-deco-b'].place, 'face');
  const water = plain(liquidClips('water', { frames: 8, fps: 6, label: 'Pool', fills: 2 }));
  for (const [k, v] of Object.entries(water)) assert.deepEqual(t[k], v, k);
  assert.deepEqual(t['plank-thin-m'], plain(thinClips('plank', { label: 'Platform' }))['plank-thin-m']);
  assert.ok(t['hill-slope-up'] && t['hill-slope-down'] && !t['hill-top']);
  assert.deepEqual(['ladder-cap', 'ladder-mid', 'ladder-foot'].map((n) => !!t[n]), [true, true, true]);
  assert.deepEqual(t['wall-top'], plain(blockClips('wall', { kind: 'wall', narrow: true, frames: 4, fps: 8 }))['wall-top']);
  assert.equal(t['wall-deco-a'].frames, 8);
  assert.equal(t['wall-deco-a'].place, 'rim');
  assert.deepEqual(t['stairs-down'], { frames: 1, fps: 6, loop: true, label: 'Stairs going down' });
  // the helper sorts them as it sorts a code tileset's clips
  const k = classifyTiles(t);
  assert.deepEqual(k.blocks.map((b) => b.prefix).sort(), ['wall', 'water']);
  assert.ok(k.blocks.find((b) => b.prefix === 'water').liquid);
  assert.equal(k.blocks.find((b) => b.prefix === 'wall').kind, 'wall');
  assert.deepEqual(k.floors.map((f) => f.prefix), ['floor']);
  assert.deepEqual(k.thins.map((x) => x.prefix), ['plank']);
  assert.deepEqual(k.stacks.map((x) => x.prefix), ['ladder']);
  assert.deepEqual(k.extras, ['stairs-down']);
  assert.deepEqual(TILE_GROUP_PIECES.block, ['block', 'narrow', 'lanes', 'thin', 'slope', 'inner']);
});

test('tile.clips is a framework function, not a registry entry (the registry holds generators that draw)', () => {
  assert.equal(generator('tile.clips', 1), null);
  assert.deepEqual(tileClips(null), {});
  assert.deepEqual(tileClips({ groups: [{ name: 'x', kind: 'nonsense' }, 'junk', null] }), {});
});

test('engine/resolve.js names a tileset\'s clips with tile.clips: every tile, the definition\'s own clip entries on top', () => {
  const def = load('tiles-forest.json');
  const r = resolveSprite(def, {}, { pieces: testPieces() });
  assert.ok(r.ok, r.errors.join('; '));
  assert.deepEqual(Object.keys(r.clips), tileClipNames(def.body.tiles));
  assert.equal(r.clips['grass-top'].label, 'Grass: top edge', 'a written label wins');
  assert.equal(r.clips['grass-left'].label, 'Grass: top left corner', 'the others are the helper\'s');
  assert.equal(r.clips['grass-deco-a'].place, 'above');
  assert.equal(r.clips['grass-top'].block, 'ground');
  // frames and fps of an animated group, Speed on top
  const anim = JSON.parse(JSON.stringify(def));
  anim.body.tiles.groups[0].frames = 4; anim.body.tiles.groups[0].fps = 8;
  anim.controls.push({ key: 'speed', standard: 'speed' });
  const a = resolveSprite(anim, { speed: 1 }, { pieces: testPieces() });
  assert.ok(a.ok, a.errors.join('; '));
  assert.equal(a.clips['grass-fill'].frames, 4);
  assert.equal(a.clips['grass-top'].frames, 4, 'a written entry keeps the group\'s frames');
  assert.ok(Math.abs(a.clips['grass-fill'].fps - 8 * 1.45) < 1e-9);
});

test('catalog/sprite-schema.js checks a tileset\'s written clips against the same list', () => {
  const opts = { pieces: pieceRegistry(testPieces()) };
  const ok = validateSprite(load('tiles-forest.json'), opts);
  assert.ok(ok.ok, ok.errors.join('; '));
  const bad = load('tiles-forest.json');
  bad.clips['grass-topp'] = { label: 'typo' };
  const r = validateSprite(bad, opts);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /grass-topp.*not one of the tiles/);
  const extra = load('tiles-forest.json');
  extra.body.tiles.extra = [{ name: 'stairs-down', label: 'Stairs', draw: [] }];
  extra.clips['stairs-down'] = { label: 'Stairs going down' };
  const e = validateSprite(extra, opts);
  assert.ok(e.ok, e.errors.join('; '));
});
