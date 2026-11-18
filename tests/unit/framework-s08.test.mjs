// Framework additions of batch S08 (security-bot):
//   engine/groundbot.js   boxView, trackPod, botHead (BOT_HEADS), botWeapon (BOT_WEAPONS), botPack (BOT_PACKS):
//                         ground robot parts described once in the machine's own space and placed by a projector
//   rigs/guard-bot.js     the guard robot rig: clips, dims, pose, solve, draw, lights, sockets, frame
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { INK } from '../../engine/color.js';
import * as K from '../../rigs/creature-topdown.js';
import { boxView, trackPod, botHead, botWeapon, botPack, BOT_HEADS, BOT_WEAPONS, BOT_PACKS } from '../../engine/groundbot.js';
import * as B from '../../rigs/guard-bot.js';

const DIRS = ['down', 'up', 'side'];
const at = (dir) => (a, b, c) => K.project(dir, a, b, c, [24.5, 36]);
const count = (g) => g.data.reduce((n, c) => n + (c ? 1 : 0), 0);
const same = (p, q) => p.data.every((c, i) => c === q.data[i]);
const inside = (g, [x0, y0, x1, y1]) => { const b = g.bounds(); return !b || (b.x0 >= x0 && b.y0 >= y0 && b.x1 < x1 && b.y1 < y1); };

// ---- engine/groundbot.js --------------------------------------------------------------------------

test('boxView: a box shows its width across, its length as depth and its height as wall when it faces the camera; from the side, length and width swap', () => {
  const box = { c: 2, len: 20, wide: 10, tall: 4 };
  const D = boxView(at('down'), box), S = boxView(at('side'), box), U = boxView(at('up'), box);
  assert.equal(D.x1 - D.x0, 10); assert.equal(D.face - D.top, 12); assert.equal(D.bottom - D.face, 4);
  assert.equal(S.x1 - S.x0, 20); assert.equal(S.face - S.top, 6); assert.equal(S.bottom - S.face, 4);
  assert.deepEqual([U.x0, U.x1, U.top, U.face, U.bottom], [D.x0, D.x1, D.top, D.face, D.bottom]);   // a box on the middle line looks the same from behind
  for (const V of [D, S, U]) for (const k of ['x0', 'x1', 'top', 'face', 'bottom']) assert.ok(Number.isInteger(V[k]));
});

test('boxView: z says which of two boxes is nearer the camera in each direction', () => {
  const front = { a: 6, len: 4, wide: 4, tall: 2 }, right = { b: 6, len: 4, wide: 4, tall: 2 }, mid = { len: 4, wide: 4, tall: 2 };
  assert.ok(boxView(at('down'), front).z > boxView(at('down'), mid).z);
  assert.ok(boxView(at('up'), front).z < boxView(at('up'), mid).z);
  assert.ok(boxView(at('side'), right).z > boxView(at('side'), mid).z);
});

test('trackPod: fills its box view and nothing else, both ways round; its cleats move with the phase and a phase of one pitch is the same picture', () => {
  for (const along of ['depth', 'across']) {
    const V = along === 'depth' ? boxView(at('down'), { b: 8, len: 17, wide: 6, tall: 5 }) : boxView(at('side'), { b: 8, len: 17, wide: 6, tall: 5 });
    const draw = (phase) => { const g = new Surface(48, 48); trackPod(g, V, { along, phase }); return g; };
    const g0 = draw(0), g1 = draw(1), g4 = draw(4);
    assert.ok(count(g0) > 40, along);
    assert.ok(inside(g0, [V.x0, V.top, V.x1, V.bottom]), along);
    assert.ok(!same(g0, g1), `${along}: one px of travel shows`);
    assert.ok(same(g0, g4), `${along}: a whole pitch is the same picture`);
  }
});

test('botHead: every head draws in every direction; the lens is seen facing the camera and from the side, never from behind', () => {
  assert.deepEqual([...BOT_HEADS], ['dome', 'block', 'sensor']);
  for (const kind of BOT_HEADS) for (const dir of DIRS) {
    const g = new Surface(48, 48), V = boxView(at(dir), { c: 10, len: 7, wide: 9, tall: 5 });
    const Hd = botHead(g, kind, V, { facing: dir, level: 1 });
    assert.ok(count(g) > 30, `${kind} ${dir}`);
    assert.equal(Hd.eye === null, dir === 'up', `${kind} ${dir}`);
    assert.ok(inside(g, [Hd.x0, Hd.top, Hd.x1, V.bottom]), `${kind} ${dir}: what it returns covers what it drew`);
    if (Hd.eye) assert.ok(g.get(Hd.eye[0], Hd.eye[1]) !== 0, `${kind} ${dir}: the eye is on the head`);
  }
  assert.throws(() => botHead(new Surface(8, 8), 'skull', { x0: 1, x1: 6, top: 1, face: 3, bottom: 6 }), /no head "skull"/);
});

