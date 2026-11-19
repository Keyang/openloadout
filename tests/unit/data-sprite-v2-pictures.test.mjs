// engine/data-sprite.js, version 2 (build item B6; docs/data-sprites.md 2.5d and 4.1): a `pictures` body turned into an
// ordinary sprite. The coin fixture (tests/fixtures/v2/coin.json) and two small definitions written here (a chest with
// nodes, per-clip lists, node keys, swaps, a flash and an attach point; an icon set) are drawn with the test pieces and a
// registry of runnable stand-ins for the generators the fixtures name (B8 and B12 build the real ones).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dataSprite, makeDataSprite, dataFrameList } from '../../engine/data-sprite.js';
import { renderFrame, renderSheet, frameSockets, cleanParams, defaultParams, cueInEffect, clipFps, clipStretch } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { drawList } from '../../engine/draw-list.js';
import { Surface } from '../../engine/surface.js';
import { px } from '../../engine/gen/args.js';
import { hexToRgb } from '../../engine/color.js';
import { loadV2, testPieces, testRegistry } from '../fixtures/resolve/helpers.mjs';

/** The fixtures' runnable generators plus stand-ins of the two motions the coin names (a motion returns node moves). */
function registry() {
  const reg = testRegistry();
  reg.defineGenerator({ id: 'pickup.bob', v: 1, family: 'motion', about: 'Test bob: lifts the whole picture by its height.', args: { height: px(0, 8) }, cost: () => 0,
    run: (a) => [{ move: [0, -Math.round(a.height)] }] });
  reg.defineGenerator({ id: 'pickup.spin', v: 1, family: 'motion', about: 'Test spin: moves its node one pixel right on odd frames.', args: {}, cost: () => 0,
    run: (a, ctx) => [{ move: [ctx.frame % 2, 0] }] });
  return reg;
}
const OPTS = { pieces: testPieces(), generators: registry() };
const coin = () => dataSprite(loadV2('coin'), OPTS);
const packed = (hex) => { const [r, g, b] = hexToRgb(hex); return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; };
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const count = (g, hex) => g.data.filter((v) => v === packed(hex)).length;
const solid = (g) => g.data.filter((v) => v >>> 24).length;
/** g moved by (dx, dy), what leaves the frame dropped. */
function shifted(g, dx, dy) {
  const out = new Surface(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const v = g.get(x, y); if (v && x + dx >= 0 && x + dx < g.w && y + dy >= 0 && y + dy < g.h) out.data[(y + dy) * g.w + x + dx] = v; }
  return out;
}

const CHEST = {
  format: 'loadout-sprite', version: 2, id: 'test-chest', name: 'Chest', blurb: 'A chest that opens.', size: [32, 32], pivot: [16, 28],
  meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['fantasy'], gameTypes: ['platformer'], words: ['chest', 'box', 'loot', 'treasure', 'open', 'container'], license: 'draft' },
  palette: [{ id: 'wood', label: 'Wood', default: '#8a5a2b', material: 'wood' }, { id: 'gold', label: 'Gold', default: '#e8b23a', material: 'metal' }],
  controls: [{ key: 'lock', kind: 'toggle', label: 'Lock', default: true }],
  body: { pictures: {
    nodes: [{ id: 'box', parent: null, at: [16, 20] }, { id: 'lid', parent: 'box', at: [-8, -4] }],
    draw: [
      { id: 'base', kind: 'rect', on: 'box', at: [-8, -4], size: [16, 10], paint: 'wood' },
      { id: 'top', kind: 'rect', on: 'lid', at: [0, -4], size: [16, 4], paint: 'wood' },
      { id: 'lockShut', kind: 'stamp', on: 'box', at: [-1, -3], rows: ['aa', 'aa'], key: { a: 'gold', b: 'gold.light' }, variants: { glint: ['ab', 'aa'] }, when: { lock: [true] } },
      { id: 'secret', kind: 'dot', at: [2, 2], paint: 'gold', hidden: true },
      { kind: 'outline', paint: 'ink' }],
    per: { open: { draw: [{ id: 'coins', kind: 'rect', on: 'box', at: [-4, -6], size: [8, 2], paint: 'gold.base' }], hide: ['lockShut'] } } } },
  points: [{ id: 'top', on: 'lid', at: [8, -4] }],
  clips: {
    idle: { frames: 2, fps: 4, frameEdits: { 1: { swap: { lockShut: 'glint' }, show: ['secret'] } } },
    open: { frames: 3, fps: 8, loop: false, keys: [{ t: 0, nodes: { lid: { turn: 0, move: [0, 0] } } }, { t: 1, nodes: { lid: { turn: -60, move: [0, -1] } } }] },
    hit: { frames: 2, fps: 8, loop: false, frameEdits: { 0: { flash: true } }, keys: [{ t: 0, root: [1, 0] }, { t: 1, root: [0, 0] }] } },
};

