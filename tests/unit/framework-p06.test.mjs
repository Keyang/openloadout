// Framework additions made with batch P06 (platformer enemies: spear-goblin, thorn-beetle) that outlive the side-view rig.
//
// engine/creature.js: hornPath, hornIn (a curved tapering horn, tusk or claw)
// Fix round 1 added, engine/creature.js: CREATURE_EYES, creatureEye (the standard "Eyes" choice of a creature), feelerIn (a hair-thin feeler)
// (rigs/crawler.js went in R2 with its tests, and rigs/humanoid.js with its tests in R2b, 2026-11-21: club, dagger,
// EXTRA_ITEMS, itemSizeOf, drawItem, thrustTrail, hood, hoodReach, skullcap, pointedEar, nose, NOSES, tunic, boneTopknot,
// boneTopknotRise, noseTip, itemClearOf. Those of engine/creature.js stay.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { PI } from '../../engine/motion.js';
import { ramp } from '../../engine/color.js';
import { hornPath, hornIn } from '../../engine/creature.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const paint = (test, w = 48, h = 48) => new Surface(w, h).fill(0, 0, w, h, test, '#ffffff');

// ---- engine/creature.js ---------------------------------------------------------------
test('hornPath and hornIn: a horn of the asked length that sets off the asked way, curls, and tapers to its tip', () => {
  const straight = hornPath(10, 20, PI / 2, 8);
  assert.equal(straight.length, 6); near(straight[5][0], 18); near(straight[5][1], 20);
  const up = hornPath(10, 20, PI / 2, 8, { curl: 1.2 });
  assert.ok(up[5][1] < 18 && up[5][0] < 18, 'a positive curl turns it upward');
  let len = 0; for (let i = 1; i < up.length; i++) len += Math.hypot(up[i][0] - up[i - 1][0], up[i][1] - up[i - 1][1]);
  near(len, 8);
  const g = paint(hornIn(10, 20, PI / 2, 10, { width: 4, tip: 1 }));
  const col = (x) => { let n = 0; for (let y = 0; y < 48; y++) if (g.get(x, y)) n++; return n; };
  assert.ok(col(11) >= 3 && col(18) <= 2 && col(11) > col(18), 'thick at the root, thin at the tip');
  assert.ok(lit(g) > 20);
});

// ---- rigs/humanoid.js -----------------------------------------------------------------


import { creatureEye, CREATURE_EYES, feelerIn } from '../../engine/creature.js';
import { pack } from '../../engine/color.js';

// a Surface that counts reads, so a test can say a helper never reads pixels back
class NoRead extends Surface { constructor(w, h) { super(w, h); this.reads = 0; } get(x, y) { this.reads++; return super.get(x, y); } }
const eyeOn = (opt, at = [20, 20]) => { const g = new NoRead(40, 40); creatureEye(g, at[0], at[1], opt); return g; };

test('creatureEye: three styles that all differ, a blink that differs from each, and nothing outside its box', () => {
  assert.deepEqual(CREATURE_EYES, ['dots', 'angry', 'glow']);
  const base = { body: '#7a4f33', brow: '#3a2418', glow: '#f2c230' };
  const pics = CREATURE_EYES.map((style) => eyeOn({ ...base, style }));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.notDeepEqual([...pics[i].data], [...pics[j].data], `${CREATURE_EYES[i]} and ${CREATURE_EYES[j]} differ`);
  for (const style of CREATURE_EYES) {
    const open = eyeOn({ ...base, style }), shut = eyeOn({ ...base, style, blink: true });
    assert.notDeepEqual([...open.data], [...shut.data], `${style}: a blink shows`);
    assert.ok(lit(open) >= 4 && lit(shut) >= 2, `${style}: it draws`);
    for (const g of [open, shut]) {
      const b = g.bounds();
      assert.ok(b.x0 >= 20 - 2 && b.x1 <= 20 + 2 && b.y0 >= 20 - 2 && b.y1 <= 20 + 2, `${style}: inside the 5x5 box round its middle (${JSON.stringify(b)})`);
      assert.equal(g.reads, 0, `${style}: it does not read pixels back`);
    }
  }
});

test('creatureEye: the white and pupil keep apart on any body colour, and a glowing eye has a lit core, a glint and a darker rim', () => {
  for (const body of ['#f0ead8', '#3a2a5a', '#7a4f33']) {
    const g = eyeOn({ style: 'dots', body });
    const seen = new Set([...g.data].filter(Boolean));
    assert.ok(seen.size >= 2, `on ${body} the pupil and the white are two colours`);
    assert.ok(!seen.has(pack(...[1, 3, 5].map((i) => parseInt(body.slice(i, i + 2), 16)))), `on ${body} neither is the body colour`);
  }
  const glow = eyeOn({ style: 'glow', glow: '#f2c230' });
  const seen = new Set([...glow.data].filter(Boolean));
  assert.ok(seen.has(pack(0xf2, 0xc2, 0x30)), 'the core is the glow colour');
  assert.ok(seen.has(pack(255, 255, 255)), 'with a white glint');
  assert.ok(seen.size >= 3, 'and a rim of a darker tone');
  const bare = eyeOn({ style: 'glow', glow: '#f2c230', rim: false });
  assert.ok(lit(bare) < lit(glow), 'the rim can be left off');
});

test('feelerIn: a thin curved feeler of the asked length from its root, that droops with curl and stays thin', () => {
  const g = paint(feelerIn(10, 30, PI / 2 + 0.9, 8, { curl: -1.2 }));
  const b = g.bounds();
  assert.ok(lit(g) >= 6 && lit(g) <= 26, `a thin line of pixels (${lit(g)})`);
  assert.ok(b.x1 >= 15 && b.x1 <= 19, 'it reaches forward by most of its length');
  assert.ok(b.y0 < 28, 'it sets off upward');
  const straight = paint(feelerIn(10, 30, PI / 2, 8)).bounds();
  assert.ok(straight.y1 - straight.y0 <= 2 && straight.x1 >= 17, 'with no curl it is straight');
  const short = paint(feelerIn(10, 30, PI / 2, 4));
  assert.ok(lit(short) < lit(paint(feelerIn(10, 30, PI / 2, 8))));
  const knob = paint(feelerIn(10, 30, PI / 2, 8, { knob: 1.4 }));
  assert.ok(lit(knob) > lit(paint(feelerIn(10, 30, PI / 2, 8))), 'a knob thickens the tip');
});

