// Framework additions of batch S10 (warden-mech):
//   engine/warmachine.js   war machine parts in the three-quarter view: armourBlock, reactorPort, mechHead (MECH_HEADS),
//                          armWeapon (ARM_WEAPONS), rackTubes, missileRack, radiatorFins, risingMissile
//   rigs/mech-walker.js    the walking war machine rig: a two-legged mech that faces the camera (clips, dims, pose, solve,
//                          draw, lights, sockets, frame; WEAPONS, PACKS, HEADS, POSES)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, tone, INK } from '../../engine/color.js';
import { steps } from '../../engine/fx.js';
import * as W from '../../engine/warmachine.js';
import * as M from '../../rigs/mech-walker.js';

const BODY = '#6b7896', GLOW = '#e2473f', ACCENT = '#f2a030', STEEL = '#c2c9d6', PLATE = '#434d6d';
const H = ramp(BODY), K = ramp(PLATE), S = ramp(STEEL), A = ramp(ACCENT), L = steps(GLOW, { core: '#f0ead8' });
const LOOK = { body: BODY, accent: ACCENT, glow: GLOW, metal: STEEL, dark: PLATE, core: '#f0ead8', fire: ACCENT };
const count = (g, c) => { const v = col(c); let n = 0; for (const p of g.data) if (p === v) n++; return n; };
const drawn = (g) => { let n = 0; for (const p of g.data) if (p) n++; return n; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const lightOf = (g) => L.slice(0, 4).reduce((n, c) => n + count(g, c), 0);
const mirrored = (g, cx) => { for (let y = 0; y < g.h; y++) for (let x = 0; x < cx; x++) if (!!g.get(x, y) !== !!g.get(2 * cx - 1 - x, y)) return false; return true; };

// ---- engine/warmachine.js ---------------------------------------------------------------------------

test('S10 armourBlock: a lit top face over a shaded front, with cut corners and a taper', () => {
  const g = new Surface(40, 40);
  const B = W.armourBlock(g, { x0: 10, x1: 30, top: 8, face: 12, bottom: 28, inset: 2, cut: [3, 0], paint: H });
  assert.deepEqual(g.bounds(), { x0: 10, y0: 8, x1: 29, y1: 27 });
  assert.equal(g.get(20, 9), col(H.light), 'the top face is the lit tone');
  assert.equal(g.get(20, 20), col(H.base), 'the front is the base tone');
  assert.equal(g.get(10, 20), col(H.dark), 'its left edge is in shade');
  assert.equal(g.get(29, 20), col(H.light), 'its right edge catches the light');
  assert.equal(g.get(10, 8), 0, 'the far edge of the top is narrower');
  assert.equal(g.get(10, 27), 0, 'the lower left corner is cut');
  assert.notEqual(g.get(29, 27), 0, 'the lower right corner is not');
  assert.ok(B.top(20.5, 9.5) && !B.front(20.5, 9.5) && B.front(20.5, 20.5) && B.all(20.5, 9.5) && B.all(20.5, 20.5));
  // a front that tapers to a narrower foot
  const t = new Surface(40, 40);
  W.armourBlock(t, { x0: 6, x1: 34, top: 6, face: 10, bottom: 30, foot: [14, 26], waist: 18, paint: H });
  assert.notEqual(t.get(6, 14), 0); assert.equal(t.get(6, 28), 0); assert.notEqual(t.get(14, 29), 0);
});

test('S10 armourBlock: a seam darkens what it sits on, only along its edge', () => {
  const g = new Surface(40, 40);
  g.rect(2, 2, 36, 36, BODY);
  W.armourBlock(g, { x0: 12, x1: 28, top: 10, face: 13, bottom: 26, paint: H, seam: H.deep });
  assert.equal(g.get(11, 20), col(H.deep), 'the pixel beside it is the seam');
  assert.equal(g.get(9, 20), col(BODY), 'two pixels further it is untouched');
});

test('S10 reactorPort: brighter with level, bigger and unbarred when open, a dark socket when out', () => {
  const at = (o) => { const g = new Surface(40, 40); const r = W.reactorPort(g, 20, 20, 5, { housing: K, colours: L, ...o }); return { g, r }; };
  const lit = at({ level: 1 }), hot = at({ level: 2 }), dim = at({ level: 0.5 }), out = at({ level: 0 });
  assert.ok(count(hot.g, L[0]) > count(lit.g, L[0]), 'white hot has more white');
  assert.ok(count(lit.g, L[3]) > 0 && count(dim.g, L[4]) > count(lit.g, L[4]), 'dim falls back on the rim tone');
  assert.equal(lightOf(out.g), 0, 'out: nothing glows');
  assert.ok(drawn(out.g) > 100, 'but the socket is still there');
  // the bars lie across a shut port: rows of the housing colour inside the core
  const row = (g, y) => { let n = 0; for (let x = 16; x < 24; x++) if (g.get(x, y) === col(K.base)) n++; return n; };
  const barred = [...Array(11).keys()].filter((i) => row(lit.g, 15 + i) >= 6).length;
  assert.equal(barred, 2, 'two shutter bars');
  const open = at({ level: 1.5, open: 1 });
  assert.equal([...Array(11).keys()].filter((i) => row(open.g, 15 + i) >= 6).length, 0, 'open: no bars');
  assert.ok(open.r.r > lit.r.r && open.r.housing > lit.r.housing, 'and the core has grown');
  assert.ok(mirrored(lit.g, 20), 'the same on both sides');
  // soot streaks land only on the armour they are given
  const g = new Surface(40, 40);
  g.rect(4, 4, 32, 32, BODY);
  const on = (px, py) => px >= 4 && px < 36 && py >= 4 && py < 20;
  W.reactorPort(g, 20, 20, 5, { level: 0, open: 1, burnt: on, housing: K, colours: L });
  let above = 0, below = 0;
  for (let y = 4; y < 36; y++) for (let x = 4; x < 36; x++) if (g.get(x, y) === col(K.base) && Math.hypot(x + 0.5 - 20, y + 0.5 - 20) > 9.5) (y < 20 ? above++ : below++);
  assert.ok(above > 3 && below === 0, `soot only where the armour is (${above} above, ${below} below)`);
});

test('S10 mechHead: three heads that stand on their row, with lights that go out', () => {
  assert.deepEqual([...W.MECH_HEADS], ['cockpit', 'sensor', 'skull plate']);
  assert.throws(() => W.mechHead(new Surface(8, 8), 'dome', 4, 4), /no head "dome"/);
  const pictures = {};
  for (const kind of W.MECH_HEADS) {
    const g = new Surface(40, 40);
    const R = W.mechHead(g, kind, 20, 30, { w: 14, h: 12, body: H, metal: S, dark: K, colours: L, level: 1 });
    const b = g.bounds();
    assert.equal(b.y1, 29, `${kind}: its last row is the one above y`);
    assert.equal(R.top, b.y0, `${kind}: top is its highest pixel`);
    assert.ok(b.x1 - b.x0 + 1 >= 10 && b.x1 - b.x0 + 1 <= 18, `${kind}: about as wide as asked`);
    assert.ok(R.eyes.length >= 1 && R.eyes.every(([x, y]) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1), `${kind}: its lights are on it`);
    assert.ok(lightOf(g) >= 3, `${kind}: lit`);
    const off = new Surface(40, 40);
    W.mechHead(off, kind, 20, 30, { w: 14, h: 12, body: H, metal: S, dark: K, colours: L, level: 0 });
    assert.equal(lightOf(off), 0, `${kind}: nothing glows when off`);
    assert.deepEqual(off.bounds(), b, `${kind}: the same head with its lights out`);
    pictures[kind] = g;
  }
  assert.ok(diff(pictures.cockpit, pictures.sensor) > 30 && diff(pictures.cockpit, pictures['skull plate']) > 30 && diff(pictures.sensor, pictures['skull plate']) > 30);
  // the skull plate is pale metal, not armour
  assert.ok(count(pictures['skull plate'], S.base) > 30);
});

test('S10 armWeapon: three weapons hang from the elbow to their tip; claws work and drills turn', () => {
  assert.deepEqual([...W.ARM_WEAPONS], ['cannon arms', 'claws', 'drills']);
  assert.throws(() => W.armWeapon(new Surface(8, 8), 'saw', 4, 0, 8), /no weapon "saw"/);
  const draw = (kind, o = {}) => { const g = new Surface(40, 48); const r = W.armWeapon(g, kind, 20, 10, o.length ?? 18, { body: H, metal: S, dark: K, accent: A, ...o }); return { g, r }; };
  for (const kind of W.ARM_WEAPONS) {
    const { g, r } = draw(kind), b = g.bounds();
    assert.equal(b.y0, 10, `${kind}: starts at the elbow`);
    assert.equal(b.y1, 27, `${kind}: ends on the row before its tip`);
    assert.deepEqual(r.tip, [20, 28]);
    assert.ok(count(g, A.base) >= 4, `${kind}: carries the hazard colour`);
    assert.ok(count(g, S.base) + count(g, S.light) >= 12, `${kind}: bright metal`);
    assert.ok(draw(kind, { length: 24 }).g.bounds().y1 > b.y1, `${kind}: longer when asked`);
    assert.ok(draw(kind, { k: 1.2 }).g.bounds().x1 >= b.x1, `${kind}: not narrower when scaled up`);
  }
  assert.ok(mirrored(draw('cannon arms').g, 20), 'a cannon is the same on both sides');
  // claws: open and shut over eight steps of work, and wider open than shut
  const shut = draw('claws', { work: 0 }).g, wide = draw('claws', { work: 4 }).g;
  assert.ok(wide.bounds().x1 > shut.bounds().x1 && wide.bounds().x0 < shut.bounds().x0, 'they open');
  assert.equal(diff(shut, draw('claws', { work: 8 }).g), 0, 'and are shut again after eight');
  // drills: the grooves step with work, the outline stays
  const d0 = draw('drills', { work: 0 }).g, d1 = draw('drills', { work: 1 }).g;
  assert.ok(diff(d0, d1) >= 6, 'the grooves move');
  assert.deepEqual(d0.bounds(), d1.bounds());
  assert.equal(diff(d0, draw('drills', { work: 4 }).g), 0, 'a whole groove later it is the same picture');
  assert.ok(diff(draw('drills', { side: -1 }).g, draw('drills', { side: 1 }).g) > 0, 'left and right drills are wound opposite ways');
});

test('S10 rackTubes and missileRack: tubes in rows, a nose in each until it has fired', () => {
  const T = W.rackTubes(10, 20, { cols: 2, rows: 2, tube: 4, gap: 2 });
  assert.equal(T.length, 4);
  assert.deepEqual(T.map((t) => [t.x, t.y]), [[12, 21], [18, 21], [12, 26], [18, 26]]);
  assert.deepEqual([T[0].cx, T[0].cy], [14, 23]);
  const g = new Surface(40, 40);
  const Rk = W.missileRack(g, 20, 32, { cols: 2, rows: 2, tube: 4, paint: H, dark: K, nose: GLOW, glint: '#ffffff' });
  assert.deepEqual([Rk.w, Rk.h, Rk.x0, Rk.y0, Rk.top], [14, 11, 13, 21, 18]);
  assert.deepEqual(g.bounds(), { x0: 13, y0: 18, x1: 26, y1: 31 });
  assert.equal(count(g, '#ffffff'), 4, 'one glint per nose');
  for (const t of Rk.tubes) assert.equal(g.get(t.x, t.y), col(K.dark), 'each tube is a dark mouth');
  const fired = new Surface(40, 40);
  W.missileRack(fired, 20, 32, { cols: 2, rows: 2, tube: 4, paint: H, dark: K, nose: GLOW, glint: '#ffffff', empty: [0, 3] });
  assert.equal(count(fired, '#ffffff'), 2, 'two have gone');
  assert.equal(fired.get(Rk.tubes[0].x + 1, Rk.tubes[0].y + 1), col(K.dark), 'an empty tube is dark all through');
  assert.deepEqual(fired.bounds(), g.bounds());
});

test('S10 radiatorFins: a fan that leans out to its side, with hot tips when asked', () => {
  for (const side of [-1, 1]) {
    const g = new Surface(60, 40);
    const tips = W.radiatorFins(g, 30, 34, { side, count: 3, length: 14, paint: S });
    assert.equal(tips.length, 3);
    assert.ok(tips.every(([x, y]) => (x - 30) * side > 0 && y < 34), 'every tip is up and out on its side');
    assert.ok(Math.abs(tips[2][0] - 30) > Math.abs(tips[0][0] - 30) && tips[2][1] > tips[0][1], 'the last fin leans furthest and reaches less high');
    assert.equal(count(g, GLOW), 0);
    const hot = new Surface(60, 40);
    W.radiatorFins(hot, 30, 34, { side, count: 3, length: 14, paint: S, hot: GLOW, slat: S.dark });
    assert.ok(count(hot, GLOW) >= 6, 'the fins glow along their middle');
  }
  const a = new Surface(60, 40), b = new Surface(60, 40);
  W.radiatorFins(a, 30, 34, { side: -1, paint: S }); W.radiatorFins(b, 30, 34, { side: 1, paint: S });
  assert.ok(Math.abs((30 - a.bounds().x0) - (b.bounds().x1 - 29)) <= 1, 'the two sides reach as far');
});

test('S10 risingMissile: a nose, a body and a flame, never outside its box', () => {
  const g = new Surface(20, 30);
  const n = W.risingMissile(g, 10, 8, { length: 5, flame: 6, body: '#f0ead8', nose: GLOW });
  assert.ok(n > 30);
  assert.equal(g.get(10, 8), col(GLOW), 'the nose leads');
  assert.equal(g.get(10, 11), col('#f0ead8'), 'then the body');
  assert.equal(g.get(10, 13), col('#ffffff'), 'the flame is white hot under the tail');
  assert.equal(g.get(10, 7), col(tone('#f0ead8', -1.4)), 'rimmed with its own dark tone, not ink');
  assert.equal(count(g, INK), 0);
  const b = g.bounds();
  assert.ok(b.y0 === 7 && b.y1 === 19 && b.x0 === 8 && b.x1 === 12, JSON.stringify(b));
  // leaving the top of the frame it is cut at the box
  const cut = new Surface(20, 30);
  W.risingMissile(cut, 10, -3, { length: 5, flame: 6 });
  assert.equal(cut.bounds().y0, 1, 'nothing on the outermost row');
  const gone = new Surface(20, 30);
  assert.equal(W.risingMissile(gone, 10, -30, {}), 0);
});

// ---- rigs/mech-walker.js ----------------------------------------------------------------------------

const frameOf = (clip, f, p = {}, opt = {}) => {
  const c = M.clips()[clip], t = c.loop ? f / c.frames : f / (c.frames - 1);
  return M.frame(clip, t, p, { head: 'cockpit', weapon: { kind: 'cannon arms', length: 1 }, pack: { kind: 'missile pods', size: 1 }, ...opt });
};
const picture = (clip, f, p, opt) => { const g = new Surface(...M.SIZE), F = frameOf(clip, f, p, opt); F.draw(g, LOOK); F.finish(g, LOOK); return g; };

test('S10 mech-walker clips: the table of the style guide, labels on request, unknown poses refused', () => {
  const c = M.clips((p) => p.speed, ['idle', 'walk', { name: 'shoot', label: 'Missile volley' }, 'beam', 'overheat', 'hurt', 'die']);
  assert.deepEqual(Object.keys(c), ['idle', 'walk', 'shoot', 'beam', 'overheat', 'hurt', 'die']);
  assert.deepEqual(Object.values(c).map((x) => x.frames), [8, 8, 12, 12, 10, 4, 12]);
  assert.deepEqual(Object.values(c).map((x) => x.loop), [true, true, false, false, false, false, false]);
  assert.equal(c.shoot.label, 'Missile volley');
  assert.equal(c.walk.label, undefined);
  assert.ok(Math.abs(c.walk.fps({ speed: 0.5 }) - 10.5) < 1e-9 && c.walk.fps({ speed: 1 }) > c.walk.fps({ speed: 0 }));
  assert.throws(() => M.clips(() => 0.5, ['fly']), /no pose "fly"/);
  assert.throws(() => M.pose('fly', 0), /no pose "fly"/);
  assert.deepEqual([...M.POSES], ['idle', 'walk', 'shoot', 'beam', 'overheat', 'hurt', 'die']);
  assert.deepEqual(M.PIVOT, [48, 88]);
});

test('S10 mech-walker dims: whole pixels that grow with the sliders; a tall machine carries lower pods', () => {
  const lo = M.dims({ size: 0, bulk: 0, legs: 0 }), mid = M.dims(), hi = M.dims({ size: 1, bulk: 1, legs: 1 });
  for (const k of ['chest', 'chestH', 'thigh', 'shin', 'foot', 'shoulderW', 'headW', 'stance', 'coreR']) {
    assert.ok(Number.isInteger(mid[k]), `${k} is a whole number`);
    assert.ok(lo[k] <= mid[k] && mid[k] <= hi[k], `${k} grows`);
  }
  assert.ok(hi.chest > lo.chest + 4 && hi.shin > lo.shin + 4);
  assert.ok(M.dims({ legs: 1 }).shin > M.dims({ legs: 0 }).shin && M.dims({ legs: 1 }).chest === M.dims({ legs: 0 }).chest, 'legs change only the legs');
  assert.equal(M.dims({}, { weapon: { kind: 'drills', length: 1.35 } }).weapon.length > M.dims({}, { weapon: { kind: 'drills', length: 0.65 } }).weapon.length, true);
  assert.equal(M.dims({}, { weapon: { kind: 'laser' } }).weapon.kind, 'cannon arms', 'an unknown weapon falls back on the first');
  assert.equal(M.dims({}, { pack: { kind: 'missile pods', size: 1 } }).pack.rows, 2);
  assert.equal(M.dims({ size: 1, bulk: 1, legs: 1 }, { pack: { kind: 'missile pods', size: 1.35 } }).pack.rows, 1);
  assert.equal(M.dims({}, { pack: { kind: 'wings' } }).pack.kind, 'none');
});

test('S10 mech-walker pose: the loops close, the feet land on frames 0 and 4, one-shots end at rest', () => {
  const d = M.dims();
  const rest = M.pose('idle', 0, {}, d);
  assert.ok(Math.round(rest.by) === 0 && rest.bx === 0 && rest.kneel === 0 && rest.feet[0] === 0 && rest.feet[1] === 0, 'idle starts standing at rest');
  // walk: the left foot is down at t = 0 and in the air before it; the right half a cycle later; the body is lowest on each landing
  const w = (t) => M.pose('walk', t, { bounce: 0.5 }, d);
  assert.equal(w(0).feet[0], 0); assert.ok(w(7 / 8).feet[0] > 2 && w(6 / 8).feet[0] > 3);
  assert.equal(w(4 / 8).feet[1], 0); assert.ok(w(3 / 8).feet[1] > 2 && w(2 / 8).feet[1] > 3);
  assert.ok(w(0).feet[1] === 0 && w(4 / 8).feet[0] === 0, 'never both feet in the air');
  assert.ok(w(0).by > w(2 / 8).by + 1 && w(4 / 8).by > w(6 / 8).by + 1, 'it drops onto each step');
  assert.ok(w(0).stomp[0] === 0 && w(4 / 8).stomp[1] === 0 && w(3 / 8).stomp[0] === -1 && w(0).stomp[1] === -1);
  assert.ok(M.pose('walk', 0.25, { bounce: 1 }, d).feet[1] > M.pose('walk', 0.25, { bounce: 0 }, d).feet[1] + 2, 'bounce lifts the feet higher');
  for (const clip of ['idle', 'walk']) assert.deepEqual(M.pose(clip, 0, {}, d), M.pose(clip, 1, {}, d), `${clip} closes`);
  // one-shots end on the resting body (hurt and die apart, which start on a white recoil; die ends on its knees)
  for (const clip of ['shoot', 'beam', 'overheat', 'hurt']) {
    const end = M.pose(clip, 1, {}, d);
    assert.deepEqual([end.by, end.bx, end.slump, end.shrug, end.kneel, end.open, end.hatch, end.core, end.eye, end.flash], [0, 0, 0, 0, 0, 0, 0, 1, 1, false], `${clip} ends at rest`);
    assert.deepEqual(end.arms, [{ out: 0, up: 0 }, { out: 0, up: 0 }]);
    assert.ok(end.rockets.length === 0 && end.beam === null && end.steam === -1 && end.charge === -1 && end.blasts.length === 0, `${clip} ends with no effects`);
  }
  for (const clip of ['shoot', 'beam', 'overheat']) assert.equal(M.pose(clip, 0, {}, d).by, 0, `${clip} starts at rest`);
  assert.ok(M.pose('hurt', 0, {}, d).flash && M.pose('die', 0, {}, d).flash);
});

test('S10 mech-walker pose: three frames of warning, then the volley, the beam and the fall on their frames', () => {
  const d = M.dims(), at = (clip, n, of) => M.pose(clip, n / (of - 1), {}, d);
  // shoot: braced and open by frame 3, one missile a frame from 4 to 7, left and right in turn
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => at('shoot', n, 12).fired), [0, 0, 0, 0, 1, 2, 3, 4, 4]);
  assert.ok(at('shoot', 1, 12).hatch > 0 && at('shoot', 3, 12).hatch === 1 && at('shoot', 3, 12).by >= 3 && at('shoot', 2, 12).eye === 2);
  assert.deepEqual([4, 5, 6, 7].map((n) => at('shoot', n, 12).kick), [0, 1, 0, 1]);
  assert.deepEqual(at('shoot', 4, 12).rockets, [{ i: 0, age: 0 }]);
  assert.equal(at('shoot', 3, 12).kick, -1);
  // beam: charging on frames 1 to 5, firing on 6 to 9, sweeping from the picture's left to its right
  assert.deepEqual([0, 1, 3, 5, 6].map((n) => at('beam', n, 12).charge), [-1, 0, 0.5, 1, -1]);
  assert.deepEqual([5, 6, 7, 8, 9, 10].map((n) => at('beam', n, 12).beam?.sweep ?? null), [null, -1, -0.36, 0.36, 1, null]);
  assert.ok(at('beam', 5, 12).arms[0].out >= 5 && at('beam', 5, 12).by >= 3 && at('beam', 6, 12).by < 0, 'it braces, then is thrown back');
  assert.ok(at('beam', 5, 12).open === 1 && at('beam', 6, 12).core === 2);
  // overheat: slumped with the reactor open and steam from frame 1 to 8
  assert.ok(at('overheat', 4, 10).slump >= 5 && at('overheat', 4, 10).open === 1 && at('overheat', 4, 10).steam > 0 && at('overheat', 0, 10).steam === -1);
  // die: on its knees from frame 6, the reactor blows on 8 and is burnt out after it, and stays so
  assert.deepEqual([3, 6, 11].map((n) => at('die', n, 12).kneel), [0, 1, 1]);
  assert.ok(at('die', 8, 12).blasts.some((b) => b.big && b.age === 0) && !at('die', 7, 12).blasts.some((b) => b.big));
  assert.ok(at('die', 11, 12).burnt && at('die', 11, 12).core === 0 && at('die', 11, 12).eye === 0 && at('die', 11, 12).blasts.length === 0 && at('die', 11, 12).smoke >= 0);
});

