// The side-view body rig's extra poses (style guide, section 4 and section 14 "humanoid-poses"):
// die, block, victory, talk, shoot, and the thrusting attack, with their standard clip entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, range, choice, defaultParams, cleanParams, renderFrame, frameSockets, clipFps } from '../../engine/sprite.js';
import { col, ramp } from '../../engine/color.js';
import { Surface } from '../../engine/surface.js';
import * as H from '../../rigs/humanoid.js';

const PI = Math.PI;
const NEW_CLIPS = ['die', 'block', 'victory', 'talk', 'shoot', 'bowshot', 'thrust'];
const LOOK = { skin: '#f6d3b0', top: '#3f6fd1', bottom: '#2b3a67', boots: '#7a4f33', hair: '#5a3a22' };
const MARK = '#ff00ff';
const coloured = (g, hexes) => { const want = new Set(hexes.map((h) => col(h))); const out = []; for (let i = 0; i < g.data.length; i++) if (want.has(g.data[i])) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
const rampOf = (hex) => { const r = ramp(hex); return [r.light, r.base, r.dark, r.deep]; };
const mean = (pts, k) => pts.reduce((a, q) => a + q[k], 0) / pts.length;

/** A plain body on the rig: every clip is the rig's pose of that name, with the standard item sizes and fit(). */
const doll = defineSprite({
  id: 'pose-doll', name: 'Pose doll', size: H.SIZE, pivot: H.PIVOT,
  params: {
    height: range('Height', 0.5), build: range('Build', 0.5), head: range('Head', 0.5),
    weapon: choice('Weapon', 'spear', ['spear', 'sword', 'axe', 'none']),
    hairStyle: choice('Hair', 'short', H.HAIR_STYLES),
    // cone: a tall marker on top of the head; tail: a marker sticking out behind it (what a hat and a hood's point do)
    headgear: choice('Headgear', 'none', ['none', 'cone', 'tail']),
    bounce: range('Bounce', 0.5), stride: range('Stride', 0.5), speed: range('Speed', 0.5),
  },
  clips: {
    ...H.clipsFor(['idle', 'walk', 'attack', 'shoot', 'block', 'hurt', 'die', 'victory', 'talk'], (p) => p.speed),
    thrust: H.clipsFor(['attack'], (p) => p.speed).attack,
    bowshot: H.clipsFor(['shoot'], (p) => p.speed).shoot,          // the shoot pose with shot: 'bow'
  },
  sockets(clip, t, p) {
    const d = H.dims(p), P = dollPose(clip, t, p, d), J = H.solve(P, d);
    if (clip === 'bowshot') return H.sockets(J, P, d, { muzzle: 2, muzzleAt: 'offhand' });
    return H.sockets(J, P, d, { muzzle: H.itemSize(p.weapon, 1)?.length ?? 0 });
  },
  render(g, { clip, t, p }) {
    const d = H.dims(p), item = clip === 'bowshot' ? null : H.itemSize(p.weapon, 1);
    const P = dollPose(clip, t, p, d);
    H.draw(g, P, d, { ...LOOK, hairStyle: p.hairStyle }, {
      head: (g, J) => {
        const [hx, hy] = J.head;
        if (p.headgear === 'cone') g.rect(hx - 1, hy - d.headR - 6, 2, 6, MARK);
        if (p.headgear === 'tail') g.rect(hx - d.headR - 4, hy - 1, 4, 2, MARK);
      },
      item: (g, J) => {
        if (item) H.heldItem(g, H.sockets(J, P, d).hand, { kind: p.weapon, length: item.length });
        // the bow is in the far hand, drawn in front of the body and under the near (string) hand
        if (clip === 'bowshot') H.heldItem(g, H.bowGrip(J, P), { kind: 'bow', length: H.ITEMS.bow.length, nock: P.pull ? H.sockets(J, P, d).hand : null, arrow: P.pull > 0 });
      },
    });
    if (P.flash) g.tint('#ffffff');
    g.outline(H.INK);
  },
});
function dollPose(clip, t, p, d) {
  const item = clip === 'bowshot' ? null : H.itemSize(p.weapon, 1);
  const m = { bounce: p.bounce, stride: p.stride, armed: !!item, shot: clip === 'bowshot' ? 'bow' : undefined };
  const P = H.pose(clip === 'bowshot' ? 'shoot' : clip, t, m, d);
  // a tall thing on the head needs room: its far end, turned with the head, is a point fit() keeps inside the frame
  const reach = p.headgear === 'cone' ? d.headR + 7 : 0;
  return H.fit(P, d, { item, points: reach ? (J, P) => [[J.head[0] - Math.sin(P.headTurn) * reach, J.head[1] - Math.cos(P.headTurn) * reach]] : null });
}

const look = (over = {}) => cleanParams(doll, { ...defaultParams(doll), ...over });
const frames = (clip) => Array.from({ length: doll.clips[clip].frames }, (_, f) => f);
const same = (a, b) => { for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false; return true; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const opaque = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const SMALL = { height: 0, build: 0, head: 0 }, BIG = { height: 1, build: 1, head: 1 };
const BODIES = [
  ['smallest', SMALL], ['largest', BIG], ['default', {}],
  ['smallest, lively', { ...SMALL, bounce: 1, stride: 1 }], ['largest, lively', { ...BIG, bounce: 1, stride: 1 }],
  ['largest, calm', { ...BIG, bounce: 0, stride: 0 }], ['big head on a small body', { height: 0, build: 0, head: 1 }],
];
/** The rig's own pose and joints for the doll at a frame. */
const poseAt = (clip, f, p = look()) => {
  const c = doll.clips[clip], t = c.loop ? f / c.frames : f / (c.frames - 1);
  const d = H.dims(p), bowshot = clip === 'bowshot';
  const P = H.pose(bowshot ? 'shoot' : clip, t, { bounce: p.bounce, stride: p.stride, armed: !bowshot && p.weapon !== 'none', shot: bowshot ? 'bow' : undefined }, d);
  return { P, d, J: H.solve(P, d) };
};

// ---- standard clip entries --------------------------------------------------------------------

test('clipsFor gives the section 4 entry for each named clip, in the order asked for', () => {
  const want = {
    idle: [8, 7, true], walk: [8, 10, true], run: [8, 14, true], jump: [8, 11, false], attack: [8, 13, false],
    shoot: [6, 14, false], cast: [8, 10, false], block: [6, 10, false], hurt: [4, 9, false], die: [8, 10, false],
    victory: [8, 8, true], talk: [8, 7, true],
  };
  const names = Object.keys(want).reverse();
  const c = H.clipsFor(names, (p) => p.speed);
  assert.deepEqual(Object.keys(c), names);
  for (const [name, [n, fps, loop]] of Object.entries(want)) {
    assert.equal(c[name].frames, n, `${name} frames`);
    assert.equal(c[name].loop, loop, `${name} loop`);
    assert.ok(Math.abs(c[name].fps({ speed: 0.5 }) - fps * 1.05) < 1e-9, `${name} fps at the middle speed`);
    assert.ok(Math.abs(c[name].fps({ speed: 0 }) - fps * 0.65) < 1e-9 && Math.abs(c[name].fps({ speed: 1 }) - fps * 1.45) < 1e-9, `${name} fps follows the Speed slider`);
  }
  assert.ok(Math.abs(H.clipsFor(['die']).die.fps({}) - 10.5) < 1e-9, 'with no speed given, the middle speed');
  assert.throws(() => H.clipsFor(['idle', 'collapse']), /collapse/);
  // two calls never share an entry: defineSprite writes labels into them
  assert.notEqual(H.clipsFor(['die']).die, H.clipsFor(['die']).die);
});

test('the old clip table is what it was', () => {
  const c = H.clips((p) => p.speed, { cast: { frames: 8, fps: 11, loop: false } });
  assert.deepEqual(Object.keys(c), ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'cast']);
  assert.deepEqual(Object.values(c).map((x) => [x.frames, x.loop]), [[8, true], [8, true], [8, true], [8, false], [8, false], [4, false], [8, false]]);
  // whole frames per second, as the engine plays them (the table's number times 1.05 at the middle speed)
  assert.equal(clipFps(doll, 'die', look()), Math.round(10 * 1.05));
  assert.equal(clipFps(doll, 'shoot', look()), Math.round(14 * 1.05));
  assert.equal(clipFps(doll, 'victory', look({ speed: 0 })), Math.round(8 * 0.65));
});

test('the rig says which poses it has', () => {
  for (const name of ['idle', 'walk', 'run', 'jump', 'attack', 'punch', 'thrust', 'shoot', 'cast', 'block', 'hurt', 'die', 'victory', 'talk']) {
    assert.ok(H.POSES.includes(name), name);
  }
});

// ---- inside the frame -------------------------------------------------------------------------

test('every new pose stays inside the frame and on or above the ground line, for the smallest and the largest body', () => {
  for (const [what, body] of BODIES) for (const weapon of ['spear', 'axe', 'none']) for (const [hairStyle, headgear] of [['short', 'none'], ['ponytail', 'none'], ['long', 'cone'], ['spiky', 'tail'], ['bald', 'cone']]) {
    const p = look({ ...body, weapon, hairStyle, headgear });
    for (const clip of NEW_CLIPS) for (const f of frames(clip)) {
      const b = renderFrame(doll, clip, f, p).bounds();
      const where = `${what}, ${weapon}, ${hairStyle} hair, ${headgear}: ${clip} frame ${f}`;
      assert.ok(b, `${where} is empty`);
      assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < H.SIZE[0] - 1 && b.y1 < H.SIZE[1] - 1, `${where} touches the frame edge (box ${b.x0},${b.y0}..${b.x1},${b.y1})`);
      assert.ok(b.y1 <= H.GROUND, `${where} goes below the ground line (lowest row ${b.y1})`);
    }
  }
});

