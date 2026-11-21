// The fixed registry of framework functions a studio definition may NAME (docs/architecture.md, Contract 14 rule 2;
// docs/studio.md 2.3; studio item F1). A definition is data and never holds code, but a figure's colours are often
// worked out from the settings: a pair of trousers a tone darker than the tunic, a belt kept clear of the cloth it lies
// on, a hat in the trim colour only when it is the wide hat. A definition says that by naming one of these rules, the
// same way it names a rig; the rule is framework code, so nothing in the definition ever runs.
//
// A paint expression (a colour rule of a data sprite: the library-body path that painted a figure's fields from the settings is gone, R1) is one of:
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
//                                                  reads them: { key: [values] }, or a list of such, any one enough; a
//                                                  value may be a threshold on a slider, { atLeast: 0.35 }), else `else`
//     textureTone  { of, against? }                engine/tiles.js textureTone(of, against): the dark tone marks in a
//                                                  colour are painted in, kept apart from `against` (default of) under
//                                                  every whole-bundle look (B15b)
//     textureLight { of, against?, from? }         engine/tiles.js textureLight(of, against, from): the light tone, the
//                                                  same way, searched from `from` (0.1..1) of the way to the light (B15b)
//     faceTone  { of, face: top|wall, tone: light|base|dark|deep }   engine/solids.js faceRamps(of): the faces of a
//                                                  solid lit from above, a pale colour's top in itself (migration M3)
//     stoneShade { of, with, start? }              engine/paving.js stoneShade(of, with, start): the first mix of a
//                                                  paving towards its joint colour, from `start` (default 0.4) in steps
//                                                  of 0.15, that every whole-bundle look keeps apart from it (M5)
//     lifted    { of, against, beside }          engine/look-tones.js lifted: of lifted until it keeps 3 to 1 against
//                                                  `against` under every look and 0.1 from `beside` (name plate, M9)
//     grey      { of }                           engine/look-tones.js grey (engine/ui.js desaturate) (M9)
//     ifLight   { of, above, then, else }        `then` when brightness(of) > above, else `else` (M9)
//     shadeTo   { of, under?, drop, floor }      engine/bulkhead.js shadeTo(of, max(floor, min(brightness(of),
//                                                  brightness(under ?? of) - drop))): a machine's recess metal, a
//                                                  door frame kept darker than its door (P5)
//     raisedGround { of }                       engine/ground.js raisedGround: a path or bank lifted towards its light (T2)
//     pavingTone   { of }                       engine/paving.js pavingTone: light paving, lifted towards light and white (T2)
//     brighterBy   { of, than, by, else }       of when brightness(of) - brightness(than) >= by, else `else` (T2)
// The checks (names, arguments, ranges, references, depth) are catalog/studio-schema.js's; this module evaluates and
// never throws: anything it cannot read paints FALLBACK.
//
// Pure: no DOM, no Node, no clock, no randomness. Runs unchanged in the browser and in Node.

import { tone, ramp, mix, pick } from './color.js';
import { bandTone } from './tones.js';
import { apart } from '../rigs/humanoid-figure.js';
import { textureTone, textureLight } from './tiles.js';   // build item B15b: the tilesets' texture tones (tiles.js does not import this module)
import { faceRamps } from './solids.js';   // migration batch M3: faceTone, the faces of a solid lit from above (solids.js does not import this module)
import { stoneShade } from './paving.js';   // migration batch M5: stoneShade, a paving's darker stones and joints (paving.js does not import this module)
import { hueTone, hued, HUE_TONES } from './hue-tones.js';   // migration batch M4: hueTone and hued, the tool and material icons' tones in their own hue
import { lifted, grey, ifLight } from './look-tones.js';   // migration batch M9: lifted, grey and ifLight, what the interface code sprites read from a colour's numbers (look-tones.js does not import this module at load)
import { shadeTo } from './bulkhead.js';   // migration batch P5: shadeTo, the station machines' recess metal and the blast door's frame (bulkhead.js does not import this module)
import { brightness as shadeBrightness } from './color.js';   // migration batch P5: the brightness shadeTo's target is worked out from
import { raisedGround } from './ground.js';   // build item T2: raisedGround, the meadow's path and the shore's bank (ground.js does not import this module)
import { pavingTone } from './paving.js';     // build item T2: pavingTone, the village's paving (paving.js does not import this module)

