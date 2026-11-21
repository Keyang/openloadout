# Loadout

Loadout is a website of pixel-art sprites, sound effects and music for 2D games. Every asset is made by code, not stored as a picture or a recording: a sound is a patch the sound engine plays, and a sprite is a data definition the framework draws (every sprite is a data file; the build refuses a program). Each one has plain-language sliders ("taller", "brighter", "faster"), so a game maker can change it before using it. The site is static files only: it needs no server of its own.

It is for people who make small 2D games and do not draw, record or write code. They search for what the game needs, change it, put it in a bag, try the bag in a playground, and download one zip. Agents can use the same code to make new assets. The folder (`lab/sprite-forge`), the skill id (`sprite-forge`) and the preview entry keep the project's first name, Sprite Forge; Keyang decided on 2026-11-18 to leave them. This is Keyang's own lab experiment, not part of the Innovation Lab project.

## What is in it today

Counts are of committed files at 05:00 on 2026-11-20 (commit `6773968`). The build loop's four goals were verified in the progress log's entry of 02:30 on 2026-11-19, with 137 sprites, 56 sounds and 6 tracks.

| Thing | Count |
|---|---|
| Sprites | Every sprite is a data file (`sprites/<id>.json`, 259 on 2026-11-21). There are no code sprites: the build, the loader and the quality run refuse any `.js` file in `sprites/` (build item R4a) |
| Sounds (`sounds/*.json`) | 175 sound effects, ambience loops and jingles (142, 24 and 9) |
| Music tracks (also in `sounds/`) | 30 |
| Bundle files (`bundles/*.json`) | 6: three kits and three small starter bundles |
| Pieces (`pieces/*.json`, shared drawing data) | 14: 3 interface skins, the top-down person's 2 bases, 7 parts and 2 held things |
| Named generators (`engine/gen/`) | 64 versions of 59 generators in 12 families |
| Tests | 414 unit test files and 61 browser test files, counted in the working folder after build items R1, R2, R2b, R3 and R4b (R4b added `quality-no-read-back` and cut `styles-quality` from 12 tests to 6; R3 took out 67 unit files and trimmed 17; R1, the library-body removal, took out 13 unit files and 1 browser file and added 4 and 2; the committed counts at `87a4e2c` were 381 and 54). Last full runs in `docs/progress.md`: unit 4,570 of 4,586 (2026-11-20 05:00, on exactly commit `87a4e2c`; the log names two failures: the top-down pieces' missing pins, fixed in that commit, and a font file absent from the clean export, which passes in the real folder), browser 634 of 638 (2026-11-20 about 03:59; the 4 were tests of another session's page redesign, fixed in `ed76fd8`) |

**Option B: every sprite becomes data** (Keyang, 2026-11-19 18:10; Contract 15 in `docs/architecture.md`, the design and its build plan in `docs/data-sprites.md`). Where it stands:

| Part | State |
|---|---|
| Sprites that are data | All 259 (2026-11-21); `tools/lib/assets.mjs` refuses a code file in `sprites/` |
| Kinds of sprite the framework can draw as data | Characters and creatures (bone rigs), props, pickups, icons, interface pieces, backgrounds, effects and projectiles (7 of about 27 effect behaviours), tilesets (3 of 13 ported; the other 10 in progress) |
| Shared bodies (bases) | The top-down person and its variants (baked from `rigs/topdown.js`, which R2 deleted) and the side-view person (`base:person-side`, baked from `rigs/humanoid.js`, which R2b deleted), as pinned base pieces in `pieces/`; the creatures and robots became generators (`creature.*`, `robot.*`) |
| Made through `window.loadout` | Data only; the sandbox for program text is deleted |
| Not started | The studio for every kind (the studio works for bone rigs today). The migration of the code sprites is done and the build now refuses a code sprite (R4a); no code rig is left (R2, R2b) and 73 of the 120 drawing helper modules in `engine/` are gone (R3); what is left in `engine/` (47) is the framework and the helpers a generator, a colour rule or the app imports |

A **bundle** is a list of sprites, sounds and tracks that belong together. A **kit** is a bundle for one kind of game, with a plan in `bundles/specs/`. There is one kit for each of three game types picked from the top 100 2D games (`docs/game-types-research.md`):

