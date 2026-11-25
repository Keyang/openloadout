// The studio's first page, for version 2 sprites (build item B17; docs/data-sprites.md section 6; DQ5): under "Make a new
// one", a start for every body (rig, tiles, layers, panel, emitters, pictures: app/studio/v2-templates.js) and any library
// data sprite (sprites/<id>.json, found in the catalogue and read behind the plain-data wall), opened as a copy with an
// id of its own, or with the library's id to make a new version of the library file. A version 2 draft's picture in the
// list of drafts is drawn once the pieces it names are loaded.
import { el } from '../ui.js';
import { defaultParams } from '../../engine/sprite.js';
import { framePicture } from '../art.js';
import { showFrame } from './bits.js';
import { parseSpriteJson } from '../../catalog/sprite-schema.js';
import { loadCatalog, allAssets } from '../catalog.js';
import { draftIdFor } from './drafts.js';
import { v2Starts, v2Template } from './v2-templates.js';
import { copyOfLibrary, BODY_LABELS } from './v2-model.js';
import { spriteOf, loadPiecesFor, checkDraft } from './v2-check.js';

const LIST_MOST = 40;

/**
 * A sprite's first frame on a canvas shown at a whole-number size that fits `room` pixels; empty when it cannot be drawn.
 * In the site's art style (app/art.js): a flat one is drawn at the size it is shown, smooth.
 */
function canvasFor(sprite, room) {
  let c = el('canvas', { 'aria-hidden': 'true' });
  try {
    const clip = sprite.clips[sprite.preview] ? sprite.preview : Object.keys(sprite.clips)[0];
    const [w, h] = sprite.size;
    const k = Math.max(1, Math.floor(room / Math.max(w, h)));
    const shown = w > room ? room : w * Math.min(k, 8);
    const pic = framePicture(sprite, clip, 0, defaultParams(sprite), { zoom: shown / w });
    c = pic.canvas;
    c.setAttribute('aria-hidden', 'true');
    c.style.width = `${shown}px`;
    showFrame(c, pic);
  } catch { /* an empty picture: the draft's own page says what is wrong */ }
  return c;
}

/** A version 2 definition's picture: an empty box at once, the first frame once its pieces are loaded (nothing when it does not draw). Arguments: def, room (pixels). */
export function v2Picture(def, room) {
  const box = el('span', { class: 'v2-pic' });
  loadPiecesFor(def).then(() => {
    const m = spriteOf(def);
    if (m.ok) box.replaceChildren(canvasFor(m.sprite, room));
    else box.replaceChildren(el('span', { class: 'quiet small' }, 'Has things to fix'));
  });
  return box;
}

/**
 * The version 2 starts: a button per body, and a chooser of library data sprites. Picking one keeps it as a new draft
 * and opens it. Arguments: { drafts (app/studio/drafts.js), say (shows a sentence), taken (name -> ids the library has) }.
 */
