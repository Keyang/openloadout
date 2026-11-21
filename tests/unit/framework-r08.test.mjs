// Framework additions made with batch R08 (village tiles and market stall): engine/paving.js, engine/fences.js,
// engine/stalls.js, and the scene tool tools/scene.mjs.
// R3 (2026-11-21): engine/stalls.js (awning, layGoods, layOver) went with its tests; paving, fences, tools/scene.mjs and the tiles-village blocks stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from '../../engine/surface.js';
import { col, brightness, INK } from '../../engine/color.js';
import { TILE, patternFill, textureTone, classifyTiles } from '../../engine/tiles.js';
import { THEME_PRESETS, applyColour } from '../../engine/theme.js';
import { drawHerringbone, paintStone, pavingTone, stoneShade } from '../../engine/paving.js';
import { FENCE_PIECES, FENCE, drawFence } from '../../engine/fences.js';
import { composeScene, sceneLooks, lookIds, loadSprite } from '../../tools/scene.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BODY = '#d0cecc', JOINT = '#89859b';
const count = (g, c) => g.data.reduce((n, v) => n + (v === col(c) ? 1 : 0), 0);
const drawn = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);

// ---- engine/paving.js ---------------------------------------------------------------------------------------
test('drawHerringbone lays whole bricks twice as long as wide, with no seam at the tile edges', () => {
  const s = new Surface(TILE, TILE).rect(0, 0, TILE, TILE, BODY);
  const bricks = drawHerringbone(s, { size: 4, joint: JOINT });
  assert.equal(bricks.length, 32, 'a 32 px tile holds 32 bricks of 8 x 4');
  for (const b of bricks) assert.deepEqual([b.w, b.h].sort(), [3, 7], 'a face is 7 x 3 inside its joints');
  assert.equal(bricks.filter((b) => b.lie === 'h').length, 16);
  assert.ok(bricks.some((b) => b.inner) && bricks.some((b) => !b.inner));
  for (const b of bricks.filter((k) => k.inner)) assert.ok(b.x >= 3 && b.y >= 3 && b.x + b.w <= 29 && b.y + b.h <= 29);
  // it repeats every 16 px both ways, so every edge of the tile continues into the next tile
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(s.get(x, y), s.get((x + 16) % TILE, (y + 16) % TILE));
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(s.get(x, y), s.get((x + 16) % TILE, y));
  // every face pixel is body, every other pixel joint; faces fill 7 x 3 of every 8 x 4
  assert.equal(count(s, BODY), 32 * 21);
  assert.equal(count(s, JOINT), TILE * TILE - 32 * 21);
});
test('drawHerringbone with no joint colour draws nothing, and size 8 gives bigger bricks', () => {
  const s = new Surface(TILE, TILE).rect(0, 0, TILE, TILE, BODY);
  assert.equal(drawHerringbone(s).length, 32);
  assert.equal(count(s, BODY), TILE * TILE);
  const big = drawHerringbone(s, { size: 8, joint: JOINT, lit: '#ffffff' });
  assert.equal(big.length, 8);
  assert.ok(count(s, '#ffffff') > 0, 'a glint on each brick');
});
test('paintStone recolours one face, goes round the tile edge, and can leave rounded corners alone', () => {
  const s = new Surface(TILE, TILE).rect(0, 0, TILE, TILE, BODY);
  paintStone(s, { x: 4, y: 5, w: 6, h: 5 }, '#ff0000');
  assert.equal(count(s, '#ff0000'), 30);
  paintStone(s, { x: 29, y: 20, w: 6, h: 4 }, '#00ff00', { round: true });
  assert.equal(count(s, '#00ff00'), 20, 'four corners left alone');
  assert.equal(s.get(1, 21), col('#00ff00'), 'the part past column 31 comes back in at column 0');
  const t = new Surface(TILE, TILE).rect(0, 0, TILE, TILE, BODY);
  paintStone(t, { x: 4, y: 5, w: 6, h: 5 }, { light: '#ffffff', base: '#888888', dark: '#000000' }, { inset: 1 });
  assert.equal(count(t, '#ffffff'), 4); assert.equal(count(t, '#000000'), 4); assert.equal(count(t, '#888888'), 4);
});
test('pavingTone lifts a mid colour to the brightness asked for and leaves a light one alone', () => {
  assert.equal(pavingTone('#f0ead8'), '#f0ead8');
  for (const c of ['#a8a4a0', '#7e84a0', '#c9a06a']) {
    const lifted = pavingTone(c);
    assert.ok(brightness(lifted) > brightness(c));
    assert.ok(Math.abs(brightness(lifted) - 0.81) < 0.04, `${c} -> ${lifted} ${brightness(lifted)}`);
  }
  assert.ok(brightness(pavingTone('#5a5f7a')) > 0.6, 'a dark colour is lifted as far as it will go');
  assert.ok(Math.abs(brightness(pavingTone('#a8a4a0', 0.7)) - 0.7) < 0.03);
});
test('stoneShade lies between the body and the joint and survives every whole-bundle look', () => {
  const body = pavingTone('#a8a4a0'), joint = textureTone(body), shade = stoneShade(body, joint);
  assert.ok(brightness(shade) < brightness(body) && brightness(shade) >= brightness(joint));
  for (const look of THEME_PRESETS) { const to = applyColour(Uint32Array.from([col(body), col(shade)]), look.theme.colour); assert.notEqual(to[0], to[1], look.id); }
  assert.equal(stoneShade(body, joint), shade, 'the same every time');
});

