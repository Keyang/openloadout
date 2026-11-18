// The top-down body rig (rigs/topdown.js): the three-quarter-view partner of rigs/humanoid.js.
// docs/style-guide.md sections 1, 4, 5, 9 and 14 say what it must do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { lerp } from '../../engine/motion.js';
import * as T from '../../rigs/topdown.js';

const LOOK = { skin: '#f6d3b0', top: '#3f6fd1', bottom: '#2c4a8a', boots: '#9a6a3e', hair: '#5a3a22', hairStyle: 'short' };
const BODIES = { smallest: { height: 0, build: 0, head: 0 }, standard: {}, largest: { height: 1, build: 1, head: 1 } };
const ACTIONS = ['idle', 'walk', 'run', 'attack', 'punch', 'shoot', 'cast', 'block', 'dodge', 'talk', 'hurt', 'die'];
const [W, H] = T.SIZE;

/** The phases (0..1) of an action's frames, as engine/sprite.js gives them to render(). */
function phases(action) {
  const c = T.STANDARD[action] ?? T.STANDARD.attack;
  return Array.from({ length: c.frames }, (_, f) => (c.loop ? f / c.frames : f / (c.frames - 1)));
}
/** One bare body: no parts. */
function body(action, direction, t, dimsOf = {}, { outline = true, m = {}, hooks, look = LOOK } = {}) {
  const g = new Surface(W, H), d = T.dims(dimsOf), P = T.pose(action, direction, t, m, d);
  const J = T.draw(g, direction, P, d, look, hooks);
  if (outline) g.outline(INK);
  return { g, J, P, d };
}
const every = () => ACTIONS.flatMap((a) => T.DIRECTIONS.flatMap((dir) => phases(a).map((t, f) => [a, dir, t, f])));
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const lit = (g, c) => { const out = [], v = c === undefined ? null : col(c); for (let i = 0; i < g.data.length; i++) if (v === null ? g.data[i] : g.data[i] === v) out.push([i % g.w, Math.floor(i / g.w)]); return out; };

// ---- the frame and the clip table -------------------------------------------------------------

test('topdown rig: 48x48 frame, pivot [24, 42], three drawn directions', () => {
  assert.deepEqual(T.SIZE, [48, 48]);
  assert.deepEqual(T.PIVOT, [24, 42]);
  assert.equal(T.GROUND, 42);
  assert.deepEqual(T.DIRECTIONS, ['down', 'up', 'side']);
});

test('topdown rig: clips() returns the section 5 "Full" table in the fixed order', () => {
  const c = T.clips();
  assert.deepEqual(Object.keys(c), ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'attack_down', 'attack_up', 'attack_side', 'hurt', 'die']);
  for (const dir of T.DIRECTIONS) {
    assert.deepEqual([c[`idle_${dir}`].frames, c[`idle_${dir}`].loop], [8, true]);
    assert.deepEqual([c[`walk_${dir}`].frames, c[`walk_${dir}`].loop], [8, true]);
    assert.deepEqual([c[`attack_${dir}`].frames, c[`attack_${dir}`].loop], [8, false]);
    assert.equal(c[`walk_${dir}`].label, `Walk (${dir})`);
    assert.equal(c[`idle_${dir}`].label, `Idle (${dir})`);
  }
  assert.deepEqual([c.hurt.frames, c.hurt.loop], [4, false]);
  assert.deepEqual([c.die.frames, c.die.loop], [8, false]);
});

test('topdown rig: every clip speed is base * lerp(0.65, 1.45, speed), with the section 4 bases', () => {
  const c = T.clips((p) => p.speed, { action: ['attack', 'shoot', 'run'], plain: ['hurt', 'die', 'cast', 'block', 'dodge', 'talk'] });
  const base = { idle_down: 7, walk_side: 10, run_up: 14, attack_down: 13, shoot_side: 14, cast: 10, block: 10, hurt: 9, die: 10, talk: 7, dodge: 14 };
  for (const [name, b] of Object.entries(base)) for (const speed of [0, 0.5, 1]) {
    assert.ok(Math.abs(c[name].fps({ speed }) - b * lerp(0.65, 1.45, speed)) < 1e-9, `${name} at speed ${speed}`);
  }
  assert.deepEqual([c.shoot_down.frames, c.block.frames, c.dodge.frames, c.talk.loop, c.cast.frames], [6, 6, 8, true, 8]);
});

test('topdown rig: clips() options cover the "Walker" level, other directed actions, no walk, and extra clips', () => {
  assert.deepEqual(Object.keys(T.clips(undefined, { action: null, plain: ['cast'] })), ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'cast']);
  assert.deepEqual(Object.keys(T.clips(undefined, { action: 'shoot' })).slice(6, 9), ['shoot_down', 'shoot_up', 'shoot_side']);
  assert.deepEqual(Object.keys(T.clips(undefined, { action: 'run', plain: [] })), ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'run_down', 'run_up', 'run_side']);
  assert.deepEqual(Object.keys(T.clips(undefined, { walk: false, action: null, plain: ['talk'], extra: { wave: { frames: 8, fps: 8, loop: false } } })), ['idle_down', 'idle_up', 'idle_side', 'talk', 'wave']);
  assert.throws(() => T.clips(undefined, { action: 'slash' }), /slash/);
});

test('topdown rig: parseClip splits a clip name into action and direction; no suffix means facing down', () => {
  assert.deepEqual(T.parseClip('walk_side'), { action: 'walk', direction: 'side' });
  assert.deepEqual(T.parseClip('attack_up'), { action: 'attack', direction: 'up' });
  assert.deepEqual(T.parseClip('hurt'), { action: 'hurt', direction: 'down' });
  assert.deepEqual(T.parseClip('ground-top'), { action: 'ground-top', direction: 'down' });
});

// ---- size ---------------------------------------------------------------------------------------

test('topdown rig: the standard body is about 30 px tall with a head 12 to 13 px across; height and build change it', () => {
  for (const dir of T.DIRECTIONS) {
    const b = body('idle', dir, 0, {}, { outline: false }).g.bounds();
    const tall = b.y1 - b.y0 + 1, wide = b.x1 - b.x0 + 1;
    assert.ok(tall >= 29 && tall <= 31, `${dir}: ${tall} px tall`);
    assert.ok(wide >= 11 && wide <= 18, `${dir}: ${wide} px wide`);
  }
  const d = T.dims({});
  assert.ok(d.headW >= 12 && d.headW <= 13, `head ${d.headW} px across`);
  const tallOf = (p) => { const b = body('idle', 'down', 0, p, { outline: false }).g.bounds(); return b.y1 - b.y0 + 1; };
  const wideOf = (p) => { const g = body('idle', 'down', 0, p, { outline: false }).g; let n = 0; for (let x = 0; x < W; x++) if (g.get(x, 30)) n++; return n; };
  assert.ok(tallOf({ height: 0 }) <= 27 && tallOf({ height: 1 }) >= 33, 'height slider');
  assert.ok(wideOf({ build: 1 }) - wideOf({ build: 0 }) >= 4, 'build slider');
  assert.ok(T.dims({ head: 1 }).headH > T.dims({ head: 0 }).headH, 'head slider');
  // a child: the caller may give its own height range
  assert.ok(T.dims({ height: 0 }, { tall: [22, 27] }).tall === 22 && T.dims({ height: 1 }, { tall: [22, 27] }).tall === 27);
});

// ---- every pose, every direction ---------------------------------------------------------------

