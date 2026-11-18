// Framework additions of batch S05 (shield-trooper, vendor-bot):
//   rigs/topdown-riot.js   riot gear for the top-down character rig: the body shield (shieldPlace, bodyShield), how it is
//                          carried and planted (carryShield, shieldFrame), the jab (strike), what the other hand holds
//                          (RIOT_ITEMS, riotItemSize, riotItem), and the worn shoulderPlates and lensMask
//   rigs/kiosk.js          the kiosk robot rig: a hovering service machine that always faces the camera
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, INK } from '../../engine/color.js';
import * as T from '../../rigs/topdown.js';
import * as R from '../../rigs/topdown-riot.js';
import * as K from '../../rigs/kiosk.js';

const SKIN = '#f6d3b0', ARMOUR = '#6b7896', MARK = '#ff00ff', MARK2 = '#00ff00', LIGHT = '#e2473f';
const LOOK = { skin: SKIN, top: ARMOUR, bottom: '#5b6487', boots: '#434d6d', hair: '#434d6d', hairStyle: 'short', hatted: false };
const [W, H] = T.SIZE;
const lit = (g, c) => { const out = [], v = col(c); for (let i = 0; i < g.data.length; i++) if (g.data[i] === v) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
const tonesOf = (hex) => { const r = ramp(hex); return [r.light, r.base, r.dark, r.deep]; };
const seen = (g, hex) => tonesOf(hex).reduce((n, c) => n + lit(g, c).length, 0);
const count = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const inFrame = (g, what) => { const b = g.bounds(); assert.ok(b && b.x0 >= 1 && b.y0 >= 1 && b.x1 <= W - 2 && b.y1 <= H - 2, `${what}: touches the frame edge (${JSON.stringify(b)})`); };
const joints = (action, direction, t = 0, p = {}) => { const d = T.dims(p), P = T.pose(action, direction, t, {}, d); return { d, P, J: T.solve(direction, P, d) }; };

// ---- rigs/topdown-riot.js ---------------------------------------------------------------------------

test('S05 shieldPlace: face-on going down, behind going up, edge-on from the side; bigger with size; never over the eyes while carried', () => {
  for (const kind of R.BODY_SHIELD_KINDS) {
    const views = {};
    for (const dir of T.DIRECTIONS) {
      const { J, P, d } = joints('idle', dir);
      const S = R.shieldPlace(J, P, d, { kind, size: 1 });
      views[dir] = S;
      assert.ok(Number.isInteger(S.x0) && Number.isInteger(S.y0) && Number.isInteger(S.w) && Number.isInteger(S.h), `${kind} ${dir}: whole pixels`);
      assert.ok(S.y0 + S.h <= J.gy - 1, `${kind} ${dir}: carried, it does not drag on the floor`);
      if (dir !== 'side') assert.ok(S.y0 >= J.brow + 4, `${kind} ${dir}: its top stays under the eyes`);
      const big = R.shieldPlace(J, P, d, { kind, size: 1.35 }), small = R.shieldPlace(J, P, d, { kind, size: 0.65 });
      assert.ok(big.w * big.h > S.w * S.h && S.w * S.h > small.w * small.h, `${kind} ${dir}: size makes it bigger`);
    }
    assert.deepEqual([views.down.view, views.up.view, views.side.view], ['face', 'back', 'edge']);
    assert.ok(views.side.w < views.down.w / 2 + 1, `${kind}: edge-on it is thin (${views.side.w} against ${views.down.w})`);
    assert.ok(views.down.cx > 24.5 && views.up.cx < 24.5, `${kind}: on the off-hand side of the picture in both views`);
  }
  // a riot shield is about as tall as the body from the chin down
  const { J, P, d } = joints('idle', 'down');
  assert.ok(R.shieldPlace(J, P, d, { kind: 'riot' }).h >= 15);
});

test('S05 shieldPlace: a guarding pose plants it in front of the feet and in the middle; a shove thrusts it at the camera', () => {
  const { J, P, d } = joints('idle', 'down');
  const carried = R.shieldPlace(J, P, d, { kind: 'riot' });
  const planted = R.shieldPlace(J, { ...P, guard: 1 }, d, { kind: 'riot' });
  assert.equal(planted.y0 + planted.h, J.gy + 2, 'its foot is two rows in front of the feet');
  assert.ok(Math.abs(planted.cx - J.bx) < Math.abs(carried.cx - J.bx), 'and it is nearer the middle of the body');
  const shoved = R.shieldPlace(J, { ...P, shove: 1 }, d, { kind: 'riot' });
  assert.ok(shoved.y0 + shoved.h > carried.y0 + carried.h, 'a shove brings it down the picture');
});

test('S05 bodyShield: drawn by the right hook for the direction, lit along its edge, all but hidden from behind, inside the frame', () => {
  const draw = (dir, kind, layers, t = 0) => {
    const g = new Surface(W, H), d = T.dims(), P = T.pose('idle', dir, t, {}, d);
    const hook = (layer) => (gg, J, PP, dd) => { if (layers.includes(layer)) R.bodyShield(gg, J, PP, dd, { kind, layer, colour: MARK, glow: MARK2, inset: '#434d6d' }); };
    const J = T.draw(g, dir, P, d, LOOK, { offhand: hook('offhand'), front: hook('front') });
    if (layers.includes('light')) R.bodyShield(g, J, P, d, { kind, layer: 'light', colour: MARK, glow: MARK2 });
    return g;
  };
  for (const kind of ['riot', 'round']) {
    const down = draw('down', kind, ['offhand', 'front']), up = draw('up', kind, ['offhand', 'front']), side = draw('side', kind, ['offhand', 'front']);
    assert.ok(seen(down, MARK) >= 60, `${kind} down: the face of the shield shows (${seen(down, MARK)})`);
    assert.ok(seen(down, MARK2) >= 12, `${kind} down: its edge is lit (${seen(down, MARK2)})`);
    assert.ok(seen(up, MARK) > 0 && seen(up, MARK) < seen(down, MARK) / 2, `${kind} up: the body hides most of it (${seen(up, MARK)})`);
    assert.ok(seen(side, MARK) >= 10 && seen(side, MARK2) >= 6, `${kind} side: a slab with a lit edge (${seen(side, MARK)}, ${seen(side, MARK2)})`);
    // down: only the `front` hook draws it; up and side: only the `offhand` hook
    assert.equal(seen(draw('down', kind, ['offhand']), MARK), 0);
    assert.equal(seen(draw('up', kind, ['front']), MARK), 0);
    assert.equal(seen(draw('side', kind, ['front']), MARK), 0);
    for (const [dir, g] of [['down', down], ['up', up], ['side', side]]) inFrame(g, `${kind} ${dir}`);
    // over the body it is ringed with ink, so it stays one object on armour of its own colour
    const S = R.shieldPlace(...(({ J, P, d }) => [J, P, d])(joints('idle', 'down')), { kind });
    assert.ok(lit(down, INK).filter(([x, y]) => x >= S.x0 - 1 && x <= S.x0 + S.w && y >= S.y0 - 1 && y <= S.y0 + S.h).length >= 20, `${kind}: inked where it lies over the body`);
  }
  // energy: nothing but a small emitter before the outline; the pane is light, drawn by layer 'light', rimmed with its own dark tone
  const before = draw('down', 'energy', ['offhand', 'front']), after = draw('down', 'energy', ['offhand', 'front', 'light']);
  assert.equal(seen(before, MARK2) <= 2, true, 'before the outline only the cell of the emitter is lit');
  assert.ok(lit(after, MARK2).length >= 60, `the pane is the light's own colour (${lit(after, MARK2).length})`);
  assert.ok(lit(after, ramp(MARK2).dark).length >= 20, 'and rimmed with its dark tone');
  const behind = draw('up', 'energy', ['offhand', 'front', 'light']), plain = draw('up', 'energy', []);
  assert.ok(lit(behind, MARK2).length > 0 && lit(behind, MARK2).length < lit(after, MARK2).length / 2, 'from behind the body hides most of the pane');
  for (let i = 0; i < plain.data.length; i++) if (plain.data[i]) assert.equal(behind.data[i], plain.data[i], 'from behind the pane never paints over the body');
  assert.ok(diff(draw('down', 'energy', ['light'], 0), draw('down', 'energy', ['light'], 0.5)) > 4, 'the bright line climbs the pane with t');
  inFrame(after, 'energy down'); inFrame(draw('side', 'energy', ['offhand', 'front', 'light']), 'energy side');
  // an unknown kind draws nothing
  assert.equal(diff(draw('down', 'none', ['offhand', 'front', 'light']), draw('down', 'none', [])), 0);
});

test('S05 shieldFrame: carries the shield, crouches behind it in block, jabs when no gun is held, braces a rifle with no shield', () => {
  const p = { height: 0.5, build: 0.8 };
  const rifle = R.riotItemSize('rifle'), baton = R.riotItemSize('baton');
  const F = R.shieldFrame('block', 0.5, p, { item: rifle, shield: { kind: 'riot', size: 1 } });
  assert.deepEqual(F.shield, { kind: 'riot', size: 1 });
  assert.equal(F.P.guard, 1, 'block plants the shield');
  const standing = R.shieldFrame('block', 0, p, { item: rifle, shield: { kind: 'riot', size: 1 } });
  const top = (f) => T.solve(f.direction, f.P, f.d).headTop;
  assert.ok(top(F) - top(standing) >= 4, `the body crouches behind it (${top(F) - top(standing)} px)`);
  assert.equal(standing.P.guard, 0);
  assert.equal(F.grip(T.solve('down', F.P, F.d)), null);
  // the off arm is held steady: it swings far less than the pose's own arm does
  const swing = (shield) => { const ys = []; for (let i = 0; i < 8; i++) { const f = R.shieldFrame('walk_down', i / 8, p, { item: rifle, shield }); ys.push(T.solve('down', f.P, f.d).armB.hand[1]); } return Math.max(...ys) - Math.min(...ys); };
  assert.ok(swing({ kind: 'riot' }) < swing(null) - 1 || swing(null) < 2, `the shield arm is steady (${swing({ kind: 'riot' })} against ${swing(null)})`);
  // a gun fires on frame 1; a baton, or nothing, is a jab that never fires
  assert.equal(R.shieldFrame('shoot_side', 0.2, p, { item: rifle, shield: { kind: 'riot' } }).P.fire, true);
  const jab = R.shieldFrame('shoot_side', 0.4, p, { item: baton, shield: { kind: 'riot' } });
  assert.equal(jab.P.strike, 'item'); assert.ok(!jab.P.fire);
  assert.equal(R.shieldFrame('shoot_down', 0.4, p, { item: null, shield: { kind: 'round' } }).P.strike, 'shield');
  assert.equal(R.shieldFrame('shoot_down', 0.4, p, { item: null, shield: { kind: 'none' } }).P.strike, 'fist');
  // with no shield a rifle is held in both hands (the rig's braced frame); a pistol is not
  const braced = R.shieldFrame('idle_up', 0, p, { item: rifle, shield: null });
  assert.equal(braced.shield, null);
  assert.ok(braced.grip(T.solve('up', braced.P, braced.d)), 'facing away the free hand is on the gun');
  assert.equal(R.shieldFrame('idle_up', 0, p, { item: R.riotItemSize('pistol'), shield: null }).grip(T.solve('up', braced.P, braced.d)), null);
  // every clip of every direction keeps the body and the biggest shield inside the frame
  for (const clip of ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'shoot_down', 'shoot_up', 'shoot_side', 'block', 'hurt', 'die']) {
    for (const kind of R.BODY_SHIELD_KINDS) for (let i = 0; i < 6; i++) {
      const t = i / 5, big = { height: 1, build: 1, bounce: 1, stride: 1 };
      const f = R.shieldFrame(clip, t, big, { item: R.riotItemSize('rifle', 1.35), shield: { kind, size: 1.35 }, rise: T.visorHelmetRise(1.8) }), g = new Surface(W, H);
      const shield = (layer) => (gg, J, P, d) => R.bodyShield(gg, J, P, d, { ...f.shield, layer, colour: ARMOUR, glow: LIGHT, t });
      const J = f.draw(g, LOOK, { offhand: shield('offhand'), front: shield('front'), item: (gg, JJ) => R.riotItem(gg, f.direction, f.hand(JJ), { kind: 'rifle', length: f.item.length }) });
      f.finish(g, { flash: false });
      shield('light')(g, J, f.P, f.d);
      inFrame(g, `${clip} ${kind} t=${t}`);
    }
  }
});

