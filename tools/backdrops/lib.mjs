// What the backdrop writers share (migration batch M10b; docs/data-sprites.md section 7). The five library backgrounds
// (sprites/bg-forest.json, bg-castle.json, bg-battle-field.json, bg-battle-dungeon.json, bg-starfield.json) are data
// files, but their colour chains are long (each main tone is kept clear of the one before it, as the code's
// standApart did, and a derived palette slot cannot yet name a layers colour rule: build item B14c), so each file is
// WRITTEN by a writer in this folder, tools/backdrops/<id>.mjs, and never edited by hand: change the writer and run
//
//   node tools/backdrops/write.mjs [<id> ...]        writes sprites/<id>.json (all five when no id is named)
//   node tools/backdrops/write.mjs --check [<id>]    writes nothing; says which files differ from what their writer gives
//
// tests/unit/backdrop-writers.test.mjs fails when a file differs from its writer's output. A writer exports
// `definition(root)`: the sprite definition, plain data. The files hold no formula: every colour is a named colour rule
// (stand.apart@1, clear.of@1, haze@1, lit.tone@1, sky.look@1, tone, mix, ramp), every number a literal or a binding.
//
// The writers own their inputs (review of M10b, issue 2): each background's head and controls (name, blurb, meta, size,
// pivot, preview, the code's control definitions and sound cues) are in tools/backdrops/heads.json, copied once from
// the code sprites' records; edit them there. The frozen records of the deleted code sprites stay test records only.
// A NEW background is not written here: write its sprites/<id>.json directly (B10's maker, the sprite-forge skill).
// These writers stay for the five redraws until a derived slot can name a layers colour rule (B14c).
//
// Node only (a tool).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A background's head and controls (tools/backdrops/heads.json): id, name, blurb, meta, size, pivot, preview, params, sounds. */
export function rec(root, id) {
  const heads = JSON.parse(fs.readFileSync(path.join(HERE, 'heads.json'), 'utf8'));
  if (!Object.hasOwn(heads, id)) throw new Error(`${id}: no head in tools/backdrops/heads.json`);
  return { id, ...heads[id] };
}

/** A data file of this folder (tools/backdrops/<name>), parsed: what a writer starts from. */
export const own = (name) => JSON.parse(fs.readFileSync(path.join(HERE, name), 'utf8'));

/** Controls written from the code sprite's record: same keys, kinds, labels, ends, defaults, groups and option labels. */
export function controlsFrom(r, { skip = [] } = {}) {
  const out = [];
  for (const [key, o] of Object.entries(r.params)) {
    if (skip.includes(key)) continue;
    if (key === 'speed') { out.push({ key: 'speed', standard: 'speed' }); continue; }
    if (o.kind === 'color') { out.push({ key, kind: 'colour', label: o.label, group: 'Colors' }); continue; }
    const c = { key, kind: o.kind, label: o.label };
    if (o.kind === 'range') Object.assign(c, { lo: o.lo, hi: o.hi, default: o.def });
    if (o.kind === 'choice') Object.assign(c, { options: o.options.map((x) => (typeof x === 'object' ? { value: x.value, label: x.label } : x)), default: o.def });
    if (o.kind === 'toggle') c.default = o.def;
    if (o.group) c.group = o.group;
    out.push(c);
  }
  return out;
}

/** A palette slot for a colour control of the record. */
export const slotFrom = (r, key, material) => ({ id: key, label: r.params[key].label, default: r.params[key].def, material, swatches: r.params[key].swatches });

/** The head of a definition from the record. */
export const head = (r) => ({ format: 'loadout-sprite', version: 2, id: r.id, name: r.name, blurb: r.blurb, meta: r.meta, size: r.size, pivot: r.pivot, grounded: r.grounded, preview: r.preview, styles: ['pixel'] });

// ---- times of day ---------------------------------------------------------------------------------------------------
// A colour that follows the Time of day either names it by a binding (one drawing for every time) or is written for one
// time (`at` one of TIMES: the drawing is repeated per time, each copy shown at its time with a `when`, perTime). The
// second keeps the deepest chains (the forest's middle layer) within the 20 levels of nesting a definition may have.

