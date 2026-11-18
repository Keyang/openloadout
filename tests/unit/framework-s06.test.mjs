// Framework additions of batch S06 (crawler-bug, swarm-mite): the hive bug rig, rigs/hive-bug.js
//   chainIn, rimOn, capIn          shape tests: a jointed tapering chain, the rim of a shape where it lies on another, armour on a lump
//   clips                          the clip table, direction clips named as the top-down rigs name them
//   crawlerDims, crawlerPose       a segmented six-legged bug: its measurements and its poses
//   crawler                        one frame of a crawler in three directions, posed and fitted once: draw, finish, sockets
//   miteDims, mitePose, mite       the same for a tiny swarm bug with no directions
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import * as K from '../../rigs/creature-topdown.js';
import * as B from '../../rigs/hive-bug.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const colours = (g) => new Set([...g.data].filter(Boolean)).size;
const phases = (frames, loop) => Array.from({ length: frames }, (_, f) => (loop ? f / frames : f / (frames - 1)));
const LOOK = { body: '#ca9eda', accent: '#b04a8a', glow: '#9fe040', bone: '#f0ead8' };
const P0 = { size: 0.5, legs: 0.5, bounce: 0.5, stride: 0.5 };
/** One finished frame of a crawler. */
function crawlerShot(clip, t, p = P0, opt = {}, look = LOOK) {
  const g = new Surface(...B.SIZE), F = B.crawler(clip, t, p, opt);
  F.draw(g, look); F.finish(g, look);
  return { g, F };
}
/** One finished frame of a mite. */
function miteShot(clip, t, p = P0, opt = {}, look = { body: '#b04a8a', glow: '#9fe040', bone: '#f0ead8' }) {
  const g = new Surface(...B.MITE_SIZE), F = B.mite(clip, t, p, opt);
  F.draw(g, look); F.finish(g, look);
  return { g, F };
}
/** True when nothing is drawn on the outermost row or column. */
const inside = (g) => { const b = g.bounds(); return !!b && b.x0 >= 1 && b.y0 >= 1 && b.x1 <= g.w - 2 && b.y1 <= g.h - 2; };

// ---- shape tests --------------------------------------------------------------------------------------

test('chainIn: a chain runs through every point and tapers from its root to its tip', () => {
  const chain = B.chainIn([[4, 20], [12, 10], [22, 8]], 5, 1);
  for (const [x, y] of [[4, 20], [8, 15], [12, 10], [17, 9], [22, 8]]) assert.ok(chain(x, y), `the chain passes through ${x},${y}`);
  assert.ok(chain(4, 22) && !chain(22, 10), 'two pixels off the line is inside at the thick root and outside at the thin tip');
  assert.ok(!chain(20, 20), 'nothing far from the line');
  const g = new Surface(32, 32).fill(0, 0, 32, 32, B.chainIn([[6, 16], [26, 16]], 4), '#ffffff');
  assert.deepEqual(g.bounds(), { x0: 4, y0: 14, x1: 27, y1: 17 }, 'one width given: a bar of that thickness with round ends');
});

test('rimOn: the rim of a shape is drawn only where it lies on the other shape', () => {
  const tail = (px, py) => px >= 10 && px < 14 && py >= 4 && py < 28, back = (px, py) => py >= 12 && py < 20;
  const rim = B.rimOn(tail, back);
  assert.ok(rim(9.5, 15.5) && rim(14.5, 15.5), 'one pixel out on both sides, over the back');
  assert.ok(!rim(11.5, 15.5), 'never inside the shape itself');
  assert.ok(!rim(9.5, 6.5) && !rim(14.5, 24.5), 'none where the tail stands clear of the back');
  assert.ok(!rim(7.5, 15.5), 'one pixel wide');
});

