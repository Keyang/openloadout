// The Bounce and Stride sliders of the nine top-down redraws of migration batch M7 (M7b, after M7's third review: all
// nine had dropped Bounce, seven Stride, which Contract 15 rule 10 forbids). Build item F5 lets a clip's `travel` scale
// how far its keys move by a setting, so each redraw keeps the code sprite's keys, defaults and ranges, and its idle,
// walk and run clips move further or less as the code rig's did (rigs/topdown.js pose: Bounce the breath, the dip and
// the hop, Stride how far the feet travel). Held here:
//   1. the controls are the code sprite's (key, kind, default, range, step, group, labels), from its redraw record;
//   2. every travel table passes through 1 at the slider's default, so the defaults draw exactly as before (a table by
//      another control, town-guard's side move by the pole's Length and weapon (M7c), too: 1 at that control's default);
//   3. at each end of each slider a clip moves (some frame changes) wherever the code sprite's moves by 16 pixels or
//      more over the clip (Bounce's breath is a step at 0.6 in the code, so an idle moves at one end only; the code's
//      run moves its feet by 4 pixels in two frames at Stride 1), only clips the code rig's pose reads it in move, and
//      no frame of those touches the frame's edge or loses a boot;
//   4. Bounce in idle: the breath per frame (the head's top row) is within 1 px of the code sprite's at both ends;
//   5. walk and run (M7b review 1: a test that only asked "does something change" passed with every walk and run table
//      reversed): the head's bob (Bounce: how far the head's top row travels over the clip) and the feet's spread
//      (Stride: facing down or up, how far one sole rises above the other; from the side, how wide the feet reach) at
//      each end of the slider are within 1 px of the code sprite's, and go the code's way from one end to the other:
//      larger where the code's grows, smaller where it shrinks, and not flat where the code's changes. Measured with
//      nothing held and no shield or pack (each choice with a "none" option set to it), so a weapon's butt or a shield
//      by the feet is not taken for a foot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { codeSprite } from '../helpers/library.mjs';
import { cleanParams, defaultParams, renderPixels } from '../../engine/sprite.js';

