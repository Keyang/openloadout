// Advice in the studio (docs/studio.md sections 4 and 6; Contract 14 rule 7; item S12). A studio sprite is not held to
// the quality bar: it goes in the bag, plays and downloads whatever the bar says. The bar (quality/sprite.js checkSprite)
// is offered as advice, "what the library would ask before taking it", in everyday words; and the pixel-art rules of
// docs/studio.md section 4 are measured here and shown next to what they are about:
//   - a shape too thin to draw (under 2 pixels thick it breaks into stairs when it turns): the shape, on its bone;
//   - stray single pixels (a drawn pixel with nothing drawn beside it) and speckle (a few pixels that show on one frame
//     only, with nothing near them on the frames either side, which flicker): the frame of the animation;
//   - the drawing touching the frame's edge (the style guide keeps a 1 px empty border): the frame;
//   - the fill band: at the first look the drawing spans half to three quarters of its frame along its longer side.
// Nothing here blocks anything. Pure: no page; the frames are drawn by app/studio/draw.js (framework code), so it runs in
// the browser, in Node and in the studio's advice worker (app/studio/advice-worker.js).
import { drawFrame } from './draw.js';
import { isRig, humanize, boneLabel } from './edit.js';
import { makeDataSprite } from '../../engine/data-sprite.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clipOf = (def, clip) => (isObj(def?.clips) && typeof clip === 'string' && Object.hasOwn(def.clips, clip) && isObj(def.clips[clip]) ? def.clips[clip] : null);
/** An animation's name for people: its label, else its name in words. */
const nameOf = (def, clip) => clipOf(def, clip)?.label || humanize(clip);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const framesWords = (list) => (list.length === 1 ? `frame ${list[0] + 1}` : `frames ${list.slice(0, 8).map((f) => f + 1).join(', ')}${list.length > 8 ? ` and ${list.length - 8} more` : ''}`);

// ---- shapes too thin to draw --------------------------------------------------------------------------------------

const KIND_WORDS = { limb: 'long', capsule: 'long', ellipse: 'round', poly: 'pointed', dot: 'dot' };

/** How thick a shape is at its narrowest, in pixels (null for a dot, a detail that is one or two pixels by design, and a poly). */
function thickness(s) {
  if (s.kind === 'limb') return Number(s.width);
  if (s.kind === 'capsule' && Array.isArray(s.r)) return 2 * Math.min(...s.r.map(Number));
  if (s.kind === 'ellipse' && Array.isArray(s.r)) return 2 * Math.min(...s.r.map(Number));
  return null;
}

/**
 * The shapes of a bone rig too thin to draw well: [{ kind: 'thin' (under 2 px thick: it breaks into stairs when it turns)
 * | 'too-thin' (under 1 px: it may not show at all), shape, bone, text }]. [] for a definition with no bone rig.
 * Arguments: def.
 */
export function thinShapes(def) {
  if (!isRig(def)) return [];
  const out = [];
  for (const s of def.body.rig.shapes ?? []) {
    const t = thickness(s);
    if (t === null || !Number.isFinite(t) || t >= 2) continue;
    const what = `The ${KIND_WORDS[s.kind] ?? ''} shape on ${boneLabel(def, s.bone)}`.replace('  ', ' ');
    out.push(t < 1
      ? { kind: 'too-thin', shape: s.id, bone: s.bone, text: `${what} is too thin to draw: under a pixel across, it may not show. Make it bigger.` }
      : { kind: 'thin', shape: s.id, bone: s.bone, text: `${what} is thin: under 2 pixels thick it breaks into stairs when it turns. Make it bigger.` });
  }
  return out;
}

// ---- stray pixels and speckle -------------------------------------------------------------------------------------

const opaqueAt = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && !!g.data[y * g.w + x];

/** The drawn pixels with nothing drawn on any side of them (a corner does not count as touching): [[x, y], ...] in reading order. Arguments: g (a Surface, or { w, h, data }). */
export function strayPixels(g) {
  const out = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!g.data[y * g.w + x]) continue;
    if (!opaqueAt(g, x - 1, y) && !opaqueAt(g, x + 1, y) && !opaqueAt(g, x, y - 1) && !opaqueAt(g, x, y + 1)) out.push([x, y]);
  }
  return out;
}

