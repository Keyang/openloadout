// engine/ui-skins-more-kit.js (batch K25, bundles/specs/core-sprites-3.md): thickenBand and moreSkinButtonMarks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { LIP } from '../../engine/ui.js';
import { skinButton, skinTab, skinPanel } from '../../engine/ui-skins.js';
import { MORE_SKINS, MORE_SKIN_STYLES, moreSkinBase, moreSkinMarks, moreSkinTones } from '../../engine/ui-skins-more.js';
import { thickenBand, moreSkinButtonMarks } from '../../engine/ui-skins-more-kit.js';

const P = PALETTE.thornwood;
const look = { face: P.cavern, frame: P.sky, accent: P.ember };
const column = (g, x) => { const a = []; for (let y = 0; y < g.h; y++) a.push(g.get(x, y)); return a; };
const row = (g, y) => { const a = []; for (let x = 0; x < g.w; x++) a.push(g.get(x, y)); return a; };

test('thickenBand grows a 2 px flat band to 3 px on every side, the outline style\'s gap kept', () => {
  for (const [style, gap] of [['solid', 0], ['outline', 1]]) {
    const g = new Surface(96, 64);
    const pa = skinPanel(g, 1, 1, 94, 62, 'flat', { ...look, style, borderPx: 2, cornerPx: 0 });
    const n = thickenBand(g, pa.body, { skip: [{ x: 40, y: 20, w: 10, h: 10 }] });
    assert.ok(n > 0, style);
    const I = col(INK), F = col(P.cavern), B = col(P.sky);
    const want = [0, I, ...Array(gap).fill(F), B, B, B, F];
    assert.deepEqual(column(g, 48).slice(0, want.length), want, `${style}: top`);
    assert.deepEqual(column(g, 48).reverse().slice(0, want.length), want, `${style}: bottom`);
    assert.deepEqual(row(g, 32).slice(0, want.length), want, `${style}: left`);
    assert.deepEqual(row(g, 32).reverse().slice(0, want.length), want, `${style}: right`);
  }
});

test('thickenBand leaves skip and every middle column and row the same', () => {
  const g = new Surface(96, 32), out = skinButton(g, 1, 1, 94, 30, 'normal', 'flat', { ...look, style: 'outline', borderPx: 2, cornerPx: 0 });
  const before = new Surface(96, 32); before.data.set(g.data);
  thickenBand(g, out.body, { skip: [out.text] });
  const t = out.text;
  for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) assert.equal(g.get(x, y), before.get(x, y));
  for (let x = 9; x < 87; x++) assert.deepEqual(column(g, x), column(g, 8), `column ${x}`);
  for (let y = 9; y < 23; y++) assert.deepEqual(row(g, y), row(g, 8), `row ${y}`);
  // the gap between the ink and the band is still the face
  assert.equal(g.get(48, 2), col(P.cavern));
});

test('thickenBand on a tab and on a piece with no band paints nothing outside the slab', () => {
  const g = new Surface(96, 32), out = skinTab(g, 1, 1, 94, 30, true, 'flat', { ...look, style: 'outline', borderPx: 2, cornerPx: 0 });
  const before = new Surface(96, 32); before.data.set(g.data);
  thickenBand(g, out.body);
  for (let i = 0; i < g.data.length; i++) if (g.data[i] !== before.data[i]) assert.ok(before.data[i] !== 0);
  assert.equal(thickenBand(new Surface(8, 8), { x: 0, y: 0, w: 8, h: 8 }), 0);
});

test('moreSkinButtonMarks gives the bottom side the rings of the top, and gives the lip back', () => {
  // neon and grove draw the same rings on every side; crystal lights its bevel (light top, dark bottom), so its
  // bottom side is checked to differ from the plain band instead
  for (const skin of MORE_SKINS) for (const style of MORE_SKIN_STYLES[skin]) for (const state of ['normal', 'hover', 'disabled']) {
    const g = new Surface(96, 32);
    const out = skinButton(g, 1, 1, 94, 30, state, 'flat', { ...look, style: moreSkinBase(skin, style).style, cornerPx: 0 });
    const lipRow = row(g, out.body.y + out.body.h - 1);
    moreSkinButtonMarks(g, out.body, skin, style, { piece: 'button', ...look, state, extras: true, skip: [out.text] });
    const where = `${skin} ${style} ${state}`;
    // the body's bottom line is the lip's colour again
    assert.deepEqual(row(g, out.body.y + out.body.h - 1), lipRow, `${where}: lip line`);
    // down the middle column the rings read the same from the top line and from the bottom line
    const c = column(g, 48), top = c.slice(out.body.y, out.body.y + 6), bottom = c.slice(out.body.y + out.body.h - 6, out.body.y + out.body.h).reverse();
    if (skin !== 'crystal') assert.deepEqual(bottom.slice(1), top.slice(1), `${where}: bottom rings ${bottom} vs top ${top}`);
    else assert.equal(bottom[1], col(moreSkinTones(skin, { ...look, style, state }).facetDark), `${where}: the bevel's dark bottom`);
  }
});

