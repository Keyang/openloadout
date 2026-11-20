// The `panel` layout and the interface skins (build item B13; docs/data-sprites.md 2.5b, 4.3 and section 9 row B13).
// A panel body names a skin piece (pieces/skin-*.v1.json) and one interface piece generator; its states are its clips.
// engine/gen/ui.js registers the layout "panel" (family "layout"), so engine/data-sprite.js lays every panel body out
// with it. Held to here:
//   - the layout is registered and a panel body is drawn by the site's own registry and pieces
//   - the skins are pieces: valid, pinned, with the body the layout reads (checkSkinPiece)
//   - a state's look comes from the skin (lift, lip, desaturate) unless the body overrides it; a style word picks the
//     skin's args for it; the call's own args win over the skin's
//   - the ui-button fixture of B1 (tests/fixtures/v2/ui-button.json) draws: four states, its written slice and text area
//   - three library pieces redrawn as data (tests/fixtures/v2/panel/: the wooden button, the dialogue box, the flat
//     bars) give the download exactly the stretch borders, rects, openings and text areas their code sprites give, at
//     every option and the ends of every slider; each passes the quality bar (checkSprite)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as registry from '../../engine/gen/index.js';
import { dataSprite, dataFrameList } from '../../engine/data-sprite.js';
import { renderFrame, renderSheet, defaultParams, clipStretch } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { validatePiece, createPieceStore } from '../../engine/pieces.js';
import { nodePieceStore, nodePieceReader, readPins, buildPiecesIndex } from '../../tools/lib/pieces-index.mjs';
import { checkSprite } from '../../quality/sprite.js';
import { checkSkinPiece, checkSkin, stateLook, prepareCall, SKIN_FIELDS } from '../../engine/gen/ui.js';
import { codeSprite } from '../helpers/library.mjs';

const FIX = new URL('../fixtures/v2/', import.meta.url);
const PIECES = new URL('../../pieces/', import.meta.url);
const read = (u) => JSON.parse(fs.readFileSync(u, 'utf8'));
const read0 = (rel) => read(new URL(rel, FIX));
const store = nodePieceStore({ check: checkSkinPiece });

/** A fixture made into a sprite with the site's registry and the pieces of pieces/. */
async function load(rel) {
  const def = read(new URL(rel, FIX));
  const r = await store.loadFor(def);
  assert.ok(r.ok, r.errors.join('; '));
  return dataSprite(def, { pieces: store, strict: true });
}
// the code sprite as it was before its redraw (a frozen copy, tests/fixtures/code-sprites/: migration batch M8 redraws
// ui-buttons-wood and ui-bars-flat as data, so sprites/ no longer holds their code files)
const old = (id) => codeSprite(id);
// every skin in pieces/ (the next ports add skin-candy, skin-gilded ...): the build and the pieces CLI do not run the
// skin hook yet (tools/lib/pieces-index.mjs passes no `check`), so this test is where a malformed skin is caught
const SKINS = fs.readdirSync(PIECES).filter((f) => /^skin-[a-z0-9-]+\.v\d+\.json$/.test(f)).sort();

test('the panel layout is registered from engine/gen/ui.js', () => {
  const e = registry.generator('panel', 1);
  assert.ok(e, 'panel@1');
  assert.equal(e.family, 'layout');
  assert.deepEqual(registry.runGenerator({ gen: 'panel', v: 1 }).primitives, [], 'called as a plain generator it draws nothing');
});

test('the skins are pieces: valid, pinned, each body what the layout reads', () => {
  const read0 = readPins(), pins = read0.pins ?? read0;
  const index = buildPiecesIndex({ check: checkSkinPiece });
  for (const f of SKINS) {
    const text = fs.readFileSync(new URL(f, PIECES), 'utf8');
    const r = validatePiece(text, { file: f, check: checkSkinPiece });
    assert.ok(r.ok, `${f}: ${r.errors.join('; ')}`);
    assert.deepEqual(r.warnings, [], f);
    assert.ok(pins[`${r.piece.id}@${r.piece.v}`], `${f} is pinned`);
    assert.ok(Object.keys(r.piece.body).every((k) => SKIN_FIELDS.includes(k)));
  }
  assert.ok(index.index.pieces.some((p) => p.ref === 'skin:wood@1'));
  // what checkSkin refuses
  assert.match(checkSkin({ paint: { face: 'face' }, args: { 'ui.nothing': {} } }).errors.join(' '), /ui\.nothing/);
  assert.match(checkSkin({ states: { pressed: { lip: 9 } } }).errors.join(' '), /lip/);
  assert.match(checkSkin({ styles: { plank: { 'ui.button': { texture: 'velvet' } } } }).errors.join(' '), /texture/);
  assert.match(checkSkin({ wobble: 1 }).errors.join(' '), /wobble/);
  assert.match(checkSkin({ styles: { fancy: {} } }).errors.join(' '), /fancy/, 'a style is one of the style words');
  assert.deepEqual(checkSkinPiece({ id: 'part:x', body: { draw: [] } }), [], 'other kinds are not this module\'s');
});

