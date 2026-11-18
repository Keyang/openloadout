# Loadout: architecture and contracts

Written 2026-11-18 for the build loop. **Every builder and reviewer reads this first.** It fixes the seams between pieces so they can be built in parallel. If a contract here is wrong, do not work around it: say so in your report and the orchestrator will change it for everyone.

Loadout lives in `lab/sprite-forge/` (the folder keeps its old name). All paths below are relative to it.

## Mission

Create a large number of high-quality, procedurally synthesised, game-ready assets that can be customised and used straight out of the box in games, for example in Unity.

## Hard rules

1. **Static site.** Everything the visitor uses runs in the browser from static files (GitHub Pages). No server code. Expensive work happens in `npm run build`.
2. **An asset is one file.** `sprites/<id>.js` (a program that draws every frame) or `sounds/<id>.json` (a synthesis patch; music is a patch with `"category": "music"`). No images or audio files are stored. There is no list to maintain: the build finds assets by scanning the folders (`tools/lib/assets.mjs`).
3. **Plain JavaScript, ES modules, no bundler, no framework.** The same engine code runs in the browser and in Node. Browser code must not import from `node_modules` paths at run time except through `vendor/` copies made by the build.
4. **Tests first.** A builder writes the failing tests for a piece, then the code that makes them pass. Unit tests: `tests/unit/<area>-*.test.mjs`, run with `node --test`. Browser tests: `tests/e2e/<area>.spec.mjs`, run with Playwright.
5. **Stay in your files.** Each task lists the files it owns. Do not edit files you do not own, do not run `git commit`, and do not edit `package.json` (ask the orchestrator). Other builders are working in the same folder at the same time, so run only your own tests (`node --test tests/unit/<area>-*.test.mjs`), not the whole suite.
6. **Non-technical visitors.** Interface text uses everyday words. No "params", "patch", "facet", "index" on screen.
7. **Deterministic.** Same input, same pixels and samples. No `Math.random()` or dates in asset code.

## Layout

| Path | What | Status |
|---|---|---|
| `engine/` | Sprite engine: `surface.js`, `color.js`, `motion.js`, `sprite.js` (`defineSprite`, params, `renderFrame`, `renderSheet`) | exists |
| `engine/theme.js` | Colour theme applied to rendered frames (bundle-level customisation) | wave 2 |
| `rigs/` | Shared body rigs (`humanoid.js`) | exists |
| `sound/` | Sound engine (`sfx-engine.js`, `player.js`, `worklet.js`, `wav.js`, `analyze.js`, `render-worker.js`) | exists |
| `sprites/`, `sounds/` | The assets | exists |
| `bundles/<id>.json` | Bundles: which assets belong together for a game type | wave 1 |
| `catalog/schema.js` | Asset metadata: field list, allowed values, role tree, validator. Pure JS, used by Node and browser | wave 1 |
| `quality/` | The quality bar as code: `sprite.js`, `sound.js`, pure JS, used by Node and browser | wave 1 |
| `search/` | Search library: query handling and ranking (pure JS), browser client, and the index builder's shared parts | wave 1 |
| `tools/` | Node tools: `build.mjs`, `check.mjs`, `render.mjs`, `sfx.mjs`, `serve.mjs`, `lib/` | partly |
| `generated/` | Build output read by the site: `catalog.json`, `search.sqlite`, `thumbs/`, `strips/`. Not committed | wave 1 |
| `vendor/` | Browser copies of third-party files (SQLite WebAssembly, Transformers.js, the embedding model), written by the build. Not committed | wave 1 |
| `app/` | The website | exists, refactor in wave 2 |
| `tests/` | `unit/`, `e2e/`, `fixtures/`, `helpers/` | wave 1 |
| `docs/` | `features.md`, `progress.md`, this file, `quality-bar.md`, `review-protocol.md` | |

## Contract 1: asset metadata

Every asset carries `meta`. Sprites: a `meta` field in `defineSprite({...})`. Sounds and music: a top-level `"meta"` object in the JSON. `catalog/schema.js` is the authority on allowed values and exports `validateMeta(meta, kind) -> { ok, errors }`.

