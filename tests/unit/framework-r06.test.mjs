// Framework additions of batch R06 (village-elder, merchant), all at the end of rigs/topdown.js: a frame with a pose
// or a body of its own (poseFrame, gesture, waveHand, waveArm), an old back and a walking stick (stoop, hunch, plantStick), the parts
// townsfolk wear (baldingHair, circlet, turban, spectacles, neck, apron, travelPack, fingers) and hold (tradeItem).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, INK } from '../../engine/color.js';
import * as T from '../../rigs/topdown.js';

const LOOK = { skin: '#f6d3b0', top: '#3f6fd1', bottom: '#2b3a67', boots: '#9a6a3e', hair: '#5a3a22', hairStyle: 'bald' };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const differ = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
/** The standing joints for a direction, with a pose change applied first. */
const stand = (direction, change = () => {}, d = T.dims()) => { const P = T.pose('idle', direction, 0, {}, d); change(P); return { P, d, J: T.solve(direction, P, d) }; };
/** Draws only a part, on an empty surface. */
const part = (direction, fn, change) => { const { P, d, J } = stand(direction, change); const g = new Surface(...T.SIZE); fn(g, J, P, d); return { g, J, P, d }; };
/** Draws the body with hooks. */
const body = (F, hooks = {}, look = LOOK) => { const g = new Surface(...T.SIZE); F.draw(g, look, hooks); return g; };

test('poseFrame: with no options of its own it is frame(), pixel for pixel and socket for socket', () => {
  for (const clip of ['idle_down', 'walk_up', 'walk_side', 'attack_side', 'hurt', 'die']) for (const t of [0, 0.25, 0.6]) {
    const p = { height: 0.7, build: 0.3 }, opt = { item: T.itemSize('sword', 1), rise: 3 };
    const A = T.frame(clip, t, p, opt), B = T.poseFrame(clip, t, p, opt);
    assert.ok(same(A.finish(body(A)), B.finish(body(B))), `${clip} at ${t}`);
    assert.deepEqual(B.sockets(), A.sockets());
    assert.equal(B.action, A.action); assert.equal(B.direction, A.direction);
  }
});

test('poseFrame: a pose function adds actions the standard table lacks, dims changes the body, a manner bends the pose before the one fit', () => {
  assert.throws(() => T.frame('wave', 0.4, {}), /no pose "wave"/);
  const pose = (action, direction, u, m, d) => (action === 'wave' ? T.gesture('wave', direction, u, m, d) : null);
  const W = T.poseFrame('wave', 0.43, {}, { pose });
  assert.equal(W.action, 'wave');
  assert.ok(W.P.armB.u > 5, 'the gesture was posed');
  assert.deepEqual(T.poseFrame('idle_down', 0.3, {}, { pose }).P, T.frame('idle_down', 0.3, {}).P, 'null from the pose function means the standard pose');
  const long = T.poseFrame('idle_down', 0, {}, { dims: (d) => ({ ...d, arm: d.arm + 2 }) });
  assert.equal(long.d.arm, T.dims().arm + 2);
  assert.equal(long.sockets().hand.y, T.frame('idle_down', 0, {}).sockets().hand.y + 2, 'longer arms hang lower');
  const seen = [];
  const M = T.poseFrame('walk_side', 0.25, {}, { manner: [(P, F, u) => { seen.push([F.action, F.direction, u]); P.headDy = (P.headDy ?? 0) + 3; }] });
  assert.deepEqual(seen[0], ['walk', 'side', 0.25]);
  assert.equal(M.sockets().head.y, T.frame('walk_side', 0.25, {}).sockets().head.y + 3);
  // tall headgear on a body whose head a manner has lifted still stays in the frame
  const high = T.poseFrame('idle_down', 0, { height: 1 }, { tall: [30, 38], rise: 6, manner: (P) => { P.headDy = -4; } });
  assert.ok(high.sockets().head.y - 6 >= 2, `the top of the headgear is at ${high.sockets().head.y - 6}`);
});

