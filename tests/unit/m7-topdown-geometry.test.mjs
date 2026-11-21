// Where the nine top-down redraws of migration batch M7 stand, held to their code sprites (second review of M7, issues
// 2 to 5 and 8): library-redraws.test.mjs checks their interface and the quality bar, m7-topdown-looks.test.mjs what
// they draw, and nothing held their size and place to the code. The review found the mage 4 px shorter with its robe
// in the ground, the guard 7 px off the pivot from the side, the merchant 3 px shorter, the child larger, and the Height
// slider short of the code's range on six of them: each from a base baked at the biggest headgear and the longest
// weapon, where the code rig crouches the body or moves it aside to keep them in the frame.
//
// R2 deleted the code sprites (rigs/topdown.js went with them) and this test with them; it is back against the recorded
// frames of tests/fixtures/code-frames/ (tests/helpers/code-frames.mjs), the data sprite drawn live.
//
// For each of the nine and each clip, the box of everything it draws over all its frames is compared with the code
// sprite's:
//   1. at the defaults, every side of every clip's box within 1 px;
//   2. at Height low and high (the rest at the defaults), the top and bottom rows of the standing clips within 1 px;
// except where KNOWN says how far and why: what data cannot do yet, each in the batch's report. A change that moves one
// of these further fails here, and so does one that brings it within 1 px (take it out of KNOWN then).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { codeFrames } from '../helpers/code-frames.mjs';
import { cleanParams, defaultParams, renderFrame } from '../../engine/sprite.js';

const IDS = ['village-elder', 'farm-kid', 'hero-walker', 'mage-walker', 'merchant', 'town-guard', 'void-ranger', 'shield-trooper', 'rogue-walker'];

/** Clips (or '<clip> height <h>') allowed further than 1 px, with the most pixels any side may be off and why. */
const KNOWN = {
  'village-elder': {
    idle_side: [3, "B16b's walker base does not lean a stooped body forward from the side: the head and back stand up to 3 px behind the code's"],
    walk_side: [3, 'as idle_side'],
  },
  'farm-kid': Object.fromEntries(['idle_down', 'idle_up', 'idle_side'].map((c) => [`${c} height 0`, [2, "the shortest child 2 px taller than the code's: its basket, hung from a lower hand, would reach the frame's bottom (the code lifts the hand)"]])),
  'hero-walker': {
    idle_side: [2, 'the cape sways 2 px behind the back in the code; the cape piece is a still stamp'], walk_side: [2, 'as idle_side'],
    attack_up: [2, 'base:person-topdown-sword@1 is fitted to the longest weapon and the biggest helmet (kept at version 1: keyed at the defaults its swing, hurt and die reach the frame edge at the biggest settings)'],
    attack_side: [2, 'as attack_up'], hurt: [3, 'as attack_up: the hurt body crouched for the biggest helmet'], die: [3, 'as attack_up'],
  },
  'mage-walker': {
    ...Object.fromEntries(['idle_down', 'idle_up', 'idle_side'].map((c) => [`${c} height 1`, [2, "the tallest mage 2 px shorter than the code's: the longest staff's orb would reach the frame's top in the cast (the code shortens the staff there)"]])),
  },
  merchant: { wave: [2, "the waving hand 2 px lower: the code carries the head 3 rows high, the base's neck stretches 2"] },
  'shield-trooper': Object.fromEntries(['idle_down', 'idle_side'].map((c) => [`${c} height 0`, [2, "on the shortest trooper the rifle's butt reaches 2 px below the feet (the code shortens it)"]])),
  'rogue-walker': {
    idle_down: [2, 'the scarf trails out in the code idle and walk; part:topdown-scarf@2 hangs still but for the run (its file is 90 KB of the 128 KB a piece may hold)'],
    walk_down: [4, 'as idle_down'], walk_side: [3, 'as idle_down'],
  },
};

/** The box [x0, y0, x1, y1] of every pixel a clip draws over all its frames at settings set (on the defaults). */
function clipBox(s, clip, set = {}) {
  const p = cleanParams(s, { ...defaultParams(s), ...set });
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let f = 0; f < s.clips[clip].frames; f++) {
    const g = renderFrame(s, clip, f, p);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (!(g.data[y * g.w + x] >>> 24)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}
const pair = async (id) => [codeFrames(id), await loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`))];
/** The recorded code sprite's box of a clip at Height `height` (undefined: the defaults). */
const codeBox = (code, clip, height) => code.box(height === undefined ? '' : `height=${height}`, clip);
/** Is box b further than allowed from a on any of these sides (allowed: 1 px, or KNOWN's for this id and clip, which must be needed). */
const off = (a, b, sides = [0, 1, 2, 3]) => Math.max(...sides.map((i) => Math.abs(a[i] - b[i])));
function far(id, key, a, b, sides) {
  const d = off(a, b, sides), k = KNOWN[id]?.[key];
  if (!k) return d > 1;
  assert.ok(d > 1, `${id} ${key}: within 1 px now; take it out of KNOWN`);
  return d > k[0];
}
const say = (a, b) => `code ${JSON.stringify(a)}, data ${JSON.stringify(b)}`;

for (const id of IDS) {
  test(`${id}: at its defaults every clip draws within 1 px of the code sprite's box`, async () => {
    const [code, data] = await pair(id);
    const bad = [];
    for (const clip of Object.keys(code.clips)) {
      const a = codeBox(code, clip), b = clipBox(data, clip);
      if (far(id, clip, a, b)) bad.push(`${clip}: ${say(a, b)}`);
    }
    assert.deepEqual(bad, [], `${id}: ${bad.length} clips are off`);
  });

  test(`${id}: Height low and high stand as tall as the code sprite (top and bottom rows within 1 px)`, async () => {
    const [code, data] = await pair(id);
    const bad = [];
    for (const clip of ['idle_down', 'idle_up', 'idle_side']) for (const height of [0, 1]) {
      const a = codeBox(code, clip, height), b = clipBox(data, clip, { height });
      if (far(id, `${clip} height ${height}`, a, b, [1, 3])) bad.push(`${clip} height ${height}: ${say(a, b)}`);
    }
    assert.deepEqual(bad, [], `${id}: ${bad.length} are off`);
  });
}
