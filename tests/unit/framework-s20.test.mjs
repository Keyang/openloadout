// Framework additions made with batch S20 (the roguelite kit's interface pieces):
//   engine/ui.js      TECH_STYLES, cutPx, cutRectIn   cut corners
//                     techPanel                       a sci-fi panel: cut corners, a thin lit edge, three looks, a lip, a tab
//                     scanLines                       thin lines every few rows (scan lines, vents)
//                     techBarHousing, techBarFill     an angular bar: cut corners, upright or leaning compartments, tick marks
//   engine/shapes.js  spunIn                          copies of a shape test spaced evenly round a centre
// and, in fix round 1:
//   engine/shapes.js  allIn, notIn                    what shape tests share; a shape test turned inside out
//                     reachOf                         how near to a point and how far from it a shape comes
//   engine/marks.js   SIGN_MARKS (question)           a question mark, the partner of `exclaim`
// and, in fix round 2:
//   engine/shapes.js  grownIn                         a shape test grown by whole pixels, corners included
//                     strokeIn                        a straight bar with equal pixel steps and the same thickness in every column or row
//                     cornerIn                        two such bars meeting at a tip: an L or a V that stays clean at any turn
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn } from '../../engine/surface.js';
import { col, ramp, mix, tone, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { THEME_PRESETS, normalizeTheme, applyColour } from '../../engine/theme.js';
import { TECH_STYLES, cutPx, cutRectIn, techPanel, scanLines, techBarHousing, techBarFill, barOpening, contrast, SLICE } from '../../engine/ui.js';
import { spunIn, allIn, notIn, reachOf, ringIn, hexIn } from '../../engine/shapes.js';
import { MARKS, LABEL_MARKS, SIGN_MARKS, markIn, drawMark } from '../../engine/marks.js';

import { codeSprite, codeSpriteSource } from '../helpers/library.mjs';   // the code, frozen first (tests/helpers/library.mjs): a test about the framework it uses
const P = PALETTE.derelict;
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const hexOf = (v) => '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('');
const LOOK = { face: P.plate, frame: P.hull, glow: P.cyan };
const panel = (opt = {}, w = 64, h = 48) => { const g = new Surface(w, h); const r = techPanel(g, 1, 1, w - 2, h - 2, { ...LOOK, ...opt }); return { g, r }; };

test('S20 cutPx and cutRectIn: corners cut at 45 degrees, each by its own amount', () => {
  assert.deepEqual([cutPx(0), cutPx(0.5), cutPx(1), cutPx(7)], [0, 2, 4, 4]);
  const all = (cut) => { const g = new Surface(20, 12); g.fill(0, 0, 20, 12, cutRectIn(2, 1, 16, 10, cut), '#ffffff'); return g; };
  assert.equal(lit(all(0)), 160, 'no cut: the whole rectangle');
  assert.equal(lit(all(3)), 160 - 4 * 6, 'a 3 px cut takes 3 + 2 + 1 pixels off each corner');
  const one = all([4, 0, 0, 0]);
  assert.equal(lit(one), 160 - 10);
  assert.equal(one.get(2, 1), 0, 'the top left corner is gone');
  assert.equal(one.get(5, 1), 0);
  assert.notEqual(one.get(6, 1), 0, 'the cut ends 4 px along the top');
  assert.notEqual(one.get(2, 5), 0, 'and 4 px down the side');
  assert.notEqual(one.get(17, 1), 0, 'the other corners are whole');
  assert.notEqual(one.get(17, 10), 0);
  // the diagonal is a clean staircase: each row starts one pixel further left than the row above
  for (let j = 0; j < 4; j++) { assert.equal(one.get(2 + 3 - j - 1, 1 + j), 0); assert.notEqual(one.get(2 + 4 - j, 1 + j), 0); }
  // mirrored cuts give a mirrored shape
  const a = all([3, 1, 2, 0]), b = all([1, 3, 0, 2]);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) assert.equal(!!a.get(x, y), !!b.get(19 - x, y), `mirror at ${x},${y}`);
});

test('S20 techPanel: ink, a lit edge in the light tone of the frame all the way round, the band, ink, a flat face', () => {
  assert.deepEqual([...TECH_STYLES], ['plate', 'hologram', 'glass']);
  for (const b of [1, 2, 3]) {
    const { g, r } = panel({ borderPx: b, cutPx: 0 });
    const F = ramp(P.hull);
    assert.deepEqual(g.bounds(), { x0: 1, y0: 1, x1: 62, y1: 46 }, 'it fills the rectangle given');
    for (const [x, y, dx, dy] of [[32, 1, 0, 1], [32, 46, 0, -1], [1, 24, 1, 0], [62, 24, -1, 0]]) {
      const at = (k) => g.get(x + dx * k, y + dy * k);
      assert.equal(at(0), col(INK), 'the outline');
      assert.equal(at(1), col(F.light), `border ${b}: the lit edge`);
      for (let k = 2; k <= b; k++) assert.ok([col(F.base), col(F.dark)].includes(at(k)), `border ${b}: band pixel ${k}`);
      assert.equal(at(b + 1), col(INK), `border ${b}: the inner line`);
      assert.equal(at(b + 2), col(P.plate), `border ${b}: the face`);
    }
    // the band is darker along the bottom and the left, as every bevel in the helper
    if (b >= 2) { assert.equal(g.get(32, 3), col(F.base)); assert.equal(g.get(32, 44), col(F.dark)); assert.equal(g.get(3, 24), col(F.dark)); assert.equal(g.get(60, 24), col(F.base)); }
    // the middle it returns is one flat colour, inside the nine-slice border
    for (let y = r.inner.y; y < r.inner.y + r.inner.h; y++) for (let x = r.inner.x; x < r.inner.x + r.inner.w; x++) assert.equal(g.get(x, y), col(P.plate), `flat at ${x},${y}`);
    assert.deepEqual(r.slice, { left: SLICE - 1, top: SLICE - 1, right: SLICE - 1, bottom: SLICE - 1 }, 'with the 1 px empty border of a frame: the 8 px of the style guide');
  }
  assert.throws(() => techPanel(new Surface(8, 8), 0, 0, 8, 8, { frame: P.hull }), /face/);
  assert.throws(() => techPanel(new Surface(8, 8), 0, 0, 8, 8, { ...LOOK, style: 'wood' }), /style/);
});

test('S20 techPanel: cut corners, per corner; the flat middle never reaches into one', () => {
  const sq = panel({ cutPx: 0 }).g, cut = panel({ cutPx: 4 }).g, two = panel({ cutPx: [6, 0, 6, 0] });
  assert.equal(lit(sq) - lit(cut), 4 * 10);
  assert.equal(cut.get(1, 1), 0);
  assert.equal(cut.get(5, 1), col(INK), 'the diagonal is inked');
  assert.equal(cut.get(4, 2), col(INK));
  assert.equal(cut.get(5, 2), col(ramp(P.hull).light), 'and the lit edge follows it');
  assert.equal(two.g.get(1, 1), 0);
  assert.notEqual(two.g.get(62, 1), 0, 'the top right corner is whole');
  assert.equal(two.g.get(62, 46), 0);
  for (const cutPx of [0, 2, 4, 7]) for (const borderPx of [1, 3]) {
    const { g, r } = panel({ cutPx, borderPx });
    for (const [x, y] of [[r.inner.x, r.inner.y], [r.inner.x + r.inner.w - 1, r.inner.y], [r.inner.x, r.inner.y + r.inner.h - 1], [r.inner.x + r.inner.w - 1, r.inner.y + r.inner.h - 1]]) assert.equal(g.get(x, y), col(P.plate), `cut ${cutPx}, border ${borderPx}: the corner of the middle is face`);
    assert.equal(r.slice.left, Math.max(SLICE - 1, cutPx + 1), 'inside the 8 px border, unless a cut is deeper than that');
    // outside the border it reports, every column of the top and bottom edges and every row of the side edges is the same
    for (let x = 1 + r.slice.left + 1; x < 63 - r.slice.right; x++) for (let y = 1; y < 47; y++) assert.equal(g.get(x, y), g.get(1 + r.slice.left, y), `cut ${cutPx}: column ${x}`);
    for (let y = 1 + r.slice.top + 1; y < 47 - r.slice.bottom; y++) for (let x = 1; x < 63; x++) assert.equal(g.get(x, y), g.get(x, 1 + r.slice.top), `cut ${cutPx}: row ${y}`);
  }
  // the slider form
  assert.equal(diff(panel({ cut: 1 }).g, cut), 0);
  assert.equal(diff(panel({ border: 1 }).g, panel({ borderPx: 3 }).g), 0);
});

