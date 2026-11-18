#!/usr/bin/env node
// sfx.mjs — command-line companion to the engine. Lets an agent validate,
// render and "look at" a patch without a browser or ears.
//
//   node tools/sfx.mjs check  <patch.json> [more.json ...]   validate + render + measure + test every parameter
//   node tools/sfx.mjs render <patch.json> [-o out.wav] [--png out.png] [--set id=value ...] [--preset name] [--seed n]
//   node tools/sfx.mjs nodes                                 print the node and expression reference
//   node tools/sfx.mjs index  [sounds-dir]                   rebuild sounds/index.json for the website

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { validatePatch, renderPatch, createVoice, defaultParams, NODE_TYPES, EXPRESSION_FUNCTIONS, FORMAT } from '../sound/sfx-engine.js';
import { analyze, critique, fingerprint, fingerprintDistance, spectrogram, pulse, seam } from '../sound/analyze.js';
import { encodeWav } from '../sound/wav.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...args] = process.argv.slice(2);

function load(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { fail(`cannot read ${file}`); }
  try { return JSON.parse(text); } catch (e) { fail(`${file}: invalid JSON — ${e.message}`); }
}
function fail(msg) { console.error(msg); process.exit(1); }
const pct = (x) => `${Math.round(x * 100)}%`;
const hz = (x) => (x >= 1000 ? `${(x / 1000).toFixed(1)}k` : `${Math.round(x)}`);

