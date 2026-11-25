---
name: sprite-forge
description: Create game-ready assets for Loadout (this repository, formerly called Sprite Forge) - any visual asset (character, creature, tileset, prop, pickup, projectile, effect, background, interface piece, icon) as one data file sprites/<id>.json that names shapes, pixel stamps and framework generators (no drawing code), or a sound effect, ambience loop, jingle or music track as one JSON patch - each with plain-language controls, checked against the quality bar, adding a generator or a piece to the shared framework when it lacks something, and redrawing old code sprites as data. Trigger - "make a sprite", "make a sound effect", "compose game music", "add a <thing> to Loadout", "loadout", "sprite forge", "new sprite animation", "give <sprite> sounds", "redraw <sprite> as data".
---

# Loadout: make a visual asset

**Sounds, ambience, jingles and music: read `SOUND.md` in this folder instead.** This file is for everything you see.

Every path and command below is relative to the repository root: `cd` there first (or to the copy of it you were given). It is a static website of pixel-art sprites that a visitor customises with sliders and downloads as sheets.

**A sprite is one data file, `sprites/<id>.json`.** It says *what* to draw: colour slots, controls, shapes, small pixel blocks (stamps), animation keys, sounds, and the names of framework **generators** that do any computing. The framework draws it. The build finds the file by scanning `sprites/`: there is nothing to register. These rules are Keyang's and are binding:

1. **No code in an asset.** No functions, formulas or expressions anywhere in the file. A setting reaches a number only through a lookup table (a *binding*, below).
2. **Variety comes only from naming generators** from the fixed registry (`engine/gen/`), with arguments: `{ "gen": "gem.cut", "v": 2, ... }`. If the one you need is missing, you **add it to the framework** (last section), never to the asset.
3. **Shared drawing lives in `pieces/`** (bases, hair, held things, skins, fonts, stamps), named with `{ "use": "<kind:name>", "v": 1 }`.
4. **Redraws of old code sprites are allowed** (not pixel for pixel) and are made with this skill: same id, clips, sound cues and control keys.

The old form, `sprites/<id>.js` with a `render()` function, is gone: since build item R4a the build, the loader and the quality run refuse any code file in `sprites/` (a `.mjs`, a `_helper.js` and a `_was-<id>.js` too), with a message that names the file and sends you here. Never write one; never copy drawing code from one.

## Step 0, every time: load the live rules

This file is a recipe, not a copy of the rules. Which bodies are built, which generators and pieces exist and the contracts change weekly, so read them live:

```
node .claude/skills/sprite-forge/context.mjs              # overview: contracts, bodies, generators, pieces, data examples, DRIFT
node .claude/skills/sprite-forge/context.mjs bodies       # which of the six bodies are built today
node .claude/skills/sprite-forge/context.mjs generators   # every generator by family, with what it draws
node .claude/skills/sprite-forge/context.mjs pieces       # every shared piece
node .claude/skills/sprite-forge/context.mjs examples [type]   # data sprites to copy, and whether each draws today
```

(**`context.mjs` reports on the folder you run it from, or on `--root <dir>`: in a git worktree run it from inside the worktree, or its counts and lists describe the main checkout.** It uses the current folder when that is a Loadout project.)

- Read `docs/data-sprites.md` sections 2 (the format), 2.6 (bindings, `when`, parts) and 2.7 (primitives), and in `docs/architecture.md` Contract 15 (every sprite is data), Contracts 1 to 3 (metadata, everything is a sprite, parts), 10 (the quality bar), 11 (framework and assets), 12 (styles).
- Read `docs/style-guide.md` once per session: frame sizes and pivots (§1), outline and colour counts (§2), clip names, frames and fps per kind (§4), controls and the size of change each must make (§10), sound pairing (§11), metadata and originality (§13). Where a specification row in `bundles/specs/<bundle>.md` exists for your id, it wins for that asset.
- Read **`docs/craft/sprites.md`** before your first look round: it teaches what makes a sprite *good* (silhouette, value before colour, clusters, animation spacing, game feel, per-kind advice) and its checklist (§17) says what earns a 3 rather than a 2 on each rubric line. It adds no rule; where it and a rule document disagree, the rule wins (its §15 lists every such place).
- If `context.mjs` prints **DRIFT**, a rule document changed after this file: where they disagree, the document wins (architecture, then the specification row, then the style guide, then this file). Say so in your report, quoting the line here.

## 1. Pick the body

`body` holds exactly one of six layouts. The kind of thing decides which:

| Body | For | Today |
|---|---|---|
| `pictures` | props, pickups, projectiles, icons: a small node tree with shapes and stamps, motions, emitters, icon sets | built (B8) |
| `rig` | characters and creatures: bones, shapes and stamps on bones, key poses, IK | built (B5); bases: `node tools/piece.mjs` lists them (`base:person-side`, the top-down persons; the creatures and robots are generators, `node tools/gen.mjs`; no code rig is left: R2 and R2b deleted them) |
| `emitters` | effects: particles, rings, smoke, flames | built (B12); examples: `sprites/fx-heal.json`, `sprites/cell-burst.json` |
| `panel` | interface pieces: buttons, panels, bars, 9-slice and text area | built (B13); examples: `sprites/ui-buttons-wood.json`, `sprites/ui-panel-wood.json`, `sprites/ui-gridline-panels.json` (a clip that never carries the game's text is `noText: true`) |
| `layers` | backgrounds: parallax layers of sky bands, ridges, scatter | built (B14); the library's five backgrounds (`sprites/bg-*.json`, migration M10) are the examples |
| `tiles` | tilesets: groups, edge profiles, band rules, fills | built (B15); examples: `sprites/tiles-forest.json` and the library's other tilesets |

`context.mjs bodies` is the live answer: it asks the engine's registry (a body draws once a `layout` generator with its name is registered), so it is right even when this table is not. If it says **coming**, the engine refuses the body with its build item's name: do not fake it with another body. Stop, and put "blocked: <kind> body is build item Bnn" at the top of your report. If it says **built** for a body this table calls coming, the body landed after this file was written: read that build item's row in `docs/data-sprites.md` section 9 and its layout (`node tools/gen.mjs <kind>`), start from an example that draws (`context.mjs examples`), and report the gap as skill drift. (A `pictures` body may carry an `emitters` list of its own for a collect burst or a trail, using the fx generators that exist.)

## 2. The file, top to bottom

Start from the nearest example that **draws today** (`context.mjs examples <type>`; the top-level `tests/fixtures/v2/*.json` are format fixtures, several of which do not draw yet). For a pickup or prop, copy `tests/fixtures/v2/pictures/coin.json`, `crate.json` or this skill's `examples/small-gem.json` (a pickup drawn by a generator other than `token@1`); for icons `icons-food.json`. Here is that coin, whole (it passes `check.mjs`; its one warning, "pop does nothing when all sliders high", is a deliberate limit), with what each part does after it:

```json
{ "format": "loadout-sprite", "version": 2, "id": "coin", "name": "Coin",
  "blurb": "A spinning pickup. Make it a gold coin, a shop token or a gem medal.",
  "meta": { "type": "pickup", "role": "items/pickup", "themes": ["fantasy", "neutral"], "gameTypes": ["platformer", "turn-based-rpg", "arcade", "puzzle"], "view": "front",
            "words": ["coin", "gold", "money", "cash", "currency", "treasure", "loot", "token", "gem", "medal", "collect", "pickup", "spin", "score"], "license": "draft" },
  "size": [32, 32], "pivot": [16, 30], "grounded": false, "preview": "spin", "styles": ["pixel"],
  "palette": [
    { "id": "metal", "label": "Metal", "default": "#f2c230", "material": "metal", "swatches": ["#f2c230", "#c9ced9", "#cf8a4a", "#6f7a94", "#5fc4a0", "#e8dca8"] },
    { "id": "inlay", "label": "Emblem colour", "default": "#c76a16", "material": "paint", "swatches": ["#c76a16", "#fff0a0", "#e2473f", "#3f86e0", "#3fbf6b", "#a45ee0", "#3a3350"] },
    { "id": "field", "material": "metal", "derive": { "rule": "choose", "when": { "rim": [true] }, "then": { "rule": "tone", "of": "metal", "by": -0.25 }, "else": "metal" } },
    { "id": "gleam", "material": "metal", "derive": { "rule": "mix", "of": { "rule": "ramp", "of": "metal", "tone": "light" }, "with": "shine", "amount": 0.6 } },
    { "id": "inlay-ink", "material": "paint", "derive": { "rule": "apart", "of": "inlay", "from": [["field", 0.2]], "least": 0.2 } },
    { "id": "shine", "default": "#ffffff", "material": "light", "detail": true } ],
  "controls": [
    { "key": "size", "kind": "range", "label": "Size", "lo": "Small", "hi": "Big", "default": 0.5 },
    { "key": "thickness", "kind": "range", "label": "Thickness", "lo": "Thin", "hi": "Chunky", "default": 0.4 },
    { "key": "shape", "kind": "choice", "label": "Shape", "options": ["round", "octagon", "square"], "default": "round" },
    { "key": "emblem", "kind": "choice", "label": "Emblem", "options": ["star", "heart", "plain", "hole", "gem"], "default": "star" },
    { "key": "rim", "kind": "toggle", "label": "Raised rim", "default": true },
    { "key": "sparkle", "kind": "toggle", "label": "Sparkle", "default": true },
    { "key": "inlay", "kind": "colour", "label": "Emblem colour", "when": { "emblem": ["star", "heart", "gem"] } },
    { "key": "bob", "kind": "range", "label": "Float", "lo": "Still", "hi": "Floaty", "default": 0.5, "group": "Motion" },
    { "key": "pop", "kind": "range", "label": "Pop height", "lo": "Low", "hi": "High", "default": 0.5, "group": "Motion" },
    { "key": "speed", "standard": "speed" } ],
  "body": { "pictures": {
    "nodes": [ { "id": "coin", "parent": null, "at": [16, 16] } ],
    "draw": [
      { "id": "face", "gen": "token", "v": 1, "on": "coin", "at": [0, 0.5],
        "size": { "from": "size", "map": [[0, 10], [1, 19]], "round": "px" },
        "thick": { "from": "thickness", "map": [[0, 2], [1, 5]], "round": "px" },
        "shape": { "from": "shape", "pick": { "round": "round", "octagon": "octagon", "square": "square" } },
        "emblem": { "from": "emblem", "pick": { "star": "star", "heart": "heart", "plain": "plain", "hole": "hole", "gem": "gem" } },
        "rim": { "from": "rim", "pick": { "true": true, "false": false } },
        "metal": "metal", "field": "field", "gleam": "gleam", "inlay": "inlay-ink", "shine": "shine" },
      { "kind": "outline", "paint": "ink" },
      { "id": "sparkle", "gen": "gleam", "v": 1, "on": "coin", "clip": ["spin"], "when": { "sparkle": [true] },
        "at": [ { "from": "size", "map": [[0, 3.25], [0.7222, 6.5], [1, 6.9]], "round": "px" }, { "from": "size", "map": [[0, -3.25], [0.7222, -6.5], [1, -6.9]], "round": "px" } ],
        "paint": "metal.light", "core": "shine" } ],
    "motion": [
      { "gen": "pickup.bob", "v": 1, "clip": ["spin"], "height": { "from": "bob", "map": [[0, 0], [1, 2]] } },
      { "gen": "pickup.spin", "v": 1, "node": "coin", "clip": ["spin"] },
      { "gen": "pickup.collect", "v": 1, "node": "coin", "clip": ["collect"],
        "pop": { "from": "pop", "map": [[0, 0], [1, 1]] }, "room": { "from": "size", "map": [[0, 7.9], [1, 2.9]] } } ],
    "emitters": [
      { "id": "burst", "gen": "pickup.burst", "v": 1, "on": "coin", "at": [0.25, 0.5], "reach": { "from": "size", "map": [[0, 8.1], [1, 12.6]] },
        "sparkle": { "from": "sparkle", "pick": { "true": true, "false": false } }, "paint": "metal", "bright": "metal.light", "core": "shine" } ] } },
  "clips": {
    "spin": { "frames": 8, "fps": 10 },
    "collect": { "frames": 8, "fps": 14, "loop": false, "frameEdits": { "4": { "flash": true } },
      "keys": [ { "t": 0, "ease": "hold", "emit": { "burst": { "amount": 0 } } }, { "t": 0.6, "ease": "linear", "emit": { "burst": { "amount": 0.1111 } } },
                { "t": 1, "emit": { "burst": { "amount": 1 } } } ],
      "sounds": [ { "sound": "coin-pickup", "frame": 1 } ] } } }
```

And the small gem (`examples/small-gem.json` beside this file; it passes `check.mjs` with no warning), made by the first fresh-agent test and corrected: everything that moves is centred on one node (`gem` at [16, 17]) and drawn `on` it at [0, 0], so `pickup.collect@1` dips and pops the stone with the standard `pop` binding even though only the coin's `token@1` also shrinks and flips; the stone is `gem.cut@2` (version 1 draws only at 0 and up, so a gem centred on its node showed as a quarter); the collect hides it with a key at frame 5; the burst emitter sits on the node; `body` is the gem's colour control. Its id is `small-gem` because `sprites/gem.json` is the library's gem and the brief asked for a new pickup, not a redraw:

```json
{ "format": "loadout-sprite", "version": 2, "id": "small-gem", "name": "Small gem",
  "blurb": "A small cut gem that floats and sparkles until it is picked up. Change its cut, size, cut lines, sparkle and colour.",
  "meta": { "type": "pickup", "role": "items/pickup", "themes": ["fantasy", "neutral"], "gameTypes": ["platformer", "arcade", "puzzle"], "view": "front",
            "words": ["gem", "jewel", "diamond", "crystal", "ruby", "emerald", "treasure", "loot", "collect", "pickup", "shiny", "score"], "license": "draft" },
  "size": [32, 32], "pivot": [16, 30], "grounded": false, "preview": "idle", "styles": ["pixel"],
  "palette": [
    { "id": "body", "label": "Gem", "default": "#e0457a", "material": "magic", "swatches": ["#e0457a", "#3f86e0", "#3fbf6b", "#a45ee0", "#f2c230", "#5fd0e0"] },
    { "id": "spark", "material": "light", "derive": { "rule": "mix", "of": { "rule": "ramp", "of": "body", "tone": "light" }, "with": "shine", "amount": 0.6 } },
    { "id": "shine", "default": "#ffffff", "material": "light", "detail": true } ],
  "controls": [
    { "key": "size", "kind": "range", "label": "Size", "lo": "Small", "hi": "Big", "default": 0.5 },
    { "key": "shape", "kind": "choice", "label": "Cut", "options": ["diamond", "emerald", "round", "shard", "heart"], "default": "diamond" },
    { "key": "facets", "kind": "toggle", "label": "Cut lines", "default": true },
    { "key": "sparkle", "kind": "toggle", "label": "Sparkle", "default": true },
    { "key": "body", "kind": "colour", "label": "Gem" },
    { "key": "bob", "kind": "range", "label": "Float", "lo": "Still", "hi": "Floaty", "default": 0.5, "group": "Motion" },
    { "key": "pop", "kind": "range", "label": "Pop height", "lo": "Low", "hi": "High", "default": 0.5, "group": "Motion" },
    { "key": "speed", "standard": "speed" } ],
  "body": { "pictures": {
    "nodes": [ { "id": "gem", "parent": null, "at": [16, 17] } ],
    "draw": [
      { "id": "stone", "gen": "gem.cut", "v": 2, "on": "gem", "at": [0, 0],
        "r": [ { "from": "size", "map": [[0, 5], [1, 10]], "round": "px" }, { "from": "size", "map": [[0, 4], [1, 9]], "round": "px" } ],
        "cut": { "from": "shape", "pick": { "diamond": "diamond", "emerald": "emerald", "round": "round", "shard": "shard", "heart": "heart" } },
        "facets": { "from": "facets", "pick": { "true": true, "false": false } },
        "paint": "body", "shine": "shine" },
      { "kind": "outline", "paint": "ink" },
      { "id": "sparkle", "gen": "gleam", "v": 1, "on": "gem", "clip": ["idle"], "when": { "sparkle": [true] },
        "at": [ { "from": "size", "map": [[0, 5], [1, 10]], "round": "px" }, { "from": "size", "map": [[0, -4], [1, -10]], "round": "px" } ],
        "peak": 0.75, "paint": "spark", "core": "shine" } ],
    "motion": [
      { "gen": "pickup.bob", "v": 1, "clip": ["idle"], "height": { "from": "bob", "map": [[0, 0], [1, 2]] } },
      { "gen": "pickup.collect", "v": 1, "node": "gem", "clip": ["collect"],
        "pop": { "from": "pop", "map": [[0, 0], [1, 1]] }, "room": { "from": "size", "map": [[0, 8], [1, 5]] } } ],
    "emitters": [
      { "id": "burst", "gen": "pickup.burst", "v": 1, "on": "gem", "at": [0, 0], "reach": { "from": "size", "map": [[0, 8], [1, 12]] },
        "sparkle": { "from": "sparkle", "pick": { "true": true, "false": false } }, "paint": "body", "bright": "spark", "core": "shine" } ] } },
  "clips": {
    "idle": { "frames": 8, "fps": 10 },
    "collect": { "frames": 8, "fps": 14, "loop": false, "frameEdits": { "4": { "flash": true } },
      "keys": [ { "t": 0, "ease": "hold", "emit": { "burst": { "amount": 0 } } },
                { "t": 0.71, "ease": "linear", "hide": ["stone"], "emit": { "burst": { "amount": 0.1111 } } },
                { "t": 1, "emit": { "burst": { "amount": 1 } } } ],
      "sounds": [ { "sound": "gem-pickup", "preset": "Gem", "frame": 1, "volume": 0.7 } ] } } }
```

**Top.** `format`, `version` 2, `id` (lowercase, digits, dashes; the file name; **check it is not taken**: `ls sprites/<id>.*`. An existing `sprites/<id>.json` holding it means a redraw only when the brief says redraw (section 8); for a new sprite pick another id, as the small gem is `small-gem` beside the old `gem`, and say so in the report), `name`, `blurb` (one sentence: what it is and what can be changed), `meta` (Contract 1, style guide §13: `type`, `role`, `themes`, `gameTypes`, `view`, 6 to 14 lowercase `words` people would type, `license: "draft"`; never measured facts), `size` and `pivot` from style guide §1 (a pickup is 32x32, pivot [16, 30]), `grounded: false` for anything that floats, `preview` (the card's clip), `styles: ["pixel"]`. Optional: `versions` (up to 24 ready-made settings `{ name, params }`, names of at most four everyday words), `materials: { "rest": "<material>" }`.

**Palette and materials.** Up to 12 colour slots. Every paint in the file is a slot ref, never a hex: `"metal"`, a tone `"metal.light"` / `.dark` / `.deep` / `.far`, `"ink"` (the outline colour) or `"clear"`. Every slot declares its `material` (`warning`, `signal`, `skin`, `fire`, `sky`, `water`, `plant`, `earth`, `wood`, `light`, `magic`, `stone`, `metal`, `cloth`, `interface`, `paint`): whole-bundle looks (Contract 7) recolour by it. A slot with `label` and `default` gets a colour control when a control names it (`"kind": "colour"`, `"key"` = the slot id); `swatches` lists hex colours or `{ "palette", "family", "lead" }` (style guide §3). `"detail": true` is for eyes and glints: no control. White is not built in: declare a `shine` slot. A `derive` slot is worked out from others by a colour rule (`tone` `{ of, by }`, `mix` `{ of, with, amount }`, `ramp` `{ of, tone }`, `apart` `{ of, from, least }`, `standOut` `{ against, from }`, `bandTone` `{ of, under }`, `choose` `{ when, then, else }`, and for tilesets and solids `textureTone` `{ of, against? }`, `textureLight` `{ of, against?, from? }`, `stoneShade` `{ of, with, start? }`, `faceTone` `{ of, face, tone }`, and for interface pieces `lifted` `{ of, against, beside }`, `grey` `{ of }`, `ifLight` `{ of, above, then, else }`: the list and what each does is `COLOUR_RULES` in `engine/data-rules.js`); it has no control. Two colours that touch must stay apart in lightness (0.2 or more) or looks merge them.

**Controls** (≤ 48): `range` (`lo` and `hi` end words, `default`, optional `min`, `max`, `step`), `choice` (`options`, `default`), `toggle`, `colour`, and `{ "key": "speed", "standard": "speed" }`, which scales every clip's fps from 0.65x to 1.45x. All take `label`, `group` (`Look`, `Colors`, `Motion`), `when`. Labels are everyday words, never "params", "offset", "index", "amplitude" (style guide §10 lists the standard keys per kind: a pickup has `size`, `shape`, `sparkle`, `body` (its main colour: a `colour` control on a slot named `body`), `bob`, `pop`, `speed`). **A control does nothing by itself**: it acts only where a binding, a `when`, a part or `scales` names it, and the validator refuses one nothing names. A motion slider (Bounce, Stride, Wobble, Rattle) acts through a clip's `travel` (below). Every control must change at least 12 pixels or so (style guide §10, "How big a change must be").

**Lookup tables (bindings).** Any number argument can be `{ "from": "<control>", "map": [[in, out], ...], "round": "px" | "half" | "none" }`: straight lines between the points, inputs ascending, at least two points. A slider runs 0 to 1, so `[[0, 10], [1, 19]]` means "10 at the low end, 19 at the high end". Any word, flag or other value can be `{ "from": "<control>", "pick": { "<option>": value } }` (a toggle's options are `"true"` and `"false"`). One control per binding: where two controls meet, the generator takes both as separate arguments.

**Conditions.** `when` on a control, a shape, a stamp, a generator call, an emitter, a sound cue or a part: `{ "key": [values] }` means all of these hold; a list of such objects means any one. Values are always lists (`[true]`). A draw item, motion or emitter may also carry `"clip": ["spin"]` (only in these clips). Copy a specification's `when`s exactly.

**Parts** (Contract 3): `"parts": { "weapon": { "label": "Weapon", "params": ["weapon", "swordLength"], "none": "none", "socket": "hand", "shapes": ["sword"] } }`. The first param is the selector; `shapes` are the ids that vanish when it is off; `socket` names a point (`points` at the top: `{ "id", "on", "at", "angle" }`).

**The pictures body.** `nodes`: a small tree `[{ "id", "parent", "at": [x, y], "turn"?, "scale"? }]`; everything drawn `on` a node is in that node's own coordinates (0, 0 = the node). `draw`: shapes, stamps, generator calls and `{ "kind": "outline", "paint": "ink" }`, painted in order; put the outline after the body and light (glints, sparkles, glow) after the outline. `per`: `{ "<clip>": { "draw", "show", "hide" } }`, extra or hidden items in one clip (a chest's `open`). `motion`: motion generators for the whole picture or one `node`, each with a `clip` list. A motion moves its node, and with it everything drawn `on` that node, whatever generator drew it: `pickup.collect@1` on the gem's node dips and pops the gem, and its `pop` binding works for any pickup. Besides the move, a motion hands extra values (spin, shrink, squash, glint, lean) only to the generators it was made for: `pickup.spin@1` and `pickup.collect@1` give `token@1` its turn, shrink and glint, `prop.rock@1` gives `container@1` its lean (`MOTION_TARGETS` at the top of `engine/gen/motion.js`). So a gem pops with `pickup.collect@1` but does not shrink: hide it with a key at the flash (the small gem). `pickup.spin@1` does nothing visible to a node with no `token@1` on it. **A whole node's size and squash** (follow-up F4): a motion may give its node a stretch, and then everything drawn on that node and under it, shapes, stamps (resampled pixel for pixel), rects and generator output, is drawn that much bigger about the node's origin: `node.size@1` (`scale`, `wide`, `tall`, each bindable: a size, or a two-axis size a node's own `scale` cannot hold) and `pickup.collect.whole@1`. A frame the stretch would take past 8,192 stamp pixels keeps the stamps it grows at their own size and warns (`dataFrameList` warnings; `check.mjs` does not show them), so do not grow big stamps: a 24 x 24 stamp at 4 is already over. A node's own `scale` (or a key's) still only moves stamps and generator output (released behaviour), so never put a stamp-drawing generator on a node scaled by Size; `node.hide@1` hides a node and what is under it wherever its `when` holds. For other motion use clip keys (`root`, `nodes`, `hide`, below) or add a motion version (section 9). `emitters`: `{ "id", "gen", "v", "on"?, "at", ...args }`; an emitter that some clip's keys give an `amount` is off wherever its amount is 0 (the coin's `burst` stays off in `spin`). `fit` and `pictures`: icon sets (see `icons-food.json`).

