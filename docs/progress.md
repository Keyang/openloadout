# Loadout build loop: progress

Started 2026-11-18 16:05. The orchestrator updates this file at every step. A new loop iteration reads it first.

## Goal: the loop stops when all four are verified

| # | Goal | Verified by | State |
|---|---|---|---|
| G1 | Three asset bundles for the top three 2D game types, each with 40–50 sprites, 20 sounds, 2 music tracks | Bundle manifests resolve; every asset passes the quality bar and review | Not started |
| G2 | End to end: search, customise, add to bag, play in the playground, export (zip; Unity shown as coming later) | Browser test that walks the whole path | Not started |
| G3 | Build and search system ready for more assets and bundles | Dropping a new asset file in and running the build makes it searchable with no other edit; tests pass | Not started |
| G4 | Whole-bundle customisation | Browser test: one change restyles every asset in a bundle, in previews, playground and export | Not started |

## Decisions from Keyang (2026-11-18)

- Game types: chosen by research on the top 100 2D games (task W1-R).
- Bundle size: 40–50 sprites, 20 sounds, 2 music tracks each.
- "Play" is a playground for trying bag assets, not fixed template games.
- Export: the user chooses zip or Unity package; Unity is "coming later" and not built in this loop.
- Git: local commits allowed, no pushing. Dependencies and one embedding-model download allowed.
- Search defaults accepted: SQLite file, English, model served from the site, background download.
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
| W1-R | Research top 100 2D games, pick three game types, outline each bundle | G1, D7 | opus | todo | |
| W1-A | Metadata schema, backfill 27 assets, bundles format, build → catalogue, thumbnails, strips | FIND-1, BASE-8, BAG-6 | opus | todo | |
| W1-B | Search: index builder, keyword + meaning search library, browser client, test set and evaluation | FIND-2, 8, 9, 10 | fable | todo | |
| W1-C | Test setup: static server, Playwright harness, smoke tests of today's pages, engine unit tests | BASE-7 | sonnet | todo | |
| W1-D | Quality bar as a shared library, new checks, written bar and review protocol | ASSET-1, 12, 13 | opus | todo | |

### Wave 2: the product (after wave 1)

| Id | Task | Features | Status |
|---|---|---|---|
| W2-A | Site reads the catalogue; search-first home, results with filters, sticky style filter, "goes with" | FIND-2, 3, 4, 5, 7 | todo |
| W2-B | Parts in the framework and on the sprite page; Hero's weapon as the worked example | MAKE-8, EDIT-7 | todo |
| W2-C | Bag and export chooser | BAG-1, BAG-2 | todo |
| W2-D | Themes: colour and sound engines, bundle page with whole-bundle controls | EDIT-6, BAG-6 | todo |
| W2-E | Playground | BAG-3 | todo |
| W2-F | Skill update: metadata, parts, new asset kinds, quality bar | MAKE-1 | todo |

### Wave 3: content (after W1-R, W1-A, W1-D, W2-B, W2-F)

Per bundle: a specification and style guide, then batches of builders with an independent reviewer per batch. 40–50 sprites, 20 sounds, 2 tracks each.

### Wave 4: integration

End-to-end browser tests for G2 and G4, full build, final review, README and features update.

## Log

| Time | Event |
|---|---|
| 16:05 | Loop started. Baseline committed. Dependencies installed. Architecture and this file written. |
