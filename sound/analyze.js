// analyze.js — measurements of a rendered sound, so an agent (or a test) can
// check a patch without listening to it. Pure JS; shared by the CLI and the site.

/** Fast Fourier transform, in place: re and im are arrays of the same power-of-two length and are overwritten with the result. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// Magnitude spectrogram: frames[f][bin], linear magnitude.
export function spectrogram(samples, size = 1024, hop = 256) {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  const frames = [];
  const re = new Float32Array(size), im = new Float32Array(size);
  for (let s = -size / 2; s < samples.length - size / 2; s += hop) {
    for (let i = 0; i < size; i++) { const j = s + i; re[i] = j >= 0 && j < samples.length ? samples[j] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    const mag = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) mag[i] = Math.hypot(re[i], im[i]) / (size / 4);
    frames.push(mag);
  }
  return frames;
}

const BANDS = [['sub <80', 0, 80], ['low 80-300', 80, 300], ['lowmid 300-1k', 300, 1000], ['mid 1k-4k', 1000, 4000], ['high 4k-10k', 4000, 10000], ['air >10k', 10000, 1e9]];
const SPARK = '▁▂▃▄▅▆▇█';
const dB = (x) => (x > 1e-9 ? 20 * Math.log10(x) : -180);

/**
 * Measure a rendered sound: length, peak and loudness in dB, clipped samples, where the energy sits by band,
 * brightness, how it starts and ends. samples: one channel; sr: its sample rate. Returns plain numbers and short text.
 */
export function analyze(samples, sr) {
  const n = samples.length;
  let peak = 0, sum = 0, sq = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i], a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum += v; sq += v * v;
  }
  const rms = Math.sqrt(sq / n);
  // Loudness contour: 32 RMS windows.
  const W = 32, env = [];
  for (let w = 0; w < W; w++) {
    const a = Math.floor((w * n) / W), b = Math.floor(((w + 1) * n) / W);
    let s = 0; for (let i = a; i < b; i++) s += samples[i] * samples[i];
    env.push(Math.sqrt(s / Math.max(1, b - a)));
  }
  const envMax = Math.max(...env, 1e-9);
  const contour = env.map((e) => SPARK[Math.max(0, Math.min(7, Math.round((1 + dB(e / envMax) / 48) * 7)))]).join('');
  // Onset, attack and effective end (relative to peak).
  const thr = peak * 0.01;
  let first = 0, last = n - 1;
  while (first < n && Math.abs(samples[first]) < thr) first++;
  while (last > 0 && Math.abs(samples[last]) < thr) last--;
  let tPeak = first;
  for (let i = first; i < n; i++) if (Math.abs(samples[i]) >= peak * 0.9) { tPeak = i; break; }
  // Spectrum.
  const frames = spectrogram(samples, 1024, 256);
  const bins = 512, hz = sr / 1024;
  const centroidOf = (a, b) => {
    let num = 0, den = 0;
    for (let f = a; f < b; f++) for (let k = 1; k < bins; k++) { const p = frames[f][k] * frames[f][k]; num += p * k * hz; den += p; }
    return den > 0 ? num / den : 0;
  };
  const domOf = (a, b) => {
    const acc = new Float64Array(bins);
    for (let f = a; f < b; f++) for (let k = 1; k < bins; k++) acc[k] += frames[f][k] * frames[f][k];
    let best = 1; for (let k = 2; k < bins; k++) if (acc[k] > acc[best]) best = k;
    return best * hz;
  };
  const F = frames.length, third = Math.max(1, Math.floor(F / 3));
  const bandPow = BANDS.map(() => 0); let total = 0;
  for (let f = 0; f < F; f++) for (let k = 1; k < bins; k++) {
    const p = frames[f][k] * frames[f][k], fr = k * hz;
    for (let b = 0; b < BANDS.length; b++) if (fr >= BANDS[b][1] && fr < BANDS[b][2]) { bandPow[b] += p; break; }
    total += p;
  }
  return {
    seconds: n / sr,
    peakDb: dB(peak), rmsDb: dB(rms), crestDb: dB(peak) - dB(rms),
    dcOffset: sum / n, clippedSamples: clipped,
    leadSilenceMs: (first / sr) * 1000,
    attackMs: ((tPeak - first) / sr) * 1000,
    soundingSeconds: Math.max(0, (last - first) / sr),
    tailSilenceMs: ((n - 1 - last) / sr) * 1000,
    endLevelDb: dB(env[W - 1] / envMax),
    contour,
    centroidHz: { all: centroidOf(0, F), start: centroidOf(0, third), middle: centroidOf(third, Math.min(F, 2 * third)), end: centroidOf(Math.min(F - 1, 2 * third), F) },
    dominantHz: { start: domOf(0, third), middle: domOf(third, Math.min(F, 2 * third)), end: domOf(Math.min(F - 1, 2 * third), F) },
    bands: Object.fromEntries(BANDS.map((b, i) => [b[0], total > 0 ? bandPow[i] / total : 0])),
    onsetMs: onsetMs(samples, sr),
    above300: total > 0 ? 1 - (bandPow[0] + bandPow[1]) / total : 0,
  };
}

