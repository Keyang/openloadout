// words.js: a sound or music control's value in everyday words, for pages and anything else a visitor reads.
// A slider shows "high", "fast" or "a lot", never "2200 Hz" or "160 bpm": the people who use the site make games
// but do not program synthesizers. What a control measures is read from its label and unit, so a new sound
// needs nothing here. Pure: no DOM, runs in Node and the browser (tests/unit/sound-words.test.mjs).

/** Where a value sits on its control, 0 (lowest) to 1 (highest), on the control's own scale ("log" or straight). d: a patch param. */
export function position(d, v) {
  const lo = Number(d.min), hi = Number(d.max);
  if (!(hi > lo)) return 0;
  const x = Math.min(hi, Math.max(lo, Number(v)));
  const u = d.scale === 'log' && lo > 0 ? Math.log(x / lo) / Math.log(hi / lo) : (x - lo) / (hi - lo);
  return Math.min(1, Math.max(0, u));
}

// a frequency is a pitch whatever the label; semitones and octaves are also how far a pitch moves, so those need the label to say pitch
const PITCH_UNITS = new Set(['hz', 'khz']);
const SPEED_UNITS = new Set(['bpm', 'rpm', 'notes/s', 'beats/s', 'steps/s']);   // not a bare '/s': "Sparkles" a second is how many, not how fast
const LENGTH_UNITS = new Set(['s', 'bars']);
// A label that names a change of pitch (how far it rises, drops or spreads) is an amount, not a pitch.
const MOVES = /\b(rise|rises|drop|drops|fall|falls|glide|bend|sweep|spread|jump|wobble|scatter)\b/;

// [what it measures, test(label, unit, d), words for the two ends, five steps from lowest to highest]
const MEASURES = [
  ['direction', (l, u, d) => Number(d.min) < 0 && Number(d.max) > 0 && MOVES.test(l), null, null],
  ['brightness', (l) => /bright|dull/.test(l), ['duller', 'brighter'], ['very dull', 'dull', 'medium', 'bright', 'very bright']],
  ['amount', (l) => /\b(amount|level|volume|mix)\b/.test(l), null, null],
  ['pitch', (l, u) => !MOVES.test(l) && (/\b(pitch|key|tone|note)\b/.test(l) || PITCH_UNITS.has(u)), ['lower', 'higher'], ['very low', 'low', 'middle', 'high', 'very high']],
  ['speed', (l, u) => /\b(speed|tempo|rate|fast|quick)\b/.test(l) || SPEED_UNITS.has(u), ['slower', 'faster'], ['very slow', 'slow', 'medium', 'fast', 'very fast']],
  ['length', (l, u) => /\b(length|long|time|duration|gap|tail)\b/.test(l) || LENGTH_UNITS.has(u), ['shorter', 'longer'], ['very short', 'short', 'medium', 'long', 'very long']],
  ['width', (l) => /\b(spread|jump|width|wide)\b/.test(l), ['narrower', 'wider'], ['very narrow', 'narrow', 'medium', 'wide', 'very wide']],
  ['size', (l) => /\bsize\b/.test(l), ['smaller', 'bigger'], ['very small', 'small', 'medium', 'big', 'very big']],
  ['weight', (l) => /\bweight\b/.test(l), ['lighter', 'heavier'], ['very light', 'light', 'medium', 'heavy', 'very heavy']],
];
const AMOUNT = { ends: ['less', 'more'], steps: ['very little', 'a little', 'some', 'a lot', 'the most'] };

/**
 * What a control measures and the everyday words for it. d: a patch param ({ label, unit, min, max }).
 * Returns { measure ('pitch', 'speed', 'length', 'brightness', 'width', 'size', 'weight', 'direction' or 'amount'),
 * ends: [word for the lowest end, word for the highest], steps: five words from lowest to highest (null for a direction) }.
 * A control that runs both ways from zero and names a move ("Glide", "Drop") is a direction: ends 'falls' and 'rises',
 * the other way round when it names a fall ("Drop", "Fall").
 */
export function controlWords(d) {
  const l = String(d.label ?? '').toLowerCase(), u = String(d.unit ?? '').toLowerCase();
  for (const [measure, fits, ends, steps] of MEASURES) {
    if (!fits(l, u, d)) continue;
    if (measure === 'direction') return { measure, ends: /\b(drop|drops|fall|falls)\b/.test(l) ? ['rises', 'falls'] : ['falls', 'rises'], steps: null };
    if (measure === 'amount') break;
    return { measure, ends, steps };
  }
  return { measure: 'amount', ...AMOUNT };
}

/**
 * A control's value in a word or two: "very low", "fast", "a lot", "none", "rises a little". Never a number or a unit.
 * d: a patch param; v: its value. An amount that starts at zero reads "none" there.
 */
export function valueWord(d, v) {
  const w = controlWords(d);
  if (w.measure === 'direction') {
    const reach = Math.max(Math.abs(Number(d.min)), Math.abs(Number(d.max))), x = Number(v);
    if (Math.abs(x) <= reach * 0.02) return 'level';
    const way = x < 0 ? w.ends[0] : w.ends[1];
    return `${way} ${Math.abs(x) > reach * 0.5 ? 'a lot' : 'a little'}`;
  }
  if (w.measure === 'amount' && Number(d.min) === 0 && Number(v) <= Number(d.max) * 0.005) return 'none';
  return w.steps[Math.round(position(d, v) * 4)];   // the ends and the middle each get a quarter step either side
}

/**
 * What a page shows beside a sound or music slider: a count with no unit (rockets, notes) is its number, anything
 * else is valueWord ("high", "fast", "a lot"), never a unit. d: a patch param; v: its value. Used by the sound and
 * music pages so both read the same.
 */
export function shownValue(d, v) {
  return d.step && !d.unit && !d.options ? String(Math.round(Number(v))) : valueWord(d, v);
}
