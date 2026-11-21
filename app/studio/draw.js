// How the studio page draws a definition, and the files it makes from one (item S9). A bone rig is drawn the way
// engine/data-sprite.js draws it (rigs/bones.js drawRig on the frame's pose), straight from the definition, so a
// picture can follow a drag without validating the definition on every move. Every version 1 body is a bone rig (the
// library bodies, a code rig the Hero was drawn through, are gone: build item R1). Pure (no page): runs in the browser and in Node.
import { Surface } from '../../engine/surface.js';
import { renderSheet, defaultParams } from '../../engine/sprite.js';
import { makeDataSprite, framePose, drawOptions } from '../../engine/data-sprite.js';
import { drawRig } from '../../rigs/bones.js';
import { isRig, rigFor, isTopDown } from './edit.js';

/**
 * The sprite a definition makes: { ok, errors, warnings, sprite }, never throwing (engine/data-sprite.js makeDataSprite).
 * Arguments: def (a definition, as stored or as edited).
 */
export function spriteFor(def) {
  return makeDataSprite(def);
}

/** One frame of a clip on a new Surface of the sprite's size, as the sprite draws it. Arguments: def (cleaned), clip, frame, p (settings; defaults when left out). */
export function drawFrame(def, clip, frame, p = {}) {
  const g = new Surface(def.size[0], def.size[1]);
  if (!def.clips?.[clip]) return g;
  if (isRig(def)) drawRig(g, rigFor(def, clip), framePose(def, clip, frame), drawOptions(def, p));
  return g;
}

/** The body at rest (no clip): what Body shows. A top-down body faces `facing` ('side', 'down' or 'up'). */
export function drawRest(def, facing = 'side', p = {}) {
  const g = new Surface(def.size[0], def.size[1]);
  if (isRig(def)) drawRig(g, rigFor(def, isTopDown(def) ? facing : null), {}, drawOptions(def, p));
  return g;
}

/**
 * The studio's file of a version 1 draft, <id>.js, in the one fixed data form (the library no longer takes it, build item R4a): a promise of { ok, errors, warnings, name, text }.
 * The writer (catalog/data-file.js) is loaded only when a file is made.
 * Arguments: def, catalogIds (the library's ids; the file's id may not be one).
 */
export async function libraryFile(def, catalogIds) {
  let F;
  try { F = await import('../../catalog/data-file.js'); } catch {
    return { ok: false, errors: ['the file writer could not be loaded on this site'], warnings: [], name: null, text: null };
  }
  return F.writeDataFile(def, catalogIds ? { catalogIds } : {});
}

/** The sprite sheet: every clip a row, every frame a cell, at the default settings: { w, h, rgba (Uint8ClampedArray), meta } or { error }. Arguments: def, scale (whole number, default 1). */
export function sheetOf(def, scale = 1) {
  const s = spriteFor(def);
  if (!s.ok) return { error: s.errors[0] ?? 'This sprite cannot be drawn yet.' };
  const sheet = renderSheet(s.sprite, defaultParams(s.sprite), { scale });
  return { w: sheet.w, h: sheet.h, rgba: new Uint8ClampedArray(sheet.data.buffer, sheet.data.byteOffset, sheet.data.length * 4), meta: sheet.meta };
}