function checkOne(file) {
  const patch = load(file);
  const v = validatePatch(patch);
  const lines = [];
  let ok = v.ok;
  lines.push(`${patch.id || path.basename(file)}  "${patch.name || '?'}"${patch.loop ? '  [loop]' : ''}`);
  for (const e of v.errors) lines.push(`  ERROR: ${e}`);
  for (const w of v.warnings) lines.push(`  WARN: ${w}`);
  if (!v.ok) { lines.push('  RESULT: FAIL — fix the errors above.'); return { ok: false, text: lines.join('\n') }; }

  const t0 = performance.now();
  const base = renderPatch(patch, { seed: 1 });
  const ms = performance.now() - t0;
  const a = analyze(base.samples, base.sampleRate);
  lines.push(`  render   ${a.seconds.toFixed(2)} s in ${ms.toFixed(0)} ms (${(a.seconds * 1000 / ms).toFixed(0)}x realtime) · raw peak ${base.rawPeak.toFixed(2)} · rms ${a.rmsDb.toFixed(1)} dBFS after normalise`);
  lines.push(`  loudness ${a.contour}   (time →, 6 dB per step)`);
  lines.push(`  timing   attack ${a.attackMs.toFixed(0)} ms · sounding ${a.soundingSeconds.toFixed(2)} s · end level ${a.endLevelDb.toFixed(0)} dB`);
  lines.push(`  spectrum centroid ${hz(a.centroidHz.start)} → ${hz(a.centroidHz.middle)} → ${hz(a.centroidHz.end)} Hz · strongest ${hz(a.dominantHz.start)} → ${hz(a.dominantHz.middle)} → ${hz(a.dominantHz.end)} Hz (start → middle → end)`);
  lines.push(`  bands    ${Object.entries(a.bands).map(([k, x]) => `${k} ${pct(x)}`).join(' · ')}`);
  {
    // Peak level of every node at the defaults: shows which layer dominates the mix and which is dead.
    const voice = createVoice(patch, { seed: 1 }), n = Math.round(Math.min(voice.duration, 30) * 44100);
    const pk = new Float64Array(voice.nodeIds.length);
    for (let i = 0; i < n; i++) { voice.tick(); for (let k = 0; k < pk.length; k++) { const x = Math.abs(voice.nodeValues[k]); if (x > pk[k]) pk[k] = x; } }
    const fmt = (x) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
    lines.push(`  nodes    peak |value|: ${voice.nodeIds.map((id, k) => `${id} ${fmt(pk[k])}`).join(' · ')}`);
  }
  const notes = critique(a, patch);
  if (patch.loop) {
    const sj = seam(base.samples), pl = pulse(base.samples, base.sampleRate);
    lines.push(`  loop     seam jump ${sj.toFixed(1)}x typical${sj > 8 ? ' (may click)' : ''} · ${base.channels.length === 2 ? 'stereo' : 'mono'}${pl.length ? ` · pulse ${pl.map((p) => `${p.bpm} bpm (${p.strength})`).join(', ')}` : ' · no steady pulse'}`);
    if (sj > 8 && Math.abs(base.samples[0] - base.samples[base.samples.length - 1]) > 0.05) notes.push('WARN: the loop point has a jump that may click.');
  }
  if (base.badSamples) notes.push(`ERROR: ${base.badSamples} non-finite samples in the render.`);

  const params = patch.params || [];
  if (!params.length) notes.push('WARN: no parameters — the sound cannot be remixed. Expose 3–7.');
  if (params.length) lines.push('  params   change from min → max (average dB of spectral change; below 1.5 is barely audible)');
  for (const p of params) {
    const lo = renderPatch(patch, { seed: 1, params: { [p.id]: p.min } });
    const hi = renderPatch(patch, { seed: 1, params: { [p.id]: p.max } });
    const secs = Math.max(lo.duration, hi.duration);
    const d = fingerprintDistance(fingerprint(lo.samples, lo.sampleRate, secs), fingerprint(hi.samples, hi.sampleRate, secs));
    const flags = [];
    for (const [label, r] of [['min', lo], ['max', hi]]) {
      const ax = analyze(r.samples, r.sampleRate);
      if (ax.peakDb < -40 || r.rawPeak < 1e-4) flags.push(`silent at ${label}`);
      if (r.badSamples) flags.push(`non-finite samples at ${label}`);
      if (!patch.loop && ax.endLevelDb > -12) flags.push(`cut off at ${label}`);
    }
    if (d < 1.5) flags.push('little audible effect — widen the range or wire it to something that matters');
    lines.push(`    ${p.id.padEnd(12)} ${d.toFixed(1).padStart(5)} dB  (${p.min}..${p.max}, default ${p.default})${flags.length ? '  ← ' + flags.join('; ') : ''}`);
    for (const f of flags) notes.push(`${f.startsWith('silent') || f.startsWith('non-finite') ? 'ERROR' : 'WARN'}: param '${p.id}': ${f}`);
  }
  const alt = renderPatch(patch, { seed: 2 });
  const vd = fingerprintDistance(fingerprint(base.samples, base.sampleRate, base.duration), fingerprint(alt.samples, alt.sampleRate, base.duration));
  lines.push(`  variation seed 1 vs seed 2: ${vd.toFixed(1)} dB${vd < 0.2 ? ' (identical every time — use rnd(lo, hi) or noise if repeats should differ)' : ''}`);
  for (const [name, set] of Object.entries(patch.presets || {})) {
    const r = renderPatch(patch, { seed: 1, params: set });
    if (analyze(r.samples, r.sampleRate).peakDb < -40) notes.push(`ERROR: preset '${name}' is silent`);
  }
  if (patch.presets) lines.push(`  presets  ${Object.keys(patch.presets).join(', ')}`);
  for (const n of notes) lines.push(`  ${n}`);
  if (notes.some((n) => n.startsWith('ERROR'))) ok = false;
  lines.push(ok ? `  RESULT: PASS${notes.length ? ' with notes' : ''}` : '  RESULT: FAIL');
  return { ok, text: lines.join('\n') };
}

