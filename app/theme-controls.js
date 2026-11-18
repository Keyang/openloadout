// One block of controls for the look of a whole bundle or bag (architecture.md Contract 7; features EDIT-6).
// Used by the bundle page (#/bundle/<id>) and the bag page (#/bag).
//
//   const look = themeControls({ theme, onChange: (theme) => ..., original, live });
//   page.append(look.node);  look.set(otherTheme);  look.get();
//
// The pure helpers at the top (the look in the address bar, colour previews, fast
// recolouring of a picture) have no DOM and run in Node for the unit tests; only
// themeControls() touches `document`, and only when it is called.
import { defaultTheme, normalizeTheme, randomTheme, applyColour, THEME_PRESETS, PALETTES } from '../engine/theme.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- the look in the address bar ------------------------------------------------------
// The shortest description wins: nothing for the original look, `look=frost` for a named
// look, `surprise=<number>` for a "Surprise me" look, then only what differs from that.
// Numbers are written so they read back exactly (including -0), so a link reproduces the
// look bit for bit.

const numText = (v) => (Object.is(v, -0) ? '-0' : String(v));
const hexText = (v) => v.replace(/^#/, '');
const HEX = /^[0-9a-f]{3}([0-9a-f]{3})?$/i;
const paletteNamed = (name) => PALETTES.find((p) => p.name.toLowerCase() === String(name).toLowerCase())?.name ?? null;

const num = (lo, hi) => ({
  write: (v) => numText(v),
  read: (s) => { const v = Number(s); return s === '' || !Number.isFinite(v) ? undefined : clampTo(v, lo, hi); },
});
const optional = (inner) => ({
  write: (v) => (v === null || v === undefined ? 'none' : inner.write(v)),
  read: (s) => (s === 'none' ? null : inner.read(s)),
});
const hex = {
  write: (v) => hexText(v),
  read: (s) => (HEX.test(s) ? '#' + s : undefined),
};
const palette = {
  write: (v) => (Array.isArray(v) ? v.map(hexText).join('-') : v),
  read: (s) => {
    const named = paletteNamed(s);
    if (named) return named;
    const list = s.split('-');
    return list.length && list.every((h) => /^[0-9a-f]{6}$/i.test(h)) ? list.map((h) => '#' + h) : undefined;
  },
};
const seedCodec = {
  write: (v) => numText(v),
  read: (s) => { const v = Number(s); return /^\d{1,10}$/.test(s) && v <= 2 ** 31 - 1 ? v : undefined; },
};

// [address key, where it lives in the theme, how it is written]
const FIELDS = [
  ['shift', ['colour', 'hue'], num(-360, 360)],
  ['colourful', ['colour', 'saturation'], num(0, 4)],
  ['contrast', ['colour', 'contrast'], num(0, 4)],
  ['tint', ['colour', 'tint'], optional(hex)],
  ['tintStrength', ['colour', 'tintAmount'], num(0, 1)],
  ['colours', ['colour', 'palette'], optional(palette)],
  ['outline', ['colour', 'outline'], optional(hex)],
  ['pitch', ['sound', 'pitch'], num(-24, 24)],
  ['bright', ['sound', 'brightness'], num(-1, 1)],
  ['speed', ['music', 'tempo'], num(0.25, 4)],
  ['intensity', ['music', 'intensity'], optional(num(0, 1))],
  ['seed', ['seed'], seedCodec],
];
const getAt = (t, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), t);
const setAt = (t, path, v) => { const last = path[path.length - 1]; path.slice(0, -1).reduce((o, k) => o[k], t)[last] = v; };
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Object.is(a, b) : JSON.stringify(a) === JSON.stringify(b));
const sameLook = (a, b) => same(a.colour, b.colour) && same(a.sound, b.sound) && same(a.music, b.music);

const presetById = (id) => THEME_PRESETS.find((p) => p.id === id) ?? null;

