// The interface helper (engine/ui.js): nine-slice panels, button states, bars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { INK, col, brightness, rgbToHsl, tone } from '../../engine/color.js';
import {
  SLICE, EDGE, SHADOW, LIP, BUTTON_STATES, PANEL_STYLES,
  cornerPx, borderPx, roundRectIn, slice9, panel9, button, buttonClips,
  barOpening, barHousing, barFill, desaturate, triangle, highlight, contrast,
  DIGIT_SIZES, digitSize, digitBody, rimmed,
} from '../../engine/ui.js';

const FACE = '#2b3a67', FRAME = '#f0ead8', GOLD = '#f2c230', HEAL = '#7fe0a0';
const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const block = (g, x, y, w, h) => { const out = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push(g.get(x + i, y + j)); return out; };
const rgb = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
const hexOf = (v) => '#' + rgb(v).map((c) => c.toString(16).padStart(2, '0')).join('');
const colours = (g) => new Set([...g.data].filter(Boolean));

// a panel in a frame the way a sprite draws it: 1 px empty border all round
function panelIn(W, H, opt = {}) {
  const g = new Surface(W, H);
  const out = panel9(g, 1, 1, W - 2, H - 2, { face: FACE, frame: FRAME, accent: GOLD, ...opt });
  return { g, out };
}

const LOOKS = [];
for (const style of ['plain', 'ornate', 'scroll']) for (const corner of [0, 0.5, 1]) for (const border of [0, 0.5, 1]) for (const shadow of [false, true]) LOOKS.push({ style, corner, border, shadow });
const name = (o) => JSON.stringify(o);

test('the constants a game and a sprite rely on', () => {
  assert.equal(SLICE, 8);
  assert.ok(1 + SHADOW + EDGE <= SLICE, 'empty border + drop shadow + panel edge fit in the nine-slice border');
  assert.deepEqual(BUTTON_STATES, ['normal', 'hover', 'pressed', 'disabled']);
  assert.deepEqual(PANEL_STYLES, ['plain', 'ornate', 'scroll']);
  assert.equal(cornerPx(0), 0);
  assert.ok(cornerPx(1) >= 3 && cornerPx(1) <= 4);
  assert.equal(borderPx(0), 1);
  assert.equal(borderPx(1), 3);
  assert.ok(cornerPx(0.5) > 0 && borderPx(0.5) === 2);
});

test('roundRectIn cuts the same pixels off all four corners and none when square', () => {
  const sq = new Surface(20, 12).fill(0, 0, 20, 12, roundRectIn(2, 1, 16, 10, 0), '#ffffff');
  assert.equal(count(sq), 160);
  for (const k of [1, 2, 3, 4]) {
    const g = new Surface(20, 12).fill(0, 0, 20, 12, roundRectIn(2, 1, 16, 10, k), '#ffffff');
    assert.ok(count(g) < 160, `k=${k} cuts something`);
    assert.ok(!g.get(2, 1) && !g.get(17, 1) && !g.get(2, 10) && !g.get(17, 10), `k=${k} corners are cut`);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) {
      assert.equal(!!g.get(x, y), !!g.get(19 - x, y), `k=${k} mirrored left-right at ${x},${y}`);
      assert.equal(!!g.get(x, y), !!g.get(x, 11 - y), `k=${k} mirrored top-bottom at ${x},${y}`);
    }
    assert.deepEqual(g.bounds(), { x0: 2, y0: 1, x1: 17, y1: 10 }, `k=${k} still reaches every side`);
  }
});

test('a panel drawn at two sizes has identical corners', () => {
  for (const look of LOOKS) {
    const a = panelIn(96, 48, look).g, b = panelIn(64, 96, look).g, c = panelIn(40, 28, look).g;
    for (const [other, W, H] of [[b, 64, 96], [c, 40, 28]]) {
      assert.deepEqual(block(a, 0, 0, SLICE, SLICE), block(other, 0, 0, SLICE, SLICE), `top left ${name(look)}`);
      assert.deepEqual(block(a, 96 - SLICE, 0, SLICE, SLICE), block(other, W - SLICE, 0, SLICE, SLICE), `top right ${name(look)}`);
      assert.deepEqual(block(a, 0, 48 - SLICE, SLICE, SLICE), block(other, 0, H - SLICE, SLICE, SLICE), `bottom left ${name(look)}`);
      assert.deepEqual(block(a, 96 - SLICE, 48 - SLICE, SLICE, SLICE), block(other, W - SLICE, H - SLICE, SLICE, SLICE), `bottom right ${name(look)}`);
    }
  }
});

