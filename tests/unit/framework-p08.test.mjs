// Framework additions made with batch P08 (the platformer boss, moss-golem; the pathfinder for bosses):
//   rigs/bigbody.js   the side-view large two-legged body rig: dims, clips, clipsFor, pose, solve, pieces, onPiece,
//                     collapse (a body falling apart into a pile), sockets, chainJoints (a chain of segments)
//   engine/rock.js    seam (the dark line between stacked stones), capIn (the layer on top of a shape: moss, snow),
//                     crack (a jagged crack)
//   engine/growth.js  mossCap (a cap of moss drawn on a shape), mushroom, sapling (things standing on a point that turn with it)
//   engine/creature.js  hornFit (the longest a horn can be without leaving a box; added in fix round 1)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn, rectIn } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import { seam, capIn, crack } from '../../engine/rock.js';
import { mossCap, mushroom, sapling } from '../../engine/growth.js';
import { ramp } from '../../engine/color.js';
import * as B from '../../rigs/bigbody.js';
import { hornPath, hornIn, hornFit } from '../../engine/creature.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, c) => { const v = col(c); return g.data.reduce((n, x) => n + (x === v ? 1 : 0), 0); };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const frames = (n, loop) => Array.from({ length: n }, (_, i) => (loop ? i / n : i / (n - 1)));

// ---- engine/rock.js: seam -----------------------------------------------------------

test('seam darkens only pixels that are already drawn and touch the shape from outside', () => {
  const g = new Surface(32, 32).rect(4, 16, 24, 10, '#8f97a8');
  const before = lit(g);
  const top = ellipseIn(16, 14, 6, 5);              // a stone resting on the slab, half over empty space
  seam(g, top, '#333344');
  assert.equal(lit(g), before, 'no pixel is added or removed');
  const dark = count(g, '#333344');
  assert.ok(dark >= 6, `a contact line is drawn (${dark} px)`);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g.get(x, y) !== col('#333344')) continue;
    assert.ok(!top(x + 0.5, y + 0.5), 'the seam is outside the shape');
    assert.ok(top(x + 1.5, y + 0.5) || top(x - 0.5, y + 0.5) || top(x + 0.5, y + 1.5) || top(x + 0.5, y - 0.5), 'and touches it');
  }
});

test('seam does nothing where the shape touches nothing, and respects box and clip', () => {
  const g = new Surface(32, 32).rect(2, 2, 6, 6, '#8f97a8');
  seam(g, ellipseIn(22, 22, 5, 5), '#333344');
  assert.equal(count(g, '#333344'), 0);
  const h = new Surface(32, 32).rect(0, 0, 32, 32, '#8f97a8');
  seam(h, rectIn(10, 10, 12, 12), '#333344', { clip: (px, py) => py < 10 });
  assert.equal(count(h, '#333344'), 12, 'only the edge above the square');
  const k = new Surface(32, 32).rect(0, 0, 32, 32, '#8f97a8');
  seam(k, rectIn(10, 10, 12, 12), '#333344', { box: [0, 0, 9, 31] });
  assert.equal(count(k, '#333344'), 12, 'only the edge left of the square');
});

// ---- engine/rock.js: capIn -----------------------------------------------------------

test('capIn covers the top of a shape to the asked depth, column by column', () => {
  const block = rectIn(6, 12, 20, 14);
  const cap = capIn(block, [0, 0, 31, 31], { depth: 3, rise: 0, ragged: 0 });
  const g = new Surface(32, 32).fill(0, 0, 32, 32, cap, '#a4c44a');
  assert.deepEqual(g.bounds(), { x0: 6, y0: 12, x1: 25, y1: 14 });
  assert.equal(lit(g), 20 * 3);
});

