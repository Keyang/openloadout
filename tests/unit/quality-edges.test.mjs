// The sprite quality bar, frame-edge faults at settings the other looks do not reach:
//   S-inside-frame, far ends   all sliders high (and low) with each other value of each choice and each on/off control
//                              flipped, one at a time; each part's options with the part's own sliders at both ends
//   S-inside-frame-shapes      the settings a whole-bundle look with shapes varied gives the sprite, for a fixed
//                              number of seeds (themedParams in engine/theme.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSprite, THRESHOLDS } from '../../quality/sprite.js';
import { renderFrame, cleanParams, defaultParams } from '../../engine/sprite.js';
import { themedParams } from '../../engine/theme.js';
import * as F from '../fixtures/quality/sprites.mjs';
import * as E from '../fixtures/quality/edges.mjs';

const EDGE = /touches the frame edge/;
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;
const edgeErrors = (r) => r.errors.filter((m) => EDGE.test(m));
const touches = (def, clip, f, p) => { const b = renderFrame(def, clip, f, p).bounds(), [w, h] = def.size; return b.x0 === 0 || b.y0 === 0 || b.x1 === w - 1 || b.y1 === h - 1; };

// ---- the far ends -------------------------------------------------------------------------------------------

test('a sprite that stays inside its frame everywhere passes both checks, and the metrics say what was drawn', () => {
  const r = checkSprite(E.carrierGood());
  assert.deepEqual(edgeErrors(r), [], show(r));
  // all low and all high, each with sign=flag and sign=banner; the part "sign": flag and banner, own slider low and high
  assert.equal(r.metrics.edgeEnds.looks, 8);
  assert.equal(r.metrics.edgeEnds.touched, 0);
  assert.ok(r.metrics.edgeEnds.renders > 0 && r.metrics.edgeEnds.ms >= 0);
  assert.equal(r.metrics.shapes.seeds, THRESHOLDS.shapeSeeds);
  assert.equal(r.metrics.shapes.touched, 0);
});

test('all sliders high with another value of a choice: the sign leaves the frame, an error naming the clip, frame and setting', () => {
  const def = E.bannerTooTall();
  // the fault is real and out of reach of the settings tested before
  const hi = { ...defaultParams(def), size: 1, signSize: 1, bounce: 1 };
  assert.ok(touches(def, 'wave', 1, { ...hi, sign: 'banner' }) && !touches(def, 'wave', 1, hi) && !touches(def, 'wave', 1, { ...defaultParams(def), sign: 'banner' }));
  const r = checkSprite(def);
  const e = edgeErrors(r);
  assert.equal(e.length, 1, show(r));
  assert.match(e[0], /^wave frame 1 \/ all-high \+ sign=banner: drawing touches the frame edge \(clipped\), box \d+,0\.\.\d+,\d+/);
  assert.ok(r.metrics.edgeEnds.touched >= 1);
  assert.deepEqual(r.metrics.edgeEnds.first, { look: 'all-high + sign=banner', clip: 'wave', frame: 1 });
});

test('the frames drawn are the ones that reach furthest: far fewer than every frame of every look', () => {
  const r = checkSprite(E.bannerTooTall());
  const everyFrame = r.metrics.edgeEnds.looks * 8;       // 2 clips x 4 frames
  assert.ok(r.metrics.edgeEnds.renders <= everyFrame / 2, `${r.metrics.edgeEnds.renders} of ${everyFrame}`);
});

test('all sliders low with another value of a choice', () => {
  const r = checkSprite(E.flagDroops());
  const e = edgeErrors(r);
  assert.equal(e.length, 1, show(r));
  assert.match(e[0], /^idle frame \d \/ all-low \+ sign=flag: drawing touches the frame edge/);
});

test('all sliders high with an on/off control flipped', () => {
  const r = checkSprite(E.capeTooWide());
  const e = edgeErrors(r);
  assert.equal(e.length, 1, show(r));
  assert.match(e[0], /^idle frame \d \/ all-high \+ cape=true: drawing touches the frame edge/);
});

test('a part with its own sliders high on a default body', () => {
  const def = E.bannerTip();
  const d = defaultParams(def);
  assert.ok(touches(def, 'wave', 1, { ...d, sign: 'banner', signSize: 1 }) && !touches(def, 'wave', 1, { ...d, size: 1, signSize: 1, bounce: 1, sign: 'banner' }));
  const r = checkSprite(def);
  const e = edgeErrors(r);
  assert.equal(e.length, 1, show(r));
  assert.match(e[0], /^wave frame 1 \/ sign=banner \+ part "sign" sliders high: drawing touches the frame edge/);
});