const IDS = ['village-elder', 'farm-kid', 'hero-walker', 'mage-walker', 'merchant', 'town-guard', 'void-ranger', 'shield-trooper', 'rogue-walker'];
const MOTION = ['bounce', 'stride'];
/** The clips the code rig moves with each slider (rigs/topdown.js pose: idle reads Bounce; walk and run both). */
const MOVES = { bounce: /^(idle|walk|run)_/, stride: /^(walk|run)_/ };
/** Clips whose code moves with a slider where the redraw does not, and why: what data cannot do yet (M7b's report). M7c moved the merchant's talk and wave (none left). */
const STILL = {};
/** Clips besides MOVES' whose code reads a slider, per sprite: the merchant's gestures start from the idle pose at t = 0 (rigs/topdown.js gesture), which reads Bounce (M7c). */
const READS = { merchant: { bounce: /^(talk|wave)$/ } };
const record = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'redraws', `${id}.json`), 'utf8'));
const def = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));
const data = (id) => loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`));
const at = (s, set) => cleanParams(s, { ...defaultParams(s), ...set });
const pixels = (s, clip, f, set) => renderPixels(s, clip, f, at(s, set));
/** The box [x0, y0, x1, y1] of what a frame draws. */
function box(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x] >>> 24) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

test('each keeps its code sprite\'s Bounce and Stride: key, kind, default, range, step, group and labels', async () => {
  for (const id of IDS) {
    const r = record(id), s = await data(id);
    assert.equal(r.dropped, undefined, `${id}: its record drops no control`);
    for (const k of MOTION) {
      if (!r.params[k]) { assert.equal(s.params[k], undefined, `${id}: the code sprite had no ${k}`); continue; }
      const o = r.params[k], d = s.params[k];
      assert.ok(d, `${id}: ${k} kept`);
      assert.deepEqual([d.kind, d.def, d.min, d.max, d.step, d.group, d.label, d.lo, d.hi], [o.kind, o.def, o.min, o.max, o.step, o.group, o.label, o.lo, o.hi], `${id} ${k}`);
    }
  }
});

test('every travel table passes through 1 at its slider\'s default, so the defaults draw as they did before the sliders came back', async () => {
  for (const id of IDS) {
    const d = def(id), dflt = Object.fromEntries(d.controls.filter((c) => c.key).map((c) => [c.key, c.default]));
    let n = 0;
    for (const [name, c] of Object.entries(d.clips)) for (const e of c.travel ?? []) {
      n++;
      assert.ok(MOTION.includes(e.by?.from) || (id === 'town-guard' && ['weaponLength', 'weapon'].includes(e.by?.from)), `${id} ${name}: travel by ${JSON.stringify(e.by)}`);
      if (e.by.pick) { assert.equal(e.by.pick[dflt[e.by.from]], 1, `${id} ${name}: ${e.by.from} at its default scales by ${e.by.pick[dflt[e.by.from]]}, not 1`); continue; }
      const m = e.by.map, v = dflt[e.by.from];
      const i = m.findIndex(([x]) => x >= v), y = m[i][0] === v ? m[i][1] : m[i - 1][1] + ((m[i][1] - m[i - 1][1]) * (v - m[i - 1][0])) / (m[i][0] - m[i - 1][0]);
      assert.ok(Math.abs(y - 1) < 1e-9, `${id} ${name}: ${e.by.from} at its default ${v} scales by ${y}, not 1`);
    }
    assert.ok(n > 0, `${id}: no travel`);
  }
});

for (const id of IDS) {
  test(`${id}: at each end of its motion sliders the clips the code moves move, inside the frame and with both boots`, async () => {
    const s = await data(id), code = await codeSprite(id), r = record(id), bad = [];
    const ref = Object.keys(s.clips).find((c) => /^idle_down$/.test(c));
    // the boots' colours: those of the two lowest drawn rows of the standing pose, outline left out
    const g0 = pixels(s, ref, 0, {}), b0 = box(g0), INK = 0xff331b23;   // the outline, #231b33 as renderPixels writes it
    const bootCols = new Set();
    for (let y = b0[3] - 2; y <= b0[3]; y++) for (let x = 0; x < g0.w; x++) { const v = g0.data[y * g0.w + x]; if (v >>> 24 && v !== INK) bootCols.add(v); }
    const boots = (g) => g.data.reduce((n, v) => n + (bootCols.has(v) ? 1 : 0), 0);
    for (const k of MOTION.filter((m) => r.params[m])) for (const v of [0, 1]) for (const [clip, c] of Object.entries(s.clips)) {
      let moved = false, codeMoved = 0;
      for (let f = 0; f < c.frames; f++) {
        const g = pixels(s, clip, f, { [k]: v }), g1 = pixels(s, clip, f, {});
        if (g.data.some((p, i) => p !== g1.data[i])) moved = true;
        const h = pixels(code, clip, f, { [k]: v }), h1 = pixels(code, clip, f, {});
        codeMoved += h.data.reduce((n, p, i) => n + (p !== h1.data[i] ? 1 : 0), 0);
        const [x0, y0, x1, y1] = box(g);
        if (MOVES[k].test(clip) && (x0 <= 0 || y0 <= 0 || x1 >= g.w - 1 || y1 >= g.h - 1)) bad.push(`${k}=${v} ${clip} f${f}: touches the frame's edge`);
        if (MOVES[k].test(clip) && boots(g) < 0.5 * boots(g1)) bad.push(`${k}=${v} ${clip} f${f}: ${boots(g)} boot pixels, ${boots(g1)} at the defaults`);
      }
      if (codeMoved >= 16 && !moved && !STILL[id]?.[clip]) bad.push(`${k}=${v} ${clip}: does not move, where the code sprite's moves ${codeMoved} pixels`);
      if (STILL[id]?.[clip] && moved) bad.push(`${k}=${v} ${clip}: moves now; take it out of STILL`);
      if (moved && !MOVES[k].test(clip) && !READS[id]?.[k]?.test(clip)) bad.push(`${k}=${v} ${clip}: moves, but the code rig's pose does not read ${k} in it`);
    }
    assert.deepEqual(bad.slice(0, 10), [], `${id}: ${bad.length} problems`);
  });

  test(`${id}: Bounce at both ends breathes as the code sprite does in idle (the head's top row, frame by frame, within 1 px)`, async () => {
    const code = await codeSprite(id), s = await data(id), bad = [];
    for (const v of [0, 1]) for (const clip of ['idle_down', 'idle_up', 'idle_side']) for (let f = 0; f < code.clips[clip].frames; f++) {
      const top = (sp, set) => box(pixels(sp, clip, f, set))[1];
      // against each one's own defaults, so a redraw's standing offset (held by m7-topdown-geometry) does not count twice
      const dc = top(code, { bounce: v }) - top(code, {}), dd = top(s, { bounce: v }) - top(s, {});
      if (Math.abs(dc - dd) > 1) bad.push(`bounce=${v} ${clip} f${f}: the code's head moves ${dc} px, the redraw's ${dd}`);
    }
    assert.deepEqual(bad, [], `${id}: ${bad.length} frames`);
  });
}

