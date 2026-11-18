// Framework additions of batch S09 (hive-mother):
//   engine/hive.js         discSpots          spots spread evenly over a round surface; a longer list keeps the shorter one's spots
//   engine/hive.js         segmentRingsIn     the furrows between the segments of a swollen body seen from beyond its tip
//   engine/hive.js         antlerIn           a curved beam with tines branching off one side
//   engine/hive.js         frillIn            a scalloped frill of ribs and skin standing out round an ellipse
//   engine/hive.js         blister            an egg sac with a lit core, or burst
//   engine/hive.js         sprayFan           a fan of liquid sprayed from a point
//   rigs/brood-queen.js    clips, dims, pose, solve, draw, lights, sockets, frame      a bloated top-down queen that faces the camera
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import { discSpots, segmentRingsIn, antlerIn, frillIn, blister, sprayFan } from '../../engine/hive.js';
import * as Q from '../../rigs/brood-queen.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (test, w = 96, h = 96) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x + 0.5, y + 0.5)) n++; return n; };
const has = (g, hex) => g.data.includes(col(hex));
const phases = (frames, loop) => Array.from({ length: frames }, (_, f) => (loop ? f / frames : f / (frames - 1)));
const LOOK = { body: '#ca9eda', accent: '#b04a8a', glow: '#9fe040' };
/** One whole frame of a queen, drawn as a sprite draws it. */
function shot(clip, t, p = {}, opt = {}) {
  const g = new Surface(...Q.SIZE), F = Q.frame(clip, t, p, opt);
  F.draw(g, LOOK); F.finish(g, LOOK);
  return { g, F };
}

// ---- engine/hive.js ---------------------------------------------------------------------------------

test('discSpots: spread out, repeatable, and a longer list starts with the shorter one', () => {
  const a = discSpots(6, { seed: 3 }), b = discSpots(12, { seed: 3 });
  assert.equal(a.length, 6);
  assert.deepEqual(b.slice(0, 6), a, 'adding spots leaves the first ones where they were');
  assert.deepEqual(discSpots(12, { seed: 3 }), b, 'the same seed gives the same spots');
  assert.notDeepEqual(discSpots(12, { seed: 4 }), b);
  for (const [u, v, h] of b) { assert.ok(Math.hypot(u, v) <= 0.85 + 1e-9, 'inside the reach'); assert.ok(h >= 0 && h < 1); }
  let near = Infinity;
  for (let i = 0; i < b.length; i++) for (let j = 0; j < i; j++) near = Math.min(near, Math.hypot(b[i][0] - b[j][0], b[i][1] - b[j][1]));
  assert.ok(near > 0.2, `no two spots bunch up (nearest pair ${near.toFixed(2)} apart)`);
});

test('discSpots: fixed spots come first as given, and nothing sits where it is kept out', () => {
  const fixed = [[-0.9, 0.2], [0.9, 0.2]];
  const s = discSpots(10, { fixed, keepOut: (u, v) => v > 0.3 });
  assert.deepEqual(s.slice(0, 2).map(([u, v]) => [u, v]), fixed);
  for (const [, v] of s.slice(2)) assert.ok(v <= 0.3);
  assert.equal(discSpots(1, { fixed }).length, 1, 'never more than asked for');
  assert.deepEqual(discSpots(0), []);
});

test('segmentRingsIn: thin furrows inside the body, none at the tip', () => {
  const f = segmentRingsIn(48, 44, 26, 22, [0.5, 0.76]);
  const body = (px, py) => ((px - 48) / 26) ** 2 + ((py - 44) / 22) ** 2 <= 1;
  let n = 0;
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (f(x + 0.5, y + 0.5)) { n++; assert.ok(body(x + 0.5, y + 0.5), `(${x}, ${y}) is inside the body`); assert.ok(y + 0.5 >= 22 + 2 * 22 * 0.5 * 0.3, 'the top of each ring is left out'); }
  assert.ok(n > 40 && n < 260, `furrows are lines, not areas (${n} px)`);
  assert.ok(count(segmentRingsIn(48, 44, 26, 22, [0.5, 0.76], { thick: 2 })) > n, 'thick widens them');
  assert.equal(count(segmentRingsIn(48, 44, 26, 22, [])), 0);
});

test('antlerIn: a beam with tines; the two sides mirror each other', () => {
  const plain = count(antlerIn(48, 60, PI - 0.9, 20, { tines: 0 })), branched = count(antlerIn(48, 60, PI - 0.9, 20, { tines: 2 }));
  assert.ok(plain > 20);
  assert.ok(branched > plain + 8, `tines add to the beam (${plain} -> ${branched})`);
  assert.ok(antlerIn(48, 60, PI - 0.9, 20)(48.2, 59.8), 'it starts at its root');
  const right = antlerIn(48, 60, PI - 0.9, 20, { curl: 0.7, spread: 1 }), left = antlerIn(48, 60, PI + 0.9, 20, { curl: -0.7, spread: -1 });
  let off = 0;
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (right(x + 0.5, y + 0.5) !== left(96 - x - 0.5, y + 0.5)) off++;
  assert.equal(off, 0, 'mirrored angles give a mirrored antler');
});

