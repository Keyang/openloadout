// What the nine top-down redraws of migration batch M7 draw INSIDE their outer box, held to their code sprites (third
// review of M7: the geometry test and the box records compare only boxes, so a part moved inside the silhouette, a
// palette slot changed or a shield shifted passed every M7 test; hiding the mage's default beard passed them all).
//
// For each of the nine, and for every clip, the pixels that differ from the code sprite (tests/fixtures/code-sprites/,
// through tests/helpers/library.mjs codeSprite), summed over the clip's frames: a pixel differs when one draws it and the
// other does not, or both draw it in different colours. Measured at these looks, each on the defaults:
//   - the defaults;
//   - each other option of each choice control, alone;
//   - each end of each slider (M7b review 2, issues 1 and 5: Height, Build, the sizes and lengths, and Bounce and Stride,
//     so a motion slider that runs backwards or a body that slips a pixel at its tallest look is caught), Speed left
//     out (it changes the frame rate, not a picture);
//   - each switch turned over;
//   - each colour control at its second and its last swatch (a part mapped to the wrong palette slot draws the same
//     at the default colours, and differently at any other).
// tests/fixtures/m7-topdown-pixels.json holds each count as the redraw reaches it now, ratcheted like the box records
// (tests/unit/library-redraws-boxes.test.mjs): a change that draws further from the code fails here, and so does one
// that comes clearly nearer (more than SLACK below its ceiling), so the ceiling is lowered with it and a later
// regression cannot hide in the room left. Lower a ceiling only on purpose, and say so in the batch's report:
//   M7_PIXELS=record node --test tests/unit/m7-topdown-pixels.test.mjs   measures every look again and writes the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { codeSprite } from '../helpers/library.mjs';
import { cleanParams, defaultParams, renderPixels } from '../../engine/sprite.js';

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
/** The settings of a look on the sprite's defaults. */
function settingsOf(sprite, look) {
  const set = {};
  if (look) {
    const i = look.indexOf('='), k = look.slice(0, i), v = look.slice(i + 1), d = sprite.params[k];
    set[k] = d.kind === 'range' ? Number(v) : d.kind === 'toggle' ? v === 'true' : v;
  }
  return cleanParams(sprite, { ...defaultParams(sprite), ...set });
}
/** Pixels of clip that differ between code and data at a look, summed over the clip's frames. */
function clipDiff(code, data, clip, look) {
  const pc = settingsOf(code, look), pd = settingsOf(data, look);
  let n = 0;
  for (let f = 0; f < code.clips[clip].frames; f++) {
    const a = renderPixels(code, clip, f, pc).data, b = renderPixels(data, clip, f, pd).data;
    for (let i = 0; i < a.length; i++) if (((a[i] >>> 24) ? a[i] : 0) !== ((b[i] >>> 24) ? b[i] : 0)) n++;
  }
  return n;
}
const pair = async (id) => [await codeSprite(id), await loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`))];

if (process.env.M7_PIXELS === 'record') {
  const ceilings = {};
  for (const id of IDS) {
    const [code, data] = await pair(id);
    ceilings[id] = {};
    for (const look of looksOf(code)) { ceilings[id][look] = {}; for (const clip of Object.keys(code.clips)) ceilings[id][look][clip] = clipDiff(code, data, clip, look); }
  }
  const lines = Object.entries(ceilings).map(([id, looks]) => `  ${JSON.stringify(id)}: {\n${Object.entries(looks).map(([look, clips]) => `   ${JSON.stringify(look)}: ${JSON.stringify(clips)}`).join(',\n')} }`);
  const about = 'Pixels each clip of the nine M7 top-down redraws may differ from its code sprite by, summed over its frames, at each look ("" is the defaults): tests/unit/m7-topdown-pixels.test.mjs, which wrote it (M7_PIXELS=record). Ratcheted: lower a ceiling only on purpose.';
  fs.writeFileSync(FILE, `{\n "about": ${JSON.stringify(about)},\n "recorded": ${JSON.stringify(new Date().toISOString().slice(0, 10))},\n "ceilings": {\n${lines.join(',\n')} }\n}\n`);
}
const CEILINGS = JSON.parse(fs.readFileSync(FILE, 'utf8')).ceilings;

test('every one of the nine has a ceiling for each of its looks and clips, and no ceiling names a look or clip it has not', async () => {
  for (const id of IDS) {
    const [code, data] = await pair(id);
    assert.ok(CEILINGS[id], `${id}: no ceilings`);
    assert.deepEqual(Object.keys(CEILINGS[id]).sort(), looksOf(code).sort(), `${id}: the looks`);
    assert.deepEqual(looksOf(data).sort(), looksOf(code).sort(), `${id}: the redraw has the code sprite's controls, options, ranges and swatches`);
    for (const look of looksOf(code)) assert.deepEqual(Object.keys(CEILINGS[id][look]).sort(), Object.keys(code.clips).sort(), `${id} ${look || 'defaults'}: the clips`);
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
    const [code, data] = await pair(id);
    const over = [], under = [];
    for (const [look, clips] of Object.entries(CEILINGS[id])) {
      for (const [clip, ceiling] of Object.entries(clips)) {
        const n = clipDiff(code, data, clip, look), say = `${look || 'defaults'} ${clip}: ${n} pixels differ, ceiling ${ceiling}`;
        if (n > ceiling) over.push(say);
        else if (n < ceiling - SLACK(ceiling)) under.push(`${say} (lower the ceiling)`);
      }
    }
    assert.deepEqual(over.slice(0, 20), [], `${id}: ${over.length} clips draw further from the code sprite than recorded`);
    assert.deepEqual(under.slice(0, 20), [], `${id}: ${under.length} clips now draw clearly nearer the code sprite; ratchet their ceilings down`);
  });
}
