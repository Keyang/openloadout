#!/usr/bin/env node
// Automatic checks for sprites: a thin command line over quality/sprite.js (every rule)
// and tools/lib/quality-run.mjs (worker threads and a cache). docs/quality-bar.md says
// what each rule means. Run after every change:
//
//   node tools/check.mjs                 every sprite found in sprites/
//   node tools/check.mjs <id|file> ...   one or more sprites, by id or by file path
//   --json                               machine-readable: { ok, metaChecked, notice, sprites: [{ id, file, ok, errors, warnings, metrics, cached }] }
//   --no-cache                           check again even when nothing changed
//   --cache-file <path>                  use another cache file (default .cache/quality.json)
//
// Errors fail the run (exit 1); warnings are things to look at by eye. A sprite file
// that cannot be loaded is reported as that sprite's error. Metadata is checked with
// catalog/schema.js's validateMeta when that file exists.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/assets.mjs';
import { runQuality, UnknownAsset } from './lib/quality-run.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const ci = args.indexOf('--cache-file');
const cacheFile = ci >= 0 ? path.resolve(args[ci + 1]) : undefined;
const ids = args.filter((a, i) => !a.startsWith('--') && !(ci >= 0 && i === ci + 1));
const say = json ? () => {} : (...m) => console.log(...m);

let run;
try {
  run = await runQuality({ sprites: ids.length ? ids : undefined, sounds: [], cache: !args.includes('--no-cache'), cacheFile });
} catch (e) {
  if (e instanceof UnknownAsset) { console.error(e.message); process.exit(1); }
  throw e;
}
if (run.notice) say(`note: ${run.notice}`);

// the gallery still lists sprites by hand in sprites/index.js; say when one is missing there
if (!json && !ids.length && fs.existsSync(path.join(ROOT, 'sprites', 'index.js'))) {
  try {
    const { sprites } = await import(pathToFileURL(path.join(ROOT, 'sprites', 'index.js')).href);
    const listed = new Set((sprites ?? []).map((s) => s.id));
    for (const r of run.results) if (r.metrics?.looks && !listed.has(r.id)) say(`note: ${r.file} is not listed in sprites/index.js, so it will not show in the gallery`);
  } catch { /* the gallery list is not this tool's concern */ }
}

for (const r of run.results) {
  const status = !r.ok ? 'FAIL' : r.warnings.length ? 'ok (warnings)' : 'ok';
  const size = r.metrics?.looks ? `${r.metrics.looks} looks x ${r.clips} clips   ${Math.round(r.metrics.ms)} ms` : '(not checked)';
  say(`${String(r.id).padEnd(14)} ${status}   ${size}${r.cached ? ' (cached)' : ''}`);
  for (const e of r.errors) say(`   ERROR  ${e}`);
  for (const m of r.warnings) say(`   warn   ${m}`);
}
const allOk = run.results.every((r) => r.ok);
if (json) {
  console.log(JSON.stringify({ ok: allOk, metaChecked: run.metaChecked, notice: run.notice, sprites: run.results }, null, 2));
} else if (run.results.length > 1) {
  const fresh = run.results.filter((r) => !r.cached && r.metrics?.ms);
  const ms = fresh.reduce((a, r) => a + r.metrics.ms, 0);
  say(`\n${run.results.length} sprites: ${run.results.filter((r) => r.ok).length} pass, ${run.results.filter((r) => !r.ok).length} fail · ${run.results.length - fresh.length} from the cache${fresh.length ? ` · ${Math.round(ms / fresh.length)} ms per sprite checked` : ''}`);
}
process.exit(allOk ? 0 : 1);
