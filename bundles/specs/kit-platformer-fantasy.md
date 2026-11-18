# Thornwood Keep platformer kit: specification (`kit-platformer-fantasy`)

Written 2026-11-18 by the art director (task W3-S); revised the same day after the independent review (clip order of props with states, `when` on controls and cues, named palette colours, originality, batch order). It goes with `kit-platformer-fantasy.plan.json`; the two always agree. **Read `docs/style-guide.md` first**: it fixes frame sizes, clip names, frame counts, cue frames, part names, control names and the palette. This file says what each asset is.

| | |
|---|---|
| Game type | `platformer` |
| World | A storybook forest with a ruined castle in it. A small hero runs and jumps through woods, caves and castle halls, collecting coins and gems, to a moss-covered stone giant. |
| View | `side` for everything in the level; pickups are `front`; interface pieces and directionless effects are `none`. |
| Palette | "Thornwood" (style guide, section 3) |
| House sound | Chiptune-leaning: bright, pitched, short (style guide, section 11). |
| Sprites | **47** (40 new, 7 reused) |
| Sound effects | **20** (9 new, 11 reused) |
| Music tracks | **2** (1 new, 1 reused) |
| Batches | 15 |

This kit is the nearest to what the library already has: the hero, three enemies, the coin and the campfire exist. The new work is the ground under them (five tilesets), five more enemies and a boss, the props and pickups of a level, and the interface.

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
| 8 | `tiles-forest` | Forest ground tiles | tileset | world/tile | side | 32x32 | P03 |
| 9 | `tiles-platforms` | Wooden platforms and ladders | tileset | world/platform | side | 32x32 | P03 |
| 10 | `tiles-castle` | Castle stone tiles | tileset | world/tile | side | 32x32 | P04 |
| 11 | `tiles-cave` | Cave rock tiles | tileset | world/tile | side | 32x32 | P05 |
| 12 | `tiles-water` | Water and waterfalls | tileset | world/tile | side | 32x32 | P05 |
| 13 | `spear-goblin` | Spear goblin | character | characters/enemy | side | 64x64 | P06 |
| 14 | `thorn-beetle` | Thorn beetle | creature | characters/enemy | side | 48x48 | P06 |
| 15 | `spore-hopper` | Spore hopper | creature | characters/enemy | side | 48x48 | P07 |
| 16 | `crow-scout` | Crow scout | creature | characters/enemy | side | 48x48 | P07 |
| 17 | `moss-golem` | Moss golem | creature | characters/boss | side | 96x96 | P08 |
| 18 | `moving-platform` | Moving platform | prop | world/platform | side | 64x32 | P10 |
| 19 | `crumble-block` | Crumbling block | prop | world/platform | side | 32x32 | P10 |
| 20 | `spring-pad` | Spring pad | prop | world/platform | side | 32x32 | P10 |
| 21 | `spike-trap` | Spike trap | prop | world/hazard | side | 32x32 | P10 |
| 22 | `saw-blade` | Saw blade | prop | world/hazard | side | 48x48 | P10 |
| 23 | `wooden-door` | Wooden door | prop | world/door | side | 48x64 | P04 |
| 24 | `wall-torch` | Wall torch | prop | world/prop | side | 32x48 | P04 |
| 25 | `treasure-chest` | Treasure chest | prop | world/prop | side | 32x32 | P09 |
| 26 | `lever` | Lever | prop | world/prop | side | 32x32 | P09 |
| 27 | `checkpoint-banner` | Checkpoint banner | prop | world/prop | side | 32x64 | P09 |
| 28 | `crate` | Breakable crate | prop | world/prop | side | 32x32 | P09 |
| 29 | `signpost` | Signpost | prop | world/prop | side | 32x48 | P09 |
| 30 | `gem` | Gem | pickup | items/pickup | front | 32x32 | P11 |
| 31 | `heart` | Heart | pickup | items/pickup | front | 32x32 | P11 |
| 32 | `gold-key` | Key | pickup | items/key | front | 32x32 | P11 |
| 33 | `potion` | Potion | pickup | items/food | front | 32x32 | P11 |
| 34 | `star-charm` | Star charm | pickup | items/pickup | front | 32x32 | P11 |
| 35 | `arrow` | Arrow | projectile | effects/projectile | side | 32x16 | P12 |
| 36 | `fireball` | Fireball | projectile | effects/projectile | side | 32x32 | P12 |
| 37 | `boulder-chunk` | Boss rock | projectile | effects/projectile | side | 32x32 | P12 |
| 38 | `dust-puff` | Dust puff | effect | effects/dust | side | 32x32 | P12 |
| 39 | `hit-spark` | Hit spark | effect | effects/spark | none | 32x32 | P12 |
| 40 | `pickup-sparkle` | Pickup sparkle | effect | effects/spark | none | 32x32 | P13 |
| 41 | `enemy-poof` | Defeat poof | effect | effects/dust | none | 48x48 | P13 |
| 42 | `explosion-small` | Small explosion | effect | effects/explosion | none | 48x48 | P13 |
| 43 | `bg-forest` | Forest backdrop | background | environment/background | side | 320x180 | P14 |
| 44 | `bg-castle` | Castle backdrop | background | environment/background | side | 320x180 | P14 |
| 45 | `ui-hud-platformer` | Platformer HUD | ui | interface/bar | none | 16x16 | P13 |
| 46 | `ui-buttons-wood` | Wooden buttons | ui | interface/button | none | 96x32 | P13 |
| 47 | `ui-panel-wood` | Wooden panels | ui | interface/panel | none | 96x64 | P13 |

## Reused assets

Seven existing sprites are used as they are. They count towards the 47. The last column lists small additions that make them complete for this kit; those are done once by task W3-X (they also serve the RPG kit).

| id | Used here as | Clips it has today | Change asked for (done by task W3-X, not by a bundle batch) |
|---|---|---|---|
| `knight` | The player | idle, walk, run, jump, attack, hurt | Add `die` (8), `block` (6) and `victory` (8, loop) from the `humanoid-poses` helper. Cue `land-thud` style "Armoured" on `jump` frame 6 in place of the footstep. |
| `wizard` | The guide who stands at checkpoints and the level start (a townsperson here; a second playable hero if wanted) | idle, walk, run, jump, cast, hurt | Add `die` (8), `victory` (8, loop) and `talk` (8, loop). Declare its parts: `headgear` (the hat), `beard`, `weapon` (the staff). |
| `slime` | Basic ground enemy: hops back and forth | idle, hop, attack, hurt | Add `die` (8): flattens and bursts into droplets; cue `enemy-squish` style "Squish" on frame 0. |
| `bat` | Basic flying enemy in caves and the castle | idle, fly, attack, hurt | Add `die` (8): wings fold, it drops and pops; cue `enemy-squish` style "Pop" on frame 0. |
| `wolf` | Fast ground enemy that charges | idle, walk, run, attack, hurt | Add `die` (8): stumbles and lies down; cue `punch` style "Heavy body blow" on frame 0. |
| `coin` | The main thing to collect | spin, collect | none |
| `campfire` | Rest spot beside a checkpoint | burn, ignite | none |

## New sprites

