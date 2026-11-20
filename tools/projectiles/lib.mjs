// Shared helpers of the projectile writers (migration batch E3; review of E3 round 2, issue 5: the writers lived only in
// a scratch folder). tools/projectiles/<id>.mjs works out one projectile's definition from the code it redraws and
// tools/projectiles/write.mjs writes it as sprites/<id>.json; tests/unit/projectile-writers.test.mjs checks each file is
// exactly what its writer gives, so a fix is made in the writer and the file written again, never by hand. The heads
// (name, blurb, controls, clips, sounds) are the code sprites' as frozen in tests/fixtures/redraws, copied once into
// tools/projectiles/heads.json so the writers read nothing under tests/. Node only (the site never loads these).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/** The project folder (lab/sprite-forge). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The ids of the projectiles written here (the ninth, blaster-bolt, is the hand-written fixture of build item B12). */
export const PROJECTILE_IDS = Object.freeze(['acid-glob', 'arrow', 'boulder-chunk', 'fireball', 'micro-rocket', 'orbit-blade', 'plasma-orb', 'scatter-pellet']);
const HEADS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'projectiles', 'heads.json'), 'utf8'));
/** The code sprite's head as frozen before its redraw: name, blurb, meta, size, pivot, controls (params), clips, sounds. */
export const record = (id) => HEADS[id];
/** A binding: control `c`, the value at 0 and at 1 (or a list of [in, out] points), rounding. */
export const B = (c, a, b, round) => ({ from: c, map: Array.isArray(a) ? a : [[0, a], [1, b]], ...(round ? { round } : {}) });
export const pick = (c, o) => ({ from: c, pick: o });
const r4 = (v) => Math.round(v * 1e4) / 1e4;
/** Bindings of a number that is linear in one slider: lerp(a, b, s) * k + add. */
export const lin = (c, a, b, k = 1, add = 0, round) => B(c, r4(a * k + add), r4(b * k + add), round);
/** The header, controls and colour slots kept from the code sprite's record; materials per colour control. */
export function head(id, materials = {}) {
  const r = record(id);
  const controls = [], palette = [];
  for (const [k, d] of Object.entries(r.params)) {
    if (k === 'speed') { controls.push({ key: 'speed', standard: 'speed' }); continue; }
    if (d.kind === 'range') controls.push({ key: k, kind: 'range', label: d.label, lo: d.lo, hi: d.hi, default: d.def, ...(d.group === 'Motion' ? { group: 'Motion' } : {}), ...(d.when ? { when: d.when } : {}) });
    else if (d.kind === 'toggle') controls.push({ key: k, kind: 'toggle', label: d.label, default: d.def, ...(d.when ? { when: d.when } : {}) });
    else if (d.kind === 'choice') controls.push({ key: k, kind: 'choice', label: d.label, options: d.options.map((o) => (typeof o === 'object' ? o.value : o)), default: d.def, ...(d.when ? { when: d.when } : {}) });
    else if (d.kind === 'color') {
      controls.push({ key: k, kind: 'colour', label: d.label, ...(d.when ? { when: d.when } : {}) });
      palette.push({ id: k, label: d.label, default: d.def, material: materials[k] ?? 'light', swatches: d.swatches });
    }
  }
  return { format: 'loadout-sprite', version: 2, id, name: r.name, blurb: r.blurb, meta: r.meta, size: r.size, pivot: r.pivot, grounded: r.grounded, preview: r.preview, styles: ['pixel'],
    palette, controls, _clips: r.clips, _sounds: r.sounds };
}
/** A clip of the record: frames, base fps (the code's at speed 0.5 / 1.05), loop; plus extra fields. */
export function clip(h, name, fps, extra = {}) {
  const c = h._clips[name];
  return { frames: c.frames, fps, ...(c.loop ? {} : { loop: false }), ...extra, ...(h._sounds[name] ? { sounds: h._sounds[name] } : {}) };
}
/** The definition from a head, a body and clips (the head's working fields left out). */
export function build(h, body, clips, extra = {}) {
  const { _clips, _sounds, ...top } = h;
  return { ...top, ...extra, body, clips };
}
/** The text of sprites/<id>.json: the definition laid out by fmt, one line at the end. */
export const fileText = (def) => fmt(def) + '\n';
/** Keys that switch emitters on one frame each: frames -> { t, emit: { id: { amount } } } with every listed id 0 but the one on. */
export function oneEach(frames, perFrame, extra = {}) {
  const ids = [...new Set(perFrame.flat().filter(Boolean))];
  return perFrame.map((on, f) => ({ t: f / (frames - 1), ease: 'hold', emit: Object.fromEntries(ids.map((id) => [id, { amount: [on].flat().includes(id) ? 1 : 0 }])), ...(extra[f] ?? {}) }));
}
/** A primitive's clip limit goes in its `when` (a draw list's `clip` field holds only for generator calls). */
export function clipWhen(list) {
  return list.map((it) => {
    if (!it.kind || !Array.isArray(it.clip)) return it;
    const { clip, ...rest } = it;
    return { ...rest, when: { ...(rest.when ?? {}), clip } };
  });
}

