// Framework additions made with batch R14 (the ember wyrm):
//   engine/beast.js      pathPoint, arcChain, hookPath, tubeIn, spikeRowIn, sailIn, jointedWing, jawHead, TAIL_TIPS, tailTipIn
//   rigs/quadruped.js    SIZE, GROUND, CX, PIVOT, WINGS, HORNS, TAILS, SPINES, POSES, clips, dims, pose, solve, wingRoom,
//                        draw, lights, sockets, frame
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { arcChain, hookPath, pathPoint, tubeIn, spikeRowIn, sailIn, jointedWing, jawHead, tailTipIn, TAIL_TIPS } from '../../engine/beast.js';
import * as Q from '../../rigs/quadruped.js';

const PI = Math.PI;
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const area = (inside, w = 96, h = 96) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) n++; return n; };
const along = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const pixels = (g) => { let n = 0; for (const c of g.data) if (c) n++; return n; };
const WYRM = { neck: 0.5, spines: 'ridge', wings: { kind: 'large', span: 1 }, horns: { kind: 'swept', length: 1 }, tail: { kind: 'spade', length: 1 } };
const LOOK = { body: '#c9423a', accent: '#e6c96a', glow: '#e8662c' };
const FRAMES = { idle: 8, walk: 8, attack: 12, breath: 12, buffet: 10, hurt: 4, die: 12 };
const phases = (name) => Array.from({ length: FRAMES[name] }, (_, i) => (name === 'idle' || name === 'walk' ? i / FRAMES[name] : i / (FRAMES[name] - 1)));

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

// ---- rigs/quadruped.js ------------------------------------------------------------------------

test('quadruped: the clip table follows the style guide and takes labels', () => {
  const c = Q.clips((p) => p.speed, ['idle', { name: 'attack', label: 'Bite' }, 'breath', 'buffet', 'hurt', 'die']);
  assert.deepEqual(Object.keys(c), ['idle', 'attack', 'breath', 'buffet', 'hurt', 'die']);
  assert.deepEqual(Object.values(c).map((x) => x.frames), [8, 12, 12, 10, 4, 12]);
  assert.deepEqual(Object.values(c).map((x) => x.loop), [true, false, false, false, false, false]);
  assert.equal(c.attack.label, 'Bite');
  assert.ok(c.idle.fps({ speed: 1 }) > c.idle.fps({ speed: 0 }), 'the speed slider drives every clip');
  assert.equal(Object.keys(Q.clips()).length, Q.POSES.length);
  assert.throws(() => Q.clips(() => 0.5, ['gallop']), /no pose "gallop"/);
  assert.throws(() => Q.pose('gallop', 0), /no pose "gallop"/);
  assert.deepEqual(Q.PIVOT, [56, 90]);
  assert.deepEqual(Q.SIZE, [128, 96]);
});

test('quadruped: dims grow with size, bulk, neck and the part settings', () => {
  const small = Q.dims({ size: 0, bulk: 0 }, { neck: 0 }), big = Q.dims({ size: 1, bulk: 1 }, { neck: 1 });
  assert.ok(big.s > small.s && big.chestR > small.chestR + 3 && big.neckL > small.neckL + 15 && big.thighR > small.thighR);
  assert.equal(Q.dims({}, {}).wing.kind, 'none');
  assert.equal(Q.dims({}, { wings: { kind: 'feathered' } }).wing.kind, 'none', 'an unknown part is no part');
  assert.ok(Q.dims({}, { wings: { kind: 'small' } }).wing.finger < Q.dims({}, { wings: { kind: 'large' } }).wing.finger * 0.7);
  assert.ok(Q.dims({}, { wings: { kind: 'large', span: 1.35 } }).wing.finger > Q.dims({}, { wings: { kind: 'large', span: 0.65 } }).wing.finger * 2);
  assert.equal(Q.dims({}, { wings: { kind: 'tattered' } }).wing.tatter, 1);
  assert.ok(Q.dims({}, { tail: { kind: 'club', length: 1.35 } }).tailL > Q.dims({}, { tail: { kind: 'club', length: 0.65 } }).tailL * 2);
  assert.equal(Q.dims({}, { tail: { kind: 'whip' } }).tail.kind, 'plain');
});