test('topdown rig: every action in every direction stays inside the frame at the smallest and the largest body', () => {
  for (const [name, dimsOf] of Object.entries(BODIES)) for (const [a, dir, t, f] of every()) {
    const b = body(a, dir, t, dimsOf).g.bounds();
    assert.ok(b, `${name} ${a} ${dir} frame ${f}: nothing drawn`);
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${name} ${a} ${dir} frame ${f} touches the frame edge (${b.x0},${b.y0}..${b.x1},${b.y1})`);
  }
});

test('topdown rig: every action is posed (it does not fall back on standing still), and an unknown one throws', () => {
  for (const a of ACTIONS) for (const dir of T.DIRECTIONS) {
    const ts = phases(a);
    const first = body(a, dir, ts[0]).g;
    const moving = ts.some((t) => diff(body(a, dir, t).g, first) > 8);
    assert.ok(moving, `${a} ${dir} never moves`);
  }
  assert.throws(() => T.pose('moonwalk', 'down', 0), /moonwalk/);
  assert.throws(() => T.pose('idle', 'left', 0), /left/);
});

test('topdown rig: the same call draws the same pixels', () => {
  for (const dir of T.DIRECTIONS) assert.equal(diff(body('attack', dir, 0.5).g, body('attack', dir, 0.5).g), 0);
});

// ---- loops and the walk ---------------------------------------------------------------------------

test('topdown rig: looping actions close: the pose at the end equals the pose at the start', () => {
  for (const a of ['idle', 'walk', 'run', 'talk']) for (const dir of T.DIRECTIONS) for (const dimsOf of Object.values(BODIES)) {
    assert.equal(diff(body(a, dir, 0, dimsOf).g, body(a, dir, 1, dimsOf).g), 0, `${a} ${dir}: t=1 differs from t=0`);
    // and the step from the last frame into the first is a step like any other, not a held frame
    assert.ok(diff(body(a, dir, 7 / 8, dimsOf).g, body(a, dir, 0, dimsOf).g) > 0, `${a} ${dir}: last frame equals the first`);
  }
});

test('topdown rig: the walk steps, it does not slide: feet alternate, touch down on frames 0 and 4, and the body dips there', () => {
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const at = (f) => T.pose('walk', dir, f / 8, {}, d);
    // contacts: on frames 0 and 4 both feet are down, one ahead and one behind, and they have swapped
    for (const f of [0, 4]) {
      const P = at(f);
      assert.ok(P.footF.u < 0.01 && P.footB.u < 0.01, `${dir} frame ${f}: a foot is in the air on a contact frame`);
      assert.ok(P.footF.f * P.footB.f < 0, `${dir} frame ${f}: feet are not one ahead, one behind`);
    }
    assert.ok(at(0).footF.f > 0 && at(4).footF.f < 0 && at(0).footB.f < 0 && at(4).footB.f > 0, `${dir}: the feet do not swap between frames 0 and 4`);
    // between contacts one foot is lifted and travels forward while the other stays down and travels back
    for (const f of [1, 2, 3]) {
      const P = at(f), Q = at(f + 1);
      assert.ok(P.footB.u > 0.3, `${dir} frame ${f}: the swinging foot is not lifted`);
      assert.ok(P.footF.u < 0.01, `${dir} frame ${f}: the standing foot is lifted`);
      assert.ok(Q.footF.f < P.footF.f && Q.footB.f > P.footB.f, `${dir} frame ${f}: the feet do not pass each other`);
    }
    // a foot on the ground moves back at a steady rate (the ground under it would stand still)
    const steps = [0, 1, 2, 3].map((f) => at(f).footF.f - at(f + 1).footF.f);
    for (const s of steps) assert.ok(Math.abs(s - steps[0]) < 1e-9, `${dir}: the standing foot slides (${steps.join(', ')})`);
    // the body is lower on the contact frames than between them
    assert.ok(at(0).bob > at(2).bob && at(4).bob > at(6).bob, `${dir}: no dip on contact`);
    // arms swing opposite the legs
    assert.ok(at(0).armF.f < 0 && at(0).armB.f > 0 && at(4).armF.f > 0 && at(4).armB.f < 0, `${dir}: arms do not swing opposite the legs`);
    // and it shows: every frame differs from the one before
    for (let f = 0; f < 8; f++) assert.ok(diff(body('walk', dir, f / 8).g, body('walk', dir, ((f + 1) % 8) / 8).g) > 4, `${dir}: walk frame ${f} and the next look the same`);
  }
});

test('topdown rig: the legs are drawn stepping: in walk the two feet reach different rows (down, up) or columns (side)', () => {
  const boot = col('#9a6a3e');
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const { g, J } = body('walk', dir, 0, {}, { outline: false });
    const boots = [];
    for (let i = 0; i < g.data.length; i++) if (g.data[i] === boot) boots.push([i % W, Math.floor(i / W)]);
    assert.ok(boots.length >= 4, `${dir}: boots not found`);
    if (dir === 'side') {
      assert.ok(Math.abs(J.legF.x - J.legB.x) >= 5, `${dir}: feet are not apart at the contact (${J.legF.x}, ${J.legB.x})`);
      // and they have traded places half a cycle later
      const K = body('walk', dir, 0.5, {}, { outline: false }).J;
      assert.ok((J.legF.x - J.legB.x) * (K.legF.x - K.legB.x) < 0, `${dir}: the feet do not trade places`);
    } else {
      const lowest = (side) => Math.max(...boots.filter((b) => (side < 0 ? b[0] < 24 : b[0] > 24)).map((b) => b[1]));
      assert.ok(Math.abs(lowest(-1) - lowest(1)) >= 2, `${dir}: both feet end on the same row at the contact`);
    }
    assert.ok(d.leg >= 8, 'legs long enough to step');
  }
});

test('topdown rig: bounce and stride change the walk; longer legs take longer steps', () => {
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    assert.ok(T.pose('walk', dir, 0, { stride: 1 }, d).footF.f > T.pose('walk', dir, 0, { stride: 0 }, d).footF.f + 1, `${dir} stride`);
    assert.ok(T.pose('walk', dir, 0, { bounce: 1 }, d).bob > T.pose('walk', dir, 0, { bounce: 0 }, d).bob, `${dir} bounce`);
    assert.ok(T.pose('walk', dir, 0, {}, T.dims({ height: 1 })).footF.f > T.pose('walk', dir, 0, {}, T.dims({ height: 0 })).footF.f, `${dir} height`);
    assert.ok(diff(body('idle', dir, 0.5, {}, { m: { bounce: 1 } }).g, body('idle', dir, 0.5, {}, { m: { bounce: 0 } }).g) > 8, `${dir}: bounce does not show in idle`);
  }
});

test('topdown rig: feet rest on the pivot line in idle, in every direction and at every size', () => {
  for (const [name, dimsOf] of Object.entries(BODIES)) for (const dir of T.DIRECTIONS) for (const t of phases('idle')) {
    assert.equal(body('idle', dir, t, dimsOf, { outline: false }).g.bounds().y1, T.GROUND - 1, `${name} ${dir} at ${t}: lowest body pixel`);
    assert.equal(body('idle', dir, t, dimsOf).g.bounds().y1, T.GROUND, `${name} ${dir} at ${t}: outline`);
  }
  // and the walk never sinks below it
  for (const dir of T.DIRECTIONS) for (const t of phases('walk')) assert.ok(body('walk', dir, t).g.bounds().y1 <= T.GROUND, `walk ${dir} at ${t} sinks below the ground`);
});

test('topdown rig: the body is centred on the pivot column when it stands', () => {
  for (const dir of ['down', 'up']) {
    const b = body('idle', dir, 0, {}, { outline: false }).g.bounds();
    assert.equal(b.x0 + b.x1, 2 * T.PIVOT[0], `${dir}: body spans ${b.x0}..${b.x1}`);
  }
});

// ---- the three directions ---------------------------------------------------------------------------

test('topdown rig: down shows a face with two eyes, up shows none, side shows one eye on the right of the head', () => {
  const eyes = (dir) => {
    const { g, J } = body('idle', dir, 0, {}, { outline: false });
    return { px: lit(g, INK), J };
  };
  const down = eyes('down'), up = eyes('up'), side = eyes('side');
  const cols = (px) => [...new Set(px.map((p) => p[0]))].sort((a, b) => a - b);
  assert.equal(cols(down.px).length, 2, 'down: two eyes');
  const [l, r] = cols(down.px);
  assert.equal(l + r, 2 * Math.floor(down.J.head[0]), 'down: eyes are symmetric about the head');
  assert.ok(r - l >= 4, 'down: eyes are set apart');
  assert.equal(up.px.length, 0, 'up: no face');
  assert.equal(cols(side.px).length, 1, 'side: one eye');
  assert.ok(side.px[0][0] > side.J.head[0] + 1, 'side: the eye is on the right of the head (the sprite faces right)');
  // down and up are different pictures
  assert.ok(diff(body('idle', 'down', 0).g, body('idle', 'up', 0).g) > 20, 'down and up differ');
  assert.ok(diff(body('idle', 'down', 0).g, body('idle', 'side', 0).g) > 20, 'down and side differ');
});

test('topdown rig: seen from behind the head is hair: more hair shows in up than in down, and no hair when bald', () => {
  const hair = col(LOOK.hair);
  const count = (dir, style) => { const g = body('idle', dir, 0, {}, { outline: false, look: { ...LOOK, hairStyle: style } }).g; let n = 0; for (const v of g.data) if (v === hair) n++; return n; };
  assert.ok(count('up', 'short') > count('down', 'short') * 1.4, 'up shows the back of the head');
  for (const dir of T.DIRECTIONS) {
    assert.equal(count(dir, 'bald'), 0, `${dir}: bald`);
    const seen = new Set();
    for (const style of T.HAIR_STYLES) {
      const g = body('idle', dir, 0, {}, { look: { ...LOOK, hairStyle: style } }).g;
      const key = Array.from(g.data).join(',');
      assert.ok(!seen.has(key), `${dir}: hair style ${style} looks like another`);
      seen.add(key);
    }
  }
  assert.deepEqual(T.HAIR_STYLES, ['short', 'long', 'spiky', 'ponytail', 'bald']);
});

test('topdown rig: side faces right: the feet point right and the attack reaches right; down reaches down, up reaches up', () => {
  const d = T.dims({});
  const reachAt = (dir) => { const P = T.pose('attack', dir, 4 / 7, {}, d), J = T.solve(dir, P, d), s = T.sockets(J, P, d); return { s, tip: T.itemTip(J, P, 10), J }; };
  const side = reachAt('side'), down = reachAt('down'), up = reachAt('up');
  assert.ok(side.tip[0] > T.PIVOT[0] + 10, `side: the hit points right (tip x ${side.tip[0]})`);
  assert.ok(down.tip[1] > down.s.hand.y + 5, 'down: the hit points down the screen');
  assert.ok(up.tip[1] < up.s.hand.y - 5, 'up: the hit points up the screen');
  // the wind-up is on the other side of the hand from the hit
  const wind = (dir) => { const P = T.pose('attack', dir, 2 / 7, {}, d), J = T.solve(dir, P, d); const tip = T.itemTip(J, P, 10), h = J.armF.hand; return [tip[0] - h[0], tip[1] - h[1]]; };
  assert.ok(wind('side')[0] < -3, 'side: winds up behind');
  assert.ok(wind('down')[1] < -2, 'down: winds up away from the camera');
  assert.ok(wind('up')[1] > 2, 'up: winds up towards the camera');
  // side-view feet point right
  const g = body('idle', 'side', 0, {}, { outline: false }).g, boot = lit(g, LOOK.boots).map((p) => p[0]);
  const ankle = T.solve('side', T.pose('idle', 'side', 0, {}, d), d).legF.x;
  assert.ok(Math.max(...boot) + 0.5 - ankle > ankle - Math.min(...boot) - 0.5, 'side: the boot sticks out to the right of its ankle');
});

test('topdown rig: the weapon hand is on the left of the picture facing down, on the right facing up', () => {
  const d = T.dims({});
  const hand = (dir) => { const P = T.pose('idle', dir, 0, {}, d); return T.sockets(T.solve(dir, P, d), P, d); };
  assert.ok(hand('down').hand.x < T.PIVOT[0] - 3 && hand('down').offhand.x > T.PIVOT[0] + 3);
  assert.ok(hand('up').hand.x > T.PIVOT[0] + 3 && hand('up').offhand.x < T.PIVOT[0] - 3);
});

// ---- hooks and depth order -----------------------------------------------------------------------

test('topdown rig: draw calls the same hooks as the side rig, once each, with (g, J, P, d), in the depth order of the direction', () => {
  const NAMES = ['behind', 'offhand', 'torso', 'head', 'item', 'front'];
  const order = (dir) => {
    const seen = [];
    const hooks = Object.fromEntries(NAMES.map((n) => [n, (g, J, P, d) => {
      assert.ok(g instanceof Surface && J && J.dir === dir && P && d && Number.isFinite(d.tall), `${dir} ${n}: arguments`);
      for (const k of ['hip', 'neck', 'head']) assert.ok(Array.isArray(J[k]) && J[k].length === 2, `${dir} ${n}: J.${k}`);
      for (const k of ['armF', 'armB']) assert.ok(Array.isArray(J[k].hand) && Array.isArray(J[k].shoulder), `${dir} ${n}: J.${k}`);
      assert.ok(Number.isFinite(J.gy));
      seen.push(n);
    }]));
    body('idle', dir, 0, {}, { hooks });
    return seen;
  };
  for (const dir of T.DIRECTIONS) assert.deepEqual([...order(dir)].sort(), [...NAMES].sort(), `${dir}: every hook once`);
  const down = order('down'), up = order('up'), side = order('side');
  const before = (list, a, b) => list.indexOf(a) < list.indexOf(b);
  assert.equal(down[0], 'behind', 'down: things on the back are drawn first');
  assert.ok(before(down, 'torso', 'head') && before(down, 'head', 'item') && down.at(-1) === 'front', `down: ${down}`);
  assert.equal(side[0], 'behind');
  assert.ok(before(side, 'offhand', 'torso') && before(side, 'torso', 'head') && before(side, 'head', 'item') && side.at(-1) === 'front', `side: ${side}`);
  assert.ok(before(up, 'item', 'torso') && before(up, 'offhand', 'torso') && before(up, 'torso', 'behind') && before(up, 'behind', 'head') && up.at(-1) === 'front', `up: ${up}`);
});

test('topdown rig: the held item is behind the body in up clips and in front in down and side; things on the back are the reverse', () => {
  const MARK = '#ff00ff', mark = col(MARK);
  // a 4x3 mark painted by one hook, on the head (where: 'head') or on the chest; how much of it is still seen at the end
  const visible = (dir, hook, where = 'chest') => {
    let at = null;
    const { g } = body('idle', dir, 0, {}, { outline: false, hooks: { [hook]: (gg, J) => {
      at = where === 'head' ? [Math.floor(J.head[0]) - 2, Math.round(J.head[1]) - 1] : [Math.floor(J.hip[0]) - 2, Math.round((J.hip[1] + J.neck[1]) / 2) + 1];
      gg.rect(at[0], at[1], 4, 3, MARK);
    } } });
    let n = 0;
    for (let y = at[1]; y < at[1] + 3; y++) for (let x = at[0]; x < at[0] + 4; x++) if (g.get(x, y) === mark) n++;
    return n;
  };
  assert.equal(visible('up', 'item'), 0, 'up: the body covers the held item');
  assert.equal(visible('up', 'offhand'), 0, 'up: the body covers the off-hand item');
  assert.equal(visible('down', 'item'), 12, 'down: the held item is in front');
  assert.equal(visible('side', 'item', 'head'), 12, 'side: the held item is in front');
  assert.equal(visible('up', 'item', 'head'), 0, 'up: the head covers the held item');
  assert.equal(visible('side', 'offhand'), 0, 'side: the body covers the off-hand item');
  assert.equal(visible('down', 'offhand'), 12, 'down: the off-hand item is in front');
  assert.equal(visible('down', 'behind'), 0, 'down: the body covers what is on the back');
  assert.equal(visible('up', 'behind'), 12, 'up: what is on the back is in front');
});

// ---- sockets ----------------------------------------------------------------------------------------

test('topdown rig: sockets names hand, offhand, head, back, feet and muzzle for every pose', () => {
  const d = T.dims({});
  for (const [a, dir, t] of every()) {
    const P = T.pose(a, dir, t, {}, d), J = T.solve(dir, P, d), s = T.sockets(J, P, d);
    assert.deepEqual(Object.keys(s), ['hand', 'offhand', 'head', 'back', 'feet', 'muzzle'], `${a} ${dir}`);
    for (const k of Object.keys(s)) for (const f of ['x', 'y', 'angle']) assert.ok(Number.isFinite(s[k][f]), `${a} ${dir} ${k}.${f}`);
    for (const k of Object.keys(s)) assert.ok(s[k].x > 0 && s[k].x < W && s[k].y > 0 && s[k].y < H, `${a} ${dir} at ${t}: ${k} is outside the frame (${s[k].x}, ${s[k].y})`);
  }
  const P = T.pose('idle', 'side', 0, {}, d), J = T.solve('side', P, d), s = T.sockets(J, P, d, { muzzle: 9 });
  assert.deepEqual([s.hand.x, s.hand.y, s.hand.angle], [J.armF.hand[0], J.armF.hand[1], P.item]);
  assert.deepEqual([s.offhand.x, s.offhand.y], J.armB.hand);
  assert.equal(s.feet.y, T.GROUND);
  assert.ok(s.head.y < s.back.y && s.back.y < s.feet.y, 'head above back above feet');
  assert.ok(Math.abs(Math.hypot(s.muzzle.x - s.hand.x, s.muzzle.y - s.hand.y) - 9 * (P.reach ?? 1)) < 1e-6, 'the muzzle is at the end of the held thing');
  assert.equal(s.muzzle.angle, s.hand.angle);
});

test('topdown rig: the hand socket sits on drawn pixels in every frame, at every size', () => {
  for (const [name, dimsOf] of Object.entries(BODIES)) for (const [a, dir, t, f] of every()) {
    const { g, P, d } = body(a, dir, t, dimsOf, { outline: false });
    const s = T.sockets(T.solve(dir, P, d), P, d);
    for (const k of ['hand', 'offhand']) assert.ok(g.get(Math.floor(s[k].x), Math.floor(s[k].y)) !== 0, `${name} ${a} ${dir} frame ${f}: the ${k} socket (${s[k].x.toFixed(1)}, ${s[k].y.toFixed(1)}) is not on the body`);
  }
});

test('topdown rig: lying down (die), sockets are where the parts are in the frame; inside a hook they are on the picture the hook draws on', () => {
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const P = T.pose('die', dir, 1, {}, d);
    assert.equal(P.lie, 1);
    const s = T.sockets(T.solve(dir, P, d), P, d);
    assert.ok(s.head.x > s.feet.x + 8, `${dir}: the head is not at the right end of the body`);
    assert.ok(Math.abs(s.head.y - s.back.y) < 3 && s.back.x < s.head.x, `${dir}: head and back are not side by side`);
    let inHook = null;
    const g = new Surface(W, H);
    T.draw(g, dir, P, d, LOOK, { front: (gg, J) => { inHook = T.sockets(J, P, d); gg.rect(Math.floor(inHook.hand.x) - 1, Math.floor(inHook.hand.y) - 6, 2, 6, '#ff00ff'); } });
    assert.ok(inHook.head.y < inHook.back.y && inHook.back.y < inHook.feet.y, `${dir}: inside a hook the body stands`);
    // what the hook drew upwards from the hand comes out pointing right, at the hand's place in the frame
    const mark = lit(g, '#ff00ff');
    assert.ok(mark.length >= 6, `${dir}: the hook's drawing is lost`);
    const xs = mark.map((p) => p[0]), ys = mark.map((p) => p[1]);
    assert.ok(Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys), `${dir}: the hook's drawing was not turned with the body`);
    assert.ok(Math.abs(Math.min(...xs) - s.hand.x) <= 2 && Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - s.hand.y) <= 2, `${dir}: the hand socket is not where the hook drew`);
  }
});