**Shapes** (all with `paint`, optional `z`, `group`, `when`, `hidden`, `glow`, `shade`, `light`): `ellipse` `{ at, r: [rx, ry], turn? }`, `rect` `{ at, size }` (moved, never turned), `poly` `{ points }`, `capsule` `{ from, to, r }`, `limb` `{ from, to, width }` (arms, legs, handles: never shimmers; **on a rig, between bones only**: in a pictures body a limb on a node with no length is refused, use `line` or `capsule`), `line` `{ from, to, thick? }`, `arc` `{ at, r, a0, a1, thick? }`, `ring` `{ at, r, thick? }`, `dot` `{ at, size? }`, `dither` `{ area, pattern, amount }`, `bands` `{ area, dir, stops }`, `text` `{ font, text, at }` (`font` a font piece: `font:chunky@1`, `font:slim@1`, `font:rounded@1`, `font:serif@1`), `use` (a piece). `shade: 1` gives a shadow band away from the light (2 on shapes wider than 14 px, 0 flat; **a shape with no `shade` on a metal slot is shaded by default, so write `"shade": 0` on a 1 to 2 px wide metal shape**, or it comes out wholly dark); `light: 1` a highlight band (metal, glass, wet or glossy only). Shapes in one `group` paint as one body (one shadow band, no seams). Angles are degrees, 0 down, 90 picture-right, 180 up. Light comes from the top right.

