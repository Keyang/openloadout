// The studio's 9-slice editor for panel bodies, its pure model (build item B19b; docs/data-sprites.md section 6,
// "Interface: 9-slice editor"; Contract 8 "Stretchable pieces"; Contract 15). app/studio/v2-slice-pane.js draws it.
//   - The export of one state: what the library download says for it (engine/sprite.js renderSheet for that clip, then
//     engine/sheet-info.js describeSheet: animations[clip].border, rect, opening, tile, textArea), so the editor shows
//     exactly what a game is given.
//   - The slice as four lines in frame pixels (x1, x2 across; y1, y2 down), measured from the piece's rect when it has
//     one; the text area as a box. A pointer hits a line, the text area or its corner; a drag moves it by whole pixels,
//     held inside the frame and leaving the slice a middle.
//   - Written as data (the definition's own `slice` and `textArea`, Contract 8 as data, docs/data-sprites.md 2.1): one
//     for a state ({ <clip>: {...} }) or one for every state, which the layout's measure gives way to
//     (engine/data-sprite.js); taken back to the measure by removing it. The validator takes only left, top, right and
//     bottom for a slice (in frame pixels, no rect) and one { x, y, w, h, colour } text area per state, its colour a paint
//     of the palette: a written slice drops a measured rect, opening or repeat (lostByWriting says which), a written
//     text area replaces every area the piece measured for that state.
//   - The stretch plan: the piece cut in nine and drawn at another size (corners kept, edges stretched along, the middle
//     both ways), or a repeat inserted whole for a segmented bar; and the sizes the preview shows side by side.
//   - The skins the pieces index offers (each version), a skin's slots, and a new skin's paint map.
//   - The piece pick: the interface piece generators (family ui, catalog/sprite-schema.js GENERATOR_PLACES.piece), and a
//     switch to another that keeps every argument the new one takes (held to its range) and says what it drops.
//   - The frame the editor works in: the drawn sprite's (a draft with mistakes shows the last that drew), bounded, and
//     a zoom that keeps the picture's canvas one a browser draws.
//   - A text colour as the download gives it, read back as a paint (at the settings being tried), a rule, light text, or
//     a colour no paint of the sprite has (told, and kept by adding a palette colour for it).
// No page, no Node: runs in the browser and the tests.
import { renderSheet } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { paintHex, resolvePalette } from '../../engine/resolve.js';
import { setAt, paintRefs, bodyKind, addPaletteSlot } from './v2-model.js';
import { generatorsFor, generatorDoc, starterArg, isBound } from './v2-gen.js';

/** The four sides of a written slice, in the order the definition writes them. */
export const SLICE_SIDES = Object.freeze(['left', 'top', 'right', 'bottom']);

/** The fields of the download's entry for a state that the editor shows (Contract 8). */
export const EXPORT_FIELDS = Object.freeze(['border', 'rect', 'opening', 'tile', 'textArea']);

/** The style guide's border for a stretchable piece, in pixels: a slice started on a state that has none. */
export const START_BORDER = 8;

const PROTO = new Set(['__proto__', 'constructor', 'prototype']);
const CLIP_RE = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const whole = (v, d = 0) => (fin(v) ? Math.round(v) : d);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** The largest frame side the editor works in, in pixels (a larger size in a draft is a mistake its check reports). */
export const FRAME_MOST = 1024;

/** The largest side of the zoomed picture's canvas, in pixels. */
export const PIC_MOST = 2048;

/** A frame size [w, h] of positive numbers? */
const isSize = (s) => Array.isArray(s) && s.length >= 2 && fin(s[0]) && fin(s[1]) && s[0] >= 1 && s[1] >= 1;

/**
 * The frame the editor works in, [w, h] in whole pixels: the drawn sprite's (for a draft with mistakes, the last that
 * drew, which the picture shows), else the definition's; each side within 1 and FRAME_MOST; [32, 32] when neither has
 * one. Arguments: def, sprite (or null).
 */
export function frameOf(def, sprite) {
  const s = isSize(sprite?.size) ? sprite.size : isSize(def?.size) ? def.size : [32, 32];
  return [clamp(Math.round(s[0]), 1, FRAME_MOST), clamp(Math.round(s[1]), 1, FRAME_MOST)];
}

