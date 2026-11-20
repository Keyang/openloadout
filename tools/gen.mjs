#!/usr/bin/env node
// What the named generators are and what they draw (docs/data-sprites.md sections 3 and 8 'Check', build item B9), so a
// data sprite names one knowing what it gives. Read from the site's registry (engine/gen/index.js); never edits anything.
//
//   node tools/gen.mjs                       every generator: id@v, family, what it draws
//   node tools/gen.mjs <gen>[@v]             its arguments as a table (type, range or options, default, what it is),
//                                            the arguments a key may move, its cost at the defaults, and a call to copy
//   node tools/gen.mjs <gen>[@v] --sheet     out/gen-<id>@<v>.png, a contact sheet of its output:
//                                              row 1  the defaults at the clip phases 0, 0.25, 0.5, 0.75
//                                              then   one row per argument that has a range or options, its values across
//                                                     it (a count every step up to 8, a number low / middle / high, every
//                                                     option of a word, off and on), the other arguments at the defaults
//                                            the rows are printed with their values, as the picture has no words
//       --size 32      the cell (frame) size in pixels (default 32)   --scale 3   bigger pixels   --out <dir>   where to write
//       --try '{"size": 2}'   arguments set on every cell, to see a call before writing it; paints may be the asset's own
//                             slot names ("body", "body.light", a colour rule, the paints of calls inside lists): each
//                             one the sheet does not have becomes a slot with a sample colour ("shine" white), printed
//   Exit 1 when a cell could not be drawn or the defaults draw nothing at any phase (each is printed): the sheet is
//   then not a fair picture of the generator, so give it a sample (SAMPLE_ARGS) or fix the generator.
// A layout or a motion generator is not drawn alone (it lays out a body or moves nodes): the table says what it takes.
// <gen> without @v is its newest version. Arguments it needs that have no default are filled for the sheet: points at
// the cell's centre (two or more spread across it), a paint with a colour slot of the sheet's own
// (tools/lib/data-sheet.mjs), shapes, a path, a thing to place painted with that slot (SAMPLE_TYPES), a generator's own
// kind of content where its default is empty (SAMPLE_ARGS: icon.fit gets a round body with a crease), anything else
// with the first value its type allows (engine/gen/args.js typeSamples). The sheet's slots always include one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generator, generators, generatorVersions } from '../engine/gen/index.js';
import { describeArg, typeSamples } from '../engine/gen/args.js';
import { sheetCell, cellFrames, sheetPng, SHEET_COLOURS } from './lib/data-sheet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Families whose generators are not drawn as a call in a draw list. */
export const NOT_DRAWN = Object.freeze({ layout: 'lays out a whole body', motion: 'moves nodes over a clip', colour: 'is a colour rule, worked out where a paint names it (B14)' });
const PHASES = 4;

/** The entry of "<id>" (newest version) or "<id>@<v>": { entry } or { error } naming what is known. */
export function findGenerator(name) {
  const m = /^(.+?)(?:@(\d+))?$/.exec(String(name));
  const id = m[1], v = m[2] === undefined ? null : Number(m[2]);
  const versions = generatorVersions(id);
  if (!versions.length) return { error: `no generator "${id}". Known: ${generators().map((g) => g.key).join(', ')}` };
  if (v !== null && !versions.includes(v)) return { error: `${id} has versions ${versions.join(', ')}, not ${v}` };
  return { entry: generator(id, v ?? versions[versions.length - 1]) };
}

const fmt = (x) => (x === undefined ? '' : typeof x === 'string' ? x : JSON.stringify(x));
const rangeOf = (d) => (d.values ? d.values.join(' | ') : d.lo !== undefined ? `${d.lo}..${d.hi}` : d.n !== undefined ? `${d.n} paints` : '');

