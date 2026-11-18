// Playground: the scene itself. The player walks, jumps, collects and hits; creatures move by themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, resetWorld, spawn, removeOne, countOf, snapshot, activeLoops } from '../../app/play/world.js';
import { makeLevel, isWall } from '../../app/play/level.js';
import { makeKind, buildKind } from '../../app/play/kinds.js';
import { walker } from '../fixtures/play/index.js';
import { rowFromSprite } from '../../app/play/roles.js';

const DT = 1 / 60;
const box = { l: 6, r: 6, t: 24, b: 0 };
const hero = (over = {}) => makeKind({
  key: 'hero', id: 'hero', role: 'player', box,
  clips: { idle: { frames: 4, fps: 8 }, walk: { frames: 8, fps: 10 }, run: { frames: 8, fps: 14 }, jump: { frames: 8, fps: 11, loop: false }, attack: { frames: 8, fps: 13, loop: false }, hurt: { frames: 4, fps: 9, loop: false } },
  cues: { walk: [{ sound: 'step', frame: 0 }, { sound: 'step', frame: 4 }], jump: [{ sound: 'jump', frame: 2 }, { sound: 'step', frame: 6 }], attack: [{ sound: 'slash', frame: 3 }], hurt: [{ sound: 'ouch', frame: 0 }] },
  ...over,
});
const slime = (over = {}) => makeKind({
  key: 'slime', id: 'slime', role: 'creature', box: { l: 8, r: 8, t: 12, b: 0 },
  clips: { idle: { frames: 8, fps: 8 }, hop: { frames: 8, fps: 11 }, attack: { frames: 8, fps: 13, loop: false }, hurt: { frames: 4, fps: 9, loop: false } },
  cues: { hurt: [{ sound: 'thud', frame: 0 }], attack: [{ sound: 'swipe', frame: 3 }] },
  ...over,
});
const coin = (over = {}) => makeKind({
  key: 'coin', id: 'coin', role: 'pickup', box: { l: 6, r: 6, t: 12, b: 0 },
  clips: { spin: { frames: 8, fps: 10 }, collect: { frames: 6, fps: 14, loop: false } },
  cues: { collect: [{ sound: 'ding', frame: 1 }] },
  ...over,
});
const fire = () => makeKind({ key: 'fire', id: 'fire', role: 'prop', box: { l: 8, r: 8, t: 16, b: 0 }, clips: { burn: { frames: 6, fps: 10 }, ignite: { frames: 6, fps: 10, loop: false } }, cues: { burn: [{ sound: 'crackle', frame: 0, loop: true }] } });

const sideWorld = (kinds, opts = {}) => createWorld({ mode: 'side', level: makeLevel('side'), kinds, player: 'hero', ...opts });
function run(world, input, seconds) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) events.push(...step(world, input, DT));
  return events;
}
const sounds = (events) => events.filter((e) => e.type === 'sound').map((e) => e.sound);
const first = (world, key) => world.things.find((t) => t.kind === key);

test('the scene starts with the player on the ground and one or more of everything else', () => {
  const w = sideWorld([hero(), slime(), coin(), fire()]);
  assert.equal(w.player.kind, 'hero');
  assert.equal(w.player.y, w.level.groundY);
  assert.equal(w.player.onGround, true);
  assert.equal(countOf(w, 'slime'), 1);
  assert.ok(countOf(w, 'coin') >= 2, 'several of each pickup');
  assert.equal(countOf(w, 'fire'), 1);
  assert.equal(w.collected, 0);
  run(w, {}, 0.1);
  assert.equal(w.player.anim.clip, 'idle');
});

test('holding right walks right on the walk clip; letting go stands still', () => {
  const w = sideWorld([hero()]);
  const x0 = w.player.x;
  const ev = run(w, { right: true }, 1);
  assert.ok(w.player.x > x0 + 15, `moved ${w.player.x - x0}`);
  assert.equal(w.player.state, 'walk');
  assert.equal(w.player.anim.clip, 'walk');
  assert.equal(w.player.anim.flip, false);
  assert.ok(sounds(ev).includes('step'), 'footsteps fire on their frames');
  run(w, {}, 0.1);
  assert.equal(w.player.anim.clip, 'idle');
  const x1 = w.player.x;
  run(w, { left: true }, 0.5);
  assert.ok(w.player.x < x1);
  assert.equal(w.player.anim.flip, true, 'mirrored when it faces left');
  const walked = w.player.x;
  run(w, { left: true, run: true }, 0.5);
  assert.equal(w.player.anim.clip, 'run');
  assert.ok(walked - w.player.x > x1 - walked, 'running covers more ground');
});

