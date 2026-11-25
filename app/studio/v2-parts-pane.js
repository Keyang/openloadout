// The studio's parts pane for a character that extends a base (build item B20; docs/data-sprites.md section 6). Shown on
// the Look & name tab of a rig draft whose rig `extends` a base, in place of the parts as a field tree (which stays
// under "More"); app/studio/v2-parts.js is its model.
//   - Each parts group a choice heads, as rows: one per look (option), with a small picture of the sprite wearing it,
//     the pieces it shows, Show (try it on the picture) and × (take it out: the look, and what only it showed).
//   - Add from library: the part and held pieces that fit the base (learnt from where the library's sprites wear them,
//     the pieces index's usedOn), found by name; pick one, see it on the sprite, then put it in a new choice (named) or
//     in a choice the sprite has, as a look (named).
// Every change goes back through onCommit(def, note, params): the editor keeps the definition, its undo and its check.
import { el } from '../ui.js';
import { cleanParams } from '../../engine/sprite.js';
import { framePicture } from '../art.js';
import { showFrame } from './bits.js';
import { sitePieces } from '../../engine/pieces.js';
import { checkFull, spriteOf, loadPiecesFor } from './v2-check.js';
import * as PT from './v2-parts.js';

/** Appends the children that are there (Node.append would write null as text). */
const put = (node, ...kids) => node.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
const mini = (label, onclick, more = {}) => el('button', { type: 'button', class: 'btn btn-sm v2-mini', onclick, ...more }, label);
const pieceWords = (p) => `${p.use}@${p.v ?? '?'}`;

/** The pieces index, read once (empty when it cannot be read). */
let indexP = null;
const piecesIndex = () => (indexP ??= Promise.resolve().then(() => sitePieces().index()).catch(() => ({ pieces: [] })));

/**
 * A frame of a sprite drawn into a canvas, cut to what is drawn with a pixel round it (false when it cannot be drawn).
 * In the site's art style (app/art.js): a flat one drawn for `room` CSS pixels (the box it is shown in), smooth.
 */
function frameInto(canvas, sprite, clip, params, room = 40) {
  try {
    const c = sprite.clips[clip] ? clip : sprite.preview && sprite.clips[sprite.preview] ? sprite.preview : Object.keys(sprite.clips)[0];
    const pic = framePicture(sprite, c, 0, cleanParams(sprite, params), { zoom: room / Math.max(sprite.size[0], sprite.size[1]) });
    const { g, k } = pic, w = pic.canvas.width, h = pic.canvas.height;
    const px = new Uint8ClampedArray(g.data.buffer, g.data.byteOffset, w * h * 4);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    // a frame pixel round it: k picture pixels
    const m = Math.max(1, Math.round(k));
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    canvas.width = x1 - x0 + 1; canvas.height = y1 - y0 + 1;
    canvas.getContext('2d').drawImage(pic.canvas, -x0, -y0);
    showFrame(canvas, pic);
    return true;
  } catch { return false; }
}

/**
 * The parts pane: { node }. Arguments: { def (the draft), sprite (the last that drew, or null), clip, params (the settings
 * being tried), ui (kept by the editor across redraws: { adding, query, pick, target, name, option }), more (the parts as
 * fields, for "More"), onCommit (def, note, params), onParams (params), redraw () }.
 */