/**
 * Where a sound starts: milliseconds from the start of the render to the first sample within `db` of the loudest one.
 * samples: one channel; sr: its sample rate; db: how far below the peak counts as started (default -20, a tenth of
 * the peak). Unlike attackMs (time to the loudest moment) it does not grow when a later note or thud is louder. 0 for silence.
 */
export function onsetMs(samples, sr, db = -20) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
  if (peak < 1e-9) return 0;
  const thr = peak * Math.pow(10, db / 20);
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) >= thr) return (i / sr) * 1000;
  return 0;
}

/**
 * The note starts in a render, in seconds: the moments where the spectrum jumps (peaks of spectral flux), about 1.5 ms apart at best.
 * samples: one channel; sr: its sample rate; floor: a peak counts when it is at least this share of the biggest jump
 * (default 0.1); gapMs: two starts are at least this far apart (default 30). Every time is late by the same few
 * milliseconds, so compare two renders with onsetShift rather than reading one list as exact.
 */
export function onsets(samples, sr, { floor = 0.1, gapMs = 30 } = {}) {
  const hop = 64, frames = spectrogram(samples, 512, hop), F = frames.length, flux = new Float32Array(F);
  let max = 0;
  for (let f = 1; f < F; f++) {
    let s = 0; const a = frames[f], b = frames[f - 1];
    for (let k = 1; k < a.length; k++) { const d = a[k] - b[k]; if (d > 0) s += d; }
    flux[f] = s; if (s > max) max = s;
  }
  if (max < 1e-9) return [];
  const w = Math.max(1, Math.round(((gapMs / 1000) * sr) / hop)), out = [];
  for (let f = 1; f < F; f++) {
    if (flux[f] < max * floor) continue;
    let top = true;
    for (let g = Math.max(1, f - w); g <= Math.min(F - 1, f + w) && top; g++) if (flux[g] > flux[f] || (flux[g] === flux[f] && g < f)) top = false;
    if (top) out.push((f * hop) / sr);
  }
  return out;
}

/**
 * How far note starts move between two renders of the same sound. a, b: two lists from onsets(), in seconds.
 * Returns { ms, moved, count }: each start is paired with the nearest start in the other list; ms is the distance that
 * one start in ten exceeds (the 90th percentile), moved the share of starts 10 ms or more from their partner, count the starts compared.
 */
export function onsetShift(a, b) {
  const near = (x, list) => { let d = Infinity; for (const y of list) { const e = Math.abs(x - y); if (e < d) d = e; } return d; };
  const ds = [...a.map((x) => near(x, b)), ...b.map((x) => near(x, a))].filter(Number.isFinite).sort((p, q) => p - q);
  if (!ds.length) return { ms: 0, moved: 0, count: 0 };
  return { ms: ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.9))] * 1000, moved: ds.filter((d) => d >= 0.01).length / ds.length, count: ds.length };
}

/** The twelve note names, C first: the index is the pitch class barPitchClasses reports. */
export const PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Which notes sound in each bar: for every bar, the share of pitched energy on each of the 12 notes (index 0 is C; see PITCH_NAMES).
 * samples: one channel of a whole number of bars; sr: its sample rate; bars: how many bars it holds.
 * Each bar is windowed whole and only spectral peaks between 100 Hz and 2 kHz are counted, so drums and hiss add little.
 * Returns a list with one array of 12 shares per bar (they add up to 1; all 0 for a silent bar).
 */
export function barPitchClasses(samples, sr, bars) {
  const barLen = Math.floor(samples.length / bars), out = [];
  let N = 32768; while (N < barLen) N *= 2;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let b = 0; b < bars; b++) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < barLen; i++) re[i] = samples[b * barLen + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / barLen));
    fft(re, im);
    const pc = new Array(12).fill(0);
    let ml = Math.hypot(re[1], im[1]), m = Math.hypot(re[2], im[2]);
    for (let k = 2; k < N / 2 - 1; k++) {
      const mr = Math.hypot(re[k + 1], im[k + 1]), f = (k * sr) / N;
      if (f >= 100 && f <= 2000 && m > ml && m >= mr) pc[((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12] += m * m;  // spectral peaks only
      ml = m; m = mr;
    }
    const tot = pc.reduce((a, v) => a + v, 0);
    out.push(tot > 0 ? pc.map((v) => v / tot) : pc);
  }
  return out;
}