test('a panel can be stretched: edges repeat along their length and the middle is one flat colour', () => {
  for (const look of LOOKS) {
    const W = 96, H = 48, { g } = panelIn(W, H, look);
    for (let y = 0; y < SLICE; y++) for (let x = SLICE; x < W - SLICE; x++) {
      assert.equal(g.get(x, y), g.get(SLICE, y), `top edge row ${y} at x=${x} ${name(look)}`);
      assert.equal(g.get(x, H - 1 - y), g.get(SLICE, H - 1 - y), `bottom edge row ${H - 1 - y} at x=${x} ${name(look)}`);
    }
    for (let x = 0; x < SLICE; x++) for (let y = SLICE; y < H - SLICE; y++) {
      assert.equal(g.get(x, y), g.get(x, SLICE), `left edge column ${x} at y=${y} ${name(look)}`);
      assert.equal(g.get(W - 1 - x, y), g.get(W - 1 - x, SLICE), `right edge column ${W - 1 - x} at y=${y} ${name(look)}`);
    }
    const mid = new Set(block(g, SLICE, SLICE, W - 2 * SLICE, H - 2 * SLICE));
    assert.equal(mid.size, 1, `middle is flat ${name(look)}`);
    assert.equal([...mid][0], col(FACE), `middle is the face colour ${name(look)}`);
  }
});

test('panel9 says where its clear middle and its corners are', () => {
  for (const look of LOOKS) {
    const W = 96, H = 48, { g, out } = panelIn(W, H, look);
    const { inner, slice } = out;
    assert.ok(inner.w >= W - 2 * SLICE && inner.h >= H - 2 * SLICE, `inner is at least the stretchable middle ${name(look)}`);
    assert.equal(new Set(block(g, inner.x, inner.y, inner.w, inner.h)).size, 1, `inner is flat ${name(look)}`);
    // slice is measured from the rectangle panel9 was given; with the 1 px border that is 8 from the frame edge
    for (const side of ['left', 'top', 'right', 'bottom']) assert.ok(slice[side] >= 1 && slice[side] + 1 <= SLICE, `${side} ${slice[side]} ${name(look)}`);
  }
  assert.deepEqual(slice9(), { left: SLICE, top: SLICE, right: SLICE, bottom: SLICE });
});

test('a panel stays inside the rectangle it was given, reaches all four sides, and is inked', () => {
  for (const look of LOOKS) {
    const g = new Surface(80, 60);
    panel9(g, 7, 5, 60, 40, { face: FACE, frame: FRAME, accent: GOLD, ...look });
    assert.deepEqual(g.bounds(), { x0: 7, y0: 5, x1: 66, y1: 44 }, name(look));
    // every drawn pixel on the silhouette's edge is ink
    for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) {
      if (!g.get(x, y)) continue;
      if (!g.get(x - 1, y) || !g.get(x + 1, y) || !g.get(x, y - 1) || !g.get(x, y + 1)) assert.equal(g.get(x, y), col(INK), `edge pixel ${x},${y} ${name(look)}`);
    }
    assert.ok(colours(g).size <= 10, `${colours(g).size} colours ${name(look)}`);
  }
});

test('the drop shadow falls down and to the left (light from the top right) and is 2 px', () => {
  const plain = new Surface(60, 40), shaded = new Surface(60, 40);
  const a = panel9(plain, 1, 1, 58, 38, { face: FACE, frame: FRAME });
  const b = panel9(shaded, 1, 1, 58, 38, { face: FACE, frame: FRAME, shadow: true });
  assert.deepEqual(a.body, { x: 1, y: 1, w: 58, h: 38 });
  assert.deepEqual(b.body, { x: 1 + SHADOW, y: 1, w: 58 - SHADOW, h: 38 - SHADOW });
  for (let y = 20; y < 30; y++) for (let x = 1; x < 1 + SHADOW; x++) assert.equal(shaded.get(x, y), col(INK), `left shadow ${x},${y}`);
  for (let x = 20; x < 30; x++) for (let y = 39 - SHADOW; y < 39; y++) assert.equal(shaded.get(x, y), col(INK), `bottom shadow ${x},${y}`);
  assert.equal(shaded.get(58, 38), 0, 'nothing under the right end');
});

