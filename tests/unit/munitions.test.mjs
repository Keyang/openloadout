// engine/munitions.js (core-sprites-1, batch K02): ammunition, arrows and bombs drawn face-on at
// pickup size, how far each reaches, and the counts and lengths their controls change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { AMMO_KINDS, ARROW_KINDS, BOMB_KINDS, munitionReach, drawAmmo, drawArrows, drawBomb } from '../../engine/munitions.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const differ = (a, b) => a.data.filter((v, i) => v !== b.data[i]).length;
const FAMILIES = [
  ['ammo', AMMO_KINDS, drawAmmo, { colour: '#3f8a4f', metal: '#f2c230' }],
  ['arrows', ARROW_KINDS, drawArrows, { leather: '#7a4f33', wood: '#a06a3c', metal: '#c2c9d6', fletching: '#c9423a', cord: '#7a4f33' }],
  ['bomb', BOMB_KINDS, drawBomb, { colour: '#5d6475', rope: '#f0ead8' }],
];
const at = (draw, o) => { const g = new Surface(64, 64); const out = draw(g, 32, 32, o); return { g, out }; };

test('the kinds are three per family, frozen, in the order a choice lists them', () => {
  assert.deepEqual(AMMO_KINDS, ['box', 'clip', 'shells']);
  assert.deepEqual(ARROW_KINDS, ['quiver', 'bundle', 'bolts']);
  assert.deepEqual(BOMB_KINDS, ['round', 'stick', 'bundle']);
  for (const list of [AMMO_KINDS, ARROW_KINDS, BOMB_KINDS]) assert.ok(Object.isFrozen(list));
  assert.throws(() => munitionReach('ammo', { kind: 'crate' }), /unknown ammo kind "crate"/);
  assert.throws(() => drawBomb(new Surface(8, 8), 4, 4, { kind: 'mine' }), /unknown bomb kind "mine"/);
});

test('every kind draws a pickup-sized thing that stays inside the reach munitionReach gives, tilted a little either way', () => {
  for (const [family, kinds, draw, colours] of FAMILIES) for (const kind of kinds) for (const angle of [-0.12, 0, 0.12]) {
    const o = { kind, angle, ...colours };
    const { g, out } = at(draw, o);
    const b = g.bounds(), r = munitionReach(family, o);
    const long = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    assert.ok(long >= 14 && long <= 22, `${family} ${kind}: ${long} px along its longer side`);
    assert.ok(32 - b.y0 <= r.up && b.y1 + 1 - 32 <= r.down && Math.max(32 - b.x0, b.x1 + 1 - 32) <= r.side, `${family} ${kind} at ${angle} stays inside its reach`);
    assert.equal(typeof out.body, 'function');
    assert.ok(out.body(b.x0 + (b.x1 - b.x0) / 2 + 0.5, b.y0 + (b.y1 - b.y0) / 2 + 0.5) || lit(g) > 0);
  }
});

test('scale k grows each kind and the same call always draws the same pixels', () => {
  for (const [, kinds, draw, colours] of FAMILIES) for (const kind of kinds) {
    assert.ok(lit(at(draw, { kind, k: 1.2, ...colours }).g) > lit(at(draw, { kind, k: 0.8, ...colours }).g) + 30, `${kind} grows with k`);
    assert.equal(differ(at(draw, { kind, ...colours }).g, at(draw, { kind, ...colours }).g), 0, `${kind} is repeatable`);
  }
});

test('more rounds change at least twelve pixels in every kind of ammunition', () => {
  for (const kind of AMMO_KINDS) {
    const few = at(drawAmmo, { kind, load: 2, colour: '#3f8a4f', metal: '#f2c230' }).g, many = at(drawAmmo, { kind, load: 6, colour: '#3f8a4f', metal: '#f2c230' }).g;
    assert.ok(differ(few, many) >= 12, `${kind}: ${differ(few, many)} pixels`);
  }
});

test('more arrows change at least twelve pixels, and every arrow kind shows its heads or fittings in the metal colour', () => {
  const base = { leather: '#7a4f33', wood: '#a06a3c', metal: '#c2c9d6', fletching: '#c9423a', cord: '#7a4f33' };
  for (const kind of ARROW_KINDS) {
    const few = at(drawArrows, { kind, count: 2, ...base }).g, many = at(drawArrows, { kind, count: 5, ...base }).g;
    assert.ok(differ(few, many) >= 12, `${kind}: ${differ(few, many)} pixels`);
    const gold = at(drawArrows, { kind, ...base, metal: '#f2c230' }).g;
    assert.ok(differ(at(drawArrows, { kind, ...base }).g, gold) >= 6, `${kind}: the metal colour shows`);
  }
});

test('a longer fuse reaches further from the bomb, and its burning end is returned where the fuse ends', () => {
  for (const kind of BOMB_KINDS) {
    const short = at(drawBomb, { kind, fuse: 0, colour: '#5d6475', rope: '#f0ead8' }), long = at(drawBomb, { kind, fuse: 1, colour: '#5d6475', rope: '#f0ead8' });
    assert.ok(differ(short.g, long.g) >= 12, `${kind}: the fuse length changes ${differ(short.g, long.g)} pixels`);
    const d = (o) => Math.hypot(o.out.spark[0] - 32, o.out.spark[1] - 32);
    assert.ok(d(long) > d(short) + 2, `${kind}: the long fuse ends further out`);
    const [sx, sy] = long.out.spark;
    let near = false;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (long.g.get(Math.floor(sx) + x, Math.floor(sy) + y)) near = true;
    assert.ok(near, `${kind}: the spark point is on the fuse`);
  }
});
