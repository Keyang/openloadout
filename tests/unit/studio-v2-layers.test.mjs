// The studio's layer editor for backgrounds (build item B19c; docs/data-sprites.md sections 2.4 and 6): the pure model
// under it (app/studio/v2-layers-model.js).
//   - the layers as rows, back to front: name, label, scroll speed (parallax), wraps, how many things each draws;
//   - a layer's speed, wrap and label changed, a layer renamed (its clip and the preview follow), moved further back or
//     nearer, added (a valid starter, at most 8), copied (its things get ids of their own) and removed (never the last);
//     every change gives a new definition that still passes the full check and draws, and leaves the old one as it was;
//   - the scrolling preview's arithmetic: where a layer is drawn for a camera position and where its wrap seam falls;
//   - the Time and colour controls tried live: the controls the colour rules read, and the colour controls;
//   - which layer is picked (asked for, the clip in hand, the picked item's layer, else the first).
//   node --test tests/unit/studio-v2-layers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { nodePieceStore } from '../../tools/lib/pieces-index.mjs';
import { v2Template } from '../../app/studio/v2-templates.js';
import { checkFull, spriteOf } from '../../app/studio/v2-check.js';
import * as LM from '../../app/studio/v2-layers-model.js';

const pieces = nodePieceStore();
const FOREST = JSON.parse(fs.readFileSync(new URL('../fixtures/v2/bg-forest.json', import.meta.url), 'utf8'));
const STARS = JSON.parse(fs.readFileSync(new URL('../../sprites/bg-starfield.json', import.meta.url), 'utf8'));
const forest = () => JSON.parse(JSON.stringify(FOREST));
const hills = () => v2Template('layers', { name: 'Hills' });
const opaque = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };

/** The definition passes the full check and every layer draws something. */
async function passesAndDraws(def) {
  await pieces.loadFor(def);
  const v = checkFull(def, { pieces });
  assert.equal(v.ok, true, (v.errors ?? []).join('; '));
  const m = spriteOf(v.value, { pieces });
  assert.equal(m.ok, true, (m.errors ?? []).join('; '));
  for (const l of def.body.layers) assert.ok(opaque(renderFrame(m.sprite, l.name, 0, defaultParams(m.sprite))) > 0, `layer ${l.name} draws`);
  return m.sprite;
}

test('the layers as rows, back to front', () => {
  const rows = LM.layersOf(forest());
  assert.deepEqual(rows.map((r) => r.name), ['far', 'mid']);
  assert.deepEqual(rows.map((r) => r.scroll), [0.1, 0.4]);
  assert.deepEqual(rows.map((r) => r.wraps), [true, true], 'a layer wraps unless it says it does not');
  assert.deepEqual(rows.map((r) => r.count), [4, 2]);
  assert.deepEqual(rows[1].path, ['body', 'layers', 1]);
  assert.equal(rows[0].index, 0);
  assert.deepEqual(LM.layersOf({ body: { pictures: {} } }), []);
  assert.deepEqual(LM.layersOf(null), []);
  // a scroll left out is 1, as the validator reads it
  const d = forest(); delete d.body.layers[0].scroll;
  assert.equal(LM.layersOf(d)[0].scroll, 1);
  assert.equal(LM.LAYER_MOST, 8);
  assert.deepEqual(LM.SCROLL_RANGE, [0, 2]);
});

test('a speed in everyday words', () => {
  assert.match(LM.scrollWords(0), /still/i);
  assert.match(LM.scrollWords(0.1), /far/i);
  assert.match(LM.scrollWords(0.5), /middle/i);
  assert.match(LM.scrollWords(1), /with the camera/i);
  assert.match(LM.scrollWords(1.5), /in front/i);
});

test('speed, wrap and label: clamped, a new definition, still valid', async () => {
  const d = hills();
  const before = JSON.stringify(d);
  const a = LM.setScroll(d, 1, 0.666);
  assert.equal(a.body.layers[1].scroll, 0.67, 'rounded to hundredths');
  assert.equal(LM.setScroll(d, 1, 7).body.layers[1].scroll, 2);
  assert.equal(LM.setScroll(d, 1, -1).body.layers[1].scroll, 0);
  assert.equal(LM.setScroll(d, 1, Number.NaN), null);
  assert.equal(LM.setScroll(d, 9, 0.5), null, 'no such layer');
  const b = LM.setWraps(a, 0, false);
  assert.equal(b.body.layers[0].wraps, false);
  assert.equal(Object.hasOwn(LM.setWraps(b, 0, true).body.layers[0], 'wraps'), false, 'wrapping is the default: the field goes');
  const c = LM.setLabel(b, 0, '  Sky and mountains ');
  assert.equal(c.body.layers[0].label, 'Sky and mountains');
  assert.equal(Object.hasOwn(LM.setLabel(c, 0, '').body.layers[0], 'label'), false);
  assert.equal(LM.setLabel(c, 0, 'x'.repeat(200)).body.layers[0].label.length, 60);
  assert.equal(JSON.stringify(d), before, 'the old definition is left as it was');
  await passesAndDraws(c);
});