// ---- die --------------------------------------------------------------------------------------

test('die: frame 0 is the recoil tinted white', () => {
  const { P } = poseAt('die', 0);
  assert.equal(P.flash, true);
  for (const f of frames('die').slice(1)) assert.equal(poseAt('die', f).P.flash, false, `frame ${f}`);
  const g = renderFrame(doll, 'die', 0, look({ weapon: 'none' }));
  const white = col('#ffffff'), ink = col(H.INK);
  assert.ok(g.data.every((v) => v === 0 || v === white || v === ink), 'only white and outline in the flash frame');
  const idle = poseAt('idle', 0);
  assert.ok(P.lean < -0.1 && P.rootX < 0, 'the body is thrown back');
  assert.ok(poseAt('die', 0).J.head[0] < idle.J.head[0] - 1.5, 'the head is knocked back');
});

test('die: the body falls frame by frame and ends lying on the ground line', () => {
  for (const [what, body] of BODIES) for (const weapon of ['spear', 'none']) {
    const p = look({ ...body, weapon });
    const d = H.dims(p);
    const standing = renderFrame(doll, 'idle', 0, look({ ...body, weapon: 'none' })).bounds();
    const last = doll.clips.die.frames - 1;
    const g = renderFrame(doll, 'die', last, look({ ...body, weapon: 'none' }));
    const b = g.bounds();
    assert.ok(opaque(g) > 150, `${what}: the last frame is nearly empty (${opaque(g)} pixels)`);
    assert.equal(b.y1, H.GROUND, `${what}: the outline of the lying body should sit on the ground row`);
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, tall = standing.y1 - standing.y0 + 1;
    assert.ok(w > h * 1.8, `${what}: the body left on the ground is ${w} wide and ${h} tall: not lying`);
    assert.ok(h < tall * 0.56, `${what}: the body left on the ground is ${h} px tall, standing it is ${tall}`);      // a big head alone is half the height
    // the head and the hips are both down
    const s = frameSockets(doll, 'die', last, p);
    assert.ok(s.head.y > H.GROUND - 2.4 * d.headR - 3, `${what}: head at ${s.head.y.toFixed(1)}`);
    const { P, J } = poseAt('die', last, p);
    assert.equal(P.lie, 1);
    assert.ok(J.hip[1] > H.GROUND - d.hipR - 5, `${what}: hips at ${J.hip[1].toFixed(1)}`);
    assert.ok(Math.abs(J.neck[1] - J.hip[1]) < d.torso * 0.5, `${what}: the back is level`);
    // it gets there by falling: the head only goes down from frame 1, and most of the way by frame 4
    const headY = frames('die').map((f) => frameSockets(doll, 'die', f, p).head.y);
    for (let f = 2; f <= 4; f++) assert.ok(headY[f] > headY[f - 1] + 1, `${what}: head does not fall between frames ${f - 1} and ${f} (${headY.map((v) => v.toFixed(1)).join(' ')})`);
    assert.ok(headY[4] - headY[0] > (headY[last] - headY[0]) * 0.8, `${what}: the fall is over by frame 4`);
    // frames 5 and 6 settle: small changes, but not a held frame
    for (const f of [5, 6, 7]) {
      const n = diff(renderFrame(doll, 'die', f, p), renderFrame(doll, 'die', f - 1, p));
      assert.ok(n > 0, `${what}: die frame ${f} repeats frame ${f - 1}`);
    }
    assert.ok(diff(renderFrame(doll, 'die', 7, p), renderFrame(doll, 'die', 6, p)) < diff(renderFrame(doll, 'die', 3, p), renderFrame(doll, 'die', 2, p)), `${what}: the settle moves less than the fall`);
  }
});

