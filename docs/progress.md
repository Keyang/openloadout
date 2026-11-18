# Loadout build loop: progress

Started 2026-11-18 16:06. The orchestrator updates this file at every step. A new loop iteration reads it first.

## Goal: the loop stops when all four are verified

| # | Goal | Verified by | State |
|---|---|---|---|
| G1 | Three asset bundles for the top three 2D game types, each with 40–50 sprites, 20 sounds, 2 music tracks | Bundle manifests resolve; every asset passes the quality bar and review | Not started |
| G2 | End to end: search, customise, add to bag, play in the playground, export (zip; Unity shown as coming later) | Browser test that walks the whole path | Not started |
| G3 | Build and search system ready for more assets and bundles | Dropping a new asset file in and running the build makes it searchable with no other edit; tests pass | Built and committed: one build writes catalogue, thumbnails, sounds file, search index and vendor files. End-to-end proof through the site's search box pending W2-A |
| G4 | Whole-bundle customisation | Browser test: one change restyles every asset in a bundle, in previews, playground and export | Built, in review: bundle page restyles every asset; bag and download follow. Playground carry-through pending |

## Decisions from Keyang (2026-11-18)

- Game types: chosen by research on the top 100 2D games (task W1-R). Result: **platformer** (side view, fantasy), **turn-based RPG** (top-down overworld, side-view battles, fantasy), **roguelike action** (top-down, sci-fi). Bundle ids: `kit-platformer-fantasy`, `kit-rpg-fantasy`, `kit-roguelite-scifi`.
- Bundle size: 40–50 sprites, 20 sounds, 2 music tracks each.
- "Play" is a playground for trying bag assets, not fixed template games.
- Export: the user chooses zip or Unity package; Unity is "coming later" and not built in this loop.
- Git: local commits allowed, no pushing. Dependencies and one embedding-model download allowed.
- Search defaults accepted: SQLite file, English, model served from the site, background download. After measurement and review (2026-11-18 17:00) the orchestrator made search by meaning an opt-in switch, off by default: it missed the pass mark and costs 38.5 MB. Keyang can reverse this.
- Out of this loop: MCP route, studio, physics, 3D, hosting, accounts.
- In this loop: parts, the automatic quality bar with an independent reviewer.
- No ceiling on time or spend. The project is called Loadout.

## Setup done

- Git repository created in `lab/sprite-forge`, baseline commit `7109215`.
- npm packages installed: `@sqlite.org/sqlite-wasm` 3.54.1, `@huggingface/transformers` 4.3.2, `@playwright/test` 1.65.1; Playwright's Chromium downloaded.
- Checked: Node's built-in SQLite has the keyword index (FTS5); the embedding runtime loads in Node.
- `docs/architecture.md` written: the contracts every builder works to.
- `tools/lib/assets.mjs` written: finds assets by scanning folders.

## Work items

Status: todo · building · review · fixing · done · blocked

### Wave 1: foundations (parallel)

| Id | Task | Features | Owner model | Status | Notes |
|---|---|---|---|---|---|
| W1-R | Research top 100 2D games, pick three game types, outline each bundle | G1, D7 | opus | done | `docs/game-types-research.md`. Top three of 100: platformer 25, turn-based RPG 10, roguelike action 8 (tied with adventure / visual novel at 8; chosen because it is rising on Steam and needs more sprites). Two of the three are top-down |
| W1-A | Metadata schema, backfill 27 assets, bundles format, build → catalogue, thumbnails, strips | FIND-1, BASE-8, BAG-6 | opus | done | Committed `ed82fe5`. 50 tests. Review passed after one round of fixes. Game types are now `platformer`, `turn-based-rpg`, `roguelike-action` plus six others |
| W1-B | Search: index builder, keyword + meaning search library, browser client, test set and evaluation | FIND-2, 8, 9, 10 | fable | done | Committed `32217a7`. 42 unit and 11 browser tests. Review FAIL on four small fixes, all fixed and verified by the orchestrator. Search by meaning is opt-in, off by default (38.5 MB for little gain on untuned searches); with it off the site downloads 1.5 MB of SQLite and no model |
| W1-C | Test setup: static server, Playwright harness, smoke tests of today's pages, engine unit tests | BASE-7 | sonnet | done | Committed `99c2ea0`. 53 unit and 70 browser tests. Three review rounds; round 2 caught all 5 planted bugs and found one flaky test, since fixed and repeated 84 times clean by the orchestrator |
| W1-D | Quality bar as a shared library, new checks, written bar and review protocol | ASSET-1, 12, 13 | opus | done | Committed `99c4008`. 83 tests. Two review rounds plus a final fix verified by the orchestrator. All 7 existing sprites pass; full sound run in progress |

