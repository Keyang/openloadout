# Core sprites, part 1: specification (`core-sprites-1`)

Written 2026-11-19 by the art director for the asset plan (`docs/asset-plan.md`, section 2: core libraries, the lines "Common pickups", "Common effects" and "Weather and light overlays"). These sprites belong to no single kit: any bundle may list them. **32 sprites in 9 batches (K01 to K09)**: 11 pickups, 13 effects, 8 weather and light loops. Nothing here is built yet. **Read `docs/style-guide.md` first**: it fixes frame sizes, clip names, frame counts, cue frames, control keys and labels, palettes and metadata. This file says what each sprite is. Where this page and the style guide disagree, this page wins for that sprite; where this page is silent, the style guide and the skill (`.claude/skills/sprite-forge/SKILL.md`) decide.

| | |
|---|---|
| Game type | none of its own: each row names the kinds of game it suits |
| World | none: neutral first, then the worlds a row plainly fits |
| View | pickups `front`; effects `side`, `top-down` or `none` as each row says |
| Palette | home palette "Thornwood" for defaults, with the shared colours first (below) |
| House sound | none of its own: cues go to sounds that already exist or are specified in `core-sounds-1` |
| Sprites | **32** (32 new, 0 reused) |
| Batches | 9 |

Contents: [What is different about core sprites](#what-is-different-about-core-sprites) · [Asset list](#asset-list) · [Pickups](#pickups) · [Effects](#effects) · [Weather and light](#weather-and-light) · [Left out, and why](#left-out-and-why) · [Batch plan](#batch-plan)

## What is different about core sprites

- **What a core sprite is.** A thing that many kinds of game need whatever their world: food that heals, ammunition, a bomb, a bag of money, a splash, flames on a burning thing, a puff of poison, fireflies over a pond. It is made once and listed by many bundles, so it must look at home beside all three kits. The plan's section 4 sets the priorities: pickups and icon sets are 5 to 14 of every bundle and effects 2 to 8, so the set leans to what platformers, action-adventures, roguelikes, shooters, RPGs and farming games all list.
- **Not a re-skin.** Nothing here repeats a sprite in `sprites/` (`coin`, `gem`, `heart`, `gold-key`, `potion`, `star-charm`, `xp-shard`, `health-cell`, `credit-chip`, `shield-cell`, `keycard`, `pickup-sparkle`, `hit-spark`, `hit-flash`, `dust-puff`, `explosion-small`, `explosion-large`, `plasma-burst`, `debris-burst`, `enemy-poof`, `muzzle-flash`, `dodge-trail`, `spawn-warp`, the `fx-*` spells, `campfire`, `wall-torch`, `acid-pool` and the rest). Each row says where its nearest existing sprite is and how this one differs in what it is.
- **No parts, no bodies.** No row needs a character, a creature or a rig. No row declares parts (style guide section 9: pickups and effects have none).
- **Themes neutral first.** `meta.themes` starts with `neutral`, then at most two worlds the sprite plainly fits. `meta.gameTypes` lists only values from `catalog/schema.js` (pickups start with the type they suit best and include `arcade`). `meta.words`: 6 to 14 lowercase words a person would type; never "core".
- **The palette rule for sprites shared across kits.** There is no core palette, and none is to be added (`engine/palettes.js` mirrors the style guide's three tables, and a fourth would be a framework change). So:
  1. **Defaults are Thornwood colours by name** (`PALETTE.thornwood.<name>`), and preferably the names whose hex is the same in all three palettes: `cream`, `gold`, `steel`, `skin` (and `ink` for the outline). Next best are names the two fantasy palettes share: `crimson`, `hero`, `magic`. A row that needs another hue names a Thornwood colour (`water`, `leaf`, `ember`, `moss`, `thorn`, `wood`, `stone`, `slate`).
  2. **Swatches:** `swatches('thornwood', <material>, { lead })` as usual. A colour control may then append **at most two** colours of the other palettes by name, so the sci-fi reading is one click away (`PALETTE.derelict.cyan` on a glow, `PALETTE.derelict.acid` on a poison, `PALETTE.hearthvale.wheat` on bread). Keep the list at 8 or fewer, all distinct, none darker than brightness 0.18.
  3. **Meaning stays fixed across kits** (style guide section 3, rule 7): healing is green, danger red, friendly energy cyan or `magic`, reward gold. A row that colours a health pickup or a warning declares its `material` (section 10, "Whole-bundle looks"); the rows say where.
  4. A bundle that lists a core sprite in another kit's colours does so through its whole-bundle look or a ready-made version, never by a copy of the file.
- **Sound cues** go only to sounds that are in `sounds/` today or are specified in `bundles/specs/core-sounds-1.md` (in the assets working copy: `heart-pickup`, `item-get`, `ammo-pickup`, `star-pickup`, `water-splash`, `bush-rustle`). A batch that cues a sound from `core-sounds-1` waits for that sound's batch (C05, C08) to be merged into `sounds/`: the checker refuses a cue to a sound or style that does not exist. Core pickup sounds have the kit styles "Chiptune", "Storybook" and "Gritty" (except `ammo-pickup`: "Arrows", "Bullets", "Energy cells"); each row picks one. Effects and weather loops mostly carry no sound: the thing that causes them does (style guide section 4, "paired by the sprite that causes it").
- **Ready-made versions.** Every row lists 3 to 6 `versions` (docs/site-design.md section 4; `defineSprite` already accepts and checks them, see `sprites/knight.js`). The first is always the defaults (`params: {}`). A colour in a version is written here as a palette name (`derelict.cyan`): write `PALETTE.derelict.cyan` in the file. Every version must pass the checker like any other setting and must look different at card size from the defaults and from the others (`VERSION_RULES` in `engine/versions.js`: 0.2 of the card picture); if one does not, change its settings, keep its name and say so in the report.
- **Weather and light are area loops, not screen overlays.** Every frame keeps the 1 px empty border, and no pixel may be half see-through (style guide sections 1 and 2), so a sprite can neither tint the screen nor wrap seamlessly from tile to tile with the helpers that exist (see [Left out](#left-out-and-why)). A weather or light sprite here is a **patch**: one 64x64 loop placed where the weather is (over a pond, round a fire, along the ground, in a doorway), several side by side for a wider stretch, each placed at a different phase. Its pieces stay inside the frame's border on every frame, and it reads as a patch on its own.
- **Originality** (style guide section 13 and the plan's section 1). Common ideas are free (a round bomb with a fuse, stars round a dazed head, a trophy cup, a red apple). Each row names the famous design it must not become, where there is one.

How to read a row: as in the kit specifications. **Clips:** name, frame count, "loop" if it loops (fps and what must happen are in the style guide, section 4; a label in brackets is the button text). **Controls:** the sprite's own controls by key; standard keys take the style guide's label and end words (section 10), others carry a note. A colour's note gives its label, its default (a Thornwood name unless another palette is named) and, where the label cannot say it, the `material` to declare. **when:** a control or cue followed by **when** `{ ... }` is in effect only for those values; copy it exactly. **Sounds:** clip, frame, sound id and style (the cue's `preset`), volume. **Versions:** name and `params`. **Count sliders** (`pieces`, and `load` in `ammo-box`) are whole-number ranges with step 1, as `pieces` in `hit-spark` (`range('Pieces', 6, { min: 4, max: 8, step: 1, lo: 'Few', hi: 'Many' })`): each row gives the min, the max and the default, and its versions set the count itself, inside that range. Every other slider runs 0..1 with default 0.5 unless the row says otherwise. **Helpers:** the framework modules and functions the sprite is built from; read each one's header before you start. None of the 32 needs a new helper.

## Asset list

| # | id | Name | type | role | view | Frame | Batch |
|---|---|---|---|---|---|---|---|
| 1 | `fruit` | Fruit | pickup | items/food | front | 32x32 | K01 |
| 2 | `meal` | Hearty meal | pickup | items/food | front | 32x32 | K01 |
| 3 | `candy` | Sweet | pickup | items/food | front | 32x32 | K01 |
| 4 | `ammo-box` | Ammo pack | pickup | items/pickup | front | 32x32 | K02 |
| 5 | `arrow-bundle` | Arrow bundle | pickup | items/pickup | front | 32x32 | K02 |
| 6 | `bomb-pickup` | Bomb | pickup | items/pickup | front | 32x32 | K02 |
| 7 | `power-orb` | Power orb | pickup | items/pickup | front | 32x32 | K02 |
| 8 | `coin-pouch` | Money pouch | pickup | items/pickup | front | 32x32 | K03 |
| 9 | `trophy` | Trophy | pickup | items/pickup | front | 32x32 | K03 |
| 10 | `scroll` | Scroll | pickup | items/key | front | 32x32 | K03 |
| 11 | `hourglass` | Time bonus | pickup | items/pickup | front | 32x32 | K03 |
| 12 | `flames` | Flames | effect | effects/spark | side | 32x32 | K04 |
| 13 | `smoke-plume` | Smoke plume | effect | effects/dust | side | 48x48 | K04 |
| 14 | `poison-haze` | Poison haze | effect | effects/magic | side | 48x48 | K04 |
| 15 | `zap-crackle` | Electric crackle | effect | effects/spark | none | 32x32 | K05 |
| 16 | `charge-up` | Charge up | effect | effects/magic | none | 48x48 | K05 |
| 17 | `dizzy-ring` | Dizzy ring | effect | effects/spark | side | 32x32 | K05 |
| 18 | `confetti` | Confetti | effect | effects/spark | none | 64x64 | K06 |
| 19 | `firework` | Firework | effect | effects/explosion | none | 64x64 | K06 |
| 20 | `leaf-burst` | Leaf burst | effect | effects/dust | side | 48x48 | K06 |
| 21 | `splash-burst` | Splash | effect | effects/dust | side | 48x48 | K07 |
| 22 | `cave-drip` | Cave drip | effect | effects/weather | side | 64x64 | K07 |
| 23 | `rain-ripples` | Rain on water | effect | effects/weather | top-down | 64x64 | K07 |
| 24 | `bubble-stream` | Bubble stream | effect | effects/weather | side | 64x64 | K07 |
| 25 | `mist-drift` | Drifting mist | effect | effects/weather | side | 64x64 | K08 |
| 26 | `wind-gust` | Wind gust | effect | effects/weather | none | 64x64 | K08 |
| 27 | `sun-rays` | Sun rays | effect | environment/lighting | none | 64x64 | K08 |
| 28 | `fireflies` | Fireflies | effect | environment/lighting | none | 64x64 | K08 |
| 29 | `ember-drift` | Drifting embers | effect | effects/weather | side | 64x64 | K08 |
| 30 | `shockwave` | Shockwave | effect | effects/dust | side | 64x64 | K09 |
| 31 | `teleport-beam` | Teleport beam | effect | effects/magic | side | 64x64 | K09 |
| 32 | `guard-flash` | Block flash | effect | effects/spark | side | 32x32 | K09 |

By group: **pickups 11** (food 3, gear and power 4, treasure and time 4), **effects 13** (fire, smoke and gas 3; energy 3; celebration and scatter 3; water 1; ground and beam 3), **weather and light 8** (water 3, air and light 5).

## Pickups

All pickups: type `pickup`, view `front`, frame 32x32, pivot [16, 30], `grounded: false`, clips from `pickupClips()` (`idle` 8 loop · `collect` 8), positions from `pickupPose`, the end of `collect` from `collectBurst` (the last frame keeps three pixels whatever the settings), a glint from `glint` and a corner sparkle from `gleam`. 16 to 22 px along the longer side at the default look; 6 to 12 colours. Every pickup has the standard `size`, `shape`, `sparkle`, `bob`, `pop` and `speed`. Read `sprites/heart.js`, `sprites/potion.js` and `sprites/gem.js` first: they are the worked examples for `engine/pickups.js`.

#### `fruit` · Fruit

- **Meta:** type `pickup`, role `items/food`, view `front`, themes `neutral`, `forest`, `farm`; gameTypes `platformer`, `arcade`, `farming-sim`, `top-down-rpg`. Batch **K01**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (10):** `size`, `shape` (choice: apple | pear | berries | citrus), `leaf` (toggle "Leaf": a leaf on the stalk, at least 10 px), `shine` (toggle: a glossy highlight band on the skin), `sparkle`, `body` ("Fruit": default crimson; swatches exactly `crimson`, `goblin`, `thorn`, `soil`, `water`, `moss`, `gold`: 7), `accent` ("Leaves": default leaf; swatches exactly `leaf`, `grass`, `ember`, `#4f9d57`: 4; **when** `{ leaf: [true] }`), `bob`, `pop`, `speed`. The leaf touches the fruit, so the two lists are written out and share no colour (SKILL.md and style guide section 3, rule 8): `leaf` left the Fruit list and `moss` the Leaves list.
- **Sounds:** `collect` frame 1 → `heart-pickup` style "Chiptune", volume 0.7.
- **Versions (5):** **Red apple** `{}` · **Green pear** `{ shape: 'pear', body: thornwood.moss }` · **Berry bunch** `{ shape: 'berries', body: thornwood.thorn, size: 0.4 }` · **Lemon** `{ shape: 'citrus', body: thornwood.gold, leaf: false }` · **Golden apple** `{ body: thornwood.gold, sparkle: true, shine: true }`.
- **Helpers:** `engine/pickups.js` (`pickupClips`, `pickupPose`, `glint`, `gleam`, `collectBurst`), `engine/shapes.js` (`placedIn`), `engine/creature.js` (`leafIn`).
- **Look and motion:** A piece of fruit that restores a little health, hanging in the air and turning a few degrees left and right while it bobs, its stalk lagging the turn by a frame. Apple round with a dimple; pear a narrow top; berries a cluster of four or five round berries on one short stalk; citrus round with a dotted peel (2 to 3 px of `dark` marks) and a leaf stub. Nearest existing: `heart` (a symbol, not food). **Not** the arcade bonus pair of red cherries on a forked stalk: berries are a cluster.

#### `meal` · Hearty meal

- **Meta:** type `pickup`, role `items/food`, view `front`, themes `neutral`, `fantasy`; gameTypes `platformer`, `arcade`, `top-down-rpg`, `turn-based-rpg`. Batch **K01**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (10):** `size`, `shape` (choice: drumstick | bread | cheese | pie), `bite` (toggle "Bitten": a round bite out of the top right, at least 4 px across), `steam` (toggle "Steam": two wisps rising in `idle`, drawn after the outline, at least 12 px), `sparkle`, `body` ("Food": default wood; swatches exactly `wood`, `soil`, `#a8612a`, `#5a3a22`, `#c98a4a`, `gold`, `hearthvale.wheat`: 7; declare `material: 'wood'`), `accent` ("Bone": default cream; swatches exactly `cream`, `#d8d8e0`, `#e0b040`, `stone`: 4; **when** `{ shape: ['drumstick'] }`), `bob`, `pop`, `speed`. The bone end touches the meat, so the two lists share no colour (SKILL.md and style guide section 3, rule 8): `cream` left the Food list.
- **Sounds:** `collect` frame 1 → `heart-pickup` style "Storybook", volume 0.7.
- **Versions (5):** **Roast leg** `{}` · **Bread loaf** `{ shape: 'bread', body: hearthvale.wheat }` · **Cheese wedge** `{ shape: 'cheese', body: thornwood.gold, bite: true }` · **Hot pie** `{ shape: 'pie', steam: true }` · **Snack** `{ size: 0.3, bite: true, steam: false }`.
- **Helpers:** `engine/pickups.js`, `engine/shapes.js` (`placedIn`, `insetIn`), `engine/fx.js` (`smoke` for the steam wisps, `loop: true`).
- **Look and motion:** The big health food of beat-em-ups and adventures: a roast leg with a pale bone end, a crusty loaf with three score marks, a wedge of cheese with three holes, a round pie with a crimped edge and a vent. It bobs and squashes a pixel on each dip. Nearest existing: `potion` (a drink) and the food icons in `icons-consumables` (inventory pictures, not world pickups).

#### `candy` · Sweet

- **Meta:** type `pickup`, role `items/food`, view `front`, themes `neutral`, `candy`; gameTypes `arcade`, `puzzle`, `platformer`. Batch **K01**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (9):** `size`, `shape` (choice: wrapped | lollipop | donut | cupcake), `stripes` (choice "Pattern": plain | stripes | dots), `sparkle`, `body` ("Candy": default crimson; swatches `body` with lead `crimson` (crimson, goblin, thorn, leaf, soil, water), plus `gold` and `wood`: 8; declare `material: 'paint'`), `accent` ("Icing": default cream; swatches exactly `cream`, `magic`, `moss`, `hero`, `#d8d8e0`: 5; **when** `{ stripes: ['stripes', 'dots'] }`), `bob`, `pop`, `speed`. Stripes and dots lie on the candy, so the Icing list is written out to share no colour with the Candy list (SKILL.md and style guide section 3, rule 8): not `swatches('thornwood', 'accent')`, which repeats crimson, gold and thorn.
- **Sounds:** `collect` frame 1 → `item-get` style "Chiptune", volume 0.7.
- **Versions (5):** **Cherry drop** `{}` · **Mint swirl** `{ shape: 'lollipop', stripes: 'stripes', body: thornwood.goblin }` · **Sprinkle ring** `{ shape: 'donut', stripes: 'dots', body: thornwood.thorn }` · **Lemon cake** `{ shape: 'cupcake', body: thornwood.gold }` · **Plain toffee** `{ stripes: 'plain', body: thornwood.wood }`.
- **Helpers:** `engine/pickups.js`, `engine/shapes.js` (`ringIn`, `placedIn`), `engine/solids.js` (`stripesIn` for the stripes).
- **Look and motion:** Score candy for casual and arcade games. A sweet in twisted paper that rocks from side to side, a round lollipop on a stick, a ring donut with icing, a cupcake in a ridged cup. Glossy (`light: 1`). Nearest existing: `gem` (a jewel). **Not** the striped, wrapped and round sweets of the best-known match-three game in its six colours: one shape per sprite, no candy-coloured set of six.

#### `ammo-box` · Ammo pack

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `neutral`, `sci-fi`, `city`; gameTypes `shooter`, `arcade`, `roguelike-action`, `platformer`. Batch **K02**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (9):** `size`, `shape` (choice: box | clip | shells), `load` (slider "Rounds": Few / Many; whole numbers 2 to 6, step 1, default 4; how many cartridges show above the box, in the clip's window, or in the row of shells), `sparkle`, `body` ("Box": default leaf; swatches `body` with lead `leaf` (leaf, goblin, thorn, crimson, soil, water), plus `slate` and `derelict.hull`: 8; declare `material: 'paint'`), `metal` ("Brass": default gold; swatches exactly `gold`, `steel`, `stone`, `#e6c545`, `#c98a4a`: 5, that is `swatches('thornwood', 'metal', { lead: 'gold' })` without `slate`), `bob`, `pop`, `speed`. The brass tips sit in the box, so the two lists share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** `collect` frame 1 → `ammo-pickup` style "Bullets", volume 0.7.
- **Versions (5):** **Ammo crate** `{}` · **Magazine** `{ shape: 'clip', body: thornwood.slate }` · **Shotgun shells** `{ shape: 'shells', body: thornwood.crimson }` · **Full load** `{ load: 6, size: 0.8 }` · **Station issue** `{ body: derelict.hull, metal: thornwood.steel }`.
- **Helpers:** `engine/pickups.js`, `engine/shapes.js` (`placedIn`, `insetIn`), `engine/solids.js` (`stripesIn` for a painted band on the box).
- **Look and motion:** Ammunition for any gun. A small lidded box with brass tips showing at the top and a painted band (no letters); a magazine with a window of rounds; three or four fat shells side by side. It tilts a little on each bob. `load` must change 12 px or more in every shape; if the checker finds it dead in one, add the `when` it suggests and say so.

#### `arrow-bundle` · Arrow bundle

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `neutral`, `fantasy`, `forest`; gameTypes `top-down-rpg`, `platformer`, `arcade`, `roguelike-action`. Batch **K02**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (11):** `size`, `shape` (choice: quiver | bundle | bolts), `pieces` (slider "Arrows": Few / Many; whole numbers 2 to 5 shafts, step 1, default 3), `sparkle`, `body` ("Leather": default soil; swatches exactly the dark band `soil`, `#5a3a22`, `#a8612a`, `leaf`: 4; **when** `{ shape: ['quiver'] }`), `wood` ("Shafts": default wood; swatches exactly the light band `wood`, `#c98a4a`, `cream`, `hearthvale.wheat`: 4), `metal` ("Heads": default steel; swatches exactly `steel`, `gold`, `stone`, `slate`, `#e6c545`: 5, that is `swatches('thornwood', 'metal')` without `#c98a4a`), `trim` ("Fletching": default crimson; swatches exactly `crimson`, `gold`, `hero`, `thorn`, `ember`, `steel`, `moss`: 7), `bob`, `pop`, `speed`. The shafts touch the leather, the heads and the fletching, so the Shafts list shares no colour with any of the three, and Leather shares none with Shafts or Fletching (SKILL.md and style guide section 3, rule 8). Heads and Fletching sit at opposite ends of a shaft and never touch.
- **Sounds:** `collect` frame 1 → `ammo-pickup` style "Arrows", volume 0.7.
- **Versions (5):** **Hunter's quiver** `{}` · **Tied bundle** `{ shape: 'bundle', pieces: 4 }` · **Crossbow bolts** `{ shape: 'bolts', trim: thornwood.steel, wood: '#c98a4a' }` · **Gilded arrows** `{ metal: thornwood.gold, trim: thornwood.ember }` · **Forest quiver** `{ body: thornwood.leaf, trim: thornwood.moss, pieces: 5 }`.
- **Helpers:** `engine/pickups.js`, `engine/shapes.js` (`arrowIn`, `placedIn`).
- **Look and motion:** Arrows for a bow. A leather quiver at a slant with fletched shafts fanning out of it; a bundle of arrows tied at the middle with a cord; short stubby crossbow bolts with metal vanes. The shafts sway a pixel against the quiver as it bobs. Nearest existing: `arrow` (a projectile in flight, not a pickup).

#### `bomb-pickup` · Bomb

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `neutral`, `fantasy`, `dungeon`; gameTypes `top-down-rpg`, `platformer`, `arcade`, `roguelike-action`. Batch **K02**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (11):** `size`, `shape` (choice: round | stick | bundle), `fuse` (slider "Fuse": Short / Long), `lit` (toggle "Lit": the end of the fuse burns and spits sparks), `sparkle`, `body` ("Shell": default slate; swatches exactly `slate`, `steel`, `gold`, `stone`, `#e6c545`, `crimson`: 6, that is `swatches('thornwood', 'metal', { lead: 'slate' })` without `#c98a4a`, plus `crimson`; declare `material: 'paint'`), `accent` ("Rope": default cream; swatches `wood` with lead `cream` (cream, wood, soil, #a8612a, #5a3a22, #c98a4a): 6), `glow` ("Spark": default ember; swatches `glow` with lead `ember`; declare `material: 'fire'`; **when** `{ lit: [true] }`), `bob`, `pop`, `speed`. The rope and fuse touch the shell, so Shell and Rope share no colour (SKILL.md and style guide section 3, rule 8). The spark burns at the free end of the fuse, clear of the shell, and shares no colour with Rope.
- **Sounds:** `collect` frame 1 → `item-get` style "Gritty", volume 0.7.
- **Versions (5):** **Iron bomb** `{}` · **Blasting stick** `{ shape: 'stick', body: thornwood.crimson }` · **Bundle of three** `{ shape: 'bundle', body: thornwood.crimson, fuse: 0.8 }` · **Unlit** `{ lit: false }` · **Long fuse** `{ fuse: 1, glow: thornwood.gold }`.
- **Helpers:** `engine/pickups.js`, `engine/shapes.js` (`placedIn`), `engine/fx.js` (`twinkle` and `particles` for the spark, after the outline).
- **Look and motion:** A bomb to pick up and use later (an item, not the thrown projectile). A round iron ball with a collar and a curled fuse; a single red stick wrapped with rope; three sticks bound together. With `lit` on, the spark at the fuse's end flickers on every frame and throws two or three sparks. On a dark `body` carry the form with the light and base tones (style guide section 3, rule 4). Nearest existing: the bomb in `icons-consumables` (a one-frame inventory icon; this is a world pickup that floats, bobs, can burn its fuse and ends in a collect burst), and `fuel-barrel` (a prop that explodes in place).

#### `power-orb` · Power orb

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `neutral`, `fantasy`, `sci-fi`; gameTypes `arcade`, `platformer`, `shooter`, `roguelike-action`. Batch **K02**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (10):** `size`, `shape` (choice "Shell": orb | prism | shard), `mark` (choice: arrow | sun | star | none; a mark inside the shell, from `engine/marks.js`, 7 px), `cage` (toggle "Ring": a flat, level hoop circling the shell (`orbitHoop` draws no lean), its back half behind it), `sparkle`, `glow` ("Glow": default magic; swatches `glow` with lead `magic` (magic, ember, gold, moss, crimson, thorn), plus `derelict.cyan`: 7), `metal` ("Metal": default steel; swatches exactly `steel`, `stone`, `slate`, `#c98a4a`, `hearthvale.rust`: 5; **when** `{ cage: [true] }`), `bob`, `pop`, `speed`. The ring crosses the shell, so Metal shares no colour with Glow (SKILL.md and style guide section 3, rule 8): `gold` stays in Glow only, and `#e6c545` (a near-gold) is left out of Metal too.
- **Sounds:** `collect` frame 1 → `star-pickup` style "Chiptune", volume 0.7.
- **Versions (5):** **Blue power** `{}` · **Speed boost** `{ mark: 'arrow', glow: thornwood.ember }` · **Sun orb** `{ mark: 'sun', glow: thornwood.gold, metal: thornwood.steel }` · **Crystal core** `{ shape: 'prism', cage: false, glow: thornwood.thorn }` · **Star shard** `{ shape: 'shard', mark: 'star', glow: derelict.cyan }`.
- **Helpers:** `engine/crystals.js` (`drawCrystal` with cut `orb`, `prism` or `shard`, `turn` from 0 to 1 over the loop), `engine/orbits.js` (`around`, `orbitHoop` with a bead), `engine/marks.js` (`drawMark`; its colour from `pick(glow, '#ffffff', INK)`), `engine/pickups.js`, `engine/fx.js` (`glow`).
- **Look and motion:** A generic power-up: a glowing shell that turns slowly about its upright axis with a mark floating in it, and a thin ring running round it. The mark says what kind (an arrow up, a sun, a five-point star); a game picks the version. Nearest existing: `shield-cell` (its `orb` shape is a glowing blue orb with casing bands crossing it, turning, with the standard pickup pop) and `xp-shard` (`orb` and `shard` shapes), then `star-charm` (a medallion on a loop) and `save-crystal` (a big standing crystal). This one differs from `shield-cell` and `xp-shard` in three ways: the mark inside is what identifies it, the ring is a flat, level hoop round the shell rather than casing bands crossing it, and it is a 32 px frame rather than 16 px. Every version keeps a mark or the ring (`mark: 'none'` is only for a game's own use), so none reads as a recoloured `shield-cell` or `xp-shard`. **Not** a block with a question mark, and the star mark has no face.

#### `coin-pouch` · Money pouch

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `neutral`, `fantasy`; gameTypes `platformer`, `top-down-rpg`, `arcade`, `turn-based-rpg`. Batch **K03**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (11):** `size`, `shape` (choice: pouch | sack | stack), `fullness` (slider "Fullness": Lean / Bulging; how round the bag or how tall the stack), `spill` (toggle "Spill": two or three coins peeking out of the top or lying beside the stack, at least 12 px), `sparkle`, `body` ("Leather": default wood; swatches exactly `wood`, `soil`, `cream`, `#a8612a`, `#5a3a22`: 5; **when** `{ shape: ['pouch', 'sack'] }`), `metal` ("Metal": default gold; swatches exactly `gold`, `steel`, `stone`, `slate`, `#e6c545`: 5), `accent` ("Rope": default crimson; swatches exactly `crimson`, `thorn`, `magic`, `moss`, `hero`: 5; **when** `{ shape: ['pouch', 'sack'] }`), `bob`, `pop`, `speed`. Rope, coins and bag all touch, so the three lists share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** `collect` frame 1 → `credit-pickup` style "Big payout", volume 0.7.
- **Versions (5):** **Coin pouch** `{}` · **Loot sack** `{ shape: 'sack', fullness: 1, body: thornwood.cream }` · **Gold stack** `{ shape: 'stack', fullness: 0.8 }` · **Silver purse** `{ metal: thornwood.steel, body: thornwood.soil }` · **Lean purse** `{ fullness: 0, spill: false, size: 0.3 }`.
- **Helpers:** `engine/pickups.js`, `engine/gadgets.js` (`drawToken` for the coins, edge-on in the stack and the spill), `engine/shapes.js` (`placedIn`).
- **Look and motion:** A big money drop, worth many coins: a drawstring purse with a tied neck, a knotted cloth sack, or a stack of coins leaning a pixel each way. Coins in the spill catch the glint in turn. Nearest existing: the coin pouch in `icons-key-items` (a one-frame inventory icon; this is a world pickup that floats, bobs and ends in a collect burst), and `coin` and `credit-chip` (one coin). **Not** a sack with a printed currency sign: no letters or symbols on the bag.

#### `trophy` · Trophy

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `neutral`; gameTypes `arcade`, `platformer`, `racing`, `puzzle`. Batch **K03**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (10):** `size`, `shape` (choice: cup | medal | crown), `emblem` (choice: star | sun | diamond | none; a mark on the face, from `engine/marks.js`), `sparkle`, `metal` ("Metal": default gold; swatches exactly `gold`, `steel`, `#e6c545`, `#c98a4a`, `hearthvale.rust`: 5), `accent` ("Ribbon": default hero; swatches exactly `hero`, `crimson`, `thorn`, `cream`, `ember`, `#4f9d57`: 6; **when** `{ shape: ['medal'] }`), `stone` ("Base": default slate; swatches `stone` with lead `slate` (slate, stone, cream, cavern, moss, #6b7280): 6; **when** `{ shape: ['cup'] }`), `bob`, `pop`, `speed`. The ribbon and the plinth each touch the metal, so Metal shares no colour with either (SKILL.md and style guide section 3, rule 8). Ribbon and Base never show together (medal only, cup only), so they may share `cream`.
- **Sounds:** `collect` frame 1 → `star-pickup` style "Storybook", volume 0.7.
- **Versions (5):** **Gold cup** `{}` · **Silver medal** `{ shape: 'medal', metal: thornwood.steel }` · **Crown** `{ shape: 'crown', emblem: 'diamond' }` · **Bronze cup** `{ metal: hearthvale.rust }` · **Plain cup** `{ emblem: 'none', size: 0.3 }`.
- **Helpers:** `engine/pickups.js` (`glint`, `gleam`), `engine/gadgets.js` (`drawToken` for the turning medal), `engine/marks.js` (`drawMark`), `engine/shapes.js`.
- **Look and motion:** The big end-of-level or secret collectable. A two-handled cup on a dark plinth; a medal on a short ribbon that turns like a coin; a small crown with three points. A strong glint sweeps across once per loop. Nearest existing: `star-charm` (a power-up, not a prize).

#### `scroll` · Scroll

- **Meta:** type `pickup`, role `items/key`, view `front`, themes `neutral`, `fantasy`; gameTypes `top-down-rpg`, `turn-based-rpg`, `platformer`, `arcade`. Batch **K03**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (10):** `size`, `shape` (choice: rolled | open | letter), `seal` (toggle "Seal": a round wax seal, 5 px across), `sparkle`, `body` ("Paper": default cream; swatches exactly the light band `cream`, `#d8d8e0`, `#e0b040`, `hearthvale.wheat`: 4; declare `material: 'paint'`), `accent` ("Ribbon": default crimson; swatches exactly `crimson`, `gold`, `hero`, `thorn`, `ember`, `#4f9d57`: 6; **when** `[{ shape: ['rolled'] }, { seal: [true] }]`), `wood` ("Rods": default wood; swatches exactly `wood`, `soil`, `#a8612a`, `#5a3a22`, `#c98a4a`, `steel`: 6; **when** `{ shape: ['rolled', 'open'] }`), `bob`, `pop`, `speed`. Ribbon, seal and rods all lie on the paper, and the ribbon can meet a rod end, so the three lists share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** `collect` frame 1 → `item-get` style "Storybook", volume 0.7.
- **Versions (5):** **Sealed scroll** `{}` · **Open scroll** `{ shape: 'open', seal: false }` · **Letter** `{ shape: 'letter', accent: thornwood.hero }` · **Old map** `{ shape: 'open', body: hearthvale.wheat }` · **Royal decree** `{ accent: thornwood.gold, wood: thornwood.steel }`.
- **Helpers:** `engine/pickups.js`, `engine/shapes.js` (`placedIn`, `insetIn`).
- **Look and motion:** A quest item, a spell to learn, a map piece. A rolled scroll tied with a ribbon; a half-open scroll on two rods with wavy ink lines (never letters); a folded letter with a seal. It rocks gently as it bobs. Nearest existing: the rolled map and the sealed letter in `icons-key-items` (one-frame inventory icons; this is a world pickup that floats, bobs and ends in a collect burst), and `gold-key` and `keycard` (keys).

#### `hourglass` · Time bonus

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `neutral`; gameTypes `arcade`, `racing`, `puzzle`, `platformer`. Batch **K03**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (9):** `size`, `shape` (choice: hourglass | stopwatch | clock), `sand` (slider "Sand left": Little / Lots; **when** `{ shape: ['hourglass'] }`), `sparkle`, `body` ("Frame": default wood; swatches exactly `wood`, `soil`, `#a8612a`, `#c98a4a`, `steel`, `crimson`, `gold`: 7; declare `material: 'paint'`), `accent` ("Sand": default `hearthvale.wheat`; swatches exactly `hearthvale.wheat`, `cream`, `magic`, `moss`, `thorn`: 5; declare `material: 'earth'`; **when** `{ shape: ['hourglass'] }`), `bob`, `pop`, `speed`. The sand pile meets the frame's caps at the top and bottom of the glass, so Frame and Sand share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** `collect` frame 1 → `item-get` style "Chiptune", volume 0.7.
- **Versions (5):** **Hourglass** `{}` · **Stopwatch** `{ shape: 'stopwatch', body: thornwood.steel }` · **Alarm clock** `{ shape: 'clock', body: thornwood.crimson }` · **Nearly out** `{ sand: 0.1 }` · **Gilded glass** `{ body: thornwood.gold, accent: thornwood.magic }`.
- **Helpers:** `engine/pickups.js`, `engine/shapes.js`, `engine/fx.js` (`particles`, loop, for the grains falling through the neck).
- **Look and motion:** Extra time for racing, arcade and puzzle games. An hourglass in a frame with a thread of sand falling through its neck; a stopwatch with a crown button whose hand jumps round once per loop; a round alarm clock with two bells whose hand does the same. Clock faces are a fixed `cream`, with no numerals. Nearest existing: none.

## Effects

All effects: type `effect`, built from `engine/fx.js` and its partners (style guide section 14: "every effect and projectile is built from it"). Light is drawn after `g.outline(INK)` and rimmed with its own dark tone, never ink; an effect has no ink of its own unless a row says it has a solid piece. A one-shot `burst` starts on its brightest, biggest frame and ends on two or more pixels. Standard controls: `size`, `pieces` (or a count named for the thing; a whole-number range, step 1, as each row gives it), `style`, `core`, `edge`, `speed`, and often `spread`. 3 to 12 colours. Wherever the core meets the edge (the `steps(edge, { core })` chain), the two lists share no colour, as `CORE = [...].filter((c) => !EDGE.includes(c))` in `hit-spark` and `dust-puff`; each row writes its lists out. Read `sprites/hit-spark.js`, `sprites/dust-puff.js` and `sprites/fx-heal.js` first.

### Fire, smoke and gas

#### `flames` · Flames

- **Meta:** type `effect`, role `effects/spark`, view `side`, themes `neutral`, `fantasy`, `dungeon`; gameTypes `platformer`, `top-down-rpg`, `roguelike-action`, `turn-based-rpg`. Batch **K04**.
- **Frame:** 32x32, pivot [16, 30]. Standing: the foot of the flames is on row 29.
- **Clips (3):** `loop` 8 loop (label "Burn") · `out` 6 · `ignite` 6. In this order: burning, snuffed, catching light (the `wall-torch` order). `out` ends on a wisp of smoke and two embers; `ignite` starts from those two embers.
- **Parts:** none.
- **Controls (9):** `size`, `width`, `pieces` (slider "Tongues": Few / Many; whole numbers 1 to 4 tongues, step 1, default 3), `style` (choice: torch | wild | magic; wild leans and splits, magic has straight upright tongues with pluses rising), `sparks` (toggle: three or more embers rising), `core` (default gold; swatches exactly `gold`, `cream`, `moss`, `goblin`, `skin`: 5; declare `material: 'fire'`), `edge` ("Flame": default ember; swatches exactly `ember`, `magic`, `crimson`, `thorn`, `hero`, `derelict.cyan`: 6), `flicker`, `speed`. The core sits inside the flame (the `steps(edge, { core })` chain), so the two lists share no colour (SKILL.md and style guide section 3, rule 8): not `swatches('thornwood', 'core')` beside `glow`, which share gold, magic, moss and ember.
- **Sounds:** `loop` frame 0 → `fire` style "Torch", volume 0.35 · `ignite` frame 0 → `whoosh` style "Quick swipe", volume 0.8.
- **Versions (5):** **Burning** `{}` · **Blaze** `{ size: 1, pieces: 4, sparks: true }` · **Spirit flame** `{ style: 'magic', core: thornwood.cream, edge: thornwood.magic }` · **Poison fire** `{ core: thornwood.moss, edge: thornwood.thorn }` · **Small flame** `{ size: 0, pieces: 1, width: 0 }`.
- **Helpers:** `engine/fx.js` (`flame`, `particles`, `smoke` for `out`, `steps`).
- **Look and motion:** Fire with nothing under it, to lay over anything that burns: a burning crate, a hero on fire, a lit oil patch. Its tongues ripple and lick on their own phases. Nearest existing: `campfire` (logs and stones) and `wall-torch` (a bracket): this one has no fuel drawn.

#### `smoke-plume` · Smoke plume

- **Meta:** type `effect`, role `effects/dust`, view `side`, themes `neutral`, `city`, `fantasy`; gameTypes `platformer`, `top-down-rpg`, `shooter`, `farming-sim`. Batch **K04**.
- **Frame:** 48x48, pivot [24, 46]. The column rises from the middle of row 45.
- **Clips (2):** `loop` 8 loop · `fade` 8 (label "Die down"). `fade` ends on one small wisp.
- **Parts:** none.
- **Controls (7):** `size`, `pieces` (slider "Puffs": Few / Many; whole numbers 3 to 8, step 1, default 5), `drift` (slider "Drift": Still / Windy; how far the column leans to the right), `style` (choice: smoke | steam | soot; steam is pale, quick and thins into wisps, soot is dark and lumpy), `core` ("Light smoke": default cream; swatches exactly `cream`, `haze`, `sky`, `#d8d8e0`: 4; declare `material: 'stone'`), `edge` ("Dark smoke": default stone; swatches exactly `stone`, `slate`, `cavern`, `#6b7280`, `moss`: 5; declare `material: 'stone'`), `speed`. Light and dark puffs touch in the column, so the two lists share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** none.
- **Versions (5):** **Chimney smoke** `{}` · **Steam vent** `{ style: 'steam', drift: 0, core: thornwood.sky }` · **Black smoke** `{ style: 'soot', core: thornwood.haze, edge: thornwood.slate }` · **Windy** `{ drift: 1, pieces: 7 }` · **Wisp** `{ size: 0, pieces: 3 }`.
- **Helpers:** `engine/fx.js` (`smoke` with `loop: true`, `puffs` with `shape: 'wispy'` for steam, `steps` with `white: false`).
- **Look and motion:** A rising column for chimneys, wrecks, vents and put-out fires: puffs born small at the foot, swelling and drifting as they climb, young ones lighter, old ones darker. Nearest existing: the `smoke` loop of `explosion-large` (a 96 px cloud over wreckage) and `dust-puff` (one-shot dust on the ground).

#### `poison-haze` · Poison haze

- **Meta:** type `effect`, role `effects/magic`, view `side`, themes `neutral`, `fantasy`, `horror`; gameTypes `top-down-rpg`, `turn-based-rpg`, `roguelike-action`, `platformer`. Batch **K04**.
- **Frame:** 48x48, pivot [24, 46].
- **Clips (2):** `loop` 8 loop (label "Poisoned") · `burst` 8 (label "Puff").
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (Few / Many bubbles, puffs or marks; whole numbers 3 to 8, step 1, default 5), `spread`, `rise` (slider "Rise": Low / High), `style` (choice: bubbles | cloud | skulls; skulls are 5 px marks drifting up), `core` (default goblin; swatches exactly `goblin`, `cream`, `gold`, `moss`: 4), `edge` ("Poison": default thorn; swatches exactly `thorn`, `ember`, `crimson`, `magic`, `hero`, `leaf`, `derelict.acid`: 7; declare `material: 'warning'`), `speed`. The core sits inside each bubble, puff or mark (the `steps(edge, { core })` chain), so the two lists share no colour (SKILL.md and style guide section 3, rule 8): `magic` and `ember` left the core list and `moss` the Poison list.
- **Sounds:** `loop` frame 0 → `bubbles` style "Slow drips", volume 0.35, **when** `{ style: ['bubbles'] }` · `burst` frame 0 → `whoosh` style "Quick swipe", volume 0.7.
- **Versions (5):** **Poisoned** `{}` · **Toxic cloud** `{ style: 'cloud', spread: 1 }` · **Curse** `{ style: 'skulls', core: thornwood.cream, edge: thornwood.crimson }` · **Swamp gas** `{ style: 'cloud', core: thornwood.moss, edge: thornwood.leaf }` · **Faint** `{ size: 0, pieces: 3 }`.
- **Helpers:** `engine/fx.js` (`particles` for bubbles, `puffs` for the cloud), `engine/bursts.js` (`driftUp`), `engine/marks.js` (`drawMark` with `skull`).
- **Look and motion:** A status effect laid over a poisoned fighter, or a gas left on the ground. `loop`: bubbles rise from the bottom third and pop, or a low cloud churns, or small skulls rise and fade. `burst`: a ball of gas bursts out and thins to a few puffs. Nearest existing: `acid-pool` (a floor hazard) and `enemy-poof` (a defeat).

### Energy

#### `zap-crackle` · Electric crackle

- **Meta:** type `effect`, role `effects/spark`, view `none`, themes `neutral`, `sci-fi`, `fantasy`; gameTypes `shooter`, `roguelike-action`, `turn-based-rpg`, `platformer`. Batch **K05**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`.
- **Clips (2):** `loop` 8 loop (label "Shocked") · `burst` 6 (label "Zap").
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (slider "Arcs": Few / Many; whole numbers 2 to 5 arcs, step 1, default 3), `style` (choice: arcs | sparks | ring), `forks` (toggle: each arc throws a short fork; **when** `{ style: ['arcs'] }`), `core` (default cream; swatches exactly `cream`, `sky`, `goblin`, `steel`, `skin`: 5), `edge` ("Light": default magic; swatches `glow` with lead `magic` (magic, ember, gold, moss, crimson, thorn), plus `derelict.cyan`: 7), `flicker`, `speed`. The core runs inside each arc (the `steps(edge, { core })` chain), so Core shares no colour with Light (SKILL.md and style guide section 3, rule 8), as in `hit-spark`.
- **Sounds:** `burst` frame 0 → `thunder-crack` style "Small spark", volume 0.8.
- **Versions (5):** **Shocked** `{}` · **Overcharged** `{ size: 1, pieces: 5, forks: true }` · **Static** `{ style: 'sparks', edge: thornwood.gold }` · **Short circuit** `{ style: 'ring', edge: thornwood.crimson }` · **Faint buzz** `{ size: 0, pieces: 2, flicker: 0 }`.
- **Helpers:** `engine/spells.js` (`boltPath`, `bolt`), `engine/fx.js` (`twinkle`, `ring`, `steps`).
- **Look and motion:** Electricity crawling over a stunned machine or a shocked fighter: short jagged arcs that jump to a new place on every frame (seeded by frame, so the loop closes), with twinkles where they touch. `burst`: one bright zap across the frame and a ring of sparks. Nearest existing: `fx-thunder-spell` (a bolt from the sky).

#### `charge-up` · Charge up

- **Meta:** type `effect`, role `effects/magic`, view `none`, themes `neutral`, `fantasy`, `sci-fi`; gameTypes `shooter`, `turn-based-rpg`, `platformer`, `roguelike-action`. Batch **K05**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (2):** `loop` 8 loop (label "Charge") · `burst` 8 (label "Release").
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (slider "Sparks": Few / Many; whole numbers 4 to 12, step 1, default 8), `style` (choice: spiral | rings | pull; rings close in on the core, pull draws straight streaks inward), `twist` (slider "Twist": Straight / Turned; **when** `{ style: ['spiral'] }`), `core` (default cream; swatches exactly `cream`, `crimson`, `sky`, `steel`, `skin`: 5), `edge` (default magic; swatches exactly `magic`, `ember`, `thorn`, `moss`, `hero`, `gold`, `derelict.cyan`: 7), `flicker` (how hard the core pulses), `speed`. The core sits inside its edge glow (the `steps(edge, { core })` chain), so the two lists share no colour (SKILL.md and style guide section 3, rule 8): `crimson` stays in the core list only.
- **Sounds:** `burst` frame 0 → `magic-spell` style "Quick zap", volume 0.8.
- **Versions (5):** **Charging** `{}` · **Full power** `{ size: 1, pieces: 12, edge: thornwood.gold }` · **Dark charge** `{ core: thornwood.crimson, edge: thornwood.thorn }` · **Ring charge** `{ style: 'rings', edge: thornwood.hero }` · **Pull** `{ style: 'pull', twist: 0 }`.
- **Helpers:** `engine/spells.js` (`swirl` with `loop: true` and `r1` smaller than `r0`), `engine/fx.js` (`glow`, `ring`, `streaks`, `starburst`).
- **Look and motion:** The charge of a big shot or a special move: sparks gather into a pulsing core at the middle. `burst`: the core flashes white and fires a ring and a star outward, ending on a few sparks. Nearest existing: `fx-heal` (rising motes) and `plasma-burst` (an explosion).

#### `dizzy-ring` · Dizzy ring

- **Meta:** type `effect`, role `effects/spark`, view `side`, themes `neutral`; gameTypes `platformer`, `arcade`, `roguelike-action`, `turn-based-rpg`. Batch **K05**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`. A game places it over a head.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (7):** `size`, `pieces` (slider "Marks": Few / Many; whole numbers 2 to 5 marks, step 1, default 3), `style` (choice: stars | pluses | dots), `depth` (slider "Ring depth": Flat / Round; the ring's `ry`, from 2 px to half its `rx`: a thin flat ellipse or a rounder one seen from higher up; default 0.75, because at 0.5 and below the ring reads as two flat lines and the front and back marks stack, as the reviews of this sprite found), `core` (default cream; swatches exactly `cream`, `sky`, `goblin`, `steel`, `skin`: 5), `edge` (default gold; swatches exactly `gold`, `crimson`, `thorn`, `magic`, `moss`, `hero`, `ember`: 7), `speed`. The core sits inside each mark (the `steps(edge, { core })` chain), so the two lists share no colour (SKILL.md and style guide section 3, rule 8): `cream` left the edge list.
- **Sounds:** none.
- **Versions (5):** **Seeing stars** `{}` · **Sleepy dots** `{ style: 'dots', edge: thornwood.hero }` · **Big daze** `{ size: 1, pieces: 5 }` · **Stunned sparks** `{ style: 'pluses', edge: thornwood.crimson }` · **Wide loop** `{ depth: 1 }`.
- **Helpers:** `engine/orbits.js` (`orbitHoop` for the faint track, drawn in two halves; it draws an upright, unrotated ellipse from `cx`, `cy`, `rx`, `ry` and `thick`, which is why the ring has a depth control and no lean. Each mark sits at `cx + cos(a) * rx`, `cy + sin(a) * ry` on the same ellipse, and is a back mark, smaller and darker and drawn before the far half, when `sin(a) < 0`, the same near or far test `orbitHoop` uses for its bead), `engine/bursts.js` (`sparkMark`), `engine/shapes.js` (`starIn`).
- **Look and motion:** A stunned or dazed status: small marks run round a flattened ring, one turn per loop; marks at the back are a size smaller and a tone darker than those at the front. A common cartoon idea. **No faces on the stars and no birds.**

### Celebration and scatter

#### `confetti` · Confetti

- **Meta:** type `effect`, role `effects/spark`, view `none`, themes `neutral`, `candy`; gameTypes `arcade`, `puzzle`, `card-game`, `racing`. Batch **K06**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `burst` 12. No `loop`: a loop of shaped pieces fluttering down needs the missing `fallField` helper (see [Left out](#left-out-and-why)).
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (Few / Many; whole numbers 6 to 18 pieces in all, step 1, default 12), `spread`, `style` (choice: paper | streamers | glitter; streamers are short wavy 1 px ribbons, glitter is twinkles), `body` ("Colour 1": default crimson; swatches exactly `crimson`, `ember`, `thorn`, `soil`: 4), `accent` ("Colour 2": default gold; swatches exactly `gold`, `moss`, `goblin`, `grass`: 4), `trim` ("Colour 3": default hero; swatches exactly `hero`, `magic`, `cream`, `sky`: 4), `speed`. All Thornwood names, written as three explicit lists (not `swatches()` calls, whose lists overlap). Pieces of different colours touch, so the three lists share no colour (SKILL.md: two colour controls whose parts touch must not offer the same swatch).
- **Sounds:** `burst` frame 0 → `chime-success` style "Quick confirm", volume 0.8.
- **Versions (5):** **Party** `{}` · **Gold shower** `{ body: thornwood.ember, trim: thornwood.cream }` · **Streamers** `{ style: 'streamers' }` · **Glitter** `{ style: 'glitter', body: thornwood.thorn, accent: thornwood.goblin, trim: thornwood.magic }` · **Small pop** `{ size: 0, pieces: 6, spread: 0 }`.
- **Helpers:** `engine/fx.js` (`shards`, called once per colour with its own seed, for paper; `sparkles` for glitter), `engine/spells.js` (`boltPath` with a small `zigzag` (1 to 2 px) and `sway`, and `bolt` at `width` 1 with `forks: 0`, `colour` the piece's colour, for streamers: one short wavy 1 px ribbon per piece, 4 to 7 px long, one seed per piece; not `fx.leaves`, which has no width option and draws each leaf at least `max(2, size * 0.56)` px wide).
- **Look and motion:** A win, a level clear, a new record. `burst`: a white pop at the middle, then pieces thrown up and out that turn as they flutter down and settle as single pixels along the bottom third. Nearest existing: `pickup-sparkle` (twinkles round one item).

#### `firework` · Firework

- **Meta:** type `effect`, role `effects/explosion`, view `none`, themes `neutral`; gameTypes `arcade`, `puzzle`, `racing`, `platformer`. Batch **K06**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (2):** `burst` 12 (the bloom alone) · `launch` 12 (a trail rises from the bottom on frames 0 to 4, the bloom opens on frame 5).
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (slider "Sparks": Few / Many; whole numbers 8 to 20, step 1, default 14), `style` (choice: peony | ring | willow; willow trails droop under gravity), `trail` (toggle: each spark leaves a short tail), `core` (default cream; swatches exactly `cream`, `sky`, `goblin`, `steel`, `skin`: 5), `edge` (default crimson; swatches exactly `crimson`, `ember`, `magic`, `thorn`, `moss`, `hero`, `gold`: 7), `accent` ("Inner sparks": default gold; swatches exactly `gold`, `crimson`, `thorn`, `magic`, `moss`, `ember`: 6), `speed`. The white heart (core) meets both rings of sparks, so Core shares no colour with Edge or Inner sparks (SKILL.md and style guide section 3, rule 8): `cream` left the Inner sparks list. The inner ring flies on a smaller radius with a gap of 2 px or more from the outer beads on every frame, so Edge and Inner sparks never touch and may share colours.
- **Sounds:** `burst` frame 0 → `explosion` style "Fireworks pop", volume 0.8 · `launch` frame 0 → `rocket-launch` style "Flare", volume 0.6; frame 5 → `explosion` style "Fireworks pop", volume 0.8.
- **Versions (5):** **Red peony** `{}` · **Gold willow** `{ style: 'willow', edge: thornwood.gold, accent: thornwood.ember }` · **Blue ring** `{ style: 'ring', edge: thornwood.hero, accent: thornwood.magic }` · **Green crackle** `{ edge: thornwood.moss, trail: false }` · **Small pop** `{ size: 0, pieces: 8 }`.
- **Helpers:** `engine/bursts.js` (`embers` with `gravity`, `sparkFlash`), `engine/fx.js` (`streaks` for the launch trail, `glow`, `particles`).
- **Look and motion:** A celebration over a level end or a title screen: a white flash, then a sphere (or a ring) of beads flying out with an inner ring of the second colour, cooling and drooping into falling single pixels. Nearest existing: `explosion-small` (a fireball, not a bloom of sparks).

#### `leaf-burst` · Leaf burst

- **Meta:** type `effect`, role `effects/dust`, view `side`, themes `neutral`, `forest`, `farm`; gameTypes `top-down-rpg`, `platformer`, `farming-sim`, `arcade`. Batch **K06**.
- **Frame:** 48x48, pivot [24, 46].
- **Clips (1):** `burst` 12.
- **Parts:** none.
- **Controls (7):** `size`, `pieces` (slider "Leaves": Few / Many; whole numbers 4 to 12, step 1, default 8), `spread`, `style` (choice: burst | shower; burst throws leaves up and out from the middle, shower lets them leave one after another from above and flutter down), `body` ("Leaves": default leaf; swatches exactly `leaf`, `moss`, `ember`, `cream`: 4), `accent` ("Sunlit leaves": default grass; swatches exactly `grass`, `gold`, `thorn`, `goblin`: 4), `speed`. Leaves of the two colours touch in the cloud, so the two lists share no colour, as in `confetti` (SKILL.md and style guide section 3, rule 8).
- **Sounds:** `burst` frame 0 → `bush-rustle` style "Small bush", volume 0.8.
- **Versions (5):** **Cut bush** `{}` · **Autumn** `{ body: thornwood.ember, accent: thornwood.gold }` · **Blossom** `{ body: thornwood.cream, accent: thornwood.thorn }` · **Tree shake** `{ style: 'shower', spread: 1, pieces: 12 }` · **A few leaves** `{ size: 0, pieces: 4 }`.
- **Helpers:** `engine/fx.js` (`leaves`), `engine/foliage.js` (`leafFall`).
- **Look and motion:** What flies when a bush is cut, a tree is shaken or grass is mown; the last frame keeps the leaves lying on the bottom rows. Nearest existing: `debris-burst` (inked scrap) and the shake of `tree-oak` (part of the tree).

### Water

#### `splash-burst` · Splash

- **Meta:** type `effect`, role `effects/dust`, view `side`, themes `neutral`, `underwater`; gameTypes `platformer`, `top-down-rpg`, `farming-sim`, `arcade`. Batch **K07**.
- **Frame:** 48x48, pivot [24, 46]. The water line is row 45.
- **Clips (1):** `burst` 8.
- **Parts:** none.
- **Controls (7):** `size`, `pieces` (slider "Drops": Few / Many; whole numbers 3 to 10, step 1, default 6), `spread`, `style` (choice: crown | column | ripple; a ring of spikes, a tall jet, or low rings with few drops), `core` ("Foam": default cream; swatches exactly `cream`, `gold`, `wood`, `sky`, `steel`: 5), `edge` ("Water": default water; swatches `water` (water, magic, hero, haze, ember, moss), plus `soil`: 7), `speed`. The foam sits on the water (the `steps(edge, { core })` chain), so Foam shares no colour with Water (SKILL.md and style guide section 3, rule 8): not `swatches('thornwood', 'core')`, which repeats magic, moss and ember.
- **Sounds:** `burst` frame 0 → `water-splash` style "Diver", volume 0.8.
- **Versions (5):** **Splash** `{}` · **Big plunge** `{ style: 'column', size: 1, pieces: 10 }` · **Pebble plop** `{ style: 'ripple', size: 0 }` · **Mud splash** `{ core: thornwood.wood, edge: thornwood.soil }` · **Lava splash** `{ core: thornwood.gold, edge: thornwood.ember }`.
- **Helpers:** `engine/blast.js` (`spikesIn` for the crown and the jet), `engine/fx.js` (`particles` with `gravity`, `ring` with `squash`, `steps` with `white: false`).
- **Look and motion:** Something falling into water seen from the side: frame 0 the crown at its tallest with a white heart, then drops arc out and fall back, a flattened ring spreads along the water line, and the last frame keeps a few drops on it. Nearest existing: `splash` in `engine/fx-floor.js` (slime thrown across a floor, top-down; used by `acid-glob`).

#### `cave-drip` · Cave drip

- **Meta:** type `effect`, role `effects/weather`, view `side`, themes `neutral`, `dungeon`; gameTypes `platformer`, `roguelike-action`, `puzzle`. Batch **K07**.
- **Frame:** 64x64, pivot [32, 62]. Drops form at row 2 and land on row 61.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (7):** `size` (of the drop), `fall` (slider "Fall": Short / Long; where the drop starts; not the standard `height`), `pieces` (slider "Drips": Few / Many, the end words style guide section 10 fixes for `pieces`, as in `drip`; whole numbers 1 to 3 columns, step 1, default 1, each column on its own phase), `style` (choice: splash | ripple | puddle; what happens where it lands: a tiny crown, a ring on a pool, a small puddle that swells), `body` ("Water": default water; swatches `water` (water, magic, hero, haze, ember, moss), plus `goblin`: 7), `core` ("Foam": default cream; swatches exactly `cream`, `gold`, `sky`, `steel`: 4), `speed`. The foam sits on the drop and the splash (the `steps(edge, { core })` chain), so Foam shares no colour with Water (SKILL.md and style guide section 3, rule 8).
- **Sounds:** `loop` frame 0 → `bubbles` style "Slow drips", volume 0.35.
- **Versions (5):** **Water drip** `{}` · **Slime drip** `{ style: 'puddle', body: thornwood.goblin }` · **Lava drip** `{ body: thornwood.ember, core: thornwood.gold }` · **Steady drips** `{ pieces: 3 }` · **Long fall** `{ fall: 1, size: 0 }`.
- **Helpers:** `engine/shots.js` (`dropIn`, `lightShape`), `engine/fx.js` (`ring` with `squash`, called with the landing's own phase; `particles`), `engine/blast.js` (`spikesIn` for the crown).
- **Look and motion:** A cave ceiling dripping: a drop swells at the top, stretches, falls, and lands with a small splash; one drop per loop per column. The top stub where it forms is always in view, so no frame is empty. An area loop: place it under a ceiling.

#### `rain-ripples` · Rain on water

- **Meta:** type `effect`, role `effects/weather`, view `top-down`, themes `neutral`; gameTypes `top-down-rpg`, `farming-sim`, `puzzle`, `platformer`. Batch **K07**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (7):** `size` (of each ring), `pieces` (slider "Drops": Few / Many; whole numbers 3 to 10 rings at a time, step 1, default 5), `spread` (Tight / Wide: a puddle in the middle or the whole patch), `style` (choice: rings | splashes | both; splashes are a tiny crown of four pixels with no ring), `core` ("Foam": default cream; swatches exactly `cream`, `sky`, `steel`, `#d8d8e0`: 4), `edge` ("Water": default water; swatches `water`: water, magic, hero, haze, ember, moss), `speed`. The foam sits on each ring (the `steps(edge, { core })` chain), so Foam shares no colour with Water (SKILL.md and style guide section 3, rule 8).
- **Sounds:** none.
- **Versions (5):** **Drizzle** `{}` · **Downpour** `{ pieces: 10, style: 'both' }` · **Puddle** `{ spread: 0, size: 0 }` · **Big drops** `{ size: 1, pieces: 3 }` · **Night rain** `{ core: thornwood.sky, edge: thornwood.hero }`.
- **Helpers:** `engine/fx.js` (`ring` with `squash` 0.5, one ring per drop, each called with `fract(t + hash(i))` so the loop closes; `particles`), `engine/water.js` (`wakeRing` for the faint lasting rings).
- **Look and motion:** The part of rain a pixel game can show well: drops striking a pond, a puddle or a flooded floor, each opening a flat ring that breaks into arcs. Drawn with no water under it: lay it over a water tile.

#### `bubble-stream` · Bubble stream

- **Meta:** type `effect`, role `effects/weather`, view `side`, themes `neutral`, `underwater`; gameTypes `platformer`, `puzzle`, `arcade`, `top-down-rpg`. Batch **K07**.
- **Frame:** 64x64, pivot [32, 62]. Bubbles rise from row 60.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (9):** `size`, `pieces` (Few / Many; whole numbers 4 to 12, step 1, default 7), `spread` (Tight / Wide: the width of the stream), `rise` (slider "Rise": Low / High), `wobble`, `style` (choice: fizz | big | mixed), `body` ("Bubbles": default sky; swatches `water` with lead `sky`; declare `material: 'water'`), `core` ("Shine": default cream; swatches exactly `cream`, `gold`, `steel`, `#d8d8e0`, `goblin`: 5; declare `material: 'light'`), `speed`. The shine sits on each bubble, so Shine shares no colour with Bubbles (sky, water, magic, hero, haze, ember, moss; SKILL.md and style guide section 3, rule 8): not `swatches('thornwood', 'core')`, which repeats magic, moss and ember.
- **Sounds:** none.
- **Versions (5):** **Air bubbles** `{}` · **Fizz** `{ style: 'fizz', pieces: 12 }` · **Big bubbles** `{ style: 'big', size: 1 }` · **Swamp bubbles** `{ body: thornwood.moss }` · **Trickle** `{ pieces: 4, spread: 0 }`.
- **Helpers:** `engine/spells.js` (`motes` with shape `dot`, loop), `engine/fx.js` (`particles` with negative `gravity` and `wobble`, `twinkle` for the shine).
- **Look and motion:** Bubbles rising from a vent, a diver, a sunken chest or a pot: each sways as it rises, grows a little, and shows a one-pixel shine at its top right. An area loop.

## Weather and light

Area loops (see the top section): 64x64, one `loop` clip of 8 frames, every piece on its own timer so the loop closes, everything inside the 1 px border, no ink. `grounded: false` unless the row has a pivot on the bottom row. Read `sprites/pickup-sparkle.js` (its `loop`) and `sprites/fx-heal.js` (its `loop`) first. **K08 is the pathfinder for area loops:** its report settles how a patch is judged (how much of the frame it covers, how two patches look side by side) and is read before K07.

#### `mist-drift` · Drifting mist

- **Meta:** type `effect`, role `effects/weather`, view `side`, themes `neutral`, `forest`, `horror`; gameTypes `platformer`, `top-down-rpg`, `puzzle`, `roguelike-action`. Batch **K08**.
- **Frame:** 64x64, pivot [32, 62]. The mist lies on row 61.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (8):** `size` (of the wisps), `pieces` (slider "Wisps": Few / Many; whole numbers 3 to 8, step 1, default 5), `reach` (slider "Reach": Low / High; how far up the bank reaches; not the standard `height`), `drift` (slider "Drift": Still / Drifting; how far a wisp travels to the right in its life), `style` (choice: soft | wispy | blocky; passed to `puffs` as `shape`: soft = `'round'`, wispy = `'wispy'`, blocky = `'chunky'`), `body` ("Mist": default cream; swatches exactly the light band `cream`, `#d8d8e0`, `sky`, `goblin`: 4, brightness 0.72 and up), `edge` ("Mist shadow": default haze; swatches exactly the dark band `haze`, `dusk`, `stone`, `leaf`, `slate`: 5, brightness 0.64 and below), `speed`. Mist and its shadow are touching pieces of one bank, so the two lists share no colour and Mist is always the lighter (SKILL.md and style guide section 3, rule 8).
- **Sounds:** none.
- **Versions (5):** **Morning mist** `{}` · **Swamp fog** `{ body: thornwood.goblin, edge: thornwood.leaf }` · **Graveyard fog** `{ style: 'wispy', body: '#d8d8e0', edge: thornwood.dusk }` · **Ground fog** `{ reach: 0, pieces: 8 }` · **Thick bank** `{ size: 1, reach: 1, style: 'soft' }`.
- **Helpers:** `engine/fx.js` (`puffs` with `loop: true`, `angle` to the right, `shape`, `lobes`, `floor`).
- **Look and motion:** Low wisps that swell, drift right and thin out along the ground, each on its own timer. Solid pixels, never see-through: it hides what is behind it, so keep it low and broken (gaps between wisps) rather than a wall. Nearest existing: `mistBand` in `engine/backdrop.js` (part of a background layer).

#### `wind-gust` · Wind gust

- **Meta:** type `effect`, role `effects/weather`, view `none`, themes `neutral`; gameTypes `platformer`, `top-down-rpg`, `racing`, `farming-sim`. Batch **K08**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (7):** `pieces` (slider "Streaks": Few / Many; whole numbers 3 to 10, step 1, default 6), `length`, `spread`, `style` (choice: lines | dust | glints; dust adds specks blown along, glints adds twinkles), `core` ("Streaks": default cream; swatches exactly `cream`, `haze`, `sky`, `magic`, `hearthvale.wheat`: 5; declare `material: 'sky'`), `accent` ("Dust": default wood; swatches `ground` with lead `wood`: wood, soil, stone, slate; **when** `{ style: ['dust'] }`), `speed`. The specks ride along the streaks, so Streaks shares no colour with Dust (SKILL.md and style guide section 3, rule 8): `stone` left the Streaks list.
- **Sounds:** `loop` frame 0 → `wind` style "Breeze", volume 0.35.
- **Versions (5):** **Breeze** `{}` · **Gale** `{ pieces: 10, length: 1 }` · **Dust storm** `{ style: 'dust', core: hearthvale.wheat, accent: thornwood.soil }` · **Sparkling air** `{ style: 'glints', core: thornwood.magic }` · **Light air** `{ pieces: 3, length: 0 }`.
- **Helpers:** `engine/fx.js` (`streaks` with `angle: PI / 2`, `particles` with `angle: PI / 2` and `loop: true`, `sparkles`).
- **Look and motion:** Wind blowing to the right (a game mirrors it): thin streaks of different lengths slide across and shorten, specks or glints carried with them. Nearest existing: `dodge-trail` (behind a dashing body).

#### `sun-rays` · Sun rays

- **Meta:** type `effect`, role `environment/lighting`, view `none`, themes `neutral`, `forest`, `dungeon`; gameTypes `platformer`, `top-down-rpg`, `puzzle`, `farming-sim`. Batch **K08**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (9):** `pieces` (slider "Rays": Few / Many; whole numbers 1 to 7, step 1, default 4), `length`, `spread` (Tight / Wide: the fan's width), `slant` (slider "Slant": Straight down / Slanted), `style` (choice: dashed | solid; dashes travel down the rays, or the rays are unbroken and swell), `motes` (toggle "Dust": four or more specks glinting in the light), `core` (default cream; swatches exactly `cream`, `goblin`, `steel`, `skin`, `#d8d8e0`: 5), `edge` ("Light": default gold; swatches `glow` with lead `gold` (gold, magic, ember, moss, crimson, thorn), plus `sky` and `wood`: 8), `speed`. The core runs down the middle of each ray (the `steps(edge, { core })` chain), so the two lists share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** none.
- **Versions (5):** **Sunbeams** `{}` · **Moonlight** `{ edge: thornwood.sky }` · **Holy light** `{ style: 'solid', pieces: 7 }` · **Dusty attic** `{ motes: true, slant: 1, edge: thornwood.wood }` · **Single shaft** `{ pieces: 1, spread: 0 }`.
- **Helpers:** `engine/fx.js` (`rays` with `dash`, `gap` and `phase`, `sparkles` for the motes).
- **Look and motion:** Shafts of light falling from the top left through a canopy, a window or a hole in a ceiling: 1 px rays fanning down, brightest at their source, the dashes running down them once per loop. Light only: no ink, no fill between the rays.

#### `fireflies` · Fireflies

- **Meta:** type `effect`, role `environment/lighting`, view `none`, themes `neutral`, `forest`, `farm`; gameTypes `top-down-rpg`, `platformer`, `farming-sim`, `puzzle`. Batch **K08**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (8):** `size` (of the glow), `pieces` (slider "Lights": Few / Many; whole numbers 1 to 9, step 1, default 5), `spread` (how far they roam), `style` (choice: fireflies | wisps | specks; wisps are pale motes with a ring of glow, specks single blinking dots), `flicker` (how much they blink), `core` (default cream; swatches exactly `cream`, `goblin`, `sky`, `steel`, `#d8d8e0`: 5), `glow` ("Glow": default moss; swatches `glow` with lead `moss` (moss, magic, ember, gold, crimson, thorn): 6), `speed`. The core sits inside its glow, so the two lists share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** none.
- **Versions (5):** **Fireflies** `{}` · **Spirit wisps** `{ style: 'wisps', glow: thornwood.magic }` · **Dust in light** `{ style: 'specks', glow: thornwood.gold, pieces: 9 }` · **Night swarm** `{ pieces: 9, spread: 1 }` · **Lone firefly** `{ pieces: 1, spread: 0 }`.
- **Helpers:** `engine/spells.js` (`motes` with `loop: true` and `sway`), `engine/fx.js` (`twinkle`, `glow`, `sparkles`).
- **Look and motion:** Small lights over a pond, a meadow or a night path: each drifts slowly upward and sideways, glows, dims and blinks on its own timer. Nearest existing: `sparkOrbit` round a rare item (`pickup-sparkle` loop).

#### `ember-drift` · Drifting embers

- **Meta:** type `effect`, role `effects/weather`, view `side`, themes `neutral`, `dungeon`, `fantasy`; gameTypes `platformer`, `roguelike-action`, `top-down-rpg`, `shooter`. Batch **K08**.
- **Frame:** 64x64, pivot [32, 62]. Embers rise from row 60.
- **Clips (1):** `loop` 8 loop.
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (Few / Many; whole numbers 4 to 14, step 1, default 8), `spread` (Tight / Wide), `rise` (slider "Rise": Low / High), `style` (choice: embers | ash | sparks; ash is grey flakes with no glow, sparks are pluses), `core` (default gold; swatches exactly `gold`, `cream`, `skin`, `steel`: 4; declare `material: 'fire'`), `edge` ("Embers": default ember; swatches exactly `ember`, `magic`, `crimson`, `thorn`, `moss`, `stone`: 6; declare `material: 'fire'`), `speed`. The core sits inside each ember (the `steps(edge, { core })` chain), so the two lists share no colour (SKILL.md and style guide section 3, rule 8): `gold` stays in the core list only.
- **Sounds:** none.
- **Versions (5):** **Embers** `{}` · **Falling ash** `{ style: 'ash', core: thornwood.cream, edge: thornwood.stone }` · **Magic sparks** `{ style: 'sparks', core: thornwood.cream, edge: thornwood.magic }` · **Inferno** `{ pieces: 14, rise: 1, spread: 1 }` · **Few sparks** `{ pieces: 4, size: 0 }`.
- **Helpers:** `engine/spells.js` (`motes`), `engine/fx.js` (`particles` with negative `gravity` and `wobble`), `engine/bursts.js` (`sparkMark`).
- **Look and motion:** Glowing bits rising and swaying above lava, a burning village or a forge, cooling from gold to a dark ember dot before they vanish. An area loop; `flames` and `campfire` have their own sparks.

### Ground and beam

#### `shockwave` · Shockwave

- **Meta:** type `effect`, role `effects/dust`, view `side`, themes `neutral`; gameTypes `platformer`, `roguelike-action`, `arcade`, `top-down-rpg`. Batch **K09**.
- **Frame:** 64x64, pivot [32, 62]. The ground line is row 61.
- **Clips (1):** `burst` 10.
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (slider "Rocks": Few / Many chips thrown; whole numbers 2 to 8, step 1, default 4), `spread`, `height` (slider "Height": Short / Tall; how high the ring stands), `style` (choice: dust | energy | quake; quake runs cracks out along the ground), `core` (default cream; swatches exactly `cream`, `gold`, `sky`, `steel`, `skin`: 5), `edge` (default stone; swatches `edge` with lead `stone`: stone, ember, crimson, magic, thorn, moss, hero), `speed`. The core runs inside the ring (the `steps(edge, { core })` chain), so the two lists share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** `burst` frame 0 → `land-thud` style "Heavy landing", volume 0.8.
- **Versions (5):** **Ground slam** `{}` · **Energy wave** `{ style: 'energy', edge: thornwood.magic }` · **Quake** `{ style: 'quake', pieces: 8 }` · **Low ripple** `{ height: 0, spread: 1 }` · **Small thump** `{ size: 0 }`.
- **Helpers:** `engine/fx.js` (`ring` with a low `squash`, `puffs` with `floor`, `shards`, `glow`), `engine/rock.js` (`crack`).
- **Look and motion:** A heavy landing, a boss slam, a stomp power: frame 0 a white flash at the impact point; a flattened ring races out along the ground, dust rises at its ends, chips fly, and it ends on dust specks and (quake) two short cracks. Nearest existing: `dust-puff` (a landing puff, 32 px).

#### `teleport-beam` · Teleport beam

- **Meta:** type `effect`, role `effects/magic`, view `side`, themes `neutral`, `sci-fi`, `fantasy`; gameTypes `platformer`, `roguelike-action`, `top-down-rpg`, `shooter`. Batch **K09**.
- **Frame:** 64x64, pivot [32, 62]. The beam stands on row 61.
- **Clips (2):** `burst` 10 (label "Leave") · `arrive` 10. `burst` ends on a ring of pixels on the floor; `arrive` starts from those pixels.
- **Parts:** none.
- **Controls (8):** `size` (how tall), `width`, `style` (choice: column | rings | sparks), `pieces` (Few / Many rings or sparks; whole numbers 3 to 8, step 1, default 5; **when** `{ style: ['rings', 'sparks'] }`), `core` (default cream; swatches exactly `cream`, `sky`, `goblin`, `steel`, `skin`: 5), `edge` (default magic; swatches `edge` with lead `magic` (magic, ember, crimson, thorn, moss, hero), plus `gold` and `derelict.cyan`: 8), `flicker`, `speed`. The core runs up the middle of the beam (the `steps(edge, { core })` chain), so the two lists share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** `burst` frame 0 → `warp-out` style "Warp out", volume 0.8 · `arrive` frame 0 → `warp-out` style "Teleport blink", volume 0.8.
- **Versions (5):** **Beam out** `{}` · **Hoop lift** `{ style: 'rings', edge: thornwood.gold }` · **Spark cloud** `{ style: 'sparks', edge: thornwood.thorn }` · **Wide beam** `{ width: 1, size: 1 }` · **Red warp** `{ edge: thornwood.crimson }`.
- **Helpers:** `engine/fx.js` (`beam`, `glow`), `engine/fx-floor.js` (`floorRing`), `engine/shapes.js` (`hoopIn`), `engine/spells.js` (`motes`).
- **Look and motion:** A character leaving or arriving (the game hides or shows the body): a column of light at its brightest on frame 0, breaking into dashes that run upward and thin; hoops rising, or sparks streaming up. `arrive` runs the other way and flashes on frame 6. Nearest existing: `spawn-warp` (a warning ring on a top-down floor) and `warp-pad` (a prop).

#### `guard-flash` · Block flash

- **Meta:** type `effect`, role `effects/spark`, view `side`, themes `neutral`; gameTypes `platformer`, `roguelike-action`, `arcade`, `turn-based-rpg`. Batch **K09**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`. Drawn for a fighter facing right: the flash sits at the fighter's front (the right of the frame's middle) and its sparks fly back to the right, towards the attacker. A game mirrors it for a fighter facing left.
- **Clips (1):** `burst` 6.
- **Parts:** none.
- **Controls (7):** `size`, `pieces` (slider "Sparks": Few / Many; whole numbers 3 to 8, step 1, default 5), `spread`, `style` (choice: arc | dome | cross; a crescent of light, a six-sided barrier, or a cross of two strokes), `core` (default cream; swatches exactly `cream`, `sky`, `goblin`, `skin`: 4), `edge` (default hero; swatches `edge` with lead `hero` (hero, ember, crimson, magic, thorn, moss), plus `steel` and `gold`: 8), `speed`. The core runs inside the shape (the `steps(edge, { core })` chain), so the two lists share no colour (SKILL.md and style guide section 3, rule 8).
- **Sounds:** `burst` frame 0 → `metal-hit` style "Sword clash", volume 0.8, **when** `{ style: ['arc', 'cross'] }` · `burst` frame 0 → `shield-break` style "Small crack", volume 0.8, **when** `{ style: ['dome'] }`.
- **Versions (5):** **Parry** `{}` · **Magic barrier** `{ style: 'dome', edge: thornwood.magic }` · **Steel cross** `{ style: 'cross', edge: thornwood.steel }` · **Perfect block** `{ size: 1, edge: thornwood.gold }` · **Small tick** `{ size: 0, pieces: 3 }`.
- **Helpers:** `engine/spells.js` (`crescent`), `engine/fx-floor.js` (`floorRing` with `sides: 6` and `squash: 1` for the dome), `engine/fx.js` (`starburst`, `glow`).
- **Look and motion:** A hit that was blocked or parried: frame 0 the shape at full size and white, then sparks fly back towards the attacker and the shape breaks into arcs and dots. Nearest existing: `hit-spark` (a hit that lands; a star, not a guard).

## Left out, and why

These core sprite lines need things the framework or the rules do not have yet. No row above depends on them.

| Wanted | Why it is left out | What would make it possible |
|---|---|---|
| `rain`, `snowfall`, `falling-leaves` (petals, hail, sandstorm) as screen-wide overlays | **Missing helper.** A weather overlay must tile across the screen with no band where one tile meets the next. `fx.particles`, `fx.streaks` and `spells.motes` all shrink or cool their pieces with age and start them at a point or a band, so tiled copies show a stripe every 64 px; `backdrop.scatter` and `wrapped` wrap only at 320 px; nothing makes a loop of shaped pieces (leaves, petals) fluttering **down** (`fx.leaves` and `foliage.leafFall` are one-shots that end lying on the ground). | A new `engine/fx.js` export, for example `fallField(g, { t, count, angle, speed, sway, size, shape, colours, seed })`: pieces on a lattice that wraps modulo the frame, the same size and colour along the whole path, kept off the 1 px border so copies laid 64 px apart join with only a 2 px gap; shapes `dot`, `streak`, `flake`, `leaf`. With it: rain, snow, leaves, petals, ash fall and sandstorm (about 6 sprites), and a falling `loop` for `confetti` (a results screen) |
| A night overlay, a fog veil, a lightning flash over the screen, heat haze | **Not a sprite.** Each needs half-see-through pixels or a distortion, which the style guide forbids (sections 1 and 2). The whole-bundle look "Night" already darkens a bundle | A game-side tint, or a future "overlay" kind with its own rules: an architecture decision, not a helper |
| Curling wind strokes, a dizzy spiral | **Missing helper** for a curled 1 px stroke (a spiral or a hook). The rows above use options that avoid it (`wind-gust` streaks, `dizzy-ring` marks) | `strokeIn` in `engine/shapes.js` may cover it; check before adding a `curlIn` |
| Paper confetti that flips (a rectangle that narrows and widens) | Not blocking: `confetti` uses `fx.shards` (spinning triangles), which read as paper at 2 to 3 px. A `flipCard` piece would read better | An addition to `engine/fx.js` in a later round |

Sounds a row would have liked and that do not exist yet (not helpers; for `core-sounds-2`): an eat or crunch pickup (`fruit`, `meal`, `candy` cue `heart-pickup` and `item-get` instead), a rain loop, a soft fire crackle for `ember-drift`, a confetti pop.

## Batch plan

Each batch is one builder in one sitting, with review. Batches are grouped so that sprites built from the same helpers are made together; the first sprite of a batch is its worked example for the rest. **Order** is one more than the highest order among the batches it waits for. A batch that cues a sound from `core-sounds-1` waits for that sound batch (C05 pickups, C08 world) to be merged into `sounds/`. **K01 is the pathfinder for core pickups** (it settles the palette rule above in practice: its report is read before K02 and K03), and **K08 is the pathfinder for area loops** (read before K07).

| Order | Batch | Kind | Sprites | Helpers | Needs first |
|---|---|---|---|---|---|
| 1 | **K01** | pickups: food | `fruit`, `meal`, `candy` | `engine/pickups.js`, `engine/shapes.js` (`placedIn`, `insetIn`, `ringIn`), `engine/creature.js` (`leafIn`), `engine/solids.js` (`stripesIn`), `engine/fx.js` (`smoke`) | C05 (`heart-pickup`, `item-get`). **Pathfinder for core pickups** |
| 1 | **K04** | effects: fire, smoke and gas | `flames`, `smoke-plume`, `poison-haze` | `engine/fx.js` (`flame`, `smoke`, `puffs`, `particles`, `steps`), `engine/bursts.js` (`driftUp`), `engine/marks.js` (`drawMark`) | nothing (cues `fire`, `whoosh`, `bubbles` exist) |
| 1 | **K05** | effects: energy | `zap-crackle`, `charge-up`, `dizzy-ring` | `engine/spells.js` (`bolt`, `boltPath`, `swirl`), `engine/fx.js` (`twinkle`, `glow`, `ring`, `streaks`, `starburst`), `engine/bursts.js` (`sparkMark`), `engine/orbits.js` (`orbitHoop`), `engine/shapes.js` (`starIn`) | nothing (cues `thunder-crack`, `magic-spell` exist) |
| 1 | **K08** | weather and light: air and light | `mist-drift`, `wind-gust`, `sun-rays`, `fireflies`, `ember-drift` | `engine/fx.js` (`puffs`, `streaks`, `particles`, `rays`, `sparkles`, `twinkle`, `glow`), `engine/spells.js` (`motes`), `engine/bursts.js` (`sparkMark`) | nothing (cue `wind` exists). **Pathfinder for area loops** |
| 1 | **K09** | effects: ground and beam | `shockwave`, `teleport-beam`, `guard-flash` | `engine/fx.js` (`ring`, `puffs`, `shards`, `beam`, `glow`, `starburst`), `engine/rock.js` (`crack`), `engine/fx-floor.js` (`floorRing`), `engine/spells.js` (`crescent`, `motes`), `engine/shapes.js` (`hoopIn`) | nothing (cues `land-thud`, `warp-out`, `metal-hit`, `shield-break` exist) |
| 2 | **K02** | pickups: gear and power | `ammo-box`, `arrow-bundle`, `bomb-pickup`, `power-orb` | `engine/pickups.js`, `engine/shapes.js` (`arrowIn`, `placedIn`), `engine/solids.js` (`stripesIn`), `engine/fx.js` (`twinkle`, `particles`, `glow`), `engine/crystals.js` (`drawCrystal`), `engine/orbits.js` (`around`, `orbitHoop`), `engine/marks.js` (`drawMark`) | C05 (`ammo-pickup`, `item-get`, `star-pickup`), K01 |
| 2 | **K03** | pickups: treasure and time | `coin-pouch`, `trophy`, `scroll`, `hourglass` | `engine/pickups.js`, `engine/gadgets.js` (`drawToken`), `engine/marks.js` (`drawMark`), `engine/shapes.js`, `engine/fx.js` (`particles`) | C05 (`star-pickup`, `item-get`), K01 (cue `credit-pickup` exists) |
| 2 | **K06** | effects: celebration and scatter | `confetti`, `firework`, `leaf-burst` | `engine/fx.js` (`shards`, `leaves`, `sparkles`, `streaks`, `glow`, `particles`), `engine/bursts.js` (`embers`, `sparkFlash`), `engine/foliage.js` (`leafFall`), `engine/spells.js` (`boltPath`, `bolt`) | C08 (`bush-rustle`), K04 (the first effects of this set; cues `chime-success`, `explosion`, `rocket-launch` exist) |
| 2 | **K07** | effects and weather: water | `splash-burst`, `cave-drip`, `rain-ripples`, `bubble-stream` | `engine/blast.js` (`spikesIn`), `engine/fx.js` (`particles`, `ring`, `twinkle`, `steps`), `engine/shots.js` (`dropIn`, `lightShape`), `engine/water.js` (`wakeRing`), `engine/spells.js` (`motes`) | C08 (`water-splash`), K08 (area-loop conventions; cue `bubbles` exists) |

No batch waits on a new helper: every function named above is exported today (`generated/api.json`, `docs/framework-api.md`). A builder who finds one lacking for a detail adds it the way the skill says (Contract 11: tests first, additive only, pixel fingerprint before and after) and lists it in the report.
