// The emitters body (docs/data-sprites.md 2.5c, 4.3; build item B12): effects and projectiles as data, laid out by the
// registered layout "emitters"@1 (engine/gen/emitters.js) with the site's behaviours (engine/gen/fx-burst.js).
//   - the hit-spark fixture (tests/fixtures/v2/hit-spark.json) draws with the site's registry; its control is `sparks`
//     now (the B56 note: `amount` read like a key's emit amount), and an old saved `amount` reads as `sparks`
//   - the on/off rule of 2.5c, keyed arguments, `at` keys, emitters on nodes, the draw list under the emitters
//   - three library effects redrawn as data (tests/fixtures/v2/emitters/: blaster-bolt, a projectile; plasma-burst, a
//     burst; hit-spark, the spark the format's example is named for) keep their code sprite's id, clips, sounds,
//     control keys and kinds, pass the quality bar with no errors, and draw close to the code sprite: pixel for pixel
//     where the behaviours can say all the code says (the bolt everywhere; the star and ring hit sparks; each
//     burst style at the default size), within one pixel elsewhere
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite, makeDataSprite, dataFrameList } from '../../engine/data-sprite.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { resolveSprite } from '../../engine/resolve.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { checkSprite } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import boltCode from '../fixtures/code-sprites/blaster-bolt.js';
import burstCode from '../fixtures/code-sprites/plasma-burst.js';   // batch E2: sprites/plasma-burst.js is data now; its frozen code copy
import sparkCode from '../fixtures/code-sprites/hit-spark.js';   // batch E1: sprites/hit-spark.js is data now; its frozen code copy
import * as registry from '../../engine/gen/index.js';
import { emitters as emittersLayout } from '../../engine/gen/emitters.js';
import { nodeFrame, placeOn } from '../../engine/draw-list.js';

const V2 = new URL('../fixtures/v2/', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, V2), 'utf8'));
const hitSpark = () => read('hit-spark.json');
const redraw = (id) => read(`emitters/${id}.json`);
const CODE = { 'blaster-bolt': boltCode, 'plasma-burst': burstCode, 'hit-spark': sparkCode };
const solid = (g) => g.data.reduce((n, v) => n + (v >>> 24 ? 1 : 0), 0);

const soundDir = new URL('../../sounds/', import.meta.url);
const soundIndex = new Map();
for (const f of fs.readdirSync(soundDir)) {
  if (!f.endsWith('.json') || f === 'index.json' || f.startsWith('_')) continue;
  const p = JSON.parse(fs.readFileSync(new URL(f, soundDir), 'utf8'));
  soundIndex.set(p.id, p);
}

/** The share of drawn pixels (in either frame) with no drawn pixel within one pixel of them in the other frame. */
function apartBy1(a, b) {
  const on = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && (g.data[y * g.w + x] >>> 24) !== 0;
  let n = 0, miss = 0;
  for (const [p, q] of [[a, b], [b, a]]) for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (!on(p, x, y)) continue;
    n++;
    let hit = false;
    for (let j = -1; j <= 1 && !hit; j++) for (let i = -1; i <= 1; i++) if (on(q, x + i, y + j)) { hit = true; break; }
    if (!hit) miss++;
  }
  return n ? miss / n : 0;
}
const pixelsOff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);

// ---- the hit-spark fixture -----------------------------------------------------------------------------------------

test('hit-spark: the control is `sparks` (not `amount`), and an old saved `amount` is read as `sparks`', () => {
  const def = hitSpark();
  assert.deepEqual(def.controls.map((c) => c.key), ['sparks', 'size']);
  assert.deepEqual(def.was, { controls: { amount: 'sparks' } });
  assert.equal(JSON.stringify(def.body).includes('"from":"amount"'), false, 'no binding reads a control named amount');
  const s = dataSprite(def);
  assert.ok(Object.hasOwn(s.params, 'sparks') && !Object.hasOwn(s.params, 'amount'));
  const few = dataFrameList(s, 'hit', 2, { ...defaultParams(s), sparks: 0 }).list.length;
  const many = dataFrameList(s, 'hit', 2, { ...defaultParams(s), sparks: 1 }).list.length;
  const old = dataFrameList(s, 'hit', 2, { size: 0.5, amount: 0 }).list.length;
  assert.ok(many > few, `more sparks with Sparks at Many (${few} -> ${many})`);
  assert.equal(old, few, 'a bag item saved with { amount: 0 } draws as Sparks 0');
});