test('capIn: lumps rise above the edge, the lower edge hangs ragged, and it keeps to its box', () => {
  const hill = ellipseIn(16, 22, 12, 9);
  const g = new Surface(32, 32).fill(0, 0, 32, 32, capIn(hill, [0, 0, 31, 31], { depth: 2, rise: 2, ragged: 3, seed: 4 }), '#a4c44a');
  const b = g.bounds();
  assert.ok(b.y0 < 13, 'something stands above the top of the hill (row 13)');
  assert.ok(b.y0 >= 11, 'by no more than the rise');
  let deepest = 0, shallowest = 99;
  for (let x = 8; x <= 24; x++) {
    let top = -1, n = 0;
    for (let y = 0; y < 32; y++) if (hill(x + 0.5, y + 0.5)) { if (top < 0) top = y; if (g.get(x, y)) n++; }
    deepest = Math.max(deepest, n); shallowest = Math.min(shallowest, n);
    assert.ok(n >= 2 && n <= 5, `column ${x}: ${n} px of cap inside the hill`);
  }
  assert.ok(deepest > shallowest, 'the lower edge is ragged');
  const part = new Surface(32, 32).fill(0, 0, 32, 32, capIn(hill, [10, 0, 16, 15], { depth: 2, rise: 0, ragged: 0 }), '#a4c44a');
  const pb = part.bounds();
  assert.ok(pb.x0 >= 10 && pb.x1 <= 16, 'only the columns of the box');
  const same = new Surface(32, 32).fill(0, 0, 32, 32, capIn(hill, [0, 0, 31, 31], { depth: 2, rise: 2, ragged: 3, seed: 4 }), '#a4c44a');
  assert.deepEqual(same.data, g.data, 'the same seed gives the same cap');
});

// ---- engine/rock.js: crack -----------------------------------------------------------

test('crack runs the asked way for about the asked length, one pixel wide, and stays inside its clip', () => {
  const g = new Surface(48, 48);
  crack(g, 24, 6, 0, 20, '#333344', { seed: 3, branch: false });
  const b = g.bounds();
  assert.equal(b.y0, 6);
  assert.ok(b.y1 >= 20 && b.y1 <= 30, `it runs down about 20 px (to row ${b.y1})`);
  assert.ok(b.x1 - b.x0 >= 2, 'it zigzags');
  assert.ok(b.x1 - b.x0 <= 14, 'but keeps its direction');
  for (let y = b.y0; y <= b.y1; y++) { let n = 0; for (let x = 0; x < 48; x++) if (g.get(x, y)) n++; assert.ok(n >= 1 && n <= 4, `row ${y}: ${n} px`); }
  const disc = ellipseIn(24, 24, 8, 8);
  const c = new Surface(48, 48);
  crack(c, 24, 20, PI / 2, 30, '#333344', { seed: 1, clip: disc });
  assert.ok(lit(c) > 3);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (c.get(x, y)) assert.ok(disc(x + 0.5, y + 0.5), 'no pixel outside the clip');
  const again = new Surface(48, 48);
  crack(again, 24, 6, 0, 20, '#333344', { seed: 3, branch: false });
  assert.deepEqual(again.data, g.data, 'repeatable');
  const forked = new Surface(48, 48);
  crack(forked, 24, 6, 0, 20, '#333344', { seed: 3 });
  assert.ok(lit(forked) > lit(g), 'a long crack has a side branch');
});

// ---- engine/growth.js -----------------------------------------------------------------

test('mossCap: three tones with a light top row, and a line of shadow on the shape under it', () => {
  const stone = ramp('#8f97a8'), moss = ramp('#a4c44a');
  const block = rectIn(6, 12, 20, 14);
  const g = new Surface(32, 32).rect(6, 12, 20, 14, stone.base);
  mossCap(g, block, [0, 0, 31, 31], moss, { under: stone.dark, depth: 3, rise: 0, ragged: 0 });
  for (let x = 6; x < 26; x++) {
    assert.equal(g.get(x, 12), col(moss.light), `column ${x}: light top row`);
    assert.equal(g.get(x, 15), col(stone.dark), `column ${x}: shadow under the cap`);
    assert.equal(g.get(x, 16), col(stone.base), `column ${x}: stone below that`);
  }
  assert.ok(count(g, moss.dark) > 0 && count(g, moss.base) > 0, 'the cap is shaded');
  const plain = new Surface(32, 32).rect(6, 12, 20, 14, stone.base);
  mossCap(plain, block, [0, 0, 31, 31], moss, { depth: 3, rise: 0, ragged: 0 });
  assert.equal(count(plain, stone.dark), 0, 'no shadow line unless asked for');
});

