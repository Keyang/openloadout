// Writer of build item T3's four data tilesets (sprites/tiles-hive.json, tiles-pit.json, tiles-station-floor.json,
// tiles-station-walls.json) and of their redraw records (tests/fixtures/redraws/<id>.json), kept for audit as M5 kept
// tests/helpers/ports/tiles-cave.mjs. tests/unit/library-tiles-t3.test.mjs holds each library file to what this writes.
//
// Each tileset keeps its code tileset's head (name, blurb, meta, frame, preview), its controls (every key, kind, label,
// end words, range, default, option and swatch), its clips (names, order, frames, labels, block kinds, decal places) and
// draws every tile with its port generator (engine/gen/tiles-t3.js: tile.hive, tile.pit, tile.station-floor,
// tile.station-walls): each group gives every piece as a picture naming the generator with that tile, every setting
// bound to its control and every colour a palette slot. Nothing is traced and no colour is written at the swatches.
//
// Usage: node tests/helpers/ports/tiles-t3.mjs            (says whether each library file and record is what this writes)
//        node tests/helpers/ports/tiles-t3.mjs --write    (writes the four library files)
//        node tests/helpers/ports/tiles-t3.mjs --records  (writes the four redraw records from the frozen code copies)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { codeSprite } from '../library.mjs';
import { cleanParams, clipFps } from '../../../engine/sprite.js';
import { loadBundles } from '../../../tools/lib/assets.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** The four tilesets this writes, by id. */
export const T3_IDS = Object.freeze(['tiles-hive', 'tiles-pit', 'tiles-station-floor', 'tiles-station-walls']);

// What each tileset is: its port generator, its groups (the code's prefixes) and the material of each colour slot.
const SPEC = {
  'tiles-hive': {
    gen: 'tile.hive', materials: { flesh: 'skin', growth: 'skin', glow: 'light' }, decalOrder: 'last',
    groups: [
      { name: 'hive', kind: 'floor', fills: 3, decals: [['a', 'on'], ['b', 'on', 8], ['c', 'on'], ['d', 'on']] },
      { name: 'wall', kind: 'block', use: 'wall', pieces: ['block', 'narrow'] },
    ],
  },
  'tiles-pit': {
    gen: 'tile.pit', materials: { land: 'metal', hull: 'metal', glow: 'signal' },
    groups: [{ name: 'pit', kind: 'block', use: 'hole', pieces: ['block', 'narrow'], fills: 3, frames: 8, decals: [['a', 'rim', 1], ['b', 'rim', 8]] }],
    frames: { 'pit-fill': 1 },
  },
  'tiles-station-floor': {
    gen: 'tile.station-floor', materials: { floor: 'metal', plate: 'metal', accent: 'warning', glow: 'light' }, decalOrder: 'last',
    groups: [
      { name: 'floor', kind: 'floor', fills: 3, decals: [['a', 'on'], ['b', 'on', 8], ['c', 'on'], ['d', 'on'], ['e', 'on'], ['f', 'on', 8]] },
      { name: 'plate', kind: 'block', use: 'ground', pieces: ['block', 'narrow'], fills: 3 },
    ],
  },
  'tiles-station-walls': {
    gen: 'tile.station-walls', materials: { hull: 'metal', plate: 'metal', accent: 'warning', glow: 'light' },
    groups: [{ name: 'wall', kind: 'block', use: 'wall', pieces: ['block', 'narrow'], decals: [['a', 'face'], ['b', 'face'], ['c', 'face'], ['d', 'face', 8]] }],
    extra: ['doorway-l', 'doorway-r'],
  },
};

/** A setting as the generator argument of the same name: a slider bound straight through, a choice or toggle picked. */
function argOf(key, o) {
  if (o.kind === 'range') return { from: key, map: [[o.min, o.min], [o.max, o.max]] };
  if (o.kind === 'toggle') return { from: key, pick: { true: true, false: false } };
  if (o.kind === 'choice') return { from: key, pick: Object.fromEntries(o.options.map((x) => [x.value ?? x, x.value ?? x])) };
  return key;   // a colour: its slot
}

