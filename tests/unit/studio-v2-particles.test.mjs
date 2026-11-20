// The particle editor's pure model (build item B19a; docs/data-sprites.md sections 2.5c and 6, Contract 15): the
// emitters of an effect body or a picture's emitter list, each one's cost against the 4,000 budget (the same price the
// validator charges), its keys over a clip (amount, at and the arguments its behaviour lets keys change, put on the
// clip's frames at full precision), the amount each frame draws, its spawn point and box on the stage and moving them
// by whole pixels, a new emitter, a behaviour swapped for another, and the validator's messages matched to the card and
// the key they are about. Never changes the definition it is given.
//   node --test tests/unit/studio-v2-particles.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from '../../app/studio/v2-particles.js';
import { v2Template } from '../../app/studio/v2-templates.js';
import { checkFull } from '../../app/studio/v2-check.js';
import { framePhase } from '../../rigs/keypose.js';

const lib = (id) => JSON.parse(fs.readFileSync(new URL(`../../sprites/${id}.json`, import.meta.url), 'utf8'));
const spark = () => v2Template('emitters');
const gem = () => v2Template('pictures');
const passes = (d) => { const v = checkFull(d); assert.deepEqual(v.errors, [], JSON.stringify(v.errors)); return v; };
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('the budget is the validator\'s 4,000 primitives a frame', () => {
  assert.equal(P.PARTICLE_BUDGET, 4000);
});

test('the emitter lists of an effect body and of a picture', () => {
  assert.deepEqual(P.emitterLists(spark()).map((l) => l.path), [['body', 'emitters']]);
  assert.deepEqual(P.emitterLists(gem()).map((l) => l.path), [['body', 'pictures', 'emitters']]);
  assert.deepEqual(P.emitterLists({ body: { rig: {} } }), []);
  assert.deepEqual(P.emitterLists(null), []);
});

test('each emitter: its id, behaviour, documentation, whether it is an effect port, its clips', () => {
  const s = P.emittersOf(spark());
  assert.deepEqual(s.map((e) => e.id), ['sparks', 'flash']);
  assert.deepEqual(s.map((e) => e.key), ['particles@1', 'starburst@1']);
  assert.deepEqual(s[1].path, ['body', 'emitters', 1]);
  assert.equal(s[0].port, false);
  assert.equal(s[0].doc.id, 'particles');
  const f = P.emittersOf(lib('fx-fire-spell'));
  assert.deepEqual(f.map((e) => [e.id, e.port, e.clip]), [['burst', true, ['burst']], ['cast', true, ['cast']]]);
  assert.equal(P.inClip(f[0], 'burst'), true);
  assert.equal(P.inClip(f[0], 'cast'), false);
  assert.equal(P.inClip(s[0], 'anything'), true);
  assert.deepEqual(P.emittersOf(gem()).map((e) => [e.id, e.on]), [['burst', 'gem']]);
});

test('cost: each emitter priced as the validator prices it, the total against the budget', () => {
  for (const id of ['fx-fire-spell', 'explosion-large', 'plasma-burst', 'hit-spark']) {
    const d = lib(id);
    const v = passes(d);
    const c = P.costSummary(d);
    assert.equal(c.budget, 4000);
    assert.equal(c.total, v.cost.expanded, id);
    const sum = c.emitters.reduce((a, e) => a + e.cost, 0);
    assert.ok(Math.abs(sum + c.rest - c.total) < 1e-9, `${id}: emitters ${sum} and the rest ${c.rest} make the total`);
    assert.equal(c.over, false);
  }
  const f = P.costSummary(lib('fx-fire-spell'));
  assert.deepEqual(f.emitters.map((e) => [e.id, e.cost]), [['burst', 1214], ['cast', 1214]]);
  assert.equal(P.emitterCost(lib('fx-fire-spell'), ['body', 'emitters', 0]), 1214);
  // a count bound to a slider is priced at the table's largest value
  const t = spark();
  const before = P.emitterCost(t, ['body', 'emitters', 0]);
  t.body.emitters[0].count.map[1][1] = 40;
  assert.ok(P.emitterCost(t, ['body', 'emitters', 0]) > before);
  assert.equal(P.costSummary(t).total, checkFull(t).cost.expanded);
  // over the budget: shown as over (the validator refuses it)
  const big = lib('explosion-large');
  big.body.emitters.push({ ...big.body.emitters[0], id: 'again' });
  const o = P.costSummary(big);
  assert.equal(o.over, true);
  assert.ok(o.total > 4000);
});