/** The zoom of the picture of a frame: whole, 2 to 12 times, to about 560 by 320; less (and not whole) where that would make a canvas side over PIC_MOST. Arguments: size. */
export function zoomFor([W, H]) {
  const w = Math.max(1, fin(W) ? W : 1), h = Math.max(1, fin(H) ? H : 1);
  const z = Math.max(2, Math.min(12, Math.floor(560 / w), Math.floor(320 / h)));
  return Math.min(z, PIC_MOST / w, PIC_MOST / h);
}

/** The frame a setter holds to: the one it is given (opts.size), else the definition's (bounded). */
const sizeFor = (def, opts) => (isSize(opts?.size) ? frameOf(null, { size: opts.size }) : frameOf(def, null));

/** Does the definition have a panel body (an interface piece)? Arguments: def. */
export const isPanel = (def) => bodyKind(def) === 'panel';

/** The panel's states, which are its clips: the drawn sprite's clips, else the states the body names. Arguments: def, sprite (or null). */
export function panelStates(def, sprite) {
  if (sprite && isObj(sprite.clips)) return Object.keys(sprite.clips);
  const s = isObj(def?.body?.panel) ? def.body.panel.states : undefined;
  if (Array.isArray(s)) return s.filter((x) => typeof x === 'string');
  if (isObj(s)) return Object.keys(s);
  return ['normal', 'hover', 'pressed', 'disabled'];
}

/**
 * The download's entry for one state, as the library export gives it: { border?, rect?, opening?, tile?, textArea? }
 * (engine/sprite.js renderSheet for that clip at scale 1, then engine/sheet-info.js describeSheet), or null when the
 * sprite has no such clip or cannot be drawn. Arguments: sprite, clip, p (the settings).
 */
export function exportOf(sprite, clip, p) {
  if (!sprite || !isObj(sprite.clips) || typeof clip !== 'string' || !Object.hasOwn(sprite.clips, clip)) return null;
  let a;
  try {
    const sheet = renderSheet(sprite, p, { clips: [clip] });
    a = describeSheet(sprite, sheet.meta, p).animations[clip];
  } catch { return null; }
  const out = {};
  for (const k of EXPORT_FIELDS) if (a?.[k] !== undefined) out[k] = clone(a[k]);
  return out;
}

/** The box a slice is measured in: the export's rect, else the whole frame. */
const baseOf = (exp, [W, H]) => (isObj(exp?.rect) ? exp.rect : { x: 0, y: 0, w: W, h: H });

/** The slice as four lines in frame pixels { x1, x2, y1, y2 } (from the border, inside the rect when there is one), or null when the state has neither. Arguments: exp (exportOf), size ([w, h]). */
export function linesOf(exp, size) {
  if (!isObj(exp) || (!isObj(exp.border) && !isObj(exp.rect))) return null;
  const b = isObj(exp.border) ? exp.border : { left: 0, top: 0, right: 0, bottom: 0 };
  const r = baseOf(exp, size);
  return { x1: r.x + (b.left ?? 0), x2: r.x + r.w - (b.right ?? 0), y1: r.y + (b.top ?? 0), y2: r.y + r.h - (b.bottom ?? 0) };
}

/** Lines back to a slice the validator takes, { left, top, right, bottom }: whole pixels inside the frame, with at least one pixel of middle each way. Arguments: lines, size. */
export function sliceOfLines({ x1, x2, y1, y2 }, [W, H]) {
  const a = clamp(whole(x1), 0, W - 1);
  const b = clamp(whole(x2, W), a + 1, W);
  const c = clamp(whole(y1), 0, H - 1);
  const d = clamp(whole(y2, H), c + 1, H);
  return { left: a, top: c, right: W - b, bottom: H - d };
}

/** A slice for a state the piece gives none: the style guide's 8 px border, smaller where the frame needs a middle. Arguments: size. */
export function startSlice([W, H]) {
  const lr = Math.max(0, Math.min(START_BORDER, Math.floor((W - 1) / 2)));
  const tb = Math.max(0, Math.min(START_BORDER, Math.floor((H - 1) / 2)));
  return { left: lr, top: tb, right: lr, bottom: tb };
}