How to read a row. **Clips:** name, frame count, "loop" if it loops; fps and what must happen in each clip are in the style guide, section 4 (a label in brackets is the button text). **Parts:** each part with its selector's options, then its other settings. **Controls:** the sprite's own controls by key (labels and end words for standard keys are in the style guide, section 10; non-standard keys carry a note). **Sounds:** clip, frame, sound id and style; write the cue exactly so (the "style" is the cue's `preset`). **when:** a control or a cue followed by **when** and a `{ ... }` is in effect only for those values of other controls; copy it exactly into the control's options or the cue (style guide, sections 10 and 11). Default colours are names from the "Thornwood" palette: "default grass" is `PALETTE.thornwood.grass`.

### Tilesets

#### `tiles-forest` · Forest ground tiles

- **Meta:** type `tileset`, role `world/tile`, view `side`, themes `fantasy`, `forest`. Batch **P03**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (21):** the 13-tile block `grass-*` · `grass-thin-l`, `-thin-m`, `-thin-r` · `grass-slope-up` 1 · `grass-slope-down` 1 · `grass-deco-a` 1 · `grass-deco-b` 1 · `grass-deco-c` 1.
- **Parts:** none.
- **Controls (8):** `grass` (colour: default grass), `soil` (colour: default soil), `stone` (colour of the pebbles in the soil: default stone), `flowers` (colour of the flower decal: default crimson), `edge` (depth of the grass cap: 5 to 9 px), `bumps` (slider "Surface": Flat / Lumpy: how far the top line wanders: 0 to 3 px), `texture`, `roots` (toggle: roots hang from the underside tiles).
- **Sounds:** none.
- **Look and motion:** The ground of the whole kit, and the tileset that sets the conventions for every other one. Soil fill is mid brown with a few darker pebbles and two-pixel specks; the grass cap hangs over the soil with a ragged lower edge and a light top row, and wraps round the top corners. The underside (`grass-bottom` row) is ragged soil, with roots when `roots` is on. Decals: `-deco-a` a grass tuft, `-deco-b` three small flowers, `-deco-c` a half-buried stone; all sit on the top line.

#### `tiles-platforms` · Wooden platforms and ladders

- **Meta:** type `tileset`, role `world/platform`, view `side`, themes `fantasy`, `forest`. Batch **P03**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (11):** `plank-thin-l`, `-thin-m`, `-thin-r` · `ladder-cap` 1 · `ladder-mid` 1 · `ladder-foot` 1 · `vine-cap` 1 · `vine-mid` 1 · `vine-foot` 1 · `post-cap` 1 · `post-mid` 1.
- **Parts:** none.
- **Controls (7):** `style` (choice: planks | logs | slab: changes the silhouette of the platform), `wood` (colour: default wood), `rope` (colour of lashings and ladder rails: default cream), `leaf` (colour of the vine: default leaf), `thickness` (the platform: 8 to 14 px), `rungs` (choice: wide | close: 2 or 4 rungs per tile), `wear`.
- **Sounds:** none.
- **Look and motion:** One-way platforms and things to climb. The plank pieces are a platform in the top of the tile with a bracket under each end piece; `plank-thin-m` repeats sideways. Ladders and vines are 16 px wide, centred, and repeat up and down: `-cap` is the top end, `-mid` repeats, `-foot` is the bottom end. `post-mid` is a support post that repeats up and down under a platform; `post-cap` is its top. This tileset has no fill tile, so the checker will warn that nothing tests its repeat: check the joins yourself with the tile map tool.

#### `tiles-castle` · Castle stone tiles

- **Meta:** type `tileset`, role `world/tile`, view `side`, themes `fantasy`, `dungeon`. Batch **P04**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (26):** the 13-tile block `stone-*` · `stone-thin-l`, `-thin-m`, `-thin-r` · `brick-fill` 1 · `pillar-cap` 1 · `pillar-mid` 1 · `pillar-foot` 1 · `window` 1 · `battlement` 1 · `arch-l` 1 · `arch-r` 1 · `stone-deco-a` 1 · `stone-deco-b` 1.
- **Parts:** none.
- **Controls (8):** `stone` (colour: default stone), `wall` (colour of the back wall `brick-fill`: default slate), `growth` (colour of moss: default moss), `overgrowth` (slider "Moss": Clean / Overgrown), `style` (choice: blocks | cobbles | slabs: the stone pattern), `edge` (depth of the trim course along exposed edges), `texture`, `wear` (cracks and chipped corners).
- **Sounds:** none.
- **Look and motion:** Solid castle stonework for floors and walls, plus the pieces that make a room. The block is big dressed stones with a lighter trim course along every exposed edge. `brick-fill` is the darker back wall the player walks in front of: lower contrast than the block so it stays behind. Pillars are 20 px wide and repeat up and down. `window` is an arched opening showing sky, drawn on back wall; `battlement` is one merlon and gap that repeats sideways and sits on a `stone-top`; `arch-l` and `arch-r` are the two halves of an archway. Decals: a crack, a patch of moss.

#### `tiles-cave` · Cave rock tiles

- **Meta:** type `tileset`, role `world/tile`, view `side`, themes `fantasy`, `dungeon`. Batch **P05**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (20):** the 13-tile block `rock-*` · `rock-thin-l`, `-thin-m`, `-thin-r` · `dark-fill` 1 · `rock-deco-a` 1 · `rock-deco-b` 1 · `rock-deco-c` 1.
- **Parts:** none.
- **Controls (8):** `rock` (colour: default slate), `shade` (colour of the deep-cave back fill `dark-fill`: default cavern), `crystal` (colour of the crystal decal: default magic), `edge` (depth of the lighter rim on exposed rock), `jagged` (slider "Edges": Smooth / Jagged), `texture`, `wear` (cracks), `damp` (toggle: wet highlights and a drip on the underside).
- **Sounds:** none.
- **Look and motion:** Rough rock for caves and the inside of hills. Angular facets instead of bricks: three or four large flat planes per tile, lit from the top right. Exposed edges are broken and uneven; the underside has short points. `dark-fill` is the far cave wall, nearly flat. Decals: `-deco-a` a stalactite that hangs from a `rock-bottom`, `-deco-b` a stalagmite on a `rock-top`, `-deco-c` a small cluster of glowing crystals.

#### `tiles-water` · Water and waterfalls

- **Meta:** type `tileset`, role `world/tile`, view `side`, themes `fantasy`, `forest`. Batch **P05**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (5):** `water-top` 8 loop · `water-fill` 8 loop · `fall-top` 8 loop · `fall-fill` 8 loop · `fall-foot` 8 loop.
- **Parts:** none.
- **Controls (6):** `liquid` (choice: water | lava | swamp: changes the surface shape and the motion: ripples, slow bubbles and crust, lily pads and blips), `water` (colour: default water; ember and moss are swatches for lava and swamp), `foam` (colour: default cream), `waves` (slider: Calm / Choppy), `sparkle`, `speed`.
- **Sounds:** none.
- **Look and motion:** Liquid the player swims in or dies in. `water-top` is the surface: see-through above a waterline at row 6, with a foam line whose crests travel sideways and loop. `water-fill` is the body: opaque, two tones, slow light streaks. `fall-fill` is falling streaks that move down and loop up and down; `fall-top` is the lip where water tips over; `fall-foot` is the foam where it lands. All five clips have 8 frames so the joins hold on every frame.

### Enemies and the boss

#### `spear-goblin` · Spear goblin

- **Meta:** type `character`, role `characters/enemy`, view `side`, themes `fantasy`, `forest`. Batch **P06**.
- **Frame:** 64x64, pivot [28, 58].
- **Clips (6):** `idle` 8 loop · `walk` 8 loop · `run` 8 loop · `attack` 8 (label "Thrust") · `hurt` 4 · `die` 8.
- **Parts:** **weapon**: `weapon` (spear | club | dagger | none), `weaponLength`, `weaponAngle`; **headgear**: `headgear` (hood | skullcap | bone | none), `headgearSize`.
- **Controls (11 + 5 in parts):** `height`, `build`, `head`, `ears` (slider: Small / Huge), `nose` (choice: stub | long | hooked), `skin` (default goblin), `outfit` (default soil), `trim` (default thorn), `bounce`, `stride`, `speed`.
- **Sounds:** `walk` frame 0 and 4 → `footstep-gravel` style "Sneaking", volume 0.45 · `run` frame 0 and 4 → `footstep-gravel` style "Sneaking", volume 0.45 · `attack` frame 3 → `whoosh` style "Quick swipe", volume 0.7 · `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `die` frame 0 → `enemy-squish` style "Crunch".
- **Look and motion:** A small, hunched patrol enemy on the humanoid rig, about four fifths of the hero's height with a head too big for its body and long pointed ears that stick out behind and lag when it moves. Ragged tunic, bare feet. The attack is a thrust: the spear is pulled back on frames 1 to 2 and the whole body lunges 6 px forward on 3 to 4. With `weapon: none` it claws instead.

#### `thorn-beetle` · Thorn beetle

- **Meta:** type `creature`, role `characters/enemy`, view `side`, themes `fantasy`, `forest`. Batch **P06**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (6):** `idle` 8 loop · `walk` 8 loop · `attack` 8 (label "Horn jab") · `block` 6 (label "Curl up") · `hurt` 4 · `die` 8.
- **Parts:** **horns**: `horns` (stag | rhino | none), `hornLength`.
- **Controls (9 + 2 in parts):** `size`, `shell` (slider "Shell": Flat / Domed), `spikes` (slider: Few / Many thorns along the back: 2 to 6), `legs` (slider: Short / Long), `eyes` (choice: dots | angry | glow), `body` (the shell: default thorn), `accent` (legs and underside: default soil), `bounce`, `speed`.
- **Sounds:** `walk` frame 0 and 4 → `footstep-gravel` style "Sneaking", volume 0.3 · `attack` frame 3 → `whoosh` style "Quick swipe", volume 0.7 · `block` frame 1 → `metal-hit` style "Tin can", volume 0.7 · `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `die` frame 0 → `enemy-squish` style "Crunch".
- **Look and motion:** A low armoured beetle, twice as long as it is tall, with a glossy domed shell (highlight band) and a row of thorns. Six short legs move in two alternating groups of three. In `block` it tucks head and legs under the shell and becomes a spiked dome that cannot be hurt. It dies by flipping onto its back, legs curling in.

#### `spore-hopper` · Spore hopper

- **Meta:** type `creature`, role `characters/enemy`, view `side`, themes `fantasy`, `forest`. Batch **P07**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (5):** `idle` 8 loop · `hop` 8 loop · `attack` 8 (label "Spore puff") · `hurt` 4 · `die` 8.
- **Parts:** **ruff**: `ruff` (leaves | petals | thorns | none), `ruffSize`, `ruffColour` (default leaf).
- **Controls (9 + 3 in parts):** `size`, `bulk` (slider "Pod": Slim / Plump), `eyes` (choice: round | sleepy | angry), `ribs` (toggle: four raised ribs running down the pod, each at least 8 px long), `body` (the pod: default moss), `glow` (the spore cloud: default thorn), `hop`, `wobble`, `speed`.
- **Sounds:** `hop` frame 1 → `jump` style "Tiny hop", volume 0.5 · `hop` frame 6 → `footstep-gravel` style "Sneaking", volume 0.5 · `attack` frame 4 → `whoosh` style "Quick swipe", volume 0.7 · `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `die` frame 0 → `enemy-squish` style "Pop".
- **Look and motion:** **A hopping seed pod, not a mushroom** (no cap, no spots, no stalk, no feet: style guide, section 13). A plump green pod shaped like an onion bulb, widest low down and drawn up to a puckered vent at the top, standing on one thick coiled root that works as its spring. A ruff of three to five pointed leaves sits round its neck (the `ruff` part), and two small eyes sit low on the pod, half under the ruff. When it hops the root presses flat and then stretches to twice its length, and the ruff flaps up as the pod comes down. To attack it swells (frames 1 to 3) and puffs a cloud of 8 to 12 spore dots up and forward from the vent on frame 4, drawn after the outline. With `ruff: none` it is a bare bulb. It dies by splitting open down a rib and wilting; the last frame is the limp husk on its root.

#### `crow-scout` · Crow scout

- **Meta:** type `creature`, role `characters/enemy`, view `side`, themes `fantasy`, `forest`. Batch **P07**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (5):** `idle` 8 loop (label "Hover") · `fly` 8 loop · `attack` 8 (label "Dive") · `hurt` 4 · `die` 8.
- **Parts:** **held**: `held` (none | lantern | sack | bomb), `heldSize`.
- **Controls (10 + 2 in parts):** `size`, `span` (slider "Wings": Short / Wide), `beak` (slider: Short / Long), `crest` (choice: none | tuft | spiky), `eyes` (choice: dot | angry | glow), `body` (default slate), `accent` (beak and feet: default ember), `flap`, `bob`, `speed`.
- **Sounds:** `fly` frame 1 → `whoosh` style "Quick swipe", volume 0.35 · `attack` frame 3 → `whoosh` style "Heavy swing", volume 0.7 · `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `die` frame 0 → `enemy-squish` style "Squish".
- **Look and motion:** A dark, sharp-beaked bird seen from the side, body tilted forward, with ragged wing tips and a tail fan. It reads as different from the bat: a long beak, one wing in front of the body and one behind (`farRamp`), feathers not membrane. In the dive it folds its wings, plunges 8 px down and forward, and pulls up. The held thing hangs from its claws and swings behind the body.

#### `moss-golem` · Moss golem

- **Meta:** type `creature`, role `characters/boss`, view `side`, themes `fantasy`, `forest`. Batch **P08**.
- **Frame:** 96x96, pivot [44, 90].
- **Clips (7):** `idle` 8 loop · `walk` 8 loop · `attack` 12 (label "Slam") · `roar` 10 · `hurt` 4 · `stagger` 8 · `die` 12.
- **Parts:** **growth**: `growth` (moss | mushrooms | saplings | none), `growthSize`, `growthColour` (default moss); **core**: `core` (gem | rune | eye), `coreSize`.
- **Controls (9 + 5 in parts):** `size`, `bulk` (slider: Lean / Massive), `arms` (slider: Short / Long), `shape` (choice of head: boulder | slab | horned), `wear` (cracks), `stone` (default stone), `glow` (eyes and core: default magic), `bounce` (how heavily it stomps), `speed`.
- **Sounds:** `walk` frame 0 and 4 → `golem-slam` style "Distant quake", volume 0.5 · `roar` frame 2 → `whoosh` style "Heavy swing" · `attack` frame 7 → `golem-slam` style "Boss slam" · `hurt` frame 0 → `punch` style "Heavy body blow", volume 0.9 · `stagger` frame 0 → `crate-break` style "Barrel", volume 0.8 · `die` frame 0 → `golem-slam` style "Boulder drop" · `die` frame 7 → `crate-break` style "Crate".
- **Look and motion:** The boss: a hunched giant of stacked boulders, about two tiles tall, with arms that reach its knees, a small head sunk between the shoulders and a glowing core in its chest (the weak point; the `core` part cannot be removed). Growth covers the shoulders and back. The slam: both fists rise over six frames (the warning), come down on frame 7 with a 3 px squash and a ring of dust drawn after the outline, then it straightens. `roar` leans forward with arms wide. `stagger` drops it to one knee with the core flashing: the moment to hit it. It dies by falling apart from the top into a pile of rubble with the core dark.

### Platforms and hazards

#### `moving-platform` · Moving platform

- **Meta:** type `prop`, role `world/platform`, view `side`, themes `fantasy`, `forest`. Batch **P10**.
- **Frame:** 64x32, pivot [32, 8], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `move` 8 loop.
- **Parts:** none.
- **Controls (7):** `width` (slider: 40 to 62 px), `style` (choice: wood | stone | metal), `chains` (toggle: two chains rise from the ends to 1 px below the top of the frame), `wood` (the deck, whatever its `style`: default wood), `metal` (fittings and the gear, which every style has: default steel), `bob`, `speed`.
- **Sounds:** none.
- **Look and motion:** A floating platform the player rides. A flat deck 10 px thick with end caps and a small gear or rune underneath. In `idle` the gear turns slowly and the deck bobs 1 px; in `move` the gear spins three times as fast and the chains sway. The pivot is on the walking surface (row 8), not at the bottom.

#### `crumble-block` · Crumbling block

- **Meta:** type `prop`, role `world/platform`, view `side`, themes `fantasy`, `forest`. Batch **P10**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (4):** `idle` 1 · `shake` 6 loop · `break` 8 · `respawn` 6.
- **Parts:** none.
- **Controls (7):** `style` (choice: stone | wood | ice | cloud), `wear` (cracks at rest), `pieces`, `body` (default stone), `accent` (crack and edge colour: default slate), `wobble` (how hard it shakes), `speed`.
- **Sounds:** `shake` frame 0 → `crate-break` style "Twig snap", volume 0.5 · `break` frame 0 → `crate-break` style "Crate", volume 0.8.
- **Look and motion:** A 30x28 block that falls apart when stood on. `shake` jitters 1 to 2 px with cracks spreading; `break` splits it into 4 to 8 chunks that fall; its last frame keeps a row of four or more crumbs on the ground line. **`respawn` starts on that same picture of crumbs (frame 0 is never empty)**, the block then rises out of them from the ground line upward and settles on `idle`. Clip order is the cycle: whole, shaking, broken, growing back.

#### `spring-pad` · Spring pad

- **Meta:** type `prop`, role `world/platform`, view `side`, themes `fantasy`, `forest`. Batch **P10**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (2):** `idle` 1 · `bounce` 8.
- **Parts:** none.
- **Controls (8):** `style` (choice of pad: plate | leaf | drum), `width`, `height` (rest height), `coils` (slider: Few / Many: 2 to 4), `body` (the pad: default hero, the colour of friendly things), `metal` (the spring: default steel), `bounce` (how far it stretches), `speed`.
- **Sounds:** `bounce` frame 1 → `spring-boing` style "Spring pad", volume 0.8.
- **Look and motion:** A pad on a coil spring: a studded wooden plate, a broad curled leaf or a small drum (none of them a mushroom, and not a red disc). `bounce`: pressed flat on frame 1, shoots up to nearly the top of the frame on 2 to 3 (the coil stretches thin), then wobbles down to rest.

#### `spike-trap` · Spike trap

- **Meta:** type `prop`, role `world/hazard`, view `side`, themes `fantasy`, `forest`. Batch **P10**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (4), in this order:** `idle` 1 · `retract` 6 · `warn` 4 loop · `attack` 6 (label "Extend").
- **Parts:** none.
- **Controls (7):** `style` (choice: metal | bone | thorn | crystal), `count` (choice: three | four | five spikes), `length`, `base` (toggle: a base plate), `metal` (default steel), `accent` (the tips: default crimson), `speed`.
- **Sounds:** `attack` frame 1 → `sword-slash` style "Quick dagger", volume 0.7.
- **Look and motion:** A row of spikes across one tile, 30 px wide. The clips are one cycle: `idle` is fully out; `retract` pulls the spikes down slowly and ends on the tips (its last frame is the first frame of `warn`); `warn` shows only the tips, twitching; `attack` snaps them out in two frames with a 2 px overshoot and ends on `idle`. **The tips never sink below 3 px above the ground line, at any `length` and with `base` off**, so the trap is never an empty frame: retracted, it is a row of tips (and, with `base` on, the plate under them).

#### `saw-blade` · Saw blade

- **Meta:** type `prop`, role `world/hazard`, view `side`, themes `fantasy`, `forest`. Batch **P10**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (2):** `idle` 8 loop (label "Spin") · `grind` 8 loop.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: classic | jagged | ring), `teeth` (slider: Few / Many: 6 to 12), `hub` (toggle: a bolted hub plate), `metal` (default steel), `accent` (the hub plate: default crimson; **when** `{ hub: [true] }`), `wobble`, `speed`.
- **Sounds:** none.
- **Look and motion:** A spinning circular blade. The teeth rotate one tooth per loop so the loop closes; a curved glint stays fixed at the top right while the teeth pass under it; two short white motion arcs are drawn after the outline. `grind` adds a spray of sparks from the bottom edge.

