# Hearthvale turn-based RPG kit: specification (`kit-rpg-fantasy`)

Written 2026-11-18 by the art director (task W3-S); revised the same day after the independent review (`when` on controls and cues, named palette colours, portrait roles, originality, batch order). It goes with `kit-rpg-fantasy.plan.json`; the two always agree. **Brought in line with the built library on 2026-11-18: every row below describes the file as it was built and reviewed.** Where a row and a file ever disagree again, the file is right and the row is corrected. **Read `docs/style-guide.md` first**: it fixes frame sizes, clip names, frame counts, cue frames, part names, control names and the palette. This file says what each asset is.

| | |
|---|---|
| Game type | `turn-based-rpg` |
| World | A village in green country, the roads around it and a dungeon beneath. A party of three (a hero, a mage, a rogue) walks the map, talks to villagers, and fights monsters on a separate battle screen, up to a fire-breathing wyrm. |
| View | **Two views.** The map is `top-down` (people, tiles, props). The battle screen is `side` (fighters, spell effects, backdrops). Icons and interface are `none`; portraits are `front`. |
| Palette | "Hearthvale" (style guide, section 3) |
| House sound | Storybook: soft, warm, bell-like; spells bloom and ring (style guide, section 11). |
| Sprites | **49** (42 new, 7 reused) |
| Sound effects | **20** (12 new, 8 reused) |
| Music tracks | **2** (2 new, 0 reused) |
| Batches | 22 |

The mixed view keeps this kit affordable: only the seven people on the map need direction clips, and the battle screen reuses the five existing side-view fighters. The hero, mage and rogue each exist twice, once per view, and **must be recognisably the same person in both**: same default colours, same parts.