test('gesture: wave starts and ends standing, raises the free hand above the eyes and clear of the face, and swings it out, in, out, in', () => {
  assert.deepEqual(T.GESTURES, ['wave', 'count']);
  assert.throws(() => T.gesture('bow', 'down', 0), /wave, count/);
  // every body, and a head carried high on a long neck (a manner lifts it after the gesture is posed)
  for (const direction of T.DIRECTIONS) for (const p of [{}, { height: 0, build: 0, head: 0 }, { height: 1, build: 1, head: 1 }]) for (const neck of [0, -3]) {
    const d = T.dims(p), tag = `${direction}, ${JSON.stringify(p)}, neck ${neck}`;
    const at = (f) => { const P = T.gesture('wave', direction, f / 7, {}, d); P.headDy += neck; return P; };
    const idle = T.pose('idle', direction, 0, {}, d);
    for (const f of [0, 7]) {
      assert.deepEqual(at(f).armB, idle.armB, `${tag}: frame ${f} stands`);
      assert.equal(at(f).headDy, neck);
      assert.equal(T.waveHand(T.solve(direction, at(f), d), at(f), d), null, `${tag}: frame ${f}: no raised hand`);
    }
    const seen = [2, 3, 4, 5].map((f) => { const P = at(f), J = T.solve(direction, P, d); return { f, J, H: T.waveHand(J, P, d) }; });
    for (const { f, J, H } of seen) {
      assert.ok(H && H.w === 3 && H.h === 3, `${tag}: frame ${f}: a hand of 3 x 3`);
      assert.ok(H.y <= J.brow + 1, `${tag}: frame ${f}: the top of the hand (row ${H.y}) is at or above the eyes (row ${J.brow + 1})`);
      assert.ok(H.y + H.h <= J.armB.shoulder[1], `${tag}: frame ${f}: the whole hand is above the shoulder`);
      // never over the face: between the head and the nearest column of the hand there is at least one free column, where the outline goes
      const edge = J.head[0] + H.out * d.headW / 2, inner = H.out > 0 ? H.x : H.x + H.w;
      assert.ok(H.out * (inner - edge) >= 1, `${tag}: frame ${f}: the hand (from column ${inner}) is clear of the head (edge ${edge})`);
      assert.ok(H.x >= 2 && H.x + H.w <= T.SIZE[0] - 2 && H.y >= 2, `${tag}: frame ${f}: inside the frame`);
      assert.ok(H.elbow[1] < J.armB.shoulder[1] && H.out * (H.elbow[0] - J.armB.shoulder[0]) > 3, `${tag}: frame ${f}: the elbow is out beside the shoulder, not under it`);
    }
    const xs = seen.map(({ H }) => H.out * H.x);
    assert.ok(xs[0] >= xs[1] + 3 && xs[2] >= xs[1] + 3 && xs[2] >= xs[3] + 3, `${tag}: out, in, out, in, 3 px or more each way (${xs})`);
    assert.deepEqual(at(2).armF, idle.armF, 'the weapon arm stays where it is');
    // on the way up and on the way down the hand is between hanging and raised
    for (const f of [1, 6]) {
      const P = at(f), J = T.solve(direction, P, d), H = T.waveHand(J, P, d), rest = T.solve(direction, idle, d).armB.hand[1];
      assert.ok(H && H.y > seen[0].H.y && H.y + H.h < rest, `${tag}: frame ${f} is half way`);
    }
  }
  assert.ok(T.gesture('wave', 'down', 2 / 7).mouth && !T.gesture('wave', 'down', 3 / 7).mouth, 'calls out on the outward swings');
});

