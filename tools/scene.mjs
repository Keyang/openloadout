#!/usr/bin/env node
// Compose a scene for looking at: a tile map, with props and characters standing on it sorted by their feet,
// under one or more whole-bundle looks. tools/tilemap.mjs shows the joins of ONE tileset; this shows whether a
// set of assets belongs together (docs/style-guide.md sections 3, 6 and 15: values that hold under every look,
// no dot lattice in a floor, no notch where a lane bends, a hero that does not vanish into the ground).
//
//   node tools/scene.mjs <scene.json>                       -> out/<name>.png, 2x          (<name>: the file's name)
//   node tools/scene.mjs <scene.json> --looks original,night,mono,handheld,frost,sunset
//                                                           one picture per look, stacked top to bottom in that order
//   node tools/scene.mjs <scene.json> --theme night         one look by name (the same as --looks night)
//   node tools/scene.mjs <scene.json> --frame 3             which frame of animated tiles (water, lava) to show
//   node tools/scene.mjs <map.txt> --tilesets tiles-forest,tiles-water
//                                                           no JSON: a map written as text (engine/maptext.js), with
//                                                           its legend and settings on '@' lines; the tilesets come
//                                                           from the flag or from a line '@ tilesets = a, b'
//   node tools/scene.mjs <scene.json> --scale 1             game size (default 2)
//   node tools/scene.mjs <scene.json> --crop 0,5,6,4        only the tiles from column 0, row 5, six wide, four high
//   node tools/scene.mjs <scene.json> --scatter             scatter the tilesets' decals by the helper's rule (pickDecal)
//   --bg '#2b2b3a' (what shows where no tile lies)   --out <folder> (default out/)   --name <name> (the picture's name)
//
// The scene file is JSON:
//   {
//     "tilesets": ["tiles-meadow", { "id": "tiles-village", "params": { "style": "square" } }],
//     "view": "top-down",                  optional: "top-down" or "side" (default: the first tileset's meta.view)
//     "map": ["..CCC..", "..CWC.."],       rows of letters, one per cell: the letters of layoutTiles in engine/tiles.js;
//                                          or "map": "level.txt", a text map beside the scene file (engine/maptext.js)
//     "legend": { "C": "block:cobble", "B": "floor:plank", "f": "fence-h", "g": ["fence-h", "fence-post"] },
//                                          optional: your own letters. A value is a clip name, a prefix, or
//                                          "block:<prefix>", "floor:<prefix>", "thin:<prefix>", "stack:<prefix>",
//                                          "liquid:<prefix>" (water: surface on top, body below), "back:<prefix>" (that
//                                          fill behind the rest of the cell), "part:<prefix>:<clip>" / "open:<prefix>:<clip>"
//                                          (a cell of the block for its neighbours, drawn with your clip; open: not
//                                          solid, an archway), or a list of those for a cell that holds several things,
//                                          drawn in layer order
//     "frame": 0,                          optional: which frame of animated tiles
//     "props": [
//       { "id": "cottage", "x": 96, "y": 120 },                                   x, y: where its pivot goes, in map px
//       { "id": "hero-walker", "clip": "walk_down", "frame": 2, "at": [4, 5] },   at: [column, row]: stands in that cell
//       { "id": "tree-oak", "x": 30, "y": 200, "params": { "shape": "wide" } }
//     ]
//   }
// Tilesets: the first one to use a clip name keeps it, and the first tileset's floor lies under every cell (put the
// tileset that has the ground first). A sprite is named by its id (sprites/<id>.js) or by a path to a sprite file.
// Props are painted after the tiles, in the order of their pivot rows (the smaller y first), so a hero below a tree's
// foot stands in front of it and one above it stands behind: what a game that sorts by the pivot row shows. A prop's
// clip defaults to the sprite's first clip, its frame to 0. What cannot be placed is printed as a note.
//
// The same thing from code (the tests use it): readScene(file) -> scene, composeScene(scene) -> { width, height,
// pixels, notes, layout }, then sceneLooks(picture, looks, { scale }) -> { width, height, rgba } for encodePNG.
// `layout` is what layoutTiles returned (cells with kind and solid, tiles with layers): what a game or the
// playground builds the same level from.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePNG } from './png.mjs';
import { renderFrame, defaultParams, cleanParams } from '../engine/sprite.js';
import { TILE, classifyTiles, layoutTiles } from '../engine/tiles.js';
import { readMap } from '../engine/maptext.js';
import { THEME_PRESETS, applyColour } from '../engine/theme.js';
import { col } from '../engine/color.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Loads a sprite by its id (sprites/<id>.js) or by a path to a sprite file; throws for one that does not exist.
 * Arguments: name: the id or the path. base: the folder a relative path is read from (default: the working folder).
 */