```js
meta: {
  type: 'character',            // sprites: character | creature | tileset | prop | pickup | projectile | effect | background | ui | icon
                                // audio:   sfx | ambience | music | jingle
  role: 'characters/player',    // a path in the role tree (below)
  themes: ['fantasy'],          // fantasy | sci-fi | space | dungeon | forest | farm | city | horror | underwater | candy | neutral ...
  gameTypes: ['platformer'],    // platformer | turn-based-rpg | roguelike-action (the three bundle types) | farming-sim | shooter | racing | puzzle | card-game | arcade; an asset may fit several. `catalog/schema.js` holds the list
  view: 'side',                 // sprites only: side | top-down | front | none
  words: ['knight', 'hero', 'sword', 'fight'],   // what people type to find it: nouns, verbs, events, synonyms. Lowercase
  license: 'draft',
}
```

`name` and one-sentence `blurb` / `description` stay where they are today. Facts that can be measured (frame size, clips, frame counts, length, tempo, number of controls, parts) are **not** written by hand: the build derives them.

Role tree (top level is shared by sprites and sounds so a chest and its creak sit together):

| Top level | Sprites | Sounds |
|---|---|---|
| `characters/` | `player`, `enemy`, `boss`, `npc`, `animal` | `footstep`, `voice`, `hurt`, `death` |
| `actions/` | — | `swing`, `hit`, `jump`, `land`, `dash`, `shoot`, `cast` |
| `items/` | `pickup`, `weapon`, `key`, `food`, `icon` | `pickup`, `equip`, `consume`, `drop` |
| `world/` | `tile`, `prop`, `platform`, `hazard`, `door`, `building`, `crop` | `door`, `chest`, `lever`, `break`, `machine` |
| `effects/` | `explosion`, `spark`, `dust`, `magic`, `weather`, `projectile` | `explosion`, `magic`, `impact` |
| `environment/` | `background`, `lighting` | `ambience`, `weather` |
| `interface/` | `button`, `panel`, `bar`, `cursor`, `icon` | `click`, `hover`, `confirm`, `error`, `reward` |
| `music/` | — | `menu`, `exploration`, `battle`, `boss`, `shop`, `victory`, `gameover` |

## Contract 2: everything visual is a sprite

Tilesets, backgrounds, interface pieces, projectiles and icons use the same `defineSprite` as characters. That keeps one renderer, one checker, one export and one search.

| Asset | How it is expressed |
|---|---|
| Static prop or icon | One clip with `frames: 1` (give it a second animated clip when it makes sense: a chest has `closed` and `open`) |
| Tileset | One clip per tile (`ground-top`, `ground-fill`, `ledge-left`, `ledge-right`, `wall`, ...), 16x16 or 32x32 frames. `meta.type: 'tileset'`. Tiles must join seamlessly with their neighbours. The checker works out which tiles sit next to which from the clip names (`-fill`, `-top`, `-left`, `-right`); `docs/style-guide.md` lists the exact names |
| Background layer | A wide frame (320x180, see the style guide) that tiles horizontally; clips are layers (`far`, `mid`, `near`) |
| Interface piece | Clips are states (`normal`, `hover`, `pressed`) |
| Top-down character | Clips per direction: `idle_down`, `walk_down`, `walk_up`, `walk_side` (side faces right; games mirror it) |

## Contract 3: parts (one level below the sprite)

A sprite declares what it holds or wears. Parameters keep living in the flat `params` object; `parts` groups them.

```js
parts: {
  weapon: {
    label: 'Weapon',
    params: ['weapon', 'weaponLength', 'weaponAngle'],     // keys of params that belong to this part; the first is the selector
    none: 'none',                                           // selector value that removes the part (optional)
    socket: 'hand',                                         // where it attaches (a name; optional)
  },
},
```

`none` may be one value or a list of values. The selector is a choice or an on/off control (for an on/off control the part is removed when it is off).

The site shows each part as its own block of controls under the sprite's, and hides a part's other controls when its selector is at a `none` value. The checker confirms every listed key exists and that each part control changes the picture.

**Controls that only matter sometimes.** Any control, in a part or not, may say when it is in effect:

```js
inlay: color('Emblem colour', '#c9423a', [...], { when: { emblem: ['star', 'heart', 'gem'] } }),   // only when emblem is one of these
hair:  color('Hair', '#5a3a22', HAIR, { when: { headgear: ['none', 'crown'] } }),                  // hidden under a full helmet
```