test('S20 techPanel: the three looks differ, and each keeps the middle one colour', () => {
  const drawn = TECH_STYLES.map((style) => panel({ style, borderPx: 2 }));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(diff(drawn[i].g, drawn[j].g) > 60, `${TECH_STYLES[i]} against ${TECH_STYLES[j]}`);
  for (const [i, { g, r }] of drawn.entries()) {
    const c = g.get(r.inner.x, r.inner.y);
    for (let y = r.inner.y; y < r.inner.y + r.inner.h; y++) for (let x = r.inner.x; x < r.inner.x + r.inner.w; x++) assert.equal(g.get(x, y), c, `${TECH_STYLES[i]}: flat at ${x},${y}`);
    assert.equal(lit(g), lit(drawn[0].g), 'one silhouette for all three');
  }
  // hologram: the lines are light of the glow colour, and the face takes a little of it
  const holo = drawn[1].g, G = ramp(P.cyan);
  assert.equal(holo.get(32, 2), col(G.light));
  assert.equal(holo.get(drawn[1].r.inner.x, drawn[1].r.inner.y), col(mix(P.plate, P.cyan, 0.14)));
  assert.equal(count(holo, P.hull), 0, 'no metal in a hologram');
  // glass: no ink between the rim and the face; the rim's inner edge is lit along the top, shaded along the bottom; a glare above the middle
  const glass = drawn[2];
  assert.equal(glass.g.get(32, 4), col(tone(P.plate, 0.45)), 'lit where a plate has its inner ink line');
  assert.equal(glass.g.get(32, 43), col(tone(P.plate, -0.5)));
  assert.equal(drawn[0].g.get(32, 4), col(INK));
  assert.equal(glass.g.get(32, 5), col(P.plate));
  assert.ok(glass.r.slice.top > glass.r.slice.left, 'the glare sits above the flat middle');
});

test('S20 techPanel: a lip under the body, a lit frame, a greyed panel, a tab', () => {
  const flat = panel({}), lip = panel({ lip: 2 }), tall = panel({ lip: 4 });
  assert.deepEqual(lip.r.body, { x: 1, y: 1, w: 62, h: 44 });
  assert.deepEqual(lip.g.bounds(), flat.g.bounds(), 'body and lip together fill the rectangle');
  const side = ramp(P.hull).dark;
  assert.equal(lip.g.get(32, 45), col(side));
  assert.equal(lip.g.get(32, 46), col(INK));
  assert.equal(lip.g.get(32, 44), col(side), 'the body joins its lip: 2 px of colour');
  assert.equal(lip.g.get(32, 43), col(ramp(P.hull).light));
  assert.ok(count(tall.g, side) > count(lip.g, side) + 100, 'a taller lip shows more side');
  assert.equal(lip.r.slice.bottom, flat.r.slice.bottom + 2);
  // lit: the frame takes the glow colour
  const on = panel({ lit: true, borderPx: 2 }).g;
  assert.equal(on.get(32, 2), col(ramp(P.cyan).light));
  assert.equal(on.get(32, 3), col(P.cyan));
  assert.equal(count(on, P.hull), 0);
  // off: no colour at all
  const off = panel({ off: true, lit: true, face: P.signal, frame: P.amber, glow: P.red, lip: 2 }).g;
  for (const v of new Set(off.data)) { if (!v || v === col(INK)) continue; const [r, gg, b] = [v & 255, (v >>> 8) & 255, (v >>> 16) & 255]; assert.ok(r === gg && gg === b, `grey: ${hexOf(v)}`); }
  // a tab: the top edge stands 2 px higher in the middle
  const tab = panel({ tab: { inset: 12, rise: 2 } });
  assert.equal(tab.g.get(8, 1), 0, 'the shoulders are lower');
  assert.equal(tab.g.get(8, 3), col(INK));
  assert.equal(tab.g.get(32, 1), col(INK), 'the middle is where it was');
  assert.equal(tab.g.get(32, 2), col(ramp(P.hull).light));
  assert.equal(tab.r.inner.y, flat.r.inner.y + 2);
  assert.equal(tab.g.get(tab.r.inner.x, tab.r.inner.y), col(P.plate));
});

test('S20 techPanel: white text keeps 4.5 to 1 on the face and the lit edge 3 to 1 against it, under every whole-bundle look', () => {
  const looks = [['as made', null], ...THEME_PRESETS.map((t) => [t.name, normalizeTheme(t.theme).colour])];
  for (const style of TECH_STYLES) for (const frame of [P.hull, P.teal, P.panel, P.steel, P.amber]) for (const [name, colour] of looks) {
    const { g, r } = panel({ style, frame, borderPx: 3 });
    if (colour) applyColour(g.data, colour);
    const faceNow = hexOf(g.get(r.inner.x + 4, r.inner.y + 4)), edgeNow = hexOf(g.get(32, 2));
    assert.ok(contrast('#ffffff', faceNow) >= 4.5, `${style} under ${name}: white text ${contrast('#ffffff', faceNow).toFixed(2)}`);
    assert.ok(contrast(edgeNow, faceNow) >= 3, `${style}, frame ${frame} under ${name}: lit edge ${contrast(edgeNow, faceNow).toFixed(2)}`);
  }
});

test('S20 scanLines: one line every few rows, only over the colour named, never in the part left clear', () => {
  const g = new Surface(20, 20);
  g.rect(0, 0, 20, 20, '#101010');
  g.rect(0, 0, 3, 20, '#ff0000');                                   // a frame the lines must not cross
  scanLines(g, 0, 2, 20, 12, '#00ff00', { pitch: 4, over: '#101010', skip: { x: 8, y: 0, w: 4, h: 20 } });
  const rows = [];
  for (let y = 0; y < 20; y++) if (g.get(5, y) === col('#00ff00')) rows.push(y);
  assert.deepEqual(rows, [2, 6, 10]);
  assert.equal(count(g, '#00ff00'), 3 * (20 - 3 - 4));
  assert.equal(g.get(1, 2), col('#ff0000'));
  assert.equal(g.get(9, 2), col('#101010'));
  const h = new Surface(8, 8);
  scanLines(h, 0, 0, 8, 8, '#00ff00', { pitch: 2, phase: 1 });
  assert.equal(count(h, '#00ff00'), 4 * 8, 'with no `over` it paints every pixel of its rows');
  assert.equal(h.get(0, 0), 0);
});

test('S20 techBarHousing and techBarFill: the strip fits the trough exactly, at every border and cut', () => {
  for (const borderPx of [1, 2, 3]) for (const cut of [0, 4, [6, 0, 6, 0]]) for (const caps of [0, 3]) {
    const opt = { frame: P.hull, borderPx, cutPx: cut, caps };
    const g = new Surface(64, 16), f = new Surface(64, 16);
    const o = techBarHousing(g, 1, 1, 62, 14, opt);
    assert.deepEqual(o, barOpening(1, 1, 62, 14, opt), 'the opening is the helper\'s');
    techBarFill(f, o, 1, { fill: P.heal });
    assert.deepEqual(f.bounds(), { x0: o.x, y0: o.y, x1: o.x + o.w - 1, y1: o.y + o.h - 1 });
    for (let x = o.x - 1; x <= o.x + o.w; x++) { assert.equal(g.get(x, o.y - 1), col(INK)); assert.equal(g.get(x, o.y + o.h), col(INK)); }
    for (let y = o.y; y < o.y + o.h; y++) { assert.equal(g.get(o.x - 1, y), col(INK)); assert.equal(g.get(o.x + o.w, y), col(INK)); }
    const F = ramp(P.hull), frameCols = new Set([col(F.light), col(F.base), col(F.dark)]);
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) assert.ok(!frameCols.has(g.get(x, y)), `trough at ${x},${y}`);
    assert.equal(g.get(32, 2), col(F.light), 'the lit edge');
    assert.deepEqual(g.bounds(), { x0: 1, y0: 1, x1: 62, y1: 14 });
  }
  assert.throws(() => techBarHousing(new Surface(64, 16), 1, 1, 62, 14, {}), /frame/);
  assert.throws(() => techBarFill(new Surface(64, 16), { x: 4, y: 4, w: 56, h: 8 }, 1, {}), /fill/);
});