**Clips and keys.** `"<name>": { "frames", "fps", "loop" (default true), "label"?, "keys"?, "frameEdits"?, "sounds"? }`. Names, frame counts and fps are style guide §4 per kind (a pickup: `idle` 8 frames at 10 fps looping, then `collect` 8 at 14, not looping, white flash on frame 4, sound on frame 1; the old coin keeps `spin`). The first clip is the one the checker measures. A key is `{ "t": 0..1, "ease": "smooth" | "linear" | "in" | "out" | "hold", ... }` holding only what it changes; keys blend between each other. In a pictures body a key may set `nodes` (`{ "lid": { "turn": -40, "move": [0, -2], "scale": 1.1 } }`), `root` (`[x, y]`, the whole picture), `emit` (`{ "burst": { "amount": 1 } }`), `show` / `hide` (ids), `swap` (stamp variants). `frameEdits` are one-frame changes: `{ "4": { "flash": true, "nudge": [0, -1], "swap": { "eye": "blink" }, "show": [], "hide": [] } }`. In a one-shot, frame f sits at `t` = f / (frames - 1), so in 8 frames frame 4 is t 0.57 and frame 5 is t 0.71. **A pickup's collect**: `pickup.collect.whole@1` (it squashes wide on frame 1 and stretches tall on frame 2 everything on the node, swells, shrinks and hides it once under 0.3 of its size; `wide` and `tall` cap the squash where the frame is tight; the heart and the bomb use it) or, for a pickup drawn by `token@1` (the coin), `pickup.collect@1`, in `motion` on the pickup's node with the standard `pop` binding (`"pop": { "from": "pop", "map": [[0, 0], [1, 1]] }`, and `room` so the pop keeps a 1 px border at every size). It dips and pops the node; a drawing that is not `token@1` does not shrink, so the white flash stays on frame 4 (`frameEdits` `"4"`), the key that `hide`s the body is at t 0.71 (frame 5), and the burst emitter's `emit` amount runs from 0.11 there to 1 at t 1. Clip keys cannot carry a binding, so never move the pickup with `root` keys in a collect: the `pop` slider would reach nothing and the validator refuses it as unused. Keys blend every value from one key to the next, so a value that must stay put until a moment needs `"ease": "hold"` on the key before (the coin holds `burst` at 0 from t 0 to 0.6; without the hold the sparkles show from frame 1). A key's `ease` applies to everything in it and no two keys share a `t`, so put the zero of such a value on the last key before it starts, not on the first. In a loop, `t` runs 0 to just under 1 and the last frame must lead back into the first; a one-shot runs 0 to exactly 1 and ends on what is left (two or more pixels: no frame is ever empty).

