// Framework additions of batch S07 (spitter-bug, scout-drone):
//   rigs/creature-topdown.js   clips, parseClip       the clip table of a top-down creature, direction clips named as rigs/topdown.js names them
//   rigs/creature-topdown.js   project                a point of the creature's own space (forward, right, up) on the picture, per direction
//   rigs/creature-topdown.js   body, pose, solve      a segmented, legged body described once and placed for down, up and side
//   rigs/creature-topdown.js   gait, step             which legs move together, and the path of one walking foot
//   rigs/creature-topdown.js   segmentIn, bodyTests, drawLegs, sockets
//   rigs/creature-topdown.js   hover                  the float of a hovering body
//   rigs/creature-topdown.js   burrow, sunk           a hole in the floor with a ring of rubble, and a drawing sinking into it
//   engine/mech.js             rotor                  a spinning rotor as a blur of two alternating pictures
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { ramp, col, INK } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import * as T from '../../rigs/topdown.js';
import * as K from '../../rigs/creature-topdown.js';
import { rotor } from '../../engine/mech.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const BUG = () => K.body({ segments: [{ len: 8, wide: 9, tall: 6 }, { len: 12, wide: 12, tall: 8 }, { len: 9, wide: 8, tall: 6 }], pairs: 3, span: 10 });
const phases = (frames, loop) => Array.from({ length: frames }, (_, f) => (loop ? f / frames : f / (frames - 1)));
/** A whole bug painted the plain way, with its outline. */
function shot(direction, action, t, m = {}, B = BUG()) {
  const g = new Surface(...K.SIZE), J = K.solve(direction, K.pose(action, t, m, B), B);
  K.drawLegs(g, J, ramp('#b04a8a'), { side: 'far' });
  g.blob(K.bodyTests(J), ramp('#ca9eda'), { shade: 2 });
  K.drawLegs(g, J, ramp('#b04a8a'), { side: 'near' });
  g.outline(INK);
  return { g, J };
}

// ---- clips ------------------------------------------------------------------------------------------

test('clips: direction clips are named, ordered and labelled as the top-down character rig does', () => {
  const c = K.clips((p) => p.speed, ['idle_down', 'walk*', { name: 'attack*', label: 'Bite' }, 'hurt', 'die']);
  assert.deepEqual(Object.keys(c), ['idle_down', 'walk_down', 'walk_up', 'walk_side', 'attack_down', 'attack_up', 'attack_side', 'hurt', 'die']);
  const hero = T.clips((p) => p.speed, { action: 'attack' });
  for (const name of ['idle_down', 'walk_up', 'walk_side', 'hurt', 'die']) {
    assert.equal(c[name].frames, hero[name].frames, name);
    assert.equal(c[name].loop, hero[name].loop, name);
    assert.equal(c[name].fps({ speed: 0.3 }), hero[name].fps({ speed: 0.3 }), `${name}: the same speed formula`);
  }
  assert.equal(c.walk_side.label, hero.walk_side.label);
  assert.equal(c.attack_up.label, 'Bite (up)');
  assert.equal(c.hurt.label, undefined, 'a plain clip keeps the default label');
  assert.deepEqual(K.parseClip('attack_side'), { action: 'attack', direction: 'side' });
  assert.deepEqual(K.parseClip('burrow'), { action: 'burrow', direction: 'down' });
  assert.deepEqual(K.DIRECTIONS, T.DIRECTIONS);
});

test('clips: a clip of its own gives frames and fps; a standard one may be overridden', () => {
  const c = K.clips((p) => p.speed, ['idle', { name: 'shoot', frames: 8, label: 'Spit' }, { name: 'burrow', frames: 8, fps: 12 }]);
  assert.deepEqual(Object.keys(c), ['idle', 'shoot', 'burrow']);
  assert.equal(c.shoot.frames, 8);
  assert.equal(c.shoot.label, 'Spit');
  assert.equal(c.shoot.loop, false);
  assert.ok(Math.abs(c.shoot.fps({ speed: 0.5 }) - 14 * 1.05) < 1e-9, 'fps is the standard one at the middle speed');
  assert.equal(c.burrow.loop, false);
  assert.ok(c.burrow.fps({ speed: 1 }) > c.burrow.fps({ speed: 0 }));
  assert.throws(() => K.clips(() => 0.5, ['burrow']), /frames and fps/);
});

// ---- project ----------------------------------------------------------------------------------------

