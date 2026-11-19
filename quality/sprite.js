// The sprite quality bar as code. Pure JavaScript: no file, DOM or Node access,
// so the same checks run in the site build, in the command-line checker and in a
// browser (an asset an agent makes through the live site meets the same bar).
//
//   checkSprite(def, { soundIndex, validateMeta }) -> { errors: [...], warnings: [...], metrics: {...} }
//
// def           what defineSprite() returned (defineSprite already refuses a bad `parts` declaration)
// soundIndex    Map (or plain object) of sound id -> patch; when missing, sound cues are not checked
// validateMeta  (meta, kind) -> { ok, errors } from catalog/schema.js; when missing, metadata is not checked
//
// One message per cause: a fault seen in many frames or looks is reported once, naming
// the first place it was seen, "and N more". Every threshold is in THRESHOLDS and is
// written down in docs/quality-bar.md.
//
// Styles (docs/architecture.md, Contract 12): the bar runs once for every style the sprite lists
// (engine/styles.js), on that style's pixel picture of each frame. A sprite with pixel alone is checked
// once, exactly as before styles existed. With more styles, every message about what a style draws starts
// with `style "<id>": `; faults of the sprite itself (controls, metadata, sounds) are reported once.

import { renderFrame, defaultParams, cleanParams, randomParams, clipFps, inEffect, partList } from '../engine/sprite.js';
import { brightness, hexToRgb, rgbToHsl } from '../engine/color.js';
import { blockJoins, classifyTiles } from '../engine/tiles.js';
import { THEME_PRESETS, applyColour, themedParams, spriteMaterials, lookColours, randomTheme, toneNeed } from '../engine/theme.js';
import { outsideMaterial, colourGap, materialById, unsaidMaterial, MATERIAL_IDS } from '../engine/materials.js';
import { stylesOf, styleById, styleIds } from '../engine/styles.js';
import { Surface } from '../engine/surface.js';
import { cleanVersions } from '../engine/versions.js';

const BLOCK_JOINS = blockJoins({ narrow: true, lanes: true });    // every pair of block pieces (the 13, the 7 narrow ones, the 9 lane ones) that can touch: [[a, axis, b], ...]

export const THRESHOLDS = {
  randomLooks: 12,          // seeded random looks drawn on top of default, all-low, all-high, every choice option and every toggle flipped
  strengthPer: 100,         // N = clamp(round(opaque pixels of the default first frame / strengthPer), strengthMin, strengthMax)
  strengthMin: 2, strengthMax: 8,
  fillWarn: 1 / 3,          // smallest look, longer side: warn below this share of the frame
  fillError: 1 / 4,         // ... error below this
  colours: { character: 32, creature: 32, tileset: 24, prop: 24, pickup: 16, projectile: 12, effect: 24, background: 32, ui: 16, icon: 16 },
  minControls: 4,           // warn below this many controls in all
  maxControls: 16,          // warn above this many controls outside parts
  maxPartControls: 6,       // warn above this many controls in one part (selector included)
  feetSlack: 2,             // lowest pixel of the first clip may sit this far from the pivot line
  loopSeamFactor: 2.5, loopSeamSlack: 8,
  seamBreakFloor: 1, seamJumpFloor: 0.08,    // tile and background seams: see seamCheck()
  tileOutlineGaps: 0,       // tiles: the outlines on the two sides of a join may differ by this many pixels (backgrounds use seamBreakFloor)
  joinRandomLooks: 6,       // tile joins are tested at every tested setting and at this many of the random looks
  textureMinPixels: 4,      // a fill's texture colour counts from this many pixels
  textureHue: 35,           // ... and is a tone of the fill colour when its hue is within this many degrees (or both are grey)
  sampleFrames: 4,          // frames per clip used when testing what a control does
  tileSizes: [16, 32],
  // Survives every look (S-survives-looks): under each whole-bundle look (THEME_PRESETS in engine/theme.js)
  // at least this share of a clip's edges must be left. An edge is two neighbouring pixels that differ; it is
  // left when they still differ after the look. Edges between drawn and see-through pixels are always left.
  // Measured 2026-11-18 over every clip of the 16 sprites in sprites/ under the 13 looks (the two backdrops and the
  // forest tiles as they stood before they were fixed), each picture judged by eye. Clips that still read: 0.60 and
  // up (the Hero 0.88 to 0.96; every character, creature, pickup and interface piece 0.78 or more). Clips whose
  // shapes had merged: 0.63 and down (the forest backdrop's far layer, ridge lost in the sky: 0.41 to 0.63 under six
  // looks). The two groups overlap between 0.55 and 0.65, so this is a warning: look at the picture.
  // An error level would go at 0.5: nothing judged readable scored under 0.6, and under 0.5 a layer is one flat shape
  // (it would have failed the forest backdrop and the forest tiles before their fix, and fails no sprite after it).
  // Counting colours kept instead does not separate them (the bat keeps 47% of its colours and reads; the bad far
  // layer kept 63%), and counting only the edges inside the outline fails layers that keep a clear silhouette.
  lookEdgesWarn: 0.65,
  // Held under every look (S-held-under-looks): what the site really draws under a look (lookColours in
  // engine/theme.js: every colour held by its material, tones kept apart) is measured for each named look and for
  // lookSurprises "Surprise me" looks (seeds 1 to lookSurprises). Two faults are looked for:
  //   a colour that left its material's limits (outsideMaterial in engine/materials.js): the sky went brown;
  //   two tones that were clearly different (toneNeed in engine/theme.js) and are now less than toneSame apart
  //   (colourGap: 0.02 is about the least difference an eye picks up between two flat areas): two colour-coded
  //   cells became one grey. Only tones that each cover toneShare of the sprite's drawn pixels count, and at most
  //   the toneMost most used.
  lookSurprises: 6,
  toneSame: 0.02,
  toneShare: 0.004,
  toneMost: 48,
  // Inside the frame under a look that varies shapes (S-inside-frame-shapes): seeds 0 to shapeSeeds - 1 of
  // themedParams (engine/theme.js) are drawn. The two faults that led to this check (2026-11-18: void-ranger `die`
  // frame 5 and muzzle-flash `burst` frame 3, found by the 50-seed sweep in tests/unit/theme-colour.test.mjs) showed
  // at seed 8 only, and at seeds 3, 5, 9, 10 and nine more: 9 seeds is the fewest that catch both, 12 leaves a
  // margin. A fault that 1 seed in 50 shows is mostly missed by any small number: that test stays the wider net.
  shapeSeeds: 12,
  // ... and of each clip, the frames that reach furthest at the default, all-low and all-high settings are drawn
  // first (45% of all frames), the rest only when one of those comes this near the frame edge, in pixels. Measured
  // over the 330 clips of every sprite then in sprites/ x 12 seeds x 4 sides: those frames gave the true reach
  // exactly in 97.2% of cases, within 1 pixel in 99.6% and within 2 in 99.8%.
  shapeNear: 2,
};

// def.kind (older sprites) -> meta.type, used when a sprite has no meta yet
const KIND_TO_TYPE = { Character: 'character', Creature: 'creature', Item: 'pickup', Effect: 'effect' };
const MAY_STAND_STILL = new Set(['prop', 'icon', 'tileset', 'ui', 'background']);
const MUST_MOVE = new Set(['character', 'creature']);
const FILLS_FRAME = new Set(['tileset', 'background']);
const EDGE_FREE = new Set(['tileset', 'background', 'ui', 'icon']);
const NO_GROUND = new Set(['tileset', 'background', 'ui', 'icon']);

/** What a sprite is, for the bar's per-type rules: its meta.type, or from its older `kind` ('Item' -> 'pickup'). */
export function spriteType(def) {
  return (def.meta && typeof def.meta.type === 'string' && def.meta.type) || KIND_TO_TYPE[def.kind] || String(def.kind || 'character').toLowerCase();
}

const lookup = (index, id) => (!index ? undefined : typeof index.get === 'function' ? index.get(id) : index[id]);
const now = () => (typeof performance !== 'undefined' ? performance : Date).now();

function diff(a, b, cap = Infinity) {
  const x = a.data, y = b.data;
  let n = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && ++n > cap) return n;
  return n;
}

const lum = (v) => ((v & 255) * 0.299 + ((v >>> 8) & 255) * 0.587 + ((v >>> 16) & 255) * 0.114) / 255;

// One line of pixels: a column (axis 'x', index i) or a row (axis 'y').
function line(g, axis, i) {
  const out = new Uint32Array(axis === 'x' ? g.h : g.w);
  if (axis === 'x') for (let y = 0; y < g.h; y++) out[y] = g.data[y * g.w + i];
  else for (let x = 0; x < g.w; x++) out[x] = g.data[i * g.w + x];
  return out;
}
// How two neighbouring lines of pixels differ: `breaks` = positions where one side is
// drawn and the other is see-through; `jump` = mean brightness step where both are drawn.
function step(a, b) {
  let breaks = 0, both = 0, jump = 0;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i] !== 0, pb = b[i] !== 0;
    if (pa !== pb) breaks++;
    else if (pa) { both++; jump += Math.abs(lum(a[i]) - lum(b[i])); }
  }
  return { breaks, jump: both ? jump / both : 0 };
}
const stepCache = new WeakMap();      // a tile is tested against many neighbours: its own largest step is worked out once
function largestStep(g, axis) {
  const known = stepCache.get(g);
  if (known && known[axis]) return known[axis];
  const n = axis === 'x' ? g.w : g.h;
  let breaks = 0, jump = 0;
  for (let i = 0; i + 1 < n; i++) { const s = step(line(g, axis, i), line(g, axis, i + 1)); breaks = Math.max(breaks, s.breaks); jump = Math.max(jump, s.jump); }
  const out = { breaks, jump };
  stepCache.set(g, { ...known, [axis]: out });
  return out;
}
/**
 * Seam test, used for tiles and background layers. A is on the left (or on top), B on
 * the right (or below). The step across the seam (A's last column or row against B's
 * first) must be no bigger than the largest step between neighbouring columns (rows)
 * inside the tile: inside A when A and B are the same tile, otherwise the smaller of
 * A's and B's largest steps. Floors: 1 gap and a brightness step of 0.08.
 */
export function seamCheck(A, B, axis) {
  const T = THRESHOLDS;
  const s = step(line(A, axis, (axis === 'x' ? A.w : A.h) - 1), line(B, axis, 0));
  const ma = largestStep(A, axis), mb = A === B ? ma : largestStep(B, axis);
  const maxBreaks = Math.max(T.seamBreakFloor, Math.min(ma.breaks, mb.breaks)), maxJump = Math.max(T.seamJumpFloor, Math.min(ma.jump, mb.jump));
  return { ok: s.breaks <= maxBreaks && s.jump <= maxJump, breaks: s.breaks, jump: s.jump, maxBreaks, maxJump };
}

