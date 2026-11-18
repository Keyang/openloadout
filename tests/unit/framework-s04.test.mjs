// Framework additions of batch S04 (void-ranger), all in rigs/topdown.js: sci-fi wear (visorHelmet, visor, pack,
// packStraps, stripe, gloves, suitLights), the gun kinds (GUNS, gunSize, heldGun), the light of a shot (muzzleFlare),
// the streaks of a dash (dashStreaks), the carry 'ready', and the two changes to the `shoot` pose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, brightness, INK } from '../../engine/color.js';
import * as T from '../../rigs/topdown.js';

const SKIN = '#f6d3b0', SUIT = '#e8ecf2', GLASS = '#5fe0f0', MARK = '#ff00ff', MARK2 = '#00ff00';
const LOOK = { skin: SKIN, top: SUIT, bottom: '#c8ccd4', boots: '#3f6fd1', hair: '#434d6d', hairStyle: 'short', hatted: true };
const [W, H] = T.SIZE;
const lit = (g, c) => { const out = [], v = c === undefined ? null : col(c); for (let i = 0; i < g.data.length; i++) if (v === null ? g.data[i] : g.data[i] === v) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
const tonesOf = (hex) => { const r = ramp(hex); return [r.light, r.base, r.dark, r.deep]; };
const seen = (g, hex) => tonesOf(hex).reduce((n, c) => n + lit(g, c).length, 0);
const inFrame = (g, what) => { const b = g.bounds(); assert.ok(b && b.x0 >= 1 && b.y0 >= 1 && b.x1 <= W - 2 && b.y1 <= H - 2, `${what}: touches the frame edge (${JSON.stringify(b)})`); };
/** One body in a pose, with hooks; returns the surface and the joints. */
function body(action, direction, t, hooks, { dimsOf = {}, m = {} } = {}) {
  const g = new Surface(W, H), d = T.dims(dimsOf), P = T.pose(action, direction, t, m, d);
  const J = T.draw(g, direction, P, d, LOOK, hooks);
  return { g, J, P, d };
}
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };

test('S04 visorHelmet: a shell with a band of glass over the eyes going down and sideways, the jaw left open, no glass from behind', () => {
  for (const dir of T.DIRECTIONS) {
    const { g, J, d } = body('idle', dir, 0, { head: (gg, J, P, d) => T.visorHelmet(gg, J, P, d, { size: 1, shell: MARK, visor: GLASS }) });
    assert.ok(seen(g, MARK) >= 40, `${dir}: the shell shows (${seen(g, MARK)})`);
    const glass = seen(g, GLASS);
    if (dir === 'up') assert.ok(glass <= 4, `up: only the small light shows, not a visor (${glass})`);
    else {
      assert.ok(glass >= 15, `${dir}: the visor shows (${glass})`);
      // skin shows below the glass: the jaw is open
      const jaw = lit(g, SKIN).filter(([, y]) => y >= J.brow + 3 && y < J.headTop + d.headH).length + lit(g, ramp(SKIN).dark).filter(([, y]) => y >= J.brow + 3 && y < J.headTop + d.headH).length;
      assert.ok(jaw >= 12, `${dir}: the jaw shows under the visor (${jaw})`);
      // the glass has a lit row and a dark body, so it is still a band where a look removes hue
      assert.ok(lit(g, ramp(GLASS).dark).length >= 8 && lit(g, GLASS).length >= 5, `${dir}: the glass is lit above and dark below`);
      assert.ok(brightness(SUIT) - brightness(ramp(GLASS).dark) > 0.3, 'the dark of the glass is far from a pale shell in value');
    }
    inFrame(g, `visorHelmet ${dir}`);
  }
  const count = (size) => seen(body('idle', 'down', 0, { head: (gg, J, P, d) => T.visorHelmet(gg, J, P, d, { size, shell: MARK }) }).g, MARK);
  assert.ok(count(1.8) > count(1) + 8 && count(1) > count(0.5) + 4, `a bigger size is a bigger shell (${count(0.5)}, ${count(1)}, ${count(1.8)})`);
  assert.ok(T.visorHelmetRise(1.8) > T.visorHelmetRise(0.5) && T.visorHelmetRise(1.8) <= 2.5);
});

