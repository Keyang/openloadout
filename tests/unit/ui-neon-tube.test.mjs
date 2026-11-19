// engine/ui-neon-tube.js (batch K25 fix round 1, bundles/specs/core-sprites-3.md): neonGapGlow, neonBarTube,
// neonGrowBand and neonBrackets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { skinTab, skinBarHousing, skinSlider, skinCheck, skinSwitch, skinSelector } from '../../engine/ui-skins.js';
import { moreSkinMarks, moreSkinTones } from '../../engine/ui-skins-more.js';
import { neonGapGlow, neonBarTube, neonGrowBand, neonBrackets } from '../../engine/ui-neon-tube.js';

const P = PALETTE.thornwood;
const look = { face: P.cavern, frame: P.sky, accent: P.ember };
const column = (g, x) => { const a = []; for (let y = 0; y < g.h; y++) a.push(g.get(x, y)); return a; };
const row = (g, y) => { const a = []; for (let x = 0; x < g.w; x++) a.push(g.get(x, y)); return a; };
const count = (g, c) => { let n = 0; const k = col(c); for (const v of g.data) if (v === k) n++; return n; };
const T = (style = 'tube') => moreSkinTones('neon', { ...look, style });

test('neonGapGlow paints the open tab\'s gap down both sides to the open bottom', () => {
  const g = new Surface(96, 32);
  const out = skinTab(g, 1, 1, 94, 30, true, 'flat', { ...look, style: 'outline', borderPx: 2, cornerPx: 0 });
  moreSkinMarks(g, out.body, 'neon', 'tube', { piece: 'tab', ...look, extras: true, rect: out.body });
  assert.equal(count(g, T().tubeDark), 0, 'the marks leave the open tab\'s Glow out');
  const n = neonGapGlow(g, out.body, { ...look, style: 'tube' });
  assert.ok(n >= 12, `${n} px`);
  // the gap column on each side is the glow from under the top ink to the last row
  const left = column(g, 2), right = column(g, 93);
  for (let y = 8; y < 31; y++) { assert.equal(left[y], col(T().tubeDark), `left ${y}`); assert.equal(right[y], col(T().tubeDark), `right ${y}`); }
  // the same in every middle column (it still stretches)
  for (let x = 9; x < 87; x++) assert.deepEqual(column(g, x), column(g, 8), `column ${x}`);
});

test('neonBarTube lights a core along the housing\'s band, the second tube and the Glow', () => {
  for (const style of ['tube', 'double', 'sign']) for (const extras of [false, true]) {
    const g = new Surface(64, 16);
    const o = skinBarHousing(g, 1, 1, 62, 14, 'flat', { ...look, style: style === 'sign' ? 'solid' : 'outline', borderPx: 2 });
    const trough = g.get(32, o.y + 1), shadow = g.get(32, o.y);
    neonBarTube(g, { x: 1, y: 1, w: 62, h: 14 }, 'housing', { ...look, style, extras, opening: o });
    const t = T(style), I = col(INK), inner = style === 'double' ? col(t.accent) : I, glow = col(t.tubeDark);
    assert.deepEqual(column(g, 32).slice(0, 7), [0, I, col(t.band), col(t.core), inner, extras ? glow : shadow, trough], `${style} ${extras}: top`);
    assert.deepEqual(column(g, 32).slice(10).reverse(), [0, I, col(t.band), col(t.core), inner, extras ? glow : trough], `${style} ${extras}: bottom`);
    for (let x = 9; x < 55; x++) assert.deepEqual(column(g, x), column(g, 8), `${style}: column ${x}`);
  }
});

test('neonBarTube: the housing\'s core runs the whole length, with no lone core pixel', () => {
  const g = new Surface(64, 16);
  const o = skinBarHousing(g, 1, 1, 62, 14, 'flat', { ...look, style: 'outline', borderPx: 2 });
  neonBarTube(g, { x: 1, y: 1, w: 62, h: 14 }, 'housing', { ...look, style: 'tube', opening: o });
  const core = col(T().core);
  for (let x = 3; x < 61; x++) { assert.equal(g.get(x, 3), core, `top ${x}`); assert.equal(g.get(x, 12), core, `bottom ${x}`); }
  for (let y = 3; y < 13; y++) { assert.equal(g.get(3, y), core, `left ${y}`); assert.equal(g.get(60, y), core, `right ${y}`); }
});

