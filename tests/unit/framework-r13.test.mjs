// Framework additions made with batch R13 (the skeleton soldier and the thicket imp):
//   engine/creature.js   membraneWing
//   engine/fx.js         leaves
//   rigs/humanoid.js     skeletonJoints, drawSkeleton, SHIELD_KINDS, shieldSize, shield, HEADGEAR_KINDS, headgearRise, headgear,
//                        IMP_EYES, impDims, drawImp, WING_KINDS, wing, TAIL_KINDS, tail, HORN_KINDS, horns
// and in its fix round 1:
//   rigs/humanoid.js     shieldPose, shieldAt, itemRest, itemAboveGround, layerPose, inFrame, heldBetween; drawImp's look took two
//                        optional settings (perk, earRim); drawSkeleton keeps falling bones out of the ground
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { membraneWing } from '../../engine/creature.js';
import { leaves } from '../../engine/fx.js';
import * as H from '../../rigs/humanoid.js';

const PI = Math.PI;
const pixels = (g) => { let n = 0; for (const c of g.data) if (c) n++; return n; };
const differ = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const has = (g, hex) => g.data.includes(col(hex));
const area = (inside) => { let n = 0; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (inside(x + 0.5, y + 0.5)) n++; return n; };
const HOOKS = ['behind', 'offhand', 'torso', 'head', 'item', 'front'];
const spy = (seen) => Object.fromEntries(HOOKS.map((name) => [name, (g, J, P, d) => { seen.push(name); assert.ok(g instanceof Surface && J.head && P && d); }]));

test('membraneWing: an arm, fingers fanned from the wrist and skin with scooped edges', () => {
  const w = membraneWing(40, 30, -PI / 2, 20, { fingers: 4 });
  assert.equal(w.tips.length, 4);
  assert.ok(Math.abs(Math.hypot(w.tips[0][0] - 40, w.tips[0][1] - 30) - 20) < 0.01, 'the leading finger reaches the full length');
  assert.ok(Math.abs(w.wrist[0] - 32) < 0.01 && Math.abs(w.wrist[1] - 30) < 0.01, 'the wrist is 0.4 of the way along the arm');
  assert.ok(w.inside((40 + w.wrist[0] + w.tips[0][0]) / 3 - 0.3, (30 + w.wrist[1] + w.tips[1][1]) / 3), 'the skin by the arm is inside');
  assert.ok(!w.inside(40, 5), 'far from the wing is outside');
  const flat = area(membraneWing(40, 30, -PI / 2, 20, { scoop: 0 }).inside), deep = area(membraneWing(40, 30, -PI / 2, 20, { scoop: 1 }).inside);
  assert.ok(flat > deep + 10, `deeper scoops cut skin away (${flat} > ${deep})`);
  const open = membraneWing(40, 30, -PI / 2, 20), shut = membraneWing(40, 30, -PI / 2, 20, { fold: 1 });
  const fan = (wing) => Math.hypot(wing.tips[0][0] - wing.tips.at(-1)[0], wing.tips[0][1] - wing.tips.at(-1)[1]);
  assert.ok(fan(shut) < fan(open) * 0.5, 'folding brings the finger tips together');
  const other = membraneWing(40, 30, -PI / 2, 20, { spread: -1.5 });
  assert.ok(other.tips.at(-1)[1] < 30 && open.tips.at(-1)[1] > 30, 'the sign of spread picks the side the skin hangs on');
});

test('skeletonJoints: with nothing asked for it is solve(), with the head on the half-pixel grid', () => {
  const d = H.dims({ height: 0.5, build: 0.3 }), P = H.pose('idle', 0, {}, d);
  const J = H.skeletonJoints(P, d), S = H.solve(P, d);
  assert.deepEqual(J.hip, S.hip);
  assert.deepEqual(J.armF.hand, S.armF.hand);
  assert.deepEqual(J.legB.ankle, S.legB.ankle);
  assert.deepEqual(J.head, [Math.round(S.head[0] * 2) / 2, Math.round(S.head[1] * 2) / 2]);
  assert.equal(J.bones.length, 10);
  assert.deepEqual(J.bones.map((b) => b.name), ['armB.upper', 'armB.fore', 'legB.thigh', 'legB.shin', 'legF.thigh', 'legF.shin', 'spine', 'skull', 'armF.upper', 'armF.fore']);
  assert.equal(J.fall, 0);
});