export const TIMES = ['day', 'dusk', 'night'];
/** sky.look's time and dark for each time of day (engine/backdrop.js skyLook: day midday, dusk the evening, night dark). */
const SKY_AT = { day: { time: 0.5, dark: 0 }, dusk: { time: 1, dark: 0 }, night: { time: 0.5, dark: 1 } };
const byTimeOf = (f) => ({ from: 'time', pick: Object.fromEntries(TIMES.map((t) => [t, f(t)])) });

/** A colour of the sky (sky.look@1 of the `sky` slot): band at a share from the top, air, glow, cloud, under. `at`: one time of day, else bound to Time. */
export function sky(what, share, at) {
  const t = at ? SKY_AT[at] : { time: byTimeOf((x) => SKY_AT[x].time), dark: byTimeOf((x) => SKY_AT[x].dark) };
  return { rule: 'sky.look', v: 1, of: 'sky', ...t, what, ...(share !== undefined ? { at: share } : {}) };
}
export const air = (at) => sky('air', undefined, at);
export const band = (share, at) => sky('band', share, at);

/** A layer's things for each time of day: build(time) for day, dusk and night, each thing shown only at its time. */
export const perTime = (build) => TIMES.flatMap((t) => build(t).map((x) => ({ ...x, when: { ...(x.when ?? {}), time: [t] } })));