/** The named look (id from THEME_PRESETS) whose colours, sound and music this theme has, or null. Ignores `shapes` and `seed`. */
export function matchPreset(theme) {
  const t = normalizeTheme(theme);
  return THEME_PRESETS.find((p) => sameLook(normalizeTheme(p.theme), t))?.id ?? null;
}

/** True when the theme is exactly what "Surprise me" gives for its seed. */
export function isSurprise(theme) {
  const t = normalizeTheme(theme);
  return Number.isInteger(t.seed) && t.seed >= 1 && same(normalizeTheme(randomTheme(t.seed, { shapes: t.shapes })), t);
}

const diffs = (t, base) => FIELDS.filter(([, path]) => !same(getAt(t, path), getAt(base, path)));

/** The look as address-bar fields: {} for the original look, { look }, { surprise[, shapes] }, plus what differs. */
export function themeToQuery(theme) {
  const t = normalizeTheme(theme);
  const options = [{ q: {}, base: defaultTheme() }];
  for (const p of THEME_PRESETS) if (p.id !== 'original') options.push({ q: { look: p.id }, base: normalizeTheme(p.theme) });
  if (Number.isInteger(t.seed) && t.seed >= 1) options.push({ q: { surprise: String(t.seed) }, base: normalizeTheme(randomTheme(t.seed, { shapes: t.shapes })) });
  let best = null;
  for (const o of options) {
    const d = diffs(t, o.base);
    if (!best || d.length < best.d.length) best = { ...o, d };
  }
  const q = { ...best.q };
  for (const [key, path, codec] of best.d) q[key] = codec.write(getAt(t, path));
  if (t.shapes) q.shapes = '1';
  return q;
}

/** The theme a set of address-bar fields describes. Unknown or damaged values are ignored; it never throws. */
export function themeFromQuery(query) {
  const q = query && typeof query === 'object' ? query : {};
  const str = (k) => (Object.prototype.hasOwnProperty.call(q, k) && typeof q[k] === 'string' ? q[k] : null);
  const shapes = str('shapes') === '1';
  let t = defaultTheme();
  const surprise = str('surprise') !== null ? seedCodec.read(str('surprise')) : undefined;
  if (surprise !== undefined && surprise >= 1) t = normalizeTheme(randomTheme(surprise, { shapes }));
  else if (str('look') !== null && presetById(str('look'))) t = normalizeTheme(presetById(str('look')).theme);
  for (const [key, path, codec] of FIELDS) {
    const s = str(key);
    if (s === null) continue;
    const v = codec.read(s);
    if (v !== undefined) setAt(t, path, v);
  }
  t.shapes = shapes;
  return normalizeTheme(t);
}

/** The look as the text after '?' (no '?'); empty for the original look. */
export const lookSearch = (theme) => new URLSearchParams(themeToQuery(theme)).toString();

/** True when an address query says anything about the look. */
export const queryHasLook = (query) => !!query && ['look', 'surprise', 'shapes', ...FIELDS.map((f) => f[0])].some((k) => typeof query[k] === 'string');

/** A new "Surprise me" number, never the same as `previous`. */
export function newSeed(previous = 0) {
  let s;
  do s = 1 + Math.floor(Math.random() * 999999); while (s === previous);
  return s;
}

// ---- colour previews -------------------------------------------------------------------------

// Colours most sprites have (skin, red cloth, blue cloth, leaves, gold), so a look's
// preview shows what it does to a typical character.
const SAMPLE = ['#e8b796', '#c9423a', '#4f7fe0', '#6cc06a', '#ffcf3f'];

