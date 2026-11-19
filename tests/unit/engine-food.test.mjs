// engine/food.js (core-sprites-1, batch K01): fruit, meals and sweets drawn face-on at pickup size,
// how far each reaches, and the two patterns sweets are decorated with (a swirl and sprinkles).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn, ellipseIn } from '../../engine/surface.js';
import { FRUIT_KINDS, MEAL_KINDS, CANDY_KINDS, foodReach, swirlIn, speckIn, drawFruit, drawMeal, drawCandy } from '../../engine/food.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const paint = (t, w = 32, h = 32) => new Surface(w, h).fill(0, 0, w, h, t, '#ffffff');
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const FAMILIES = [['fruit', FRUIT_KINDS, drawFruit, { leaf: '#3f8a4f', shine: true }], ['meal', MEAL_KINDS, drawMeal, { bite: true }], ['candy', CANDY_KINDS, drawCandy, { pattern: 'stripes' }]];

test('the kinds are four per family, frozen, in the order a choice lists them', () => {
  assert.deepEqual(FRUIT_KINDS, ['apple', 'pear', 'berries', 'citrus']);
  assert.deepEqual(MEAL_KINDS, ['drumstick', 'bread', 'cheese', 'pie']);
  assert.deepEqual(CANDY_KINDS, ['wrapped', 'lollipop', 'donut', 'cupcake']);
  for (const list of [FRUIT_KINDS, MEAL_KINDS, CANDY_KINDS]) assert.ok(Object.isFrozen(list));
  assert.throws(() => foodReach('fruit', 'banana'), /unknown fruit kind "banana"/);
});

test('every kind draws a pickup-sized thing that stays inside the reach foodReach gives, turned a little either way', () => {
  for (const [family, kinds, draw, extra] of FAMILIES) for (const kind of kinds) for (const angle of [-0.12, 0, 0.12]) {
    const g = new Surface(64, 64);
    const out = draw(g, 32, 32, { kind, angle, lag: angle, ...extra });
    const b = g.bounds(), r = foodReach(family, kind);
    const long = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    assert.ok(long >= 14 && long <= 24, `${family} ${kind}: ${long} px along its longer side`);
    assert.ok(32 - b.y0 <= r.up && b.y1 + 1 - 32 <= r.down && Math.max(32 - b.x0, b.x1 + 1 - 32) <= r.side, `${family} ${kind} at ${angle} stays inside its reach`);
    assert.equal(typeof out.body, 'function');
    assert.equal(out.body(32.5, 32.5) || out.body(32.5, 30.5) || out.body(32.5, 34.5), true, `${family} ${kind}: its body test covers its middle`);
    assert.equal(out.glint.length, 2);
  }
});

test('scale k grows the food and the same call always draws the same pixels', () => {
  for (const [, kinds, draw] of FAMILIES) for (const kind of kinds) {
    const at = (k) => { const g = new Surface(64, 64); draw(g, 32, 32, { kind, k }); return g; };
    assert.ok(lit(at(1.2)) > lit(at(0.8)) + 40, `${kind} grows with k`);
    assert.ok(same(at(1), at(1)), `${kind} is repeatable`);
  }
});

test('a bitten meal is missing a round piece at its top right', () => {
  for (const kind of MEAL_KINDS) {
    const whole = new Surface(64, 64), bitten = new Surface(64, 64);
    drawMeal(whole, 32, 32, { kind }); drawMeal(bitten, 32, 32, { kind, bite: true });
    assert.ok(lit(whole) - lit(bitten) >= 8, `${kind}: the bite takes at least 8 pixels`);
    assert.ok(whole.bounds().x1 >= bitten.bounds().x1 && whole.bounds().y0 <= bitten.bounds().y0 + 2);
  }
});

test('a fruit leaf adds at least ten pixels, and a pattern on a sweet changes at least twelve', () => {
  for (const kind of FRUIT_KINDS) {
    const bare = new Surface(32, 32), leafy = new Surface(32, 32);
    drawFruit(bare, 16, 18, { kind }); drawFruit(leafy, 16, 18, { kind, leaf: '#3f8a4f' });
    assert.ok(lit(leafy) - lit(bare) >= 6 && leafy.data.filter((v, i) => v !== bare.data[i]).length >= 10, `${kind} leaf`);
  }
  for (const kind of CANDY_KINDS) for (const pattern of ['stripes', 'dots']) {
    const plain = new Surface(32, 32), deco = new Surface(32, 32);
    drawCandy(plain, 16, 17, { kind }); drawCandy(deco, 16, 17, { kind, pattern, icing: '#4fd8ee' });
    assert.ok(deco.data.filter((v, i) => v !== plain.data[i]).length >= 12, `${kind} ${pattern}`);
  }
});

test('swirlIn winds stripes out from its centre, filled in the middle, about half stripe', () => {
  const g = paint(swirlIn(16, 16, { arms: 2 }));
  assert.ok(g.get(16, 16) && g.get(15, 15), 'the middle is filled');
  const n = lit(g);
  assert.ok(n > 1024 * 0.4 && n < 1024 * 0.6, `about half: ${n}`);
  assert.ok(!same(g, paint(swirlIn(16, 16, { arms: 2, phase: 0.25 }))), 'phase turns it');
});

test('speckIn scatters short dashes, every other one upright, only inside its shape', () => {
  const g = paint(speckIn(rectIn(0, 0, 16, 16), { pitch: 4, dash: 2 }));
  assert.deepEqual(g.bounds() && g.bounds().x1 < 16 && g.bounds().y1 < 16, true);
  assert.ok(g.get(0, 0) && g.get(1, 0), 'a dash lies along the row from a lattice point');
  assert.ok(g.get(4, 0) && g.get(4, 1) && !g.get(5, 0), 'the next one stands upright');
  assert.ok(g.get(2, 4), 'the next row is shifted half a step');
  const dots = paint(speckIn(ellipseIn(16, 16, 12, 12), { pitch: 4, dash: 1, stand: false }));
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (dots.get(x, y)) assert.ok(!dots.get(x + 1, y) && !dots.get(x, y + 1), 'dash 1: single dots');
});