### Props

#### `wooden-door` · Wooden door

- **Meta:** type `prop`, role `world/door`, view `side`, themes `fantasy`, `dungeon`. Batch **P04**.
- **Frame:** 48x64, pivot [24, 62].
- **Clips (3):** `closed` 1 · `open` 6 · `locked` 4.
- **Parts:** **lock**: `lock` (none | padlock | keyhole | bar), `lockSize`.
- **Controls (8 + 2 in parts):** `style` (choice: plank | arched | iron-bound), `width`, `height`, `window` (toggle: a barred window), `wood` (default wood), `metal` (hinges and studs: default steel), `stone` (the frame: default stone), `speed`.
- **Sounds:** `open` frame 0 → `door-creak` style "Wooden door", volume 0.8 · `locked` frame 0 → `lever-clank` style "Switch", volume 0.7.
- **Look and motion:** A door in a stone frame, 46 px tall, taller than any hero. `open` swings it away in six frames (the door narrows to a sliver and a dark doorway shows); the last frame is the open doorway. `locked` rattles 1 px left and right with the lock flashing white once.

#### `wall-torch` · Wall torch

- **Meta:** type `prop`, role `world/prop`, view `side`, themes `fantasy`, `dungeon`. Batch **P04**.
- **Frame:** 32x48, pivot [16, 34], `grounded: false`.
- **Clips (3), in this order:** `idle` 8 loop (label "Burn") · `out` 1 (label "Unlit") · `ignite` 6.
- **Parts:** none.
- **Controls (8):** `style` (choice of bracket: iron | wood | sconce), `height` (the flame), `halo` (toggle: a ring of glow pixels round the flame), `sparks` (toggle), `glow` (the fire: default ember), `metal` (default steel), `flicker`, `speed`.
- **Sounds:** `idle` frame 0 → `fire` style "Torch", volume 0.35 · `ignite` frame 1 → `whoosh` style "Quick swipe", volume 0.7.
- **Look and motion:** A torch in a wall bracket. The flame is built like the campfire's (three tones, drawn after the outline with its own darker rim) so the two match. `out` is the bracket with a charred torch head and no flame. `ignite` starts on `out`, flares, and ends on the first frame of `idle`. The pivot is where the bracket meets the wall.

