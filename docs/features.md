# Loadout: feature breakdown

Written 2026-11-18 from Keyang's vision statement. This is the working list for project management: every feature has an id, a status and what it depends on. Update the status column as work lands; add features under the area they belong to.

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
| Done | Works today in `lab/sprite-forge` |
| Partly | Some of it exists; the gap is named in the notes |
| Not started | Nothing built |

Size is a rough guess (S = days, M = a week or two, L = several weeks), made without a design. Treat it as an ordering aid, not an estimate.

## Where the project is today

- 7 sprites, 19 sound effects, 1 music track, 3 kits. All made by code, all with sliders.
- Catalogue with type pages, kind filter buttons and a plain text search.
- Sprite page: look and motion sliders, sounds per animation frame, zip download.
- Sound page and music page with sliders; music plays live and has length and melody-instrument choices.
- Agent skill for making sprites, sounds and music; checkers for both.
- Runs as static files on a local server. No hosting, accounts, bag, search index, templates or Unity export.
- Nobody has judged the sounds or music by ear.
- All 27 assets were made by route 1. Routes 2 and 3 do not exist yet.

---

## A. Find: catalogue and search

The taxonomy document is the specification for this area.

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| FIND-1 | **Asset metadata.** Every asset carries the taxonomy facets: asset type, role, theme, game type, style, technical specs, licence, plus action words and synonyms | Done | M | — | `catalog/schema.js` defines it; all assets carry it; the build rejects an asset without it. Technical specs are measured by the build, not written by hand |
| FIND-2 | **Keyword search by the user's words.** Verbs and events ("jump", "chop", "level up"), synonyms (coin, gold, money), typo tolerance, results across all asset types. Instant, no model | Partly | M | FIND-1, FIND-8 | Today: exact substring match on name, kind and tags. Stage 1 in `search-design.md` |
| FIND-3 | **Faceted filters.** Role tree in a sidebar, then theme, style and technical filters that combine | Partly | M | FIND-1 | Today: one row of kind buttons |
| FIND-4 | **Sticky style filter.** Pick "16px, top-down, 4 directions" once and it stays applied across sprites, sounds and music | Not started | S | FIND-3 | The taxonomy calls this the most important filter, because mismatched assets are the main complaint about libraries |
| FIND-5 | **"Goes with" links.** Each asset page lists what pairs with it and on which frame, plus similar assets | Partly | S | FIND-1, FIND-8 | Today: a sound page lists the sprites and kits that use it. Similar assets come free from the index's stored neighbours |
| FIND-6 | **Start from a game type.** "Building a platformer? Start here" leads to a checklist of what that game needs, with matching assets | Not started | M | FIND-1, ASSET-2 | Checklists come straight from the taxonomy's small-game lists |
| FIND-8 | **Search index built with the site.** Every build writes one SQLite file: assets and facets, a keyword index, one vector per asset, and each asset's nearest neighbours | Not started | M | FIND-1, BASE-8 | Vectors are stored as plain columns and compared in JavaScript; the `sqlite-vec` extension is avoided because it has no supported browser build |
| FIND-9 | **Search by meaning.** An embedding model loads in the background and improves results, so "something for when the player dies" finds the right sounds | Not started | M | FIND-8 | A 22 to 34 MB one-time download. Search never waits for it. Model chosen by the test in `search-design.md` section 6 |
| FIND-10 | **Search test set.** A stand-in catalogue of 300 to 500 entries and 60 to 100 searches with known right answers, used to pick the model and to catch regressions | Not started | S | — | Can start before FIND-1; it uses the taxonomy lists |
| FIND-7 | **Catalogue at scale.** Pre-made thumbnails, paging or lazy loading, fast first paint with thousands of assets | Not started | M | BASE-2 | Today every card is drawn live in the browser, which will not scale |