test('rename: the clip and the preview follow; a bad or taken name is refused', async () => {
  const d = forest();
  d.clips = { far: { label: 'Far', frames: 1, fps: 4 }, mid: { label: 'Middle', frames: 1, fps: 4 } };
  d.preview = 'mid';
  const r = LM.renameLayer(d, 1, 'hills');
  assert.deepEqual(r.body.layers.map((l) => l.name), ['far', 'hills']);
  assert.deepEqual(Object.keys(r.clips), ['far', 'hills']);
  assert.equal(r.clips.hills.label, 'Middle');
  assert.equal(r.preview, 'hills');
  assert.equal(LM.renameLayer(d, 1, 'far'), null, 'taken');
  assert.equal(LM.renameLayer(d, 1, 'Two words'), null);
  assert.equal(LM.renameLayer(d, 1, '__proto__'), null);
  assert.equal(LM.renameLayer(d, 1, ''), null);
  assert.equal(LM.renameLayer(d, 5, 'x'), null);
  assert.equal(LM.renameLayer(d, 1, 'mid'), d, 'the same name changes nothing');
  await passesAndDraws(r);
});

test('order: further back or nearer; the clips stay', async () => {
  const d = forest();
  const m = LM.moveLayer(d, 0, 1);
  assert.deepEqual(m.body.layers.map((l) => l.name), ['mid', 'far']);
  assert.deepEqual(LM.moveLayer(d, 1, 0).body.layers.map((l) => l.name), ['mid', 'far']);
  assert.equal(LM.moveLayer(d, 0, -1), null, 'nothing is behind the back');
  assert.equal(LM.moveLayer(d, 1, 2), null, 'nothing is in front of the front');
  await passesAndDraws(m);
});

test('add a layer: a name of its own, a starter that draws, at most 8', async () => {
  let d = hills();
  const a = LM.addLayer(d);
  assert.equal(a.body.layers.length, 3);
  const added = a.body.layers[2];
  assert.equal(added.name, 'near');
  assert.ok(added.scroll > a.body.layers[1].scroll, 'in front of the others, so faster');
  assert.ok(added.draw.length >= 1);
  await passesAndDraws(a);
  // put behind everything when asked
  const back = LM.addLayer(d, { at: 0 });
  assert.equal(back.body.layers[0].name, 'near');
  assert.ok(back.body.layers[0].scroll < 0.1 + 1e-9);
  await passesAndDraws(back);
  for (let i = 0; i < 10; i++) { const n = LM.addLayer(d); if (!n) break; d = n; }
  assert.equal(d.body.layers.length, 8);
  assert.equal(LM.addLayer(d), null, 'no ninth layer');
  assert.equal(new Set(d.body.layers.map((l) => l.name)).size, 8);
  const ids = d.body.layers.flatMap((l) => l.draw.map((x) => x.id).filter(Boolean));
  assert.equal(new Set(ids).size, ids.length, 'every thing keeps an id of its own');
  await passesAndDraws(d);
});

test('copy a layer: next to it, a new name, its things given ids of their own', async () => {
  const d = hills();
  const c = LM.copyLayer(d, 1);
  assert.deepEqual(c.body.layers.map((l) => l.name), ['far', 'mid', 'mid-2']);
  assert.equal(c.body.layers[2].draw[0].id, 'hill-2');
  assert.equal(c.body.layers[2].draw[1].on, 'hill-2', 'a thing standing on a copied outline stands on its copy');
  await passesAndDraws(c);
  let full = forest();
  while (full.body.layers.length < 8) full = LM.addLayer(full);
  assert.equal(LM.copyLayer(full, 0), null);
});

test('remove a layer: never the last; its clip and the preview go with it', async () => {
  const d = LM.addLayer(forest(), { at: 0 });
  d.clips = { near: { frames: 1, fps: 4 }, far: { frames: 1, fps: 4 }, mid: { frames: 1, fps: 4 } };
  d.preview = 'near';
  const r = LM.removeLayer(d, 0);
  assert.deepEqual(r.body.layers.map((l) => l.name), ['far', 'mid']);
  assert.deepEqual(Object.keys(r.clips), ['far', 'mid']);
  assert.equal(r.preview, 'far');
  await passesAndDraws(r);
  const one = LM.removeLayer(r, 0);
  assert.deepEqual(one.body.layers.map((l) => l.name), ['mid']);
  assert.equal(LM.removeLayer(one, 0), null, 'a background keeps one layer');
  // the far layer's controls now name nothing: the change is made and the check says so (the editor shows it)
  assert.ok(checkFull(one, { pieces }).errors.some((m) => /Control "time": nothing uses it/.test(m)));
});