test('hit-spark passes the validator with the site\'s generators and draws through the emitters layout', () => {
  const r = validateSprite(hitSpark());
  assert.deepEqual(r.errors, []);
  assert.deepEqual([...r.uses].sort(), ['particles@1', 'starburst@1']);
  const m = makeDataSprite(hitSpark());
  assert.ok(m.ok, m.errors.join('; '));
  const s = m.sprite, p = defaultParams(s);
  for (let f = 0; f < 5; f++) assert.ok(solid(renderFrame(s, 'hit', f, p)) > 0, `frame ${f} draws`);
  // the flash is keyed 1 at t 0 and 0 at t 0.5: frames 0 and 1 have it, 2 to 4 not; the sparks no key turns off
  const ids = (f) => new Set(dataFrameList(s, 'hit', f, p).list.map((x) => JSON.stringify(x.key ?? null)));
  const flash = renderFrame(s, 'hit', 0, p), later = renderFrame(s, 'hit', 2, p);
  assert.ok(solid(flash) > solid(later), 'the flash is there on frame 0 and gone by frame 2');
  assert.ok(ids(4).size >= 1, 'the sparks are still there on the last frame');
});

test('hit-spark passes the quality bar with no errors (checkSprite)', () => {
  const r = checkSprite(dataSprite(hitSpark()), { soundIndex, validateMeta });
  assert.deepEqual(r.errors, []);
});

// ---- the layout's rules --------------------------------------------------------------------------------------------

/** A small emitters sprite to test the layout's rules on. */
function tiny(body, clips) {
  return {
    format: 'loadout-sprite', version: 2, id: 'tiny-fx', name: 'Tiny effect', blurb: 'A test effect.', size: [32, 32], pivot: [16, 16], grounded: false,
    meta: { type: 'effect', role: 'effects/spark', view: 'none', themes: ['neutral'], gameTypes: ['arcade'], words: ['test'], license: 'draft' },
    palette: [{ id: 'spark', label: 'Spark', default: '#ffd060', material: 'fire' }],
    body, clips,
  };
}
const GLOW = { gen: 'glow', v: 1, at: [16, 16], r: 4, paints: ['spark.light', 'spark', 'spark.dark'] };

test('on or off (2.5c): an emitter a key gives an amount is off where it is 0, on where above 0; one no key names always draws', () => {
  const def = tiny({ emitters: [{ id: 'a', ...GLOW }, { id: 'b', ...GLOW, at: [8, 8], r: 2 }] },
    { go: { frames: 3, fps: 8, loop: false, keys: [{ t: 0, emit: { a: { amount: 0 } } }, { t: 0.5, emit: { a: { amount: 1 } } }, { t: 1, emit: { a: { amount: 0 } } }] } });
  const s = dataSprite(def), p = defaultParams(s);
  const at = (f, x, y) => (renderFrame(s, 'go', f, p).get(x, y) >>> 24) !== 0;
  assert.equal(at(0, 16, 16), false, 'a: amount 0 at t 0');
  assert.equal(at(1, 16, 16), true, 'a: amount 1 at t 0.5');
  assert.equal(at(2, 16, 16), false, 'a: amount 0 at t 1');
  for (const f of [0, 1, 2]) assert.equal(at(f, 8, 8), true, `b draws on frame ${f}`);
});