const ICONS = {
  format: 'loadout-sprite', version: 2, id: 'test-icons', name: 'Icons', blurb: 'Two icons.', size: [16, 16], pivot: [8, 15], grounded: false,
  meta: { type: 'icon', role: 'items/icon', view: 'none', themes: ['fantasy'], gameTypes: ['turn-based-rpg'], words: ['icon', 'apple', 'bar', 'food', 'item', 'symbol'], license: 'draft' },
  palette: [{ id: 'red', label: 'Red', default: '#c9423a', material: 'cloth' }],
  body: { pictures: { draw: [{ kind: 'outline', paint: 'ink' }], pictures: {
    apple: { label: 'Apple', draw: [{ kind: 'ellipse', at: [8, 9], r: [4, 4], paint: 'red' }] },
    bar: { label: 'Bar', angle: 90, draw: [{ kind: 'poly', points: [[6, 3], [10, 3], [10, 13], [6, 13]], paint: 'red' }] } } } },
};

test('coin: an ordinary sprite with the definition\'s name, clips, sounds, controls and look', () => {
  const s = coin();
  assert.equal(s.id, 'coin');
  assert.equal(s.name, 'Coin');
  assert.equal(s.kind, 'Item');
  assert.deepEqual(s.size, [32, 32]);
  assert.deepEqual(s.pivot, [16, 30]);
  assert.equal(s.grounded, false);
  assert.equal(s.preview, 'spin');
  assert.equal(s.meta.role, 'items/pickup');
  assert.deepEqual(Object.keys(s.clips), ['spin', 'collect']);
  assert.equal(s.clips.spin.frames, 8);
  assert.equal(s.clips.collect.loop, false);
  assert.equal(clipFps(s, 'spin', { speed: 0.5 }), Math.round(10 * 1.05));
  assert.equal(clipFps(s, 'spin', { speed: 1 }), Math.round(10 * 1.45), 'fps follows the Speed slider');
  assert.deepEqual(s.sounds.collect.map((c) => c.sound), ['coin-pickup']);
  assert.deepEqual(Object.keys(s.params).sort(), ['bob', 'gold', 'light', 'shine', 'size', 'speed']);
  assert.equal(s.params.gold.kind, 'color');
  assert.equal(s.params.gold.def, '#e8b23a');
  assert.equal(s.params.gold.material, 'metal', 'a colour control carries its slot\'s material (Contract 7)');
  assert.ok(s.params.gold.swatches.includes('#e8b23a'));
  assert.equal(s.params.size.kind, 'range');
  assert.deepEqual([s.params.size.lo, s.params.size.hi], ['Small', 'Big']);
  assert.equal(s.params.shine.kind, 'toggle');
  assert.equal(s.params.speed.group, 'Motion');
  assert.equal(s.made, undefined, 'a data sprite is drawn here, not in a worker');
  assert.equal(s.definition.version, 2);
  assert.ok(Object.isFrozen(s.definition));
  assert.deepEqual(s.styles, ['pixel']);
});

test('coin draws through engine/draw-list.js: the same pixels as its primitives drawn by hand', () => {
  const s = coin();
  const p = { ...defaultParams(s), shine: false, bob: 0 };
  const got = renderFrame(s, 'spin', 0, p);
  const want = new Surface(32, 32);
  drawList(want, [
    { id: 'face', kind: 'ellipse', at: [16, 15], r: [6.5, 6.5], paint: 'gold', shade: 1, light: 1 },
    { id: 'mark', kind: 'stamp', at: [15, 13], rows: ['ab', 'b.'], key: { a: 'gold.light', b: 'gold.dark' } },
    { kind: 'outline', paint: 'ink' },
  ], { palette: { gold: { hex: '#e8b23a' }, light: { hex: '#fff4c0' } } });
  assert.ok(solid(want) > 100);
  assert.ok(same(got, want));
  const { list } = dataFrameList(s, 'spin', 0, p);
  assert.deepEqual(list.map((x) => x.kind), ['ellipse', 'stamp', 'outline'], 'the frame\'s list, placed in frame pixels');
  assert.deepEqual(list[1].at, [15, 13]);
});

