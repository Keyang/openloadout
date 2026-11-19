// engine/ui-skins.js (batch H2, bundles/specs/core-sprites-2.md "New helpers", H2): four interface skins
// (paper, candy, flat, gilded) and the small controls. The numbered tests follow the specification's
// "Test" paragraph for H2, item by item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { defineSprite, choice, color, range, toggle } from '../../engine/sprite.js';
import { PALETTE } from '../../engine/palettes.js';
import { INK, rgbToHex, brightness } from '../../engine/color.js';
import { contrastFaults, worstContrast, BUTTON_STATES } from '../../engine/ui.js';
import {
  UI_SKINS, SKIN_STYLES, SKIN_TEXT, skinTones, skinSwatches, skinPanel, skinButton, skinTab, skinTooltip,
  skinBarOpening, skinBarHousing, skinBarFill, skinSlider, skinKnob, skinCheck, skinRadio, skinSwitch, skinPointer, skinSelector,
} from '../../engine/ui-skins.js';

const c = (name) => { const [b, k] = name.includes('.') ? name.split('.') : ['thornwood', name]; return PALETTE[b][k]; };
const hexOf = (v) => rgbToHex(v & 255, (v >>> 8) & 255, (v >>> 16) & 255);
const colours = (g, r) => { const s = new Set(); for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) s.add(g.get(x, y)); return s; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const column = (g, x) => Array.from({ length: g.h }, (_, y) => g.get(x, y)).join(',');

// The four skins' colour lists, exactly as the skin headers of the specification give them.
const LISTS = {
  paper: { face: ['cream', 'hearthvale.wheat', 'skin', 'steel', 'goblin'], frame: ['cavern', 'soil', 'derelict.plate', 'hearthvale.bandit'], accent: ['crimson', 'ember', 'gold', 'magic', 'moss', 'hero'] },
  candy: { face: ['soil', 'cavern', 'hearthvale.bandit', 'derelict.plate'], frame: ['cream', 'skin', 'sky', 'goblin'], accent: ['magic', 'ember', 'steel', 'grass', 'moss'] },
  flat: { face: ['cavern', 'soil', 'derelict.plate', 'hearthvale.bandit'], frame: ['cream', 'sky', 'goblin', 'steel', 'skin'], accent: ['magic', 'ember', 'moss', 'grass', 'derelict.cyan'] },
  gilded: { face: ['cavern', 'soil', 'derelict.plate', 'hearthvale.bandit'], frame: ['cream', 'steel', 'skin', 'hearthvale.thunder', 'hearthvale.wheat'], accent: ['magic', 'crimson', 'moss', 'hero', 'ember'] },
};
const HEX = Object.fromEntries(Object.entries(LISTS).map(([k, l]) => [k, { face: l.face.map(c), frame: l.frame.map(c), accent: l.accent.map(c) }]));
const base = (skin) => ({ face: HEX[skin].face[0], frame: HEX[skin].frame[0], accent: HEX[skin].accent[0] });

test('the lists: four skins, three styles each, the text colour each is made for', () => {
  assert.deepEqual([...UI_SKINS], ['paper', 'candy', 'flat', 'gilded']);
  assert.deepEqual(SKIN_STYLES, { paper: ['sheet', 'torn', 'card'], candy: ['jelly', 'striped', 'frosted'], flat: ['solid', 'outline', 'pill'], gilded: ['temple', 'royal', 'ruin'] });
  assert.equal(SKIN_TEXT.paper, INK);
  for (const s of ['candy', 'flat', 'gilded']) assert.equal(SKIN_TEXT[s], '#ffffff');
  assert.ok(Object.isFrozen(UI_SKINS) && Object.isFrozen(SKIN_STYLES) && Object.isFrozen(SKIN_TEXT));
  assert.throws(() => skinTones('neon'), /not one of/);
  assert.throws(() => skinPanel(new Surface(32, 32), 1, 1, 30, 30, 'paper', { style: 'jelly' }), /not one of/);
});

