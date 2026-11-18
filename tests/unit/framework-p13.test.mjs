// Framework additions of batch P13 (effects and interface of the platformer kit):
//   engine/bursts.js    SPARK_STYLES, sparkMark, sparkRing, sparkOrbit, blastBall, driftUp
//   engine/ui-wood.js   WOOD_STYLES, woodTones, woodPanel, woodButton
// and what the six sprites of the batch promise in their headers (clips, slices, flat text areas, contrast).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { steps } from '../../engine/fx.js';
import { contrast, BUTTON_STATES } from '../../engine/ui.js';
import { THEME_PRESETS, normalizeTheme, applyColour } from '../../engine/theme.js';
import { renderFrame, renderSheet, defaultParams, cleanParams } from '../../engine/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { SPARK_STYLES, sparkMark, sparkRing, sparkOrbit, blastBall, driftUp } from '../../engine/bursts.js';
import { WOOD_STYLES, woodTones, woodPanel, woodButton } from '../../engine/ui-wood.js';
import sparkle from '../../sprites/pickup-sparkle.js';
import poof from '../../sprites/enemy-poof.js';
import boom from '../../sprites/explosion-small.js';
import hud from '../../sprites/ui-hud-platformer.js';
import buttons from '../../sprites/ui-buttons-wood.js';
import panels from '../../sprites/ui-panel-wood.js';

const P = PALETTE.thornwood;
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const hexOf = (v) => '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('');
const draw = (s, clip, over = {}, f = 0) => renderFrame(s, clip, f, cleanParams(s, { ...defaultParams(s), ...over }));
const C = steps(P.gold, { core: P.cream, white: false });
const LOOKS = [['as made', null], ...THEME_PRESETS.map((t) => [t.name, normalizeTheme(t.theme).colour])];
const under = (g, colour) => { if (colour) applyColour(g.data, colour); return g; };
const borderEmpty = (g) => { for (let i = 0; i < g.w; i++) if (g.get(i, 0) || g.get(i, g.h - 1)) return false; for (let j = 0; j < g.h; j++) if (g.get(0, j) || g.get(g.w - 1, j)) return false; return true; };

// ---- engine/bursts.js ------------------------------------------------------------------------

test('P13 sparkMark: three styles, sizes that grow, a bright middle, nothing outside the box', () => {
  assert.deepEqual([...SPARK_STYLES], ['plus', 'diamond', 'dot']);
  const mark = (style, reach, opt) => { const g = new Surface(15, 15); sparkMark(g, 7.5, 7.5, reach, style, C, opt); return g; };
  for (const style of SPARK_STYLES) {
    assert.equal(lit(mark(style, 0)), 1, `${style}: reach 0 is one pixel`);
    let last = 1;
    for (let r = 1; r <= 4; r++) { const n = lit(mark(style, r)); assert.ok(n > last, `${style}: reach ${r} is bigger than reach ${r - 1}`); last = n; }
    assert.ok(count(mark(style, 2), P.cream) >= 1, `${style}: the middle is the core colour`);
    assert.ok(count(mark(style, 2, { core: '#ffffff' }), '#ffffff') >= 1, `${style}: a core colour can be given`);
  }
  const plus = mark('plus', 2).bounds(), diamond = mark('diamond', 2), dot = mark('dot', 2).bounds();
  assert.deepEqual(plus, { x0: 5, y0: 5, x1: 9, y1: 9 }, 'a plus is 2 * reach + 1 across');
  assert.equal(lit(diamond), 13, 'a diamond of reach 2 is a filled lozenge of 13 pixels');
  assert.equal(dot.x1 - dot.x0 + 1, 3, 'a dot is reach + 1 across');
  assert.ok(diff(mark('plus', 3), mark('diamond', 3)) > 4 && diff(mark('plus', 3), mark('dot', 3)) > 4, 'the styles differ');
  const boxed = new Surface(15, 15); sparkMark(boxed, 7.5, 7.5, 4, 'diamond', C, { box: [6, 6, 9, 9] });
  assert.deepEqual(boxed.bounds(), { x0: 6, y0: 6, x1: 8, y1: 8 }, 'it stays inside the box');
  assert.throws(() => sparkMark(new Surface(8, 8), 4, 4, 1, 'star', C), /not one of/);
});