test('waveArm: a sleeve from the elbow up to an open hand of skin with the cuff under it, a cluster of its own with ink between it and the head', () => {
  const skin = '#f6d3b0', cuff = '#c8553a', pose = (action, direction, u, m, d) => (action === 'wave' ? T.gesture('wave', direction, u, m, d) : null);
  const look = { ...LOOK, cuffs: cuff, hairStyle: 'ponytail' };
  for (const neck of [0, -3]) for (const f of [1, 2, 3, 4, 5, 6]) {
    const F = T.poseFrame('wave', f / 7, {}, { pose, manner: (P) => { P.headDy += neck; } });
    const g = body(F, { front(g, J, P, d) { T.waveArm(g, J, P, d, { sleeve: look.top, skin, cuff }); } }, look);
    F.finish(g);
    const J = T.solve('down', F.P, F.d), H = T.waveHand(J, F.P, F.d);
    for (let y = H.y; y < H.y + H.h; y++) {
      for (let x = H.x; x < H.x + H.w; x++) assert.equal(g.get(x, y), col(skin), `neck ${neck}, frame ${f}: the hand at ${x}, ${y}`);
      // raised, the hand is a cluster of its own: the column beside it on the head's side is outline, and so is the one beyond it
      if (f >= 2 && f <= 5) for (const x of [H.x - 1, H.x + H.w]) assert.equal(g.get(x, y), col(INK), `neck ${neck}, frame ${f}: ink beside the hand at ${x}, ${y}`);
    }
    for (let x = H.x; x < H.x + H.w; x++) {
      assert.equal(g.get(x, H.y - 1), col(INK), `neck ${neck}, frame ${f}: ink above the hand`);
      assert.equal(g.get(x, H.y + H.h), col(cuff), `neck ${neck}, frame ${f}: the cuff is under the hand, on the wrist`);
    }
    // no skin of the hand touches the skin of the face: the nearest skin to the hand's left is two or more columns away
    if (f >= 2 && f <= 5) for (let y = H.y; y < H.y + H.h; y++) assert.ok(g.get(H.x - 2, y) !== col(skin), `neck ${neck}, frame ${f}: row ${y}`);
    // the fist the rig drew at the end of its arm is now the elbow: no skin and no cuff there
    const [ex, ey] = J.armB.hand;
    for (let y = Math.round(ey) - 3; y <= Math.round(ey); y++) for (let x = Math.floor(ex) - 1; x <= Math.floor(ex) + 1; x++) {
      if (y >= H.y + H.h + 1) assert.ok(g.get(x, y) !== col(skin) && g.get(x, y) !== col(cuff), `neck ${neck}, frame ${f}: the elbow at ${x}, ${y} is sleeve`);
    }
    if (f >= 2 && f <= 5) assert.deepEqual(F.sockets().offhand, { x: H.x + H.w / 2, y: H.y + H.h / 2, angle: Math.atan2(H.x + H.w / 2 - H.elbow[0], H.y + H.h / 2 - H.elbow[1]) }, 'the offhand socket is the raised hand');
  }
  // every direction draws it; a pose that is not waving draws nothing
  for (const direction of T.DIRECTIONS) {
    const d = T.dims(), P = T.gesture('wave', direction, 3 / 7, {}, d), J = T.solve(direction, P, d), g = new Surface(...T.SIZE);
    T.waveArm(g, J, P, d, { sleeve: '#3f6fd1', skin, cuff });
    const H = T.waveHand(J, P, d), b = g.bounds();
    assert.ok(lit(g) >= 9 + 3 + 6, `${direction}: ${lit(g)} pixels`);
    assert.equal(b.y0, H.y, `${direction}: the hand is the top of it`);
    assert.equal(count(g, direction === 'side' ? ramp(skin).dark : skin), 9, `${direction}: nine pixels of skin (the far arm, seen from the side, is a tone down)`);
    const still = part(direction, (g2, J2, P2, d2) => T.waveArm(g2, J2, P2, d2, { skin }));
    assert.equal(lit(still.g), 0, `${direction}: nothing while standing`);
    // a wide brim: the hand stays further out by the columns asked for
    const wide = { ...P, wave: { ...P.wave, clear: 2 } };
    assert.equal(T.waveHand(J, wide, d).x, H.x + 2 * H.out, `${direction}: clear moves the hand out`);
  }
});

test('gesture: count ticks off one, two, three fingers and closes the hand, moves the mouth on frames 2 and 6, and loops', () => {
  const d = T.dims(), at = (f) => T.gesture('count', 'down', f / 8, {}, d);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((f) => at(f).count), [1, 1, 2, 2, 3, 3, 0, 0]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].filter((f) => at(f).mouth), [2, 6]);
  assert.deepEqual(T.gesture('count', 'down', 1, {}, d), at(0), 'the loop closes');
  for (const f of [0, 2, 4]) assert.ok(at(f).armB.u > at(f + 1).armB.u, `frame ${f}: the hand jerks up as the finger goes out`);
  assert.equal(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((f) => JSON.stringify(at(f)))).size, 8, 'no two frames are the same');
  // carried things still hang straight down
  assert.ok(Math.abs(T.gesture('count', 'side', 0.3, { carry: 'hang' }, d).item) < 0.1);
});