export async function loadSprite(name, base = process.cwd()) {
  const isPath = name.includes('/') || name.endsWith('.js');
  const file = isPath ? path.resolve(base, name) : path.join(root, 'sprites', `${name}.js`);
  if (!fs.existsSync(file)) throw new Error(`scene: no sprite "${name}" (looked for ${file})`);
  return (await import(pathToFileURL(file).href)).default;
}

/**
 * Reads a scene from a file: JSON (whose "map" may name a text map beside it), or a text map on its own. Returns the scene object composeScene takes.
 * Arguments: file: the path. over.tilesets: a list or 'a,b' text that replaces the file's tilesets. over.frame: a
 * number that replaces its frame. A text map gives rows, legend and view, and its '@ tilesets = a, b' and
 * '@ frame = n' lines; a JSON scene's own legend, view and frame win over those of the map file it names.
 */
export function readScene(file, over = {}) {
  if (!fs.existsSync(file)) throw new Error(`No scene file at ${path.resolve(file)}`);
  const text = fs.readFileSync(file, 'utf8');
  const fromMap = (m) => ({ map: m.rows, legend: m.legend, ...(m.view ? { view: m.view } : {}), ...(m.settings.frame !== undefined ? { frame: Number(m.settings.frame) || 0 } : {}), ...(m.settings.tilesets ? { tilesets: m.settings.tilesets.split(',').map((s) => s.trim()).filter(Boolean) } : {}) });
  let scene;
  if (text.trimStart().startsWith('{')) {
    try { scene = JSON.parse(text); } catch (e) { throw new Error(`${file} is not JSON: ${e.message}`); }
    if (typeof scene.map === 'string') {
      const inner = fromMap(readMap(fs.readFileSync(path.resolve(path.dirname(file), scene.map), 'utf8')));
      scene = { ...inner, ...scene, map: inner.map, legend: { ...inner.legend, ...(scene.legend ?? {}) } };
    }
  } else scene = fromMap(readMap(text));
  if (over.tilesets) scene.tilesets = Array.isArray(over.tilesets) ? over.tilesets : String(over.tilesets).split(',').map((s) => s.trim()).filter(Boolean);
  if (over.frame !== undefined && over.frame !== null) scene.frame = Number(over.frame) || 0;
  return scene;
}

/** The ids of the whole-bundle looks a scene can be shown under (THEME_PRESETS in engine/theme.js). No arguments. */
export const lookIds = () => THEME_PRESETS.map((l) => l.id);

/**
 * Composes a scene at game size: the tile map, then every prop at its pivot, sorted by pivot row. Returns { width, height, cols, rows, pixels, notes, placed, layout }.
 * Arguments: scene: the object described at the top of this file ({ tilesets, map, legend, view, frame, props }).
 * opts.bg: the colour where no tile lies (default '#2b2b3a'). opts.scatter: true to scatter decals by pickDecal's
 * rule. opts.base: the folder relative sprite paths are read from. opts.load: (name) => sprite, to replace loadSprite.
 * pixels: a Uint32Array, width x height, in the engine's packed colours. notes: what could not be placed.
 * placed: the props in the order they were painted, [{ id, clip, frame, x, y }].
 */
