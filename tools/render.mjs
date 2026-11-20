#!/usr/bin/env node
// Render a sprite to PNG contact sheets so you can look at it.
//
//   node tools/render.mjs <id>                 -> out/<id>-clips.png    rows = clips, columns = frames (default look)
//                                                 out/<id>-variants.png rows = looks (default, all-low, all-high, 5 random),
//                                                                       columns = 2 frames from every clip
//   node tools/render.mjs <id> --set height=0.9 --set hair=long   override parameters for the clips sheet
//   node tools/render.mjs <id> --scale 6        bigger pixels (default 4)
//   node tools/render.mjs <id> --clip fly      -> out/<id>-fly.png: just that clip, big pixels (scale 8), for close inspection
//   node tools/render.mjs <id> --sheet          also write the real export: out/<id>.png + out/<id>.json
//   node tools/render.mjs <file>                a sprite file by path: a code file (.js) or a data file (.json)
//   node tools/render.mjs <id> --out <dir>      write the pictures to <dir> instead of out/
// --set applies to the clips sheet and --clip close-ups; the variants sheet always uses its own looks.
// A sprite is sprites/<id>.js (a program) or sprites/<id>.json (data, drawn by engine/data-sprite.js; build item B9).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePNG } from './png.mjs';
import { renderFrame, renderSheet, defaultParams, cleanParams, randomParams } from '../engine/sprite.js';
import { findSpriteFile, spriteIds, loadDataSprite } from './lib/assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--set', '--scale', '--clip', '--out']);
const arg = args.find((a, i) => !a.startsWith('--') && !a.includes('=') && !VALUE_FLAGS.has(args[i - 1]));
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const outDir = path.resolve(flag('out', path.join(root, 'out')));
const sets = {};
args.forEach((a, i) => { if (a === '--set') { const [k, ...v] = args[i + 1].split('='); sets[k] = v.join('='); } });
const defaultScale = Number(flag('scale', 4));
const scale = defaultScale;

// there is no list of sprites: sprites/<id>.js or sprites/<id>.json is the sprite, and it is loaded directly
const asPath = !!arg && (/\.(m?js|json)$/.test(arg) || arg.includes('/') || arg.includes(path.sep));
const spriteFile = asPath ? path.resolve(arg) : findSpriteFile(root, arg);
let sprite = null;
if (spriteFile && fs.existsSync(spriteFile)) {
  if (spriteFile.endsWith('.json')) {
    try { sprite = await loadDataSprite(root, spriteFile); } catch (e) { console.error(e.message); process.exit(1); }
  } else sprite = (await import(pathToFileURL(spriteFile).href)).default;
}
if (!sprite) {
  console.error(`Unknown sprite "${arg}". Known: ${spriteIds(root).join(', ')}`);
  process.exit(1);
}
const id = sprite.id;

const BG_A = [0x8b, 0x93, 0xa7, 255], BG_B = [0x7c, 0x84, 0x99, 255];

function contact(rows, scale = defaultScale) {
  // rows: array of arrays of Surfaces
  const [fw, fh] = sprite.size;
  const cols = Math.max(...rows.map((r) => r.length));
  const W = cols * fw * scale, H = rows.length * fh * scale;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < cols; c++) {
    const bg = (r + c) % 2 ? BG_A : BG_B;
    const g = rows[r][c];
    const bytes = g ? g.bytes() : null;
    for (let y = 0; y < fh * scale; y++) for (let x = 0; x < fw * scale; x++) {
      const o = ((r * fh * scale + y) * W + c * fw * scale + x) * 4;
      let px = bg;
      if (bytes) {
        const i = (Math.floor(y / scale) * fw + Math.floor(x / scale)) * 4;
        if (bytes[i + 3]) px = [bytes[i], bytes[i + 1], bytes[i + 2], 255];
      }
      out[o] = px[0]; out[o + 1] = px[1]; out[o + 2] = px[2]; out[o + 3] = 255;
    }
  }
  return encodePNG(W, H, out);
}

fs.mkdirSync(outDir, { recursive: true });
const clipNames = Object.keys(sprite.clips);
const p = cleanParams(sprite, { ...defaultParams(sprite), ...sets });

const clipRows = clipNames.map((c) => Array.from({ length: sprite.clips[c].frames }, (_, f) => renderFrame(sprite, c, f, p)));
const f1 = path.join(outDir, `${id}-clips.png`);
fs.writeFileSync(f1, contact(clipRows));

const one = flag('clip');
if (one) {
  if (!sprite.clips[one]) { console.error(`No clip "${one}". Clips: ${clipNames.join(', ')}`); process.exit(1); }
  const big = Number(flag('scale', 8));
  const f3 = path.join(outDir, `${id}-${one}.png`);
  fs.writeFileSync(f3, contact([clipRows[clipNames.indexOf(one)]], big));
  console.log(`close-up       ${f3}\n  ${sprite.clips[one].frames} frames of ${one}, left to right, ${big}x`);
}

const lo = {}, hi = {};
for (const [k, d] of Object.entries(sprite.params)) {
  if (d.kind === 'range') { lo[k] = d.min; hi[k] = d.max; }
  else if (d.kind === 'choice') { lo[k] = d.options[0].value; hi[k] = d.options[d.options.length - 1].value; }
  else if (d.kind === 'toggle') { lo[k] = false; hi[k] = true; }
}
const looks = [defaultParams(sprite), cleanParams(sprite, lo), cleanParams(sprite, hi), ...[11, 22, 33, 44, 55].map((s) => randomParams(sprite, s))];
const varRows = looks.map((q) => clipNames.flatMap((c) => {
  const n = sprite.clips[c].frames;
  const picks = sprite.clips[c].loop ? [0, Math.floor(n * 0.375)] : [Math.floor(n * 0.3), Math.floor(n * 0.6)];
  return [...new Set(picks)].map((f) => renderFrame(sprite, c, f, q));
}));
const f2 = path.join(outDir, `${id}-variants.png`);
fs.writeFileSync(f2, contact(varRows));

// one cell per option of every choice parameter (everything else default)
const choiceParams = Object.entries(sprite.params).filter(([, d]) => d.kind === 'choice');
let f4 = null;
if (choiceParams.length) {
  const firstClip = clipNames[0];
  const rows = choiceParams.map(([k, d]) => d.options.map((o) => renderFrame(sprite, firstClip, 0, { ...defaultParams(sprite), [k]: o.value })));
  f4 = path.join(outDir, `${id}-choices.png`);
  fs.writeFileSync(f4, contact(rows));
}

console.log(`${sprite.name} (${sprite.size.join('x')})`);
console.log(`clips sheet    ${f1}\n  rows top to bottom: ${clipNames.map((c) => `${c} (${sprite.clips[c].frames})`).join(', ')}`);
console.log(`variants sheet ${f2}\n  rows: default, all-low, all-high, random x5; columns: 2 frames each of ${clipNames.join(', ')}`);

if (f4) console.log(`choices sheet  ${f4}\n  one row per choice parameter (${choiceParams.map(([k, d]) => `${k}: ${d.options.map((o) => o.value).join(' | ')}`).join('; ')})`);

if (args.includes('--sheet')) {
  const s = renderSheet(sprite, p);
  fs.writeFileSync(path.join(outDir, `${id}.png`), encodePNG(s.w, s.h, new Uint8ClampedArray(s.data.buffer)));
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(s.meta, null, 2));
  console.log(`export         ${path.join(outDir, `${id}.png`)} + ${id}.json`);
}