test('mushroom: a stalk with a wider cap on top, growing the way it is told, and smaller or absent where there is no room', () => {
  const g = new Surface(32, 32);
  assert.equal(mushroom(g, 16, 24, PI, { height: 5, cap: 4, paint: ramp('#a4c44a'), stalk: '#f0ead8' }), true);
  const b = g.bounds();
  assert.ok(b.y1 <= 24 && b.y0 <= 17, `it stands up from its root (${b.y0}..${b.y1})`);
  const width = (y) => { let n = 0; for (let x = 0; x < 32; x++) if (g.get(x, y)) n++; return n; };
  assert.ok(width(b.y0 + 2) >= 6 && width(23) <= 3, 'the cap is wider than the stalk');
  const side = new Surface(32, 32);
  mushroom(side, 10, 16, PI / 2, { height: 5, cap: 4, paint: '#a4c44a' });
  assert.ok(side.bounds().x1 >= 17 && side.bounds().x0 >= 9, 'turned to the right, it grows to the right');
  const edge = new Surface(32, 32);
  mushroom(edge, 16, 8, PI, { height: 5, cap: 4, paint: '#a4c44a' });
  assert.ok(edge.bounds() === null || edge.bounds().y0 >= 2, 'near the top of the frame it is smaller, and stays inside');
  assert.equal(mushroom(new Surface(32, 32), 16, 3, PI, { height: 5, cap: 4 }), false, 'with no room at all it is left out');
});

test('sapling: a stem about as tall as asked with leaves at the top; it bends with sway and stays in its box', () => {
  const draw = (o) => { const g = new Surface(48, 48); const drawn = sapling(g, 24, 40, PI, { length: 15, leaf: 3, paint: ramp('#3f8a4f'), wood: '#7a4f33', ...o }); return { g, drawn }; };
  const { g, drawn } = draw({});
  assert.equal(drawn, true);
  const b = g.bounds();
  assert.ok(b.y0 >= 19 && b.y0 <= 24, `the leaves top out about 15 px + a clump above the root (${b.y0})`);
  assert.ok(count(g, '#7a4f33') >= 8, 'a stem');
  assert.ok(b.x1 - b.x0 >= 7, 'leaves either side');
  const bent = draw({ sway: 0.25 }).g, back = draw({ sway: -0.25 }).g;
  const mid = (s) => { const q = s.bounds(); return (q.x0 + q.x1) / 2; };
  assert.ok(mid(bent) < mid(g) - 1 && mid(back) > mid(g) + 1, 'sway bends it one way or the other');
  const boxed = draw({ box: [10, 30, 38, 46] });
  assert.ok(boxed.drawn === false || boxed.g.bounds().y0 >= 29, 'in a low box it is shorter or left out');
  assert.equal(draw({ box: [22, 38, 26, 42] }).drawn, false);
});

// ---- rigs/bigbody.js: sizes and clips ---------------------------------------------------

test('bigbody: the frame, pivot and clip table are those of a side-view boss', () => {
  assert.deepEqual(B.SIZE, [96, 96]);
  assert.deepEqual(B.PIVOT, [44, 90]);
  const c = B.clips((p) => p.speed);
  assert.deepEqual(Object.keys(c), ['idle', 'walk', 'attack', 'roar', 'hurt', 'stagger', 'die']);
  assert.deepEqual(Object.values(c).map((x) => x.frames), [8, 8, 12, 10, 4, 8, 12]);
  assert.deepEqual(Object.values(c).map((x) => x.loop), [true, true, false, false, false, false, false]);
  assert.equal(c.attack.label, 'Slam');
  assert.ok(c.walk.fps({ speed: 1 }) > c.walk.fps({ speed: 0.5 }) && c.walk.fps({ speed: 0.5 }) > c.walk.fps({ speed: 0 }));
  assert.ok(close(c.attack.fps({ speed: 0.5 }), 11 * 1.05));
  assert.deepEqual(Object.keys(B.clipsFor(['idle', 'die'])), ['idle', 'die']);
  assert.throws(() => B.clipsFor(['fly']), /no standard clip "fly"/);
  const extra = B.clips(undefined, { breath: { frames: 10, fps: 10, loop: false } });
  assert.equal(Object.keys(extra).at(-1), 'breath');
});

