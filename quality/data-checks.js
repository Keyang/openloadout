// The quality bar's data checks for a version 2 data sprite (docs/data-sprites.md section 5, 'Quality bar ... new data
// checks (unused control, stamp out of frame, slot never painted, cost)'; build item B9). quality/sprite.js checkSprite
// runs them on every data sprite (so the build, tools/check.mjs, the quality cache, app/api-worker.js loadout.check and
// the studio's advice all get them); dataChecks(sprite) is also callable alone. They look at what the sprite asks the
// renderer to paint, the draw list of each frame (engine/data-sprite.js dataFrameList), over its clips and frames at a
// set of settings, tried in this order until the work cap (MAX_LISTS) is reached:
//   1 the defaults, at every frame;
//   2 each control alone at each of its other values, in three rounds (build item B15b): first a choice at every
//     option, a toggle flipped and a colour at any value a `when` names; then each range at both ends and at any value
//     a `when` of the definition names for it (a threshold's bounds: { atLeast: 0.35 } names 0.35); then each range
//     at each turning point of a map that reads it (a binding { from, map } whose output stops rising or falling there)
//     (so what a toggle paints is seen before the frame lists run out on a tileset of many tiles);
//   3 every toggle on, then every toggle off, together;
//   4 the controls' values together: every combination of the choices, the toggles, the sliders (each at its default,
//     its ends and those turning points) and the values `when`s name, when there are at most MAX_COMBOS of them (then
//     the search is complete, unless a slider is handed on raw: a binding { from } with no map gives a generator its
//     value, whose threshold may sit anywhere inside the range); otherwise every combination of the discrete values
//     alone (the choices, the toggles and the values `when`s name, the sliders at their defaults) when those are at
//     most MAX_COMBOS, then every pair with a slider in it (the rest at their defaults), up to MAX_COMBOS pairs; or,
//     when the discrete values do not fit either, every pair of all of them. The standard Speed slider is left out of
//     the combinations unless the definition reads it: it sets the fps only, never what a frame draws. (A slider bound
//     with { from, pick } never reaches here: the validator refuses it, a slider is bound with a map.)
// Every frame is looked at when the settings times the frames fit in MAX_LISTS; otherwise each clip's first, middle and
// last frames; and no setting past the cap is looked at at all. So one sprite costs at most MAX_LISTS frame lists.
// Colours are moved only where a `when` names one (they change no geometry). What each check covers:
//   stamp out of frame  a stamp drawn wholly outside the frame, so nothing of it shows: an error naming the clip, frame,
//                       setting and box. (A stamp partly out is checkSprite's "touches the frame edge".)
//   slot never painted  a palette slot nothing drawn paints at any setting tried. A slot counts as painted when a drawn
//                       primitive names it anywhere it takes a paint (its paint, a stamp's key, a band's stops, an
//                       outline, a shape or area inside it, what a generator or a piece drew), and also when it is read
//                       by something painted: a derived slot (palette `derive`, followed through chains), a colour rule
//                       in a paint or a generator's argument, or one a generator made from the slots its call names
//                       (each worked out to a slot of its own, engine/resolve.js ruleSlot), or a piece's colour map (a slot given as a tone or a rule becomes a slot of the
//                       piece's own, engine/resolve.js bareRef). An error when the search was complete (every
//                       combination, sliders included, every frame, and every colour a rule or piece made traced to
//                       the slots it reads); a warning ("not seen painted") when it was not, since a setting not tried, or a piece
//                       inside a piece, may paint it. The validator (catalog/sprite-schema.js) already refuses a slot nothing names.
//   cost                the most work one frame asks of the renderer (engine/draw-list.js listCost) as a share of the
//                       frame's budget (workBudget), and the most primitives: as metrics, and a warning above half the
//                       budget (a game draws many sprites a frame).
//   unused control      not here: the validator refuses a control nothing names, and checkSprite errors on a control
//                       that changes no pixel ("never changes the picture", "does nothing when ..."); both run on every
//                       data sprite (tests/unit/assets-data-checks.test.mjs proves both).
// A sprite that is not a version 2 data sprite (a version 1 studio sprite, or an object a test builds with defineSprite) is not looked at.
// Plain ES module: runs unchanged in the browser and in Node.
import { dataFrameList } from '../engine/data-sprite.js';
import { listCost, workBudget, STAMP_ANCHORS } from '../engine/draw-list.js';

