// Framework additions of batch S09 (hive-mother):
//   engine/hive.js         discSpots          spots spread evenly over a round surface; a longer list keeps the shorter one's spots
//   engine/hive.js         segmentRingsIn     the furrows between the segments of a swollen body seen from beyond its tip
//   engine/hive.js         antlerIn           a curved beam with tines branching off one side
//   engine/hive.js         frillIn            a scalloped frill of ribs and skin standing out round an ellipse
//   engine/hive.js         blister            an egg sac with a lit core, or burst
//   engine/hive.js         sprayFan           a fan of liquid sprayed from a point
//   (rigs/brood-queen.js, a bloated top-down queen that faces the camera, was also added; R2 deleted it and its tests)
// R2: rigs/brood-queen.js went: the tests of the brood queen rig are deleted; those of engine/hive.js stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import { discSpots, segmentRingsIn, antlerIn, frillIn, blister, sprayFan } from '../../engine/hive.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (test, w = 96, h = 96) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x + 0.5, y + 0.5)) n++; return n; };
const has = (g, hex) => g.data.includes(col(hex));

// ---- engine/hive.js ---------------------------------------------------------------------------------

test('discSpots: spread out, repeatable, and a longer list starts with the shorter one', () => {
  const a = discSpots(6, { seed: 3 }), b = discSpots(12, { seed: 3 });
  assert.equal(a.length, 6);
  assert.deepEqual(b.slice(0, 6), a, 'adding spots leaves the first ones where they were');
  assert.deepEqual(discSpots(12, { seed: 3 }), b, 'the same seed gives the same spots');
  assert.notDeepEqual(discSpots(12, { seed: 4 }), b);
  for (const [u, v, h] of b) { assert.ok(Math.hypot(u, v) <= 0.85 + 1e-9, 'inside the reach'); assert.ok(h >= 0 && h < 1); }
  let near = Infinity;
  for (let i = 0; i < b.length; i++) for (let j = 0; j < i; j++) near = Math.min(near, Math.hypot(b[i][0] - b[j][0], b[i][1] - b[j][1]));
  assert.ok(near > 0.2, `no two spots bunch up (nearest pair ${near.toFixed(2)} apart)`);
});

test('discSpots: fixed spots come first as given, and nothing sits where it is kept out', () => {
  const fixed = [[-0.9, 0.2], [0.9, 0.2]];
  const s = discSpots(10, { fixed, keepOut: (u, v) => v > 0.3 });
  assert.deepEqual(s.slice(0, 2).map(([u, v]) => [u, v]), fixed);
  for (const [, v] of s.slice(2)) assert.ok(v <= 0.3);
  assert.equal(discSpots(1, { fixed }).length, 1, 'never more than asked for');
  assert.deepEqual(discSpots(0), []);
});

test('segmentRingsIn: thin furrows inside the body, none at the tip', () => {
  const f = segmentRingsIn(48, 44, 26, 22, [0.5, 0.76]);
  const body = (px, py) => ((px - 48) / 26) ** 2 + ((py - 44) / 22) ** 2 <= 1;
  let n = 0;
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (f(x + 0.5, y + 0.5)) { n++; assert.ok(body(x + 0.5, y + 0.5), `(${x}, ${y}) is inside the body`); assert.ok(y + 0.5 >= 22 + 2 * 22 * 0.5 * 0.3, 'the top of each ring is left out'); }
  assert.ok(n > 40 && n < 260, `furrows are lines, not areas (${n} px)`);
  assert.ok(count(segmentRingsIn(48, 44, 26, 22, [0.5, 0.76], { thick: 2 })) > n, 'thick widens them');
  assert.equal(count(segmentRingsIn(48, 44, 26, 22, [])), 0);
});

