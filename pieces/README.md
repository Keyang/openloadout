# pieces/

Shared data that many sprites use by name: bases (whole rigs with clips), parts (hair, headgear), held things,
interface skins, tile materials, fonts and stamps (`docs/data-sprites.md` sections 1.2 and 3.3; Contract 15 rule 5).
Pieces are framework: they are reviewed like framework code, and an asset never brings one.

## One file per version

```
pieces/<kind>-<name>.v<v>.json        part-hair-bob.v1.json is the piece part:hair-bob, version 1
```

Kinds: `base`, `part`, `held`, `skin`, `material`, `font`, `stamp` (`engine/pieces.js PIECE_KINDS`). A name is
lowercase letters, digits and hyphens. Nothing else lives here except this file and `_pins.json`.

**A released version never changes.** A changed look is a new file with the next version; the old one stays until
no asset names it. `_pins.json` holds the hash of every released version, and `tests/unit/pieces-index.test.mjs`
fails when a pinned version's content changes or a version has no pin. Pin a version when it is released:

```
node tools/lib/pieces-index.mjs            check every piece and list them
node tools/lib/pieces-index.mjs --pin      pin the versions not pinned yet (never rewrites a pin)
node tools/lib/pieces-index.mjs --write    write generated/pieces.json (the build does this)
```

## What a piece file holds

```json
{ "format": "loadout-piece", "version": 1,
  "id": "part:hair-bob", "v": 1, "name": "Bob", "about": "One sentence that says what the piece is.",
  "slots": [ { "id": "hair", "label": "Hair", "default": "#5a3a22", "material": "plant" } ],
  "args":  { "length": { "type": "px", "lo": 1, "hi": 6, "default": 3 } },
  "made":  { "from": "rigs/humanoid.js" },
  "body":  { "draw": [ ... ] } }
```

`slots` are the piece's own colours. A use colours each one with its `paint` map first, else the sprite's
palette slot of the same id (so a knight that `extends` `base:person-side` with no paint map colours the base's
`skin` with its own `skin`), else the slot's `default`; a slot with none of these is an error (`bindSlots` in
`engine/pieces.js`). Slot ids, arg names and piece names may not be names every object already has (`toString`,
`valueOf`, `constructor`...). `args` are what a use may set. The body field each kind needs: `base` `rig`, `part`
and `held` `draw`, `font` `glyphs`, `stamp` `rows`; `skin` and `material` are checked by their layout's module.
The body's own rules (primitives, generators, paints) are checked by the v2 schema.

## How an asset uses one

```json
{ "id": "hair", "kind": "use", "use": "part:hair-bob", "v": 1, "on": "head", "args": { "length": 4 }, "paint": { "hair": "hair" } }
"extends": { "use": "base:person-side", "v": 1 }
"place": { "use": "stamp:clod", "v": 1, "paint": { "a": "soil.dark" } }
"font": "font:chunky@1"
```

A definition always names the version it was made with. At most 24 different pieces per definition, and at most
64 loaded with what they use in turn, at most 4 deep, with no loop (`engine/pieces.js PIECE_LIMITS`).

## The top-down person (B16b): `base:person-topdown`, `base:person-topdown-walker`, `part:topdown-*`, `held:topdown-*`

Made by `tools/bake-topdown.mjs` from `rigs/topdown.js` (temporary, like `tools/bake-rig.mjs`); never edit these
files by hand: change the baker and run `node tools/bake-topdown.mjs --write`, then `node tools/bake-topdown.mjs`
(every clip against the code rig). Names: the top-down family's parts and held things are `part:topdown-<name>` and
`held:topdown-<name>`, apart from the side-view family's (`part:hair`, `held:sword` ..., B16a).