test('skeletonJoints: the rattle moves bones by whole pixels, keeps the feet planted, and closes with the loop', () => {
  const d = H.dims({ height: 0.5, build: 0.3 }), P = H.pose('idle', 0, {}, d);
  const still = H.skeletonJoints(P, d).bones;
  let moved = 0;
  for (const beat of [0.1, 0.37, 0.62, 0.9]) {
    const loose = H.skeletonJoints(P, d, { rattle: 1.3, beat }).bones;
    loose.forEach((b, i) => {
      const dx = b.a[0] - still[i].a[0], dy = b.a[1] - still[i].a[1];
      assert.ok(Number.isInteger(dx) && Number.isInteger(dy) && Math.abs(dx) <= 1 && Math.abs(dy) <= 1, `${b.name} moves by a whole pixel at most`);
      assert.deepEqual([b.b[0] - still[i].b[0], b.b[1] - still[i].b[1]], [dx, dy], `${b.name} moves as one piece`);
      if (b.name.endsWith('shin')) assert.deepEqual([dx, dy], [0, 0], 'a shin never moves');
      if (dx || dy) moved++;
    });
  }
  assert.ok(moved >= 8, `bones rattle (${moved} moves seen)`);
  assert.deepEqual(H.skeletonJoints(P, d, { rattle: 1.3, beat: 0 }).bones, H.skeletonJoints(P, d, { rattle: 1.3, beat: 1 }).bones, 'beat 1 is beat 0');
  assert.deepEqual(H.skeletonJoints(P, d, { rattle: 0.2, beat: 0.37 }).bones, still, 'a rattle under half a pixel is firm');
});

test('skeletonJoints: the collapse ends as a heap on the ground with the skull on top', () => {
  for (const height of [0, 0.5, 1]) {
    const d = H.dims({ height, build: 0.3 }), P = H.pose('hurt', 0.33, {}, d);
    const up = H.skeletonJoints(P, d), heap = H.skeletonJoints(P, d, { fall: 1, rattle: 1.3, beat: 0.4 });
    const len = (b) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]);
    heap.bones.forEach((b, i) => {
      assert.ok(b.landed, `${b.name} has landed`);
      assert.ok(Math.abs(len(b) - len(up.bones[i])) < 1e-6, `${b.name} keeps its length`);
      assert.ok(b.a[1] <= heap.gy && b.b[1] <= heap.gy, `${b.name} is not in the ground`);
    });
    const skullY = heap.head[1], others = heap.bones.filter((b) => b.name !== 'skull');
    assert.ok(others.every((b) => Math.min(b.a[1], b.b[1]) > skullY), 'the skull is the highest piece');
    assert.ok(skullY > up.head[1] + 5, 'the skull ends up well below where it was');
    assert.ok(heap.armF.hand[0] > up.hip[0] + 4 && heap.armB.hand[0] < up.hip[0] - 4, 'the hands end up on either side of the heap');
    // on the way down the low bones land first and the skull last, with one hop
    const mid = H.skeletonJoints(P, d, { fall: 0.65 });
    assert.ok(mid.bones.find((b) => b.name === 'legF.shin').landed && !mid.bones.find((b) => b.name === 'skull').landed);
    assert.ok(H.skeletonJoints(P, d, { fall: 0.9 }).head[1] < skullY - 1, 'the skull hops after it lands');
  }
});

test('drawSkeleton: bones, lit eye sockets, a jaw that drops, hooks in the order of draw()', () => {
  const d = H.dims({ height: 0.5, build: 0.3 }), P = H.pose('idle', 0, {}, d);
  const look = { bone: '#f0ead8', glow: '#4fd8ee' };
  const seen = [], g = new Surface(64, 64);
  const J = H.drawSkeleton(g, P, d, look, spy(seen));
  assert.deepEqual(seen, HOOKS);
  assert.ok(pixels(g) > 150 && pixels(g) < 600, `a thin body (${pixels(g)} pixels)`);
  assert.ok(has(g, '#4fd8ee'), 'the sockets are lit in the glow colour');
  assert.equal(J.eyes.length, 2);
  for (const [x, y] of J.eyes) assert.ok(g.get(Math.floor(x), Math.floor(y)), 'each eye middle is on the skull');
  const b = g.bounds();
  assert.ok(b.y1 === H.GROUND - 1 && b.x0 > 2 && b.x1 < 61 && b.y0 > 2, 'it stands on the ground row, inside the frame');

  const blink = new Surface(64, 64);
  H.drawSkeleton(blink, { ...P, blink: true }, d, look);
  assert.ok(!has(blink, '#4fd8ee'), 'a blink puts the lights out');
  const open = new Surface(64, 64);
  H.drawSkeleton(open, P, d, { ...look, jaw: 1 });
  assert.ok(differ(g, open) >= 6, 'an open jaw changes the skull');
  const thin = new Surface(64, 64), thick = new Surface(64, 64);
  H.drawSkeleton(thin, P, d, { ...look, thick: 1 }); H.drawSkeleton(thick, P, d, { ...look, thick: 3 });
  assert.ok(pixels(thick) > pixels(thin) + 40, 'thicker bones cover more');
  const heap = new Surface(64, 64);
  H.drawSkeleton(heap, P, d, { ...look, fall: 1 });
  assert.ok(heap.bounds().y0 > b.y0 + 8 && heap.bounds().y1 < H.GROUND, 'the heap is low and on the ground');
  const again = new Surface(64, 64);
  H.drawSkeleton(again, P, d, look);
  assert.equal(differ(g, again), 0, 'the same input draws the same pixels');
});

