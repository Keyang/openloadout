// window.loadout.studio (docs/studio.md section 7, work item S11; docs/architecture.md, Contract 14 rule 10): the studio's
// drafts as plain data in and out, so an agent can make a sprite the way a person does in the studio:
//
//   const s = window.loadout.studio;
//   const { draft } = await s.create({ from: 'template:four-legs', name: 'Moss beast' });
//   const { definition } = await s.get(draft);  definition.colours.fur = '#4f9d57';  await s.set(draft, definition);
//   const { png } = await s.render(draft, { clip: 'walk', scale: 4 });       // the walk, every frame in one row
//   const { name, text } = await s.file(draft);                              // a file to keep (a version 1 draft's .js is not a library file since R4a: library.ok is false)
//
// Each member is also an action in app/api-actions.js (studio_create, studio_render, ...), so generated/api.json lists
// it for an MCP server. app/api-core.js loads this file the first time a studio action is called.
//
// What it keeps to:
//   - Every member is async, returns plain data and never throws: a bad input gives { ok: false, errors: ['...'] }.
//   - Inputs come from agents and are not trusted. A definition goes through engine/data-sprite.js validateDataSprite
//     (catalog/studio-schema.js: 64 KB of JSON, prototype keys dropped, unknown fields dropped, numbers clamped, every
//     count capped, every reference resolved) before it is kept or drawn, and only the cleaned copy is kept. Options are
//     read as own data fields only. Pictures are capped (scale 1..8, at most STUDIO_API_LIMITS.pixels pixels).
//   - Drafts live in localStorage under `loadout-studio-v1`: { version: 1, drafts: { <draft>: { definition, savedAt,
//     bagKey? } } }, at most 40 drafts and 2 MB, read and written through app/studio-store.js (the one owner of that
//     entry). Everything read back is checked again before it is used; a draft that no longer passes is listed as
//     "damaged", is neither drawn nor exported, and is kept as it was until it is set again or removed. Entries the
//     studio cannot use are carried through every save untouched, and a store it cannot read whole is never saved over:
//     every change is refused, saying how to start afresh. Each save changes one draft against what storage holds at
//     that moment, so the page and an agent do not undo each other. A failed save is reported (saved: false and a
//     warning), never swallowed; the change waits in memory for this visit, over what storage holds, and is saved with
//     the next change that succeeds. Without the browser's storage (a private window, blocked site data, Node) drafts
//     live in memory and every change says "Not kept after this tab closes". The page (S9) saves 500 ms after a change;
//     these calls save at once.
//   - Studio sprites are not held to the quality bar (Contract 14 rule 7): advice() gives its findings as advice.
//   - Nothing from a definition ever runs: it is data drawn by framework code, so no worker is needed.
//
// Runs unchanged in the browser and in Node (the unit tests hand in storage, the library's ids, the sounds and the bag).
import { makeDataSprite, framePose, drawOptions, directionRig, directionOf } from '../engine/data-sprite.js';
// build item B17: version 2 drafts and definitions (every body) beside version 1 (app/studio/v2-api.js)
import { checkFull as validateDataSprite } from './studio/v2-check.js';
import { v2StartList, v2StartFrom, libraryStart, preloadPieces, renderV2, fileV2 } from './studio/v2-api.js';
import { renderFrame, cleanParams, clipFps } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { STUDIO_LIMITS, usedLibraryBody, LIBRARY_BODY_GONE } from '../catalog/studio-schema.js';
import { studioTemplates, studioTemplate } from '../rigs/studio-templates.js';
import { solveRig, drawBoneLines } from '../rigs/bones.js';
import { createDraftStore, unreadableMessage, StoreRefused, STORE_LIMITS, STUDIO_KEY as KEY } from './studio-store.js';

/** The localStorage key the studio keeps its drafts under (docs/studio.md section 5, "Autosave"; app/studio-store.js owns it). */
export const STUDIO_KEY = KEY;