test('P13 sparkRing: spreads, drifts up, never leaves the frame, and ends as one pixel per mark', () => {
  const ring = (t, o = {}) => { const g = new Surface(32, 32); sparkRing(g, { t, x: 15.5, y: 15.5, count: 6, r0: 4, r1: 11, style: 'plus', reach: 2, colours: C, ...o }); return g; };
  const span = (g) => { const b = g.bounds(); return b.x1 - b.x0 + 1; };
  assert.ok(span(ring(0.6)) > span(ring(0)), 'the ring grows');
  assert.equal(lit(ring(0)), 6, 'at t = 0 every mark is one pixel (the flash in the middle belongs to the caller)');
  assert.equal(lit(ring(1)), 6, 'the last frame keeps one pixel per mark');
  assert.equal(count(ring(1), C.at(-1)), 6, '... in the rim colour');
  assert.ok(lit(ring(0.3)) > 30, 'in between the marks are full twinkles');
  assert.ok(ring(0.6, { rise: 6 }).bounds().y0 < ring(0.6).bounds().y0, 'rise lifts the whole ring');
  for (const style of SPARK_STYLES) for (const reach of [1, 2, 3, 4]) for (let f = 0; f < 8; f++) {
    const g = ring(f / 7, { style, reach, count: 8, r1: 40, rise: 20 });
    assert.ok(borderEmpty(g), `${style} reach ${reach} frame ${f}: nothing on the outermost row or column`);
    assert.ok(lit(g) >= 2, `${style} reach ${reach} frame ${f}: never empty, however far it is asked to go`);
  }
  assert.deepEqual(ring(0.4).data, ring(0.4).data, 'the same input gives the same pixels');
});

test('P13 sparkOrbit: a loop that closes, about half of the marks in view, each flaring and going out', () => {
  const orbit = (t, o = {}) => { const g = new Surface(32, 32); sparkOrbit(g, { t, x: 15.5, y: 16.5, count: 6, r: 9, rise: 3, style: 'plus', reach: 2, colours: C, ...o }); return g; };
  assert.deepEqual(orbit(0).data, orbit(1).data, 't = 0 and t = 1 are the same picture');
  for (const n of [4, 5, 6, 7, 8]) for (let f = 0; f < 8; f++) {
    const g = orbit(f / 8, { count: n });
    assert.ok(lit(g) >= 2, `${n} marks, frame ${f}: never empty`);
    assert.ok(borderEmpty(g), `${n} marks, frame ${f}: inside the frame`);
  }
  for (let f = 0; f < 8; f++) assert.ok(diff(orbit(f / 8), orbit((f + 1) / 8)) > 0, `the picture changes from frame ${f} to the next`);
  assert.ok(lit(orbit(0.3, { share: 1 })) > lit(orbit(0.3, { share: 0.25 })), 'share sets how many are in view');
  assert.ok(diff(orbit(0.3, { style: 'plus' }), orbit(0.3, { style: 'dot' })) > 4, 'the style shows');
});

