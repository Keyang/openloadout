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
  comment on top. (The two copies that were in the fixed data form, `rogue-battler.js` and `road-bandit.js`, library
  bodies drawn through `engine/library-body.js`, went with that path in build item R1; the silhouettes they drew are
  `tests/fixtures/library-bodies/silhouettes.json`.)
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
  helpers its copies import (`engine/fx.js`, `engine/tiles.js`, `engine/shapes.js`, ...): a check that lists a module's importers before removing it counts `tests/fixtures/code-sprites/` too, and
  removing a module means deleting the copies that import it and the framework tests that read them, in the same item.
  **R2 (2026-11-21)** did that for every code rig but the side-view one: 14 copies went (the nine top-down people, `scout-drone`,
  `moss-golem`, `security-bot`, `vendor-bot`, `warden-mech`), each with its `SHA256SUMS` line. What a test compared with
  one of them is held by a record instead where it could be: `tests/fixtures/redraw-pixels/moss-golem.json` and
  `redraw-pixels-c3/<id>.json` (pixels), `redraw-sockets/moss-golem.json` and the `sockets` of the c3 records (attach points),
  `redraw-boxes/<id>.json` (the boxes of the nine top-down people). The five copies left on `rigs/humanoid.js` (`bone-soldier`,
  `knight`, `spear-goblin`, `thicket-imp`, `wizard`) went in **R2b (2026-11-21)** with `rigs/humanoid.js`, `humanoid-figure.js`,
  `humanoid-describe.js` and `tools/bake-person-side.mjs`, after `apart` moved into `engine/data-rules.js`.
  **R3 (2026-11-21)** deleted 36 more, with the 73 drawing helper modules they imported: 35 of them were compared with by a kept
  test and are replaced by a **replay record**, one JSON file per copy in `tests/fixtures/code-replay/<id>.json`: every
  frame the code drew (palette indices, deflated), and every answer of its `sockets()`, `slice()`, `textArea()` and clip `fps()`,
  in each call the tests that read it made, keyed by a hash of the call's arguments (`tests/helpers/code-replay.mjs`).
  `codeSprite(id)` returns `replaySprite(id)` when the copy is gone: a sprite built from the record, so `renderFrame`,
  `renderPixels`, `frameSockets`, `clipStretch` and `clipFps` work at the settings the tests used, and a call the record does
  not hold FAILS, naming the sprite, the clip, the frame and the settings. `icons-weapons` was read by no kept test and
  went with its module. The record of a copy comes from running the tests that read it in a `git archive` tree that still
  had the code (a recorder that wraps the copy's `render`, `sockets`, `slice`, `textArea` and `fps`); each record's `about`
  says which tests. What a *generator* test compared with a deleted helper module (not with a copy) is in
  `tests/fixtures/old-code/<test>.json`, read through `tests/helpers/old-replay.mjs` (see its head).
  A copy that is still here stays because the modules it imports are kept (a generator, a colour rule or the app imports
  them) and a kept test reads it: the tilesets and the writers in `tests/helpers/ports/`, `bg-forest`, `bg-castle`, `coin`,
  `crate`, the creatures, the props, the interface pieces and the fonts.

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