#### `treasure-chest` · Treasure chest

- **Meta:** type `prop`, role `world/prop`, view `side`, themes `fantasy`, `forest`. Batch **P09**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (3):** `closed` 8 loop · `open` 8 · `empty` 1.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: wooden | iron | royal), `lid` (slider: Flat / Domed), `gems` (toggle: treasure shows when open), `wood` (default wood), `metal` (bands and lock: default gold), `glow` (the light inside: default gold), `speed`.
- **Sounds:** `open` frame 0 → `chest-open` style "Treasure chest", volume 0.8.
- **Look and motion:** A banded chest. `closed` is still except a glint that crosses the lock on frames 5 to 6. `open`: the chest squashes, the lid flies up past its rest angle and settles, and rays of light rise from inside; the last frame is the open chest, glowing. `empty` is open and dark.

#### `lever` · Lever

- **Meta:** type `prop`, role `world/prop`, view `side`, themes `fantasy`, `forest`. Batch **P09**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (3), in this order:** `off` 1 · `pull` 6 · `on` 1.
- **Parts:** none.
- **Controls (7):** `style` (choice: floor lever | wall switch | crank), `length` (the handle), `knob` (toggle: a ball on the end), `stone` (the base: default stone), `metal` (default steel), `accent` (the knob and the "on" light: default crimson), `speed`.
- **Sounds:** `pull` frame 2 → `lever-clank` style "Lever", volume 0.8.
- **Look and motion:** A handle on a base. `off` leans left, `on` leans right with a lit mark on the base. `pull` goes from off to on with a 2 px overshoot and settle, and its last frame is `on`; a game plays it backwards to switch off.

#### `checkpoint-banner` · Checkpoint banner

- **Meta:** type `prop`, role `world/prop`, view `side`, themes `fantasy`, `forest`. Batch **P09**.
- **Frame:** 32x64, pivot [16, 62].
- **Clips (3), in this order:** `down` 1 (label "Inactive") · `raise` 8 · `up` 8 loop (label "Active"). (The flying flag is `up`, not `idle`: `idle` is only ever a first clip.)
- **Parts:** **emblem**: `emblem` (none | star | skull | sun), `emblemColour` (default gold).
- **Controls (7 + 2 in parts):** `height` (the pole), `shape` (choice of flag: pennant | banner | swallowtail), `finial` (toggle: a ball on top of the pole, at least 4x4 px), `cloth` (default hero), `wood` (the pole: default wood), `sway`, `speed`.
- **Sounds:** `raise` frame 1 → `whoosh` style "Quick swipe", volume 0.7 · `raise` frame 6 → `chime-success` style "Quick confirm".
- **Look and motion:** A flag on a pole. `down`: the flag hangs furled at the bottom, dull. `raise`: it runs up the pole and snaps open with a flash. `up`: it waves in three folds that travel along the cloth.

#### `crate` · Breakable crate

