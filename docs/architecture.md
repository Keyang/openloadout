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
| Background layer | A wide frame (for example 192x108) that tiles horizontally; clips are layers (`far`, `mid`, `near`) |
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

**What the export says about parts.** `renderSheet` writes `parts: { weapon: { label, socket, present, settings } }` and, when the sprite provides `sockets(clip, t, p)`, a `sockets` object on every frame: `{ hand: { x, y, angle }, ... }` in sheet pixels from the frame's top-left, angle in radians (0 down, PI/2 facing, PI up). A game can attach or swap a part at run time from these.

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
      // sprite: frame: [64, 64], clips: [{ name, label, frames, loop, fps }], controls: 15, parts: ['weapon'], sounds: 4 (distinct sounds used)
      // audio:  seconds: 0.37, loop: false, stereo: false, bpm: null, controls: 5, styles: ['Heavy blade', ...]
    },
    thumb: 'generated/thumbs/knight.png',     // sprite: one frame, 2x. sound: waveform. music: none
    strip: 'generated/strips/knight.png',     // sprites: the preview clip's frames in one row, 1x. stripFrames, stripFps alongside
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

## Contract 9: the playground

`#/play`. A sandbox where the visitor tries what is in their bag. It has two modes chosen from the player sprite's `meta.view`: side view (walk, jump, gravity, ground tiles) and top-down (walk in four directions over floor tiles, using the direction clips of Contract 2). It is not three fixed games: it works with whatever is there. A sprite's role decides what it does: a player sprite is moved with the keyboard (its clips are picked by name: idle, walk, run, jump, attack...; its sounds fire on their frames); enemies and creatures move by themselves; pickups can be collected (their collect clip and sound play); tiles make the ground; background layers scroll; a music track plays with its controls; sound effects get buttons. The bag's theme applies to everything.

## Contract 10: the quality bar

`quality/sprite.js` exports `checkSprite(def, { soundIndex, validateMeta }) -> { errors: [], warnings: [], metrics: {} }` and `quality/sound.js` exports `checkSound(patch, { validateMeta }) -> { errors, warnings, notes, metrics }`. `validateMeta` is `catalog/schema.js`'s function, called with the kind `'sprite'`, `'sound'` or `'music'`. Pure JS, no file access, so the same checks run in the build and in a browser. `tools/check.mjs` and `tools/sfx.mjs` are thin command-line wrappers. `docs/quality-bar.md` is the written bar; `docs/review-protocol.md` is how an independent reviewer judges look and sound from renders and measurements.

## Routes of the site (after wave 2)

`#/` home (search first, bundles, start from a game type) · `#/browse?...` results with filters · `#/sprite/<id>` · `#/sound/<id>` · `#/music/<id>` · `#/bundle/<id>` · `#/bag` · `#/play`. Old links (`#/kit/...`, `#/sprites`) keep working.

## The builder and reviewer loop

1. The orchestrator gives a builder a task with owned files and acceptance checks.
2. The builder writes tests first, builds, runs its own tests, and reports: files changed, tests added and their result, what is not done, what in this document was wrong.
3. A reviewer who did not build it checks the work against the task, this document and the quality bar, runs the tests, and returns PASS or a numbered list of required fixes.
4. Fixes go back to the builder. At most three rounds, then the orchestrator decides.
5. On PASS the orchestrator commits, and updates `docs/progress.md` and the status column in `docs/features.md`.