test('S20 tech bars: compartments stand or lean, the strip has the same gaps, and the value crops it', () => {
  for (const slant of [0, 0.5]) for (const borderPx of [1, 2, 3]) {
    const opt = { frame: P.hull, borderPx, caps: [4, 3, 2][borderPx - 1], segments: 7, slant };
    const g = new Surface(64, 16), f = new Surface(64, 16);
    const o = techBarHousing(g, 1, 1, 62, 14, opt);
    techBarFill(f, o, 1, { fill: P.heal, segments: 7, slant });
    assert.equal(o.w, 48, 'seven compartments of 6 px and six lines');
    let gaps = 0;
    for (let y = o.y; y < o.y + o.h; y++) {
      const row = [];
      for (let x = o.x; x < o.x + o.w; x++) if (!f.get(x, y)) { row.push(x); assert.equal(g.get(x, y), col(INK), `a line in the housing at ${x},${y}`); }
      assert.equal(row.length, 6, `six gaps in row ${y}`);
      for (let i = 1; i < row.length; i++) assert.equal(row[i] - row[i - 1], 7, 'one pitch apart');
      gaps += row.length;
    }
    // upright lines stay in their columns; leaning ones move left as they go down, one pixel every two rows
    const first = (y) => { for (let x = o.x; x < o.x + o.w; x++) if (!f.get(x, y)) return x; };
    assert.equal(first(o.y) - first(o.y + o.h - 1), slant ? o.h / 2 - 1 : 0, `slant ${slant}, height ${o.h}`);
  }
  const o = { x: 4, y: 4, w: 56, h: 8 };
  const half = new Surface(64, 16), none = new Surface(64, 16);
  techBarFill(half, o, 0.5, { fill: P.heal });
  techBarFill(none, o, 0, { fill: P.heal });
  assert.deepEqual(half.bounds(), { x0: 4, y0: 4, x1: 31, y1: 11 });
  assert.equal(lit(none), 0);
  const white = new Surface(64, 16);
  techBarFill(white, o, 1, { fill: P.heal, flash: 1 });
  assert.deepEqual([...new Set(white.data)].filter(Boolean), [col('#ffffff')]);
  // light along the top, dark along the bottom
  const full = new Surface(64, 16);
  techBarFill(full, o, 1, { fill: P.heal });
  assert.equal(full.get(20, 4), col(ramp(P.heal).light));
  assert.equal(full.get(20, 8), col(P.heal));
  assert.equal(full.get(20, 11), col(ramp(P.heal).dark));
});

test('S20 tech bars: tick marks cut the band above and below the trough, and follow the lean', () => {
  const draw = (opt) => { const g = new Surface(64, 16); const o = techBarHousing(g, 1, 1, 62, 14, { frame: P.hull, borderPx: 2, cutPx: 0, ...opt }); return { g, o }; };
  const plain = draw({}), ticked = draw({ ticks: 8 });
  assert.ok(diff(plain.g, ticked.g) >= 20, `${diff(plain.g, ticked.g)} px of ticks`);
  const cols = [];
  for (let x = 2; x < 62; x++) if (ticked.g.get(x, 2) === col(INK)) cols.push(x);
  assert.ok(cols.length >= 5);
  for (let i = 1; i < cols.length; i++) assert.equal(cols[i] - cols[i - 1], 8, 'evenly spaced');
  for (const x of cols) { assert.equal(ticked.g.get(x, 3), col(INK), 'through the whole band'); assert.equal(ticked.g.get(x, 13), col(INK), 'and below the trough'); }
  // the trough itself is untouched
  for (let y = plain.o.y; y < plain.o.y + plain.o.h; y++) for (let x = plain.o.x; x < plain.o.x + plain.o.w; x++) assert.equal(ticked.g.get(x, y), plain.g.get(x, y));
  // with compartments the ticks continue the lines; leaning lines give ticks that are offset top to bottom
  const seg = draw({ caps: 3, segments: 7, ticks: 7, slant: 0.5 });
  const top = [], bottom = [];
  for (let x = 2; x < 62; x++) { if (seg.g.get(x, 2) === col(INK)) top.push(x); if (seg.g.get(x, 13) === col(INK)) bottom.push(x); }
  assert.equal(top.length, 6);
  assert.equal(bottom.length, 6);
  assert.equal(top[0] - bottom[0], seg.o.h / 2 - 1);
});

test('S20 spunIn: copies of a shape evenly round a centre; four of them are exactly symmetrical', () => {
  const arm = rectIn(-1, -9, 2, 6);                                  // 2 px wide, pointing up, 3 px clear of the centre
  const g = new Surface(32, 32);
  g.fill(0, 0, 32, 32, spunIn(arm, 16, 16, 4), '#ffffff');
  assert.equal(lit(g), 4 * 12);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    assert.equal(g.get(x, y), g.get(31 - x, y), `left-right at ${x},${y}`);
    assert.equal(g.get(x, y), g.get(x, 31 - y), `up-down at ${x},${y}`);
    assert.equal(g.get(x, y), g.get(y, x), `diagonal at ${x},${y}`);
  }
  assert.deepEqual(g.bounds(), { x0: 7, y0: 7, x1: 24, y1: 24 });
  // a quarter turn of four copies is the same picture; an eighth of a turn is not
  const q = new Surface(32, 32), e = new Surface(32, 32);
  q.fill(0, 0, 32, 32, spunIn(arm, 16, 16, 4, Math.PI / 2), '#ffffff');
  e.fill(0, 0, 32, 32, spunIn(arm, 16, 16, 4, Math.PI / 4), '#ffffff');
  assert.equal(diff(g, q), 0);
  assert.ok(diff(g, e) > 40);
  assert.ok(Math.abs(lit(e) - 48) <= 8, 'a turned copy keeps its size');
  // other counts: three arms, one of them straight up
  const three = new Surface(32, 32);
  three.fill(0, 0, 32, 32, spunIn(arm, 16, 16, 3), '#ffffff');
  assert.notEqual(three.get(15, 8), 0);
  assert.equal(three.get(15, 23), 0, 'nothing straight down');
  assert.ok(Math.abs(lit(three) - 36) <= 6);
});

test('S20 stampGlyph: an ink line round a mark, heavier with corners, and a drop shadow down and to the left', async () => {
  const { stampGlyph } = await import('../../engine/ui.js');
  const mark = () => { const s = new Surface(12, 12); s.rect(4, 4, 4, 4, '#00ff00'); return s; };
  const plain = stampGlyph(new Surface(12, 12), mark()), heavy = stampGlyph(new Surface(12, 12), mark(), { heavy: true }), shadow = stampGlyph(new Surface(12, 12), mark(), { heavy: true, shadow: 1 });
  assert.equal(count(plain, '#00ff00'), 16);
  assert.equal(count(plain, INK), 16, 'four sides of four');
  assert.equal(plain.get(3, 3), 0, 'a plain line leaves the corners open');
  assert.equal(heavy.get(3, 3), col(INK));
  assert.equal(count(heavy, INK), 20);
  assert.deepEqual(shadow.bounds(), { x0: 2, y0: 3, x1: 8, y1: 9 }, 'the shadow adds one column on the left and one row below');
  assert.equal(shadow.get(2, 9), col(INK));
  assert.equal(shadow.get(5, 5), col('#00ff00'), 'the mark stays on top');
  assert.equal(count(shadow, INK), 20 + 11);
});

test('S20 techPanel: corner lights in the glow colour stay out of the flat middle, and the tones it used come back', () => {
  for (const borderPx of [1, 2, 3]) for (const cut of [0, 4, [8, 0, 8, 0]]) {
    const { g, r } = panel({ borderPx, cutPx: cut, lights: [1, 1, 1, 1] }), plain = panel({ borderPx, cutPx: cut }).g;
    const n = count(g, P.cyan) - count(plain, P.cyan);
    assert.ok(n >= 4 * 4, `border ${borderPx}, cut ${cut}: ${n} px of light`);
    for (let y = r.inner.y; y < r.inner.y + r.inner.h; y++) for (let x = r.inner.x; x < r.inner.x + r.inner.w; x++) assert.equal(g.get(x, y), col(P.plate), `the middle stays clear at ${x},${y}`);
    assert.equal(lit(g), lit(plain), 'a light never leaves the panel');
    // the border it reports covers the lights: beyond it the edges repeat
    for (let x = 1 + r.slice.left + 1; x < 63 - r.slice.right; x++) for (let y = 1; y < 47; y++) assert.equal(g.get(x, y), g.get(1 + r.slice.left, y), `lights: column ${x}`);
    for (let y = 1 + r.slice.top + 1; y < 47 - r.slice.bottom; y++) for (let x = 1; x < 63; x++) assert.equal(g.get(x, y), g.get(x, 1 + r.slice.top), `lights: row ${y}`);
  }
  const one = panel({ lights: [0, 1, 0, 0] });
  assert.equal(one.g.get(one.r.face.x + one.r.face.w - 1, one.r.face.y), col(P.cyan), 'top right');
  assert.equal(one.g.get(one.r.face.x, one.r.face.y), col(P.plate));
  assert.deepEqual(one.r.tones, { edge: ramp(P.hull).light, band: P.hull, face: P.plate, side: ramp(P.hull).dark, glow: P.cyan, glowLow: ramp(P.cyan).dark });
  const on = panel({ lights: [0, 1, 0, 0], lit: true });
  assert.equal(on.r.tones.glow, ramp(P.cyan).light, 'lit: the lights turn bright');
  assert.equal(on.g.get(on.r.face.x + on.r.face.w - 1, on.r.face.y), col(ramp(P.cyan).light));
});