// ---- PNG (waveform over log-frequency spectrogram), so a multimodal agent can view the sound.
function writePng(file, samples, sr) {
  const W = 720, HW = 90, HS = 230, H = HW + HS;
  const px = Buffer.alloc(W * H * 3, 16);
  const set = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
  const n = samples.length;
  for (let x = 0; x < W; x++) {
    const a = Math.floor((x * n) / W), b = Math.max(a + 1, Math.floor(((x + 1) * n) / W));
    let lo = 1, hi = -1;
    for (let i = a; i < b; i++) { if (samples[i] < lo) lo = samples[i]; if (samples[i] > hi) hi = samples[i]; }
    const y0 = Math.round((HW / 2) * (1 - hi)), y1 = Math.round((HW / 2) * (1 - lo));
    for (let y = y0; y <= y1; y++) set(x, Math.min(HW - 1, y), 120, 220, 200);
  }
  const frames = spectrogram(samples, 2048, Math.max(32, Math.floor(n / W)));
  const F = frames.length, fmin = 40, fmax = Math.min(20000, sr / 2), binHz = sr / 2048;
  for (let x = 0; x < W; x++) {
    const fr = frames[Math.min(F - 1, Math.floor((x * F) / W))];
    for (let y = 0; y < HS; y++) {
      const f = fmin * Math.pow(fmax / fmin, 1 - y / HS);
      const k = Math.min(1023, Math.max(1, Math.round(f / binHz)));
      const d = Math.max(0, Math.min(1, (20 * Math.log10(fr[k] + 1e-9) + 80) / 80));
      set(x, HW + y, Math.round(255 * Math.min(1, d * 1.6)), Math.round(255 * d * d), Math.round(255 * Math.max(0.08, Math.sin(d * 3.14) * 0.6)));
    }
  }
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

if (cmd === 'check') {
  if (!args.length) fail('usage: sfx.mjs check <patch.json> [...]');
  let allOk = true;
  for (const f of args) { if (path.basename(f) === 'index.json') continue; const r = checkOne(f); console.log(r.text + '\n'); if (!r.ok) allOk = false; }
  process.exit(allOk ? 0 : 1);
} else if (cmd === 'render') {
  const file = args[0]; if (!file) fail('usage: sfx.mjs render <patch.json> [-o out.wav] [--png out.png] [--set id=value] [--preset name] [--seed n]');
  const patch = load(file);
  const v = validatePatch(patch); if (!v.ok) fail(v.errors.map((e) => `ERROR: ${e}`).join('\n'));
  let out = null, png = null, seed = 1; const params = defaultParams(patch);
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '-o') out = args[++i];
    else if (args[i] === '--png') png = args[++i];
    else if (args[i] === '--seed') seed = parseInt(args[++i], 10);
    else if (args[i] === '--preset') { const s = (patch.presets || {})[args[++i]]; if (!s) fail(`no preset '${args[i]}'`); Object.assign(params, s); }
    else if (args[i] === '--set') { const [k, val] = args[++i].split('='); if (!(k in params)) fail(`no parameter '${k}'`); params[k] = parseFloat(val); }
    else fail(`unknown option ${args[i]}`);
  }
  const r = renderPatch(patch, { params, seed });
  if (out) { fs.writeFileSync(out, Buffer.from(encodeWav(r.channels.length === 2 ? r.channels : r.samples, r.sampleRate))); console.log(`wrote ${out} (${r.duration.toFixed(2)} s, ${(fs.statSync(out).size / 1024).toFixed(0)} KB; the patch itself is ${(JSON.stringify(patch).length / 1024).toFixed(1)} KB)`); }
  if (png) { writePng(png, r.samples, r.sampleRate); console.log(`wrote ${png} (top: waveform; bottom: spectrogram, 40 Hz at the bottom to 20 kHz at the top, log scale, time left to right)`); }
  if (!out && !png) console.log(JSON.stringify(analyze(r.samples, r.sampleRate), null, 2));
} else if (cmd === 'nodes') {
  console.log(`Patch format ${FORMAT} — node reference (generated from the engine)\n`);
  for (const [name, t] of Object.entries(NODE_TYPES)) {
    console.log(`${name} — ${t.doc}`);
    for (const [f, [kind, dflt, doc]] of Object.entries(t.fields)) console.log(`    ${f.padEnd(9)} ${kind.padEnd(6)} ${dflt === undefined || dflt === null ? '' : `default ${JSON.stringify(dflt)}. `}${doc}`);
    console.log('');
  }
  console.log('Field kinds: sig = number or expression, may read node outputs (changes every sample); con = number or expression of parameters only.');
  console.log(`Expression functions: ${EXPRESSION_FUNCTIONS.join(', ')}`);
  console.log('Expression names: any parameter id, any node id (its current output), t (seconds since start), dur (patch duration), sr, pi, tau.');
  console.log('Operators: + - * / % ^  < > <= >= == !=  && ||  cond ? a : b');
} else if (cmd === 'index') {
  const dir = path.resolve(args[0] || path.join(ROOT, 'sounds'));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
  const list = [];
  for (const f of files) {
    const p = load(path.join(dir, f)); const v = validatePatch(p);
    if (!v.ok) { console.error(`skipping ${f}: ${v.errors[0]}`); continue; }
    list.push({ file: f, id: p.id, name: p.name, category: p.category || 'other', loop: !!p.loop });
  }
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ format: FORMAT, patches: list }, null, 2) + '\n');
  console.log(`indexed ${list.length} patches → ${path.join(dir, 'index.json')}`);
} else {
  console.log('usage: sfx.mjs check|render|nodes|index — see the header of this file');
  process.exit(cmd ? 1 : 0);
}