test('(1) a panel: inner is one colour, it stretches sideways, its slice is at most 7', () => {
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const border of [0, 0.5, 1]) for (const corner of [0, 0.5, 1]) for (const shadow of [false, true]) for (const extras of [false, true]) for (const inset of [false, true]) {
    const opt = { ...base(skin), style, border, corner, shadow, extras, inset };
    const at = `${skin} ${style} border ${border} corner ${corner} shadow ${shadow} extras ${extras} inset ${inset}`;
    const a = new Surface(96, 64), b = new Surface(160, 64);
    const ra = skinPanel(a, 1, 1, 94, 62, skin, opt), rb = skinPanel(b, 1, 1, 158, 62, skin, opt);
    assert.equal(colours(a, ra.inner).size, 1, `${at}: inner is not one colour`);
    assert.ok(!colours(a, ra.inner).has(0), `${at}: inner has an empty pixel`);
    for (const k of ['left', 'top', 'right', 'bottom']) assert.ok(ra.slice[k] <= 7 && ra.slice[k] >= 1, `${at}: slice ${k} ${ra.slice[k]}`);
    assert.deepEqual(ra.slice, rb.slice, `${at}: the slice changed with the width`);
    // every column between the slices is the same, and the wide one is the narrow one with that column repeated
    const mid = column(a, 1 + ra.slice.left);
    for (let x = 1 + ra.slice.left; x < 95 - ra.slice.right; x++) assert.equal(column(a, x), mid, `${at}: column ${x} differs from the middle`);
    for (let x = 1 + rb.slice.left; x < 159 - rb.slice.right; x++) assert.equal(column(b, x), mid, `${at}: wide column ${x} differs`);
    for (let x = 0; x < 1 + ra.slice.left; x++) assert.equal(column(b, x), column(a, x), `${at}: left edge column ${x}`);
    for (let x = 0; x < 1 + ra.slice.right; x++) assert.equal(column(b, 159 - x), column(a, 95 - x), `${at}: right edge column ${x}`);
    // nothing on the frame's empty border
    for (let x = 0; x < 96; x++) assert.ok(!a.get(x, 0) && !a.get(x, 63), `${at}: drew on the frame's border`);
  }
});

test('(1b) a panel with a heading: the title strip is one colour, inner below it', () => {
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const border of [0, 1]) {
    const g = new Surface(96, 64);
    const r = skinPanel(g, 1, 1, 94, 62, skin, { ...base(skin), style, border, title: 10, extras: true });
    assert.ok(r.title && r.title.h === 10, `${skin} ${style}: title`);
    assert.equal(colours(g, r.title).size, 1, `${skin} ${style}: title strip not one colour`);
    assert.equal(colours(g, r.inner).size, 1, `${skin} ${style}: inner not one colour`);
    assert.ok(r.inner.y > r.title.y + r.title.h, `${skin} ${style}: inner starts below the strip's line`);
    assert.equal(r.slice.top, r.inner.y - 1);
  }
});

