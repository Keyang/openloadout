#!/usr/bin/env node
// Writes bundles/<id>.json for each kit plan in bundles/specs/*.plan.json whose assets all exist.
//
//   node tools/bundles-from-plans.mjs            write the bundle file of every finished plan; say what the others still lack
//   node tools/bundles-from-plans.mjs --check    write nothing; exit 1 if any plan is not finished
//   --root <dir>                                 work on another copy of the project (the tests use it)
//
// A plan is the art direction's list of what a kit holds. The bundle file is what the site reads
// (docs/architecture.md, Contract 4): it is written only when every listed asset file is present, so the
// build never sees a bundle that names a missing asset.
//
// HOW TO ADD A KIT. A kit is new files only; no code in this tool or in the site knows any kit by name.
//   1. Write bundles/specs/<id>.plan.json. The tool reads these fields:
//        id        the kit's id; the file is named after it
//        name      the name shown on the site
//        gameType  one of the game types in catalog/schema.js
//        blurb     one sentence for the kit's page: what a game maker gets
//        palette   { name, colours }: the palette the kit's sprites are coloured from (see below)
//        sprites, sounds, music   what it holds: lists of ids, or of { id, ... } rows
//        level     optional; "kit" when left out
//        size      optional; { sprites, sounds, music }, each [fewest, most]: the size this kit is held to
//      A full kit holds 40 to 50 sprites, 20 sounds and 2 music tracks (KIT_SIZE in tools/lib/assets.mjs). A plan
//      that is meant to be another size says so in "size" (kitSize in tools/lib/assets.mjs), and then gets a size
//      note only when it is outside its own size.
//   2. Make the assets: sprites/<id>.json and sounds/<id>.json for every id the plan lists.
//   3. Run this tool, then the build (node tools/build.mjs).
//
// THE PALETTE is the one thing a new kit may need in code, because sprites take their colours from
// engine/palettes.js while they are drawn, in the browser too. Two cases:
//   - the kit reuses a palette that exists: "palette": { "name": "<that palette>" } and nothing else to do;
//   - the kit brings a new palette: list its colours in the plan, and add the same colours to engine/palettes.js
//     under the palette's name in lower case (the colours, its swatch lists in GROUPS, its line in NEVER_SWATCH,
//     and a line in BUNDLE_PALETTE if sprites should be able to name the palette by the kit's id), then run
//     node --test tests/unit/palettes-core.test.mjs. docs/style-guide.md section 3 describes the palettes.
// This tool checks that step: a plan whose palette the engine does not have, or has with other colours, is not
// written, and the message says what to add.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, loadPlans, KIT_SIZE, kitSize, findSpriteFile } from './lib/assets.mjs';

const idsOf = (list) => (list ?? []).map((x) => (typeof x === 'string' ? x : x.id));
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const range = ([lo, hi]) => (lo === hi ? `${lo}` : `${lo} to ${hi}`);

/** The bundle file of a plan: what the site reads (docs/architecture.md, Contract 4). */
export function bundleFromPlan(plan) {
  return {
    id: plan.id, name: plan.name, gameType: plan.gameType, level: plan.level ?? 'kit', blurb: plan.blurb,
    sprites: idsOf(plan.sprites), sounds: idsOf(plan.sounds), music: idsOf(plan.music), theme: {},
  };
}

/**
 * What stops a plan from being written, other than assets still to come: lines of text, each saying what to do.
 * palettes: the exports of the project's engine/palettes.js, or null when the project has none.
 */
export function planProblems(plan, file, palettes) {
  const problems = [];
  for (const key of ['name', 'gameType']) if (typeof plan[key] !== 'string' || !plan[key].trim()) problems.push(`Its plan has no "${key}". Add it to ${file}.`);
  if (typeof plan.blurb !== 'string' || !plan.blurb.trim()) {
    problems.push(`Its plan has no "blurb". Add one sentence to ${file} that tells a game maker what is in the kit; it is shown on the kit's page. For example:\n`
      + '      "blurb": "Everything for a side-view platformer: a hero, enemies and a boss, ground and platforms, pickups, effects, sounds and two tracks.",');
  }
  const pal = plan.palette;
  if (pal !== undefined && palettes) {
    const name = typeof pal === 'string' ? pal : pal?.name;
    const known = Object.keys(palettes.PALETTE ?? {});
    let key = null;
    try { key = palettes.paletteName(name); } catch { /* not there */ }
    if (!name) problems.push(`Its plan has a "palette" with no "name". Give the palette's name in ${file}: one of ${known.join(', ')}, or the name of a new one.`);
    else if (!key) {
      problems.push(`Its plan names the palette "${name}", and engine/palettes.js does not have it yet.\n`
        + '    A new kit may bring its own palette. Adding it is the one code step of a new kit:\n'
        + `      1. In engine/palettes.js add the palette "${String(name).toLowerCase()}": its colours (the same as "palette.colours" in ${file}),\n`
        + `         its swatch lists in GROUPS, its line in NEVER_SWATCH, and '${plan.id}': '${String(name).toLowerCase()}' in BUNDLE_PALETTE.\n`
        + '      2. Run:  node --test tests/unit/palettes-core.test.mjs\n'
        + `    Or use a palette that is already there (${known.join(', ')}): put its name in "palette.name" in the plan and leave the colours out.`);
    } else if (pal?.colours) {
      const code = palettes.PALETTE[key];
      const differ = [...new Set([...Object.keys(pal.colours), ...Object.keys(code)])].filter((c) => String(pal.colours[c]).toLowerCase() !== String(code[c]).toLowerCase());
      if (differ.length) {
        problems.push(`Its plan and engine/palettes.js do not agree on ${count(differ.length, 'colour')} of the palette "${name}": `
          + `${differ.map((c) => `${c} (plan ${pal.colours[c] ?? 'has none'}, engine ${code[c] ?? 'has none'})`).join('; ')}.\n`
          + `    Sprites are drawn with the engine's colours, so make the two the same: correct ${file} or engine/palettes.js, then run  node --test tests/unit/palettes-core.test.mjs`);
      }
    }
  }
  return problems;
}