test('S05 strike: starts ready, lands on frame 2 of 6 at its furthest reach, ends standing, and never fires', () => {
  const d = T.dims();
  const reachAt = (t, using) => { const P = R.strike('side', t, {}, d, { using }); const J = T.solve('side', P, d); return (using === 'shield' ? J.armB : J.armF).hand[0]; };
  for (const using of ['item', 'shield', 'fist']) {
    const xs = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => reachAt(t, using));
    assert.equal(Math.max(...xs), xs[2], `${using}: the blow lands on frame 2 (${xs.map((x) => x.toFixed(1))})`);
    assert.ok(xs[1] < xs[0], `${using}: frame 1 draws back first`);
    assert.ok(xs[2] - xs[1] >= 4, `${using}: the thrust travels 4 px or more`);
    const end = R.strike('side', 1, {}, d, { using }), rest = T.pose('idle', 'side', 0, {}, d);
    assert.deepEqual([end.armF, end.armB, end.lunge, end.lean], [rest.armF, rest.armB, 0, 0], `${using}: ends standing`);
    for (const t of [0, 0.2, 0.4, 1]) assert.ok(!R.strike('side', t, {}, d, { using }).fire);
  }
  assert.equal(R.strike('down', 0.4, {}, d, { using: 'shield' }).shove, 1);
  // pointing at the camera, the held thing looks shorter on the hit
  assert.ok(R.strike('down', 0.4, { carry: 'up' }, d, { using: 'item' }).reach < 0.7);
  assert.equal(R.strike('side', 0.4, { carry: 'up' }, d, { using: 'item' }).reach, 1);
});

