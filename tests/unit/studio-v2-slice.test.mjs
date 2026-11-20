// The studio's 9-slice editor for panel bodies (build item B19b; docs/data-sprites.md section 6, "Interface: 9-slice
// editor"; Contract 8 "Stretchable pieces"; Contract 15). app/studio/v2-slice.js is its pure model:
//   - the panel's export for one state (slice and text area) exactly as the library download gives it
//     (engine/sprite.js renderSheet + engine/sheet-info.js describeSheet, animations[clip]);
//   - the four slice lines and the text area in frame pixels, hit by a pointer and dragged within the frame;
//   - the slice and text area written as data (one per state, or one for every state), checked by the validator,
//     and taken back to what the piece measures;
//   - the plan that stretches the piece to another size (corners kept, edges and middle stretched, a repeat inserted
//     whole), and the sizes the preview shows;
//   - the skin pieces offered (from the pieces index) and a skin's slots.
//   node --test tests/unit/studio-v2-slice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as SL from '../../app/studio/v2-slice.js';
import { spriteOf, checkFull } from '../../app/studio/v2-check.js';
import { renderSheet, defaultParams } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { nodePieceStore, buildPiecesIndex } from '../../tools/lib/pieces-index.mjs';
import { checkSkinPiece } from '../../engine/gen/ui.js';
import { v2Template } from '../../app/studio/v2-templates.js';

const SPRITES = new URL('../../sprites/', import.meta.url);
const lib = (id) => JSON.parse(fs.readFileSync(new URL(`${id}.json`, SPRITES), 'utf8'));
const store = nodePieceStore({ check: checkSkinPiece });
/** The sprite the studio draws of a definition, with the pieces of pieces/. */
async function spriteFor(def) {
  const r = await store.loadFor(def);
  assert.ok(r.ok, r.errors.join('; '));
  const m = spriteOf(def, { pieces: store });
  assert.ok(m.ok, (m.errors ?? []).join('; '));
  return m.sprite;
}
/** The full check the studio runs before it draws, with the pieces of pieces/. */
async function passes(def) {
  await store.loadFor(def);
  const v = checkFull(def, { pieces: store });
  assert.deepEqual(v.errors, [], 'the validator takes it');
  return v;
}
/** The download's entry for one state, the long way (every clip drawn), to hold exportOf to. */
function libraryEntry(sprite, clip) {
  const p = defaultParams(sprite);
  const sheet = renderSheet(sprite, p, {});
  const a = describeSheet(sprite, sheet.meta, p).animations[clip];
  const out = {};
  for (const k of ['border', 'rect', 'opening', 'tile', 'textArea']) if (a[k] !== undefined) out[k] = a[k];
  return out;
}

test('a panel body is told apart, and its states are its clips', async () => {
  const wood = lib('ui-buttons-wood');
  assert.equal(SL.isPanel(wood), true);
  assert.equal(SL.isPanel(lib('coin')), false);
  assert.equal(SL.isPanel(null), false);
  const sprite = await spriteFor(wood);
  assert.deepEqual(SL.panelStates(wood, sprite), ['normal', 'hover', 'pressed', 'disabled']);
  // before it draws, the states the body names
  assert.deepEqual(SL.panelStates(wood, null), ['normal', 'hover', 'pressed', 'disabled']);
  assert.deepEqual(SL.panelStates(v2Template('panel'), null), ['normal', 'hover', 'pressed', 'disabled']);
});

test('the export of a state is what the library download gives (sheet JSON, animations[clip])', async () => {
  for (const id of ['ui-buttons-wood', 'ui-bars-neon', 'ui-panel-wood']) {
    const sprite = await spriteFor(lib(id));
    for (const clip of Object.keys(sprite.clips)) {
      assert.deepEqual(SL.exportOf(sprite, clip, defaultParams(sprite)), libraryEntry(sprite, clip), `${id} ${clip}`);
    }
  }
  const wood = await spriteFor(lib('ui-buttons-wood'));
  assert.deepEqual(SL.exportOf(wood, 'normal', defaultParams(wood)), {
    border: { left: 8, bottom: 7, right: 8, top: 7 }, textArea: { x: 8, y: 7, w: 80, h: 18, colour: 'light' } });
  assert.equal(SL.exportOf(wood, 'nope', {}), null);
  // the settings are followed: a thick border measures more
  const thick = SL.exportOf(wood, 'normal', { ...defaultParams(wood), border: 1 });
  assert.ok(thick.border.left >= 8);
});