test('(2) a button: pressed puts text 2 px lower, hover is lighter and keeps 4.5 to 1, disabled is grey, text is 78x18', () => {
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const border of [0, 0.5, 1]) for (const shadow of [false, true]) {
    const at = `${skin} ${style} border ${border} shadow ${shadow}`;
    const out = {};
    for (const state of BUTTON_STATES) {
      const g = new Surface(96, 32);
      out[state] = { g, r: skinButton(g, 1, 1, 94, 30, state, skin, { ...base(skin), style, border, shadow, extras: true, shine: true }) };
      const { text } = out[state].r;
      assert.equal(text.w, 78, `${at} ${state}: text width`);
      assert.equal(text.h, 18, `${at} ${state}: text height`);
      assert.equal(text.x, 9, `${at} ${state}: text x`);
      assert.equal(colours(g, text).size, 1, `${at} ${state}: text area is not one colour`);
    }
    assert.equal(out.pressed.r.text.y, out.normal.r.text.y + 2, `${at}: pressed text`);
    assert.equal(out.normal.r.text.y, 6, `${at}: normal text y`);
    const faceOf = (s) => hexOf(out[s].g.get(out[s].r.text.x, out[s].r.text.y));
    assert.ok(brightness(faceOf('hover')) > brightness(faceOf('normal')), `${at}: hover is not lighter`);
    for (const v of out.disabled.g.data) if (v) { const [r, gg, b] = [v & 255, (v >>> 8) & 255, (v >>> 16) & 255]; assert.ok(r === gg && gg === b, `${at}: disabled has a coloured pixel ${hexOf(v)}`); }
  }
  // hover keeps the text readable on every face of every skin's list
  for (const skin of UI_SKINS) for (const face of HEX[skin].face) {
    const g = new Surface(96, 32);
    const { text } = skinButton(g, 1, 1, 94, 30, 'hover', skin, { ...base(skin), face });
    const tc = hexOf(g.get(text.x, text.y));
    assert.ok(worstContrast(SKIN_TEXT[skin], tc) >= 4.5, `${skin} hover on ${face}: ${worstContrast(SKIN_TEXT[skin], tc).toFixed(2)}`);
    if (skin !== 'paper') assert.ok(worstContrast('#ffffff', tc) >= 5.0, `${skin} hover on ${face}: under 5.0`);
  }
});

// Draws a 30 px tall piece at 94 and 158 wide (96x32 and 160x32 frames) and lists every way its `slice` does not
// hold: the middle columns are not one column, the middle rows not one row, the edges differ between the widths,
// the slice changes with the width, or something lies on the frame's empty border.
function sliceFaults(draw) {
  const a = new Surface(96, 32), b = new Surface(160, 32);
  const ra = draw(a, 94), rb = draw(b, 158);
  const row = (g, y) => Array.from({ length: g.w }, (_, x) => g.get(x, y)).join(',');
  const f = [];
  if (JSON.stringify(ra.slice) !== JSON.stringify(rb.slice)) f.push(`slice ${JSON.stringify(ra.slice)} then ${JSON.stringify(rb.slice)}`);
  const s = ra.slice, L = 1 + s.left, T = 1 + s.top, B = 31 - s.bottom;
  if (!(L < 95 - s.right)) f.push('no middle column');
  const mid = column(a, L);
  for (let x = L; x < 95 - s.right; x++) if (column(a, x) !== mid) { f.push(`column ${x}`); break; }
  for (let x = L; x < 159 - s.right; x++) if (column(b, x) !== mid) { f.push(`wide column ${x}`); break; }
  for (let x = 0; x < L; x++) if (column(a, x) !== column(b, x)) { f.push(`left edge column ${x}`); break; }
  for (let x = 0; x < 1 + s.right; x++) if (column(a, 95 - x) !== column(b, 159 - x)) { f.push(`right edge column ${x}`); break; }
  for (const g of [a, b]) for (let y = T; y < B; y++) if (row(g, y) !== row(g, T)) { f.push(`${g.w} wide: row ${y}`); break; }
  for (const g of [a, b]) { const bb = g.bounds(); if (bb && (bb.x0 < 1 || bb.y0 < 1 || bb.x1 > g.w - 2 || bb.y1 > 30)) f.push(`${g.w} wide: drew on the frame's border`); }
  return f;
}