test('shield: three kinds that differ, sized by shieldSize, drawn round the attach point', () => {
  assert.deepEqual(H.SHIELD_KINDS, ['round', 'kite', 'broken']);
  assert.equal(H.shieldSize('none'), null);
  const drawn = {};
  for (const kind of H.SHIELD_KINDS) {
    const g = new Surface(64, 64), S = H.shieldSize(kind, 1);
    H.shield(g, { x: 30.4, y: 31.7 }, { kind, size: 1, metal: '#a8806a' });
    const b = g.bounds();
    assert.ok(b && b.x0 >= 30 - S.rx - 1 && b.x1 <= 30 + S.rx && b.y0 >= 32 - S.ry - 1 && b.y1 <= 32 + S.ry, `${kind} stays inside its size`);
    assert.ok(pixels(g) > 40, `${kind} is big enough to read (${pixels(g)})`);
    const big = new Surface(64, 64);
    H.shield(big, { x: 30, y: 32 }, { kind, size: 1.35, metal: '#a8806a' });
    assert.ok(pixels(big) > pixels(g) + 12, `${kind} grows with its size`);
    drawn[kind] = g;
  }
  assert.ok(differ(drawn.round, drawn.kite) > 10 && differ(drawn.round, drawn.broken) > 10 && differ(drawn.kite, drawn.broken) > 10);
  const none = new Surface(64, 64);
  H.shield(none, { x: 30, y: 32 }, { kind: 'none' });
  assert.equal(pixels(none), 0, 'an unknown kind draws nothing');
});

test('headgear: a helmet, a crown and a horned cap sit on the head and rise by headgearRise at most', () => {
  assert.deepEqual(H.HEADGEAR_KINDS, ['helmet', 'crown', 'horned']);
  assert.equal(H.headgearRise('none'), 0);
  const d = H.dims({ head: 0.55 }), J = { head: [29, 22.5] }, P = { sway: 0 };
  const top = 22.5 - d.headR;
  for (const kind of H.HEADGEAR_KINDS) for (const size of [0.65, 1, 1.35]) {
    const g = new Surface(64, 64);
    H.headgear(g, J, P, d, { kind, size, metal: '#a8806a' });
    const b = g.bounds();
    assert.ok(b, `${kind} draws`);
    assert.ok(b.y0 < top, `${kind} reaches above the top of the head`);
    assert.ok(b.y0 >= Math.floor(top - H.headgearRise(kind, size) - 1), `${kind} at size ${size} rises no further than headgearRise says (${b.y0} >= ${top - H.headgearRise(kind, size) - 1})`);
    assert.ok(b.y1 <= 22.5 + d.headR, `${kind} leaves the chin clear`);
  }
  for (const kind of H.HEADGEAR_KINDS) {
    const small = new Surface(64, 64), big = new Surface(64, 64);
    H.headgear(small, J, P, d, { kind, size: 0.65, metal: '#a8806a' }); H.headgear(big, J, P, d, { kind, size: 1.35, metal: '#a8806a' });
    assert.ok(differ(small, big) > 6, `${kind} changes with its size`);
  }
  const none = new Surface(64, 64);
  H.headgear(none, J, P, d, { kind: 'hat' });
  assert.equal(pixels(none), 0, 'an unknown kind draws nothing');
});