test('coin settings: the size table, the shine condition, the bob motion and the colours change the picture', () => {
  const s = coin();
  const base = { ...defaultParams(s), shine: false, bob: 0 };
  const at = (q, clip = 'spin', f = 0) => renderFrame(s, clip, f, { ...base, ...q });
  assert.ok(solid(at({ size: 1 })) > solid(at({ size: 0 })), 'a bigger coin');
  assert.ok(!same(at({ shine: true }), at({})), 'the glint is drawn while Shine is on');
  assert.ok(same(at({ shine: true }, 'spin', 0), at({ shine: true }, 'spin', 0)), 'deterministic');
  assert.ok(same(at({ bob: 1 }), shifted(at({}), 0, -2)), 'bob 1 -> height 2 -> the whole picture 2 px up');
  assert.ok(same(at({}, 'spin', 1), shifted(at({}, 'spin', 0), 1, 0)), 'the spin motion moves its node on odd frames, in the spin clip only');
  assert.ok(same(at({}, 'collect', 1), at({}, 'spin', 0)) === false, 'collect draws its burst');
  assert.equal(count(at({ gold: '#3f6fd1' }), '#3f6fd1'), count(at({}), '#e8b23a'), 'the gold slot follows its colour control');
});

test('coin emitters: drawn only where a key of the clip turns them on', () => {
  const s = coin();
  const p = { ...defaultParams(s), shine: false, bob: 0 };
  const quiet = loadV2('coin');
  delete quiet.body.pictures.emitters;
  delete quiet.clips.collect.keys;
  const q = dataSprite(quiet, OPTS);
  assert.ok(same(renderFrame(s, 'spin', 0, p), renderFrame(q, 'spin', 0, p)), 'no burst in spin');
  assert.ok(same(renderFrame(q, 'collect', 0, p), renderFrame(q, 'spin', 0, p)));
  const burst = renderFrame(s, 'collect', 0, p);
  assert.ok(!same(burst, renderFrame(q, 'collect', 0, p)), 'the burst is drawn in collect');
  const { list } = dataFrameList(s, 'collect', 0, p);
  const ring = list.find((x) => x.kind === 'ring');
  assert.deepEqual([ring.at, ring.glow], [[16, 15], true], 'the emitter\'s glow carried onto what it draws');
});

test('coin goes through the sheet, its description and the material table like any sprite', () => {
  const s = coin();
  const p = cleanParams(s, {});
  const sheet = renderSheet(s, p);
  assert.equal(sheet.w, 32 * 8);
  assert.equal(sheet.h, 32 * 2);
  assert.ok(sheet.data.some((v) => v >>> 24));
  const info = describeSheet(s, sheet.meta, p);
  assert.equal(info.kind, 'pickup');
  assert.deepEqual(Object.keys(info.animations), ['spin', 'collect'], 'one animation per clip, from the sheet\'s JSON');
  assert.equal(info.animations.spin.frames, 8);
  assert.equal(info.animations.collect.loop, false);
  const table = s.materialTable(p);
  const gold = table.colours.get(0xe8b23a);
  assert.equal(gold.material, 'metal');
  assert.equal(gold.control, 'gold');
  assert.ok(cueInEffect(s, s.sounds.collect[0], p));
  assert.equal(frameSockets(s, 'spin', 0, p), null, 'no points, no sockets');
});

