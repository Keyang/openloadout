// Framework additions made with batch P06 (platformer enemies: spear-goblin, thorn-beetle).
//
// (rigs/crawler.js, the side-view rig for low many-legged bodies, was also added with this batch; R2 deleted it and its tests.)
// engine/creature.js: hornPath, hornIn (a curved tapering horn, tusk or claw)
// rigs/humanoid.js: club, dagger, EXTRA_ITEMS, itemSizeOf, drawItem (more held items); thrustTrail;
//   hood, hoodReach, skullcap (headgear); pointedEar, nose, NOSES (face parts)
// Fix round 1 added:
//   rigs/humanoid.js: tunic (a ragged skirt and rope belt for the torso hook), boneTopknot, boneTopknotRise (headgear),
//     noseTip (where a nose ends), itemClearOf (tips a carried item forward until it passes clear of some points)
//   engine/creature.js: CREATURE_EYES, creatureEye (the standard "Eyes" choice of a creature), feelerIn (a hair-thin feeler)
// R2: the tests of rigs/crawler.js are deleted (docs/data-sprites.md section 5); those of engine/creature.js and of the
// side-view rig (rigs/humanoid.js, still there until R2b) stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { PI } from '../../engine/motion.js';
import { ramp } from '../../engine/color.js';
import { hornPath, hornIn } from '../../engine/creature.js';
import * as H from '../../rigs/humanoid.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const paint = (test, w = 48, h = 48) => new Surface(w, h).fill(0, 0, w, h, test, '#ffffff');

// ---- engine/creature.js ---------------------------------------------------------------

test('hornPath and hornIn: a horn of the asked length that sets off the asked way, curls, and tapers to its tip', () => {
  const straight = hornPath(10, 20, PI / 2, 8);
  assert.equal(straight.length, 6); near(straight[5][0], 18); near(straight[5][1], 20);
  const up = hornPath(10, 20, PI / 2, 8, { curl: 1.2 });
  assert.ok(up[5][1] < 18 && up[5][0] < 18, 'a positive curl turns it upward');
  let len = 0; for (let i = 1; i < up.length; i++) len += Math.hypot(up[i][0] - up[i - 1][0], up[i][1] - up[i - 1][1]);
  near(len, 8);
  const g = paint(hornIn(10, 20, PI / 2, 10, { width: 4, tip: 1 }));
  const col = (x) => { let n = 0; for (let y = 0; y < 48; y++) if (g.get(x, y)) n++; return n; };
  assert.ok(col(11) >= 3 && col(18) <= 2 && col(11) > col(18), 'thick at the root, thin at the tip');
  assert.ok(lit(g) > 20);
});

// ---- rigs/humanoid.js -----------------------------------------------------------------

test('itemSizeOf: the standard kinds are unchanged, and club and dagger have sizes of their own', () => {
  assert.deepEqual(H.itemSizeOf('spear', 1.2), H.itemSize('spear', 1.2));
  assert.deepEqual(H.itemSizeOf('club', 1), H.EXTRA_ITEMS.club);
  assert.equal(H.itemSizeOf('dagger', 1.2).length, H.EXTRA_ITEMS.dagger.length * 1.2);
  assert.equal(H.itemSizeOf('none', 1), null);
  assert.ok(H.EXTRA_ITEMS.dagger.length < H.ITEMS.sword.length, 'a dagger is shorter than a sword');
  for (const kind of Object.keys(H.EXTRA_ITEMS)) assert.ok(!H.ITEM_KINDS.includes(kind), `${kind} is not one of the standard kinds`);
  assert.deepEqual(H.ITEM_KINDS, ['sword', 'axe', 'spear', 'staff', 'bow', 'gun'], 'the standard kinds are unchanged');
});

