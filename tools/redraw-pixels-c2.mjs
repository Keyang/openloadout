#!/usr/bin/env node
// Pixel records of migration batch C2's creature redraws (tests/helpers/c2-cases.mjs says which cases a record holds
// and why they are not tools/redraw-pixels.mjs's every mix). Before a code sprite's file is deleted, record what it
// draws; tests/unit/redraws-c2.test.mjs then holds its data redraw to that.
//
//   node tools/redraw-pixels-c2.mjs record <id> --from <file.js>
//       draws the code sprite <file.js> (the old sprites/<id>.js, or sprites/_was-<id>.js) at every case and writes
//       tests/fixtures/redraw-pixels-c2/<id>.json in THIS project
//   node tools/redraw-pixels-c2.mjs check <id> [--all]
//       draws the library sprite <id> at every case of its record and lists the cases that differ (the first 25; --all
//       every one). Exit code 1 when any differs.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { c2Cases, c2Hash } from '../tests/helpers/c2-cases.mjs';
import { casesKey } from '../tests/helpers/redraw-pixels.mjs';
import { ROOT, findSpriteFile, loadSpriteFile } from './lib/assets.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'redraw-pixels-c2');
const [mode, id, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(name); return i < 0 ? undefined : rest[i + 1]; };
if (!['record', 'check'].includes(mode) || !id) {
  console.error('usage: node tools/redraw-pixels-c2.mjs record <id> --from <file.js> | check <id> [--all]');
  process.exit(2);
}

if (mode === 'record') {
  const from = flag('--from');
  if (!from) { console.error('record needs --from <the old code sprite file>'); process.exit(2); }
  const sprite = (await import(pathToFileURL(path.resolve(from)).href)).default;
  if (sprite.id !== id) { console.error(`${from} is sprite ${sprite.id}, not ${id}`); process.exit(2); }
  const cases = c2Cases(sprite);
  const frames = cases.map((c) => c2Hash(sprite, c));
  const rec = { id, recorded: new Date().toISOString().slice(0, 10), from: `sprites/${id}.js (the code sprite before its redraw)`, cases: cases.length, casesKey: casesKey(cases), frames: frames.join(' ') };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${id}.json`), JSON.stringify(rec, null, 1) + '\n');
  console.log(`${id}: ${cases.length} frames recorded`);
} else {
  const rec = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
  const file = findSpriteFile(ROOT, id);
  if (!file) { console.error(`no library sprite ${id}`); process.exit(2); }
  const sprite = await loadSpriteFile(ROOT, file);
  const cases = c2Cases(sprite);
  if (casesKey(cases) !== rec.casesKey) { console.error(`${id}: its controls or clips no longer give the recorded cases (${cases.length} against ${rec.cases})`); process.exit(1); }
  const want = rec.frames.split(' ');
  const bad = [];
  cases.forEach((c, i) => { if (c2Hash(sprite, c) !== want[i]) bad.push(`${c.clip} f${c.frame} ${JSON.stringify(c.params)}`); });
  console.log(`${id}: ${cases.length} frames, ${bad.length} differ from the code sprite's record`);
  for (const b of bad.slice(0, rest.includes('--all') ? Infinity : 25)) console.log('  ' + b);
  process.exit(bad.length ? 1 : 0);
}