test('a state\'s look is the skin\'s unless the body says otherwise; the skin\'s style args, then the call\'s own, then the state', () => {
  const skin = { states: { pressed: { lip: 0 }, disabled: { desaturate: 1 } } };
  assert.deepEqual(stateLook(skin, ['normal', 'pressed'], 'pressed'), { lift: 0, lip: 0, desaturate: 0 });
  assert.deepEqual(stateLook(skin, { pressed: { lip: 1 } }, 'pressed'), { lift: 0, lip: 1, desaturate: 0 });
  assert.deepEqual(stateLook(skin, [], 'disabled'), { lift: 0, lip: null, desaturate: 1 });
  assert.deepEqual(stateLook({}, [], 'box'), { lift: 0, lip: null, desaturate: 0 });
  const body = { paint: { face: 'face', frame: 'frame', nail: 'nail-p1' }, args: { 'ui.button': { bevel: 'wood', corner: 1 } }, styles: { carved: { 'ui.button': { cut: 'cut', texture: 'chisel' } } } };
  const call = prepareCall(registry, { gen: 'ui.button', v: 1, size: [96, 32], style: 'carved', corner: 3 }, body, { state: 'pressed', look: { lift: 0, lip: 0, desaturate: 0 } });
  assert.deepEqual(
    [call.bevel, call.cut, call.texture, call.corner, call.face, call.nail, call.state, call.lip],
    ['wood', 'cut', 'chisel', 3, 'face', 'nail-p1', 'pressed', 0]);
  const own = prepareCall(registry, { gen: 'ui.button', v: 1, size: [96, 32], style: 'carved', texture: 'grain', cut: 'round' }, body, { state: 'normal', look: { lift: 0, lip: null, desaturate: 0 } });
  assert.deepEqual([own.texture, own.cut, own.bevel], ['grain', 'round', 'wood'], 'the call\'s own arguments win over the skin\'s for its style word');
  const asked = prepareCall(registry, { gen: 'ui.button', v: 1, size: [96, 32], state: 'hover' }, body, { state: 'pressed', look: { lift: 0, lip: 0, desaturate: 0 } });
  assert.deepEqual([asked.state, asked.lip], ['hover', undefined], 'a call that names its own state keeps it');
  const other = prepareCall(registry, { gen: 'twinkle', v: 1, at: [1, 1], paint: 'face', core: 'face' }, body, { state: 'pressed', look: {} });
  assert.deepEqual(other, { gen: 'twinkle', v: 1, at: [1, 1], paint: 'face', core: 'face' }, 'not an interface piece: left as written');
});

