# Gridline falling-block puzzle kit: specification (`kit-puzzle-gridline`)

Written 2026-11-19 by the art director for the asset plan (`docs/asset-plan.md` in `lab/sprite-forge/`, section 7, wave 1, row 48: "Gridline: falling-block puzzle", fixed screen). It goes with `kit-puzzle-gridline.plan.json`; the two always agree. **Nothing in it is built yet.** **Read `docs/style-guide.md` first**: it fixes clip names, frame counts, cue frames, control keys and labels, metadata and originality. This file says what each asset is, and where it departs from the guide it says so and why. Where this page and the style guide disagree, this page wins for that asset; where this page is silent, the style guide and the skill (`.claude/skills/sprite-forge/SKILL.md`, `SOUND.md`) decide.

| | |
|---|---|
| Game type | `puzzle` |
| World | **Gridline**: bright abstract shapes on a dark grid. No place, no people: a deep blue-violet void, a lit grid, and blocks in clean bright colours. A small block creature is the only character |
| Screen | Fixed. Blocks are 16 px cells; the playing field is 10 cells by 20 (160x320 px) with two hidden rows above; the game runs at 640x360 and lays the 320x180 backdrop two by two (its `far` layer wraps both ways) |
| View | `none` for everything except the block buddy (`front`) |
| Palette | **"Gridline"** (new, [below](#the-gridline-palette)); in `engine/palettes.js` as `PALETTE.gridline` since 2026-11-19 |
| House sound | **Clean and tuned**: soft square, pulse and triangle tones, short bell-like FM, filtered clicks. Every pitched cue sits on the notes of one five-note scale (C major pentatonic at the default pitch: C D E G A), so cues that overlap make a chord, not a clash: the default and every style start on a scale note (C4 262, D4 294, E4 330, G4 392, A4 440 and their octaves), and every glide, drop or rise at the default and in every style ends on one too (the semitone steps that stay on the scale are written in each row). Only unpitched layers (noise, thumps, clicks) are exempt. Dry: `space` at most 0.1, except the two reward jingles `board-clear` and `new-record` (up to 0.25) |
| Sprites | **24** (14 new, 10 reused from the core libraries) |
| Sound effects | **24** (16 new, 8 reused) |
| Music tracks | **4** (4 new, 0 reused): menu, calm play, fast play, results, in the `chip` and `synthwave` bands |
| Batches | 2 helper, 3 sound, 4 sprite and 4 music batches (13) |

Contents: [What is different about this kit](#what-is-different-about-this-kit) · [The Gridline palette](#the-gridline-palette) · [Asset list](#asset-list) · [Reused assets](#reused-assets) · [New helpers](#new-helpers) · [New sprites](#new-sprites) · [Sound effects](#sound-effects) · [Music](#music) · [Left out, and why](#left-out-and-why) · [Batch plan](#batch-plan)

## What is different about this kit

- **What the checklist asks for, and nothing of the look.** The reference game (plan, section 1) gives the list: block skins, a playing field, next and hold boxes, line-clear effects; and around them what any game needs: a title and menus, score and level counters, a pause screen, a game-over and a results panel, particles, words that pop, sounds for every move and four tracks. Everything here is drawn and named for Gridline.
- **Small kit, by design, and the kit checks must be taught that first (helper batch GH0).** A falling-block puzzle needs about 24 sprites, 24 sounds and 4 tracks, and it has no player character (`grid-buddy` is `characters/npc`; the player moves pieces, not a figure). Today that breaks more than a size note. `tests/e2e/three-bundles.spec.mjs` treats every plan in `bundles/specs/` as a kit under test: both the set test and the per-kit test call `kitProblems`, which includes `sizeProblems` against the one `KIT_SIZE` in `tools/lib/assets.mjs` (40 to 50 sprites, 20 sounds, 2 tracks), and the per-kit test then requires a playground sprite with role `characters/player` that the arrow keys move. So once every Gridline asset exists, this kit's test fails for good and the set test fails for every kit. GH0 (in [New helpers](#gh0-the-kit-checks-a-size-per-plan-and-kits-with-no-player)) gives a plan its own size and lets a view-`none` puzzle kit pass the playground check without a player; GH1 waits for it, so no Gridline asset lands before the acceptance suite can accept the kit. Until GH0 has passed review, the size note from `tools/bundles-from-plans.mjs` and the failing kit tests are real faults, not noise.
- **The cell is 16 px, half the world tile** (style guide section 1: "Half a tile (16) is the grid for small things"). At 32 px the field would be 640 px tall. At 8 px a block has no room for a bevel, a symbol and a glint. So the two tilesets are 16x16 (the checker accepts 16 and 32: `THRESHOLDS.tileSizes` in `quality/sprite.js`), the hold box holds a four-cell piece at 16 px, and the backdrop is laid two by two.
- **Deviations from the style guide, each with its reason; builders say so in the report:**
  - `gridline-blocks` and `gridline-well` are **16x16 tilesets** (section 6 says 32x32): the reason above.
  - `gridline-well` **shows its grid on purpose** (section 6, "No grid showing", is for terrain, where a visible grid is a fault; in a falling-block field the grid is how a player aims). Its one fill is `field-fill`; the other shade is `field-alt`, a name the picker never mixes in, so a game lays the field exactly. It has no `wear`: nothing in the abstract world wears.
  - `gridline-blocks` is a tileset whose clips are not block pieces (`cell-1` ... `cell-7`, `junk`, `ghost`, `lock`, `clear`): the checker will warn that it has no fill tile; that warning stays.
  - `gridline-blocks` has **no `texture` and no `wear`** (section 10 lists both as "Always" for a tileset): a cell is a clean, flat square of one colour, and at 16 px every texture mark would fight the 6x6 symbol and the shine L that must read at a glance; nothing in the abstract world wears. Its material colours are the `scheme` choice (seven colours at once), `junk` and `glow`.
  - `drop-streak` has **no `size`** (section 10 lists it as "Always" for an effect): a streak's size is two lengths that a game sets separately, `height` (how far the piece fell) and `width` (how many cells wide it was), as a projectile uses `length` in place of `size`.
  - `ui-stat-counter` is **64x24** (as `ui-timer`), `ui-junk-gauge` is a **standing bar, 16x64** (a bar is 64x16 lying down in section 8: this one stands beside the field, four cells tall), `gridline-emblem` is **96x64** (a title picture the size of a panel, not a 32x32 icon).
  - `bg-gridline`'s `far` layer has **1 px grid lines** (section 7: smallest detail 3 px). The lines are unbroken across the layer, so nothing flickers; the stars and lights keep the 2x2 minimum.
- **No theme word fits.** `catalog/schema.js` has no `abstract` theme, and adding one is a schema change outside a kit. Every asset here has themes `neutral` first, then `sci-fi` (the lit grid reads as digital); the block buddy and the emblem add nothing more.
- **gameTypes**: `puzzle` first, then `arcade` on everything; effects also `shooter` where a row says so.
- **Meaning stays fixed** (style guide section 3, rule 7): `red` is danger only (the danger rows, the junk about to land); `gold` is reward (records, spins, four lines); `cyan` is friendly light (the landing preview, the lit walls); `hero` (the shared player blue `#3f6fd1`) is the buddy's body. No block colour scheme uses `red`.
- **Touching colour controls never share a swatch, and every list holds 4 to 8.** Each row says which lists touch. The interface faces and frames were measured with `worstContrast` of `engine/ui.js` on 2026-11-19 (the numbers are under [The Gridline palette](#the-gridline-palette)).
- **Every slider states its default.** Count sliders (`edge` where it counts pixels, `digits`, `pieces`, `rows`, `cell`, `density`) are whole-number ranges with step 1 (or the step the row gives), and every version sets them to whole numbers inside the range. Every other slider runs 0..1, default 0.5, unless the row says otherwise.
- **`when`.** A control or a cue followed by **when** `{ ... }` is in effect only for those values; copy it exactly. A toggle written "in every style" does something in every option of every choice, and has no `when`.
- **Interface rows that are states** (the boxes, the panels, the counter, the gauge) carry labels of 12 or more characters saying when each is shown; the download guide writes each state row from its label.
- **A text area holds only the face colour, in every style.** Every clip that declares a `textArea` has nothing but the flat face colour inside that rectangle, for every option of every choice, every toggle and every swatch: no corner block, tube glint, tick, crack or badge reaches into it. Take the rectangle from the helper's return value (`inner`, `text`), never from the frame size. `contrastFaults` of `engine/ui.js` checks it under every whole-bundle look.
- **Ready-made versions** (`docs/site-design.md` section 4). Every row lists 3 to 6 `versions`; the first is always the defaults (`params: {}`). A colour is written here as `gridline.rose`: write `PALETTE.gridline.rose` in the file. Each version must pass the checker and **look different at card size on the preview clip** (the first clip unless the row names another) from the defaults and from every other version (`VERSION_RULES` in `engine/versions.js`). If one does not, change its settings, keep its name and say so in the report.
- **Sounds.** Sprites cue only sounds that are in `sounds/` today (the 8 reused) or are specified here (the 16 new); a sprite batch waits for the sound batches it cues. Tiles and effects carry no cues: a line of ten cells plays a clip ten times, so the game plays `block-lock`, `line-clear` and the rest once per piece or per line.
- **Drawing styles (Contract 12).** The plan names this kit, with the deck builder, as the first trial of the second, flat drawing style. Decision P5 holds: **no row asks for the flat style** until the flat Hero has been drawn and looked at. Every sprite here is pixel only, draws bodies with shape calls, and names its detail layer (what a flat style would redraw), so that adding the style later means no redraw.
- **Originality** (style guide section 13 and the plan's section 1). Rules for this kit, on top of the guide's:
  1. **No seven-colour set of the reference game.** No scheme here is a red, orange, yellow, green, cyan, blue and purple rainbow: the default scheme has pink, teal and pearl and no red or dark blue; the slots are numbered `cell-1` to `cell-7`, never named for a piece shape or a letter, and the sprite does not tie a colour to a shape (the game does).
  2. **No logo.** The emblem is an abstract badge of small cells with no letters; the kit never draws the word of any game, and no block letters spell anything.
  3. **No borrowed music.** No track is in a minor key with a folk-dance rhythm in two; every tune, chord order and rhythm is the library test's unique (`tests/unit/compose-library.test.mjs`).
  4. **No borrowed names.** "Spin bonus", "Four lines", "Junk", "Hold", "Next": the genre's mechanics, in plain words; never the reference game's trade terms for them.

How to read a sprite row: as in the other kit specifications. **Clips:** name, frame count, "loop" if it loops, then the label in brackets (button text; for states, when it is shown). **Controls:** the sprite's own controls by key, in `params` order, each with its default; standard keys take the style guide's label and end words (section 10). A colour's note gives its label, its default, its swatches exactly and, where the label cannot say it, the `material` to declare. **Sounds:** clip, frame, sound id and style (the cue's `preset`), volume. **Versions:** name and `params`. **Helpers:** every framework function the sprite calls, by module; **(new, GH1)** or **(new, GH2)** marks a function that does not exist yet and is built in that helper batch ([New helpers](#new-helpers)); every function not so marked was checked to exist on 2026-11-19. **Drawing:** the drawing style and its detail layer.

## The Gridline palette

Dark blue-violet ground, lit lines, and saturated block colours that stand apart **by value** as well as by hue. **Only blocks and lights are saturated**; every surface a block sits on is dark and cool. In `engine/palettes.js` as `gridline` (colours, swatch lists in `GROUPS`, `NEVER_SWATCH: ['ink', 'void']`), added with this specification on 2026-11-19. The bundle id is **not** in `BUNDLE_PALETTE`: sprites write `PALETTE.gridline.<name>`, as the guide asks of every sprite.

| Name | Hex | Brightness | Used for |
|---|---|---|---|
| ink | `#231b33` | 0.13 | outlines |
| void | `#12152b` | 0.09 | the dark behind everything (background only, never a swatch) |
| well | `#2a3058` | 0.20 | the playing field's floor; the default face of every box and panel |
| line | `#3a4278` | 0.27 | a second floor and face; grid lines on a dark backdrop |
| deep | `#1e4658` | 0.24 | a sea-dark face and floor |
| plum | `#6a3a8e` | 0.32 | a violet face and floor; the darkest warm block |
| slate | `#4f5894` | 0.36 | junk blocks; grid lines |
| dusk | `#6e78b4` | 0.49 | junk blocks; far shapes |
| mist | `#a3abd8` | 0.68 | the field walls; ghost lines |
| pearl | `#e6e8f6` | 0.91 | the pale block; frames; shine |
| cream | `#f0ead8` | 0.92 | the white-hot core of flashes and bursts (shared with the three kits) |
| rose | `#f2609e` | 0.58 | block; corner blocks |
| coral | `#f5875a` | 0.64 | block; corner blocks |
| lemon | `#f2dc4c` | 0.82 | block; frames; lights |
| lime | `#a6dc46` | 0.73 | block; lights |
| mint | `#46d8a8` | 0.65 | block; lights |
| sky | `#56c4f2` | 0.66 | block; walls |
| teal | `#2a9a9a` | 0.47 | block |
| violet | `#7d52e6` | 0.44 | block; stacks in the backdrop |
| hero | `#3f6fd1` | 0.42 | the buddy's body (the shared player blue) |
| cyan | `#5fe0f0` | 0.73 | **friendly light**: the landing preview, wall lights, frames |
| red | `#e2473f` | 0.46 | **danger only**: the danger rows, junk about to land |
| gold | `#f2c230` | 0.75 | **reward**: records, spins, four lines (shared) |
| steel | `#c2c9d6` | 0.79 | frames (shared) |
| skin | `#f6d3b0` | 0.85 | shared with the three kits; no sprite here uses it |

**Interface colours, measured with `worstContrast` (the worst under every whole-bundle look) on 2026-11-19.** Faces (`well`, `line`, `deep`, `plum`) hold white text at 9.02, 6.58, 8.04 and 5.08 to 1. Frames (`steel`, `cyan`, `lemon`, `pearl`) hold 3.12 to 1 or more against every face (lowest: `steel` on `plum` 3.12, `steel` on `line` 4.22, `cyan` on `plum` 3.25, `lemon` on `plum` 3.37, `lemon` on `line` 3.41). Left out of the frames: `mist` (1.94 on `plum`), `rose` (1.60 to 3.13), `mint` (2.10 to 4.21), `sky` (1.94 on `plum`), `gold` (1.80 on `slate`, 2.54 on `plum`). Corner blocks: `rose`, `mint`, `lime`, `gold`, `coral`; none is a face or a frame (they are decoration on the frame band, not text). **Digits on windows** (`ui-stat-counter`, measured the same way): the digits must read on every face, and only six colours reach 3 to 1 on all four (`pearl` 4.94, `cream` 4.17, `skin` 3.58, `lemon` 3.37, `cyan` 3.25, `steel` 3.12, each its worst, on `plum`); `mint` (2.71 on `plum`, 2.99 on `line`), `lime` (2.96 on `plum`), `gold` (2.54), `coral` (1.95) and `rose` (1.76) do not. So the Digits list is `lemon`, `cyan`, `cream`, `pearl`; **its worst pair is `cyan` on `plum`, 3.25 to 1**.

**Block colour schemes** (`BLOCK_SCHEMES` in `engine/blocks.js`, new, GH1). A scheme is a choice, not seven colour controls (the guide allows 2 to 5 colour controls). Slot brightness is spread so that a stack still reads in the Mono look; the `mono` scheme is value only, for players who cannot tell hues apart (with `mark: 'shapes'` it is fully readable without colour).

| Scheme | Slot 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| `prism` (default) | rose | coral | lemon | lime | teal | violet | pearl |
| `ember` | coral | lemon | gold | rose | plum | violet | cream |
| `ocean` | hero | sky | teal | cyan | slate | deep | pearl |
| `mono` | well | line | slate | dusk | mist | steel | pearl |

**Symbols** (`BLOCK_SYMBOLS`, new, GH1), one per slot, drawn in the centre of a cell when `mark` is `shapes`: 1 a filled disc, 2 a ring, 3 a plus, 4 a diamond, 5 a bar, 6 a triangle, 7 a hollow square; `junk` a cross. Each 6x6 px at a 16 px cell, in whichever of the cell colour's `light` and `dark` tones stands out more (`pick`).

**The palette test is fixed in GH1, first.** `tests/unit/palettes-core.test.mjs`, test "bundle ids and short names reach the same palette", lists the palettes as exactly three (`assert.deepEqual(Object.keys(PALETTE).sort(), ['derelict', 'hearthvale', 'thornwood'])`), so it fails now that `gridline` exists (18 tests: 17 pass, 1 fail). The add-a-palette steps require it to pass, so batch GH1 starts by changing that list to `['derelict', 'gridline', 'hearthvale', 'thornwood']` and running the file (18 tests, 18 pass) before it writes `engine/blocks.js`. The doc comments of `engine/palettes.js` (the file's head, `PALETTE`, `paletteName` and its error message) name `gridline` already. **Still to do outside this kit:** the style guide's section 3 gets this table as `### Palette "Gridline" (\`kit-puzzle-gridline\`)` and its "What `swatches` accepts" line; whoever adds it also updates the same test file's style-guide tests ("the style guide has the three palettes" lists three, and the bundle-id loop expects `PALETTE['kit-puzzle-gridline']`, which is no alias). The test file's other 17 tests, `palettes-docs.test.mjs` and the palette loop of `tiles-layout.test.mjs` (`textureTone` under every look, every Gridline colour) pass. Every Gridline material list was checked on 2026-11-19: 4 to 8 distinct colours, the first three palette colours, none under brightness 0.18.

## Asset list

| # | id | Name | type | role | view | Frame | Batch |
|---|---|---|---|---|---|---|---|
| 1 | `gridline-blocks` | Block skins | tileset | world/tile | none | 16x16 | G1 |
| 2 | `gridline-well` | Playing field | tileset | world/tile | none | 16x16 | G1 |
| 3 | `bg-gridline` | Grid backdrop | background | environment/background | none | 320x180 | G1 |
| 4 | `ui-piece-box` | Next and hold boxes | ui | interface/panel | none | 96x64 | G2 |
| 5 | `ui-gridline-panels` | Round panels | ui | interface/panel | none | 96x64 | G2 |
| 6 | `ui-stat-counter` | Level and lines counter | ui | interface/panel | none | 64x24 | G2 |
| 7 | `ui-junk-gauge` | Junk gauge | ui | interface/bar | none | 16x64 | G2 |
| 8 | `cell-burst` | Cell burst | effect | effects/spark | none | 32x32 | G3 |
| 9 | `drop-streak` | Drop streaks | effect | effects/dust | none | 64x64 | G3 |
| 10 | `spin-sparkle` | Spin sparkle | effect | effects/magic | none | 48x48 | G3 |
| 11 | `quad-burst` | Big clear burst | effect | effects/explosion | none | 96x96 | G3 |
| 12 | `gridline-emblem` | Title emblem | ui | interface/icon | none | 96x64 | G4 |
| 13 | `grid-buddy` | Block buddy | creature | characters/npc | front | 48x48 | G4 |
| 14 | `icons-gridline-modes` | Mode icons | icon | interface/icon | none | 32x32 | G4 |
| 15 | `ui-buttons-neon` | Neon buttons | ui | interface/button | none | 96x32 | reused |
| 16 | `ui-panel-neon` | Neon panels | ui | interface/panel | none | 96x64 | reused |
| 17 | `ui-bars-neon` | Neon bars and slider | ui | interface/bar | none | 64x16 | reused |
| 18 | `ui-controls-neon` | Neon checkboxes and cursor | ui | interface/cursor | none | 32x32 | reused |
| 19 | `font-chunky` | Chunky pixel letters | ui | interface/icon | none | 16x20 | reused |
| 20 | `ui-score-counter` | Score counter | ui | interface/panel | none | 96x24 | reused |
| 21 | `ui-timer` | Timer | ui | interface/panel | none | 64x24 | reused |
| 22 | `ui-score-pop` | Score pop | ui | interface/icon | none | 48x32 | reused |
| 23 | `ui-word-pop` | Word pop | ui | interface/icon | none | 96x32 | reused |
| 24 | `confetti` | Confetti | effect | effects/spark | none | 64x64 | reused |

By the plan's puzzle row (section 4: people 1, creatures 1, tilesets 2, objects 6, pickups and icons 4, projectiles 1, effects 4, backgrounds 1, menus 4): creature 1 (the buddy), tilesets 2, interface objects 6 (boxes, panels, counter, gauge, emblem, timer), icons and counters 4 (mode icons, letters, score counter, score pop), effects 5 (four new and confetti), background 1, menus 4 (the neon kit) and the word pop. No projectile: a falling-block game shoots nothing; the junk a player sends is shown by the gauge and `junk-send`.

## Reused assets

Ten core sprites and eight existing sounds. None is changed (`reusedChanges` is empty). The core sprites keep their own swatch lists; the settings below are the ones that sit best on Gridline, and the kit page may list them as the starting versions.

| id | What it is for here | Use it with |
|---|---|---|
| `ui-buttons-neon` | Title menu, mode select, pause menu buttons | `{ face: derelict.plate, frame: derelict.cyan }` ("Square cyan" family) |
| `ui-panel-neon` | Options screen, high-score table, the mode description box | the same face and tube |
| `ui-bars-neon` | Progress to the next level; options sliders | `{ frame: derelict.cyan }` |
| `ui-controls-neon` | Options checkboxes; the menu pointer and selector | `{ frame: derelict.cyan }` |
| `font-chunky` | Every word: the game's name under the emblem, HOLD and NEXT in the box tabs, panel headings, labels | its own versions ("Gold title" for the name) |
| `ui-score-counter` | The score | version "Big strip" |
| `ui-timer` | Timed and sprint rounds | version "Long clock" |
| `ui-score-pop` | Points rising over a cleared line | versions "+100" to "+1000" |
| `ui-word-pop` | Ready, Go!, Level up, Combo, Perfect, Game over | its versions; `clear` and `perfect` for a cleared board |
| `confetti` | A new best score, over the record panel | version "Glitter" |

| Sound id | Style | What it is for here |
|---|---|---|
| `menu-console-move` | "List", "Grid", "Tab" | moving through menus and the mode grid; cued by `ui-buttons-neon` `tab-active` |
| `menu-console-confirm` | "Start game", "Select" | starting a round, choosing a mode; cued by `ui-buttons-neon` `pressed` |
| `menu-console-back` | "Back", "Cancel" | leaving a menu |
| `menu-console-open` | "Pop-up" | the pause panel opening and closing |
| `menu-console-toggle` | "Switch on", "Switch off" | options; cued by `ui-controls-neon` |
| `countdown-go` | "Chiptune" | Ready and Go! (cued by `ui-word-pop`) |
| `level-up` | "Chiptune" | a new level (cued by `ui-word-pop`) |
| `game-over` | "Chiptune" | the stack reaching the top, with the game-over panel (cued by `ui-word-pop`) |

The reused sprites also cue `xp-blip`, `timer-tick`, `quest-complete` and `chime-success` (`confetti` `burst` frame 0), which are in `sounds/`; the kit lists its 24 and those four come with the sprites that cue them.

## New helpers

Every function below does not exist today (checked against every `export` in `engine/` on 2026-11-19: there is no `engine/blocks.js`, and no `chips` in `engine/fx.js` or `gridLines` in `engine/backdrop.js`). They are built **before** any sprite that uses them, in the helper batches GH1 and GH2 (GH0, first, changes the kit checks, not drawing code), by the skill's rules for the framework (Contract 11): tests first, additions only, a doc comment above each export (first line one sentence, then a line naming every argument), the pixel fingerprint of every existing sprite identical before and after. A sprite builder who finds one short of an option adds the option to the same module the same way and lists it in the report; a sprite file never holds generic drawing code. One builder per module at a time.

### GH0: the kit checks, a size per plan and kits with no player

Not drawing code, but it comes first: without it the acceptance suite can never pass for this kit (see [What is different](#what-is-different-about-this-kit)). **Owner:** the builder of GH0, after the Loadout owner (Keyang) has said yes to the rule change, recorded as a note under goal G1 in `docs/progress.md`. Goal G1 itself (three kits for the top three game types at 40 to 50 sprites, 20 sounds and 2 tracks) does not change: those three kits keep `KIT_SIZE`.

- **`tools/lib/assets.mjs`:** `KIT_SIZE` stays exactly as it is (the unit test "the size of a full kit is the one the acceptance criterion gives" is untouched). New export `kitSize(plan)` → `{ sprites: [lo, hi], sounds: [lo, hi], music: [lo, hi] }`: the plan's own `size` when it has one, else `KIT_SIZE`. `loadPlans` throws, naming the file, when a plan has a `size` but its `gameType` is not `puzzle`, or a range is not two whole numbers with lo ≤ hi. This plan's `size` is `{ "sprites": [20, 30], "sounds": [20, 26], "music": [2, 4] }` (already in `kit-puzzle-gridline.plan.json`; nothing reads it until GH0).
- **`tests/helpers/kits.mjs`:** `sizeProblems(bundle, plan)` checks against `kitSize(plan)` and says that size in its sentence; `kitProblems` passes its plan.
- **`tools/bundles-from-plans.mjs`:** the size note uses `kitSize(plan)`, so a kit inside its own size prints none.
- **`tests/e2e/three-bundles.spec.mjs`:** the per-kit test passes the plan to `sizeProblems` and its message gives that plan's size (not the fixed "40 to 50 sprites, 20 sounds and 2 music tracks"). When no sprite in the kit has role `characters/player`, allowed only for a plan with `gameType` `puzzle` and `view` `none`, the test still opens every asset and the playground, checks the whole scene is painted and nothing errors, and skips the player, mode and arrow-key checks with a line saying why. A kit with no player that is not such a puzzle kit fails, saying so.
- **`tests/unit/build-kit-plans.test.mjs`:** "the bundle files on disk are what the plans say" reads `bundles/<id>.json` for every plan, so it fails today for this plan (checked 2026-11-19: ENOENT on `bundles/kit-puzzle-gridline.json`; 19 tests in it and `build-kits-helper.test.mjs`, 18 pass, 1 fail). GH0 makes it compare only plans whose bundle is written and whose assets are all in (`--check` already lists the rest as still to come); it passes again with 19 of 19.
- **The playground:** the builder first looks at what `app/play-page.js` (and `app/play/roles.js`) shows for a bag with no `characters/player` sprite. If it does not paint a whole scene from the kit's tiles and backdrop, GH0 makes it do so, with `playState()` giving `player: null`.
- **Tests:** `kitSize` of a plan with no `size` is `KIT_SIZE`; of this plan, its own; a non-puzzle plan with a `size` throws, naming its file; `sizeProblems` with and without a plan. The three existing kits pass `three-bundles.spec.mjs` exactly as before (40 to 50, 20, 2, and a player the arrow keys move).

### GH1: `engine/blocks.js` (new module): cells, schemes, symbols, the well, block faces

Why: nothing in the framework draws a puzzle cell in several finishes, knows a set of block colours, draws a cell symbol, a field cell with a grid, a well wall, a block-cornered frame, a standing gauge, or the cells of a four-cell piece. Imports only `engine/color.js` (`ramp`, `tone`, `pick`, `INK`), `engine/shapes.js` (`ringIn`, `crossIn`, `placedIn`) and `engine/palettes.js` (`PALETTE`).

| Export | Signature | What it does |
|---|---|---|
| `BLOCK_STYLES` | frozen list | `'bevel'`, `'gem'`, `'glass'`, `'pillow'`, `'frame'` |
| `BLOCK_SCHEMES` | frozen object | `{ prism, ember, ocean, mono }`, each a frozen list of seven Gridline colour names (table above) |
| `BLOCK_SYMBOLS` | frozen list | `'disc'`, `'ring'`, `'plus'`, `'diamond'`, `'bar'`, `'triangle'`, `'square'`, `'cross'`: slots 1 to 7, then junk |
| `blockScheme` | `blockScheme(name)` → list of 7 hex | The colours of a scheme from `PALETTE.gridline`. An unknown name throws, listing the schemes |
| `blockCell` | `blockCell(g, x, y, size, colour, { style = 'bevel', edge = 2, symbol = null, shine = false, ink = INK } = {})` → `{ face }` | One cell filling the square (x, y, size): a 1 px `ink` line on all four sides, then the finish in the colour's ramp. `bevel`: a band `edge` px wide, `light` on the top and right, `dark` on the bottom and left, flat `base` face. `gem`: four facets (top `light`, right and left `base`, bottom `dark`) meeting at a flat centre square `2 x edge` px across. `glass`: face one tone lighter, a 1 px `light` rim `edge` px in, a diagonal 2 px `light` streak from the top-right corner. `pillow`: corners cut by `edge` px, a `light` patch top-right, a 1 px `dark` band bottom-left. `frame`: a ring of the colour `edge` px wide round a `dark` face. `symbol` (a name of `BLOCK_SYMBOLS`) draws it with `blockSymbolIn` in `pick(colour, light, dark)`. `shine`: a 5 px L of white in the top-right corner, inside the ink. `face` is the flat rectangle left inside the finish. Draws only inside the square |
| `blockSymbolIn` | `blockSymbolIn(name, cx, cy, size)` → shape test | The symbol `size` px across centred on (cx, cy) |
| `ghostCell` | `ghostCell(g, x, y, size, colour, { style = 'line', ink = INK } = {})` | The landing preview: `ink` square line at the edge, a 1 px line of `colour` inside it, the middle left see-through. `style`: `'line'` (solid) or `'dash'` (2 px on, 2 off) |
| `fieldCell` | `fieldCell(g, x, y, size, floor, { grid = 'lines', alt = false } = {})` | An empty field cell, opaque: `floor` (or `tone(floor, 0.25)` with `alt`), and the grid: `'lines'` a 1 px line of `ramp(floor).light` along the top row and left column (so a field of them shows a grid with a line on every side), `'dots'` a 2x2 dot at the top-left corner, `'none'` bare |
| `wellRim` | `wellRim(g, piece, { size = 16, style = 'tube', edge = 6, texture = 0.5, frame, glow, ink = INK } = {})` | One wall piece of the field (`piece`: `'l'`, `'r'`, `'floor'`, `'floor-l'`, `'floor-r'`, `'cap-l'`, `'cap-r'`). The wall is `edge` px wide on the field side of the tile, the rest see-through: from the field outwards an `ink` line, a 1 px `glow` light line, an `ink` line, the wall face in `frame` (`tube`: a rounded tube, `light` core line; `plate`: a bevelled plate with rivets every 4 to 12 px by `texture`; `dotted`: a rail of 2x2 dots, spacing by `texture`), an outer `ink` line. Corners and caps join their neighbours to the pixel at every `edge` and `style` |
| `cornerBlocks` | `cornerBlocks(g, rect, { size = 6, colour, style = 'bevel', skip = [], ink = INK } = {})` | A small `blockCell` in each corner of `rect` (a panel's body), overlapping the frame band; never inside any rectangle of `skip` (pass the text areas). The Gridline interface finish over `panel9`, `techPanel` or a neon piece |
| `gaugeColumn` | `gaugeColumn(g, x, y, w, h, { frame, border = 0.5, corner = 0.5, ink = INK } = {})` → `{ opening }` | A standing bar housing (frame, band, dark trough); `opening` is the trough a fill fits exactly |
| `gaugeFill` | `gaugeFill(g, opening, value, { fill, marks = 0, flash = 0, ink = INK } = {})` | Fills the trough **from the bottom** to `value` (0..1), `marks` > 0 drawing a 1 px `dark` line every `marks` px across it; `flash` 0..1 mixes it to white |
| `pieceCells` | `pieceCells(kind)` → `[[col, row], ...]` | The four cells of a four-cell piece, `kind` one of `'square'`, `'line'`, `'zig'`, `'zag'`, `'ell'`, `'jay'`, `'tee'` (the genre's common shapes, named in plain words), top-left at (0, 0), **always lying flat**: `square` 2x2, `line` 4 wide and 1 tall, the other five 3 wide and 2 tall |
| `statMarkIn` | `statMarkIn(name, cx, cy, size)` → shape test | A counter's picture, `size` 10 to 12 px: `'level'` two stacked up chevrons, `'lines'` three stacked bars, `'speed'` a down arrow with two speed lines, `'combo'` two linked squares |
| `blockEyes` | `blockEyes(g, cx, cy, size, { style = 'round', mood = 'calm', ink = INK } = {})` | Two eyes for a block body: `style` `'dots'` (2x2 ink), `'round'` (white with an ink pupil), `'visor'` (one white bar with two ink dots); `mood` `'calm'`, `'happy'` (upturned arcs), `'wide'` (pupils small, whites bigger), `'flat'` (1 px lines) |

**First, the palette test:** in `tests/unit/palettes-core.test.mjs` the palette list of "bundle ids and short names reach the same palette" becomes `['derelict', 'gridline', 'hearthvale', 'thornwood']`; the file must pass (18 tests, 18 pass, 0 fail; today it is 17 pass, 1 fail) before anything else in GH1 lands.

**Test:** `tests/unit/blocks.test.mjs`. (1) `blockScheme` of every scheme returns 7 distinct Gridline colours with no `red`; in `prism` and `mono` every two slots differ in brightness by 0.03 or more; an unknown name throws. (2) `blockCell` in every style, `edge` 1 to 3 and sizes 8, 10 and 16: the outer ring is all `ink`, nothing outside the square, `face` lies inside the finish and is one colour; with `shine` 5 white pixels more; every style differs from every other by 12 or more pixels at size 16. (3) Every symbol differs from every other by 6 or more pixels at size 6. (4) `ghostCell` leaves its middle empty. (5) A 3x3 field of `fieldCell` with `'lines'` shows a line between every two cells and one on the outer top and left only; with `'none'` one colour. (6) `wellRim` pieces laid as a 4x5 well join to the pixel at `edge` 4, 6 and 10 in every style. (7) `cornerBlocks` never draws inside a `skip` rectangle. (8) `gaugeFill` at 0.25 fills the bottom quarter of the opening, nothing above it. (9) `pieceCells` gives four connected cells for every kind, lying flat (no kind taller than 2 rows); no two kinds are the same shape. (10) `statMarkIn` names differ by 8 or more pixels at size 11. (11) `blockEyes` moods differ pairwise by 3 or more pixels. (12) Same arguments, same pixels.

### GH2: `engine/fx.js` and `engine/backdrop.js` (one function each, appended)

A sprite imports `chips` from `'../engine/fx.js'` and `gridLines` from `'../engine/backdrop.js'`; there is no `engine/fx-chips.js` or `engine/backdrop-grid.js`. The tests keep their own files.

| Module | Export | Signature | What it does |
|---|---|---|---|
| `engine/fx.js` | `chips` | `chips(g, o)`, `o: { t, x, y, count, seed, dist, gravity, size, shrink, angle, arc, colour \| colours, box }` | Square chips thrown from (x, y): each a filled square `size` px (default 4) that flies out along its own angle in `arc`, falls by `gravity`, and shrinks one pixel at a time by `shrink` (0..1) of the clip; one-shot over the clip; colours step from hot to rim as `particles` do; the last frame keeps every chip as at least a 2x2 square inside the box, and a chip that reaches the box edge stops there, whole. The block-game partner of `shards` and `particles` (which end as single pixels and discs) |
| `engine/backdrop.js` | `gridLines` | `gridLines(g, { pitch = 20, colour, x0 = 0, y0 = 0, every = 1, accent, accentEvery = 0 } = {})`; `every` and `accentEvery` each take one whole number for both directions, or a pair `[across, down]` (`across` counts the vertical lines met going across, `down` the horizontal lines met going down) | 1 px lines every `pitch` px across the whole layer, vertical and horizontal, starting at (x0, y0) modulo `pitch`; `every` n draws only every n-th line; `accentEvery` n > 0 draws every n-th drawn line in `accent`. The layer wraps in a direction when `pitch` x `every` x `accentEvery` (taking 0 as 1) for that direction divides the layer's size in it. On 320x180 with pitch 20 that is 16 lines across and 9 down: plain lines wrap both ways, every fourth line accented wraps across only (9 is not a multiple of 4), and `accentEvery: [4, 3]` wraps both ways |

**Tests:** `tests/unit/fx-chips.test.mjs`: (1) the last frame of a one-shot keeps `count` squares of 2x2 or more, inside the box; (2) frame 0 at `size` 4 has `count` 4x4 squares; (3) same arguments, same pixels. `tests/unit/backdrop-grid.test.mjs`: (1) with pitch 20 on 320x180 the left column equals the column after the right edge and the top row the row after the bottom (it wraps); (2) `accentEvery` 4 colours every fourth line; (3) nothing but lines is drawn; (4) `accentEvery: [4, 3]` on 320x180 wraps both ways. `fx-chips` also: (4) chips thrown into the box edge stay whole squares.

## New sprites

### Tiles and backdrop

#### `gridline-blocks` · Block skins

- **Meta:** type `tileset`, role `world/tile`, view `none`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`; words `block`, `cell`, `brick`, `square`, `piece`, `falling`, `stack`, `ghost`, `clear`, `lock`, `tetromino`. Batch **G1** (pathfinder: sets the block look the emblem, the buddy and the corner blocks use).
- **Frame:** 16x16, pivot [8, 8]; fills the frame (a deviation: see [What is different](#what-is-different-about-this-kit)).
- **Clips (11), in this order:** `cell-1` 1 ("Colour 1") · `cell-2` 1 · `cell-3` 1 · `cell-4` 1 · `cell-5` 1 · `cell-6` 1 · `cell-7` 1 (labels "Colour 2" to "Colour 7") · `junk` 1 ("Junk block") · `ghost` 1 ("Landing preview") · `lock` 6 ("Lock in": an overlay of light the game plays over each cell of a piece as it locks; frame 0 the inside of the cell white (`cream`) within an ink-free 1 px margin, 1 to 4 a 2 px white band running round the cell edge clockwise and thinning, 5 a white 2x2 in each corner) · `clear` 6 ("Clear": the cell itself, drawn complete, going: frame 0 the slot-1 cell, 1 all white inside its ink, 2 to 4 the white square shrinking 2 px a frame towards the centre, ink kept round it, 5 a 2x2 `cream` core). `lock` and `clear` play at `14 * lerp(0.65, 1.45, speed)` fps.
- **Parts:** none.
- **Controls (8):** `style` (choice: bevel | gem | glass | pillow | frame; default bevel; `BLOCK_STYLES`) · `scheme` (choice "Colours": prism | ember | ocean | mono; default prism; sets the seven `cell-*` colours from `BLOCK_SCHEMES`) · `edge` (slider "Edge": Thin / Deep; whole numbers 1 to 3, step 1, default 2; in every style: the bevel band, the gem's centre, the glass rim, the pillow's cut, the frame's ring) · `mark` (choice "Symbols": none | shapes; default none; shapes: each slot's own 6x6 symbol from `BLOCK_SYMBOLS`, junk a cross; at least 12 px on `cell-1` (a 4x4 disc with its tone ring); in every style) · `shine` (toggle "Shine", default false: a 5 px white L in the top-right corner of every cell and of `junk`; in every style) · `junk` ("Junk": the junk rows a rival sends; default slate; swatches exactly `slate`, `dusk`, `plum`, `line`, `mist`: 5; declare `material: 'stone'`; `junk` always also carries two 1 px diagonal lines in its `dark` tone, so it never passes for a block of the `mono` scheme) · `glow` ("Ghost": the landing preview line; default cyan; swatches exactly `cyan`, `pearl`, `lemon`, `mint`: 4; declare `material: 'light'`) · `speed` (Slow / Fast; default 0.5). Junk and ghost never share a clip; their lists share no colour all the same.
- **Sounds:** none (see [What is different](#what-is-different-about-this-kit): the game plays `block-lock` once per piece and `line-clear` once per line).
- **Versions (5), judged on the tile sheet** (`engine/versions.js` `VERSION_RULES.picture` uses `tileSheet` for a tileset: six evenly sampled clips, here `cell-1`, `cell-2`, `cell-4`, `cell-6`, `junk` and `lock`, so a version must differ from the defaults across that sheet, not on one cell; builders check that sheet): **Prism bevel** `{}` · **Ocean gems** `{ style: 'gem', scheme: 'ocean' }` · **Ember glass** `{ style: 'glass', scheme: 'ember', shine: true }` · **Mono with symbols** `{ scheme: 'mono', mark: 'shapes' }` · **Hollow frames** `{ style: 'frame', edge: 3 }`.
- **Helpers:** `engine/blocks.js` (new, GH1: `BLOCK_STYLES`, `BLOCK_SCHEMES`, `BLOCK_SYMBOLS`, `blockScheme`, `blockCell`, `ghostCell`), `engine/color.js` (`ramp`, `INK`), `engine/motion.js` (`lerp`, `keys`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: the symbols and the shine L.
- **Look and motion:** The skins a falling-block game is built from: seven colours of one cell, a junk cell, the outline that shows where a piece will land, a flash for locking and a cell that clears. Each finish is a clean, bright square with a hard ink edge; on the dark field a stack reads at once. Nearest existing: none (no 16 px cell in the library). **Not** the reference game's seven-colour set: see [Originality](#what-is-different-about-this-kit).

#### `gridline-well` · Playing field

- **Meta:** type `tileset`, role `world/tile`, view `none`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`; words `field`, `well`, `board`, `grid`, `playfield`, `wall`, `border`, `pit`, `danger`, `goal`. Batch **G1**.
- **Frame:** 16x16, pivot [8, 8]; fills the frame except the rim pieces' see-through outer side (a deviation: see [What is different](#what-is-different-about-this-kit)).
- **Clips (12), in this order:** `field-fill` 1 ("Empty cell") · `field-alt` 1 ("Empty cell, other shade": the floor one tone lighter, for a game that shades alternate columns or a checker) · `rim-l` 1 ("Left wall") · `rim-r` 1 ("Right wall") · `rim-floor` 1 ("Floor under the field") · `rim-floor-l` 1 ("Bottom-left corner") · `rim-floor-r` 1 ("Bottom-right corner") · `rim-cap-l` 1 ("Top of the left wall") · `rim-cap-r` 1 ("Top of the right wall") · `spawn` 8 loop ("Entry cell, where new pieces appear": the field cell with a dashed Lights square breathing 1 px in and out) · `danger` 8 loop ("Danger cell, in the top rows while the stack is high": the field cell with 2 px diagonal stripes of the Danger colour sliding one pixel a frame, brightening on frames 0 to 3) · `target` 1 ("Goal line cell, for rounds that clear down to a line": the field cell with a 2 px Lights line along its top row and a 4x4 notch at its left end). Animated clips play at `6 * lerp(0.65, 1.45, speed)` fps.
- **Laying it:** 10 columns by 20 rows of `field-fill` (or `field-alt` where the game wants), `rim-l` down the left and `rim-r` down the right, `rim-floor` along the bottom with the two corners, `rim-cap-l` and `rim-cap-r` on top of the walls. These names are placed by the game, not by the picker: no piece is called `-top`, `-left`, `-right` or `-fill` except `field-fill`, the field's one fill.
- **Parts:** none.
- **Controls (9):** `style` (choice: tube | plate | dotted; default tube; the wall: `wellRim`) · `grid` (choice "Grid": lines | dots | none; default lines; what the empty cells show) · `edge` (slider "Edge": Thin / Deep; whole numbers 4 to 10, step 1, default 6: the wall's width from the field side) · `texture` (slider: Plain / Busy; default 0.5: marks on the wall, rivets, ticks or dot spacing by style; at least 12 px across a wall piece between ends) · `floor` ("Field floor": default well; swatches exactly `well`, `line`, `deep`, `plum`: 4) · `frame` ("Walls": default mist; swatches exactly `mist`, `steel`, `pearl`, `sky`: 4) · `glow` ("Lights": the wall's light line, the entry square and the goal line; default cyan; swatches exactly `cyan`, `mint`, `lime`, `lemon`: 4) · `warn` ("Danger": default red; swatches exactly `red`, `coral`, `rose`, `gold`: 4) · `speed` (Slow / Fast; default 0.5). Floor touches the walls and the danger stripes; the lights line lies between ink lines on the wall: the four lists share no colour, and floor (0.20 to 0.32) and walls (0.66 to 0.91) are far apart in brightness.
- **Sounds:** none (the game plays `danger-pulse` once while danger rows show).
- **Versions (4), judged on the tile sheet** (`VERSION_RULES.picture` → `tileSheet`: `field-fill`, `rim-l`, `rim-floor`, `rim-floor-r`, `rim-cap-r` and `danger`; "Steel plate" differs there by the plate wall with rivets and the steel frame on the four rim pieces as well as the floor, not by the floor colour alone; builders check that sheet): **Tube field** `{}` · **Steel plate** `{ style: 'plate', frame: gridline.steel, floor: gridline.line }` · **Dotted plum** `{ style: 'dotted', grid: 'dots', floor: gridline.plum, glow: gridline.lime }` · **Deep, no grid** `{ grid: 'none', floor: gridline.deep, edge: 4 }`.
- **Helpers:** `engine/blocks.js` (new, GH1: `fieldCell`, `wellRim`, `ghostCell` with `'dash'` for `spawn`), `engine/solids.js` (`stripesIn`), `engine/color.js` (`ramp`, `tone`, `INK`), `engine/motion.js` (`pulse`, `lerp`), `engine/palettes.js` (`PALETTE`). Look at it with `node tools/tilemap.mjs gridline-well` only for the joins; the real check is a 12x22 map in `tools/scene.mjs` with `gridline-blocks` cells stacked on it, under Sunset, Night, Handheld and Mono.
- **Drawing:** pixel. Detail layer: grid lines and dots, rivets and ticks, the danger stripes.
- **Look and motion:** The well the blocks fall into: a dark floor with a calm grid, lit walls on three sides, a breathing entry square at the top, red stripes that crawl through the top rows when the stack climbs, and a goal line for line-target rounds.

#### `bg-gridline` · Grid backdrop

- **Meta:** type `background`, role `environment/background`, view `none`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`, `shooter`; words `grid`, `backdrop`, `void`, `neon`, `shapes`, `night`, `abstract`, `space`, `lines`, `glow`. Batch **G1**.
- **Frame:** 320x180, pivot [160, 180].
- **Clips (3):** `far` 1 · `mid` 8 loop · `near` 8 loop (4 fps; `speed` scales it).
- **Layers.** A dark interior: values run dark to light from far to near (style guide section 7). `far`: opaque, three bands of the Space colour darkening upwards, a 1 px grid by `gridLines` (pitch 20, `accentEvery: [4, 3]`: every fourth line across and every third line down in the Grid lines colour's `light` tone, because the layer holds 16 lines across and 9 down), and sparse 2x2 lights; it wraps both ways, so a 640x360 game lays it two by two. `mid`: towers of 8 px cells rising from the bottom (20 to 70 px by `height`), spaced on 320 / 8, a few cells lit and blinking each on its own phase, and outlined floating shapes above them (squares, rings, plus signs and four-cell pieces from `pieceCells`) pulsing in brightness; a strip at least 8 rows high along the bottom. `near`: a band of large 16 px cells along the bottom 16 to 28 px tall, the lightest of the three yet darker than the field walls, with a 1 px lit line along its top whose light runs left to right and wraps. Everything through `recede`; no outline.
- **Parts:** none.
- **Controls (8):** `sky` ("Space": default well; swatches exactly `well`, `line`, `deep`, `plum`: 4) · `land` ("Stacks": the towers and floating shapes; default violet; swatches exactly `violet`, `teal`, `hero`, `dusk`: 4) · `haze` ("Grid lines": default slate; swatches exactly `slate`, `mist`, `coral`, `mint`: 4) · `glow` ("Lights": lit cells, the moving line and the 2x2 lights; default cyan; swatches exactly `cyan`, `lemon`, `rose`, `pearl`: 4) · `height` (Short / Tall; default 0.5) · `density` (slider "Floating shapes": Few / Many; whole numbers 4 to 12, step 1, default 8; scattered with `scatter(count, seed, { stable: true })`) · `style` (choice "Shape kind": squares | rings | pieces | mixed; default mixed) · `speed` (Slow / Fast; default 0.5). Space sits behind the grid lines and the stacks, the lights sit on the stacks: the four lists share no colour.
- **Sounds:** none.
- **Versions (4), on `far`:** **Night grid** `{}` · **Plum haze** `{ sky: gridline.plum, haze: gridline.coral }` · **Deep sea** `{ sky: gridline.deep, haze: gridline.mint, land: gridline.teal }` · **Bright lines** `{ haze: gridline.mist, glow: gridline.lemon, density: 12 }`.
- **Helpers:** `engine/backdrop.js` (`layerClips`, `fillBands`, `fillBelow`, `highest`, `wrapX`, `wrapped`, `scatter`, `recede`, `hazed`, `tidy`; `gridLines` new, GH2), `engine/blocks.js` (new, GH1: `pieceCells`), `engine/shapes.js` (`ringIn`, `crossIn`), `engine/motion.js` (`pulse`, `fract`), `engine/palettes.js` (`PALETTE`). The blurb gives the scroll speeds far 0.1, mid 0.4, near 0.7, for a game that does scroll it (a menu).
- **Drawing:** pixel. Detail layer: the 2x2 lights and the lit cells.
- **Look and motion:** The space behind the well: a deep grid, towers of cells with windows of light, and shapes floating and pulsing. **Not** a sunset over a grid floor running to a horizon: no sun, no perspective floor, no palm trees.

### Interface

What all four interface rows share. `style` picks the base: **`blocks`** (the kit's own finish: `panel9` style `'plain'` of `engine/ui.js`, square corners, then `cornerBlocks` in the Corner blocks colour), **`plate`** (`techPanel` style `'plate'` of `engine/ui.js`: cut corners and a lit edge) or **`tube`** (the neon piece of core part 3: `skinPanel` / `skinBarHousing` with skin `'flat'` and `moreSkinBase('neon', 'tube')`, `roundSlab` with `moreSkinCuts('neon', corner)`, `moreSkinMarks` with skin `'neon'`). Every row's Helpers line names each of these its styles call. Each helper is passed the frame minus 1 px on every side and is never outlined again. Colours: **Box or Panel** face (`well`, `line`, `deep`, `plum`), **Frame** (`steel`, `cyan`, `lemon`, `pearl`), **Corner blocks** (`rose`, `mint`, `lime`, `gold`, `coral`): three lists with no colour in common, measured above; the tube style passes them through `skinSwatches('flat', ...)` of `engine/ui-skins.js`, which keeps all of them. White text. `corner` is in effect only where corners can round: **when** `{ style: ['tube', 'plate'] }` (the blocks style keeps square corners because the corner blocks sit there). Corner blocks are 6 px cells drawn with `cornerBlocks` (`skip`: every text area) in the `bevel` finish.

#### `ui-piece-box` · Next and hold boxes

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`; words `next`, `hold`, `preview`, `queue`, `box`, `swap`, `store`, `piece`, `frame`, `window`. Batch **G2**.
- **Frame:** 96x64, pivot [48, 32].
- **Clips (5), in this order:** `hold` 1 ("Hold box, keeping a piece for later": the title tab over the left half of the top edge) · `next` 1 ("Next box, showing the piece to come": the tab over the right half, and a 5x3 down chevron in the frame band under it) · `queue` 1 ("Queue slot, for the pieces after the next one": no tab, the frame band 1 px thinner) · `hold-used` 1 ("Hold box after a swap, until the piece lands": as `hold` with the frame in its `dark` tone and the corner blocks in `desaturate` grey: the box cannot be used again yet) · `swap` 4 ("Swap flash, the moment a piece goes into hold": frame 0 the frame band and corner blocks white, 1 and 2 mixing back, 3 as `hold`; 8 fps fixed).
- **Text and stretch:** two text areas on every clip that has a tab: the tab strip (the game prints HOLD or NEXT with `font-chunky`) and the piece area (the game draws the piece there); `queue` has the piece area only. **The piece area is at least 66x34 px** (a four-cell piece at 16 px, with 1 px to spare) at every `border` and `style`, and both areas hold only the face colour. `slice` per clip from the helper's return, plus 1 px.
- **Parts:** none.
- **Controls (7):** `style` (choice: blocks | plate | tube; default blocks) · `corner` (Square / Round; default 0.5; **when** `{ style: ['tube', 'plate'] }`) · `border` (Thin / Thick; default 0.5; in every style) · `tab` (toggle "Title tab", default true; in every style; with it off `hold`, `next` and `hold-used` lose the tab and its text area) · `face` ("Box": default well; swatches exactly `well`, `line`, `deep`, `plum`: 4; declare `material: 'paint'`) · `frame` ("Frame": default steel; swatches exactly `steel`, `cyan`, `lemon`, `pearl`: 4; declare `material: 'paint'`) · `accent` ("Corner blocks": default rose; swatches exactly `rose`, `mint`, `lime`, `gold`, `coral`: 5; declare `material: 'paint'`; **when** `{ style: ['blocks'] }`). No `speed`: the one animated clip has 4 frames (style guide section 10).
- **Sounds:** `swap` frame 0 → `block-hold` style "Swap", volume 0.6.
- **Versions (5), on `hold`:** **Block corners** `{}` · **Pearl plate** `{ style: 'plate', frame: gridline.pearl, corner: 1 }` · **Neon tube** `{ style: 'tube', frame: gridline.cyan, face: gridline.deep }` · **Lemon on plum** `{ face: gridline.plum, frame: gridline.lemon, accent: gridline.mint }` · **No tab, thick** `{ tab: false, border: 1, accent: gridline.gold }`.
- **Helpers:** `engine/ui.js` (`panel9`, `techPanel`, `slice9`, `desaturate`, `triangle`), `engine/ui-skins.js` (`skinPanel`, `skinSwatches`, `SKIN_TEXT`), `engine/ui-candy-slab.js` (`roundSlab`), `engine/ui-skins-more.js` (`moreSkinBase`, `moreSkinCuts`, `moreSkinMarks`), `engine/blocks.js` (new, GH1: `cornerBlocks`), `engine/color.js` (`mix`, `INK`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: corner blocks, the chevron.
- **Look and motion:** The boxes beside the well: a held piece on the left, the next one and the queue on the right, each a dark window with a lit frame and small blocks at its corners; a used hold box greys out until the piece lands. Nearest existing: `ui-panel-neon` (a plain panel with no tab and no states).

#### `ui-gridline-panels` · Round panels

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`; words `pause`, `results`, `game over`, `record`, `best`, `panel`, `popup`, `score`, `summary`, `screen`. Batch **G2**.
- **Frame:** 96x64, pivot [48, 32].
- **Clips (4), in this order:** `pause` 1 ("Pause panel, while the game is stopped": the title strip, and a 13x13 badge in the top-left corner block's place with two 3x9 bars, outside every text area) · `results` 1 ("Results panel, when a round ends with its numbers": the title strip, and the middle split by a 1 px frame-coloured divider into two text areas, labels on the left and numbers on the right) · `game-over` 1 ("Game over panel, after the stack reaches the top": the two top corner blocks fallen to sit beside the bottom ones, and a 5 px notch broken out of the top frame band) · `record` 8 loop ("New best panel, while a record score is shown": the corner blocks blink one after another round the panel to `gold` (reward, fixed), or to `cream` when the Corner blocks colour is itself `gold`, so the blink always shows, and a 3 px light runs along the frame band; with `style` `plate` or `tube` the light runs alone).
- **Text and stretch:** text areas: the inner area on every clip (two on `results`) and the title strip where there is one; only the face colour inside them, in every style. `slice` per clip, plus 1 px.
- **Parts:** none.
- **Controls (8):** `style` (choice: blocks | plate | tube; default blocks) · `corner` (Square / Round; default 0.5; **when** `{ style: ['tube', 'plate'] }`) · `border` (Thin / Thick; default 0.5; in every style) · `title` (toggle "Title strip", default true; in every style; a strip 10 px tall across the top of the inner area, the face's `dark` tone under a 1 px frame line, with its own text area) · `face` ("Panel": as `ui-piece-box` Box: 4; `material: 'paint'`) · `frame` ("Frame": as `ui-piece-box`: 4; `material: 'paint'`) · `accent` ("Corner blocks": as `ui-piece-box`: 5; `material: 'paint'`; **when** `{ style: ['blocks'] }`) · `speed` (Slow / Fast; default 0.5; `record` at `8 * lerp(0.65, 1.45, speed)` fps).
- **Sounds:** none (the game plays `menu-console-open` "Pop-up" with `pause`, `game-over` "Chiptune" with `game-over`, `new-record` "New best" with `record`).
- **Versions (5), on `pause`:** **Block panel** `{}` · **Pearl plate** `{ style: 'plate', frame: gridline.pearl }` · **Neon** `{ style: 'tube', frame: gridline.cyan, face: gridline.deep }` · **Plum and lemon** `{ face: gridline.plum, frame: gridline.lemon }` · **No title** `{ title: false, border: 1, accent: gridline.mint }`.
- **Helpers:** as `ui-piece-box`, plus `engine/motion.js` (`pulse`, `lerp`).
- **Drawing:** pixel. Detail layer: corner blocks, the pause bars, the notch.
- **Look and motion:** The three screens round a round, in one family: a pause panel with a pause badge, a results panel split into labels and numbers, a game-over panel whose corner blocks have tumbled, and a record panel whose corners light up in turn. Nearest existing: `ui-panel-neon` (one plain panel, a title, a list well and a tooltip).

#### `ui-stat-counter` · Level and lines counter

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`; words `level`, `lines`, `counter`, `stage`, `speed`, `combo`, `digits`, `hud`, `number`, `count`. Batch **G2**.
- **Frame:** 64x24 (a deviation, as `ui-timer`), pivot [32, 12], `grounded: false`.
- **Clips (4), in this order:** `idle` 1 ("Showing a number": the sample `12`, right-aligned, the empty windows in the Windows colour) · `roll` 6 ("Count up by one": the last digit rolls from 2 to 3 with `rollDigit`, a quarter window per frame) · `bump` 4 ("Level up flash": frame 0 every digit and the picture white, 1 both 1 px higher, 2 and 3 back at rest; the case never moves) · `frame` 1 ("Empty, for the game's own digits"). `idle`, `roll` and `bump` are `noText: true`.
- **Fit:** the case is `counterPlate` in the box x 1 to 62, y 1 to 22 in every clip; only digits and the picture move, inside the case. The builder tests every frame of `bump` at sizes 0, 0.5 and 1 with 4 digits and every picture: no pixel on the border.
- **Text:** `textArea` on `frame` only: `counterPlate`'s `text` list, white text.
- **Parts:** none.
- **Controls (8):** `style` (choice: plate | strip | drum; default strip; `COUNTER_STYLES`) · `digits` (slider "Digits": Few / Many; whole numbers 2 to 4, step 1, default 3) · `size` (Small / Big; default 0.5: cap 5, 7 or 9) · `icon` (choice "Picture": level | lines | speed | combo; default level: a 10 to 12 px `statMarkIn` picture in the Digits colour with an ink line, sitting in its own square window of the Windows colour left of the digit windows) · `face` ("Windows": default well; swatches exactly `well`, `line`, `deep`, `plum`: 4) · `frame` ("Case": default steel; swatches exactly `steel`, `cyan`, `lemon`, `pearl`: 4; `material: 'paint'`) · `glow` ("Digits": the sample digits and the picture; default lemon; swatches exactly `lemon`, `cyan`, `cream`, `pearl`: 4; declare `material: 'light'`) · `speed` (Slow / Fast; default 0.5). **Readability:** every Digits and Windows pair reaches 3 to 1 under every whole-bundle look (`worstContrast`; worst pair `cyan` on `plum` 3.25, then `lemon` on `plum` 3.37 and `lemon` on `line` 3.41; see [The Gridline palette](#the-gridline-palette)); the old accent list (`mint`, `rose`, `lime`, `gold`, `coral`) is not used here because `rose` on `plum` is 1.76 and `gold` on `line` 2.56. **What touches:** the digits and the picture lie only on the windows, and the windows in the case, so Digits shares no colour with Windows and Windows none with Case. Digits and Case never touch (a window always lies between them), so those two lists may share `cyan`, `lemon` and `pearl`; their defaults (lemon, steel) differ, and no version sets them equal.
- **Sounds:** `roll` frame 1 → `block-shift` style "Soft shift", volume 0.4 · `bump` frame 0 → `combo-chime` style "Combo 4", volume 0.6.
- **Versions (5), on `idle`:** **Level** `{}` · **Lines** `{ icon: 'lines', glow: gridline.cyan }` · **Speed drum** `{ icon: 'speed', style: 'drum', glow: gridline.cream }` · **Combo, two big digits** `{ icon: 'combo', digits: 2, size: 1, glow: gridline.pearl }` · **Plate on plum** `{ style: 'plate', face: gridline.plum, frame: gridline.pearl }`.
- **Helpers:** `engine/counters.js` (`COUNTER_STYLES`, `counterWindows`, `counterPlate`, `rollDigit`), `engine/pixel-font.js` (`fontMetrics`, `drawText`), `engine/blocks.js` (new, GH1: `statMarkIn`), `engine/motion.js` (`lerp`, `keys`), `engine/color.js` (`INK`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: the picture.
- **Look and motion:** The small counters beside the well for level and lines (the score uses `ui-score-counter`): a picture, a row of digit windows, a digit that rolls and a flash on level up. Nearest existing: `ui-score-counter` (96 px, star, coin or heart pictures).

#### `ui-junk-gauge` · Junk gauge

- **Meta:** type `ui`, role `interface/bar`, view `none`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`; words `gauge`, `meter`, `junk`, `garbage`, `attack`, `incoming`, `versus`, `rows`, `warning`, `bar`. Batch **G2**.
- **Frame:** 16x64 (a deviation: a standing bar), pivot [8, 32].
- **Clips (4), in this order:** `frame` 1 ("Empty gauge housing") · `fill` 1 ("Junk rows on their way": the full-height strip a game crops from the top down to the count) · `fill-b` 1 ("Junk about to land, the last moment to clear it") · `flash` 4 ("Gauge flash, when junk is sent or arrives": the strip turning white and back; 8 fps fixed).
- **Stretch:** exports `opening` for the housing and its fills. With `marks` on the fill is a pattern and exports its tile pitch (8 px), not a border (style guide section 8); with `marks` off the middle stretches.
- **Parts:** none.
- **Controls (8):** `style` (choice: blocks | plate | tube; default blocks) · `corner` (Square / Round; default 0.5; **when** `{ style: ['tube', 'plate'] }`) · `border` (Thin / Thick; default 0.5; in every style) · `marks` (toggle "Row marks", default true: a 1 px `dark` line every 8 px across both fills, so the strip reads as rows; in every style) · `frame` ("Frame": default steel; swatches exactly `steel`, `cyan`, `lemon`, `pearl`: 4; `material: 'paint'`) · `fill` ("Junk": default dusk; swatches exactly `dusk`, `slate`, `mist`, `violet`: 4; declare `material: 'stone'`) · `fillB` ("About to land": default red; swatches exactly `red`, `coral`, `rose`, `gold`: 4; declare `material: 'warning'`) · `accent` ("Corner blocks": the two 4 px corner cells of the blocks style; default mint; swatches exactly `rose`, `mint`, `lime`, `gold`, `coral`: 5; declare `material: 'paint'`; **when** `{ style: ['blocks'] }`). No `speed` (the one animated clip has 4 frames). The fills sit in the frame's trough: Frame, Junk and About to land share no colour. The corner blocks sit on the frame band and touch only the frame (`cornerBlocks` gets `skip: [opening]`, so no corner cell reaches the trough or a fill): Corner blocks shares no colour with Frame; it may share `rose`, `gold` and `coral` with About to land, which it never touches, and its default (mint) is in no fill list.
- **Sounds:** `flash` frame 0 → `junk-send` style "Send one", volume 0.6.
- **Versions (4), on `frame`:** **Block gauge** `{}` · **Pearl plate** `{ style: 'plate', frame: gridline.pearl }` · **Cyan tube** `{ style: 'tube', frame: gridline.cyan }` · **Lemon, thick** `{ frame: gridline.lemon, border: 1, fill: gridline.violet, accent: gridline.rose }`.
- **Helpers:** `engine/blocks.js` (new, GH1: `gaugeColumn`, `gaugeFill`, `cornerBlocks` (the blocks style: two 4 px cells in the Corner blocks colour, `bevel` finish, top and bottom, `skip: [opening]`)), `engine/ui.js` (`techPanel` for the plate housing, `slice9`), `engine/ui-skins.js` (`skinBarHousing` with skin `'flat'` for the tube housing, `skinSwatches('flat', ...)` for its colours), `engine/ui-skins-more.js` (`moreSkinBase('neon', 'tube')`, `moreSkinCuts('neon', corner)`, `moreSkinMarks` with `piece: 'housing'`), `engine/ui-candy-slab.js` (`roundSlab`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: row marks, corner blocks.
- **Look and motion:** The bar that stands beside the well in a two-player round and fills with the junk rows a rival has sent, turning red when they are about to land. Nearest existing: `ui-bars-neon` (lying down, health and energy).

### Effects

All four: type `effect`, view `none`, `grounded: false`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`, `shooter`. Light drawn after any outline and rimmed with its own `dark` tone (style guide section 2). Every frame keeps two or more pixels at every setting; the last frame is never empty. Core lists (the white-hot middle): `cream`, `pearl`, `lemon`, `cyan`. No cues (the line or piece that causes them has the sound).

#### `cell-burst` · Cell burst

- **Meta:** role `effects/spark`; words `burst`, `break`, `clear`, `shatter`, `pop`, `chips`, `line`, `block`, `particles`, `vanish`. Batch **G3**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (2):** `burst` 8 (frame 0 a white square 10 to 14 px over the cell; 1 it splits into `pieces` chips; 2 to 7 they fly out and shrink 4, 3, 2 px; the last frame keeps each chip as a 2x2) · `dissolve` 6 ("Dissolve": the cell as a checker of 2x2 squares that blink out from the top row down; the last frame keeps four 2x2 squares in the bottom row). 14 fps times `lerp(0.65, 1.45, speed)`.
- **Parts:** none.
- **Controls (7):** `size` (Small / Big; default 0.5: the first square 10 to 14 px) · `pieces` (slider "Pieces": Few / Many; whole numbers 4 to 8, step 1, default 6) · `spread` (Tight / Wide; default 0.5: chips travel 8 to 14 px) · `style` (choice "Chips": squares | sparks | rings; default squares: square chips; plus-shaped sparks; small rings) · `core` (default cream; swatches exactly `cream`, `pearl`, `lemon`, `cyan`: 4) · `edge` (the chips' colour, which a game sets to the cleared block's colour; default rose; swatches exactly `rose`, `coral`, `lime`, `teal`, `violet`, `mint`: 6) · `speed` (Slow / Fast; default 0.5). Core and edge touch: the lists share no colour.
- **Sounds:** none.
- **Versions (5), on `burst`:** **Rose chips** `{}` · **Lime sparks** `{ style: 'sparks', edge: gridline.lime }` · **Teal rings** `{ style: 'rings', edge: gridline.teal, pieces: 4 }` · **Violet, many** `{ edge: gridline.violet, pieces: 8, spread: 1 }` · **Small coral** `{ size: 0, edge: gridline.coral, core: gridline.pearl }`.
- **Helpers:** `engine/fx.js` (`chips` new, GH2; `steps`, `sparkles`, `ring`), `engine/shapes.js` (`crossIn`, `ringIn`), `engine/motion.js` (`keys`, `lerp`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: none (all of it is light).
- **Look and motion:** What a cleared cell turns into, played on each cell of the line from the middle outwards: a white flash breaking into square chips. Nearest existing: `debris-burst` (metal and goo pieces with gravity), `hit-spark` (a star); this one is square chips that shrink in steps.

#### `drop-streak` · Drop streaks

- **Meta:** role `effects/dust`; words `drop`, `slam`, `streak`, `fall`, `trail`, `speed`, `landing`, `dash`, `lines`, `impact`. Batch **G3**.
- **Frame:** 64x64, pivot [32, 62] (a ground effect: bottom centre; the game places it on the row where the piece landed).
- **Clips (2):** `burst` 6 (frame 0 `pieces` vertical light lines from the landing row up to 40 to 56 px, brightest at the bottom, spread across `width`; 1 to 5 each shortens from the top and thins; the last frame keeps a 2 px tip at the foot of each) · `dust` 6 ("Landing puffs": 2x2 to 3x3 motes spreading left and right along the landing row and rising 2 px; the last frame keeps four 2x2 motes).
- **Parts:** none.
- **Controls (7):** `height` (Short / Tall; default 0.5: 40 to 56 px) · `pieces` (slider "Streaks": Few / Many; whole numbers 2 to 5, step 1, default 3) · `width` (Narrow / Wide; default 0.5: the streaks spread over 16 to 60 px, one to four cells) · `style` (choice: lines | dashes | blocks; default lines: unbroken lines; 3 px dashes; a column of 4x4 squares) · `core` (default cream; as above: 4) · `edge` (default violet; swatches exactly `violet`, `rose`, `lime`, `mint`, `teal`, `coral`: 6) · `speed` (Slow / Fast; default 0.5). Core and edge touch: no shared colour.
- **Sounds:** none.
- **Versions (4), on `burst`:** **Violet lines** `{}` · **Lemon dashes** `{ style: 'dashes', core: gridline.lemon }` · **Wide blocks** `{ style: 'blocks', width: 1, edge: gridline.rose }` · **Tall, five** `{ height: 1, pieces: 5, edge: gridline.mint }`.
- **Helpers:** `engine/fx.js` (`streaks`, `chips` new GH2, `steps`), `engine/motion.js` (`keys`, `lerp`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: none.
- **Look and motion:** The light left above a piece dropped straight down, and the puffs where it lands. Nearest existing: `dodge-trail` (afterimages of a body), `dust-puff` (round puffs).

#### `spin-sparkle` · Spin sparkle

- **Meta:** role `effects/magic`; words `spin`, `twist`, `bonus`, `sparkle`, `swirl`, `trick`, `turn`, `reward`, `star`, `special`. Batch **G3**.
- **Frame:** 48x48, pivot [24, 24].
- **Clips (1):** `burst` 10 (frame 0 a white core 6 px across; 1 to 9 a ring of `pieces` sparks turns round the centre by `twist` while widening from radius 6 to 18, two short arcs trailing; the last frame keeps each spark as a 2x2).
- **Parts:** none.
- **Controls (7):** `size` (Small / Big; default 0.5) · `pieces` (slider "Sparks": Few / Many; whole numbers 4 to 8, step 1, default 6) · `twist` (slider "Turn": Little / Much; default 0.5: a quarter to three quarters of a turn) · `style` (choice: squares | stars | arcs; default squares) · `core` (default cream: 4) · `edge` (default gold, the reward colour; swatches exactly `gold`, `violet`, `rose`, `mint`, `coral`: 5; declare `material: 'light'`) · `speed` (Slow / Fast; default 0.5).
- **Sounds:** none.
- **Versions (4), on `burst`:** **Gold spin** `{}` · **Violet stars** `{ style: 'stars', edge: gridline.violet }` · **Rose arcs** `{ style: 'arcs', edge: gridline.rose, twist: 1 }` · **Small mint** `{ size: 0, edge: gridline.mint, pieces: 4 }`.
- **Helpers:** `engine/bursts.js` (`sparkOrbit`, `sparkFlash`), `engine/fx.js` (`chips` new GH2, `twinkle`, `steps`), `engine/motion.js` (`keys`, `lerp`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: none.
- **Look and motion:** The flourish over a piece turned into a tight slot. Nearest existing: `charge-up` (gathering inward), `fx-heal` (rising plus signs).

#### `quad-burst` · Big clear burst

- **Meta:** role `effects/explosion`; words `clear`, `four`, `burst`, `blast`, `flash`, `big`, `bonus`, `rays`, `celebrate`, `perfect`. Batch **G3**.
- **Frame:** 96x96, pivot [48, 48].
- **Clips (2):** `burst` 12 (frame 0 a white bar 80x10 across the middle, the four cleared lines read as one; 1 to 3 it opens into a square ring and rays; 4 to 11 `pieces` square chips fly out and the rays fade from their tips; the last frame keeps every chip as a 2x2) · `flash` 8 ("Board clear": a white square ring opening from the centre to 1 px inside the frame, a 6 px block cell at each of its corners; the last frame keeps the four corner cells). The corner cells are coloured by **Edge** and drawn with `blockCell` in the `bevel` finish, `edge` 1 (an ink line, then a 1 px `light` and `dark` band round a 2x2 face of the Edge colour), with no symbol and no shine.
- **Parts:** none.
- **Controls (7):** `size` (Small / Big; default 0.5) · `pieces` (slider "Chips": Few / Many; whole numbers 8 to 16, step 1, default 12) · `spread` (Tight / Wide; default 0.5) · `style` (choice "Rays": straight | dashed | none; default straight; with `none` the ring and chips carry the burst) · `core` (default cream: 4) · `edge` (default gold; swatches exactly `gold`, `rose`, `violet`, `mint`, `coral`: 5; declare `material: 'light'`) · `speed` (Slow / Fast; default 0.5).
- **Sounds:** none.
- **Versions (4), on `burst`:** **Gold four** `{}` · **Rose dashed** `{ style: 'dashed', edge: gridline.rose }` · **Mint, no rays** `{ style: 'none', edge: gridline.mint, pieces: 16 }` · **Small violet** `{ size: 0, edge: gridline.violet, spread: 0 }`.
- **Helpers:** `engine/fx.js` (`rays`, `ring`, `chips` new GH2, `steps`), `engine/blocks.js` (new, GH1: `blockCell` for the corner cells), `engine/motion.js` (`keys`, `lerp`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: the corner cells.
- **Look and motion:** The big moment: four lines at once, or a board cleared to nothing. Nearest existing: `explosion-large` (fire and smoke), `firework` (a shell bursting into a sphere); this one is square, flat and bright.

### Title and cast

#### `gridline-emblem` · Title emblem

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`; words `title`, `emblem`, `badge`, `logo`, `menu`, `blocks`, `start`, `splash`, `mark`, `stack`. Batch **G4**.
- **Frame:** 96x64 (a deviation: a title picture), pivot [48, 32], `grounded: false`.
- **Clips (3):** `idle` 8 loop ("Showing": the emblem bobs by `bounce`, 0 to 2 px, and a 2 px light runs round its outline) · `build` 12 ("Building": frame 0 the emblem's bottom row of cells only, never empty; the rows above drop in two at a time, each landing with a 1-frame white flash; frame 11 equals `idle` frame 0) · `shine` 8 ("Shine": a 3 px diagonal band sweeps across the cells left to right; over each cell the band is that cell's own `light` tone mixed half towards white (`mix(light, '#ffffff', 0.5)`), never the Shine colour, so it shows over every cell in every scheme, the pearl slot 7 of `prism` included).
- **The emblem:** cells `cell` px across, drawn with `blockCell` in the chosen `style` and `scheme`, arranged by `shape` (sizes in cells, wide by tall):
  - `diamond`: 5 by 5, rows of 1, 3, 5, 3 and 1 cells (13 places) with the centre place left empty: **12 cells**.
  - `arrow`: 7 by 5, an upward head of rows of 1, 3, 5 and 7 cells over a shaft 3 cells wide and 1 tall: 19 cells, coloured in runs of four along each row so it reads as pieces.
  - `stairs`: 8 by 4, five four-cell pieces (`pieceCells` shapes, turned or flipped where needed: two lines along the bottom, two ells and a square above) stacked into steps two columns wide rising to the right (column heights 1, 1, 2, 2, 3, 3, 4, 4): 20 cells.
  - `ring`: 5 by 5, a square ring of 16 cells round a single cell in the middle: 17 cells.
  
  **Sizes.** The emblem's box is its cells plus 2 px of outline on every side (4 px wider and taller), and `bounce` moves it 0 to 2 px. At the default `cell` 8: `diamond` and `ring` 44x44 px, `arrow` 60x44, `stairs` 68x36. At the largest, `cell` 10 (version "Big glass"): `diamond` and `ring` 54x54, `arrow` 74x54, `stairs` 84x44, so with the bounce at most 84 px wide and 56 rows tall: every shape fits the 94x62 area inside a 1 px margin, with the outline on or off. The tallest shape is 5 cells, the widest 8. No letters, no word: the game sets its name under it with `font-chunky`.
- **Parts:** none.
- **Controls (8):** `shape` (choice "Shape": diamond | arrow | stairs | ring; default diamond) · `scheme` (choice "Colours": prism | ember | ocean | mono; default prism) · `style` (choice "Block style": bevel | gem | glass | pillow | frame; default bevel) · `cell` (slider "Cell size": Small / Big; whole numbers 6 to 10, step 2, default 8) · `outline` (toggle "Outline", default true: a 2 px ring round the whole emblem, ink then Shine; in every shape) · `glow` ("Shine": the outline ring and the light that runs round it in `idle`, nothing over the cells; default pearl; swatches exactly `pearl`, `cyan`, `lemon`, `gold`: 4; declare `material: 'light'`; every Shine swatch is also a scheme slot colour, which is why Shine never lies on a cell: the ring is outside the cells with an ink line between) · `bounce` (Calm / Bouncy; default 0.5) · `speed` (Slow / Fast; default 0.5).
- **Sounds:** `build` frame 3 → `block-lock` style "Click in", volume 0.6 · `build` frame 7 → `block-lock` style "Click in", volume 0.6 · `build` frame 11 → `line-clear` style "Single", volume 0.7 · `shine` frame 0 → `spin-bonus` style "Mini spin", volume 0.5.
- **Versions (5), on `idle`:** **Prism diamond** `{}` · **Ember arrow** `{ shape: 'arrow', scheme: 'ember' }` · **Ocean stairs** `{ shape: 'stairs', scheme: 'ocean', style: 'gem' }` · **Mono ring** `{ shape: 'ring', scheme: 'mono', glow: gridline.cyan }` · **Big glass** `{ cell: 10, style: 'glass', outline: false }`.
- **Helpers:** `engine/blocks.js` (new, GH1: `BLOCK_SCHEMES`, `blockScheme`, `blockCell`, `pieceCells`), `engine/fx.js` (`twinkle`), `engine/motion.js` (`keys`, `wave`, `pulse`, `lerp`), `engine/color.js` (`ramp`, `mix`, `INK`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: the running light, the shine band.
- **Look and motion:** A badge of bright cells for a title screen that builds itself as the game starts. **Not** a logo: no letters, no word, no block lettering, nothing shaped like a famous game's title.

#### `grid-buddy` · Block buddy

- **Meta:** type `creature`, role `characters/npc`, view `front`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`; words `mascot`, `buddy`, `block`, `cube`, `cheer`, `worry`, `cute`, `helper`, `reaction`, `face`. Batch **G4**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (4), in this order:** `idle` 8 loop (breathes, squashing 1 px; blinks on frames 5 and 6) · `cheer` 8 ("Cheer": crouches 2 px, hops 6 px up with a stretch of at most 2 px, its four cells spreading 1 px apart at the top and snapping back on landing, eyes `happy`, two `sparkles` pluses) · `worry` 8 loop ("Worry": shakes 1 px left and right, eyes `wide`, a 2x3 Sweat drop sliding down its side and starting again) · `slump` 8 ("Slump": eyes go `flat`, the cells sag and slide 2 px apart, the body sinks 3 px; the last frame is the sagging body, eyes shut).
- **The body:** four cells joined as one of the four-cell shapes by `shape`, **lying flat** as `pieceCells` gives them (`square` 2 by 2 cells, `line` 4 by 1, `zig` and `ell` 3 by 2), drawn as one `g.blob` with the cell seams as 1 px `dark` lines and a 1 px ink outline; two eyes on the upper right cell; two stub feet (4 px tall) under the bottom cells; a 2x2 cheek dot under each eye. Stands on the pivot row in `idle` (the feet's last row is row 41, the row above the pivot). **Cell size by `size`, capped per shape:** `square`, `zig` and `ell` 8 to 11 px; `line` 7 to 8 px (it is four cells wide). **`build` sets the cell's width** to its height minus 1 (Slim) to plus 1 (Stocky); the height never changes, so `build` costs no rows.
- **Fit (worst case, checked by the builder at `size` 0 and 1, `build` 0 and 1, every shape, every frame of every clip).** Rows above the pivot: 42 (rows 0 to 41). Tallest is a two-row body at cell 11 in `cheer`: 1 outline + 2 x 11 cells + 1 px seam spread + 2 px stretch + 6 px hop + 4 px feet = **36 rows** (rows 6 to 41), leaving 6 rows above for the `sparkles` pluses; in `idle` the same body is 27 rows (plus the 1 px breath). The `line` body is at most 1 + 8 + 2 + 6 + 4 = 21 rows. Widest is the `line` at cell 8 and Stocky: 4 x 9 + 3 px spread + 2 outline = 41 px, plus the 1 px `worry` shake each way: 43 of 48 columns (in `slump`, cells 2 px apart and no shake: 36 + 6 + 2 = 44); `zig` and `ell` at cell 11, Stocky: 3 x 12 + 2 + 2 + 2 = 42 (`slump` 36 + 4 + 2 = 42). No body touches the frame edge in any clip.
- **Parts:** none.
- **Controls (9):** `size` (Small / Big; default 0.5: the cell size within its shape's range) · `build` (slider "Build": Slim / Stocky; default 0.5: the body-shape slider of section 10; each cell 1 px narrower than tall, square, or 1 px wider; every shape, every clip) · `shape` (choice "Body": square | line | zig | ell; default square; `pieceCells` kinds, lying flat) · `eyes` (choice: dots | round | visor; default round) · `feet` (toggle "Feet", default true: two 3x4 nubs; in every body) · `body` ("Body": default hero; swatches exactly `hero`, `rose`, `teal`, `violet`, `coral`: 5) · `accent` ("Feet and cheeks": default lemon; swatches exactly `lemon`, `pearl`, `mint`, `lime`: 4) · `bounce` (Calm / Bouncy; default 0.5) · `speed` (Slow / Fast; default 0.5). Feet and cheeks touch the body: no shared colour. The sweat drop is fixed `sky`, rimmed `INK`.
- **Sounds:** `cheer` frame 1 → `combo-chime` style "Combo 4", volume 0.5 · `worry` frame 0 → `danger-pulse` style "Calm warning", volume 0.35 (a loop on a looping clip) · `slump` frame 0 → `top-out` style "Small collapse", volume 0.6.
- **Versions (5), on `idle`:** **Blue square** `{}` · **Rose line** `{ shape: 'line', body: gridline.rose }` · **Teal zig** `{ shape: 'zig', body: gridline.teal, eyes: 'dots' }` · **Violet ell, visor** `{ shape: 'ell', body: gridline.violet, eyes: 'visor', accent: gridline.mint }` · **Small coral** `{ size: 0, build: 1, body: gridline.coral, feet: false }`.
- **Helpers:** `engine/blocks.js` (new, GH1: `pieceCells`, `blockEyes`), `engine/creature.js` (`squashStretch`, `hopArc`), `engine/fx.js` (`sparkles`), `engine/motion.js` (`keys`, `wave`, `pulse`, `lerp`), `engine/color.js` (`ramp`, `INK`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: eyes, cheeks, the sweat drop.
- **Look and motion:** A small living piece that sits by the well and reacts: it cheers at a clear, worries while the stack is high, and slumps when the round is lost. **Not** a famous mascot: no gloves, no shoes, no hat, no mouth, no single-colour smiling cube.

#### `icons-gridline-modes` · Mode icons

- **Meta:** type `icon`, role `interface/icon`, view `none`, themes `neutral`, `sci-fi`; gameTypes `puzzle`, `arcade`; words `mode`, `menu`, `endless`, `sprint`, `timed`, `versus`, `zen`, `daily`, `practice`, `challenge`. Batch **G4**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (8):** `endless` 1 (a column of three cells with a looping arrow round it) · `sprint` 1 (a cell with three speed lines and a tick) · `timed` 1 (a cell beside a clock face) · `versus` 1 (two short stacks facing each other, a zigzag between) · `calm` 1 (a cell resting on a wave line) · `daily` 1 (a calendar card with a cell on it) · `puzzle` 1 (a four-cell piece above a dotted slot of its shape) · `practice` 1 (a cell inside a target ring). Every icon a different silhouette, 20 to 26 px, the guide's tilt where a thing has one.
- **Parts:** none.
- **Controls (7):** `backing` (choice "Plate": none | hex | circle; default circle; `ICON_PLATES`) · `shine` (toggle, default false; a glint on every icon's cells; in every icon) · `size` (Small / Big; default 0.5) · `bold` (toggle "Bold", default false: arrows, rings, lines and the clock 2 px thick instead of 1; in every icon) · `body` ("Blocks": default lemon; swatches exactly `lemon`, `rose`, `mint`, `lime`, `coral`: 5) · `accent` ("Marks": arrows, clock, rings, zigzag, wave; default cyan; swatches exactly `cyan`, `pearl`, `violet`, `gold`: 4) · `face` ("Plate": default line; swatches exactly `line`, `well`, `deep`, `plum`: 4; **when** `{ backing: ['hex', 'circle'] }`). The three lists share no colour.
- **Sounds:** none.
- **Versions (5), on `endless`:** **Lemon on circle** `{}` · **Rose hex** `{ backing: 'hex', body: gridline.rose }` · **Mint, no plate** `{ backing: 'none', body: gridline.mint, accent: gridline.violet }` · **Bold coral** `{ bold: true, body: gridline.coral, face: gridline.plum }` · **Big lime, shine** `{ size: 1, shine: true, body: gridline.lime }`.
- **Helpers:** `engine/icons.js` (`iconClips`, `iconPen`, `iconPaint`, `iconLine`, `iconGlint`, `iconPlate`, `iconFit`, `iconTidy`, `iconBold`, `iconArrow`, `iconStreaks`, `iconHoop`), `engine/counters.js` (`clockIn`), `engine/blocks.js` (new, GH1: `blockCell`, `pieceCells`), `engine/palettes.js` (`PALETTE`).
- **Drawing:** pixel. Detail layer: the glints.
- **Look and motion:** Pictures for the mode-select screen, one idea each. Nearest existing: `icons-system` (settings, save, sound), `icons-upgrades` (sci-fi upgrade signs).

## Sound effects

Exactly 24: 16 new and the 8 reused above. New sounds follow `SOUND.md` and the style guide, section 11, with this kit's house sound (top of the page). Style names are fixed: sprites and games cue them by name. Every new sound has `meta.themes` `["neutral"]`, `meta.gameTypes` `["puzzle", "arcade"]`, `license: "draft"`, and 6 to 14 words. **Identical every time** unless the row says it varies (moves, locks, clears and rewards are interface-like and tuned; the slam, the junk rise and the collapse vary). Phone speakers: 40% of the energy above 300 Hz at the default and in every style. **A difference of style that is a different shape (another note count, a reversed glide, an extra layer) has its own control**, named in the row.

| # | id | Name | type | role | Batch | Pairs with |
|---|---|---|---|---|---|---|
| 1 | `menu-console-move` | Console move | sfx | interface/hover | reused | menus; `ui-buttons-neon` |
| 2 | `menu-console-confirm` | Console confirm | sfx | interface/confirm | reused | starting a round; `ui-buttons-neon` |
| 3 | `menu-console-back` | Console back | sfx | interface/click | reused | leaving a menu |
| 4 | `menu-console-open` | Console open | sfx | interface/click | reused | the pause panel |
| 5 | `menu-console-toggle` | Console toggle | sfx | interface/click | reused | options; `ui-controls-neon` |
| 6 | `countdown-go` | Countdown go | sfx | interface/confirm | reused | Ready, Go! |
| 7 | `level-up` | Level up | jingle | interface/reward | reused | a new level |
| 8 | `game-over` | Game over | jingle | music/gameover | reused | the stack tops out |
| 9 | `block-shift` | Block shift | sfx | interface/click | GS1 | a piece moved one cell; `ui-stat-counter` `roll` |
| 10 | `block-turn` | Block turn | sfx | interface/click | GS1 | a piece turned |
| 11 | `block-slam` | Hard drop | sfx | actions/land | GS1 | a piece dropped straight down, with `drop-streak` |
| 12 | `block-lock` | Lock in | sfx | actions/land | GS1 | a piece locking, with `gridline-blocks` `lock`; `gridline-emblem` `build` |
| 13 | `block-hold` | Hold swap | sfx | items/equip | GS1 | `ui-piece-box` `swap` |
| 14 | `block-bump` | Blocked move | sfx | interface/error | GS1 | a move or a turn the wall or the stack refuses |
| 15 | `line-clear` | Line clear | sfx | interface/reward | GS2 | one, two or three lines, with `cell-burst`; `gridline-emblem` `build` |
| 16 | `quad-clear` | Four-line clear | sfx | interface/reward | GS2 | four lines, with `quad-burst` |
| 17 | `combo-chime` | Combo chime | sfx | interface/reward | GS2 | each clear in a combo; `ui-stat-counter` `bump`; `grid-buddy` `cheer` |
| 18 | `spin-bonus` | Spin bonus | sfx | interface/reward | GS2 | a spin into a tight slot, with `spin-sparkle`; `gridline-emblem` `shine` |
| 19 | `junk-send` | Send junk | sfx | actions/shoot | GS2 | junk rows sent to a rival; `ui-junk-gauge` `flash` |
| 20 | `board-clear` | Board clear | jingle | interface/reward | GS3 | the whole field cleared, with `quad-burst` `flash` |
| 21 | `new-record` | New best | jingle | interface/reward | GS3 | a record score, with `ui-gridline-panels` `record` and `confetti` |
| 22 | `junk-rise` | Junk rows rise | sfx | world/machine | GS3 | junk rows pushing the stack up from below |
| 23 | `danger-pulse` | Danger pulse | ambience | environment/ambience | GS3 | while `gridline-well` `danger` rows show; `grid-buddy` `worry` |
| 24 | `top-out` | Stack overflow | sfx | world/break | GS3 | the stack reaching the top, before `game-over`; `grid-buddy` `slump` |

#### `block-shift` · Block shift

- **Meta:** type `sfx`, role `interface/click`, category `ui`. Batch **GS1**.
- **Length:** 0.03 to 0.08 s.
- **What makes the sound, and how it moves:** A tiny dry tick: a square tone for about 25 ms (A5 at the default pitch) with an instant start, and a 3 ms noise click on top. No pitch movement. Identical every time.
- **Controls (4):** `pitch` (Pitch: 300 to 1600, log, default 880) · `length` (Length: 0.03 to 0.08, log, default 0.045) · `bright` (Brightness: default 0.5) · `snap` (Snap: the click; default 0.5).
- **Styles:** "Shift" (the defaults), "Soft shift" (`pitch` 660, `snap` 0.15, `bright` 0.3), "Step down" (`pitch` 523, `length` 0.035: the soft-drop tick, lower).
- **Pairs with:** a piece moved one cell; `ui-stat-counter` `roll` frame 1 ("Soft shift").

#### `block-turn` · Block turn

- **Meta:** type `sfx`, role `interface/click`, category `ui`. Batch **GS1**.
- **Length:** 0.05 to 0.16 s.
- **What makes the sound, and how it moves:** A short pulse blip that glides a few notes up (or down) while a narrow band of noise sweeps the same way: a quick "flick". Identical every time.
- **Controls (5):** `pitch` (400 to 1600, log, default 659) · `rise` ("Turn": -7 to 7 semitones, whole numbers, step 1, default 5; below 0 the glide falls, for turning the other way) · `length` (0.05 to 0.16, log, default 0.09) · `bright` (default 0.5) · `swish` ("Swish": the airy layer; default 0.4).
- **Styles:** "Turn right" (the defaults: E5 659 gliding up 5 to A5 880), "Turn left" (`rise` -4: E5 gliding down to C5 523), "Heavy turn" (`pitch` 440, `length` 0.14, `swish` 0.7: A4 gliding up 5 to D5 587).
- **Pairs with:** a piece turned.

#### `block-slam` · Hard drop

- **Meta:** type `sfx`, role `actions/land`, category `impact`. Batch **GS1**.
- **Length:** 0.12 to 0.35 s.
- **What makes the sound, and how it moves:** A fast rush down into a hit. Noise through a band-pass falling from about 3 kHz to 500 Hz in the first 40 ms, then the hit: a low thump falling from about 160 to 60 Hz, a square click for the phone range on one fixed note (no glide), and a short crushed tick. The click is the only pitched layer (the rush, the thump and the tick are unpitched). **Notes:** at the default (`weight` 0.5) the click is G5 784; `weight` moves it only between scale notes, never between them: `weight` below 0.34 A5 880, 0.34 to 0.66 G5 784, above 0.66 E5 659. So "Hard drop" G5 784, "Heavy slam" (`weight` 0.85) E5 659, "Small piece" (`weight` 0.2) A5 880. **Varies** from take to take (`rnd` on the rush and the thump).
- **Controls (5):** `weight` (Weight: lower, longer and darker together; default 0.5) · `length` (0.12 to 0.35, log, default 0.22) · `bright` (default 0.5) · `rush` ("Rush": the falling air before the hit; default 0.5) · `snap` (default 0.5).
- **Styles:** "Hard drop" (the defaults), "Heavy slam" (`weight` 0.85, `length` 0.32), "Small piece" (`weight` 0.2, `rush` 0.25).
- **Pairs with:** a piece dropped straight down, with `drop-streak` `burst`.

#### `block-lock` · Lock in

- **Meta:** type `sfx`, role `actions/land`, category `ui`. Batch **GS1**.
- **Length:** 0.05 to 0.14 s.
- **What makes the sound, and how it moves:** Something clicking into place: a tight click into a short triangle ping on a pentatonic note that dies in about 60 ms. Identical every time.
- **Controls (4):** `pitch` (300 to 1600, log, default 660) · `length` (0.05 to 0.14, log, default 0.07) · `bright` (default 0.5) · `snap` (default 0.5).
- **Styles:** "Click in" (the defaults), "Soft lock" (`snap` 0.15, `bright` 0.3), "Glass lock" (`pitch` 1320, `length` 0.12, `bright` 0.8).
- **Pairs with:** a piece locking, with `gridline-blocks` `lock`; `gridline-emblem` `build` frames 3 and 7.

#### `block-hold` · Hold swap

- **Meta:** type `sfx`, role `items/equip`, category `ui`. Batch **GS1**.
- **Length:** 0.08 to 0.28 s.
- **What makes the sound, and how it moves:** Tucking a piece away and bringing one out: two quick FM blips, the first falling a fifth from `pitch`, the second rising a fifth back to `pitch`, over a short swish of noise. A fifth down from a scale note that is E, A or D lands on A, D or G, so every style starts on E5 or D5. Identical every time.
- **Controls (5):** `pitch` (400 to 1400, log, default 659) · `speed` ("Time between notes": 0.04 to 0.12 s, default 0.07) · `bright` (default 0.5) · `swish` ("Swish": default 0.4) · `notes` ("Notes": 1 to 2, step 1, default 2; with 1 only the falling blip plays).
- **Styles:** "Swap" (the defaults: E5 659 down to A4 440, then A4 up to E5), "Hold empty" (`notes` 1: the first hold, with nothing to bring back: E5 down to A4), "Swap back" (`pitch` 587: D5 down to G4 392, then back up to D5).
- **Pairs with:** `ui-piece-box` `swap` frame 0.

#### `block-bump` · Blocked move

- **Meta:** type `sfx`, role `interface/error`, category `ui`. Batch **GS1**.
- **Length:** 0.04 to 0.14 s.
- **What makes the sound, and how it moves:** A soft refusal: a dull, short, low square thunk that bends down and does not ring. Identical every time.
- **Controls (4):** `pitch` (150 to 600, log, default 262) · `length` (0.04 to 0.14, log, default 0.07) · `drop` (Drop: 0 to 12 semitones, whole numbers, step 1, default 5) · `grit` (Grit: a little buzz; default 0.2). Brightness: `grit` (this sound has no `bright`).
- **Styles:** "Wall tap" (the defaults: C4 262 bending down 5 to G3 196), "Can't turn" (`pitch` 330, `drop` 9: E4 bending down to G3 196), "Soft no" (`grit` 0, `length` 0.1: C4 to G3).
- **Pairs with:** a move or turn that the wall or the stack refuses.

#### `line-clear` · Line clear

- **Meta:** type `sfx`, role `interface/reward`, category `ui`. Batch **GS2**.
- **Length:** 0.25 to 0.8 s.
- **What makes the sound, and how it moves:** A rising wipe of noise (a band-pass sweeping from about 600 Hz to 6 kHz) under one to three short FM bell notes struck in a quick rising run of the pentatonic chord. Each line adds a higher note and about 0.1 s. Identical every time.
- **Controls (5):** `pitch` (260 to 1050, log, default 523) · `lines` ("Lines": 1 to 3, step 1, default 1) · `length` (0.25 to 0.8, log, default 0.4) · `shimmer` ("Shimmer": the bells' high partials; default 0.5) · `sweep` ("Sweep": the wipe; default 0.5). Brightness: `shimmer`.
- **Styles:** "Single" (`lines` 1), "Double" (`lines` 2, `length` 0.5), "Triple" (`lines` 3, `length` 0.6).
- **Pairs with:** one, two or three lines cleared, with `cell-burst` on each cell; `gridline-emblem` `build` frame 11 ("Single").

#### `quad-clear` · Four-line clear

- **Meta:** type `sfx`, role `interface/reward`, category `ui`. Batch **GS2**.
- **Length:** 0.8 to 1.3 s.
- **What makes the sound, and how it moves:** The big clear: a low soft "whump" at the start, then five FM bell notes climbing the pentatonic scale over a bright noise wipe, the last one held as the home chord with a short shimmering tail. Identical every time.
- **Controls (5):** `pitch` (260 to 1050, log, default 523) · `speed` ("Time between notes": 0.05 to 0.12 s, default 0.08) · `shimmer` (default 0.6) · `space` (Room: 0 to 0.1, default 0.05; an sfx, so it stays dry by the house sound) · `sweep` (default 0.5). Brightness: `shimmer`.
- **Styles:** "Four lines" (the defaults), "Spin four" (`space` 0.1, `shimmer` 0.9), "Streak of fours" (`speed` 0.06, `pitch` 587: four lines again straight after the last four lines).
- **Pairs with:** four lines at once, with `quad-burst` `burst`. **Not** the rising four-note brass "item found" flourish: five bell notes, pentatonic, no brass.

#### `combo-chime` · Combo chime

- **Meta:** type `sfx`, role `interface/reward`, category `ui`. Batch **GS2**.
- **Length:** 0.12 to 0.4 s.
- **What makes the sound, and how it moves:** One clean bell (a sine with one FM partial) whose note climbs the pentatonic scale with `step`, so a combo rises note by note; a tiny echo after it. Identical every time.
- **Controls (4):** `pitch` (the first note: 260 to 1050, log, default 523) · `step` ("Combo": 0 to 7, step 1, default 0) · `ring` (Ring: 0.1 to 0.4 s, default 0.2) · `bright` (default 0.5).
- **Styles:** "Combo 1" (`step` 0), "Combo 4" (`step` 3), "Combo max" (`step` 7, `ring` 0.35).
- **Pairs with:** each clear in a combo (a game raises `step`); `ui-stat-counter` `bump` frame 0 ("Combo 4"); `grid-buddy` `cheer` frame 1 ("Combo 4").

#### `spin-bonus` · Spin bonus

- **Meta:** type `sfx`, role `interface/reward`, category `magic`. Batch **GS2**.
- **Length:** 0.3 to 0.75 s.
- **What makes the sound, and how it moves:** A twirl: an FM tone rising an octave with a fast warble whose rate speeds up as it climbs, with a sprinkle of short high ticks on a steady clock (not random, so it is identical every time).
- **Controls (4):** `pitch` (400 to 1600, log, default 660) · `length` (0.3 to 0.75, log, default 0.5) · `twirl` ("Twirl": how fast the warble spins; default 0.5) · `shimmer` ("Shimmer": the ticks; default 0.5). Brightness: `shimmer`.
- **Styles:** "Spin" (the defaults), "Mini spin" (`length` 0.32, `twirl` 0.3), "Big spin" (`length` 0.72, `twirl` 0.8).
- **Pairs with:** a spin into a tight slot, with `spin-sparkle`; `gridline-emblem` `shine` frame 0 ("Mini spin").

#### `junk-send` · Send junk

- **Meta:** type `sfx`, role `actions/shoot`, category `weapon`. Batch **GS2**.
- **Length:** 0.15 to 0.45 s.
- **What makes the sound, and how it moves:** Something sent away: a saw blip gliding down an octave through a closing low-pass, with an airy whoosh; one zap per row, 40 ms apart. **Varies** a little (a few cents of `rnd` on each zap).
- **Controls (4):** `pitch` (300 to 1200, log, default 587) · `length` (0.15 to 0.3 s per zap, log, default 0.2) · `bright` (default 0.5) · `rows` ("Rows": 1 to 4, step 1, default 1).
- **Styles:** "Send one" (`rows` 1: D5 587 gliding down an octave to D4), "Send four" (`rows` 4, the same notes), "Counter" (`rows` 2, `pitch` 880: A5 down to A4; junk cancelled before it lands). The `rnd` is a few cents only, so every zap still lands on its note.
- **Pairs with:** junk rows sent to a rival; `ui-junk-gauge` `flash` frame 0 ("Send one").

#### `board-clear` · Board clear

- **Meta:** type `jingle`, role `interface/reward`, category `jingle`. Batch **GS3**.
- **Length:** 1.4 to 2.2 s.
- **What makes the sound, and how it moves:** A short bright tune of seven notes on a bell over a soft square, in two rising phrases (the second starting higher), ending on a held home-note chord with a shimmer roll. Identical every time; no loop.
- **Controls (4):** `pitch` (the home note: 260 to 700, log, default 392) · `speed` ("Time between notes": 0.08 to 0.16 s, default 0.11) · `bright` (default 0.6) · `space` (Room: 0 to 0.25, default 0.12).
- **Styles:** "All clear" (the defaults), "Small clear" (`speed` 0.08, `space` 0.05), "Perfect round" (`space` 0.25, `bright` 0.85).
- **Pairs with:** the whole field cleared, with `quad-burst` `flash` and `ui-word-pop` `perfect`. **Not** a victory tune of quick repeated pick-up notes into held brass, and no ending flat-six, flat-seven, home.

#### `new-record` · New best

- **Meta:** type `jingle`, role `interface/reward`, category `jingle`. Batch **GS3**.
- **Length:** 1.6 to 2.6 s.
- **What makes the sound, and how it moves:** A climbing tune of eight notes on a pulse lead over a bell arpeggio that leaps up an octave in the middle and steps back down to the home note, held with a short trill of two notes. A different contour from `board-clear`, `level-up` and `quest-complete`. Identical every time; no loop.
- **Controls (4):** `pitch` (260 to 700, log, default 440) · `speed` ("Time between notes": 0.08 to 0.16 s, default 0.12) · `bright` (default 0.6) · `space` (Room: 0 to 0.25, default 0.12).
- **Styles:** "New best" (the defaults), "Close call" (`speed` 0.09, `pitch` 392), "Big record" (`space` 0.25, `bright` 0.9).
- **Pairs with:** a record score, with `ui-gridline-panels` `record` and `confetti`.

#### `junk-rise` · Junk rows rise

- **Meta:** type `sfx`, role `world/machine`, category `impact`. Batch **GS3**.
- **Length:** 0.3 to 0.9 s (set by `rows` and `speed`).
- **What makes the sound, and how it moves:** A grinding push from below: a low square buzz that steps up one scale note per row, each step with a crunchy click (noise through `crush`), over a low rumble that swells and stops. The buzz is the only pitched layer (the clicks and the rumble are filtered noise, unpitched). **Notes:** the buzz starts on a scale note chosen by `weight`, which moves it only between scale notes: `weight` below 0.34 E3 165, 0.34 to 0.66 C3 131 (the default 0.5), above 0.66 A2 110. Each later row steps to the next C-pentatonic note up (A2 110 → C3 131 → D3 147 → E3 165 → G3 196), held, with no glide, so every step starts and ends on the scale. **Varies** (`rnd` on the clicks).
- **Controls (4):** `weight` (Weight: default 0.5) · `rows` ("Rows": 1 to 4, step 1, default 2) · `speed` ("Time per row": 0.08 to 0.2 s, default 0.12) · `grit` (Grit: the crunch; default 0.4). Brightness: `grit`. How long: `rows` and `speed`.
- **Styles:** "One row" (`rows` 1: C3 131 only), "Big push" (`rows` 4, `weight` 0.8: A2 110 → C3 131 → D3 147 → E3 165), "Slow rumble" (`rows` 2, `speed` 0.2, `grit` 0.15: C3 131 → D3 147). The defaults (`rows` 2) also play C3 131 → D3 147.
- **Pairs with:** junk rows pushing the stack up.

#### `danger-pulse` · Danger pulse

- **Meta:** type `ambience`, role `environment/ambience`, category `ambience`, `"loop": true`. Batch **GS3**.
- **Length:** a 4.0 s loop.
- **What makes the sound, and how it moves:** A soft, low double thump like a slow heartbeat (two sine thumps falling from about 70 to 50 Hz, with a quiet click near 300 Hz so it survives a phone speaker) on every beat, and a filtered two-note warning beep every 2 s: the first note at `pitch`, the second always 4 semitones below it, each held with no glide. The beep is the only pitched layer (the thumps and the click are unpitched). **Notes:** at the default and in every style (none sets `pitch`) E5 659 then C5 523. No single event stands out; the beats divide the loop exactly so the seam is silent.
- **Controls (4):** `pitch` (the beep's first note: 400 to 1200, log, default 659, E5) · `speed` ("Speed": options "Slow", "Medium", "Fast": 4, 6 or 8 beats per loop; default Medium) · `bright` (default 0.4) · `beep` ("Beep": the warning beep; default 0.4).
- **Styles:** "Stack high" (`speed` Medium), "Almost full" (`speed` Fast, `beep` 0.8), "Calm warning" (`speed` Slow, `beep` 0).
- **Pairs with:** while `gridline-well` `danger` rows show (the game starts it once); `grid-buddy` `worry` frame 0 ("Calm warning", volume 0.35).

#### `top-out` · Stack overflow

- **Meta:** type `sfx`, role `world/break`, category `impact`. Batch **GS3**.
- **Length:** 0.8 to 1.5 s.
- **What makes the sound, and how it moves:** A collapse: a cascade of short square blips on falling pentatonic notes, faster and faster (a clock whose rate climbs), under a square tone sliding down an octave and a fifth, ending on a dull low thud. **Varies** (`rnd` jitter on the blips' timing, not their notes).
- **Controls (5):** `pitch` (300 to 1200, log, default 659) · `length` (0.8 to 1.5, log, default 1.0) · `pieces` ("Pieces": 6 to 16 blips, step 1, default 10) · `drop` (Drop: 6 to 24 semitones, whole numbers, step 1, default 19) · `grit` (Grit: default 0.3). Brightness: `grit`.
- **Styles:** "Top out" (the defaults: the slide E5 659 down 19 to A3 220), "Collapse" (`pieces` 16, `length` 1.4: the same slide), "Small collapse" (`pieces` 6, `drop` 12, `grit` 0.1: E5 down to E4 330).
- **Pairs with:** the stack reaching the top, before the `game-over` jingle; `grid-buddy` `slump` frame 0 ("Small collapse", volume 0.6).

## Music

Exactly 4, all new. Each follows the Music section of `SOUND.md`, the style guide's section 12 (fixed control ids `intensity`, `bpm` (label Speed), `key` (label Pitch), `bars`, `inst`, `bright`, `space`; lengths 8, 16, 24, 32 bars; the five melody instruments in order) and `docs/music-styles.md`: each track is written on one **band** with `band(name)` from `tools/compose/kit.mjs` (`B.bass`, `B.chords`, `B.drums`, `B.lead`, `B.room`, `B.defaults`, `B.tags`, `B.words`), with the tune on `melody('l', ...)` and `instruments('l', ...)` unchanged and the band's own lead on the answer line. Chords below are the chords the checker must find per bar. **No two tracks of the library share a chord order**: each order below was compared, counted from the first bar's root, with all 12 music loops in `sounds/` on 2026-11-19 (`battle-theme`; the five kit tracks `thornwood-overworld`, `hearthvale-village`, `hearthvale-battle`, `derelict-run`, `derelict-boss`; and the six menu themes `menu-darkambient`, `menu-lofi`, `menu-musicbox`, `menu-organ`, `menu-steelpan`, `menu-twang`) and with each other, and is unique; `tests/unit/compose-library.test.mjs` is run when each track lands. Tunes and their rhythms must also pass that test (no 7 notes in a row moving the same way as another track; at most one bar of the same rhythm).

**Listening gate** (`docs/music-styles.md`, status and section 8): no band is used for a track that ships until a person has listened to its probe. The `chip` and `synthwave` probes must be heard first; the music batches wait for that.

| # | id | Name | role | Band | Tempo (range, default) | Key | Chord order (from bar 1's root) | Batch |
|---|---|---|---|---|---|---|---|---|
| 1 | `gridline-title` | Title theme | music/menu | `chip` | 120 to 150, 132 | F major | 0M 5M 7M 9m 5M 2m 4m 7M | GM1 |
| 2 | `gridline-calm` | Calm play | music/exploration | `synthwave` | 88 to 112, 100 | D minor | 0m 8M 5m 10M 0m 8M 3M 7M | GM2 |
| 3 | `gridline-rush` | Fast play | music/battle | `chip` | 144 to 160, 156 | A major | 0M 7M 9m 5M 0M 3M 5M 7M | GM3 |
| 4 | `gridline-results` | Results | music/victory | `synthwave` | 84 to 104, 92 | E-flat major | 0M 9m 4m 5M 0M 9m 5M 7M | GM4 |

Roles: the role tree has no "puzzle play"; calm play is the main loop (`music/exploration`), fast play the pressure loop (`music/battle`), results the end-of-round screen (`music/victory`, also after a loss: the screen celebrates the numbers). Every fastest tempo plus 5% stays inside its band (style guide section 12: a look may raise the tempo 5%): `chip` 120 to 168 holds 150 + 5% = 157.5 and 160 + 5% = 168; `synthwave` 80 to 118 holds 112 + 5% = 117.6 and 104 + 5% = 109.2 (`sound/bands.js`). **The tune is still playing at intensity 0.5** in every track (a look may set intensity as low as 0.5).

#### `gridline-title` · Title theme

- **Role:** `music/menu`. Batch **GM1**. **Band:** `chip`. **Use:** the title screen, the mode select and the options.
- **Tempo:** 132 bpm by default, range 120 to 150. **Key:** F major. **Mood:** bright, bouncy and welcoming: shapes clicking into place.
- **Chords (8 bars, one per bar):** F, Bb, C, Dm, Bb, Gm, Am, C (I, IV, V, vi, IV, ii, iii, V).
- **Layers:** (1) Bass: the band's `triBass`, quarter notes walking root, fifth, octave (`semis` row `0 _ _ _ 7 _ _ _ 12 _ _ _ 7 _ _ _`). (2) Drums: `chipKick` on 1 and 3, `chipSnare` on 2 and 4, `chipHat` in 8ths. (3) `chipArp` running chord tones in 16ths (`pick` row `0 1 2 3 2 1 2 1`, its own, not the band's default). (4) The tune (`instruments`). (5) The band's `chipLead` answering the tune in bars 4 and 8.
- **Intensity:** 0 to 0.25: arpeggio and bass. 0.25 to 0.5: add the tune and the kick. 0.5 to 0.75: add snare and hats. 0.75 to 1: add the answer line, the arpeggio an octave up.
- **Length:** 8, 16, 24 or 32 bars; default 16. Longer versions open with arpeggio and bass, then the tune, then the drums, then everything.
- **Melody instrument:** the five standard choices; default "Chiptune".
- **Other controls:** `lead` (melody level, default 0.8) and `swing` ("Bounce", default 0.15): 9 controls in all.
- **Styles:** "Title screen", "Options menu", "Attract mode".
- **Melody:** a 2-bar phrase that hops up a third and a fourth and settles back by steps, repeated a step higher in bars 3 and 4; bars 5 to 8 answer with one leap of a sixth in bar 5 and come down by steps to end bar 8 on C, the fifth, to lead back round. Major, bouncy, no dotted dance rhythm in two.

#### `gridline-calm` · Calm play

- **Role:** `music/exploration`. Batch **GM2**. **Band:** `synthwave`. **Use:** play at the early levels while the stack is low.
- **Tempo:** 100 bpm by default, range 88 to 112. **Key:** D minor. **Mood:** unhurried, glowing and focused.
- **Chords (8 bars, one per bar):** Dm, Bb, Gm, C, Dm, Bb, F, A (i, VI, iv, VII, i, VI, III, V).
- **Layers:** (1) Bass: the band's `sawBass`, straight 16ths on root and octave, its filter nearly shut at low intensity. (2) Chords: `sawPad` through `chorus`, held a bar each (the band's `B.chords` with `dip` lowering it while the tune plays). (3) Drums: kick on every beat, `hatDrum` on the off-beats, `gatedSnare` on 2 and 4, `clap` on beat 4 of every second bar. (4) The tune. (5) The band's `sawLead` with its dotted-8th echo, answering in bars 4 and 8.
- **Intensity:** 0 to 0.3: pad and bass. 0.3 to 0.5: add the tune and hats. 0.5 to 0.75: add kick and snare. 0.75 to 1: add the answer line and the clap.
- **Length:** 8, 16, 24 or 32 bars; default 16. Longer versions: pad and bass, then the tune, then the drums, then everything.
- **Melody instrument:** the five standard choices; default "Bell".
- **Other controls:** `lead` (melody level, default 0.8): 8 controls in all.
- **Styles:** "Low stack", "Deep focus", "Late night".
- **Melody:** long notes. A 4-bar phrase of two-note sighs that each fall a step, rising a fourth at bar 3; bars 5 to 8 repeat it and end on F (over F) and then C# (the leading note, over A), so the loop wants to start again.

#### `gridline-rush` · Fast play

- **Role:** `music/battle`. Batch **GM3**. **Band:** `chip`. **Use:** play at high speed, or when a timer runs low; a game may cross-fade to it from `gridline-calm`.
- **Tempo:** 156 bpm by default, range 144 to 160 (160 plus 5% is 168, the top of the `chip` band). **Key:** A major (the C major chord in bar 6 is borrowed from the minor, for a lift). **Mood:** urgent, bright and driving.
- **Chords (8 bars, one per bar):** A, E, F#m, D, A, C, D, E (I, V, vi, IV, I, flat III, IV, V).
- **Layers:** (1) Bass: `triBass` in 8ths jumping root and octave (its own row). (2) Drums: `chipKick` on the beats, then on every 8th at the top; `chipSnare` on 2 and 4; `chipHat` in 16ths. (3) `chipArp` in 16ths (`pick` row `0 2 1 3 0 2 1 2`). (4) The tune. (5) `chipLead` doubling the tune an octave up at the top.
- **Intensity:** 0 to 0.25: bass, hats and arpeggio. 0.25 to 0.5: add the tune and the kick on the beats. 0.5 to 0.75: add the snare; the kick goes to 8ths. 0.75 to 1: add the doubled lead.
- **Length:** 8, 16, 24 or 32 bars; default 16. Longer versions: bass and hats, then the tune, then the full kit, then everything.
- **Melody instrument:** the five standard choices; default "Synth lead".
- **Other controls:** `lead` (melody level, default 0.8) and `grit` (default 0.2): 9 controls in all.
- **Styles:** "Speed up", "Final rows", "Danger zone".
- **Melody:** a 2-bar riff of quick note pairs climbing a scale fragment, answered by a falling broken chord; the riff returns a third higher in bars 5 and 6. Major and straight: no minor-key dance in two.

#### `gridline-results` · Results

- **Role:** `music/victory`. Batch **GM4**. **Band:** `synthwave`. **Use:** the results panel, the high-score table and the credits.
- **Tempo:** 92 bpm by default, range 84 to 104. **Key:** E-flat major. **Mood:** warm, satisfied, a little wistful: the numbers count up.
- **Chords (8 bars, one per bar):** Eb, Cm, Gm, Ab, Eb, Cm, Ab, Bb (I, vi, iii, IV, I, vi, IV, V).
- **Layers:** (1) Bass: `sawBass`, half notes on root then fifth (its own row). (2) Chords: `sawPad` with `chorus`. (3) Drums: kick on 1 and 3, `clap` on 2 and 4, `hatDrum` 8ths, `gatedSnare` on 4 of each second bar. (4) The tune. (5) `sawLead` echoing the end of each phrase.
- **Intensity:** 0 to 0.3: pad and bass. 0.3 to 0.5: add the tune. 0.5 to 0.75: add kick, clap and hats. 0.75 to 1: add the echo line and the gated snare.
- **Length:** 8, 16, 24 or 32 bars; default 8. Longer versions: pad and bass, the tune, the drums, then everything.
- **Melody instrument:** the five standard choices; default "Plucked string".
- **Other controls:** `lead` (melody level, default 0.8) and `swing` ("Bounce", default 0.2): 9 controls in all.
- **Styles:** "Score count", "High score table", "Credits roll".
- **Melody:** a 4-bar phrase that starts on the fifth, climbs by steps to the octave over bars 1 and 2, then falls back in a slow arc; bars 5 to 8 vary it and come to rest on the third over Ab before the Bb bar turns it round.

## Left out, and why

- **A fixed shooter's projectile.** The plan's puzzle row counts one projectile; a falling-block game has none.
- **Pickups.** Nothing is collected; the counters and the score pop carry points.
- **The flat drawing style.** Decision P5 (the plan's section 5): not until the flat Hero has been looked at. Each row names its detail layer so it can follow.
- **A seven-piece "piece set" sprite** (the seven pieces drawn whole). A game builds pieces from `gridline-blocks` cells; the shapes are rules (`pieceCells`), not art, and a picture of seven coloured pieces in a row is the reference game's best-known image.
- **Letters drawn in the kit.** Every word comes from `font-chunky` and `ui-word-pop`, which already exist.
- **A second backdrop and a ready-made field picture.** The field is laid from `gridline-well`; one backdrop wraps both ways.

## Batch plan

A batch starts when everything in its "Waits for" cell has passed review. Helpers first (Contract 11: a sprite never holds generic code), then sounds (a sprite cannot cue a sound that does not exist), then sprites, then music, which also waits for a person to hear the band's probe. The palette is done (added to `engine/palettes.js` with this specification). The four core libraries this kit reuses (core sprites parts 1 and 3: K06, K21, K22, K24, K25; core sounds) are in `sprites/` and `sounds/` today: nothing waits on them.

| Batch | Kind | Assets (ids) | Waits for |
|---|---|---|---|
| GH0 | helper | the kit checks: `kitSize(plan)` in `tools/lib/assets.mjs` (a plan's own `size`, else `KIT_SIZE`), `sizeProblems(bundle, plan)` in `tests/helpers/kits.mjs`, the size note in `tools/bundles-from-plans.mjs`, the plan-to-bundle comparison in `tests/unit/build-kit-plans.test.mjs` (only written bundles), and the per-kit test in `tests/e2e/three-bundles.spec.mjs` (no player check for a view-`none` puzzle kit), with the playground painting such a kit's scene | the Loadout owner's yes to the rule change, recorded in `docs/progress.md` |
| GH1 | helper | first `tests/unit/palettes-core.test.mjs`: `gridline` added to the palette list (the file passes); then `engine/blocks.js`: `BLOCK_STYLES`, `BLOCK_SCHEMES`, `BLOCK_SYMBOLS`, `blockScheme`, `blockCell`, `blockSymbolIn`, `ghostCell`, `fieldCell`, `wellRim`, `cornerBlocks`, `gaugeColumn`, `gaugeFill`, `pieceCells`, `statMarkIn`, `blockEyes` | the Gridline palette (done); GH0 |
| GH2 | helper | `engine/fx.js` `chips`; `engine/backdrop.js` `gridLines` | nothing |
| GS1 | sound | `block-shift`, `block-turn`, `block-slam`, `block-lock`, `block-hold`, `block-bump` | nothing |
| GS2 | sound | `line-clear`, `quad-clear`, `combo-chime`, `spin-bonus`, `junk-send` | nothing |
| GS3 | sound | `board-clear`, `new-record`, `junk-rise`, `danger-pulse`, `top-out` | nothing |
| G1 | sprite | `gridline-blocks`, `gridline-well`, `bg-gridline` (pathfinder: the world's look) | GH1, GH2 |
| G2 | sprite | `ui-piece-box`, `ui-gridline-panels`, `ui-stat-counter`, `ui-junk-gauge` | GH1, GS1, GS2, G1 |
| G3 | sprite | `cell-burst`, `drop-streak`, `spin-sparkle`, `quad-burst` | GH1, GH2, G1 |
| G4 | sprite | `gridline-emblem`, `grid-buddy`, `icons-gridline-modes` | GH1, GS1, GS2, GS3, G1 |
| GM1 | music | `gridline-title` | `compose-kit` and `band('chip')` (exist); a person has listened to the `chip` probe |
| GM2 | music | `gridline-calm` | `band('synthwave')` (exists); a person has listened to the `synthwave` probe |
| GM3 | music | `gridline-rush` | GM1 (the second `chip` track checks its tune and rhythms against the first) |
| GM4 | music | `gridline-results` | GM2 (the second `synthwave` track, likewise) |

When every asset is in, `node tools/bundles-from-plans.mjs` writes `bundles/kit-puzzle-gridline.json`, and the build lists the kit. With GH0 in, it prints no size note (24 sprites, 24 sounds and 4 tracks are inside this plan's own `size`) and `tests/e2e/three-bundles.spec.mjs` passes for this kit and for the set. If it prints a size note, or either test fails on size or on the player check, that is a fault: GH0 is missing or wrong, and the kit is not done.