// ---- engine/fences.js ---------------------------------------------------------------------------------------
const fence = (piece, o = {}) => drawFence(new Surface(TILE, TILE), piece, { wood: '#9a6a3e', ...o });
test('fence pieces: rails run off both edges, the post is closed, and whole clip names work', () => {
  assert.deepEqual([...FENCE_PIECES], ['h', 'v', 'post']);
  const h = fence('h'), v = fence('fence-v'), post = fence('post');
  const [px0, px1, py0, py1] = FENCE.post;
  for (const y of FENCE.rails) for (let k = 0; k < FENCE.thick; k++) assert.ok(h.get(0, y + k) && h.get(0, y + k) !== col(INK), `rail at row ${y + k} reaches the left edge un-inked`);
  // the post is ringed with ink on all four sides
  for (const g of [h, v, post]) {
    assert.equal(g.get(px0 - 1, py0 + 5), col(INK)); assert.equal(g.get(px1 + 1, py0 + 5), col(INK));
    assert.equal(g.get(px0 + 1, py0 - 1), col(INK)); assert.equal(g.get(px0 + 1, py1 + 1), col(INK));
  }
  // an 'h' piece joins the next one: wherever a rail leaves on the right it arrives on the left of the next tile
  for (const y of FENCE.rails) assert.equal(h.get(px0 - 2, y), h.get(0, y));
  // a 'v' piece repeats up and down: its strip is on the first row, under the post's columns
  const [sx0, sx1] = FENCE.strip;
  assert.ok(v.get(sx0, 0) && v.get(sx1, 0) && sx0 >= px0 && sx1 <= px1);
  assert.equal(v.get(sx0 - 1, 0), col(INK)); assert.equal(v.get(sx1 + 1, 0), col(INK));
  // the post alone is only the post
  const b = post.bounds();
  assert.deepEqual([b.x0, b.x1, b.y0, b.y1], [px0 - 1, px1 + 1, py0 - 1, py1 + 1]);
  assert.ok(drawn(h) > drawn(post) && drawn(v) > drawn(post));
  assert.throws(() => fence('gate'), /not a fence piece/);
});
test('a worn fence differs from a new one, and no ink means no ink', () => {
  assert.ok(!same(fence('h'), fence('h', { worn: 1 })));
  assert.equal(count(fence('h', { ink: null }), INK), 0);
});

