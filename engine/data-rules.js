// The fixed registry of framework functions a studio definition may NAME (docs/architecture.md, Contract 14 rule 2;
// docs/studio.md 2.3; studio item F1). A definition is data and never holds code, but a figure's colours are often
// worked out from the settings: a pair of trousers a tone darker than the tunic, a belt kept clear of the cloth it lies
// on, a hat in the trim colour only when it is the wide hat. A definition says that by naming one of these rules, the
// same way it names a rig; the rule is framework code, so nothing in the definition ever runs.
//
// A paint expression (a value of `body.paint`, field "part.field" of the figure: { "look.bottom": ... }) is one of:
//   "#rrggbb"                      that colour
//   "<key>"                        the current value of a colour slot of the sprite (its colour control)
//   { "rule": "<name>", ... }      a rule of COLOUR_RULES with its arguments (each argument is described there):
//     tone      { of, by }                         engine/color.js tone(of, by): lighter (by > 0) or darker
//     mix       { of, with, amount }               engine/color.js mix(of, with, amount): 0 is of, 1 is with
//     standOut  { against, from: [c] }             engine/color.js pick(against, ...from): the one that stands out most
//     apart     { of, from: [c | [c, least]], least? }   rigs/humanoid-figure.js apart(): kept clear, by lightness, of
//                                                  what it lies next to (the Rogue's trim on his tunic)
//     bandTone  { of, under: [c], least? }         engine/tones.js bandTone(): the tone a thin band is painted in on cloth
//     ramp      { of, tone: light|base|dark|deep } one tone of engine/color.js ramp(of)
//     choose    { when, then, else }               `then` while the settings match `when` (as a control's `when`
//                                                  reads them: { key: [values] }, or a list of such, any one enough), else `else`
// The checks (names, arguments, ranges, references, depth) are catalog/studio-schema.js's; this module evaluates and
// never throws: anything it cannot read paints FALLBACK.
//
// Pure: no DOM, no Node, no clock, no randomness. Runs unchanged in the browser and in Node.

import { tone, ramp, mix, pick } from './color.js';
import { bandTone } from './tones.js';
import { apart } from '../rigs/humanoid-figure.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arg = (kind, more = {}) => Object.freeze({ kind, ...more });

/** The colour a paint expression gives when it cannot be read (it never can, once catalog/studio-schema.js has passed it). No arguments: a '#rrggbb'. */
export const FALLBACK = '#ff00ff';

/** The blocks of a side-view figure that rigs/humanoid-figure.js reads with defaults when they are absent (body, motion, look, hair): a control's `sets` may bring one in; any other part it sets (or paint paints) must be in the stored figure. No arguments: a frozen list. */
export const FIGURE_BLOCKS = Object.freeze(['body', 'motion', 'look', 'hair']);

/** How deep paint expressions may nest inside each other (a rule's argument is an expression). No arguments: a number. */
export const PAINT_DEPTH = 6;

/**
 * The colour rules a definition may name, by name: { about (one line, for people and generated/api.json), args: { name:
 * { kind, optional?, min?, max?, values?, most? } } }. Argument kinds: colour (a paint expression), colours (a list of at
 * most `most` paint expressions; for apart each may be [expression, least]), number (min..max), word (one of values),
 * when (a control's `when`). Frozen data: the functions stay in this module. No arguments.
 */
export const COLOUR_RULES = Object.freeze({
  tone: Object.freeze({ about: 'A lighter (by above 0) or darker (by below 0) tone of a colour: engine/color.js tone.', args: Object.freeze({ of: arg('colour'), by: arg('number', { min: -3, max: 3 }) }) }),
  mix: Object.freeze({ about: 'A blend of two colours, amount 0 (all of) to 1 (all with): engine/color.js mix.', args: Object.freeze({ of: arg('colour'), with: arg('colour'), amount: arg('number', { min: 0, max: 1 }) }) }),
  standOut: Object.freeze({ about: 'Whichever of a few colours stands out most, by lightness, against another (eyes, markings): engine/color.js pick.', args: Object.freeze({ against: arg('colour'), from: arg('colours', { most: 4 }) }) }),
  apart: Object.freeze({ about: 'A colour kept clear, by how light it is, of the colours it lies next to: rigs/humanoid-figure.js apart.', args: Object.freeze({ of: arg('colour'), from: arg('colours', { most: 4, pairs: true }), least: arg('number', { min: 0, max: 1, optional: true }) }) }),
  bandTone: Object.freeze({ about: 'The tone of a colour that a thin band (a belt, a strap) is painted in so it stands clear of the cloth under it: engine/tones.js bandTone.', args: Object.freeze({ of: arg('colour'), under: arg('colours', { most: 4 }), least: arg('number', { min: 0, max: 1, optional: true }) }) }),
  ramp: Object.freeze({ about: 'One tone of the three-tone ramp of a colour (light, base, dark, deep): engine/color.js ramp.', args: Object.freeze({ of: arg('colour'), tone: arg('word', { values: Object.freeze(['light', 'base', 'dark', 'deep']) }) }) }),
  choose: Object.freeze({ about: 'One of two colours by the settings: then while they match when (as a control\'s when reads them), else otherwise.', args: Object.freeze({ when: arg('when'), then: arg('colour'), else: arg('colour') }) }),
});

