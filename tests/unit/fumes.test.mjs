// engine/fumes.js (added with batch K04): plume, risers, bubble, risingBubbles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { plume, risers, bubble, risingBubbles } from '../../engine/fumes.js';

const C = ['#f0ead8', '#c0c0c0', '#8f97a8', '#3f5068'];
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, c) => { const v = col(c); return g.data.reduce((n, x) => n + (x === v ? 1 : 0), 0); };
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const draw = (f) => { const g = new Surface(48, 48); f(g); return g; };
const rows = (g) => { const r = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) r.push(y); return r; };
const edgeClear = (g) => { for (let i = 0; i < g.w; i++) for (const [x, y] of [[i, 0], [i, g.h - 1], [0, i], [g.w - 1, i]]) if (g.data[y * g.w + x]) return false; return true; };

test('plume: a loop closes at t = 1, moves between frames and keeps the border clear', () => {
  for (const shape of ['round', 'wispy', 'lumpy']) {
    const o = { x: 24, y: 44, count: 6, rise: 34, drift: 10, size: 5, shape, colours: C };
    const a = draw((g) => plume(g, { ...o, t: 0 })), b = draw((g) => plume(g, { ...o, t: 1 })), m = draw((g) => plume(g, { ...o, t: 0.5 }));
    assert.ok(same(a, b), `${shape}: t = 0 and t = 1 differ`);
    assert.ok(!same(a, m), `${shape}: nothing moves`);
    assert.ok(lit(a) > 60, `${shape}: only ${lit(a)} pixels`);
    for (let k = 0; k < 8; k++) assert.ok(edgeClear(draw((g) => plume(g, { ...o, t: k / 8 }))), `${shape}: touches the border at ${k}/8`);
  }
});

test('plume: young puffs at the foot are the lightest colour, old ones higher up are darker', () => {
  const g = draw((s) => plume(s, { t: 0.3, x: 24, y: 44, count: 6, rise: 34, size: 5, colours: C }));
  const light = [], dark = [];
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const v = g.data[y * 48 + x]; if (v === col(C[0])) light.push(y); if (v === col(C[2])) dark.push(y); }
  assert.ok(light.length && dark.length);
  const mean = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  assert.ok(mean(light) > mean(dark), 'the light puffs should sit lower than the dark ones');
});

test('plume with stop: it starts as the loop does, lifts off its foot and ends on one small wisp', () => {
  const o = { x: 24, y: 44, count: 5, rise: 34, size: 5, colours: C };
  assert.ok(same(draw((g) => plume(g, { ...o, t: 0 })), draw((g) => plume(g, { ...o, t: 0, stop: 0 }))));
  const end = draw((g) => plume(g, { ...o, t: 1, stop: 0 }));
  assert.ok(lit(end) >= 2 && lit(end) <= 30, `the last frame has ${lit(end)} pixels`);
  assert.ok(Math.max(...rows(end)) < 20, 'the wisp is near the top of the column');
  assert.equal(lit(draw((g) => plume(g, { ...o, t: 1, stop: 0, wisp: false }))), 0);
});

test('risers: repeat each clip, stay in the box and spread across the band', () => {
  const o = { x: 24, y: 40, count: 4, rise: 30, spread: 16, sway: 2, box: [1, 1, 47, 47], pad: 3 };
  const r6 = (l) => l.map((s) => [s.i, +s.x.toFixed(6), +s.y.toFixed(6), +s.life.toFixed(6)]);
  assert.deepEqual(r6(risers({ ...o, t: 0 })), r6(risers({ ...o, t: 1 })));
  for (let k = 0; k < 16; k++) for (const s of risers({ ...o, t: k / 16 })) {
    assert.ok(s.x >= 4 && s.x <= 44 && s.y >= 4 && s.y <= 44, `outside the box: ${s.x}, ${s.y}`);
    assert.ok(s.life >= 0 && s.life < 1);
  }
  const xs = risers({ ...o, t: 0.2 }).map((s) => s.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 6, 'all in one lane');
});

test('bubble: a skin with a rim, a shaded middle and a white glint; burst, four droplets', () => {
  const g = draw((s) => bubble(s, 24.5, 24.5, 3.5, C));
  assert.ok(count(g, C[3]) >= 12, 'rim');
  assert.ok(count(g, C[2]) >= 12, 'skin');
  assert.equal(count(g, '#ffffff'), 1, 'one glint');
  assert.ok(count(g, C[0]) >= 4, 'a middle in the first colour');
  assert.ok(count(g, C[1]) >= 1, 'its shade');
  const p = draw((s) => bubble(s, 24.5, 24.5, 3, C, { pop: 0.5 }));
  assert.equal(lit(p), 4);
  assert.equal(lit(draw((s) => bubble(s, 24.5, 24.5, 0.6, C))), 1);
});

test('risingBubbles: a loop that closes, with whole bubbles and bursts on its frames', () => {
  const o = { x: 24, y: 40, count: 5, rise: 24, spread: 18, size: 2.5, colours: C };
  assert.ok(same(draw((g) => risingBubbles(g, { ...o, t: 0 })), draw((g) => risingBubbles(g, { ...o, t: 1 }))));
  let whole = 0, frames = 0;
  for (let k = 0; k < 8; k++) {
    const g = new Surface(48, 48);
    whole += risingBubbles(g, { ...o, t: k / 8 });
    assert.ok(edgeClear(g));
    if (lit(g) > 0) frames++;
  }
  assert.ok(whole >= 8, `only ${whole} whole bubbles over the loop`);
  assert.equal(frames, 8, 'a frame with nothing in it');
});