test('chest: nodes, per-clip lists, node keys, swaps, show, the flash and the root key', () => {
  const s = dataSprite(CHEST, OPTS);
  const p = defaultParams(s);
  const idle0 = renderFrame(s, 'idle', 0, p), idle1 = renderFrame(s, 'idle', 1, p);
  assert.equal(count(idle0, '#e8b23a'), 4, 'the lock: a 2 x 2 stamp of gold');
  assert.ok(count(idle1, '#e8b23a') >= 4 && !same(idle0, idle1), 'frame 1 swaps the lock to its glint and shows the hidden dot');
  assert.equal(idle1.get(2, 2) !== 0, true, 'the shown dot');
  assert.equal(idle0.get(2, 2), 0, 'hidden until shown');
  assert.equal(count(renderFrame(s, 'idle', 0, { ...p, lock: false }), '#e8b23a'), 0, 'the lock is gone while Lock is off');
  const open0 = renderFrame(s, 'open', 0, p), open2 = renderFrame(s, 'open', 2, p);
  assert.ok(count(open0, '#e8b23a') >= 16, 'open shows its coins');
  assert.ok(!same(open0, open2), 'the lid turns over the clip');
  const { list } = dataFrameList(s, 'open', 0, p);
  assert.ok(!list.some((x) => x.id === 'lockShut'), 'open hides the lock');
  const hit0 = renderFrame(s, 'hit', 0, p), hit1 = renderFrame(s, 'hit', 1, p);
  assert.ok(count(hit0, '#ffffff') > 50, 'the white flash on frame 0');
  assert.equal(count(hit1, '#ffffff'), 0);
  assert.ok(same(hit1, idle0), 'the root key is back at 0 on the last frame');
  assert.equal(hit0.bounds().x0, idle0.bounds().x0 + 1, 'the root key moves the whole picture');
  // sockets: the lid's point, turned with the lid
  const top0 = frameSockets(s, 'open', 0, p).top, top2 = frameSockets(s, 'open', 2, p).top;
  assert.deepEqual([top0.x, top0.y], [16, 12]);
  assert.ok(Math.abs(top2.x - top0.x) > 1 || Math.abs(top2.y - top0.y) > 1, 'the point moves with its node');
});

test('icon set: one clip per picture, drawn with the shared list, a picture turned by its angle', () => {
  const s = dataSprite(ICONS, OPTS);
  assert.deepEqual(Object.keys(s.clips), ['apple', 'bar']);
  assert.equal(s.clips.apple.frames, 1);
  assert.equal(s.clips.bar.label, 'Bar');
  const p = defaultParams(s);
  const apple = renderFrame(s, 'apple', 0, p), bar = renderFrame(s, 'bar', 0, p);
  assert.ok(solid(apple) > 40 && solid(bar) > 40);
  const b = bar.bounds();
  assert.ok(b.x1 - b.x0 > b.y1 - b.y0, 'the upright bar turned 90 degrees lies flat');
  assert.deepEqual(dataFrameList(s, 'bar', 0, p).list[0].points.map(([x, y]) => [Math.round(x), Math.round(y)]), [[13, 6], [13, 10], [3, 10], [3, 6]], 'turned round the frame\'s centre');
});

test('makeDataSprite reports instead of throwing; dataSprite throws naming the problem', () => {
  const bad = { ...loadV2('coin'), controls: [{ key: 'size', kind: 'range', label: 'Size', default: 5 }] };
  const r = makeDataSprite(bad, OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.sprite, null);
  assert.ok(r.errors.length > 0);
  assert.throws(() => dataSprite(bad, OPTS), /coin/);
  const good = makeDataSprite(loadV2('coin'), OPTS);
  assert.equal(good.ok, true);
  assert.equal(good.sprite.id, 'coin');
  const text = makeDataSprite(JSON.stringify(loadV2('coin')), OPTS);
  assert.equal(text.ok, true, 'JSON text works too');
});

const PLATE = {
  format: 'loadout-sprite', version: 2, id: 'test-plate', name: 'Plate', blurb: 'A plate.', size: [32, 16], pivot: [16, 15], grounded: false,
  meta: { type: 'ui', role: 'interface/panel', view: 'none', themes: ['fantasy'], gameTypes: ['platformer'], words: ['plate', 'panel', 'sign', 'board', 'frame', 'ui'], license: 'draft' },
  palette: [{ id: 'face', label: 'Face', default: '#8a5a2b', material: 'wood' }, { id: 'txt', label: 'Text', default: '#231b33', material: 'cloth', detail: true }],
  body: { pictures: { draw: [{ kind: 'rect', at: [1, 1], size: [30, 14], paint: 'face' }, { kind: 'dot', at: [3, 3], paint: 'txt' }, { kind: 'outline', paint: 'ink' }] } },
  clips: { normal: { frames: 1, fps: 1 }, pressed: { frames: 1, fps: 1 } },
};

