// Framework additions made with batch R12 (rogue-battler, road-bandit): a module of its own beside the side-view rig.
//   rigs/humanoid-figure.js   frame, render, sockets (a figure from a definition); STANCES, MOVES, move (stab, throw, toss, steal);
//                             HELD, heldSize, drawHeld, cutlass, claws, sling, throwingKnife, coinBag, speedLines;
//                             clothRamp, apart, scarf, scarfWrap, bandana, mask, wideHat, wideHatRise, wideHatReach, HEADGEAR, wear, wearReach,
//                             belt, PACKS, lootSack, quiver, pack
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, brightness, INK } from '../../engine/color.js';
import * as H from '../../rigs/humanoid.js';
import * as F from '../../rigs/humanoid-figure.js';

const PI = Math.PI;
const blank = () => new Surface(64, 64);
const pixels = (g) => { let n = 0; for (const c of g.data) if (c) n++; return n; };
const differ = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const has = (g, hex) => g.data.includes(col(hex));
const box = (g) => g.bounds();
const onEdge = (g) => { for (let i = 0; i < 64; i++) if (g.get(i, 0) || g.get(i, 63) || g.get(0, i) || g.get(63, i)) return true; return false; };
const finite = (P) => [P.rootX, P.lift, P.crouch, P.lean, P.headTilt, P.item, P.armF.a, P.armF.e, P.armB.a, P.armB.e, P.footF.x, P.footF.y, P.footB.x, P.footB.y].every(Number.isFinite);
/** One hook of the rig's draw() given something to draw, on a standing body; returns the picture and the joints. */
const withHook = (name, fn, clip = 'idle', t = 0) => {
  const g = blank(), d = H.dims(), P = H.pose(clip, t, {}, d);
  const J = H.draw(g, P, d, { skin: '#f6d3b0', top: '#3f6fd1', bottom: '#2a4a9a', boots: '#9a6a3e', hair: '#e6c96a', hairStyle: 'short' }, { [name]: (s, Jh) => fn(s, Jh, P, d) });
  return { g, J, P, d };
};
const plain = withHook('front', () => {}).g;

const ROGUE = {
  body: { height: 0.45, build: 0.3, head: 0.5 }, stance: 'crouched', moves: { attack: 'stab', shoot: 'throw', victory: 'toss' },
  look: { skin: '#f6d3b0', top: '#2f8f9d', bottom: '#19708e', boots: '#5a5f7a' }, hair: { style: 'short', colour: '#e6c96a' },
  held: { kind: 'daggers', length: 1, angle: 0, metal: '#c2c9d6', hilt: '#f2c230' }, headgear: { kind: 'hood', size: 1, colour: '#2f8f9d' },
  scarf: { kind: 'long', length: 1, colour: '#5a5f7a' }, belt: { colour: '#5a5f7a', buckle: '#f2c230' }, thrown: { metal: '#c2c9d6', hilt: '#9a6a3e' },
};
const BANDIT = {
  body: { height: 0.5, build: 0.75, head: 0.5 }, stance: 'slouched',
  look: { skin: '#f6d3b0', top: '#8e3a4a', bottom: '#c9a06a', boots: '#9a6a3e' }, hair: { style: 'short', colour: '#a8806a' },
  held: { kind: 'club', length: 1, angle: 0, wood: '#9a6a3e' }, headgear: { kind: 'wide hat', size: 1, colour: '#9a6a3e', band: '#8e3a4a' },
  mask: { colour: '#9a6a3e', drape: 3 }, coat: { colour: '#8e3a4a', belt: '#9a6a3e', ragged: 0.35, length: 0.42 },
  pack: { kind: 'loot sack', size: 1, colour: '#c9a06a', trim: '#9a6a3e' }, loot: { colour: '#e6c96a', tie: '#9a6a3e', glint: '#f2c230' },
};
const FRAMES = { idle: 8, walk: 8, run: 8, jump: 8, attack: 8, shoot: 6, hurt: 4, die: 8, victory: 8, steal: 8 };
const LOOPS = ['idle', 'walk', 'run', 'victory'];
const phase = (clip, i) => (LOOPS.includes(clip) ? i / FRAMES[clip] : i / (FRAMES[clip] - 1));
const shot = (def, clip, t) => { const g = blank(); F.render(g, clip, t, def); return g; };

// ---- cloth ----------------------------------------------------------------------------------------------------------