test('topdown rig: when shooting, the item points the way the body faces and the muzzle leads the hand', () => {
  const d = T.dims({});
  for (const [dir, want] of [['down', [0, 1]], ['up', [0, -1]], ['side', [1, 0]]]) {
    const P = T.pose('shoot', dir, 0.2, {}, d), J = T.solve(dir, P, d), s = T.sockets(J, P, d, { muzzle: 8 });
    const v = [s.muzzle.x - s.hand.x, s.muzzle.y - s.hand.y];
    assert.ok(v[0] * want[0] + v[1] * want[1] > 4, `${dir}: muzzle offset ${v}`);
  }
  // recoil: on frame 2 the hand is pulled back from where it was on frame 1
  for (const dir of T.DIRECTIONS) assert.ok(T.pose('shoot', dir, 0.4, {}, d).armF.f < T.pose('shoot', dir, 0.2, {}, d).armF.f - 1, `${dir}: no recoil`);
});

// ---- the standard one-shot poses --------------------------------------------------------------------

test('topdown rig: one-shot actions start from and end on the standing pose; hurt starts on a white recoil; die ends lying down', () => {
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const idle = body('idle', dir, 0).g;
    for (const a of ['attack', 'punch', 'cast', 'block', 'dodge']) {
      assert.equal(diff(body(a, dir, 0).g, idle), 0, `${a} ${dir} does not start on the standing pose`);
      assert.equal(diff(body(a, dir, 1).g, idle), 0, `${a} ${dir} does not end on the standing pose`);
    }
    assert.equal(diff(body('shoot', dir, 1).g, idle), 0, `shoot ${dir} does not end on the standing pose`);
    assert.equal(diff(body('hurt', dir, 1).g, idle), 0, `hurt ${dir} does not end on the standing pose`);
    assert.ok(T.pose('hurt', dir, 0, {}, d).flash && !T.pose('hurt', dir, 1, {}, d).flash, `hurt ${dir}: flash`);
    assert.ok(diff(body('hurt', dir, 0).g, idle) > 20, `hurt ${dir}: frame 0 is a recoil`);
    assert.ok(T.pose('die', dir, 0, {}, d).flash, `die ${dir}: frame 0 flashes`);
    const last = body('die', dir, 1).g.bounds(), up = idle.bounds();
    assert.ok(last.x1 - last.x0 > last.y1 - last.y0, `die ${dir}: the last frame is not lying down`);
    assert.ok(last.y1 - last.y0 < (up.y1 - up.y0) * 0.75, `die ${dir}: the body is still standing`);
    assert.ok(last.y1 >= T.GROUND - 2 && last.y1 <= T.GROUND + 4, `die ${dir}: the body does not rest on the ground (${last.y1})`);
  }
  // the fall is a sequence, not one jump
  const fall = phases('die').map((t) => body('die', 'down', t).g);
  let held = 0;
  for (let i = 1; i < fall.length; i++) if (diff(fall[i], fall[i - 1]) === 0) held++;
  assert.ok(held <= 1, `die: ${held} held frames`);
});