test('stoop: the head sinks in every direction, the shoulders tip forward seen from the side, and nothing changes at 0', () => {
  for (const direction of T.DIRECTIONS) {
    const d = T.dims(), up = T.pose('idle', direction, 0, {}, d), bent = T.stoop(T.pose('idle', direction, 0, {}, d), direction, 1);
    assert.deepEqual(T.stoop(T.pose('idle', direction, 0, {}, d), direction, 0), up, `${direction}: amount 0 leaves the pose alone`);
    const A = T.solve(direction, up, d), B = T.solve(direction, bent, d);
    assert.ok(B.headTop >= A.headTop + 3, `${direction}: the head is at least 3 px lower (${A.headTop} -> ${B.headTop})`);
    assert.equal(B.gy, A.gy, 'the feet stay on the ground');
    if (direction === 'side') assert.ok(B.neck[0] >= A.neck[0] + 3 && B.head[0] > B.neck[0], 'the shoulders and the head come forward');
    assert.equal(bent.stoop, 1);
    const half = T.solve(direction, T.stoop(T.pose('idle', direction, 0, {}, d), direction, 0.5), d);
    assert.ok(half.headTop > A.headTop && half.headTop < B.headTop, `${direction}: half way is in between`);
  }
});

test('hunch: a hump on the back from the side, shoulders over the bottom of the head from behind (the front hook), nothing facing down', () => {
  const draw = (direction, opt) => part(direction, (g, J, P, d) => T.hunch(g, J, P, d, { colour: '#a8a4a0', ...opt }), (P) => T.stoop(P, direction, 1));
  assert.equal(lit(draw('down', {}).g), 0);
  assert.equal(lit(draw('down', { front: true }).g), 0);
  assert.ok(lit(draw('side', {}).g) > 8, 'side, from the torso hook');
  assert.equal(lit(draw('side', { front: true }).g), 0, 'side: nothing from the front hook');
  assert.equal(lit(draw('up', {}).g), 0, 'up: nothing from the torso hook');
  const { g, J, d } = draw('up', { front: true });
  assert.ok(lit(g) > 20);
  assert.ok(g.get(Math.floor(J.bx), J.headTop + d.headH - 1) !== 0, 'it covers the bottom row of the head');
  assert.equal(g.get(Math.floor(J.bx), J.headTop + 2), 0, 'but not the crown');
  assert.equal(lit(part('up', (g, J, P, d) => T.hunch(g, J, P, d, { front: true })).g), 0, 'an upright back has no hump');
  assert.ok(lit(draw('up', { front: true, amount: 0.4 }).g) < lit(g), 'less stoop, less hump');
});

test('plantStick: standing, the tip of the stick is on the ground row beside the body for every length, and a longer stick lifts the hand', () => {
  for (const direction of T.DIRECTIONS) {
    const hands = [];
    for (const length of [8, 11, 15]) {
      const d = T.dims(), P = T.plantStick(T.pose('idle', direction, 0, { carry: 'low' }, d), direction, d, { action: 'idle', t: 0, length });
      const h = T.sockets(T.solve(direction, P, d), P, d).hand;
      const tip = [h.x + Math.sin(h.angle) * length * h.reach, h.y + Math.cos(h.angle) * length * h.reach];
      assert.ok(Math.abs(tip[1] - (T.GROUND - 0.5)) < 0.01, `${direction}, ${length}: the tip is at row ${tip[1].toFixed(2)}`);
      assert.ok(Math.abs(h.reach - 1) < 0.12, `${direction}, ${length}: the stick keeps its length (${h.reach.toFixed(2)})`);
      assert.ok(Math.abs(tip[0] - T.CX) > 5 && Math.abs(tip[0] - T.CX) < 12, `${direction}, ${length}: it stands beside the body (${tip[0].toFixed(1)})`);
      hands.push(h.y);
    }
    assert.ok(hands[2] < hands[1] - 2, `${direction}: a longer stick is held higher (${hands.map((v) => v.toFixed(1))})`);
  }
  const d = T.dims(), tall = T.pose('idle', 'down', 0, {}, d), bob = tall.bob;
  T.plantStick(tall, 'down', d, { length: 6 });
  assert.ok(tall.bob > bob, 'a stick too short for the hand bends the knees');
});

