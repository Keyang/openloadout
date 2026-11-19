// What a colour is of (docs/architecture.md, Contract 7; docs/style-guide.md, "Looks").
// A whole-bundle look may move hue, warmth and tone, but a thing must stay what it is: sky stays sky, skin stays
// a skin tone, a warning stays a warning. So every colour a sprite draws has a material, and every material says
// how far a look may pull a colour away from the colour it was made in (its limits). engine/theme.js applies them.
//
// A colour control's material is what the control declares (`material: 'sky'` in its options), or else what its
// label and key say ("Sky", "Grass", "Skin"), or else the default for the sprite's type.
// Pure JavaScript: runs the same in the browser and in Node. No DOM, no files, no other engine module.

// ---- colour maths: OKLab, where equal distances look equally different ------------------------------------

const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** A colour (red, green, blue, each 0..255) as [L, a, b] in OKLab: L is lightness 0..1, a runs green to red, b blue to yellow. */
export function oklab(r, g, b) {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** A colour (red, green, blue, each 0..255) as { L, C, h }: lightness 0..1, strength of colour (0 is grey, about 0.3 is the strongest), and hue in degrees 0..360. */
export function oklch(r, g, b) {
  const [L, A, B] = oklab(r, g, b);
  const C = Math.hypot(A, B);
  return { L, C, h: C < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function labToLinear(L, A, B) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (rgb) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);
const showable = (L, C, h) => { const rad = (h * Math.PI) / 180; return inGamut(labToLinear(L, C * Math.cos(rad), C * Math.sin(rad))); };
const to255 = (c) => Math.max(0, Math.min(255, Math.round(toSrgb(Math.max(0, Math.min(1, c))) * 255)));

/** The colour [red, green, blue] (each 0..255) for a lightness L (0..1), a strength C and a hue h in degrees. A colour too strong to show is made weaker until it can be shown; its lightness and hue are kept. */
export function fromOklch(L, C, h) {
  const l = Math.max(0, Math.min(1, L)), rad = (h * Math.PI) / 180, ca = Math.cos(rad), sa = Math.sin(rad);
  let lin = labToLinear(l, C * ca, C * sa);
  if (!inGamut(lin)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (inGamut(labToLinear(l, mid * ca, mid * sa))) lo = mid; else hi = mid; }
    lin = labToLinear(l, lo * ca, lo * sa);
  }
  return [to255(lin[0]), to255(lin[1]), to255(lin[2])];
}

/** How different two colours look, each [red, green, blue] (0..255): 0 is the same, about 0.02 is just visible, 1 is black against white. */
export function colourGap(a, b) {
  const x = oklab(a[0], a[1], a[2]), y = oklab(b[0], b[1], b[2]);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** The smallest turn from hue `from` to hue `to`, in degrees, -180..180. */
export const hueTurn = (from, to) => ((((to - from) % 360) + 540) % 360) - 180;

// ---- the materials ----------------------------------------------------------------------------------------
// hue:    the most a look may turn the hue, in degrees either way (null: any hue).
// chroma: [least, most] strength of colour, as multiples of the made colour's strength (null: any strength).
// light:  the most a look may change the lightness, on the 0..1 scale (null: any lightness).
// keeps:  true for a colour that carries a meaning. It keeps its hue and most of its strength even under a look
//         that has one colour only (shades of grey, the green screen), where every other material follows the look.
// words:  what a control's label or key says when it is of this material (whole words, lowercase).
// A colour made nearly grey (GREY) has no hue to hold: it may take any cast but stays muted (MUTED more strength at most).
// The order is the order the words are tried in, most particular first.

/** A made colour weaker than this is "nearly grey": it has no hue of its own for a material to hold. */
export const GREY = 0.035;
/** The most strength a nearly grey colour of a held material may gain (a grey stone may take a cast, and stays a grey stone). */
export const MUTED = 0.035;
/** How much of a "keeps" material's least strength still holds under a one-colour look. */
export const KEEPS_SHARE = 0.9;

const W = (text) => text.split(' ');

/** Every material, in the order their words are tried: { id, name, about, hue, chroma, light, keeps, words }. */
export const MATERIALS = [
  { id: 'warning', name: 'Warning', about: 'Danger and hazard marks: they stay as loud as they were made.', hue: 10, chroma: [0.85, 1.3], light: 0.07, keeps: true, words: W('warning warnings hazard hazards danger alert alarm') },
  { id: 'signal', name: 'Signal', about: 'A colour that carries a meaning: health, shield, magic, a heal, a team. A red heart stays red, not rust.', hue: 10, chroma: [0.85, 1.3], light: 0.08, keeps: true, words: W('signal heart hearts') },
  { id: 'skin', name: 'Skin', about: 'Skin, fur, hide and feathers: a skin tone stays that skin tone, a red dragon stays red.', hue: 12, chroma: [0.6, 1.25], light: 0.08, words: W('skin flesh fur hide feathers feather belly scales') },
  { id: 'fire', name: 'Fire', about: 'Flames, embers, lava.', hue: 20, chroma: [0.7, 1.3], light: 0.1, words: W('fire flame flames lava ember embers torch') },
  { id: 'sky', name: 'Sky', about: 'Sky, space, clouds, mist.', hue: 28, chroma: [0.45, 1.35], light: 0.1, words: W('sky space cloud clouds nebula haze mist fog air') },
  { id: 'water', name: 'Water', about: 'Water, foam, ice.', hue: 24, chroma: [0.55, 1.35], light: 0.1, words: W('water sea ocean river pond lake foam wave waves ice snow') },
  { id: 'plant', name: 'Plants', about: 'Grass, leaves, moss, flowers, fruit: a meadow stays green, not olive.', hue: 12, chroma: [0.75, 1.35], light: 0.1, words: W('grass leaf leaves tree trees needle needles moss plant plants vine vines bush crop crops stem growth flower flowers petal petals fruit sprout') },
  { id: 'earth', name: 'Earth', about: 'Soil, sand, paths, hills, planets, and roofs of clay, thatch or slate.', hue: 30, chroma: [0.45, 1.4], light: 0.12, words: W('soil earth dirt sand mud path ground clay land hill hills bank cliff planet roof roofs thatch') },
  { id: 'wood', name: 'Wood', about: 'Wood, rope, leather.', hue: 26, chroma: [0.45, 1.4], light: 0.12, words: W('wood plank planks beams deck bridge bark trunk log logs rope leather') },
  { id: 'light', name: 'Light', about: 'Anything that glows: lamps, screens, beams, glowing eyes.', hue: 35, chroma: [0.55, 1.4], light: 0.1, words: W('glow light lights lamp lamps shine beam spark sparks screen hologram laser eye eyes') },
  { id: 'magic', name: 'Magic', about: 'Spells, runes, crystals.', hue: 50, chroma: [0.6, 1.4], light: 0.12, words: W('magic spell rune runes crystal crystals gem gems jewel jewels aura seal portal') },
  { id: 'stone', name: 'Stone', about: 'Stone, brick, walls, floors, plating, and bone: hard things that may lose their colour, never gain much.', hue: 60, chroma: [0, 1.5], light: 0.12, words: W('stone stones rock rocks brick bricks wall walls floor paving cobble concrete plating hull pedestal pillar bone bones skull') },
  { id: 'metal', name: 'Metal', about: 'Steel, gold, coins, blades: gold stays golden, copper stays copper.', hue: 14, chroma: [0.4, 1.4], light: 0.1, words: W('metal steel iron gold silver copper coin coins blade armour armor spring chain casing') },
  { id: 'cloth', name: 'Cloth', about: 'Clothes, hair, flags: any colour, about as light or dark as made.', hue: null, chroma: null, light: 0.22, words: W('outfit cloth robe tunic tabard shirt cape scarf hood coat suit smock collar hat dress kerchief belt trim banner banners flag flags apron hair beard') },
  { id: 'interface', name: 'Interface', about: 'Panels, buttons and frames: any colour, about as light or dark as made, so words on them stay readable.', hue: null, chroma: null, light: 0.14, words: W('interface') },
  { id: 'paint', name: 'Anything else', about: 'A colour that says nothing about what the thing is: a look may do what it likes with it.', hue: null, chroma: null, light: null, words: [] },
];

/** The ids of every material, in order. */
export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));