`when` maps other control keys to the values (a list) for which this control is in effect; every listed key must match. `when` may also be a list of such objects, meaning any one of them may match: `when: [{ weapon: ['sword', 'axe'] }, { headgear: ['helmet'] }]`. A control named in a `when` must itself be in effect for the condition to hold, and loops are rejected. `engine/sprite.js` exports `inEffect(sprite, key, p)` and `activeParams(sprite, p)`, which take both parts and `when` into account. The site hides a control that is not in effect. The checker requires a control to change the picture whenever it is in effect, and accepts no change when it is not. A control that does nothing in some setting and does not declare it is an error: either make it do something or declare `when`.

**Sounds that only apply sometimes.** An entry in a sprite's `sounds` list may carry the same `when`: `{ sound: 'sword-slash', frame: 3, when: { weapon: ['sword', 'axe', 'spear'] } }`. `cueInEffect(sprite, cue, p)` tells the site and the export whether to play or include it.

**What the export says about parts.** `renderSheet` writes `parts: { weapon: { label, socket, present, settings } }` and, when the sprite provides `sockets(clip, t, p)`, a `sockets` object on every frame: `{ hand: { x, y, angle }, ... }` in sheet pixels from the frame's top-left, angle in radians as a frame angle (0 down, PI/2 picture-right, PI up). In side-view clips and `_side` clips picture-right is the way the sprite faces. A game that mirrors a frame uses x' = 2 * pivotX - x and angle' = -angle. A game can attach or swap a part at run time from these.

## Contract 4: the catalogue file

`npm run build` writes `generated/catalog.json`. The site lists and filters from this file and loads an asset's own file only when it needs to draw or play it.

```js
{
  version: 1,
  assets: [{
    id: 'knight', kind: 'sprite',            // kind: sprite | sound | music
    name: 'Hero', description: 'A brave adventurer...',
    type: 'character', role: 'characters/player', themes: [...], gameTypes: [...], view: 'side', words: [...], license: 'draft',
    bundles: ['fantasy-platformer'],          // filled in from bundles/*.json
    src: 'sprites/knight.js',
    tech: {                                   // derived, never hand-written
      // sprite: frame: [64, 64], pivot: [28, 58], grounded: true, clips: [{ name, label, frames, loop, fps }], controls: 15, parts: ['weapon'], sounds: 4 (distinct sounds used), soundIds: ['footstep-gravel', ...] (their ids, sorted: what a sound's page uses for "Used by")
      // audio:  seconds: 0.37, loop: false, stereo: false, bpm: null, controls: 5, styles: ['Heavy blade', ...]
    },
    thumb: 'generated/thumbs/knight.png',     // sprite: one frame, 2x. sound: waveform. music: none
    strip: 'generated/strips/knight.png',     // sprites: the preview clip's frames in one row, 1x. stripClip (the clip's name), stripFrames, stripFps alongside
    // audio assets have view: null
  }],
  bundles: [{ id, name, gameType, level, blurb, sprites: [ids], sounds: [ids], music: [ids], theme: {...} }],   // level: object | character | kit; gameType may be 'any'
}
```

In the browser, `app/catalog.js` is the only module that reads it: `loadCatalog()`, `assetById(id)`, `loadSprite(id)` (dynamic `import`), `loadSound(id)` (`fetch`).

## Contract 5: search

Build side: `buildSearchIndex({ assets, outFile, embed })` in `tools/lib/search-index.mjs` takes the catalogue's `assets` array and writes `generated/search.sqlite` (rows and filters, a keyword index, one 384-number vector per asset stored as bytes, and each asset's nearest neighbours).

Browser side, `search/client.js`:

```js
const s = await createSearch({ catalog });        // works at once using the catalogue alone
s.search('money', { filters: { kind: 'sound', bundle: 'fantasy-platformer' }, limit: 30 })   // -> Promise<[{ id, score }]>
s.similar('coin', 6)                               // -> Promise<[id]>
s.counts({ kind: 'sprite' })                       // -> Promise<{ type: { character: 12, ... }, themes: {...}, gameTypes: {...}, view: {...} }>
s.level                                            // 'basic' (catalogue only) -> 'keywords' (SQLite loaded) -> 'meaning' (model loaded)
```

Search must answer at every level and never wait for the next one. Filters: `kind`, `type`, `role` (prefix match), `themes`, `gameTypes`, `view`, `bundle`.

