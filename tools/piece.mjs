#!/usr/bin/env node
// What the pieces are (pieces/<kind>-<name>.v<v>.json; docs/data-sprites.md sections 3.3, 5 and 8 'Check', Contract 15
// rule 5; build item B9), as tables and contact sheets, so a data sprite names one knowing what it gives. Read from
// the disk through tools/lib/pieces-index.mjs; never edits anything.
//
//   node tools/piece.mjs                       every piece: ref, newest or not, released (pinned) or not, its name
//   node tools/piece.mjs <kind:name>[@v]       its table: file, what it is, slots (id, label, colour, material), args,
//                                              what it uses, the data sprites (sprites/*.json) and pieces using it,
//                                              whether it is released and unchanged, and a `use` to copy
//   node tools/piece.mjs <piece> --sheet       out/piece-<kind>-<name>@<v>.png, a contact sheet (part, held, stamp):
//                                                row 1  the piece at its own colours
//                                                row 2  each slot in turn painted bright pink, to show what it paints
//                                                then   one row per arg that has a range or options, across it
//       --root <dir>   another copy of the project (default: this one)   --size 32   the cell size   --scale 4   --out <dir>
// A base, skin, material or font piece is drawn through its body's layout, not alone: the table says what it holds.
// <piece> without @v is its newest version. Exit 1 for an unknown piece or a pieces/ that has errors (listed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPiecesIndex, readPins, installNodePieces } from './lib/pieces-index.mjs';
import { parsePieceRef, usesOf } from '../engine/pieces.js';
import { sheetCell, cellFrames, sheetPng, SHEET_COLOURS, SWAP_COLOUR } from './lib/data-sheet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The kinds of piece a sheet draws alone, as a `use` in a picture. */
export const DRAWN_KINDS = Object.freeze(['part', 'held', 'stamp']);

/** The index row of "<kind:name>" (newest version) or "<kind:name>@<v>" in index: { row } or { error } naming what is known. */
export function findPiece(index, name) {
  const m = /^(.+?)(?:@(\d+))?$/.exec(String(name));
  const id = m[1], v = m[2] === undefined ? null : Number(m[2]);
  const rows = index.pieces.filter((p) => p.id === id);
  if (!rows.length) return { error: `no piece "${id}". Known: ${index.pieces.map((p) => p.ref).join(', ') || '(none: pieces/ is empty)'}` };
  const row = v === null ? rows.find((r) => r.latest) : rows.find((r) => r.v === v);
  return row ? { row } : { error: `${id} has versions ${rows.map((r) => r.v).join(', ')}, not ${v}` };
}

/** Whether a version is released: 'released, unchanged', 'released, CHANGED since (put the change in a new version)', or 'not released yet'. */
export function pinState(row, pins) {
  if (!(row.ref in pins)) return 'not released yet (node tools/lib/pieces-index.mjs --pin when it is)';
  return pins[row.ref] === row.hash ? 'released, unchanged' : 'released, CHANGED since it was released: put the change in a new version and put this one back';
}

/** The data sprites of a project naming a piece (sprites/*.json, by usesOf): [ids], sorted. */
export function spritesUsing(root, ref) {
  const dir = path.join(root, 'sprites');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
    let def;
    try { def = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (usesOf(def).some((u) => u.ref === ref)) out.push(f.slice(0, -5));
  }
  return out;
}