test('the ui-button fixture (B1) draws with the site\'s registry and the wood skin: four states, its written slice and text area', async () => {
  const s = await load('ui-button.json');
  assert.deepEqual(Object.keys(s.clips), ['normal', 'hover', 'pressed', 'disabled']);
  const p = defaultParams(s);
  const frames = Object.fromEntries(Object.keys(s.clips).map((c) => [c, renderFrame(s, c, 0, p)]));
  const solid = (g) => g.data.filter((v) => v >>> 24).length;
  assert.ok(solid(frames.normal) > 96 * 28, 'the button fills its frame');
  for (const c of ['hover', 'pressed', 'disabled']) assert.ok(frames[c].data.some((v, i) => v !== frames.normal.data[i]), `${c} differs from normal`);
  const grey = (v) => { const r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255; return Math.max(r, g, b) - Math.min(r, g, b) <= 8; };   // a grey's shade band drifts a little toward blue (engine/color.js tone)
  const INK = 0xff331b23;
  const lit = frames.disabled.data.filter((v) => v >>> 24 && (v >>> 0) !== INK);
  assert.ok(lit.length > 1000 && lit.every(grey), 'disabled has no colour but its ink');
  const inkOf = (g) => g.data.filter((v) => (v >>> 0) === INK).length;
  assert.ok(inkOf(frames.normal) > 200, 'the button is inked');
  assert.equal(inkOf(frames.disabled), inkOf(frames.normal), 'ink stays ink when disabled: every ink pixel of normal is still ink');
  assert.deepEqual(clipStretch(s, 'pressed', p), { border: { left: 6, bottom: 6, right: 6, top: 6 } }, 'its written slice');
  const a = s.textArea('normal', p);
  assert.deepEqual([a.x, a.y, a.w, a.h], [8, 8, 80, 16]);
  for (const style of ['plain', 'framed', 'carved']) assert.ok(solid(renderFrame(s, 'normal', 0, { ...p, style })) > 0, style);
  const { list } = dataFrameList(s, 'normal', 0, p);
  assert.ok(list.length > 10 && list.every((x) => typeof x.kind === 'string'));
});

// ---- the three redraws: the download's stretch borders and text areas equal the code sprites' --------------------

/** Settings to compare at: defaults, every option of every choice, each toggle flipped, every slider at both ends. */
function grid(sprite) {
  const base = defaultParams(sprite);
  const out = [base];
  for (const [k, c] of Object.entries(sprite.params)) {
    if (c.kind === 'choice') for (const o of c.options) out.push({ ...base, [k]: o.value ?? o });
    if (c.kind === 'toggle') out.push({ ...base, [k]: !base[k] });
    if (c.kind === 'range') for (const v of [0, 0.25, 0.5, 0.75, 1]) out.push({ ...base, [k]: v });
  }
  for (const [k, c] of Object.entries(sprite.params)) if (c.kind === 'choice') for (const o of c.options) for (const v of [0, 1]) out.push({ ...base, [k]: o.value ?? o, corner: v, border: 1 - v });
  return out;
}
/** What the download says about each clip's stretching and text, from the sheet JSON (Contract 8). */
function download(sprite, p) {
  const sheet = renderSheet(sprite, p);
  const info = describeSheet(sprite, sheet.meta, p);
  return Object.fromEntries(Object.entries(info.animations).map(([name, a]) => [name, { border: a.border, rect: a.rect, opening: a.opening, tile: a.tile, textArea: a.textArea, state: a.state, kind: info.kind }]));
}

for (const [fixture, id] of [['panel/ui-buttons-wood.json', 'ui-buttons-wood'], ['panel/ui-dialogue.json', 'ui-dialogue'], ['panel/ui-bars-flat.json', 'ui-bars-flat']]) {
  test(`${id} redrawn as data: same id, clips, controls and sounds; the download's stretching and text areas equal the code sprite's`, async () => {
    const [s, o] = [await load(fixture), await old(id)];
    assert.equal(s.id, o.id);
    assert.deepEqual(Object.keys(s.clips), Object.keys(o.clips), 'clips kept, in order');
    for (const c of Object.keys(o.clips)) assert.deepEqual([s.clips[c].frames, s.clips[c].loop, s.clips[c].label], [o.clips[c].frames, o.clips[c].loop, o.clips[c].label], c);
    assert.deepEqual(Object.keys(s.params).sort(), Object.keys(o.params).sort(), 'control keys kept');
    for (const [k, c] of Object.entries(o.params)) {
      assert.equal(s.params[k].kind, c.kind, k);
      if (c.kind === 'choice') assert.deepEqual(s.params[k].options.map((x) => x.value), c.options.map((x) => x.value), k);
      if (c.kind === 'color') assert.equal(s.params[k].def, c.def, k);
    }
    assert.deepEqual(s.sounds ?? {}, o.sounds ?? {}, 'sound cues kept');
    assert.deepEqual([s.size, s.pivot, s.grounded, s.preview], [o.size, o.pivot, o.grounded, o.preview]);
    for (const p of grid(o)) {
      const want = download(o, p), got = download(s, p);
      assert.deepEqual(got, want, `${id} at ${JSON.stringify(p)}`);
      for (const c of Object.keys(o.clips)) {
        assert.deepEqual(clipStretch(s, c, p), clipStretch(o, c, p), `${id} ${c} slice`);
        if (!o.textArea || o.clips[c].noText) continue;
        const [a, b] = [s.textArea(c, p), o.textArea(c, p)];
        const strip = (x) => (Array.isArray(x) ? x.map(strip) : { x: x.x, y: x.y, w: x.w, h: x.h, ...(x.edge ? { edge: x.edge } : {}) });
        assert.deepEqual(strip(a), strip(b), `${id} ${c} text area at ${JSON.stringify(p)}`);
      }
    }
  });

  test(`${id} redrawn as data passes the quality bar`, async () => {
    const s = await load(fixture);
    const r = checkSprite(s);
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
  });
}

