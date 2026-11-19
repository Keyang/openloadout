// The library file form of a studio sprite (docs/studio.md 2.4 and section 8, item S7; docs/architecture.md,
// Contract 14 rule 8). A sprite made in the studio goes into the library as sprites/<id>.js, so the site and every tool
// load it as they load any sprite, but the file is data. It has exactly this form and nothing else:
//
//   // Made in the Loadout studio. This file is data: open it in the studio (#/studio, "Open a file") to change it.
//   import { dataSprite } from '../engine/data-sprite.js';
//   export default dataSprite({
//     "format": "loadout-sprite",
//     ...the cleaned definition as JSON: one bone, shape or key per line...
//   });
//
// writeDataFile() makes that text from a definition (validated first, written from the cleaned copy, read back before
// it is returned). readDataFile() reads such a text back to its JSON WITHOUT RUNNING IT: the three lines must be exactly
// these, what sits between `dataSprite(` and the final `);` must parse as JSON on its own (so there is no room for code:
// JSON has no calls, names, comments or operators), and no key may be __proto__, constructor or prototype (a JavaScript
// object literal reads __proto__ differently from JSON). Any text that parses as such JSON is, as JavaScript, exactly
// the same object literal, so importing the module runs nothing but dataSprite on that data.
//
// The build (tools/lib/assets.mjs loadSprites) calls checkDataFile() on every sprite file before importing it: a file
// that carries the studio comment ("Made in the Loadout studio", anywhere in it) must be exactly this form and its
// definition must pass validation in strict mode (route 1: gaps in meta are errors for a library file only; the studio,
// the bag and export do not use strict). Otherwise the build stops with a plain message naming the file.
// A file without the studio comment is an ordinary sprite program and is left to the ordinary checks.
//
// Pure (no Node imports, no DOM), so the studio page can use the writer in the browser too.

import { validateDataSprite } from '../../engine/data-sprite.js';
import { STUDIO_LIMITS } from '../../catalog/studio-schema.js';

/** The words that mark a sprite file as made in the studio: a file holding them anywhere claims the studio form. */
export const STUDIO_MARK = 'Made in the Loadout studio';

/** Line 1 of a studio library file, exactly. */
export const STUDIO_HEADER = `// ${STUDIO_MARK}. This file is data: open it in the studio (#/studio, "Open a file") to change it.`;

/** Line 2 of a studio library file, exactly. */
export const STUDIO_IMPORT = "import { dataSprite } from '../engine/data-sprite.js';";

/** How line 3 of a studio library file starts; the JSON follows, then `);` ends the file. */
export const STUDIO_CALL = 'export default dataSprite(';

/** The most characters a studio library file may have (64 KB of JSON plus the line breaks and indents the writer adds). */
export const FILE_CHARS = 512 * 1024;

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const INLINE_DEPTH = 4;     // objects and lists this deep (a bone, a shape, a key) are written on one line
const INLINE_CHARS = 72;    // and so is anything shorter than this as compact JSON (a size, a list of words)
const FORM = `the comment "// ${STUDIO_MARK}...", one import of dataSprite, then export default dataSprite(<JSON>);`;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const kb = (n) => `${Math.ceil(n / 1024)} KB`;
const msg = (e) => String(e?.message ?? e).slice(0, 160);