test('die: the lying pose says so (lie goes from 0 to 1) and the eyes close', () => {
  const lies = frames('die').map((f) => poseAt('die', f).P.lie);
  assert.equal(lies[0], 0);
  for (let f = 1; f < lies.length; f++) assert.ok(lies[f] >= lies[f - 1], lies.join(' '));
  assert.equal(lies.at(-1), 1);
  assert.equal(poseAt('die', 7).P.blink, true);
  for (const clip of ['idle', 'walk', 'attack', 'block', 'victory', 'talk', 'shoot', 'thrust']) assert.equal(poseAt(clip, 2).P.lie, 0, clip);
});

// ---- block, victory, talk, shoot: out of idle and back -----------------------------------------

const CLOSE = 1e-9;
function assertSamePose(a, b, what) {
  for (const k of ['rootX', 'lift', 'crouch', 'lean', 'headTilt', 'item', 'sway', 'glow']) assert.ok(Math.abs(a[k] - b[k]) < CLOSE, `${what}: ${k} ${a[k]} vs ${b[k]}`);
  for (const k of ['footF', 'footB']) for (const c of ['x', 'y']) assert.ok(Math.abs(a[k][c] - b[k][c]) < CLOSE, `${what}: ${k}.${c}`);
  for (const k of ['armF', 'armB']) for (const c of ['a', 'e']) assert.ok(Math.abs(a[k][c] - b[k][c]) < CLOSE, `${what}: ${k}.${c}`);
  assert.equal(a.blink, b.blink, `${what}: blink`);
  assert.equal(a.flash, b.flash, `${what}: flash`);
}

test('block, victory and talk start from the idle pose and return to it; shoot starts half raised and ends on it', () => {
  for (const [what, body] of BODIES) for (const weapon of ['spear', 'none']) {
    const p = look({ ...body, weapon });
    const d = H.dims(p), m = { bounce: p.bounce, stride: p.stride, armed: weapon !== 'none' };
    const rest = H.pose('idle', 0, m, d);
    const idle0 = renderFrame(doll, 'idle', 0, p);
    for (const clip of ['block', 'victory', 'talk', 'shoot', 'bowshot']) {
      const name = clip === 'bowshot' ? 'shoot' : clip, mm = clip === 'bowshot' ? { ...m, armed: false, shot: 'bow' } : m;
      const starts = name !== 'shoot';        // the shoot row of the style guide: frame 0 is already the aim (or the drawn bow)
      const restHere = clip === 'bowshot' ? H.pose('idle', 0, mm, d) : rest;
      if (starts) assertSamePose(H.pose(name, 0, mm, d), restHere, `${what} ${clip} at 0`);
      assertSamePose(H.pose(name, 1, mm, d), restHere, `${what} ${clip} at 1`);
      if (starts) assert.ok(same(renderFrame(doll, clip, 0, p), idle0), `${what}, ${weapon}: ${clip} frame 0 is not the idle picture`);
      else assert.ok(diff(renderFrame(doll, clip, 0, p), idle0) > 20, `${what}, ${weapon}: ${clip} frame 0 is the idle picture; it should already be raising`);
      if (clip === 'bowshot') continue;       // the doll puts the bow away when it is not shooting, so its last frame is checked by pose only
      const c = doll.clips[clip];
      if (!c.loop) assert.ok(same(renderFrame(doll, clip, c.frames - 1, p), idle0), `${what}, ${weapon}: ${clip} does not end on the idle picture`);
      // and something happens in between
      const most = Math.max(...frames(clip).map((f) => diff(renderFrame(doll, clip, f, p), idle0)));
      assert.ok(most > 60, `${what}, ${weapon}: ${clip} changes at most ${most} pixels`);
    }
  }
});

test('the loops close: just before the end, victory and talk are almost back at the start', () => {
  const d = H.dims({});
  for (const clip of ['victory', 'talk']) {
    const a = H.pose(clip, 0, {}, d), b = H.pose(clip, 0.999, {}, d);
    for (const k of ['rootX', 'lift', 'crouch', 'lean', 'headTilt', 'item']) assert.ok(Math.abs(a[k] - b[k]) < 0.05, `${clip} ${k}: ${a[k]} vs ${b[k]}`);
    for (const k of ['armF', 'armB']) assert.ok(Math.abs(a[k].a - b[k].a) < 0.05 && Math.abs(a[k].e - b[k].e) < 0.05, `${clip} ${k}`);
    // no frame is a copy of the one before
    for (const f of frames(clip)) {
      const prev = (f + doll.clips[clip].frames - 1) % doll.clips[clip].frames;
      assert.ok(diff(renderFrame(doll, clip, f, look()), renderFrame(doll, clip, prev, look())) > 0, `${clip} frame ${f} repeats frame ${prev}`);
    }
  }
});

test('block: the guard is up by frame 1 and held, braced, through frame 4', () => {
  for (const weapon of ['sword', 'none']) {
    const p = look({ weapon });
    const rest = frameSockets(doll, 'idle', 0, p).hand;
    const hands = frames('block').map((f) => frameSockets(doll, 'block', f, p).hand);
    for (const f of [1, 2, 3, 4]) {
      assert.ok(hands[f].y < rest.y - 4, `${weapon}: frame ${f}: the hand is only ${(rest.y - hands[f].y).toFixed(1)} px above where it rests`);
      assert.ok(hands[f].x > rest.x + 2, `${weapon}: frame ${f}: the hand is not out in front`);
      assert.ok(Math.hypot(hands[f].x - hands[1].x, hands[f].y - hands[1].y) < 3, `${weapon}: frame ${f}: the guard drops`);
    }
    // braced: lower than standing, and the held thing is upright in front of the body, not pointing at the enemy
    for (const f of [2, 3, 4]) {
      const { P } = poseAt('block', f, p);
      assert.ok(P.crouch > 1, `frame ${f} crouch ${P.crouch}`);
      assert.ok(Math.abs(P.item - PI) < 0.2, `frame ${f}: the held item points ${P.item.toFixed(2)}, not straight up`);
    }
    // and that is what is drawn: the blade stands on end in front of the body, taller than it is wide, its tip above the hand
    if (weapon === 'sword') for (const f of [1, 2, 3, 4]) {
      const blade = coloured(renderFrame(doll, 'block', f, p), rampOf('#c2c9d6'));
      const xs = blade.map((q) => q[0]), ys = blade.map((q) => q[1]);
      const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
      assert.ok(h >= 10 && h >= w * 2.5, `frame ${f}: the blade is drawn ${w} wide and ${h} tall`);
      assert.ok(Math.max(...ys) <= hands[f].y + 1, `frame ${f}: the blade hangs below the hand`);
      assert.ok(Math.min(...xs) > poseAt('block', f, p).J.head[0], `frame ${f}: the blade is not out in front of the head`);
    }
    // the blow lands in the middle: the body gives a little and comes back
    const roots = frames('block').map((f) => poseAt('block', f, p).P.rootX);
    assert.ok(Math.min(...roots) < -0.9, `the body never gives way: ${roots.map((v) => v.toFixed(1)).join(' ')}`);
  }
});

