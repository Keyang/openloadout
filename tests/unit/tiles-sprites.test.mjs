// The first two tilesets built on the tile helper (bundles/specs/kit-platformer-fantasy.md, batch P03),
// and the sample-map tool that every tileset builder looks at.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import forest from '../../sprites/tiles-forest.js';
import platforms from '../../sprites/tiles-platforms.js';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { PALETTE } from '../../engine/palettes.js';
import { col, INK } from '../../engine/color.js';
import { blockJoins } from '../../engine/tiles.js';
import { checkSprite } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const P = PALETTE.thornwood;
const BLOCK = ['left', 'top', 'right', 'side-l', 'fill', 'side-r', 'bottom-l', 'bottom', 'bottom-r', 'inner-tl', 'inner-tr', 'inner-bl', 'inner-br'];
const frame = (s, clip, over = {}) => renderFrame(s, clip, 0, cleanParams(s, { ...defaultParams(s), ...over }));
const count = (g, hex) => g.data.reduce((n, v) => n + (v === col(hex) ? 1 : 0), 0);
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;

test('tiles-forest: id, frame, clips, controls and metadata are the specification\'s', () => {
  assert.equal(forest.id, 'tiles-forest');
  assert.equal(forest.name, 'Forest ground tiles');
  assert.deepEqual(forest.size, [32, 32]);
  assert.deepEqual(forest.pivot, [16, 16]);
  const NARROW = ['strip-l', 'strip-m', 'strip-r', 'col-t', 'col-m', 'col-b', 'single'];
  assert.deepEqual(Object.keys(forest.clips).sort(), [
    ...BLOCK.map((p) => `grass-${p}`), ...NARROW.map((p) => `grass-${p}`), 'grass-fill-b', 'grass-fill-c',
    'grass-thin-l', 'grass-thin-m', 'grass-thin-r', 'grass-slope-up', 'grass-slope-down', 'grass-deco-a', 'grass-deco-b', 'grass-deco-c',
  ].sort());
  assert.equal(Object.keys(forest.clips).length, 30, 'the 21 of the specification, the 7 narrow pieces and 2 more fills; 32 is the limit');
  for (const c of Object.values(forest.clips)) assert.equal(c.frames, 1);
  assert.deepEqual(Object.keys(forest.params).sort(), ['bumps', 'edge', 'flowers', 'grass', 'roots', 'soil', 'stone', 'texture']);
  const d = defaultParams(forest);
  assert.equal(d.grass, P.grass); assert.equal(d.soil, P.soil); assert.equal(d.stone, P.stone); assert.equal(d.flowers, P.crimson);
  assert.deepEqual([forest.params.edge.min, forest.params.edge.max], [5, 9]);
  assert.deepEqual([forest.params.bumps.min, forest.params.bumps.max], [0, 3]);
  assert.equal(forest.params.bumps.label, 'Surface');
  assert.equal(forest.params.roots.kind, 'toggle');
  assert.equal(forest.params.edge.label, 'Edge'); assert.equal(forest.params.texture.label, 'Texture');
  assert.deepEqual({ type: forest.meta.type, role: forest.meta.role, view: forest.meta.view }, { type: 'tileset', role: 'world/tile', view: 'side' });
  assert.deepEqual(forest.meta.themes, ['fantasy', 'forest']);
  assert.equal(forest.meta.gameTypes[0], 'platformer');
  assert.deepEqual(forest.parts ?? {}, {});
  assert.deepEqual(forest.sounds ?? {}, {});
});
test('tiles-forest passes the quality bar with no errors, and every block, thin and slope join is tested', () => {
  const r = checkSprite(forest, { validateMeta });
  assert.deepEqual(r.errors, [], show(r));
  assert.ok(r.metrics.joins.length >= blockJoins().length + 8, `${r.metrics.joins.length} joins`);
  for (const j of ['grass-slope-up left of grass-top', 'grass-slope-down above grass-inner-tr', 'grass-thin-m left of grass-thin-m']) assert.ok(r.metrics.joins.includes(j), j);
  assert.ok(r.metrics.maxColours <= 14, `${r.metrics.maxColours} colours in one tile`);
  assert.deepEqual(r.warnings.filter((w) => /join|seam|line up|texture|floats/.test(w)), [], show(r));
  assert.deepEqual(r.metrics.fillTexture.lost, [], 'the soil keeps its marks under every look with every swatch');
  for (const j of ['grass-col-t above grass-col-m', 'grass-fill-b left of grass-fill-c', 'grass-slope-up left of grass-inner-tl', 'grass-slope-down left of grass-slope-up', 'grass-thin-m left of grass-top']) assert.ok(r.metrics.joins.includes(j), j);
});
test('tiles-forest: the grass cap is as deep as `edge` says, the top line wanders as far as `bumps` says', () => {
  // rows of grass (anything that is not ink or bare soil) in one column of the top tile
  const capRows = (edge) => { const g = frame(forest, 'grass-top', { edge, bumps: 0, texture: 0 }); let n = 0; for (let y = 0; y < 16; y++) if (![col(INK), col(P.soil)].includes(g.get(7, y))) n++; return n; };
  assert.equal(capRows(9) - capRows(5), 4);
  const sky = (bumps) => frame(forest, 'grass-top', { bumps }).data.reduce((n, v) => n + (v ? 0 : 1), 0);
  assert.equal(sky(0), 0, 'flat: the top tile is full');
  assert.ok(sky(3) > sky(1) && sky(1) > 0);
  // never more than 3 px, and pinned at the tile's ends
  const g = frame(forest, 'grass-top', { bumps: 3 });
  for (let x = 0; x < 32; x++) assert.ok(g.get(x, 3), `column ${x}`);
  assert.ok(g.get(0, 0) && g.get(31, 0));
});
test('tiles-forest: fill is opaque and calm; edge tiles are see-through outside; decals are see-through pictures', () => {
  const fill = frame(forest, 'grass-fill');
  assert.ok(fill.data.every((v) => v !== 0));
  for (const k of ['grass-fill', 'grass-fill-b', 'grass-fill-c']) assert.ok(count(frame(forest, k), P.soil) > 32 * 32 * 0.9, `${k}: mostly plain soil`);
  assert.ok(frame(forest, 'grass-thin-m').get(16, 24) === 0, 'thin platform is see-through below');
  for (const c of ['grass-deco-a', 'grass-deco-b', 'grass-deco-c']) {
    const g = frame(forest, c), b = g.bounds();
    assert.ok(b && b.y1 === 31, `${c} stands on the bottom row of its cell (the top line of the tile below)`);
    assert.ok(g.data.filter((v) => v === 0).length > 32 * 32 * 0.6, `${c} is mostly see-through`);
    assert.equal(forest.clips[c].place, 'above');
  }
  assert.ok(count(frame(forest, 'grass-deco-b', { flowers: '#f2c230' }), '#f2c230') >= 9, 'the flowers take the flower colour');
});
test('tiles-forest: three versions of the fill with different marks, so a field of soil shows no 32 px grid', () => {
  const [a, b, c] = ['grass-fill', 'grass-fill-b', 'grass-fill-c'].map((k) => frame(forest, k));
  const marks = (g) => new Set(Array.from(g.data, (v, i) => (v !== col(P.soil) ? i : -1)).filter((i) => i >= 0));
  for (const [x, y] of [[a, b], [a, c], [b, c]]) { const mx = marks(x), my = marks(y); assert.ok([...mx].filter((i) => my.has(i)).length <= 2, 'marks are in different places'); }
  for (const g of [a, b, c]) for (let i = 0; i < 32; i++) for (const [x, y] of [[i, 0], [i, 31], [0, i], [31, i], [i, 3], [3, i]]) assert.equal(g.get(x, y), col(P.soil), 'nothing on the outer 4 px');
  // plain texture: the base version is bare soil
  assert.ok(frame(forest, 'grass-fill', { texture: 0 }).data.every((v) => v === col(P.soil)));
});
test('tiles-forest: decals stand on the level stretch of the top line at every Surface setting', () => {
  for (const bumps of [0, 1, 2, 3]) {
    const top = frame(forest, 'grass-top', { bumps });
    for (const c of ['grass-deco-a', 'grass-deco-b', 'grass-deco-c']) { const g = frame(forest, c, { bumps }); for (let x = 0; x < 32; x++) if (g.get(x, 31)) assert.ok(top.get(x, 0), `${c} over column ${x} at Surface ${bumps}`); }
  }
});
test('tiles-forest: roots change the underside tiles and nothing else', () => {
  const differs = (clip) => { const a = frame(forest, clip, { roots: true }).data, b = frame(forest, clip, { roots: false }).data; return a.some((v, i) => v !== b[i]); };
  assert.ok(differs('grass-bottom') && differs('grass-bottom-l') && differs('grass-bottom-r'));
  assert.ok(!differs('grass-top') && !differs('grass-fill') && !differs('grass-side-l'));
});

