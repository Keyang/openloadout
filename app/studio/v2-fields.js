// The studio's version 2 editing pieces (build item B17; docs/data-sprites.md section 6): built from app/ui.js el() and
// the shared components of app/css/base.css; the studio's own look is in app/css/studio.css (the .v2- rules).
//   - fieldTree: any part of a definition as a tree of typed inputs (numbers, words, on/off, paints from the palette,
//     lists whose items move, copy and go). The structured field editor for what has no editor of its own yet (tiles,
//     layers, panel pieces, clip keys, controls, parts: the dedicated editors are build item B19).
//   - genEditor: a generator call's arguments from the registry's documented types (app/studio/v2-gen.js), each in the
//     input its type takes, bound to a control by a table or fixed, optional ones left to their defaults. Never code.
//   - stampPainter: a stamp's pixels at up to 12x, painted with the palette's slots and tones, ink, or see-through;
//     its size changed within the caps (app/studio/v2-stamp.js), a variant painted on its own.
//   - itemList: the rows of a draw list (shapes, stamps, generator calls): pick one, move it by a pixel, order it, copy
//     it, delete it, with the validator's messages about it beside it.
// Every change is handed back as (path, value) or a new item; the editor (app/studio/v2-editor.js) keeps the definition.
import { el } from '../ui.js';
import { paintHex } from '../../engine/resolve.js';
import { getAt, fieldKind, paintRefs, paintWords, itemLabel, errorsFor, nodesOf } from './v2-model.js';
import { generatorDoc, argRows, starterArg, isBound, bindTo, unbind, generatorsFor } from './v2-gen.js';
import { stampSize, cellsOf, paintCell, fillCells, resizeStamp, stampRoom, STAMP_SIDE } from './v2-stamp.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const say = (v) => { try { const s = JSON.stringify(v); return s.length > 48 ? `${s.slice(0, 48)}…` : s; } catch { return '?'; } };
let uid = 0;
const fid = (what) => `v2-${what}-${++uid}`;
/** A key of a path for data-k attributes (focus is put back after a redraw by it). */
const pathKey = (path) => path.join('.');

/** The palette as engine/resolve.js paintHex reads it: { slot: '#rrggbb' } of every slot with a colour of its own. Arguments: def. */
export function paletteHexes(def) {
  const out = {};
  for (const s of Array.isArray(def?.palette) ? def.palette : Array.isArray(def?.colours) ? def.colours : []) if (isObj(s) && typeof s.default === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.default)) out[s.id] = s.default;
  return out;
}

/** A paint ref's colour for a swatch: '#rrggbb', or null (see-through, or worked out by a rule). Arguments: ref, def. */
export function swatchOf(ref, def) {
  if (ref === 'clear' || typeof ref !== 'string') return null;
  try { return paintHex(ref, paletteHexes(def), {}); } catch { return null; }
}

/** A small square showing a paint (a checker for see-through or a rule). */
const chip = (ref, def) => {
  const hex = swatchOf(ref, def);
  return el('span', { class: `v2-chip${hex ? '' : ' is-clear'}`, style: hex ? `background:${hex}` : null, 'aria-hidden': 'true' });
};

/** A select of paint refs (the current value kept first when the palette has not got it). */
function paintSelect({ id, value, def, onchange, label }) {
  const refs = paintRefs(def);
  const opts = typeof value === 'string' && !refs.includes(value) ? [value, ...refs] : refs;
  const s = el('select', { id, class: 'st-select v2-paint', 'aria-label': label, 'data-k': id, onchange: () => onchange(s.value) },
    opts.map((r) => el('option', { value: r }, `${paintWords(r, def)} (${r})`)));
  s.value = typeof value === 'string' ? value : refs[0];
  return el('span', { class: 'v2-paintbox' }, chip(s.value, def), s);
}