export async function composeScene(scene, opts = {}) {
  const load = opts.load ?? ((name) => loadSprite(name, opts.base));
  const notes = [];
  if (!scene || !Array.isArray(scene.map) || !scene.map.length) throw new Error('scene: "map" must be a list of rows of letters');
  const width = Math.max(...scene.map.map((r) => r.length));
  const rows = scene.map.map((r) => r.padEnd(width, '.'));

  // every clip of every tileset, and which sprite draws it: the first tileset to use a name keeps it
  const owner = new Map(), clips = [];
  let first = null;
  for (const t of scene.tilesets ?? []) {
    const s = await load(typeof t === 'string' ? t : t.id);
    first ??= s;
    const p = cleanParams(s, { ...defaultParams(s), ...(typeof t === 'string' ? {} : t.params ?? {}) });
    for (const [name, c] of Object.entries(s.clips)) if (!owner.has(name)) { owner.set(name, { s, p, key: `${s.id}/${JSON.stringify(p)}` }); clips.push({ name, place: c.place, block: c.block }); }
  }
  const view = scene.view ?? (first?.meta?.view === 'side' ? 'side' : 'top-down');
  const layout = layoutTiles(rows, classifyTiles(clips), { view, legend: scene.legend, decals: !!opts.scatter });
  notes.push(...layout.notes);

  const W = layout.cols * TILE, H = layout.rows * TILE;
  const pixels = new Uint32Array(W * H).fill(col(opts.bg ?? '#2b2b3a'));
  const cache = new Map();
  const frameOf = (s, clip, f, p, key) => {
    const k = `${key}/${clip}/${f}`;
    if (!cache.has(k)) cache.set(k, renderFrame(s, clip, f, p));
    return cache.get(k);
  };
  const paste = (g, ox, oy) => {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const v = g.data[y * g.w + x], X = ox + x, Y = oy + y;
      if (v && X >= 0 && Y >= 0 && X < W && Y < H) pixels[Y * W + X] = v;
    }
  };
  for (const t of layout.tiles) {
    const o = owner.get(t.clip), frames = o.s.clips[t.clip].frames ?? 1;
    paste(frameOf(o.s, t.clip, (scene.frame ?? 0) % frames, o.p, o.key), t.col * TILE, t.row * TILE);
  }

  // props: by the pivot row; things on the same row keep the order they were written in
  const things = [];
  for (const [i, q] of (scene.props ?? []).entries()) {
    const s = await load(q.id);
    const clip = q.clip ?? Object.keys(s.clips)[0];
    if (!s.clips[clip]) { notes.push(`prop ${q.id}: no clip "${clip}"`); continue; }
    // a cell holds a one-tile prop the way the style guide stands it: pivot [16, 30] of a 32 px tile
    const x = q.at ? q.at[0] * TILE + TILE / 2 : q.x, y = q.at ? q.at[1] * TILE + TILE - 2 : q.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) { notes.push(`prop ${q.id}: needs "x" and "y", or "at": [column, row]`); continue; }
    const p = cleanParams(s, { ...defaultParams(s), ...(q.params ?? {}) });
    things.push({ i, s, clip, frame: (q.frame ?? 0) % (s.clips[clip].frames ?? 1), p, x, y });
  }
  things.sort((a, b) => a.y - b.y || a.i - b.i);
  for (const q of things) paste(frameOf(q.s, q.clip, q.frame, q.p, `${q.s.id}/${JSON.stringify(q.p)}`), Math.round(q.x - q.s.pivot[0]), Math.round(q.y - q.s.pivot[1]));

  return { width: W, height: H, cols: layout.cols, rows: layout.rows, pixels, notes, layout, placed: things.map((q) => ({ id: q.s.id, clip: q.clip, frame: q.frame, x: q.x, y: q.y })) };
}

/**
 * Turns a composed scene into one picture with a copy per whole-bundle look, stacked top to bottom. Returns { width, height, rgba } for encodePNG.
 * Arguments: picture: what composeScene returns ({ width, height, pixels }). looks: ids from lookIds(), in the order
 * wanted (default ['original']); an unknown id throws and lists the known ones. opts.scale: px per game pixel (default
 * 2). opts.gap: px between the copies (default 4). opts.crop: [column, row, columns, rows] in tiles, to show a part.
 */