test('tiles-platforms: id, frame, clips, controls and metadata are the specification\'s', () => {
  assert.equal(platforms.id, 'tiles-platforms');
  assert.equal(platforms.name, 'Wooden platforms and ladders');
  assert.deepEqual(platforms.size, [32, 32]);
  assert.deepEqual(platforms.pivot, [16, 16]);
  assert.deepEqual(Object.keys(platforms.clips), ['plank-thin-l', 'plank-thin-m', 'plank-thin-r', 'ladder-cap', 'ladder-mid', 'ladder-foot', 'vine-cap', 'vine-mid', 'vine-foot', 'post-cap', 'post-mid']);
  for (const c of Object.values(platforms.clips)) assert.equal(c.frames, 1);
  assert.deepEqual(Object.keys(platforms.params).sort(), ['leaf', 'rope', 'rungs', 'style', 'thickness', 'wear', 'wood']);
  const d = defaultParams(platforms);
  assert.equal(d.wood, P.wood); assert.equal(d.rope, P.cream); assert.equal(d.leaf, P.leaf);
  assert.deepEqual(platforms.params.style.options.map((o) => o.value), ['planks', 'logs', 'slab']);
  assert.deepEqual(platforms.params.rungs.options.map((o) => o.value), ['wide', 'close']);
  assert.deepEqual([platforms.params.thickness.min, platforms.params.thickness.max], [8, 14]);
  assert.deepEqual({ type: platforms.meta.type, role: platforms.meta.role, view: platforms.meta.view }, { type: 'tileset', role: 'world/platform', view: 'side' });
  assert.deepEqual(platforms.meta.themes, ['fantasy', 'forest']);
});
test('tiles-platforms passes the quality bar with no errors and no warning about a join', () => {
  const r = checkSprite(platforms, { validateMeta });
  assert.deepEqual(r.errors, [], show(r));
  assert.deepEqual(r.warnings.filter((w) => /does not line up|nothing checks|join|every \d+ px/.test(w)), [], show(r));
  for (const j of ['plank-thin-m left of plank-thin-m', 'ladder-mid above ladder-mid', 'vine-cap above vine-mid', 'post-mid above post-mid']) assert.ok(r.metrics.joins.includes(j), j);
});
test('tiles-platforms: the platform is `thickness` px in the top of the tile for every style', () => {
  for (const style of ['planks', 'logs', 'slab']) for (const thickness of [8, 11, 14]) {
    const g = frame(platforms, 'plank-thin-m', { style, thickness }), b = g.bounds();
    assert.equal(b.y0, 0, `${style} ${thickness}`);
    assert.equal(b.y1, thickness - 1, `${style} ${thickness}`);
    assert.deepEqual([b.x0, b.x1], [0, 31]);
  }
});
test('tiles-platforms: ladders and vines are 16 px wide and centred; rungs come 2 or 4 to a tile', () => {
  for (const c of ['ladder-cap', 'ladder-mid', 'ladder-foot', 'vine-cap', 'vine-mid', 'vine-foot']) {
    const b = frame(platforms, c).bounds();
    assert.ok(b.x0 >= 8 && b.x1 <= 23, `${c}: x ${b.x0}..${b.x1}`);
  }
  const ladder = frame(platforms, 'ladder-mid').bounds();
  assert.deepEqual([ladder.x0, ladder.x1, ladder.y0, ladder.y1], [8, 23, 0, 31]);
  // a rung is a row where the middle of the ladder is drawn
  const rungs = (rungsOpt) => { const g = frame(platforms, 'ladder-mid', { rungs: rungsOpt }); let n = 0; for (let y = 0; y < 32; y++) if (g.get(16, y) && !g.get(16, (y + 31) % 32)) n++; return n; };
  assert.equal(rungs('wide'), 2);
  assert.equal(rungs('close'), 4);
  assert.ok(frame(platforms, 'ladder-cap').bounds().y0 > 0, 'the top end stops short of the cell above');
  assert.ok(frame(platforms, 'vine-foot').bounds().y1 < 31, 'the vine ends inside its last tile');
});