// ---- the four S20 sprites built on these pieces ---------------------------------------------

const { renderFrame, renderSheet, defaultParams, cleanParams } = await import('../../engine/sprite.js');
const { validateMeta } = await import('../../catalog/schema.js');
const hudS = (await codeSprite('ui-hud-roguelite')), barsS = (await codeSprite('ui-bars-tech'));
const cardS = (await codeSprite('ui-upgrade-card')), crossS = (await codeSprite('ui-crosshair'));
const drawS = (s, clip, over = {}, f = 0) => renderFrame(s, clip, f, cleanParams(s, { ...defaultParams(s), ...over }));
const clipList = (s) => Object.entries(s.clips).map(([n, c]) => `${n} ${c.frames}${c.frames > 1 ? (c.loop ? ' loop' : ' once') : ''}`);
const LOOKS = [['as made', null], ...THEME_PRESETS.map((t) => [t.name, normalizeTheme(t.theme).colour])];

test('S20 sprites: ids, frames, pivots, clips, controls and defaults are the specification rows', () => {
  assert.deepEqual([hudS.id, hudS.size, hudS.pivot], ['ui-hud-roguelite', [16, 16], [8, 8]]);
  assert.deepEqual(Object.keys(hudS.clips), ['hp-full', 'hp-half', 'hp-empty', 'shield-full', 'shield-empty', 'credit', 'key', 'room', 'room-current', 'room-boss', 'room-shop', 'room-unknown']);
  assert.deepEqual(Object.keys(hudS.params), ['shape', 'bold', 'shine', 'body', 'glow', 'accent', 'metal']);
  assert.deepEqual([hudS.params.body.def, hudS.params.glow.def, hudS.params.accent.def, hudS.params.metal.def], [P.heal, P.shield, P.hull, P.gold]);
  assert.deepEqual([barsS.id, barsS.size, barsS.pivot], ['ui-bars-tech', [64, 16], [32, 8]]);
  assert.deepEqual(clipList(barsS), ['frame 1', 'fill 1', 'fill-b 1', 'fill-c 1', 'flash 4 once']);
  assert.deepEqual(Object.keys(barsS.params), ['style', 'corner', 'border', 'ticks', 'frame', 'fill', 'fillB', 'fillC']);
  assert.deepEqual([barsS.params.frame.def, barsS.params.fill.def, barsS.params.fillB.def, barsS.params.fillC.def], [P.hull, P.heal, P.shield, P.xp]);
  assert.equal(barsS.clips.flash.fps, 8, 'a fixed 8 frames a second: a bar has no speed control');
  assert.deepEqual([cardS.id, cardS.size, cardS.pivot], ['ui-upgrade-card', [64, 96], [32, 48]]);
  assert.deepEqual(clipList(cardS), ['normal 1', 'hover 1', 'pressed 1', 'disabled 1']);
  assert.deepEqual(Object.keys(cardS.params), ['style', 'rarity', 'corner', 'border', 'lines', 'face', 'frame', 'glow']);
  assert.deepEqual([cardS.params.face.def, cardS.params.frame.def, cardS.params.glow.def], [P.plate, P.hull, P.cyan]);
  assert.deepEqual(cardS.sounds, { hover: [{ sound: 'tech-click', preset: 'Hover', frame: 0, volume: 0.6 }], pressed: [{ sound: 'tech-click', preset: 'Select', frame: 0, volume: 0.6 }] });
  assert.deepEqual([crossS.id, crossS.size, crossS.pivot], ['ui-crosshair', [32, 32], [16, 16]]);
  assert.deepEqual(clipList(crossS), ['idle 8 loop', 'shoot 4 once', 'reload 8 loop', 'hit 4 once']);
  assert.deepEqual(Object.keys(crossS.params), ['style', 'size', 'gap', 'thickness', 'spin', 'body', 'accent', 'speed']);
  assert.deepEqual([crossS.params.body.def, crossS.params.accent.def, crossS.clips.shoot.label], [P.cream, P.red, 'Firing']);
  for (const s of [hudS, barsS, cardS, crossS]) {
    const r = validateMeta(s.meta, 'sprite');
    assert.ok(r.ok, `${s.id}: ${r.errors.join('; ')}`);
    assert.deepEqual([s.meta.type, s.meta.view, s.meta.themes, s.meta.gameTypes[0]], ['ui', 'none', ['sci-fi', 'neutral'], 'roguelike-action']);
    for (const [k, d] of Object.entries(s.params)) if (d.kind === 'color') assert.equal(d.swatches[0], d.def, `${s.id}.${k} leads its swatches`);
  }
});

test('S20 bars: every strip fits the housing opening in every look, and the export says how to lengthen the bar', () => {
  for (const style of ['solid', 'segmented', 'slanted']) for (const border of [0, 0.5, 1]) for (const corner of [0, 1]) for (const ticks of [false, true]) {
    const look = { style, border, corner, ticks }, p = cleanParams(barsS, { ...defaultParams(barsS), ...look });
    const meta = renderSheet(barsS, p, 1).meta.animations, o = meta.frame.opening, housing = drawS(barsS, 'frame', look);
    assert.deepEqual(housing.bounds(), { x0: 1, y0: 1, x1: 62, y1: 14 });
    for (const clip of ['fill', 'fill-b', 'fill-c']) { assert.deepEqual(drawS(barsS, clip, look).bounds(), { x0: o.x, y0: o.y, x1: o.x + o.w - 1, y1: o.y + o.h - 1 }, `${clip} ${JSON.stringify(look)}`); assert.deepEqual(meta[clip].opening, o); }
    for (let x = o.x - 1; x <= o.x + o.w; x++) { assert.equal(housing.get(x, o.y - 1), col(INK)); assert.equal(housing.get(x, o.y + o.h), col(INK)); }
    if (style === 'solid' && !ticks) assert.deepEqual(meta.frame.border, { left: 16, bottom: 8, right: 16, top: 8 });
    else {
      // a pattern: no border, a tile; the columns one tile further on are the same picture, in the housing and in the strip
      assert.equal(meta.frame.border, undefined);
      const t = meta.frame.tile;
      assert.equal(t.w, style === 'solid' ? 8 : 7);
      for (const g of [housing, drawS(barsS, 'fill', look)]) for (let y = 0; y < 16; y++) for (let x = t.x; x < t.x + t.w; x++) assert.equal(g.get(x, y), g.get(x + t.w, y), `${JSON.stringify(look)}: column ${x} repeats`);
    }
  }
  const first = drawS(barsS, 'flash', {}, 0), last = drawS(barsS, 'flash', {}, 3);
  assert.deepEqual([...new Set(first.data)].filter(Boolean), [col('#ffffff')]);
  assert.equal(diff(last, drawS(barsS, 'fill')), 0);
});

test('S20 card: white text keeps 4.5 to 1 on the text area and the lit edge 3 to 1 against it, for every swatch, style and state, under every look', () => {
  for (const style of TECH_STYLES) for (const clip of Object.keys(cardS.clips)) for (const face of cardS.params.face.swatches) for (const glow of cardS.params.glow.swatches) for (const frame of [cardS.params.frame.swatches[0], cardS.params.frame.swatches[1]]) for (const [name, colour] of LOOKS) {
    const p = cleanParams(cardS, { ...defaultParams(cardS), style, face, frame, glow }), g = renderFrame(cardS, clip, 0, p), at = cardS.sockets(clip, 0, p);
    if (colour) applyColour(g.data, colour);
    const top = g.bounds().y0, faceNow = hexOf(g.get(at.text.x + 12, at.text.y + 12)), edgeNow = hexOf(g.get(32, top + 1));
    assert.ok(contrast('#ffffff', faceNow) >= 4.5, `${style} ${clip} face ${face} glow ${glow} under ${name}: white text ${contrast('#ffffff', faceNow).toFixed(2)}`);
    assert.ok(contrast(edgeNow, faceNow) >= 3, `${style} ${clip} face ${face} frame ${frame} glow ${glow} under ${name}: lit edge ${contrast(edgeNow, faceNow).toFixed(2)}`);
  }
});