test('topdown rig: cast glows and peaks on frame 4; block raises the guard on frame 1 and holds it; talk moves the mouth on 2 and 6', () => {
  const d = T.dims({});
  const glow = phases('cast').map((t) => T.pose('cast', 'down', t, {}, d).glow);
  assert.equal(glow.indexOf(Math.max(...glow)), 4);
  assert.ok(glow[0] === 0 && glow[7] === 0 && glow[2] > 0);
  const guard = phases('block').map((t) => T.pose('block', 'down', t, {}, d).armB.u);
  assert.ok(guard[1] > guard[0] + 1 && Math.abs(guard[2] - guard[4]) < 0.6 && guard[5] === guard[0]);
  const mouth = phases('talk').map((t) => !!T.pose('talk', 'down', t, {}, d).mouth);
  assert.deepEqual(mouth, [false, false, true, false, false, false, true, false]);
  const tuck = phases('dodge').map((t) => T.pose('dodge', 'side', t, {}, d).tuck);
  assert.ok(tuck[1] > 0 && tuck[3] > 0.9 && tuck[7] === 0, 'dodge tucks');
});

test('topdown rig: an unarmed attack (punch) throws the hand towards the facing direction', () => {
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const rest = T.pose('idle', dir, 0, {}, d), hit = T.pose('punch', dir, 4 / 7, {}, d);
    assert.ok(hit.armF.f > rest.armF.f + 2.5, `${dir}: the fist does not go forward`);
  }
});