/** JSON text with the top levels on their own lines and everything deeper (or short) on one line each. */
function formatJson(v, depth = 0) {
  const flat = JSON.stringify(v);
  if (v === null || typeof v !== 'object' || depth >= INLINE_DEPTH || flat.length <= INLINE_CHARS) return flat;
  const pad = '  '.repeat(depth + 1), end = '  '.repeat(depth);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + formatJson(x, depth + 1)).join(',\n')}\n${end}]` : '[]';
  const keys = Object.keys(v);
  return keys.length ? `{\n${keys.map((k) => `${pad}${JSON.stringify(k)}: ${formatJson(v[k], depth + 1)}`).join(',\n')}\n${end}}` : '{}';
}

/** Deepest nesting of lists and objects in JSON text, counted without parsing it (strings skipped); stops early. */
function nestingOf(s, stopAt) {
  let depth = 0, most = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inStr) { if (c === 92) i++; else if (c === 34) inStr = false; continue; }
    if (c === 34) inStr = true;
    else if (c === 123 || c === 91) { if (++depth > most) { most = depth; if (most > stopAt) return most; } }
    else if (c === 125 || c === 93) depth--;
  }
  return most;
}

/** The file name a sprite file path ends in, without ".js" (sprites/moss-newt.js -> moss-newt), or null. */
function idOfFile(file) {
  if (typeof file !== 'string') return null;
  const base = file.split(/[\\/]/).pop();
  return base.endsWith('.js') ? base.slice(0, -3) : null;
}

/**
 * Whether a sprite file's text claims to be a studio library file: it holds the studio mark (STUDIO_MARK) anywhere.
 * Arguments: text (the file's text).
 */
export function claimsStudioForm(text) {
  return typeof text === 'string' && text.includes(STUDIO_MARK);
}

/**
 * Reads a studio library file back to its definition without running it. Returns { ok, errors, warnings, value }: value is
 * the JSON inside dataSprite(...) when the file has exactly the fixed form (null otherwise, and then nothing else is
 * checked); ok also needs that JSON to pass validation and, when the file name is known, its id to match the name. Never throws.
 * Arguments: text (the file's text), opts { file (its path, e.g. "sprites/moss-newt.js": the id must match it), strict,
 * soundIds, catalogIds (passed to engine/data-sprite.js validateDataSprite) }.
 */
export function readDataFile(text, opts = {}) {
  const errors = [], warnings = [];
  const done = (value = null) => ({ ok: errors.length === 0 && value !== null, errors, warnings, value });
  try {
    if (typeof text !== 'string') { errors.push(`A studio file is text; got ${text === null ? 'null' : typeof text}`); return done(); }
    if (text.length > FILE_CHARS) { errors.push(`The file is ${kb(text.length)}; a studio file is at most ${kb(FILE_CHARS)} (64 KB of JSON)`); return done(); }
    let t = text.replace(/\r\n/g, '\n');
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    const nl1 = t.indexOf('\n');
    const nl2 = nl1 < 0 ? -1 : t.indexOf('\n', nl1 + 1);
    if (nl1 < 0 || t.slice(0, nl1) !== STUDIO_HEADER) { errors.push(`Line 1 must be the studio comment, exactly: ${STUDIO_HEADER}`); return done(); }
    if (nl2 < 0 || t.slice(nl1 + 1, nl2) !== STUDIO_IMPORT) { errors.push(`Line 2 must be exactly: ${STUDIO_IMPORT} (one import, nothing else)`); return done(); }
    let rest = t.slice(nl2 + 1);
    if (!rest.startsWith(STUDIO_CALL)) { errors.push(`Line 3 must start with ${STUDIO_CALL} (the definition follows as JSON)`); return done(); }
    rest = rest.slice(STUDIO_CALL.length);
    if (rest.endsWith('\n')) rest = rest.slice(0, -1);
    if (!rest.endsWith(');')) { errors.push('The file must end with the ); that closes dataSprite( and have nothing after it'); return done(); }
    const middle = rest.slice(0, -2);
    if (nestingOf(middle, STUDIO_LIMITS.nesting) > STUDIO_LIMITS.nesting) { errors.push(`The definition is nested more than ${STUDIO_LIMITS.nesting} levels deep (lists inside lists); a definition never needs that`); return done(); }
    const proto = new Set();
    let value;
    try {
      value = JSON.parse(middle, (k, v) => { if (PROTO_KEYS.has(k)) { proto.add(k); return undefined; } return v; });
    } catch (e) {
      // the parser counts lines from the start of the JSON, which is line 3 of the file
      const where = msg(e).replace(/ at position \d+ \(line (\d+) column (\d+)\)/, (_, l, c) => ` on line ${+l + 2} of the file, column ${l === '1' ? +c + STUDIO_CALL.length : c}`);
      errors.push(`What is between dataSprite( and the final ); is not only JSON (a studio file holds data, never code): ${where}`);
      return done();
    }
    if (proto.size) { errors.push(`The definition holds a key named ${[...proto].join(', ')}; JavaScript reads such names differently from JSON, so a studio file may not use __proto__, constructor or prototype as a name`); return done(); }
    if (!isObj(value)) { errors.push(`The definition inside dataSprite( ) must be an object { "format": "loadout-sprite", ... }; got ${Array.isArray(value) ? 'a list' : value === null ? 'null' : typeof value}`); return done(); }
    const { file, ...vopts } = opts ?? {};
    const v = validateDataSprite(value, vopts);
    errors.push(...v.errors); warnings.push(...v.warnings);
    const want = idOfFile(file);
    if (want !== null && value.id !== want) errors.push(`The id inside is ${JSON.stringify(value.id)} but the file is named ${want}.js; a sprite file is named after its id`);
    return done(value);
  } catch (e) {
    errors.push(`The file could not be read: ${msg(e)}`);
    return done();
  }
}

/**
 * Writes a studio definition as the text of its library file, sprites/<id>.js, in the one fixed form. Returns
 * { ok, errors, warnings, name, text } (name "<id>.js"; name and text null when not ok); never throws. The definition is
 * validated and the cleaned copy is written; the text is read back before it is returned.
 * Arguments: definition (a loadout-sprite, an object or JSON text), opts { strict (refuse gaps the library would refuse;
 * without it they are warnings), soundIds, catalogIds (as engine/data-sprite.js validateDataSprite takes them) }.
 */
export function writeDataFile(definition, opts = {}) {
  const fail = (errors, warnings = []) => ({ ok: false, errors, warnings, name: null, text: null });
  try {
    const v = validateDataSprite(definition, opts ?? {});
    if (!v.ok) return fail(v.errors, v.warnings);
    const name = `${v.value.id}.js`;
    const text = `${STUDIO_HEADER}\n${STUDIO_IMPORT}\n${STUDIO_CALL}${formatJson(v.value)});\n`;
    const back = readDataFile(text, { ...(opts ?? {}), file: `sprites/${name}` });
    if (!back.ok) return fail(back.errors, v.warnings);
    return { ok: true, errors: [], warnings: v.warnings, name, text };
  } catch (e) {
    return fail([`The definition could not be written: ${msg(e)}`]);
  }
}

/**
 * The build's check of one sprite file, done before the file is imported: returns null for a file that does not claim the
 * studio form (an ordinary sprite program), the definition for a studio file of exactly the fixed form whose definition
 * passes strict validation, and throws an Error whose message starts with the file's name otherwise.
 * Arguments: text (the file's text), file (its path as shown, e.g. "sprites/moss-newt.js"), opts (as readDataFile takes them; strict defaults to true).
 */
export function checkDataFile(text, file, opts = {}) {
  if (!claimsStudioForm(text)) return null;
  const r = readDataFile(text, { strict: true, ...(opts ?? {}), file });
  if (r.ok) return r.value;
  const shown = r.errors.slice(0, 8).join('; ') + (r.errors.length > 8 ? `; and ${r.errors.length - 8} more` : '');
  throw new Error(`${file}: this file says it was made in the Loadout studio, so it must be exactly the studio's form (${FORM}) holding a definition the library takes, and it is not. ${shown}. Make the file again from the studio (Download, "File for the library") instead of editing it by hand.`);
}
