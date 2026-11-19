// The Look tab of a sound's and a music track's page: the same named whole-set looks as a sprite's Look tab
// (engine/theme.js THEME_PRESETS; app/asset-look.js), each said in words of what is heard and played when chosen.
// A look is a setting like any other (app/bag.js lookOf: `settings.look`): choosing one saves it with the sound in the
// bag, where it then keeps it whatever look the rest of the bag takes; "Follows the bag" takes it off again. The page
// plays and downloads the sound in it, and its link carries it (`artlook=<id>`, as a sprite's does).
// Nothing here runs at load time, so the words and the settings can be checked outside a browser
// (tests/unit/sound-look.test.mjs).
import { THEME_PRESETS } from '../engine/theme.js';
import { themedSoundParams, soundSettingsFor, dullCutoff } from '../sound/theme.js';
import { bag } from './bag.js';

const isMusic = (patch) => patch.category === 'music';
const has = (patch, id) => (patch.params ?? []).some((d) => d.id === id);

/** A named look's theme by its id; null for none, for "original" and for anything unknown. */
export function lookTheme(id) {
  if (!id || id === 'original') return null;
  return THEME_PRESETS.find((p) => p.id === id)?.theme ?? null;
}

/**
 * What a sound is heard with in a look: { params, sound }. params are the settings to render it with; sound is what
 * to hand applySound afterwards (pitch and brightness), or null when there is no look and nothing is applied.
 */
export function heardIn(patch, params, id) {
  const t = lookTheme(id);
  if (!t) return { params, sound: null };
  return { params: themedSoundParams(patch, params, t), sound: soundSettingsFor(patch, t) };
}

/**
 * A look's brightness as filters on a live sound (a music track playing while its sliders move): the same filters
 * applySound (sound/theme.js) runs on a rendered one, as Web Audio IIR filter coefficients, [{ feedforward, feedback }].
 * Duller: two one-pole low-passes at the same corner. Brighter: the part above the corner added back, 2x brightness
 * times. `typical`: the sound's typical frequency (typicalHz); 0 while it is not known yet. Empty for no brightness.
 * (The extra harmonics applySound adds to a near-pure tone are left out: a track has enough above its corner.)
 */
export function liveBrightness(brightness, sampleRate, typical = 0) {
  const b = Math.max(-1, Math.min(1, Number(brightness) || 0));
  if (!b) return [];
  const pole = (hz) => Math.exp((-2 * Math.PI * hz) / sampleRate);
  if (b < 0) {
    const a = pole(dullCutoff(-b, typical));
    const lp = { feedforward: [1 - a], feedback: [1, -a] };
    return [lp, { ...lp }];
  }
  const a = pole(Math.min(Math.max(1500, typical), 12000)), k = 2 * b;
  return [{ feedforward: [1 + k * a, -(1 + k) * a], feedback: [1, -a] }];
}
/** Run filters from liveBrightness over samples, as the browser's IIR filters do. */
export function filterOffline(x, coefs) {
  let y = Float32Array.from(x);
  for (const { feedforward: ff, feedback: fb } of coefs) {
    const out = new Float32Array(y.length);
    let x1 = 0, y1 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = (ff[0] * y[i] + (ff[1] ?? 0) * x1 - (fb[1] ?? 0) * y1) / fb[0];
      x1 = y[i]; y1 = v; out[i] = v;
    }
    y = out;
  }
  return y;
}
/** The gain that keeps the filtered sound as loud as it was (as applySound does: matched loudness, at most 8x). */
export function matchGain(channels, coefs) {
  let si = 0, so = 0;
  for (const c of channels) { const f = filterOffline(c, coefs); for (let i = 0; i < c.length; i++) { si += c[i] * c[i]; so += f[i] * f[i]; } }
  return so > 1e-12 ? Math.min(8, Math.sqrt(si / so)) : 1;
}

/** What a look does to this sound, in a few everyday words ("Higher and brighter", "Slower, in a lower key and calmer"). */
export function lookWords(patch, look) {
  const t = look?.theme;
  if (!t || look.id === 'original') return 'As it was made';
  const { pitch, brightness } = soundSettingsFor(patch, t);
  const words = [];
  if (isMusic(patch)) {
    const tempo = Number(t.music?.tempo ?? 1);
    if (has(patch, 'bpm') && tempo > 1) words.push('faster');
    if (has(patch, 'bpm') && tempo < 1) words.push('slower');
    const semis = Math.round(Number(t.sound?.pitch) || 0);
    if (has(patch, 'key') && semis > 0) words.push('in a higher key');
    if (has(patch, 'key') && semis < 0) words.push('in a lower key');
    const calm = t.music?.intensity;
    if (has(patch, 'intensity') && calm !== null && calm !== undefined) words.push(calm < 0.7 ? 'calmer' : 'livelier');
  } else {
    if (pitch > 0) words.push('higher');
    if (pitch < 0) words.push('lower');
  }
  if (brightness >= 0.2) words.push('brighter');
  else if (brightness > 0) words.push('a little brighter');
  else if (brightness <= -0.2) words.push('softer');
  else if (brightness < 0) words.push('a little softer');
  if (!words.length) return 'As it was made';
  const said = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
  return said[0].toUpperCase() + said.slice(1);
}

// the same words as a sprite's Look tab and the Look tab beside the bag (app/asset-look.js LOOK_NOTE, FOLLOWS)
const NOTE = 'A look for this one thing. It keeps it whatever look the rest of your bag takes.';
const FOLLOWS = 'Follows the bag';

function make(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (k === 'onclick') n.addEventListener('click', v); else if (k === 'class') n.className = v; else n.setAttribute(k, v);
  n.append(...kids.flat().filter((k) => k !== null && k !== undefined));
  return n;
}

/**
 * soundLookTab({ patch, now, pick, say }) -> { node, sync(), changed() }
 *   now()      the id of the sound's own look (null: it follows the bag)
 *   pick(id)   the visitor chose a look (null for "Follows the bag"); the page saves it and plays the sound in it
 *   say(text)  say something under the panel's footer
 */
export function soundLookTab({ patch, now, pick, say = () => {} }) {
  const looks = [{ id: '', name: FOLLOWS, blurb: 'No look of its own: in your bag it takes whatever look the bag has.', theme: null }, ...THEME_PRESETS];
  const grid = make('div', { class: 'looks sound-looks', role: 'group', 'aria-label': 'Its own look' },
    looks.map((look) => make('button', { type: 'button', class: 'vbtn', 'data-look': look.id, 'aria-pressed': 'false', title: look.theme ? lookWords(patch, look) : look.blurb, onclick: () => pick(look.id || null) },
      make('span', { class: 'name' }, look.name),
      make('span', { class: 'what' }, look.theme ? lookWords(patch, look) : 'Takes the bag’s look'))));
  const useBtn = make('button', { type: 'button', class: 'btn btn-sm btn-secondary', 'data-act': 'look-to-bag', onclick: () => {
    const look = THEME_PRESETS.find((p) => p.id === now()) ?? THEME_PRESETS[0];
    bag.setTheme(look.theme);
    say(look.id === 'original' ? 'Your bag is back to the original look.' : `Everything in your bag now has the ${look.name} look. You can change it in your bag.`);
  } }, 'Use this look for my whole bag');
  const node = make('div', { class: 'look-tab' }, make('p', { class: 'pane-note look-note' }, NOTE), grid, make('p', { class: 'look-acts' }, useBtn));
  const sync = () => { const id = now() ?? ''; for (const b of grid.children) b.setAttribute('aria-pressed', String(b.dataset.look === id)); };
  sync();
  return { node, sync, changed: () => !!now() };
}