// ---- held items --------------------------------------------------------------------------------------

test('topdown rig: heldItem draws a kind from an attach point for a direction; sizes come from one table', () => {
  for (const kind of ['sword', 'axe', 'spear', 'staff']) {
    const size = T.itemSize(kind, 1);
    assert.ok(size.length >= 8 && size.length <= 16 && size.back >= 0 && size.pad >= 1, `${kind}: ${JSON.stringify(size)}`);
    assert.ok(Math.abs(T.itemSize(kind, 1.3).length - size.length * 1.3) < 1e-9);
    for (const dir of T.DIRECTIONS) for (const angle of [0.4, 1.6, 2.6, 4.2, 5.5]) {
      const g = new Surface(W, H), at = { x: 24, y: 24, angle };
      T.heldItem(g, dir, at, { kind, length: size.length, metal: '#c2c9d6' });
      const px = lit(g);
      assert.ok(px.length >= 8, `${kind} ${dir}: nothing drawn`);
      const tip = [24 + Math.sin(angle) * size.length, 24 + Math.cos(angle) * size.length];
      const far = Math.min(...px.map((p) => Math.hypot(p[0] + 0.5 - tip[0], p[1] + 0.5 - tip[1])));
      assert.ok(far < 3.5, `${kind} ${dir} at ${angle}: nothing near the tip (${far.toFixed(1)})`);
      const near = Math.min(...px.map((p) => Math.hypot(p[0] + 0.5 - 24, p[1] + 0.5 - 24)));
      assert.ok(near < 2.5, `${kind} ${dir} at ${angle}: it does not start at the hand`);
      const out = Math.max(...px.map((p) => Math.hypot(p[0] + 0.5 - 24, p[1] + 0.5 - 24)));
      assert.ok(out <= size.length + size.pad + 2.5, `${kind} ${dir}: it is longer than its length (${out.toFixed(1)})`);
    }
  }
  assert.equal(T.itemSize('none', 1), null);
  const g = new Surface(W, H);
  T.heldItem(g, 'down', { x: 24, y: 24, angle: 1 }, { kind: 'banana', length: 9 });
  assert.equal(lit(g).length, 0, 'an unknown kind draws nothing');
});

test('topdown rig: reach shortens a held item that points at the camera, never below half', () => {
  const g1 = new Surface(W, H), g2 = new Surface(W, H);
  T.heldItem(g1, 'down', { x: 24, y: 20, angle: 0 }, { kind: 'spear', length: 14, metal: '#c2c9d6' });
  T.heldItem(g2, 'down', { x: 24, y: 20, angle: 0, reach: 0.6 }, { kind: 'spear', length: 14, metal: '#c2c9d6' });
  assert.ok(g2.bounds().y1 < g1.bounds().y1 - 3);
});

test('topdown rig: fit keeps the longest weapon and the tallest headgear inside the frame, and leaves a pose that fits alone', () => {
  const big = T.dims({ height: 1, build: 1, head: 1 });
  for (const kind of T.ITEM_KINDS) {
    const item = T.itemSize(kind, 1.35);
    for (const dir of T.DIRECTIONS) for (const a of ['idle', 'walk', 'attack', 'hurt', 'die', 'block', 'shoot', 'cast', 'dodge']) for (const t of phases(a)) {
      const P = T.fit(dir, T.pose(a, dir, t, { armed: true }, big), big, { item, points: (J) => [[J.head[0], J.head[1] - big.headH / 2 - 7]] });
      const g = new Surface(W, H);
      T.draw(g, dir, P, big, LOOK, {
        head: (gg, J) => gg.rect(Math.floor(J.head[0]) - 1, Math.round(J.head[1] - big.headH / 2 - 7), 3, 7, '#c9423a'),
        item: (gg, J) => T.heldItem(gg, dir, T.sockets(J, P, big).hand, { kind, length: item.length, metal: '#c2c9d6' }),
      });
      g.outline(INK);
      const b = g.bounds();
      assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${kind} ${a} ${dir} at ${t.toFixed(2)} leaves the frame (${b.x0},${b.y0}..${b.x1},${b.y1})`);
    }
  }
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const P = T.pose('idle', dir, 0.3, {}, d);
    assert.deepEqual(T.fit(dir, { ...P, footF: { ...P.footF }, footB: { ...P.footB }, armF: { ...P.armF }, armB: { ...P.armB } }, d, { item: T.itemSize('sword', 1) }), P, `${dir}: a pose that fits was changed`);
  }
});

test('topdown rig: slashTrail draws a white arc on the swing frames only, never on the frame edge', () => {
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const poseAt = (u) => T.pose('attack', dir, u, { armed: true }, d);
    const trail = (t) => { const g = new Surface(W, H); T.slashTrail(g, dir, poseAt, t, d, 11, '#ffffff'); return g; };
    assert.ok(lit(trail(4 / 7)).length >= 8, `${dir}: no arc on the hit frame`);
    assert.equal(lit(trail(0)).length, 0, `${dir}: an arc at rest`);
    assert.equal(lit(trail(1)).length, 0, `${dir}: an arc at the end`);
    assert.equal(lit(trail(1 / 7)).length, 0, `${dir}: an arc in the wind-up`);
    const b = trail(4 / 7).bounds();
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${dir}: the arc touches the frame edge`);
  }
});