/** The most frame lists the data checks build for one sprite, in all: past it no further setting is looked at. */
export const MAX_LISTS = 600;
/** The most settings the checks try with several controls moved together (step 4 above). */
export const MAX_COMBOS = 96;
/** The share of a frame's work budget above which the cost check warns. */
export const COST_WARN = 0.5;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const say = (p) => Object.entries(p).map(([k, v]) => `${k}: ${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`).join(', ');
const bare = (s) => (typeof s === 'string' ? s.split('.')[0] : null);
const SAFE_KEY = (k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
// the fields of a drawn primitive that never hold a paint (names, text, stamp rows, placement words)
const NOT_PAINT = new Set(['kind', 'id', 'text', 'rows', 'variants', 'variant', 'anchor', 'mirror', 'on', 'node', 'name', 'font', 'gen', 'use', 'clip', 'align', 'blend', 'group', 'dir', 'edges', 'when', 'part', 'parts']);
const WALK_DEPTH = 8, WALK_VALUES = 20000;

/** Every string under v (skipping keys in skip, at most WALK_DEPTH deep and budget.n values), passed to each. */
function strings(v, each, skip, budget, depth = 0) {
  if (depth > WALK_DEPTH || --budget.n < 0) return;
  if (typeof v === 'string') { each(v); return; }
  if (Array.isArray(v)) { for (const x of v) strings(x, each, skip, budget, depth + 1); return; }
  if (!isObj(v)) return;
  for (const k of Object.keys(v)) if (SAFE_KEY(k) && !skip.has(k)) strings(v[k], each, skip, budget, depth + 1);
}

/** The slots of `slots` a colour rule (or any paint) reads: every slot name or tone in it, outside its `when`s and its rule names. */
function readsOf(rule, slots) {
  const out = new Set();
  strings(rule, (s) => { const b = bare(s); if (slots.has(b)) out.add(b); }, new Set(['rule', 'when', 'v']), { n: 2000 });
  return out;
}

/** Every object under v (the definition) passed to each(object, key it sits under), skipping keys in skip. */
function objects(v, each, skip, budget, key = null, depth = 0) {
  if (depth > 24 || --budget.n < 0) return;
  if (Array.isArray(v)) { for (const x of v) objects(x, each, skip, budget, key, depth + 1); return; }
  if (!isObj(v)) return;
  each(v, key);
  for (const k of Object.keys(v)) if (SAFE_KEY(k) && !skip.has(k)) objects(v[k], each, skip, budget, k, depth + 1);
}

/**
 * What the definition says about how its slots are painted besides by name: { slots, derives (slot -> slots it reads),
 * rules (the slots each colour rule written outside the palette reads, one Set per rule), genCalls (the slots each
 * generator call names in its arguments, one Set per call), pieceMaps (piece slot -> slots a piece's colour map gives it),
 * whenValues (control -> values the definition's `when`s name for it), turns (control -> the inputs where a map that
 * reads it turns: its output stops rising or falling there), read (the controls a binding or a `when` names), bareRead
 * (the controls a binding hands on raw, with no map or pick) }.
 */
function readDefinition(def) {
  const palette = Array.isArray(def?.palette) ? def.palette : [];
  const slots = new Set(palette.map((s) => s?.id).filter((x) => typeof x === 'string'));
  const derives = new Map();
  for (const s of palette) if (isObj(s) && typeof s.id === 'string' && s.derive !== undefined) derives.set(s.id, readsOf(s.derive, slots));
  const rules = [], genCalls = [], pieceMaps = new Map(), whenValues = new Map(), turns = new Map(), read = new Set(), bareRead = new Set();
  const addTurns = (k, map) => {
    if (!turns.has(k)) turns.set(k, []);
    const out = turns.get(k), num = (v) => typeof v === 'number' && Number.isFinite(v);
    for (let i = 1; i < map.length - 1 && out.length < 16; i++) {
      const [a, b, c] = [map[i - 1], map[i], map[i + 1]];
      // a map's points are numbers in and out (engine/resolve.js bindingValue refuses any other map)
      if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(c) || ![a[1], b[0], b[1], c[1]].every(num)) continue;
      // a peak or a dip (or the edge of a flat run): the output goes the other way, or stops, on one side of it
      const turn = (b[1] - a[1]) * (c[1] - b[1]) <= 0 && !(a[1] === b[1] && b[1] === c[1]);
      if (turn && !out.includes(b[0])) out.push(b[0]);
    }
  };
  const addWhen = (w) => {
    for (const alt of Array.isArray(w) ? w : [w]) {
      if (!isObj(alt)) continue;
      for (const [k, raw] of Object.entries(alt)) {
        if (!SAFE_KEY(k)) continue;
        if (!whenValues.has(k)) whenValues.set(k, []);
        // a threshold (build item B15b) is tried at its bounds: { atLeast: 0.35 } names 0.35
        const xs = (Array.isArray(raw) ? raw : [raw]).flatMap((x) => (isObj(x) ? Object.values(x).filter((b) => typeof b === 'number' && Number.isFinite(b)) : [x]));
        for (const x of xs) if (whenValues.get(k).length < 64 && !whenValues.get(k).includes(x)) whenValues.get(k).push(x);
      }
    }
  };
  const rest = isObj(def) ? Object.fromEntries(Object.entries(def).filter(([k]) => k !== 'palette' && k !== 'meta' && SAFE_KEY(k))) : {};
  objects(rest, (o) => {
    if (typeof o.rule === 'string') {
      const reads = readsOf(o, slots);
      if (reads.size) rules.push(reads);
    }
    if (typeof o.gen === 'string') genCalls.push(readsOf(o, slots));
    if (typeof o.use === 'string' && isObj(o.paint)) {
      for (const [k, v] of Object.entries(o.paint)) {
        if (!SAFE_KEY(k)) continue;
        if (!pieceMaps.has(k)) pieceMaps.set(k, new Set());
        for (const r of readsOf(v, slots)) pieceMaps.get(k).add(r);
      }
    }
    if (typeof o.from === 'string' && SAFE_KEY(o.from)) {
      read.add(o.from);
      if (Array.isArray(o.map)) addTurns(o.from, o.map);
      // the raw value handed on (no map, no pick): a generator's threshold may sit anywhere inside a slider's range
      if (!Object.hasOwn(o, 'map') && !Object.hasOwn(o, 'pick')) bareRead.add(o.from);
    }
    if (o.when !== undefined) addWhen(o.when);
  }, new Set(), { n: 200000 });
  for (const k of whenValues.keys()) read.add(k);
  for (const s of palette) if (isObj(s?.derive)) objects(s.derive, (o) => { if (o.when !== undefined) addWhen(o.when); }, new Set(), { n: 2000 });
  return { slots, derives, rules, genCalls, pieceMaps, whenValues, turns, read, bareRead };
}

