// What the third review of M7b found the nine top-down redraws still draw unlike their code sprites, beside the held
// things (m7-topdown-held), each held here against the code (M7c):
//   1. shield-trooper's energy shield: the bright line that climbs the pane (rigs/topdown-riot.js lightPane `scan`: the
//      row round(y1 - 1 - fract(t) * (h - 1)) in the `core` colour, t the frame's phase). part:topdown-body-shield@2's
//      light stamps hold it at t = 0 only, so the data's line sat on the bottom row in every frame. The sprite now has,
//      for each set of the shield (carried facing down, facing up, from the side, planted in block) and each phase its
//      clips reach, a hidden line on the shield's node, its row and ends bound to the Size step, and for each set lines
//      that give the bottom row its pane colour back; its frame edits show them on the frames of that phase. (A use of a
//      piece per phase would be lighter to write, but a sprite may use pieces 24 times, and the trooper uses 23.) Held
//      here: the light, line and all, drawn alone, is the code's light at every frame of every clip but die;
//   2. mage-walker's cast: the twinkles (engine/fx.js sparkles round the light, upright on screen) were dots placed as
//      screen offsets but in the reachF bone's frame, so the bone's turn (about 160 to 175 degrees) threw them onto the
//      hat brim and beside the staff. They are now the code's pixels, as glowing 1 px lines on the bone with its turn at
//      that frame taken out (M7c review: no dots, which a glow rims in a darker tone), held in the finished frame, colours
//      and all; and the cast keeps its light at every Height and Length (tools/bake-topdown-m7.mjs --fit cast-edges);
//   3. village-elder's talk: the free hand comes right up as he speaks (the code elder's manner: P.armB.u += 2.5,
//      P.armB.o += 2). A sprite's own keys cannot swap the base's stamps (mouth, eyes, boots), so the raised talk is
//      base:person-topdown-walker@2's (tools/bake-topdown-m7.mjs walkerV2; version 1 stays for B16b's fixture);
//   4. merchant's talk and wave follow Bounce as the code's do: at Bounce 0.6 and up the code's idle pose breathes two
//      rows deep, so a gesture (which starts from it at t = 0) hangs the other hand a pixel lower; the data's travel moves
//      the hanging arm by Bounce (fitted to the code's pixels: every look nearer the code than without it);
//   5. town-guard's side clips: the code moves the whole figure sideways to fit a long pole (rigs/topdown.js fit); the
//      data now scales its pole side clips' root move by Length (and by 0.6 for the spear), fitted to the code's pixels.
//      What is left (the spear at Length 1.15 a little further from the code than before; block not moved; the pike
//      stopping at Length 1.15) is measured in tests/fixtures/m7-topdown-gaps.json and held to it;
//   6. tools/bake-topdown-m7.mjs writes no replaced version (its REPLACED list);
//   7. shield-trooper's held thing points where the code holds it: a baton raised (base:person-topdown-trooper@3's
//      *-baton clips), a gun at the hip (M7c review issue 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { codeSprite } from '../helpers/library.mjs';
import * as T from '../../rigs/topdown.js';
import * as R from '../../rigs/topdown-riot.js';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { sparkles, steps } from '../../engine/fx.js';
import { drawList } from '../../engine/draw-list.js';
import { dataFrameList } from '../../engine/data-sprite.js';
import { cleanParams, defaultParams, renderPixels } from '../../engine/sprite.js';
import { restPose, pieceText } from '../../tools/bake-topdown.mjs';