const HEX = /^#[0-9a-fA-F]{6}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arg = (kind, more = {}) => Object.freeze({ kind, ...more });

/** The colour a paint expression gives when it cannot be read (it never can, once catalog/studio-schema.js has passed it). No arguments: a '#rrggbb'. */
export const FALLBACK = '#ff00ff';

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
  textureTone: Object.freeze({ about: 'The dark tone marks in a colour (joints, grain, blades) are painted in, kept apart from against (default the colour) under every whole-bundle look: engine/tiles.js textureTone.', args: Object.freeze({ of: arg('colour'), against: arg('colour', { optional: true }) }) }),
  textureLight: Object.freeze({ about: 'The light tone marks in a colour (glints, wet streaks, tips) are painted in, kept apart from against (default the colour) under every whole-bundle look, searched from `from` of the way to its light: engine/tiles.js textureLight.', args: Object.freeze({ of: arg('colour'), against: arg('colour', { optional: true }), from: arg('number', { min: 0.1, max: 1, optional: true }) }) }),
  faceTone: Object.freeze({ about: 'One tone of the top or the wall of a solid lit from above: the top a step lighter than the colour, or, for a colour too pale for that, the top in the colour and the wall a step darker: engine/solids.js faceRamps.', args: Object.freeze({ of: arg('colour'), face: arg('word', { values: Object.freeze(['top', 'wall']) }), tone: arg('word', { values: Object.freeze(['light', 'base', 'dark', 'deep']) }) }) }),   // migration batch M3
  // migration batch M5 (review round 2): the argument is `start`, not `from`, because a paint holding `from` reads as a binding
  hueTone: Object.freeze({ about: 'One tone of a colour that keeps its hue, changing only its lightness (light, base, mid, dark, deep), so a brown never turns red in its shadow: engine/hue-tones.js hueTone.', args: Object.freeze({ of: arg('colour'), tone: arg('word', { values: HUE_TONES }) }) }),   // migration batch M4
  hued: Object.freeze({ about: 'A colour moved lighter or darker in its own hue by the least that parts it by gap points of lightness (0 to 100) from each colour it lies next to: engine/hue-tones.js hued.', args: Object.freeze({ of: arg('colour'), against: arg('colours', { most: 4 }), gap: arg('number', { min: 0, max: 100, optional: true }) }) }),   // migration batch M4
  stoneShade: Object.freeze({ about: 'A stone a shade darker than its paving, or a joint: the first mix of the colour towards with (its joint colour), from start (default 0.4) in steps of 0.15, that every whole-bundle look keeps apart from the colour; with itself when none is: engine/paving.js stoneShade.', args: Object.freeze({ of: arg('colour'), with: arg('colour'), start: arg('number', { min: 0.1, max: 1, optional: true }) }) }),
  lifted: Object.freeze({ about: 'A colour lifted (lighter, same hue) in steps of 0.15 until it keeps 3 to 1 contrast against `against` under every whole-bundle look and sits 0.1 in brightness from `beside`; else the first that keeps 3 to 1: tests/fixtures/code-sprites/ui-name-plate.js litBand (engine/look-tones.js lifted).', args: Object.freeze({ of: arg('colour'), against: arg('colour'), beside: arg('colour') }) }),   // migration batch M9
  grey: Object.freeze({ about: 'The grey of the same brightness as a colour (a disabled button or card): engine/ui.js desaturate (engine/look-tones.js grey).', args: Object.freeze({ of: arg('colour') }) }),   // migration batch M9
  ifLight: Object.freeze({ about: 'One of two colours by how light a third is: then when its brightness is above `above` (0 to 1), else `else` (a pale face shaded darker, not lighter): engine/look-tones.js ifLight.', args: Object.freeze({ of: arg('colour'), above: arg('number', { min: 0, max: 1 }), then: arg('colour'), else: arg('colour') }) }),   // migration batch M9
  shadeTo: Object.freeze({ about: 'A colour taken darker or lighter along its own ramp until its brightness is max(floor, min(its own, that of under (default itself) less drop)): a machine\'s recess metal, a frame kept darker than its door: engine/bulkhead.js shadeTo.', args: Object.freeze({ of: arg('colour'), under: arg('colour', { optional: true }), drop: arg('number', { min: 0, max: 1 }), floor: arg('number', { min: 0, max: 1 }) }) }),   // migration batch P5
  sunkTone: Object.freeze({ about: 'A colour sunk below another (a floor\'s inset plating, a wall\'s cap): mixed towards its own ramp\'s dark until its brightness is max(floor, min(its own, that of under less drop)), never past that dark: sprites/tiles-station-floor.js and tiles-hive.js tones.', args: Object.freeze({ of: arg('colour'), under: arg('colour'), drop: arg('number', { min: 0, max: 1 }), floor: arg('number', { min: 0, max: 1 }) }) }),   // build item T3
  shadeApart: Object.freeze({ about: 'A colour taken along its own ramp until its brightness is max(floor, min(its own less self, that of under less drop)): a wall\'s cap kept darker than itself and than the face under it: engine/bulkhead.js shadeTo, as sprites/tiles-station-walls.js worked its target out.', args: Object.freeze({ of: arg('colour'), under: arg('colour'), drop: arg('number', { min: 0, max: 1 }), self: arg('number', { min: 0, max: 1 }), floor: arg('number', { min: 0, max: 1 }) }) }),   // build item T3
  raisedGround: Object.freeze({ about: 'A ground colour (a path, a sandy bank) lifted towards its ramp\'s light so it stands apart by value from the ground round it: a full step for a mid colour, less for a light one, none for a very light one: engine/ground.js raisedGround.', args: Object.freeze({ of: arg('colour') }) }),   // build item T2
  pavingTone: Object.freeze({ about: 'The colour light paving is laid in: the colour itself when light enough, else lifted towards its ramp\'s light and past that towards white: engine/paving.js pavingTone.', args: Object.freeze({ of: arg('colour') }) }),   // build item T2
  brighterBy: Object.freeze({ about: 'One colour when its brightness is at least `by` (0 to 1) above that of `than`, else `else`: the castle\'s highlight on a stone, none on a stone as pale as cream (sprites/tiles-castle.js).', args: Object.freeze({ of: arg('colour'), than: arg('colour'), by: arg('number', { min: 0, max: 1 }), else: arg('colour') }) }),   // build item T2
});