test('S10 mech-walker solve: whole pixels, both sides alike at rest, nothing through the floor', () => {
  const d = M.dims({}, { weapon: { kind: 'drills', length: 1.35 }, pack: { kind: 'missile pods', size: 1 } });
  const J = M.solve(M.pose('idle', 0, {}, d), d);
  for (const v of [J.cx, J.hipY, J.core[0], J.core[1], J.head[1], ...J.legs.flatMap((l) => [...l.knee, ...l.ankle, l.sole]), ...J.shoulders.flatMap((s) => [s.x, s.top, s.bottom]), ...J.arms.flatMap((a) => [a.x, a.elbow])]) assert.ok(Number.isInteger(v), `${v} is a whole pixel`);
  assert.equal(J.legs[0].sole, M.GROUND); assert.equal(J.legs[1].sole, M.GROUND);
  assert.equal(M.CX - J.shoulders[0].x, J.shoulders[1].x - M.CX);
  assert.equal(M.CX - J.arms[0].x, J.arms[1].x - M.CX);
  assert.equal(J.launchers.length, 4);
  assert.ok(J.launchers[0][0] < M.CX && J.launchers[1][0] > M.CX && J.launchers[2][0] < M.CX, 'left and right in turn');
  assert.ok(J.pods.length === 2 && J.launchers.every(([, y]) => y < J.chest.top), 'the tubes are above the chest');
  // with no pods the missiles leave from the shoulders
  const d2 = M.dims({}, { pack: { kind: 'none' } }), J2 = M.solve(M.pose('shoot', 4 / 11, {}, d2), d2);
  assert.equal(J2.pods, null);
  assert.ok(J2.launchers.every(([x, y], i) => Math.abs(x - J2.shoulders[i % 2].x) <= 2 && y === J2.shoulders[i % 2].top + 1));
  // a lifted foot leaves the floor and its knee rises less than it does
  const Jw = M.solve(M.pose('walk', 0.25, { bounce: 1 }, d), d);
  assert.ok(Jw.legs[1].sole < M.GROUND - 4 && Jw.legs[0].sole === M.GROUND && Jw.legs[1].knee[1] < J.legs[1].knee[1] && J.legs[1].knee[1] - Jw.legs[1].knee[1] < M.GROUND - Jw.legs[1].sole);
  // on its knees: the hips are far lower, the knees on the floor, and no weapon passes through it
  const Jk = M.solve(M.pose('die', 1, {}, d), d);
  assert.ok(Jk.hipY > J.hipY + 10 && Jk.legs.every((l) => l.knee[1] >= M.GROUND - d.kneeR - 1));
  assert.ok(Jk.arms.every((a) => a.tip <= M.GROUND - 2), 'the weapons stop at the floor');
  // a deep crouch never sinks the hips below the knees
  assert.ok(M.solve({ ...M.pose('idle', 0, {}, d), by: 40 }, d).hipY <= M.GROUND - d.kneeR - 1);
});