export function partsPane({ def, sprite, clip, params = {}, ui = {}, more = null, onCommit, onParams, redraw }) {
  const out = el('section', { class: 'v2-list v2-parts', 'aria-label': 'Parts people can pick' });
  put(out, el('div', { class: 'st-head' }, el('h3', {}, 'Parts people can pick'),
    mini(ui.adding ? 'Close the library' : 'Add from library', () => { ui.adding = !ui.adding; if (!ui.adding) ui.pick = null; redraw(); }, { 'data-act': 'parts-add', 'aria-expanded': String(!!ui.adding) })),
  el('p', { class: 'quiet small' }, 'Each part is a choice: people pick one look, or none. Add from library offers the parts and held things that fit this body.'));
  if (ui.adding) put(out, picker({ def, sprite, clip, params, ui, onCommit, redraw }));

  // ---- the groups, one row per look ----
  const rows = PT.partRows(def);
  if (!rows.length) put(out, el('p', { class: 'pane-note' }, 'No parts yet: add one from the library.'));
  for (const g of rows) {
    const box = el('div', { class: 'v2-partgroup', 'data-part': g.part, 'data-control': g.control },
      el('h4', { class: 'v2-parthead' }, g.label, el('span', { class: 'quiet small' }, ` · picked with "${g.control}"`)));
    for (const o of g.options) {
      const thumb = el('canvas', { class: 'v2-partthumb', width: 1, height: 1, 'aria-hidden': 'true' });
      const drawn = sprite ? frameInto(thumb, sprite, clip, { ...params, [g.control]: o.value }) : false;
      const picked = sprite ? cleanParams(sprite, params)[g.control] === o.value : false;
      const what = o.none ? 'nothing' : o.pieces.length ? o.pieces.map((p) => p.use.replace(/^(part|held):/, '')).join(', ') : 'no library piece (drawn by its own shapes)';
      put(box, el('div', { class: `v2-item v2-partopt${picked ? ' on' : ''}`, 'data-option': o.value },
        drawn ? thumb : el('span', { class: 'v2-partthumb is-empty', 'aria-hidden': 'true' }),
        el('span', { class: 'v2-partname' }, el('strong', {}, o.label), el('span', { class: 'quiet small v2-partwhat', title: o.pieces.map(pieceWords).join(', ') }, what)),
        el('span', { class: 'v2-acts' },
          mini('Show', () => onParams({ ...params, [g.control]: o.value }), { 'data-act': 'part-show', 'aria-label': `Show ${g.label}: ${o.label} on the picture`, 'aria-pressed': String(picked) }),
          o.none ? null : mini('×', () => {
            let r;
            try { r = PT.removePartOption(def, g.control, o.value); } catch (e) { return; }
            const shapes = r.removed.length ? ` ${r.removed.length === 1 ? 'Its piece' : `Its ${r.removed.length} pieces`} went with it.` : '';
            onCommit(r.def, `${g.label}: ${o.label} taken out.${shapes}${r.control ? '' : ` ${g.label} had one look left, so the choice went too.`} Undo brings it back.`);
          }, { 'data-act': 'part-remove', 'aria-label': `Take out ${g.label}: ${o.label}` }))));
    }
    put(out, box);
  }
  if (more) put(out, el('details', { class: 'v2-sub v2-partmore' }, el('summary', {}, 'More: the parts as fields'), more));
  return out;
}

/** Add from library: find a piece that fits, see it on the sprite, put it in a choice as a look. */
function picker({ def, sprite, clip, params, ui, onCommit, redraw }) {
  const wrap = el('div', { class: 'v2-partpick', role: 'group', 'aria-label': 'Add a part from the library' });
  const list = el('div', { class: 'v2-partlist', role: 'listbox', 'aria-label': 'Pieces that fit' }, el('p', { class: 'quiet small' }, 'Reading the library…'));
  const find = el('input', { type: 'search', class: 'st-text v2-partfind', 'data-k': 'parts-find', placeholder: 'hat, sword, cape…', 'aria-label': 'Find a piece by name', value: ui.query ?? '' });
  const count = el('p', { class: 'quiet small', 'aria-live': 'polite' });
  const form = el('div', { class: 'v2-partform' });
  put(wrap, el('label', { class: 'st-lbl v2-partfindbox' }, 'Find ', find), count, list, form);
  let choices = [];
  const filter = () => {
    const q = find.value.trim().toLowerCase();
    ui.query = find.value;
    let n = 0;
    for (const row of list.querySelectorAll('[data-use]')) {
      const hit = !q || row.dataset.find.includes(q);
      row.hidden = !hit;
      if (hit) n++;
    }
    count.textContent = choices.length ? `${n} of ${choices.length} pieces that fit this body.` : '';
  };
  find.addEventListener('input', filter);
  piecesIndex().then((index) => {
    choices = PT.partChoices(index, def);
    if (!choices.length) { list.replaceChildren(el('p', { class: 'pane-note' }, 'No library piece fits this body yet: the library learns what fits from the sprites that wear them.')); return; }
    list.replaceChildren(...choices.map((c) => el('button', {
      type: 'button', class: `v2-partrow${ui.pick === c.use ? ' on' : ''}`, role: 'option', 'aria-selected': String(ui.pick === c.use), 'data-use': c.use, 'data-k': `parts-row-${c.use}`,
      'data-find': `${c.name} ${c.use} ${c.about}`.toLowerCase(), onclick: () => { ui.pick = c.use; ui.target = ui.target ?? ''; ui.name = undefined; ui.option = undefined; redraw(); },
    }, el('span', { class: 'v2-partrowhead' }, el('strong', {}, c.name), el('span', { class: 'quiet small' }, ` ${c.use}@${c.v}`), c.used ? el('span', { class: 'v2-partbadge small' }, 'worn already') : null),
    el('span', { class: 'quiet small v2-partabout' }, c.about))));
    filter();
    const c = choices.find((x) => x.use === ui.pick);
    if (c) form.replaceChildren(...pickForm({ def, sprite, clip, params, ui, c, index, onCommit, redraw }));
  });
  return wrap;
}