test('project: forward is down the picture facing down, up it facing up, to the right facing side; up is always up', () => {
  const o = [24, 40];
  assert.deepEqual(K.project('down', 0, 0, 0), [K.CX + 0.5, K.GROUND, 0], 'by default the floor under the middle of the pivot column');
  assert.deepEqual(K.project('down', 0, 0, 0, o), [24, 40, 0]);
  assert.ok(K.project('down', 5, 0, 0, o)[1] > 40 && K.project('up', 5, 0, 0, o)[1] < 40);
  assert.equal(K.project('side', 5, 0, 0, o)[0], 29);
  assert.equal(K.project('down', 5, 0, 0, o)[1] - 40, 5 * K.DEPTH, 'depth along the floor is foreshortened');
  for (const dir of K.DIRECTIONS) assert.equal(K.project(dir, 0, 0, 7, o)[1], 33, `${dir}: height is not foreshortened`);
  // the creature's own right: picture-left when it faces the camera, picture-right when it faces away, nearer the camera in side
  assert.ok(K.project('down', 0, 4, 0, o)[0] < 24 && K.project('up', 0, 4, 0, o)[0] > 24);
  assert.ok(K.project('side', 0, 4, 0, o)[1] > 40 && K.project('side', 0, 4, 0, o)[2] > 0);
  // nearer the camera means a bigger z: the head facing down, the tail facing up
  assert.ok(K.project('down', 5, 0, 0, o)[2] > K.project('down', -5, 0, 0, o)[2]);
  assert.ok(K.project('up', -5, 0, 0, o)[2] > K.project('up', 5, 0, 0, o)[2]);
});

// ---- body, solve ------------------------------------------------------------------------------------

test('body: segments run head first along the body, centred, and the legs grow from the longest one', () => {
  const B = BUG();
  assert.equal(B.segs.length, 3);
  assert.ok(B.segs[0].a > B.segs[1].a && B.segs[1].a > B.segs[2].a, 'head first');
  assert.ok(Math.abs(B.front + B.back) < 1e-9 && B.len < 8 + 12 + 9, 'centred, and the segments overlap');
  assert.ok(Math.abs(B.segs[0].a + B.segs[0].len / 2 - B.front) < 1e-9, 'the nose is the front of the first segment');
  assert.equal(B.hips.length, 3);
  assert.ok(B.hips[0] > B.hips[1] && B.hips[1] > B.hips[2], 'front pair first');
  for (const h of B.hips) assert.ok(Math.abs(h - B.segs[1].a) <= B.segs[1].len / 2, 'hips are on the longest segment');
  assert.equal(B.top, 2 + 8);
  assert.equal(K.body({ pairs: 0 }).hips.length, 0);
  // the feet spread like a fan: the middle pair stands furthest out, the front and back pairs nearer the middle line and further along the body
  assert.deepEqual(B.spans.map((v) => +v.toFixed(2)), [8, 10, 8]);
  assert.ok(B.feet[0] > B.hips[0] && B.feet[2] < B.hips[2]);
  assert.deepEqual(K.body({ pairs: 3, span: 10, fan: 0 }).spans, [10, 10, 10]);
});

