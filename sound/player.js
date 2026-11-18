// player.js — the piece a web game imports. Plays patches through Web Audio:
//   const sfx = createPlayer();
//   sfx.play(laserPatch, { pitch: 2600 });            // one-shot, a new random variation each call
//   const engine = await sfx.live(enginePatch);       // continuous, parameters change while it runs
//   engine.set('rpm', 4200);  engine.stop();
import { renderPatch } from './sfx-engine.js';

// Options: context (reuse the game's AudioContext), destination (an AudioNode to play into,
// default the speakers), volume (0..1).
export function createPlayer(opts = {}) {
  let ctx = opts.context || null, master = null, workletReady = null;
  function context() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (!master) { master = ctx.createGain(); master.gain.value = opts.volume === undefined ? 0.8 : opts.volume; master.connect(opts.destination || ctx.destination); }
    return ctx;
  }
  return {
    get context() { return context(); },
    get output() { context(); return master; },
    render(patch, params, seed) { return renderPatch(patch, { params, seed }); },
    // Plays an already rendered sound. Returns { stop(), startedAt, duration }.
    playRendered(r, o = {}) {
      const c = context();
      const chans = r.channels || [r.samples];
      const buf = c.createBuffer(chans.length, chans[0].length, r.sampleRate);
      chans.forEach((ch, i) => buf.copyToChannel(ch, i));
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = !!o.loop;
      src.connect(master); src.start();
      if (o.onended) src.onended = o.onended;
      return { startedAt: c.currentTime, duration: r.duration, stop() { src.onended = null; try { src.stop(); } catch { /* already stopped */ } } };
    },
    play(patch, params = {}, o = {}) {
      const seed = o.seed === undefined ? (Math.random() * 0x7fffffff) | 0 : o.seed;
      return this.playRendered(renderPatch(patch, { params, seed }), { loop: !!patch.loop && o.loop !== false });
    },
    async live(patch, params = {}, o = {}) {
      const c = context();
      if (!c.audioWorklet) throw new Error('This browser has no AudioWorklet');
      if (!workletReady) workletReady = c.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
      await workletReady;
      const node = new AudioWorkletNode(c, 'sfx-voice', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (e) => { if (e.data.type === 'error' && o.onerror) o.onerror(e.data.message); };
      node.port.postMessage({ type: 'load', patch, params, seed: o.seed === undefined ? 1 : o.seed, gain: o.gain || 1 });
      node.connect(master);
      return {
        node,
        set(id, value) { node.port.postMessage({ type: 'param', id, value }); },
        stop() { node.port.postMessage({ type: 'stop' }); setTimeout(() => node.disconnect(), 200); },
      };
    },
  };
}