/** Five '#rrggbb' colours: the sample colours under this theme. */
export function previewSwatches(theme) {
  const t = normalizeTheme(theme);
  const bytes = new Uint8ClampedArray(SAMPLE.length * 4);
  SAMPLE.forEach((h, i) => { for (let c = 0; c < 3; c++) bytes[i * 4 + c] = parseInt(h.slice(1 + c * 2, 3 + c * 2), 16); bytes[i * 4 + 3] = 255; });
  applyColour(bytes, t.colour);
  return SAMPLE.map((_, i) => '#' + [0, 1, 2].map((c) => bytes[i * 4 + c].toString(16).padStart(2, '0')).join(''));
}

// ---- recolouring a picture quickly ----------------------------------------------------------------
// A sprite picture holds a few dozen colours. Work each one out once per look,
// then paint the picture from that list: the same result as applyColour on every
// pixel, many times faster when a look changes.

/** RGBA bytes -> { idx (one entry per pixel), colours (Uint32Array, distinct values in the bytes' own order) }. */
export function indexPixels(bytes) {
  const src = bytes.byteOffset % 4 === 0 ? new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length >> 2) : new Uint32Array(new Uint8Array(bytes).buffer);
  const map = new Map(), list = [];
  const idx = new Uint32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    let k = map.get(v);
    if (k === undefined) { k = list.length; map.set(v, k); list.push(v); }
    idx[i] = k;
  }
  return { idx: list.length <= 65536 ? Uint16Array.from(idx) : idx, colours: Uint32Array.from(list) };
}

/** New RGBA bytes: the indexed picture under these colour settings (Contract 7 `colour`). */
export function recolourIndexed(indexed, colour) {
  const themed = applyColour(indexed.colours.slice(), colour);
  const out = new Uint32Array(indexed.idx.length);
  for (let i = 0; i < out.length; i++) out[i] = themed[indexed.idx[i]];
  return new Uint8ClampedArray(out.buffer);
}

// ---- the controls ---------------------------------------------------------------------------------

const TINTS = [['#ffb040', 'Amber'], ['#ff7a5a', 'Coral'], ['#ffc040', 'Gold'], ['#e8d8b0', 'Old photo'], ['#7ae0c0', 'Mint'], ['#5aa8ff', 'Sky'], ['#6a4ac0', 'Purple'], ['#ff8ac8', 'Pink']];
const OUTLINES = [['#000000', 'Black'], ['#1a1020', 'Plum'], ['#2a1a10', 'Brown'], ['#0e1a2a', 'Navy'], ['#2a0e1a', 'Wine'], ['#102014', 'Pine'], ['#0a0612', 'Night']];

let uid = 0;

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c);
  return n;
}

const pct = (v) => `${Math.round(v * 100)}%`;
const signed = (v, unit = '') => (v === 0 ? 'None' : `${v > 0 ? '+' : '−'}${Math.abs(v)}${unit}`);

/**
 * The look controls. Every change calls onChange(theme) with a complete theme (a copy).
 * theme: the look to show first. original: what "Start over" goes back to (default: the plain original).
 * live (default true): sliders report while they move; false reports when they are let go
 * (for pages that rebuild themselves on every change). open (default true): the fine-tuning starts unfolded.
 * Returns { node, set(theme) (shows a look without calling onChange), get() }.
 */