test('solve: one description gives three pictures that stand on the ground line and face the right way', () => {
  const B = BUG();
  for (const dir of K.DIRECTIONS) {
    const { g, J } = shot(dir, 'idle', 0, {}, B);
    const b = g.bounds();
    assert.equal(b.y1, K.GROUND, `${dir}: the outline of the lowest foot lands on the ground row`);
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < 47, `${dir}: inside the frame`);
    assert.equal(J.segs.length, 3);
    for (let i = 1; i < J.segs.length; i++) assert.ok(J.segs[i].z >= J.segs[i - 1].z, `${dir}: far segments first`);
    assert.equal(J.legs.length, 6);
  }
  const down = shot('down', 'idle', 0, {}, B), up = shot('up', 'idle', 0, {}, B), side = shot('side', 'idle', 0, {}, B);
  assert.ok(down.J.head[1] > down.J.tail[1], 'down: the head is lower on the picture than the tail');
  assert.equal(down.J.segs.at(-1).i, 0, 'down: the head is painted last');
  assert.ok(up.J.head[1] < up.J.tail[1], 'up: the head is higher than the tail');
  assert.equal(up.J.segs.at(-1).i, 2, 'up: the tail is painted last');
  assert.ok(side.J.head[0] > side.J.tail[0] + 15, 'side: faces right and shows its whole length');
  // facing the camera it is as wide as its feet stand apart and symmetrical; from the side it is longer than from the front
  const bd = down.g.bounds(), bs = side.g.bounds();
  assert.ok(bd.x1 - bd.x0 >= 2 * B.span - 1 && bd.x1 - bd.x0 <= 2 * B.span + 3);
  assert.equal(bd.x0 + bd.x1, 2 * K.CX, 'down: the same on both sides of the pivot column');
  for (let y = bd.y0; y <= bd.y1; y++) for (let x = bd.x0; x <= bd.x1; x++) assert.equal(down.g.get(x, y) !== 0, down.g.get(2 * K.CX - x, y) !== 0, `down: mirrored at ${x}, ${y}`);
  assert.ok(bs.x1 - bs.x0 > bd.y1 - bd.y0, 'the side view is longer than the front view is deep');
  // legs: three a side facing down, and in `side` the near three are the creature's right
  assert.equal(down.J.legs.filter((L) => L.foot[0] < K.CX).length, 3);
  assert.equal(down.J.legs.filter((L) => L.near).length, 0);
  assert.deepEqual(side.J.legs.filter((L) => L.near).map((L) => L.side), ['right', 'right', 'right']);
  for (const L of side.J.legs) assert.ok(L.near ? L.foot[1] > side.J.origin[1] : L.foot[1] < side.J.origin[1], 'near feet are lower on the picture than far feet');
  assert.deepEqual(down.J.forward, [0, K.DEPTH]);
  assert.deepEqual(side.J.forward, [1, 0]);
});

test('solve: the pivot can be moved, for a bigger frame', () => {
  const B = BUG(), P = K.pose('idle', 0, {}, B);
  const a = K.solve('down', P, B), b = K.solve('down', P, B, { cx: 48, gy: 88 });
  assert.equal(b.head[0] - a.head[0], 24);
  assert.equal(b.head[1] - a.head[1], 46);
});

test('drawLegs: far and near together are all of them', () => {
  const B = BUG(), J = K.solve('side', K.pose('idle', 0, {}, B), B), paint = ramp('#b04a8a');
  const all = K.drawLegs(new Surface(48, 48), J, paint), far = K.drawLegs(new Surface(48, 48), J, paint, { side: 'far' }), near = K.drawLegs(new Surface(48, 48), J, paint, { side: 'near' });
  assert.ok(lit(far) > 6 && lit(near) > 6);
  const both = new Surface(48, 48).blit(far).blit(near);
  assert.equal(diff(both, all), 0);
});

// ---- pose -------------------------------------------------------------------------------------------

test('pose: idle and walk close their loops, and every pose stays in the frame in every direction', () => {
  const B = BUG();
  for (const dir of K.DIRECTIONS) {
    for (const action of ['idle', 'walk']) {
      assert.equal(diff(shot(dir, action, 0, {}, B).g, shot(dir, action, 1, {}, B).g), 0, `${dir} ${action}: t = 1 is t = 0`);
      const pics = phases(8, true).map((t) => shot(dir, action, t, { bounce: 1, stride: 1 }, B).g);
      for (let i = 1; i < pics.length; i++) assert.ok(diff(pics[i], pics[i - 1]) > 0, `${dir} ${action}: frame ${i} moves`);
    }
    for (const action of K.POSES) for (const t of phases(8, false)) {
      const b = shot(dir, action, t, { bounce: 1, stride: 1 }, B).g.bounds();
      assert.ok(b && b.x0 > 0 && b.y0 > 0 && b.x1 < 47 && b.y1 < 47, `${dir} ${action} at ${t.toFixed(2)}: inside the frame`);
    }
  }
});

test('pose: walk plants the two groups of three on frames 0 and 4', () => {
  const B = BUG();
  const down = (t) => K.pose('walk', t, {}, B).feet.map((f) => f.y < 0.01);
  const at0 = down(0), at4 = down(0.5);
  // group A: front right, back right, middle left. group B: the other three
  const A = [0, 2, 4], Bg = [1, 3, 5];
  for (const i of A) assert.ok(at0[i] && K.pose('walk', 0, {}, B).feet[i].x > 1, `leg ${i} has just touched down in front at frame 0`);
  for (const i of Bg) assert.ok(at4[i] && K.pose('walk', 0.5, {}, B).feet[i].x > 1, `leg ${i} has just touched down in front at frame 4`);
  assert.equal(K.gait(0, 0), 0);
  assert.equal(K.gait(0, 1), 0.5);
  assert.equal(K.gait(1, 1), 0);
  assert.equal(K.step(0).y, 0);
  assert.ok(K.step(0.8).y > 0.5, 'the foot is carried on the way forward');
  assert.ok(K.pose('walk', 0, { bounce: 1 }, B).drop > K.pose('walk', 0.125, { bounce: 1 }, B).drop, 'the body dips as feet land');
});