## Contract 6: the bag

`app/bag.js`, stored in the browser (`localStorage` key `loadout-bag-v1`).

```js
bag.add({ kind: 'sprite', id: 'knight', settings: { params: {...}, cues: {...} } })   // -> item key
bag.add({ kind: 'sound', id: 'coin-pickup', settings: { params: {...}, style: 'Gem' } })
bag.items()      // [{ key, kind, id, settings, addedAt }]
bag.update(key, settings); bag.remove(key); bag.clear(); bag.count(); bag.onChange(fn)
bag.theme()      // bundle-level settings applied to everything in the bag (contract 7); bag.setTheme(theme)
bag.toLink() / bag.fromLink(text)     // the whole bag in a shareable link
```

The same asset may be in the bag more than once with different settings.

## Contract 7: bundle-level customisation (themes)

One set of settings restyles many assets at once and keeps them matching. It is applied after an asset is rendered, so it works on every asset with no per-asset work.

```js
theme = {
  seed: 0,                    // "Surprise me" for a whole bundle: same seed, same result
  colour: { hue: 0, saturation: 1, contrast: 1, tint: null, tintAmount: 0, palette: null, outline: null },
  sound:  { pitch: 0, brightness: 0 },        // semitones; -1..1
  music:  { tempo: 1, intensity: null },      // multiplier; 0..1 or null to leave alone
  shapes: false,              // true: also vary each asset's own controls from the seed
}
```

