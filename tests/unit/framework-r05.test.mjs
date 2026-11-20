// Framework additions of batch R05 (mage-walker, rogue-walker), all in rigs/topdown.js: a beard, a bandana, a face
// mask, a scarf (its tail and the wrap at the neck), four small held things (wand, orb, dagger, claws) and the grip
// of the other hand for a character who holds one in each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, INK } from '../../engine/color.js';
import * as T from '../../rigs/topdown.js';

import { codeSprite } from '../helpers/library.mjs';   // the code, frozen first (tests/helpers/library.mjs): a test about the framework it uses
const LOOK = { skin: '#f6d3b0', top: '#3f6fd1', bottom: '#2c4a8a', boots: '#9a6a3e', hair: '#5a3a22', hairStyle: 'short' };
const [W, H] = T.SIZE;
const CLOTH = '#c9423a';                                  // a colour nothing else on the test body uses
const tones = (hex) => { const r = ramp(hex); return new Set([r.light, r.base, r.dark, r.deep].map(col)); };
/** The pixels painted in any tone of `hex`: [[x, y], ...]. */
const painted = (g, hex) => { const set = tones(hex), out = []; for (let i = 0; i < g.data.length; i++) if (set.has(g.data[i])) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const same = (a, b) => diff(a, b) === 0;
/** A standing body facing `direction` with hooks; returns { g, J, P, d }. */
function body(direction, hooks, { dims = {}, action = 'idle', t = 0, look = LOOK } = {}) {
  const g = new Surface(W, H), d = T.dims(dims), P = T.pose(action, direction, t, {}, d);
  const J = T.draw(g, direction, P, d, look, hooks);
  return { g, J, P, d };
}
const BODIES = [{ height: 0, build: 0, head: 0 }, {}, { height: 1, build: 1, head: 1 }];

// ---- beard ----------------------------------------------------------------------------------------------

test('beard: hangs under the eyes facing down and sideways, and is hidden facing away', () => {
  for (const dims of BODIES) for (const kind of ['long', 'short']) {
    for (const dir of ['down', 'side']) {
      const { g, J, d } = body(dir, { head: (g, J, P, d) => T.beard(g, J, P, d, { kind, colour: CLOTH }) }, { dims });
      const px = painted(g, CLOTH);
      assert.ok(px.length >= 8, `${kind} ${dir}: a beard is drawn (${px.length})`);
      assert.ok(px.every(([, y]) => y > J.brow + 2), `${kind} ${dir}: nothing over the eyes`);
      assert.ok(px.every(([x, y]) => x > 1 && y > 1 && x < W - 2 && y < H - 2), `${kind} ${dir}: inside the frame`);
      assert.ok(Math.max(...px.map(([, y]) => y)) >= J.headTop + d.headH, `${kind} ${dir}: reaches below the chin`);
    }
    const bare = body('up', {}, { dims }).g, up = body('up', { head: (g, J, P, d) => T.beard(g, J, P, d, { kind, colour: CLOTH }) }, { dims }).g;
    assert.ok(same(bare, up), `${kind}: nothing shows from behind`);
  }
});

test('beard: long hangs lower than short, and Length moves the end of both', () => {
  const low = (dir, opt) => { const { g } = body(dir, { head: (g, J, P, d) => T.beard(g, J, P, d, { colour: CLOTH, ...opt }) }); return Math.max(...painted(g, CLOTH).map(([, y]) => y)); };
  for (const dir of ['down', 'side']) {
    assert.ok(low(dir, { kind: 'long' }) >= low(dir, { kind: 'short' }) + 3, `${dir}: long is at least 3 px longer`);
    assert.ok(low(dir, { kind: 'long', length: 1.35 }) > low(dir, { kind: 'long', length: 0.65 }), `${dir}: Length changes a long beard`);
    const a = body(dir, { head: (g, J, P, d) => T.beard(g, J, P, d, { kind: 'short', colour: CLOTH, length: 0.65 }) }).g;
    const b = body(dir, { head: (g, J, P, d) => T.beard(g, J, P, d, { kind: 'short', colour: CLOTH, length: 1.35 }) }).g;
    assert.ok(diff(a, b) >= 3, `${dir}: Length changes a short beard`);
  }
});

// ---- bandana and mask -----------------------------------------------------------------------------------

test('bandana: a band over the brow in every direction, with tails, and the eyes stay clear', () => {
  for (const dims of BODIES) for (const dir of T.DIRECTIONS) {
    const { g, J, d } = body(dir, { head: (g, J, P, d) => T.bandana(g, J, P, d, { colour: CLOTH }) }, { dims });
    const px = painted(g, CLOTH);
    assert.ok(px.length >= 12, `${dir}: a bandana is drawn (${px.length})`);
    assert.ok(px.every(([x, y]) => x > 1 && y > 1 && x < W - 2 && y < H - 2), `${dir}: inside the frame`);
    const onHead = px.filter(([x]) => Math.abs(x + 0.5 - J.head[0]) < d.headW / 2 - 1);
    if (dir !== 'up') assert.ok(onHead.every(([, y]) => y < J.brow + 1), `${dir}: the band is above the eyes`);
    // hair still shows above the band
    assert.ok(painted(g, LOOK.hair).some(([, y]) => y < Math.min(...onHead.map(([, yy]) => yy))), `${dir}: hair shows above it`);
    // the knot's tails: past the edge of the head, or (from behind) down over the hair below the band
    if (dir === 'up') assert.ok(px.some(([, y]) => y >= J.brow + 2), 'up: tails hang below the band');
    else assert.ok(px.some(([x, y]) => !T.headIn(J, d)(x + 0.5, y + 0.5)), `${dir}: tails hang outside the head`);
  }
  const small = body('down', { head: (g, J, P, d) => T.bandana(g, J, P, d, { colour: CLOTH, size: 0.5 }) }).g;
  const big = body('down', { head: (g, J, P, d) => T.bandana(g, J, P, d, { colour: CLOTH, size: 1.8 }) }).g;
  assert.ok(painted(big, CLOTH).length >= painted(small, CLOTH).length + 8, 'Size makes the band deeper and the tails longer');
});

test('mask: covers the mouth and chin but never the eyes; from behind only its tie shows', () => {
  for (const dims of BODIES) {
    for (const dir of ['down', 'side']) {
      const bare = body(dir, {}, { dims });
      const { g, J } = body(dir, { head: (g, J, P, d) => T.mask(g, J, P, d, { colour: CLOTH }) }, { dims });
      const px = painted(g, CLOTH);
      assert.ok(px.length >= 10, `${dir}: a mask is drawn (${px.length})`);
      assert.ok(px.every(([, y]) => y >= J.brow + 3), `${dir}: nothing on the eye rows`);
      const eyes = (s) => { let n = 0; for (let y = J.brow + 1; y <= J.brow + 2; y++) for (let x = 0; x < W; x++) if (s.get(x, y) === col(INK)) n++; return n; };
      assert.equal(eyes(g), eyes(bare.g), `${dir}: the eyes are untouched`);
    }
    const { g, J, d } = body('up', { head: (g, J, P, d) => T.mask(g, J, P, d, { colour: CLOTH }) }, { dims });
    const px = painted(g, CLOTH);
    assert.ok(px.length >= 8 && px.length <= d.headW * 4, `up: a tie across the back of the head (${px.length})`);
    assert.ok(px.every(([, y]) => y >= J.brow + 2), 'up: the tie is at the height of the mask');
  }
  const count = (size) => painted(body('down', { head: (g, J, P, d) => T.mask(g, J, P, d, { colour: CLOTH, size }) }).g, CLOTH).length;
  assert.ok(count(1.8) >= count(0.5) + 10, 'Size makes the mask cover more');
});

// ---- scarf ----------------------------------------------------------------------------------------------

test('scarf: the tail streams behind the way the body faces, grows with its length, and stays in the frame', () => {
  const tail = (dir, opt, dims = {}) => {
    const { g, J, d } = body(dir, { behind: (g, J, P, d) => T.scarf(g, J, P, d, { colour: CLOTH, ...opt }) }, { dims });
    return { px: painted(g, CLOTH), J, d };
  };
  // facing right it trails to the left; facing the camera it shows to one side of the body; facing away it hangs down the back
  const side = tail('side', { length: 12, flow: 1 });
  assert.ok(Math.min(...side.px.map(([x]) => x)) < side.J.bx - 10, 'side: streams out behind (to the left)');
  assert.ok(side.px.every(([x]) => x < side.J.bx + 1), 'side: never in front of the body');
  const down = tail('down', { length: 12, flow: 1 });
  assert.ok(Math.max(...down.px.map(([x]) => x)) > down.J.bx + down.d.chestR + 5, 'down: shows well clear of the arm');
  const up = tail('up', { length: 12, flow: 0 });
  assert.ok(Math.max(...up.px.map(([, y]) => y)) > up.J.shoulderY + 10, 'up: hangs down the back');
  assert.ok(up.px.every(([x]) => Math.abs(x - up.J.bx) < 7), 'up: on the back, not out to the side');
  for (const dir of T.DIRECTIONS) {
    assert.ok(tail(dir, { length: 12, flow: 0.5 }).px.length > tail(dir, { length: 5, flow: 0.5 }).px.length + 4, `${dir}: a longer tail is longer`);
    assert.equal(tail(dir, { length: 0 }).px.length, 0, `${dir}: no tail at length 0`);
    const a = tail(dir, { length: 12, flow: 1, wave: [0, 1, -1] }).px, b = tail(dir, { length: 12, flow: 1, wave: [0, -1, 1] }).px;
    assert.notDeepEqual(a, b, `${dir}: the wave bends it`);
    for (const dims of BODIES) for (const flow of [0, 0.5, 1]) for (const wave of [[1, 1, 1], [-1, -1, -1], [0, 1, -1]]) {
      const { px } = tail(dir, { length: 20, flow, wave }, dims);
      assert.ok(px.length > 0 && px.every(([x, y]) => x > 1 && y > 1 && x < W - 2 && y < T.GROUND), `${dir} flow ${flow}: a very long tail stays inside the frame and off the ground line`);
    }
  }
});

test('scarfWrap: two rows of cloth under the chin in every direction', () => {
  for (const dims of BODIES) for (const dir of T.DIRECTIONS) {
    const { g, J, d } = body(dir, { torso: (g, J, P, d) => T.scarfWrap(g, J, P, d, { colour: CLOTH }) }, { dims });
    const px = painted(g, CLOTH), chin = J.shoulderY + d.chin;
    assert.ok(px.length >= (dir === 'side' ? 6 : 8), `${dir}: the wrap shows (${px.length})`);      // sideways the head hides part of it
    assert.ok(px.every(([, y]) => y >= chin - 1 && y <= chin + 2), `${dir}: it sits at the neck`);
  }
});

// ---- small held things ------------------------------------------------------------------------------------

test('SMALL_ITEMS: wand, orb, dagger and claws have sizes; smallItemSize falls back on the standard kinds', () => {
  assert.deepEqual(Object.keys(T.SMALL_ITEMS), ['wand', 'orb', 'dagger', 'claws']);
  for (const kind of Object.keys(T.SMALL_ITEMS)) {
    assert.ok(!T.ITEM_KINDS.includes(kind), `${kind} is not one of the standard kinds`);
    assert.ok(T.SMALL_ITEMS[kind].length > 0 && T.SMALL_ITEMS[kind].length <= 10, `${kind} is small`);
    assert.deepEqual(T.smallItemSize(kind, 1), T.SMALL_ITEMS[kind]);
    assert.equal(T.smallItemSize(kind, 1.3).length, T.SMALL_ITEMS[kind].length * 1.3);
  }
  assert.deepEqual(T.smallItemSize('sword', 0.7), T.itemSize('sword', 0.7));
  assert.equal(T.smallItemSize('none'), null);
  for (const kind of ['sword', 'axe', 'spear', 'staff', 'lantern', 'cane', 'gun']) assert.ok(T.ITEM_KINDS.includes(kind) && T.ITEMS[kind].length > 0, `the standard kind ${kind} is still there`);
});

test('smallItem: draws each small kind from the hand along its angle, and hands the standard kinds to heldItem', () => {
  const at = { x: 24, y: 24, angle: Math.PI / 2, reach: 1 };          // pointing right
  for (const kind of Object.keys(T.SMALL_ITEMS)) for (const dir of T.DIRECTIONS) {
    const g = new Surface(W, H), len = T.SMALL_ITEMS[kind].length;
    T.smallItem(g, dir, at, { kind, length: len, metal: '#c2c9d6', wood: '#9a6a3e', hilt: '#f2c230', orb: '#4fd8ee' });
    const b = g.bounds();
    assert.ok(b, `${kind} ${dir}: something is drawn`);
    assert.ok(b.x1 >= 24 + Math.floor(len) - 1 && b.x1 <= 24 + len + 4, `${kind} ${dir}: reaches its length to the right (${b.x1})`);
    assert.ok(b.x0 >= 20 && b.y0 >= 18 && b.y1 <= 30, `${kind} ${dir}: stays near the hand`);
    const long = new Surface(W, H);
    T.smallItem(long, dir, at, { kind, length: len * 1.35, metal: '#c2c9d6', wood: '#9a6a3e', hilt: '#f2c230', orb: '#4fd8ee' });
    assert.ok(diff(g, long) >= 2, `${kind} ${dir}: Length changes it`);
  }
  const a = new Surface(W, H), b = new Surface(W, H), sword = { kind: 'sword', length: 11, metal: '#c2c9d6', wood: '#9a6a3e', hilt: '#f2c230' };
  T.smallItem(a, 'down', at, sword); T.heldItem(b, 'down', at, sword);
  assert.ok(a.bounds() && same(a, b), 'a sword through smallItem is heldItem\'s sword');
});

test('offGrip: the other hand holds a second thing mirrored going down and up, parallel sideways', () => {
  for (const dir of T.DIRECTIONS) {
    const d = T.dims(), P = T.pose('idle', dir, 0, { carry: 'low' }, d), J = T.solve(dir, P, d), o = T.offGrip(J, P);
    assert.deepEqual([o.x, o.y], J.armB.hand, `${dir}: at the other hand`);
    assert.equal(o.angle, dir === 'side' ? P.item : -P.item, `${dir}: angle`);
    assert.equal(o.reach, P.reach ?? 1);
  }
});

// ---- manners for frameWith() ----------------------------------------------------------------------------

test('dashManner: the run becomes a low dash with the hands swept back; other actions are left alone', () => {
  const p = { bounce: 0.5, stride: 0.5 }, item = T.smallItemSize('dagger');
  for (const dir of T.DIRECTIONS) for (let f = 0; f < 8; f++) {
    const t = f / 8;
    const plain = T.frame(`run_${dir}`, t, p, { item, carry: 'low' }), dash = T.frameWith(`run_${dir}`, t, p, { item, carry: 'low', manner: T.dashManner });
    const J0 = T.solve(dir, plain.P, plain.d), J1 = T.solve(dir, dash.P, dash.d);
    assert.ok(J1.headTop >= J0.headTop + 2, `${dir} frame ${f}: the head is at least 2 px lower (${J0.headTop} -> ${J1.headTop})`);
    if (dir === 'side') {
      assert.ok(J1.armF.hand[0] < J1.armF.shoulder[0] && J1.armB.hand[0] < J1.armB.shoulder[0], `side frame ${f}: both hands are behind the shoulders`);
      assert.ok(Math.sin(dash.P.item) < 0, `side frame ${f}: the blade trails behind`);
    }
    const s = dash.sockets();
    for (const k of ['hand', 'offhand', 'head', 'feet']) assert.ok(s[k].x > 1 && s[k].x < W - 2 && s[k].y > 1 && s[k].y < H - 2, `${dir} frame ${f}: ${k} is inside the frame`);
  }
  for (const clip of ['idle_down', 'walk_side', 'walk_up']) {
    assert.deepEqual(T.frameWith(clip, 0.25, p, { item, carry: 'low', manner: T.dashManner }).P, T.frame(clip, 0.25, p, { item, carry: 'low' }).P, `${clip} is unchanged`);
  }
});

test('walkingStickManner: a staff carried upright is lifted on one step of the walk and planted on the next', () => {
  const p = {}, staff = T.itemSize('staff');
  for (const dir of T.DIRECTIONS) {
    const hand = (t, opt) => { const F = T.frameWith(`walk_${dir}`, t, p, opt); return T.solve(dir, F.P, F.d).armF.hand[1]; };
    const plain = { item: staff, carry: 'upright' }, stick = { ...plain, manner: T.walkingStickManner };
    assert.ok(hand(0.25, stick) <= hand(0.25, plain) - 1, `${dir}: the hand is lifted mid-step`);
    assert.equal(hand(0.75, stick), hand(0.75, plain), `${dir}: and back down, planted, on the other step`);
    assert.equal(hand(0.25, { item: T.itemSize('sword'), carry: 'up', manner: T.walkingStickManner }), hand(0.25, { item: T.itemSize('sword'), carry: 'up' }), `${dir}: a sword is not a walking stick`);
  }
  assert.deepEqual(T.frameWith('idle_down', 0.25, p, { item: staff, carry: 'upright', manner: T.walkingStickManner }).P, T.frame('idle_down', 0.25, p, { item: staff, carry: 'upright' }).P, 'idle is unchanged');
});

// ---- the two sprites of the batch, against their specification rows (bundles/specs/kit-rpg-fantasy.md) ----

const mage = await codeSprite('mage-walker');
const rogue = await codeSprite('rogue-walker');
const { defaultParams, cleanParams, renderFrame } = await import('../../engine/sprite.js');
const ends = (s, i) => cleanParams(s, Object.fromEntries(Object.entries(s.params).map(([k, d]) => [k, d.kind === 'range' ? [d.min, d.max][i] : d.def])));

test('mage-walker and rogue-walker: frame, pivot, clips, parts and cues are the specification\'s', () => {
  for (const s of [mage, rogue]) { assert.deepEqual(s.size, [48, 48]); assert.deepEqual(s.pivot, [24, 42]); assert.equal(s.preview, 'walk_down'); assert.equal(s.meta.view, 'top-down'); }
  assert.deepEqual(Object.entries(mage.clips).map(([k, c]) => [k, c.frames, c.loop]), [...['idle', 'walk'].flatMap((a) => T.DIRECTIONS.map((d) => [`${a}_${d}`, 8, true])), ['cast', 8, false]]);
  assert.deepEqual(Object.entries(rogue.clips).map(([k, c]) => [k, c.frames, c.loop]), ['idle', 'walk', 'run'].flatMap((a) => T.DIRECTIONS.map((d) => [`${a}_${d}`, 8, true])));
  assert.deepEqual(Object.fromEntries(Object.entries(mage.parts).map(([k, v]) => [k, v.params])), { headgear: ['headgear', 'headgearSize'], weapon: ['weapon', 'weaponLength'], beard: ['beard', 'beardLength'] });
  assert.deepEqual(Object.fromEntries(Object.entries(rogue.parts).map(([k, v]) => [k, v.params])), { headgear: ['headgear', 'headgearSize'], scarf: ['scarf', 'scarfLength'], weapon: ['weapon', 'weaponLength'] });
  assert.deepEqual(mage.params.headgear.options.map((o) => o.value), ['pointed', 'wide', 'hood', 'none']);
  assert.deepEqual(mage.params.weapon.options.map((o) => o.value), ['staff', 'wand', 'orb', 'none']);
  assert.deepEqual(rogue.params.headgear.options.map((o) => o.value), ['hood', 'bandana', 'mask', 'none']);
  assert.deepEqual(rogue.params.weapon.options.map((o) => o.value), ['daggers', 'short sword', 'claws', 'none']);
  assert.deepEqual(rogue.params.hairStyle.when, { headgear: ['bandana', 'mask', 'none'] });
  assert.deepEqual(rogue.params.hair.when, { headgear: ['bandana', 'mask', 'none'] });
  const step = (preset) => [0, 4].map((frame) => ({ sound: 'footstep-grass', frame, preset, volume: 0.45 }));
  for (const d of T.DIRECTIONS) { assert.deepEqual(mage.sounds[`walk_${d}`], step('Grass')); assert.deepEqual(rogue.sounds[`walk_${d}`], step('Grass')); assert.deepEqual(rogue.sounds[`run_${d}`], step('Tall grass')); }
  assert.deepEqual(mage.sounds.cast, [{ sound: 'magic-spell', frame: 2, preset: 'Quick zap', volume: 0.8 }]);
});

test('mage-walker and rogue-walker: every socket of every frame is inside the frame, and the hand socket is on a drawn pixel\'s doorstep', () => {
  for (const s of [mage, rogue]) for (const p of [defaultParams(s), ends(s, 0), ends(s, 1)]) for (const [clip, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) {
    const t = c.loop ? f / c.frames : f / (c.frames - 1), sk = s.sockets(clip, t, p), g = renderFrame(s, clip, f, p);
    for (const [name, at] of Object.entries(sk)) if (name !== 'muzzle') assert.ok(at.x >= 1 && at.x <= 47 && at.y >= 1 && at.y <= 47, `${s.id} ${clip} ${f}: ${name} at ${at.x}, ${at.y}`);
    let near = false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (g.get(Math.floor(sk.hand.x) + dx, Math.floor(sk.hand.y) + dy)) near = true;
    assert.ok(near, `${s.id} ${clip} ${f}: the hand socket is where the hand is drawn`);
  }
});