test('S04 visor: a band of glass over the eyes with hair above it; from behind only its strap; size makes it deeper', () => {
  const draw = (dir, size) => body('idle', dir, 0, { head: (gg, J, P, d) => T.visor(gg, J, P, d, { size, colour: GLASS, strap: MARK }) }).g;
  for (const dir of ['down', 'side']) assert.ok(seen(draw(dir, 1), GLASS) >= 12, `${dir}: the glass shows`);
  assert.equal(seen(draw('up', 1), GLASS), 0, 'no glass from behind');
  assert.ok(lit(draw('up', 1), MARK).length >= 8, 'the strap shows from behind');
  assert.ok(lit(draw('side', 1), MARK).length >= 2, 'the strap runs back over the hair from the side');
  assert.equal(lit(draw('down', 1), MARK).length, 0, 'no strap from the front');
  assert.ok(seen(draw('down', 1.8), GLASS) > seen(draw('down', 0.5), GLASS) + 10, 'a bigger visor is deeper');
});

test('S04 pack: every kind shows in all three directions, most of it from behind, and only the antenna rises above the head', () => {
  for (const kind of T.PACK_KINDS) {
    const shown = {};
    for (const dir of T.DIRECTIONS) {
      const bare = body('idle', dir, 0, {}).g;
      const { g, J } = body('idle', dir, 0, { behind: (gg, J, P, d) => T.pack(gg, J, P, d, { kind, size: 1, colour: MARK, glow: MARK2 }) });
      shown[dir] = diff(g, bare);
      assert.ok(shown[dir] >= 6, `${kind} ${dir}: ${shown[dir]} pixels of it show`);
      assert.ok(lit(g, MARK2).length + lit(g, ramp(MARK2).light).length >= 1, `${kind} ${dir}: its light shows`);
      const top = Math.min(...lit(g).map(([, y]) => y));
      if (kind === 'antenna') assert.ok(top < J.headTop - 2 && top >= J.headTop - T.packRise(kind, 1) - 1, `antenna ${dir}: its tip is above the head, within packRise (${top}, head ${J.headTop})`);
      else assert.ok(top >= J.headTop, `${kind} ${dir}: nothing above the head`);
      inFrame(g, `pack ${kind} ${dir}`);
    }
    assert.ok(shown.up > shown.down, `${kind}: more of it shows from behind (${shown.up}) than from the front (${shown.down})`);
    assert.equal(T.packRise(kind, 1) > 0, kind === 'antenna');
    const size = (s) => seen(body('idle', 'up', 0, { behind: (gg, J, P, d) => T.pack(gg, J, P, d, { kind, size: s, colour: MARK }) }).g, MARK);
    assert.ok(size(1.35) > size(0.65) + 6, `${kind}: Size changes it (${size(0.65)}, ${size(1.35)})`);
  }
});

test('S04 pack: tucked in a dodge, nothing of a pack hangs below the feet, at the smallest and the largest body', () => {
  for (const dimsOf of [{ height: 0, build: 0 }, {}, { height: 1, build: 1 }]) for (const kind of T.PACK_KINDS) for (const t of [2 / 7, 3 / 7, 4 / 7]) {
    const { g, J } = body('dodge', 'down', t, { behind: (gg, J, P, d) => T.pack(gg, J, P, d, { kind, size: 1.35, colour: MARK, glow: MARK2, thrust: 1 }) }, { dimsOf });
    const low = Math.max(...lit(g).filter(([x, y]) => [MARK, MARK2].some((c) => tonesOf(c).map(col).includes(g.get(x, y)))).map(([, y]) => y), 0);
    assert.ok(low <= J.gy - 1, `${kind} at ${t.toFixed(2)}: its lowest pixel ${low} is below the feet (${J.gy - 1})`);
  }
});

