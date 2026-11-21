// Framework additions made with batch R14 (the ember wyrm):
//   engine/beast.js      pathPoint, arcChain, hookPath, tubeIn, spikeRowIn, sailIn, jointedWing, jawHead, TAIL_TIPS, tailTipIn
//   (rigs/quadruped.js, the four-legged rig, was also added; R2 deleted it and its tests)
// R2: rigs/quadruped.js went: the tests of the four-legged rig are deleted; those of engine/beast.js stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { arcChain, hookPath, pathPoint, tubeIn, spikeRowIn, sailIn, jointedWing, jawHead, tailTipIn, TAIL_TIPS } from '../../engine/beast.js';

const PI = Math.PI;
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const area = (inside, w = 96, h = 96) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) n++; return n; };
const along = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

// ---- engine/beast.js --------------------------------------------------------------------------

test('pathPoint: the point at a share of the length, and the side that is up for a path running right', () => {
  const P = pathPoint([[0, 10], [10, 10], [10, 30]], 0.5);
  assert.ok(near(P.x, 10) && near(P.y, 15), `half of 30 px is 5 px down the second piece (${P.x}, ${P.y})`);
  const A = pathPoint([[0, 10], [10, 10]], 0.3);
  assert.ok(near(A.x, 3) && near(A.nx, 0) && near(A.ny, -1) && near(A.angle, PI / 2), 'running right: its side is up and its rig angle is PI / 2');
  assert.deepEqual([pathPoint([[0, 0], [4, 0]], -1).x, pathPoint([[0, 0], [4, 0]], 2).x], [0, 4], 'a share outside 0..1 stops at the ends');
});

test('arcChain: a chain of fixed length that ends where it is sent and bows to the chosen side', () => {
  const up = arcChain(10, 50, 40, 50, 40, { steps: 8 });
  assert.equal(up.length, 9);
  assert.ok(near(along(up), 40, 0.6), `the pieces add up to nearly its length (${along(up).toFixed(2)})`);
  assert.ok(near(up[8][0], 40, 0.05) && near(up[8][1], 50, 0.05), 'it ends on the point it was sent to');
  assert.ok(up[4][1] < 45, `bend 1 bows up for a chain that runs right (${up[4][1].toFixed(1)})`);
  assert.ok(arcChain(10, 50, 40, 50, 40, { bend: -1, steps: 8 })[4][1] > 55, 'bend -1 bows down');
  const short = arcChain(0, 0, 100, 0, 30);
  assert.ok(near(short.at(-1)[0], 30) && short.every((p) => near(p[1], 0)), 'too far away: it runs straight toward the point and stops short');
  const tight = arcChain(0, 0, 1, 0, 40, { least: 0.25 });
  assert.ok(near(tight.at(-1)[0], 10, 0.1), 'nearer than `least` it ends beyond the point, a quarter of its length away');
});

test('hookPath: turns sharply near the root, then runs on in a slow curl', () => {
  const pts = hookPath(50, 60, -PI / 2, 40, { turn: -PI / 2, within: 12, curl: 0, steps: 10 });
  assert.equal(pts.length, 11);
  assert.ok(near(along(pts), 40, 0.01));
  assert.ok(pts[2][0] < 45, 'it sets off to the left');
  const last = pts[10], before = pts[9];
  assert.ok(near(last[0], before[0], 0.01) && last[1] < before[1], 'after the turn it runs straight up');
  const crook = hookPath(50, 60, -PI / 2, 40, { turn: -PI / 2, within: 12, curl: -1.5, steps: 10 });
  assert.ok(crook[10][0] > last[0] + 4, `a curl bends the end over, back toward the root's side (${crook[10][0].toFixed(1)} > ${last[0].toFixed(1)})`);
  assert.ok(Math.min(...hookPath(50, 60, -PI / 2, 40, { turn: -PI / 2, within: 6, curl: 0 }).map((p) => p[0])) > Math.min(...pts.map((p) => p[0])), 'a turn made within fewer pixels reaches less far out');
});

test('tubeIn: a tube through joints that tapers', () => {
  const tube = tubeIn([[10, 20], [30, 20], [50, 20]], 6, 2);
  assert.ok(tube(10.5, 25.4) && !tube(10.5, 26.6), '6 px half thickness at the first joint');
  assert.ok(tube(49.5, 21.5) && !tube(49.5, 23), '2 px at the last');
  assert.ok(tube(30.5, 23.5) && !tube(30.5, 24.6), '4 px half way');
  assert.ok(!tube(80, 20) && !tube(30, 60), 'nothing far from it');
  const fat = tubeIn([[10, 20], [30, 20], [50, 20]], 3, 3, { bulge: 3 });
  assert.ok(fat(30.5, 25.4) && !fat(11, 24), 'a bulge thickens the middle only');
  const own = tubeIn([[10, 20], [20, 20], [40, 20], [50, 20]], 0, 0, { radius: (u) => (u < 0.5 ? 5 : 1) });
  assert.ok(own(15, 24) && !own(45, 24), 'a radius function replaces the taper');
  assert.ok(!tubeIn([[10, 20], [50, 20]], 3, 3, { bulge: 3 })(30.5, 25.4), 'the thickness is taken at the joints: a tube of one piece has no middle to bulge');
});

