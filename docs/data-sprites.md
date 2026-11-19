# Every sprite is data (design "B")

Written 2026-11-19 for Keyang's decision: "we will create thousands assets soon which will take much more effort to migrate in future. can we build B and completely get rid of A from everywhere?" Status: **design, nothing built.** Its contract is the draft Contract 15 in `docs/architecture.md`. Every count and claim about existing code below was measured or read on 2026-11-19 in the file named.

Settled by Keyang (binding):

| # | Decision |
|---|---|
| 1 | Every sprite (229 files today, every kind) becomes pure data. No asset file holds drawing code; the framework keeps only generic renderers |
| 2 | Variety that code computes today (hair from sliders, tile joins, derived colours, scatter, trims, scenery layout) is expressed by **naming framework generators** from a fixed, documented list, with parameters. Never formulas, expressions or code in an asset |
| 3 | Redraws are allowed (not pixel for pixel), made with the `/sprite-forge` skill, which is updated first. The quality bar applies to library assets |
| 4 | "A" goes everywhere: sprite files with `render()`, drawing code rigs, the studio's library-body path, the sandbox worker for made sources, the two library-body sprites |
| 5 | Kept and built on: `loadout-rig` / `loadout-sprite` (`catalog/studio-schema.js`), `rigs/bones.js`, `rigs/keypose.js`, `engine/data-sprite.js`, `rigs/studio-templates.js`, the studio page, `catalog/data-file.js`, `window.loadout.studio` |

## 1. Survey: what the 229 sprites rely on today

Method: `meta.type` and the `engine/` and `rigs/` modules each file imports (excluding the basics every file uses: `sprite`, `motion`, `color`, `palettes`, `surface`, `shapes`). Totals: 229 files, 29,560 lines; `rigs/` 22 files, 13,066 lines; `engine/` 116 files, 27,876 lines.

| Fact | Count |
|---|---|
| Sprite files that are data today | 2 (`rogue-battler`, `road-bandit`: library bodies, to be removed) |
| Sprite files importing a rig | 25 |
| Sprite files reading pixels back or pasting own layers (`new Surface`, `blit`, `get`, `bounds`, `.data`) | 80 |
| Call sites of `dot` / `rect` / `line` vs shape calls (`ellipse`, `capsule`, `limb`, `poly`, `arc`, `blob`, `fill`, `outline`) | sprites 870 vs 509 (63%); rigs 396 vs 353 (53%); engine 539 vs 454 (54%). Keyang's runtime count (calls made): 83% of sprite drawing and 60% of rig drawing are single pixels or pixel rectangles |
| Render time today, warm, default settings (Node) | knight 0.14 ms/frame, hero-walker 0.18, wolf 1.8, icons-food 1.2, tiles-forest 0.52, ui-buttons-wood 0.59, bg-forest 5.1 (320x180) |
| Bone renderer today (studio templates, 3 to 23 shapes) | 0.04 to 0.23 ms/frame |

### 1.1 By kind

