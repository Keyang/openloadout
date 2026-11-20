// What the writers of build item T2 share (tests/helpers/ports/tiles-castle.mjs, tiles-village.mjs, tiles-meadow.mjs,
// tiles-water.mjs, tiles-shore.mjs): each writes one library tileset, sprites/<id>.json, as data on the tiles body whose
// every piece is a picture naming that tileset's tile generator (engine/gen/tile-ports.js) with the piece, the
// settings it reads and the paints it draws in. Kept for audit as M5's writers are; tests/unit/library-tiles-t2.test.mjs
// holds each library file to what its writer writes.
//
//   const def = tileset({ code, gen: 'tile.meadow', palette, controls, settings, groups, extra, decalOrder });
//
// Nothing here draws: the writer only lays out the data (head, palette, controls, groups and their pictures, clip
// labels) from the frozen code tileset (tests/fixtures/code-sprites/) it replaces.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tileClips } from '../../../engine/gen/tiles-clips.js';
import { fixtureText } from './tiles-platforms.mjs';

export { fixtureText };

/** The code sprite's name, blurb, meta, frame and preview, as a data file's top (styles: pixel). */
export function head(code) {
  return {
    format: 'loadout-sprite', version: 2, id: code.id, name: code.name, blurb: code.blurb,
    size: [...code.size], pivot: [...code.pivot], grounded: !!code.grounded, preview: code.preview, styles: ['pixel'],
    meta: JSON.parse(JSON.stringify(code.meta)),
  };
}

/** A palette slot with a colour control, from the code's colour setting: { id, label, default, material, swatches }. */
export function colourSlot(code, key, material) {
  const o = code.params[key];
  return { id: key, label: o.label, default: o.def, material, swatches: [...o.swatches] };
}

/** The code's controls in its order, as data controls (a colour setting a colour control on the slot of its key; speed the standard one). */
export function controlsOf(code) {
  const out = [];
  for (const [key, o] of Object.entries(code.params)) {
    if (key === 'speed' && o.kind === 'range' && o.group === 'Motion') { out.push({ key: 'speed', standard: 'speed' }); continue; }
    if (o.kind === 'range') {
      const c = { key, kind: 'range', label: o.label, lo: o.lo, hi: o.hi };
      if (o.min !== 0 || o.max !== 1 || o.step !== 0.01) Object.assign(c, { min: o.min, max: o.max, step: o.step });
      c.default = o.def;
      if (o.group && o.group !== 'Look') c.group = o.group;
      out.push(c);
    } else if (o.kind === 'choice') {
      out.push({ key, kind: 'choice', label: o.label, options: o.options.map((x) => ({ value: x.value, label: x.label })), default: o.def });
    } else if (o.kind === 'toggle') out.push({ key, kind: 'toggle', label: o.label, default: o.def });
    else if (o.kind === 'color') out.push({ key, kind: 'colour', label: o.label });
    else throw new Error(`${code.id}: a ${o.kind} control ${key} has no data form here`);
  }
  return out;
}

/** The binding of a generator argument to the code's setting of the same name: a whole-number slider through a table from its least to its most value, rounded to whole pixels; any other setting as it is. */
export function bindingOf(code, key) {
  const o = code.params[key];
  if (o?.kind === 'range' && o.step === 1) return { from: key, map: [[o.min, o.min], [o.max, o.max]], round: 'px' };
  return { from: key };
}

/** The call of a tile generator that draws one clip: at the tile's middle, its piece, the settings bound to the controls of the same names, the paints. */
export function call(code, gen, piece, settings, paints) {
  return { gen, v: 1, at: [16, 16], piece, ...Object.fromEntries(settings.map((k) => [k, bindingOf(code, k)])), ...paints };
}

/**
 * The whole definition: head, palette, controls, the tiles body (groups whose pictures and decals call `gen`, extra
 * tiles), and the code's clip labels where tile.clips names them otherwise. groups: [{ name, kind, use?, pieces?,
 * fills?, label?, frames?, gen? (another generator for its pieces), paints (the paints of its pieces), decals?: [{ name,
 * place, label, frames?, paints }] }]; extra: [{ name, label, gen?, paints }]; settings: the control keys the generator reads (bound by name).
 */
export function tileset({ code, gen, palette, settings, groups, extra = [], decalOrder }) {
  const def = { ...head(code), palette, controls: controlsOf(code) };
  const tiles = { tile: 32, ...(decalOrder ? { decalOrder } : {}), groups: [] };
  for (const g of groups) {
    const out = { name: g.name, kind: g.kind };
    for (const k of ['use', 'pieces', 'fills', 'label', 'frames', 'fps']) if (g[k] !== undefined) out[k] = g[k];
    out.outline = false;
    // the pieces tile.clips names for the group (its decals apart), each a picture of the clip of that name
    const names = Object.keys(tileClips({ groups: [{ ...out, decals: undefined }] }));
    out.pictures = Object.fromEntries(names.map((clip) => [clip.slice(g.name.length + 1), [call(code, g.gen ?? gen, clip, settings, g.paints)]]));
    if (g.decals) out.decals = g.decals.map((d) => ({ name: d.name, place: d.place, label: d.label, ...(d.frames ? { frames: d.frames } : {}), draw: [call(code, d.gen ?? g.gen ?? gen, `${g.name}-deco-${d.name}`, settings, d.paints)] }));
    tiles.groups.push(out);
  }
  if (extra.length) tiles.extra = extra.map((x) => ({ name: x.name, label: x.label, draw: [call(code, x.gen ?? gen, x.name, settings, x.paints)] }));
  def.body = { tiles };
  // the code's labels, where tile.clips names a clip otherwise
  const named = tileClips(tiles), clips = {};
  for (const [k, c] of Object.entries(code.clips)) {
    if (!named[k]) throw new Error(`${code.id}: tile.clips names no clip ${k}`);
    if (named[k].label !== c.label) clips[k] = { label: c.label };
  }
  if (Object.keys(clips).length) def.clips = clips;
  return def;
}

/** Runs a writer from the command line: says whether the library file is what it writes (--write writes it). Arguments: meta (import.meta of the writer), file (the library file), written (its text). */
export function writerMain(meta, file, written) {
  if (!process.argv[1] || fileURLToPath(meta.url) !== fs.realpathSync(process.argv[1])) return;
  const text = written();
  if (process.argv.includes('--write')) { fs.writeFileSync(file, text); console.log('wrote', file, Buffer.byteLength(text), 'bytes'); }
  else { const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text; console.log(same ? 'the library file is what this writes' : 'the library file differs from what this writes (--write to write it)'); process.exitCode = same ? 0 : 1; }
}
