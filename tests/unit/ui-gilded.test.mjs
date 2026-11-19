import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, tone } from '../../engine/color.js';
import { GILDED_STYLES, gildedCorners, gildedCaps, gildedLift } from '../../engine/ui-gilded.js';
import { skinPanel, skinButton, skinBarHousing } from '../../engine/ui-skins.js';

const FACE = '#3f5068', FRAME = '#f0ead8', ACCENT = '#4fd8ee';
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const panel = (style, w = 96, opt = {}) => {
  const g = new Surface(w, 64);
  const out = skinPanel(g, 1, 1, w - 2, 62, 'gilded', { style, face: FACE, frame: FRAME, accent: ACCENT, extras: false });
  const before = new Surface(w, 64); before.blit(g);
  if (style) gildedCorners(g, out.body, style, { face: FACE, frame: FRAME, accent: ACCENT, keep: { x: 8, y: 8, w: w - 16, h: 48 }, skip: [out.inner], ...opt });
  return { g, out, before };
};

test('gildedCorners lists the gilded styles and refuses others', () => {
  assert.deepEqual([...GILDED_STYLES], ['temple', 'royal', 'ruin']);
  assert.throws(() => gildedCorners(new Surface(8, 8), { x: 0, y: 0, w: 8, h: 8 }, 'plain', {}), /style/);
  assert.throws(() => gildedCaps(new Surface(8, 8), { x: 2, y: 2, w: 4, h: 4 }, 1, 'plain', {}), /style/);
});

test('every style changes a panel, and the styles differ from each other by 60 px or more', () => {
  const m = Object.fromEntries(GILDED_STYLES.map((s) => [s, panel(s)]));
  for (const s of GILDED_STYLES) assert.ok(diff(m[s].g, m[s].before) >= 24, `${s} changes the panel`);
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const A = GILDED_STYLES[a], B = GILDED_STYLES[b];
    assert.ok(diff(m[A].g, m[B].g) >= 60, `${A} and ${B} differ`);
  }
});

test('the flat middle (skip) is never touched, and the panel still stretches', () => {
  for (const s of GILDED_STYLES) {
    const { g, out, before } = panel(s);
    const r = out.inner;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(g.get(x, y), before.get(x, y), `${s} inner ${x},${y}`);
    // drawn 96 and 160 wide, every column of the stretched middle is the same column
    const wide = panel(s, 160).g, col48 = (G, x) => Array.from({ length: 64 }, (_, y) => G.get(x, y)).join();
    for (let x = 8; x < 152; x++) assert.equal(col48(wide, x), col48(wide, 80), `${s} column ${x}`);
    for (let x = 8; x < 88; x++) assert.equal(col48(g, x), col48(g, 48), `${s} column ${x} at 96`);
  }
});

test('gems: 3x3 of the accent family in each corner, lit gems lighter, none when gems are off', () => {
  const count = (g, c) => g.data.filter((v) => v === col(c)).length;
  const on = panel('temple').g, off = panel('temple', 96, { gems: false }).g, lit = panel('temple', 96, { lit: true }).g;
  assert.ok(count(on, ACCENT) >= 4 * 7);
  assert.equal(count(off, ACCENT), 0);
  assert.equal(count(lit, ACCENT), 4, 'lit gems keep only their shadow pixel in the plain accent');
  assert.ok(count(lit, tone(ACCENT, 0.45)) >= 4 * 7);
});

test('a disabled piece gets no colour', () => {
  for (const s of GILDED_STYLES) {
    const g = new Surface(96, 32);
    const out = skinButton(g, 1, 1, 94, 30, 'disabled', 'gilded', { style: s, face: FACE, frame: FRAME, accent: ACCENT });
    gildedCorners(g, out.body, s, { face: FACE, frame: FRAME, accent: ACCENT, state: 'disabled', keep: { x: 8, y: 8, w: 80, h: 16 }, skip: [out.text] });
    for (const v of g.data) if (v) { const r = v & 255, gg = (v >>> 8) & 255, b = (v >>> 16) & 255; assert.ok(Math.max(r, gg, b) - Math.min(r, gg, b) <= 2, `${s} grey`); }
  }
});

test('gildedCaps marks only the gold of the end caps, differently per style', () => {
  const draw = (style) => {
    const g = new Surface(64, 16);
    const o = skinBarHousing(g, 1, 1, 62, 14, 'gilded', { frame: FRAME, caps: 4, style: 'temple' });
    const before = new Surface(64, 16); before.blit(g);
    if (style) gildedCaps(g, o, 4, style, { frame: FRAME });
    return { g, before, o };
  };
  const m = Object.fromEntries(GILDED_STYLES.map((s) => [s, draw(s)]));
  for (const s of GILDED_STYLES) {
    const { g, before, o } = m[s];
    assert.ok(diff(g, before) >= 8, `${s} marks the caps`);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) if (g.get(x, y) !== before.get(x, y)) {
      assert.ok(x < o.x - 1 || x > o.x + o.w, `${s} stays on the caps (${x},${y})`);
    }
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) assert.ok(diff(m[GILDED_STYLES[a]].g, m[GILDED_STYLES[b]].g) >= 12);
});

test('gildedLift lifts the dark gold by 25 levels or more', () => {
  const g = new Surface(4, 1);
  g.dot(0, 0, tone(FRAME, -1)); g.dot(1, 0, FRAME);
  gildedLift(g, { x: 0, y: 0, w: 4, h: 1 }, FRAME);
  const a = col(tone(FRAME, -1)), b = g.get(0, 0);
  assert.ok(Math.max(...[0, 8, 16].map((sh) => ((b >>> sh) & 255) - ((a >>> sh) & 255))) >= 25);
  assert.equal(g.get(1, 0), col(FRAME));
});
