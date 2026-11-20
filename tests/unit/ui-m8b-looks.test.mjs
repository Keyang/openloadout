// Migration batch M8b, review round 1 (the review of the control sets, the neon bars and the RPG bars): what the code
// sprites drew must still show in the data sprites. tests/fixtures/m8b-old-looks.json holds, frozen from
// sprites/_was-<id>.js before they were deleted, every setting (each control at 0, 0.3, 0.8 and 1, the other toggle
// value, each other option) with the clips it changed, and each clip's first frame at the defaults. Held to here:
//   - a setting that changed a clip of the code sprite changes it in the data sprite: style reaches the selector
//     (crystal rime and shard, grove bark and bloom, neon double and sign), the Thick end of Border reaches the neon
//     boxes, options and switches and the grove boxes, double reaches the neon switch, card the paper boxes, sign and
//     Glow the neon bars' knob (issues 1 and 2)
//   - at the defaults each control set's boxes, options and switches keep their family's look: few pixels differ from
//     the code's (the grove vine's twist, the crystal bevel and icicles, the gilded fillet and plates, the neon tube;
//     issue 3), and the RPG bars' fills keep the code's shine: a light top row and a short glint (issue 4)
//   - neon Border: Thin and the middle look alike (the code's 2 px tube), Thick is a third look (band, core, band)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { defaultParams, cleanParams, renderFrame } from '../../engine/sprite.js';

const OLD = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm8b-old-looks.json'), 'utf8')).sprites;
const IDS = Object.keys(OLD);
const sprites = new Map();
for (const id of IDS) sprites.set(id, await loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`)));
const hexAt = (g, x, y) => { const v = g.get(x, y); return v >>> 24 ? `#${[0, 8, 16].map((s) => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')}` : null; };
const sig = (s, clip, f, set = {}) => { const g = renderFrame(s, clip, f, cleanParams(s, { ...defaultParams(s), ...set })); let o = ''; for (let y = 0; y < s.size[1]; y++) for (let x = 0; x < s.size[0]; x++) o += `${g.get(x, y)},`; return o; };
/** How many pixels of a clip's first frame at the defaults differ from the code's, and how many either drew. */
function against(id, clip) {
  const s = sprites.get(id), o = OLD[id].defaults[clip];
  const g = renderFrame(s, clip, 0, cleanParams(s, defaultParams(s)));
  let diff = 0, drawn = 0;
  o.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const was = ch === '.' ? null : o.palette['0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(ch)], now = hexAt(g, x, y);
    if (was || now) drawn++;
    if (was !== now) diff++;
  }));
  return { diff, drawn };
}

test('the frozen code pictures cover the nine sets', () => {
  assert.deepEqual(IDS, ['ui-controls-flat', 'ui-controls-candy', 'ui-controls-crystal', 'ui-controls-gilded', 'ui-controls-grove', 'ui-controls-neon', 'ui-controls-paper', 'ui-bars-neon', 'ui-bars-rpg']);
});

// The one change of the code a redraw drops on purpose: the neon tube is the same 2 px at Thin and the middle (the code
// said so: "Thin and the middle look alike"); only where moreSkinMarks' tube met the tick's and the dot's ink did a few
// core pixels come out otherwise at Thin (10 of the check's 388 pixels), an artifact of reading the picture back.
const DROPPED = new Set(['ui-controls-neon {"border":0} check-on', 'ui-controls-neon {"border":0} radio-on']);

test('every setting that changed a clip of the code sprite changes it in the data sprite (style reaches the selector; Thick, double, card, sign and Glow reach their clips)', () => {
  const dead = [];
  for (const id of IDS) {
    const s = sprites.get(id);
    for (const { set, clips } of OLD[id].changes) for (const clip of clips) {
      if (DROPPED.has(`${id} ${JSON.stringify(set)} ${clip}`)) continue;
      const n = s.clips[clip].frames;
      let changed = false;
      for (let f = 0; f < n && !changed; f++) if (sig(s, clip, f, set) !== sig(s, clip, f)) changed = true;
      if (!changed) dead.push(`${id} ${JSON.stringify(set)} ${clip}`);
    }
  }
  assert.deepEqual(dead, []);
});

test('at the defaults each control set\'s boxes, options and switches keep the family look of the code (few pixels differ)', () => {
  const far = [];
  for (const id of IDS.filter((i) => i.startsWith('ui-controls-'))) for (const clip of ['check-on', 'check-off', 'radio-on', 'radio-off', 'switch-on', 'switch-off']) {
    const { diff, drawn } = against(id, clip);
    // the redraw need not be pixel for pixel; a fifth of the piece is the most a family's look may move
    if (diff > Math.max(8, Math.round(drawn * 0.2))) far.push(`${id} ${clip}: ${diff}/${drawn} px differ`);
  }
  assert.deepEqual(far, []);
});