test('P13 blastBall: nested tones with the rim outside, scallops or spikes, a hole that makes a ring', () => {
  const colours = ['#ffffff', '#ffcc00', '#ff6600', '#aa2200'];
  const ball = (o = {}) => { const g = new Surface(48, 48); const n = blastBall(g, { x: 24, y: 24, r: 12, colours, ...o }); return { g, n }; };
  const plain = ball({ bump: 0 });
  assert.equal(plain.g.get(24, 24), col('#ffffff'), 'the hottest colour is in the middle');
  assert.equal(plain.g.get(24, 12), col('#ff6600'), 'the coolest body colour lines the edge');
  assert.equal(plain.g.get(24, 11), col('#aa2200'), 'the rim is one pixel outside it');
  assert.equal(plain.g.get(24, 10), 0);
  assert.ok(count(plain.g, '#ffcc00') > 20, 'the middle tone has its own band');
  assert.equal(plain.n, lit(plain.g) - count(plain.g, '#aa2200'), 'it returns the pixels of the body');
  const bumpy = ball({ bumps: 7, bump: 0.2 }), star = ball({ bumps: 8, bump: 0.45, points: true });
  assert.ok(bumpy.n < plain.n && star.n < bumpy.n, 'scallops and spikes cut into the disc');
  assert.ok(diff(ball({ bumps: 7, bump: 0.2, turn: 0 }).g, ball({ bumps: 7, bump: 0.2, turn: 0.4 }).g) > 10, 'turn moves the edge');
  const ring = ball({ hole: 7 });
  assert.equal(ring.g.get(24, 24), 0, 'a hole empties the middle');
  assert.equal(ring.g.get(24, 17), col('#aa2200'), '... and has a rim of its own');
  assert.equal(ring.g.get(24, 16), col('#ff6600'), '... lined with the coolest body colour');
  assert.ok(ball({ hole: 9, gaps: 0.5 }).n < ball({ hole: 9 }).n, 'gaps break a ring up');
  assert.ok(ball({ heat: 1 }).g.data.filter((v) => v === col('#ffffff')).length > ball({ heat: 0 }).g.data.filter((v) => v === col('#ffffff')).length, 'heat widens the hot middle');
  const big = new Surface(48, 48); blastBall(big, { x: 24, y: 24, r: 40, colours });
  assert.ok(borderEmpty(big), 'it never touches the outermost row or column');
  assert.equal(blastBall(new Surface(8, 8), { x: 4, y: 4, r: 0, colours }), 0);
});

test('P13 driftUp: things set off one after another, climb and never come down', () => {
  const at = (t, o = {}) => driftUp({ t, x: 24, y: 30, count: 3, rise: 12, spread: 6, from: 0.5, ...o });
  assert.equal(at(0.2).length, 0, 'nothing before `from`');
  assert.equal(at(0.5).length, 1, 'the first sets off at `from`');
  assert.equal(at(1).length, 3, 'all are out by the end');
  for (const s of at(1)) { assert.equal(s.life, 1); assert.ok(s.y <= 30 - 12 * 0.65 + 1e-9 && s.y >= 30 - 12 - 1e-9, 'each climbs 65% to 100% of the rise'); }
  const xs = at(1, { sway: 0 }).map((s) => s.x);
  assert.deepEqual(xs, [18, 24, 30], 'they start spread to either side');
  let last = 30; for (let i = 0; i <= 10; i++) { const s = at(0.5 + i * 0.05).find((q) => q.i === 1); assert.ok(s.y <= last + 1e-9, 'it only goes up'); last = s.y; }
  assert.deepEqual(at(0.8), at(0.8), 'repeatable');
  assert.equal(driftUp({ t: 0.5, x: 5, y: 0, count: 1, spread: 9, sway: 0 })[0].x, 5, 'one thing starts in the middle');
});

// ---- engine/ui-wood.js -----------------------------------------------------------------------

const FACES = buttons.params.face.swatches, FRAMES = buttons.params.frame.swatches;
const board = (opt = {}, w = 96, h = 64) => { const g = new Surface(w, h); const r = woodPanel(g, 1, 1, w - 2, h - 2, { face: P.wood, frame: P.soil, ...opt }); return { g, r }; };
const flatBox = (g, box, colour, label) => { for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) assert.equal(g.get(x, y), colour, `${label}: flat at ${x},${y}`); };

test('P13 woodTones: a stain darker than the face, marks either side of it, grey when disabled', () => {
  assert.deepEqual([...WOOD_STYLES], ['plank', 'carved', 'stone']);
  const T = woodTones(P.wood, P.soil);
  const bright = (hex) => { const v = col(hex); return (v & 255) * 0.299 + ((v >>> 8) & 255) * 0.587 + ((v >>> 16) & 255) * 0.114; };
  assert.ok(bright(T.text) < bright(P.wood), 'the stain is darker than the face colour');
  assert.ok(bright(T.grain) < bright(T.text) && bright(T.light) > bright(T.text), 'grain is darker, light marks lighter');
  assert.ok(bright(T.band) < bright(T.text), 'the frame band is darker than the board: a plank in a darker frame');
  assert.ok(bright(woodTones(P.wood, P.soil, { state: 'hover' }).text) > bright(T.text), 'hover is a lighter stain');
  assert.ok(bright(woodTones(P.wood, P.soil, { state: 'hover' }).edge) > bright(T.edge), '... and a brighter edge');
  const grey = woodTones(P.wood, P.soil, { state: 'disabled' });
  for (const c of [grey.text, grey.grain, grey.light, grey.edge, grey.band, grey.lip, grey.nail.base]) { const v = col(c); assert.ok((v & 255) === ((v >>> 8) & 255) && (v & 255) === ((v >>> 16) & 255), `disabled ${c} has no colour`); }
  assert.notEqual(woodTones(P.wood, P.soil, { style: 'stone' }).text, T.text, 'stone greys the stain');
});