test('bigbody: dims grow with their sliders and stay a hunched giant', () => {
  const lo = B.dims({ size: 0, bulk: 0, arms: 0 }), mid = B.dims(), hi = B.dims({ size: 1, bulk: 1, arms: 1 });
  for (const k of ['hip', 'torso', 'rx', 'ry', 'fist', 'upper', 'fore', 'shoulderR', 'headR']) assert.ok(lo[k] < mid[k] && mid[k] < hi[k], k);
  assert.ok(B.dims({ bulk: 1 }).rx > B.dims({ bulk: 0 }).rx && B.dims({ bulk: 1 }).hip === B.dims({ bulk: 0 }).hip, 'bulk widens, it does not lengthen the legs');
  assert.ok(B.dims({ arms: 1 }).upper > B.dims({ arms: 0 }).upper);
  assert.ok(mid.upper + mid.fore > mid.hip, 'the arms are longer than the legs');
  assert.ok(mid.headR < mid.shoulderR, 'a small head between big shoulders');
});

// ---- rigs/bigbody.js: poses ---------------------------------------------------------

const D = B.dims();
const flat = (P) => JSON.stringify(P, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));

test('bigbody: every pose name works and an unknown one says which exist', () => {
  for (const name of B.POSES) for (const t of [0, 0.3, 0.7, 1]) {
    const P = B.pose(name, t, {}, D);
    for (const k of ['bx', 'by', 'lean', 'squash', 'rise', 'jaw', 'glow', 'fall']) assert.ok(Number.isFinite(P[k]), `${name} t=${t}: ${k}`);
    for (const k of ['near', 'far', 'nf', 'ff', 'head']) assert.ok(P[k].length === 2 && P[k].every(Number.isFinite), `${name} t=${t}: ${k}`);
  }
  assert.equal(flat(B.pose('attack', 0.5, {}, D)), flat(B.pose('slam', 0.5, {}, D)));
  assert.throws(() => B.pose('fly', 0, {}, D), /no pose "fly"/);
});

test('bigbody: loops close and one-shots come back to the resting pose', () => {
  for (const name of ['idle', 'walk']) {
    const a = B.pose(name, 0, {}, D), b = B.pose(name, 1, {}, D);
    for (const k of ['bx', 'by', 'lean', 'rise']) assert.ok(close(a[k], b[k], 1e-6), `${name}: ${k}`);
    for (const k of ['near', 'far', 'nf', 'ff']) assert.ok(close(a[k][0], b[k][0], 1e-6) && close(a[k][1], b[k][1], 1e-6), `${name}: ${k}`);
  }
  const rest = B.pose('hurt', 1, {}, D);
  for (const name of ['slam', 'roar', 'hurt', 'stagger']) {
    const end = B.pose(name, 1, {}, D);
    for (const k of ['bx', 'by', 'lean', 'squash', 'rise', 'jaw', 'kneel', 'fall']) assert.ok(close(end[k], 0, 1e-6), `${name} ends with ${k} = 0 (${end[k]})`);
    for (const k of ['near', 'far', 'nf', 'ff', 'head']) assert.ok(close(end[k][0], rest[k][0], 1e-6) && close(end[k][1], rest[k][1], 1e-6), `${name}: ${k}`);
    assert.equal(end.glow, 1);
    assert.equal(end.flash, false);
  }
  assert.equal(B.pose('slam', 0, {}, D).lean, 0, 'and start on it');
});

