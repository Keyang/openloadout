// Framework additions made with batch P07 (platformer creatures: spore-hopper, crow-scout), all in the new
// module engine/creature.js:
//   squashStretch   the two size multipliers of a squashed or stretched body, area kept
//   hopArc          one hop on the style guide's beats: crouch, leave the ground, top, land
//   flapCycle       one wing beat: a fast down-stroke, a trailing tip, a fold on the way up, the body's rise
//   leafIn          a pointed leaf, petal or feather between two points
//   fanTips, fanIn  a fan of such blades from one root (tail fan, crest, collar of leaves)
//   bulbHalf, bulbIn   an onion-shaped body, widest low down, drawn up to a neck
//   springIn        a coiled spring seen from the side, which packs flat and opens
//   featherWing     a feathered wing hinged at the shoulder, with ragged flight feathers
//   nudgeInside     how far to move a drawing so it stays inside the frame
//   flutterIn       loose feathers or leaves thrown out, then drifting down and thinning out
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { PI } from '../../engine/motion.js';
import { squashStretch, hopArc } from '../../engine/creature.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const draw = (test, w = 48, h = 48) => new Surface(w, h).fill(0, 0, w, h, test, '#ffffff');
const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => f / 8);

// ---- squashStretch --------------------------------------------------------------

test('squashStretch keeps the area: wider means shorter by the same factor', () => {
  assert.deepEqual(squashStretch(0), [1, 1]);
  for (const k of [-0.5, -0.2, 0.1, 0.4]) {
    const [wide, tall] = squashStretch(k);
    near(wide * tall, 1);
    assert.equal(wide > 1, k > 0, `squash ${k}: wider only when squashed`);
  }
  assert.deepEqual(squashStretch(5), squashStretch(0.6), 'held at the limit');
  assert.deepEqual(squashStretch(5, 0.3), squashStretch(0.3, 0.3));
});

// ---- hopArc -----------------------------------------------------------------------

test('hopArc follows the hop beats of an 8-frame clip: crouch 0 to 1, leave on 2, top on 4, land on 6', () => {
  const f = frames.map((t) => hopArc(t));
  assert.equal(f[0].lift, 0); assert.equal(f[1].lift, 0);
  assert.ok(f[1].squash > 0.95, 'frame 1 is the deepest crouch');
  assert.ok(f[1].legs < 0.05, 'frame 1: the legs are pressed flat');
  assert.ok(f[2].squash < -0.9 && f[2].legs > 1.9, 'frame 2: stretched, legs at twice their length');
  assert.ok(f[2].lift > 0 && f[2].lift < 0.4, `frame 2 has only just left the ground (${f[2].lift})`);
  assert.ok(f[4].lift > 0.95, 'frame 4 is the top');
  for (const x of f) assert.ok(x.lift <= f[4].lift + 1e-9 && x.lift >= 0 && x.lift <= 1);
  assert.equal(f[6].lift, 0);
  assert.ok(f[6].squash > 0.95 && f[6].legs < 0.05, 'frame 6: landed and squashed');
  assert.ok(f[3].fall < 0 && f[5].fall > 0, 'rising on 3, falling on 5');
  assert.equal(f[4].air, true); assert.equal(f[6].air, false);
});

// ---- added in fix round 1: bulbRibsIn, fitScale, and creatureEye's 'sleepy' style, squint and flip ----
import { pack } from '../../engine/color.js';

// a Surface that counts reads, so a test can say a helper never reads pixels back
class CountReads extends Surface { constructor(w, h) { super(w, h); this.reads = 0; } get(x, y) { this.reads++; return super.get(x, y); } }
const pixels = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) out.push([x, y, g.data[y * g.w + x]]); return out; };