test('S04 packStraps and stripe: straps down the chest from the front and side only; a stripe is one row in its own colour in every direction', () => {
  const straps = (dir) => lit(body('idle', dir, 0, { torso: (gg, J, P, d) => T.packStraps(gg, J, P, d, { colour: MARK }) }).g, MARK);
  assert.equal(new Set(straps('down').map(([x]) => x)).size, 2, 'two straps from the front');
  assert.ok(straps('down').length >= 6);
  assert.equal(new Set(straps('side').map(([x]) => x)).size, 1, 'one strap from the side');
  assert.equal(straps('up').length, 0, 'none from behind');
  for (const dir of T.DIRECTIONS) {
    const { g, J } = body('idle', dir, 0, { torso: (gg, J, P, d) => T.stripe(gg, J, P, d, { colour: MARK, up: 2 }) });
    const px = lit(g, MARK);
    assert.ok(px.length >= (dir === 'side' ? 3 : 6) && px.every(([, y]) => y === Math.round(J.hip[1]) - 2), `${dir}: one row, two above the hip (${px.length}; from the side the near arm hangs over it)`);
  }
});

test('S04 gloves: called from the offhand, torso and front hooks, both hands are gloved in every direction and no hand is painted twice', () => {
  const hooks = (calls) => Object.fromEntries(['offhand', 'torso', 'front'].map((layer) => [layer, (gg, J, P, d) => { const before = lit(gg, MARK).length; T.gloves(gg, J, P, d, { colour: MARK, layer }); calls.push(lit(gg, MARK).length > before ? layer : null); }]));
  for (const dir of T.DIRECTIONS) for (const action of ['idle', 'walk', 'shoot']) {
    const calls = [], { g, d } = body(action, dir, 0.2, hooks(calls));
    const near = lit(g, MARK).length, hand = d.armW * 2;
    if (dir === 'side') assert.ok(near >= hand - 1 && near <= hand, `${action} side: the near hand is gloved (${near})`);
    else assert.ok(near >= hand * 2 - 2 && near <= hand * 2, `${action} ${dir}: both hands are gloved (${near})`);
    assert.equal(calls.filter(Boolean).length, dir === 'side' ? 1 : 1, `${action} ${dir}: the bright gloves are painted by one layer (${calls})`);
  }
});

test('S04 suitLights: a light on the chest (not from behind) and one on each shoulder, in every direction', () => {
  const draw = (dir, opt = {}) => { const { g } = body('idle', dir, 0, { torso: (gg, J, P, d) => T.suitLights(gg, J, P, d, { colour: MARK, layer: 'torso', ...opt }), front: (gg, J, P, d) => T.suitLights(gg, J, P, d, { colour: MARK, layer: 'front', ...opt }) }); return seen(g, MARK); };
  assert.ok(draw('down') >= 9, `down: chest and both shoulders (${draw('down')})`);
  assert.ok(draw('up') >= 3 && draw('up') < draw('down'), `up: the shoulders only (${draw('up')})`);
  assert.ok(draw('side') >= 5, `side: the chest and the near shoulder (${draw('side')})`);
  assert.ok(draw('down', { chest: false }) < draw('down') && draw('down', { shoulders: false }) < draw('down'));
  assert.equal(draw('down', { chest: false, shoulders: false }), 0);
});