test('bigbody walk: the near foot lands on frame 0 and the far foot on frame 4, and the body drops onto each step', () => {
  const at = (f) => B.pose('walk', f / 8, {}, D);
  assert.equal(at(0).nf[1], 0); assert.equal(at(4).ff[1], 0);
  assert.ok(at(0).nf[0] > 3 && at(4).ff[0] > 3, 'each lands ahead of where it stands');
  assert.ok(at(6).nf[1] > 1 && at(2).ff[1] > 1, 'the other foot is in the air');
  assert.ok(at(0).by > at(2).by + 1 && at(4).by > at(6).by + 1, 'it is lowest just after a foot lands');
  assert.ok(Math.sign(at(0).near[0] - at(4).near[0]) === -Math.sign(at(0).far[0] - at(4).far[0]), 'the arms swing against each other');
  const heavy = B.pose('walk', 0, { bounce: 1 }, D), light = B.pose('walk', 0, { bounce: 0 }, D);
  assert.ok(heavy.by > light.by + 1, 'bounce makes it stomp');
});

test('bigbody slam: six frames of warning with the fists going up, the hit on frame 7, then the dust', () => {
  const fistY = (f) => { const J = B.solve(B.pose('slam', f / 11, {}, D), D); return [J.armN.hand[1], J.armF.hand[1]]; };
  for (let f = 2; f <= 5; f++) assert.ok(fistY(f)[1] < fistY(f - 1)[1], `far fist higher on frame ${f}`);
  assert.ok(fistY(6)[1] <= fistY(5)[1] + 1, 'and held up on frame 6');
  for (let f = 3; f <= 6; f++) assert.ok(fistY(f)[0] < fistY(f - 1)[0], `near fist higher on frame ${f}`);
  const J6 = B.solve(B.pose('slam', 6 / 11, {}, D), D);
  assert.ok(J6.armN.hand[1] < J6.head[1] - 10 && J6.armF.hand[1] < J6.head[1] - 10, 'both fists are over the head on frame 6');
  const [n7, f7] = fistY(7), floor = Math.floor(B.GROUND - D.fist);
  assert.ok(n7 >= floor - 2 && f7 >= floor - 2, `both fists are down on frame 7 (${n7}, ${f7} of ${floor})`);
  const hit = B.pose('slam', 7 / 11, {}, D);
  assert.ok(hit.squash >= 3 && hit.by > 2, 'the body is pressed down by the hit');
  assert.equal(B.pose('slam', 6 / 11, {}, D).impact, -1);
  assert.equal(hit.impact, 0);
  assert.ok(B.pose('slam', 9 / 11, {}, D).impact > 0.4);
  assert.equal(B.pose('slam', 1, {}, D).impact, -1, 'no dust left on the last frame');
});

test('bigbody: roar rears back then leans in with the arms wide; stagger goes down on the near knee; hurt and die start white', () => {
  const roar = (f) => B.pose('roar', f / 9, {}, D);
  assert.ok(roar(3).lean < -0.15 && roar(5).lean > 0.15);
  assert.ok(roar(5).near[0] < -0.6 && roar(5).far[0] > 0, 'near arm flung back, far arm forward');
  assert.ok(roar(5).jaw > 0.9 && roar(5).shout >= 0 && roar(2).shout === -1 && roar(9).shout === -1);
  const down = B.pose('stagger', 3 / 7, {}, D);
  assert.ok(down.kneel === 1 && down.by > 6 && down.nf[0] < -5);
  const glows = [2, 3, 4, 5].map((f) => B.pose('stagger', f / 7, {}, D).glow);
  assert.ok(glows.every((v) => v > 1) && new Set(glows).size === 2, 'the core flashes between two levels while it is down');
  assert.equal(B.pose('hurt', 0, {}, D).flash, true); assert.equal(B.pose('hurt', 1 / 3, {}, D).flash, false);
  assert.equal(B.pose('die', 0, {}, D).flash, true);
  assert.equal(B.pose('die', 0, {}, D).fall, 0);
  assert.equal(B.pose('die', 7 / 11, {}, D).fall, 1, 'the last pieces land on frame 7');
  assert.equal(B.pose('die', 1, {}, D).glow, 0, 'and the light is out');
});

// ---- rigs/bigbody.js: joints and pieces ----------------------------------------------------

const NAMES = ['armF.upper', 'armF.fore', 'fistF', 'legF.thigh', 'legF.shin', 'footF', 'shoulderF', 'pelvis', 'legN.thigh', 'legN.shin', 'footN', 'chest', 'head', 'shoulderN', 'armN.upper', 'armN.fore', 'fistN'];
const standing = (d = D) => { const P = B.pose('hurt', 1, {}, d), J = B.solve(P, d); return { P, J, list: B.pieces(J, P, d) }; };