test('S10 mech-walker frame: stands on the pivot line, the same on both sides, and its parts show', () => {
  const g = picture('idle', 0), b = g.bounds();
  assert.equal(b.y1, M.GROUND, 'the outline lands on the pivot row');
  assert.ok(b.x1 - b.x0 + 1 >= 60 && b.x1 - b.x0 + 1 <= 76, `60 to 76 px across (${b.x1 - b.x0 + 1})`);
  assert.ok(mirrored(g, M.CX), 'the silhouette is the same on both sides');
  assert.ok(lightOf(g) > 40, 'the reactor and the eyes are lit');
  assert.ok(count(g, ACCENT) > 60, 'hazard paint on the shoulders and knees');
  assert.ok(count(g, INK) > 300, 'inked once');
  // the look reaches the picture
  const blue = new Surface(...M.SIZE), F = frameOf('idle', 0);
  F.draw(blue, { ...LOOK, glow: '#b48af8', accent: '#2fb3a8' }); F.finish(blue, { ...LOOK, glow: '#b48af8', accent: '#2fb3a8' });
  assert.equal(count(blue, GLOW) + count(blue, ACCENT), 0);
  assert.ok(count(blue, '#b48af8') > 10 && count(blue, '#2fb3a8') > 60);
  // every head, weapon and pack is its own picture, and none of them moves the feet
  const base = picture('idle', 0);
  for (const head of M.HEADS.slice(1)) assert.ok(diff(base, picture('idle', 0, {}, { head })) > 20, head);
  for (const kind of M.WEAPONS.slice(1)) assert.ok(diff(base, picture('idle', 0, {}, { weapon: { kind, length: 1 } })) > 60, kind);
  for (const kind of ['radiators', 'none']) assert.ok(diff(base, picture('idle', 0, {}, { pack: { kind, size: 1 } })) > 60, kind);
  assert.equal(picture('idle', 0, {}, { pack: { kind: 'none' } }).bounds().y1, M.GROUND);
  assert.ok(picture('idle', 0, {}, { pack: { kind: 'none' } }).bounds().y0 > b.y0, 'with nothing on its back it is lower');
  assert.ok(diff(picture('idle', 0, {}, { weapon: { kind: 'drills', length: 0.65 } }), picture('idle', 0, {}, { weapon: { kind: 'drills', length: 1.35 } })) > 30);
  assert.ok(diff(picture('idle', 0, {}, { pack: { kind: 'radiators', size: 0.65 } }), picture('idle', 0, {}, { pack: { kind: 'radiators', size: 1.35 } })) > 30);
});