test('the slice as four lines in frame pixels: from the border, measured from the rect when there is one', async () => {
  assert.deepEqual(SL.linesOf({ border: { left: 8, bottom: 7, right: 8, top: 7 } }, [96, 32]), { x1: 8, x2: 88, y1: 7, y2: 25 });
  // a tooltip's rect: the border is measured from it
  assert.deepEqual(SL.linesOf({ border: { left: 7, bottom: 11, right: 7, top: 7 }, rect: { x: 1, y: 1, w: 94, h: 40 } }, [96, 64]), { x1: 8, x2: 88, y1: 8, y2: 30 });
  // a knob: a rect and no border, so the lines sit on the rect's edges
  assert.deepEqual(SL.linesOf({ rect: { x: 26, y: 1, w: 12, h: 14 } }, [64, 16]), { x1: 26, x2: 38, y1: 1, y2: 15 });
  assert.equal(SL.linesOf({ textArea: { x: 1, y: 1, w: 3, h: 3 } }, [64, 16]), null);
  assert.equal(SL.linesOf(null, [64, 16]), null);
});

test('lines back to a slice the validator takes: whole pixels, inside the frame, always a middle', () => {
  assert.deepEqual(SL.sliceOfLines({ x1: 8, x2: 88, y1: 7, y2: 25 }, [96, 32]), { left: 8, top: 7, right: 8, bottom: 7 });
  assert.deepEqual(SL.sliceOfLines({ x1: 8.4, x2: 87.6, y1: -3, y2: 40 }, [96, 32]), { left: 8, top: 0, right: 8, bottom: 0 });
  // crossed or touching lines keep a middle of one pixel
  const s = SL.sliceOfLines({ x1: 60, x2: 20, y1: 20, y2: 20 }, [96, 32]);
  assert.ok(s.left + s.right < 96 && s.top + s.bottom < 32, JSON.stringify(s));
  for (const k of SL.SLICE_SIDES) assert.ok(Number.isInteger(s[k]) && s[k] >= 0);
  // a slice for a state with none: the style guide's 8 px border, kept to the frame
  assert.deepEqual(SL.startSlice([96, 32]), { left: 8, top: 8, right: 8, bottom: 8 });
  const small = SL.startSlice([12, 10]);
  assert.ok(small.left + small.right < 12 && small.top + small.bottom < 10);
});

test('a slice written for one state, then for every state, then back to what the piece measures', async () => {
  const wood = lib('ui-buttons-wood');
  const sprite = await spriteFor(wood);
  const clips = SL.panelStates(wood, sprite);
  assert.equal(SL.writtenSlice(wood, 'normal'), null);
  const one = SL.setSlice(wood, 'normal', { left: 12, top: 6, right: 10, bottom: 6 }, { clips });
  assert.deepEqual(one.slice, { normal: { left: 12, top: 6, right: 10, bottom: 6 } });
  assert.equal(wood.slice, undefined, 'the definition handed in is not changed');
  assert.deepEqual(SL.writtenSlice(one, 'normal'), { left: 12, top: 6, right: 10, bottom: 6 });
  assert.equal(SL.writtenSlice(one, 'hover'), null);
  await passes(one);
  // the download says the written slice for that state, the measured one for the others
  const s1 = await spriteFor(one);
  assert.deepEqual(SL.exportOf(s1, 'normal', defaultParams(s1)).border, { left: 12, bottom: 6, right: 10, top: 6 });
  assert.deepEqual(SL.exportOf(s1, 'hover', defaultParams(s1)).border, { left: 8, bottom: 7, right: 8, top: 7 });
  // every state: one object
  const all = SL.setSlice(one, 'hover', { left: 9, top: 5, right: 9, bottom: 5 }, { clips, every: true });
  assert.deepEqual(all.slice, { left: 9, top: 5, right: 9, bottom: 5 });
  assert.deepEqual(SL.writtenSlice(all, 'pressed'), { left: 9, top: 5, right: 9, bottom: 5 });
  assert.equal(SL.writtenEvery(all, 'slice'), true);
  await passes(all);
  // one state changed after a slice for every state: the others keep it
  const split = SL.setSlice(all, 'pressed', { left: 4, top: 4, right: 4, bottom: 4 }, { clips });
  assert.deepEqual(split.slice, { normal: { left: 9, top: 5, right: 9, bottom: 5 }, hover: { left: 9, top: 5, right: 9, bottom: 5 }, pressed: { left: 4, top: 4, right: 4, bottom: 4 }, disabled: { left: 9, top: 5, right: 9, bottom: 5 } });
  await passes(split);
  // back to the measured: one state, then the field goes when nothing is left
  const back = SL.clearSlice(one, 'normal', { clips });
  assert.equal('slice' in back, false);
  const back2 = SL.clearSlice(split, 'pressed', { clips });
  assert.equal(SL.writtenSlice(back2, 'pressed'), null);
  assert.deepEqual(SL.writtenSlice(back2, 'normal'), { left: 9, top: 5, right: 9, bottom: 5 });
  assert.equal('slice' in SL.clearSlice(all, 'normal', { clips, every: true }), false);
  // a slice for every state cleared for one state: the others keep it
  const kept = SL.clearSlice(all, 'hover', { clips });
  assert.equal(SL.writtenSlice(kept, 'hover'), null);
  assert.deepEqual(SL.writtenSlice(kept, 'normal'), { left: 9, top: 5, right: 9, bottom: 5 });
});