/** Is a written slice or text area one for every state (not { clip: ... })? Arguments: raw value, field ('slice' | 'textArea'). */
const isOne = (raw, field) => isObj(raw) && (field === 'slice' ? SLICE_SIDES.some((k) => Object.hasOwn(raw, k)) : Object.hasOwn(raw, 'x'));

/** Is the definition's slice (or text area) written once for every state? Arguments: def, field ('slice' | 'textArea'). */
export const writtenEvery = (def, field) => isOne(def?.[field], field);

/** The written value of a field for one clip, or null. */
function writtenFor(def, field, clip) {
  const raw = def?.[field];
  if (!isObj(raw)) return null;
  if (isOne(raw, field)) return clone(raw);
  return Object.hasOwn(raw, clip) && isObj(raw[clip]) ? clone(raw[clip]) : null;
}

/** The slice the definition writes for a state (its own, or the one for every state), or null when the piece's measure is used. Arguments: def, clip. */
export const writtenSlice = (def, clip) => writtenFor(def, 'slice', clip);

/** The text area the definition writes for a state, or null. Arguments: def, clip. */
export const writtenArea = (def, clip) => writtenFor(def, 'textArea', clip);

/** Refuses a clip that is not one of the panel's states or could reach an object's machinery. */
function checkClip(clip, clips) {
  if (typeof clip !== 'string' || PROTO.has(clip) || !CLIP_RE.test(clip)) throw new Error(`"${String(clip).slice(0, 40)}" is not a state name`);
  if (Array.isArray(clips) && !clips.includes(clip)) throw new Error(`"${clip}" is not one of the states (${clips.slice(0, 8).join(', ')})`);
}

/** A copy of def with a field written for one clip, or for every state; a value written for every state is split per state first. */
function writeFor(def, field, clip, value, { clips, every = false } = {}) {
  checkClip(clip, clips);
  if (every) return setAt(def, [field], value);
  const raw = def?.[field];
  const names = (Array.isArray(clips) ? clips : [clip]).filter((c) => !PROTO.has(c));
  const map = isOne(raw, field) ? Object.fromEntries(names.map((c) => [c, clone(raw)])) : isObj(raw) ? clone(raw) : {};
  map[clip] = value;
  return setAt(def, [field], map);
}

/** A copy of def with a field taken back to the measure for one clip (or for every state); the field goes when nothing is left. */
function clearFor(def, field, clip, { clips, every = false } = {}) {
  checkClip(clip, clips);
  const raw = def?.[field];
  if (raw === undefined) return clone(def);
  if (every || !isObj(raw)) return setAt(def, [field], undefined);
  const names = Array.isArray(clips) ? clips : [];
  const map = isOne(raw, field) ? Object.fromEntries(names.filter((c) => !PROTO.has(c)).map((c) => [c, clone(raw)])) : clone(raw);
  delete map[clip];
  return Object.keys(map).length ? setAt(def, [field], map) : setAt(def, [field], undefined);
}

/** The slice held to the frame: whole pixels, each side 0 or more, a middle left both ways. */
function fitSlice(s, [W, H]) {
  const left = clamp(whole(s.left), 0, W - 1), top = clamp(whole(s.top), 0, H - 1);
  return { left, top, right: clamp(whole(s.right), 0, W - 1 - left), bottom: clamp(whole(s.bottom), 0, H - 1 - top) };
}

/**
 * A copy of def with a slice written for a state, held to the frame ({ left, top, right, bottom } in frame pixels).
 * Throws for a clip that is not one of `clips`. Arguments: def, clip, slice, { clips (the states), every (one slice for
 * every state), size (the frame held to: the picture's, frameOf; the definition's when left out) }.
 */
export function setSlice(def, clip, slice, opts = {}) {
  return writeFor(def, 'slice', clip, fitSlice(slice, sizeFor(def, opts)), opts);
}

/** A copy of def with a state's slice taken back to what the piece measures (every state's, with every). Arguments: def, clip, { clips, every }. */
export const clearSlice = (def, clip, opts = {}) => clearFor(def, 'slice', clip, opts);

