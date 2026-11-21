// Framework additions of batch S10 (warden-mech):
//   engine/warmachine.js   war machine parts in the three-quarter view: armourBlock, reactorPort, mechHead (MECH_HEADS),
//                          armWeapon (ARM_WEAPONS), rackTubes, missileRack, radiatorFins, risingMissile
//   (rigs/mech-walker.js, the walking war machine rig, was also added; R2 deleted it and its tests)
// R2: rigs/mech-walker.js went: the tests of the walking war machine rig are deleted; those of engine/warmachine.js that need no rig stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, tone, INK } from '../../engine/color.js';
import { steps } from '../../engine/fx.js';
import * as W from '../../engine/warmachine.js';

const BODY = '#6b7896', GLOW = '#e2473f', ACCENT = '#f2a030', STEEL = '#c2c9d6', PLATE = '#434d6d';
const H = ramp(BODY), K = ramp(PLATE), S = ramp(STEEL), A = ramp(ACCENT), L = steps(GLOW, { core: '#f0ead8' });
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