test('S05 riotItem and riotItemSize: a rifle, a pistol and a baton, scaled by length; a gun pointed at the camera is seen end-on', () => {
  assert.equal(R.riotItemSize('none'), null);
  assert.equal(R.riotItemSize('rifle', 1.2).length, 12);
  assert.equal(R.riotItemSize('rifle').long, true);
  assert.equal(R.riotItemSize('baton').melee, true);
  assert.ok(!R.riotItemSize('pistol').melee && !R.riotItemSize('pistol').long);
  assert.deepEqual(R.riotItemSize('blaster'), T.gunSize('blaster'), 'any other kind is the rig\'s');
  const at = { x: 20, y: 24, angle: Math.PI / 2, reach: 1 };
  const draw = (kind, a = at, direction = 'side', length = R.RIOT_ITEMS[kind]?.length ?? 8) => { const g = new Surface(W, H); R.riotItem(g, direction, a, { kind, length, metal: MARK, grip: MARK2 }); return g; };
  const sizes = Object.fromEntries(['rifle', 'pistol', 'baton'].map((k) => [k, count(draw(k))]));
  assert.ok(sizes.rifle > sizes.pistol + 8, `a rifle is bigger than a pistol (${JSON.stringify(sizes)})`);
  assert.ok(seen(draw('baton'), MARK) >= 10 && seen(draw('baton'), MARK2) >= 4, 'a baton: a bright shaft on a dark handle');
  const b = draw('baton').bounds();
  assert.ok(b.x1 - b.x0 >= 9, `the baton is 9 px or more long (${b.x1 - b.x0 + 1})`);
  assert.ok(count(draw('baton', at, 'side', 12)) > count(draw('baton')), 'length makes it longer');
  // end-on: pointing down the picture and foreshortened, a gun is a short block with a dark bore
  const endOn = draw('rifle', { x: 20, y: 24, angle: 0, reach: 0.4 }, 'down'), long = draw('rifle', { x: 20, y: 24, angle: 0, reach: 1 }, 'down');
  const eb = endOn.bounds(), lb = long.bounds();
  assert.ok(eb.y1 - eb.y0 <= 8 && lb.y1 - lb.y0 >= 12, `end-on it is short (${eb.y1 - eb.y0 + 1} against ${lb.y1 - lb.y0 + 1} rows)`);
  assert.ok(lit(endOn, ramp(MARK).deep).length >= 2, 'with its bore showing');
  assert.ok(count(draw('blaster')) > 10, 'another kind is handed to the rig');
});