test('topdown rig: carry sets how a held thing rests (tip up, upright, tip down), and every carry stays inside the frame', () => {
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const tipY = (carry) => { const P = T.pose('idle', dir, 0, { carry }, d); return Math.cos(P.item); };
    assert.ok(tipY('up') < -0.3 && tipY('upright') < -0.65 && tipY('upright') < tipY('up') && tipY('low') > 0.3, `${dir}: carry`);
    assert.deepEqual(T.pose('idle', dir, 0, {}, d), T.pose('idle', dir, 0, { carry: 'up' }, d), `${dir}: tip up is the default`);
    for (const carry of ['up', 'upright', 'low']) for (const a of ['idle', 'walk', 'talk', 'hurt', 'die', 'dodge']) for (const t of phases(a)) {
      const item = T.itemSize('staff', 1.2), P = T.fit(dir, T.pose(a, dir, t, { carry, armed: true }, d), d, { item });
      const g = new Surface(W, H);
      T.draw(g, dir, P, d, LOOK, { item: (gg, J) => T.heldItem(gg, dir, T.sockets(J, P, d).hand, { kind: 'staff', length: item.length }) });
      g.outline(INK);
      const b = g.bounds();
      assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${carry} ${a} ${dir} at ${t.toFixed(2)} leaves the frame (${b.x0},${b.y0}..${b.x1},${b.y1})`);
    }
  }
});

// ---- fix round 2 (review of W3-H3) ---------------------------------------------------------------------

const tones = (hex) => { const r = T.ramp(hex); return [r.light, r.base, r.dark, r.deep].map((c) => col(c)); };
const drawnAlone = (fn) => { const g = new Surface(W, H); fn(g); return g; };

test('topdown rig: extra height goes into the legs at least as much as into the torso, and legs are never much shorter than the visible torso', () => {
  const lo = T.dims({ height: 0 }), mid = T.dims({}), hi = T.dims({ height: 1 });
  assert.ok(hi.leg - lo.leg >= hi.torso - lo.torso, `legs ${lo.leg}..${hi.leg}, torso ${lo.torso}..${hi.torso}`);
  for (const d of [lo, mid, hi, T.dims({ height: 0 }, { tall: [22, 27] })]) assert.ok(d.leg >= (d.torso - d.chin) - 1, `tall ${d.tall}: leg ${d.leg}, visible torso ${d.torso - d.chin}`);
  assert.ok(mid.leg >= 9, `the standard leg is ${mid.leg} px`);
});

test('topdown rig: walking down and up, the feet travel at least 3 rows and each hand at least 2 px, opposite the legs', () => {
  for (const dir of ['down', 'up']) {
    const soles = { F: [], B: [] }, hands = { F: [], B: [] };
    for (let f = 0; f < 8; f++) {
      const { J } = body('walk', dir, f / 8, {}, { outline: false, m: { armed: true } });
      soles.F.push(J.legF.soleY); soles.B.push(J.legB.soleY); hands.F.push(Math.round(J.armF.hand[1])); hands.B.push(Math.round(J.armB.hand[1]));
    }
    const span = (a) => Math.max(...a) - Math.min(...a);
    assert.ok(span(soles.F) >= 3 && span(soles.B) >= 3, `${dir}: feet travel ${span(soles.F)} and ${span(soles.B)} rows`);
    assert.ok(span(hands.F) >= 2 && span(hands.B) >= 2, `${dir}: hands travel ${span(hands.F)} and ${span(hands.B)} px`);
    // contact (0), pass (2): on the contact one foot is on the ground and the other at least 3 rows up the screen; on the pass the swinging foot is lifted
    assert.ok(Math.abs(soles.F[0] - soles.B[0]) >= 3, `${dir}: contact`);
    assert.ok(Math.abs(soles.F[2] - soles.B[2]) >= 2, `${dir}: pass`);
    // arms oppose legs: when the weapon-side foot is forward its hand is back
    const fwd = dir === 'down' ? 1 : -1;      // forward is down the screen facing down
    assert.ok((hands.F[0] - hands.F[4]) * fwd < 0 && (hands.B[0] - hands.B[4]) * fwd > 0, `${dir}: arms do not oppose the legs`);
    assert.ok(Math.abs(hands.F[0] - hands.B[0]) >= 2, `${dir}: the two hands are level on the contact`);
  }
});

test('topdown rig: attack_down ends its follow-through beside the body and recovers the short way round, never across the legs', () => {
  const d = T.dims({});
  for (const f of [4, 5, 6]) {
    const P = T.pose('attack', 'down', f / 7, { armed: true }, d), J = T.solve('down', P, d), tip = T.itemTip(J, P, 11);
    assert.ok(tip[0] < J.bx - d.chestR + 1, `frame ${f}: the blade tip (${tip[0].toFixed(1)}) crosses in front of the body`);
  }
  const a = Array.from({ length: 8 }, (_, f) => T.pose('attack', 'down', f / 7, { armed: true }, d).item);
  assert.ok(Math.max(...a) < Math.PI * 2, 'the blade never passes straight down and on to the other side');
  for (let f = 5; f < 7; f++) assert.ok(a[f + 1] <= a[f] + 1e-9, 'the recovery goes back the way it came');
});

test('topdown rig: facing up, a held thing still shows in shoot and block: the hand comes out to the side', () => {
  const d = T.dims({});
  for (const [action, kind] of [['shoot', 'gun'], ['block', 'sword'], ['shoot', 'spear']]) for (const t of phases(action).slice(0, 5)) {
    const item = T.itemSize(kind, 1), P = T.fit('up', T.pose(action, 'up', t, { armed: true, carry: kind === 'gun' ? 'low' : 'up' }, d), d, { item });
    const MARK = { kind, length: item.length, metal: '#ff00ff', wood: '#ff00ff', hilt: '#ff00ff' };
    let alone = 0;
    const g = new Surface(W, H);
    T.draw(g, 'up', P, d, LOOK, { item: (gg, J) => { const at = T.sockets(J, P, d).hand; alone = lit(drawnAlone((x) => T.heldItem(x, 'up', at, MARK))).length; T.heldItem(gg, 'up', at, MARK); } });
    const seen = lit(g).filter(([x, y]) => { const v = g.get(x, y); return v === col('#ff00ff') || tones('#ff00ff').includes(v); }).length;
    assert.ok(seen >= alone * 0.5, `${action} up with a ${kind} at ${t.toFixed(2)}: ${seen} of ${alone} pixels show`);
  }
});

test('topdown rig: dodge travels: at least 4 px the way the body faces, in every direction, and comes back', () => {
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const feet = phases('dodge').map((t) => { const P = T.pose('dodge', dir, t, {}, d), J = T.solve(dir, P, d); return [J.bx, J.gy]; });
    const home = feet[0], far = Math.max(...feet.map(([x, y]) => (dir === 'side' ? x - home[0] : dir === 'down' ? y - home[1] : home[1] - y)));
    assert.ok(far >= 4, `${dir}: travels ${far} px`);
    assert.deepEqual(feet.at(-1), home, `${dir}: does not come back`);
  }
});

test('topdown rig: an upright staff never crosses the head, on the shortest body with the biggest head', () => {
  for (const dimsOf of [{ height: 0, head: 1 }, {}, { height: 1 }]) for (const dir of ['down', 'side']) for (const a of ['idle', 'walk', 'talk']) for (const t of phases(a)) {
    const d = T.dims(dimsOf), item = T.itemSize('staff', 1), P = T.fit(dir, T.pose(a, dir, t, { armed: true, carry: 'upright' }, d), d, { item });
    const J = T.solve(dir, P, d), inHead = T.headIn(J, d, 0);
    const px = lit(drawnAlone((x) => T.heldItem(x, dir, T.sockets(J, P, d).hand, { kind: 'staff', length: item.length })));
    const over = px.filter(([x, y]) => inHead(x + 0.5, y + 0.5)).length;
    assert.ok(over <= 2, `${dir} ${a} at ${t.toFixed(2)} (${JSON.stringify(dimsOf)}): ${over} staff pixels on the head`);
  }
});

test('topdown rig: side clips use no colours of their own: the far arm, leg and boot are the near ones in their dark tones', () => {
  const allowed = new Set([LOOK.skin, LOOK.top, LOOK.bottom, LOOK.boots, LOOK.hair].flatMap(tones).concat(col(INK)));
  for (const a of ['idle', 'walk', 'run', 'attack']) for (const t of phases(a)) {
    const g = body(a, 'side', t).g;
    for (const v of g.data) if (v) assert.ok(allowed.has(v), `${a} side at ${t}: a colour outside the look's ramps`);
  }
  let most = 0;
  for (const t of phases('walk')) most = Math.max(most, new Set(body('walk', 'side', t).g.data).size - 1);
  assert.ok(most <= 16, `walk side: ${most} colours on the bare body`);
});

test('topdown rig: in side clips F is the near side: the near arm and leg are in front and lit, the far ones behind and dark', () => {
  const d = T.dims({}), skin = T.ramp(LOOK.skin), boots = T.ramp(LOOK.boots);
  // walk, frame 0: the near foot is forward (right) and the near hand back (left)
  const { g, J } = body('walk', 'side', 0, {}, { outline: false });
  assert.ok(J.legF.x > J.legB.x && J.armF.hand[0] < J.armB.hand[0]);
  const at = (p, dy = 0) => g.get(Math.floor(p[0]), Math.floor(p[1]) + dy);
  assert.equal(at(J.armF.hand), col(skin.base), 'the near hand is lit');
  assert.equal(at(J.armB.hand), col(skin.dark), 'the far hand is dark');
  assert.equal(g.get(Math.floor(J.legF.x) + 2, J.legF.soleY - 2), col(boots.base), 'the near boot is lit');
  assert.equal(g.get(Math.floor(J.legB.x) + 2, J.legB.soleY - 2), col(boots.dark), 'the far boot is dark');
  assert.ok(J.legB.soleY <= J.legF.soleY, 'the far foot is not below the near foot');
  // standing: the near arm lies over the chest (its pixels are the hand's, not the tunic's), the far arm is hidden behind it
  const s = body('idle', 'side', 0, {}, { outline: false });
  assert.equal(s.g.get(Math.floor(s.J.armF.hand[0]), Math.floor(s.J.armF.hand[1])), col(skin.base));
  // half a cycle later they have swapped places but not depth
  const h = body('walk', 'side', 0.5, {}, { outline: false });
  assert.equal(h.g.get(Math.floor(h.J.armF.hand[0]), Math.floor(h.J.armF.hand[1])), col(skin.base), 'near hand, half a cycle on');
  assert.equal(h.g.get(Math.floor(h.J.legF.x) + 2, h.J.legF.soleY - 2), col(boots.base), 'near boot, half a cycle on');
});