test('frillIn: ribs stand out past the rim by the reach, and the skin dips between them', () => {
  const V = frillIn(48, 48, 20, 16, 8, { ribs: 9, taper: 0 });
  assert.equal(V.tips.length, 9);
  assert.equal(V.roots.length, 9);
  const mid = V.tips[4];
  assert.ok(Math.abs(mid[0] - 48) < 1e-6 && Math.abs(mid[1] - (48 - 16 - 8)) < 1e-6, 'the middle rib stands straight out of the top');
  assert.ok(V.inside(48, 48 - 16 - 6), 'the frill is filled out to near its tips');
  assert.ok(!V.inside(48, 48 + 16 + 4), 'nothing under the ellipse: the fan is open at the bottom');
  const smooth = count(frillIn(48, 48, 20, 16, 8, { scoop: 0 }).inside), scooped = count(frillIn(48, 48, 20, 16, 8, { scoop: 1 }).inside);
  assert.ok(scooped < smooth - 20, `a deep scoop takes skin away (${smooth} -> ${scooped})`);
  const waved = frillIn(48, 48, 20, 16, 8, { ripple: (i) => (i === 4 ? 3 : 0), taper: 0 });
  assert.ok(Math.abs(waved.tips[4][1] - (48 - 16 - 11)) < 1e-6, 'ripple moves one rib');
});

test('blister: a dome with a lit core; flaring is white-hot, burst is a hole', () => {
  const draw = (opt) => { const g = new Surface(24, 24); blister(g, 12, 12, 4.5, { skin: '#b04a8a', core: '#9fe040', ...opt }); return g; };
  const litOne = draw({ level: 1 }), flare = draw({ level: 2 }), open = draw({ open: true }), plain = draw({ core: null });
  assert.ok(has(litOne, '#9fe040'), 'the core shows');
  assert.ok(has(flare, '#ffffff') && !has(litOne, '#ffffff'), 'only a flaring core is white');
  assert.ok(!has(open, '#9fe040') && !has(plain, '#9fe040'), 'a burst or plain sac has no core');
  const b = litOne.bounds();
  assert.ok(b.x0 >= 7 && b.x1 <= 16 && b.y0 >= 7 && b.y1 <= 16, 'it stays inside its radius');
  const shaded = draw({ under: '#8563a5' });
  assert.ok(lit(shaded) > lit(litOne), 'the line of shade beside it adds pixels');
  assert.equal(lit((() => { const g = new Surface(8, 8); blister(g, 4, 4, 0.5); return g; })()), 1, 'a tiny one is a dot');
});

test('sprayFan: grows from the mouth, stays in its box, and never ends empty', () => {
  const box = [2, 2, 46, 46];
  const at = (t) => { const g = new Surface(48, 48); sprayFan(g, { t, x: 24, y: 10, angle: 0, arc: 1.6, reach: 60, jets: 6, colour: '#9fe040', box }); return g; };
  const frames = [0.1, 0.3, 0.5, 0.75, 1].map(at);
  for (const g of frames) {
    const b = g.bounds();
    assert.ok(b, 'something is drawn');
    assert.ok(b.x0 >= 2 && b.y0 >= 2 && b.x1 <= 45 && b.y1 <= 45, `inside the box: ${JSON.stringify(b)}`);
  }
  assert.ok(frames[2].bounds().y1 > frames[0].bounds().y1, 'the jets travel away from the mouth');
  assert.ok(lit(frames[4]) >= 2 && lit(frames[4]) < lit(frames[2]), 'it ends as a few drops');
  assert.deepEqual(at(0.5).data, frames[2].data, 'repeatable');
});

// ---- rigs/brood-queen.js ----------------------------------------------------------------------------

test('brood queen: the clip table has the frame counts of a boss, and labels of the sprite\'s own', () => {
  const c = Q.clips((p) => p.speed, ['idle', { name: 'attack', label: 'Stab' }, 'shoot', 'spawn', 'enrage', 'hurt', 'die']);
  assert.deepEqual(Object.entries(c).map(([k, v]) => [k, v.frames, v.loop]), [['idle', 8, true], ['attack', 10, false], ['shoot', 12, false], ['spawn', 10, false], ['enrage', 10, false], ['hurt', 4, false], ['die', 12, false]]);
  assert.equal(c.attack.label, 'Stab');
  assert.equal(c.idle.label, undefined);
  assert.ok(c.idle.fps({ speed: 1 }) > c.idle.fps({ speed: 0 }));
  assert.ok(Math.abs(c.idle.fps({ speed: 0.5 }) - 7 * 1.05) < 1e-9);
  assert.deepEqual(Object.keys(Q.clips()), Q.POSES);
  assert.throws(() => Q.clips(() => 0.5, ['walk']), /no pose "walk"/);
});

