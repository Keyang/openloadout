# Every sprite is data (design "B")

Written 2026-11-19 for Keyang's decision: "we will create thousands assets soon which will take much more effort to migrate in future. can we build B and completely get rid of A from everywhere?" Status: **being built** (2026-11-20 05:00, commit `6773968`: the framework for every body kind is committed, effects with 7 of about 27 behaviours and tilesets with 3 of 13 ported (the other 10 are B15b), `.json` sprites in every tool, `make.sprite` on data with the sandbox deleted; 3 of 229 library sprites are data; section 9 has each item's state). Its contract is the draft Contract 15 in `docs/architecture.md`. Every count and claim about existing code below was measured or read on 2026-11-19 in the file named.

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

The example above sketches the format; it is not the real side-view base. `base:person-side` (latest v5; v1 has no ground cut) has no `head` or `hip` node: parts hang on `headwear`, `skull`, `hang`, `plume`, `back`, `lay`, `chest`, `waist`, `handF`, `handB`; the plumed helmet is `part:helmet` with `part:plume`; the base carries its own ground cut, so a sprite writes none. The worked Hero is `tests/fixtures/person-side/knight.json`, and the base's nodes, clips, part pieces, versions and what a sprite must not rely on yet are in `pieces/README.md` ("The side-view person", B16a).