test('bigbody: seventeen pieces in painting order, far ones first, each with a fixed seed', () => {
  const { list } = standing();
  assert.deepEqual(list.map((p) => p.name), NAMES);
  assert.deepEqual(list.filter((p) => p.far).map((p) => p.name), NAMES.slice(0, 7));
  assert.equal(new Set(list.map((p) => p.seed)).size, list.length);
  for (const p of list) assert.ok(p.rx > 2 && p.ry > 2 && Number.isFinite(p.x + p.y + p.angle), p.name);
  const again = B.pieces(B.solve(B.pose('walk', 0.3, {}, D), D), B.pose('walk', 0.3, {}, D), D);
  assert.deepEqual(again.map((p) => p.seed), list.map((p) => p.seed), 'the seeds do not change with the pose');
});

test('bigbody: it stands on the ground, hunched, with the head below the shoulders and the fists near the knees', () => {
  const { J, list } = standing();
  const by = Object.fromEntries(list.map((p) => [p.name, p]));
  assert.equal(by.footN.sole, B.GROUND); assert.equal(by.footF.sole, B.GROUND);
  assert.ok(J.chest[0] > J.pelvis[0] + 4, 'the chest leans out over the feet');
  assert.ok(J.head[1] - D.headR > J.shoulderN[1] - D.shoulderR, 'the top of the head is below the top of the near shoulder');
  assert.ok(J.head[0] > J.chest[0], 'and in front of the chest');
  for (const A of [J.armN, J.armF]) assert.ok(Math.abs(A.hand[1] - J.legN.knee[1]) < 12, `a fist hangs at about knee height (${A.hand[1]} against ${J.legN.knee[1]})`);
  assert.ok(J.armN.hand[0] < J.armF.hand[0], 'the near arm hangs behind, the far one in front');
  const top = Math.min(...list.map((p) => p.y - Math.max(p.rx, p.ry)));
  assert.ok(B.GROUND - top >= 52 && B.GROUND - top <= 72, `about two tiles tall (${B.GROUND - top})`);
});

test('bigbody: at every size the fists stay inside the frame and above the ground in every pose', () => {
  for (const o of [{ size: 0, bulk: 0, arms: 0 }, {}, { size: 1, bulk: 1, arms: 1 }]) {
    const d = B.dims(o);
    for (const [name, n, loop] of [['idle', 8, true], ['walk', 8, true], ['slam', 12], ['roar', 10], ['hurt', 4], ['stagger', 8], ['die', 12]]) for (const t of frames(n, loop)) {
      const J = B.solve(B.pose(name, t, { bounce: 1 }, d), d);
      for (const A of [J.armN, J.armF]) {
        assert.ok(A.hand[0] - d.fist >= 1.5 && A.hand[0] + d.fist <= 94.5, `${name} t=${t}: fist x ${A.hand[0]}`);
        assert.ok(A.hand[1] - d.fist >= 1.5 && A.hand[1] + d.fist <= B.GROUND + 0.5, `${name} t=${t}: fist y ${A.hand[1]}`);
      }
    }
  }
});

test('bigbody onPiece: a point on a piece turns with it', () => {
  const piece = { x: 40, y: 50, rx: 10, ry: 4, angle: 0 };
  assert.deepEqual(B.onPiece(piece, 1, 0), [50, 50]);
  assert.deepEqual(B.onPiece(piece, 0, -1), [40, 46]);
  const [x, y] = B.onPiece({ ...piece, angle: PI / 2 }, 1, 0);       // a quarter turn clockwise: its long axis points down
  assert.ok(close(x, 40, 1e-9) && close(y, 60, 1e-9));
});

// ---- rigs/bigbody.js: falling apart --------------------------------------------------------