/** What writing a slice drops of what the piece measured for the state: 'rect', 'opening', 'tile' (the validator takes only the four sides). Arguments: exp. */
export function lostByWriting(exp) {
  return ['rect', 'opening', 'tile'].filter((k) => isObj(exp?.[k]));
}

/** The text areas of a state's export, always a list: [{ x, y, w, h, colour }]. Arguments: exp. */
export function areasOf(exp) {
  const t = exp?.textArea;
  const list = Array.isArray(t) ? t : isObj(t) ? [t] : [];
  return list.filter((a) => isObj(a) && [a.x, a.y, a.w, a.h].every(fin)).map((a) => ({ x: a.x, y: a.y, w: a.w, h: a.h, ...(a.colour !== undefined ? { colour: a.colour } : {}) }));
}

/**
 * The palette's paint that has a colour ('#rrggbb', as the download gives a text colour), at the settings being tried
 * (a person's colour for a slot) and then at the defaults; undefined for light text, or when no paint has it.
 * Arguments: colour, def, params (the settings; the defaults when left out).
 */
export function paintFor(colour, def, params = {}) {
  if (typeof colour !== 'string' || !HEX.test(colour)) return undefined;
  const want = colour.toLowerCase();
  const pals = [];
  for (const p of [isObj(params) ? params : {}, {}]) { try { pals.push(resolvePalette(def, p)); } catch { /* no palette */ } }
  for (const pal of pals) {
    for (const ref of paintRefs(def)) {
      if (ref === 'clear') continue;
      let hex = null;
      try { hex = paintHex(ref, pal, params); } catch { hex = null; }
      if (typeof hex === 'string' && hex.toLowerCase() === want) return ref;
    }
  }
  return undefined;
}

/**
 * A text colour (as the download gives it, or as written) read for the editor: { light: true } (light text, the
 * default), { ref } (a paint of the palette), { rule } (a colour rule or binding written), or { lost: '#rrggbb' } (a
 * colour no paint of the sprite has: a text area written from it says light text, unless a palette colour is added).
 * Arguments: colour, def, params.
 */
export function textColourOf(colour, def, params = {}) {
  if (colour === undefined || colour === null || colour === 'light') return { light: true };
  if (isObj(colour)) return { rule: clone(colour) };
  if (typeof colour === 'string' && paintRefs(def).includes(colour)) return { ref: colour };
  const ref = paintFor(colour, def, params);
  if (ref !== undefined) return { ref };
  return { lost: typeof colour === 'string' ? colour.toLowerCase() : String(colour) };
}

/** The most colours a palette holds (catalog/sprite-schema.js L.palette). */
const PALETTE_MOST = 12;

/**
 * A copy of def with a palette colour for text of a colour no paint has: { def, ref } (a detail slot "text", not a
 * colour people set). Throws for a colour that is not '#rrggbb' or a palette already at its 12 colours. Arguments: def, hex.
 */
export function addTextColour(def, hex) {
  if (typeof hex !== 'string' || !HEX.test(hex)) throw new Error(`"${String(hex).slice(0, 20)}" is not a colour written #rrggbb`);
  const n = Array.isArray(def?.palette) ? def.palette.length : 0;
  if (n >= PALETTE_MOST) throw new Error(`The palette has its ${PALETTE_MOST} colours already: remove one, or paint the text with one of them`);
  const next = addPaletteSlot(def, { label: 'Text', colour: hex.toLowerCase(), material: 'paint' });
  const at = next.palette.length - 1;
  const slot = { ...next.palette[at], detail: true };
  return { def: setAt(next, ['palette', at], slot), ref: slot.id };
}

/**
 * A copy of def with a text area written for a state: whole pixels inside the frame, at least 1 by 1; its colour a
 * paint of the palette (a paint ref kept, a '#rrggbb' from the download turned into the paint that has it, light text
 * left out). Arguments: def, clip, area ({ x, y, w, h, colour? }), { clips, every, size (the frame held to, as setSlice),
 * params (the settings a hex is matched at) }.
 */
