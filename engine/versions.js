// Ready-made versions of an asset (docs/site-design.md, section 4): a handful of named, clearly different settings to
// start from. A sprite may list its own (`versions` in defineSprite, Contract 1); the rest are made from the changes people
// notice first (a part put on or taken off, a new colour over a large area, a big change of shape), kept only when the
// result looks different at card size from the defaults and from every version already chosen, and named in a few everyday
// words ("Long hair, axe", "Blue outfit"). Sounds and music get one version per style, then seeded settings.
// Pure: no page, runs in Node and the browser. The site reads them from generated/versions.json (tools/lib/versions-build.mjs);
// call these at run time only for an asset made on the page.
//
//   versionsOf(sprite, n = 12, { seed })      -> [{ name, params, made: 'hand' | 'generated' }]
//   soundVersionsOf(patch, n = 12, { seed })  -> [{ name, params, made: 'hand' | 'generated', style }]
//
// Fewer versions are always the first of more (a card's three dots are the first three of the asset page's twelve),
// and the same sprite id and seed always give the same list.
import { defaultParams, cleanParams, inEffect, partOf, renderPixels } from './sprite.js';
import { rng } from './motion.js';
import { colorName, hexToRgb } from './color.js';
import { colourGap, oklab, controlMaterial } from './materials.js';
import { position, controlWords } from '../sound/words.js';

// ---- how different is "visibly different" ----------------------------------------------------------------------

/**
 * The rules a generated sprite version must meet, measured on the preview frame as a library card shows it.
 * The frame is the preview clip's first, or the middle of a one-shot clip, shrunk to at most `card` pixels a side.
 */
export const VERSION_RULES = {
  card: 32,              // measured at a glance: the frame averaged down to 32 px a side, so a one-pixel shift of a staff or a
                         // 4 px size nudge (which a pixel-exact count makes look big) fades, and colours of large areas, parts and big shape changes stay
  colourSeen: 0.02,      // how a card pixel's change counts, by its distance in OKLab (engine/materials.js colourGap): below 0.02
  colourFull: 0.1,       // (just visible) not at all, from there in proportion up to 0.1 (a clear change), drawn in one picture only fully.
                         // So a dark teal face (0.04-0.06 over most of the card) counts, and a faint glass sheen (0.06-0.1 over a
                         // sixth of it) counts little: a hue change on a dark colour is seen, a faint pattern is not
  change: 0.1,           // a slider change on its own must alter at least this much of the card picture (a 4 px size nudge on a
                         // 128 px wyrm, a darker wood on an arrow and a hold angle measure 0.02-0.08; a hat, a weapon, a new outfit 0.12+)
  partChange: 0.05,      // a choice or an on/off control on its own (a small gem for an epic card is 0.06: a kind is noticed even when small)
  colourArea: 0.25,      // a new colour is offered only over a large area: at least this much of the card (a robe, a hide, a face; not a trim)
  fromDefaults: 0.2,     // a version against the defaults: the reviewed near-duplicates of round 1 measured 0.12-0.18 here
  between: 0.2,          // two versions against each other (an orange frame with glass against one with a thin border measures 0.15 and reads as one at card size); and a version that adds to another's lead must add at least fromDefaults
  attempts: 14,          // combinations tried per version asked for, before giving up with fewer
  picture: (sprite, p) => [cardPicture(sprite?.meta?.type === 'tileset' ? tileSheet(sprite, p) : renderPixels(sprite, sprite.preview, previewFrame(sprite), p), VERSION_RULES.card)],
};

// a tileset is judged on a small sheet, not one tile: the first frames of six pieces spread evenly over its list (the blocks
// come first, slopes and decorations last), three across and two down, so its stone, flower and edge controls count as well
// as the one tile's soil
function tileSheet(sprite, p) {
  const [w, h] = sprite.size, all = Object.keys(sprite.clips);
  const clips = [...new Set(Array.from({ length: Math.min(6, all.length) }, (_, i) => all[Math.floor((i * all.length) / Math.min(6, all.length))]))];
  const cols = Math.min(3, clips.length), rows = Math.ceil(clips.length / cols);
  const out = { w: cols * w, h: rows * h, data: new Uint32Array(cols * w * rows * h) };
  clips.forEach((clip, i) => {
    const g = renderPixels(sprite, clip, 0, p), ox = (i % cols) * w, oy = Math.floor(i / cols) * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.data[(oy + y) * out.w + ox + x] = g.data[y * w + x];
  });
  return out;
}