test('P13 woodPanel: the bevel from the outside in, a flat middle 7 px in, and marks only between the two', () => {
  for (const style of WOOD_STYLES) for (const borderPx of [1, 2, 3]) for (const cornerPx of [0, 2, 4]) for (const texture of [0, 0.5, 1]) for (const nails of [false, true]) {
    const label = `${style} border ${borderPx} corner ${cornerPx} texture ${texture} nails ${nails}`;
    const { g, r } = board({ style, borderPx, cornerPx, texture, nails });
    const T = r.tones, b = borderPx;
    assert.deepEqual(g.bounds(), { x0: 1, y0: 1, x1: 94, y1: 62 }, `${label}: fills exactly the rectangle`);
    // down the middle column from the top: ink, the carved edge, the band, ink, then the board
    assert.equal(g.get(48, 1), col(INK), `${label}: ink outside`);
    assert.equal(g.get(48, 2), col(T.edge), `${label}: the carved edge`);
    for (let i = 1; i < b; i++) assert.equal(g.get(48, 2 + i), col(T.band), `${label}: the band`);
    assert.equal(g.get(48, 2 + b), col(INK), `${label}: ink inside`);
    assert.deepEqual(r.inner, { x: 8, y: 8, w: 80, h: 48 }, `${label}: the flat middle is 7 px in from the rectangle`);
    assert.deepEqual(r.slice, { left: 7, top: 7, right: 7, bottom: 7 }, `${label}: slice`);
    flatBox(g, r.inner, col(T.text), label);
  }
  assert.throws(() => woodPanel(new Surface(32, 32), 1, 1, 30, 30, { face: P.wood }), /face and a frame/);
  assert.throws(() => woodPanel(new Surface(32, 32), 1, 1, 30, 30, { face: P.wood, frame: P.soil, style: 'tin' }), /not one of/);
});

test('P13 woodPanel: texture, nails, style and the strip each show', () => {
  const plain = board({ texture: 0, nails: false }).g;
  assert.ok(diff(plain, board({ texture: 1, nails: false }).g) >= 40, 'grain');
  assert.ok(diff(board({ texture: 0.5, nails: false }).g, board({ texture: 1, nails: false }).g) >= 12, 'more grain at the far end');
  assert.equal(diff(plain, board({ texture: 0, nails: true }).g), 36, 'four nails of 3x3');
  for (const a of WOOD_STYLES) for (const b of WOOD_STYLES) if (a < b) assert.ok(diff(board({ style: a }).g, board({ style: b }).g) >= 20, `${a} against ${b}`);
  assert.equal(board({ style: 'carved', cornerPx: 0 }).g.get(1, 1), 0, 'carved cuts even a square corner');
  assert.notEqual(board({ style: 'plank', cornerPx: 0 }).g.get(1, 1), 0);
  const { g, r } = board({ strip: P.cream, borderPx: 2 });
  assert.deepEqual(r.title, { x: 8, y: 5, w: 80, h: 11 }, 'the strip is 11 rows tall');
  flatBox(g, r.title, col(P.cream), 'strip');
  assert.equal(g.get(48, 16), col(INK), 'a line under the strip');
  assert.equal(r.inner.y, 17, 'the flat middle starts under that line');
  assert.equal(r.slice.top, 16);
  flatBox(g, r.inner, col(r.tones.text), 'under the strip');
});