test('impDims and drawImp: a small pot-bellied body with ears, lit eyes and a grin, on the rig\'s joints', () => {
  const small = H.impDims({ size: 0 }), big = H.impDims({ size: 1 }), d = H.impDims();
  assert.ok(small.leg < d.leg && d.leg < big.leg && small.headR < big.headR);
  assert.ok(H.impDims({ belly: 1 }).hipR > H.impDims({ belly: 0 }).hipR + 1);
  assert.ok(d.leg + d.torso + 2 * d.headR < 26, 'an imp is about 20 pixels tall');
  for (const k of ['leg', 'torso', 'arm', 'headR', 'hipR', 'chestR', 'armW', 'legW', 'foot']) assert.ok(d[k] > 0, `impDims gives ${k}, as dims() does`);

  const P = H.pose('idle', 0, {}, d);
  const look = { body: '#4f9d57', accent: '#7a4fc4', glow: '#7a4fc4', ears: 0.5 };
  const seen = [], faces = {};
  for (const eyes of H.IMP_EYES) {
    const g = new Surface(64, 64);
    H.drawImp(g, P, d, { ...look, eyes }, eyes === 'sly' ? spy(seen) : {});
    assert.ok(pixels(g) > 150, `${eyes}: draws a body (${pixels(g)})`);
    assert.ok(has(g, '#4f9d57') && has(g, '#7a4fc4'), `${eyes}: body and ear colours are used`);
    faces[eyes] = g;
  }
  assert.deepEqual(seen, HOOKS);
  assert.deepEqual(H.IMP_EYES, ['sly', 'wide', 'angry']);
  assert.ok(differ(faces.sly, faces.wide) >= 4 && differ(faces.sly, faces.angry) >= 4 && differ(faces.wide, faces.angry) >= 4, 'the three faces differ');
  const b = faces.wide.bounds();
  assert.ok(b.x0 > 2 && b.y0 > 2 && b.x1 < 61 && b.y1 < H.GROUND, 'inside the rig frame, above the ground');

  const draw = (over, pose = P) => { const g = new Surface(64, 64); H.drawImp(g, pose, d, { ...look, eyes: 'wide', ...over }); return g; };
  assert.ok(draw({ ears: 1 }).bounds().x0 < draw({ ears: 0 }).bounds().x0 - 2, 'huge ears reach further back');
  assert.ok(differ(draw({}), draw({ glow: '#f4e06a' })) >= 6, 'the glow colour shows in the eyes');
  assert.ok(differ(draw({}), draw({ accent: '#f2c230' })) >= 4, 'the accent colour shows inside the ears');
  assert.ok(differ(draw({}), draw({}, { ...P, blink: true })) >= 4, 'a blink shuts the eyes');
  assert.ok(differ(draw({}), draw({}, { ...P, mouth: true })) >= 4, 'the mouth opens');
  // no doubled outline: the line round the body is only drawn over what is behind it, so it meets the silhouette only
  // where a thin thing (an ear tip, a far limb) passes behind the body
  const lone = new Surface(64, 64);
  H.drawImp(lone, P, d, { ...look, eyes: 'wide', rim: '#ff00ff' });
  let stray = 0;
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) if (lone.get(x, y) === col('#ff00ff') && (!lone.get(x - 1, y) || !lone.get(x + 1, y) || !lone.get(x, y - 1) || !lone.get(x, y + 1))) stray++;
  let rimmed = 0;
  for (const c of lone.data) if (c === col('#ff00ff')) rimmed++;
  assert.ok(rimmed >= 6, `the body is rimmed where it lies over its far limbs and ear (${rimmed} pixels)`);
  assert.ok(stray <= rimmed / 2, `most of the rim is inside the silhouette, not on it (${stray} of ${rimmed})`);
});

test('wing: a leaf, a skin wing and a pair of moth lobes from one root, that grow with length and turn with angle', () => {
  assert.deepEqual(H.WING_KINDS, ['leaf', 'bat', 'moth']);
  const draw = (o) => { const g = new Surface(64, 64); H.wing(g, { x: 40, y: 32 }, { paint: '#7a4fc4', length: 12, angle: -PI / 2, ...o }); return g; };
  const drawn = {};
  for (const kind of H.WING_KINDS) {
    const g = drawn[kind] = draw({ kind }), b = g.bounds();
    assert.ok(pixels(g) > 30, `${kind} is big enough to read (${pixels(g)})`);
    assert.ok(b.x0 >= 26 && b.x0 <= 30 && b.x1 <= 41, `${kind} reaches its length to the left of the root and no further (${b.x0}..${b.x1})`);
    assert.ok(pixels(draw({ kind, length: 16 })) > pixels(g) + 15, `${kind} grows with its length`);
    assert.ok(draw({ kind, angle: PI }).bounds().y0 < b.y0 - 4, `${kind} turns with its angle`);
    assert.ok(differ(g, draw({ kind, fold: 1 })) > 4, `${kind} pulls in when it folds`);
  }
  assert.ok(differ(drawn.leaf, drawn.bat) > 12 && differ(drawn.leaf, drawn.moth) > 12 && differ(drawn.bat, drawn.moth) > 12, 'the three wings differ');
  assert.equal(pixels(draw({ kind: 'none' })), 0, 'an unknown kind draws nothing');
});