## B. Assets: the library and its quality

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| ASSET-1 | **Quality bar.** A written definition of "high fidelity, game ready" per asset type, stated as checks an agent can run and pass or fail without a person. Applies to routes 1 and 2 | Partly | M | — | See "What the quality bar checks" below. The mechanical half exists; the "does it look and sound right" half does not |
| ASSET-12 | **One checker, two places.** The same checks run in the site build (route 1) and in the browser (route 2), so an asset made through the live site meets the same bar | Partly | M | ASSET-1 | Today the checkers are command-line tools only. Their logic is plain JavaScript and can run in a browser |
| ASSET-13 | **Automatic judging of look and sound.** An independent judge scores renders and audio against the written bar, so the agent that made an asset is not also the one grading it | Not started | L | ASSET-1 | Today the authoring agent looks at its own renders, and sounds are checked by measurement only. This is the hardest part of an automatic bar |
| ASSET-2 | **Cover one game type completely.** Enough assets for a full small platformer: 1 player, 3 enemies, tileset, 10 props and pickups, 5 effects, 3 background layers, UI set, 25–40 sounds, 3 music tracks | Partly | L | ASSET-3 | Today: 2 characters, 3 creatures, 1 item, 1 effect. Whole types are missing (next row) |
| ASSET-3 | **Missing asset types.** Tilesets that snap together, parallax backgrounds, UI sets, projectiles, item icons, character portraits, short musical jingles | Not started | L | — | Each needs framework work, not just new files: tiles need edge rules, UI needs stretchable panels |
| ASSET-4 | **Top-down sprites.** Characters in 4 or 8 directions | Not started | L | — | Everything today is side view. Needed for RPG and farming-sim game types |
| ASSET-5 | **Layered character customisation.** Body, hair, clothes and hats as separate swappable layers | Partly | M | MAKE-8 | The Hero has hair, headgear and weapon choices on one rig; there is no general layer system. Parts (MAKE-8, EDIT-7) are the mechanism for this |
| ASSET-6 | **Sound variants.** Several takes of one sound (3–4 footsteps), and surface versions (grass, wood, stone, snow) | Partly | S | — | "Play a variation" exists on the sound page; downloads contain one take |
| ASSET-7 | **More music.** Tracks for menu, exploration, boss, shop; victory and game-over jingles | Partly | M | — | One battle theme with length and melody-instrument choices |
| ASSET-8 | **More art styles.** Other pixel sizes (16, 32), then non-pixel styles | Not started | L | — | Pixel art at one scale only |
| ASSET-9 | **Physics for 2D sprites.** Collision shapes, hit and hurt boxes per frame, rigid-body settings, exported with the sprite | Not started | L | — | Named in the vision as later work |
| ASSET-10 | **3D assets.** | Not started | L | Decision D3 | "Coming soon" in the vision; approach not chosen |
| ASSET-11 | **Licence on every asset.** | Not started | S | Decision D5 | Required before anything is offered publicly |

### What the quality bar checks

A starting list for ASSET-1. "Automatic today" means a command already fails the asset when the check fails.

| Asset | Automatic today | Needed for the bar |
|---|---|---|
| Sprite | Renders at about 50 slider combinations without error; nothing clipped by the frame; same input gives the same pixels; loops close; feet on the ground line; colour count; sound ids exist | Parts are declared with their own settings, stay attached in every frame, and fit inside the frame at every combination of sprite and part settings; every slider visibly changes the sprite; the smallest setting still fills the frame; no control is dead for some choices; reads as what it is; motion has clear poses (ASSET-13) |
| Sound effect | Patch is valid; no clipping; starts at once; every slider changes the sound by an audible amount; loop seam is clean | Sounds like its brief; fits the animation frame it is attached to (ASSET-13) |
| Music | Tempo detected matches the tempo written; loop seam; stereo; chord per bar can be listed; level per section | Sounds like its brief; melody instruments balanced by ear, not only by level (ASSET-13) |
| Any asset | — | Metadata complete (FIND-1); licence set (ASSET-11) |

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
| EDIT-1 | **Sprite sliders.** Look, colours and motion, with every animation redrawn live | Done | — | — | |
| EDIT-2 | **Sounds on animation frames.** Pick, time, style, adjust, duplicate, remove | Done | — | — | Duplicate and an 8-sound limit per animation were added in a fork session |
| EDIT-3 | **Sound sliders and styles.** | Done | — | — | |
| EDIT-4 | **Music controls.** Live sliders, styles, length, melody instrument | Done | — | — | For the one existing track |
| EDIT-7 | **Part settings, one level below.** Choosing a part on a sprite opens that part's own controls: its shape, colours, hold angle, swing. Controls for a part disappear when the part is set to none | Not started | M | MAKE-8 | Example: Hero, then Weapon, then rotation angle. The existing seven sprites need their parts given settings |
| EDIT-8 | **Parts shared between sprites.** A sword is an asset of its own that fits any character with a hand; a hat fits any head | Not started | L | EDIT-7, FIND-1 | Lets a part be found in search, used alone as an item or icon, and swapped between characters. Today each sprite draws its own parts |
| EDIT-5 | **One-button variations of an asset.** Several good-looking alternatives side by side to choose from | Partly | S | — | "Surprise me" gives one random result at a time |
| EDIT-6 | **One-button variations of a whole bundle.** Restyle every asset in a bag or kit together so they still match: shared palette, theme, tone | Not started | L | BAG-1, FIND-1 | Needs settings that span assets, which do not exist yet |