test('(2b) a button and a tab nine-slice with the slice they return, in every look, state and option', () => {
  const faults = [];
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const border of [0, 0.5, 1]) for (const corner of [0, 0.5, 1]) for (const shadow of [false, true]) for (const extras of [false, true]) for (const shine of [false, true]) {
    const opt = { ...base(skin), style, border, corner, shadow, extras, shine };
    const at = `${skin} ${style} border ${border} corner ${corner} shadow ${shadow} extras ${extras} shine ${shine}`;
    for (const state of BUTTON_STATES) {
      const f = sliceFaults((g, w) => skinButton(g, 1, 1, w, 30, state, skin, opt));
      if (f.length) faults.push(`${at} button ${state}: ${f.join(', ')}`);
    }
    for (const active of [true, false]) {
      const f = sliceFaults((g, w) => skinTab(g, 1, 1, w, 30, active, skin, opt));
      if (f.length) faults.push(`${at} tab ${active ? 'active' : 'inactive'}: ${f.join(', ')}`);
    }
  }
  assert.deepEqual(faults.slice(0, 8), [], `${faults.length} faults`);
  // every look but the pill keeps to SLICE: 7 a side (8 with the frame), pressed top 8 and bottom 5
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const shadow of [false, true]) {
    if (skin === 'flat' && style === 'pill') continue;
    const g = new Surface(96, 32);
    assert.deepEqual(skinButton(g, 1, 1, 94, 30, 'normal', skin, { style, shadow }).slice, { left: 7, top: 7, right: 7, bottom: 7 }, `${skin} ${style}`);
    assert.deepEqual(skinButton(g, 1, 1, 94, 30, 'pressed', skin, { style, shadow }).slice, { left: 7, top: 8, right: 7, bottom: 5 }, `${skin} ${style} pressed`);
  }
});

test('(3) a tab: active is 2 px taller than inactive and joins a panel of the same face with no ink across', () => {
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const border of [0, 0.5, 1]) {
    const at = `${skin} ${style} border ${border}`, opt = { ...base(skin), style, border };
    const on = new Surface(96, 32), off = new Surface(96, 32);
    const ra = skinTab(on, 1, 1, 94, 30, true, skin, opt), ri = skinTab(off, 1, 1, 94, 30, false, skin, opt);
    const height = (g) => { const b = g.bounds(); return b ? b.y1 - b.y0 + 1 : 0; };
    assert.equal(height(on), height(off) + 2, `${at}: heights ${height(on)} and ${height(off)}`);
    assert.equal(colours(on, ra.text).size, 1, `${at}: active text`);
    assert.equal(colours(off, ri.text).size, 1, `${at}: inactive text`);
    // over a panel of the same face, its bottom row on the panel's first row of face
    const g = new Surface(120, 80);
    const p = skinPanel(g, 1, 30, 118, 49, skin, opt);
    // the panel's first row of face, found by walking down its middle column
    // the panel's first row of face: the top of the run of face that reaches down to inner
    const faceAt = g.get(p.inner.x, p.inner.y);
    let joinY = p.inner.y;
    while (g.get(60, joinY - 1) === faceAt) joinY--;
    assert.equal(p.join, joinY, `${at}: join is the panel's first row of plain face`);
    const tx = 20, tw = 50, th = 24;
    const t = skinTab(g, tx, joinY - th + 1, tw, th, true, skin, opt);
    const faceC = g.get(p.inner.x, p.inner.y);
    for (let x = t.text.x; x < t.text.x + t.text.w; x++) assert.equal(g.get(x, joinY), faceC, `${at}: join row at ${x}`);
    // no ink line runs across the join: at most the tab's own two inner side lines
    let inkAcross = 0;
    for (let x = tx + 1; x < tx + tw - 1; x++) if (hexOf(g.get(x, joinY)) === INK) inkAcross++;
    assert.ok(inkAcross <= 2, `${at}: ${inkAcross} ink pixels across the join`);
  }
});