test('drawItem: a club and a dagger are drawn from the hand along the item angle; other kinds are drawn as heldItem draws them', () => {
  const at = { x: 30, y: 40, angle: PI };                       // pointing straight up
  for (const kind of ['club', 'dagger']) {
    const g = new Surface(64, 64), len = H.EXTRA_ITEMS[kind].length;
    H.drawItem(g, at, { kind, length: len, metal: ramp('#c2c9d6'), wood: '#a06a3c', hilt: '#7a4f33' });
    const b = g.bounds();
    assert.ok(lit(g) >= 10, `${kind} draws`);
    assert.ok(b.y0 >= 40 - len - 1 && b.y0 <= 40 - len + 2, `${kind}: its tip is its length above the hand (${b.y0})`);
    assert.ok(b.y1 <= 42, `${kind}: little of it is behind the hand`);
  }
  const club = new Surface(64, 64); H.drawItem(club, at, { kind: 'club', length: 11 });
  const row = (y) => { let n = 0; for (let x = 0; x < 64; x++) if (club.get(x, y)) n++; return n; };
  assert.ok(row(31) > row(38), 'the head of a club is fatter than its grip');
  const a = new Surface(64, 64), b = new Surface(64, 64), sword = { kind: 'sword', length: 13, metal: ramp('#c2c9d6') };
  H.drawItem(a, at, sword); H.heldItem(b, at, sword);
  assert.deepEqual([...a.data], [...b.data]);
});

test('thrustTrail: lines only while the point drives forward, never on the idle frames, never over the body', () => {
  const d = H.dims();
  const poseAt = (t) => H.pose('thrust', t, {}, d);
  const count = (t) => { const g = new Surface(64, 64); H.thrustTrail(g, poseAt, t, d, 15); return lit(g); };
  assert.equal(count(0), 0); assert.equal(count(1), 0);
  assert.equal(count(1 / 7), 0, 'not while the weapon is only being levelled');
  assert.ok(count(4 / 7) + count(3 / 7) >= 6, 'on the lunge');
  const g = new Surface(64, 64); g.rect(0, 0, 64, 64, '#101010'); const before = [...g.data];
  H.thrustTrail(g, poseAt, 4 / 7, d, 15);
  assert.deepEqual([...g.data], before, 'it never paints over what is already drawn');
});

const headOf = (hook) => {
  const d = H.dims({ head: 0.8 }), P = H.pose('idle', 0, {}, d), J = H.solve(P, d), g = new Surface(64, 64);
  hook(g, J, P, d);
  return { g, J, d, b: g.bounds() };
};

test('hood: covers the crown and the back of the head, leaves the face open, and its point grows with Size', () => {
  const { g, J, d, b } = headOf((g, J, P, d) => H.hood(g, J, P, d, { colour: '#7a4fc4', size: 1 }));
  const [hx, hy] = J.head, R = d.headR;
  assert.ok(g.get(Math.floor(hx), Math.floor(hy - R)), 'the crown is covered');
  assert.ok(g.get(Math.floor(hx - R), Math.floor(hy)), 'the back of the head is covered');
  assert.equal(g.get(Math.floor(hx + R * 0.6), Math.floor(hy + 1)), 0, 'the face is open');
  const big = headOf((g, J, P, d) => H.hood(g, J, P, d, { colour: '#7a4fc4', size: 1.8 }));
  assert.ok(big.b.x0 < b.x0, 'a bigger hood reaches further back');
  assert.ok(hx - b.x0 <= H.hoodReach(d, 1) + 1 && hx - big.b.x0 <= H.hoodReach(d, 1.8) + 1, 'hoodReach covers it');
});

test('skullcap: sits on the top of the head only, and a bigger one is deeper and taller', () => {
  const { J, d, b } = headOf((g, J, P, d) => H.skullcap(g, J, P, d, { colour: '#c2c9d6', size: 1 }));
  assert.ok(b.y1 < J.head[1], 'nothing below the middle of the head');
  assert.ok(b.y0 >= J.head[1] - d.headR - 1 - 3 - 1 && b.y0 < J.head[1] - d.headR, 'it rises 1 + 2 x size above the head');
  const big = headOf((g, J, P, d) => H.skullcap(g, J, P, d, { size: 1.8 }));
  assert.ok(big.b.y0 < b.y0 && big.b.y1 >= b.y1);
});

test('pointedEar: points back from the side of the head by its length, and trails the body', () => {
  const { J, d, b, g } = headOf((g, J, P, d) => H.pointedEar(g, J, P, d, { length: 9, colour: '#9bd18a', inner: '#5d9a52' }));
  assert.ok(b.x0 < J.head[0] - d.headR - 3, 'it sticks out behind the head');
  assert.ok(b.x0 >= J.head[0] - d.headR * 0.62 - 9 - 1);
  const short = headOf((g, J, P, d) => H.pointedEar(g, J, P, d, { length: 4 }));
  assert.ok(lit(short.g) < lit(g));
  const swung = headOf((g, J, P, d) => H.pointedEar(g, J, { ...P, sway: 1 }, d, { length: 9 }));
  assert.notDeepEqual([...swung.g.data], [...headOf((g, J, P, d) => H.pointedEar(g, J, { ...P, sway: -1 }, d, { length: 9 })).g.data]);
  const up = headOf((g, J, P, d) => H.pointedEar(g, J, P, d, { length: 9, angle: PI }));
  assert.ok(up.b.y0 < b.y0, 'the angle turns it');
});