## D. Bag and package

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| BAG-1 | **Bag.** Add any asset with its current settings; see, edit and remove items; the bag survives a page reload | Not started | M | — | Settings already live in each page's link, so a bag can store links |
| BAG-8 | **Bag holds assets that are not in the catalogue.** An asset an agent or a person made in the browser is stored in the bag with its full definition | Not started | M | BAG-1, MAKE-7 | A link is enough for a catalogue asset; a new asset has no link to point to |
| BAG-2 | **Download the bag as one resource package.** A zip with every sprite sheet, sound and track, one manifest, and a guide | Partly | S | BAG-1 | Kit download already builds this for fixed lists at default settings |
| BAG-3 | **Preview the package in game templates.** Before downloading, play the bag's assets inside small template games (platformer, top-down, and so on) | Not started | L | BAG-1, FIND-1 | Needs the templates, and a way to assign assets to roles (player, enemy, pickup, music). Role metadata does that |
| BAG-4 | **Export as a Unity package.** Sliced sprites, animation clips and controllers, audio clips, sounds wired to animation frames, prefabs | Not started | L | BAG-2 | Today the download is engine-neutral with written Unity steps. Never tested in Unity. With parts (MAKE-8), a part can be exported as its own layer with its attach point per frame, so a game can swap weapons while it runs |
| BAG-5 | **Other engine exports.** Godot, web engines | Not started | M | BAG-2 | After Unity |
| BAG-6 | **Packs at three levels.** Object bundle (chest + sparkle + creak), character bundle, game kit | Partly | M | FIND-1 | Kits exist as hand-written lists. A sprite with its sounds is already an object bundle |
| BAG-7 | **Bundles modelled on real games.** A resource bundle that covers what a named kind of game needs, as a worked example | Not started | L | ASSET-2, BAG-6, Decision D4 | Combined with EDIT-6 this is the "one button creates a variation of a whole game's assets" idea |

## E. Create: the three routes and the framework

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| MAKE-1 | **Route 1: agent skill.** Instructions an agent follows to make a sprite, sound or track in the site's source and check it against the quality bar | Partly | — | ASSET-1 | Sprite part tested with four fresh agents. Sound part tested in the earlier experiment. Music part and the attach-sounds part are untested. The skill predates the quality bar and will need its checks added |
| MAKE-2 | **Route 2: MCP server.** Lets an agent search the library, customise an asset, build a new one through the live site, check it, and add it to the bag | Not started | L | MAKE-6, MAKE-7, FIND-8 | Runs on the user's machine, not on the site. How it reaches the open page (driving a browser, or a connection the page opens to it) is not designed yet |
| MAKE-6 | **Site functions for agents.** A documented set of functions on `window`: search, open, set sliders, define a new sprite or sound, run the checks, get renders back as pictures, add to bag | Not started | M | ASSET-12, BAG-1 | Nothing is exposed today. This is what the MCP server calls |
| MAKE-7 | **Assets made in the browser.** A sprite or sound defined at run time, without a site rebuild, drawn and played like a catalogue asset | Not started | M | — | Sounds and music are already data files, so they are easy. A sprite is a program, so running one an agent just wrote needs a safe sandbox |
| MAKE-3 | **Route 3: studio.** A place on the site where a person makes new sprites, sounds and music with the framework. Lower priority; not held to the quality bar | Not started | L | Decision D2, MAKE-7 | The framework is code. Who the studio is for decides whether it is a prompt box, a visual editor, or a code editor. On a static site a prompt box needs the user's own AI key or their own agent |
| MAKE-4 | **Route 1: publishing.** A new asset file goes through the automatic quality bar in the site build and is published to the catalogue if it passes | Not started | M | ASSET-1, BASE-8 | Today a new asset is a file added by hand. On a static site this is a change request plus the automatic build |
| MAKE-8 | **Parts in the framework.** A way for a sprite file to declare its parts, where each attaches on the body in every frame, and each part's own settings; the checker tests parts at every setting of the sprite | Not started | M | — | Attach points already exist inside the two-legged rig (hand, head, neck) but are not declared, named or exported |
| MAKE-5 | **Framework gaps.** Shared rigs for four-legged and flying creatures, tiles, top-down bodies; the sound engine as one maintained copy | Partly | L | — | Only a two-legged rig exists. The sound engine is a hand-merged copy that has diverged from `experiment/procedural-sfx` |

## F. Platform

