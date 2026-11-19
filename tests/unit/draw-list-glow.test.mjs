// engine/draw-list.js, part 4: outline and glow order (style guide section 2; docs/studio.md section 4): ink goes
// round the body once; light (glow) is drawn after it, flat, not inked, rimmed with a darker tone of its own colour
// where it meets air. Also the outline and tint of one group only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn } from '../../engine/surface.js';
import { ramp, tone, INK, col } from '../../engine/color.js';
import * as D from '../../engine/draw-list.js';

const SKIN = '#4f9d57', FIRE = '#ffb347', CLOTH = '#3a6ea5';
const palette = { skin: SKIN, fire: FIRE, cloth: CLOTH };
const draw = (list, opt = {}) => D.renderList(48, 48, list, { palette, ...opt }).g;
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const fresh = () => new Surface(48, 48);
const body = { kind: 'ellipse', at: [20, 24], r: [9, 7], paint: 'skin' };
const flame = { kind: 'ellipse', at: [29, 20], r: [4, 5], paint: 'fire', glow: true };

/** What the style guide asks: the body, its outline, then the flame flat and rimmed in tone(fire, -1) on air only. */
function expected() {
  const g = fresh().ellipse(20, 24, 9, 7, ramp(SKIN)).outline(INK);
  const bodyIn = ellipseIn(20, 24, 9, 7), f = ellipseIn(29, 20, 4, 5);
  const rim = (px, py) => (f(px + 1, py) || f(px - 1, py) || f(px, py + 1) || f(px, py - 1)) && !f(px, py) && !bodyIn(px, py);
  g.fill(0, 0, 48, 48, rim, tone(FIRE, -1), { shade: 0 });
  g.fill(0, 0, 48, 48, f, FIRE, { shade: 0 });
  return g;
}

test('draw-list glow: drawn after the outline, flat in its colour, rimmed with its own darker tone where it meets air', () => {
  assert.ok(same(draw([body, { kind: 'outline' }, flame]), expected()));
});

test('draw-list glow: a glow listed before the outline (or before the body) is still drawn after everything', () => {
  assert.ok(same(draw([flame, body, { kind: 'outline' }]), expected()));
  assert.ok(same(draw([body, flame, { kind: 'outline' }]), expected()));
});

test('draw-list glow: never inked, and its rim never covers the body (the ink line may take the rim)', () => {
  const g = draw([body, flame, { kind: 'outline' }]);
  const f = ellipseIn(29, 20, 4, 5);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (f(x + 0.5, y + 0.5)) assert.equal(g.get(x, y), col(FIRE));
  assert.equal(g.get(24, 22), col(SKIN), 'body pixels next to the flame stay body');
});

test('draw-list glow: glow shapes of one group and z are one light, rimmed once round the whole', () => {
  const a = { kind: 'ellipse', at: [14, 14], r: [4, 4], paint: 'fire', glow: true, group: 'g' };
  const b = { kind: 'ellipse', at: [19, 14], r: [4, 4], paint: 'fire', glow: true, group: 'g' };
  const g = draw([a, b]);
  const both = (px, py) => ellipseIn(14, 14, 4, 4)(px, py) || ellipseIn(19, 14, 4, 4)(px, py);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    if (both(x + 0.5, y + 0.5)) assert.equal(g.get(x, y), col(FIRE), `light at ${x},${y}`);
  }
});

test('draw-list glow: glowRim false leaves the light without its rim', () => {
  const g = draw([flame], { glowRim: false });
  assert.ok(same(g, fresh().fill(0, 0, 48, 48, ellipseIn(29, 20, 4, 5), FIRE, { shade: 0 })));
});

test('draw-list outline: `only` a group inks round that group alone, also over what lies beside it', () => {
  const coat = { kind: 'rect', at: [10, 10], size: [20, 20], paint: 'cloth', group: 'coat' };
  const sword = { kind: 'rect', at: [24, 4], size: [4, 30], paint: 'skin', group: 'sword', z: 5 };
  const g = draw([coat, sword, { kind: 'outline', only: 'sword' }]);
  assert.equal(g.get(23, 15), col(INK), 'the ink line round the sword lies on the coat');
  assert.equal(g.get(9, 15), 0, 'the coat gets no ink of its own');
  assert.equal(g.get(28, 20), col(INK));
});

test('draw-list tint: `only` a group recolours that group\'s pixels alone; without it every drawn pixel (g.tint)', () => {
  const coat = { kind: 'rect', at: [10, 10], size: [20, 20], paint: 'cloth', group: 'coat' };
  const hat = { kind: 'rect', at: [12, 4], size: [8, 4], paint: 'skin', group: 'hat' };
  const g = draw([coat, hat, { kind: 'tint', paint: '#ffffff', only: 'hat' }]);
  assert.equal(g.get(14, 5), col('#ffffff'));
  assert.equal(g.get(14, 15), col(ramp(CLOTH).base));
  assert.ok(same(draw([coat, hat, { kind: 'tint', paint: '#ffffff' }]), fresh().rect(10, 10, 20, 20, ramp(CLOTH)).rect(12, 4, 8, 4, ramp(SKIN)).tint('#ffffff')));
});
