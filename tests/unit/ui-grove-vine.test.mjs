// engine/ui-grove-vine.js (batch K27 fix round 1, bundles/specs/core-sprites-3.md): groveMarks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { skinButton, skinPanel, skinCheck } from '../../engine/ui-skins.js';
import { roundSlab } from '../../engine/ui-candy-slab.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinCuts, moreSkinMarks, moreSkinTones } from '../../engine/ui-skins-more.js';
import { moreSkinButtonMarks } from '../../engine/ui-skins-more-kit.js';
import { groveMarks } from '../../engine/ui-grove-vine.js';

const P = PALETTE.thornwood;
const look = { face: P.soil, frame: P.goblin, accent: P.grass };
const KEEP = { x: 23, y: 11, w: 50, h: 10 };
const column = (g, x) => { const a = []; for (let y = 0; y < g.h; y++) a.push(g.get(x, y)); return a; };
const row = (g, y) => { const a = []; for (let x = 0; x < g.w; x++) a.push(g.get(x, y)); return a; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };

// A 96x32 grove button as ui-buttons-grove draws it, with the marks of `marks` (groveMarks unless given).
function button(style, { leaves = true, state = 'normal', marks = null } = {}) {
  const g = new Surface(96, 32);
  const out = skinButton(g, 1, 1, 94, 30, state, 'flat', { ...look, style: moreSkinBase('grove', style).style, borderPx: 2, cornerPx: 0 });
  roundSlab(g, out.body, moreSkinCuts('grove', 0.75), { below: 2, bottomCuts: moreSkinCuts('grove', 0.75).slice(0, 3) });
  const before = new Surface(96, 32); before.data.set(g.data);
  const opt = { piece: 'button', ...look, state, skip: [out.text], keep: KEEP, rect: { x: 1, y: 1, w: 94, h: 30 }, slice: out.slice };
  const m = marks ? marks(g, out.body, opt) : groveMarks(g, out.body, style, { ...opt, base: moreSkinButtonMarks, leaves, leafAt: 10, sideLeaf: false });
  return { g, before, out, m };
}

test('groveMarks keeps the stretched middle: every middle column and row is the same', () => {
  for (const style of MORE_SKIN_STYLES.grove) for (const leaves of [false, true]) {
    const { g } = button(style, { leaves });
    for (let x = KEEP.x + 1; x < KEEP.x + KEEP.w; x++) assert.deepEqual(column(g, x), column(g, KEEP.x), `${style} ${leaves} column ${x}`);
    for (let y = KEEP.y + 1; y < KEEP.y + KEEP.h; y++) assert.deepEqual(row(g, y), row(g, KEEP.y), `${style} ${leaves} row ${y}`);
  }
});

test('groveMarks changes nothing outside the outline, nothing on ink and nothing in the text area', () => {
  for (const style of MORE_SKIN_STYLES.grove) for (const state of ['normal', 'hover', 'disabled']) {
    const { g, before, out } = button(style, { state });
    const inks = new Set([col(INK), before.get(48, 1)]);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 96; x++) {
      const was = before.get(x, y);
      if (!was || inks.has(was)) assert.equal(g.get(x, y), was, `${style} ${state} (${x}, ${y})`);
    }
    const t = out.text;
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) assert.equal(g.get(x, y), before.get(x, y));
  }
});

test('groveMarks returns an inner that holds only the face', () => {
  for (const style of MORE_SKIN_STYLES.grove) {
    const { g, m } = button(style);
    const face = col(moreSkinTones('grove', { ...look, style }).face);
    for (let y = m.inner.y; y < m.inner.y + m.inner.h; y++) for (let x = m.inner.x; x < m.inner.x + m.inner.w; x++) assert.equal(g.get(x, y), face, `${style} (${x}, ${y})`);
    assert.ok(m.inner.w > 40 && m.inner.h > 10);
  }
});

test('the twist, the leaves and the flower each show at button size', () => {
  const plain = button('vine', { marks: (g, body, opt) => moreSkinButtonMarks(g, body, 'grove', 'vine', opt) }).g;
  const vine = button('vine', { leaves: false }).g;
  // the twist: a stripe of the dark tone every 2 px over each corner zone, far more than moreSkinMarks' few pixels
  assert.ok(diff(vine, plain) >= 60, `twist ${diff(vine, plain)}`);
  const twist = col(moreSkinTones('grove', { ...look, style: 'vine' }).twist);
  const top = row(vine, 2).slice(1, 23);
  assert.ok(top.filter((c) => c === twist).length >= 4, 'stripes along the top run');
  for (const style of MORE_SKIN_STYLES.grove) assert.ok(diff(button(style).g, button(style, { leaves: false }).g) >= 40, `leaves ${style}`);
  assert.ok(diff(button('bloom').g, button('vine').g) >= 20, 'bloom with leaves');
  assert.ok(diff(button('bloom', { leaves: false }).g, vine) >= 20, 'bloom without leaves');
  // the flower's gold middle is not covered by a leaf
  const gold = col(moreSkinTones('grove', { ...look, style: 'bloom' }).gold);
  assert.ok(button('bloom').g.data.filter((c) => c === gold).length >= 2);
});

test('groveMarks grows the slice where a leaf reaches in, and twistIn runs the stripes on over the face', () => {
  const { m, out } = button('vine');
  assert.ok(m.slice.left >= out.slice.left && m.slice.left >= 20, `left ${m.slice.left}`);
  const draw = (twistIn) => {
    const g = new Surface(32, 32), { box } = skinCheck(g, 16, 16, 20, false, 'flat', { ...look, style: 'solid' });
    groveMarks(g, box, 'vine', { piece: 'check', ...look, rect: box, twistIn });
    return g;
  };
  assert.ok(diff(draw(1), draw(0)) >= 16);
});

test('groveMarks on a panel with leaves on each run, and same arguments give the same pixels', () => {
  const draw = (leaves) => {
    const g = new Surface(96, 64), out = skinPanel(g, 1, 1, 94, 62, 'flat', { ...look, style: 'solid', borderPx: 2, cornerPx: 0 });
    roundSlab(g, out.body, moreSkinCuts('grove', 0.75));
    groveMarks(g, out.body, 'bloom', { piece: 'panel', ...look, leaves, leafAt: 10, skip: [out.inner], keep: { x: 19, y: 19, w: 58, h: 26 }, rect: { x: 1, y: 1, w: 94, h: 62 }, slice: out.slice });
    return g;
  };
  assert.ok(diff(draw(true), draw(false)) >= 48);
  assert.equal(diff(draw(true), draw(true)), 0);
  // the base marks are still moreSkinMarks' (the bark style's rings)
  const g = new Surface(96, 64), out = skinPanel(g, 1, 1, 94, 62, 'flat', { ...look, style: 'solid', borderPx: 2, cornerPx: 0 });
  const h = new Surface(96, 64); h.data.set(g.data);
  groveMarks(g, out.body, 'bark', { piece: 'panel', ...look, skip: [out.inner] });
  moreSkinMarks(h, out.body, 'grove', 'bark', { piece: 'panel', ...look, skip: [out.inner] });
  assert.equal(diff(g, h), 0);
});
