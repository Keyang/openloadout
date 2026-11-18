// The three bundle palettes (docs/style-guide.md section 3) and the swatch lists
// for colour controls built from them. Pure data and functions: runs in Node and
// in the browser.
//
//   import { PALETTE, swatches } from '../engine/palettes.js';
//   const P = PALETTE.thornwood;                    // or PALETTE['kit-platformer-fantasy'], PALETTE.platformer
//   params: {
//     metal: color('Metal', P.steel, swatches('thornwood', 'metal')),          // steel, gold, stone, ... (4 to 8)
//     body:  color('Body', P.goblin, swatches('kit-platformer-fantasy', 'body', { lead: 'goblin' })),
//   }
//   g.limb(x0, y0, x1, y1, 3, ramp(P.wood));         // a fixed colour is a palette colour by name
//
// Palette keys (lower case, like every colour name: PALETTE.Thornwood is undefined):
// `thornwood` (kit-platformer-fantasy), `hearthvale` (kit-rpg-fantasy),
// `derelict` (kit-roguelite-scifi). The functions accept any case for bundle, material and lead. The bundle ids and the short names `platformer`,
// `rpg`, `roguelite` / `scifi` also work everywhere a palette is named, but are not
// listed by Object.keys(PALETTE).
//
// swatches(bundle, material, { lead }):
//   material  one of materials(bundle): the colour keys of style guide section 10
//             (skin hair outfit trim metal wood stone body accent glow core edge sky land haze)
//             plus a few more per bundle (grass leaf ground water face frame gem ...), or any
//             palette colour name ('crimson', 'acid'), which then comes first.
//   lead      a palette colour name or a '#rrggbb' to put first (the control's default).
//   Returns a new array of 4 to 8 distinct colours: palette colours first, then colours
//   from the engine lists (SKIN, HAIR, CLOTH, METAL). Never the outline colour, never a
//   background-only colour (derelict `void`), never darker than brightness 0.18.

import { brightness } from './color.js';
import { SKIN, HAIR, CLOTH, METAL } from './sprite.js';

// ---- the palettes, exactly as the style guide writes them ---------------------

const thornwood = {
  ink: '#231b33', grass: '#6aa83e', leaf: '#3f8a4f', moss: '#a4c44a', soil: '#7a4f33', wood: '#a06a3c',
  stone: '#8f97a8', slate: '#5d6475', cavern: '#3f5068', water: '#3f9fd1', sky: '#8fd0f0', dusk: '#8696dc',
  haze: '#7fb0b8', cream: '#f0ead8', hero: '#3f6fd1', crimson: '#c9423a', gold: '#f2c230', steel: '#c2c9d6',
  thorn: '#7a4fc4', goblin: '#9bd18a', ember: '#e08a2c', magic: '#4fd8ee', skin: '#f6d3b0',
};

const hearthvale = {
  ink: '#231b33', meadow: '#7fbf5a', leaf: '#4f9d57', pine: '#357a4c', wheat: '#e6c96a', path: '#c9a06a',
  wood: '#9a6a3e', cobble: '#a8a4a0', slate: '#5a5f7a', flagstone: '#7e84a0', roof: '#c8553a', water: '#4fa8d8',
  sky: '#9fd8f4', haze: '#a8c8d8', cream: '#f0ead8', hero: '#3f6fd1', mage: '#7a4fc4', rogue: '#2f8f9d',
  crimson: '#c9423a', bandit: '#8e3a4a', gold: '#f2c230', steel: '#c2c9d6', rust: '#a8806a', fire: '#e8662c',
  ice: '#7aa0f4', thunder: '#f4e06a', heal: '#7fe0a0', magic: '#4fd8ee', panel: '#4a609c', skin: '#f6d3b0',
};