// one frame: the first of a looping clip (its rest pose), the middle of a one-shot (an effect at its fullest)
const previewFrame = (sprite) => {
  const c = sprite.clips[sprite.preview];
  return c.loop === false ? Math.floor(c.frames / 2) : 0;
};

/** A Surface shrunk the way a card shows it: blocks averaged so the longer side is at most `card` pixels. Returns { w, h, data } (ABGR, a block drawn when half its pixels are). */
export function cardPicture(g, card = VERSION_RULES.card) {
  const b = Math.max(1, Math.ceil(Math.max(g.w, g.h) / card));
  if (b === 1) return { w: g.w, h: g.h, data: g.data };
  const w = Math.ceil(g.w / b), h = Math.ceil(g.h / b), data = new Uint32Array(w * h);
  for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
    let n = 0, all = 0, r = 0, gr = 0, bl = 0;
    for (let y = by * b; y < Math.min(g.h, by * b + b); y++) for (let x = bx * b; x < Math.min(g.w, bx * b + b); x++) {
      all++;
      const v = g.data[y * g.w + x];
      if (!v) continue;
      n++; r += v & 255; gr += (v >>> 8) & 255; bl += (v >>> 16) & 255;
    }
    if (n * 2 >= all && n) data[by * w + bx] = ((255 << 24) | (Math.round(bl / n) << 16) | (Math.round(gr / n) << 8) | Math.round(r / n)) >>> 0;
  }
  return { w, h, data };
}

const LAB = new Map();   // packed pixel -> OKLab: a picture has few colours, so each is converted once
const labOf = (v) => {
  let c = LAB.get(v);
  if (!c) { if (LAB.size > 50000) LAB.clear(); c = oklab(v & 255, (v >>> 8) & 255, (v >>> 16) & 255); LAB.set(v, c); }
  return c;
};
// how much one pixel's change counts, 0..1 (VERSION_RULES.colourSeen / colourFull)
const pixelChange = (a, b, seen, full) => {
  if (a === b) return 0;
  if (!a || !b) return 1;
  const x = labOf(a), y = labOf(b), t = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  return t <= seen ? 0 : Math.min(1, (t - seen) / (full - seen));
};

/** How different two pictures look (lists of same-size pictures with .data), 0..1 over the pixels drawn in either: a pixel drawn in one only counts fully, a recoloured one by how far its colour moved in OKLab (VERSION_RULES.colourSeen to colourFull). */
export function pictureDifference(a, b, { seen = VERSION_RULES.colourSeen, full = VERSION_RULES.colourFull } = {}) {
  let drawn = 0, differ = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i].data, db = b[i].data;
    for (let k = 0; k < da.length; k++) {
      if (!da[k] && !db[k]) continue;
      drawn++;
      differ += pixelChange(da[k], db[k], seen, full);
    }
  }
  return drawn ? differ / drawn : 0;
}

// which sides of the frame a Surface touches: a version may not touch a side the defaults keep clear
const sidesTouched = (g) => {
  const out = new Set(), b = g.bounds();
  if (!b) return out;
  if (b.x0 === 0) out.add('left');
  if (b.y0 === 0) out.add('top');
  if (b.x1 === g.w - 1) out.add('right');
  if (b.y1 === g.h - 1) out.add('bottom');
  return out;
};

// ---- values ------------------------------------------------------------------------------------------------------

const decimals = (step) => { const s = String(step); return s.includes('e-') ? Number(s.split('e-')[1]) : (s.split('.')[1] ?? '').length; };
/** A slider value put on the control's own steps (and inside its ends), without floating-point tails: 0.35, not 0.35000000000000003. d: a range control. */
export function onStep(d, v) {
  const n = d.min + Math.round((v - d.min) / d.step) * d.step;
  return Math.min(d.max, Math.max(d.min, Number(n.toFixed(Math.max(decimals(d.step), decimals(d.min))))));
}

