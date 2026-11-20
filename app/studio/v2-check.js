// How the studio checks and draws a version 2 definition (build item B17; Contract 15 rules 1, 6 and 7):
//   - checkDraft: what a draft must be to be kept on this computer. Version 1 exactly as before (engine/data-sprite.js
//     validateDataSprite: a version 1 draft that does not pass is refused). Version 2 behind the plain-data wall only
//     (catalog/sprite-schema.js plainSpriteData: nothing run, 128 KB, prototype keys dropped), the format and an id: a
//     version 2 draft with mistakes in it is kept, so a person can add a control and then bind it, and the studio shows
//     its errors beside the rows they are about until it passes. It is drawn, put in the bag and downloaded only when it
//     passes the full check (checkFull). The messages are the validator's, checked without pieces (their form only).
//   - checkFull: catalog/sprite-schema.js validateSprite with the site's registry and its pieces (a piece store; the
//     pieces a definition names are loaded first with loadPiecesFor).
//   - spriteOf: the sprite the framework renderer makes of it (engine/data-sprite.js makeDataSprite), never throwing.
// Runs unchanged in the browser and in Node (the tests hand in a piece store).
import { validateDataSprite, makeDataSprite } from '../../engine/data-sprite.js';
import { validateSprite, plainSpriteData } from '../../catalog/sprite-schema.js';
import { pieceRegistry, sitePieces } from '../../engine/pieces.js';
import * as SITE_GENERATORS from '../../engine/gen/index.js';

const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The version of a definition read without running anything: 1, 2, or null. Arguments: def. */
export function versionOf(def) {
  try {
    const d = isObj(def) ? Object.getOwnPropertyDescriptor(def, 'version') : null;
    return d && 'value' in d ? d.value : null;
  } catch { return null; }
}

/**
 * What a stored draft must be (app/studio/drafts.js uses it as its check): { ok, errors, warnings, value }. Version 1:
 * validateDataSprite's answer. Version 2: ok when it is plain data (128 KB), a `loadout-sprite` with an id; value is
 * the plain copy as written (not cleaned, so nothing is lost while it has mistakes); errors are the validator's, which
 * do not refuse it. Arguments: def (an object or JSON text).
 */
export function checkDraft(def) {
  if (versionOf(def) !== 2) return validateDataSprite(def);
  const p = plainSpriteData(def);
  if (!p.ok) return { ok: false, errors: p.errors, warnings: p.warnings, value: null };
  const d = p.value;
  if (!isObj(d) || d.format !== 'loadout-sprite') return { ok: false, errors: ['The draft is not a sprite ("format": "loadout-sprite").'], warnings: [], value: null };
  if (typeof d.id !== 'string' || !ID_RE.test(d.id)) return { ok: false, errors: ['The draft has no usable id (lowercase letters, digits and dashes, starting with a letter).'], warnings: [], value: null };
  let v;
  try { v = validateSprite(d); } catch (e) { v = { errors: [`It could not be checked: ${String(e?.message ?? e).slice(0, 120)}`], warnings: [] }; }
  return { ok: true, errors: v.errors ?? [], warnings: v.warnings ?? [], value: d };
}

/** The piece list the validator reads, from a store (createPieceStore) or the site's store. */
const piecesOf = (store) => pieceRegistry(store ?? sitePieces());

/** Loads the pieces a definition names into a store (the site's by default): { ok, errors }, never rejecting. Arguments: def, store. */
export async function loadPiecesFor(def, store = sitePieces()) {
  try { return await store.loadFor(def); } catch (e) { return { ok: false, errors: [String(e?.message ?? e)] }; }
}

/**
 * The full check of a definition, version 1 or 2: { ok, errors, warnings, value, cost, uses }; never throws. Version 2
 * is checked against the site's generators and the pieces of `pieces` (a store whose pieces for it are loaded).
 * Arguments: def, { pieces (a piece store; default the site's), soundIds, catalogIds, strict }.
 */
export function checkFull(def, { pieces, ...more } = {}) {
  if (versionOf(def) !== 2) return validateDataSprite(def, more);
  try {
    return validateSprite(def, { generators: SITE_GENERATORS, pieces: piecesOf(pieces), ...more });
  } catch (e) {
    return { ok: false, errors: [`It could not be checked: ${String(e?.message ?? e).slice(0, 160)}`], warnings: [], value: null };
  }
}

/** The sprite the framework renderer makes of a definition: { ok, errors, warnings, sprite } (makeDataSprite), never throwing. Arguments: def, { pieces (a store) }. */
export function spriteOf(def, { pieces } = {}) {
  try { return makeDataSprite(def, { pieces: pieces ?? sitePieces() }); } catch (e) {
    return { ok: false, errors: [String(e?.message ?? e)], warnings: [], sprite: null };
  }
}
