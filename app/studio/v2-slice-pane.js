// The studio's 9-slice editor for panel bodies (build item B19b; docs/data-sprites.md section 6, "Interface: 9-slice
// editor": skin and piece pick, drag the four slice lines, states as tabs, text area as a box; Contract 8). Shown on
// the Body tab of a panel draft in place of the field tree (app/studio/v2-editor.js); All fields still has every field.
//   - The panel's states as tabs (picking one picks the clip under the picture too).
//   - The state's frame on a zoomed picture with its slice lines, rect, opening, repeat and text areas drawn over it:
//     drag a line, or the text area (inside to move it, its corner to size it). The change is kept when the press
//     ends, written for the state or, with "Same for every state", for every state; the same in number boxes, by
//     keyboard; "Back to the measured" takes it away again (app/studio/v2-slice.js, the model).
//   - The piece stretched to several sizes side by side, following a drag as it happens.
//   - What the library download says for the state (the sheet JSON's animations[<state>]: border, rect, opening, tile,
//     textArea), from the framework's own export.
//   - The skin piece (its reference, its version, its slots mapped to the palette); the piece picked from the interface
//     piece generators (switched keeping what the new one takes, app/studio/v2-slice.js switchPiece) and its arguments
//     (app/studio/v2-fields.js genEditor); the states' looks as fields.
//   - The frame worked in is the picture's (a draft with mistakes shows the last that drew), and the picture's canvas
//     is bounded (v2-slice.js frameOf, zoomFor). A text colour no paint of the sprite has is said, and can be added to
//     the palette so a text area of your own keeps it.
// Every change goes back through onChange(path, value) or onCommit(def, note): the editor keeps the definition.
import { el } from '../ui.js';
import { cleanParams } from '../../engine/sprite.js';
import { framePicture, drawPicture } from '../art.js';
import { showFrame } from './bits.js';
import { sitePieces } from '../../engine/pieces.js';
import { paintRefs, paintWords } from './v2-model.js';
import { genEditor, fieldTree, swatchOf } from './v2-fields.js';
import * as SL from './v2-slice.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const PANEL = ['body', 'panel'];
const LINE = '#2563eb', AREA = '#c026d3', OPEN = '#059669', RECT = '#1f2937';
/** Appends the children that are there (Node.append would write null as text). */
const put = (node, ...kids) => node.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
const mini = (label, onclick, more = {}) => el('button', { type: 'button', class: 'btn btn-sm v2-mini', onclick, ...more }, label);

/** The export of a state at some settings, kept per sprite (renderSheet draws the clip's frames). */
const exports = new WeakMap();
function exportFor(sprite, clip, p) {
  if (!sprite) return null;
  let m = exports.get(sprite);
  if (!m) { m = new Map(); exports.set(sprite, m); }
  const k = `${clip}\n${JSON.stringify(p)}`;
  if (!m.has(k)) { if (m.size > 64) m.clear(); m.set(k, SL.exportOf(sprite, clip, p)); }
  return m.get(k);
}

/** The pieces index, read once for the skin list (empty when it cannot be read). */
let indexP = null;
const piecesIndex = () => (indexP ??= Promise.resolve().then(() => sitePieces().index()).catch(() => ({ pieces: [] })));

/**
 * A frame of the sprite as a picture in the site's art style (app/art.js: { canvas, k }, k canvas pixels a frame pixel),
 * drawn for `zoom` pixels a frame pixel, or null.
 */
function framePic(sprite, clip, frame, p, zoom) {
  try { return framePicture(sprite, clip, frame, p, { zoom }); } catch { return null; }
}

/** A number box committed on Enter or on leaving it. */
function numberBox({ label, value, min, max, onchange, k, disabled }) {
  const box = el('input', { type: 'number', class: 'st-num v2-num', value: value === undefined ? '' : String(value), min, max, step: 1, 'aria-label': label, 'data-k': k, inputmode: 'numeric', disabled: !!disabled });
  const commit = () => { const n = Number(box.value); if (box.value !== '' && Number.isFinite(n) && n !== value) onchange(Math.round(n)); };
  box.addEventListener('change', commit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  return box;
}

/** A light checker behind the picture, so see-through pixels read as see-through. */
function checker(g, w, h, cell) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ececea';
  for (let y = 0; y < h; y += cell) for (let x = (y / cell) % 2 ? cell : 0; x < w; x += cell * 2) g.fillRect(x, y, cell, cell);
}