**Motion sliders: `travel`** (rig, pictures and emitters bodies; `docs/data-sprites.md` 2.2 "Motion sliders"). Keys cannot carry a binding, but a clip can say how far its keys move by a setting: `"travel": [{ "tracks": ["root.1"], "about": "least", "by": { "from": "bounce", "map": [[0, 0.29], [0.5, 1], [1, 1.71]] } }]` makes every number on those tracks move `by` times as far from the pivot as the keys say. A track is a key field, optionally with an id and an axis: `root.1` (down), `ik.legF.0`, `bones.armF`, `stretch.<bone>`, `nodes.<node>.turn` / `.move.1` / `.scale`, or a whole field (`bones`); never `emit`. `about`: `first` (default), `mid` (a swing), `least` / `most` (an end of the travel: a crouch from standing, a foot's lift from the ground), or a number; `"side": "below"` (or `"above"`) moves only the values on that side of the pivot (a hop's lift without its crouch). Put exactly 1 at the slider's middle (three points), so the default draws as without it; `by` runs 0 to 3. It works on a clip taken from a base too: `"walk": { "from": ..., "travel": [...] }`; `"hurt": { "travel": [...] }` alone only for a clip `extends.clips` takes, otherwise write `"hurt": { "from": "hurt", "travel": [...] }` (without `from` it replaces the base's clip). **On a baked base never straighten a planted leg** (the boot is lost): Bounce only deepens a crouch (below the middle `about: most`, above it `about: least`, two entries), a hop scales `root.1` with `"about": 0, "side": "below"` and carries the feet (`ik.legF.1`, `ik.legB.1`, `"about": -1`, same side and factor), and the top factor stays where the tallest look is inside the frame; render both ends (`--set bounce=0`, `=1`) and run `tools/check.mjs`. A path no key moves (a mistyped `ik.lefF`) is only warned of when the sprite is resolved. Scale the bone or IK target that drives a motion, not a base's helper bones (`thighFa`, `armFd`). Worked example: `tests/fixtures/person-side/knight-travel.json` (the Hero's Bounce and Stride, each factor the code's `lerp(lo, hi, setting) / lerp(lo, hi, 0.5)`).

**Sounds** are per clip: `"sounds": [{ "sound": "<id>", "frame": 1, "preset": "<style>", "volume": 0.7, "when": {...} }]`. Every id and style must exist: `node -e "const fs=require('fs');for(const f of fs.readdirSync('sounds')){const p=JSON.parse(fs.readFileSync('sounds/'+f,'utf8'));console.log(p.id,p.loop?'(loop)':'','|',Object.keys(p.presets||{}).join(', '))}"`. Missing one: leave that cue out and report "blocked: sound `<id>`"; making it is `SOUND.md`'s job.

## 3. Pixel detail: stamps

A body is shapes; detail is stamps. A **stamp** is a small block of pixels placed on a node, moved, swapped or mirrored but **never turned** (a turned pixel block is mush):

```json
{ "id": "eye", "kind": "stamp", "on": "head", "at": [4, 1], "anchor": "tl", "rows": ["a", "a"], "key": { "a": "eye", "b": "skin.dark" }, "z": 30,
  "variants": { "blink": [".", "b"] } }
```

