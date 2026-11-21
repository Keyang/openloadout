// Pixel counts of the projectile redraws against the code they redraw (migration batch E3; review of E3 round 2,
// issues 3 and 6: the boulder's moss could be deleted, and the acid's drips drawn uninked, with every test still
// passing). For each case (the defaults, every option of a choice, every on/off flipped, every slider at both ends,
// and the settings a review named) and each frame: stray pixels (no neighbour, corners included), uninked pixels (not
// ink, beside a see-through pixel across or down), ink pixels, and moss pixels (green well above red and blue) split in
// two (build item E3b; review of E3 round 3, issue 2): `moss`, the bright patch, and `mossLine`, its dark line, each
// pixel going to the one whose brightness it is nearer (the default Moss colour, or that colour one tone darker, which
// is the line engine/fx.js rock draws and the data file's accent.dark).
// tests/unit/projectile-writers.test.mjs holds each data file to the code's counts recorded here.
//
//   node tools/projectiles/counts.mjs record --from <dir> [<id> ...] [--out <file>]
//        draws <dir>/<id>.js, a frozen copy of the old code sprite (tests/fixtures/code-sprites holds boulder-chunk only;
//        sprites/ holds data only) for each id named, or for each projectile the folder has a file for, at every case, and
//        merges them into tests/fixtures/redraw-counts/projectiles.json (--out <file>: that file instead; the record's own
//        `recorded` and `from` stay as they were, and each id recorded now is listed under `rerecorded`). An id that is
//        not named and has no file keeps the record it has; an id that is named and has no file is refused. The other
//        records (scatter-pellet and the rest) are pinned: tests/unit/projectile-writers.test.mjs holds them.
//   node tools/projectiles/counts.mjs show <id>              the data file's counts beside the record, per clip
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, PROJECTILE_IDS } from './lib.mjs';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { INK, col, tone } from '../../engine/color.js';

/** Where the record lives. */
export const COUNTS_FILE = path.join(ROOT, 'tests', 'fixtures', 'redraw-counts', 'projectiles.json');
/** Settings a review named, beyond the generated cases. */
const NAMED = {
  'boulder-chunk': [{ shape: 'slab', size: 1, pieces: 1 }, { shape: 'jagged', size: 0, wear: 1 }, { shape: 'slab', pieces: 1 }],
  'acid-glob': [{ shape: 'teardrop', pieces: 1 }, { size: 1, pieces: 1 }],
  'scatter-pellet': [{ shape: 'shard', length: 1 }, { shape: 'shard', length: 1, flicker: 1 }],
};

/** The cases of a sprite: name -> settings (over its defaults). Made from its controls, so the code and the data agree. */
export function casesOf(sprite, id) {
  const out = { defaults: {} }, lo = {}, hi = {};
  for (const [k, d] of Object.entries(sprite.params ?? {})) {
    if (k === 'speed') continue;
    if (d.kind === 'choice') for (const o of d.options) { const v = typeof o === 'object' ? o.value : o; if (v !== d.def) out[`${k}=${v}`] = { [k]: v }; }
    else if (d.kind === 'toggle') out[`${k}=${!d.def}`] = { [k]: !d.def };
    else if (d.kind === 'range') { lo[k] = d.min ?? 0; hi[k] = d.max ?? 1; }
  }
  if (Object.keys(lo).length) { out.low = lo; out.high = hi; }
  for (const s of NAMED[id] ?? []) out[Object.entries(s).map(([k, v]) => `${k}=${v}`).join(',')] = s;
  return out;
}

const INK_PX = col(INK);
/** The Moss colour the counts split by when a sprite has none (the boulder's default). */
const MOSS_DEFAULT = '#a4c44a';
const luma = (p) => 0.3 * (p & 255) + 0.59 * ((p >> 8) & 255) + 0.11 * ((p >> 16) & 255);
/** The brightness between a Moss colour and its dark line (one tone darker): a moss pixel below it is line. */
export const mossSplit = (hex = MOSS_DEFAULT) => (luma(col(hex)) + luma(col(tone(hex, -1)))) / 2;
/** The counts of one frame (a Surface): { stray, uninked, ink, moss, mossLine }; `split` is mossSplit of the Moss colour. */
export function countFrame(g, split = mossSplit()) {
  const { w, h, data } = g, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] >>> 24 !== 0;
  let stray = 0, uninked = 0, ink = 0, moss = 0, mossLine = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    const p = data[y * w + x];
    if (p === INK_PX) ink++;
    else if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) uninked++;
    const R = p & 255, G = (p >> 8) & 255, B = (p >> 16) & 255;
    if (G > R + 30 && G > B + 30) { if (luma(p) < split) mossLine++; else moss++; }
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && on(x + dx, y + dy)) { near = true; break; }
    if (!near) stray++;
  }
  return { stray, uninked, ink, moss, mossLine };
}

