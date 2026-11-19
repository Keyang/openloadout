#!/usr/bin/env node
// The site build. Finds every asset by scanning sprites/, sounds/ and bundles/, then:
//
//   validate    every asset's meta and every bundle (exit 1 with what to fix)
//   quality     quality/sprite.js and quality/sound.js over every asset (exit 1 with which file, what is wrong, what to do)
//   framework   generated/api.json, framework.js, api.md
//   thumbnails  generated/thumbs/ and generated/strips/ (unchanged assets are skipped; hashes in .cache/build.json)
//   search      generated/search.sqlite, when tools/lib/search-index.mjs exists
//   catalogue   generated/catalog.json and generated/sounds.json
//   vendor      vendor/, when tools/lib/vendor.mjs exists
//   dist        with --dist: the publishable site copied to dist/
//
// The order is the safety rule: nothing the site reads is written until every asset has passed validate and
// quality, so a build that stops there leaves generated/ exactly as it was. The catalogue, the sounds file and
// the search index (the three files that say which assets exist) are written beside the old ones and swapped in
// together, last, so a later step that breaks leaves the last good catalogue in place too.
//
//   node tools/build.mjs [--root <dir>] [--dist] [--skip-quality] [--no-cache] [--skip-search] [--skip-vendor] [--force] [--trace]
//
// --root builds another copy of the project (the tests use it). --force redraws every picture.
// --skip-quality leaves the quality step out for a quick look; the build says so again as its last words.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadAssets } from './lib/assets.mjs';
import { buildCatalog } from './lib/catalog.mjs';
import { writeImages } from './lib/thumbs.mjs';
import { validateMeta, validateBundle } from '../catalog/schema.js';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`node tools/build.mjs [options]
  Validates every asset, then writes generated/ (catalogue, thumbnails, quality results, search index, framework description, vendored files).
  --skip-quality   leave out the quality bar (minutes for sounds and music; use while iterating)
  --no-cache       re-run the quality bar on everything, ignoring .cache/quality.json
  --skip-search    leave out the search index
  --no-meaning     search index with keywords only (no embedding model; the site then hides Smarter search)
  --skip-vendor    do not copy libraries, model and fonts into vendor/
  --root <dir>     build another copy of the site (default: this folder)
  --dist           also write a deployable copy to dist/
  --force          rebuild thumbnails even when up to date
  --trace          when a step breaks, also print where in the code

  Nothing the site reads is written until every asset has passed, so a build that stops leaves the site as it was.
  After --skip-quality the site may show assets nobody has checked; the build says so when it ends.`);
  process.exit(0);
}


const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const USAGE = 'usage: node tools/build.mjs [--root <folder>] [--dist] [--skip-quality] [--no-cache] [--skip-search] [--no-meaning] [--skip-vendor] [--force] [--trace]';
const rootArg = args.indexOf('--root');
if (rootArg >= 0 && (!args[rootArg + 1] || args[rootArg + 1].startsWith('--'))) {
  console.error(`--root needs a folder.\n${USAGE}`);
  process.exit(1);
}
const root = rootArg >= 0 ? path.resolve(args[rootArg + 1]) : ROOT;
if (!fs.existsSync(path.join(root, 'sprites')) || !fs.existsSync(path.join(root, 'sounds'))) {
  console.error(`${root} is not a Loadout project (it needs sprites/ and sounds/).\n${USAGE}`);
  process.exit(1);
}
const rel = (p) => path.relative(root, p) || '.';

/** What --dist copies: everything the browser loads, nothing the build or tests use. */
const DIST = ['index.html', 'app', 'engine', 'rigs', 'sound', 'sprites', 'sounds', 'bundles', 'catalog', 'search', 'quality', 'generated', 'vendor'];

