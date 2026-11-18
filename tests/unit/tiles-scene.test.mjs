// A map written as text (engine/maptext.js) and the preview tools that read it: tools/scene.mjs (tiles, props and
// characters, looks, a chosen frame) and tools/tilemap.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMap, writeMap } from '../../engine/maptext.js';
import { layoutTiles, blockClips, liquidClips } from '../../engine/tiles.js';
import { composeScene, sceneLooks, readScene } from '../../tools/scene.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEXT = `; a pool between two banks
@ view = side
@ g = back:water, block:grass
@ A = open:grass:grass-top
@ frame = 3

.......
g~~~g..
g~~~g#A
#######
`;

test('readMap: rows of letters, with the legend and settings written above them', () => {
  const m = readMap(TEXT);
  assert.deepEqual(m.rows, ['.......', 'g~~~g..', 'g~~~g#A', '#######']);
  assert.deepEqual(m.legend, { g: ['back:water', 'block:grass'], A: 'open:grass:grass-top' });
  assert.equal(m.view, 'side');
  assert.deepEqual(m.settings, { view: 'side', frame: '3' });
  // short rows are filled out with empty cells; blank lines and notes are skipped; Windows line ends are fine
  assert.deepEqual(readMap('##\r\n#\r\n\r\n; note\r\n###').rows, ['##.', '#..', '###']);
  assert.deepEqual(readMap('..').legend, {});
  assert.equal(readMap('..').view, undefined);
  // what it reads, layoutTiles takes as it is
  const L = layoutTiles(m.rows, { ...blockClips('grass'), ...liquidClips('water') }, { legend: m.legend, view: m.view });
  assert.deepEqual(L.notes, []);
  assert.deepEqual(L.tiles.filter((t) => t.col === 0 && t.row === 1).map((t) => t.clip), ['water-top', 'grass-right']);
  assert.throws(() => readMap('@ nonsense\n..'), /line 1/);
});
test('writeMap is the other way round', () => {
  const m = readMap(TEXT);
  assert.deepEqual(readMap(writeMap(m)), m);
  assert.equal(writeMap({ rows: ['#.', '##'] }), '#.\n##\n');
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scene-map-'));
test('readScene: a scene as JSON, with its map inline or in a text file, or the text map on its own', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'pool.txt'), `@ tilesets = tiles-forest, tiles-water\n${TEXT}`);
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ tilesets: ['tiles-forest', 'tiles-water'], map: 'pool.txt', legend: { A: 'grass-deco-a' }, props: [{ id: 'coin', at: [5, 1] }] }));
  const viaJson = readScene(path.join(dir, 'a.json'));
  assert.deepEqual(viaJson.map, ['.......', 'g~~~g..', 'g~~~g#A', '#######']);
  assert.deepEqual(viaJson.legend, { g: ['back:water', 'block:grass'], A: 'grass-deco-a' }, 'the JSON legend wins over the map file\'s');
  assert.equal(viaJson.view, 'side'); assert.equal(viaJson.frame, 3);
  const viaText = readScene(path.join(dir, 'pool.txt'));
  assert.deepEqual(viaText.tilesets, ['tiles-forest', 'tiles-water']);
  assert.deepEqual(viaText.map, viaJson.map);
  assert.deepEqual(readScene(path.join(dir, 'pool.txt'), { tilesets: 'tiles-cave', frame: 5 }).tilesets, ['tiles-cave']);
  assert.equal(readScene(path.join(dir, 'pool.txt'), { frame: 5 }).frame, 5);
  assert.throws(() => readScene(path.join(dir, 'nope.json')), /No scene file/);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('composeScene: liquids, a fill behind the bank, a chosen frame of animated tiles, props on top', async () => {
  const scene = { tilesets: ['tiles-forest', 'tiles-water'], ...readMap(TEXT), props: [{ id: 'coin', at: [5, 1] }] };
  scene.map = scene.rows;
  const pic = await composeScene({ ...scene, frame: 0 });
  assert.deepEqual(pic.notes, []);
  assert.deepEqual([pic.cols, pic.rows, pic.placed.length], [7, 4, 1]);
  const other = await composeScene({ ...scene, frame: 4 });
  assert.notDeepEqual(other.pixels, pic.pixels, 'the water moves between frames');
  // the bank's see-through pixels show water, not the backdrop: no backdrop colour in the bank's cells below the surface row
  const bg = pic.pixels[0];
  let bare = 0;
  for (let y = 64; y < 96; y++) for (let x = 0; x < 32; x++) if (pic.pixels[y * pic.width + x] === bg) bare++;
  assert.equal(bare, 0);
  assert.equal(sceneLooks(pic, ['night'], { scale: 1 }).width, 7 * 32);
});
test('tools/scene.mjs: a text map with --tilesets, --theme, --frame and --scale', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'pool.txt'), TEXT);
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tools/scene.mjs'), ...a, '--out', dir], { encoding: 'utf8' });
  const r = run(path.join(dir, 'pool.txt'), '--tilesets', 'tiles-forest,tiles-water', '--theme', 'night', '--frame', '2', '--scale', '1');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /1 look \(night\)/); assert.match(r.stdout, /frame 2/);
  const b = fs.readFileSync(path.join(dir, 'pool.png'));
  assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [7 * 32, 4 * 32]);
  const none = run(path.join(dir, 'pool.txt'));
  assert.notEqual(none.status, 0); assert.match(none.stderr, /tilesets/);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('tools/tilemap.mjs --map reads the same text maps, legend and all, and takes --frame', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'pool.txt'), TEXT);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/tilemap.mjs'), 'tiles-forest', '--with', 'tiles-water', '--map', path.join(dir, 'pool.txt'), '--frame', '3', '--out', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(!/note:/.test(r.stdout), r.stdout);
  assert.ok(fs.existsSync(path.join(dir, 'tiles-forest-map-pool.png')));
  fs.rmSync(dir, { recursive: true, force: true });
});
