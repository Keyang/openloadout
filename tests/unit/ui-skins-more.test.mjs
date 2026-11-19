// engine/ui-skins-more.js (batch H5b, bundles/specs/core-sprites-3.md): neon, crystal and grove drawn over `flat`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { contrastFaults, desaturate, LIP } from '../../engine/ui.js';
import { defineSprite, choice, color, toggle, range } from '../../engine/sprite.js';
import {
  skinButton, skinTab, skinPanel, skinTooltip, skinBarHousing, skinSlider, skinKnob, skinCheck, skinRadio, skinSwitch, skinSelector,
  skinSwatches, SKIN_TEXT,
} from '../../engine/ui-skins.js';
import { roundSlab } from '../../engine/ui-candy-slab.js';
import { MORE_SKINS, MORE_SKIN_STYLES, moreSkinBase, moreSkinCuts, moreSkinTones, moreSkinMarks, moreSkinPointer } from '../../engine/ui-skins-more.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
// Each skin's lists, exactly as the skin headers of the specification give them.
const LISTS = {
  neon: { face: [P.cavern, P.soil, D.plate, H.bandit], frame: [P.sky, P.goblin, P.steel, D.cyan, H.heal], accent: [P.ember, P.thorn, P.gold, D.xp, D.chitin] },
  crystal: { face: [P.cavern, P.soil, D.plate, H.bandit], frame: [P.sky, P.goblin, D.cyan, H.heal], accent: [P.magic, P.crimson, P.moss, D.xp, H.thunder] },
  grove: { face: [P.soil, P.cavern, H.bandit, D.plate], frame: [P.goblin, H.heal, H.wheat, P.cream], accent: [P.grass, P.crimson, P.ember, P.thorn, P.hero] },
};
const look = (skin) => ({ face: LISTS[skin].face[0], frame: LISTS[skin].frame[0], accent: LISTS[skin].accent[0] });
const STATES = ['normal', 'hover', 'pressed', 'disabled'];
const PIECES = ['button', 'tab', 'panel', 'tooltip', 'housing', 'rail', 'knob', 'check', 'radio', 'switch', 'selector'];

// Draws one piece the way a menu-kit sprite does: the flat helper, its corners re-cut, then moreSkinMarks.
// Returns { g, before (the flat piece), out (the helper's return), marks (moreSkinMarks' return), skip, rect }.
function draw(skin, style, piece, { state = 'normal', extras = false, w, h, corner = 0.5, border = 0.5, variant } = {}) {
  const L = look(skin), base = moreSkinBase(skin, style);
  const opt = { ...L, style: base.style, border, cornerPx: 0, corner };
  const cuts = moreSkinCuts(skin, corner);
  let g, out, body, rect, skip = [], keep = null, slice = null;
  if (piece === 'button') {
    w = w ?? 96; h = h ?? 32; g = new Surface(w, h); rect = { x: 1, y: 1, w: w - 2, h: h - 2 };
    out = skinButton(g, 1, 1, w - 2, h - 2, state, 'flat', opt); body = out.body;
    roundSlab(g, body, cuts, { below: state === 'pressed' ? 0 : LIP, bottomCuts: cuts.slice(0, 3) });
    skip = [out.text]; slice = out.slice;
  } else if (piece === 'tab') {
    w = w ?? 96; h = h ?? 32; g = new Surface(w, h); rect = { x: 1, y: 1, w: w - 2, h: h - 2 };
    out = skinTab(g, 1, 1, w - 2, h - 2, variant !== 'inactive', 'flat', opt); body = out.body;
    roundSlab(g, body, cuts, { corners: [true, true, false, false], openBottom: true });
    skip = [out.text]; slice = out.slice;
  } else if (piece === 'panel') {
    w = w ?? 96; h = h ?? 64; g = new Surface(w, h); rect = { x: 1, y: 1, w: w - 2, h: h - 2 };
    out = skinPanel(g, 1, 1, w - 2, h - 2, 'flat', { ...opt, inset: variant === 'inset', title: variant === 'title' ? 11 : 0 }); body = out.body;
    roundSlab(g, body, cuts);
    skip = [out.inner, out.title].filter(Boolean); slice = out.slice;
  } else if (piece === 'tooltip') {
    w = w ?? 96; h = h ?? 64; g = new Surface(w, h); rect = { x: 1, y: 1, w: 94, h: 40 };
    out = skinTooltip(g, 1, 1, 94, 40, 'flat', opt); body = { x: 1, y: 1, w: 94, h: 35 };
    roundSlab(g, body, cuts, { corners: [true, true, true, false] });
    skip = [out.inner]; slice = out.slice;
  } else if (piece === 'housing') {
    g = new Surface(64, 16); rect = body = { x: 1, y: 1, w: 62, h: 14 };
    skinBarHousing(g, 1, 1, 62, 14, 'flat', opt);
  } else if (piece === 'rail') {
    g = new Surface(64, 16); out = skinSlider(g, 1, 1, 62, 14, 'flat', opt); rect = body = out.rail;
  } else if (piece === 'knob') {
    g = new Surface(64, 16); out = skinKnob(g, 32, 8, 12, 'flat', opt); rect = body = out.rect;
  } else if (piece === 'check' || piece === 'radio') {
    g = new Surface(32, 32); out = (piece === 'check' ? skinCheck : skinRadio)(g, 16, 16, 20, variant !== 'off', 'flat', opt); rect = body = out.box;
  } else if (piece === 'switch') {
    g = new Surface(32, 32); skinSwitch(g, 2, 8, 28, 16, variant !== 'off', 'flat', opt); rect = body = { x: 2, y: 8, w: 28, h: 16 };
  } else {
    g = new Surface(32, 32); skinSelector(g, 1, 1, 30, 30, 0, 'flat', opt); rect = body = { x: 1, y: 1, w: 30, h: 30 };
  }
  if (slice) keep = { x: rect.x + slice.left, y: rect.y + slice.top, w: rect.w - slice.left - slice.right, h: rect.h - slice.top - slice.bottom };
  const before = new Surface(g.w, g.h); before.data.set(g.data);
  const marks = moreSkinMarks(g, body, skin, style, { piece, ...L, state, extras, keep, skip, rect, slice: slice ?? undefined });
  return { g, before, out, marks, skip, rect, body };
}