/** The settings with nothing held: every choice that has a "none" option set to it, hair, beards and headgear left. */
const bare = (s) => Object.fromEntries(Object.entries(s.params).filter(([k, d]) => d.kind === 'choice' && d.options.some((o) => o.value === 'none') && !/hair|beard|head/i.test(k)).map(([k]) => [k, 'none']));
/** The column between the feet: the middle of the lowest row of the standing pose (idle_down frame 0), nothing held. */
function middleOf(s) {
  const g = pixels(s, 'idle_down', 0, bare(s)), b = box(g), xs = [];
  for (let x = 0; x < g.w; x++) if (g.data[b[3] * g.w + x] >>> 24) xs.push(x);
  return Math.round((Math.min(...xs) + Math.max(...xs) + 1) / 2);
}
/**
 * How a walk or run moves at a setting, nothing held: { bob, spread }. bob: the most the head's top row moves over the
 * clip. spread: facing down or up, the most one sole stands above the other (the lowest drawn row of the 5 columns left
 * of the middle against the 5 from it); from the side, the most the lowest 4 rows reach across.
 */
function gait(s, clip, set, mid) {
  const tops = [];
  let spread = 0;
  for (let f = 0; f < s.clips[clip].frames; f++) {
    const g = pixels(s, clip, f, { ...bare(s), ...set }), b = box(g);
    tops.push(b[1]);
    if (/_side$/.test(clip)) {
      let lo = Infinity, hi = -1;
      for (let y = b[3] - 3; y <= b[3]; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x] >>> 24) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      spread = Math.max(spread, hi - lo);
    } else {
      const sole = (x0, x1) => { let m = -1; for (let x = x0; x <= x1; x++) for (let y = g.h - 1; y >= 0; y--) if (g.data[y * g.w + x] >>> 24) { m = Math.max(m, y); break; } return m; };
      spread = Math.max(spread, Math.abs(sole(mid - 5, mid - 1) - sole(mid, mid + 4)));
    }
  }
  return { bob: Math.max(...tops) - Math.min(...tops), spread };
}
/** What each slider is seen in: Bounce in the head's bob, Stride in the feet's spread. */
const SEEN = { bounce: 'bob', stride: 'spread' };

for (const id of IDS) {
  test(`${id}: walk and run at each end of Bounce and Stride bob and stride as the code sprite's do, the same way and within 1 px`, async () => {
    const code = await codeSprite(id), s = await data(id), r = record(id), bad = [];
    const mc = middleOf(code), md = middleOf(s);
    for (const k of MOTION.filter((m) => r.params[m])) for (const clip of Object.keys(code.clips).filter((c) => /^(walk|run)_/.test(c))) {
      const m = SEEN[k], at = (sp, mid, v) => gait(sp, clip, v === null ? {} : { [k]: v }, mid)[m];
      const c = [0, null, 1].map((v) => at(code, mc, v)), d = [0, null, 1].map((v) => at(s, md, v));
      const say = `${k} ${clip}: ${m} at 0 / default / 1 is ${d.join(' / ')}, the code's ${c.join(' / ')}`;
      if (c.some((x, i) => Math.abs(x - d[i]) > 1)) bad.push(`${say} (more than 1 px off)`);
      else if (Math.sign(c[2] - c[0]) !== Math.sign(d[2] - d[0]) && c[2] !== c[0]) bad.push(`${say} (${d[2] === d[0] ? 'flat' : 'the other way'})`);
      else if ([0, 2].some((i) => Math.sign(c[i] - c[1]) * Math.sign(d[i] - d[1]) < 0)) bad.push(`${say} (the other way from the default)`);
    }
    assert.deepEqual(bad, [], `${id}: ${bad.length} clips`);
  });
}
