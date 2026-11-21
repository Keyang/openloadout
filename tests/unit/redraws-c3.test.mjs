// The four robots of migration batch C3 (scout-drone, security-bot, vendor-bot, warden-mech), redrawn as data files on
// their port generators (engine/gen/robots.js), draw what their code sprites drew, pixel for pixel, and give the same
// attach points. tests/unit/library-redraws.test.mjs holds their interface (tests/fixtures/redraws/<id>.json); the
// shared pixel test (library-redraws-pixels.test.mjs) draws every mix of every choice at all 21 Size steps, which is
// 30,000 to 150,000 frames for these four, so their pixel records are here instead, at fewer cases
// (tests/fixtures/redraw-pixels-c3/<id>.json):
//
//   every mix of every choice and on/off at the default sliders; each other slider (Motion ones too) at its two ends;
//   Size at every 0.05 (every 0.1 for the Warden, whose 96 x 96 frames are slow); every swatch of every colour alone;
//   four body colours off the swatches (one as bright as the steel fittings, a pale, a dark, a saturated one), which is
//   where a colour rule standing for the code's colour arithmetic would show a fault.
//
// Each case holds one hash per frame of every clip, of its pixels and of its attach points (sprite.sockets, rounded to
// 1e-6, each angle taken into -PI..PI). The records were written from the frozen code sprites (tests/fixtures/code-sprites/<id>.js) before the code
// files were deleted. R2 deleted the frozen copies with the rigs they imported (rigs/creature-topdown.js, guard-bot.js,
// kiosk.js, mech-walker.js), so a record can no longer be written again: these four are pinned, and a change to what a robot
// draws is a change to a record that says why.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, librarySprite, librarySpriteFile } from '../helpers/library.mjs';
import { casesKey, caseHash } from '../helpers/redraw-pixels.mjs';
import { cleanParams, defaultParams } from '../../engine/sprite.js';

const IDS = ['scout-drone', 'security-bot', 'vendor-bot', 'warden-mech'];
const DIR = path.join(ROOT, 'tests', 'fixtures', 'redraw-pixels-c3');
const OFF_SWATCH = ['#c4c8d2', '#e8e2cf', '#1c2230', '#3f7f6a'];

/** The cases a C3 record holds, [{ clip, frame, params }] in a fixed order (see the head of this file). */
function c3Cases(sprite, id) {
  const P = sprite.params ?? {};
  let mixes = [{}];
  for (const [k, d] of Object.entries(P)) {
    if (d.kind === 'toggle') mixes = mixes.flatMap((m) => [true, false].map((v) => ({ ...m, [k]: v })));
    else if (d.kind === 'choice') mixes = mixes.flatMap((m) => d.options.map((o) => ({ ...m, [k]: o.value })));
  }
  for (const [k, d] of Object.entries(P)) if (d.kind === 'range' && k !== 'size' && k !== 'speed') mixes.push({ [k]: d.min }, { [k]: d.max });
  const step = id === 'warden-mech' ? 10 : 5;
  for (let i = 0; i <= 100; i += step) mixes.push({ size: i / 100 });
  for (const [k, d] of Object.entries(P)) if (d.kind === 'color') for (const s of d.swatches ?? []) mixes.push({ [k]: s });
  for (const c of OFF_SWATCH) mixes.push({ body: c });
  const out = [];
  for (const params of mixes) for (const [clip, c] of Object.entries(sprite.clips)) for (let frame = 0; frame < (c.frames ?? 1); frame++) out.push({ clip, frame, params });
  return out;
}

/** The hash of a case's attach points: sprite.sockets at the frame's phase, each point rounded to 1e-6. */
function socketHash(sprite, c) {
  const clip = sprite.clips[c.clip], loop = clip.loop !== false;
  const t = loop ? c.frame / clip.frames : clip.frames > 1 ? c.frame / (clip.frames - 1) : 0;
  const s = sprite.sockets ? sprite.sockets(c.clip, t, cleanParams(sprite, { ...defaultParams(sprite), ...c.params })) : {};
  // an angle as the direction it is (PI and -PI are one way: a node turned to -PI gives -PI where the code said PI)
  const norm = (a) => { let x = a % (2 * Math.PI); if (x <= -Math.PI + 1e-9) x += 2 * Math.PI; if (x > Math.PI + 1e-9) x -= 2 * Math.PI; return +x.toFixed(6) + 0; };
  const text = JSON.stringify(Object.keys(s).sort().map((k) => [k, +s[k].x.toFixed(6) + 0, +s[k].y.toFixed(6) + 0, norm(s[k].angle ?? 0)]));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

for (const id of IDS) {
  test(`${id}: the data file draws every recorded case as its code sprite did, with the same attach points`, { timeout: 1_200_000 }, async () => {
    const file = path.join(DIR, `${id}.json`);
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(librarySpriteFile(id), `sprites/${id}.json`, `${id} is a data file`);
    const sprite = await librarySprite(id), cases = c3Cases(sprite, id);
    assert.equal(cases.length, rec.cases, `${id}: the cases its controls and clips give`);
    assert.equal(casesKey(cases), rec.casesKey, `${id}: the same cases in the same order`);
    const frames = rec.frames.split(' '), sockets = rec.sockets.split(' '), bad = [], badPoints = [];
    cases.forEach((c, i) => {
      if (caseHash(sprite, c) !== frames[i]) bad.push(`${c.clip} f${c.frame} ${JSON.stringify(c.params)}`);
      if (socketHash(sprite, c) !== sockets[i]) badPoints.push(`${c.clip} f${c.frame} ${JSON.stringify(c.params)}`);
    });
    assert.deepEqual(bad.slice(0, 8), [], `${id}: ${bad.length} of ${cases.length} frames differ from the code sprite`);
    assert.deepEqual(badPoints.slice(0, 8), [], `${id}: ${badPoints.length} of ${cases.length} frames' attach points differ from the code sprite's`);
  });
}