test('S10 mech-walker frame: the clips move, the hit is white, the wreck stays', () => {
  const frames = (clip) => [...Array(M.clips()[clip].frames).keys()].map((f) => picture(clip, f));
  for (const clip of M.POSES) {
    const F = frames(clip);
    for (let i = 1; i < F.length; i++) assert.ok(diff(F[i - 1], F[i]) > 0, `${clip}: frame ${i} differs from the one before`);
    for (const g of F) assert.ok(drawn(g) > 1500, `${clip}: never empty`);
  }
  // idle: the body stays on the floor and moves a pixel or two
  const idle = frames('idle');
  assert.ok(idle.every((g) => g.bounds().y1 === M.GROUND));
  assert.ok(new Set(idle.map((g) => g.bounds().y0)).size >= 2, 'it breathes');
  // hurt and die start white: nothing but white and ink on frame 0
  for (const clip of ['hurt', 'die']) { const g = picture(clip, 0); assert.equal(count(g, '#ffffff') + count(g, INK), drawn(g), `${clip} frame 0 is a white flash`); }
  // the volley: a missile above the pods on the frames it fires, and none left at the end
  const idleTop = idle[0].bounds().y0;
  assert.ok(picture('shoot', 5).bounds().y0 < idleTop - 6, 'missiles climb above it');
  assert.equal(diff(picture('shoot', 11), idle[0]), 0, 'shoot ends on the idle picture');
  assert.equal(diff(picture('beam', 11), idle[0]), 0, 'beam ends on the idle picture');
  assert.equal(diff(picture('overheat', 9), idle[0]), 0, 'overheat ends on the idle picture');
  assert.equal(diff(picture('hurt', 3), idle[0]), 0, 'hurt ends on the idle picture');
  // the beam leaves the frame downward but never touches its last row
  const beam = picture('beam', 7).bounds();
  assert.equal(beam.y1, M.SIZE[1] - 2);
  // the wreck: on its knees (much lower than standing), dark, and still there
  const wreck = picture('die', 11);
  assert.ok(wreck.bounds().y0 > idleTop + 8, 'it has dropped');
  assert.ok(drawn(wreck) > 1500 && count(wreck, L[3]) < 20, 'the reactor is out');
});