const PIECES = path.join(ROOT, 'pieces');
const read = (f) => fs.readFileSync(path.join(PIECES, f), 'utf8');
const r5 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const sprite = (id) => loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`));
const settings = (s, set = {}) => cleanParams(s, { ...defaultParams(s), ...set });

// ---- 1. the energy shield's climbing line ----------------------------------------------------------------------------

/** The body shield's size steps (each light stamp of part:topdown-body-shield@2 holds one, shown by a threshold at the midpoints). */
const SIZE_STEPS = [0.65, 0.825, 1, 1.175, 1.35];
const snapHalf = (p) => [Math.floor(p[0]) + 0.5, Math.floor(p[1]) + 0.5];
/** The rest pose a direction's light stamps were read at, and the node they hang on (the root facing down or up, cuffB from the side). */
function shieldRest(dir) { const { J, P, d } = restPose(dir); return { J, P, d, node: dir === 'side' ? snapHalf(J.armB.hand) : [J.bx, J.gy] }; }
/** The sprite with two probe dots on each of these nodes (u 0 and u 8), loaded from a copy outside sprites/. */
async function probed(id, bones) {
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));
  for (const b of bones) for (const [k, u] of [[0, 0], [1, 8]]) def.body.rig.shapes.push({ id: `probe${k}-${b}`, kind: 'dot', on: b, at: [u, 0], paint: 'ink', z: 99 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm7-scan-')), f = path.join(dir, `${id}.json`);
  fs.writeFileSync(f, JSON.stringify(def));
  try { return await loadDataSprite(ROOT, f); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
/** z of the body shield's light stamps in the sprite (a use at z 50: 31 facing down and from the side, -45 facing up). */
const LIGHT_Z = { down: 81, side: 81, up: 5 };

test('shield-trooper: the energy shield\'s light, the climbing line with it, is the code\'s at every frame of every clip but die, at each size step', async () => {
  const nodes = { shield: 'shieldCarryAt', shieldPlanted: 'shieldPlantAt', shieldSide: 'cuffB' };
  const s = await probed('shield-trooper', Object.values(nodes)), bad = [];
  let checked = 0, climbing = 0;
  for (const shieldSize of SIZE_STEPS) {
    const p = settings(s, { shield: 'energy', shieldSize });
    for (const clip of Object.keys(s.clips)) {
      if (clip === 'die') continue;
      const dir = clip.endsWith('_up') ? 'up' : clip.endsWith('_side') ? 'side' : 'down', c = s.clips[clip];
      for (let f = 0; f < c.frames; f++) {
        const r = dataFrameList(s, clip, f, p), t = c.loop ? f / c.frames : f / (c.frames - 1);
        const use = Object.keys(nodes).find((n) => r.list.some((x) => x.id === n && x.z === LIGHT_Z[dir]));
        if (!use) continue;
        // the data: the light stamp of the shield in use and the scan lines, alone; the code: its light at the rest pose
        // the stamps were read at, moved as the node moved
        const g = new Surface(s.size[0], s.size[1]);
        drawList(g, r.list.filter((x) => (x.id === use && x.z === LIGHT_Z[dir]) || /^scan(-|P-)/.test(x.id)), { palette: r.palette });
        const a = r.list.find((x) => x.id === `probe0-${nodes[use]}`), { J, P, d, node } = shieldRest(dir);
        const dx = Math.round(a.at[0] - node[0]), dy = Math.round(a.at[1] - node[1]);
        const k = new Surface(s.size[0], s.size[1]), pal = (slot) => (typeof r.palette[slot] === 'string' ? r.palette[slot] : r.palette[slot].hex);
        R.bodyShield(k, J, P, d, { kind: 'energy', size: shieldSize, layer: 'light', colour: pal('outfit'), glow: pal('glow'), inset: pal('trim'), core: pal('core'), t });
        let diff = 0;
        for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
          const X = x - dx, Y = y - dy, want = X >= 0 && Y >= 0 && X < k.w && Y < k.h ? k.data[Y * k.w + X] : 0, got = g.data[y * g.w + x];
          const near = (u, v) => Math.abs((u & 255) - (v & 255)) + Math.abs(((u >> 8) & 255) - ((v >> 8) & 255)) + Math.abs(((u >> 16) & 255) - ((v >> 16) & 255)) <= 60;
          if (!(want >>> 24) !== !(got >>> 24) || ((want >>> 24) && !near(want, got))) diff++;
        }
        checked++;
        if (t % 1) climbing++;
        if (diff) bad.push(`Size ${shieldSize} ${clip}:${f} (${use}): ${diff} pixels of the light differ from the code's`);
        if (diff && process.env.M7_DEBUG) { const rows = []; for (let y = 0; y < g.h; y++) { let l = '', m = ''; for (let x = 16; x < 44; x++) { const X = x - dx, Y = y - dy, w = X >= 0 && Y >= 0 && X < k.w && Y < k.h ? k.data[Y * k.w + X] : 0, v = g.data[y * g.w + x]; const ch = (u) => (u >>> 24 ? '0123456789abcdef'[(u & 0xf0) >> 4] : '.'); l += ch(v); m += ch(w); } if (/[^.]/.test(l + m)) rows.push(`${String(y).padStart(2)} ${l}  ${m}`); } console.log(bad.at(-1) + '\n' + rows.join('\n')); }
      }
    }
  }
  assert.ok(checked > 200 && climbing > 150, `${checked} frames checked, ${climbing} with the line off the bottom`);
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} frames`);
});

test('shield-trooper: tools/bake-topdown-m7.mjs fitShieldScan makes the scan lines and their frame edits in the file', async () => {
  const { fitShieldScan } = await import('../../tools/bake-topdown-m7.mjs');
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'shield-trooper.json'), 'utf8'));
  assert.equal(JSON.stringify(fitShieldScan(def)), JSON.stringify(def));
});

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

test('mage-walker: tools/bake-topdown-m7.mjs fitMageTwinkles makes the twinkles in the file (as glowing 1 px lines, no dots)', async () => {
  const { fitMageTwinkles } = await import('../../tools/bake-topdown-m7.mjs');
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'mage-walker.json'), 'utf8'));
  const strip = (d) => d.body.rig.shapes.filter((x) => x.id.startsWith('castSparks-')).map(({ when, ...x }) => (void when, x));
  const made = await fitMageTwinkles(def);
  assert.deepEqual(strip(made), strip(def));
  assert.ok(strip(def).every((x) => x.kind === 'line' && x.glow === true), 'every twinkle is a glowing line');
  assert.equal(JSON.stringify(made.clips.cast.frameEdits), JSON.stringify(def.clips.cast.frameEdits));
});

// ---- 3 and 4. the elder's raised hand, the merchant's Bounce ---------------------------------------------------------

test('base:person-topdown-walker@2 is tools/bake-topdown-m7.mjs walkerV2, and the elder talks on it', async () => {
  const { walkerV2 } = await import('../../tools/bake-topdown-m7.mjs');
  assert.equal(read('base-person-topdown-walker.v2.json'), pieceText(await walkerV2()));
  const v1 = JSON.parse(read('base-person-topdown-walker.v1.json')), v2 = JSON.parse(read('base-person-topdown-walker.v2.json'));
  // the same rig and clips but talk
  assert.deepEqual(v2.body.rig, v1.body.rig);
  for (const c of Object.keys(v1.body.clips)) if (c !== 'talk') assert.deepEqual(v2.body.clips[c], v1.body.clips[c], c);
  assert.notDeepEqual(v2.body.clips.talk.keys, v1.body.clips.talk.keys);
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'village-elder.json'), 'utf8'));
  assert.deepEqual([def.body.rig.extends.use, def.body.rig.extends.v], ['base:person-topdown-walker', 2]);
});

/** Pixels of a clip that differ between two settings of one sprite, or between two sprites at their settings. */
function clipDiff(a, pa, b, pb, clip) {
  let n = 0;
  for (let f = 0; f < a.clips[clip].frames; f++) {
    const x = renderPixels(a, clip, f, pa).data, y = renderPixels(b, clip, f, pb).data;
    for (let i = 0; i < x.length; i++) if (((x[i] >>> 24) ? x[i] : 0) !== ((y[i] >>> 24) ? y[i] : 0)) n++;
  }
  return n;
}

test('village-elder: in talk the free hand is up beside the chin, as the code\'s, so the talk is nearer the code than on version 1 of the walker', async () => {
  const data = await sprite('village-elder'), code = await codeSprite('village-elder');
  // measured on version 1 (the hand at the belt): 854 pixels off the code over the clip at the defaults
  const off = clipDiff(code, settings(code), data, settings(data), 'talk');
  assert.ok(off <= 760, `talk is ${off} pixels off the code (854 on version 1)`);
  // the hand: the highest skin pixel right of the beard, frame by frame, within a row of the code's
  for (let f = 0; f < 8; f++) {
    const hand = (s, p) => { const g = renderPixels(s, 'talk', f, p), skin = col(p.skin); for (let y = 0; y < g.h; y++) for (let x = 30; x < g.w; x++) if ((g.data[y * g.w + x] & 0xffffff) === (skin & 0xffffff) && (g.data[y * g.w + x] >>> 24)) return y; return null; };
    const a = hand(code, settings(code)), b = hand(data, settings(data));
    assert.ok(a !== null && b !== null && Math.abs(a - b) <= 1, `talk:${f}: the free hand's top row is ${b} in the data, ${a} in the code`);
  }
});

