// What the editing panel (app/panel.js) shows for one asset: its controls sorted into the Fine-tune tabs, each with its
// value, its usual value, whether it is changed and whether it is in effect, and how a version, Surprise me and a reset
// change the settings. One model per kind of asset, the same shape for all, so the panel draws them alike.
// No page here (tests/unit/site-panel-model.test.mjs).
//
//   model = spriteModel(sprite) | soundModel(patch)
//   model.tabs                          [{ id, label }]: the tabs this asset has controls for, in order
//   model.controls(settings)            [{ key, tab, label, kind, value, def, changed, shown, part, partLabel, main, partOff, ... }]
//       kind 'range'  + min, max, step, lo, hi, valueText (a sound's value in everyday words)
//       kind 'choice' + options [{ value, label }]      kind 'color' + swatches      kind 'toggle'
//   model.set(settings, key, value)     -> new settings      model.reset(settings, key) -> new settings
//   model.changedTabs(settings)         -> Set of tab ids with something changed in them
//   model.surprise(settings, seed)      -> new settings      model.applyVersion(settings, version) -> new settings
//   model.isVersion(settings, version)  -> is this version what is on screen?
import { defaultParams, cleanParams, randomParams, inEffect, partList, partRemoved } from '../engine/sprite.js';
import { shownValue, controlWords } from '../sound/words.js';
import { isChoice, choicesOf, toValue, toUnit, snap } from './sound-params.js';
import { PAIRS } from '../sound/pairs.js';

/** The Fine-tune tabs of a sprite, in order. Sounds and Look hold no controls of the sprite: the page fills them. */
export const SPRITE_TABS = [
  { id: 'shape', label: 'Shape' }, { id: 'parts', label: 'Parts' }, { id: 'colours', label: 'Colours' },
  { id: 'motion', label: 'Motion' }, { id: 'sounds', label: 'Sounds' }, { id: 'look', label: 'Look' },
];
/** The Fine-tune tabs of a sound or a track. */
export const SOUND_TABS = [{ id: 'tone', label: 'Tone' }, { id: 'timing', label: 'Timing' }, { id: 'character', label: 'Character' }];

const sameValue = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);
const withTabs = (all, list) => all.filter((t) => list.some((c) => c.tab === t.id));
const changedTabs = (list) => new Set(list.filter((c) => c.changed && c.shown).map((c) => c.tab));

/**
 * Which tab a sprite's control is in: a colour in Colours (also a part's colour), anything else of a part in Parts,
 * the Motion group in Motion, the rest (the sprite's build) in Shape.
 */
export function spriteTabOf(sprite, key) {
  const d = sprite.params[key];
  if (d.kind === 'color') return 'colours';
  if (partList(sprite).some((part) => part.params.includes(key))) return 'parts';
  return d.group === 'Motion' ? 'motion' : 'shape';
}