test('pose: attack draws back, then lunges furthest on frame 4 with jaws wide; hurt and die flash on frame 0', () => {
  const B = BUG(), at = (f) => K.pose('attack', f / 7, {}, B);
  assert.ok(at(2).x < -1.5, 'wind-up away from the target');
  assert.ok(at(4).x >= 5.5 && at(4).jaw === 1, 'furthest reach on frame 4');
  assert.equal(at(7).x, 0);
  for (const dir of K.DIRECTIONS) {
    const rest = K.solve(dir, at(0), B), hit = K.solve(dir, at(4), B);
    const moved = [hit.head[0] - rest.head[0], hit.head[1] - rest.head[1]];
    assert.ok(moved[0] * rest.forward[0] + moved[1] * rest.forward[1] > 1.5, `${dir}: the head goes the way it faces`);
  }
  assert.ok(K.pose('hurt', 0, {}, B).flash && !K.pose('hurt', 1, {}, B).flash);
  assert.ok(Math.abs(K.pose('hurt', 1, {}, B).x) < 1e-9, 'hurt ends on the idle pose');
  const dead = K.pose('die', 1, {}, B);
  assert.ok(K.pose('die', 0, {}, B).flash && dead.roll === 1 && dead.curl === 1);
  const J = K.solve('down', dead, B), up = K.solve('down', K.pose('idle', 0, {}, B), B);
  assert.equal(J.flip, 1);
  assert.ok(Math.max(...J.legs.map((L) => L.foot[1])) < Math.max(...up.legs.map((L) => L.foot[1])) - 4, 'on its back the feet are in the air');
  assert.ok(lit(shot('down', 'die', 1, {}, B).g) > 40, 'the last frame of die is a body, never empty');
});

test('sockets: head, back, tail and feet, with the head facing the way the creature does', () => {
  const B = BUG();
  const faces = { down: 0, up: PI, side: PI / 2 };
  for (const dir of K.DIRECTIONS) {
    const J = K.solve(dir, K.pose('idle', 0, {}, B), B), S = K.sockets(J);
    assert.deepEqual(Object.keys(S), ['head', 'back', 'tail', 'feet']);
    assert.equal(S.head.angle, faces[dir]);
    assert.deepEqual([S.head.x, S.head.y], J.head);
    assert.equal(S.feet.y, K.GROUND);
    assert.ok(S.back.y < S.feet.y - 5 && S.back.angle === PI);
    for (const s of Object.values(S)) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.angle));
  }
});

test('segmentIn: the lump of one segment, grown or shrunk', () => {
  const seg = { x: 24, y: 24, rx: 6, ry: 4 };
  const f = K.segmentIn(seg), big = K.segmentIn(seg, 2);
  assert.ok(f(24, 24) && f(29.5, 24) && !f(30.5, 24) && !f(24, 28.5));
  assert.ok(big(31.5, 24) && big(24, 29.5));
  assert.ok(K.segmentIn(seg, -20)(24, 24), 'never shrinks to nothing');
});

// ---- hover ------------------------------------------------------------------------------------------

test('hover: rises and falls once per clip, closes, moves a whole pixel even when nearly still, and leans a quarter beat behind', () => {
  for (const bob of [0, 0.5, 1]) {
    const lifts = phases(8, true).map((t) => Math.round(K.hover(t, { bob }).lift));
    assert.ok(Math.max(...lifts) >= 1 && Math.min(...lifts) <= -1, `bob ${bob}: ${lifts}`);
    assert.ok(Math.abs(K.hover(1, { bob }).lift - K.hover(0, { bob }).lift) < 1e-9);
  }
  assert.ok(K.hover(0.25, { bob: 1 }).lift > K.hover(0.25, { bob: 0 }).lift + 1.5);
  assert.ok(Math.abs(K.hover(0.25).lean) < 1e-9 && K.hover(0.5).lean > 0.4, 'the lean trails the lift');
  assert.equal(K.hover(0.25).level, 1);
  assert.ok(Math.abs(K.hover(0.125, { cycles: 2 }).lift - K.hover(0.25).lift) < 1e-9);
  assert.ok(Math.abs(K.hover(0, { phase: 0.25 }).lift - K.hover(0.25).lift) < 1e-9);
});