test('P13 woodButton: four states, a 2 px travel, a lip that the pressed button sits on, a text area over the middle 78x18', () => {
  const btn = (state, opt = {}) => { const g = new Surface(96, 32); const r = woodButton(g, 1, 1, 94, 30, state, { face: P.wood, frame: P.soil, ...opt }); return { g, r }; };
  for (const style of WOOD_STYLES) for (const borderPx of [1, 2, 3]) for (const cornerPx of [0, 2, 4]) for (const texture of [0, 1]) for (const nails of [false, true]) {
    const o = { style, borderPx, cornerPx, texture, nails }, label = JSON.stringify(o);
    const n = btn('normal', o), p = btn('pressed', o), h = btn('hover', o), d = btn('disabled', o);
    assert.deepEqual(n.g.bounds(), { x0: 1, y0: 1, x1: 94, y1: 30 }, `${label}: normal fills the rectangle`);
    assert.equal(p.g.bounds().y0, 3, `${label}: pressed is 2 px lower`);
    assert.equal(p.g.bounds().y1, 30, `${label}: its bottom edge stays put`);
    assert.equal(p.r.text.y - n.r.text.y, 2, `${label}: the text area travels 2 px`);
    for (const [name, s] of [['normal', n], ['hover', h], ['pressed', p], ['disabled', d]]) {
      const t = s.r.text, dy = name === 'pressed' ? 2 : 0;
      assert.ok(t.x <= 9 && t.x + t.w >= 87 && t.y <= 7 + dy && t.y + t.h >= 25 + dy, `${label} ${name}: the text area covers the middle 78x18`);
      flatBox(s.g, t, col(s.r.tones.text), `${label} ${name}`);
    }
    assert.equal(count(n.g, n.r.tones.lip) > 90, true, `${label}: the lip shows under the body`);
    assert.equal(n.g.get(48, 29), col(n.r.tones.lip), `${label}: the lip is 2 px of colour`);
    assert.equal(n.g.get(48, 28), col(n.r.tones.lip));
    assert.equal(n.g.get(48, 30), col(INK));
    assert.notEqual(h.r.tones.text, n.r.tones.text, `${label}: hover is lighter`);
    assert.ok(diff(n.g, d.g) > 500, `${label}: disabled loses its colour`);
  }
  assert.throws(() => woodButton(new Surface(96, 32), 1, 1, 94, 30, 'held', { face: P.wood, frame: P.soil }), /not one of/);
});

// ---- the six sprites ---------------------------------------------------------------------------

test('P13 sprites: meta passes, and frames, pivots and clips are the specification\'s', () => {
  const clipList = (s) => Object.entries(s.clips).map(([n, c]) => `${n} ${c.frames}${c.frames > 1 ? (c.loop ? ' loop' : '') : ''}`);
  for (const s of [sparkle, poof, boom, hud, buttons, panels]) assert.deepEqual(validateMeta(s.meta, 'sprite'), { ok: true, errors: [] }, s.id);
  assert.deepEqual([sparkle.size, sparkle.pivot, clipList(sparkle)], [[32, 32], [16, 16], ['burst 8', 'loop 8 loop']]);
  assert.deepEqual([poof.size, poof.pivot, clipList(poof)], [[48, 48], [24, 24], ['burst 8']]);
  assert.deepEqual([boom.size, boom.pivot, clipList(boom)], [[48, 48], [24, 24], ['burst 8']]);
  assert.deepEqual([hud.size, hud.pivot, clipList(hud)], [[16, 16], [8, 8], ['heart-full 1', 'heart-half 1', 'heart-empty 1', 'coin 1', 'key 1', 'key-empty 1', 'star 1', 'star-empty 1', 'gem 1', 'heart-lose 4', 'heart-gain 4']]);
  assert.deepEqual([buttons.size, buttons.pivot, clipList(buttons)], [[96, 32], [48, 16], ['normal 1', 'hover 1', 'pressed 1', 'disabled 1']]);
  assert.deepEqual([panels.size, panels.pivot, clipList(panels)], [[96, 64], [48, 32], ['panel 1', 'panel-title 1', 'panel-scroll 1']]);
  assert.deepEqual(Object.keys(sparkle.params), ['size', 'pieces', 'spread', 'style', 'rise', 'core', 'edge', 'speed']);
  assert.deepEqual(Object.keys(poof.params), ['size', 'pieces', 'spread', 'style', 'core', 'edge', 'speed']);
  assert.deepEqual(Object.keys(boom.params), ['size', 'pieces', 'spread', 'style', 'smoke', 'core', 'edge', 'speed']);
  assert.deepEqual(Object.keys(hud.params), ['shape', 'shine', 'shadow', 'body', 'accent', 'metal', 'speed']);
  assert.deepEqual(Object.keys(buttons.params), ['style', 'corner', 'border', 'nails', 'texture', 'face', 'frame']);
  assert.deepEqual(Object.keys(panels.params), ['corner', 'border', 'nails', 'texture', 'face', 'frame', 'accent']);
  assert.deepEqual(buttons.sounds, { pressed: [{ sound: 'ui-click', preset: 'Soft tap', frame: 0, volume: 0.6 }] });
});