const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const colours = (g, r) => { const s = new Set(); for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) s.add(g.get(x, y)); return s; };
const column = (g, x) => { let k = ''; for (let y = 0; y < g.h; y++) k += g.get(x, y) + ','; return k; };
const row = (g, y) => { let k = ''; for (let x = 0; x < g.w; x++) k += g.get(x, y) + ','; return k; };

test('each skin\'s defaults are the first entry of its lists', () => {
  for (const skin of MORE_SKINS) for (const style of MORE_SKIN_STYLES[skin]) for (const state of STATES) {
    assert.deepEqual(moreSkinTones(skin, { style, state }), moreSkinTones(skin, { ...look(skin), style, state }), `${skin} ${style} ${state}`);
  }
  for (const skin of MORE_SKINS) {
    const a = new Surface(32, 32), b = new Surface(32, 32);
    moreSkinPointer(a, 4, 16, 20, skin, MORE_SKIN_STYLES[skin][0]);
    moreSkinPointer(b, 4, 16, 20, skin, MORE_SKIN_STYLES[skin][0], look(skin));
    assert.deepEqual([...a.data], [...b.data], skin);
  }
  for (const skin of MORE_SKINS) {
    const piece = () => { const g = new Surface(96, 32); skinButton(g, 1, 1, 94, 30, 'normal', 'flat', { ...look(skin), style: moreSkinBase(skin).style, cornerPx: 0 }); return g; };
    const a = piece(), b = piece(), body = { x: 1, y: 1, w: 94, h: 30 - LIP };
    moreSkinMarks(a, body, skin, undefined, { piece: 'button', extras: true });
    moreSkinMarks(b, body, skin, undefined, { piece: 'button', extras: true, ...look(skin) });
    assert.deepEqual([...a.data], [...b.data], skin);
  }
});

