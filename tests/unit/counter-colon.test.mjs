// Framework addition made with sprite batch K22, fix round 2 (bundles/specs/core-sprites-3.md, ui-timer):
// engine/counter-colon.js, a timer colon whose 2 px dots read at game size, in a bridge joining the two windows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { fontMetrics } from '../../engine/pixel-font.js';
import { COUNTER_STYLES } from '../../engine/counters.js';
import { styledCounterPlate } from '../../engine/counter-styles.js';
import { bridgeColonGap, wideCounterColon } from '../../engine/counter-colon.js';

const face = '#1f2c3d', frame = '#c98a3a', colour = '#4fd8ee';
const CASES = [];
for (const style of COUNTER_STYLES) for (const size of [0, 0.5, 1]) for (const [count, colon] of [[3, 1], [4, 2]]) for (const lead of [0, 11]) CASES.push({ style, size, count, colon, lead });

function plate({ style, size, count, colon, lead }) {
  const g = new Surface(64, 24), metrics = fontMetrics(size, 'chunky');
  const out = styledCounterPlate(g, 1, 1, 62, 22, { count, metrics, style, face, frame, colon, lead });
  return { g, metrics, ...out };
}

test('bridgeColonGap paints the gap as the inside of the left window and keeps every text area face only', () => {
  for (const c of CASES) {
    const { g, windows, text } = plate(c), run = bridgeColonGap(g, windows, c.colon);
    const a = windows[c.colon - 1], b = windows[c.colon];
    assert.equal(run.x, a.x + a.w - 1);
    assert.equal(run.x + run.w - 1, b.x);
    for (let py = a.y - 2; py <= a.y + a.h + 1; py++) for (let px = run.x; px < run.x + run.w; px++) assert.equal(g.get(px, py), g.get(a.x + a.w - 2, py), JSON.stringify(c));
    for (const r of text) for (let py = r.y; py < r.y + r.h; py++) for (let px = r.x; px < r.x + r.w; px++) assert.equal(g.get(px, py), col(face), JSON.stringify(c));
  }
});

test('wideCounterColon draws two dots 2 px wide with face on each side, symmetric about the digits', () => {
  for (const c of CASES) {
    const { g, windows, metrics } = plate(c);
    bridgeColonGap(g, windows, c.colon);
    const dots = wideCounterColon(g, windows, c.colon, metrics, { colour });
    assert.equal(dots.length, 2);
    let n = 0;
    for (const d of dots) {
      assert.equal(d.w, 2); assert.equal(d.h, 2);
      for (let py = d.y; py < d.y + d.h; py++) {
        for (let px = d.x; px < d.x + d.w; px++) { assert.equal(g.get(px, py), col(colour)); n++; }
        assert.equal(g.get(d.x - 1, py), col(face), JSON.stringify(c));
        assert.equal(g.get(d.x + d.w, py), col(face), JSON.stringify(c));
      }
    }
    assert.ok(n >= 8);
    const top = dots[0].y, bottom = dots[1].y + dots[1].h - 1, win = windows[c.colon];
    const capTop = win.y + Math.floor((win.h - metrics.cap) / 2);
    assert.equal(top - capTop, capTop + metrics.cap - 1 - bottom, JSON.stringify(c));
  }
});

test('the colon helpers refuse bad input', () => {
  const { g, windows, metrics } = plate(CASES[0]);
  assert.throws(() => bridgeColonGap(g, windows, 0));
  assert.throws(() => wideCounterColon(g, windows, 1, metrics, {}));
  assert.throws(() => wideCounterColon(g, windows, 1, metrics, { colour, width: 9 }));
});
