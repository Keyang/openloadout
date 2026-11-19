// engine/input-rocker.js: a round rocker direction pad, one disc with four raised wedges and a centre dimple
// (core-sprites-2, batch K16).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, tone } from '../../engine/color.js';
import { padRocker } from '../../engine/input-rocker.js';

const BODY = '#5d6475', GLOW = '#f2c230';
const px = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) out.push([x, y]); return out; };
const count = (g, hex) => { const v = col(hex); return g.data.reduce((n, p) => n + (p === v ? 1 : 0), 0); };
const draw = (o) => { const g = new Surface(40, 40), r = padRocker(g, 20, 20, { reach: 12, body: BODY, glow: GLOW, ...o }); return { g, ...r }; };

test('padRocker stays inside its reach for every option', () => {
  for (const reach of [10.5, 12, 13.5]) for (const depth of [1, 2, 3, 4]) for (const down of [false, true]) {
    const g = new Surface(40, 40); padRocker(g, 20, 20, { reach, body: BODY, glow: GLOW, lit: ['up', 'left'], depth, down });
    assert.ok(px(g).every(([x, y]) => Math.hypot(x + 0.5 - 20, y + 0.5 - 20) <= reach + 1e-9), `reach ${reach} depth ${depth} down ${down}`);
  }
});

test('padRocker is one round disc: lighting and pressing change colours inside it, never its outline', () => {
  const base = px(draw({ lit: [] }).g);
  for (const lit of [['up'], ['left', 'right'], ['up', 'right', 'down', 'left']]) for (const down of [false, true]) {
    assert.deepEqual(px(draw({ lit, down }).g), base, `${lit} down ${down}`);
  }
});

test('padRocker lights only the named wedges, the same count on opposite wedges', () => {
  const n = (lit) => count(draw({ lit }).g, GLOW);
  assert.equal(n([]), 0);
  assert.ok(n(['up']) > 15);
  assert.equal(n(['up']), n(['down']));
  assert.equal(n(['left']), n(['right']));
  assert.ok(n(['up']) > 0 && n(['left']) > 0);
});

test('padRocker: a pressed wedge sits lower and is darker than a raised one, with no side under it', () => {
  const up = draw({ lit: ['up'] }), dn = draw({ lit: ['up'], down: true });
  assert.ok(dn.arms.up.y > up.arms.up.y, 'lower');
  assert.equal(count(dn.g, GLOW), 0, 'not the raised colour');
  assert.ok(count(dn.g, tone(GLOW, -0.3)) > 15, 'a darker tone of the lit colour');
  // an unlit wedge does not press
  const other = draw({ lit: [], down: true });
  assert.deepEqual([...other.g.data], [...draw({ lit: [] }).g.data]);
});

test('padRocker has a dimple in the middle and an arrow on every wedge; the same arguments give the same pixels', () => {
  const { g, arms, dimple } = draw({ lit: [] });
  assert.deepEqual(Object.keys(arms).sort(), ['down', 'left', 'right', 'up']);
  assert.ok(arms.up.y < arms.down.y && arms.left.x < arms.right.x);
  assert.ok(Math.abs(dimple.cx - 20) <= 1 && Math.abs(dimple.cy - 20) <= 1.5);
  assert.notEqual(g.get(Math.floor(dimple.cx), Math.floor(dimple.cy)), col(BODY), 'the dimple is not the wedge colour');
  const mark = col(tone(BODY, -0.9));
  const inArm = (b) => { let n = 0; for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (g.get(x, y) === mark) n++; return n; };
  const n = ['up', 'right', 'down', 'left'].map((a) => inArm(arms[a]));
  assert.ok(n.every((v) => v >= 3), `${n}`);
  assert.deepEqual([...g.data], [...draw({ lit: [] }).g.data]);
});
