#!/usr/bin/env node
// The pieces index and the Node side of loading pieces (docs/data-sprites.md, build-plan item B7; engine/pieces.js
// says what a piece is). There is no list of pieces: every file in pieces/ named <kind>-<name>.v<v>.json is one.
//
//   generated/pieces.json   { format: "loadout-pieces", version: 1, pieces: [{ ref, id, kind, v, file, name, about,
//                           slots, args, uses, latest, bytes, hash }] } sorted by id, then version. The site reads it
//                           to list pieces (studio, context.mjs pieces); the v2 schema checks `use` against it
//   pieces/_pins.json       { about, pins: { "<kind>:<name>@<v>": "<hash>" } }: the released versions. A pinned
//                           version whose content changes fails tests/unit/pieces-index.test.mjs, so a released
//                           version never changes (Contract 15 rule 5). A pin outlives its file, so a deleted
//                           version can never come back with other content. Written only by --pin, which adds
//                           and never rewrites
//
//   node tools/lib/pieces-index.mjs [--root <dir>]            check every piece and print the index in short
//   node tools/lib/pieces-index.mjs --write                   also write generated/pieces.json (the build does this)
//   node tools/lib/pieces-index.mjs --pin                     pin every valid version not pinned yet
//   node tools/lib/pieces-index.mjs --check                   exit 1 on a bad file, a changed pin or a version not pinned
//
// In Node, pieces are read from the disk (nodePieceReader), and the index is always the folder as it is now, never
// a stale generated file. pieceFilesFor(definition) lists the piece files a definition loads, for cache keys.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validatePiece, indexEntry, refOfFile, usesOf, parsePieceRef, checkPieceUses, createPieceStore, sitePieces } from '../../engine/pieces.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const INDEX_FILE = 'generated/pieces.json';
export const PINS_FILE = 'pieces/_pins.json';
const PINS_ABOUT = 'Released piece versions and the hash of their content. Added by node tools/lib/pieces-index.mjs --pin; never edit or remove a line: a changed look is a new version.';

/** Files in pieces/ that are not pieces: notes for people and files whose name starts with _ or a dot. */
const notAPiece = (f) => f.startsWith('_') || f.startsWith('.') || f.endsWith('.md');

/** JSON text of a value with every object's keys sorted, so the same content always gives the same text. */
export function canonicalJson(x) {
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(x[k])}`).join(',')}}`;
  return JSON.stringify(x);
}

/** The hash of a piece's content (16 hex characters of SHA-256 over its canonical JSON): spacing and key order do not count. */
export function pieceHash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 16);
}

/**
 * Scans <root>/pieces, checks every piece file (engine/pieces.js validatePiece, with the body hook `check` when
 * given) and what each uses against the rest. Returns { index, errors, warnings }: the index holds the valid pieces
 * only; errors start with the file they are about. Arguments: { root, check }.
 */
export function buildPiecesIndex({ root = ROOT, check = null } = {}) {
  const dir = path.join(root, 'pieces');
  const errors = [], warnings = [];
  const rows = [], bodies = new Map();
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  for (const f of names) {
    if (notAPiece(f)) continue;
    const rel = `pieces/${f}`;
    if (fs.statSync(path.join(dir, f)).isDirectory()) { errors.push(`${rel}: pieces/ holds piece files only, no folders`); continue; }
    const named = refOfFile(f);
    if (!named.ok) { errors.push(`${rel}: ${named.error}`); continue; }
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const res = validatePiece(text, { file: f, check });
    if (!res.ok) { for (const e of res.errors) errors.push(`${rel}: ${e}`); continue; }
    for (const w of res.warnings) warnings.push(`${rel}: ${w}`);
    rows.push({ ...indexEntry(res.piece), bytes: Buffer.byteLength(text), hash: pieceHash(JSON.parse(text)) });
    bodies.set(named.ref, res.piece);
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.v - b.v));
  const top = new Map();
  for (const r of rows) top.set(r.id, Math.max(top.get(r.id) || 0, r.v));
  for (const r of rows) r.latest = top.get(r.id) === r.v;
  const index = { format: 'loadout-pieces', version: 1, pieces: rows };
  // what each piece uses must exist, fit, and make no loop; a piece that fails this stays listed (its file is fine) and the error stops the build
  for (const r of rows) {
    const c = checkPieceUses({ slots: bodies.get(r.ref).slots, body: bodies.get(r.ref).body }, index);   // its own slots are what its uses bind to by name
    for (const e of c.errors) errors.push(`${r.file}: ${e}`);
    for (const w of c.warnings) warnings.push(`${r.file}: ${w}`);
  }
  return { index, errors, warnings };
}