// ---- hand-made versions ----------------------------------------------------------------------------------------

const valueFits = (d, v) => (d.kind === 'choice' ? d.options.some((o) => o.value === v) || (d.was != null && Object.hasOwn(d.was, String(v)))
  : d.kind === 'toggle' ? typeof v === 'boolean'
    : d.kind === 'range' ? typeof v === 'number' && Number.isFinite(v) && v >= d.min && v <= d.max
      : typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v));

/**
 * A sprite's own versions, checked: [{ name, params }] with params cleaned over the defaults. Throws for a version with no name,
 * a name used twice, a key other than name and params, or a setting the sprite does not have or can never take (an old option
 * name a choice's `was` maps is accepted). sprite: from defineSprite.
 */
export function cleanVersions(sprite) {
  const list = sprite.versions;
  if (list === undefined) return [];
  const where = `sprite ${sprite.id}: versions`;
  if (!Array.isArray(list)) throw new Error(`${where} must be a list: [{ name: 'Ranger', params: { ... } }]`);
  const names = new Set();
  return list.map((v, i) => {
    if (!v || typeof v !== 'object') throw new Error(`${where}: entry ${i} must be { name, params }`);
    const extra = Object.keys(v).filter((k) => k !== 'name' && k !== 'params');
    if (extra.length) throw new Error(`${where}: entry ${i} has ${extra.map((k) => `"${k}"`).join(', ')}; a version takes name and params only`);
    if (typeof v.name !== 'string' || !v.name.trim()) throw new Error(`${where}: entry ${i} needs a name in everyday words`);
    if (names.has(v.name.trim().toLowerCase())) throw new Error(`${where}: the name "${v.name}" is used twice`);
    names.add(v.name.trim().toLowerCase());
    const params = v.params ?? {};
    if (typeof params !== 'object' || Array.isArray(params)) throw new Error(`${where}: "${v.name}": params must be an object of settings`);
    for (const [k, value] of Object.entries(params)) {
      const d = sprite.params[k];
      if (!d) throw new Error(`${where}: "${v.name}" sets "${k}", which is not one of the sprite's controls`);
      if (!valueFits(d, value)) throw new Error(`${where}: "${v.name}" sets ${k} to ${JSON.stringify(value)}, which "${k}" can never be`);
    }
    return { name: v.name.trim(), params: cleanParams(sprite, params) };
  });
}

// ---- names -------------------------------------------------------------------------------------------------------

const low = (s) => String(s ?? '').trim().toLowerCase();
const wordsIn = (s) => low(s).split(/[^a-z]+/).filter(Boolean);
// labels that say what is measured but not of what: inside a part they are about the part ("Color" of the hat -> "purple hat")
const GENERAL = new Set(['length', 'size', 'color', 'colour', 'width', 'height', 'thickness', 'shape', 'style', 'kind', 'type', 'tint', 'main colour', 'main color']);
// labels that are the measure itself, so the end word says it alone ("tall", not "tall height")
const MEASURE = new Set(['height', 'size', 'build', 'speed', 'length', 'width', 'bulk', 'thickness', 'span', 'weight']);
// slider end words that read well in front of the label ("big head", "long neck", "few clouds")
const BEFORE = new Set(['big', 'small', 'long', 'short', 'tall', 'wide', 'narrow', 'thin', 'thick', 'fat', 'slim', 'large', 'tiny', 'huge', 'round', 'flat', 'few', 'many', 'more', 'less', 'bright', 'dark', 'light', 'deep', 'pale']);
// option words that describe rather than name a thing, so they need the control's label after them ("long hair", "tattered cape")
const DESCRIBING = new Set(['long', 'short', 'tall', 'small', 'big', 'large', 'plain', 'round', 'flat', 'wide', 'narrow', 'thin', 'thick', 'open', 'closed', 'calm', 'light', 'dark', 'bright', 'dull', 'soft', 'hard', 'heavy', 'new', 'old', 'full', 'half', 'empty', 'simple', 'fancy', 'pale', 'deep', 'high', 'low', 'left', 'right', 'up', 'down', 'single', 'double', 'triple', 'straight', 'curly', 'wild', 'neat']);
const NUMBERS = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'single', 'double', 'twin']);
const describes = (word) => {
  const first = low(word).split(/\s+/)[0];
  return DESCRIBING.has(first) || /(y|ed|ing|ful|less|ous|ive|al|ic|ish|ern)$/.test(first);
};
// "sky blue" over the sky reads "blue sky"; "greyish" and the like are dropped: a name is a glance, not a colour chart
const colourWord = (hex, about) => {
  const skip = new Set(wordsIn(about));
  const all = wordsIn(colorName(hex));
  const w = (all.includes('greyish') ? ['grey'] : all).filter((x) => !skip.has(x));   // "greyish blue" is a grey at a glance
  return w.join(' ') || 'new';
};