test('corner, border and style each change the panel; every style differs from every other', () => {
  const at = (o) => panelIn(96, 48, o).g;
  for (const style of PANEL_STYLES) {
    assert.ok(diff(at({ style, corner: 0 }), at({ style, corner: 1 })) > 0, `corner in ${style}`);
    assert.ok(diff(at({ style, border: 0 }), at({ style, border: 1 })) > 8, `border in ${style}`);
    assert.ok(diff(at({ style, accent: GOLD }), at({ style, accent: '#c9423a' })) > 0 || style === 'plain', `accent in ${style}`);
  }
  assert.ok(diff(at({ corner: 0 }), at({ corner: 1 })) > 8, 'corner in plain');
  for (let i = 0; i < PANEL_STYLES.length; i++) for (let j = i + 1; j < PANEL_STYLES.length; j++) {
    assert.ok(diff(at({ style: PANEL_STYLES[i] }), at({ style: PANEL_STYLES[j] })) > 8, `${PANEL_STYLES[i]} against ${PANEL_STYLES[j]}`);
  }
  assert.throws(() => panel9(new Surface(40, 40), 1, 1, 38, 38, { face: FACE, frame: FRAME, style: 'wobbly' }), /style/);
});

test('the bevel is lit from the top right: the frame is lighter along the top than along the bottom', () => {
  const { g } = panelIn(96, 48, { border: 1, corner: 0 });
  const top = hexOf(g.get(40, 2)), bottom = hexOf(g.get(40, 45)), right = hexOf(g.get(93, 24)), left = hexOf(g.get(2, 24));
  assert.ok(brightness(top) > brightness(bottom), `top ${top} bottom ${bottom}`);
  assert.ok(brightness(right) > brightness(left), `right ${right} left ${left}`);
});

// ---- buttons ---------------------------------------------------------------

function buttonIn(state, opt = {}) {
  const g = new Surface(96, 32);
  const out = button(g, 1, 1, 94, 30, state, { face: '#a06a3c', frame: '#7a4f33', ...opt });
  return { g, out };
}

test('button states differ from each other', () => {
  for (const border of [0, 1]) for (const corner of [0, 1]) for (const shine of [false, true]) {
    const drawn = BUTTON_STATES.map((s) => buttonIn(s, { border, corner, shine }).g);
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
      assert.ok(diff(drawn[i], drawn[j]) > 40, `${BUTTON_STATES[i]} against ${BUTTON_STATES[j]} (border ${border}, corner ${corner}, shine ${shine}): ${diff(drawn[i], drawn[j])} px`);
    }
  }
  assert.throws(() => button(new Surface(96, 32), 1, 1, 94, 30, 'asleep', { face: FACE, frame: FRAME }), /state/);
});

test('hover is one tone lighter; pressed moves the face 2 px down and loses the bottom bevel; disabled has no saturation', () => {
  const n = buttonIn('normal'), h = buttonIn('hover'), p = buttonIn('pressed'), d = buttonIn('disabled');
  const faceOf = ({ g, out }) => hexOf(g.get(out.text.x + 10, out.text.y + 5));
  assert.equal(faceOf(n), '#a06a3c');
  assert.ok(brightness(faceOf(h)) > brightness(faceOf(n)) + 0.05, 'hover face is lighter');
  assert.equal(faceOf(p), faceOf(n), 'pressed keeps the face colour');
  assert.equal(p.out.text.y, n.out.text.y + LIP, 'pressed face is 2 px lower');
  assert.equal(LIP, 2);
  // normal: drawn from row 1 to row 30. pressed: the top two rows are empty, the bottom stays where it was
  assert.deepEqual(n.g.bounds(), { x0: 1, y0: 1, x1: 94, y1: 30 });
  assert.deepEqual(p.g.bounds(), { x0: 1, y0: 1 + LIP, x1: 94, y1: 30 });
  // the lip under a raised button: 2 px of one colour, darker than the band above it, then the bottom ink
  const lip = n.g.get(48, 29);
  assert.equal(n.g.get(48, 28), lip, 'the lip is 2 px of colour');
  assert.notEqual(lip, col(INK));
  assert.equal(n.g.get(48, 30), col(INK));
  assert.notEqual(n.g.get(48, 27), lip, 'the band above the lip is another tone');
  assert.ok(brightness(hexOf(lip)) < brightness(hexOf(n.g.get(48, 27))), 'the lip is darker than the band');
  // pressed: the face has come down onto the lip: band, then ink, and no lip colour left
  assert.equal(p.g.get(48, 30), col(INK));
  assert.equal(p.g.get(48, 29), n.g.get(48, 27), 'the band is 2 px lower');
  assert.ok(!p.g.data.includes(lip), 'pressed: no lip');
  for (const v of colours(d.g)) {
    if (v === col(INK)) continue;                 // the outline is always ink
    const [, s] = rgbToHsl(...rgb(v));
    assert.ok(s < 0.15, `disabled colour ${hexOf(v)} has saturation ${s.toFixed(2)}`);
  }
  assert.ok(diff(buttonIn('disabled', { shine: true }).g, buttonIn('disabled', { shine: false }).g) === 0, 'disabled has no shine');
  assert.ok(diff(buttonIn('normal', { shine: true }).g, buttonIn('normal', { shine: false }).g) > 8, 'shine shows on a normal button');
});