/** A material by its id ({ id, name, about, hue, chroma, light, keeps, words }), or null. */
export const materialById = (id) => BY_ID.get(id) ?? null;

// In an interface piece or an icon, these words name a meaning shown by colour (a health bar, a shield meter).
const SIGNAL_WORDS = new Set(W('health heart hearts lives shield magic mana energy stamina experience gauge credits boost heal poison good bad ailment'));
const INTERFACE_TYPES = new Set(['ui', 'icon']);
const GLOW_TYPES = new Set(['effect', 'projectile']);

const wordsOf = (text) => String(text ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);
const typeOf = (sprite) => sprite?.meta?.type ?? null;

/**
 * The material of a colour that no control paints, for this sprite: 'signal' in an interface piece (its fixed
 * colours are colour codes: the red of a danger mark), 'light' in an effect or a projectile, otherwise 'paint'.
 * A sprite may say otherwise with `materials: { rest: '<material id>' }`.
 */
export function restMaterial(sprite) {
  const said = sprite?.materials?.rest;
  if (said && BY_ID.has(said)) return said;
  const type = typeOf(sprite);
  return type === 'ui' ? 'signal' : GLOW_TYPES.has(type) ? 'light' : 'paint';
}

/**
 * The material of one colour control, as an id from MATERIALS.
 * key: the control's key in `params`; control: the control ({ label, material? }); sprite: the sprite it belongs to (optional).
 * In order: what the control declares (`material`), what its label says, what its key says, and last the default
 * for the sprite's type (an interface piece or an icon: 'interface'; an effect or a projectile: 'light'; else 'paint').
 */