test('the player cannot leave the scene', () => {
  const w = sideWorld([hero()]);
  run(w, { left: true, run: true }, 5);
  assert.ok(w.player.x >= 0);
  w.player.x = w.level.width - 2;
  run(w, { right: true, run: true }, 2);
  assert.ok(w.player.x <= w.level.width);
});

test('the jump key leaves the ground and gravity brings the player back', () => {
  const w = sideWorld([hero()]);
  const ground = w.player.y;
  const up = run(w, { jump: true }, 0.2);
  assert.equal(w.player.onGround, false);
  assert.ok(w.player.y < ground - 10);
  assert.equal(w.player.state, 'jump');
  assert.equal(w.player.anim.clip, 'jump');
  const down = run(w, { jump: true }, 1.5);          // still held: no second jump while in the air, one more after landing at most
  run(w, {}, 1.5);
  assert.equal(w.player.onGround, true);
  assert.equal(w.player.y, ground);
  const all = sounds([...up, ...down]);
  assert.ok(all.includes('jump'));
  const w2 = sideWorld([hero()]);
  const ev = [...run(w2, { jump: true }, 0.05), ...run(w2, {}, 2)];
  assert.deepEqual(sounds(ev), ['jump', 'step'], 'one jump: its sounds fire once each, the landing step included');
});

test('the player can land on a thin platform and walk off it', () => {
  const w = sideWorld([hero()]);
  const p = w.level.thins[0];
  w.player.x = (p.x0 + p.x1) / 2;
  w.player.y = p.y - 30; w.player.onGround = false;
  run(w, {}, 1);
  assert.equal(w.player.y, p.y);
  assert.equal(w.player.onGround, true);
  w.player.x = p.x1 - 1;
  const ev = run(w, { right: true }, 2.5);
  assert.equal(w.player.y, w.level.groundY, 'walked off the end and fell to the ground');
  assert.ok(!sounds(ev).includes('jump'), 'falling is not jumping: the take-off sound stays quiet');
  // from underneath, a thin platform is jumped up through
  const w2 = sideWorld([hero()]);
  w2.player.x = (p.x0 + p.x1) / 2;
  step(w2, { jump: true }, DT);
  let top = w2.player.y;
  for (let i = 0; i < 120; i++) { step(w2, {}, DT); top = Math.min(top, w2.player.y); }
  assert.ok(top < p.y, 'it rose past the platform');
  assert.equal(w2.player.y, p.y, 'and came down on top of it');
});

test('the step is a wall to walk into and a ledge to jump onto', () => {
  const w = sideWorld([hero()]);
  const wall = 12 * 32;                               // the step starts here and is two tiles high
  w.player.x = wall - 40;
  run(w, { right: true, run: true }, 2);
  assert.ok(w.player.x < wall, `stopped at the wall (x ${w.player.x})`);
  assert.equal(w.player.y, w.level.groundY);
  step(w, { right: true, run: true, jump: true }, DT);
  run(w, { right: true, run: true }, 1.1);
  assert.equal(w.player.y, w.level.groundY - 64, 'jumped up onto it');
  assert.ok(w.player.x > wall);
});

test('slopes are walked up and down', () => {
  const w = createWorld({ mode: 'side', level: makeLevel('side', { slopes: true }), kinds: [hero()], player: 'hero' });
  w.player.x = 7 * 32 - 10;
  const heights = new Set();
  for (let i = 0; i < 60 * 6 && w.player.x < 11 * 32 + 10; i++) { step(w, { right: true, run: true }, DT); heights.add(Math.round(w.player.y)); assert.equal(w.player.onGround, true, 'it never leaves the ground'); }
  assert.ok(w.player.x >= 11 * 32, 'it crossed the mound');
  assert.equal(Math.min(...heights), w.level.groundY - 32, 'over the top');
  assert.ok(heights.size > 10, 'step by step, not in one jump');
  assert.equal(w.player.y, w.level.groundY);
});