test('nose: three shapes that all differ, in front of the face', () => {
  const draw = (kind) => headOf((g, J, P, d) => H.nose(g, J, P, d, { kind, colour: '#9bd18a' }));
  const [stub, long, hooked] = H.NOSES.map(draw);
  assert.deepEqual(H.NOSES, ['stub', 'long', 'hooked']);
  for (const n of [stub, long, hooked]) assert.ok(n.b.x1 + 1 > n.J.head[0] + n.d.headR, 'it sticks out of the face');
  assert.ok(long.b.x1 > stub.b.x1 + 2, 'the long nose reaches furthest');
  assert.ok(hooked.b.y1 > long.b.y1 && hooked.b.y1 > stub.b.y1, 'the hooked nose turns down');
  assert.ok(lit(stub.g) < lit(long.g) && lit(stub.g) < lit(hooked.g));
});

// ---- added in fix round 1: rigs/humanoid.js tunic, boneTopknot, boneTopknotRise; engine/creature.js creatureEye, CREATURE_EYES, feelerIn ----
import { creatureEye, CREATURE_EYES, feelerIn } from '../../engine/creature.js';
import { pack } from '../../engine/color.js';

const torsoOf = (clip, t, opt) => {
  const d = H.dims(), P = H.pose(clip, t, {}, d), J = H.solve(P, d), g = new Surface(64, 64);
  H.tunic(g, J, P, d, opt);
  return { g, J, P, d, b: g.bounds() };
};

test('tunic: standing it hangs below the hips, a belt adds a second colour, and ragged notches the hem', () => {
  const plain = torsoOf('idle', 0, { colour: '#7a4f33', ragged: 0 }), { J, d, b } = plain;
  assert.ok(b.y1 + 1 >= J.hip[1] + d.leg * 0.3, 'the skirt hangs below the hips');
  assert.ok(b.y0 >= J.hip[1] - 3, 'nothing above the waist');
  assert.ok(b.x0 < J.hip[0] - d.hipR && b.x1 > J.hip[0] + d.hipR - 1, 'it is wider than the hips');
  const ragged = torsoOf('idle', 0, { colour: '#7a4f33', ragged: 1 });
  assert.notDeepEqual([...ragged.g.data], [...plain.g.data], 'a ragged hem differs from a straight one');
  const colours = (g) => new Set([...g.data].filter(Boolean)).size;
  const belted = torsoOf('idle', 0, { colour: '#7a4f33', belt: '#7a4fc4', ragged: 0 });
  assert.ok(colours(belted.g) > colours(plain.g), 'the belt is a colour of its own');
  assert.ok(belted.g.get(Math.round(J.hip[0]), Math.round(J.hip[1] - 1.4)) !== plain.g.get(Math.round(J.hip[0]), Math.round(J.hip[1] - 1.4)), 'the belt lies across the waist');
  const long = torsoOf('idle', 0, { colour: '#7a4f33', ragged: 0, length: 0.7 });
  assert.ok(long.b.y1 > b.y1, 'length makes the skirt longer');
});

test('tunic: lying down the hem follows the spine toward the feet and nothing is drawn in the ground', () => {
  for (const build of [0, 0.5, 1]) for (const ragged of [0, 1]) for (let f = 0; f < 8; f++) {
    const d = H.dims({ build }), P = H.pose('die', f / 7, {}, d), J = H.solve(P, d), g = new Surface(64, 64);
    H.tunic(g, J, P, d, { colour: '#7a4f33', belt: '#7a4fc4', ragged });
    assert.ok(g.bounds().y1 <= J.gy - 1, `die frame ${f}, build ${build}: the tunic is in the ground (row ${g.bounds().y1})`);
  }
  const { J, d, b } = torsoOf('die', 1, { colour: '#7a4f33' });
  assert.ok(b.x1 - J.hip[0] >= d.leg * 0.3, 'the hem lies toward the feet, along the body');
  assert.ok(J.hip[0] - b.x0 <= 3, 'not toward the head');
  assert.ok(b.y1 - b.y0 <= 2 * d.hipR + 4, 'it lies flat: no taller than the hips are wide');
});

