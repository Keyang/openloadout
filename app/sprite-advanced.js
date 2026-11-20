// Advanced editing on a sprite's own page, #/sprite/<id>?edit=advanced&copy=<draft>&pane=<tab>&aclip=<clip> (build item B18;
// docs/data-sprites.md section 6, "Advanced mode on a sprite page"; Contract 15 rule 7; DQ5). Keyang: "add the rig
// editing to the sprite as advanced editing, similar for drawings".
//   - A library sprite whose file is data gets an Advanced button beside the Fine-tune tabs (a sprite that is still code,
//     a studio sprite and one made on this visit get none: app/sprite-advanced-model.js libraryDataRow).
//   - It opens the studio's version 2 editor (app/studio/v2-editor.js, unchanged) inline: the editor's picture (drawn by
//     the framework from the copy, with its zoom, Undo and Redo, clips and frames) takes the place of the page's picture
//     under the page's own heading, and the editor's tabs (Body with the stamp painter and the generators' arguments,
//     Clips, Look & name, Check, All fields) and its footer (Put in my bag, which follows later edits, and Download
//     <copy>.json) take the place of the simple controls.
//   - It edits a copy (DQ5): a version 2 studio draft with made.from "library:<id>" (never a version 1 draft, whatever the
//     address names), saved in the studio like any draft, its
//     defaults the visitor's sliders (the first time; "New copy" starts again from the library at the sliders as they
//     are). The library sprite changes only through its file and a review: nothing here touches it.
//   - The address stays the sprite page's and names the copy and the tab, so a reload goes on with the same copy. Back
//     to the simple controls closes the editor (its last change is saved) and shows the page as it was.
// The editor writes its own address (#/studio/<draft>...) as it goes; while Advanced is open those writes are turned
// into the sprite page's address (see guardAddress). Until v2EditorPage takes an address option of its own (B17's file),
// that is the one place the window's history.replaceState is wrapped: any other address passes through it unchanged.
import { el } from './ui.js';
import { pickStorage } from './bag.js';
import { assetById, allAssets } from './catalog.js';
import { createDrafts, draftIdFor } from './studio/drafts.js';
import { v2EditorPage } from './studio/v2-editor.js';
import { libraryStart } from './studio/v2-api.js';
import { checkDraft, checkFull, loadPiecesFor } from './studio/v2-check.js';
import { libraryDataRow, isAdvancedQuery, isV2Sprite, withSliderDefaults, findCopy, studioAddressParts, advancedAddress, simpleAddress } from './sprite-advanced-model.js';

// Where the drafts live, chosen once for the page's lifetime (as app/studio-page.js does): the browser's storage, so a
// copy made here is in the studio's list; without it (a private window) a memory of this tab's own.
let place = null;
function placeOf() {
  if (place) return place;
  const where = pickStorage(typeof window === 'undefined' ? undefined : window);
  let own = null;
  const studio = where.kept
    ? { ready: () => typeof window.loadout?.studio?.toBag === 'function', toBag: (id) => window.loadout.studio.toBag(id) }
    : {
      // window.loadout.studio keeps its own drafts in memory and cannot see these: the same code over this tab's memory
      ready: () => typeof window.loadout?.studio?.toBag === 'function',
      toBag: async (id) => {
        const m = await import('./api-studio.js');
        own ??= m.createStudio({ window, storage: where.storage, kept: false });
        const r = await own.toBag(id);
        return r && Array.isArray(r.warnings) ? { ...r, warnings: r.warnings.filter((w) => w !== m.NOT_KEPT) } : r;
      },
    };
  place = { kept: where.kept, drafts: createDrafts(where.storage), studio };
  return place;
}

/**
 * While Advanced is open, every address the page writes with history.replaceState goes through `turn` (the editor writes
 * #/studio/<draft>...; the page writes its own settings without edit=advanced); `turn` gives any other address back as
 * it is. Returns the function that stops it (only this wrapper is taken away: one put on top later is left alone).
 */
function guardAddress(turn) {
  const h = window.history;
  const own = Object.hasOwn(h, 'replaceState');
  const real = h.replaceState;
  const wrapper = function replaceState(state, unused, url) {
    let to = url;
    if (typeof url === 'string') { try { to = turn(url) ?? url; } catch { to = url; } }
    return real.call(h, state, unused, to);
  };
  h.replaceState = wrapper;
  return () => {
    if (h.replaceState !== wrapper) return;
    if (own) h.replaceState = real; else delete h.replaceState;
  };
}

/** The library file's text: the catalogue row's src (sprites/<id>.json), fetched from the site. */
async function readFile(row) {
  const r = await fetch(row.src);
  if (!r.ok) throw new Error(`${row.src}: ${r.status}`);
  return r.text();
}