A top-down character `extends` `base:person-topdown` (one rig, `directions` overlays for down, up, side, clips `<action>_<down|up|side>`), and overlays stamps per direction: `"directions": { "up": { "stamps": { "eye": { "hidden": true } } } }`. The base, its walker variant (the same rig with idle, walk and talk, for sprites that never fight, until a sprite can pick its base's clips), its node names, sparse keys and the top-down part pieces are described in `pieces/README.md` ("The top-down person", B16b).

**The rig renderer (`rigs/bones.js`, build item B5).** `extends` never reaches it: the resolver (`engine/resolve.js`, B4) merges the base into the rig by id (and `drop`s), draws `use` pieces in and applies parts, so the renderer takes one plain rig. What it offers:

| Export | What it is for |
|---|---|
| `solveRig(rig, pose, opt)` | Where every bone and node is for one pose: forward kinematics from data angles, two-bone IK. Bone parents, IK hips and chain ids are looked up as the rig's own ids (a parent named `toString` is unknown; a bone or chain whose id is `__proto__`, `constructor` or `prototype` is left out), never thrown on |
| `rigList(rig, J, pose, opt)` | One solved frame as an `engine/draw-list.js` draw list in frame pixels: shapes the pose hides, parts that are off and failing `clip` / `direction` conditions left out; stamps given their variant; generator calls and `use` pieces expanded through `opt.expand` (the resolver's `expandFrame`); each primitive placed on its bone; the flash and the one outline added. Returns `{ list, palette, skipped, errors, sources }`. A bare rig counts as version 2 only when it says so or uses something of version 2 |
| `rigFacing(rig, direction)` | A top-down rig seen from `down`, `up` or `side`: its `directions` overlay applied to bones, nodes, shapes and stamps |
| `drawResolvedRig(g, resolved, pose, ctx)` | One frame of a resolved rig sprite (`resolveSprite`'s result) onto a Surface: the direction (`ctx.direction`, else the clip name's `_down` / `_up` / `_side`, else down) overlay, the sprite's size and attach points, and a version 2 sprite's rig always drawn by version 2 rules (every paint ref, the version 2 caps) even when it uses only version 1 kinds on `bone`. What `engine/data-sprite.js` `render` calls |
| `resolvedRigList(resolved, pose, ctx)` | The same frame as `drawResolvedRig` draws, as `rigList`'s draw list (and `J`). What `engine/data-sprite.js` `dataFrameList` calls, so a frame's list is exactly what `render` paints (held by `data-sprite-v2-seams.test.mjs` for every v2 fixture and template) |
| `resolvedRigPoints(resolved, pose, ctx)` | The frame's attach points as Contract 3 sockets (the rig's, a base's and the sprite's own `points`, which win by id). What `sockets` calls |
| `pose.swap` | `{ stampId: variant \| null }` in a pose: which `variants` row set a stamp draws this frame. Keys step it, a frame edit sets it (the knight's `"3": { "swap": { "eye": "blink" } }`); `null`, or a name the stamp has not got, draws its own `rows`. It wins over a direction overlay's `variant` and the stamp's own |
| `RIG_V2_LIMITS` | The most a version 2 rig is drawn with: `nodes` 64 (bones and nodes together), `shapes` (draw-list's primitive cap, the whole frame list after expansion; the rig's own primitives stop two short so the flash and outline always fit), `poly` points, `calls` 64 generator calls a frame, `radius` 320 px, `colours` 8. Version 1 rigs keep `BONE_LIMITS`. Anything past a cap is reported in `skipped`, never dropped in silence |

### 2.3 Tilesets

`body.tiles`:

| Field | Meaning |
|---|---|
| `tile` | 16 or 32 |
| `groups` | `[{ name, kind: "block" \| "floor" \| "liquid" \| "platform" \| "slope" \| "stack", use?, pieces: ["block", "narrow", "thin", "slope", "inner"], fills: 1..4, material, decals? }]`. The clip list is written by the `tile.clips` generator exactly as `blockClips`, `thinClips`, `slopeClips`, `decoClips`, `liquidClips` name them today, so `engine/tile-rules.js`, the picker, the checker and the export are unchanged |
| `material` | Data, or `{ use: "material:<id>", v, paint: {...} }`. `fill`: `{ base: paint, versions: [[primitives or a scatter generator], ...] }`. `edges.top/left/right/bottom`: `{ depth, wrap, tuck, inset: { profile: [numbers ≤ tile], amount: binding }, ragged: { profile, amount }, bands: [band rules] }` |
| band rule | `{ rows: [from, to] \| "last" \| "last-1" \| { profile }, where?: { profile: "<name>", in: [values] }, paint, when? }`, first match wins. Replaces `paint: (d, u, t, here) => ...`: rows count from the edge (1 = the edge row), `last` is the shadow row the edge casts, `{ profile }` rows 1 to the profile's value at each column (slime hanging from a rim); a `when` (thresholds too: `{ "wear": [{ "atLeast": 0.5 }] }`) drops the rule at other settings, so the rules after it decide. A group that draws no middle tiles (platform, slope, stack, a block of thin or slope pieces only: `engine/gen/tiles-clips.js groupDrawsMiddles`) is refused `fills` above 1 |
| material piece | `pieces/material-<name>.v<v>.json`: a material with its own `profiles`, slots and `args` (a `when` or a binding inside it names its args); checked in every piece store and index (`engine/pieces.js KIND_CHECKS`, B15b), and its summary carries `fills` (its number of fill versions), so a group asking for more fills than its material piece has is refused at validation |
| derived slot | `derive` may name the fixed paint `white` (`catalog/sprite-schema.js DERIVE_PAINTS`, B15b): `{ "rule": "mix", "of": "floor.light", "with": "white", "amount": 0.3 }` is the library's light mark (`engine/tiles.js textureLight`); `white` is no paint elsewhere |
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
| `keys` in clips | `emit: { <id>: { amount: 0..1, at: [x, y], <keyable argument>: <number> } }`: blended like bone keys, so an emitter can start, swell and stop; a key may set only the arguments its generator lists as keyable, and a **size** argument (one the behaviour's cost or stamp bound reads: `engine/gen/index.js` SIZE_KEYS, e.g. glow `r` and `scale`, starburst `width` and `push`) only at or below what the emitter itself sets (B12b): set it at its largest on the emitter and key it down. Turns, cuts, cooling and the like move freely. The amount is held to 0..1 when it draws |
| On or off (decided in B6, 2026-11-19) | An emitter that some clip's keys give an `amount` is off wherever no key gives it an amount above 0 (the coin's `burst`, keyed in `collect`, stays off in `spin`); an emitter no key gives an `amount` always draws (a projectile's trail; the `sparks` of the example below, whose keys give only `flash` an amount), its `when` and `clip` deciding as for any item. The amount reaches the generator only as an `amount` argument it declares. (The `hit-spark` fixture, `tests/fixtures/v2/hit-spark.json`, also keys `sparks`, `amount: 1` at t 0, so there `sparks` is on only where its blended amount is above 0. In both, `count: { "from": "amount" }` reads the sprite's **control** named `amount` (Sparks: Few to Many), not a key's emit amount; B12's redraw names that control `sparks` so the two do not read alike.) Same rule for a `pictures` body's emitters (`engine/data-sprite.js`) and the `emitters` layout (B12) |
| `glow` | Drawn after the outline, not inked (style guide 2) |

```json
"body": { "emitters": [
  { "id": "sparks", "gen": "particles", "v": 1, "at": [16, 16], "count": { "from": "amount", "map": [[0, 4], [1, 12]], "round": "px" }, "seed": 2, "loop": false, "arc": 360,
    "dist": { "from": "size", "map": [[0, 8], [1, 13]] }, "size": 2, "paints": ["spark.light", "spark", "spark.dark"], "glow": true },
  { "id": "flash", "gen": "starburst", "v": 1, "at": [16, 16], "points": 4, "r": [3, 9], "paints": ["spark.light"], "glow": true } ],
"clips": { "hit": { "frames": 5, "fps": 18, "loop": false, "keys": [ { "t": 0, "emit": { "flash": { "amount": 1 } } }, { "t": 0.5, "emit": { "flash": { "amount": 0 } } } ] } }
```

That is the format's example (the B1 fixture `tests/fixtures/v2/hit-spark.json`, whose control is now `sparks`). The worked redraws to copy are in `tests/fixtures/v2/emitters/` (B12, B12b): `hit-spark` (sprites/hit-spark.js as data: a rimmed starburst with a white one inside it per frame, each emitter on for its frame by its `amount`, radii bound to Size, `twist` bound to Twist for any number of rays; the tips one emitter cooling from edge to rim by `cool`; the slash five emitters, exact at the default size and within a pixel elsewhere, since keys cannot follow Size), `blaster-bolt` (a projectile: `shot.bar` with its trail, `beat` keyed for the tail's flicker; its hit a `flat` bar, a ring and keyed sparks) and `plasma-burst` (a burst: one `glow` keyed in `scale` and `cool` for the cooling ball, one `starburst` keyed in `push`, `short`, `width` and `cool` through `[core, mid, edge, rim]` with its rim two steps cooler for the shards).

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
| Colour rule | `{ "rule": "<name>", ...args }` from `COLOUR_RULES` (`engine/data-rules.js`: `tone`, `mix`, `standOut`, `apart`, `bandTone`, `ramp`, `choose`, and since B15b `textureTone { of, against? }` and `textureLight { of, against?, from? }`, engine/tiles.js's texture tones, exact at every colour) plus the new ones in 3.3 | Nested ≤ 6, as today |
| `when` | Contract 3's, on any control, shape, stamp, `use`, emitter, layer item, sound cue, part; plus `clip: [names]` and `direction: [...]`; and (B15b) a threshold on a slider in a list, `{ "wear": [{ "atLeast": 0.35 }] }` (`atLeast`, `above`, `atMost`, `below`), except in a control's or a sound cue's `when` | Loops rejected; a threshold's bounds inside the slider's range and able to hold |
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
| Versioned | `id@v`. Once released, a version's output never changes (pinned by a golden test). A change of output is a new version; the old one stays until no asset names it (a test lists versions nothing uses). A layout counts as released once a library sprite draws with it (a `sprites/<id>.json` whose body has the layout's kind: `tiles`, `layers`, `pictures`...); until then its golden may be rewritten on purpose with `GEN_GOLDEN_REWRITE=<key>[,<key>]` (`tests/unit/gen-motion-layout-contract.test.mjs`, `tests/helpers/golden-rewrite.mjs`; B15b), which says which frames changed and refuses a released layout or an unknown key, writing nothing. So the first tiles migration (an M batch writing `sprites/tiles-*.json`) freezes `tiles@1` |
| Documented | The build writes `generated/generators.json` (id, v, family, about, args with types and ranges, keyable) and a table in `generated/api.md`; `window.loadout.framework.gen.list()` |
| Tested | Per version: determinism, golden primitives at three arg sets, arg fuzz (every type at its limits and outside them), cost cap, loop closure when `ctx.loop` |

### 3.2 How an asset names one, and how one is added

- Named with `{ "gen": "<id>", "v": <n>, ...args }` wherever a primitive may stand, or as a colour rule `{ "rule": "<id>" }`, or as `place` inside another generator. An unknown id or version, an unknown arg or a value outside its type is refused by the validator before anything draws.
- Added only as a framework change (Contract 11): through the skill (section 8), test first, in `engine/gen/<family>.js`, one line in the family's list, its doc comment, its golden test, `api-descriptions` passing. Reviewed like any framework code. An asset never brings one.

### 3.3 The first list (covers today's library; from section 1)

| Family | Generators (each `@1`) | Replaces (today's module) |
|---|---|---|
| colour (rules) | `tone`, `mix`, `standOut`, `apart`, `bandTone`, `ramp`, `choose` (exist); `textureTone`, `textureLight` (B15b: COLOUR_RULES entries, so a palette `derive` names them); `sky.look`, `lit.tone`, `haze`, `shade.of` | `data-rules.js`, `backdrop.skyLook/litTone/hazed`, `tiles.textureTone` |
| layout | `rig` (bones), `tiles`, `layers`, `panel`, `emitters`, `pictures` (each registered with family `layout` and the body kind as id; `run(input, ctx)` returns `{ list, palette, frames, offset, points, slice, textArea }`: the contract is in `engine/data-sprite.js`, LAYOUTS) | the six `body` kinds |
| tile | `tile.clips`, `tile.block`, `tile.thin`, `tile.slope`, `tile.liquid`, `tile.decal`, `tile.courses`, `tile.pattern`, `edge.wave` (a profile), `paving.herringbone`, `paving.stones`, `fence`, `shore`, `plating.seams`, `plating.spots`, `bolt`, `grate` | `tiles`, `paving`, `fences`, `water`, `plating`, `dungeon`, `hive`, `ground` |
| place | `scatter` (seeded, `stable`, margin, gap, rows), `row` (evenly along a line), `grid` | `tiles.scatter`, `backdrop.scatter` |
| backdrop | `sky.bands`, `ridge`, `fill.below`, `fill.between`, `lit.edge`, `treeline`, `battlements`, `canopy`, `mist.band`, `cloud`, `stars`, `disc`, `round.tree`, `far.house`, `pillar`, `light.shaft`, `planet` | `backdrop`, `scenery`, `space`, `shafts` |
| ui | `ui.frame`, `ui.button`, `ui.panel`, `ui.bar` (housing, fill, opening), `ui.tab`, `ui.tooltip`, `ui.slider`, `ui.knob`, `ui.check`, `ui.radio`, `ui.switch`, `ui.pointer`, `ui.selector`, `ui.tech`, `scan.lines`, `bubble`, `counter`, `key.cap`, `pad.button`, `stick`, `mouse` | `ui`, `ui-skins*`, `ui-candy*`, `ui-crystal*`, `ui-gilded*`, `ui-grove-vine`, `ui-neon-tube`, `ui-paper`, `ui-wood`, `bubbles`, `counters*`, `inputs*`, `pad-buttons`, `input-rocker`, `mouse-light` |
| fx (behaviours) | `particles`, `sparkles`, `twinkle`, `glow`, `ring`, `shards`, `smoke`, `chunks`, `rays`, `streaks`, `flame`, `puffs`, `starburst`, `beam`, `leaves`, `scorch`, `embers`, `spark.ring`, `blast.ball`, `puff.ring`, `bolt`, `swirl`, `motes`, `fall.field`, `trail.puffs`, `mist`, `ripples`, `shot.bar`. Built in B12 (`engine/gen/fx-burst.js`): `particles`, `starburst`, `glow`, `ring`, `streaks`, `puffs` and `shot.bar` (the blaster bolt's bar of light: styles bolt, pulse, needle, flat; `trail`; keyable `beat`), each with `begin`/`end` where it runs over time, `starburst`'s keyable `push`, `cut`, `short`, `cool` (with `rim`, its rim's step down a list of paints) and its `twist`, and `glow`'s keyable `scale`, `cool`; the rest is B12c | `fx`, `bursts`, `blast`, `spells`, `shots`, `weather`, `fx-floor`, `fx-trails`, `fumes`, `mist`, `ripples` |
| motion | `pickup.bob`, `pickup.spin`, `pickup.collect`, `prop.sway`, `prop.shake`, `break.debris`, `door.swing`, `flicker` | `pickups.pickupPose/collectBurst`, `breaking`, `buildings.doorSwing/candleFlicker` |
| shape | `star`, `ngon`, `squircle`, `round.rect`, `gem.cut`, `bottle`, `crescent`, `drop`, `missile`, `crystal`, `snowflake`, `crown.lobes`, `trunk`, `roof`, `timber.wall`, `plank.door`, `pane.window`, `awning`, `solid.extrude`, `wall.wear`, `rock.lump` | `shapes`, `pickups`, `spells`, `shots`, `foliage`, `buildings`, `stalls`, `solids`, `rock`, `crystals` |
| shine | `glint`, `gleam`, `heartbeat`, `icon.glint` | `pickups`, `icons` |
| icon | `icon.fit` (from geometry), `icon.plate`, `icon.rise`, `icon.slant` | `icons*` |
| text | `text` primitive + font pieces; `glyph`, `status.mark` | `pixel-font`, `glyphs`, `text-fx`, `counter-*` |
| body (on bones) | `fur.tufts`, `wing.flap`, `cloth.sway` (cape, scarf: a chain of nodes driven by the root's motion), `hair.strands` | `creature`, `rigs/*` cape and hair drawing |

About 150 generators; each is a port of one existing function that **returns primitives instead of drawing**. Pieces (data, `pieces/`): bases (`base:person-side`, `base:person-topdown`, `base:kiosk`, one per creature rig family: 13), parts (hair styles, headgear, held things, capes, packs, belts: about 60 from `humanoid.js`, `humanoid-figure.js`, `topdown.js`), UI skins (about 12), tile materials (shared ones only), fonts (4), stamps (eyes, clods, nails, rivets: about 40).

### 3.4 Safety rules

1. A definition is data: no function, getter, expression or code text anywhere. Generators and pieces are named, never brought; a name is looked up in the registry and an unknown one is refused.
2. Every argument is checked against its type and range before anything draws; every count is capped; each generator's `cost` is summed per frame and a definition over the budget is refused (so nothing can hang the page, and no worker or time limit is needed). An emitter is priced **once**, at the values it sets (bindings at their largest: a map's largest output after its rounding, a pick's largest, a slider's max, for numbers and for each coordinate of a point) and amount 1, with no clip key read: its cost, and its stamp pixels in the sprite's frame (`engine/gen/index.js` STAMP_BOUNDS, one entry for every behaviour; an emitter whose generator has none is refused). Keys cannot raise that price: a key may set a size argument (SIZE_KEYS: what the cost or the bound reads) only at or below what the emitter sets, the other keyable arguments are read by neither, and the amount is held to 0..1 when it draws (`engine/gen/emit-keys.js`). The stamp bounds are summed over all the emitters, as if every one were on in every frame, apart from those a control's `when` or a `clip` list keeps apart; the work is at most 4,096 sums of 16 emitters, whatever the clips and keys. So a definition that validates also loads, and checking it takes a fixed small time (B12b, after the B12 reviews: `catalog/sprite-schema.js` boundEmitters; the per-key pricing and the sum over every stretch between keys are gone). Each behaviour's cost bounds its run time and its bound its stamps, at its biggest arguments (`tests/unit/gen-b12-safety.test.mjs`).
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

### 4.3 Layouts: where each body plugs in, and who names its clips

Step 4 for every body but a rig is a **layout**: a generator of family `layout` whose id is the body kind, found in the registry (the newest version). A later body plugs in by registering one, `defineGenerator({ id: "<kind>", v: 1, family: "layout", about, args: {}, cost: () => 0, run })`, in its own file; `engine/data-sprite.js` does not change. The contract of `run(input, ctx)` (what it is given, what it returns: `list`, `palette`, `frames`, `offset`, `points`, `slice`, `textArea`) is LAYOUTS in the header of `engine/data-sprite.js`. Until its layout is registered a body is refused, naming its build item (`NOT_BUILT_BODIES`).

| Body | Laid out by | Registered from | Build item | Its clips are named by |
|---|---|---|---|---|
| `rig` | `rigs/bones.js` (`drawResolvedRig`, `resolvedRigList`, `resolvedRigPoints`; 2.2); never the registry | none | B5 | The definition's `clips` and its base's (`extends`) |
| `pictures` | The built-in `picturesLayout` until `pictures` is registered | `engine/gen/pictures.js` | B8 | The definition's `clips`; an icon set's `pictures` are one-frame clips of their own (`engine/data-sprite.js`) |
| `emitters` | Its registered layout | `engine/gen/emitters.js` (behaviours in `engine/gen/fx-burst.js`) | B12 | The definition's `clips` |
| `panel` | Its registered layout | `engine/gen/ui.js` | B13 | Its `states` (default `normal`, `hover`, `pressed`, `disabled`); a written clip must be one of them |
| `layers` | Its registered layout | `engine/gen/backdrop.js` | B14 | Its layers' `name`s; a written clip must be one of them |
| `tiles` | Its registered layout | `engine/gen/tiles.js` | B15 | **Not yet** (see below): today only the clips the definition writes |

**A layout does not name clips.** A sprite's clip names are fixed before any frame is laid out: `engine/resolve.js` (`clipNames`) lists a panel's states, then a background's layer names, then a base's clips, then the definition's own (at most 64; prototype words dropped), and the validator (`catalog/sprite-schema.js`, `clipsOf` with `layoutClips`) checks the definition's `clips` against the same list. `run` sees one clip at a time and its result has no clip list. Tiles are the gap the B6 review found: the validator accepts any clip name for a `tiles` body (`layoutClips` is null, "the tile.clips generator names them") but `clipNames` has no tiles branch, so a tileset has only the clips its definition writes. **Decision for B15:** add a `tiles` branch to `engine/resolve.js` `clipNames` that names the clips with the `tile.clips` generator from the body's `groups` and `extra` (as `blockClips`, `thinClips`, `slopeClips`, `decoClips`, `liquidClips` name them today), and give the validator the same list as `layoutClips`, so tile clips are named in one place, as panel states and layers are.

## 5. What is removed, and when

Phases are those of section 9: P0 framework, P1 pilot, P2 bases and pieces, P3 migration, P4 removal.

| "A" path | Files | Removed in | What replaces each caller |
|---|---|---|---|
| Made source in a sandbox | `app/sandbox-worker.js`, `app/made.js`, `app/api-source.js`; made-source branches in `app/api-core.js`, `app/api-worker.js`, `app/bag.js` (`{ source }`), `app/bundle.js` (`<id>.source.js`, `madeOnThisVisit`), `blob:` in the content policy (`index.html`); tests `route2-safety`, `route2-browsers`, `api-source-*` | **Done** in B11 and B11b (`21aba7f`, `0a41f81`, 2026-11-20), with the tests `route2-safety`, `route2-browsers`, `api-made`, `api-sources`; `blob:` is gone from `script-src` and `worker-src` | `make.sprite(definition)` takes v2 JSON and registers it like a studio sprite (`app/catalog.js addStudioSprite`); bag `{ data, made }`; link `{ d, m }`. **The download writes `sprites/<id>/<id>.sprite.json`** (not `<id>.json`, which is the sheet's animation list). A stored `{ source }` item (link `{ s }`) is never run: it shows "made with an older version of Loadout; ask for a new link" (section 10, DQ2) and stays out of the download. **Identity: the `made` token.** Each make call's sprite carries a token, a short hash of the definition it made (`app/bag.js madeToken`); `make.sprite` changes only bag items of its own token under its id, and refuses an id the bag holds for any other sprite (studio sprite, studio draft, frozen copy, linked item, another make); two different definitions never share an id in one bag (the second gets `<id>-2` and loses its token) |
| Library body | `engine/library-body.js`, `engine/library-bodies.js`, `rigs/body-humanoid.js`, `rigs/humanoid-studio.js`, `app/studio/library-body.js`; library branches in `catalog/studio-schema.js` (`LIBRARY_*`, `FIGURE_*`), `engine/data-sprite.js`, `engine/data-rules.js` (`FIGURE_BLOCKS`, `paintFigure`), `app/studio/draw.js`, `edit.js`, `panes.js`, `more-panes.js`, `stage.js`, `app/api-studio.js` (`bake` from humanoid); `catalog/data-file.js LIBRARY_HEADER` stays (it is the library file header); tests `studio-bodies-*`, `conversion-c1`, `conversion-f1`, `humanoid-studio-*`, `data-sprite-library*` | **P3**, once `rogue-battler` and `road-bandit` are redrawn on `base:person-side` | Studio "Start from the library" opens any library sprite's definition (it is data); `studio.bake` bakes from a base piece's clips |
| Code rigs that draw | `rigs/humanoid.js`, `humanoid-figure.js`, `humanoid-describe.js`, `topdown.js`, `topdown-riot.js`, `topdown-sneak.js`, `topdown-describe.js`, `creature-topdown.js`, `quadruped.js`, `crawler.js`, `bigbody.js`, `hive-bug.js`, `brood-queen.js`, `guard-bot.js`, `mech-walker.js`, `kiosk.js`, `kiosk-describe.js`; `tools/rig.mjs`; tests `rig-describe-*` | **P4**, after every rig sprite is data. Used in P2 only as the reference the bases are baked from (`tools/bake-rig.mjs`, deleted with them) | Base and part pieces; `tools/piece.mjs` (tables and contact sheets of a piece, like `rig.mjs`) |
| Sprite files with `render()` | 226 files in `sprites/` (commit `6773968`; 227 when this was written, before P1) | **P3**, batch by batch | `sprites/<id>.json` data files (section 10, DQ1) |
| Drawing helpers only assets called | about 100 modules in `engine/` (`fx`, `tiles`, `backdrop`, `ui-*`, `icons*`, `pickups`, `buildings`, ...) | **P4**, each when its last caller is gone (a test lists importers) | Their generator ports in `engine/gen/` |
| Read-back tracing in the bar | `quality/sprite.js` `standIn`, `directPixelUse`, `callerOf`, `outsideCalls`; `stylesDeclared` warnings | **P4** | Not needed: data cannot read back |
| Frozen code copies (test fixtures) | `tests/fixtures/code-sprites/<id>.js` (copies of code sprites as they were before their redraw, for the tests about the framework a code file uses) and their lines in `tests/fixtures/code-sprites/SHA256SUMS` (pinned by `tests/unit/tests-migration-ready.test.mjs`); P1 moved the coin, crate and food icons there, T1 froze the rest a test names | **With the last test that reads each copy**, in R1 to R4: removing a code rig or helper deletes the copies that import it and the framework tests that read them in the same item, each copy with its `SHA256SUMS` line. The copies are callers of the modules they import, so a check of a module's importers counts this folder | Tests about a library asset load whichever file the asset has (`tests/helpers/library.mjs` `librarySprite`); `tests/fixtures/code-sprites/README.md` |
| Docs | Contract 13 (code rigs), Contract 14 rules 1 to 3 and 8, `docs/studio.md` section 3 and F1/F2, `docs/framework-api.md` "Where a made source runs", "Library bodies", "Rigs", style guide §14 | With the code they describe | Contract 15, this file, the new skill |

What stays framework code at the end: `engine/sprite.js`, `surface.js`, `color.js`, `motion.js`, `palettes.js`, `materials.js`, `theme.js`, `styles.js`, `sheet-info.js`, `versions.js`, `tile-rules.js` (and the picker part of `tiles.js`), `data-sprite.js`, `draw-list.js`, `resolve.js`, `gen/*`; `rigs/bones.js`, `keypose.js`, `studio-templates.js` (as v2 data); `catalog/*`; `quality/*`; `sound/*`. **No sprite drawing code exists outside the generic renderers and the generators.** The build refuses any file in `sprites/` that is not the data form (from P4; from P1 for new ids).

| Caller | After B |
|---|---|
| Catalogue build (`tools/build.mjs`, `tools/lib/assets.mjs`) | Reads each data file, `dataSprite`, writes the row with `rev`; quality cache keyed as 4.2 |
| Quality bar | `checkSprite` on the data sprite, unchanged API; new data checks (unused control, stamp out of frame, slot never painted, cost) |
| Export | Unchanged sheets; every sprite's download also carries `<id>.sprite.json`, its definition at the item's settings (`<id>.json` is the sheet's animation list). Built for sprites made on a visit (B11); **not yet** for catalogue sprites that are data |
| Playground | Unchanged |
| Bag and links | Catalogue items `{ id, settings }` as today; edited copies `{ data }`; sprites made with `make.sprite` `{ data, made }` (the `made` token, B11b) |
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
| B5 | Rig v2: nodes, stamps and `use` on bones, direction stamp overlays; drawing a resolved sprite's rig (entry points in 2.2, "The rig renderer") | `rigs/bones.js` (additive). No `rigs/rig-extend.js`: `extends` is merged by the resolver (`engine/resolve.js`, B4) before the rig reaches `rigs/bones.js` | `bones-v2-*.test.mjs`; every v1 template draws byte for byte | B3, B4 | M |
| B6 | `dataSprite` v2 for every body; materials from slots; `slice`, `textArea`, sockets; the layout contract (4.3) | `engine/data-sprite.js` | `data-sprite-v2-*.test.mjs`; v1 unchanged | B1 to B5 | M |
| B56 | Seams the B5 and B6 reviews left: a rig frame's list through `resolvedRigList` (so `dataFrameList` is what `render` draws); prototype-named parents, IK hips and chains; own-property clip lookups; this document's rows | `engine/data-sprite.js`, `rigs/bones.js`, this file | `data-sprite-v2-seams.test.mjs`, `bones-v2-caps.test.mjs` | B5, B6 | S |
| B7 | Pieces: folder, loader, index | `pieces/`, `engine/pieces.js`, `tools/lib/pieces-index.mjs` | `pieces-*.test.mjs`: index lists every file, versions pinned | B1 | S |
| B8 | Pictures layout + first generators (`pickup.bob`, `pickup.spin`, `pickup.collect`, `glint`, `star`, `gem.cut`, `icon.fit`) | `engine/gen/pictures.js`, `engine/gen/shine.js`, `engine/gen/shape.js` | goldens | B2, B3 | M |
| B9 | Build, tools and quality cache for data files | `tools/lib/assets.mjs`, `tools/lib/quality-run.mjs`, `tools/gen.mjs`, `tools/piece.mjs`; data checks in `quality/sprite.js` | `assets-data-*.test.mjs`; `newasset.spec.mjs` with a `.json` file | B6 | M |
| B9b | Finish B9 after its third review (orchestrator's decision, 2026-11-19 23:22): the "slot never painted" data check gave false errors on valid sprites; picture cache keys hashed absolute paths; the data checks were outside `checkSprite` | B9's files (`quality/data-checks.js` inside `checkSprite`) | `assets-data-checks`, `assets-data-keys`, `assets-data-quality` | B9 | S |
| B9c | `.json` sprites found by id in every tool: scene, tilemap, bundles from plans, ready-made versions | `tools/scene.mjs`, `tools/tilemap.mjs`, `tools/bundles-from-plans.mjs`, `tools/lib/versions-build.mjs`, `tools/lib/assets.mjs`; small edits to `app/catalog.js`, `app/api-worker.js` (committed with B11) | `assets-data-everywhere.test.mjs`, `newasset-data.spec.mjs` | B9 | S |
| B10 | Skill rewrite | `skills/sprite-forge/SKILL.md`, `context.mjs` | `context.mjs verify` | B8, B9 | M |
| B10b | Fix what the first fresh-agent skill test found: generators that clipped below their node get new versions that draw whole (`gem.cut@2`, `glint@2`, `icon.paint@2`, `icon.line@2`, `icon.glint@2`; each `@1` unchanged); `glint@2` can stay inside a generated stone; the skill covers the agent's eight points | `engine/gen/icon.js`, `shine.js`, `shape.js`, `pixels.js`, `index.js`; the skill | `gen-b10b-goldens.test.mjs`, `gen-node-origin.test.mjs` | B10 | S |
| B11 | Route 2 on data; remove the sandbox | `app/api-core.js`, `app/api-actions.js`, `app/api-worker.js`, `app/bag.js`, `app/bundle.js`, `index.html`; delete `app/made.js`, `app/sandbox-worker.js`, `app/api-source.js` | `route2.spec.mjs` rewritten on JSON; old `{ source }` link message | B6 | M |
| B11b | Finish B11 after three reviews (orchestrator's decision, 2026-11-20 02:24): a made sprite carries a `made` token (`madeToken`, a short hash of its definition) and `make.sprite` changes only bag items of that token, never studio sprites, drafts or other sprites; two different definitions never share an id in one bag | `app/bag.js`, `app/api-core.js`, `app/api-actions.js` | `api-made-token.test.mjs`, `bag-made-ids.test.mjs`, `route2-data.spec.mjs` | B11 | S |
| B12 | Emitters layout + the first fx generators (`particles`, `starburst`, `glow`, `ring`, `streaks`, `puffs`, `shot.bar`) | `engine/gen/emitters.js`, `engine/gen/fx-burst.js`, `engine/gen/emit-keys.js` | goldens; `gen-b12-safety` (run time within cost); the `hit-spark`, `blaster-bolt` and `plasma-burst` redraws (`tests/fixtures/v2/emitters/`) pass; the bolt matches its code sprite pixel for pixel, the burst styles at the default size | B8 | L |
| B12b | Finish B12 (after three reviews; orchestrator's decision): an emitter is priced once, at what it sets and amount 1, with no key read (`catalog/sprite-schema.js` boundEmitters replaces priceEmitKeys and sumEmitPixels); keys may lower a size argument (`engine/gen/index.js` SIZE_KEYS) but never raise it; the amount held to 0..1 when it draws; a stamp bound for every behaviour (STAMP_BOUNDS, now also `twinkle`, `pickup.burst`, `chunks`), an emitter without one refused; an emitters body's `nodes` and `draw` through `engine/resolve.js`; `starburst` gains `twist` (a share of half the spacing, so Twist suits any number of rays) and `cool`/`rim` (cooling through a list of paints, as `glow`), so hit-spark's tips and plasma-burst's shards are one emitter each | `catalog/sprite-schema.js`, `engine/gen/fx-burst.js`, `engine/gen/emit-keys.js`, `engine/gen/index.js`, `engine/resolve.js` (seam) | `gen-b12-safety` (keys cannot raise the price; a point argument bound by pick, map or the control itself priced at its largest, in an emitters and a pictures body; emitters whose whens can hold together summed; each behaviour at its biggest arguments within its cost and its bound; free keys at their extremes; the reviews' slow, wrap-round and two-clip cases); `data-sprite-v2-emitters` end to end with nodes and draw; the hit-spark star, ring and slash styles pixel for pixel at the default size for every Twist and ray count, star and ring at any size, the slash within a pixel at other sizes | B12 | M |
| B12c | The other 20 fx behaviours (`sparkles`, `twinkle@2`, `shards`, `smoke`, `rays`, `flame`, `beam`, `leaves`, `scorch`, `embers`, `spark.ring`, `blast.ball`, `puff.ring`, `bolt`, `swirl`, `motes`, `fall.field`, `trail.puffs`, `mist`, `ripples`), `blast.ball` and `shards` first (the 10 bursts and 4 blasts need them under the 16-emitter cap), each with a STAMP_BOUNDS and a SIZE_KEYS entry (`gen-b12-safety` refuses an fx generator without them); `engine/gen/pictures.js` and `engine/data-sprite.js` reading the on/off and amount rules from `engine/gen/emit-keys.js` (they still hold copies, and do not hold the amount to 0..1: `pictures.js` clamps a keyed amount only above 1); the `pictures` layout guarded as the `emitters` one is: a summed-cost check of a frame's keyed calls before any runs (as `engine/gen/emitters.js` checkKeyedCost), and its motions (`pictures.js` keyedItems) held to the SIZE_KEYS rule when they set an emitter's keyable arguments, so a motion cannot raise what the validator charged; the stamps a body's draw list writes added to the emitters' summed stamp bound (both share a frame's 8,192); `engine/data-sprite.js` LAYOUT_FILES naming `engine/gen/emitters.js` (pinned as `fx.js` by `data-sprite-v2-layouts.test.mjs` today) | `engine/gen/fx-*.js`; seams in `engine/gen/pictures.js`, `engine/data-sprite.js` with their owners | goldens, port tests and the B12b safety tests per behaviour | B12b | L |
| B13 | Panel layout + UI skins as pieces | `engine/gen/ui.js`, `pieces/skin-*` | goldens; `ui-buttons-wood` slice and text area equal today's | B8 | L |
| B14 | Layers layout + backdrop generators | `engine/gen/backdrop.js` | goldens; wrap seam test | B8 | M |
| B14b | Finish B14 after three reviews: a colour the resolver cannot work out is reported by a flag, never by painting magenta (so a palette's real magenta draws); the mist leaves no 1 px lines; B4's `was: { controls }` reading in `cleanParams` | `engine/resolve.js`, `engine/draw-list.js`, `engine/sprite.js` (one addition) | `resolve-lost.test.mjs`, `gen-backdrop-layers.test.mjs` | B14 | S |
| B15 | Tiles layout + tile generators (material as data) | `engine/gen/tiles.js` (uses `engine/tiles.js` picker) | goldens; `tile-rules` replay unchanged; `tiles-forest` redraw passes the join checks | B8 | L |
| B15b | The other 10 of the 13 tilesets as data (orchestrator's split, 2026-11-20 05:00, after B15 failed its third review on scope only): `castle`, `hive`, `meadow`, `pit`, `platforms`, `shore`, `station-floor`, `station-walls`, `village`, `water`, beside the forest, cave and dungeon B15 committed; plus what they need from the framework: a threshold on a slider in a `when` list (`{ "atLeast": 0.35 }`, Contract 3), white in a derived slot's rule, a material piece's summary | `tests/fixtures/v2/tiles/tiles-<id>.json`; `engine/data-rules.js`, `catalog/sprite-schema.js`, `engine/resolve.js`, `engine/pieces.js` | each tileset passes the join checks as `tiles-forest` does (B15's acceptance) and B15's `gen-tiles-*.test.mjs` stay green; `when-threshold`, `derive-white`, `pieces-material-check` | B15 | M |
| B16 | Bases baked from code rigs (13) and part pieces (about 60) | `pieces/base-*`, `pieces/part-*`, `tools/bake-rig.mjs` (temporary) | Each base: every clip baked, ≤ 2% pixels off the code rig at defaults (the Hero preset's test) | B5, B7 | L (parallel: one builder per rig family) |
| B16a2 | Finish B16a (the side-view person: `base:person-side` with every standard clip, and its part and held pieces, baked from `rigs/humanoid.js`) after its third review (orchestrator's decision, 2026-11-20 05:00): the base applies the ground cut itself, so a sprite never has to remember it; die frames 1 to 3 are accepted at 6 to 7% pixels off | `pieces/base-person-side.v*.json`, `pieces/part-*.v*.json`, `pieces/held-*.v*.json` (side view), `tools/bake-person-side.mjs` | `pieces-person-side.test.mjs`: every clip baked, ≤ 2% pixels off the code Hero at defaults | B16a | M |
| B17 | Studio shell for every body + stamp painter + pictures editor | `app/studio/*`, `app/css/studio.css` | `studio-v2.spec.mjs` | B6 | L |
| B18 | Advanced mode on the sprite page | `app/sprite-page.js`, `app/studio/*` reuse | `sprite-advanced.spec.mjs` | B17 | M |
| B19 | Particle, 9-slice, layer, tile editors | `app/studio/<kind>-*.js` | one spec each | B12, B12b, B12c, B13 to B15, B17 | L each |
| P1 | Pilot: the first library sprites as data. `coin`, `crate` and `icons-food` redrawn with the skill as `sprites/<id>.json` (same ids, clips and control keys; old links open); their code files moved to `tests/fixtures/code-sprites/` | `sprites/coin.json`, `crate.json`, `icons-food.json` | `library-p1-redraws.test.mjs`, `p1-redraws.spec.mjs` | B8, B9, B10 | S |
| T1 | Tests ready for the migration (B9c's review list): a test about a library asset loads whichever file it has (`tests/helpers/library.mjs`); tests about the framework a code file uses read a frozen copy in `tests/fixtures/code-sprites/`, pinned by `SHA256SUMS`; scans fail on a file they cannot load | `tests/helpers/library.mjs`, `tests/fixtures/code-sprites/*`, the tests that read `sprites/` | `tests-migration-ready.test.mjs` (a guard that reads every test file); the whole unit suite with a few code sprites replaced by data in a scratch copy | B9c, P1 | M |
| D1 | Docs brought in line with what is built: Contract 11's safety paragraph, the notes on Contracts 13 and 14, Contract 15's state; this file's sections 5 and 9; the README's counts; `docs/features.md` rows for the studio and option B | `docs/architecture.md`, this file, `README.md`, `docs/features.md` | — (docs only) | B11b, P1 | S |
| M1 to M40 | Migration batches (section 7) | `sprites/<ids>` | check + review | B10 and the kind's layout | S each |
| R1 to R4 | Removals (section 5) | the files listed there | the suite with the files gone | migration of their last caller | S each |

**State of every item** (2026-11-20 05:00, commit `6773968`, from `docs/progress.md` and the git log; "round 2" = passed independent review on its second round):

| Id | State |
|---|---|
| B1 | Committed `f851db1` (first time) |
| B2 | Committed `ed91e41` (round 2) |
| B3 | Committed `904c1a3` (round 3). Follow-ups open: `placeOn` should refuse deep nesting itself; the three speed tests fail only under heavy machine load |
| B4 | Committed `b222730`, `dccbf89` (round 3) |
| B5, B6 | Committed `5c1ffb0`, `42091b6` (each round 2) |
| B56 | Committed `8f6d0bf` (first time) |
| B7 | Committed `a4b1887` (round 2) |
| B8 | Committed `b94a5d8` (round 2) |
| B9, B9b | Committed together `1e0437b`: B9 failed three reviews, B9b passed on its third round |
| B9c | Committed `79bdd8c` (first time) |
| B10 | Failed its third review; the orchestrator rewrote the maker agent's rules and ran the fresh-agent test itself: passed 2026-11-19 23:57. The skill lives outside this folder, so nothing is committed here |
| B10b | Committed `f84c2c4` (first time) |
| B11, B11b | B11 failed three reviews; B11b passed. Committed together `21aba7f`; the two page lines `0a41f81` |
| B12, B12b | B12 failed three reviews; B12b passed on round 2 (03:59). Committed `87a4e2c` together with B15's core and T1 (they share files) |
| B12c | Not started |
| B13 | Committed `f9a0020` (round 2) |
| B14, B14b | B14 failed three reviews; B14b passed. Committed together `cd4f130` |
| B15, B15b | B15 failed its third review on scope only (10 of 13 tilesets not ported); its core (tiles body, join rules, clip names, the forest, cave and dungeon tilesets as data) committed `87a4e2c`. **B15b (the other 10 tilesets) in progress, not committed** |
| B16 | B16b (top-down person) committed `aaec12f` (round 2). B16a (side-view person) failed its third review (a sprite had to remember a ground cut); **B16a2 in progress**, its pieces on disk and not committed. The other 11 bases and their parts: not started |
| B17, B18, B19 | Not started. The version 1 studio (Contract 14) works and is not replaced yet |
| P1 | Committed `64c0902` (round 2): the first 3 library sprites that are data |
| T1 | Committed `87a4e2c` (first time): library tests load either file kind; 46 frozen code copies with their `SHA256SUMS` |
| D1 | In review: this edit, refreshed to commit `6773968` after its first review |
| M1 to M40 | Not started (P1 piloted pickups, props and icons; 226 code sprites left) |
| R1 to R4 | Not started. The sandbox, section 5's first row, is already removed (B11) |

| Parallel lanes | Items |
|---|---|
| Start together | B1, B2, B3, B7 |
| Then | B4 → B5, B6 → B8, B9 → B10, B11 |
| Then in parallel | B12, B13, B14, B15, B16 (one builder each), B17 |
| Then | Pilot (one per kind), migration batches per kind as its layout lands; B18, B19 |
| Last | R2, R3, R4; switch the build to refuse code sprites |

**First useful slice** (B1 to B4, B6 to B9 for the `pictures` body, B11): `coin`, `crate` and `icons-food` redrawn as data files with stamps and the first generators, passing the bar, found by search, customised, bagged, played, downloaded, shared by link and made through `window.loadout.make.sprite(definition)`; the sandbox worker deleted. It proves the format, stamps, generators, caching keys, route 2 and the skill's shape on the simplest kind before the expensive layouts. **Done 2026-11-20** (P1 `64c0902`, B11 `21aba7f`).

## 10. Risks and open questions for Keyang

| Risk | Mitigation |
|---|---|
| Redraws look worse than the reviewed code art (pixel detail by hand vs by code) | Side-by-side review against the old render is mandatory; pilot per kind before any batch; a person's sample check after the pilot (asset plan decision P5) |
| 150 generators are most of today's helper code ported, so "no code" moves code rather than removing it | Accepted: the gain is that assets are data. Each port returns primitives (styles become possible) and is pinned by goldens |
| Tile materials as band rules may not express every paint function | B15 (forest, cave, dungeon) and B15b (the other 10) port all 13 tilesets' materials in the test suite before migration; a missing case is a new band field, not code in an asset |
| Migration and new assets compete for agents | New assets are data-only from P1; the kits' order keeps them shippable throughout |

| Id | Question | Recommendation |
|---|---|---|
| DQ1 | **Answered 2026-11-19 (Keyang): `.json`.** File form: keep `sprites/<id>.js` as the fixed wrapper (Contract 14 rule 8), or switch to `sprites/<id>.json`? | **`.json`**, switched in B9 for new files and by the migration for the rest: no import, no code-shaped file, fetched not imported. The wrapper stays readable until P4 |
| DQ2 | **Answered 2026-11-19 (Keyang): drop them.** Old bags and links holding a sprite made from source text (`{ source }`, route 2 since 2026-11-18): drop them, or keep the sandbox to open them? | **Drop** (they were made on a visit; nobody outside the build loop has them). Show "made with an older version; ask for a new link" |
| DQ3 | **Answered 2026-11-19 (Keyang): keep keys, accept the redraw.** Saved settings when a redraw changes what a control does: keep keys and accept a different picture, or version every library sprite so old links keep the old drawing? | **Keep keys, accept the redraw**, with `was` maps and a one-time note in the bag. Keeping old drawings means keeping the code |
| DQ4 | **Answered 2026-11-19 (Keyang): `pieces/` folder.** Shared pieces (bases, hair, held things, skins, fonts) as framework-owned data in `pieces/`: yes, or inline everything into each asset? | **Yes.** Inlining makes 3,000 copies of a sword; a fixed sword must reach every sprite (Contract 13's reason) |
| DQ5 | **Not asked; the recommendation (a copy) is taken as the default.** Advanced mode on a sprite page edits a copy (a studio draft) or the library asset itself? | **A copy.** The library changes only through files and review (quality bar, Contract 15 rule 7) |