/** The groups of drawn pixels that touch (sides or corners): [[[x, y], ...], ...]. Only groups of at most `most` pixels are kept. */
function smallGroups(g, most) {
  const seen = new Uint8Array(g.w * g.h), out = [];
  for (let i = 0; i < g.w * g.h; i++) {
    if (!g.data[i] || seen[i]) continue;
    const group = [], stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(), x = j % g.w, y = (j - x) / g.w;
      group.push([x, y]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!opaqueAt(g, nx, ny)) continue;
        const k = ny * g.w + nx;
        if (!seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (group.length <= most) out.push(group.sort((a, b) => a[1] - b[1] || a[0] - b[0]));
  }
  return out;
}

/** The most pixels a group may have and still count as speckle. */
export const SPECKLE_MOST = 3;

/**
 * Speckle: in each frame, the pixels of a small group (at most SPECKLE_MOST pixels) with nothing drawn within one pixel of
 * it on the frames either side (a loop's first and last frames are neighbours; a one-shot's ends have one neighbour; a
 * single frame has none, so nothing can be said). Returns one list of [x, y] per frame.
 * Arguments: frames (Surfaces of one animation, in order), { loop }.
 */
export function speckle(frames, { loop = true } = {}) {
  const n = frames.length;
  return frames.map((g, f) => {
    const sides = [f - 1, f + 1].map((i) => (loop ? (i + n) % n : i)).filter((i) => i >= 0 && i < n && i !== f);
    if (!sides.length) return [];
    const out = [];
    for (const group of smallGroups(g, SPECKLE_MOST)) {
      const near = sides.some((i) => group.some(([x, y]) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (opaqueAt(frames[i], x + dx, y + dy)) return true; return false; }));
      if (!near) out.push(...group);
    }
    return out;
  });
}

// the kinds of sprite that fill their frame on purpose (the style guide: tilesets and backgrounds, interface pieces to the border)
const FILLS = new Set(['tileset', 'background', 'ui']);
const FRAME_CACHE = new WeakMap();

/** Every frame of a clip drawn at the first look, kept per definition (a definition is never changed in place); `draw` another drawer (tests), not kept. */
function framesOf(def, clip, draw = drawFrame) {
  if (draw !== drawFrame) { const c = clipOf(def, clip); return c ? Array.from({ length: c.frames }, (_, f) => draw(def, clip, f)) : []; }
  let m = FRAME_CACHE.get(def);
  if (!m) { m = new Map(); FRAME_CACHE.set(def, m); }
  if (!m.has(clip)) { const c = clipOf(def, clip); m.set(clip, c ? Array.from({ length: c.frames }, (_, f) => drawFrame(def, clip, f)) : []); }
  return m.get(clip);
}

/**
 * The pixel-art warnings of every frame of an animation: [{ kind: 'stray' | 'speckle' | 'edge', clip, frame, pixels, text }].
 * Arguments: def (a checked definition), clip, { draw (def, clip, frame) -> Surface: default app/studio/draw.js drawFrame }.
 */
export function frameWarnings(def, clip, { draw = drawFrame } = {}) {
  const c = clipOf(def, clip);
  if (!c) return [];
  const frames = framesOf(def, clip, draw);
  const name = nameOf(def, clip), out = [];
  const flicker = speckle(frames, { loop: c.loop !== false });
  frames.forEach((g, f) => {
    const stray = strayPixels(g);
    if (stray.length) out.push({ kind: 'stray', clip, frame: f, pixels: stray, text: `Frame ${f + 1} of ${name}: ${plural(stray.length, 'pixel')} on ${stray.length === 1 ? 'its' : 'their'} own, touching nothing. Pixel art keeps every pixel beside another.` });
    if (flicker[f].length) out.push({ kind: 'speckle', clip, frame: f, pixels: flicker[f], text: `Frame ${f + 1} of ${name}: ${plural(flicker[f].length, 'pixel')} show on this frame only, so ${flicker[f].length === 1 ? 'it flickers' : 'they flicker'} when it plays.` });
    if (!FILLS.has(def.meta?.type)) {
      const b = g.bounds();
      if (b && (b.x0 <= 0 || b.y0 <= 0 || b.x1 >= g.w - 1 || b.y1 >= g.h - 1)) out.push({ kind: 'edge', clip, frame: f, pixels: [], text: `Frame ${f + 1} of ${name} reaches the edge of the frame. Leave one empty pixel all round, or a game cuts it off.` });
    }
  });
  return out;
}

// ---- the fill band ------------------------------------------------------------------------------------------------

/** The share of its frame a drawing spans along its longer side, as the quality bar measures it. */
const shareOf = (g) => { const b = g.bounds(); if (!b) return null; const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1; return bw >= bh ? bw / g.w : bh / g.h; };

/**
 * How much of its frame the drawing fills at the first look, along its longer side (the median over the first
 * animation's frames, which is the one the library measures): { clip, share, low: 0.5, high: 0.75, state: 'small' |
 * 'fits' | 'big', text }. Null when nothing is drawn. Arguments: def.
 */
