// engine/data-sprite.js, version 2 (build item B6; docs/data-sprites.md 1.2 item 1, 3.3 "layout", 4.1 step 4): a body is
// laid out by a LAYOUT, a named generator of family "layout" whose id is the body kind (pictures, emitters, panel,
// layers, tiles). Build items B8 and B12 to B15 register theirs from their own engine/gen/<family>.js; this file never
// changes for them. Held to here, with test layouts in a throwaway registry:
//   - a registered layout draws its body (the hit-spark emitters fixture, the ui-button panel fixture)
//   - the layout's slice and textArea reach the sprite (Contract 8) when the definition writes none; written ones win
//   - its points become sockets; the frame edits' white flash is added by data-sprite.js for every layout
//   - a registered "pictures" layout replaces the built-in one (B8 moves it to engine/gen/pictures.js)
//   - the newest version is used; an entry of another family with the same id is not a layout
//   - a body with no layout is refused, naming its build item and the file it registers from
//   - a layout that throws or gives no list makes render throw, naming the sprite, clip and frame
import test from 'node:test';
import assert from 'node:assert/strict';
import { dataSprite, makeDataSprite, dataFrameList, NOT_BUILT_BODIES } from '../../engine/data-sprite.js';
import { renderFrame, renderSheet, frameSockets, defaultParams, clipStretch } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { point, count, paints, word, px, flag, share } from '../../engine/gen/args.js';
import { loadV2, testPieces, testRegistry } from '../fixtures/resolve/helpers.mjs';

const solid = (g) => g.data.filter((v) => v >>> 24).length;
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);

/** The fixtures' runnable stand-ins plus starburst and ui.button, and the layouts asked for (name -> spec fields). */
function registry(layouts = {}) {
  const reg = testRegistry();
  reg.defineGenerator({ id: 'starburst', v: 1, family: 'fx', about: 'Test starburst: one dot per point.', args: { at: point(), points: count(3, 12), r: point({ lo: 0, hi: 64 }), paints: paints(3) },
    cost: (a) => a.points, run: (a) => Array.from({ length: a.points }, (_, i) => ({ kind: 'dot', at: [a.at[0] + i - 2, a.at[1]], paint: a.paints[0] })) });
  reg.defineGenerator({ id: 'ui.button', v: 1, family: 'ui', about: 'Test button: a filled box the size given.',
    args: { size: point({ lo: 8, hi: 320 }), style: word(['plain', 'framed', 'carved']), corner: px(0, 8), border: px(0, 6), nails: flag({ default: false }), grain: share({ default: 0 }) },
    cost: () => 2, run: (a) => [{ kind: 'rect', at: [0, 0], size: [...a.size], paint: 'face' }, { kind: 'rect', at: [0, 0], size: [a.size[0], Math.max(1, Math.round(a.border))], paint: 'frame' }] });
  for (const [id, spec] of Object.entries(layouts)) reg.defineGenerator({ id, v: 1, family: 'layout', about: `Test ${id} layout.`, args: {}, cost: () => 0, ...spec });
  return reg;
}
const opts = (layouts) => ({ pieces: testPieces(), generators: registry(layouts) });

/** A test emitters layout: every emitter whose key amount is above 0 (or that no key names), expanded and placed. */
const emittersLayout = (seen = []) => ({
  run(input, ctx) {
    seen.push({ kind: input.kind, clip: ctx.clip, frame: ctx.frame, frames: ctx.frames, size: [...ctx.size], ids: input.body.emitters.map((e) => e.id), emit: input.pose.emit ?? null });
    const on = input.body.emitters.filter((e) => { const k = input.pose.emit?.[e.id]; return !k || !(typeof k.amount === 'number') || k.amount > 0; });
    const x = input.expand(on.map((e) => { const c = { ...e }; delete c.id; return c; }));
    return { list: input.place(x.primitives), palette: x.palette, points: { hand: { x: 16, y: 16, angle: 0 } } };
  },
});