export function setTextArea(def, clip, area, opts = {}) {
  const [W, H] = sizeFor(def, opts);
  const x = clamp(whole(area.x), 0, W - 1), y = clamp(whole(area.y), 0, H - 1);
  const out = { x, y, w: clamp(whole(area.w, 1), 1, W - x), h: clamp(whole(area.h, 1), 1, H - y) };
  const c = area.colour;
  const ref = typeof c === 'string' && HEX.test(c) ? paintFor(c, def, opts.params) : typeof c === 'string' && c !== 'light' && paintRefs(def).includes(c) ? c : isObj(c) ? clone(c) : undefined;
  if (ref !== undefined) out.colour = ref;
  return writeFor(def, 'textArea', clip, out, opts);
}

/** A copy of def with a state's text area taken back to what the piece measures. Arguments: def, clip, { clips, every }. */
export const clearTextArea = (def, clip, opts = {}) => clearFor(def, 'textArea', clip, opts);

/**
 * What a pointer at frame point [x, y] is on: 'area-size' (the text area's bottom right corner), 'left', 'right',
 * 'top', 'bottom' (the nearest slice line within tol), 'area' (inside the text area), or null. Arguments:
 * { lines, area }, point, tol (frame pixels).
 */
export function hitTest({ lines, area }, [x, y], tol) {
  if (isObj(area) && Math.abs(x - (area.x + area.w)) <= tol && Math.abs(y - (area.y + area.h)) <= tol) return 'area-size';
  if (isObj(lines)) {
    const near = [['left', Math.abs(x - lines.x1)], ['right', Math.abs(x - lines.x2)], ['top', Math.abs(y - lines.y1)], ['bottom', Math.abs(y - lines.y2)]]
      .filter(([, d]) => d <= tol).sort((a, b) => a[1] - b[1]);
    if (near.length) return near[0][0];
  }
  if (isObj(area) && x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) return 'area';
  return null;
}

/**
 * The lines and the text area after a handle is dragged by [dx, dy] frame pixels (rounded to whole pixels): a line
 * stays in the frame and a pixel short of the line across from it; the text area moves whole inside the frame, or is
 * sized from its corner (at least 1 by 1). Returns { lines, area } (new objects). Arguments: handle, { lines, area } at
 * the start of the drag, [dx, dy], size.
 */
export function dragged(handle, { lines, area }, [dx, dy], [W, H]) {
  const mx = Math.round(dx), my = Math.round(dy);
  const L = isObj(lines) ? { ...lines } : null;
  const A = isObj(area) ? { ...area } : null;
  if (L && handle === 'left') L.x1 = clamp(lines.x1 + mx, 0, lines.x2 - 1);
  else if (L && handle === 'right') L.x2 = clamp(lines.x2 + mx, lines.x1 + 1, W);
  else if (L && handle === 'top') L.y1 = clamp(lines.y1 + my, 0, lines.y2 - 1);
  else if (L && handle === 'bottom') L.y2 = clamp(lines.y2 + my, lines.y1 + 1, H);
  else if (A && handle === 'area') { A.x = clamp(area.x + mx, 0, W - area.w); A.y = clamp(area.y + my, 0, H - area.h); }
  else if (A && handle === 'area-size') { A.w = clamp(area.w + mx, 1, W - area.x); A.h = clamp(area.h + my, 1, H - area.y); }
  return { lines: L, area: A };
}

/** Spans of one axis: the source and destination [start, length] of the near edge, the middle and the far edge. */
function spans(start, len, near, far, target) {
  const t = Math.max(target, near + far);
  return { t, src: [[start, near], [start + near, len - near - far], [start + len - far, far]], dst: [[0, near], [near, t - near - far], [t - far, far]] };
}

/**
 * How the state's piece is drawn at another size: { w, h, parts: [{ sx, sy, sw, sh, dx, dy, dw, dh }], fixed? } in
 * whole pixels (source in frame pixels). A border: nine parts, corners kept, edges stretched along, the middle both
 * ways (never smaller than the corners); a rect is cut out first. A repeat (tile): its columns inserted whole, never
 * stretched, the height kept. A rect alone does not stretch (fixed). null when the state has nothing to stretch by.
 * Arguments: exp, size, target ([w, h]).
 */