// ---- burrow, sunk -----------------------------------------------------------------------------------

test('burrow: the hole widens as it opens, the rubble rings it front and back, and nothing is random', () => {
  const o = { x: 24, y: 38, rx: 11, ry: 4, colour: '#6b7896', dark: '#141a33' };
  const hole = (open) => K.burrow(new Surface(48, 48), { ...o, layer: 'hole', open });
  assert.ok(lit(hole(1)) > lit(hole(0.5)) && lit(hole(0.5)) > lit(hole(0)) && lit(hole(0)) >= 2);
  const full = hole(1).bounds();
  assert.deepEqual([full.x0, full.x1], [13, 34]);
  assert.equal(hole(1).get(24, 37), col('#141a33'));
  const back = K.burrow(new Surface(48, 48), { ...o, layer: 'back' }), front = K.burrow(new Surface(48, 48), { ...o, layer: 'front' });
  assert.ok(lit(back) > 10 && lit(front) > 10);
  assert.ok(back.bounds().y1 <= 38 + 2 && front.bounds().y0 >= 38 - 1, 'back rubble behind the middle of the hole, front rubble before it');
  assert.ok(front.bounds().y1 <= 38 + 4 + 5 && back.bounds().y0 >= 38 - 4 - 6);
  assert.ok(lit(K.burrow(new Surface(48, 48), { ...o, layer: 'front', open: 0 })) + lit(K.burrow(new Surface(48, 48), { ...o, layer: 'back', open: 0 })) >= 2, 'some rubble from the first frame');
  assert.ok(lit(front) > lit(K.burrow(new Surface(48, 48), { ...o, layer: 'front', open: 0.3 })), 'the ring piles up');
  assert.equal(diff(front, K.burrow(new Surface(48, 48), { ...o, layer: 'front' })), 0);
  assert.ok(diff(front, K.burrow(new Surface(48, 48), { ...o, layer: 'front', seed: 3 })) > 0);
});

test('sunk: standing it is a copy; sinking, it moves down and is cut along the near rim of the hole', () => {
  const src = new Surface(48, 48).rect(18, 20, 12, 21, '#ca9eda');         // a post standing on row 40
  const hole = { x: 24, y: 37, rx: 10, ry: 4 };
  assert.equal(diff(K.sunk(src, 0, hole), src), 0);
  const half = K.sunk(src, 8, hole).bounds();
  assert.equal(half.y0, 28, 'moved down by the depth');
  assert.equal(half.y1, 40, 'cut where the near rim of the hole is');
  assert.equal(lit(K.sunk(src, 30, hole)), 0, 'all the way in, nothing shows');
  const top = K.sunk(src, 18, hole).bounds();
  assert.deepEqual([top.y0, top.y1], [38, 40], 'the last rows show inside the hole');
  // beside the hole the floor line cuts it
  const wide = new Surface(48, 48).rect(4, 20, 40, 21, '#ca9eda');
  const cut = K.sunk(wide, 2, hole);
  assert.equal(cut.get(6, 36) !== 0, true);
  assert.equal(cut.get(6, 37), 0, 'outside the hole nothing goes below the floor line');
  assert.equal(src.get(20, 22), col('#ca9eda'), 'the source is not changed');
});

// ---- rotor ------------------------------------------------------------------------------------------

test('rotor: two alternating pictures while it spins, crisp blades when stopped', () => {
  const pic = (o) => rotor(new Surface(32, 32), 16, 16, 7, { colour: '#c2c9d6', ...o });
  const even = pic({ beat: 0 }), odd = pic({ beat: 1 });
  assert.ok(diff(even, odd) > 8, 'the two pictures differ');
  assert.equal(diff(even, pic({ beat: 2 })), 0);
  assert.equal(diff(odd, pic({ beat: 3 })), 0);
  const b = even.bounds();
  assert.deepEqual([b.x0, b.x1], [9, 22], 'the disc reaches the blade tips');
  assert.ok(b.y1 - b.y0 + 1 <= 7, 'and is seen at a slant, flat');
  const still = pic({ still: true });
  assert.ok(lit(still) < lit(even) / 2, 'stopped, it is two thin blades');
  assert.ok(diff(still, pic({ still: true, turn: 2 })) > 4, 'which can point anywhere');
  assert.equal(pic({ hub: '#e2473f' }).get(16, 16), col('#e2473f'));
});
