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
import { sparkles, steps } from '../../engine/fx.js';
import { drawList } from '../../engine/draw-list.js';
import { dataFrameList } from '../../engine/data-sprite.js';
import { cleanParams, defaultParams, renderPixels } from '../../engine/sprite.js';
import { col } from '../../engine/color.js';
import fs from 'node:fs';
import { codeFrames, framesDiff } from '../helpers/code-frames.mjs';

const sprite = (id) => loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`));
const settings = (s, set = {}) => cleanParams(s, { ...defaultParams(s), ...set });

// ---- 2. the mage's twinkles ------------------------------------------------------------------------------------------

/** The code mage's cast twinkles at frame f in glow colour `glow`: 'dx,dy' -> colour (a Surface value) from the light's centre pixel. */
function codeTwinkles(f, frames, glow) {
  const t = f / (frames - 1), C = steps(glow), g = new Surface(64, 64), x = 32.5, y = 32.5, out = new Map();
  if (!(t < 0.6)) return out;
  sparkles(g, { t: t * 1.5, count: 5, seed: 3, big: false, area: [x - 9, y - 9, x + 10, y + 10], colours: C });
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { const v = g.data[j * 64 + i]; if (v >>> 24) out.set(`${i - 32},${j - 32}`, v); }
  return out;
}
const visible = (v) => ((v >>> 24) ? v : 0);

test('mage-walker: the cast\'s twinkles are the code\'s pixels in the finished frame, colours and all, with every weapon, Length and Height', async () => {
  // drawn as they render: the whole frame list, and again without the twinkles; the pixels that differ are the
  // twinkles as seen. Each must be a pixel of the code's twinkles in the code's colour (a glow rim, a wrong paint or a
  // misplaced twinkle fails), and each pixel of the code's must be there, but where the twinkle it belongs to would
  // reach a row or column of the frame's edge (left out whole: the data may not touch the edge, the code clips it)
  const s = await sprite('mage-walker');
  const bad = [];
  let frames = 0, seen = 0;
  for (const glow of ['#4fd8ee', '#e8662c']) for (const weapon of ['staff', 'wand', 'orb', 'none']) for (const weaponLength of [0.65, 1, 1.35]) for (const height of [0, 0.5, 1]) {
    if (weapon === 'none' && weaponLength !== 1) continue;
    const p = settings(s, { weapon, weaponLength, height, glow });
    for (let f = 1; f <= 4; f++) {
      const want = codeTwinkles(f, s.clips.cast.frames, glow);
      if (!want.size) continue;
      const r = dataFrameList(s, 'cast', f, p), where = `${glow} ${weapon} L${weaponLength} H${height} cast:${f}`;
      frames++;
      // the light's centre pixel: the glow stamp's point (anchored at its centre, an odd size: the pixel it falls in)
      const light = r.list.find((x) => x.kind === 'stamp' && /^castGlow/.test(x.id));
      if (!light) { bad.push(`${where}: no light`); continue; }
      const cx = Math.floor(light.at[0]), cy = Math.floor(light.at[1]);
      const all = new Surface(s.size[0], s.size[1]), none = new Surface(s.size[0], s.size[1]);
      drawList(all, r.list, { palette: r.palette });
      drawList(none, r.list.filter((x) => !/^castSparks-/.test(x.id ?? '')), { palette: r.palette });
      const W = all.w, H = all.h;
      for (let i = 0; i < all.data.length; i++) {
        const a = visible(all.data[i]);
        if (a === visible(none.data[i])) continue;
        seen++;
        const key = `${(i % W) - cx},${Math.floor(i / W) - cy}`;
        if (!want.has(key)) bad.push(`${where}: a twinkle pixel at ${key} the code has not`);
        else if (want.get(key) !== a) bad.push(`${where}: the twinkle pixel at ${key} is ${(a & 0xffffff).toString(16)}, the code's ${(want.get(key) & 0xffffff).toString(16)}`);
      }
      for (const [key, v] of want) {
        const [dx, dy] = key.split(',').map(Number), x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (visible(all.data[y * W + x]) === v) continue;
        // left out only when its twinkle (the code's pixels joined to it) reaches the edge, or the row or column next
        // to it (the fit leaves a twinkle out where it would touch the edge at any Build: Build 0 lifts the light a row)
        const near = [...want.keys()].map((k) => k.split(',').map(Number)).filter(([a, b]) => Math.abs(a - dx) + Math.abs(b - dy) <= 2).map(([a, b]) => [cx + a, cy + b]);
        if (near.some(([a, b]) => a <= 1 || b <= 1 || a >= W - 2 || b >= H - 2)) continue;
        bad.push(`${where}: the code's twinkle pixel at ${key} is missing`);
      }
    }
  }
  assert.ok(frames >= 150 && seen > 2000, `${frames} frames, ${seen} twinkle pixels`);
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} problems`);
});

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
/** The measurements of tests/fixtures/m7-topdown-gaps.json: what the redraws still draw unlike the code, and how far. */
const GAPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm7-topdown-gaps.json'), 'utf8'));
/** How far under its recorded count a look may fall before the record must come down (as m7-topdown-pixels: 5 % and 8). */
const SLACK = (n) => Math.ceil(n * 0.05) + 8;
/** The look of the recorded frames that sets these (as tests/helpers/code-frames.mjs reads it). */
const lookOf = (set) => Object.entries(set).map(([k, v]) => `${k}=${v}`).join(' & ');

test('village-elder: in talk the free hand is up beside the chin, as the code\'s, so the talk is nearer the code than on version 1 of the walker', async () => {
  const data = await sprite('village-elder'), rec = codeFrames('village-elder');
  // measured on version 1 (the hand at the belt): 854 pixels off the code over the clip at the defaults
  const off = framesDiff(rec, data, '', 'talk');
  assert.ok(off <= 760, `talk is ${off} pixels off the code (854 on version 1)`);
  // the hand: the highest skin pixel right of the beard, frame by frame, within a row of the code's
  const p = settings(data), skin = col(p.skin);
  for (let f = 0; f < 8; f++) {
    const [W, H] = rec.size, top = (g) => { for (let y = 0; y < H; y++) for (let x = 30; x < W; x++) if (g[y * W + x] && (g[y * W + x] & 0xffffff) === (skin & 0xffffff)) return y; return null; };
    const a = top(rec.frame('', 'talk', f)), g = renderPixels(data, 'talk', f, p), b = top(g.data);
    assert.ok(a !== null && b !== null && Math.abs(a - b) <= 1, `talk:${f}: the free hand's top row is ${b} in the data, ${a} in the code`);
  }
});

