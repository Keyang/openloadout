#!/usr/bin/env node
// Writes the library's background data files from their writers (tools/backdrops/<id>.mjs; see tools/backdrops/lib.mjs).
//
//   node tools/backdrops/write.mjs [<id> ...]        writes sprites/<id>.json (all five when no id is named)
//   node tools/backdrops/write.mjs --check [<id>]    writes nothing; exits 1 naming each file that differs from its writer
//
// Every definition is checked with catalog/sprite-schema.js validateSprite before it is written, and --check checks the
// file on disk the same way: a writer's slip never reaches sprites/ (review of M10b, issue 6).
//
// Only the five library backgrounds redrawn from code (M10, M10b) are written here, until a derived slot can name a
// layers colour rule (B14c). A new background is written as sprites/<id>.json directly, like any other data sprite.
//
// Node only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, BACKDROP_IDS } from './lib.mjs';
import { validateSprite } from '../../catalog/sprite-schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A definition as the text of sprites/<id>.json, after validateSprite passes it; throws naming the first errors otherwise. */
export function checkedText(id, def) {
  const v = validateSprite(def);
  if (!v.ok) throw new Error(`${id}: not a valid definition, nothing written: ${(v.errors ?? []).slice(0, 5).join('; ')}`);
  if (def.id !== id) throw new Error(`${id}: the definition's id is ${JSON.stringify(def.id)}`);
  return format(def);
}

/** The text a writer gives for a background id (what sprites/<id>.json must hold), checked. */
export async function writtenText(id, root = ROOT) {
  if (!BACKDROP_IDS.includes(id)) throw new Error(`${id}: not one of the backgrounds written here (${BACKDROP_IDS.join(', ')}); write a new background as sprites/${id}.json directly`);
  const w = await import(pathToFileURL(path.join(root, 'tools', 'backdrops', `${id}.mjs`)).href);
  return checkedText(id, w.definition(root));
}

async function main(argv) {
  const check = argv.includes('--check');
  const ids = argv.filter((a) => !a.startsWith('--'));
  let bad = 0;
  for (const id of ids.length ? ids : BACKDROP_IDS) {
    const text = await writtenText(id);
    const file = path.join(ROOT, 'sprites', `${id}.json`);
    const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (check) {
      const v = now === null ? { ok: false, errors: ['no file'] } : (() => { try { return validateSprite(JSON.parse(now)); } catch (e) { return { ok: false, errors: [e.message] }; } })();
      if (!v.ok) { bad++; console.log(`${id}: sprites/${id}.json is not a valid definition: ${(v.errors ?? []).slice(0, 5).join('; ')}`); } else if (now !== text) { bad++; console.log(`${id}: sprites/${id}.json differs from what tools/backdrops/${id}.mjs writes`); } else console.log(`${id}: ok`);
      continue;
    }
    fs.writeFileSync(file, text);
    console.log(`${id}: wrote sprites/${id}.json, ${text.length} bytes${now === text ? ' (unchanged)' : ''}`);
  }
  if (bad) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