test('boneTopknot: a bone across a knot on the crown that sits higher and is longer with Size', () => {
  const draw = (size) => headOf((g, J, P, d) => H.boneTopknot(g, J, P, d, { size, colour: '#f0ead8', knot: '#7a4fc4' }));
  const small = draw(0.5), std = draw(1), big = draw(1.8);
  for (const n of [small, std, big]) {
    assert.ok(n.b.y1 <= n.J.head[1] - n.d.headR + 2, 'it sits on the crown, not on the face');
    assert.ok(lit(n.g) >= 10);
  }
  assert.ok(big.b.y0 < std.b.y0 && std.b.y0 <= small.b.y0, 'a bigger one rises higher');
  assert.ok(big.b.x1 - big.b.x0 > small.b.x1 - small.b.x0, 'and its bone is longer');
  for (const [n, size] of [[small, 0.5], [std, 1], [big, 1.8]]) assert.ok(n.J.head[1] - n.d.headR - n.b.y0 <= H.boneTopknotRise(size) + 0.5, `boneTopknotRise covers size ${size}`);
  assert.ok(new Set([...std.g.data].filter(Boolean)).size >= 2, 'the knot is a colour of its own');
});

// a Surface that counts reads, so a test can say a helper never reads pixels back
class NoRead extends Surface { constructor(w, h) { super(w, h); this.reads = 0; } get(x, y) { this.reads++; return super.get(x, y); } }
const eyeOn = (opt, at = [20, 20]) => { const g = new NoRead(40, 40); creatureEye(g, at[0], at[1], opt); return g; };

test('creatureEye: three styles that all differ, a blink that differs from each, and nothing outside its box', () => {
  assert.deepEqual(CREATURE_EYES, ['dots', 'angry', 'glow']);
  const base = { body: '#7a4f33', brow: '#3a2418', glow: '#f2c230' };
  const pics = CREATURE_EYES.map((style) => eyeOn({ ...base, style }));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.notDeepEqual([...pics[i].data], [...pics[j].data], `${CREATURE_EYES[i]} and ${CREATURE_EYES[j]} differ`);
  for (const style of CREATURE_EYES) {
    const open = eyeOn({ ...base, style }), shut = eyeOn({ ...base, style, blink: true });
    assert.notDeepEqual([...open.data], [...shut.data], `${style}: a blink shows`);
    assert.ok(lit(open) >= 4 && lit(shut) >= 2, `${style}: it draws`);
    for (const g of [open, shut]) {
      const b = g.bounds();
      assert.ok(b.x0 >= 20 - 2 && b.x1 <= 20 + 2 && b.y0 >= 20 - 2 && b.y1 <= 20 + 2, `${style}: inside the 5x5 box round its middle (${JSON.stringify(b)})`);
      assert.equal(g.reads, 0, `${style}: it does not read pixels back`);
    }
  }
});

test('creatureEye: the white and pupil keep apart on any body colour, and a glowing eye has a lit core, a glint and a darker rim', () => {
  for (const body of ['#f0ead8', '#3a2a5a', '#7a4f33']) {
    const g = eyeOn({ style: 'dots', body });
    const seen = new Set([...g.data].filter(Boolean));
    assert.ok(seen.size >= 2, `on ${body} the pupil and the white are two colours`);
    assert.ok(!seen.has(pack(...[1, 3, 5].map((i) => parseInt(body.slice(i, i + 2), 16)))), `on ${body} neither is the body colour`);
  }
  const glow = eyeOn({ style: 'glow', glow: '#f2c230' });
  const seen = new Set([...glow.data].filter(Boolean));
  assert.ok(seen.has(pack(0xf2, 0xc2, 0x30)), 'the core is the glow colour');
  assert.ok(seen.has(pack(255, 255, 255)), 'with a white glint');
  assert.ok(seen.size >= 3, 'and a rim of a darker tone');
  const bare = eyeOn({ style: 'glow', glow: '#f2c230', rim: false });
  assert.ok(lit(bare) < lit(glow), 'the rim can be left off');
});