/** Writes generated/pieces.json when every piece is valid. Returns { count, errors, warnings, file } (file null when not written). Arguments: { root, check }. */
export function writePiecesIndex({ root = ROOT, check = null } = {}) {
  const { index, errors, warnings } = buildPiecesIndex({ root, check });
  if (errors.length) return { count: index.pieces.length, errors, warnings, file: null };
  const out = path.join(root, INDEX_FILE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(index, null, 1)}\n`);
  return { count: index.pieces.length, errors, warnings, file: INDEX_FILE };
}

/** The pinned versions, { "<ref>": "<hash>" } ({} when there is no pins file). Arguments: root. */
export function readPins(root = ROOT) {
  const f = path.join(root, PINS_FILE);
  if (!fs.existsSync(f)) return {};
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  return j && typeof j.pins === 'object' && j.pins ? { ...j.pins } : {};
}

/** Compares the index with the pins: { changed (pinned, content differs), unpinned (no pin yet), gone (pinned, file deleted) }, each sorted. */
export function checkPins(index, pins) {
  const have = new Map(index.pieces.map((p) => [p.ref, p.hash]));
  const changed = [], unpinned = [], gone = [];
  for (const [ref, hash] of have) { if (!(ref in pins)) unpinned.push(ref); else if (pins[ref] !== hash) changed.push(ref); }
  for (const ref of Object.keys(pins)) if (!have.has(ref)) gone.push(ref);
  return { changed: changed.sort(), unpinned: unpinned.sort(), gone: gone.sort() };
}

/** Pins every valid version that has no pin yet, never rewriting or dropping a pin. Returns the refs added. Arguments: { root, check }. */
export function pinPieces({ root = ROOT, check = null } = {}) {
  const { index } = buildPiecesIndex({ root, check });
  const pins = readPins(root);
  const added = checkPins(index, pins).unpinned;
  if (!added.length) return [];
  const byRef = new Map(index.pieces.map((p) => [p.ref, p.hash]));
  for (const ref of added) pins[ref] = byRef.get(ref);
  const sorted = Object.fromEntries(Object.keys(pins).sort().map((k) => [k, pins[k]]));
  fs.mkdirSync(path.join(root, 'pieces'), { recursive: true });
  fs.writeFileSync(path.join(root, PINS_FILE), `${JSON.stringify({ about: PINS_ABOUT, pins: sorted }, null, 2)}\n`);
  return added;
}

/**
 * A reader of the site's files from the disk, for a piece store in Node: read(rel) -> Promise<text>. Refuses a path
 * outside root. generated/pieces.json is answered from the folder as it is now (freshIndex, on by default).
 * Arguments: root, { freshIndex, check }.
 */
export function nodePieceReader(root = ROOT, { freshIndex = true, check = null } = {}) {
  const base = path.resolve(root);
  return async (rel) => {
    const abs = path.resolve(base, String(rel));
    if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error(`${rel}: outside the site's folder`);
    if (freshIndex && rel === INDEX_FILE) return JSON.stringify(buildPiecesIndex({ root: base, check }).index);
    try { return await fs.promises.readFile(abs, 'utf8'); } catch (e) { throw new Error(`${rel}: could not be read (${e.code || e.message})`); }
  };
}

/** A piece store that reads from the disk, with the index built fresh from the folder. Arguments: { root, check }. */
export function nodePieceStore({ root = ROOT, check = null } = {}) {
  return createPieceStore({ read: nodePieceReader(root, { check }), check, index: () => buildPiecesIndex({ root, check }).index });
}

/** Gives the site's one store (engine/pieces.js sitePieces) a disk reader, so code written for the page runs in Node. Returns the store. Arguments: root. */
export function installNodePieces(root = ROOT) {
  const store = sitePieces();
  store.useReader(nodePieceReader(root));
  return store;
}

/**
 * The piece files a definition loads, with what they use in turn, read from the disk: { files, missing }, relative
 * to root and sorted. For cache keys (the quality cache and thumbnails must re-check a sprite when a piece it uses
 * changes; a missing file is listed so that adding it changes the key). Arguments: definition, { root }.
 */
export function pieceFilesFor(definition, { root = ROOT } = {}) {
  const files = new Set(), missing = new Set();
  const queue = usesOf(definition).filter((u) => u.ref).map((u) => u.ref);
  const seen = new Set();
  while (queue.length && seen.size < 512) {
    const ref = queue.shift();
    if (seen.has(ref)) continue;
    seen.add(ref);
    const r = parsePieceRef(ref);
    const abs = path.join(root, r.file);
    if (!fs.existsSync(abs)) { missing.add(r.file); continue; }
    files.add(r.file);
    let body = null;
    try { body = JSON.parse(fs.readFileSync(abs, 'utf8')).body; } catch { continue; }
    for (const u of usesOf(body)) if (u.ref && !seen.has(u.ref)) queue.push(u.ref);
  }
  return { files: [...files].sort(), missing: [...missing].sort() };
}

// ---- command line ------------------------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--root');
  const root = at >= 0 ? path.resolve(args[at + 1] || '.') : ROOT;
  const { index, errors, warnings } = buildPiecesIndex({ root });
  for (const p of index.pieces) console.log(`${p.ref.padEnd(36)} ${p.latest ? 'latest' : '      '} ${p.name} (${p.bytes} bytes)`);
  console.log(`${index.pieces.length} pieces in ${path.relative(process.cwd(), path.join(root, 'pieces')) || 'pieces'}`);
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  if (args.includes('--pin')) {
    const added = pinPieces({ root });
    console.log(added.length ? `pinned: ${added.join(', ')}` : 'nothing new to pin');
  }
  const pins = checkPins(index, readPins(root));
  for (const r of pins.changed) console.error(`error: ${r} is pinned and its content changed; put the change in a new version instead`);
  for (const r of pins.unpinned) if (!args.includes('--pin')) console.log(`not pinned yet: ${r} (node tools/lib/pieces-index.mjs --pin when it is released)`);
  if (args.includes('--write')) {
    const w = writePiecesIndex({ root });
    console.log(w.file ? `wrote ${w.file}` : 'did not write the index: fix the errors first');
  }
  const pinsNow = checkPins(buildPiecesIndex({ root }).index, readPins(root));
  if (args.includes('--check') && (errors.length || pinsNow.changed.length || pinsNow.unpinned.length)) process.exit(1);
  if (errors.length) process.exitCode = 1;
}