test('a button keeps the middle 78x18 flat and clear for text in every state', () => {
  for (const state of BUTTON_STATES) for (const border of [0, 0.5, 1]) for (const corner of [0, 1]) for (const shine of [false, true]) {
    const { g, out } = buttonIn(state, { border, corner, shine });
    const t = out.text;
    assert.ok(t.w >= 78 && t.h >= 18, `${state}: text area ${t.w}x${t.h}`);
    assert.equal(new Set(block(g, t.x, t.y, t.w, t.h)).size, 1, `${state}: text area is flat (border ${border})`);
    // the middle 78x18 of the 96x32 frame: x 9..86, y 7..24
    assert.ok(t.x <= 9 && t.x + t.w >= 87 && t.y <= 7 && t.y + t.h >= 25, `${state}: text area ${JSON.stringify(t)} covers the frame's middle (border ${border})`);
  }
});

test('a button can be nine-sliced with the same 8 px border in every state', () => {
  for (const state of BUTTON_STATES) for (const corner of [0, 1]) for (const border of [0, 1]) {
    const { g } = buttonIn(state, { border, corner });
    for (let y = 0; y < 32; y++) for (let x = SLICE; x < 96 - SLICE; x++) assert.equal(g.get(x, y), g.get(SLICE, y), `${state} row ${y} x=${x}`);
    for (let x = 0; x < 96; x++) for (let y = SLICE; y < 32 - SLICE; y++) assert.equal(g.get(x, y), g.get(x, SLICE), `${state} column ${x} y=${y}`);
  }
});

test('buttonClips gives the four state clips of the style guide', () => {
  const c = buttonClips();
  assert.deepEqual(Object.keys(c), BUTTON_STATES);
  for (const s of BUTTON_STATES) assert.deepEqual(c[s], { frames: 1, fps: 8, loop: true });
  assert.notEqual(buttonClips().normal, c.normal, 'a fresh object each time (defineSprite writes into clips)');
});

// ---- bars -----------------------------------------------------------------

const BAR = { frame: FRAME, fill: HEAL };
const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

test('the bar housing reports the opening its pixels really have, and barOpening gives the same without drawing', () => {
  const BACK = '#445566', backs = new Set([col(BACK), col(tone(BACK, -1))]);
  for (const border of [0, 0.5, 1]) for (const corner of [0, 1]) for (const caps of [0, 6]) for (const segments of [0, 5]) {
    const g = new Surface(64, 16);
    const o = barHousing(g, 1, 1, 62, 14, { ...BAR, back: BACK, border, corner, caps, segments });
    assert.deepEqual(g.bounds(), { x0: 1, y0: 1, x1: 62, y1: 14 });
    // the trough is where the back colour is: its box is the opening, and nothing else is in it but compartment lines
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) if (backs.has(g.get(x, y))) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    assert.deepEqual(o, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, `border ${border} corner ${corner} caps ${caps}`);
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) assert.ok(backs.has(g.get(x, y)) || (segments && g.get(x, y) === col(INK)), `trough pixel ${x},${y}`);
    // an ink line all round it, then the frame
    for (let x = o.x - 1; x <= o.x + o.w; x++) { assert.equal(g.get(x, o.y - 1), col(INK)); assert.equal(g.get(x, o.y + o.h), col(INK)); }
    for (let y = o.y; y < o.y + o.h; y++) { assert.equal(g.get(o.x - 1, y), col(INK)); assert.equal(g.get(o.x + o.w, y), col(INK)); }
    assert.ok(o.w >= 30 && o.h >= 4, `opening ${o.w}x${o.h}`);
    assert.deepEqual(barOpening(1, 1, 62, 14, { border, corner, caps }), o);
  }
  // with no back colour given the trough is a dark tone made from the frame colour
  const g = new Surface(64, 16), o = barHousing(g, 1, 1, 62, 14, BAR);
  for (const c of new Set(block(g, o.x, o.y, o.w, o.h).map(hexOf))) assert.ok(brightness(c) < 0.35, `trough colour ${c} is dark`);
});

