// Framework additions of batch R07 (town-guard, farm-kid), all in rigs/topdown.js: a manner of moving laid over a
// standard pose (frameWith, MANNERS), worn parts (tabard, kettleHat, shield, hairBow, hairdo) and the things
// townsfolk hold (TOWN_ITEMS, townItemSize, townItem).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, INK } from '../../engine/color.js';
import * as T from '../../rigs/topdown.js';

const LOOK = { skin: '#f6d3b0', top: '#a8a4a0', bottom: '#7e84a0', boots: '#9a6a3e', hair: '#5a3a22', hairStyle: 'short' };
const BLUE = '#3f6fd1', WHEAT = '#e6c96a', STEEL = '#c2c9d6', RED = '#c8553a';
const [W, H] = T.SIZE;
const BODIES = { smallest: { height: 0, build: 0, head: 0 }, standard: {}, largest: { height: 1, build: 1, head: 1 } };
const lit = (g, c) => { const out = [], v = c === undefined ? null : col(c); for (let i = 0; i < g.data.length; i++) if (v === null ? g.data[i] : g.data[i] === v) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
const tones = (g, c) => { const r = ramp(c); return [...new Set([r.light, r.base, r.dark, r.deep])].flatMap((k) => lit(g, k)); };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const phases = (action) => { const c = T.STANDARD[action]; return Array.from({ length: c.frames }, (_, f) => (c.loop ? f / c.frames : f / (c.frames - 1))); };
/** A standing body facing `dir` with one hook; returns the surface and the joints. */
function worn(dir, hooks, dimsOf = {}, look = LOOK, action = 'idle', t = 0) {
  const g = new Surface(W, H), d = T.dims(dimsOf), P = T.pose(action, dir, t, {}, d);
  const J = T.draw(g, dir, P, d, look, hooks);
  return { g, J, P, d };
}
/** The picture of a frame F (bare body), to compare two poses by what they draw. */
const shot = (F) => { const g = new Surface(W, H); F.draw(g, LOOK, {}); return g; };
const inFrame = (g) => { const b = g.bounds(); return b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1; };

// ---- frameWith and MANNERS ---------------------------------------------------------------------------

test('frameWith: with no manner it is frame(); a manner changes the pose the picture and the sockets share', () => {
  for (const clip of ['idle_down', 'walk_side', 'block', 'run_up']) for (const t of [0, 0.25, 0.5]) {
    assert.deepEqual(T.frameWith(clip, t, { bounce: 0.7 }, {}).P, T.frame(clip, t, { bounce: 0.7 }, {}).P, `${clip} at ${t}`);
  }
  const lift = (P) => { P.armF.u += 4; };
  const A = T.frame('idle_down', 0, {}, {}), B = T.frameWith('idle_down', 0, {}, { manner: lift });
  assert.ok(B.sockets().hand.y <= A.sockets().hand.y - 3, 'the socket follows the manner');
  const ga = new Surface(W, H), gb = new Surface(W, H);
  A.draw(ga, LOOK, {}); B.draw(gb, LOOK, {});
  assert.ok(diff(ga, gb) > 4, 'and so does the picture');
  // a list of manners is applied in order
  const C = T.frameWith('idle_down', 0, {}, { manner: [lift, lift] });
  assert.ok(C.sockets().hand.y < B.sockets().hand.y);
});

test('MANNERS.rock: the idle rocks from heel to toe, the loop closes, and other actions are left alone', () => {
  assert.equal(typeof T.MANNERS.rock, 'function');
  for (const dir of T.DIRECTIONS) {
    const xs = new Set(), ys = new Set();
    for (const t of phases('idle')) {
      const F = T.frameWith(`idle_${dir}`, t, { bounce: 0.7 }, { manner: T.MANNERS.rock });
      const J = T.solve(dir, F.P, F.d);
      xs.add(J.head[0]); ys.add(J.headTop);
      assert.equal(J.gy, T.GROUND, 'the feet stay on the ground');
    }
    assert.ok(xs.size + ys.size >= 4, `${dir}: the head moves in whole pixels (${[...xs]} / ${[...ys]})`);
    if (dir === 'side') assert.ok(xs.size >= 3, 'seen from the side the body leans back and forward');
    assert.equal(diff(shot(T.frameWith(`idle_${dir}`, 1, {}, { manner: T.MANNERS.rock })), shot(T.frameWith(`idle_${dir}`, 0, {}, { manner: T.MANNERS.rock }))), 0, 'periodic in t');
    assert.deepEqual(T.frameWith(`walk_${dir}`, 0.3, {}, { manner: T.MANNERS.rock }).P, T.frame(`walk_${dir}`, 0.3, {}, {}).P);
  }
});

test('MANNERS.flail: in a run both hands go above the shoulders and wave, on every body, inside the frame', () => {
  for (const [name, dimsOf] of Object.entries(BODIES)) for (const dir of T.DIRECTIONS) {
    let above = 0; const hands = new Set();
    for (const t of phases('run')) {
      const F = T.frameWith(`run_${dir}`, t, { ...dimsOf, bounce: 1, stride: 1 }, { manner: T.MANNERS.flail, tall: [22, 27] });
      const J = T.solve(dir, F.P, F.d);
      // going down and up both hands are over the shoulders; from the side they are thrown out level, clear of the face
      if (dir === 'side' ? Math.abs(J.armF.hand[1] - J.armF.shoulder[1]) <= 2.5 && J.armF.hand[1] >= J.head[1] + F.d.headH / 2 - 1 : J.armF.hand[1] < J.armF.shoulder[1] && J.armB.hand[1] < J.armB.shoulder[1]) above++;
      hands.add(`${Math.round(J.armF.hand[0])},${Math.round(J.armF.hand[1])}`);
      const g = new Surface(W, H); F.draw(g, LOOK, {}); F.finish(g);
      assert.ok(inFrame(g), `${name} run_${dir} at ${t} leaves the frame`);
    }
    assert.ok(above >= (dir === 'side' ? 8 : 6), `${name} ${dir}: hands raised in ${above} of 8 frames`);
    assert.ok(hands.size >= 3, `${name} ${dir}: the hand waves (${hands.size} places)`);
  }
  assert.deepEqual(T.frameWith('idle_down', 0.3, {}, { manner: T.MANNERS.flail }).P, T.frame('idle_down', 0.3, {}, {}).P);
});

test('MANNERS.bar: an empty-handed block holds one arm out level; with something held the block is the standard one', () => {
  for (const dir of T.DIRECTIONS) {
    const clip = dir === 'down' ? 'block' : `block_${dir}`;
    const F = T.frameWith(clip, 0.5, {}, { manner: T.MANNERS.bar }), J = T.solve(dir, F.P, F.d);
    const [sx, sy] = J.armF.shoulder, [hx, hy] = J.armF.hand;
    assert.ok(Math.abs(hy - sy) <= 1.5, `${dir}: the arm is level (${sy} -> ${hy})`);
    assert.ok(Math.abs(hx - sx) >= 5, `${dir}: and stretched out (${sx} -> ${hx})`);
    assert.ok(J.armB.hand[1] > J.armB.shoulder[1] + 3, `${dir}: the other arm hangs`);
    const start = T.frameWith(clip, 0, {}, { manner: T.MANNERS.bar });
    assert.equal(diff(shot(start), shot(T.frame(clip, 0, {}, {}))), 0, 'it starts from the standing pose');
    const item = T.itemSize('sword', 1);
    assert.deepEqual(T.frameWith(clip, 0.5, {}, { manner: T.MANNERS.bar, item }).P, T.frame(clip, 0.5, {}, { item }).P);
    // a pole weapon is brought level across the body: its far end on one side of the body, its butt on the other
    const pole = T.townItemSize('halberd', 1), G = T.frameWith(clip, 0.5, {}, { manner: [T.MANNERS.attention, T.MANNERS.bar], item: pole, carry: 'upright' });
    const sk = G.sockets(), JG = T.solve(dir, G.P, G.d), butt = [sk.hand.x - Math.sin(sk.hand.angle) * pole.back, sk.hand.y - Math.cos(sk.hand.angle) * pole.back];
    if (dir !== 'side') {
      assert.ok(Math.abs(sk.muzzle.y - sk.hand.y) <= 7 && Math.abs(sk.muzzle.x - sk.hand.x) >= 18, `${dir}: the pole is level (${JSON.stringify(sk.muzzle)})`);
      assert.ok((sk.muzzle.x - JG.bx) * (butt[0] - JG.bx) < 0, `${dir}: it crosses the body`);
      assert.ok(sk.muzzle.x > 2 && sk.muzzle.x < W - 2 && butt[0] > 2 && butt[0] < W - 2, `${dir}: inside the frame`);
    }
  }
});

test('MANNERS.attention: a held thing is carried closer to upright wherever it is at rest, and a guard pose is left alone', () => {
  const item = T.townItemSize('halberd', 1), up = (a) => Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI)));
  for (const dir of T.DIRECTIONS) {
    for (const action of ['idle', 'walk']) for (const t of phases(action)) {
      const A = T.frame(`${action}_${dir}`, t, {}, { item, carry: 'upright' }), B = T.frameWith(`${action}_${dir}`, t, {}, { item, carry: 'upright', manner: T.MANNERS.attention });
      assert.ok(up(B.P.item) < up(A.P.item) * (dir === 'side' ? 0.85 : 0.65), `${action} ${dir}: ${up(B.P.item)} against ${up(A.P.item)}`);
      const g = new Surface(W, H);
      B.draw(g, LOOK, { item: (gg, J) => T.townItem(gg, B.direction, B.hand(J), { kind: 'halberd', length: B.item.length }) });
      assert.ok(inFrame(B.finish(g)));
    }
    const clip = dir === 'down' ? 'block' : `block_${dir}`;
    // a one-shot starts from the same angle the idle stands at, so nothing pops between the clips
    const idle0 = T.frameWith(`idle_${dir}`, 0, {}, { item, carry: 'upright', manner: T.MANNERS.attention }), block0 = T.frameWith(clip, 0, {}, { item, carry: 'upright', manner: T.MANNERS.attention });
    assert.ok(Math.abs(idle0.P.item - block0.P.item) < 0.02, `${dir}: block starts where idle stands`);
    // going down the guard swings the weapon right across the body: that angle is the pose's own
    if (dir === 'down') assert.deepEqual(T.frameWith(clip, 0.5, {}, { item, carry: 'upright', manner: T.MANNERS.attention }).P, T.frame(clip, 0.5, {}, { item, carry: 'upright' }).P);
    assert.deepEqual(T.frameWith(`idle_${dir}`, 0.5, {}, { manner: T.MANNERS.attention }).P, T.frame(`idle_${dir}`, 0.5, {}, {}).P, 'nothing held, nothing changed');
  }
});