**Bases.** `base:person-topdown` holds every standard clip of the code rig: `idle`, `walk`, `run`, `attack` (with
nothing held the code rig punches), `shoot`, `cast`, `block`, `dodge`, `talk` as `<action>_<down|up|side>`, and `hurt`
and `die` facing down (the code rig's plain names). `base:person-topdown-walker` is the same rig with `idle_*`,
`walk_*` and `talk` only. A sprite takes every clip of the base it extends (there is no `extends.clips` yet), so a
villager who never fights extends the walker. A sprite that wants a plain clip (`cast`, `block`) names
`{ "from": "cast_down" }`. `die` from its third frame shows `dieTip` / `dieLie`, stamps of the code rig's own
drawing (the code rig tips and turns its whole picture), with every other base shape hidden; the bones are still
laid on the tipped or lying body, so attach points and parts follow it, but a part's stamps do not turn.

**Keys are sparse.** A track (a bone's angle or stretch, the root, a stamp variant, a shape shown) is written only on
the frames where it changes and the frame before, so blending gives every frame its exact value; a track at the rest
or the direction's own value on every frame is left out. Angles are written to 0.01 degree, stretches to 0.0001 (a
coarser stretch moves a sleeve's shade band). Helper bones that only carry a shape the frame hides are free on that
frame. That is what lets 29 clips fit one file (128 KB): 116 KB now, so a later clip set (armed carries) goes in a
base of its own built from the same rig, not into this one.

**Where to hang parts** (bones and screen-aligned nodes; F is the weapon side, B the other):

| Id | What it is | Hang |
|---|---|---|
| `root` | node on the ground under the body; keys move it | things planted on the ground (`held:topdown-cane`) |
| `hip` | bone from the ground up to the hip line; Height and Stoop scale it | a robe (`part:topdown-robe`: it shortens in a crouch) |
| `waist`, `chest` | nodes at the hip line and the top of the torso | belts, collars, the stooped back (`part:topdown-hunch`) |
| `spine`, `neck`, `nape` | torso and the two bones that carry the head (it sinks into the chest in a crouch) | |
| `head` | node at the middle of the head | hair, beards, headgear |
| `shoulderF/B` | bone out to the shoulder (Build scales it: the arm moves in and out) | |
| `armTopF/B` | node at the top of the sleeve | epaulettes |
| `armF/B`, `armIF/B` | the sleeve, long and short (each frame shows the one that reaches) | |
| `elbF/B`, `wriF/B` | elbow and wrist (not drawn): carry the hand | |
| `cuffF/B` | node at the hand, screen-aligned | things that hang (`held:topdown-lantern`) |
| `handF/B` | node at the hand, turned the way a held thing points (F; the carry 'up' angle at rest) or along the arm (B) | held things |
| `grpF/B`, `fistF/B` | bone to the fist's corner and the node there (the fist stamp) | cuffs |
| `rimSF/B`, `rimAF/B`, `rimIF/B` | the sleeve's rim: the sleeve a pixel nearer the body (helpers) | |
| `hipF/B`, `thiF/B`, `shnF/B`, `toeF/B`, `footF/B` | out to the leg, thigh and shin to the sole (it ends on the ground, so scaling the hip with them keeps the feet down), the boot's corner node | boots, greaves |
| `ankF/B`, `legF/B`, `legIF/B` | from the boot to the ankle, and the side view's leg up to the hip (long, short) | |

The base's shapes keep their z per direction: legs 10 to 13, torso 20, sleeves, rims and fists 30 to 35 (down and
up; fists 60 and 62 facing down), the near arm 70 to 72 from the side, the head 50, face 52 and 53. A garment the code
rig draws over the arms (its `torso` hook) uses z 40 or more facing down and up, which also covers the sleeves' rims.

**Numbers in node frames.** A point on a node or bone is `[u, v]`: u along it (down the screen on a screen-aligned
node), v across (right on a node; on the hip bone, which points up, v is to the screen's left). An ellipse's radii in
such a frame are written the same way round: `r: [along u, along v]`, so `[vertical, horizontal]` on a node.
`extends.paint` maps the base's slots (`skin`, `top`, `bottom`, `boots`, `topFar`, `bottomFar`) to the sprite's.