test('S05 shoulderPlates: a plate over each shoulder, proud of the arm; from the side only the near one, drawn by the `front` hook', () => {
  const body = (dir, hooks) => { const g = new Surface(W, H), d = T.dims({ build: 0.8 }), P = T.pose('idle', dir, 0, {}, d); T.draw(g, dir, P, d, LOOK, hooks); return g; };
  const plates = (layer) => (g, J, P, d) => R.shoulderPlates(g, J, P, d, { colour: MARK, layer });
  for (const dir of ['down', 'up']) {
    const g = body(dir, { torso: plates('torso'), front: plates('front') }), px = lit(g, MARK).concat(lit(g, ramp(MARK).light));
    assert.ok(px.length >= 14, `${dir}: both plates show (${px.length})`);
    assert.ok(px.some(([x]) => x < 20) && px.some(([x]) => x > 28), `${dir}: one on each side`);
    const bare = body(dir, {}).bounds(), b = g.bounds();
    assert.ok(b.x0 < bare.x0 && b.x1 > bare.x1, `${dir}: they stand proud of the arms`);
    assert.equal(seen(body(dir, { front: plates('front') }), MARK), 0);
  }
  assert.ok(seen(body('side', { torso: plates('torso'), front: plates('front') }), MARK) >= 8, 'side: the near plate shows');
  assert.equal(seen(body('side', { torso: plates('torso') }), MARK), 0, 'side: it is drawn by the `front` hook, over the near arm');
});

