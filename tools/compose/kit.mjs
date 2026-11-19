// kit.mjs: the command line of the music kit. The composing and measuring functions themselves are framework code
// in sound/compose.js (browser-safe; read its header for the list and a worked example); this file passes every one
// of them on, so a generator imports everything from here, and adds what needs files:
//
//   writePatch(patch, file)          writes a patch as JSON (to sounds/<id>.json when no file is given)
//   run(build, args, { log })        what a generator's command line does, as a function (tests call it)
//   main(build, import.meta.url)     the last line of a generator: runs `run` when the file is the program
//
// A generator's command line. Experiment in a scratch file; sounds/ is the live library, and the site build reads it:
//
//   node tools/compose/<track>.mjs --out /tmp/try/<id>.json   write the patch to a scratch file. Then check and look at THAT file:
//                                                             node tools/sfx.mjs check /tmp/try/<id>.json --no-cache
//                                                             node tools/compose/verify_music.mjs /tmp/try/<id>.json 16 intensity
//                                                             node tools/compose/kit.mjs measure /tmp/try/<id>.json
//   node tools/compose/<track>.mjs --dry       build and check the piece, print its summary, write nothing
//   node tools/compose/<track>.mjs --match     measure the five melody instruments and print the gains that level them
//   node tools/compose/<track>.mjs --measure   print the quick report: instrument, section, intensity and layer levels,
//                                              in under a minute on a busy machine (low sample rates, one pass)
//   node tools/compose/<track>.mjs --measure --full   the full report: every length and every instrument at 44.1 kHz
//                                              (about 45 loops of the piece: minutes)
//   node tools/compose/<track>.mjs --help      print this list; writes nothing
//   node tools/compose/<track>.mjs             only when the piece is ready: writes sounds/<id>.json
//
// An option the generator does not know is refused and nothing is written. Every patch the kit writes carries its
// `meta` (assemble refuses a piece without it), so writing a track again is always safe.
//
//   node tools/compose/kit.mjs measure <patch.json> [--node lF] [--full]     the quick (or full) report for a patch file
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KitError, lint, matchGains, report } from '../../sound/compose.js';

export * from '../../sound/compose.js';

const SOUNDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sounds');
const USAGE = `usage: node tools/compose/<track>.mjs [option]
  --out <file>   write the patch to this file (use a scratch folder to experiment)
  --dry          build and check the piece, print its summary, write nothing
  --match        measure the five melody instruments and print the gains that level them
  --measure      print instrument, section, intensity and layer levels, quickly (under a minute)
  --measure --full   the same from full renders of every length and instrument (minutes)
  --help         print this
  (no option)    write sounds/<id>.json, the live library: only when the piece is ready`;

/** Writes a patch as JSON and returns the path. Arguments: patch; file (default: sounds/<id>.json, the live library). */
export function writePatch(patch, file = path.join(SOUNDS_DIR, `${patch.id}.json`)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(patch, null, 1) + '\n');
  return file;
}

/**
 * What a generator's command line does: writes, measures or only checks the piece, and says what it did.
 * Arguments: build(gains), which returns the assembled patch (with the track's own gains when called with none);
 * args: the options (--out <file>, --dry, --match, --measure, --measure --full, --help; none writes sounds/<id>.json);
 * { log: where the text goes (console.log), node: the melody bus ('lF'), layers: { name: expression } for the report }.
 * Returns { action: 'write' | 'dry' | 'match' | 'measure' | 'help', file, patch, mode: 'quick' | 'full' }. An unknown option throws a
 * KitError before anything is built or written.
 */
export function run(build, args = [], { log = console.log, node = 'lF', layers } = {}) {
  const flags = new Set();
  let out = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') {
      out = args[++i];
      if (!out || out.startsWith('--')) throw new KitError(`--out needs a file: --out /tmp/try/<id>.json\n${USAGE}`);
    } else if (['--dry', '--match', '--measure', '--full', '--help'].includes(a)) flags.add(a);
    else throw new KitError(`"${a}" is not an option of a track generator; nothing was written.\n${USAGE}`);
  }
  if (flags.has('--help')) { log(USAGE); return { action: 'help' }; }
  if (flags.has('--full') && !flags.has('--measure')) throw new KitError(`--full goes with --measure (the full report); nothing was written.\n${USAGE}`);
  if (flags.has('--match')) {
    const m = matchGains(build, { node });
    log(`before: ${m.before.map((l) => `${l.name} ${l.db.toFixed(1)}`).join(' · ')} dB`);
    log(`after:  ${m.after.map((l) => `${l.name} ${l.db.toFixed(1)}`).join(' · ')} dB`);
    log(`gains:  [${m.gains.join(', ')}]   <- write these in as the track's gains`);
    return { action: 'match', gains: m.gains };
  }
  const patch = build();
  const summary = `${patch.id}: ${patch.nodes.length} nodes, ${patch.params.length} controls, ${JSON.stringify(patch).length} bytes`;
  if (flags.has('--measure')) {
    const mode = flags.has('--full') ? 'full' : 'quick';
    log(report(patch, { node, layers, quick: mode === 'quick' }));
    return { action: 'measure', patch, mode };
  }
  if (flags.has('--dry')) {
    log(`dry run, nothing written. ${summary}`);
    for (const n of lint(patch)) log(`style guide: ${n}`);
    return { action: 'dry', patch };
  }
  const file = writePatch(patch, out ? path.resolve(out) : undefined);
  log(`wrote ${out ? file : path.relative(process.cwd(), file)}. ${summary}`);
  for (const n of lint(patch)) log(`style guide: ${n}`);
  return { action: 'write', file, patch };
}

const isMain = (url) => !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === url;

/**
 * The last line of a track's generator: main(build, import.meta.url). Runs `run` with the command line's options
 * when the file is the program, and does nothing when it is imported (by a test, say).
 * Arguments: build(gains); url: the generator's import.meta.url; { node, layers } as for run.
 */
export function main(build, url, opts = {}) {
  if (!isMain(url)) return null;
  try { return run(build, process.argv.slice(2), opts); } catch (e) {
    if (!(e instanceof KitError)) throw e;
    console.error(e.message);
    process.exitCode = 1;
    return null;
  }
}

// node tools/compose/kit.mjs measure <patch.json> [--node lF] [--full]
if (isMain(import.meta.url)) {
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (cmd !== 'measure' || !file) { console.log('usage: node tools/compose/kit.mjs measure <patch.json> [--node <melody bus, default lF>] [--full]'); process.exit(cmd ? 1 : 0); }
  const i = rest.indexOf('--node');
  console.log(report(JSON.parse(fs.readFileSync(file, 'utf8')), { ...(i >= 0 ? { node: rest[i + 1] } : {}), quick: !rest.includes('--full') }));
}
export * from '../../sound/bands.js';