// ---- tiles: exact tests at a join -------------------------------------------------------------------
const firstDrawn = (l) => { for (let i = 0; i < l.length; i++) if (l[i] !== 0) return i; return l.length; };
// How far a line differs from the block's fill, counted in from each end: the depth of the edge band there
// (see-through pixels outside the outline count too). ref: the same line of the fill tile.
function bandRuns(l, ref) {
  let a = 0, b = 0;
  while (a < l.length && l[a] !== ref[a]) a++;
  while (b < l.length && l[l.length - 1 - b] !== ref[l.length - 1 - b]) b++;
  return [a, b];
}
const bandCache = new WeakMap();
// the largest change of band depth between neighbouring lines inside one tile, per end: [fromStart, fromEnd]
function bandSteps(g, F, axis) {
  let known = bandCache.get(g);
  if (!known) bandCache.set(g, known = new Map());
  let per = known.get(F);
  if (!per) known.set(F, per = {});
  if (per[axis]) return per[axis];
  const n = axis === 'x' ? g.w : g.h, out = [0, 0];
  let prev = bandRuns(line(g, axis, 0), line(F, axis, 0));
  for (let i = 1; i < n; i++) {
    const cur = bandRuns(line(g, axis, i), line(F, axis, i));
    out[0] = Math.max(out[0], Math.abs(cur[0] - prev[0])); out[1] = Math.max(out[1], Math.abs(cur[1] - prev[1]));
    prev = cur;
  }
  return (per[axis] = out);
}
/**
 * Edge band test for two pieces of one block. A is left of B (axis 'x') or above it ('y'); F is the block's fill.
 * The band's depth on A's last line and on B's first may differ by no more than it changes between neighbouring
 * lines inside either tile (the smaller of the two tiles' largest changes). Returns { ok, step, allowed, end }.
 */
export function bandCheck(A, B, F, axis) {
  const n = axis === 'x' ? A.w : A.h;
  const a = bandRuns(line(A, axis, n - 1), line(F, axis, n - 1)), b = bandRuns(line(B, axis, 0), line(F, axis, 0));
  const sa = bandSteps(A, F, axis), sb = A === B ? sa : bandSteps(B, F, axis);
  let worst = { ok: true, step: 0, allowed: 0, end: 0 };
  for (const end of [0, 1]) {
    const step = Math.abs(a[end] - b[end]), allowed = Math.min(sa[end], sb[end]);
    if (step > allowed && step - allowed >= worst.step - worst.allowed) worst = { ok: false, step, allowed, end };
  }
  return worst;
}
/**
 * Something that repeats along a line of a tile that itself repeats (a platform's middle, a ladder's middle) must fit
 * the tile a whole number of times. Looks at every line along the axis for drawn marks of the same colours and
 * length, in the same places on two neighbouring lines: three or more whose usual spacing does not divide the tile's
 * length (board joints every 9 px), and, with `pairs`, two marks two or more pixels long that are not half a tile
 * apart (rungs 15 px apart).
 * Returns { step, at, count } for the first one found, or null.
 */
export function unevenRepeat(g, axis, { pairs = false } = {}) {
  const n = axis === 'x' ? g.w : g.h, m = axis === 'x' ? g.h : g.w;
  // one line: the marks whose spacing does not fit, as { step, count, key } (key: where they are)
  const along = (j) => {
    const px = (i) => (axis === 'x' ? g.data[j * g.w + (i % n)] : g.data[(i % n) * g.w + j]);
    const count = new Map();
    for (let i = 0; i < n; i++) count.set(px(i), (count.get(px(i)) ?? 0) + 1);
    if (count.size < 2) return [];
    const mode = [...count].sort((x, y) => y[1] - x[1])[0][0];
    let start = 0;
    while (px(start) !== mode) start++;
    const marks = new Map();                       // colours of a mark -> where each one starts
    for (let i = start; i < start + n; i++) {
      if (px(i) === mode) continue;
      const from = i, key = [];
      while (px(i) !== mode) key.push(px(i++));
      if (key.every((v) => v === 0)) continue;     // a gap in the drawing is not a mark
      const k = key.join(',');
      if (!marks.has(k)) marks.set(k, { at: [], size: key.length });
      marks.get(k).at.push(from % n);
    }
    const found = [];
    for (const { at, size } of marks.values()) {
      if (at.length < 2) continue;
      at.sort((x, y) => x - y);
      const gaps = at.map((v, i) => (i + 1 < at.length ? at[i + 1] - v : at[0] + n - v));
      if (at.length === 2) { if (pairs && size >= 2 && gaps[0] !== gaps[1]) found.push({ step: Math.min(...gaps), count: 2, key: at.join(',') }); continue; }
      // the usual spacing: the gap most of the marks share, at least twice in a row
      const tally = new Map();
      for (const gap of gaps) tally.set(gap, (tally.get(gap) ?? 0) + 1);
      const [step, times] = [...tally].sort((x, y) => y[1] - x[1])[0];
      const inARow = gaps.some((gap, i) => gap === step && gaps[(i + 1) % gaps.length] === step);
      if (times >= Math.max(2, Math.ceil(at.length / 2)) && inARow && n % step !== 0) found.push({ step, count: at.length, key: at.join(',') });
    }
    return found;
  };
  // a real rhythm (board joints, rungs) is more than one pixel thick: two neighbouring lines show the same marks
  let prev = along(0);
  for (let j = 1; j < m; j++) {
    const cur = along(j);
    for (const f of cur) if (prev.some((q) => q.key === f.key)) return { step: f.step, at: j - 1, count: f.count };
    prev = cur;
  }
  return null;
}

function farthestPair(swatches) {
  let best = null, bd = -1;
  const rgb = swatches.map((c) => (/^#[0-9a-f]{6}$/i.test(c) ? hexToRgb(c) : [0, 0, 0]));
  for (let i = 0; i < rgb.length; i++) for (let j = i + 1; j < rgb.length; j++) {
    const d = (rgb[i][0] - rgb[j][0]) ** 2 + (rgb[i][1] - rgb[j][1]) ** 2 + (rgb[i][2] - rgb[j][2]) ** 2;
    if (d > bd) { bd = d; best = [swatches[i], swatches[j]]; }
  }
  return best;
}

const fmt = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const lit = (v) => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v));

/** A control's `when` as a list of alternatives ("any of these"), each { key: [values] }. */
export function whenAlternatives(when) {
  if (when === undefined || when === null) return [];
  return (Array.isArray(when) ? when : [when]).map((alt) => Object.fromEntries(Object.entries(alt).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])));
}

/**
 * The `when` that matches where a control worked, from the tested settings: a key whose
 * values split into some where the control changed the picture and some where it did not.
 * res: { deadIn, aliveIn } (setting names such as 'default', 'hat=none'); dflt: default values.
 * Alive at the default: every split key must hold, so one object. Dead at the default and
 * alive with either of several keys: any one is enough, so a list. Null when no key explains it.
 */
export function whenHint(res, params, dflt) {
  const status = new Map();                       // key -> Map(value -> alive?)
  const note = (bn, alive) => {
    const m = /^([^=]+)=(.*)$/.exec(bn);
    if (!m || !params[m[1]]) return;
    const d = params[m[1]];
    const v = d.kind === 'toggle' ? m[2] === 'true' : d.options?.find((o) => fmt(o.value) === m[2])?.value;
    if (v === undefined) return;
    if (!status.has(m[1])) status.set(m[1], new Map());
    status.get(m[1]).set(v, alive);
  };
  res.deadIn.forEach((bn) => note(bn, false));
  res.aliveIn.forEach((bn) => note(bn, true));
  const defaultAlive = res.aliveIn.includes('default');
  for (const [key, m] of status) if (params[key].kind === 'toggle' && !m.has(dflt[key])) m.set(dflt[key], defaultAlive);
  const split = [];
  for (const [key, m] of status) {
    const alive = [...m].filter(([, a]) => a).map(([v]) => v);
    if (alive.length && [...m].some(([, a]) => !a)) split.push(`${key}: [${alive.map(lit).join(', ')}]`);
  }
  if (!split.length) return null;
  return defaultAlive || split.length === 1 ? `when: { ${split.join(', ')} }` : `when: [${split.map((x) => `{ ${x} }`).join(', ')}]`;
}
const settingName = (bn) => (bn === 'default' ? 'everything else is at its default' : bn === 'all-low' ? 'all sliders low' : bn === 'all-high' ? 'all sliders high' : bn);

/** The looks a sprite is measured under: every named look that changes a colour, then THRESHOLDS.lookSurprises "Surprise me" looks. [{ id, name, colour }] */
export function checkedLooks() {
  const plain = JSON.stringify(THEME_PRESETS.find((p) => p.id === 'original')?.theme.colour ?? {});
  return [
    ...THEME_PRESETS.filter((p) => JSON.stringify(p.theme.colour) !== plain).map((p) => ({ id: p.id, name: p.name, colour: p.theme.colour })),
    ...Array.from({ length: THRESHOLDS.lookSurprises }, (_, i) => ({ id: `surprise-${i + 1}`, name: `Surprise me (number ${i + 1})`, colour: randomTheme(i + 1).colour })),
  ];
}

/**
 * What goes wrong with one sprite's colours under looks: the measure behind "held under every look".
 * table: what each colour of the sprite is of, from spriteMaterials (engine/theme.js);
 * looks: [{ id, name, colour }] (checkedLooks() when left out);
 * recolour(table, colour): the look worked out for the sprite, { one, of(r, g, b) } or null when it changes nothing.
 *   Left out, it is the engine's own (lookColours): what the site draws. A test hands in another to show a fault.
 * Returns { tested, left, merged }:
 *   left    a colour outside its material's limits: [{ look, from, to, material, control, why }] ('#rrggbb' colours);
 *   merged  two tones, clearly different as made, now nearly the same: [{ look, a, b, before, after }].
 */
export function lookFaults(table, looks = checkedLooks(), recolour = lookColours) {
  const T = THRESHOLDS;
  const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  const all = [...table.colours].map(([v, e]) => ({ ...e, rgb: [v >>> 16, (v >>> 8) & 255, v & 255] })).sort((a, b) => b.n - a.n);
  const tones = all.filter((c) => c.n >= Math.max(2, table.total * T.toneShare)).slice(0, T.toneMost);
  const pairs = [];
  for (let i = 0; i < tones.length; i++) for (let j = i + 1; j < tones.length; j++) {
    const before = colourGap(tones[i].rgb, tones[j].rgb);
    if (toneNeed(before)) pairs.push([i, j, before]);
  }
  const out = { tested: 0, left: [], merged: [] };
  for (const look of looks) {
    const made = recolour(table, look.colour);
    if (!made) continue;
    out.tested++;
    const swapsInk = typeof look.colour.outline === 'string';
    for (const c of all) {
      if (c.n < 2 || (swapsInk && hex(c.rgb) === '#231b33')) continue;      // the outline colour is swapped for the look's own, whatever it is of
      const to = made.of(...c.rgb);
      const why = outsideMaterial(c.material, c.rgb, to, { oneColour: !!made.one });
      if (why) out.left.push({ look, from: hex(c.rgb), to: hex(to), material: c.material, control: c.control, why });
    }
    const to = tones.map((c) => made.of(...c.rgb));
    for (const [i, j, before] of pairs) {
      const after = colourGap(to[i], to[j]);
      if (after < T.toneSame) out.merged.push({ look, a: hex(tones[i].rgb), b: hex(tones[j].rgb), before, after, into: hex(to[i]) });
    }
  }
  return out;
}