test('capIn: armour covers a lump except a band on the side asked for', () => {
  const all = B.capIn(16, 16, 8, 6, 0, 1, 1), most = B.capIn(16, 16, 8, 6, 0, 1, 0.75), front = B.capIn(16, 16, 8, 6, 1, 0, 0.5);
  assert.ok(all(16, 21.5) && all(16, 10.5) && !all(16, 23), 'keep 1: the whole ellipse');
  assert.ok(most(16, 11) && most(16, 18.5) && !most(16, 20), 'keep 0.75: open along the bottom quarter');
  assert.ok(front(12, 16) && !front(20, 16), 'facing right, keep 0.5: only the back half is armoured');
  assert.ok(!B.capIn(16, 16, 8, 6, 0, 1, 0)(16, 12), 'keep 0: none');
});

// ---- clips --------------------------------------------------------------------------------------------

test('clips: the clip table is the top-down creature rig\'s, in the order given', () => {
  const c = B.clips((p) => p.speed, ['idle_down', 'walk*', { name: 'attack*', label: 'Bite' }, 'hurt', 'die']);
  assert.deepEqual(Object.keys(c), ['idle_down', 'walk_down', 'walk_up', 'walk_side', 'attack_down', 'attack_up', 'attack_side', 'hurt', 'die']);
  assert.equal(c.attack_side.label, 'Bite (side)');
  assert.deepEqual([c.walk_up.frames, c.walk_up.loop, c.attack_down.frames, c.hurt.frames, c.die.frames, c.die.loop], [8, true, 8, 4, 8, false]);
  const m = B.clips(() => 0.5, ['idle', { name: 'attack', frames: 6, label: 'Nip' }, { name: 'die', frames: 6, label: 'Pop' }]);
  assert.deepEqual([m.attack.frames, m.attack.label, m.die.frames, m.die.label], [6, 'Nip', 6, 'Pop']);
  assert.ok(c.walk_down.fps({ speed: 1 }) > c.walk_down.fps({ speed: 0 }), 'speed drives the frame rate');
});

// ---- the crawler --------------------------------------------------------------------------------------

test('crawlerDims: two, three or four segments on three pairs of legs that fan out from under the middle of the body', () => {
  const lens = B.LENGTHS.map((length) => B.crawlerDims({ length }));
  assert.deepEqual(lens.map((d) => d.B.segs.length), [2, 3, 4]);
  assert.ok(lens[0].B.len < lens[1].B.len && lens[1].B.len < lens[2].B.len, 'each is longer than the one before');
  const d = lens[1], Bd = d.B;
  assert.equal(Bd.pairs, 3);
  assert.ok(Bd.hips[0] > Bd.hips[1] && Bd.hips[1] > Bd.hips[2], 'hips run from front to back');
  assert.ok(Bd.feet[0] - Bd.feet[2] > (Bd.hips[0] - Bd.hips[2]) * 2 && Bd.feet[0] - Bd.feet[2] > Bd.len * 0.6, 'the feet fan out along most of the body, so each leg shows');
  assert.ok(Bd.spans[1] > Bd.spans[0] && Bd.spans[0] === Bd.spans[2], 'the middle pair stands furthest out');
  assert.ok(B.crawlerDims({ size: 1 }).B.len > B.crawlerDims({ size: 0 }).B.len, 'size scales it');
  const short = B.crawlerDims({ legs: 0 }).B, long = B.crawlerDims({ legs: 1 }).B;
  assert.ok(long.span > short.span + 2 && long.rise > short.rise && long.knee > short.knee, 'long legs stand wider, carry the body higher and arch higher');
  assert.ok(B.crawlerDims({ direction: 'side' }).B.span < Bd.span * 0.5, 'seen from the side the feet stand close under the body: a profile');
  assert.equal(B.crawlerDims({ length: 'endless' }).length, 'medium', 'an unknown length falls back on medium');
});