// ---- colour rules -----------------------------------------------------------------------------------------------------
const cl = (v) => Math.min(1, Math.max(0, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

/** engine/backdrop.js hazed(depth, haze) as a table on the Haze slider: clamp(depth + lerp(-0.1, 0.3, haze)). */
export function hz(d, key = 'haze') {
  const at = (h) => d - 0.1 + 0.4 * h;
  const pts = [[0, cl(at(0))]];
  if (at(0) < 0) pts.push([r3((0.1 - d) / 0.4), 0]);
  if (at(1) > 1) pts.push([r3((1.1 - d) / 0.4), 1]);
  pts.push([1, cl(at(1))]);
  return { from: key, map: pts.filter((p, i, a) => i === 0 || p[0] > a[i - 1][0]).map(([x, y]) => [r3(x), r3(y)]) };
}

/** engine/backdrop.js recede(of, depth, airColour) (haze@1). */
export const haze = (of, depth, airColour) => ({ rule: 'haze', v: 1, of, air: airColour, depth });
/** engine/backdrop.js litTone (lit.tone@1). */
export const lit = (of, amount, airColour) => ({ rule: 'lit.tone', v: 1, of, air: airColour, amount });
export const tone = (of, by) => ({ rule: 'tone', of, by });
export const mix = (of, w, amount) => ({ rule: 'mix', of, with: w, amount });
export const ramp = (of, t) => ({ rule: 'ramp', of, tone: t });

/** engine/backdrop.js standOut, plain (clear.of@1): the step and a different colour from `behind`, the step from `also`. */
export const clearOf = (of, behind = [], also = [], extra = {}) => ({ rule: 'clear.of', v: 1, of, behind: behind.length ? behind : ['clear'], ...(also.length ? { also } : {}), ...extra });

/**
 * engine/scenery.js standApart of engine/backdrop.js recede, as stand.apart@1: `of` receded into `air` by `depth` (a
 * share or a binding, hz()), then kept clear of `behind` (and a different colour under every site palette) and of
 * `also`; the night form at night (`night`: a time of day for one drawing, else bound to Time; false: never, as the
 * code's plain standOut); `darkest`, `way`, `step` as the rule says. Arguments are left out when they are the rule's
 * defaults, so the files stay short.
 */
export function apart(of, { air: a, depth, behind = [], also = [], night, darkest = 0, way = 'auto', step = 0.08 }) {
  const n = night === undefined ? { from: 'time', pick: { day: false, dusk: false, night: true } } : typeof night === 'string' ? night === 'night' : night;
  return {
    rule: 'stand.apart', v: 1, of, ...(a ? { air: a, depth } : {}), ...(behind.length ? { behind } : {}), ...(also.length ? { also } : {}),
    ...(n !== false ? { night: n } : {}), ...(darkest ? { darkest } : {}), ...(way !== 'auto' ? { way } : {}), ...(step !== 0.08 ? { step } : {}),
  };
}

// ---- clouds as the code placed them -----------------------------------------------------------------------------------

/**
 * The code backdrops' clouds (bg-forest, bg-battle-field): round(lerp(fewest, most, Clouds)) of them at the stable
 * scatter of `seed` (engine/backdrop.js scatter, as engine/gen/backdrop.js spots), each on row top + round(v * rows) *
 * step, wide[0] px wide at v 0 to wide[1] at v 1 plus up to `vary` px by u, its bumps by its index. Written as one
 * cloud@1 call each (the most the slider gives), each shown from the Clouds value at which the code had that many:
 * plain data, the places worked out here once. `spots` is engine/gen/backdrop.js spots.
 */
export function codeClouds(spots, { fewest = 2, most = 8, seed = 12, top, step = 5, rows, wide, vary = 8, paint, under, key = 'clouds' }) {
  // (in the order the code drew them, left to right; the one of index i is there when the count is above i)
  return spots(most, seed, { stable: true }, 320).map((c) => {
    const k = c.i;
    // round(fewest + (most - fewest) * x) > k from x = (k + 0.5 - fewest) / (most - fewest) on (rounded up to 0.001)
    const from = Math.ceil((1000 * (k + 0.5 - fewest)) / (most - fewest)) / 1000;
    const w = Math.round((wide[0] + (wide[1] - wide[0]) * c.v + c.u * vary) * 1000) / 1000;
    const call = { gen: 'cloud', v: 1, at: [c.x, top + Math.round(c.v * rows) * step], size: w, vary: 0, seed: c.i, paint, under };
    return k < fewest || from <= 0 ? call : { ...call, when: { [key]: [{ atLeast: from }] } };
  });
}

// ---- shapes ---------------------------------------------------------------------------------------------------------
export const rect = (x, y, w, h, paint, more = {}) => ({ kind: 'rect', at: [x, y], size: [w, h], paint, shade: 0, ...more });
export const ellipse = (x, y, rx, ry, paint, more = {}) => ({ kind: 'ellipse', at: [x, y], r: [rx, ry], paint, shade: 0, ...more });
export const polyP = (points, paint, more = {}) => ({ kind: 'poly', points, paint, shade: 0, ...more });

/** An outline moved dx px right and dy px down (engine/backdrop.js shifted). */
export const shifted = (outline, dx = 0, dy = 0) => (x) => outline(x - dx) + dy;
/** The highest of several outlines at each column (engine/backdrop.js highest). */
export const highest = (...outlines) => (x) => { let y = Infinity; for (const f of outlines) { const v = f(x); if (v < y) y = v; } return y; };

// ---- the file ---------------------------------------------------------------------------------------------------------

/** A definition as the text of its file: the head one field a line, palette, controls and clips one entry a line, each layer's draw one item a line. */
export function format(def) {
  const J = (v) => JSON.stringify(v);
  const lines = ['{'];
  const keys = Object.keys(def);
  keys.forEach((k, i) => {
    const end = i === keys.length - 1 ? '' : ',';
    const v = def[k];
    if (k === 'palette' || k === 'controls' || k === 'versions') lines.push(`  ${J(k)}: [\n    ${v.map(J).join(',\n    ')} ]${end}`);
    else if (k === 'clips') lines.push(`  "clips": {\n    ${Object.entries(v).map(([c, x]) => `${J(c)}: ${J(x)}`).join(',\n    ')} }${end}`);
    else if (k === 'body') lines.push(`  "body": { "layers": [\n${v.layers.map((l) => `    { "name": ${J(l.name)}, "label": ${J(l.label)}, "scroll": ${l.scroll}, "draw": [\n      ${l.draw.map(J).join(',\n      ')} ] }`).join(',\n')} ] }${end}`);
    else lines.push(`  ${J(k)}: ${J(v)}${end}`);
  });
  lines.push('}');
  const text = lines.join('\n') + '\n';
  JSON.parse(text);
  return text;
}

/** The ids of the backgrounds written here, each with its writer module tools/backdrops/<id>.mjs. */
export const BACKDROP_IDS = Object.freeze(['bg-forest', 'bg-starfield', 'bg-castle', 'bg-battle-field', 'bg-battle-dungeon']);
