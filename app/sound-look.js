// The Look tab of a sound's and a music track's page: the same named whole-set looks as a sprite's Look tab
// (engine/theme.js THEME_PRESETS; app/asset-look.js), each said in words of what is heard and played when chosen.
// A look is a setting like any other (app/bag.js lookOf: `settings.look`): choosing one saves it with the sound in the
// bag, where it then keeps it whatever look the rest of the bag takes; "Follows the bag" takes it off again. The page
// plays and downloads the sound in it, and its link carries it (`artlook=<id>`, as a sprite's does).
// Nothing here runs at load time, so the words and the settings can be checked outside a browser
// (tests/unit/sound-look.test.mjs).
import { THEME_PRESETS } from '../engine/theme.js';
import { themedSoundParams, soundSettingsFor } from '../sound/theme.js';
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