test('crawlerPose: the walk is two alternating groups of three, the bite steps into its lunge, the death goes over once', () => {
  const d = B.crawlerDims();
  // feet: the right side front to back, then the left side: one group is right-front, right-back and left-middle
  const group = (i) => (i < 3 ? i % 2 : (i - 3 + 1) % 2);
  const at = B.crawlerPose('walk', 0.7, P0, d);          // one group in the air, the other on the floor
  const lifted = at.feet.map((f) => f.y > 0.3);
  for (let i = 0; i < 6; i++) assert.equal(lifted[i], lifted[0] === (group(i) === group(0)), `foot ${i} moves with its group`);
  assert.equal(lifted.filter(Boolean).length, 3, 'three feet at a time');
  assert.ok(Math.max(...phases(8, true).flatMap((t) => B.crawlerPose('walk', t, P0, d).bend.map(Math.abs))) > 0.6, 'the body snakes as it walks');
  assert.equal(B.crawlerPose('walk', 0.3, P0, d).bend[0], 0, 'from the tail: the head leads straight');
  const rest = B.crawlerPose('attack', 0, P0, d), wind = B.crawlerPose('attack', 2 / 7, P0, d), hit = B.crawlerPose('attack', 4 / 7, P0, d), end = B.crawlerPose('attack', 1, P0, d);
  assert.ok(wind.x < -1.5 && hit.x > 5, 'it draws back, then lunges');
  assert.ok(hit.open > 0.9 && B.crawlerPose('attack', 5 / 7, P0, d).open < 0.1, 'jaws wide on the lunge, shut right after it');
  assert.ok(hit.feet.every((f) => f.x > 0.5) && hit.feet[0].x > hit.feet[2].x, 'every foot steps into the lunge, the front pair furthest');
  assert.ok(Math.abs(rest.x) < 0.01 && Math.abs(end.x) < 0.01, 'it starts and ends at rest');
  assert.ok(hit.whip > 0.9, 'a tail whips forward with the bite');
  const rolls = phases(8, false).map((t) => B.crawlerPose('die', t, P0, d).roll);
  for (let i = 1; i < rolls.length; i++) assert.ok(rolls[i] >= rolls[i - 1], 'the death turns one way only');
  assert.deepEqual(rolls.slice(4), [1, 1, 1, 1], 'and it lies on its back from frame 4');
  const last = B.crawlerPose('die', 1, P0, d);
  assert.ok(last.curl > 0.99 && last.lift === 0, 'settled, legs curled in');
  assert.ok(B.crawlerPose('die', 0, P0, d).flash && B.crawlerPose('hurt', 0, P0, d).flash, 'hurt and die start on the white frame');
});

test('crawler: every clip in every direction, at the smallest and the biggest look with every part, stays inside the frame and is never empty', () => {
  const table = B.clips(() => 0.5, ['idle_down', 'walk*', 'attack*', 'hurt', 'die']);
  const looks = [
    [P0, {}],
    [{ size: 0, legs: 0, bounce: 0, stride: 0 }, { length: 'short', horns: { kind: 'none' }, tail: { kind: 'none' } }],
    [{ size: 1, legs: 1, bounce: 1, stride: 1 }, { length: 'long', spikes: true, horns: { kind: 'pincers', length: 1.35 }, tail: { kind: 'stinger', length: 1.35 } }],
    [{ size: 1, legs: 1, bounce: 1, stride: 1 }, { length: 'long', spikes: true, horns: { kind: 'tusks', length: 1.35 }, tail: { kind: 'club', length: 1.35 } }],
  ];
  for (const [p, opt] of looks) for (const [clip, c] of Object.entries(table)) for (const t of phases(c.frames, c.loop)) {
    const { g } = crawlerShot(clip, t, p, opt);
    assert.ok(lit(g) > 60, `${clip} at ${t}: something is drawn`);
    assert.ok(inside(g), `${clip} at ${t.toFixed(2)} (${opt.length ?? 'medium'}): inside the frame, got ${JSON.stringify(g.bounds())}`);
  }
});