/**
 * Puts Advanced editing on a sprite page: its button, and the editor when it is open (at once when the address asks).
 * Returns { open (async: opens it), leave (back to the simple controls), isOpen, close (the page's teardown) }.
 * Arguments: { sprite (the page's sprite), main (the page's <main>, app/asset-shell.js), query (the address's settings),
 * params (() => the visitor's settings now), pause (() => stops the page's own animation and its sounds; the page stops
 * drawing its own picture while isOpen()), resume (() => the page draws its own picture again, after leaving) }.
 */
export function advancedMode({ sprite, main, query = {}, params = () => ({}), pause = () => {}, resume = () => {} }) {
  const row = assetById(sprite.id);
  const none = { open: async () => false, leave: () => {}, isOpen: () => false, close: () => {} };
  if (!libraryDataRow(row) || !main) return none;

  const btn = el('button', { type: 'button', class: 'btn btn-sm adv-open', 'data-act': 'advanced', 'aria-expanded': 'false',
    title: 'Change everything in a copy of this sprite: its shapes, pixels, generators, clips, colours and sliders' }, 'Advanced');
  btn.addEventListener('click', () => { open({ copy: query.copy }); });
  const tuneHead = main.querySelector(':scope > .rx-panel .tune-head');
  const head = main.querySelector(':scope > .rx-stage > .rx-head');
  if (tuneHead) tuneHead.append(btn); else if (head) head.append(btn);
  const note = el('p', { class: 'adv-note', role: 'status', 'aria-live': 'polite', hidden: true });
  btn.after(note);

  let session = null;      // the open editor: { id, stop, restore, bar, nameWord }
  let busy = false, closed = false;
  const say = (text) => { note.textContent = text ?? ''; note.hidden = !text; };

  /** The copy to edit: the address's or the newest of this sprite's copies, else a new one at the visitor's settings. Returns { id } or { error }. */
  async function copyToEdit(drafts, { copy, fresh }) {
    if (drafts.problem()) return { error: `${drafts.problem()} Open the studio to sort them out.` };
    const found = fresh ? null : findCopy(drafts.list(), sprite.id, copy);
    if (found) return { id: found };
    const taken = [...drafts.ids(), ...(() => { try { return allAssets().map((a) => a.id); } catch { return []; } })()];
    const start = await libraryStart(`library:${sprite.id}`, { read: () => readFile(row), taken });
    if (!start) return { error: `${sprite.name} cannot be opened in Advanced editing yet: its file is not a version 2 sprite.` };
    if (start.error) return { error: start.error };
    await loadPiecesFor(start.d);
    const { def } = withSliderDefaults(start.d, params(), { check: (d) => checkFull(d) });
    const v = checkDraft(def);
    if (!v.ok) return { error: `The copy could not be made: ${v.errors[0]}` };
    const id = draftIdFor(v.value.id, drafts.ids());
    const r = drafts.put(id, v.value);
    if (!r.ok) return { error: r.error };
    return { id };
  }

  /** Opens Advanced on a copy: `copy` (a draft to go on with), `fresh` (a new copy), `pane` and `clip` (where the editor opens). */
  async function open({ copy, fresh = false, pane, clip } = {}) {
    if (busy || closed) return false;
    busy = true;
    btn.disabled = true;
    say(fresh ? 'Making a new copy…' : 'Opening a copy…');
    let got;
    const { drafts, kept, studio } = placeOf();
    try { got = await copyToEdit(drafts, { copy, fresh }); } catch (e) { got = { error: `The copy could not be made: ${String(e?.message ?? e).slice(0, 200)}` }; }
    busy = false;
    btn.disabled = false;
    if (closed) return false;
    if (got.error) { say(got.error); return false; }
    const entry = drafts.get(got.id);
    if (!entry) { say('The copy could not be read back from the studio.'); return false; }
    // (only a version 2 sprite goes to the version 2 editor: findCopy takes no other, and this checks it once more)
    if (!isV2Sprite(entry.definition) || entry.definition.made?.from !== `library:${sprite.id}`) { say('That draft is not a copy of this sprite.'); return false; }
    say('');
    if (session) shut();
    pause();
    mount(got.id, entry, { drafts, kept, studio, pane, clip });
    return true;
  }

  function mount(id, entry, { drafts, kept, studio, pane, clip }) {
    const nameWord = el('strong', { class: 'adv-copyname' }, entry.definition.name ?? id);
    // the editor saves through these drafts: the bar shows the copy's name as it changes
    const watched = { ...drafts, put(d, def, o) { const r = drafts.put(d, def, o); if (r?.ok && d === id && typeof def?.name === 'string') nameWord.textContent = def.name; return r; } };
    let lastPane = pane ?? 'body', lastClip = clip ?? null;
    const unguard = guardAddress((url) => {
      const parts = studioAddressParts(url);
      if (parts && parts.draft === id) {
        if (parts.mode) lastPane = parts.mode;
        if (parts.clip) lastClip = parts.clip;
        return advancedAddress(location.hash, { id: sprite.id, copy: id, pane: lastPane, clip: lastClip });
      }
      if (url.startsWith(`#/sprite/${sprite.id}`) && !/[?&]edit=advanced(&|$)/.test(url)) return advancedAddress(url, { id: sprite.id, copy: id, pane: lastPane, clip: lastClip });
      return url;
    });
    // the editor draws into a box of its own; its picture, tools and frames, and its panel, are then moved onto the page
    const box = document.createElement('div');
    let stop;
    try { stop = v2EditorPage(box, { id, entry, drafts: watched, kept, studio, query: { mode: pane ?? 'body', ...(clip ? { clip } : {}) } }); } catch (e) {
      unguard();
      say(`The editor could not open: ${String(e?.message ?? e).slice(0, 200)}`);
      return;
    }
    const ed = box.querySelector('main.studio-v2');
    const edStage = ed.querySelector(':scope > .rx-stage');
    const moved = ['.studio-card', '.st-tools', '.st-under', '.v2-stagenote'].map((s) => edStage.querySelector(`:scope > ${s}`)).filter(Boolean);
    const edPanel = ed.querySelector(':scope > .rx-panel');
    const left = main.querySelector(':scope > .rx-stage');
    const pageHead = left.querySelector(':scope > .rx-head');
    const pagePanel = main.querySelector(':scope > .rx-panel');
    const hid = [...left.children].filter((n) => n !== pageHead && !n.classList.contains('rx-more') && !n.hidden);
    for (const n of hid) n.hidden = true;
    pageHead.after(...moved);
    if (pagePanel) { pagePanel.hidden = true; pagePanel.after(edPanel); } else main.append(edPanel);

    // (on a phone the bar is one short line and its buttons: the long words are hidden there)
    const leaveBtn = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'advanced-leave', onclick: () => leave() },
      el('span', { class: 'adv-long' }, 'Back to the simple controls'), el('span', { class: 'adv-short' }, 'Simple controls'));
    const newBtn = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'advanced-new-copy', title: `Start again from the library's ${sprite.name}, at the settings you chose before opening Advanced`, onclick: () => open({ fresh: true, pane: lastPane }) }, 'New copy');
    const bar = el('div', { class: 'adv-bar', role: 'region', 'aria-label': 'Advanced editing' },
      el('p', { class: 'adv-what' }, el('span', { class: 'adv-title' }, 'Advanced editing'), ' · ', el('span', { class: 'adv-long' }, 'you are changing a copy, '), nameWord,
        el('span', { class: 'adv-long' }, `, kept in the studio. The library's ${sprite.name} stays as it is.`)),
      el('span', { class: 'adv-acts' }, leaveBtn, newBtn, el('a', { class: 'link adv-studio', href: `#/studio/${encodeURIComponent(id)}` }, 'Open in the studio')));
    pageHead.append(bar);
    main.classList.add('is-advanced', 'studio', 'studio-v2');
    main.dataset.advancedCopy = id;
    btn.setAttribute('aria-expanded', 'true');
    // the address names the copy now (the editor's own first write already went through the guard)
    window.history.replaceState(window.history.state, '', advancedAddress(location.hash, { id: sprite.id, copy: id, pane: lastPane, clip: lastClip }));
    session = {
      id,
      stop() { try { stop(); } catch (e) { console.error('Advanced editing:', e); } unguard(); },
      restore() {
        bar.remove();
        for (const n of moved) n.remove();
        edPanel.remove();
        for (const n of hid) n.hidden = false;
        if (pagePanel) pagePanel.hidden = false;
        main.classList.remove('is-advanced', 'studio', 'studio-v2');
        delete main.dataset.advancedCopy;
        btn.setAttribute('aria-expanded', 'false');
        document.title = `${sprite.name} · Loadout`;
      },
    };
    edPanel.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
  }

  /** Ends the open editor and puts the page back as it was (the editor saves what waits as it stops). */
  function shut() {
    const s = session;
    session = null;
    if (!s) return;
    s.stop();
    s.restore();
  }

  /** Back to the simple controls: the editor closes and the address forgets Advanced. */
  function leave() {
    if (!session) return;
    shut();
    window.history.replaceState(window.history.state, '', simpleAddress(location.hash));
    resume();
    btn.focus({ preventScroll: true });
  }

  if (isAdvancedQuery(query)) open({ copy: query.copy, pane: query.pane, clip: query.aclip });

  return {
    open,
    leave,
    isOpen: () => !!session,
    close() { closed = true; shut(); btn.remove(); note.remove(); },
  };
}
