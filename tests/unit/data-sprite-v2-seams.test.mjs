// engine/data-sprite.js, version 2: the seams the B5 and B6 reviews left open (build item B56).
//   1. A rig frame as a list (dataFrameList) is what render() draws: both go through rigs/bones.js's resolved-sprite
//      entry points (resolvedRigList, drawResolvedRig), so a version 2 sprite whose rig uses only version 1 kinds on
//      `bone` is drawn by version 2 rules both ways (tone refs, the version 2 shape cap). Held for that sprite and for
//      every v2 fixture this Loadout can build, every clip, every frame, at several settings.
//   2. Clip lookups are own-property lookups: a clip name that is an Object.prototype member ('toString', 'valueOf',
//      'hasOwnProperty', 'constructor', '__proto__') is a clip the sprite has only when its definition writes it.
// Run: node --test tests/unit/data-sprite-v2-seams.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { dataSprite, makeDataSprite, dataFrameList, framePose, validateDataSprite } from '../../engine/data-sprite.js';
import { drawList } from '../../engine/draw-list.js';
import { Surface } from '../../engine/surface.js';
import { px } from '../../engine/gen/args.js';
import { studioTemplate, STUDIO_TEMPLATE_IDS } from '../../rigs/studio-templates.js';
import { loadV2, V2_FIXTURES, testPieces, testRegistry, settingsOf } from '../fixtures/resolve/helpers.mjs';

/** The fixtures' runnable generators plus stand-ins of the coin's two motions (as data-sprite-v2-pictures.test.mjs). */
function registry() {
  const reg = testRegistry();
  reg.defineGenerator({ id: 'pickup.bob', v: 1, family: 'motion', about: 'Test bob: lifts the whole picture by its height.', args: { height: px(0, 8) }, cost: () => 0,
    run: (a) => [{ move: [0, -Math.round(a.height)] }] });
  reg.defineGenerator({ id: 'pickup.spin', v: 1, family: 'motion', about: 'Test spin: moves its node one pixel right on odd frames.', args: {}, cost: () => 0,
    run: (a, ctx) => [{ move: [ctx.frame % 2, 0] }] });
  return reg;
}
const OPTS = { pieces: testPieces(), generators: registry() };
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const lit = (g) => g.data.filter(Boolean).length;
const phaseOf = (c, frame) => (c.loop ? frame / c.frames : c.frames > 1 ? frame / (c.frames - 1) : 0);   // engine/sprite.js renderFrame's phase

/** One frame through render() and the same frame through dataFrameList + drawList. */
function both(s, clip, frame, p) {
  const c = s.clips[clip];
  const a = new Surface(s.size[0], s.size[1]);
  s.render(a, { clip, t: phaseOf(c, frame), frame, frames: c.frames, loop: c.loop, p });
  const L = dataFrameList(s, clip, frame, p);
  const b = new Surface(s.size[0], s.size[1]);
  drawList(b, L.list, { palette: L.palette });
  return { a, b, L };
}

