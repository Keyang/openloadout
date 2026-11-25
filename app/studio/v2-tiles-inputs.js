// The tile editor's inputs (build item B19d): one input for each documented type of app/studio/v2-tiles-model.js
// (a number in its range, a word from its list, on/off, a paint from the palette with its swatch, a profile name), a
// value a control may set shown with its table (a binding: { from, map } or { from, pick }, never a formula), and the
// tile pictures drawn by the framework renderer (cached per sprite and settings). Built from app/ui.js el() and the
// shared components; the look is in app/css/studio.css (the .v2-tiles rules).
import { el } from '../ui.js';
import { cleanParams } from '../../engine/sprite.js';
import { framePicture, pictureScale, shownStyle } from '../art.js';
import { showFrame } from './bits.js';
import { paintRefs, paintWords } from './v2-model.js';
import { swatchOf, fieldTree } from './v2-fields.js';
import { isBound, bindTo, unbind } from './v2-gen.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A small button: { label, onclick, ...attributes }. */
export const mini = (label, onclick, more = {}) => el('button', { type: 'button', class: 'btn btn-sm v2-mini', onclick, ...more }, label);

/** A small square showing a paint (a checker for see-through or a colour worked out by a rule). Arguments: ref, def. */
export function chipOf(ref, def) {
  const hex = typeof ref === 'string' && ref !== 'none' ? swatchOf(ref, def) : null;
  return el('span', { class: `v2-chip${hex ? '' : ' is-clear'}`, style: hex ? `background:${hex}` : null, 'aria-hidden': 'true' });
}