- **Meta:** type `prop`, role `world/prop`, view `side`, themes `fantasy`, `forest`. Batch **P09**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (3):** `idle` 1 · `hurt` 4 · `break` 8.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: crate | barrel | pot), `bands` (toggle: metal bands), `mark` (choice of stamp: none | leaf | skull | star), `pieces`, `wood` (default wood), `metal` (the bands: default steel; **when** `{ bands: [true] }`), `speed`.
- **Sounds:** `hurt` frame 0 → `punch` style "Light jab", volume 0.9 · `break` frame 0 → `crate-break` style "Crate", volume 0.8.
- **Look and motion:** A box to smash. `hurt` flashes white and rocks. `break` bursts it into planks and splinters that fly up and out and fall; the last frame keeps a few splinters on the ground.

#### `signpost` · Signpost

- **Meta:** type `prop`, role `world/prop`, view `side`, themes `fantasy`, `forest`. Batch **P09**.
- **Frame:** 32x48, pivot [16, 46].
- **Clips (2):** `idle` 1 · `wobble` 6.
- **Parts:** none.
- **Controls (8):** `style` (choice: arrow | board | hanging), `points` (choice: right | left | both), `mark` (choice of picture: none | arrow | skull | exclaim), `height`, `mossy` (toggle: moss on the post and board), `wood` (default wood), `wear`, `speed` (it has an animated clip).
- **Sounds:** none.
- **Look and motion:** A wooden sign on a post, about 30 px tall. No words: only a picture mark. `wobble` rocks it when bumped and settles.

### Pickups

#### `gem` · Gem

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `fantasy`, `forest`. Batch **P11**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (8):** `size`, `shape` (choice of cut: diamond | emerald | round | shard), `facets` (toggle: facet lines), `sparkle`, `body` (default magic; crimson, moss, thorn and gold are swatches), `bob`, `pop`, `speed`.
- **Sounds:** `collect` frame 1 → `gem-pickup` style "Gem", volume 0.7.
- **Look and motion:** A cut jewel worth more than a coin. Hard highlight band at the top right, a glint that sweeps across the facets once per loop. `collect` follows the coin's: dip, pop, white flash, sparkles.

#### `heart` · Heart

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `fantasy`, `forest`. Batch **P11**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (9):** `size`, `shape` (choice: classic | round | pixel | crystal), `wings` (toggle: two small wings), `shine`, `sparkle`, `body` (default crimson), `bob` (here the strength of the beat), `pop`, `speed`.
- **Sounds:** `collect` frame 1 → `gem-pickup` style "Heart", volume 0.7.
- **Look and motion:** Health. It beats: two quick swells per loop (frames 1 and 3), then rest. The same shape as the full heart in `ui-hud-platformer`.

#### `gold-key` · Key

- **Meta:** type `pickup`, role `items/key`, view `front`, themes `fantasy`, `forest`. Batch **P11**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (9):** `size`, `shape` (choice of the bow: ring | heart | skull | clover), `teeth` (choice: one | two | three), `sparkle`, `metal` (default gold), `accent` (a jewel in the bow: default crimson), `bob`, `pop`, `speed`.
- **Sounds:** `collect` frame 1 → `gem-pickup` style "Key", volume 0.7.
- **Look and motion:** A big old key, held at a slant, teeth down. It bobs and rocks a few degrees; a glint runs down the shaft.

#### `potion` · Potion

- **Meta:** type `pickup`, role `items/food`, view `front`, themes `fantasy`, `forest`. Batch **P11**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (9):** `size`, `shape` (choice of bottle: round | tall | flask | vial), `level` (slider "Fill": Low / Full), `bubbles` (toggle), `body` (the liquid: default crimson; magic, moss and thorn are swatches), `accent` (the glass: default cream), `bob`, `pop`, `speed`.
- **Sounds:** `collect` frame 1 → `powerup` style "1-up", volume 0.7.
- **Look and motion:** A corked glass bottle. The liquid surface tilts as it bobs and a bubble rises once per loop; the glass has one highlight band and the cork is wood.

#### `star-charm` · Star charm

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `fantasy`, `forest`. Batch **P11**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (10):** `size`, `shape` (choice of points: four | five | six | eight), `jewel` (toggle: a round jewel set in the middle, at least 4x4 px, in the `glow` colour), `halo` (toggle: a ring that pulses), `sparkle`, `body` (the metal: default gold), `glow` (jewel, halo and twinkles: default magic), `bob`, `pop`, `speed`.
- **Sounds:** `collect` frame 1 → `powerup` style "Charge", volume 0.7.
- **Look and motion:** The power-up: **a star-shaped medallion, not a cartoon star** (no face, no eyes, no plump rounded points: style guide, section 13). A flat gold badge with sharp straight points, a bevelled rim one tone lighter and a jewel in the middle, hanging from a small loop at its top point. It swings a few degrees from side to side like a charm on a chain and turns edge-on once per loop (as the coin does), trailing two or three twinkles that are always drawn, whatever `jewel` and `halo` are.

### Projectiles and effects

#### `arrow` · Arrow

- **Meta:** type `projectile`, role `effects/projectile`, view `side`, themes `fantasy`, `forest`. Batch **P12**.
- **Frame:** 32x16, pivot [16, 8], `grounded: false`.
- **Clips (2):** `fly` 4 loop · `hit` 6.
- **Parts:** none.
- **Controls (8):** `length`, `style` (choice of head: broad | needle | barbed | blunt), `trail` (toggle: a white speed line behind), `wood` (the shaft: default wood), `metal` (default steel), `accent` (the fletching: default crimson), `wobble`, `speed`.
- **Sounds:** none.
- **Look and motion:** Flies point first to the right. In `fly` the fletching flutters. In `hit` it stops dead, the shaft quivers up and down and settles: the last frame is the stuck arrow, still.

#### `fireball` · Fireball

- **Meta:** type `projectile`, role `effects/projectile`, view `side`, themes `fantasy`, `forest`. Batch **P12**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`.
- **Clips (2):** `fly` 8 loop · `hit` 6.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: ball | comet | skull), `length` (the tail), `sparks` (toggle), `core` (default cream), `glow` (default ember), `flicker`, `speed`.
- **Sounds:** `hit` frame 0 → `whoosh` style "Heavy swing", volume 0.7.
- **Look and motion:** A ball of flame with a tail streaming to the left. No ink outline: three tones, white-hot core, rimmed with its own darker tone. `hit` opens into a ring of embers.

#### `boulder-chunk` · Boss rock

- **Meta:** type `projectile`, role `effects/projectile`, view `side`, themes `fantasy`, `forest`. Batch **P12**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`.
- **Clips (2):** `fly` 8 loop · `hit` 8.
- **Parts:** none.
- **Controls (8):** `size`, `shape` (choice: round | jagged | slab), `mossy` (toggle), `wear` (cracks), `pieces`, `stone` (default stone), `accent` (the moss: default moss; **when** `{ mossy: [true] }`), `speed`.
- **Sounds:** `hit` frame 0 → `golem-slam` style "Boulder drop", volume 0.7.
- **Look and motion:** A rock thrown by the golem, made of the same stone. It tumbles one full turn per loop (the moss patch shows the turn). `hit` shatters it into shards and dust.

#### `dust-puff` · Dust puff

- **Meta:** type `effect`, role `effects/dust`, view `side`, themes `fantasy`, `forest`. Batch **P12**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (3):** `burst` 6 (label "Landing") · `kick` 4 (label "Running") · `slide` 6 loop (label "Wall slide").
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (the number of puffs: 2 to 6), `spread`, `style` (choice: round | wispy | chunky), `rise` (slider: Low / High), `core` (default cream), `edge` (default stone), `speed`.
- **Sounds:** none.
- **Look and motion:** Dust on the ground line. `burst`: two groups of puffs shoot out left and right along the ground from a landing, rise a little and thin out. `kick`: one small puff behind a running heel, drifting back and up. `slide`: a steady trickle of small puffs rising, for sliding down a wall.

#### `hit-spark` · Hit spark