test('a written slice is held to the frame and to the panel\'s states', () => {
  const wood = lib('ui-buttons-wood');
  const clips = ['normal', 'hover', 'pressed', 'disabled'];
  const d = SL.setSlice(wood, 'normal', { left: 90, top: 40, right: 90, bottom: 40 }, { clips });
  const s = d.slice.normal;
  assert.ok(s.left + s.right < 96 && s.top + s.bottom < 32);
  assert.throws(() => SL.setSlice(wood, 'nope', { left: 1, top: 1, right: 1, bottom: 1 }, { clips }));
  assert.throws(() => SL.setSlice(wood, '__proto__', { left: 1, top: 1, right: 1, bottom: 1 }, { clips: [...clips, '__proto__'] }));
  // what writing a slice drops from what the piece measured (the validator takes only left, top, right and bottom)
  assert.deepEqual(SL.lostByWriting({ border: { left: 8, bottom: 4, right: 8, top: 4 }, opening: { x: 5, y: 5, w: 54, h: 6 } }), ['opening']);
  assert.deepEqual(SL.lostByWriting({ rect: { x: 1, y: 1, w: 9, h: 9 }, tile: { x: 3, w: 2 } }), ['rect', 'tile']);
  assert.deepEqual(SL.lostByWriting({ border: { left: 1, bottom: 1, right: 1, top: 1 } }), []);
});

test('the text area: read from the export, written with its colour as a paint of the palette, and taken back', async () => {
  const wood = lib('ui-buttons-wood');
  const sprite = await spriteFor(wood);
  const clips = SL.panelStates(wood, sprite);
  const exp = SL.exportOf(sprite, 'normal', defaultParams(sprite));
  assert.deepEqual(SL.areasOf(exp), [{ x: 8, y: 7, w: 80, h: 18, colour: 'light' }]);
  assert.deepEqual(SL.areasOf({ textArea: [{ x: 1, y: 2, w: 3, h: 4, colour: 'light' }, { x: 5, y: 6, w: 7, h: 8, colour: '#231b33' }] }).length, 2);
  assert.deepEqual(SL.areasOf({}), []);
  // a colour the download gives as a hex is written as the palette's paint that has it; light text is the default
  assert.equal(SL.paintFor('#231b33', wood), 'ink');
  assert.equal(SL.paintFor('#a06a3c', wood), 'face');
  assert.equal(SL.paintFor('light', wood), undefined);
  assert.equal(SL.paintFor('#010203', wood), undefined);
  const d = SL.setTextArea(wood, 'normal', { x: 10, y: 8, w: 70, h: 16, colour: '#231b33' }, { clips });
  assert.deepEqual(d.textArea, { normal: { x: 10, y: 8, w: 70, h: 16, colour: 'ink' } });
  assert.deepEqual(SL.writtenArea(d, 'normal'), { x: 10, y: 8, w: 70, h: 16, colour: 'ink' });
  await passes(d);
  const s = await spriteFor(d);
  assert.deepEqual(SL.exportOf(s, 'normal', defaultParams(s)).textArea, { x: 10, y: 8, w: 70, h: 16, colour: '#231b33' });
  // held to the frame; light text leaves the colour out
  const far = SL.setTextArea(wood, 'hover', { x: 90, y: 30, w: 50, h: 50, colour: 'light' }, { clips });
  const a = far.textArea.hover;
  assert.ok(a.x + a.w <= 96 && a.y + a.h <= 32 && a.w >= 1 && a.h >= 1, JSON.stringify(a));
  assert.equal('colour' in a, false);
  await passes(far);
  // every state, and back
  const all = SL.setTextArea(wood, 'normal', { x: 8, y: 8, w: 80, h: 16 }, { clips, every: true });
  assert.deepEqual(all.textArea, { x: 8, y: 8, w: 80, h: 16 });
  assert.equal(SL.writtenEvery(all, 'textArea'), true);
  assert.equal('textArea' in SL.clearTextArea(d, 'normal', { clips }), false);
});