test('victory: a cheer that reads in silhouette: the fists go up beside the head, the weapon above it, and the feet leave the ground', () => {
  for (const weapon of ['sword', 'none']) for (const bounce of [0, 0.5, 1]) {
    const p = look({ weapon, bounce }), d = H.dims(p);
    const s = frames('victory').map((f) => frameSockets(doll, 'victory', f, p));
    // the arm is shorter than the head is tall, so a raised fist comes level with the eyes; the held thing goes well above the head
    const top = s.reduce((a, b) => (b.hand.y - b.head.y < a.hand.y - a.head.y ? b : a));
    assert.ok(top.hand.y < top.head.y + d.headR * 2.1, `${weapon}, bounce ${bounce}: the hand never rises to the head (${(top.hand.y - top.head.y).toFixed(1)} px below its top)`);
    assert.ok(s[0].hand.y - top.hand.y > d.arm, `${weapon}, bounce ${bounce}: the hand rises less than an arm's length`);
    const tops = frames('victory').map((f) => renderFrame(doll, 'victory', f, p).bounds().y0);
    assert.ok(tops[0] - Math.min(...tops) >= (weapon === 'none' ? 3 : 6), `${weapon}, bounce ${bounce}: the picture grows upward by only ${tops[0] - Math.min(...tops)} px`);
    const air = Math.max(...s.map((x) => H.GROUND - x.feet.y));
    assert.ok(air >= 3, `${weapon}, bounce ${bounce}: the hop is ${air.toFixed(1)} px`);
    assert.equal(H.GROUND - s[0].feet.y, 0);
    // crouch before the hop, squash after it
    const crouch = frames('victory').map((f) => poseAt('victory', f, p).P.crouch);
    const lift = frames('victory').map((f) => poseAt('victory', f, p).P.lift);
    const up = lift.indexOf(Math.max(...lift));
    assert.ok(Math.max(...crouch.slice(0, up)) > 1.4, 'no crouch before the hop');
    assert.ok(Math.max(...crouch.slice(up)) > 1.4, 'no squash on landing');
    // the offhand cheers too
    assert.ok(Math.min(...s.map((x) => x.offhand.y)) < s[0].offhand.y - 6, 'the other arm stays down');
    // the other arm is thrown out behind, where it shows: clear of the head and the body
    const back = s.reduce((a, b) => (b.offhand.x < a.offhand.x ? b : a));
    assert.ok(back.offhand.x < back.head.x - d.headR - 1.5, `${weapon}, bounce ${bounce}: the other fist is hidden behind the head`);
  }
  // the held item points up at the top of the hop
  const lifts = frames('victory').map((f) => poseAt('victory', f).P.lift);
  const { P } = poseAt('victory', lifts.indexOf(Math.max(...lifts)));
  assert.ok(Math.cos(P.item) < -0.85, `the weapon points ${P.item.toFixed(2)} at the top of the hop`);
});

test('talk: the head nods, the free hand gestures, and the mouth opens on frames 2 and 6', () => {
  const p = look({ weapon: 'sword' });
  const mouths = frames('talk').map((f) => poseAt('talk', f, p).P.mouth);
  assert.deepEqual(mouths, [false, false, true, false, false, false, true, false]);
  const s = frames('talk').map((f) => frameSockets(doll, 'talk', f, p));
  const span = (get) => Math.max(...s.map(get)) - Math.min(...s.map(get));
  assert.ok(Math.hypot(span((x) => x.head.x), span((x) => x.head.y)) >= 1, 'the head does not move a pixel');
  assert.ok(Math.hypot(span((x) => x.offhand.x), span((x) => x.offhand.y)) > 4, 'the free hand does not gesture');
  assert.ok(Math.hypot(span((x) => x.hand.x), span((x) => x.hand.y)) < 3, 'the hand holding the weapon stays put');
  assert.ok(span((x) => x.feet.x) === 0 && span((x) => x.feet.y) === 0, 'the feet stay where they are');
  // the mouth is drawn: with the body held still, the open-mouth pose differs from the closed one by a few dark pixels on the face
  const d = H.dims(p);
  const draw = (mouth) => { const g = renderFrame(doll, 'idle', 0, p); g.data.fill(0); const P = H.pose('idle', 0, {}, d); P.mouth = mouth; H.draw(g, P, d, LOOK); return g; };
  const open = draw(true), shut = draw(false);
  const n = diff(open, shut);
  assert.ok(n >= 1 && n <= 4, `the mouth changes ${n} pixels`);
  const head = H.solve(H.pose('idle', 0, {}, d), d).head;
  for (let i = 0; i < open.data.length; i++) if (open.data[i] !== shut.data[i]) {
    const x = i % H.SIZE[0], y = Math.floor(i / H.SIZE[0]);
    assert.ok(shut.data[i] !== 0, 'the mouth is drawn on the face, never outside it');
    assert.ok(x > head[0] && y > head[1], `mouth pixel ${x},${y} is not on the lower front of the face`);
  }
  // unarmed, the near hand talks as well
  const bare = frames('talk').map((f) => frameSockets(doll, 'talk', f, look({ weapon: 'none' })).hand);
  assert.ok(Math.max(...bare.map((h) => h.x)) - Math.min(...bare.map((h) => h.x)) > 2, 'with empty hands the near hand should gesture too');
});