test('a top-down tileset made with the helper (floor, path, wall with a front face, pit) passes the quality bar', async () => {
  const room = (await import('../fixtures/quality/sprite-files/q-room-tiles.js')).default;
  const r = checkSprite(room, { validateMeta });
  assert.deepEqual(r.errors, [], show(r));
  assert.ok(r.metrics.joins.includes('wall-fill above wall-bottom') && r.metrics.joins.includes('path-inner-tr left of path-top') && r.metrics.joins.includes('pit-top above pit-fill'));
  // the wall's face is a full tile, darker than its cap
  const cap = renderFrame(room, 'wall-fill', 0, defaultParams(room)), face = renderFrame(room, 'wall-bottom', 0, defaultParams(room));
  assert.ok(face.data.every((v) => v !== 0));
  assert.notEqual(cap.get(16, 10), face.get(16, 10));
});
test('tools/tilemap.mjs --map draws a map written as letters, and says what it could not place', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-map-'));
  const map = path.join(dir, 'hill.txt');
  fs.writeFileSync(map, '; a peak and a pillar\n....#...\n../\\.#..Z\n./##\\#...\n#########\n');
  const out = execFileSync(process.execPath, [path.join(root, 'tools/tilemap.mjs'), 'tiles-forest', '--map', map, '--out', dir], { encoding: 'utf8' });
  assert.match(out, /note: "Z"/);
  const scattered = execFileSync(process.execPath, [path.join(root, 'tools/tilemap.mjs'), 'tiles-forest', '--scatter', '--out', dir], { encoding: 'utf8' });
  assert.ok(!/note:/.test(scattered) && fs.existsSync(path.join(dir, 'tiles-forest-map.png')), scattered);
  const b = fs.readFileSync(path.join(dir, 'tiles-forest-map-hill.png'));
  assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [9 * 32 * 2, 4 * 32 * 2]);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('tools/tilemap.mjs lays out a top-down room for a top-down tileset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-map-'));
  const out = execFileSync(process.execPath, [path.join(root, 'tools/tilemap.mjs'), '--file', path.join(root, 'tests/fixtures/quality/sprite-files/q-room-tiles.js'), '--out', dir], { encoding: 'utf8' });
  assert.match(out, /top-down room/);
  assert.ok(!/note:/.test(out), out);
  const b = fs.readFileSync(path.join(dir, 'q-room-tiles-map.png'));
  assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [18 * 32 * 2, 12 * 32 * 2]);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('tools/tilemap.mjs writes a 2x sample map for both tilesets, at the default and the extreme looks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-map-'));
  const size = (f) => { const b = fs.readFileSync(f); assert.equal(b.subarray(1, 4).toString(), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const run = (...a) => execFileSync(process.execPath, [path.join(root, 'tools/tilemap.mjs'), ...a, '--out', dir], { encoding: 'utf8' });
  const out = run('tiles-forest');
  assert.ok(!/note:/.test(out), out);
  assert.deepEqual(size(path.join(dir, 'tiles-forest-map.png')), [24 * 32 * 2, 12 * 32 * 2]);
  run('tiles-forest', '--look', 'high');
  assert.ok(fs.existsSync(path.join(dir, 'tiles-forest-map-high.png')));
  const withGround = run('tiles-platforms', '--with', 'tiles-forest', '--look', 'low');
  assert.ok(!/note:/.test(withGround), withGround);
  assert.deepEqual(size(path.join(dir, 'tiles-platforms-map-low.png')), [24 * 32 * 2, 12 * 32 * 2]);
  run('tiles-platforms');
  assert.ok(fs.existsSync(path.join(dir, 'tiles-platforms-map.png')));
  fs.rmSync(dir, { recursive: true, force: true });
});