test('a pointer hits a slice line, the text area or its corner; a drag moves it within the frame', () => {
  const lines = { x1: 8, x2: 88, y1: 7, y2: 25 };
  const area = { x: 10, y: 9, w: 60, h: 12 };
  const tol = 1;
  assert.equal(SL.hitTest({ lines, area }, [8.3, 3], tol), 'left');
  assert.equal(SL.hitTest({ lines, area }, [88, 30], tol), 'right');
  assert.equal(SL.hitTest({ lines, area }, [50, 7.5], tol), 'top');
  assert.equal(SL.hitTest({ lines, area }, [50, 25], tol), 'bottom');
  assert.equal(SL.hitTest({ lines, area }, [70, 21], tol), 'area-size');
  assert.equal(SL.hitTest({ lines, area }, [40, 15], tol), 'area');
  assert.equal(SL.hitTest({ lines, area }, [3, 15], tol), null);
  assert.equal(SL.hitTest({ lines: null, area: null }, [3, 15], tol), null);
  const size = [96, 32];
  // a line moves by whole pixels and never past the one across from it, nor out of the frame
  assert.deepEqual(SL.dragged('left', { lines, area }, [4.4, 0], size).lines, { ...lines, x1: 12 });
  assert.equal(SL.dragged('left', { lines, area }, [200, 0], size).lines.x1, 87);
  assert.equal(SL.dragged('left', { lines, area }, [-50, 0], size).lines.x1, 0);
  assert.equal(SL.dragged('bottom', { lines, area }, [0, 50], size).lines.y2, 32);
  assert.equal(SL.dragged('top', { lines, area }, [0, 50], size).lines.y1, 24);
  // the text area moves whole and stays in the frame; its corner sizes it, at least a pixel
  assert.deepEqual(SL.dragged('area', { lines, area }, [-3, 2], size).area, { x: 7, y: 11, w: 60, h: 12 });
  assert.deepEqual(SL.dragged('area', { lines, area }, [100, 100], size).area, { x: 36, y: 20, w: 60, h: 12 });
  assert.deepEqual(SL.dragged('area-size', { lines, area }, [-100, 3], size).area, { x: 10, y: 9, w: 1, h: 15 });
  assert.deepEqual(SL.dragged('area-size', { lines, area }, [100, 100], size).area, { x: 10, y: 9, w: 86, h: 23 });
  // the others are left alone
  assert.deepEqual(SL.dragged('left', { lines, area }, [1, 0], size).area, area);
  assert.deepEqual(SL.dragged('area', { lines, area }, [1, 0], size).lines, lines);
});

