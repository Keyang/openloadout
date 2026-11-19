// Framework addition made with sprite batch K22, fix round 1 (bundles/specs/core-sprites-3.md, ui-score-counter and
// ui-timer): engine/counter-styles.js, the three counter styles drawn as different shapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { fontMetrics } from '../../engine/pixel-font.js';
import { COUNTER_STYLES, counterPlate } from '../../engine/counters.js';
import { styledCounterPlate } from '../../engine/counter-styles.js';

const SIZES = [0, 0.5, 1];
const face = '#3f5068', frame = '#efe3c2';
const BOXES = [{ W: 96, w: 94, lead: 13 }, { W: 96, w: 94, lead: 0 }, { W: 64, w: 62, lead: 11 }, { W: 64, w: 62, lead: 0 }];

function draw(style, size, count, colon, b) {
  const g = new Surface(b.W, 24), metrics = fontMetrics(size, 'chunky');
  const out = styledCounterPlate(g, 1, 1, b.w, 22, { count, metrics, style, face, frame, colon, lead: b.lead });
  return { g, ...out };
}

// every layout counterPlate accepts
function* layouts() {
  for (const b of BOXES) for (const size of SIZES) for (let count = 2; count <= 7; count++) for (const colon of [-1, Math.floor(count / 2)]) {
    try { counterPlate(new Surface(b.W, 24), 1, 1, b.w, 22, { count, metrics: fontMetrics(size, 'chunky'), face, frame, colon, lead: b.lead }); }
    catch { continue; }
    yield { b, size, count, colon };
  }
}

test('styledCounterPlate draws every layout counterPlate accepts; text holds only face; same arguments, same pixels', () => {
  let n = 0;
  for (const { b, size, count, colon } of layouts()) for (const style of COUNTER_STYLES) {
    const a = draw(style, size, count, colon, b), again = draw(style, size, count, colon, b);
    assert.ok(a.g.data.every((v, i) => v === again.g.data[i]), 'repeatable');
    assert.equal(a.windows.length, count);
    for (const r of a.text) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      assert.equal(a.g.get(x, y), col(face), `${style} size ${size} count ${count} colon ${colon}: (${x}, ${y}) in text is face`);
    }
    for (const r of a.windows) assert.ok(r.x >= 1 + 5 + b.lead && r.x + r.w <= b.w - 4, 'windows inside the case after the lead');
    for (let x = 0; x < b.W; x++) assert.ok(!a.g.get(x, 0) && !a.g.get(x, 23), 'nothing on the top or bottom row');
    n++;
  }
  assert.ok(n > 100);
});

test('the three styles differ in shape: 40 or more pixels inside the case between any two', () => {
  for (const { b, size, count, colon } of layouts()) {
    const s = COUNTER_STYLES.map((st) => draw(st, size, count, colon, b).g);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      let d = 0;
      for (let k = 0; k < s[i].data.length; k++) if (s[i].data[k] !== s[j].data[k]) d++;
      assert.ok(d >= 40, `${COUNTER_STYLES[i]} vs ${COUNTER_STYLES[j]} at size ${size}, ${count} digits, colon ${colon}, ${b.w} wide: ${d} px`);
    }
  }
});