test('the grove boxes and options carry the vine\'s twist at the defaults: stripes of the vine\'s dark tone across the band', () => {
  const s = sprites.get('ui-controls-grove');
  for (const clip of ['check-off', 'radio-off']) {
    const g = renderFrame(s, clip, 0, cleanParams(s, defaultParams(s)));
    // along the top band of the box (row 7, columns 9 to 22): two tones alternating, as the code's twisted vine
    const row = Array.from({ length: 14 }, (_, i) => hexAt(g, 9 + i, 7));
    assert.ok(new Set(row).size >= 2, `${clip}: ${row}`);
    let flips = 0; for (let i = 1; i < row.length; i++) if (row[i] !== row[i - 1]) flips++;
    assert.ok(flips >= 8, `${clip}: the band alternates (${row})`);
  }
});

test('neon Border: Thin and the middle are the code\'s 2 px tube, Thick a third look', () => {
  const s = sprites.get('ui-controls-neon');
  for (const clip of ['check-off', 'radio-off', 'switch-on', 'switch-off']) {
    const thin = sig(s, clip, 0, { border: 0 }), mid = sig(s, clip, 0, { border: 0.5 }), thick = sig(s, clip, 0, { border: 1 });
    assert.equal(thin, mid, `${clip}: Thin and the middle alike`);
    assert.notEqual(thick, mid, `${clip}: Thick is a third look`);
  }
});

test('the RPG bars\' fills keep the code\'s shine at the defaults: a light top row and a short glint, not a white triangle', () => {
  for (const clip of ['fill', 'fill-b', 'fill-c']) {
    const { diff, drawn } = against('ui-bars-rpg', clip);
    assert.ok(diff <= Math.max(8, Math.round(drawn * 0.05)), `${clip}: ${diff}/${drawn} px differ from the code`);
  }
});

// ---- review M8b round 2: pixel bounds against the code, not only "it changes" (issue 6) ----------------------------
// tests/fixtures/m8b-old-frames.json holds every frame of each control set's pointer and selector at the defaults (the
// crystal selector also in rime and shard) and the neon bars' housing at Thick, frozen from the code sprites. The data
// sprites draw them within 2% of the code's pixels, but for one frame each: the flat, paper, neon and crystal
// selectors step as the code's pulse (out 3 frames, in 4, out 1) with its first frame the pose between (the code's own
// pattern repeats more than half its frames and ends on its first pose: two quality bar warnings).
const FRAMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm8b-old-frames.json'), 'utf8')).looks;
const BETWEEN = new Set(['ui-controls-flat', 'ui-controls-paper', 'ui-controls-neon', 'ui-controls-crystal']);
const LETTERS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** How many pixels of a frame differ from the code's frozen one, and how many either drew. */
function againstFrame(id, clip, f, set, old) {
  const s = sprites.get(id), g = renderFrame(s, clip, f, cleanParams(s, { ...defaultParams(s), ...set }));
  let diff = 0, drawn = 0;
  old.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const was = ch === '.' ? null : old.palette[LETTERS.indexOf(ch)], now = hexAt(g, x, y);
    if (was || now) drawn++;
    if (was !== now) diff++;
  }));
  return { diff, drawn };
}
const within = (looks) => {
  const far = [];
  for (const { id, clip, set, frames } of looks) frames.forEach((old, f) => {
    if (clip === 'selector' && f === 0 && BETWEEN.has(id)) return;
    const { diff, drawn } = againstFrame(id, clip, f, set, old);
    if (diff > Math.max(2, Math.round(drawn * 0.02))) far.push(`${id} ${clip} ${JSON.stringify(set)} frame ${f}: ${diff}/${drawn} px differ`);
  });
  return far;
};

test('every frame of each control set\'s pointer is the code\'s (its tones too: crystal\'s lower facet, grove\'s leaf, neon\'s core going dark)', () => {
  assert.deepEqual(within(FRAMES.filter((l) => l.clip === 'pointer')), []);
});

test('every frame of each control set\'s selector is the code\'s but the pose between (crystal\'s three-tone bevel in each style, grove\'s twist as it creeps)', () => {
  assert.deepEqual(within(FRAMES.filter((l) => l.clip === 'selector')), []);
});

test('the neon bars\' housing at Thick is the code\'s band, core, band in each style (as the neon controls)', () => {
  assert.deepEqual(within(FRAMES.filter((l) => l.id === 'ui-bars-neon')), []);
});

test('the crystal selector keeps three tones of the crystal (lit face, the colour, dark bevel) in every frame', () => {
  const s = sprites.get('ui-controls-crystal');
  for (let f = 0; f < 8; f++) {
    const g = renderFrame(s, 'selector', f, cleanParams(s, defaultParams(s)));
    const tones = new Set(); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const h = hexAt(g, x, y); if (h && h !== '#231b33') tones.add(h); }
    for (const h of ['#b1f7ff', '#8fd0f0', '#6aa1d0']) assert.ok(tones.has(h), `frame ${f}: ${h} in ${[...tones]}`);
  }
});
