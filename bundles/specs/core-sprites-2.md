# Core sprites, part 2: specification (`core-sprites-2`)

Written 2026-11-19 by the art director for the asset plan (`docs/asset-plan.md`, section 4, the core sprite table: the lines "Menu kits in 10 skins", "Keyboard, mouse and gamepad button pictures", "General icon sets" and "Weather and light overlays"). These sprites belong to no single kit: any bundle may list them. **35 sprites in 10 sprite batches (K11 to K20), after 3 helper batches (H1 to H3)**: 16 menu-kit pieces in 4 skins, 7 input pictures, 6 icon sets, 6 screen-wide weather loops. Nothing here is built yet. **Read `docs/style-guide.md` first**: it fixes frame sizes, clip names, frame counts, control keys and labels, palettes and metadata. This file says what each sprite is. Where this page and the style guide disagree, this page wins for that sprite; where this page is silent, the style guide and the skill (`../../skills/sprite-forge/SKILL.md`) decide. Part 1 (`core-sprites-1.md`) is the model for everything not said here, above all its palette rule.

| | |
|---|---|
| Game type | none of its own: each row names the kinds of game it suits |
| World | none: `neutral` first, then the worlds a row plainly fits |
| View | interface pieces, input pictures, icons and weather `none` |
| Palette | home palette "Thornwood" for defaults, as in part 1 (below) |
| House sound | none of its own: cues go only to sounds that are in `sounds/` today |
| Sprites | **35** (35 new, 0 reused) |
| Batches | 3 helper batches (H1 to H3), then 10 sprite batches (K11 to K20) |

Contents: [What is different in part 2](#what-is-different-in-part-2) · [Asset list](#asset-list) · [New helpers](#new-helpers) · [Menu kits](#menu-kits) · [Input pictures](#input-pictures) · [Icon sets](#icon-sets) · [Weather](#weather) · [Left out, and why](#left-out-and-why) · [Batch plan](#batch-plan)

## What is different in part 2

- **What part 2 covers.** The core lines part 1 did not touch: menus in new looks, pictures of the keys and buttons a game asks a player to press, the icon sets a menu, a shop or a map needs beyond the five that exist, and weather that covers the whole screen. No row needs a character, a creature or a rig, and no row declares parts.
- **Not a re-skin.** Nothing here repeats a sprite in `sprites/`. The interface and icon sprites that exist are `ui-bars-rpg`, `ui-bars-tech`, `ui-battle-menu`, `ui-buttons-wood`, `ui-crosshair`, `ui-damage-digits`, `ui-dialogue`, `ui-hud-platformer`, `ui-hud-roguelite`, `ui-panel-wood`, `ui-status-icons`, `ui-upgrade-card`, `icons-consumables`, `icons-gear`, `icons-key-items`, `icons-upgrades` and `icons-weapons`; the weather that exists is part 1's patches (`rain-ripples`, `mist-drift`, `wind-gust`, `ember-drift`, `fireflies`, `sun-rays`, `cave-drip`, `bubble-stream`). Every row names its nearest existing sprite and how it differs.
- **The skins are new looks, not wood, RPG or tech.** Wood (`engine/ui-wood.js`: plank, carved, a greyed stone board), the RPG panels (`engine/ui.js` `panel9`: plain, ornate, scroll) and tech (`techPanel`: plate, hologram, glass) exist. Part 2 adds four skins: **paper and ink** (`paper`), **candy** (`candy`), **clean flat** (`flat`) and **stone and gold** (`gilded`). Each skin is one set of four sprites (buttons with tabs, panels, bars with a slider, small controls with a cursor), so the plan's "10 skins, 4 sprites each" line is 16 of 40 done after this round.
- **Interface sprites declare their text areas and draw no letters** (style guide section 8). Every clip that can carry text says where (`textArea`), with the colour of text it was made for (`text: INK` for the dark-text paper skin); every other clip says `noText: true`. Keys and buttons that a game labels declare the flat area where its letter goes; the sprite draws only pictures (arrows, ticks), never a letter or a digit.
- **Input pictures are generic.** A key, a mouse, four face buttons in a diamond, a cross pad, a stick, a shoulder button and a trigger are common ideas. **No maker's layout, colours or symbols:** no four-colour face buttons, no geometric symbols or letters on face buttons, no logo or home button, no maker's controller outline. A face button is told apart by its **place** (top, right, bottom, left), lit in one colour.
- **Weather wraps.** Part 1 left screen-wide weather out because no helper made a loop of pieces that tiles with no band. Part 2 adds that helper (`engine/weather.js`, batch H1). A weather sprite is one 64x64 loop whose pieces wrap round the inner 62x62 square (the frame keeps its 1 px empty border): **laid 62 px apart**, each copy over its neighbours' empty border, copies join with no seam; laid 64 px apart, a 2 px gap shows that pieces jump. Every blurb says so. Pieces are solid pixels: nothing tints the screen.
- **The palette rule is part 1's**, unchanged: defaults are Thornwood colours by name (`PALETTE.thornwood.<name>`), with at most two colours of the other palettes appended to a list; lists of 4 to 8, all distinct, none darker than brightness 0.18; meaning stays fixed (health green, danger red, friendly energy cyan or `magic`, reward gold). A colour is written here as a palette name (`hearthvale.wheat`); a name with no palette is Thornwood. A hex in a list is one part 1 already used (`#d8d8e0`, `#e6c545`, `#a8612a`, `#c98a4a`, `#6b7280`); a hex that is a palette colour is written by its name instead (`#4f9d57` is `hearthvale.leaf`).
- **Interface swatch lists keep their contrast.** The lists below are the candidates. An interface sprite passes them through `skinSwatches` (new, H2), which keeps the default first and **only drops** colours: a face on which the skin's text colour falls under 4.5 to 1, and a frame that falls under 3 to 1 against any kept face, under any whole-bundle look. It measures with `worstContrast` of `engine/ui.js` and nothing else; it never calls `textFaces` or `framesFor`, because those darken or lighten a failing colour into a new hex, and this page adds no colour that is not listed. Every face and frame list below was checked with `worstContrast` on 2026-11-19 (lowest pair given in each skin's header): every face holds its text and every frame holds 3 to 1 against every face of its skin, so nothing should be dropped. If a builder finds one dropped all the same, keep the survivors, say so in the report and name the ones dropped; never add a colour that is not listed here. The skins' face lists are dark because only eight colours of the three palettes hold white text at 4.5 to 1 (`soil`, `slate`, `cavern`, `derelict.plate`, `derelict.deck`, `hearthvale.slate`, `hearthvale.bandit`, `hearthvale.panel`, leaving out ink and void): the candy and flat skins therefore share one face list and tell themselves apart by shape, gloss and rim.
- **Sound cues** go only to sounds in `sounds/` today: `ui-click` ("Soft tap", "Glass tick"), `tech-click` ("Select", "Hover", "Confirm"), `menu-confirm` ("Confirm", "Big confirm", "Soft tick"), `menu-move` ("Cursor", "Page turn", "Tab") and the loop `wind` ("Breeze", "Storm"). No batch waits on a sound batch.
- **Ready-made versions.** Every row lists 3 to 6 `versions` (docs/site-design.md section 4; `defineSprite` accepts and checks them). The first is always the defaults (`params: {}`). A colour in a version is written as a palette name (`hearthvale.wheat`): write `PALETTE.hearthvale.wheat` in the file. Every version must pass the checker and look different at card size from the defaults and from the others (`VERSION_RULES` in `engine/versions.js`); if one does not, change its settings, keep its name and say so in the report.
- **Originality** (style guide section 13 and the plan's section 1). Each row names the famous design it must not become, where there is one.

How to read a row: as in part 1. **Clips:** name, frame count, "loop" if it loops (a label in brackets is the button text). **Controls:** the sprite's own controls by key, in `params` order. **Every slider states its default.** Standard keys take the style guide's label and end words (section 10); others carry a note. **Count sliders** (a count of columns, flakes, leaves) are whole-number ranges with step 1, `range('Drops', 8, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' })`, and versions set them to whole numbers inside the range. A colour's note gives its label, its default and its swatches exactly, and where the label cannot say it, the `material` to declare. **when:** a control or cue followed by **when** `{ ... }` is in effect only for those values; copy it exactly. **Touching colours:** two colour controls whose pieces touch share no swatch; each row says which touch. **Sounds:** clip, frame, sound id and style, volume. **Versions:** name and `params`. **Helpers:** every framework function the sprite is built from, by module; **(new, H1)** marks a function that does not exist yet and is built in that helper batch (section [New helpers](#new-helpers)). A row with no "new" mark needs nothing new.

## Asset list

| # | id | Name | type | role | view | Frame | Batch |
|---|---|---|---|---|---|---|---|
| 1 | `ui-buttons-paper` | Paper buttons | ui | interface/button | none | 96x32 | K11 |
| 2 | `ui-panel-paper` | Paper panels | ui | interface/panel | none | 96x64 | K11 |
| 3 | `ui-bars-paper` | Paper bars and slider | ui | interface/bar | none | 64x16 | K11 |
| 4 | `ui-controls-paper` | Paper checkboxes and cursor | ui | interface/cursor | none | 32x32 | K11 |
| 5 | `ui-buttons-candy` | Candy buttons | ui | interface/button | none | 96x32 | K12 |
| 6 | `ui-panel-candy` | Candy panels | ui | interface/panel | none | 96x64 | K12 |
| 7 | `ui-bars-candy` | Candy bars and slider | ui | interface/bar | none | 64x16 | K12 |
| 8 | `ui-controls-candy` | Candy checkboxes and cursor | ui | interface/cursor | none | 32x32 | K12 |
| 9 | `ui-buttons-flat` | Flat buttons | ui | interface/button | none | 96x32 | K13 |
| 10 | `ui-panel-flat` | Flat panels | ui | interface/panel | none | 96x64 | K13 |
| 11 | `ui-bars-flat` | Flat bars and slider | ui | interface/bar | none | 64x16 | K13 |
| 12 | `ui-controls-flat` | Flat checkboxes and cursor | ui | interface/cursor | none | 32x32 | K13 |
| 13 | `ui-buttons-gilded` | Stone and gold buttons | ui | interface/button | none | 96x32 | K14 |
| 14 | `ui-panel-gilded` | Stone and gold panels | ui | interface/panel | none | 96x64 | K14 |
| 15 | `ui-bars-gilded` | Stone and gold bars | ui | interface/bar | none | 64x16 | K14 |
| 16 | `ui-controls-gilded` | Stone and gold checkboxes | ui | interface/cursor | none | 32x32 | K14 |
| 17 | `input-key` | Keyboard key | ui | interface/icon | none | 32x32 | K15 |
| 18 | `input-key-wide` | Wide keyboard key | ui | interface/icon | none | 64x32 | K15 |
| 19 | `input-mouse` | Mouse | ui | interface/icon | none | 32x32 | K15 |
| 20 | `input-face-buttons` | Face buttons | ui | interface/icon | none | 32x32 | K16 |
| 21 | `input-dpad` | Direction pad | ui | interface/icon | none | 32x32 | K16 |
| 22 | `input-stick` | Thumbstick | ui | interface/icon | none | 32x32 | K16 |
| 23 | `input-shoulder` | Shoulder button | ui | interface/icon | none | 32x32 | K16 |
| 24 | `icons-food` | Food icons | icon | items/icon | none | 32x32 | K17 |
| 25 | `icons-materials` | Material icons | icon | items/icon | none | 32x32 | K17 |
| 26 | `icons-tools` | Tool icons | icon | items/icon | none | 32x32 | K17 |
| 27 | `icons-system` | Settings icons | icon | interface/icon | none | 32x32 | K18 |
| 28 | `icons-currency` | Currency icons | icon | interface/icon | none | 32x32 | K18 |
| 29 | `icons-map` | Map marker icons | icon | interface/icon | none | 32x32 | K18 |
| 30 | `rain` | Rain | effect | effects/weather | none | 64x64 | K19 |
| 31 | `snowfall` | Snowfall | effect | effects/weather | none | 64x64 | K19 |
| 32 | `falling-leaves` | Falling leaves | effect | effects/weather | none | 64x64 | K19 |
| 33 | `petal-fall` | Falling petals | effect | effects/weather | none | 64x64 | K20 |
| 34 | `ash-fall` | Falling ash | effect | effects/weather | none | 64x64 | K20 |
| 35 | `dust-storm` | Dust storm | effect | effects/weather | none | 64x64 | K20 |

By group: **menu kits 16** (4 skins x buttons, panels, bars, controls), **input pictures 7** (keyboard 2, mouse 1, gamepad 4), **icon sets 6** (50 icons: food, materials, tools, settings, currencies, map markers), **weather 6** (rain, snow, leaves, petals, ash, dust).

## New helpers

Every function below does not exist today (checked against every `export` in `engine/` on 2026-11-19). They are built **before** any sprite that uses them, in the helper batches H1 to H3, by the skill's rules for the framework (Contract 11): tests first, additions only, a doc comment above each export, the pixel fingerprint of every existing sprite identical before and after. A sprite builder who finds one of them short of an option adds that option to the same module the same way and lists it in the report; a sprite file never holds generic drawing code. Each module is one builder's: two batches never edit the same file at the same time.

### H1a: `engine/weather.js` (new module): the wrapping weather field

Why it is needed: `fx.particles`, `fx.streaks` and `spells.motes` start pieces at a point or a band and shrink or cool them with age, so tiled copies show a stripe; `backdrop.wrapped` and `scatter` wrap only at 320 px; `fx.leaves` and `foliage.leafFall` are one-shots ending on the ground (part 1, "Left out").

**The idea.** Pieces stand on a lattice: `cols` columns across the period, `rows` pieces evenly spaced down each column. A column's pieces all look alike (one shape, one size, one colour), and a piece's sway and turn are functions of **its height**, not of time, so every piece of a column traces the same path. Over one loop each piece moves down by a whole number of row gaps (`laps x period / rows`), so at the end of the loop every piece stands where its neighbour stood: the loop closes with no piece born or dying. Positions are taken modulo the period (62) and drawn at `origin + position` (1), so a piece crossing an edge appears on the far side and nothing ever touches the frame's outer row or column. Sway is a whole number of cycles per period, so it lines up across the wrap. **A slant** (pieces drifting sideways as they fall) wraps only if it shifts a piece by a whole number of periods per period, so `slant` is -1, 0 or 1 (straight down, or 45 degrees); any other value throws, with this reason in the message. Smaller leans are drawn as the lean of each piece (a streak's angle), not as drift.

