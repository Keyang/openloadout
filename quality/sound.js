// The sound and music quality bar as code. Pure JavaScript: no file, DOM or Node
// access, so it runs in the site build, the command-line checker and a browser.
//
//   checkSound(patch, { validateMeta }) -> { errors: [...], warnings: [...], notes: [...], metrics: {...} }
//
// validateMeta  (meta, kind) -> { ok, errors } from catalog/schema.js; when missing, metadata is not checked
//
// The checks render the patch at its defaults, at the lowest and highest setting of every
// control, with a second random seed, and with every preset. A music track takes minutes.
// Every threshold is in THRESHOLDS and written down in docs/quality-bar.md.

import { validatePatch, renderPatch, createVoice } from '../sound/sfx-engine.js';
import { analyze, critique, fingerprint, fingerprintDistance, pulse, seam } from '../sound/analyze.js';

export const THRESHOLDS = {
  silentDb: -40,            // peak below this is silence
  audibleChangeDb: 1.5,     // a control should move the fingerprint by more than this between its ends (warning)
  deadControlDb: 0.01,      // below this a control changes nothing at all (error)
  cutOffDb: -12,            // a one-shot whose last 1/32 is louder than this (re. loudest) at a control end is cut off
  seamFactor: 8,            // loop seam: sample jump at the wrap vs typical step...
  seamJump: 0.05,           // ...and the absolute jump must also exceed this to count as a click
  tempoTolerance: 2,        // detected tempo within this many bpm of written (or half / double)
  sameSeedDb: 0.2,          // seed 1 vs seed 2 below this: every play is identical
  minControls: 3, maxControls: 7, maxMusicControls: 10,
  nodeSeconds: 30,          // node-level peaks are measured over at most this long
};

const now = () => (typeof performance !== 'undefined' ? performance : Date).now();

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

export function checkSound(patch, { validateMeta } = {}) {
  const t0 = now();
  const T = THRESHOLDS;
  const errors = [], warnings = [], notes = [];
  const type = soundType(patch);
  // a looping track is "music"; a short sting is a "jingle" (meta.type and category "jingle") and is judged as a one-shot
  const isMusic = type === 'music';
  const metrics = { id: patch?.id, name: patch?.name, type, loop: !!patch?.loop, valid: false, metaChecked: false };
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
  for (const p of params) {
    const lo = renderPatch(patch, { seed: 1, params: { [p.id]: p.min } });
    const hi = renderPatch(patch, { seed: 1, params: { [p.id]: p.max } });
    const secs = Math.max(lo.duration, hi.duration);
    const d = fingerprintDistance(fingerprint(lo.samples, lo.sampleRate, secs), fingerprint(hi.samples, hi.sampleRate, secs));
    const flags = [];
    for (const [label, r] of [['min', lo], ['max', hi]]) {
      const ax = analyze(r.samples, r.sampleRate);
      if (ax.peakDb < T.silentDb || r.rawPeak < 1e-4) flags.push(`silent at ${label}`);
      if (r.badSamples) flags.push(`non-finite samples at ${label}`);
      if (!patch.loop && ax.endLevelDb > T.cutOffDb) flags.push(`cut off at ${label}`);
    }
    if (d < T.deadControlDb) flags.push('changes nothing — wire it to something or remove it');
    else if (d < T.audibleChangeDb) flags.push('little audible effect — widen the range or wire it to something that matters');
    metrics.params.push({ id: p.id, min: p.min, max: p.max, default: p.default, distance: d, flags });
    for (const f of flags) (/^(silent|non-finite|changes nothing)/.test(f) ? errors : warnings).push(`param '${p.id}': ${f}`);
  }

  // ---- takes and presets ----------------------------------------------------------------------
  const alt = renderPatch(patch, { seed: 2 });
  metrics.variation = fingerprintDistance(fingerprint(base.samples, base.sampleRate, base.duration), fingerprint(alt.samples, alt.sampleRate, base.duration));
  metrics.presets = Object.keys(patch.presets || {});
  for (const [name, set] of Object.entries(patch.presets || {})) {
    const r = renderPatch(patch, { seed: 1, params: set });
    if (analyze(r.samples, r.sampleRate).peakDb < T.silentDb) errors.push(`preset '${name}' is silent`);
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
  }

  return finish();

  function finish() {
    metrics.ms = Math.round(now() - t0);
    return { errors, warnings, notes, metrics };
  }
}
