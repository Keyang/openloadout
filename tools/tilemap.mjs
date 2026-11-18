#!/usr/bin/env node
// Render a map from a tileset, so the joins between tiles can be looked at
// (docs/style-guide.md, sections 14 and 15: every tileset builder opens this picture).
//
//   node tools/tilemap.mjs <id>                 the sample map -> out/<id>-map.png, 2x
//   node tools/tilemap.mjs <id> --look low      all sliders low  -> out/<id>-map-low.png   (also: high)
//   node tools/tilemap.mjs <id> --set edge=9 --set roots=true     override controls
//   node tools/tilemap.mjs <id> --with <id2>    use another tileset's pieces too (the ground under a set of
//                                               platforms and ladders, say)
//   node tools/tilemap.mjs <id> --map my.txt    your own map, written as letters -> out/<id>-map-my.png. The file may
//                                               carry its own legend and view on '@' lines (engine/maptext.js):
//                                               '@ g = back:water, block:grass' puts water behind a bank
//   node tools/tilemap.mjs <id> --frame 3       which frame of animated tiles to show (default 0)
//   node tools/tilemap.mjs <id> --crop 0,5,6,4  only the tiles from column 0, row 5, six wide and four high, at 6x
//                                               -> out/<id>-map-crop.png: for looking closely at one join
//   node tools/tilemap.mjs <id> --scatter       scatter the decals by the helper's rule (pickDecal), as a game or the
//                                               playground would, instead of the fixed spots of the sample map
//   node tools/tilemap.mjs --file path/to/sprite.js    a tileset that is not in sprites/
//   --view side|top-down (default: the tileset's meta.view)   --scale 3   --bg '#8fd0f0'   --out <folder>
//
// Which piece goes in which cell is decided by layoutTiles in engine/tiles.js, the same code the playground
// uses; this tool only has the sample maps and the painting. A map file is lines of letters, one per cell
// ('.' is empty; lines starting with ';' are notes). The letters are listed at layoutTiles:
//   side      # block   I second block   / \ slopes   = thin platform   | : ! things that stack (ladder, vine,
//             post...)   H Y T the same standing behind the platform   a b c ... decals   0 1 ... other clips
//   top-down  W wall   O hole   P Q other blocks   a b c ... decals; the floor lies under everything
// The map carries on past its edges as its edge cells. What cannot be placed is printed as a note.
//
// The sample maps hold the awkward cases on purpose: ground one tile wide and one tile high, a tile on its
// own, a peak, a valley, slopes corner to corner, a platform that ends against a block, an overhang; top-down,
// a doorway in two walls, a pillar, a wall one tile wide and a wall one tile deep.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePNG } from './png.mjs';
import { renderFrame, defaultParams, cleanParams } from '../engine/sprite.js';
import { TILE, classifyTiles, layoutTiles, pieceOf } from '../engine/tiles.js';
import { readMap } from '../engine/maptext.js';
import { hexToRgb } from '../engine/color.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const valued = new Set(['look', 'set', 'with', 'file', 'scale', 'bg', 'out', 'crop', 'map', 'view', 'frame']);
const id = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && valued.has(args[i - 1].slice(2))));
const sets = {};
args.forEach((a, i) => { if (a === '--set') { const [k, ...v] = args[i + 1].split('='); sets[k] = v.join('='); } });

async function load(name, file) {
  const f = file ? path.resolve(file) : path.join(root, 'sprites', `${name}.js`);
  if (!name && !file) { console.error('usage: node tools/tilemap.mjs <id> [--look low|high] [--set key=value] [--with <id>] [--map file]'); process.exit(1); }
  if (!fs.existsSync(f)) { console.error(`No tileset at ${f}`); process.exit(1); }
  return (await import(pathToFileURL(f).href)).default;
}
const sprite = await load(id, flag('file'));
const partner = flag('with') ? await load(flag('with')) : null;

function look(s, mine) {
  const which = flag('look', 'default');
  const p = defaultParams(s);
  if (which === 'low' || which === 'high') for (const [k, d] of Object.entries(s.params)) if (d.kind === 'range') p[k] = which === 'low' ? d.min : d.max;
  return cleanParams(s, mine ? { ...p, ...sets } : p);
}