/** The data definition of one tileset, built from its frozen code copy. Arguments: id. */
export async function definition(id) {
  const code = await codeSprite(id), S = SPEC[id];
  const palette = [], controls = [], args = {};
  for (const [k, o] of Object.entries(code.params)) {
    if (k === 'speed') { controls.push({ key: 'speed', standard: 'speed' }); continue; }
    if (o.kind === 'color') {
      palette.push({ id: k, label: o.label, default: o.def, material: S.materials[k], swatches: [...o.swatches] });
      controls.push({ key: k, kind: 'colour', label: o.label });
      args[k === 'glow' ? 'lights' : k] = k;   // `glow` is a call field: the generators take the glow colour as `lights`
      continue;
    }
    const c = { key: k, kind: o.kind, label: o.label };
    if (o.kind === 'range') {
      Object.assign(c, { lo: o.lo, hi: o.hi });
      if (o.min !== 0 || o.max !== 1 || o.step !== 0.01) Object.assign(c, { min: o.min, max: o.max, step: o.step });
    }
    if (o.kind === 'choice') c.options = o.options.map((x) => (typeof x === 'object' ? { value: x.value, label: x.label } : x));
    c.default = o.def;
    controls.push(c);
    args[k] = argOf(k, o);
  }
  const call = (picture) => [{ gen: S.gen, v: 1, at: [16, 16], picture, ...args }];
  const names = Object.keys(code.clips);
  const groups = S.groups.map((g) => {
    const out = { name: g.name, kind: g.kind };
    if (g.use) out.use = g.use;
    if (g.pieces) out.pieces = g.pieces;
    if (g.fills) out.fills = g.fills;
    if (g.frames) out.frames = g.frames;
    if (g.frames || g.decals?.some((d) => d[2] > 1)) out.fps = 6;   // the code's fps, 6 at the middle Speed (the standard Speed scales it)
    out.outline = false;                                           // the port draws each tile whole, its own lines included
    const pieces = names.filter((n) => n.startsWith(`${g.name}-`) && !n.startsWith(`${g.name}-deco-`));
    out.pictures = Object.fromEntries(pieces.map((n) => [n.slice(g.name.length + 1), call(n)]));
    if (g.decals) out.decals = g.decals.map(([d, place, frames]) => ({ name: d, place, label: code.clips[`${g.name}-deco-${d}`].label, ...(frames ? { frames } : {}), outline: false, draw: call(`${g.name}-deco-${d}`) }));
    return out;
  });
  const tiles = { tile: 32 };
  if (S.decalOrder) tiles.decalOrder = S.decalOrder;
  tiles.groups = groups;
  if (S.extra) tiles.extra = S.extra.map((n) => ({ name: n, label: code.clips[n].label, draw: call(n) }));
  const clips = Object.fromEntries(names.map((n) => [n, { label: code.clips[n].label, ...(S.frames?.[n] ? { frames: S.frames[n] } : {}) }]));
  return {
    format: 'loadout-sprite', version: 2, id, name: code.name, blurb: code.blurb,
    size: [...code.size], pivot: [...code.pivot], grounded: !!code.grounded, preview: code.preview, styles: ['pixel'],
    meta: JSON.parse(JSON.stringify(code.meta)), palette, controls, body: { tiles }, clips,
  };
}

/** The text of sprites/<id>.json as this writes it. Arguments: id. */
export const written = async (id) => `${JSON.stringify(await definition(id), null, 1)}\n`;

/** The redraw record of one tileset (tests/fixtures/redraws/<id>.json), read from its frozen code copy. Arguments: id. */
export async function record(id) {
  const code = await codeSprite(id);
  const file = new URL(`../../fixtures/code-sprites/${id}.js`, import.meta.url);   // (tiles-hive's copy went in R3: its replay has no source, so its record says so)
  const src = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').slice(3).join('\n').replaceAll("from '../../../engine/", "from '../engine/") : '';
  const clips = Object.fromEntries(Object.entries(code.clips).map(([k, c]) => [k, { frames: c.frames, loop: c.loop !== false, fps: [0, 0.5, 1].map((speed) => clipFps(code, k, cleanParams(code, { speed }))) }]));
  return {
    id, frozen: '2026-11-20', source: `sprites/${id}.js`, sha256: crypto.createHash('sha256').update(src).digest('hex'),
    name: code.name, blurb: code.blurb, meta: code.meta, size: code.size, pivot: code.pivot, grounded: !!code.grounded, preview: code.preview,
    params: JSON.parse(JSON.stringify(code.params)), clips, sounds: JSON.parse(JSON.stringify(code.sounds ?? {})), versions: JSON.parse(JSON.stringify(code.versions ?? [])),
    bundles: loadBundles(ROOT).filter((b) => (b.sprites ?? []).includes(id)).map((b) => b.id).sort(),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  for (const id of T3_IDS) {
    const file = `${ROOT}sprites/${id}.json`, rec = `${ROOT}tests/fixtures/redraws/${id}.json`;
    if (process.argv.includes('--write')) { const t = await written(id); fs.writeFileSync(file, t); console.log('wrote', file, Buffer.byteLength(t), 'bytes'); }
    else if (process.argv.includes('--records')) { fs.writeFileSync(rec, `${JSON.stringify(await record(id), null, 1)}\n`); console.log('wrote', rec); }
    else console.log(id, fs.existsSync(file) && fs.readFileSync(file, 'utf8') === await written(id) ? 'is what this writes' : 'differs from what this writes (--write)');
  }
}
