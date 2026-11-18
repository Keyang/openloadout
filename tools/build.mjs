#!/usr/bin/env node
// The site build. Finds every asset by scanning sprites/, sounds/ and bundles/, then:
//
//   validate    every asset's meta and every bundle (exit 1 with what to fix)
//   catalogue   generated/catalog.json
//   thumbnails  generated/thumbs/ and generated/strips/ (unchanged assets are skipped; hashes in .cache/build.json)
//   quality     quality/sprite.js and quality/sound.js, when they exist
//   search      generated/search.sqlite, when tools/lib/search-index.mjs exists
//   vendor      vendor/, when tools/lib/vendor.mjs exists
//   dist        with --dist: the publishable site copied to dist/
//
//   node tools/build.mjs [--root <dir>] [--dist] [--skip-quality] [--skip-search] [--skip-vendor] [--force]
//
// --root builds another copy of the project (the tests use it). --force redraws every picture.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadAssets } from './lib/assets.mjs';
import { buildCatalog } from './lib/catalog.mjs';
import { writeImages } from './lib/thumbs.mjs';
import { validateMeta, validateBundle } from '../catalog/schema.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const USAGE = 'usage: node tools/build.mjs [--root <folder>] [--dist] [--skip-quality] [--skip-search] [--skip-vendor] [--force]';
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
async function step(name, fn) {
  const t0 = performance.now();
  const note = await fn();
  const ms = performance.now() - t0;
  rows.push([name, note, ms]);
  console.log(`  ${name.padEnd(11)} ${String(note).padEnd(52)} ${fmt(ms).padStart(8)}`);
}
function stop(title, lines) {
  console.error(`\nBuild stopped: ${title}`);
  for (const l of lines) console.error(`  ${l}`);
  process.exit(1);
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
  const seen = new Map();
  for (const a of [...sprites, ...sounds]) {
    if (seen.has(a.id)) problems.push(`${a.file}: id "${a.id}" is also used by ${seen.get(a.id)}; every asset needs its own id`);
    else seen.set(a.id, a.file);
  }
  const known = {
    sprite: sprites.map((s) => s.id),
    sound: sounds.filter((s) => !s.isMusic).map((s) => s.id),
    music: sounds.filter((s) => s.isMusic).map((s) => s.id),
  };
  for (const { file, ...b } of bundles) for (const e of validateBundle(b, known).errors) problems.push(`${file}: ${e}`);
  if (problems.length) stop(`${problems.length} problem${problems.length > 1 ? 's' : ''} to fix`, problems);
  return `${sprites.length} sprites, ${known.sound.length} sounds, ${known.music.length} music, ${bundles.length} bundles`;
});

// ---- catalogue ---------------------------------------------------------------------
let catalog;
await step('catalogue', async () => {
  catalog = buildCatalog(loaded);
  const out = path.join(root, 'generated', 'catalog.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(catalog) + '\n');
  return `${catalog.assets.length} assets, ${catalog.bundles.length} bundles -> ${rel(out)} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`;
});

// ---- thumbnails and strips -------------------------------------------------------------
await step('thumbnails', async () => {
  const r = writeImages({ root, sprites: loaded.sprites, sounds: loaded.sounds, force: has('--force') });
  return `${r.made.length} made, ${r.skipped.length} skipped, ${r.removed.length} removed`;
});

// ---- quality -----------------------------------------------------------------------
await step('quality', async () => {
  if (has('--skip-quality')) return 'skipped (--skip-quality)';
  if (!exists('quality/sprite.js')) return 'not run: quality/sprite.js does not exist yet';
  const { checkSprite } = await importFrom('quality/sprite.js');
  const checkSound = exists('quality/sound.js') ? (await importFrom('quality/sound.js')).checkSound : null;
  const soundIndex = new Map(loaded.sounds.map((s) => [s.id, s.patch]));
  const errors = [];
  let warnings = 0, checked = 0;
  for (const s of loaded.sprites) {
    const r = checkSprite(s.def, { soundIndex });
    checked++; warnings += r.warnings?.length ?? 0;
    for (const e of r.errors ?? []) errors.push(`${s.file}: ${e}`);
  }
  if (checkSound) for (const s of loaded.sounds) {
    const r = checkSound(s.patch);
    checked++; warnings += r.warnings?.length ?? 0;
    for (const e of r.errors ?? []) errors.push(`${s.file}: ${e}`);
  }
  if (errors.length) stop(`${errors.length} asset${errors.length > 1 ? 's do' : ' does'} not meet the quality bar`, errors);
  return `${checked} assets checked, ${warnings} warnings`;
});

// ---- search index ----------------------------------------------------------------------
await step('search', async () => {
  if (has('--skip-search')) return 'skipped (--skip-search)';
  if (!exists('tools/lib/search-index.mjs')) return 'not built: tools/lib/search-index.mjs does not exist yet';
  const { buildSearchIndex } = await importFrom('tools/lib/search-index.mjs');
  const outFile = path.join(root, 'generated', 'search.sqlite');
  await buildSearchIndex({ assets: catalog.assets, outFile });
  return `-> ${rel(outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`;
});

// ---- vendor ----------------------------------------------------------------------------
await step('vendor', async () => {
  if (has('--skip-vendor')) return 'skipped (--skip-vendor)';
  if (!exists('tools/lib/vendor.mjs')) return 'not run: tools/lib/vendor.mjs does not exist yet';
  const { vendorAll } = await importFrom('tools/lib/vendor.mjs');
  await vendorAll({ root });
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