| Export | Signature | What it does |
|---|---|---|
| `WEATHER_PIECES` | frozen list | `'dot'`, `'streak'`, `'flake'`, `'leaf'`, `'petal'`, `'seed'`, `'ash'`, `'grain'` |
| `fallLattice` | `fallLattice({ cols, rows, period = 62, seed = 0, gap = 0.6 })` → `[{ col, row, x, y }]` | The lattice: column x positions spread over the period by `hash` jitter, no two columns closer than `gap x period / cols` (wrapping); each column's row positions evenly spaced from its own offset. Pure |
| `fallAt` | `fallAt(piece, u, { rows, period = 62, laps = 1, slant = 0, sway = 0, swayCycles = 1, turns = 1, axis = 'y' })` → `{ x, y, turn }` | Where one lattice piece is at loop progress `u` (0..1), modulo the period, and its turn (0..1, a function of its height) for pieces that spin or flip. `turns` (a whole number, 1 or more; anything else throws) is how many full flips a piece makes while it falls one row gap, so the turn lines up when the piece takes its neighbour's place: a leaf that turns over once (`turns: 1`) and one that flutters (`turns: 3`) differ. `axis: 'x'` swaps the axes: pieces stream to the right (a dust storm) |
| `fallPiece` | `fallPiece(g, shape, x, y, { size = 1, colour, rim, core, angle = 0, turn = 0, box })` | One piece at (x, y), clipped to `box`. `dot` 1 to 2 px square; `streak` a 1 px line `size` px long at `angle`; `flake` 1 px dot, 3 px plus, or 5 px six-point star by `size`; `leaf` a pointed oval 3 to 5 px with a 1 px `rim` (a darker tone of its colour unless given) that narrows and widens as `turn` flips it; `petal` a round-tipped drop 2 to 4 px that turns; `seed` a dot with a three-ray tuft; `ash` an irregular 2 to 3 px fleck that tumbles, with `core` (a colour) lighting its middle pixel while `turn` is under 0.5 and leaving it the fleck's colour after (so a cinder's core blinks as it tumbles; the pixel count stays the same); `grain` a 1 px dash `size` px long (2 to 6, rounded to a whole number) along the axis. Solid pixels only |
| `fallField` | `fallField(g, { t, cols, rows, laps = 1, slant = 0, sway = 0, swayCycles = 1, turns = 1, axis = 'y', shape, shapes, size, colours, rim, core, coreEvery = 0, seed = 0, period = 62, origin = 1, shift = [0, 0] })` → `{ drawn }` | The whole field for loop phase `t`: column `i` takes `colours[i % colours.length]`, and its shape from `shapes[i % shapes.length]` when `shapes` is given (else every column takes `shape`); an entry of `shapes` is a shape name or `{ shape, size }`, so mixed columns can differ in size too (drizzle's dots beside 2 px streaks). `turns` is passed to `fallAt`. `coreEvery` (0: none) lights the core of every n-th column; a piece within reach of an edge is drawn on both sides; everything is clipped to the inner square `[origin, origin + period)`. `shift` moves the lattice (for the wrap test and for a far layer that must not line up with the near one) |

**Test:** `tests/unit/weather-field.test.mjs`. (1) On a 64x64 surface, for every shape, `slant` -1, 0 and 1, both axes and all 8 frames, rows 0 and 63 and columns 0 and 63 stay empty. (2) The loop closes: `t = 0` and `t = 1` give identical pixels for `laps` 1 to 3, `rows` 1 to 5 and `turns` 1 to 3 (with shapes `leaf` and `ash` and `coreEvery: 2`, whose drawing depends on the turn), and for every far layer of the Weather section as specified there (half the columns rounded up, the far laps of each style, `shift: [17, 23]`); `turns: 1.5` throws. (3) It wraps: `shift: [31, 31]` gives exactly the inner 62x62 square rolled by 31 both ways. (4) No band: over 8 frames each quarter of the inner square holds 15% to 35% of the opaque pixels at `cols` 4 and 12. (5) A piece keeps itself: drawn alone, `dot`, `streak`, `flake`, `seed`, `ash` and `grain` have the same pixel count on every frame; `leaf` and `petal` never fall under half their widest count; `grain` at `size` 2, 4 and 6 is exactly that many pixels in one line along the axis (both axes), on every frame. (6) `fallLattice` keeps every column gap of at least `gap x period / cols`. (7) Same arguments, same pixels; another seed, other pixels. (8) `slant: 0.5` throws. (9) `shapes`: with `shapes: ['dot', { shape: 'streak', size: 2 }]` columns 0, 2, 4 draw only dots and columns 1, 3, 5 only 2 px streaks; with `shapes: ['grain', 'grain', 'leaf']` exactly every third column is leaves; `shapes` of one entry gives the same pixels as `shape` of that entry.

### H1b: `engine/inputs.js` (new module): key, mouse and gamepad pictures

Why it is needed: nothing in `engine/` draws a key cap with a side, a mouse, a face-button cluster, a cross pad, a stick or a shoulder button. Every function draws bodies only (no outline: the sprite calls `g.outline(INK)` once, then draws motion marks after it, as light), takes its colours as arguments, and keeps to the box it is given.

| Export | Signature | What it does |
|---|---|---|
| `KEY_MARKS` | frozen list | `'none'`, `'up'`, `'down'`, `'left'`, `'right'`, `'enter'`, `'back'`, `'tab'`, `'shift'` |
| `keyCap` | `keyCap(g, x, y, w, h, { top, side, corner = 0.5, depth = 2, down = false })` → `{ top, text }` | A key seen from a little above the front: a flat lit top face over a darker front side `depth` px tall (1 to 4). `down: true` moves the top face down by `depth` onto where the side was. `text` is the flat one-colour middle of the top face, where a game prints a letter |
| `keyMark` | `keyMark(g, kind, cx, cy, size, colour)` | A picture for a key (one of `KEY_MARKS`), on pixel stairs: a solid arrow, a bent return arrow, a back arrow with a bar, a tab arrow to a bar, a hollow shift arrow. No letters |
| `mouseBody` | `mouseBody(g, cx, cy, { w = 14, h = 19, shape = 'oval', body, lit, button = 'left', down = false, wheel = 0, cable = false })` → `{ buttons }` | A mouse from above, `h` px tall (16 to 22) and `w` px wide (`w` about 0.75 x `h`, 12 to 17): two buttons split down the middle, a wheel between them, the chosen `button` (`left`, `right`, `middle`, `none`) in the `lit` colour and 1 px lower when `down`; `wheel` (-1, 0, 1) shows the wheel's ridges a step up or down; `cable` a short S-bent cable from the top, exactly 8 px tall, so the tallest body (22) and its cable fill at most 30 px. `shape`: `'oval'` or `'slim'` |
| `padButton` | `padButton(g, cx, cy, r, { body, lit, depth = 2, down = false })` → `{ top }` | One round button with a front side `depth` px deep, its top in `lit` when given |
| `padCluster` | `padCluster(g, cx, cy, { r = 5, gap = 1, body, glow, lit = 'top', depth = 2, down = false })` → `{ tops }` | Four `padButton`s in a diamond; `lit` (`top`, `right`, `bottom`, `left`, `all`, `none`) names the ones in `glow` and (with `down`) pressed. All four the same colour and shape: no symbols |
| `dpadCross` | `dpadCross(g, cx, cy, { arm = 6, thick = 7, style = 'cross', body, glow, lit = [], depth = 2, down = false })` → `{ arms }` | A direction pad: `cross` (one plus-shaped piece with a dimple in the middle), `discs` (four separate round arrow buttons), `round` (a round pad with a plus cut into its top). Each arm carries a small arrow notch; the arms named in `lit` are in `glow`, and pressed with `down` |
| `stickTop` | `stickTop(g, cx, cy, { r = 9, style = 'domed', body, ring, tilt = [0, 0], down = false })` → `{ cap }` | A thumbstick from above: a base ring and a cap moved by `tilt` (px), `domed` (a lit dome), `ridged` (a grip ring of 1 px ridges) or `flat` (a dished top); `down` presses the cap 1 px and darkens its rim |
| `shoulderButton` | `shoulderButton(g, x, y, w, h, { kind = 'bumper', side = 'left', style = 'rounded', body, glow, lit = true, down = false })` → `{ face }` | A bumper (a long bar seen from the front, its outer end rounded or `angled`) or a trigger (a curved paddle seen from the side, its tip curling forward), mirrored for `side: 'right'`; `down` moves it 2 px |
| `motionMarks` | `motionMarks(g, cx, cy, kind, { reach = 10, size = 3, colour, t = 0, box })` | Light drawn round a picture to show what to do: `up`, `down`, `left`, `right`, `up-down`, `left-right`, `all` (small arrow heads that step out 1 px and back over the loop), `spin` (a dotted ring with one arrow head running round it, drawn with `g.arc`), `click` (a ring that widens and is gone). Periodic in `t` |

**Test:** `tests/unit/inputs.test.mjs`. (1) Every function stays inside the box or the radius it was given, for every option. (2) `keyCap` with `down` moves the top face by exactly `depth` px and its `text` area is one colour inside the top face. (3) `keyMark` draws every kind in 5 px or more, and no two kinds give the same pixels. (4) `padCluster` with `lit: 'top'` and `lit: 'bottom'` differ only inside those two buttons' circles. (5) `dpadCross` with `lit: ['up']` and `lit: ['down']` light the same number of pixels. (6) `stickTop` with `tilt: [3, 0]` moves the cap 3 px and leaves the base ring unchanged. (7) `motionMarks` draws 6 px or more for every kind and gives identical pixels at `t = 0` and `t = 1`. (8) `shoulderButton` with `side: 'right'` is the left one mirrored to the pixel.

### H2: `engine/ui-skins.js` (new module): four interface skins and the small controls

Why it is needed: `panel9`, `button`, `barHousing` (engine/ui.js), `woodPanel`, `woodButton` (engine/ui-wood.js) and `techPanel` each draw one look; none draws a deckled sheet, a glossy candy slab, a flat bevel-less slab or a gold-framed stone plate, and nothing draws a tab, a checkbox, a radio button, a switch, a slider or a pointer. Everything here follows `engine/ui.js`'s rules: it draws its own INK outline (the sprite does not call `g.outline`), keeps everything that is not flat within `EDGE` (5) px of an edge so it nine-slices with `SLICE` (8), gives the `slice` it needs, and returns the flat one-colour text area. It imports `roundRectIn`, `cutRectIn`, `cornerPx`, `borderPx`, `desaturate`, `worstContrast`, `SLICE`, `EDGE`, `LIP` and `BUTTON_STATES` from `engine/ui.js`, and `crack` from `engine/rock.js` (the `ruin` style).

**The four skins.**

| Skin | Styles (`SKIN_STYLES`) | Text | Look |
|---|---|---|---|
| `paper` | `sheet` (a clean sheet, a double ruled line inside the edge), `torn` (a deckled edge: bites 2 px deep along every side, within the border, so they survive at card size), `card` (thick card: the top right corner folded down, a 2 px card edge under it) | dark (`INK`) | A sheet of paper with ink lines, no bevel. The frame is the ink of the rules, never `INK` itself. Optional pins at the top corners |
| `candy` | `jelly` (round corners and a deep glossy band along the inside of the top rim; no bubble of its own: the highlight bubble comes only from the sprite's `shine` toggle, in every style), `striped` (diagonal stripes in the rim, a 3 px pitch), `frosted` (icing drips hanging inside the top border) | white | A deep-coloured slab of boiled sugar in a pale sugar rim; glossy; optional sprinkles in the rim |
| `flat` | `solid` (a one-colour slab on a 2 px lip of its own dark tone), `outline` (the same with a 2 px band of the frame colour inside the ink), `pill` (fully round ends) | white | No light and no bevel: flat colour, one band, a lip. Optional flat drop shadow |
| `gilded` | `temple` (cut corners, a key-pattern of 1 px steps along the gold band), `royal` (round corners, three-dot scrolls in the corners), `ruin` (chipped corners, two short cracks in the stone border from `crack`) | white | A dark stone plate in a lit gold frame; optional gems in the corners |

| Export | Signature | What it does |
|---|---|---|
| `UI_SKINS` | frozen list | `'paper'`, `'candy'`, `'flat'`, `'gilded'` |
| `SKIN_STYLES` | frozen object | The styles of each skin (table above) |
| `SKIN_TEXT` | frozen object | The text colour each skin's text areas are made for: `paper` `INK`, the others `'#ffffff'` |
| `skinTones` | `skinTones(skin, { face, frame, accent, style, state = 'normal' })` → `{ face, faceLight, faceDark, band, bandLight, bandDark, lip, trough, accent, accentDark, text }` | Every colour a skin draws, from the three a sprite gives. `hover`: for `paper` (dark text) the face one tone lighter (`INK` text only gains); for `candy`, `flat` and `gilded` (white text) the face lightened by at most `tone(face, 0.1)`, so white text stays 5.0 to 1 or more on every listed face (lowest `hearthvale.bandit` 5.02, measured 2026-11-19), with the band and edge brightened to show the hover. **Not** `tone(face, 0.85)` as `button` of engine/ui.js does it: that puts white text at 2.04 to 2.11 to 1 on every dark face. `pressed` as normal, `disabled` with no saturation (`desaturate`) |
| `skinSwatches` | `skinSwatches(skin, { face, frame, accent })` → `{ face, frame, accent, failing, dropped }` | The three swatch lists of a skin's sprite, each given as a list of colours with the default first. A filter that only drops, measured with `worstContrast` alone (never `textFaces` or `framesFor`, which return new darker or lighter hexes): keeps a face only if `worstContrast(SKIN_TEXT[skin], face)` is 4.5 or more, a frame only if `worstContrast(frame, face)` is 3 or more for every kept face (for `paper` a darker frame, for the others a lighter one), and drops any accent that is also a face or a frame. Every colour it returns is one it was given, in the order given. Defaults are kept as given; `failing` names any rule a default breaks (it should be empty), and `dropped` lists `{ list, colour, ratio }` for every other colour left out |
| `skinPanel` | `skinPanel(g, x, y, w, h, skin, { style, face, frame, accent, border = 0.5, corner = 0.5, state, shadow = false, extras = false, title = 0, inset = false, ink })` → `{ body, inner, title, slice, tones }` | A stretchable panel of that skin. `extras`: the skin's optional decoration (paper pins, candy sprinkles, gilded gems; `flat` has none and ignores it). `title` (rows): a heading strip across the top in the face's dark tone (paper: a ruled band), returned as `title`. `inset`: a sunken well (a list or a slot grid), its face one tone darker, except `paper`, whose well is darkened by at most `tone(face, -0.5)` so `INK` text stays 5.0 to 1 or more (lowest `hearthvale.wheat` 5.03; a full tone gives 3.18 on `hearthvale.wheat`, 3.88 on `goblin`, 4.06 on `steel`, 4.45 on `skin`) |
| `skinButton` | `skinButton(g, x, y, w, h, state, skin, opt)` → `{ text, body, slice, tones }` | A button in one of `BUTTON_STATES`, as `button` of engine/ui.js does it: standing on a 2 px lip (`LIP`); `pressed` moves the body down onto the lip; `text` the middle 78x18 of a 96x32 frame, 2 px lower when pressed. opt as `skinPanel` |
| `skinTab` | `skinTab(g, x, y, w, h, active, skin, opt)` → `{ text, body, slice, tones }` | A tab: a button with no bottom edge that opens into a panel's top below it. `active`: 2 px taller, its face the panel's face, so it joins the panel; inactive: one tone darker, standing on a line (`paper`: darkened by at most `tone(face, -0.5)`, as its `inset`, so `INK` text stays 5.0 to 1 or more) |
| `skinTooltip` | `skinTooltip(g, x, y, w, h, skin, opt)` → `{ inner, slice, rect }` | A small panel with a 5 px tail under its bottom left corner, inside the left 8 px so stretching never repeats it |
| `skinBarOpening` | `skinBarOpening(x, y, w, h, skin, { border, corner, caps = 0 })` → `{ x, y, w, h }` | The trough of a bar housing, without drawing |
| `skinBarHousing` | `skinBarHousing(g, x, y, w, h, skin, { style, frame, accent, border, corner, caps, extras, notches })` → opening | The empty housing: the skin's band round a dark trough. `notches`: a notch every 8 px along the band (flat). Returns exactly `skinBarOpening` of the same arguments |
| `skinBarFill` | `skinBarFill(g, opening, value, skin, { fill, hatch = false, shine = true, flash = 0 })` | The fill strip, cropped to `value`, never outside the opening. Paper with `hatch`: diagonal 1 px lines of the fill's dark tone every 3 px; candy: a glossy line and a bubble; flat: plain; gilded: a gold top line. `flash` turns it white, as `barFill` does |
| `skinSlider` | `skinSlider(g, x, y, w, h, skin, opt)` → `{ rail, slice }` | A slider's track: a rail 4 to 6 px tall across the box in the skin's look, stretchable sideways |
| `skinKnob` | `skinKnob(g, cx, cy, size, skin, opt)` → `{ rect }` | A slider's knob: a slab of the skin 10 to 14 px across |
| `skinCheck` | `skinCheck(g, cx, cy, size, on, skin, opt)` → `{ box }` | A checkbox `size` px square in the skin's look; `on` draws a tick of `opt.accent` (a picture, 2 px strokes). Off and on share one outline |
| `skinRadio` | `skinRadio(g, cx, cy, size, on, skin, opt)` → `{ box }` | A round option button; `on` puts a dot of the accent in it (at least 4x4) |
| `skinSwitch` | `skinSwitch(g, x, y, w, h, on, skin, opt)` → `{ knob }` | An on/off switch: a rounded track and a knob that sits left (off, track in the face's dark tone) or right (on, track in the accent) |
| `skinPointer` | `skinPointer(g, x, y, size, skin, { bob = 0, frame, accent, ink })` → `{ tip }` | A menu pointer: a plain arrow head with a short tail (paper: an inked nib shape; candy: a glossy drop; flat: a solid triangle; gilded: a gold arrow with a gem), moved `bob` px towards its tip. Never a hand |
| `skinSelector` | `skinSelector(g, x, y, w, h, t, skin, opt)` → `{ slice }` | Four corner brackets round a slot that step in by 1 px and back over the loop (`t`); nine-slices round any slot |

**Test:** `tests/unit/ui-skins.test.mjs`. (1) For every skin and style: `skinPanel`'s `inner` is one colour inside `body`; drawn 96x64 and 160x64, the middle columns are identical (it stretches); its `slice` is at most 7 on every side. (2) `skinButton`: `pressed` puts `text` 2 px lower; `hover`'s face is lighter, and for every skin and every face of its list on this page `hover`'s `text` area keeps 4.5 to 1 or more against `SKIN_TEXT[skin]` under `worstContrast`; `disabled` has no saturated pixel; `text` is 78x18 in a 96x32 frame. (3) `skinTab` active is 2 px taller than inactive, and drawn over a `skinPanel` of the same face the join row is the face colour with no ink across the tab's width. (4) For every style, border and corner, `skinBarHousing` returns `skinBarOpening`, and `skinBarFill` at value 1 fills the opening exactly and draws nothing outside it. (5) `skinCheck`, `skinRadio` and `skinSwitch` on and off differ by 12 px or more and share their outline. (6) `skinPointer`'s `tip` is its outermost pixel in its direction; `skinSelector` gives identical pixels at `t = 0` and `t = 1`. (7) `skinSwatches` with each skin's lists from this page, written into the test exactly as the four skin headers give them (paper: faces `cream`, `hearthvale.wheat`, `skin`, `steel`, `goblin`, frames `cavern`, `soil`, `derelict.plate`, `hearthvale.bandit`; candy: faces `soil`, `cavern`, `hearthvale.bandit`, `derelict.plate`, frames `cream`, `skin`, `sky`, `goblin`; flat: faces `cavern`, `soil`, `derelict.plate`, `hearthvale.bandit`, frames `cream`, `sky`, `goblin`, `steel`, `skin`; gilded: faces `cavern`, `soil`, `derelict.plate`, `hearthvale.bandit`, frames `cream`, `steel`, `skin`, `hearthvale.thunder`, `hearthvale.wheat`), returns an empty `failing` and an empty `dropped`, and lists equal to the ones given. (7b) Given a failing candidate (white text on `crimson`, or `thornwood.gold` as a frame on `slate`), it drops it, reports it in `dropped`, and returns no colour that was not in its input. (8) A small fixture sprite per skin (a button with its `textArea`, its `hover` clip, an `inset` panel and an inactive tab, each with its `textArea`) has no `contrastFaults` for every face of the skin's list; for `paper` that covers the inset well and the inactive tab on `hearthvale.wheat`, `goblin`, `steel` and `skin`.

### H3: `engine/icons-more.js` (new module): 34 new icon shapes

Why it is needed: the icon shapes in `engine/icons.js` cover potions, bread, herbs, candles, bombs, tents, keys, scrolls, letters, gems, pouches, lanterns, weapons, armour and upgrade signs. None draws food other than bread, a raw material, a tool, a settings sign, a currency other than a gem and a pouch, or a map marker. The new functions live in a new module, `engine/icons-more.js`, beside `engine/icons.js` (which is not changed): it imports the pen helpers (`iconPaint`, `iconLine`, `iconGlint`) from `engine/icons.js`, and a sprite imports the sizes, `iconFit` and the rest from `engine/icons.js` and the new shapes (and `ROOT_KINDS`, `TOOL_KINDS`, `SIGN_KINDS`) from `engine/icons-more.js`. Its header says later shapes are appended at its end. Each takes `(g, pen, o = {})` like the shapes of `engine/icons.js`, describes the shape upright in local units round (0, 0), paints through `iconPaint` and `iconLine`, and draws no outline (the sprite outlines once inside `iconFit`).

| Export | Options (colours unless said) | Draws |
|---|---|---|
| `iconFood` | `kind` (one of `FRUIT_KINDS` or `MEAL_KINDS` of engine/food.js), `colour`, `stalk`, `leaf`, `bone` | An adapter: `drawFruit` or `drawMeal` of engine/food.js drawn through the pen (its centre, scale and lean), so the food pickups' shapes serve as icons |
| `iconFish` | `body`, `belly`, `fin` | A whole fish lying on a slant, head top right, a forked tail, one eye |
| `iconEgg` | `shell`, `speckle` (none: plain) | An egg standing on its broad end |
| `iconRoot` | `kind` (`'carrot'`, `'turnip'`), `root`, `leaf` | A root vegetable with its leafy top |
| `iconMushroom` | `cap`, `stem` | A plain brown-capped mushroom with gills showing under the cap, no spots and no face |
| `iconBowl` | `bowl`, `soup`, `herb` | A bowl of soup seen from a little above, a herb leaf floating. Returns `{ steam: [x, y] }` |
| `iconLog` | `bark`, `wood` | A short log with its cut end showing rings |
| `iconPlank` | `wood`, `count` (1 to 3) | Sawn planks stacked crosswise |
| `iconOre` | `stone`, `fleck`, `flecks` (0 to 5: 0 is plain stone) | A lumpy rock, with metal flecks when `flecks` is above 0 |
| `iconIngot` | `metal`, `stack` (1 or 2) | A cast bar with a lit top face, one or two stacked |
| `iconCloth` | `cloth`, `core` | A bolt of cloth rolled on a core, its loose end hanging |
| `iconCoil` | `rope` | A coil of rope, three turns and a loose end |
| `iconHide` | `hide` | A stretched hide with four points |
| `iconTool` | `kind` (`'axe'`, `'pickaxe'`, `'shovel'`, `'hoe'`, `'hammer'`, `'sickle'`), `metal`, `wood`, `grip` (none: no wrap) | A hand tool on a handle, handle bottom left. Returns `{ tip }` |
| `iconCan` | `metal`, `water` (none: no drops) | A watering can with a long spout and a rose, drops falling from it |
| `iconRod` | `wood`, `line`, `metal` | A fishing rod with a reel, its line hanging to a hook |
| `iconCog` | `colour`, `hub`, `teeth` (6 to 10) | A settings cog with a hole in its hub |
| `iconSpeaker` | `colour`, `waves` (0 to 2), `cross` (a colour; none: no cross) | A loudspeaker with sound waves, or a cross for mute |
| `iconNote` | `colour`, `double` (true: two joined notes) | A music note |
| `iconScreen` | `colour`, `corners` (true: four corner marks for full screen) | A screen on a stand |
| `iconPad` | `colour`, `mark` | A generic game controller: a rounded bar with two grips, a small cross on the left and two dots on the right. Not any maker's outline |
| `iconGlobe` | `colour`, `lines` (1 to 3) | A globe with meridian and parallel lines (language) |
| `iconTray` | `colour`, `arrow` (`'in'`, `'out'`) | An open tray with an arrow going in (save) or out (load) |
| `iconSign` | `kind` (`'play'`, `'pause'`, `'stop'`, `'close'`, `'tick'`, `'plus'`, `'minus'`, `'back'`, `'next'`), `colour` | A bold flat sign |
| `iconHome` | `wall`, `roof`, `door` | A small house with a pitched roof and a door |
| `iconCoins` | `metal`, `count` (1 to 4) | A stack of coins, edges showing |
| `iconBill` | `paper`, `mark` | A folded banknote with a plain oval in the middle: no currency sign, no letters, no portrait |
| `iconToken` | `metal`, `face` | A thick round token with a rim and a raised star in its face |
| `iconTicket` | `paper`, `stub` | A ticket with notched ends and a dashed tear line |
| `iconBolt` | `colour` | A lightning bolt (energy) |
| `iconPin` | `colour`, `head` (`'round'`, `'drop'`), `plate` (a colour: the pin's head carries a plate for another picture) | A map pin. Returns `{ plate: { x, y, r } }` |
| `iconFlag` | `cloth`, `pole` | A pennant on a pole |
| `iconAwning` | `cloth`, `stripe`, `wall` | A shop front: a striped awning over a counter |
| `iconChest` | `wood`, `metal`, `open` (false) | A treasure chest, banded |

**Test:** `tests/unit/icons-more.test.mjs`. (1) Each new function drawn through `iconFit` at Size 0, 0.5 and 1 has a longer side of 20, 23 and 26 px (plus or minus 1) and nothing on the frame's outer row or column, tilted and upright. (2) Each draws at least two body colours besides ink. (3) Within each icon set of this page (the clip lists of K17 and K18, written into the test), every pair of silhouettes differs by at least 15% of the larger one's pixels. (4) Every option listed changes 12 or more pixels (`iconSpeaker` waves 0 and 2; every `iconSign` kind differs from every other; `iconOre` flecks 0 and 3). (5) Same arguments, same pixels. (6) Every name `engine/icons-more.js` exports is new: none is already an export of `engine/icons.js` (which is untouched, so no existing sprite's fingerprint changes).

## Menu kits

What all 16 share. Read `sprites/ui-buttons-wood.js`, `sprites/ui-panel-wood.js`, `sprites/ui-bars-rpg.js` and `sprites/ui-battle-menu.js` first: they are the worked examples of `slice`, `textArea`, `noText` and swatches that keep their contrast. Every piece is drawn by the skin's helper with the frame minus its 1 px border (`skinButton(g, 1, 1, 94, 30, ...)`) and is never outlined again. **No letters or digits are drawn anywhere.** Themes start with `neutral`; `meta.gameTypes` start with `arcade` (style guide section 13: interface also `arcade`). At most 10 colours per clip.

| Kind | Frame, pivot | Clips in file order | Stretching (`slice`) | Text |
|---|---|---|---|---|
| Buttons (`ui-buttons-*`) | 96x32, [48, 16] | `normal` 1 · `hover` 1 · `pressed` 1 · `disabled` 1 · `tab` 1 (label "Tab") · `tab-active` 1 (label "Open tab") | each clip the `slice` its helper returns, plus the frame's 1 px: `skinButton` 8 px each side (pressed: top 9, bottom 5, as `ui-buttons-wood`); `skinTab` 8 left, right and top, 1 at the open bottom | `textArea` on every clip: the helper's `text`, with `text: SKIN_TEXT[skin]` and `edge` one pixel of the band |
| Panels (`ui-panel-*`) | 96x64, [48, 32] | `panel` 1 · `panel-title` 1 (label "With heading") · `inset` 1 (label "List well") · `tooltip` 1 | `panel`, `inset`: `slice9()`; `panel-title`: `slice9()` with `top` down to the strip's bottom line; `tooltip`: `slice9(rect)` of the rectangle it is drawn in (94x40 at the top of the frame), the tail inside the left 8 px | `textArea` on every clip: `inner` (and the `title` strip on `panel-title`, a list of two areas) |
| Bars (`ui-bars-*`) | 64x16, [32, 8] | `frame` 1 · `fill` 1 · `fill-b` 1 · `fill-c` 1 · `flash` 4 · `slider` 1 (label "Slider track") · `knob` 1 (label "Slider knob") | housing and fills: `{ left: 8, top: 4, right: 8, bottom: 4, opening }` with `opening` from `skinBarOpening` (as `ui-bars-rpg`); `slider`: left and right 8; `knob`: its `rect` | none: bars have no `face` control and carry no text. **Rail and knob colours:** the `slider` rail is the housing's band in the `frame` colour round the same trough as `frame`; the `knob` is a slab whose body is a fixed palette colour per skin, edged in `frame`: paper `cream` (a paper knob ruled in the ink), candy `soil` (a toffee knob, glossy, in the sugar rim), flat `cavern` (a flat blue slab on the edge colour), gilded `cavern` (a stone knob in the gold, its gem in `accent` when `gems` is on). The fixed knob colours are each skin's default face, so `frame` already holds 3 to 1 against them |
| Controls (`ui-controls-*`) | 32x32, [16, 16] | `check-on` 1 (label "Ticked box") · `check-off` 1 (label "Empty box") · `radio-on` 1 · `radio-off` 1 · `switch-on` 1 · `switch-off` 1 · `pointer` 8 loop · `selector` 8 loop | `selector`: `slice9()` (the brackets sit in the corners and stretch round any slot) | every clip `noText: true`. `pointer` exports a **`tip` socket** at its hot spot (`skinPointer`'s `tip`; angle PI/2, pointing right) |

**Controls: a deliberate deviation from style guide section 8 (this page wins).** The controls sprites take role `interface/cursor` because they hold the menu pointer, but they are a sheet of small controls of which the pointer is one, so they have **no `idle` clip** and `check-on` comes first (the measured still). The pointer clip stays named `pointer`. Builders keep this order and name and say so in the report.

Sizes at the default look: checkbox and radio 20x20, switch 28x16, pointer 20 px long, selector the full 30x30; the knob 12x14. **No `speed`** on buttons, panels and bars (their clips have one frame, or four: `flash` plays at a fixed 8 fps, style guide section 10). Controls have `speed` for `pointer` (fps 8) and `selector` (fps 8). `pointer`: the arrow moves 2 px towards its tip and back. `selector`: the brackets step in 1 px and out.

**Sounds, by skin.** Buttons: `pressed` frame 0 and `tab-active` frame 0. Controls: `check-on` frame 0 and `switch-on` frame 0. Volume 0.6 for all.

| Skin | `pressed` | `tab-active` | `check-on`, `switch-on` |
|---|---|---|---|
| paper | `ui-click` "Soft tap" | `menu-move` "Page turn" | `ui-click` "Soft tap" |
| candy | `ui-click` "Glass tick" | `menu-move` "Tab" | `ui-click` "Glass tick" |
| flat | `tech-click` "Select" | `menu-move` "Tab" | `tech-click` "Select" |
| gilded | `menu-confirm` "Confirm" | `menu-move` "Tab" | `menu-confirm` "Soft tick" |

**The bars' fill colours are the same in all four skins.** `fill` ("Health": default grass; swatches exactly `grass`, `leaf`, `crimson`, `ember`, `magic`, `gold`: 6), `fillB` ("Magic": default hero; swatches exactly `hero`, `water`, `magic`, `sky`, `derelict.shield`: 5), `fillC` ("Gauge": default gold; swatches exactly `gold`, `ember`, `moss`, `wood`, `steel`: 5). Each strip is its own clip and lies in the trough, one ink line in from the band, so the fill lists touch neither each other nor the frame (the labels make them `signal`, style guide section 10).

### Paper and ink

Text is dark (`INK`). Face candidates (pale papers): `cream`, `hearthvale.wheat`, `skin`, `steel`, `goblin`. Frame candidates (inks, darker than every face): `cavern`, `soil`, `derelict.plate`, `hearthvale.bandit` (a wine-red ink). Checked with `worstContrast` under every look: `INK` text is 6.75 to 1 or more on every face, and every ink is 3.04 to 1 or more against every face (the lowest pairs: `soil` and `hearthvale.bandit` on `goblin`; the default `cavern` is 3.51 or more on every face). `slate` and `thorn` are left out: `slate` is 2.6 on `hearthvale.wheat` and `goblin`, and `thorn` falls under 3 on every face but `cream`. Accent candidates (pins and ticks, inked, lying on the paper and on the ink lines): `crimson`, `ember`, `gold`, `magic`, `moss`, `hero`. The three lists share no colour. **Not** a lined school exercise page with a red margin and holes punched down the side.

#### `ui-buttons-paper` · Paper buttons

- **Meta:** type `ui`, role `interface/button`, view `none`, themes `neutral`; gameTypes `arcade`, `puzzle`, `card-game`, `farming-sim`. Batch **K11**.
- **Frame:** 96x32, pivot [48, 16].
- **Clips (6):** `normal` 1 · `hover` 1 · `pressed` 1 · `disabled` 1 · `tab` 1 ("Tab") · `tab-active` 1 ("Open tab").
- **Parts:** none.
- **Controls (6):** `style` (choice: sheet | torn | card; default sheet), `corner` (Square / Round; default 0.5), `border` (Thin / Thick; default 0.5: the ruled line 1 to 2 px), `shadow` (toggle "Shadow", default true: a 2 px drop shadow down and to the left, inside the 8 px border; in every style), `face` ("Paper": default cream; swatches `skinSwatches('paper', ...)` of exactly `cream`, `hearthvale.wheat`, `skin`, `steel`, `goblin`: 5; declare `material: 'paint'`), `frame` ("Ink": default cavern; swatches exactly `cavern`, `soil`, `derelict.plate`, `hearthvale.bandit`: 4). The ink lines lie on the paper: the lists share no colour.
- **Stretch and text:** as the table above; `text: INK`.
- **Sounds:** `pressed` frame 0 → `ui-click` style "Soft tap", volume 0.6 · `tab-active` frame 0 → `menu-move` style "Page turn", volume 0.6.
- **Versions (5):** **Notebook** `{}` · **Torn page** `{ style: 'torn', face: thornwood.skin }` · **Index card** `{ style: 'card', face: hearthvale.wheat }` (wheat with the default ink `cavern`: 3.60) · **Blue print** `{ face: thornwood.steel, frame: derelict.plate }` (3.98) · **Red ink note** `{ shadow: false, corner: 0, border: 1, frame: hearthvale.bandit }` (4.57 on cream).
- **Helpers:** `engine/ui-skins.js` (`skinButton`, `skinTab`, `skinSwatches`, `SKIN_STYLES`, `SKIN_TEXT`) (new, H2), `engine/ui.js` (`BUTTON_STATES`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** A menu button cut from a sheet of paper, ruled in ink, for cosy, puzzle, card and farming games. `torn` has a deckled edge; `card` a folded corner. Hover lightens the paper a tone; pressed sits it down on its shadow. Tabs are paper tabs standing on a ruled line. Nearest existing: `ui-buttons-wood` (a raised wooden board with a bevel, grain and nails); this one has no bevel, no grain, dark text on a light face, and tabs.

#### `ui-panel-paper` · Paper panels

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `neutral`; gameTypes `arcade`, `puzzle`, `card-game`, `farming-sim`. Batch **K11**.
- **Frame:** 96x64, pivot [48, 32].
- **Clips (4):** `panel` 1 · `panel-title` 1 ("With heading") · `inset` 1 ("List well") · `tooltip` 1.
- **Parts:** none.
- **Controls (7):** `style` (choice: sheet | torn | card; default sheet), `corner` (Square / Round; default 0.5), `border` (Thin / Thick; default 0.5), `pins` (toggle "Pins", default true: a round inked pin 4x4 px at each top corner, inside the border; in every style), `face` ("Paper": default cream; swatches as `ui-buttons-paper`: 5; `material: 'paint'`), `frame` ("Ink": default cavern; swatches as `ui-buttons-paper`: 4), `accent` ("Pins": default crimson; swatches exactly `crimson`, `ember`, `gold`, `magic`, `moss`, `hero`: 6; **when** `{ pins: [true] }`). Pins lie on the paper and on the ink line: Pins shares no colour with Paper or Ink.
- **Stretch and text:** as the table above; `text: INK` on `inner` and on the `title` strip (a ruled band, the paper's own colour between two ink rules).
- **Sounds:** none.
- **Versions (5):** **Notebook** `{}` · **Pinned card** `{ style: 'card', accent: thornwood.gold }` · **Torn page** `{ style: 'torn', pins: false }` · **Old letter** `{ face: hearthvale.wheat, frame: thornwood.soil }` (3.20) · **Mint memo** `{ face: thornwood.goblin, accent: thornwood.hero }` (goblin with the default ink `cavern`: 3.51).
- **Helpers:** `engine/ui-skins.js` (`skinPanel` with `title`, `inset` and `extras`, `skinTooltip`, `skinSwatches`, `SKIN_TEXT`) (new, H2), `engine/ui.js` (`slice9`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Boxes for menus, notes, a quest log and a tooltip, matching the paper buttons. Nearest existing: `ui-panel-wood` (its `panel-scroll` is a parchment sheet between wooden rolls); this one is a loose sheet with no rolls, ink-ruled, with pins, a list well and a tooltip.

#### `ui-bars-paper` · Paper bars and slider

- **Meta:** type `ui`, role `interface/bar`, view `none`, themes `neutral`; gameTypes `arcade`, `puzzle`, `card-game`, `farming-sim`. Batch **K11**.
- **Frame:** 64x16, pivot [32, 8].
- **Clips (7):** `frame` 1 · `fill` 1 · `fill-b` 1 · `fill-c` 1 · `flash` 4 · `slider` 1 ("Slider track") · `knob` 1 ("Slider knob").
- **Parts:** none.
- **Controls (8):** `style` (choice: sheet | torn | card; default sheet), `corner` (Square / Round; default 0.5), `border` (Thin / Thick; default 0.5), `hatch` (toggle "Hatching", default true: diagonal ink lines across the fill strips, at least 12 px on a full strip; on every fill clip and `flash`), `frame` ("Ink": default cavern; swatches as `ui-buttons-paper`: 4), `fill`, `fillB`, `fillC` (the shared fill lists above). No `speed` (`flash` has 4 frames).
- **Stretch and text:** as the table above. The trough is pale paper (`skinTones('paper').trough`), so every fill swatch stands darker than it.
- **Sounds:** none.
- **Versions (4):** **Ink bars** `{}` · **Torn strip** `{ style: 'torn', frame: hearthvale.bandit }` · **Clean fill** `{ hatch: false, border: 1 }` · **Brown ink** `{ frame: thornwood.soil, fill: thornwood.crimson }`.
- **Helpers:** `engine/ui-skins.js` (`skinBarOpening`, `skinBarHousing`, `skinBarFill` with `hatch`, `skinSlider`, `skinKnob`) (new, H2), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** A health, magic and gauge bar drawn as an ink-ruled strip of paper, filled with hatched colour like a hand-coloured chart; a slider track and its knob for a settings screen. Nearest existing: `ui-bars-rpg` (a bevelled housing with glossy fills); this one is flat paper and ink, hatched, and adds a slider.

#### `ui-controls-paper` · Paper checkboxes and cursor

- **Meta:** type `ui`, role `interface/cursor`, view `none`, themes `neutral`; gameTypes `arcade`, `puzzle`, `card-game`, `farming-sim`. Batch **K11**.
- **Frame:** 32x32, pivot [16, 16]. Socket `tip` on `pointer`.
- **Clips (8):** `check-on` 1 ("Ticked box") · `check-off` 1 ("Empty box") · `radio-on` 1 · `radio-off` 1 · `switch-on` 1 · `switch-off` 1 · `pointer` 8 loop · `selector` 8 loop. All `noText: true`.
- **Parts:** none.
- **Controls (7):** `style` (choice: sheet | torn | card; default sheet), `corner` (Square / Round; default 0.5), `border` (Thin / Thick; default 0.5), `face` ("Paper": as `ui-buttons-paper`: 5; `material: 'paint'`), `frame` ("Ink": as `ui-buttons-paper`: 4), `accent` ("Tick": the tick, the radio dot, the lit switch track, the pointer's nib; default crimson; swatches exactly `crimson`, `ember`, `gold`, `magic`, `moss`, `hero`: 6), `speed` (Slow / Fast; default 0.5). Tick, paper and ink all touch: the three lists share no colour.
- **Sounds:** `check-on` frame 0 → `ui-click` style "Soft tap", volume 0.6 · `switch-on` frame 0 → `ui-click` style "Soft tap", volume 0.6.
- **Versions (5):** **Notebook** `{}` · **Torn** `{ style: 'torn', accent: thornwood.moss }` · **Index card** `{ style: 'card', face: hearthvale.wheat }` (with `cavern`: 3.60) · **Brown ink** `{ frame: thornwood.soil, accent: thornwood.ember }` (3.04 or more on every face) · **Mint and blue** `{ face: thornwood.goblin, accent: thornwood.hero }` (with `cavern`: 3.51).
- **Helpers:** `engine/ui-skins.js` (`skinCheck`, `skinRadio`, `skinSwitch`, `skinPointer`, `skinSelector`, `skinSwatches`) (new, H2), `engine/ui.js` (`slice9`), `engine/motion.js` (`pulse`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** The small pieces of a settings screen in paper and ink: a ticked and an empty box, a round option, an on/off switch, an inked arrow pointer that nudges towards what it points at, and corner brackets that pulse round a chosen slot. Nearest existing: the arrow cursor of `ui-battle-menu` (a diamond-headed arrow on a panel) and `ui-crosshair` (an aiming mark); neither has checkboxes, options or a switch. **Not** a white-gloved pointing hand (style guide section 13).

### Candy

Text is white. Face candidates (dark boiled sugar: toffee, blueberry, cherry wine, liquorice): `soil`, `cavern`, `hearthvale.bandit`, `derelict.plate`. Frame candidates (pale sugar rims, lit along the top and right): `cream`, `skin`, `sky`, `goblin`. Checked with `worstContrast` under every look: white text is 5.45 to 1 or more on every face (lowest `soil` and `hearthvale.bandit`), and every rim is 3.04 to 1 or more against every face (lowest `goblin` on `soil` and on `hearthvale.bandit`; the default pair `soil` and `cream` 4.76). The bright sugars of the first draft (`crimson` 2.92, `thorn` 3.56, `hero` 3.51, `leaf` 2.96, `derelict.flesh` 3.10) do not hold white text and the rim `gold` is 2.84 on `soil`: all are left out. The gloss, the round corners and the pale rim carry the candy look. Accent candidates (sprinkles, ticks; they lie in the rim and on the face): `magic`, `ember`, `steel`, `grass`, `moss`. The three lists share no colour. **Not** the interface of the best-known match-three game: no wrapped-sweet corners, no candy-cane striped frame in red and white, no jelly-bean title plate.

#### `ui-buttons-candy` · Candy buttons

- **Meta:** type `ui`, role `interface/button`, view `none`, themes `neutral`, `candy`; gameTypes `arcade`, `puzzle`, `card-game`, `racing`. Batch **K12**.
- **Frame:** 96x32, pivot [48, 16].
- **Clips (6):** `normal` 1 · `hover` 1 · `pressed` 1 · `disabled` 1 · `tab` 1 ("Tab") · `tab-active` 1 ("Open tab").
- **Parts:** none.
- **Controls (6):** `style` (choice: jelly | striped | frosted; default jelly), `corner` (Square / Round; default 0.75: candy is round), `border` (Thin / Thick; default 0.5), `shine` (toggle "Shine", default true: a glossy highlight bubble inside the top right of the border, at least 12 px; in every style, `jelly` included: no style draws a bubble of its own, so off means no bubble anywhere), `face` ("Candy": default soil; swatches `skinSwatches('candy', ...)` of exactly `soil`, `cavern`, `hearthvale.bandit`, `derelict.plate`: 4; declare `material: 'paint'`), `frame` ("Sugar": default cream; swatches exactly `cream`, `skin`, `sky`, `goblin`: 4; declare `material: 'paint'`). The rim touches the face: the lists share no colour.
- **Stretch and text:** as the table; white text.
- **Sounds:** `pressed` frame 0 → `ui-click` style "Glass tick", volume 0.6 · `tab-active` frame 0 → `menu-move` style "Tab", volume 0.6.
- **Versions (5):** **Toffee drop** `{}` · **Cherry stripe** `{ style: 'striped', face: hearthvale.bandit }` · **Blueberry frost** `{ style: 'frosted', face: thornwood.cavern, frame: thornwood.sky }` · **Liquorice mint** `{ face: derelict.plate, frame: thornwood.goblin }` · **Matte caramel** `{ frame: thornwood.skin, shine: false }`.
- **Helpers:** `engine/ui-skins.js` (`skinButton`, `skinTab`, `skinSwatches`, `SKIN_STYLES`, `SKIN_TEXT`) (new, H2), `engine/ui.js` (`BUTTON_STATES`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** A glossy sugar button for casual, puzzle and party games: a deep toffee, cherry or blueberry slab in a pale rim, with a highlight bubble, rim stripes or icing drips. Hover lightens the face a little (at most `tone(face, 0.1)`, white text stays 5.0 to 1 or more) and brightens the rim; pressed squashes it down onto its lip. Nearest existing: `ui-buttons-wood`; this one is glossy and round with a pale rim instead of a dark frame.

#### `ui-panel-candy` · Candy panels

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `neutral`, `candy`; gameTypes `arcade`, `puzzle`, `card-game`, `racing`. Batch **K12**.
- **Frame:** 96x64, pivot [48, 32].
- **Clips (4):** `panel` 1 · `panel-title` 1 ("With heading") · `inset` 1 ("List well") · `tooltip` 1.
- **Parts:** none.
- **Controls (7):** `style` (choice: jelly | striped | frosted; default jelly), `corner` (Square / Round; default 0.75), `border` (Thin / Thick; default 0.5), `sprinkles` (toggle "Sprinkles", default true: at least 8 two-pixel sprinkles in the rim band; in every style), `face` ("Candy": as `ui-buttons-candy`: 4; `material: 'paint'`), `frame` ("Sugar": as `ui-buttons-candy`: 4; `material: 'paint'`), `accent` ("Sprinkles": default magic; swatches exactly `magic`, `ember`, `steel`, `grass`, `moss`: 5; **when** `{ sprinkles: [true] }`). Sprinkles lie in the rim and touch the face: Sprinkles shares no colour with Candy or Sugar.
- **Stretch and text:** as the table; white text on `inner` and on the `title` strip (the face's dark tone).
- **Sounds:** none.
- **Versions (5):** **Toffee box** `{}` · **Cherry stripe** `{ style: 'striped', face: hearthvale.bandit }` · **Frosted blueberry** `{ style: 'frosted', face: thornwood.cavern, sprinkles: false }` · **Liquorice** `{ face: derelict.plate, accent: thornwood.grass }` · **Caramel** `{ frame: thornwood.skin, accent: thornwood.ember }`.
- **Helpers:** `engine/ui-skins.js` (`skinPanel` with `title`, `inset` and `extras`, `skinTooltip`, `skinSwatches`, `SKIN_TEXT`) (new, H2), `engine/ui.js` (`slice9`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Pop-ups, result boxes and a shop window in boiled sugar, matching the candy buttons. Nearest existing: `ui-dialogue` (a plain or ornate dark panel); this one is glossy, round and sugar-rimmed.

#### `ui-bars-candy` · Candy bars and slider

- **Meta:** type `ui`, role `interface/bar`, view `none`, themes `neutral`, `candy`; gameTypes `arcade`, `puzzle`, `card-game`, `racing`. Batch **K12**.
- **Frame:** 64x16, pivot [32, 8].
- **Clips (7):** `frame` 1 · `fill` 1 · `fill-b` 1 · `fill-c` 1 · `flash` 4 · `slider` 1 ("Slider track") · `knob` 1 ("Slider knob").
- **Parts:** none.
- **Controls (8):** `style` (choice: jelly | striped | frosted; default jelly), `corner` (Square / Round; default 0.75), `border` (Thin / Thick; default 0.5), `shine` (toggle "Shine", default true: a glossy line and bubble along every fill strip, at least 12 px on a full strip), `frame` ("Sugar": as `ui-buttons-candy`: 4; `material: 'paint'`), `fill`, `fillB`, `fillC` (shared lists). No `speed`.
- **Sounds:** none.
- **Versions (4):** **Sugar bars** `{}` · **Striped** `{ style: 'striped' }` · **Frosted** `{ style: 'frosted', frame: thornwood.sky }` · **Matte mint** `{ shine: false, frame: thornwood.goblin, fill: thornwood.magic }`.
- **Helpers:** `engine/ui-skins.js` (`skinBarOpening`, `skinBarHousing`, `skinBarFill` with `shine`, `skinSlider`, `skinKnob`) (new, H2), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Glossy bars like sticks of rock in a sugar tube, and a slider. Nearest existing: `ui-bars-rpg` (bevelled housing, a darker frame); this one has a pale sugar rim and a round glossy look.

#### `ui-controls-candy` · Candy checkboxes and cursor

- **Meta:** type `ui`, role `interface/cursor`, view `none`, themes `neutral`, `candy`; gameTypes `arcade`, `puzzle`, `card-game`, `racing`. Batch **K12**.
- **Frame:** 32x32, pivot [16, 16]. Socket `tip` on `pointer`.
- **Clips (8):** as `ui-controls-paper`. All `noText: true`.
- **Parts:** none.
- **Controls (7):** `style` (choice: jelly | striped | frosted; default jelly), `corner` (Square / Round; default 0.75), `border` (Thin / Thick; default 0.5), `face` ("Candy": as `ui-buttons-candy`: 4; `material: 'paint'`), `frame` ("Sugar": as `ui-buttons-candy`: 4; `material: 'paint'`), `accent` ("Tick": default magic; swatches exactly `magic`, `ember`, `steel`, `grass`, `moss`: 5), `speed` (Slow / Fast; default 0.5). The three lists share no colour.
- **Sounds:** `check-on` frame 0 → `ui-click` style "Glass tick", volume 0.6 · `switch-on` frame 0 → `ui-click` style "Glass tick", volume 0.6.
- **Versions (5):** **Toffee** `{}` · **Cherry stripe** `{ style: 'striped', face: hearthvale.bandit }` · **Blueberry frost** `{ style: 'frosted', face: thornwood.cavern, frame: thornwood.sky }` · **Liquorice** `{ face: derelict.plate, accent: thornwood.ember }` · **Caramel** `{ frame: thornwood.skin, accent: thornwood.grass }`.
- **Helpers:** `engine/ui-skins.js` (`skinCheck`, `skinRadio`, `skinSwitch`, `skinPointer`, `skinSelector`, `skinSwatches`) (new, H2), `engine/ui.js` (`slice9`), `engine/motion.js` (`pulse`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Round candy checkboxes and options, a jelly switch, a glossy drop-shaped pointer that nudges, and sugar brackets pulsing round a slot. Nearest existing: `ui-battle-menu`'s arrow cursor. **Not** a gloved hand.

### Clean flat

Text is white. Face candidates (solid flat colours): `cavern`, `soil`, `derelict.plate`, `hearthvale.bandit`. Frame candidates (the flat band, unlit): `cream`, `sky`, `goblin`, `steel`, `skin`. Checked with `worstContrast` under every look: white text is 5.45 to 1 or more on every face (the default `cavern` 6.37), and every band is 3.04 to 1 or more against every face (lowest `goblin` on `soil` and on `hearthvale.bandit`; the default pair `cavern` and `cream` 5.27). Left out: the faces `hero` 3.51, `crimson` 2.92, `leaf` 2.96 and `thorn` 3.56 (white text fails), `slate` (4.67 for text, but `sky`, `goblin` and `steel` fall under 3 against it), and the band `gold` (2.84 on `soil`, under 2 on the blues). The same face list as candy, because no other palette colour holds white text; flat differs by having no gloss, no light and a darker band of its own. Accent candidates (the focus line, the tick): `magic`, `ember`, `moss`, `grass`, `derelict.cyan`. The three lists share no colour.

#### `ui-buttons-flat` · Flat buttons

- **Meta:** type `ui`, role `interface/button`, view `none`, themes `neutral`, `city`; gameTypes `arcade`, `puzzle`, `card-game`, `racing`. Batch **K13**.
- **Frame:** 96x32, pivot [48, 16].
- **Clips (6):** `normal` 1 · `hover` 1 · `pressed` 1 · `disabled` 1 · `tab` 1 ("Tab") · `tab-active` 1 ("Open tab").
- **Parts:** none.
- **Controls (6):** `style` (choice: solid | outline | pill; default solid), `corner` (Square / Round; default 0.5; **when** `{ style: ['solid', 'outline'] }`: `pill` is always fully round), `border` (Thin / Thick; default 0.5: the band 1 to 2 px), `shadow` (toggle "Shadow", default false: a flat 2 px drop shadow down and to the left; in every style), `face` ("Face": default cavern; swatches `skinSwatches('flat', ...)` of exactly `cavern`, `soil`, `derelict.plate`, `hearthvale.bandit`: 4), `frame` ("Edge": default cream; swatches exactly `cream`, `sky`, `goblin`, `steel`, `skin`: 5). The band touches the face: the lists share no colour.
- **Stretch and text:** as the table; white text. A `pill` button's ends are round: its slice is 8 px left and right as for the others.
- **Sounds:** `pressed` frame 0 → `tech-click` style "Select", volume 0.6 · `tab-active` frame 0 → `menu-move` style "Tab", volume 0.6.
- **Versions (5):** **Blue button** `{}` · **Outline** `{ style: 'outline', border: 1 }` · **Wine pill** `{ style: 'pill', face: hearthvale.bandit }` · **Brown with shadow** `{ face: thornwood.soil, shadow: true }` · **Night square** `{ face: derelict.plate, corner: 0, frame: thornwood.sky }`.
- **Helpers:** `engine/ui-skins.js` (`skinButton`, `skinTab`, `skinSwatches`, `SKIN_STYLES`, `SKIN_TEXT`) (new, H2), `engine/ui.js` (`BUTTON_STATES`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** The plain modern button of a mobile or casual game: one flat colour, one band, a darker lip under it, no light. Hover lightens the face a little (at most `tone(face, 0.1)`, white text stays 5.0 to 1 or more) and brightens the band; pressed drops it onto the lip. Nearest existing: `ui-buttons-wood` (bevelled and textured); this one has no bevel, no texture and no light.

#### `ui-panel-flat` · Flat panels

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `neutral`, `city`; gameTypes `arcade`, `puzzle`, `card-game`, `racing`. Batch **K13**.
- **Frame:** 96x64, pivot [48, 32].
- **Clips (4):** `panel` 1 · `panel-title` 1 ("With heading") · `inset` 1 ("List well") · `tooltip` 1.
- **Parts:** none.
- **Controls (7):** `style` (choice: solid | outline | pill; default solid; `pill` rounds the corners by 4 px), `corner` (Square / Round; default 0.5; **when** `{ style: ['solid', 'outline'] }`), `border` (Thin / Thick; default 0.5), `shadow` (toggle "Shadow", default false; in every style), `face` ("Face": as `ui-buttons-flat`: 4), `frame` ("Edge": as `ui-buttons-flat`: 5), `accent` ("Focus": a 2 px line under the heading strip, along the top of the list well and along the tooltip's top edge; default magic; swatches exactly `magic`, `ember`, `moss`, `grass`, `derelict.cyan`: 5). Focus touches the face and the band: the three lists share no colour.
- **Stretch and text:** as the table; white text on `inner` and on the `title` strip (the face's dark tone).
- **Sounds:** none.
- **Versions (5):** **Blue panel** `{}` · **Outlined** `{ style: 'outline', border: 1 }` · **Rounded wine** `{ style: 'pill', face: hearthvale.bandit, accent: thornwood.moss }` · **Brown with shadow** `{ face: thornwood.soil, shadow: true }` · **Night** `{ face: derelict.plate, accent: derelict.cyan, frame: thornwood.sky }`.
- **Helpers:** `engine/ui-skins.js` (`skinPanel` with `title` and `inset`, `skinTooltip`, `skinSwatches`, `SKIN_TEXT`) (new, H2), `engine/ui.js` (`slice9`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Flat boxes for a pause menu, a results card, a list and a tooltip. Nearest existing: `ui-dialogue`'s `box` (bevelled, sunken face); this one is flat with a focus line.

#### `ui-bars-flat` · Flat bars and slider

- **Meta:** type `ui`, role `interface/bar`, view `none`, themes `neutral`, `city`; gameTypes `arcade`, `puzzle`, `card-game`, `racing`. Batch **K13**.
- **Frame:** 64x16, pivot [32, 8].
- **Clips (7):** `frame` 1 · `fill` 1 · `fill-b` 1 · `fill-c` 1 · `flash` 4 · `slider` 1 ("Slider track") · `knob` 1 ("Slider knob").
- **Parts:** none.
- **Controls (8):** `style` (choice: solid | outline | pill; default solid), `corner` (Square / Round; default 0.5; **when** `{ style: ['solid', 'outline'] }`), `border` (Thin / Thick; default 0.5), `notches` (toggle "Notches", default false: a 1 px notch in the band every 8 px, at least 12 px in all; in every style), `frame` ("Edge": as `ui-buttons-flat`: 5), `fill`, `fillB`, `fillC` (shared lists). No `speed`.
- **Sounds:** none.
- **Versions (4):** **Flat bars** `{}` · **Pill** `{ style: 'pill' }` · **Notched** `{ notches: true, frame: thornwood.steel }` · **Outline sky** `{ style: 'outline', frame: thornwood.sky, border: 1 }`.
- **Helpers:** `engine/ui-skins.js` (`skinBarOpening`, `skinBarHousing` with `notches`, `skinBarFill`, `skinSlider`, `skinKnob`) (new, H2), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Flat bars and a slider for a settings screen and a progress bar. Nearest existing: `ui-bars-tech` (angular, lit, tick marks); this one is unlit and round or square.

#### `ui-controls-flat` · Flat checkboxes and cursor

- **Meta:** type `ui`, role `interface/cursor`, view `none`, themes `neutral`, `city`; gameTypes `arcade`, `puzzle`, `card-game`, `racing`. Batch **K13**.
- **Frame:** 32x32, pivot [16, 16]. Socket `tip` on `pointer`.
- **Clips (8):** as `ui-controls-paper`. All `noText: true`.
- **Parts:** none.
- **Controls (7):** `style` (choice: solid | outline | pill; default solid), `corner` (Square / Round; default 0.5; **when** `{ style: ['solid', 'outline'] }`), `border` (Thin / Thick; default 0.5), `face` ("Face": as `ui-buttons-flat`: 4), `frame` ("Edge": as `ui-buttons-flat`: 5), `accent` ("Tick": default magic; swatches exactly `magic`, `ember`, `moss`, `grass`, `derelict.cyan`: 5), `speed` (Slow / Fast; default 0.5). The three lists share no colour.
- **Sounds:** `check-on` frame 0 → `tech-click` style "Select", volume 0.6 · `switch-on` frame 0 → `tech-click` style "Select", volume 0.6.
- **Versions (5):** **Blue** `{}` · **Outline** `{ style: 'outline' }` · **Round wine** `{ style: 'pill', face: hearthvale.bandit }` · **Green tick** `{ face: thornwood.soil, accent: thornwood.grass }` · **Square sky** `{ corner: 0, frame: thornwood.sky, accent: thornwood.ember }`.
- **Helpers:** `engine/ui-skins.js` (`skinCheck`, `skinRadio`, `skinSwitch`, `skinPointer`, `skinSelector`, `skinSwatches`) (new, H2), `engine/ui.js` (`slice9`), `engine/motion.js` (`pulse`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Flat checkboxes, options and a switch, a solid triangle pointer and flat corner brackets. Nearest existing: `ui-crosshair` (an aiming mark, not a menu pointer).

### Stone and gold

Text is white. Face candidates (dark stone): `cavern`, `soil`, `derelict.plate`, `hearthvale.bandit` (a wine-red porphyry). Frame candidates (lit metal): `cream` (pale gold leaf), `steel` (silver), `skin` (rose gold), `hearthvale.thunder` (bright gold, #f4e06a), `hearthvale.wheat` (old gold, #e6c96a). Accent candidates (gems on the gold): `magic`, `crimson`, `moss`, `hero`, `ember`. The three lists share no colour. Checked with `worstContrast` under every look: white text is 5.45 to 1 or more on every face (the default `cavern` 6.37), and every frame is 3.14 to 1 or more against every face (lowest `hearthvale.wheat` on `hearthvale.bandit`; the default pair `cavern` and `cream` 5.27). Left out: the frames `gold` (2.0 on `slate`, under 3 on every face), `#e6c545` and `hearthvale.rust` (under 3 on every face), the faces `thorn` and `leaf` (white text 3.56 and 2.96) and `slate` (`steel` 2.997 and `hearthvale.wheat` 2.6 against it). Thornwood has no gold that stands 3 to 1 against a stone that holds white text, so the default is the pale gold `cream` and the two Hearthvale golds are the appended colours; the label stays "Gold" (material `metal`). **Not** wood: `ui-wood`'s `stone` style is a greyed wooden board with specks in a wooden frame; this skin is a stone plate in a carved metal frame with gems.

#### `ui-buttons-gilded` · Stone and gold buttons

- **Meta:** type `ui`, role `interface/button`, view `none`, themes `neutral`, `fantasy`, `dungeon`; gameTypes `arcade`, `turn-based-rpg`, `top-down-rpg`, `card-game`. Batch **K14**.
- **Frame:** 96x32, pivot [48, 16].
- **Clips (6):** `normal` 1 · `hover` 1 · `pressed` 1 · `disabled` 1 · `tab` 1 ("Tab") · `tab-active` 1 ("Open tab").
- **Parts:** none.
- **Controls (7):** `style` (choice: temple | royal | ruin; default temple), `corner` (Square / Round; default 0.5; in `temple` and `ruin` it sets the size of the cut or chipped corner), `border` (Thin / Thick; default 0.5: the gold band 1 to 2 px), `gems` (toggle "Gems", default true: a 3x3 gem at each end of the band, at least 12 px in all; in every style), `face` ("Stone": default cavern; swatches `skinSwatches('gilded', ...)` of exactly `cavern`, `soil`, `derelict.plate`, `hearthvale.bandit`: 4), `frame` ("Gold": default cream; swatches exactly `cream`, `steel`, `skin`, `hearthvale.thunder`, `hearthvale.wheat`: 5; declare `material: 'metal'`), `accent` ("Gems": default magic; swatches exactly `magic`, `crimson`, `moss`, `hero`, `ember`: 5; **when** `{ gems: [true] }`). Gems sit in the gold band and the band touches the stone: the three lists share no colour.
- **Stretch and text:** as the table, except `pressed` bottom **6**, not 5 (corrected 2026-11-19): pressed, the slab's bottom runs outline row 30, gold 29 and 28, ink line 27 and, in row 26, the temple fillet, the royal cushion and the key's inner step, with the 3x3 bottom gems in rows 26 to 28. Wood, candy and flat have no row inside the ink line, so their 5 holds; here 5 would put row 26 in the stretched middle (it differs from row 25 in every style but ruin and the thin band) and crop the bottom gems to 3x2 (measured). The helper's 5 plus the frame's 1 px gives 6; the text area (9, 8, 78x18) is unchanged. White text.
- **Sounds:** `pressed` frame 0 → `menu-confirm` style "Confirm", volume 0.6 · `tab-active` frame 0 → `menu-move` style "Tab", volume 0.6.
- **Versions (5):** **Temple gold** `{}` · **Royal** `{ style: 'royal', accent: thornwood.crimson, face: hearthvale.bandit }` (corrected 2026-11-19: with the default stone the royal scroll and round corners vanish at card size and Royal measured 0.162 against Temple gold, under the 0.2 versions rule; the wine-red porphyry stone sets it apart, 0.656) · **Ruin** `{ style: 'ruin', gems: false, face: thornwood.soil, frame: hearthvale.wheat }` · **Silver and night** `{ face: derelict.plate, frame: thornwood.steel }` · **Bright gold** `{ frame: hearthvale.thunder, accent: thornwood.moss }`.
- **Helpers:** `engine/ui-skins.js` (`skinButton`, `skinTab`, `skinSwatches`, `SKIN_STYLES`, `SKIN_TEXT`) (new, H2), `engine/ui.js` (`BUTTON_STATES`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** A button of dark carved stone in a lit gold frame, for adventure, card and dungeon games. Hover brightens the gold edge and lightens the stone at most `tone(face, 0.1)` (white text stays 5.0 to 1 or more); pressed sets it down onto its lip. Nearest existing: `ui-buttons-wood` style `stone` (a grey board in wood); this one has a metal frame, a carved pattern and gems.

#### `ui-panel-gilded` · Stone and gold panels

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `neutral`, `fantasy`, `dungeon`; gameTypes `arcade`, `turn-based-rpg`, `top-down-rpg`, `card-game`. Batch **K14**.
- **Frame:** 96x64, pivot [48, 32].
- **Clips (4):** `panel` 1 · `panel-title` 1 ("With heading") · `inset` 1 ("List well") · `tooltip` 1.
- **Parts:** none.
- **Controls (7):** `style` (choice: temple | royal | ruin; default temple), `corner` (Square / Round; default 0.5), `border` (Thin / Thick; default 0.5), `gems` (toggle "Gems", default true: a 3x3 gem in each corner; in every style), `face` ("Stone": as `ui-buttons-gilded`: 4), `frame` ("Gold": as `ui-buttons-gilded`: 5; `material: 'metal'`), `accent` ("Gems": as `ui-buttons-gilded`: 5; **when** `{ gems: [true] }`). The three lists share no colour.
- **Stretch and text:** as the table; white text on `inner` and on the `title` strip (a plaque in the stone's dark tone under a gold rule).
- **Sounds:** none.
- **Versions (5):** **Temple** `{}` · **Royal** `{ style: 'royal', face: thornwood.soil, accent: thornwood.crimson, border: 1, corner: 1 }` · **Ruin** `{ style: 'ruin', gems: false, face: thornwood.soil, frame: hearthvale.wheat }` · **Silver** `{ face: hearthvale.bandit, frame: thornwood.steel, accent: thornwood.hero, border: 1 }` · **Wine vault** `{ face: hearthvale.bandit, frame: hearthvale.thunder }`. (Corrected in fix round 1: the first Royal, Ruin and Silver changed only the style, gems or gold, and measured 0.09 to 0.19 at card size, under the 0.2 bar; each now also changes the stone, and Royal and Silver the band, so every pair measures 0.25 or more.)
- **Helpers:** `engine/ui-skins.js` (`skinPanel` with `title`, `inset` and `extras`, `skinTooltip`, `skinSwatches`, `SKIN_TEXT`) (new, H2), `engine/ui.js` (`slice9`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Stone plates in gold frames for an inventory, a shop, a quest board and a tooltip. Nearest existing: `ui-dialogue` style `ornate` (studs on a plain bevelled frame); this one has a carved gold band, a stone face and gems.

#### `ui-bars-gilded` · Stone and gold bars

- **Meta:** type `ui`, role `interface/bar`, view `none`, themes `neutral`, `fantasy`, `dungeon`; gameTypes `arcade`, `turn-based-rpg`, `top-down-rpg`, `card-game`. Batch **K14**.
- **Frame:** 64x16, pivot [32, 8].
- **Clips (7):** `frame` 1 · `fill` 1 · `fill-b` 1 · `fill-c` 1 · `flash` 4 · `slider` 1 ("Slider track") · `knob` 1 ("Slider knob").
- **Parts:** none.
- **Controls (9):** `style` (choice: temple | royal | ruin; default temple), `corner` (Square / Round; default 0.5), `border` (Thin / Thick; default 0.5), `gems` (toggle "Gems", default true: a 3x3 gem on each end cap of the housing and on the knob; the end caps are `caps` 4 px of solid gold from `skinBarOpening`, so the opening is the same with gems on or off), `frame` ("Gold": as `ui-buttons-gilded`: 5; `material: 'metal'`), `accent` ("Gems": as `ui-buttons-gilded`: 5; **when** `{ gems: [true] }`), `fill`, `fillB`, `fillC` (shared lists). No `speed`.
- **Sounds:** none.
- **Versions (4):** **Gold bars** `{}` · **Royal bright gold** `{ style: 'royal', frame: hearthvale.thunder, accent: thornwood.crimson }` · **Plain ruin** `{ style: 'ruin', gems: false }` · **Silver** `{ frame: thornwood.steel, accent: thornwood.hero, fill: thornwood.crimson }`.
- **Helpers:** `engine/ui-skins.js` (`skinBarOpening` with `caps`, `skinBarHousing` with `extras`, `skinBarFill`, `skinSlider`, `skinKnob`) (new, H2), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** A boss bar or a health bar in a gold tube with gem end caps, and a slider. Nearest existing: `ui-bars-rpg` style `ornate` (ornate ends in the panel colours); this one is metal, with gems.

#### `ui-controls-gilded` · Stone and gold checkboxes

- **Meta:** type `ui`, role `interface/cursor`, view `none`, themes `neutral`, `fantasy`, `dungeon`; gameTypes `arcade`, `turn-based-rpg`, `top-down-rpg`, `card-game`. Batch **K14**.
- **Frame:** 32x32, pivot [16, 16]. Socket `tip` on `pointer`.
- **Clips (8):** as `ui-controls-paper`. All `noText: true`.
- **Parts:** none.
- **Controls (7):** `style` (choice: temple | royal | ruin; default temple), `corner` (Square / Round; default 0.5), `border` (Thin / Thick; default 0.5), `face` ("Stone": as `ui-buttons-gilded`: 4), `frame` ("Gold": as `ui-buttons-gilded`: 5; `material: 'metal'`), `accent` ("Gems and tick": the tick, the radio gem, the lit switch track, the pointer's gem; default magic; swatches as `ui-buttons-gilded` Gems: 5), `speed` (Slow / Fast; default 0.5). The three lists share no colour.
- **Sounds:** `check-on` frame 0 → `menu-confirm` style "Soft tick", volume 0.6 · `switch-on` frame 0 → `menu-confirm` style "Soft tick", volume 0.6.
- **Versions (5):** **Temple** `{}` · **Royal ruby** `{ style: 'royal', accent: thornwood.crimson }` · **Ruin** `{ style: 'ruin', face: thornwood.soil, frame: hearthvale.wheat }` · **Silver** `{ frame: thornwood.steel, accent: thornwood.hero }` · **Bright gold** `{ frame: hearthvale.thunder, accent: thornwood.moss }`.
- **Helpers:** `engine/ui-skins.js` (`skinCheck`, `skinRadio`, `skinSwitch`, `skinPointer`, `skinSelector`, `skinSwatches`) (new, H2), `engine/ui.js` (`slice9`), `engine/motion.js` (`pulse`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Stone checkboxes framed in gold with a gem tick, a gem option, a gold switch, a gold arrow pointer with a gem, and gold corner brackets. Nearest existing: `ui-battle-menu`'s diamond-headed arrow (one cursor on a panel). **Not** a gloved hand.

## Input pictures

All input pictures: type `ui`, role `interface/icon`, view `none`, themes `neutral`; `meta.gameTypes` start with `arcade`. Drawn face-on as a prompt ("press this"), with `g.outline(INK)` once after the bodies and the motion marks drawn after the outline, as light (`motionMarks`). **Generic shapes only** (see the top section). No letters or digits: keys declare where a game prints its own letter. **No colour control is named `face`**, because the contrast check would then read the arrow pictures as text; the pale key tops are chosen so that `INK` text keeps 4.5 to 1 on them (check every swatch with `worstContrast` of `engine/ui.js` and give the lowest ratio in the report). No sounds: the game plays its own. Clips: a still picture first (measured), then a loop that shows the action at fps 8 with `speed`. 6 to 10 colours.

#### `input-key` · Keyboard key

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `neutral`; gameTypes `arcade`, `platformer`, `puzzle`, `shooter`. Batch **K15**.
- **Frame:** 32x32, pivot [16, 16]. At the default look the key is 24x22 px with its side.
- **Clips (3):** `up` 1 · `down` 1 · `tap` 8 loop ("Tap": up on frames 0 to 3 and 6 to 7, down on 4 and 5).
- **Text:** `textArea` on `up`, `down` and `tap`: `keyCap`'s `text` (the flat top face), `text: INK`, when `mark` is `none`; with a picture it returns the strip of the top face above the picture.
- **Parts:** none.
- **Controls (9):** `mark` (choice "Picture": none | up | down | left | right; default none; the arrows are 7 px pictures from `keyMark`), `size` (Small / Big; default 0.5: the key 20 to 26 px across), `corner` (Square / Round; default 0.5), `depth` (slider "Depth": Flat / Deep; default 0.5: the side 1 to 3 px), `light` (toggle "Light up", default true: while down, the top face turns the Light colour; it shows in `down` and `tap`), `body` ("Key top": default cream; swatches exactly `cream`, `steel`, `skin`, `goblin`, `hearthvale.wheat`: 5; declare `material: 'paint'`), `frame` ("Key side": default slate; swatches exactly `slate`, `soil`, `cavern`, `thorn`, `derelict.plate`: 5), `glow` ("Light": default gold; swatches exactly `gold`, `magic`, `moss`, `sky`: 4; **when** `{ light: [true] }`; `INK` holds 5.39 to 1 or more on each (`sky` 7.40), as the `down` and `tap` text areas lie on the lit top; `ember`, 3.96, is left out), `speed` (Slow / Fast; default 0.5). Top, side and light all touch: the three lists share no colour. The picture is drawn in `pick(top, '#ffffff', INK)` of the colour under it.
- **Sounds:** none.
- **Versions (5):** **Key** `{}` · **Arrow up** `{ mark: 'up' }` · **Arrow right, flat** `{ mark: 'right', depth: 0, corner: 0 }` · **Dark keys** `{ body: thornwood.steel, frame: derelict.plate, glow: thornwood.magic }` · **Big round key** `{ size: 1, corner: 1 }`.
- **Helpers:** `engine/inputs.js` (`keyCap`, `keyMark`, `KEY_MARKS`) (new, H1), `engine/color.js` (`pick`, `INK`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** One key of a keyboard, for "press" prompts and control-settings screens: a pale top on a darker side; `tap` presses it down and up again. Nearest existing: `ui-buttons-wood` (a menu button, 96 px wide, with no side and no pictures).

#### `input-key-wide` · Wide keyboard key

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `neutral`; gameTypes `arcade`, `platformer`, `puzzle`, `shooter`. Batch **K15**.
- **Frame:** 64x32, pivot [32, 16]. **A deviation from the style guide's frame table**, which gives input pictures and icons 32x32: the space bar is 54 to 60 px long and the wide keys 38 to 44 px, so no 32 px frame holds them at the height of `input-key`'s 22 px key; the height stays 32 so the wide key stands on the same line as the square one when a game sets them side by side. Say so in the report.
- **Clips (3):** `up` 1 · `down` 1 · `tap` 8 loop ("Tap", as `input-key`).
- **Text:** as `input-key`.
- **Parts:** none.
- **Controls (10):** `shape` (choice "Shape": wide | long; default wide; `wide` is 38 to 44 px long (shift, tab, enter, back), `long` is 54 to 60 px (the space bar)), `mark` (choice "Picture": none | enter | back | tab | shift; default enter; **when** `{ shape: ['wide'] }`), `size` (Small / Big; default 0.5: the length inside the shape's range), `corner` (Square / Round; default 0.5), `depth` (slider "Depth": Flat / Deep; default 0.5), `light` (toggle "Light up", default true), `body` ("Key top": as `input-key`: 5; `material: 'paint'`), `frame` ("Key side": as `input-key`: 5), `glow` ("Light": as `input-key`: 4, `gold`, `magic`, `moss`, `sky`; **when** `{ light: [true] }`), `speed` (Slow / Fast; default 0.5). The three lists share no colour.
- **Sounds:** none.
- **Versions (5):** **Enter key** `{}` · **Space bar** `{ shape: 'long' }` · **Shift** `{ mark: 'shift' }` · **Back, dark** `{ mark: 'back', body: thornwood.steel, frame: derelict.plate }` · **Tab, flat** `{ mark: 'tab', depth: 0, corner: 0 }`.
- **Helpers:** `engine/inputs.js` (`keyCap`, `keyMark`, `KEY_MARKS`) (new, H1), `engine/color.js` (`pick`, `INK`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** The long keys of a keyboard: return, back, tab, shift and the space bar, with pictures, never words. Nearest existing: `ui-buttons-wood` (a 96 px menu button with no side, no press-down and no pictures); its sibling `input-key` (the square key, built in the same batch, not existing yet) is the only other key.

#### `input-mouse` · Mouse

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `neutral`; gameTypes `arcade`, `shooter`, `puzzle`, `card-game`. Batch **K15**.
- **Frame:** 32x32, pivot [16, 16]. At the default look the mouse is 14x19 px (`size` 0.5); `mouseBody`'s `h` is taken from the `size` slider (16 to 22) and its `w` is about 0.75 x `h`. The largest mouse (22 px) plus its 8 px cable is 30 px, which fits the frame's 30 px inside its 1 px border; with the cable on, the pair is centred on the height, not the mouse alone.
- **Clips (2):** `idle` 1 (the chosen action's button lit) · `show` 8 loop ("Show it": `left`, `right`, `middle`: the button clicks down on frames 2 and 5; `wheel`: the wheel's ridges roll with up and down marks; `move`: the mouse slides 2 px left and right with left-right marks).
- **Parts:** none.
- **Controls (7):** `action` (choice "Action": left | right | middle | wheel | move; default left), `shape` (choice: oval | slim; default oval), `size` (Small / Big; default 0.5: the mouse 16 to 22 px tall, 19 at the default, passed as `mouseBody`'s `h`), `cable` (toggle "Cable", default false: a short S-bent cable from the top, 8 px), `body` ("Plastic": default steel; swatches exactly `steel`, `cream`, `slate`, `hero`, `crimson`: 5; declare `material: 'paint'`), `glow` ("Lit button": the lit button and the motion marks; default gold; swatches exactly `gold`, `magic`, `moss`, `ember`: 4), `speed` (Slow / Fast; default 0.5). The lit button lies in the plastic: the lists share no colour.
- **Sounds:** none.
- **Versions (5):** **Left click** `{}` · **Right click** `{ action: 'right' }` · **Scroll** `{ action: 'wheel', glow: thornwood.magic }` · **Move, corded** `{ action: 'move', cable: true }` · **Dark slim** `{ shape: 'slim', body: thornwood.slate }`.
- **Helpers:** `engine/inputs.js` (`mouseBody`, `motionMarks`) (new, H1), `engine/motion.js` (`wave`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** A computer mouse seen from above, for "click", "scroll" and "move" prompts. Nearest existing: none.

#### `input-face-buttons` · Face buttons

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `neutral`; gameTypes `arcade`, `platformer`, `shooter`, `racing`. Batch **K16**.
- **Frame:** 32x32, pivot [16, 16]. The cluster is 24x24 at the default look.
- **Clips (2):** `idle` 1 · `press` 8 loop ("Press": the lit button presses down on frames 4 and 5).
- **Text:** `textArea` on both clips: the lit button's top (`padCluster`'s `tops`, or the single button's top), `text: INK`; a game prints its own letter there if it wants one.
- **Parts:** none.
- **Controls (7):** `style` (choice: cluster | single; default cluster; `single` is one big round button 20 px across), `button` (choice "Button": top | right | bottom | left | all; default bottom; **when** `{ style: ['cluster'] }`), `size` (Small / Big; default 0.5), `depth` (slider "Depth": Flat / Deep; default 0.5: the button sides 1 to 3 px), `body` ("Buttons": default slate; swatches exactly `slate`, `cavern`, `steel`, `soil`, `derelict.plate`: 5; declare `material: 'paint'`), `glow` ("Lit button": default gold; swatches exactly `gold`, `magic`, `moss`, `sky`, `cream`: 5; the text area lies on the lit top, and `INK` holds 5.39 to 1 or more on each (`sky` 7.40); `crimson`, 2.65, is left out), `speed` (Slow / Fast; default 0.5). The lit button sits among the others: the lists share no colour.
- **Sounds:** none.
- **Versions (5):** **Bottom button** `{}` · **Top button** `{ button: 'top', glow: thornwood.magic }` · **Right button** `{ button: 'right', glow: thornwood.sky }` · **One big button** `{ style: 'single' }` · **Pale pad, all lit** `{ button: 'all', body: thornwood.steel, glow: thornwood.moss }`.
- **Helpers:** `engine/inputs.js` (`padCluster`, `padButton`) (new, H1), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** The four action buttons of a game controller in a diamond, with the one to press lit in a single colour. **Not** any maker's: all four buttons alike, no symbols, no letters, no four colours.

#### `input-dpad` · Direction pad

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `neutral`; gameTypes `arcade`, `platformer`, `puzzle`, `top-down-rpg`. Batch **K16**.
- **Frame:** 32x32, pivot [16, 16]. The pad is 24x24 at the default look.
- **Clips (2):** `idle` 1 · `press` 8 loop ("Press": the lit arms press down on frames 4 and 5; with `all`, each arm in turn, one per two frames).
- **Parts:** none.
- **Controls (7):** `style` (choice: cross | rocker | round; default cross), `direction` (choice "Direction": up | down | left | right | up-down | left-right | all | none; default up), `size` (Small / Big; default 0.5), `depth` (slider "Depth": Flat / Deep; default 0.5), `body` ("Pad": default slate; swatches exactly `slate`, `cavern`, `steel`, `soil`, `derelict.plate`: 5; declare `material: 'paint'`), `glow` ("Lit": default gold; swatches exactly `gold`, `magic`, `moss`, `crimson`, `cream`: 5; **when** `{ direction: ['up', 'down', 'left', 'right', 'up-down', 'left-right', 'all'] }`), `speed` (Slow / Fast; default 0.5). Lit arms join the pad: the lists share no colour.
- **Sounds:** none.
- **Versions (5):** **Up** `{}` · **Left and right** `{ direction: 'left-right', glow: thornwood.magic }` · **Rocker** `{ style: 'rocker', direction: 'all' }` · **Round pad** `{ style: 'round', direction: 'down' }` · **Pale, unlit** `{ direction: 'none', body: thornwood.steel }`.
- **Helpers:** `engine/inputs.js` (`dpadCross`) (new, H1), `engine/input-rocker.js` (`padRocker`) (new), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** A direction pad for "move" prompts, its pressed arms lit. `rocker` is one round disc with four raised wedges split by diagonal grooves round a shallow centre dimple; a pressed wedge sits lower and darker. The earlier four-separate-round-buttons style (`discs`) was dropped because that layout is a known console maker's directional buttons, which a player could name (style guide section 13). Nearest existing: none (the `arrow` mark in engine/marks.js is a single arrow).

#### `input-stick` · Thumbstick

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `neutral`; gameTypes `arcade`, `shooter`, `platformer`, `racing`. Batch **K16**.
- **Frame:** 32x32, pivot [16, 16]. The base ring is 22 px across at the default look.
- **Clips (2):** `idle` 1 (the cap tilted the chosen way; `press` and `spin` centred) · `move` 8 loop ("Move it": the cap tilts out and back, or circles once for `any` and `spin`, or presses in on frames 4 and 5 for `press`; motion marks round it).
- **Parts:** none.
- **Controls (8):** `motion` (choice "Motion": up | down | left | right | any | press | spin; default any), `style` (choice: domed | ridged | flat; default domed), `size` (Small / Big; default 0.5), `reach` (slider "Push": Small / Far; default 0.5: how far the cap moves, 2 to 4 px; **when** `{ motion: ['up', 'down', 'left', 'right', 'any', 'spin'] }`, because with `press` the cap does not tilt; not the standard `tilt` toggle (style guide section 10), so it is labelled "Push" and its key is `reach`), `body` ("Stick": default slate; swatches exactly `slate`, `cavern`, `steel`, `soil`, `derelict.plate`: 5; declare `material: 'paint'`), `accent` ("Base ring": default stone; swatches exactly `stone`, `cream`, `wood`, `#6b7280`: 4), `glow` ("Arrows": the motion marks; default gold; swatches exactly `gold`, `magic`, `moss`, `crimson`: 4), `speed` (Slow / Fast; default 0.5). The cap lies over the ring, and the marks stand beside the ring: the three lists share no colour.
- **Sounds:** none.
- **Versions (5):** **Any way** `{}` · **Push up** `{ motion: 'up', glow: thornwood.magic }` · **Click in** `{ motion: 'press', style: 'ridged' }` · **Spin** `{ motion: 'spin', reach: 1 }` · **Pale flat stick** `{ style: 'flat', body: thornwood.steel, accent: thornwood.wood }`.
- **Helpers:** `engine/inputs.js` (`stickTop`, `motionMarks`) (new, H1), `engine/motion.js` (`wave`, `TAU`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** A thumbstick seen from above, showing which way to push it, to click it in or to turn it round. Nearest existing: none.

#### `input-shoulder` · Shoulder button

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `neutral`; gameTypes `arcade`, `shooter`, `racing`, `platformer`. Batch **K16**.
- **Frame:** 32x32, pivot [16, 16]. A bumper is 26x9 px, a trigger 14x22 px, at the default look.
- **Clips (2):** `idle` 1 · `press` 8 loop ("Press": down on frames 4 and 5, 2 px).
- **Parts:** none.
- **Controls (8):** `button` (choice "Button": bumper | trigger; default bumper), `side` (choice "Side": left | right; default left; the picture is mirrored), `style` (choice "Style": rounded | angled; default rounded; **when** `{ button: ['bumper'] }`: only a bumper's outer end takes the choice, a trigger is always a curved paddle), `size` (Small / Big; default 0.5), `lit` (toggle "Lit", default true: the button in the Lit colour, as a prompt; off: the plain shape, for a settings list), `body` ("Plastic": default slate; swatches exactly `slate`, `cavern`, `steel`, `soil`, `derelict.plate`: 5; declare `material: 'paint'`), `glow` ("Lit": default gold; swatches exactly `gold`, `magic`, `moss`, `crimson`, `cream`: 5; **when** `{ lit: [true] }`), `speed` (Slow / Fast; default 0.5). The lit face sits on the plastic: the lists share no colour.
- **Sounds:** none.
- **Versions (5):** **Left bumper** `{}` · **Right trigger** `{ button: 'trigger', side: 'right' }` · **Left trigger, blue** `{ button: 'trigger', glow: thornwood.magic }` · **Angled right bumper** `{ side: 'right', style: 'angled' }` · **Unlit pale** `{ lit: false, body: thornwood.steel }`.
- **Helpers:** `engine/inputs-shoulder.js` (`shoulderButton`, with `base: 'fixed'`, `back: 'curved'`, `end: 'stepped'`, `rim`, `tidy`, `pivot`), which hands a call without those options to `engine/inputs.js` `shoulderButton` (new, H1), `engine/palettes.js` (`PALETTE`). Corrected in the K16 fix round: the options the sprite needs (a bottom edge that stays put when pressed, a curved-back trigger on a pivot, a hand-stepped round end, a light top edge, tidied edges) went into a new module beside `inputs.js` rather than into it, because builders edit the engine at the same time and existing exports are not changed (additive-only rule).
- **Look and motion:** The buttons on top of a game controller, as prompts: a long bumper or a curved trigger, left or right. No letters or numbers on it.

## Icon sets

All icon sets: type `icon`, frame 32x32, pivot [16, 16] (`ICON_SIZE`, `ICON_PIVOT`), one 1-frame clip per icon (`iconClips`), 20 to 26 px per icon through `iconFit`, `g.outline(INK)` once per icon inside `iconFit`'s draw, lights after it, at most 10 colours. No `speed` (no animated clip). Read `sprites/icons-consumables.js` (things that lean) and `sprites/icons-upgrades.js` (flat signs on plates) first. **One idea per icon, a different silhouette for each** (style guide section 8). Themes start with `neutral`. Fixed colours (an egg's shell, a carrot's orange) are palette colours by name, never typed hex. Every new shape below is from H3 and is imported from `engine/icons-more.js`.

#### `icons-food` · Food icons

- **Meta:** type `icon`, role `items/icon`, view `none`, themes `neutral`, `farm`, `fantasy`; gameTypes `farming-sim`, `top-down-rpg`, `turn-based-rpg`, `arcade`. Batch **K17**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (8):** `apple` · `drumstick` ("Roast leg") · `cheese` · `fish` · `egg` · `carrot` · `mushroom` · `soup` (1 frame each).
- **Parts:** none.
- **Controls (7):** `size` (Small / Big; default 0.5), `tilt` (toggle "Tilt", default true), `shade` (toggle "Extra shading", default true), `shine` (toggle "Shine", default true), `body` ("Fruit": the apple; default crimson; swatches exactly `crimson`, `gold`, `moss`, `thorn`, `ember`: 5; declare `material: 'plant'`), `accent` ("Greens": the apple's leaf, the carrot's top, the herb in the soup; default leaf; swatches exactly `leaf`, `grass`, `hearthvale.leaf`, `hearthvale.pine`: 4), `bowl` ("Bowl": the soup bowl; default wood; swatches exactly `wood`, `soil`, `cream`, `steel`, `#a8612a`, `#c98a4a`: 6; declare `material: 'paint'`, as a bowl may be wood, glazed clay or tin). Fixed: cheese `gold`, drumstick `wood` with a `cream` bone, fish `water` with a `cream` belly, egg `cream`, carrot `ember`, mushroom cap `soil` on a `cream` stem, soup `ember`. The leaf touches the apple and the herb lies in the bowl: Fruit, Greens and Bowl share no colour.
- **Sounds:** none.
- **Versions (5):** **Pantry** `{}` · **Upright** `{ tilt: false, body: thornwood.ember, accent: hearthvale.pine }` · **Green apple** `{ body: thornwood.moss, accent: thornwood.grass }` · **Plain and big** `{ size: 1, shade: false, shine: false }` · **Dark bowl** `{ bowl: thornwood.soil, body: thornwood.gold }`.
- **Helpers:** `engine/icons.js` (`ICON_SIZE`, `ICON_PIVOT`, `ICON_LEAN`, `iconClips`, `iconFit`, `iconTidy`, `iconGlint`), `engine/icons-more.js` (new, H3: `iconFood` for the apple, the roast leg and the cheese, `iconFish`, `iconEgg`, `iconRoot`, `iconMushroom`, `iconBowl`), `engine/food.js` (`drawFruit`, `drawMeal`, through `iconFood`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Food for a farming inventory, a cooking menu or an RPG bag. Nearest existing: `icons-consumables` (potions, bread, herb, candle, bomb, tent: no fruit, meat, fish, egg, vegetable or soup) and the `fruit` and `meal` pickups (world pickups that float and burst; these are still inventory pictures). **Not** a red-capped, white-spotted mushroom: the cap is plain brown with gills.

#### `icons-materials` · Material icons

- **Meta:** type `icon`, role `items/icon`, view `none`, themes `neutral`, `farm`, `fantasy`; gameTypes `farming-sim`, `top-down-rpg`, `roguelike-action`, `arcade`. Batch **K17**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (8):** `log` · `plank` ("Planks") · `stone` · `ore` · `ingot` · `cloth` ("Bolt of cloth") · `rope` · `hide` (1 frame each).
- **Parts:** none.
- **Controls (8):** `size` (Small / Big; default 0.5), `tilt` (toggle "Tilt", default true), `shade` (toggle "Extra shading", default true), `shine` (toggle "Shine", default true), `wood` ("Wood": the log and the planks; default wood; swatches exactly `wood`, `soil`, `#a8612a`, `#c98a4a`, `cream`: 5), `stone` ("Stone": the stone and the ore's rock; default stone; swatches exactly `stone`, `slate`, `#6b7280`, `hearthvale.cobble`: 4), `metal` ("Metal": the ingot and the ore's flecks; default steel; swatches exactly `steel`, `gold`, `#e6c545`, `hearthvale.rust`, `crimson`: 5), `accent` ("Cloth and hide": default hero; swatches exactly `hero`, `thorn`, `leaf`, `ember`, `moss`: 5; declare `material: 'cloth'`). Fixed: the rope `hearthvale.wheat`, the cloth's core `wood`. The flecks lie in the ore's rock: Stone and Metal share no colour; no other two touch, and no list shares a colour with another.
- **Sounds:** none.
- **Versions (5):** **Workshop** `{}` · **Upright** `{ tilt: false }` · **Copper and dark wood** `{ metal: hearthvale.rust, wood: thornwood.soil }` · **Gold ore, red cloth** `{ metal: thornwood.gold, accent: thornwood.ember }` · **Plain and big** `{ size: 1, shade: false, stone: thornwood.slate }`.
- **Helpers:** `engine/icons.js` (`ICON_SIZE`, `ICON_PIVOT`, `ICON_LEAN`, `ICON_DIAGONAL`, `iconClips`, `iconFit`, `iconTidy`, `iconGlint`), `engine/icons-more.js` (new, H3: `iconLog`, `iconPlank`, `iconOre` (the stone with `flecks: 0`), `iconIngot`, `iconCloth`, `iconCoil`, `iconHide`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Raw materials for crafting, building and trading. Nearest existing: `icons-key-items` (its crystal shard is a story item; there is no raw material in any set).

#### `icons-tools` · Tool icons

- **Meta:** type `icon`, role `items/icon`, view `none`, themes `neutral`, `farm`; gameTypes `farming-sim`, `top-down-rpg`, `roguelike-action`, `arcade`. Batch **K17**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (8):** `axe` · `pickaxe` · `shovel` · `hoe` · `hammer` · `sickle` · `watering-can` ("Watering can") · `fishing-rod` ("Fishing rod") (1 frame each).
- **Parts:** none.
- **Controls (7):** `size` (Small / Big; default 0.5), `tilt` (toggle "Tilt", default true), `shade` (toggle "Extra shading", default true), `shine` (toggle "Shine", default true), `metal` ("Metal": the heads, the can, the reel; default steel; swatches exactly `steel`, `gold`, `slate`, `hearthvale.rust`, `#e6c545`: 5), `wood` ("Handles": default wood; swatches exactly `wood`, `soil`, `#a8612a`, `#c98a4a`, `cream`: 5), `accent` ("Grips": a wrap round each handle and the can's band; default crimson; swatches exactly `crimson`, `hero`, `leaf`, `thorn`, `ember`: 5). Grips lie on the handles next to the heads: the three lists share no colour.
- **Sounds:** none.
- **Versions (5):** **Toolshed** `{}` · **Gold tools** `{ metal: thornwood.gold, accent: thornwood.hero }` · **Dark handles** `{ wood: thornwood.soil, accent: thornwood.leaf }` · **Upright** `{ tilt: false }` · **Old iron** `{ metal: hearthvale.rust, size: 1, shine: false }`.
- **Helpers:** `engine/icons.js` (`ICON_SIZE`, `ICON_PIVOT`, `ICON_DIAGONAL`, `iconClips`, `iconFit`, `iconTidy`, `iconGlint`), `engine/icons-more.js` (new, H3: `iconTool` for the six hand tools, `iconCan`, `iconRod`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** The tools of a farming or crafting game, handle bottom left and head top right like every icon in the library. Nearest existing: `icons-gear` (weapons and armour; its staff and sword are not tools).

#### `icons-system` · Settings icons

- **Meta:** type `icon`, role `interface/icon`, view `none`, themes `neutral`; gameTypes `arcade`, `puzzle`, `platformer`, `card-game`. Batch **K18**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (10):** `settings` · `sound` · `mute` · `music` · `display` · `controls` · `language` · `save` · `pause` · `home` (1 frame each).
- **Parts:** none.
- **Controls (7):** `backing` (choice "Plate": none | circle | hex; default circle; `iconPlate`), `bold` (toggle "Bold", default false: every picture one pixel heavier, `iconBold`), `shine` (toggle "Shine", default true), `size` (Small / Big; default 0.5), `face` ("Plate colour": default slate; swatches exactly `slate`, `hero`, `cavern`, `soil`, `thorn`, `derelict.plate`: 6; **when** `{ backing: ['circle', 'hex'] }`), `body` ("Picture": default cream; swatches exactly `cream`, `gold`, `magic`, `goblin`, `steel`: 5), `accent` ("Second colour": the mute cross, the cog's hub, the save arrow, the home's door; default crimson; swatches exactly `crimson`, `ember`, `moss`, `grass`: 4). The picture lies on the plate and the second colour on both: the three lists share no colour. Pictures are upright (`tilt: false` in `iconFit`), as `icons-upgrades`.
- **Sounds:** none.
- **Versions (5):** **Round plates** `{}` · **No plates** `{ backing: 'none', body: thornwood.steel }` · **Gold on hexagons** `{ backing: 'hex', body: thornwood.gold }` · **Bold blue** `{ bold: true, face: thornwood.hero }` · **Night** `{ face: derelict.plate, body: thornwood.magic, accent: thornwood.ember }`.
- **Helpers:** `engine/icons.js` (`ICON_SIZE`, `ICON_PIVOT`, `ICON_PLATES`, `iconClips`, `iconFit`, `iconPlate`, `iconBold`), `engine/icons-more.js` (new, H3: `iconCog`, `iconSpeaker` (sound with `waves: 2`, mute with `waves: 0` and `cross`), `iconNote`, `iconScreen`, `iconPad`, `iconGlobe`, `iconTray`, `iconSign` (pause), `iconHome`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** The signs of a settings and pause menu, readable at 1x: a cog, a speaker with waves or a cross, a note, a screen with full-screen corners, a generic controller, a globe, a tray with an arrow going in, a pause sign and a house. Nearest existing: `icons-upgrades` (flat signs on plates, for upgrades: damage, speed, magnet...); none of those is a menu sign. **Not** a floppy disk for save, and the controller is no maker's shape.

#### `icons-currency` · Currency icons

- **Meta:** type `icon`, role `interface/icon`, view `none`, themes `neutral`; gameTypes `arcade`, `roguelike-action`, `farming-sim`, `card-game`. Batch **K18**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (8):** `coins` · `gem` · `banknote` · `token` · `ticket` · `star` · `lives` · `energy` (1 frame each).
- **Parts:** none.
- **Controls (7):** `size` (Small / Big; default 0.5), `tilt` (toggle "Tilt", default true), `shade` (toggle "Extra shading", default true), `shine` (toggle "Shine", default true), `metal` ("Gold": the coins, the token's rim, the star; default gold; swatches exactly `gold`, `steel`, `#e6c545`, `hearthvale.rust`, `#c98a4a`: 5), `paper` ("Paper": the banknote and the ticket; default goblin; swatches exactly `goblin`, `cream`, `moss`, `sky`, `skin`: 5; declare `material: 'paint'`), `accent` ("Gems and energy": the gem, the token's face, the bolt; default magic; swatches exactly `magic`, `crimson`, `thorn`, `hero`, `ember`: 5). Fixed: the heart `crimson` (lives keep their red: style guide section 3, rule 7; declare `materials: { rest: 'signal' }`). The token's face lies in its rim: Gold and Gems share no colour; no list shares a colour with another.
- **Sounds:** none.
- **Versions (5):** **Wallet** `{}` · **Silver** `{ metal: thornwood.steel }` · **Upright** `{ tilt: false }` · **Ruby and cream** `{ accent: thornwood.crimson, paper: thornwood.cream }` · **Big and plain** `{ size: 1, shade: false, shine: false }`.
- **Helpers:** `engine/icons.js` (`ICON_SIZE`, `ICON_PIVOT`, `ICON_LEAN`, `iconClips`, `iconFit`, `iconTidy`, `iconGlint`, `iconGem` (cut `diamond`), `iconHeart`, `iconPaint` (the star from `starIn`)), `engine/icons-more.js` (new, H3: `iconCoins`, `iconBill`, `iconToken`, `iconTicket`, `iconBolt`), `engine/shapes.js` (`starIn`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** What a shop, a reward screen or a top bar counts: coins, gems, notes, tokens, tickets, stars, lives and energy. Nearest existing: `icons-key-items` (a coin pouch and a crystal shard, as story items) and `ui-hud-platformer` (16 px HUD marks). **No currency sign, letter or face** on the banknote or the token, and the star has sharp points and no face.

#### `icons-map` · Map marker icons

- **Meta:** type `icon`, role `interface/icon`, view `none`, themes `neutral`, `fantasy`, `farm`; gameTypes `top-down-rpg`, `turn-based-rpg`, `farming-sim`, `roguelike-action`. Batch **K18**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (8):** `pin` · `flag` · `dig` ("Dig spot") · `town` · `shop` · `treasure` · `danger` · `here` ("You are here") (1 frame each).
- **Parts:** none.
- **Controls (7):** `style` (choice: picture | badge; default picture; `badge` puts every picture except `pin` on the head of a map pin: `iconPin` with `plate`), `bold` (toggle "Bold", default false: every picture one pixel heavier), `shine` (toggle "Shine", default true), `size` (Small / Big; default 0.5), `face` ("Badge colour": default cream; swatches exactly `cream`, `goblin`, `sky`, `skin`, `haze`: 5; **when** `{ style: ['badge'] }`), `body` ("Marker": the pin, the flag, the X, the danger skull's eyes, the arrow; default crimson; swatches exactly `crimson`, `hero`, `gold`, `leaf`, `thorn`, `ember`: 6), `accent` ("Second colour": the flag pole, the roofs, the awning's stripes, the chest's bands; default wood; swatches exactly `wood`, `soil`, `steel`, `slate`: 4). The flag flies from its pole and every picture lies on the badge: the three lists share no colour. Pictures are upright.
- **Sounds:** none.
- **Versions (5):** **Map marks** `{}` · **Pin badges** `{ style: 'badge' }` · **Blue route** `{ body: thornwood.hero, accent: thornwood.slate }` · **Bold and big** `{ bold: true, size: 1 }` · **Gold quest** `{ body: thornwood.gold, accent: thornwood.soil, style: 'badge', face: thornwood.goblin }`.
- **Helpers:** `engine/icons.js` (`ICON_SIZE`, `ICON_PIVOT`, `iconClips`, `iconFit`, `iconBold`, `iconPaint` (the danger skull from `skullIn`, the "you are here" arrow from `chevronIn`)), `engine/icons-more.js` (new, H3: `iconPin`, `iconFlag`, `iconSign` (the dig spot as `close`), `iconHome` (the town), `iconAwning`, `iconChest`), `engine/shapes.js` (`skullIn`), `engine/gadgets.js` (`chevronIn`), `engine/palettes.js` (`PALETTE`).
- **Look and motion:** Marks for a world map, a minimap and a quest log. Nearest existing: `ui-hud-roguelite` (16 px floor-map rooms: current, boss, shop, unknown). **Not** an exclamation or question mark floating over a head as a quest marker: quests use the flag and the pin.

## Weather

All weather: type `effect`, role `effects/weather`, view `none`, frame 64x64, pivot [32, 32], `grounded: false`, one clip `loop` of 8 frames, fps 10 with `speed`, built on `fallField` (new, H1a). Pieces fill the inner 62x62 square and wrap round it; every blurb ends "Lay copies 62 px apart (each over its neighbours' empty border) to cover the screen." No ink: pieces are light, drawn as solid pixels, leaves and petals rimmed in a darker tone of their own colour (style guide section 2). 3 to 12 colours. **Layers:** where a row has a far layer, it is a second `fallField` with half the columns (rounded up), a smaller size, the same `rows`, `slant`, `turns` and shapes, **far laps** = `max(1, round(2/3 x laps))`, a whole number so the far loop closes too (rain: drizzle 1, rain 3, storm 3; snowfall: soft 1, blizzard 2, sleet 1), and `shift` [17, 23], drawn first, so near pieces cross over far ones. A far piece and a near piece can touch: their lists share no colour. **Count sliders set `cols`** (the number of columns); each style fixes `rows`, `laps`, `slant`, `sway`, `turns` (1 where not said) and its shape or `shapes` list as the row says. Read `sprites/fireflies.js` and `sprites/mist-drift.js` (part 1's area loops) first: this is their screen-wide partner.

#### `rain` · Rain

- **Meta:** type `effect`, role `effects/weather`, view `none`, themes `neutral`, `forest`, `city`; gameTypes `platformer`, `top-down-rpg`, `farming-sim`, `shooter`. Batch **K19**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (7):** `pieces` (slider "Drops": Few / Many; whole numbers 4 to 12 columns, step 1, default 8), `length` (Short / Long; default 0.5: streaks 3 to 9 px; **when** `{ style: ['rain', 'storm'] }`: drizzle's streaks are a fixed 2 px), `style` (choice: drizzle | rain | storm; default rain. `drizzle`: `shapes: ['dot', { shape: 'streak', size: 2 }]` (dots and 2 px streaks in alternate columns), rows 3, laps 2; `rain`: shape `streak`, rows 2, laps 4, straight down; `storm`: shape `streak` at 45 degrees, `slant: 1`, rows 2, laps 5, streaks 2 px longer), `layers` (toggle "Far rain", default true: the far layer; in every style), `body` ("Rain": default sky; swatches exactly `sky`, `cream`, `water`, `steel`, `#d8d8e0`: 5; declare `material: 'water'`), `accent` ("Far rain": default haze; swatches exactly `haze`, `stone`, `slate`, `dusk`: 4; declare `material: 'water'`; **when** `{ layers: [true] }`), `speed` (Slow / Fast; default 0.5). Near and far streaks cross: the lists share no colour.
- **Sounds:** `loop` frame 0 → `wind` style "Storm", volume 0.35, **when** `{ style: ['storm'] }`.
- **Versions (5):** **Rain** `{}` · **Drizzle** `{ style: 'drizzle', pieces: 6 }` · **Storm** `{ style: 'storm', pieces: 12, length: 1 }` · **Light shower** `{ pieces: 4, layers: false }` · **Night rain** `{ body: thornwood.steel, accent: thornwood.slate }`.
- **Helpers:** `engine/weather.js` (`fallField` with shape `streak`, `shapes` for drizzle, `shift` for the far layer) (new, H1).
- **Look and motion:** Rain falling over the whole screen, near streaks bright and long, far ones dim and short. A game lays it over any scene. Nearest existing: `rain-ripples` (part 1: drops striking a pool, a top-down 64 px patch); this one is the falling rain itself, and it wraps.

#### `snowfall` · Snowfall

- **Meta:** type `effect`, role `effects/weather`, view `none`, themes `neutral`, `forest`; gameTypes `platformer`, `top-down-rpg`, `farming-sim`, `puzzle`. Batch **K19**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (8):** `pieces` (slider "Flakes": Few / Many; whole numbers 4 to 12 columns, step 1, default 7), `size` (Small / Big; default 0.5: flakes 1 to 3, a dot, a plus or a star; **when** `{ style: ['soft', 'blizzard'] }`: sleet's pieces are fixed by its `shapes` list), `style` (choice: soft | blizzard | sleet; default soft. `soft`: shape `flake`, rows 4, laps 1; `blizzard`: shape `flake`, `slant: 1`, rows 3, laps 3; `sleet`: `shapes: [{ shape: 'streak', size: 3 }, 'dot']` (3 px streaks and dots in alternate columns), rows 3, laps 2), `sway` (Still / Swaying; default 0.5: 0 to 3 px, `swayCycles` 2; in every style), `layers` (toggle "Far snow", default true; in every style), `body` ("Snow": default cream; swatches exactly `cream`, `#d8d8e0`, `sky`, `steel`, `goblin`: 5; declare `material: 'water'`), `accent` ("Far snow": default haze; swatches exactly `haze`, `stone`, `slate`, `dusk`: 4; declare `material: 'water'`; **when** `{ layers: [true] }`), `speed` (Slow / Fast; default 0.5). Near and far flakes cross: the lists share no colour.
- **Sounds:** `loop` frame 0 → `wind` style "Storm", volume 0.35, **when** `{ style: ['blizzard'] }`.
- **Versions (5):** **Snowfall** `{}` · **Blizzard** `{ style: 'blizzard', pieces: 12 }` · **Sleet** `{ style: 'sleet', pieces: 9 }` · **Big flakes** `{ size: 1, pieces: 4 }` · **Still night** `{ sway: 0, layers: false, body: thornwood.sky }`.
- **Helpers:** `engine/weather.js` (`fallField` with shape `flake`, `shapes` for sleet, `sway`, `slant`, `shift`) (new, H1).
- **Look and motion:** Snow drifting down, swaying as it falls, a blizzard driving at 45 degrees. Nearest existing: `fx-ice-spell` (a spell's burst of ice) and `snowflake` in engine/spells.js (one big flake); nothing falls.

#### `falling-leaves` · Falling leaves

- **Meta:** type `effect`, role `effects/weather`, view `none`, themes `neutral`, `forest`, `farm`; gameTypes `platformer`, `top-down-rpg`, `farming-sim`, `puzzle`. Batch **K19**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (7):** `pieces` (slider "Leaves": Few / Many; whole numbers 3 to 9 columns, step 1, default 5), `size` (Small / Big; default 0.5: leaves 3 to 5 px long), `style` (choice: drift | flutter | gust; default drift. `drift`: rows 2, laps 1, `turns: 1` (one flip per row gap); `flutter`: rows 2, laps 1, `turns: 3`, `swayCycles` 3; `gust`: `slant: 1`, rows 2, laps 2, `turns: 2`), `sway` (Still / Swaying; default 0.5: 1 to 5 px; in every style), `body` ("Leaves": default ember; swatches exactly `ember`, `crimson`, `leaf`, `soil`: 4; declare `material: 'plant'`), `accent` ("Second leaves": default gold; swatches exactly `gold`, `moss`, `grass`, `wood`: 4; declare `material: 'plant'`), `speed` (Slow / Fast; default 0.5). Columns alternate the two colours and leaves of neighbouring columns can touch: the lists share no colour.
- **Sounds:** none.
- **Versions (5):** **Autumn** `{}` · **Summer green** `{ body: thornwood.leaf, accent: thornwood.grass }` · **Gusty** `{ style: 'gust', pieces: 9 }` · **A few big leaves** `{ pieces: 3, size: 1, style: 'flutter' }` · **Red and brown** `{ body: thornwood.crimson, accent: thornwood.wood }`.
- **Helpers:** `engine/weather.js` (`fallField` with shape `leaf`, `rim`, `sway`, `swayCycles`, `turns`, `slant`) (new, H1).
- **Look and motion:** Leaves turning over as they fall through the whole scene, two colours mixed. Nearest existing: `leaf-burst` (part 1: a one-shot burst from a cut bush) and the shake of `tree-oak`; neither loops over the screen.

#### `petal-fall` · Falling petals

- **Meta:** type `effect`, role `effects/weather`, view `none`, themes `neutral`, `farm`, `forest`; gameTypes `top-down-rpg`, `farming-sim`, `puzzle`, `card-game`. Batch **K20**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (7):** `pieces` (slider "Petals": Few / Many; whole numbers 4 to 12 columns, step 1, default 8), `size` (Small / Big; default 0.5: 2 to 4 px; **when** `{ style: ['blossom', 'rose'] }`: `fallPiece` draws a seed at one size), `style` (choice: blossom | rose | seeds; default blossom. `blossom`: shape `petal`, rows 3, laps 1, columns alternating the two colours; `rose`: shape `petal` one size larger, every petal two-tone (its rim in the second colour), rows 2, laps 1; `seeds`: shape `seed`, rows 2, laps 1, sway doubled), `sway` (Still / Swaying; default 0.5: 1 to 4 px; in every style), `body` ("Petals": default skin; swatches exactly `skin`, `cream`, `crimson`, `gold`, `derelict.chitin`: 5; declare `material: 'plant'`), `accent` ("Second petals": the second column colour, a rose petal's rim, a seed's tuft; default thorn; swatches exactly `thorn`, `ember`, `moss`, `magic`, `hero`: 5; declare `material: 'plant'`), `speed` (Slow / Fast; default 0.5). The two colours touch on a rose petal and across columns: the lists share no colour.
- **Sounds:** none.
- **Versions (5):** **Blossom** `{}` · **Rose petals** `{ style: 'rose', body: thornwood.crimson, accent: thornwood.thorn }` · **Seeds on the wind** `{ style: 'seeds', body: thornwood.cream, pieces: 6 }` · **Golden petals** `{ body: thornwood.gold, accent: thornwood.ember }` · **Light drift** `{ pieces: 4, sway: 1 }`.
- **Helpers:** `engine/weather.js` (`fallField` with shapes `petal` and `seed`, `rim`, `sway`) (new, H1).
- **Look and motion:** Blossom, rose petals or fluffy seeds drifting down over a garden, a wedding or a title screen. Nearest existing: the "Blossom" version of `leaf-burst` (a one-shot burst) and `confetti` (a one-shot celebration).

#### `ash-fall` · Falling ash

- **Meta:** type `effect`, role `effects/weather`, view `none`, themes `neutral`, `dungeon`, `horror`; gameTypes `platformer`, `roguelike-action`, `top-down-rpg`, `shooter`. Batch **K20**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (7):** `pieces` (slider "Flakes": Few / Many; whole numbers 4 to 12 columns, step 1, default 8), `size` (Small / Big; default 0.5: flakes 2 to 3 px; **when** `{ style: ['ash', 'cinders'] }`: soot is a fixed 2 px dot), `style` (choice: ash | cinders | soot; default ash. `ash`: shape `ash`, rows 3, laps 1, `turns: 1` (one tumble per row gap); `cinders`: the same with `coreEvery: 2` and `turns: 2`, the core of every second column lit while its turn is under 0.5 (`fallPiece`), so it blinks twice per row gap as the flake tumbles; `soot`: shape `dot` 2 px, rows 2, laps 2, no sway), `sway` (Still / Swaying; default 0.5: 0 to 3 px; **when** `{ style: ['ash', 'cinders'] }`), `body` ("Ash": default stone; swatches exactly `stone`, `cream`, `slate`, `#6b7280`, `haze`: 5; declare `material: 'stone'`), `glow` ("Embers": default ember; swatches exactly `ember`, `gold`, `crimson`, `magic`: 4; declare `material: 'fire'`; **when** `{ style: ['cinders'] }`), `speed` (Slow / Fast; default 0.5). The ember core lies in its flake: Ash and Embers share no colour.
- **Sounds:** none.
- **Versions (5):** **Ash** `{}` · **Cinders** `{ style: 'cinders', body: thornwood.haze, pieces: 10 }` · **Soot** `{ style: 'soot', body: thornwood.slate }` · **Heavy fall** `{ pieces: 12, size: 1 }` · **Cold ash** `{ body: thornwood.cream, sway: 1, pieces: 5 }`.
- **Helpers:** `engine/weather.js` (`fallField` with shapes `ash` and `dot`, `core`, `coreEvery`, `turns`, `sway`) (new, H1).
- **Look and motion:** Ash drifting down over a burned town, a volcano or a haunted ruin; cinders glow and fade as they tumble. Nearest existing: `ember-drift` (part 1: embers rising in one 64 px patch above a fire; its "Falling ash" version is grey flakes in that patch); this one falls and wraps across the screen.

#### `dust-storm` · Dust storm

- **Meta:** type `effect`, role `effects/weather`, view `none`, themes `neutral`, `farm`; gameTypes `top-down-rpg`, `racing`, `shooter`, `platformer`. Batch **K20**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`. The storm blows to the right; a game mirrors it.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (7):** `pieces` (slider "Grains": Few / Many; whole numbers 4 to 12 streams, step 1, default 8; `axis: 'x'`, so the count is of rows of grains across the height), `length` (Short / Long; default 0.5: grains 2 to 6 px, passed as the `grain` pieces' `size`; the dots of `dust` and the leaves of `debris` keep their own size), `style` (choice: sand | dust | debris; default sand. `sand`: shape `grain`, rows 3, laps 3; `dust`: `shapes: ['dot', 'grain']` (alternate streams), rows 4, laps 2, slower; `debris`: `shapes: ['grain', 'grain', 'leaf']` (every third stream leaves, tumbling with `turns: 2`), rows 2, laps 3), `sway` (Still / Swaying; default 0.5: 0 to 3 px up and down; in every style), `body` ("Sand": default cream (a Thornwood colour, by the palette rule); swatches exactly `cream`, `stone`, `haze`, `hearthvale.wheat`, `hearthvale.path`: 5, the two Hearthvale sands appended; declare `material: 'earth'`), `accent` ("Dark grains": every second stream and the debris; default wood; swatches exactly `wood`, `soil`, `slate`, `ember`: 4; declare `material: 'earth'`), `speed` (Slow / Fast; default 0.5). Streams of the two colours can touch: the lists share no colour.
- **Sounds:** `loop` frame 0 → `wind` style "Storm", volume 0.35.
- **Versions (6):** **Sandstorm** `{}` · **Golden sand** `{ body: hearthvale.wheat, pieces: 10 }` · **Dust haze** `{ style: 'dust', length: 1 }` · **Debris** `{ style: 'debris', pieces: 6 }` · **Grey grit** `{ body: thornwood.stone, accent: thornwood.slate }` · **Light breeze** `{ pieces: 4, length: 0 }`.
- **Helpers:** `engine/weather.js` (`fallField` with `axis: 'x'`, shape `grain`, `shapes` for dust and debris, `turns`, `sway`) (new, H1).
- **Look and motion:** Sand and grit streaming sideways across the whole screen, for deserts, wastelands and dirt tracks. Nearest existing: `wind-gust` (part 1: a 64 px patch of streaks that does not wrap).

## Left out, and why

| Wanted | Why it is left out | What would make it possible |
|---|---|---|
| The other six menu skins (the plan's line is 10) | Part 2 proves the skin module on four looks that differ most from the three that exist; six more are cheap once K11 to K14 are reviewed | A part 3 adding styles to `engine/ui-skins.js` (for example ice, leafy, riveted iron, neon, pixel-retro, bone); each is four sprites |
| Pixel letters and numbers in 4 styles, speech bubbles, emotes (the plan's "18" line) | A different line: letters need a glyph system with spacing, which nothing in `engine/` has (`ui-damage-digits` has digits only) | A font helper with a sheet of glyphs and a spacing table; its own specification |
| Touch-screen gestures (tap, swipe, pinch) | A gesture reads only with a finger or a hand, and part 2 draws no body parts; a plain ring reads as a click | A small hand shape in `engine/inputs.js`, designed so it is not the white-gloved hand of section 13 |
| Real button layouts of particular consoles, their symbols, colours or letters | Originality: each is one maker's design (style guide section 13) | Nothing: games add their own labels in the declared text areas |
| Rain or hail striking the ground inside the screen-wide field | Splashes sit on a ground line, and the field has no ground: it wraps up and down | Already covered as a patch: `rain-ripples` (part 1) laid along the ground |
| Weather drifting at angles other than straight down or 45 degrees | A slant wraps only if a piece moves sideways by a whole period per period of fall; other leans would show a jump where tiles meet (see H1a) | Tiles laid with a sideways offset per row, a game-side change; meanwhile the pieces themselves lean |
| A two-way tile pitch in the exported JSON | Contract 8's `tile` entry carries a horizontal pitch only (`{ x, w }`), for a segmented bar; the weather blurbs say "62 px" in words | A `tile: { x, y, w, h }` form in Contract 8, the export and its test: a contract change, not a helper |
| A falling `loop` for `confetti` | `fallField` makes it possible now, but it is a change to a part 1 sprite, not a new one | A later edit to `sprites/confetti.js` adding `loop` with shape `petal` in three colours |
| A night overlay, a fog veil, a screen flash, heat haze | Still not a sprite: half-see-through pixels or distortion (part 1, unchanged) | A game-side tint or a future "overlay" kind |

Sounds a row would have liked and that do not exist yet (for `core-sounds-2`): a rain loop and a snow hush (`rain`, `snowfall` cue only `wind` "Storm" in their stormy styles), a paper rustle tap and a candy pop for the paper and candy buttons (they cue `ui-click`), a switch snap for the switches, a stone knock for the gilded buttons (they cue `menu-confirm`).

## Batch plan

Each batch is one builder in one sitting, with review. **Helper batches come first and build helpers only, with their tests, and no sprite.** There are three, not one or two, because each module belongs to one builder at a time (two builders appending to one file collide) and the three modules are independent: H1 is two new modules (`engine/weather.js`, `engine/inputs.js`), H2 one new module (`engine/ui-skins.js`), H3 one new module (`engine/icons-more.js`, 34 shapes). They can run side by side. A sprite batch starts only when every helper batch it waits for is merged. **Pathfinders:** K11 settles the skin conventions (text colour, swatch filtering, tab joins) for K12 to K14; K15 settles key and prompt conventions for K16; K17 settles the new icon shapes' sizes for K18; K19 settles how a screen-wide loop is judged (density, two copies side by side at 62 px) for K20. Their reports are read before the batches that wait for them. No batch waits on a sound batch: every cue is to a sound in `sounds/` today.

| Batch | Sprites (ids) | Waits for |
|---|---|---|
| **H1** | none: helpers `engine/weather.js` (`WEATHER_PIECES`, `fallLattice`, `fallAt`, `fallPiece`, `fallField`) and `engine/inputs.js` (`KEY_MARKS`, `keyCap`, `keyMark`, `mouseBody`, `padButton`, `padCluster`, `dpadCross`, `stickTop`, `shoulderButton`, `motionMarks`), with `tests/unit/weather-field.test.mjs` and `tests/unit/inputs.test.mjs` | nothing |
| **H2** | none: helper `engine/ui-skins.js` (`UI_SKINS`, `SKIN_STYLES`, `SKIN_TEXT`, `skinTones`, `skinSwatches`, `skinPanel`, `skinButton`, `skinTab`, `skinTooltip`, `skinBarOpening`, `skinBarHousing`, `skinBarFill`, `skinSlider`, `skinKnob`, `skinCheck`, `skinRadio`, `skinSwitch`, `skinPointer`, `skinSelector`), with `tests/unit/ui-skins.test.mjs` | nothing |
| **H3** | none: 34 shapes in a new module, `engine/icons-more.js` (`iconFood`, `iconFish`, `iconEgg`, `iconRoot`, `iconMushroom`, `iconBowl`, `iconLog`, `iconPlank`, `iconOre`, `iconIngot`, `iconCloth`, `iconCoil`, `iconHide`, `iconTool`, `iconCan`, `iconRod`, `iconCog`, `iconSpeaker`, `iconNote`, `iconScreen`, `iconPad`, `iconGlobe`, `iconTray`, `iconSign`, `iconHome`, `iconCoins`, `iconBill`, `iconToken`, `iconTicket`, `iconBolt`, `iconPin`, `iconFlag`, `iconAwning`, `iconChest`), with `tests/unit/icons-more.test.mjs` | nothing |
| **K11** | `ui-buttons-paper`, `ui-panel-paper`, `ui-bars-paper`, `ui-controls-paper` (pathfinder for the skins) | H2 |
| **K12** | `ui-buttons-candy`, `ui-panel-candy`, `ui-bars-candy`, `ui-controls-candy` | H2, K11 |
| **K13** | `ui-buttons-flat`, `ui-panel-flat`, `ui-bars-flat`, `ui-controls-flat` | H2, K11 |
| **K14** | `ui-buttons-gilded`, `ui-panel-gilded`, `ui-bars-gilded`, `ui-controls-gilded` | H2, K11 |
| **K15** | `input-key`, `input-key-wide`, `input-mouse` (pathfinder for input pictures) | H1 |
| **K16** | `input-face-buttons`, `input-dpad`, `input-stick`, `input-shoulder` | H1, K15 |
| **K17** | `icons-food`, `icons-materials`, `icons-tools` (pathfinder for the new icon shapes) | H3 |
| **K18** | `icons-system`, `icons-currency`, `icons-map` | H3, K17 |
| **K19** | `rain`, `snowfall`, `falling-leaves` (pathfinder for screen-wide weather) | H1 |
| **K20** | `petal-fall`, `ash-fall`, `dust-storm` | H1, K19 |

In order: H1, H2 and H3 together; then K11, K15, K17 and K19 together; then K12, K13, K14, K16, K18 and K20. A builder who finds a helper short of an option adds it to that helper's module the way the skill says (tests first, additive only, fingerprint before and after) and lists it in the report; a builder who finds a helper missing altogether stops and reports it, because this page says none is.
