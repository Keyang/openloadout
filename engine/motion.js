// Motion helpers: everything an animation needs is a pure function of the
// clip phase t (0..1) and the sprite's parameters.

export const TAU = Math.PI * 2;
export const PI = Math.PI;

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeIn = (t) => clamp(t) ** 2;
export const easeOut = (t) => 1 - (1 - clamp(t)) ** 2;
export const fract = (t) => t - Math.floor(t);

/** Sine wave, one cycle per clip. phase is in cycles (0.25 = quarter turn). */
export const wave = (t, phase = 0) => Math.sin(TAU * (t + phase));

/** 0 -> 1 -> 0 over the clip (smooth). */
export const pulse = (t, phase = 0) => 0.5 - 0.5 * Math.cos(TAU * (t + phase));

/**
 * Keyframes: keys(t, [[0, a], [0.3, b], [1, c]]) interpolates smoothly between
 * the listed (time, value) pairs and holds the end values outside the range.
 */
export function keys(t, ks, ease = smooth) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, v0] = ks[i - 1], [t1, v1] = ks[i];
      return lerp(v0, v1, ease((t - t0) / (t1 - t0 || 1e-6)));
    }
  }
  return ks[ks.length - 1][1];
}

/**
 * Keyframes for a LOOPING clip: like keys(), but the value after the last key
 * eases back to the first key, so the loop always closes.
 * loopKeys(t, [[0, a], [0.4, b], [0.7, c]])  ->  ... c eases back to a at t = 1.
 */
export function loopKeys(t, ks, ease = smooth) {
  t = fract(t);
  return keys(t, [[ks[ks.length - 1][0] - 1, ks[ks.length - 1][1]], ...ks, [ks[0][0] + 1, ks[0][1]]], ease);
}

/**
 * Rig angle convention: 0 = pointing down, PI/2 = forward (right), PI = up,
 * negative = backward. dir(a) returns the unit vector in screen space.
 */
export const dir = (a) => [Math.sin(a), Math.cos(a)];

/** Point at distance len from (x, y) along rig angle a. */
export const reach = (x, y, a, len) => [x + Math.sin(a) * len, y + Math.cos(a) * len];

/**
 * Two-bone IK. Returns the middle joint and the (possibly clamped) end point.
 * bend: +1 puts the middle joint toward +x (a knee facing right), -1 toward -x.
 */
export function ik2(ax, ay, tx, ty, l1, l2, bend = 1) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy) || 1e-6;
  const max = l1 + l2 - 0.01, min = Math.abs(l1 - l2) + 0.01;
  const dc = clamp(d, min, max);
  if (dc !== d) { dx *= dc / d; dy *= dc / d; d = dc; }
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx);
  const k1 = [ax + Math.cos(base + a) * l1, ay + Math.sin(base + a) * l1];
  const k2 = [ax + Math.cos(base - a) * l1, ay + Math.sin(base - a) * l1];
  const mid = (k1[0] > k2[0]) === (bend > 0) ? k1 : k2;
  return { mid, end: [ax + dx, ay + dy] };
}

/** Small deterministic random generator: rng(seed)() -> 0..1. */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 0..1 value from integers: use for particles that must not flicker randomly. */
export function hash(a, b = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
