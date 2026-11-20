// Redrawn library sprites draw what their code sprites drew (migration batch M4, after its first review: the claim
// "the same pixels at every setting" was checked only by a tool outside the project). Each record in
// tests/fixtures/redraw-pixels/<id>.json was written by tools/redraw-pixels.mjs from the code sprite before its file
// was deleted: one hash per frame at every Size step, every mix of toggles and choices, every swatch alone and every
// version (tests/helpers/redraw-pixels.mjs). The library sprite of that id, now a data file, must give the same hash
// at every case; a record's `recolour` lists the colours a redraw changed on purpose (new -> old), mapped back first,
// so even those frames are held pixel for pixel in everything else.
//
// A redraw that is meant to differ (DQ3: keep keys, accept the redraw) is recorded again, or its record removed,
// on purpose and said in its report; this test never decides that for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, librarySprite, librarySpriteFile } from '../helpers/library.mjs';
import { redrawCases, casesKey, caseHash, frameHash } from '../helpers/redraw-pixels.mjs';

const DIR = path.join(ROOT, 'tests', 'fixtures', 'redraw-pixels');
const records = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];

test('there are pixel records, and each names a library sprite that is now a data file', () => {
  assert.ok(records.length >= 6, `${records.length} records`);
  for (const f of records) {
    const rec = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    assert.equal(`${rec.id}.json`, f, `${f}: its id`);
    assert.equal(librarySpriteFile(rec.id), `sprites/${rec.id}.json`, `${rec.id}: a data file (the code file is gone)`);
    assert.equal(rec.frames.split(' ').length, rec.cases, `${rec.id}: one hash per case`);
  }
});

// The M4 review's blind spot: a recolour maps new -> old before hashing, so a redraw that painted BOTH the new and
// the old shade where the code painted only the old one hashed the same. A replaced colour the redraw still paints
// must now count as a difference; the recoloured pixels themselves still match.
test('a recolour map holds the recoloured pixels, and a replaced colour still painted by the redraw is a difference', () => {
  const px = (hex) => { const n = parseInt(hex.slice(1), 16); return ((0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >>> 16)) >>> 0; };
  const img = (...hex) => ({ w: hex.length, h: 1, data: Uint32Array.from(hex.map(px)) });
  const recolour = { '#7c3a16': '#7e3319' };
  const code = frameHash(img('#7e3319', '#7e3319', '#102030'));
  assert.equal(frameHash(img('#7c3a16', '#7c3a16', '#102030'), recolour), code, 'the new shade everywhere the code painted the old one');
  assert.notEqual(frameHash(img('#7c3a16', '#7e3319', '#102030'), recolour), code, 'the new and the old shade both painted');
  assert.notEqual(frameHash(img('#7c3a16', '#7c3a16', '#7e3319'), recolour), code, 'the old shade where the code painted another colour');
});

for (const f of records) {
  const rec = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  test(`${rec.id} draws every recorded case as its code sprite did (${rec.cases} frames${rec.recolour ? `, ${Object.keys(rec.recolour).length} colours mapped back` : ''})`, async () => {
    const sprite = await librarySprite(rec.id);
    const cases = redrawCases(sprite);
    assert.equal(cases.length, rec.cases, `${rec.id}: the cases its controls, clips and versions give`);
    assert.equal(casesKey(cases), rec.casesKey, `${rec.id}: the same cases in the same order`);
    const want = rec.frames.split(' ');
    const bad = [];
    cases.forEach((c, i) => { if (caseHash(sprite, c, rec.recolour) !== want[i]) bad.push(`${c.clip} f${c.frame} ${JSON.stringify(c.params)}`); });
    assert.deepEqual(bad.slice(0, 8), [], `${rec.id}: ${bad.length} of ${cases.length} frames differ from the code sprite (node tools/redraw-pixels.mjs check ${rec.id})`);
  });
}