test('S04 guns: blaster, scatter and beam have sizes in one table, each draws its own shape from an attach point, and other kinds go to heldItem', () => {
  assert.deepEqual(T.GUN_KINDS, ['blaster', 'scatter', 'beam']);
  assert.ok(T.GUNS.blaster.length < T.GUNS.scatter.length && T.GUNS.scatter.length < T.GUNS.beam.length);
  assert.equal(T.gunSize('beam', 1.2).length, T.GUNS.beam.length * 1.2);
  assert.deepEqual(T.gunSize('sword', 1), T.itemSize('sword', 1));
  assert.equal(T.gunSize('none', 1), null);
  const masks = {};
  for (const kind of T.GUN_KINDS) for (const [dir, angle] of [['side', Math.PI / 2], ['up', Math.PI], ['down', -0.6]]) {
    const g = new Surface(W, H), size = T.gunSize(kind, 1);
    T.heldGun(g, dir, { x: 24, y: 24, angle, reach: 1 }, { kind, length: size.length, metal: MARK, glow: MARK2 });
    const px = lit(g), along = px.map(([x, y]) => (x + 0.5 - 24) * Math.sin(angle) + (y + 0.5 - 24) * Math.cos(angle));
    assert.ok(Math.abs(Math.max(...along) - size.length) <= 2, `${kind} ${dir}: its muzzle is ${Math.max(...along).toFixed(1)} px from the hand, size says ${size.length}`);
    assert.ok(Math.min(...along) >= -size.back - 2, `${kind} ${dir}: it reaches ${(-Math.min(...along)).toFixed(1)} px behind the hand, size says ${size.back}`);
    const across = px.map(([x, y]) => Math.abs((x + 0.5 - 24) * Math.cos(angle) - (y + 0.5 - 24) * Math.sin(angle)));
    assert.ok(Math.max(...across) <= size.pad + 1.6, `${kind} ${dir}: it is ${Math.max(...across).toFixed(1)} px wide to one side, pad says ${size.pad}`);
    assert.ok(lit(g, MARK2).length >= 1, `${kind} ${dir}: its cell is lit`);
    if (dir === 'side') masks[kind] = g;
  }
  assert.ok(diff(masks.blaster, masks.scatter) > 10 && diff(masks.scatter, masks.beam) > 10 && diff(masks.blaster, masks.beam) > 10, 'the three kinds are three shapes');
  const a = new Surface(W, H), b = new Surface(W, H), item = { kind: 'gun', length: 10, metal: MARK };
  T.heldGun(a, 'side', { x: 24, y: 24, angle: Math.PI / 2 }, item); T.heldItem(b, 'side', { x: 24, y: 24, angle: Math.PI / 2 }, item);
  assert.equal(diff(a, b), 0, 'a kind that is not a gun kind is drawn by heldItem');
});

test('S04 guns: aimed at the camera a gun is seen end on: a short thick block ringed with the outline colour where it lies over the body', () => {
  for (const kind of T.GUN_KINDS) {
    const F = T.frame('shoot_down', 0, {}, { item: T.gunSize(kind, 1), carry: 'ready' });
    const g = new Surface(W, H);
    F.draw(g, LOOK, { item: (gg, J) => T.heldGun(gg, 'down', F.hand(J), { kind, length: F.item.length, metal: MARK, glow: MARK2 }) });
    const px = tonesOf(MARK).flatMap((c) => lit(g, c)), xs = px.map(([x]) => x), ys = px.map(([, y]) => y);
    assert.ok(px.length >= 8, `${kind}: it shows in front of the body (${px.length})`);
    assert.ok(Math.max(...xs) - Math.min(...xs) + 1 >= 3 && Math.max(...ys) - Math.min(...ys) + 1 <= 9, `${kind}: short and thick (${Math.max(...xs) - Math.min(...xs) + 1} x ${Math.max(...ys) - Math.min(...ys) + 1})`);
    assert.ok(lit(g, INK).length >= 6, `${kind}: ringed where it lies over the body (${lit(g, INK).length})`);
  }
  // the same short gun at an angle (a tucked dodge) is drawn side on, inside its size
  const g = new Surface(W, H);
  T.heldGun(g, 'down', { x: 24, y: 24, angle: -0.45, reach: 0.5 }, { kind: 'blaster', length: 8, metal: MARK });
  assert.ok(Math.max(...lit(g).map(([, y]) => y)) <= 24 + 8 * 0.5 + 2, 'drawn at its shortened length');
});