test('topdown rig: seen from behind there is no face, even on a bald head', () => {
  for (const a of ['idle', 'talk', 'hurt', 'walk']) for (const t of phases(a)) {
    const g = body(a, 'up', t, {}, { outline: false, look: { ...LOOK, hairStyle: 'bald' } }).g;
    assert.equal(lit(g, INK).length, 0, `${a} up at ${t}: eyes on the back of the head`);
    assert.equal(lit(g, T.ramp(LOOK.skin).deep).length, 0, `${a} up at ${t}: a mouth on the back of the head`);
  }
  assert.ok(lit(body('talk', 'down', 0.25, {}, { outline: false, look: { ...LOOK, hairStyle: 'bald' } }).g, INK).length >= 2, 'and facing down there is one');
});

test('topdown rig: die falls over in steps: the body tips before it lies, with no jump of more than 12 px in its top', () => {
  const tops = phases('die').map((t) => { const b = body('die', 'down', t, {}, { outline: false }).g.bounds(); return [b.y0, b.x1 - b.x0 + 1]; });
  for (let f = 1; f < tops.length; f++) assert.ok(Math.abs(tops[f][0] - tops[f - 1][0]) <= 12, `frame ${f}: the top of the body jumps ${Math.abs(tops[f][0] - tops[f - 1][0])} rows`);
  assert.ok(tops[3][1] >= tops[1][1] + 2, `frame 3 is tipping over: ${tops[3][1]} px wide against ${tops[1][1]} staggering`);
  assert.ok(tops[3][1] < tops[5][1], 'and not yet as long as the lying body');
  const d = T.dims({}), P = T.pose('die', 'down', 3 / 7, {}, d);
  assert.ok(P.tilt > 0.3 && !P.lie);
  const s = T.sockets(T.solve('down', P, d), P, d);
  assert.ok(s.head.x > s.feet.x + 4, 'the head socket leans with the body');
});

test('topdown rig: cast raises the held thing above the head, facing down and up', () => {
  const d = T.dims({});
  for (const dir of ['down', 'up']) {
    const tipAt = (t) => { const P = T.pose('cast', dir, t, { armed: true }, d), J = T.solve(dir, P, d); return { tip: T.itemTip(J, P, 11), J }; };
    assert.ok(tipAt(4 / 7).tip[1] < tipAt(4 / 7).J.headTop, `${dir}: the tip stays below the top of the head`);
    assert.ok(tipAt(0).tip[1] - tipAt(4 / 7).tip[1] >= 5, `${dir}: the tip rises ${tipAt(0).tip[1] - tipAt(4 / 7).tip[1]} px`);
  }
});

// ---- parts and held kinds that live in the rig (Contract 11) --------------------------------------------

test('topdown rig: frame() poses and fits once; the picture and the sockets come from that one pose', () => {
  const p = { height: 1, build: 1, bounce: 1, stride: 1 }, item = T.itemSize('spear', 1.35);
  let moved = 0;
  for (const clip of ['idle_down', 'walk_side', 'attack_down', 'attack_side', 'attack_up', 'hurt', 'die']) {
    const n = T.STANDARD[T.parseClip(clip).action].frames, loop = T.STANDARD[T.parseClip(clip).action].loop;
    for (let f = 0; f < n; f++) {
      const t = loop ? f / n : f / (n - 1), F = T.frame(clip, t, p, { item, rise: 6 });
      assert.deepEqual([F.action, F.direction], [T.parseClip(clip).action, T.parseClip(clip).direction]);
      const want = T.sockets(T.solve(F.direction, F.P, F.d), F.P, F.d, { muzzle: item.length });
      assert.deepEqual(F.sockets(), want, `${clip} ${f}`);
      const raw = T.pose(F.action, F.direction, t, { bounce: 1, stride: 1, armed: true }, F.d);
      const unfitted = T.sockets(T.solve(F.direction, raw, F.d), raw, F.d, { muzzle: item.length });
      if (Math.abs(unfitted.hand.x - want.hand.x) + Math.abs(unfitted.muzzle.y - want.muzzle.y) > 0.5) moved++;
      // the weapon drawn from inside the hook lies on the exported hand-to-muzzle line (down and side: it is in front)
      const g = new Surface(W, H);
      F.draw(g, LOOK, { item: (gg, J) => T.heldItem(gg, F.direction, F.hand(J), { kind: 'spear', length: item.length, metal: '#ff00ff', wood: '#ff00ff' }) });
      const b = (F.finish(g), g.bounds());
      assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${clip} ${f} leaves the frame`);
      if (F.direction !== 'up' && !F.P.lie && !F.P.tilt && !F.P.flash) {
        const s = F.sockets(), mx = s.hand.x + (s.muzzle.x - s.hand.x) * 0.7, my = s.hand.y + (s.muzzle.y - s.hand.y) * 0.7;
        let hit = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g.get(Math.floor(mx) + dx, Math.floor(my) + dy) === col('#ff00ff')) hit = true;
        assert.ok(hit, `${clip} ${f}: the exported sockets are not where the weapon is drawn`);
      }
    }
  }
  assert.ok(moved >= 3, 'the test looks include frames that fit() changes');
  // with nothing held the attack is a punch, and attack clips of an armed frame get the swing arc from finish()
  assert.ok(T.frame('attack_side', 4 / 7, {}, {}).P.armF.f > 3 && !T.frame('attack_side', 4 / 7, {}, {}).P.slash);
  const arc = (opt) => { const F = T.frame('attack_side', 4 / 7, {}, opt), g = new Surface(W, H); F.draw(g, LOOK); F.finish(g, { trail: '#ffffff' }); return lit(g, '#ffffff').length; };
  assert.ok(arc({ item: T.itemSize('sword', 1) }) - arc({}) >= 8);
});

test('topdown rig: every worn part draws in all three directions, in its own colour, on the body and inside the frame', () => {
  const C = '#c9423a', M = '#c2c9d6', seen = new Set([...tones(C), ...tones(M), col('#f2c230')]);
  const PARTS = {
    cape: (g, J, P, d) => T.cape(g, J, P, d, { kind: 'plain', length: 1, colour: C }),
    'cape tattered': (g, J, P, d) => T.cape(g, J, P, d, { kind: 'tattered', length: 1.4, colour: C }),
    mantle: (g, J, P, d) => T.mantle(g, J, P, d, { colour: C }),
    belt: (g, J, P, d) => T.belt(g, J, P, d, { colour: C }),
    hem: (g, J, P, d) => T.hem(g, J, P, d, { colour: C }),
    robe: (g, J, P, d) => T.robe(g, J, P, d, { colour: C, length: 1 }),
    helmet: (g, J, P, d) => T.helmet(g, J, P, d, { size: 1, metal: M, plume: C }),
    crown: (g, J, P, d) => T.crown(g, J, P, d, { size: 1, metal: M, gem: C }),
    hood: (g, J, P, d) => T.hood(g, J, P, d, { colour: C, depth: 1 }),
    'hat pointed': (g, J, P, d) => T.hat(g, J, P, d, { kind: 'pointed', size: 1, colour: C }),
    'hat wide': (g, J, P, d) => T.hat(g, J, P, d, { kind: 'wide', size: 1, colour: C }),
    'hat cap': (g, J, P, d) => T.hat(g, J, P, d, { kind: 'cap', size: 1, colour: C }),
  };
  const hookOf = (name) => (name.startsWith('cape') ? 'behind' : ['mantle', 'belt', 'hem', 'robe'].includes(name) ? 'torso' : 'head');
  for (const [name, fn] of Object.entries(PARTS)) {
    const pics = [];
    for (const dir of T.DIRECTIONS) for (const dimsOf of Object.values(BODIES)) {
      const withPart = body('idle', dir, 0, dimsOf, { hooks: { [hookOf(name)]: fn } }).g, bare = body('idle', dir, 0, dimsOf).g;
      const b = withPart.bounds();
      assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${name} ${dir} leaves the frame`);
      let n = 0;
      for (let i = 0; i < withPart.data.length; i++) if (withPart.data[i] !== bare.data[i] && seen.has(withPart.data[i])) n++;
      assert.ok(n >= (name === 'mantle' && dir === 'up' ? 0 : dir === 'side' && ['belt', 'hem', 'mantle'].includes(name) ? 2 : 5), `${name} ${dir}: only ${n} of its pixels show`);      // side: the near arm hangs over the waist
      if (dimsOf === BODIES.standard) pics.push(Array.from(withPart.data).join(','));
    }
    assert.equal(new Set(pics).size, 3, `${name}: the three directions look alike`);
    // it follows the body: through a walk it never leaves the frame or throws
    for (const dir of T.DIRECTIONS) for (const a of ['walk', 'hurt', 'die', 'dodge']) for (const t of phases(a)) body(a, dir, t, {}, { hooks: { [hookOf(name)]: fn } });
  }
  assert.ok(T.headgearRise('helmet', 1.8) > T.headgearRise('helmet', 0.5) && T.headgearRise('crown', 1) >= 1 && T.headgearRise('hat-pointed', 1) > T.headgearRise('hat-cap', 1) && T.headgearRise('none', 1) === 0);
  // size and length change them
  for (const dir of T.DIRECTIONS) {
    const pic = (hook, fn) => body('idle', dir, 0, {}, { hooks: { [hook]: fn } }).g;
    assert.ok(diff(pic('behind', (g, J, P, d) => T.cape(g, J, P, d, { length: 0.3, colour: C })), pic('behind', (g, J, P, d) => T.cape(g, J, P, d, { length: 1.8, colour: C }))) > 8, `${dir}: cape length`);
    assert.ok(diff(pic('head', (g, J, P, d) => T.helmet(g, J, P, d, { size: 0.5, metal: M, plume: C })), pic('head', (g, J, P, d) => T.helmet(g, J, P, d, { size: 1.8, metal: M, plume: C }))) > 8, `${dir}: helmet size`);
    assert.ok(diff(pic('head', (g, J, P, d) => T.crown(g, J, P, d, { size: 0.5, metal: M })), pic('head', (g, J, P, d) => T.crown(g, J, P, d, { size: 1.8, metal: M }))) > 8, `${dir}: crown size`);
    assert.ok(diff(pic('torso', (g, J, P, d) => T.robe(g, J, P, d, { colour: C, length: 0 })), pic('torso', (g, J, P, d) => T.robe(g, J, P, d, { colour: C, length: 1 }))) > 8, `${dir}: robe length`);
    assert.ok(diff(pic('head', (g, J, P, d) => T.crown(g, J, P, d, { size: 1, metal: M })), pic('head', (g, J, P, d) => T.crown(g, J, P, d, { size: 1, metal: '#f2c230' }))) > 8, `${dir}: the crown takes its metal colour`);
  }
});

