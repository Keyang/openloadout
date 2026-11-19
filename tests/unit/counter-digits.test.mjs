// Framework addition made with sprite batch K22 (bundles/specs/core-sprites-3.md, ui-score-counter and ui-timer):
// engine/counter-digits.js, a digit standing still in a counter window (nudged, flashed or with its top row lit) and
// the colon between two windows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { fontMetrics, fontGlyph, FONT_STYLES } from '../../engine/pixel-font.js';
import { counterPlate, rollDigit } from '../../engine/counters.js';
import { windowPen, windowDigit, counterColon } from '../../engine/counter-digits.js';

const SIZES = [0, 0.5, 1];
const face = '#1f2c3d', frame = '#c98a3a', colour = '#4fd8ee', lit = '#ffffff';
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const drawn = (s) => { const out = []; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.get(x, y)) out.push([x, y]); return out; };

function plate(style, size, count = 4, colon = -1) {
  const g = new Surface(64, 24), metrics = fontMetrics(size, style);
  const out = counterPlate(g, 1, 1, 62, 22, { count, metrics, face, frame, colon });
  return { g, metrics, ...out };
}

test('windowPen centres a character in its window, as rollDigit places it at rest', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) for (let d = 0; d <= 9; d++) {
    const { metrics, windows } = plate(style, s), win = windows[0];
    const a = new Surface(64, 24), b = new Surface(64, 24);
    rollDigit(a, win, d, d, 0, metrics, { colour });
    windowDigit(b, win, String(d), metrics, { colour });
    assert.ok(same(a, b), `${style} size ${s} digit ${d}`);
    const pen = windowPen(win, String(d), metrics), gl = fontGlyph(String(d), metrics);
    assert.ok(pen.x >= win.x && pen.x + gl.w <= win.x + win.w && pen.base - metrics.cap >= win.y && pen.base <= win.y + win.h, `${style} ${s} ${d}: pen inside`);
  }
});

test('windowDigit nudges by whole pixels, never draws outside the window, and lights the top row', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const { metrics, windows } = plate(style, s), win = windows[1];
    const rest = new Surface(64, 24);
    windowDigit(rest, win, '8', metrics, { colour });
    const base = drawn(rest);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      const m = new Surface(64, 24);
      windowDigit(m, win, '8', metrics, { colour, dx, dy });
      const moved = drawn(m);
      assert.deepEqual(moved, base.map(([x, y]) => [x + dx, y + dy]).sort((p, q) => p[1] - q[1] || p[0] - q[0]), `${style} ${s} ${dx},${dy}`);
      for (const [x, y] of moved) assert.ok(x >= win.x && x < win.x + win.w && y >= win.y && y < win.y + win.h, `${style} ${s}: inside`);
    }
    // a nudge past the window's edge is clipped, not drawn over the ink
    const far = new Surface(64, 24);
    windowDigit(far, win, '8', metrics, { colour, dx: 4 });
    for (const [x, y] of drawn(far)) assert.ok(x < win.x + win.w && y < win.y + win.h, `${style} ${s}: clipped`);
    // the top row of the glyph in the lit colour, the rest unchanged
    const l = new Surface(64, 24);
    windowDigit(l, win, '8', metrics, { colour, lit });
    const top = Math.min(...base.map(([, y]) => y));
    for (const [x, y] of base) assert.equal(l.get(x, y), col(y === top ? lit : colour), `${style} ${s} (${x}, ${y})`);
    assert.equal(drawn(l).length, base.length);
  }
});

test('counterColon draws two dots in the gap before the colon window, symmetric, touching no window', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) for (const [count, colon] of [[3, 1], [4, 2]]) {
    const { g, metrics, windows } = plate(style, s, count, colon);
    const before = new Surface(64, 24); before.blit(g);
    const dots = counterColon(g, windows, colon, metrics, { colour: lit });
    assert.equal(dots.length, 2);
    const changed = [];
    for (let y = 0; y < 24; y++) for (let x = 0; x < 64; x++) if (g.get(x, y) !== before.get(x, y)) changed.push([x, y]);
    assert.ok(changed.length >= 2, `${style} ${s}: something drawn`);
    const left = windows[colon - 1], right = windows[colon];
    for (const [x, y] of changed) {
      assert.equal(g.get(x, y), col(lit));
      assert.ok(x > left.x + left.w && x < right.x - 1, `${style} ${s}: between the window inks`);
      const pen = windowPen(right, '0', metrics);
      assert.ok(y >= pen.base - metrics.cap && y < pen.base, `${style} ${s}: within the digits' rows`);
    }
    const ys = changed.map(([, y]) => y), mid = (Math.min(...ys) + Math.max(...ys)) / 2, pen = windowPen(right, '0', metrics);
    assert.equal(mid, pen.base - metrics.cap + (metrics.cap - 1) / 2, `${style} ${s}: centred on the digits`);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 2, `${style} ${s}: two dots, apart`);
  }
  assert.throws(() => counterColon(new Surface(8, 8), [{ x: 0, y: 0, w: 4, h: 4 }], 0, fontMetrics(), { colour }), /colon/);
});

test('same arguments, same pixels', () => {
  const draw = () => {
    const { g, metrics, windows } = plate('chunky', 0.5, 4, 2);
    windowDigit(g, windows[0], '3', metrics, { colour, dx: -1, lit });
    counterColon(g, windows, 2, metrics, { colour });
    return g;
  };
  assert.ok(same(draw(), draw()));
});
