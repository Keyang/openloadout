// Framework addition made with helper batch H4b (bundles/specs/core-sprites-3.md, "New helpers"):
// engine/counters.js, a plate of digit windows, a rolling digit and a clock mark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp } from '../../engine/color.js';
import { fontMetrics, fontGlyph, drawText, FONT_STYLES } from '../../engine/pixel-font.js';
import { COUNTER_STYLES, counterWindows, counterPlate, rollDigit, clockIn } from '../../engine/counters.js';

const SIZES = [0, 0.5, 1];
const face = '#1f2c3d', frame = '#c98a3a', colour = '#ffffff';

test('COUNTER_STYLES lists plate, strip and drum', () => {
  assert.deepEqual([...COUNTER_STYLES], ['plate', 'strip', 'drum']);
  assert.ok(Object.isFrozen(COUNTER_STYLES));
  assert.throws(() => counterPlate(new Surface(40, 20), 0, 0, 40, 20, { count: 3, metrics: fontMetrics(), style: 'flip', face, frame }), /plate, strip, drum/);
  // too many windows for the case, or too much lead before them, throws instead of drawing over the band
  assert.throws(() => counterPlate(new Surface(40, 20), 0, 0, 40, 20, { count: 12, metrics: fontMetrics(), face, frame }), /do not fit/);
  assert.throws(() => counterPlate(new Surface(40, 20), 0, 0, 40, 20, { count: 3, lead: 30, metrics: fontMetrics(), face, frame }), /do not fit/);
  assert.doesNotThrow(() => counterPlate(new Surface(40, 20), 0, 0, 40, 20, { count: 3, metrics: fontMetrics(), face, frame }));
});

test('(1) counterWindows: never overlapping, gap apart, inside the box after lead, the stated size', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (let count = 3; count <= 8; count++) for (const colon of [-1, Math.floor(count / 2)]) for (const [gap, pad, lead] of [[1, 1, 0], [2, 1, 12], [1, 2, 6]]) {
      const box = { x: 3, y: 2, w: lead + count * (m.digitW + 2 * pad + gap) + 6, h: m.cap + 2 * pad + 5 };
      const wins = counterWindows(box.x, box.y, box.w, box.h, count, m, { gap, pad, lead, colon });
      const at = `${style} ${m.cap} count ${count} colon ${colon}`;
      assert.equal(wins.length, count, at);
      wins.forEach((w, i) => {
        assert.equal(w.w, m.digitW + 2 * pad, at); assert.equal(w.h, m.cap + 2 * pad, at);
        assert.ok(w.x >= box.x + lead && w.x + w.w <= box.x + box.w && w.y >= box.y && w.y + w.h <= box.y + box.h, `${at}: window ${i} outside`);
        assert.ok(Math.abs(w.y - box.y - (box.y + box.h - w.y - w.h)) <= 1, `${at}: centred up and down`);
        if (i) assert.equal(w.x - (wins[i - 1].x + wins[i - 1].w), i === colon ? Math.max(3, gap) : gap, `${at}: gap before ${i}`);
      });
      assert.equal(wins[count - 1].x + wins[count - 1].w, box.x + box.w, `${at}: right-aligned`);
    }
  }
});

test('(2) counterPlate: its text rectangles hold only the face, edge is a pixel of the band, and it repeats exactly', () => {
  for (const style of COUNTER_STYLES) for (const s of SIZES) for (const colon of [-1, 2]) {
    const metrics = fontMetrics(s, 'chunky'), opt = { count: 5, metrics, style, face, frame, lead: 10, colon, border: s, corner: 1 - s };
    const h = metrics.cap + 12, g = new Surface(90, h + 2);
    const out = counterPlate(g, 1, 1, 88, h, opt);
    assert.equal(out.windows.length, 5);
    assert.equal(out.text.length, 5);
    for (const r of out.text) {
      assert.ok(r.w > 0 && r.h > 0);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(g.get(x, y), col(face), `${style}: ${x},${y} in a text area is not the face`);
    }
    const F = ramp(frame), band = [F.light, F.base, F.dark].map(col);
    assert.ok(band.includes(g.get(out.edge.x, out.edge.y)), `${style}: edge is on the band`);
    assert.deepEqual(out.case, { x: 1, y: 1, w: 88, h });
    if (style === 'drum') for (const [i, w] of out.windows.entries()) assert.equal(out.text[i].h, w.h - 2, 'drum: the dark rows are not text');
    const again = new Surface(90, h + 2);
    counterPlate(again, 1, 1, 88, h, opt);
    assert.deepEqual([...again.data], [...g.data], `${style}: same pixels`);
  }
});