test('quadruped: every pose starts and ends where the style guide says', () => {
  const d = Q.dims({}, WYRM), rest = Q.pose('idle', 0, {}, d);
  for (const name of ['attack', 'breath', 'buffet']) {
    const end = Q.pose(name, 1, {}, d);
    assert.deepEqual([end.bx, end.by, end.pitch, end.jaw, end.head], [0, 0, 0, 0, [0, 0]], `${name} ends on the resting pose`);
    assert.deepEqual(end.wing, { raise: 0, open: 0.55, beat: 0 });
  }
  assert.ok(Q.pose('hurt', 0, {}, d).flash && !Q.pose('hurt', 1, {}, d).flash && Q.pose('hurt', 1, {}, d).jaw === 0, 'hurt starts white and ends on idle');
  assert.ok(Q.pose('die', 0, {}, d).flash && Q.pose('die', 1, {}, d).fall === 1 && Q.pose('die', 1, {}, d).glow === 0 && Q.pose('die', 1, {}, d).lay === 1, 'die ends fallen, the head laid down, the glow out');
  // the bite: jaws wide on frame 6 of 12, shut at full reach on frame 7
  assert.ok(Q.pose('attack', 6 / 11, {}, d).jaw === 1 && Q.pose('attack', 7 / 11, {}, d).jaw === 0);
  assert.ok(Q.pose('attack', 7 / 11, {}, d).head[0] > 20 && Q.pose('attack', 4 / 11, {}, d).head[0] < -8, 'it winds up away from the target, then strikes far forward');
  assert.ok(Q.pose('attack', 7 / 11, {}, d).bite >= 0 && Q.pose('attack', 5 / 11, {}, d).bite < 0);
  // the breath: the throat lights up over frames 1 to 4, the fire burns on frames 5 to 9
  assert.deepEqual([1, 2, 3, 4].map((n) => Q.pose('breath', n / 11, {}, d).throat), [0.25, 0.5, 0.75, 1]);
  assert.deepEqual([4, 5, 9, 10].map((n) => Q.pose('breath', n / 11, {}, d).fire >= 0), [false, true, true, false]);
  assert.ok(rest.smoke && rest.blink === 0 && Q.pose('idle', 0.75, {}, d).blink === 1, 'idle smokes and blinks on frame 6');
});

test('quadruped: without wings the buffet is a rear and a stamp on the same beat', () => {
  const winged = Q.dims({}, WYRM), bare = Q.dims({}, { ...WYRM, wings: { kind: 'none' } });
  const A = Q.pose('buffet', 5 / 9, { wings: true }, winged), B = Q.pose('buffet', 5 / 9, { wings: false }, bare);
  assert.ok(A.gust >= 0 && A.stomp < 0 && A.wing.beat > 2, 'with wings: they are swept forward and the wind blows');
  assert.ok(B.stomp >= 0 && B.gust < 0, 'without: the forefeet have come down');
  const up = Q.pose('buffet', 3 / 9, { wings: false }, bare);
  assert.ok(up.pitch > 0.3 && up.feet[0][1] > 8 && up.feet[1][1] === 0, 'on frame 3 it is reared up with both forefeet off the ground and the hind feet planted');
  assert.equal(Q.pose('buffet', 5 / 9, {}, bare).stomp >= 0, true, 'left unsaid, the dims decide');
});

test('quadruped: the feet stay planted while the body moves, and the neck keeps its length', () => {
  const d = Q.dims({}, WYRM);
  const rest = Q.solve(Q.pose('idle', 0, {}, d), d), back = Q.solve(Q.pose('attack', 5 / 11, {}, d), d);
  assert.ok(back.H[0] < rest.H[0], 'the body has shifted back');
  assert.deepEqual(back.legs.map((L) => L.foot[0]), rest.legs.map((L) => L.foot[0]), 'the feet have not');
  assert.ok(near(along(rest.neck), d.neckL, 0.5) && near(along(back.neck), d.neckL, 0.5));
  assert.deepEqual(rest.legs.map((L) => [L.hind, L.far]), [[false, false], [true, false], [false, true], [true, true]]);
  for (const L of rest.legs) assert.ok(L.toe[1] + d.pawR <= Q.GROUND + 0.01 && L.toe[1] + d.pawR >= Q.GROUND - 1, 'every paw stands on the ground line');
  const dead = Q.solve(Q.pose('die', 1, {}, d), d);
  assert.ok(dead.head.y > Q.GROUND - 2 * d.headR && dead.C[1] > rest.C[1] + 10, 'dead: the chest is down and the head lies on the ground');
  for (const L of dead.legs) assert.ok(L.knee[1] <= Q.GROUND - 1, 'a folded knee is never in the ground');
});