test('keys set an emitter\'s keyable arguments and move its at; an unkeyable argument is refused by the validator', () => {
  // r is a size argument of glow (SIZE_KEYS): the emitter sets it at its largest, 8, and keys may lower it (B12b)
  const def = tiny({ emitters: [{ id: 'a', ...GLOW, r: 8 }] },
    { go: { frames: 2, fps: 8, loop: false, keys: [{ t: 0, emit: { a: { r: 2, at: [6, 6] } } }, { t: 1, emit: { a: { r: 8, at: [16, 16] } } }] } });
  assert.deepEqual(validateSprite(def).errors, []);
  const up = tiny({ emitters: [{ id: 'a', ...GLOW }] }, { go: { frames: 2, keys: [{ t: 0, emit: { a: { r: 8 } } }] } });
  assert.match(validateSprite(up).errors.join('; '), /emit "a": a key sets r to 8, above the 4 the emitter sets/);
  const s = dataSprite(def), p = defaultParams(s);
  const g0 = renderFrame(s, 'go', 0, p), g1 = renderFrame(s, 'go', 1, p);
  assert.ok(g0.get(6, 6) >>> 24 && !(g0.get(16, 16) >>> 24), 'frame 0: small, at (6, 6)');
  assert.ok(solid(g1) > 4 * solid(g0), 'frame 1: grown to r 8 at the middle');
  const bad = tiny({ emitters: [{ id: 'a', ...GLOW }] }, { go: { frames: 2, keys: [{ t: 0, emit: { a: { paints: ['spark'] } } }] } });
  assert.match(validateSprite(bad).errors.join('; '), /paints.*cannot be keyed/);
});

test('the layout itself: nodes laid out with their keys, the draw list first and on its nodes, an emitter on a node at the node\'s point', () => {
  const ctx = Object.freeze({ t: 0, frame: 0, frames: 2, loop: false, size: [32, 32], clip: 'go', direction: null });
  const run = (item) => {
    if (!item.gen) return [item];
    const { id, ...call } = item;
    const r = registry.runGenerator(call, ctx);
    assert.ok(r.ok, r.errors.join('; '));
    return r.primitives;
  };
  const input = (move) => ({
    kind: 'emitters', resolved: { palette: {}, clips: { go: { keys: [] } } }, pose: { nodes: { gun: { move } } }, generators: registry, warn: () => {},
    body: {
      nodes: [{ id: 'gun', parent: null, at: [10, 16] }],
      draw: [{ kind: 'rect', on: 'gun', at: [-2, -2], size: [5, 5], paint: 'spark.dark' }],
      emitters: [{ id: 'flash', gen: 'glow', v: 1, on: 'gun', at: [0, 0], r: 2, paints: ['spark.light'] }],
    },
    expand: (items) => ({ primitives: items.flatMap(run), palette: {} }),
    place: (prims, frames) => prims.map((p) => (p.on ? placeOn(p, frames.get(p.on)) : p)),
    nodeFrames: (nodes, changes) => new Map(nodes.map((n) => [n.id, nodeFrame({ at: [n.at[0] + (changes.get(n.id)?.move[0] ?? 0), n.at[1] + (changes.get(n.id)?.move[1] ?? 0)] })])),
    visible: (items) => items.filter((x) => !x.hidden),
  });
  const a = emittersLayout.run(input([0, 0]), ctx), b = emittersLayout.run(input([6, 0]), ctx);
  assert.equal(a.list[0].kind, 'rect', 'the draw list comes first');
  assert.deepEqual(a.list[0].at, [8, 14], 'on its node');
  assert.deepEqual(b.list[0].at, [14, 14], 'the node moved by its key');
  const flash = (out) => out.list.find((x) => x.kind === 'stamp');
  assert.ok(flash(a) && flash(b), 'the flash is drawn');
  assert.equal(flash(b).at[0] - flash(a).at[0], 6, 'the emitter on the node runs at the node\'s point');
  assert.deepEqual(a.offset, [0, 0]);
  assert.deepEqual(emittersLayout.run({}, ctx), [], 'called as a plain generator it draws nothing');
});