/** A test panel layout: the skin's piece drawn, a slice and text area that depend on the state (pressed sits 1 px lower). */
const panelLayout = {
  run(input, ctx) {
    const x = input.expand([input.body.piece]);
    const down = ctx.clip === 'pressed' ? 1 : 0;
    return { list: input.place(x.primitives), palette: x.palette, slice: { left: 5, top: 5 + down, right: 5, bottom: 5 - down }, textArea: { x: 6, y: 6 + down, w: 84, h: 18, colour: 'frame.dark' } };
  },
};

test('a registered layout draws its body: hit-spark through a test emitters layout', () => {
  const seen = [];
  const s = dataSprite(loadV2('hit-spark'), opts({ emitters: emittersLayout(seen) }));
  assert.deepEqual(Object.keys(s.clips), ['hit']);
  const p = defaultParams(s);
  const g0 = renderFrame(s, 'hit', 0, p), g4 = renderFrame(s, 'hit', 4, p);
  assert.ok(solid(g0) > 4, 'sparks and flash drawn');
  assert.ok(solid(g4) < solid(g0), 'the flash is keyed off by the end of the clip');
  const last = seen.at(-1);
  assert.equal(last.kind, 'emitters');
  assert.deepEqual([last.clip, last.frame, last.frames, last.size], ['hit', 4, 5, [32, 32]], 'the layout sees what a generator sees');
  assert.deepEqual(last.ids, ['sparks', 'flash'], 'the resolved body (the emitters body is the whole body)');
  assert.equal(last.emit.flash.amount, 0, 'and the pose of the frame');
  const { list } = dataFrameList(s, 'hit', 0, p);
  assert.ok(list.length > 0 && list.every((x) => typeof x.kind === 'string'));
  assert.deepEqual(frameSockets(s, 'hit', 0, p), { hand: { x: 16, y: 16, angle: 0 } }, 'the layout\'s points are the sockets');
});