test('merchant: talk and wave move with Bounce as the code\'s do (the hanging hand a pixel lower from 0.6), and come nearer the code there', async () => {
  const data = await sprite('merchant'), code = await codeSprite('merchant');
  // without the travel, at Bounce 1 (talk, wave x none, coin purse, scale): 1998 2174 2272 2598 2774 2850 pixels off
  const before = { talk: [1998, 2174, 2272], wave: [2598, 2774, 2850] };
  for (const clip of ['talk', 'wave']) ['none', 'coin purse', 'scale'].forEach((held, i) => {
    const pd = settings(data, { held, bounce: 1 }), pc = settings(code, { held, bounce: 1 });
    const moves = clipDiff(data, settings(data, { held }), data, pd, clip), codeMoves = clipDiff(code, settings(code, { held }), code, pc, clip);
    assert.ok(codeMoves > 0 && moves > 0, `${clip} ${held}: the code moves ${codeMoves} pixels at Bounce 1, the data ${moves}`);
    const off = clipDiff(code, pc, data, pd, clip);
    assert.ok(off < before[clip][i], `${clip} ${held} at Bounce 1: ${off} pixels off the code, ${before[clip][i]} before`);
  });
});

// ---- 5. town-guard's side clips ----------------------------------------------------------------------------------------

