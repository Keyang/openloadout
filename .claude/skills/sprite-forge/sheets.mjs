#!/usr/bin/env node
// Two contact sheets the sprite-forge skill asks for that tools/render.mjs does not write. Run in the Loadout folder
// (or pass --root <dir>); reads sprites, writes PNGs to out/, never edits anything else.
//
//   node <skill>/sheets.mjs looks <id>     out/<id>-looks.png: rows Original, Sunset, Night, Mono, Handheld (the whole-bundle
//                                          looks), one cell per clip at frame 0. Shapes that merge under a look show here.
//   node <skill>/sheets.mjs redraw <id> [--old <file>]
//                                          out/<id>-redraw.png: the old sprite beside the new data sprite (sprites/<id>.json).
//                                          The old one is read by path and never from sprites/ (the build refuses a code file
//                                          there): --old <file>, else the frozen copy tests/fixtures/code-sprites/<id>.js. It may
//                                          also be a data file (a copy of the sprite before it is changed). Per setting (defaults, all
//                                          low, all high, every option of every old choice) and per clip: an OLD row, then a
//                                          NEW row, every frame. The rows are printed, as the picture has no words. Old
//                                          settings reach the new sprite through its `was` maps (engine/sprite.js cleanParams).
//   --scale 3   bigger pixels
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const isLoadout = (d) => fs.existsSync(path.join(d, 'engine/gen/registry.js')) && fs.existsSync(path.join(d, 'tools/check.mjs'));
const root = opt('root', null) ? path.resolve(opt('root')) : isLoadout(process.cwd()) ? process.cwd() : path.resolve(here, '../../..');
const [cmd, id] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const k = Number(opt('scale', 3));
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { encodePNG } = await load('tools/png.mjs');
const { renderFrame, defaultParams, cleanParams } = await load('engine/sprite.js');
const { THEME_PRESETS, renderThemedFrame } = await load('engine/theme.js');
const { findSpriteFile, loadDataSprite } = await load('tools/lib/assets.mjs');

/** The sprite of a file: a data file through the project's loader, an old code file (a frozen copy, only ever read here for a redraw) by import. */
async function spriteOf(file) {
  return file.endsWith('.json') ? loadDataSprite(root, file) : (await import(pathToFileURL(file).href)).default;
}
/** Settings at one end of every control: 0 = all low, 1 = all high. */
function ends(s, i) {
  return Object.fromEntries(Object.entries(s.params).map(([key, d]) => [key, d.kind === 'range' ? [d.min, d.max][i] : d.kind === 'toggle' ? !!i : d.kind === 'choice' ? d.options.at(-i).value : d.def]));
}
/** Writes rows of frames (each a Surface or null) as one PNG on a grey checker, every cell w x h at scale k. */
function writeRows(file, rows, w, h) {
  const cols = Math.max(1, ...rows.map((r) => r.length)), W = cols * w * k, H = rows.length * h * k;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const g = ((Math.floor(x / (w * k)) + Math.floor(y / (h * k))) % 2) ? 120 : 140; px.set([g, g, g + 12, 255], (y * W + x) * 4); }
  rows.forEach((row, r) => row.forEach((g, c) => {
    if (!g) return;
    const b = g.bytes ? g.bytes() : g;
    for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) {
      const j = (Math.floor(y / k) * w + Math.floor(x / k)) * 4;
      if (b[j + 3]) px.set(b.subarray(j, j + 4), ((r * h * k + y) * W + c * w * k + x) * 4);
    }
  }));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(W, H, px));
}