test('S20 card: the states move as the specification says, the text area and icon square are clear, and the sockets follow', () => {
  const tops = Object.fromEntries(Object.keys(cardS.clips).map((c) => [c, drawS(cardS, c).bounds()]));
  assert.equal(tops.normal.y0 - tops.hover.y0, 2, 'hover lifts it 2 px');
  assert.equal(tops.pressed.y0 - tops.normal.y0, 2, 'pressed sinks it 2 px');
  for (const c of Object.keys(tops)) assert.equal(tops[c].y1, 94, `${c}: the bottom edge stays put`);
  for (const style of TECH_STYLES) for (const rarity of ['common', 'rare', 'epic']) for (const border of [0, 1]) for (const corner of [0, 1]) for (const clip of Object.keys(cardS.clips)) {
    const look = { style, rarity, border, corner }, p = cleanParams(cardS, { ...defaultParams(cardS), ...look }), g = renderFrame(cardS, clip, 0, p);
    const at = cardS.sockets(clip, 0, p), b = renderSheet(cardS, p, 1).meta.animations[clip].border;
    const text = g.get(at.text.x, at.text.y), well = g.get(at.icon.x, at.icon.y);
    for (let y = at.text.y; y < 96 - b.bottom; y++) for (let x = at.text.x; x < 64 - at.text.x; x++) assert.equal(g.get(x, y), text, `${JSON.stringify(look)} ${clip}: text area flat at ${x},${y}`);
    for (let y = at.icon.y - 16; y < at.icon.y + 16; y++) for (let x = at.icon.x - 16; x < at.icon.x + 16; x++) assert.equal(g.get(x, y), well, `${JSON.stringify(look)} ${clip}: icon square clear at ${x},${y}`);
    assert.equal(b.top, at.text.y);
    // what a game may stretch is the same all the way across (columns 24 to 39) and all the way down (the text rows)
    for (let y = 0; y < 96; y++) for (let x = b.left + 1; x < 64 - b.right; x++) assert.equal(g.get(x, y), g.get(b.left, y), `${JSON.stringify(look)} ${clip}: column ${x} at row ${y}`);
    for (let x = 0; x < 64; x++) for (let y = b.top + 1; y < 96 - b.bottom; y++) assert.equal(g.get(x, y), g.get(x, b.top), `${JSON.stringify(look)} ${clip}: row ${y} at column ${x}`);
  }
  const grey = drawS(cardS, 'disabled', { glow: P.red, face: cardS.params.face.swatches[2] });
  for (const v of new Set(grey.data)) { if (!v || v === col(INK)) continue; const [r, gg, bl] = [v & 255, (v >>> 8) & 255, (v >>> 16) & 255]; assert.ok(Math.max(r, gg, bl) - Math.min(r, gg, bl) <= 8, `disabled is grey: ${hexOf(v)}`); }
  assert.ok(diff(drawS(cardS, 'normal'), drawS(cardS, 'normal', { rarity: 'rare' })) > 40);
  assert.ok(diff(drawS(cardS, 'normal', { rarity: 'rare' }), drawS(cardS, 'normal', { rarity: 'epic' })) > 40);
});