// ---- engine helpers, frozen (build item E3b; review of E3 round 3, issue 4) -----------------------------------------
// The writers work their geometry out with these, copied from engine/motion.js, engine/surface.js and engine/shapes.js
// as they were on 2026-11-20 (word for word, but starIn, which takes its `inner` share as an argument), so a later
// change to the engine's (polyIn's edge rule, say, or hash) cannot change what a writer gives: a file that still draws
// right never turns into one that "differs from its writer", and running write.mjs never quietly re-derives a
// projectile from a new engine. Never change them; a writer that needs another
// rule gets its own helper here.
/** engine/motion.js lerp, frozen: the value t of the way from a to b. */
export const lerp = (a, b, t) => a + (b - a) * t;
/** engine/motion.js clamp, frozen: v kept between lo and hi (0 and 1 unless given). */
export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
/** engine/motion.js smooth, frozen: ease in and out (smoothstep), t clamped. */
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
/** engine/motion.js easeOut, frozen: 0..1 -> 0..1, fast then slow, t clamped. */
export const easeOut = (t) => 1 - (1 - clamp(t)) ** 2;
/** engine/motion.js fract, frozen: the part of t after the decimal point, 0 up to 1. */
export const fract = (t) => t - Math.floor(t);
/** engine/motion.js keys, frozen: the value at t of keyframes [[t, v], ...], eased between them. */
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
/** engine/motion.js hash, frozen: a steady random number 0 up to 1 from two integers. */
export function hash(a, b = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** engine/surface.js polyIn, frozen: the shape test (even-odd) of a polygon given as [[x, y], ...]. */
export function polyIn(pts) {
  const n = pts.length;
  return (px, py) => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
}

/** engine/surface.js capsuleIn, frozen: the shape test of a thick line with round ends, its radius r0 to r1. */
export function capsuleIn(x0, y0, x1, y1, r0, r1 = r0) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
  return (px, py) => {
    let t = ((px - x0) * dx + (py - y0) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t);
    const r = r0 + (r1 - r0) * t;
    return ex * ex + ey * ey <= r * r;
  };
}
/** engine/surface.js ellipseIn, frozen: the shape test of an ellipse. */
export const ellipseIn = (cx, cy, rx, ry) => (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
/** engine/shapes.js starIn with an `inner` given, frozen: the shape test of a star, its first point up. */
export function starIn(cx, cy, r, points, inner) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points, d = i % 2 ? r * inner : r;
    pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
  }
  return polyIn(pts);
}

/** JSON laid out for review: anything that fits in `width` characters on one line, the rest spread out by two spaces. */
export function fmt(v, ind = '', width = 118) {
  const one = JSON.stringify(v);
  if (one === undefined || one.length + ind.length <= width || v === null || typeof v !== 'object') return one;
  const pad = ind + '  ';
  if (Array.isArray(v)) {
    // a list of short things (points, numbers) packed several to a line
    if (v.every((x) => JSON.stringify(x).length <= 24)) {
      const lines = []; let line = '';
      for (const x of v.map((x) => JSON.stringify(x))) { if (line && (pad + line + ', ' + x).length > width) { lines.push(line + ','); line = x; } else line = line ? line + ', ' + x : x; }
      lines.push(line);
      return '[\n' + lines.map((l) => pad + l).join('\n') + '\n' + ind + ']';
    }
    // each object of a list (a draw item, a key, a node) on one line when it fits in 320 characters
    return '[\n' + v.map((x) => pad + fmt(x, pad, x && typeof x === 'object' && !Array.isArray(x) ? 320 : width)).join(',\n') + '\n' + ind + ']';
  }
  return '{\n' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => pad + JSON.stringify(k) + ': ' + fmt(x, pad, width)).join(',\n') + '\n' + ind + '}';
}