/** The part a removed-part phrase is about ("no wings" -> 'wings'), else null. */
const removedThing = (words) => (/^no /.test(words) ? words.slice(3) : null);

/** One control's change in a few everyday words ("long hair", "axe", "blue outfit", "tall", "no cape", "less haze"). */
function phrase(sprite, key, value, dflt) {
  const d = sprite.params[key], part = partOf(sprite, key);
  const label = d.kind === 'color' ? low(d.label).replace(/\s+(colou?rs?|tint)$/, '') : low(d.label);   // "Emblem colour" -> "purple emblem"
  const isSelector = part && key === part.selector;
  const about = isSelector ? low(part.label) : part && GENERAL.has(label) ? low(part.label) : label;
  if (d.kind === 'choice') {
    const option = d.options.find((o) => o.value === value), word = low(option ? option.label : value);
    const none = isSelector ? [].concat(part.none ?? []) : ['none'];
    if (none.includes(value) || value === 'none') return word && word !== 'none' && !/^no\b/.test(word) ? word : `no ${about}`;
    if (NUMBERS.has(word)) return `${word} ${word === 'one' ? about.replace(/s$/, '') : about}`;   // "one eye", "three horns"
    if (GENERAL.has(about)) return word;                                                   // "barbed", not "barbed style"
    return describes(word) && !wordsIn(word).some((w) => wordsIn(about).includes(w)) ? `${word} ${about}` : word;
  }
  if (d.kind === 'toggle') return value ? about : `no ${about}`;
  if (d.kind === 'color') {
    let c = colourWord(value, about);
    if (!GENERAL.has(about) && wordsIn(c).length + wordsIn(about).length > 4) c = wordsIn(c).at(-1);   // "grey belly and wings", not "light grey ..."
    return GENERAL.has(about) ? c : `${c} ${about}`;
  }
  // a slider: the word at the end it moved toward
  const up = value > dflt, end = low(up ? d.hi : d.lo);
  if (!end) return `${up ? 'more' : 'less'} ${about}`;
  if (part && GENERAL.has(label) && !/\s/.test(end)) return `${end} ${about}`;     // "short staff", "long weapon"
  if (/\bangle\b/.test(label)) return part ? `${end} ${low(part.label)}` : end;   // "forward staff", not "more hold angle"
  if (MEASURE.has(label) || /\s/.test(end)) return end;                          // "tall", "stocky", "big steps", "high hills"
  if (BEFORE.has(end)) return `${end} ${about}`;                                 // "big head", "long neck", "few clouds"
  if (end.slice(0, 4) === about.slice(0, 4)) return end;                          // "bouncy", not "bouncy bounce"
  return `${up ? 'more' : 'less'} ${about}`;                                      // "less haze", not "clear haze"
}

const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// two names with the same changes in another order ("Heavier, more grit" and "More grit, heavier") are one name
const nameKey = (words) => [...words].map(low).sort().join('|');
const SMALL = new Set(['no', 'and', 'of', 'a', 'the', 'more', 'less']);

/**
 * The phrases a name is made of: the most visible first, at most four words in all, no word said twice, and nothing said
 * about a part that is taken off. phrases: [{ words, impact }] most visible first.
 */
function pickPhrases(phrases, most = 4) {
  const out = [], used = new Set();
  let count = 0;
  for (const ph of phrases) {
    const w = wordsIn(ph.words), content = w.filter((x) => !SMALL.has(x));
    if (count + w.length > most) continue;
    if (content.some((x) => used.has(x))) continue;
    out.push(ph.words); count += w.length;
    for (const x of content) used.add(x);
  }
  return out;
}

