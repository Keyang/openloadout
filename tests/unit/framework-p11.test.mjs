// Framework additions of batch P11 (pickups of kit-platformer-fantasy): engine/shapes.js (ways to place,
// turn and inset a shape test, and the shapes small objects are made of) and engine/pickups.js (the two
// standard pickup clips, where a pickup is in each frame, the collect burst, glints, a cut gem, a bottle).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn, ellipseIn } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { placedIn, insetIn, turnedIn, ringIn, heartIn, starPoints, starIn, GEM_CUTS, gemIn, gemFacets, BOTTLE_SHAPES, bottleIn } from '../../engine/shapes.js';
import { boundsOf } from '../../engine/shapes.js';      // added in fix round 1
import { glint } from '../../engine/pickups.js';

const S = 32;
const paint = (test, w = S, h = S) => new Surface(w, h).fill(0, 0, w, h, test, '#ffffff');
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const mirrored = (g) => { for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w / 2; x++) if (!g.get(x, y) !== !g.get(g.w - 1 - x, y)) return false; return true; };
const colours = (g) => new Set([...g.data].filter(Boolean));

// ---- engine/shapes.js ------------------------------------------------------------

test('placedIn moves, turns and scales a shape test, and joins a list', () => {
  assert.deepEqual(paint(placedIn(rectIn(-2, -3, 4, 6), 10, 10)).bounds(), { x0: 8, y0: 7, x1: 11, y1: 12 });
  assert.deepEqual(paint(placedIn(rectIn(-2, -3, 4, 6), 10, 10, { angle: Math.PI / 2 })).bounds(), { x0: 7, y0: 8, x1: 12, y1: 11 }, 'a quarter turn swaps width and height');
  assert.deepEqual(paint(placedIn(rectIn(-2, -3, 4, 6), 10, 10, { sx: 2, sy: 0.5 })).bounds(), { x0: 6, y0: 8, x1: 13, y1: 10 }, 'wider and shorter');
  assert.deepEqual(paint(placedIn([rectIn(-4, -1, 2, 2), rectIn(2, -1, 2, 2)], 10, 10)).bounds(), { x0: 6, y0: 9, x1: 13, y1: 10 }, 'a list is one shape');
  // clockwise on screen: a point that starts above the centre ends up to its right
  const up = placedIn(rectIn(-0.5, -6, 1, 2), 10, 10, { angle: Math.PI / 2 });
  assert.equal(up(15, 10), true);
  assert.equal(up(5, 10), false);
  assert.equal(lit(paint(placedIn(rectIn(-2, -2, 4, 4), 10, 10, { sx: 0 }))), 0, 'a scale of nothing draws nothing, and does not throw');
});

test('insetIn takes one pixel off every side', () => {
  assert.deepEqual(paint(insetIn(rectIn(4, 4, 10, 8))).bounds(), { x0: 5, y0: 5, x1: 12, y1: 10 });
  assert.deepEqual(paint(insetIn(rectIn(4, 4, 10, 8), 2)).bounds(), { x0: 6, y0: 6, x1: 11, y1: 9 });
  assert.equal(lit(paint(insetIn(rectIn(4, 4, 2, 2)))), 0, 'nothing is left of something two pixels wide');
});

test('turnedIn: face-on it is the badge, edge-on a bar as thick as the badge, and half a turn brings it back', () => {
  const disc = ellipseIn(0, 0, 8, 8), at = (t) => placedIn(t, 16, 16);
  const front = turnedIn(disc, 0, 2);
  assert.ok(same(paint(at(front.face)), paint(at(disc))));
  assert.ok(same(paint(at(front.body)), paint(at(disc))));
  assert.equal(front.squeeze, 1);
  const edge = turnedIn(disc, Math.PI / 2, 2);
  const bar = paint(at(edge.body)).bounds();
  assert.equal(bar.x1 - bar.x0 + 1, 2, 'edge-on it is as wide as it is thick');
  assert.equal(bar.y1 - bar.y0 + 1, 16);
  assert.equal(lit(paint(at(edge.face))), 0, 'and shows no face');
  const mid = turnedIn(disc, Math.PI / 4, 2);
  const face = paint(at(mid.face)), body = paint(at(mid.body));
  assert.ok(lit(body) > lit(face), 'turned, the edge band shows beside the face');
  for (let i = 0; i < face.data.length; i++) if (face.data[i]) assert.ok(body.data[i], 'the face lies inside the body');
  assert.ok(face.bounds().x1 - face.bounds().x0 + 1 < 16, 'the face is squeezed');
  assert.ok(same(paint(at(turnedIn(disc, Math.PI, 2).body)), paint(at(disc))), 'half a turn shows the other face');
});