const derelict = {
  ink: '#231b33', void: '#141a33', plate: '#434d6d', deck: '#566182', hull: '#6b7896', panel: '#9aa6c0',
  steel: '#c2c9d6', suit: '#e8ecf2', signal: '#3f6fd1', cyan: '#5fe0f0', teal: '#2fb3a8', amber: '#f2a030',
  red: '#e2473f', flesh: '#b04a8a', membrane: '#a87894', chitin: '#ca9eda', acid: '#9fe040', gold: '#f2c230',
  heal: '#5fd47a', shield: '#4f9ff0', xp: '#b48af8', nebula: '#6660b6', cream: '#f0ead8', skin: '#f6d3b0',
};

/** Maps each bundle id to its palette key ('kit-platformer-fantasy' -> 'thornwood'). No arguments: a frozen object. */
export const BUNDLE_PALETTE = Object.freeze({
  'kit-platformer-fantasy': 'thornwood',
  'kit-rpg-fantasy': 'hearthvale',
  'kit-roguelite-scifi': 'derelict',
});

const ALIASES = { ...BUNDLE_PALETTE, platformer: 'thornwood', rpg: 'hearthvale', roguelite: 'derelict', scifi: 'derelict' };

const P = { thornwood: Object.freeze(thornwood), hearthvale: Object.freeze(hearthvale), derelict: Object.freeze(derelict) };
for (const [alias, name] of Object.entries(ALIASES)) Object.defineProperty(P, alias, { value: P[name], enumerable: false });

/** The three palettes as frozen { name: '#rrggbb' } objects, keyed thornwood, hearthvale, derelict (aliases: bundle ids, platformer, rpg, roguelite, scifi). No arguments. */
export const PALETTE = Object.freeze(P);

/** Per palette key, the colour names that are never swatches: the outline and "background only" colours. No arguments: frozen lists. */
export const NEVER_SWATCH = Object.freeze({ thornwood: Object.freeze(['ink']), hearthvale: Object.freeze(['ink']), derelict: Object.freeze(['ink', 'void']) });

// ---- swatch groups -----------------------------------------------------------
// Each material lists palette colour names (first, in order of fit) and then extra
// '#rrggbb' colours from the engine lists. Colours too dark to be a swatch are dropped.

// SKIN, HAIR, CLOTH, METAL are the engine lists (engine/sprite.js); their too-dark entries are dropped below.
const BROWN = ['#a8612a', '#5a3a22', '#c98a4a'];
const GREY = ['#6b7280', '#8f97a8'];

