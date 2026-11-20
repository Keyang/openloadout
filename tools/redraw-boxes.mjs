#!/usr/bin/env node
// Box records of redrawn library sprites that are not pixel-exact (migration batch M1, second review;
// tests/helpers/redraw-boxes.mjs says what a record holds, tests/unit/library-redraws-boxes.test.mjs what it holds a
// redraw to). Before a code sprite's file is deleted, record what it draws; the allowances are what its data redraw
// reaches now, so they can only be tightened later.
//
//   node tools/redraw-boxes.mjs record <id> --from <file.js> [--hashes]
//       draws the code sprite <file.js> (the old sprites/<id>.js, in a copy of the project whose engine it imports) and
//       the library sprite <id> at every case, and writes tests/fixtures/redraw-boxes/<id>.json in THIS project: the
//       old boxes, with --hashes the old frame hashes too, and the allowances the redraw meets now.
//   node tools/redraw-boxes.mjs check <id>
//       draws the library sprite <id> against its record and says how far it is from it. Exit code 1 when it is
//       further than the record allows.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { redrawCases, casesKey } from '../tests/helpers/redraw-pixels.mjs';
import { caseBox, packBoxes, readBoxes, boxShift, touchesEdge } from '../tests/helpers/redraw-boxes.mjs';
import { ROOT, findSpriteFile, loadSpriteFile } from './lib/assets.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'redraw-boxes');
const [mode, id, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(name); return i < 0 ? undefined : rest[i + 1]; };
if (!['record', 'check'].includes(mode) || !id) {
  console.error('usage: node tools/redraw-boxes.mjs record <id> --from <file.js> [--hashes] | check <id>');
  process.exit(2);
}

const file = findSpriteFile(ROOT, id);
if (!file) { console.error(`no library sprite ${id}`); process.exit(2); }
const sprite = await loadSpriteFile(ROOT, file);
const cases = redrawCases(sprite);

/** How the library sprite compares with old boxes (and hashes): { clipped, moved, shift, exact } over every case. */
function measure(oldBoxes, oldHashes) {
  let clipped = 0, moved = 0, shift = 0, exact = 0;
  cases.forEach((c, i) => {
    const { box, hash } = caseBox(sprite, c);
    if (touchesEdge(box, sprite.size) && !touchesEdge(oldBoxes[i], sprite.size)) clipped++;
    const d = boxShift(oldBoxes[i], box);
    if (d > 0) moved++;
    shift = Math.max(shift, d);
    if (oldHashes && hash === oldHashes[i]) exact++;
  });
  return { clipped, moved, shift, exact };
}

if (mode === 'record') {
  const from = flag('--from');
  if (!from) { console.error('record needs --from <the old code sprite file>'); process.exit(2); }
  const old = (await import(pathToFileURL(path.resolve(from)).href)).default;
  if (old.id !== id) { console.error(`${from} is sprite ${old.id}, not ${id}`); process.exit(2); }
  const oldCases = redrawCases(old);
  if (casesKey(oldCases) !== casesKey(cases)) { console.error(`${id}: the redraw's controls, clips or versions give other cases than the code sprite's (${cases.length} against ${oldCases.length})`); process.exit(1); }
  const drawn = oldCases.map((c) => caseBox(old, c));
  const boxes = drawn.map((d) => d.box), hashes = rest.includes('--hashes') ? drawn.map((d) => d.hash) : null;
  const m = measure(boxes, hashes);
  if (m.clipped) { console.error(`${id}: the redraw touches the frame's edge in ${m.clipped} cases where the code sprite did not; fix it before recording`); process.exit(1); }
  const rec = { id, recorded: new Date().toISOString().slice(0, 10), from: `sprites/${id}.js (the code sprite before its redraw)`, cases: cases.length, casesKey: casesKey(cases),
    allow: { shift: m.shift, moved: m.moved, ...(hashes ? { exact: m.exact } : {}) }, boxes: packBoxes(boxes), ...(hashes ? { frames: hashes.join(' ') } : {}) };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${id}.json`), JSON.stringify(rec, null, 1) + '\n');
  console.log(`${id}: ${cases.length} frames recorded; boxes within ${m.shift} px, ${m.moved} moved${hashes ? `, ${m.exact} exact` : ''}`);
} else {
  const rec = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
  if (casesKey(cases) !== rec.casesKey) { console.error(`${id}: its controls, clips or versions no longer give the recorded cases (${cases.length} against ${rec.cases})`); process.exit(1); }
  const m = measure(readBoxes(rec.boxes), rec.frames?.split(' '));
  const bad = m.clipped > 0 || m.shift > rec.allow.shift || m.moved > rec.allow.moved || (rec.frames && m.exact < rec.allow.exact);
  console.log(`${id}: ${cases.length} frames; ${m.clipped} newly clipped; boxes within ${m.shift} px (allowed ${rec.allow.shift}), ${m.moved} moved (allowed ${rec.allow.moved})${rec.frames ? `; ${m.exact} exact (at least ${rec.allow.exact})` : ''}`);
  process.exit(bad ? 1 : 0);
}
