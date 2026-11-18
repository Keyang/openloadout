// Bundle-level customisation (architecture.md, Contract 7), the sound side.
// Sound effects are changed after they are rendered (pitch by resampling,
// brightness by a simple filter), so it works on any sound with no per-sound
// work. Music must stay in time, so its pitch goes through its `key` control and
// its tempo through its `bpm` control instead (themedSoundParams).
// Pure JavaScript: runs the same in the browser, in a worker and in Node.

import { defaultParams } from './sfx-engine.js';
import { normalizeTheme, assetSeed } from '../engine/theme.js';
import { rng } from '../engine/motion.js';

const isMusic = (patch) => !!patch && patch.category === 'music';

/**
 * Whether applySound's `pitch` should be used for this sound.
 * true for sound effects (pitch by resampling); false for music, whose pitch
 * was already applied through its key control by themedSoundParams.
 */
export function shouldResample(patch) {
  return !isMusic(patch);
}

/** The settings to hand applySound for this sound under this theme. */
export function soundSettingsFor(patch, theme) {
  const s = normalizeTheme(theme).sound;
  return { pitch: shouldResample(patch) ? Number(s.pitch) || 0 : 0, brightness: Number(s.brightness) || 0 };
}

// ---- filters ---------------------------------------------------------------------

/** One-pole low-pass. `warm`: samples to run first (the end of a loop) so the start joins up. */
function onePole(x, sr, hz, warm) {
  const a = Math.exp((-2 * Math.PI * hz) / sr), out = new Float32Array(x.length);
  let y = 0;
  if (warm) for (let i = Math.max(0, x.length - warm); i < x.length; i++) y = (1 - a) * x[i] + a * y;
  for (let i = 0; i < x.length; i++) out[i] = y = (1 - a) * x[i] + a * y;
  return out;
}

// Brightness below 0: a low-pass (two one-poles) whose cutoff slides from
// DULL_TOP_HZ at 0 down to DULL_HZ at -1, with no dry mix, so every step down
// removes more of the top and the sound only ever gets duller.
// Brightness above 0: adds back the part above BRIGHT_HZ, up to BRIGHT_BOOST
// times (+1 = highs about 3x louder, roughly +9.5 dB).
const DULL_TOP_HZ = 12000;
const DULL_HZ = 700;
const BRIGHT_HZ = 1500;
const BRIGHT_BOOST = 2;
export const dullCutoff = (k) => DULL_TOP_HZ * (DULL_HZ / DULL_TOP_HZ) ** k;

function brighten(x, sr, amount, warm) {
  if (amount < 0) {
    const hz = dullCutoff(-amount);
    return onePole(onePole(x, sr, hz, warm), sr, hz, warm);
  }
  const lp = onePole(x, sr, BRIGHT_HZ, warm), k = amount * BRIGHT_BOOST, out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] + (x[i] - lp[i]) * k;
  return out;
}

// Windowed-sinc (Lanczos) kernel in a table: SINC_ZEROS zero crossings each
// side, SINC_RES table steps per crossing.
const SINC_ZEROS = 8, SINC_RES = 512;
const SINC_TABLE = (() => {
  const t = new Float32Array(SINC_ZEROS * SINC_RES + 2);
  const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
  for (let i = 0; i < t.length; i++) { const x = i / SINC_RES; t[i] = x >= SINC_ZEROS ? 0 : sinc(x) * sinc(x / SINC_ZEROS); }
  return t;
})();
const kernel = (x) => { x = x < 0 ? -x : x; const p = x * SINC_RES, i = p | 0; return i >= SINC_ZEROS * SINC_RES ? 0 : SINC_TABLE[i] + (SINC_TABLE[i + 1] - SINC_TABLE[i]) * (p - i); };

/**
 * Resample to change pitch: +12 semitones plays twice as fast (half the length),
 * -12 half as fast (twice the length). New length = round(n / 2^(semitones/12)).
 * Windowed-sinc interpolation keeps the top end (straight-line or cubic
 * interpolation smear it away, so noisy sounds got duller when pitched up), and
 * when pitching up the kernel is widened so nothing folds back above the new
 * Nyquist limit. A loop is stretched to exactly fit its new length and reads
 * across its seam, so it still wraps cleanly; a one-shot reads silence past its ends.
 */
function repitch(x, sr, semitones, loop) {
  const ratio = Math.pow(2, semitones / 12), n = x.length;
  const m = Math.max(1, Math.round(n / ratio));
  const stepIn = loop ? n / m : ratio;
  const fc = Math.min(1, 1 / stepIn), half = Math.ceil(SINC_ZEROS / fc);
  const out = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const pos = i * stepIn, j0 = Math.floor(pos);
    let acc = 0;
    for (let j = j0 - half + 1; j <= j0 + half; j++) {
      let v;
      if (j >= 0 && j < n) v = x[j];
      else if (loop) v = x[((j % n) + n) % n];
      else continue;
      acc += v * kernel((pos - j) * fc);
    }
    out[i] = acc * fc;
  }
  return out;
}