export function v2StartsSection({ drafts, say }) {
  const libraryIds = () => { try { return allAssets().map((a) => a.id); } catch { return []; } };
  // a template's sprite gets an id from its name that no draft and no library sprite has (the draft is called the same)
  const open = (def, { named = false } = {}) => {
    if (named) def = { ...def, id: draftIdFor(def.name, [...drafts.ids(), ...libraryIds()]) };
    const v = checkDraft(def);
    if (!v.ok) { say(`That could not be opened: ${v.errors[0]}`); return; }
    const id = draftIdFor(def.id, drafts.ids());
    const r = drafts.put(id, v.value);
    if (!r.ok) { say(r.error); return; }
    location.hash = `#/studio/${id}?mode=body`;
  };
  const grid = el('div', { class: 'st-starts v2-starts' }, v2Starts().map((s) => {
    const def = v2Template(s.body);
    const m = spriteOf(def);
    return el('button', { type: 'button', class: 'st-start', 'data-start': s.id, onclick: () => open(v2Template(s.body, { name: `My ${s.label.split(/[ ,]/)[0].toLowerCase()}` }), { named: true }) },
      el('span', { class: 'tile st-start-pic' }, m.ok ? canvasFor(m.sprite, 150) : null),
      el('span', { class: 'st-start-name' }, s.label),
      el('span', { class: 'st-start-tag' }, s.blurb));
  }));

  // the library's data sprites: a search box and the first matches; picking one opens a copy (DQ5)
  const search = el('input', { type: 'search', class: 'st-text', placeholder: 'coin, tiles, fire …', 'aria-label': 'Find a library sprite', 'data-k': 'lib-search' });
  const keepId = el('input', { type: 'checkbox', 'data-k': 'lib-keep-id' });
  const list = el('div', { class: 'v2-libs', role: 'list' });
  let rows = [];
  async function pick(row) {
    say(`Opening a copy of ${row.name}…`);
    let text;
    // a library sprite's data file: its catalogue src (sprites/<id>.json)
    const src = typeof row.src === 'string' && row.src.endsWith('.json') ? row.src : `sprites/${row.id}.json`;
    try {
      const r = await fetch(src);
      if (r.status === 404) { say(`${row.name} has no data file on this site (sprites/${row.id}.json is missing), so the studio cannot open it.`); return; }
      if (!r.ok) throw new Error(`${r.status}`);
      text = await r.text();
    } catch (e) { say(`${src} could not be read (${String(e?.message ?? e)}).`); return; }
    const p = parseSpriteJson(text);
    if (!p.ok) { say(`${src} could not be read: ${p.errors[0]}`); return; }
    if (p.value?.version !== 2) { say(`${row.name} is a version 1 studio file: open it with Open a file.`); return; }
    const taken = [...drafts.ids(), ...libraryIds()];
    open(copyOfLibrary(p.value, { taken, keepId: keepId.checked }));
  }
  function draw() {
    const q = search.value.trim().toLowerCase();
    const hits = rows.filter((r) => !q || r.id.includes(q) || r.name.toLowerCase().includes(q) || (r.words ?? []).some((w) => w.includes(q)));
    list.replaceChildren(...[...hits.slice(0, LIST_MOST).map((r) => el('button', { type: 'button', class: 'v2-lib', role: 'listitem', 'data-library': r.id, onclick: () => pick(r) },
      el('span', { class: 'v2-libname' }, r.name), el('span', { class: 'quiet small' }, ` ${r.id} · ${r.type ?? 'sprite'}`))),
    hits.length > LIST_MOST ? el('p', { class: 'quiet small' }, `and ${hits.length - LIST_MOST} more: type to narrow them down.`) : null,
    hits.length ? null : el('p', { class: 'quiet small' }, rows.length ? 'No library sprite matches.' : 'Reading the library…')].filter(Boolean));
  }
  search.addEventListener('input', draw);
  loadCatalog().then(() => {
    rows = allAssets().filter((a) => a.kind === 'sprite' && !a.studio && a.madeIn !== 'visit').sort((a, b) => a.name.localeCompare(b.name));
    draw();
  }, () => { list.replaceChildren(el('p', { class: 'quiet small' }, 'The library could not be read.')); });
  draw();

  return el('div', { class: 'v2-start-more' },
    el('div', { class: 'st-row-head' }, el('h2', { class: 'h4' }, 'Or any kind of sprite'),
      el('p', { class: 'quiet small' }, `${Object.values(BODY_LABELS).join(', ')}: drawn from data, never code.`)),
    grid,
    el('div', { class: 'st-row-head v2-libhead' }, el('h2', { class: 'h4' }, 'Start from a library sprite'),
      el('p', { class: 'quiet small' }, 'You change a copy; the library itself changes only through its file and a review.')),
    el('div', { class: 'v2-libtools' }, search, el('label', { class: 'st-check' }, keepId, 'Keep its id (a new version of the library file)')),
    list);
}
