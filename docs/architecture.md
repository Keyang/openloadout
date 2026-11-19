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

**Ready-made versions** (sprites, optional; `docs/site-design.md` section 4): `versions: [{ name, params }]` in `defineSprite`, named settings a person can start from. Names are everyday words of at most four, and `params` holds only settings that differ from the defaults; `engine/versions.js cleanVersions` checks them when the sprite is defined, and the quality bar (Contract 10) checks every version like any other settings. A sprite that lists none gets generated versions (`versionsOf`). The build writes every asset's versions, hand-made first, to `generated/versions.json`; the catalogue carries only `tech.versions`, the number of hand-made ones.

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

`npm run build` writes `generated/catalog.json`, and only after every asset has passed validation and the quality bar (Contract 10): a build that stops leaves the last finished catalogue in place, so a failed build never adds an asset to the site. (A build run with `--skip-quality` leaves the bar out and ends by saying the site is not checked.) The site lists and filters from this file and loads an asset's own file only when it needs to draw or play it.

```js
{
  version: 1,
  assets: [{
    id: 'knight', kind: 'sprite',            // kind: sprite | sound | music
    name: 'Hero', description: 'A brave adventurer...',
    type: 'character', role: 'characters/player', themes: [...], gameTypes: [...], view: 'side', words: [...], license: 'draft',
    styles: ['pixel'],                        // sprites only: the styles it can be drawn and exported in, best first (Contract 12); from the sprite's `styles`
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
  shapes: false,              // true: also vary each asset's own controls from the seed, within the rule below
}
```