test('P13 effects: pure white is on frame 0 only, and no frame of any look is empty', () => {
  for (const [s, clip] of [[sparkle, 'burst'], [poof, 'burst'], [boom, 'burst']]) {
    for (const style of s.params.style.options.map((o) => o.value)) {
      assert.ok(count(draw(s, clip, { style }, 0), '#ffffff') > 0, `${s.id} ${style}: frame 0 has a white core`);
      for (let f = 1; f < 8; f++) assert.equal(count(draw(s, clip, { style }, f), '#ffffff'), 0, `${s.id} ${style}: no pure white on frame ${f}`);
      for (const low of [true, false]) for (let f = 0; f < 8; f++) {
        const o = { style, size: low ? 0 : 1, pieces: low ? s.params.pieces.min : s.params.pieces.max, spread: low ? 0 : 1, smoke: !low, rise: low ? 0 : 1 };
        assert.ok(lit(draw(s, clip, o, f)) >= 2, `${s.id} ${style} ${low ? 'low' : 'high'} frame ${f}: at least two pixels`);
      }
    }
  }
  for (let f = 0; f < 8; f++) assert.ok(lit(draw(sparkle, 'loop', { pieces: 4, size: 0, spread: 0, rise: 0 }, f)) >= 2, `shimmer frame ${f}`);
});

test('P13 HUD: full, half and empty share one outline; the two heart clips end on the resting glyphs', () => {
  const outline = (g) => g.data.map((v) => (v ? 1 : 0)).join('');
  for (const shape of hud.params.shape.options.map((o) => o.value)) for (const shadow of [false, true]) for (const shine of [false, true]) {
    const o = { shape, shadow, shine }, label = JSON.stringify(o);
    assert.equal(outline(draw(hud, 'heart-full', o)), outline(draw(hud, 'heart-empty', o)), `${label}: heart full and empty`);
    assert.equal(outline(draw(hud, 'heart-full', o)), outline(draw(hud, 'heart-half', o)), `${label}: heart full and half`);
    assert.equal(outline(draw(hud, 'key', o)), outline(draw(hud, 'key-empty', o)), `${label}: key`);
    assert.equal(outline(draw(hud, 'star', o)), outline(draw(hud, 'star-empty', o)), `${label}: star`);
    assert.deepEqual(draw(hud, 'heart-lose', o, 3).data, draw(hud, 'heart-empty', o).data, `${label}: heart-lose ends on the empty heart`);
    assert.deepEqual(draw(hud, 'heart-gain', o, 3).data, draw(hud, 'heart-full', o).data, `${label}: heart-gain ends on the full heart`);
    assert.deepEqual(draw(hud, 'heart-gain', o, 0).data, draw(hud, 'heart-empty', o).data, `${label}: heart-gain starts on the empty heart`);
    for (const clip of Object.keys(hud.clips)) for (let f = 0; f < hud.clips[clip].frames; f++) {
      const g = draw(hud, clip, o, f), b = g.bounds();
      assert.ok(borderEmpty(g), `${label} ${clip} ${f}: a 1 px empty border`);
      assert.ok(b.x1 - b.x0 + 1 <= 14 && b.y1 - b.y0 + 1 <= 14, `${label} ${clip} ${f}: at most 14x14`);
    }
  }
  assert.ok(diff(draw(hud, 'heart-full'), draw(hud, 'heart-empty')) > 40, 'full and empty differ in most of their pixels');
});