/** The table of one generator as lines of text. */
export function generatorTable(entry) {
  const rows = Object.entries(entry.args).map(([k, t]) => {
    const d = describeArg(t);
    return [k, d.type, rangeOf(d), d.optional ? fmt(d.default) : '(needed)', d.about ?? ''];
  });
  const head = ['arg', 'type', 'range / options', 'default', 'what it is'];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => `  ${r.map((c, i) => (i < r.length - 1 ? String(c).padEnd(width[i]) : c)).join('  ')}`.trimEnd();
  // a call to copy: the needed arguments as the sheet fills them, its colour slots written <slot>
  const sheet = baseArgs(entry, [32, 32]), ids = new Set(sheet.slots.map((x) => x.id));
  const slotted = (v) => (typeof v === 'string' && ids.has(v) ? '<slot>' : Array.isArray(v) ? v.map(slotted) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, slotted(x)])) : v);
  const call = { gen: entry.id, v: entry.v };
  for (const [k, t] of Object.entries(entry.args)) if (!t.optional || sampleOf(entry)?.('x', [0, 0])?.[k] !== undefined) call[k] = slotted(sheet.args[k]);
  let cost = '?';
  try { const c = entry.cost(baseArgs(entry, [32, 32]).args); cost = Number.isFinite(c) ? String(c) : '?'; } catch { /* left as ? */ }
  return [
    `${entry.key}  (${entry.family})  ${entry.about}`,
    line(head), ...rows.map(line),
    `  keyable: ${(entry.keyable ?? []).join(', ') || 'none'}    cost at the defaults: ${cost}`,
    `  call: ${JSON.stringify(call).replace(/,"/g, ', "').replace(/":/g, '": ')}`,
  ];
}

/**
 * What a sheet gives a generator for an argument it needs, or for one whose default draws nothing, so every cell has
 * something to look at: by generator (its own kind of content), then by type. slot: a sheet colour slot to paint with;
 * at: where the sample goes ([0, 0] in an icon's own space, else the cell's centre).
 */
export const SAMPLE_ARGS = Object.freeze({
  // an icon is icon.paint bodies (and icon.line creases) fitted to the box: one round body with a crease
  'icon.fit': (slot) => ({ draw: [
    { gen: 'icon.paint', v: 1, shapes: [{ kind: 'ellipse', at: [0, 0], r: [6, 7], paint: slot }], paint: slot },
    { gen: 'icon.line', v: 1, path: [-3, -2, 0, 1, 3, -2], paint: `${slot}.dark`, over: true }] }),
  // a glint alone paints only over pixels already painted (over: true), which a cell has none of
  'icon.glint': () => ({ over: false }),
  // a burst at amount 0 has not started: half way through shows it
  'pickup.burst': () => ({ amount: 0.5 }),
  // a token at its smallest (4 px) draws nothing: half the cell across
  token: () => ({ size: 16 }),
  // three copies along the row, not one
  row: () => ({ count: 3 }),
  // migration batch M10's scenery stands on a ground row of a 320 x 180 layer by default: in a cell, a low ground and small things
  'round.trees': () => ({ base: 30, count: 2, tall: 20, vary: 4 }),
  towers: () => ({ base: 30, count: 2 }),
  'rail.fence': () => ({ base: 28, posts: 4, height: 8 }),
  'tall.trees': () => ({ foot: 40, count: 2 }),
  'castle.columns': () => ({ count: 2, spring: 8, shaft: 8, foot: 22 }),
});
/** A generator's own sample (SAMPLE_ARGS by id@v, else by id), or undefined. */
const sampleOf = (entry) => SAMPLE_ARGS[entry.key] ?? SAMPLE_ARGS[entry.id];
/** The sample by type for a needed argument (see SAMPLE_ARGS), or undefined when the type's first allowed value does. */
const SAMPLE_TYPES = Object.freeze({
  primitives: (slot, [x, y]) => [{ kind: 'ellipse', at: [x, y], r: [6, 7], paint: slot }],
  profile: (slot, [x, y]) => [x - 6, y + 2, x, y - 4, x + 6, y + 2],
  place: (slot) => ({ kind: 'rect', size: [2, 2], paint: slot }),
  shape: (slot, [x, y]) => ({ kind: 'rect', at: [x - 2, y - 2], size: [4, 4], paint: slot }),
});

