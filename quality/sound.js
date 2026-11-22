// The sound and music quality bar as code. Pure JavaScript: no file, DOM or Node
// access, so it runs in the site build, the command-line checker and a browser.
//
//   checkSound(patch, { validateMeta }) -> { errors: [...], warnings: [...], notes: [...], metrics: {...} }
//
// validateMeta  (meta, kind) -> { ok, errors } from catalog/schema.js; when missing, metadata is not checked
//
// The checks render the patch at its defaults, at the lowest and highest setting of every
// control, with a second random seed, and with every preset. A music track takes minutes.
// A control that fails the one-seed spectral test is looked at twice more before it is called
// inaudible: do its note starts move, and does it change how much random takes differ.
// Every threshold is in THRESHOLDS and written down in docs/quality-bar.md.

import { validatePatch, renderPatch, createVoice, defaultParams } from '../sound/sfx-engine.js';
import { analyze, critique, fingerprint, fingerprintDistance, pulse, seam, onsets, onsetShift, barPitchClasses, PITCH_NAMES } from '../sound/analyze.js';

/** Every number the sound quality bar judges by (written down in docs/quality-bar.md). */
export const THRESHOLDS = {
  silentDb: -40,            // peak below this is silence
  audibleChangeDb: 1.5,     // a control should move the fingerprint by more than this between its ends (warning)
  deadControlDb: 0.01,      // below this a control changes nothing at all (error)
  cutOffDb: -12,            // a one-shot whose last 1/32 is louder than this (re. loudest) at a control end is cut off
  seamFactor: 8,            // loop seam: sample jump at the wrap vs typical step...
  seamJump: 0.05,           // ...and the absolute jump must also exceed this to count as a click
  tempoTolerance: 2,        // detected tempo within this many bpm of written (or half / double)
  sameSeedDb: 0.2,          // seed 1 vs seed 2 below this: every play is identical
  minControls: 3, maxControls: 7, maxMusicControls: 11,
  nodeSeconds: 30,          // node-level peaks are measured over at most this long

  // ---- added 2026-11-18. Data: every patch in sounds/ that day: 56 effects, ambiences and jingles (211 looks: each default and each style) and 2 tracks ----
  onsetDb: -20,             // a sound has started when it first comes within this of its peak (a tenth of the peak). At -20 dB every hit, click, shot, step and pickup starts in 0.0 to 1.5 ms; sounds that swell in on purpose (whoosh, sword-slash, door-creak, warp-out, heal-shimmer) in 31 to 104 ms
  onsetMaxMs: 10,           // style guide 11: hits, clicks, shots, steps (and pickups) start within 10 ms. The 18 sounds of those kinds (68 looks) start in at most 1.5 ms; their time to the loudest moment ran to 202 ms (credit-pickup), which is why the rule is on onset
  phoneShareMin: 0.4,       // style guide 11: at least this share of the energy above 300 Hz. 8 of 56 defaults are under (spaceship-hum 4%, punch 6%, engine 24%, error-buzz 26%, explosion 26%, fire 27%, footstep-gravel 31%, land-thud 37%); the 3 that say "rumble" measure 47%, 47% and 86%. Not applied to music: the two tracks measure 57% and 75%, but a quiet style is mostly bass and kick (battle-theme "Stalking" 23%), and the rule is written for effects
  styleCutOffDb: -18,       // a style whose last 1/32 is louder than this (re. loudest) is cut off: the same line as A-cut-off for the default. Loudest style ending in sounds/: -21.5 dB (dodge-dash "Thruster dash")
  lengthRange: { sfx: [0.03, 2], jingle: [1, 6] },   // seconds, one-shots only (quality bar section 3; 0.03 s is the shortest interface sound of style guide 11). Effects run 0.035 to 2.8 s (4 styles over 2 s); jingles 0.59 to 2.85 s (1 style under 1 s)
  clipPeak: 1,              // a patch that says "normalize": false is soft-clipped by the engine above this level (full scale). The two tracks peak at 0.71 to 0.85 over their 9 looks; normalised patches are exempt (their raw peaks run 0.17 to 9.3 and are scaled to 0.89)
  // ---- added 2026-11-18 (final review). Data: the 8 patches that say "normalize": false, at their defaults, every style and both ends of every control ----
  peakMax: 0.95,            // A-peak, an error: the level heard (heardPeak) at the defaults, in any style or at either end of any control stays at or under this, 0.4 dB under full scale, so a little rounding in a game's mixer does not reach it. The six tracks peak at 0.72 to 0.85 (battle-theme "Final phase" and grit at its highest, 0.847); normalised patches are 0.89 by construction
  randomSeeds: 5,           // a control under audibleChangeDb with seed 1 is rendered with this many seeds at both ends. Seeds 1 to 5 give a first rnd(-1, 1) of 0.03, -0.11, 0.23, -0.55, -0.29: seed 1 alone is nearly the centre of any random pick, which is why a "spread" scored under 1.5 dB
  onsetShiftMs: 10,         // a control under audibleChangeDb whose note starts move this far between its ends is audible as timing. thornwood-overworld "swing": 0.36 dB spectral, note starts move 38 ms (half of them by 10 ms or more); a control that changes nothing reads 0 ms. Only run under audibleChangeDb: a control that reshapes the sound also moves detected note starts (up to 54 ms among the library's controls under 2 dB)
  chordTop: 3, chordInTop: 2,   // a bar sounds its written chord when at least 2 of its 3 strongest notes (pitch classes) belong to it
  chordBarsMin: 0.75,       // error under this share of bars. battle-theme 8 of 8, thornwood-overworld 16 of 16; with the chords written one or three bars late 38% to 50%; with the tune a semitone off 0% to 75% (the 75% is why outOfKeyMax exists)
  outOfKeyMax: 0.2,         // warning above this share of pitched energy on notes that no written chord uses. The two tracks: 9% and 12% (drums, overtones); with the tune moved a semitone up or down: 28% to 33%
};