test('antlerIn: a beam with tines; the two sides mirror each other', () => {
  const plain = count(antlerIn(48, 60, PI - 0.9, 20, { tines: 0 })), branched = count(antlerIn(48, 60, PI - 0.9, 20, { tines: 2 }));
  assert.ok(plain > 20);
  assert.ok(branched > plain + 8, `tines add to the beam (${plain} -> ${branched})`);
  assert.ok(antlerIn(48, 60, PI - 0.9, 20)(48.2, 59.8), 'it starts at its root');
  const right = antlerIn(48, 60, PI - 0.9, 20, { curl: 0.7, spread: 1 }), left = antlerIn(48, 60, PI + 0.9, 20, { curl: -0.7, spread: -1 });
  let off = 0;
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (right(x + 0.5, y + 0.5) !== left(96 - x - 0.5, y + 0.5)) off++;
  assert.equal(off, 0, 'mirrored angles give a mirrored antler');
});

test('frillIn: ribs stand out past the rim by the reach, and the skin dips between them', () => {
  const V = frillIn(48, 48, 20, 16, 8, { ribs: 9, taper: 0 });
  assert.equal(V.tips.length, 9);
  assert.equal(V.roots.length, 9);
  const mid = V.tips[4];
  assert.ok(Math.abs(mid[0] - 48) < 1e-6 && Math.abs(mid[1] - (48 - 16 - 8)) < 1e-6, 'the middle rib stands straight out of the top');
  assert.ok(V.inside(48, 48 - 16 - 6), 'the frill is filled out to near its tips');
  assert.ok(!V.inside(48, 48 + 16 + 4), 'nothing under the ellipse: the fan is open at the bottom');
  const smooth = count(frillIn(48, 48, 20, 16, 8, { scoop: 0 }).inside), scooped = count(frillIn(48, 48, 20, 16, 8, { scoop: 1 }).inside);
  assert.ok(scooped < smooth - 20, `a deep scoop takes skin away (${smooth} -> ${scooped})`);
  const waved = frillIn(48, 48, 20, 16, 8, { ripple: (i) => (i === 4 ? 3 : 0), taper: 0 });
  assert.ok(Math.abs(waved.tips[4][1] - (48 - 16 - 11)) < 1e-6, 'ripple moves one rib');
});

test('blister: a dome with a lit core; flaring is white-hot, burst is a hole', () => {
  const draw = (opt) => { const g = new Surface(24, 24); blister(g, 12, 12, 4.5, { skin: '#b04a8a', core: '#9fe040', ...opt }); return g; };
  const litOne = draw({ level: 1 }), flare = draw({ level: 2 }), open = draw({ open: true }), plain = draw({ core: null });
  assert.ok(has(litOne, '#9fe040'), 'the core shows');
  assert.ok(has(flare, '#ffffff') && !has(litOne, '#ffffff'), 'only a flaring core is white');
  assert.ok(!has(open, '#9fe040') && !has(plain, '#9fe040'), 'a burst or plain sac has no core');
  const b = litOne.bounds();
  assert.ok(b.x0 >= 7 && b.x1 <= 16 && b.y0 >= 7 && b.y1 <= 16, 'it stays inside its radius');
  const shaded = draw({ under: '#8563a5' });
  assert.ok(lit(shaded) > lit(litOne), 'the line of shade beside it adds pixels');
  assert.equal(lit((() => { const g = new Surface(8, 8); blister(g, 4, 4, 0.5); return g; })()), 1, 'a tiny one is a dot');
});

test('sprayFan: grows from the mouth, stays in its box, and never ends empty', () => {
  const box = [2, 2, 46, 46];
  const at = (t) => { const g = new Surface(48, 48); sprayFan(g, { t, x: 24, y: 10, angle: 0, arc: 1.6, reach: 60, jets: 6, colour: '#9fe040', box }); return g; };
  const frames = [0.1, 0.3, 0.5, 0.75, 1].map(at);
  for (const g of frames) {
    const b = g.bounds();
    assert.ok(b, 'something is drawn');
    assert.ok(b.x0 >= 2 && b.y0 >= 2 && b.x1 <= 45 && b.y1 <= 45, `inside the box: ${JSON.stringify(b)}`);
  }
  assert.ok(frames[2].bounds().y1 > frames[0].bounds().y1, 'the jets travel away from the mouth');
  assert.ok(lit(frames[4]) >= 2 && lit(frames[4]) < lit(frames[2]), 'it ends as a few drops');
  assert.deepEqual(at(0.5).data, frames[2].data, 'repeatable');
});