test('merchant: talk and wave move with Bounce as the code\'s do (the hanging hand a pixel lower from 0.6), and come nearer the code there', async () => {
  const data = await sprite('merchant'), rec = codeFrames('merchant');
  // without the travel, at Bounce 1 (talk, wave x none, coin purse, scale): 1998 2174 2272 2598 2774 2850 pixels off
  const before = { talk: [1998, 2174, 2272], wave: [2598, 2774, 2850] };
  for (const clip of ['talk', 'wave']) ['none', 'coin purse', 'scale'].forEach((held, i) => {
    const look = lookOf({ held, bounce: 1 }), pd = settings(data, { held, bounce: 1 });
    const moves = selfDiff(data, settings(data, { held }), pd, clip), codeMoves = codeSelfDiff(rec, lookOf({ held }), look, clip);
    assert.ok(codeMoves > 0 && moves > 0, `${clip} ${held}: the code moves ${codeMoves} pixels at Bounce 1, the data ${moves}`);
    const off = framesDiff(rec, data, look, clip, pd);
    assert.ok(off < before[clip][i], `${clip} ${held} at Bounce 1: ${off} pixels off the code, ${before[clip][i]} before`);
  });
});

test('town-guard: the side clips move the figure sideways with the pole\'s Length as the code does, each look at its recorded count; the pike\'s cap is as recorded', async () => {
  const data = await sprite('town-guard'), rec = codeFrames('town-guard');
  const bad = [];
  for (const g of GAPS.shift.looks) for (const clip of ['idle_side', 'walk_side']) {
    const look = { weapon: g.weapon, weaponLength: g.weaponLength }, [, now] = g[clip];
    const off = framesDiff(rec, data, lookOf(look), clip, settings(data, look));
    if (off > now) bad.push(`${clip} ${JSON.stringify(look)}: ${off} pixels off the code, over the ${now} recorded`);
    if (off < now - SLACK(now)) bad.push(`${clip} ${JSON.stringify(look)}: ${off} pixels off the code, well under the ${now} recorded: lower the record`);
  }
  assert.deepEqual(bad, []);
  // the move: the halberd's shortest and longest come far nearer the code than before it
  const total = (i) => GAPS.shift.looks.filter((g) => g.weapon === 'halberd').reduce((a, g) => a + g.idle_side[i] + g.walk_side[i], 0);
  assert.ok(total(1) < total(0) * 0.6, `the halberd's side clips: ${total(1)} pixels off the code, ${total(0)} before`);
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'town-guard.json'), 'utf8'));
  const pike = def.body.rig.shapes.find((x) => x.id === 'pike').args.length.map;
  assert.deepEqual(pike.at(-2), [GAPS.pike.capAt, GAPS.pike.dataPx]);
  assert.deepEqual(pike.at(-1), [1.35, GAPS.pike.dataPx]);
});