test('the keys of one emitter in a clip, each on its frame', () => {
  const d = spark();
  const fl = P.emitterTrack(d, 'hit', 'flash');
  assert.deepEqual(fl.map((k) => [k.key, k.t, k.frame, k.fields.amount]), [[0, 0, 0, 1], [1, 0.5, 2, 0]]);
  assert.deepEqual(P.emitterTrack(d, 'hit', 'sparks').map((k) => k.key), [0]);
  assert.deepEqual(P.emitterTrack(d, 'nope', 'flash'), []);
  const info = P.clipInfo(d, 'hit');
  assert.deepEqual([info.frames, info.loop, info.own], [5, false, true]);
  assert.deepEqual(info.phases, [0, 0.25, 0.5, 0.75, 1]);
  // a clip the definition does not write takes its frames from the sprite, and keys cannot be set in it
  const made = P.clipInfo(d, 'other', { clips: { other: { frames: 3, loop: true } } });
  assert.deepEqual([made.frames, made.own], [3, false]);
  assert.equal(P.setKey(d, 'other', 'flash', 1, { amount: 1 }), null);
});

test('the amount each frame draws: keyed amounts blended, off at 0; an emitter no key gives an amount always draws', () => {
  const d = spark();
  const fl = P.amountsOf(d, 'hit', 'flash');
  assert.equal(fl.keyed, true);
  assert.equal(fl.frames.length, 5);
  assert.equal(fl.frames[0].amount, 1);
  assert.ok(fl.frames[1].amount > 0 && fl.frames[1].amount < 1);
  assert.deepEqual(fl.frames.map((f) => f.on), [true, true, false, false, false]);
  const sp = P.amountsOf(d, 'hit', 'sparks');
  assert.deepEqual(sp.frames.map((f) => f.on), [true, true, true, true, true]);
  const nk = spark();
  nk.clips.hit.keys = [];
  const free = P.amountsOf(nk, 'hit', 'flash');
  assert.equal(free.keyed, false);
  assert.deepEqual(free.frames.map((f) => [f.amount, f.on]), Array(5).fill([null, true]));
  // an emitter kept to other clips draws in none of this clip's frames
  const f = lib('fx-fire-spell');
  assert.deepEqual(P.amountsOf(f, 'cast', 'burst').frames.map((x) => x.on), Array(8).fill(false));
});

test('setKey: a key on a frame at full precision, merged with a key already there, kept in time order', () => {
  const d = spark();
  const before = JSON.stringify(d);
  const a = P.setKey(d, 'hit', 'flash', 3, { amount: 0.5 });
  same(d, JSON.parse(before));
  assert.deepEqual(a.clips.hit.keys.map((k) => k.t), [0, 0.5, 0.75]);
  assert.deepEqual(a.clips.hit.keys[2], { t: 0.75, emit: { flash: { amount: 0.5 } } });
  passes(a);
  // a key on frame 2 joins the key already at t 0.5
  const b = P.setKey(a, 'hit', 'sparks', 2, { amount: 0 });
  assert.equal(b.clips.hit.keys.length, 3);
  assert.deepEqual(b.clips.hit.keys[1].emit, { flash: { amount: 0 }, sparks: { amount: 0 } });
  // an existing entry: its fields merge
  const c = P.setKey(b, 'hit', 'flash', 2, { turn: 45 });
  assert.deepEqual(c.clips.hit.keys[1].emit.flash, { amount: 0, turn: 45 });
  passes(c);
  // the phase of a frame is the renderer's exactly (one-shot of 7 frames: 6/7 is not rounded)
  const e = spark();
  e.clips.hit.frames = 8;
  const g = P.setKey(e, 'hit', 'flash', 6, { amount: 1 });
  assert.ok(g.clips.hit.keys.some((k) => k.t === framePhase({ frames: 8, loop: false }, 6)));
  // a clip with no keys yet gets a list
  const h = spark();
  delete h.clips.hit.keys;
  assert.deepEqual(P.setKey(h, 'hit', 'flash', 0, { amount: 1 }).clips.hit.keys, [{ t: 0, emit: { flash: { amount: 1 } } }]);
});