/** The measurements of tests/fixtures/m7-topdown-gaps.json: what the guard's side clips still draw unlike the code, and how far. */
const GAPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm7-topdown-gaps.json'), 'utf8'));
/** How far under its recorded count a look may fall before the record must come down (as m7-topdown-pixels: 5 % and 8). */
const SLACK = (n) => Math.ceil(n * 0.05) + 8;

test('town-guard: the side clips move the figure sideways with the pole\'s Length as the code does, each look at its recorded count; the pike\'s cap is as recorded', async () => {
  const data = await sprite('town-guard'), code = await codeSprite('town-guard');
  const bad = [];
  for (const g of GAPS.shift.looks) for (const clip of ['idle_side', 'walk_side']) {
    const look = { weapon: g.weapon, weaponLength: g.weaponLength }, [before, now] = g[clip];
    const off = clipDiff(code, settings(code, look), data, settings(data, look), clip);
    if (off > now) bad.push(`${clip} ${JSON.stringify(look)}: ${off} pixels off the code, over the ${now} recorded`);
    if (off < now - SLACK(now)) bad.push(`${clip} ${JSON.stringify(look)}: ${off} pixels off the code, well under the ${now} recorded: lower the record`);
    void before;
  }
  assert.deepEqual(bad, []);
  // the move: the halberd's shortest and longest come far nearer the code than before it
  const total = (i) => GAPS.shift.looks.filter((g) => g.weapon === 'halberd').reduce((a, g) => a + g.idle_side[i] + g.walk_side[i], 0);
  assert.ok(total(1) < total(0) * 0.6, `the halberd's side clips: ${total(1)} pixels off the code, ${total(0)} before`);
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'town-guard.json'), 'utf8'));
  const pike = def.body.rig.shapes.find((x) => x.id === 'pike').args.length.map;
  assert.deepEqual(pike.at(-2), [GAPS.pike.capAt, GAPS.pike.dataPx]);
  assert.deepEqual(pike.at(-1), [1.35, GAPS.pike.dataPx]);
  assert.equal(r5(T.townItemSize('pike', 1.35).length), r5(GAPS.pike.codePxAt135));
});

// ---- 7. the trooper's weapon points where the code's does --------------------------------------------------------------

