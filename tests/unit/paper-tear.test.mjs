// engine/paper-tear.js: deckled bites along every side, a folded corner, hatch lines, a moved mark and a tooltip
// tail for paper-and-ink pieces (core-sprites-2, batch K11 fix round 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { TEAR_SIDES, deckleBites, tearEdges, foldCorner, hatchLines, moveMark, tooltipTail } from '../../engine/paper-tear.js';

const FACE = '#f0ead8', RULE = '#3f4a66', FLAP = '#b0a490';
const slab = (w = 60, h = 30, x = 5, y = 5) => {
  const g = new Surface(w + 10, h + 10);
  g.rect(x, y, w, h, FACE);
  for (let px = x; px < x + w; px++) { g.dot(px, y, INK); g.dot(px, y + h - 1, INK); }
  for (let py = y; py < y + h; py++) { g.dot(x, py, INK); g.dot(x + w - 1, py, INK); }
  return { g, box: { x, y, w, h } };
};
const opaque = (g) => { const out = new Set(); for (let i = 0; i < g.data.length; i++) if (g.data[i]) out.add(i); return out; };

test('TEAR_SIDES is the four sides, frozen', () => {
  assert.deepEqual([...TEAR_SIDES], ['top', 'right', 'bottom', 'left']);
  assert.ok(Object.isFrozen(TEAR_SIDES));
});

test('deckleBites puts bites on every side, inside the margins', () => {
  const box = { x: 0, y: 0, w: 92, h: 28 };
  const bites = deckleBites(box);
  for (const side of TEAR_SIDES) assert.ok(bites.some((b) => b.side === side), side);
  for (const b of bites) {
    const len = b.side === 'top' || b.side === 'bottom' ? box.w : box.h;
    assert.ok(b.at >= 8 && b.at + b.w <= len - 8, JSON.stringify(b));
  }
  assert.throws(() => deckleBites(box, { sides: ['up'] }));
});

test('tearEdges only removes pixels, bites 2 deep and inks the bite edge', () => {
  const { g, box } = slab();
  const before = opaque(g);
  const cleared = tearEdges(g, box, [{ side: 'top', at: 10, w: 2 }, { side: 'left', at: 10, w: 3 }]);
  const after = opaque(g);
  for (const i of after) assert.ok(before.has(i), 'no pixel added');
  assert.equal(cleared.size, 2 * 2 + 3 * 2);
  assert.equal(g.get(15, 5), 0); assert.equal(g.get(15, 6), 0);
  assert.equal(g.get(15, 7), col(INK), 'the pixel under the bite is inked');
  assert.equal(g.get(5, 15), 0); assert.equal(g.get(6, 15), 0); assert.equal(g.get(7, 15), col(INK));
});

test('tearEdges with a shadow shows it behind a bite and bites the shadow too', () => {
  const g = new Surface(80, 50), box = { x: 7, y: 5, w: 60, h: 30 };
  g.rect(box.x - 2, box.y + 2, box.w, box.h, INK);   // the shadow, down and to the left
  g.rect(box.x, box.y, box.w, box.h, FACE);
  tearEdges(g, box, [{ side: 'left', at: 10, w: 2 }], { shadow: { dx: -2, dy: 2, colour: INK } });
  // the bite in the body (columns 7, 8; rows 15, 16) shows the shadow of the body pixels 2 right and 2 up
  assert.equal(g.get(7, 15), col(INK)); assert.equal(g.get(8, 16), col(INK));
  // the shadow of the bitten pixels (columns 5, 6; rows 17, 18) is gone
  assert.equal(g.get(5, 17), 0); assert.equal(g.get(6, 18), 0);
});

test('foldCorner cuts the corner, inks the crease and fills the flap', () => {
  const { g, box } = slab();
  const sq = foldCorner(g, box, 5, { flap: FLAP });
  const cx = box.x + box.w - 1, cy = box.y;
  assert.deepEqual(sq, { x: cx - 5, y: cy, w: 6, h: 6 });
  for (let v = 0; v <= 5; v++) for (let u = 0; u <= 5; u++) {
    const got = g.get(cx - u, cy + v);
    if (u + v < 5) assert.equal(got, 0);
    else if (u + v === 5) assert.equal(got, col(INK));
    else assert.equal(got, col(FLAP));
  }
  assert.throws(() => foldCorner(g, box, 4, {}));
});

test('hatchLines draws unbroken diagonals only over drawn pixels', () => {
  const g = new Surface(30, 10); g.rect(2, 2, 24, 4, FACE);
  hatchLines(g, { x: 0, y: 0, w: 30, h: 10 }, RULE, { pitch: 4 });
  let n = 0;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 30; x++) {
    if (g.get(x, y) !== col(RULE)) continue;
    n++;
    assert.ok(x >= 2 && x < 26 && y >= 2 && y < 6, 'inside the drawn strip');
    if (y > 2 && x < 25) assert.equal(g.get(x + 1, y - 1), col(RULE), 'the line continues up and right');
  }
  assert.ok(n >= 12);
});

test('moveMark copies only the difference, moved', () => {
  const a = new Surface(20, 20), b = new Surface(20, 20), g = new Surface(20, 20);
  a.rect(0, 0, 20, 20, FACE); b.rect(0, 0, 20, 20, FACE); g.rect(0, 0, 20, 20, FACE);
  a.rect(10, 2, 3, 3, RULE);
  moveMark(g, a, b, { x: 0, y: 0, w: 20, h: 10 }, { dx: -2, dy: 2 });
  assert.equal(g.get(8, 4), col(RULE)); assert.equal(g.get(10, 6), col(RULE)); assert.equal(g.get(11, 2), col(FACE));
});

test('tooltipTail is at least 5 wide and 5 tall, inked round, and stays in its 8 px box', () => {
  const g = new Surface(30, 30); g.rect(1, 1, 28, 20, FACE);
  const r = tooltipTail(g, 1, 21, { rows: 5, width: 6, open: 2, face: FACE });
  assert.deepEqual(r, { x: 1, y: 21, w: 7, h: 5 });
  for (let y = 21; y < 30; y++) for (let x = 8; x < 30; x++) assert.equal(g.get(x, y), 0);
  let wide = 0; for (let x = 1; x < 8; x++) if (g.get(x, 21)) wide++;
  assert.ok(wide >= 5);
  for (let y = 21; y < 26; y++) assert.equal(g.get(1, y), col(INK), 'the left side is inked');
  assert.throws(() => tooltipTail(g, 1, 21, {}));
});