/** The studio's own caps: drafts kept, characters of the whole store, picture scale and pixels in one picture; a definition is at most 64 KB of JSON (catalog/studio-schema.js). */
export const STUDIO_API_LIMITS = Object.freeze({
  drafts: STORE_LIMITS.drafts,
  storeChars: STORE_LIMITS.storeChars,
  scale: 8,
  pixels: 4_000_000,
  definitionBytes: STUDIO_LIMITS.jsonBytes,
});

/** What every change says while the browser is not keeping the drafts (docs/studio.md section 5). */
export const NOT_KEPT = 'Not kept after this tab closes: this browser is not saving for this site (a private window, or saving for sites is switched off). Download the file (studio_file) before you leave.';

const DRAFT_RE = /^[a-z][a-z0-9-]{0,39}$/;
const BAG_KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const messageOf = (e) => String((e && e.message) || e).slice(0, 300);
const say = (v) => (v === null ? 'null' : v === undefined ? 'nothing' : Array.isArray(v) ? 'a list' : typeof v === 'string' ? JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v) : typeof v === 'function' ? 'a function' : typeof v === 'object' ? 'an object' : `the ${typeof v} ${String(v)}`);
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : ArrayBuffer.isView(x) ? undefined : x))));

/** An error whose message is for the caller, passed on as it is. */
class Problem extends Error {
  constructor(errors, extra = {}) { super(Array.isArray(errors) ? errors[0] : errors); this.errors = Array.isArray(errors) ? errors : [errors]; this.extra = extra; }
}

/** An own data field of an options object, never through a getter; undefined when absent. */
function own(o, k) {
  if (!isObj(o)) return undefined;
  let d;
  try { d = Object.getOwnPropertyDescriptor(o, k); } catch { throw new Problem(`The options could not be read (field "${k}"); pass plain data.`); }
  if (!d) return undefined;
  if (!('value' in d)) throw new Problem(`The option "${k}" is a getter; pass plain data.`);
  return d.value;
}

// ---- storage ------------------------------------------------------------------------------------------------------

/** Storage that lives as long as the page. */
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

/** Where the drafts live: { storage, kept }: the browser's localStorage when it can be read (kept: true), else memory for this page (kept: false). Arguments: win (the window, or undefined). */
export function studioStorage(win) {
  try {
    const store = win && win.localStorage;
    if (!store) return { storage: memoryStorage(), kept: false };
    store.getItem(STUDIO_KEY);
    return { storage: store, kept: true };
  } catch { return { storage: memoryStorage(), kept: false }; }
}

// ---- PNG ----------------------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i += 4096) {
    const end = Math.min(bytes.length, i + 4096);
    for (let j = i; j < end; j++) { a += bytes[j]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** zlib data of `raw`: the browser's (or Node's) CompressionStream when there is one and `stream` is true, else stored (uncompressed) deflate blocks. */