/**
 * The words of a threshold, an entry of a `when` list that names a slider (Contract 3; build item B15b): atLeast (>=),
 * above (>), atMost (<=), below (<); `{ "wear": [{ "atLeast": 0.35 }] }` holds while wear >= 0.35. No arguments.
 */
export const WHEN_BOUNDS = Object.freeze(['atLeast', 'above', 'atMost', 'below']);

/**
 * True when a setting's value matches one entry of a `when` list (Contract 3), the one rule every reader of a `when`
 * shares (engine/resolve.js whenHolds, whenMatches here): a plain entry is the value itself (colours without regard to
 * case); a threshold { atLeast?, above?, atMost?, below? } holds for a number that meets every bound it gives (none
 * given, a bound that is not a number, an unknown word or a value that is not a number: false). Arguments: entry, value.
 */
export function whenValueHolds(entry, value) {
  if (!isObj(entry)) return same(entry, value);
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  let bounds = 0;
  for (const k of Object.keys(entry)) {
    const b = entry[k];
    if (!WHEN_BOUNDS.includes(k) || typeof b !== 'number' || !Number.isFinite(b)) return false;
    bounds++;
    if (k === 'atLeast' ? !(value >= b) : k === 'above' ? !(value > b) : k === 'atMost' ? !(value <= b) : !(value < b)) return false;
  }
  return bounds > 0;
}

