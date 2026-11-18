// What a visitor changed on an asset, in plain words: "Height: taller, no weapon, red cape and 2 more".
// Built from each control's own label, the words at the two ends of its slider, its option names and
// its colour, so a new asset gets a readable line with no extra work. Pure: no page, runs in Node.
// Every phrase names its control in the control's own words (the label a visitor saw on the page), so
// the line can be matched to what they did: "bigger head", "calmer bounce", and where the word alone
// would not name it, "height: taller".
//
//   spriteChanges(sprite, params)          -> ['height: taller', 'no weapon', 'red cape', ...]   in the order of the sprite's controls
//   soundChanges(patch, style, params)     -> ['higher blade pitch', 'flute', 'length: shorter']  compared with the chosen style
//   inWords(list, most = 3)                -> 'Height: taller, no weapon, red cape and 2 more'
import { defaultParams, cleanParams, inEffect, partOf } from '../engine/sprite.js';
import { hexToRgb, rgbToHsl } from '../engine/color.js';

const low = (s) => String(s).toLowerCase();

// ---- words -----------------------------------------------------------------------------------

const IRREGULAR = {
  many: 'more', few: 'fewer', good: 'better', far: 'further', huge: 'bigger', full: 'fuller', still: 'stiller',
  worn: 'more worn', domed: 'more domed', turned: 'more turned', jagged: 'more jagged', upright: 'more upright', forward: 'further forward',
};
/** "Tall" -> "taller", "Bouncy" -> "bouncier", "Small steps" -> "smaller steps", "Swaying" -> "more swaying". Lowercase. */
export function comparative(word) {
  const [first, ...rest] = low(word).trim().split(/\s+/);
  const tail = rest.length ? ' ' + rest.join(' ') : '';
  if (!first) return '';
  if (IRREGULAR[first]) return IRREGULAR[first] + tail;
  if (/(ing|ed|ful|less|ous|ive)$/.test(first) || first.length > 7) return `more ${first}${tail}`;
  if (/[^aeiou]y$/.test(first)) return first.slice(0, -1) + 'ier' + tail;
  if (first.endsWith('e')) return first + 'r' + tail;
  if (/^[^aeiou]*[aeiou][bdgmnpt]$/.test(first)) return first + first.at(-1) + 'er' + tail;      // big, slim, thin, flat
  return first + 'er' + tail;
}