test('(4) bars: the housing returns skinBarOpening, a full fill covers the opening exactly', () => {
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const border of [0, 0.5, 1]) for (const corner of [0, 0.5, 1]) for (const caps of [0, 4]) {
    const at = `${skin} ${style} border ${border} corner ${corner} caps ${caps}`;
    const g = new Surface(64, 16);
    const o = skinBarHousing(g, 1, 1, 62, 14, skin, { style, frame: HEX[skin].frame[0], accent: HEX[skin].accent[0], border, corner, caps, extras: true, notches: true });
    assert.deepEqual(o, skinBarOpening(1, 1, 62, 14, skin, { border, corner, caps }), at);
    assert.ok(o.w > 20 && o.h >= 2, `${at}: opening ${JSON.stringify(o)}`);
    // without notches it stretches sideways with a slice of opening.x - x + 1 at each end
    const plain = new Surface(64, 16), wide = new Surface(128, 16), sl = o.x - 1 + 1;
    skinBarHousing(plain, 1, 1, 62, 14, skin, { style, frame: HEX[skin].frame[0], accent: HEX[skin].accent[0], border, corner, caps, extras: true });
    skinBarHousing(wide, 1, 1, 126, 14, skin, { style, frame: HEX[skin].frame[0], accent: HEX[skin].accent[0], border, corner, caps, extras: true });
    const mid = column(plain, 1 + sl);
    for (let x = 1 + sl; x < 63 - sl; x++) assert.equal(column(plain, x), mid, `${at}: housing column ${x}`);
    for (let x = 1 + sl; x < 127 - sl; x++) assert.equal(column(wide, x), mid, `${at}: wide housing column ${x}`);
    for (let x = 0; x < 1 + sl; x++) assert.equal(column(wide, 127 - x), column(plain, 63 - x), `${at}: housing right end ${x}`);
    for (const opt of [{ hatch: true }, { shine: true }, { shine: false }, { flash: 0.5 }]) {
      const f = new Surface(64, 16);
      skinBarFill(f, o, 1, skin, { fill: c('grass'), ...opt });
      for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) {
        const inside = x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;
        assert.equal(!!f.get(x, y), inside, `${at} ${JSON.stringify(opt)}: pixel ${x},${y}`);
      }
      const half = new Surface(64, 16);
      skinBarFill(half, o, 0.5, skin, { fill: c('grass'), ...opt });
      assert.ok(count(half) < count(f) && count(half) > 0, `${at}: half fill`);
    }
  }
  // the extras: paper hatching, candy shine, a gilded gold line each change the strip
  const o = skinBarOpening(1, 1, 62, 14, 'paper', {});
  const strip = (skin, opt) => { const g = new Surface(64, 16); skinBarFill(g, o, 1, skin, { fill: c('grass'), ...opt }); return g; };
  assert.ok(diff(strip('paper', { hatch: true }), strip('paper', { hatch: false })) >= 12, 'hatching');
  assert.ok(diff(strip('candy', { shine: true }), strip('candy', { shine: false })) >= 12, 'candy shine');
  assert.ok(diff(strip('gilded', {}), strip('flat', {})) >= 12, 'gilded gold line');
});

test('(5) checkbox, radio and switch: on and off differ by 12 px or more and share their outline', () => {
  const ring = (g) => { const out = new Set(); for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { if (!g.get(x, y)) continue; if (!g.get(x - 1, y) || !g.get(x + 1, y) || !g.get(x, y - 1) || !g.get(x, y + 1)) out.add(`${x},${y},${g.get(x, y)}`); } return [...out].sort().join(' '); };
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const border of [0, 1]) {
    const opt = { ...base(skin), style, border };
    for (const [name, draw] of [
      ['check', (g, on) => skinCheck(g, 16, 16, 20, on, skin, opt)],
      ['radio', (g, on) => skinRadio(g, 16, 16, 20, on, skin, opt)],
      ['switch', (g, on) => skinSwitch(g, 2, 8, 28, 16, on, skin, opt)],
    ]) {
      const a = new Surface(32, 32), b = new Surface(32, 32);
      const ra = draw(a, true), rb = draw(b, false);
      assert.ok(diff(a, b) >= 12, `${skin} ${style} ${name}: on and off differ by ${diff(a, b)}`);
      assert.equal(ring(a), ring(b), `${skin} ${style} ${name}: the outline changed`);
      assert.ok(ra && rb, name);
    }
    const g = new Surface(32, 32);
    const { box } = skinCheck(g, 16, 16, 20, true, skin, opt);
    assert.deepEqual(box, { x: 6, y: 6, w: 20, h: 20 });
    const bb = g.bounds();
    assert.ok(bb.x0 >= 6 && bb.y0 >= 6 && bb.x1 <= 25 && bb.y1 <= 25, `${skin} ${style}: checkbox outside its box`);
  }
});

