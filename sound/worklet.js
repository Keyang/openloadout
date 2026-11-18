// worklet.js — runs a patch live on the audio thread, so parameter changes are
// heard immediately (engine RPM, wind strength, …). Loaded by player.js.
import { createVoice } from './sfx-engine.js';

class SfxVoice extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voice = null; this.gain = 1; this.fade = 1; this.fadeStep = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      try {
        if (m.type === 'load') {
          this.voice = createVoice(m.patch, { sampleRate, params: m.params, seed: m.seed });
          this.gain = m.gain || 1; this.fade = 0; this.fadeStep = 1 / (0.02 * sampleRate);
        } else if (m.type === 'param' && this.voice) {
          this.voice.setParam(m.id, m.value, true);
        } else if (m.type === 'stop') {
          this.fadeStep = -1 / (0.05 * sampleRate);
        }
      } catch (err) { this.voice = null; this.port.postMessage({ type: 'error', message: String(err.message || err) }); }
    };
  }
  process(_inputs, outputs) {
    const left = outputs[0][0], rightOut = outputs[0][1];
    if (!this.voice) return true;
    const stereo = this.voice.stereo;
    for (let i = 0; i < left.length; i++) {
      this.fade += this.fadeStep;
      if (this.fade >= 1) { this.fade = 1; this.fadeStep = 0; }
      if (this.fade <= 0) { this.voice = null; left.fill(0, i); if (rightOut) rightOut.fill(0, i); return false; }
      const g = this.gain * this.fade;
      const l = limit(this.voice.tick() * g);
      left[i] = l;
      if (rightOut) rightOut[i] = stereo ? limit(this.voice.right * g) : l;
    }
    return true;
  }
}
function limit(y) {
  if (!(y === y)) return 0;
  const a = y < 0 ? -y : y;
  return a > 0.8 ? Math.sign(y) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)) : y;
}
registerProcessor('sfx-voice', SfxVoice);
