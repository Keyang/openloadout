# Contributing assets

This guide is for adding or improving a sprite, a sound effect, an ambience loop, a jingle, a music track, or a whole kit. To change the engine, the build or the website, read [contributing-platform.md](contributing-platform.md). Start with [CONTRIBUTING.md](../CONTRIBUTING.md) for the ground rules.

## 1. What an asset is

| Kind | File | Made of |
|---|---|---|
| Sprite (character, creature, tileset, prop, pickup, projectile, effect, background, interface piece, icon) | `sprites/<id>.json` | **Data only**: colour slots, sliders, shapes, small pixel blocks, animation keys, sound cues, and the names of framework *generators* and *pieces* that do the drawing |
| Sound effect, ambience loop, jingle | `sounds/<id>.json` | A synthesis *patch*: controls, a graph of nodes, an output expression, 2 or 3 named styles |
| Music track | `sounds/<id>.json` with `"category": "music"` | A patch, usually written by a generator script in `tools/compose/` |
| Kit (bundle) | `bundles/specs/<id>.plan.json` plus its assets | A themed set for one game type: about 40 to 50 sprites, 20 sounds and 2 tracks |

There is **nothing to register**. The build finds assets by scanning the folders, and search, the catalogue and the downloads pick a new file up with no other edit.

Two rules decide everything about how you work:

1. **No code in an asset.** No functions, formulas or expressions in a sprite file. A slider reaches a number only through a lookup table (a *binding*). Variety comes from naming a generator from the registry (`engine/gen/`), with arguments. If the generator you need does not exist, you add it to the framework in the same pull request (section 6), you never write drawing code into the asset.
2. **Everything is deterministic and original.** Same input, same pixels and samples. No famous designs, no known melodies.

(Sound patches do contain small expressions such as `"pitch * semi(rise)"`. Those are part of the patch language and are safe; the "no code" rule is about sprites.)

## 2. Before you start

```bash
npm install
npm run build -- --skip-quality     # ~5 s; the site and some tools need generated/ and vendor/
```

Then look at what is already there so you do not duplicate it and so you can copy the nearest example:

```bash
ls sprites | grep -i <word>          # is there already a sprite like yours?
ls sounds  | grep -i <word>
node tools/gen.mjs                   # every generator, by family, with what it draws
node tools/piece.mjs                 # every shared piece (hair, held items, skins, fonts, stamps)
npm run serve                        # browse the site at http://localhost:5178 and search
```

If your id is taken (`ls sprites/<id>.*`), pick another. A contribution that replaces an existing asset should say so and explain what is better.

Read, once: [style-guide.md](style-guide.md) (frame sizes and pivots §1, outline and colour counts §2, clip names, frame counts and fps §4, the standard sliders per kind §10, sound §11, music §12, metadata §13), and the craft guides [craft/sprites.md](craft/sprites.md), [craft/sounds.md](craft/sounds.md) and [craft/music.md](craft/music.md). The craft guides teach what makes an asset *good* and not only *valid*; the rules documents win where they disagree.

## 3. Making a sprite

### 3.1 Pick a body

`body` holds exactly one layout:

| Body | For | Start from |
|---|---|---|
| `pictures` | props, pickups, projectiles, icons | `tests/fixtures/v2/pictures/coin.json`, `crate.json`, `icons-food.json` |
| `rig` | characters and creatures: bones, shapes and stamps on bones, key poses, IK | `tests/fixtures/v2/knight.json`, `sprites/knight.json`. `node tools/piece.mjs` lists the bases (`base:person-side`, the top-down persons) |
| `emitters` | effects: particles, rings, smoke, flames | `sprites/fx-heal.json`, `sprites/cell-burst.json` |
| `panel` | interface pieces: buttons, panels, bars | `sprites/ui-buttons-wood.json`, `sprites/ui-panel-wood.json` |
| `layers` | parallax backgrounds | any `sprites/bg-*.json` |
| `tiles` | tilesets with edge profiles and band rules | `sprites/tiles-forest.json` |

Copy the nearest file that draws today, rename it, and change it. Do not start from a blank file.

### 3.2 The parts of the file

Open `tests/fixtures/v2/pictures/coin.json` alongside this list. Its sections are:

- **Top**: `format`, `version: 2`, `id` (lowercase, digits, dashes; the file name), `name`, `blurb` (one sentence: what it is and what can be changed), `meta`, `size` and `pivot` (from style guide §1; a pickup is 32 by 32 with pivot `[16, 30]`), `grounded`, `preview` (the clip the card shows), `styles: ["pixel"]`.
- **`meta`**: `type`, `role` (must be in the role tree in `catalog/schema.js`, for example `items/pickup`), `themes`, `gameTypes`, `view`, 6 to 14 lowercase `words` people would type to find it, and `license: "draft"`. `catalog/schema.js` says what is allowed.
- **`palette`**: up to 12 colour slots. Every paint in the file is a slot reference such as `"metal"`, `"metal.light"` or `"ink"`, never a hex colour. Each slot names a `material` (`metal`, `wood`, `skin`, `magic`, ...), because whole-kit looks recolour by material. A slot with a `label` and `default` can be a colour slider. A `derive` slot is worked out from others by a named colour rule (`tone`, `mix`, `ramp`, `apart`, ...; the list is `COLOUR_RULES` in `engine/data-rules.js`). Two colours that touch must differ in lightness by 0.2 or more, or looks will merge them.
- **`controls`**: up to 48 sliders (`range`, `choice`, `toggle`, `colour`, and `{ "key": "speed", "standard": "speed" }`). **A control does nothing by itself.** It acts only where a binding, a `when` or a part names it, and the validator refuses a control nothing uses. Every control must visibly change at least about 12 pixels (style guide §10).
- **Bindings**: any number can be `{ "from": "<control>", "map": [[0, 10], [1, 19]], "round": "px" }`, which means "10 at the slider's low end, 19 at the high end". Any word or flag can be `{ "from": "<control>", "pick": { "<option>": value } }`.
- **`when`**: `{ "key": [values] }` shows a shape, a stamp, a generator call, a part or a control only while those settings hold. Values are always lists.
- **`body`**: the drawing and motion, in the layout you chose. Shapes go in painting order: body first, then `{ "kind": "outline", "paint": "ink" }`, then glints and sparkles on top.
- **`clips`**: animations. Names, frame counts and fps per kind are in style guide §4. A pickup has a looping `idle` of 8 frames at 10 fps and a one-shot `collect` of 8 frames at 14 fps with a flash on frame 4 and a sound cue on frame 1.
- **Sound cues** on a clip: `"sounds": [{ "sound": "coin-pickup", "frame": 1 }]`. The id must exist in `sounds/`. If it does not, make the sound too (section 4).

The full format, with every field, is in [data-sprites.md](data-sprites.md) §2: §2.1 top level, §2.2 rigs, §2.3 tilesets, §2.4 backgrounds, §2.5 controls and the other kinds, §2.6 bindings, colour rules, `when` and parts, §2.7 shapes.

### 3.3 Generators, pieces and stamps

- A **generator** is a named, versioned framework function that returns shapes. Call it where a shape may stand: `{ "gen": "gem.cut", "v": 2, "on": "gem", "at": [0, 0], ... }`. Always write the version you looked at.

  ```bash
  node tools/gen.mjs gem.cut                                     # its arguments, ranges and a call to copy
  node tools/gen.mjs gem.cut --sheet                             # out/gen-gem.cut@2.png: it across each argument's range
  node tools/gen.mjs gem.cut --sheet --try '{"cut": "heart"}'    # the exact call you are about to write
  ```

  Look at the sheet of the call you will write before you write it. Generators marked "old" in the listing draw only at 0 and up; use the newest version.
- A **piece** is shared data in `pieces/` (bases, hair, helmets, held things, skins, fonts, stamps). Use one with `{ "kind": "use", "use": "part:hair", "v": 1, "on": "head", ... }`, or `"extends": { "use": "base:person-side", "v": 1 }` for a rig. `node tools/piece.mjs <kind:name> --sheet` draws it.
- A **stamp** is a small block of pixels (rows of up to 32 characters) placed on a node or bone, moved, swapped or mirrored but never turned. Use stamps for eyes, buckles, rivets and glints. Use shapes for anything that bends, grows with a slider or turns.

### 3.4 Check, look, fix

You will go round this loop three to six times. Do not skip the looking.