/** A number box committed on Enter or on leaving it. */
function numberBox({ id, value, min, max, step = 'any', onchange, label }) {
  const box = el('input', { id, type: 'number', class: 'st-num v2-num', value: String(value), min: min ?? null, max: max ?? null, step, 'aria-label': label, 'data-k': id, inputmode: 'decimal' });
  const commit = () => { const n = Number(box.value); if (box.value !== '' && Number.isFinite(n) && n !== value) onchange(n); };
  box.addEventListener('change', commit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  return box;
}

/** A text box committed on Enter or on leaving it. */
function textBox({ id, value, onchange, label, max = 300 }) {
  const box = el('input', { id, type: 'text', class: 'st-text v2-textbox', value: value ?? '', maxlength: max, 'aria-label': label, 'data-k': id });
  let last = box.value;
  const commit = () => { if (box.value !== last) { last = box.value; onchange(box.value); } };
  box.addEventListener('change', commit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  return box;
}

/** An on/off box. */
function flagBox({ id, value, onchange, label }) {
  const b = el('input', { id, type: 'checkbox', class: 'v2-flag', 'aria-label': label, 'data-k': id, onchange: () => onchange(b.checked) });
  b.checked = !!value;
  return b;
}

/** A small button. */
const mini = (label, onclick, more = {}) => el('button', { type: 'button', class: 'btn btn-sm v2-mini', onclick, ...more }, label);

/** Field names whose text is a paint ref. */
const PAINT_FIELDS = new Set(['paint', 'core', 'bright', 'face', 'frame', 'fill', 'shine', 'metal', 'field', 'gleam', 'inlay', 'base', 'rim', 'head', 'tail']);

/**
 * A part of a definition as a tree of typed inputs: { node }. Objects and lists open as nested boxes (the first levels
 * open); numbers, words and on/off as boxes; a field holding a paint ref as a paint menu; lists with Copy, Up, Down and
 * Remove on each item. Changes go to onChange(path, value) (value undefined removes it). Arguments: { def (for paints),
 * value, path, onChange, label, open (levels open, default 1), lockKeys (field names not to remove) }.
 */
export function fieldTree({ def, value, path, onChange, label, open = 1, lockKeys = [], onStamp }) {
  const lock = new Set(lockKeys);
  function leaf(v, p, name) {
    const id = `f-${pathKey(p)}`;
    const k = fieldKind(v);
    const words = `${label ?? ''} ${p.slice(-2).join(' ')}`.trim();
    if (k === 'number') return numberBox({ id, value: v, label: words, onchange: (n) => onChange(p, n) });
    if (k === 'flag') return flagBox({ id, value: v, label: words, onchange: (b) => onChange(p, b) });
    if (k === 'text') {
      if (PAINT_FIELDS.has(String(name)) || paintRefs(def).includes(v)) return paintSelect({ id, value: v, def, label: words, onchange: (x) => onChange(p, x) });
      return textBox({ id, value: v, label: words, onchange: (x) => onChange(p, x) });
    }
    return el('span', { class: 'quiet' }, 'nothing');
  }
  function node(v, p, name, depth) {
    const k = fieldKind(v);
    if (k !== 'list' && k !== 'object') return leaf(v, p, name);
    // a list of numbers (a profile, a point, a size) is one row of number boxes
    if (k === 'list' && v.length && v.every((x) => typeof x === 'number')) {
      return el('div', { class: 'v2-numbers', 'data-path': pathKey(p) }, v.map((x, i) => numberBox({ id: `f-${pathKey([...p, i])}`, value: x, label: `${label ?? ''} ${String(name)} ${i + 1}`.trim(), onchange: (n) => { const c = [...v]; c[i] = n; onChange(p, c); } })),
        v.length > 2 ? el('span', { class: 'v2-acts' }, mini('+', () => onChange(p, [...v, v.at(-1)]), { 'aria-label': `One more number in ${String(name)}` }), mini('−', () => onChange(p, v.slice(0, -1)), { 'aria-label': `One number fewer in ${String(name)}` })) : null);
    }
    const entries = k === 'list' ? v.map((x, i) => [i, x]) : Object.entries(v);
    const rows = entries.map(([key, x]) => {
      const cp = [...p, key];
      const acts = [];
      if (k === 'list') {
        acts.push(mini('↑', () => { const n = [...v]; [n[key - 1], n[key]] = [n[key], n[key - 1]]; onChange(p, n); }, { 'aria-label': `Move item ${key + 1} up`, disabled: key === 0 }));
        acts.push(mini('↓', () => { const n = [...v]; [n[key + 1], n[key]] = [n[key], n[key + 1]]; onChange(p, n); }, { 'aria-label': `Move item ${key + 1} down`, disabled: key === v.length - 1 }));
        acts.push(mini('Copy', () => { const n = [...v]; n.splice(key + 1, 0, JSON.parse(JSON.stringify(x))); onChange(p, n); }, { 'aria-label': `Copy item ${key + 1}` }));
      }
      if (!lock.has(String(key))) acts.push(mini('×', () => onChange(cp, undefined), { 'aria-label': `Remove ${k === 'list' ? `item ${key + 1}` : key}`, title: 'Remove' }));
      // a generator call anywhere in the tree is edited by its documented arguments; a stamp can be painted
      const call = isObj(x) && typeof x.gen === 'string' && Number.isInteger(x.v) && generatorDoc(x.gen, x.v);
      if (isObj(x) && x.kind === 'stamp' && Array.isArray(x.rows) && onStamp) acts.unshift(mini('Paint', () => onStamp(cp), { 'aria-label': `Paint the pixels of ${itemLabel(x)}` }));
      const inner = call ? genEditor({ def, call: x, path: cp, place: placeOf(cp), onChange, onStamp }) : node(x, cp, key, depth + 1);
      const nested = fieldKind(x) === 'list' || fieldKind(x) === 'object';
      const head = el('span', { class: 'v2-key' }, k === 'list' ? `${key + 1}` : String(key));
      if (nested) {
        const d = el('details', { class: 'v2-sub', 'data-path': pathKey(cp) }, el('summary', {}, head, el('span', { class: 'v2-sum quiet' }, summaryOf(x)), el('span', { class: 'v2-acts' }, acts)), inner);
        if (depth < open) d.open = true;
        return d;
      }
      return el('div', { class: 'v2-field', 'data-path': pathKey(cp) }, head, el('span', { class: 'v2-val' }, inner), el('span', { class: 'v2-acts' }, acts));
    });
    return el('div', { class: `v2-tree v2-tree-${k}` }, rows.length ? rows : el('p', { class: 'quiet small' }, k === 'list' ? 'An empty list.' : 'Nothing in it.'));
  }
  return node(value, path, path.at(-1), 0);
}

/** The place a call at a path stands in, for the generators it may be changed to: a motion, an emitter, a panel's piece, or a draw list. */
function placeOf(path) {
  const ks = path.filter((k) => typeof k === 'string');
  if (ks.includes('motion')) return 'motion';
  if (ks.includes('emitters')) return 'emitter';
  if (ks.at(-1) === 'piece') return 'piece';
  return 'draw';
}

/** A short summary of a nested value for its folded line. */
function summaryOf(v) {
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (isObj(v)) {
    if (typeof v.gen === 'string' || typeof v.kind === 'string' || typeof v.use === 'string') return itemLabel(v);
    if (typeof v.from === 'string') return `set by ${v.from}`;
    if (typeof v.rule === 'string') return `rule ${v.rule}`;
    const id = v.id ?? v.name ?? v.key;
    return typeof id === 'string' ? id : `${Object.keys(v).length} fields`;
  }
  return '';
}

/** The controls a value can be bound to: [{ key, label, options? (a choice's, or 'true'/'false' for on/off), range? }]. */
function bindable(def) {
  return (Array.isArray(def?.controls) ? def.controls : []).filter((c) => isObj(c) && typeof c.key === 'string' && !c.standard && c.kind !== 'colour').map((c) => ({
    key: c.key, label: c.label ?? c.key,
    options: c.kind === 'choice' ? (c.options ?? []).map((o) => (isObj(o) ? o.value : o)) : c.kind === 'toggle' ? ['true', 'false'] : undefined,
    range: c.kind === 'range' || c.kind === 'slider' ? [Number.isFinite(c.min) ? c.min : 0, Number.isFinite(c.max) ? c.max : 1] : undefined,
  }));
}

/**
 * A generator call's editor: which generator and version, where it sits (node), its id, then one row per argument in
 * the registry's order with the input its type takes; a bound argument shows its table (and goes back to a fixed value
 * with Fixed); an optional argument not given shows its default and Set. The call's other fields (when, clip, z ...)
 * follow as a field tree. Arguments: { def, call, path, place ('draw' | 'motion' | 'emitter' | 'shapes'), onChange (path, value), errors (messages about it) }.
 */
export function genEditor({ def, call, path, place, onChange, onStamp }) {
  const g = generatorDoc(call.gen, call.v);
  const ctx = { paints: paintRefs(def), frame: def.size ?? [32, 32] };
  const versions = generatorsFor(place).filter((x) => x.id === call.gen);
  const head = el('div', { class: 'v2-genhead' },
    el('strong', {}, `${call.gen}@${call.v}`),
    versions.length > 1 ? el('label', { class: 'st-check' }, 'Version ', el('select', { class: 'st-select', 'data-k': `${pathKey(path)}-v`, onchange: (e) => onChange([...path, 'v'], Number(e.target.value)) }, versions.map((x) => el('option', { value: String(x.v), selected: x.v === call.v }, String(x.v))))) : null);
  if (!g) return el('div', { class: 'v2-gen' }, head, el('p', { class: 'v2-err' }, `There is no generator ${call.gen}@${call.v} in the registry. Pick another, or remove it.`), fieldTree({ def, value: call, path, onChange }));
  const rows = [el('p', { class: 'v2-about' }, g.about)];
  const nodes = nodesOf(def);
  if (place !== 'motion' && nodes.length) {
    const id = `g-${pathKey(path)}-on`;
    rows.push(el('div', { class: 'v2-arg' }, el('label', { class: 'v2-argname', for: id }, 'Sits on'),
      el('select', { id, class: 'st-select', 'data-k': id, onchange: (e) => onChange([...path, 'on'], e.target.value || undefined) },
        el('option', { value: '' }, 'The frame (no node)'), nodes.map((n) => el('option', { value: n, selected: call.on === n }, n)))));
  }
  for (const r of argRows(g, call)) {
    const p = [...path, r.name];
    const id = `g-${pathKey(p)}`;
    const name = el('label', { class: 'v2-argname', for: id, title: r.about }, r.name, r.optional ? el('span', { class: 'quiet' }, ' (optional)') : null);
    const note = r.about ? el('span', { class: 'v2-argabout' }, r.about) : null;
    let body;
    if (!r.set) {
      body = el('span', { class: 'v2-argdef' }, el('span', { class: 'quiet' }, `default ${say(r.default)}`), mini('Set', () => onChange(p, r.default !== undefined ? JSON.parse(JSON.stringify(r.default)) : starterArg(r.type, { ...ctx, onNode: !!call.on })), { 'data-k': `${id}-set`, 'aria-label': `Set ${r.name}` }));
    } else if (isBound(r.value)) {
      body = bindingEditor({ def, binding: r.value, type: r.type, path: p, name: r.name, onChange, onStamp });
    } else {
      body = argInputFor({ def, r, p, id, onChange, ctx, call, onStamp });
      const ctl = bindable(def);
      if (r.input.binding && ctl.length) {
        body = el('span', { class: 'v2-argbody' }, body, el('select', { class: 'st-select v2-bind', 'aria-label': `Let a control set ${r.name}`, 'data-k': `${id}-bind`, onchange: (e) => {
          const c = ctl.find((x) => x.key === e.target.value);
          if (c) onChange(p, bindTo(c.key, r.type, r.value, c.options, c.range));
        } }, el('option', { value: '' }, 'Fixed'), ctl.map((c) => el('option', { value: c.key }, `Set by ${c.label}`))));
      }
    }
    const reset = r.optional && r.set ? mini('Default', () => onChange(p, undefined), { 'aria-label': `${r.name} back to its default` }) : null;
    rows.push(el('div', { class: 'v2-arg', 'data-arg': r.name }, name, el('span', { class: 'v2-argin' }, body, reset), note));
  }
  const other = Object.fromEntries(Object.entries(call).filter(([k]) => !Object.hasOwn(g.args, k) && !['gen', 'v', 'on'].includes(k)));
  if (Object.keys(other).length) rows.push(el('details', { class: 'v2-sub v2-other' }, el('summary', {}, 'Its other fields (id, when, clip …)'), fieldTree({ def, value: other, path, onChange, open: 1, onStamp })));
  return el('div', { class: 'v2-gen', 'data-gen': `${call.gen}@${call.v}` }, head, rows);
}

/**
 * A bound argument: which control sets it, and its table (a number for each point of the control: { from, map }) or its
 * pick (a value for each option: { from, pick }), each value in the input the argument's type takes; Fixed makes it one
 * value again. A table, never a formula.
 */
function bindingEditor({ def, binding, type, path, name, onChange, onStamp }) {
  const ctl = bindable(def);
  const pick = el('select', { class: 'st-select', 'aria-label': `The control that sets ${name}`, 'data-k': `b-${pathKey(path)}-from`, onchange: (e) => {
    const c = ctl.find((x) => x.key === e.target.value);
    if (c) onChange(path, bindTo(c.key, type, unbind(binding, type), c.options, c.range));
  } }, ctl.map((c) => el('option', { value: c.key, selected: c.key === binding.from }, c.label)));
  if (!ctl.some((c) => c.key === binding.from)) pick.prepend(el('option', { value: binding.from, selected: true }, binding.from));
  const head = el('span', { class: 'v2-bindhead' }, 'Set by ', pick, mini('Fixed', () => onChange(path, unbind(binding, type)), { 'aria-label': `Make ${name} a fixed value` }));
  const one = { ...type, type: type.type === 'point' ? 'px' : type.type };
  let rows;
  if (Array.isArray(binding.map) && binding.map.every((m) => Array.isArray(m) && m.length === 2 && typeof m[0] === 'number' && typeof m[1] === 'number')) {
    rows = binding.map.map(([a, b], i) => el('span', { class: 'v2-maprow' },
      el('span', { class: 'quiet' }, 'at '), numberBox({ id: `b-${pathKey(path)}-${i}-in`, value: a, step: 'any', label: `${name}: control value ${i + 1}`, onchange: (n) => { const m = binding.map.map((x) => [...x]); m[i][0] = n; onChange([...path, 'map'], m); } }),
      el('span', { class: 'quiet' }, ' gives '), numberBox({ id: `b-${pathKey(path)}-${i}-out`, value: b, min: type.lo, max: type.hi, step: 'any', label: `${name}: value ${i + 1}`, onchange: (n) => { const m = binding.map.map((x) => [...x]); m[i][1] = n; onChange([...path, 'map'], m); } }),
      binding.map.length > 2 ? mini('×', () => onChange([...path, 'map'], binding.map.filter((_, j) => j !== i)), { 'aria-label': `Remove point ${i + 1} of ${name}'s table` }) : null));
    rows.push(el('span', { class: 'v2-maprow' }, binding.map.length < 32 ? mini('+ Point', () => { const m = binding.map.map((x) => [...x]); const [a, b] = m.at(-1); m.push([a + 0.5, b]); onChange([...path, 'map'], m); }, { 'aria-label': `Add a point to ${name}'s table` }) : null));
  } else if (isObj(binding.pick)) {
    rows = Object.entries(binding.pick).map(([o, v]) => {
      const p = [...path, 'pick', o];
      const r = { name: `${name} when ${o}`, type: one, input: { number: { input: 'number', min: type.lo, max: type.hi, step: 'any' } }.number, value: v };
      const inputOf = typeof v === 'number' ? numberBox({ id: `b-${pathKey(p)}`, value: v, min: type.lo, max: type.hi, step: 'any', label: r.name, onchange: (n) => onChange(p, n) })
        : typeof v === 'boolean' ? flagBox({ id: `b-${pathKey(p)}`, value: v, label: r.name, onchange: (b) => onChange(p, b) })
          : typeof v === 'string' && (type.type === 'paint' || paintRefs(def).includes(v)) ? paintSelect({ id: `b-${pathKey(p)}`, value: v, def, label: r.name, onchange: (x) => onChange(p, x) })
            : typeof v === 'string' && Array.isArray(type.values) ? (() => { const sel = el('select', { class: 'st-select', 'aria-label': r.name, 'data-k': `b-${pathKey(p)}`, onchange: () => onChange(p, sel.value) }, type.values.map((x) => el('option', { value: x, selected: x === v }, x))); return sel; })()
              : fieldTree({ def, value: v, path: p, onChange, label: r.name, open: 1, onStamp });
      return el('span', { class: 'v2-maprow' }, el('span', { class: 'quiet' }, `${o} gives `), inputOf);
    });
  } else rows = [fieldTree({ def, value: binding, path, onChange, label: name, open: 2, onStamp })];
  return el('span', { class: 'v2-bound' }, head, rows);
}

/** One argument's input by its type (app/studio/v2-gen.js argInput). */
function argInputFor({ def, r, p, id, onChange, ctx, call, onStamp }) {
  const t = r.input;
  const v = r.value;
  if (t.input === 'number' && typeof v === 'number') return numberBox({ id, value: v, min: t.min, max: t.max, step: t.step, label: r.name, onchange: (n) => onChange(p, n) });
  if (t.input === 'word' && typeof v === 'string') {
    const s = el('select', { id, class: 'st-select', 'data-k': id, 'aria-label': r.name, onchange: () => onChange(p, s.value) }, t.options.map((o) => el('option', { value: o }, o)));
    s.value = v;
    return s;
  }
  if (t.input === 'flag' && typeof v === 'boolean') return flagBox({ id, value: v, label: r.name, onchange: (b) => onChange(p, b) });
  if (t.input === 'paint' && typeof v === 'string') return paintSelect({ id, value: v, def, label: r.name, onchange: (x) => onChange(p, x) });
  if (t.input === 'paints' && Array.isArray(v) && v.every((x) => typeof x === 'string')) {
    return el('span', { class: 'v2-paints' }, v.map((x, i) => el('span', { class: 'v2-paintsone' }, paintSelect({ id: `${id}-${i}`, value: x, def, label: `${r.name} ${i + 1}`, onchange: (y) => { const n = [...v]; n[i] = y; onChange(p, n); } }),
      v.length > 1 ? mini('×', () => onChange(p, v.filter((_, j) => j !== i)), { 'aria-label': `Remove paint ${i + 1} of ${r.name}` }) : null)),
    t.most === undefined || v.length < t.most ? mini('+ Paint', () => onChange(p, [...v, ctx.paints[0]]), { 'aria-label': `Add a paint to ${r.name}` }) : null);
  }
  if (t.input === 'point' && Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')) {
    return el('span', { class: 'v2-point' }, 'x ', numberBox({ id: `${id}-x`, value: v[0], min: t.min, max: t.max, step: t.step, label: `${r.name} across`, onchange: (n) => onChange(p, [n, v[1]]) }),
      ' y ', numberBox({ id: `${id}-y`, value: v[1], min: t.min, max: t.max, step: t.step, label: `${r.name} down`, onchange: (n) => onChange(p, [v[0], n]) }));
  }
  // a place that is a stamp is painted; any other shape, list or struct is a field tree
  if (isObj(v) && v.kind === 'stamp' && onStamp) return el('span', { class: 'v2-argbody' }, mini('Paint', () => onStamp(p), { 'aria-label': `Paint the pixels of ${r.name}` }), fieldTree({ def, value: v, path: p, onChange, label: r.name, open: 0, onStamp }));
  return fieldTree({ def, value: v, path: p, onChange, label: r.name, open: 1, onStamp });
}

/**
 * The stamp painter: the stamp's pixels on a canvas (12x, smaller when it would not fit), a paint picked from the
 * palette's slots and tones, ink, or see-through, Pencil or Fill, its size (within 32 x 32 and the definition's 8,192
 * stamp pixels), and which variant is painted. Pointer: press and drag to paint; the keyboard: the cells are also a grid
 * of arrows and Enter (the canvas is focusable). Arguments: { def, stamp, path, state ({ paint, tool, variant }: kept by
 * the editor between redraws), onChange (path, value), onState (state) }.
 */
export function stampPainter({ def, stamp, path, state, onChange, onState }) {
  const [w, h] = stampSize(stamp);
  const variants = isObj(stamp.variants) ? Object.keys(stamp.variants) : [];
  const variant = variants.includes(state.variant) ? state.variant : '';
  const refs = paintRefs(def).filter((r) => r !== 'clear');
  const paint = state.paint === null || refs.includes(state.paint) ? state.paint : refs[0];
  const cells = cellsOf(stamp, variant || undefined);
  const room = stampRoom(def, path);
  const cell = Math.max(12, Math.min(32, Math.floor(384 / Math.max(w, h))));      // at least 12x; the box shrinks it on a phone
  const canvas = el('canvas', { class: 'v2-stampgrid', width: w * cell + 1, height: h * cell + 1, tabindex: '0', role: 'img', 'aria-label': `The stamp's pixels, ${w} by ${h}: click or drag to paint`, 'data-cell': String(cell), 'data-w': String(w), 'data-h': String(h) });
  const g = canvas.getContext('2d');
  const cursor = { x: 0, y: 0 };
  function paintGrid(cs) {
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ref = cs[y][x];
      const hex = ref ? swatchOf(ref, def) : null;
      if (hex) { g.fillStyle = hex; g.fillRect(x * cell, y * cell, cell, cell); }
      else { g.fillStyle = (x + y) % 2 ? '#ecebe6' : '#f7f6f2'; g.fillRect(x * cell, y * cell, cell, cell); }
    }
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 1;
    for (let x = 0; x <= w; x++) { g.beginPath(); g.moveTo(x * cell + 0.5, 0); g.lineTo(x * cell + 0.5, h * cell); g.stroke(); }
    for (let y = 0; y <= h; y++) { g.beginPath(); g.moveTo(0, y * cell + 0.5); g.lineTo(w * cell, y * cell + 0.5); g.stroke(); }
    if (document.activeElement === canvas) { g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(cursor.x * cell + 1, cursor.y * cell + 1, cell - 1, cell - 1); }
  }
  // painting: a drag paints on the stamp in hand and draws at once; the change is handed back when the press ends
  let work = null;
  const at = (e) => {
    const b = canvas.getBoundingClientRect();
    const k = b.width / canvas.width;
    return [Math.floor((e.clientX - b.left) / (cell * k)), Math.floor((e.clientY - b.top) / (cell * k))];
  };
  const apply = (s, x, y) => (state.tool === 'fill' ? fillCells(s, x, y, paint, variant || undefined) : paintCell(s, x, y, paint, variant || undefined));
  const finish = () => { if (work && work !== stamp) onChange(path, work); work = null; };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const [x, y] = at(e);
    work = apply(stamp, x, y);
    paintGrid(cellsOf(work, variant || undefined));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!work || state.tool === 'fill') return;
    const [x, y] = at(e);
    const next = apply(work, x, y);
    if (next !== work) { work = next; paintGrid(cellsOf(work, variant || undefined)); }
  });
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('focus', () => paintGrid(cells));
  canvas.addEventListener('blur', () => paintGrid(cells));
  canvas.addEventListener('keydown', (e) => {
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (mv) { e.preventDefault(); e.stopPropagation(); cursor.x = (cursor.x + mv[0] + w) % w; cursor.y = (cursor.y + mv[1] + h) % h; paintGrid(cells); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const next = apply(stamp, cursor.x, cursor.y); if (next !== stamp) onChange(path, next); }
  });
  paintGrid(cells);

  const swatches = el('div', { class: 'v2-swatches', role: 'radiogroup', 'aria-label': 'Paint with' },
    [...refs, null].map((r) => el('button', { type: 'button', class: 'v2-swatch', role: 'radio', 'aria-checked': String(r === paint), 'data-paint': r ?? 'see-through', title: r ? `${paintWords(r, def)} (${r})` : 'See-through (rub out)', 'aria-label': r ? paintWords(r, def) : 'See-through', onclick: () => onState({ ...state, paint: r }) },
      r ? chip(r, def) : el('span', { class: 'v2-chip is-clear', 'aria-hidden': 'true' }))));
  const tools = el('span', { class: 'seg', role: 'group', 'aria-label': 'Tool' },
    el('button', { type: 'button', 'aria-pressed': String(state.tool !== 'fill'), onclick: () => onState({ ...state, tool: 'pencil' }) }, 'Pencil'),
    el('button', { type: 'button', 'aria-pressed': String(state.tool === 'fill'), onclick: () => onState({ ...state, tool: 'fill' }) }, 'Fill'));
  const most = (other) => Math.max(1, Math.min(STAMP_SIDE, Math.floor((room - (variants.length ? 0 : 0)) / ((1 + variants.length) * other))));
  const size = el('span', { class: 'v2-stampsize' },
    el('label', { class: 'st-lbl' }, 'Width ', numberBox({ id: `s-${pathKey(path)}-w`, value: w, min: 1, max: Math.min(STAMP_SIDE, most(h)), step: 1, label: 'Stamp width', onchange: (n) => onChange(path, resizeStamp(stamp, Math.min(n, most(h)), h)) })),
    el('label', { class: 'st-lbl' }, 'Height ', numberBox({ id: `s-${pathKey(path)}-h`, value: h, min: 1, max: Math.min(STAMP_SIDE, most(w)), step: 1, label: 'Stamp height', onchange: (n) => onChange(path, resizeStamp(stamp, w, Math.min(n, most(w)))) })),
    el('span', { class: 'quiet small' }, `at most ${STAMP_SIDE} × ${STAMP_SIDE}; ${room.toLocaleString('en')} stamp pixels free for it`));
  const which = variants.length ? el('label', { class: 'st-check' }, 'Painting ', el('select', { class: 'st-select', 'data-k': `s-${pathKey(path)}-variant`, onchange: (e) => onState({ ...state, variant: e.target.value }) },
    el('option', { value: '' }, 'its own pixels'), variants.map((v) => el('option', { value: v, selected: v === variant }, `the variant "${v}"`)))) : null;
  return el('div', { class: 'v2-stamp', 'data-path': pathKey(path) },
    el('div', { class: 'v2-stamptools' }, tools, which, el('span', { class: 'quiet small v2-painting-with' }, paint ? `Painting with ${paintWords(paint, def)} (${paint})` : 'Rubbing out (see-through)')),
    swatches,
    el('div', { class: 'v2-stampbox' }, canvas),
    size);
}