- `engine/theme.js` (built in W2-D1): `defaultTheme()`, `normalizeTheme(theme)`, `applyColour(pixels, theme.colour)` (changes a Surface's `Uint32Array` or an RGBA byte array in place), `themedParams(sprite, baseParams, theme)` (returns `baseParams` unless `theme.shapes` is true), `renderThemedFrame(sprite, clip, frame, baseParams, theme)`, `randomTheme(seed, { shapes })`, `PALETTES` (11 named palettes), `THEME_PRESETS` (14 named whole-bundle looks: `{ id, name, blurb, theme }`).
- `sound/theme.js`: `applySound(rendered, theme.sound)` (pitch by resampling, so length changes; brightness by filter), `themedSoundParams(patch, baseParams, theme)` (music: tempo, intensity and key go through the track's own controls), `shouldResample(patch)` (false for music), `soundSettingsFor(patch, theme)`.
- `outline` replaces the standard outline colour everywhere it is used, which includes eyes and pupils.

## Contract 8: export

`app/bundle.js` builds every download in the browser: `packageFiles({ items, theme, scale })` returns the files for a zip with `sprites/<id>/` (sheet, JSON, the sprite's sounds), `sounds/`, `music/`, one `manifest.json` describing every asset with its role, and a guide. The export choice shows "Zip package" and "Unity package (coming later)", the second disabled.

**Stretchable pieces.** A sprite may declare `slice`: one entry per clip a game may stretch (an object, or a function of the settings), or one function `(clip, p)`. `renderSheet` (`engine/sprite.js`, `clipStretch`) then writes these fields into the sheet JSON, on the clip's entry in `animations` and on each of its frames, in sheet pixels (they scale with the sheet). A sprite with no `slice` gets none of them and its sheet is unchanged.

| Field | Shape | Meaning |
|---|---|---|
| `border` | `{ left, bottom, right, top }` (Unity's order) | How far the corners reach in from each side of `rect`, or of the frame when there is no `rect`. Keep the corners; repeat the edges along their length and the middle both ways. From `slice[clip].left / top / right / bottom` |
| `rect` | `{ x, y, w, h }` | Where the piece sits in its frame, when it does not fill it (a name tag, a highlight row). Cut this out first; `border` is measured from it |
| `opening` | `{ x, y, w, h }` | A bar: the trough of the housing, which is exactly where its fill strips lie. It moves with the bar's settings |
| `tile` | `{ x, w }` | Instead of `border`, for a middle that repeats a pattern (a segmented bar): columns `x` to `x + w - 1` are one repeat. Insert whole copies of them to lengthen the piece; never stretch it |

A cursor's hot spot is a socket named `tip` on each frame (`sockets`, Contract 3); the pivot is not moved to it. `engine/ui.js` has the helpers (`slice9`, `barOpening`) and its header repeats this table.

## Contract 9: the playground

`#/play`. A sandbox where the visitor tries what is in their bag. It has two modes chosen from the player sprite's `meta.view`: side view (walk, jump, gravity, ground tiles) and top-down (walk in four directions over floor tiles, using the direction clips of Contract 2). It is not three fixed games: it works with whatever is there. A sprite's role decides what it does: a player sprite is moved with the keyboard (its clips are picked by name: idle, walk, run, jump, attack...; its sounds fire on their frames); enemies and creatures move by themselves; pickups can be collected (their collect clip and sound play); tiles make the ground; background layers scroll; a music track plays with its controls; sound effects get buttons. The bag's theme applies to everything.

## Contract 10: the quality bar

`quality/sprite.js` exports `checkSprite(def, { soundIndex, validateMeta }) -> { errors: [], warnings: [], metrics: {} }` and `quality/sound.js` exports `checkSound(patch, { validateMeta }) -> { errors, warnings, notes, metrics }`. `validateMeta` is `catalog/schema.js`'s function, called with the kind `'sprite'`, `'sound'` or `'music'`. Pure JS, no file access, so the same checks run in the build and in a browser. `tools/check.mjs` and `tools/sfx.mjs` are thin command-line wrappers. `docs/quality-bar.md` is the written bar; `docs/review-protocol.md` is how an independent reviewer judges look and sound from renders and measurements.

## Contract 11: two layers, and the framework on `window`

Decision from Keyang, 2026-11-18 17:50. Loadout has two layers:

1. **The framework** (the foundation): the code every asset is written with. Drawing (`engine/`), body rigs (`rigs/`), sound and music synthesis (`sound/`, and the music-writing kit), the quality bar (`quality/`), looks (`engine/theme.js`, `sound/theme.js`).
2. **The assets**: one file each (`sprites/<id>.js`, `sounds/<id>.json`), synthesized on demand by the framework. An asset file holds only what is particular to that asset.

Rules:

- **The framework grows while assets are made.** It starts simple. When an asset needs something the framework lacks (a shape, a pose, a rig, a pattern, a synthesis block, a measuring tool), the maker **adds it to the framework**, not to the asset file, so the next asset can use it. Generic drawing or synthesis code written inside an asset file is a review finding.
- **Additions are additive.** A new exported function or a new module, with a doc comment that says in one line what it does and lists its arguments, and at least one unit test. Existing exports keep their behaviour and every existing asset renders the same (the tests pin this). A change to existing behaviour is a separate task with its own review.
- **Everything in the framework is on `window`.** The site exposes the whole framework as `window.loadout`, built from the framework modules themselves, with no hand-kept list: a function added to a framework module appears there after the next build. This is what an agent driving the live site (route 2, later through an MCP server) builds assets with.
- **The framework describes itself.** The build writes `generated/api.json`: every framework function with its module, name, arguments and one-line description, plus the high-level actions below in a form an MCP server can list as tools (name, description, input schema). A unit test fails if an exported framework function has no description.

`window.loadout`:

| Member | What it is |
|---|---|
| `(await loadout.framework).<module>.<function>` | Every export of every framework module (for example `sprite.defineSprite`, `fx.ring`, `topdown.pose`). Loaded on first use, so it is asynchronous: `const fw = await loadout.framework`. Modules are found by folder scan (`engine/`, `rigs/`, `sound/`, `quality/`, `catalog/`); the rule is in the header of `tools/lib/api.mjs` |
| `loadout.api` | The contents of `generated/api.json` (what exists, with descriptions) |
| `loadout.assets.list(filter)`, `.get(id)`, `.search(text, filters)`, `.similar(id)` | The catalogue and search (Contracts 4 and 5) |
| `loadout.make.sprite(source)`, `loadout.make.sound(patch)` | Define a new asset at run time from sprite source text (an ES module, as in `sprites/<id>.js`, importing the framework by its usual paths) or a sound patch object. Returns `{ id, ok, errors, warnings }` after running the quality bar on it (Contract 10). The asset then behaves like a catalogue asset on this visit: it can be opened, drawn, played, customised, put in the bag and exported |
| `loadout.check(idOrDefinition)` | The quality bar's verdict for an asset |
| `loadout.render(id, { clip, frame, params, look, scale })` | A picture (PNG data address) of a frame or a whole clip strip; for a sound, its samples or a WAV |
| `loadout.bag.add(id, settings)`, `.items()`, `.remove(key)`, `.setLook(theme)`, `.download()` | The bag and the export (Contracts 6, 7, 8). The bag stores run-time assets with their full definition |
| `loadout.go(route)` | Open a page of the site |

A run-time asset that fails the quality bar is kept as a draft: it can be rendered, checked and replaced by calling `make` again with the same id, but `bag.add` refuses it while it has errors (the quality bar applies to everything an agent adds to the bag; warnings do not block). `loadout.call(name, input)` runs any action by its name in `generated/api.json`.

**Safety of run-time assets (after the review of 2026-11-18; status: to build, task W5-B).** A sprite made at run time is a program. The review showed that importing it into the page lets it read storage, call other sites, change the page and hang it, and that a definition kept in the bag or carried by a link ran again on every load. The rules:

- A made source never runs in the page. It is loaded, checked and drawn only inside a dedicated worker that the page can stop; the page receives pixels and data, never functions. Every call has a time limit (about 60 s for a check, far less for a frame) and a frame-size cap; on a limit the worker is stopped and the call returns `{ ok: false, errors }`.
- The site sends a content policy that allows scripts, connections, images and fonts from the site itself only (plus in-memory scripts for the worker), so a made source cannot reach another site.
- Anything that comes from storage or from a link is treated as untrusted: it is re-checked by the quality bar in the worker before it is accepted, a link still asks first in plain words, and an item that fails is listed as "needs re-making" and nothing of it is drawn or exported.
- The bag exports what it stored: a package is built from the bag item's own definition, and replacing a bagged asset with a failing draft is refused.
- A failed save (storage full) is reported, never swallowed.

Every high-level action returns plain data (no DOM nodes, no class instances) and never throws for a bad asset: it returns `{ ok: false, errors: [...] }` with messages an agent can act on.

## Contract 12: styles (more than one way to draw and export an asset)

Decision from Keyang, 2026-11-18 18:40, after `docs/sprite-styles.md` and `docs/sprite-data.md`: one asset may be offered in several styles; the user chooses the style to synthesize and export. A style that is not technically possible for an asset, or makes no sense for it, is simply not offered for that asset. Not a priority for the three bundles (they are pixel art only), but the framework must be built so that a new rendering pipeline and a new export pipeline plug in without changing the assets that do not use them. Status: **designed, the seam is not built yet** (task W6-A, after the run-time asset work lands).

What a style is: a named pipeline with three parts.

| Part | What it does | Pixel style (today's behaviour, unchanged) |
|---|---|---|
| Drawing surface | Turns a sprite's drawing calls (`g.ellipse`, `g.limb`, `g.rect`, ...) into a picture | The pixel grid in `engine/surface.js` |
| Finish | Steps applied after drawing: outline, shading depth, palette, grid size | Dark 1 px outline, three tones, the bundle palette |
| Exporter | Turns frames into files | Sheet PNG plus JSON (Contract 8) |

Names reserved now, so nothing built today has to be renamed later:

| Where | Field | Meaning | Default |
|---|---|---|---|
| Sprite file | `styles: ['pixel', ...]` | The styles this asset supports, best first | `['pixel']` |
| `render(g, ctx)` | `ctx.style` | The style being drawn; a sprite may branch on it for its detail layer (a one-pixel eye in `pixel`, a drawn eye in `flat`) | `'pixel'` |
| Framework | `engine/styles.js`: `defineStyle({ id, label, makeSurface, finish, exporters })`, `styleById`, `stylesOf(sprite)` | The registry every renderer and exporter goes through | `pixel` registered |
| Catalogue row | `styles` | For the style filter (FIND-4) and the style choice on a sprite page | `['pixel']` |
| Bag item, page link | `style` | The chosen style, stored like any other setting | omitted = first supported |
| Sheet JSON, `manifest.json` | `style` | Which pipeline made the files | `pixel` |
| `window.loadout` | `render(id, { style })`, `api.styles` | Route 2 can ask for any supported style | |

Rules for asset makers today (they keep the second level in `sprite-styles.md` possible):

- A sprite draws only through the surface's documented calls. It never reads pixels back and never writes the pixel buffer directly; helpers that must (noise, pattern fills) live in the framework and say which styles they suit.
- Body shapes go through shape calls (`ellipse`, `capsule`, `limb`, `poly`, `arc`); single pixels and pixel rectangles are for detail (eyes, highlights, trim). A later style redraws the detail layer, not the body.

Three levels, from `sprite-styles.md`: (1) the same drawing with a different finish (palette, outline, flat or three-tone, silhouette, 1-bit): a setting, on every sprite; (2) the same rig through a different surface (flat or vector, cel-shaded, cut-out parts for a skeletal export): a second pipeline plus a per-style detail layer on each sprite that opts in; (3) hand-painted, true hand-drawn, pre-rendered 3D: not possible from shapes in code, never listed. The quality bar runs once per style a sprite declares.

## Contract 13: rigs are separate from sprite definitions

Decision from Keyang, 2026-11-18 18:51: "we will need to separate rigs from sprites definition". It followed the question of whether a person could change a sprite's raw definition data (add a part, add an animation) and have the sprite redrawn. Status: **decided; the reading below is a proposal and nothing is built**. Not a priority for the three bundles.

The reading (written by the session that took the decision, not yet confirmed by Keyang):

| Thing | What it is | Holds |
|---|---|---|
| **Rig** | Code, in `rigs/` | The body and how it is drawn; the poses it knows; the parts it can wear or hold, each with its drawing and its options; attach points; the standard clips |
| **Sprite definition** | Data only, no drawing code | Which rig; proportions and colours; which clips (pose names); which parts it offers, with their controls and defaults; tags; sounds |

A generic renderer in the framework turns a definition plus its rig into frames. Adding a part the rig has, or an animation the rig knows, is then a change to data.

What this buys:

- A person in the studio (route 3) or an agent (routes 1 and 2) adds a part or a clip by editing data, not code.
- A definition that is data is safe to put in a link or a bag; source code is not.
- A fix or a new part in a rig reaches every sprite on that rig.
- A new style (Contract 12) redraws the rig once, not every sprite on it.

Where the code stands on 2026-11-18:

| Fact | Count |
|---|---|
| Rigs, already separate files | 5 (`humanoid`, `topdown`, `creature-topdown`, `crawler`, `bigbody`), about 4,800 lines; no sprite uses `creature-topdown` yet |
| Sprites that use a rig | 14 of 55 |
| Sprites with no rig (tiles, backgrounds, interface pieces, effects, pickups, the slime) | 41 of 55 |

So the files are separate today but the data is not. A rig sprite's file still holds three kinds of code:

1. **Wiring**: which rig drawing to call on which layer, at which settings, with which options (`sprites/merchant.js`, `render`). This is nearly data already.
2. **Pose adjustments**: for example the Hero's unarmed attack becoming a punch (`sprites/knight.js`, `heroPose`).
3. **Drawing of its own**: for example the Hero's cape. By Contract 11 this belongs in the rig.

What a rig does not have yet: a list, readable by a program, of its parts (name, layer, options, attach point) and its poses with their adjustments. `POSES` and the kind lists (`ITEM_KINDS`, `HEADGEAR_KINDS`) are a start.

Sprites with no rig stay as code files. The same split could later apply to other generators (tiles, stretchable boxes), which is a separate decision.

Open, for Keyang:

| Id | Question |
|---|---|
| R1 | Is the reading above what was meant? |
| R2 | Is a definition a JSON file, or a data object in a `.js` file as today? |
| R3 | Are the 14 rig sprites converted, or only new ones written this way? |
| R4 | New animations as key poses in data (a list of joint settings the engine blends between): in scope, or later? |

## Routes of the site (after wave 2)

`#/` home (search first, bundles, start from a game type) · `#/browse?...` results with filters · `#/sprite/<id>` · `#/sound/<id>` · `#/music/<id>` · `#/bundle/<id>` · `#/bag` · `#/play`. Old links (`#/kit/...`, `#/sprites`) keep working.

## The builder and reviewer loop

1. The orchestrator gives a builder a task with owned files and acceptance checks.
2. The builder writes tests first, builds, runs its own tests, and reports: files changed, tests added and their result, what is not done, what in this document was wrong.
3. A reviewer who did not build it checks the work against the task, this document and the quality bar, runs the tests, and returns PASS or a numbered list of required fixes.
4. Fixes go back to the builder. At most three rounds, then the orchestrator decides.
5. On PASS the orchestrator commits, and updates `docs/progress.md` and the status column in `docs/features.md`.