test('the lists, bases and cut tables', () => {
  assert.deepEqual([...MORE_SKINS], ['neon', 'crystal', 'grove']);
  assert.deepEqual(MORE_SKIN_STYLES, { neon: ['tube', 'double', 'sign'], crystal: ['ice', 'rime', 'shard'], grove: ['vine', 'bark', 'bloom'] });
  assert.ok(Object.isFrozen(MORE_SKINS) && Object.isFrozen(MORE_SKIN_STYLES) && Object.isFrozen(MORE_SKIN_STYLES.neon));
  assert.deepEqual(moreSkinBase('neon', 'tube'), { skin: 'flat', style: 'outline' });
  assert.deepEqual(moreSkinBase('neon', 'double'), { skin: 'flat', style: 'outline' });
  assert.deepEqual(moreSkinBase('neon', 'sign'), { skin: 'flat', style: 'solid' });
  for (const st of MORE_SKIN_STYLES.crystal) assert.deepEqual(moreSkinBase('crystal', st), { skin: 'flat', style: 'solid' });
  for (const st of MORE_SKIN_STYLES.grove) assert.deepEqual(moreSkinBase('grove', st), { skin: 'flat', style: 'solid' });
  assert.throws(() => moreSkinBase('candy', 'jelly'), /neon, crystal, grove/);
  assert.throws(() => moreSkinBase('neon', 'vine'), /tube, double, sign/);
  assert.deepEqual([...moreSkinCuts('crystal', 0)], [2, 1]);
  assert.deepEqual([...moreSkinCuts('crystal', 1)], [5, 4, 3, 2, 1]);
  assert.deepEqual([...moreSkinCuts('crystal', 0.5)], [4, 3, 2, 1]);
  assert.deepEqual([...moreSkinCuts('neon', 0.75)], [5, 3, 2, 1]);
  const T = moreSkinTones('neon', look('neon'));
  for (const k of ['face', 'band', 'accent', 'core', 'tubeDark']) assert.ok(T[k], k);
  assert.equal(moreSkinTones('neon', { ...look('neon'), state: 'hover' }).core, '#ffffff');
  assert.equal(moreSkinTones('neon', { ...look('neon'), state: 'disabled' }).core, moreSkinTones('neon', { ...look('neon'), state: 'disabled' }).band);
  for (const k of ['facetLight', 'facetDark']) assert.ok(moreSkinTones('crystal', look('crystal'))[k]);
  for (const k of ['twist', 'knot']) assert.ok(moreSkinTones('grove', look('grove'))[k]);
  assert.throws(() => moreSkinMarks(new Surface(8, 8), { x: 0, y: 0, w: 8, h: 8 }, 'neon', 'tube', { piece: 'banner' }), /button, tab/);
});

test('(1) marks stay inside the outline, out of skip, and leave inner one flat face colour', () => {
  for (const skin of MORE_SKINS) for (const style of MORE_SKIN_STYLES[skin]) for (const state of STATES) for (const piece of PIECES) for (const extras of [false, true]) {
    const variants = piece === 'panel' ? [undefined, 'inset', 'title'] : piece === 'tab' ? [undefined, 'inactive'] : ['check', 'radio', 'switch'].includes(piece) ? [undefined, 'off'] : [undefined];
    for (const variant of variants) {
      const { g, before, marks, skip } = draw(skin, style, piece, { state, extras, variant });
      const where = `${skin} ${style} ${state} ${piece} ${variant ?? ''} extras ${extras}`;
      for (let i = 0; i < g.data.length; i++) {
        if (g.data[i] === before.data[i]) continue;
        assert.ok(before.data[i] !== 0, `${where}: drew outside the piece at ${i % g.w},${Math.floor(i / g.w)}`);
        assert.ok(before.data[i] !== col(INK) && before.data[i] !== col(desaturate(INK)), `${where}: changed the outline at ${i % g.w},${Math.floor(i / g.w)}`);
        const x = i % g.w, y = Math.floor(i / g.w);
        for (const r of skip) assert.ok(!(x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), `${where}: drew in a text area at ${x},${y}`);
      }
      const inn = marks.inner;
      if (['button', 'tab', 'panel', 'tooltip'].includes(piece)) {
        assert.ok(inn.w > 0 && inn.h > 0, where);
        const T = moreSkinTones(skin, { ...look(skin), style, state: piece === 'button' ? state : 'normal' });
        const want = variant === 'inset' || variant === 'inactive' ? T.faceDark : T.face;
        assert.deepEqual([...colours(g, inn)], [col(want)], `${where}: inner holds only the face`);
      } else if (inn.w > 0 && inn.h > 0) assert.equal(colours(g, inn).size, 1, `${where}: inner is one colour`);
    }
  }
});