`rows` are strings of at most 32 characters, at most 32 rows; `.` (or a space) is see-through and every other character is a key into `key`, whose values are paint refs. `anchor` is which corner or edge sits on `at` (`tl`, `tc`, `tr`, `cl`, `c`, `cr`, `bl`, `bc`, `br`; default `tl`). `variants` are other row sets of the same stamp, chosen by a key's or frame edit's `swap` (`"swap": { "eye": "blink" }`, as the knight blinks on frame 3 of its attack) or a `pick` binding. `mirror: "x"` flips it. Use stamps for eyes, buckles, rivets, a glint, a facet edge: anything one or two pixels wide that a shape would draw as a speck or a shimmer. Use shapes for anything that bends, grows with a slider or turns. Keep all stamps within the frame (an error otherwise) and under 8,192 pixels in all.

## 4. Generators and pieces

A generator is a named, versioned function of the framework that returns shapes; you call it wherever a shape may stand (or in `motion`, `emitters`, a colour rule, a `place`): `{ "gen": "<id>", "v": <n>, ...arguments }`, plus the call fields `id`, `on`, `z`, `when`, `clip`, `group`, `hidden`, `glow`, `shade`, `light`. Find them, then read one before you use it:

```
node tools/gen.mjs                            # every generator: id@v, family, what it draws
node tools/gen.mjs gem.cut                    # its arguments: type, range or options, default, what each is; a call to copy
node tools/gen.mjs gem.cut --sheet            # out/gen-gem.cut@2.png (its newest version): its output across each argument's range (rows printed)
node tools/gen.mjs gem.cut --sheet --try '{"cut": "heart"}'   # a call you are about to write, before you write it
```