test('S05 lensMask: two lit lenses and a muzzle going down, one lens from the side, only a strap from behind; skin still shows; size makes it bigger', () => {
  const draw = (dir, size = 1) => { const g = new Surface(W, H), d = T.dims(), P = T.pose('idle', dir, 0, {}, d); T.draw(g, dir, P, d, LOOK, { head: (gg, J, PP, dd) => R.lensMask(gg, J, PP, dd, { size, colour: MARK, lens: MARK2 }) }); return g; };
  const down = draw('down'), side = draw('side'), up = draw('up');
  assert.ok(seen(down, MARK2) >= 12, `down: two lenses (${seen(down, MARK2)})`);
  assert.ok(seen(side, MARK2) >= 6 && seen(side, MARK2) < seen(down, MARK2), `side: one lens (${seen(side, MARK2)})`);
  assert.equal(seen(up, MARK2), 0, 'no lens from behind');
  assert.ok(seen(up, MARK) >= 8, 'the strap shows from behind');
  assert.ok(seen(down, MARK) >= 25, `down: the muzzle and the housings (${seen(down, MARK)})`);
  // the lenses are two tones, lit above: still lenses in a look with no hue
  assert.ok(lit(down, ramp(MARK2).light).length >= 4 || lit(down, MARK2).length >= 4);
  for (const g of [down, side]) assert.ok(seen(g, SKIN) >= 10, `skin still shows round the mask (${seen(g, SKIN)})`);
  assert.ok(seen(draw('down', 1.8), MARK) + seen(draw('down', 1.8), MARK2) > seen(draw('down', 0.5), MARK) + seen(draw('down', 0.5), MARK2) + 8, 'a bigger size is a bigger mask');
  for (const g of [down, side, up]) inFrame(g, 'lensMask');
});

