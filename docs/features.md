# Loadout: feature breakdown

Written 2026-11-18 from Keyang's vision statement. This is the working list for project management: every feature has an id, a status and what it depends on. Update the status column as work lands; add features under the area they belong to. Statuses and notes were brought up to date at 22:18 on 2026-11-18, while the build loop was still running; counts marked "as of" can still move. Rows added the same day are marked "Added 2026-11-18".

Related: `asset-taxonomy.md` (how assets are categorised and searched), `search-design.md` (how search works on a static site), `demand-scan.md` (customer evidence), `../README.md` (what is built and how to run it).

## Vision

A site of **high-fidelity, game-ready assets that work in a game straight out of the box**: sprites, sound effects and music today, 3D later.

1. People **find** what they need quickly, through search and filters built on the asset taxonomy.
2. They **customise** an asset and **add it to a bag**.
3. They **preview the bag as a package** inside different game templates.
4. They **download the bag** as one game resource package, or **export it as a Unity package**.
5. **Resource bundles modelled on real games** show what a whole game needs, and one button creates variations of a bundle.
6. A **studio** lets people make new sprites, sounds and music with the same framework, and an **MCP server** lets agents do the same.
7. Later: **physics and rigid bodies** for 2D sprites, and **3D assets**.

## Technical rule: the site is static

Set by Keyang on 2026-11-18. **The whole site must work as static files, for example on GitHub Pages.** There is no server of our own.

What that means for the features below:

| Area | Consequence |
|---|---|
| Search | Runs in the browser. The index is built when the site is built. See `search-design.md` |
| Assets | Already fit: an asset is a small program that draws or plays in the browser, so the site ships generators, not large files |
| Bag, downloads, Unity export | Built in the browser, as downloads are today |
| Accounts and saved bags | Not possible without an outside service. The bag lives in the browser and in shareable links |
| Usage tracking | Needs a third-party analytics script; nothing can be logged by the site itself |
| MCP server | Cannot be part of the site. It runs on the user's machine and reads the published index and asset files |
| Studio | Must run in the browser, or on the user's machine through an agent. The site cannot call an AI model on the user's behalf without the user's own key |
| Publishing | A change request to the repository, then an automatic build that runs the checks and rebuilds the index |
| Limits | 1 GB site, 100 MB per file, 100 GB of traffic a month, no custom response headers |

## How assets get made: three routes

Set by Keyang on 2026-11-18.

| Route | Who drives | Where the asset ends up | Priority |
|---|---|---|---|
| 1. **Into the site's source** | An agent, working with Keyang | A file in the repository, then built into the catalogue for everyone | Now |
| 2. **Through the live site** | An agent, using an MCP server and the functions the site exposes on `window` | Made in the visitor's browser and added to their bag. Not in the catalogue | Next |
| 3. **Studio** | A person, by hand | Their bag | Lower |

**The quality bar applies to routes 1 and 2 only.** In both, an agent builds the asset and verifies it automatically, with no person in the loop. What a person makes in the studio is theirs and is not held to the bar.

## Status key

| Status | Meaning |
|---|---|
| Done | Built, committed, and covered by a test or verified in `progress.md`. If a review is still pending the note says so |
| Partly | Some of it exists; the gap is named in the notes |
| In progress | Someone is building it now |
| Not started | Nothing built. A written plan does not count |

"Verified" below means checked by tests or by the orchestrating agent looking at a render or a page in Chromium. It does not mean a person looked or listened. Nobody has listened to any sound or track.

Size is a rough guess (S = days, M = a week or two, L = several weeks), made without a design. Treat it as an ordering aid, not an estimate.

## Where the project is today

As of 22:18 on 2026-11-18 (committed files, so these can still rise):

- **132 sprite files, 62 sound files (56 sound effects, ambience loops and jingles, plus 6 music tracks), 121 commits.** Every asset is made by code and has sliders.
- **Bundles.** Four bundle files exist: the platformer kit (`kit-platformer-fantasy`: 47 sprites, 20 sounds, 2 tracks, all committed) and three small starters (`dungeon-starter`, `wizard-camp`, `menu-sounds`). The other two kits (`kit-rpg-fantasy`, `kit-roguelite-scifi`) have 47 of 49 and 45 of 48 sprites committed and all their sounds and tracks; their bundle files are written by `tools/bundles-from-plans.mjs` and are not there yet (at 22:21 its `--check` reported both plans complete on disk, with some assets uncommitted).
- **The site.** Search-first home with filters, sprite, sound and music pages, bundle pages with whole-bundle looks, a bag, a playground (`#/play`), zip download. `window.loadout` lets an agent search, make assets in the browser and export.
- **Framework.** 54 files in `engine/`, 17 in `rigs/`, the sound engine and music-writing kit in `sound/`, the quality bar in `quality/`.
- **Tests.** 140 unit test files and 21 browser test files. The last full runs in `progress.md` (21:44) were 2,089 of 2,100 unit tests passing; at 22:16 two rig-description tests failed while another agent was adding rig modules.
- **Not built.** Hosting, accounts, Unity package export, the MCP server, a second art style, templates other than the playground.
- **Not verified.** Nobody has listened to any sound or track, or judged art by eye other than the orchestrating agent looking at renders. Only Chromium has been used; Firefox and Safari are untested.
- Routes 1 and 2 exist (route 1: files in the source; route 2: `window.loadout.make`). Route 3, the studio, does not.

---

## A. Find: catalogue and search