export function controlMaterial(key, control, sprite) {
  if (control && typeof control.material === 'string' && BY_ID.has(control.material)) return control.material;
  const type = typeOf(sprite);
  for (const words of [wordsOf(control?.label), wordsOf(key)]) {
    if (INTERFACE_TYPES.has(type) && words.some((w) => SIGNAL_WORDS.has(w))) return 'signal';
    for (const m of MATERIALS) if (m.words.length && words.some((w) => m.words.includes(w))) return m.id;
  }
  return INTERFACE_TYPES.has(type) ? 'interface' : GLOW_TYPES.has(type) ? 'light' : 'paint';
}

/**
 * Words that name a thing which can be made of different stuff: a door may be wood or metal, a liquid may be water,
 * a potion or acid. A colour control called by one of them says nothing a look can use, so it must declare its
 * material (`material: 'wood'`); the quality bar warns when it does not (unsaidMaterial).
 */
export const UNSAID_WORDS = W('door doors gate gates liquid potion card shard shards block blocks barrel crate');

/**
 * The word that leaves a colour control's material unsaid (see UNSAID_WORDS), or null when the control declares one
 * or its label or key says what it is of. key, control, sprite: as controlMaterial.
 */
export function unsaidMaterial(key, control, sprite) {
  if (control && typeof control.material === 'string' && BY_ID.has(control.material)) return null;
  if (controlMaterial(key, control, sprite) !== 'paint') return null;
  for (const words of [wordsOf(control?.label), wordsOf(key)]) {
    const w = words.find((x) => UNSAID_WORDS.includes(x));
    if (w) return w;
  }
  return null;
}

// ---- holding a colour inside its material's limits --------------------------------------------------------------

const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The limits one made colour has under its material, as numbers: { hue: [from, turn] | null, chroma: [least, most] | null,
 * light: [least, most] | null }. `from` is the made hue and `turn` the most it may turn either way.
 * material: an id from MATERIALS; from: the made colour [r, g, b]; oneColour: true under a look that has one colour only.
 */
export function limitsOf(material, from, { oneColour = false } = {}) {
  const m = BY_ID.get(material) ?? BY_ID.get('paint');
  const o = oklch(from[0], from[1], from[2]);
  const out = { hue: null, chroma: null, light: m.light === null ? null : [o.L - m.light, o.L + m.light] };
  if (oneColour && !m.keeps) return out;                                  // a one-colour look takes the hue and strength of everything that carries no meaning
  if (o.C < GREY) { if (m.chroma) out.chroma = [0, Math.max(o.C * m.chroma[1], o.C + MUTED)]; return out; }
  if (m.hue !== null) out.hue = [o.h, m.hue];
  if (m.chroma) out.chroma = [o.C * m.chroma[0] * (oneColour ? KEEPS_SHARE : 1), o.C * m.chroma[1]];
  return out;
}

/** A look's wish whose hue is more than this many degrees from the made colour's turns it not at all (holdColour). */
export const FAR = 150;

/**
 * What a look may make of a colour: the look's wish, pulled back inside the material's limits. Returns [r, g, b].
 * material: an id from MATERIALS; from: the made colour [r, g, b]; wish: what the look would make it with no limits;
 * oneColour: true under a look that has one colour only. A wish already inside the limits comes back unchanged.
 */