- **Meta:** type `effect`, role `effects/spark`, view `none`, themes `fantasy`, `forest`. Batch **P12**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`.
- **Clips (1):** `burst` 5.
- **Parts:** none.
- **Controls (7):** `size`, `pieces` (the number of rays: 4 to 8), `style` (choice: star | slash | ring), `twist` (slider: Straight / Turned: turns the whole star), `core` (default cream), `edge` (default gold), `speed`.
- **Sounds:** none.
- **Look and motion:** The flash where a hit lands, played at 16 fps. Frame 0 a white star filling two thirds of the frame; frames 1 to 2 rays fly outward and thin; frames 3 to 4 only the ray tips remain as dots.

#### `pickup-sparkle` · Pickup sparkle

- **Meta:** type `effect`, role `effects/spark`, view `none`, themes `fantasy`, `forest`. Batch **P13**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`.
- **Clips (2):** `burst` 8 · `loop` 8 loop (label "Shimmer").
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (the number of twinkles: 4 to 8), `spread`, `style` (choice: plus | diamond | dot), `rise` (slider: how far the twinkles drift up), `core` (default cream), `edge` (default gold), `speed`.
- **Sounds:** none.
- **Look and motion:** Twinkles for a collected thing. `burst`: a ring of twinkles expands and fades, the same construction as the end of the coin's `collect`. `loop`: three or four twinkles blink in turn around a rare item.

#### `enemy-poof` · Defeat poof

- **Meta:** type `effect`, role `effects/dust`, view `none`, themes `fantasy`, `forest`. Batch **P13**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (1):** `burst` 8.
- **Parts:** none.
- **Controls (7):** `size`, `pieces` (the number of puffs: 4 to 8), `spread`, `style` (choice: cloud | stars | skulls), `core` (default cream), `edge` (default thorn), `speed`.
- **Sounds:** none.
- **Look and motion:** What is left when an enemy is defeated. Frames 0 to 1 a white ball; 2 to 4 it breaks into round puffs moving outward; 5 to 7 the puffs shrink to dots, with two or three small stars (or skulls) drifting up.

#### `explosion-small` · Small explosion

- **Meta:** type `effect`, role `effects/explosion`, view `none`, themes `fantasy`, `forest`. Batch **P13**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (1):** `burst` 8.
- **Parts:** none.
- **Controls (8):** `size`, `pieces` (embers: Few / Many), `spread`, `style` (choice: round | star | ring), `smoke` (toggle: a dark smoke ring at the end), `core` (default cream), `edge` (default ember), `speed`.
- **Sounds:** none.
- **Look and motion:** A cartoon blast. Frame 0 a white disc; 1 to 2 a ball in three tones (white, yellow, orange) with a bumpy edge; 3 to 5 the middle opens into a ring and embers fly; 6 to 7 thin smoke and a few embers.

### Backgrounds and interface

#### `bg-forest` · Forest backdrop

- **Meta:** type `background`, role `environment/background`, view `side`, themes `fantasy`, `forest`. Batch **P14**.
- **Frame:** 320x180, pivot [160, 180].
- **Clips (3):** `far` 1 · `mid` 1 · `near` 1.
- **Parts:** none.
- **Controls (8):** `sky` (default sky), `land` (hills: default haze), `leaf` (trees: default leaf), `time` (choice: day | dusk | night: changes the sky bands and adds a sun, a low sun or a moon and stars), `clouds` (slider: Few / Many), `height` (the hills), `density` (the trees), `haze`.
- **Sounds:** none.
- **Look and motion:** `far`: sky in four flat bands, lightest at the horizon, a sun or moon, stylised flat-bottomed clouds and one distant mountain ridge. `mid`: two rows of rounded hills with small tree clumps on their crests. `near`: dark trunks and heavy canopy masses rising from the bottom edge, with gaps to see through. Everything mixed towards the sky colour; no outlines.

#### `bg-castle` · Castle backdrop

- **Meta:** type `background`, role `environment/background`, view `side`, themes `fantasy`, `dungeon`. Batch **P14**.
- **Frame:** 320x180, pivot [160, 180].
- **Clips (3):** `far` 1 · `mid` 1 · `near` 1.
- **Parts:** none.
- **Controls (8):** `sky` (default dusk), `land` (the stone: default slate), `accent` (banners: default crimson), `time` (choice: day | dusk | night), `windows` (slider: Few / Many lit windows), `height` (the walls), `density` (the columns), `haze`.
- **Sounds:** none.
- **Look and motion:** `far`: a dusk sky with a moon and a far range of towers on crags (a row of several, so no single one marks the repeat). `mid`: a long castle wall with evenly spaced arches, buttresses and a line of battlements. `near`: dark interior columns and hanging banners rising from and dropping to the edges.

#### `ui-hud-platformer` · Platformer HUD

- **Meta:** type `ui`, role `interface/bar`, view `none`, themes `fantasy`, `neutral`. Batch **P13**.
- **Frame:** 16x16, pivot [8, 8].
- **Clips (11):** `heart-full` 1 · `heart-half` 1 · `heart-empty` 1 · `coin` 1 · `key` 1 · `key-empty` 1 · `star` 1 · `star-empty` 1 · `gem` 1 · `heart-lose` 4 · `heart-gain` 4.
- **Parts:** none.
- **Controls (7):** `shape` (choice of heart: classic | round | pixel), `shine`, `shadow` (toggle: a 1 px drop shadow under every glyph), `body` (the hearts: default crimson), `accent` (empty slots: default slate), `metal` (coin, key and star: default gold), `speed`.
- **Sounds:** none.
- **Look and motion:** The small marks along the top of the screen: hearts for health, a coin, a key, a star and a gem beside their counts. Full and empty versions share one outline. `heart-lose` cracks a heart and drains it; `heart-gain` fills it with a white flash.

#### `ui-buttons-wood` · Wooden buttons

- **Meta:** type `ui`, role `interface/button`, view `none`, themes `fantasy`, `neutral`. Batch **P13**.
- **Frame:** 96x32, pivot [48, 16].
- **Clips (4):** `normal` 1 · `hover` 1 · `pressed` 1 · `disabled` 1.
- **Parts:** none.
- **Controls (7):** `style` (choice: plank | carved | stone), `corner`, `border`, `nails` (toggle: a nail at each corner, 3x3 px), `texture` (the grain), `face` (default wood), `frame` (default soil).
- **Sounds:** `pressed` frame 0 → `ui-click` style "Soft tap", volume 0.6.
- **Look and motion:** A menu button like a wooden plank in a darker frame. Grain lines stay out of the clear middle. States as the style guide, section 8.

#### `ui-panel-wood` · Wooden panels

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `fantasy`, `neutral`. Batch **P13**.
- **Frame:** 96x64, pivot [48, 32].
- **Clips (3):** `panel` 1 · `panel-title` 1 · `panel-scroll` 1.
- **Parts:** none.
- **Controls (7):** `corner`, `border`, `nails` (toggle), `texture` (the grain), `face` (default wood), `frame` (default soil), `accent` (the parchment and the title strip: default cream).
- **Sounds:** none.
- **Look and motion:** Boxes for menus and pop-ups, matching the buttons. `panel`: a framed board. `panel-title`: the same with a lighter strip across the top for a heading. `panel-scroll`: a parchment sheet with rolled ends for story text. All nine-slice with an 8 px border.

## Sound effects

Exactly 20. New sounds follow `../../skills/sprite-forge/SOUND.md` (the skill is at the workspace root) and the style guide, section 11. The style names are fixed: sprites cue them by name. Every new sound also has `meta.themes` and `meta.gameTypes` chosen by the style guide, section 13.

