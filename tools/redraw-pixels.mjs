#!/usr/bin/env node
// Pixel records of redrawn library sprites (migration batch M4; tests/helpers/redraw-pixels.mjs says what a record
// holds). Before a code sprite's file is deleted, record what it draws; the test then holds its data redraw to that.
//
//   node tools/redraw-pixels.mjs record <id> --from <file.js> [--recolour '{"#new":"#old"}']
//       draws the code sprite <file.js> (the old sprites/<id>.js, in a copy of the project whose engine it imports)
//       at every case and writes tests/fixtures/redraw-pixels/<id>.json in THIS project. --recolour lists colours the
//       redraw changed on purpose (new -> old), kept in the record and mapped back when it is checked.
//   node tools/redraw-pixels.mjs check <id> [--all]
//       draws the library sprite <id> (whatever its file kind) at every case of its record and lists the cases that
//       differ (the first 25; --all every one). Exit code 1 when any differs.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { redrawCases, casesKey, caseHash } from '../tests/helpers/redraw-pixels.mjs';
import { ROOT, findSpriteFile, loadSpriteFile } from './lib/assets.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'redraw-pixels');
const [mode, id, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(name); return i < 0 ? undefined : rest[i + 1]; };
if (!['record', 'check'].includes(mode) || !id) {
  console.error('usage: node tools/redraw-pixels.mjs record <id> --from <file.js> [--recolour JSON] | check <id> [--all]');
  process.exit(2);
}

if (mode === 'record') {
  const from = flag('--from');
  if (!from) { console.error('record needs --from <the old code sprite file>'); process.exit(2); }
  const sprite = (await import(pathToFileURL(path.resolve(from)).href)).default;
  if (sprite.id !== id) { console.error(`${from} is sprite ${sprite.id}, not ${id}`); process.exit(2); }
  const recolour = flag('--recolour') ? JSON.parse(flag('--recolour')) : null;
  const cases = redrawCases(sprite);
  // the old sprite drawn as it was: no recolour (that is applied to the redraw when it is checked)
  const frames = cases.map((c) => caseHash(sprite, c));
  const rec = { id, recorded: new Date().toISOString().slice(0, 10), from: `sprites/${id}.js (the code sprite before its redraw)`, cases: cases.length, casesKey: casesKey(cases), ...(recolour ? { recolour } : {}), frames: frames.join(' ') };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${id}.json`), JSON.stringify(rec, null, 1) + '\n');
  console.log(`${id}: ${cases.length} frames recorded${recolour ? `, ${Object.keys(recolour).length} colours recoloured` : ''}`);
} else {
  const rec = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
  const file = findSpriteFile(ROOT, id);
  if (!file) { console.error(`no library sprite ${id}`); process.exit(2); }
  const sprite = await loadSpriteFile(ROOT, file);
  const cases = redrawCases(sprite);
  if (casesKey(cases) !== rec.casesKey) { console.error(`${id}: its controls, clips or versions no longer give the recorded cases (${cases.length} against ${rec.cases})`); process.exit(1); }
  const want = rec.frames.split(' ');
  const bad = [];
  cases.forEach((c, i) => { if (caseHash(sprite, c, rec.recolour) !== want[i]) bad.push(`${c.clip} f${c.frame} ${JSON.stringify(c.params)}`); });
  console.log(`${id}: ${cases.length} frames, ${bad.length} differ from the code sprite's record`);
  for (const b of bad.slice(0, rest.includes('--all') ? Infinity : 25)) console.log('  ' + b);
  process.exit(bad.length ? 1 : 0);
}