/**
 * Run the sprite quality bar on a definition. Returns { errors, warnings, metrics }; no errors means it passes.
 * soundIndex: Map or object of sound id -> patch (left out: sound cues are not checked);
 * validateMeta: (meta, kind) -> { ok, errors } from catalog/schema.js (left out: metadata is not checked).
 * The bar runs once per style the sprite lists. metrics are the first style's, with `ms` the whole check; a sprite
 * with more than one style also gets metrics.styles: { id: that style's metrics }. metrics.outsideCalls lists the
 * ways the sprite's own code reads or writes pixels directly ([] when it does not; null when that cannot be told here).
 */
export function checkSprite(def, options = {}) {
  const t0 = now();
  const ids = stylesOf(def);
  const known = ids.filter((id) => styleById(id));
  const errors = [], warnings = [];
  for (const id of ids) if (!styleById(id)) errors.push(`styles: "${id}" is not a style (the styles are: ${styleIds().join(', ')})`);
  let metrics = { type: spriteType(def), renders: 0, looks: 0 };
  if (known.length) {
    // pixel alone: nothing is named, as before styles existed. Otherwise every message about a drawing says whose it is.
    const named = !(ids.length === 1 && ids[0] === 'pixel');
    const tag = (id) => (named ? `style "${id}": ` : '');
    const first = checkStyle(def, options, { style: styleById(known[0]), first: true, tag: tag(known[0]) });
    errors.push(...first.errors); warnings.push(...first.warnings);
    metrics = first.metrics;
    if (ids.length > 1) {
      metrics.styles = { [known[0]]: { ...first.metrics } };
      for (const id of known.slice(1)) {
        const r = checkStyle(def, options, { style: styleById(id), first: false, tag: tag(id) });
        errors.push(...r.errors); warnings.push(...r.warnings);
        metrics.styles[id] = r.metrics;
      }
    }
    // the sprite's own code reading pixels back or writing the pixel buffer: it could never be drawn on another surface
    const t1 = now();
    const outside = paramsBuilt(def) ? directPixelUse(def, styleById(known[0]), first.metrics.renders) : null;
    metrics.outsideCalls = outside ? outside.calls : null;
    metrics.outsideMs = Math.round((now() - t1) * 10) / 10;
    if (outside && outside.calls.length) warnings.push(`draws outside the surface's calls: the sprite's own code reads pixels back or writes the pixel buffer directly (${outside.calls.join(', ')}; first at ${outside.where}). That only works on the pixel grid, so the sprite can never be given another style (docs/architecture.md, Contract 12). Do it with a framework helper, or keep in mind that it stays pixel-only`);
  }
  metrics.ms = Math.round((now() - t0) * 10) / 10;
  return { errors, warnings, metrics };
}

const paramsBuilt = (def) => Object.values(def.params || {}).every((d) => d && d.kind);

// ---- the sprite's own code touching pixels (Contract 12) ----------------------------------------------------------
// A sprite draws through the surface's calls. Reading pixels back (get, bounds, bytes) or using the pixel buffer
// (data) ties it to the pixel grid. Framework code (engine/, rigs/) may do both: helpers that must say which
// styles they suit. To tell the two apart, some frames are drawn again on a stand-in for the surface: an object
// that passes every call on to a real Surface and notes each read-back made on it, traced to the file it came
// from. The engine itself is never altered for this (changing Surface, even briefly, leaves every later frame
// slower), so only the surface the sprite is handed is watched: pixels read from a layer the sprite made itself
// (new Surface) are not seen.
// Which frames, in this order, until the allowance is spent (WATCH_SHARE of the check's own renders; at least one
// per clip, and at least WATCH_SMALL frames of a 32 x 32 sprite, fewer of a bigger one):
//   1. the first frame of every clip at the default settings;
//   2. the last frame of every clip at the default settings (a death pose, the end of a break);
//   3. the first frame of the first clip at every other tested setting (all sliders low, all high, each option
//      of each choice, each on/off control flipped), so code that runs for one option only is reached;
//   4. the frames in between, at the default settings;
//   5. the last frame of the last clip at each of those settings.
// A rig may read thousands of pixels per frame, so not every use is traced: of each kind (data, get, bounds, bytes)
// the first TRACE_FIRST are, then one in TRACE_EVERY, TRACE_MOST in all. This is a sample, not a proof: code that
// runs only for one option on one middle frame, or one read among a helper's thousands, can be missed.

const SITE = new URL('..', import.meta.url).href;                 // the project folder, as stack traces name it
const THIS_FILE = new URL(import.meta.url).href.split('?')[0];
const FRAMEWORK_FOLDERS = ['engine/', 'rigs/', 'quality/', 'sound/', 'catalog/'];
const READS_BACK = new Set(['get', 'bounds', 'bytes']);
const TRACE_FIRST = 64, TRACE_EVERY = 16, TRACE_MOST = 1500;
const WATCH_SHARE = 0.02, WATCH_SMALL = 24;

/** Where the code that called into the watcher lives: { url, line } of the first frame outside this file, or null. */
function callerOf() {
  const limit = Error.stackTraceLimit;
  if (typeof Error.captureStackTrace === 'function') {
    // V8 (Node, Chromium): the frames as objects, which costs far less than writing the trace out as text
    const prepare = Error.prepareStackTrace, holder = {};
    let sites = null;
    Error.stackTraceLimit = 5;
    Error.prepareStackTrace = (_, frames) => frames;
    try { Error.captureStackTrace(holder, callerOf); sites = holder.stack; } finally { Error.prepareStackTrace = prepare; Error.stackTraceLimit = limit; }
    if (Array.isArray(sites)) {
      for (const site of sites) {
        const url = site.getFileName?.() ?? site.getScriptNameOrSourceURL?.();
        if (typeof url === 'string' && url && url.split('?')[0] !== THIS_FILE) return { url, line: site.getLineNumber?.() ?? 0 };
      }
      return null;
    }
  }
  Error.stackTraceLimit = 6;
  const stack = String(new Error().stack ?? '');
  Error.stackTraceLimit = limit;
  for (const frame of stack.split('\n')) {
    const m = /([a-z][a-z0-9+.-]*:[^\s()]+?):(\d+):\d+\)?\s*$/i.exec(frame);
    if (!m || m[1].split('?')[0] === THIS_FILE) continue;
    return { url: m[1], line: Number(m[2]) };
  }
  return null;
}
/** True when this JavaScript engine says where a call came from. */
const canTrace = () => { try { return typeof new Error().stack === 'string' && new Error().stack.length > 0; } catch { return false; } };

/**
 * A stand-in for a pixel Surface: it has the same calls and passes each one on to `real`, and tells note(what)
 * about every read-back made on it ('get', 'bounds', 'bytes', or 'data' for the pixel buffer). The real Surface's
 * own use of its pixels never comes through here, so everything noted was asked for from outside.
 */
function standIn(real, note) {
  const g = { constructor: Surface };
  Object.defineProperty(g, 'w', { enumerable: true, get: () => real.w });
  Object.defineProperty(g, 'h', { enumerable: true, get: () => real.h });
  Object.defineProperty(g, 'shadow', { enumerable: true, get: () => real.shadow, set: (v) => { real.shadow = v; } });
  Object.defineProperty(g, 'data', { enumerable: true, get: () => { note('data'); return real.data; }, set: (v) => { note('data'); real.data = v; } });
  for (const name of Object.getOwnPropertyNames(Surface.prototype)) {
    const fn = Surface.prototype[name];
    if (name === 'constructor' || typeof fn !== 'function') continue;
    const reads = READS_BACK.has(name);
    // eight arguments are the most any call takes; passing them by position costs less than collecting them (a
    // backdrop helper sets tens of thousands of single pixels per frame). No call counts its arguments.
    g[name] = (a, b, c, d, e, f, x, y) => { if (reads) note(name); const out = fn.call(real, a, b, c, d, e, f, x, y); return out === real ? g : out; };
  }
  return g;
}

/**
 * Draws the frames named above on a stand-in and reports how the sprite's own code used pixels directly.
 * style: the style to draw in (from engine/styles.js); renders: how many frames the check itself drew.
 * Returns { calls: ['data', 'get', ...] (sorted; empty when it kept to the surface's calls), where: 'file:line' of the
 * first one }, or null when it cannot be told: this JavaScript engine gives no stack traces to tell sprite code from
 * framework code, or the style does not draw on a pixel Surface (there are then no pixels to read).
 */
function directPixelUse(def, style, renders = 0) {
  if (!canTrace()) return null;
  const calls = new Set(), seen = { data: 0, get: 0, bounds: 0, bytes: 0 };
  let traced = 0, where = null;
  const note = (what) => {
    if (calls.has(what) || traced >= TRACE_MOST) return;           // already known, or enough looked at
    const n = ++seen[what];
    // after the first few, one in TRACE_EVERY, picked by a scramble of the count so a regular loop cannot hide from it
    if (n > TRACE_FIRST && (Math.imul(n, 0x9e3779b1) >>> 0) % TRACE_EVERY) return;
    traced++;
    const from = callerOf();
    if (!from) return;
    const path = from.url.startsWith(SITE) ? from.url.slice(SITE.length).split('?')[0] : null;
    if (path && FRAMEWORK_FOLDERS.some((d) => path.startsWith(d))) return;      // a framework helper: its business
    calls.add(what);
    where ??= `${path ?? (from.url.startsWith('blob:') ? 'the sprite\'s source' : from.url.split('/').pop())}:${from.line}`;
  };
  const dflt = defaultParams(def), lo = {}, hi = {}, looks = [];
  for (const [k, d] of Object.entries(def.params)) {
    if (d.kind === 'range') { lo[k] = d.min; hi[k] = d.max; }
    if (d.kind === 'choice') for (const o of d.options) if (o.value !== dflt[k]) looks.push({ ...dflt, [k]: o.value });
    if (d.kind === 'toggle') looks.push({ ...dflt, [k]: !dflt[k] });
  }
  looks.push(cleanParams(def, lo), cleanParams(def, hi));
  const clips = Object.keys(def.clips || {}), count = (clip) => def.clips[clip].frames;
  const frames = clips.map((clip) => [clip, 0, dflt]);
  for (const clip of clips) if (count(clip) > 1) frames.push([clip, count(clip) - 1, dflt]);
  for (const p of looks) if (clips.length) frames.push([clips[0], 0, p]);
  for (const clip of clips) for (let f = 1; f < count(clip) - 1; f++) frames.push([clip, f, dflt]);
  for (const p of looks) if (clips.length) frames.push([clips[clips.length - 1], count(clips[clips.length - 1]) - 1, p]);
  const [w, h] = def.size;
  const allowance = Math.max(clips.length, Math.round(renders * WATCH_SHARE), Math.round((WATCH_SMALL * 1024) / (w * h)));
  for (const [clip, f, p] of frames.slice(0, allowance)) {
    // what renderFrame (engine/sprite.js) hands to render(), with the stand-in in place of the surface
    const c = def.clips[clip];
    const ctx = { clip, t: c.loop ? f / c.frames : c.frames > 1 ? f / (c.frames - 1) : 0, frame: f, frames: c.frames, loop: c.loop, p, style: style.id };
    try {
      const real = style.makeSurface(w, h, ctx);
      if (!(real instanceof Surface)) return null;
      def.render(standIn(real, note), ctx);
    } catch { /* the bar itself reports a render that fails */ }
  }
  return { calls: [...calls].sort(), where };
}