/** A box stroked on whole zoomed pixels. */
function box(g, z, b, colour, dash = [], width = 1) {
  g.save();
  g.strokeStyle = colour; g.lineWidth = width; g.setLineDash(dash);
  g.strokeRect(b.x * z + width / 2, b.y * z + width / 2, Math.max(1, b.w * z - width), Math.max(1, b.h * z - width));
  g.restore();
}

/**
 * The 9-slice editor of a panel draft: { node }. Arguments: { def (the draft), sprite (the last that drew, or null),
 * stale (the draft has mistakes: the picture is the last that drew), clip (the state in hand), frame, params (the
 * settings being tried), pieces (a piece store; the site's by default), ui (an object kept by the editor across
 * redraws: { every }), onChange (path, value), onCommit (def, note), onClip (state), onStamp (path) }.
 */
export function slicePane({ def, sprite, stale = false, clip, frame = 0, params = {}, pieces = sitePieces(), ui = {}, onChange, onCommit, onClip, onStamp }) {
  // the frame of the picture shown: the last that drew when the draft has mistakes, never the draft's unchecked size
  const size = SL.frameOf(def, sprite);
  const [W, H] = size;
  const states = SL.panelStates(def, sprite);
  const state = states.includes(clip) ? clip : states[0];
  const p = sprite ? cleanParams(sprite, params) : {};
  const exp = sprite && sprite.clips[state] ? exportFor(sprite, state, p) : null;
  // "Same for every state" is read when a change is written (the box is ticked without a redraw)
  const opts = { clips: states, size, params: p, get every() { return ui.every ?? (SL.writtenEvery(def, 'slice') || SL.writtenEvery(def, 'textArea')); } };
  const ownSlice = SL.writtenSlice(def, state), ownArea = SL.writtenArea(def, state);
  const lines = SL.linesOf(exp, size);
  const areas = SL.areasOf(exp);
  const area = areas[0] ?? null;
  const panel = isObj(def.body?.panel) ? def.body.panel : {};
  const out = el('section', { class: 'v2-list v2-slice', 'data-state': state ?? '', 'aria-label': 'Stretching (9-slice)' });

  // ---- the states, as tabs ----
  const tabs = el('div', { class: 'chips v2-slice-states', role: 'tablist', 'aria-label': 'States' }, states.map((s) => el('button', {
    type: 'button', class: 'chip', role: 'tab', 'data-state': s, 'aria-selected': String(s === state), tabindex: s === state ? '0' : '-1',
    onclick: () => { if (s !== state) onClip(s); },
  }, sprite?.clips[s]?.label || s)));
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault(); e.stopPropagation();
    const i = states.indexOf(state);
    onClip(states[(i + (e.key === 'ArrowRight' ? 1 : states.length - 1)) % states.length]);
  });
  const whose = (own, field) => (own ? (SL.writtenEvery(def, field) ? 'yours, for every state' : 'yours, for this state') : 'measured by the piece');
  put(out, 
    el('div', { class: 'st-head' }, el('h3', {}, 'Stretching (9-slice)')),
    el('p', { class: 'quiet small' }, 'Drag the four lines: the corners outside them are kept, the edges stretch along, the middle both ways. Drag the dashed box where text goes (its corner sizes it).'),
    tabs,
    el('p', { class: 'v2-slice-source small' }, `Slice: ${whose(ownSlice, 'slice')}. Text area: ${whose(ownArea, 'textArea')}.`));
  if (!sprite) {
    put(out, el('p', { class: 'pane-note' }, 'It does not draw yet: fix what Check lists, then the slice and the text area can be dragged here.'));
  } else if (stale) put(out, el('p', { class: 'quiet small' }, 'It has mistakes: this is the last version that drew.'));

  // ---- the zoomed picture, with the lines and boxes over it ----
  const z = SL.zoomFor(size);
  const pic = el('canvas', { class: 'v2-slice-pic', width: Math.round(W * z), height: Math.round(H * z), 'data-w': W, 'data-h': H, 'data-zoom': z, role: 'img', 'aria-label': `The ${state} state, ${z} times, with its slice lines and text area` });
  const src = sprite && sprite.clips[state] ? framePic(sprite, state, Math.min(frame, sprite.clips[state].frames - 1), p, z) : null;
  // a flat picture is smooth when the page scales the canvas; the lines and boxes are drawn in frame pixels either way
  showFrame(pic, src);
  let live = { lines, area };
  let hot = null;
  function drawPic() {
    const g = pic.getContext('2d');
    g.imageSmoothingEnabled = false;
    checker(g, pic.width, pic.height, Math.max(4, z * 2));
    if (src) drawPicture(g, src, 0, 0, W * z, H * z);
    if (isObj(exp?.tile)) { g.fillStyle = 'rgba(5,150,105,0.18)'; g.fillRect(exp.tile.x * z, 0, exp.tile.w * z, H * z); }
    if (isObj(exp?.opening)) box(g, z, exp.opening, OPEN, [2, 2], 2);
    if (isObj(exp?.rect)) box(g, z, exp.rect, RECT, [], 1);
    areas.slice(1).forEach((a) => box(g, z, a, AREA, [3, 3], 1));
    const L = live.lines;
    if (L) {
      const line = (x0, y0, x1, y1, on) => {
        g.lineWidth = on ? 5 : 3; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.lineWidth = on ? 3 : 1; g.strokeStyle = LINE; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      };
      line(L.x1 * z, 0, L.x1 * z, H * z, hot === 'left');
      line(L.x2 * z, 0, L.x2 * z, H * z, hot === 'right');
      line(0, L.y1 * z, W * z, L.y1 * z, hot === 'top');
      line(0, L.y2 * z, W * z, L.y2 * z, hot === 'bottom');
    }
    const A = live.area;
    if (A) {
      box(g, z, A, 'rgba(255,255,255,0.9)', [], 3);
      box(g, z, A, AREA, [6, 4], hot === 'area' ? 3 : 2);
      const hx = (A.x + A.w) * z, hy = (A.y + A.h) * z, r = hot === 'area-size' ? 6 : 4;
      g.fillStyle = '#ffffff'; g.fillRect(hx - r - 1, hy - r - 1, 2 * r + 2, 2 * r + 2);
      g.fillStyle = AREA; g.fillRect(hx - r, hy - r, 2 * r, 2 * r);
    }
  }
  const legend = el('ul', { class: 'v2-slice-legend small' },
    lines ? el('li', {}, el('span', { class: 'v2-slice-key', style: `background:${LINE}`, 'aria-hidden': 'true' }), 'slice lines') : null,
    area ? el('li', {}, el('span', { class: 'v2-slice-key is-dashed', style: `border-color:${AREA}`, 'aria-hidden': 'true' }), areas.length > 1 ? `text areas (${areas.length}: the first is dragged)` : 'text area') : null,
    isObj(exp?.rect) ? el('li', {}, el('span', { class: 'v2-slice-key is-box', style: `border-color:${RECT}`, 'aria-hidden': 'true' }), 'rect (where the piece sits)') : null,
    isObj(exp?.opening) ? el('li', {}, el('span', { class: 'v2-slice-key is-dashed', style: `border-color:${OPEN}`, 'aria-hidden': 'true' }), 'opening (where a bar\'s fill goes)') : null,
    isObj(exp?.tile) ? el('li', {}, el('span', { class: 'v2-slice-key', style: 'background:rgba(5,150,105,0.35)', 'aria-hidden': 'true' }), 'repeat (copied whole to lengthen it)') : null);

  // dragging: the frame point under the pointer, what it hits, the change kept when the press ends
  const pointAt = (e) => { const r = pic.getBoundingClientRect(); return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height]; };
  const tolOf = () => Math.max(0.5, 8 / (pic.getBoundingClientRect().width / W));
  const CURSOR = { left: 'col-resize', right: 'col-resize', top: 'row-resize', bottom: 'row-resize', area: 'move', 'area-size': 'nwse-resize' };
  let drag = null;
  pic.addEventListener('pointerdown', (e) => {
    if (!sprite) return;
    const at = pointAt(e);
    const h = SL.hitTest({ lines, area }, at, tolOf());
    if (!h) return;
    e.preventDefault();
    drag = { h, at, moved: false };
    hot = h;
    pic.setPointerCapture?.(e.pointerId);
    pic.classList.add('is-dragging');
    drawPic();
  });
  pic.addEventListener('pointermove', (e) => {
    const at = pointAt(e);
    if (!drag) {
      const h = sprite ? SL.hitTest({ lines, area }, at, tolOf()) : null;
      pic.style.cursor = CURSOR[h] ?? 'default';
      if (h !== hot) { hot = h; drawPic(); }
      return;
    }
    const next = SL.dragged(drag.h, { lines, area }, [at[0] - drag.at[0], at[1] - drag.at[1]], size);
    if (JSON.stringify(next) === JSON.stringify(live)) return;
    live = next;
    drag.moved = true;
    drawPic();
    drawPreviews(liveExport());
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null; hot = null;
    pic.classList.remove('is-dragging');
    if (!d.moved || JSON.stringify(live) === JSON.stringify({ lines, area })) { live = { lines, area }; drawPic(); drawPreviews(exp); return; }
    if (d.h === 'area' || d.h === 'area-size') writeArea(live.area, d.h === 'area' ? 'Text area moved.' : 'Text area sized.');
    else writeSlice(SL.sliceOfLines(live.lines, size), `Slice ${d.h} line moved.`);
  };
  pic.addEventListener('pointerup', endDrag);
  pic.addEventListener('pointercancel', endDrag);
  pic.addEventListener('pointerleave', () => { if (!drag && hot) { hot = null; drawPic(); } });

  /** The export as it would be with the lines and box being dragged (a written slice keeps no rect, opening or repeat). */
  function liveExport() {
    const o = { ...(exp ?? {}) };
    if (live.lines && JSON.stringify(live.lines) !== JSON.stringify(lines)) {
      const s = SL.sliceOfLines(live.lines, size);
      delete o.rect; delete o.opening; delete o.tile;
      o.border = { left: s.left, bottom: s.bottom, right: s.right, top: s.top };
    }
    if (live.area) o.textArea = { ...live.area };
    return o;
  }

  function writeSlice(s, note) {
    let next;
    try { next = SL.setSlice(def, state, s, opts); } catch (e) { return; }
    onCommit(next, `${note} ${opts.every ? 'Every state' : `The ${state} state`} has this slice now.`);
  }
  function writeArea(a, note) {
    // the colour given, else the written one (light when it has none), else the measured one
    const colour = a.colour !== undefined ? a.colour : ownArea ? ownArea.colour : area?.colour;
    const lost = SL.textColourOf(colour, def, p).lost;
    let next;
    try { next = SL.setTextArea(def, state, { ...a, colour }, opts); } catch (e) { return; }
    onCommit(next, `${note}${areas.length > 1 && !ownArea ? ' It replaces the piece\'s other text area for this state.' : ''}${lost ? ` Its text colour ${lost} is not one of this sprite's colours, so the download says light text now: add ${lost} to the palette to keep it.` : ''}`);
  }

  // ---- the number boxes (the keyboard's way), and where each comes from ----
  const slice = ownSlice ?? (lines ? SL.sliceOfLines(lines, size) : null);
  const sideBox = (side, label) => numberBox({ label: `Slice ${label}`, k: `slice-${side}`, value: slice?.[side], min: 0, max: side === 'left' || side === 'right' ? W - 1 : H - 1, disabled: !slice || !sprite, onchange: (n) => writeSlice({ ...slice, [side]: n }, `Slice ${label} set to ${n}.`) });
  const areaNow = ownArea ?? area;
  const areaBox = (f, label) => numberBox({ label: `Text area ${label}`, k: `area-${f}`, value: areaNow?.[f], min: f === 'w' || f === 'h' ? 1 : 0, max: f === 'x' || f === 'w' ? W : H, disabled: !areaNow || !sprite, onchange: (n) => writeArea({ ...areaNow, [f]: n }, `Text area ${label} set to ${n}.`) });
  // the text colour as it stands: light, a paint, a rule written, or the piece's colour that no paint has
  const tc = SL.textColourOf(ownArea ? ownArea.colour : area?.colour, def, p);
  const KEEP = '-keep';
  const colourSel = el('select', { class: 'st-select v2-paint', 'aria-label': 'Text colour', 'data-k': 'area-colour', disabled: !areaNow || !sprite, onchange: () => {
    if (colourSel.value !== KEEP) writeArea({ ...areaNow, colour: colourSel.value || 'light' }, 'Text colour changed.');
  } },
    tc.rule ? el('option', { value: KEEP }, 'Worked out by a rule (All fields shows it)') : null,
    tc.lost ? el('option', { value: KEEP }, `${tc.lost}, the piece's own: not one of this sprite's colours`) : null,
    el('option', { value: '' }, 'Light (white)'), paintRefs(def).filter((r) => r !== 'clear').map((r) => el('option', { value: r }, `${paintWords(r, def)} (${r})`)));
  colourSel.value = tc.rule || tc.lost ? KEEP : tc.ref ?? '';
  const every = el('input', { type: 'checkbox', class: 'v2-flag', 'data-k': 'slice-every', onchange: () => { ui.every = every.checked; } });
  every.checked = !!opts.every;
  const nums = el('div', { class: 'v2-slice-nums' },
    el('fieldset', { class: 'v2-slice-set' }, el('legend', {}, 'Slice (pixels in from each side)'),
      el('span', { class: 'v2-slice-row' }, ...[['left', 'left'], ['top', 'top'], ['right', 'right'], ['bottom', 'bottom']].map(([s, l]) => el('label', { class: 'st-lbl' }, `${l[0].toUpperCase()}${l.slice(1)} `, sideBox(s, l)))),
      el('span', { class: 'v2-slice-row' },
        slice ? null : mini('Give this state a slice', () => writeSlice(SL.startSlice(size), 'Slice started at the style guide\'s 8 pixels.'), { 'data-act': 'slice-start', disabled: !sprite }),
        mini('Back to the measured', () => onCommit(SL.clearSlice(def, state, opts), `The ${opts.every ? 'states take' : `${state} state takes`} the piece's own slice again.`), { 'data-act': 'slice-measured', disabled: !ownSlice }))),
    el('fieldset', { class: 'v2-slice-set' }, el('legend', {}, 'Text area'),
      el('span', { class: 'v2-slice-row' }, ...[['x', 'x'], ['y', 'y'], ['w', 'width'], ['h', 'height']].map(([f, l]) => el('label', { class: 'st-lbl' }, `${l[0].toUpperCase()}${l.slice(1)} `, areaBox(f, l)))),
      el('span', { class: 'v2-slice-row' }, el('label', { class: 'st-lbl' }, 'Colour ', colourSel),
        areaNow ? null : mini('Give this state a text area', () => writeArea(lines ? { x: lines.x1, y: lines.y1, w: Math.max(1, lines.x2 - lines.x1), h: Math.max(1, lines.y2 - lines.y1) } : { x: 3, y: 3, w: Math.max(1, W - 6), h: Math.max(1, H - 6) }, 'Text area added.'), { 'data-act': 'area-start', disabled: !sprite }),
        mini('Back to the measured', () => onCommit(SL.clearTextArea(def, state, opts), 'The piece\'s own text area again.'), { 'data-act': 'area-measured', disabled: !ownArea }))),
    el('label', { class: 'st-check v2-slice-every' }, every, ' Same for every state', el('span', { class: 'quiet small' }, ' (for the next change)')));
  const lost = SL.lostByWriting(exp);
  const words = { rect: 'where it sits (rect)', opening: 'the opening', tile: 'the repeat' };
  const lostNote = lost.length && !ownSlice ? el('p', { class: 'v2-slice-lost small' }, `A slice of your own for this state is written from the frame's edges, so the download loses what the piece measures besides its border: ${lost.map((k) => words[k]).join(', ')}.`) : null;
  let canAdd = true;
  try { SL.addTextColour(def, tc.lost ?? '#ffffff'); } catch { canAdd = false; }
  const colourNote = tc.lost && sprite ? el('p', { class: 'v2-slice-colour-lost small' }, `The piece gives this state's text the colour ${tc.lost}, which no colour of this sprite has: a text area of your own would say light text in the download instead. `,
    mini(`Add ${tc.lost} to the palette`, () => { const r = SL.addTextColour(def, tc.lost); onCommit(r.def, `${tc.lost} added to the palette as "${r.ref}" (a colour people do not set): a text area of your own keeps it.`); }, { 'data-act': 'add-text-colour', disabled: !canAdd, title: canAdd ? null : 'The palette has its 12 colours' })) : null;
  const twoNote = areas.length > 1 && !ownArea ? el('p', { class: 'quiet small' }, `The piece gives this state ${areas.length} text areas; a text area of your own replaces them with one (a state takes one written area).`) : null;

  // ---- the piece stretched to several sizes, side by side ----
  const previews = el('div', { class: 'v2-slice-previews' });
  function drawPreviews(e) {
    const sizes = SL.previewSizes(e, size);
    if (!src || !sizes.length) { previews.replaceChildren(el('p', { class: 'quiet small' }, src ? 'This state has nothing to stretch by: give it a slice.' : '')); return; }
    const pz = Math.max(1, Math.min(4, Math.floor(400 / Math.max(...sizes.map((s) => s[0])))));
    const figs = sizes.map((t) => {
      const plan = SL.stretchPlan(e, size, t);
      const c = el('canvas', { width: plan.w * pz, height: plan.h * pz, role: 'img', 'aria-label': `Stretched to ${plan.w} by ${plan.h}`, style: `width:${plan.w * pz}px` });
      const g = c.getContext('2d');
      // the parts are cut in frame pixels: k picture pixels each (a flat picture is smoothed as it stretches)
      const k = src.k;
      g.imageSmoothingEnabled = k > 1;
      if (k > 1) g.imageSmoothingQuality = 'high';
      for (const q of plan.parts) g.drawImage(src.canvas, q.sx * k, q.sy * k, q.sw * k, q.sh * k, q.dx * pz, q.dy * pz, q.dw * pz, q.dh * pz);
      g.imageSmoothingEnabled = false;
      showFrame(c, src);
      const ta = SL.areasOf(e)[0];
      const b = ta && SL.stretchBox(e, size, t, ta);
      if (b) box(g, pz, b, AREA, [4, 3], 1);
      return el('figure', { class: 'v2-slice-preview' }, c, el('figcaption', { class: 'quiet small' }, `${plan.w} × ${plan.h}${plan.fixed ? ': where it sits, it does not stretch' : ''}`));
    });
    const fixed = sizes.length === 1 && SL.stretchPlan(e, size, sizes[0])?.fixed;
    previews.replaceChildren(...figs);
    if (fixed) previews.append(el('p', { class: 'quiet small' }, 'This state does not stretch: the piece gives only where it sits (rect). Give it a slice to stretch it.'));
  }

  // ---- what the download says ----
  const exportBox = exp ? el('pre', { class: 'v2-slice-export', 'data-k': 'slice-export', tabindex: '0', 'aria-label': `What the download says for ${state}` }, JSON.stringify(exp, null, 1)) : el('p', { class: 'quiet small' }, 'Nothing yet: it has to draw first.');

  if (sprite) {
    put(out, el('div', { class: 'v2-slice-work' }, el('div', { class: 'v2-slice-picbox' }, pic), legend), nums, lostNote, colourNote, twoNote,
      el('h4', { class: 'v2-slice-h' }, 'Stretched'), previews,
      el('h4', { class: 'v2-slice-h' }, `What the download says for "${state}"`),
      el('p', { class: 'quiet small' }, `The sheet JSON beside the picture, animations["${state}"], at scale 1 (the numbers grow with the scale). border is Unity's order: left, bottom, right, top.`),
      exportBox);
    drawPic();
    drawPreviews(exp);
  }

  // ---- the skin piece, and the piece's arguments ----
  put(out, skinBox({ def, panel, pieces, onChange }));
  put(out, el('div', { class: 'st-head' }, el('h3', {}, 'The piece')), piecePick({ def, panel, onCommit }));
  if (isObj(panel.piece) && typeof panel.piece.gen === 'string') put(out, el('div', { class: 'v2-slice-piece' }, genEditor({ def, call: panel.piece, path: [...PANEL, 'piece'], place: 'piece', onChange, onStamp })));
  else put(out, fieldTree({ def, value: panel.piece ?? {}, path: [...PANEL, 'piece'], onChange, open: 1, onStamp }));
  if (panel.states !== undefined) {
    put(out, el('details', { class: 'v2-sub v2-slice-looks' }, el('summary', {}, 'The states and how each looks (lift, lip, desaturate)'), fieldTree({ def, value: panel.states, path: [...PANEL, 'states'], onChange, open: 1 })));
  }
  return out;
}

/** The piece pick: the interface piece generators; a switch keeps what the new one takes and says what it drops. */
function piecePick({ def, panel, onCommit }) {
  const now = isObj(panel.piece) && typeof panel.piece.gen === 'string' ? panel.piece.gen : '';
  const choices = SL.pieceChoices();
  const about = el('p', { class: 'quiet small v2-about' }, choices.find((c) => c.id === now)?.about ?? '');
  const sel = el('select', { class: 'st-select', 'aria-label': 'Interface piece', 'data-k': 'piece-pick', onchange: () => {
    const id = sel.value;
    if (!id || id === now) return;
    let r;
    try { r = SL.switchPiece(def, id); } catch (e) { about.textContent = String(e?.message ?? e).slice(0, 200); sel.value = now; return; }
    const v = r.def.body.panel.piece.v;
    const n = r.dropped.length;
    const ctl = r.removed.length ? ` The control${r.removed.length === 1 ? '' : 's'} ${r.removed.join(', ')} set nothing now, so ${r.removed.length === 1 ? 'it was' : 'they were'} removed.` : '';
    onCommit(r.def, `The piece is ${id}@${v} now.${n ? ` ${r.dropped.join(', ')} ${n === 1 ? 'is' : 'are'} not ${id}'s, so ${n === 1 ? 'it was' : 'they were'} left out.` : ''}${ctl}`);
  } },
    now && !choices.some((c) => c.id === now) ? el('option', { value: now }, `${now} (not an interface piece)`) : null,
    now ? null : el('option', { value: '' }, 'Pick one'),
    choices.map((c) => el('option', { value: c.id, title: c.about }, `${c.id}: ${c.about.slice(0, 60)}`)));
  sel.value = now;
  return el('div', { class: 'v2-slice-pick' }, el('div', { class: 'v2-slice-row' }, el('label', { class: 'st-lbl' }, 'Piece ', sel)), about,
    el('p', { class: 'quiet small' }, 'Another piece keeps the place, the size and every argument it also takes; what it does not take is left out (Undo brings it back).'));
}

/** The skin: which skin piece (from the pieces index, or typed), its version, its slots mapped to the palette; or none. */
function skinBox({ def, panel, pieces, onChange }) {
  const skin = isObj(panel.skin) ? panel.skin : null;
  const wrap = el('div', { class: 'v2-slice-skin' }, el('div', { class: 'st-head' }, el('h3', {}, 'Skin')));
  if (!skin) {
    put(wrap, el('p', { class: 'quiet small' }, 'This piece has no skin: its own arguments paint it. A skin piece gives a family of pieces one look (pieces/skin-*.json).'),
      mini('Use a skin', () => onChange([...PANEL, 'skin'], { use: 'skin:plain', v: 1 }), { 'data-act': 'use-skin' }));
    return wrap;
  }
  const P = [...PANEL, 'skin'];
  let piece = null;
  try { piece = typeof skin.use === 'string' && Number.isInteger(skin.v) ? pieces.get(skin.use, skin.v) : null; } catch { piece = null; }
  const listId = 'v2-slice-skins';
  const useBox = el('input', { type: 'text', class: 'st-text v2-slice-use', value: typeof skin.use === 'string' ? skin.use : '', list: listId, 'aria-label': 'Skin piece', 'data-k': 'skin-use', maxlength: 60, spellcheck: 'false' });
  let last = useBox.value;
  const commitUse = () => { const v = useBox.value.trim(); if (v && v !== last) { last = v; onChange([...P, 'use'], v); } };
  useBox.addEventListener('change', commitUse);
  useBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitUse(); } });
  const vBox = numberBox({ label: 'Skin version', k: 'skin-v', value: skin.v, min: 1, max: 999, onchange: (n) => onChange([...P, 'v'], Math.max(1, n)) });
  const list = el('datalist', { id: listId });
  const pick = el('select', { class: 'st-select', 'aria-label': 'Pick a skin', 'data-k': 'skin-pick', onchange: () => {
    const [use, v] = pick.value.split('@');
    if (use && v && (use !== skin.use || Number(v) !== skin.v)) onChange(P, { ...skin, use, v: Number(v) });
  } });
  const fill = (index) => {
    const choices = SL.skinChoices(index, skin);
    list.replaceChildren(...[...new Set(choices.map((c) => c.use))].map((u) => el('option', { value: u })));
    pick.replaceChildren(...choices.map((c) => el('option', { value: `${c.use}@${c.v}`, title: c.about }, `${c.name} (${c.use}, version ${c.v})`)));
    pick.value = `${skin.use}@${skin.v}`;
  };
  fill(null);
  piecesIndex().then(fill);
  put(wrap, 
    el('div', { class: 'v2-slice-row' }, el('label', { class: 'st-lbl' }, 'Pick ', pick)),
    el('div', { class: 'v2-slice-row' }, el('label', { class: 'st-lbl' }, 'Piece ', useBox), list, el('label', { class: 'st-lbl' }, 'Version ', vBox),
      mini('No skin', () => onChange(P, undefined), { 'data-act': 'no-skin' })),
    piece?.about ? el('p', { class: 'quiet small' }, piece.about) : null);
  // its slots: each mapped to a paint of the palette, or left to the palette's slot of that name, else the skin's own colour
  const paint = isObj(skin.paint) ? skin.paint : {};
  const slots = piece ? SL.skinSlots(piece) : Object.keys(paint).map((id) => ({ id, label: id }));
  const have = new Set((Array.isArray(def.palette) ? def.palette : []).filter(isObj).map((s) => s.id));
  if (slots.length) {
    put(wrap, el('p', { class: 'quiet small' }, 'The skin\'s colours, and the colour of this sprite each one takes:'));
    for (const s of slots) {
      const refs = paintRefs(def).filter((r) => r !== 'clear');
      const now = typeof paint[s.id] === 'string' ? paint[s.id] : '';
      const sel = el('select', { class: 'st-select v2-paint', 'aria-label': `Skin colour ${s.id}`, 'data-k': `skin-paint-${s.id}`, onchange: () => {
        if (sel.value) onChange(isObj(skin.paint) ? [...P, 'paint', s.id] : [...P, 'paint'], isObj(skin.paint) ? sel.value : { [s.id]: sel.value });
        else if (Object.hasOwn(paint, s.id)) onChange([...P, 'paint', s.id], undefined);
      } },
        el('option', { value: '' }, have.has(s.id) ? `Not set: this sprite's ${s.id}` : `Not set: the skin's own${s.default ? ` (${s.default})` : ''}`),
        (now && !refs.includes(now) ? [now, ...refs] : refs).map((r) => el('option', { value: r }, `${paintWords(r, def)} (${r})`)));
      sel.value = now;
      const hex = now ? swatchOf(now, def) : have.has(s.id) ? swatchOf(s.id, def) : s.default ?? null;
      put(wrap, el('div', { class: 'v2-slice-slot', 'data-slot': s.id },
        el('span', { class: `v2-chip${hex ? '' : ' is-clear'}`, style: hex ? `background:${hex}` : null, 'aria-hidden': 'true' }),
        el('span', { class: 'v2-slice-slotname' }, s.label && s.label !== s.id ? `${s.label} (${s.id})` : s.id), sel));
    }
  }
  return wrap;
}