test('spikeRowIn: spikes stand on the chosen side of a path, on top of the body there', () => {
  const path = [[10, 50], [50, 50]];
  const row = spikeRowIn(path, { count: 5, height: 4, width: 3, lift: 6 });
  assert.equal(row.tips.length, 5);
  for (const [, y] of row.tips) assert.ok(near(y, 40), `each tip is lift + height above the path (${y})`);
  assert.ok(row.inside(30.5, 42.5) && !row.inside(30.5, 39.2) && !row.inside(25.5, 42.5), 'a spike is a triangle over its own foot');
  const under = spikeRowIn(path, { count: 3, height: 4, lift: 6, side: -1 });
  assert.ok(under.tips.every(([, y]) => near(y, 60)), 'side -1 is the other side');
  const graded = spikeRowIn(path, { count: 3, height: 4, lift: 0, grade: (v) => (v === 0.5 ? 1 : 0.5) });
  assert.ok(graded.tips[1][1] < graded.tips[0][1] - 1.5, 'grade makes the middle one taller');
  const leant = spikeRowIn(path, { count: 1, height: 4, lift: 0, lean: -0.5 });
  assert.ok(near(leant.tips[0][0], 28), 'lean pushes the tip along the path');
});

test('sailIn: a fin of skin on rays, tallest in the middle, with a scooped edge', () => {
  const path = [[10, 60], [70, 60]];
  const fin = sailIn(path, { rays: 5, height: 10, lift: 4, scoop: 0 });
  assert.equal(fin.rays.length, 5);
  assert.equal(fin.tips.length, 5);
  assert.ok(fin.tips[2][1] < fin.tips[0][1] - 2 && fin.tips[2][1] < fin.tips[4][1] - 2, 'the middle ray is the tallest');
  assert.ok(near(fin.tips[2][1], 60 - 4 - 10, 0.2), 'and stands the full height above the body');
  assert.ok(fin.inside(40.5, 52.5) && !fin.inside(40.5, 40) && !fin.inside(40.5, 58.5), 'skin between the foot of the fin and its tips only');
  const scooped = sailIn(path, { rays: 5, height: 10, lift: 4, scoop: 1 });
  assert.ok(area(scooped.inside) < area(fin.inside) - 15, 'scoops cut skin away between the tips');
  assert.ok(sailIn(path, { rays: 3, height: 10, lift: 4, side: -1 }).tips.every(([, y]) => y > 60), 'side -1 hangs it under the path');
});

test('jointedWing: an arm with an elbow and a wrist, fingers fanned from the wrist, skin back to the body', () => {
  const w = jointedWing(60, 60, { upper: 8, fore: 12, finger: 20, a1: PI, a2: -PI + 0.9, fan: [-PI + 1.2, -0.6], fingers: 3 });
  assert.ok(near(w.elbow[0], 60) && near(w.elbow[1], 52), 'the upper arm goes straight up');
  assert.ok(near(Math.hypot(w.wrist[0] - w.elbow[0], w.wrist[1] - w.elbow[1]), 12), 'the forearm keeps its length');
  assert.equal(w.tips.length, 3);
  assert.ok(near(Math.hypot(w.tips[0][0] - w.wrist[0], w.tips[0][1] - w.wrist[1]), 20) && near(Math.hypot(w.tips[2][0] - w.wrist[0], w.tips[2][1] - w.wrist[1]), 16), 'the last finger is shorter by the taper');
  const mid = [(w.wrist[0] + w.tips[0][0] + w.tips[1][0]) / 3, (w.wrist[1] + w.tips[0][1] + w.tips[1][1]) / 3];
  assert.ok(w.skin(mid[0], mid[1]) && !w.skin(90, 60), 'skin between the fingers, none in front of the shoulder');
  assert.ok(w.bones(w.elbow[0], w.elbow[1]) && w.bones((w.wrist[0] + w.tips[1][0]) / 2, (w.wrist[1] + w.tips[1][1]) / 2), 'the arm and each finger are bones');
  assert.equal(w.marks.length, 6, 'elbow, wrist, thumb and three tips');
  const torn = jointedWing(60, 60, { upper: 8, fore: 12, finger: 20, a1: PI, a2: -PI + 0.9, fan: [-PI + 1.2, -0.6], tatter: 1 });
  assert.ok(area(torn.skin, 128) < area(w.skin, 128) - 8, 'a tattered wing has less skin');
  assert.ok(area(jointedWing(60, 60, { a1: PI, scoop: 1 }).skin, 128) < area(jointedWing(60, 60, { a1: PI, scoop: 0 }).skin, 128), 'deeper scoops cut more away');
});