test('plantStick: in a walk the tip is in the air on frames 1 and 5 and down on frames 2, 3, 6 and 7, ahead of where it was lifted', () => {
  for (const direction of T.DIRECTIONS) {
    const d = T.dims(), tipAt = (f) => {
      const P = T.plantStick(T.pose('walk', direction, f / 8, { carry: 'low', stride: 0.15 }, d), direction, d, { action: 'walk', t: f / 8, length: 11 });
      const h = T.sockets(T.solve(direction, P, d), P, d).hand;
      return [h.x + Math.sin(h.angle) * 11 * h.reach, h.y + Math.cos(h.angle) * 11 * h.reach];
    };
    const rest = (f) => (direction === 'side' ? T.GROUND - 0.5 : null);
    for (const f of [1, 5]) assert.ok(tipAt(f)[1] < tipAt(f + 1)[1] - 0.9 || direction !== 'side', `${direction}: frame ${f} is lifted`);
    if (direction === 'side') {
      for (const f of [2, 3, 6, 7]) assert.ok(Math.abs(tipAt(f)[1] - rest(f)) < 0.01, `side: frame ${f} is down`);
      assert.ok(tipAt(2)[0] > tipAt(0)[0] + 3, 'it is planted ahead of where it was lifted');
      assert.ok(tipAt(3)[0] < tipAt(2)[0], 'and the body walks past it');
    } else {
      const ys = [0, 1, 2, 3].map((f) => tipAt(f)[1]);
      assert.ok(Math.max(...ys) - Math.min(...ys) >= 2, `${direction}: the tip travels up and down the screen (${ys.map((v) => v.toFixed(1))})`);
    }
    assert.deepEqual(tipAt(4).map((v) => v.toFixed(3)), tipAt(0).map((v) => v.toFixed(3)), `${direction}: it steps twice a cycle`);
  }
});

test('baldingHair: hair at the sides and round the back, the crown stays bare', () => {
  const hair = '#f0ead8';
  for (const direction of T.DIRECTIONS) {
    const { g, J, d } = part(direction, (g, J, P, d) => T.baldingHair(g, J, P, d, { colour: hair }));
    assert.ok(lit(g) >= 12, `${direction}: ${lit(g)} pixels of hair`);
    for (let x = 0; x < 48; x++) for (let y = 0; y < J.headTop + 2; y++) assert.equal(g.get(x, y), 0, `${direction}: nothing on the crown at ${x}, ${y}`);
    if (direction === 'down') for (const sg of [-1, 1]) {
      assert.ok(g.get(Math.floor(J.head[0]) + sg * 6, J.brow) !== 0, 'hair at each temple');
      assert.equal(g.get(Math.floor(J.head[0]) + sg * 3, J.brow + 1), 0, 'the eyes stay clear');
    }
    if (direction === 'up') assert.ok(g.get(Math.floor(J.head[0]), Math.round(J.head[1])) !== 0, 'a band across the back of the head');
    if (direction === 'side') assert.equal(g.get(Math.floor(J.head[0]) + 3, J.brow + 1), 0, 'the face stays clear');
    assert.ok(d.headW > 0);
  }
});

test('circlet: a band above the brow that is deeper at a big size, with a stone at the front and none behind', () => {
  const draw = (direction, size, gem = '#c8553a') => part(direction, (g, J, P, d) => T.circlet(g, J, P, d, { size, metal: '#f2c230', gem }));
  for (const direction of T.DIRECTIONS) {
    const small = draw(direction, 0.5), big = draw(direction, 1.8);
    assert.ok(lit(big.g) > lit(small.g) + 8, `${direction}: ${lit(small.g)} -> ${lit(big.g)}`);
    const b = small.g.bounds();
    assert.ok(b.y1 < small.J.brow && b.y0 >= small.J.brow - 3, `${direction}: it sits just above the brow`);
    assert.equal(count(big.g, '#c8553a') > 0, direction !== 'up', `${direction}: the stone`);
    assert.equal(count(draw(direction, 1, null).g, '#c8553a'), 0);
  }
});