/** An everyday name for a colour: red, orange, yellow, green, teal, blue, purple, pink, brown, cream, white, silver, grey, dark, black. */
export function colourName(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return 'new';
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  if (l < 0.08) return 'black';
  if (l > 0.95) return 'white';
  if (s < 0.14) return l > 0.9 ? 'white' : l > 0.68 ? 'silver' : l < 0.3 ? 'dark' : 'grey';
  if (s < 0.3 && l > 0.68) return 'silver';
  if (s < 0.3 && l < 0.3) return 'dark';
  if (h >= 15 && h < 65 && l > 0.8) return 'cream';
  if (h >= 10 && h < 50 && l < 0.42) return 'brown';
  if (h < 15 || h >= 345) return 'red';
  if (h < 40) return 'orange';
  if (h < 65) return 'yellow';
  if (h < 165) return 'green';
  if (h < 200) return 'teal';
  if (h < 250) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

/** Up to `most` changes as one line, then how many more: "Taller, red cape, no weapon and 2 more". Empty when nothing changed. */
export function inWords(list, most = 3) {
  if (!list.length) return '';
  const shown = list.slice(0, most).join(', '), more = list.length - most;
  const line = more > 0 ? `${shown} and ${more} more` : shown;
  return line[0].toUpperCase() + line.slice(1);
}

// ---- sprites ---------------------------------------------------------------------------------

// Labels that say what is measured but not of what: on their own "longer" or "red" needs the part's name.
const GENERAL = new Set(['length', 'size', 'color', 'colour', 'width', 'height', 'thickness', 'shape', 'style', 'kind', 'type']);
// Labels that name a measure, where "taller height" would say it twice: these read "height: taller".
const WHOLE = new Set(['height', 'size', 'build', 'speed', 'length', 'width', 'bulk', 'thickness', 'span']);
const sameStart = (a, b) => a.slice(0, 4) === b.slice(0, 4);

/** What differs from the sprite's standard settings, one short phrase per control that is in effect, in the order of its controls. */
export function spriteChanges(sprite, params) {
  const def = defaultParams(sprite), p = cleanParams(sprite, params ?? {});
  const out = [];
  for (const [key, d] of Object.entries(sprite.params)) {
    if (p[key] === def[key] || !inEffect(sprite, key, p)) continue;
    const part = partOf(sprite, key), label = low(d.label);
    // inside a part, a general label ("Length", "Color") is about that part
    const inPart = part && key !== part.selector && GENERAL.has(label);
    const thing = inPart ? low(part.label) : label;
    if (d.kind === 'range') {
      const name = inPart ? `${thing} ${label}` : label;               // "weapon length"
      const end = p[key] > def[key] ? d.hi : d.lo;
      if (!end) { out.push(`${p[key] > def[key] ? 'more' : 'less'} ${name}`); continue; }
      const word = comparative(end), bare = word.replace(/^more /, '');
      // "bigger head", "calmer bounce"; but "height: taller", "bounce: bouncier", "stride: bigger steps", where joining them would say it twice or oddly
      const apart = inPart || WHOLE.has(label) || /\s/.test(bare) || sameStart(bare, label);
      out.push(apart ? `${name}: ${word}` : `${word} ${name}`);
    } else if (d.kind === 'choice') {
      const none = part && key === part.selector ? [].concat(part.none ?? []) : ['none'];
      const option = d.options.find((o) => o.value === p[key]);
      const about = part && key === part.selector ? low(part.label) : thing;
      out.push(none.includes(p[key]) || p[key] === 'none' ? `no ${about}` : `${low(option ? option.label : p[key])} ${about}`);
    } else if (d.kind === 'color') {
      out.push(`${colourName(p[key])} ${GENERAL.has(thing) ? 'colour' : thing}`);
    } else if (d.kind === 'toggle') {
      out.push(`${thing} ${p[key] ? 'on' : 'off'}`);
    }
  }
  return out;
}

// ---- sounds and music --------------------------------------------------------------------------

// What a sound slider measures decides the words: [test on its label and unit, lower word, higher word,
// labels that already are that measure, which read "tempo: faster" instead of "faster tempo"].
const MEASURES = [
  [(l, u) => /pitch|\bkey\b|tone|note/.test(l) || u === 'hz' || u === 'semitones', 'lower', 'higher', null],
  [(l, u) => /tempo|speed|rate/.test(l) || u === 'bpm', 'slower', 'faster', /tempo|speed|rate/],
  [(l, u) => /length|time|duration|decay|tail|hold/.test(l) || u === 's' || u === 'bars', 'shorter', 'longer', /length|duration/],
  [(l) => /bright/.test(l), 'duller', 'brighter', /bright/],
  [() => true, 'less', 'more', null],
];
// "brightness" is tested before pitch-like units, so "Air brightness" in Hz reads "air brightness: brighter", not "higher air brightness"
const measureOf = (label, unit) => (/bright/.test(label) ? MEASURES[3] : MEASURES.find(([fits]) => fits(label, unit)));

/**
 * What differs from the sound's chosen style (or its standard settings), one short phrase per control.
 * params: the values set by hand ({ id: value }); anything missing is as the style has it.
 */
export function soundChanges(patch, style, params) {
  const preset = (style && patch.presets && patch.presets[style]) || {};
  const out = [];
  for (const d of patch.params ?? []) {
    const base = preset[d.id] ?? d.default, value = params && params[d.id] !== undefined ? Number(params[d.id]) : base;
    if (!Number.isFinite(value) || Math.abs(value - base) <= Math.abs(d.max - d.min) * 1e-4) continue;
    if (d.options) { out.push(low(d.options[Math.round(value)] ?? d.label)); continue; }
    const label = low(d.label), [, lower, higher, twice] = measureOf(label, low(d.unit ?? ''));
    const word = value > base ? higher : lower;
    out.push(twice && twice.test(label) ? `${label}: ${word}` : `${word} ${label}`);
  }
  return out;
}