```bash
node tools/check.mjs <id> --no-cache        # about a second. Errors fail; warnings are for your eyes
node tools/render.mjs <id>                   # out/<id>-clips.png, -variants.png, -choices.png
node tools/render.mjs <id> --clip collect    # one clip at 8x, to count frames
node tools/render.mjs <id> --scale 1         # game size: would a stranger name it in two seconds?
node tools/render.mjs <id> --set size=1 --set shape=heart   # a chosen setting
```

Open each PNG and look. `render.mjs` overwrites the same files on every run, so copy a sheet first if you want to compare. Look for:

- **Reads at game size.** At 1x, is it still the thing it is?
- **Craft.** Unbroken outline, light from the top right, touching parts apart by value, no stray pixels, colour count within the style guide's limit.
- **Motion.** Anticipation and follow-through, nothing pops or detaches, loops lead back into frame 0, an idle moves 1 to 2 px and a hit or jump 3 or more.
- **Range.** Every row in the variants and choices sheets is the same thing and still reads; the all-low row is not a speck and the all-high row is not cramped.
- **Light on light.** A sparkle painted in `<slot>.light` over the same body vanishes. Use a separate `shine` slot.
- **Originality.** Not a famous design.

Common checker messages and what to do:

| Message contains | Fix |
|---|---|
| `is not an argument of`, `is missing`, `there is no generator` | `node tools/gen.mjs <gen>` and write the call it shows. A generator that does not exist is a framework addition (section 6) |
| `nothing uses it, so it would do nothing` | Name the control in a binding, a `when` or a part, or remove it |
| `slot "x" is never painted` | Paint something with it (directly or through a painted derived slot), or remove it |
| `changes at most N pixels`, `does nothing when ...` | A bigger table range, or the `when` the message suggests |
| `drawing touches the frame edge`, `wholly outside the frame` | Keep a 1 px border at every setting: smaller table ends, or a `room` argument |
| `loop seam`, `last frame equals first frame` | A loop must come back to frame 0 |
| `lowest pixel is at y=...` | Stand on the pivot line in the first clip, or set `grounded: false` |
| `shapes merge under the "..." look` | Move the two named colours 0.2 or more apart in lightness |
| `meta: ...`, `sound "x" ... is not in sounds/` | Do what it says, with exact ids |
| `cannot be loaded` | The rest of the line is the validator's list. Fix the first item first |

`node tools/check.mjs --help` runs every sprite. Always pass an id.

### 3.5 Using an AI agent

The repository includes the recipe the maintainer's agents use: the skill in `.claude/skills/sprite-forge/` (`SKILL.md` for sprites, `SOUND.md` for sounds and music, `examples/`) and the `loadout-maker` agent in `.claude/agents/loadout-maker.md`. In Claude Code, started in this folder, ask it to "make a sprite of ..." or "add a sound effect for ..." and it follows the skill. Its first step is `node .claude/skills/sprite-forge/context.mjs`, which prints the live list of built bodies, generators, pieces and example sprites; you can run it yourself as a quick map of what exists. `node .claude/skills/sprite-forge/context.mjs verify` checks that the skill is still true of the code.

An agent's work is held to the same rules as yours: you are responsible for what you submit. Run the checks, look at the sheets, and delete anything you would not have made yourself.

## 4. Making a sound, a loop or a jingle

A sound is one JSON patch. This one passes the checker with no warnings (save it as `sounds/hop-blip.json` to try it, then delete it):

