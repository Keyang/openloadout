// Framework additions of batch P11 (pickups of kit-platformer-fantasy): engine/shapes.js (ways to place,
// turn and inset a shape test, and the shapes small objects are made of) and engine/pickups.js (the two
// standard pickup clips, where a pickup is in each frame, the collect burst, glints, a cut gem, a bottle).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn, ellipseIn } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { placedIn, insetIn, turnedIn, ringIn, heartIn, HEART_STYLES, starPoints, starIn, GEM_CUTS, gemIn, gemFacets, wingIn, wingReach, BOTTLE_SHAPES, bottleIn } from '../../engine/shapes.js';
import { boundsOf, skullIn } from '../../engine/shapes.js';      // added in fix round 1
import { pickupClips, pickupPose, heartbeat, glint, gleam, collectBurst, drawGem, drawBottle } from '../../engine/pickups.js';

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

test('heartIn: every style fills its box, is symmetrical and has a notch at the top and a point at the bottom', () => {
  assert.deepEqual(HEART_STYLES, ['classic', 'round', 'pixel', 'crystal']);
  for (const style of HEART_STYLES) {
    const g = paint(heartIn(16, 16, 16, 14, style)), b = g.bounds();
    assert.ok(mirrored(g), `${style}: symmetrical`);
    assert.ok(b.x1 - b.x0 + 1 >= 15 && b.x1 - b.x0 + 1 <= 17, `${style}: about 16 wide, got ${b.x1 - b.x0 + 1}`);
    assert.ok(b.y1 - b.y0 + 1 >= 13 && b.y1 - b.y0 + 1 <= 15, `${style}: about 14 tall, got ${b.y1 - b.y0 + 1}`);
    assert.equal(g.get(15, b.y0), 0, `${style}: the notch is open in the top row`);
    assert.ok(g.get(12, b.y0 + 1) && g.get(19, b.y0 + 1), `${style}: two lobes`);
    const bottom = [...Array(S).keys()].filter((x) => g.get(x, b.y1)).length;
    assert.ok(bottom <= 4, `${style}: comes to a point (${bottom} px in its last row)`);
  }
  const shapes = HEART_STYLES.map((s) => paint(heartIn(16, 16, 16, 14, s)));
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) assert.ok(!same(shapes[i], shapes[j]), `${HEART_STYLES[i]} and ${HEART_STYLES[j]} differ`);
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

test('wingIn opens to the side it is told, lifts, and wingReach says how far it reaches', () => {
  const right = paint(wingIn(16, 16, 8)), left = paint(wingIn(16, 16, 8, { side: -1 }));
  assert.ok(right.bounds().x1 > 20 && right.bounds().x0 >= 13);
  assert.ok(left.bounds().x0 < 12 && left.bounds().x1 <= 18);
  assert.ok(paint(wingIn(16, 16, 8, { lift: 1.2 })).bounds().y0 < right.bounds().y0, 'a bigger lift raises it');
  for (const opt of [{}, { lift: 0.9 }, { lift: 1.3, spread: 0.8 }, { feathers: 4, spread: 1 }]) {
    const b = paint(wingIn(16, 16, 8, opt)).bounds(), r = wingReach(8, opt);
    // a pixel is drawn when its centre is inside, so the drawn box may overshoot the shape by half a pixel
    assert.ok(b.x1 + 1 - 16 <= r.out + 0.5, `reach out ${r.out} covers ${b.x1 + 1 - 16}`);
    assert.ok(16 - b.y0 <= r.up + 0.5, `reach up ${r.up} covers ${16 - b.y0}`);
    assert.ok(b.y1 + 1 - 16 <= r.down + 0.5, `reach down ${r.down} covers ${b.y1 + 1 - 16}`);
    assert.ok(r.out <= 8 + 2 && r.up <= 8 + 2, 'and is not a wild overestimate');
  }
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

test('pickupClips: idle loops, collect plays once, both 8 frames and both follow the speed control', () => {
  const c = pickupClips();
  assert.deepEqual(Object.keys(c), ['idle', 'collect']);
  assert.equal(c.idle.frames, 8); assert.equal(c.idle.loop, true);
  assert.equal(c.collect.frames, 8); assert.equal(c.collect.loop, false);
  assert.ok(Math.abs(c.idle.fps({ speed: 0.5 }) - 10.5) < 1e-9 && Math.abs(c.collect.fps({ speed: 0.5 }) - 14.7) < 1e-9);
  assert.ok(c.idle.fps({ speed: 1 }) > c.idle.fps({ speed: 0 }));
  assert.equal(Math.round(pickupClips({ idle: 8 }).idle.fps({ speed: 0.5 }) * 10), 84);
});

test('pickupPose, idle: floats by whole pixels, closes its loop, and never leaves the frame', () => {
  const ys = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => pickupPose('idle', f / 8, { bob: 1, cy: 17, up: 9 }).y);
  assert.deepEqual(ys, [17, 16, 15, 16, 17, 18, 19, 18]);
  assert.deepEqual(pickupPose('idle', 0.25, { bob: 0, cy: 17, up: 9 }), { y: 17, sx: 1, sy: 1, scale: 1, flash: false, burst: 0, show: true, bare: false });
  assert.equal(pickupPose('idle', 0.25, { bob: 1, cy: 17, up: 9, float: false }).y, 17);
  for (const up of [8, 12, 13.5, 15, 15.6]) for (let f = 0; f < 8; f++) {
    const y = pickupPose('idle', f / 8, { bob: 1, cy: 17, up, down: 12 }).y;
    assert.ok(y - up >= 1 && y + 12 <= 31, `up ${up}: frame ${f} stays inside (y ${y})`);
  }
});

test('pickupPose, collect: rest, dip and squash, rise, white flash on frame 4, then gone into a burst', () => {
  const o = { pop: 0.5, cy: 17, up: 9 };
  const f = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => pickupPose('collect', i / 7, o));
  assert.deepEqual(f[0], pickupPose('idle', 0, { cy: 17, up: 9 }), 'frame 0 is the resting pose');
  assert.ok(f[1].y > f[0].y && f[1].sx > 1.1 && f[1].sy < 0.9, 'frame 1 dips and squashes');
  assert.ok(f[2].sy > 1 && f[2].sx < 1, 'frame 2 stretches');
  assert.ok(f[3].y < f[0].y - 2 && f[4].y <= f[3].y, 'it has risen by frame 3 and is at the top on frame 4');
  assert.deepEqual(f.map((p) => p.flash), [false, false, false, false, true, false, false, false], 'the flash is frame 4 only');
  assert.ok(f[4].scale > 1, 'a little bigger on the flash');
  assert.ok(f[5].show && f[5].scale < 0.75 && f[5].bare, 'frame 5 is small and plain');
  assert.equal(f[6].show, false); assert.equal(f[7].show, false);
  assert.equal(f[4].burst, 0);
  assert.ok(f[5].burst > 0.2 && f[6].burst > f[5].burst && f[6].burst < 0.8, 'the burst spreads over frames 5 and 6');
  assert.equal(f[7].burst, 1);
  assert.ok(pickupPose('collect', 4 / 7, { ...o, pop: 1 }).y < pickupPose('collect', 4 / 7, { ...o, pop: 0 }).y, 'pop sets how high');
});

test('pickupPose, collect: a big pickup stays in the frame in every frame', () => {
  for (const up of [9, 11, 12.5, 14, 15]) for (const side of [9, 12, 14]) for (let i = 0; i < 8; i++) {
    const at = pickupPose('collect', i / 7, { pop: 1, cy: 17, up, down: 12, side });
    assert.ok(at.y - up * at.sy >= 1 - 1e-9, `up ${up}, frame ${i}: top ${at.y - up * at.sy}`);
    assert.ok(at.y + 12 * at.sy <= 31 + 1e-9, `up ${up}, frame ${i}: bottom ${at.y + 12 * at.sy}`);
    assert.ok(16 + side * at.sx <= 31 + 1e-9, `side ${side}, frame ${i}: right edge ${16 + side * at.sx}`);
  }
});

test('heartbeat: two beats on frames 1 and 3 of 8, rest for the second half, and the loop closes', () => {
  const v = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => heartbeat(f / 8));
  assert.equal(v[0], 0); assert.equal(v[1], 1);
  assert.ok(v[3] > 0.8 && v[2] < v[1] && v[2] < v[3] && v[2] > 0, 'it lets go between the beats, not all the way');
  assert.ok(v[4] < v[3] && v[5] < v[4]);
  assert.equal(v[6], 0); assert.equal(v[7], 0);
  assert.equal(heartbeat(1), heartbeat(0));
  assert.equal(heartbeat(1.125), heartbeat(0.125));
});

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