test('the stretch plan: corners kept, edges and middle stretched to fill the size exactly', () => {
  const exp = { border: { left: 8, bottom: 7, right: 8, top: 7 } };
  const p = SL.stretchPlan(exp, [96, 32], [200, 50]);
  assert.equal(p.w, 200);
  assert.equal(p.h, 50);
  assert.equal(p.parts.length, 9);
  let area = 0;
  for (const q of p.parts) {
    area += q.dw * q.dh;
    assert.ok(q.sx >= 0 && q.sy >= 0 && q.sx + q.sw <= 96 && q.sy + q.sh <= 32, JSON.stringify(q));
    assert.ok(q.dx >= 0 && q.dy >= 0 && q.dx + q.dw <= 200 && q.dy + q.dh <= 50, JSON.stringify(q));
  }
  assert.equal(area, 200 * 50, 'the parts cover the size once');
  const corners = p.parts.filter((q) => q.sw === 8 && q.sh === 7);
  assert.equal(corners.length, 4);
  for (const q of corners) { assert.equal(q.dw, 8); assert.equal(q.dh, 7); }
  // smaller than the corners: held to them
  const tiny = SL.stretchPlan(exp, [96, 32], [4, 4]);
  assert.ok(tiny.w >= 16 && tiny.h >= 14);
  // a rect is cut out first
  const r = SL.stretchPlan({ border: { left: 7, bottom: 11, right: 7, top: 7 }, rect: { x: 1, y: 1, w: 94, h: 40 } }, [96, 64], [150, 60]);
  assert.equal(r.w, 150);
  assert.equal(Math.min(...r.parts.map((q) => q.sx)), 1);
  assert.equal(Math.max(...r.parts.map((q) => q.sx + q.sw)), 95);
  assert.equal(Math.max(...r.parts.map((q) => q.sy + q.sh)), 41);
  // a repeat is inserted whole, never stretched; the height stays
  const t = SL.stretchPlan({ tile: { x: 10, w: 6 } }, [64, 16], [76, 40]);
  assert.equal(t.w, 76);
  assert.equal(t.h, 16);
  for (const q of t.parts) { assert.equal(q.sw, q.dw); assert.equal(q.sh, q.dh); }
  assert.equal(t.parts.filter((q) => q.sx === 10 && q.sw === 6).length, 3);
  // a rect alone does not stretch; nothing to stretch is null
  const k = SL.stretchPlan({ rect: { x: 26, y: 1, w: 12, h: 14 } }, [64, 16], [40, 40]);
  assert.deepEqual([k.w, k.h, k.fixed], [12, 14, true]);
  assert.equal(SL.stretchPlan({ textArea: {} }, [64, 16], [40, 40]), null);
});

test('the preview sizes: the piece\'s own size first, then wider, taller and smaller ones it can take', () => {
  const sizes = SL.previewSizes({ border: { left: 8, bottom: 7, right: 8, top: 7 } }, [96, 32]);
  assert.ok(sizes.length >= 3, JSON.stringify(sizes));
  assert.deepEqual(sizes[0], [96, 32]);
  assert.ok(sizes.some(([w, h]) => w > 96 && h === 32));
  assert.ok(sizes.some(([, h]) => h > 32));
  for (const [w, h] of sizes) { assert.ok(w >= 17 && h >= 15 && w <= 512 && h <= 512); assert.ok(Number.isInteger(w) && Number.isInteger(h)); }
  assert.equal(new Set(sizes.map((s) => s.join('x'))).size, sizes.length, 'no size twice');
  const tile = SL.previewSizes({ tile: { x: 10, w: 6 } }, [64, 16]);
  for (const [w, h] of tile) { assert.equal((w - 64) % 6, 0); assert.equal(h, 16); }
  assert.deepEqual(SL.previewSizes({ rect: { x: 26, y: 1, w: 12, h: 14 } }, [64, 16]), [[12, 14]]);
  assert.deepEqual(SL.previewSizes(null, [64, 16]), []);
  // where the text area lands on a stretched piece: its edges follow the stretch
  const box = SL.stretchBox({ border: { left: 8, bottom: 7, right: 8, top: 7 } }, [96, 32], [176, 32], { x: 8, y: 7, w: 80, h: 18 });
  assert.deepEqual(box, { x: 8, y: 7, w: 160, h: 18 });
});

test('the skins offered: every skin of the pieces index (each version), with its slots', () => {
  const { index } = buildPiecesIndex({ check: checkSkinPiece });
  const list = SL.skinChoices(index, { use: 'skin:wood', v: 1 });
  assert.ok(list.some((s) => s.use === 'skin:wood' && s.v === 1));
  assert.ok(list.some((s) => s.use === 'skin:neon'));
  assert.ok(list.every((s) => s.use.startsWith('skin:') && Number.isInteger(s.v) && typeof s.name === 'string'));
  // the skin in use is offered even when the index has not got it (an empty index on a fresh checkout)
  assert.deepEqual(SL.skinChoices({ pieces: [] }, { use: 'skin:wood', v: 1 }).map((s) => `${s.use}@${s.v}`), ['skin:wood@1']);
  assert.deepEqual(SL.skinChoices(null, null), []);
  const wood = index.pieces.find((p) => p.id === 'skin:wood' && p.v === 1);
  assert.deepEqual(SL.skinSlots(wood).map((s) => s.id), ['face', 'frame', 'nail', 'shine', 'stone']);
  assert.deepEqual(SL.skinSlots(null), []);
  // a new skin's paint: each of its slots the sprite's palette has by the same id
  assert.deepEqual(SL.skinPaintFor(wood, lib('ui-buttons-wood')), { face: 'face', frame: 'frame' });
});