/** Arguments for a sheet cell: { args (the needed ones filled, and samples where a default draws nothing), slots (the sheet colour slots they paint with) }. */
export function baseArgs(entry, size) {
  const args = {}, slots = [];
  const slot = () => { const c = SHEET_COLOURS[slots.length % SHEET_COLOURS.length]; const id = `c${slots.length + 1}`; slots.push({ id, default: c.hex, material: c.material }); return id; };
  let first = null;
  const any = () => (first ??= slot());
  const centre = [Math.floor(size[0] / 2), Math.floor(size[1] / 2)];
  const at = Object.hasOwn(entry.args, 'centre') ? [0, 0] : centre;      // an icon generator draws in its own space round `centre` (default the cell's middle)
  // a point that cannot be negative (lo >= 0, e.g. gem.cut's r: half its width and height) is a size, not a position
  const isSize = (t) => t.type === 'point' && Number.isFinite(t.lo) && t.lo >= 0;
  const points = Object.entries(entry.args).filter(([, t]) => t.type === 'point' && !t.optional && !isSize(t)).map(([k]) => k);
  let paints = 0;      // the first paint takes the sheet's first slot (which the samples paint with too), each later one a slot of its own
  const paintSlot = () => (paints++ ? slot() : any());
  // a light paint after the first (named shine, or documented as a light slot or tone, or white) gets a white slot of
  // its own, so a highlight reads as one (gem.cut's shine was the sheet's second colour, a blue); a generator's first
  // paint keeps the sheet's first slot, which its samples paint with (icon.glint draws only over them)
  const isLight = (k, t) => k === 'shine' || /\blight (slot|tone)\b|\bwhite\b/i.test(t.about ?? '');
  const lightSlot = () => { const id = `c${slots.length + 1}`; slots.push({ id, default: '#ffffff', material: 'light' }); return id; };
  for (const [k, t] of Object.entries(entry.args)) {
    if (t.type === 'paint' && !t.optional && paints && isLight(k, t)) { args[k] = lightSlot(); continue; }
    if (t.type === 'paint' && !t.optional) { args[k] = paintSlot(); continue; }
    if (t.type === 'paints' && !t.optional) { args[k] = Array.from({ length: t.n }, paintSlot); continue; }
    if (t.optional) continue;
    if (isSize(t)) {
      // a size: about a third of the cell across each way, held to the argument's range
      args[k] = size.map((n) => Math.min(t.hi ?? n, Math.max(t.lo, Math.round(n * 0.3))));
    } else if (t.type === 'point') {
      // one point at the centre; two or more spread across it (a row's from and to), so they do not all fall on one pixel
      const i = points.indexOf(k), n = points.length, dx = n > 1 ? Math.round(-8 + (16 * i) / (n - 1)) : 0;
      args[k] = [at[0] + dx, at[1]];
    } else if (t.type === 'px') args[k] = Math.min(t.hi, Math.max(t.lo, Math.round(size[1] * 0.75)));
    else if (SAMPLE_TYPES[t.type]) args[k] = SAMPLE_TYPES[t.type](any(), at);
    else { const s = typeSamples(t).valid; args[k] = s[s.length > 1 && t.type === 'struct' ? 1 : 0]; }
  }
  // optional paints get their own slot too (so the pink rows of a piece and the colours here tell them apart)
  for (const [k, t] of Object.entries(entry.args)) {
    if (t.optional && t.type === 'paint') args[k] = isLight(k, t) ? lightSlot() : slot();
    if (t.optional && t.type === 'paints') args[k] = Array.from({ length: t.n }, slot);
  }
  if (sampleOf(entry)) Object.assign(args, sampleOf(entry)(any(), at));
  return { args, slots };
}