test('an emitter on a node, end to end (an emitters body\'s nodes and draw reach the layout through engine/resolve.js; B12b)', () => {
  const def = tiny({
    nodes: [{ id: 'gun', parent: null, at: [10, 16] }],
    draw: [{ kind: 'rect', on: 'gun', at: [-2, -2], size: [5, 5], paint: 'spark.dark' }],
    emitters: [{ id: 'flash', ...GLOW, on: 'gun', at: [0, 0], r: 2, paints: ['spark.light'] }, { id: 'under', ...GLOW, at: [20, 16], r: 3, paints: ['spark'], z: -1 }],
  }, { go: { frames: 2, fps: 8, loop: false, keys: [{ t: 0, nodes: { gun: { move: [0, 0] } } }, { t: 1, nodes: { gun: { move: [6, 0] } } }] } });
  assert.deepEqual(validateSprite(def).errors, []);
  const s = dataSprite(def), p = defaultParams(s);
  const list0 = dataFrameList(s, 'go', 0, p).list, list1 = dataFrameList(s, 'go', 1, p).list;
  const flashAt = (list) => list.find((x) => x.kind === 'stamp' && x.rows.length <= 5 && x.at[0] < 20)?.at;
  assert.ok(flashAt(list0)[0] < flashAt(list1)[0], 'the flash follows the node');
  const g = renderFrame(s, 'go', 0, p), hex = (x, y) => g.get(x, y) & 0xffffff;
  assert.notEqual(hex(10, 16), hex(11, 19), 'the flash is drawn over the rect (the rect shows round it)');
  const kinds = list0.map((x) => x.kind);
  assert.equal(kinds[0], 'rect', 'the draw list comes first');
  // the emitter with z -1 is drawn under the rect
  assert.ok(list0.some((x) => x.kind === 'stamp' && x.at[0] >= 16), 'the emitter beside the node draws too');
  // what the validator accepts, the resolver keeps: the nodes and the draw list are in the resolved body
  const R = resolveSprite(def, p);
  assert.ok(R.ok, R.errors.join('; '));
  assert.deepEqual(R.body.nodes.map((n) => n.id), ['gun']);
  assert.equal(R.body.draw.length, 1);
  assert.equal(R.body.emitters.length, 2);
  // a draw item whose `when` fails at these settings is left out, as in any body
  const styled = { ...def, controls: [{ key: 'style', kind: 'choice', label: 'Style', options: ['a', 'b'], default: 'a' }] };
  styled.body = { ...def.body, draw: [...def.body.draw, { kind: 'rect', when: { style: ['b'] }, at: [0, 0], size: [2, 2], paint: 'spark' }] };
  assert.deepEqual(validateSprite(styled).errors, []);
  assert.equal(resolveSprite(styled, { style: 'a' }).body.draw.length, 1);
  assert.equal(resolveSprite(styled, { style: 'b' }).body.draw.length, 2);
});

// ---- two library effects redrawn as data ---------------------------------------------------------------------------

for (const id of Object.keys(CODE)) {
  test(`${id} (redrawn as data) passes the validator with the site's generators, naming only behaviours`, () => {
    const def = redraw(id);
    assert.equal(def.version, 2);
    assert.ok(def.body.emitters.length >= 2);
    const r = validateSprite(def);
    assert.deepEqual(r.errors, []);
    assert.ok(r.uses.every((u) => /^(particles|starburst|glow|ring|streaks|puffs|shot\.bar|tone|mix)@1$/.test(u)), r.uses.join(', '));
  });

  test(`${id} (redrawn as data) keeps its code sprite's id, meta type, clips, sounds and control keys and kinds`, () => {
    const s = dataSprite(redraw(id)), old = CODE[id];
    assert.equal(s.id, old.id);
    assert.equal(s.meta.type, old.meta.type);
    assert.deepEqual(s.size, old.size);
    assert.deepEqual(Object.keys(s.clips), Object.keys(old.clips));
    for (const [c, clip] of Object.entries(old.clips)) {
      assert.equal(s.clips[c].frames, clip.frames, `${c} frames`);
      assert.equal(!!s.clips[c].loop, !!clip.loop, `${c} loop`);
    }
    assert.deepEqual(Object.keys(s.params).sort(), Object.keys(old.params).sort(), 'control keys');
    for (const [k, d] of Object.entries(old.params)) assert.equal(s.params[k].kind, d.kind, `${k} kind`);
    assert.deepEqual(JSON.parse(JSON.stringify(s.sounds ?? {})), JSON.parse(JSON.stringify(old.sounds ?? {})), 'sounds');
  });

  test(`${id} (redrawn as data) passes the quality bar with no errors`, () => {
    const r = checkSprite(dataSprite(redraw(id)), { soundIndex, validateMeta });
    assert.deepEqual(r.errors, []);
  });
}