// ---- rigs/kiosk.js ----------------------------------------------------------------------------------

const KLOOK = { body: '#9aa6c0', accent: '#2fb3a8', glow: '#5fe0f0', metal: '#c2c9d6', dark: '#434d6d', goods: '#f2c230', sign: '#f0ead8', core: '#f0ead8' };
const kiosk = (clip, t, p = {}, opt = {}, look = KLOOK) => { const g = new Surface(W, H), F = K.frame(clip, t, p, { shape: 'boxy', face: 'smile', arms: true, ...opt }); F.draw(g, look); F.finish(g, look); return { g, F }; };

test('S05 kiosk clips: the standard table for the poses asked for, driven by the Speed slider', () => {
  const c = K.clips((p) => p.speed);
  assert.deepEqual(Object.keys(c), ['idle', 'talk', 'sell']);
  assert.deepEqual([c.idle.frames, c.idle.loop, c.talk.frames, c.talk.loop, c.sell.frames, c.sell.loop], [8, true, 8, true, 8, false]);
  assert.ok(c.idle.fps({ speed: 1 }) > c.idle.fps({ speed: 0 }));
  assert.equal(Math.round(c.talk.fps({ speed: 0.5 }) * 100), 735);
  assert.deepEqual(Object.keys(K.clips(() => 0.5, ['idle'])), ['idle']);
  assert.throws(() => K.clips(() => 0.5, ['dance']), /no pose "dance"/);
  assert.throws(() => K.pose('dance', 0), /no pose "dance"/);
  assert.deepEqual(K.PIVOT, [24, 42]);
});

test('S05 kiosk dims: whole pixels, an odd width, bigger with Size, a different outline for each shape', () => {
  for (const shape of K.SHAPES) {
    const lo = K.dims({ size: 0 }, { shape }), mid = K.dims({}, { shape }), hi = K.dims({ size: 1 }, { shape });
    for (const d of [lo, mid, hi]) { assert.equal((2 * d.rx) % 2, 1, `${shape}: an odd width`); assert.ok(Number.isInteger(d.wall) && Number.isInteger(d.tall)); }
    assert.ok(lo.rx < hi.rx && lo.tall < hi.tall, `${shape}: Size makes it bigger`);
    assert.ok(mid.tall >= 20 && mid.tall <= 26, `${shape}: about half the frame tall (${mid.tall})`);
  }
  assert.equal(K.dims({}, { shape: 'nope' }).shape, 'boxy');
  const [b, r, c] = K.SHAPES.map((shape) => kiosk('idle', 0, {}, { shape }).g);
  assert.ok(diff(b, r) > 60 && diff(b, c) > 60 && diff(r, c) > 60, 'the three bodies differ');
  const wide = (g) => g.bounds().x1 - g.bounds().x0;
  assert.ok(wide(kiosk('idle', 0, {}, { shape: 'capsule', arms: false }).g) < wide(kiosk('idle', 0, {}, { shape: 'boxy', arms: false }).g), 'a capsule is narrower than a box');
});

test('S05 kiosk pose: idle bobs and blinks and closes its loop; talk changes face on frames 2 and 6 and waves; sell opens, serves and shuts', () => {
  const lifts = Array.from({ length: 8 }, (_, i) => Math.round(K.pose('idle', i / 8, { bob: 0.5 }).lift));
  assert.equal(Math.max(...lifts), 2); assert.equal(Math.min(...lifts), -2);
  assert.equal(Math.abs(Math.round(K.pose('idle', 1, { bob: 0.5 }).lift)), Math.abs(lifts[0]), 'the loop closes');
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => K.pose('idle', i / 8).face), ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'blink', 'blink']);
  assert.ok(Math.abs(K.pose('idle', 0.25, { bob: 1 }).lift) > Math.abs(K.pose('idle', 0.25, { bob: 0 }).lift) + 1, 'Float makes it bob further');
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => K.pose('talk', i / 8).face), ['rest', 'rest', 'alt', 'alt', 'rest', 'rest', 'alt', 'alt']);
  assert.equal(K.pose('talk', 0).wave, 1);
  const sell = Array.from({ length: 8 }, (_, i) => K.pose('sell', i / 7));
  assert.deepEqual([sell[0].hatch, sell[0].tray, sell[7].hatch, sell[7].tray], [0, 0, 0, 0], 'it starts and ends shut');
  assert.deepEqual([sell[3].hatch, sell[3].tray, sell[3].goods, sell[3].glint], [1, 1, true, 2], 'on frame 3 the tray is out with the goods on it, glinting');
  assert.equal(sell[5].goods, false, 'the goods are taken before the tray goes back');
  assert.equal(sell[5].tray, 1);
  assert.ok(sell[1].lift < 0, 'it dips first');
});