test('gleam: flares on one frame, is small on the frames beside it and gone for the rest of the loop', () => {
  const at = (t, opt) => { const g = new Surface(S, S); gleam(g, 16, 16, t, '#f2c230', opt); return lit(g); };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((f) => at(f / 8)), [9, 5, 0, 0, 0, 0, 0, 5]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((f) => at(f / 8, { at: 0.75 })), [0, 0, 0, 0, 0, 5, 9, 5]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((f) => at(f / 8, { at: 0.375, big: 1 })), [0, 0, 1, 5, 1, 0, 0, 0]);
});

test('collectBurst: nothing before it starts, a spreading ring, and three pixels at the end whatever the settings', () => {
  const at = (burst, sparkle = true, x = 16, y = 12) => { const g = new Surface(S, S); collectBurst(g, { burst, x, y, r: 8, colour: '#4fd8ee', sparkle }); return g; };
  assert.equal(lit(at(0)), 0);
  assert.equal(lit(at(1)), 3);
  assert.equal(lit(at(1, false)), 3, 'the last frame does not depend on the sparkle setting');
  assert.ok(same(at(1), at(1, false)));
  assert.ok(lit(at(0.64)) - lit(at(0.64, false)) >= 12, 'sparkle adds a ring of twinkles');
  assert.ok(lit(at(0.3, false)) >= 5, 'without it there is still a twinkle where the pickup was');
  const spread = (g) => g.bounds().x1 - g.bounds().x0;
  assert.ok(spread(at(0.3)) < spread(at(0.64)) && spread(at(0.3)) < spread(at(1)), 'it spreads');
  for (const [x, y] of [[16, 5], [5, 16], [27, 26], [16, 16]]) for (const b of [0.3, 0.64, 1]) {
    const g = at(b, true, x, y), bb = g.bounds();
    assert.ok(bb.x0 >= 1 && bb.y0 >= 1 && bb.x1 <= 30 && bb.y1 <= 30, `burst ${b} at ${x},${y} stays off the frame edge`);
    if (b === 1) assert.equal(lit(g), 3, `three pixels left at ${x},${y}`);
  }
});