test('ringIn is a circle line', () => {
  const ring = paint(ringIn(16, 16, 8, 2));
  assert.equal(ring.get(16, 16), 0, 'empty in the middle');
  assert.ok(ring.get(16, 9) && ring.get(23, 16), 'drawn at its edge');
  assert.equal(ring.get(16, 11), 0, 'only 2 px wide');
  assert.deepEqual(ring.bounds(), { x0: 8, y0: 8, x1: 23, y1: 23 });
});

test('the pixel heart is made of whole 2 px blocks at every size', () => {
  for (const w of [12, 14, 16, 18, 20, 24]) {
    const g = paint(heartIn(16, 16, w, w, 'pixel')), b = g.bounds();
    assert.equal((b.x1 - b.x0 + 1) % 4, 0, `width ${w}: an even number of blocks across`);
    for (let y = b.y0; y <= b.y1; y += 2) for (let x = b.x0; x <= b.x1; x += 2) {
      const n = [g.get(x, y), g.get(x + 1, y), g.get(x, y + 1), g.get(x + 1, y + 1)].filter(Boolean).length;
      assert.ok(n === 0 || n === 4, `width ${w}: block at ${x},${y} is whole`);
    }
    assert.ok(mirrored(g));
  }
  assert.deepEqual([12, 16, 20].map((w) => { const b = paint(heartIn(16, 16, w, w, 'pixel')).bounds(); return [b.x1 - b.x0 + 1, b.y1 - b.y0 + 1]; }), [[12, 10], [16, 14], [20, 16]]);
});

test('starIn: sharp points, the first one up, as many as asked for', () => {
  for (const n of [4, 5, 6, 8]) {
    const pts = starPoints(16, 16, 9, n);
    assert.equal(pts.length, 2 * n);
    assert.ok(Math.abs(pts[0][0] - 16) < 1e-9 && Math.abs(pts[0][1] - 7) < 1e-9, 'the first point is straight up');
    const g = paint(starIn(16, 16, 9, n));
    assert.ok(mirrored(g), `${n} points: symmetrical`);
    assert.ok(g.bounds().y0 === 7 || g.bounds().y0 === 8, 'the top tip reaches the top of its circle');
    assert.ok(g.get(16, 16), 'solid in the middle');
    // sharp, not plump: the star covers well under the disc it fits in
    assert.ok(lit(g) < 0.7 * lit(paint(ellipseIn(16, 16, 9, 9))), `${n} points: ${lit(g)} px`);
    // count the tips: runs of drawn pixels round a circle near the tips
    let tips = 0, prev = false;
    for (let i = 0; i <= 720; i++) { const a = (i / 720) * Math.PI * 2; const on = !!g.get(Math.floor(16 + Math.sin(a) * 7.6), Math.floor(16 - Math.cos(a) * 7.6)); if (on && !prev && i > 0) tips++; prev = on; }
    assert.ok(Math.abs(tips - n) <= 1, `${n} points: found ${tips} tips`);
  }
  assert.ok(!same(paint(starIn(16, 16, 9, 5)), paint(starIn(16, 16, 9, 5, { angle: Math.PI }))), 'angle turns it');
  assert.ok(lit(paint(starIn(16, 16, 9, 5, { inner: 0.7 }))) > lit(paint(starIn(16, 16, 9, 5, { inner: 0.3 }))), 'inner sets how deep the corners are');
});

test('gemIn and gemFacets: every cut fills its box and its facets cover it in four tones at most', () => {
  assert.deepEqual(GEM_CUTS, ['diamond', 'emerald', 'round', 'shard', 'heart']);
  for (const cut of GEM_CUTS) {
    const stone = gemIn(16, 16, 8, 7, cut), g = paint(stone), b = g.bounds();
    assert.ok(b.x0 >= 8 && b.x1 <= 23 && b.y0 >= 9 && b.y1 <= 22, `${cut}: inside its box`);
    assert.ok(b.x1 - b.x0 + 1 >= 11 && b.y1 - b.y0 + 1 >= 13, `${cut}: nearly fills it`);
    const facets = gemFacets(16, 16, 8, 7, cut);
    assert.ok(facets.length >= 4, `${cut}: ${facets.length} facets`);
    assert.ok(facets.every((f) => [2, 1, 0, -1].includes(f.tone) && f.pts.length >= 3));
    assert.ok(facets.some((f) => f.tone === 2) && facets.some((f) => f.tone === -1), `${cut}: has a highlight and a dark facet`);
    // every pixel of the stone lies in some facet
    const covered = new Surface(S, S);
    for (const f of facets) covered.poly(f.pts, '#ffffff');
    let bare = 0;
    for (let i = 0; i < g.data.length; i++) if (g.data[i] && !covered.data[i]) bare++;
    assert.ok(bare <= 2, `${cut}: ${bare} pixels of the stone have no facet`);
  }
  assert.ok(mirrored(paint(gemIn(16, 16, 8, 7, 'diamond'))));
  assert.ok(same(paint(heartIn(16, 16, 16, 14, 'crystal')), paint(gemIn(16, 16, 8, 7, 'heart'))), 'the crystal heart is the heart cut');
});