// ---- worn parts -------------------------------------------------------------------------------------

test('tabard: a panel of its colour over the chest that hangs below the hip, with a border, in every direction and build', () => {
  for (const [name, dimsOf] of Object.entries(BODIES)) for (const dir of T.DIRECTIONS) {
    const { g, J, d } = worn(dir, { torso: (gg, J, P, d) => T.tabard(gg, J, P, d, { colour: BLUE, border: WHEAT }) }, dimsOf);
    const cloth = tones(g, BLUE), edge = tones(g, WHEAT);
    assert.ok(cloth.length >= 12, `${name} ${dir}: cloth (${cloth.length})`);
    assert.ok(edge.length >= 5, `${name} ${dir}: border (${edge.length})`);
    const all = [...cloth, ...edge], hip = Math.round(J.hip[1]);
    assert.ok(Math.max(...all.map(([, y]) => y)) >= hip + 1, `${name} ${dir}: it hangs below the hip`);
    assert.ok(Math.max(...all.map(([, y]) => y)) <= J.gy - 3, `${name} ${dir}: the shins and feet show`);
    if (dir !== 'side') for (const [x] of all) assert.ok(Math.abs(x + 0.5 - J.bx) <= d.chestR, `${name} ${dir}: column ${x} is on an arm`);
    // the sleeves keep the look's colour, so it reads as worn over them
    assert.ok(tones(g, LOOK.top).length >= 6, `${name} ${dir}: sleeves show`);
  }
  const plain = worn('down', { torso: (gg, J, P, d) => T.tabard(gg, J, P, d, { colour: BLUE }) }).g;
  assert.equal(tones(plain, WHEAT).length, 0, 'no border unless asked');
  const short = worn('down', { torso: (gg, J, P, d) => T.tabard(gg, J, P, d, { colour: BLUE, length: 0 }) }).g;
  assert.ok(tones(short, BLUE).length < tones(plain, BLUE).length, 'length shortens it');
});