test('drawGem: every cut draws inside its box; facets and a polished stone differ; it returns its silhouette', () => {
  for (const cut of GEM_CUTS) {
    const a = new Surface(S, S), b = new Surface(S, S);
    const stone = drawGem(a, 16, 16, 8, 7, '#4fd8ee', { cut });
    drawGem(b, 16, 16, 8, 7, '#4fd8ee', { cut, facets: false });
    const outline = paint(stone);
    assert.ok(same(outline, paint(gemIn(16, 16, 8, 7, cut))), `${cut}: returns the silhouette`);
    for (const g of [a, b]) assert.ok(g.data.every((v, i) => !!v === !!outline.data[i]), `${cut}: paints the silhouette and nothing else`);
    assert.ok(!same(a, b), `${cut}: cut lines change the picture`);
    assert.ok(colours(a).size >= 3 && colours(a).size <= 4, `${cut}: ${colours(a).size} tones with facets`);
    assert.ok(colours(b).has(col('#ffffff')), `${cut}: a polished stone has a white spot`);
    assert.ok(colours(b).size <= 5);
  }
  const small = new Surface(S, S); drawGem(small, 16, 16, 3, 2.5, '#c9423a', { facets: false });
  assert.ok(lit(small) >= 12, 'a tiny one still draws');
});