test('jointedWing: a bone that would pass the floor or the ceiling lies along it instead, at full length', () => {
  const down = jointedWing(60, 60, { upper: 6, fore: 10, finger: 30, a1: -PI / 2, a2: -PI / 2, fan: [-0.9, -0.1], floor: 70 });
  for (const [x, y] of down.tips) {
    assert.ok(y <= 69.01, `no tip below the floor (${y.toFixed(2)})`);
    assert.ok(near(Math.hypot(x - down.wrist[0], y - down.wrist[1]) / 30, 1, 0.21), 'the finger is turned, not shortened');
  }
  const up = jointedWing(60, 30, { upper: 6, fore: 10, finger: 30, a1: PI, a2: PI, fan: [-PI + 0.2, -PI + 1], ceiling: 4 });
  for (const [, y] of up.tips) assert.ok(y >= 4.99, `no tip above the ceiling (${y.toFixed(2)})`);
  assert.ok(up.tips[0][0] < 60 - 15, 'held down by the ceiling, the leading finger spreads sideways');
  const free = jointedWing(60, 60, { fan: [-PI + 1.2, -0.6] }), same = jointedWing(60, 60, { fan: [-PI + 1.2, -0.6], floor: 200, ceiling: -200 });
  assert.deepEqual(free.tips, same.tips, 'with room to spare nothing moves');
});

test('jawHead: a snouted head whose lower jaw swings open on its hinge', () => {
  const shut = jawHead(40, 40, PI / 2, { size: 5, snout: 11, jaw: 0 }), open = jawHead(40, 40, PI / 2, { size: 5, snout: 11, jaw: 1 });
  assert.ok(near(shut.tip[0], 40 + 2.5 + 11) && near(shut.tip[1], 40), 'the nose is half a skull and a snout ahead');
  assert.ok(shut.upper(40.5, 40.5) && shut.upper(50.5, 40.5) && !shut.upper(60, 40), 'skull and upper jaw are one shape');
  assert.ok(open.chin[1] > shut.chin[1] + 5 && open.chin[0] < shut.chin[0], 'open, the chin drops and swings back');
  assert.deepEqual(open.hinge, shut.hinge, 'the hinge does not move');
  assert.ok(area(open.inside) > 20 && open.inside((open.tip[0] + open.chin[0]) / 2 - 3, (open.tip[1] + open.chin[1]) / 2), 'the open mouth has a dark inside between the jaws');
  assert.equal(shut.teeth.length, 7);
  assert.equal(shut.upperTeeth, 4);
  assert.ok(open.eye[1] < 40 && open.nostril[0] > open.eye[0] && open.crown[0] < 40 && open.crown[1] < 40, 'eye above the middle, nostril ahead of it, crown at the top back');
  const upward = jawHead(40, 40, PI, { size: 5, snout: 11 });
  assert.ok(near(upward.tip[0], 40) && near(upward.tip[1], 40 - 13.5), 'angle PI points the snout up');
  assert.deepEqual(upward.at(0, 0), [40, 40]);
});

test('tailTipIn: a spade, a club with spikes, or the bare end a flame burns on', () => {
  assert.deepEqual([...TAIL_TIPS], ['spade', 'club', 'flame']);
  const spade = tailTipIn('spade', 20, 20, PI / 2);
  assert.ok(near(spade.end[0], 30) && near(spade.end[1], 20), 'a spade is 10 px long, the way the tail ends');
  assert.ok(spade.body(24.5, 20.5) && spade.body(20.5, 23.5) && !spade.body(29, 23) && spade.spikes === null, 'barbed: wide at the back, a point at the front');
  const big = tailTipIn('spade', 20, 20, PI, 2);
  assert.ok(near(big.end[0], 20) && near(big.end[1], 0), 'size scales it and the angle turns it');
  const club = tailTipIn('club', 20, 20, PI / 2);
  assert.ok(club.body(23.5, 20.5) && club.spikes(30, 20.3) && !club.body(30, 20.3), 'a knob, and spikes that stand out past it');
  assert.equal(club.marks.length, 5);
  const flame = tailTipIn('flame', 20, 20, PI / 2);
  assert.ok(flame.body === null && flame.spikes === null);
  assert.deepEqual(flame.end, [20, 20]);
});