The sheet fills `(needed)` arguments with sample values that may not suit a small frame: pass your own with `--try`. In `--try` write the paints as your asset names them (`"paint": "body"`, `"body.light"`, a colour rule, the paints of a call inside a list): each name the sheet does not have becomes a sample colour (`shine` white), and the first line printed (`paints ...`) says which. **Look at the sheet of the call you will write.** The sheet draws in frame pixels with no node, so for a call you will put `on` a node at [0, 0], try it at the cell's middle (`"at": [16, 16]`): every generator's newest version draws the same on a node as in frame pixels (`tests/unit/gen-node-origin.test.mjs` holds each to it). `context.mjs generators` marks the two exceptions: **old** versions that draw only at 0 and up (`gem.cut@1`, `glint@1`, `icon.paint@1`, `icon.line@1`, `icon.glint@1`: write the version it names, `gem.cut@2` and so on; inside an icon set's `fit` the icon versions draw the same, and `@1` costs less there), and **frame pixels only** generators (`pickup.burst@1` and `chunks@1`: name them in `emitters`, which the pictures layout puts on the node's frame for you; `icon.fit@1`: an icon set's `fit`). So centre a pickup on its node and draw it at [0, 0]; never fall back to frame coordinates with no `on`, which loses the node's motions.

**A glint across a generated stone.** `glint@2`'s `within` takes plain shapes and generator calls: the band is kept to the pixels the call paints. Write the stone's call again in `within` (same arguments and bindings, no `id` or `on`), in the glint's own coordinates, and draw the glint after the stone and before the outline:

```json
{ "id": "glint", "gen": "glint", "v": 2, "on": "gem", "at": [0, 0], "r": { "from": "size", "map": [[0, 5], [1, 10]], "round": "px" }, "phase": -0.2, "width": 0.22,
  "within": [ { "gen": "gem.cut", "v": 2, "at": [0, 0], "r": [ { "from": "size", "map": [[0, 5], [1, 10]], "round": "px" }, { "from": "size", "map": [[0, 4], [1, 9]], "round": "px" } ],
                "cut": { "from": "shape", "pick": { "diamond": "diamond", "emerald": "emerald", "round": "round", "shard": "shard", "heart": "heart" } }, "paint": "body", "shine": "shine" } ],
  "paint": "shine" }
```

Its `phase` is keyable, and `pickup.sheen@1` (in `motion`) moves a `glint@2` call on its node: outside the sweep the band rests at `from` / `to`, and a slanted band reaches further than `phase x r`, so send it fully off the shape. Without that motion a glint is a still band. An argument marked `(needed)` must be given; any other may be left out. A number argument may be a binding. Unknown arguments, values outside the range and unknown ids or versions are refused before anything draws, with a message naming the allowed ones. Always write the version you looked at (`"v": 1`): a released version never changes its output, a new look is a new version. `keyable` arguments are those clip keys and motions may move. Motion generators (`pickup.bob@1`, `pickup.spin@1`, `pickup.collect@1`, `prop.rock@1`) go in `motion`, not in `draw`.

A **piece** is shared data in `pieces/<kind>-<name>.v<v>.json`: `base` (a whole rig with its clips), `part` and `held` (hair, helmets, swords), `skin`, `material`, `font`, `stamp`. Use one with `{ "kind": "use", "use": "part:hair", "v": 1, "on": "head", "args": {...}, "paint": { "hair": "hairTone" } }` (the piece's slot to your slot), `"extends": { "use": "base:person-side", "v": 1 }` (a rig), `"place": { "use": "stamp:clod", "v": 1 }`, `"font": "font:chunky@1"`. `node tools/piece.mjs` lists them, `node tools/piece.mjs <kind:name>` shows slots, args and a `use` to copy, `--sheet` draws it with each slot in pink. If `pieces/` is empty, no piece exists yet: draw it yourself, or add the piece (section 8).

## 5. Rig bodies (characters and creatures)

The committed rig example is `tests/fixtures/v2/knight.json`: it `extends` the base piece `base:person-side`, adds an `eye` stamp with a `blink` variant and a `buckle` stamp, puts `part:hair`, `part:helmet-plumed` and `held:sword` on bones with `use` (hair only `when` headgear is none or crown), scales bones with a `height` slider (`"scales": { "bones": [...], "by": [0.85, 1.15] }`), keeps a renamed option with `"was": { "plumed helmet": "helmet" }`, and takes its clips from the base: `"walk": { "from": "walk", "sounds": [...] }`. `base:person-side` and its part and held pieces exist now (B16a2; `node tools/piece.mjs`), and the library's side-view people are data on it (`sprites/knight.json`, `wizard.json`, `spear-goblin.json`, `bone-soldier.json`, `rogue-battler.json`, `road-bandit.json`, migration M6): a sprite whose code posed the rig its own way gives a clip its own `keys` (key poses of the base's bones; no committed tool bakes them from a code sprite yet), not `from`. The base takes 59 of the 64 bones and nodes a rig draws (44 bones, 15 nodes), so a sprite on it has room for 5 of its own; more are dropped without an error today. When no base fits, write the bones yourself, starting from a studio template:

```
node --input-type=module -e "import { studioTemplate, STUDIO_TEMPLATE_IDS } from './rigs/studio-templates.js'; const t = studioTemplate(process.argv[1] ?? 'blob'); t.version = 2; t.body.rig.version = 2; console.log(JSON.stringify(t, null, 1))" two-legs > sprites/<id>.json
```

Templates: `two-legs`, `four-legs`, `crawler`, `flyer`, `blob`, `blank`, `topdown-person`, `topdown-beast`. Then change `id`, `name`, `blurb`, `meta`, the proportions, shapes and colours (the template's `colours` may be kept or replaced by a v2 `palette`), and add stamps on bones (`"on": "<bone>"`). A bone is `{ "id", "parent", "at" (roots), "from" (0..1 along the parent), "angle" (relative to the parent), "length" }`; a node is a bone with `"length": 0` (a lid, a floating eye). A rig clip's keys set `bones` (angles), `ik` (targets `[x, y]` for two-bone chains, feet planted), `root`, `stretch`, `show` / `hide`, `swap`. Walks put every foot on the ground on frames 0 and 4 and cue footsteps there; `hurt` starts on a white frame (`"flash": true`), `die` ends lying on the ground. A top-down rig has `directions` overlays (`down`, `up`, `side`) and clips `<action>_<down|up|side>` (style guide §5).

## 6. Check

```
node tools/check.mjs <id> --no-cache          # about a second; errors fail, warnings are for your eyes
```

It first validates the file (every field, reference, generator argument and cap; messages name the place: "Draw 2: ...", "Clip "collect", key 1: ..."), then runs the quality bar (`docs/quality-bar.md` §1, all of it) on every clip at the defaults, all low, all high, every option and random looks, then the data checks: a stamp wholly outside the frame (error), a palette slot nothing ever paints (error), the cost of the heaviest frame (warning above half the budget). Fix every error, read every warning.

| Message contains | Fix |
|---|---|
| `is not an argument of`, `is missing`, `there is no generator` | `node tools/gen.mjs <gen>` and write the call it shows; a generator that does not exist is section 8 |
| `nothing uses it, so it would do nothing` | name the control in a binding, a `when` or a part, or take it out |
| `slot "x" is never painted` | paint something with it (directly, or through a derived slot that is painted, as the coin's `inlay` reaches the token through `inlay-ink`), or take it out |
| `changes at most N pixels`, `does nothing when ...` | a bigger table range, or the `when` the message suggests |
| `drawing touches the frame edge`, `wholly outside the frame` | keep a 1 px border at every setting: smaller table ends, or a `room` argument |
| `loop seam`, `last frame equals first frame` | a loop's motion must come back to frame 0; generators given the clip phase close by themselves |
| `lowest pixel is at y=...` | stand on the pivot line in the first clip, or `grounded: false` |
| `shapes merge under the "..." look` | move one of the two named colours 0.2 or more apart in lightness |
| `meta: ...`, `sound "x" ... is not in sounds/` | do what it says, with exact ids |
| `cannot be loaded` | the rest of the line is the validator's list: fix the first item first |

## 7. Look, and fix what you see

```
node tools/render.mjs <id>                    # out/<id>-clips.png (every frame, 4x), -variants.png (default, low, high, 5 random), -choices.png
node tools/render.mjs <id> --clip collect     # one clip at 8x, to count frames
node tools/render.mjs <id> --scale 1          # game size: would a stranger name it in two seconds?
node tools/render.mjs <id> --set size=1 --set shape=heart
node .claude/skills/sprite-forge/sheets.mjs looks <id>   # out/<id>-looks.png: the whole-bundle looks (Original, Sunset, Night, Mono, Handheld)
```

Open each PNG with the Read tool and look at it. Every run overwrites the same files: copy a sheet first if you want to compare. Look for: **reads** at game size; **size** (style guide §1: a pickup's drawing spans half to three quarters of its frame along its longer side, at least a third with everything low); **craft** (unbroken outline, parts apart by value, colour count within §2, no stray pixels, no flat unshaded areas); **motion** (anticipation and follow-through, nothing pops or detaches, loops lead back into frame 0, idle moves 1 to 2 px, hits and jumps 3 or more); **range** (every row of variants and choices is the same thing and reads); **light on light** (a sparkle in `<slot>.light` over the same body vanishes: use `shine`, or put it where it meets the outline or the background); **originality** (§13: not a famous design). Expect three to six rounds of check, look, fix.

## 8. No old code sprites

No code sprite is left in the project (`sprites/` holds data, the build refuses a code file, and the frozen copies and the old-code records are deleted). A new data sprite does not have to match any old drawing: make it as in sections 1 to 7 and check it on its own (section 6).

## 9. Add to the framework when something is missing

When no generator or piece does what the asset needs, add one, **never** put the maths in the asset. Contract 11 and Contract 15 rule 8: additive, test first, reviewed as framework code.

**A generator.** Its home is `engine/gen/<family>.js` (the families are `context.mjs generators`; a new family is a new module plus one import line at the end of the list in `engine/gen/index.js`). Read the module and `engine/gen/registry.js`'s header first, and port from an existing `engine/*.js` helper when one draws the thing (the about line should say "Port of ..."). The test comes first, in `tests/unit/gen-<family>-<topic>.test.mjs`:

```js
import test from 'node:test';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

test('shimmer@1 passes the goldens harness', () => {   // an illustration: shimmer is not a real generator
  checkGeneratorContract(registry, registry.generator('shimmer', 1), { cases: [
    { args: { at: [16, 16], paint: 'gold', core: 'shine' } },
    { args: { at: [8, 20], size: 2, paint: 'gold.light', core: 'shine' }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [24, 10], size: 0, paint: 'gold', core: 'shine' } } ] });
});
```

Run it and see it fail (`node --test tests/unit/gen-<family>-<topic>.test.mjs`). Then append to the family module:

```js
/** shimmer@1: what it draws in one sentence, then how (its arguments, what it is a port of). */
export const shimmer = defineGenerator({
  id: 'shimmer', v: 1, family: 'shine',
  about: 'One plain sentence a maker reads in tools/gen.mjs.',
  args: { at: point({ about: 'Where it sits' }), size: count(0, 3, { default: 1, about: 'How big' }), paint: paint({ about: 'Its colour' }), core: paint({ about: 'Its centre' }) },
  cost: (a) => 1 + 4 * a.size,            // an upper bound on how many primitives run returns, monotone in each number
  run: (a, ctx) => [{ kind: 'dot', at: a.at, paint: a.core }],   // returns primitives; never a surface, clock or Math.random
  keyable: ['size'],                      // arguments clip keys and motions may move
});
```

Rules: `run` sees only its arguments and `ctx` (`t`, `frame`, `frames`, `loop`, `size`, `clip`, `direction`); variety comes from a `seed` argument through `engine/motion.js` `hash`; argument types are `px`, `share`, `count`, `angle`, `seed`, `word`, `flag`, `paint`, `paints`, `profile`, `point`, `shape`, `place`, `primitives`, `struct` (`engine/gen/args.js`), each with `about`; in a loop, `t` = 0 and 1 must draw the same; it must draw the same centred on a node at its origin as in frame pixels, so never keep only the pixels from 0 to `ctx.size` (`tests/unit/gen-node-origin.test.mjs` runs every registered generator both ways; a generator that needs the frame's edges is an effect named in `emitters` and is listed in `FRAME_GENERATORS` in `engine/gen/index.js`). Pin its output: `GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-<family>-<topic>.test.mjs` writes `tests/fixtures/gen/<id>@<v>.json` once and never overwrites it; run the test again without the variable. Every export needs its one-line doc comment (`node --test tests/unit/api-descriptions.test.mjs`). Look at it with `node tools/gen.mjs <id> --sheet`. Then run your family's tests and `node tools/check.mjs` on every data sprite that names the family.

**Never change a released generator's output.** A different look is a new version (`v: 2`) declared beside the old one, which stays until no asset names it. Other builders edit the same modules at the same time: re-read the file right before you edit, append at the end, never reformat or reorder.

**A piece.** One file `pieces/<kind>-<name>.v1.json` in the form `pieces/README.md` shows (`format: "loadout-piece"`, `id`, `v`, `name`, `about`, `slots`, `args`, `body`). Check with `node tools/lib/pieces-index.mjs` and `node tools/piece.mjs <kind:name> --sheet`; it is pinned when released (`--pin`), and a changed look is a new version file.

## Report

In this order: anything **blocked** (a body that is coming, a missing sound); the file path; clips with frame counts; controls and parts; sounds cued; **generators and pieces added** (`id@v`, file, test, golden, that its tests pass); for a redraw the `was` maps written and the redraw sheet; the checker's final output (remaining warnings and why); the sheets you looked at and how many rounds; what still looks weak; what the specification left open and what you decided; anything this skill got wrong or lacked, quoting the line.


## 10. Lessons from the Cloudreach and Thornwood kits (2026-11-25)

Found by the makers of about 60 assets; each is in the documents too, listed here because it cost a round.

**Bodies and bindings**
- **`emitters` body** (`sprites/fx-heal.json`, `cell-burst.json`; `body: { nodes, draw, emitters }`): every emitter needs a `clip` list (the stamp-pixel budget, 8,192, is summed by `clip` / `when` and ignores amounts; over it, lower the largest emitter's size table, never drop an emitter). An emitter that some clip's keys give an `amount` is off wherever its amount is 0: an emitter keyed in `burst` also needs `amount: 1` in the `loop` keys. An `emit` argument that a later key sets (`rise`, `at`) takes that later value on earlier keys that leave it out, even with `"ease": "hold"`: write it on every key. A key's `hide` holds on later keys until a `show`. A frame edit's `flash` whitens only what is drawn before the last `outline` op; emitters and `glow` items stay coloured, and emitters paint after the draw list whenever it holds an `outline` op (`z` only sorts between ops).
- **A `travel` binding with nothing keyed under it changes nothing** (the checker errors): bind to emitter arguments or key the node's tracks.
- **Rig points** are `{ id, on, at, angle? }` with no `when`. A pictures body exposes them through `sprite.sockets(clip, t, p)`; `angle` is degrees in the file and radians in the result. To free room on the base rig (59 of 64 bones and nodes are used), a point on `ground` with `angle: 90` replaces a `lift` / `liftTop` bone pair.
- **Rig clips:** a clip's own `keys` replace an inherited clip's keys while `travel` still applies (`by` may be a plain number); a clip taken with `from` cannot key the sprite's own bones, so a carry pose must work at bone defaults. A key's `stretch` is held to 0.5 to 1.5. Fractional `z` (56.5) is accepted.
- **Outline:** an ink-painted shape under another gets a second ink ring from the rig's final outline on the air side; do not draw an "ink rim" under-shape, it doubles the outline. A `dot` painted `"clear"` cuts a notch. Stamps under `node.size@1` are resampled, so 1 px stamp detail is unsafe on a sized node.
- **`when`** takes slider thresholds (`{ "wear": [{ "atLeast": 0.35 }] }`, docs/data-sprites.md 2.6) and `clip` inside a `when` object.
- **Creatures and show/hide:** an edge-on limb is best swapped by `show` / `hide` of two variants; a capsule in a rig uses `from` / `to` / `r`; `root` moves parentless nodes.
- **Pickup collect:** `pickup.bob@1` also drops by `height`; `pickup.burst@1` leaves three pixels from amount 0.8 on, so a row asking for a different last frame keys the burst back to 0; `pickup.collect.whole@1` has no lift at t 0, so a frame edit's `nudge` gives the 1 px anticipation dip.
- **Templates:** `studioTemplate` still emits v1 colours: replace them with a v2 `palette`.

**Looks and checks**
- **A control whose colour has two prominent shades** (a `magic` glow cyan with both light and dark stamps) can split into two hues under one look, failing `looks-kinds` ("keeping tones apart never splits..."). The `scroll-lectern` fix was a gold default glow; test a new colour control against `node --test tests/unit/looks-kinds.test.mjs` before the review.
- **Sheets:** `render.mjs` writes `-clips`, `-variants`, `-choices` only. For game size use `--scale 1`; there is no tool for a versions or per-style sheet, and none for measuring a drawing: write a scratch script and say so in the report.
- **`check.mjs --help` runs every sprite.** Pass an id.
- **Tests:** `node --test tests/unit/` needs a glob (`tests/unit/*.test.mjs`); `assets-data-quality.test.mjs` can hang under load, run it alone; `generated/` and `vendor/` are build outputs (about 4 h cold): copy them from the main checkout into a worktree or about nine tests fail for no reason.

**Process**
- **Tracks are pinned by the orchestrator**, not the maker, in `tests/unit/compose-tracks.test.mjs` (PINNED plus the sorted generator list). After merging main, a kit change (drums, `along`) changes track output: regenerate each track and re-pin.
- **Review** (docs/review-protocol.md): pass is every criterion at least 2 and a total of at least 11/15; at most two fix rounds; a kit asset that cannot reach it is replaced, not patched forever (kite-ray became gale-gull).