test('P13 buttons and panels: the export carries the borders, and everything between them is flat', () => {
  const sheetOf = (s, o) => renderSheet(s, cleanParams(s, { ...defaultParams(s), ...o }), { scale: 1 }).meta.animations;
  for (const style of WOOD_STYLES) for (const border of [0, 0.5, 1]) for (const corner of [0, 1]) for (const texture of [0, 1]) for (const nails of [false, true]) {
    const o = { style, border, corner, texture, nails }, anims = sheetOf(buttons, o);
    for (const clip of BUTTON_STATES) {
      const b = anims[clip].border, g = draw(buttons, clip, o);
      assert.deepEqual(b, clip === 'pressed' ? { left: 8, bottom: 5, right: 8, top: 9 } : { left: 8, bottom: 7, right: 8, top: 7 }, `${clip}: border`);
      flatBox(g, { x: b.left, y: b.top, w: 96 - b.left - b.right, h: 32 - b.top - b.bottom }, g.get(48, 16), `button ${JSON.stringify(o)} ${clip}`);
      assert.ok(32 - b.top - b.bottom >= 18 && 96 - b.left - b.right >= 78, 'the flat middle holds 78x18');
    }
  }
  for (const border of [0, 0.5, 1]) for (const corner of [0, 1]) for (const texture of [0, 1]) for (const nails of [false, true]) {
    const o = { border, corner, texture, nails }, anims = sheetOf(panels, o);
    for (const clip of Object.keys(panels.clips)) {
      const b = anims[clip].border, g = draw(panels, clip, o);
      assert.ok(b.left <= 8 && b.right <= 8 && b.bottom <= 8, `${clip}: an 8 px border left, right and below`);
      if (clip !== 'panel-title') assert.ok(b.top <= 8, `${clip}: 8 px on top`); else assert.ok(b.top >= 16 && b.top <= 18, 'the titled panel keeps its strip in the top border');
      flatBox(g, { x: b.left, y: b.top, w: 96 - b.left - b.right, h: 64 - b.top - b.bottom }, g.get(48, 40), `panel ${JSON.stringify(o)} ${clip}`);
    }
  }
});

test('P13 wood contrast: white text keeps 4.5 to 1 on every face in every state, the carved edge 3 to 1 against it, dark text 4.5 to 1 on strip and parchment; under every whole-bundle look', () => {
  for (const style of WOOD_STYLES) for (const face of FACES) for (const [name, colour] of LOOKS) {
    for (const clip of ['normal', 'hover', 'pressed']) {
      const g = under(draw(buttons, clip, { style, face }), colour), text = hexOf(g.get(48, 16));
      assert.ok(contrast('#ffffff', text) >= 4.5, `${style} ${clip}, face ${face}, ${name}: white text ${contrast('#ffffff', text).toFixed(2)}`);
    }
    for (const frame of FRAMES) {
      const g = under(draw(buttons, 'normal', { style, face, frame, corner: 0 }), colour), text = hexOf(g.get(48, 16)), edge = hexOf(g.get(48, 2));
      assert.ok(contrast(edge, text) >= 3, `${style}, frame ${frame} on face ${face}, ${name}: carved edge ${contrast(edge, text).toFixed(2)}`);
    }
  }
  for (const face of panels.params.face.swatches) for (const frame of panels.params.frame.swatches) for (const [name, colour] of LOOKS) {
    const g = under(draw(panels, 'panel', { face, frame, corner: 0 }), colour), text = hexOf(g.get(48, 32)), edge = hexOf(g.get(48, 2));
    assert.ok(contrast('#ffffff', text) >= 4.5, `panel face ${face}, ${name}: white text ${contrast('#ffffff', text).toFixed(2)}`);
    assert.ok(contrast(edge, text) >= 3, `panel frame ${frame} on face ${face}, ${name}: carved edge ${contrast(edge, text).toFixed(2)}`);
  }
  for (const accent of panels.params.accent.swatches) for (const [name, colour] of LOOKS) {
    const strip = under(draw(panels, 'panel-title', { accent }), colour), sheet = under(draw(panels, 'panel-scroll', { accent }), colour);
    const ink = hexOf(strip.get(1, 8));                       // the outline colour as this look draws it
    for (const [what, c] of [['strip', hexOf(strip.get(48, 10))], ['parchment', hexOf(sheet.get(48, 32))]]) assert.ok(contrast(ink, c) >= 4.5, `${what} ${accent}, ${name}: dark text ${contrast(ink, c).toFixed(2)}`);
  }
});