| Kit (id) | Game type | Sprites | Sounds | Tracks |
|---|---|---|---|---|
| Thornwood Keep platformer kit (`kit-platformer-fantasy`) | Platformer, side view, fantasy | 47 | 20 | 2 |
| Hearthvale turn-based RPG kit (`kit-rpg-fantasy`) | Turn-based RPG, top-down map and side-view battles, fantasy | 49 | 20 | 2 |
| Derelict Station roguelite kit (`kit-roguelite-scifi`) | Roguelike action, top-down, science fiction | 48 | 20 | 2 |

`tools/bundles-from-plans.mjs` writes a kit's bundle file once every asset its plan lists exists. The three small starter bundles are `dungeon-starter`, `wizard-camp` and `menu-sounds`.

A full build with the quality bar took 25 minutes at 02:29 on 2026-11-19 (1,523 s; 199 assets checked, 0 errors, 9 warnings). The quality cache now re-checks only the assets whose own files or imported modules changed; a build without the quality bar (`--skip-quality`) takes about 5 seconds.

## How to run it

Needs Node. Run everything from this folder.

```bash
npm install            # packages, including Playwright for the browser tests
npm run build          # writes generated/ and vendor/ (not committed); the site reads them
npm run serve          # static server on http://localhost:5178
```

`npm run serve` also takes a port (`npm run serve -- --port 5200`, or the `PORT` environment variable) and a folder (`-- --root dist` serves the built site). The browser tests use a second server on port 5199, which Playwright starts itself.

`npm run build` runs `node tools/build.mjs`. It checks every asset and runs the quality checks first, then writes the thumbnails, the search index and the catalogue, and copies the browser files it needs into `vendor/`. It stops with the list of problems if an asset or a bundle is wrong; for an asset that fails the quality checks it says which file, what is wrong and what to do. Nothing the site reads is written until every asset has passed, so a build that stops leaves the site as the last finished build wrote it. Options:

| Option | What it does |
|---|---|
| `--dist` | Also writes the publishable site to `dist/` |
| `--skip-quality` | Skips the quality checks. Use it only to get a quick look; the site then shows assets nobody has checked, and the build ends by saying so ("NOT CHECKED") |
| `--no-meaning` | Builds the search index with keywords only and copies no search model. The site then offers no "Smarter search" switch, and the vendor folder is 1.5 MB instead of about 40 MB. Without this option the first build downloads the search model (about 24 MB) from Hugging Face into `.cache/models/` |
| `--no-cache` | Runs the quality checks again on assets that have not changed |
| `--force` | Redraws every thumbnail |
| `--skip-search`, `--skip-vendor` | Skip that step |
| `--root <folder>` | Builds another copy of the project (the tests use it) |

How long a full build takes is not recorded in `docs/progress.md` and has not been measured for this README. Do not run two builds at once in the same folder.

## How to use the site

Pages are addresses after `#/`. Every page keeps its settings in the address, so a copied link reproduces what you see.

- **Search.** The home page has a search box and filters (kind, "used for", type, theme, game type, view, bundle). "View" and "Game type" are remembered. A "Smarter search" switch lets you describe what you need in other words; it is off by default and downloads about 38.5 MB when turned on.
- **Customise.** A sprite page (`#/sprite/<id>`) has live sliders for look, colours and motion, parts such as a weapon with their own settings, and the sounds that play on each animation frame. Sound pages (`#/sound/<id>`) and music pages (`#/music/<id>`) have sliders and named styles; music plays live.
- **Bundle look.** A bundle page (`#/bundle/<id>`) restyles every asset in the bundle at once: colours, pitch, brightness, tempo.
- **Bag.** "Add to my bag" keeps an asset with its settings. The bag (`#/bag`) lives in the browser and the whole bag travels in one link.
- **Playground.** `#/play` lets you walk, jump or move in four directions with the bag's characters, over its tiles and backgrounds, with its sounds and music.
- **Studio.** `#/studio` makes a new sprite on a bone rig: bones and shapes, key-pose animation, frames, sounds on frames; it goes in the bag like any asset (`docs/studio.md`). It does not yet edit the other kinds of data sprite.
- **Download.** A zip with sprite sheets, JSON, WAV files, tracks, one manifest and a guide. Unity package is shown as "coming later".