test('botHead: the lens changes with its level, and looks sideways only when it faces the camera', () => {
  const V = boxView(at('down'), { c: 10, len: 7, wide: 9, tall: 5 });
  const draw = (o) => { const g = new Surface(48, 48); botHead(g, 'block', V, { facing: 'down', ...o }); return g; };
  assert.ok(!same(draw({ level: 1 }), draw({ level: 0 })));
  assert.ok(!same(draw({ level: 1 }), draw({ level: 2 })));
  assert.ok(!same(draw({ look: -1 }), draw({ look: 1 })));
});

test('botWeapon: measured without a Surface it draws nothing and returns the box the drawing stays inside; the tip follows thrust and the direction faced', () => {
  assert.deepEqual([...BOT_WEAPONS], ['cannon', 'saw', 'claw']);
  for (const kind of BOT_WEAPONS) for (const dir of DIRS) {
    const o = { mount: [0, 9, 5], length: 8, facing: dir };
    const M = botWeapon(null, kind, at(dir), o), g = new Surface(48, 48), W = botWeapon(g, kind, at(dir), o);
    assert.deepEqual(M.box, W.box); assert.deepEqual(M.tip, W.tip);
    assert.ok(count(g) > 20, `${kind} ${dir}`);
    assert.ok(inside(g, W.box), `${kind} ${dir}: ${JSON.stringify(g.bounds())} in ${W.box}`);
    const T = botWeapon(null, kind, at(dir), { ...o, thrust: 3 }).tip;
    const d = [T[0] - W.tip[0], T[1] - W.tip[1]];
    assert.ok(dir === 'side' ? d[0] === 3 && d[1] === 0 : dir === 'down' ? d[1] > 1 && d[0] === 0 : d[1] < -1 && d[0] === 0, `${kind} ${dir}: ${d}`);
  }
  assert.throws(() => botWeapon(null, 'drill', at('down'), {}), /no weapon "drill"/);
});

test('botWeapon: the saw turns, the claw opens, and a drooping cannon hangs lower without growing longer than it is', () => {
  const o = { mount: [0, 9, 5], facing: 'side', length: 10 };
  const draw = (kind, more) => { const g = new Surface(48, 48); botWeapon(g, kind, at('side'), { ...o, ...more }); return g; };
  assert.ok(!same(draw('saw', { facing: 'down', work: 0 }), draw('saw', { facing: 'down', work: 1 })));
  assert.ok(!same(draw('claw', { grip: 0 }), draw('claw', { grip: 2 })));
  const level = botWeapon(null, 'cannon', at('side'), o).tip, hung = botWeapon(null, 'cannon', at('side'), { ...o, droop: 4 }).tip;
  assert.ok(hung[1] > level[1] + 3 && hung[0] < level[0]);
});

test('botPack: the siren has a lamp and no vents, the exhaust two vents above its stacks; both stay inside the box they report and grow with size', () => {
  assert.deepEqual([...BOT_PACKS], ['siren', 'exhaust']);
  for (const kind of BOT_PACKS) for (const dir of DIRS) {
    const o = { mount: [-4, -5, 11], size: 1 };
    const M = botPack(null, kind, at(dir), o), g = new Surface(48, 48), Pk = botPack(g, kind, at(dir), o);
    assert.deepEqual(M.box, Pk.box);
    assert.ok(count(g) > 8 && inside(g, Pk.box), `${kind} ${dir}`);
    assert.equal(Pk.vents.length, kind === 'exhaust' ? 2 : 0);
    assert.equal(Pk.lamp === null, kind === 'exhaust');
    const big = new Surface(48, 48); botPack(big, kind, at(dir), { ...o, size: 1.35 });
    assert.ok(count(big) > count(g), `${kind} ${dir}: bigger`);
  }
  const lit = new Surface(48, 48), off = new Surface(48, 48);
  botPack(lit, 'siren', at('down'), { mount: [0, 0, 8], level: 1 }); botPack(off, 'siren', at('down'), { mount: [0, 0, 8], level: 0 });
  assert.ok(!same(lit, off));
  assert.throws(() => botPack(null, 'flag', at('down'), {}), /no pack "flag"/);
});