// ---- tools/scene.mjs ----------------------------------------------------------------------------------------
const SCENE = {
  tilesets: ['tiles-meadow', { id: 'tiles-village', params: { style: 'square' } }],
  legend: { C: 'block:cobble', B: 'floor:plank', f: ['fence-h', 'fence-post'] },
  map: ['......', '.CCC.f', '.CCC.B', '.W....'],
  props: [
    { id: 'market-stall', x: 64, y: 100 },
    { id: 'hero-walker', clip: 'walk_down', frame: 2, at: [2, 3] },
    { id: 'merchant', x: 64, y: 92 },
  ],
};
test('composeScene lays the map, then the props sorted by their pivot row', async () => {
  const pic = await composeScene(SCENE);
  assert.equal(pic.width, 6 * TILE); assert.equal(pic.height, 4 * TILE);
  assert.equal(pic.pixels.length, pic.width * pic.height);
  assert.deepEqual(pic.notes, []);
  assert.deepEqual(pic.placed.map((q) => q.id), ['merchant', 'market-stall', 'hero-walker'], 'the merchant is painted before the stall he stands behind');
  assert.deepEqual(pic.placed[2], { id: 'hero-walker', clip: 'walk_down', frame: 2, x: 2 * TILE + 16, y: 3 * TILE + 30 });
  assert.ok(pic.pixels.every((v) => v >>> 24 === 255), 'every pixel is opaque: the floor lies under everything');
  // the grass of the first tileset is the floor; the stall's ink is somewhere in the picture
  const grass = (await loadSprite('tiles-meadow')).params.grass.def;
  assert.equal(pic.pixels[0], col(grass));
  assert.ok(pic.pixels.includes(col(INK)));
  // without the props the picture differs, and the same scene always gives the same picture
  const bare = await composeScene({ ...SCENE, props: [] });
  assert.ok(bare.pixels.some((v, i) => v !== pic.pixels[i]));
  assert.deepEqual((await composeScene(SCENE)).pixels, pic.pixels);
});
test('composeScene reports what it cannot place instead of failing', async () => {
  const pic = await composeScene({ ...SCENE, map: ['..Z.'], props: [{ id: 'hero-walker', clip: 'moonwalk', x: 5, y: 5 }, { id: 'hero-walker' }] });
  assert.ok(pic.notes.some((n) => /"Z"/.test(n)));
  assert.ok(pic.notes.some((n) => /no clip "moonwalk"/.test(n)));
  assert.ok(pic.notes.some((n) => /needs "x" and "y"/.test(n)));
  await assert.rejects(() => composeScene({ tilesets: ['no-such-tiles'], map: ['..'] }), /no sprite "no-such-tiles"/);
  await assert.rejects(() => composeScene({ tilesets: ['tiles-meadow'] }), /"map" must be/);
});
test('sceneLooks stacks one copy per look, scaled, and refuses an unknown look', async () => {
  const pic = await composeScene(SCENE);
  assert.ok(lookIds().includes('original') && lookIds().includes('mono'));
  const one = sceneLooks(pic), three = sceneLooks(pic, ['original', 'mono', 'night'], { scale: 1, gap: 2 });
  assert.deepEqual([one.width, one.height], [pic.width * 2, pic.height * 2]);
  assert.deepEqual([three.width, three.height], [pic.width, pic.height * 3 + 4]);
  assert.equal(three.rgba.length, three.width * three.height * 4);
  // the first copy is the scene as composed; the mono copy has no colour in it
  const g0 = col((await loadSprite('tiles-meadow')).params.grass.def);
  assert.deepEqual([...three.rgba.slice(0, 3)], [g0 & 255, (g0 >>> 8) & 255, (g0 >>> 16) & 255]);
  const m = (pic.height + 2) * three.width * 4;
  assert.ok(Math.abs(three.rgba[m] - three.rgba[m + 1]) < 16 && Math.abs(three.rgba[m + 1] - three.rgba[m + 2]) < 16);
  const crop = sceneLooks(pic, ['original'], { scale: 3, crop: [1, 1, 2, 2] });
  assert.deepEqual([crop.width, crop.height], [2 * TILE * 3, 2 * TILE * 3]);
  assert.throws(() => sceneLooks(pic, ['sepia']), /no look "sepia"\. Looks: original/);
});
test('tools/scene.mjs writes a picture, names what it did, and fails clearly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-'));
  const file = path.join(dir, 'square.json');
  fs.writeFileSync(file, JSON.stringify(SCENE));
  const node = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'scene.mjs'), ...args], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  const r = node(file, '--looks', 'original,night', '--scale', '1', '--out', dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /6 x 4 tiles, 3 props, 2 looks \(original, night\)/);
  const png = fs.readFileSync(path.join(dir, 'square.png'));
  assert.equal(png.readUInt32BE(16), 6 * TILE); assert.equal(png.readUInt32BE(20), 4 * TILE * 2 + 4);
  assert.equal(node().status, 1);
  assert.match(node().stderr, /usage: node tools\/scene\.mjs/);
  assert.match(node(file, '--looks', 'sepia', '--out', dir).stderr, /no look "sepia"/);
  assert.match(node(path.join(dir, 'missing.json')).stderr, /No scene file/);
});

// ---- the two sprites of the batch, as the picker sees them ------------------------------------------------
test('tiles-village: a paving block and a wall block with narrow pieces, a plank floor, three fence pieces', async () => {
  const s = await loadSprite('tiles-village'), T = classifyTiles(s.clips);
  assert.equal(Object.keys(s.clips).length, 48);
  assert.deepEqual(T.floors.map((f) => [f.prefix, f.fills.length]), [['plank', 3]]);
  assert.deepEqual(T.blocks.map((b) => [b.prefix, b.kind, Object.keys(b.pieces).length, b.fills.length]), [['cobble', 'ground', 20, 3], ['wall', 'wall', 20, 1]]);
  assert.deepEqual(T.extras, ['fence-h', 'fence-v', 'fence-post']);
});