test('crawler: the three directions are one bug, standing on the ground line, the same on both sides when it faces the camera', () => {
  const down = crawlerShot('idle_down', 0).g, up = crawlerShot('walk_up', 0.125).g, side = crawlerShot('walk_side', 0.125).g;
  const bd = down.bounds(), bs = side.bounds(), bu = up.bounds();
  assert.ok(Math.abs(bd.y1 - B.GROUND) <= 2 && Math.abs(bs.y1 - B.GROUND) <= 2 && Math.abs(bu.y1 - B.GROUND) <= 2, 'the lowest pixel is within two of the ground line in every direction');
  assert.ok(bs.x1 - bs.x0 > bs.y1 - bs.y0, 'from the side it is longer than tall');
  assert.equal((bd.x0 + bd.x1) / 2, B.PIVOT[0], 'facing the camera it is centred on the pivot column');
  // mirror test: the resting pose facing the camera is the same picture flipped left to right, but for the light (shading and glints)
  const g = new Surface(...B.SIZE), F = B.crawler('rest_down', 0, P0, { horns: { kind: 'pincers', length: 1 } });
  F.draw(g, LOOK); g.outline(INK);
  let odd = 0;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (!!g.get(x, y) !== !!g.get(2 * B.PIVOT[0] - x, y)) odd++;
  assert.equal(odd, 0, 'the silhouette is symmetric');
  // the lit eyes show from the front and the side, never from behind
  const glow = col(LOOK.glow), has = (s) => [...s.data].includes(glow);
  assert.ok(has(down) && has(side) && !has(up), 'eyes: front and side, not from behind');
});

test('crawler: parts change the picture in every direction, and none of them leaves anything behind', () => {
  for (const clip of ['idle_down', 'walk_up', 'walk_side']) {
    const bare = crawlerShot(clip, 0, P0, { horns: { kind: 'none' }, tail: { kind: 'none' } }).g;
    assert.equal(diff(bare, crawlerShot(clip, 0, P0, {}).g), 0, `${clip}: no parts asked for is the bare bug`);
    for (const kind of B.HORNS) assert.ok(diff(bare, crawlerShot(clip, 0, P0, { horns: { kind, length: 1 } }).g) > 8, `${clip}: ${kind} show`);
    for (const kind of B.TAILS) {
      const tailed = crawlerShot(clip, 0, P0, { tail: { kind, length: 1 } }).g;
      assert.ok(diff(bare, tailed) > 12, `${clip}: a ${kind} shows`);
      assert.ok(diff(tailed, crawlerShot(clip, 0, P0, { tail: { kind, length: 1.35 } }).g) > 4, `${clip}: a longer ${kind} is longer`);
    }
    assert.ok(diff(bare, crawlerShot(clip, 0, P0, { spikes: true }).g) > 8, `${clip}: back spikes show`);
    assert.ok(diff(crawlerShot(clip, 0, P0, { horns: { kind: 'pincers', length: 1 } }).g, crawlerShot(clip, 0, P0, { horns: { kind: 'tusks', length: 1 } }).g) > 8, `${clip}: pincers and tusks differ`);
  }
});

test('crawler: sockets follow the body, and the head socket faces the way the bug does', () => {
  const side = B.crawler('walk_side', 0, P0, {}).sockets(), down = B.crawler('idle_down', 0, P0, {}).sockets(), up = B.crawler('walk_up', 0, P0, {}).sockets();
  assert.deepEqual(Object.keys(side), ['head', 'back', 'tail', 'feet']);
  assert.deepEqual([side.head.angle, down.head.angle, up.head.angle], [PI / 2, 0, PI]);
  assert.ok(side.head.x > side.back.x && side.back.x > side.tail.x, 'side: head in front of the tail');
  assert.ok(down.head.y > down.tail.y && up.head.y < up.tail.y, 'down: the head is lowest; up: the tail is');
  assert.deepEqual([side.feet.y, down.feet.y], [B.GROUND, B.GROUND]);
  const rest = B.crawler('attack_side', 0, P0, {}).sockets().head, hit = B.crawler('attack_side', 4 / 7, P0, {}).sockets().head;
  assert.ok(hit.x - rest.x >= 4, `the bite carries the head socket forward (${(hit.x - rest.x).toFixed(1)} px)`);
});