test('the module is pure: it runs in Node, and changes never reach an object\'s machinery', () => {
  const src = fs.readFileSync(new URL('../../app/studio/v2-slice.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from ['"]node:|document\.|window\./);
  for (const m of src.matchAll(/^export (?:function|const) (\w+)/gm)) {
    const before = src.slice(0, m.index).trimEnd().split('\n').at(-1);
    assert.match(before, /\*\/$/, `${m[1]} has a one-line comment`);
  }
  const wood = lib('ui-buttons-wood');
  assert.throws(() => SL.setTextArea(wood, 'constructor', { x: 1, y: 1, w: 1, h: 1 }, { clips: ['constructor'] }));
});

// ---- B19b review round 1 ----

test('the piece pick: every interface piece generator, and a switch that keeps what the new one takes', async () => {
  const choices = SL.pieceChoices();
  const ids = choices.map((c) => c.id);
  for (const id of ['ui.button', 'ui.slab', 'ui.trough', 'ui.panel']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length, 'one row per generator');
  assert.ok(choices.every((c) => c.family === 'ui' && c.versions.length >= 1 && c.versions.every((v, i, a) => i === 0 || a[i - 1] > v)), 'newest version first');
  assert.ok(!ids.includes('glint'), 'only the family a panel piece takes');
  const wood = lib('ui-buttons-wood');
  // ui.button to ui.slab: the place, the size and the bound style, corner and border are kept; nails and grain are not ui.slab's
  const slab = SL.switchPiece(wood, 'ui.slab', 1);
  const pc = slab.def.body.panel.piece;
  assert.equal(pc.gen, 'ui.slab');
  assert.equal(pc.v, 1);
  assert.deepEqual(pc.at, [1, 1]);
  assert.deepEqual(pc.size, [94, 30]);
  assert.deepEqual(pc.style, { from: 'style' });
  assert.deepEqual(pc.corner, wood.body.panel.piece.corner);
  assert.deepEqual(slab.dropped.sort(), ['grain', 'nails']);
  // the controls only those read would set nothing (the validator refuses that), so they go, and are named
  assert.deepEqual(slab.removed.sort(), ['nails', 'texture']);
  assert.deepEqual(slab.def.controls.map((c) => c.key), ['style', 'corner', 'border']);
  assert.equal(wood.body.panel.piece.gen, 'ui.button', 'the definition handed in is not changed');
  await passes(slab.def);
  const s = await spriteFor(slab.def);
  assert.ok(SL.exportOf(s, 'normal', defaultParams(s)));
  // and on to ui.trough, then back to ui.button
  const trough = SL.switchPiece(slab.def, 'ui.trough', 1);
  assert.equal(trough.def.body.panel.piece.gen, 'ui.trough');
  await passes(trough.def);
  const back = SL.switchPiece(trough.def, 'ui.button', 1);
  await passes(back.def);
  // a size the new generator cannot take is held to its range; a missing size fills the frame inside `at`
  const big = SL.switchPiece({ ...wood, size: [200, 32], body: { panel: { ...wood.body.panel, piece: { ...wood.body.panel.piece, size: [198, 30] } } } }, 'ui.slab', 1);
  assert.deepEqual(big.def.body.panel.piece.size, [128, 30]);
  const none = SL.switchPiece({ ...wood, body: { panel: { ...wood.body.panel, piece: { gen: 'ui.button', v: 1, at: [2, 1] } } } }, 'ui.slab', 1);
  assert.deepEqual(none.def.body.panel.piece.size, [92, 30]);
  // a word the new generator has no such value for is dropped (optional) and said
  const word = SL.switchPiece({ ...wood, body: { panel: { ...wood.body.panel, piece: { ...wood.body.panel.piece, state: 'pressed' } } } }, 'ui.trough', 1);
  assert.ok(!('state' in word.def.body.panel.piece) && word.dropped.includes('state'));
  // the template's piece switches too
  const tpl = v2Template('panel');
  await passes(SL.switchPiece(tpl, 'ui.slab', 1).def);
  // not an interface piece, not a version, not a panel
  assert.throws(() => SL.switchPiece(wood, 'glint', 1), /interface piece/);
  assert.throws(() => SL.switchPiece(wood, 'ui.slab', 99), /version/);
  assert.throws(() => SL.switchPiece(lib('coin'), 'ui.slab', 1), /panel/);
});

test('the frame the editor works in is the drawn sprite\'s, bounded, and the setters hold to it', async () => {
  const wood = lib('ui-buttons-wood');
  const sprite = await spriteFor(wood);
  const stale = { ...wood, size: [5000, 32] };
  // a draft with mistakes: the picture is the last that drew, so its frame is the one worked in
  assert.deepEqual(SL.frameOf(stale, sprite), [96, 32]);
  assert.deepEqual(SL.frameOf(wood, null), [96, 32]);
  assert.deepEqual(SL.frameOf({ ...wood, size: [40000, 40000] }, null), [SL.FRAME_MOST, SL.FRAME_MOST]);
  assert.deepEqual(SL.frameOf({ ...wood, size: 'x' }, null), [32, 32]);
  // the zoom keeps the picture within a canvas a browser draws
  assert.ok(SL.zoomFor([96, 32]) >= 2 && Number.isInteger(SL.zoomFor([96, 32])));
  for (const sz of [[96, 32], [5000, 32], [6000, 6000], [SL.FRAME_MOST, SL.FRAME_MOST], [1, 1]]) {
    const z = SL.zoomFor(sz);
    assert.ok(z > 0 && Math.round(sz[0] * z) <= SL.PIC_MOST && Math.round(sz[1] * z) <= SL.PIC_MOST, `${sz} at ${z}`);
  }
  // the setters take the frame they are given, not the draft's size
  const clips = SL.panelStates(wood, sprite);
  const d = SL.setSlice(stale, 'normal', { left: 8, top: 7, right: 4912, bottom: 7 }, { clips, size: [96, 32] });
  assert.ok(d.slice.normal.left + d.slice.normal.right < 96, JSON.stringify(d.slice));
  const a = SL.setTextArea(stale, 'normal', { x: 8, y: 7, w: 4000, h: 18 }, { clips, size: [96, 32] });
  assert.ok(a.textArea.normal.x + a.textArea.normal.w <= 96, JSON.stringify(a.textArea));
});

test('a text colour no paint has is told, not dropped quietly; a palette colour can be added for it', async () => {
  const plate = lib('ui-name-plate');
  const sprite = await spriteFor(plate);
  const clips = SL.panelStates(plate, sprite);
  const exp = SL.exportOf(sprite, clips[0], defaultParams(sprite));
  const area = SL.areasOf(exp)[0];
  assert.equal(area.colour, '#ffffff');
  assert.deepEqual(SL.textColourOf('#ffffff', plate), { lost: '#ffffff' });
  assert.deepEqual(SL.textColourOf('light', plate), { light: true });
  assert.deepEqual(SL.textColourOf('#3f5068', plate), { ref: 'face' });
  assert.deepEqual(SL.textColourOf('frame.dark', plate), { ref: 'frame.dark' });
  assert.deepEqual(SL.textColourOf({ rule: 'grey', of: 'face' }, plate), { rule: { rule: 'grey', of: 'face' } });
  // under a colour setting the paint that has the colour at those settings is found
  assert.equal(SL.paintFor('#8e3a4a', plate, { ...defaultParams(sprite), face: '#8e3a4a' }), 'face');
  assert.equal(SL.paintFor('#8e3a4a', plate), undefined);
  // a palette colour for it: the written area keeps the download's colour
  const withText = SL.addTextColour(plate, '#ffffff');
  const slot = withText.def.palette.at(-1);
  assert.equal(withText.ref, slot.id);
  assert.equal(slot.default, '#ffffff');
  assert.equal(slot.detail, true, 'not a colour people set');
  assert.equal(SL.paintFor('#ffffff', withText.def), slot.id);
  const d = SL.setTextArea(withText.def, clips[0], { ...area, x: area.x + 1 }, { clips });
  assert.equal(d.textArea[clips[0]].colour, slot.id);
  await passes(d);
  const s = await spriteFor(d);
  assert.equal(SL.areasOf(SL.exportOf(s, clips[0], defaultParams(s)))[0].colour, '#ffffff');
  // a palette already at its 12 colours cannot take one more
  const full = { ...plate, palette: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, default: '#101010', material: 'paint' })) };
  assert.throws(() => SL.addTextColour(full, '#ffffff'), /12/);
  assert.throws(() => SL.addTextColour(plate, 'white'), /colour/);
});
