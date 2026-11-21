// What the nine top-down redraws of migration batch M7 draw INSIDE their outer box, held to their code sprites (third
// review of M7: the geometry test and the box records compare only boxes, so a part moved inside the silhouette, a
// palette slot changed or a shield shifted passed every M7 test; hiding the mage's default beard passed them all).
//
// R2 deleted the code sprites and their rig (rigs/topdown.js), and review of R2 found this check gone with them. It is back
// against a record: tests/fixtures/code-frames/<id>.json holds every frame of the code sprite at each look below, taken
// from the frozen copies at commit 7e328c3 (tests/helpers/code-frames.mjs reads it). The data sprite is drawn live.
//
// For each of the nine, and for every clip, the pixels that differ from the code sprite, summed over the clip's frames: a
// pixel differs when one draws it and the other does not, or both draw it in different colours. Measured at these looks,
// each on the defaults:
//   - the defaults;
//   - each other option of each choice control, alone;
//   - each end of each slider (M7b review 2, issues 1 and 5: Height, Build, the sizes and lengths, and Bounce and Stride,
//     so a motion slider that runs backwards or a body that slips a pixel at its tallest look is caught), Speed left
//     out (it changes the frame rate, not a picture);
//   - each switch turned over;
//   - each colour control at its second and its last swatch (a part mapped to the wrong palette slot draws the same
//     at the default colours, and differently at any other).
// tests/fixtures/m7-topdown-pixels.json holds each count as the redraw reaches it, ratcheted like the box records
// (tests/unit/library-redraws-boxes.test.mjs): a change that draws further from the code fails here, and so does one
// that comes clearly nearer (more than SLACK below its ceiling), so the ceiling is lowered with it and a later
// regression cannot hide in the room left. Lower a ceiling only on purpose, and say so in the batch's report:
//   M7_PIXELS=record node --test tests/unit/m7-topdown-pixels.test.mjs   measures every look again and writes the file.
// Proved by a break (R2 review): hero-walker's cape painted in the outfit colour instead of trim, and its front cuffs
// facing down in metal, change 4,381 pixels at the defaults and fail 'defaults idle_up: 1285 pixels differ, ceiling 779'.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { codeFrames, framesDiff, settingsOfLook } from '../helpers/code-frames.mjs';

const IDS = ['village-elder', 'farm-kid', 'hero-walker', 'mage-walker', 'merchant', 'town-guard', 'void-ranger', 'shield-trooper', 'rogue-walker'];
const FILE = path.join(ROOT, 'tests', 'fixtures', 'm7-topdown-pixels.json');
/** How far under its ceiling a count may fall before the ceiling must come down: 5 % of it and 8 pixels. */
const SLACK = (ceiling) => Math.ceil(ceiling * 0.05) + 8;