if (cmd === 'looks' && id) {
  const file = findSpriteFile(root, id);
  if (!file) { console.error(`no sprite ${id} in ${root}/sprites`); process.exit(1); }
  const s = await spriteOf(file), [w, h] = s.size, clips = Object.keys(s.clips);
  const looks = THEME_PRESETS.filter((l) => ['original', 'sunset', 'night', 'handheld', 'mono'].includes(l.id));
  const rows = looks.map((l) => clips.map((c) => renderThemedFrame(s, c, 0, {}, l.theme)));
  const out = path.join(root, 'out', `${id}-looks.png`);
  writeRows(out, rows, w, h);
  console.log(out + `\n  rows: ${looks.map((l) => l.id).join(', ')}; columns: ${clips.join(', ')} (frame 0)`);
} else if (cmd === 'redraw' && id) {
  const oldFile = opt('old', null) ? path.resolve(opt('old')) : path.join(root, 'tests', 'fixtures', 'code-sprites', `${id}.js`), newFile = path.join(root, 'sprites', `${id}.json`);
  if (path.dirname(path.resolve(oldFile)) === path.join(root, 'sprites') && /\.(m?js|cjs|ts)$/.test(oldFile)) { console.error(`${path.relative(root, oldFile)} is in sprites/, where the build refuses any code file: keep the old sprite outside it (the frozen copy is tests/fixtures/code-sprites/${id}.js) and pass it with --old <file>`); process.exit(1); }
  for (const f of [oldFile, newFile]) if (!fs.existsSync(f)) { console.error(`missing ${path.relative(root, f)} (${f === oldFile ? `the old sprite: pass --old <file>, or freeze it as tests/fixtures/code-sprites/${id}.js` : `write sprites/${id}.json`})`); process.exit(1); }
  const old = await spriteOf(oldFile), now = await spriteOf(newFile);
  const [w, h] = [Math.max(old.size[0], now.size[0]), Math.max(old.size[1], now.size[1])];
  const sets = [['defaults', {}], ['all low', ends(old, 0)], ['all high', ends(old, 1)]];
  for (const [key, d] of Object.entries(old.params)) if (d.kind === 'choice') for (const o of d.options) sets.push([`${key}=${o.value}`, { ...defaultParams(old), [key]: o.value }]);
  const rows = [], legend = [];
  for (const [name, p] of sets) {
    for (const c of Object.keys(old.clips)) {
      const po = cleanParams(old, p), pn = cleanParams(now, p);
      rows.push([...Array(old.clips[c].frames).keys()].map((f) => renderFrame(old, c, f, po)));
      rows.push(now.clips[c] ? [...Array(now.clips[c].frames).keys()].map((f) => renderFrame(now, c, f, pn)) : []);
      legend.push(`${name} / ${c}: OLD`, `${name} / ${c}: NEW${now.clips[c] ? '' : ' (clip missing!)'}`);
    }
  }
  const out = path.join(root, 'out', `${id}-redraw.png`);
  writeRows(out, rows, w, h);
  console.log(out); legend.forEach((l, i) => console.log(`  row ${String(i + 1).padStart(3)}  ${l}`));
  const renamed = now.was?.controls ?? {};                 // the sprite-level was: { controls: { oldKey: newKey } } (engine/sprite.js)
  const lost = Object.keys(old.clips).filter((c) => !now.clips[c]);
  const keys = Object.keys(old.params).filter((key) => !(key in now.params) && !(Object.hasOwn(renamed, key) && renamed[key] in now.params));
  const moved = Object.keys(old.params).filter((key) => !(key in now.params) && Object.hasOwn(renamed, key) && renamed[key] in now.params);
  if (moved.length) console.log(`controls renamed (kept through was.controls): ${moved.map((key) => `${key} -> ${renamed[key]}`).join(', ')}`);
  if (lost.length) console.log(`CLIPS LOST: ${lost.join(', ')}: a redraw keeps every clip`);
  if (keys.length) console.log(`CONTROL KEYS LOST: ${keys.join(', ')}: keep them, or list them in a sprite-level was: { controls: { old: "new" } }`);
} else {
  console.log('usage: sheets.mjs looks <id> | redraw <id> [--old <file>]  [--scale 3] [--root <dir>]');
  process.exit(1);
}