| # | id | Name | type | role | Batch | Pairs with |
|---|---|---|---|---|---|---|
| 1 | `jump` | Jump | sfx | actions/jump | reused (existing) | `knight` and `wizard` `jump` frame 2; hoppers' take-off |
| 2 | `footstep-gravel` | Footstep on gravel | sfx | characters/footstep | reused (existing) | every `walk` and `run`, frames 0 and 4 |
| 3 | `sword-slash` | Sword slash | sfx | actions/swing | reused (existing) | `knight` `attack` frame 3; `spike-trap` `attack` |
| 4 | `punch` | Punch | sfx | actions/hit | reused (existing) | every `hurt` frame 0 |
| 5 | `whoosh` | Whoosh | sfx | actions/dash | reused (existing) | enemy attacks, dives, the banner rising, the golem's roar |
| 6 | `metal-hit` | Metal hit | sfx | effects/impact | reused (existing) | a hit that lands on armour or shell, with `hit-spark`; `thorn-beetle` `block` |
| 7 | `coin-pickup` | Coin pickup | sfx | items/pickup | reused (existing) | `coin` `collect` frame 1. **Change asked for (originality, task W3-X):** today it is a two-note square blip with the second note a fourth up, which is the best-known coin sound in games. Give it its own interval and voice (for example a major sixth on a triangle with a short bell), keeping its id and its styles "Gem" and "Dull token" |
| 8 | `powerup` | Power-up | sfx | items/consume | reused (existing) | `potion` and `star-charm` `collect` |
| 9 | `chime-success` | Success chime | jingle | interface/reward | reused (existing) | `checkpoint-banner` `raise` frame 6; level complete |
| 10 | `wind` | Wind | ambience | environment/weather | reused (existing) | the forest levels, looped under the music |
| 11 | `ui-click` | UI click | sfx | interface/click | reused (existing) | `ui-buttons-wood` `pressed` |
| 12 | `land-thud` | Landing thud | sfx | actions/land | P01 | `knight` `jump` frame 6, with `dust-puff` `burst`. |
| 13 | `enemy-squish` | Enemy squish | sfx | characters/death | P01 | `die` frame 0 of `slime`, `bat`, `thorn-beetle`, `spore-hopper`, `crow-scout`, `spear-goblin`, with `enemy-poof`. |
| 14 | `golem-slam` | Ground slam | sfx | effects/impact | P01 | `moss-golem` `attack` frame 7, `walk` frames 0 and 4, `die`; `boulder-chunk` `hit`. |
| 15 | `gem-pickup` | Gem pickup | sfx | items/pickup | P01 | `collect` frame 1 of `gem`, `heart`, `gold-key`, with `pickup-sparkle`. |
| 16 | `spring-boing` | Spring | sfx | world/machine | P01 | `spring-pad` `bounce` frame 1. |
| 17 | `chest-open` | Chest opening | sfx | world/chest | P02 | `treasure-chest` `open` frame 0. In the RPG kit: `chest-topdown` `open` frame 0. |
| 18 | `door-creak` | Door creak | sfx | world/door | P02 | `wooden-door` `open` frame 0. In the RPG kit: `cottage` and `inn` `open`. |
| 19 | `lever-clank` | Lever | sfx | world/lever | P02 | `lever` `pull` frame 2; `wooden-door` `locked`. |
| 20 | `crate-break` | Crate breaking | sfx | world/break | P02 | `crate` `break`; `crumble-block` `shake` and `break`; `moss-golem` `stagger` and `die`. |

#### `land-thud` · Landing thud

- **Meta:** type `sfx`, role `actions/land`. Batch **P01**.
- **Length:** 0.12 to 0.25 s.
- **What makes the sound, and how it moves:** Boots hitting earth. A sine that drops from about 160 Hz to 60 Hz in 50 ms (the weight), a band-passed noise slap at 1 to 3 kHz lasting 30 ms (the contact), and a short hiss of dust after it. Loudest in the first 5 ms, gone by the end; pitch only falls; dull, with just enough mid-range to be heard on a phone. Varies from take to take.
- **Controls (5):** `weight`, `length`, `bright`, `grit` (the dust hiss), `snap`.
- **Styles:** "Soft landing", "Heavy landing", "Armoured". "Armoured" adds a faint metal rattle.
- **Pairs with:** `knight` `jump` frame 6, with `dust-puff` `burst`.

#### `enemy-squish` · Enemy squish

- **Meta:** type `sfx`, role `characters/death`. Batch **P01**.
- **Length:** 0.25 to 0.45 s.
- **What makes the sound, and how it moves:** A cartoon defeat. A pulse-wave blip sliding down from about 600 Hz to 150 Hz, a wet noise splat under its start, and a tiny rising pop at the very end. Bright and toy-like. Varies a little from take to take.
- **Controls (5):** `pitch`, `drop`, `length`, `wet` (slider "Squelch": the noise splat), `bright`.
- **Styles:** "Squish", "Pop", "Crunch". "Pop" is short and high; "Crunch" swaps the wet splat for a dry crack (shells, goblins).
- **Pairs with:** `die` frame 0 of `slime`, `bat`, `thorn-beetle`, `spore-hopper`, `crow-scout`, `spear-goblin`, with `enemy-poof`.

#### `golem-slam` · Ground slam

- **Meta:** type `sfx`, role `effects/impact`. Batch **P01**.
- **Length:** 0.7 to 1.2 s.
- **What makes the sound, and how it moves:** Something huge hitting the ground. A sub thump (sine 90 Hz falling to 38 Hz), a mid crack (noise burst at 400 Hz to 1.5 kHz, 60 ms), then a tail of falling rubble (`dust` through a band-pass, thinning out) in a little room. The one big sound of the kit. Loudest at once; the rubble fades over the length.
- **Controls (5):** `weight`, `length`, `rubble` (slider: Clean / Rubble), `bright`, `space`.
- **Styles:** "Boss slam", "Boulder drop", "Distant quake". "Distant quake" is soft, low and short: the golem's footsteps.
- **Pairs with:** `moss-golem` `attack` frame 7, `walk` frames 0 and 4, `die`; `boulder-chunk` `hit`.

#### `gem-pickup` · Gem pickup

- **Meta:** type `sfx`, role `items/pickup`. Batch **P01**.
- **Length:** 0.35 to 0.6 s.
- **What makes the sound, and how it moves:** A richer cousin of the coin sound. Three rising notes of a major chord on a triangle and a quiet square, each with a glassy `modal` ping on top; the last note rings. Identical every time.
- **Controls (5):** `pitch`, `spread` (slider "Interval": how far apart the three notes are), `speed`, `ring`, `shine`. Brightness: `shine` (this sound has no `bright`).
- **Styles:** "Gem", "Heart", "Key". "Heart" is lower, slower and rounder; "Key" is two notes with a metal ping.
- **Pairs with:** `collect` frame 1 of `gem`, `heart`, `gold-key`, with `pickup-sparkle`.

#### `spring-boing` · Spring

- **Meta:** type `sfx`, role `world/machine`. Batch **P01**.
- **Length:** 0.3 to 0.5 s.
- **What makes the sound, and how it moves:** A cartoon spring. A pulse wave whose pitch leaps up an octave in 40 ms and then wobbles (a vibrato that slows and dies), over a short metallic `pluck` twang. Rises, then shakes.
- **Controls (5):** `pitch`, `wobble`, `length`, `bright`, `twang` (slider "Metal": the plucked twang).
- **Styles:** "Spring pad", "Big trampoline", "Tiny bounce".
- **Pairs with:** `spring-pad` `bounce` frame 1.

#### `chest-open` · Chest opening

- **Meta:** type `sfx`, role `world/chest`. Batch **P02**. **Shared:** also in `kit-rpg-fantasy`.
- **Length:** 0.6 to 0.9 s.
- **What makes the sound, and how it moves:** A lid creaks open and treasure shines. First 0.3 s: a wooden creak (a saw wave at 90 to 200 Hz with a jittering pitch, through a resonant band-pass that rises). Then a latch click. Last 0.3 s: two bright rising bell notes. The reward is part of the sound, so a sprite cues it once on frame 0.
- **Controls (5):** `creak` (slider: Short / Long creak: it sets the length), `pitch`, `latch` (slider "Click"), `sparkle` (the two bell notes: None / Bright), `bright`.
- **Styles:** "Treasure chest", "Small box", "Heavy lid".
- **Pairs with:** `treasure-chest` `open` frame 0. In the RPG kit: `chest-topdown` `open` frame 0.

#### `door-creak` · Door creak

- **Meta:** type `sfx`, role `world/door`. Batch **P02**. **Shared:** also in `kit-rpg-fantasy`.
- **Length:** 0.5 to 1.0 s.
- **What makes the sound, and how it moves:** An old door swinging. A friction creak (a pulse wave at 90 to 200 Hz whose pitch wanders, through a resonant band-pass at 800 Hz to 2 kHz) that rises and falls once, ending in a low wooden thunk as it stops. Varies from take to take.
- **Controls (5):** `length`, `pitch`, `squeak` (slider: Dull / Squeaky), `thunk` (the final knock), `bright`.
- **Styles:** "Wooden door", "Rusty gate", "Quick hatch".
- **Pairs with:** `wooden-door` `open` frame 0. In the RPG kit: `cottage` and `inn` `open`.