test("a bar's fill grows with its value", () => {
  for (const segments of [0, 5]) {
    const o = barOpening(1, 1, 62, 14, {});
    let last = -1;
    for (let i = 0; i <= 20; i++) {
      const g = new Surface(64, 16);
      barFill(g, o, i / 20, { fill: HEAL, segments });
      const n = count(g);
      assert.ok(n >= last, `value ${i / 20}: ${n} pixels after ${last}`);
      if (i > 0 && i % 4 === 0) assert.ok(n > last, `value ${i / 20} is visibly more than the step before`);
      if (i % 4 === 0) last = n;
      const b = g.bounds();
      if (i === 0) assert.equal(b, null, 'nothing at zero');
      else assert.equal(b.x0, o.x, 'the fill starts at the left end of the opening');
    }
    const full = new Surface(64, 16);
    barFill(full, o, 1, { fill: HEAL, segments });
    assert.deepEqual(full.bounds(), { x0: o.x, y0: o.y, x1: o.x + o.w - 1, y1: o.y + o.h - 1 }, 'the full strip fits the opening exactly');
    if (!segments) assert.equal(count(full), o.w * o.h, 'a solid strip covers every pixel of the opening');
    else assert.ok(count(full) < o.w * o.h && count(full) > o.w * o.h * 0.8, 'a segmented strip leaves thin gaps');
  }
});

test("a bar's fill never leaves the housing", () => {
  for (const border of [0, 0.5, 1]) for (const corner of [0, 1]) for (const caps of [0, 6]) for (const value of [-0.5, 0, 0.01, 0.33, 0.5, 0.99, 1, 1.7]) {
    const empty = new Surface(64, 16), filled = new Surface(64, 16);
    const o = barHousing(empty, 1, 1, 62, 14, { ...BAR, border, corner, caps });
    barHousing(filled, 1, 1, 62, 14, { ...BAR, border, corner, caps });
    barFill(filled, o, value, { fill: HEAL, shine: true });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) {
      if (!inside(o, x, y)) assert.equal(filled.get(x, y), empty.get(x, y), `value ${value}: pixel ${x},${y} outside the opening changed`);
    }
    const alone = new Surface(64, 16);
    barFill(alone, o, value, { fill: HEAL, shine: true });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) if (alone.get(x, y)) assert.ok(inside(o, x, y), `value ${value}: fill pixel ${x},${y} outside the opening`);
  }
});

test('shine, flash and the fill colour change the strip', () => {
  const o = barOpening(1, 1, 62, 14, {});
  const draw = (opt) => { const g = new Surface(64, 16); barFill(g, o, 1, { fill: HEAL, ...opt }); return g; };
  assert.ok(diff(draw({ shine: false }), draw({ shine: true })) > 8);
  assert.ok(diff(draw({}), draw({ fill: '#3f6fd1' })) > 100);
  const white = draw({ flash: 1 });
  assert.deepEqual([...colours(white)], [col('#ffffff')], 'a full flash is white');
  assert.ok(diff(draw({ flash: 0.5 }), draw({})) > 100);
  assert.equal(diff(draw({ flash: 0 }), draw({})), 0);
});

// ---- small things -----------------------------------------------------------

test('slice9 gives the border of a full-frame panel, or of a piece drawn in its own rectangle', () => {
  assert.deepEqual(slice9(), { left: 8, top: 8, right: 8, bottom: 8 });
  // a 56x20 tag at (20, 14): the border is measured from the tag's own rectangle, which is exported as `rect`
  const rect = { x: 20, y: 14, w: 56, h: 20 };
  const sl = slice9(rect);
  assert.deepEqual(sl, { rect, left: 7, top: 7, right: 7, bottom: 7 });
  const g = new Surface(96, 48);
  panel9(g, rect.x, rect.y, rect.w, rect.h, { face: FACE, frame: FRAME, border: 1, corner: 1, shadow: true });
  const mid = new Set(block(g, rect.x + sl.left, rect.y + sl.top, rect.w - sl.left - sl.right, rect.h - sl.top - sl.bottom));
  assert.deepEqual([...mid], [col(FACE)], 'between the cuts the tag is flat');
});