test('slice and textArea written in the definition reach the sprite (Contract 8), one for all clips or one per clip', () => {
  const one = dataSprite({ ...PLATE, slice: { left: 4, top: 4, right: 4, bottom: 4 }, textArea: { x: 4, y: 4, w: 24, h: 8, colour: 'txt' } }, OPTS);
  const p = defaultParams(one);
  for (const clip of ['normal', 'pressed']) {
    assert.deepEqual(clipStretch(one, clip, p), { border: { left: 4, bottom: 4, right: 4, top: 4 } }, clip);
    assert.deepEqual(one.textArea(clip, p), { x: 4, y: 4, w: 24, h: 8, text: '#231b33' }, clip);
  }
  const per = dataSprite({ ...PLATE,
    slice: { normal: { left: 4, top: 4, right: 4, bottom: 4 }, pressed: { left: 4, top: 5, right: 4, bottom: 3 } },
    textArea: { normal: { x: 4, y: 4, w: 24, h: 8 }, pressed: { x: 4, y: 5, w: 24, h: 8 } } }, OPTS);
  assert.deepEqual(clipStretch(per, 'pressed', p), { border: { left: 4, bottom: 3, right: 4, top: 5 } });
  assert.deepEqual(per.textArea('pressed', p), { x: 4, y: 5, w: 24, h: 8 });
  assert.deepEqual(per.textArea('normal', p), { x: 4, y: 4, w: 24, h: 8 });
  const info = describeSheet(per, renderSheet(per, p).meta, p);
  assert.equal(info.kind, 'interface');
  assert.ok(info.animations.pressed.textArea && info.animations.pressed.border, 'the sheet description carries both');
  const none = dataSprite(PLATE, OPTS);
  assert.equal(none.slice, undefined);
  assert.equal(none.textArea, undefined);
  assert.equal(clipStretch(none, 'normal', p), null);
});

test('per-clip draw items are outlined with the body (they go in before its outline)', () => {
  const def = { ...PLATE, id: 'test-sign', size: [16, 16], pivot: [8, 15],
    body: { pictures: { draw: [{ kind: 'rect', at: [2, 2], size: [4, 4], paint: 'face' }, { kind: 'outline', paint: 'ink' }],
      per: { pressed: { draw: [{ kind: 'rect', at: [10, 10], size: [2, 2], paint: 'face' }] } } } } };
  const s = dataSprite(def, OPTS);
  const p = defaultParams(s);
  const g = renderFrame(s, 'pressed', 0, p);
  const ink = g.get(1, 3);
  assert.ok(ink >>> 24 && ink !== g.get(3, 3), 'the body\'s outline, left of its rect');
  assert.ok(g.get(10, 10) >>> 24 && g.get(10, 10) !== ink, 'the per-clip item');
  for (const [x, y] of [[9, 10], [12, 10], [10, 9], [10, 12]]) assert.equal(g.get(x, y), ink, `ink round it at ${x},${y}`);
  assert.equal(renderFrame(s, 'normal', 0, p).get(10, 10), 0, 'only in its clip');
  assert.deepEqual(dataFrameList(s, 'pressed', 0, p).list.map((x) => x.kind), ['rect', 'rect', 'outline']);
});

test('emitters: one that some key gives an amount is off unless keyed on; one no key gives an amount is always on', () => {
  const def = loadV2('coin');
  def.body.pictures.emitters.push({ id: 'trail', gen: 'spark.ring', v: 1, at: [4, 4], paints: ['light'] });
  const s = dataSprite(def, OPTS);
  const p = { ...defaultParams(s), shine: false, bob: 0 };
  const rings = (clip, f) => dataFrameList(s, clip, f, p).list.filter((x) => x.kind === 'ring').map((x) => x.at.join(','));
  assert.deepEqual(rings('spin', 0), ['4,4'], 'the never-keyed trail is on; the burst (keyed in collect) is off in spin');
  assert.deepEqual(rings('collect', 0).sort(), ['16,15', '4,4'], 'both in collect');
  const off = loadV2('coin');
  off.clips.collect.keys = [{ t: 0, emit: { burst: { amount: 0 } } }];
  const q = dataSprite(off, OPTS);
  assert.ok(!dataFrameList(q, 'collect', 0, p).list.some((x) => x.kind === 'ring'), 'amount 0 keeps it off');
});

test('pictures: clip names are looked up as the sprite\'s own', () => {
  const s = dataSprite(CHEST, OPTS);
  const p = defaultParams(s);
  for (const clip of ['toString', 'constructor', '__proto__', 'valueOf']) {
    assert.throws(() => s.render({}, { clip, t: 0, frame: 0, p }), new RegExp(`no clip "${clip}"`), clip);
    assert.throws(() => dataFrameList(s, clip, 0, p), /no clip/, clip);
    assert.deepEqual(s.sockets(clip, 0, p), {}, clip);
  }
});
