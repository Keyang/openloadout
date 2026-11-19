// What the studio page keeps (docs/studio.md section 5; Contract 14 rules 9 and 10; item S9): every change is checked
// before it is shown or saved, and a draft that is in the bag keeps its bag item up to date as it is edited (Keyang's
// Q1, follow edits). Every way this can fail comes back as everyday words for the page to show (Contract 11: never
// swallowed). Pure: the bag module is handed in (the page passes app/bag.js), so it runs in the browser and in Node.
import { validateDataSprite } from '../../engine/data-sprite.js';

const messageOf = (e) => String((e && e.message) || e).slice(0, 200);

/**
 * Check a change before the page keeps it: { ok: true, def (the validator's cleaned copy) } or { ok: false, message }.
 * Arguments: next (the changed definition), opts { check (a validator returning { ok, value, errors }; default validateDataSprite) }.
 */
export function acceptChange(next, { check = validateDataSprite } = {}) {
  let v;
  try { v = check(next); } catch (e) { v = { ok: false, errors: [`it could not be checked (${messageOf(e)})`] }; }
  if (!v || !v.ok) return { ok: false, message: `That change was not made: ${(v?.errors ?? [])[0] ?? 'it would break the sprite'}` };
  return { ok: true, def: v.value };
}

/** Does the bag take sprites made in the studio (item S8)? m: the app/bag.js module (its cleanDefinition and bag). */
export function bagTakes(m, def) {
  try {
    return !!(m && m.bag && typeof m.cleanDefinition === 'function' && m.cleanDefinition('sprite', { data: def })?.data !== undefined);
  } catch { return false; }
}

/**
 * Give a draft's bag item the draft as it is now: { state: 'updated' } | { state: 'gone', message } (the item was taken out
 * of the bag, or is a copy that follows nothing: the draft forgets it) | { state: 'failed', message }.
 * Arguments: m (the app/bag.js module), key (the bag item's key), def (the checked definition).
 */
export function followBag(m, key, def) {
  if (!bagTakes(m, def) || typeof m.bag.updateDefinition !== 'function') {
    return { state: 'failed', message: 'Your bag was not updated with this change: the bag cannot take studio sprites here. Download the file to keep it.' };
  }
  let there = false;
  try { there = m.bag.items().some((i) => i.key === key); } catch (e) {
    return { state: 'failed', message: `Your bag was not updated with this change: the bag could not be read (${messageOf(e)}).` };
  }
  if (!there) return { state: 'gone', message: 'It is no longer in your bag, so changes stay here. Put it in again to use it in your game.' };
  let r;
  try { r = m.bag.updateDefinition(key, { data: def }); } catch (e) {
    return { state: 'failed', message: `Your bag was not updated with this change: ${messageOf(e)}.` };
  }
  if (r === false) return { state: 'gone', message: 'The copy in your bag no longer follows this draft, so changes stay here. Put it in again to use the new one.' };
  return { state: 'updated' };
}