test('highlight is an inked ring of the accent colour round a flat text area', () => {
  for (const corner of [0, 0.5, 1]) {
    const g = new Surface(96, 20);
    const { inner } = highlight(g, 8, 3, 80, 14, { colour: GOLD, fill: FACE, corner });
    assert.deepEqual(g.bounds(), { x0: 8, y0: 3, x1: 87, y1: 16 });
    assert.ok(inner.h >= 8 && inner.w >= 70, `text area ${inner.w}x${inner.h}`);
    assert.deepEqual([...new Set(block(g, inner.x, inner.y, inner.w, inner.h))], [col(FACE)], 'the text area is the fill colour, flat');
    assert.equal(g.get(40, 3), col(INK)); assert.equal(g.get(40, 16), col(INK));
    assert.ok(brightness(hexOf(g.get(40, 4))) >= brightness(GOLD), 'the ring is lit along the top');
    assert.ok(brightness(hexOf(g.get(40, 15))) < brightness(GOLD), 'and dark along the bottom');
    for (let y = 0; y < 20; y++) for (let x = 12; x < 84; x++) assert.equal(g.get(x, y), g.get(12, y), `stretches sideways: row ${y}`);
    for (let x = 0; x < 96; x++) for (let y = 7; y < 13; y++) assert.equal(g.get(x, y), g.get(x, 7), `stretches up and down: column ${x}`);
  }
  const bar = (o) => { const g = new Surface(96, 20); highlight(g, 8, 3, 80, 14, { colour: GOLD, fill: FACE, ...o }); return g; };
  assert.ok(diff(bar({ corner: 0 }), bar({ corner: 1 })) > 0, 'corner rounds it');
  assert.ok(diff(bar({}), bar({ colour: '#c9423a' })) > 100, 'the ring takes the accent colour');
  assert.equal(diff(bar({}), bar({})), 0);
  // with no fill it is a solid bar of the colour
  const solid = new Surface(96, 20), out = highlight(solid, 8, 3, 80, 14, { colour: GOLD });
  assert.deepEqual([...new Set(block(solid, out.inner.x, out.inner.y, out.inner.w, out.inner.h))], [col(GOLD)]);
});

test('contrast is the WCAG ratio', () => {
  assert.ok(Math.abs(contrast('#ffffff', '#000000') - 21) < 0.01);
  assert.equal(contrast('#777777', '#777777'), 1);
  assert.ok(contrast('#ffffff', '#3f5490') > 7 && contrast('#ffffff', '#3f5490') < 7.6);
  assert.equal(contrast('#3f5490', '#ffffff'), contrast('#ffffff', '#3f5490'));
});

test('scroll rolls are 5 px at every border, with three rows of rod between their ink lines', () => {
  for (const border of [0, 0.5, 1]) for (const shadow of [false, true]) {
    const { g } = panelIn(96, 48, { style: 'scroll', border, shadow, corner: 0 });
    const x = 40, bottom = shadow ? 44 : 46;
    assert.equal(g.get(x, 1), col(INK)); assert.equal(g.get(x, 5), col(INK));
    const rod = [2, 3, 4].map((y) => brightness(hexOf(g.get(x, y))));
    assert.ok(rod[0] > rod[1] && rod[1] > rod[2], `top roll is lit from above: ${rod}`);
    assert.equal(g.get(x, bottom), col(INK)); assert.equal(g.get(x, bottom - 4), col(INK));
    for (const y of [bottom - 1, bottom - 2, bottom - 3]) assert.notEqual(g.get(x, y), col(INK), `bottom roll row ${y}`);
  }
});

test('ornate studs stay whole when the corner is round', () => {
  for (const corner of [0, 0.5, 1]) for (const border of [0, 0.5, 1]) for (const shadow of [false, true]) {
    const { g } = panelIn(96, 48, { style: 'ornate', corner, border, shadow, accent: '#ff00ff' });
    const studTones = new Set([col('#ff00ff'), col(tone('#ff00ff', 0.85)), col(tone('#ff00ff', -1))]);
    const countIn = (x0, y0) => block(g, x0, y0, 8, 8).filter((v) => studTones.has(v)).length;
    for (const [x0, y0] of [[0, 0], [88, 0], [0, 40], [88, 40]]) assert.ok(countIn(x0, y0) >= 8, `corner ${corner} border ${border}: stud at ${x0},${y0} has ${countIn(x0, y0)} px`);
  }
  // and round still looks different from square
  assert.ok(diff(panelIn(96, 48, { style: 'ornate', corner: 0 }).g, panelIn(96, 48, { style: 'ornate', corner: 1 }).g) > 0);
  assert.ok(diff(panelIn(96, 48, { style: 'ornate', corner: 0.5 }).g, panelIn(96, 48, { style: 'ornate', corner: 1 }).g) > 0);
});