test('the dialogue box\'s states that are not button states draw as normal; its "next" arrow bobs and carries no text', async () => {
  const s = await load('panel/ui-dialogue.json');
  const p = defaultParams(s);
  assert.deepEqual(s.textArea('next', p), []);
  const f0 = renderFrame(s, 'next', 0, p), f2 = renderFrame(s, 'next', 2, p);
  assert.ok(f0.data.some((v, i) => v !== f2.data[i]), 'the arrow moves');
  const box = renderFrame(s, 'box', 0, p), tag = renderFrame(s, 'name-tag', 0, p);
  assert.ok(!tag.get(2, 2) && box.get(2, 2), 'the name tag sits in its own rectangle');
});

// ---- review fixes (B13 round 2) ----------------------------------------------------------------------------------

test('ui-buttons-wood redrawn: every pixel of plank and carved is the code sprite\'s, in every state; stone is a greyed slab', async () => {
  const [s, o] = [await load('panel/ui-buttons-wood.json'), await old('ui-buttons-wood')];
  for (const p of grid(o)) for (const c of Object.keys(o.clips)) {
    const [a, b] = [renderFrame(o, c, 0, p), renderFrame(s, c, 0, p)];
    if (p.style !== 'stone') {
      let off = 0;
      for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) off++;
      assert.equal(off, 0, `${c} at ${JSON.stringify(p)}: ${off} pixels differ`);
      continue;
    }
    let worst = 0;
    for (let i = 0; i < a.data.length; i++) for (let k = 0; k < 24; k += 8) worst = Math.max(worst, Math.abs(((a.data[i] >>> k) & 255) - ((b.data[i] >>> k) & 255)));
    assert.ok(worst <= 10, `stone ${c} at ${JSON.stringify(p)}: a channel is ${worst} levels off`);
  }
});

test('a skin\'s text paint that names one of its own slots is the sprite\'s slot it is mapped to', async () => {
  const base = nodePieceReader(undefined, { check: checkSkinPiece });
  for (const [text, want] of [['shine', '#ffffff'], ['nail', '#c2c9d6'], ['face.dark', null]]) {
    const read = async (rel) => {
      const t = await base(rel);
      if (rel !== 'pieces/skin-wood.v1.json') return t;
      const j = JSON.parse(t); j.body.text = text; return JSON.stringify(j);
    };
    const st = createPieceStore({ read, check: checkSkinPiece });
    const def = read0('panel/ui-buttons-wood.json');
    const r = await st.loadFor(def);
    assert.ok(r.ok, r.errors.join('; '));
    const s = dataSprite(def, { pieces: st, strict: true });
    const a = s.textArea('normal', defaultParams(s));
    assert.ok(typeof a.text === 'string' && /^#[0-9a-f]{6}$/i.test(a.text), `text ${text}: the text area has a colour (${JSON.stringify(a.text)})`);
    if (want) assert.equal(a.text.toLowerCase(), want, text);
  }
});

test('every skin in pieces/ passes the skin hook, and a malformed one is refused by it', () => {
  assert.ok(SKINS.length >= 3, SKINS.join(', '));
  const index = buildPiecesIndex({ check: checkSkinPiece });
  assert.deepEqual(index.errors.filter((e) => /skin/.test(e)), []);
  const bad = { id: 'skin:velvet', v: 1, body: { args: { 'ui.button': { texture: 'velvet' } } } };
  assert.match(checkSkinPiece(bad).join(' '), /texture/);
});