test('(2) stretching: buttons 96x32 and 160x32, panels 96x64 and 96x112 repeat their middle unchanged', () => {
  for (const skin of MORE_SKINS) for (const style of MORE_SKIN_STYLES[skin]) for (const extras of [false, true]) {
    for (const [piece, sizes] of [['button', [[96, 32], [160, 32]]], ['panel', [[96, 64], [96, 112]]]]) for (const state of piece === 'button' ? STATES : ['normal']) {
      const pics = sizes.map(([w, h]) => draw(skin, style, piece, { w, h, extras, state }));
      for (const { g, marks, rect } of pics) {
        const S = marks.slice, L = rect.x + S.left, R = rect.x + rect.w - 1 - S.right, T = rect.y + S.top, B = rect.y + rect.h - 1 - S.bottom;
        const where = `${skin} ${style} ${piece} ${state} extras ${extras} ${g.w}x${g.h}`;
        assert.ok(L <= R && T <= B, `${where}: a middle is left`);
        for (let x = L; x <= R; x++) assert.equal(column(g, x), column(g, L), `${where}: column ${x}`);
        for (let y = T; y <= B; y++) assert.equal(row(g, y), row(g, T), `${where}: row ${y}`);
      }
      // the bigger piece is the smaller with its middle repeated
      const [a, b] = pics, S = a.marks.slice;
      const squeeze = (v) => {
        const cols = []; for (let x = 0; x < v.g.w; x++) if (x <= v.rect.x + S.left || x >= v.rect.x + v.rect.w - 1 - S.right) cols.push(x);
        const rows = []; for (let y = 0; y < v.g.h; y++) if (y <= v.rect.y + S.top || y >= v.rect.y + v.rect.h - 1 - S.bottom) rows.push(y);
        return rows.map((y) => cols.map((x) => v.g.get(x, y)).join(',')).join('|');
      };
      assert.equal(squeeze(b), squeeze(a), `${skin} ${style} ${piece} ${state} extras ${extras}: ${b.g.w}x${b.g.h} squeezed`);
    }
  }
});

test('(3) on a 96x32 button: styles, extras and hover show; disabled has no colour', () => {
  for (const skin of MORE_SKINS) {
    const styles = MORE_SKIN_STYLES[skin], pics = styles.map((style) => draw(skin, style, 'button').g);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(diff(pics[i], pics[j]) >= 12, `${skin}: ${styles[i]} vs ${styles[j]}: ${diff(pics[i], pics[j])}`);
    for (const style of styles) {
      const n = (o) => draw(skin, style, 'button', o).g;
      assert.ok(diff(n({ extras: true }), n({})) >= 12, `${skin} ${style}: extras ${diff(n({ extras: true }), n({}))}`);
      assert.ok(diff(n({ state: 'hover' }), n({})) >= 12, `${skin} ${style}: hover`);
      const off = n({ state: 'disabled', extras: true });
      for (const v of off.data) if (v) { const r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255; assert.ok(r === g && g === b, `${skin} ${style}: disabled pixel ${r},${g},${b}`); }
    }
  }
});

test('(4) each skin\'s lists pass skinSwatches(\'flat\') unchanged', () => {
  for (const skin of MORE_SKINS) {
    const r = skinSwatches('flat', LISTS[skin]);
    assert.deepEqual(r.failing, [], skin); assert.deepEqual(r.dropped, [], skin);
    assert.deepEqual(r.face, LISTS[skin].face); assert.deepEqual(r.frame, LISTS[skin].frame); assert.deepEqual(r.accent, LISTS[skin].accent);
  }
});