export function fillBand(def) {
  const clip = Object.keys(def?.clips ?? {})[0];
  if (!clip) return null;
  const shares = framesOf(def, clip).map(shareOf).filter((s) => s !== null).sort((a, b) => a - b);
  if (!shares.length) return null;
  const share = shares[Math.floor(shares.length / 2)], pct = Math.round(share * 100);
  const state = share < 0.5 ? 'small' : share > 0.75 ? 'big' : 'fits';
  const text = state === 'small' ? `It fills ${pct}% of its frame along its longer side; the library asks for half to three quarters. Try a smaller frame size, or make the body bigger.`
    : state === 'big' ? `It fills ${pct}% of its frame along its longer side, more than three quarters, so it is crowded. Try a bigger frame size, or make the body smaller.`
      : `It fills ${pct}% of its frame along its longer side: inside the half to three quarters the library asks for.`;
  return { clip, share, low: 0.5, high: 0.75, state, text };
}

/**
 * The fill band as two boxes to draw over the frame, in frame pixels [x, y, w, h]: inner (half the frame) and outer (three
 * quarters), standing on the anchor for a sprite that stands, centred on it for one that flies. Arguments: def.
 */
export function bandBox(def) {
  const [W, H] = def.size, [px, py] = def.pivot;
  const box = (k) => {
    const w = Math.round(W * k), h = Math.round(H * k);
    const x = Math.round(Math.min(W - w, Math.max(0, px + 0.5 - w / 2)));
    const y = def.grounded !== false ? Math.max(0, py - h + 1) : Math.round(Math.min(H - h, Math.max(0, py + 0.5 - h / 2)));
    return [x, y, w, h];
  };
  return { inner: box(0.5), outer: box(0.75) };
}

// ---- all of it ------------------------------------------------------------------------------------------------------

/**
 * Every pixel-art warning of a definition: the shapes too thin to draw, then each animation's frames (stray pixels,
 * speckle, the edge), then the fill band when it is outside it: [{ kind, text, shape?, bone?, clip?, frame? }].
 * Arguments: def (a checked definition), { draw } (as frameWarnings takes it).
 */
export function pixelAdvice(def, { draw = drawFrame } = {}) {
  const out = [...thinShapes(def)];
  for (const clip of Object.keys(def?.clips ?? {})) out.push(...frameWarnings(def, clip, { draw }));
  const band = fillBand(def);
  if (band && band.state !== 'fits') out.push({ kind: 'fill', clip: band.clip, frame: 0, text: band.text });
  return out;
}

const KIND_LINE = {
  stray: (name, fs, n) => `${name}: ${plural(n, 'pixel')} on ${n === 1 ? 'its' : 'their'} own, touching nothing, on ${framesWords(fs)}.`,
  speckle: (name, fs, n) => `${name}: ${plural(n, 'pixel')} that show on one frame only and flicker, on ${framesWords(fs)}.`,
  edge: (name, fs) => `${name} reaches the edge of the frame on ${framesWords(fs)}. Leave one empty pixel all round.`,
};

/** pixelAdvice() with one line per animation and kind of frame warning (naming its frames; `frame` is the first): what the advice list shows. */
export function groupAdvice(list, def) {
  const out = [], at = new Map();
  for (const w of list) {
    if (!KIND_LINE[w.kind]) { out.push(w); continue; }
    const k = `${w.clip}|${w.kind}`;
    if (!at.has(k)) { const line = { kind: w.kind, clip: w.clip, frame: w.frame, frames: [], count: 0 }; at.set(k, line); out.push(line); }
    const line = at.get(k);
    line.frames.push(w.frame);
    line.count += w.pixels?.length ?? 0;
  }
  for (const line of at.values()) line.text = KIND_LINE[line.kind](def ? nameOf(def, line.clip) : humanize(line.clip), line.frames, line.count);
  return out;
}

// ---- the quality bar, in everyday words ----------------------------------------------------------------------------

const SETTING = { default: '', 'all-low': ' with every slider low', 'all-high': ' with every slider high' };
const settingWords = (s) => (Object.hasOwn(SETTING, s) ? SETTING[s] : ' at some settings');

