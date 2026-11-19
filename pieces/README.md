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
