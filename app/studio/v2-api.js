// window.loadout.studio for version 2 sprites (build item B17; docs/studio.md section 7; Contract 14 rule 10, Contract 15):
// what app/api-studio.js calls when a draft or a definition is version 2, so an agent makes, changes, draws and downloads
// any body (rig, tiles, layers, panel, emitters, pictures) with the same members a person's studio page uses.
//   - starts: one template per body, named template:v2-<body>; a library data sprite is started from with
//     library:<id> (a copy, DQ5), read from its file sprites/<id>.json behind the plain-data wall;
//   - preloadPieces: the pieces every version 2 definition in the call or in the drafts names, loaded before a member
//     runs (the validator and the renderer read pieces synchronously);
//   - renderV2: frames drawn by the framework renderer (engine/data-sprite.js), the clip list the sprite's (a layout
//     may write its clips), as app/api-studio.js draws version 1;
//   - fileV2: the file for the library, <id>.json.
// Never throws: answers are { ok: false, errors } for the caller to pass on. Runs in the browser and in Node.
import { renderFrame, cleanParams, clipFps } from '../../engine/sprite.js';
import { parseSpriteJson } from '../../catalog/sprite-schema.js';
import { v2Starts, v2Template } from './v2-templates.js';
import { copyOfLibrary, fileOf, bodyKind, BODY_LABELS } from './v2-model.js';
import { checkFull, loadPiecesFor, spriteOf, versionOf } from './v2-check.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const messageOf = (e) => String((e && e.message) || e).slice(0, 300);

/** The version 2 starts as window.loadout.studio.starts lists them: [{ from: 'template:v2-<body>', label, blurb, body, view, size, clips }]. */
export function v2StartList() {
  return v2Starts().map((s) => {
    const d = v2Template(s.body);
    return { from: `template:${s.id}`, label: s.label, blurb: s.blurb, body: BODY_LABELS[s.body], view: d.meta.view, size: [...d.size], clips: Object.keys(d.clips ?? {}), version: 2 };
  });
}

/** The definition a version 2 template start names ('template:v2-pictures' ...), or null. Arguments: from. */
export function v2StartFrom(from) {
  const m = /^template:v2-([a-z]+)$/.exec(String(from));
  const d = m ? v2Template(m[1]) : null;
  return d ? { d, from: `template:v2-${m[1]}` } : null;
}

/**
 * A library data sprite as a start: { d (a copy: copyOfLibrary), from: 'library:<id>' }, null when `from` names no
 * library data sprite, or { error } when its file could not be read. Arguments: from ('library:<id>'), { read (async (id) ->
 * the file's text, or null when there is no data file; default: the catalogue's src fetched from the site), taken (ids in use) }.
 */
export async function libraryStart(from, { read, taken = [] } = {}) {
  const m = /^library:([a-z][a-z0-9-]{0,39})$/.exec(String(from));
  if (!m) return null;
  let text;
  try { text = await (read ?? siteRead)(m[1]); } catch (e) { return { error: `The library file of "${m[1]}" could not be read: ${messageOf(e)}` }; }
  if (text === null || text === undefined) return null;
  const p = parseSpriteJson(text);
  if (!p.ok) return { error: `The library file of "${m[1]}" could not be read: ${p.errors[0]}` };
  if (versionOf(p.value) !== 2) return null;
  return { d: copyOfLibrary(p.value, { taken }), from: `library:${m[1]}` };
}

/** The text of a library data sprite on the site (the catalogue row's src, sprites/<id>.json), or null when it has no data file. */
async function siteRead(id) {
  const C = await import('../catalog.js');
  await C.loadCatalog();
  const row = C.assetById(id);
  if (!row || row.kind !== 'sprite' || typeof row.src !== 'string' || !row.src.endsWith('.json') || row.studio) return null;
  const r = await fetch(row.src);
  if (!r.ok) throw new Error(`${row.src}: ${r.status}`);
  return r.text();
}

/**
 * Loads the pieces of every version 2 definition in `values` (and their own fields one level down, so a call's options
 * count) and in the drafts kept in `storage` under `key`. Never throws or rejects. Arguments: storage, key, values.
 */