// [pattern, (match, def) => { text, clip?, frame? }]: the bar's own messages (quality/sprite.js) a studio sprite can get
const SAYINGS = [
  [/^(\S+) frame (\d+) \/ ([^:]+): nothing drawn/, (m, d) => ({ clip: m[1], frame: +m[2], text: `Nothing is drawn on frame ${+m[2] + 1} of ${nameOf(d, m[1])}${settingWords(m[3])}.` })],
  [/^(\S+) frame (\d+) \/ ([^:]+): drawing touches the frame edge/, (m, d) => ({ clip: m[1], frame: +m[2], text: `The drawing reaches the edge of the frame on frame ${+m[2] + 1} of ${nameOf(d, m[1])}${settingWords(m[3])}. Leave one empty pixel all round.` })],
  [/^(\S+) frame (\d+) \/ ([^:]+): render threw/, (m, d) => ({ clip: m[1], frame: +m[2], text: `Frame ${+m[2] + 1} of ${nameOf(d, m[1])} could not be drawn${settingWords(m[3])}.` })],
  [/^(\S+): last frame is empty/, (m, d) => ({ clip: m[1], text: `The last frame of ${nameOf(d, m[1])} is empty. Leave a few pixels of what is left behind.` })],
  [/^(\S+): lowest pixel is at y=(\d+) but pivot y=(\d+)/, (m, d) => {
    const n = +m[3] - +m[2];
    return { clip: m[1], text: n > 0 ? `In ${nameOf(d, m[1])} the feet are ${plural(n, 'pixel')} above the anchor. Move the anchor up ("Snap to the feet"), or say it flies.` : `In ${nameOf(d, m[1])} the feet go ${plural(-n, 'pixel')} below the anchor. Move the anchor down ("Snap to the feet").` };
  }],
  [/smallest look \(all sliders low\) fills (\d+)% of the frame along its longer side in ([^\s;]+)/, (m, d) => ({ clip: m[2], text: `With every slider low it fills only ${m[1]}% of its frame (in ${nameOf(d, m[2])}); the library asks for at least a third. Raise the sliders' lowest values, or use a smaller frame.` })],
  [/^(\S+) \/ ([^:]+): (\d+) colours in one clip \(a (\w+) should use at most (\d+)\)/, (m, d) => ({ clip: m[1], text: `${nameOf(d, m[1])} uses ${m[3]} colours; a ${m[4]} uses at most ${m[5]}. Use fewer colours or simpler shapes.` })],
  [/^(\S+): loop seam/, (m, d) => ({ clip: m[1], text: `${nameOf(d, m[1])} jumps when it starts again: the last frame is further from the first than the frames are from each other. Make the last pose lead back into the first.` })],
  [/^(\S+): more than half the frames repeat the previous one/, (m, d) => ({ clip: m[1], text: `In ${nameOf(d, m[1])} more than half the frames are the same as the one before, so it hardly moves.` })],
  [/^(\S+): last frame equals first frame/, (m, d) => ({ clip: m[1], text: `${nameOf(d, m[1])} ends on its first pose, so that pose shows twice and the loop stutters. Let the last frame lead into the first instead.` })],
  [/^clip "([^"]+)" has one frame: a (\w+) must move/, (m, d) => ({ clip: m[1], text: `${nameOf(d, m[1])} has one frame, and a ${m[2]} has to move in every animation.` })],
  [/^clip "([^"]+)" has one frame/, (m, d) => ({ clip: m[1], text: `${nameOf(d, m[1])} has one frame; most things move.` })],
  [/^only (\d+) parameters/, (m) => ({ text: `It has only ${m[1]} settings people can change; the library likes more to play with.` })],
  [/^(\d+) controls outside parts/, (m) => ({ text: `It has ${m[1]} settings outside its parts: too many for a simple panel (8 to 15 is good).` })],
  [/^sound "([^"]+)" on clip (\S+): no preset "([^"]+)"/, (m, d) => ({ clip: m[2], text: `The sound ${humanize(m[1])} in ${nameOf(d, m[2])} has no style called "${m[3]}". Pick one of its styles.` })],
  [/^sound "([^"]+)" on clip (\S+) is not in sounds/, (m, d) => ({ clip: m[2], text: `The sound "${m[1]}" in ${nameOf(d, m[2])} is not in the library.` })],
  [/^"([^"]+)" on clip (\S+) is a music track/, (m, d) => ({ clip: m[2], text: `${humanize(m[1])} in ${nameOf(d, m[2])} is music; an animation plays sound effects.` })],
  [/^looping sound "([^"]+)" on one-shot clip (\S+)/, (m, d) => ({ clip: m[2], text: `The sound ${humanize(m[1])} keeps going, but ${nameOf(d, m[2])} plays once: it is cut off when the animation ends.` })],
  [/^(\S+): shapes merge under the "([^"]+)" look/, (m, d) => ({ clip: m[1], text: `In ${nameOf(d, m[1])}, under the "${m[2]}" look of a kit, its shapes run together. Give its colours more contrast.` })],
  [/two tones that are clearly different become nearly the same under the "([^"]+)" look/, (m) => ({ text: `Under the "${m[1]}" look of a kit, two of its colours become almost the same.` })],
  [/^meta: (.*)/, (m) => ({ text: `About its name and what it is: ${tidy(m[1])}` })],
];

