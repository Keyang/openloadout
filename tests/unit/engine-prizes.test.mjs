// engine/prizes.js (core-sprites-1, batch K03): money, trophies, scrolls and timepieces drawn face-on at
// pickup size, and how far each reaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp } from '../../engine/color.js';
import { PURSE_KINDS, TROPHY_KINDS, SCROLL_KINDS, TIMER_KINDS, prizeReach, drawPurse, drawTrophy, drawScroll, drawTimer } from '../../engine/prizes.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const differ = (a, b) => a.data.filter((v, i) => v !== b.data[i]).length;
const same = (a, b) => differ(a, b) === 0;
const FAMILIES = [
  ['purse', PURSE_KINDS, drawPurse, { fullness: 1, spill: true, t: 0.3 }],
  ['trophy', TROPHY_KINDS, drawTrophy, { emblem: 'star' }],
  ['scroll', SCROLL_KINDS, drawScroll, { seal: true }],
  ['timer', TIMER_KINDS, drawTimer, { level: 1, t: 0.3 }],
];
const draw = (fn, o, w = 64) => { const g = new Surface(w, w); const out = fn(g, w / 2, w / 2, o); return { g, out }; };

test('the kinds are three per family, frozen, in the order a choice lists them', () => {
  assert.deepEqual(PURSE_KINDS, ['pouch', 'sack', 'stack']);
  assert.deepEqual(TROPHY_KINDS, ['cup', 'medal', 'crown']);
  assert.deepEqual(SCROLL_KINDS, ['rolled', 'open', 'letter']);
  assert.deepEqual(TIMER_KINDS, ['hourglass', 'stopwatch', 'clock']);
  for (const list of [PURSE_KINDS, TROPHY_KINDS, SCROLL_KINDS, TIMER_KINDS]) assert.ok(Object.isFrozen(list));
  assert.throws(() => prizeReach('purse', 'wallet'), /unknown purse kind "wallet"/);
});

test('every kind draws a pickup-sized thing inside the reach prizeReach gives, at its biggest and turned a little either way', () => {
  for (const [family, kinds, fn, extra] of FAMILIES) for (const kind of kinds) for (const angle of [-0.12, 0, 0.12]) {
    const { g, out } = draw(fn, { kind, angle, ...extra });
    const b = g.bounds(), r = prizeReach(family, kind);
    const long = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    assert.ok(long >= 16 && long <= 26, `${family} ${kind}: ${long} px along its longer side`);
    assert.ok(32 - b.y0 <= r.up && b.y1 + 1 - 32 <= r.down && Math.max(32 - b.x0, b.x1 + 1 - 32) <= r.side, `${family} ${kind} at ${angle} stays inside its reach`);
    assert.equal(typeof out.body, 'function');
    assert.equal(out.glint.length, 2);
  }
});

test('scale k grows every kind and the same call always draws the same pixels', () => {
  for (const [, kinds, fn] of FAMILIES) for (const kind of kinds) {
    assert.ok(lit(draw(fn, { kind, k: 1.15 }).g) > lit(draw(fn, { kind, k: 0.8 }).g) + 40, `${kind} grows with k`);
    assert.ok(same(draw(fn, { kind }).g, draw(fn, { kind }).g), `${kind} is repeatable`);
  }
});

test('money: fullness rounds a bag and piles the stack higher, and the spill adds at least twelve pixels of coins', () => {
  for (const kind of PURSE_KINDS) {
    const lean = draw(drawPurse, { kind, fullness: 0 }).g, full = draw(drawPurse, { kind, fullness: 1 }).g;
    assert.ok(lit(full) - lit(lean) >= 20, `${kind}: fullness adds ${lit(full) - lit(lean)} px`);
    const bare = draw(drawPurse, { kind }).g, spilt = draw(drawPurse, { kind, spill: true }).g;
    assert.ok(differ(bare, spilt) >= 12, `${kind}: the spill changes ${differ(bare, spilt)} px`);
  }
  const stack = (fullness) => draw(drawPurse, { kind: 'stack', fullness }).g.bounds();
  assert.ok(stack(1).y0 <= stack(0).y0 - 6, 'a full stack is at least two coins taller');
});

test('trophies: an emblem marks the face, and a medal turned edge-on is a thin upright strip', () => {
  for (const kind of TROPHY_KINDS) {
    const plain = draw(drawTrophy, { kind }).g, marked = draw(drawTrophy, { kind, emblem: 'star' }).g;
    assert.ok(differ(plain, marked) >= 8 && lit(plain) === lit(marked), `${kind}: the emblem changes ${differ(plain, marked)} px and adds none outside the face`);
  }
  const face = draw(drawTrophy, { kind: 'medal' }).g, edge = draw(drawTrophy, { kind: 'medal', turn: Math.PI / 2 }).g;
  assert.ok(lit(edge) < lit(face) - 60, 'edge-on shows far less of the medal');
  const shiny = draw(drawTrophy, { kind: 'cup' }).out.shiny;
  assert.equal(shiny(32.5, 32 + 7.5), false, "the cup's plinth is not part of what shines");
});

test('scrolls: the seal is a round blob of wax on every kind, and the rolled scroll lies at a slant', () => {
  for (const kind of SCROLL_KINDS) {
    const plain = draw(drawScroll, { kind }).g, sealed = draw(drawScroll, { kind, seal: true, ribbon: '#3f6fd1' }).g;
    assert.ok(differ(plain, sealed) >= 14, `${kind}: the seal changes ${differ(plain, sealed)} px`);
  }
  const b = draw(drawScroll, { kind: 'rolled' }).g.bounds();
  assert.ok(b.y1 - b.y0 >= 12, 'the rolled scroll is tilted, not lying flat');
});

test('timepieces: the sand moves from the top bulb to the bottom, the grains fall, and the hand jumps round', () => {
  // pixels in rows y0..y1 painted in any tone of the sand
  const SAND = new Set(['light', 'base', 'dark'].map((n) => col(ramp('#e6c96a')[n])));
  const sandPx = (level, y0, y1) => { const { g } = draw(drawTimer, { kind: 'hourglass', level }); let n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < 64; x++) if (SAND.has(g.get(x, y))) n++; return n; };
  assert.ok(sandPx(1, 20, 31) > sandPx(0, 20, 31) + 15, 'the top bulb holds more sand at level 1');
  assert.ok(sandPx(1, 33, 44) < sandPx(0, 33, 44) - 10, 'the bottom bulb holds less sand at level 1');
  const a = draw(drawTimer, { kind: 'hourglass', t: 0 }).g, b = draw(drawTimer, { kind: 'hourglass', t: 1 / 8 }).g, c = draw(drawTimer, { kind: 'hourglass', t: 4 / 8 }).g;
  assert.ok(!same(a, b) && same(a, c), 'the grains move a pixel a frame and repeat every four frames');
  for (const kind of ['stopwatch', 'clock']) {
    const f0 = draw(drawTimer, { kind, t: 0 }).g, f2 = draw(drawTimer, { kind, t: 2 / 8 }).g, f8 = draw(drawTimer, { kind, t: 1 }).g;
    assert.ok(differ(f0, f2) >= 6 && same(f0, f8), `${kind}: the hand moves a quarter turn in two frames and comes back round`);
  }
});