export function stretchPlan(exp, size, [tw, th]) {
  if (!isObj(exp)) return null;
  const r = baseOf(exp, size);
  if (isObj(exp.tile)) {
    const { x, w } = exp.tile;
    const n = Math.max(0, Math.round((tw - r.w) / w));
    const parts = [];
    let dx = 0;
    const put = (sx, sw) => { if (sw > 0) parts.push({ sx, sy: r.y, sw, sh: r.h, dx, dy: 0, dw: sw, dh: r.h }); dx += Math.max(0, sw); };
    put(r.x, x - r.x);
    for (let i = 0; i <= n; i++) put(x, w);
    put(x + w, r.x + r.w - x - w);
    return { w: dx, h: r.h, parts };
  }
  if (isObj(exp.border)) {
    const b = exp.border;
    const X = spans(r.x, r.w, b.left ?? 0, b.right ?? 0, Math.round(tw));
    const Y = spans(r.y, r.h, b.top ?? 0, b.bottom ?? 0, Math.round(th));
    const parts = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const [sx, sw] = X.src[i], [sy, sh] = Y.src[j], [dx, dw] = X.dst[i], [dy, dh] = Y.dst[j];
      if (sw > 0 && sh > 0 && dw > 0 && dh > 0) parts.push({ sx, sy, sw, sh, dx, dy, dw, dh });
    }
    return { w: X.t, h: Y.t, parts };
  }
  if (isObj(exp.rect)) return { w: r.w, h: r.h, fixed: true, parts: [{ sx: r.x, sy: r.y, sw: r.w, sh: r.h, dx: 0, dy: 0, dw: r.w, dh: r.h }] };
  return null;
}

/** The largest side a preview is stretched to, in pixels. */
const PREVIEW_MOST = 512;

/**
 * The sizes the preview shows the state's piece at, side by side: its own size first, then wider, taller and smaller
 * ones it can take (a repeat: whole copies more; a rect alone: its own size only). [] when nothing stretches.
 * Arguments: exp, size.
 */
export function previewSizes(exp, size) {
  if (!isObj(exp)) return [];
  const r = baseOf(exp, size);
  if (isObj(exp.tile)) return [0, 2, 6].map((k) => [r.w + k * exp.tile.w, r.h]).filter(([w]) => w <= PREVIEW_MOST);
  if (!isObj(exp.border)) return isObj(exp.rect) ? [[r.w, r.h]] : [];
  const b = exp.border;
  const minW = (b.left ?? 0) + (b.right ?? 0) + 1, minH = (b.top ?? 0) + (b.bottom ?? 0) + 1;
  const fit = ([w, h]) => [clamp(Math.round(w), minW, PREVIEW_MOST), clamp(Math.round(h), minH, PREVIEW_MOST)];
  const out = [];
  for (const s of [[r.w, r.h], [r.w * 2, r.h], [r.w * 1.25, r.h * 2], [r.w * 0.6, r.h * 0.75]].map(fit)) if (!out.some((o) => o[0] === s[0] && o[1] === s[1])) out.push(s);
  return out;
}

/** One frame coordinate mapped through a stretch along one axis. */
function mapAxis(v, start, len, near, far, t) {
  const rel = v - start;
  if (rel <= near) return rel;
  if (rel >= len - far) return t - (len - rel);
  const mid = len - near - far;
  return mid > 0 ? near + ((rel - near) * (t - near - far)) / mid : near;
}

/** Where a frame box (a text area) lands on the piece stretched to `target`: { x, y, w, h } in whole pixels, or null. Arguments: exp, size, target, box. */
export function stretchBox(exp, size, target, box) {
  const plan = stretchPlan(exp, size, target);
  if (!plan || !isObj(box)) return null;
  const r = baseOf(exp, size);
  const b = isObj(exp.border) ? exp.border : { left: 0, right: 0, top: 0, bottom: 0 };
  let mx, my;
  if (isObj(exp.tile)) {
    const grow = plan.w - r.w, end = exp.tile.x + exp.tile.w;
    mx = (v) => (v - r.x) + (v >= end ? grow : 0);
    my = (v) => v - r.y;
  } else if (plan.fixed) { mx = (v) => v - r.x; my = (v) => v - r.y; }
  else {
    mx = (v) => mapAxis(v, r.x, r.w, b.left ?? 0, b.right ?? 0, plan.w);
    my = (v) => mapAxis(v, r.y, r.h, b.top ?? 0, b.bottom ?? 0, plan.h);
  }
  const x = Math.round(mx(box.x)), y = Math.round(my(box.y));
  return { x, y, w: Math.max(1, Math.round(mx(box.x + box.w)) - x), h: Math.max(1, Math.round(my(box.y + box.h)) - y) };
}