Contents: [Asset list](#asset-list) · [Reused assets](#reused-assets) · [New sprites](#new-sprites) · [Sound effects](#sound-effects) · [Music](#music) · [Batch plan](#batch-plan)

## Asset list

| # | id | Name | type | role | view | Frame | Batch |
|---|---|---|---|---|---|---|---|
| 1 | `knight` | Hero | character | characters/player | side | 64x64 | reused (existing) |
| 2 | `wizard` | Wizard | character | characters/player | side | 64x64 | reused (existing) |
| 3 | `slime` | Slime | creature | characters/enemy | side | 48x48 | reused (existing) |
| 4 | `bat` | Bat | creature | characters/enemy | side | 48x48 | reused (existing) |
| 5 | `wolf` | Wolf | creature | characters/enemy | side | 64x48 | reused (existing) |
| 6 | `coin` | Coin | pickup | items/pickup | front | 32x32 | reused (existing) |
| 7 | `campfire` | Campfire | prop | world/prop | side | 48x48 | reused (existing) |
| 8 | `hero-walker` | Hero (map) | character | characters/player | top-down | 48x48 | R03 |
| 9 | `mage-walker` | Mage (map) | character | characters/player | top-down | 48x48 | R05 |
| 10 | `rogue-walker` | Rogue (map) | character | characters/player | top-down | 48x48 | R05 |
| 11 | `village-elder` | Village elder | character | characters/npc | top-down | 48x48 | R06 |
| 12 | `merchant` | Merchant | character | characters/npc | top-down | 48x48 | R06 |
| 13 | `town-guard` | Town guard | character | characters/npc | top-down | 48x48 | R07 |
| 14 | `farm-kid` | Village child | character | characters/npc | top-down | 48x48 | R07 |
| 15 | `rogue-battler` | Rogue | character | characters/player | side | 64x64 | R12 |
| 16 | `road-bandit` | Bandit | character | characters/enemy | side | 64x64 | R12 |
| 17 | `bone-soldier` | Skeleton soldier | creature | characters/enemy | side | 64x64 | R13 |
| 18 | `thicket-imp` | Thicket imp | creature | characters/enemy | side | 48x48 | R13 |
| 19 | `ember-wyrm` | Ember wyrm | creature | characters/boss | side | 128x96 | R14 |
| 20 | `portraits-party` | Party portraits | icon | interface/icon | front | 48x48 | R15 |
| 21 | `portraits-village` | Villager portraits | icon | interface/icon | front | 48x48 | R15 |
| 22 | `tiles-meadow` | Meadow and paths | tileset | world/tile | top-down | 32x32 | R04 |
| 23 | `tiles-shore` | Water and shore | tileset | world/tile | top-down | 32x32 | R10 |
| 24 | `tiles-village` | Village ground and walls | tileset | world/tile | top-down | 32x32 | R08 |
| 25 | `tiles-dungeon` | Dungeon tiles | tileset | world/tile | top-down | 32x32 | R09 |
| 26 | `tree-oak` | Oak tree | prop | world/prop | top-down | 64x80 | R04 |
| 27 | `tree-pine` | Pine tree | prop | world/prop | top-down | 48x80 | R04 |
| 28 | `boulder` | Boulder | prop | world/prop | top-down | 48x48 | R09 |
| 29 | `cottage` | Cottage | prop | world/building | top-down | 96x96 | R11 |
| 30 | `inn` | Inn | prop | world/building | top-down | 128x96 | R11 |
| 31 | `market-stall` | Market stall | prop | world/building | top-down | 64x64 | R08 |
| 32 | `chest-topdown` | Chest (top-down) | prop | world/prop | top-down | 32x32 | R09 |
| 33 | `dungeon-door` | Dungeon door | prop | world/door | top-down | 32x48 | R09 |
| 34 | `save-crystal` | Save crystal | prop | world/prop | top-down | 32x48 | R10 |
| 35 | `icons-consumables` | Consumable icons | icon | items/icon | none | 32x32 | R16 |
| 36 | `icons-gear` | Equipment icons | icon | items/weapon | none | 32x32 | R17 |
| 37 | `icons-key-items` | Key item icons | icon | items/key | none | 32x32 | R16 |
| 38 | `fx-slash` | Slash | effect | effects/spark | side | 64x64 | R18 |
| 39 | `fx-fire-spell` | Fire spell | effect | effects/magic | side | 64x64 | R18 |
| 40 | `fx-ice-spell` | Ice spell | effect | effects/magic | side | 64x64 | R18 |
| 41 | `fx-thunder-spell` | Thunder spell | effect | effects/magic | side | 64x96 | R18 |
| 42 | `fx-heal` | Heal | effect | effects/magic | side | 64x64 | R18 |
| 43 | `bg-battle-field` | Field battle backdrop | background | environment/background | side | 320x180 | R19 |
| 44 | `bg-battle-dungeon` | Dungeon battle backdrop | background | environment/background | side | 320x180 | R19 |
| 45 | `ui-dialogue` | Dialogue box | ui | interface/panel | none | 96x48 | R20 |
| 46 | `ui-battle-menu` | Battle menu | ui | interface/panel | none | 96x64 | R20 |
| 47 | `ui-bars-rpg` | Health and magic bars | ui | interface/bar | none | 64x16 | R20 |
| 48 | `ui-status-icons` | Status marks | ui | interface/icon | none | 16x16 | R17 |
| 49 | `ui-damage-digits` | Damage numbers | ui | interface/icon | none | 16x16 | R20 |

## Reused assets

Seven sprites that existed before the kit are used on the battle screen and at camp. They count towards the 49. The additions were made once, for both kits.

| id | Used here as | Clips | Added for the kits |
|---|---|---|---|
| `knight` | The hero on the battle screen | idle, walk, run, jump, attack, hurt, die, block, victory | `die` (the knock-out), `block` (the Defend command) and `victory` |
| `wizard` | The mage on the battle screen | idle, walk, run, jump, cast, hurt, die, victory, talk | `die`, `victory`, `talk`; parts declared (weapon, headgear, beard) |
| `slime` | Battle enemy: the first, weakest monster | idle, hop, attack, hurt, die | `die` |
| `bat` | Battle enemy in the dungeon | idle, fly, attack, hurt, die | `die` |
| `wolf` | Battle enemy in the fields | idle, walk, run, attack, hurt, die | `die` |
| `coin` | Gold: battle rewards and shop prices | spin, collect | none |
| `campfire` | The camp where the party rests | burn, ignite | none |

## New sprites

How to read a row. **Clips:** name, frame count, "loop" if it loops; fps and what must happen in each clip are in the style guide, section 4 (a label in brackets is the button text). **Parts:** each part with its selector's options, then its other settings. **Controls:** the sprite's own controls by key (labels and end words for standard keys are in the style guide, section 10; non-standard keys carry a note). **Sounds:** clip, frame, sound id and style; write the cue exactly so (the "style" is the cue's `preset`). **when:** a control or a cue followed by **when** and a `{ ... }` is in effect only for those values of other controls; copy it exactly into the control's options or the cue (style guide, sections 10 and 11). Default colours are names from the "Hearthvale" palette: "default meadow" is `PALETTE.hearthvale.meadow`.

### People on the map (top-down)

#### `hero-walker` · Hero (map)

- **Meta:** type `character`, role `characters/player`, view `top-down`, themes `fantasy`. Batch **R03**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (11):** `idle_down`, `idle_up`, `idle_side` 8 loop each · `walk_down`, `walk_up`, `walk_side` 8 loop each · `attack_down`, `attack_up`, `attack_side` 8 each · `hurt` 4 · `die` 8.
- **Parts:** **weapon**: `weapon` (sword | axe | spear | none), `weaponLength`; **headgear**: `headgear` (helmet | crown | none), `headgearSize`; **cape**: `cape` (plain | tattered | none), `capeLength`.
- **Controls (11 + 6 in parts):** `height`, `build`, `hairStyle` (choice: short | long | spiky | ponytail: hair shows under every headgear), `skin`, `hair` (colour), `outfit` (default hero), `trim` (the cape, the helmet's plume and the hem and cuffs of the tunic, so it always shows: default crimson), `metal` (weapon, helmet and crown: default steel; **when** `[{ weapon: ['sword', 'axe', 'spear'] }, { headgear: ['helmet', 'crown'] }]`), `bounce`, `stride`, `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-grass` style "Grass", volume 0.45 · `attack_*` frame 3 → `sword-slash` style "Quick dagger", volume 0.7, **when** `{ weapon: ['sword', 'axe', 'spear'] }` · `attack_*` frame 3 → `whoosh` style "Quick swipe", volume 0.7, **when** `{ weapon: ['none'] }` (a bare fist) · `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `die` frame 0 → `punch` style "Heavy body blow".
- **Look and motion:** **The first top-down character: it sets the conventions for every other one**, and it is the same person as `knight`: same default colours (blue outfit, red cape, steel helmet with a red plume), the same weapon and headgear options, so the hero on the map and the hero in battle match. Level "Full" (style guide, section 5). Chibi proportions: head 12 to 13 px across, body 30 px tall. The attack is a quarter-circle swing towards the facing direction with a white arc drawn after the outline.

#### `mage-walker` · Mage (map)

- **Meta:** type `character`, role `characters/player`, view `top-down`, themes `fantasy`. Batch **R05**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (7):** `idle_down`, `idle_up`, `idle_side` 8 loop each · `walk_down`, `walk_up`, `walk_side` 8 loop each · `cast` 8.
- **Parts:** **headgear**: `headgear` (pointed | wide | hood | none), `headgearSize`; **weapon**: `weapon` (staff | wand | orb | none), `weaponLength`; **beard**: `beard` (long | short | none), `beardLength`.
- **Controls (10 + 6 in parts):** `height`, `build`, `length` (slider "Robe": Knee / Floor), `skin`, `hair` (beard and hair; the hair shows at the temples and neck under every headgear, so it is always in effect: default cream), `outfit` (the robe: default mage), `trim` (the robe's hem, cuffs and sash: default gold), `glow` (the light of the weapon's tip and of the `cast` clip, so it is in effect with any weapon and with none: default magic), `bounce`, `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-grass` style "Grass", volume 0.45 · `cast` frame 2 → `magic-spell` style "Quick zap", volume 0.8.
- **Look and motion:** The same person as `wizard`: purple robe, pointed hat, long pale beard, staff with a glowing orb. Level "Walker" plus `cast`. The robe hides the legs: the hem sways left and right with each step instead. In `_up` clips the hat and the back of the robe fill the silhouette; the staff shows beside the body.

#### `rogue-walker` · Rogue (map)

- **Meta:** type `character`, role `characters/player`, view `top-down`, themes `fantasy`. Batch **R05**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (9):** `idle_down`, `idle_up`, `idle_side` 8 loop each · `walk_down`, `walk_up`, `walk_side` 8 loop each · `run_down`, `run_up`, `run_side` 8 loop each.
- **Parts:** **headgear**: `headgear` (hood | bandana | mask | none), `headgearSize`; **scarf**: `scarf` (short | long | none), `scarfLength`; **weapon**: `weapon` (daggers | short sword | claws | none), `weaponLength`.
- **Controls (10 + 6 in parts):** `height`, `build`, `hairStyle` (choice: short | long | spiky | ponytail; **when** `{ headgear: ['bandana', 'mask', 'none'] }`: the hood hides the hair), `skin`, `hair` (**when** `{ headgear: ['bandana', 'mask', 'none'] }`), `outfit` (default rogue), `trim` (the scarf, the belt and the boots, so it shows with `scarf: none` too: default slate), `bounce`, `stride`, `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-grass` style "Grass", volume 0.45 · `run_*` frame 0 and 4 → `footstep-grass` style "Tall grass", volume 0.45.
- **Look and motion:** The same person as `rogue-battler`: teal hood, long scarf trailing behind, daggers at the hips. Level "Walker" plus `run_*` (a low, leaning dash). The scarf lags and whips; it is the feature that tells this silhouette from the hero's.

#### `village-elder` · Village elder

- **Meta:** type `character`, role `characters/npc`, view `top-down`, themes `fantasy`, `farm`. Batch **R06**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (7):** `idle_down`, `idle_up`, `idle_side` 8 loop each · `walk_down`, `walk_up`, `walk_side` 8 loop each · `talk` 8 loop.
- **Parts:** **held**: `held` (cane | lantern | none), `heldSize`; **beard**: `beard` (long | short | none), `beardLength`; **headgear**: `headgear` (none | cap | circlet), `headgearSize`.
- **Controls (9 + 6 in parts):** `height`, `build`, `stoop` (slider: Upright / Bent), `skin`, `hair` (default cream), `outfit` (default cobble), `trim` (default roof), `bounce`, `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-grass` style "Dirt path", volume 0.45.
- **Look and motion:** An old villager who gives quests. Bent forward over a cane, slow short steps (the cane plants on frames 2 and 6). `talk` nods and lifts the free hand.

#### `merchant` · Merchant

- **Meta:** type `character`, role `characters/npc`, view `top-down`, themes `fantasy`, `farm`. Batch **R06**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (5):** `idle_down`, `idle_up`, `idle_side` 8 loop each · `talk` 8 loop · `wave` 8.
- **Parts:** **pack**: `pack` (backpack | crate | sack | none), `packSize`; **headgear**: `headgear` (turban | cap | straw hat | none), `headgearSize`; **held**: `held` (none | coin purse | scale), `heldSize`.
- **Controls (9 + 6 in parts):** `height`, `build`, `spectacles` (toggle: round spectacles, at least 8 px across), `skin`, `hair` (it shows below every headgear), `outfit` (default wheat), `accent` (the apron: default roof), `bounce`, `speed`.
- **Sounds:** none.
- **Look and motion:** A tall, lean trader with a long neck and a long apron, who stands at a stall and does not walk (not the round, moustached pedlar under a giant backpack that a famous RPG series made its own: style guide, section 13). The pack (a framed backpack, a crate or a sack) is hung with a rolled rug and a lantern and shows over one shoulder, no taller than the head. `wave` raises one arm high and swings it twice; `talk` counts on the fingers of one hand.

#### `town-guard` · Town guard

- **Meta:** type `character`, role `characters/npc`, view `top-down`, themes `fantasy`, `farm`. Batch **R07**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (7):** `idle_down`, `idle_up`, `idle_side` 8 loop each · `walk_down`, `walk_up`, `walk_side` 8 loop each · `block` 6.
- **Parts:** **weapon**: `weapon` (halberd | spear | sword | none), `weaponLength`; **shield**: `shield` (none | round | kite), `shieldSize`; **headgear**: `headgear` (helmet | kettle hat | none), `headgearSize`.
- **Controls (9 + 6 in parts):** `height`, `build`, `skin`, `outfit` (the tabard: default hero), `trim` (the tabard's border and the belt: default wheat), `metal` (weapon, shield and headgear: default steel; **when** `[{ weapon: ['halberd', 'spear', 'sword'] }, { shield: ['round', 'kite'] }, { headgear: ['helmet', 'kettle hat'] }]`), `bounce`, `stride`, `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-gravel` style "Boots", volume 0.45 · `block` frame 1 → `metal-hit` style "Tin can", volume 0.7, **when** `[{ weapon: ['halberd', 'spear', 'sword'] }, { shield: ['round', 'kite'] }]` (with neither, the guard bars the way with an arm, in silence).
- **Look and motion:** A soldier at a gate. Stiff, upright, a pole weapon taller than he is held upright at his side (it sets the silhouette). The helmet is open-faced so skin always shows. `block` swings the weapon across the body to bar the way.

#### `farm-kid` · Village child

- **Meta:** type `character`, role `characters/npc`, view `top-down`, themes `fantasy`, `farm`. Batch **R07**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (9):** `idle_down`, `idle_up`, `idle_side` 8 loop each · `walk_down`, `walk_up`, `walk_side` 8 loop each · `run_down`, `run_up`, `run_side` 8 loop each.
- **Parts:** **held**: `held` (none | stick | basket | flower), `heldSize`; **headgear**: `headgear` (none | straw hat | cap | bow), `headgearSize`.
- **Controls (10 + 4 in parts):** `height` (a child: 22 to 27 px), `head`, `hairStyle` (choice: short | bowl | pigtails | spiky; **when** `{ headgear: ['none', 'bow'] }`: under a straw hat or a cap the hair is drawn short), `skin`, `hair` (it shows below every headgear), `outfit` (default wheat), `accent` (collar, belt and shoes: default roof), `bounce`, `stride`, `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-grass` style "Grass", volume 0.45 · `run_*` frame 0 and 4 → `footstep-grass` style "Grass", volume 0.3.
- **Look and motion:** A child, three quarters of an adult's height with a bigger head. Bouncier than anyone else: the idle rocks on its heels, the run flails both arms.

### Fighters on the battle screen (side view)

#### `rogue-battler` · Rogue

- **Meta:** type `character`, role `characters/player`, view `side`, themes `fantasy`. Batch **R12**.
- **Frame:** 64x64, pivot [28, 58].
- **Clips (9):** `idle` 8 loop · `walk` 8 loop · `run` 8 loop · `jump` 8 · `attack` 8 (label "Stab") · `shoot` 6 (label "Throw") · `hurt` 4 · `die` 8 · `victory` 8 loop.
- **Parts:** **weapon**: `weapon` (daggers | short sword | claws | none), `weaponLength`, `weaponAngle`; **headgear**: `headgear` (hood | bandana | mask | none), `headgearSize`; **scarf**: `scarf` (short | long | none), `scarfLength`.
- **Controls (10 + 7 in parts):** `height`, `build`, `head`, `skin`, `outfit` (default rogue), `trim` (the scarf, the belt and the boots: default slate), `metal` (the blades: default steel; **when** `{ weapon: ['daggers', 'short sword', 'claws'] }`), `bounce`, `stride`, `speed`.
- **Sounds:** `walk` frame 0 and 4 → `footstep-gravel` style "Sneaking", volume 0.45 · `run` frame 0 and 4 → `footstep-gravel` style "Sneaking", volume 0.45 · `jump` frame 2 → `jump` style "Tiny hop", volume 0.7 · `attack` frame 3 → `sword-slash` style "Quick dagger", volume 0.7, **when** `{ weapon: ['daggers', 'short sword', 'claws'] }` · `attack` frame 3 → `whoosh` style "Quick swipe", volume 0.7, **when** `{ weapon: ['none'] }` · `shoot` frame 1 → `whoosh` style "Quick swipe", volume 0.85 · `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `die` frame 0 → `punch` style "Heavy body blow".
- **Look and motion:** The third party member, on the humanoid rig: slim, crouched, a blade in each hand, hood up and a long scarf. Full side-view clip set so it also works as a platformer hero. `attack` is two fast jabs (frames 3 and 5). `shoot` flicks a small throwing knife from the belt forward from the `muzzle` socket (the same with every `weapon`, also `none`, so its sound has no `when`). `victory` tosses a dagger and catches it.

#### `road-bandit` · Bandit

- **Meta:** type `character`, role `characters/enemy`, view `side`, themes `fantasy`. Batch **R12**.
- **Frame:** 64x64, pivot [28, 58].
- **Clips (6):** `idle` 8 loop · `walk` 8 loop · `attack` 8 · `steal` 8 · `hurt` 4 · `die` 8.
- **Parts:** **weapon**: `weapon` (club | cutlass | sling | none), `weaponLength`, `weaponAngle`; **headgear**: `headgear` (bandana | wide hat | hood | none), `headgearSize`; **pack**: `pack` (none | loot sack | quiver), `packSize`.
- **Controls (9 + 7 in parts):** `height`, `build`, `head`, `skin`, `outfit` (default bandit), `trim` (default wood), `bounce`, `stride`, `speed`.
- **Sounds:** `walk` frame 0 and 4 → `footstep-gravel` style "Boots", volume 0.45 · `attack` frame 3 → `whoosh` style "Heavy swing", volume 0.7 · `attack` frame 4 → `punch` style "Heavy body blow", volume 0.85 · `steal` frame 3 → `whoosh` style "Quick swipe", volume 0.7 · `steal` frame 5 → `coin-pickup` style "Dull token", volume 0.7 · `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `die` frame 0 → `monster-fade` style "Monster fades".
- **Look and motion:** A human enemy: broad, slouching, a cloth over the lower face. `steal` is its special move: it darts 8 px forward, snatches, and hops back holding up a small coin bag that glints.

#### `bone-soldier` · Skeleton soldier

- **Meta:** type `creature`, role `characters/enemy`, view `side`, themes `fantasy`, `dungeon`. Batch **R13**.
- **Frame:** 64x64, pivot [28, 58].
- **Clips (6):** `idle` 8 loop · `walk` 8 loop · `attack` 8 · `block` 6 · `hurt` 4 · `die` 8 (label "Collapse").
- **Parts:** **weapon**: `weapon` (sword | axe | spear | none), `weaponLength`, `weaponAngle`; **shield**: `shield` (round | kite | broken | none), `shieldSize`; **headgear**: `headgear` (none | helmet | crown | horned), `headgearSize`.
- **Controls (8 + 7 in parts):** `height`, `thickness` (slider "Bones": Thin / Thick), `head` (the skull), `body` (the bone: default cream), `glow` (the eyes: default magic), `metal` (weapon, shield and headgear: default rust; **when** `[{ weapon: ['sword', 'axe', 'spear'] }, { shield: ['round', 'kite', 'broken'] }, { headgear: ['helmet', 'crown', 'horned'] }]`), `wobble` (slider "Rattle": how much the bones jitter), `speed`.
- **Sounds:** `walk` frame 0 and 4 → `footstep-gravel` style "Sneaking", volume 0.45 · `attack` frame 3 → `sword-slash` style "Heavy blade", volume 0.7, **when** `{ weapon: ['sword', 'axe', 'spear'] }` · `attack` frame 3 → `whoosh` style "Quick swipe", volume 0.7, **when** `{ weapon: ['none'] }` (it claws) · `block` frame 1 → `metal-hit` style "Tin can", volume 0.7, **when** `[{ shield: ['round', 'kite', 'broken'] }, { weapon: ['sword', 'axe', 'spear'] }]` (it blocks with the shield or, without one, with the weapon; with neither it crosses its arms in silence) · `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `die` frame 0 → `monster-fade` style "Bones collapse".
- **Look and motion:** A skeleton that uses the humanoid rig's joints (`H.solve`) but draws bones, not a body: 2 px limbs with knobs at the joints, a rib cage with three dark gaps, a skull with two glowing eye sockets and a jaw that drops open on `attack` and `hurt`. Every bone jitters a pixel out of step (the rattle). It dies by falling straight down into a heap with the skull on top.

#### `thicket-imp` · Thicket imp

- **Meta:** type `creature`, role `characters/enemy`, view `side`, themes `fantasy`. Batch **R13**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (6):** `idle` 8 loop (label "Hover") · `fly` 8 loop · `attack` 8 (label "Claw") · `cast` 8 (label "Hex") · `hurt` 4 · `die` 8.
- **Parts:** **wings**: `wings` (leaf | bat | moth | none), `wingSpan`; **horns**: `horns` (none | nubs | curled | twig), `hornLength`; **tail**: `tail` (none | thin | leafy), `tailLength`.
- **Controls (10 + 6 in parts):** `size`, `belly` (slider: Slim / Round), `ears` (slider: Small / Huge), `eyes` (choice: sly | wide | angry), `body` (default leaf), `accent` (wings, tail tip and the insides of the ears, so it shows with both parts off: default mage), `glow` (the eyes and the hex ball of `cast`: default mage), `flap` (slider "Flap": Small / Wide; **when** `{ wings: ['leaf', 'bat', 'moth'] }`), `bob`, `speed`.
- **Sounds:** `fly` frame 1 → `whoosh` style "Quick swipe", volume 0.35, **when** `{ wings: ['leaf', 'bat', 'moth'] }` · `attack` frame 3 → `whoosh` style "Quick swipe", volume 0.7 · `cast` frame 2 → `magic-spell` style "Curse", volume 0.8 · `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `die` frame 0 → `monster-fade` style "Monster fades".
- **Look and motion:** A small flying trickster of the woods: pot belly, big ears, a grin, wings like leaves. It hovers with a quick flutter. `cast` holds both hands up while a ball of glow grows between them and is thrown forward on frame 5. With `wings: none` it bobs on a puff of glow instead.

#### `ember-wyrm` · Ember wyrm

- **Meta:** type `creature`, role `characters/boss`, view `side`, themes `fantasy`, `dungeon`. Batch **R14**.
- **Frame:** 128x96, pivot [56, 90].
- **Clips (6):** `idle` 8 loop · `attack` 12 (label "Bite") · `breath` 12 (label "Fire breath") · `buffet` 10 (label "Wing buffet") · `hurt` 4 · `die` 12.
- **Parts:** **wings**: `wings` (large | small | tattered | none), `wingSpan`; **horns**: `horns` (swept | ram | crown | none), `hornLength`; **tail**: `tail` (spade | club | flame), `tailLength`.
- **Controls (9 + 6 in parts):** `size`, `length` (slider "Neck": Short / Long), `bulk` (slider: Lean / Heavy), `spines` (choice: none | ridge | sails), `body` (default crimson), `accent` (belly and wing skin: default wheat), `glow` (fire, eyes and throat: default fire), `bounce` (how deeply it breathes), `speed`.
- **Sounds:** `attack` frame 7 → `punch` style "Heavy body blow" · `breath` frame 1 → `wyrm-roar` style "Fire breath" · `buffet` frame 4 → `whoosh` style "Heavy swing" · `hurt` frame 0 → `punch` style "Heavy body blow", volume 0.9 · `die` frame 0 → `wyrm-roar` style "Distant growl" · `die` frame 8 → `monster-fade` style "Big beast falls".
- **Look and motion:** The boss: a long-necked dragon facing right, crouched on four legs, about two tiles tall at the shoulder, wings half open behind, tail curling up at the left. Body painted as one `g.blob`; belly plates in the accent colour. Idle: the chest swells, smoke curls from the nostrils, the tail tip sways. `breath`: the neck pulls back and the throat glows for four frames (the warning), then a cone of flame in three tones pours right for five frames, drawn after the outline. `buffet` beats both wings forward (with `wings: none` it rears and stamps both forelegs instead: the same timing and the same sound). It dies with the neck sinking to the ground and the glow going out.

#### `portraits-party` · Party portraits

- **Meta:** type `icon`, role `interface/icon`, view `front`, themes `fantasy`. Batch **R15**. (Not `characters/player`: that role would make the playground move the portrait about as the player.)
- **Frame:** 48x48, pivot [24, 24].
- **Clips (12):** `hero-neutral` 1 · `hero-happy` 1 · `hero-hurt` 1 · `hero-talk` 4 loop · `mage-neutral` 1 · `mage-happy` 1 · `mage-hurt` 1 · `mage-talk` 4 loop · `rogue-neutral` 1 · `rogue-happy` 1 · `rogue-hurt` 1 · `rogue-talk` 4 loop.
- **Parts:** none.
- **Controls (7):** `frame` (choice of border: none | round | square), `backing` (colour behind the head: default panel; **when** `{ frame: ['round', 'square'] }`: with no border the portrait has no backing), `skin`, `hero` (the hero's colour: default hero), `mage` (default mage), `rogue` (default rogue), `size` (slider "Zoom": Head and shoulders / Face). No `speed`: the three `talk` clips have 4 frames and play at a fixed 8 fps (style guide, section 10).
- **Sounds:** none.
- **Look and motion:** Faces for dialogue boxes and the battle status row: the hero (helmet, plume), the mage (hat, beard) and the rogue (hood, scarf), each recognisably the same person as their sprite. Moods differ in brows and mouth, and in `hurt` a tilted head and one closed eye. `talk` opens and closes the mouth.

#### `portraits-village` · Villager portraits

- **Meta:** type `icon`, role `interface/icon`, view `front`, themes `fantasy`, `farm`. Batch **R15**.
- **Frame:** 48x48, pivot [24, 24].
- **Clips (12):** `elder-neutral` 1 · `elder-happy` 1 · `elder-worried` 1 · `merchant-neutral` 1 · `merchant-happy` 1 · `merchant-worried` 1 · `guard-neutral` 1 · `guard-happy` 1 · `guard-worried` 1 · `kid-neutral` 1 · `kid-happy` 1 · `kid-worried` 1.
- **Parts:** none.
- **Controls (8):** `frame` (choice: none | round | square), `backing` (default panel; **when** `{ frame: ['round', 'square'] }`), `skin`, `elder` (default cobble), `merchant` (default wheat), `guard` (default hero), `kid` (default roof), `size` (slider "Zoom").
- **Sounds:** none.
- **Look and motion:** Faces of the four townsfolk, built with the same face-drawing code as `portraits-party` (same batch), matching `village-elder`, `merchant`, `town-guard` and `farm-kid`.

### Map tilesets (top-down)

#### `tiles-meadow` · Meadow and paths

- **Meta:** type `tileset`, role `world/tile`, view `top-down`, themes `fantasy`, `forest`, `farm`. Batch **R04**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (29):** `grass-fill`, `-fill-b`, `-fill-c` 1 each · the block `path-*` with its seven narrow pieces and three fills (22 clips: a path is often one tile wide) · `grass-deco-a` 1 · `grass-deco-b` 1 · `grass-deco-c` 1 · `grass-deco-d` 1.
- **Parts:** none.
- **Controls (7):** `grass` (default meadow), `path` (default path), `flowers` (colour of the flower decal: default roof), `edge` (how far the path's ragged border reaches: 3 to 7 px), `texture` (how many grass blades and path specks), `stones` (toggle: pebbles along the path edges), `wear` (ruts and bare patches in the path).
- **Sounds:** none.
- **Look and motion:** **The first top-down tileset: it sets the conventions for the others.** `grass-fill` is the base of the whole map: one flat green with a few two-tone blade marks. The path block lies over it: sandy fill, with a soft irregular border in the path's `deep` tone (no ink: you can walk on both). Decals: a tuft, a flower patch, pebbles, a clump of tall grass.

#### `tiles-shore` · Water and shore

- **Meta:** type `tileset`, role `world/tile`, view `top-down`, themes `fantasy`, `forest`. Batch **R10**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (29):** the block `water-*` with its seven narrow pieces and six fills (25 clips, 8 frames each, loop: `water-fill` is still water and `-fill-b` to `-fill-f` carry the ripples and glints) · `bridge-h` 1 · `bridge-v` 1 · `water-deco-a` 8 loop · `water-deco-b` 1.
- **Parts:** none.
- **Controls (8):** `water` (default water), `foam` (default cream), `land` (the bank: default path), `wood` (the bridge: default wood), `edge` (the width of the bank), `waves` (slider: Calm / Choppy), `sparkle`, `speed`.
- **Sounds:** none.
- **Look and motion:** Ponds, rivers and coast as a "hole" block. `water-fill` is deep, still water, kept bare because it lands in four cells in ten; five more versions of it carry the slow light streaks, mixed in by position so a lake shows no grid. The north edge (`water-top` and the top corners) shows a bank 6 to 10 px high dropping into the water with a foam line that pulses in and out; the south edge is a thin lip. Edges are inked: water blocks the way. `bridge-h` and `bridge-v` are plank bridges that repeat along their length. Decals: a lily pad that bobs, a rock.

#### `tiles-village` · Village ground and walls

- **Meta:** type `tileset`, role `world/tile`, view `top-down`, themes `fantasy`, `farm`. Batch **R08**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (48):** the block `cobble-*` with its seven narrow pieces and three fills (22 clips) · `plank-fill`, `-fill-b`, `-fill-c` 1 each · the block `wall-*` with its seven narrow pieces (20 clips) · `fence-h` 1 · `fence-v` 1 · `fence-post` 1.
- **Parts:** none.
- **Controls (7):** `stone` (cobbles and walls: default cobble), `wood` (floors and fences: default wood), `growth` (moss between stones: default leaf), `style` (choice of cobbles: round | square | herringbone), `edge`, `texture`, `wear`.
- **Sounds:** none.
- **Look and motion:** A village square and garden walls. The cobble block lies over grass with a border of half-buried stones. `plank-fill` is an indoor wooden floor, boards running left to right with joints staggered so they repeat every 32 px. The wall block is a low stone wall seen from the south: lit cap, and the bottom row is its face with a 2 px shadow on the ground. Fences: a rail piece that repeats sideways, one that repeats up and down, and a post for corners and ends.

#### `tiles-dungeon` · Dungeon tiles

- **Meta:** type `tileset`, role `world/tile`, view `top-down`, themes `fantasy`, `dungeon`. Batch **R09**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (48):** `floor-fill`, `-fill-b`, `-fill-c` 1 each · the block `wall-*` with its seven narrow pieces (20 clips) · the block `pit-*` with its seven narrow pieces (20 clips) · `stairs-down` 1 · `stairs-up` 1 · `floor-deco-a` 1 · `floor-deco-b` 1 · `floor-deco-c` 1.
- **Parts:** none.
- **Controls (8):** `stone` (walls: default slate), `floor` (colour: default flagstone), `growth` (slime and moss: default leaf), `style` (choice: slabs | bricks | cobbles), `edge`, `texture`, `wear`, `damp` (toggle: wet highlights and a puddle decal).
- **Sounds:** none.
- **Look and motion:** Rooms and corridors under the ground. `floor-fill` is large flagstones with dark joints. The wall block: a dark cap with a lighter rim, and a brick face one tile high on the bottom row, ending in a base line and floor shadow. The pit block: black depth, an inner wall showing on the north edge. Stairs fill one tile: steps getting darker going down, lighter going up. Decals: cracks, scattered bones, an iron grate.

### Map props (top-down, three-quarter view)

#### `tree-oak` · Oak tree

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `fantasy`, `forest`. Batch **R04**.
- **Frame:** 64x80, pivot [32, 76].
- **Clips (3):** `idle` 1 · `sway` 8 loop · `shake` 6.
- **Parts:** **fruit**: `fruit` (none | apples | blossom), `fruitColour` (default roof).
- **Controls (7 + 2 in parts):** `size`, `shape` (choice of canopy: round | wide | layered), `thickness` (the trunk), `leaf` (default leaf), `wood` (default wood), `sway`, `speed`.
- **Sounds:** `shake` frame 0 → `footstep-grass` style "Tall grass", volume 0.6.
- **Look and motion:** A broad tree: a short trunk with root flares at the pivot and a canopy of three or four overlapping leaf masses painted as one blob, light at the top right, about 56 px wide. `sway` moves the canopy masses 1 to 2 px out of step; `shake` rustles it hard and drops four leaves.

#### `tree-pine` · Pine tree

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `fantasy`, `forest`. Batch **R04**.
- **Frame:** 48x80, pivot [24, 76].
- **Clips (3):** `idle` 1 · `sway` 8 loop · `shake` 6.
- **Parts:** none.
- **Controls (8):** `size`, `shape` (choice of height: short | medium | tall: three, four or five tiers), `width`, `snowy` (toggle: snow on every tier), `leaf` (default pine), `wood` (default wood), `sway`, `speed`.
- **Sounds:** `shake` frame 0 → `footstep-grass` style "Tall grass", volume 0.6.
- **Look and motion:** A pointed fir: stacked tiers with jagged lower edges, each tier shading the one below. The tip sways most.

#### `boulder` · Boulder

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `fantasy`. Batch **R09**.
- **Frame:** 48x48, pivot [24, 44].
- **Clips (3):** `idle` 1 · `hurt` 4 · `break` 8.
- **Parts:** none.
- **Controls (8):** `size`, `shape` (choice: round | slab | cluster), `mossy` (toggle), `wear` (cracks), `pieces`, `stone` (default cobble), `accent` (the moss: default leaf; **when** `{ mossy: [true] }`), `speed`.
- **Sounds:** `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `break` frame 0 → `stone-door` style "Secret wall", volume 0.7.
- **Look and motion:** A rock that blocks a path until it is broken. Three or four flat planes, lit from the top right. `break` splits it along its cracks into chunks that tumble and fade.

#### `cottage` · Cottage

- **Meta:** type `prop`, role `world/building`, view `top-down`, themes `fantasy`, `farm`. Batch **R11**.
- **Frame:** 96x96, pivot [48, 92].
- **Clips (3):** `closed` 1 · `open` 6 · `lit` 8 loop (label "Night").
- **Parts:** none.
- **Controls (9):** `width`, `roof` (choice: thatch | tile | slate: changes the roof's outline and texture), `chimney` (toggle: a chimney, with smoke in `lit`), `windows` (choice: one | two), `wall` (colour: default cream), `roofColour` (default wheat), `wood` (beams and door: default wood), `glow` (window light: default thunder), `speed`.
- **Sounds:** `open` frame 0 → `door-creak` style "Wooden door", volume 0.8.
- **Look and motion:** A small house seen from the south: the roof takes the top half, the front wall with a door and windows the bottom half. Timber beams frame the plaster. `open` swings the door in to show a dark doorway. `lit`: the windows glow and smoke puffs rise and loop.

#### `inn` · Inn

- **Meta:** type `prop`, role `world/building`, view `top-down`, themes `fantasy`, `farm`. Batch **R11**.
- **Frame:** 128x96, pivot [64, 92].
- **Clips (3):** `closed` 1 · `open` 6 · `lit` 8 loop (label "Night").
- **Parts:** **sign**: `sign` (mug | bed | moon | none), `signColour` (default gold).
- **Controls (8 + 2 in parts):** `width`, `roof` (choice: thatch | tile | slate), `chimney` (toggle), `wall` (default cream), `roofColour` (default roof), `wood` (default wood), `glow` (default thunder), `speed`.
- **Sounds:** `open` frame 0 → `door-creak` style "Wooden door", volume 0.8.
- **Look and motion:** The biggest building in the village: two storeys, a wide double door, a row of upstairs windows and a hanging picture sign on a bracket by the door (it swings in `lit`). Built the same way as `cottage`, in the same batch, so the two match.

#### `market-stall` · Market stall

- **Meta:** type `prop`, role `world/building`, view `top-down`, themes `fantasy`, `farm`. Batch **R08**.
- **Frame:** 64x64, pivot [32, 60].
- **Clips (2):** `idle` 1 · `flap` 8 loop.
- **Parts:** none.
- **Controls (8):** `style` (choice of awning: striped | plain | scalloped), `shape` (choice of goods on the counter: fruit | potions | weapons | bread), `width`, `cloth` (default roof), `accent` (the stripes of the striped awning, and the edging band of the plain and scalloped ones, so it shows with every `style`: default cream), `wood` (default wood), `sway`, `speed`.
- **Sounds:** none.
- **Look and motion:** A wooden counter under a cloth awning on four poles; goods laid out on the counter. `flap` ripples the awning's front edge. `merchant` stands behind it.

#### `chest-topdown` · Chest (top-down)

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `fantasy`. Batch **R09**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (3):** `closed` 8 loop · `open` 8 · `empty` 1.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: wooden | iron | royal), `lid` (slider: Flat / Domed), `gems` (toggle), `wood` (default wood), `metal` (default gold), `glow` (default gold), `speed`.
- **Sounds:** `open` frame 0 → `chest-open` style "Treasure chest", volume 0.8.
- **Look and motion:** The platformer kit's `treasure-chest` seen from above and in front: the lid's top takes the upper 40%, the front face with the lock the rest. Same controls, colours and timing as that sprite; read it first.

#### `dungeon-door` · Dungeon door

- **Meta:** type `prop`, role `world/door`, view `top-down`, themes `fantasy`, `dungeon`. Batch **R09**.
- **Frame:** 32x48, pivot [16, 46].
- **Clips (4):** `closed` 1 · `open` 6 · `locked` 4 · `sealed` 8 loop.
- **Parts:** none.
- **Controls (8):** `style` (choice: wood | iron | stone), `corner` (slider "Arch": Square / Round top), `bars` (toggle), `body` (the door: default wood), `metal` (bands and studs, which every style has, and the bars: default steel), `stone` (the frame: default slate), `glow` (the seal, seen in `sealed`: default mage), `speed`.
- **Sounds:** `open` frame 0 → `stone-door` style "Dungeon door", volume 0.8 · `locked` frame 0 → `error-buzz` style "Soft no", volume 0.6.
- **Look and motion:** A door set in a wall face: one tile wide, one and a half tall so it overlaps the wall cap above. `open` slides it up into the wall. `sealed`: a glowing rune circle turns slowly over it.

#### `save-crystal` · Save crystal

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `fantasy`. Batch **R10**.
- **Frame:** 32x48, pivot [16, 46].
- **Clips (2):** `idle` 8 loop (label "Glow") · `activate` 8.
- **Parts:** **pedestal**: `pedestal` (stone | roots | none), `pedestalSize`, `pedestalColour` (default cobble).
- **Controls (8 + 3 in parts):** `size`, `shape` (choice of cut: shard | prism | orb | star), `rings` (toggle: a thin ring orbits the crystal), `body` (the crystal: default magic), `glow` (default cream), `bob`, `flicker` (how strongly it pulses), `speed`.
- **Sounds:** `activate` frame 1 → `save-chime` style "Save point", volume 0.8.
- **Look and motion:** A crystal floating 3 px above a low pedestal, turning slowly so a glint crosses its faces. `activate`: it flashes white, two rings of light rise from under it and fade, and it settles. The crystal itself is in every frame, so nothing is empty with `pedestal: none`.

### Icons

#### `icons-consumables` · Consumable icons

- **Meta:** type `icon`, role `items/icon`, view `none`, themes `fantasy`. Batch **R16**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (8):** `potion` 1 · `mana-flask` 1 · `antidote` 1 · `bread` 1 · `herb` 1 · `revive-candle` 1 · `bomb` 1 · `tent` 1.
- **Parts:** none.
- **Controls (7):** `shade` (toggle: a second shadow tone), `shine`, `tilt` (toggle: tilted or upright), `size`, `body` (health things: default crimson), `accent` (mana things: default hero), `cloth` (bread, tent and candle wax: default wheat).
- **Sounds:** none.
- **Look and motion:** Things used from the item menu. Each has its own outline: round bottle, tall flask, small square vial, loaf, leaf sprig, a lit candle stub in a dish (the revive item: not a feather, which belongs to a famous series), round bomb with a fuse, triangular tent.

#### `icons-gear` · Equipment icons

- **Meta:** type `icon`, role `items/weapon`, view `none`, themes `fantasy`. Batch **R17**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (9):** `sword` 1 · `staff` 1 · `dagger` 1 · `bow` 1 · `shield` 1 · `helm` 1 · `armour` 1 · `ring` 1 · `boots` 1.
- **Parts:** none.
- **Controls (8):** `shade` (toggle), `shine`, `tilt` (toggle), `size`, `metal` (default steel), `wood` (default wood), `leather` (colour: default bandit), `accent` (jewels: default magic).
- **Sounds:** none.
- **Look and motion:** Things worn or wielded. Weapons lie on the same diagonal, handle at the bottom left. The sword, staff and dagger match the weapons the party sprites hold.

#### `icons-key-items` · Key item icons

- **Meta:** type `icon`, role `items/key`, view `none`, themes `fantasy`. Batch **R16**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (6):** `key` 1 · `map` 1 · `letter` 1 · `crystal-shard` 1 · `coin-pouch` 1 · `lantern` 1.
- **Parts:** none.
- **Controls (7):** `shade` (toggle), `shine`, `tilt` (toggle), `size`, `metal` (default gold), `paper` (colour: default cream), `accent` (crystal, seal and flame: default magic).
- **Sounds:** none.
- **Look and motion:** Story items. A big key, a rolled map, a sealed letter, a crystal shard (the save crystal's colour), a pouch, a lantern.

### Battle effects (side view, played over the target)

#### `fx-slash` · Slash

- **Meta:** type `effect`, role `effects/spark`, view `side`, themes `fantasy`. Batch **R18**.
- **Frame:** 64x64, pivot [32, 32], `grounded: false`.
- **Clips (2):** `burst` 6 · `cross` 8 (label "Cross slash").
- **Parts:** none.
- **Controls (8):** `size`, `length` (slider "Curve": Straight / Curved), `thickness`, `style` (choice: clean | jagged | claw: claw is three parallel cuts), `sparks` (toggle), `core` (default cream), `edge` (default steel), `speed`.
- **Sounds:** `burst` frame 1 → `sword-slash` style "Quick dagger", volume 0.7 · `cross` frame 1 and 4 → `sword-slash` style "Quick dagger", volume 0.7.
- **Look and motion:** The mark of a weapon hit. `burst`: one crescent sweeps from the top right to the bottom left in two frames, white inside with a coloured rim, then thins from the tail end and is gone. `cross` adds a second crescent the other way on frame 4.

#### `fx-fire-spell` · Fire spell

- **Meta:** type `effect`, role `effects/magic`, view `side`, themes `fantasy`. Batch **R18**.
- **Frame:** 64x64, pivot [32, 58].
- **Clips (2):** `burst` 10 · `cast` 8.
- **Parts:** none.
- **Controls (9):** `size`, `height`, `pieces` (the number of flame tongues), `style` (choice: pillar | ball | ring), `sparks` (toggle: embers), `core` (default thunder), `edge` (default fire), `flicker`, `speed`.
- **Sounds:** `cast` frame 1 → `magic-spell` style "Quick zap", volume 0.8 · `burst` frame 1 → `wyrm-roar` style "Fire breath", volume 0.8.
- **Look and motion:** `burst` is for the target: a column of fire erupts from the ground line, holds for three frames with licking tongues, and falls into rising embers. `cast` is small, for the caster's hand: sparks gather into a flame. Three tones, white-yellow core. (`burst` is listed first so the ground-line check runs on it.)

#### `fx-ice-spell` · Ice spell

- **Meta:** type `effect`, role `effects/magic`, view `side`, themes `fantasy`. Batch **R18**.
- **Frame:** 64x64, pivot [32, 58].
- **Clips (2):** `burst` 10 · `cast` 8.
- **Parts:** none.
- **Controls (8):** `size`, `height`, `pieces` (the number of spikes: 3 to 7), `style` (choice: spikes | crystal | snowflake), `mist` (toggle: a low frost cloud), `core` (default cream), `edge` (default ice), `speed`.
- **Sounds:** `burst` frame 2 → `ice-shatter` style "Ice spell", volume 0.85 · `cast` frame 1 → `magic-spell` style "Quick zap", volume 0.8.
- **Look and motion:** `cast` (the second clip): frost motes spiral inward. `burst`: sharp ice spikes jut up from the ground on frames 0 to 3, hold with a glint on 4 to 5, and shatter into shards that fly outward on 6 to 9. Hard highlight bands: ice is glossy.

#### `fx-thunder-spell` · Thunder spell

- **Meta:** type `effect`, role `effects/magic`, view `side`, themes `fantasy`. Batch **R18**.
- **Frame:** 64x96, pivot [32, 90].
- **Clips (1):** `burst` 8.
- **Parts:** none.
- **Controls (8):** `width`, `pieces` (the number of forks), `wobble` (slider "Zigzag": Smooth / Jagged), `style` (choice: bolt | chain | pillar), `sparks` (toggle: sparks on the ground), `core` (default cream), `edge` (default thunder), `speed`.
- **Sounds:** `burst` frame 1 → `thunder-crack` style "Thunder spell".
- **Look and motion:** A bolt from row 1 at the top of the frame to the ground line. Frame 0 a thin leader; frame 1 the full bolt in white, three pixels thick; frame 2 the bolt in colour with forks; frame 3 a second, thinner flicker; frames 4 to 7 sparks skitter along the ground and die.

#### `fx-heal` · Heal

- **Meta:** type `effect`, role `effects/magic`, view `side`, themes `fantasy`. Batch **R18**.
- **Frame:** 64x64, pivot [32, 58].
- **Clips (2):** `burst` 10 · `loop` 8 loop (label "Regenerate").
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (the number of rising motes), `rise` (slider: how high they go), `style` (choice of mote: plus | leaf | star | heart), `rings` (toggle: a ring of light on the ground), `core` (default cream), `edge` (default heal), `speed`.
- **Sounds:** `burst` frame 0 → `heal-shimmer` style "Heal", volume 0.8.
- **Look and motion:** Gentle, upward, soft-edged: the opposite of the attack spells. A ring opens on the ground, motes rise in a loose column, each fading at a different height. `loop` is a slow version for a lasting effect.

### Battle backdrops

#### `bg-battle-field` · Field battle backdrop

- **Meta:** type `background`, role `environment/background`, view `side`, themes `fantasy`, `forest`. Batch **R19**.
- **Frame:** 320x180, pivot [160, 180].
- **Clips (3):** `far` 1 · `mid` 1 · `near` 1.
- **Parts:** none.
- **Controls (8):** `sky` (default sky), `land` (the grass: default meadow), `path` (the bare ground of the arena: default path), `time` (choice: day | dusk | night), `clouds`, `height` (the hills), `density` (the trees), `haze`.
- **Sounds:** none.
- **Look and motion:** `far`: sky and soft hills. `mid`: a line of round trees and a rail fence. `near`: **the ground the fighters stand on**, opaque from row 132 to the bottom: a grass edge, then a band of worn earth. Fighters' feet go on row 150.

#### `bg-battle-dungeon` · Dungeon battle backdrop

- **Meta:** type `background`, role `environment/background`, view `side`, themes `fantasy`, `dungeon`. Batch **R19**.
- **Frame:** 320x180, pivot [160, 180].
- **Clips (3):** `far` 1 · `mid` 8 loop · `near` 1.
- **Parts:** none.
- **Controls (8):** `stone` (default slate), `floor` (colour: default flagstone), `glow` (torch light: default fire), `torches` (slider: Few / Many), `height` (the arches), `density` (the pillars), `haze`, `speed`.
- **Sounds:** `mid` frame 0 → `fire` style "Torch", volume 0.35.
- **Look and motion:** `far`: a dark wall of arches fading into black-blue. `mid`: evenly spaced pillars with a torch on every second one; the flames flicker (8 frames) and each lights a soft-edged patch of wall. `near`: a flagstone floor, opaque from row 132 down. The floor's tile pattern matches `tiles-dungeon`.

### Interface

#### `ui-dialogue` · Dialogue box

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `fantasy`, `neutral`. Batch **R20**.
- **Frame:** 96x48, pivot [48, 24].
- **Clips (4):** `box` 1 · `name-tag` 1 · `choice` 1 · `next` 8 loop.
- **Parts:** none.
- **Controls (8):** `style` (choice: plain | ornate | scroll), `corner`, `border`, `shadow` (toggle: a 2 px drop shadow), `face` (default panel), `frame` (default cream), `accent` (arrow and highlight: default gold), `speed`.
- **Sounds:** none.
- **Look and motion:** `box`: the speech box, nine-slice with an 8 px border. `name-tag`: a small tab for the speaker's name. `choice`: a box with one highlighted row. `next`: a small arrow that bobs 2 px, shown when there is more text.

#### `ui-battle-menu` · Battle menu

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `fantasy`, `neutral`. Batch **R20**.
- **Frame:** 96x64, pivot [48, 32].
- **Clips (4):** `panel` 1 · `row` 1 · `cursor` 8 loop · `turn-marker` 8 loop.
- **Parts:** none.
- **Controls (7):** `style` (choice: plain | ornate | scroll), `corner`, `border`, `face` (default panel), `frame` (default cream), `accent` (default gold), `speed`.
- **Sounds:** none.
- **Look and motion:** The command list (Attack, Magic, Item, Defend: the words are the game's). `panel` matches `ui-dialogue`. `row` is the highlight bar behind the chosen command. `cursor` is a small diamond-headed arrow that slides 2 px left and right (not a pointing gloved hand: style guide, section 13); it exports a `tip` socket at its point. `turn-marker` is a small triangle that bounces over whoever acts next.

#### `ui-bars-rpg` · Health and magic bars

- **Meta:** type `ui`, role `interface/bar`, view `none`, themes `fantasy`, `neutral`. Batch **R20**.
- **Frame:** 64x16, pivot [32, 8].
- **Clips (5):** `frame` 1 · `fill` 1 · `fill-b` 1 · `fill-c` 1 · `flash` 4.
- **Parts:** none.
- **Controls (8):** `style` (choice: solid | segmented | ornate), `corner`, `border`, `shine`, `frame` (the housing: default cream), `fill` (health: default heal), `fillB` (magic: default hero), `fillC` (the turn or limit gauge: default gold). No `speed`: `flash` has 4 frames and plays at a fixed 8 fps (style guide, section 10).
- **Sounds:** none.
- **Look and motion:** Bars for the battle status row, as the style guide, section 8. `fill` is health, `fill-b` magic, `fill-c` a third gauge.

#### `ui-status-icons` · Status marks

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `fantasy`, `neutral`. Batch **R17**.
- **Frame:** 16x16, pivot [8, 8].
- **Clips (10):** `poison` 1 · `sleep` 1 · `stun` 1 · `burn` 1 · `freeze` 1 · `attack-up` 1 · `defence-up` 1 · `attack-down` 1 · `defence-down` 1 · `haste` 1.
- **Parts:** none.
- **Controls (6):** `backing` (choice: none | round | square), `bold` (toggle: thicker glyphs), `shine`, `face` (the plate: default panel; **when** `{ backing: ['round', 'square'] }`), `good` (colour of buffs: default heal), `bad` (colour of ailments: default mage).
- **Sounds:** none.
- **Look and motion:** Tiny marks shown beside a fighter. A drop, "z z", a ring of stars, a flame, a snowflake, a blade or a shield with an arrow up or down, a winged boot. Each must read at 14 px by outline alone.

#### `ui-damage-digits` · Damage numbers

- **Meta:** type `ui`, role `interface/icon`, view `none`, themes `fantasy`, `neutral`. Batch **R20**.
- **Frame:** 16x16, pivot [8, 8].
- **Clips (14):** `digit-0` 1 · `digit-1` 1 · `digit-2` 1 · `digit-3` 1 · `digit-4` 1 · `digit-5` 1 · `digit-6` 1 · `digit-7` 1 · `digit-8` 1 · `digit-9` 1 · `plus` 1 · `minus` 1 · `crit` 1 · `miss` 1.
- **Parts:** none.
- **Controls (6):** `style` (choice: chunky | slim | rounded), `slant` (toggle: leaning digits), `shadow` (toggle), `size`, `body` (default cream), `edge` (the rim inside the ink outline: default fire).
- **Sounds:** none.
- **Look and motion:** Digits a game strings together into pop-up numbers (it tints them: red for damage, green for healing). Thick, inked, 10 px wide so numbers stay readable over a busy battle. `crit` is a starburst; `miss` must read as a dodge at 1x: a swoosh with motion lines, or the word itself (style guide, section 8). Digit sizes come from the interface helper, and every digit differs from every other by more than 2 body pixels.

## Sound effects

Exactly 20. New sounds follow `.claude/skills/sprite-forge/SOUND.md` and the style guide, section 11. The style names are fixed: sprites cue them by name. Every new sound also has `meta.themes` and `meta.gameTypes` chosen by the style guide, section 13.

| # | id | Name | type | role | Batch | Pairs with |
|---|---|---|---|---|---|---|
| 1 | `sword-slash` | Sword slash | sfx | actions/swing | reused (existing) | `knight` `attack`; `fx-slash`; `hero-walker` `attack_*` |
| 2 | `punch` | Punch | sfx | actions/hit | reused (existing) | every `hurt`; monster attacks landing |
| 3 | `magic-spell` | Magic spell | sfx | actions/cast | reused (existing) | `wizard` and `mage-walker` `cast`; the `cast` clip of each spell effect; `thicket-imp` `cast` |
| 4 | `coin-pickup` | Coin pickup | sfx | items/pickup | reused (existing) | gold gained after a battle; buying and selling; `road-bandit` `steal` |
| 5 | `fire` | Campfire | ambience | environment/ambience | reused (existing) | `campfire` `burn`; `bg-battle-dungeon` torches |
| 6 | `error-buzz` | Error buzz | sfx | interface/error | reused (existing) | not enough magic, wrong target, a locked `dungeon-door` |
| 7 | `chest-open` | Chest opening | sfx | world/chest | reused (made in kit-platformer-fantasy) | `chest-topdown` `open` |
| 8 | `door-creak` | Door creak | sfx | world/door | reused (made in kit-platformer-fantasy) | `cottage` and `inn` `open` |
| 9 | `footstep-grass` | Footstep on grass | sfx | characters/footstep | R01 | every `walk_*` and `run_*` of the map characters, frames 0 and 4; `tree-oak` and `tree-pine` `shake`. |
| 10 | `text-blip` | Text blip | sfx | interface/click | R01 | `ui-dialogue`: the game plays it once per letter or per word. |
| 11 | `menu-move` | Menu move | sfx | interface/hover | R01 | `ui-battle-menu` `cursor` moving; every menu. |
| 12 | `menu-confirm` | Menu confirm | sfx | interface/confirm | R01 | a command chosen in `ui-battle-menu`; a `ui-dialogue` choice. |
| 13 | `save-chime` | Save chime | jingle | interface/reward | R01 | `save-crystal` `activate` frame 1; a level gained; a key item found. |
| 14 | `stone-door` | Stone door | sfx | world/door | R01 | `dungeon-door` `open`; `boulder` `break`. |
| 15 | `ice-shatter` | Ice shatter | sfx | effects/magic | R02 | `fx-ice-spell` `burst` frame 2 (the crack then lands on frame 6). |
| 16 | `thunder-crack` | Thunder crack | sfx | effects/magic | R02 | `fx-thunder-spell` `burst` frame 1. |
| 17 | `heal-shimmer` | Heal shimmer | sfx | effects/magic | R02 | `fx-heal` `burst` frame 0. |
| 18 | `monster-fade` | Monster defeated | sfx | characters/death | R02 | `die` frame 0 of `road-bandit`, `bone-soldier`, `thicket-imp`; `ember-wyrm` `die` frame 8. |
| 19 | `wyrm-roar` | Wyrm roar | sfx | characters/voice | R02 | `ember-wyrm` `breath` frame 1 and `die` frame 0; `fx-fire-spell` `burst`. |
| 20 | `victory-fanfare` | Victory fanfare | jingle | music/victory | R02 | the end of a battle, with the fighters' `victory` clips; the battle music stops first. **Redesigned after review: a patch built from the earlier brass fanfare is rebuilt to the text below.** |

#### `footstep-grass` · Footstep on grass

- **Meta:** type `sfx`, role `characters/footstep`. Batch **R01**.
- **Length:** 0.10 to 0.18 s.
- **What makes the sound, and how it moves:** A soft step. A brush of grass (`dust` at 800 to 1500 per second through a band-pass at 2 to 5 kHz, 60 ms) over a faint low thump. Softer attack than gravel, no crunch. Varies from take to take.
- **Controls (5):** `weight`, `length`, `bright`, `grit` (slider "Rustle": how much grass), `wet` (slider "Damp": a small squelch).
- **Styles:** "Grass", "Tall grass", "Dirt path". "Tall grass" is mostly rustle (also used for shaken trees); "Dirt path" is mostly thump.
- **Pairs with:** every `walk_*` and `run_*` of the map characters, frames 0 and 4; `tree-oak` and `tree-pine` `shake`.

#### `text-blip` · Text blip

- **Meta:** type `sfx`, role `interface/click`. Batch **R01**.
- **Length:** 0.03 to 0.06 s.
- **What makes the sound, and how it moves:** One letter of dialogue appearing. A single short triangle-wave note with a soft start, its pitch chosen at random within a narrow range each time so a line of text sounds like a voice murmuring.
- **Controls (5):** `pitch`, `spread` (slider "Sing-song": how far the pitch wanders), `length`, `bright`, `soft` (slider "Softness": the attack).
- **Styles:** "Narrator", "Small voice", "Deep voice".
- **Pairs with:** `ui-dialogue`: the game plays it once per letter or per word.

#### `menu-move` · Menu move

- **Meta:** type `sfx`, role `interface/hover`. Batch **R01**.
- **Length:** 0.03 to 0.05 s.
- **What makes the sound, and how it moves:** The cursor stepping to the next row. A tiny dry tick: a very short sine blip with a wooden knock (`modal`, low, 20 ms). Quiet, never tiring. Identical every time.
- **Controls (4):** `pitch`, `length`, `bright`, `snap`.
- **Styles:** "Cursor", "Page turn", "Tab". "Page turn" adds a brush of noise.
- **Pairs with:** `ui-battle-menu` `cursor` moving; every menu.

#### `menu-confirm` · Menu confirm

- **Meta:** type `sfx`, role `interface/confirm`. Batch **R01**.
- **Length:** 0.15 to 0.25 s.
- **What makes the sound, and how it moves:** Choosing a command. Two soft bell notes a fifth apart, the second higher (sine and triangle with a short `modal` shimmer). Warm, round, identical every time.
- **Controls (5):** `pitch`, `spread` (slider "Interval"), `speed`, `ring`, `bright`.
- **Styles:** "Confirm", "Big confirm", "Soft tick".
- **Pairs with:** a command chosen in `ui-battle-menu`; a `ui-dialogue` choice.

#### `save-chime` · Save chime

- **Meta:** type `jingle`, role `interface/reward`; the patch says `"category": "jingle"`. Batch **R01**.
- **Length:** 1.2 to 1.8 s.
- **What makes the sound, and how it moves:** The game is saved. Four rising bell notes of a major chord with an added ninth, each a glassy `modal` bell, in a long shimmering room; the last note is held. A tune: identical every time.
- **Controls (6):** `pitch`, `notes` (how many notes: 3 to 5), `speed`, `ring`, `shimmer` (slider: Plain / Shimmering), `space`. Brightness: `shimmer` (this sound has no `bright`).
- **Styles:** "Save point", "Level up", "Item found". "Save point" is four notes; "Level up" is faster and brighter with a fifth note; "Item found" is three notes (all through `notes`).
- **Pairs with:** `save-crystal` `activate` frame 1; a level gained; a key item found.

#### `stone-door` · Stone door

- **Meta:** type `sfx`, role `world/door`. Batch **R01**.
- **Length:** 0.8 to 1.4 s.
- **What makes the sound, and how it moves:** A heavy slab grinding open. Brown noise through a low band-pass (150 to 400 Hz) with a slow rumbling tremor, steady for most of the length, ending in one deep thud and a little room echo. Needs a gritty mid-range scrape on top so it is heard on a phone.
- **Controls (5):** `length`, `weight`, `grit` (slider "Grind"), `thump` (the final thud), `space`. Brightness: `grit` (this sound has no `bright`).
- **Styles:** "Dungeon door", "Sealed gate", "Secret wall". "Secret wall" is short and ends in falling rubble (also used for breaking rock).
- **Pairs with:** `dungeon-door` `open`; `boulder` `break`.

#### `ice-shatter` · Ice shatter

- **Meta:** type `sfx`, role `effects/magic`. Batch **R02**.
- **Length:** 0.6 to 0.9 s.
- **What makes the sound, and how it moves:** Ice forms and breaks. First 0.25 s: a rising airy hiss with a climbing sine (the spikes growing). Then a hard crack and a spray of glass: many short high `modal` pings (3 to 8 kHz) set off by `dust`, thinning out. Brightest sound in the kit.
- **Controls (5):** `pitch`, `shards` (slider: Few / Many), `length`, `bright`, `space`.
- **Styles:** "Ice spell", "Frost nova", "Glass break". "Glass break" is the shortest and brightest, all shards (as built it keeps a short rising start: no listed control removes it).
- **Pairs with:** `fx-ice-spell` `burst` frame 2 (the crack then lands on frame 6).

#### `thunder-crack` · Thunder crack

- **Meta:** type `sfx`, role `effects/magic`. Batch **R02**.
- **Length:** 0.8 to 1.4 s.
- **What makes the sound, and how it moves:** Lightning strikes. An instant, clipped white-noise crack (5 ms), an electric buzz for the first 150 ms (a crushed saw at 60 to 120 Hz), then a rolling rumble (brown noise, cutoff falling from 600 Hz to 150 Hz, with a slow wobble in level) that fades in a room.
- **Controls (5):** `snap` (slider "Crack"), `rumble` (slider: Short / Long rumble), `length`, `bright`, `grit` (slider "Buzz").
- **Styles:** "Thunder spell", "Small spark", "Storm strike".
- **Pairs with:** `fx-thunder-spell` `burst` frame 1.

#### `heal-shimmer` · Heal shimmer

- **Meta:** type `sfx`, role `effects/magic`. Batch **R02**.
- **Length:** 0.8 to 1.2 s.
- **What makes the sound, and how it moves:** A gentle upward glow. A slow-starting soft pad, and over it a rising run of five or six sine bell notes of a major chord, each quieter and higher, with an airy shimmer. No hard start: this is the one sound allowed a slow attack (about 40 ms).
- **Controls (5):** `pitch`, `rise`, `sparkle` (slider: the bell notes), `length`, `space`. Brightness: `sparkle` (this sound has no `bright`).
- **Styles:** "Heal", "Revive", "Cure". "Revive" is longer and climbs two octaves; "Cure" is short, three notes.
- **Pairs with:** `fx-heal` `burst` frame 0.

#### `monster-fade` · Monster defeated

- **Meta:** type `sfx`, role `characters/death`. Batch **R02**.
- **Length:** 0.5 to 0.8 s.
- **What makes the sound, and how it moves:** A beaten monster dissolving. Noise through a band-pass that slides down, with a falling pair of detuned saw notes under it and a crumble of `dust` at the end. Falls in pitch from start to finish. Varies from take to take.
- **Controls (5):** `pitch`, `drop`, `length`, `grit` (at its top it turns the dissolve into a dry clatter of bones), `bright`.
- **Styles:** "Monster fades", "Bones collapse", "Big beast falls". "Bones collapse" is full `grit` with a small `drop`; "Big beast falls" is low, long and dull, with the largest `drop`.
- **Pairs with:** `die` frame 0 of `road-bandit`, `bone-soldier`, `thicket-imp`; `ember-wyrm` `die` frame 8.

#### `wyrm-roar` · Wyrm roar

- **Meta:** type `sfx`, role `characters/voice`. Batch **R02**.
- **Length:** 1.0 to 1.6 s.
- **What makes the sound, and how it moves:** A stylised dragon voice (synthesis cannot do a real animal: say so in the report). Two detuned saws at 70 to 110 Hz whose pitch rises and falls once, through a band-pass that sweeps 400 to 900 to 300 Hz like a mouth opening and closing, with a 30 Hz growl in the level and a breath of noise on top.
- **Controls (5):** `pitch`, `length`, `growl`, `breath` (slider "Fire": the noise layer), `bright`.
- **Styles:** "Wyrm roar", "Fire breath", "Distant growl". "Fire breath" is mostly rushing noise that swells and holds (also used for the fire spell).
- **Pairs with:** `ember-wyrm` `breath` frame 1 and `die` frame 0; `fx-fire-spell` `burst`.

#### `victory-fanfare` · Victory fanfare

- **Meta:** type `jingle`, role `music/victory`; the patch says `"category": "jingle"`, never `"music"` (style guide, section 11). Batch **R02**.
- **Length:** 2.0 to 2.8 s.
- **What makes the sound, and how it moves:** The battle is won. **A skipping dance tune for plucked strings and a wooden flute, with no brass, no drum roll and no repeated-note pick-up**: the best-known RPG victory tune is quick repeated notes rising to held brass chords, and this one must not be heard as it. Seven notes in three-time, in a long-short lilt: it starts on the high home note, falls by step to the fifth (three notes), dips to the third, leaps up a sixth and settles on the home note, where a soft `modal` bell an octave higher answers and rings. Under it only two plucked chords, the home chord on the first beat and again at the end (never a flat-six, flat-seven, home ending). Melody: `pluck` doubled by a breathy triangle "flute". Ends on the home note of A major (the battle music's key turned bright). An original tune: identical every time.
- **Controls (5):** `pitch` (the key), `speed`, `bright`, `ring` (how long the last note and its bell ring), `space`.
- **Styles:** "Victory", "Small win", "Grand finale".
- **Pairs with:** the end of a battle, with the fighters' `victory` clips; the battle music stops first.

## Music

Exactly 2. New tracks follow the Music section of `SOUND.md` and the style guide, section 12 (fixed control ids `intensity`, `bpm`, `key`, `bars`, `inst`, `bright`, `space`; lengths 8, 16, 24, 32 bars; the five melody instruments).

#### `hearthvale-village` · Village and fields theme

- **Role:** `music/exploration`. Batch **R21**. **Use:** The map: village, fields and roads. A style serves shops.
- **Tempo:** 92 bpm by default, range 80 to 108. **Key:** F major. **Mood:** Warm, gentle and homely: a walk through a village on a clear morning. Nothing urgent.
- **Chords (8 bars, one per bar):** F, C, Dm, Bb, F, Bb, C, F (I, V, vi, IV, I, IV, V, I).
- **Layers:** (1) Plucked strings (`pluck`) playing a rolling pattern of chord tones in 8th notes. (2) Pad: soft filtered saws with a slow attack holding the chord. (3) Bass: a round sine and triangle on beats 1 and 3. (4) Melody. (5) Percussion: a shaker (noise ticks on 8ths) and a soft hand drum on 2 and 4. (6) A high bell line answering the melody in bars 4 and 8.
- **Intensity:** 0 to 0.3: plucked strings and pad. 0.3 to 0.55: add bass and melody. 0.55 to 0.8: add shaker and hand drum. 0.8 to 1: add the bell line and double the melody an octave up.
- **Length:** 8, 16, 24 or 32 bars; default 16. Sections are added from the front: strings alone, then with bass and pad, then melody, then everything.
- **Melody instrument:** The five standard choices; default "Flute".
- **Other controls:** `lead` (melody level) and `swing` (slider "Lilt": straight to gently swung 8ths), 9 controls in all.
- **Styles:** "Quiet morning", "Market day", "Shop".
- **Melody:** A singing four-bar tune in long notes that rises a sixth and falls back by steps, then a second four bars that begin the same way and come home to F.

#### `hearthvale-battle` · Party battle theme

- **Role:** `music/battle`. Batch **R22**. **Use:** Every ordinary battle; a style serves the wyrm.
- **Tempo:** 152 bpm by default, range 140 to 172. **Key:** A minor (Dorian: F sharp in the melody and a D major chord). **Mood:** Heroic and urgent with a galloping rhythm: a fight the party expects to win. Clearly different from `battle-theme` (which is D minor, straight and darker).
- **Chords (8 bars, one per bar):** Am, Am, F, G, Am, C, D, E (i, i, VI, VII, i, III, IV, V).
- **Layers:** (1) Gallop bass: a saw and square on the pattern "X.xxX.xx" per half bar. (2) Drums: kick on every beat, snare on 2 and 4, hats on 8ths. (3) String-like ostinato: detuned saws running 16ths on chord tones, quiet. (4) Stabs: short brass-like chords on the off-beats of bars 4 and 8. (5) Melody. (6) Tom fills in the last half of bar 8.
- **Intensity:** 0 to 0.25: bass and ostinato (the calm of choosing a command). 0.25 to 0.5: add kick and hats. 0.5 to 0.75: add snare and stabs. 0.75 to 1: add the melody doubled an octave up, 16th hats and the tom fills.
- **Length:** 8, 16, 24 or 32 bars; default 8. Longer versions open with bass and ostinato, add drums, then stabs, then the full band.
- **Melody instrument:** The five standard choices; default "Synth lead", voiced bright and brassy.
- **Other controls:** `lead` (melody level) and `grit`, 9 controls in all.
- **Styles:** "Random encounter", "Tough fight", "Wyrm".
- **Melody:** A bold two-bar call that leaps up a fifth and marches down, answered two bars later a step higher; the second half climbs to the E chord and falls back to A.

## Batch plan

**A record of how the kit was built; every batch below is finished and passed review.** It is kept because the order shows which asset is the worked example for which (a later batch read the earlier one's report). A batch started when its helpers exist and every batch in its "Needs first" cell has passed review; batches of other kits (P.., S..) count too. **Order** is one more than the highest order among the batches it waits for. Sound batches come first because a sprite cannot cue a sound that does not exist. **R03 (the first top-down character) and R04 (the first top-down tileset) are pathfinders** (`"pathfinder": true` in the plan file) for this kit and the roguelite kit. This kit's boss, effects and backdrops wait for the platformer kit's pathfinders P08, P12 and P14. R09 and R11 cue two sounds made in the platformer kit (batch P02).

| Order | Batch | Kind | Assets | Needs first |
|---|---|---|---|---|
| 1 | **R01** | sounds | `footstep-grass`, `text-blip`, `menu-move`, `menu-confirm`, `save-chime`, `stone-door` | nothing |
| 1 | **R02** | sounds | `ice-shatter`, `thunder-crack`, `heal-shimmer`, `monster-fade`, `wyrm-roar`, `victory-fanfare` | nothing |
| 1 | **R16** | icons | `icons-consumables`, `icons-key-items` | palettes |
| 1 | **R17** | icons | `icons-gear`, `ui-status-icons` | palettes |
| 1 | **R20** | interface | `ui-dialogue`, `ui-battle-menu`, `ui-bars-rpg`, `ui-damage-digits` | palettes, ui-helper |
| 1 | **R21** | music | `hearthvale-village` | compose-kit |
| 1 | **R22** | music | `hearthvale-battle` | compose-kit |
| 2 | **R03** | character | `hero-walker` | palettes, topdown-rig, R01. **Pathfinder for top-down characters.** Sets the top-down character conventions for this kit and the roguelite kit; its report is read before R05 to R07 and S04 start. It may start before R01 passes and add its footstep cues last |
| 2 | **R04** | tileset and props | `tiles-meadow`, `tree-oak`, `tree-pine` | palettes, tile-helper, R01. **Pathfinder for top-down tilesets.** Sets the top-down tile conventions; its report is read before the other top-down tilesets start |
| 2 | **R11** | props | `cottage`, `inn` | palettes, P02 |
| 2 | **R13** | creatures | `bone-soldier`, `thicket-imp` | palettes, humanoid-poses, R02 |
| 3 | **R05** | characters | `mage-walker`, `rogue-walker` | palettes, topdown-rig, R01, R03, P00. After P00: `mage-walker` is the same person as `wizard`, whose parts P00 declares |
| 3 | **R06** | characters | `village-elder`, `merchant` | palettes, topdown-rig, R01, R03 |
| 3 | **R07** | characters | `town-guard`, `farm-kid` | palettes, topdown-rig, R01, R03 |
| 3 | **R08** | tileset and props | `tiles-village`, `market-stall` | palettes, tile-helper, R04 |
| 3 | **R09** | tileset and props | `tiles-dungeon`, `dungeon-door`, `chest-topdown`, `boulder` | palettes, tile-helper, R01, R04, P02, P09. After P09: `chest-topdown` is `treasure-chest` seen from above; read that sprite first |
| 3 | **R10** | tileset and props | `tiles-shore`, `save-crystal` | palettes, tile-helper, R01, R04 |
| 3 | **R14** | boss | `ember-wyrm` | palettes, R02, P08. After P08, the pathfinder for bosses |
| 3 | **R18** | effects | `fx-slash`, `fx-fire-spell`, `fx-ice-spell`, `fx-thunder-spell`, `fx-heal` | palettes, fx-helper, R02, P12. After P12, the pathfinder for effects |
| 4 | **R12** | characters | `rogue-battler`, `road-bandit` | palettes, humanoid-poses, R02, R05. After R05: `rogue-battler` is the same person as `rogue-walker` |
| 4 | **R19** | backgrounds | `bg-battle-field`, `bg-battle-dungeon` | palettes, backdrop-helper, R09, P14. After R09: the dungeon backdrop's floor matches `tiles-dungeon`. After P14, the pathfinder for backgrounds |
| 5 | **R15** | portraits | `portraits-party`, `portraits-village` | palettes, R03, R05, R06, R07, R12. After R05, R06, R07 and R12: a portrait copies the finished sprite of each person. The builder writes one face-drawing function and uses it in both files |

### Helpers this bundle waits on

| Helper | What it must do | Batches that wait |
|---|---|---|
| `palettes` | The three palettes as named colours and swatch lists (style guide, sections 3 and 14). | R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20 |
| `tile-helper` | Draws every piece of a block (the 13, the seven narrow pieces and the fill versions; top-down wall faces and holes included), thin pieces, slopes and decals so texture repeats and edges meet; renders a sample map. | R04, R08, R09, R10 |
| `topdown-rig` | The top-down body rig: three directions, the standard poses (`shoot` and `dodge` included), hooks in the right depth order, sockets with `muzzle`. | R03, R05, R06, R07 |
| `humanoid-poses` | Adds `die`, `block`, `victory`, `talk`, `shoot` and a thrust to the side-view rig. | R12, R13 |
| `fx-helper` | Shared particles, twinkles, rings, shards, smoke and effect colour steps. **Required**: every effect and projectile is built from it, so all effects share one look. | R18 |
| `ui-helper` | Nine-slice panel, button states, bar housing and fill. | R20 |
| `backdrop-helper` | Wrapping outlines and scatter for 320x180 layers; `recede()`. | R19 |
| `compose-kit` | The clock, section gates, five melody instruments and limiter every track shares. | R21, R22 |