// every clip of the tileset (and of the one named by --with), and which sprite draws it
const owner = new Map();
const clips = [];
for (const s of [sprite, partner]) {
  if (!s) continue;
  const p = look(s, s === sprite);
  for (const [name, c] of Object.entries(s.clips)) if (!owner.has(name)) { owner.set(name, { sprite: s, p }); clips.push({ name, place: c.place, block: c.block }); }
}
const tiles = classifyTiles(clips);
const mapFile = flag('map');
const written = mapFile ? readMap(fs.readFileSync(path.resolve(mapFile), 'utf8')) : null;
const view = flag('view', written?.view ?? (sprite.meta?.view === 'top-down' ? 'top-down' : 'side'));

// ---- the sample maps ---------------------------------------------------------------------------
const SIDE = [
  '........................',
  '...............IIIII....',
  '...............IIIII....',
  '................III.....',
  '..#=H=Y=T.......III.....',
  '..#.|.:.!...............',
  '..#.|.:.!......../\\.....',
  '###.|...!......./##\\....',
  '###########\\/########.##',
  '#####.###############.##',
  '#####################.##',
  '########################',
];
const TOP = [
  'WWWWWWWW..WWWWWWWW',
  'WWWWWWWW..WWWWWWWW',
  'WW..............WW',
  'WW.PPP....OOO...WW',
  'WW.PPP....OOO...WW',
  '...PPPPP..OOO.W.WW',
  'WW.PPPPP......W.WW',
  'WW..WW........W.WW',
  'WW..WW..WWW.....WW',
  'WW..............WW',
  'WWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWW',
];
// where the sample maps take decals: [column, row] of cells that are empty (above, below) or fill (on)
const SPOTS = {
  side: { above: [[10, 7], [14, 7], [2, 3], [17, 0], [23, 7], [6, 7], [1, 6]], on: [[3, 10], [14, 9], [8, 10], [18, 10], [17, 2], [10, 10]], below: [[17, 5], [19, 3], [5, 10]] },
  'top-down': { on: [[2, 2], [9, 6], [12, 9], [7, 2], [15, 3], [3, 9], [10, 7], [6, 9]] },
};

function sampleMap() {
  const rows = (view === 'side' ? SIDE : TOP).map((r) => r.split(''));
  const swap = (from, to) => { for (const r of rows) for (let i = 0; i < r.length; i++) if (from.includes(r[i])) r[i] = to; };
  if (view === 'side') {
    const block = tiles.blocks[0], thin = tiles.thins[0];
    if (!block) swap('#I/\\', '.');
    else if (!tiles.slopes.length) { rows[8][11] = '#'; rows[8][12] = '#'; swap('/\\', '.'); }        // no slopes: the hill becomes steps, the valley level ground
    ['H|', 'Y:', 'T!'].forEach(([behind, plain], i) => { if (!tiles.stacks[i]) { swap(behind, thin ? '=' : '.'); swap(plain, '.'); } else if (!thin) swap(behind, plain); });
    if (!thin) swap('=', '.');
    if (tiles.thins[1]) [7, 8, 9].forEach((x) => { rows[2][x] = '-'; });
    if (tiles.floors[0]) for (const [x, y] of [[10, 5], [11, 5], [10, 6], [11, 6]]) if (rows[y][x] === '.') rows[y][x] = 'F';
    tiles.extras.slice(0, 10).forEach((_, i) => { rows[0][1 + i] = String(i); });
  } else {
    if (!tiles.blocks.some((b) => b.kind === 'wall')) swap('W', '.');
    if (!tiles.blocks.some((b) => b.kind === 'hole')) swap('O', '.');
    const grounds = tiles.blocks.filter((b) => b.kind === 'ground');
    if (!grounds.length) swap('P', '.');
    if (grounds[1]) for (const [x, y] of [[6, 2], [7, 2], [8, 2], [6, 3], [7, 3], [8, 3]]) rows[y][x] = 'Q';
    tiles.extras.slice(0, 10).forEach((_, i) => { rows[9][3 + i] = String(i); });
  }
  // every decal twice, where its `place` says (with --scatter the helper's own rule places them instead)
  const used = { above: 0, on: 0, below: 0 };
  if (!args.includes('--scatter')) for (let round = 0; round < 2; round++) for (const d of tiles.decals) {
    const letter = pieceOf(d.clip).piece, list = SPOTS[view][d.place] ?? [];
    if (letter.length !== 1 || !/[a-z]/.test(letter) || !list.length) continue;
    for (let tries = 0; tries < list.length; tries++) {
      const [x, y] = list[used[d.place]++ % list.length];
      const here = rows[y]?.[x];
      const fits = view === 'top-down' ? here === '.' : d.place === 'on' ? here === '#' || here === 'I' : here === '.';
      if (fits) { rows[y][x] = letter; break; }
    }
  }
  return rows.map((r) => r.join(''));
}