const now = () => (typeof performance !== 'undefined' ? performance : Date).now();

/** What kind of audio a patch is: its meta.type, or from its category: 'sfx', 'ambience', 'jingle' or 'music'. */
export function soundType(patch) {
  if (patch?.meta && typeof patch.meta.type === 'string') return patch.meta.type;
  const c = patch?.category;
  return c === 'music' ? 'music' : c === 'ambience' ? 'ambience' : c === 'jingle' ? 'jingle' : 'sfx';
}

/** The control a music track uses for its length, or null. */
export function lengthControl(patch) {
  return (patch.params || []).find((p) => p.id === 'bars' || p.unit === 'bars') || null;
}
/** The control that picks the melody instrument, or null. */
export function instrumentControl(patch) {
  return (patch.params || []).find((p) => Array.isArray(p.options) && p.options.length >= 2 && (/instrument/i.test(p.label || '') || p.id === 'inst')) || null;
}
/** The tempo the track says it plays at: a "bpm" control's default, or a top-level number. */
export function writtenTempo(patch) {
  const p = (patch.params || []).find((x) => x.id === 'bpm' || x.unit === 'bpm');
  if (p) return p.default;
  return typeof patch.bpm === 'number' ? patch.bpm : null;
}

const ONSET_KINDS = { 'actions/hit': 'hit', 'effects/impact': 'hit', 'interface/click': 'click', 'actions/shoot': 'shot', 'characters/footstep': 'step', 'items/pickup': 'pickup' };
/**
 * Which of the kinds that must start within 10 ms a patch is, from its meta.role: 'hit', 'click', 'shot', 'step' or 'pickup'; null for every other sound.
 * patch: a sound patch. Roles: actions/hit and effects/impact are hits, interface/click, actions/shoot, characters/footstep, items/pickup.
 */
export function onsetKind(patch) {
  return ONSET_KINDS[patch?.meta?.role] ?? null;
}
/** Whether a patch says it is meant to be a low rumble: the word "rumble" in its tags or in meta.words. Such a patch is not held to the phone-speaker rule. patch: a sound patch. */
export function declaresRumble(patch) {
  return [...(Array.isArray(patch?.tags) ? patch.tags : []), ...(Array.isArray(patch?.meta?.words) ? patch.meta.words : [])].includes('rumble');
}

const rowNumbers = (steps) => { let prev = 0; return (Array.isArray(steps) ? steps : String(steps).replace(/\|/g, ' ').trim().split(/\s+/)).map((x) => (prev = x === '_' ? prev : Number(x))); };
const pc = (x) => ((Math.round(x) % 12) + 12) % 12;
/**
 * The chords a track's patch writes, bar by bar, as the music kit's chords() stores them: nodes "root", "third" and "fifth" (rows of semitones, one step per bar) and "tonic" (the home note, semitones above C).
 * patch: a music patch. Returns { tonic, tonicFrom, bars: [{ notes: [pitch class, ...], name: 'C E G' }] } for one turn of the
 * progression, moved by the key control's default; null when the patch has no root and third rows. A patch with no
 * "fifth" row is read with a fifth of 7 semitones; one with no "tonic" node takes the tonic from the bass, the lowest
 * number added to tr inside midi() (tonicFrom: 'bass'), and is null when there is none.
 */
