// How the studio page draws a definition, and the files it makes from one (item S9). A bone rig is drawn the way
// engine/data-sprite.js draws it (rigs/bones.js drawRig on the frame's pose), straight from the definition, so a
// picture can follow a drag without validating the definition on every move; the Hero and other library bodies through
// rigs/humanoid-studio.js drawSprite, as Contract 14 rule 3 asks. Pure (no page): runs in the browser and in Node.
import { Surface } from '../../engine/surface.js';
import { defineSprite, renderSheet, defaultParams } from '../../engine/sprite.js';
import { makeDataSprite, validateDataSprite, framePose, drawOptions } from '../../engine/data-sprite.js';
import { drawRig } from '../../rigs/bones.js';
import { drawSprite } from '../../rigs/humanoid-studio.js';
import { isRig, rigFor, isTopDown } from './edit.js';

/** The Hero drawn as a sprite, until engine/data-sprite.js draws library bodies itself: the sprite's clips and anchor, drawn by drawSprite. */
function librarySprite(def) {
  const clips = {};
  for (const [name, c] of Object.entries(def.clips)) clips[name] = { frames: c.frames, fps: c.fps, loop: c.loop !== false, label: c.label };
  return defineSprite({
    id: def.id, name: def.name, blurb: def.blurb, meta: def.meta, size: [...def.size], pivot: [...def.pivot], grounded: def.grounded !== false,
    params: {}, clips, preview: def.preview,
    render(g, { clip, frame, p }) { drawSprite(g, def, { clip, frame, p }); },
    definition: def,
  });
}

/**
 * The sprite a definition makes: { ok, errors, warnings, sprite }, never throwing. A bone rig goes through
 * engine/data-sprite.js makeDataSprite; a library body is validated and drawn through rigs/humanoid-studio.js.
 * Arguments: def (a definition, as stored or as edited).
 */
export function spriteFor(def) {
  const made = makeDataSprite(def);
  if (made.ok || !def?.body?.library) return made;
  const v = validateDataSprite(def);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, sprite: null };
  try { return { ok: true, errors: [], warnings: v.warnings, sprite: librarySprite(v.value) }; } catch (e) {
    return { ok: false, errors: [String(e?.message ?? e)], warnings: v.warnings, sprite: null };
  }
}

/** One frame of a clip on a new Surface of the sprite's size, as the sprite draws it. Arguments: def (cleaned), clip, frame, p (settings; defaults when left out). */
export function drawFrame(def, clip, frame, p = {}) {
  const g = new Surface(def.size[0], def.size[1]);
  if (!def.clips?.[clip]) return g;
  if (isRig(def)) drawRig(g, rigFor(def, clip), framePose(def, clip, frame), drawOptions(def, p));
  else drawSprite(g, def, { clip, frame, p });
  return g;
}

/** The body at rest (no clip): what Body shows. A top-down body faces `facing` ('side', 'down' or 'up'); a library body stands as on its idle's first frame. */
export function drawRest(def, facing = 'side', p = {}) {
  const g = new Surface(def.size[0], def.size[1]);
  if (isRig(def)) drawRig(g, rigFor(def, isTopDown(def) ? facing : null), {}, drawOptions(def, p));
  else {
    const clip = def.clips.idle ? 'idle' : def.preview;
    drawSprite(g, def, { clip, frame: 0, p });
  }
  return g;
}

/**
 * The file for the library, sprites/<id>.js, in the one fixed data form: a promise of { ok, errors, warnings, name, text }.
 * The writer (tools/lib/data-file.mjs) is loaded only when a file is made, so the page opens where tools/ is not served.
 * Arguments: def, catalogIds (the library's ids; the file's id may not be one).
 */
export async function libraryFile(def, catalogIds) {
  let F;
  try { F = await import('../../tools/lib/data-file.mjs'); } catch {
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
