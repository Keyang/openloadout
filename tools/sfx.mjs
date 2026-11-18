#!/usr/bin/env node
// sfx.mjs — command-line companion to the engine. Lets an agent validate,
// render and "look at" a patch without a browser or ears.
//
//   node tools/sfx.mjs check  <patch.json> [more.json ...] [--json] [--no-cache]   the quality bar (quality/sound.js, cached in .cache/quality.json): validate, render, measure, test every parameter
//   node tools/sfx.mjs render <patch.json> [-o out.wav] [--png out.png] [--set id=value ...] [--preset name] [--seed n]
//   node tools/sfx.mjs nodes                                 print the node and expression reference
//   node tools/sfx.mjs index  [sounds-dir]                   rebuild sounds/index.json for the website

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { validatePatch, renderPatch, defaultParams, NODE_TYPES, EXPRESSION_FUNCTIONS, FORMAT } from '../sound/sfx-engine.js';
import { analyze, spectrogram } from '../sound/analyze.js';
import { runQuality } from './lib/quality-run.mjs';
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

// Human-readable report of one quality/sound.js result (the same lines the checker always printed).
function formatCheck(file, patch, r) {
  const m = r.metrics, lines = [];
  lines.push(`${patch.id || path.basename(file)}  "${patch.name || '?'}"${patch.loop ? '  [loop]' : ''}`);
  if (!m.valid) {
    for (const e of r.errors) lines.push(`  ERROR: ${e}`);
    for (const w of r.warnings) lines.push(`  WARN: ${w}`);
    lines.push('  RESULT: FAIL — fix the errors above.');
    return lines.join('\n');
  }
  const a = m.analysis;
  lines.push(`  render   ${a.seconds.toFixed(2)} s in ${m.renderMs} ms (${m.realtime.toFixed(0)}x realtime) · raw peak ${m.rawPeak.toFixed(2)} · rms ${a.rmsDb.toFixed(1)} dBFS after normalise`);
  lines.push(`  loudness ${a.contour}   (time →, 6 dB per step)`);
  lines.push(`  timing   attack ${a.attackMs.toFixed(0)} ms · sounding ${a.soundingSeconds.toFixed(2)} s · end level ${a.endLevelDb.toFixed(0)} dB`);
  lines.push(`  spectrum centroid ${hz(a.centroidHz.start)} → ${hz(a.centroidHz.middle)} → ${hz(a.centroidHz.end)} Hz · strongest ${hz(a.dominantHz.start)} → ${hz(a.dominantHz.middle)} → ${hz(a.dominantHz.end)} Hz (start → middle → end)`);
  lines.push(`  bands    ${Object.entries(a.bands).map(([k, x]) => `${k} ${pct(x)}`).join(' · ')}`);
  const fmt = (x) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
  lines.push(`  nodes    peak |value|: ${m.nodes.map((n) => `${n.id} ${fmt(n.peak)}`).join(' · ')}`);
  if (m.loopSeam) {
    const pl = m.pulse || [];
    lines.push(`  loop     seam jump ${m.loopSeam.factor.toFixed(1)}x typical${m.loopSeam.factor > 8 ? ' (may click)' : ''} · ${m.stereo ? 'stereo' : 'mono'}${pl.length ? ` · pulse ${pl.map((p) => `${p.bpm} bpm (${p.strength})`).join(', ')}` : ' · no steady pulse'}`);
  }
  if (m.music) lines.push(`  music    tempo written ${m.music.writtenBpm ?? '?'} bpm, detected ${m.music.detectedBpm ?? 'none'} · length control ${m.music.lengthControl ?? 'none'} · melody instrument control ${m.music.instrumentControl ?? 'none'}`);
  if (m.params.length) lines.push('  params   change from min → max (average dB of spectral change; below 1.5 is barely audible)');
  for (const p of m.params) lines.push(`    ${p.id.padEnd(12)} ${p.distance.toFixed(1).padStart(5)} dB  (${p.min}..${p.max}, default ${p.default})${p.flags.length ? '  ← ' + p.flags.join('; ') : ''}`);
  lines.push(`  variation seed 1 vs seed 2: ${m.variation.toFixed(1)} dB${m.variation < 0.2 ? ' (identical every time — use rnd(lo, hi) or noise if repeats should differ)' : ''}`);
  if (m.presets.length) lines.push(`  presets  ${m.presets.join(', ')}`);
  for (const e of r.errors) lines.push(`  ERROR: ${e}`);
  for (const w of r.warnings) lines.push(`  WARN: ${w}`);
  for (const n of r.notes) lines.push(`  NOTE: ${n}`);
  const ok = !r.errors.length;
  lines.push(ok ? `  RESULT: PASS${r.warnings.length || r.notes.length ? ' with notes' : ''}` : '  RESULT: FAIL');
  return lines.join('\n');
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
  const json = args.includes('--json');
  const ci = args.indexOf('--cache-file');
  const cacheFile = ci >= 0 ? path.resolve(args[ci + 1]) : undefined;
  const files = args.filter((a, i) => !a.startsWith('--') && !(ci >= 0 && i === ci + 1) && path.basename(a) !== 'index.json');
  if (!files.length) fail('usage: sfx.mjs check <patch.json> [...] [--json] [--no-cache] [--cache-file <path>]');
  for (const f of files) if (!fs.existsSync(f)) fail(`cannot read ${f}`);
  const run = await runQuality({ sprites: [], sounds: files, cache: !args.includes('--no-cache'), cacheFile });
  if (run.notice && !json) console.log(`note: ${run.notice}\n`);
  if (json) console.log(JSON.stringify({ ok: run.results.every((r) => r.ok), metaChecked: run.metaChecked, notice: run.notice, sounds: run.results }, null, 2));
  else for (const r of run.results) console.log(formatCheck(r.file, { id: r.id, name: r.name, loop: r.loop }, r) + (r.cached ? '\n  (from the cache: nothing it depends on has changed)' : '') + '\n');
  process.exit(run.results.every((r) => r.ok) ? 0 : 1);
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