const rows = [];
const started = performance.now();
function fmt(ms) { return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`; }
// Files that say which assets exist are written as <name>.next and renamed together at the end (publish()).
const staged = [];
const stage = (file) => { const next = `${file}.next`; staged.push([next, file]); return next; };
function dropStaged() {
  for (const [next] of staged) {
    const dir = path.dirname(next);
    if (!fs.existsSync(dir)) continue;
    // the file itself, and anything a step left half-written beside it
    for (const f of fs.readdirSync(dir)) if (f.startsWith(path.basename(next))) fs.rmSync(path.join(dir, f), { force: true });
  }
}
// wrote: a step has started writing under generated/ (pictures, the framework description); published: the catalogue is in
let wrote = false, published = false;
function publish() {
  for (const [next, file] of staged) if (fs.existsSync(next)) fs.renameSync(next, file);
  published = true;
}
/** The line that says what a stopped build did to the site. */
function siteLine() {
  if (published) return 'The catalogue was already written when this happened; build again once it is fixed.';
  if (!fs.existsSync(path.join(root, 'generated', 'catalog.json'))) return 'No catalogue was written: there is no site to show yet.';
  return wrote
    ? 'The catalogue was not changed: the site still lists the assets of the last finished build (pictures already redrawn stay as they are).'
    : 'The site was not changed: it still shows what the last finished build wrote.';
}
function stop(title, lines) {
  dropStaged();
  console.error(`\nBuild stopped: ${title}`);
  for (const l of lines) console.error(l ? `  ${l}` : '');
  console.error(`\n${siteLine()}`);
  process.exit(1);
}
async function step(name, fn) {
  const t0 = performance.now();
  let note;
  try { note = await fn(); } catch (e) {
    stop(`the ${name} step broke`, [e?.message ?? String(e), ...(has('--trace') ? String(e?.stack ?? '').split('\n').slice(1).map((l) => l.trim()) : ['(run again with --trace to see where in the code)'])]);
  }
  const ms = performance.now() - t0;
  rows.push([name, note, ms]);
  console.log(`  ${name.padEnd(11)} ${String(note).padEnd(52)} ${fmt(ms).padStart(8)}`);
}
const exists = (p) => fs.existsSync(path.join(root, p));
const importFrom = (p) => import(pathToFileURL(path.join(root, p)).href);

console.log(`Loadout build: ${root}`);

// ---- validate ----------------------------------------------------------------------
let loaded;
await step('validate', async () => {
  try { loaded = await loadAssets(root); } catch (e) { stop('an asset file could not be read', [e.message]); }
  const { sprites, sounds, bundles } = loaded;
  const problems = [];
  for (const s of sprites) for (const e of validateMeta(s.def.meta, 'sprite').errors) problems.push(`${s.file}: ${e}`);
  for (const s of sounds) for (const e of validateMeta(s.patch.meta, s.isMusic ? 'music' : 'sound').errors) problems.push(`${s.file}: ${e}`);
  // two assets with one id (a sprite file and a sound file of the same name): said once, naming both files
  const owners = new Map();
  for (const a of [...sprites, ...sounds]) owners.set(a.id, [...(owners.get(a.id) ?? []), a.file]);
  const shared = [...owners].filter(([, files]) => files.length > 1);
  for (const [id, files] of shared) problems.push(`Two assets share the id "${id}": ${files.join(' and ')}. Every asset needs its own id: rename one of the two files, and the "id" written inside it, to something else.`);
  const known = {
    sprite: sprites.map((s) => s.id),
    sound: sounds.filter((s) => !s.isMusic).map((s) => s.id),
    music: sounds.filter((s) => s.isMusic).map((s) => s.id),
  };
  // while an id belongs to two assets, a bundle that lists it cannot be judged: what it would say about that id
  // ("is a sprite; move it to the sprites list") is a symptom of the shared id, not a fault in the bundle
  const sharedQuoted = shared.map(([id]) => `"${id}"`);
  for (const { file, ...b } of bundles) for (const e of validateBundle(b, known).errors) if (!sharedQuoted.some((q) => e.includes(q))) problems.push(`${file}: ${e}`);
  if (problems.length) stop(`${problems.length} problem${problems.length > 1 ? 's' : ''} to fix`, problems);
  return `${sprites.length} sprites, ${known.sound.length} sounds, ${known.music.length} music, ${bundles.length} bundles`;
});

// ---- quality (before anything is written) -----------------------------------------------
// 'passed' | 'skipped' (--skip-quality) | 'missing' (this project has no quality code)
let checked = 'passed';
await step('quality', async () => {
  if (has('--skip-quality')) { checked = 'skipped'; return 'skipped (--skip-quality)'; }
  if (!exists('quality/sprite.js') || !exists('quality/sound.js')) { checked = 'missing'; return 'not run: quality/sprite.js or quality/sound.js does not exist yet'; }
  // worker threads, and a cache keyed on the files each asset really loads (tools/lib/quality-run.mjs)
  const { runQuality, failureReport } = await import(pathToFileURL(path.join(ROOT, 'tools', 'lib', 'quality-run.mjs')).href);
  const run = await runQuality({ root, cache: !has('--no-cache') });
  const failed = run.results.filter((r) => !r.ok || (r.errors ?? []).length);
  if (failed.length) {
    const lines = failureReport(run.results);
    // an asset that fails now may already be on the site: from a build that skipped the bar, or from before a change broke it
    let listed = [];
    try {
      const on = new Set(JSON.parse(fs.readFileSync(path.join(root, 'generated', 'catalog.json'), 'utf8')).assets.map((a) => a.id));
      listed = failed.filter((r) => on.has(path.basename(r.file).replace(/\.(m?js|json)$/, '')));
    } catch { /* no catalogue yet */ }
    if (listed.length) {
      lines.push('', `The site still lists ${listed.map((r) => (r.name ? `"${r.name}"` : r.file)).join(', ')}: ${listed.length === 1 ? 'it was' : 'they were'} taken in by an earlier build`
        + ' (one run with --skip-quality, or one made before the change that broke it). It stays there until a build passes:'
        + ' correct it, or move its file out of the project, and build again.');
    }
    stop(`${failed.length} asset${failed.length > 1 ? 's' : ''} did not pass the quality bar`, ['', ...lines]);
  }
  const warnings = run.results.reduce((n, r) => n + (r.warnings?.length ?? 0), 0);
  const cached = run.results.filter((r) => r.cached).length;
  return `${run.results.length} assets checked (${cached} unchanged, from the cache), ${warnings} warnings${run.notice ? `; ${run.notice}` : ''}`;
});

// ---- catalogue (worked out now, written last) ---------------------------------------------
const catalog = buildCatalog(loaded);

// From here on the build writes. A build that was killed part-way can leave a half-written <name>.next: clear those first.
wrote = true;
{
  const dir = path.join(root, 'generated');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/\.next(\.|$)/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
}

// ==== W5-A: the framework describes itself (Contract 11): generated/api.json, generated/framework.js ====
await step('framework', async () => (await import(pathToFileURL(path.join(ROOT, 'tools', 'lib', 'api.mjs')).href)).writeApi({ root }));
// ==== end W5-A ====

// ready-made versions of every asset (docs/site-design.md, section 4): generated/versions.json, read by the library and asset pages
await step('versions', async () => (await import(pathToFileURL(path.join(ROOT, 'tools', 'lib', 'versions-build.mjs')).href)).writeVersions({ root }));

// ---- thumbnails and strips -------------------------------------------------------------
await step('thumbnails', async () => {
  const r = writeImages({ root, sprites: loaded.sprites, sounds: loaded.sounds, force: has('--force') });
  return `${r.made.length} made, ${r.skipped.length} skipped, ${r.removed.length} removed`;
});

// ---- search index ----------------------------------------------------------------------
await step('search', async () => {
  if (has('--skip-search')) return 'skipped (--skip-search)';
  if (!exists('tools/lib/search-index.mjs')) return 'not built: tools/lib/search-index.mjs does not exist yet';
  const { buildSearchIndex } = await importFrom('tools/lib/search-index.mjs');
  const finalFile = path.join(root, 'generated', 'search.sqlite');
  fs.mkdirSync(path.dirname(finalFile), { recursive: true });
  const outFile = stage(finalFile);
  // Search by meaning needs one vector per asset from the embedding model (tools/lib/embed.mjs).
  // --no-meaning builds a keyword-only index; the site then stops at the keywords level.
  let embed = null, note = 'keywords only';
  if (!has('--no-meaning') && exists('tools/lib/embed.mjs')) {
    try {
      const { createEmbedder } = await importFrom('tools/lib/embed.mjs');
      const e = await createEmbedder();
      embed = e.embed;
      note = 'keywords and meaning';
    } catch (e) {
      note = `keywords only (the embedding model could not be loaded: ${e.message})`;
    }
  }
  await buildSearchIndex({ assets: catalog.assets, outFile, embed });
  return `-> ${rel(finalFile)} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB, ${note})`;
});

// ---- catalogue: the files that say which assets exist, swapped in together ----------------
await step('catalogue', async () => {
  const out = path.join(root, 'generated', 'catalog.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(stage(out), JSON.stringify(catalog) + '\n');
  // every sound and music patch in one file, so the site makes one request instead of one per sound
  const all = path.join(root, 'generated', 'sounds.json');
  fs.writeFileSync(stage(all), JSON.stringify({ version: 1, patches: loaded.sounds.map((s) => s.patch) }) + '\n');
  publish();
  return `${catalog.assets.length} assets, ${catalog.bundles.length} bundles -> ${rel(out)} (${(fs.statSync(out).size / 1024).toFixed(1)} KB), ${rel(all)} (${(fs.statSync(all).size / 1024).toFixed(1)} KB)`;
});

// ---- vendor ----------------------------------------------------------------------------
await step('vendor', async () => {
  if (has('--skip-vendor')) return 'skipped (--skip-vendor)';
  if (!exists('tools/lib/vendor.mjs')) return 'not run: tools/lib/vendor.mjs does not exist yet';
  const { vendorAll } = await importFrom('tools/lib/vendor.mjs');
  await vendorAll({ root, meaning: !has('--no-meaning') });
  return 'done';
});

// ---- dist ------------------------------------------------------------------------------
if (has('--dist')) {
  await step('dist', async () => {
    const dist = path.join(root, 'dist');
    fs.rmSync(dist, { recursive: true, force: true });
    fs.mkdirSync(dist, { recursive: true });
    const copied = [];
    for (const p of DIST) if (exists(p)) { fs.cpSync(path.join(root, p), path.join(dist, p), { recursive: true }); copied.push(p); }
    return `${copied.length} folders and files -> ${rel(dist)}`;
  });
}

console.log(`Done in ${fmt(performance.now() - started)}.`);
// the last words of a build that did not check its assets: nobody should take it for a checked one
if (checked !== 'passed') {
  const why = checked === 'skipped' ? 'it was run with --skip-quality' : 'this project has no quality/sprite.js or quality/sound.js';
  console.log(`\nNOT CHECKED: this build left out the quality bar (${why}), so the site${has('--dist') ? ' and dist/' : ''} may show assets that do not pass it.`);
  console.log(checked === 'skipped'
    ? 'Fine for a quick look. Before you publish or share the site, build without --skip-quality:  node tools/build.mjs'
    : 'Add the quality code, then build again:  node tools/build.mjs');
}