test('moreSkinButtonMarks on a piece with no lip is moreSkinMarks', () => {
  for (const skin of MORE_SKINS) {
    const draw = () => { const g = new Surface(96, 32); const out = skinButton(g, 1, 1, 94, 30, 'pressed', 'flat', { ...look, style: moreSkinBase(skin).style, cornerPx: 0 }); return { g, out }; };
    const a = draw(), b = draw();
    moreSkinButtonMarks(a.g, a.out.body, skin, undefined, { piece: 'button', ...look, state: 'pressed', extras: true, skip: [a.out.text] });
    moreSkinMarks(b.g, b.out.body, skin, undefined, { piece: 'button', ...look, state: 'pressed', extras: true, skip: [b.out.text] });
    assert.deepEqual([...a.g.data], [...b.g.data], skin);
  }
  // neon: hover turns the core white on the bottom side too
  const g = new Surface(96, 32), out = skinButton(g, 1, 1, 94, 30, 'hover', 'flat', { ...look, style: 'outline', cornerPx: 0 });
  moreSkinButtonMarks(g, out.body, 'neon', 'tube', { piece: 'button', ...look, state: 'hover', skip: [out.text] });
  const white = column(g, 48).filter((v) => v === col(moreSkinTones('neon', { ...look, state: 'hover' }).core)).length;
  assert.equal(white, 2);
  assert.ok(INK);
  assert.ok(LIP);
});

test('moreSkinHeading paints a strip and a rule over the face only, and splits the text areas', async () => {
  const { moreSkinHeading } = await import('../../engine/ui-skins-more-kit.js');
  const g = new Surface(96, 64), out = skinPanel(g, 1, 1, 94, 62, 'flat', { ...look, style: 'outline', cornerPx: 0 });
  const m = moreSkinMarks(g, out.body, 'neon', 'double', { piece: 'panel', ...look, extras: true, skip: [out.inner] });
  const before = new Surface(96, 64); before.data.set(g.data);
  const T = moreSkinTones('neon', look);
  const h = moreSkinHeading(g, out.body, m.inner, 11, { strip: T.faceDark, rule: [T.band, T.core, T.band] });
  assert.deepEqual(h.title, { ...m.inner, h: 11 });
  assert.equal(h.inner.y, m.inner.y + 14);
  assert.equal(h.inner.h, m.inner.h - 14);
  for (let i = 0; i < g.data.length; i++) if (g.data[i] !== before.data[i]) assert.equal(before.data[i], col(P.cavern));
  for (let y = h.title.y; y < h.title.y + 11; y++) for (let x = h.title.x; x < h.title.x + h.title.w; x++) assert.equal(g.get(x, y), col(T.faceDark));
  for (let y = h.inner.y; y < h.inner.y + h.inner.h; y++) for (let x = h.inner.x; x < h.inner.x + h.inner.w; x++) assert.equal(g.get(x, y), col(P.cavern));
  // every row of the strip and the rule is the same from the stretched left to the stretched right
  for (let y = h.title.y; y < h.inner.y; y++) for (let x = 9; x < 87; x++) assert.equal(g.get(x, y), g.get(8, y));
  // without the glow the outline style's gap is the face colour too: it stays the face
  const g2 = new Surface(96, 64), o2 = skinPanel(g2, 1, 1, 94, 62, 'flat', { ...look, style: 'outline', cornerPx: 0 });
  const m2 = moreSkinMarks(g2, o2.body, 'neon', 'tube', { piece: 'panel', ...look, skip: [o2.inner] });
  const h2 = moreSkinHeading(g2, o2.body, m2.inner, 11, { strip: T.faceDark, rule: [T.band, T.core, T.band] });
  for (let y = h2.title.y; y < h2.inner.y; y++) { assert.equal(g2.get(2, y), col(P.cavern)); assert.equal(g2.get(93, y), col(P.cavern)); }
});