test('walking into a pickup collects it: the counter goes up, its collect clip and sound play, then it is gone', () => {
  const w = sideWorld([hero(), coin()]);
  const c = first(w, 'coin');
  const others = w.things.filter((t) => t !== c);
  for (const o of others) o.x = -9999;               // keep the other coins out of the way
  c.x = w.player.x + 40; c.y = w.level.groundY;
  const ev = run(w, { right: true, run: true }, 1.2);
  assert.equal(w.collected, 1);
  assert.deepEqual(ev.filter((e) => e.type === 'collect').map((e) => e.kind), ['coin']);
  assert.deepEqual(sounds(ev).filter((s) => s === 'ding'), ['ding'], 'the collect sound fires exactly once');
  assert.ok(['collected', 'gone'].includes(c.state));
  run(w, {}, 1);
  assert.equal(c.state, 'gone');
  assert.equal(snapshot(w).things.filter((t) => t.kind === 'coin' && t.state !== 'gone').length, countOf(w, 'coin') - 1);
  run(w, {}, 8);
  assert.equal(c.state, 'rest', 'it comes back after a while so the scene never runs dry');
  assert.equal(w.collected, 1);
});

test('a pickup with no collect clip just disappears and still counts', () => {
  const w = sideWorld([hero(), coin({ clips: { spin: { frames: 8, fps: 10 } }, cues: {} })]);
  const c = first(w, 'coin');
  c.x = w.player.x + 4; c.y = w.level.groundY;
  run(w, {}, 0.1);
  assert.equal(w.collected >= 1, true);
  assert.equal(c.state, 'gone');
});

test('the action key near an enemy hurts it: its hurt clip and sound play', () => {
  const w = sideWorld([hero(), slime()]);
  const s = first(w, 'slime');
  s.x = w.player.x + 22; s.y = w.level.groundY; s.home.x = s.x;
  const ev = [...run(w, { action: true }, 0.1), ...run(w, {}, 0.6)];
  assert.equal(w.player.anim.clip === 'attack' || ev.some((e) => e.type === 'sound' && e.sound === 'slash'), true);
  assert.equal(s.hits, 1);
  assert.deepEqual(ev.filter((e) => e.type === 'hit').map((e) => e.kind), ['slime']);
  assert.deepEqual(sounds(ev).filter((x) => x === 'thud'), ['thud']);
  assert.deepEqual(sounds(ev).filter((x) => x === 'slash'), ['slash'], 'the swing sounds once');
  const s2w = sideWorld([hero(), slime()]);
  const far = first(s2w, 'slime');
  far.x = s2w.player.x + 200; far.home.x = far.x;
  run(s2w, { action: true }, 0.1); run(s2w, {}, 0.6);
  assert.equal(far.hits, 0, 'out of reach');
});

test('while it is hurt an enemy plays its hurt clip, then carries on', () => {
  const w = sideWorld([hero(), slime()]);
  const s = first(w, 'slime');
  s.x = w.player.x + 22; s.home.x = s.x;
  let sawHurt = false;
  step(w, { action: true }, DT);
  for (let i = 0; i < 60; i++) { step(w, {}, DT); if (s.state === 'hurt' && s.anim.clip === 'hurt') sawHurt = true; }
  assert.ok(sawHurt);
  run(w, {}, 2);
  assert.notEqual(s.state, 'hurt');
});

test('holding the action key swings once; an enemy facing away is not hit', () => {
  const w = sideWorld([hero(), slime()]);
  const s = first(w, 'slime');
  s.x = w.player.x - 22; s.home.x = s.x;             // behind the player, who faces right
  const ev = run(w, { action: true }, 1.5);
  assert.equal(s.hits, 0);
  assert.deepEqual(sounds(ev).filter((x) => x === 'slash'), ['slash']);
});