### Wave 2: the product (after wave 1)

| Id | Task | Features | Status |
|---|---|---|---|
| W2-A | Site reads the catalogue; search-first home, results with filters, sticky style filter, cards that load nothing until seen (fable) | FIND-2, 3, 4, 5, 7 | building |
| W2-B | Parts in the framework and on the sprite page; Hero's weapon as the worked example (fable) | MAKE-8, EDIT-7 | done — committed `ac6d784`. 62 unit and 21 browser tests. Review FAIL on small defects; ten fixes made and verified (the orchestrator viewed the hairless hood and the new punch) |
| W2-C | Bag and export chooser (opus) | BAG-1, BAG-2 | done — committed `d46d72e` (bag page and wiring in shared files follow with the site refactor). 23 unit and 13 browser tests. Review passed; follow-up round done: wired into the sprite page, sounds that do not apply are left out of exports, duplicate-on-reload bug fixed, shorter links |
| W2-D | Themes. D1 engines — done (`ed2a65e`). D2: bundle page with whole-bundle controls (opus) — fixing after review: looks, bag carry-through, downloads, links and cleanup all passed; a sound replayed after a look change stayed unstyled, small sprites drew at 1x, shaped sprites could be cropped, live music ignored brightness | EDIT-6, BAG-6 | fixing |
| W2-E | Playground: side view and top-down, roles from metadata (fable) | BAG-3 | fixing — first pass done (27 min): 50 unit and 13 browser tests; roles decided from metadata in a fixed order; both modes work with fixtures. Alignment round running: the style guide's tile, clip, background and size conventions arrived after it started |
| W2-F | Skill rewrite for today's contracts, tested on a fresh agent (opus) | MAKE-1 | building |

### Wave 3: content (after W1-R, W1-A, W1-D, W2-B, W2-F)

| Id | Task | Status |
|---|---|---|
| W3-S | Art direction: global style guide, one specification and batch plan per bundle (fable) | review — done by the builder (36 min, 449k tokens): 130 new sprites, 37 new sounds, 5 new tracks in 59 batches; 21 existing assets reused. Independent review running |
| W3-H | Shared helpers, each with its first batch as the worked example: H1 palettes and effects; H2 tiles + forest and platform tilesets; H3 top-down rig + hero-walker; H4 backdrops + two backgrounds; H5 interface + RPG interface set; H6 music kit + first track; H7 side-view poses + changes to the five reused sprites | building (7 agents) |
| W3-X | Fix the existing sprites that fail the new bar | done: all 7 pass; slime and wolf keep small warnings |
| W3-P | Production: batches of builders, each with an independent reviewer and up to two fix rounds (workflow `loadout-produce`) | run 1 started: six sound batches, 37 sounds (sonnet builders, opus reviewers) |

Per bundle: a specification and style guide, then batches of builders with an independent reviewer per batch. 40–50 sprites, 20 sounds, 2 tracks each.

### Wave 4: integration

End-to-end browser tests for G2 and G4, full build, final review, README and features update.

## Log

Times are read from the clock or from commit times. Entries before 16:27 were first written with estimated times and were corrected then.