## How an asset is made

Loadout has two layers. The **framework** is the code every asset is written with: drawing (`engine/`), the bone-rig renderer and key poses (`rigs/`), sound and music synthesis (`sound/`), the quality bar (`quality/`) and the looks (`engine/theme.js`, `sound/theme.js`). An **asset** is one file: `sprites/<id>.json` is a sprite's definition (data that names shapes, pixel stamps, shared pieces and the framework's named generators; no code), and `sounds/<id>.json` is a sound or music patch. A program in `sprites/` is refused by the build (build item R4a). Nothing else is stored; there is no list to edit, because the build finds assets by scanning the folders.

The rule: code that any other asset could use goes into the framework, not into the asset file. A maker who finds something missing adds a new function or module, with a one-line comment and a test, and does not change what existing functions do (`docs/architecture.md`, Contract 11; `docs/framework-api.md`).

Agents make assets with the skill at `../../skills/sprite-forge/` (`SKILL.md` for sprites, `SOUND.md` for sounds and music). They check them with:

```bash
node tools/check.mjs [<id> ...]                  # sprites; no id checks every sprite
node tools/sfx.mjs check sounds/<id>.json ...    # sounds and music
node tools/render.mjs <id>                       # contact sheets in out/ to look at
```

Both checkers run the quality bar (`docs/quality-bar.md`). Errors fail an asset; warnings are things to look at. A second agent that did not make the asset then reviews it by `docs/review-protocol.md`.

## Tools

| Tool | What it does |
|---|---|
| `tools/build.mjs` | The site build described above |
| `tools/serve.mjs` | Static file server for development and browser tests |
| `tools/check.mjs` | Quality checks for sprites, with `--json`, `--no-cache` and a cache file |
| `tools/sfx.mjs` | `check` runs the quality bar on sound patches; `render` writes a WAV and a waveform or spectrogram picture; `nodes` prints the synthesis reference |
| `tools/render.mjs` | Renders a sprite to contact sheets (clips, variants, one clip close up, the real export) |
| `tools/tilemap.mjs` | Renders a map from a tileset so the joins between tiles can be looked at |
| `tools/scene.mjs` | Renders a scene from several tilesets, with props, looks and frames, from a JSON file |
| `tools/gen.mjs` | Lists the named generators a data sprite can use; `<gen> --sheet` draws one across its arguments |
| `tools/piece.mjs` | Lists the shared pieces (`pieces/`) with their slots and arguments; `<piece> --sheet` draws one |
| `tools/bundles-from-plans.mjs` | Writes `bundles/<id>.json` for each kit plan whose assets all exist; `--check` writes nothing. A new kit is new files only: its plan `bundles/specs/<id>.plan.json` (name, game type, the sentence for its page, palette, asset lists) and its assets. The top of the tool says how, including the one code step when a kit brings a new palette |
| `tools/compose/` | The music kit's command line (`kit.mjs`) and one generator per track that writes its patch (`thornwood_overworld.mjs`, `hearthvale_village.mjs`, `hearthvale_battle.mjs`, `derelict_run.mjs`, `derelict_boss.mjs`, `battle_theme.py`); `verify_music.mjs` lists the notes sounding in each bar; `render_ramp.mjs` renders a loop while one slider climbs |
| `tools/search-eval.mjs` | Measures search on the test set in `tests/fixtures/search/` and writes `docs/search-eval.md` |

## For agents: `window.loadout`

The site puts the whole framework on `window.loadout`. An agent that drives the page can search the catalogue, define a new sprite or sound at run time (`loadout.make.sprite`, `loadout.make.sound`), run the quality bar on it, render it as a picture, add it to the bag and download. Its description, including 14 actions listed in the form MCP tool lists use, is written by the build to `generated/api.json` and `generated/api.md` (generator: `tools/lib/api.mjs`).

Safety, in two sentences: a sprite made at run time is data (a definition, never program text), so nothing in it runs; it is checked field by field and drawn on the page by the framework, under a same-site content policy, and anything from storage or a shared link is checked again before it is used. This was verified in Chromium only (`docs/architecture.md`, Contract 11; `docs/framework-api.md`).

## Tests