export function writtenChords(patch) {
  const by = Object.fromEntries((patch?.nodes || []).map((n) => [n.id, n]));
  if (!by.root?.steps || !by.third?.steps) return null;
  let tonic = by.tonic && Number.isFinite(Number(by.tonic.expr)) ? Number(by.tonic.expr) : null, tonicFrom = 'tonic';
  if (tonic === null) {
    let low = Infinity;
    const texts = [...(patch.nodes || []).flatMap((n) => Object.values(n)), ...[patch.out].flat()].filter((v) => typeof v === 'string');
    for (const t of texts) for (const m of t.matchAll(/midi\(\s*(\d+(?:\.\d+)?)\s*\+\s*tr\b/g)) low = Math.min(low, Number(m[1]));
    if (!Number.isFinite(low)) return null;
    tonic = low; tonicFrom = 'bass';
  }
  const key = (patch.params || []).find((p) => p.id === 'key');
  const home = pc(tonic + (key ? Math.round(key.default) : 0));
  const roots = rowNumbers(by.root.steps), thirds = rowNumbers(by.third.steps), fifths = by.fifth?.steps ? rowNumbers(by.fifth.steps) : [7];
  const every = Number(by.root.every) > 0 ? Number(by.root.every) : 1, turn = roots.length * every;
  let count = turn; while (count % 16) count += turn;            // steps after which the row is back at the start of a bar
  const bars = [];
  for (let b = 0; b < count / 16; b++) {
    const notes = [];
    for (let step = b * 16; step < (b + 1) * 16; step++) {
      const i = Math.floor(step / every) % roots.length;
      for (const n of [roots[i], roots[i] + thirds[i % thirds.length], roots[i] + fifths[i % fifths.length]]) if (!notes.includes(pc(home + n))) notes.push(pc(home + n));
    }
    bars.push({ notes, name: notes.map((n) => PITCH_NAMES[n]).join(' ') });
  }
  return { tonic: pc(tonic), tonicFrom, bars };
}

/**
 * The level a listener gets from a render: the peak after the engine's own scaling. A normalised patch is scaled to
 * 0.89 whatever its raw level; one that says "normalize": false is played at its raw level.
 * r: what renderPatch returns ({ rawPeak, appliedGain }).
 */
export function heardPeak(r) {
  return r.rawPeak * (r.appliedGain ?? 1);
}

/**
 * Words a visitor would have to look up, in the text a sound or music page shows: the name, the description, each
 * control's label, the names of a control's choices and the style names. The people who use the site make games
 * but do not program synthesizers, so a page says "deep" not "80 Hz", "ringing metal" not "modal resonator".
 * Each entry: re (case-insensitive, whole words), instead (what to write). Why each group is here:
 * - units (Hz, kHz, dB, ms, bpm, rpm, octaves, semitones): a number with a unit means nothing to someone who has not
 *   studied sound; say how high, how fast, how long. Seconds are everyday and are allowed.
 * - wave shapes (sine, saw, sawtooth, square wave, pulse wave, pulse width, duty, "triangle note"): names of
 *   oscillator shapes; say what it sounds like (soft, buzzy, hollow, bright). "Sawed-off" or a triangle as an
 *   instrument is not caught.
 * - synthesis (FM, LFO, ADSR, oscillator, resonator, modal, inharmonic, harmonic, overtone, partial, filter,
 *   low-pass, high-pass, band-pass, cutoff, resonance, envelope, decay, sustain, detune, dissonant, vibrato, tremolo,
 *   reverb, saturated, transient, timbre, formant, "sub" as in sub bass, and "noise" as a sound source): the
 *   synthesizer's parts, not what is heard. "Noise" is here because in a sound's own text it always names the
 *   source (white noise), which tells a listener nothing; write hiss, rush, crackle. "Attack" is not here: in a
 *   game it is a word everyone uses.
 * - music theory (key names like "D minor", modes, intervals, triads, voicings, arpeggios, counted bars, "8th note",
 *   half-time, double-time, grace note): say happy, dark, rising, a run of notes, short or long.
 * - mixing and code words ("mids", "low end", "parameter", "every seed"): say deep or high sounds, control, take.
 * - key and tempo in the musician's sense: a control named "Key" (or "Musical key"), "change the key", "a key change",
 *   "in the key of", and "tempo" anywhere; say Pitch (lower to higher) and Speed (slower to faster). Key is also an
 *   everyday thing (a style called "Key", "a key jingle", "Key click"), so only the musical phrasings are listed, and
 *   the bare word only as a whole control name. An entry with `in: 'control'` reads control names only.
 * "Synth" and "chiptune" are allowed: they name instruments and a style of game music that players know.
 */
export const TECHNICAL_WORDS = [
  { re: /\bk?hz\b/i, instead: 'say how high or low it sounds: deep, low, high, shrill' },
  { re: /\bdb\b|\bdecibels?\b/i, instead: 'say louder or quieter' },
  { re: /\bms\b|\bmilliseconds?\b/i, instead: 'say at once, quick or slow, or give seconds' },
  { re: /\bbpm\b/i, instead: 'say speed, slower or faster (or "beats a minute")' },
  { re: /\brpm\b/i, instead: 'say engine speed' },
  { re: /\boct\b|\boctaves?\b/i, instead: 'say higher or lower, or much higher' },
  { re: /\bsemitones?\b/i, instead: 'say a little higher or lower' },
  { re: /\bsines?\b|\bsaws?\b|\bsawtooth\b|\bsquare[- ]waves?\b|\bpulse[- ]?(?:waves?|width)\b|(?<![\w-])duty\b|\btriangle (?:waves?|notes?|blips?|tones?|with)\b/i, instead: 'say what it sounds like: soft, pure, buzzy, hollow, bright' },
  { re: /\b(?:fm|lfo|adsr)\b/i, instead: 'say what it sounds like: bell-like, wobbling, ringing' },
  { re: /\boscillators?\b|\bresonators?\b|\bmodal\b|\binharmonic\b|\bharmonics?\b|\bovertones?\b|\bpartials?\b/i, instead: 'say what is heard: ringing metal, a bell, a clang, a richer tone' },
  { re: /\bfilter(?:s|ed|ing)?\b|\b(?:low|high|band)[- ]?pass(?:ed)?\b|\bcutoff\b|\bresonance\b/i, instead: 'say brighter or duller, muffled, thin' },
  { re: /\benvelopes?\b|\bdecay\b|\bsustain\b|\btransients?\b/i, instead: 'say how quickly it starts and how long it rings' },
  { re: /\bdetuned?\b|\bdissonan(?:t|ce)\b|\bvibrato\b|\btremolo\b|\breverb\b|\bsaturat(?:ed|ion)\b|\btimbre\b|\bformants?\b/i, instead: 'say what is heard: wobbly, harsh, sour, echoing, crunchy, the sound of it' },
  { re: /\bsub(?![\w-])|\bsub-?bass\b/i, instead: 'say deep or low' },
  { re: /\bnoise\b/i, instead: 'say what it sounds like: hiss, rush, crackle, static' },
  { re: /\b[a-g](?:#|♯|b|♭)?-(?:major|minor)\b|\bin [a-g](?:#|♯|b|♭)? (?:major|minor)\b|\bdorian\b|\bmixolydian\b|\blydian\b|\bphrygian\b|\baeolian\b/i, instead: 'say happy, bright, sad or dark' },
  { re: /\bintervals?\b|\btriads?\b|\bvoicings?\b|\barpeggi(?:o|os|ated)\b|\barp\b|\b(?:major|minor|perfect) (?:second|third|fourth|fifth|sixth|seventh)s?\b|\ba (?:fourth|fifth|sixth|ninth) (?:apart|above|below)\b|\badded ninth\b|\bgrace note\b/i, instead: 'say a jump between notes, a chord, a run of notes, a small or big step' },
  { re: /\b\d+(?:st|nd|rd|th) notes?\b|\b\d+ (?:to \d+ )?bars?\b|\bhalf-time\b|\bdouble-time\b/i, instead: 'say short or long, slower or faster, every beat' },
  { re: /\bmids\b|\bmid-?range\b|\blow end\b|\bhigh end\b/i, instead: 'say deep, middle or high sounds' },
  { re: /\bparam(?:eter)?s?\b|\b(?:every|each|another|a different|random|new) seeds?\b/i, instead: 'say control or slider; say every take or every time it plays' },
  { re: /^(?:musical )?key$/i, in: 'control', instead: 'call it Pitch: lower to higher' },
  { re: /\b(?:change|changes|changing|shift|shifts|raise|raises|lower|lowers|set|sets) (?:the|its) key\b|\bkey changes?\b|\bin the key of\b|\btempo\b/i, instead: 'say pitch (lower or higher) and speed (slower or faster)' },
];

/**
 * The technical words in what a visitor reads of a patch (see TECHNICAL_WORDS). Reads text only: no render.
 * patch: a sound patch. Returns [{ word (as written), where ('the name', 'the description', 'control "<label>"',
 * 'a choice of "<label>"', 'style "<name>"'), instead }], in reading order.
 */
export function technicalWords(patch) {
  const texts = [['the name', patch?.name], ['the description', patch?.description]];
  for (const d of Array.isArray(patch?.params) ? patch.params : []) {
    texts.push([`control "${d.label}"`, d.label]);
    for (const o of Array.isArray(d.options) ? d.options : []) texts.push([`a choice of "${d.label}"`, o]);
  }
  for (const name of Object.keys(patch?.presets ?? {})) texts.push([`style "${name}"`, name]);
  const out = [];
  for (const [where, text] of texts) {
    if (typeof text !== 'string') continue;
    for (const w of TECHNICAL_WORDS) {
      if (w.in === 'control' && !where.startsWith('control ')) continue;
      const all = new RegExp(w.re.source, 'gi');
      for (const m of text.matchAll(all)) out.push({ word: m[0], where, instead: w.instead });
    }
  }
  return out;
}

const pct = (x) => `${Math.round(x * 100)}%`;
const quoted = (names) => (names.length > 1 ? `styles ${names.slice(0, -1).map((n) => `"${n}"`).join(', ')} and "${names[names.length - 1]}"` : `style "${names[0]}"`);
const both = (values) => (values.length > 1 ? `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}` : values[0]);

/**
 * Run the sound and music quality bar on a patch. Returns { errors, warnings, notes, metrics }; no errors means it passes.
 * patch: a sound patch; { validateMeta }: (meta, kind) -> { ok, errors } from catalog/schema.js; when left out, metadata is not checked.
 * Renders the patch many times (every control at both ends, every style), so a music track takes minutes.
 */
export function checkSound(patch, { validateMeta } = {}) {
  const t0 = now();
  const T = THRESHOLDS;
  const errors = [], warnings = [], notes = [];
  const type = soundType(patch);
  // a looping track is "music"; a short sting is a "jingle" (meta.type and category "jingle") and is judged as a one-shot
  const isMusic = type === 'music';
  const metrics = { id: patch?.id, name: patch?.name, type, loop: !!patch?.loop, valid: false, metaChecked: false };
  const kind = onsetKind(patch), rumble = declaresRumble(patch);
  metrics.kind = kind;
  metrics.rumble = rumble;
  const sort = (n) => {
    const m = /^(ERROR|WARN|NOTE):\s*/.exec(n);
    const text = m ? n.slice(m[0].length) : n;
    (m?.[1] === 'ERROR' ? errors : m?.[1] === 'NOTE' ? notes : warnings).push(text);
  };

  const v = validatePatch(patch);
  metrics.valid = v.ok;
  errors.push(...v.errors);
  // `meta` is part of the asset contract even where the engine does not know it yet
  warnings.push(...v.warnings.filter((w) => !/unknown top-level field 'meta'/.test(w)));

  if (typeof validateMeta === 'function') {
    metrics.metaChecked = true;
    if (!patch?.meta) errors.push('no meta: every asset needs metadata (docs/architecture.md, Contract 1)');
    else {
      const r = validateMeta(patch.meta, patch.category === 'music' ? 'music' : 'sound') || {};
      if (!r.ok) for (const e of r.errors ?? ['invalid']) errors.push(`meta: ${e}`);
    }
  }
  if (type === 'jingle') {
    if (patch?.loop) errors.push('a jingle must not loop: it is a one-shot sting that ends on a resolved chord (a loop is a music track: meta.type "music")');
    if (patch?.category && patch.category !== 'jingle') warnings.push(`a jingle's patch should say "category": "jingle" (it says "${patch.category}"), so the site does not list it as a music track`);
  }
  if (type === 'ambience' && patch && !patch.loop) errors.push('an ambience must loop ("loop": true): it plays under a scene for minutes');
  // A-words: what a visitor reads is in everyday words (text only, so it runs even on a patch that does not build)
  {
    const found = technicalWords(patch);
    metrics.technicalWords = found;
    if (found.length) {
      const seen = new Set(), list = [];
      for (const x of found) { const key = `${x.word.toLowerCase()}|${x.where}`; if (!seen.has(key)) { seen.add(key); list.push(`"${x.word}" in ${x.where} (${x.instead})`); } }
      errors.push(`words: a visitor would have to look up ${list.join('; ')}. The people who use the site make games but do not program synthesizers: write what is heard, in everyday words (skills/sprite-forge/SOUND.md, "Words a visitor reads").`);
    }
  }
  if (!v.ok) return finish();

  // ---- the default render --------------------------------------------------------------
  const r0 = now();
  const base = renderPatch(patch, { seed: 1 });
  metrics.renderMs = Math.round(now() - r0);
  const a = analyze(base.samples, base.sampleRate);
  metrics.analysis = a;
  metrics.rawPeak = base.rawPeak;
  metrics.stereo = base.channels.length === 2;
  metrics.realtime = a.seconds * 1000 / Math.max(1, metrics.renderMs);
  for (const n of critique(a, patch)) sort(n);
  if (base.badSamples) errors.push(`${base.badSamples} non-finite samples in the render.`);

  // ---- shape of a look (the default here; every style further down) -------------------------------
  const lengthRule = !patch.loop && T.lengthRange[type] ? { range: T.lengthRange[type], what: type === 'jingle' ? 'a jingle' : 'a sound effect' } : null;
  const clips = (r) => heardPeak(r) > T.peakMax;      // A-peak: heard above the margin under full scale (an error)
  const loudText = (level) => `the level reaches ${level.toFixed(2)}, above ${T.peakMax} (full scale is ${T.clipPeak}, where it distorts; this patch is not normalised, so it is heard as made)`;
  const tooLong = (ax) => lengthRule && (ax.seconds < lengthRule.range[0] || ax.seconds > lengthRule.range[1]);
  const lengthText = lengthRule ? `${lengthRule.what} lasts ${lengthRule.range[0]} to ${lengthRule.range[1]} s` : '';
  if (kind && a.onsetMs > T.onsetMaxMs) warnings.push(`slow start: this ${kind} reaches a tenth of its loudest level ${a.onsetMs.toFixed(0)} ms after it begins (the first sample within ${-T.onsetDb} dB of the peak); a hit, click, shot, step or pickup should get there within ${T.onsetMaxMs} ms. Shorten the attack of its first layer, or add a short click at the very start (an "ad" envelope with attack 0.001 on a tone or on noise).`);
  if (tooLong(a)) warnings.push(`length: lasts ${a.seconds.toFixed(2)} s; ${lengthText}. Change "duration" or the default of the control that sets it; if the brief asks for this length, tell the reviewer so.`);
  metrics.heardPeak = heardPeak(base);
  if (clips(base)) errors.push(`too loud: at its standard settings ${loudText(heardPeak(base))}. Lower "gain" or the levels mixed in "out".`);

  // peak level of every node at the defaults: shows which layer dominates and which is dead
  {
    const voice = createVoice(patch, { seed: 1 }), n = Math.round(Math.min(voice.duration, T.nodeSeconds) * 44100);
    const pk = new Float64Array(voice.nodeIds.length);
    for (let i = 0; i < n; i++) { voice.tick(); for (let k = 0; k < pk.length; k++) { const x = Math.abs(voice.nodeValues[k]); if (x > pk[k]) pk[k] = x; } }
    metrics.nodes = voice.nodeIds.map((id, k) => ({ id, peak: pk[k] }));
  }

  // ---- loops -------------------------------------------------------------------------------
  if (patch.loop) {
    const sj = seam(base.samples), jump = Math.abs(base.samples[0] - base.samples[base.samples.length - 1]);
    const pl = pulse(base.samples, base.sampleRate);
    metrics.loopSeam = { factor: sj, jump, clicks: sj > T.seamFactor && jump > T.seamJump };
    metrics.pulse = pl;
    if (metrics.loopSeam.clicks) errors.push(`loop seam: the wrap jumps ${jump.toFixed(2)} (${sj.toFixed(1)}x the typical step), which clicks every time the loop repeats.`);
  }

  // ---- every control, lowest against highest -------------------------------------------------
  const params = patch.params || [];
  const maxControls = isMusic ? T.maxMusicControls : T.maxControls;
  if (!params.length) warnings.push('no parameters — the sound cannot be remixed. Expose 3–7.');
  else if (params.length > maxControls) warnings.push(`${params.length} parameters: aim for ${T.minControls}–${maxControls}.`);
  metrics.params = [];
  let extraMs = 0;
  for (const p of params) {
    const lo = renderPatch(patch, { seed: 1, params: { [p.id]: p.min } });
    const hi = renderPatch(patch, { seed: 1, params: { [p.id]: p.max } });
    const secs = Math.max(lo.duration, hi.duration);
    const fpLo = fingerprint(lo.samples, lo.sampleRate, secs), fpHi = fingerprint(hi.samples, hi.sampleRate, secs);
    const d = fingerprintDistance(fpLo, fpHi);
    const flags = [], more = {};
    if (d < T.audibleChangeDb) {
      // One seed and an average over the spectrum miss two things: notes that move in time, and a wider random pick.
      const x0 = now();
      const shift = onsetShift(onsets(lo.samples, lo.sampleRate), onsets(hi.samples, hi.sampleRate));
      more.onsetShiftMs = shift.ms;
      if (shift.ms >= T.onsetShiftMs) more.audibleBy = 'timing';
      else {
        const los = [fpLo], his = [fpHi];
        for (let seed = 2; seed <= T.randomSeeds; seed++) {
          const l = renderPatch(patch, { seed, params: { [p.id]: p.min } }), h = renderPatch(patch, { seed, params: { [p.id]: p.max } });
          los.push(fingerprint(l.samples, l.sampleRate, secs)); his.push(fingerprint(h.samples, h.sampleRate, secs));
          // no randomness at either end: more seeds cannot change the answer
          if (seed === 2 && fingerprintDistance(los[0], los[1]) < T.sameSeedDb && fingerprintDistance(his[0], his[1]) < T.sameSeedDb) break;
        }
        const perSeed = los.map((l, i) => fingerprintDistance(l, his[i])).sort((x, y) => x - y);
        const takes = (fps) => { let sum = 0, c = 0; for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) { sum += fingerprintDistance(fps[i], fps[j]); c++; } return c ? sum / c : 0; };
        more.seeds = { count: los.length, distance: perSeed[Math.floor(perSeed.length / 2)], takesAtMin: takes(los), takesAtMax: takes(his) };
        if (more.seeds.distance >= T.audibleChangeDb || Math.abs(more.seeds.takesAtMax - more.seeds.takesAtMin) >= T.audibleChangeDb) more.audibleBy = 'random takes';
      }
      extraMs += now() - x0;
    }
    more.peakMin = heardPeak(lo); more.peakMax = heardPeak(hi);
    for (const [label, r] of [['min', lo], ['max', hi]]) {
      const ax = analyze(r.samples, r.sampleRate);
      if (clips(r)) flags.push(`too loud at ${label}`);
      if (ax.peakDb < T.silentDb || r.rawPeak < 1e-4) flags.push(`silent at ${label}`);
      if (r.badSamples) flags.push(`non-finite samples at ${label}`);
      if (!patch.loop && ax.endLevelDb > T.cutOffDb) flags.push(`cut off at ${label}`);
    }
    if (more.audibleBy) { /* heard as timing or as wider random takes, though one seed's spectrum barely moves */ }
    else if (d < T.deadControlDb) flags.push('changes nothing — wire it to something or remove it');
    else if (d < T.audibleChangeDb) flags.push('little audible effect — widen the range or wire it to something that matters');
    metrics.params.push({ id: p.id, min: p.min, max: p.max, default: p.default, distance: d, flags, ...more });
    for (const f of flags) {
      if (/^too loud at (min|max)$/.test(f)) { const atMax = f.endsWith('max'); errors.push(`param '${p.id}': too loud at its ${atMax ? 'highest' : 'lowest'} setting (${atMax ? p.max : p.min}): ${loudText(atMax ? more.peakMax : more.peakMin)}. Lower the level this control adds at that end, narrow its range, or lower the levels mixed in "out".`); continue; }
      (/^(silent|non-finite|changes nothing)/.test(f) ? errors : warnings).push(`param '${p.id}': ${f}`);
    }
  }

  // ---- takes and presets ----------------------------------------------------------------------
  const alt = renderPatch(patch, { seed: 2 });
  metrics.variation = fingerprintDistance(fingerprint(base.samples, base.sampleRate, base.duration), fingerprint(alt.samples, alt.sampleRate, base.duration));
  metrics.presets = Object.keys(patch.presets || {});
  metrics.extraControlMs = Math.round(extraMs);

  // every style gets the cheap one-shot checks from the render it already had; one message per rule, naming the styles
  metrics.styles = [];
  for (const [name, set] of Object.entries(patch.presets || {})) {
    const r = renderPatch(patch, { seed: 1, params: set });
    const ax = analyze(r.samples, r.sampleRate), flags = [];
    if (ax.peakDb < T.silentDb) { errors.push(`preset '${name}' is silent`); flags.push('silent'); }
    else {
      if (r.badSamples) flags.push('non-finite');
      if (!patch.loop && ax.endLevelDb > T.styleCutOffDb) flags.push('cut off');
      if (clips(r)) flags.push('peak');
      if (tooLong(ax)) flags.push('length');
      if (!rumble && !isMusic && ax.above300 < T.phoneShareMin) flags.push('phone');
      if (kind && ax.onsetMs > T.onsetMaxMs) flags.push('slow start');
    }
    metrics.styles.push({ name, seconds: ax.seconds, rawPeak: r.rawPeak, heardPeak: heardPeak(r), endLevelDb: ax.endLevelDb, above300: ax.above300, onsetMs: ax.onsetMs, crestDb: ax.crestDb, flags });
  }
  const flagged = (flag) => metrics.styles.filter((x) => x.flags.includes(flag));
  const styleWarning = (flag, text) => { const list = flagged(flag); if (list.length) warnings.push(`${quoted(list.map((x) => x.name))}: ${text(list)}`); };
  styleWarning('non-finite', () => 'some samples are not finite numbers with these settings (a division by zero or runaway feedback). Narrow the settings the style uses, or guard the expression.');
  styleWarning('cut off', (l) => `cut off: the last moment is still at ${both(l.map((x) => `${x.endLevelDb.toFixed(0)} dB`))} of the loudest, and should be below ${T.styleCutOffDb} dB. Make "duration" longer or the decay shorter at the style's settings.`);
  { const l = flagged('peak'); if (l.length) errors.push(`${quoted(l.map((x) => x.name))}: too loud: the level reaches ${both(l.map((x) => x.heardPeak.toFixed(2)))}, above ${T.peakMax} (full scale is ${T.clipPeak}, where it distorts; this patch is not normalised, so it is heard as made). Lower the settings that add level in the style, or the levels mixed in "out".`); }
  styleWarning('length', (l) => `${l.length > 1 ? 'last' : 'lasts'} ${both(l.map((x) => `${x.seconds.toFixed(2)} s`))}; ${lengthText}. Change the style's length setting; if the brief asks for this length, tell the reviewer so.`);
  styleWarning('slow start', (l) => `slow start: ${both(l.map((x) => `${x.onsetMs.toFixed(0)} ms`))} to reach a tenth of the loudest level; a ${kind} should get there within ${T.onsetMaxMs} ms. Shorten the attack at the style's settings.`);
  // phone speakers: the default and its styles in one message
  {
    const under = (x) => `${Math.floor(x * 100)}%`;   // rounded down, so 39.6% does not read as the 40% it fails
    const low = flagged('phone'), names = low.map((x) => `"${x.name}" ${under(x.above300)}`).join(', ');
    const fix = 'Add or raise a layer between about 500 Hz and 4 kHz (a crack, a click, filtered noise), or lower the low layer. If it is meant to be a low rumble, say so: add "rumble" to "tags" or to meta.words.';
    if (!isMusic && a.above300 < T.phoneShareMin) {
      if (rumble) notes.push(`says it is a rumble ("rumble" in tags or meta.words), so it is not held to the phone-speaker rule: ${under(a.above300)} of the energy is above 300 Hz.`);
      else warnings.push(`phone speakers: only ${under(a.above300)} of the energy is above 300 Hz; at least ${pct(T.phoneShareMin)} is needed for a phone or laptop speaker to play it${low.length ? ` (the same in ${low.length > 1 ? 'styles' : 'style'} ${names})` : ''}. ${fix}`);
    } else if (low.length) warnings.push(`${quoted(low.map((x) => x.name))}: phone speakers: only ${both(low.map((x) => under(x.above300)))} of the energy is above 300 Hz; at least ${pct(T.phoneShareMin)} is needed for a phone or laptop speaker to play it. ${fix}`);
  }

  // ---- music ------------------------------------------------------------------------------------
  if (isMusic) {
    const written = writtenTempo(patch), detected = metrics.pulse?.[0]?.bpm ?? (patch.loop ? null : pulse(base.samples, base.sampleRate)[0]?.bpm ?? null);
    const len = lengthControl(patch), inst = instrumentControl(patch);
    metrics.music = { writtenBpm: written, detectedBpm: detected, lengthControl: len?.id ?? null, instrumentControl: inst?.id ?? null };
    if (written == null) errors.push('music: no written tempo — add a "bpm" control (unit "bpm") and drive the clock from it');
    else if (detected == null) errors.push(`music: no steady beat detected; the written tempo is ${written} bpm`);
    else {
      const ok = [written, written / 2, written * 2].some((w) => Math.abs(detected - w) <= T.tempoTolerance);
      metrics.music.tempoOk = ok;
      if (!ok) errors.push(`music: detected tempo ${detected} bpm does not match the written tempo ${written} bpm (or half or double, within ${T.tempoTolerance} bpm)`);
    }
    if (!patch.loop) warnings.push('music: the track does not loop; game music usually loops (a one-off sting is a jingle)');
    if (!metrics.stereo) warnings.push('music: the track is mono; spread chord tones and echoes across left and right');
    if (!len) errors.push('music: no length control — add {"id": "bars", "label": "Length", "unit": "bars", "step": 8, ...} and use it in "duration"');
    else {
      if (!(len.step || len.options)) warnings.push(`music: length control "${len.id}" should move in whole sections ("step")`);
      if (typeof patch.duration !== 'string' || !new RegExp(`\\b${len.id}\\b`).test(patch.duration)) errors.push(`music: length control "${len.id}" is not used in "duration", so it does not change the length`);
    }
    if (!inst) errors.push('music: no melody-instrument control — add a named-choice control {"id": "inst", "label": "Melody instrument", "options": [...]}');

    // M-chords: each bar's strongest notes against the chord the patch writes for it (uses the default render: no extra render)
    const c0 = now(), chords = writtenChords(patch), barCount = written ? Math.round((a.seconds * written) / 240) : 0;
    metrics.music.chords = null;
    if (!chords) warnings.push('music: the patch does not say which chord each bar plays, so the checker cannot tell whether the bars sound them. Write the chords with the music kit\'s chords(): it adds the nodes "tonic" (the home note, semitones above C), "root", "third" and "fifth" (one step per bar).');
    else if (barCount >= 1) {
      const shares = barPitchClasses(base.samples, base.sampleRate, barCount);
      const first = patch.loop && patch.wrap ? barCount : 0;       // a wrapped loop keeps its second pass
      const scale = new Set(chords.bars.flatMap((b) => b.notes)), outside = new Array(12).fill(0);
      const bars = [];
      let counted = 0, matched = 0, out = 0;
      shares.forEach((share, b) => {
        const w = chords.bars[(first + b) % chords.bars.length];
        const order = [...share.keys()].sort((x, y) => share[y] - share[x]).slice(0, T.chordTop);
        const pitched = share.some((v) => v > 0), inChord = order.filter((n) => w.notes.includes(n)).length, match = pitched && inChord >= T.chordInTop;
        if (pitched) { counted++; if (match) matched++; share.forEach((v, n) => { if (!scale.has(n)) { out += v; outside[n] += v; } }); }
        bars.push({ bar: b + 1, written: w.name, top: order.map((n) => PITCH_NAMES[n]), topShares: order.map((n) => share[n]), chordShare: w.notes.reduce((sum, n) => sum + share[n], 0), match, pitched });
      });
      const share = counted ? matched / counted : 1, outOfKey = counted ? out / counted : 0;
      metrics.music.chords = { tonic: PITCH_NAMES[chords.tonic], tonicFrom: chords.tonicFrom, bars, counted, matched, share, outOfKey };
      if (share < T.chordBarsMin) {
        const off = bars.filter((x) => x.pitched && !x.match);
        errors.push(`music: only ${matched} of ${counted} bars sound their written chord (a bar counts when ${T.chordInTop} of its ${T.chordTop} strongest notes belong to the chord; at least ${pct(T.chordBarsMin)} of the bars must). Not matching: ${off.slice(0, 4).map((x) => `bar ${x.bar} is written ${x.written} but its strongest notes are ${x.top.join(', ')}`).join('; ')}${off.length > 4 ? ` (and ${off.length - 4} more)` : ''}. Check that the chord rows (root, third, fifth), the bass, the pad and the tune are written for the same bars and in the same key.`);
      }
      if (outOfKey > T.outOfKeyMax) {
        const worst = outside.map((v, n) => [v, n]).sort((x, y) => y[0] - x[0]).slice(0, 3).filter(([v]) => v > 0).map(([, n]) => PITCH_NAMES[n]);
        warnings.push(`music: ${pct(outOfKey)} of the pitched sound is on notes that none of the written chords use (mostly ${worst.join(', ')}); up to ${pct(T.outOfKeyMax)} is normal (drums, overtones, passing notes). A tune or a layer is probably a semitone off its chords: check the number added to "key" or "tr" where its pitch is made (midi(60 + ...)).`);
      }
    }
    metrics.music.chordsMs = Math.round(now() - c0);
  }

  return finish();

  function finish() {
    metrics.ms = Math.round(now() - t0);
    return { errors, warnings, notes, metrics };
  }
}