test('S04 muzzleFlare: a star with a hot centre just beyond the muzzle and a ray the way it points; it never touches the frame edge', () => {
  for (const angle of [0, Math.PI / 2, Math.PI]) {
    const g = new Surface(W, H);
    T.muzzleFlare(g, { x: 24, y: 24, angle }, { size: 2, colour: MARK, core: MARK2 });
    const far = lit(g, MARK).map(([x, y]) => (x + 0.5 - 24) * Math.sin(angle) + (y + 0.5 - 24) * Math.cos(angle));
    assert.ok(lit(g, MARK2).length === 5 && Math.max(...far) >= 5.5 && Math.min(...far) > -2.5, `angle ${angle}: core ${lit(g, MARK2).length}, ${Math.min(...far)}..${Math.max(...far)} along the muzzle`);
    const still = new Surface(W, H);
    T.muzzleFlare(still, { x: 24, y: 24, angle }, { size: 2, colour: MARK, core: MARK2, ray: false });
    assert.ok(lit(still).length < lit(g).length && lit(still).length === 9, 'ray: false leaves the star alone');
  }
  for (const at of [{ x: 46, y: 1, angle: Math.PI / 2 }, { x: 1, y: 46, angle: 0 }, { x: 24, y: 2, angle: Math.PI }]) {
    const g = new Surface(W, H);
    T.muzzleFlare(g, at, { size: 3 });
    for (const [x, y] of lit(g)) assert.ok(x >= 1 && y >= 1 && x <= W - 2 && y <= H - 2, 'the flare touches the frame edge');
  }
});

test('S04 dashStreaks: two bars trail a tucked body away from where it is going, shorten as the dash runs out, and stay in the frame', () => {
  const bars = (dir, fade) => { const { g, J, P, d } = body('dodge', dir, 3 / 7, {}); const before = lit(g).length; T.dashStreaks(g, J, P, d, { colour: MARK, core: MARK2, fade }); inFrame(g, `dashStreaks ${dir}`); return { n: lit(g).length - before, g, J }; };
  const down = bars('down', 0);
  assert.ok(down.n >= 20, `down: ${down.n} pixels of streak`);
  assert.ok([...lit(down.g, MARK), ...lit(down.g, MARK2)].every(([, y]) => y < down.J.headTop), 'facing the camera they trail up the screen, above the head');
  assert.ok(lit(down.g, MARK2).length >= 4 && lit(down.g, MARK).length >= 6, 'hot at the body, the colour beyond');
  const side = bars('side', 0);
  assert.ok([...lit(side.g, MARK), ...lit(side.g, MARK2)].every(([x]) => x < side.J.bx - 4), 'in a side clip they trail to the left');
  assert.ok(bars('down', 0.5).n < down.n && bars('down', 0.5).n > 0, 'they shorten');
  assert.equal(bars('down', 1).n, 0, 'and are gone at the end');
});

test("S04 carry 'ready': a gun is held at the hip, nearly level from the side with the hand forward, and the walk carries it steady", () => {
  assert.equal(T.CARRY.ready, T.CARRY_READY);
  const d = T.dims({});
  const ready = T.pose('idle', 'side', 0, { armed: true, carry: 'ready' }, d), low = T.pose('idle', 'side', 0, { armed: true, carry: 'low' }, d);
  assert.ok(Math.abs(ready.item - Math.PI / 2) < 0.5 && Math.abs(low.item - Math.PI / 2) > 0.7, 'more level than the low carry');
  assert.ok(T.solve('side', ready, d).armF.hand[0] >= T.solve('side', low, d).armF.hand[0] + 2, 'the hand is held forward');
  for (const dir of ['down', 'up']) assert.ok(Math.cos(T.pose('idle', dir, 0, { carry: 'ready' }, d).item) > 0.5, `${dir}: the tip points down the screen`);
  const swing = (carry) => { const xs = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => T.pose('walk', 'side', f / 8, { armed: true, carry }, d).armF.f); return Math.max(...xs) - Math.min(...xs); };
  assert.ok(swing('ready') < swing('low') * 0.6, `the weapon arm swings less (${swing('ready').toFixed(1)} against ${swing('low').toFixed(1)})`);
  // every clip of a gunner stays inside the frame at the smallest and the largest body, with the longest gun
  for (const dimsOf of [{ height: 0, build: 0 }, {}, { height: 1, build: 1 }]) for (const clip of Object.keys(T.clips(() => 0.5, { action: 'shoot', plain: ['dodge', 'hurt', 'die'] }))) {
    const frames = T.STANDARD[T.parseClip(clip).action].frames;
    for (let f = 0; f < frames; f++) {
      const F = T.frame(clip, f / (frames - 1), dimsOf, { item: T.gunSize('beam', 1.35), carry: 'ready' }), g = new Surface(W, H);
      F.draw(g, LOOK, { item: (gg, J) => T.heldGun(gg, F.direction, F.hand(J), { kind: 'beam', length: F.item.length, glow: GLASS }) });
      F.finish(g, { flash: false });
      if (F.P.fire) T.muzzleFlare(g, F.sockets().muzzle, { ray: F.direction !== 'down' });
      inFrame(g, `${clip} frame ${f}`);
    }
  }
});