/** True when a version's phrases contradict each other: one takes a part off and another sets something of it ("no wings" with "tan belly and wings"). */
const contradicts = (list) => list.some((a) => { const gone = removedThing(a); return gone && list.some((b) => b !== a && wordsIn(b).some((w) => wordsIn(gone).includes(w))); });

/** A version's name from what differs from the defaults, the most visible change first, in at most four words: "Long hair, axe". "Standard" when nothing does. */
export function versionName(sprite, params) {
  const dflt = defaultParams(sprite), p = cleanParams(sprite, params);
  const base = VERSION_RULES.picture(sprite, dflt);
  const phrases = [];
  for (const key of Object.keys(sprite.params)) {
    if (p[key] === dflt[key] || !inEffect(sprite, key, p)) continue;
    const solo = cleanParams(sprite, { ...dflt, [key]: p[key] });
    phrases.push({ words: phrase(sprite, key, p[key], dflt[key]), impact: pictureDifference(base, VERSION_RULES.picture(sprite, solo)) });
  }
  phrases.sort((a, b) => b.impact - a.impact);
  return capital(pickPhrases(phrases).join(', ')) || 'Standard';
}

// ---- generated sprite versions -----------------------------------------------------------------------------------

const hashText = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };
// a pale, nearly colourless sky reads as fog: allowed, but never among the first three versions (the card's dots)
const paleSky = (sprite, key, value) => {
  const d = sprite.params[key];
  if (d.kind !== 'color' || controlMaterial(key, d, sprite) !== 'sky') return false;
  const [L, a, b] = oklab(...hexToRgb(value));
  return L > 0.85 && Math.hypot(a, b) < 0.05;
};
// a control that sets the whole scene's light (time of day, season, weather) is a version by itself: night with a day-blue sky is no scene
const WHOLE_SCENE = /\b(time|season|weather|lighting)\b/;
const KIND_WEIGHT = { choice: 1.5, toggle: 1.5, color: 1.2, range: 0.7 };   // parts and kinds are noticed first, slider nudges last

// A colour control's own swatches were chosen by the sprite's author, so any of them is believable for what it paints
// (decision 2026-11-19; the material lock of engine/materials.js is for colours picked outside the swatches, which versions
// never do). A swatch is offered when it is far enough from the default to be seen at a glance (colourGap 0.045: about two
// times "just visible").
const COLOUR_GAP = 0.045;
const plausibleColour = (from, to) => colourGap(hexToRgb(from), hexToRgb(to)) >= COLOUR_GAP;

// the values worth trying for one control: every other option, the plausible colours, the far ends of a slider
function alternatives(sprite, key, def) {
  const d = sprite.params[key];
  if (d.kind === 'toggle') return [!def];
  if (d.kind === 'choice') return d.options.map((o) => o.value).filter((v) => v !== def);
  if (d.kind === 'color') return [...new Set(d.swatches.map(low))].filter((c) => c !== low(def) && plausibleColour(def, c));
  const span = d.max - d.min;
  return [d.min, d.max].map((v) => onStep(d, v)).filter((v) => Math.abs(v - def) >= 0.5 * span);
}

// every single change worth making, with how much it shows at card size: [{ key, value, impact, weight, part }]
function menuOf(sprite, dflt, base) {
  const keys = Object.keys(sprite.params);
  const still = keys.filter((k) => sprite.params[k].group !== 'Motion');   // a card is a still picture: motion does not show on it
  const out = [];
  for (const key of still.length ? still : keys) {
    for (const value of alternatives(sprite, key, dflt[key])) {
      const p = cleanParams(sprite, { ...dflt, [key]: value });
      if (!inEffect(sprite, key, p)) continue;
      let pic;
      try { pic = VERSION_RULES.picture(sprite, p); } catch { continue; }
      const impact = pictureDifference(base, pic);
      const kind = sprite.params[key].kind;
      if (impact < (kind === 'color' ? VERSION_RULES.colourArea : kind === 'range' ? VERSION_RULES.change : VERSION_RULES.partChange)) continue;
      const part = partOf(sprite, key);
      out.push({ key, value, impact, weight: impact * KIND_WEIGHT[sprite.params[key].kind], part: part ? part.name : null, words: phrase(sprite, key, value, dflt[key]), alone: WHOLE_SCENE.test(low(sprite.params[key].label)), late: paleSky(sprite, key, value) });
    }
  }
  return out;
}