// ---- digits ---------------------------------------------------------------------

const bodyDiff = (a, b) => { let n = 0; for (let y = 0; y < Math.max(a.h, b.h); y++) for (let x = 0; x < Math.max(a.w, b.w); x++) if (!!a.at(x, y) !== !!b.at(x, y)) n++; return n; };
const DIGIT_LOOKS = [];
for (const style of ['chunky', 'slim', 'rounded']) for (const size of [0, 0.5, 1]) DIGIT_LOOKS.push({ style, size });

test('digit sizes come from the helper: three steps per style, never taller than fits above a shadow', () => {
  assert.deepEqual(Object.keys(DIGIT_SIZES).sort(), ['chunky', 'rounded', 'slim']);
  for (const style of Object.keys(DIGIT_SIZES)) {
    assert.equal(DIGIT_SIZES[style].length, 3);
    for (const [i, size] of [0, 0.5, 1].entries()) {
      const d = digitSize(size, style);
      assert.deepEqual([d.w, d.h], DIGIT_SIZES[style][i]);
      assert.ok(d.h + 4 + 1 <= 14 && d.w + 4 + 1 + 1 <= 14, `${style} ${d.w}x${d.h} fits a 16x16 glyph with rim, ink, slant and shadow`);
      assert.equal(d.stroke, style === 'slim' ? 1 : 2);
    }
    assert.deepEqual(digitSize(0.99, style), digitSize(1, style));
  }
  assert.deepEqual([digitSize(0.5).w, digitSize(0.5).h], [6, 9], 'the usual digit: 6x9, 10 px wide once rimmed and inked');
});

test('every digit differs from every other by more than 2 body pixels, at every size and style', () => {
  let least = Infinity, which = '';
  for (const look of DIGIT_LOOKS) {
    const d = digitSize(look.size, look.style);
    const bodies = Array.from({ length: 10 }, (_, n) => digitBody(n, d));
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
      const n = bodyDiff(bodies[i], bodies[j]);
      if (n < least) { least = n; which = `${i} against ${j} (${look.style}, size ${look.size})`; }
      assert.ok(n > 2, `${i} against ${j} (${look.style}, size ${look.size}): ${n} body px`);
    }
  }
  assert.ok(least >= 3, `closest pair: ${which}`);
});

test('the counters of a digit: two rows or more each, a 1 px middle bar, and a waist on the 8', () => {
  for (const look of DIGIT_LOOKS) {
    const d = digitSize(look.size, look.style), eight = digitBody(8, d), zero = digitBody(0, d);
    assert.deepEqual([eight.w, eight.h], [d.w, d.h]);
    // walk down the middle column: bar, counter, bar, counter, bar
    const runs = [];
    const cx = Math.floor(d.w / 2);
    for (let y = 0; y < d.h; y++) { const v = eight.at(cx, y) ? 1 : 0; if (runs.length && runs[runs.length - 1][0] === v) runs[runs.length - 1][1]++; else runs.push([v, 1]); }
    assert.deepEqual(runs.map((r) => r[0]), [1, 0, 1, 0, 1], `${look.style} ${look.size}: bar, counter, bar, counter, bar`);
    assert.equal(runs[2][1], 1, `${look.style} ${look.size}: the middle bar is 1 px`);
    assert.ok(runs[1][1] >= 2 && runs[3][1] >= 2, `${look.style} ${look.size}: counters are ${runs[1][1]} and ${runs[3][1]} rows`);
    assert.ok(runs[1][1] <= runs[3][1], 'the upper counter is never the bigger one');
    assert.equal(runs[0][1], d.bar); assert.equal(runs[4][1], d.bar);
    // the waist: at the middle bar's row the 8 is narrower than the 0 on both sides
    const midRow = runs[0][1] + runs[1][1];
    assert.ok(zero.at(0, midRow) && zero.at(d.w - 1, midRow) && !eight.at(0, midRow) && !eight.at(d.w - 1, midRow), `${look.style} ${look.size}: waist`);
    // stems are `stroke` wide
    let stem = 0; for (let x = 0; x < d.w && zero.at(x, midRow); x++) stem++;
    assert.equal(stem, d.stroke);
  }
  // rounded takes the corners off, chunky keeps them
  assert.ok(digitBody(0, digitSize(0.5, 'chunky')).at(0, 0));
  assert.ok(!digitBody(0, digitSize(0.5, 'rounded')).at(0, 0));
  assert.throws(() => digitBody(10, digitSize(0.5)), /digit/);
});