| Time | Event |
|---|---|
| 16:06 | Loop started. Baseline committed (`7109215`). |
| 16:09 | Dependencies installed, architecture and this file written, setup committed (`bc573f8`). |
| 16:10 | Wave 1 launched: five agents in parallel (W1-R research, W1-A metadata and build, W1-B search, W1-C tests, W1-D quality bar). |
| 16:15 | W1-C builder finished (4.5 min, 187k tokens). Orchestrator re-ran both suites: all pass. Reviewer launched. |
| 16:19 | W1-R research finished (7 min, 142k tokens) and committed (`c57b956`). All 100 rows come from two lists read today (Steam250 2D tag, Wikipedia's games considered the best); type and view columns are the researcher's classification. Top-down sprites are now required: characters get clips per direction (Contract 2), and the playground must handle top-down movement. |
| 16:20 | W1-C review round 1 failed (mutation check: 5 of 7 planted bugs caught). Fixes sent to the builder. |
| 16:23 | W1-A builder finished (11 min, 199k tokens); orchestrator re-ran tests and build; reviewer launched. Started two wave-2 tasks that do not depend on in-flight work: W2-B parts, W2-D1 theme engines. |
| 16:25 | W1-A review: PASS with fixes; sent back to the builder. Reviewer independently proved G3 (new sprite and sound appear in the catalogue with no other edit). Architecture doc updated with the agreed deviations. |
| 16:27 | W1-C builder finished the fixes (5.5 min): 53 unit and 70 browser tests pass on the orchestrator's re-run. Sent to the reviewer for round 2. |
| 16:28 | W1-A fixes verified by the orchestrator (50 tests pass, build writes 27 assets) and committed (`ed82fe5`). The orchestrator made the one-word game-type change in the Hero and Wizard files itself, because the build was broken until it landed. |
| 16:32 | W1-D builder finished; orchestrator re-ran its 52 tests and the checker (2 of 7 existing sprites pass the new bar). Reviewer launched. W3-S art direction launched: style guide plus one specification and batch plan per bundle. |
| 16:34 | W2-D1 theme engines finished (8.5 min, 188k tokens); 31 tests pass; orchestrator viewed the preset sheet. Reviewer launched. W2-C bag and export launched. |
| 16:37 | W1-C committed (`99c2ea0`) after the flaky reload test was fixed and verified (84 repeats clean, full suite 70 pass). |
| 16:39 | W2-D1 review: FAIL, narrowly. Sound brightness is not monotonic for 4 of 19 sounds and shifts loudness by up to 12 dB. Six fixes sent to the builder. |
| 16:44 | W1-D review: FAIL with ten fixes; sent back. Contract 3 extended (`when` on controls and on sounds; `none` may be a list). W2-B first pass finished (19 min, 329k tokens) and resumed for the extension. W2-D1 fixes verified (34 tests) and committed (`ed2a65e`). |
| 16:49 | W2-C builder finished; orchestrator re-ran its tests; reviewer launched. Orchestrator wrote `app/catalog.js` (the one reader of the catalogue) and lazy routes for `#/bundle/<id>` and `#/play`. Launched W2-D2 bundle page and W2-E playground. |
| 16:54 | W1-B search and W2-B parts builders finished; reviewers launched for both. Orchestrator wired the embedding model and a combined `generated/sounds.json` into the build (27 assets index in 0.2 s, 128 KB). W2-A catalogue-driven site launched. A permanent test server now runs on port 5199 because parallel test runs were stopping each other's. Unit suite: 297 of 303 pass; the 6 failures are the quality-bar command-line tests, whose builder is mid-fix. |
| 16:57 | W1-D fixes done; orchestrator re-ran its 74 tests and the checker: all 7 sprites pass. Sent to the reviewer for round 2. |
| 16:57 | W2-C review: PASS with no blocking fixes. Follow-up round sent to the builder (sprite-page wiring, conditional sounds in exports, six smaller fixes). |
| 17:01 | W1-B review: FAIL on four small fixes; sent back with five extras. Search by meaning made opt-in (reverses the orchestrator's earlier choice to keep it on); W2-A builder told to add the switch. Package versions pinned. |
| 17:01 | W2-B review: FAIL on small defects; ten fixes sent to the builder. Contract 3 extended again: `when` may be a list meaning any-of. |
| 17:01 | W1-D review round 2: one required fix left; sent to the builder. |
| 17:04 | W2-D2 bundle page builder finished; orchestrator viewed it; reviewer launched. Catalogue rows now also carry the preview clip's name, the pivot and whether the sprite stands on the ground. |
| 17:05 | W2-C follow-up verified by the orchestrator (23 unit, 13 browser tests) and committed (`d46d72e`). |
| 17:06 | W1-D final fix verified (83 tests, 7 of 7 sprites pass) and committed (`99c4008`). Full sound check started in the background. Four of five wave-1 tasks are committed; search is in its fix round. |
| 17:17 | W1-B and W2-B fixes verified and committed (`32217a7`, `ac6d784`): all five wave-1 tasks are done. W3-S specs finished; reviewer launched. Seven helper builders launched (W3-H1 to H7), each with its first batch. W2-F skill rewrite launched. Production run 1 launched: six sound batches. W2-D2 review: FAIL on a stale-sound bug and three smaller defects; sent back. A music builder's run of `battle_theme.py` stripped the track's metadata and broke the build; restored from git and the builder told. |
| 17:18 | W2-E playground first pass finished; sent back to align with the style guide (tile names, direction clips, standard clip names, layer sizes, pivots) before review. |
| 17:21 | W3-H1 palettes and effects helper finished (8 min, 203k tokens): 48 tests pass on the orchestrator's re-run; orchestrator viewed the effects and palette sheets. Reviewer launched. Build-break warning about music generators re-sent to the music kit builder (the first one went to the wrong agent). |
| 17:22 | W3-S review: FAIL on eleven points (the guide disagreed with the checker and the playground: `when` not taught, wrong control threshold, palette names, tile piece names, three designs too close to famous ones, batch order). Plan integrity checks all passed (47, 49, 48 sprites; 20 sounds and 2 tracks each). An editor agent (W3-S2) is applying the fixes; the playground and top-down rig builders were told the parts that affect them. |
| 17:24 | W2-D2 bundle page fixes verified by the orchestrator (12 browser tests; page opened in the browser: three sprites at 2x, looks panel, waveforms). Not committed yet: one follow-up is running. A new sound (`ice-shatter`, no energy below 1 kHz) showed the theme engine's dull setting cannot keep loudness on very bright sounds; the builder is making the filter corner follow each sound's own spectrum, and giving the bag page's music the same look handling as the bundle page. 35 of 37 run-1 sounds exist and pass the checker. |
| 17:25 | W3-H1 review: FAIL on two small fixes (smoke ignored a colour list; a lead colour could be darker than the floor). Mutation check caught 14 of 16 planted bugs; two probe sprites written to the guide passed the checker. Six fixes sent to the builder. |
| 17:27 | W2-D2 follow-ups verified (brightness follows each sound's own spectrum; bag page music takes the look) and committed (`b72cc12`). W3-H1 review fixes verified (61 tests) and committed (`f84162b`). |
| 17:29 | W2-F skill rewrite finished (16 min, 347k tokens): `SKILL.md` 312 lines, `SOUND.md` 230; every command and example run in a scratch copy; a fresh agent built a key pickup from the skill alone with zero checker errors and warnings. Five document contradictions it found were fixed or sent to the spec editor. The checker no longer mentions `sprites/index.js`. Open integration gap: `app/bag-page.js`, `app/bundle.js`, `app/sound-page.js` and `app/music-page.js` still import the old hand-kept lists, so a new sprite would not work in the bag; to fix once the site rewrite (W2-A) lands. The skill needs one more pass after the guide edit. |
