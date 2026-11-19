// Changes save themselves (docs/site-design.md, section 3). One edit session stands behind the editing panel
// (app/panel.js) wherever it is shown: an asset page, the bag, the playground. It holds the asset's settings as they are
// on screen and keeps the bag in step with them:
//   - opening a page adds nothing; the first change puts the asset in the bag, every later one updates that item;
//   - opened from the bag (the item's key is in the address) it edits that item;
//   - opened from anywhere else it edits the bag item for that asset if there is one. A link that carries settings is
//     shown as it is and is not written over the visitor's own item: its first change becomes an item of its own;
//   - Start over goes back to the defaults and keeps the item; Remove takes it out;
//   - while the browser is not keeping the bag, the state says so (NOT_KEPT) instead of "Saved".
// No page here: it runs in Node for the unit tests (tests/unit/site-editing.test.mjs).
import { bag as siteBag, cleanSettings, NOT_KEPT } from './bag.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * How many things are changed from the asset's own settings: one for each control, one for its sounds (a sprite),
 * its style and its variation (a sound), a look of its own. The pixel size is how it is exported, not a change to the asset.
 */
export function countChanges(kind, settings, defaults) {
  const p = settings.params ?? {}, d = defaults.params ?? {};
  let n = Object.keys({ ...d, ...p }).filter((k) => !same(p[k], d[k])).length;
  if (kind === 'sprite') {
    if (!same(settings.cues ?? null, defaults.cues ?? null)) n++;
    if ((settings.artStyle ?? null) !== (defaults.artStyle ?? null)) n++;
  } else {
    if ((settings.style ?? null) !== (defaults.style ?? null)) n++;
    if (kind === 'sound' && (settings.seed ?? 1) !== (defaults.seed ?? 1)) n++;
  }
  if ((settings.look ?? null) !== (defaults.look ?? null)) n++;      // a look of its own (app/bag.js lookOf)
  return n;
}

/**
 * createEdit({ kind, id, defaults, start, key, bag, canSave, schedule }) -> the session.
 *   kind, id   the asset ('sprite' | 'sound' | 'music', its id)
 *   defaults   the asset's own settings, complete: sprite { params, cues, scale, artStyle? }, sound { params, style, seed }, music { params, style }
 *   start      the settings the address carries (complete), or null
 *   key        the bag item the address names (`bag=<key>`), or null
 *   bag        the bag to keep in step (the site's own unless a test hands one in)
 *   canSave    false for a draft, which cannot go in the bag: changes then stay on the page
 *   schedule   (fn) => void: when given, saving waits for it to call fn, so a slider being dragged is one save
 *   baseFor    (settings) => params: what a control left out of an item is (a sound's or a track's version sets its
 *              controls, and a shared link leaves out what equals the version: J9.1). Default: the asset's own values
 */