test('(5) a fixture sprite per skin (hover button, inset panel, inactive tab) has no contrast faults', () => {
  for (const skin of MORE_SKINS) {
    const SW = skinSwatches('flat', LISTS[skin]);
    const piece = (g, clip, p) => {
      const base = moreSkinBase(skin, p.style), opt = { style: base.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, cornerPx: 0 };
      const cuts = moreSkinCuts(skin, p.corner);
      let out, body, kind, skip, rect, keep;
      if (clip === 'hover') { out = skinButton(g, 1, 1, 94, 30, 'hover', 'flat', opt); body = out.body; kind = 'button'; roundSlab(g, body, cuts, { below: LIP, bottomCuts: cuts.slice(0, 3) }); skip = [out.text]; }
      else if (clip === 'tab') { out = skinTab(g, 1, 1, 94, 30, false, 'flat', opt); body = out.body; kind = 'tab'; roundSlab(g, body, cuts, { corners: [true, true, false, false], openBottom: true }); skip = [out.text]; }
      else { out = skinPanel(g, 1, 1, 94, 30, 'flat', { ...opt, inset: true }); body = out.body; kind = 'panel'; roundSlab(g, body, cuts); skip = [out.inner]; }
      rect = { x: 1, y: 1, w: 94, h: 30 }; keep = { x: 1 + out.slice.left, y: 1 + out.slice.top, w: 94 - out.slice.left - out.slice.right, h: 30 - out.slice.top - out.slice.bottom };
      const m = moreSkinMarks(g, body, skin, p.style, { piece: kind, face: p.face, frame: p.frame, accent: p.accent, state: clip === 'hover' ? 'hover' : 'normal', extras: p.extras, skip, keep, rect, slice: out.slice });
      return { inner: m.inner, edge: out.edge };
    };
    const sprite = defineSprite({
      id: `fixture-${skin}`, name: `Fixture ${skin}`, kind: 'Item', meta: { type: 'ui', role: 'interface/button', view: 'none' },
      size: [96, 32], pivot: [48, 16], grounded: false,
      params: {
        style: choice('Style', MORE_SKIN_STYLES[skin][0], [...MORE_SKIN_STYLES[skin]]),
        corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }), border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
        extras: toggle('Extras', true),
        face: color('Face', SW.face[0], SW.face), frame: color('Frame', SW.frame[0], SW.frame), accent: color('Accent', SW.accent[0], SW.accent),
      },
      clips: { hover: { frames: 1, fps: 8 }, inset: { frames: 1, fps: 8 }, tab: { frames: 1, fps: 8 } },
      textArea(clip, p) { const o = piece(new Surface(96, 32), clip, p); return { ...o.inner, text: SKIN_TEXT.flat, edge: o.edge }; },
      render(g, { clip, p }) { piece(g, clip, p); },
    });
    assert.deepEqual(contrastFaults(sprite), [], skin);
  }
});

test('(6) moreSkinPointer: the tip is its rightmost pixel; the loop closes; neon flickers once in eight', () => {
  for (const skin of MORE_SKINS) for (const style of MORE_SKIN_STYLES[skin]) for (const size of [12, 16, 20]) for (const bob of [0, 2]) {
    const a = new Surface(32, 32), b = new Surface(32, 32);
    const { tip } = moreSkinPointer(a, 4, 16, size, skin, style, { ...look(skin), bob, t: 0 });
    moreSkinPointer(b, 4, 16, size, skin, style, { ...look(skin), bob, t: 1 });
    const bb = a.bounds();
    assert.equal(tip.x, bb.x1, `${skin} ${size}`); assert.ok(a.get(tip.x, tip.y));
    assert.equal(diff(a, b), 0, `${skin}: t 0 and t 1`);
  }
  const frames = [...Array(8).keys()].map((i) => { const g = new Surface(32, 32); moreSkinPointer(g, 4, 16, 20, 'neon', 'tube', { ...look('neon'), t: i / 8 }); return g; });
  const changed = frames.filter((f) => diff(f, frames[0]) > 0).length;
  assert.equal(changed, 1);
  const pics = MORE_SKINS.map((skin) => { const g = new Surface(32, 32); moreSkinPointer(g, 4, 16, 20, skin, MORE_SKIN_STYLES[skin][0], look(skin)); return g; });
  assert.ok(diff(pics[0], pics[1]) >= 12 && diff(pics[0], pics[2]) >= 12 && diff(pics[1], pics[2]) >= 12);
  const moved = new Surface(32, 32); moreSkinPointer(moved, 4, 16, 20, 'grove', 'vine', { ...look('grove'), bob: 2 });
  assert.equal(moved.bounds().x1, pics[2].bounds().x1 + 2);
});

test('(7) same arguments, same pixels', () => {
  for (const skin of MORE_SKINS) for (const style of MORE_SKIN_STYLES[skin]) {
    const a = draw(skin, style, 'panel', { extras: true, variant: 'title' }).g, b = draw(skin, style, 'panel', { extras: true, variant: 'title' }).g;
    assert.equal(diff(a, b), 0);
  }
});
