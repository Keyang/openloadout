// The rewrite switch for a layout's golden file (build item B15b, from the B15 reviews: tiles@1 was re-pinned by deleting
// its file and writing it again with GEN_GOLDEN_WRITE=1, which writes only missing files). A layout's golden pins the
// frame lists it lays out for its fixture definitions (tests/unit/gen-motion-layout-contract.test.mjs). Until a library
// sprite uses the layout (a sprites/<id>.json whose body is that kind), its version is not released and its fixtures
// may still be redrawn, so its golden may be rewritten on purpose:
//
//   GEN_GOLDEN_REWRITE=tiles@1 node --test tests/unit/gen-motion-layout-contract.test.mjs
//
// rewrites tests/fixtures/gen/tiles@1.json from the frames laid out now and says which frames changed, were added or
// were removed (a test diagnostic). Several keys are separated by commas. A key that is not a registered layout, or a
// layout a library sprite uses (released: a different output is a new version), fails the run and writes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The site's folder (the sprites/ folder is read from it). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The keys GEN_GOLDEN_REWRITE names ("tiles@1,layers@1"), as a Set; empty when it is not set. Arguments: env. */
export function rewriteKeys(env = process.env) {
  const raw = typeof env?.GEN_GOLDEN_REWRITE === 'string' ? env.GEN_GOLDEN_REWRITE : '';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * The library sprite files whose body is laid out by the layout `kind` (its generator id: "tiles", "layers"...), sorted:
 * the data files of sprites/ (<id>.json) with body[kind] (an emitters layout: body.emitters). Arguments: kind, root.
 */
export function layoutUsers(kind, root = ROOT) {
  const dir = path.join(root, 'sprites');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (d && typeof d === 'object' && d.body && typeof d.body === 'object' && Object.hasOwn(d.body, kind)) out.push(`sprites/${f}`);
  }
  return out;
}

/** What changed between two pinned frame tables ({ name: hash }): { changed, added, removed } (names, sorted). Arguments: before, after. */
export function frameDiff(before = {}, after = {}) {
  const a = before ?? {}, b = after ?? {};
  return {
    changed: Object.keys(b).filter((k) => Object.hasOwn(a, k) && a[k] !== b[k]).sort(),
    added: Object.keys(b).filter((k) => !Object.hasOwn(a, k)).sort(),
    removed: Object.keys(a).filter((k) => !Object.hasOwn(b, k)).sort(),
  };
}

/** One line saying what a rewrite did, for a test diagnostic. Arguments: key, diff (frameDiff), total (frames after). */
export function rewriteSummary(key, diff, total) {
  const list = (xs) => (xs.length ? `: ${xs.slice(0, 12).join(', ')}${xs.length > 12 ? `, and ${xs.length - 12} more` : ''}` : '');
  return `rewrote ${key} (${total} frames): ${diff.changed.length} changed${list(diff.changed)}; ${diff.added.length} added${list(diff.added)}; ${diff.removed.length} removed${list(diff.removed)}`;
}