test('creatures move by themselves on their own clips', () => {
  const w = createWorld({ mode: 'side', level: makeLevel('side'), kinds: [slime()], player: null });
  assert.equal(w.player, null);
  const s = first(w, 'slime');
  const x0 = s.x;
  const clips = new Set();
  let moved = 0;
  for (let i = 0; i < 600; i++) { step(w, {}, DT); clips.add(s.anim.clip); moved = Math.max(moved, Math.abs(s.x - x0)); }
  assert.ok(moved > 8, 'it wandered');
  assert.ok(clips.has('hop'), 'moving uses its move clip');
  assert.ok(clips.has('idle'), 'and it rests on idle');
  assert.ok(Math.abs(s.x - s.home.x) < 80, 'it stays near where it was put');
});

test('an enemy next to the player attacks, and the player plays its hurt clip', () => {
  const w = sideWorld([hero(), slime()]);
  const s = first(w, 'slime');
  s.x = w.player.x + 16; s.home.x = s.x;
  const ev = run(w, {}, 3);
  assert.ok(sounds(ev).includes('swipe'), 'the enemy attack clip played');
  assert.ok(ev.some((e) => e.type === 'hurt'));
  assert.ok(sounds(ev).includes('ouch'));
  const calm = sideWorld([hero(), slime({ hostile: false })]);
  const a = first(calm, 'slime');
  a.x = calm.player.x + 16; a.home.x = a.x;
  assert.equal(run(calm, {}, 3).some((e) => e.type === 'hurt'), false, 'an animal leaves the player alone');
});

test('add one, remove one and reset', () => {
  const w = sideWorld([hero(), slime(), coin()]);
  const n = countOf(w, 'slime');
  const t = spawn(w, 'slime');
  assert.ok(t && t.kind === 'slime');
  assert.equal(countOf(w, 'slime'), n + 1);
  assert.equal(removeOne(w, 'slime'), true);
  assert.equal(removeOne(w, 'slime'), true);
  assert.equal(countOf(w, 'slime'), n - 1);
  assert.equal(removeOne(w, 'slime'), false, 'nothing left to remove');
  assert.equal(spawn(w, 'hero'), null, 'the player is not something to add more of');
  run(w, { right: true, run: true }, 3);
  resetWorld(w);
  assert.equal(countOf(w, 'slime'), n);
  assert.equal(w.collected, 0);
  assert.equal(w.player.x, w.level.start.x);
});

test('an enemy hit enough times plays its die clip, holds it, and is removed', () => {
  const dying = slime({ clips: { idle: { frames: 8, fps: 8 }, hop: { frames: 8, fps: 11 }, hurt: { frames: 4, fps: 9, loop: false }, die: { frames: 8, fps: 10, loop: false } }, cues: { die: [{ sound: 'splat', frame: 0 }] }, hostile: false });
  const w = sideWorld([hero(), dying]);
  const s = first(w, 'slime');
  const all = [];
  for (let hit = 0; hit < 3; hit++) {
    s.x = w.player.x + 22; s.home.x = s.x;
    all.push(...run(w, { action: true }, 0.1), ...run(w, {}, 0.9));
    if (hit < 2) assert.notEqual(s.state, 'dying', `still alive after ${hit + 1}`);
  }
  assert.equal(s.hits, 3);
  assert.deepEqual(all.filter((e) => e.type === 'die').map((e) => e.kind), ['slime']);
  assert.deepEqual(sounds(all).filter((x) => x === 'splat'), ['splat']);
  assert.equal(s.state, 'dying');
  assert.equal(s.anim.clip, 'die');
  assert.equal(s.anim.frame, 7, 'its last frame is held');
  run(w, {}, 2);
  assert.equal(countOf(w, 'slime'), 0, 'then it is gone');
  const boss = sideWorld([hero(), slime({ hp: 8, hostile: false })]);
  const b = first(boss, 'slime');
  for (let hit = 0; hit < 4; hit++) { b.x = boss.player.x + 22; b.home.x = b.x; run(boss, { action: true }, 0.1); run(boss, {}, 0.9); }
  assert.equal(countOf(boss, 'slime'), 1, 'a boss takes more');
});

