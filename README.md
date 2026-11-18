# Loadout

Loadout is a website of pixel-art sprites, sound effects and music for 2D games. Every asset is made by code, not stored as a picture or a recording. Each one is a small program with plain-language sliders ("taller", "brighter", "faster"), so a game maker can change it before using it. The site is static files only: it needs no server of its own.

It is for people who make small 2D games and do not draw, record or write code. They search for what the game needs, change it, put it in a bag, try the bag in a playground, and download one zip. Agents can use the same code to make new assets. The folder (`lab/sprite-forge`), the skill id (`sprite-forge`) and the preview entry keep the project's first name, Sprite Forge; Keyang decided on 2026-11-18 to leave them. This is Keyang's own lab experiment, not part of the Innovation Lab project.

## What is in it today

Counts are of committed files as of 22:21 on 2026-11-18. The build loop was still running, so they can rise.

| Thing | Count |
|---|---|
| Sprites (`sprites/*.js`, committed) | 132 (5 more files are on disk and not yet committed) |
| Sounds (`sounds/*.json`, committed) | 56 sound effects, ambience loops and jingles |
| Music tracks (also in `sounds/`) | 6 |
| Bundle files (`bundles/*.json`) | 4 |
| Commits | 121 |

A **bundle** is a list of sprites, sounds and tracks that belong together. A **kit** is a bundle for one kind of game. Three kits are planned, one for each of three game types picked from the top 100 2D games (`docs/game-types-research.md`):

| Kit (id) | Game type | Sprites | Sounds | Tracks | Bundle file |
|---|---|---|---|---|---|
| Thornwood Keep platformer kit (`kit-platformer-fantasy`) | Platformer, side view, fantasy | 47 of 47 committed | 20 of 20 | 2 of 2 | Exists |
| Hearthvale turn-based RPG kit (`kit-rpg-fantasy`) | Turn-based RPG, top-down map and side-view battles, fantasy | 47 of 49 committed | 20 of 20 | 2 of 2 | Not written yet |
| Derelict Station roguelite kit (`kit-roguelite-scifi`) | Roguelike action, top-down, science fiction | 45 of 48 committed | 20 of 20 | 2 of 2 | Not written yet |

`tools/bundles-from-plans.mjs` writes a kit's bundle file once every asset it lists exists. At 22:21 `--check` reported all three plans complete on disk (some assets are not yet committed), so the two missing bundle files can now be written. The three small starter bundles are `dungeon-starter`, `wizard-camp` and `menu-sounds`.

## How to run it

Needs Node. Run everything from this folder.

```bash
npm install            # packages, including Playwright for the browser tests
npm run build          # writes generated/ and vendor/ (not committed); the site reads them
npm run serve          # static server on http://localhost:5178
```

`npm run serve` also takes a port (`npm run serve -- --port 5200`, or the `PORT` environment variable) and a folder (`-- --root dist` serves the built site). The browser tests use a second server on port 5199, which Playwright starts itself.

`npm run build` runs `node tools/build.mjs`. It checks every asset, writes the catalogue and thumbnails, runs the quality checks, builds the search index and copies the browser files it needs into `vendor/`. It stops with the list of problems if an asset or a bundle is wrong. Options:

| Option | What it does |
|---|---|
| `--dist` | Also writes the publishable site to `dist/` |
| `--skip-quality` | Skips the quality checks. Use it only to get a quick look; the site then shows assets nobody has checked |
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
- **Download.** A zip with sprite sheets, JSON, WAV files, tracks, one manifest and a guide. Unity package is shown as "coming later".

## How an asset is made

Loadout has two layers. The **framework** is the code every asset is written with: drawing (`engine/`), body rigs (`rigs/`), sound and music synthesis (`sound/`), the quality bar (`quality/`) and the looks (`engine/theme.js`, `sound/theme.js`). An **asset** is one file: `sprites/<id>.js` draws every frame of a sprite, and `sounds/<id>.json` is a sound or music patch. Nothing else is stored; there is no list to edit, because the build finds assets by scanning the folders.

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
| `tools/rig.mjs` | Lists what a body rig has (poses, parts, held things, sockets) as tables and contact sheets |
| `tools/bundles-from-plans.mjs` | Writes `bundles/<id>.json` for each kit plan whose assets all exist; `--check` writes nothing |
| `tools/compose/` | The music kit's command line (`kit.mjs`) and one generator per track that writes its patch (`thornwood_overworld.mjs`, `hearthvale_village.mjs`, `hearthvale_battle.mjs`, `derelict_run.mjs`, `derelict_boss.mjs`, `battle_theme.py`); `verify_music.mjs` lists the notes sounding in each bar; `render_ramp.mjs` renders a loop while one slider climbs |
| `tools/search-eval.mjs` | Measures search on the test set in `tests/fixtures/search/` and writes `docs/search-eval.md` |

## For agents: `window.loadout`

The site puts the whole framework on `window.loadout`. An agent that drives the page can search the catalogue, define a new sprite or sound at run time (`loadout.make.sprite`, `loadout.make.sound`), run the quality bar on it, render it as a picture, add it to the bag and download. Its description, including 14 actions listed in the form MCP tool lists use, is written by the build to `generated/api.json` and `generated/api.md` (generator: `tools/lib/api.mjs`).

Safety, in two sentences: an asset made at run time runs only inside a worker with network, storage and page access removed, under a same-site content policy, and anything from storage or a shared link is checked again before it is used. This was verified in Chromium only (`docs/architecture.md`, Contract 11; `docs/framework-api.md`).

## Tests

```bash
npm test                              # unit tests: node --test tests/unit/*.test.mjs (140 committed files)
npm run e2e                           # browser tests: Playwright, Chromium (21 files)
npx playwright test tests/e2e/journey.spec.mjs   # one file
```

`tests/README.md` says how to write them. The acceptance tests are written as a person would use the site:

- `journey.spec.mjs`: search, customise, add to the bag, play and download a sprite, a sound and a track, at desktop and phone width.
- `whole-bundle.spec.mjs`: one look restyles every asset of every bundle in previews, the bag, the playground and the download, and "Start over" restores it.
- `three-bundles.spec.mjs`: each kit has 40 to 50 sprites, 20 sounds and 2 tracks, every asset opens, and the playground has a character the keyboard moves. It passes only for kits whose bundle file exists.
- `newasset.spec.mjs`: a new asset file is found by search and reaches the zip with no other edit.
- `route2.spec.mjs`, `route2-safety.spec.mjs`: a sprite is made, checked, bagged and exported using `window.loadout` only, and hostile sources fail.

At 21:44 the last full unit run in `docs/progress.md` was 2,089 of 2,100. At 22:16 a spot check of 9 unit test files found 2 failing tests (`rig-describe-data`: new rig modules not yet listed). The full browser suite was not run for this README.

## Documents

| File | What it is |
|---|---|
| `docs/features.md` | Vision, feature list with status, suggested order, decisions made and open |
| `docs/progress.md` | The build loop's goals, decisions and time log |
| `docs/architecture.md` | Contracts 1 to 13 that every builder works to |
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
- **Rigs as data are partly built** (Contract 13): the generic renderer is not.
- **Licences:** every asset says `draft`.
- **Open decisions for Keyang** are listed in `docs/features.md`: R2, R3 and R4 (Contract 13), whether the MCP server is next, the "flat Hero" style test, installing Firefox and Safari, a `footprint` field on sprites, and the search-by-meaning default.
- The kit counts above and the committed file counts can still change: other agents were finishing assets.

The sound engine in `sound/` began as a copy of `experiment/procedural-sfx/` and has since diverged, so do not re-copy it over; merge by hand.