const GROUPS = {
  thornwood: {
    skin: ['skin', 'goblin', ...SKIN],
    hair: ['soil', 'gold', 'crimson', 'cream', ...HAIR],
    outfit: ['hero', 'crimson', 'leaf', 'thorn', 'wood', ...CLOTH],
    trim: ['crimson', 'gold', 'hero', 'thorn', 'cream', ...CLOTH],
    metal: ['steel', 'gold', 'stone', 'slate', ...METAL],
    wood: ['wood', 'soil', 'cream', ...BROWN],
    stone: ['stone', 'slate', 'cream', 'cavern', 'moss', ...GREY],
    body: ['goblin', 'thorn', 'leaf', 'crimson', 'soil', 'water'],
    accent: ['crimson', 'gold', 'thorn', 'cream', 'magic', 'moss'],
    glow: ['magic', 'ember', 'gold', 'moss', 'crimson', 'thorn'],
    core: ['cream', 'gold', 'magic', 'moss', 'ember'],
    edge: ['ember', 'crimson', 'magic', 'thorn', 'moss', 'hero'],
    gem: ['magic', 'crimson', 'moss', 'thorn', 'gold'],
    shell: ['thorn', 'goblin', 'crimson', 'gold', 'soil'],
    grass: ['grass', 'leaf', 'moss', 'goblin'],
    leaf: ['leaf', 'grass', 'moss', 'ember'],
    ground: ['soil', 'wood', 'stone', 'slate'],
    water: ['water', 'magic', 'hero', 'haze', 'ember', 'moss'],
    sky: ['sky', 'haze', 'dusk', 'cream', 'water', 'ember'],
    land: ['leaf', 'grass', 'haze', 'slate', 'soil', 'stone'],
    haze: ['haze', 'sky', 'cream', 'stone'],
    face: ['wood', 'stone', 'cream', 'hero', 'slate'],
    frame: ['soil', 'gold', 'steel', 'slate', 'crimson'],
  },
  hearthvale: {
    skin: ['skin', ...SKIN],
    hair: ['wood', 'wheat', 'crimson', 'cream', ...HAIR],
    outfit: ['hero', 'mage', 'rogue', 'crimson', 'bandit', 'leaf', ...CLOTH],
    trim: ['crimson', 'gold', 'roof', 'rogue', 'mage', 'cream', ...CLOTH],
    metal: ['steel', 'gold', 'cobble', 'rust', 'slate', ...METAL],
    wood: ['wood', 'path', 'wheat', ...BROWN],
    stone: ['cobble', 'slate', 'flagstone', 'cream', 'path', ...GREY],
    body: ['leaf', 'mage', 'crimson', 'bandit', 'rogue', 'meadow'],
    accent: ['gold', 'crimson', 'cream', 'heal', 'magic', 'roof'],
    glow: ['magic', 'fire', 'ice', 'thunder', 'heal', 'mage'],
    core: ['cream', 'thunder', 'ice', 'heal', 'gold'],
    edge: ['fire', 'mage', 'rogue', 'crimson', 'heal', 'ice'],
    gem: ['magic', 'crimson', 'heal', 'mage', 'gold'],
    shell: ['mage', 'crimson', 'leaf', 'wheat', 'bandit'],
    grass: ['meadow', 'leaf', 'wheat', 'path'],
    leaf: ['leaf', 'meadow', 'pine', 'wheat', 'roof'],
    ground: ['path', 'wheat', 'cobble', 'wood', 'slate'],
    water: ['water', 'ice', 'rogue', 'magic', 'haze'],
    roof: ['roof', 'slate', 'wheat', 'wood', 'rogue'],
    sky: ['sky', 'haze', 'cream', 'wheat', 'ice'],
    land: ['leaf', 'meadow', 'haze', 'slate', 'path'],
    haze: ['haze', 'sky', 'cream', 'cobble'],
    face: ['panel', 'wood', 'cream', 'slate', 'rogue'],
    frame: ['gold', 'wood', 'steel', 'cobble', 'cream'],
  },
  derelict: {
    skin: ['skin', ...SKIN],
    hair: ['cream', 'gold', 'flesh', 'signal', ...HAIR],
    outfit: ['suit', 'signal', 'teal', 'hull', 'panel', 'shield'],
    trim: ['signal', 'teal', 'cyan', 'amber', 'red', 'xp'],
    metal: ['steel', 'panel', 'hull', 'gold', ...METAL],
    // no wood on the station: a "wood" control there colours crates and plating
    wood: ['hull', 'deck', 'panel', 'amber', '#c98a4a'],
    stone: ['hull', 'deck', 'plate', 'panel', '#8f97a8'],
    body: ['panel', 'hull', 'flesh', 'chitin', 'suit', 'deck'],
    accent: ['amber', 'teal', 'red', 'signal', 'cyan', 'acid'],
    glow: ['cyan', 'red', 'acid', 'amber', 'xp', 'shield', 'heal'],
    core: ['cream', 'cyan', 'acid', 'amber', 'xp'],
    edge: ['cyan', 'red', 'acid', 'amber', 'xp', 'shield'],
    gem: ['xp', 'cyan', 'gold', 'acid', 'red'],
    shell: ['chitin', 'flesh', 'membrane', 'hull', 'acid', 'panel'],
    grass: ['acid', 'flesh', 'membrane', 'teal'],
    leaf: ['acid', 'flesh', 'membrane', 'teal'],
    ground: ['deck', 'plate', 'hull', 'panel'],
    water: ['acid', 'teal', 'shield', 'cyan', 'flesh'],
    floor: ['deck', 'plate', 'hull', 'panel'],
    wall: ['hull', 'deck', 'panel', 'plate'],
    flesh: ['flesh', 'membrane', 'chitin', 'acid', 'xp', 'red'],
    // void is the space colour of a backdrop but never a swatch, so `sky` starts with plate
    sky: ['plate', 'deck', 'nebula', 'hull', 'membrane'],
    land: ['hull', 'deck', 'plate', 'teal', 'chitin'],
    haze: ['nebula', 'xp', 'hull', 'panel', 'teal', 'deck'],
    face: ['plate', 'deck', 'hull', 'teal', 'panel'],
    frame: ['teal', 'cyan', 'panel', 'steel', 'amber'],
  },
};

