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
   // batch E2: sprites/plasma-burst.js is data now; its frozen code copy
   // batch E1: sprites/hit-spark.js is data now; its frozen code copy
import { codeSprite } from '../helpers/library.mjs';   // the frozen copy, or its recorded replay once the copy is gone (R3)
import * as registry from '../../engine/gen/index.js';
import { emitters as emittersLayout } from '../../engine/gen/emitters.js';
import { nodeFrame, placeOn } from '../../engine/draw-list.js';

const V2 = new URL('../fixtures/v2/', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, V2), 'utf8'));
const hitSpark = () => read('hit-spark.json');
const redraw = (id) => read(`emitters/${id}.json`);
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