test('S05 kiosk frame: every body, face, headgear and held thing draws inside the frame in every frame of every clip, and the jet reaches the floor', () => {
  for (const shape of K.SHAPES) for (const p of [{ size: 0, bob: 0 }, {}, { size: 1, bob: 1 }]) {
    for (const hg of [...K.HEADGEAR, 'none']) for (const held of [...K.HELD, 'none']) for (const arms of [true, false]) {
      const opt = { shape, arms, headgear: { kind: hg, size: p.size === 1 ? 1.35 : 1 }, held: { kind: held, size: p.size === 1 ? 1.35 : 1 } };
      for (const clip of K.POSES) for (let i = 0; i < 8; i++) {
        const { g } = kiosk(clip, clip === 'sell' ? i / 7 : i / 8, p, { ...opt, frame: i }), b = g.bounds();
        assert.ok(b && b.x0 >= 1 && b.y0 >= 1 && b.x1 <= W - 2, `${shape} ${hg} ${held} arms=${arms} size=${p.size} ${clip} ${i}: inside the frame (${JSON.stringify(b)})`);
        assert.ok(b.y1 === K.GROUND - 1 || b.y1 === K.GROUND - 2, `${shape} ${clip} ${i}: the jet ends on the floor (lowest row ${b.y1})`);
      }
    }
  }
});

test('S05 kiosk parts: each face, headgear and held thing shows and differs from the others; arms and their absence; colours go where they should', () => {
  const faces = K.FACES.map((face) => kiosk('idle', 0, {}, { face }).g);
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) assert.ok(diff(faces[i], faces[j]) >= 9, `${K.FACES[i]} and ${K.FACES[j]} differ (${diff(faces[i], faces[j])})`);
  for (const face of K.FACES) {
    const rest = kiosk('talk', 0, {}, { face }).g, alt = kiosk('talk', 0.25, {}, { face, frame: 0 }).g, blink = kiosk('idle', 0.75, {}, { face }).g;
    assert.ok(seen(rest, KLOOK.glow) >= 9, `${face}: the face is lit on the screen (${seen(rest, KLOOK.glow)})`);
    assert.ok(diff(rest, alt) >= 8, `${face}: talking changes the face`);
    assert.ok(seen(blink, KLOOK.glow) < seen(kiosk('idle', 0, {}, { face }).g, KLOOK.glow), `${face}: a blink is fewer lit pixels`);
  }
  const bare = kiosk('idle', 0, {}, { arms: false }).g;
  const tops = Object.fromEntries(K.HEADGEAR.map((kind) => [kind, kiosk('idle', 0, {}, { arms: false, headgear: { kind, size: 1 } }).g]));
  for (const kind of K.HEADGEAR) {
    assert.ok(tops[kind].bounds().y0 < bare.bounds().y0, `${kind}: stands above the cabinet`);
    assert.ok(diff(tops[kind], bare) >= 12, `${kind}: changes the picture (${diff(tops[kind], bare)})`);
    const small = kiosk('idle', 0, {}, { arms: false, headgear: { kind, size: 0.65 } }).g, big = kiosk('idle', 0, {}, { arms: false, headgear: { kind, size: 1.35 } }).g;
    assert.ok(diff(small, big) >= 9, `${kind}: its size shows (${diff(small, big)})`);
  }
  assert.ok(diff(tops.antenna, tops.dish) > 10 && diff(tops.antenna, tops.cap) > 10 && diff(tops.dish, tops.cap) > 10);
  for (const arms of [true, false]) for (const kind of K.HELD) {
    const g = kiosk('idle', 0, {}, { arms, held: { kind, size: 1 } }).g, none = kiosk('idle', 0, {}, { arms }).g;
    assert.ok(g.bounds().x1 > none.bounds().x1 - (arms ? 0 : -3), `${kind}, arms ${arms}: it is held out at the side`);
    assert.ok(diff(g, none) >= 20, `${kind}, arms ${arms}: shows, in a hand or on a bracket (${diff(g, none)})`);
  }
  assert.ok(diff(kiosk('idle', 0, {}, { arms: true }).g, bare) >= 20, 'arms show');
  // the colours of the look: the cabinet, the trim, the screen's light
  const marked = kiosk('idle', 0, {}, {}, { ...KLOOK, accent: MARK, glow: MARK2 }).g;
  assert.ok(seen(marked, MARK) >= 20, `the accent is the band, the hands and the ball of the antenna (${seen(marked, MARK)})`);
  assert.ok(seen(marked, MARK2) >= 20, `the glow is the face and the jet (${seen(marked, MARK2)})`);
  assert.ok(diff(kiosk('idle', 0, {}, {}, { ...KLOOK, body: '#6b7896' }).g, kiosk('idle', 0).g) > 150, 'the body colour is the cabinet');
});