test('bottleIn: whole-pixel bottles of the height asked for, cork on top, with room for liquid', () => {
  assert.deepEqual(BOTTLE_SHAPES, ['round', 'tall', 'flask', 'vial']);
  const outlines = [];
  for (const shape of BOTTLE_SHAPES) for (const h of [14, 18, 21, 22]) {
    const B = bottleIn(h, shape), cy = h % 2 ? 16.5 : 16;
    const at = (t) => placedIn(t, 16, cy);
    const glass = paint(at(B.glass)), cork = paint(at(B.cork)), all = paint((x, y) => at(B.glass)(x, y) || at(B.cork)(x, y));
    const b = all.bounds();
    assert.equal(b.y1 - b.y0 + 1, h, `${shape} ${h}: its height`);
    assert.ok(mirrored(all), `${shape} ${h}: symmetrical`);
    assert.equal(cork.bounds().y0, b.y0, `${shape} ${h}: the cork is the top`);
    assert.ok(glass.bounds().y0 > b.y0, `${shape} ${h}: the glass starts under it`);
    assert.ok(b.x1 - b.x0 + 1 <= 2 * B.half, `${shape} ${h}: half covers its width`);
    assert.ok(B.fill[0] < B.fill[1] - 3, `${shape} ${h}: at least 4 px of depth for liquid`);
    const inner = insetIn(at(B.glass), 1);
    assert.ok(inner(16.5, cy + B.fill[1] - 0.5) || inner(15.5, cy + B.fill[1] - 0.5), `${shape} ${h}: the bottom of the fill is inside the glass`);
    assert.ok(lit(paint((x, y) => at(B.shine)(x, y) && inner(x, y))) >= 2, `${shape} ${h}: the highlight lies on the glass`);
    if (h === 18) outlines.push(all);
  }
  for (let i = 0; i < outlines.length; i++) for (let j = i + 1; j < outlines.length; j++) assert.ok(!same(outlines[i], outlines[j]), `${BOTTLE_SHAPES[i]} and ${BOTTLE_SHAPES[j]} differ`);
});

// ---- engine/pickups.js -----------------------------------------------------------

test('glint: a band that stays inside the shape and slides across it', () => {
  const disc = ellipseIn(16, 16, 8, 8);
  const at = (phase) => { const g = new Surface(S, S); glint(g, disc, { x: 16, y: 16, r: 8, phase }); return g; };
  const mid = at(0);
  assert.ok(lit(mid) >= 10, 'a visible band');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (mid.get(x, y)) assert.ok(disc(x + 0.5, y + 0.5), 'inside the shape');
  assert.equal(lit(at(-1.7)), 0); assert.equal(lit(at(1.7)), 0);
  const cx = (g) => { let s = 0, n = 0; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g.get(x, y)) { s += x; n++; } return s / n; };
  assert.ok(cx(at(-0.6)) < cx(mid) && cx(mid) < cx(at(0.6)), 'it moves from left to right');
  const gold = new Surface(S, S); glint(gold, disc, { x: 16, y: 16, r: 8, colour: '#f2c230' });
  assert.deepEqual([...colours(gold)], [col('#f2c230')]);
});

test('boundsOf: the box of pixels a shape test covers, without drawing it', () => {
  assert.deepEqual(boundsOf(rectIn(8, 7, 4, 6), S, S), { x0: 8, y0: 7, x1: 11, y1: 12 });
  assert.deepEqual(boundsOf([rectIn(6, 9, 2, 2), rectIn(12, 9, 2, 2)], S, S), { x0: 6, y0: 9, x1: 13, y1: 10 }, 'a list is measured as one shape');
  // the same answer as painting the shape and asking the surface, for a slanted shape too
  for (const angle of [0, -Math.PI / 4, 0.6, 1.3]) {
    const key = placedIn([ellipseIn(0, -6, 5, 5), rectIn(-1, -1, 2, 12), rectIn(-5, 6, 4, 2)], 16, 16, { angle });
    assert.deepEqual(boundsOf(key, S, S), paint(key).bounds(), `angle ${angle}`);
  }
  assert.equal(boundsOf(rectIn(40, 40, 4, 4), S, S), null, 'nothing inside the frame: null');
  assert.deepEqual(boundsOf(rectIn(-5, -5, 100, 100), 20, 12), { x0: 0, y0: 0, x1: 19, y1: 11 }, 'never past the frame it was asked about');
  assert.deepEqual(boundsOf(rectIn(2, 3, 4, 4), 16), { x0: 2, y0: 3, x1: 5, y1: 6 }, 'height defaults to the width');
});