test('tail and horns: each kind draws from its attach point, differs from the others and grows with its length', () => {
  assert.deepEqual(H.TAIL_KINDS, ['thin', 'leafy']);
  const tailOf = (o) => { const g = new Surface(64, 64); H.tail(g, { x: 40, y: 40 }, { body: '#4f9d57', tip: '#7a4fc4', ...o }); return g; };
  const thin = tailOf({ kind: 'thin' }), leafy = tailOf({ kind: 'leafy' });
  for (const g of [thin, leafy]) {
    assert.ok(has(g, '#4f9d57') && has(g, '#7a4fc4'), 'a tail in the body colour with a tip in the other');
    assert.ok(g.bounds().x1 <= 41 && g.bounds().x0 < 34, 'it trails behind its root');
  }
  assert.ok(differ(thin, leafy) > 12, 'the two tails differ');
  assert.ok(pixels(tailOf({ kind: 'thin', length: 1.35 })) > pixels(tailOf({ kind: 'thin', length: 0.65 })) + 5);
  assert.ok(differ(thin, tailOf({ kind: 'thin', sway: 1 })) > 3, 'it curls further with the sway');
  assert.equal(pixels(tailOf({ kind: 'none' })), 0);

  assert.deepEqual(H.HORN_KINDS, ['nubs', 'curled', 'twig']);
  const d = H.impDims(), J = { head: [30, 30.5] };
  const hornsOf = (o) => { const g = new Surface(64, 64); H.horns(g, J, d, o); return g; };
  const drawn = {};
  for (const kind of H.HORN_KINDS) {
    const g = drawn[kind] = hornsOf({ kind });
    assert.ok(pixels(g) >= 8, `${kind} draws (${pixels(g)})`);
    assert.ok(g.bounds().y0 < 30.5 - d.headR && g.bounds().y1 < 30.5, `${kind} stands on the top half of the head`);
    assert.ok(pixels(hornsOf({ kind, length: 1.35 })) > pixels(hornsOf({ kind, length: 0.65 })) + 4, `${kind} grows with its length`);
  }
  assert.ok(differ(drawn.nubs, drawn.curled) > 8 && differ(drawn.nubs, drawn.twig) > 8 && differ(drawn.curled, drawn.twig) > 8, 'the three differ');
  assert.ok(has(hornsOf({ kind: 'nubs', bone: '#f0ead8' }), '#f0ead8') && has(hornsOf({ kind: 'twig', wood: '#9a6a3e' }), '#9a6a3e'), 'the colours given are used');
  assert.equal(pixels(hornsOf({ kind: 'none' })), 0);
});

test('leaves: thrown up and out, they tumble down, stay in the box and are all there on the last frame', () => {
  const box = [4, 4, 44, 44];
  const at = (t, o = {}) => { const g = new Surface(48, 48); leaves(g, { t, x: 24, y: 22, count: 5, paints: ['#4f9d57', '#7a4fc4'], box, ...o }); return g; };
  const start = at(0), mid = at(0.5), end = at(1);
  for (const g of [start, mid, end]) {
    const b = g.bounds();
    assert.ok(b && b.x0 >= 4 && b.y0 >= 4 && b.x1 < 44 && b.y1 < 44, 'inside the box');
  }
  for (const g of [mid, end]) assert.ok(has(g, '#4f9d57') && has(g, '#7a4fc4'), 'once they have spread, both colours show');
  assert.ok(pixels(end) >= 20, `the last frame still has every leaf (${pixels(end)} pixels)`);
  assert.ok(mid.bounds().x1 - mid.bounds().x0 > start.bounds().x1 - start.bounds().x0 + 6, 'they spread out');
  assert.ok(end.bounds().y1 > mid.bounds().y1 + 2, 'then they fall');
  assert.equal(differ(at(0.5), mid), 0, 'the same input draws the same leaves');
  assert.ok(differ(at(0.5, { seed: 3 }), mid) > 4, 'another seed throws them another way');
  assert.ok(has(at(0.5, { rim: '#231b33' }), '#231b33'), 'a rim colour can be given');
  // pushed against the edge they stop there, never outside
  const edge = at(1, { x: 40, y: 40, dist: 30, gravity: 30 }).bounds();
  assert.ok(edge.x1 < 44 && edge.y1 < 44);
});

test('the rig\'s first body is untouched: draw() still paints the Hero as it did', async () => {
  // the sprite tests pin every pixel of the existing characters; this is the short version for this file's additions
  const { renderFrame, defaultParams } = await import('../../engine/sprite.js');
  const knight = (await import('../../sprites/knight.js')).default;
  const a = renderFrame(knight, 'idle', 0, defaultParams(knight)), b = renderFrame(knight, 'idle', 0, defaultParams(knight));
  assert.equal(differ(a, b), 0);
  assert.ok(pixels(a) > 400);
});