test('clothRamp: a dark cloth is painted a tone lighter, a light one as ramp() gives it, a ramp as it is', () => {
  const dark = F.clothRamp('#5a5f7a'), plainRamp = ramp('#5a5f7a');
  assert.equal(dark.base, plainRamp.light);
  assert.equal(dark.dark, plainRamp.base);
  assert.ok(brightness(dark.dark) > brightness(INK) + 0.2, 'its shadow is nowhere near the outline');
  assert.deepEqual(F.clothRamp('#e6c96a'), ramp('#e6c96a'));
  assert.equal(F.clothRamp(plainRamp), plainRamp);
});

test('apart: a colour is left alone when it differs enough from its neighbours, and moved to the nearest tone that does when not', () => {
  assert.equal(F.apart('#9a6a3e', '#f6d3b0'), '#9a6a3e');
  assert.equal(F.apart('#5a5f7a', '#2f8f9d', 0.05), '#5a5f7a', 'a small `least` only catches colours that are nearly the same');
  assert.notEqual(F.apart('#2f8f9d', '#2f8f9d', 0.05), '#2f8f9d');
  for (const [a, b] of [['#9a6a3e', '#9a6240'], ['#f0ead8', '#f6d3b0'], ['#c9423a', '#c8553a'], ['#2f8f9d', '#2f8f9d']]) assert.ok(Math.abs(brightness(F.apart(a, b)) - brightness(b)) >= 0.15, `${a} is told from ${b}`);
  // against two neighbours at once: a brown kerchief on a dark coat and a pale face ends up between them
  const k = brightness(F.apart('#9a6a3e', ['#8e3a4a', '#f6d3b0'], 0.2));
  assert.ok(k - brightness('#8e3a4a') >= 0.2 && brightness('#f6d3b0') - k >= 0.2, `between the two (${k.toFixed(2)})`);
  assert.ok(Math.abs(k - brightness('#9a6a3e')) < 0.2, 'and no further from its own colour than it has to be');
  assert.match(F.apart('#808080', ['#606060', '#a0a0a0'], 0.5), /^#[0-9a-f]{6}$/, 'when nothing is far enough it still answers with the best there is');
  // one neighbour may need more room than another
  const wide = brightness(F.apart('#9a6a3e', [['#8e3a4a', 0.3], ['#f6d3b0', 0.19]]));
  assert.ok(wide - brightness('#8e3a4a') >= 0.3 && brightness('#f6d3b0') - wide >= 0.19, `0.3 clear of the coat and 0.19 of the face (${wide.toFixed(2)})`);
  assert.equal(F.apart('#c9a06a', [['#8e3a4a', 0.3], ['#f6d3b0', 0.19]]), '#c9a06a', 'a colour that already sits between them is left alone');
});

// ---- held things ----------------------------------------------------------------------------------------------------

test('HELD and heldSize: the named things, scaled, with the rig\'s own kinds accepted and null for nothing', () => {
  assert.deepEqual(Object.keys(F.HELD), ['daggers', 'short sword', 'claws', 'club', 'cutlass', 'sling']);
  assert.ok(Object.isFrozen(F.HELD) && Object.isFrozen(F.HELD.daggers));
  const d = F.heldSize('daggers', 1.2);
  assert.equal(d.kind, 'dagger');
  assert.equal(d.pair, true);
  assert.ok(Math.abs(d.length - 9) < 1e-9);
  assert.equal(F.heldSize('short sword').kind, 'sword');
  assert.ok(F.heldSize('short sword').length < H.ITEMS.sword.length, 'a short sword is shorter than the rig\'s sword');
  assert.equal(F.heldSize('spear').length, H.ITEMS.spear.length);
  assert.equal(F.heldSize('none'), null);
  assert.equal(F.heldSize('banana'), null);
});

test('cutlass, claws and drawHeld: each draws from the hand the way it points, and longer when asked', () => {
  for (const kind of ['cutlass', 'claws', 'sling', 'club', 'dagger', 'sword']) {
    const g = blank();
    F.drawHeld(g, { x: 30, y: 30, angle: PI / 2 }, { kind, length: 10, metal: '#c2c9d6', wood: '#9a6a3e', hilt: '#f2c230', fling: 1 });
    assert.ok(pixels(g) >= 6, `${kind} draws`);
    assert.ok(box(g).x1 >= 37, `${kind} reaches forward of the hand`);
  }
  const short = blank(), long = blank();
  F.cutlass(short, { x: 20, y: 30, angle: PI / 2 }, { length: 8 });
  F.cutlass(long, { x: 20, y: 30, angle: PI / 2 }, { length: 14 });
  assert.ok(box(long).x1 - box(short).x1 >= 5, 'a longer cutlass reaches further');
  assert.ok(has(long, '#f2c230'), 'it has a guard');
  const up = blank();
  F.claws(up, { x: 30, y: 30, angle: PI }, { length: 6 });
  assert.ok(box(up).y0 <= 25 && box(up).y1 <= 31, 'claws pointing up rise above the fist');
  assert.ok(box(up).x1 - box(up).x0 >= 3, 'three blades fan out');
});

test('sling: it hangs straight down at rest, flies out along the hand when flung, and never hangs into the ground', () => {
  const at = { x: 30, y: 30, angle: PI / 2 };
  const hung = blank(), flung = blank(), low = blank();
  F.sling(hung, at, { length: 9, fling: 0 });
  F.sling(flung, at, { length: 9, fling: 1 });
  assert.ok(box(hung).y1 >= 38 && box(hung).x1 <= 34, 'at rest the pouch is under the hand');
  assert.ok(box(flung).x1 >= 39 && box(flung).y1 <= 34, 'flung, it is out in front');
  F.sling(low, { x: 30, y: 53, angle: PI / 2 }, { length: 9, fling: 0, floor: 58 });
  assert.ok(box(low).y1 <= 56, 'the pouch stays above the ground row');
});

test('throwingKnife and coinBag: small things with a part that tells them apart', () => {
  const k = blank();
  F.throwingKnife(k, { x: 30, y: 30, angle: PI / 2 }, { metal: '#c2c9d6', hilt: '#9a6a3e' });
  assert.ok(pixels(k) >= 4 && pixels(k) <= 8, 'a knife is a few pixels');
  assert.ok(has(k, '#9a6a3e') && has(k, ramp('#c2c9d6').light), 'grip and bright point');
  assert.ok(box(k).x1 - box(k).x0 >= 3 && box(k).y1 === box(k).y0, 'it lies along the way it points');
  const b = blank(), big = blank(), low = blank();
  F.coinBag(b, { x: 30, y: 30 }, { colour: '#e6c96a', tie: '#9a6a3e', coin: '#f2c230' });
  F.coinBag(big, { x: 30, y: 30 }, { size: 1.4 });
  assert.ok(box(b).y0 >= 29 && box(b).y1 >= 35, 'the bag hangs below the hand');
  assert.ok(has(b, '#9a6a3e') && has(b, '#f2c230'), 'a tie and a coin');
  assert.ok(pixels(big) > pixels(b) + 8, 'Size makes it bigger');
  F.coinBag(low, { x: 30, y: 56 }, { floor: 58 });
  assert.ok(box(low).y1 <= 57, 'never into the ground');
});

test('speedLines: nothing for a slow point; two lines along the motion that keep off the edge and off what is drawn', () => {
  const g = blank();
  assert.equal(F.speedLines(g, [30, 30], [32, 30]), false);
  assert.equal(pixels(g), 0);
  assert.equal(F.speedLines(g, [20, 30], [34, 30]), true);
  const b = box(g);
  assert.ok(b.y1 - b.y0 >= 4 && b.x1 - b.x0 >= 6, 'two lines, apart, along the motion');
  for (let x = 0; x < 64; x++) assert.equal(g.get(x, 30), 0, 'the path itself is left clear');
  const edge = blank();
  F.speedLines(edge, [40, 1], [63, 1]);
  assert.ok(!onEdge(edge), 'never on the frame edge');
  const full = blank();
  full.rect(0, 0, 64, 64, '#3f6fd1');
  const before = full.data.slice();
  F.speedLines(full, [20, 30], [40, 30]);
  assert.deepEqual(full.data, before, 'it never covers a drawn pixel');
});

// ---- worn things ----------------------------------------------------------------------------------------------------

test('scarf: a ribbon behind the neck that grows with length, streams back with flow, and stays in the frame', () => {
  const draw = (opt, clip, t) => differ(withHook('behind', (g, J, P, d) => F.scarf(g, J, P, d, opt), clip, t).g, withHook('behind', () => {}, clip, t).g);
  assert.equal(draw({ length: 0 }), 0);
  const short = draw({ length: 6, colour: '#c9423a' }), long = draw({ length: 14, colour: '#c9423a' });
  assert.ok(short >= 8 && long > short + 10, `a longer scarf shows more (${short}, ${long})`);
  const { g: hang, J } = withHook('behind', (g, Jh, P, d) => F.scarf(g, Jh, P, d, { length: 14, flow: 0, colour: '#c9423a', wave: [0] }));
  const { g: fly } = withHook('behind', (g, Jh, P, d) => F.scarf(g, Jh, P, d, { length: 14, flow: 1, colour: '#c9423a', wave: [0] }));
  const reach = (g) => { let x = 64, y = 0; for (let py = 0; py < 64; py++) for (let px = 0; px < 64; px++) if (g.get(px, py) === col('#c9423a')) { x = Math.min(x, px); y = Math.max(y, py); } return [x, y]; };
  assert.ok(reach(fly)[0] < reach(hang)[0] - 4, 'streaming, it reaches further back');
  assert.ok(reach(hang)[1] > reach(fly)[1] + 4, 'hanging, it reaches further down');
  assert.ok(reach(hang)[0] < J.neck[0], 'it is behind the neck');
  const huge = withHook('behind', (g, Jh, P, d) => F.scarf(g, Jh, P, d, { length: 60, flow: 1, wave: [1, -1, 1] })).g;
  assert.ok(!onEdge(huge), 'too long for the frame, it is drawn shorter');
  const down = withHook('behind', (g, Jh, P, d) => F.scarf(g, Jh, P, d, { length: 40, flow: 0, colour: '#c9423a' }), 'die', 1).g;
  assert.ok(reach(down)[1] <= H.GROUND - 1 || reach(down)[0] === 64, 'lying down, it never goes into the ground');
});

test('scarfWrap, bandana, mask, wideHat and belt each add their cloth to the body', () => {
  const eye = (J, d) => [Math.floor(J.head[0] + d.headR * 0.42), Math.floor(J.head[1] - 0.5)];
  const wrap = withHook('torso', (g, J, P, d) => F.scarfWrap(g, J, P, d, { colour: '#c9423a' }));
  assert.ok(differ(wrap.g, plain) >= 8 && has(wrap.g, '#c9423a'), 'the wrap shows round the neck');
  const band = withHook('head', (g, J, P, d) => F.bandana(g, J, P, d, { colour: '#c9423a' }));
  assert.ok(differ(band.g, plain) >= 20, 'the bandana shows');
  assert.equal(band.g.get(...eye(band.J, band.d)), col(INK), 'the eye is left clear');
  assert.ok(has(band.g, '#e6c96a'), 'hair still shows above the band');
  assert.ok(box(band.g).x0 < box(plain).x0, 'its tails hang behind the head');
  const bigBand = withHook('head', (g, J, P, d) => F.bandana(g, J, P, d, { colour: '#c9423a', size: 1.8 }));
  assert.ok(differ(bigBand.g, band.g) >= 4, 'Size changes it');
  const face = withHook('head', (g, J, P, d) => F.mask(g, J, P, d, { colour: '#c9423a' }));
  assert.ok(differ(face.g, plain) >= 15, 'the mask shows');
  assert.equal(face.g.get(...eye(face.J, face.d)), col(INK), 'the eye is left clear');
  const [ex, ey] = eye(face.J, face.d);
  assert.equal(face.g.get(ex, ey + 3), col('#c9423a'), 'the mouth is covered');
  const kerchief = withHook('head', (g, J, P, d) => F.mask(g, J, P, d, { colour: '#c9423a', drape: 4 }));
  assert.ok(box(kerchief.g).y1 >= box(face.g).y1 && differ(kerchief.g, face.g) >= 4, 'a drape hangs below the chin');
  const hat = withHook('head', (g, J, P, d) => F.wideHat(g, J, P, d, { colour: '#9a6a3e', band: '#c9423a' }));
  const top = hat.J.head[1] - hat.d.headR;
  assert.ok(box(hat.g).y0 < box(plain).y0 && box(hat.g).y0 >= top - F.wideHatRise(1) - 1, 'the crown rises above the head, no further than wideHatRise says');
  assert.ok(box(hat.g).x0 >= hat.J.head[0] - F.wideHatReach(hat.d, 1) - 1 && box(hat.g).x0 < box(plain).x0 - 1, 'the brim is wider than the head, no wider than wideHatReach says');
  assert.ok(has(hat.g, '#c9423a'), 'it has a band');
  assert.equal(hat.g.get(...eye(hat.J, hat.d)), col(INK), 'the brim does not cover the eye');
  assert.ok(F.wideHatRise(1.8) > F.wideHatRise(0.5) && F.wideHatReach(hat.d, 1.8) > F.wideHatReach(hat.d, 0.5));
  // (in the victory pose the near arm is up, so the front of the belt is in view)
  const waist = withHook('torso', (g, J, P, d) => F.belt(g, J, P, d, { colour: '#9a6a3e', buckle: '#f2c230' }), 'victory', 0.5);
  assert.ok(differ(waist.g, withHook('torso', () => {}, 'victory', 0.5).g) >= 4 && has(waist.g, '#f2c230') && has(waist.g, ramp('#9a6a3e').dark), 'a belt with a buckle');
  const lying = withHook('torso', (g, J, P, d) => F.belt(g, J, P, d, { colour: '#9a6a3e', buckle: '#f2c230' }), 'die', 1);
  assert.ok(differ(lying.g, withHook('torso', () => {}, 'die', 1).g) >= 2, 'the belt is still there on a body lying down');
});

test('wear and wearReach: every kind of HEADGEAR draws, none draws nothing, and the reach is two numbers', () => {
  assert.deepEqual(F.HEADGEAR.slice(0, 4), ['hood', 'bandana', 'mask', 'wide hat']);
  for (const kind of H.HEADGEAR_KINDS) assert.ok(F.HEADGEAR.includes(kind), `${kind} is offered`);
  const { d } = withHook('head', () => {});
  for (const kind of F.HEADGEAR) {
    const { g } = withHook('head', (s, J, P, dd) => F.wear(s, J, P, dd, { kind, size: 1, colour: '#c9423a' }));
    assert.ok(differ(g, plain) >= 10, `${kind} shows`);
    const [rise, behind] = F.wearReach(kind, 1, d);
    assert.ok(Number.isFinite(rise) && Number.isFinite(behind) && rise >= 0 && behind >= 0, `${kind} has a reach`);
    const top = withHook('head', () => {}).J.head[1] - d.headR;
    assert.ok(box(g).y0 >= top - rise - 1.5, `${kind} rises no further than wearReach says`);
  }
  assert.equal(differ(withHook('head', (s, J, P, dd) => F.wear(s, J, P, dd, { kind: 'none' })).g, plain), 0);
  assert.deepEqual(F.wearReach('none'), [0, 0]);
});

test('lootSack, quiver and pack: on the back, bigger with Size, and never in the ground', () => {
  assert.deepEqual([...F.PACKS], ['loot sack', 'quiver']);
  for (const kind of F.PACKS) {
    const one = withHook('behind', (g, J, P, d) => F.pack(g, J, P, d, { kind, size: 1, colour: '#c9a06a', trim: '#9a6a3e', leather: '#9a6a3e', fletching: '#f0ead8' }));
    const big = withHook('behind', (g, J, P, d) => F.pack(g, J, P, d, { kind, size: 1.35, colour: '#c9a06a', trim: '#9a6a3e', leather: '#9a6a3e', fletching: '#f0ead8' }));
    assert.ok(differ(one.g, plain) >= 12, `${kind} shows`);
    assert.ok(box(one.g).x0 < box(plain).x0, `${kind} sticks out behind the back`);
    assert.ok(differ(big.g, one.g) >= 6, `${kind} changes with Size`);
    const lying = withHook('behind', (g, J, P, d) => F.pack(g, J, P, d, { kind, size: 1.35 }), 'die', 1);
    assert.ok(box(lying.g).y1 <= H.GROUND - 1, `${kind} stays above the ground on a body lying down`);
  }
  assert.equal(differ(withHook('behind', (g, J, P, d) => F.pack(g, J, P, d, { kind: 'none' })).g, plain), 0);
  const sack = blank();
  F.lootSack(sack, { x: 40, y: 20 }, { colour: '#c9a06a', trim: '#9a6a3e' });
  assert.ok(box(sack).x1 <= 41 && has(sack, '#9a6a3e'), 'a sack hangs behind its attach point, with a patch');
  const tube = blank();
  F.quiver(tube, { x: 40, y: 30 }, { colour: '#9a6a3e', trim: '#f0ead8' });
  assert.ok(box(tube).y0 < 28 && has(tube, '#f0ead8'), 'the arrows stand above the shoulder');
});

// ---- stances and moves ----------------------------------------------------------------------------------------------

test('STANCES and MOVES: the names a definition may use', () => {
  assert.deepEqual(Object.keys(F.STANCES), ['upright', 'crouched', 'slouched']);
  assert.deepEqual([...F.MOVES], ['stab', 'throw', 'toss', 'steal']);
  for (const name of F.MOVES) assert.ok(!H.POSES.includes(name), `${name} is not one of the rig's own poses`);
  assert.ok(F.STANCES.crouched.lean > 0 && F.STANCES.crouched.crouch > F.STANCES.slouched.crouch);
});

test('move: every move is a whole pose at every phase, and starts from and ends on the idle pose (throw starts wound up)', () => {
  const d = H.dims(), m = { bounce: 0.5, stride: 0.5, hold: 0, pair: true };
  const rest = H.pose('idle', 0, m, d);
  for (const name of F.MOVES) {
    for (let i = 0; i <= 20; i++) assert.ok(finite(F.move(name, i / 20, m, d)), `${name} at ${i / 20}`);
    const end = F.move(name, name === 'toss' ? 0 : 1, m, d);
    for (const [a, b] of [[end.armF.a, rest.armF.a], [end.armB.a, rest.armB.a], [end.rootX, 0], [end.lean, 0], [end.crouch, 0], [end.item, rest.item]]) assert.ok(Math.abs(a - b) < 1e-6, `${name} ends on the idle pose`);
    if (name !== 'throw') assert.ok(Math.abs(F.move(name, 0, m, d).armF.a - rest.armF.a) < 1e-6, `${name} starts on the idle pose`);
  }
});

test('move: stab strikes on frames 3 and 5, with the other hand second when there is a thing in each', () => {
  const d = H.dims(), hand = (P, arm) => H.solve(P, d)[arm].hand[0];
  const pair = (t) => F.move('stab', t, { pair: true }, d), one = (t) => F.move('stab', t, { pair: false }, d);
  const rest = hand(pair(0), 'armF');
  assert.ok(hand(pair(2 / 7), 'armF') < rest - 2, 'the wind-up draws the near hand back');
  assert.ok(hand(pair(3 / 7), 'armF') > rest + 8, 'frame 3: the near hand is far out');
  assert.ok(hand(pair(5 / 7), 'armB') > rest + 9 && hand(pair(5 / 7), 'armF') < hand(pair(5 / 7), 'armB') - 6, 'frame 5: the far hand strikes, the near one is back');
  assert.ok(hand(one(3 / 7), 'armF') > rest + 8 && hand(one(5 / 7), 'armF') > rest + 9, 'one blade strikes twice');
  assert.ok(hand(one(4 / 7), 'armF') < hand(one(3 / 7), 'armF') - 5, 'and is drawn back between');
  assert.ok(pair(5 / 7).rootX <= 8 && pair(5 / 7).rootX > 4, 'the lunge travels, no more than 8 px');
});

test('move: throw fires on frame 1, toss has the thing in the air on frames 3 to 5, steal darts 8 px and shows the prize', () => {
  const d = H.dims();
  assert.equal(F.move('throw', 0.2, {}, d).fire, true);
  assert.equal(F.move('throw', 0, {}, d).fire, false);
  assert.equal(F.move('throw', 0, {}, d).knife, 'hand');
  assert.equal(F.move('throw', 0.2, {}, d).knife, 'air');
  assert.equal(F.move('throw', 0.6, {}, d).knife, null);
  assert.ok(Math.abs(H.solve(F.move('throw', 0.2, {}, d), d).armB.angle - PI / 2) < 0.2, 'the throwing arm is out level as the knife leaves');
  for (const [frame, flying] of [[0, false], [1, false], [2, false], [3, true], [4, true], [5, true], [6, false], [7, false]]) assert.equal(F.move('toss', frame / 8, {}, d).air != null, flying, `toss frame ${frame}`);
  assert.equal(F.move('toss', 0.5, {}, d).air, 0.5);
  assert.ok(Math.abs(F.move('steal', 3 / 7, {}, d).rootX - 8) < 0.2, 'the dart is 8 px');
  assert.ok(F.move('steal', 5 / 7, {}, d).lift >= 2.5, 'the hop back leaves the ground');
  assert.equal(F.move('steal', 5 / 7, {}, d).prize, true);
  assert.equal(F.move('steal', 5 / 7, {}, d).glint, 2);
  assert.equal(F.move('steal', 2 / 7, {}, d).prize, false);
  assert.equal(F.move('steal', 1, {}, d).prize, false);
});

// ---- a figure from a definition -------------------------------------------------------------------------------------

test('frame: the pose a clip is drawn with, what is held, and the stance laid over it', () => {
  assert.equal(F.frame('attack', 0.4, ROGUE).name, 'stab');
  assert.equal(F.frame('shoot', 0.2, ROGUE).name, 'throw');
  assert.equal(F.frame('walk', 0.2, ROGUE).name, 'walk');
  assert.equal(F.frame('attack', 0.4, BANDIT).name, 'attack');
  assert.equal(F.frame('attack', 0.4, { ...BANDIT, held: { kind: 'none' } }).name, 'punch');
  assert.equal(F.frame('attack', 0.4, { ...BANDIT, held: { kind: 'none' } }).held, null);
  assert.equal(F.frame('idle', 0, ROGUE).held.pair, true);
  assert.ok(F.frame('idle', 0, { ...ROGUE, held: { kind: 'daggers', length: 1.35 } }).held.length > F.frame('idle', 0, ROGUE).held.length);
  const up = F.frame('idle', 0, { ...ROGUE, stance: 'upright' }), low = F.frame('idle', 0, ROGUE);
  assert.ok(low.J.head[1] > up.J.head[1] + 1 && low.J.head[0] > up.J.head[0] + 1, 'crouched, the head is lower and further forward');
  assert.ok(low.J.armF.hand[1] < up.J.armF.hand[1] - 2, 'and the near hand is held up');
  const dead = F.frame('die', 1, ROGUE), flat = F.frame('die', 1, { ...ROGUE, stance: 'upright' });
  assert.ok(Math.abs(dead.P.lean - flat.P.lean) < 1e-9, 'a body lying down has no stance left');
  assert.deepEqual(F.frame('idle', 0, {}).stance, F.STANCES.upright);
  const [near, far] = F.frame('attack', 3 / 7, ROGUE).tips(3 / 7);
  assert.ok(near[0] > far[0] + 4, 'tips(): on frame 3 the near point leads');
});

test('sockets: the rig\'s attach points, with a muzzle at the throwing hand when the definition throws', () => {
  const s = F.sockets('shoot', 0.2, ROGUE);
  for (const name of ['hand', 'offhand', 'head', 'back', 'feet', 'muzzle']) assert.ok(Number.isFinite(s[name].x) && Number.isFinite(s[name].y) && Number.isFinite(s[name].angle), name);
  assert.ok(Math.abs(s.muzzle.angle - PI / 2) < 1e-9 && s.muzzle.x > s.feet.x + 6, 'the knife leaves forward of the body');
  assert.equal(F.sockets('idle', 0, BANDIT).muzzle, undefined);
  const F0 = F.frame('idle', 0, ROGUE);
  assert.deepEqual([F.sockets('idle', 0, ROGUE).hand.x, F.sockets('idle', 0, ROGUE).hand.y], F0.J.armF.hand);
  assert.equal(F.sockets('idle', 0, ROGUE).offhand.angle, F0.P.item2);
});

test('render: every frame of every clip stays inside the frame and is never empty, at the smallest and the biggest settings', () => {
  const sizes = [{}, { body: { height: 0, build: 0, head: 0 } }, { body: { height: 1, build: 1, head: 1 } }];
  const kits = [
    [ROGUE, ['idle', 'walk', 'run', 'jump', 'attack', 'shoot', 'hurt', 'die', 'victory'], [{}, { held: { kind: 'short sword', length: 1.35, angle: -10 }, headgear: { kind: 'bandana', size: 1.8 }, scarf: { kind: 'long', length: 1.35 } }, { held: { kind: 'claws', length: 1.35, angle: 40 }, headgear: { kind: 'mask', size: 1.8 }, scarf: { kind: 'none' } }, { held: { kind: 'none' }, headgear: { kind: 'none' } }]],
    [BANDIT, ['idle', 'walk', 'attack', 'steal', 'hurt', 'die'], [{}, { held: { kind: 'cutlass', length: 1.35, angle: -10 }, headgear: { kind: 'wide hat', size: 1.8, colour: '#9a6a3e' }, pack: { kind: 'quiver', size: 1.35 } }, { held: { kind: 'sling', length: 1.35, angle: 40 }, headgear: { kind: 'hood', size: 1.8, colour: '#8e3a4a' }, pack: { kind: 'loot sack', size: 1.35 } }, { held: { kind: 'none' }, headgear: { kind: 'none' }, pack: { kind: 'none' } }]],
  ];
  for (const [base, clips, variants] of kits) for (const size of sizes) for (const v of variants) {
    const def = { ...base, ...size, ...v };
    for (const clip of clips) for (let i = 0; i < FRAMES[clip]; i++) {
      const g = shot(def, clip, phase(clip, i));
      assert.ok(pixels(g) > 60, `${clip} ${i} draws a body`);
      assert.ok(!onEdge(g), `${clip} ${i} keeps off the frame edge (${def.held?.kind}, ${def.headgear?.kind}, height ${def.body?.height})`);
    }
  }
});

test('render: one-shot clips end on the picture idle starts with, and the ones that start from rest begin on it', () => {
  const rogueIdle = shot(ROGUE, 'idle', 0), banditIdle = shot(BANDIT, 'idle', 0);
  for (const clip of ['jump', 'attack', 'shoot', 'hurt']) assert.equal(differ(shot(ROGUE, clip, 1), rogueIdle), 0, `rogue ${clip} ends on idle`);
  for (const clip of ['jump', 'attack']) assert.equal(differ(shot(ROGUE, clip, 0), rogueIdle), 0, `rogue ${clip} starts on idle`);
  for (const clip of ['attack', 'steal', 'hurt']) assert.equal(differ(shot(BANDIT, clip, 1), banditIdle), 0, `bandit ${clip} ends on idle`);
  for (const clip of ['attack', 'steal']) assert.equal(differ(shot(BANDIT, clip, 0), banditIdle), 0, `bandit ${clip} starts on idle`);
});

test('render: the parts of a definition show, and taking one off leaves nothing of it', () => {
  const base = shot(ROGUE, 'idle', 0);
  const bare = shot({ ...ROGUE, held: { kind: 'none' }, headgear: { kind: 'none' }, scarf: { kind: 'none' }, belt: null }, 'idle', 0);
  assert.ok(differ(base, bare) > 60);
  assert.ok(!has(bare, '#f2c230') && !has(bare, ramp('#5a5f7a').light), 'no hilt, no buckle, no scarf left behind');
  assert.ok(has(bare, '#e6c96a'), 'with the hood off the hair shows');
  assert.ok(!has(base, '#e6c96a'), 'the hood hides the hair');
  const sword = shot({ ...ROGUE, held: { ...ROGUE.held, kind: 'short sword' } }, 'idle', 0);
  assert.ok(differ(sword, base) > 12, 'another weapon is another picture');
  const gold = shot({ ...ROGUE, held: { ...ROGUE.held, metal: '#f2c230' } }, 'idle', 0);
  assert.ok(differ(gold, base) > 8, 'the blades take the metal colour');
  const tilted = shot({ ...ROGUE, held: { ...ROGUE.held, angle: 40 } }, 'idle', 0);
  assert.ok(differ(tilted, base) > 8, 'the hold angle turns them');
  // the thrown knife is the same whatever is held, and its metal is its own
  const fired = shot(ROGUE, 'shoot', 0.2), firedGold = shot({ ...ROGUE, held: { kind: 'none', metal: '#f2c230' } }, 'shoot', 0.2);
  assert.ok(has(fired, '#9a6a3e') && has(firedGold, '#9a6a3e'), 'the knife is in the air on the fire frame, also with nothing held');
  assert.equal(differ(shot({ ...ROGUE, held: { kind: 'none', metal: '#f2c230' } }, 'shoot', 0.2), shot({ ...ROGUE, held: { kind: 'none', metal: '#a8806a' } }, 'shoot', 0.2)), 0, 'with nothing held the metal colour changes nothing');
  // the bandit's loot
  const prize = shot(BANDIT, 'steal', 5 / 7);
  assert.ok(has(prize, '#e6c96a') && has(prize, '#f2c230') && has(prize, '#ffffff'), 'the coin bag is held up and glints');
  assert.ok(!has(shot(BANDIT, 'steal', 2 / 7), '#e6c96a'), 'there is no bag before the snatch');
  // a white first frame for a hit
  const hit = shot(BANDIT, 'hurt', 0);
  assert.ok(pixels(hit) > 100 && !has(hit, '#8e3a4a') && has(hit, '#ffffff'), 'hurt frame 0 is the recoil in white');
});

test('render: a toss throws what is held when it can be thrown, and a knife from the belt when it cannot', () => {
  const up = shot(ROGUE, 'victory', 0.5), resting = shot(ROGUE, 'idle', 0);
  assert.ok(box(up).y0 < box(resting).y0 - 6, 'the dagger is high above the head at the top of the toss');
  const fists = shot({ ...ROGUE, held: { kind: 'none' } }, 'victory', 0.5);
  assert.ok(has(fists, '#9a6a3e') && box(fists).y0 < box(resting).y0 - 2, 'with nothing held a knife is tossed');
  const clawed = shot({ ...ROGUE, held: { ...ROGUE.held, kind: 'claws' } }, 'victory', 0.5);
  assert.ok(has(clawed, '#9a6a3e'), 'claws stay on the fists: a knife is tossed');
});
