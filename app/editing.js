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
 * its style and its variation (a sound). The pixel size is how it is exported, not a change to the asset.
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
 */
export function createEdit({ kind, id, defaults, start = null, key = null, bag = siteBag, canSave = true, schedule = null }) {
  const base = clone(defaults);
  // the shape the bag stores, with the asset's own values wherever an item or a link left them out
  const whole = (s) => {
    const c = cleanSettings(kind, { ...base, ...s, params: { ...base.params, ...(s && s.params) } });
    if (kind === 'sprite' && !c.cues) c.cues = clone(base.cues ?? null);
    if (kind === 'sprite') delete c.lookParams;      // the bag's own record of its look: never the page's to write
    return c;
  };
  const std = whole(base);
  const mine = (k) => { const it = k ? bag.get(k) : null; return it && it.kind === kind && it.id === id ? it : null; };

  let itemKey = null, settings = start ? whole(start) : clone(std), pending = false, closed = false;
  const fromLink = !!start && !same(settings, std);
  const named = mine(key);
  if (named) { itemKey = named.key; if (!fromLink) settings = whole(named.settings); }
  else if (!fromLink) {
    const own = bag.items().filter((it) => it.kind === kind && it.id === id).pop();
    if (own) { itemKey = own.key; settings = whole(own.settings); }
  }

  const listeners = new Set();
  const emit = () => { const s = api.state(); for (const fn of [...listeners]) fn(s, api); };

  function write() {
    pending = false;
    if (!canSave) return;
    const it = mine(itemKey);
    if (it) { if (!same(whole(it.settings), settings)) bag.update(itemKey, clone(settings)); else emit(); }
    else { itemKey = bag.add({ kind, id, settings: clone(settings) }); emit(); }      // the bag told its listeners before the key was known here
  }
  function save() {
    if (!canSave) { emit(); return; }
    if (!schedule) { write(); return; }
    if (!pending) { pending = true; schedule(() => { if (pending && !closed) write(); }); }
    emit();
  }
  // the bag changed (here or anywhere): an item taken out elsewhere is let go of, and the state is said again
  const offBag = bag.onChange(() => { if (itemKey && !mine(itemKey)) itemKey = null; emit(); });

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
    add() { if (canSave && !mine(itemKey)) write(); else if (pending) write(); return itemKey; },
    /** Take it out of the bag. What is on screen stays; the next change puts it back as a new item. */
    remove() { pending = false; const k = itemKey; itemKey = null; if (k && !bag.remove(k)) emit(); return api; },
    key: () => (mine(itemKey) ? itemKey : null),
    inBag: () => !!mine(itemKey),
    changes: () => countChanges(kind, settings, std),
    /**
     * What the panel's footer says: { status, inBag, key, changes, text, detail }.
     * status: 'off' (a draft) | 'idle' (not in the bag) | 'saving' | 'saved' | 'not-kept' (the browser will forget it).
     */
    state() {
      const n = api.changes(), inBag = api.inBag();
      const detail = n ? `${n} ${n === 1 ? 'change' : 'changes'}` : 'as the original';
      const out = (status, text, more = '') => ({ status, inBag, key: api.key(), changes: n, text, detail: more });
      if (!canSave) return out('off', 'A draft cannot go in your bag. Publish it first.');
      if (pending) return out('saving', 'Saving', detail);
      if (!inBag) return out('idle', 'Changes save by themselves');
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