export async function preloadPieces(storage, key, values = []) {
  const defs = [];
  const take = (v) => { if (isObj(v) && versionOf(v) === 2) defs.push(v); };
  for (const v of values) { take(v); if (isObj(v)) for (const x of Object.values(v)) take(x); }
  try {
    const raw = storage?.getItem?.(key);
    if (typeof raw === 'string' && raw.length < 8 * 1024 * 1024) {
      const all = JSON.parse(raw)?.drafts;
      if (isObj(all)) for (const e of Object.values(all)) if (isObj(e)) take(e.definition);
    }
  } catch { /* an unreadable store is said by the member that reads it */ }
  await Promise.all(defs.map((d) => loadPiecesFor(d)));
}

/**
 * A version 2 definition's frames drawn into one RGBA row, as app/api-studio.js draw() gives them for version 1:
 * { ok, clip, frame, frames, W, H, scale, fps, opaque, rgba, warnings } or { ok: false, errors }. The clips are the
 * sprite's (a tileset's, a panel's and a background's layout writes them). Arguments: value (checked), o { clip, frame,
 * params, scale, bones }, limits { scale, pixels }.
 */
export function renderV2(value, o, limits) {
  const made = spriteOf(value);
  if (!made.ok) return { ok: false, errors: made.errors };
  const sprite = made.sprite;
  const names = Object.keys(sprite.clips);
  const clip = o.clip ?? sprite.preview ?? names[0];
  if (typeof clip !== 'string' || !Object.hasOwn(sprite.clips, clip)) return { ok: false, errors: [`There is no clip ${JSON.stringify(o.clip)}. The clips are: ${names.join(', ')}.`] };
  const count = sprite.clips[clip].frames;
  const one = o.frame !== undefined && o.frame !== null;
  if (one && !(Number.isInteger(o.frame) && o.frame >= 0 && o.frame < count)) return { ok: false, errors: [`frame must be a whole number from 0 to ${count - 1} (the clip "${clip}" has ${count} frame${count === 1 ? '' : 's'}); leave it out for the whole clip in one row.`] };
  const scale = o.scale ?? 1;
  if (!(Number.isInteger(scale) && scale >= 1 && scale <= limits.scale)) return { ok: false, errors: [`scale must be a whole number from 1 to ${limits.scale}.`] };
  if (o.params !== undefined && o.params !== null && !isObj(o.params)) return { ok: false, errors: ['params must be an object of settings by control key.'] };
  const warnings = [];
  const p = cleanParams(sprite, o.params ?? {});
  for (const k of Object.keys(o.params ?? {})) if (!Object.hasOwn(sprite.params, k)) warnings.push(`"${k}" is not one of this sprite's controls and was ignored. Its controls are: ${Object.keys(sprite.params).join(', ')}.`);
  if (o.bones) warnings.push(`The skeleton is drawn for version 1 bone rigs; this is a version 2 ${bodyKind(value) ?? 'sprite'}, so the picture has no bones drawn over it.`);
  const frames = one ? [o.frame] : Array.from({ length: count }, (_, f) => f);
  const [fw, fh] = sprite.size, W = frames.length * fw * scale, H = fh * scale;
  if (W * H > limits.pixels) return { ok: false, errors: [`That picture would be ${W} by ${H} pixels, more than the ${limits.pixels.toLocaleString('en')} pixels one picture may have. Ask for one frame, or a smaller scale.`] };
  const px = new Uint32Array(W * H);
  let opaque = 0;
  for (let n = 0; n < frames.length; n++) {
    let g;
    try { g = renderFrame(sprite, clip, frames[n], p); } catch (e) { return { ok: false, errors: [`Clip "${clip}", frame ${frames[n]} could not be drawn: ${messageOf(e)}`] }; }
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const v = g.data[y * fw + x];
      if (!v) continue;
      opaque += scale * scale;
      for (let sy = 0; sy < scale; sy++) px.fill(v, (y * scale + sy) * W + n * fw * scale + x * scale, (y * scale + sy) * W + n * fw * scale + x * scale + scale);
    }
  }
  return { ok: true, clip, frame: one ? o.frame : null, frames: frames.length, W, H, scale, fps: clipFps(sprite, clip, p), opaque, rgba: new Uint8Array(px.buffer), warnings };
}

/** The file for the library: { ok, name: '<id>.json', text, warnings, library: { ok, errors } (what the library's strict check says) }. Arguments: value (checked), opts (catalogIds, soundIds). */
export function fileV2(value, opts = {}) {
  const f = fileOf(value);
  const strict = checkFull(value, { ...opts, strict: true });
  return { ok: true, name: f.name, text: f.text, warnings: [], library: { ok: strict.ok, errors: strict.errors } };
}