test('the player has health: hurt enough, it plays die and starts again', () => {
  const mortal = hero({ clips: { idle: { frames: 4, fps: 8 }, walk: { frames: 8, fps: 10 }, attack: { frames: 8, fps: 13, loop: false }, hurt: { frames: 4, fps: 9, loop: false }, die: { frames: 8, fps: 10, loop: false } }, cues: {} });
  const w = sideWorld([mortal, slime()]);
  assert.equal(w.player.hp, 3);
  const s = first(w, 'slime');
  w.player.x = 300; s.x = 316; s.home.x = 316;
  let died = false, sawDie = false;
  for (let i = 0; i < 60 * 14 && !died; i++) {
    const ev = step(w, {}, DT);
    s.x = w.player.x + 16;                               // it keeps after the player
    if (w.player.anim.clip === 'die') sawDie = true;
    if (sawDie && w.player.state !== 'die') died = true;
    if (ev.some((e) => e.type === 'die')) assert.equal(w.player.hp, 0);
  }
  assert.ok(sawDie, 'the die clip played');
  assert.ok(died, 'and then it was back');
  assert.equal(w.player.hp, 3);
  assert.equal(w.player.x, w.level.start.x);
});

test('block and dodge keep the player safe; a dodge is a dash', () => {
  const clips = { idle: { frames: 4, fps: 8 }, walk: { frames: 8, fps: 10 }, block: { frames: 6, fps: 10, loop: false }, dodge: { frames: 8, fps: 14, loop: false }, hurt: { frames: 4, fps: 9, loop: false } };
  const w = sideWorld([hero({ clips, cues: { block: [{ sound: 'clang', frame: 1 }] } }), slime()]);
  const s = first(w, 'slime');
  s.x = w.player.x + 16; s.home.x = s.x;
  const ev = [];
  for (let i = 0; i < 60 * 3; i++) ev.push(...step(w, { block: i % 30 < 15 }, DT));      // block again and again
  assert.ok(sounds(ev).includes('clang'));
  assert.ok(sounds(ev).includes('swipe'), 'the enemy attacked');
  assert.equal(w.player.hp, 3, 'and nothing got through');
  const d = sideWorld([hero({ clips })]);
  const x0 = d.player.x;
  step(d, { dodge: true }, DT);
  assert.equal(d.player.state, 'dodge');
  assert.equal(d.player.anim.clip, 'dodge');
  run(d, {}, 0.5);
  assert.ok(d.player.x > x0 + 40, `dashed ${d.player.x - x0}`);
});

const act = (w) => { step(w, { action: true }, DT); return run(w, {}, 1.2); };

test('acting next to a prop plays its next clip in file order, round to the first', () => {
  // a lever: off, pull, on
  const lever = makeKind({ key: 'lever', role: 'prop', box: { l: 8, r: 8, t: 16, b: 0 }, clips: { off: { frames: 1, fps: 8 }, pull: { frames: 6, fps: 12, loop: false }, on: { frames: 1, fps: 8 } }, cues: { pull: [{ sound: 'clunk', frame: 0 }] } });
  const lw = sideWorld([hero(), lever]);
  const l = first(lw, 'lever');
  l.x = lw.player.x + 20;
  assert.equal(l.anim.clip, 'off');
  const ev = act(lw);
  assert.deepEqual([l.anim.clip, l.anim.frame], ['pull', 5], 'a one-shot clip holds its last frame');
  assert.deepEqual(sounds(ev).filter((x) => x === 'clunk'), ['clunk']);
  act(lw);
  assert.equal(l.anim.clip, 'on');
  act(lw);
  assert.equal(l.anim.clip, 'off', 'after the last clip, the first again');

  // a chest: closed, open, empty. It stays open, glowing, until it is used again
  const chest = makeKind({ key: 'chest', role: 'prop', box: { l: 10, r: 10, t: 16, b: 0 }, clips: { closed: { frames: 1, fps: 8 }, open: { frames: 6, fps: 12, loop: false }, empty: { frames: 1, fps: 8 } } });
  const cw = sideWorld([hero(), chest]);
  const c = first(cw, 'chest');
  c.x = cw.player.x + 20;
  act(cw);
  assert.deepEqual([c.anim.clip, c.anim.frame], ['open', 5]);
  run(cw, {}, 3);
  assert.equal(c.anim.clip, 'open');
  act(cw);
  assert.equal(c.anim.clip, 'empty');

  // a crate: idle, hurt, break. The same walk: whole, hit, broken, whole
  const crate = makeKind({ key: 'crate', role: 'prop', box: { l: 10, r: 10, t: 20, b: 0 }, clips: { idle: { frames: 1, fps: 8 }, hurt: { frames: 4, fps: 9, loop: false }, break: { frames: 8, fps: 12, loop: false } } });
  const kw = sideWorld([hero(), crate]);
  const k = first(kw, 'crate');
  k.x = kw.player.x + 22;
  const seen = [];
  for (let i = 0; i < 3; i++) { act(kw); seen.push(k.anim.clip); }
  assert.deepEqual(seen, ['hurt', 'break', 'idle']);
  assert.equal(countOf(kw, 'crate'), 1);
});