The taxonomy document is the specification for this area.

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| FIND-1 | **Asset metadata.** Every asset carries the taxonomy facets: asset type, role, theme, game type, style, technical specs, licence, plus action words and synonyms | Done | M | — | `catalog/schema.js` defines the fields; every asset carries them; the build rejects an asset without them (`tests/unit/catalog-schema.test.mjs`, `catalog-load.test.mjs`). Technical specs are measured by the build. The licence field exists but all assets say `draft` (see ASSET-11). |
| FIND-2 | **Keyword search by the user's words.** Verbs and events ("jump", "chop", "level up"), synonyms (coin, gold, money), typo tolerance, results across all asset types. Instant, no model | Done | M | FIND-1, FIND-8 | Runs in the browser from the catalogue alone, then from the SQLite file; handles word stems, misspellings and the words each asset lists (`search/core.js`; `tests/unit/search-core.test.mjs`, `tests/e2e/search.spec.mjs`). Measured on a stand-in test set in `docs/search-eval.md`, not on real visitors' searches. |
| FIND-3 | **Faceted filters.** Role tree in a sidebar, then theme, style and technical filters that combine | Partly | M | FIND-1 | Filters for kind, "used for" (the role tree), type, theme, game type, view and bundle, combinable (`FILTER_GROUPS` in `app/browse.js`; `tests/unit/browse-tree.test.mjs`). Missing: technical filters such as frame size or number of animations. |
| FIND-4 | **Sticky style filter.** Pick "16px, top-down, 4 directions" once and it stays applied across sprites, sounds and music | Partly | S | FIND-3 | "View" and "Game type" are remembered across pages and visits (`createStyleMemory` in `app/browse.js`; `tests/unit/browse-state.test.mjs`); sounds and music ignore "View" and stay listed. Missing: pixel size as a filter, because every asset uses one pixel scale. |
| FIND-5 | **"Goes with" links.** Each asset page lists what pairs with it and on which frame, plus similar assets | Partly | S | FIND-1, FIND-8 | An asset page lists the sounds a sprite uses, the sprites that use a sound, the bundles it is in, and similar assets (`app/related.js`; `tests/e2e/wiring.spec.mjs`). Missing: which frame each sound plays on, shown on the sound's page. |
| FIND-6 | **Start from a game type.** "Building a platformer? Start here" leads to a checklist of what that game needs, with matching assets | Partly | M | FIND-1, ASSET-2 | The home page has a "Start from a kind of game" shelf that opens a bundle (`app/home.js`). Missing: a checklist of what that game type needs, shown against what the catalogue has. Only the platformer kit is complete (see ASSET-2). |
| FIND-8 | **Search index built with the site.** Every build writes one SQLite file: assets and facets, a keyword index, one vector per asset, and each asset's nearest neighbours | Done | M | FIND-1, BASE-8 | `tools/lib/search-index.mjs` writes `generated/search.sqlite` on every build: rows, a keyword index, one vector per asset, nearest neighbours. Vectors are compared in JavaScript. `tests/unit/search-index.test.mjs`. **Decision, Keyang, 2026-11-18 (search defaults S1 to S4 accepted, `search-design.md`; Contract 5):** SQLite file, English only, files served from the site. |
| FIND-9 | **Search by meaning.** An embedding model loads in the background and improves results, so "something for when the player dies" finds the right sounds | Partly | M | FIND-8 | Built and tested (`tools/lib/embed.mjs`, `search/embed-worker.js`, meaning tests in `tests/e2e/search.spec.mjs`) but **off by default, a switch the visitor turns on ("Smarter search")**. Decided by the orchestrating agent on 2026-11-18 after measurement, not by Keyang; he can reverse it. Reason: the best model missed the pass mark (about +7 points in the top 5 on the main set, against a mark of 15) and costs a 38.5 MB download (`docs/search-eval.md`). With it off, the visitor downloads 1.5 MB of SQLite and no model. |
| FIND-10 | **Search test set.** A stand-in catalogue of 300 to 500 entries and 60 to 100 searches with known right answers, used to pick the model and to catch regressions | Done | S | — | A stand-in catalogue of 490 entries and 140 searches with known answers (`tests/fixtures/search/`), and `tools/search-eval.mjs`, which writes the tables in `docs/search-eval.md`. It picked the model `Snowflake/snowflake-arctic-embed-xs`. |
| FIND-7 | **Catalogue at scale.** Pre-made thumbnails, paging or lazy loading, fast first paint with thousands of assets | Partly | M | BASE-2 | Cards show a thumbnail made by the build and load nothing more until hovered or pressed (`app/cards.js`; browser tests in `tests/e2e/browse.spec.mjs`). Tried at about 200 assets only. Missing: paging, and any test at thousands of assets. |
| FIND-11 | **Back to the same results.** An asset opened from a search has "Back to results" that returns to the same text, filters and place in the list. Added 2026-11-18 | Done | S | FIND-2 | `app/browse.js`, `app/back.js`; `tests/e2e/visitor.spec.mjs`. |