| Kind (`meta.type`) | Files | Lines | Views | Code they rely on (files importing) | Data + generators that replace it |
|---|---|---|---|---|---|
| character | 15 | 2,010 + 645 | top-down 10, side 5 | `rigs/topdown` 9 (+ `topdown-riot`, `topdown-sneak`), `rigs/humanoid` 3 (knight, wizard, spear-goblin), `rigs/kiosk` 1 (vendor-bot), library body 2 | Bone rig v2 that `extends` a **base piece** baked once from each code rig (`base:person-side`, `base:person-topdown`, `base:kiosk`); hair, headgear, held things, capes as **part pieces** with variants; eyes, trims, buckles as **stamps**; poses as keys inherited from the base |
| creature | 17 | 3,172 | side 10, top-down 7 | rigs: humanoid 2, hive-bug 2, creature-topdown 2, quadruped, crawler, bigbody, brood-queen, guard-bot, mech-walker (1 each); `engine/creature` 7; no rig: bat, slime, wolf, crow-scout, spore-hopper | Same: one base piece per rig family (10 bases); creatures with no rig are a bone rig of their own (templates exist: Four legs, Flyer, Blob); `creature.*` helpers become generators (`fur.tufts`, `wing.flap`) or stamps |
| tileset | 13 | 3,064 | top-down 8, side 5 | `engine/tiles` 13 (pieces, picker, `drawTile` from a **material object whose paints and insets are functions**), `rock`, `plating`, `paving`, `dungeon`, `hive`, `ooze`, `water`, `ripples`, `fences`, `ground`, `solids`, `bulkhead` | `tiles` layout: groups with piece sets (the clip names stay the picker's), a **material as data** (edge profiles as number lists, paint as depth-band rules, fill versions as stamp/scatter lists); join logic stays in the framework (`tile.block`, `tile.clips`, `engine/tile-rules.js` unchanged) |
| background | 5 | 832 | side 4, none 1 | `engine/backdrop` 5 (`ridge`, `fillBands`, `cloud`, `stars`, `scatter`, `litEdge`, `mistBand`, `skyLook`), `scenery` 2, `space`, `shafts` | `layers` layout: per layer an ordered list of generators (`sky.bands`, `ridge`, `fill.below`, `scatter` of `cloud`/`tree`, `mist.band`, `stars`), every number a literal or a binding to a control; time of day as the colour rule `sky.look` |
| ui | 60 | 6,948 | none 60 | skins family 32 (bars 9, buttons 8, controls 7, panels 8: `ui-skins`, `ui-skins-more*`, `ui-candy*`, `ui-crystal*`, `ui-gilded*`, `ui-grove-vine`, `ui-neon-tube`, `ui-paper`, `ui-wood`); input pictures 7 (`inputs*`, `pad-buttons`, `input-rocker`, `mouse-light`); fonts 4 (`pixel-font`); 17 others (HUD, dialogue, bubbles, digits, emotes, timer, cards: `ui`, `bubbles`, `counters*`, `emotes`, `glyphs`, `text-fx`) | `panel` layout: a **skin piece** (data) + named generators `ui.frame`, `ui.bar`, `ui.button`, `ui.check` ...; states as overlays (lift, lip, desaturate); `slice` and `textArea` as data; fonts as **font pieces** drawn by the `text` primitive |
| effect | 44 | 4,110 | none 20, side 19, top-down 5 | `engine/fx` 37 (`particles`, `sparkles`, `ring`, `shards`, `smoke`, `rays`, `streaks`, `flame`, `puffs`, `beam`, `leaves`), `spells` 11, `bursts` 10, `weather` 5, `fx-floor` 5, `blast` 4, `fumes` 3, `shots` 3 | `emitters` layout: each emitter names a behaviour generator with typed args (count, seed, arc, distance, life, size, paints); keys may change args over the clip; static shapes and stamps beside them |
| projectile | 9 | 879 | top-down 6, side 3 | `engine/fx` 9, `shots` 6, `plating` 2 | `pictures` layout (the body) + emitters (trail); `shot.missile`, `shot.drop` shape generators |
| prop | 31 | 4,618 | top-down 18, side 13 | `fx` 19, `solids` 8, `marks` 5, `buildings` 5, `rock` 4, `breaking` 4, `mech` 4, `plating` 3, `bulkhead` 3, `foliage` 2, others 1 each | `pictures` layout: a node tree of shapes and stamps per state clip; shape generators (`roof.pitched`, `timber.wall`, `crown.lobes`, `solid.extrude`, `rock.lump`); `break.debris` emitter for breaking clips |
| pickup | 22 | 1,971 | front 22 | `pickups` 21 (`pickupClips`, `pickupPose` bob, `glint`, `gleam`, `collectBurst`, `drawGem`, `drawBottle`), `fx` 5, `gadgets` 5, `prizes` 4, `food` 3 | `pictures` layout + motion generators `pickup.bob`, `pickup.collect` and shine generators `glint`, `gleam`; gem and bottle cuts as shape generators |
| icon | 13 | 1,311 | none 11, front 2 | `icons` 11 (`iconFit` draws on its own layer and fits by reading pixels back; `iconTidy`), `icons-more` 6, `icons-craft`, `icons-swatch`, `faces` 2 (portraits) | `pictures` layout, one picture per clip; `icon.fit` works from **shape geometry** (bounds computed from the data, no read-back); portraits as a face base piece with mood and talk stamps |

### 1.2 What the survey decides

1. **One renderer, five layouts.** Characters and creatures are bone rigs. Everything else is one of four layouts (`tiles`, `layers`, `panel`, `emitters`) or the plain `pictures` layout (props, pickups, icons, projectiles). A layout is itself a named generator; every layout ends in the same primitive draw list (section 4).
2. **Shared data is a first-class thing.** About a third of today's framework is drawing tables that many assets share: the person's hair styles and held things, UI skins, tile materials, fonts, icon pens. These become **pieces**: data files in a new framework folder `pieces/`, named by id and version, used by assets with `use`. A piece is reviewed like framework code, travels nowhere (it is part of the site), and changing a piece's look is a new version.
3. **Pixel detail needs four new primitives**: `stamp` (a small block of pixels bound to a node, moved never turned, with variants), `dither`, `bands` (a gradient as stepped bands), `text` (glyphs of a font piece). Plus `rect`, `line`, `arc`, `ring` (already surface calls), and the operations `outline`, `tint`, `cut`.
4. **The maths moves to generators.** Every function-valued field today (tile paints `(d, u, t, here) => ...`, insets `(u) => DIPS[u] * bumps`, `fps: (p) => ...`, `textArea(clip, p)`, `sockets(clip, t, p)`) becomes either a table (profiles, band rules, piecewise-linear bindings) or arguments of a named generator that does the maths.

## 2. The data format, version 2

`loadout-sprite` version 2 and `loadout-rig` version 2 extend version 1 (`docs/studio.md` section 2) additively: every valid v1 definition is a valid v2 definition and draws the same (test). JSON only, no functions, numbers finite. Ids `^[a-z][a-z0-9-]{0,39}$`. Angles in degrees, rig convention (0 down, 90 picture-right, 180 up).

### 2.1 Top level (every kind)

| Field | Meaning | v1? |
|---|---|---|
| `format`, `version` | `"loadout-sprite"`, `2` | v1 has 1 |
| `id`, `name`, `blurb`, `meta` | As every sprite (Contract 1) | yes |
| `size`, `pivot`, `grounded`, `preview` | Frame, anchor, stands on the ground, card clip | yes |
| `styles`, `stylesWhy` | Contract 12. Default `["pixel"]`; a data sprite has no read-backs, so any style that implements every primitive it uses may be listed | new |
| `palette` | Colour slots: `[{ id, label, default, material, swatches?, detail?, derive? }]` ≤ 12. `swatches` is a list of hex or `{ palette, family, lead }` (`engine/palettes.js swatches`). `derive`: a colour rule (2.6) making this slot from others; a derived slot has no control | v1 `colours` (≤ 8), kept as an alias |
| `controls` | ≤ 48 controls (2.5) | extended |
| `parts` | Contract 3 parts (2.6) | extended |
| `versions` | ≤ 24 `{ name, params }` (Contract 1) | yes |
| `body` | Exactly one of `rig` (2.2), `tiles` (2.3), `layers` (2.4), `panel` (2.5b), `emitters` (2.5c), `pictures` (2.5d) | v1: `rig`, `library` (library goes) |
| `clips` | `{ name: clip }`: `label`, `frames`, `fps`, `loop`, `keys`, `frameEdits`, `sounds` (each cue may carry `when`), `from` (a base's clip it inherits). A layout may write the clips for you (`tiles`, `layers`, `panel` state lists) | extended |
| `points` | Attach points (Contract 3 sockets) on nodes: `{ id, on, at, angle? }` | v1 rig `points` |
| `slice`, `textArea` | Contract 8, as data per clip (`{ left, top, right, bottom }`, `{ x, y, w, h, colour }`); a layout may compute them (a `panel` does) | new |
| `materials` | `{ rest }`: Contract 7 material for colours no slot paints | new |
| `made` | `{ in: "library" \| "studio", from, by? }` | yes |

### 2.2 Bone-rig sprites (characters, creatures)

`body.rig` is `loadout-rig` v2: v1 (bones, shapes, ik, points, colours, directions) plus:

| Field | Meaning |
|---|---|
| `extends` | `{ use: "base:person-side", v: 1 }`: start from a base piece (a whole rig with its clips). The asset's own bones, shapes, stamps and clips are added or replace by id; `drop: [ids]` removes base shapes |
| `nodes` | Bones with `length: 0` allowed: pivots for things that move but do not bend (a lid, a floating eye) |
| shapes on a bone | v1 kinds plus every primitive of 2.7, each with `on` (bone) or v1 `bone` |
| `use` on a bone | `{ kind: "use", use: "part:hair-bob", v: 1, on: "head", args: { length: {...binding} }, paint: { hair: "hair" } }`: a part piece placed on a bone; its own slots are mapped to the asset's |
| `directions` | Top-down overlays as v1, now also for stamps (`stamps: { id: { at, rows-variant, hidden } }`): a face stamp facing down, a back-of-head stamp facing up |

Worked example (a side-view knight; trimmed):

```json
{ "format": "loadout-sprite", "version": 2, "id": "knight", "name": "Hero", "size": [64, 64], "pivot": [28, 58],
  "meta": { "type": "character", "role": "characters/player", "view": "side", "themes": ["fantasy"], "gameTypes": ["platformer"], "words": ["knight", "hero", "sword"], "license": "draft" },
  "palette": [ { "id": "skin", "label": "Skin", "default": "#e0a878", "material": "skin" },
               { "id": "outfit", "label": "Tunic", "default": "#3a6ea5", "material": "cloth" },
               { "id": "trousers", "derive": { "rule": "tone", "of": "outfit", "by": -0.6 }, "material": "cloth" },
               { "id": "metal", "label": "Metal", "default": "#b8c4cc", "material": "metal" },
               { "id": "eye", "default": "#231b33", "detail": true } ],
  "body": { "rig": {
    "extends": { "use": "base:person-side", "v": 1 },
    "shapes": [
      { "id": "eye", "kind": "stamp", "on": "head", "at": [4, 1], "rows": ["a", "a"], "key": { "a": "eye", "b": "skin.dark" }, "z": 30,
        "variants": { "blink": [".", "b"] } },
      { "id": "buckle", "kind": "stamp", "on": "hip", "at": [0, 0], "rows": ["ab", "bb"], "key": { "a": "metal.light", "b": "metal" }, "z": 25 },
      { "id": "hair", "kind": "use", "use": "part:hair", "v": 1, "on": "head",
        "args": { "style": { "from": "hair", "pick": { "short": "crop", "long": "fall" } }, "length": { "from": "hairLength", "map": [[0, 2], [1, 7]], "round": "px" } },
        "paint": { "hair": "hair" }, "when": { "headgear": ["none", "crown"] } },
      { "id": "helmet", "kind": "use", "use": "part:helmet-plumed", "v": 1, "on": "head", "paint": { "metal": "metal", "plume": "outfit" }, "when": { "headgear": ["helmet"] } },
      { "id": "sword", "kind": "use", "use": "held:sword", "v": 1, "on": "handF", "args": { "length": { "from": "swordLength", "map": [[0, 10], [1, 18]] } }, "paint": { "blade": "metal" } } ] } },
  "controls": [
    { "key": "height", "kind": "range", "label": "Height", "lo": "Short", "hi": "Tall", "default": 0.5, "scales": { "bones": ["spine", "thighF", "thighB", "shinF", "shinB"], "by": [0.85, 1.15] } },
    { "key": "headgear", "kind": "choice", "label": "Headgear", "options": ["none", "helmet", "crown"], "default": "helmet", "was": { "plumed helmet": "helmet" } },
    { "key": "hair", "kind": "choice", "label": "Hair", "options": ["short", "long"], "default": "short", "when": { "headgear": ["none", "crown"] } },
    { "key": "hairLength", "kind": "range", "label": "Hair length", "default": 0.4, "when": { "headgear": ["none", "crown"] } },
    { "key": "weapon", "kind": "choice", "label": "Weapon", "options": ["sword", "none"], "default": "sword" },
    { "key": "swordLength", "kind": "range", "label": "Blade", "lo": "Short", "hi": "Long", "default": 0.5 },
    { "key": "speed", "standard": "speed" } ],
  "parts": { "weapon": { "label": "Weapon", "params": ["weapon", "swordLength"], "none": "none", "socket": "hand", "shapes": ["sword"] } },
  "clips": { "idle": { "from": "idle" }, "walk": { "from": "walk", "sounds": [{ "sound": "footstep-grass", "frame": 0 }, { "sound": "footstep-grass", "frame": 4 }] },
             "attack": { "from": "swing", "frameEdits": { "3": { "swap": { "eye": "blink" } } }, "sounds": [{ "sound": "sword-slash", "frame": 3, "when": { "weapon": ["sword"] } }] } } }
```

A top-down character `extends` `base:person-topdown` (one rig, `directions` overlays for down, up, side, clips `<action>_<down|up|side>`), and overlays stamps per direction: `"directions": { "up": { "stamps": { "eye": { "hidden": true } } } }`.

### 2.3 Tilesets

`body.tiles`:

| Field | Meaning |
|---|---|
| `tile` | 16 or 32 |
| `groups` | `[{ name, kind: "block" \| "floor" \| "liquid" \| "platform" \| "slope" \| "stack", use?, pieces: ["block", "narrow", "thin", "slope", "inner"], fills: 1..4, material, decals? }]`. The clip list is written by the `tile.clips` generator exactly as `blockClips`, `thinClips`, `slopeClips`, `decoClips`, `liquidClips` name them today, so `engine/tile-rules.js`, the picker, the checker and the export are unchanged |
| `material` | Data, or `{ use: "material:<id>", v, paint: {...} }`. `fill`: `{ base: paint, versions: [[primitives or a scatter generator], ...] }`. `edges.top/left/right/bottom`: `{ depth, wrap, tuck, inset: { profile: [numbers ≤ tile], amount: binding }, ragged: { profile, amount }, bands: [band rules] }` |
| band rule | `{ rows: [from, to] \| "last" \| "last-1", where?: { profile: "<name>", in: [values] }, paint }`, first match wins. Replaces `paint: (d, u, t, here) => ...`: rows count from the edge (1 = the edge row), `last` is the shadow row the edge casts |
| `profiles` | Named number lists (`DIPS`, `HANG`, `UNDER` today) referred to by name |
| `decals` | `{ name, place: "above" \| "on", label, draw: [primitives], outline: true \| false }` |
| `extra` | Tiles the naming scheme does not cover (`stairs-down`): `{ name, label, draw }` |

Example (`tiles-forest`, the grass cap only):

```json
"body": { "tiles": { "tile": 32,
  "profiles": { "dips": [0,0,0,0.3,0.67,1,1,0.67,0.3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.3,0.67,1,1,0.67,0.3,0,0,0],
                "hang": [1,2,1,0,0,1,2,3,2,0,0,1,1,0,2,3,1,0,0,1,2,1,0,0,1,3,2,1,0,0,2,1] },
  "groups": [ { "name": "grass", "kind": "block", "use": "ground", "pieces": ["block", "narrow", "thin", "slope"], "fills": 3,
    "material": {
      "fill": { "base": "soil", "versions": [ [ { "gen": "scatter", "v": 1, "seed": 41, "count": { "from": "texture", "map": [[0, 0], [1, 3]], "round": "px" }, "margin": 4, "gap": 10, "place": { "use": "stamp:clod", "v": 1, "paint": { "a": "soil.dark" } } } ] ] },
      "edges": {
        "top": { "depth": { "from": "edge", "map": [[5, 5], [9, 9]] }, "wrap": 4, "tuck": true,
                 "inset": { "profile": "dips", "amount": { "from": "bumps", "map": [[0, 0], [3, 3]] } },
                 "bands": [ { "rows": "last", "paint": "soil.dark" }, { "rows": [1, 1], "paint": "grass.light" }, { "rows": "last-1", "paint": "grass.dark" },
                            { "rows": [2, 2], "where": { "profile": "hang", "in": [0] }, "paint": "grass.light" },
                            { "rows": [3, 99], "where": { "profile": "hang", "in": [2, 3] }, "paint": "grass.dark" }, { "rows": [1, 99], "paint": "grass" } ] },
        "left": { "depth": 1, "bands": [ { "rows": [1, 1], "paint": "soil.dark" } ] } } },
    "decals": [ { "name": "a", "place": "above", "label": "Grass tuft", "outline": false, "draw": [ { "kind": "stamp", "at": [10, 23], "rows": ["...........b", "....b.b....."], "key": { "b": "grass.light" } } ] } ] } ] } }
```

### 2.4 Backgrounds

`body.layers`: `[{ name: "far" | "mid" | "near" | ..., scroll, wraps: true, draw: [primitives and generators] }]`. Clips are the layers (`layerClips`). Every generator that places things across the width is told the layer wraps, so the seam closes (as `wrapX` does today).

```json
"body": { "layers": [
  { "name": "far", "scroll": 0.1, "draw": [
    { "gen": "sky.bands", "v": 1, "paint": { "rule": "sky.look", "of": "sky", "time": { "from": "time" } }, "bands": 6 },
    { "gen": "scatter", "v": 1, "seed": 12, "stable": true, "count": { "from": "clouds", "map": [[0, 2], [1, 8]], "round": "px" },
      "place": { "gen": "cloud", "v": 1, "paint": "cloud" }, "rows": [14, 59] },
    { "gen": "ridge", "v": 1, "base": 156, "height": { "from": "height", "map": [[0, 44], [1, 84]] }, "seed": 3, "peaks": 4, "shape": "jagged", "rough": 0.55, "paint": "rock", "litEdge": { "depth": 0.75, "paint": "rock.light" } },
    { "gen": "mist.band", "v": 1, "at": 156, "height": { "from": "haze", "map": [[0, 0], [1, 14]] }, "paint": "air" } ] },
  { "name": "mid", "scroll": 0.4, "draw": [ { "gen": "ridge", "v": 1, "id": "hill", "base": 150, "seed": 7, "peaks": 3, "paint": "back" },
    { "gen": "treeline", "v": 1, "on": "hill", "clumps": { "from": "density", "map": [[0, 4], [1, 11]], "round": "px" }, "tall": 12, "seed": 4, "paint": "leaf" } ] } ] }
```

### 2.5 Controls, and (b) interface pieces, (c) effects and projectiles, (d) props, pickups, icons

**Controls.** `{ key, kind: "range" | "choice" | "toggle" | "colour", label, group?, when?, look?, was? }` plus: range `lo`, `hi` (end words), `min`, `max`, `step`, `default`, optional `scales` (bones or shapes, v1); choice `options`, `default`, `was`; colour: `key` is a palette slot; `{ key: "speed", standard: "speed" }`. **A control does nothing by itself**: it has effect only where a binding (2.6), a `when`, a variant or a `scales` names it. The validator errors on a control nothing names.

**(b) Interface pieces**, `body.panel`:

| Field | Meaning |
|---|---|
| `skin` | `{ use: "skin:wood", v: 1, paint: { face: "face", frame: "frame" } }` |
| `piece` | One of the skin generators: `ui.button`, `ui.panel`, `ui.bar`, `ui.tab`, `ui.tooltip`, `ui.slider`, `ui.knob`, `ui.check`, `ui.radio`, `ui.switch`, `ui.pointer`, `ui.selector`, with its args (`corner`, `border`, `texture`, `nails`: bindings) |
| `states` | `["normal", "hover", "pressed", "disabled"]`: the clips; each state's change is the skin's (lift, lip, desaturate) unless overridden: `{ pressed: { lip: 2 } }` |
| `draw` | Extra primitives (an emblem, a text) on top |
| `slice`, `textArea` | Computed by the piece generator and written to the sheet (Contract 8); a data override may replace them |

```json
"body": { "panel": { "skin": { "use": "skin:wood", "v": 1, "paint": { "face": "face", "frame": "frame" } },
  "piece": { "gen": "ui.button", "v": 1, "size": [96, 32], "style": { "from": "style" }, "corner": { "from": "corner", "map": [[0, 1], [1, 4]] },
             "border": { "from": "border", "map": [[0, 1], [1, 3]] }, "nails": { "from": "nails" }, "grain": { "from": "texture", "map": [[0, 0], [1, 1]] } },
  "states": ["normal", "hover", "pressed", "disabled"] } },
"clips": { "pressed": { "sounds": [{ "sound": "ui-click", "preset": "Soft tap", "frame": 0, "volume": 0.6 }] } }
```

**(c) Effects and projectiles**, `body.emitters` (and optional `draw`, a node tree as in d):

| Field | Meaning |
|---|---|
| `id`, `gen`, `v` | A behaviour generator: `particles`, `sparkles`, `ring`, `shards`, `smoke`, `chunks`, `rays`, `streaks`, `flame`, `puffs`, `starburst`, `beam`, `leaves`, `embers`, `spark.ring`, `blast.ball`, `bolt`, `swirl`, `motes`, `fall.field` (weather), `trail.puffs`, `scorch` |
| args | Typed per generator: `at`, `count`, `seed`, `arc`, `dist`, `life`, `size`, `rise`, `spin`, `paints` (hottest first), `loop`, `area` |
| `keys` in clips | `emit: { <id>: { amount: 0..1, at: [x, y] } }`: blended like bone keys, so an emitter can start, swell and stop |
| On or off (decided in B6, 2026-11-19) | An emitter that some clip's keys give an `amount` is off wherever no key gives it an amount above 0 (the coin's `burst`, keyed in `collect`, stays off in `spin`); an emitter no key gives an `amount` always draws (hit-spark's `sparks`, a projectile's trail), its `when` and `clip` deciding as for any item. The amount reaches the generator only as an `amount` argument it declares. Same rule for a `pictures` body's emitters (`engine/data-sprite.js`) and the `emitters` layout (B12) |
| `glow` | Drawn after the outline, not inked (style guide 2) |

```json
"body": { "emitters": [
  { "id": "sparks", "gen": "particles", "v": 1, "at": [16, 16], "count": { "from": "amount", "map": [[0, 4], [1, 12]], "round": "px" }, "seed": 2, "loop": false, "arc": 360,
    "dist": { "from": "size", "map": [[0, 8], [1, 13]] }, "size": 2, "paints": ["spark.light", "spark", "spark.dark"], "glow": true },
  { "id": "flash", "gen": "starburst", "v": 1, "at": [16, 16], "points": 4, "r": [3, 9], "paints": ["spark.light"], "glow": true } ],
"clips": { "hit": { "frames": 5, "fps": 18, "loop": false, "keys": [ { "t": 0, "emit": { "flash": { "amount": 1 } } }, { "t": 0.5, "emit": { "flash": { "amount": 0 } } } ] } }
```

**(d) Props, pickups, icons**, `body.pictures`:

| Field | Meaning |
|---|---|
| `nodes` | A small tree `[{ id, parent, at: [x, y], turn?, scale? }]`: keys move (`nodes: { lid: { turn: -40 } }`) |
| `draw` | Primitives with `on` (a node) |
| `per` | Per clip, extra or replacing draw lists: a chest's `open` clip shows `coins`, hides `lockShut` (or `when` on a shape with `clip: [...]`) |
| `motion` | Motion generators for the whole picture or one node, each with an optional `clip` list: `pickup.bob`, `pickup.spin`, `pickup.collect`, `prop.sway`, `prop.shake` |
| `emitters` | As in (c), for a collect burst or a breaking clip |
| `fit` | Icons: `{ gen: "icon.fit", v: 1, size: binding, tilt: binding, lean }`: scales and tilts the picture to the icon box from the shapes' own bounds |
| `pictures` | Icon sets: `{ apple: { label, draw, angle? }, ... }`, one clip each (`iconClips`) |

```json
"body": { "pictures": {
  "nodes": [ { "id": "coin", "parent": null, "at": [16, 15] } ],
  "draw": [ { "kind": "ellipse", "on": "coin", "at": [0, 0], "r": [{ "from": "size", "map": [[0, 5], [1, 8]] }, { "from": "size", "map": [[0, 5], [1, 8]] }], "paint": "gold", "shade": 1, "light": 1 },
            { "kind": "stamp", "on": "coin", "at": [-1, -2], "rows": ["ab", "b."], "key": { "a": "gold.light", "b": "gold.dark" } },
            { "kind": "outline", "paint": "ink" },
            { "gen": "glint", "v": 1, "on": "coin", "every": 8, "paint": "light", "when": { "shine": [true] } } ],
  "motion": [ { "gen": "pickup.bob", "v": 1, "height": { "from": "bob", "map": [[0, 0], [1, 2]] } },
              { "gen": "pickup.spin", "v": 1, "node": "coin", "clip": ["spin"] } ],
  "emitters": [ { "id": "burst", "gen": "spark.ring", "v": 1, "at": [16, 15], "paints": ["gold.light", "gold"], "glow": true } ] } },
"clips": { "spin": { "frames": 8, "fps": 10 }, "collect": { "frames": 6, "fps": 12, "loop": false, "keys": [ { "t": 0, "emit": { "burst": { "amount": 1 } } } ] } }
```

### 2.6 Bindings, colour rules, `when`, variants, parts

| Thing | Form | Notes |
|---|---|---|
| Binding (number) | `{ "from": "<control>", "map": [[in, out], ...], "round": "px" \| "half" \| "none" }` | Piecewise linear, ≥ 2 points, `in` ascending. A table, not a formula. One control per binding: where two controls meet, the generator takes both as separate args and does the maths |
| Binding (choice, toggle) | `{ "from": "<control>", "pick": { "<option>": value } }` | `"true"` / `"false"` keys for a toggle |
| Paint ref | `"slot"`, `"slot.light"` / `.base` / `.dark` / `.deep` / `.far`, `"ink"`, `"clear"`, or a colour rule | Never a hex outside `palette` |
| Colour rule | `{ "rule": "<name>", ...args }` from `COLOUR_RULES` (`engine/data-rules.js`: `tone`, `mix`, `standOut`, `apart`, `bandTone`, `ramp`, `choose`) plus the new ones in 3.3 | Nested ≤ 6, as today |
| `when` | Contract 3's, on any control, shape, stamp, `use`, emitter, layer item, sound cue, part; plus `clip: [names]` and `direction: [...]` | Loops rejected |
| Variants | A stamp's `variants`, a piece's named styles (`args.style`), a shape list per choice (`when`) | Selected by binding, key `swap` (stepped) or frame edit `swap` |
| Parts | Contract 3: `{ label, params: [selector, ...], none, socket, shapes: [ids] }`. A part's shapes disappear when it is off; the validator checks the shapes exist and the selector names them | Same as library parts today, for every kind |

### 2.7 Primitives (shape kinds)

The v1 kinds `limb`, `capsule`, `ellipse`, `poly`, `dot` stay. New kinds, all in a node's own frame (`on`), all with `paint`, `z`, `group`, `when`, `hidden`, `glow`, `part`:

| Kind | Fields | Pixel style draws it as | Turns with its node? |
|---|---|---|---|
| `rect` | `at`, `size` | `g.rect` | No (moved): a rect on a turning bone is a `poly` |
| `line`, `arc`, `ring` | `from`, `to` / `at`, `r`, `a0`, `a1`, `thick` | `g.line`, `g.arc`, ring as arc | Yes |
| `stamp` | `at`, `anchor` (`tl`, `c`, `bc`...), `rows` (strings ≤ 32 × 32), `key` (char → paint), `variants`, `mirror` (`x` in a mirrored direction) | Pixels placed at the node's rounded point | **Never** turned; only moved, swapped or mirrored |
| `dither` | `area` (a shape), `pattern` (`checker`, `bayer2`, `bayer4`, `lines-h`, `lines-v`), `amount` (binding), `paint` | Pattern test inside the shape | Pattern stays screen-aligned |
| `bands` | `area`, `dir` (`down`, `up`, `in`, `out`), `stops` (paints), `edges` (`hard`, `dither`) | Stepped bands, the gradient of pixel art | Area turns, bands screen-aligned |
| `text` | `font` (`font:chunky@1`), `text` (≤ 40 characters from the font), `at`, `align`, `paint`, `outline` | Glyphs of the font piece | No |
| `use` | A piece and its args and paint map | Its primitives | As its node |
| `gen` | A generator and its args | Its primitives | Per generator |
| `outline` (op) | `paint`, `only` (a group), `sides` (`outer`, `all`) | `g.outline` on what is drawn so far | — |
| `tint` (op) | `paint`, `when` | `g.tint` | — |
| `cut` | `shape`, `from` (a group) | `blob minus`, or `clip` | — |

**Caps** (Contract 14 rule 6, extended): definition JSON ≤ 128 KB; primitives ≤ 400 written, ≤ 4,000 after expansion per frame; stamp pixels ≤ 8,192 in all; generator calls ≤ 64; nodes ≤ 64; pieces used ≤ 24; frames ≤ 256; frame ≤ 640 × 360.

### 2.8 Looks, styles, versions, sounds

| Topic | How v2 does it |
|---|---|
| Looks (Contract 7) | Every paint is a slot ref and every slot declares its `material`, so the material table is **read from the data**, not found by drawing once per colour control (`spriteMaterials` today). Derived slots take their source's material unless they say otherwise. Colours a generator makes (sky bands) carry the material of the slot they came from |
| Styles (Contract 12) | The primitive draw list is the seam. A second renderer takes the same list: shapes become its shapes, `outline` its stroke, `bands` a smooth gradient, `dither` a flat tint, and `stamp` its `alt` when given (`alt: { flat: [shapes] }`: a drawn eye for a one-pixel eye) or nothing when marked `detail`. A style lists the primitives it supports; a sprite may list a style when every primitive it uses after expansion is supported. No read-backs exist in data, so "pixel-only because of read-backs" disappears |
| Versions | `versions` as Contract 1; also the definition's own `rev` (a short hash written by the build) so a bag can tell its item was drawn from an older revision (section 7) |
| Sounds | In each clip, as v1; `when` as Contract 3 |
| Generator and piece versions | Named with `v`; a definition always names the version it was made with (section 3) |

## 3. The named-generator registry

### 3.1 What it is

| Property | Rule |
|---|---|
| Where | `engine/gen/registry.js` (`defineGenerator`, `generator(id, v)`, `generators()`), one module per family in `engine/gen/<family>.js`, all imported by `engine/gen/index.js` (one line each, as `engine/library-bodies.js` does today) |
| Entry | `{ id, v, family, about (one sentence), args: { name: type }, cost(args) → number, run(args, ctx) → primitives, keyable: [arg names], wraps?: bool }` |
| Argument types | `px(lo, hi)`, `share` (0..1), `count(lo, hi)`, `angle`, `seed` (0..9999), `word([...])`, `flag`, `paint`, `paints(n)`, `profile`, `point`, `shape` (a primitive), `place` (a piece, a stamp or another generator), `primitives`. Every number arg also takes a binding |
| Pure and deterministic | `run` sees only its args and `ctx` (`{ t, frame, frames, loop, size, clip, direction }`); no clock, no randomness except from `seed` through `engine/motion.js hash`. **It never touches a surface: it returns primitives** |
| Versioned | `id@v`. Once released, a version's output never changes (pinned by a golden test). A change of output is a new version; the old one stays until no asset names it (a test lists versions nothing uses) |
| Documented | The build writes `generated/generators.json` (id, v, family, about, args with types and ranges, keyable) and a table in `generated/api.md`; `window.loadout.framework.gen.list()` |
| Tested | Per version: determinism, golden primitives at three arg sets, arg fuzz (every type at its limits and outside them), cost cap, loop closure when `ctx.loop` |

### 3.2 How an asset names one, and how one is added

- Named with `{ "gen": "<id>", "v": <n>, ...args }` wherever a primitive may stand, or as a colour rule `{ "rule": "<id>" }`, or as `place` inside another generator. An unknown id or version, an unknown arg or a value outside its type is refused by the validator before anything draws.
- Added only as a framework change (Contract 11): through the skill (section 8), test first, in `engine/gen/<family>.js`, one line in the family's list, its doc comment, its golden test, `api-descriptions` passing. Reviewed like any framework code. An asset never brings one.

### 3.3 The first list (covers today's library; from section 1)

| Family | Generators (each `@1`) | Replaces (today's module) |
|---|---|---|
| colour (rules) | `tone`, `mix`, `standOut`, `apart`, `bandTone`, `ramp`, `choose` (exist); `sky.look`, `texture.tone`, `lit.tone`, `haze`, `shade.of` | `data-rules.js`, `backdrop.skyLook/litTone/hazed`, `tiles.textureTone` |
| layout | `rig` (bones), `tiles`, `layers`, `panel`, `emitters`, `pictures` (each registered with family `layout` and the body kind as id; `run(input, ctx)` returns `{ list, palette, frames, offset, points, slice, textArea }`: the contract is in `engine/data-sprite.js`, LAYOUTS) | the six `body` kinds |
| tile | `tile.clips`, `tile.block`, `tile.thin`, `tile.slope`, `tile.liquid`, `tile.decal`, `tile.courses`, `tile.pattern`, `edge.wave` (a profile), `paving.herringbone`, `paving.stones`, `fence`, `shore`, `plating.seams`, `plating.spots`, `bolt`, `grate` | `tiles`, `paving`, `fences`, `water`, `plating`, `dungeon`, `hive`, `ground` |
| place | `scatter` (seeded, `stable`, margin, gap, rows), `row` (evenly along a line), `grid` | `tiles.scatter`, `backdrop.scatter` |
| backdrop | `sky.bands`, `ridge`, `fill.below`, `fill.between`, `lit.edge`, `treeline`, `battlements`, `canopy`, `mist.band`, `cloud`, `stars`, `disc`, `round.tree`, `far.house`, `pillar`, `light.shaft`, `planet` | `backdrop`, `scenery`, `space`, `shafts` |
| ui | `ui.frame`, `ui.button`, `ui.panel`, `ui.bar` (housing, fill, opening), `ui.tab`, `ui.tooltip`, `ui.slider`, `ui.knob`, `ui.check`, `ui.radio`, `ui.switch`, `ui.pointer`, `ui.selector`, `ui.tech`, `scan.lines`, `bubble`, `counter`, `key.cap`, `pad.button`, `stick`, `mouse` | `ui`, `ui-skins*`, `ui-candy*`, `ui-crystal*`, `ui-gilded*`, `ui-grove-vine`, `ui-neon-tube`, `ui-paper`, `ui-wood`, `bubbles`, `counters*`, `inputs*`, `pad-buttons`, `input-rocker`, `mouse-light` |
| fx (behaviours) | `particles`, `sparkles`, `twinkle`, `glow`, `ring`, `shards`, `smoke`, `chunks`, `rays`, `streaks`, `flame`, `puffs`, `starburst`, `beam`, `leaves`, `scorch`, `embers`, `spark.ring`, `blast.ball`, `puff.ring`, `bolt`, `swirl`, `motes`, `fall.field`, `trail.puffs`, `mist`, `ripples` | `fx`, `bursts`, `blast`, `spells`, `shots`, `weather`, `fx-floor`, `fx-trails`, `fumes`, `mist`, `ripples` |
| motion | `pickup.bob`, `pickup.spin`, `pickup.collect`, `prop.sway`, `prop.shake`, `break.debris`, `door.swing`, `flicker` | `pickups.pickupPose/collectBurst`, `breaking`, `buildings.doorSwing/candleFlicker` |
| shape | `star`, `ngon`, `squircle`, `round.rect`, `gem.cut`, `bottle`, `crescent`, `drop`, `missile`, `crystal`, `snowflake`, `crown.lobes`, `trunk`, `roof`, `timber.wall`, `plank.door`, `pane.window`, `awning`, `solid.extrude`, `wall.wear`, `rock.lump` | `shapes`, `pickups`, `spells`, `shots`, `foliage`, `buildings`, `stalls`, `solids`, `rock`, `crystals` |
| shine | `glint`, `gleam`, `heartbeat`, `icon.glint` | `pickups`, `icons` |
| icon | `icon.fit` (from geometry), `icon.plate`, `icon.rise`, `icon.slant` | `icons*` |
| text | `text` primitive + font pieces; `glyph`, `status.mark` | `pixel-font`, `glyphs`, `text-fx`, `counter-*` |
| body (on bones) | `fur.tufts`, `wing.flap`, `cloth.sway` (cape, scarf: a chain of nodes driven by the root's motion), `hair.strands` | `creature`, `rigs/*` cape and hair drawing |

About 150 generators; each is a port of one existing function that **returns primitives instead of drawing**. Pieces (data, `pieces/`): bases (`base:person-side`, `base:person-topdown`, `base:kiosk`, one per creature rig family: 13), parts (hair styles, headgear, held things, capes, packs, belts: about 60 from `humanoid.js`, `humanoid-figure.js`, `topdown.js`), UI skins (about 12), tile materials (shared ones only), fonts (4), stamps (eyes, clods, nails, rivets: about 40).

### 3.4 Safety rules

1. A definition is data: no function, getter, expression or code text anywhere. Generators and pieces are named, never brought; a name is looked up in the registry and an unknown one is refused.
2. Every argument is checked against its type and range before anything draws; every count is capped; each generator's `cost` is summed per frame and a definition over the budget is refused (so nothing can hang the page, and no worker or time limit is needed).
3. Plain-data wall as today (`plainStudioData`): JSON text ≤ 128 KB, prototype keys dropped, unknown fields dropped, nesting ≤ 20.
4. So a definition may travel in a link, a bag and a file, and be drawn on the page, with no sandbox. Text is shown as text only. A link still asks first.

## 4. Rendering

### 4.1 One pipeline for every kind

| Step | Module | In → out |
|---|---|---|
| 1 Validate | `catalog/sprite-schema.js` (new; v1 and v2) | JSON → cleaned definition, errors, warnings, cost |
| 2 Resolve settings | `engine/resolve.js` (new) | definition + settings → controls in effect (`when`), bindings to numbers, colour rules to colours (ramps per slot), parts and variants applied, `extends` and `use` merged |
| 3 Pose | `rigs/keypose.js` (exists) | clip + frame → pose (bones, root, ik, stretch, nodes, emit, show, hide, swap) |
| 4 Lay out | the body's layout generator | resolved definition + pose → node transforms (`rigs/bones.js solveRig` for rigs; cells, layers, states for the others) |
| 5 Expand | `engine/gen/*` | generators and pieces → primitives in frame coordinates, sorted by z |
| 6 Draw | the style's renderer: `engine/draw-list.js` (new) for pixel | primitives → `Surface` (shapes as shape tests at pixel centres, groups as one `blob`, stamps at rounded points, outline once, glow after) |
| 7 Finish and look | `engine/styles.js`, `engine/theme.js` (exist) | as today, with the material table from step 2 |

`engine/data-sprite.js dataSprite(json)` wires 1 to 6 into an ordinary `defineSprite` result, so every page, the bag, playground, export, looks and quality bar take it as today (Contract 14 rule 4, unchanged). `sockets`, `slice` and `textArea` come from step 4.

### 4.2 Performance targets and caching

| Where | Target | Today |
|---|---|---|
| One frame, 64x64 character (≤ 160 shapes, ≤ 40 stamps) | median ≤ 0.5 ms, worst ≤ 3 ms | code knight 0.14 ms; bone templates ≤ 0.23 ms |
| One tile 32x32; one icon | ≤ 1 ms | 0.52 ms; icons-food 1.2 ms |
| One background layer 320x180 | ≤ 10 ms | bg-forest 5.1 ms |
| Studio: drag in the editor | visible frame ≤ 8 ms; the clip's strip ≤ 100 ms | — |
| Catalogue thumbnails and strips, 3,000 sprites | cold ≤ 10 min on 8 workers; warm only changed definitions | 199 assets in the build today |
| Quality bar, 3,000 sprites | median ≤ 3 s an asset; cold ≤ 30 min on 8 workers | 1,523 s for 199 (about 7.6 s each) |
| Playground, 8 bag sprites | 60 fps; frames drawn once per settings into a sheet | 60 fps |

| Cache | Key | Effect |
|---|---|---|
| Resolved definition | definition `rev` + settings | Step 2 once per settings |
| Expanded primitives | `rev` + settings + clip + frame (+ direction) | Step 5 once; the studio invalidates only the edited clip |
| Frames | as today (by settings) | |
| Quality bar | definition text hash + `id@v` of every generator and piece it names + renderer version | A framework change re-checks **only** assets naming the changed generator; today any change under `engine/`, `rigs/` re-checks every importer (Contract 12) |
| Generator goldens | `id@v` | A pinned version cannot change silently |

## 5. What is removed, and when

Phases are those of section 9: P0 framework, P1 pilot, P2 bases and pieces, P3 migration, P4 removal.

| "A" path | Files | Removed in | What replaces each caller |
|---|---|---|---|
| Made source in a sandbox | `app/sandbox-worker.js`, `app/made.js`, `app/api-source.js`; made-source branches in `app/api-core.js`, `app/api-worker.js`, `app/bag.js` (`{ source }`), `app/bundle.js` (`<id>.source.js`, `madeOnThisVisit`), `blob:` in the content policy (`index.html`); tests `route2-safety`, `route2-browsers`, `api-source-*` | **P0, after B11** (nothing in the catalogue needs it) | `make.sprite(definition)` takes v2 JSON and registers it like a studio sprite (`app/catalog.js addStudioSprite`); bag `{ data }`; link `{ d }`; download writes `<id>.json`. A stored `{ source }` item opens as "made with an older version of the site; ask for a new link" (section 10, DQ2) |
| Library body | `engine/library-body.js`, `engine/library-bodies.js`, `rigs/body-humanoid.js`, `rigs/humanoid-studio.js`, `app/studio/library-body.js`; library branches in `catalog/studio-schema.js` (`LIBRARY_*`, `FIGURE_*`), `engine/data-sprite.js`, `engine/data-rules.js` (`FIGURE_BLOCKS`, `paintFigure`), `app/studio/draw.js`, `edit.js`, `panes.js`, `more-panes.js`, `stage.js`, `app/api-studio.js` (`bake` from humanoid); `catalog/data-file.js LIBRARY_HEADER` stays (it is the library file header); tests `studio-bodies-*`, `conversion-c1`, `conversion-f1`, `humanoid-studio-*`, `data-sprite-library*` | **P3**, once `rogue-battler` and `road-bandit` are redrawn on `base:person-side` | Studio "Start from the library" opens any library sprite's definition (it is data); `studio.bake` bakes from a base piece's clips |
| Code rigs that draw | `rigs/humanoid.js`, `humanoid-figure.js`, `humanoid-describe.js`, `topdown.js`, `topdown-riot.js`, `topdown-sneak.js`, `topdown-describe.js`, `creature-topdown.js`, `quadruped.js`, `crawler.js`, `bigbody.js`, `hive-bug.js`, `brood-queen.js`, `guard-bot.js`, `mech-walker.js`, `kiosk.js`, `kiosk-describe.js`; `tools/rig.mjs`; tests `rig-describe-*` | **P4**, after every rig sprite is data. Used in P2 only as the reference the bases are baked from (`tools/bake-rig.mjs`, deleted with them) | Base and part pieces; `tools/piece.mjs` (tables and contact sheets of a piece, like `rig.mjs`) |
| Sprite files with `render()` | 227 files in `sprites/` | **P3**, batch by batch | `sprites/<id>.json` data files (section 10, DQ1) |
| Drawing helpers only assets called | about 100 modules in `engine/` (`fx`, `tiles`, `backdrop`, `ui-*`, `icons*`, `pickups`, `buildings`, ...) | **P4**, each when its last caller is gone (a test lists importers) | Their generator ports in `engine/gen/` |
| Read-back tracing in the bar | `quality/sprite.js` `standIn`, `directPixelUse`, `callerOf`, `outsideCalls`; `stylesDeclared` warnings | **P4** | Not needed: data cannot read back |
| Docs | Contract 13 (code rigs), Contract 14 rules 1 to 3 and 8, `docs/studio.md` section 3 and F1/F2, `docs/framework-api.md` "Where a made source runs", "Library bodies", "Rigs", style guide §14 | With the code they describe | Contract 15, this file, the new skill |

What stays framework code at the end: `engine/sprite.js`, `surface.js`, `color.js`, `motion.js`, `palettes.js`, `materials.js`, `theme.js`, `styles.js`, `sheet-info.js`, `versions.js`, `tile-rules.js` (and the picker part of `tiles.js`), `data-sprite.js`, `draw-list.js`, `resolve.js`, `gen/*`; `rigs/bones.js`, `keypose.js`, `studio-templates.js` (as v2 data); `catalog/*`; `quality/*`; `sound/*`. **No sprite drawing code exists outside the generic renderers and the generators.** The build refuses any file in `sprites/` that is not the data form (from P4; from P1 for new ids).

| Caller | After B |
|---|---|
| Catalogue build (`tools/build.mjs`, `tools/lib/assets.mjs`) | Reads each data file, `dataSprite`, writes the row with `rev`; quality cache keyed as 4.2 |
| Quality bar | `checkSprite` on the data sprite, unchanged API; new data checks (unused control, stamp out of frame, slot never painted, cost) |
| Export | Unchanged sheets; every sprite's download also carries `<id>.json`, its definition at the item's settings |
| Playground | Unchanged |
| Bag and links | Catalogue items `{ id, settings }` as today; edited copies `{ data }` |
| `window.loadout` | `make.sprite(definition)`, `check`, `render`, `studio.*` all take data |
| Studio | Opens and edits every kind (section 6) |

## 6. The studio and the sprite page

| Kind | Editor (studio tab "Body" changes with the kind) | Main gestures |
|---|---|---|
| Rig | Bones, shapes and stamps (today's editor + stamp painter) | Drag joints; add shape; paint a stamp pixel by pixel at 12x with the palette's slots; pick a part piece from a list |
| Tileset | Tile grid painter | A 6x4 test map (`tools/tilemap.mjs` layout) where you paint where the group is; the tiles redraw live; edge profiles drawn as a curve along one edge; band rules as a list of rows with colour swatches |
| Background | Layer editor | Layers as a stack (scroll speed, order); each layer a list of generator cards with plain-language args; two copies side by side to judge the seam |
| Interface | 9-slice editor | Skin and piece pick; drag the four slice lines; states as tabs; text area as a box |
| Effect, projectile | Particle editor | Emitter cards (behaviour, count, spread, colours); a timeline of amount keys; onion skin |
| Prop, pickup, icon | Pictures editor | Node tree, shapes and stamps, per-clip show/hide; icon set as a grid of pictures |

Shared by all: palette slots and swatches, controls ("Sliders people get") with their bindings shown as "moves X from a to b", parts, `when`, clips and sounds, versions, Look & name, advice from the bar.

**Advanced mode on a sprite page.** `#/sprite/<id>?edit=advanced`: the same stage and panes as the studio, opened on a **copy** of the library definition (a studio draft with `made.from: "library:<id>"`). The visitor's sliders become the copy's defaults. Save goes to the studio and the bag; the library file itself changes only by a file and review (Contract 15 rule 7).

Order: (1) generalise the studio shell to any `body` and add the stamp painter and node/picture editor (props, pickups, icons, rigs); (2) Advanced mode on the sprite page; (3) particle editor; (4) 9-slice editor; (5) layer editor; (6) tile painter (hardest).

## 7. Migration

| Topic | Plan |
|---|---|
| Who | Agents through the rewritten `/sprite-forge` skill (`loadout-maker`), one batch of 4 to 8 sprites of one kind each; every sprite passes `node tools/check.mjs` and an independent review (`docs/review-protocol.md`) against **side-by-side renders of the old code file and the new data file** at default, all low, all high and every choice |
| Order by kind | Pilot first (1 of each kind: `coin`, `crate`, `hit-spark`, `arrow`, `icons-food`, `ui-buttons-wood`, `bg-forest`, `tiles-forest`, `slime`, `knight`, `hero-walker`); then bases and pieces (P2); then kinds in order props and pickups, icons, effects and projectiles, UI, backgrounds, tilesets, creatures, characters |
| Order by bundle | Within each kind: `kit-platformer-fantasy` (47), `kit-rpg-fantasy` (49), `kit-roguelite-scifi` (48), the starters, then the 92 core sprites in no bundle. After every batch `tests/e2e/three-bundles.spec.mjs` and `whole-bundle.spec.mjs` pass: code and data files coexist until P4 |
| Size | 227 sprites, about 40 batches; at the kits' measured rate this is in the order of the 137-sprite kit build, less where a base or generator already exists |
| Ids | Never change. A redraw keeps its id, file name, `meta`, clips and sound cues |
| Controls | Keep key and kind. A choice whose options change lists `was: { old: new }` (exists, `engine/sprite.js cleanParams`). A renamed control lists a new sprite-level `was: { controls: { oldKey: "newKey" } }` (B4 adds it to `cleanParams`). A removed control's value is dropped (cleanParams already drops unknown keys) and the bag page notes it once. A slider keeps 0..1 meaning "low to high" even when the drawing behind it changes |
| Saved bag items and links | Hold `id` and `settings` only: they open the redraw. Each bag item records the `rev` it was drawn from; a different `rev` re-records `lookParams` (the mechanism of Contract 7 for bags saved before 2026-11-19) and shows "Redrawn since you added it" once |
| Versions (ready-made settings) | Kept by name; their params go through the same `was` maps |

## 8. The skill update (outline of the new `SKILL.md`)

| Section | Content |
|---|---|
| Step 0 | `context.mjs` as today, plus `context.mjs generators` (the registry by family, from `generated/generators.json`) and `context.mjs pieces` |
| What you write | One data file `sprites/<id>.json` (P1 to P3: the wrapper form): format, the kind's `body`, palette, controls, bindings, parts, clips, sounds. **No code.** Copy the nearest data example: `context.mjs examples <type>` lists data files only |
| Per kind | One short recipe per layout (rig on a base; tiles; layers; panel; emitters; pictures), each pointing at its worked example in `docs/data-sprites.md` |
| Pixel detail | How to draw stamps (rows, keys to slots, variants for blink and frames, never turned), when to use a stamp vs a shape (body = shapes, detail = stamps), dithers and bands |
| Check | `node tools/check.mjs <id>`, `node tools/render.mjs <id>` (unchanged), `node tools/piece.mjs <piece>`, `node tools/gen.mjs <gen> --sheet` (a generator's output at its arg ranges) |
| Redraw of an existing sprite | Render the old one first (`render.mjs` before deleting the code file), keep id, clips, sounds and control keys; write `was` maps; side-by-side sheet for the reviewer |
| When something is missing | Add a generator or a piece, never code in the asset: test first in `tests/unit/gen-<family>-*.test.mjs` with golden primitives; `defineGenerator` with typed args, cost and doc; one line in the family list; a new version instead of a change |
| Report | As today, plus generators and pieces added (id@v), `was` maps written, and the side-by-side sheet |

## 9. Build plan

Every item: tests first, owned files only, additive until P4. Sizes: S ≤ 1 day of one builder, M 1 to 3, L 3 to 6.

| Id | Item | Owns | Tests first | Needs | Size |
|---|---|---|---|---|---|
| B1 | v2 schema and validator, all kinds, cost estimate | `catalog/sprite-schema.js`, `tests/fixtures/v2/*.json` | `sprite-schema-*.test.mjs`: every field and cap, hostile JSON, every v1 fixture still valid | — | L |
| B2 | Generator registry and arg types | `engine/gen/registry.js`, `engine/gen/args.js`, `engine/gen/index.js` | `gen-registry-*.test.mjs`: types, versions, unknown refused, cost, goldens harness | — | M |
| B3 | Primitive draw list and pixel renderer | `engine/draw-list.js` | `draw-list-*.test.mjs`: each primitive equals the `Surface` call it stands for; stamps unturned; groups as one blob; outline and glow order | — | M |
| B4 | Resolver: bindings, colour rules, `when`, variants, parts, `extends`/`use`, `was` controls | `engine/resolve.js`, one addition to `engine/sprite.js cleanParams` | `resolve-*.test.mjs` | B1, B2 | M |
| B5 | Rig v2: nodes, stamps and `use` on bones, direction stamp overlays, `extends` | `rigs/bones.js` (additive), `rigs/rig-extend.js` | `bones-v2-*.test.mjs`; every v1 template draws byte for byte | B3, B4 | M |
| B6 | `dataSprite` v2 for every body; materials from slots; `slice`, `textArea`, sockets | `engine/data-sprite.js` | `data-sprite-v2-*.test.mjs`; v1 unchanged | B1 to B5 | M |
| B7 | Pieces: folder, loader, index | `pieces/`, `engine/pieces.js`, `tools/lib/pieces-index.mjs` | `pieces-*.test.mjs`: index lists every file, versions pinned | B1 | S |
| B8 | Pictures layout + first generators (`pickup.bob`, `pickup.spin`, `pickup.collect`, `glint`, `star`, `gem.cut`, `icon.fit`) | `engine/gen/pictures.js`, `engine/gen/shine.js`, `engine/gen/shape.js` | goldens | B2, B3 | M |
| B9 | Build, tools and quality cache for data files | `tools/lib/assets.mjs`, `tools/lib/quality-run.mjs`, `tools/gen.mjs`, `tools/piece.mjs`; data checks in `quality/sprite.js` | `assets-data-*.test.mjs`; `newasset.spec.mjs` with a `.json` file | B6 | M |
| B10 | Skill rewrite | `skills/sprite-forge/SKILL.md`, `context.mjs` | `context.mjs verify` | B8, B9 | M |
| B11 | Route 2 on data; remove the sandbox | `app/api-core.js`, `app/api-actions.js`, `app/api-worker.js`, `app/bag.js`, `app/bundle.js`, `index.html`; delete `app/made.js`, `app/sandbox-worker.js`, `app/api-source.js` | `route2.spec.mjs` rewritten on JSON; old `{ source }` link message | B6 | M |
| B12 | Emitters layout + fx generators | `engine/gen/fx.js` | goldens; `hit-spark` redraw passes | B8 | L |
| B13 | Panel layout + UI skins as pieces | `engine/gen/ui.js`, `pieces/skin-*` | goldens; `ui-buttons-wood` slice and text area equal today's | B8 | L |
| B14 | Layers layout + backdrop generators | `engine/gen/backdrop.js` | goldens; wrap seam test | B8 | M |
| B15 | Tiles layout + tile generators (material as data) | `engine/gen/tiles.js` (uses `engine/tiles.js` picker) | goldens; `tile-rules` replay unchanged; `tiles-forest` redraw passes the join checks | B8 | L |
| B16 | Bases baked from code rigs (13) and part pieces (about 60) | `pieces/base-*`, `pieces/part-*`, `tools/bake-rig.mjs` (temporary) | Each base: every clip baked, ≤ 2% pixels off the code rig at defaults (the Hero preset's test) | B5, B7 | L (parallel: one builder per rig family) |
| B17 | Studio shell for every body + stamp painter + pictures editor | `app/studio/*`, `app/css/studio.css` | `studio-v2.spec.mjs` | B6 | L |
| B18 | Advanced mode on the sprite page | `app/sprite-page.js`, `app/studio/*` reuse | `sprite-advanced.spec.mjs` | B17 | M |
| B19 | Particle, 9-slice, layer, tile editors | `app/studio/<kind>-*.js` | one spec each | B12 to B15, B17 | L each |
| M1 to M40 | Migration batches (section 7) | `sprites/<ids>` | check + review | B10 and the kind's layout | S each |
| R1 to R4 | Removals (section 5) | the files listed there | the suite with the files gone | migration of their last caller | S each |

| Parallel lanes | Items |
|---|---|
| Start together | B1, B2, B3, B7 |
| Then | B4 → B5, B6 → B8, B9 → B10, B11 |
| Then in parallel | B12, B13, B14, B15, B16 (one builder each), B17 |
| Then | Pilot (one per kind), migration batches per kind as its layout lands; B18, B19 |
| Last | R2, R3, R4; switch the build to refuse code sprites |

**First useful slice** (B1 to B4, B6 to B9 for the `pictures` body, B11): `coin`, `crate` and `icons-food` redrawn as data files with stamps and the first generators, passing the bar, found by search, customised, bagged, played, downloaded, shared by link and made through `window.loadout.make.sprite(definition)`; the sandbox worker deleted. It proves the format, stamps, generators, caching keys, route 2 and the skill's shape on the simplest kind before the expensive layouts.

## 10. Risks and open questions for Keyang

| Risk | Mitigation |
|---|---|
| Redraws look worse than the reviewed code art (pixel detail by hand vs by code) | Side-by-side review against the old render is mandatory; pilot per kind before any batch; a person's sample check after the pilot (asset plan decision P5) |
| 150 generators are most of today's helper code ported, so "no code" moves code rather than removing it | Accepted: the gain is that assets are data. Each port returns primitives (styles become possible) and is pinned by goldens |
| Tile materials as band rules may not express every paint function | B15 ports all 13 tilesets' materials in the test suite before migration; a missing case is a new band field, not code in an asset |
| Migration and new assets compete for agents | New assets are data-only from P1; the kits' order keeps them shippable throughout |

| Id | Question | Recommendation |
|---|---|---|
| DQ1 | **Answered 2026-11-19 (Keyang): `.json`.** File form: keep `sprites/<id>.js` as the fixed wrapper (Contract 14 rule 8), or switch to `sprites/<id>.json`? | **`.json`**, switched in B9 for new files and by the migration for the rest: no import, no code-shaped file, fetched not imported. The wrapper stays readable until P4 |
| DQ2 | **Answered 2026-11-19 (Keyang): drop them.** Old bags and links holding a sprite made from source text (`{ source }`, route 2 since 2026-11-18): drop them, or keep the sandbox to open them? | **Drop** (they were made on a visit; nobody outside the build loop has them). Show "made with an older version; ask for a new link" |
| DQ3 | **Answered 2026-11-19 (Keyang): keep keys, accept the redraw.** Saved settings when a redraw changes what a control does: keep keys and accept a different picture, or version every library sprite so old links keep the old drawing? | **Keep keys, accept the redraw**, with `was` maps and a one-time note in the bag. Keeping old drawings means keeping the code |
| DQ4 | **Answered 2026-11-19 (Keyang): `pieces/` folder.** Shared pieces (bases, hair, held things, skins, fonts) as framework-owned data in `pieces/`: yes, or inline everything into each asset? | **Yes.** Inlining makes 3,000 copies of a sword; a fixed sword must reach every sprite (Contract 13's reason) |
| DQ5 | **Not asked; the recommendation (a copy) is taken as the default.** Advanced mode on a sprite page edits a copy (a studio draft) or the library asset itself? | **A copy.** The library changes only through files and review (quality bar, Contract 15 rule 7) |