test('topdown rig: a helmet is darker than skin, so the two stay apart in a one-colour look', () => {
  const lum = (v) => (0.299 * (v & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * ((v >> 16) & 255)) / 255;
  for (const dir of T.DIRECTIONS) {
    const { g, J, d } = body('idle', dir, 0, {}, { outline: false, look: { ...LOOK, hatted: true }, hooks: { head: (gg, JJ, P, dd) => T.helmet(gg, JJ, P, dd, { size: 1, metal: '#c2c9d6', plume: '#c9423a' }) } });
    const dome = g.get(Math.floor(J.head[0]) - 2, J.headTop + 2);
    assert.ok(lum(dome) < lum(col(LOOK.skin)) - 0.12, `${dir}: the dome (${lum(dome).toFixed(2)}) is as light as skin (${lum(col(LOOK.skin)).toFixed(2)})`);
    assert.ok(d.headH > 0);
  }
});

test('topdown rig: cuffs come with the look, on both arms, in every direction', () => {
  const C = '#c9423a';
  for (const dir of T.DIRECTIONS) for (const a of ['idle', 'walk']) {
    const g = body(a, dir, 0, {}, { outline: false, look: { ...LOOK, cuffs: C } }).g;
    assert.ok(lit(g, C).length + lit(g, T.ramp(C).dark).length >= (dir === 'side' && a === 'idle' ? 3 : 5), `${a} ${dir}: cuffs`);
  }
});

test('topdown rig: lantern, cane and gun are held kinds with sizes; a lantern hangs straight down and a gun points where the hand points', () => {
  assert.deepEqual(T.ITEM_KINDS, ['sword', 'axe', 'spear', 'staff', 'lantern', 'cane', 'gun']);
  for (const kind of ['lantern', 'cane', 'gun']) {
    const size = T.itemSize(kind, 1);
    assert.ok(size.length >= 6 && size.length <= 14, `${kind}: ${JSON.stringify(size)}`);
    for (const dir of T.DIRECTIONS) {
      const g = drawnAlone((x) => T.heldItem(x, dir, { x: 24, y: 20, angle: kind === 'gun' ? Math.PI / 2 : 0 }, { kind, length: size.length, metal: '#c2c9d6', glow: '#4fd8ee' }));
      const b = g.bounds();
      assert.ok(lit(g).length >= 8, `${kind} ${dir}: nothing drawn`);
      if (kind === 'gun') assert.ok(b.x1 - 24 >= size.length - 2 && b.x1 - b.x0 > (b.y1 - b.y0) * 1.5, `${kind}: a barrel to the right (${JSON.stringify(b)})`);
      else assert.ok(b.y1 - 20 >= size.length - 2 && b.y0 >= 20 - 3, `${kind}: it reaches down from the hand (${JSON.stringify(b)})`);
    }
  }
  // the hang carry keeps the thing pointing down whatever the arm does
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) for (const a of ['idle', 'walk', 'talk', 'hurt']) for (const t of phases(a)) assert.ok(Math.cos(T.pose(a, dir, t, { carry: 'hang' }, d).item) > 0.9, `${a} ${dir}: a hanging thing swings up`);
  // a lit lantern shows its glow colour
  const lamp = drawnAlone((x) => T.heldItem(x, 'down', { x: 24, y: 20, angle: 0 }, { kind: 'lantern', length: 8, metal: '#5a5f7a', glow: '#f4e06a' }));
  assert.ok(lit(lamp, '#f4e06a').length + lit(lamp, T.ramp('#f4e06a').light).length >= 4);
});

test('topdown rig: every export has a doc comment directly above it (or at the end of its line)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../rigs/topdown.js', import.meta.url), 'utf8').split('\n');
  const missing = [];
  src.forEach((line, i) => {
    const m = /^export (?:async )?(?:function|const|let|class) ([\w$]+)/.exec(line);
    if (!m) return;
    const above = (src[i - 1] ?? '').trim();
    if (!(above.endsWith('*/') || above.startsWith('//') || /\/\/ \S/.test(line))) missing.push(m[1]);
  });
  assert.deepEqual(missing, []);
  for (const name of Object.keys(T)) assert.ok(src.some((l) => new RegExp(`^export .*\\b${name}\\b`).test(l)), `${name} is exported some other way`);
});

test('topdown rig: a lantern, a cane and a gun stay inside the frame in every action, direction and size (the lunge at the camera gives way)', () => {
  const CARRY = { lantern: 'hang', cane: 'low', gun: 'low' };
  for (const kind of Object.keys(CARRY)) for (const [name, dimsOf] of Object.entries(BODIES)) for (const [a, dir, t, f] of every()) {
    if (a === 'punch') continue;
    const clip = ['hurt', 'die'].includes(a) && dir !== 'down' ? null : ['hurt', 'die'].includes(a) ? a : `${a}_${dir}`;
    if (!clip) continue;
    const F = T.frame(clip, t, { ...dimsOf, bounce: 1, stride: 1 }, { item: T.itemSize(kind, 1.3), carry: CARRY[kind] });
    const g = new Surface(W, H);
    F.draw(g, LOOK, { item: (gg, J) => T.heldItem(gg, F.direction, F.hand(J), { kind, length: F.item.length, metal: '#5a5f7a', glow: '#f4e06a' }) });
    const b = F.finish(g).bounds();
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${kind} ${name} ${clip} frame ${f} leaves the frame (${b.x0},${b.y0}..${b.x1},${b.y1})`);
  }
});
