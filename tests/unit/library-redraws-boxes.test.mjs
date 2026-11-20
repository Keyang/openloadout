// Redrawn library sprites that do NOT draw their code sprite's pixels exactly are still held to it (migration batch M1,
// after its second review: nothing in the project held these redraws to what the old code drew, so a size drawn one
// step too big, clipped at the frame's top, and wings 3 px short went unseen). Each record in
// tests/fixtures/redraw-boxes/<id>.json was written by tools/redraw-boxes.mjs from the code sprite before its file was
// deleted, over the cases of tests/helpers/redraw-pixels.mjs (every clip and frame at every Size step and every mix of
// toggles and choices, every swatch alone, every version): the box each frame drew and, for a redraw that matches
// most frames exactly, its frame hashes. The data file that replaced it must then
//   1. touch the frame's edge in no case where the code sprite did not (a clipped pickup),
//   2. draw each case's box within `allow.shift` pixels of the old box on every side, in at most `allow.moved` cases,
//   3. where hashes are recorded, match at least `allow.exact` cases pixel for pixel.
// The allowances are what the redraw reached when it was recorded: a later change may only tighten them (re-record
// with tools/redraw-boxes.mjs and say so in its report), so a size that slips a step or a part that shrinks fails here.
// A redraw drawn exactly belongs in tests/fixtures/redraw-pixels/ (library-redraws-pixels.test.mjs) instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, librarySprite, librarySpriteFile } from '../helpers/library.mjs';
import { redrawCases, casesKey } from '../helpers/redraw-pixels.mjs';
import { caseBox, readBoxes, boxShift, touchesEdge } from '../helpers/redraw-boxes.mjs';

const DIR = path.join(ROOT, 'tests', 'fixtures', 'redraw-boxes');
const records = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];
// the M1 pickups (docs/data-sprites.md section 9): each must have a record here or an exact one in redraw-pixels/
const M1 = ['ammo-box', 'arrow-bundle', 'bomb-pickup', 'candy', 'coin-pouch', 'credit-chip', 'fruit', 'gem', 'gold-key', 'health-cell', 'heart'];   // heart and bomb-pickup back with follow-up F4

test('every M1 redraw has a box record, and each record names a library sprite that is now a data file', () => {
  for (const id of M1) assert.ok(records.includes(`${id}.json`) || fs.existsSync(path.join(ROOT, 'tests', 'fixtures', 'redraw-pixels', `${id}.json`)), `${id}: no record`);
  for (const f of records) {
    const rec = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    assert.equal(`${rec.id}.json`, f, `${f}: its id`);
    assert.equal(librarySpriteFile(rec.id), `sprites/${rec.id}.json`, `${rec.id}: a data file (the code file is gone)`);
    assert.equal(readBoxes(rec.boxes).length, rec.cases, `${rec.id}: one box per case`);
    if (rec.frames) assert.equal(rec.frames.split(' ').length, rec.cases, `${rec.id}: one hash per case`);
    for (const k of ['shift', 'moved']) assert.ok(Number.isInteger(rec.allow?.[k]) && rec.allow[k] >= 0, `${rec.id}: allow.${k}`);
    assert.equal(rec.frames ? Number.isInteger(rec.allow.exact) : rec.allow.exact === undefined, true, `${rec.id}: allow.exact goes with recorded hashes`);
  }
});

for (const f of records) {
  const rec = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  test(`${rec.id} stays within its recorded distance of its code sprite (${rec.cases} frames: boxes within ${rec.allow.shift} px in all but ${rec.allow.moved}${rec.frames ? `, ${rec.allow.exact} exact` : ''})`, async () => {
    const sprite = await librarySprite(rec.id);
    const cases = redrawCases(sprite);
    assert.equal(cases.length, rec.cases, `${rec.id}: the cases its controls, clips and versions give`);
    assert.equal(casesKey(cases), rec.casesKey, `${rec.id}: the same cases in the same order`);
    const old = readBoxes(rec.boxes), hashes = rec.frames?.split(' ');
    const clipped = [], far = [];
    let moved = 0, exact = 0, worst = 0;
    cases.forEach((c, i) => {
      const { box, hash } = caseBox(sprite, c);
      const say = `${c.clip} f${c.frame} ${JSON.stringify(c.params)}`;
      if (touchesEdge(box, sprite.size) && !touchesEdge(old[i], sprite.size)) clipped.push(say);
      const d = boxShift(old[i], box);
      if (d > 0) moved++;
      worst = Math.max(worst, d);
      if (d > rec.allow.shift) far.push(`${say}: ${d} px`);
      if (hashes && hash === hashes[i]) exact++;
    });
    assert.deepEqual(clipped.slice(0, 6), [], `${rec.id}: ${clipped.length} frames touch the frame's edge where the code sprite did not`);
    assert.deepEqual(far.slice(0, 6), [], `${rec.id}: ${far.length} frames moved more than ${rec.allow.shift} px from the code sprite's box (worst ${worst})`);
    assert.ok(moved <= rec.allow.moved, `${rec.id}: ${moved} frames' boxes differ from the code sprite's, more than the ${rec.allow.moved} recorded`);
    if (hashes) assert.ok(exact >= rec.allow.exact, `${rec.id}: ${exact} frames match the code sprite exactly, fewer than the ${rec.allow.exact} recorded`);
  });
}