// ---- rigs/guard-bot.js ----------------------------------------------------------------------------

const LOOK = { body: '#6b7896', accent: '#f2a030', glow: '#e2473f' };
const OPTIONS = [];
for (const drive of B.DRIVES) for (const head of B.HEADS) for (const weapon of [...B.WEAPONS, 'none']) for (const pack of ['none', ...B.PACKS]) OPTIONS.push({ drive, head, weapon: { kind: weapon, length: 1 }, pack: { kind: pack, size: 1 } });
const CLIPS = B.clips((p) => p.speed, ['idle_down', 'walk*', { name: 'attack*', label: 'Charge' }, 'shoot*', 'hurt', 'die']);
const render = (clip, f, p, opt) => { const g = new Surface(...B.SIZE), F = B.frame(clip, CLIPS[clip].loop ? f / CLIPS[clip].frames : f / (CLIPS[clip].frames - 1), p, opt); F.draw(g, LOOK); F.finish(g, LOOK); return { g, F }; };

test('guard-bot clips: the style guide\'s names, frames and labels, in the order asked for', () => {
  assert.deepEqual(Object.keys(CLIPS), ['idle_down', 'walk_down', 'walk_up', 'walk_side', 'attack_down', 'attack_up', 'attack_side', 'shoot_down', 'shoot_up', 'shoot_side', 'hurt', 'die']);
  assert.deepEqual(Object.values(CLIPS).map((c) => c.frames), [8, 8, 8, 8, 8, 8, 8, 6, 6, 6, 4, 8]);
  assert.equal(CLIPS.attack_side.label, 'Charge (side)');
  assert.equal(CLIPS.walk_up.loop, true); assert.equal(CLIPS.die.loop, false);
  assert.ok(CLIPS.walk_down.fps({ speed: 1 }) > CLIPS.walk_down.fps({ speed: 0 }));
});

test('guard-bot dims: whole pixels with an odd hull, so it is the same on both sides of the pivot column; size and bulk make it bigger', () => {
  for (const size of [0, 0.5, 1]) for (const bulk of [0, 0.5, 1]) {
    const d = B.dims({ size, bulk });
    for (const v of [d.wide, d.len, d.head.wide, d.head.len]) assert.equal(v % 2, 1);
    for (const v of [d.tall, d.rise, d.tread.wide, d.tread.len]) assert.ok(Number.isInteger(v));
  }
  assert.ok(B.dims({ size: 1 }).wide > B.dims({ size: 0 }).wide);
  assert.ok(B.dims({ bulk: 1 }).wide > B.dims({ bulk: 0 }).wide);
  assert.equal(B.dims({}, { drive: 'wheels', head: 'cube' }).drive, 'treads');
  assert.equal(B.dims({}, { weapon: { kind: 'none' } }).weapon.kind, 'none');
});

test('guard-bot pose: the charge warns for three frames, lands furthest forward on frame 5 and ends where it began', () => {
  const d = B.dims(), P = (n) => B.pose('attack', n / 7, {}, d);
  for (const n of [1, 2, 3]) { assert.ok(P(n).x < 0 && P(n).drop > 0, `frame ${n} draws back and lowers`); }
  assert.ok(P(1).lamps >= 2 && P(2).lamps < 1 && P(3).lamps >= 2, 'the lights flash');
  assert.equal(P(5).x, 8); assert.equal(P(5).reach, 8); assert.equal(P(5).hit, true);
  assert.ok(P(4).x > 0 && P(4).x < P(5).x);
  assert.equal(P(0).x, 0); assert.equal(P(7).x, 0); assert.equal(P(7).drop, 0);
});