```bash
npm test                              # unit tests: node --test tests/unit/*.test.mjs (413 files in the working folder after R1, R2, R2b and R3)
npm run e2e                           # browser tests: Playwright, Chromium (61 files in the working folder after R1, R2, R2b and R3)
npx playwright test tests/e2e/journey.spec.mjs   # one file
```

`tests/README.md` says how to write them. The acceptance tests are written as a person would use the site:

- `journey.spec.mjs`: search, customise, add to the bag, play and download a sprite, a sound and a track, at desktop and phone width.
- `whole-bundle.spec.mjs`: one look restyles every asset of every bundle in previews, the bag, the playground and the download, and "Start over" restores it.
- `three-bundles.spec.mjs`: there are at least three kits for at least three kinds of game; every kit (every bundle that has a plan in `bundles/specs/`, however many there are) has 40 to 50 sprites, 20 sounds and 2 tracks, every asset opens, and the playground has a character the keyboard moves. It passes only for kits whose bundle file exists.
- `newasset.spec.mjs`: a new asset file is found by search and reaches the zip with no other edit.
- `route2.spec.mjs`, `route2-data.spec.mjs`: a sprite is made from a data definition, checked, bagged and exported using `window.loadout` only; program text is refused.

The last full runs are in the counts table above. Neither suite was run for this README.

## Documents

| File | What it is |
|---|---|
| `docs/features.md` | Vision, feature list with status, suggested order, decisions made and open |
| `docs/progress.md` | The build loop's goals, decisions and time log |
| `docs/architecture.md` | Contracts 1 to 15 that every builder works to |
| `docs/data-sprites.md` | Option B: every sprite as data (format, generators, pieces, removal, migration, build plan with each item's state) |
| `docs/studio.md` | The studio (`#/studio`): bone rigs, key poses, frames, as data |
| `docs/framework-api.md` | How to add to the framework; `window.loadout`; safety; styles; rigs |
| `docs/quality-bar.md`, `docs/review-protocol.md` | What passes, and how a second agent judges |
| `docs/style-guide.md` | Art, sound and music rules, palettes, names |
| `docs/asset-taxonomy.md`, `docs/search-design.md`, `docs/search-eval.md` | Categories, how search works, what was measured |
| `docs/game-types-research.md`, `docs/demand-scan.md` | Game types chosen; customer evidence (weak for this exact product) |
| `docs/sprite-styles.md`, `docs/sprite-data.md` | Other art styles; what is stored for a sprite |
| `docs/asset-plan.md` | A plan for 126 bundles. Nothing in it is made |
| `bundles/specs/` | One specification and batch plan per kit |
| `tests/README.md` | How the tests are organised |

## Not done, not verified

- **Nobody has listened to any sound or track.** They were tuned and judged by measurement and spectrograms.
- **Nobody has judged the art by eye** except the orchestrating agent looking at renders, plus second agents working from renders.
- **Firefox and Safari are untested.** Only Chromium is installed. The safety rules for made assets must be checked there before any public release (`docs/framework-api.md`, "Before a public release").
- **No hosting.** The site runs from a local server. Nothing has been pushed.
- **Unity package export is not built.** The zip is engine-neutral with written Unity steps; it has never been imported into Unity.
- **The MCP server is not built.** `window.loadout` and its description exist.
- **A second art style is not built.** The framework seam exists and is tested with test-only styles (`docs/architecture.md`, Contract 12).
- **Sprites as data are partly built** (option B, Contract 15): 3 of 229 sprites are data; effects have 7 of about 27 behaviours, 10 of 13 tilesets are still being ported, and the side-view person is still being baked; the migration has not started.
- **Open decisions for Keyang** are listed in `docs/features.md`: whether the MCP server is next, the "flat Hero" style test, installing Firefox and Safari, a `footprint` field on sprites, and the search-by-meaning default.
- **Engine steps in the download are untried.** The text for each kind of asset (tilesets, interface pieces, backgrounds) gives Unity and Godot steps written from knowledge of the engines; nothing has been imported into either.
- **Licences:** every asset records `draft`, and the download's licence file says the terms are not set yet. Choosing terms is Keyang's decision.

The sound engine in `sound/` began as a copy of `experiment/procedural-sfx/` and has since diverged, so do not re-copy it over; merge by hand.