// Coarse log-frequency "fingerprint" (time × band, dB) used to measure how
// different two renders are — e.g. a parameter at its minimum vs its maximum.
export function fingerprint(samples, sr, seconds, T = 24, B = 20) {
  const n = Math.round(seconds * sr);
  const padded = new Float32Array(n); padded.set(samples.subarray(0, Math.min(n, samples.length)));
  const frames = spectrogram(padded, 1024, 256), F = frames.length, hz = sr / 1024;
  const out = new Float32Array(T * B), fmin = 40, fmax = Math.min(16000, sr / 2);
  for (let t = 0; t < T; t++) {
    const a = Math.floor((t * F) / T), b = Math.max(a + 1, Math.floor(((t + 1) * F) / T));
    for (let k = 0; k < B; k++) {
      const lo = fmin * Math.pow(fmax / fmin, k / B), hi = fmin * Math.pow(fmax / fmin, (k + 1) / B);
      const k0 = Math.max(1, Math.floor(lo / hz)), k1 = Math.max(k0 + 1, Math.ceil(hi / hz));
      let p = 0;
      for (let f = a; f < b && f < F; f++) for (let i = k0; i < k1 && i < 512; i++) p += frames[f][i] * frames[f][i];
      out[t * B + k] = Math.max(-70, 10 * Math.log10(p / ((b - a) * (k1 - k0)) + 1e-12));
    }
  }
  return out;
}
/** How different two fingerprints are, as the mean gap in dB over the cells where either one is audible (0 = the same). */
export function fingerprintDistance(a, b) {
  let s = 0, c = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] > -65 || b[i] > -65) { s += Math.abs(a[i] - b[i]); c++; } }
  return c ? s / c : 0;
}

// Human/agent-readable findings from an analysis.
export function critique(a, patch) {
  const notes = [];
  if (a.peakDb < -40) notes.push('ERROR: the render is silent (peak below -40 dBFS). Check that `out` reads a node that is actually producing signal and that envelopes are triggered.');
  if (!patch.loop) {
    if (a.leadSilenceMs > 30) notes.push(`WARN: ${a.leadSilenceMs.toFixed(0)} ms of silence before the sound starts — game SFX should start immediately.`);
    if (a.tailSilenceMs > 150 && a.tailSilenceMs > a.seconds * 1000 * 0.25) notes.push(`WARN: the last ${a.tailSilenceMs.toFixed(0)} ms are silent — shorten duration.`);
    if (a.endLevelDb > -18) notes.push(`WARN: the sound is still loud at the end (${a.endLevelDb.toFixed(0)} dB re. loudest window) — it will be cut off. Lengthen duration or shorten the decay.`);
  }
  if (Math.abs(a.dcOffset) > 0.05) notes.push(`WARN: DC offset ${a.dcOffset.toFixed(3)} — add a high-pass (filter mode hp, 30 Hz) before out.`);
  if (a.bands['sub <80'] > 0.6) notes.push('WARN: over 60% of the energy is below 80 Hz — inaudible on phone/laptop speakers. Add mid/high content.');
  else if (a.bands['sub <80'] + a.bands['low 80-300'] > 0.8) notes.push('NOTE: over 80% of the energy is below 300 Hz — fine for a rumble or thud, thin on phone speakers. Add a mid/high layer if it must read on small speakers.');
  if (a.crestDb < 3 && !patch.loop) notes.push('NOTE: very low crest factor (near-square or heavily clipped signal).');
  return notes;
}

// Music checks. pulse(): finds the strongest repeating beat periods from the
// onset pattern (spectral flux autocorrelation); returns candidates as BPM.
// Half and double tempo show up too, so read the list, not just the first entry.
/** The strongest repeating beats in a render, as tempo candidates: up to four { bpm, strength }, strongest first (half and double tempo show up too). */
export function pulse(samples, sr) {
  const hop = 256, frames = spectrogram(samples, 1024, hop), F = frames.length, fr = sr / hop;
  const flux = new Float32Array(F);
  for (let f = 1; f < F; f++) { let s = 0; for (let k = 1; k < 512; k++) { const d = frames[f][k] - frames[f - 1][k]; if (d > 0) s += d; } flux[f] = s; }
  let mean = 0; for (const v of flux) mean += v; mean /= F;
  let energy = 0; for (let i = 0; i < F; i++) { flux[i] -= mean; energy += flux[i] * flux[i]; }
  if (energy < 1e-9) return [];
  const score = (bpm) => {
    const lag = (60 / bpm) * fr, l0 = Math.floor(lag), u = lag - l0; let s = 0;
    for (let i = 0; i + l0 + 1 < F; i++) s += flux[i] * (flux[i + l0] * (1 - u) + flux[i + l0 + 1] * u);
    return s / energy;
  };
  const cands = [];
  for (let bpm = 50; bpm <= 220; bpm += 0.5) cands.push([bpm, score(bpm)]);
  const peaks = cands.filter((c, i) => i > 0 && i < cands.length - 1 && c[1] > cands[i - 1][1] && c[1] >= cands[i + 1][1] && c[1] > 0.1);
  return peaks.sort((x, y) => y[1] - x[1]).slice(0, 4).map(([bpm, strength]) => ({ bpm, strength: Math.round(strength * 100) / 100 }));
}
// seam(): how big the sample jump is where a loop wraps, relative to the
// ordinary sample-to-sample movement just before it. Above ~8 it may click.
export function seam(samples) {
  const n = samples.length, w = Math.min(2000, n >> 2); let typical = 0;
  for (let i = n - w; i < n; i++) typical += Math.abs(samples[i] - samples[i - 1]);
  typical = typical / w + 1e-6;
  return Math.abs(samples[0] - samples[n - 1]) / typical;
}