/**
 * True when settings match a `when` as a control's `when` reads them: { key: [values] } (every key at one of its values)
 * or a list of such (any one enough); colours compare without regard to case; no `when` is always true.
 * Arguments: when, values (the settings: { key: value }).
 */
export function whenMatches(when, values = {}) {
  if (when === undefined || when === null) return true;
  const one = (alt) => isObj(alt) && Object.entries(alt).every(([k, list]) => (Array.isArray(list) ? list : [list]).some((v) => same(v, values?.[k])));
  return Array.isArray(when) ? when.some(one) : one(when);
}
const same = (a, b) => (typeof a === 'string' && typeof b === 'string' && HEX.test(a) && HEX.test(b) ? a.toLowerCase() === b.toLowerCase() : Object.is(a, b) || (a === 0 && b === 0));

/**
 * The colour a paint expression gives at these settings, as '#rrggbb' (lowercase): a colour, a colour slot's value, or a
 * rule of COLOUR_RULES worked out by the framework function it names. Never throws; FALLBACK for anything it cannot read.
 * Arguments: expr (the expression), values (the settings: { key: value }, colour slots included).
 */
export function paintColour(expr, values = {}) {
  try {
    const c = evaluate(expr, values ?? {}, 0);
    return typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

function evaluate(e, v, depth) {
  if (depth > PAINT_DEPTH) return FALLBACK;
  if (typeof e === 'string') {
    if (HEX.test(e)) return e;
    const c = Object.hasOwn(v, e) ? v[e] : undefined;
    return typeof c === 'string' && HEX.test(c) ? c : FALLBACK;
  }
  if (!isObj(e) || typeof e.rule !== 'string' || !Object.hasOwn(COLOUR_RULES, e.rule)) return FALLBACK;
  const of = () => evaluate(e.of, v, depth + 1);
  const n = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  switch (e.rule) {
    case 'tone': return tone(of(), n(e.by, 0));
    case 'mix': return mix(of(), evaluate(e.with, v, depth + 1), Math.min(1, Math.max(0, n(e.amount, 0.5))));
    case 'standOut': {
      if (!Array.isArray(e.from) || !e.from.length) return FALLBACK;
      return pick(evaluate(e.against, v, depth + 1), ...e.from.map((x) => evaluate(x, v, depth + 1)));
    }
    case 'apart': {
      if (!Array.isArray(e.from) || !e.from.length) return FALLBACK;
      const from = e.from.map((x) => (Array.isArray(x) ? [evaluate(x[0], v, depth + 1), n(x[1], 0.15)] : evaluate(x, v, depth + 1)));
      return apart(of(), from, n(e.least, 0.15));
    }
    case 'bandTone': {
      if (!Array.isArray(e.under) || !e.under.length) return FALLBACK;
      return bandTone(of(), e.under.map((x) => evaluate(x, v, depth + 1)), n(e.least, 0.12));
    }
    case 'ramp': {
      const t = ['light', 'base', 'dark', 'deep'].includes(e.tone) ? e.tone : 'base';
      return ramp(of())[t];
    }
    case 'choose': return evaluate(whenMatches(isObj(e.when) || Array.isArray(e.when) ? e.when : { '': [] }, v) ? e.then : e.else, v, depth + 1);
    default: return FALLBACK;
  }
}

// The colours a frozen paint (a data sprite's definition is frozen) gives, kept per settings: figureFor runs on every
// frame and every socket query, and a paint near the size cap costs milliseconds to work out (review F1, issue 3). A
// paint that can still change is worked out every time.
const PAINTED = new WeakMap(), FROZEN_PAINT = new WeakSet();
const PAINTED_KEPT = 64;
function paintedColours(paint, values) {
  const work = () => Object.entries(paint).map(([path, expr]) => [path, paintColour(expr, values)]);
  if (!FROZEN_PAINT.has(paint)) { if (!deepFrozen(paint)) return work(); FROZEN_PAINT.add(paint); }
  let key;
  try { key = JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]])); } catch { return work(); }
  let per = PAINTED.get(paint);
  if (!per) PAINTED.set(paint, per = new Map());
  let got = per.get(key);
  if (!got) {
    got = work();
    if (per.size >= PAINTED_KEPT) per.delete(per.keys().next().value);
    per.set(key, got);
  }
  return got;
}
const deepFrozen = (v) => v === null || typeof v !== 'object' || (Object.isFrozen(v) && Object.values(v).every(deepFrozen));

/**
 * Returns a copy of a figure with its colours painted at these settings: each "part.field" of `paint` set to its
 * expression's colour (paintColour), only on parts the figure has (painting never adds a part). The figure given is not
 * changed; a frozen paint's colours are worked out once per settings (each call still gets its own copy).
 * Arguments: figure (plain data, as rigs/humanoid-figure.js reads it), paint ({ "part.field": expression }), values (the settings).
 */
export function paintFigure(figure, paint, values = {}) {
  const out = JSON.parse(JSON.stringify(figure ?? {}));
  if (!isObj(paint)) return out;
  for (const [path, colour] of paintedColours(paint, isObj(values) ? values : {})) {
    const dot = path.indexOf('.'), part = path.slice(0, dot), field = path.slice(dot + 1);
    if (dot < 1 || !field || !isObj(out[part]) || !Object.hasOwn(out, part)) continue;
    out[part][field] = colour;
  }
  return out;
}
