// limiter.js: keeps everything a page plays at once at or under full scale at the speakers. One sound is rendered
// to peak at 0.89, but sounds overlap (a sprite's cue clicked twice, an animation and a click, music under an
// effect) and add up: two at once reached 1.42 and distorted (final review, 2026-11-18). A compressor brings the
// sum down smoothly; a soft-clipping curve after it catches what the compressor lets through in its first
// milliseconds. Sounds at normal levels pass through untouched (the curve is straight below LIMIT_KNEE).
// limitCurve is pure and tested in Node (tests/unit/sound-limiter.test.mjs); createLimiter needs Web Audio.

/** Where the soft clip starts, the same knee as the live player (sound/worklet.js limit). */
export const LIMIT_KNEE = 0.8;

/** The soft clip for one sample: straight up to LIMIT_KNEE, then bends smoothly towards 1 and never passes it. */
export function softLimit(x) {
  if (!(x === x)) return 0;
  const a = Math.abs(x);
  return a > LIMIT_KNEE ? Math.sign(x) * (LIMIT_KNEE + (1 - LIMIT_KNEE) * Math.tanh((a - LIMIT_KNEE) / (1 - LIMIT_KNEE))) : x;
}

/** The inputs the curve covers: up to 4 x full scale; anything louder is held at its end. */
export const CURVE_RANGE = 4;

/**
 * softLimit as a WaveShaper curve. A WaveShaper reads its curve over inputs -1..1 and holds the end value beyond, so
 * the signal is scaled down by `range` on the way in and point i of the n points is softLimit of
 * (2i / (n - 1) - 1) x range. Returns a Float32Array; every value is at or under 1.
 */
export function limitCurve(n = 4097, range = CURVE_RANGE) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = softLimit(((2 * i) / (n - 1) - 1) * range);
  return c;
}

/**
 * The limiter as Web Audio nodes, already connected to `out` (default the speakers). Connect sources, or a master
 * gain, to the node it returns. ctx: an AudioContext.
 */
export function createLimiter(ctx, out = ctx.destination) {
  const T = -3, R = 20;           // dB: one sound at the site's master level (0.8 x 0.89 = -2.9 dB) is just under the threshold
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = T;
  comp.knee.value = 0;
  comp.ratio.value = R;
  comp.attack.value = 0.001;
  comp.release.value = 0.15;
  // Web Audio adds its own make-up gain, (1 / gain at full scale)^0.6 (the Web Audio spec, DynamicsCompressorNode);
  // take it back off so a sound on its own is exactly as loud as it was without the limiter
  // and scale by 1 / CURVE_RANGE, the inputs the curve covers
  const undo = ctx.createGain();
  undo.gain.value = Math.pow(10, (0.6 * (T - T / R)) / 20) / CURVE_RANGE;
  const clip = ctx.createWaveShaper();
  clip.curve = limitCurve(4097, CURVE_RANGE);
  clip.oversample = 'none';      // oversampling filters ring past the curve's end; without it nothing passes 1
  comp.connect(undo); undo.connect(clip); clip.connect(out);
  return comp;
}