export function themeControls({ theme, onChange = () => {}, original = defaultTheme(), live = true, open = true } = {}) {
  let cur = normalizeTheme(theme);
  const start = normalizeTheme(original);
  const id = `look${++uid}`;
  const syncs = [];
  const emit = () => { sync(); onChange(clone(cur)); };
  const sync = () => { for (const s of syncs) s(); };

  // named looks
  const presetButtons = THEME_PRESETS.map((p) => {
    const b = h('button', { type: 'button', class: 'look-preset', title: p.blurb, 'aria-pressed': 'false' },
      h('span', { class: 'look-chips', 'aria-hidden': 'true' }, previewSwatches(p.theme).map((c) => h('i', { style: `background:${c}` }))),
      h('span', { class: 'look-name' }, p.name));
    b.addEventListener('click', () => {
      const t = normalizeTheme(p.theme);
      cur = { ...t, seed: cur.seed, shapes: cur.shapes };
      emit();
    });
    syncs.push(() => b.setAttribute('aria-pressed', String(matchPreset(cur) === p.id)));
    return b;
  });

  // Surprise me, shapes, Start over
  const shapes = h('input', { type: 'checkbox', role: 'switch' });
  shapes.addEventListener('change', () => { cur = { ...cur, shapes: shapes.checked }; emit(); });
  syncs.push(() => { shapes.checked = !!cur.shapes; });
  const surprise = h('button', { type: 'button', class: 'btn look-surprise' }, 'Surprise me');
  surprise.addEventListener('click', () => {
    let seed = cur.seed, next;
    for (let i = 0; i < 20; i++) {   // a new look each press: skip the rare number that gives the same colours
      seed = newSeed(seed);
      next = normalizeTheme(randomTheme(seed, { shapes: shapes.checked }));
      if (!same(next.colour, cur.colour)) break;
    }
    cur = next;
    emit();
  });
  const reset = h('button', { type: 'button', class: 'ghost look-reset' }, 'Start over');
  reset.addEventListener('click', () => { cur = clone(start); emit(); });

  // sliders
  function slider({ label, min, max, step, lo, hi, get, put, show, extra }) {
    const fid = `${id}-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    const input = h('input', { type: 'range', id: fid, min, max, step });
    const out = h('output', { class: 'look-value', for: fid });
    const report = () => { put(Number(input.value)); emit(); };
    input.addEventListener('input', () => { put(Number(input.value)); if (live) emit(); else { out.textContent = show(get()); } });
    if (!live) input.addEventListener('change', report);
    syncs.push(() => {
      const v = get();
      input.value = String(clampTo(Number(v ?? (min + max) / 2), min, max));
      out.textContent = show(v);
    });
    return h('div', { class: 'field look-field' },
      h('div', { class: 'look-head' }, h('label', { for: fid }, label), out, extra ?? null),
      h('div', { class: 'slider' }, h('span', { class: 'end' }, lo), input, h('span', { class: 'end' }, hi)));
  }

  // swatch choices (tint, outline)
  function swatches(label, list, noneLabel, get, put) {
    const btns = [[null, noneLabel], ...list].map(([c, name]) => {
      const b = h('button', { type: 'button', class: 'swatch' + (c ? '' : ' look-none'), 'aria-label': `${label}: ${name}`, title: name, 'aria-pressed': 'false', style: c ? `--c:${c}` : null });
      b.addEventListener('click', () => { put(c); emit(); });
      syncs.push(() => b.setAttribute('aria-pressed', String((get() ?? null) === c)));
      return b;
    });
    return h('div', { class: 'field look-field' }, h('span', { class: 'look-label', id: `${id}-${label.replace(/\W+/g, '')}` }, label),
      h('div', { class: 'swatches', role: 'group', 'aria-labelledby': `${id}-${label.replace(/\W+/g, '')}` }, btns));
  }

  // colour set
  const setId = `${id}-colour-set`;
  const colourSet = h('select', { id: setId },
    h('option', { value: '' }, 'Their own colours'),
    PALETTES.map((p) => h('option', { value: p.name }, p.name)));
  colourSet.addEventListener('change', () => { cur.colour = { ...cur.colour, palette: colourSet.value || null }; emit(); });
  syncs.push(() => { colourSet.value = typeof cur.colour.palette === 'string' ? (PALETTES.find((p) => p.name === cur.colour.palette)?.name ?? '') : ''; });

  const C = (k) => () => cur.colour[k];
  const setC = (k) => (v) => { cur.colour = { ...cur.colour, [k]: v }; };
  const asMade = h('button', { type: 'button', class: 'ghost look-asmade' }, 'As made');
  asMade.addEventListener('click', () => { cur.music = { ...cur.music, intensity: null }; emit(); });
  syncs.push(() => { asMade.hidden = cur.music.intensity === null || cur.music.intensity === undefined; });

  const colourGroup = h('fieldset', { class: 'look-group' }, h('legend', {}, 'Colours'),
    slider({ label: 'Colour shift', min: -180, max: 180, step: 5, lo: 'One way', hi: 'Other way', get: C('hue'), put: setC('hue'), show: (v) => signed(v) }),
    slider({ label: 'Colourfulness', min: 0, max: 2, step: 0.05, lo: 'Grey', hi: 'Bold', get: C('saturation'), put: setC('saturation'), show: pct }),
    slider({ label: 'Contrast', min: 0.5, max: 1.5, step: 0.05, lo: 'Soft', hi: 'Strong', get: C('contrast'), put: setC('contrast'), show: pct }),
    h('div', { class: 'field look-field' }, h('label', { for: setId }, 'Colour set'), colourSet),
    swatches('Tint', TINTS, 'No tint', C('tint'), (c) => { cur.colour = { ...cur.colour, tint: c, tintAmount: c && !cur.colour.tintAmount ? 0.3 : c ? cur.colour.tintAmount : 0 }; }),
    slider({ label: 'Tint strength', min: 0, max: 1, step: 0.05, lo: 'None', hi: 'Full', get: C('tintAmount'), put: setC('tintAmount'), show: pct }),
    swatches('Outline colour', OUTLINES, 'As made', C('outline'), setC('outline')));
  const soundGroup = h('fieldset', { class: 'look-group' }, h('legend', {}, 'Sound effects'),
    slider({ label: 'Pitch', min: -12, max: 12, step: 1, lo: 'Lower', hi: 'Higher', get: () => cur.sound.pitch, put: (v) => { cur.sound = { ...cur.sound, pitch: v }; }, show: (v) => (v === 0 ? 'As made' : `${Math.abs(v)} note${Math.abs(v) === 1 ? '' : 's'} ${v > 0 ? 'up' : 'down'}`) }),
    slider({ label: 'Brightness', min: -1, max: 1, step: 0.05, lo: 'Duller', hi: 'Brighter', get: () => cur.sound.brightness, put: (v) => { cur.sound = { ...cur.sound, brightness: v }; }, show: (v) => (v === 0 ? 'As made' : signed(Math.round(v * 100), '%')) }));
  const musicGroup = h('fieldset', { class: 'look-group' }, h('legend', {}, 'Music'),
    slider({ label: 'Speed', min: 0.5, max: 1.5, step: 0.05, lo: 'Slower', hi: 'Faster', get: () => cur.music.tempo, put: (v) => { cur.music = { ...cur.music, tempo: v }; }, show: pct }),
    slider({ label: 'Intensity', min: 0, max: 1, step: 0.05, lo: 'Calm', hi: 'Intense', get: () => cur.music.intensity, put: (v) => { cur.music = { ...cur.music, intensity: v }; }, show: (v) => (v === null || v === undefined ? 'As made' : pct(v)), extra: asMade }));

  const node = h('section', { class: 'look-controls', 'aria-label': 'The look of everything together' },
    h('h2', { class: 'look-title' }, 'Pick a look'),
    h('p', { class: 'hint look-hint' }, 'One choice restyles every sprite, sound and track together, so they still match.'),
    h('div', { class: 'look-presets' }, presetButtons),
    h('div', { class: 'look-row' }, surprise,
      h('label', { class: 'look-toggle' }, h('span', {}, 'Also change shapes'), h('span', { class: 'switch' }, shapes, h('span', { class: 'knob', 'aria-hidden': 'true' }))),
      reset),
    h('details', { class: 'look-more', open: !!open }, h('summary', {}, 'Fine-tune colours, sound and music'), colourGroup, soundGroup, musicGroup));
  sync();
  return {
    node,
    set(t) { cur = normalizeTheme(t); sync(); },
    get: () => clone(cur),
  };
}
