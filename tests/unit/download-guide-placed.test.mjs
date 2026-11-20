// A tileset whose tiles the game places (app/guide.js tilesetGuide, tests/helpers/download-check.mjs): the cells of a
// puzzle are tiles with no group, so no rule, terrain or neighbour applies to them. The words of such a download say
// that the game puts each tile in its cell and how (Unity SetTile, Godot set_cell), give no rule tile and no terrain,
// and say of a row that plays once that it does, with no repeating tile made for it. Nothing here names an asset: the
// case is made from the first tileset in sprites/ by taking its groups away. The same holds, less far, for a tileset
// whose groups are each one tile (the floor of a board, with walls and markers placed by hand): no rule chooses between
// tiles, so the words ask for no rule tile and no terrain, and say that the group's tile goes in every cell of the group.
import test from 'node:test';
import assert from 'node:assert/strict';
import { librarySprites, libraryCoverage } from '../helpers/library.mjs';
import { renderSheet, defaultParams } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { spriteGuide } from '../../app/guide.js';
import { rowFromSprite } from '../../app/play/roles.js';
import { guideFaults } from '../helpers/download-check.mjs';

const sprites = (await librarySprites()).sprites.map((s) => s.def).filter((def) => def && typeof def.render === 'function');

/** The download of a tileset with every group taken away: all its tiles are "other", and its first two rows are a tile that repeats and a row that plays once. */
function placedDownload() {
  const def = sprites.find((d) => d.meta?.type === 'tileset');
  assert.ok(def, 'a tileset in sprites/');
  const p = defaultParams(def);
  const json = describeSheet(def, renderSheet(def, p, { scale: 1 }).meta, p);
  const names = Object.keys(json.animations);
  json.tiles = { tileSize: json.tiles.tileSize, how: json.tiles.how, groups: [], tiles: {}, other: names };
  for (const n of names) json.animations[n] = { ...json.animations[n], frames: 1, fps: 1, loop: true, label: `Piece ${json.animations[n].row}` };
  json.animations[names[0]] = { ...json.animations[names[0]], frames: 4, fps: 8, loop: true };
  json.animations[names[1]] = { ...json.animations[names[1]], frames: 6, fps: 14, loop: false };
  json.sounds = {};
  const text = spriteGuide({ json, description: def.blurb ?? '', licence: def.meta?.license });
  return { row: { ...rowFromSprite(def), license: def.meta?.license }, json, text, names };
}

test('a tileset with no group: the words say the game places each tile, and give no rule tile, terrain or "needs"', () => {
  const m = placedDownload(), flat = m.text.replace(/\s+/g, ' ');
  assert.deepEqual(guideFaults(m), []);
  assert.match(flat, /Tiles your game places, one in a cell/);
  assert.match(flat, /your game puts each one in its cell/);
  assert.match(flat, /SetTile\(cell, tile\)/);
  assert.match(flat, /set_cell\(cell, source id, place in the atlas\)/);
  assert.ok(!/terrain/i.test(flat) && !/Rule Tile for each/.test(flat) && !/"needs"/.test(flat) && !/groups? blocks? the way/.test(flat), 'no rule, terrain, neighbour or blocking group is spoken of');
});