```json
{
  "format": "sfxpatch/0.1",
  "id": "hop-blip",
  "name": "Hop blip",
  "category": "movement",
  "description": "A rising, buzzy blip with a soft click, for small jumps. Change its pitch, rise, length, brightness and grit.",
  "meta": { "type": "sfx", "role": "actions/jump", "themes": ["fantasy", "neutral"], "gameTypes": ["platformer", "arcade"],
    "words": ["jump", "hop", "bounce", "blip", "boing", "leap", "spring"], "license": "draft" },
  "duration": "length + 0.02",
  "params": [
    { "id": "pitch", "label": "Pitch", "unit": "Hz", "min": 200, "max": 1200, "default": 420, "scale": "log" },
    { "id": "rise", "label": "Rise", "unit": "semitones", "min": 3, "max": 19, "default": 12 },
    { "id": "length", "label": "Length", "unit": "s", "min": 0.08, "max": 0.4, "default": 0.16, "scale": "log" },
    { "id": "bright", "label": "Brightness", "min": 0, "max": 1, "default": 0.5 },
    { "id": "grit", "label": "Grit", "min": 0, "max": 1, "default": 0.2 }
  ],
  "nodes": [
    { "id": "sweep", "type": "env", "points": [[0, "pitch * rnd(0.97, 1.03)"], ["length * 0.7", "pitch * semi(rise)", "exp"]] },
    { "id": "body", "type": "osc", "wave": "square", "freq": "sweep" },
    { "id": "tone", "type": "filter", "mode": "lp", "in": "body", "freq": "800 + bright * 7000" },
    { "id": "amp", "type": "ad", "attack": 0.002, "decay": "length", "curve": 1.8 },
    { "id": "hiss", "type": "noise" },
    { "id": "click", "type": "ad", "attack": 0.0005, "decay": 0.02, "curve": 3 },
    { "id": "dirty", "type": "shaper", "in": "tone + hiss * grit * 0.3", "drive": "1 + grit * 8", "mode": "fold" }
  ],
  "out": "dirty * amp + hiss * click * 0.3",
  "presets": { "Tiny hop": { "pitch": 700, "rise": 7, "length": 0.1 }, "Big leap": { "pitch": 300, "rise": 17, "length": 0.3, "bright": 0.7 } }
}
```

Key points (the full rules are style guide §11 and [quality-bar.md](quality-bar.md) §2):

- `nodes` run in order, once per sample; each `id` is also the name of its output. `out` mixes node outputs (one expression for mono, `["left", "right"]` for stereo). Print the synthesis reference with `node tools/sfx.mjs nodes`.
- Ids must not be a reserved name (`t dur sr pi tau rnd sin cos tan abs sqrt floor ceil round sign tanh exp log min max pow clamp mix db midi semi step smooth`).
- 4 to 6 controls named for what a listener hears, with these ids where they apply: `pitch`, `weight` or `size`, `length`, `bright`, `grit`, `snap`, `ring`, `space`, `rise` / `drop`, `speed`. No volume control. Every slider position must give a usable sound.
- 2 or 3 named `presets` (styles). Sprites cue sounds by style name, so a style name that a sprite cites must not be renamed.
- Sounds that repeat (footsteps, hits, shots) must vary between takes (`rnd()`, `noise` or `dust`). Interface sounds, pickups and jingles are identical every time.
- At least 40% of the energy should be above 300 Hz at the default and in every style, so it works on a phone speaker.
- **Words a visitor reads** (name, description, labels, style names) are everyday words: "Ringing metal", not "modal resonator"; "deep", not "80 Hz". No units, synth parts or music theory in them. The checker's "A-words" error says what to write instead.
- `category` is required: `weapon`, `impact`, `pickup`, `movement`, `ui`, `magic`, `vehicle`, `ambience`, `jingle`, or `music`. A looping sound needs `"loop": true`.

```bash
node tools/sfx.mjs check sounds/<id>.json --no-cache                        # under a second for an effect
mkdir -p out && node tools/sfx.mjs render sounds/<id>.json --png out/<id>.png   # waveform on top, spectrogram below
node tools/sfx.mjs render sounds/<id>.json --preset "Tiny hop"              # one style
node tools/sfx.mjs render sounds/<id>.json --set pitch=300                  # one control value
```

**Listen to it.** The maintainer's checks are by measurement, and nobody has yet listened critically to the library. If you can hear, you are the best reviewer these assets have: say in your pull request what you heard. If you could not listen, say that the sound was verified by the checker and the spectrogram only.

Start from the nearest file in `sounds/` (`coin-pickup`, `jump`, `laser-shot`, `punch`, `explosion`, `metal-hit`, `whoosh`, `footstep-gravel`, `magic-spell`, `fire`, `wind`). Synthesis is good at stylised, abstract and mechanical sounds: interface, arcade, sci-fi, impacts, whooshes, bells, engines, wind, fire, water. It is poor at voices, animals, speech and photoreal foley, so propose the nearest stylised version instead.

## 5. Making music

A track is a sound patch with `"category": "music"` (up to 120 s). Tracks are written by generator scripts in `tools/compose/` that use a shared kit (`tools/compose/kit.mjs`), so the patch is reproducible and every bar can be read back.