| Id | Feature | Status | Size | Depends on | Notes |
|---|---|---|---|---|---|
| BASE-1 | **Name.** One name for sprites, sounds, music and 3D | Partly | S | — | Named **Loadout** by Keyang on 2026-11-18. The site, docs and skill text use it. Still to do: rename the folder `lab/sprite-forge`, the skill id and the preview entry (left alone while other sessions work in the folder), and check the domain and trademark, which nobody has done |
| BASE-2 | **Hosting on GitHub Pages.** A public address serving static files only | Not started | S | BASE-8 | Local static server only. The project is not in a git repository yet |
| BASE-3 | **Accounts and saved bags.** | Not started | M | BASE-2, BAG-1 | Not possible on a static site without an outside service. The bag is kept in the browser and shared by link instead |
| BASE-4 | **Usage tracking.** What people search for, open, change, bag and download | Not started | S | BASE-2 | The cheapest way to test demand, which the scan rated weak. Searches with no result say what to build next. Needs a third-party analytics script |
| BASE-5 | **Speed.** Long music builds in about half a minute; move heavy rendering off the page or pre-render it | Partly | M | BASE-2 | Music already renders on a background thread |
| BASE-6 | **Calibrate the automatic bar.** Now and then a person looks at and listens to a sample of assets that passed, to confirm the automatic bar agrees with human judgement. Not a gate on any asset | Not started | S | ASSET-13 | Added by Claude, not in Keyang's brief. Nothing made so far has been judged by a person, so there is no evidence yet that passing the checks means good |
| BASE-7 | **Automated site tests.** | Partly | S | — | 53 unit and 70 browser tests cover the pages and engines that existed on 2026-11-18 (`tests/`). New features add their own |
| BASE-8 | **Site build.** One command, also run automatically on every change, that checks every asset, builds the search index and thumbnails, and writes the folder to publish | Partly | M | — | `npm run build` validates, writes the catalogue and thumbnails, and can write `dist/`. Search index and quality steps plug in as they land. Not yet run automatically on change |
| BASE-9 | **Size and traffic budget.** Keep the site under 1 GB and the monthly traffic under 100 GB: thumbnail sizes, the embedding model, when to move large files elsewhere | Not started | S | BASE-8 | A 23 MB model allows about 4,300 first-time downloads a month within the traffic limit |

---

## Suggested order

My recommendation, not a decision. Each step unlocks the next.

1. **FIND-1 metadata, with FIND-10 search test set alongside.** Search, filters, packs, template previews and the MCP server all read the metadata. The test set needs no real assets, so it can run in parallel and settle the model choice early.
2. **BASE-8 site build and FIND-8 index, then FIND-2, FIND-3 and FIND-9.** Keyword search and filters first, search by meaning on top. This is the vision's "easily find" promise.
3. **BAG-1 and BAG-2 bag and download.** The core flow of the product, and mostly a reuse of the kit download.
4. **ASSET-1 quality bar, ASSET-12 and ASSET-13.** "High fidelity" is the headline claim, and routes 1 and 2 both depend on an agent being able to verify it alone. Doing this before growing the library avoids redoing assets.
5. **MAKE-8 and EDIT-7 parts, before the library grows.** Every new character made without parts would have to be reworked later.
6. **ASSET-3 and ASSET-2 fill out one game type.** A complete platformer set is the first thing that makes the bag and the templates worth using.
7. **BAG-3 template preview.** Needs the full set from step 6 to look like a game.
8. **BAG-4 Unity export.**
9. **EDIT-6 and BAG-7 bundle variations and real-game bundles.**
10. **Route 2: MAKE-7, MAKE-6, BAG-8, then MAKE-2.** Route 3, the studio (MAKE-3), comes after and is lower priority.
11. **Later:** ASSET-4 top-down, ASSET-9 physics, ASSET-10 3D, ASSET-8 other styles.

BASE-2 hosting on GitHub Pages is small once BASE-8 exists, and with BASE-4 usage tracking is worth doing early if testing demand matters.

## Decisions needed from Keyang

| Id | Decision | Why it blocks |
|---|---|---|
| D1 | ~~What is the product called?~~ Decided 2026-11-18: **Loadout** | — |
| D2 | Who is the studio for: non-technical people, technical creators, or both? Can wait: the studio is lower priority | MAKE-3 changes shape completely with the answer |
| D3 | How will 3D assets be made, and do they share this framework or sit beside it? | ASSET-10 |
| D4 | For bundles modelled on real games, how close is acceptable? Covering the same list of asset roles is safe; copying a game's characters, art or music is not | BAG-7 |
| D5 | What licence do assets carry, and is anything paid? | ASSET-11, and anything public |
| D6 | Is this still a personal lab experiment, or does it move to a project with its own record under `projects/`? | Where tickets, hosting and people come from |
| D7 | Which game type comes first: platformer (side view, matches what exists) or another? | ASSET-2, ASSET-4, BAG-3 |
| D8 | Search decisions S1 to S4 in `search-design.md`: SQLite or JSON, languages, where the model is served from, whether a 22 to 34 MB background download is acceptable | FIND-8, FIND-9 |
