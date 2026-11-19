// The studio's drafts on this computer: one localStorage entry, `loadout-studio-v1`, holding
// { version: 1, drafts: { <draft>: { definition, savedAt, bagKey? } } } (docs/studio.md section 5, "Autosave";
// docs/architecture.md, Contract 14). This module owns reading and writing that entry, so every writer (the studio page
// and window.loadout.studio, app/api-studio.js) keeps to the same promises:
//
//   - A store it cannot read whole (getItem throws, not JSON, not { drafts: {...} }, past readChars) is never saved over:
//     every commit is refused with StoreRefused, whose message says how to start afresh. Saving over it would lose it.
//   - It does not judge entries: whatever an entry holds (damaged, unknown fields, a key that is no draft name) is carried
//     through every save untouched. The caller checks what it uses (engine/data-sprite.js validateDataSprite).
//   - A change is one entry, read, changed and written in one synchronous step against what storage holds at that moment,
//     so two writers on one storage (the page and an agent) never put back an old copy of each other's drafts.
//   - A store bigger than storeChars (another tab may write one) is still read; until it fits again, only a commit that
//     makes it smaller is allowed.
//   - A save that fails (storage full) is reported, and that one entry waits in memory, shown on top of whatever storage
//     holds, until the next save that succeeds writes it.
//
// No imports, no Node: the same file runs in the browser and in the unit tests, which hand in a storage.

/** The localStorage key the studio keeps its drafts under (docs/studio.md section 5). */
export const STUDIO_KEY = 'loadout-studio-v1';

/** The store's caps: drafts the studio makes room for, characters of the whole store it writes, and characters it will read at all. */
export const STORE_LIMITS = Object.freeze({ drafts: 40, storeChars: 2 * 1024 * 1024, readChars: 8 * 1024 * 1024 });

/** What a refused commit throws: the store could not be read whole, or the change does not fit. Its message is for a person. */
export class StoreRefused extends Error {}

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const size = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
const messageOf = (e) => String((e && e.message) || e).slice(0, 300);

/** The plain message for a store that could not be read whole (problems: what reading it found), saying how to start afresh. */
export function unreadableMessage(problems) {
  return `The saved drafts could not be read whole (${problems.join(' ')}), so the studio will not use or save over them: that would lose the drafts in them. Nothing was changed. Download any draft you can still open (studio_file) and, to start afresh, clear the saved drafts by hand: in this site's browser console, localStorage.removeItem('${STUDIO_KEY}').`;
}

/**
 * The drafts in a storage: { read, commit, pending }.
 * read() gives { entries (name -> what is stored, with any waiting change on top), problems (plain sentences), whole (false:
 * nothing may be written), over (bigger than storeChars) }. commit(name, change) calls change(the entry now, or undefined)
 * and stores what it returns (undefined removes the entry): { saved, warnings }, or throws StoreRefused. pending() says
 * whether a failed save is waiting.
 * Arguments: storage ({ getItem, setItem }), opts { limits (to lower STORE_LIMITS in tests) }.
 */
export function createDraftStore(storage, { limits: lower } = {}) {
  const limits = { ...STORE_LIMITS, ...(isObj(lower) ? lower : {}) };
  const waiting = new Map();          // name -> entry, or null for a removal, that a failed save left

  /** What storage holds now, without the waiting changes: { entries, problems, whole, over, chars }. */
  function fromStorage() {
    let text;
    try { text = storage.getItem(STUDIO_KEY); } catch (e) {
      return { entries: {}, problems: [`The saved drafts could not be read (${messageOf(e)}).`], whole: false, over: false, chars: 0 };
    }
    if (text === null || text === undefined) return { entries: {}, problems: [], whole: true, over: false, chars: 0 };
    if (typeof text !== 'string') return { entries: {}, problems: ['The saved drafts could not be read (not text).'], whole: false, over: false, chars: 0 };
    if (text.length > limits.readChars) return { entries: {}, problems: [`The saved drafts are too big to read (${size(text.length)}; the studio keeps at most ${size(limits.storeChars)}).`], whole: false, over: true, chars: text.length };
    const over = text.length > limits.storeChars;
    const problems = over ? [`The saved drafts take ${size(text.length)}, more than the ${size(limits.storeChars)} the studio keeps: remove drafts you no longer need before making or changing others.`] : [];
    let raw;
    try { raw = JSON.parse(text, (k, v) => (PROTO_KEYS.has(k) ? undefined : v)); } catch {
      return { entries: {}, problems: [...problems, `The saved drafts are damaged (not JSON, ${size(text.length)}) and cannot be read.`], whole: false, over, chars: text.length };
    }
    if (raw === null) return { entries: {}, problems, whole: true, over, chars: text.length };
    if (!isObj(raw) || !isObj(raw.drafts)) return { entries: {}, problems: [...problems, 'The saved drafts are damaged (no list of drafts) and cannot be read.'], whole: false, over, chars: text.length };
    return { entries: { ...raw.drafts }, problems, whole: true, over, chars: text.length };
  }

  const withWaiting = (entries) => {
    const out = { ...entries };
    for (const [k, v] of waiting) { if (v === null) delete out[k]; else out[k] = v; }
    return out;
  };

  return {
    /** The stored entries with any waiting change on top, and what was wrong reading them: { entries, problems, whole, over }. */
    read() {
      const r = fromStorage();
      return { entries: withWaiting(r.entries), problems: r.problems, whole: r.whole, over: r.over };
    },
    /** Change one entry against what storage holds now: { saved, warnings }; throws StoreRefused when it may not be written. */
    commit(name, change) {
      if (typeof name !== 'string' || !name || PROTO_KEYS.has(name)) throw new StoreRefused(`A draft cannot be saved under the name ${JSON.stringify(String(name)).slice(0, 60)}.`);
      const r = fromStorage();
      if (!r.whole) throw new StoreRefused(unreadableMessage(r.problems));
      const all = withWaiting(r.entries);
      const next = change(Object.hasOwn(all, name) ? all[name] : undefined);
      if (next === undefined) delete all[name]; else all[name] = next;
      const text = JSON.stringify({ version: 1, drafts: all });
      if (text.length > limits.storeChars && !(next === undefined && text.length < r.chars)) {
        throw new StoreRefused(`The studio keeps at most ${size(limits.storeChars)} of drafts on this computer, and this change would make them ${size(text.length)}: there is no room. Remove a draft you no longer need (studio_remove), after downloading it (studio_file) if you want to keep it.`);
      }
      try {
        storage.setItem(STUDIO_KEY, text);
      } catch (e) {
        waiting.set(name, next === undefined ? null : next);
        return { saved: false, warnings: [`The draft could not be saved on this computer (${messageOf(e)}; the browser's storage for this site may be full). It is kept for this visit only: download the file (studio_file) so it is not lost.`] };
      }
      waiting.clear();
      return { saved: true, warnings: [] };
    },
    /** Whether a failed save is waiting to be written. */
    pending: () => waiting.size > 0,
  };
}