test('drawBottle: glass, liquid up to its level, a tilting surface, bubbles in the liquid only, a cork', () => {
  const draw = (o = {}, h = 18) => { const g = new Surface(S, S); const r = drawBottle(g, 16, h % 2 ? 16.5 : 16, h, { glass: '#f0ead8', liquid: '#c9423a', cork: '#a06a3c', ...o }); return { g, ...r }; };
  const count = (g, test) => { let n = 0; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g.get(x, y) && test(x + 0.5, y + 0.5)) n++; return n; };
  for (const shape of BOTTLE_SHAPES) for (const h of [14, 18, 21]) {
    const low = draw({ shape, level: 0 }, h), full = draw({ shape, level: 1 }, h);
    const b = low.g.bounds();
    assert.equal(b.y1 - b.y0 + 1, h, `${shape} ${h}: as tall as asked`);
    assert.ok(b.x0 >= 1 && b.x1 <= 30);
    assert.ok(count(low.g, low.wet) >= 6, `${shape} ${h}: some liquid even when low`);
    assert.ok(count(full.g, full.wet) > 1.5 * count(low.g, low.wet), `${shape} ${h}: fuller is more liquid`);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (full.wet(x + 0.5, y + 0.5)) assert.ok(full.inner(x + 0.5, y + 0.5) && full.body(x + 0.5, y + 0.5), 'liquid stays inside the glass');
    assert.ok(count(full.g, full.inner) > count(full.g, full.wet), `${shape} ${h}: a full bottle still has air under the cork`);
  }
  const flat = draw({ level: 0.5 }), tilted = draw({ level: 0.5, tilt: 0.2 });
  assert.ok(!same(flat.g, tilted.g), 'tilt changes the surface');
  assert.ok(tilted.wet(12.5, 19.5) !== tilted.wet(20.5, 19.5) || tilted.wet(12.5, 20.5) !== tilted.wet(20.5, 20.5) || tilted.wet(12.5, 18.5) !== tilted.wet(20.5, 18.5), 'one side is higher than the other');
  const still = draw({ bubbles: 0, t: 0.3 }), fizzy = draw({ bubbles: 2, t: 0.3 });
  let changed = 0;
  for (let i = 0; i < still.g.data.length; i++) if (still.g.data[i] !== fizzy.g.data[i]) { changed++; assert.ok(still.wet((i % S) + 0.5, Math.floor(i / S) + 0.5), 'bubbles are only in the liquid'); }
  assert.ok(changed >= 3, `bubbles change ${changed} pixels`);
  assert.ok(same(draw({ bubbles: 2, t: 0 }).g, draw({ bubbles: 2, t: 1 }).g), 'the bubble loop closes');
  assert.ok(!same(draw({ shine: false }).g, draw({}).g), 'the highlight can be left off');
  assert.ok(colours(draw({}).g).has(col('#a06a3c')), 'the cork is drawn in its colour');
  const squashed = draw({ sx: 1.2, sy: 0.8 }).g.bounds(), plain = draw({}).g.bounds();
  assert.ok(squashed.x1 - squashed.x0 > plain.x1 - plain.x0 && squashed.y1 - squashed.y0 < plain.y1 - plain.y0, 'sx and sy squash it');
});

// ---- fix round 1: measuring a shape test, and a skull ---------------------------------

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