test('setKeyField, removeKey and moveKey: an emptied entry and an emptied key go', () => {
  const d = spark();
  const a = P.setKeyField(d, 'hit', 1, 'flash', 'amount', 0.25);
  assert.equal(a.clips.hit.keys[1].emit.flash.amount, 0.25);
  // the amount is held to 0..1
  assert.equal(P.setKeyField(d, 'hit', 1, 'flash', 'amount', 3).clips.hit.keys[1].emit.flash.amount, 1);
  // removing the only field of the only emitter in a key removes the key
  const b = P.setKeyField(d, 'hit', 1, 'flash', 'amount', undefined);
  assert.deepEqual(b.clips.hit.keys.map((k) => k.t), [0]);
  const c = P.removeKey(d, 'hit', 0, 'flash');
  assert.deepEqual(c.clips.hit.keys[0], { t: 0, emit: { sparks: { amount: 1 } } });
  const e = P.removeKey(c, 'hit', 0, 'sparks');
  assert.deepEqual(e.clips.hit.keys.map((k) => k.t), [0.5]);
  // a key keeps its ease while another emitter is left in it; an ease alone is not a key
  const f = P.removeKey(spark(), 'hit', 0, 'sparks');
  assert.deepEqual(f.clips.hit.keys[0].emit, { flash: { amount: 1 } });
  // move the flash's key from frame 2 to frame 4
  const g = P.moveKey(d, 'hit', 1, 'flash', 4);
  assert.deepEqual(g.clips.hit.keys.map((k) => [k.t, Object.keys(k.emit)]), [[0, ['flash', 'sparks']], [1, ['flash']]]);
  passes(g);
  // onto a frame that has a key: merged into it
  const h = P.moveKey(d, 'hit', 1, 'flash', 0);
  assert.equal(h.clips.hit.keys.length, 1);
  assert.deepEqual(h.clips.hit.keys[0].emit.flash, { amount: 0 });
  assert.equal(P.keyAt(d, 'hit', 2, 'flash'), 1);
  assert.equal(P.keyAt(d, 'hit', 2, 'sparks'), -1);
  assert.equal(P.keyAt(d, 'hit', 3, 'flash'), -1);
});

test('what a key may set: amount, at and the behaviour\'s keyable arguments; a size argument no higher than the emitter sets', () => {
  const d = spark();
  const ks = P.keyableFields(d, ['body', 'emitters', 0]);
  assert.deepEqual(ks.slice(0, 2).map((k) => k.name), ['amount', 'at']);
  assert.deepEqual(ks.slice(2).map((k) => k.name), ['dist', 'gravity', 'size', 'spread', 'wobble', 'angle', 'arc', 'lifespan']);
  const size = ks.find((k) => k.name === 'size');
  assert.equal(size.sized, true);
  assert.equal(size.most, 2);
  assert.equal(ks.find((k) => k.name === 'dist').sized, false);
  // a size argument keyed above the emitter's own is held to it, so the key passes the check
  const a = P.setKey(d, 'hit', 'sparks', 1, { size: 9 });
  assert.equal(a.clips.hit.keys.find((k) => k.t === 0.25).emit.sparks.size, 2);
  passes(a);
  const b = P.setKeyField(d, 'hit', 0, 'sparks', 'size', 7);
  assert.equal(b.clips.hit.keys[0].emit.sparks.size, 2);
  // a field the behaviour does not let keys change is refused (left out)
  const c = P.setKey(d, 'hit', 'sparks', 1, { count: 3, amount: 1 });
  assert.deepEqual(c.clips.hit.keys.find((k) => k.t === 0.25).emit.sparks, { amount: 1 });
  // an effect port lets keys change only amount and at
  assert.deepEqual(P.keyableFields(lib('fx-fire-spell'), ['body', 'emitters', 0]).map((k) => k.name), ['amount', 'at']);
});