test('kettleHat: a brim wider than the head, eyes left uncovered, bigger with size', () => {
  for (const dir of T.DIRECTIONS) {
    const bare = worn(dir, {}).g;
    const sizes = [0.5, 1, 1.8].map((size) => worn(dir, { head: (gg, J, P, d) => T.kettleHat(gg, J, P, d, { size, metal: STEEL }) }, {}, { ...LOOK, hatted: true }));
    const widths = sizes.map(({ g }) => { const b = g.bounds(); return b.x1 - b.x0; });
    const { J, d } = sizes[1];
    assert.ok(diff(bare, sizes[1].g) > 30, `${dir}: a hat is drawn`);
    assert.ok(widths[1] >= d.headW + 3, `${dir}: the brim is wider than the head (${widths[1]} against ${d.headW})`);
    assert.ok(widths[2] > widths[0], `${dir}: size widens it (${widths})`);
    if (dir === 'down') for (const sg of [-1, 1]) assert.equal(sizes[2].g.get(Math.floor(J.head[0]) + sg * 3, J.brow + 1), col(INK), 'the eyes show under the biggest brim');
    for (const { g } of sizes) assert.ok(inFrame(g));
    // not the bright metal itself against the skin: the hat is a tone down, like the helmet
    assert.ok(lit(sizes[1].g, ramp(STEEL).dark).length > 8);
  }
});