test('crawler: the death ends belly up with the legs folded over it, and draws no lit eyes on the white frame', () => {
  const first = crawlerShot('die', 0).g, last = crawlerShot('die', 1).g, before = crawlerShot('die', 6 / 7).g;
  assert.equal(colours(first), 2, 'frame 0 is white inside its outline');
  assert.ok(lit(last) > 150 && inside(last), 'the last frame is the body');
  assert.ok(diff(last, before) > 4, 'the legs are still curling in on the frame before');
  const shell = col(LOOK.body), n = (g) => [...g.data].filter((v) => v === shell).length;
  assert.ok(n(last) < n(crawlerShot('idle_down', 0).g) * 0.6, 'on its back, little of the shell shows: only its rim');
  assert.equal(B.crawler('die', 1, P0, { spikes: true }).S.spikes.length, 0, 'the back spikes are underneath');
});

// ---- the mite -----------------------------------------------------------------------------------------

test('miteDims: four, six or eight legs fan out round one small body', () => {
  assert.deepEqual(B.MITE_LEGS.map((legs) => B.miteDims({ legs }).pairs), [2, 3, 4]);
  assert.deepEqual(B.MITE_SHAPES.map((shape) => B.miteDims({ shape }).B.segs.length), [1, 2, 1]);
  const d = B.miteDims({ legs: 'eight' }), Bd = d.B;
  assert.ok(Bd.feet[0] - Bd.feet[3] > Bd.hips[0] - Bd.hips[3] + 4, 'the feet stand further apart than the hips: a fan');
  for (const size of [0, 0.5, 1]) { const w = B.miteDims({ size }).B.wide; assert.ok(w >= 10 && w <= 18, `body ${w.toFixed(1)} px across at size ${size}`); }
  assert.equal(B.miteDims({ shape: 'square', legs: 'ten' }).shape, 'round', 'unknown choices fall back');
});

test('mitePose: the skitter jolts and tilts both ways, the nip hops and snaps, the pop bursts on frame 3 of 6', () => {
  const d = B.miteDims(), walk = phases(8, true).map((t) => B.mitePose('walk', t, P0, d));
  assert.ok(Math.max(...walk.map((P) => P.tilt)) > 0.15 && Math.min(...walk.map((P) => P.tilt)) < -0.15, 'it tilts left and right');
  const drops = walk.map((P) => P.drop);
  for (let i = 1; i < 8; i++) assert.ok(Math.abs(drops[i] - drops[i - 1]) > 0.5, 'the body jolts on every frame');
  const nip = phases(6, false).map((t) => B.mitePose('attack', t, P0, d));
  assert.ok(nip[2].lift > 2 && nip[2].open > 0.9 && nip[3].lift === 0 && nip[3].open < 0.1, 'the hop with fangs wide on frame 2, landed and shut on frame 3');
  assert.ok(Math.abs(nip[0].x) < 0.01 && Math.abs(nip[5].x) < 0.01 && nip[5].lift === 0, 'starts and ends at rest');
  const pop = phases(6, false).map((t) => B.mitePose('die', t, P0, d));
  assert.ok(pop[0].flash && !pop[1].flash, 'white on frame 0');
  assert.deepEqual(pop.map((P) => P.burst >= 0), [false, false, false, true, true, true]);
  assert.ok(pop[1].swell > 1.05 && pop[2].swell > pop[1].swell, 'it swells for two frames first');
  assert.equal(pop[5].burst, 1);
});