export function holdColour(material, from, wish, { oneColour = false } = {}) {
  const lim = limitsOf(material, from, { oneColour });
  if (!lim.hue && !lim.chroma && !lim.light) return wish;
  const w = oklch(wish[0], wish[1], wish[2]);
  let { L, C, h } = w, moved = false;
  if (lim.light) { const v = clampTo(L, lim.light[0], lim.light[1]); if (v !== L) { L = v; moved = true; } }
  if (lim.chroma) { const v = clampTo(C, lim.chroma[0], lim.chroma[1]); if (v !== C) { C = v; moved = true; } }
  if (lim.hue && C >= 0.02) {
    const [home, most] = lim.hue;
    // a wish with no colour of its own (grey) gives no direction to turn in, and the further round the wheel a wish
    // is, the less it turns the colour: one a sixth of the way round turns it as far as the material allows, one more
    // than FAR away (the look has nothing of this kind: a brown for a sky) not at all, and in between less and less,
    // so two shades whose wishes differ a little are turned alike
    const turn = w.C < 0.02 ? 0 : hueTurn(home, w.h);
    const reach = most * clampTo((FAR - Math.abs(turn)) / (FAR - 60), 0, 1);
    const v = home + clampTo(turn, -reach, reach);
    if (w.C < 0.02 || Math.abs(hueTurn(v, h)) > 0.01) { h = v; moved = true; }
  }
  if (!moved) return wish;
  // Very light and very dark colours cannot be strong ones. Where the least strength the material keeps cannot be
  // shown at this lightness, the lightness gives way, step by step back toward the made colour's: a pale skin under
  // a bright look stays skin and does not wash out to white.
  if (lim.chroma && lim.chroma[0] > 0) {
    const made = oklch(from[0], from[1], from[2]).L;
    for (let i = 0; i < 8 && !showable(L, lim.chroma[0], h); i++) L += (made - L) * 0.3;
  }
  return fromOklch(L, C, h);
}

// Rounding to whole red, green and blue steps, and bringing a colour too strong to show back into range, both move a
// colour a little, most of all in the hue of a weak colour: allowances for that when checking.
const SLACK = { light: 0.012, chroma: 0.012, hue: 4 };

/**
 * Whether a colour is still inside its material's limits after a look: null when it is, otherwise a short reason
 * in plain words ("its hue turned 84 degrees, and sky may turn 28"). The measure the quality bar uses.
 * material, from, oneColour: as holdColour; to: the colour after the look, [r, g, b].
 */
export function outsideMaterial(material, from, to, { oneColour = false } = {}) {
  const m = BY_ID.get(material) ?? BY_ID.get('paint');
  const lim = limitsOf(material, from, { oneColour });
  const o = oklch(from[0], from[1], from[2]), t = oklch(to[0], to[1], to[2]);
  const what = m.name.toLowerCase();
  // (next to black one step of red, green or blue is a large step of lightness)
  const dark = t.L < 0.1 ? 0.07 : 0;
  if (lim.light && (t.L < lim.light[0] - SLACK.light - dark || t.L > lim.light[1] + SLACK.light)) return `it became ${t.L > o.L ? 'lighter' : 'darker'} by ${Math.abs(t.L - o.L).toFixed(2)}, and ${what} may change by ${m.light}`;
  if (lim.chroma) {
    // a colour at the edge of what a screen can show cannot always be as strong as asked for: only what is possible is required
    const possible = oklch(...fromOklch(t.L, lim.chroma[0], lim.hue ? t.h : o.h)).C;
    if (t.C < Math.min(lim.chroma[0], possible) - SLACK.chroma) return `it lost its colour (strength ${t.C.toFixed(3)}, made ${o.C.toFixed(3)}), and ${what} keeps at least ${Math.round((lim.chroma[0] / Math.max(o.C, 1e-6)) * 100)}% of it`;
    if (t.C > lim.chroma[1] + SLACK.chroma) return `it became too strong a colour for ${what} (strength ${t.C.toFixed(3)}, made ${o.C.toFixed(3)})`;
  }
  if (lim.hue && t.C >= 0.02) {
    const turn = Math.abs(hueTurn(lim.hue[0], t.h));
    // the weaker a colour, the less its hue shows and the more rounding moves it
    if (turn > lim.hue[1] + SLACK.hue + 0.6 / Math.max(t.C, 0.02)) return `its hue turned ${Math.round(turn)} degrees, and ${what} may turn ${lim.hue[1]}`;
  }
  return null;
}