test('S04 shoot: aimed at the camera the hands are below the chest light; facing away the hand is far enough out for a gun to clear a helmet', () => {
  const d = T.dims({});
  const front = T.pose('shoot', 'down', 0.2, { armed: true, carry: 'ready' }, d), Jf = T.solve('down', front, d);
  assert.ok(Math.round(Jf.armF.hand[1]) - 1 >= Jf.shoulderY + d.chin + 4, `the fist (${Jf.armF.hand[1].toFixed(1)}) is under the chest light (rows ${Jf.shoulderY + d.chin + 1} and ${Jf.shoulderY + d.chin + 2})`);
  const back = T.pose('shoot', 'up', 0.2, { armed: true, carry: 'ready' }, d), Jb = T.solve('up', back, d);
  const shellEdge = Jb.head[0] + d.headW / 2 + T.visorHelmetRise(1);
  assert.ok(Jb.armF.hand[0] - 1.5 >= shellEdge - 0.6, `the gun's inner edge (${(Jb.armF.hand[0] - 1.5).toFixed(1)}) clears a helmet of the standard size (${shellEdge.toFixed(1)})`);
  // and it shows: with the helmet on, most of a blaster is in view beside it
  const F = T.frame('shoot_up', 0.2, {}, { item: T.gunSize('blaster', 1), carry: 'ready' });
  let alone = 0;
  const shown = (helmet) => {
    const g = new Surface(W, H);
    F.draw(g, LOOK, {
      item: (gg, J) => { const s = new Surface(W, H); T.heldGun(s, 'up', F.hand(J), { kind: 'blaster', length: F.item.length, metal: MARK }); alone = seen(s, MARK); T.heldGun(gg, 'up', F.hand(J), { kind: 'blaster', length: F.item.length, metal: MARK }); },
      head: (gg, J, P, dd) => { if (helmet) T.visorHelmet(gg, J, P, dd, { size: 1 }); },
    });
    return seen(g, MARK);
  };
  assert.ok(shown(true) >= alone * 0.5, `${shown(true)} of ${alone} pixels of the gun show beside the helmet`);
  assert.ok(shown(true) >= shown(false) - 2, `the helmet hides almost none of it (${shown(true)} against ${shown(false)} bare-headed)`);
});

test('S04 spine: a stripe down the middle of the back from the collar to the belt, seen only from behind', () => {
  const draw = (dir, wide) => { const { g, J } = body('idle', dir, 0, { torso: (gg, J, P, d) => T.spine(gg, J, P, d, { colour: MARK, wide }) }); return { px: lit(g, MARK), J }; };
  const { px, J } = draw('up', 1);
  assert.ok(px.length >= 4 && new Set(px.map(([x]) => x)).size === 1 && px[0][0] === Math.floor(J.bx), `one column on the centre line (${px.length})`);
  assert.ok(px.every(([, y]) => y < Math.round(J.hip[1]) - 2), 'it stops above the belt row');
  assert.equal(new Set(draw('up', 3).px.map(([x]) => x)).size, 3);
  assert.equal(draw('down', 1).px.length + draw('side', 1).px.length, 0);
});
