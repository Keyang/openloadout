// Renders a looping patch for several passes while one parameter climbs, the way a
// game would drive it live — e.g. battle music whose intensity rises with the fight.
// usage: node tools/compose/render_ramp.mjs <patch.json> <param> <out.wav> [values, comma separated]
import fs from 'node:fs';
import { createVoice } from '../../sound/sfx-engine.js';
import { encodeWav } from '../../sound/wav.js';
const [file, param, out, list] = process.argv.slice(2);
const patch = JSON.parse(fs.readFileSync(file, 'utf8'));
const p = patch.params.find((q) => q.id === param);
const values = list ? list.split(',').map(Number) : [0, 0.33, 0.66, 1].map((u) => p.min + (p.max - p.min) * u);
const sr = 44100, voice = createVoice(patch, { sampleRate: sr, params: { [param]: values[0] } });
const pass = Math.round(voice.duration * sr), n = pass * values.length;
const L = new Float32Array(n), R = new Float32Array(n);
for (let i = 0; i < n; i++) {
  if (i % pass === 0) voice.setParam(param, values[i / pass], true);
  L[i] = voice.tick(); R[i] = voice.stereo ? voice.right : L[i];
}
const fade = Math.round(0.05 * sr);
for (let i = 0; i < fade; i++) { L[n - 1 - i] *= i / fade; R[n - 1 - i] *= i / fade; }
fs.writeFileSync(out, Buffer.from(encodeWav([L, R], sr)));
console.log(`wrote ${out}: ${(n / sr).toFixed(1)} s, ${param} = ${values.join(' → ')} (one loop each)`);