// ---- fix round 1 ----------------------------------------------------------------------------------------------

test('shieldPose and shieldAt: the far arm carries a shield behind the hip and brings it up in a block', () => {
  const d = H.dims({ height: 0.5, build: 0.3 });
  const carried = H.pose('idle', 0, {}, d);
  assert.equal(H.shieldPose(carried, 'idle', 0), false, 'carried, it is not raised');
  assert.ok(carried.armB.a < -0.3, `the far arm is held back (${carried.armB.a})`);
  const up = H.pose('block', 0.5, {}, d);
  assert.equal(H.shieldPose(up, 'block', 0.5), true, 'half-way through a block it is raised');
  assert.ok(up.armB.a > 0.9 && up.armB.e > 0.9, 'the far arm is brought up in front');
  for (const t of [0, 1]) {
    const P = H.pose('block', t, {}, d), Q = H.pose('block', t, {}, d), was = Q.armB.a;
    assert.equal(H.shieldPose(P, 'block', t), false, `a block starts and ends carried (t = ${t})`);
    assert.ok(Math.abs(P.armB.a - (-0.5 + 0.3 * (was + 0.15))) < 1e-9 && P.armB.e === 0.4);
  }
  const J = H.solve(carried, d), [hx, hy] = J.armB.hand;
  assert.deepEqual(H.shieldAt(J, 'round', 1, false), { x: hx - 1, y: hy - 1 }, 'carried: a pixel behind and above the far hand');
  assert.equal(H.shieldAt(J, 'round', 1, true).x, hx + 1, 'raised: a pixel in front of it');
  // a hand on the ground: the shield stays out of it, whatever its kind and size
  const low = { ...J, armB: { ...J.armB, hand: [hx, J.gy - 0.5] } };
  for (const kind of H.SHIELD_KINDS) for (const size of [0.65, 1, 1.35]) {
    const at = H.shieldAt(low, kind, size), g = new Surface(64, 64);
    H.shield(g, at, { kind, size });
    assert.ok(g.bounds().y1 < J.gy, `${kind} x${size}: no pixel in the ground (${g.bounds().y1} < ${J.gy})`);
  }
  assert.deepEqual(H.shieldAt(J, 'plank', 1), { x: hx - 1, y: hy - 1 }, 'an unknown kind is placed on the hand');
});

test('itemRest and itemAboveGround: an item let go lies on the ground, on its guard or its blade, never in it', () => {
  assert.ok(H.itemRest('sword', 13) < PI / 2 && H.itemRest('sword', 13) > PI / 2 - 0.3, 'a sword rests on its guard, the point down on the ground');
  assert.ok(H.itemRest('axe', 12) > PI / 2 + 0.3, 'an axe is propped up on its blade');
  assert.ok(Math.abs(H.itemRest('spear', 15) - PI / 2) < 0.1 && Math.abs(H.itemRest('staff', 18) - PI / 2) < 0.1, 'anything else lies flat');
  const gy = 58;
  for (const kind of ['sword', 'axe', 'spear']) for (const scale of [0.65, 1, 1.35]) for (const x of [30, 30.4, 30.9]) for (const y of [56.2, 57, 57.6]) {
    const item = { kind, ...H.itemSize(kind, scale) }, at = { x, y, angle: H.itemRest(kind, item.length) };
    const lying = H.itemAboveGround(at, gy, item), g = new Surface(64, 64);
    H.heldItem(g, lying, item);
    assert.ok(g.bounds().y1 <= gy - 1, `${kind} x${scale} at ${x},${y}: no pixel on or under the ground row (${g.bounds().y1})`);
    if (lying !== at) assert.equal(g.bounds().y1, gy - 1, `${kind} x${scale} at ${x},${y}: moved up no further than the row above the ground`);
    assert.ok(lying.x === at.x && lying.angle === at.angle && lying.y <= at.y && Number.isInteger(Math.round((at.y - lying.y) * 1e6) / 1e6), 'only moved up, by whole pixels');
  }
  // the flat sword that was the fault: without the lift its guard is under the ground
  const sword = { kind: 'sword', ...H.itemSize('sword', 1.35) }, flat = new Surface(64, 64);
  H.heldItem(flat, { x: 30, y: 57, angle: PI / 2 + 0.04 }, sword);
  assert.ok(flat.bounds().y1 >= gy, 'held at the hand, a level sword has its guard in the ground');
  const high = { x: 30, y: 40, angle: 2.5 };
  assert.equal(H.itemAboveGround(high, gy, sword), high, 'an item that is clear of the ground is left where it is');
  assert.equal(H.itemAboveGround(high, gy, { kind: 'nothing', length: 5 }), high, 'an unknown kind draws nothing and is left alone');
});