test('a row that plays once is said to, and is not made a repeating tile; a tile that repeats still is', () => {
  const m = placedDownload(), flat = m.text.replace(/\s+/g, ' ');
  const line = (name) => m.text.split('\n').find((l) => new RegExp(`row ${m.json.animations[name].row}\\s+${name}\\b`).test(l));
  assert.match(line(m.names[0]), /\(moves: 4 frames, 8 per second\)/);
  assert.match(line(m.names[1]), /\(plays once: 6 frames, 14 per second\)/);
  assert.match(flat, new RegExp(`A row that plays once \\("${m.names[1]}"\\): do not make an Animated Tile for it`));
  assert.match(flat, new RegExp(`A row that plays once \\("${m.names[1]}"\\): do not give it an Animation in the TileSet`));
  assert.match(flat, /A tile that moves: in a Rule Tile set that rule's Output to Animation/);
});

test('the checker reads it back: terrain steps, missing placing steps and a wrong "plays once" are faults', () => {
  const m = placedDownload();
  const faults = (text, json = m.json) => guideFaults({ ...m, json, text }).join('\n');
  assert.match(faults(m.text.replace(/your\s+game\s+puts/, 'you put')), /the game places every tile/);
  assert.match(faults(m.text.replace('SetTile(', 'Set(')), /the game places every tile/);
  assert.match(faults(`${m.text}\nAdd a Terrain Set to the TileSet.`), /no rule picks a tile of this tileset/);
  assert.match(faults(m.text.replace('(plays once: 6 frames', '(moves: 6 frames')), /plays once, and its line does not say so/);
  assert.match(faults(m.text.replace('(moves: 4 frames', '(plays once: 4 frames')), /repeats, and its line says it plays once/);
  // a tileset with neither a group nor a hand-placed tile still has nothing in its JSON
  assert.match(faults(m.text, { ...m.json, tiles: { ...m.json.tiles, other: [] } }), /the JSON has no "tiles"/);
});

/** The download of a tileset left with one group of one tile (a floor with one rule that needs nothing) and every other tile placed by hand: groups, but no rule that chooses between tiles. */
function loneGroupDownload() {
  const m = placedDownload(), [first, ...rest] = m.names;
  const json = { ...m.json, tiles: { ...m.json.tiles, groups: [{ name: 'base', kind: 'floor', solid: false, tiles: [first], versions: [first], rules: [{ tile: first, needs: {} }], patterns: [], decorations: [] }], tiles: { [first]: { group: 'base', piece: 'fill', family: 'fill' } }, other: rest } };
  const def = sprites.find((d) => d.meta?.type === 'tileset');
  return { ...m, json, text: spriteGuide({ json, description: def.blurb ?? '', licence: def.meta?.license }) };
}

test('a tileset whose groups are each one tile: no rule tile and no terrain is asked for, the group\'s tile goes in every cell of the group, and the rest is placed', () => {
  const m = loneGroupDownload(), flat = m.text.replace(/\s+/g, ' ');
  assert.deepEqual(guideFaults(m), []);
  assert.match(flat, /Group "base"/);
  assert.match(flat, /Tiles to place by hand \(no rule picks them\)/);
  assert.match(flat, /No rule chooses between these tiles/);
  assert.match(flat, /put it in every cell that holds the group/);
  assert.match(flat, /SetTile\(cell, tile\)/);
  assert.match(flat, /set_cell\(cell, source id, place in the atlas\)/);
  assert.ok(!/terrain/i.test(flat) && !/Rule Tile for each/.test(flat) && !/"needs"|"rules"/.test(flat) && !/needs base:/.test(flat), 'no rule tile, terrain, rule list or neighbour is spoken of');
});

test('the checker reads the one-tile groups back: a terrain step, a rule list, a missing sentence and missing placing steps are faults; a group with a choice of tiles still needs its rule tile and terrain', () => {
  const m = loneGroupDownload();
  const faults = (text, json = m.json) => guideFaults({ ...m, json, text }).join('\n');
  assert.match(faults(`${m.text}\nAdd a Terrain Set to the TileSet.`), /no rule chooses between the tiles of this tileset/);
  assert.match(faults(`${m.text}\nGo down the "rules" of the group.`), /no rule chooses between the tiles of this tileset/);
  assert.match(faults(m.text.replace(/No\s+rule\s+chooses/, 'A rule chooses')), /every group of this tileset is one tile/);
  assert.match(faults(m.text.replace('set_cell(', 'set(')), /does not say how to place one/);
  // the same words for a group that does choose between two tiles are still short of a rule tile and a terrain
  const [g] = m.json.tiles.groups, second = m.names[1];
  const choosing = { ...m.json, tiles: { ...m.json.tiles, groups: [{ ...g, tiles: [g.tiles[0], second], rules: [{ tile: second, needs: { up: false } }, ...g.rules] }], other: m.json.tiles.other.filter((n) => n !== second) } };
  assert.match(faults(m.text, choosing), /Godot: a TileSet and its terrains/);
});

test('the scan covers every sprite file, code and data alike, and names any that did not load', async (t) => t.diagnostic(await libraryCoverage()));