/**
 * The settings the checks draw at: { list: [{ name, p }] (the defaults first, in the order of the header), complete
 * (every combination of the controls' values, sliders included, is in it, and no slider is read raw), discrete (every
 * combination of the discrete values, the choices, toggles and the values `when`s name, is in it), discreteEnd (the
 * settings list is that long once they are all in it), raw (a slider is handed on raw, with no map) }.
 */
function settingsOf(sprite, { whenValues, turns, read, bareRead }) {
  const params = isObj(sprite.params) ? sprite.params : {};
  const base = Object.fromEntries(Object.entries(params).map(([k, d]) => [k, d.def]));
  const list = [{ name: 'the defaults', p: base }];
  const seen = new Set([JSON.stringify(base)]);
  const add = (name, change) => {
    const p = { ...base, ...change }, key = JSON.stringify(p);
    if (seen.has(key)) return false;
    seen.add(key); list.push({ name, p });
    return true;
  };
  const named = (k, d) => (whenValues.get(k) ?? []).filter((v) => (d.kind === 'range' ? typeof v === 'number' : d.kind === 'color' ? typeof v === 'string' : false));
  // the standard Speed slider sets the fps only (engine/resolve.js), never what a frame draws, unless the definition reads it
  const speedKeys = new Set((Array.isArray(sprite.definition?.controls) ? sprite.definition.controls : []).filter((c) => c?.standard === 'speed').map(() => 'speed'));
  const inRange = (d) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= d.min && v <= d.max;
  // the values of each control the combinations are made of (a slider: its default, its ends, the values `when`s name
  // and its maps' turning points). Each is tried alone first, in three rounds (build item B15b): the choices, toggles
  // and colours; then each slider's ends and the values `when`s name for it; then the sliders' turning points. A
  // tileset of 48 tiles has frame lists for a dozen settings, and what a toggle paints must not wait behind them.
  const dims = [], rounds = [[], [], []];
  for (const [k, d] of Object.entries(params)) {
    if (!isObj(d)) continue;
    let values;
    if (d.kind === 'choice') values = (d.options ?? []).map((o) => (isObj(o) ? o.value : o));
    else if (d.kind === 'toggle') values = [d.def, !d.def];
    else if (d.kind === 'range') values = [d.def, d.min, d.max, ...named(k, d).filter(inRange(d)), ...(turns.get(k) ?? []).filter(inRange(d))];
    else values = [d.def, ...named(k, d)];
    values = [...new Set(values)];
    const first = d.kind === 'range' ? new Set([d.min, d.max, ...named(k, d)]) : null;
    for (const v of values) if (v !== d.def) rounds[!first ? 0 : first.has(v) ? 1 : 2].push([k, v]);
    if (d.kind === 'range' && speedKeys.has(k) && !read.has(k)) continue;
    if (values.length > 1) dims.push([k, values]);
  }
  for (const round of rounds) for (const [k, v] of round) add(say({ [k]: v }), { [k]: v });
  const toggles = Object.entries(params).filter(([, d]) => d?.kind === 'toggle').map(([k]) => k);
  if (toggles.length > 1) {
    add('every toggle on', Object.fromEntries(toggles.map((k) => [k, true])));
    add('every toggle off', Object.fromEntries(toggles.map((k) => [k, false])));
  }
  const productOf = (ds) => { let n = 1; for (const [, vs] of ds) { n *= vs.length; if (n > MAX_COMBOS) break; } return n; };
  const every = (ds) => {
    let combos = [{}];
    for (const [k, vs] of ds) combos = combos.flatMap((c) => vs.map((v) => ({ ...c, [k]: v })));
    for (const c of combos) add(say(c), c);
  };
  // a slider handed on raw (a bare { from }) may matter at any value inside its range, so no search of it is complete
  const raw = Object.entries(params).some(([k, d]) => d?.kind === 'range' && bareRead.has(k));
  if (productOf(dims) <= MAX_COMBOS) {
    every(dims);
    return { list, complete: !raw, raw, discrete: true, discreteEnd: list.length };
  }
  // too many: first every combination of the discrete values (the choices, the toggles and the values `when`s name,
  // a slider's included, the other sliders at their defaults) when those fit, then pairs with a slider in them
  const discrete = dims.map(([k, vs]) => [k, params[k].kind === 'range' ? [...new Set([params[k].def, ...named(k, params[k])])] : vs]).filter(([, vs]) => vs.length > 1);
  const fits = productOf(discrete) <= MAX_COMBOS;
  if (fits) every(discrete);
  const discreteEnd = list.length;
  const slider = (i) => params[dims[i][0]].kind === 'range';
  let n = 0;
  pairs: for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) {
    if (fits && !slider(i) && !slider(j)) continue;      // in the discrete combinations already
    for (const a of dims[i][1]) for (const b of dims[j][1]) {
      if (n >= MAX_COMBOS) break pairs;
      if (add(say({ [dims[i][0]]: a, [dims[j][0]]: b }), { [dims[i][0]]: a, [dims[j][0]]: b })) n++;
    }
  }
  return { list, complete: false, raw, discrete: fits, discreteEnd };
}