test('types that may touch the frame edge are not drawn again at all', () => {
  const r = checkSprite(E.edgeFreeType());
  assert.deepEqual(edgeErrors(r), [], show(r));
  assert.deepEqual({ looks: r.metrics.edgeEnds.looks, renders: r.metrics.edgeEnds.renders }, { looks: 0, renders: 0 });
  assert.deepEqual({ seeds: r.metrics.shapes.seeds, renders: r.metrics.shapes.renders }, { seeds: 0, renders: 0 });
});

// ---- shapes ---------------------------------------------------------------------------------------------------

test('the number of seeds is a named constant', () => {
  assert.equal(THRESHOLDS.shapeSeeds, 12);
});

test('a look with shapes varied: an error that names the seed, the clip and the frame', () => {
  const r = checkSprite(E.shapesFault(5));
  const e = edgeErrors(r);
  assert.equal(e.length, 1, show(r));
  assert.match(e[0], /^idle frame 2 \/ shapes seed 5: drawing touches the frame edge \(clipped\), box \d+,\d+\.\.31,\d+/);
  assert.equal(r.metrics.shapes.touched, 1);
  assert.deepEqual(r.metrics.shapes.first, { seed: 5, clip: 'idle', frame: 2 });
});

test('the message says how to see it with tools/render.mjs, and those settings do reproduce it', () => {
  const def = E.shapesFault(5);
  const [e] = edgeErrors(checkSprite(def));
  const cmd = /node tools\/render\.mjs q-shapes --clip idle((?: --set [a-zA-Z]+=\S+)+)/.exec(e);
  assert.ok(cmd, e);
  const sets = Object.fromEntries([...cmd[1].matchAll(/--set ([a-zA-Z]+)=(\S+)/g)].map((m) => [m[1], m[2]]));
  const p = cleanParams(def, { ...defaultParams(def), ...sets });        // what tools/render.mjs does with --set
  assert.ok(touches(def, 'idle', 2, p), `settings ${JSON.stringify(sets)} do not touch the edge`);
  assert.deepEqual(p, themedParams(def, defaultParams(def), { seed: 5, shapes: true }));
  assert.match(e, /engine\/theme\.js/);
});

test('seeds 0 to shapeSeeds - 1 are drawn, no others', () => {
  const last = THRESHOLDS.shapeSeeds - 1;
  assert.match(edgeErrors(checkSprite(E.shapesFault(last)))[0], new RegExp(`shapes seed ${last}:`));
  assert.match(edgeErrors(checkSprite(E.shapesFault(0)))[0], /shapes seed 0:/);
  const r = checkSprite(E.shapesFault(THRESHOLDS.shapeSeeds + 20));
  assert.deepEqual(edgeErrors(r), [], show(r));
});

test('not every frame is drawn for every seed: first the frames that reach furthest at the tested settings', () => {
  assert.equal(THRESHOLDS.shapeNear, 2);
  // nothing comes near the edge: 4 frames, of which the first and the top of the bounce are drawn
  const far = checkSprite(E.shapesFault(40));
  assert.equal(far.metrics.shapes.renders, THRESHOLDS.shapeSeeds * 2);
  // a clip that comes within shapeNear pixels of the edge in those frames is drawn in full
  const near = checkSprite(E.shapesFault(40, { longArm: true }));
  assert.equal(near.metrics.shapes.renders, THRESHOLDS.shapeSeeds * 4);
});

test('a frame that is not one of those is found when the clip comes near the edge, and only then', () => {
  const r = checkSprite(E.shapesFault(5, { frame: 1, longArm: true }));
  assert.match(edgeErrors(r)[0] ?? '', /^idle frame 1 \/ shapes seed 5: drawing touches the frame edge/, show(r));
  // the limit of drawing fewer frames: a frame that jumps from well inside the frame onto the edge, and is not one
  // of the frames that reach furthest at the default, all-low or all-high settings, is not seen
  assert.deepEqual(edgeErrors(checkSprite(E.shapesFault(5, { frame: 1 }))), []);
});

test('an interface piece is not swept: it may touch the frame edge', () => {
  const r = checkSprite(E.shapesFault(5, { type: 'ui' }));
  assert.deepEqual(edgeErrors(r), [], show(r));
});

// ---- both -----------------------------------------------------------------------------------------------------

test('both checks are deterministic', () => {
  const strip = (r) => ({ errors: r.errors, warnings: r.warnings, ends: { ...r.metrics.edgeEnds, ms: 0 }, shapes: { ...r.metrics.shapes, ms: 0 } });
  for (const fx of [E.bannerTooTall, E.bannerTip, () => E.shapesFault(5), F.good]) assert.deepEqual(strip(checkSprite(fx())), strip(checkSprite(fx())));
});

test('the good fixtures of the other checks still pass', () => {
  for (const fx of [F.good, F.backgroundGood]) {
    const r = checkSprite(fx());
    assert.deepEqual(edgeErrors(r), [], show(r));
  }
});
