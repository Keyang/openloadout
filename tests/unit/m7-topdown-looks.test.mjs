// What the review of migration batch M7 found the nine top-down redraws had lost, held in place (docs/data-sprites.md
// section 7; library-redraws.test.mjs checks only their interface and the quality bar): the worn things of a dying
// character lie down with it (part pieces at version 2, `pose`), the light the code sprites drew after the outline is
// drawn (the slash, the muzzle flare, the dodge streaks, the mage's orb and cast), the rogue's scarf whips out in the
// run, and the child's Head slider changes the head.
//
// Second review of M7 (issues 7 and 8): counting colours did not hold either claim. The light test passed with every
// `glow: true` turned off (the outline then wraps the slash, the flare and the orb), and the die test passed with a
// helmet drawn anywhere in the frame. So the light is also drawn with `glow` off and must change, and in every turned
// die frame the worn things' colours are held to where the code sprite draws them (tests/fixtures/code-sprites/).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { cleanParams, defaultParams, renderFrame } from '../../engine/sprite.js';
import { codeSprite } from '../helpers/library.mjs';

const sprites = new Map();
async function sprite(id) {
  if (!sprites.has(id)) sprites.set(id, await loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`)));
  return sprites.get(id);
}
const hexOf = (v) => `#${[v & 255, (v >> 8) & 255, (v >> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
/** How many pixels of a frame are exactly one of these colours ('#rrggbb'). */
async function count(id, clip, frame, colours, set = {}) {
  const s = await sprite(id), p = cleanParams(s, { ...defaultParams(s), ...set });
  const g = renderFrame(s, clip, frame, p), want = new Set(colours.map((c) => c.toLowerCase()));
  let n = 0;
  for (const v of g.data) if (v >>> 24 && want.has(hexOf(v))) n++;
  return n;
}
const differ = async (id, a, b) => {
  const s = await sprite(id), ga = renderFrame(s, a[0], a[1], cleanParams(s, { ...defaultParams(s), ...(a[2] ?? {}) })), gb = renderFrame(s, b[0], b[1], cleanParams(s, { ...defaultParams(s), ...(b[2] ?? {}) }));
  let n = 0;
  for (let i = 0; i < ga.data.length; i++) if (ga.data[i] !== gb.data[i]) n++;
  return n;
};
const DIE_LYING = [2, 3, 4, 5, 6, 7];

test('a dying character keeps its headgear and hair on in every die frame (worn pieces at version 2, pose f2, f3, lie)', async () => {
  for (const f of DIE_LYING) {
    // the hero's helmet (its metal, #c2c9d6) and red plume, then with no headgear its hair (#9a6a3e)
    assert.ok(await count('hero-walker', 'die', f, ['#c2c9d6']) >= 8, `hero-walker die ${f}: the helmet shows`);
    assert.ok(await count('hero-walker', 'die', f, ['#9a6a3e'], { headgear: 'none', hairStyle: 'long' }) >= 8, `hero-walker die ${f}: long hair shows with no headgear`);
    // the ranger's visor helmet (its visor in the glow colour, #5fe0f0) and the trooper's lens mask (its glow lenses, #e2473f)
    assert.ok(await count('void-ranger', 'die', f, ['#5fe0f0']) >= 3, `void-ranger die ${f}: the visor shows`);
    assert.ok(await count('shield-trooper', 'die', f, ['#e2473f'], { headgear: 'mask' }) >= 1, `shield-trooper die ${f}: the mask's lenses show`);
  }
});

test('the light the code sprites drew after the outline is drawn: slash, muzzle flare, dodge streaks, orb and cast', async () => {
  const white = ['#ffffff'];
  for (const dir of ['down', 'side']) assert.ok(await count('hero-walker', `attack_${dir}`, 4, white) >= 10, `hero-walker attack_${dir} 4: the slash arc`);
  assert.equal(await count('hero-walker', 'attack_side', 0, white), 0, 'hero-walker attack_side 0: no arc before the swing');
  assert.ok(await count('void-ranger', 'shoot_side', 1, ['#5fe0f0', '#f0ead8']) > await count('void-ranger', 'shoot_side', 0, ['#5fe0f0', '#f0ead8']) + 4, 'void-ranger shoot_side 1: the muzzle flare');
  assert.ok(await count('shield-trooper', 'shoot_side', 1, ['#e2473f', '#f0ead8']) > await count('shield-trooper', 'shoot_side', 0, ['#e2473f', '#f0ead8']) + 4, 'shield-trooper shoot_side 1: the muzzle flare');
  assert.ok(await differ('void-ranger', ['dodge', 3], ['dodge', 3, { headgear: 'none' }]) > 0, 'void-ranger dodge draws');
  assert.ok(await count('void-ranger', 'dodge', 3, ['#5fe0f0', '#f0ead8']) > await count('void-ranger', 'dodge', 0, ['#5fe0f0', '#f0ead8']), 'void-ranger dodge 3: the streaks');
  // the mage's staff glows at rest; the cast grows it, bursts at frame 4 and opens a ring at frame 6, with an empty hand too
  // (the pixels its Glow colour reaches: the orb and every light of the cast)
  const lit = (clip, f, set = {}) => differ('mage-walker', [clip, f, set], [clip, f, { ...set, glow: '#ff5a8a' }]);
  const rest = await lit('idle_down', 0);
  assert.ok(rest >= 20, `mage-walker idle_down 0: the orb glows (${rest} px)`);
  assert.ok(await lit('cast', 4) > rest + 10, 'mage-walker cast 4: the glow has grown, with its burst');
  assert.ok(await lit('cast', 6, { weapon: 'none' }) > (await lit('cast', 0, { weapon: 'none' })) + 10, 'mage-walker cast 6 with an empty hand: the glow and the ring');
});

test("the rogue's scarf whips out behind the dash in every run frame, not hanging as at rest", async () => {
  for (const dir of ['down', 'side', 'up']) for (const f of [0, 3]) {
    assert.ok(await differ('rogue-walker', [`run_${dir}`, f], [`run_${dir}`, f, { scarf: 'none' }]) >= 12, `rogue-walker run_${dir} ${f}: the scarf shows`);
  }
  // in the run the scarf is the run frame's (scarfRun<f>), streamed out behind: more of it shows than of the tail hanging
  // at rest (measured: hanging, 17 to 20 px from the side and 36 to 37 facing down; streaming, 41 to 42 and 50 to 51)
  for (const f of [0, 2, 4, 6]) {
    assert.ok(await differ('rogue-walker', ['run_side', f], ['run_side', f, { scarf: 'none' }]) >= 30, `rogue-walker run_side ${f}: the tail streams out behind`);
    assert.ok(await differ('rogue-walker', ['run_down', f], ['run_down', f, { scarf: 'none' }]) >= 45, `rogue-walker run_down ${f}: the tail streams out to the side`);
  }
});

test("the child's Head slider changes the head, which grows from the chin up", async () => {
  assert.ok(await differ('farm-kid', ['idle_down', 0, { head: 0 }], ['idle_down', 0, { head: 1 }]) >= 30, 'farm-kid: Head small and big differ');
  const s = await sprite('farm-kid');
  const lowest = (p) => { const g = renderFrame(s, 'idle_down', 0, cleanParams(s, { ...defaultParams(s), ...p })); let top = g.h; for (let y = 0; y < g.h && top === g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x] >>> 24) { top = y; break; } return top; };
  assert.ok(lowest({ head: 1 }) < lowest({ head: 0.5 }) && lowest({ head: 0.5 }) < lowest({ head: 0 }), 'a bigger head reaches higher');
});

/** The sprite with every `glow: true` turned off: its light then drawn before the outline, as any other shape. */
async function withoutGlow(id) {
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));
  let n = 0;
  const off = (x) => { if (Array.isArray(x)) x.forEach(off); else if (x && typeof x === 'object') { if (x.glow === true) { x.glow = false; n++; } Object.values(x).forEach(off); } };
  off(def);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'm7-glow-')), `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(def));
  return { s: await loadDataSprite(ROOT, file), n };
}

test('the light is drawn after the outline: drawn before it instead, the outline wraps it and the frame changes', async () => {
  // each frame and the pixels it must change at least (measured: 15 to 74 when the light goes under the outline)
  const cases = { 'hero-walker': [['attack_side', 4], ['attack_down', 4]], 'void-ranger': [['shoot_side', 1], ['dodge', 3]], 'shield-trooper': [['shoot_side', 1]], 'mage-walker': [['idle_down', 0], ['cast', 4], ['cast', 6]] };
  for (const [id, frames] of Object.entries(cases)) {
    const s = await sprite(id), { s: flat, n } = await withoutGlow(id), p = cleanParams(s, defaultParams(s));
    assert.ok(n >= 5, `${id}: its light is drawn with glow (${n} shapes)`);
    for (const [clip, f] of frames) {
      const a = renderFrame(s, clip, f, p), b = renderFrame(flat, clip, f, p);
      let d = 0;
      for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) d++;
      assert.ok(d >= 10, `${id} ${clip} ${f}: ${d} px change when the light goes under the outline`);
    }
  }
});

/** The box of a frame's pixels in these colours ('#rrggbb'): [x0, y0, x1, y1], or null. */
function colourBox(s, clip, f, colours, set = {}) {
  const g = renderFrame(s, clip, f, cleanParams(s, { ...defaultParams(s), ...set })), want = new Set(colours);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const v = g.data[y * g.w + x];
    if (!(v >>> 24) || !want.has(hexOf(v))) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

test('in every turned die frame the worn things lie where the code sprite draws them', async () => {
  // [id, colours of the worn thing, settings, px allowed]: the hero's helmet and hair are 3 px off, as its base is
  // (base:person-topdown-sword@1 is keyed fitted to the longest weapon; m7-topdown-geometry.test.mjs KNOWN)
  const cases = [
    ['hero-walker', ['#c2c9d6'], {}, 3], ['hero-walker', ['#9a6a3e'], { headgear: 'none', hairStyle: 'long' }, 3],
    ['void-ranger', ['#5fe0f0'], {}, 1], ['shield-trooper', ['#e2473f'], { headgear: 'mask' }, 2],
  ];
  for (const [id, colours, set, px] of cases) {
    const code = await codeSprite(id), s = await sprite(id);
    for (const f of DIE_LYING) {
      const a = colourBox(code, 'die', f, colours, set), b = colourBox(s, 'die', f, colours, set);
      assert.ok(a && b, `${id} die ${f} ${JSON.stringify(set)}: both draw it`);
      const d = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      assert.ok(d <= px, `${id} die ${f} ${JSON.stringify(set)}: ${colours} at ${JSON.stringify(b)}, the code's at ${JSON.stringify(a)} (${d} px)`);
    }
  }
});