const rows = written ? written.rows : sampleMap();
const layout = layoutTiles(rows, tiles, { view, legend: written?.legend, decals: args.includes('--scatter') });

// ---- the picture ---------------------------------------------------------------------------
const COLS = layout.cols, ROWS = layout.rows;
const crop = flag('crop') ? flag('crop').split(',').map(Number) : null;      // [column, row, columns, rows]
const scale = Number(flag('scale', crop ? 6 : 2));
const canvas = new Uint8ClampedArray(COLS * TILE * ROWS * TILE * 4);
{
  const [r, g, b] = hexToRgb(flag('bg', view === 'side' ? '#8fd0f0' : '#2b2b3a'));
  for (let i = 0; i < canvas.length; i += 4) { canvas[i] = r; canvas[i + 1] = g; canvas[i + 2] = b; canvas[i + 3] = 255; }
}
const drawn = new Map();
for (const t of layout.tiles) {
  if (!drawn.has(t.clip)) { const o = owner.get(t.clip); drawn.set(t.clip, renderFrame(o.sprite, t.clip, (Number(flag('frame', 0)) || 0) % (o.sprite.clips[t.clip].frames ?? 1), o.p)); }
  const s = drawn.get(t.clip), bytes = s.bytes(), W = COLS * TILE;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const i = (y * s.w + x) * 4;
    if (!bytes[i + 3]) continue;
    const o = ((t.row * TILE + y) * W + t.col * TILE + x) * 4;
    canvas[o] = bytes[i]; canvas[o + 1] = bytes[i + 1]; canvas[o + 2] = bytes[i + 2];
  }
}
const full = COLS * TILE;
const [c0, r0, cn, rn] = crop ? [Math.max(0, crop[0]), Math.max(0, crop[1]), Math.min(crop[2], COLS - crop[0]), Math.min(crop[3], ROWS - crop[1])] : [0, 0, COLS, ROWS];
const W = cn * TILE, H = rn * TILE, out = new Uint8ClampedArray(W * scale * H * scale * 4);
for (let y = 0; y < H * scale; y++) for (let x = 0; x < W * scale; x++) {
  const i = ((r0 * TILE + Math.floor(y / scale)) * full + c0 * TILE + Math.floor(x / scale)) * 4, o = (y * W * scale + x) * 4;
  out[o] = canvas[i]; out[o + 1] = canvas[i + 1]; out[o + 2] = canvas[i + 2]; out[o + 3] = 255;
}
const dir = flag('out') ? path.resolve(flag('out')) : path.join(root, 'out');
fs.mkdirSync(dir, { recursive: true });
const which = flag('look', 'default');
const tag = `${which === 'default' ? '' : `-${which}`}${mapFile ? `-${path.basename(mapFile).replace(/\.[^.]*$/, '')}` : ''}${crop ? '-crop' : ''}`;
const file = path.join(dir, `${sprite.id}-map${tag}.png`);
fs.writeFileSync(file, encodePNG(W * scale, H * scale, out));

console.log(`${sprite.name}: ${view === 'side' ? 'side view' : 'top-down room'}, ${COLS} x ${ROWS} tiles, ${scale}x`);
console.log(`map            ${file}`);
for (const r of rows) console.log(`  ${r}`);
for (const n of layout.notes) console.log(`  note: ${n}`);
