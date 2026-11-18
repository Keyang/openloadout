// Pictures the site shows in lists, made by the build so cards need not draw live:
//   sprite -> thumbnail (one frame of the preview clip, 2x) and strip (every frame of the preview clip in one row, 1x)
//   sound effect -> small waveform (blocky ink bars on transparent, like app/audio.js drawWave)
//   music -> nothing
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { encodePNG } from '../png.mjs';
import { renderFrame, defaultParams, clipFps } from '../../engine/sprite.js';
import { renderPatch, defaultParams as soundDefaults } from '../../sound/sfx-engine.js';
import { thumbPath, stripPath, WAVE_INK } from './catalog.mjs';

export const THUMB_SCALE = 2;
export const WAVE_W = 64;
export const WAVE_H = 40;
// Waveform ink on a transparent background: dark, so it needs a light tile on the site.
// The catalogue gives it to each sound row as `thumbInk`.
export const INK = [1, 3, 5].map((i) => parseInt(WAVE_INK.slice(i, i + 2), 16));   // #231b33
/** Bump when the pictures change for reasons other than the asset files. */
export const THUMBS_VERSION = 1;

const previewFrames = (def) => {
  const p = defaultParams(def);
  const clip = def.preview;
  return { p, clip, frames: Array.from({ length: def.clips[clip].frames }, (_, f) => renderFrame(def, clip, f, p)) };
};
const coverage = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };

/** One frame of the preview clip at 2x: the frame with the most drawn pixels (the first on a tie). */
export function spriteThumb(def) {
  const { frames } = previewFrames(def);
  let best = 0;
  frames.forEach((g, i) => { if (coverage(g) > coverage(frames[best])) best = i; });
  const g = frames[best], [fw, fh] = def.size, s = THUMB_SCALE;
  const src = g.bytes(), w = fw * s, h = fh * s;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (Math.floor(y / s) * fw + Math.floor(x / s)) * 4, o = (y * w + x) * 4;
    out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; out[o + 3] = src[i + 3];
  }
  return { png: encodePNG(w, h, out), w, h, frame: best };
}

/** Every frame of the preview clip, left to right, at 1x. */
export function spriteStrip(def) {
  const { p, clip, frames } = previewFrames(def);
  const [fw, fh] = def.size, w = fw * frames.length, h = fh;
  const out = new Uint8ClampedArray(w * h * 4);
  frames.forEach((g, f) => {
    const src = g.bytes();
    for (let y = 0; y < fh; y++) {
      const o = (y * w + f * fw) * 4;
      out.set(src.subarray(y * fw * 4, (y + 1) * fw * 4), o);
    }
  });
  return { png: encodePNG(w, h, out), w, h, frames: frames.length, fps: clipFps(def, clip, p) };
}

/** Largest absolute sample in each of n equal slices (as app/audio.js peaks). */
function peaks(samples, n) {
  const out = new Float32Array(n), step = samples.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = Math.floor(i * step), e = Math.min(samples.length, Math.floor((i + 1) * step) + 1); j < e; j++) { const a = Math.abs(samples[j]); if (a > m) m = a; }
    out[i] = m;
  }
  return out;
}

/** Waveform of a sound effect at its default settings; null for music. */
export function soundWave(patch) {
  if (patch.category === 'music') return null;
  const r = renderPatch(patch, { params: soundDefaults(patch), seed: 1 });
  const pk = peaks(r.samples, WAVE_W);
  const out = new Uint8ClampedArray(WAVE_W * WAVE_H * 4);
  const cy = WAVE_H / 2;
  for (let x = 0; x < WAVE_W; x++) {
    const half = Math.min(cy, Math.max(1, Math.round(pk[x] * WAVE_H / 2)));
    for (let y = cy - half; y < cy + half; y++) {
      const o = (y * WAVE_W + x) * 4;
      out[o] = INK[0]; out[o + 1] = INK[1]; out[o + 2] = INK[2]; out[o + 3] = 255;
    }
  }
  return { png: encodePNG(WAVE_W, WAVE_H, out), w: WAVE_W, h: WAVE_H };
}

// ---- writing them, with a cache ---------------------------------------------------

const sha = (...parts) => { const h = crypto.createHash('sha1'); for (const x of parts) h.update(x); return h.digest('hex'); };
function dirHash(root, dir) {
  const d = path.join(root, dir);
  if (!fs.existsSync(d)) return '';
  const files = fs.readdirSync(d, { recursive: true }).map(String).filter((f) => /\.(m?js|json)$/.test(f)).sort();
  return sha(...files.map((f) => f + '\0' + fs.readFileSync(path.join(d, f))));
}

/**
 * Writes generated/thumbs/ and generated/strips/ under root for every sprite and sound effect,
 * skipping an asset whose source file (and the engine code that draws it) is unchanged since the
 * last build. The hashes live in <root>/.cache/build.json. Pictures of removed assets are deleted.
 * Returns { made: [ids], skipped: [ids], removed: [files] }.
 */
export function writeImages({ root, sprites = [], sounds = [], force = false }) {
  const cacheFile = path.join(root, '.cache', 'build.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
  const old = cache.images ?? {};
  const images = {};
  // a sprite's pictures also depend on the engine, the rigs and shared _helper files in sprites/
  const helpers = fs.existsSync(path.join(root, 'sprites'))
    ? fs.readdirSync(path.join(root, 'sprites')).filter((f) => f.startsWith('_') && /\.(m?js|json)$/.test(f)).sort()
      .map((f) => f + '\0' + fs.readFileSync(path.join(root, 'sprites', f)))
    : [];
  const spriteCode = sha(String(THUMBS_VERSION), dirHash(root, 'engine'), dirHash(root, 'rigs'), ...helpers);
  const soundCode = sha(String(THUMBS_VERSION), dirHash(root, 'sound'));
  const thumbsDir = path.join(root, 'generated', 'thumbs'), stripsDir = path.join(root, 'generated', 'strips');
  fs.mkdirSync(thumbsDir, { recursive: true });
  fs.mkdirSync(stripsDir, { recursive: true });
  const made = [], skipped = [], keep = new Set();
  const fresh = (id, hash, files) => !force && old[id] === hash && files.every((f) => fs.existsSync(path.join(root, f)));

  for (const { id, file, def } of sprites) {
    const files = [thumbPath(id), stripPath(id)];
    files.forEach((f) => keep.add(f));
    const hash = sha(spriteCode, fs.readFileSync(path.join(root, file)));
    images[id] = hash;
    if (fresh(id, hash, files)) { skipped.push(id); continue; }
    fs.writeFileSync(path.join(root, files[0]), spriteThumb(def).png);
    fs.writeFileSync(path.join(root, files[1]), spriteStrip(def).png);
    made.push(id);
  }
  for (const { id, file, patch, isMusic } of sounds) {
    if (isMusic) continue;
    const files = [thumbPath(id)];
    keep.add(files[0]);
    const hash = sha(soundCode, fs.readFileSync(path.join(root, file)));
    images[id] = hash;
    if (fresh(id, hash, files)) { skipped.push(id); continue; }
    fs.writeFileSync(path.join(root, files[0]), soundWave(patch).png);
    made.push(id);
  }

  const removed = [];
  for (const [dir, rel] of [[thumbsDir, 'generated/thumbs'], [stripsDir, 'generated/strips']]) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.png') && !keep.has(`${rel}/${f}`)) { fs.rmSync(path.join(dir, f)); removed.push(`${rel}/${f}`); }
    }
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ ...cache, images }, null, 2) + '\n');
  return { made, skipped, removed };
}