test('shield: round and kite on the other arm, seen in every direction, in front going down and behind the body going up', () => {
  const pictures = {};
  for (const kind of ['round', 'kite']) for (const dir of T.DIRECTIONS) {
    const bare = worn(dir, {}).g;
    const draw = (size) => worn(dir, { offhand: (gg, J, P, d) => T.shield(gg, J, P, d, { kind, size, metal: STEEL, boss: WHEAT }) });
    const { g, J } = draw(1);
    assert.ok(diff(bare, g) >= (dir === 'down' ? 40 : 10), `${kind} ${dir}: it shows (${diff(bare, g)})`);
    assert.ok(diff(draw(0.65).g, draw(1.35).g) > 8, `${kind} ${dir}: size changes it`);
    const b0 = bare.bounds(), b1 = g.bounds();
    if (dir !== 'side') assert.ok(J.s < 0 ? b1.x1 > b0.x1 : b1.x0 < b0.x0, `${kind} ${dir}: it sticks out on the off-hand side`);
    else assert.ok(diff(bare, g) >= 14, `${kind} side: enough of it shows ahead of the body (${diff(bare, g)})`);
    if (dir === 'up') assert.equal(tones(g, WHEAT).length, 0, 'the boss is on the front, not seen from behind');
    assert.ok(inFrame(draw(1.35).g));
    pictures[`${kind}-${dir}`] = g;
  }
  for (const dir of T.DIRECTIONS) assert.ok(diff(pictures[`round-${dir}`], pictures[`kite-${dir}`]) > 6, `${dir}: the two kinds differ`);
  assert.deepEqual(T.SHIELD_KINDS, ['round', 'kite']);
});

test('hairBow: a ribbon bow above the head in its colour, in every direction, bigger with size', () => {
  for (const dir of T.DIRECTIONS) {
    const draw = (size) => worn(dir, { head: (gg, J, P, d) => T.hairBow(gg, J, P, d, { size, colour: RED }) });
    const { g, J } = draw(1), red = tones(g, RED);
    assert.ok(red.length >= 8, `${dir}: a bow (${red.length})`);
    assert.ok(Math.min(...red.map(([, y]) => y)) < J.headTop, `${dir}: it stands above the head`);
    assert.ok(tones(draw(1.8).g, RED).length > tones(draw(0.5).g, RED).length + 4, `${dir}: size`);
    assert.ok(Math.min(...tones(draw(1.8).g, RED).map(([, y]) => y)) >= J.headTop - T.hairBowRise(1.8), 'hairBowRise covers it');
  }
});

test('hairdo: bowl and pigtails add to the short hair in every direction and differ from each other', () => {
  assert.deepEqual(T.HAIRDOS, ['bowl', 'pigtails']);
  const HAIR = '#5a3a22';
  for (const dir of T.DIRECTIONS) {
    const short = worn(dir, {}).g;
    const of = (style) => worn(dir, { head: (gg, J, P, d) => T.hairdo(gg, J, P, d, { style, colour: HAIR }) });
    const bowl = of('bowl'), tails = of('pigtails');
    assert.ok(diff(short, bowl.g) > 6, `${dir}: bowl (${diff(short, bowl.g)})`);
    assert.ok(diff(short, tails.g) > 6, `${dir}: pigtails (${diff(short, tails.g)})`);
    assert.ok(diff(bowl.g, tails.g) > 6, `${dir}: they differ`);
    assert.equal(diff(short, of('short').g), 0, 'any other style adds nothing');
    if (dir === 'down') for (const sg of [-1, 1]) assert.equal(bowl.g.get(Math.floor(bowl.J.head[0]) + sg * 3, bowl.J.brow + 1), col(INK), 'the fringe stops above the eyes');
    // pigtails hang outside the head
    const b0 = short.bounds(), b1 = tails.g.bounds();
    assert.ok(b1.x0 < b0.x0 || b1.x1 > b0.x1 || dir === 'side', `${dir}: pigtails change the outline`);
  }
});