/** The bar for one style of a sprite. pass: { style (from engine/styles.js), first (report the sprite's own faults too), tag (starts each message about the drawing) }. */
function checkStyle(def, { soundIndex, validateMeta } = {}, pass) {
  const t0 = now();
  const T = THRESHOLDS;
  const issues = new Map();     // one entry per cause: key -> { level, msg, n }
  // Faults of the sprite itself (its controls, metadata, sounds) are found before anything is drawn: they are
  // reported in the first style's pass only (quiet in the others) and carry no style. From the first render on,
  // every message is about what this style draws and starts with its tag.
  let quiet = !pass.first, tag = '';
  const issue = (level, key, msg) => { if (quiet) return; const k = tag + key, i = issues.get(k); if (i) i.n++; else issues.set(k, { level, msg: tag + msg, n: 1 }); };
  const error = (msg, key = msg) => issue('error', key, msg);
  const warn = (msg, key = msg) => issue('warn', key, msg);
  const type = spriteType(def);
  const metrics = { type, typeFrom: def.meta && def.meta.type ? 'meta' : 'kind', metaChecked: false, renders: 0, looks: 0 };
  const params = def.params || {}, clips = def.clips || {};
  const clipNames = Object.keys(clips), keys = Object.keys(params);
  const [W, H] = def.size;
  const parts = partList(def);
  metrics.parts = parts.map((p) => p.name);
  const partOf = (k) => parts.find((p) => p.controls.includes(k)) ?? null;
  const effective = (k, p) => { try { return inEffect(def, k, p); } catch { return true; } };

  // ---- definition ---------------------------------------------------------------
  let paramsOk = true;
  for (const [k, d] of Object.entries(params)) {
    if (!d || !d.kind) { error(`param "${k}" is not built with range/choice/color/toggle`); paramsOk = false; continue; }
    if (!d.label) error(`param "${k}" has no label`);
    if (d.kind === 'color' && !(d.swatches?.length >= 3)) error(`color param "${k}" needs at least 3 swatches`);
    if (d.kind === 'color') for (const c of d.swatches ?? []) if (brightness(c) < 0.14) warn(`color param "${k}": swatch ${c} is almost as dark as the outline, so shapes in it merge into a black blob`);
    // a colour named after a thing that can be made of different stuff (a door: wood or metal) says nothing a
    // whole-bundle look can use (engine/materials.js, UNSAID_WORDS): the sprite has to say what it is of
    const unsaid = d.kind === 'color' ? unsaidMaterial(k, d, def) : null;
    if (unsaid) warn(`the "${d.label}" colour is named after a ${unsaid}, which can be made of different things, so a whole-bundle look cannot tell what it is and may turn it into anything: say what it is of on the control, for example color('${d.label}', ..., { material: 'wood' }) (one of ${MATERIAL_IDS.join(', ')})`, `unsaid:${k}`);
    if (d.kind === 'choice' && !(d.options?.length >= 2)) error(`choice "${k}" needs at least 2 options`);
  }
  const inParts = new Set(parts.flatMap((p) => p.params));
  const outside = keys.filter((k) => !inParts.has(k)).length;
  if (keys.length < T.minControls) warn(`only ${keys.length} parameters: give people more to play with`);
  if (outside > T.maxControls) warn(`${outside} controls outside parts: too many for a simple panel (aim for 8-15; part settings are not counted)`);
  for (const p of parts) if (p.params.length > T.maxPartControls) warn(`part "${p.name}" has ${p.params.length} controls: more than ${T.maxPartControls} is hard to use; drop some or split the part`);

  // ---- metadata (Contract 1) --------------------------------------------------------
  if (typeof validateMeta === 'function') {
    metrics.metaChecked = true;
    if (!def.meta) error('no meta: every asset needs metadata (docs/architecture.md, Contract 1)');
    else {
      const r = validateMeta(def.meta, 'sprite') || {};
      if (!r.ok) for (const e of r.errors ?? ['invalid']) error(`meta: ${e}`);
    }
  }

  // ---- sound cues: every entry, whatever its `when` ------------------------------------
  if (soundIndex) for (const [cname, list] of Object.entries(def.sounds ?? {})) for (const c of list) {
    const patch = lookup(soundIndex, c.sound);
    if (!patch) { error(`sound "${c.sound}" on clip ${cname} is not in sounds/`); continue; }
    if (patch.category === 'music') error(`"${c.sound}" on clip ${cname} is a music track; sprite animations take sound effects`);
    if (c.preset && !(patch.presets && patch.presets[c.preset])) error(`sound "${c.sound}" on clip ${cname}: no preset "${c.preset}" (it has: ${Object.keys(patch.presets ?? {}).join(', ') || 'none'})`);
    if (patch.loop && !clips[cname]?.loop) warn(`looping sound "${c.sound}" on one-shot clip ${cname}: it only plays while that clip is on screen`);
  }

  if (!paramsOk) return finish();

  // ---- rendering with a cache ---------------------------------------------------------------
  quiet = false; tag = pass.tag;
  const frameOpt = { style: pass.style.id }, toPixels = pass.style.toPixels;     // a style that is not a pixel grid is judged by its pixel picture
  const cache = new Map();
  const lookKey = (p) => keys.map((k) => fmt(p[k])).join('\u0001');
  const draw = (clip, f, p) => { metrics.renders++; try { const g = renderFrame(def, clip, f, p, frameOpt); return toPixels ? toPixels(g) : g; } catch (e) { return e instanceof Error ? e : new Error(String(e)); } };
  const render = (clip, f, p, pk = lookKey(p)) => {
    const key = `${clip}\u0002${f}\u0002${pk}`;
    let g = cache.get(key);
    if (g === undefined) { g = draw(clip, f, p); cache.set(key, g); }
    return g;
  };
  const fpsOf = (clip, p) => { try { return clipFps(def, clip, p); } catch { return NaN; } };

  // ---- looks: every frame of every clip ------------------------------------------------------------
  const dflt = defaultParams(def);
  const lo = {}, hi = {};
  for (const [k, d] of Object.entries(params)) if (d.kind === 'range') { lo[k] = d.min; hi[k] = d.max; }
  const allLow = cleanParams(def, lo), allHigh = cleanParams(def, hi);
  const bases = [['default', dflt], ['all-low', allLow], ['all-high', allHigh]];
  for (const [k, d] of Object.entries(params)) {
    if (d.kind === 'choice') for (const o of d.options) bases.push([`${k}=${fmt(o.value)}`, { ...dflt, [k]: o.value }]);
    if (d.kind === 'toggle') bases.push([`${k}=${!dflt[k]}`, { ...dflt, [k]: !dflt[k] }]);
  }
  const looks = [...bases];
  for (let i = 0; i < T.randomLooks; i++) looks.push([`random#${i}`, randomParams(def, 1000 + i * 7919)]);
  // a sprite's own ready-made versions pass the bar like any other settings
  if (def.versions !== undefined) for (const v of cleanVersions(def)) looks.push([`version:${v.name}`, v.params]);
  metrics.bases = bases.length;
  metrics.looks = looks.length;

  const isBase = new Set(bases.map(([n]) => n));
  const maxColoursAllowed = T.colours[type] ?? 32;
  let maxColours = 0;
  for (const [lname, p] of looks) {
    const pk = lookKey(p);
    for (const cname of clipNames) {
      const clip = clips[cname];
      const frames = [];
      for (let f = 0; f < clip.frames; f++) {
        const g = isBase.has(lname) ? render(cname, f, p, pk) : draw(cname, f, p);   // random looks are not reused
        if (g instanceof Error) { error(`${cname} frame ${f} / ${lname}: render threw ${g.message}`, `threw:${g.message}`); frames.length = 0; break; }
        frames.push(g);
      }
      if (!frames.length) continue;
      const colours = new Set();
      let groundLow = -1;
      frames.forEach((g, f) => {
        const b = g.bounds();
        if (!b) {
          if (type === 'effect' && f === clip.frames - 1 && f > 0) warn(`${cname}: last frame is empty (fine for an effect that ends by vanishing; check that it does not pop)`, `empty-last:${cname}`);
          else error(`${cname} frame ${f} / ${lname}: nothing drawn`, `empty:${cname}`);
          return;
        }
        if (!EDGE_FREE.has(type) && (b.x0 === 0 || b.y0 === 0 || b.x1 === W - 1 || b.y1 === H - 1)) error(`${cname} frame ${f} / ${lname}: drawing touches the frame edge (clipped), box ${b.x0},${b.y0}..${b.x1},${b.y1}`, 'edge');
        if (type === 'background' && (b.x0 !== 0 || b.x1 !== W - 1)) error(`${cname}: layer does not span the full width (frame ${f} / ${lname} covers x ${b.x0}..${b.x1} of 0..${W - 1})`, `bg-width:${cname}`);
        for (const v of g.data) if (v) colours.add(v);
        groundLow = Math.max(groundLow, b.y1);
        if (lname === 'default') {
          const again = draw(cname, f, p);
          if (again instanceof Error || diff(g, again, 0)) error(`${cname} frame ${f}: two renders differ — do not use Math.random(), Date or state kept between calls; use hash()/rng()`, `repeat:${cname}`);
        }
      });
      maxColours = Math.max(maxColours, colours.size);
      if (colours.size > maxColoursAllowed) warn(`${cname} / ${lname}: ${colours.size} colours in one clip (a ${type} should use at most ${maxColoursAllowed})`, 'colours');
      if (lname === 'default') {
        if (clip.frames === 1) {
          if (MUST_MOVE.has(type)) error(`clip "${cname}" has one frame: a ${type} must move in every clip`);
          else if (!MAY_STAND_STILL.has(type)) warn(`clip "${cname}" has one frame: a ${type} usually moves`);
        } else {
          const steps = [];
          for (let f = 1; f < frames.length; f++) steps.push(diff(frames[f - 1], frames[f]));
          const avg = steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length);
          if (avg === 0) (MAY_STAND_STILL.has(type) ? warn : error)(`${cname}: all frames are identical`);
          else if (steps.filter((s) => s === 0).length > clip.frames / 2) warn(`${cname}: more than half the frames repeat the previous one`);
          if (clip.loop && avg > 0) {
            const wrap = diff(frames[frames.length - 1], frames[0]);
            if (wrap > avg * T.loopSeamFactor + T.loopSeamSlack) warn(`${cname}: loop seam — last→first frame changes ${wrap}px vs ${avg.toFixed(0)}px between other frames`);
            if (wrap === 0) warn(`${cname}: last frame equals first frame (a loop should not repeat its first pose)`);
          }
        }
        if (def.grounded !== false && !NO_GROUND.has(type) && cname === clipNames[0] && groundLow >= 0) {
          if (Math.abs(groundLow - def.pivot[1]) > T.feetSlack) warn(`${cname}: lowest pixel is at y=${groundLow} but pivot y=${def.pivot[1]} — feet should rest on the pivot line (set grounded: false for flying things)`);
        }
      }
    }
  }
  metrics.maxColours = maxColours;

  // ---- smallest look fills the frame ------------------------------------------------------------
  if (!FILLS_FRAME.has(type) && clipNames.length) {
    const c0 = clipNames[0], shares = [];
    for (let f = 0; f < clips[c0].frames; f++) {
      const g = render(c0, f, allLow);
      const b = g instanceof Error ? null : g.bounds();
      if (!b) continue;
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
      shares.push(bw >= bh ? bw / W : bh / H);
    }
    shares.sort((a, b) => a - b);
    if (shares.length) {
      const fill = shares[Math.floor(shares.length / 2)];
      metrics.smallestFill = Math.round(fill * 1000) / 1000;
      const msg = `smallest look (all sliders low) fills ${Math.round(fill * 100)}% of the frame along its longer side in ${c0}`;
      if (fill < T.fillError) error(`${msg}; at least ${Math.round(T.fillError * 100)}% needed (raise the slider minimums or use a smaller frame)`);
      else if (fill < T.fillWarn) warn(`${msg}; aim for at least ${Math.round(T.fillWarn * 100)}%`);
    }
  }

  // ---- controls: each one changes the picture whenever it is in effect -----------------------------
  // N, the smallest change a person sees at 1x, scales with the size of the drawing.
  let opaque = 0;
  if (clipNames.length) { const g = render(clipNames[0], 0, dflt); if (!(g instanceof Error)) for (const v of g.data) if (v) opaque++; }
  const N = Math.min(T.strengthMax, Math.max(T.strengthMin, Math.round(opaque / T.strengthPer)));
  metrics.opaquePixels = opaque;
  metrics.strength = N;

  const sampled = {};
  for (const c of clipNames) {
    const n = clips[c].frames, s = new Set();
    for (let i = 0; i < T.sampleFrames; i++) s.add(Math.floor((i * n) / T.sampleFrames));
    sampled[c] = [...s];
  }
  // Biggest per-frame pixel change between looks a and b over the sampled frames, capped at
  // N + 1. A speed change counts as visible (a Speed slider changes no pixels). Frames that
  // fail to render are skipped; `compared` says whether any pair could be compared at all.
  const change = (a, b) => {
    const cap = N + 1, ka = lookKey(a), kb = lookKey(b);
    let best = 0, compared = false;
    for (const c of clipNames) {
      const fa = fpsOf(c, a), fb = fpsOf(c, b);
      if (Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) return { d: cap, compared: true };
      for (const f of sampled[c]) {
        const ga = render(c, f, a, ka), gb = render(c, f, b, kb);
        if (ga instanceof Error || gb instanceof Error) continue;
        compared = true;
        best = Math.max(best, diff(ga, gb, cap));
        if (best >= cap) return { d: cap, compared };
      }
    }
    return { d: best, compared };
  };

  const controls = {};
  for (const [k, d] of Object.entries(params)) {
    const res = { kind: d.kind, maxChange: 0, tested: 0, deadIn: [], aliveIn: [] };
    controls[k] = res;
    const settings = d.kind === 'range' ? (d.min === d.max ? [] : [d.min, d.max])
      : d.kind === 'toggle' ? [false, true]
        : d.kind === 'color' ? farthestPair(d.swatches ?? []) ?? []
          : d.options.map((o) => o.value);
    if (settings.length < 2) continue;
    const pairMax = new Map();                    // choice: "i|j" -> biggest change seen while in effect
    let leftBehind = null;
    for (const [bname, base] of bases) {
      if (d.kind === 'choice' && bname.startsWith(`${k}=`)) continue;   // the control itself is varied below
      const variants = settings.map((v) => ({ ...base, [k]: v }));
      if (!effective(k, base)) {
        if (!leftBehind && change(variants[0], variants[1]).d > 0) leftBehind = bname;
        continue;
      }
      let most = 0, compared = false;
      if (d.kind === 'choice') {
        for (let i = 0; i < variants.length; i++) for (let j = i + 1; j < variants.length; j++) {
          const pk = `${i}|${j}`;
          if ((pairMax.get(pk) ?? 0) > N) { most = N + 1; compared = true; continue; }
          const c = change(variants[i], variants[j]);
          if (!c.compared) continue;
          compared = true;
          pairMax.set(pk, Math.max(pairMax.get(pk) ?? 0, c.d));
          most = Math.max(most, c.d);
        }
      } else ({ d: most, compared } = change(variants[0], variants[1]));
      if (!compared) { res.untestable = true; continue; }   // nothing rendered here: the render error says why
      res.tested++;
      res.maxChange = Math.max(res.maxChange, most);
      (most === 0 ? res.deadIn : res.aliveIn).push(bname);
    }
    const part = partOf(k);
    const who = part ? `part "${part.name}": "${k}"` : `"${k}"`;
    if (!res.tested && !res.untestable) {
      // In effect at no tested setting (a `when` that needs two settings away from the default,
      // say). Build a setting where it applies, from its `when` and its part, and test there.
      const built = settingWhereItApplies(k);
      if (!built) { error(`${who} can never apply: no setting puts it in effect (check its \`when\` and its part)`); continue; }
      const variants = settings.map((v) => ({ ...built, [k]: v }));
      let most = 0, compared = false;
      for (let i = 0; i < variants.length; i++) for (let j = i + 1; j < variants.length; j++) {
        if (d.kind !== 'choice' && (i || j !== 1)) continue;
        const c = change(variants[i], variants[j]);
        if (!c.compared) continue;
        compared = true; most = Math.max(most, c.d);
        if (d.kind === 'choice') pairMax.set(`${i}|${j}`, c.d);
      }
      if (!compared) continue;
      res.tested++;
      res.builtAt = describe(built);
      res.maxChange = most;
      if (most === 0) { error(`${who} does nothing at the only setting where it applies (${res.builtAt}): make it change the picture there, or correct its \`when\``); continue; }
      res.aliveIn.push(res.builtAt);
    }
    if (!res.tested) continue;
    if (res.maxChange === 0) { error(`${who} never changes the picture (no pixel and no speed changes at any tested setting where it is in effect)`); continue; }
    if (res.maxChange <= N) (d.kind === 'range' ? error : warn)(`${who} changes at most ${res.maxChange} pixel${res.maxChange === 1 ? '' : 's'} in any frame; more than ${N} are needed to be seen at 1x`);
    if (d.kind === 'choice') for (let i = 0; i < settings.length; i++) for (let j = i + 1; j < settings.length; j++) {
      if (!pairMax.has(`${i}|${j}`)) continue;
      const c = pairMax.get(`${i}|${j}`), a = fmt(settings[i]), b = fmt(settings[j]);
      if (c === 0) error(`choice "${k}": options "${a}" and "${b}" look the same at every tested setting`);
      else if (c <= N) warn(`choice "${k}": options "${a}" and "${b}" differ by at most ${c} pixel${c === 1 ? '' : 's'}; more than ${N} are needed to tell them apart at 1x`);
    }
    if (res.deadIn.length) {
      const where = res.deadIn.map(settingName).join(', ');
      if (res.deadIn.every((bn) => bn === 'all-low' || bn === 'all-high')) warn(`${who} does nothing when ${where}; fine if that is a deliberate limit for the extreme look`);
      else error(`${who} does nothing when ${where} (${res.deadIn.length} of ${res.tested} tested settings); ${remedy(res)}`);
    }
    if (leftBehind) warn(`${who} still changes the picture when ${settingName(leftBehind)}, where it is declared not in effect`);
  }
  metrics.controls = controls;

  function remedy(res) {
    const dead = res.deadIn.filter((bn) => bn !== 'all-low' && bn !== 'all-high');
    const fix = `make it do something when ${dead.map(settingName).join(', ')}`;
    const hint = whenHint(res, params, dflt);
    return hint ? `${fix}, or declare \`${hint}\` (the values where it works)` : `${fix} (no single other control explains where it is dead)`;
  }

  // A setting where control `key` is in effect: the defaults, with each key of one of its
  // `when` alternatives at its first listed value (and, in turn, whatever that key needs),
  // and its part's selector at an option that is not `none`. Null when no alternative works.
  function settingWhereItApplies(key) {
    const enable = (k2, p, depth) => {
      if (depth > 8) return;
      const alt = whenAlternatives(params[k2]?.when)[0];
      if (alt) for (const [k3, vals] of Object.entries(alt)) { p[k3] = vals[0]; enable(k3, p, depth + 1); }
      const part = parts.find((x) => x.controls.includes(k2));
      if (part && part.none !== undefined) {
        const none = Array.isArray(part.none) ? part.none : [part.none];
        if (none.includes(p[part.selector])) {
          const sel = params[part.selector];
          p[part.selector] = sel.kind === 'toggle' ? true : sel.options.map((o) => o.value).find((v) => !none.includes(v));
          enable(part.selector, p, depth + 1);
        }
      }
    };
    const alts = whenAlternatives(params[key]?.when);
    for (const alt of alts.length ? alts : [{}]) {
      const p = { ...dflt };
      for (const [k2, vals] of Object.entries(alt)) { p[k2] = vals[0]; enable(k2, p, 1); }
      const part = parts.find((x) => x.controls.includes(key));
      if (part && part.none !== undefined) {
        const none = Array.isArray(part.none) ? part.none : [part.none];
        if (none.includes(p[part.selector])) { const sel = params[part.selector]; p[part.selector] = sel.kind === 'toggle' ? true : sel.options.map((o) => o.value).find((v) => !none.includes(v)); enable(part.selector, p, 1); }
      }
      if (effective(key, p)) return p;
    }
    return null;
  }
  function describe(p) {
    return keys.filter((x) => fmt(p[x]) !== fmt(dflt[x])).map((x) => `${x}=${fmt(p[x])}`).join(', ') || 'the defaults';
  }

  // ---- kind-specific rules (Contract 2) ---------------------------------------------------------
  const wrapLooks = [['default', dflt], ['all-low', allLow], ['all-high', allHigh]];
  if (type === 'tileset') {
    if (W !== H || !T.tileSizes.includes(W)) warn(`tiles are ${W}x${H}; tilesets use 16x16 or 32x32`);
    // Which tiles sit next to which is read from the clip names (docs/style-guide.md, section 6), by the same
    // classifier the map tool and the playground use. A block is 13 clips under one prefix (20 with the narrow
    // pieces, more with other versions of the fill); every pair of its pieces that can touch is a join.
    const topDown = def.meta?.view === 'top-down';
    const sets = classifyTiles(clips);
    const groups = [...sets.blocks, ...sets.floors.map((f) => ({ prefix: f.prefix, pieces: { fill: f.fill }, fills: f.fills }))];
    const fills = groups.flatMap((b) => b.fills), tops = sets.blocks.map((b) => b.pieces.top).filter(Boolean);
    // top-down: the pieces that are a wall's front face (the bottom row; and all of a wall one tile deep)
    const FRONT = new Set(['bottom', 'bottom-l', 'bottom-r', 'col-b', 'strip-l', 'strip-m', 'strip-r', 'single']);
    const joins = [];                               // { a, axis, b, test, fill }: a is left of b (axis x) or above it (axis y)
    const join = (a, axis, b, test, fill = null) => { if (a && b) joins.push({ a, axis, b, test, fill }); };
    for (const b of groups) {
      const versions = (piece) => (piece === 'fill' ? b.fills : b.pieces[piece] ? [b.pieces[piece]] : []);
      for (const [pa, axis, pb] of BLOCK_JOINS) for (const ca of versions(pa)) for (const cb of versions(pb)) {
        // Top-down: the bottom row of a wall is its front face, darker than the cap by design. Against the
        // rows above it only the outline has to line up; beside an inner corner the face simply ends.
        if (topDown && FRONT.has(pa) !== FRONT.has(pb)) { if (axis === 'y') join(ca, axis, cb, 'outline'); continue; }
        // an edge band may end or turn in an inner corner, so its depth is compared only where an edge runs straight on
        join(ca, axis, cb, 'seam', pa.startsWith('inner') || pb.startsWith('inner') ? null : b.pieces.fill ?? null);
      }
      // a top, left or right with no partner under its own prefix is tested against the first one there is
      if (b.pieces.top && !b.pieces.fill && fills.length) join(b.pieces.top, 'y', fills[0], 'seam');
      if (b.pieces.left && !b.pieces.top && tops.length) join(b.pieces.left, 'x', tops[0], 'seam');
      if (b.pieces.right && !b.pieces.top && tops.length) join(tops[0], 'x', b.pieces.right, 'seam');
    }
    const blockOf = (prefix) => sets.blocks.find((b) => b.prefix === prefix)?.pieces ?? {};
    for (const t of sets.thins) {
      const { l, m, r } = t.pieces, b = blockOf(t.prefix);
      join(l, 'x', m, 'seam'); join(m, 'x', m, 'seam'); join(m, 'x', r, 'seam'); join(l, 'x', r, 'seam');
      // a platform that runs into its own block: its surface is level with the block's top
      join(m, 'x', b.top, 'level'); join(b.top, 'x', m, 'level');
    }
    for (const sl of sets.slopes) {
      const b = blockOf(sl.prefix), f = b.fill ?? null;
      join(sl.up, 'x', b.top, 'seam', f); join(b.top, 'x', sl.down, 'seam', f);                 // the slope's upper end meets a top
      join(sl.up, 'y', b['inner-tl'], 'seam'); join(sl.down, 'y', b['inner-tr'], 'seam');      // its foot sits on a corner tile
      join(sl.up, 'x', b['inner-tl'], 'seam'); join(b['inner-tr'], 'x', sl.down, 'seam');      // two slopes corner to corner: the corner tile is beside the lower one
      join(sl.up, 'x', sl.down, 'seam', f); join(sl.down, 'x', sl.up, 'seam', f);              // a peak, a valley
    }
    // things that repeat up and down (ladders, pillars, posts): -cap over -mid over -foot. These names are
    // not fixed by the style guide, so a miss is a warning.
    // a liquid that lands (a waterfall): its foot under its body, under its top when it is two tiles tall, and beside itself
    for (const b of sets.blocks) if (b.liquid && b.pieces.foot) {
      for (const f of b.fills) join(f, 'y', b.pieces.foot, 'stack');
      join(b.pieces.top, 'y', b.pieces.foot, 'stack'); join(b.pieces.foot, 'x', b.pieces.foot, 'stack');
    }
    for (const st of sets.stacks) {
      const { cap, mid, foot } = st.pieces;
      join(cap, 'y', mid, 'stack'); join(mid, 'y', mid, 'stack'); join(mid, 'y', foot, 'stack');
    }
    if (!joins.length) warn('tileset has no fill tile (a clip named "...-fill") and no other pieces the checker knows by name, so nothing checks that it repeats');
    metrics.joins = joins.map(({ a, axis, b }) => `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}`);

    // Joins are tested at every tested setting (default, all-low, all-high, each choice, each on/off flipped)
    // and at some of the random looks, which also change the colours.
    const joinLooks = [...bases, ...looks.slice(bases.length, bases.length + T.joinRandomLooks)];
    const tested = new Set(bases.map(([name]) => name));
    for (const [lname, p] of joinLooks) {
      const pk = lookKey(p);
      for (const f of fills) for (let i = 0; i < clips[f].frames; i++) {
        const g = render(f, i, p, pk);
        if (!(g instanceof Error) && g.data.some((v) => (v >>> 24) !== 255)) error(`${f}: fill tile is not fully opaque (frame ${i} / ${lname})`, `opaque:${f}`);
      }
      // another version of the fill stands in for the fill anywhere, so its four edges are the fill's own
      for (const g of groups) for (const v of g.fills.slice(1)) {
        const F = render(g.fills[0], 0, p, pk), V = render(v, 0, p, pk);
        if (F instanceof Error || V instanceof Error) continue;
        for (const [axis, i, name] of [['x', 0, 'left column'], ['x', W - 1, 'right column'], ['y', 0, 'top row'], ['y', H - 1, 'bottom row']]) {
          const lf = line(F, axis, i), lv = line(V, axis, i);
          if (lf.some((c, k) => c !== lv[k])) error(`seam: ${v}: its ${name} is not the same as ${g.fills[0]}'s (${lname}); keep the marks of a fill version off the tile's edges, so it joins whatever the fill joins`, `fillversion:${v}`);
        }
      }
      for (const { a, axis, b, test, fill } of joins) {
        const n = Math.min(clips[a].frames, clips[b].frames);
        for (let i = 0; i < n; i++) {
          const A = render(a, i, p, pk), B = render(b, i, p, pk);
          if (A instanceof Error || B instanceof Error) continue;
          const ea = axis === 'x' ? 'right edge' : 'bottom edge', eb = axis === 'x' ? 'left edge' : 'top edge';
          const la = line(A, axis, (axis === 'x' ? A.w : A.h) - 1), lb = line(B, axis, 0);
          if (test === 'level') {
            const ya = firstDrawn(la), yb = firstDrawn(lb);
            if (ya !== yb) error(`seam: ${a} ${ea} → ${b} ${eb} is not level (${lname}, frame ${i}: one starts on row ${ya}, the other on row ${yb}); a platform that runs into a block has its surface on the block's top line`, `seam:${a}:${axis}:${b}`);
            continue;
          }
          const s = seamCheck(A, B, axis);
          const why = [];
          // exact: the two outlines meet pixel for pixel (an outline is pinned to the tile boundary at both ends of an edge)
          if (s.breaks > T.tileOutlineGaps) why.push(`the outlines differ by ${s.breaks} px; an outline must meet exactly at a tile boundary`);
          // exact: the edge band is as deep on both sides as it is anywhere inside
          if (test === 'seam' && fill && clips[fill].frames > i) {
            const F = render(fill, i, p, pk);
            const band = F instanceof Error ? { ok: true } : bandCheck(A, B, F, axis);
            if (!band.ok) why.push(`the edge band is ${band.step} px deeper on one side, measured from the ${axis === 'x' ? (band.end ? 'bottom' : 'top') : (band.end ? 'right' : 'left')} (inside these tiles it changes by at most ${band.allowed} px from one ${axis === 'x' ? 'column' : 'row'} to the next)`);
          }
          // the brightness step is judged in the colours the tiles were designed in, not with random swatches
          if (test !== 'outline' && tested.has(lname) && s.jump > s.maxJump) why.push(`brightness step ${s.jump.toFixed(2)} vs ${s.maxJump.toFixed(2)} allowed`);
          if (!why.length) continue;
          if (test === 'stack') warn(`${a} ${ea} → ${b} ${eb} does not line up, so the stack shows a break (${lname}, frame ${i}: ${why.join('; ')})`, `seam:${a}:${axis}:${b}`);
          else error(`seam: ${a} ${ea} → ${b} ${eb} does not join (${lname}, frame ${i}: ${why.join('; ')})`, `seam:${a}:${axis}:${b}`);
        }
      }
      // a platform's middle and a ladder's middle repeat with themselves: what repeats inside them must fit the tile
      for (const [c, axis] of [...sets.thins.map((t) => [t.pieces.m, 'x']), ...sets.stacks.map((st) => [st.pieces.mid, 'y'])]) {
        if (!c) continue;
        const g = render(c, 0, p, pk);
        const u = g instanceof Error ? null : unevenRepeat(g, axis, { pairs: axis === 'y' });
        if (u) warn(`${c}: a mark repeats every ${u.step} px along ${axis === 'x' ? `row ${u.at}` : `column ${u.at}`} (${u.count} of them; ${lname}), which does not fit ${axis === 'x' ? W : H} px a whole number of times, so the spacing breaks where two tiles join`, `rhythm:${c}`);
      }
      // a decal that stands on the block (or hangs under it) touches that side of its cell, over pixels of the block
      for (const d of sets.decals) {
        const g = render(d.clip, 0, p, pk), box = g instanceof Error ? null : g.bounds();
        if (!box) continue;
        if (d.place === 'on') {
          // drawn like something that stands on the block (or hangs under it), but placed over a fill tile
          const stands = box.y1 === H - 1 && box.y0 >= H / 2, hangs = box.y0 === 0 && box.y1 < H / 2;
          if (stands || hangs) warn(`${d.clip}: its place is 'on' (over a fill tile), but it is drawn ${stands ? 'standing on the bottom' : 'hanging from the top'} of its cell: should its place be '${stands ? 'above' : 'below'}'? (decoClips in engine/tiles.js)`, `decalplace:${d.clip}`);
          continue;
        }
        const above = d.place === 'above', gap = above ? H - 1 - box.y1 : box.y0;
        if (gap) { error(`${d.clip}: floats: its ${above ? 'lowest' : 'highest'} pixel is ${gap} px ${above ? 'above the bottom' : 'below the top'} of its cell, and it ${above ? 'stands on the tile below' : 'hangs from the tile above'} (${lname})`, `decal:${d.clip}`); continue; }
        const under = blockOf(d.prefix)[above ? 'top' : 'bottom'];
        const U = under ? render(under, 0, p, pk) : null;
        if (!U || U instanceof Error) continue;
        const bare = [];
        for (let x = 0; x < W; x++) if (g.get(x, above ? H - 1 : 0) && !U.get(x, above ? 0 : H - 1)) bare.push(x);
        if (bare.length) error(`${d.clip}: floats: ${under} is pulled in where it stands, so there is a gap under it in column ${bare[0]}${bare.length > 1 ? ` and ${bare.length - 1} more` : ''} (${lname}); stand it where the block's outline is on the tile boundary`, `decal:${d.clip}`);
      }
    }
    // a slope's line passes the corner tile under its foot: that tile's corner pixel must not be outline
    for (const sl of sets.slopes) {
      const b = blockOf(sl.prefix);
      for (const [slope, corner, x] of [[sl.up, b['inner-tl'], 0], [sl.down, b['inner-tr'], W - 1]]) {
        if (!slope || !corner) continue;
        const S = render(slope, 0, dflt), C = render(corner, 0, dflt);
        if (S instanceof Error || C instanceof Error) continue;
        const ink = S.get(W - 1 - x, 0);                              // the slope's line at its upper end
        if (ink && C.get(x, 0) === ink && S.get(W - 1 - x, 1) !== ink) error(`${corner}: its top ${x ? 'right' : 'left'} pixel is the outline colour; under ${slope}, or beside it, that leaves a nub on the slope's line (leave the pixel to the band under the outline: in the tile helper, give the top edge \`tuck\`)`, `nub:${corner}`);
      }
    }
    // Fill texture must survive every whole-bundle look with every swatch: a mark that is a tone of the fill
    // colour and turns into it leaves the fill plain. (Marks of another material, such as pebbles, are not judged.)
    {
      const hexOf = (v) => `#${[v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
      const hsl = (v) => rgbToHsl(v & 255, (v >>> 8) & 255, (v >>> 16) & 255);
      const sameFamily = (a, b) => { const A = hsl(a), B = hsl(b); if (A[1] < 0.15 || B[1] < 0.15) return A[1] < 0.15 && B[1] < 0.15; const d = Math.abs(A[0] - B[0]) % 360; return Math.min(d, 360 - d) <= T.textureHue; };
      const settings = [['the default colours', dflt]];
      for (const [k, d] of Object.entries(params)) if (d.kind === 'color') for (const sw of d.swatches ?? []) if (sw !== dflt[k]) settings.push([`${d.label} ${sw}`, { ...dflt, [k]: sw }]);
      let tested = 0;
      const lost = [];
      for (const f of fills) {
        const seen = new Set();
        for (const [sname, p] of settings) {
          const g = render(f, 0, p);
          if (g instanceof Error) continue;
          const count = new Map();
          for (const v of g.data) count.set(v, (count.get(v) ?? 0) + 1);
          const order = [...count].sort((x, y) => y[1] - x[1]), base = order[0][0];
          const marks = order.slice(1).filter(([v, n]) => n >= T.textureMinPixels && sameFamily(v, base)).map(([v]) => v);
          const sig = [base, ...marks].join(',');
          if (!marks.length || seen.has(sig)) continue;                // a swatch that does not change this fill adds nothing
          seen.add(sig); tested++;
          const from = Uint32Array.from([base, ...marks]);
          const gone = [];
          for (const look of THEME_PRESETS) {
            const to = applyColour(Uint32Array.from(from), look.theme.colour);
            const i = marks.findIndex((_, k) => to[k + 1] === to[0]);
            if (i >= 0) gone.push({ look: look.name, mark: marks[i] });
          }
          if (gone.length) { lost.push({ clip: f, setting: sname, looks: gone.map((x) => x.look) }); warn(`${f}: with ${sname} its texture colour ${hexOf(gone[0].mark)} turns into the fill colour ${hexOf(base)} under the "${gone[0].look}" look${gone.length > 1 ? ` and ${gone.length - 1} more` : ''}, leaving the fill plain; draw fill marks in the dark of the colour's ramp (textureTone in engine/tiles.js)`, `texture:${f}`); }
        }
      }
      metrics.fillTexture = { tested, lost };
    }
  }
  if (type === 'background') {
    for (const [lname, p] of wrapLooks) for (const c of clipNames) for (let i = 0; i < clips[c].frames; i++) {
      const g = render(c, i, p);
      if (g instanceof Error) continue;
      const s = seamCheck(g, g, 'x');
      if (!s.ok) error(`${c}: left and right edges do not continue into each other (${lname}, frame ${i}: ${s.breaks} gaps vs ${s.maxBreaks} allowed, brightness step ${s.jump.toFixed(2)} vs ${s.maxJump.toFixed(2)} allowed)`, `wrap:${c}`);
    }
    const far = clipNames[0];
    if (far) { const g = render(far, 0, dflt); if (!(g instanceof Error) && g.data.some((v) => (v >>> 24) !== 255)) warn(`${far}: the farthest layer has see-through pixels; a game needs a solid colour behind it`); }
  }

  // ---- inside the frame at the far ends, and under a look that varies shapes ----------------------------------
  // Two sets of settings the looks above do not reach, tested for the frame edge only (and for a render that fails).
  // The far ends: all sliders low, and all high, with each other value of each choice and each on/off control
  // flipped, one at a time (a held sign at its largest on the biggest body); and each option of each part with the
  // part's own sliders low, and high, on the default body. To keep this cheap, only what can matter is drawn again:
  //   - an option is drawn at the two ends only in the clips, and towards the sides (left, up, right, down), where
  //     that option alone sticks out: reaches further than the option of the same control that reaches least
  //     (eyes inside the body are never drawn again; a spear and a sword both are, against no weapon);
  //   - of such a clip, only the frames that reach furthest towards those sides, with that option alone and with
  //     all sliders at that end (both drawn above), so one or two frames a side;
  //   - a part with its sliders at an end: the frames that reach furthest each way with that option alone.
  // Shapes: a whole-bundle look can vary every control of every sprite from its seed (themedParams). Seeds 0 to
  // shapeSeeds - 1 are drawn: of each clip, first the frames that reach furthest each way at the default, all-low and
  // all-high settings; when one of them comes within shapeNear pixels of the frame edge, the rest of that clip too.
  // Both report under the same cause as every other frame-edge fault, so a sprite gets one such message, from the
  // first place it was seen; metrics.edgeEnds and metrics.shapes say what each of the two found.
  {
    const t1 = now();
    const ends = { looks: 0, renders: 0, touched: 0, first: null, ms: 0 }, shapes = { seeds: 0, renders: 0, touched: 0, first: null, ms: 0 };
    metrics.edgeEnds = ends; metrics.shapes = shapes;
    if (!EDGE_FREE.has(type) && clipNames.length) {
      const onEdge = (b) => b.x0 === 0 || b.y0 === 0 || b.x1 === W - 1 || b.y1 === H - 1;
      const box = (b) => `box ${b.x0},${b.y0}..${b.x1},${b.y1}`;
      const reach = new Map();
      // At a setting drawn before, per side (left, up, right, down): how far a clip reaches (smaller is further) and its first frame to get there.
      const reachOf = (cname, p) => {
        const key = `${cname}\u0002${lookKey(p)}`;
        let out = reach.get(key);
        if (out) return out;
        out = { most: [Infinity, Infinity, Infinity, Infinity], at: [-1, -1, -1, -1] };
        for (let f = 0; f < clips[cname].frames; f++) {
          const g = render(cname, f, p);
          const b = g instanceof Error ? null : g.bounds();
          if (b) [b.x0, b.y0, -b.x1, -b.y1].forEach((v, i) => { if (v < out.most[i]) { out.most[i] = v; out.at[i] = f; } });
        }
        reach.set(key, out);
        return out;
      };
      const SIDES = [0, 1, 2, 3];
      const extra = [], listed = new Set(bases.map(([, p]) => lookKey(p)));      // extra: [name, settings, [[clip, frames], ...]]
      const add = (name, p, plan) => { const k = lookKey(p); if (listed.has(k) || !plan.length) return; listed.add(k); extra.push([name, p, plan]); };
      const framesOf = (cname, sides, sources) => [...new Set(sources.flatMap((q) => sides.map((i) => reachOf(cname, q).at[i])))].filter((f) => f >= 0).sort((a, b) => a - b);
      for (const [k, d] of Object.entries(params)) {
        const values = d.kind === 'choice' ? d.options.map((o) => o.value) : d.kind === 'toggle' ? [false, true] : [];
        for (const v of values.filter((x) => x !== dflt[k])) {
          const alone = { ...dflt, [k]: v };
          // where this option sticks out: further than the option of this control that reaches least (the sprite without the thing)
          const least = (cname, i) => Math.max(...values.map((x) => reachOf(cname, { ...dflt, [k]: x }).most[i]));
          const further = clipNames.map((cname) => [cname, SIDES.filter((i) => reachOf(cname, alone).most[i] < least(cname, i))]).filter(([, sides]) => sides.length);
          for (const [ename, end] of [['all-low', allLow], ['all-high', allHigh]]) add(`${ename} + ${k}=${fmt(v)}`, { ...end, [k]: v }, further.map(([cname, sides]) => [cname, framesOf(cname, sides, [alone, end])]));
        }
      }
      for (const part of parts) {
        const own = part.controls.filter((k) => params[k].kind === 'range');
        if (!own.length) continue;
        const sel = params[part.selector], none = part.none === undefined ? [] : Array.isArray(part.none) ? part.none : [part.none];
        for (const v of (sel.kind === 'toggle' ? [true] : sel.options.map((o) => o.value)).filter((x) => !none.includes(x))) {
          const alone = { ...dflt, [part.selector]: v };
          for (const [word, side] of [['low', 'min'], ['high', 'max']]) {
            const p = { ...alone };
            for (const k of own) p[k] = params[k][side];
            add(`${part.selector}=${fmt(v)} + part "${part.name}" sliders ${word}`, p, clipNames.map((cname) => [cname, framesOf(cname, SIDES, [alone])]));
          }
        }
      }
      let drawn = metrics.renders;
      for (const [lname, p, plan] of extra) {
        ends.looks++;
        for (const [cname, frames] of plan) {
          for (const f of frames) {
            const g = draw(cname, f, p);
            if (g instanceof Error) { error(`${cname} frame ${f} / ${lname}: render threw ${g.message}`, `threw:${g.message}`); break; }
            const b = g.bounds();
            if (b && onEdge(b)) { ends.touched++; ends.first ??= { look: lname, clip: cname, frame: f }; error(`${cname} frame ${f} / ${lname}: drawing touches the frame edge (clipped), ${box(b)}`, 'edge'); }
          }
        }
      }
      ends.renders = metrics.renders - drawn;
      ends.ms = Math.round((now() - t1) * 10) / 10;

      const t2 = now();
      drawn = metrics.renders;
      const likely = clipNames.map((cname) => [cname, framesOf(cname, SIDES, [dflt, allLow, allHigh])]);
      for (let seed = 0; seed < T.shapeSeeds; seed++) {
        const p = themedParams(def, dflt, { seed, shapes: true });
        shapes.seeds++;
        for (const [cname, first] of likely) {
          // one frame: its smallest distance to the frame edge (0 = touching, reported), Infinity when nothing is drawn, null when it could not be drawn
          const one = (f) => {
            const g = draw(cname, f, p);
            if (g instanceof Error) { error(`${cname} frame ${f} / shapes seed ${seed}: render threw ${g.message}`, `threw:${g.message}`); return null; }
            const b = g.bounds();
            if (!b) return Infinity;
            if (onEdge(b)) {
              shapes.touched++;
              shapes.first ??= { seed, clip: cname, frame: f };
              const sets = keys.filter((k) => fmt(p[k]) !== fmt(dflt[k])).map((k) => ` --set ${k}=${fmt(p[k])}`).join('');
              error(`${cname} frame ${f} / shapes seed ${seed}: drawing touches the frame edge (clipped), ${box(b)}. A whole-bundle look that also varies shapes gives this sprite these settings (themedParams in engine/theme.js, seed ${seed}); to see it: node tools/render.mjs ${def.id} --clip ${cname}${sets}`, 'edge');
            }
            return Math.min(b.x0, b.y0, W - 1 - b.x1, H - 1 - b.y1);
          };
          let near = false, failed = false;
          for (const f of first) { const m = one(f); if (m === null) { failed = true; break; } if (m <= T.shapeNear) near = true; }
          if (near && !failed) for (let f = 0; f < clips[cname].frames; f++) if (!first.includes(f) && one(f) === null) break;
        }
      }
      shapes.renders = metrics.renders - drawn;
      shapes.ms = Math.round((now() - t2) * 10) / 10;
    }
  }

  // ---- survives every look ------------------------------------------------------------------------
  // A whole-bundle look (THEME_PRESETS in engine/theme.js) recolours a finished frame: every colour
  // becomes one other colour. Two colours that become the same colour stop being two shapes. Per clip,
  // over every frame at the default settings: count the edges (neighbouring pixels that differ), then,
  // for each look, the share of them that is left. Colours are mapped once per look, not per pixel.
  {
    const t1 = now();
    const seen = new Map(), colours = [];            // every colour drawn at the default settings -> its number
    const perClip = [];
    for (const cname of clipNames) {
      const pairs = new Map(), used = new Set();     // pairs: two colours' numbers -> how many edges lie between them
      let outline = 0, lastV = 0, lastN = -1;
      const number = (v) => {
        if (v === lastV) return lastN;
        let n = seen.get(v);
        if (n === undefined) { n = colours.length; seen.set(v, n); colours.push(v); }
        used.add(n);
        lastV = v; lastN = n;
        return n;
      };
      const edge = (a, b) => {
        const da = a >>> 24 !== 0, db = b >>> 24 !== 0;
        if (!da && !db) return;
        if (!da || !db) { outline++; number(da ? a : b); return; }
        const i = number(a), j = number(b), key = i < j ? i * 0x200000 + j : j * 0x200000 + i;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      };
      for (let f = 0; f < clips[cname].frames; f++) {
        const g = render(cname, f, dflt);
        if (g instanceof Error) continue;
        const { w, h, data } = g;
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
          const v = data[i];
          if (x + 1 < w && data[i + 1] !== v) edge(v, data[i + 1]);
          if (y + 1 < h && data[i + w] !== v) edge(v, data[i + w]);
        }
      }
      let inside = 0;
      for (const n of pairs.values()) inside += n;
      perClip.push({ cname, pairs, used, outline, inside, merged: [] });
    }
    const hexOf = (v) => `#${[v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    const from = Uint32Array.from(colours);
    let tested = 0, lowest = { share: 1, clip: null, look: null };
    for (const look of THEME_PRESETS) {
      const to = applyColour(Uint32Array.from(from), look.theme.colour);
      if (to.every((v, i) => v === from[i])) continue;             // this look changes no colour here ("Original")
      tested++;
      for (const c of perClip) {
        if (!c.inside) continue;                                    // one colour: nothing can merge
        let gone = 0, most = 0, pair = null;
        for (const [key, n] of c.pairs) {
          const i = Math.floor(key / 0x200000), j = key % 0x200000;
          if (to[i] !== to[j]) continue;
          gone += n;
          if (n > most) { most = n; pair = [i, j]; }
        }
        const share = (c.outline + c.inside - gone) / (c.outline + c.inside);
        if (share < lowest.share) lowest = { share, clip: c.cname, look: look.id };
        if (share < T.lookEdgesWarn) c.merged.push({ look, share, a: from[pair[0]], b: from[pair[1]], into: to[pair[0]], left: new Set([...c.used].map((i) => to[i])).size });
      }
    }
    // One message per cause (the same two colours merging under the same look), from the clip where it is worst.
    for (const c of perClip) c.merged.sort((a, b) => a.share - b.share);   // worst look first; ties stay in THEME_PRESETS order
    for (const c of perClip.filter((x) => x.merged.length).sort((x, y) => x.merged[0].share - y.merged[0].share)) {
      const [worst, ...rest] = c.merged;
      const pc = (m) => `${Math.round(m.share * 100)}%`;
      const { a, b } = worst;
      const also = rest.length ? ` Also under ${rest.map((m) => `${m.look.name} (${pc(m)})`).join(', ')}.` : '';
      warn(`${c.cname}: shapes merge under the "${worst.look.name}" look: ${pc(worst)} of the edges are left (outline and lines between colours; at least ${Math.round(T.lookEdgesWarn * 100)}% needed). ${hexOf(a)} and ${hexOf(b)} (brightness ${lum(a).toFixed(2)} and ${lum(b).toFixed(2)}) both turn into ${hexOf(worst.into)}, and ${c.used.size} colours become ${worst.left}.${also} Make neighbouring materials differ in lightness, not only in hue: one clearly lighter or darker than the other`,
        `looks:${worst.look.id}:${a}:${b}`);
    }
    metrics.themes = { tested, lowest: Math.round(lowest.share * 1000) / 1000, clip: lowest.clip, look: lowest.look, ms: Math.round((now() - t1) * 10) / 10 };
  }

  // ---- held under every look ------------------------------------------------------------------------
  // The check above uses the plain colour maths, which treats every colour alike: it says how much a sprite's own
  // tones depend on hue alone. This one measures what the site really draws: a look recolours a sprite knowing what
  // each colour is of (spriteMaterials: found by drawing the sprite once more per colour control), holds each colour
  // inside its material's limits and keeps clearly different tones apart (lookColours). A colour outside its limits
  // is an error: the sky went brown, skin stopped being skin. Two tones made nearly the same is a warning with the
  // pair named: in a crowded picture under a look of few tones the engine cannot always keep every pair apart.
  {
    const t1 = now();
    const held = { tested: 0, colours: 0, left: 0, merged: 0, materials: {}, ms: 0 };
    metrics.held = held;
    let table = null;
    try { table = spriteMaterials(def, dflt, { style: pass.style.id }); } catch { table = null; }
    if (table && table.colours.size) {
      for (const e of table.colours.values()) held.materials[e.material] = (held.materials[e.material] ?? 0) + e.n;
      held.colours = table.colours.size;
      const faults = lookFaults(table);
      held.tested = faults.tested; held.left = faults.left.length; held.merged = faults.merged.length;
      const label = (key) => (key && params[key] ? `the "${params[key].label}" colour` : 'a colour no control paints');
      const names = (list) => [...new Set(list.map((f) => f.look.name))];
      const also = (list, first) => { const rest = names(list).filter((n) => n !== first); return rest.length ? ` Also under ${rest.slice(0, 4).join(', ')}${rest.length > 4 ? ` and ${rest.length - 4} more` : ''}.` : ''; };
      const byColour = new Map();
      for (const f of faults.left) { const k = `${f.material}:${f.from}`; if (!byColour.has(k)) byColour.set(k, []); byColour.get(k).push(f); }
      for (const [k, list] of byColour) {
        const f = list[0];
        error(`under the "${f.look.name}" look ${label(f.control)} ${f.from}, which is ${materialById(f.material).name.toLowerCase()}, became ${f.to}: ${f.why}.${also(list, f.look.name)} A look must leave a thing what it is (the limits are in engine/materials.js; lookColours in engine/theme.js holds them)`, `held:${k}`);
      }
      const byPair = new Map();
      for (const f of faults.merged) { const k = `${f.a}:${f.b}`; if (!byPair.has(k)) byPair.set(k, []); byPair.get(k).push(f); }
      const worstFirst = [...byPair].sort((x, y) => y[1].length - x[1].length || y[1][0].before - x[1][0].before);
      for (const [k, list] of worstFirst.slice(0, 3)) {
        const f = list[0];
        warn(`two tones that are clearly different become nearly the same under the "${f.look.name}" look: ${f.a} and ${f.b} both come out close to ${f.into} (${f.before.toFixed(2)} apart as made, ${f.after.toFixed(2)} after; under ${T.toneSame} they read as one).${also(list, f.look.name)} Make them differ in lightness as well as in hue, or, where a colour carries a meaning, say so on its control (material: 'signal' or 'warning') so every look keeps it`, `tones:${k}`);
      }
      if (worstFirst.length > 3) warn(`${worstFirst.length - 3} more pairs of tones become nearly the same under some look (metrics.held.merged counts every case)`, 'tones:more');
    }
    held.ms = Math.round((now() - t1) * 10) / 10;
  }

  return finish();

  function finish() {
    const errors = [], warnings = [];
    for (const { level, msg, n } of issues.values()) (level === 'error' ? errors : warnings).push(n > 1 ? `${msg} (and ${n - 1} more)` : msg);
    metrics.ms = Math.round((now() - t0) * 10) / 10;
    return { errors, warnings, metrics };
  }
}