/** A note for a plan that is outside its size (its own "size" when it declares one, else the size of a full kit), or null. file: the plan's file. */
function sizeNote(bundle, plan, file) {
  const size = kitSize(plan, KIT_SIZE);
  const off = Object.entries(size).filter(([kind, [lo, hi]]) => bundle[kind].length < lo || bundle[kind].length > hi);
  if (!off.length) return null;
  const tracks = (kind) => (kind === 'music' ? 'music tracks' : kind);
  if (plan.size !== undefined) {
    return `this plan says its kit holds ${Object.entries(size).map(([kind, r]) => `${range(r)} ${tracks(kind)}`).join(', ')} ("size" in ${file}); `
      + `it lists ${off.map(([kind]) => `${bundle[kind].length} ${tracks(kind)}`).join(' and ')}. Bring the plan's lists and its "size" together; the site's acceptance test (tests/e2e/three-bundles.spec.mjs) holds the kit to the size its plan says.`;
  }
  return `a full kit holds ${Object.entries(KIT_SIZE).map(([kind, r]) => `${range(r)} ${tracks(kind)}`).join(', ')}; `
    + `this plan lists ${off.map(([kind]) => `${bundle[kind].length} ${tracks(kind)}`).join(' and ')}. A smaller kit is allowed (SMALL_KIT_SIZE in tools/lib/assets.mjs); the site's acceptance test (tests/e2e/three-bundles.spec.mjs) needs at least three full kits.`;
}

async function main(args) {
  const check = args.includes('--check');
  const rootArg = args.indexOf('--root');
  if (rootArg >= 0 && (!args[rootArg + 1] || args[rootArg + 1].startsWith('--'))) { console.error('--root needs a folder.\nusage: node tools/bundles-from-plans.mjs [--check] [--root <folder>]'); return 1; }
  const root = rootArg >= 0 ? path.resolve(args[rootArg + 1]) : ROOT;

  let plans;
  try { plans = loadPlans(root); } catch (e) { console.error(`A kit plan could not be read.\n  ${e.message}`); return 1; }
  if (!plans.length) { console.log('No kit plans in bundles/specs/ (a plan is a file named <id>.plan.json).'); return 0; }
  let palettes = null;
  const palettesFile = path.join(root, 'engine', 'palettes.js');
  if (fs.existsSync(palettesFile)) {
    try { palettes = await import(pathToFileURL(palettesFile).href); } catch (e) { console.error(`engine/palettes.js could not be loaded, so no plan's palette can be checked.\n  ${e.message}`); return 1; }
  }

  let waiting = 0, wrong = 0;
  for (const { file, plan } of plans) {
    const bundle = bundleFromPlan(plan);
    const problems = planProblems(plan, file, palettes);
    if (problems.length) {
      wrong++;
      console.log(`${plan.id}: not written. ${problems.join(`\n${plan.id}: also: `)}`);
      continue;
    }
    const missing = [
      // a sprite is there as a data file (findSpriteFile); one still to come is made as a data file (docs/data-sprites.md, DQ1)
      ...bundle.sprites.filter((id) => !findSpriteFile(root, id)).map((id) => `sprites/${id}.json`),
      ...[...bundle.sounds, ...bundle.music].filter((id) => !fs.existsSync(path.join(root, 'sounds', `${id}.json`))).map((id) => `sounds/${id}.json`),
    ];
    if (missing.length) {
      waiting++;
      console.log(`${plan.id}: not written, ${count(missing.length, 'asset')} still to come: ${missing.join(', ')}`);
      continue;
    }
    if (!check) fs.writeFileSync(path.join(root, 'bundles', `${plan.id}.json`), JSON.stringify(bundle, null, 2) + '\n');
    console.log(`${plan.id}: ${check ? 'complete' : 'written'} (${count(bundle.sprites.length, 'sprite')}, ${count(bundle.sounds.length, 'sound')}, ${count(bundle.music.length, 'track')})`);
    const note = sizeNote(bundle, plan, file);
    if (note) console.log(`${plan.id}: note: ${note}`);
  }
  // a mistake in a plan fails either way; assets still being made only fail --check
  return wrong || (check && waiting) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