test('S05 kiosk sell and sockets: the tray slides out of the hatch with the goods on it; the attach points follow the machine', () => {
  const shut = kiosk('sell', 0).g, out = kiosk('sell', 3 / 7, {}, { frame: 3 }).g, empty = kiosk('sell', 5 / 7, {}, { frame: 5 }).g;
  assert.equal(seen(shut, KLOOK.goods) <= 2, true, 'shut: only the light over the coin slot is the colour of the goods');
  assert.ok(seen(out, KLOOK.goods) >= 4, `out: the goods lie on the tray, under their sparkle (${seen(out, KLOOK.goods)})`);
  assert.ok(lit(out, '#ffffff').length >= 3, 'and they glint');
  assert.ok(seen(empty, KLOOK.goods) <= 2 && diff(empty, shut) > 20, 'then the tray is empty, still out');
  const S0 = K.frame('sell', 0, {}, { arms: true }).sockets(), S3 = K.frame('sell', 3 / 7, {}, { arms: true }).sockets();
  assert.deepEqual(Object.keys(S0).sort(), ['feet', 'hand', 'hatch', 'head', 'offhand']);
  assert.ok(S3.hatch.y > S0.hatch.y + 3, 'the hatch socket moves out with the tray');
  assert.deepEqual([S0.feet.x, S0.feet.y], [24.5, K.GROUND]);
  assert.ok(S0.head.y < 20 && S0.hand.x > S0.head.x + 9 && S0.offhand.x < S0.head.x - 9);
  // what is held is where the hand socket is, and a machine that would hold it outside the frame moves over
  const far = K.frame('idle', 0, { size: 1 }, { shape: 'round', arms: true, held: { kind: 'sign', size: 1.35 } }).sockets();
  const near = K.frame('idle', 0, {}, { shape: 'round', arms: true, held: { kind: 'sign', size: 1 } }).sockets();
  assert.ok(far.hand.x + 5 <= W - 3 && far.hand.x - far.head.x < near.hand.x - near.head.x + 3, `with no room, the sign is carried closer to the cabinet (${far.head.x}, ${far.hand.x})`);
  // the float is held inside the room there is: the biggest machine with the tallest headgear still rises, and never leaves the frame
  const ys = Array.from({ length: 8 }, (_, i) => K.frame('idle', i / 8, { size: 1, bob: 1 }, { headgear: { kind: 'antenna', size: 1.35 } }).sockets().head.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) >= 2, `it still bobs (${ys})`);
});