test('S10 mech-walker frame: nothing touches the frame edge at the extremes of every setting', () => {
  const [w, h] = M.SIZE;
  for (const size of [0, 1]) for (const [weapon, pack, head] of [['claws', 'radiators', 'sensor'], ['drills', 'missile pods', 'skull plate'], ['cannon arms', 'none', 'cockpit']]) {
    const p = { size, bulk: size, legs: size, bounce: 1 }, opt = { head, weapon: { kind: weapon, length: size ? 1.35 : 0.65 }, pack: { kind: pack, size: size ? 1.35 : 0.65 } };
    for (const clip of M.POSES) for (let f = 0; f < M.clips()[clip].frames; f++) {
      const b = picture(clip, f, p, opt).bounds();
      assert.ok(b && b.x0 >= 1 && b.y0 >= 1 && b.x1 <= w - 2 && b.y1 <= h - 2, `${clip} ${f} size ${size} ${weapon} ${pack}: ${JSON.stringify(b)}`);
    }
  }
  // the smallest machine still fills a third of the frame
  const small = picture('idle', 0, { size: 0, bulk: 0, legs: 0 }, { weapon: { kind: 'claws', length: 0.65 }, pack: { kind: 'none' } }).bounds();
  assert.ok(Math.max(small.x1 - small.x0, small.y1 - small.y0) + 1 >= 32);
});

