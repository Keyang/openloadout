// Checks a music patch against what was written: which notes are sounding in each bar,
// how the mix changes with a parameter, and whether the loop repeats exactly.
// usage: node tools/compose/verify_music.mjs <patch.json> <bars> [param for the layer test]
import fs from 'node:fs';
import { renderPatch, defaultParams } from '../../sound/sfx-engine.js';
import { analyze, pulse, seam, barPitchClasses, PITCH_NAMES } from '../../sound/analyze.js';
const [file, barsArg, layerParam] = process.argv.slice(2);
const patch = JSON.parse(fs.readFileSync(file, 'utf8')), bars = Number(barsArg || 8);
const r = renderPatch(patch, { params: { ...defaultParams(patch) } });
const x = r.samples, sr = r.sampleRate;
console.log(`${patch.name}: ${r.duration.toFixed(2)} s, ${r.channels.length === 2 ? 'stereo' : 'mono'}, raw peak ${r.rawPeak.toFixed(2)}, seam ${seam(x).toFixed(1)}x, pulse ${pulse(x, sr).slice(0, 2).map((p) => p.bpm + ' bpm').join(' / ')}`);
console.log('bar  strongest pitch classes (share of tonal energy, 100 Hz - 2 kHz)');
// the method lives in sound/analyze.js (barPitchClasses), where the quality bar's M-chords check uses it too
barPitchClasses(x, sr, bars).forEach((pc, b) => {
  const top = pc.map((v, i) => [PITCH_NAMES[i], v]).sort((a, c) => c[1] - a[1]).slice(0, 4);
  console.log(`${String(b + 1).padStart(3)}  ${top.map(([n, v]) => `${n} ${Math.round(v * 100)}%`).join('  ')}`);
});
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