test('(3) rollDigit: k 0 is from at rest, k 1 is to at rest, k 0.5 shows both, never outside the window', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const metrics = fontMetrics(s, style);
    const win = { x: 5, y: 4, w: metrics.digitW + 4, h: metrics.cap + 2 };
    const at = (d, k) => { const g = new Surface(30, 24); rollDigit(g, win, d[0], d[1], k, metrics, { colour }); return g; };
    const rest = (n) => {
      const g = new Surface(30, 24), gw = fontGlyph(String(n), metrics).w;
      drawText(g, String(n), win.x + Math.floor((win.w - gw) / 2), win.y + Math.floor((win.h - metrics.cap) / 2) + metrics.cap, { metrics, colour, outline: 'none' });
      return g;
    };
    for (const [a, b] of [[3, 4], [9, 0], [1, 7]]) {
      assert.deepEqual([...at([a, b], 0).data], [...rest(a).data], `${style} ${metrics.cap}: k 0 is ${a}`);
      assert.deepEqual([...at([a, b], 1).data], [...rest(b).data], `${style} ${metrics.cap}: k 1 is ${b}`);
      const half = at([a, b], 0.5), up = new Set(), down = new Set();
      for (let y = 0; y < 24; y++) for (let x = 0; x < 30; x++) {
        if (!half.get(x, y)) continue;
        assert.ok(x >= win.x && x < win.x + win.w && y >= win.y && y < win.y + win.h, `${style}: ${x},${y} outside the window`);
        (y < win.y + win.h / 2 ? up : down).add(`${x},${y}`);
      }
      assert.ok(up.size > 0 && down.size > 0, `${style} ${metrics.cap}: k 0.5 shows part of both digits (${a} to ${b})`);
      for (const k of [0.1, 0.3, 0.7, 0.9]) {
        const g = at([a, b], k);
        for (let y = 0; y < 24; y++) for (let x = 0; x < 30; x++) if (g.get(x, y)) assert.ok(x >= win.x && x < win.x + win.w && y >= win.y && y < win.y + win.h);
      }
    }
  }
});

test('(4) clockIn: hour 0 and hour 0.5 differ by 3 or more pixels at r 5', () => {
  const draw = (opt) => { const g = new Surface(16, 16); g.fill(0, 0, 16, 16, clockIn(8, 8, 5, opt), '#ffffff'); return g; };
  const a = draw({ hour: 0, minute: 0.25 }), b = draw({ hour: 0.5, minute: 0.25 });
  let d = 0;
  for (let i = 0; i < a.data.length; i++) d += (a.data[i] ? 1 : 0) !== (b.data[i] ? 1 : 0) ? 1 : 0;
  assert.ok(d >= 3, `differ by ${d}`);
  // the ring is there and the minute hand is longer than the hour hand
  const ring = draw({ hour: 0, minute: 0 });
  for (const [x, y] of [[8, 3], [3, 8], [12, 8], [8, 12]]) assert.ok(ring.get(x, y), `${x},${y} on the ring`);
  const reach = (hour, minute) => { const g = draw({ hour, minute }); let top = 16; for (let y = 4; y < 8; y++) if (g.get(8, y)) top = Math.min(top, y); return top; };
  assert.ok(reach(0.5, 0) < reach(0, 0.5), 'the minute hand reaches further up than the hour hand');
});