- Start from `tools/compose/thornwood_overworld.mjs`. Do **not** start from `battle_theme.py`.
- `tools/compose/verify_music.mjs` lists the notes sounding in each bar. `tools/compose/render_ramp.mjs` renders a loop while one slider climbs. Read [craft/music.md](craft/music.md) (the hook, phrases, one peak, question and answer, intensity layers, loop turns) and style guide §12.
- A music check renders every control's ends and takes **about 6 CPU-minutes**, so run it in the background: `node tools/sfx.mjs check sounds/<id>.json`.
- Tracks are pinned in `tests/unit/compose-tracks.test.mjs`. Add your track to the pinned list in the same pull request.
- Use `"normalize": false` only when loudness must follow a control. The level heard at the defaults, in every style and at both ends of every control must then stay at or under 0.95.

## 6. When something is missing

If no generator, piece, node type or music block can do what your asset needs, add it. Never put the maths into the asset.

- A new generator or piece: follow "Add a generator" and "Add a piece" in [contributing-platform.md](contributing-platform.md). The short version: test first, additive only, one-line doc comment, pin the golden, never change a released version.
- A new sound node or music block: "Extend the sound engine or the music kit" in the same guide, including the before/after fingerprint of every existing sound.

Put the framework addition and the assets that use it in **one pull request**, with the framework addition in its own commit, so a reviewer can read it separately.

If your idea needs a body kind that the engine does not draw yet, do not fake it with another body. Open an issue and describe it.

## 7. Kits

A kit is a themed set of assets for one game type, shown together on one page and downloaded as one bundle. Kits are specified before they are built:

1. Write the specification `bundles/specs/<id>.md`: one row per asset with its id, type, role, size, clips, controls, sound pairings, and for music the tempo, key, layers and lengths.
2. Write the plan `bundles/specs/<id>.plan.json`: name, game type, the sentence for its page, palette, and the asset lists. Look at an existing pair such as `kit-puzzle-gridline.md` and `.plan.json`.
3. Make the assets, one pull request or one commit per asset.
4. `node tools/bundles-from-plans.mjs` writes `bundles/<id>.json` for each kit whose assets all exist. `--check` writes nothing. A kit that brings a new palette needs one code step, described at the top of that tool.

Where a specification row exists for your asset id, it wins over the style guide for that asset. Kits have the targets in the README's acceptance tests (40 to 50 sprites, 20 sounds, 2 tracks) and that is held by `tests/e2e/three-bundles.spec.mjs`.

Because a whole kit is a lot of work, open an issue with the specification first so the maintainer can agree the theme and the list before you build it.

## 8. What reviewers look for

An asset passes when **both** halves pass ([quality-bar.md](quality-bar.md), [review-protocol.md](review-protocol.md)):

1. **Automatic checks.** Zero errors from `check.mjs` or `sfx.mjs check`. Warnings do not fail an asset, but they are read.
2. **A judged rubric** of five criteria, each scored 1 to 3. A pass is every criterion at least 2 and a total of at least 11 out of 15. A 2 means nothing is wrong and a 3 means someone chose this on purpose. The craft guides' checklists (`craft/sprites.md` §17, `craft/sounds.md` §8, `craft/music.md` §15) say what earns a 3.

The person who made an asset does not score it. Expect a reviewer to read your render sheets, and ask for up to two rounds of fixes. An asset that still cannot reach a pass is replaced and not patched forever.

## 9. Before you open the pull request

- [ ] The id is lowercase with dashes, is not already taken, and matches the file name.
- [ ] `node tools/check.mjs <id> --no-cache` (sprites) or `node tools/sfx.mjs check sounds/<id>.json --no-cache` (sounds and music) ends with no errors, and you have read every warning.
- [ ] You looked at the render sheets (and listened, if you can), and the pull request shows `out/<id>-clips.png` and `out/<id>-variants.png` for a sprite.
- [ ] Every control changes something visible or audible, and every label is an everyday word.
- [ ] Any sound a sprite cues exists in `sounds/` under that exact id and style name.
- [ ] `meta` is complete: a `role` from the role tree, `themes`, `gameTypes`, 6 to 14 `words`, and `"license": "draft"`.
- [ ] The design is your own, not a copy of a known character, sprite or melody.
- [ ] Anything you added to the framework has a test that failed first, a doc comment and, for a generator, a pinned golden. Existing assets and sounds render the same as before.
- [ ] You did not commit `generated/`, `vendor/`, `out/`, `dist/` or `node_modules/`.
- [ ] One asset (or one kit) per pull request, described in plain words: what it is and what a game maker can change.