/**
 * True when settings match a `when` as a control's `when` reads them: { key: [entries] } (every key at one of its
 * entries: a value, or a threshold on a slider, whenValueHolds) or a list of such (any one enough); colours compare
 * without regard to case; no `when` is always true. Arguments: when, values (the settings: { key: value }).
 */
export function whenMatches(when, values = {}) {
  if (when === undefined || when === null) return true;
  const one = (alt) => isObj(alt) && Object.entries(alt).every(([k, list]) => (Array.isArray(list) ? list : [list]).some((v) => whenValueHolds(v, values?.[k])));
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
    case 'textureTone': { const c = of(); return textureTone(c, e.against === undefined ? c : evaluate(e.against, v, depth + 1)); }
    case 'textureLight': { const c = of(); return textureLight(c, e.against === undefined ? c : evaluate(e.against, v, depth + 1), n(e.from, 1)); }
    case 'faceTone': {   // migration batch M3: engine/solids.js faceRamps; the top has no deep tone, so deep there is its dark
      const R = faceRamps(of()), t = ['light', 'base', 'dark', 'deep'].includes(e.tone) ? e.tone : 'base';
      return e.face === 'top' ? R.top[t === 'deep' ? 'dark' : t] : R.wall[t];
    }
    case 'hueTone': return hueTone(of(), HUE_TONES.includes(e.tone) ? e.tone : 'base');   // migration batch M4
    case 'hued': return Array.isArray(e.against) && e.against.length ? hued(of(), e.against.map((x) => evaluate(x, v, depth + 1)), n(e.gap, 20)) : FALLBACK;   // migration batch M4
    case 'stoneShade': return stoneShade(of(), evaluate(e.with, v, depth + 1), n(e.start, 0.4));   // migration batch M5
    case 'lifted': return lifted(of(), evaluate(e.against, v, depth + 1), evaluate(e.beside, v, depth + 1));   // migration batch M9
    case 'grey': return grey(of());   // migration batch M9
    case 'ifLight': return evaluate(ifLight(of(), n(e.above, 0.5), e.then, e.else), v, depth + 1);   // migration batch M9
    case 'shadeTo': {   // migration batch P5: engine/bulkhead.js shadeTo, the target worked out as the station sprites worked it out
      const c = of(), under = e.under === undefined ? c : evaluate(e.under, v, depth + 1);
      return shadeTo(c, Math.max(n(e.floor, 0), Math.min(shadeBrightness(c), shadeBrightness(under) - n(e.drop, 0))));
    }
    case 'sunkTone': {   // build item T3: the station floor's plating and the hive wall's cap, as sprites/tiles-station-floor.js and tiles-hive.js worked them out
      const c = of(), dark = ramp(c).dark, b = shadeBrightness(c);
      const want = Math.max(n(e.floor, 0), Math.min(b, shadeBrightness(evaluate(e.under, v, depth + 1)) - n(e.drop, 0)));
      return mix(c, dark, Math.min(1, Math.max(0, (b - want) / Math.max(0.01, b - shadeBrightness(dark)))));
    }
    case 'shadeApart': {   // build item T3: the station wall's cap, as sprites/tiles-station-walls.js worked it out
      const c = of();
      return shadeTo(c, Math.max(n(e.floor, 0), Math.min(shadeBrightness(c) - n(e.self, 0), shadeBrightness(evaluate(e.under, v, depth + 1)) - n(e.drop, 0))));
    }
    case 'raisedGround': return raisedGround(of());   // build item T2
    case 'pavingTone': return pavingTone(of());   // build item T2
    case 'brighterBy': {   // build item T2: sprites/tiles-castle.js, brightness(stone.light) - brightness(stone) >= 0.1 ? stone.light : (no highlight)
      const c = of();
      return shadeBrightness(c) - shadeBrightness(evaluate(e.than, v, depth + 1)) >= n(e.by, 0.1) ? c : evaluate(e.else, v, depth + 1);
    }
    case 'choose': return evaluate(whenMatches(isObj(e.when) || Array.isArray(e.when) ? e.when : { '': [] }, v) ? e.then : e.else, v, depth + 1);
    default: return FALLBACK;
  }
}