/** The values a sheet row shows for one argument, or null when it is not varied (points, paints, lists, shapes). */
function rowValues(t, size) {
  const d = describeArg(t);
  if (d.values) return d.values.slice(0, 8);
  if (t.type === 'flag') return [false, true];
  if (t.type === 'seed') return [0, 1, 2, 3];
  if (t.type === 'count') return t.hi - t.lo <= 7 ? Array.from({ length: t.hi - t.lo + 1 }, (_, i) => t.lo + i) : [t.lo, Math.round((t.lo + t.hi) / 2), t.hi];
  if (t.type === 'px' || t.type === 'share' || t.type === 'angle') {
    const lo = t.type === 'px' ? Math.max(t.lo, -Math.max(size[0], size[1])) : t.lo;
    const hi = t.type === 'px' ? Math.max(lo, Math.min(t.hi, Math.max(size[0], size[1]))) : t.hi;   // never below lo: a width of 40 to 62 in a 32 px cell shows 40, not 32 (platform.moving@1's deck)
    // whole pixels for a px argument whose range is in whole pixels (a scale of 0.1..4 keeps its fraction)
    const mid = t.type === 'px' && Number.isInteger(lo) && Number.isInteger(hi) ? Math.round((lo + hi) / 2) : Math.round(((lo + hi) / 2) * 100) / 100;
    return [...new Set([lo, mid, hi])];
  }
  return null;
}

/**
 * The contact sheet of one generator: { png, w, h, legend (lines: what each row shows), errors (a cell that could not be
 * drawn, or defaults that draw nothing at any phase), cells (the rows of Surfaces, null where one failed) }. A layout or
 * motion generator gives { notDrawn: reason }. Arguments: entry, { size ([w, h]), scale, set (arguments set on every
 * cell, over the sheet's own: to see a call before writing it) }.
 */
export function generatorSheet(entry, { size = [32, 32], scale = 3, set = {} } = {}) {
  if (NOT_DRAWN[entry.family]) return { notDrawn: `${entry.key} is a ${entry.family} generator: it ${NOT_DRAWN[entry.family]}, so it is not drawn alone` };
  const base = baseArgs(entry, size), args = { ...base.args, ...set };
  // the asset's own paint names in --try get sample colours of their own (else every cell fails on an unknown slot)
  const named = [...sheetPaints(entry, set, new Set(base.slots.map((x) => x.id)))].map((id, i) => {
    const c = id === 'shine' ? { hex: '#ffffff', material: 'light' } : SHEET_COLOURS[(base.slots.length + i) % SHEET_COLOURS.length];
    return { id, default: c.hex, material: c.material };
  });
  // with names of its own, the sheet's slots the call no longer paints are left out (a slot nothing paints is refused)
  const used = named.length ? sheetPaints(entry, args) : null;
  const slots = [...base.slots.filter((x) => !used || used.has(x.id)), ...named];
  const errors = [], legend = [], rows = [];
  if (named.length) legend.push(`paints  ${named.map((x) => `${x.id} ${x.default}`).join(', ')} (sample colours for the paint names of --try)`);
  const cellOf = (a, frames) => {
    const c = sheetCell({ size, slots, draw: [{ gen: entry.id, v: entry.v, ...a }], frames });
    if (!c.ok) errors.push(`${JSON.stringify(a)}: ${c.errors.slice(0, 3).join('; ')}`);
    return c;
  };
  rows.push(cellFrames(cellOf(args, PHASES), PHASES));
  legend.push(`row 1  phases: 0, 0.25, 0.5, 0.75 (the defaults: ${JSON.stringify(args)})`);
  if (rows[0].every((g) => g) && rows[0].every((g) => !opaque(g))) errors.push(`${JSON.stringify(args)}: draws nothing at any phase`);
  for (const [k, t] of Object.entries(entry.args)) {
    const values = rowValues(t, size);
    if (!values) continue;
    rows.push(values.map((v) => cellFrames(cellOf({ ...args, [k]: v }, 1), 1)[0]));
    legend.push(`row ${rows.length}  ${k}: ${values.map(fmt).join(', ')}`);
  }
  return { ...sheetPng(rows, { cell: size, scale }), legend, errors, cells: rows };
}

const SLOT_ID = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const RULE_WORDS = new Set(['rule', 'tone', 'when']);