/** The picked piece: where it goes, its names, a picture of the sprite wearing it, and Add. */
function pickForm({ def, sprite, clip, params, ui, c, index, onCommit, redraw }) {
  const choicesNow = PT.choiceControls(def);
  const target = choicesNow.some((x) => x.key === ui.target) ? ui.target : '';
  const sel = el('select', { class: 'st-select', 'data-k': 'parts-target', 'aria-label': 'Put it in', onchange: () => { ui.target = sel.value; redraw(); } },
    el('option', { value: '' }, 'A new choice'), choicesNow.map((x) => el('option', { value: x.key }, `${x.label} (${x.options.join(', ')})`)));
  sel.value = target;
  const nameIn = el('input', { type: 'text', class: 'st-text', 'data-k': 'parts-name', maxlength: 60, 'aria-label': 'Call the choice', value: ui.name ?? c.name });
  nameIn.addEventListener('input', () => { ui.name = nameIn.value; });
  const optionIn = el('input', { type: 'text', class: 'st-text', 'data-k': 'parts-option', maxlength: 40, 'aria-label': 'Call this look', value: ui.option ?? PT.optionFor(c) });
  optionIn.addEventListener('input', () => { ui.option = optionIn.value; });
  const note = el('p', { class: 'small v2-parterr', role: 'alert' });
  const pic = el('canvas', { class: 'v2-partpreview', width: 1, height: 1, role: 'img', 'aria-label': `The sprite wearing ${c.name}` });
  const caption = el('figcaption', { class: 'quiet small' }, 'Drawing it on your sprite…');
  const attempt = () => PT.addPartOption(def, { piece: c, control: target || null, label: nameIn.value.trim() || c.name, option: optionIn.value.trim(), index });
  // the picture: the sprite as it would be, with the new look picked (the pieces it names loaded first)
  const run = (ui.previewRun = (ui.previewRun ?? 0) + 1);
  (async () => {
    let r;
    try { r = attempt(); } catch (e) { caption.textContent = String(e?.message ?? e); return; }
    await loadPiecesFor(r.def);
    if (run !== ui.previewRun) return;
    const v = checkFull(r.def);
    const m = v.ok ? spriteOf(v.value) : null;
    if (!m?.ok) { caption.textContent = `It does not draw yet: ${(v.errors?.[0] ?? m?.errors?.[0] ?? 'the check failed').slice(0, 160)}`; return; }
    caption.textContent = frameInto(pic, m.sprite, clip, { ...params, [r.control]: r.option }, 128) ? `${c.name} on ${c.on}.` : 'It could not be drawn.';
  })();
  const add = () => {
    let r;
    try { r = attempt(); } catch (e) { note.textContent = String(e?.message ?? e); return; }
    ui.adding = false; ui.pick = null; ui.name = undefined; ui.option = undefined; ui.query = '';
    const into = target ? `${choicesNow.find((x) => x.key === target).label}` : `the new choice ${r.def.controls.find((x) => x.key === r.control)?.label ?? r.control}`;
    const colours = r.added.length ? ` Colours added to the palette: ${r.added.join(', ')}.` : '';
    onCommit(r.def, `${c.name} added to ${into} as "${r.option}", and picked on the picture.${colours} Undo takes it out.`, { ...params, [r.control]: r.option });
  };
  return [
    el('figure', { class: 'v2-partfig' }, pic, caption),
    el('div', { class: 'v2-partfields' },
      el('p', { class: 'v2-about' }, c.about),
      el('label', { class: 'st-lbl' }, 'Put it in ', sel),
      target ? null : el('label', { class: 'st-lbl' }, 'Call the choice ', nameIn),
      el('label', { class: 'st-lbl' }, 'Call this look ', optionIn),
      el('p', { class: 'quiet small' }, target ? 'A look the choice has already wears this piece too.' : 'People get a new choice with this look and "none" (picked at first).'),
      el('span', { class: 'v2-acts' }, mini('Add', add, { 'data-act': 'parts-confirm', class: 'btn btn-sm v2-mini btn-primary' }), mini('Cancel', () => { ui.pick = null; redraw(); }, { 'data-act': 'parts-cancel' })),
      note),
  ];
}