test('S10 mech-walker sockets: on the machine, mirrored at rest, and they follow the pose', () => {
  const F = frameOf('idle', 0), Sk = F.sockets();
  assert.deepEqual(Object.keys(Sk).sort(), ['back', 'core', 'feet', 'hand', 'head', 'muzzle', 'offhand']);
  for (const [name, s] of Object.entries(Sk)) assert.ok(s.x >= 1 && s.x <= 94 && s.y >= 1 && s.y <= 94 && Number.isFinite(s.angle), name);
  assert.equal(M.CX - Sk.hand.x, Sk.offhand.x - M.CX);
  assert.equal(Sk.hand.y, Sk.offhand.y);
  assert.deepEqual([Sk.feet.x, Sk.feet.y, Sk.feet.angle], [M.CX, M.GROUND, 0]);
  assert.ok(Sk.hand.x < M.CX && Sk.offhand.x > M.CX, 'hand is on the picture\'s left');
  assert.equal(Sk.muzzle.angle, Math.PI); assert.equal(Sk.core.angle, 0);
  assert.ok(Sk.head.y < Sk.core.y && Sk.back.y < Sk.core.y);
  // the muzzle is the launcher firing now: left on frame 4, right on frame 5
  assert.ok(frameOf('shoot', 4).sockets().muzzle.x < M.CX && frameOf('shoot', 5).sockets().muzzle.x > M.CX);
  // the core drops with the body when it slumps, and to the floor when it kneels
  assert.ok(frameOf('overheat', 4).sockets().core.y > Sk.core.y + 3);
  assert.ok(frameOf('die', 11).sockets().core.y > Sk.core.y + 10);
  // the picture and the sockets agree: the core is on the reactor's lit pixels
  const g = picture('idle', 0);
  assert.ok(L.slice(0, 4).some((c) => g.get(Sk.core.x, Sk.core.y) === col(c)), 'the core socket is on the light');
});
