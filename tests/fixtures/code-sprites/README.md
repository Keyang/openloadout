# Frozen code sprites

Copies of library code sprites (`sprites/<id>.js`) as they were before the migration redraws them as data files
(`sprites/<id>.json`, docs/data-sprites.md section 7). They are **not sprites**: the build never scans `tests/`.

They exist for the tests about the **framework** a code file uses (a rig, a helper module, the import graph, the
version 1 data form). A test about a **library asset** loads the asset whatever its file kind instead. Both ways go
through `tests/helpers/library.mjs`:

| Test is about | Use | Reads |
|---|---|---|
| A library asset ("tiles-forest joins up", "every tileset") | `librarySprite(id)`, `librarySprites()`, `hasLibrarySprite(id)` | `sprites/<id>.js` or `sprites/<id>.json` |
| The framework its code uses ("the rig's belt", "the seam changes no pixel") | `codeSprite(id)`, `codeSpriteModule(id)`, `codeSpriteSource(id)`, `codeSpritesWhere(re)` | this folder first, else `sprites/<id>.js` |

Rules:

- A copy is the library file word for word with its imports moved from `../` to `../../../` and a "FROZEN COPY"
  comment on top. A file in the fixed data form (a converted library file such as `rogue-battler.js`, first line its
  header) is kept word for word, imports included; `codeSprite` reads it with `catalog/data-file.js` and makes it
  with `engine/data-sprite.js`, which is what importing it does.
- Never edit a copy. A test that needs a changed drawing tests the library asset instead. `SHA256SUMS` pins every
  copy (the `shasum -a 256` format; `shasum -a 256 -c SHA256SUMS` checks it by hand), and
  `tests/unit/tests-migration-ready.test.mjs` fails when a copy changed, has no line, or a line has no copy. A batch
  that freezes a code file adds its line (`shasum -a 256 <id>.js >> SHA256SUMS`); R1 to R4 take a line out with its copy.
- A migration batch that redraws a sprite a framework test names freezes the code file here first, if it is not
  here already (`codeSprite` says so when it is missing).
- `tests/helpers/data-sprites.mjs` copies a frozen file into a scratch project's `sprites/` with its imports put back
  (`codeSpriteAsFile` does the same for one file), the frozen copy first, as `codeSprite` reads it.
- **When a copy goes:** a frozen copy is deleted together with the last framework test that reads it, in the removal
  items R1 to R4 (docs/data-sprites.md section 5). Until then this folder is a caller of the code rigs and drawing
  helpers its copies import (`rigs/humanoid.js`, `rigs/topdown*.js`, `engine/fx.js`, `engine/tiles.js`, `engine/ui*.js`,
  ...): a check that lists a module's importers before removing it counts `tests/fixtures/code-sprites/` too, and
  removing a module means deleting the copies that import it and the framework tests that read them, in the same item.

## The guard and what it cannot see

`tests/unit/tests-migration-ready.test.mjs` reads every file in `tests/unit`, `tests/e2e` and `tests/helpers` and fails on:

- an import or read of the real project's `sprites/<id>.js` (by literal path, `path.join`/`path.resolve` of the project
  folder with `'sprites'`, a template or `+` string ending in `.js`, `new URL`, or `../../sprites/` from a test's own folder);
- a listing of the real `sprites/` folder kept to code files (`.js` only, or `.json` dropped);
- a fake catalogue (an `assets: [...]` list handed to `globalThis.fetch`) whose row for a library id has no `.json`
  src, in a file that then calls `loadSprite`/`loadSprites` with that id as a quoted literal: `app/catalog.js` would
  import `sprites/<id>.js`. Give such a row an id no library sprite uses and serve it with
  `tests/helpers/code-standin.mjs` (`CODE_STANDIN`, `useCodeStandIn`), as `catalog-studio-shadow` and `catalog-load` do;
- a unit test that scans `librarySprites()` without printing `libraryCoverage()` or failing on an unloadable file.

It reads text, line by line, so it does not see: a path or id built across several lines or in a helper function; an
id held in a variable (`loadSprite(id)` with `id = 'knight'` set elsewhere); a fake catalogue built by a function or
read from a file; a browser test that loads a library id through the real catalogue's `src` (that one follows the
file kind and is fine). The real check is a redraw run: in a scratch copy, replace a few code sprites with data files
(the pilots of section 7) and run the whole unit suite, not only the files a change touched.