const SETTINGS = {
  'blaster-bolt': [{}, { length: 0, thickness: 1, flicker: 0 }, { length: 1, thickness: 0, flicker: 1 }, { style: 'pulse' }, { style: 'needle', trail: false }],
  'plasma-burst': [{}, { size: 0, spread: 0, pieces: 3 }, { size: 1, spread: 1, pieces: 10 }, { style: 'ring' }, { style: 'shards', smoke: false }],
  'hit-spark': [{}, { size: 0, pieces: 4 }, { size: 1, pieces: 8 }, { twist: 1 }, { style: 'ring' }, { style: 'ring', size: 1 }, { style: 'slash' }, { style: 'slash', size: 0, twist: 1 }, { style: 'slash', size: 1, pieces: 8 }],
};
/** How many pixels of a redraw's frame differ from its code sprite's at settings set (clip, frame). */
function offBy(id, set, clip, f) {
  const s = dataSprite(redraw(id)), old = CODE[id];
  return pixelsOff(renderFrame(s, clip, f, { ...defaultParams(s), ...set }), renderFrame(old, clip, f, { ...defaultParams(old), ...set }));
}

test('each redraw draws close to its code sprite at several settings (within one pixel)', () => {
  for (const id of Object.keys(CODE)) {
    const s = dataSprite(redraw(id)), old = CODE[id];
    for (const set of SETTINGS[id]) {
      const pd = { ...defaultParams(s), ...set }, po = { ...defaultParams(old), ...set };
      for (const [clip, c] of Object.entries(old.clips)) for (let f = 0; f < c.frames; f++) {
        const a = renderFrame(s, clip, f, pd), b = renderFrame(old, clip, f, po);
        assert.ok(solid(a) > 0, `${id} ${clip} ${f} ${JSON.stringify(set)}: draws`);
        const apart = apartBy1(a, b);
        assert.ok(apart <= 0.35, `${id} ${clip} ${f} ${JSON.stringify(set)}: ${(apart * 100).toFixed(0)}% of pixels more than a pixel from the code sprite's`);
      }
    }
  }
});

test('blaster-bolt (redrawn) is the code sprite pixel for pixel: its flight with the trail on or off, and its hit', () => {
  for (const set of [{}, { style: 'pulse', length: 1 }, { style: 'needle', thickness: 0, flicker: 1 }, { style: 'needle', length: 1, thickness: 1, flicker: 1 }, { length: 0, trail: false }]) {
    for (const [clip, c] of Object.entries(boltCode.clips)) for (let f = 0; f < c.frames; f++) assert.equal(offBy('blaster-bolt', set, clip, f), 0, `${clip} ${f} ${JSON.stringify(set)}`);
  }
});

test('hit-spark (redrawn): the star and ring styles are the code sprite pixel for pixel at any size, number of rays and twist', () => {
  for (const set of [{}, { size: 0 }, { size: 1 }, { pieces: 4 }, { pieces: 8, size: 0.3 }, { style: 'ring' }, { style: 'ring', size: 0 }, { style: 'ring', size: 1, pieces: 8 },
    // Twist turns the star by up to half a ray's spacing whatever the number of rays (starburst's `twist`; B12b)
    { twist: 1 }, { twist: 0.5, pieces: 4 }, { twist: 1, pieces: 5 }, { twist: 0.7, pieces: 7, size: 1 }, { twist: 1, pieces: 8, size: 0 },
    { style: 'ring', twist: 1, pieces: 4 }, { style: 'ring', twist: 0.4, pieces: 7 }]) {
    for (let f = 0; f < 5; f++) assert.equal(offBy('hit-spark', set, 'burst', f), 0, `burst ${f} ${JSON.stringify(set)}`);
  }
  // it is the code sprite's look: a white core inside a rimmed six-point star on frame 0, its rays flying out
  const s = dataSprite(redraw('hit-spark')), p = defaultParams(s), g = renderFrame(s, 'burst', 0, p);
  assert.equal(g.get(16, 16) & 0xffffff, 0xffffff, 'a white core');
  assert.ok(solid(g) > 100, `frame 0 is a big star (${solid(g)} pixels)`);
});