test('S20 crosshair: drawn about the exact centre, which is its tip socket; it kicks 3 px, and every frame stays in the frame', () => {
  for (const style of ['cross', 'circle', 'brackets', 'chevrons']) for (const size of [0, 0.6, 1]) for (const gap of [0, 1]) for (const thickness of [0, 1]) {
    const look = { style, size, gap, thickness }, g = drawS(crossS, 'idle', look);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { assert.equal(g.get(x, y), g.get(31 - x, y), `${JSON.stringify(look)} mirrors left to right`); assert.equal(g.get(x, y), g.get(x, 31 - y)); assert.equal(g.get(x, y), g.get(y, x)); }
    for (const [clip, c] of Object.entries(crossS.clips)) for (const spin of [false, true]) for (let f = 0; f < c.frames; f++) {
      const b = drawS(crossS, clip, { ...look, spin }, f).bounds();
      assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${JSON.stringify(look)} ${clip} ${f}: ${JSON.stringify(b)}`);
    }
    const rest = drawS(crossS, 'idle', look).bounds(), kick = drawS(crossS, 'shoot', look, 0).bounds();
    assert.equal(rest.x0 - kick.x0, 3, `${JSON.stringify(look)}: the marks jump out 3 px`);
    assert.equal(diff(drawS(crossS, 'shoot', look, 3), g), 0, 'and end where they rest');
    assert.equal(diff(drawS(crossS, 'hit', look, 3), g), 0);
  }
  const p = defaultParams(crossS);
  for (const [clip, c] of Object.entries(crossS.clips)) for (let f = 0; f < c.frames; f++) assert.deepEqual(crossS.sockets(clip, f / c.frames, p), { tip: { x: 16, y: 16, angle: 0 } });
  assert.equal(drawS(crossS, 'idle').get(15, 15), col(P.red), 'the dot in the accent colour sits on the centre');
  assert.ok(count(drawS(crossS, 'hit', {}, 1), P.red) > 20, 'the hit marker is the accent colour');
  // the loop closes with spin on: the last step is no bigger than the others
  const steps = Array.from({ length: 8 }, (_, f) => diff(drawS(crossS, 'idle', { spin: true }, f), drawS(crossS, 'idle', { spin: true }, (f + 1) % 8)));
  assert.ok(steps[7] <= Math.max(...steps.slice(0, 7)) + 8 && steps.every((n) => n > 0), `steps ${steps}`);
});

test('S20 HUD marks: 12x12 with their ink line, full and empty pips share an outline, and health differs from shield by shape', () => {
  const ink = (g) => g.data.map((v) => (v ? 1 : 0));
  for (const shape of ['block', 'diamond', 'cell']) for (const bold of [false, true]) {
    const look = { shape, bold }, sil = (c) => ink(drawS(hudS, c, look));
    assert.deepEqual(sil('hp-half'), sil('hp-full'), `${shape}: hp-half`);
    assert.deepEqual(sil('hp-empty'), sil('hp-full'), `${shape}: hp-empty`);
    assert.deepEqual(sil('shield-empty'), sil('shield-full'), `${shape}: shield-empty`);
    for (const clip of Object.keys(hudS.clips)) {
      const b = drawS(hudS, clip, look).bounds();
      assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 14 && b.y1 <= 14, `${clip} ${JSON.stringify(look)}: ${JSON.stringify(b)}`);
      // every mark is 12x12 with its ink line (13 with the bold shadow); the keycard is an upright card, 2 px narrower
      assert.deepEqual([b.x1 - b.x0 + 1, b.y1 - b.y0 + 1], [(clip === 'key' ? 10 : 12) + (bold ? 1 : 0), 12 + (bold ? 1 : 0)], `${clip}: one size for every mark`);
    }
    // the same colour for both: the plus and the ring still tell them apart
    const same = { ...look, body: P.cyan, glow: P.cyan };
    assert.ok(diff(drawS(hudS, 'hp-full', same), drawS(hudS, 'shield-full', same)) >= 12, `${shape}: health against shield`);
  }
  const names = Object.keys(hudS.clips);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) assert.ok(diff(drawS(hudS, names[i]), drawS(hudS, names[j])) >= 12, `${names[i]} against ${names[j]}`);
});

// ---- fix round 1 -----------------------------------------------------------------------------------

test('S20 allIn and notIn: what shape tests share, and a shape test turned inside out', () => {
  const a = rectIn(2, 2, 6, 6), b = rectIn(5, 4, 6, 6), g = new Surface(12, 12);
  g.fill(0, 0, 12, 12, allIn(a, b), '#ffffff');
  assert.deepEqual(g.bounds(), { x0: 5, y0: 4, x1: 7, y1: 7 }, 'only the part inside both');
  assert.equal(lit(g), 12);
  const cut = new Surface(12, 12);
  cut.fill(0, 0, 12, 12, allIn(a, notIn(b)), '#ffffff');
  assert.equal(lit(cut), 36 - 12, 'one shape cut out of another');
  assert.equal(cut.get(5, 4), 0); assert.notEqual(cut.get(4, 4), 0); assert.notEqual(cut.get(5, 3), 0);
  assert.equal(allIn()(3, 3), true, 'with no tests every point is inside');
  assert.equal(allIn(a)(3.5, 3.5), true); assert.equal(allIn(a, b, notIn(a))(6, 6), false, 'any number of tests');
  assert.equal(notIn(a)(0.5, 0.5), true); assert.equal(notIn(notIn(a))(3.5, 3.5), true);
});

test('S20 reachOf: the nearest and the farthest covered pixel from a point, without drawing', () => {
  const ring = reachOf(ringIn(16, 16, 9, 2), 16, 16, 32);
  assert.ok(ring.near > 7 && ring.near < 7.6, `near ${ring.near}`);                  // the ring is 2 px wide: pixel middles from just over 7 px out
  assert.ok(ring.far > 8.5 && ring.far <= 9, `far ${ring.far}`);
  const bar = reachOf(rectIn(15, 2, 2, 6), 16, 16, 32);                              // rows 2 to 7 of the two middle columns
  assert.equal(bar.far, Math.hypot(0.5, 13.5)); assert.equal(bar.near, Math.hypot(0.5, 8.5));
  assert.deepEqual(reachOf([rectIn(15, 2, 2, 6), rectIn(20, 15, 4, 2)], 16, 16, 32), { near: Math.hypot(4.5, 0.5), far: Math.hypot(0.5, 13.5) }, 'a list is measured as one shape');
  assert.equal(reachOf(rectIn(40, 40, 2, 2), 16, 16, 32), null, 'nothing in the frame');
  assert.equal(reachOf(rectIn(0, 0, 4, 2), 0, 0, 4, 2).far, Math.hypot(3.5, 1.5), 'a frame that is not square');
});

test('S20 question mark: a hook, a slanting stem, a gap and a dot, at every size, known to markIn and drawMark by name', () => {
  assert.deepEqual([...SIGN_MARKS], ['question']);
  assert.equal(MARKS.includes('question'), false, 'the first list is unchanged'); assert.deepEqual([...LABEL_MARKS], ['cross', 'bolt']);
  const rows = (size) => { const n = (size - 1) / 2, f = markIn('question', n, n, size); return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => (f(x + 0.5, y + 0.5) ? '#' : '.')).join('')); };
  assert.deepEqual(rows(7), ['..###..', '.#...#.', '.....#.', '....#..', '...#...', '.......', '...#...'], 'at 7 px it is the classic 5x7 sign');
  assert.deepEqual(rows(5), ['.##..', '...#.', '..#..', '.....', '..#..']);
  for (const size of [5, 7, 9, 11, 13, 15]) {
    const r = rows(size), n = (size - 1) / 2, on = (y) => r[y].includes('#');
    assert.ok(on(0) && on(size - 1), `${size}: it fills its height`);
    const gap = r.findLastIndex((row) => !row.includes('#'));
    assert.ok(gap >= n && gap < size - 1 && on(gap - 1) && r.slice(gap + 1).every((row) => row.includes('#')), `${size}: one clear row between the stem and the dot\n${r.join('\n')}`);
    assert.ok(r.slice(0, gap).every((row) => row.includes('#')), `${size}: the hook and stem have no break`);
    assert.equal(r[size - 1].indexOf('#') + r[size - 1].lastIndexOf('#'), size - 1, `${size}: the dot sits on the middle column`);
    assert.ok(r[0].indexOf('#') >= 1 && r.every((row) => row[0] === '.' && row[size - 1] === '.'), `${size}: the hook is narrower than the box`);
    assert.ok(r[1].lastIndexOf('#') > n && r[gap - 1].lastIndexOf('#') <= n + 1, `${size}: the hook is on the right and the stem comes back to the middle`);
    // each row of the hook and stem touches the next (no orphan pixels)
    for (let y = 1; y < gap; y++) assert.ok([...r[y]].some((ch, x) => ch === '#' && [x - 1, x, x + 1].some((k) => r[y - 1][k] === '#')), `${size}: row ${y} joins the row above`);
    const e = markIn('exclaim', n, n, size); let differ = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if ((r[y][x] === '#') !== e(x + 0.5, y + 0.5)) differ++;
    assert.ok(differ >= (size === 5 ? 3 : 5), `${size}: it is not the exclamation mark (${differ} pixels differ)`);
  }
  const g = new Surface(16, 16); drawMark(g, 'question', 8, 8, 7, '#ffffff');
  assert.equal(lit(g), 9); assert.deepEqual(g.bounds(), { x0: 6, y0: 5, x1: 10, y1: 11 }, 'drawn round its centre pixel');
  const f = new Surface(16, 16); drawMark(f, 'question', 8, 8, 7, '#ffffff', { flip: true });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) assert.equal(!!f.get(x, y), !!g.get(16 - x, y), 'flip mirrors it');
});

// 8-connected groups of the pixels `is` accepts, each with the ink pixels on its four sides: [{ body: Set, all: Set }]
function groups(g, is) {
  const { w, h, data } = g, seen = new Uint8Array(w * h), ink = col(INK), out = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !is(data[i])) continue;
    const body = new Set(), stack = [i]; seen[i] = 1;
    while (stack.length) {
      const k = stack.pop(), x = k % w, y = (k / w) | 0; body.add(k);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy, j = Y * w + X; if (X >= 0 && Y >= 0 && X < w && Y < h && !seen[j] && is(data[j])) { seen[j] = 1; stack.push(j); } }
    }
    const all = new Set(body);
    for (const k of body) for (const d of [1, -1, w, -w]) if (data[k + d] === ink) all.add(k + d);
    out.push({ body, all });
  }
  return out;
}
// How far apart two sets of pixels are, counted in pixels along the longer way: 1 = they touch (a corner counts), 2 = one clear pixel between them
const apart = (A, B, w) => { let m = 99; for (const a of A) for (const b of B) m = Math.min(m, Math.max(Math.abs((a % w) - (b % w)), Math.abs(((a / w) | 0) - ((b / w) | 0)))); return m; };

test('S20 HUD, fix round 1: pips are built with the shared combinators, the unknown room shows the framework question mark, the credit has one closed ring', async () => {
  const { readFileSync } = await import('node:fs');
  const src = codeSpriteSource('ui-hud-roguelite');
  assert.ok(!/glyphGrid|QUERY|\.forEach\(\(row/.test(src) && !/'[.#]{3,}'/.test(src), 'no bitmap and no grid loop in the sprite');
  assert.ok(!/=>\s*\(px, py\)\s*=>\s*a\(px, py\)\s*&&/.test(src) && /allIn\(/.test(src) && /notIn\(/.test(src), 'no shape combinators of its own');
  // the question mark: every pixel of the 7 px mark, in the light tone of the Empty colour, and nothing else in that tone
  for (const bold of [true, false]) {
    const g = drawS(hudS, 'room-unknown', { bold }), light = col(ramp(P.hull).light), f = markIn('question', 8, 7, 7);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) assert.equal(g.get(x, y) === light, f(x + 0.5, y + 0.5), `bold ${bold}: ${x},${y}`);
    assert.equal(count(g, ramp(P.hull).light), 9);
    // the dot stands clear of the wall below it, on the dark floor
    assert.equal(g.get(8, 10), light); for (const [x, y] of [[7, 10], [9, 10], [8, 9], [8, 11], [7, 11], [9, 11]]) assert.equal(g.get(x, y), col(mix(INK, P.hull, 0.3)), `floor at ${x},${y}`);
  }
  // the credit: a ring of the dark tone, one closed loop, clear of every other dark pixel, round a flat middle
  for (const metal of hudS.params.metal.swatches) for (const shine of [true, false]) for (const bold of [true, false]) {
    const g = drawS(hudS, 'credit', { metal, shine, bold }), M = ramp(metal), dark = col(M.dark), tag = `${metal} shine ${shine} bold ${bold}`;
    const darks = groups(g, (v) => v === dark), ring = darks.find((c) => c.body.has(6 * 16 + 7));
    assert.ok(ring, `${tag}: a ring`);
    assert.equal(ring.body.size, 8, `${tag}: the ring is one pixel thick`);
    for (const k of ring.body) {
      let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && ring.body.has(k + dy * 16 + dx)) n++;
      assert.equal(n, 2, `${tag}: every ring pixel has exactly two neighbours in the ring, so it is one closed loop`);
    }
    for (const other of darks) if (other !== ring) assert.ok(apart(ring.body, other.body, 16) >= 2, `${tag}: a clear pixel between the ring and the shadow band`);
    for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) assert.equal(g.get(x, y), col(M.base), `${tag}: a flat middle`);
    // round the ring, only the base tone (and the glint): no stray pixel of another tone against it
    for (const k of ring.body) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = g.data[k + dy * 16 + dx]; assert.ok(v === dark || v === col(M.base), `${tag}: ${hexOf(v)} beside the ring`); }
  }
  // the small chip in the shop has no ring: its middle is flat
  for (const [x, y] of [[7, 6], [8, 6], [7, 7], [8, 7], [7, 8], [8, 8]]) assert.equal(drawS(hudS, 'room-shop').get(x, y), col(ramp(P.gold).base), `shop chip at ${x},${y}`);
});

test('S20 crosshair, fix round 1: neighbouring brackets and arrow heads never close up, arrow heads keep a notch, and the reload arc has a lane of its own', () => {
  const body = col(P.cream), dimmed = col(tone(P.cream, -1.4)), tail = col(tone(P.cream, -0.7)), dot = col(P.red);
  assert.ok(new Set([body, dimmed, tail]).size === 3, 'head, tail and dimmed marks are three values');
  const lum = (v) => 0.2126 * (v & 255) + 0.7152 * ((v >>> 8) & 255) + 0.0722 * ((v >>> 16) & 255);
  assert.ok(lum(body) - lum(tail) > 25 && lum(tail) - lum(dimmed) > 25, `head ${lum(body) | 0}, tail ${lum(tail) | 0}, marks ${lum(dimmed) | 0}`);
  const LOOKS4 = [{}, { size: 0, gap: 0, thickness: 0 }, { size: 1, gap: 1, thickness: 1 }];
  for (const size of [0, 0.3, 0.6, 1]) for (const gap of [0, 0.35, 0.7, 1]) for (const thickness of [0, 1]) LOOKS4.push({ size, gap, thickness });
  for (const style of ['cross', 'circle', 'brackets', 'chevrons']) for (const look of LOOKS4) {
    const over = { style, ...look }, tag = JSON.stringify(over);
    // 1. brackets and arrow heads: four separate marks with a clear pixel between the ink lines of any two, in every frame of every clip, spinning or not
    if (style === 'brackets' || style === 'chevrons') for (const spin of [false, true]) for (const [clip, c] of Object.entries(crossS.clips)) for (let f = 0; f < c.frames; f++) {
      if (clip === 'hit' && f < 3) continue;                                         // the hit ticks lie across the marks on purpose
      const marks = groups(drawS(crossS, clip, { ...over, spin }, f), (v) => v === (clip === 'reload' ? dimmed : body));
      assert.equal(marks.length, 4, `${tag} spin ${spin} ${clip} ${f}: four marks`);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(apart(marks[i].all, marks[j].all, 32) >= 2, `${tag} spin ${spin} ${clip} ${f}: two marks close up`);
    }
    // 2. arrow heads: the notch between the wings is 3 px deep inside the ink, on the axis, at rest
    if (style === 'chevrons') {
      const g = drawS(crossS, 'idle', over), top = groups(g, (v) => v === body).find((c) => [...c.body].some((k) => k % 32 === 15 && k < 15 * 32));
      const ys = [...top.body].map((k) => (k / 32) | 0), band = Math.min(...[...top.body].filter((k) => k % 32 === 15).map((k) => (k / 32) | 0));
      let clear = 0; for (let y = Math.min(...ys); y < band; y++) if (!g.get(15, y)) clear++;
      assert.ok(clear >= 3, `${tag}: the notch is ${clear} px deep`);
    }
    // 3. reload: one arc, a clear pixel between its ink line and that of every mark and of the dot, and nothing on the frame's edge
    for (let f = 0; f < 8; f++) {
      const g = drawS(crossS, 'reload', over, f), arc = groups(g, (v) => v === body || v === tail), marks = groups(g, (v) => v === dimmed);
      assert.equal(arc.length, 1, `${tag} reload ${f}: the arc is one piece`);
      assert.ok([...arc[0].body].some((k) => g.data[k] === body) && [...arc[0].body].some((k) => g.data[k] === tail), `${tag} reload ${f}: a head and a tail`);
      for (const m of marks) assert.ok(apart(arc[0].all, m.all, 32) >= 2, `${tag} reload ${f}: the arc touches a mark`);
      assert.ok(apart(arc[0].all, groups(g, (v) => v === dot)[0].all, 32) >= 2, `${tag} reload ${f}: the arc touches the dot`);
      const b = g.bounds(); assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${tag} reload ${f}: ${JSON.stringify(b)}`);
    }
    // the arc goes all the way round: its head is in a different quarter every two frames
    const heads = Array.from({ length: 8 }, (_, f) => { const g = drawS(crossS, 'reload', over, f); let sx = 0, sy = 0, n = 0; for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (g.get(x, y) === body) { sx += x - 15.5; sy += y - 15.5; n++; } return Math.atan2(sy / n, sx / n); });
    for (let f = 0; f < 8; f++) { const step = (((heads[(f + 1) % 8] - heads[f]) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); assert.ok(Math.abs(step - Math.PI / 4) < 0.2, `${tag}: the head steps an eighth of a turn clockwise each frame (${step.toFixed(2)})`); }
  }
});