test('neonBarTube on a rail: core in the middle, the band or the Glow outside, the accent below in double', () => {
  for (const [style, extras] of [['tube', false], ['tube', true], ['double', true]]) {
    const g = new Surface(64, 16);
    const { rail } = skinSlider(g, 1, 1, 62, 14, 'flat', { ...look, style: 'outline' });
    moreSkinMarks(g, rail, 'neon', style, { piece: 'rail', ...look, rect: rail });
    neonBarTube(g, rail, 'rail', { ...look, style, extras });
    const t = T(style), out = extras ? t.tubeDark : t.band;
    const want = [INK, out, t.core, style === 'double' ? t.accent : t.core, out, INK].map(col);
    assert.deepEqual(column(g, 32).slice(rail.y, rail.y + rail.h), want, `${style} ${extras}`);
  }
  assert.throws(() => neonBarTube(new Surface(8, 8), { x: 0, y: 0, w: 8, h: 8 }, 'housing', look), /opening/);
  assert.throws(() => neonBarTube(new Surface(8, 8), { x: 0, y: 0, w: 8, h: 8 }, 'knob', look), /piece/);
});

test('neonGrowBand grows a check box\'s band and a switch\'s band by whole rings', () => {
  const g = new Surface(32, 32);
  const { box } = skinCheck(g, 16, 16, 20, false, 'flat', { ...look, style: 'outline', borderPx: 2 });
  const before = column(g, 16);
  const n = neonGrowBand(g, box, P.cavern, 1, { ...look, style: 'tube' });
  assert.ok(n >= 40, `${n} px`);
  const B = col(T().band);
  // ink, gap, then the band one pixel deeper than before
  assert.equal(before[10], col(P.cavern)); assert.equal(g.get(16, 10), B);
  assert.equal(g.get(16, 7), col(P.cavern), 'the gap stays');
  const s = new Surface(32, 32);
  skinSwitch(s, 2, 8, 28, 16, false, 'flat', { ...look, style: 'outline' });
  const k = neonGrowBand(s, { x: 2, y: 8, w: 28, h: 16 }, T().faceDark, 2, { ...look, style: 'tube' });
  assert.ok(k >= 12, `${k} px`);
});

test('neonBrackets lights a core in every bracket; Thick and double add lines, inked round', () => {
  const base = () => { const g = new Surface(32, 32); skinSelector(g, 1, 1, 30, 30, 0, 'flat', { ...look, style: 'outline' }); return g; };
  const g = base();
  neonBrackets(g, { x: 1, y: 1, w: 30, h: 30 }, { ...look, style: 'tube' });
  const core = col(T().core);
  for (const [x0, y0] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
    let n = 0; for (let y = y0; y < y0 + 16; y++) for (let x = x0; x < x0 + 16; x++) if (g.get(x, y) === core) n++;
    assert.ok(n >= 3, `quarter ${x0},${y0}: ${n}`);
  }
  for (const opt of [{ style: 'double' }, { style: 'tube', thick: true }]) {
    const h = base();
    const added = neonBrackets(h, { x: 1, y: 1, w: 30, h: 30 }, { ...look, ...opt });
    assert.ok(added >= 8, JSON.stringify(opt));
    let diff = 0; for (let i = 0; i < g.data.length; i++) if (g.data[i] !== h.data[i]) diff++;
    assert.ok(diff >= 8, `${JSON.stringify(opt)}: ${diff}`);
    if (opt.style === 'double') assert.ok(count(h, T('double').accent) >= 8);
    // every coloured pixel touches no empty pixel: the added lines are inked round
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const c = h.get(x, y); if (!c || c === col(INK)) continue;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(h.get(x + a, y + b), 0, `${x},${y}`);
    }
  }
  // the four brackets stay mirror images
  const d = base(); neonBrackets(d, { x: 1, y: 1, w: 30, h: 30 }, { ...look, style: 'double', thick: true });
  for (let y = 0; y < 32; y++) assert.deepEqual(row(d, y), row(d, y).slice().reverse(), `row ${y}`);
});