/** The table of one piece as lines of text. Arguments: root, index, row, pins. */
export function pieceTable(root, index, row, pins) {
  const by = index.pieces.filter((p) => (p.uses ?? []).includes(row.ref)).map((p) => p.ref);
  const users = spritesUsing(root, row.ref);
  const paint = Object.fromEntries(row.slots.map((s) => [s.id, '<slot>']));
  const defaults = Object.fromEntries(Object.entries(row.args ?? {}).filter(([, a]) => a && a.default !== undefined).map(([k, a]) => [k, a.default]));
  const use = { kind: 'use', use: row.id, v: row.v, ...(row.kind === 'stamp' ? { at: [0, 0] } : { on: '<node>' }), paint, ...(Object.keys(defaults).length ? { args: defaults } : {}) };
  const w = Math.max(4, ...row.slots.map((s) => s.id.length));
  return [
    `${row.ref}  (${row.kind})  ${row.name}: ${row.about}`,
    `  file: ${row.file}    ${row.latest ? 'the newest version' : 'not the newest version'}    ${row.bytes} bytes`,
    `  ${pinState(row, pins)}`,
    '  slots:',
    ...row.slots.map((s) => `    ${s.id.padEnd(w)}  ${String(s.label ?? '').padEnd(12)}  ${(s.default ?? '(the use paints it)').padEnd(19)}  ${s.material ?? ''}`.trimEnd()),
    `  args: ${Object.entries(row.args ?? {}).map(([k, a]) => `${k} (${a.type}${a.lo !== undefined ? ` ${a.lo}..${a.hi}` : ''}${a.values ? ` ${a.values.join('|')}` : ''}${a.default !== undefined ? `, default ${JSON.stringify(a.default)}` : ''})`).join(', ') || 'none'}`,
    `  uses: ${(row.uses ?? []).join(', ') || 'nothing'}`,
    `  used by: ${[...users.map((id) => `${id} (sprites/${id}.json)`), ...by].join(', ') || 'nothing yet'}`,
    `  use it: ${JSON.stringify(use).replace(/,"/g, ', "').replace(/":/g, '": ')}`,
  ];
}

/** The values a sheet row shows for one of a piece's args (as written in its file), or null when it is not varied. A px or count arg takes whole numbers. */
function argValues(a) {
  if (Array.isArray(a.values)) return a.values.slice(0, 8);
  if (a.type === 'flag') return [false, true];
  if (typeof a.lo === 'number' && typeof a.hi === 'number') {
    if (a.type === 'count' && a.hi - a.lo <= 7) return Array.from({ length: a.hi - a.lo + 1 }, (_, i) => a.lo + i);
    const whole = a.type === 'px' || a.type === 'count';
    const mid = whole ? Math.round((a.lo + a.hi) / 2) : Math.round(((a.lo + a.hi) / 2) * 100) / 100;
    return [...new Set([a.lo, mid, a.hi])];
  }
  return null;
}

/**
 * The contact sheet of one piece: { png, w, h, legend, errors, cells (the rows of Surfaces, null where one failed) }, or
 * { notDrawn: reason } for a kind not drawn alone. An arg row hands each value to the use as `args: { <arg>: value }`
 * (engine/resolve.js reads use.args), the others at their defaults.
 * The piece and what it uses must be loaded in the site's piece store first (installNodePieces, then loadFor).
 * Arguments: row (its index row), { size ([w, h]), scale }.
 */
export function pieceSheet(row, { size = [32, 32], scale = 4 } = {}) {
  if (!DRAWN_KINDS.includes(row.kind)) return { notDrawn: `${row.ref} is a ${row.kind} piece: it is drawn through its body's layout, not alone` };
  const slots = row.slots.map((s, i) => ({ id: s.id, label: s.label, default: s.default ?? SHEET_COLOURS[i % SHEET_COLOURS.length].hex, material: s.material ?? SHEET_COLOURS[i % SHEET_COLOURS.length].material }));
  const paint = Object.fromEntries(slots.map((s) => [s.id, s.id]));
  const centre = [Math.floor(size[0] / 2), Math.floor(size[1] / 2)];
  const errors = [], legend = [], rows = [];
  const cell = (useArgs, cellSlots) => {
    const args = Object.keys(useArgs).length ? { args: useArgs } : {};
    const draw = row.kind === 'stamp'
      ? [{ kind: 'use', use: row.id, v: row.v, at: centre, paint, ...args }]
      : [{ kind: 'use', use: row.id, v: row.v, on: 'here', paint, ...args }];
    const c = sheetCell({ size, slots: cellSlots, draw, frames: 1, nodes: [{ id: 'here', parent: null, at: centre }] });
    if (!c.ok) errors.push(`${JSON.stringify(useArgs)}: ${c.errors.slice(0, 3).join('; ')}`);
    return cellFrames(c, 1)[0];
  };
  rows.push([cell({}, slots)]);
  legend.push('row 1  its own colours');
  if (slots.length) {
    rows.push(slots.map((s) => cell({}, slots.map((x) => (x.id === s.id ? { ...x, default: SWAP_COLOUR } : x)))));
    legend.push(`row 2  pink in turn: ${slots.map((s) => s.id).join(', ')}`);
  }
  for (const [k, a] of Object.entries(row.args ?? {})) {
    const values = argValues(a);
    if (!values) continue;
    rows.push(values.map((v) => cell({ [k]: v }, slots)));
    legend.push(`row ${rows.length}  ${k}: ${values.map((v) => JSON.stringify(v)).join(', ')}`);
  }
  return { ...sheetPng(rows, { cell: size, scale }), legend, errors, cells: rows };
}

