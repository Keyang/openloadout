// Framework additions of batch S04, fix round 1 (void-ranger), all in rigs/topdown.js: a long gun carried in both hands.
// The carry 'braced' (CARRY_BRACED), holdWith, bracedManner, bracedFrame (with F.grip), handAt, backOver and drawOver.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, INK } from '../../engine/color.js';
import * as T from '../../rigs/topdown.js';

const SKIN = '#f6d3b0', SUIT = '#e8ecf2', MARK = '#ff00ff', GLOVE = '#00ff00';
const LOOK = { skin: SKIN, top: SUIT, bottom: '#c8ccd4', boots: '#3f6fd1', hair: '#434d6d', hairStyle: 'short', hatted: true };
const [W, H] = T.SIZE, PI = Math.PI;
const count = (g, c) => { const v = col(c); let n = 0; for (const p of g.data) if (p === v) n++; return n; };
const pixels = (g, c) => { const v = col(c), out = []; for (let i = 0; i < g.data.length; i++) if (g.data[i] === v) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
const wrap = (a) => Math.abs((((a + PI) % (2 * PI)) + 2 * PI) % (2 * PI) - PI);
const toSegment = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return Math.hypot(px - ax - u * dx, py - ay - u * dy); };
const CLIPS = Object.keys(T.clips(() => 0.5, { action: 'shoot', plain: ['dodge', 'hurt', 'die'] }));
const phases = (clip) => { const s = T.STANDARD[T.parseClip(clip).action]; return [...Array(s.frames).keys()].map((f) => (s.loop ? f / s.frames : f / (s.frames - 1))); };
/** How far the free hand's socket is from the gun (its stock end to its muzzle), in pixels. */
function offGap(F) {
  const k = F.sockets(), r = k.hand.reach ?? 1, a = k.hand.angle;
  return toSegment(k.offhand.x, k.offhand.y, k.hand.x - Math.sin(a) * F.item.back * r, k.hand.y - Math.cos(a) * F.item.back * r, k.muzzle.x, k.muzzle.y);
}

test("S04 carry 'braced': registered beside the one-handed 'ready', which is unchanged; facing away the tip is up and out", () => {
  assert.equal(T.CARRY.braced, T.CARRY_BRACED);
  assert.deepEqual({ ...T.CARRY_READY }, { down: -0.6, up: 0.6, side: 1.2 });
  assert.ok(Object.isFrozen(T.CARRY_BRACED));
  assert.ok(Math.cos(T.CARRY_BRACED.up) < -0.5 && Math.sin(T.CARRY_BRACED.up) > 0.2, 'up: the tip points up the screen and out to the weapon side');
  assert.ok(Math.cos(T.CARRY_BRACED.down) > 0.5, 'down: the tip points down the screen');
  assert.ok(Math.abs(T.CARRY_BRACED.side - PI / 2) < 0.3, 'side: nearly level');
});

test('S04 holdWith: the free hand lands on the held thing, and where the arm is too short the weapon hand brings it across', () => {
  const d = T.dims({});
  for (const dir of T.DIRECTIONS) {
    const P = T.pose('idle', dir, 0, { armed: true, carry: 'ready' }, d), before = T.solve(dir, P, d).armF.hand;
    const gap = T.holdWith(P, dir, d, { along: 2, slack: 1, give: 8 }), J = T.solve(dir, P, d);
    const at = [J.armF.hand[0] + Math.sin(P.item) * 2, J.armF.hand[1] + Math.cos(P.item) * 2];
    assert.ok(gap <= 1.01, `${dir}: within the slack (${gap.toFixed(2)})`);
    assert.ok(Math.abs(Math.hypot(J.armB.hand[0] - at[0], J.armB.hand[1] - at[1]) - gap) < 1e-6, `${dir}: the distance it returns is the distance in the solved pose`);
    if (dir !== 'side') assert.ok(Math.hypot(J.armF.hand[0] - before[0], J.armF.hand[1] - before[1]) > 1, `${dir}: the hanging weapon hand came across the body`);
  }
  // give: 0 never moves the weapon hand
  const P = T.pose('idle', 'up', 0, { armed: true, carry: 'ready' }, d), F0 = JSON.stringify(P.armF);
  assert.ok(T.holdWith(P, 'up', d, { along: 2, give: 0 }) > 2, 'out of reach, and said so');
  assert.equal(JSON.stringify(P.armF), F0);
  // a body lying down is left alone
  const L = T.pose('die', 'down', 1, { armed: true }, d), was = JSON.stringify(L);
  assert.equal(T.holdWith(L, 'down', d), 0);
  assert.equal(JSON.stringify(L), was);
});