test('the scrolling preview: where each layer is drawn and where its seam falls', () => {
  assert.equal(LM.layerOffset(0, 0.5, 320), 0);
  assert.equal(LM.layerOffset(100, 0.5, 320), -50);
  assert.equal(LM.layerOffset(700, 1, 320), -60, 'wraps round');
  assert.equal(LM.layerOffset(-10, 1, 320), -310, 'the camera going left');
  assert.equal(LM.layerOffset(1e9, 0.37, 320) > -320, true);
  assert.equal(LM.layerOffset(100, 0, 320), 0, 'a still layer stays put');
  for (const c of [0, 13, 99.5, 640, 12345]) {
    const o = LM.layerOffset(c, 0.4, 320);
    assert.ok(Number.isInteger(o) && o <= 0 && o > -320, `offset ${o}`);
  }
  // the copies drawn to fill the view, and the seams (where one copy ends and the next starts)
  assert.deepEqual(LM.copiesFor(-50, 320, 320), [-50, 270]);
  assert.deepEqual(LM.copiesFor(0, 320, 320), [0]);
  assert.deepEqual(LM.seamsIn(-50, 320, 320), [270]);
  assert.deepEqual(LM.seamsIn(0, 320, 320), [0]);
  // the camera that puts a layer's seam in the middle of the view
  for (const s of [0.1, 0.4, 0.7, 1]) {
    const cam = LM.cameraForSeam(s, 320, 320);
    assert.deepEqual(LM.seamsIn(LM.layerOffset(cam, s, 320), 320, 320), [160], `scroll ${s}`);
  }
  assert.equal(LM.cameraForSeam(0, 320, 320), null, 'a still layer cannot be scrolled to its seam');
});

test('the Time and colour controls: those the colour rules read, and the colour controls', () => {
  assert.deepEqual(LM.colourRuleKeys(hills()), ['time']);
  assert.deepEqual(LM.colourRuleKeys(forest()), ['time']);
  assert.deepEqual(LM.liveControlKeys(hills()), { time: ['time'], colours: [], other: ['clouds', 'height', 'density'] });
  const stars = LM.liveControlKeys(STARS);
  assert.deepEqual(stars.colours, ['sky', 'haze', 'land']);
  assert.deepEqual(stars.time, [], 'the starfield has no time of day');
  assert.ok(stars.other.includes('style') && !stars.other.includes('speed'), `the rest, the standard speed left out: ${stars.other}`);
  // a control called time is the time of day even when no colour rule reads it (a castle's windows lit by a when)
  const c = hills(); c.body.layers[0].draw[0].paint = 'sky';
  assert.deepEqual(LM.liveControlKeys(c).time, ['time']);
  assert.deepEqual(LM.colourRuleKeys({ body: { layers: [{ draw: [{ paint: { rule: 'x', of: 'a', t: { from: '__proto__' } } }] }] } }), [], 'only real control keys');
  // a control named by a colour rule that the definition has not got is left out
  const d = hills(); d.controls = d.controls.filter((x) => x.key !== 'time');
  assert.deepEqual(LM.liveControlKeys(d).time, []);
});

test('which layer is picked', () => {
  const d = forest();
  assert.equal(LM.pickedLayer(d, {}), 0);
  assert.equal(LM.pickedLayer(d, { clip: 'mid' }), 1);
  assert.equal(LM.pickedLayer(d, { sel: 'body.layers.1.draw.0' }), 1);
  assert.equal(LM.pickedLayer(d, { pick: 'far', clip: 'mid' }), 0, 'asked for wins');
  assert.equal(LM.pickedLayer(d, { pick: 'gone', clip: 'nope' }), 0);
  assert.equal(LM.layerOfPath('body.layers.3.draw.2'), 3);
  assert.equal(LM.layerOfPath('body.pictures.draw.2'), null);
  assert.equal(LM.layerOfPath(null), null);
});

test('the validator\'s messages about a layer itself (not about its things)', () => {
  const msgs = ['Layer "far": scroll must be a number from 0 to 2', 'Layer "far", item 2: ridge@1 base must be ...', 'Layer "mid": x', 'Draw 1: y'];
  assert.deepEqual(LM.layerErrors(msgs, 'far'), ['Layer "far": scroll must be a number from 0 to 2']);
  assert.deepEqual(LM.layerErrors(msgs, 'mid'), ['Layer "mid": x']);
  assert.deepEqual(LM.layerErrors(null, 'mid'), []);
});