test('a one-shot clip carries on into the moving loop that follows it', () => {
  // a fire: burn, ignite. Flaring up gives way to burning again
  const w = sideWorld([hero(), fire()]);
  const f = first(w, 'fire');
  f.x = w.player.x + 20;
  assert.equal(f.anim.clip, 'burn');
  assert.deepEqual([...activeLoops(w)].map((l) => l.sound), ['crackle'], 'its looping sound is on while its clip plays');
  step(w, { action: true }, DT); run(w, {}, 0.3);
  assert.equal(f.anim.clip, 'ignite');
  run(w, {}, 2);
  assert.equal(f.anim.clip, 'burn');
  // a torch: idle (burning), out, ignite
  const torch = makeKind({ key: 'torch', role: 'prop', box: { l: 6, r: 6, t: 20, b: 0 }, clips: { idle: { frames: 8, fps: 8 }, out: { frames: 1, fps: 8 }, ignite: { frames: 6, fps: 12, loop: false } } });
  const tw = sideWorld([hero(), torch]);
  const t = first(tw, 'torch');
  t.x = tw.player.x + 20;
  act(tw);
  assert.equal(t.anim.clip, 'out');
  run(tw, {}, 3);
  assert.equal(t.anim.clip, 'out', 'a still state waits');
  act(tw);
  assert.equal(t.anim.clip, 'idle', 'it caught light and burns on');
});

test('a projectile leaves from the muzzle, flies, and plays its hit clip where it lands', () => {
  const bolt = makeKind({ key: 'bolt', id: 'bolt', role: 'projectile', box: { l: 3, r: 3, t: 3, b: 3 }, clips: { fly: { frames: 4, fps: 12 }, hit: { frames: 4, fps: 16, loop: false } }, cues: { hit: [{ sound: 'zap', frame: 0 }] } });
  const gunner = hero({ clips: { idle: { frames: 4, fps: 8 }, walk: { frames: 8, fps: 10 }, shoot: { frames: 6, fps: 14, loop: false, hitFrame: 1, fire: { dx: 14, dy: 22 } } }, cues: {} });
  const w = sideWorld([gunner, slime({ hostile: false }), bolt]);
  const s = first(w, 'slime');
  s.x = w.player.x + 90; s.home.x = s.x;
  assert.equal(countOf(w, 'bolt'), 0);
  assert.equal(first(w, 'bolt'), undefined, 'a projectile does not stand in the scene');
  step(w, { action: true }, DT);
  assert.equal(w.player.anim.clip, 'shoot');
  let shot = null, sawHit = false;
  const ev = [];
  for (let i = 0; i < 120; i++) {
    ev.push(...step(w, {}, DT));
    const b = w.things.find((t) => t.kind === 'bolt');
    if (b && !shot) shot = { x: b.x, lift: b.lift, clip: b.anim.clip };
    if (b && b.anim.clip === 'hit') sawHit = true;
  }
  assert.ok(shot, 'the projectile flew');
  assert.equal(shot.clip, 'fly');
  assert.equal(shot.lift, 22, 'from the height of the muzzle');
  assert.ok(Math.abs(shot.x - (w.level.start.x + 14)) < 6, 'from in front of the sprite');
  assert.equal(s.hits, 1);
  assert.ok(sawHit, 'its hit clip played');
  assert.deepEqual(sounds(ev).filter((x) => x === 'zap'), ['zap']);
  assert.equal(w.things.some((t) => t.kind === 'bolt'), false, 'and then it is gone');
  // facing left, it leaves from the other side
  const l = sideWorld([gunner, bolt]);
  l.player.x = 300; run(l, { left: true }, 0.2);
  const x = l.player.x;
  step(l, { action: true }, DT);
  for (let i = 0; i < 12 && !l.things.length; i++) step(l, {}, DT);
  assert.ok(l.things[0].x < x && l.things[0].vx < 0);
});