test('rimmed draws body, rim, ink and shadow, and inks the holes', () => {
  const d = digitSize(0.5), zero = digitBody(0, d);
  const g = new Surface(16, 16);
  rimmed(g, zero, 4, 3, { colour: '#f0ead8', edge: '#e8662c' });
  assert.deepEqual(g.bounds(), { x0: 2, y0: 1, x1: 11, y1: 13 }, 'body 6x9 at (4, 3), 1 px rim, 1 px ink');
  assert.equal(g.get(4, 3), col('#f0ead8'));
  assert.equal(g.get(5, 2), col('#e8662c'), 'rim, lit side (above the body)');
  assert.equal(g.get(3, 12), col(tone('#e8662c', -1)), 'rim, shadow side (below and left of the body)');
  assert.equal(g.get(6, 6), col(INK), 'the counter is ink');
  assert.equal(g.get(2, 2), col(INK));
  const s = new Surface(16, 16);
  rimmed(s, zero, 4, 3, { colour: '#f0ead8', edge: '#e8662c', shadow: true });
  assert.deepEqual(s.bounds(), { x0: 1, y0: 1, x1: 11, y1: 14 }, 'the shadow adds 1 px below and to the left');
  const l = new Surface(16, 16);
  rimmed(l, zero, 4, 3, { colour: '#f0ead8', edge: '#e8662c', lean: true });
  assert.equal(l.bounds().x1, 12, 'leaning: the top half moves 1 px right');
  assert.equal(l.bounds().x0, 2);
});

test('desaturate removes the colour and keeps the brightness close', () => {
  for (const c of ['#c9423a', '#3f6fd1', '#f2c230', '#2b3a67', '#f0ead8']) {
    const d = desaturate(c);
    const [, s] = rgbToHsl(...rgb(col(d)));
    assert.ok(s < 0.1, `${c} -> ${d}`);
    assert.ok(Math.abs(brightness(d) - brightness(c)) < 0.2, `${c} -> ${d} brightness`);
  }
});

test('triangle draws a crisp arrow head that points where it is told', () => {
  for (const [dir, w, h] of [['down', 9, 5], ['up', 9, 5], ['left', 5, 9], ['right', 5, 9]]) {
    const g = new Surface(20, 20);
    triangle(g, 10, 10, 9, dir, GOLD);
    const b = g.bounds();
    assert.equal(b.x1 - b.x0 + 1, w, `${dir} width`);
    assert.equal(b.y1 - b.y0 + 1, h, `${dir} height`);
    assert.equal(count(g), 25, `${dir}: rows of 9, 7, 5, 3, 1`);
  }
  const g = new Surface(20, 20);
  triangle(g, 10, 10, 9, 'down', GOLD);
  let top = 0, bottom = 0;
  for (let x = 0; x < 20; x++) { if (g.get(x, g.bounds().y0)) top++; if (g.get(x, g.bounds().y1)) bottom++; }
  assert.equal(top, 9); assert.equal(bottom, 1);
});

test('deterministic: the same call draws the same pixels', () => {
  for (const look of LOOKS) assert.equal(diff(panelIn(96, 48, look).g, panelIn(96, 48, look).g), 0, name(look));
  for (const s of BUTTON_STATES) assert.equal(diff(buttonIn(s).g, buttonIn(s).g), 0, s);
  const bar = () => { const g = new Surface(64, 16); const o = barHousing(g, 1, 1, 62, 14, BAR); barFill(g, o, 0.6, { fill: HEAL, shine: true, segments: 6 }); return g; };
  assert.equal(diff(bar(), bar()), 0);
  // and nothing is left behind on the surface's settings
  const g = new Surface(96, 48);
  panel9(g, 1, 1, 94, 46, { face: FACE, frame: FRAME });
  assert.deepEqual(g.shadow, [-1, 1]);
});