test('void-ranger\'s end-on gun and mage-walker\'s cast at the frame\'s edge are as far from the code as recorded in tests/fixtures/m7-topdown-gaps.json, no further', async () => {
  const bad = [];
  const ranger = await sprite('void-ranger'), rrec = codeFrames('void-ranger');
  for (const [weapon, recorded] of Object.entries(GAPS.rangerEndOn.shootDown04)) {
    const look = lookOf({ weapon }), p = settings(ranger, { weapon });
    let n = 0;
    for (let f = 0; f <= 4; f++) {
      const x = rrec.frame(look, 'shoot_down', f), y = renderPixels(ranger, 'shoot_down', f, p).data;
      for (let i = 0; i < x.length; i++) if (x[i] !== ((y[i] >>> 24) ? y[i] >>> 0 : 0)) n++;
    }
    if (n > recorded || n < recorded - SLACK(recorded)) bad.push(`void-ranger ${weapon} shoot_down 0 to 4: ${n} pixels off the code, ${recorded} recorded`);
  }
  const mage = await sprite('mage-walker'), mrec = codeFrames('mage-walker');
  for (const { set, cast } of GAPS.mageCast.looks) {
    const n = framesDiff(mrec, mage, lookOf(set), 'cast', settings(mage, set));
    if (n > cast[1] || n < cast[1] - SLACK(cast[1])) bad.push(`mage-walker cast ${JSON.stringify(set)}: ${n} pixels off the code, ${cast[1]} recorded`);
  }
  assert.deepEqual(bad, []);
});

test('shield-trooper: the energy shield and its scan line are as far from the code as recorded at every Size step, in every clip but die, no further', async () => {
  // The line climbs the pane in the colour D.cream (rigs/topdown-riot.js lightPane: the row round(y1 - 1 - fract(t) * (h - 1)));
  // the data holds its rows in 5 bands of Size and its pane per band (tests/fixtures/m7-topdown-gaps.json, shieldScan).
  // Counted per Size and clip: pixels of the frame unlike the code's, and pixels where only one of the two is in the line's
  // colour. The record is of the energy shield at that Size, every other setting at its default (m7-topdown-pixels sees
  // Size 1 only). A line a row off in a band, a pane drawn a step too small or a line lost fails with the Size and clip.
  const data = await sprite('shield-trooper'), rec = codeFrames('shield-trooper'), CREAM = col('#f0ead8') >>> 0;
  const size = data.params.shieldSize, steps = [];
  for (let v = size.min; v <= size.max + 1e-9; v += size.step) steps.push(String(Math.round(v * 100) / 100));
  const measured = {}, bad = [];
  for (const v of steps) {
    const look = v === '1' ? 'shield=energy' : `shield=energy & shieldSize=${v}`, p = settings(data, { shield: 'energy', shieldSize: Number(v) });
    measured[v] = {};
    let lineSeen = 0;
    for (const clip of Object.keys(rec.clips)) {
      if (clip === 'die') continue;
      assert.ok(rec.has(look, clip), `the record has no frames of ${look} ${clip}`);
      let frame = 0, scan = 0, codeScan = 0;
      for (let f = 0; f < rec.clips[clip]; f++) {
        const a = rec.frame(look, clip, f), b = renderPixels(data, clip, f, p).data;
        for (let i = 0; i < a.length; i++) {
          const g = (b[i] >>> 24) ? b[i] >>> 0 : 0;
          if (a[i] !== g) frame++;
          if ((a[i] === CREAM) !== (g === CREAM)) scan++;
          if (a[i] === CREAM) codeScan++;
        }
      }
      measured[v][clip] = [frame, scan];
      lineSeen += codeScan;
    }
    // the line is there to be compared: the code draws it over the clips (facing up, the body hides most of it)
    assert.ok(lineSeen > 150, `${look}: the code draws ${lineSeen} pixels in the line's colour over its clips`);
  }
  if (process.env.M7_SCAN === 'record') console.log('"sizes": {\n' + Object.entries(measured).map(([v, c]) => `    ${JSON.stringify(v)}: { ${Object.entries(c).map(([k, n]) => `${JSON.stringify(k)}: ${JSON.stringify(n)}`).join(', ')} }`).join(',\n') + '\n  }');
  assert.deepEqual(Object.keys(GAPS.shieldScan.sizes).sort((x, y) => x - y), steps, 'the recorded Sizes are the control\'s steps');
  for (const v of steps) for (const [clip, [frame, scan]] of Object.entries(measured[v])) {
    const rec = GAPS.shieldScan.sizes[v][clip];
    if (!rec) { bad.push(`Size ${v} ${clip}: nothing recorded`); continue; }
    const [wf, ws] = rec, at = `energy shield at Size ${v} ${clip}`;
    if (scan > ws) bad.push(`${at}: ${scan} pixels of the scan line's colour unlike the code's, over the ${ws} recorded`);
    if (frame > wf) bad.push(`${at}: ${frame} pixels of the frame unlike the code's, over the ${wf} recorded`);
    if (scan < ws - SLACK(ws) || frame < wf - SLACK(wf)) bad.push(`${at}: ${scan} scan-line and ${frame} frame pixels off the code, well under the ${ws} and ${wf} recorded: lower the record`);
  }
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} problems`);
});