test('skullIn: a cranium on a narrower jaw, two sockets, a nose hole and gaps between the teeth', () => {
  for (const [w, h] of [[9, 9], [10, 10], [11, 11], [13, 12], [14, 12], [16, 16], [17, 16]]) {
    const cx = w % 2 ? 16.5 : 16, cy = h % 2 ? 16.5 : 16, K = skullIn(cx, cy, w, h), tag = `${w}x${h}`;
    const halves = (g) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!g.get(x, y) !== !g.get(2 * cx - 1 - x, y)) return false; return true; };
    const bone = paint(K.bone), b = bone.bounds();
    assert.equal(b.x1 - b.x0 + 1, w, `${tag}: as wide as asked`);
    assert.equal(b.y1 - b.y0 + 1, h, `${tag}: as tall as asked`);
    assert.ok(halves(bone), `${tag}: both halves match`);
    // the jaw is at least 2 px narrower than the cranium on each side
    const rowWidth = (y) => { let n = 0; for (let x = 0; x < S; x++) if (bone.get(x, y)) n++; return n; };
    assert.ok(rowWidth(b.y1) <= w - 4, `${tag}: jaw ${rowWidth(b.y1)} px against a ${w} px cranium`);
    // two sockets (3x3 px or more each from 10 px wide), apart from each other, inside the bone with a rim round them
    assert.equal(K.eyes.length, 2);
    const sockets = paint(K.sockets), sb = sockets.bounds();
    assert.ok(lit(sockets) >= (w >= 10 ? 18 : 10), `${tag}: sockets cover ${lit(sockets)} px`);
    assert.ok(halves(sockets), `${tag}: the sockets match`);
    assert.ok(!sockets.get(Math.floor(cx - 0.25), Math.floor(K.eyes[0][1])), `${tag}: bone between the two sockets`);
    assert.ok(sockets.get(Math.floor(K.eyes[0][0]), Math.floor(K.eyes[0][1])) && sockets.get(Math.floor(K.eyes[1][0]), Math.floor(K.eyes[1][1])), `${tag}: eyes are the middles of the sockets`);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (sockets.get(x, y)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(bone.get(x + dx, y + dy), `${tag}: a socket reaches the edge at ${x},${y}`);
    assert.ok(sb.y1 < b.y1 - 2, `${tag}: sockets are in the cranium, not the jaw`);
    // a nose hole under them, on the middle
    const nose = paint(K.nose), nb = nose.bounds();
    assert.ok(lit(nose) >= 1 && lit(nose) <= 4, `${tag}: nose ${lit(nose)} px`);
    assert.ok(nb.y0 > sb.y1 && nb.x0 >= cx - 1.5 && nb.x1 <= cx + 0.5, `${tag}: the nose is below the sockets, on the middle`);
    // gaps between the teeth: cut out of the bottom of the jaw, 2 px deep or more, at least two of them
    const cut = new Surface(S, S).blob([K.bone], '#ffffff', { minus: [K.gaps] });
    assert.ok(halves(cut), `${tag}: the teeth match`);
    let runs = 0, was = false, gapAt = -1;
    for (let x = b.x0; x <= b.x1 + 1; x++) { const on = !!cut.get(x, b.y1); if (on && !was) runs++; if (!on && bone.get(x, b.y1) && gapAt < 0) gapAt = x; was = on; }
    assert.equal(runs, 3, `${tag}: three teeth on the bottom row`);
    assert.ok(!cut.get(gapAt, b.y1 - 1) && bone.get(gapAt, b.y1 - 1), `${tag}: a gap is 2 px deep`);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (nose.get(x, y)) assert.ok(cut.get(x, y) && !sockets.get(x, y), `${tag}: the nose is on bone, clear of the sockets and the gaps`);
  }
  // turned 45 degrees, as on a slanted key, it still has two sockets and two gaps
  const K = skullIn(0, 0, 11, 11), turn = (f) => placedIn(f, 16, 16, { angle: -Math.PI / 4 });
  assert.ok(lit(paint(turn(K.sockets))) >= 14, 'sockets survive the turn');
  const whole = lit(paint(turn(K.bone))), cut = lit(new Surface(S, S).blob([turn(K.bone)], '#ffffff', { minus: [turn(K.gaps)] }));
  assert.ok(whole - cut >= 4, `the gaps take ${whole - cut} px out of a slanted jaw`);
  assert.equal(skullIn(0, 0, 11, 11, { teeth: 4 }).eyes.length, 2, 'the number of teeth is an option');
});