test('brood queen: dims follow size, bulk, legs and sacs', () => {
  const d = Q.dims();
  assert.equal(d.pairs, 3);
  assert.deepEqual(Q.LEGS.map((legs) => Q.dims({ legs }).pairs), [2, 3, 4]);
  assert.equal(Q.dims({ legs: 8 }).pairs, 4);
  assert.ok(Q.dims({ bulk: 1 }).rx > d.rx && Q.dims({ bulk: 0 }).ry < d.ry);
  assert.ok(Q.dims({ size: 1 }).k > Q.dims({ size: 0 }).k);
  assert.ok(Q.dims({ sacs: 1 }).sacs > Q.dims({ sacs: 0 }).sacs && Q.dims({ sacs: 0 }).sacs >= 6);
  assert.equal(d.feet.length, d.pairs - 1);
});

test('brood queen: at rest she stands on the ground line, in the middle, the same on both sides', () => {
  const { g } = shot('idle', 0, {}, { horns: { kind: 'crown' } });
  const b = g.bounds(), [W] = Q.SIZE;
  assert.equal(b.y1, Q.GROUND, 'the outline of the lowest foot lands on the ground line');
  assert.ok(Math.abs((b.x0 + b.x1 + 1) / 2 - Q.CX) <= 1, 'centred on the pivot column');
  const across = b.x1 - b.x0 + 1;
  assert.ok(across >= 60 && across <= 76, `60 to 76 px across at the default look (${across})`);
  // the outline is the same on both sides (the lights inside her are not: sacs sit where they will)
  let off = 0;
  for (let y = 0; y < Q.SIZE[1]; y++) for (let x = 0; x < W / 2; x++) if (!!g.get(x, y) !== !!g.get(W - 1 - x, y)) off++;
  assert.ok(off <= 24, `a silhouette that mirrors (${off} px differ)`);
});

test('brood queen: every frame of every pose stays inside the frame, with every part at its biggest', () => {
  const looks = [
    [{ size: 1, bulk: 1, bounce: 1 }, { legs: 'eight', sacs: 1, horns: { kind: 'antlers', length: 1.35 }, wings: { kind: 'veil', span: 1.35 } }],
    [{ size: 1, bulk: 1, bounce: 1 }, { legs: 'six', sacs: 1, horns: { kind: 'crown', length: 1.35 }, wings: { kind: 'stubs', span: 1.35 } }],
    [{ size: 0, bulk: 0, bounce: 0 }, { legs: 'four', sacs: 0, horns: { kind: 'none' }, wings: { kind: 'none' } }],
  ];
  const c = Q.clips();
  for (const [p, opt] of looks) for (const name of Q.POSES) for (const t of phases(c[name].frames, c[name].loop)) {
    const { g } = shot(name, t, p, opt), b = g.bounds();
    assert.ok(b, `${name} t=${t.toFixed(2)}: something is drawn`);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= Q.SIZE[0] - 2 && b.y1 <= Q.SIZE[1] - 2, `${name} t=${t.toFixed(2)} ${opt.wings.kind}: ${JSON.stringify(b)} leaves a 1 px border`);
  }
});

test('brood queen: the moves do what their names say', () => {
  const tipY = (clip, t) => Q.frame(clip, t).J.arms.map((A) => A.tip[1]);
  const rest = tipY('attack', 0), up = tipY('attack', 5 / 9), hit = tipY('attack', 6 / 9);
  assert.ok(up[0] < rest[0] - 30 && up[1] < rest[1] - 30, 'attack: both scythes are raised high by frame 5');
  assert.ok(hit[0] > rest[0] && hit[0] <= Q.SIZE[1] - 4, 'attack: on frame 6 they stab down in front, inside the frame');
  assert.ok(Q.frame('attack', 6 / 9).J.arms.every((A) => A.front), 'the stabbing blades are in front of the head');
  assert.deepEqual(tipY('attack', 1), rest, 'attack ends on the resting pose');
  const P = (clip, n, frames) => Q.pose(clip, n / (frames - 1), {}, Q.dims());
  assert.ok(P('shoot', 4, 12).rear === 1 && P('shoot', 4, 12).spray < 0 && P('shoot', 5, 12).spray >= 0, 'shoot: reared by frame 4, the spray starts on frame 5');
  assert.ok(P('spawn', 3, 10).pop < 0 && P('spawn', 4, 10).pop >= 0 && P('spawn', 3, 10).brood === 1, 'spawn: the brood sacs are full on frame 3 and burst on frame 4');
  assert.ok(P('enrage', 2, 10).shout >= 0 && P('enrage', 2, 10).glow === 2 && P('enrage', 1, 10).shout < 0, 'enrage: the shriek and the flare start on frame 2');
  assert.ok(P('hurt', 0, 4).flash && !P('hurt', 1, 4).flash && P('die', 0, 12).flash, 'hurt and die start on a white frame');
  assert.ok(P('die', 6, 12).burst < 0 && P('die', 7, 12).burst >= 0, 'die: she bursts on frame 7');
  for (const name of ['attack', 'shoot', 'spawn', 'enrage', 'hurt']) {
    assert.deepEqual(shot(name, 1).g.data, shot('idle', 0).g.data, `${name} ends on the first frame of idle`);
    if (name !== 'hurt') assert.deepEqual(shot(name, 0).g.data, shot('idle', 0).g.data, `${name} starts on it`);
  }
});