test('(6) the pointer\'s tip is its outermost pixel; the selector loops', () => {
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const bob of [0, 1, 2]) {
    const g = new Surface(32, 32);
    const { tip } = skinPointer(g, 4, 16, 20, skin, { ...base(skin), style, bob });
    assert.ok(g.get(tip.x, tip.y), `${skin} ${style}: nothing at the tip`);
    const bb = g.bounds();
    assert.equal(bb.x1, tip.x, `${skin} ${style} bob ${bob}: the tip is not the rightmost pixel`);
    for (let y = 0; y < 32; y++) if (y !== tip.y) assert.ok(!g.get(tip.x, y), `${skin} ${style}: another pixel in the tip's column`);
    // exactly `size` px of ink from the tail's end at x (moved by bob) to the tip
    assert.equal(bb.x1 - bb.x0 + 1, 20, `${skin} ${style} bob ${bob}: length ${bb.x1 - bb.x0 + 1}`);
    assert.equal(bb.x0, 4 + bob, `${skin} ${style} bob ${bob}: the tail does not end at x`);
  }
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) for (const size of [12, 16, 24, 28]) {
    const g = new Surface(40, 32);
    const { tip } = skinPointer(g, 4, 16, size, skin, { ...base(skin), style });
    const bb = g.bounds();
    assert.equal(bb.x1 - bb.x0 + 1, size, `${skin} ${style} size ${size}: length ${bb.x1 - bb.x0 + 1}`);
    assert.equal(tip.x, bb.x1, `${skin} ${style} size ${size}: the tip`);
  }
  // it moves towards its tip
  const a = new Surface(32, 32), b = new Surface(32, 32);
  assert.equal(skinPointer(b, 4, 16, 20, 'flat', { ...base('flat'), bob: 2 }).tip.x - skinPointer(a, 4, 16, 20, 'flat', base('flat')).tip.x, 2);
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) {
    const at0 = new Surface(32, 32), at1 = new Surface(32, 32), mid = new Surface(32, 32);
    const r = skinSelector(at0, 1, 1, 30, 30, 0, skin, { ...base(skin), style });
    skinSelector(at1, 1, 1, 30, 30, 1, skin, { ...base(skin), style });
    skinSelector(mid, 1, 1, 30, 30, 0.5, skin, { ...base(skin), style });
    assert.equal(diff(at0, at1), 0, `${skin} ${style}: t 0 and 1 differ`);
    assert.ok(diff(at0, mid) > 0, `${skin} ${style}: the brackets do not move`);
    for (const k of ['left', 'top', 'right', 'bottom']) assert.ok(r.slice[k] <= 7, `${skin} ${style}: selector slice`);
    // the middle is empty: brackets only in the corners
    for (let y = 9; y < 23; y++) for (let x = 9; x < 23; x++) assert.ok(!at0.get(x, y) && !mid.get(x, y), `${skin} ${style}: selector middle`);
  }
});

test('(7) skinSwatches keeps every colour of the specification\'s lists, in order', () => {
  for (const skin of UI_SKINS) {
    const r = skinSwatches(skin, HEX[skin]);
    assert.deepEqual(r.failing, [], `${skin}: ${JSON.stringify(r.failing)}`);
    assert.deepEqual(r.dropped, [], `${skin}: ${JSON.stringify(r.dropped)}`);
    assert.deepEqual(r.face, HEX[skin].face);
    assert.deepEqual(r.frame, HEX[skin].frame);
    assert.deepEqual(r.accent, HEX[skin].accent);
  }
});

