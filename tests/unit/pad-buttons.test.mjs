// engine/pad-buttons.js: round controller buttons with a swept side, their own side colour and a lit rim
// (core-sprites-2, batch K16).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, tone } from '../../engine/color.js';
import { padCap, padDiamond } from '../../engine/pad-buttons.js';

const TOP = '#5d6475', SIDE = '#3f3a52', GLOW = '#f2c230';
const px = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) out.push([x, y]); return out; };
const count = (g, hex) => { const v = col(hex); return g.data.reduce((n, p) => n + (p === v ? 1 : 0), 0); };
const inRadius = (g, cx, cy, r) => px(g).every(([x, y]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r + 1e-9);
const rowSpans = (g) => {
  const rows = {};
  for (const [x, y] of px(g)) (rows[y] ??= []).push(x);
  return Object.values(rows).map((xs) => { xs.sort((a, b) => a - b); return xs.at(-1) - xs[0] + 1 === xs.length; });
};

test('padCap stays inside its radius for every option', () => {
  for (const r of [4, 5.5, 10, 11]) for (const depth of [1, 2, 3, 4]) for (const down of [false, true]) for (const shine of [false, true]) {
    const g = new Surface(40, 40); padCap(g, 20, 20, r, { top: TOP, side: SIDE, depth, down, shine });
    assert.ok(inRadius(g, 20, 20, r), `r ${r} depth ${depth} down ${down}`);
  }
});

test('padCap has no notch: every row and column of the button is one unbroken run, and it bulges out nowhere', () => {
  for (const r of [5, 9, 11]) for (const depth of [1, 2, 3, 4]) {
    const g = new Surface(40, 40); padCap(g, 20, 20, r, { top: TOP, side: SIDE, depth });
    assert.ok(rowSpans(g).every(Boolean), `rows r ${r} depth ${depth}`);
    // the widest row is in the middle band: the width never shrinks then grows again going down
    const widths = {};
    for (const [x, y] of px(g)) widths[y] = (widths[y] ?? 0) + 1;
    const ys = Object.keys(widths).map(Number).sort((a, b) => a - b), w = ys.map((y) => widths[y]);
    const peak = w.indexOf(Math.max(...w)), last = w.lastIndexOf(Math.max(...w));
    for (let i = 1; i <= peak; i++) assert.ok(w[i] >= w[i - 1], `grows to the top of the widest band, r ${r} depth ${depth}`);
    for (let i = last + 1; i < w.length; i++) assert.ok(w[i] <= w[i - 1], `shrinks below it, r ${r} depth ${depth}`);
  }
});

test('padCap paints its side in the side colour and its top in the top colour, with a light rim only when shine is on', () => {
  const g = new Surface(40, 40); padCap(g, 20, 20, 9, { top: TOP, side: SIDE, depth: 3, shine: false });
  assert.ok(count(g, SIDE) >= 9 && count(g, TOP) > 100);
  assert.equal(count(g, tone(TOP, 0.85)), 0);
  const h = new Surface(40, 40); padCap(h, 20, 20, 9, { top: TOP, side: SIDE, depth: 3, shine: true });
  assert.ok(count(h, tone(TOP, 0.85)) >= 6, 'a rim of 6 px or more');
  assert.deepEqual(px(g), px(h), 'the rim adds no pixel');
  // the rim lies on the upper right of the top
  const v = col(tone(TOP, 0.85));
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (h.get(x, y) === v) assert.ok(x + 0.5 - 20 >= -1 && y + 0.5 - 20 <= 1, `${x},${y}`);
});

test('padCap down sinks the top by depth and draws no side; its text box is one colour inside the top', () => {
  for (const depth of [1, 2, 3]) {
    const g = new Surface(40, 40), { top: up } = padCap(g, 20, 20, 8, { top: TOP, side: SIDE, depth });
    const h = new Surface(40, 40), { top: dn } = padCap(h, 20, 20, 8, { top: TOP, side: SIDE, depth, down: true });
    assert.equal(dn.cy - up.cy, depth);
    assert.equal(count(h, SIDE), 0);
    for (const t of [up]) {
      const c = g.get(t.x, t.y);
      for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) assert.equal(g.get(x, y), c);
    }
  }
});

test('padDiamond lights only the named buttons, and every button keeps its side colour', () => {
  const draw = (lit) => { const g = new Surface(40, 40); padDiamond(g, 20, 20, { r: 5, body: TOP, side: SIDE, glow: GLOW, lit, depth: 2 }); return g; };
  const none = draw('none'), top = draw('top'), all = draw('all');
  assert.equal(count(none, GLOW), 0);
  assert.ok(count(top, GLOW) > 20);
  assert.ok(Math.abs(count(all, GLOW) - 4 * count(top, GLOW)) <= 4);
  assert.equal(count(all, SIDE), count(none, SIDE));
  assert.deepEqual(px(all), px(none), 'lighting changes colours, not the shape');
  for (const lit of ['top', 'right', 'bottom', 'left']) assert.ok(count(draw(lit), GLOW) > 20, lit);
});

test('padDiamond returns the four tops, and the same arguments give the same pixels', () => {
  const g = new Surface(40, 40), { tops } = padDiamond(g, 20, 20, { r: 5, lit: 'bottom' });
  assert.deepEqual(Object.keys(tops).sort(), ['bottom', 'left', 'right', 'top']);
  assert.ok(tops.top.cy < tops.bottom.cy && tops.left.cx < tops.right.cx);
  const h = new Surface(40, 40); padDiamond(h, 20, 20, { r: 5, lit: 'bottom' });
  assert.deepEqual([...g.data], [...h.data]);
});

test('padDiscs: four round arrow buttons inside the reach, lit ones in glow, each arm the mirror of its opposite', async () => {
  const { padDiscs } = await import('../../engine/pad-buttons.js');
  for (const reach of [10.5, 12, 13.5]) for (const depth of [1, 2, 3]) for (const down of [false, true]) {
    const g = new Surface(40, 40); padDiscs(g, 20, 20, { reach, body: TOP, side: SIDE, glow: GLOW, lit: ['up', 'left'], depth, down });
    assert.ok(inRadius(g, 20, 20, reach), `reach ${reach} depth ${depth} down ${down}`);
  }
  const lit = (l) => { const g = new Surface(40, 40); padDiscs(g, 20, 20, { reach: 12, body: TOP, side: SIDE, glow: GLOW, lit: l }); return count(g, GLOW); };
  assert.ok(lit(['up']) > 20);
  assert.equal(lit(['up']), lit(['down']));
  assert.equal(lit(['left']), lit(['right']));
  assert.equal(lit([]), 0);
  // every disc carries an arrow: the darker tone of its top, the same number of pixels on each
  const g = new Surface(40, 40), { arms } = padDiscs(g, 20, 20, { reach: 12, body: TOP, side: SIDE, glow: GLOW, lit: [] });
  assert.deepEqual(Object.keys(arms).sort(), ['down', 'left', 'right', 'up']);
  const mark = col(tone(TOP, -0.9));
  const inArm = (b) => { let n = 0; for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (g.get(x, y) === mark) n++; return n; };
  const n = ['up', 'right', 'down', 'left'].map((a) => inArm(arms[a]));
  assert.ok(n[0] >= 3 && n.every((v) => v === n[0]), `${n}`);
});