// ---- command line ----------------------------------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const VALUE = new Set(['--root', '--size', '--scale', '--out']);
  const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
  const root = path.resolve(flag('root', ROOT));
  const name = args.find((a, i) => !a.startsWith('--') && !VALUE.has(args[i - 1]));
  const { index, errors } = buildPiecesIndex({ root });
  for (const e of errors) console.error(`error: ${e}`);
  let pins = {};
  try { pins = readPins(root); } catch (e) { console.error(`error: pieces/_pins.json: ${e.message}`); }
  if (!name) {
    const w = Math.max(4, ...index.pieces.map((p) => p.ref.length));
    for (const p of index.pieces) console.log(`${p.ref.padEnd(w)}  ${p.latest ? 'newest' : '      '}  ${(p.ref in pins ? (pins[p.ref] === p.hash ? 'released' : 'CHANGED') : 'not released').padEnd(12)}  ${p.name}`);
    console.log(`${index.pieces.length} pieces in ${path.relative(process.cwd(), path.join(root, 'pieces')) || 'pieces'} (node tools/piece.mjs <piece> for one, --sheet to see it)`);
    process.exit(errors.length ? 1 : 0);
  }
  const found = findPiece(index, name);
  if (found.error) { console.error(found.error); process.exit(1); }
  for (const l of pieceTable(root, index, found.row, pins)) console.log(l);
  if (args.includes('--sheet')) {
    const n = Number(flag('size', 32)), scale = Number(flag('scale', 4));
    if (!(n >= 8 && n <= 256) || !(scale >= 1 && scale <= 16)) { console.error('--size takes 8 to 256, --scale 1 to 16'); process.exit(1); }
    if (!DRAWN_KINDS.includes(found.row.kind)) { console.log(pieceSheet(found.row).notDrawn); process.exit(errors.length ? 1 : 0); }
    const store = installNodePieces(root);
    try { await store.load(parsePieceRef(found.row.ref).ref); } catch (e) { console.error(`could not load ${found.row.ref}: ${e.message}`); process.exit(1); }
    const s = pieceSheet(found.row, { size: [n, n], scale });
    const out = path.resolve(flag('out', path.join(ROOT, 'out')));
    fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, `piece-${found.row.kind}-${found.row.id.slice(found.row.kind.length + 1)}@${found.row.v}.png`);
    fs.writeFileSync(file, s.png);
    for (const l of s.legend) console.log(l);
    for (const e of s.errors) console.log(`could not draw ${e}`);
    console.log(`wrote ${path.relative(process.cwd(), file) || file} (${s.w}x${s.h})`);
    if (s.errors.length) { console.log(`${s.errors.length} cell${s.errors.length === 1 ? '' : 's'} could not be drawn (left empty on the sheet)`); process.exitCode = 1; }
  }
  if (errors.length) process.exitCode = 1;
}