test('(7b) skinSwatches drops a failing candidate, says so, and never returns a colour it was not given', () => {
  const given = { face: [...HEX.candy.face, c('crimson')], frame: [...HEX.candy.frame, c('gold')], accent: [...HEX.candy.accent, c('soil')] };
  const r = skinSwatches('candy', given);
  assert.ok(!r.face.includes(c('crimson')));
  assert.ok(r.dropped.some((d) => d.list === 'face' && d.colour === c('crimson') && d.ratio < 4.5));
  assert.ok(!r.accent.includes(c('soil')), 'an accent that is also a face is dropped');
  assert.ok(r.dropped.some((d) => d.list === 'accent' && d.colour === c('soil')));
  const g = skinSwatches('gilded', { face: [...HEX.gilded.face, c('slate')], frame: [c('gold'), ...HEX.gilded.frame.slice(1)] });
  assert.ok(g.failing.some((f) => f.rule === 'frame'), 'a failing default is named, and kept');
  assert.equal(g.frame[0], c('gold'));
  // thornwood.gold as a frame candidate (not the default) on a slate face: dropped, with its ratio
  const gs = skinSwatches('gilded', { face: [c('cavern'), c('slate')], frame: [c('cream'), c('gold')] });
  assert.deepEqual(gs.face, [c('cavern'), c('slate')]);
  assert.deepEqual(gs.frame, [c('cream')]);
  assert.deepEqual(gs.failing, []);
  assert.deepEqual(gs.dropped, [{ list: 'frame', colour: c('gold'), ratio: 1.96 }]);
  for (const res of [r, g]) for (const list of ['face', 'frame', 'accent']) for (const col of res[list]) assert.ok([...(given[list] ?? []), ...HEX.gilded[list], c('slate'), c('gold')].includes(col), `${col} was not given`);
  // paper: a frame lighter than a face is dropped
  const p = skinSwatches('paper', { face: HEX.paper.face, frame: [...HEX.paper.frame, c('sky')] });
  assert.ok(!p.frame.includes(c('sky')));
});