// ---- fix round 2 ---------------------------------------------------------------

const { grownIn, strokeIn, cornerIn } = await import('../../engine/shapes.js');
const { inEffect } = await import('../../engine/sprite.js');
// the pixels a shape test covers in a 32x32 frame whose centre is (16, 16), as 'x,y' counted from that centre
const cells = (test, half = 16) => { const out = new Set(); for (let y = -half; y < half; y++) for (let x = -half; x < half; x++) if (test(x + 0.5, y + 0.5)) out.add(`${x},${y}`); return out; };
const perColumn = (set) => { const n = new Map(); for (const k of set) { const x = +k.split(',')[0]; n.set(x, (n.get(x) || 0) + 1); } return n; };
const perRow = (set) => { const n = new Map(); for (const k of set) { const y = +k.split(',')[1]; n.set(y, (n.get(y) || 0) + 1); } return n; };

test('S20 grownIn: a shape with a margin of whole pixels round it, corners included', () => {
  const dot = rectIn(0, 0, 1, 1);
  assert.equal(cells(grownIn(dot)).size, 9);
  assert.ok(cells(grownIn(dot)).has('-1,-1') && cells(grownIn(dot)).has('1,1'), 'the corners too');
  assert.equal(cells(grownIn(dot, 2)).size, 25);
  assert.deepEqual([...cells(grownIn(dot, 0))], ['0,0'], 'grown by nothing it is the shape');
  const bar = rectIn(-3, 2, 6, 2), grown = cells(grownIn(bar, 1));
  assert.equal(grown.size, 8 * 4);
  for (const k of cells(bar)) assert.ok(grown.has(k));
});

test('S20 strokeIn: equal steps that start full, and the same number of pixels in every column or row', () => {
  // level: a plain bar
  assert.deepEqual([...cells(strokeIn(2, 3, 5, 0, 2))].sort(), [...cells(rectIn(2, 3, 5, 2))].sort());
  assert.deepEqual([...cells(strokeIn(2, 3, -5, 0, 2, -1))].sort(), [...cells(rectIn(-2, 2, 5, 2))].sort(), 'running left, thickened upward');
  // one up for two along: runs of two from the first pixel, two pixels in every column
  const slant = cells(strokeIn(0, 0, 6, -3, 2));
  assert.deepEqual([...slant].sort(), ['0,0', '0,1', '1,0', '1,1', '2,-1', '2,0', '3,-1', '3,0', '4,-2', '4,-1', '5,-2', '5,-1'].sort());
  for (const [, n] of perColumn(slant)) assert.equal(n, 2);
  // steep: one pixel per row, thickened sideways
  const steep = cells(strokeIn(0, 0, -2, 6, 3, -1));
  assert.equal(perRow(steep).size, 6);
  for (const [, n] of perRow(steep)) assert.equal(n, 3);
  assert.ok(steep.has('0,0') && steep.has('-2,0') && steep.has('-1,3') && steep.has('-3,3') && !steep.has('1,0'), 'it steps left once every three rows and grows to the left');
  // one up for three along, written as an angle: the rounding of the slope never breaks a run
  const a = Math.atan(1 / 3), third = cells(strokeIn(0, 0, 9 * Math.cos(a), -9 * Math.sin(a), 1));
  assert.deepEqual([...third].map((k) => +k.split(',')[1]).sort((p, q) => p - q), [-2, -2, -2, -1, -1, -1, 0, 0, 0]);
  // a diagonal counts as level unless told otherwise; never fewer than one pixel
  assert.deepEqual([...cells(strokeIn(0, 0, 3, 3, 2))].sort(), ['0,0', '0,1', '1,1', '1,2', '2,2', '2,3'].sort());
  assert.deepEqual([...cells(strokeIn(0, 0, 3, 3, 2, 1, true))].sort(), ['0,0', '1,0', '1,1', '2,1', '2,2', '3,2'].sort());
  assert.equal(cells(strokeIn(4, 4, 0.2, 0, 1)).size, 1);
});