test('S04 bracedFrame: in every frame of idle, walk and shoot the free hand is on the gun, for every gun and body', () => {
  for (const kind of T.GUN_KINDS) for (const scale of [0.65, 1, 1.35]) for (const body of [{}, { height: 0, build: 0 }, { height: 0, build: 1 }, { height: 1, build: 0 }, { height: 1, build: 1 }]) {
    for (const clip of CLIPS.filter((c) => /^(idle|walk|shoot)_/.test(c))) for (const t of phases(clip)) {
      const F = T.bracedFrame(clip, t, body, { item: T.gunSize(kind, scale) });
      assert.ok(offGap(F) <= 2, `${kind} x${scale} ${JSON.stringify(body)} ${clip} t=${t.toFixed(2)}: the free hand is ${offGap(F).toFixed(2)} px from the gun`);
    }
  }
});

test('S04 bracedFrame: facing away the gun points up the screen at rest, and a shot never turns it far between frames', () => {
  const item = T.gunSize('blaster', 1);
  for (const clip of ['idle_up', 'walk_up']) for (const t of phases(clip)) {
    const a = T.bracedFrame(clip, t, {}, { item }).sockets().muzzle.angle;
    assert.ok(wrap(a) > PI / 2 + 0.3, `${clip} t=${t.toFixed(2)}: the muzzle points up the screen (${a.toFixed(2)})`);
  }
  for (const clip of ['shoot_down', 'shoot_up', 'shoot_side']) {
    const angles = phases(clip).map((t) => T.bracedFrame(clip, t, {}, { item }).sockets().muzzle.angle);
    for (let f = 1; f < angles.length; f++) assert.ok(wrap(angles[f] - angles[f - 1]) < PI / 4, `${clip} frame ${f - 1} to ${f}: turns ${wrap(angles[f] - angles[f - 1]).toFixed(2)}`);
    // the last frame is the hold the idle starts from, so the clip returns to it without a jump
    const end = T.bracedFrame(clip, 1, {}, { item }).sockets(), idle = T.bracedFrame(clip.replace('shoot', 'idle'), 0, {}, { item }).sockets();
    for (const name of ['hand', 'offhand', 'muzzle']) assert.ok(Math.hypot(end[name].x - idle[name].x, end[name].y - idle[name].y) < 0.01, `${clip}: ends with ${name} where the idle has it`);
  }
  const fire = T.bracedFrame('shoot_up', 0.2, {}, { item });
  assert.ok(fire.P.fire && wrap(fire.sockets().muzzle.angle - PI) < 0.01, 'the shot itself goes straight up the screen');
  const hurt = T.bracedFrame('hurt', 1, {}, { item }).sockets(), idle = T.bracedFrame('idle_down', 0, {}, { item }).sockets();
  assert.ok(Math.hypot(hurt.offhand.x - idle.offhand.x, hurt.offhand.y - idle.offhand.y) < 0.01, 'hurt ends back in the hold');
});

test('S04 bracedFrame: F.grip is the hidden hand facing away and nothing else; die and an empty hand are the one-handed frame', () => {
  const item = T.gunSize('scatter', 1);
  const up = T.bracedFrame('idle_up', 0, {}, { item }), g = new Surface(W, H);
  let inHook = null;
  up.draw(g, LOOK, { item: (gg, J) => { inHook = up.grip(J); } });
  assert.ok(inHook && Math.hypot(inHook.x - up.sockets().offhand.x, inHook.y - up.sockets().offhand.y) < 1e-6, 'the hook and the exported socket agree on where that hand is');
  const J = T.solve('up', up.P, up.d);
  assert.ok(Math.hypot(J.armB.hand[0] - inHook.x, J.armB.hand[1] - inHook.y) > 3, 'it is past the end of the drawn arm, which goes round the front of the body');
  for (const clip of ['idle_down', 'idle_side', 'shoot_down', 'walk_side']) {
    const F = T.bracedFrame(clip, 0, {}, { item }), Jc = T.solve(F.direction, F.P, F.d);
    assert.equal(F.grip(Jc), null, `${clip}: the hand is where the arm puts it`);
    assert.deepEqual([F.sockets().offhand.x, F.sockets().offhand.y], Jc.armB.hand);
  }
  for (const [clip, t, opt] of [['die', 0.2, { item }], ['die', 1, { item }], ['idle_down', 0, {}], ['attack_up', 0.5, { item: null }]]) {
    const F = T.bracedFrame(clip, t, {}, opt), plain = T.frame(clip, t, {}, { ...opt, carry: 'ready' });
    assert.equal(JSON.stringify(F.P), JSON.stringify(plain.P), `${clip}: the pose of frame() under carry 'ready'`);
    assert.deepEqual(F.sockets(), plain.sockets());
    assert.equal(F.grip(T.solve(F.direction, F.P, F.d)), null);
  }
});