// ---- what townsfolk hold --------------------------------------------------------------------------

test('TOWN_ITEMS: halberd, stick, basket and flower have sizes; townItemSize falls back on the standard kinds', () => {
  assert.deepEqual(T.TOWN_ITEM_KINDS, ['halberd', 'pike', 'stick', 'basket', 'flower']);
  assert.ok(T.TOWN_ITEMS.pike.length + T.TOWN_ITEMS.pike.back > 30, 'a pike is taller than a person');
  for (const kind of T.TOWN_ITEM_KINDS) {
    for (const k of ['length', 'pad']) assert.ok(T.TOWN_ITEMS[kind][k] > 0, `${kind}.${k}`);
    assert.deepEqual(T.townItemSize(kind, 1), T.TOWN_ITEMS[kind]);
    assert.equal(T.townItemSize(kind, 1.2).length, T.TOWN_ITEMS[kind].length * 1.2);
    assert.ok(!T.ITEM_KINDS.includes(kind), 'the standard list is left as it was');
  }
  assert.deepEqual(T.townItemSize('sword', 1.1), T.itemSize('sword', 1.1));
  assert.equal(T.townItemSize('none', 1), null);
  assert.ok(T.TOWN_ITEMS.halberd.length + T.TOWN_ITEMS.halberd.back > 30, 'a halberd is taller than a person');
});

test('townItem: every kind draws from the hand along its angle; a standard kind is drawn by heldItem', () => {
  const alone = (fn) => { const g = new Surface(W, H); fn(g); return g; };
  for (const dir of T.DIRECTIONS) {
    const up = { x: 24, y: 30, angle: Math.PI, reach: 1 }, down = { x: 24, y: 14, angle: 0, reach: 1 };
    const halberd = alone((g) => T.townItem(g, dir, up, { kind: 'halberd', length: 24, metal: STEEL, wood: '#9a6a3e' }));
    let b = halberd.bounds();
    assert.ok(b.y0 <= 30 - 23 && b.y1 >= 30 + T.TOWN_ITEMS.halberd.back - 2, `halberd ${dir}: a long pole (${b.y0}..${b.y1})`);
    assert.ok(tones(halberd, STEEL).length >= 10, `halberd ${dir}: a blade and a spike`);
    assert.ok(b.x1 - b.x0 >= 4, `halberd ${dir}: the blade stands out from the shaft`);
    const pike = alone((g) => T.townItem(g, dir, up, { kind: 'pike', length: 23, metal: STEEL, wood: '#9a6a3e' }));
    b = pike.bounds();
    assert.ok(b.y0 <= 30 - 22 && b.y1 >= 30 + T.TOWN_ITEMS.pike.back - 2 && b.x1 - b.x0 <= 4, `pike ${dir}: a long straight pole (${JSON.stringify(b)})`);
    assert.ok(tones(pike, STEEL).length >= 8 && diff(pike, halberd) > 12, `pike ${dir}: a spearhead, not a halberd's blade`);
    const stick = alone((g) => T.townItem(g, dir, up, { kind: 'stick', length: 9, wood: '#9a6a3e' }));
    b = stick.bounds();
    assert.ok(lit(stick).length >= 8 && b.y0 <= 30 - 8, `stick ${dir}`);
    const basket = alone((g) => T.townItem(g, dir, down, { kind: 'basket', length: 7, wood: WHEAT, fill: RED }));
    b = basket.bounds();
    assert.ok(lit(basket).length >= 20 && b.y1 >= 14 + 6 && b.y0 >= 14 - 1, `basket ${dir}: hangs below the hand (${b.y0}..${b.y1})`);
    assert.ok(tones(basket, RED).length >= 2, 'something in it');
    assert.equal(tones(alone((g) => T.townItem(g, dir, down, { kind: 'basket', length: 7, wood: WHEAT, fill: null })), RED).length, 0);
    const flower = alone((g) => T.townItem(g, dir, up, { kind: 'flower', length: 8, stem: '#4f9d57', petal: RED, heart: WHEAT }));
    assert.ok(tones(flower, RED).length >= 6 && tones(flower, '#4f9d57').length >= 3, `flower ${dir}`);
    assert.ok(Math.min(...tones(flower, RED).map(([, y]) => y)) <= 30 - 8, 'the bloom is at the far end');
    // a standard kind goes to heldItem unchanged
    const item = { kind: 'sword', length: 11, metal: STEEL };
    assert.equal(diff(alone((g) => T.townItem(g, dir, up, item)), alone((g) => T.heldItem(g, dir, up, item))), 0);
  }
  // a shorter reach draws a shorter thing
  const at = (reach) => ({ x: 24, y: 30, angle: Math.PI, reach });
  const long = alone((g) => T.townItem(g, 'down', at(1), { kind: 'halberd', length: 24 })), short = alone((g) => T.townItem(g, 'down', at(0.6), { kind: 'halberd', length: 24 }));
  assert.ok(short.bounds().y0 > long.bounds().y0 + 6);
});