test('brood queen: what is left of her is never nothing, and holds no light', () => {
  const { g, F } = shot('die', 1);
  assert.ok(F.J.dead && F.J.remains.puddle && F.J.remains.husk);
  assert.ok(lit(g) > 300, 'a puddle, a husk and the head shell');
  assert.ok(g.bounds().y1 <= Q.GROUND, 'nothing sinks into the floor');
  assert.ok(has(g, '#9fe040'), 'the puddle is what was in her');
});

test('brood queen: legs, horns, wings and sacs each change the picture, and a part set to none leaves nothing', () => {
  const base = shot('idle', 0).g;
  const diff = (g) => { let n = 0; for (let i = 0; i < g.data.length; i++) if (g.data[i] !== base.data[i]) n++; return n; };
  assert.equal(diff(shot('idle', 0, {}, { legs: 'six', horns: { kind: 'none' }, wings: { kind: 'none' } }).g), 0, 'the defaults: six legs, no horns, no wings');
  assert.equal(diff(shot('idle', 0, {}, { horns: { kind: 'none', length: 1.35 }, wings: { kind: 'none', span: 1.35 } }).g), 0, 'the size of a part that is off changes nothing');
  for (const legs of ['four', 'eight']) assert.ok(diff(shot('idle', 0, {}, { legs }).g) > 40, legs);
  for (const kind of Q.HORNS) {
    const n = diff(shot('idle', 0, {}, { horns: { kind } }).g);
    assert.ok(n > 30, `${kind}: ${n}`);
    assert.ok(diff(shot('idle', 0, {}, { horns: { kind, length: 1.35 } }).g) > n, `${kind} grows with its length`);
  }
  for (const kind of Q.WINGS) {
    const n = diff(shot('idle', 0, {}, { wings: { kind } }).g);
    assert.ok(n > 40, `${kind}: ${n}`);
    assert.ok(diff(shot('idle', 0, {}, { wings: { kind, span: 1.35 } }).g) > n, `${kind} grows with its span`);
  }
  assert.ok(diff(shot('idle', 0, {}, { sacs: 1 }).g) > 40 && diff(shot('idle', 0, {}, { sacs: 0 }).g) > 20, 'more and fewer egg sacs');
});

test('brood queen: sockets follow the body', () => {
  const rest = Q.frame('idle', 0).sockets(), reared = Q.frame('shoot', 5 / 11).sockets();
  for (const name of ['head', 'back', 'feet', 'muzzle', 'spawn1', 'spawn2', 'spawn3']) {
    assert.ok(Number.isFinite(rest[name].x) && Number.isFinite(rest[name].y) && Number.isFinite(rest[name].angle), name);
    assert.ok(rest[name].x >= 1 && rest[name].x <= Q.SIZE[0] - 2 && rest[name].y >= 1 && rest[name].y <= Q.GROUND, `${name} is in the frame`);
  }
  assert.deepEqual(rest.feet, { x: Q.CX, y: Q.GROUND, angle: 0 });
  assert.ok(reared.muzzle.y < rest.muzzle.y - 6 && reared.head.y < rest.head.y - 6, 'the mouth and the head rise when she rears');
  assert.ok(rest.spawn1.x < Q.CX - 20 && rest.spawn2.x > Q.CX + 20 && rest.spawn3.y < rest.back.y + 6, 'what hatches appears left, right and behind her');
  assert.equal(rest.head.angle, PI);
  // the ink line is the outline colour the sprite asks for
  const g = new Surface(...Q.SIZE), F = Q.frame('idle', 0);
  const other = { ...LOOK, outline: '#102030' };
  F.draw(g, other); F.finish(g, other);
  assert.ok(has(g, '#102030') && !has(g, INK), 'the outline, and the lines where near pieces cross the body, take the look\'s colour');
});