const rmsOf = (chs) => { let s = 0, k = 0; for (const c of chs) for (let i = 0; i < c.length; i++) { s += c[i] * c[i]; k++; } return Math.sqrt(s / Math.max(1, k)); };

// Soft limiter: untouched up to LIMIT_KNEE, then eased so nothing reaches 1.
const LIMIT_KNEE = 0.85;
const limit = (v) => {
  const a = v < 0 ? -v : v;
  if (a <= LIMIT_KNEE) return v;
  const y = LIMIT_KNEE + (1 - LIMIT_KNEE) * Math.tanh((a - LIMIT_KNEE) / (1 - LIMIT_KNEE));
  return v < 0 ? -y : y;
};

/**
 * Apply a theme's sound settings to what renderPatch returned.
 * sound: { pitch (semitones), brightness (-1 duller .. 1 brighter) }.
 * Returns a new object of the same shape; the input is not changed.
 * Stereo stays stereo. The result is matched to the input's loudness (RMS,
 * gain at most 8x, enough for a 700 Hz dull on a hiss-only sound), then a
 * soft limiter keeps every sample below 1.
 * Neutral settings return identical samples.
 */
export function applySound(rendered, sound) {
  const s = { pitch: 0, brightness: 0, ...(sound || {}) };
  const pitch = Number.isFinite(Number(s.pitch)) ? Number(s.pitch) : 0;
  const bright = Math.max(-1, Math.min(1, Number(s.brightness) || 0));
  const sr = rendered.sampleRate, loop = !!rendered.loop;
  const ins = rendered.channels && rendered.channels.length ? rendered.channels : [rendered.samples];
  let chs;
  if (pitch === 0 && bright === 0) chs = ins.map((c) => c.slice());
  else {
    const warm = loop ? 4096 : 0;
    chs = ins.map((c) => {
      let y = pitch !== 0 ? repitch(c, sr, pitch, loop) : c;
      if (bright !== 0) y = brighten(y, sr, bright, warm);
      return y === c ? c.slice() : y;
    });
    const rIn = rmsOf(ins), rOut = rmsOf(chs);
    const g = rOut > 1e-9 ? Math.min(8, rIn / rOut) : 1;
    for (const c of chs) for (let i = 0; i < c.length; i++) c[i] = limit(c[i] * g);
  }
  const n = chs[0].length;
  let samples = chs[0];
  if (chs.length === 2) { samples = new Float32Array(n); for (let i = 0; i < n; i++) samples[i] = (chs[0][i] + chs[1][i]) * 0.5; }
  return { ...rendered, samples, channels: chs, duration: n / sr };
}

// ---- controls ------------------------------------------------------------------------

/** Clamp to the control's range and snap to its allowed values (named options, or steps). */
function snapParam(d, v) {
  v = Number(v);
  if (!Number.isFinite(v)) v = d.default;
  if (d.options) v = Math.round(v);
  else if (d.step) v = d.min + Math.round((v - d.min) / d.step) * d.step;
  return v < d.min ? d.min : v > d.max ? d.max : v;
}

const findParam = (patch, id) => (patch.params || []).find((d) => d.id === id);

/**
 * The controls to render `patch` with under `theme`.
 * Music: theme.music.tempo multiplies the `bpm` control; theme.music.intensity
 * (when not null) sets the `intensity` control; theme.sound.pitch moves the
 * `key` control (rounded to whole semitones and folded by octaves to stay in
 * range, so the tune keeps its key and its timing).
 * Sound effects with theme.shapes on: one of the sound's named styles, picked
 * from theme.seed and the sound's id.
 * Every value is clamped and snapped to what the control allows.
 */
export function themedSoundParams(patch, baseParams, theme) {
  const t = normalizeTheme(theme);
  let p = { ...defaultParams(patch), ...(baseParams || {}) };
  if (isMusic(patch)) {
    const bpm = findParam(patch, 'bpm');
    const tempo = Number(t.music.tempo);
    if (bpm && Number.isFinite(tempo) && tempo > 0 && tempo !== 1) p.bpm = Math.round(Number(p.bpm) * tempo * 100) / 100;
    if (findParam(patch, 'intensity') && t.music.intensity !== null && t.music.intensity !== undefined && Number.isFinite(Number(t.music.intensity))) p.intensity = Number(t.music.intensity);
    const key = findParam(patch, 'key');
    const semis = Math.round(Number(t.sound.pitch) || 0);
    if (key && semis !== 0) {
      let k = Math.round(Number(p.key) || 0) + semis;
      while (k > key.max && k - 12 >= key.min) k -= 12;
      while (k < key.min && k + 12 <= key.max) k += 12;
      p.key = k;
    }
  } else if (t.shapes && patch.presets) {
    const names = Object.keys(patch.presets);
    if (names.length) p = { ...p, ...patch.presets[names[Math.floor(rng(assetSeed(t.seed, patch.id))() * names.length)]] };
  }
  const out = {};
  for (const d of patch.params || []) out[d.id] = snapParam(d, p[d.id]);
  return out;
}