test('bigbody collapse: nothing moves at 0; at 1 every piece lies in a pile on the ground, lower and wider than the body', () => {
  const { list } = standing();
  const still = B.collapse(list, 0);
  assert.deepEqual(still.map((p) => [p.x, p.y, p.angle]), list.map((p) => [p.x, p.y, p.angle]));
  assert.ok(still.every((p) => p.landed === false));
  const pile = B.collapse(list, 1, { cx: 44, seed: 5 });
  assert.equal(pile.length, list.length);
  assert.deepEqual(pile.map((p) => p.name), list.map((p) => p.name), 'the painting order is kept');
  assert.ok(pile.every((p) => p.landed));
  for (const p of pile) {
    const hw = Math.max(p.rx, p.ry), hh = Math.min(p.rx, p.ry);
    assert.ok(p.y + hh <= B.GROUND + 0.01, `${p.name} is not under the ground`);
    assert.ok(p.x - hw >= 2 - 0.01 && p.x + hw <= 94.01, `${p.name} is inside the frame`);
    assert.ok(p.x - hw >= 44 - 32 - 0.01 && p.x + hw <= 44 + 32 + 0.01, `${p.name} is within reach of the middle`);
  }
  const topOf = (ps) => Math.min(...ps.map((p) => p.y - Math.min(p.rx, p.ry)));
  assert.ok(topOf(pile) > topOf(list) + 12, `the pile is lower than the body (${topOf(pile)} against ${topOf(list)})`);
  const feet = pile.filter((p) => p.name.startsWith('foot')), feet0 = list.filter((p) => p.name.startsWith('foot'));
  feet.forEach((p, i) => assert.equal(p.x, feet0[i].x, 'the feet stay where they stood'));
  assert.deepEqual(B.collapse(list, 1, { cx: 44, seed: 5 }).map((p) => [p.x, p.y]), pile.map((p) => [p.x, p.y]), 'repeatable');
});

test('bigbody collapse: it goes from the top, each piece falls and never rises above where it started', () => {
  const { list } = standing();
  const early = B.collapse(list, 0.25, { cx: 44, seed: 5 });
  const moved = (name) => { const a = list.find((p) => p.name === name), b = early.find((p) => p.name === name); return Math.hypot(a.x - b.x, a.y - b.y); };
  assert.ok(moved('shoulderN') > 2, 'the top has started');
  assert.equal(moved('pelvis'), 0, 'the bottom has not');
  let last = list;
  for (const k of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    const now = B.collapse(list, k, { cx: 44, seed: 5 });
    now.forEach((p, i) => assert.ok(p.y >= list[i].y - 2.01, `${p.name} at ${k}: no higher than it started (bar its one small hop)`));
    assert.ok(now.filter((p) => p.landed).length >= last.filter((p) => p.landed).length);
    last = now;
  }
});

// ---- rigs/bigbody.js: sockets and chains ------------------------------------------------------

test('bigbody sockets: six named points, and they follow the pieces when a list is given', () => {
  const { P, J, list } = standing();
  const S = B.sockets(J, P, D);
  assert.deepEqual(Object.keys(S), ['hand', 'offhand', 'head', 'back', 'feet', 'core']);
  for (const v of Object.values(S)) assert.ok(Number.isFinite(v.x + v.y + v.angle));
  assert.deepEqual([S.hand.x, S.hand.y], J.armN.hand);
  assert.deepEqual([S.feet.x, S.feet.y], [44, 90]);
  assert.ok(S.core.x > J.chest[0] && Math.abs(S.core.y - J.chest[1]) < D.ry * 0.3, 'the core is on the front of the chest');
  assert.ok(S.back.y < S.head.y, 'the back socket is on top of the near shoulder, above the head');
  const pile = B.collapse(list, 1, { cx: 44, seed: 5 });
  const T = B.sockets(J, P, D, pile);
  const chest = pile.find((p) => p.name === 'chest'), fist = pile.find((p) => p.name === 'fistN');
  assert.deepEqual([T.core.x, T.core.y], B.onPiece(chest, B.CORE_AT[0], B.CORE_AT[1]));
  assert.deepEqual([T.hand.x, T.hand.y], [fist.x, fist.y]);
  assert.deepEqual(T.feet, S.feet);
});