test('layerPose: a rig clip laid over a resting pose of your own adds only what the clip changes from its last frame', () => {
  const d = H.impDims(), m = { bounce: 0.5, stride: 0.5 };
  const hover = () => ({ ...H.pose('idle', 0, m, d), crouch: 0, lean: 0.1, headTilt: -0.05, lift: 2, armF: { a: 0.55, e: 0.9 }, armB: { a: 0.35, e: 1.1 }, footF: { x: 1.2, y: -1.4 }, footB: { x: -0.4, y: -0.7 } });
  const rest = hover();
  const end = H.layerPose(hover(), 'hurt', 1, m, d);
  for (const k of ['rootX', 'lean', 'headTilt', 'lift']) assert.equal(end[k], rest[k], `at the clip's end ${k} is the resting pose's`);
  assert.deepEqual([end.armF, end.armB], [rest.armF, rest.armB]);
  const base = hover(), hit = H.layerPose(base, 'hurt', 0, m, d);
  assert.equal(hit, base, 'the pose is changed in place and returned');
  const A = H.pose('hurt', 0, m, d), Z = H.pose('hurt', 1, m, d);
  assert.ok(Math.abs(hit.rootX - (rest.rootX + A.rootX - Z.rootX)) < 1e-9 && hit.rootX < rest.rootX - 1, 'the recoil throws it back');
  assert.ok(Math.abs(hit.lean - (rest.lean + A.lean - Z.lean)) < 1e-9 && Math.abs(hit.armF.a - (rest.armF.a + A.armF.a - Z.armF.a)) < 1e-9);
  assert.ok(Math.abs(hit.lift - (rest.lift - 0.5 * (A.crouch - Z.crouch))) < 1e-9 && hit.lift < rest.lift, 'a crouch becomes a drop of half as much');
  assert.ok(Math.abs(H.layerPose(hover(), 'hurt', 0, m, d, { crouch: 0 }).lift - rest.lift) < 1e-9, 'opt.crouch: 0 keeps the height');
  assert.equal(hit.flash, true, 'the flash of the hit is carried over');
  assert.equal(hit.sway, A.sway);
  assert.deepEqual([hit.footF, hit.footB], [rest.footF, rest.footB], 'the feet are left as the resting pose has them');
  assert.ok(Math.abs(H.layerPose(hover(), 'attack', 0.5, m, d).armF.a - rest.armF.a) > 0.3, 'an attack moves the near arm');
});

test('inFrame: a body drawn on the rig\'s layer is placed in a frame of another size and kept inside it', () => {
  const F = H.inFrame([48, 48], [26, 36]);
  assert.deepEqual([F.ox, F.oy], [26 - H.CX, 36 - H.GROUND]);
  assert.deepEqual(F.box, [3, 23, 49, 63], 'the frame less its border, in layer pixels');
  const g = new Surface(48, 48);
  let seen = null;
  const moved = F.draw(g, (layer) => { seen = layer; layer.dot(H.CX, H.GROUND - 1, '#ff0000'); layer.dot(H.CX + 3, H.GROUND - 5, '#00ff00'); });
  assert.ok(seen instanceof Surface && seen.w === H.SIZE[0] && seen.h === H.SIZE[1], 'the paint function is given a rig-sized layer');
  assert.deepEqual(moved, [0, 0], 'a drawing that fits is not moved');
  assert.equal(g.get(26, 35), col('#ff0000'), 'the rig\'s middle column and the row above its ground land on the anchor');
  assert.equal(g.get(29, 31), col('#00ff00'));
  assert.equal(pixels(g), 2);
  // a look that is too big on one side is moved by the pixels that bring it inside the border
  const wide = new Surface(48, 48);
  const [dx, dy] = F.draw(wide, (layer) => layer.rect(F.box[0] - 3, 40, 20, 4, '#ff0000', { shade: 0 }));
  assert.deepEqual([dx, dy], [3, 0]);
  const b = wide.bounds();
  assert.ok(b.x0 === 1 && b.x1 === 20 && pixels(wide) === 80, 'all of it is in the frame, a pixel from the edge');
  assert.deepEqual(F.draw(new Surface(48, 48), () => {}), [0, 0], 'nothing drawn: nothing moved');
  const out = F.sockets({ hand: { x: 30, y: 40, angle: 1 }, feet: { x: H.CX, y: H.GROUND, angle: 0 } });
  assert.deepEqual(out, { hand: { x: 30 + F.ox, y: 40 + F.oy, angle: 1 }, feet: { x: 26, y: 36, angle: 0 } }, 'sockets move with the layer, angles stay');
  // a frame bigger than the rig's: the box is the layer itself, less its border
  assert.deepEqual(H.inFrame([96, 96], [44, 90]).box, [1, 1, 63, 63]);
});