/** Every count of a sprite: { case: { clip: [[stray, uninked, ink, moss, mossLine] per frame] } }. */
export function countsOf(sprite, id) {
  const out = {}, a = defaultParams(sprite).accent, split = mossSplit(typeof a === 'string' && /^#[0-9a-f]{6}$/i.test(a) ? a : undefined);
  for (const [name, set] of Object.entries(casesOf(sprite, id))) {
    out[name] = {};
    for (const [clip, c] of Object.entries(sprite.clips)) out[name][clip] = Array.from({ length: c.frames }, (_, f) => Object.values(countFrame(renderFrame(sprite, clip, f, { ...defaultParams(sprite), ...set }), split)));
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'record') {
    const take = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? path.resolve(rest[i + 1]) : null; };
    const dir = take('--from'), out = take('--out') ?? COUNTS_FILE;
    const named = rest.filter((x, i) => !x.startsWith('--') && !['--from', '--out'].includes(rest[i - 1]));
    if (!dir) { console.error('usage: node tools/projectiles/counts.mjs record --from <dir with a frozen copy <id>.js: tests/fixtures/code-sprites> [<id> ...] [--out <file>]'); process.exit(2); }
    for (const id of named) if (!PROJECTILE_IDS.includes(id)) { console.error(`${id} is not a projectile of tools/projectiles (${PROJECTILE_IDS.join(', ')})`); process.exit(2); }
    const have = (id) => path.join(dir, `${id}.js`);
    const ids = named.length ? named : PROJECTILE_IDS.filter((id) => fs.existsSync(have(id)));
    for (const id of ids) if (!fs.existsSync(have(id))) { console.error(`no frozen copy ${id}.js in ${dir} (tests/fixtures/code-sprites holds boulder-chunk only)`); process.exit(2); }
    if (!ids.length) { console.error(`no projectile code file in ${dir}`); process.exit(2); }
    let rec = { sprites: {} };
    try { rec = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { /* a new record */ }
    // provenance stays true: a new file gets the date and source at its top; a record that exists keeps its own (the entries it was
    // first made from), and each id recorded now is listed under `rerecorded` with today's date and the folder it came from
    const today = new Date().toISOString().slice(0, 10), fromText = `the code sprites before their redraw (frozen copies, ${path.relative(ROOT, dir)})`;
    const fresh = !rec.recorded;
    rec = { ...(fresh ? { recorded: today, from: fromText } : {}), ...rec, fields: ['stray', 'uninked', 'ink', 'moss', 'mossLine'], sprites: { ...rec.sprites } };
    for (const id of ids) {
      rec.sprites[id] = countsOf((await import(pathToFileURL(have(id)).href)).default, id);
      if (!fresh) rec.rerecorded = { ...rec.rerecorded, [id]: { recorded: today, from: fromText } };
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(rec) + '\n');
    console.log(`wrote ${path.relative(ROOT, out)}: ${ids.join(', ')}`);
  } else if (mode === 'show') {
    const { loadDataSprite } = await import('../lib/assets.mjs');
    const rec = JSON.parse(fs.readFileSync(COUNTS_FILE, 'utf8'));
    for (const id of rest.length ? rest : PROJECTILE_IDS) {
      const s = await loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`)), now = countsOf(s, id);
      for (const [cs, clips] of Object.entries(now)) for (const [clip, fr] of Object.entries(clips)) {
        const old = rec.sprites[id]?.[cs]?.[clip] ?? [];
        const sum = (rows, k) => rows.reduce((a, r) => a + (r?.[k] ?? 0), 0);
        console.log(`${id} ${cs} ${clip}: ` + rec.fields.map((f, k) => `${f} ${sum(old, k)}->${sum(fr, k)}`).join('  '));
      }
    }
  } else { console.error('usage: node tools/projectiles/counts.mjs record --from <dir> [<id> ...] [--out <file>] | show [<id> ...]'); process.exit(2); }
}