// Spec words that mean one of the materials above.
const SAME_AS = { rock: 'stone', cloth: 'outfit', fur: 'body', light: 'glow', energy: 'glow', crystal: 'gem', liquid: 'water', growth: 'leaf', foliage: 'leaf', earth: 'ground', dirt: 'ground', floor: 'ground', wall: 'stone' };

const MIN_BRIGHTNESS = 0.18;
const HEX = /^#[0-9a-f]{6}$/i;

/** Returns the palette key ('thornwood', 'hearthvale', 'derelict'); throws for an unknown name. Arguments: bundle: a palette key, bundle id or short name, any case. */
export function paletteName(bundle) {
  const key = String(bundle).toLowerCase();
  if (key in GROUPS) return key;
  if (key in ALIASES) return ALIASES[key];
  throw new Error(`unknown bundle "${bundle}": use thornwood, hearthvale, derelict or a bundle id (${Object.keys(BUNDLE_PALETTE).join(', ')})`);
}

/** Returns the frozen palette object. Arguments: bundle: a palette key, bundle id or short name, any case. */
export const palette = (bundle) => PALETTE[paletteName(bundle)];

/** Lists the material words swatches() accepts for a palette (its colour names also work). Arguments: bundle: a palette key, bundle id or short name. */
export function materials(bundle) {
  const name = paletteName(bundle);
  const own = Object.keys(GROUPS[name]);
  return [...own, ...Object.keys(SAME_AS).filter((k) => !own.includes(k))];
}

function resolve(name, entry) {
  if (HEX.test(entry)) return entry.toLowerCase();
  const c = PALETTE[name][String(entry).toLowerCase()];
  if (!c) throw new Error(`palettes: "${entry}" is not a ${name} colour`);
  return c;
}

/** Returns a new swatch list for a colour control: 4 to 8 colours, palette colours first, none darker than 0.18. Arguments: bundle: palette key or alias; material: a word from materials() or a palette colour name; options { lead }: a colour name or hex to put first. */
export function swatches(bundle, material, { lead } = {}) {
  const name = paletteName(bundle);
  material = String(material).toLowerCase();
  const groups = GROUPS[name];
  const Pn = PALETTE[name];
  const banned = new Set(NEVER_SWATCH[name].map((k) => Pn[k]));
  let list;
  if (groups[material]) list = groups[material];
  else if (SAME_AS[material] && groups[SAME_AS[material]]) list = groups[SAME_AS[material]];
  else if (material in Pn) {
    if (material === 'ink') throw new Error(`palettes: ink is the outline colour and is never a swatch`);
    if (NEVER_SWATCH[name].includes(material)) throw new Error(`palettes: ${name}.${material} is background only and is never a swatch`);
    // the colour itself, then the groups it belongs to, then the accents
    const homes = Object.values(groups).filter((g) => g.includes(material));
    list = [material, ...homes.flat(), ...groups.accent];
  } else {
    throw new Error(`palettes: no material "${material}" in ${name}. materials: ${materials(name).join(', ')}; or a ${name} colour name`);
  }

  const out = [];
  if (lead !== undefined) {
    const c = resolve(name, lead);
    if (brightness(c) < MIN_BRIGHTNESS || banned.has(c)) throw new Error(`palettes: lead ${lead} is too dark for a swatch (it would read as the outline)`);
    out.push(c);
  }
  for (const entry of list) {
    const c = resolve(name, entry);
    if (out.includes(c) || banned.has(c) || brightness(c) < MIN_BRIGHTNESS) continue;
    out.push(c);
    if (out.length === 8) break;
  }
  // never fewer than 4: top up from the bundle's accents
  for (const entry of groups.accent) {
    if (out.length >= 4) break;
    const c = resolve(name, entry);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}