test('guard-bot pose: only a cannon fires; hurt is white on frame 0 only and ends on the idle pose; walk comes down on frames 0 and 4', () => {
  const gun = B.dims({}, { weapon: { kind: 'cannon' } }), saw = B.dims({}, { weapon: { kind: 'saw' } }), none = B.dims();
  assert.equal(B.pose('shoot', 1 / 5, {}, gun).fire, true);
  assert.equal(B.pose('shoot', 2 / 5, {}, gun).x, -2);
  for (const d of [saw, none]) for (let n = 0; n < 6; n++) assert.equal(B.pose('shoot', n / 5, {}, d).fire, false);
  assert.ok(B.pose('shoot', 1 / 5, {}, saw).arm.thrust > 0 && B.pose('shoot', 2 / 5, {}, none).x > 0);
  assert.deepEqual([0, 1, 2, 3].map((n) => B.pose('hurt', n / 3, {}, none).flash), [true, false, false, false]);
  const end = B.pose('hurt', 1, {}, none), idle = B.pose('idle', 0, {}, none);
  for (const k of ['x', 'drop', 'lift', 'sway', 'eye', 'lamps']) assert.equal(Math.round(end[k]), Math.round(idle[k]), k);
  const dip = (n) => B.pose('walk', n / 8, {}, none).drop;
  assert.ok(dip(0) > dip(2) && dip(4) > dip(6) && dip(0) === dip(4));
});

test('guard-bot pose: the shutdown goes one way only: the head sags, the weapon hangs and the hull gives way, never back, and it ends dark and still', () => {
  const d = B.dims({}, { weapon: { kind: 'cannon' } }), P = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => B.pose('die', n / 7, {}, d));
  assert.equal(P[0].flash, true);
  for (let n = 2; n < 8; n++) {
    assert.ok(P[n].head[0] >= P[n - 1].head[0] && P[n].head[1] >= P[n - 1].head[1], `head, frame ${n}`);
    assert.ok(P[n].nod >= P[n - 1].nod && P[n].sag >= P[n - 1].sag && P[n].arm.droop >= P[n - 1].arm.droop, `frame ${n}`);
  }
  assert.equal(P[7].dead, true); assert.ok(P[7].eye < 0.5 && P[7].lamps < 0.5);
  for (const k of ['x', 'drop', 'sag', 'nod', 'sway']) assert.equal(P[6][k], P[7][k], `${k} is settled`);
  assert.deepEqual(P[6].head, P[7].head);
});

test('guard-bot solve: at rest it stands on the row above the ground line, centred on the pivot column, in every direction and on treads or legs', () => {
  for (const drive of B.DRIVES) for (const dir of DIRS) for (const size of [0, 0.5, 1]) {
    const d = B.dims({ size, bulk: size }, { drive }), J = B.solve(dir, B.pose('rest', 0, {}, d), d);
    assert.equal(J.box[3], B.GROUND, `${drive} ${dir} ${size}`);
    assert.deepEqual(J.move, [0, 0]);
    if (dir !== 'side') assert.equal(J.hull.x0 + J.hull.x1, 2 * B.CX + 1, `${drive} ${dir}: the hull is the same on both sides of the pivot column`);
  }
});

test('guard-bot solve: a charge travels the way it faces, as far as the frame lets it, and never past the border', () => {
  for (const opt of [OPTIONS[0], OPTIONS.at(-1)]) for (const p of [{ size: 0, bulk: 0 }, {}, { size: 1, bulk: 1 }]) {
    const d = B.dims(p, opt);
    for (const dir of DIRS) {
      const moves = [4, 5, 6].map((n) => B.solve(dir, B.pose('attack', n / 7, {}, d), d).move);
      const along = (m) => (dir === 'down' ? m[1] : dir === 'up' ? -m[1] : m[0]);
      const back = along(B.solve(dir, B.pose('attack', 3 / 7, {}, d), d).move);
      assert.ok(along(moves[1]) >= 2 && along(moves[1]) - back >= 6, `${dir}: from drawn back to the hit is 6 px or more (${back} to ${along(moves[1])})`);
      assert.ok(along(moves[0]) < along(moves[1]) && along(moves[2]) < along(moves[1]), `${dir}: frame 5 is the furthest`);
      for (let n = 0; n < 8; n++) {
        const J = B.solve(dir, B.pose('attack', n / 7, {}, d), d);
        assert.ok(J.box[0] >= 2 && J.box[1] >= 2 && J.box[2] <= 46 && J.box[3] <= 46, `${dir} frame ${n}: ${J.box}`);
      }
    }
  }
});