test('S20 cornerIn: an L and a V from two clean bars, the same piece at any turn', () => {
  // an upright L is the two rectangles
  const L = cells(cornerIn(8.5, -8.5, -5, 0, 0, 5, 2));
  assert.deepEqual([...L].sort(), [...cells((x, y) => rectIn(4, -9, 5, 2)(x, y) || rectIn(7, -9, 2, 5)(x, y))].sort());
  // a V whose tip falls between two pixels mirrors exactly, with a tip two pixels wide
  const V = cells(cornerIn(0, -4.5, 5, -5, -5, -5, Math.SQRT2));
  for (const k of V) { const [x, y] = k.split(',').map(Number); assert.ok(V.has(`${-x - 1},${y}`), `${k} has its mirror`); }
  assert.ok(V.has('0,-5') && V.has('-1,-5') && !V.has('0,-4'));
  for (const [, n] of perColumn(V)) assert.equal(n, 2, 'two pixels in every column of a slanted arm');
  assert.equal(perColumn(V).size, 10, 'five columns to each side');
  // the same V on its side keeps its sharp tip: the arms are thickened along the middle line of the corner
  const side = cells(cornerIn(4.5, 0, 5, -5, 5, 5, Math.SQRT2));
  for (const k of side) { const [x, y] = k.split(',').map(Number); assert.ok(side.has(`${x},${-y - 1}`)); assert.ok(V.has(`${y},${-x - 1}`), 'it is the first V turned a quarter'); }
  // turned an eighth, a V is an L with level and upright arms, thickness as asked
  const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4), turn = (x, y) => [x * c - y * s, x * s + y * c];
  const eighth = cells(cornerIn(...turn(0, -4.5), ...turn(5, -5), ...turn(-5, -5), 2));
  assert.deepEqual([...eighth].sort(), [...cells((x, y) => rectIn(3, -5, 7, 2)(x, y) || rectIn(3, -10, 2, 7)(x, y))].sort());
  // turned by one for two, the arms step evenly: every column of the flatter arm and every row of the steeper one holds the same count
  for (const thick of [2, 3]) for (const angle of [Math.atan(0.5), Math.atan(2), -Math.atan(0.5)]) {
    const c2 = Math.cos(angle), s2 = Math.sin(angle), t2 = (x, y) => [x * c2 - y * s2, x * s2 + y * c2];
    const [ax, ay] = t2(-24, 0), [bx, by] = t2(0, 24);
    const flat = Math.abs(ax) > Math.abs(ay) ? [ax, ay] : [bx, by], steep = Math.abs(ax) > Math.abs(ay) ? [bx, by] : [ax, ay];
    const piece = cells(cornerIn(...t2(4.5, -4.5), ax, ay, bx, by, thick), 40), tip = t2(4.5, -4.5).map(Math.floor);
    assert.ok(piece.has(`${tip[0]},${tip[1]}`), 'the tip pixel is the one the tip falls in');
    // away from the corner, in the columns and rows that only one arm passes through
    const cols = [...perColumn(piece)].filter(([x]) => Math.abs(x - tip[0]) > thick + Math.abs(steep[0]) + 1 && Math.sign(x - tip[0]) === Math.sign(flat[0])).map(([, n]) => n);
    const rows = [...perRow(piece)].filter(([y]) => Math.abs(y - tip[1]) > thick + Math.abs(flat[1]) + 1 && Math.sign(y - tip[1]) === Math.sign(steep[1])).map(([, n]) => n);
    assert.ok(cols.length >= 3 && rows.length >= 3);
    assert.ok(cols.every((n) => n === thick) && rows.every((n) => n === thick), `thick ${thick} at ${angle.toFixed(2)}: columns ${cols}, rows ${rows}`);
  }
  // a pixel count given outright is used at every slope
  for (const [, n] of perColumn(cells(cornerIn(0, -4.5, 5, -5, -5, -5, 2, 4)))) assert.equal(n, 4);
});

test('S20 crosshair, fix round 2: spinning arrow heads keep their shape, brackets do not spin, and the hit ticks never touch the marks', () => {
  const body = col(P.cream), white = col('#ffffff'), red = col(P.red);
  const LOOKS4 = [{}, { size: 0, gap: 0, thickness: 0 }, { size: 1, gap: 1, thickness: 1 }];
  for (const size of [0, 0.3, 0.6, 1]) for (const gap of [0, 0.35, 0.7, 1]) for (const thickness of [0, 1]) LOOKS4.push({ size, gap, thickness });
  // the largest solid square that fits in a mark: 2 for a clean bar of 2 or 3 px, more for a lump
  const lump = (g, mark) => { let t = 1; for (const k of mark.body) { const x = k % 32, y = (k / 32) | 0; for (let n = 2; n < 6; n++) { let ok = true; for (let dy = 0; dy < n && ok; dy++) for (let dx = 0; dx < n; dx++) if (g.get(x + dx, y + dy) !== body) { ok = false; break; } if (!ok) break; t = Math.max(t, n); } } return t; };
  // the two farthest pixels of an arrow head are its wing tips: that distance over root two is the length of a wing
  const wing = (mark) => { let far = 0; const px = [...mark.body]; for (const a of px) for (const b of px) far = Math.max(far, Math.hypot((a % 32) - (b % 32), ((a / 32) | 0) - ((b / 32) | 0))); return far / Math.SQRT2; };

  // 1. brackets: Spin is not offered, and switching it on changes no pixel
  assert.ok(inEffect(crossS, 'spin', cleanParams(crossS, { ...defaultParams(crossS), style: 'cross' })) && inEffect(crossS, 'spin', cleanParams(crossS, { ...defaultParams(crossS), style: 'chevrons' })));
  assert.ok(!inEffect(crossS, 'spin', cleanParams(crossS, { ...defaultParams(crossS), style: 'brackets' })), 'Spin is not in effect for brackets');
  for (const look of LOOKS4) for (const [clip, c] of Object.entries(crossS.clips)) for (let f = 0; f < c.frames; f++) assert.equal(diff(drawS(crossS, clip, { style: 'brackets', ...look, spin: true }, f), drawS(crossS, clip, { style: 'brackets', ...look }, f)), 0);

  // 2. arrow heads, spinning: in every frame four pieces, each the V of frame 0: no lump, wings within 1 px of their length at rest, and every frame differs from the one before
  for (const look of LOOKS4) {
    const over = { style: 'chevrons', ...look, spin: true }, tag = JSON.stringify(over), frames = Array.from({ length: 8 }, (_, f) => drawS(crossS, 'idle', over, f));
    const rest = groups(frames[0], (v) => v === body), lump0 = lump(frames[0], rest[0]), wing0 = wing(rest[0]);
    assert.deepEqual(frames[0].data, drawS(crossS, 'idle', { ...over, spin: false }).data, 'frame 0 is the cursor at rest');
    for (let f = 0; f < 8; f++) {
      const g = frames[f], marks = groups(g, (v) => v === body);
      assert.equal(marks.length, 4, `${tag} idle ${f}: four arrow heads`);
      for (const m of marks) {
        assert.ok(lump(g, m) <= lump0, `${tag} idle ${f}: a lump ${lump(g, m)} px square (at rest ${lump0})`);
        assert.ok(Math.abs(wing(m) - wing0) <= 1, `${tag} idle ${f}: wings ${wing(m).toFixed(1)} px, at rest ${wing0.toFixed(1)}`);
        assert.ok(m.body.size >= 0.75 * rest[0].body.size && m.body.size <= 1.3 * rest[0].body.size, `${tag} idle ${f}: ${m.body.size} px against ${rest[0].body.size}`);
      }
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) assert.equal(g.get(x, y), g.get(31 - x, 31 - y), `${tag} idle ${f}: the same turned half way round`);
      assert.ok(diff(g, frames[(f + 1) % 8]) > 0, `${tag} idle ${f}: the next frame moves`);
    }
    // thin wings stay two pixels thick at every turn: no column and no row of a wing is a single pixel between two ink lines
    if (!look.thickness) for (const f of [2, 4, 6]) {
      const g = frames[f]; let hair = 0;
      for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) if (g.get(x, y) === body && g.get(x - 1, y) !== body && g.get(x + 1, y) !== body && g.get(x, y - 1) !== body && g.get(x, y + 1) !== body) hair++;
      assert.equal(hair, 0, `${tag} idle ${f}: a pixel on its own`);
    }
  }

  // 3. hit: in the three frames with ticks, no tick pixel touches a mark pixel, corners included, so ink or an empty pixel lies between; the ticks are there, and whole
  for (const style of ['cross', 'circle', 'brackets', 'chevrons']) for (const look of LOOKS4) for (let f = 0; f < 3; f++) {
    const over = { style, ...look }, tag = `${JSON.stringify(over)} hit ${f}`, g = drawS(crossS, 'hit', over, f), tick = f === 0 ? white : red;
    let n = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (g.get(x, y) !== tick || (x >= 15 && x <= 16 && y >= 15 && y <= 16)) continue;          // the dot in the middle is the accent colour too
      n++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.notEqual(g.get(x + dx, y + dy), body, `${tag}: the tick at ${x},${y} touches a mark`);
    }
    assert.ok(n >= (f === 2 ? 16 : 36) && n % 4 === 0, `${tag}: ${n} tick pixels`);
    assert.equal(lit(drawS(crossS, 'hit', over, 3)) > 0 && groups(g, (v) => v === body).length >= 1, true);
    const b = g.bounds(); assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${tag}: ${JSON.stringify(b)}`);
    // the marks are whole: the same pixels as in the last frame, where there are no ticks
    const after = drawS(crossS, 'hit', over, 3);
    for (let i = 0; i < g.data.length; i++) if (after.data[i] === body) assert.equal(g.data[i], body, `${tag}: a tick lies over a mark`);
  }
  assert.equal(count(drawS(crossS, 'hit', {}, 0), '#ffffff'), 60, 'the flash is white');
  assert.equal(count(drawS(crossS, 'hit', {}, 0), P.red), 4, 'and only the dot is red in it');
});