export function createEdit({ kind, id, defaults, start = null, key = null, bag = siteBag, canSave = true, schedule = null, baseFor = null }) {
  const base = clone(defaults);
  const fill = (s) => { if (!baseFor) return base.params; try { return { ...base.params, ...(baseFor(s ?? {}) ?? {}) }; } catch { return base.params; } };
  // the shape the bag stores, with the asset's own values (or its version's) wherever an item or a link left them out
  const whole = (s) => {
    const c = cleanSettings(kind, { ...base, ...s, params: { ...fill(s), ...(s && s.params) } });
    if (kind === 'sprite' && !c.cues) c.cues = clone(base.cues ?? null);
    if (kind === 'sprite') delete c.lookParams;      // the bag's own record of its look: never the page's to write
    return c;
  };
  const std = whole(base);
  const mine = (k) => { const it = k ? bag.get(k) : null; return it && it.kind === kind && it.id === id ? it : null; };

  let itemKey = null, settings = start ? whole(start) : clone(std), pending = false, closed = false;
  // `synced`: the item's settings as this session last saw them in the bag (or wrote them). What differs from it on
  // screen is this session's own change; anything else the item has now came from elsewhere and is taken.
  let synced = null;
  const fromLink = !!start && !same(settings, std);
  // The item the address names is the truth: an address is a bookmark that can be stale (browser Back, a link made
  // before the item changed in the bag), so its settings only count when it names no item in this bag (a shared link).
  const named = mine(key);
  if (named) { itemKey = named.key; settings = whole(named.settings); synced = clone(settings); }
  else if (!fromLink) {
    const own = bag.items().filter((it) => it.kind === kind && it.id === id).pop();
    if (own) { itemKey = own.key; settings = whole(own.settings); synced = clone(settings); }
  }

  const listeners = new Set();
  const emit = () => { const s = api.state(); for (const fn of [...listeners]) fn(s, api); };

  // force: put it in the bag even with nothing changed (Add to my bag). Otherwise an asset that is not in the bag goes in
  // only with a change: a pixel size alone is how it is downloaded, not a change to it
  function write(force = false) {
    pending = false;
    if (!canSave) return;
    const it = mine(itemKey);
    if (it) {
      if (!same(synced, whole(it.settings))) follow(it);      // changed elsewhere since: keep that, with this session's change on top
      synced = clone(settings);
      if (!same(whole(it.settings), settings)) bag.update(itemKey, clone(settings)); else emit();
    } else if (force || api.changes() > 0) { synced = clone(settings); itemKey = bag.add({ kind, id, settings: clone(settings) }); emit(); }      // the bag told its listeners before the key was known here
    else emit();
  }
  /**
   * The item changed elsewhere (another tab, another panel on this page): take its settings, keeping on top whatever
   * this session changed that is not saved yet, field by field and control by control.
   */
  function follow(it) {
    const theirs = whole(it.settings);
    if (pending && synced) {
      const out = clone(theirs);
      for (const k of new Set([...Object.keys(settings), ...Object.keys(synced)])) {
        if (k === 'params') continue;
        if (!same(settings[k], synced[k])) { if (settings[k] === undefined) delete out[k]; else out[k] = clone(settings[k]); }
      }
      for (const k of new Set([...Object.keys(settings.params ?? {}), ...Object.keys(synced.params ?? {})])) {
        if (!same(settings.params?.[k], synced.params?.[k])) out.params[k] = clone(settings.params[k]);
      }
      settings = whole(out);
    } else settings = theirs;
    synced = theirs;
  }
  function save() {
    if (!canSave) { emit(); return; }
    if (!schedule) { write(); return; }
    if (!pending) { pending = true; schedule(() => { if (pending && !closed) write(); }); }
    emit();
  }
  // the bag changed (here or anywhere): an item taken out elsewhere is let go of; an item changed elsewhere is followed,
  // so the page shows it as it is now and the next change here does not write old settings over it (J11)
  const offBag = bag.onChange(() => {
    const it = itemKey ? mine(itemKey) : null;
    if (itemKey && !it) { itemKey = null; synced = null; }
    else if (it && !same(synced, whole(it.settings))) follow(it);
    emit();
  });

  const api = {
    kind, id,
    /** The settings on screen, complete (a copy). */
    settings: () => clone(settings),
    /** The asset's own settings (a copy). */
    defaults: () => clone(std),
    /** Change something: the fields given replace those fields (params whole). Saved at once. */
    set(part) { settings = whole({ ...settings, ...part }); save(); return api; },
    /** Back to the asset's own settings. It stays in the bag if it is there; nothing is added if it is not. */
    startOver() { settings = clone(std); if (mine(itemKey)) save(); else emit(); return api; },
    /** Put it in the bag as it is on screen, if it is not there yet. Returns the item's key (null for a draft). */
    add() { if (canSave && !mine(itemKey)) write(true); else if (pending) write(); return itemKey; },
    /** Take it out of the bag. What is on screen stays; the next change puts it back as a new item. */
    remove() { pending = false; const k = itemKey; itemKey = null; if (k && !bag.remove(k)) emit(); return api; },
    key: () => (mine(itemKey) ? itemKey : null),
    inBag: () => !!mine(itemKey),
    changes: () => countChanges(kind, settings, std),
    /**
     * What the panel's footer says: { status, inBag, key, changes, text, detail, kept }. kept: false while the browser
     * keeps nothing (the footer says so from the start, before there is anything to lose).
     * status: 'off' (a draft) | 'idle' (not in the bag, nothing changed) | 'unsaved' (not in the bag, with changes: a
     * link's, the landing's) | 'saving' | 'saved' | 'not-kept' (the browser will forget it).
     */
    state() {
      const n = api.changes(), inBag = api.inBag();
      const detail = n ? `${n} ${n === 1 ? 'change' : 'changes'}` : '0 changes, as the original';
      const out = (status, text, more = '') => ({ status, inBag, key: api.key(), changes: n, text, detail: more, kept: bag.kept() });
      if (!canSave) return out('off', 'A draft cannot go in your bag. Publish it first.');
      if (pending) return out('saving', 'Saving', detail);
      // (changes on screen that are not in the bag: a link's, or the landing's. Said plainly, with Add to my bag beside it)
      if (!inBag) return n ? out('unsaved', 'Not in your bag yet', detail) : out('idle', 'Changes save by themselves', 'Not in your bag yet');
      if (!bag.kept()) return out('not-kept', NOT_KEPT, detail);
      return out('saved', 'Saved in your bag', detail);
    },
    /** Call fn(state, edit) after every change, here or in the bag. Returns a function that stops it. */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Save now whatever is waiting for the schedule. */
    flush() { if (pending) write(); },
    /** The page is left: save what is waiting, stop listening. */
    close() { if (pending) write(); closed = true; offBag(); listeners.clear(); },
  };
  return api;
}
