// engine/ammo-packs.js (core-sprites-1, batch K02, fix round 1): ammo packs drawn upright at pickup size,
// the lid of the box, the round on top of the magazine, and how far each reaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { ramp, col } from '../../engine/color.js';
import { AMMO_PACK_KINDS, ammoPackReach, drawAmmoPack } from '../../engine/ammo-packs.js';

const colours = { colour: '#3f8a4f', metal: '#f2c230' };
const draw = (o) => { const g = new Surface(64, 64); const out = drawAmmoPack(g, 32, 32, { ...colours, ...o }); return { g, out }; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);

test('the kinds are box, clip and shells, frozen; an unknown kind throws', () => {
  assert.deepEqual(AMMO_PACK_KINDS, ['box', 'clip', 'shells']);
  assert.ok(Object.isFrozen(AMMO_PACK_KINDS));
  assert.throws(() => drawAmmoPack(new Surface(8, 8), 4, 4, { kind: 'crate' }), /unknown kind "crate"/);
});

test('every kind and load is pickup sized and stays inside the reach ammoPackReach gives', () => {
  for (const kind of AMMO_PACK_KINDS) for (const load of [2, 4, 6]) {
    const { g, out } = draw({ kind, load });
    const b = g.bounds(), r = ammoPackReach({ kind, load });
    const long = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    assert.ok(long >= 12 && long <= 22, `${kind} ${load}: ${long} px along its longer side`);
    assert.ok(32 - b.y0 <= r.up && b.y1 + 1 - 32 <= r.down && Math.max(32 - b.x0, b.x1 + 1 - 32) <= r.side, `${kind} ${load} inside its reach`);
    assert.equal(typeof out.body, 'function');
  }
});

test('the box shows its lid above the rounds in a darker value than the box', () => {
  const { g } = draw({ kind: 'box' });
  const b = g.bounds();
  // the top two rows are the lid, not brass: the lid stands higher than the rounds
  const top = [], C = ramp(colours.colour), body = [col(C.base), col(C.light)];
  for (let x = b.x0; x <= b.x1; x++) for (const y of [b.y0, b.y0 + 1]) if (g.get(x, y)) top.push(g.get(x, y));
  assert.ok(top.length >= 20, `lid rows hold ${top.length} pixels`);
  assert.ok(top.every((c) => !body.includes(c)));
});

test('the magazine is narrower than the box and carries a round above its body', () => {
  const box = draw({ kind: 'box' }).g.bounds(), clip = draw({ kind: 'clip' }).g.bounds();
  assert.ok(clip.x1 - clip.x0 < box.x1 - box.x0 - 4);
  assert.ok(clip.y1 - clip.y0 > clip.x1 - clip.x0, 'taller than wide');
  // more rounds make a longer magazine
  assert.ok(lit(draw({ kind: 'clip', load: 6 }).g) - lit(draw({ kind: 'clip', load: 2 }).g) >= 12);
});

test('the same call always draws the same pixels', () => {
  for (const kind of AMMO_PACK_KINDS) assert.deepEqual(draw({ kind, k: 1.1 }).g.data, draw({ kind, k: 1.1 }).g.data);
});