test('a panel layout gives slice and textArea per clip; a definition\'s own slice and textArea win', () => {
  const def = loadV2('ui-button');
  delete def.slice; delete def.textArea;
  const s = dataSprite(def, opts({ panel: panelLayout }));
  assert.deepEqual(Object.keys(s.clips), ['normal', 'hover', 'pressed', 'disabled']);
  const p = defaultParams(s);
  assert.ok(solid(renderFrame(s, 'normal', 0, p)) > 96 * 20, 'the button drawn');
  assert.deepEqual(clipStretch(s, 'normal', p), { border: { left: 5, bottom: 5, right: 5, top: 5 } });
  assert.deepEqual(clipStretch(s, 'pressed', p), { border: { left: 5, bottom: 4, right: 5, top: 6 } }, 'per clip, from the layout');
  const a = s.textArea('pressed', p);
  assert.deepEqual([a.x, a.y, a.w, a.h], [6, 7, 84, 18]);
  assert.match(a.text, /^#[0-9a-f]{6}$/, 'the colour slot worked out to a colour');
  const sheet = renderSheet(s, p);
  const info = describeSheet(s, sheet.meta, p);
  assert.equal(info.kind, 'interface');
  assert.deepEqual(Object.keys(info.animations), ['normal', 'hover', 'pressed', 'disabled']);
  assert.ok(info.animations.pressed.textArea, 'the sheet description carries the text area');
  // the definition's own (written) slice and textArea win over the layout's
  const own = dataSprite(loadV2('ui-button'), opts({ panel: panelLayout }));
  assert.deepEqual(clipStretch(own, 'pressed', p), { border: { left: 6, bottom: 6, right: 6, top: 6 } });
  assert.deepEqual(Object.values(own.textArea('pressed', p)).slice(0, 4), [8, 8, 80, 16]);
});

test('a layout that gives no slice or textArea leaves the sprite without them', () => {
  const s = dataSprite(loadV2('hit-spark'), opts({ emitters: emittersLayout() }));
  assert.equal(s.slice, undefined);
  assert.equal(s.textArea, undefined);
});

test('the white flash of a frame edit is added for every layout', () => {
  const def = loadV2('hit-spark');
  def.clips.hit.frameEdits = { 1: { flash: true } };
  const s = dataSprite(def, opts({ emitters: emittersLayout() }));
  const p = defaultParams(s);
  assert.deepEqual(dataFrameList(s, 'hit', 1, p).list.filter((x) => x.kind === 'tint').map((x) => x.paint), ['#ffffff']);
  assert.ok(!dataFrameList(s, 'hit', 0, p).list.some((x) => x.kind === 'tint'));
});

test('a registered pictures layout replaces the built-in one (B8 moves it to engine/gen/pictures.js)', () => {
  const pictures = { run: (input) => ({ list: [{ kind: 'dot', at: [3, 4], paint: 'gold' }], palette: input.resolved.palette }) };
  const reg = registry({ pictures });
  reg.defineGenerator({ id: 'pickup.bob', v: 1, family: 'motion', about: 'Test bob.', args: { height: px(0, 8) }, cost: () => 0, run: () => [] });
  reg.defineGenerator({ id: 'pickup.spin', v: 1, family: 'motion', about: 'Test spin.', args: {}, cost: () => 0, run: () => [] });
  const s = dataSprite(loadV2('coin'), { pieces: testPieces(), generators: reg });
  const g = renderFrame(s, 'spin', 0, defaultParams(s));
  assert.equal(solid(g), 1);
  assert.ok(g.get(3, 4) >>> 24);
});

test('the newest layout version is used; an entry of another family with the body\'s id is not a layout', () => {
  const reg = registry({ emitters: { run: () => ({ list: [{ kind: 'dot', at: [1, 1], paint: 'spark' }] }) } });
  reg.defineGenerator({ id: 'emitters', v: 2, family: 'layout', about: 'Test emitters layout, version 2.', args: {}, cost: () => 0, run: () => ({ list: [{ kind: 'dot', at: [2, 2], paint: 'spark' }, { kind: 'dot', at: [3, 3], paint: 'spark' }] }) });
  const s = dataSprite(loadV2('hit-spark'), { pieces: testPieces(), generators: reg });
  assert.equal(solid(renderFrame(s, 'hit', 0, defaultParams(s))), 2);
  const other = testRegistry();
  other.defineGenerator({ id: 'starburst', v: 1, family: 'fx', about: 'Test starburst.', args: { at: point(), points: count(3, 12), r: point({ lo: 0, hi: 64 }), paints: paints(3) }, cost: () => 1, run: () => [] });
  other.defineGenerator({ id: 'emitters', v: 1, family: 'fx', about: 'Not a layout.', args: {}, cost: () => 0, run: () => [] });
  const r = makeDataSprite(loadV2('hit-spark'), { pieces: testPieces(), generators: other });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /emitters body is not built yet.*B12/);
});

test('a body with no layout is refused, naming its build item and the file that registers it', () => {
  assert.deepEqual({ ...NOT_BUILT_BODIES }, { tiles: 'B15', layers: 'B14', panel: 'B13', emitters: 'B12' });
  const r = makeDataSprite(loadV2('hit-spark'), opts({}));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /emitters body is not built yet; build item B12.*engine\/gen\/fx\.js.*family "layout".*id "emitters"/);
});

test('a layout that throws or gives no list makes render throw, naming the sprite, clip and frame', () => {
  const boom = dataSprite(loadV2('hit-spark'), opts({ emitters: { run: (input, ctx) => { if (ctx.frame === 2) throw new Error('kaboom'); return { list: [] }; } } }));
  const p = defaultParams(boom);
  assert.doesNotThrow(() => renderFrame(boom, 'hit', 0, p));
  assert.throws(() => renderFrame(boom, 'hit', 2, p), /hit-spark, clip hit frame 2: the emitters layout failed: kaboom/);
  const empty = makeDataSprite(loadV2('hit-spark'), opts({ emitters: { run: () => ({ nothing: true }) } }));
  assert.equal(empty.ok, false, 'checked when the sprite is made (its first frame of each clip is laid out once)');
  assert.match(empty.errors[0], /emitters layout gave no draw list/);
});