test('an effect with a burst plays where a hit lands; one with a loop plays all the time', () => {
  const spark = makeKind({ key: 'spark', role: 'effect', box: { l: 8, r: 8, t: 8, b: 8 }, clips: { burst: { frames: 6, fps: 18, loop: false } } });
  const smoke = makeKind({ key: 'smoke', role: 'effect', box: { l: 8, r: 8, t: 16, b: 0 }, clips: { loop: { frames: 8, fps: 10 }, burst: { frames: 6, fps: 18, loop: false } } });
  assert.equal(smoke.rest, 'loop');
  assert.equal(spark.rest, 'burst');
  const w = sideWorld([hero(), slime({ hostile: false }), spark]);
  const s = first(w, 'slime');
  s.x = w.player.x + 22; s.home.x = s.x;
  assert.equal(countOf(w, 'spark'), 1, 'one stands in the scene');
  step(w, { action: true }, DT);
  let bursts = 0;
  for (let i = 0; i < 40; i++) { step(w, {}, DT); bursts = Math.max(bursts, w.things.filter((t) => t.kind === 'spark' && t.passing).length); }
  assert.equal(bursts, 1, 'another played on the slime');
  run(w, {}, 1);
  assert.equal(w.things.filter((t) => t.kind === 'spark').length, 1, 'and went when it was done');
});

test('a townsperson talks while the player stands next to it', () => {
  const npc = makeKind({ key: 'elder', role: 'npc', box: { l: 6, r: 6, t: 24, b: 0 }, clips: { idle: { frames: 8, fps: 7 }, walk: { frames: 8, fps: 10 }, talk: { frames: 8, fps: 7 } } });
  const w = sideWorld([hero(), npc]);
  const e = first(w, 'elder');
  w.player.x = e.x - 14;
  run(w, {}, 0.5);
  assert.equal(e.anim.clip, 'talk');
  assert.equal(e.facing, -1, 'it turns to the player');
  w.player.x = e.x - 200;
  run(w, {}, 0.5);
  assert.notEqual(e.anim.clip, 'talk');
  assert.equal(run(w, {}, 3).some((ev) => ev.type === 'hurt'), false);
});

test('an enemy uses its other moves as attacks', () => {
  const brute = slime({ clips: { idle: { frames: 8, fps: 8 }, walk: { frames: 8, fps: 10 }, attack: { frames: 8, fps: 13, loop: false }, slam: { frames: 10, fps: 12, loop: false }, hurt: { frames: 4, fps: 9, loop: false } }, cues: {} });
  assert.deepEqual(brute.moves, ['slam']);
  const w = sideWorld([hero({ hp: 99 }), brute]);
  const s = first(w, 'slime');
  const seen = new Set();
  for (let i = 0; i < 60 * 40; i++) { step(w, {}, DT); s.x = w.player.x + 16; if (s.state === 'attack') seen.add(s.anim.clip); }
  assert.deepEqual([...seen].sort(), ['attack', 'slam']);
});

// ---- top-down

const scout = () => buildKind({ key: 'hero', sprite: walker, row: rowFromSprite(walker), settings: {} }, 'player');
const topWorld = (kinds) => createWorld({ mode: 'top', level: makeLevel('top'), kinds, player: 'hero' });