test('turban: wider than the head, as tall as turbanRise says, bigger with its size, a jewel at the front only', () => {
  assert.ok(T.turbanRise(1.8) > T.turbanRise(1) && T.turbanRise(1) > T.turbanRise(0.5));
  const draw = (direction, size) => part(direction, (g, J, P, d) => T.turban(g, J, P, d, { size, colour: '#c8553a', jewel: '#f2c230' }));
  for (const direction of T.DIRECTIONS) {
    for (const size of [0.5, 1, 1.8]) {
      const { g, J, d } = draw(direction, size), b = g.bounds();
      assert.equal(b.y0, J.headTop - Math.round(T.turbanRise(size)), `${direction}, ${size}: its top`);
      if (direction !== 'side') assert.ok(b.x1 - b.x0 + 1 > d.headW, `${direction}, ${size}: ${b.x1 - b.x0 + 1} px across`);
      assert.equal(count(g, '#f2c230') > 0, direction !== 'up', `${direction}: the jewel`);
      assert.ok(count(g, ramp('#c8553a').dark) >= 4, `${direction}, ${size}: the lines of its folds`);
      if (direction === 'down') assert.equal(g.get(Math.floor(J.head[0]) - 3, J.brow + 1), 0, 'the eyes stay clear');
    }
    assert.ok(lit(draw(direction, 1.8).g) > lit(draw(direction, 0.5).g) + 20, `${direction}: bigger with size`);
  }
  assert.equal(count(part('down', (g, J, P, d) => T.turban(g, J, P, d, { jewel: null })).g, '#f2c230'), 0);
  assert.ok(count(part('down', (g, J, P, d) => T.turban(g, J, P, d, { band: '#3f6fd1' })).g, '#3f6fd1') >= 8, 'a band along its lower edge');
});

test('spectacles: two rings 9 px or more across facing down, one ring and its arm from the side, nothing from behind; the eyes stay', () => {
  const wire = '#5a5f7a';
  for (const head of [0, 0.5, 1]) {
    const d = T.dims({ head }), F = T.frame('idle_down', 0, { head });
    const g = body(F, { head(g, J, P, d2) { T.spectacles(g, J, P, d2, { frame: wire, lens: '#ffffff' }); } }), bare = body(F);
    const xs = [];
    for (let i = 0; i < g.data.length; i++) if (g.data[i] === col(wire)) xs.push(i % 48);
    const across = Math.max(...xs) - Math.min(...xs) + 1;
    assert.ok(across >= 9 && across <= d.headW, `head ${head}: ${across} px across a head of ${d.headW}`);
    assert.equal(count(g, INK), count(bare, INK), `head ${head}: both eyes are still there`);
    assert.equal(count(g, '#ffffff'), 2, 'a glint on each glass');
  }
  const side = part('side', (g, J, P, d) => T.spectacles(g, J, P, d, { frame: wire }));
  assert.ok(lit(side.g) >= 10);
  assert.equal(lit(part('up', (g, J, P, d) => T.spectacles(g, J, P, d, { frame: wire })).g), 0);
  const blink = T.frame('idle_down', 0.8, {});
  assert.ok(blink.P.blink);
  assert.equal(count(body(blink, { head(g, J, P, d) { T.spectacles(g, J, P, d, {}); } }), INK), count(body(blink), INK), 'a blink is not covered either');
});

test('neck: nothing while the head sits on the shoulders, a column of skin in shadow once it is carried high', () => {
  const skin = ramp('#f6d3b0');
  for (const direction of T.DIRECTIONS) {
    assert.equal(lit(part(direction, (g, J, P, d) => T.neck(g, J, P, d, { skin: '#f6d3b0' })).g), 0, `${direction}: no gap, no neck`);
    const { g, J, d } = part(direction, (g, J, P, d) => T.neck(g, J, P, d, { skin: '#f6d3b0' }), (P) => { P.headDy = -3; });
    const b = g.bounds();
    assert.equal(b.x1 - b.x0 + 1, 3, `${direction}: three pixels wide`);
    assert.ok(b.y0 <= J.headTop + d.headH && b.y1 >= J.shoulderY + d.chin - 1, `${direction}: from under the head to the collar`);
    assert.equal(count(g, skin.dark), lit(g), 'in the dark tone of the skin');
  }
});