#### `lever-clank` · Lever

- **Meta:** type `sfx`, role `world/lever`. Batch **P02**.
- **Length:** 0.15 to 0.3 s.
- **What makes the sound, and how it moves:** A ratchet and a stop. Two short metal clicks (inharmonic `modal`, very short decay) a few hundredths of a second apart, over a low wooden knock on the second. Dry.
- **Controls (5):** `pitch`, `gap` (the time between the two clicks), `ring` (it sets the length), `weight`, `bright`.
- **Styles:** "Lever", "Switch", "Heavy gear". "Switch" is one light click.
- **Pairs with:** `lever` `pull` frame 2; `wooden-door` `locked`.

#### `crate-break` · Crate breaking

- **Meta:** type `sfx`, role `world/break`. Batch **P02**.
- **Length:** 0.35 to 0.6 s.
- **What makes the sound, and how it moves:** Wood smashing. A crack (a noise burst through wood-like `modal` ratios, low, short decay), splinters flying (`dust` through a band-pass at 1 to 4 kHz, thinning out), and a thump underneath. Loudest at once. Varies from take to take.
- **Controls (5):** `size`, `splinters` (slider: Few / Many), `length`, `bright`, `thump`.
- **Styles:** "Crate", "Barrel", "Twig snap". "Barrel" is lower and hollow, also used for cracking stone; "Twig snap" is one small dry crack.
- **Pairs with:** `crate` `break`; `crumble-block` `shake` and `break`; `moss-golem` `stagger` and `die`.

## Music

Exactly 2. New tracks follow the Music section of `SOUND.md` and the style guide, section 12 (fixed control ids `intensity`, `bpm`, `key`, `bars`, `inst`, `bright`, `space`; lengths 8, 16, 24, 32 bars; the five melody instruments).

#### `thornwood-overworld` · Forest trail theme

- **Role:** `music/exploration`. Batch **P15**. **Use:** Every ordinary level.
- **Tempo:** 138 bpm by default, range 120 to 156. **Key:** G major. **Mood:** Bright, bouncy and a little cheeky: setting out on an adventure on a sunny morning. Chiptune-leaning.
- **Chords (8 bars, one per bar):** G, G, C, D, Em, C, D, D (I, I, IV, V, vi, IV, V, V).
- **Layers:** (1) Bass: a triangle bouncing between the root and its octave on 8th notes. (2) Arpeggio: a thin pulse wave (width 0.25) running chord tones in 16ths. (3) Drums: kick on beats 1 and 3, a noise snare on 2 and 4, a closed hat on 8ths. (4) Harmony: two detuned pulses holding thirds. (5) Melody. (6) Echo: the melody an octave up and a beat late, quiet.
- **Intensity:** 0 to 0.25: bass and arpeggio only. 0.25 to 0.5: add kick and hat. 0.5 to 0.75: add snare and melody. 0.75 to 1: add harmony and the echo line, and the hat goes to 16ths.
- **Length:** 8, 16, 24 or 32 bars; default 16. Sections of 8 bars are added from the front: 32 bars is arpeggio and bass, then drums, then melody, then everything.
- **Melody instrument:** The five standard choices; default "Chiptune".
- **Other controls:** `lead` (melody level) and `swing` (slider "Bounce": straight to shuffled 16ths), 9 controls in all.
- **Styles:** "Morning stroll", "Adventure", "Hurry up".
- **Melody:** A four-bar phrase that hops up the G major chord and steps back down, answered by a four-bar phrase that ends on D; original, nothing borrowed.

#### `battle-theme` · Battle theme (reused, existing)

- **Role:** `music/battle`. **Use:** The moss golem fight.
- Used as written. Play it with the style "Boss fight" and raise `intensity` as the golem loses health. For this kit set `inst` to "Chiptune" so it matches the level theme.

## Batch plan

A batch starts when its helpers exist and every batch in its "Needs first" cell has passed review; batches of other kits (R.., S..) count too. **Order** is one more than the highest order among the batches it waits for, so order 1 batches wait for nothing. **Sound batches come first because a sprite cannot cue a sound that does not exist.** A **pathfinder** is the first batch of its kind in the whole library (`"pathfinder": true` in the plan file): the batches of that kind in all three kits start after it and read its report. P03 is the pathfinder for tilesets, P08 for bosses, P11 for pickups, P12 for projectiles and effects, P14 for backgrounds. A batch is sized for one builder in one sitting, with review.

| Order | Batch | Kind | Assets | Needs first |
|---|---|---|---|---|
| 1 | **P00** | upgrade | `knight`, `wizard`, `slime`, `bat`, `wolf` | humanoid-poses. Task W3-X, not a production batch: the changes listed under Reused assets |
| 1 | **P01** | sounds | `land-thud`, `enemy-squish`, `golem-slam`, `gem-pickup`, `spring-boing` | nothing |
| 1 | **P02** | sounds | `chest-open`, `door-creak`, `lever-clank`, `crate-break` | nothing. Two of these are shared with the RPG kit |
| 1 | **P03** | tileset | `tiles-forest`, `tiles-platforms` | palettes, tile-helper. **Pathfinder for tilesets.** Sets the tile conventions for all three kits; its report is read before P04, P05 start |
| 1 | **P14** | backgrounds | `bg-forest`, `bg-castle` | palettes, backdrop-helper. **Pathfinder for backgrounds.** R19 and S13 wait for it and read its report. The style guide, section 7, carries its advice |
| 1 | **P15** | music | `thornwood-overworld` | compose-kit |
| 2 | **P04** | tileset and props | `tiles-castle`, `wooden-door`, `wall-torch` | palettes, tile-helper, P02, P03 |
| 2 | **P05** | tilesets | `tiles-cave`, `tiles-water` | palettes, tile-helper, P03 |
| 2 | **P06** | characters | `spear-goblin`, `thorn-beetle` | palettes, humanoid-poses, P01 |
| 2 | **P07** | creatures | `spore-hopper`, `crow-scout` | palettes, P01 |
| 2 | **P08** | boss | `moss-golem` | palettes, P01, P02. **Pathfinder for bosses.** R14, S09 and S10 wait for it and read its report |
| 2 | **P09** | props | `treasure-chest`, `lever`, `checkpoint-banner`, `crate`, `signpost` | palettes, P02 |
| 2 | **P10** | props | `moving-platform`, `crumble-block`, `spring-pad`, `spike-trap`, `saw-blade` | palettes, P01, P02 |
| 2 | **P11** | pickups | `gem`, `heart`, `gold-key`, `potion`, `star-charm` | palettes, P01. **Pathfinder for pickups.** P13 and S15 wait for it and read its report |
| 2 | **P12** | projectiles and effects | `arrow`, `fireball`, `boulder-chunk`, `dust-puff`, `hit-spark` | palettes, fx-helper, P01. **Pathfinder for projectiles and effects.** P13, R18, S17, S18 and S19 wait for it and read its report |
| 3 | **P13** | effects and interface | `pickup-sparkle`, `enemy-poof`, `explosion-small`, `ui-hud-platformer`, `ui-buttons-wood`, `ui-panel-wood` | palettes, fx-helper, ui-helper, P11, P12. After P11 so that `pickup-sparkle` matches the end of the pickups' own `collect` clips |

### Helpers this bundle waits on

| Helper | What it must do | Batches that wait |
|---|---|---|
| `palettes` | The three palettes as named colours and swatch lists (style guide, sections 3 and 14). | P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14 |
| `tile-helper` | Draws the 13-tile block (top-down wall faces and holes included), thin pieces, slopes and decals so texture repeats and edges meet; renders a sample map. | P03, P04, P05 |
| `humanoid-poses` | Adds `die`, `block`, `victory`, `talk`, `shoot` and a thrust to the side-view rig. | P00, P06 |
| `fx-helper` | Shared particles, twinkles, rings, shards, smoke and effect colour steps. **Required**: every effect and projectile is built from it, so all effects share one look. | P12, P13 |
| `ui-helper` | Nine-slice panel, button states, bar housing and fill. | P13 |
| `backdrop-helper` | Wrapping outlines and scatter for 320x180 layers; `recede()`. | P14 |
| `compose-kit` | The clock, section gates, five melody instruments and limiter every track shares. | P15 |