const made = new WeakMap();   // sprite -> Map(seed -> { list, done }): a page asks for the same sprite's versions many times

/**
 * Named ready-made settings for a sprite: its own `versions` first (cleaned), then generated ones made of changes that show at card
 * size, that differ visibly from the defaults and from each other (VERSION_RULES). Returns up to n [{ name, params, made: 'hand' | 'generated' }];
 * fewer when the sprite cannot vary that much. sprite: from defineSprite; n: how many; seed: another seed gives other generated versions.
 */
export function versionsOf(sprite, n = 12, { seed = 0 } = {}) {
  const hand = cleanVersions(sprite).map((v) => ({ name: v.name, params: v.params, made: 'hand' }));
  if (n <= hand.length) return hand.slice(0, n).map(copy);
  let bySeed = made.get(sprite);
  if (!bySeed) made.set(sprite, (bySeed = new Map()));
  const want = n - hand.length;
  let memo = bySeed.get(seed);
  if (!memo || (memo.list.length < want && !memo.done)) {
    memo = generate(sprite, want, seed, hand);
    bySeed.set(seed, memo);
  }
  return [...hand, ...memo.list.slice(0, want)].map(copy);
}
const copy = (v) => ({ ...v, params: { ...v.params } });

function generate(sprite, want, seed, hand) {
  const dflt = defaultParams(sprite);
  const base = VERSION_RULES.picture(sprite, dflt);
  const menu = menuOf(sprite, dflt, base);
  const chosen = [base, ...hand.map((v) => VERSION_RULES.picture(sprite, v.params))];
  const names = new Set(hand.map((v) => nameKey(v.name.split(/,\s*/))));
  const seen = new Set([JSON.stringify(dflt), ...hand.map((v) => JSON.stringify(v.params))]);
  const list = [], leads = new Set();
  if (!menu.length) return { list, done: true };
  // every animation's first, middle and last frames may not touch a side of the frame that the defaults keep clear there
  const spots = Object.entries(sprite.clips).flatMap(([clip, c]) => [...new Set([0, Math.floor(c.frames / 2), c.frames - 1])].map((f) => [clip, f]));
  const clearAt = new Map();
  const staysInside = (p) => spots.every(([clip, f]) => {
    const key = `${clip}/${f}`;
    if (!clearAt.has(key)) clearAt.set(key, sidesTouched(renderPixels(sprite, clip, f, dflt)));
    let g;
    try { g = renderPixels(sprite, clip, f, p); } catch { return false; }
    return [...sidesTouched(g)].every((side) => clearAt.get(key).has(side));
  });
  const r = rng((hashText(sprite.id) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0);
  const total = menu.reduce((s, m) => s + m.weight, 0);
  const draw = (pool) => { let x = r() * pool.reduce((s, m) => s + m.weight, 0); for (const m of pool) if ((x -= m.weight) <= 0) return m; return pool[pool.length - 1]; };
  const tries = Math.max(40, want * VERSION_RULES.attempts);
  for (let i = 0; i < tries && list.length < want && total > 0; i++) {
    const roll = r(), k = roll < 0.35 ? 1 : roll < 0.85 ? 2 : 3;
    const picks = [];
    let pool = menu;
    for (let j = 0; j < k && pool.length; j++) {
      const m = draw(pool);
      picks.push(m);
      if (m.alone) break;
      // one change per control and per part, so a version never both takes a part off and recolours it
      pool = pool.filter((x) => x.key !== m.key && !x.alone && (!m.part || x.part !== m.part));
    }
    if (contradicts(picks.map((m) => m.words))) continue;
    if (list.length + hand.length < 3 && picks.some((m) => m.late)) continue;
    // what people notice first leads: a part, a kind or a large colour; a slider only joins one (a taller, shorter or
    // bigger version of the same picture reads as the default at card size)
    const lead = picks.filter((m) => sprite.params[m.key].kind !== 'range');
    if (!lead.length) continue;
    // and each version brings a lead of its own: "pink robe" and "tall, pink robe" are one version at card size
    const leadKey = lead.map((m) => `${m.key}=${m.value}`).sort().join('&');
    if (leads.has(leadKey)) continue;
    // a version that only adds to another's lead must add something that shows by itself ("orange frame, glass" next to
    // "orange frame" adds a faint sheen: one version)
    const items = lead.map((m) => `${m.key}=${m.value}`);
    if ([...leads].some((other) => { const o = other.split('&'); return o.every((x) => items.includes(x)) && lead.filter((m) => !o.includes(`${m.key}=${m.value}`)).every((m) => m.impact < VERSION_RULES.fromDefaults); })) continue;
    const p = cleanParams(sprite, Object.fromEntries([...Object.entries(dflt), ...picks.map((m) => [m.key, m.value])]));
    if (picks.some((m) => p[m.key] !== m.value || !inEffect(sprite, m.key, p))) continue;
    const key = JSON.stringify(p);
    if (seen.has(key)) continue;
    seen.add(key);
    let pic;
    try { pic = VERSION_RULES.picture(sprite, p); } catch { continue; }          // a setting that cannot be drawn is no version
    if (pictureDifference(base, pic) < VERSION_RULES.fromDefaults) continue;
    if (chosen.slice(1).some((c) => pictureDifference(c, pic) < VERSION_RULES.between)) continue;
    const words = pickPhrases([...picks].sort((a, b) => b.impact - a.impact));
    if (words.length !== picks.length || names.has(nameKey(words))) continue;    // a version holds only what its name says
    if (!staysInside(p)) continue;
    names.add(nameKey(words));
    leads.add(leadKey);
    chosen.push(pic);
    list.push({ name: capital(words.join(', ')), params: p, made: 'generated' });
  }
  return { list, done: list.length < want };
}

// ---- sounds and music --------------------------------------------------------------------------------------------

const SOUND_RULES = { least: 0.4, moved: 0.35 };   // generated: the controls moved, summed on their own scales (0..1 each), differ by 0.4+ from every other version; each changed control moves 0.35+

const soundPos = (d, v) => (d.options ? Number(v) : position(d, v));
const soundGap = (patch, a, b) => (patch.params ?? []).reduce((s, d) => s + (d.options ? (a[d.id] === b[d.id] ? 0 : 1) : Math.abs(position(d, a[d.id]) - position(d, b[d.id]))), 0);

// a value on a control's own scale at position u (0..1), snapped to its step or option
function soundValue(d, u) {
  const lo = Number(d.min), hi = Number(d.max);
  let v = d.scale === 'log' && lo > 0 ? lo * (hi / lo) ** u : lo + (hi - lo) * u;
  if (d.step) v = Number((lo + Math.round((v - lo) / d.step) * d.step).toFixed(decimals(d.step)));
  else v = Number(v.toPrecision(3));
  return Math.min(hi, Math.max(lo, v));
}

// how much a change of this kind of control is heard, against the others: an instrument, pitch and speed first, an amount last
const AUDIBLE = { pitch: 1.3, speed: 1.2, length: 1, brightness: 1, width: 0.9, size: 0.9, weight: 0.9, direction: 0.9, amount: 0.8 };
const audible = (d) => (d.options ? 1.5 : AUDIBLE[controlWords(d).measure] ?? 0.8);

function soundPhrase(d, value, base) {
  const label = low(d.label);
  if (d.options) return low(d.options[Math.round(value)] ?? d.label);
  const w = controlWords(d), up = value > base;
  if (w.measure === 'direction') return `${label} ${up ? w.ends[1] : w.ends[0]}`;
  const end = up ? w.ends[1] : w.ends[0];
  // "brighter", not "brighter brightness"; "longer", not "longer length"
  if (/^(length|duration|speed|size|weight|width|time)$/.test(label) || end.slice(0, 4) === label.slice(0, 4) || (w.measure === 'brightness' && /bright|dull/.test(label))) return end;
  if (end === 'less' && /[^s]s$/.test(label)) return `fewer ${label}`;   // "fewer sparks"
  return `${end} ${label}`;
}

/**
 * Named ready-made settings for a sound or music patch: one per style (preset) first, then seeded settings that move two or three
 * controls clearly. Returns up to n [{ name, params (every control), made: 'hand' | 'generated', style (the preset's name, or null) }].
 * patch: a sounds/<id>.json object; n: how many; seed: another seed gives other generated versions.
 */
export function soundVersionsOf(patch, n = 12, { seed = 0 } = {}) {
  const params = patch.params ?? [];
  const dflt = Object.fromEntries(params.map((d) => [d.id, d.default]));
  const out = Object.entries(patch.presets ?? {}).map(([name, set]) => ({ name, params: { ...dflt, ...set }, made: 'hand', style: name }));
  const names = new Set(out.map((v) => nameKey(v.name.split(/,\s*/))));
  const chosen = [dflt, ...out.map((v) => v.params)];
  const movable = params.filter((d) => Number(d.max) > Number(d.min));
  if (movable.length) {
    const r = rng((hashText(patch.id) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0);
    for (let i = 0; i < Math.max(40, n * 14) && out.length < n; i++) {
      // one or two controls: a sound's name leads with its one most audible change ("Higher pitch, more grit"), and a third
      // change makes a name that reads as a contradiction ("Longer, faster, less rise")
      const roll = r(), k = Math.min(movable.length, roll < 0.55 ? 2 : 1);
      const pool = [...movable], p = { ...dflt }, moved = [];
      for (let j = 0; j < k; j++) {
        const d = pool.splice(Math.floor(r() * pool.length), 1)[0];
        if (d.options) {
          const others = d.options.map((_, x) => x).filter((x) => x !== Math.round(dflt[d.id]));
          p[d.id] = others[Math.floor(r() * others.length)];
        } else {
          const at = soundPos(d, dflt[d.id]), gap = SOUND_RULES.moved;
          const up = 1 - at >= gap, down = at >= gap;
          if (!up && !down) continue;
          const goUp = up && (!down || r() < 0.5);
          p[d.id] = soundValue(d, goUp ? at + gap + (1 - at - gap) * r() : (at - gap) * r());
          if (Math.abs(soundPos(d, p[d.id]) - at) < gap * 0.8) { p[d.id] = dflt[d.id]; continue; }   // a step too coarse to move that far
        }
        moved.push(d);
      }
      if (!moved.length) continue;
      if (chosen.some((c) => soundGap(patch, c, p) < SOUND_RULES.least)) continue;
      // name: the controls that moved furthest first
      const ranked = moved.map((d) => ({ words: soundPhrase(d, p[d.id], dflt[d.id]), impact: (d.options ? 1 : Math.abs(soundPos(d, p[d.id]) - soundPos(d, dflt[d.id]))) * audible(d) })).sort((a, b) => b.impact - a.impact);
      const words = pickPhrases(ranked);
      if (words.length !== ranked.length || names.has(nameKey(words))) continue;   // a version holds only what its name says
      names.add(nameKey(words));
      chosen.push(p);
      out.push({ name: capital(words.join(', ')), params: p, made: 'generated', style: null });
    }
  }
  return out.slice(0, n);
}

/** True when a version name reads badly: a word said twice ("high hills, green hills"), or a part taken off and also changed ("no wings, tan wings"). For tests and checks. */
export function badVersionName(name) {
  const parts = low(name).split(/,\s*/);
  const content = parts.flatMap((p) => wordsIn(p)).filter((w) => !SMALL.has(w));
  if (new Set(content).size !== content.length) return 'a word is said twice';
  if (contradicts(parts)) return 'it takes a part off and also changes it';
  if (wordsIn(name).length > 4) return 'more than four words';
  // a word and its own measure: "brighter brightness", "duller brightness", "bouncy bounce"
  for (const ph of parts) { const w = wordsIn(ph); if (w.some((x, i) => w.some((y, j) => i !== j && x.length > 3 && y.length > 3 && x.slice(0, 4) === y.slice(0, 4))) || /\b(brighter|duller|darker|lighter) brightness\b/.test(ph)) return 'it echoes its own control'; }
  return null;
}