test('the spawn point, its reach and its box, in frame pixels; on a node, put on the node', () => {
  const d = spark();
  const s = P.spawnOf(d, ['body', 'emitters', 0]);
  assert.deepEqual(s.at, [16, 16]);
  assert.equal(s.movable, true);
  assert.equal(s.area, null);
  assert.equal(s.reach, 10.5);   // dist bound to Spread (default 0.5): 8 to 13
  const g = P.spawnOf(gem(), ['body', 'pictures', 'emitters', 0]);
  assert.deepEqual(g.at, [16, 16]);
  const f = P.spawnOf(lib('fx-fire-spell'), ['body', 'emitters', 0]);
  assert.deepEqual(f.at, [32, 58]);
  // a coordinate set by a control cannot be dragged
  const b = spark();
  b.body.emitters[0].at = [{ from: 'size', map: [[0, 10], [1, 20]] }, 16];
  const bs = P.spawnOf(b, ['body', 'emitters', 0]);
  assert.deepEqual(bs.at, [15, 16]);
  assert.equal(bs.movable, false);
  assert.match(bs.why, /control/);
  assert.equal(P.moveSpawn(b, ['body', 'emitters', 0], 'at', 1, 0), null);
  // the params tried on the page move it
  assert.deepEqual(P.spawnOf(b, ['body', 'emitters', 0], { params: { size: 1 } }).at, [20, 16]);
});

test('moveSpawn: the point by whole pixels, a keyed point at the frame in hand, the box moved and sized in the frame', () => {
  const d = spark();
  const a = P.moveSpawn(d, ['body', 'emitters', 0], 'at', 3, -2);
  assert.deepEqual(a.body.emitters[0].at, [19, 14]);
  same(d, spark());
  passes(a);
  // a point the clip's keys move: the key at this frame is moved, or one is made there
  const k = P.setKey(d, 'hit', 'flash', 0, { at: [16, 16] });
  const b = P.moveSpawn(k, ['body', 'emitters', 1], 'at', 2, 0, { clip: 'hit', frame: 0 });
  assert.deepEqual(b.clips.hit.keys[0].emit.flash.at, [18, 16]);
  assert.deepEqual(b.body.emitters[1].at, [16, 16]);
  const c = P.moveSpawn(k, ['body', 'emitters', 1], 'at', 0, 4, { clip: 'hit', frame: 3 });
  assert.deepEqual(c.clips.hit.keys.find((x) => x.t === 0.75).emit.flash.at, [16, 20]);
  passes(c);
  assert.deepEqual(P.spawnOf(c, ['body', 'emitters', 1], { clip: 'hit', frame: 3 }).at, [16, 20]);
  assert.equal(P.spawnOf(c, ['body', 'emitters', 1], { clip: 'hit', frame: 3 }).keyed, true);
  // the box: given, moved (kept in the frame) and sized from its corner
  const e = P.setArea(d, ['body', 'emitters', 0], { x0: 4, y0: 4, x1: 20, y1: 20 });
  assert.deepEqual(P.spawnOf(e, ['body', 'emitters', 0]).area, { x0: 4, y0: 4, x1: 20, y1: 20 });
  passes(e);
  const m = P.moveSpawn(e, ['body', 'emitters', 0], 'area', 100, -2);
  assert.deepEqual(m.body.emitters[0].area, { x0: 16, y0: 2, x1: 32, y1: 18 });
  const z = P.moveSpawn(e, ['body', 'emitters', 0], 'corner', -30, 3);
  assert.deepEqual(z.body.emitters[0].area, { x0: 4, y0: 4, x1: 5, y1: 23 });
  passes(z);
  assert.equal(P.setArea(e, ['body', 'emitters', 0], null).body.emitters[0].area, undefined);
  // a behaviour with no box cannot be given one
  assert.equal(P.setArea(d, ['body', 'emitters', 1], { x0: 0, y0: 0, x1: 8, y1: 8 }), null);
  assert.equal(P.spawnOf(d, ['body', 'emitters', 1]).boxable, false);
  assert.equal(P.spawnOf(d, ['body', 'emitters', 0]).boxable, true);
});

