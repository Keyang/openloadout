// engine/mouse-light.js: the light and shade rims on a mouse mouseBody drew flat (core-sprites-2, batch K15).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, tone } from '../../engine/color.js';
import { mouseBody } from '../../engine/inputs.js';
import { mouseBodyIn, mouseLight } from '../../engine/mouse-light.js';

const BODY = '#8a8a9a', LIT = '#f2c230';
const count = (g, hex) => { const v = col(hex); return g.data.reduce((n, p) => n + (p === v ? 1 : 0), 0); };

for (const shape of ['oval', 'slim']) for (const [w, h] of [[12, 16], [14, 19], [17, 22]]) for (const button of ['left', 'right', 'middle', 'none']) for (const down of [false, true]) {
  test(`mouseLight ${shape} ${w}x${h} ${button}${down ? ' down' : ''}: repaints only mouseBody's pixels, with three values of the plastic`, () => {
    const o = { w, h, shape, body: BODY, lit: LIT, button, down };
    const a = new Surface(32, 32), b = new Surface(32, 32);
    mouseBody(a, 16, 16, o); mouseBody(b, 16, 16, o);
    mouseLight(b, 16, 16, o);
    const { inside } = mouseBodyIn(16, 16, o);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      assert.equal(!!a.get(x, y), !!b.get(x, y), `pixel ${x},${y} added or removed`);
      assert.equal(!!a.get(x, y), inside(x + 0.5, y + 0.5), `mouseBodyIn agrees with mouseBody at ${x},${y}`);
    }
    assert.ok(count(b, BODY) > 0 && count(b, tone(BODY, 0.85)) >= 4 && count(b, tone(BODY, -1)) >= 4, 'base, light and dark plastic');
    if ((button === 'left' || button === 'right') && !down) assert.ok(count(b, tone(LIT, 0.85)) + count(b, tone(LIT, -1)) >= 2, 'the lit button has a rim too');
    if ((button === 'left' || button === 'right') && down) assert.equal(count(b, tone(LIT, 0.85)), 0, 'a pressed button has no light rim');
  });
}

test('mouseLight lights the top-right rim and shades the bottom-left by default', () => {
  const g = new Surface(32, 32), o = { body: BODY, button: 'none' };
  mouseBody(g, 16, 16, o); mouseLight(g, 16, 16, o);
  const { x1, y1 } = mouseBodyIn(16, 16, o);
  let right = 0; for (let y = 0; y < 32; y++) for (let x = 31; x >= 0; x--) if (g.get(x, y)) { if (g.get(x, y) === col(tone(BODY, 0.85))) right++; break; }
  assert.ok(right >= 4, 'right edge lit');
  let bottom = 0; for (let x = 0; x < 32; x++) if (g.get(x, y1 - 1) === col(tone(BODY, -1))) bottom++;
  assert.ok(bottom >= 2 && x1 > 0, 'bottom row shaded');
});