## B. Assets: the library and its quality

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| ASSET-1 | **Quality bar.** A written definition of "high fidelity, game ready" per asset type, stated as checks an agent can run and pass or fail without a person. Applies to routes 1 and 2 | Done | M | — | `docs/quality-bar.md` (the bar and rubric) and `quality/sprite.js`, `quality/sound.js` (the checks; `tests/unit/quality-*.test.mjs`). Contract 10. Whether passing means good to a person is unproven: see BASE-6. |
| ASSET-12 | **One checker, two places.** The same checks run in the site build (route 1) and in the browser (route 2), so an asset made through the live site meets the same bar | Done | M | ASSET-1 | The checks are pure JavaScript. The build and `tools/check.mjs` run them; `window.loadout.make.sprite` runs them in a worker on assets made in the browser (`tests/e2e/route2.spec.mjs`, `route2-safety.spec.mjs`). Verified in Chromium only. |
| ASSET-13 | **Automatic judging of look and sound.** An independent judge scores renders and audio against the written bar, so the agent that made an asset is not also the one grading it | Partly | L | ASSET-1 | `docs/review-protocol.md` is the procedure; every batch in this build was reviewed by a second agent that did not make it, and the orchestrator re-ran the checker. This is a manual step of the build loop, not code. Sound is still judged from measurements and spectrograms, not by ear. |
| ASSET-2 | **Cover one game type completely.** Enough assets for a full small platformer: 1 player, 3 enemies, tileset, 10 props and pickups, 5 effects, 3 background layers, UI set, 25–40 sounds, 3 music tracks | Partly | L | ASSET-3 | Platformer: complete in the committed files (47 sprites, 20 sounds, 2 tracks; `bundles/kit-platformer-fantasy.json`; `tests/e2e/three-bundles.spec.mjs`). RPG and sci-fi kits: 47 of 49 and 45 of 48 sprites committed as of 22:18, all sounds and tracks in; their bundle files are not written. The kits are 47 to 49 sprites each, not the single 1-player, 3-enemy list first written here. |
| ASSET-3 | **Missing asset types.** Tilesets that snap together, parallax backgrounds, UI sets, projectiles, item icons, character portraits, short musical jingles | Done | L | — | Now exist, each with a framework module and unit tests: tilesets (`engine/tiles.js`), backgrounds (`engine/backdrop.js`), interface pieces with stretch borders (`engine/ui.js`), projectiles (`engine/shots.js`), icons (`engine/icons.js`), portraits (`engine/faces.js`), jingles (3 sounds in category `jingle`). Each was reviewed. See ASSET-14 to ASSET-17. |
| ASSET-4 | **Top-down sprites.** Characters in 4 or 8 directions | Done | L | — | Top-down rig `rigs/topdown.js`; three directions drawn (down, up, side) and the fourth mirrored by the game (`docs/style-guide.md` section 5; Contract 2). Tests `tests/unit/framework-r05.test.mjs` and later. Eight directions are not supported. |
| ASSET-5 | **Layered character customisation.** Body, hair, clothes and hats as separate swappable layers | Partly | M | MAKE-8 | Parts (Contract 3) let a sprite wear or hold swappable things with their own settings; 33 sprites declare them. There is no general layer system. Hair, outfit and body as separate layers exist inside a rig (`rigs/humanoid-figure.js`, `rigs/topdown.js`), not as separate assets. |
| ASSET-6 | **Sound variants.** Several takes of one sound (3–4 footsteps), and surface versions (grass, wood, stone, snow) | Partly | S | — | "Play a variation" is on the sound page (`app/sound-page.js`); a download holds one take. Surface versions exist as separate sounds only (for example `footstep-grass`, `footstep-gravel`). |
| ASSET-7 | **More music.** Tracks for menu, exploration, boss, shop; victory and game-over jingles | Partly | M | — | 6 tracks (`thornwood-overworld`, `battle-theme`, `hearthvale-village`, `hearthvale-battle`, `derelict-run`, `derelict-boss`) and 3 jingles, with length and melody-instrument choices. Missing: shop and menu tracks. Unlistened. |
| ASSET-8 | **More art styles.** Other pixel sizes (16, 32), then non-pixel styles | Partly | L | — | **Decided by Keyang 2026-11-18 18:40 (Contract 12):** an asset may offer several styles; unsuitable styles are left out per asset; the framework must support different rendering and export pipelines. The seam is built (`engine/styles.js`; pixel is the only registered style, and the setting is named `artStyle`); it is proved with two test-only styles in `tests/fixtures/styles/` and `tests/unit/styles-*.test.mjs`. No real asset has a second style. See also BASE-14 and the "flat Hero" test in the decisions table. |
| ASSET-9 | **Physics for 2D sprites.** Collision shapes, hit and hurt boxes per frame, rigid-body settings, exported with the sprite | Not started | L | — | Named in the vision as later work |
| ASSET-10 | **3D assets.** | Not started | L | Decision D3 | "Coming soon" in the vision; approach not chosen |
| ASSET-11 | **Licence on every asset.** | Partly | S | Decision D5 | `license` is a required field (`catalog/schema.js`, values draft / free / attribution / commercial). All 197 assets in the last local build say `draft`. Decision D5 is still open. |
| ASSET-14 | **Tile helper and tilesets.** One function lays tiles out from a map and picks the right piece at every join; sample maps are rendered for the eye. Added 2026-11-18 | Done | L | — | `engine/tiles.js`, `engine/maptext.js`, `tools/tilemap.mjs`; 13 tilesets (forest, platforms, cave, water, castle, dungeon, meadow, village, shore, station floor and others). Tests `tests/unit/tiles-*.test.mjs`. One more tileset (`sprites/tiles-pit.js`) is on disk and not committed at 22:18. |
| ASSET-15 | **Backdrops.** Wide, horizontally repeating background layers with checked seams. Added 2026-11-18 | Done | M | — | `engine/backdrop.js`; 2 backgrounds committed (castle, forest); two battle backgrounds and a starfield are on disk and not yet committed. `tests/unit/backdrop-helper.test.mjs`, `backdrop-sprites.test.mjs`. |
| ASSET-16 | **Interface pieces.** Stretchable panels, bars, menus and cursors, exported with stretch borders and a cursor hot spot. Added 2026-11-18 | Done | M | — | `engine/ui.js`, `engine/ui-wood.js`; 12 interface sprites. Contract 8 lists the exported fields. A contrast check across looks is a test (`tests/unit/ui-contrast.test.mjs`); other tests are `ui-helper`, `ui-export` and `ui-sprites`. |
| ASSET-17 | **Effects, projectiles, icons and pickups.** Shared helpers for bursts, trails, shots and item icons. Added 2026-11-18 | Done | M | — | `engine/fx.js`, `engine/shots.js`, `engine/icons.js`, `engine/pickups.js`, `engine/palettes.js`; 17 effects, 9 projectiles, 7 icons, 11 pickups in the last local build. |
| ASSET-18 | **Faces and portraits.** A head and shoulders drawn from a description, in plain and framed versions and several moods. Added 2026-11-18 | Done | S | — | `engine/faces.js`; two portrait sets (party and village); test `tests/unit/framework-r15.test.mjs`. |
| ASSET-19 | **Quality checker rules added during the build.** Sprites: frame edges (including far ends and shape looks), tile seams and decals, background wrap, controls that must show or must stay quiet, survives every look. Sounds: onset time, phone-speaker energy, every style, random and timing controls, chords, crest. Added 2026-11-18 | Done | M | ASSET-1 | `docs/quality-bar.md` sections 1 and 2 list each rule; `tests/unit/quality-edges.test.mjs`, `quality-looks.test.mjs`, `quality-sound-*.test.mjs`. Some rules are warnings, not errors. Twelve older sounds still warn; a batch to clear them is running. |
| ASSET-20 | **Art direction.** A style guide, a palette per bundle and a written specification and batch plan for each kit. Added 2026-11-18 | Done | M | — | `docs/style-guide.md` (15 sections), `bundles/specs/*.md` and `*.plan.json`. Independently reviewed twice; fixes applied. |
| ASSET-21 | **The library beyond the three kits.** A plan for 126 bundles (4,219 sprites, 2,615 sounds, 654 tracks). Added 2026-11-18 | Not started | L | — | `docs/asset-plan.md` is a plan only. Keyang approved its direction; no production is authorised (decision P6 in that file). |