/** The frames to look at: { all: [[clip, frames]], sampled: [[clip, frames]] } (sampled: each clip's first, middle and last). */
function framesOf(sprite) {
  const clips = Object.entries(sprite.clips ?? {}).filter(([, c]) => Number.isInteger(c?.frames) && c.frames > 0);
  return {
    all: clips.map(([name, c]) => [name, [...Array(Math.min(c.frames, MAX_LISTS)).keys()]]),
    sampled: clips.map(([name, c]) => [name, [...new Set([0, Math.floor((c.frames - 1) / 2), c.frames - 1])]]),
  };
}
const count = (fs) => fs.reduce((n, [, f]) => n + f.length, 0);

/** The box a stamp primitive covers in frame pixels [x0, y0, x1, y1] (end exclusive), as engine/draw-list.js places it, or null. */
function stampBox(p) {
  let rows = p.rows;
  if (typeof p.variant === 'string' && isObj(p.variants) && Array.isArray(p.variants[p.variant])) rows = p.variants[p.variant];
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(p.at)) return null;
  const w = Math.max(...rows.map((r) => (typeof r === 'string' ? r.length : 0))), h = rows.length;
  const anchor = STAMP_ANCHORS[p.anchor ?? 'tl'];
  if (!anchor) return null;
  let [ax, ay] = anchor;
  if (p.mirror === true || p.mirror === 'x') ax = 1 - ax;
  const x0 = Math.round(p.at[0] - ax * w), y0 = Math.round(p.at[1] - ay * h);
  return [x0, y0, x0 + w, y0 + h];
}