test('a guard and a child built from these parts stay inside the frame in every clip, direction and size', () => {
  for (const [name, dimsOf] of Object.entries(BODIES)) for (const dir of T.DIRECTIONS) {
    for (const [action, kind, carry, scale] of [['idle', 'halberd', 'upright', 1.35], ['walk', 'halberd', 'upright', 1.35], ['block', 'halberd', 'upright', 1.35], ['run', 'stick', 'up', 1.35], ['run', 'basket', 'hang', 1.35], ['idle', 'flower', 'up', 1.35]]) {
      const clip = `${action}_${dir}`;
      for (const t of phases(action)) {
        const F = T.frameWith(clip, t, { ...dimsOf, bounce: 1, stride: 1 }, { item: T.townItemSize(kind, scale), carry, rise: 3, manner: [T.MANNERS.rock, T.MANNERS.flail], tall: kind === 'halberd' ? undefined : [22, 27] });
        const g = new Surface(W, H);
        F.draw(g, { ...LOOK, hatted: true }, {
          torso: (gg, J, P, d) => T.tabard(gg, J, P, d, { colour: BLUE, border: WHEAT }),
          head: (gg, J, P, d) => (kind === 'halberd' ? T.kettleHat(gg, J, P, d, { size: 1.8, metal: STEEL }) : T.hairBow(gg, J, P, d, { size: 1.8, colour: RED })),
          offhand: (gg, J, P, d) => T.shield(gg, J, P, d, { kind: 'kite', size: 1.35, metal: STEEL }),
          item: (gg, J) => T.townItem(gg, F.direction, F.hand(J), { kind, length: F.item.length, metal: STEEL }),
        });
        F.finish(g);
        assert.ok(inFrame(g), `${name} ${clip} with a ${kind} at ${t} leaves the frame (${JSON.stringify(g.bounds())})`);
      }
    }
  }
});

test('peakedCap: a soft crown that puffs up with size and a peak over the brow, the eyes left uncovered', () => {
  for (const dir of T.DIRECTIONS) {
    const bare = worn(dir, {}, {}, { ...LOOK, hatted: true }).g;
    const draw = (size) => worn(dir, { head: (gg, J, P, d) => T.peakedCap(gg, J, P, d, { size, colour: RED }) }, {}, { ...LOOK, hatted: true });
    const { g, J, d } = draw(1), red = tones(g, RED);
    assert.ok(red.length >= 24, `${dir}: a cap (${red.length})`);
    assert.ok(diff(draw(0.5).g, draw(1.8).g) > 10, `${dir}: size changes it (${diff(draw(0.5).g, draw(1.8).g)})`);
    assert.ok(Math.min(...tones(draw(1.8).g, RED).map(([, y]) => y)) >= J.headTop - T.peakedCapRise(1.8), `${dir}: peakedCapRise covers the biggest crown`);
    if (dir === 'down') for (const sg of [-1, 1]) assert.equal(draw(1.8).g.get(Math.floor(J.head[0]) + sg * 3, J.brow + 1), col(INK), 'the eyes show under the peak');
    if (dir === 'side') assert.ok(Math.max(...red.map(([x]) => x)) > J.head[0] + d.headW / 2, 'from the side the peak sticks out in front');
    assert.ok(diff(bare, g) > 20 && inFrame(draw(1.8).g));
  }
});