test('shoot: frame 0 is the arm half raised, it fires level on frame 1, recoils 2 px on frame 2, and gives the muzzle socket', () => {
  const p = look({ weapon: 'sword' });
  const fire = frames('shoot').map((f) => !!poseAt('shoot', f, p).P.fire);
  assert.deepEqual(fire, [false, true, false, false, false, false]);
  // half raised: between where the hand rests and where it aims
  const restY = poseAt('idle', 0, p).J.armF.hand[1], y0 = poseAt('shoot', 0, p).J.armF.hand[1], y1 = poseAt('shoot', 1, p).J.armF.hand[1];
  assert.ok((restY - y0) > (restY - y1) * 0.25 && (restY - y0) < (restY - y1) * 0.8, `hand at ${y0.toFixed(1)}; rest ${restY.toFixed(1)}, aim ${y1.toFixed(1)}`);
  const i0 = poseAt('shoot', 0, p).P.item, iRest = poseAt('idle', 0, p).P.item;
  assert.ok(i0 < iRest - 0.2 && i0 > PI / 2 + 0.2, `the held item is at ${i0.toFixed(2)} on frame 0`);
  const at1 = poseAt('shoot', 1, p), at2 = poseAt('shoot', 2, p);
  assert.ok(Math.abs(at1.P.item - PI / 2) < 0.08, `the held item points ${at1.P.item.toFixed(2)} when it fires, not level`);
  assert.ok(Math.abs(at1.J.armF.hand[1] - at1.J.shoulder[1]) < 2.5, 'the arm is not held out level');
  assert.ok(at1.J.armF.hand[0] > at1.J.shoulder[0] + at1.d.arm * 0.85, 'the arm is not stretched out');
  assert.ok(Math.abs((at1.P.rootX - at2.P.rootX) - 2) < 0.01, `recoil is ${(at1.P.rootX - at2.P.rootX).toFixed(2)} px`);
  assert.ok(at2.P.item > at1.P.item + 0.1, 'the muzzle kicks up');
  // the muzzle: only when asked for, at the tip of the held thing
  const s = frameSockets(doll, 'shoot', 1, p);
  assert.deepEqual(Object.keys(s), ['hand', 'offhand', 'head', 'back', 'feet', 'muzzle']);
  const len = H.itemSize('sword', 1).length;
  assert.ok(Math.abs(s.muzzle.x - (s.hand.x + Math.sin(s.hand.angle) * len)) < 1e-9 && Math.abs(s.muzzle.y - (s.hand.y + Math.cos(s.hand.angle) * len)) < 1e-9);
  assert.equal(s.muzzle.angle, s.hand.angle);
  assert.ok(s.muzzle.x > s.hand.x + len * 0.95, 'the muzzle is out in front of the hand');
  assert.deepEqual(Object.keys(H.sockets(at1.J, at1.P, at1.d)), ['hand', 'offhand', 'head', 'back', 'feet'], 'without a muzzle length the sockets are the usual five');
  const bare = frameSockets(doll, 'shoot', 1, look({ weapon: 'none' }));
  assert.ok(Math.abs(bare.muzzle.x - bare.hand.x) < 1e-9, 'a muzzle length of 0 is the hand itself');
});

test('shoot with a bow: drawn on frame 0, loosed on frame 1, the bow arm out level and the string hand at the chin', () => {
  for (const [what, body] of BODIES) {
    const p = look({ ...body, weapon: 'none' });
    const at = frames('bowshot').map((f) => poseAt('bowshot', f, p));
    assert.deepEqual(at.map((x) => x.P.pull), [1, 0, 0, 0, 0, 0], `${what}: pull`);
    assert.deepEqual(at.map((x) => !!x.P.fire), [false, true, false, false, false, false], `${what}: fire`);
    for (const f of [0, 1]) {
      const { J, d } = at[f];
      // the far arm holds the bow straight out at shoulder height, pointing forward
      assert.ok(J.armB.hand[0] > J.shoulder[0] + d.arm * 0.9 && Math.abs(J.armB.hand[1] - J.shoulder[1]) < 1.5, `${what} frame ${f}: the bow arm is not out level`);
      assert.ok(Math.abs(J.armB.angle - PI / 2) < 0.1, `${what} frame ${f}: the bow points ${J.armB.angle.toFixed(2)}`);
    }
    // the string hand: drawn back to the chin (by the shoulder, well behind the bow hand), elbow out behind
    const { J, d } = at[0];
    assert.ok(Math.hypot(J.armF.hand[0] - J.shoulder[0], J.armF.hand[1] - J.shoulder[1]) < 3, `${what}: the string hand is ${Math.hypot(J.armF.hand[0] - J.shoulder[0], J.armF.hand[1] - J.shoulder[1]).toFixed(1)} px from the shoulder`);
    assert.ok(J.armF.elbow[0] < J.shoulder[0] - d.arm * 0.3, `${what}: the elbow is not drawn back`);
    assert.ok(J.armB.hand[0] - J.armF.hand[0] > d.arm * 0.85, `${what}: the draw is only ${(J.armB.hand[0] - J.armF.hand[0]).toFixed(1)} px`);
    // loosed: the string hand lets go and moves; then both arms come down to the idle pose
    assert.ok(Math.hypot(at[1].J.armF.hand[0] - J.armF.hand[0], at[1].J.armF.hand[1] - J.armF.hand[1]) >= 1, `${what}: the string hand does not move on the release`);
    assert.ok(at[4].J.armB.hand[1] > at[1].J.armB.hand[1] + 2, `${what}: the bow arm is not coming down by frame 4`);
    // the muzzle is at the bow hand
    const s = frameSockets(doll, 'bowshot', 1, p);
    assert.ok(Math.abs(s.muzzle.x - (s.offhand.x + Math.sin(s.offhand.angle) * 2)) < 1e-9 && Math.abs(s.muzzle.angle - s.offhand.angle) < 1e-9, `${what}: muzzle`);
  }
  // drawn: the string runs from the bow's tips to the string hand and an arrow lies across; loosed: a straight string, no arrow
  const p = look({ weapon: 'none' });
  const drawn = renderFrame(doll, 'bowshot', 0, p), loosed = renderFrame(doll, 'bowshot', 1, p);
  const steel = (g) => coloured(g, rampOf('#c2c9d6')).length, string = (g) => coloured(g, ['#f0ead8']);
  assert.ok(steel(drawn) >= 1 && steel(loosed) === 0, 'the arrow is there before the release and gone after');
  const sx = (g) => { const xs = string(g).map((q) => q[0]); return Math.max(...xs) - Math.min(...xs) + 1; };
  assert.ok(string(drawn).length >= 6 && string(loosed).length >= 6, 'no string');
  assert.ok(sx(drawn) >= sx(loosed) + 3, `the drawn string spans ${sx(drawn)} px sideways, the loosed one ${sx(loosed)}`);
});

