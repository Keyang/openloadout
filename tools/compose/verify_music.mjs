// Checks a music patch against what was written: which notes are sounding in each bar,
// how the mix changes with a parameter, and whether the loop repeats exactly.
// usage: node tools/compose/verify_music.mjs <patch.json> <bars> [param for the layer test]
import fs from 'node:fs';
import { renderPatch, defaultParams } from '../../sound/sfx-engine.js';
import { analyze, fft, pulse, seam } from '../../sound/analyze.js';
const [file, barsArg, layerParam] = process.argv.slice(2);
const patch = JSON.parse(fs.readFileSync(file, 'utf8')), bars = Number(barsArg || 8);
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const r = renderPatch(patch, { params: { ...defaultParams(patch) } });
const x = r.samples, sr = r.sampleRate, barLen = Math.floor(x.length / bars), N = 32768;
console.log(`${patch.name}: ${r.duration.toFixed(2)} s, ${r.channels.length === 2 ? 'stereo' : 'mono'}, raw peak ${r.rawPeak.toFixed(2)}, seam ${seam(x).toFixed(1)}x, pulse ${pulse(x, sr).slice(0, 2).map((p) => p.bpm + ' bpm').join(' / ')}`);
console.log('bar  strongest pitch classes (share of tonal energy, 100 Hz - 2 kHz)');
for (let b = 0; b < bars; b++) {
  const re = new Float32Array(N), im = new Float32Array(N), len = Math.min(N, barLen);
  for (let i = 0; i < len; i++) re[i] = x[b * barLen + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len));
  fft(re, im);
  const pc = new Float64Array(12);
  for (let k = 2; k < N / 2 - 1; k++) {
    const f = (k * sr) / N; if (f < 100 || f > 2000) continue;
    const m = Math.hypot(re[k], im[k]), ml = Math.hypot(re[k - 1], im[k - 1]), mr = Math.hypot(re[k + 1], im[k + 1]);
    if (m > ml && m >= mr) pc[((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12] += m * m;  // spectral peaks only
  }
  const tot = pc.reduce((a, v) => a + v, 0) || 1;
  const top = [...pc].map((v, i) => [NAMES[i], v / tot]).sort((a, c) => c[1] - a[1]).slice(0, 4);
  console.log(`${String(b + 1).padStart(3)}  ${top.map(([n, v]) => `${n} ${Math.round(v * 100)}%`).join('  ')}`);
}
if (layerParam) {
  const p = patch.params.find((q) => q.id === layerParam);
  console.log(`\n${layerParam}  rms dBFS  sub/low/lowmid/mid/high/air %`);
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const v = p.min + (p.max - p.min) * u, rr = renderPatch(patch, { params: { ...defaultParams(patch), [layerParam]: v } });
    let sq = 0; for (const s of rr.samples) sq += s * s;
    const a = analyze(rr.samples, rr.sampleRate);
    console.log(`${v.toFixed(2).padStart(9)}  ${(10 * Math.log10(sq / rr.samples.length)).toFixed(1).padStart(8)}  ${Object.values(a.bands).map((b) => String(Math.round(b * 100)).padStart(3)).join(' ')}   peak ${rr.rawPeak.toFixed(2)}`);
  }
}