test('S04 bracedFrame: every clip of a gunner stays inside the frame, at the smallest and largest body with the longest gun', () => {
  for (const body of [{ height: 0, build: 0 }, {}, { height: 1, build: 1 }]) for (const clip of CLIPS) for (const t of phases(clip)) {
    const F = T.bracedFrame(clip, t, body, { item: T.gunSize('beam', 1.35) }), g = new Surface(W, H);
    F.draw(g, LOOK, {
      torso: (gg, J, P, d) => T.backOver(gg, J, P, d, { colour: SUIT }),
      item: (gg, J) => { T.drawOver(gg, (s) => T.heldGun(s, F.direction, F.hand(J), { kind: 'beam', length: F.item.length }), INK); if (F.grip(J)) T.handAt(gg, F.grip(J), F.d, { colour: GLOVE }); },
    });
    F.finish(g, { flash: false });
    const b = g.bounds();
    assert.ok(b && b.x0 >= 1 && b.y0 >= 1 && b.x1 <= W - 2 && b.y1 <= H - 2, `${clip} t=${t.toFixed(2)} ${JSON.stringify(body)}: touches the frame edge (${JSON.stringify(b)})`);
  }
});

test('S04 backOver: seen from behind, a hand held in front of the body is hidden by the back; nothing changes facing down or sideways', () => {
  const d = T.dims({});
  const draw = (dir, cover) => {
    const P = T.pose('idle', dir, 0, {}, d), g = new Surface(W, H);
    P.armB = { f: 0, u: 2, o: -5 };                                    // the free hand in front of the middle of the body
    const J = T.draw(g, dir, P, d, LOOK, { torso: (gg, J, PP, dd) => { if (cover) T.backOver(gg, J, PP, dd, { colour: SUIT }); } });
    return { g, J };
  };
  const near = (g, J) => pixels(g, SKIN).filter(([x, y]) => Math.abs(x + 0.5 - J.bx) <= d.chestR - 2 && y >= J.shoulderY + d.chin).length;
  const open = draw('up', false), shut = draw('up', true);
  assert.ok(near(open.g, open.J) >= 4, 'without it the fist lies on the back');
  assert.equal(near(shut.g, shut.J), 0, 'with it the back covers the fist');
  // the back it paints is the back the rig paints: a body with nothing in front of it is unchanged
  const plain = (cover) => { const g = new Surface(W, H), P = T.pose('idle', 'up', 0, {}, d); T.draw(g, 'up', P, d, LOOK, { torso: (gg, J, PP, dd) => { if (cover) T.backOver(gg, J, PP, dd, { colour: SUIT }); } }); return g; };
  assert.deepEqual(plain(true).data, plain(false).data);
  for (const dir of ['down', 'side']) assert.deepEqual(draw(dir, true).g.data, draw(dir, false).g.data, `${dir}: untouched`);
});

test('S04 drawOver and handAt: a rim only where the thing lies over what was drawn; a hand is the block the rig draws for a fist', () => {
  const g = new Surface(W, H);
  g.rect(10, 10, 10, 10, SUIT, { shade: 0 });
  T.drawOver(g, (s) => s.rect(15, 13, 12, 3, MARK, { shade: 0 }), INK);
  assert.equal(count(g, MARK), 36, 'the whole thing is drawn, on top');
  const rim = pixels(g, INK);
  assert.ok(rim.length >= 10 && rim.every(([x, y]) => x >= 10 && x < 20 && y >= 10 && y < 20), `the rim (${rim.length} px) is only on the body under it`);
  assert.ok(rim.every(([x, y]) => (y === 12 || y === 16) ? x >= 15 : x === 14 && y >= 13 && y <= 15), 'one pixel wide, round the part that overlaps');
  const bare = new Surface(W, H);
  T.drawOver(bare, (s) => s.rect(15, 13, 12, 3, MARK, { shade: 0 }), INK);
  assert.equal(count(bare, INK), 0, 'nothing under it: no rim');
  const none = new Surface(W, H);
  none.rect(10, 10, 10, 10, SUIT, { shade: 0 });
  T.drawOver(none, (s) => s.rect(15, 13, 12, 3, MARK, { shade: 0 }), null);
  assert.equal(count(none, INK), 0, 'rim: null draws none');
  const d = T.dims({}), h = new Surface(W, H);
  T.handAt(h, { x: 20.4, y: 30.2 }, d, { colour: GLOVE });
  assert.equal(count(h, GLOVE), d.armW * 2);
  assert.deepEqual(h.bounds(), { x0: 19, y0: 29, x1: 21, y1: 30 });
});