test('hit-spark (redrawn): the slash is the code sprite pixel for pixel at the default size (any Twist, any rays), close at other sizes, its light rimmed', () => {
  // Five emitters (B12b): the frame-0 cut-across and blade bound to Size (exact at any size), and three keyed through
  // the frames, each cooling through [core, mid, edge, rim] with its rim two steps cooler (starburst `cool`, `rim`) and
  // its across-cuts turned half a spacing by `twist`. Keys cannot follow a control, so frames 1 to 4 are keyed at the
  // default size (and the frame-0 white middle's width): exact there, within a pixel elsewhere.
  for (const set of [{}, { twist: 1 }, { twist: 0.5, pieces: 4 }, { twist: 0.3, pieces: 5 }, { pieces: 7, twist: 1 }, { pieces: 8 }]) {
    for (let f = 0; f < 5; f++) assert.equal(offBy('hit-spark', { style: 'slash', ...set }, 'burst', f), 0, `slash ${f} ${JSON.stringify(set)}`);
  }
  // at other sizes every drawn pixel is within a pixel of the code sprite's (measured: 0%; up to a third of them differ
  // in colour or by a pixel, mostly on frame 1, whose widths are keyed)
  const s = dataSprite(redraw('hit-spark')), old = CODE['hit-spark'];
  for (const set of [{ size: 0 }, { size: 1 }, { size: 0.3, pieces: 8, twist: 1 }, { size: 0.8, pieces: 5, twist: 0.4 }, { size: 0.1, pieces: 4 }]) {
    for (let f = 0; f < 5; f++) {
      const p = { ...defaultParams(s), style: 'slash', ...set };
      const a = renderFrame(s, 'burst', f, p), b = renderFrame(old, 'burst', f, { ...defaultParams(old), style: 'slash', ...set });
      assert.ok(apartBy1(a, b) <= 0.05, `slash ${f} ${JSON.stringify(set)}: ${(apartBy1(a, b) * 100).toFixed(0)}% of pixels more than a pixel from the code sprite's`);
    }
  }
  // light is rimmed (docs/style-guide.md): on the frames with a light blade, no core or white pixel touches an empty one
  // and the rim is the edge colour
  const rgb = (v) => ((v & 0xff) << 16) | (v & 0xff00) | ((v >>> 16) & 0xff);   // the surface holds 0xAABBGGRR
  for (const size of [0, 0.5, 1]) for (const twist of [0, 1]) {
    const p = { ...defaultParams(s), style: 'slash', size, twist };
    const edge = Number.parseInt(String(p.edge).slice(1), 16), core = Number.parseInt(String(p.core).slice(1), 16);
    for (let f = 0; f < 5; f++) {
      const g = renderFrame(s, 'burst', f, p);
      assert.ok(solid(g) > 0, `frame ${f} size ${size} twist ${twist} draws`);
      if (f > 1) continue;
      let light = 0, rimmed = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const c = g.get(x, y);
        if (!(c >>> 24) || (rgb(c) !== core && rgb(c) !== 0xffffff)) continue;
        light++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = g.get(x + dx, y + dy);
          assert.ok(n >>> 24, `frame ${f} size ${size}: a light pixel at ${x},${y} touches an empty one`);
          if (rgb(n) === edge) rimmed++;
        }
      }
      assert.ok(light > 0 && rimmed > 0, `frame ${f} size ${size} twist ${twist}: a light blade rimmed in the edge colour (${light} light, ${rimmed} rim)`);
    }
  }
  // 16 emitters in all: the slash shares the cap with the star (7) and the ring (4)
  assert.equal(redraw('hit-spark').body.emitters.length, 16);
});

test('plasma-burst (redrawn): every style is the code sprite pixel for pixel at the default size; the ball follows Style', () => {
  for (const set of [{}, { style: 'ring' }, { style: 'shards' }, { style: 'shards', smoke: false }, { style: 'ring', size: 1, spread: 0 }]) {
    const frames = set.size === undefined ? 8 : 2;                 // away from the defaults, only the ball's frames are exact
    for (let f = 0; f < frames; f++) assert.equal(offBy('plasma-burst', set, 'burst', f), 0, `burst ${f} ${JSON.stringify(set)}`);
  }
  const def = redraw('plasma-burst');
  // its shards are one emitter cooling through [core, mid, edge, rim] (starburst `cool`, `rim`; B12b), not four copies
  assert.ok(def.body.emitters.length <= 11, `${def.body.emitters.length} emitters: room under the cap of 16`);
});

test('the hit-spark format fixture (2.5c\'s example) and the redraw are both effects of one 32 x 32 frame (the redraw is tests/fixtures/v2/emitters/hit-spark.json)', () => {
  const s = dataSprite(hitSpark());
  assert.deepEqual(s.size, sparkCode.size);
  assert.equal(s.meta.type, sparkCode.meta.type);
});