/** The skin pieces offered: [{ use, v, name, about, slots }] from the pieces index (each version, by name then newest first), the skin in use added when the index has not got it. Arguments: index (generated/pieces.json), current ({ use, v } or null). */
export function skinChoices(index, current) {
  const rows = Array.isArray(index?.pieces) ? index.pieces : [];
  const out = rows.filter((p) => isObj(p) && p.kind === 'skin' && typeof p.id === 'string' && Number.isInteger(p.v))
    .map((p) => ({ use: p.id, v: p.v, name: typeof p.name === 'string' ? p.name : p.id.slice(5), about: typeof p.about === 'string' ? p.about : '', slots: skinSlots(p) }))
    .sort((a, b) => (a.use === b.use ? b.v - a.v : a.use < b.use ? -1 : 1));
  if (isObj(current) && typeof current.use === 'string' && Number.isInteger(current.v) && !out.some((s) => s.use === current.use && s.v === current.v)) {
    out.unshift({ use: current.use, v: current.v, name: current.use.replace(/^skin:/, ''), about: '', slots: [] });
  }
  return out;
}

/** A skin piece's slots: [{ id, label, default }] (from the piece or its index row), [] for none. Arguments: piece. */
export function skinSlots(piece) {
  return (Array.isArray(piece?.slots) ? piece.slots : []).filter((s) => isObj(s) && typeof s.id === 'string')
    .map((s) => ({ id: s.id, label: typeof s.label === 'string' ? s.label : s.id, ...(typeof s.default === 'string' ? { default: s.default } : {}) }));
}

/** A skin's paint map for a sprite: each of the skin's slots that the sprite's palette has by the same id, mapped to it. Arguments: piece (the skin, or its index row), def. */
export function skinPaintFor(piece, def) {
  const have = new Set((Array.isArray(def?.palette) ? def.palette : []).filter(isObj).map((s) => s.id));
  return Object.fromEntries(skinSlots(piece).filter((s) => have.has(s.id)).map((s) => [s.id, s.id]));
}

// ---- the piece pick ----

/** Call fields a piece keeps across a switch (engine/gen/registry.js CALL_FIELDS but gen and v). */
const CALL_KEEP = Object.freeze(['id', 'on', 'z', 'when', 'group', 'hidden', 'glow', 'part', 'clip']);
const NUMBER_TYPES = new Set(['px', 'share', 'count', 'angle', 'seed', 'number']);
const WHOLE = new Set(['count', 'seed']);