// words people do not use, and what to say instead (the bar is written for the people who build the library)
const PLAIN = [
  [/`/g, ''], [/\bparameters\b/gi, 'settings'], [/\bparams?\b/gi, 'setting'], [/\bclips\b/gi, 'animations'], [/\bclip\b/gi, 'animation'],
  [/\bpivot\b/gi, 'anchor'], [/\brender threw\b/gi, 'could not be drawn:'], [/\brenders?\b/gi, 'drawing'], [/\bthrew\b/gi, 'failed'], [/\ball-low\b/g, 'every slider low'],
  [/\ball-high\b/g, 'every slider high'], [/\btoggles?\b/gi, 'switch'], [/\bpresets?\b/gi, 'style'], [/\bseeds?\b/gi, 'look'], [/\bmetrics\b[\w.]*/gi, 'the measures'],
  [/\bconfig\b/gi, 'setting'], [/\bgrounded: false\b/g, 'say it flies'], [/\bdefault\b/g, 'the first look'], [/\(themedParams[^)]*\)/g, ''], [/\s+/g, ' '],
];
/** A message of the bar with the words people do not use put plainly, starting with a capital and ending with a stop. */
function tidy(text) {
  let s = String(text ?? '');
  for (const [re, by] of PLAIN) s = s.replace(re, by);
  s = s.trim();
  if (!s) return '';
  s = s[0].toUpperCase() + s.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/**
 * One finding of the quality bar in everyday words: { text, clip?, frame? } (clip: the animation's name, frame: counted
 * from 0, for the page to select it). A message it does not know is still said, with the words people do not use
 * taken out. Arguments: message (a string from checkSprite), def (the definition, for the animations' names).
 */
export function adviceWords(message, def) {
  const msg = String(message ?? '').replace(/^style "[^"]+": /, '');
  for (const [re, say] of SAYINGS) {
    const m = msg.match(re);
    if (!m) continue;
    const r = say(m, def ?? {});
    if (r.clip && !clipOf(def, r.clip)) delete r.clip;
    if (r.clip === undefined) delete r.frame;
    r.text = tidy(r.text);
    return r;
  }
  const r = { text: tidy(msg) };
  const c = msg.match(/^(\S+?):? /);
  if (c && clipOf(def, c[1])) r.clip = c[1];
  return r;
}

/**
 * The quality bar on a studio sprite, as advice: a promise of { ok: true, items: [{ level: 'ask' (the library would ask
 * for it) | 'tip', text, clip?, frame? }], asks, tips, note } (asks first, each said once), or { ok: false, message }
 * when it cannot be drawn. Never blocks anything. Arguments: def, { sounds (the sound library: a Map of id -> patch or a
 * list of patches; null: sounds are not checked) }.
 */
export async function barAdvice(def, { sounds = null } = {}) {
  const made = makeDataSprite(def);
  if (!made.ok) return { ok: false, message: `It cannot be drawn yet, so there is no advice: ${tidy(made.errors[0] ?? 'it does not pass the studio checks')}` };
  const [{ checkSprite }, { validateMeta }] = await Promise.all([import('../../quality/sprite.js'), import('../../catalog/schema.js')]);
  const soundIndex = sounds instanceof Map ? sounds : Array.isArray(sounds) ? new Map(sounds.filter((p) => p?.id).map((p) => [p.id, p])) : undefined;
  let r;
  try { r = checkSprite(made.sprite, { validateMeta, ...(soundIndex ? { soundIndex } : {}) }); } catch (e) {
    return { ok: false, message: `The library's checks could not look at it: ${tidy(e?.message ?? e)}` };
  }
  const items = [], seen = new Set();
  for (const [level, list] of [['ask', r.errors], ['tip', r.warnings]]) {
    for (const m of list) {
      const a = adviceWords(m, made.sprite.definition ?? def);
      if (!a.text || seen.has(a.text)) continue;
      seen.add(a.text);
      items.push({ level, ...a });
    }
  }
  return {
    ok: true, items, asks: items.filter((i) => i.level === 'ask').length, tips: items.filter((i) => i.level === 'tip').length,
    note: 'Advice only: it goes in your bag, plays and downloads whatever this says. These are what the library would ask before taking it as a file of its own.',
  };
}