test('mite: every clip of every shape, leg count and eye style, small and big, stays inside the frame and is never empty', () => {
  const table = B.clips(() => 0.5, ['idle', 'walk', { name: 'attack', frames: 6 }, 'hurt', { name: 'die', frames: 6 }]);
  for (const shape of B.MITE_SHAPES) for (const legs of B.MITE_LEGS) for (const eyes of B.MITE_EYES) for (const size of [0, 1]) {
    for (const [clip, c] of Object.entries(table)) for (const t of phases(c.frames, c.loop)) {
      const { g } = miteShot(clip, t, { size, bounce: size }, { shape, legs, eyes });
      assert.ok(lit(g) >= 12, `${clip} at ${t} (${shape}, ${legs}, ${eyes}): something is drawn`);
      assert.ok(inside(g), `${clip} at ${t.toFixed(2)} (${shape}, ${legs}, ${eyes}, size ${size}): inside the frame, got ${JSON.stringify(g.bounds())}`);
    }
  }
});

test('mite: 16 to 21 px across with its legs, on its ground line, in at most eight colours a clip', () => {
  const table = B.clips(() => 0.5, ['idle', 'walk', { name: 'attack', frames: 6 }, 'hurt', { name: 'die', frames: 6 }]);
  for (const shape of B.MITE_SHAPES) {
    const b = miteShot('idle', 0, P0, { shape }).g.bounds(), across = b.x1 - b.x0 + 1;
    assert.ok(across >= 16 && across <= 21, `${shape}: ${across} px across`);
    assert.ok(Math.abs(b.y1 - B.MITE_GROUND) <= 2, `${shape}: stands on the ground line`);
    assert.equal((b.x0 + b.x1) / 2, B.MITE_PIVOT[0], `${shape}: centred on the pivot column`);
  }
  for (const eyes of B.MITE_EYES) for (const [clip, c] of Object.entries(table)) {
    const seen = new Set();
    for (const t of phases(c.frames, c.loop)) for (const v of miteShot(clip, t, P0, { eyes }).g.data) if (v) seen.add(v);
    assert.ok(seen.size <= 8, `${clip} with ${eyes} eyes: ${seen.size} colours`);
  }
});

test('mite: every choice changes the picture, and the pop leaves a puddle whatever they are', () => {
  const base = miteShot('idle', 0).g;
  for (const shape of ['long', 'spiky']) assert.ok(diff(base, miteShot('idle', 0, P0, { shape }).g) > 12, `${shape} differs from round`);
  for (const legs of ['four', 'eight']) assert.ok(diff(base, miteShot('idle', 0, P0, { legs }).g) > 6, `${legs} legs differ from six`);
  for (const eyes of ['one', 'many']) assert.ok(diff(base, miteShot('idle', 0, P0, { eyes }).g) > 6, `${eyes} differs from two eyes`);
  const glow = col('#9fe040');
  assert.ok([...base.data].includes(glow) && ![...miteShot('hurt', 0).g.data].includes(glow), 'lit eyes, but not on the white frame');
  const end = miteShot('die', 1).g;
  assert.ok(lit(end) >= 20 && [...end.data].includes(glow), 'the last frame is a puddle of what was inside it');
  const other = miteShot('die', 1, { size: 1, bounce: 1 }, { shape: 'spiky', legs: 'eight', eyes: 'one' }).g;
  assert.ok(lit(other) >= 20 && [...other.data].includes(glow), 'whatever the mite looked like');
  assert.equal(end.bounds().y1, other.bounds().y1, 'and it lies on the same floor line');
  const burst = miteShot('die', 0.6).g;
  assert.ok(lit(burst) > lit(end) && [...burst.data].includes(col('#ffffff')), 'it bursts in a star with a white middle');
});

test('the hive bug rig stands on the top-down creature rig: same directions, same poses', () => {
  assert.deepEqual(B.POSES, K.POSES);
  assert.deepEqual([B.SIZE, B.PIVOT, B.MITE_SIZE, B.MITE_PIVOT], [[48, 48], [24, 40], [32, 32], [16, 28]]);
  assert.equal(B.crawler('walk_side', 0, P0, {}).direction, 'side');
  assert.equal(B.crawler('hurt', 0, P0, {}).direction, 'down', 'a clip with no direction is drawn facing down');
});