/**
 * The data checks of one sprite: { errors, warnings, metrics }. metrics: { dataWork (the most work one frame asks, as a
 * share of its budget, to 5 places), dataWorkUnits (that work), dataPrimitives (the most primitives in one frame),
 * dataLists (frame lists looked at, at most MAX_LISTS), dataSettings (settings looked at), dataComplete (every
 * combination of the choices, the toggles, the values `when`s name and the sliders, each slider at its default, its ends
 * and the turning points of its maps and none read raw, was looked at, at every frame), dataDiscrete (every combination
 * of the choices, the toggles and the values `when`s name was looked at, at the frames looked at) }; all empty for a
 * sprite that is not a version 2
 * data sprite. Never throws: a frame that cannot be listed is left to checkSprite, which draws it.
 * Arguments: sprite (what engine/data-sprite.js dataSprite returned).
 */
export function dataChecks(sprite) {
  const errors = [], warnings = [];
  if (!sprite || typeof sprite !== 'object' || !isObj(sprite.clips)) return { errors, warnings, metrics: {} };
  const first = Object.keys(sprite.clips)[0];
  try { dataFrameList(sprite, first, 0, {}); } catch { return { errors, warnings, metrics: {} }; }      // not a version 2 data sprite
  const [w, h] = sprite.size, budget = workBudget(w, h);
  const D = readDefinition(sprite.definition);
  const S = settingsOf(sprite, D);
  const F = framesOf(sprite);
  const total = count(F.all), rest = Math.max(0, MAX_LISTS - total);
  const everyFrame = (S.list.length - 1) * total <= rest;
  const painted = new Set(), outside = new Map(), followed = new Set();
  let lists = 0, tried = 0, work = 0, prims = 0, worst = null, stopped = false, untraced = false;
  const see = (id, palette) => {
    if (D.slots.has(id)) painted.add(id);
    const e = isObj(palette) && Object.hasOwn(palette, id) ? palette[id] : null;
    if (!isObj(e) || (typeof e.rule !== 'string' && typeof e.piece !== 'string')) return;
    const key = `${id}\0${e.rule ?? ''}\0${e.piece ?? ''}\0${e.slot ?? ''}`;
    if (followed.has(key)) return;      // traced already (what it reads does not depend on the settings)
    followed.add(key);
    if (typeof e.rule === 'string') {
      // a slot a colour rule was worked out to (engine/resolve.js ruleSlot names it <a slot it reads>-r<n>): every rule
      // written that reads that slot paints what it reads
      const stem = id.replace(/-r\d+$/, '');
      const mine = D.rules.filter((reads) => [...reads].some((r) => r === stem || r.slice(0, 32) === stem));
      if (D.slots.has(stem)) painted.add(stem);
      // no rule written reads it: a generator made the rule from its arguments, so it paints the slots that call names
      const from = mine.length ? mine : D.genCalls.filter((names) => names.has(stem));
      if (!from.length) untraced = true;
      for (const reads of from) for (const r of reads) painted.add(r);
    }
    if (typeof e.piece === 'string' && typeof e.slot === 'string') {
      // a slot a piece's colour map made (engine/resolve.js bareRef: a tone or a rule given for the piece's slot)
      const map = D.pieceMaps.get(e.slot);
      if (!map?.size) untraced = true;      // a piece inside a piece: its map is in the piece file, not the definition
      for (const r of map ?? []) painted.add(r);
    }
  };
  for (const s of S.list) {
    const fs = (s === S.list[0] && total <= MAX_LISTS) || everyFrame ? F.all : F.sampled;
    if (lists + count(fs) > MAX_LISTS) { stopped = true; break; }
    tried++;
    for (const [clip, frames] of fs) {
      for (const f of frames) {
        let got;
        try { got = dataFrameList(sprite, clip, f, s.p); } catch { continue; }
        lists++;
        const list = Array.isArray(got.list) ? got.list : [];
        prims = Math.max(prims, list.length);
        let c = 0;
        try { c = listCost(list, w, h, { palette: got.palette }); } catch { c = 0; }
        if (c > work) { work = c; worst = `${clip} frame ${f} (${s.name})`; }
        const walk = { n: WALK_VALUES };
        for (const p of list) {
          if (!isObj(p)) continue;
          strings(p, (x) => see(bare(x), got.palette), NOT_PAINT, walk);
          if (p.kind === 'stamp') {
            const b = stampBox(p);
            if (b && (b[2] <= 0 || b[3] <= 0 || b[0] >= w || b[1] >= h)) {
              const what = `${b[2] - b[0]}x${b[3] - b[1]} stamp${typeof p.rows?.[0] === 'string' ? ` (first row "${p.rows[0]}")` : ''}`;
              if (!outside.has(what)) outside.set(what, { box: b, where: `${clip} frame ${f} (${s.name})` });
            }
          }
        }
      }
    }
  }
  // a painted derived slot paints what it reads, through chains
  const todo = [...painted];
  while (todo.length) {
    const id = todo.pop();
    for (const r of D.derives.get(id) ?? []) if (!painted.has(r)) { painted.add(r); todo.push(r); }
  }
  for (const [what, o] of outside) {
    errors.push(`a ${what} is drawn wholly outside the ${w}x${h} frame at ${o.where}, box ${o.box[0]},${o.box[1]}..${o.box[2]},${o.box[3]}: nothing of it shows. Move it into the frame (its at, or its node), or take it out`);
  }
  const complete = S.complete && everyFrame && !stopped && !untraced;
  const discrete = S.discrete && tried >= S.discreteEnd;
  for (const id of D.slots) {
    if (painted.has(id)) continue;
    if (complete) errors.push(`slot "${id}" is never painted: nothing drawn paints it (by name, through a derived slot, a colour rule or a piece) at every combination of the choices, toggles and sliders (each slider at its default, its ends and the turning points of its maps). Paint something with it, or take it out of the palette`);
    else warnings.push(`slot "${id}" is not seen painted at the ${tried} settings tried (the defaults, each control moved alone, ${S.complete || (S.raw && S.discreteEnd === S.list.length) ? 'every combination of the choices, toggles and sliders' : S.discrete ? 'every combination of the choices and toggles, pairs with the sliders' : 'pairs of the choices, toggles and sliders'}${S.raw ? ', a slider handed on raw (a binding with no map) tried at its default and ends only' : ''}${everyFrame && !stopped ? '' : ', some frames only'}${untraced ? '; a colour a piece or a rule made could not be traced to its slots' : ''}): if no setting paints it, paint something with it or take it out of the palette`);
  }
  const share = budget > 0 ? work / budget : 0;
  if (share > COST_WARN) warnings.push(`heavy: its costliest frame, ${worst}, asks ${Math.round(share * 100)}% of the frame's work budget (engine/draw-list.js workBudget); a game draws many sprites a frame, so use fewer or smaller shapes, fewer glows, or a stamp`);
  return { errors, warnings, metrics: { dataWork: Math.round(share * 1e5) / 1e5, dataWorkUnits: work, dataPrimitives: prims, dataLists: lists, dataSettings: tried, dataComplete: complete, dataDiscrete: discrete } };
}