/** The interface piece generators a panel's piece may name: [{ id, family, about, versions (newest first) }], by id. Arguments: none. */
export function pieceChoices() {
  const by = new Map();
  for (const g of generatorsFor('piece')) {
    const r = by.get(g.id) ?? { id: g.id, family: g.family, about: g.about, versions: [] };
    if (!r.versions.includes(g.v)) r.versions.push(g.v);
    by.set(g.id, r);
  }
  for (const r of by.values()) { r.versions.sort((a, b) => b - a); r.about = generatorDoc(r.id, r.versions[0])?.about ?? r.about; }
  return [...by.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** A number held to a type's range (whole where the type is). */
const inRange = (n, t) => { const x = clamp(n, fin(t.lo) ? t.lo : -Infinity, fin(t.hi) ? t.hi : Infinity); return WHOLE.has(t.type) ? Math.round(x) : x; };

/** An argument's value as the new generator's type takes it (held to its range), or undefined when it cannot take it. */
function keepArg(t, was, v) {
  const type = t?.type;
  const words = Array.isArray(t?.values) ? t.values : Array.isArray(t?.options) ? t.options : null;
  if (isBound(v)) {
    if (was && was.type !== type) return undefined;
    if (type === 'word' && words && isObj(v.pick) && !Object.values(v.pick).every((x) => words.includes(x))) return undefined;
    const b = clone(v);
    if (NUMBER_TYPES.has(type) && Array.isArray(b.map)) b.map = b.map.map((m) => (Array.isArray(m) && fin(m[1]) ? [m[0], inRange(m[1], t)] : m));
    return b;
  }
  if (NUMBER_TYPES.has(type)) return fin(v) ? inRange(v, t) : undefined;
  if (type === 'point') return Array.isArray(v) && v.length === 2 && v.every(fin) ? v.map((x) => inRange(x, t)) : undefined;
  if (type === 'word') return typeof v === 'string' && (!words || words.includes(v)) ? v : undefined;
  if (type === 'flag') return typeof v === 'boolean' ? v : undefined;
  if (type === 'paint') return typeof v === 'string' || isObj(v) ? clone(v) : undefined;
  if (type === 'paints') return Array.isArray(v) ? clone(v) : undefined;
  return was && was.type === type ? clone(v) : undefined;
}

/**
 * A copy of a panel's definition with its piece switched to another interface piece generator: { def, dropped, removed }. The
 * new call keeps the old one's call fields (id, on, z, when, clip ...) and each argument the new generator takes in a
 * form its type allows (a number or a point held to its range, a word it has, a binding of the same type); an argument
 * it needs and was not given starts from the registry (a size fills the frame inside `at`). `dropped` names what was
 * left out; a control only a dropped argument read, named nowhere else, would set nothing (the validator refuses it),
 * so it goes too, and `removed` names it. Throws for a definition that is not a panel, a generator that is not an interface piece, or a version it
 * has not got. Arguments: def, gen (id), v (its version; the newest when left out).
 */
export function switchPiece(def, gen, v) {
  if (!isPanel(def) || !isObj(def.body?.panel)) throw new Error('This is not a panel (an interface piece): it has no piece to switch');
  const choice = pieceChoices().find((c) => c.id === gen);
  if (!choice) throw new Error(`"${String(gen).slice(0, 40)}" is not an interface piece generator (family ui)`);
  const ver = v === undefined ? choice.versions[0] : v;
  if (!choice.versions.includes(ver)) throw new Error(`${gen} has no version ${String(v).slice(0, 10)} (it has ${choice.versions.join(', ')})`);
  const g = generatorDoc(gen, ver);
  const old = isObj(def.body.panel.piece) ? def.body.panel.piece : {};
  const was = typeof old.gen === 'string' && Number.isInteger(old.v) ? generatorDoc(old.gen, old.v) : null;
  const call = { gen, v: ver };
  const dropped = [];
  for (const [k, val] of Object.entries(old)) {
    if (k === 'gen' || k === 'v' || PROTO.has(k)) continue;
    if (Object.hasOwn(g.args, k)) {
      const kept = keepArg(g.args[k], was?.args?.[k], val);
      if (kept !== undefined) call[k] = kept;
      else dropped.push(k);
    } else if (CALL_KEEP.includes(k)) call[k] = clone(val);
    else dropped.push(k);
  }
  const frame = frameOf(def, null);
  for (const [k, t] of Object.entries(g.args)) {
    if (t.optional || Object.hasOwn(call, k)) continue;
    if (k === 'size' && t.type === 'point') {
      const at = Array.isArray(call.at) && call.at.every(fin) ? call.at : [0, 0];
      call.size = [inRange(frame[0] - 2 * at[0], t), inRange(frame[1] - 2 * at[1], t)];
    } else call[k] = starterArg(t, { paints: paintRefs(def), frame, onNode: false });
  }
  let next = setAt(def, ['body', 'panel', 'piece'], call);
  // controls only the dropped arguments read
  const keys = [...new Set(dropped.map((k) => (isBound(old[k]) ? old[k].from : null)).filter((k) => typeof k === 'string'))];
  const removed = [];
  for (const key of keys) {
    const ctl = Array.isArray(next.controls) ? next.controls : [];
    if (!ctl.some((c) => isObj(c) && c.key === key)) continue;
    const rest = { ...next, controls: ctl.filter((c) => !(isObj(c) && c.key === key)) };
    if (JSON.stringify(rest).includes(JSON.stringify(key))) continue;
    next = rest;
    removed.push(key);
  }
  return { def: next, dropped, removed };
}