test('a new emitter from the registry passes the check; a behaviour swapped keeps id, place, clips and fitting keys', () => {
  const d = spark();
  const r = P.newEmitter(d, ['body', 'emitters'], 'smoke', 1);
  assert.deepEqual(r.path, ['body', 'emitters', 2]);
  const e = r.def.body.emitters[2];
  assert.equal(e.gen, 'smoke');
  assert.equal(e.id, 'smoke');
  assert.deepEqual(e.at, [16, 16]);
  passes(r.def);
  const r2 = P.newEmitter(r.def, ['body', 'emitters'], 'smoke', 1);
  assert.equal(r2.def.body.emitters[3].id, 'smoke-2');
  // on a picture with nodes it sits on the first node
  const g = P.newEmitter(gem(), ['body', 'pictures', 'emitters'], 'sparkles', 1);
  assert.equal(g.def.body.pictures.emitters[1].on, 'gem');
  passes(g.def);
  assert.equal(P.newEmitter(d, ['body', 'emitters'], 'no-such-thing', 1), null);
  // the flash becomes a glow: the id, place and keys stay; starburst's own arguments go
  const k = P.setKey(d, 'hit', 'flash', 1, { turn: 30, amount: 1 });
  const s = P.changeBehaviour(k, ['body', 'emitters', 1], 'glow', 1);
  const fl = s.body.emitters[1];
  assert.deepEqual([fl.id, fl.gen, fl.v, fl.at, fl.glow], ['flash', 'glow', 1, [16, 16], true]);
  assert.equal(fl.points, undefined);
  assert.deepEqual(s.clips.hit.keys.find((x) => x.t === 0.25).emit.flash, { amount: 1 });
  passes(s);
  // the list of behaviours: the shared ones, then the effect ports
  const b = P.behaviours();
  assert.ok(b.shared.some((g2) => g2.key === 'particles@1'));
  assert.ok(b.ports.every((g2) => g2.id.startsWith('effect.')));
  assert.ok(b.ports.some((g2) => g2.key === 'effect.fx-fire-spell@1'));
  assert.ok(!b.shared.some((g2) => g2.id.startsWith('effect.')));
});

test('an emitter deleted takes its keys with it; a copy gets an id of its own and no keys', () => {
  const d = spark();
  const a = P.deleteEmitter(d, ['body', 'emitters', 1]);
  assert.deepEqual(a.body.emitters.map((e) => e.id), ['sparks']);
  assert.deepEqual(a.clips.hit.keys, [{ t: 0, emit: { sparks: { amount: 1 } } }]);
  passes(a);
  same(d, spark());
  const b = P.copyEmitter(d, ['body', 'emitters', 1]);
  assert.deepEqual(b.def.body.emitters.map((e) => e.id), ['sparks', 'flash', 'flash-2']);
  assert.deepEqual(b.path, ['body', 'emitters', 2]);
  same(b.def.clips, d.clips);
  passes(b.def);
  assert.equal(P.deleteEmitter(d, ['body', 'emitters', 7]), null);
  assert.equal(P.copyEmitter(d, ['body', 'emitters', 7]), null);
});

test('the validator\'s messages beside the card and the key they are about', () => {
  const d = spark();
  d.body.emitters[0].count = 999;
  d.clips.hit.keys[1].emit.flash.amount = 2;
  const v = checkFull(d);
  const card = P.emitterErrors(v.errors, d, ['body', 'emitters', 0]);
  assert.ok(card.length >= 1 && card.every((m) => m.startsWith('Emitter "sparks"')), JSON.stringify(card));
  const fl = P.emitterErrors(v.errors, d, ['body', 'emitters', 1]);
  assert.ok(fl.some((m) => /emit "flash" amount/.test(m)), JSON.stringify(v.errors));
  assert.deepEqual(P.keyErrors(v.errors, 'hit', 1, 'flash'), fl.filter((m) => m.startsWith('Clip "hit", key 2')));
  assert.equal(P.keyErrors(v.errors, 'hit', 0, 'flash').length, 0);
  // the messages about the budget and the frame's stamp pixels go beside the meter
  assert.deepEqual(P.budgetErrors(['The sprite costs about 5,000 primitives a frame after its generators run; the budget is 4,000 (use smaller counts)', 'The emitters can paint up to 9,000 stamp pixels in one frame', 'Emitter "x": nope']).length, 2);
});