/** The looks measured, as 'key=value' ('' is the defaults): see the head of this file. */
function looksOf(sprite) {
  const out = [''];
  for (const [k, d] of Object.entries(sprite.params ?? {})) {
    if (d.kind === 'choice') { for (const o of d.options) if (o.value !== d.def) out.push(`${k}=${o.value}`); }
    else if (d.kind === 'range' && k !== 'speed') { for (const v of [d.min, d.max]) if (v !== d.def) out.push(`${k}=${v}`); }
    else if (d.kind === 'toggle') out.push(`${k}=${!d.def}`);
    else if (d.kind === 'color' && d.swatches?.length) for (const c of new Set([d.swatches[1], d.swatches.at(-1)])) if (c && c !== d.def) out.push(`${k}=${c}`);
  }
  return out;
}
/** The looks the record holds for every clip (the ones above; the record's `extra` looks hold some clips only). */
const recordedLooks = (rec) => rec.looks.filter((l) => !(l in rec.extra));
const data = (id) => loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`));

if (process.env.M7_PIXELS === 'record') {
  const ceilings = {};
  for (const id of IDS) {
    const rec = codeFrames(id), sprite = await data(id);
    ceilings[id] = {};
    for (const look of recordedLooks(rec)) { ceilings[id][look] = {}; for (const clip of Object.keys(rec.clips)) ceilings[id][look][clip] = framesDiff(rec, sprite, look, clip); }
  }
  const lines = Object.entries(ceilings).map(([id, looks]) => `  ${JSON.stringify(id)}: {\n${Object.entries(looks).map(([look, clips]) => `   ${JSON.stringify(look)}: ${JSON.stringify(clips)}`).join(',\n')} }`);
  const about = 'Pixels each clip of the nine M7 top-down redraws may differ from its code sprite by, summed over its frames, at each look ("" is the defaults): tests/unit/m7-topdown-pixels.test.mjs, which wrote it (M7_PIXELS=record), against the code frames of tests/fixtures/code-frames/. Ratcheted: lower a ceiling only on purpose.';
  fs.writeFileSync(FILE, `{\n "about": ${JSON.stringify(about)},\n "recorded": ${JSON.stringify(new Date().toISOString().slice(0, 10))},\n "ceilings": {\n${lines.join(',\n')} }\n}\n`);
}
const CEILINGS = JSON.parse(fs.readFileSync(FILE, 'utf8')).ceilings;

test('every one of the nine has a ceiling for each of its looks and clips, and no ceiling names a look or clip it has not', async () => {
  for (const id of IDS) {
    const rec = codeFrames(id), sprite = await data(id);
    assert.ok(CEILINGS[id], `${id}: no ceilings`);
    assert.deepEqual(Object.keys(CEILINGS[id]).sort(), recordedLooks(rec).sort(), `${id}: the looks`);
    assert.deepEqual(looksOf(sprite).sort(), recordedLooks(rec).sort(), `${id}: the redraw has the code sprite's controls, options, ranges and swatches`);
    for (const look of recordedLooks(rec)) {
      assert.deepEqual(Object.keys(CEILINGS[id][look]).sort(), Object.keys(rec.clips).sort(), `${id} ${look || 'defaults'}: the clips`);
      for (const clip of Object.keys(rec.clips)) assert.ok(rec.has(look, clip), `${id} ${look || 'defaults'} ${clip}: recorded`);
    }
    assert.deepEqual(Object.keys(sprite.clips).sort(), Object.keys(rec.clips).sort(), `${id}: the redraw has the code sprite's clips`);
    for (const [clip, n] of Object.entries(rec.clips)) assert.equal(sprite.clips[clip].frames, n, `${id} ${clip}: frames`);
  }
});

test('the looks cover each end of the motion sliders, and a colour at a swatch other than its default', () => {
  for (const id of IDS) {
    const looks = Object.keys(CEILINGS[id]);
    for (const look of ['bounce=0', 'bounce=1']) assert.ok(looks.includes(look), `${id}: ${look}`);
    const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'redraws', `${id}.json`), 'utf8'));
    if (record.params.stride) for (const look of ['stride=0', 'stride=1']) assert.ok(looks.includes(look), `${id}: ${look}`);
    assert.ok(looks.some((l) => /^height=/.test(l)) && looks.some((l) => /=#[0-9a-f]{6}$/i.test(l)), `${id}: Height and a swatch`);
  }
});

for (const id of IDS) {
  test(`${id}: every clip at every look draws no further from the code sprite than its ceiling, and not clearly nearer`, async () => {
    const rec = codeFrames(id), sprite = await data(id);
    const over = [], under = [];
    for (const [look, clips] of Object.entries(CEILINGS[id])) {
      const settings = settingsOfLook(sprite, look);
      for (const [clip, ceiling] of Object.entries(clips)) {
        const n = framesDiff(rec, sprite, look, clip, settings), say = `${look || 'defaults'} ${clip}: ${n} pixels differ, ceiling ${ceiling}`;
        if (n > ceiling) over.push(say);
        else if (n < ceiling - SLACK(ceiling)) under.push(`${say} (lower the ceiling)`);
      }
    }
    assert.deepEqual(over.slice(0, 20), [], `${id}: ${over.length} clips draw further from the code sprite than recorded`);
    assert.deepEqual(under.slice(0, 20), [], `${id}: ${under.length} clips now draw clearly nearer the code sprite; ratchet their ceilings down`);
  });
}