test('top-down: the four direction keys walk four ways on the four direction clips', () => {
  const w = topWorld([scout()]);
  const at = () => ({ x: w.player.x, y: w.player.y });
  let a = at();
  run(w, { down: true }, 0.4);
  assert.ok(w.player.y > a.y && w.player.x === a.x);
  assert.deepEqual([w.player.anim.clip, w.player.anim.flip], ['walk_down', false]);
  a = at(); run(w, { up: true }, 0.4);
  assert.ok(w.player.y < a.y);
  assert.deepEqual([w.player.anim.clip, w.player.anim.flip], ['walk_up', false]);
  a = at(); run(w, { right: true }, 0.4);
  assert.ok(w.player.x > a.x && w.player.y === a.y);
  assert.deepEqual([w.player.anim.clip, w.player.anim.flip], ['walk_side', false]);
  a = at(); run(w, { left: true }, 0.4);
  assert.ok(w.player.x < a.x);
  assert.deepEqual([w.player.anim.clip, w.player.anim.flip], ['walk_side', true]);
  run(w, {}, 0.2);
  assert.deepEqual([w.player.anim.clip, w.player.anim.flip], ['idle_side', true], 'it stands facing the way it walked');
  run(w, { up: true }, 0.2); run(w, {}, 0.2);
  assert.equal(w.player.anim.clip, 'idle_up');
  step(w, { action: true }, DT);
  assert.equal(w.player.anim.clip, 'attack_up');
});

test('top-down: there is no gravity and no jump, and walls stop the player', () => {
  const w = topWorld([scout()]);
  const y = w.player.y;
  run(w, { jump: true }, 0.5);
  assert.equal(w.player.y, y);
  run(w, { left: true, run: true }, 20);
  assert.ok(w.player.x > w.level.tile, 'stopped by the west wall');
  run(w, { up: true, run: true }, 20);
  assert.ok(w.player.y > 2 * w.level.tile, 'stopped by the north wall, which is two tiles deep');
  const pit = createWorld({ mode: 'top', level: makeLevel('top', { hole: true }), kinds: [scout()], player: 'hero' });
  pit.player.x = 15 * 32; pit.player.y = 8 * 32;
  run(pit, { right: true, run: true }, 5);
  assert.ok(pit.player.x < 16 * 32, 'a pit blocks the way');
});

test('top-down: pickups are collected and creatures wander inside the room', () => {
  const w = topWorld([scout(), coin(), slime()]);
  const c = first(w, 'coin');
  c.x = w.player.x + 20; c.y = w.player.y;
  run(w, { right: true }, 1.2);
  assert.ok(w.collected >= 1);
  const s = first(w, 'slime');
  run(w, {}, 10);
  assert.ok(s.x > w.level.tile && s.x < w.level.width - w.level.tile && s.y > w.level.tile && s.y < w.level.height);
});

test('top-down: big things are put where they fit: clear of the walls, of each other and of the player', () => {
  const big = (key, w, h) => makeKind({ key, role: 'prop', box: { l: w / 2, r: w / 2, t: h, b: 0 }, clips: { idle: { frames: 1, fps: 1 } } });
  const w = topWorld([scout(), big('cottage', 88, 86), big('inn', 120, 88), big('stall', 60, 56), big('oak', 56, 72), big('pine', 40, 72), coin(), slime()]);
  const rect = (t) => { const k = w.kinds[t.kind]; return { x0: t.x - k.box.l, x1: t.x + k.box.r, y0: t.y - t.lift - k.box.t, y1: t.y - t.lift + k.box.b }; };
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const props = w.things.filter((t) => t.role === 'prop');
  assert.equal(props.length, 5);
  for (const a of props) {
    const k = w.kinds[a.kind], T = w.level.tile;
    for (let x = a.x - k.box.l + 1; x < a.x + k.box.r; x += 8) assert.equal(isWall(w.level, Math.floor(x / T), Math.floor((a.y - 1) / T)), false, `${a.kind} does not stand in a wall`);
    for (const b of props) if (a !== b) assert.equal(hit(rect(a), rect(b)), false, `${a.kind} and ${b.kind} do not overlap`);
    assert.equal(hit(rect(a), rect(w.player)), false, `${a.kind} is not on top of the player`);
  }
});

test('a snapshot is plain data', () => {
  const w = sideWorld([hero(), slime(), coin()]);
  run(w, { right: true }, 0.3);
  const s = JSON.parse(JSON.stringify(snapshot(w)));
  assert.equal(s.mode, 'side');
  assert.equal(s.player.clip, 'walk');
  assert.equal(typeof s.player.x, 'number');
  assert.equal(s.player.onGround, true);
  assert.deepEqual([s.player.hp, s.player.maxHp], [3, 3]);
  assert.ok(s.things.every((t) => typeof t.kind === 'string' && typeof t.role === 'string' && typeof t.clip === 'string'));
  assert.equal(s.collected, 0);
});