test('bowGrip: a carried bow stands upright in the far hand, is aimed when shooting, and is laid on the ground when lying', () => {
  const L = H.ITEMS.bow.length;
  const shape = (at) => { const g = new Surface(64, 64); H.heldItem(g, at, { kind: 'bow', length: L }); const b = g.bounds(); return { w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, y1: b.y1 }; };
  for (const [what, body] of BODIES) {
    const p = look({ ...body, weapon: 'none' });
    for (const clip of ['idle', 'walk', 'block', 'hurt', 'victory', 'talk', 'bowshot']) for (const f of frames(clip)) {
      const { P, J } = poseAt(clip, f, p), at = H.bowGrip(J, P, L), where = `${what} ${clip} frame ${f}`;
      assert.ok(Math.abs(at.angle - PI / 2) < 0.3, `${where}: the bow points ${at.angle.toFixed(2)}; it should stand upright`);
      assert.ok(Math.abs(at.x - J.armB.hand[0]) < 1e-9 && Math.abs(at.y - J.armB.hand[1]) < 2.01, `${where}: the bow is not in the far hand`);
      const b = shape(at);
      assert.ok(b.h >= L - 3 && b.h > b.w * 2, `${where}: drawn ${b.w} wide and ${b.h} tall`);
      assert.ok(b.y1 < H.GROUND, `${where}: the bow goes into the ground (row ${b.y1})`);
    }
    // shooting, it is exactly the aim
    for (const f of [0, 1]) assert.ok(Math.abs(H.bowGrip(poseAt('bowshot', f, p).J, poseAt('bowshot', f, p).P, L).angle - PI / 2) < 0.05, `${what}: aim on frame ${f}`);
    // dying: it goes over with the body, never into the ground, and ends flat on it
    for (const f of frames('die')) {
      const { P, J } = poseAt('die', f, p), b = shape(H.bowGrip(J, P, L));
      assert.ok(b.y1 < H.GROUND, `${what} die frame ${f}: the bow goes into the ground (row ${b.y1})`);
    }
    const end = poseAt('die', 7, p), flat = shape(H.bowGrip(end.J, end.P, L));
    assert.ok(flat.w >= L - 3 && flat.w > flat.h * 2.5, `${what}: at the end the bow is ${flat.w} wide and ${flat.h} tall: not lying flat`);
    assert.ok(flat.y1 >= H.GROUND - 2, `${what}: the lying bow floats (lowest row ${flat.y1})`);
  }
});

test('heldItem draws a bow and a gun from an attach point, like the other kinds', () => {
  for (const kind of ['bow', 'gun']) {
    assert.ok(H.ITEM_KINDS.includes(kind), kind);
    for (const k of ['length', 'back', 'pad']) assert.ok(H.ITEMS[kind][k] > 0, `${kind}.${k}`);
    assert.deepEqual(H.itemSize(kind, 1), H.ITEMS[kind]);
  }
  const drawn = (at, item) => { const g = new Surface(64, 64); H.heldItem(g, at, item); return g; };
  const lit = (g) => coloured(g, [...new Set([...g.data].filter(Boolean))].map((v) => '#' + [v & 255, (v >> 8) & 255, (v >> 16) & 255].map((x) => x.toString(16).padStart(2, '0')).join('')));
  // gun: a barrel along the angle from the hand to its length (the muzzle), and a grip below the hand
  const at = { x: 30, y: 30, angle: PI / 2 }, len = H.ITEMS.gun.length;
  const gun = lit(drawn(at, { kind: 'gun', length: len }));
  assert.ok(gun.length >= len * 2, 'gun: nothing drawn');
  const gx = gun.map((q) => q[0]), gy = gun.map((q) => q[1]);
  assert.ok(Math.max(...gx) >= at.x + len - 1.5 && Math.max(...gx) <= at.x + len + 1, `gun: the barrel ends at ${Math.max(...gx)}, the muzzle is at ${at.x + len}`);
  assert.ok(Math.max(...gy) >= at.y + 2, 'gun: no grip below the barrel');
  assert.ok(Math.min(...gy) >= at.y - 2.5, 'gun: taller than a barrel');
  const up = lit(drawn({ ...at, angle: PI }, { kind: 'gun', length: len }));
  assert.ok(Math.min(...up.map((q) => q[1])) <= at.y - len + 1.5, 'gun: does not turn with the angle');
  assert.ok(lit(drawn(at, { kind: 'gun', length: len + 5 })).length > gun.length, 'gun: a longer one is not bigger');
  // bow: stands across the aim, tips above and below the hand; the string behind the grip; moves with the attach point
  const L = H.ITEMS.bow.length;
  const bowG = drawn(at, { kind: 'bow', length: L });
  const bow = lit(bowG), by = bow.map((q) => q[1]), bx = bow.map((q) => q[0]);
  assert.ok(Math.max(...by) - Math.min(...by) + 1 >= L - 2 && Math.max(...by) - Math.min(...by) + 1 <= L + 2, `bow: ${Math.max(...by) - Math.min(...by) + 1} px from tip to tip, asked for ${L}`);
  assert.ok(Math.abs((Math.max(...by) + Math.min(...by)) / 2 + 0.5 - at.y) <= 1.5, 'bow: not centred on the hand');
  assert.ok(Math.max(...bx) - Math.min(...bx) + 1 <= L * 0.5, 'bow: as wide as it is tall');
  const strung = coloured(bowG, ['#f0ead8']);
  assert.ok(strung.length >= L - 5 && strung.every(([x]) => x < at.x), `bow: the string (${strung.length} px) should run behind the grip`);
  assert.equal(coloured(bowG, rampOf('#c2c9d6')).length, 0, 'bow: an arrow nobody asked for');
  const nock = { x: at.x - 9, y: at.y };
  const full = drawn(at, { kind: 'bow', length: L, nock, arrow: true });
  assert.ok(coloured(full, ['#f0ead8']).some(([x, y]) => Math.abs(x + 0.5 - nock.x) <= 1.5 && Math.abs(y + 0.5 - nock.y) <= 1.5), 'bow: the drawn string does not reach the string hand');
  const head = coloured(full, rampOf('#c2c9d6'));
  assert.ok(head.length >= 1 && head.every(([x]) => x >= at.x), 'bow: the arrow head should be in front of the grip');
  const moved = lit(drawn({ x: at.x + 6, y: at.y - 4, angle: at.angle }, { kind: 'bow', length: L }));
  assert.deepEqual(moved, bow.map(([x, y]) => [x + 6, y - 4]), 'bow: did not move with the attach point');
});

test('muzzleFlash draws a small light at a socket and never touches the frame edge', () => {
  const g = renderFrame(doll, 'idle', 0, look());
  g.data.fill(0);
  H.muzzleFlash(g, { x: 40, y: 30, angle: PI / 2 }, 4, '#ffffff');
  const b = g.bounds();
  assert.ok(b && opaque(g) >= 5);
  assert.ok(b.x0 >= 36 && b.x1 <= 46 && b.y0 >= 26 && b.y1 <= 34, `box ${b.x0},${b.y0}..${b.x1},${b.y1}`);
  assert.ok(b.x1 - 40 >= 40 - b.x0, 'it points the way the muzzle points');
  g.data.fill(0);
  H.muzzleFlash(g, { x: 62.5, y: 1, angle: PI / 2 }, 4);
  const e = g.bounds();
  assert.ok(!e || (e.x1 < H.SIZE[0] - 1 && e.y0 > 0), 'clipped to the inside of the frame');
});

