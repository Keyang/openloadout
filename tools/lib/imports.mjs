// Which files a module loads: itself, the modules it imports, and the modules those import, all the way down.
//
// What it is for: answering "did any code behind this file change?" without running the code. The quality
// cache (tools/lib/quality-run.mjs) keys each asset on this list, so editing one rig re-checks only the
// sprites built on that rig. Anything else that wants to know what a sprite, a page or a tool depends on
// can use it too.
//
//   import { importGraph } from './imports.mjs';
//   const graph = importGraph({ root });               // one per run: it remembers every file it has read
//                                                      // root (optional): the site's folder, for paths that start with /
//   const { files, missing, unknown } = graph.closure([file, ...]);
//
//   files    every file reached, the starting files included: absolute paths, sorted, each once
//   missing  files that are named by an import but are not on disk (creating one changes what loads)
//   unknown  files holding an import this reader cannot follow, such as import(someVariable). A caller that
//            must never miss a dependency treats a non-empty list as "may depend on anything"
//
// How it reads: the source text only, never run. It errs on the side of listing too much, because a file
// listed by mistake costs a re-check while a file missed would let a stale result through:
//   - every `import ... from '<path>'`, `export ... from '<path>'`, `import '<path>'`, `import('<path>')` and
//     `new URL('<path>', import.meta.url)`, wherever it stands in the text (a comment that shows an import counts);
//   - any other quoted text that starts with ./ or ../ and names a file that exists.
// Packages ('node:fs', '@playwright/test') are left out: they do not change with the project's own code.
// Only .js and .mjs files are read for further imports; a .json or any other file is listed and not opened.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const Q = '[\'"`]';
// the ways a module names another file; group 2 is the path as written
const NAMED = [
  new RegExp(`\\bfrom\\s*(${Q})([^'"\`\\n]+)\\1`, 'g'),
  new RegExp(`\\bimport\\s*(${Q})([^'"\`\\n]+)\\1`, 'g'),
  new RegExp(`\\bimport\\s*\\(\\s*(${Q})([^'"\`\\n]+)\\1`, 'g'),
  new RegExp(`\\bnew\\s+URL\\(\\s*(${Q})([^'"\`\\n]+)\\1\\s*,\\s*import\\.meta\\.url`, 'g'),
];
// any quoted text that looks like a path next to this file
const RELATIVE = new RegExp(`(${Q})(\\.\\.?/[^'"\`\\n]*)\\1`, 'g');
// import( followed by anything but a quoted path: a variable, a call, a sum
const COMPUTED = /\bimport\s*\(\s*(?!['"`)\s])/;
const isLocal = (spec) => spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/') || spec.startsWith('file:');
const isCode = (file) => /\.(m|c)?js$/.test(file);
const isFile = (file) => { try { return fs.statSync(file).isFile(); } catch { return false; } };

function resolve(from, spec, root) {
  if (spec.startsWith('file:')) { try { return fileURLToPath(spec); } catch { return null; } }
  spec = spec.replace(/[?#].*$/, '');
  // "/engine/x.js" is the site's own folder in a browser and the disk's top folder in Node: take the site's when it is there
  if (spec.startsWith('/') && root && isFile(path.join(root, spec))) return path.join(root, spec);
  return path.resolve(path.dirname(from), spec);
}

/** What one file names: { deps: files on disk, missing: named but not on disk, unknown: true when an import cannot be followed }. */
function scan(file, root) {
  const text = fs.readFileSync(file, 'utf8');
  const deps = new Set(), missing = new Set();
  let unknown = COMPUTED.test(text);
  for (const re of NAMED) for (const m of text.matchAll(re)) {
    const spec = m[2];
    if (!isLocal(spec)) continue;
    if (spec.includes('${')) { unknown = true; continue; }       // a path put together while the code runs
    const target = resolve(file, spec, root);
    if (!target) continue;
    if (isFile(target)) deps.add(target); else missing.add(target);
  }
  for (const m of text.matchAll(RELATIVE)) {
    if (m[2].includes('${')) continue;
    const target = resolve(file, m[2], root);
    if (target && target !== file && isFile(target)) deps.add(target);
  }
  deps.delete(file);
  return { deps: [...deps], missing: [...missing], unknown };
}

/**
 * A reader of import lists that remembers each file it has read, so asking about many files that share
 * modules reads each module once. Make a new one per run: it does not notice files that change later.
 * root: the site's folder; an import that starts with / is looked for there first (as a browser would).
 */
export function importGraph({ root = null } = {}) {
  root = root ? path.resolve(root) : null;
  const scans = new Map();
  const direct = (file) => {
    if (!scans.has(file)) scans.set(file, isCode(file) ? scan(file, root) : { deps: [], missing: [], unknown: false });
    return scans.get(file);
  };
  return {
    /** What one file names itself (not followed further). */
    direct,
    /** Everything reached from the starting files: { files, missing, unknown }, each a sorted list of absolute paths. */
    closure(starts) {
      const files = new Set(), missing = new Set(), unknown = new Set();
      const queue = starts.map((f) => path.resolve(f));
      while (queue.length) {
        const file = queue.pop();
        if (files.has(file) || missing.has(file)) continue;
        if (!isFile(file)) { missing.add(file); continue; }
        files.add(file);
        const s = direct(file);
        if (s.unknown) unknown.add(file);
        for (const m of s.missing) missing.add(m);
        for (const d of s.deps) if (!files.has(d)) queue.push(d);
      }
      return { files: [...files].sort(), missing: [...missing].sort(), unknown: [...unknown].sort() };
    },
  };
}