test('drawImp: perk stands the ears up, earRim keeps the far ear apart from a wing; left out, nothing changes', () => {
  const d = H.impDims(), P = H.pose('idle', 0, {}, d);
  const look = { body: '#4f9d57', accent: '#7a4fc4', glow: '#7a4fc4', ears: 0.8, eyes: 'wide' };
  const draw = (over, hooks) => { const g = new Surface(64, 64); H.drawImp(g, P, d, { ...look, ...over }, hooks); return g; };
  assert.equal(differ(draw({}), draw({ perk: 0 })), 0, 'perk 0 is the swept-back ears it had');
  const swept = draw({}).bounds(), up = draw({ perk: 1 }).bounds();
  assert.ok(up.y0 <= swept.y0 - 2, `pricked ears stand higher (${up.y0} < ${swept.y0})`);
  assert.ok(up.x0 >= swept.x0 + 2, `and reach less far back (${up.x0} > ${swept.x0})`);
  // a wing behind the head: the far ear gets a line round it only where it lies over the wing
  const behind = (g, J) => H.wing(g, { x: J.neck[0] - 1, y: J.neck[1] }, { kind: 'leaf', length: 20, angle: PI + 0.3, paint: '#7a4fc4' });
  const count = (g, hex) => { let n = 0; for (const c of g.data) if (c === col(hex)) n++; return n; };
  assert.equal(count(draw({ perk: 1, earRim: '#ff00ff' }), '#ff00ff'), 0, 'nothing behind the ear: no line');
  assert.ok(count(draw({ perk: 1, earRim: '#ff00ff' }, { behind }), '#ff00ff') >= 3, 'over a wing, the far ear is rimmed');
  assert.equal(count(draw({ perk: 1 }, { behind }), '#ff00ff'), 0);
});

test('drawSkeleton: on the way down no bone goes into the ground, however thick', () => {
  const d = H.dims({ height: 0.5, build: 0.3 });
  for (const thick of [1, 2, 3]) for (let fall = 0.05; fall <= 1; fall += 0.05) for (const hurt of [0, 0.33]) {
    const P = H.pose('hurt', hurt, {}, d), g = new Surface(64, 64);
    const J = H.drawSkeleton(g, P, d, { bone: '#f0ead8', glow: '#4fd8ee', thick, fall });
    assert.ok(g.bounds().y1 < J.gy, `thick ${thick}, fall ${fall.toFixed(2)}: lowest pixel ${g.bounds().y1} is above the ground row ${J.gy}`);
  }
});

test('heldBetween: a ball held in two hands touches both, on the side away from the body', () => {
  const J = { shoulder: [28, 30], armF: { hand: [34, 28] }, armB: { hand: [31, 24] } };
  for (const r of [1, 2, 3.5]) {
    const [x, y] = H.heldBetween(J, r);
    for (const hand of [J.armF.hand, J.armB.hand]) assert.ok(Math.abs(Math.hypot(x - hand[0], y - hand[1]) - (r + 2)) < 1e-9, `r ${r}: its rim is 2 px from the middle of each hand`);
    assert.ok(Math.hypot(x - 28, y - 30) > Math.hypot(32.5 - 28, 26 - 30), 'further from the shoulder than the hands are');
  }
  const [bx, by] = H.heldBetween(J, 3), [sx, sy] = H.heldBetween(J, 1);
  assert.ok(Math.hypot(bx - 32.5, by - 26) > Math.hypot(sx - 32.5, sy - 26), 'a bigger ball sits further out of the crook');
  assert.ok(Math.abs(Math.hypot(...H.heldBetween(J, 3, 4).map((v, i) => v - J.armF.hand[i])) - 7) < 1e-9, 'gap: the room between hand and rim');
  // hands too far apart to touch it: right between them
  assert.deepEqual(H.heldBetween({ shoulder: [28, 30], armF: { hand: [40, 30] }, armB: { hand: [30, 20] } }, 2), [35, 25]);
  // hands in the same place: just beyond them, away from the shoulder
  const [ox, oy] = H.heldBetween({ shoulder: [28, 30], armF: { hand: [34, 30] }, armB: { hand: [34, 30] } }, 2);
  assert.ok(Math.abs(Math.hypot(ox - 34, oy - 30) - 4) < 1e-6);
});
