// The mage-walker's cast, held in the finished frame (M7b review 3, kept by M7c), and what the code sprites of the
// nine top-down people did in the gestures M7c fitted (the elder's raised hand, the merchant's talk and wave, the guard's
// side clips, the ranger's end-on gun, the mage's cast at the frame's edge). R2 deleted the code sprites, their rig
// (rigs/topdown*.js) and the bakers, and review of R2 found those comparisons gone with them. They are back against a
// record: tests/fixtures/code-frames/<id>.json holds the code's frames at the looks they read (tests/helpers/code-frames.mjs;
// the data sprite is drawn live), and tests/fixtures/m7-topdown-gaps.json the counts of what the redraws still draw
// unlike the code.
// NOT held any more (they needed the code's rig functions, not only its pixels): the shield-trooper's energy-shield light
// drawn alone against rigs/topdown-riot.js (its place at the rest pose, probed with dots), the trooper's baton and gun
// bones (held by the whole-frame pixel ratchet), and the bakers' own rebuild tests (the bakers are deleted, the pieces
// they wrote are pinned data). The energy shield's scan line (the climbing line) IS held, at every Size, as a ratchet
// against the recorded code frames (7 below): m7-topdown-pixels changes one setting at a time from the defaults, so it
// draws the energy shield at Size 1 only ('shield=energy'), and its 'shieldSize=0.65' and 'shieldSize=1.35' looks draw the
// default riot shield, which has no scan line. Other holds on the nine: tests/fixtures/redraws/<id>.json
// (interface), redraw-boxes/<id>.json (box ratchets), m7-topdown-pixels, m7-topdown-geometry, m7-topdown-motion.json
// (Bounce and Stride, read by m7-topdown-travel) and library-redraws-boxes.
// Held here:
//   1. mage-walker's twinkles (sparkles round the light, upright on screen) are the same pixels, in the same colours, in the
//      finished frame as engine/fx.js sparkles give round the light's centre, with every weapon, Length and Height (a
//      glow rim, a wrong paint or a misplaced twinkle fails; a twinkle that would reach the frame's edge is left out whole);
//   2. the cast keeps its light (twinkles, star burst, ring) at every Height and Length and never touches the frame's edge;
//   3. village-elder's talk: the free hand comes right up as he speaks, within a row of the code's, and the clip is nearer the code than on version 1 of the walker;
//   4. merchant's talk and wave follow Bounce as the code's do, and come nearer the code there than without the travel;
//   5. town-guard's side clips move sideways with the pole's Length as the code's do, each look at its recorded count; the pike's cap is as recorded;
//   6. void-ranger's end-on gun and mage-walker's cast at the frame's edge are as far from the code as recorded, no further;
//   7. shield-trooper's energy shield at each of the 15 Size steps (looks 'shield=energy & shieldSize=<v>' of the record): the
//      frame and the scan line's colour are each as far from the code as recorded per clip, no further and not clearly nearer.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { Surface } from '../../engine/surface.js';
import { steps } from '../../engine/fx.js';
import { drawList } from '../../engine/draw-list.js';
import { dataFrameList } from '../../engine/data-sprite.js';
import { cleanParams, defaultParams, renderPixels } from '../../engine/sprite.js';
import { col } from '../../engine/color.js';
import fs from 'node:fs';

const sprite = (id) => loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`));
const settings = (s, set = {}) => cleanParams(s, { ...defaultParams(s), ...set });

// ---- 2. the mage's twinkles ------------------------------------------------------------------------------------------

const visible = (v) => ((v >>> 24) ? v : 0);

test('mage-walker: the cast keeps its light (twinkles, star burst, ring) at every Height and Length, and never touches the frame\'s edge', async () => {
  // M7c review issue 2: from M7 to M7c every twinkle, burst and ring was left out from Height 0.55 up (and for a staff
  // from Length 1.025). tools/bake-topdown-m7.mjs --fit cast-edges now keeps each piece of the light where it fits and
  // cuts only the rows and columns that would touch the edge
  const s = await sprite('mage-walker');
  const bad = [];
  for (const weapon of ['staff', 'wand', 'orb', 'none']) for (const weaponLength of [0.65, 1, 1.35]) for (const height of [0, 0.55, 0.75, 1]) for (const build of [0, 0.5, 1]) {
    if (weapon === 'none' && weaponLength !== 1) continue;
    const p = settings(s, { weapon, weaponLength, height, build }), where = `${weapon} L${weaponLength} H${height} B${build}`;
    let sparks = 0;
    for (let f = 1; f <= 6; f++) {
      const r = dataFrameList(s, 'cast', f, p), ids = r.list.map((x) => x.id ?? '');
      sparks += ids.filter((x) => x.startsWith('castSparks-')).length;
      if (f === 4 && !ids.some((x) => x.startsWith('castBurst-'))) bad.push(`${where}: no star burst on frame 4`);
      if (f >= 5 && !ids.some((x) => x.startsWith(`castRing${f}-`))) bad.push(`${where}: no ring on frame ${f}`);
      const g = renderPixels(s, 'cast', f, p);
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if ((x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1) && (g.data[y * g.w + x] >>> 24)) { bad.push(`${where} cast:${f}: a pixel on the frame's edge at ${x},${y}`); y = g.h; break; }
    }
    // the code's twinkles are 28 runs over frames 1 to 4; those that would reach the edge are left out (5 of them with
    // a staff at Length 1.35 and Height 1, the most)
    if (sparks < 23) bad.push(`${where}: ${sparks} twinkles over frames 1 to 4 (the code draws 28)`);
  }
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} problems`);
});


// ---- 3 to 6. what the code sprites did, from the recorded frames ----------------------------------------------------------

/** Pixels of a clip that differ between two settings of one sprite. */
function selfDiff(a, pa, pb, clip) {
  let n = 0;
  for (let f = 0; f < a.clips[clip].frames; f++) {
    const x = renderPixels(a, clip, f, pa).data, y = renderPixels(a, clip, f, pb).data;
    for (let i = 0; i < x.length; i++) if (((x[i] >>> 24) ? x[i] : 0) !== ((y[i] >>> 24) ? y[i] : 0)) n++;
  }
  return n;
}
/** Pixels of a clip that differ between two recorded looks of the code sprite. */
function codeSelfDiff(rec, lookA, lookB, clip) {
  let n = 0;
  for (let f = 0; f < rec.clips[clip]; f++) {
    const x = rec.frame(lookA, clip, f), y = rec.frame(lookB, clip, f);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++;
  }
  return n;
}
/** How far under its recorded count a look may fall before the record must come down (as m7-topdown-pixels: 5 % and 8). */
const SLACK = (n) => Math.ceil(n * 0.05) + 8;
/** The look of the recorded frames that sets these (as tests/helpers/code-frames.mjs reads it). */
const lookOf = (set) => Object.entries(set).map(([k, v]) => `${k}=${v}`).join(' & ');
