// Hints for the Fine-tune controls (docs/site-design.md, the asset row): each control can say, in a line, what it is and
// what its value stands for. The line is built, not written per sprite: the words for the common controls are here, and
// a control not listed is described from its own kind, label, end words and options, so a new sprite or sound needs
// nothing. Said in everyday words and never in numbers or units, like the rest of the site (sound/words.js).
// Pure: no DOM, so it runs in Node and in the browser (tests/unit/control-hints.test.mjs).
//
//   controlHint(control) -> { what, scale, now }
//     what   what the control is, one sentence
//     scale  what its two ends or its choices are ('Slide from Short to Tall.'), or ''
//     now    what its current value stands for ('Now: leaning Tall.'), kept up to date by the panel

// What a sprite's common controls are, by key. A key not here gets a sentence built from its label.
const SPRITE = {
  size: 'How big it is drawn.', height: 'How tall it is.', width: 'How wide it is.', length: 'How long it is.', build: 'How slim or stocky the body is.',
  pieces: 'How many separate pieces it is made of.', corner: 'How round the corners are.', border: 'How thick the edge is.',
  spread: 'How far apart the pieces are spread.', texture: 'How rough the surface looks.', wear: 'How worn and weathered it looks.',
  bounce: 'How much it bounces as it moves.', bob: 'How far it floats up and down.', pop: 'How high it jumps up.', stride: 'How long each step is.',
  wobble: 'How much it shakes from side to side.', sway: 'How much it sways, as if in the wind.', flicker: 'How much its light flickers.',
  shine: 'A highlight that glints across it.', sparkle: 'Little glints of light around it.', shadow: 'A shadow on the ground under it.',
  headgear: 'What it wears on its head.', headgearSize: 'How big the headgear is.', weapon: 'What it holds.', weaponLength: 'How long the weapon is.',
  eyes: 'How the eyes look.', style: 'Which design it uses.', shape: 'The overall shape.', mark: 'The mark or picture on it.',
  accent: 'A second colour for small details.', body: 'The main colour.', glow: 'The colour of its light.', edge: 'The colour of its outline and edges.',
  frame: 'The colour of the frame around it.', core: 'The colour of its middle.', face: 'The colour of its front.', metal: 'The colour of the metal parts.',
  wood: 'The colour of the wood.', stone: 'The colour of the stone.', skin: 'The skin colour.', trim: 'The colour of the trim and belt.',
  outfit: 'The colour of the clothes.', hair: 'The colour of the hair.', fill: 'The colour of what fills it.',
};

// What a sound's or track's common controls are, by id.
const SOUND = {
  bright: 'How crisp or muffled it sounds.', pitch: 'How high or low the note is.', length: 'How long it lasts.',
  space: 'How much room it has: a small room or a big hall.', speed: 'How quickly it plays.', intensity: 'How strong and busy it is.',
  bpm: 'How fast the beat goes.', key: 'The key of the whole tune: moves every note up or down together.',
  bars: 'How many bars the track plays before it starts again.', inst: 'Which instrument plays the tune.', lead: 'Which tune the lead plays.',
  along: 'Which instrument plays along with the tune.', weight: 'How heavy it sounds.', size: 'How big the thing making the sound is.',
  grit: 'How rough and crunchy it sounds.', ring: 'How long it keeps ringing after the hit.', swing: 'How much the beat swings: off-beat notes land a little late.',
  snap: 'How sharp the start is.', drop: 'How far the pitch falls.', rise: 'How far the pitch squeals upward.', notes: 'How many notes it plays.',
  echo: 'How much it repeats, fading away.', spread: 'How wide the sound is.', shimmer: 'How much it sparkles.', wobble: 'How much the pitch wavers.',
};

const lower = (s) => String(s ?? '').toLowerCase();
const plain = (label) => lower(label).replace(/\s+colou?r$/, '').trim();
const dropEnd = (s) => String(s).replace(/[.!]+$/, '');

/** A fallback sentence for a control the lists above do not know, from its kind and label. */
function built(c) {
  const name = plain(c.label);
  if (c.kind === 'color') return `The colour of the ${name}.`;
  if (c.kind === 'toggle') return `Turns the ${name} on or off.`;
  if (c.kind === 'choice') return `Picks the ${name}.`;
  return `How much ${name} there is.`;
}

/** Where a slider sits as a share of its own run, 0 to 1. */
const share = (c) => {
  const span = Number(c.max) - Number(c.min);
  return span > 0 ? Math.min(1, Math.max(0, (Number(c.value) - Number(c.min)) / span)) : 0.5;
};

/** What the slider's value stands for, in words: "all the way to Tall", "leaning Short", "in the middle". Sounds say their own word. */
function slideNow(c) {
  if (c.valueText) return c.valueText;
  const lo = c.lo, hi = c.hi, s = share(c);
  if (!lo && !hi) return s < 0.15 ? 'the least' : s < 0.4 ? 'a little' : s <= 0.6 ? 'in the middle' : s <= 0.85 ? 'a lot' : 'the most';
  if (s < 0.12) return `all the way to ${lo}`;
  if (s < 0.4) return `leaning ${lo}`;
  if (s <= 0.6) return 'in the middle';
  if (s <= 0.88) return `leaning ${hi}`;
  return `all the way to ${hi}`;
}

/** The control's current value in words, for the "Now" line. A colour says its name, a choice its label, a switch on or off. */
export function nowWords(c, { colourName = null } = {}) {
  if (c.kind === 'range') return slideNow(c);
  if (c.kind === 'toggle') return c.value ? 'on' : 'off';
  if (c.kind === 'choice') return (c.options ?? []).find((o) => String(o.value) === String(c.value))?.label ?? '';
  return colourName ? colourName(c.value) : '';
}

/**
 * What a control is and what its value stands for. c: a control from the panel model (panel-model.js: key, kind, label,
 * lo, hi, options, valueText, partLabel), kindOfAsset: 'sprite' or a sound ('sound', 'music').
 * A control can bring its own words: c.hint replaces the sentence for it.
 */
export function controlHint(c, kindOfAsset = 'sprite', opts = {}) {
  const table = kindOfAsset === 'sprite' ? SPRITE : SOUND;
  let what = c.hint ?? table[c.key];
  if (!what && c.part && c.main) what = `Pick which ${lower(c.partLabel ?? c.label)} it has.`;
  if (!what) what = built(c);
  let scale = '';
  if (c.kind === 'range') {
    if (c.lo && c.hi) scale = `Slide from ${c.lo} to ${c.hi}.`;
    else scale = 'Slide left for less, right for more.';
  } else if (c.kind === 'choice') {
    const names = (c.options ?? []).map((o) => o.label);
    scale = names.length ? `Pick one: ${names.length > 6 ? `${names.slice(0, 6).join(', ')} and ${names.length - 6} more` : names.join(', ')}.` : '';
  } else if (c.kind === 'color') scale = 'Pick a swatch, or any colour you like.';
  else if (c.kind === 'toggle') scale = 'Switch it on or off.';
  const now = nowWords(c, opts);
  return { what: dropEnd(what) + '.', scale, now: now ? `Now: ${now}.` : '' };
}