test('guard-bot frame: every option in every clip draws inside the border, twice the same, and its box covers the inked picture', () => {
  for (const opt of OPTIONS.filter((o, i) => i % 5 === 0 || i === OPTIONS.length - 1)) for (const clip of Object.keys(CLIPS)) for (let f = 0; f < CLIPS[clip].frames; f += clip === 'die' ? 1 : 3) {
    const { g, F } = render(clip, f, {}, opt), b = g.bounds(), tag = `${opt.drive} ${opt.head} ${opt.weapon.kind} ${opt.pack.kind} ${clip} ${f}`;
    assert.ok(b && count(g) > 150, tag);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 46 && b.y1 <= 46, `${tag}: ${JSON.stringify(b)}`);
    assert.ok(same(g, render(clip, f, {}, opt).g), tag);
    const solid = new Surface(...B.SIZE); B.draw(solid, F.J, F.P, F.d, LOOK);
    assert.ok(inside(solid, F.J.box), `${tag}: ${JSON.stringify(solid.bounds())} in ${F.J.box}`);
  }
});

test('guard-bot frame: the three directions are three pictures, the head shows its lens only when it does not face away, and the outline is the standard ink', () => {
  const pics = DIRS.map((dir) => render(`walk_${dir}`, 0, {}, OPTIONS[0]));
  assert.ok(!same(pics[0].g, pics[1].g) && !same(pics[0].g, pics[2].g) && !same(pics[1].g, pics[2].g));
  assert.ok(pics[0].F.J.eye && pics[2].F.J.eye); assert.equal(pics[1].F.J.eye, null);
  const b = pics[0].g.bounds(), ink = new Surface(1, 1).dot(0, 0, INK).get(0, 0);
  let foot = 0; for (let x = b.x0; x <= b.x1 && !foot; x++) foot = pics[0].g.get(x, b.y1);
  assert.equal(foot, ink);
  assert.ok(pics[2].g.bounds().x1 > 2 * B.CX - pics[2].g.bounds().x0, 'seen from the side the weapon points to picture-right');
});

test('guard-bot frame: the tracks turn through the walk, and the walk loops', () => {
  for (const dir of DIRS) {
    const f = [0, 1, 4].map((n) => render(`walk_${dir}`, n, { bounce: 0 }, { ...OPTIONS[0], weapon: { kind: 'none' } }).g);
    assert.ok(!same(f[0], f[1]), dir);
  }
  const F0 = B.frame('walk_down', 0, {}, OPTIONS[0]), F1 = B.frame('walk_down', 1, {}, OPTIONS[0]);
  assert.equal(F1.P.tread % 4, F0.P.tread % 4);
});

test('guard-bot sockets: hand, muzzle, head, back and feet, pointing the way it faces; the muzzle leads the hand and follows the recoil', () => {
  const angle = { down: 0, up: Math.PI, side: Math.PI / 2 };
  for (const dir of DIRS) for (const opt of [OPTIONS[0], { ...OPTIONS[0], weapon: { kind: 'none' } }]) {
    const S = B.frame(`walk_${dir}`, 0, {}, opt).sockets();
    assert.deepEqual(Object.keys(S), ['hand', 'muzzle', 'head', 'back', 'feet']);
    for (const k of Object.keys(S)) for (const v of ['x', 'y', 'angle']) assert.ok(Number.isFinite(S[k][v]), `${dir} ${k}.${v}`);
    assert.equal(S.hand.angle, angle[dir]); assert.equal(S.muzzle.angle, angle[dir]);
    assert.equal(S.feet.y, B.GROUND);
    const lead = dir === 'down' ? S.muzzle.y - S.hand.y : dir === 'up' ? S.hand.y - S.muzzle.y : S.muzzle.x - S.hand.x;
    assert.ok(lead > 0, `${dir}: the muzzle is ahead of the hand (${lead})`);
  }
  const aim = B.frame('shoot_side', 1 / 5, {}, OPTIONS[0]).sockets().muzzle, kick = B.frame('shoot_side', 2 / 5, {}, OPTIONS[0]).sockets().muzzle;
  assert.ok(kick.x < aim.x);
});

test('guard-bot: fittings keep clear of pale armour, and a dead machine is dark', () => {
  const dark = render('walk_down', 0, {}, OPTIONS[0]).g;
  const pale = (() => { const g = new Surface(...B.SIZE), F = B.frame('walk_down', 0, {}, OPTIONS[0]); F.draw(g, { ...LOOK, body: '#c2c9d6' }); F.finish(g, LOOK); return g; })();
  assert.ok(!same(dark, pale));
  const alive = render('die', 1, {}, { ...OPTIONS[0], pack: { kind: 'siren', size: 1 } }).F, dead = render('die', 7, {}, { ...OPTIONS[0], pack: { kind: 'siren', size: 1 } }).F;
  assert.equal(alive.P.dead, false); assert.equal(dead.P.dead, true);
  assert.equal(dead.J.siren, null);
});