export function sceneLooks(picture, looks = ['original'], opts = {}) {
  const scale = Math.max(1, Math.round(opts.scale ?? 2)), gap = looks.length > 1 ? Math.max(0, Math.round(opts.gap ?? 4)) : 0;
  const cols = picture.width / TILE, rws = picture.height / TILE;
  const [c0, r0, cn, rn] = opts.crop ? [Math.max(0, opts.crop[0]), Math.max(0, opts.crop[1]), Math.min(opts.crop[2], cols - opts.crop[0]), Math.min(opts.crop[3], rws - opts.crop[1])] : [0, 0, cols, rws];
  const W = cn * TILE, H = rn * TILE;
  const OW = W * scale, OH = (H * scale + gap) * looks.length - gap;
  const rgba = new Uint8ClampedArray(OW * OH * 4);
  looks.forEach((id, li) => {
    const look = THEME_PRESETS.find((l) => l.id === id);
    if (!look) throw new Error(`scene: no look "${id}". Looks: ${lookIds().join(', ')}`);
    const data = applyColour(Uint32Array.from(picture.pixels), look.theme.colour) ?? picture.pixels;
    const bytes = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    for (let y = 0; y < H * scale; y++) for (let x = 0; x < OW; x++) {
      const i = ((r0 * TILE + Math.floor(y / scale)) * picture.width + c0 * TILE + Math.floor(x / scale)) * 4, o = ((li * (H * scale + gap) + y) * OW + x) * 4;
      rgba[o] = bytes[i]; rgba[o + 1] = bytes[i + 1]; rgba[o + 2] = bytes[i + 2]; rgba[o + 3] = 255;
    }
  });
  return { width: OW, height: OH, rgba };
}

// ---- the command line ----------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const valued = new Set(['looks', 'theme', 'frame', 'tilesets', 'scale', 'crop', 'bg', 'out', 'name']);
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
  const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && valued.has(args[i - 1].slice(2))));
  if (!file) { console.error('usage: node tools/scene.mjs <scene.json | map.txt> [--tilesets a,b] [--looks original,night,mono | --theme night] [--frame 0] [--scale 2] [--crop c,r,cols,rows] [--scatter] [--bg #rrggbb] [--out folder] [--name name]'); process.exit(1); }
  let scene;
  try { scene = readScene(file, { tilesets: flag('tilesets'), frame: flag('frame') }); } catch (e) { console.error(e.message); process.exit(1); }
  if (!scene.tilesets || !scene.tilesets.length) { console.error(`${file} names no tilesets: add --tilesets a,b, or a line "@ tilesets = a, b" to the map`); process.exit(1); }
  const looks = flag('theme', flag('looks', 'original')).split(',').map((s) => s.trim()).filter(Boolean);
  const crop = flag('crop') ? flag('crop').split(',').map(Number) : null;
  let picture, out;
  try {
    picture = await composeScene(scene, { bg: flag('bg'), scatter: args.includes('--scatter'), base: path.dirname(path.resolve(file)) });
    out = sceneLooks(picture, looks, { scale: Number(flag('scale', 2)), crop });
  } catch (e) { console.error(e.message); process.exit(1); }
  const dir = flag('out') ? path.resolve(flag('out')) : path.join(root, 'out');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${flag('name', path.basename(file).replace(/\.[^.]*$/, ''))}.png`);
  fs.writeFileSync(target, encodePNG(out.width, out.height, out.rgba));
  console.log(`scene          ${picture.cols} x ${picture.rows} tiles, ${picture.placed.length} props, ${looks.length} look${looks.length === 1 ? '' : 's'} (${looks.join(', ')}), frame ${scene.frame ?? 0}`);
  console.log(`picture        ${target}  ${out.width} x ${out.height}`);
  for (const n of picture.notes) console.log(`  note: ${n}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