test('apron: bib and skirt facing down, narrower than the body; a front edge from the side; only strings and a bow from behind', () => {
  const colour = '#c8553a', draw = (direction, opt = {}) => part(direction, (g, J, P, d) => T.apron(g, J, P, d, { colour, ...opt }));
  const down = draw('down'), b = down.g.bounds();
  assert.ok(lit(down.g) > 50, `down: ${lit(down.g)} pixels`);
  assert.ok(b.x1 - b.x0 + 1 < 2 * Math.floor(down.d.chestR) + 1, 'narrower than the chest, so the sleeves and the trousers show beside it');
  assert.ok(b.y0 >= down.J.shoulderY + down.d.chin && b.y1 <= down.J.gy - 4, 'from under the collar to above the boots');
  assert.ok(lit(draw('down', { length: 1 }).g) > lit(draw('down', { length: 0.3 }).g) + 15, 'length sets how far down it comes');
  const up = draw('up');
  assert.ok(lit(up.g) > 8 && lit(up.g) < 20, `up: ${lit(up.g)} pixels of strings`);
  const side = draw('side'), sb = side.g.bounds();
  assert.ok(lit(side.g) > 20 && sb.x1 > side.J.bx + 2, 'side: it hangs down the front');
});

test('travelPack: three kinds with outlines of their own, on the weapon hand\'s shoulder, never above the head, with a rug and a lantern when asked', () => {
  assert.deepEqual(T.TRAVEL_PACK_KINDS, ['backpack', 'crate', 'sack']);
  const draw = (direction, opt) => part(direction, (g, J, P, d) => T.travelPack(g, J, P, d, { colour: '#c9a06a', wood: '#9a6a3e', ...opt }));
  for (const direction of T.DIRECTIONS) {
    const masks = new Set();
    for (const kind of T.TRAVEL_PACK_KINDS) for (const size of [0.65, 1, 1.35]) {
      const { g, J } = draw(direction, { kind, size, rug: '#2f8f9d', lantern: '#f4e06a' }), b = g.bounds();
      assert.ok(lit(g) > 40, `${direction}, ${kind}, ${size}: ${lit(g)} pixels`);
      assert.ok(b.y0 >= J.headTop, `${direction}, ${kind}, ${size}: its top (${b.y0}) is not above the head (${J.headTop})`);
      assert.ok(b.y1 < Math.round(J.hip[1]) + 3, `${direction}, ${kind}: it ends at the hip (a backpack's frame two pixels below)`);
      assert.ok(b.x0 >= 2 && b.x1 <= 45, `${direction}, ${kind}, ${size}: inside the frame`);
      assert.ok(count(g, '#2f8f9d') > 3 && count(g, '#f4e06a') > 2, `${direction}, ${kind}: the rug and the lantern`);
      if (size === 1) masks.add(g.data.map((v) => (v ? 1 : 0)).join(''));
      if (direction !== 'side') {
        const mid = (b.x0 + b.x1) / 2;
        assert.ok(J.s * (mid - J.bx) > 1, `${direction}, ${kind}: over the shoulder of the weapon hand`);
      } else assert.ok(b.x1 < J.bx + 1, 'side: behind the body');
    }
    assert.equal(masks.size, 3, `${direction}: every kind has its own outline`);
    const plain = draw(direction, { kind: 'crate' });
    assert.equal(count(plain.g, '#2f8f9d') + count(plain.g, '#f4e06a'), 0, 'no rug or lantern unless asked');
    assert.ok(lit(draw(direction, { kind: 'sack', size: 1.35 }).g) > lit(draw(direction, { kind: 'sack', size: 0.65 }).g) + 20, `${direction}: bigger with size`);
    assert.equal(lit(draw(direction, { kind: 'trunk' }).g), 0, 'an unknown kind draws nothing');
  }
});