/**
 * The paint names a call's arguments use that the sheet has no slot for, as slot ids (a tone "body.light" and the
 * colours of a rule read down to their slots): its paint arguments, the paints and stamp keys of shapes in its lists,
 * and the paint arguments of calls inside them. ink, clear and the ids in `known` are left out. Returns a Set.
 * Arguments: entry (a generator), args (as written), known (slot ids the sheet has).
 */
export function sheetPaints(entry, args, known = new Set()) {
  const out = new Set();
  const ref = (v) => {
    if (typeof v === 'string') { const id = v.split('.')[0]; if (id !== 'ink' && id !== 'clear' && !known.has(id) && SLOT_ID.test(id)) out.add(id); return; }
    if (Array.isArray(v)) { v.forEach(ref); return; }
    if (v && typeof v === 'object' && typeof v.rule === 'string') for (const [k, x] of Object.entries(v)) if (!RULE_WORDS.has(k)) ref(x);
  };
  const item = (p, depth) => {
    if (!p || typeof p !== 'object' || Array.isArray(p) || depth > 4) return;
    if (Object.hasOwn(p, 'gen')) { const g = generator(p.gen, p.v); if (g) call(g.args, p, depth + 1); return; }
    if (Object.hasOwn(p, 'paint')) ref(p.paint);
    if (p.key && typeof p.key === 'object') Object.values(p.key).forEach(ref);
  };
  const call = (types, a, depth) => {
    for (const [k, t] of Object.entries(types)) {
      const v = a?.[k];
      if (v === undefined) continue;
      if (t.type === 'paint' || t.type === 'paints') ref(v);
      else if (t.type === 'primitives' && Array.isArray(v)) v.forEach((p) => item(p, depth));
      else if (t.type === 'shape' || t.type === 'place') item(v, depth);
    }
  };
  call(entry.args, args, 0);
  return out;
}

/** Does a Surface have a pixel that is not see-through? */
function opaque(g) {
  const b = g.bytes();
  for (let i = 3; i < b.length; i += 4) if (b[i]) return true;
  return false;
}

// ---- command line ----------------------------------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const VALUE = new Set(['--size', '--scale', '--out', '--try']);
  const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
  const name = args.find((a, i) => !a.startsWith('--') && !VALUE.has(args[i - 1]));
  if (!name) {
    const all = generators();
    const w = Math.max(...all.map((g) => g.key.length));
    for (const g of all) console.log(`${g.key.padEnd(w)}  ${g.family.padEnd(8)}  ${g.about}`);
    console.log(`${all.length} generators (node tools/gen.mjs <gen> for one, --sheet to see it)`);
    process.exit(0);
  }
  const found = findGenerator(name);
  if (found.error) { console.error(found.error); process.exit(1); }
  for (const l of generatorTable(found.entry)) console.log(l);
  if (args.includes('--sheet')) {
    const n = Number(flag('size', 32)), scale = Number(flag('scale', 3));
    if (!(n >= 8 && n <= 256) || !(scale >= 1 && scale <= 16)) { console.error('--size takes 8 to 256, --scale 1 to 16'); process.exit(1); }
    let set = {};
    if (flag('try', null) !== null) {
      try { set = JSON.parse(flag('try')); } catch (e) { console.error(`--try takes arguments as JSON, e.g. '{"size": 2}' (${e.message})`); process.exit(1); }
      if (!set || typeof set !== 'object' || Array.isArray(set)) { console.error('--try takes an object of arguments'); process.exit(1); }
    }
    const s = generatorSheet(found.entry, { size: [n, n], scale, set });
    if (s.notDrawn) { console.log(s.notDrawn); process.exit(0); }
    const out = path.resolve(flag('out', path.join(ROOT, 'out')));
    fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, `gen-${found.entry.key}.png`);
    fs.writeFileSync(file, s.png);
    for (const l of s.legend) console.log(l);
    for (const e of s.errors) console.log(`could not draw ${e}`);
    console.log(`wrote ${path.relative(process.cwd(), file) || file} (${s.w}x${s.h})`);
    if (s.errors.length) { console.log(`${s.errors.length} cell${s.errors.length === 1 ? '' : 's'} could not be drawn (left empty on the sheet)`); process.exit(1); }
  }
}
