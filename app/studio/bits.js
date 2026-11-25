// Small pieces the studio's tabs are built from (item S9): a control row in the editing panel's shape (base.css .ctl),
// a number with buttons either side, a switch, a heading, a menu that opens under its button. Built from app/ui.js el()
// and the shared components in app/css/base.css; the studio's own layout is in app/css/studio.css.
import { el } from '../ui.js';
import { showPicture } from '../art.js';
import { styleById } from '../../engine/styles.js';

/** Whether a picture from app/art.js framePicture is a vector style's (flat), even one drawn at the frame's own size (k 1: a small thumbnail). */
export const isVectorPicture = (pic) => !!pic && (pic.k > 1 || (styleById(pic.style)?.pictureScale ?? 1) > 1);

/**
 * Show such a picture on a canvas the page scales with CSS: smooth for a vector style however small it is drawn (never
 * pixelated), crisp pixels for pixel art (as before). Arguments: el (the canvas), pic ({ k, style }).
 */
export const showFrame = (node, pic) => showPicture(node, isVectorPicture(pic) ? Math.max(2, pic.k) : 1);

let uid = 0;
/** A fresh id for a label to point at. */
export const fieldId = (what) => `st-${what}-${++uid}`;

/** One control row: its name (a real label when `forId` names the control), the control, and an optional reset. Arguments: label, body (nodes), { forId, changed, reset (a function), note, k (a focus key) }. */
export function row(label, body, { forId, changed = false, reset, note, cls = '' } = {}) {
  const dot = el('span', { class: 'dot', title: 'Changed on this frame', 'aria-hidden': 'true' });
  const name = forId ? el('label', { class: 'ctl-label', for: forId }, label, dot) : el('span', { class: 'ctl-label' }, label, dot);
  return el('div', { class: `ctl ${cls}${changed ? ' is-changed' : ''}` }, name, el('div', { class: 'ctl-body' }, body),
    reset ? el('button', { type: 'button', class: 'reset', onclick: reset }, 'Reset') : el('span'),
    note ? el('p', { class: 'ctl-note' }, note) : null);
}

/** A section heading inside a tab, with buttons on its right. */
export const head = (text, ...right) => el('div', { class: 'st-head' }, el('h3', {}, text), ...right);

/** A small outlined button. Arguments: label, onclick, more attributes. */
export const btn = (label, onclick, more = {}) => el('button', { type: 'button', class: 'btn btn-sm', onclick, ...more }, label);

/** A square icon button with words for screen readers. */
export const icon = (glyph, label, onclick, more = {}) => el('button', { type: 'button', class: 'icon-btn st-icon', 'aria-label': label, title: label, onclick, ...more }, el('span', { 'aria-hidden': 'true' }, glyph));

/**
 * A number people change with buttons either side or by typing (committed on Enter or leaving the box).
 * Arguments: { id, label (for screen readers), value, min, max, step, unit (words after it), onchange (n) }.
 */
export function stepper({ id, label, value, min, max, step = 1, unit = '', onchange, k }) {
  const input = el('input', { id, type: 'number', class: 'st-num', inputmode: 'numeric', value: String(value), min, max, step, 'aria-label': label, 'data-k': k ?? id });
  const commit = (v) => { const n = Number(v); if (Number.isFinite(n) && n !== value) onchange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))); };
  input.addEventListener('change', () => commit(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(input.value); } });
  return el('span', { class: 'st-step' },
    icon('−', `Less ${label.toLowerCase()}`, () => commit(value - step), { 'data-k': `${k ?? id}-less`, disabled: min !== undefined && value <= min }),
    input,
    icon('+', `More ${label.toLowerCase()}`, () => commit(value + step), { 'data-k': `${k ?? id}-more`, disabled: max !== undefined && value >= max }),
    unit ? el('span', { class: 'st-unit' }, unit) : null);
}

/** A switch (base.css .switch) around a real checkbox. Arguments: { id, label (for screen readers when there is no visible label), checked, onchange (bool) }. */
export function toggle({ id, label, checked, onchange }) {
  const input = el('input', { id, type: 'checkbox', role: 'switch', 'aria-label': label, 'data-k': id, onchange: () => onchange(input.checked) });
  input.checked = !!checked;
  return el('span', { class: 'switch' }, input, el('span', { class: 'knob', 'aria-hidden': 'true' }));
}

/** A select of { value, label } options. */
export function select({ id, label, value, options, onchange, k }) {
  const s = el('select', { id, class: 'st-select', 'aria-label': label, 'data-k': k ?? id, onchange: () => onchange(s.value) },
    options.map((o) => el('option', { value: o.value, selected: o.value === value }, o.label)));
  s.value = value;
  return s;
}

/** A text box committed on Enter or on leaving it. Arguments: { id, value, max, onchange (text), multi (a textarea), placeholder }. */
export function text({ id, value, max, onchange, multi = false, placeholder }) {
  const box = el(multi ? 'textarea' : 'input', { id, class: multi ? 'st-text st-area' : 'st-text', maxlength: max, placeholder, 'data-k': id, rows: multi ? 2 : null, ...(multi ? {} : { type: 'text' }) });
  box.value = value ?? '';
  let last = box.value;
  const commit = () => { if (box.value !== last) { last = box.value; onchange(box.value); } };
  box.addEventListener('change', commit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (!multi || !e.shiftKey)) { e.preventDefault(); commit(); } });
  return box;
}

/**
 * A button that opens a small menu under (or over) it: items [{ label, onclick, disabled, note }]. Escape or a press
 * elsewhere closes it; arrow keys move through it. Returns the wrapper. Arguments: label, items (or a function giving them), { up, right, primary, k }.
 */
export function menuButton(label, items, { up = false, right = false, cls = 'btn btn-sm', k, act } = {}) {
  const menu = el('div', { class: `menu${up ? ' up' : ''}${right ? ' right' : ''}`, role: 'menu', hidden: true });
  const b = el('button', { type: 'button', class: cls, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-k': k ?? null, 'data-act': act ?? null }, label);
  const close = (focus) => { menu.hidden = true; b.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', away, true); if (focus) b.focus(); };
  const away = (e) => { if (!wrap.contains(e.target)) close(false); };
  const open = () => {
    const list = typeof items === 'function' ? items() : items;
    menu.replaceChildren(...list.map((it) => el('button', { type: 'button', role: 'menuitem', disabled: it.disabled || null, title: it.note ?? null, onclick: () => { close(true); it.onclick(); } },
      el('span', {}, it.label), it.note ? el('span', { class: 'n' }, it.note) : null)));
    menu.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', away, true);
    menu.querySelector('button:not([disabled])')?.focus();
  };
  b.addEventListener('click', () => (menu.hidden ? open() : close(false)));
  menu.addEventListener('keydown', (e) => {
    const all = [...menu.querySelectorAll('button:not([disabled])')];
    const i = all.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus(); }
  });
  const wrap = el('div', { class: 'menu-wrap' }, b, menu);
  return wrap;
}