- `engine/theme.js` (built in W2-D1): `defaultTheme()`, `normalizeTheme(theme)`, `applyColour(pixels, theme.colour, materials)` (changes a Surface's `Uint32Array` or an RGBA byte array in place), `themedParams(sprite, baseParams, theme)` (returns `baseParams` unless `theme.shapes` is true), `spriteLook(sprite, baseParams, theme)`, `renderThemedFrame(sprite, clip, frame, baseParams, theme)`, `randomTheme(seed, { shapes })`, `PALETTES` (11 named palettes), `THEME_PRESETS` (14 named whole-bundle looks: `{ id, name, blurb, theme }`).
- `sound/theme.js`: `applySound(rendered, theme.sound)` (pitch by resampling, so length changes; brightness by filter), `themedSoundParams(patch, baseParams, theme)` (music: tempo, intensity and key go through the track's own controls; with `shapes` a sound effect takes another of its own named styles), `shouldResample(patch)` (false for music), `soundSettingsFor(patch, theme)`.
- `outline` replaces the standard outline colour everywhere it is used, which includes eyes and pupils.

**A look may move hue, warmth and tone, but a thing must stay what it is** (decided after the final review of 2026-11-18: under the Forest look a sky turned brown, under Mono a row of colour-coded cells became one grey, and "Also change shapes" took the teeth off a saw). Three rules, all in the framework, none per asset:

**1. Every colour has a material, and a material has limits.** `engine/materials.js` lists the materials: sky, water, plant, earth, wood, stone, metal, skin, cloth, fire, light, magic, interface, signal, warning, and `paint` for anything else. Each says how far a look may pull a colour from the colour it was made in: how many degrees its hue may turn, how much of its strength it keeps, how much lighter or darker it may get. The limits are measured from the made colour, so a green-skinned goblin stays green and a dusk sky stays dusk.

| Material | Hue may turn | Keeps at least | Lightness may change | Note |
|---|---|---|---|---|
| skin (also fur, hide, feathers) | 12° | 60% of its strength | 0.08 | |
| plant | 12° | 75% | 0.10 | A meadow stays green, not olive |
| warning, signal | 10° | 85% | 0.07, 0.08 | Keep their colour under every look, one-colour looks included: a red heart stays red, not rust |
| metal | 14° | 40% | 0.10 | Gold stays golden |
| fire | 20° | 70% | 0.10 | |
| water, wood, sky | 24° to 28° | 45% to 55% | 0.10 to 0.12 | |
| earth, light | 30°, 35° | 45%, 55% | 0.12, 0.10 | Earth includes roofs of clay, thatch or slate |
| magic, stone | 50°, 60° | 60%, none | 0.12 | A stone (or a bone) may lose its colour, never gain much |
| cloth, interface | any | any | 0.22, 0.14 | |
| paint | any | any | any | The plain colour maths, as before |

(Lightness is on a 0 to 1 scale. The numbers live in `MATERIALS`; this table is a reading aid.) A look turns a colour's hue toward what it wishes only as far as the wish lies in that direction: a wish up to 60° away turns it as far as the material allows, one more than 150° away (the look has nothing of this kind: a brown for a sky) not at all, and in between less and less (`FAR`), so two shades of one thing whose wishes differ a little turn alike.

A colour control's material is, in order: what it declares (`color('Edge', ..., { material: 'warning' })`), what its label says ("Sky", "Grass", "Skin"), what its key says, and last the default for the sprite's type (`controlMaterial`). Words that name a thing which can be made of different stuff (a door: wood or metal; a liquid; a card; a shard: `UNSAID_WORDS`) say nothing a look can use: a control called by one of them must declare its material, and the quality bar warns when it does not (`unsaidMaterial`). Which colours of a picture a control paints is found by drawing: `spriteMaterials(sprite, settings)` draws a sample of frames once as set and once more per colour control with that control set to a colour no sprite uses; the pixels that change are that control's. A colour that no control paints takes the sprite's rest material (`signal` in an interface piece, `light` in an effect, else `paint`; a sprite may say `materials: { rest: 'stone' }`). The table is kept per sprite and settings. A sprite made on a visit is drawn in a worker and is not asked: all its colours take the rest material.

`applyColour` with that table (its third argument) gives each colour what the look wishes, pulled back inside its limits (`holdColour`). With a colour set, a colour whose nearest set colour is outside its limits takes the nearest set colour that is inside and is the same kind of colour (`sameKind`); only when the set has none is it held between the two, off the set, and then it keeps the lightness the look gives it before its colour set (so the bands of a night sky stay bands where the set has no colour for them). **So a look with a colour set no longer paints everything in that set**: a sky under Forest is a duller, greener blue that the Forest set does not hold. Without the third argument `applyColour` is the plain colour maths it always was; the engine's helpers that pick colours to survive every look (`engine/tiles.js`, `paving.js`, `ui.js`, `backdrop.js`) still use that, so no sprite's own pixels changed.

A look that leaves one colour only (shades of grey, the green screen, no colourfulness: `isOneColourLook`) cannot keep hues: there only lightness is held, except for `signal` and `warning`, which keep their hue and nine tenths of the strength they would otherwise keep (`KEEPS_SHARE`). Mono is therefore grey with its warnings, health bars and health pickups still in colour.

**2. Two tones that were clearly different stay clearly different, and each stays the kind of colour it was.** "Clearly different" is 0.07 in OKLab distance; afterwards they should be at least half as far apart as they were, up to 0.09 (`TONES`, `toneNeed`). In the same call:
- Under a look of many colours, most used colour first, a colour that has come too close to one already placed takes another colour of the set that its material allows **and that is the same kind of colour** (`sameKind`, limits in `KIND`: within 15° of the hue the look gave it and at least half its strength; a nearly grey one stays nearly grey), or else steps away from it the way it differed when made, or is made lighter or darker, again only into the same kind of colour. (Review of 2026-11-19: under Forest one plank of a wooden door jumped to the set's green to stay apart from the plank beside it.)
- Under a one-colour look only lightness tells tones apart, so all of them are spread out in lightness together (`spreadLightness`): in the order of lightness the look gave them, each pair gets the gap it needs, capped as low as the room in the picture forces, every tone stays inside its material's lightness limits and within 0.15 of the lightness the look gave it. Colours that keep their hue under such a look (signal, warning) keep it and count it as part of their difference.
- Under both, two tones a step apart (0.04 to 0.07: the bands of a night sky, `TONES.STEP`) are kept half their gap apart too where there is room, so a gradient does not become one colour where the look's set has one colour for it; only colours covering at least 0.4% of the picture are kept apart (`TONES.SHARE`, the same share the quality bar counts), so a few flower pixels never push the soil they lie on.
In a crowded picture this remains best effort: the quality bar names any pair left nearly the same.

**3. "Also change shapes" never removes or swaps what makes a sprite recognisable** (`themedParams`, limits in `SHAPES`):

| Control | What a look may do |
|---|---|
| Slider | Move by at most a quarter of its travel, and never outside the middle of its range (the range without a fifth at each end). One already outside the middle never moves further out. Marked `look: 'keep'`, it does not move |
| Choice | Nothing, unless the sprite marks it `look: 'vary'` (its options are variants of one thing). Then another option half the time, never "none" or "off", never one that takes a part off |
| On/off | Nothing, unless marked `look: 'vary'`; then it flips a quarter of the time |
| Part (Contract 3) | Never taken off, put on or swapped for another kind: its first control is left alone unless marked `look: 'vary'`, and even then never to or from its `none` value |
| Colour | Nothing. Colours are the look's own job |

**The record.** `spriteLook(sprite, baseParams, theme, { record })` returns `{ params, changed, recolour }`: every control's value as drawn, the keys the look changed, and the function that recolours the sprite's pixels (with the sprite's materials). Under a look, each sprite's entry in a download's `manifest.json` has `settings.params` set to those values and `changedByLook` to those keys, and the manifest says so in `settingsUsed` (`SETTINGS_USED` in `app/bundle.js`); the sheet's own JSON has the same `params`. The same picture can be made again from the record: draw with the recorded values, then recolour the way the site does, each colour held to what it is of: `renderThemedFrame(sprite, clip, frame, settings.params, theme)` with `theme.shapes` false does both. Applying `theme.colour` alike to every pixel (`applyColour` without materials) gives a different picture.

**The bag keeps what its look drew.** While the bag's look changes shapes, each sprite item keeps `settings.lookParams`: the controls the look changed and the values it gave them (`shapeRecord`). It is recorded when the item comes in (from a card, a page, a bundle or a link), when the item's own settings change, and when the shapes part of the look changes (another number behind "Surprise me", shapes switched on); a change of colours keeps it, and switching shapes off drops it. A sprite whose program is not loaded yet is recorded the first time the bag page draws it (`bag.fillLooks()`). The bag page, the playground and the download all draw from it (`record` in `spriteLook` and `renderThemedFrame`), so a bag shows and downloads the same pictures on every visit, also after the rule behind shapes changes. A bag link carries the records; added to a bag with another look, they are left behind and made again. (A bag saved before 2026-11-19 has no record: it gets one, under the rule of the day, the first time it is opened.) A package with no look is byte for byte what it was.

**On the site.** The switch has one sentence under it saying what it does. Adding a bundle to a bag that already has a different look of its own asks first, and can keep the bag's look. Every place that draws a sprite under a look passes its materials (`app/bundle-page.js`, `bag-page.js`, `play/draw.js`, `bundle.js`); the playground's own sky and ground are named colours (`namedMaterials`). `tools/scene.mjs` recolours a whole scene with one table merged from the sprites in it (`mergeMaterials`), which holds every material but keeps tones apart across the scene, not per sprite, so its look rows can differ a little from the site's.

**The quality bar** (`quality/sprite.js`, "held under every look") measures what the site draws under every named look and six "Surprise me" looks: a colour outside its material's limits is an error; two clearly different tones that end up nearly the same (under 0.02 apart) is a warning that names the pair and the look (`lookFaults`, `metrics.held`); a colour control named after a thing that can be made of different stuff, with no material declared, is a warning. `tests/unit/looks-kinds.test.mjs` holds the whole catalogue to no tones merged, no shades of one control split into two kinds of colour, and no pickup colour that carries a meaning lost.

## Contract 8: export

`app/bundle.js` builds every download in the browser: `packageFiles({ items, theme, scale })` returns the files for a zip with `sprites/<id>/` (sheet, JSON, the sprite's sounds), `sounds/`, `music/`, one `manifest.json` describing every asset with its role, and a guide. The export choice shows "Zip package" and "Unity package (coming later)", the second disabled.

**What a download says about each asset.** Everything visual is a sprite (Contract 2), so the rows of a sheet mean different things. `renderSheet` lays them all out the same way and its JSON is unchanged; `describeSheet(sprite, sheet, p)` (`engine/sheet-info.js`) adds what kind of sheet it is and what that kind needs, and `app/bundle.js` writes the result as `<id>.json`. `app/guide.js` writes every text of a download from that JSON alone, so text and JSON cannot disagree: `how-to-use.txt` next to each sheet is written for the kind (a figure, a figure with a row per direction, an object, a pickup, a projectile, an effect, a tileset, a background, an interface piece, a set of pictures, one still picture), with steps for Unity and Godot that are stated as not tried in the engines. Rows and frames are counted from 0 everywhere. `tests/helpers/download-check.mjs` is the one checker the unit tests (every file in `sprites/`) and the browser tests (a real download of every bundle) hold these to.

| Where | Field | Meaning |
|---|---|---|
| Sheet JSON | `kind` | `character`, `creature`, `object`, `pickup`, `projectile`, `effect`, `tileset`, `background`, `interface`, `pictures` or `animation` (`sheetKind`: from `meta.type`, then `meta.role`, then whether anything moves) |
| | `view` | The sprite's `meta.view`, when it has one |
| | `counting` | One sentence: rows and frames are counted from 0 |
| | `grounded` | `true` when the pivot is the point that stands on the ground, `false` when it is only the thing's anchor |
| | `facing` | Kept (`right`) only for a side-view character, creature or projectile and a top-down projectile. Removed where it would be false or is not recorded: tilesets, backgrounds, interface pieces, pictures, objects, pickups, a figure with a row per direction, and every effect (some show a direction, some do not, and nothing records which) |
| | `animations[name].label` | The row's everyday name |
| | `animations[name].direction` | Only on a sheet with a row per direction: `down`, `up`, `right` (a name ending `_side`) or `any` |
| | `animations[name].state` | An interface piece: `true` on the rows that are states of one piece and not pieces of their own (`stateRows`: every row of a button or a cursor, the standard state names anywhere else) |
| | `animations[name].textArea` | An interface piece: where text goes, `{ x, y, w, h, colour }` in sheet pixels from the frame's top left corner (a list when there are several), from the sprite's `textArea` |
| | `tiles` | A tileset: `tileSize`, `how` (how to read it), `groups`, `tiles` (`{ group, piece, family }` for each tile name) and `other` (tiles placed by hand), from `tileRules` in `engine/tile-rules.js` |
| | `tiles.groups[]` | `{ name, kind, use, solid, oneWay, tiles, versions, rules, patterns, decorations }`. `kind` is `block` (`use`: `ground`, `wall` or `hole`), `floor`, `liquid`, `platform`, `slope` or `stack`. `solid` groups block the way; a `platform` is not solid and carries `oneWay: true` instead (stood on from above only), and no other kind has `oneWay`. `rules` is an ordered list `[{ tile, needs }]`, first match wins, a neighbour not named may be either (a Rule Tile in Unity). `patterns` is `[{ tile, around }]`: one complete arrangement of all eight neighbours for each tile the rules pick, the fullest it is used for, a corner counted only with both its sides (a terrain in Godot, which matches cell by cell and has no ordered rules). Both are made by asking the picker in `engine/tiles.js` about every arrangement, never written by hand |
| | `layers`, `layersHow` | A background: `[{ name, row, scroll }]` from the back to the front; `scroll` is the share of the camera's movement the layer slides by (`layerScroll`) |
| `manifest.json` entry | `whatItIs` | A few everyday words for the asset ("tileset for a top-down game", "sound effect") |
| | `license` | The licence value the asset records, as recorded, or `null` |
| Package | `read-me.txt` | Opens with the contents list: each asset's name, what it is and where it is (folders are named after ids) |
| | `licence.txt` | The licence value every asset records and what each value means. `draft` is said to be undecided; no terms are stated that nobody has set. A single-sprite download says the same inside `how-to-use.txt` |

**Stretchable pieces.** A sprite may declare `slice`: one entry per clip a game may stretch (an object, or a function of the settings), or one function `(clip, p)`. `renderSheet` (`engine/sprite.js`, `clipStretch`) then writes these fields into the sheet JSON, on the clip's entry in `animations` and on each of its frames, in sheet pixels (they scale with the sheet). A sprite with no `slice` gets none of them and its sheet is unchanged.

| Field | Shape | Meaning |
|---|---|---|
| `border` | `{ left, bottom, right, top }` (Unity's order) | How far the corners reach in from each side of `rect`, or of the frame when there is no `rect`. Keep the corners; repeat the edges along their length and the middle both ways. From `slice[clip].left / top / right / bottom` |
| `rect` | `{ x, y, w, h }` | Where the piece sits in its frame, when it does not fill it (a name tag, a highlight row). Cut this out first; `border` is measured from it |
| `opening` | `{ x, y, w, h }` | A bar: the trough of the housing, which is exactly where its fill strips lie. It moves with the bar's settings |
| `tile` | `{ x, w }` | Instead of `border`, for a middle that repeats a pattern (a segmented bar): columns `x` to `x + w - 1` are one repeat. Insert whole copies of them to lengthen the piece; never stretch it |

A cursor's hot spot is a socket named `tip` on each frame (`sockets`, Contract 3); the pivot is not moved to it. `engine/ui.js` has the helpers (`slice9`, `barOpening`) and its header repeats this table.

## Contract 9: the playground

`#/play`. A sandbox where the visitor tries what is in their bag. It has two modes: side view (walk, jump, gravity, ground tiles) and top-down (walk in four directions over floor tiles, using the direction clips of Contract 2). The mode is chosen from what the bag holds (`app/play/roles.js`, `chooseMode`): the `meta.view` of its ground tiles when they all say the same view, else the view most of its things were drawn for; when the bag has things for both, the page offers "Side view" and "Top-down" and each view keeps its own picks. A sprite drawn for one view (`meta.view` `side` or `top-down`) is never placed in the other view's scene: it is listed under the scene with the reason and the way to see it. Every other view (`front`, `none`) fits both. It is not three fixed games: it works with whatever is there. A sprite's role decides what it does: a player sprite is moved with the keyboard (its clips are picked by name: idle, walk, run, jump, attack...; its sounds fire on their frames); enemies and creatures move by themselves; pickups can be collected (their collect clip and sound play); tiles make the ground; background layers scroll; a music track plays with its controls; sound effects get buttons. The bag's theme applies to everything.

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

**Safety of run-time assets (after the review of 2026-11-18; status: built as task W5-B and reviewed twice; verified in Chromium only, see the list of what remains below and in `docs/framework-api.md`).** A sprite made at run time is a program. The review showed that importing it into the page lets it read storage, call other sites, change the page and hang it, and that a definition kept in the bag or carried by a link ran again on every load. The rules:

- A made source never runs in the page. It is loaded, checked and drawn only inside a dedicated worker that the page can stop; the page receives pixels and data, never functions. Every call has a time limit (about 60 s for a check, far less for a frame) and a frame-size cap; on a limit the worker is stopped and the call returns `{ ok: false, errors }`.
- The site sends a content policy that allows scripts, connections, images and fonts from the site itself only (plus in-memory scripts for the worker), so a made source cannot reach another site.
- Anything that comes from storage or from a link is treated as untrusted: it is re-checked by the quality bar in the worker before it is accepted, a link still asks first in plain words, and an item that fails is listed as "needs re-making" and nothing of it is drawn or exported.
- The bag exports what it stored: a package is built from the bag item's own definition, and replacing a bagged asset with a failing draft is refused.
- A failed save (storage full) is reported, never swallowed.
- The quality bar never runs next to a made source (built in W5-B, round 2). The sprite's worker only loads and draws; the bar runs in the site's other worker, which never loads the source, on the frames; the frames it asks for are drawn by ordinary drawing requests, kept by settings, and are what the page shows at those settings. A download runs the bar again on exactly the frames it is about to write and leaves out a setting that fails (`refused`).
- What remains (a risk to what a picture looks like, not to the machine): a setting the bar never sampled can draw anything on a page or in the playground, though not in a download, and a source can guess the sampling. The worker shares the site's origin, so its ways to the site's storage are closed by a removal list, not by a wall. Only Chromium has been verified; `docs/framework-api.md` says what to check in Firefox and Safari, and `tests/e2e/route2-browsers.spec.mjs` checks it in any installed browser.

Every high-level action returns plain data (no DOM nodes, no class instances) and never throws for a bad asset: it returns `{ ok: false, errors: [...] }` with messages an agent can act on.

## Contract 12: styles (more than one way to draw and export an asset)

Decision from Keyang, 2026-11-18 18:40, after `docs/sprite-styles.md` and `docs/sprite-data.md`: one asset may be offered in several styles; the user chooses the style to synthesize and export. A style that is not technically possible for an asset, or makes no sense for it, is simply not offered for that asset. Not a priority for the three bundles (they are pixel art only), but the framework must be built so that a new rendering pipeline and a new export pipeline plug in without changing the assets that do not use them. Status: **the seam is built (task W6-A, 2026-11-18). `pixel` is the only style on the site and no real asset lists a second one.** That the seam carries another rendering pipeline and another export pipeline is proven on test fixtures only (`tests/fixtures/styles/`: a finish-only `silhouette` and an `outline-svg` that records shapes and exports one SVG per frame). Every existing sprite draws and exports byte for byte as before (`tests/unit/styles-identical.test.mjs`, `tests/e2e/styles.spec.mjs`).

What a style is: a named pipeline, registered with `defineStyle` in `engine/styles.js`. Three parts were designed; building the second surface showed two more are needed whenever the surface is not a pixel grid.

| Part | In `defineStyle` | What it does | Pixel style (unchanged behaviour) |
|---|---|---|---|
| Drawing surface | `makeSurface(width, height, options)` | A new surface for one frame; it turns a sprite's drawing calls (`g.ellipse`, `g.limb`, `g.rect`, ...) into a picture | The pixel grid in `engine/surface.js` |
| Finish | `finish(surface, context)`, optional | What is done to a frame after the sprite drew it (flatten, palette, outline) | None: the outline and the three tones are drawn by the sprite itself, as before |
| Pixel picture | `toPixels(surface)`, only for a surface that is not a pixel grid | A pixel `Surface` of a finished frame: what the site previews and what the quality bar looks at | Not needed |
| Look | `recolour(surface, apply)`, only for a surface that is not a pixel grid | How a whole-bundle look (Contract 7) recolours a finished frame | Not needed: the look recolours the pixels |
| Exporter | `exporters: { sheet(sprite, params, options) }` | Turns a sprite into files: `{ files: [{ name, bytes, type }], data }`, where `data` is the JSON that ships with them | `pngSheet`: sheet PNG plus JSON (Contract 8) |

```js
defineStyle({ id, label, about, makeSurface(width, height, options), finish(surface, context), toPixels(surface), recolour(surface, apply),
              exporters: { sheet(sprite, params, { style, scale, clips, recolour, encodePng }) } })
styleById(id)   styleIds()   stylesOf(sprite)   supports(sprite, id)   styleFor(sprite, id)   // styleFor throws for a style the sprite does not list
exportSheet(sprite, params, options)   pixelsOf(surface, id)   recolourFrame(surface, id, apply)   pngSheet   // pngSheet: the exporter of every pixel-grid style
```

Everything that makes a frame goes through the registry: `renderFrame(sprite, clip, frame, p, { style })`, `renderPixels(...)` (the same frame as pixels, whatever the style), `renderSheet(sprite, p, { scale, clips, style })`, `renderThemedFrame(sprite, clip, frame, p, theme, { style })`. Left out, `style` is the sprite's first. **A style the sprite does not list is an error that names the styles it has, never a fallback to another style.** The PNG writer is handed to the exporter (`encodePng`: a canvas in the browser, `tools/png.mjs` in Node), which is how a pixel export stays the same bytes as before.

Style as data, as built:

| Where | Field | Meaning | Default |
|---|---|---|---|
| Sprite file | `styles: ['pixel', ...]` | The styles this asset supports, best first. `defineSprite` checks it: known ids, no repeats, not empty | `['pixel']` |
| `render(g, ctx)` | `ctx.style` | The id of the style being drawn; a sprite may branch on it for its detail layer (a one-pixel eye in `pixel`, a drawn eye in `flat`) | `'pixel'` |
| Framework | `engine/styles.js` | The registry every renderer and exporter goes through | `pixel` registered |
| Catalogue row | `styles` | For the style filter (FIND-4) and the style choice on a sprite page. Sprite rows only (a sound's named styles are `tech.styles`, a different thing) | `['pixel']` |
| Bag item | `settings.artStyle` | The chosen art style, stored like any other setting. Left out when it is the sprite's first style, so every item made before styles is unchanged | omitted = first supported |
| Sprite page link | `artstyle=<id>` | The same, in the address | omitted = first supported |
| Sheet JSON, `manifest.json` entry | `artStyle` | Which pipeline made the files. **Written only when it is not `pixel`**: adding the key would change every existing export, so a file without it is pixel | absent = `pixel` |
| `generated/api.json` | `styles: [{ id, label, about, exports }]` | What is registered, read from the registry by the build | `pixel` |
| `window.loadout` | `render(id, { artStyle })`, `bag.add(id, { artStyle })`, `(await loadout.api).styles`, `assets.get(id).asset.styles` | Route 2 can ask for any style a sprite lists; another is refused with `{ ok: false, errors }` | |

**The chosen art style is called `artStyle`, never `style`, wherever a control's key can appear** (decision of 2026-11-18, after the seam was built): 28 of the 78 sprites already had a control with the key `style` (tilesets, panels, crates), and `style` is also the name of a sound's named style in a bag item and in the `render` action. So: `artStyle` in a bag item, in `render` and `bag.add`, in the sheet JSON and the manifest; `artstyle=` in a page link. A sprite with several art styles may have a control called `style` (the test sprite `tests/fixtures/styles/sparkle.js` has both). Two names stay as they were, because no control name can appear there: `styles: [...]` on the sprite, and `ctx.style` in `render(g, ctx)`; the engine's own options (`renderFrame(..., { style })`, `exportSheet(..., { style })`) keep `style` too.

On the site: a sprite that lists more than one style shows a "Style" choice above its other controls (each style's `label`, and its `about` under the choice); the preview, the frame strip, the link, the bag item and the download follow it, and so do the bag page (the item's picture, its description and its "Change" link) and the playground. A card made on a visit is drawn live in the sprite's first style. A sprite with one style shows nothing new. Not following a chosen art style: built thumbnails and strips (always the first style), the bundle page, and the playground's collision box (measured on the pixel drawing).

Export per style: `app/bundle.js` asks the chosen style's exporter for the picture files and adds the sounds, the JSON and a guide around them, so a style can export something other than a PNG sheet. A bag item that names an art style its sprite does not list is left out of the package and named under `unsupported` in `manifest.json` (`{ id, artStyle }`).

Quality bar per style: `checkSprite` runs once for every style a sprite lists, on that style's pixel picture of each frame. With `pixel` alone it runs once and reports exactly what it did before. With more styles, each message about a drawing starts with `style "<id>": `, faults of the sprite itself (controls, metadata, sounds) are reported once, and `metrics.styles` holds each style's numbers. The cached result is still one per sprite file and its key is unchanged (the file's text, which holds the `styles` list, plus everything in `engine/`, `rigs/`, `sound/`, `quality/`): a style defined outside those folders, as the test styles are, is not part of the key. Every listed style costs a full pass (the three-style test sprite: 18 ms, 10 ms and 12 ms).

**Decision from Keyang, 2026-11-19: multi-style is the default, pixel-only is declared.** New assets are written so they can be drawn in more than one style. An asset that cannot (it reads pixels back or pastes its own pixel layer, or sits on a rig that does) declares `styles: ['pixel']` explicitly with the reason, so the site offers no style choice for it and no other style is ever applied. Built: the `styles` field; `defineSprite` records whether `styles` was written (`def.stylesDeclared`, so omitting it is not a declaration); an optional `stylesWhy` sentence (needs an explicit `styles`) that is copied into the catalogue row as `stylesWhy`; and the checker: a read-back sprite that lists more than one style is an **error**, one that did not write `styles: ['pixel']` is a **warning** ("draws outside the surface's calls", naming the line to add), one that declared it is clean. Not built: making the undeclared case an error (a warning until the existing sprites are declared), and requiring `stylesWhy`.

Rules for asset makers today (they keep the second level in `sprite-styles.md` possible):

- A sprite draws only through the surface's documented calls. It never reads pixels back and never writes the pixel buffer directly; helpers that must (noise, pattern fills) live in the framework and say which styles they suit. The quality bar warns when a sprite's own code does: "draws outside the surface's calls", with the file and line (`metrics.outsideCalls`). It finds this by drawing a sample of frames on a stand-in for the surface and tracing each read-back to its file. Two limits: it can miss code that runs only for one option on one middle frame, and it sees only the surface the sprite is handed, not pixels read from a layer the sprite made itself (`new Surface`).
- Body shapes go through shape calls (`ellipse`, `capsule`, `limb`, `poly`, `arc`); single pixels and pixel rectangles are for detail (eyes, highlights, trim). A later style redraws the detail layer, not the body.
- A control must do something in every style the sprite lists. A colour control does nothing to a silhouette, so a sprite with colour controls fails the bar in such a style; there is no way yet to say "this control applies in these styles only".

**The surface interface today.** There is no written interface: a surface is whatever `engine/surface.js`'s `Surface` answers. A second surface has to answer the calls below. Counted 2026-11-18 over 76 files in `sprites/`, 5 in `rigs/` and 18 helper modules in `engine/`: call sites in the source, and calls made from outside `surface.js` while drawing all 1,969 frames at default settings.

| Call | Call sites | Calls made | Carries over to a surface that keeps shapes? |
|---|---|---|---|
| `rect` | 641 | 22,425 | Yes as a shape, but most are one or two pixels of detail and become specks |
| `ellipse`, `capsule`, `limb`, `poly`, `arc` | 85, 40, 65, 50, 15 | 1,840, 1,000, 4,839, 1,598, 105 | Yes. `limb` snaps its ends to the pixel grid, which another surface ignores |
| `outline` (rim round everything drawn so far) | 92 | 1,865 | Yes: the same shapes underneath, one pixel bigger |
| `tint` (hit flash) | 29 | 48 | Yes: recolour what was recorded |
| `dot`, `line` (one pixel wide) | 366, 56 | 308,276, 2,732 | **No.** A one-pixel eye becomes a speck; the detail layer has to be drawn again for the style |
| `fill`, `blob` with a test function, and the shape tests `ellipseIn`, `capsuleIn`, `polyIn`, `rectIn` | 41 `blob`; 262 shape tests | `fill` 12,446; `blob` 1,033 | **No, as they are.** The test is a function of a pixel centre. A `blob` of the four known shape tests could carry over if the tests were data, not functions |
| Options `shade`, `light` and a ramp as the paint (the three tones), and `g.shadow` | 44 uses of `shadow` | `shade` given 12,996 times; a ramp 19,249 times | **No.** The bands are a pixel offset test. A smooth style needs its own shading |
| Option `clip` (a test function), `minus` | | `clip` 5,327; `minus` 14 | **No** |
| Option `outline` on one shape | | 668 | Yes: a stroke |
| `get`, `bounds`, `bytes`, `.data` (reading pixels back, or the buffer itself) | 9 `bounds`, 66 `.data` | `get` 1,046,256 (713,717 from `rigs/`, 322,951 from helpers, 9,588 from sprites); `.data` 12 million, nearly all from helpers | **No.** `rigs/humanoid.js` reads pixels back hundreds of times a frame (about 390 for the Hero), so every sprite on that rig is tied to the pixel grid until the rig is changed |
| `blit`, with `new Surface`, `tilt`, `lean` (a sprite or helper draws on its own pixel layer and pastes it) | 46, 48, 11 | 453 | **No**: the layer is pixels. 27 of the 48 own layers are made in sprite files |

What the first real second style still needs, which the seam does not give: (1) a written surface interface, with `blob` and `clip` taking shapes as data; (2) the humanoid rig and the helpers drawing without reading pixels back; (3) a way for a control to say which styles it applies in; (4) shading for a smooth surface; (5) curves (`sprite-styles.md`); (6) a frame size per style (a smooth style is not 64 pixels) and quality rules of its own, because the bar only sees a pixel picture; (7) built thumbnails and strips per style, and the style filter (FIND-4).

Three levels, from `sprite-styles.md`: (1) the same drawing with a different finish (palette, outline, flat or three-tone, silhouette, 1-bit): a setting, on every sprite; (2) the same rig through a different surface (flat or vector, cel-shaded, cut-out parts for a skeletal export): a second pipeline plus a per-style detail layer on each sprite that opts in; (3) hand-painted, true hand-drawn, pre-rendered 3D: not possible from shapes in code, never listed. The quality bar runs once per style a sprite declares.

## Contract 13: rigs are separate from sprite definitions

Decision from Keyang, 2026-11-18 18:51: "we will need to separate rigs from sprites definition". It followed the question of whether a person could change a sprite's raw definition data (add a part, add an animation) and have the sprite redrawn. Status: **decided, and the reading below was confirmed by Keyang the same day; first steps exist, the renderer and the conversion do not**. Built on 2026-11-18 (see `docs/progress.md`): each character rig describes itself as data (`rigs/*-describe.js`, listed in `generated/api.json`, proved by `tests/unit/rig-describe-*.test.mjs`); a module that draws a side-view figure from a definition (`rigs/humanoid-figure.js`) with two sprites written that way (`sprites/rogue-battler.js`, `sprites/road-bandit.js`); the production rule that a rig sprite's file holds choices and thin wiring only. Not built: one generic renderer per rig, definitions as pure data, converting the older rig sprites. Not a priority for the three bundles.

The reading (confirmed by Keyang, 2026-11-18):

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

**Superseded by Contract 15 (draft, 2026-11-19):** rigs that are code, "sprites with no rig stay as code files" and R2 to R3 above give way to every sprite as data on bone rigs, base pieces and named generators; only the separation of a rig from a sprite definition stands.

Open, for Keyang:

| Id | Question |
|---|---|
| R1 | ~~Is the reading above what was meant?~~ Yes (Keyang, 2026-11-18) |
| R2 | Is a definition a JSON file, or a data object in a `.js` file as today? |
| R3 | Are the 14 rig sprites converted, or only new ones written this way? |
| R4 | New animations as key poses in data (a list of joint settings the engine blends between): in scope, or later? |

## Contract 14: the studio and data rigs (DRAFT)

Decision from Keyang, 2026-11-19: "create studio page -- sprite: allowing create rig / animation / frame and sprites. we will add music & sound track editing in future." Status: **draft, designed in `docs/studio.md`, nothing built.** It amends Contract 13 (a rig may be data, not only code), Contract 11 (studio items are not held to the quality bar) and answers R4 (yes) and, for data sprites, R2.

| Rule | What it says |
|---|---|
| 1. Two kinds of body | A **bone rig** is data (`loadout-rig`: bones with lengths and joint limits, shapes on bones with z-order and colour slots, two-bone IK chains, attach points). A **library body** is a code rig with a data layer; the first is the side-view person (`rigs/humanoid.js` through `rigs/humanoid-figure.js`). The code rigs stay; the studio starts from them as library bodies or as bone-rig templates shaped like them |
| 2. A studio sprite is one JSON object | `loadout-sprite`: id, name, blurb, `meta` (Contract 1), body, size, pivot, grounded, colours, controls (a bone rig's may only scale named bones or shapes; a library body's slider or choice sets one named field of its figure, from a fixed list; a colour control gives a colour slot its label and swatches; any control may carry `when`), parts (for a library body also in the form of Contract 3: params, none, socket), clips (sound cues may carry `when`), `versions` (Contract 1), preview, `made`. No functions anywhere. **Amended 2026-11-19 (orchestrator decision, studio item F1, within Contracts 11 and 14):** a definition stays pure data, but where it needs framework code it may NAME a function from a fixed, documented registry, the same way it names a rig. The registry is `engine/data-rules.js COLOUR_RULES` (`tone`, `mix`, `standOut`, `apart`, `bandTone`, `ramp`, `choose`): a library body's `body.paint` says which colour of its figure is worked out from which settings by which named rule. Nothing in the definition runs: a name is looked up, an unknown name or argument is refused by `catalog/studio-schema.js`, and every argument is data checked like any other field. A new named function is a framework addition (Contract 11: a new entry in the registry, its check, its test), never something a definition brings. Field lists: `docs/studio.md`, section 2 |
| 3. Animation is key poses | A clip is frames, fps, loop, `keys` (each `{ t, ease, ... }` holding only the numbers it changes: bone angles, IK targets, root offset, stretch; for a library body the fields of its pose object), `frameEdits` (nudge, show, hide, flash on one frame) and `sounds`. One framework function blends them; `t` is the phase as `engine/sprite.js` computes it. A library body's formula poses are only where first keys come from ("bake"). A library body's keys are made for its figure as stored (`keysFor`); drawn at other settings (sliders, parts) or after the stored figure changes (`refigure`), each key of a clip with `from` moves by what that formula moves at its `t`, so hand changes stay as offsets (`docs/studio.md` 3). The white flash is a frame edit, never a key. Library bodies are drawn only through `rigs/humanoid-studio.js drawSprite` / `spriteSockets` |
| 4. One way in | `engine/data-sprite.js dataSprite(json)` validates and returns a normal `defineSprite` result whose `render` and `sockets` are framework code. Every page, the bag, the playground, the export, the looks (Contract 7) and the quality bar take it as they take any sprite |
| 5. Pixels | A bone rig is drawn with the surface's shape calls (`limb`, capsule, turned ellipse, polygon), sampled at pixel centres; details (`dot`) are moved, never turned; same group and z paint as one `blob`; one `g.outline(INK)`, glow after it. No bitmap is ever rotated |
| 6. Safety | A definition is data drawn by framework code, so it needs no worker. `catalog/studio-schema.js` validates every definition from the studio, storage, a link or a file before anything is drawn: JSON ≤ 64 KB, prototype keys dropped, unknown fields dropped, numbers clamped, every count capped (bones 48, shapes 160, clips 32, frames 64 a clip and 256 in all, frame at most 128 x 96), every reference resolved. It knows top-down bodies (view `top-down`, `directions`, clip names `<action>_<down\|up\|side>`), so `validateStudioSprite` / `validateStudio` and `engine/data-sprite.js validateDataSprite` (the same check, errors and warnings capped at 50 each) accept the same definitions; S7, S8 and S11 may call either. Code that must read a definition before checking it uses the wall alone, `plainStudioData` (plain data only, no getter run, 64 KB). Text is shown as text only. A link still asks first |
| 7. Not held to the bar | A bag item with `definition: { data }` is added, played and exported without the quality bar (features.md: the bar applies to routes 1 and 2). The bar is shown in the studio as advice only. Everything else of Contract 11 holds |
| 8. To the library | The studio downloads `sprites/<id>.js` of one fixed form: a comment, `import { dataSprite } from '../engine/data-sprite.js';` and `export default dataSprite(<the JSON>);`. The build reads the middle back as JSON and refuses a file that claims the form but is not exactly it. Dropped into `sprites/`, it is route 1: the quality bar applies |
| 9. Where it is kept | Drafts: `localStorage` `loadout-studio-v1`, validated on every read, failed saves reported. Bag: `definition: { data }`, link entry `{ d }`, deflated when the link is made |
| 10. On `window` | `loadout.studio.starts, create, list, get, set, validate, bake, render, advice, toBag, file, remove`, each an action in `generated/api.json` |
| 11. Room for sound | The studio page is one stage, one timeline, one footer and a row of mode tabs (Body, Move, Frames, Look & name). Sound and music editing come later as more tabs on the same page; nothing is built for them now |

**Superseded in part by Contract 15 (draft, 2026-11-19):** rule 1's library bodies, rule 2's `body.library` and `FIGURE_*` tables, rule 3's library-body keys and (if DQ1 of `docs/data-sprites.md` is answered `.json`) rule 8's `.js` wrapper go; the bone rig, key poses (rule 3), `dataSprite` (rule 4), pixels (5), the validation wall (6), rules 7, 9, 10 and 11 stay and apply to every kind of asset.

Open for Keyang: `docs/studio.md`, section 9 (Q1 to Q5).

## Contract 15: every sprite is data (DRAFT)

Decision from Keyang, 2026-11-19: "we will create thousands assets soon which will take much more effort to migrate in future. can we build B and completely get rid of A from everywhere?" Status: **draft, designed in `docs/data-sprites.md`, nothing built.** It supersedes Contract 13 (code rigs) and Contract 14 rules 1 to 3 (library bodies) and, if DQ1 is answered `.json`, rule 8 (the `.js` wrapper), amends Contracts 2, 3, 11 and 12, and keeps Contract 14's bone rig, key poses, validation wall, studio and `window.loadout.studio`.

| Rule | What it says |
|---|---|
| 1. An asset is data | Every sprite, of every kind, is one `loadout-sprite` definition, version 2 (`docs/data-sprites.md` section 2): JSON, no function, expression or code text anywhere. `body` is one of `rig` (characters, creatures), `tiles`, `layers` (backgrounds), `panel` (interface pieces), `emitters` (effects), `pictures` (props, pickups, projectiles, icons). Version 1 definitions stay valid and draw the same |
| 2. Only the framework draws | The framework keeps generic renderers (`engine/draw-list.js` per style, `rigs/bones.js`, `rigs/keypose.js`, `engine/data-sprite.js`) and named generators. No sprite drawing code exists anywhere else; the build refuses a file in `sprites/` that is not the data form |
| 3. Computed variety is named | Hair from sliders, tile joins, derived colours, scatter, trims, scenery and particles are **named generators** from a fixed registry (`engine/gen/registry.js`): `{ "gen": "<id>", "v": <n>, ...args }`, each pure, deterministic, versioned, documented in `generated/generators.json`, unit-tested with golden output, with typed and capped arguments and a cost. A generator returns primitives and never touches a surface. A setting reaches a number only through a binding `{ "from": "<control>", "map": [[in, out], ...] }` or `{ "from", "pick" }`: a table, never a formula |
| 4. Pixel detail is data | Primitives include `stamp` (a pixel block on a node, moved, swapped or mirrored, never turned, with variants per pose or frame), `dither`, `bands`, `text` (font pieces), `rect`, `line`, `arc`, `ring` and the operations `outline`, `tint`, `cut`, beside the bone format's `limb`, `capsule`, `ellipse`, `poly`, `dot` |
| 5. Shared data are pieces | Bases (whole rigs with clips), parts (hair, headgear, held things), UI skins, tile materials, fonts and stamps are data files in `pieces/`, named `{ "use": "<id>", "v": <n> }`, owned and reviewed as framework. A changed look is a new version; a released version never changes |
| 6. Safety | A definition is drawn on the page with no worker: the plain-data wall of Contract 14 rule 6 (JSON ≤ 128 KB), every name looked up in the registry, every argument typed and clamped, every count capped and the summed generator cost under a budget before anything draws. Definitions travel in bags, links and files. Made sprites from source text (Contract 11, `make.sprite(source)`) end: `make.sprite` takes a definition |
| 7. The library and the bar | A library sprite changes only through its file, the quality bar (Contract 10) and an independent review. The studio and a sprite page's Advanced mode edit a copy (Contract 14 rule 7 holds for copies) |
| 8. Adding to the framework | A missing capability is a new generator, a new version of one, or a new piece, added through the `/sprite-forge` skill, test first (Contract 11). An asset never brings one |
| 9. Looks and styles | Every paint is a palette slot with a material, so Contract 7's material table is read from the data. The primitive list is Contract 12's seam: a style renders the primitives it supports, and a sprite may list any style that supports every primitive it uses |
| 10. Ids and settings | Redraws keep ids, clips and control keys; renamed options use `was`, renamed controls a sprite-level `was: { controls }`; bag items record the definition's `rev` and re-record their look when it changes |
| 11. Removal | The sandbox worker (`app/sandbox-worker.js`, `app/made.js`, `app/api-source.js`), the library bodies (`engine/library-body.js`, `engine/library-bodies.js`, `rigs/body-humanoid.js`, `rigs/humanoid-studio.js`, `app/studio/library-body.js`), every drawing rig in `rigs/` and every helper only assets called are deleted when their last caller is gone (`docs/data-sprites.md` section 5) |

## Routes of the site (after wave 2)

`#/` home (search first, bundles, start from a game type) · `#/browse?...` results with filters · `#/sprite/<id>` · `#/sound/<id>` · `#/music/<id>` · `#/bundle/<id>` · `#/bag` · `#/play`. Old links (`#/kit/...`, `#/sprites`) keep working.

## The builder and reviewer loop

1. The orchestrator gives a builder a task with owned files and acceptance checks.
2. The builder writes tests first, builds, runs its own tests, and reports: files changed, tests added and their result, what is not done, what in this document was wrong.
3. A reviewer who did not build it checks the work against the task, this document and the quality bar, runs the tests, and returns PASS or a numbered list of required fixes.
4. Fixes go back to the builder. At most three rounds, then the orchestrator decides.
5. On PASS the orchestrator commits, and updates `docs/progress.md` and the status column in `docs/features.md`.