/**
 * The rows of one draw list: each item's label (pick it), with Up, Down, Copy and Delete, and the validator's messages
 * about it under it. Arguments: { def, list ({ path, label, place }), selected (path key of the picked item), errors
 * (all messages), word (how the validator names this list's items: 'Draw', 'Shape', 'Emitter' ...), onPick (path),
 * onChange (path, value), adder (the add menu node) }.
 */
export function itemList({ def, list, selected, errors, word, onPick, onChange, adder }) {
  const items = getAt(def, list.path) ?? [];
  const rows = items.map((it, i) => {
    const p = [...list.path, i];
    const mine = errorsFor(errors, { word, index: i, id: isObj(it) ? it.id : undefined });
    const on = selected === pathKey(p);
    return el('div', { class: `v2-item${on ? ' on' : ''}${mine.length ? ' has-error' : ''}`, 'data-item': String(i), 'data-path': pathKey(p) },
      el('button', { type: 'button', class: 'v2-itemname', 'aria-pressed': String(on), onclick: () => onPick(on ? null : p) },
        isObj(it) && typeof it.paint === 'string' ? chip(it.paint, def) : el('span', { class: 'v2-chip is-gen', 'aria-hidden': 'true' }),
        el('span', { class: 'v2-itemlabel' }, itemLabel(it))),
      el('span', { class: 'v2-acts' },
        mini('↑', () => onChange(list.path, swap(items, i, i - 1)), { 'aria-label': `Draw ${itemLabel(it)} earlier (under)`, disabled: i === 0 }),
        mini('↓', () => onChange(list.path, swap(items, i, i + 1)), { 'aria-label': `Draw ${itemLabel(it)} later (over)`, disabled: i === items.length - 1 }),
        mini('Copy', () => onChange(list.path, [...items.slice(0, i + 1), copyItem(it, def), ...items.slice(i + 1)]), { 'aria-label': `Copy ${itemLabel(it)}` }),
        mini('Delete', () => onChange(p, undefined), { 'aria-label': `Delete ${itemLabel(it)}` })),
      mine.length ? el('ul', { class: 'v2-errs' }, mine.map((m) => el('li', {}, m))) : null);
  });
  return el('section', { class: 'v2-list', 'data-list': pathKey(list.path) },
    el('div', { class: 'st-head' }, el('h3', {}, list.label), adder),
    rows.length ? rows : el('p', { class: 'quiet small' }, 'Nothing yet.'));
}

const swap = (items, i, j) => { const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; return n; };
function copyItem(it, def) {
  const c = JSON.parse(JSON.stringify(it));
  if (isObj(c) && typeof c.id === 'string') {
    const taken = new Set(JSON.stringify(def).match(/"id":"[^"]*"/g) ?? []);
    let n = 2;
    while (taken.has(`"id":"${c.id}-${n}"`)) n++;
    c.id = `${c.id}-${n}`;
  }
  return c;
}