/** Pixels of the near arm drawn over the face: sleeve-coloured pixels inside the head (the arm is drawn after it), and the fist if it is there. */
function armOverFace(clip, f, p) {
  const { P, d, J } = poseAt(clip, f, p);
  const g = renderFrame(doll, clip, f, p);
  const [hx, hy] = [Math.round(J.head[0] * 2) / 2, Math.round(J.head[1] * 2) / 2];
  const inFace = (x, y, pad) => ((x - hx) / (d.headR + pad)) ** 2 + ((y - hy) / (d.headR * 0.95 + pad)) ** 2 <= 1;
  let n = coloured(g, rampOf(LOOK.top)).filter(([x, y]) => inFace(x + 0.5, y + 0.5, -1)).length;
  if (inFace(J.armF.hand[0], J.armF.hand[1], 0.8)) n += 4;        // the fist is skin on skin: found by where it is
  return n;
}

test('victory: the near arm never crosses the face, with or without a weapon, at any build', () => {
  for (const [what, body] of BODIES) for (const weapon of ['sword', 'spear', 'none']) for (const f of frames('victory')) {
    const p = look({ ...body, weapon });
    assert.equal(armOverFace('victory', f, p), 0, `${what}, ${weapon}: victory frame ${f} has arm pixels over the face`);
  }
  // the measure does see an arm that crosses: the swing's wind-up does
  assert.ok(Math.max(...frames('attack').map((f) => armOverFace('attack', f, look({ weapon: 'sword' })))) > 3, 'the check never fires');
});

// ---- lying down: the head turns with the body --------------------------------------------------

test('die: the head turns to face up as the body goes down, and what the head hook draws turns with it', () => {
  for (const [what, body] of BODIES) {
    const p = look({ ...body, weapon: 'none', hairStyle: 'short', headgear: 'cone' }), d = H.dims(p);
    const turns = frames('die').map((f) => poseAt('die', f, p).P.headTurn);
    assert.equal(turns[0], 0, 'upright in the recoil');
    for (let f = 1; f < 8; f++) assert.ok(turns[f] >= turns[f - 1], turns.join(' '));
    assert.ok(Math.abs(turns[7] - PI / 2) < 1e-9 && Math.abs(turns[4] - PI / 2) < 1e-9, `a quarter turn once the back is down: ${turns.map((v) => v.toFixed(2)).join(' ')}`);
    for (const clip of ['idle', 'walk', 'attack', 'block', 'victory', 'talk', 'shoot', 'hurt']) assert.equal(poseAt(clip, 2, p).P.headTurn, 0, clip);
    // standing: the marker is above the head and the hair on top of it. Lying: both are behind the head (to the left), level with it
    const where = (clip, f) => {
      const g = renderFrame(doll, clip, f, p), { J } = poseAt(clip, f, p);
      const m = coloured(g, [MARK]), h = coloured(g, rampOf(LOOK.hair));
      return { mark: [mean(m, 0) + 0.5 - J.head[0], mean(m, 1) + 0.5 - J.head[1]], hair: [mean(h, 0) + 0.5 - J.head[0], mean(h, 1) + 0.5 - J.head[1]], n: m.length, J, g };
    };
    const up = where('idle', 0), down = where('die', 7);
    assert.ok(up.mark[1] < -d.headR && Math.abs(up.mark[0]) < 2, `${what}: standing, the marker is at ${up.mark.map((v) => v.toFixed(1))}`);
    assert.ok(down.mark[0] < -d.headR && Math.abs(down.mark[1]) < 2.5, `${what}: lying, the marker is at ${down.mark.map((v) => v.toFixed(1))} from the head, not behind it`);
    assert.equal(down.n, up.n, `${what}: the marker changed size when it was turned (${up.n} to ${down.n} pixels)`);
    assert.ok(up.hair[1] < -d.headR * 0.3, `${what}: standing, the hair is at ${up.hair.map((v) => v.toFixed(1))}`);
    assert.ok(down.hair[0] < -d.headR * 0.2 && down.hair[1] > -d.headR * 0.45, `${what}: lying, the hair is at ${down.hair.map((v) => v.toFixed(1))}: still on top`);
    // the face looks up: the closed eye is above the middle of the head
    const eye = coloured(down.g, [H.INK]).filter(([x, y]) => Math.hypot(x + 0.5 - down.J.head[0], y + 0.5 - down.J.head[1]) < d.headR - 1.5);
    assert.ok(eye.length >= 1 && eye.every(([, y]) => y + 0.5 < down.J.head[1]), `${what}: the eye is not on the upper side of the lying head`);
    // the head socket is the top of the head: now behind it
    const s = frameSockets(doll, 'die', 7, p);
    assert.ok(s.head.x < down.J.head[0] - d.headR * 0.8 && Math.abs(s.head.y - down.J.head[1]) < 1.5, `${what}: head socket ${s.head.x.toFixed(1)},${s.head.y.toFixed(1)}`);
    // something behind the head ends up under it: pressed into the ground it is cut off at the ground line, never drawn below it
    const tail = renderFrame(doll, 'die', 7, look({ ...body, weapon: 'none', headgear: 'tail' }));
    assert.ok(tail.bounds().y1 <= H.GROUND);
  }
});

test('the head only turns when the pose says so: a pose with headTurn 0 draws exactly as before', () => {
  const d = H.dims({});
  const drawWith = (turn) => { const g = new Surface(64, 64); const P = H.pose('idle', 0, {}, d); if (turn !== undefined) P.headTurn = turn; H.draw(g, P, d, LOOK); return g; };
  assert.ok(same(drawWith(undefined), drawWith(0)));
  assert.ok(diff(drawWith(0), drawWith(PI / 2)) > 20);
  // a quarter turn loses nothing: the head has as many pixels as before
  const headOnly = (turn) => { const P = H.pose('idle', 0, {}, d); P.headTurn = turn; const a = new Surface(64, 64); H.draw(a, P, d, LOOK); return coloured(a, [...rampOf(LOOK.skin), ...rampOf(LOOK.hair)]).length; };
  assert.ok(Math.abs(headOnly(PI / 2) - headOnly(0)) <= 6, `${headOnly(0)} head pixels upright, ${headOnly(PI / 2)} turned`);
});

// ---- the thrust -------------------------------------------------------------------------------