export function spriteModel(sprite) {
  const def = defaultParams(sprite), parts = partList(sprite);
  const partOfKey = (key) => parts.find((part) => part.params.includes(key)) ?? null;
  // a part's block keeps its controls together, the one that picks the part first; everything else in the sprite's own order
  const order = Object.keys(sprite.params).map((key, i) => { const part = partOfKey(key); return { key, at: part ? Object.keys(sprite.params).indexOf(part.selector) + (key === part.selector ? 0 : 0.5) : i, i }; })
    .sort((a, b) => a.at - b.at || a.i - b.i).map((o) => o.key);
  const controls = (settings) => order.map((key) => {
    const d = sprite.params[key], part = partOfKey(key), value = settings.params[key];
    const main = !!part && key === part.selector;
    return {
      key, tab: spriteTabOf(sprite, key), kind: d.kind, value, def: def[key],
      // the control that picks a part is named after the part ("Weapon"); a part's colour says whose it is ("Hair colour")
      label: main ? part.label : d.kind === 'color' && part && /^colou?r$/i.test(d.label) ? `${part.label} colour` : d.label,
      changed: !sameValue(value, def[key]), shown: inEffect(sprite, key, settings.params),
      part: part ? part.name : null, partLabel: part ? part.label : null, main,
      partOff: !!part && partRemoved(sprite, part.name, settings.params),      // the part is taken off (its selector says none)
      ...(d.kind === 'range' ? { min: d.min, max: d.max, step: d.step, lo: d.lo ?? '', hi: d.hi ?? '' } : {}),
      ...(d.kind === 'choice' ? { options: d.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
      ...(d.kind === 'color' ? { swatches: [...d.swatches] } : {}),
    };
  });
  const put = (settings, params) => ({ ...settings, params });
  // nothing hidden is left changed: a control that ends up not in effect goes back to its usual value
  const tidy = (p) => {
    for (let pass = 0, again = true; again && pass < 8; pass++) {
      again = false;
      for (const k of Object.keys(p)) if (p[k] !== def[k] && !inEffect(sprite, k, p)) { p[k] = def[k]; again = true; }
    }
    return p;
  };
  const model = {
    kind: 'sprite', tabs: withTabs(SPRITE_TABS, controls({ params: def })),
    controls,
    set: (settings, key, value) => put(settings, { ...settings.params, [key]: value }),
    reset: (settings, key) => put(settings, { ...settings.params, [key]: def[key] }),
    changedTabs: (settings) => changedTabs(controls(settings)),
    surprise: (settings, seed = Math.floor(Math.random() * 1e9)) => put(settings, tidy(randomParams(sprite, seed))),
    applyVersion: (settings, version) => put(settings, cleanParams(sprite, { ...def, ...(version.params ?? {}) })),
    isVersion(settings, version) {
      const want = cleanParams(sprite, { ...def, ...(version.params ?? {}) });
      return Object.keys(def).every((k) => sameValue(settings.params[k], want[k]) || (!inEffect(sprite, k, settings.params) && !inEffect(sprite, k, want)));
    },
  };
  return model;
}

/** Which tab a sound's control is in, by what it measures: how it sounds (Tone), how long and how fast (Timing), the rest (Character). */
export function soundTabOf(d) {
  const measure = controlWords(d)?.measure;
  if (measure === 'pitch' || measure === 'brightness' || measure === 'direction') return 'tone';
  if (measure === 'length' || measure === 'speed') return 'timing';
  return 'character';
}

export function soundModel(patch) {
  const defs = patch.params ?? [];
  const clamp = (d, v) => Math.min(d.max, Math.max(d.min, snap(d, Number(v))));
  const own = (style) => { const p = { ...Object.fromEntries(defs.map((d) => [d.id, d.default])), ...((style && patch.presets && patch.presets[style]) || {}) }; for (const d of defs) p[d.id] = clamp(d, p[d.id]); return p; };
  const def = own(null);
  const controls = (settings) => defs.map((d) => {
    const value = settings.params[d.id] ?? def[d.id], choice = isChoice(d);
    const words = controlWords(d);
    return {
      key: d.id, tab: soundTabOf(d), label: d.label, kind: choice ? 'choice' : 'range', def: choice ? def[d.id] : toUnit(d, def[d.id]),
      value: choice ? value : toUnit(d, value), changed: !sameValue(value, def[d.id]), shown: true, part: null, partLabel: null, main: false,
      ...(choice ? { options: choicesOf(d) } : { min: 0, max: 1, step: 0.005, lo: words?.ends?.[0] ?? '', hi: words?.ends?.[1] ?? '', valueText: shownValue(d, value) }),
    };
  });
  const byId = Object.fromEntries(defs.map((d) => [d.id, d]));
  const put = (settings, params, more = {}) => ({ ...settings, ...more, params });
  // A track's choices (how long it is, which instrument leads) are the visitor's own arrangement: a style changes the
  // sliders and keeps them, unless the version names one itself; Surprise me keeps the length. A sound has none of this.
  const music = patch.category === 'music';
  const kept = (settings, version) => (music ? Object.fromEntries(defs.filter((d) => isChoice(d) && !(version.params && d.id in version.params) && settings.params?.[d.id] !== undefined).map((d) => [d.id, settings.params[d.id]])) : {});
  const lengths = (settings) => (music ? Object.fromEntries(defs.filter((d) => d.step && !d.options && settings.params?.[d.id] !== undefined).map((d) => [d.id, settings.params[d.id]])) : {});
  // The classic pairs of a track that has the choices for them: a melody instrument and an instrument that plays along
  // (sound/pairs.js), each as the two values to set together. A track without `along` (or with other names) has none.
  const pairs = music && byId.inst?.options && byId.along?.options
    ? PAIRS.filter((q) => byId.inst.options.includes(q.inst) && byId.along.options.includes(q.along))
      .map((q) => ({ label: q.label, params: { inst: byId.inst.options.indexOf(q.inst), along: byId.along.options.indexOf(q.along) } }))
    : [];
  return {
    kind: patch.category === 'music' ? 'music' : 'sound', tabs: withTabs(SOUND_TABS, controls({ params: def })),
    controls,
    pairs,
    setPair: (settings, pair) => put(settings, { ...settings.params, ...pair.params }),
    pairOn: (settings, pair) => Object.entries(pair.params).every(([k, v]) => (settings.params[k] ?? def[k]) === v),
    // a slider hands in its place from 0 to 1, a choice its own value
    set: (settings, key, value) => put(settings, { ...settings.params, [key]: isChoice(byId[key]) ? clamp(byId[key], value) : toValue(byId[key], Number(value)) }),
    reset: (settings, key) => put(settings, { ...settings.params, [key]: def[key] }),
    changedTabs: (settings) => changedTabs(controls(settings)),
    surprise(settings, seed) {
      let s = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
      const r = () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return ((s ^ (s >>> 13)) >>> 0) / 4294967296; };
      return put(settings, { ...Object.fromEntries(defs.map((d) => [d.id, toValue(d, r())])), ...lengths(settings) }, { style: null });
    },
    applyVersion: (settings, version) => put(settings, Object.fromEntries(Object.entries({ ...own(version.style ?? null), ...(version.params ?? {}), ...kept(settings, version) }).filter(([k]) => byId[k]).map(([k, v]) => [k, clamp(byId[k], v)])), { style: version.style ?? null }),
    isVersion(settings, version) {
      const want = { ...own(version.style ?? null), ...(version.params ?? {}), ...kept(settings, version) };
      return defs.every((d) => sameValue(settings.params[d.id], clamp(d, want[d.id])));
    },
  };
}