test('feelerIn: a thin curved feeler of the asked length from its root, that droops with curl and stays thin', () => {
  const g = paint(feelerIn(10, 30, PI / 2 + 0.9, 8, { curl: -1.2 }));
  const b = g.bounds();
  assert.ok(lit(g) >= 6 && lit(g) <= 26, `a thin line of pixels (${lit(g)})`);
  assert.ok(b.x1 >= 15 && b.x1 <= 19, 'it reaches forward by most of its length');
  assert.ok(b.y0 < 28, 'it sets off upward');
  const straight = paint(feelerIn(10, 30, PI / 2, 8)).bounds();
  assert.ok(straight.y1 - straight.y0 <= 2 && straight.x1 >= 17, 'with no curl it is straight');
  const short = paint(feelerIn(10, 30, PI / 2, 4));
  assert.ok(lit(short) < lit(paint(feelerIn(10, 30, PI / 2, 8))));
  const knob = paint(feelerIn(10, 30, PI / 2, 8, { knob: 1.4 }));
  assert.ok(lit(knob) > lit(paint(feelerIn(10, 30, PI / 2, 8))), 'a knob thickens the tip');
});

test('noseTip: the furthest point forward of each nose, within a pixel of what nose() paints', () => {
  for (const head of [0.2, 0.5, 0.8, 1]) for (const kind of H.NOSES) {
    const d = H.dims({ head }), P = H.pose('idle', 0, {}, d), J = H.solve(P, d), g = new Surface(64, 64);
    H.nose(g, J, P, d, { kind, colour: '#9bd18a' });
    const [x, y] = H.noseTip(J, d, { kind }), b = g.bounds();
    assert.ok(Math.abs(b.x1 + 1 - x) <= 1.2, `${kind}, head ${head}: painted to ${b.x1 + 1}, noseTip says ${x.toFixed(2)}`);
    assert.ok(y >= b.y0 - 0.5 && y <= b.y1 + 1.5, `${kind}: the point is level with the nose`);
    const low = H.noseTip(J, d, { kind, low: true });
    assert.ok(Math.abs(b.y1 + 1 - low[1]) <= 1.2 && low[0] >= b.x0 - 0.5 && low[0] <= b.x1 + 1.5, `${kind}, head ${head}: painted down to ${b.y1 + 1}, noseTip low says ${low[1].toFixed(2)}`);
  }
  const d = H.dims(), J = { head: [30, 30] };
  assert.deepEqual(H.noseTip(J, d), H.noseTip(J, d, { kind: 'long' }), 'the long nose is the default');
  assert.ok(H.noseTip(J, d, { kind: 'long', size: 1.5 })[0] > H.noseTip(J, d, { kind: 'long' })[0]);
});

test('itemClearOf: tips a held item forward only as far as it takes to pass clear of a point, and never below level', () => {
  const d = H.dims(), P = H.pose('idle', 0, {}, d), J = H.solve(P, d), [hx, hy] = J.armF.hand, item = { length: 15, pad: 1 };
  const onIt = [hx + Math.sin(P.item) * 9, hy + Math.cos(P.item) * 9];             // a point right on the item, 9 px from the hand
  const a = H.itemClearOf(P, d, item, [onIt]);
  assert.ok(a < P.item && a >= PI / 2, `tipped forward (${P.item.toFixed(2)} -> ${a.toFixed(2)})`);
  const gap = (ang, [x, y]) => { const t = Math.min(15, Math.max(0, (x - hx) * Math.sin(ang) + (y - hy) * Math.cos(ang))); return Math.hypot(x - hx - Math.sin(ang) * t, y - hy - Math.cos(ang) * t); };
  assert.ok(gap(a, onIt) >= 2.2, 'the point is now clear of it');
  assert.ok(gap(a + 0.06, onIt) < 2.2 + 1.5, 'and it went no further than it had to');
  assert.equal(H.itemClearOf(P, d, item, [[hx - 20, hy - 20]]), P.item, 'a point nowhere near leaves the angle alone');
  assert.equal(H.itemClearOf(P, d, item, (joints) => { assert.deepEqual(joints.armF.hand, J.armF.hand); return [[hx - 20, hy]]; }), P.item, 'points may be worked out from the joints');
  assert.ok(H.itemClearOf(P, d, item, [onIt], { room: 5 }) < a, 'more room tips it further');
  const stuck = H.itemClearOf(P, d, item, [[hx + 3, hy - 1], [hx + 3, hy + 1]], { room: 6 });      // points it can never clear
  assert.ok(stuck >= PI / 2 && stuck < P.item, 'never below level');
  assert.equal(H.itemClearOf({ ...P, item: 1.2 }, d, item, [[hx - 20, hy]]), PI / 2, 'an item held below level is brought up to level');
  assert.equal(P.item, H.pose('idle', 0, {}, d).item, 'the pose is not changed');
});