test('shield-trooper: the held thing\'s bone points where the code holds it, for every weapon, at every frame of every clip (a baton raised, a gun at the hip)', async () => {
  // M7c review issue 3: rigs/topdown-riot.js shieldFrame carries a baton 'up' and a gun 'ready'; the sprite took every
  // clip but the jab from the gun's, so its baton hung tip down. m7-topdown-held draws the code at the data's own bone,
  // blind to a bone pointing the wrong way: here the bone (two probe dots on reachF) is held to the code's P.item
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'shield-trooper.json'), 'utf8'));
  for (const [k, u] of [[0, 0], [1, 8]]) def.body.rig.shapes.push({ id: `probe${k}`, kind: 'dot', on: 'reachF', at: [u, 0], paint: 'ink', z: 99 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm7-carry-')), f0 = path.join(dir, 'shield-trooper.json');
  fs.writeFileSync(f0, JSON.stringify(def));
  let s;
  try { s = await loadDataSprite(ROOT, f0); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const code = (clip) => (clip === 'block' ? 'block_down' : clip.replace(/^shoot_(down|up|side)$/, 'shoot_$1'));
  const rise = T.visorHelmetRise(1), bad = [];
  let frames = 0;
  for (const weapon of ['rifle', 'pistol', 'baton']) {
    const p = settings(s, { weapon });
    for (const clip of Object.keys(s.clips)) {
      const c = s.clips[clip], std = T.STANDARD[T.parseClip(code(clip)).action];
      for (let f = 0; f < c.frames; f++) {
        const t = std.loop ? f / c.frames : f / (c.frames - 1);
        const F = R.shieldFrame(code(clip), t, {}, { item: R.riotItemSize(weapon, 1), shield: { kind: 'riot', size: 1 }, rise });
        if (F.P.lie || F.P.tilt) continue;      // die once the body tips over: the held thing is let go
        const r = dataFrameList(s, clip, f, p), a = r.list.find((x) => x.id === 'probe0'), b = r.list.find((x) => x.id === 'probe1');
        const got = Math.atan2(b.at[0] - a.at[0], b.at[1] - a.at[1]), off = Math.abs(((got - F.P.item + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        frames++;
        if (off > (3 * Math.PI) / 180) bad.push(`${weapon} ${clip}:${f}: the bone points ${Math.round((got * 180) / Math.PI)} degrees, the code's ${Math.round((F.P.item * 180) / Math.PI)}`);
      }
    }
  }
  assert.ok(frames > 150, `${frames} frames`);
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} frames`);
});

test('void-ranger\'s end-on gun and mage-walker\'s cast at the frame\'s edge are as far from the code as recorded in tests/fixtures/m7-topdown-gaps.json, no further', async () => {
  const bad = [];
  const ranger = await sprite('void-ranger'), rcode = await codeSprite('void-ranger');
  for (const [weapon, rec] of Object.entries(GAPS.rangerEndOn.shootDown04)) {
    let n = 0;
    for (let f = 0; f <= 4; f++) {
      const x = renderPixels(rcode, 'shoot_down', f, settings(rcode, { weapon })).data, y = renderPixels(ranger, 'shoot_down', f, settings(ranger, { weapon })).data;
      for (let i = 0; i < x.length; i++) if (((x[i] >>> 24) ? x[i] : 0) !== ((y[i] >>> 24) ? y[i] : 0)) n++;
    }
    if (n > rec || n < rec - SLACK(rec)) bad.push(`void-ranger ${weapon} shoot_down 0 to 4: ${n} pixels off the code, ${rec} recorded`);
  }
  const mage = await sprite('mage-walker'), mcode = await codeSprite('mage-walker');
  for (const { set, cast } of GAPS.mageCast.looks) {
    const n = clipDiff(mcode, settings(mcode, set), mage, settings(mage, set), 'cast');
    if (n > cast[1] || n < cast[1] - SLACK(cast[1])) bad.push(`mage-walker cast ${JSON.stringify(set)}: ${n} pixels off the code, ${cast[1]} recorded`);
  }
  assert.deepEqual(bad, []);
});

// ---- 6. the baker writes no replaced version ---------------------------------------------------------------------------

test('tools/bake-topdown-m7.mjs --write writes no version in its REPLACED list, and every M7 version removed is in it', async () => {
  const { REPLACED } = await import('../../tools/bake-topdown-m7.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm7-bake-'));
  try {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'bake-topdown-m7.mjs'), '--write', dir], { encoding: 'utf8', timeout: 300000 });
    assert.equal(r.status, 0, r.stderr);
    const written = fs.readdirSync(dir).map((f) => { const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return `${p.id}@${p.v}`; });
    assert.deepEqual(written.filter((ref) => REPLACED[ref]), []);
    // what it still writes is on disk (nothing else it makes is missing from pieces/)
    const onDisk = new Set(fs.readdirSync(PIECES).filter((f) => /\.v\d+\.json$/.test(f)).map((f) => { const p = JSON.parse(read(f)); return `${p.id}@${p.v}`; }));
    assert.deepEqual(written.filter((ref) => !onDisk.has(ref)), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