async function zlibOf(raw, stream) {
  if (stream && typeof CompressionStream === 'function' && typeof Blob === 'function' && typeof Response === 'function') {
    const out = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78; out[1] = 0x01;
  let o = 2;
  for (let i = 0; i < blocks; i++) {
    const start = i * 65535, len = Math.min(65535, raw.length - start);
    out[o++] = i === blocks - 1 ? 1 : 0;
    out[o++] = len & 255; out[o++] = len >>> 8; out[o++] = ~len & 255; out[o++] = (~len >>> 8) & 255;
    out.set(raw.subarray(start, start + len), o);
    o += len;
  }
  out.set(u32(adler32(raw)), o);
  return out;
}

/**
 * Encodes RGBA pixels as a PNG data address ("data:image/png;base64,..."), the same in the browser and in Node.
 * Arguments: w, h (pixels), rgba (w * h * 4 bytes), opts { stream (default true: compress with CompressionStream when there is one) }.
 */
export async function encodePng(w, h, rgba, { stream = true } = {}) {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const chunk = (type, body) => {
    const td = new Uint8Array(4 + body.length);
    for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i);
    td.set(body, 4);
    return [...u32(body.length), ...td, ...u32(crc32(td))];
  };
  const ihdr = new Uint8Array([...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
  const idat = await zlibOf(raw, stream);
  const head = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', ihdr)]);
  const idatChunk = new Uint8Array(12 + idat.length);
  idatChunk.set(u32(idat.length), 0);
  const td = new Uint8Array(4 + idat.length);
  td.set([73, 68, 65, 84], 0); td.set(idat, 4);
  idatChunk.set(td, 4);
  idatChunk.set(u32(crc32(td)), 8 + idat.length);
  const tail = new Uint8Array(chunk('IEND', new Uint8Array(0)));
  const all = new Uint8Array(head.length + idatChunk.length + tail.length);
  all.set(head, 0); all.set(idatChunk, head.length); all.set(tail, head.length + idatChunk.length);
  let bin = '';
  for (let i = 0; i < all.length; i += 0x8000) bin += String.fromCharCode.apply(null, all.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

// ---- the studio ---------------------------------------------------------------------------------------------------

/**
 * Builds window.loadout.studio: { starts, create, list, get, set, validate, render, advice, toBag, file, remove }.
 * Arguments: env { window (the page; gives storage, the library's ids and sounds), storage and kept (instead of the window's),
 * now (the clock for savedAt), known (async () => { catalogIds, soundIds } or null), sounds (async () => Map of sound id -> patch, for advice),
 * bag (async () => the app/bag.js module, or something with its cleanDefinition and bag), limits (to lower STUDIO_API_LIMITS in tests) }.
 */
export function createStudio(env = {}) {
  const win = env.window ?? null;
  const picked = env.storage ? { storage: env.storage, kept: env.kept !== false } : studioStorage(win ?? undefined);
  const storage = picked.storage, kept = picked.kept;
  const now = typeof env.now === 'function' ? env.now : () => Date.now();
  const limits = { ...STUDIO_API_LIMITS, ...(isObj(env.limits) ? env.limits : {}) };

  // the library's ids and sounds, read once (a failure is said, and nothing is checked against them)
  let knownP = null;
  const known = () => (knownP ??= (async () => {
    try {
      if (env.known) return { ...(await env.known()), problem: null };
      if (!win) return { problem: null };
      const m = await import('./catalog.js');
      await m.loadCatalog();
      const all = m.allAssets();
      return { catalogIds: all.map((a) => a.id), soundIds: all.filter((a) => a.kind !== 'sprite').map((a) => a.id), problem: null };
    } catch (e) {
      knownP = null;
      return { problem: `The library could not be read (${messageOf(e)}), so the id and the sounds were not checked against it.` };
    }
  })());
  const fullOpts = async () => { const k = await known(); return { opts: { ...(k.catalogIds ? { catalogIds: k.catalogIds } : {}), ...(k.soundIds ? { soundIds: k.soundIds } : {}) }, problem: k.problem }; };

  // ---- the store (app/studio-store.js): read again and checked on every call; one entry changed per save, against
  // what storage holds at that moment; a store it cannot read whole is never saved over ----
  const store = createDraftStore(storage, { limits: { drafts: limits.drafts, storeChars: limits.storeChars, readChars: Math.max(STORE_LIMITS.readChars, limits.storeChars) } });
  /** { drafts (draft name -> { definition, savedAt, bagKey? }; an entry that is not an object has no definition, so it reads as damaged), problems, whole, count (every stored entry) }. */
  function read() {
    const r = store.read();
    const problems = [...r.problems], drafts = {};
    let odd = 0;
    for (const [k, e] of Object.entries(r.entries)) {
      if (!DRAFT_RE.test(k)) { if (++odd <= 5) problems.push(`A saved entry ${say(k)} is not a draft name: it is not listed, and is kept as it is.`); continue; }
      drafts[k] = isObj(e) ? { definition: e.definition, savedAt: Number.isFinite(e.savedAt) ? e.savedAt : 0, ...(typeof e.bagKey === 'string' && BAG_KEY_RE.test(e.bagKey) ? { bagKey: e.bagKey } : {}) } : { definition: undefined, savedAt: 0 };
    }
    if (odd > 5) problems.push(`${odd - 5} more saved entries are not draft names, and are kept as they are.`);
    const count = Object.keys(r.entries).length;
    if (count > limits.drafts) problems.push(`${count} drafts are saved, more than the ${limits.drafts} the studio keeps: every one is listed and kept, but no new draft can be made until some are removed (studio_remove).`);
    return { drafts, problems, whole: r.whole, count };
  }
  /** read(), refusing a store that could not be read whole (using it, or saving over it, would lose the drafts in it). */
  function readWhole() {
    const r = read();
    if (!r.whole) throw new Problem(unreadableMessage(r.problems));
    return r;
  }
  /** Changes one stored entry (change(entry now) -> the new entry, or undefined to remove it): { saved, warnings }. */
  function commit(name, change) {
    let w;
    try { w = store.commit(name, change); } catch (e) { throw e instanceof StoreRefused ? new Problem(e.message) : e; }
    if (!w.saved) return w;
    return kept ? w : { saved: false, warnings: [NOT_KEPT] };
  }
  const tooMany = (count) => new Problem(`The studio keeps at most ${limits.drafts} drafts on this computer, and there are ${count}. Remove one you no longer need first (studio_remove), after downloading it (studio_file) if you want to keep it.`);

  /** The cleaned definition of a stored draft, or { errors } when it no longer passes (damaged). Checked without the library, which may have changed since. */
  const checkStored = (entry) => {
    const v = validateDataSprite(entry.definition);
    return v.ok ? { ok: true, value: v.value, warnings: v.warnings } : { ok: false, errors: v.errors };
  };
  const draftName = (draft) => {
    if (typeof draft !== 'string' || !DRAFT_RE.test(draft)) throw new Problem(`A draft is named by its key, as studio_create or studio_list gives it (lowercase letters, digits and dashes, for example "moss-beast"). Got ${say(draft)}.`);
    return draft;
  };
  const noDraft = (draft, drafts) => {
    const names = Object.keys(drafts);
    return new Problem(`There is no draft "${draft}". ${names.length ? `The drafts are: ${names.join(', ')}.` : 'There are no drafts yet: make one with studio_create.'}`);
  };
  /** A draft's entry and its cleaned definition; refuses a missing or damaged one. */
  function draftOf(draft) {
    const name = draftName(draft);
    const { drafts } = readWhole();
    if (!Object.hasOwn(drafts, name)) throw noDraft(name, drafts);
    const c = checkStored(drafts[name]);
    if (!c.ok && usedLibraryBody(drafts[name].definition)) throw new Problem([`The draft "${name}" ${LIBRARY_BODY_GONE.replace(/^This sprite /, '')} Remove it (studio_remove), or start a copy of the library sprite (studio_create from "library:<id>").`]);
    if (!c.ok) throw new Problem([`The draft "${name}" is damaged: what is saved no longer passes the checks, so it is not used. Set it again (studio_set) or remove it (studio_remove).`, ...c.errors]);
    return { name, drafts, entry: drafts[name], value: c.value, warnings: c.warnings };
  }
  /** The cleaned definition of a draft name or of a definition given whole (not kept): { value, warnings, draft }. */
  async function definitionOf(what, opts = {}) {
    if (typeof what === 'string') { const d = draftOf(what); return { value: d.value, warnings: d.warnings, draft: d.name }; }
    if (!isObj(what)) throw new Problem(`Give a draft's name (as studio_list shows it) or a whole definition { "format": "loadout-sprite", ... }. Got ${say(what)}.`);
    const v = validateDataSprite(what, opts);
    if (!v.ok) throw new Problem(v.errors, { warnings: v.warnings });
    return { value: v.value, warnings: v.warnings, draft: null };
  }

  // ---- the bag (S8 adds studio sprites to it; until then toBag says "not yet") ----
  const bagModule = async () => {
    try { return env.bag ? await env.bag() : await import('./bag.js'); } catch { return null; }
  };
  const bagHolds = (m, value) => {
    try { return !!(m && m.bag && typeof m.bag.add === 'function' && typeof m.cleanDefinition === 'function' && m.cleanDefinition('sprite', { data: value })?.data !== undefined); } catch { return false; }
  };
  const inBag = (m, key) => { try { return m.bag.items().some((i) => i.key === key); } catch { return false; } };
  /** Keep a bag item that follows a draft up to date: 'updated', 'not in the bag' (the link is forgotten), or 'not updated'. */
  async function follow(name, value) {
    const { drafts } = read();
    const key = drafts[name]?.bagKey;
    if (!key) return null;
    const m = await bagModule();
    if (!bagHolds(m, value) || typeof m.bag.updateDefinition !== 'function') return 'not updated';
    if (!inBag(m, key)) {
      commit(name, (e) => { if (!isObj(e)) return e; const { bagKey, ...rest } = e; return rest; });
      return 'not in the bag';
    }
    try { m.bag.updateDefinition(key, { data: value }); return 'updated'; } catch { return 'not updated'; }
  }

  /** Validates a definition against the library and keeps it as the draft `name`: { ok, draft, definition, warnings, saved, bag? }. */
  async function keep(name, input, { create = false } = {}) {
    const { opts, problem } = await fullOpts();
    const v = validateDataSprite(input, opts);
    if (!v.ok) throw new Problem(v.errors, { warnings: v.warnings });
    const { count } = readWhole();
    if (create && count >= limits.drafts) throw tooMany(count);
    const savedAt = now();
    // the entry's other fields (the bag link, anything a later version adds) stay as they are
    const w = commit(name, (was) => {
      if (create && was !== undefined) throw new Problem(`A draft "${name}" was saved elsewhere (the studio page or another tab) a moment ago; make yours again.`);
      return { ...(isObj(was) ? was : {}), definition: v.value, savedAt };
    });
    const out = { ok: true, draft: name, definition: v.value, warnings: [...v.warnings, ...(problem ? [problem] : []), ...w.warnings], saved: w.saved };
    const bag = create ? null : await follow(name, v.value);
    if (bag) out.bag = bag;
    if (bag === 'not updated') out.warnings.push('The bag item of this draft could not be updated; put it in the bag again (studio_to_bag).');
    return out;
  }

  // ---- the starting bodies ----
  const starts = () => [...studioTemplates().map((t) => ({ from: `template:${t.id}`, label: t.label, blurb: t.blurb, body: 'bone rig', view: t.view, size: [...t.size], clips: [...t.clips] })), ...v2StartList()];
  /** The definition to start from, and its canonical name. */
  function startFrom(from) {
    const all = () => starts().map((s) => s.from).join(', ');
    if (typeof from !== 'string' || !from) throw new Problem(`from names what to start from: one of ${all()} (studio_starts lists them).`);
    const t = from.startsWith('template:') ? from.slice(9) : from.startsWith('library:') ? null : from;
    const v2 = v2StartFrom(from.startsWith('v2-') ? `template:${from}` : from);
    if (v2) return v2;
    if (t !== null) {
      const d = studioTemplate(t);
      if (d) return { d, from: `template:${t}` };
    }
    throw new Problem(`There is nothing called ${say(from)} to start from. The starts are: ${all()}. A library sprite is started as a copy with "library:<id>" (the library's id of the sprite).`);
  }
  /** A draft key and sprite id from a name: lowercase words joined by dashes, free in the drafts and the library. */
  async function newId(name, drafts) {
    const base = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+/, '').slice(0, 36).replace(/-+$/, '');
    if (!base) throw new Problem(`The name needs at least one letter (a to z) to make the sprite's id from. Got ${say(name)}.`);
    const { catalogIds = [] } = await known();
    const taken = new Set([...Object.keys(drafts), ...catalogIds]);
    for (let n = 1; n < 1000; n++) { const id = n === 1 ? base : `${base}-${n}`; if (!taken.has(id)) return id; }
    throw new Problem('Every id for that name is taken; choose another name.');
  }

  // ---- drawing ----
  /** Draws a definition's frames into one RGBA row: { rgba, W, H, frames, fps, opaque, warnings }. */
  function draw(value, o) {
    const warnings = [];
    const clip = o.clip ?? value.preview;
    if (value.version !== 2 && (typeof clip !== 'string' || !Object.hasOwn(value.clips, clip))) throw new Problem(`There is no clip ${say(o.clip)}. The clips are: ${Object.keys(value.clips).join(', ')}.`);
    const count = value.version === 2 ? 1 : value.clips[clip].frames;
    const one = o.frame !== undefined && o.frame !== null;
    if (value.version !== 2 && one && !(Number.isInteger(o.frame) && o.frame >= 0 && o.frame < count)) throw new Problem(`frame must be a whole number from 0 to ${count - 1} (the clip "${clip}" has ${count} frame${count === 1 ? '' : 's'}); leave it out for the whole clip in one row. Got ${say(o.frame)}.`);
    const scale = o.scale ?? 1;
    if (!(Number.isInteger(scale) && scale >= 1 && scale <= limits.scale)) throw new Problem(`scale must be a whole number from 1 to ${limits.scale}. Got ${say(o.scale)}.`);
    if (value.version === 2) { const r2 = renderV2(value, o, limits); if (!r2.ok) throw new Problem(r2.errors); return r2; }
    if (o.params !== undefined && o.params !== null && !isObj(o.params)) throw new Problem(`params must be an object of settings by control key, for example { "${Object.keys(value.colours ?? {})[0] ?? 'speed'}": "#4f9d57" }. Got ${say(o.params)}.`);
    if (o.bones !== undefined && o.bones !== null && typeof o.bones !== 'boolean') throw new Problem(`bones must be true (draw the skeleton over the picture) or false. Got ${say(o.bones)}.`);
    const frames = one ? [o.frame] : Array.from({ length: count }, (_, f) => f);
    const [fw, fh] = value.size, W = frames.length * fw * scale, H = fh * scale;
    if (W * H > limits.pixels) throw new Problem(`That picture would be ${W} by ${H} pixels, more than the ${limits.pixels.toLocaleString('en')} pixels one picture may have. Ask for one frame, or a smaller scale.`);

    // the sprite: dataSprite draws every body
    const made = makeDataSprite(value);
    if (!made.ok) throw new Problem(made.errors, { warnings: made.warnings });
    const sprite = made.sprite;
    const p = cleanParams(sprite, o.params ?? {});
    for (const k of Object.keys(o.params ?? {})) if (!Object.hasOwn(sprite.params, k)) warnings.push(`"${k}" is not one of this sprite's controls and was ignored. Its controls are: ${Object.keys(sprite.params).join(', ')}.`);
    const rig = value.body?.rig ?? null;

    const px = new Uint32Array(W * H);
    let opaque = 0;
    for (let n = 0; n < frames.length; n++) {
      const f = frames[n];
      let g;
      try {
        g = renderFrame(sprite, clip, f, p);
      } catch (e) { throw new Problem(`Clip "${clip}", frame ${f} could not be drawn: ${messageOf(e)}`); }
      // the frame, enlarged, and the skeleton over it
      let big = { w: fw * scale, h: fh * scale, data: new Uint32Array(fw * scale * fh * scale) };
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const v = g.data[y * fw + x];
        if (v) for (let sy = 0; sy < scale; sy++) big.data.fill(v, (y * scale + sy) * big.w + x * scale, (y * scale + sy) * big.w + x * scale + scale);
      }
      if (o.bones && rig) {
        const r = rig.view === 'top-down' ? directionRig(rig, directionOf(clip)) : rig;
        const S = new Surface(big.w, big.h);
        S.data.set(big.data);
        drawBoneLines(S, solveRig(r, framePose(value, clip, f), drawOptions(value, p)), { scale });
        big = S;
      }
      for (let y = 0; y < big.h; y++) {
        const row = big.data.subarray(y * big.w, (y + 1) * big.w);
        px.set(row, y * W + n * big.w);
        for (let x = 0; x < row.length; x++) if (row[x]) opaque++;
      }
    }
    const fps = clipFps(sprite, clip, p);
    return { clip, frame: one ? o.frame : null, frames: frames.length, W, H, scale, fps, opaque, rgba: new Uint8Array(px.buffer), warnings };
  }

  // ---- the members ----
  const members = {
    starts: async () => ({ ok: true, starts: starts() }),

    create: async (fromOrOptions, nameIn) => {
      const opts = isObj(fromOrOptions) ? fromOrOptions : { from: fromOrOptions, name: nameIn };
      const from = own(opts, 'from'), name = own(opts, 'name');
      // a library data sprite starts as a copy (DQ5); pages with no site to read from only have the templates
      const lib = typeof from === 'string' && (env.libraryText || win) ? await libraryStart(from, { read: env.libraryText, taken: [...Object.keys(read().drafts), ...((await known()).catalogIds ?? [])] }) : null;
      if (lib?.error) throw new Problem(lib.error);
      const s = lib ?? startFrom(from);
      if (name !== undefined && name !== null && typeof name !== 'string') throw new Problem(`name is what the sprite is called, as text of at most ${STUDIO_LIMITS.nameChars} characters ("Moss beast"). Got ${say(name)}.`);
      const label = typeof name === 'string' && name.trim() ? name.trim().replace(/\s+/g, ' ') : s.d.name;
      if (label.length > STUDIO_LIMITS.nameChars) throw new Problem(`The name is ${label.length} characters long; a name is at most ${STUDIO_LIMITS.nameChars}.`);
      const { drafts, count } = readWhole();
      if (count >= limits.drafts) throw tooMany(count);
      const id = await newId(label, drafts);
      const def = { ...s.d, id: lib && !(typeof name === 'string' && name.trim()) ? s.d.id : id, name: label, made: { in: 'studio', from: s.from } };
      return keep(id, def, { create: true });
    },

    list: async () => {
      const { drafts, problems } = read();
      const out = Object.entries(drafts).map(([draft, e]) => {
        const c = checkStored(e);
        const row = { draft, id: c.ok ? c.value.id : null, name: c.ok ? c.value.name : null, savedAt: e.savedAt, state: c.ok ? 'ready' : 'damaged', inBag: !!e.bagKey };
        if (!c.ok) row.errors = c.errors.slice(0, 5);
        return row;
      }).sort((a, b) => b.savedAt - a.savedAt || (a.draft < b.draft ? -1 : 1));
      return { ok: true, drafts: out, kept, saved: !store.pending() && kept, problems };
    },

    get: async (draft) => {
      const d = draftOf(draft);
      return { ok: true, draft: d.name, definition: d.value, savedAt: d.entry.savedAt, inBag: !!d.entry.bagKey, warnings: d.warnings };
    },

    set: async (draft, definition) => {
      const name = draftName(draft);
      const { drafts } = readWhole();
      if (!Object.hasOwn(drafts, name)) throw noDraft(name, drafts);
      return keep(name, definition);
    },

    validate: async (definition) => {
      const { opts, problem } = await fullOpts();
      const v = validateDataSprite(definition, opts);
      return { ok: v.ok, errors: v.errors, warnings: [...v.warnings, ...(problem ? [problem] : [])], value: v.value };
    },

    render: async (what, options) => {
      if (options !== undefined && options !== null && !isObj(options)) throw new Problem(`options must be an object such as { clip: "walk", frame: 0, scale: 4, bones: true }, or left out. Got ${say(options)}.`);
      const o = {};
      for (const k of ['clip', 'frame', 'params', 'scale', 'bones']) o[k] = own(options, k);
      const { value, warnings } = await definitionOf(what);
      const r = draw(value, o);
      const png = await encodePng(r.W, r.H, r.rgba);
      return { ok: true, clip: r.clip, frame: r.frame, frames: r.frames, width: r.W, height: r.H, scale: r.scale, fps: r.fps, pivot: [...value.pivot],opaque: r.opaque, png, warnings: [...warnings, ...r.warnings] };
    },

    advice: async (what) => {
      const { value } = await definitionOf(what);
      const made = makeDataSprite(value);
      if (!made.ok) throw new Problem(made.errors);
      const [{ checkSprite }, { validateMeta }] = await Promise.all([import('../quality/sprite.js'), import('../catalog/schema.js')]);
      let soundIndex = null;
      try {
        if (env.sounds) soundIndex = await env.sounds();
        else if (win) { const r = await fetch(new URL('../generated/sounds.json', import.meta.url)); if (r.ok) soundIndex = new Map((await r.json()).patches.map((x) => [x.id, x])); }
      } catch { soundIndex = null; }
      let r;
      try { r = checkSprite(made.sprite, { validateMeta, ...(soundIndex ? { soundIndex } : {}) }); } catch (e) { throw new Problem(`The quality bar could not look at it: ${messageOf(e)}`); }
      const suggestions = [...r.warnings, ...(soundIndex ? [] : ['The sounds it plays were not checked: the sound library could not be read.'])];
      return { ok: true, passes: r.errors.length === 0, problems: r.errors, suggestions, metrics: plain(r.metrics), note: 'Advice only: a studio sprite goes in the bag and downloads whatever this says. These are what the quality bar asks of a library sprite, which is a data file sprites/<id>.json made with the /sprite-forge skill.' };
    },

    toBag: async (draft) => {
      const d = draftOf(draft);
      const m = await bagModule();
      if (!bagHolds(m, d.value)) throw new Problem(`Not yet: the bag cannot hold a sprite made in the studio until it learns to (studio work item S8). Meanwhile, studio_file gives the draft as a file and studio_render gives pictures.`);
      if (d.entry.bagKey && inBag(m, d.entry.bagKey)) {
        if (typeof m.bag.updateDefinition === 'function') m.bag.updateDefinition(d.entry.bagKey, { data: d.value });
        return { ok: true, draft: d.name, key: d.entry.bagKey, added: false, saved: !store.pending() && kept, warnings: [] };
      }
      const key = m.bag.add({ kind: 'sprite', id: d.value.id, settings: {}, definition: { data: d.value }, draft: d.name });
      if (typeof key !== 'string' || !BAG_KEY_RE.test(key)) throw new Problem('The bag did not take the sprite.');
      const w = commit(d.name, (e) => ({ ...(isObj(e) ? e : d.entry), bagKey: key }));
      return { ok: true, draft: d.name, key, added: true, saved: w.saved, warnings: w.warnings };
    },

    file: async (what) => {
      const { opts, problem } = await fullOpts();
      const { value } = await definitionOf(what, opts);
      if (value.version === 2) { const f2 = fileV2(value, opts); return { ...f2, warnings: [...f2.warnings, ...(problem ? [problem] : [])] }; }
      let F;
      try { F = await import('../catalog/data-file.js'); } catch (e) { throw new Problem(`The file writer (catalog/data-file.js) could not be loaded: ${messageOf(e)}`); }
      const w = F.writeDataFile(value, opts);
      if (!w.ok) throw new Problem(w.errors, { warnings: w.warnings });
      const strict = F.writeDataFile(value, { ...opts, strict: true });
      // a version 1 definition is the studio's own form: the library refuses its .js file (build item R4a), whatever the strict check says
      const closed = `The library takes only a data sprite (sprites/${value.id}.json, format "loadout-sprite", version 2), made with the /sprite-forge skill; it refuses this version 1 studio file (${w.name}). Keep the file as your own copy.`;
      return { ok: true, name: w.name, text: w.text, warnings: [...w.warnings, ...(problem ? [problem] : [])], library: { ok: false, errors: [closed, ...strict.errors] } };
    },

    remove: async (draft) => {
      const name = draftName(draft);
      const { drafts } = readWhole();
      if (!Object.hasOwn(drafts, name)) throw noDraft(name, drafts);
      const gone = drafts[name];
      const w = commit(name, () => undefined);
      return { ok: true, draft: name, removed: true, saved: w.saved, warnings: [...w.warnings, ...(gone.bagKey ? ['Its bag item stays in the bag; take it out on the bag page or with bag_remove.'] : [])] };
    },
  };

  // every member never throws: a Problem is the caller's message, anything else is said plainly
  const safe = (fn) => async (...args) => {
    try { await preloadPieces(storage, STUDIO_KEY, args); return plain(await fn(...args)); } catch (e) {
      if (e instanceof Problem) return { ok: false, errors: e.errors.map(String), ...(e.extra?.warnings?.length ? { warnings: e.extra.warnings } : {}) };
      return { ok: false, errors: [`The studio could not finish this: ${messageOf(e)}`] };
    }
  };
  return Object.fromEntries(Object.entries(members).map(([k, fn]) => [k, safe(fn)]));
}