test('nothing reaches an object\'s machinery, and bad input gives nothing rather than throwing', () => {
  const d = spark();
  assert.equal(P.setKey(d, 'hit', '__proto__', 0, { amount: 1 }), null);
  assert.equal(P.setKey(d, '__proto__', 'flash', 0, { amount: 1 }), null);
  assert.equal(P.setKey(d, 'hit', 'nobody', 0, { amount: 1 }), null);
  assert.equal(P.setKey(d, 'hit', 'flash', 99, { amount: 1 }), null);
  assert.equal(P.setKeyField(d, 'hit', 9, 'flash', 'amount', 1), null);
  assert.equal(P.moveSpawn(d, ['body', 'emitters', 9], 'at', 1, 1), null);
  assert.deepEqual(P.emittersOf({ body: { emitters: [null, 3, { id: 'x' }] } }).map((e) => e.id), ['x']);
  assert.deepEqual(P.costSummary({}).emitters, []);
  assert.equal(P.spawnOf(d, ['body', 'emitters', 9]), null);
});

test('a clip\'s frame count is held to the 64 a clip may have, however large the draft writes it', () => {
  // the draft is kept even when the validator refuses it, and drafts in storage are not trusted (Contract 1)
  for (const n of [65, 1e5, 1e9, 2 ** 32, 2 ** 53]) {
    const d = spark();
    d.clips.hit.frames = n;
    const t0 = Date.now();
    assert.equal(P.clipInfo(d, 'hit'), null, `${n} frames and no drawn sprite: no frames to show`);
    assert.deepEqual(P.amountsOf(d, 'hit', 'flash').frames, [], String(n));
    assert.equal(P.keyAt(d, 'hit', 0, 'flash'), -1);
    assert.equal(P.setKey(d, 'hit', 'flash', 0, { amount: 1 }), null);
    // with the drawn (validated) sprite, its frames are shown instead
    const drawn = { clips: { hit: { frames: 5, loop: false } } };
    const info = P.clipInfo(d, 'hit', drawn);
    assert.deepEqual([info.frames, info.phases.length, info.own], [5, 5, true], String(n));
    const a = P.amountsOf(d, 'hit', 'flash', drawn);
    assert.equal(a.frames.length, 5);
    assert.ok(a.frames.every((f) => f.amount === 0 || f.amount === 1 || (f.amount > 0 && f.amount < 1)), JSON.stringify(a.frames));
    assert.ok(Date.now() - t0 < 500, `${n} frames took ${Date.now() - t0} ms`);
  }
  // a drawn sprite that says more than 64 is not trusted either
  const d = spark();
  delete d.clips.hit;
  assert.equal(P.clipInfo(d, 'hit', { clips: { hit: { frames: 2 ** 32 } } }), null);
  assert.equal(P.clipInfo(d, 'hit', { clips: { hit: { frames: 1e9 } } }), null);
  // 64 itself is allowed
  const top = spark();
  top.clips.hit.frames = 64;
  assert.equal(P.clipInfo(top, 'hit').frames, 64);
  assert.equal(P.amountsOf(top, 'hit', 'flash').frames.length, 64);
});

test('the meter counts the body\'s own drawing as well as the emitters (the gem picture: 7 + 5)', () => {
  const g = gem();
  const v = passes(g);
  const c = P.costSummary(g);
  assert.deepEqual(c.emitters.map((e) => [e.id, e.cost]), [['burst', 7]]);
  assert.equal(c.total, v.cost.expanded);
  assert.equal(c.rest, 5);
  assert.equal(c.total, 12);
});

test('a drag on the picture moves the point under the cursor on a turned and scaled node; the arrows move it a node pixel', () => {
  const g = gem();
  g.body.pictures.nodes[0].turn = 90;
  g.body.pictures.nodes[0].scale = 2;
  const path = ['body', 'pictures', 'emitters', 0];
  const before = P.spawnOf(g, path).at;
  // dragged 4 right and 2 down on the picture: the point lands 4 right and 2 down on the picture
  const moved = P.moveSpawn(g, path, 'at', 4, 2, { space: 'frame' });
  const after = P.spawnOf(moved, path).at;
  assert.deepEqual([after[0] - before[0], after[1] - before[1]].map((n) => Math.round(n * 1e6) / 1e6), [4, 2]);
  assert.ok(moved.body.pictures.emitters[0].at.every(Number.isInteger));
  // on an untouched node, a frame move and a node move are the same
  const plain = gem();
  same(P.moveSpawn(plain, path, 'at', 3, -1, { space: 'frame' }), P.moveSpawn(plain, path, 'at', 3, -1));
  // the arrows (no space given) move the point one of the node's own pixels, as its numbers say
  same(P.moveSpawn(g, path, 'at', 1, 0).body.pictures.emitters[0].at, [1, 0]);
});