/** Every clip and frame of s at each of the settings: render() and dataFrameList give the same pixels. Returns the frames compared. */
function holdSame(s, looks, label) {
  let n = 0;
  for (const p of looks) for (const [clip, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) {
    const { a, b } = both(s, clip, f, p);
    assert.ok(same(a, b), `${label} ${clip} frame ${f} at ${JSON.stringify(p)}: render() and dataFrameList differ`);
    n++;
  }
  return n;
}

/** A version 2 sprite with one bone and n ellipses on it, every one on `bone` (version 1's key), painted `paint`. */
const blob = (n, paint) => ({
  format: 'loadout-sprite', version: 2, id: 'blobby', name: 'Blobby', blurb: 'A test blob for the bone rig.', size: [64, 64], pivot: [32, 58],
  meta: { type: 'creature', role: 'characters/enemy', view: 'side', themes: ['fantasy'], gameTypes: ['platformer'], words: ['blob', 'slime', 'goo', 'enemy', 'jelly', 'test'], license: 'draft' },
  palette: [{ id: 'skin', label: 'Skin', default: '#4f9d57', material: 'skin' }],
  body: { rig: { bones: [{ id: 'body', parent: null, at: [32, 40], angle: 180, length: 10 }],
    shapes: Array.from({ length: n }, (_, i) => ({ id: 's' + i, bone: 'body', kind: 'ellipse', at: [(i % 10) - 5, (i % 7) - 3], r: [1, 1], paint, z: i % 5 })),
    points: [{ id: 'top', bone: 'body', at: [10, 0] }] } },
  clips: { idle: { frames: 2, fps: 4, keys: [{ t: 0, bones: { body: 180 } }, { t: 0.5, bones: { body: 170 } }] } },
});

test('B56: a version 2 sprite whose rig has only version 1 kinds on `bone` lists and draws the same (tone refs)', () => {
  const r = makeDataSprite(blob(3, 'skin.dark'), OPTS);
  assert.equal(r.ok, true, r.errors.join('; '));
  const s = r.sprite;
  for (const f of [0, 1]) {
    const { a, b, L } = both(s, 'idle', f, {});
    assert.ok(lit(a) > 0, 'something is drawn');
    assert.ok(same(a, b), `frame ${f}: render() and dataFrameList give the same pixels`);
    assert.ok(L.list.some((x) => x.paint === 'skin.dark'), 'the tone ref reaches the list');
    assert.deepEqual(L.warnings, [], 'nothing is left out');
  }
});

test('B56: ... and past the version 1 shape cap (200 shapes on `bone`: all listed, all drawn)', () => {
  const s = dataSprite(blob(200, 'skin'), OPTS);
  const { a, b, L } = both(s, 'idle', 0, {});
  assert.ok(same(a, b), 'render() and dataFrameList give the same pixels');
  assert.equal(L.list.length, 201, 'the 200 shapes and the outline');
  assert.deepEqual(L.warnings, []);
});

test('B56: every studio template written as version 2 lists what it draws, every clip and frame', () => {
  let frames = 0;
  for (const id of STUDIO_TEMPLATE_IDS) {
    const v1 = validateDataSprite(studioTemplate(id)).value;
    const rig = { ...v1.body.rig };
    const colours = rig.colours;
    delete rig.colours;
    const def = { ...v1, version: 2, palette: colours.map((c) => ({ ...c, default: v1.colours?.[c.id] ?? c.default })), body: { rig } };
    delete def.colours;
    const s = dataSprite(def, OPTS);
    frames += holdSame(s, [{}], id);
  }
  assert.ok(frames > 100, `${frames} frames compared`);
});

test('B56: every v2 fixture this Loadout builds lists what render() draws, every clip and frame, at several settings', () => {
  const built = [], refused = [];
  let frames = 0;
  for (const name of V2_FIXTURES) {
    const def = loadV2(name);
    const r = makeDataSprite(def, OPTS);
    if (!r.ok) { refused.push(`${name}: ${r.errors[0]}`); continue; }
    built.push(name);
    frames += holdSame(r.sprite, settingsOf(def).slice(0, 6), name);
  }
  assert.ok(built.includes('knight'), `the knight (a rig) is built; refused: ${refused.join(' | ')}`);
  assert.ok(built.includes('coin'), `the coin (pictures) is built; refused: ${refused.join(' | ')}`);
  // a fixture refused now is one whose body has no layout yet (engine/data-sprite.js NOT_BUILT_BODIES) or that names
  // generators the test registry has no stand-in for (B12 to B15 bring them)
  for (const why of refused) assert.match(why, /B1[2-5]|not one this Loadout draws|no layout|there is no generator/, why);
  assert.ok(frames > 50, `${frames} frames compared`);
});

// ---- clip lookups are own-property lookups ------------------------------------------------------------------------

const PROTO = ['toString', 'valueOf', 'hasOwnProperty', 'constructor', '__proto__', 'isPrototypeOf'];

test('B56: a version 2 sprite has no clip named for an Object.prototype member it does not write', () => {
  const knight = dataSprite(loadV2('knight'), OPTS);
  const coin = dataSprite(loadV2('coin'), OPTS);
  for (const s of [knight, coin]) {
    for (const clip of PROTO) {
      const g = new Surface(s.size[0], s.size[1]);
      assert.throws(() => s.render(g, { clip, t: 0, frame: 0, p: {} }), /no clip/, `${s.id} render ${clip}`);
      assert.throws(() => dataFrameList(s, clip, 0, {}), /no clip/, `${s.id} dataFrameList ${clip}`);
      if (s.sockets) assert.deepEqual(s.sockets(clip, 0, {}), {}, `${s.id} sockets ${clip}`);
      assert.equal(Object.hasOwn(s.clips, clip), false, `${s.id} clips ${clip}`);
      assert.equal(Object.hasOwn(s.sounds ?? {}, clip), false, `${s.id} sounds ${clip}`);
    }
  }
});

test('B56: a version 2 definition cannot name a clip toString, valueOf or hasOwnProperty (the validator refuses it)', () => {
  const def = blob(3, 'skin');
  def.clips = { idle: { frames: 2, fps: 4 }, toString: { frames: 2, fps: 4 }, valueOf: { frames: 3, fps: 6 }, hasOwnProperty: { frames: 1, fps: 1 } };
  const r = makeDataSprite(def, OPTS);
  assert.equal(r.ok, false);
  for (const name of ['toString', 'valueOf', 'hasOwnProperty']) assert.ok(r.errors.some((e) => e.includes(`"${name}" cannot be a clip name`)), `${name}: ${r.errors.join('; ')}`);
});

test('B56: version 1: a clip named for an Object.prototype member the definition does not write has no pose and no sockets', () => {
  const v1 = dataSprite(studioTemplate('blob'));
  const def = v1.definition;
  assert.ok(def.body.rig.points.length > 0, 'the template has attach points');
  const real = Object.keys(v1.clips)[0];
  assert.ok(Object.keys(v1.sockets(real, 0, {})).length > 0, 'a real clip has sockets');
  for (const clip of PROTO) {
    assert.deepEqual(framePose(def, clip, 0), {}, `framePose ${clip}`);
    assert.deepEqual(v1.sockets(clip, 0, {}), {}, `sockets ${clip}`);
  }
});