test('bigbody chainJoints: segments laid end to end, by list or by function', () => {
  const up = B.chainJoints(10, 40, [5, 5, 5], [PI, PI, PI]);
  assert.equal(up.length, 4);
  assert.ok(close(up[3][0], 10, 1e-9) && close(up[3][1], 25, 1e-9));
  const bent = B.chainJoints(0, 0, 4, (i) => PI / 2 + i * 0.3, 5);
  assert.equal(bent.length, 6);
  for (let i = 0; i < 5; i++) assert.ok(close(Math.hypot(bent[i + 1][0] - bent[i][0], bent[i + 1][1] - bent[i][1]), 4, 1e-9));
  assert.ok(bent[5][1] < bent[1][1], 'it curls upward as the angles grow');
  const mixed = B.chainJoints(0, 0, [3, 6], [0, PI / 2]);
  assert.ok(close(mixed[2][0], 6, 1e-9) && close(mixed[2][1], 3, 1e-9));
});

// ---- engine/creature.js: hornFit (fix round 1) ------------------------------------------

test('hornFit: the asked length comes back when the horn fits or no box is given', () => {
  const box = [2, 2, 94, 94];
  assert.equal(hornFit(40, 50, PI / 2, 12, { box }), 12);
  assert.equal(hornFit(40, 50, PI, 12, { curl: -0.75, width: 5, tip: 1.2, box }), 12);
  assert.equal(hornFit(90, 50, PI / 2, 12), 12, 'no box: nothing to fit');
  assert.equal(hornFit(90, 50, PI / 2, 0, { box }), 0);
});

test('hornFit: a straight horn is shortened to where its tip, with its width, meets the box, on each of the four sides', () => {
  const box = [2, 2, 94, 94], o = { width: 4, tip: 1, box };
  assert.ok(close(hornFit(80, 50, PI / 2, 20, o), 94 - 0.5 - 80), 'to the right');
  assert.ok(close(hornFit(12, 50, -PI / 2, 20, o), 12 - 2 - 0.5), 'to the left');
  assert.ok(close(hornFit(50, 10, PI, 20, o), 10 - 2 - 0.5), 'up');
  assert.ok(close(hornFit(50, 85, 0, 20, o), 94 - 0.5 - 85), 'down');
});

test('hornFit: a curled horn drawn at the fitted length stays inside the box, and one a little longer does not', () => {
  const box = [2, 2, 94, 94], w = 96;
  for (const [x, y, a, curl] of [[82, 56, PI - 0.5, -0.75], [84, 60, 2.2, -0.75], [88, 40, PI / 2 + 0.4, 0.9], [14, 12, -2.4, 0.6], [60, 88, 0.5, 0.8]]) {
    const o = { curl, width: 5.6, tip: 1.2 }, asked = 16;
    const fit = hornFit(x, y, a, asked, { ...o, box });
    assert.ok(fit > 0 && fit < asked, `it is shortened (${fit})`);
    const g = new Surface(w, w).fill(0, 0, w, w, hornIn(x, y, a, fit, o), '#ffffff', { shade: 0 });
    const b = g.bounds();
    assert.ok(b.x0 >= box[0] && b.y0 >= box[1] && b.x1 < box[2] && b.y1 < box[3], `inside: ${JSON.stringify(b)}`);
    // every point of its centre line, with the horn's half-width round it, is inside; a longer one has a point outside
    const out = (len) => hornPath(x, y, a, len, o).some(([px, py], i) => {
      if (!i) return false;
      const r = (5.6 + (1.2 - 5.6) * (i / 5)) / 2;
      return px + r > box[2] + 1e-6 || px - r < box[0] - 1e-6 || py + r > box[3] + 1e-6 || py - r < box[1] - 1e-6;
    });
    assert.ok(!out(fit) && out(fit + 0.5), 'the fitted length is the longest that fits');
  }
});

test('hornFit: when the root is already at the edge the answer is the least length, 0 unless told otherwise', () => {
  const box = [2, 2, 94, 94];
  assert.equal(hornFit(95, 50, PI / 2, 10, { box }), 0);
  assert.equal(hornFit(95, 50, PI / 2, 10, { box, least: 2 }), 2);
});