test('quadruped: nothing leaves the frame at the biggest size, in any frame of any pose, with any parts', () => {
  const opts = [
    { neck: 1, spines: 'sails', wings: { kind: 'large', span: 1.35 }, horns: { kind: 'swept', length: 1.35 }, tail: { kind: 'spade', length: 1.35 } },
    { neck: 1, spines: 'ridge', wings: { kind: 'tattered', span: 1.35 }, horns: { kind: 'ram', length: 1.35 }, tail: { kind: 'club', length: 1.35 } },
    { neck: 1, spines: 'none', wings: { kind: 'none' }, horns: { kind: 'crown', length: 1.35 }, tail: { kind: 'flame', length: 1.35 } },
  ];
  for (const opt of opts) for (const name of Q.POSES) for (const t of phases(name)) {
    const g = new Surface(...Q.SIZE), F = Q.frame(name, t, { size: 1, bulk: 1, bounce: 1 }, opt);
    F.draw(g, LOOK); F.finish(g, LOOK);
    const b = g.bounds();
    assert.ok(b, `${name} at ${t.toFixed(2)} draws something`);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= Q.SIZE[0] - 2 && b.y1 <= Q.SIZE[1] - 2, `${name} at ${t.toFixed(2)} with ${opt.wings.kind} wings stays inside the border: ${JSON.stringify(b)}`);
  }
});

test('quadruped: the wings are drawn at one scale in every clip, and are still wings at the biggest size', () => {
  const d = Q.dims({}, WYRM);
  assert.equal(Q.wingRoom(d, { wings: true }), 1, 'the default look has room for its wings as asked');
  assert.equal(Q.wingRoom(Q.dims({}, { ...WYRM, wings: { kind: 'none' } })), 1);
  const big = Q.dims({ size: 1, bulk: 1 }, { ...WYRM, neck: 1, wings: { kind: 'large', span: 1.35 } }), room = Q.wingRoom(big, { bounce: 1, wings: true });
  assert.ok(room <= 1 && room >= 0.7, `at the biggest size the widest wings keep at least 0.7 of what was asked (${room.toFixed(2)})`);
  assert.ok(big.wing.finger * room > d.wing.finger, 'and are bigger than the default wings, not stubs');
  const idle = Q.frame('idle', 0, { size: 1, bulk: 1, bounce: 1 }, { ...WYRM, neck: 1, wings: { kind: 'large', span: 1.35 } }).J.wings[0];
  assert.ok(near(Math.hypot(idle.elbow[0] - idle.sx, idle.elbow[1] - idle.sy), big.wing.upper * room, 0.01), 'frame() draws them at that scale');
});

test('quadruped: frame() paints the whole beast, every part shows, and the sockets follow the pose', () => {
  const paint = (opt, clip = 'idle', t = 0, look = LOOK) => { const g = new Surface(...Q.SIZE), F = Q.frame(clip, t, {}, opt); F.draw(g, look); F.finish(g, look); return g; };
  const differ = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
  const base = paint(WYRM);
  assert.ok(pixels(base) > 2500, `a boss-sized drawing (${pixels(base)} pixels)`);
  for (const [key, kinds] of [['wings', [...Q.WINGS, 'none']], ['horns', [...Q.HORNS, 'none']], ['tail', Q.TAILS]]) {
    const shots = kinds.map((kind) => paint({ ...WYRM, [key]: { ...WYRM[key], kind } }));
    for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++) assert.ok(differ(shots[i], shots[j]) > 12, `${key}: ${kinds[i]} and ${kinds[j]} differ`);
  }
  const spines = ['none', ...Q.SPINES].map((kind) => paint({ ...WYRM, spines: kind }));
  assert.ok(differ(spines[0], spines[1]) > 12 && differ(spines[1], spines[2]) > 12 && differ(spines[0], spines[2]) > 12);
  assert.ok(differ(paint(WYRM, 'breath', 7 / 11), paint(WYRM, 'breath', 7 / 11, { ...LOOK, glow: '#4fd8ee' })) > 100, 'the fire takes the glow colour');
  assert.ok(pixels(paint(WYRM, 'hurt', 0)) > 2500 && new Set(paint(WYRM, 'hurt', 0).data).size === 3, 'the first frame of hurt is white inside its outline');
  const S = Q.frame('idle', 0, {}, WYRM).sockets(), bite = Q.frame('attack', 7 / 11, {}, WYRM).sockets();
  assert.deepEqual(Object.keys(S), ['head', 'back', 'tail', 'feet', 'muzzle']);
  assert.ok(bite.muzzle.x > S.muzzle.x + 15 && bite.muzzle.y > S.muzzle.y + 8, 'the muzzle goes where the bite goes');
  assert.ok(S.feet.y === Q.GROUND && S.back.y < S.feet.y - 30 && S.tail.x < S.back.x - 20 && S.head.x > S.back.x);
  assert.ok(near(S.muzzle.angle, PI / 2 - 0.22, 0.1), 'the muzzle points the way the snout does');
});
