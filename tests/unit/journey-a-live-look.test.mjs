// J7.4: music in a look plays live. Its brightness is applied to the live output as IIR filters (app/sound-look.js
// liveBrightness); what is heard must match the download (sound/theme.js applySound) closely.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applySound, typicalHz } from '../../sound/theme.js';
import { liveBrightness, filterOffline, matchGain } from '../../app/sound-look.js';

const SR = 44100;
function noiseAndTones(n = SR) {
  const x = new Float32Array(n);
  let s = 7;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    x[i] = 0.12 * Math.sin((2 * Math.PI * 220 * i) / SR) + 0.06 * Math.sin((2 * Math.PI * 3300 * i) / SR) + 0.05 * ((s / 0x7fffffff) * 2 - 1);
  }
  return x;
}
const diff = (a, b) => { let e = 0, p = 0; for (let i = 0; i < a.length; i++) { e += (a[i] - b[i]) ** 2; p += a[i] ** 2; } return Math.sqrt(e / p); };

for (const brightness of [-0.4, -0.15, 0.3]) {
  test(`brightness ${brightness}: the live filters and gain give what the download has`, () => {
    const x = noiseAndTones();
    const raw = { samples: x, channels: [x], sampleRate: SR, duration: x.length / SR, loop: false };
    const want = applySound(raw, { pitch: 0, brightness }).channels[0];
    const coefs = liveBrightness(brightness, SR, typicalHz([x], SR));
    assert.ok(coefs.length > 0);
    const g = matchGain([x], coefs);
    const got = filterOffline(x, coefs).map((v) => v * g);
    assert.ok(diff(want, got) < 0.05, `within 5% (was ${diff(want, got).toFixed(4)})`);
  });
}

test('no brightness: no filters', () => {
  assert.deepEqual(liveBrightness(0, SR, 1000), []);
});