### What the quality bar checks

`docs/quality-bar.md` is the full list. In short, as of 22:18 on 2026-11-18:

- **Sprites** (`node tools/check.mjs`): the sprite renders at about 50 combinations of settings without error; nothing is clipped by the frame, including at the far end and at changed proportions; same input gives the same pixels; loops close; feet on the ground line; colour count; sound ids exist; every control changes the picture by a visible amount and none is dead where it applies; a control that is not in effect changes nothing; tiles join without seams; backgrounds repeat without a seam; metadata is complete; the sprite stays readable under whole-bundle looks (a warning, not an error).
- **Sounds and music** (`node tools/sfx.mjs check`): the patch is valid; no clipping; starts at once; every slider changes the sound audibly; loop seam is clean; detected tempo matches the written tempo; chords per bar; energy a phone speaker can play; every named style stays inside its length range. Several of these are warnings.
- **Judged by a second agent, not by code** (`docs/review-protocol.md`): whether the asset reads as what it is, whether motion has clear poses, whether a sound fits its brief and its animation frame, whether music instruments are balanced by ear. The second agent works from renders, spectrograms and measurements. No person has judged any asset (BASE-6).
- **Not checked at all**: that the licence is settled (ASSET-11).

## C. Customise

### Parts: customising one level below

Set by Keyang on 2026-11-18. A sprite is not one flat list of sliders. It holds or wears **parts**, and each part has settings of its own.

| Level | Example | Settings at this level |
|---|---|---|
| Sprite | Hero | Height, build, colours, motion |
| Part, one level below | The weapon the Hero holds | Which weapon, its length and colours, the angle it is held at, how far it swings |

Other parts work the same way: a hat, a shield, a cape, a wizard's staff, a wolf's tail, a slime's topping.

**This has to be designed in when an asset is made**, not added afterwards. An asset's author decides what its parts are, where each attaches, and what can be changed on each. Today the Hero's weapon is a single choice (sword, axe, spear, none) with no settings of its own, and the site shows only three fixed groups of controls.


| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| EDIT-1 | **Sprite sliders.** Look, colours and motion, with every animation redrawn live | Done | — | — | `app/sprite-page.js`; browser tests `tests/e2e/smoke-sprite.spec.mjs` and `parts.spec.mjs`. |
| EDIT-2 | **Sounds on animation frames.** Pick, time, style, adjust, duplicate, remove | Done | — | — | `app/sprite-page.js`. Duplicate and an 8-sound limit per animation were added in a fork session. Sounds that do not apply to the current settings are left out of exports (`when` on sounds, Contract 3). |
| EDIT-3 | **Sound sliders and styles.** | Done | — | — | `app/sound-page.js`; `tests/e2e/smoke-sound.spec.mjs`. |
| EDIT-4 | **Music controls.** Live sliders, styles, length, melody instrument | Done | — | — | `app/music-page.js` plays through an audio worklet; works for all 6 tracks. Not listened to by anyone. |
| EDIT-7 | **Part settings, one level below.** Choosing a part on a sprite opens that part's own controls: its shape, colours, hold angle, swing. Controls for a part disappear when the part is set to none | Done | M | MAKE-8 | **Decided by Keyang 2026-11-18 (parts, Contract 3).** A sprite declares `parts`; choosing one opens its own controls; they disappear at `none`. 33 sprites declare parts. Tests `tests/e2e/parts.spec.mjs`, `tests/unit/parts-engine.test.mjs`, `parts-hero.test.mjs`. Hero's weapon is the worked example. |
| EDIT-8 | **Parts shared between sprites.** A sword is an asset of its own that fits any character with a hand; a hat fits any head | Not started | L | EDIT-7, FIND-1 | Parts are shared between sprites on the same rig (the rig's part tables, read with `tools/rig.mjs`), but a part is not an asset of its own and cannot be found in search or used alone. |
| EDIT-5 | **One-button variations of an asset.** Several good-looking alternatives side by side to choose from | Partly | S | — | "Surprise me" gives one random result at a time on sprite, sound and music pages. Several alternatives side by side do not exist. |
| EDIT-6 | **One-button variations of a whole bundle.** Restyle every asset in a bag or kit together so they still match: shared palette, theme, tone | Done | L | BAG-1, FIND-1 | **Decided by Keyang 2026-11-18 (Contract 7).** One bundle page (`#/bundle/<id>`, `app/bundle-page.js`) restyles every asset together with a named look or colour, pitch, brightness, tempo and seed controls; the bag has the same block (`app/theme-controls.js`). Engines: `engine/theme.js`, `sound/theme.js`. `tests/e2e/whole-bundle.spec.mjs` checks previews, bag, playground and download for every bundle in the catalogue. |

## D. Bag and package

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| BAG-1 | **Bag.** Add any asset with its current settings; see, edit and remove items; the bag survives a page reload | Done | M | — | `app/bag.js`, `#/bag`; kept in the browser; the whole bag travels in one link; a bag-level look applies to everything (Contracts 6, 7). `tests/unit/bag-core.test.mjs`, `tests/e2e/bag.spec.mjs`. |
| BAG-8 | **Bag holds assets that are not in the catalogue.** An asset an agent or a person made in the browser is stored in the bag with its full definition | Done | M | BAG-1, MAKE-7 | A bag item made in the browser carries its source or patch (`app/bag.js` header; Contract 11). A link carrying one asks first, then re-checks it. `tests/e2e/route2.spec.mjs`, `route2-safety.spec.mjs`. Chromium only. |
| BAG-2 | **Download the bag as one resource package.** A zip with every sprite sheet, sound and track, one manifest, and a guide | Done | S | BAG-1 | `packageFiles` in `app/bundle.js`: sprite sheets, JSON, WAVs, tracks, one manifest and a guide; a bundle or the bag. The export choice shows Unity package as "coming later" (decided by Keyang 2026-11-18, Contract 8). `tests/e2e/journey.spec.mjs`, `bag.spec.mjs`. |
| BAG-3 | **Preview the package in game templates.** Before downloading, play the bag's assets inside small template games (platformer, top-down, and so on) | Partly | L | BAG-1, FIND-1 | **Decided by Keyang 2026-11-18 (Contract 9): "Play" is a playground for trying bag assets, not fixed template games.** `#/play` has side-view and top-down modes; each asset's role comes from its metadata (`app/play/roles.js`). `tests/e2e/play.spec.mjs`, `tests/unit/play-*.test.mjs`. As of 22:18 a builder is fixing four faults found in review (walking through buildings, standing in front of water, and two more). Not tried by a person. |
| BAG-4 | **Export as a Unity package.** Sliced sprites, animation clips and controllers, audio clips, sounds wired to animation frames, prefabs | Not started | L | BAG-2 | Today the download is engine-neutral with written Unity steps. Never tested in Unity. Decided by Keyang 2026-11-18: not built in this loop. With parts, a part could be exported as its own layer with its attach point per frame (sockets, Contract 3); not done. |
| BAG-5 | **Other engine exports.** Godot, web engines | Not started | M | BAG-2 | After Unity |
| BAG-6 | **Packs at three levels.** Object bundle (chest + sparkle + creak), character bundle, game kit | Partly | M | FIND-1 | Four bundle files, all marked level `kit`. A sprite with its sounds is an object bundle; character and object levels are not separate things in the files. |
| BAG-7 | **Bundles modelled on real games.** A resource bundle that covers what a named kind of game needs, as a worked example | Partly | L | ASSET-2, BAG-6, Decision D4 | Three kits specified in `bundles/specs/` for three game types chosen from the top 100 2D games (`docs/game-types-research.md`): platformer, turn-based RPG, roguelike action. Platformer is built; the other two are waiting on last assets. Rule in `docs/asset-plan.md`: a real game is a checklist of asset roles, never a design to copy (D4, approved direction). |

## E. Create: the three routes and the framework

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| MAKE-1 | **Route 1: agent skill.** Instructions an agent follows to make a sprite, sound or track in the site's source and check it against the quality bar | Done | — | ASSET-1 | `../../skills/sprite-forge/SKILL.md` and `SOUND.md`, rewritten 2026-11-18 for the bar, metadata, parts and the framework rule (Contract 11). Fresh-agent test at 17:29: a key pickup built from the skill alone with no checker errors or warnings. The 130 sprites and 37 sounds made after that were built by agents working from it, each under an independent review. |
| MAKE-2 | **Route 2: MCP server.** Lets an agent search the library, customise an asset, build a new one through the live site, check it, and add it to the bag | Not started | L | MAKE-6, MAKE-7, FIND-8 | Not built. **Decided 2026-11-18 (Keyang, progress log): the MCP route is outside this loop; the `window` functions are inside it.** `generated/api.json` already lists 14 actions in the shape MCP tool lists use. Whether to build the server next is an open decision for Keyang. |
| MAKE-6 | **Site functions for agents.** A documented set of functions on `window`: search, open, set sliders, define a new sprite or sound, run the checks, get renders back as pictures, add to bag | Done | M | ASSET-12, BAG-1 | **Decided by Keyang 2026-11-18 17:50 (Contract 11).** The whole framework and 14 high-level actions on `window.loadout` (`app/api*.js`), described in `generated/api.json` and `generated/api.md` by `tools/lib/api.mjs`; a test fails when an export has no description. `tests/e2e/api.spec.mjs`, `tests/unit/api-*.test.mjs`. Review passed on completeness (a new module appeared with no other edit). Chromium only. |
| MAKE-7 | **Assets made in the browser.** A sprite or sound defined at run time, without a site rebuild, drawn and played like a catalogue asset | Done | M | — | `loadout.make.sprite` and `make.sound` define, check, draw, bag and export assets at run time; `tests/e2e/route2.spec.mjs` does it with `window.loadout` only. Safety rules (Contract 11): a made source runs only in a stoppable worker with network, storage and page access removed; a same-site content policy; anything from storage or a link is re-checked; the quality verdict comes from a second worker that never loads the source. Verified in Chromium; see MAKE-13. |
| MAKE-3 | **Route 3: studio.** A place on the site where a person makes new sprites, sounds and music with the framework. Lower priority; not held to the quality bar | Not started | L | Decision D2, MAKE-7 | Out of this loop (Keyang, 2026-11-18). Rigs as data (MAKE-9) is the groundwork. Decision D2 still open. |
| MAKE-4 | **Route 1: publishing.** A new asset file goes through the automatic quality bar in the site build and is published to the catalogue if it passes | Partly | M | ASSET-1, BASE-8 | `node tools/build.mjs` validates every asset, runs the quality bar and fails on errors; dropping a new asset file in makes it searchable with no other edit (the "G3" test, `tests/e2e/newasset.spec.mjs`). Missing: the build does not run on its own on each change, and nothing publishes (BASE-2). |
| MAKE-8 | **Parts in the framework.** A way for a sprite file to declare its parts, where each attaches on the body in every frame, and each part's own settings; the checker tests parts at every setting of the sprite | Done | M | — | **Decided by Keyang 2026-11-18 (parts, Contract 3).** Built; commit `ac6d784`. Parts, `when`, sockets; the checker tests parts at every setting (`tests/unit/parts-engine.test.mjs`). Review failed on small defects once; ten fixes were verified. |
| MAKE-5 | **Framework gaps.** Shared rigs for four-legged and flying creatures, tiles, top-down bodies; the sound engine as one maintained copy | Partly | L | — | **Decided by Keyang 2026-11-18 17:50 (Contract 11): makers add missing functions to the framework, not to the asset file.** Now exist: side-view and top-down humanoid rigs, a four-legged rig (`rigs/quadruped.js`), a crawler rig, tile, backdrop, interface, effects, palette and face modules, a music-writing kit. Missing: a rig for flying creatures. The sound engine is still a hand-merged copy that has diverged from `experiment/procedural-sfx`. |
| MAKE-9 | **Rigs separate from sprite definitions.** A rig is the code (body, poses, parts it can wear or hold); a sprite built on a rig is data only, so adding a part or an animation the rig knows is a change to data | In progress | L | MAKE-5, MAKE-8 | **Decided by Keyang 2026-11-18 18:51 (Contract 13): the rig is code, a sprite on a rig is data only.** Built so far: three rigs describe themselves as data (`rigs/*-describe.js`; side view 18 poses and 21 parts, top-down 15 poses and 39 parts, kiosk 3 poses), `tools/rig.mjs`, tests that fail when a part is not described; two sprites (battle rogue, road bandit) hold choices only (`rigs/humanoid-figure.js`). Of 17 rig sprites at 21:44: 2 data, 10 thin wiring, 2 wiring plus pose code, 3 still draw. Not built: the generic renderer and data-only definitions as files. Waiting on R2 to R4. |
| MAKE-10 | **Tile and scene tools.** Render a tileset's map, or a whole scene from several tilesets, so joins can be looked at. Added 2026-11-18 | Done | S | ASSET-14 | `tools/tilemap.mjs`, `tools/scene.mjs`; used by every tileset builder. |
| MAKE-11 | **Rig tool.** Lists a rig's poses, parts, held things and sockets as tables, and draws contact sheets. Added 2026-11-18 | Done | S | MAKE-9 | `tools/rig.mjs`; `tests/unit/rig-describe-tool.test.mjs`. |
| MAKE-12 | **Music-writing kit.** Functions for writing a track bar by bar, a range check per instrument, a chord check, level matching, and a test that no two tracks share a chord order. Added 2026-11-18 | Done | M | — | `sound/compose.js` (browser-safe, on `window.loadout`), `tools/compose/kit.mjs`, one generator per track in `tools/compose/`. `tests/unit/compose-*.test.mjs`. Verified by measurement only. |
| MAKE-13 | **Safety of assets made in the browser.** Limits and isolation so a made sprite cannot reach the visitor's storage or another site. Added 2026-11-18 | Partly | M | MAKE-7 | Contract 11, written by the orchestrating agent after review findings, not by Keyang. Verified in Chromium: five findings closed, attacks on the worker failed, forged verdict now rejected. Firefox and Safari untested (BASE-12). A setting the bar never sampled can still draw anything on a page, though not in a download. |
| MAKE-14 | **Bundle builder.** Writes `bundles/<id>.json` from a kit's plan once every listed asset exists. Added 2026-11-18 | Done | S | ASSET-20 | `tools/bundles-from-plans.mjs` (`--check` writes nothing and exits 1 if a plan is incomplete). |

## F. Platform

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| BASE-1 | **Name.** One name for sprites, sounds, music and 3D | Partly | S | — | Named **Loadout** by Keyang on 2026-11-18. The site, docs and skill text use it. The folder `lab/sprite-forge`, the skill id and the preview entry keep the old name (Keyang: leave them). Domain and trademark have not been checked. |
| BASE-2 | **Hosting on GitHub Pages.** A public address serving static files only | Not started | S | BASE-8 | Out of this loop (Keyang, 2026-11-18). A local git repository exists (121 commits, none pushed). The site is served locally only. |
| BASE-3 | **Accounts and saved bags.** | Not started | M | BASE-2, BAG-1 | Not possible on a static site without an outside service. The bag is kept in the browser and shared by link instead |
| BASE-4 | **Usage tracking.** What people search for, open, change, bag and download | Not started | S | BASE-2 | The cheapest way to test demand, which the scan rated weak. Searches with no result say what to build next. Needs a third-party analytics script |
| BASE-5 | **Speed.** Long music builds in about half a minute; move heavy rendering off the page or pre-render it | Partly | M | BASE-2 | Music renders on a background thread. Cards load only a thumbnail. The quality bar runs in a worker and keeps a cache. A 32-bar music download takes about half a minute. |
| BASE-6 | **Calibrate the automatic bar.** Now and then a person looks at and listens to a sample of assets that passed, to confirm the automatic bar agrees with human judgement. Not a gate on any asset | Not started | S | ASSET-13 | Added by Claude, not in Keyang's brief. Nothing made so far has been judged by a person, so there is no evidence yet that passing the checks means good |
| BASE-7 | **Automated site tests.** | Done | S | — | 140 unit test files (`npm test`) and 21 browser test files (`npm run e2e`); `tests/README.md` says how to add more. Counts at the last full run are in the "Where the project is today" list. |
| BASE-8 | **Site build.** One command, also run automatically on every change, that checks every asset, builds the search index and thumbnails, and writes the folder to publish | Partly | M | — | `npm run build` validates, writes the catalogue, thumbnails, SQLite index, vendor copies and the framework's description, and with `--dist` the folder to publish. Missing: it does not run on its own on each change, and nothing publishes it. |
| BASE-9 | **Size and traffic budget.** Keep the site under 1 GB and the monthly traffic under 100 GB: thumbnail sizes, the embedding model, when to move large files elsewhere | Not started | S | BASE-8 | As of 22:18 the local build output is 3.5 MB (`generated/`) and 39 MB of vendor files (mostly the model and SQLite), 44 MB for `dist/`. No budget is enforced. |
| BASE-10 | **Acceptance tests written as a person would use the site.** Search to export at desktop and phone width; whole-bundle looks for every bundle; the three kits' sizes; a new asset file from search to zip. Added 2026-11-18 | Done | M | — | `tests/e2e/journey.spec.mjs`, `whole-bundle.spec.mjs`, `three-bundles.spec.mjs`, `newasset.spec.mjs`, `visitor.spec.mjs`. Planted-bug checks caught 13 of 13, 8 of 9 and 2 of 2 at 21:23. The kit-size test passes only for kits whose bundle file exists. |
| BASE-11 | **Same-site only.** Fonts are served from the site and a content policy lets pages load from the site only. Added 2026-11-18 | Done | S | — | `tests/e2e/same-origin.spec.mjs`. |
| BASE-12 | **Check the safety rules in Firefox and Safari** before any public release. Added 2026-11-18 | Not started | S | MAKE-13 | `tests/e2e/route2-browsers.spec.mjs` runs in any installed browser and skips the rest. Only Chromium is installed. Needs `npx playwright install firefox webkit`, a download not yet approved (see decisions). |
| BASE-13 | **Review and build loop.** Each batch of assets is built by one agent and judged by an independent one, up to two fix rounds. Added 2026-11-18 | Done | M | ASSET-13 | The workflow and its results are in `docs/progress.md`. Process, not product code. |
| BASE-14 | **Style seam tests.** Every existing sprite draws and exports unchanged when the style system is present. Added 2026-11-18 | Done | S | ASSET-8 | `tests/unit/styles-identical.test.mjs`, `tests/e2e/styles.spec.mjs`. |

---

## Suggested order

My recommendation, not a decision. As of 22:18 on 2026-11-18, steps 1 to 6 below are done or nearly done; the list is kept so the order of dependencies is visible. Marked **done** below means the rows named are Done or Partly in the tables above.

1. **FIND-1 metadata, with FIND-10 search test set alongside.** Done.
2. **BASE-8 site build and FIND-8 index, then FIND-2, FIND-3 and FIND-9.** Done, except technical filters (FIND-3) and a search-by-meaning result that meets its pass mark (FIND-9).
3. **BAG-1 and BAG-2 bag and download.** Done.
4. **ASSET-1 quality bar, ASSET-12 and ASSET-13.** Done for the automatic half. The judged half runs as a manual review step.
5. **MAKE-8 and EDIT-7 parts, before the library grows.** Done.
6. **ASSET-3 and ASSET-2 fill out one game type.** Done for the platformer; the RPG and sci-fi kits are 2 and 3 sprites short of committed.
7. **BAG-3 template preview.** Replaced by the playground (Contract 9); partly done, fixes running.
8. **BAG-4 Unity export.** Next real piece of product work. Not started.
9. **EDIT-6 and BAG-7 bundle variations and real-game bundles.** EDIT-6 is done; BAG-7 has one of three kits ready.
10. **Route 2:** MAKE-7, MAKE-6 and BAG-8 are done in Chromium. MAKE-2, the MCP server, is the open item. Route 3, the studio (MAKE-3), comes after and is lower priority.
11. **Before any public release:** BASE-12 (Firefox and Safari), ASSET-11 (licence), BASE-6 (a person listens to and looks at a sample), then BASE-2 (hosting).
12. **Later:** ASSET-9 physics, ASSET-10 3D, ASSET-8 other styles, MAKE-9 rigs as data, ASSET-21 the larger library.

## Decisions

### Made

| Id | Decision | Made by, when | Where it is recorded |
|---|---|---|---|
| D1 | The product is called **Loadout** | Keyang, 2026-11-18 | BASE-1 |
| D7 | First game types: platformer, turn-based RPG, roguelike action, chosen from the top 100 2D games | Chosen by the research task under Keyang's brief, 2026-11-18 | `docs/progress.md`, `docs/game-types-research.md` |
| D8 | Search defaults S1 to S4: SQLite file, English, model served from the site, background download | Keyang accepted the defaults, 2026-11-18 | Contract 5, `docs/search-design.md` |
| D9 | Search by meaning is off by default and offered as a switch | The orchestrating agent, 2026-11-18 17:00, after measurement. Keyang can reverse it | FIND-9, `docs/search-eval.md` |
| D10 | Export: the user chooses zip or Unity package; Unity is shown as "coming later" | Keyang, 2026-11-18 | Contract 8, BAG-2 |
| D11 | "Play" is a playground for trying bag assets, not fixed template games | Keyang, 2026-11-18 | Contract 9, BAG-3 |
| D12 | Two layers: the framework and the assets; makers add missing functions to the framework; the framework is on `window.loadout` and describes itself | Keyang, 2026-11-18 17:50 | Contract 11, MAKE-5, MAKE-6 |
| D13 | Run-time asset safety design (worker, content policy, re-check, limits) | The orchestrating agent, after review findings, 2026-11-18 | Contract 11, MAKE-13 |
| D14 | Assets may come in several styles; the framework supports other rendering and export pipelines; not a priority | Keyang, 2026-11-18 18:40 | Contract 12, ASSET-8 |
| D15 | Rigs are separate from sprite definitions: the rig is code, a sprite on a rig is data | Keyang, 2026-11-18 18:51; reading confirmed by him | Contract 13, MAKE-9 |
| D16 | The three bundles hold 40 to 50 sprites, 20 sounds and 2 tracks each | Keyang, 2026-11-18 | `docs/progress.md` |
| D17 | Out of this loop: MCP server, studio, physics, 3D, hosting, accounts | Keyang, 2026-11-18 | `docs/progress.md` |
| D18 | The library plan's direction: reference games are checklists, original worlds, bundles in waves. No production authorised beyond the three kits (P6) | Keyang, 2026-11-18 | `docs/asset-plan.md` |
| D19 | Local commits allowed, no pushing; folder and skill keep the old name | Keyang, 2026-11-18 | `docs/progress.md`, BASE-1 |
| D20 | Kits may be smaller than a full kit (12 to 50 sprites, 8 to 30 sounds, 1 to 4 tracks); the acceptance test still needs three full kits (D16) | Keyang, 2026-11-19 | `SMALL_KIT_SIZE` in `tools/lib/assets.mjs`, `tests/helpers/kits.mjs` |

### Open, for Keyang

| Id | Decision | Why it matters |
|---|---|---|
| R2 | Is a sprite definition a JSON file, or a data object in a `.js` file as today? (Contract 13) | Decides how the rigs-as-data work (MAKE-9) is built and whether a link or bag can hold a definition without code |
| R3 | Are the 17 rig sprites converted, or only new ones written as data? (Contract 13) | Decides the size of MAKE-9. At 21:44: 2 are data, 10 thin wiring, 2 wiring plus pose code, 3 draw their own parts |
| R4 | Are new animations key poses in data (a list of joint settings the engine blends between): in scope, or later? (Contract 13) | Without it, a new animation still needs code |
| M1 | Is the MCP server itself wanted next? | MAKE-2. The `window.loadout` functions and `generated/api.json` it would call exist; how the server reaches the open page is not designed |
| F1 | Run the "flat Hero" style test named in `docs/sprite-styles.md`: draw the Hero flat from the same body and look at it beside the pixel Hero | Gates every second-style decision (ASSET-8; P8 in `docs/asset-plan.md`). Not done |
| B1 | Install Firefox and Safari test browsers (`npx playwright install firefox webkit`, a download) to verify the safety rules there | BASE-12. Required before any public release; if the checks fail, made sprites must be switched off in that browser |
| FP | Adopt a `footprint` field on sprites, proposed by the playground's builder: `{ left, right, depth }` in pixels from the pivot, for things that need a shape other than the one measured from the drawing (an arch, an L-shaped house) | Today the playground measures what blocks the way from the drawing (`app/play/kinds.js`, `footprintOf`); a few sprites would be wrong |
| S5 | Search by meaning: keep the default off, or turn it on | FIND-9. Off costs nothing; on is a 38.5 MB first download for a gain of about 7 points in the top 5 |
| D2 | Who is the studio for: non-technical people, technical creators, or both? Can wait | MAKE-3 |
| D3 | How will 3D assets be made, and do they share this framework? | ASSET-10 |
| D4 | For bundles modelled on real games, how close is acceptable? The rule in the plan is checklists only | BAG-7; confirm the rule |
| D5 | What licence do assets carry, and is anything paid? | ASSET-11, and anything public. All assets say `draft` |
| D6 | Is this still a personal lab experiment, or does it move to a project with its own record under `projects/`? | Where tickets, hosting and people come from |
| P1 to P8 | The library plan's decisions: what counts as a sprite, reference game names, pixel scale, sample checks by a person, go-ahead for wave 1 and others | `docs/asset-plan.md` section 13 lists each with a recommendation |
| H1 | When does a person listen to and look at a sample of assets? | BASE-6. Nobody has yet, so there is no evidence the automatic bar means good |