test('skinTones: hover lightens white-text faces by at most tone 0.1, disabled has no colour', () => {
  for (const skin of UI_SKINS) {
    const n = skinTones(skin, base(skin)), h = skinTones(skin, { ...base(skin), state: 'hover' }), d = skinTones(skin, { ...base(skin), state: 'disabled' });
    for (const k of ['face', 'faceLight', 'faceDark', 'band', 'bandLight', 'bandDark', 'lip', 'trough', 'accent', 'accentDark', 'text']) assert.match(n[k], /^#[0-9a-f]{6}$/i, `${skin} ${k}`);
    assert.ok(brightness(h.face) > brightness(n.face));
    if (skin !== 'paper') assert.ok(worstContrast('#ffffff', h.face) >= 5.0);
    for (const k of ['face', 'band', 'bandLight', 'lip', 'trough']) { const [r, g, b] = [1, 3, 5].map((i) => d[k].slice(i, i + 2)); assert.ok(r === g && g === b, `${skin} disabled ${k} ${d[k]}`); }
  }
  // defaults are the first colour of each skin's lists
  assert.equal(skinTones('paper').face, c('cream'));
  assert.equal(skinTones('candy').face, c('soil'));
  assert.equal(skinTones('paper').trough, c('cream'));
});

test('tooltip, slider and knob stay in their boxes', () => {
  for (const skin of UI_SKINS) for (const style of SKIN_STYLES[skin]) {
    const opt = { ...base(skin), style };
    const g = new Surface(96, 64);
    const t = skinTooltip(g, 1, 1, 94, 40, skin, opt);
    assert.deepEqual(t.rect, { x: 1, y: 1, w: 94, h: 40 });
    assert.equal(colours(g, t.inner).size, 1, `${skin} ${style}: tooltip inner`);
    const bb = g.bounds();
    assert.ok(bb.x0 >= 1 && bb.y0 >= 1 && bb.x1 <= 94 && bb.y1 <= 40, `${skin} ${style}: tooltip box`);
    // the tail: something drawn below the body, only in the left 8 px
    for (let y = 36; y <= 40; y++) for (let x = 9; x < 95; x++) assert.ok(!g.get(x, y), `${skin} ${style}: tail at ${x},${y}`);
    assert.ok([...Array(5)].some((_, i) => g.get(4, 37 + i)), `${skin} ${style}: no tail`);
    const s = new Surface(64, 16);
    const { rail } = skinSlider(s, 1, 1, 62, 14, skin, opt);
    assert.ok(rail.h >= 4 && rail.h <= 6, `${skin} ${style}: rail ${rail.h}`);
    const sb = s.bounds();
    assert.ok(sb.y0 >= rail.y && sb.y1 < rail.y + rail.h && sb.x0 >= 1 && sb.x1 <= 62);
    const k = new Surface(32, 32);
    const { rect } = skinKnob(k, 16, 16, 12, skin, opt);
    assert.deepEqual([rect.w, rect.h], [12, 14]);
    const kb = k.bounds();
    assert.deepEqual([kb.x0, kb.y0, kb.x1 - kb.x0 + 1, kb.y1 - kb.y0 + 1], [rect.x, rect.y, rect.w, rect.h], `${skin} ${style}: knob`);
  }
});

test('same arguments, same pixels', () => {
  for (const skin of UI_SKINS) {
    const a = new Surface(96, 64), b = new Surface(96, 64);
    for (const g of [a, b]) skinPanel(g, 1, 1, 94, 62, skin, { ...base(skin), style: SKIN_STYLES[skin][2], extras: true, title: 9 });
    assert.equal(diff(a, b), 0);
  }
});

// (8) A small sprite per skin, built the way the kit sprites will be: a button (with hover, pressed and disabled),
// an inset panel, a panel with a heading and both tabs, each with its text area and the edge pixel the helper names.
// contrastFaults checks every face with every frame, every style and every accent, as made and under every look.
function fixture(skin) {
  const paint = (g, clip, p) => {
    const opt = { style: p.style, border: p.border, corner: p.corner, extras: p.extras, face: p.face, frame: p.frame, accent: p.accent };
    if (BUTTON_STATES.includes(clip)) return skinButton(g, 1, 1, 94, 30, clip, skin, opt);
    if (clip === 'tab' || clip === 'tab-active') return skinTab(g, 1, 1, 94, 30, clip === 'tab-active', skin, opt);
    return skinPanel(g, 1, 1, 94, 62, skin, { ...opt, inset: clip === 'inset', title: clip === 'panel-title' ? 10 : 0 });
  };
  return defineSprite({
    id: `fixture-${skin}`, name: `Fixture ${skin}`, size: [96, 64], pivot: [48, 32],
    meta: { type: 'ui' },
    params: {
      style: choice('Style', SKIN_STYLES[skin][0], SKIN_STYLES[skin]),
      border: range('Border', 0.5),
      corner: range('Corner', 0.5),
      extras: toggle('Extras', true),
      face: color('Face', HEX[skin].face[0], HEX[skin].face),
      frame: color('Frame', HEX[skin].frame[0], HEX[skin].frame),
      accent: color('Accent', HEX[skin].accent[0], HEX[skin].accent),
    },
    clips: Object.fromEntries(['normal', 'hover', 'pressed', 'disabled', 'tab', 'tab-active', 'panel', 'panel-title', 'inset'].map((k) => [k, { frames: 1, fps: 8 }])),
    textArea(clip, p) {
      const r = paint(new Surface(96, 64), clip, p);
      const area = (a) => ({ x: a.x, y: a.y, w: a.w, h: a.h, text: SKIN_TEXT[skin], edge: r.edge });
      return r.title ? [area(r.inner), area(r.title)] : area(r.text ?? r.inner);
    },
    render(g, { clip, p }) { paint(g, clip, p); },
  });
}

for (const skin of UI_SKINS) {
  test(`(8) ${skin}: a fixture sprite has no contrast faults for any face of the list`, () => {
    const faults = contrastFaults(fixture(skin));
    assert.deepEqual(faults, [], faults.slice(0, 8).join('\n'));
  });
}