test('thrust: reaches further forward than the swing, level, on frame 4, after a wind-up away from the target', () => {
  for (const [what, body] of [['default', {}], ['smallest', SMALL], ['largest', BIG]]) {
    const p = look({ ...body, weapon: 'spear' });
    const len = H.itemSize('spear', 1).length;
    const tipX = (clip, f) => { const { P, J } = poseAt(clip, f, p); return J.armF.hand[0] + Math.sin(P.item) * len; };
    const thrust = frames('thrust').map((f) => tipX('thrust', f)), swing = frames('attack').map((f) => tipX('attack', f));
    assert.ok(Math.max(...thrust) > Math.max(...swing) + 2, `${what}: thrust reaches ${Math.max(...thrust).toFixed(1)}, swing ${Math.max(...swing).toFixed(1)}`);
    assert.equal(thrust.indexOf(Math.max(...thrust)), 4, `${what}: furthest reach on frame ${thrust.indexOf(Math.max(...thrust))}: ${thrust.map((v) => v.toFixed(1)).join(' ')}`);
    const hit = poseAt('thrust', 4, p);
    assert.ok(Math.abs(hit.P.item - PI / 2) < 0.15, `${what}: at the hit the spear points ${hit.P.item.toFixed(2)}, not level`);
    // wind-up: the hand is drawn back behind where it rests, and the body leans away
    const rest = poseAt('idle', 0, p).J.armF.hand[0];
    const hands = frames('thrust').map((f) => poseAt('thrust', f, p).J.armF.hand[0]);
    assert.ok(Math.min(hands[1], hands[2]) < rest - 2, `${what}: the hand is drawn back ${(rest - Math.min(hands[1], hands[2])).toFixed(1)} px`);
    assert.ok(poseAt('thrust', 2, p).P.rootX < -0.9 && poseAt('thrust', 2, p).P.lean < 0, `${what}: no lean away in the wind-up`);
    assert.ok(hands[4] - Math.min(hands[1], hands[2]) > hit.d.arm, `${what}: the hand travels less than an arm's length`);
    // the lunge: 5 to 8 px forward, and home again
    const roots = frames('thrust').map((f) => poseAt('thrust', f, p).P.rootX);
    assert.ok(Math.max(...roots) >= 5 && Math.max(...roots) <= 8, `${what}: the body lunges ${Math.max(...roots).toFixed(1)} px`);
    assert.equal(roots.indexOf(Math.max(...roots)), 4);
    // it starts from rest and ends on it, like the swing
    const d = H.dims(p);
    assertSamePose(H.pose('thrust', 0, { armed: true }, d), H.pose('attack', 0, { armed: true }, d), `${what} thrust at 0`);
    assertSamePose(H.pose('thrust', 1, { armed: true }, d), H.pose('attack', 1, { armed: true }, d), `${what} thrust at 1`);
    // the picture really is longer: the drawn frame reaches further right than any frame of the swing
    const right = (clip) => Math.max(...frames(clip).map((f) => renderFrame(doll, clip, f, p).bounds().x1));
    assert.ok(right('thrust') > right('attack'), `${what}: drawn reach ${right('thrust')} against ${right('attack')}`);
  }
});

test('thrust: swing scales the lunge, and a hold angle is added as in every other pose', () => {
  const d = H.dims({});
  const lunge = (swing) => Math.max(...Array.from({ length: 29 }, (_, i) => H.pose('thrust', i / 28, { swing }, d).rootX));
  assert.ok(lunge(0.5) < lunge(1) * 0.8 && lunge(1.3) > lunge(1) * 1.05);
  for (const clip of ['thrust', 'die', 'block', 'victory', 'talk', 'shoot']) for (const t of [0, 0.2, 0.45, 0.6, 0.9, 1]) {
    const plain = H.pose(clip, t, {}, d), held = H.pose(clip, t, { hold: 0.3 }, d);
    assert.ok(Math.abs(held.item - plain.item - 0.3) < 1e-9, `${clip} at ${t}`);
    assert.deepEqual(held.armF, plain.armF, `${clip} at ${t}: the arm does not move`);
  }
});

// ---- the poses that were there before ---------------------------------------------------------

// Recorded on 2026-11-18, before the new poses were added: pose() values the shipped characters are built on.
test('the old poses give the numbers they gave before', () => {
  const d = H.dims({});
  const got = (clip, t, m = {}) => { const P = H.pose(clip, t, m, d); return [P.rootX, P.lift, P.crouch, P.lean, P.headTilt, P.armF.a, P.armF.e, P.armB.a, P.armB.e, P.item, P.footF.x, P.footF.y, P.footB.x, P.footB.y].map((v) => Math.round(v * 1e6) / 1e6 + 0); };
  assert.deepEqual(got('idle', 0), [0, 0, 0, 0, 0, 0.149389, 0.25, -0.149389, 0.2, 2.535267, 1.5, 0, -1.5, 0]);
  assert.deepEqual(got('walk', 0.25), [0, 0, 0, 0.065, 0, 0, 0.3, 0, 0.3, 2.5, 0, 0, 0, -2.25]);
  assert.deepEqual(got('run', 0.3), [0, 0.656434, 0.8, 0.25, -0.12, 0.524468, 1.4, -0.124468, 1.4, 2.238197, -4.105263, 0, 2.087665, -3.036245]);
  assert.deepEqual(got('jump', 0.5), [0, 5.7, 0, -0.024074, 0, 2.15, 0.4, 1.75, 0.2, 3.1, 3.5, -3.5, -3, -1.5]);
  assert.deepEqual(got('attack', 0.5), [1.662472, 0, 1.641059, 0.207532, 0, 2.252681, 0.415052, -0.541059, 0.2, 2.89523, 2.608778, -1.257961, -3.162472, 0]);
  assert.deepEqual(got('punch', 0.6), [4.457493, 0, 2.57544, 0.416033, -0.099055, 1.536776, 0.002362, -1.091026, 0.695277, 1.539137, 2.490554, 0, -5.957493, 0]);
  assert.deepEqual(got('cast', 0.5), [0, 0, 0.8, -0.1, 0, 1.65, 0.4, 0.95, 0.7, 2.75, 1.5, 0, -1.5, 0]);
  assert.deepEqual(got('hurt', 0), [-1.8, 0, 0.9, -0.21, -0.15, 0.87, 0.6, 0.69, 0.5, 2.98, 2.94, 0, -2.1, 0]);
  assert.deepEqual(Object.keys(H.pose('idle', 0, {}, d)).filter((k) => !['lie', 'headTurn', 'mouth', 'fire', 'pull'].includes(k)), ['rootX', 'lift', 'crouch', 'lean', 'headTilt', 'footF', 'footB', 'armF', 'armB', 'item', 'sway', 'glow', 'blink', 'flash']);
});