/** A number box committed on Enter or on leaving it; empty means "not said" (onchange(undefined)) when the field is optional. Arguments: { k, value, min, max, step, label, optional, onchange }. */
export function numberIn({ k, value, min, max, step = 1, label, optional = false, onchange }) {
  const box = el('input', { type: 'number', class: 'st-num v2-num', 'data-k': k, 'aria-label': label, min: min ?? null, max: max ?? null, step, inputmode: 'decimal', value: typeof value === 'number' ? String(value) : '', placeholder: optional ? 'default' : null });
  const commit = () => {
    if (box.value === '') { if (optional && value !== undefined) onchange(undefined); return; }
    let n = Number(box.value);
    if (!Number.isFinite(n)) return;
    if (Number.isFinite(min)) n = Math.max(min, n);
    if (Number.isFinite(max)) n = Math.min(max, n);
    if (n !== value) onchange(n);
  };
  box.addEventListener('change', commit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  return box;
}

/** A text box committed on Enter or on leaving it (empty: not said, when optional). Arguments: { k, value, label, max, optional, onchange }. */
export function textIn({ k, value, label, max = 60, optional = false, onchange }) {
  const box = el('input', { type: 'text', class: 'st-text v2-textbox', 'data-k': k, 'aria-label': label, maxlength: max, value: value ?? '', placeholder: optional ? 'default' : null });
  let last = box.value;
  const commit = () => { if (box.value === last) return; last = box.value; onchange(box.value.trim() === '' && optional ? undefined : box.value.trim()); };
  box.addEventListener('change', commit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  return box;
}

/** A select of [value, words] options (the current value kept first when the list has not got it). Arguments: { k, value, options, label, onchange, cls }. */
export function selectIn({ k, value, options, label, onchange, cls = '' }) {
  const opts = options.some(([v]) => v === value) || value === undefined ? options : [[value, String(value)], ...options];
  const s = el('select', { class: `st-select ${cls}`.trim(), 'data-k': k, 'aria-label': label, onchange: () => onchange(s.value) }, opts.map(([v, w]) => el('option', { value: v }, w)));
  s.value = value ?? opts[0]?.[0] ?? '';
  return s;
}

/** An optional on/off: Default, Yes or No (No and Yes said; Default leaves it out). Arguments: { k, value, label, onchange }. */
export function flagIn({ k, value, label, optional = true, onchange }) {
  if (!optional) {
    const b = el('input', { type: 'checkbox', class: 'v2-flag', 'data-k': k, 'aria-label': label, onchange: () => onchange(b.checked) });
    b.checked = !!value;
    return b;
  }
  return selectIn({ k, label, value: value === true ? 'yes' : value === false ? 'no' : '', options: [['', 'default'], ['yes', 'yes'], ['no', 'no']], onchange: (v) => onchange(v === '' ? undefined : v === 'yes') });
}

/** A paint from the palette (its slots and tones, ink, see-through, and any extra words: ['none', 'No outline']) with its swatch. Arguments: { k, value, def, label, extra, optional, onchange }. */
export function paintIn({ k, value, def, label, extra = [], optional = false, onchange }) {
  if (value !== undefined && typeof value !== 'string') return el('span', { class: 'quiet small' }, 'worked out by a rule (All fields)');
  const options = [...(optional ? [['', 'default']] : []), ...extra, ...paintRefs(def).map((r) => [r, `${paintWords(r, def)} (${r})`])];
  const s = selectIn({ k, value: value ?? '', options, label, cls: 'v2-paint', onchange: (v) => onchange(v === '' ? undefined : v) });
  return el('span', { class: 'v2-paintbox' }, chipOf(value, def), s);
}

/** The controls a value can be set by: [{ key, label, options?, range? }] (choices and on/offs pick, sliders a table). Arguments: def. */
export function controlsOf(def) {
  return (Array.isArray(def?.controls) ? def.controls : []).filter((c) => isObj(c) && typeof c.key === 'string' && !c.standard && c.kind !== 'colour' && c.kind !== 'color').map((c) => ({
    key: c.key, label: c.label ?? c.key,
    options: c.kind === 'choice' ? (c.options ?? []).map((o) => (isObj(o) ? o.value : o)) : c.kind === 'toggle' ? ['true', 'false'] : undefined,
    range: c.kind === 'range' ? [Number.isFinite(c.min) ? c.min : 0, Number.isFinite(c.max) ? c.max : 1] : undefined,
  }));
}

/**
 * A number a control may set (a field typed px or number with `bind`): fixed, a number box and "Set by" a control;
 * bound, which control, its table as a field tree, and Fixed. Arguments: { k, value, type ({ type, lo, hi }), def,
 * label, path, optional, onChange (path, value) }.
 */
export function bindableIn({ k, value, type, def, label, path, optional = false, onChange }) {
  const ctl = controlsOf(def);
  if (isBound(value)) {
    const pick = selectIn({ k: `${k}-from`, value: value.from, label: `The control that sets ${label}`, options: ctl.map((c) => [c.key, c.label]), onchange: (key) => { const c = ctl.find((x) => x.key === key); if (c) onChange(path, bindTo(c.key, type, unbind(value, type), c.options, c.range)); } });
    const head = el('span', { class: 'v2-bindhead' }, 'Set by ', pick, mini('Fixed', () => onChange(path, unbind(value, type)), { 'aria-label': `Make ${label} a fixed value` }));
    const num = (v, i, j, what) => numberIn({ k: `${k}-${i}-${j}`, value: v, min: j ? type.lo : undefined, max: j ? type.hi : undefined, step: 'any', label: `${label}: ${what} ${i + 1}`,
      onchange: (n) => { const m = value.map.map((x) => [...x]); m[i][j] = n; onChange([...path, 'map'], m); } });
    let table;
    if (Array.isArray(value.map) && value.map.every((m) => Array.isArray(m) && m.length === 2 && m.every((x) => typeof x === 'number'))) {
      // a table: at this setting, this value (a straight line between the points)
      table = [...value.map.map(([a, b], i) => el('span', { class: 'v2-maprow' }, el('span', { class: 'quiet' }, 'at '), num(a, i, 0, 'setting'), el('span', { class: 'quiet' }, ' gives '), num(b, i, 1, 'value'),
        value.map.length > 2 ? mini('×', () => onChange([...path, 'map'], value.map.filter((_, j) => j !== i)), { 'aria-label': `Remove point ${i + 1} of ${label}'s table` }) : null)),
      value.map.length < 32 ? mini('+ Point', () => { const m = value.map.map((x) => [...x]); const [a, b] = m.at(-1); m.push([a + 0.5, b]); onChange([...path, 'map'], m); }, { 'aria-label': `Add a point to ${label}'s table` }) : null];
    } else if (isObj(value.pick) && Object.values(value.pick).every((x) => typeof x === 'number')) {
      table = Object.entries(value.pick).map(([o, v]) => el('span', { class: 'v2-maprow' }, el('span', { class: 'quiet' }, `${o} gives `),
        numberIn({ k: `${k}-pick-${o}`, value: v, min: type.lo, max: type.hi, step: 'any', label: `${label} when ${o}`, onchange: (n) => onChange([...path, 'pick', o], n) })));
    } else table = fieldTree({ def, value, path, label, open: 2, onChange, lockKeys: ['from'] });
    // a long table (a step for each whole pixel) is folded, its ends said
    if (Array.isArray(table) && Array.isArray(value.map) && value.map.length > 4) {
      const [a, b] = [value.map[0][1], value.map.at(-1)[1]];
      table = el('details', { class: 'v2-sub v2-ttable' }, el('summary', {}, el('span', { class: 'quiet small' }, `a table of ${value.map.length} points, ${a} to ${b}`)), table);
    }
    return el('span', { class: 'v2-bound v2-tbound' }, head, table);
  }
  if (value !== undefined && typeof value !== 'number') return el('span', { class: 'quiet small' }, 'set another way (All fields)');
  const box = numberIn({ k, value, min: type.lo, max: type.hi, step: type.type === 'px' ? 1 : 'any', label, optional, onchange: (n) => onChange(path, n) });
  if (!ctl.length) return box;
  const by = selectIn({ k: `${k}-bind`, value: '', label: `Let a control set ${label}`, cls: 'v2-bind', options: [['', 'Fixed'], ...ctl.map((c) => [c.key, `Set by ${c.label}`])], onchange: (key) => { const c = ctl.find((x) => x.key === key); if (c) onChange(path, bindTo(c.key, type, typeof value === 'number' ? value : type.lo ?? 0, c.options, c.range)); } });
  return el('span', { class: 'v2-argbody' }, box, by);
}

/** A labelled row of the tile editor: its name, its input, and the words that say what it does. Arguments: { name, input, about, k }. */
export function fieldRow({ name, input, about, k }) {
  return el('div', { class: 'v2-tfield', 'data-field': k ?? null }, el('span', { class: 'v2-tfname' }, name), el('span', { class: 'v2-tfin' }, input), about ? el('span', { class: 'v2-tfabout' }, about) : null);
}

// ---- tile pictures -----------------------------------------------------------------------------------------------

const PICTURES = new WeakMap();   // sprite -> Map('<settings>|<clip>|<style>@<scale>' -> picture)
/** CSS pixels a frame pixel the tile pictures are drawn for: the test map is shown at most twice its size. */
const TILE_ZOOM = 2;

/**
 * A tile of the sprite drawn by the framework (frame 0) as a picture (app/art.js: { canvas, k }, k canvas pixels a frame
 * pixel), cached per sprite and settings; null when it cannot be drawn. In the site's art style (a flat one drawn for
 * the test map's size), or in the one named: { style: 'pixel' } is the pixel grid a click places pixels on.
 * Arguments: sprite, params (the settings tried), clip, { style }.
 */
export function tilePicture(sprite, params, clip, { style } = {}) {
  if (!sprite?.clips?.[clip]) return null;
  if (!PICTURES.has(sprite)) PICTURES.set(sprite, new Map());
  const cache = PICTURES.get(sprite);
  const p = cleanParams(sprite, params ?? {});
  const st = shownStyle(sprite, style);
  const grid = style === 'pixel';
  const key = `${JSON.stringify(p)}|${clip}|${st}@${grid ? 1 : pictureScale(st, TILE_ZOOM, Math.max(...sprite.size))}`;
  if (!cache.has(key)) {
    let pic = null;
    try { pic = framePicture(sprite, clip, 0, p, { style: st, zoom: TILE_ZOOM, grid }); } catch { pic = null; }
    if (cache.size > 400) cache.clear();
    cache.set(key, pic);
  }
  return cache.get(key);
}

/** A small picture of a tile for a button or a list (its own canvas; a blank one when the tile cannot be drawn). Arguments: sprite, params, clip, size (pixels shown, default 32). */
export function tileThumb(sprite, params, clip, size = 32) {
  const pic = tilePicture(sprite, params, clip);
  const w = pic?.canvas.width ?? 32, h = pic?.canvas.height ?? 32;
  const c = el('canvas', { class: 'v2-tilethumb', width: w, height: h, style: `width:${size}px;height:${Math.round((size * h) / w)}px`, 'aria-hidden': 'true' });
  if (pic) { c.getContext('2d').drawImage(pic.canvas, 0, 0); showFrame(c, pic); }
  return c;
}