test('fingers: one to three fingers over the free hand, a pixel apart; none while the hand is closed', () => {
  for (const direction of ['down', 'side']) {
    const d = T.dims(), seen = [];
    for (let f = 0; f < 8; f++) {
      const P = T.gesture('count', direction, f / 8, {}, d), J = T.solve(direction, P, d), g = new Surface(...T.SIZE);
      T.fingers(g, J, P, d, { skin: '#f6d3b0' });
      const cols = new Set();
      for (let i = 0; i < g.data.length; i++) if (g.data[i]) cols.add(i % 48);
      seen.push(cols.size);
      if (cols.size) {
        const b = g.bounds(), xs = [...cols].sort((a, c) => a - c);
        assert.ok(b.y1 < Math.round(J.armB.hand[1]) - 1 + 1, `${direction}: above the fist`);
        for (let i = 1; i < xs.length; i++) assert.equal(xs[i] - xs[i - 1], 2, 'a pixel between two fingers');
      }
    }
    assert.deepEqual(seen, [1, 1, 2, 2, 3, 3, 0, 0], direction);
  }
  const { g } = part('down', (g, J, P, d) => T.fingers(g, J, P, d, { count: 9 }));
  const cols = new Set(); for (let i = 0; i < g.data.length; i++) if (g.data[i]) cols.add(i % 48);
  assert.equal(cols.size, 3, 'never more than three');
});

test('tradeItem: a purse and a scale hang from the hand at one table of sizes; the scale never hangs level; other kinds go to the kinds below', () => {
  assert.deepEqual(Object.keys(T.TRADE_ITEMS), ['purse', 'scale']);
  assert.deepEqual(T.tradeItemSize('purse', 1), { length: T.TRADE_ITEMS.purse.length, back: 0, pad: T.TRADE_ITEMS.purse.pad, hangs: true });
  assert.equal(T.tradeItemSize('scale', 1.35).length, T.TRADE_ITEMS.scale.length * 1.35);
  assert.deepEqual(T.tradeItemSize('sword', 1), T.itemSize('sword', 1));
  assert.deepEqual(T.tradeItemSize('wand', 1), T.smallItemSize('wand', 1));
  assert.equal(T.tradeItemSize('none'), null);
  const at = { x: 24.5, y: 20.5, angle: 0, reach: 1 };
  const draw = (kind, scale = 1, angle = 0, fn = T.tradeItem) => { const g = new Surface(...T.SIZE); fn(g, 'down', { ...at, angle }, { kind, length: (T.tradeItemSize(kind, scale) ?? { length: 8 }).length, metal: '#f2c230', wood: '#9a6a3e', hilt: '#f2c230' }); return g; };
  for (const kind of ['purse', 'scale']) {
    const g = draw(kind), b = g.bounds();
    assert.ok(lit(g) >= 16, `${kind}: ${lit(g)} pixels`);
    assert.ok(b.y0 >= 19 && b.y1 <= 20 + T.TRADE_ITEMS[kind].length + 1, `${kind}: it hangs below the hand, no longer than its length (${b.y0}..${b.y1})`);
    assert.ok(lit(draw(kind, 1.35)) > lit(draw(kind, 0.65)) + 5, `${kind}: bigger with size`);
    assert.ok(b.x1 - b.x0 + 1 <= 2 * T.TRADE_ITEMS[kind].pad + 3, `${kind}: no wider than its pad says`);
  }
  // the scale: one pan lower than the other, and they change places as it swings
  const pans = (g) => { const b = g.bounds(); let l = 0, r = 0; for (let y = b.y0; y <= b.y1; y++) { if (g.get(b.x0, y)) l = y; if (g.get(b.x1, y)) r = y; } return [l, r]; };
  const [l0, r0] = pans(draw('scale', 1, 0.1)), [l1, r1] = pans(draw('scale', 1, -0.1));
  assert.ok(r0 > l0 && l1 > r1, `swinging one way ${[l0, r0]}, the other ${[l1, r1]}`);
  assert.ok(same(draw('sword'), draw('sword', 1, 0, T.heldItem)), 'a standard kind is drawn by heldItem');
  assert.ok(differ(draw('purse'), draw('scale')) > 20);
});
