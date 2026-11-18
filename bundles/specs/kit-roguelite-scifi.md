# Derelict Station roguelite kit: specification (`kit-roguelite-scifi`)

Written 2026-11-18 by the art director (task W3-S); revised the same day after the independent review (`when` on controls and cues, named palette colours and the player's trim, clip order of props with states, never-empty frames, originality, batch order). It goes with `kit-roguelite-scifi.plan.json`; the two always agree. **Read `docs/style-guide.md` first**: it fixes frame sizes, clip names, frame counts, cue frames, part names, control names and the palette. This file says what each asset is.

| | |
|---|---|
| Game type | `roguelike-action` |
| World | An abandoned space station, half of it taken over by an alien hive. A lone salvager fights room by room through bugs and broken security machines, picking up credits, experience and upgrades, down to a hive mother and a guardian mech. |
| View | `top-down` (three-quarter view) for everything in a room. Pickups are `front`; icons, interface and directionless effects are `none`. |
| Palette | "Derelict" (style guide, section 3) |
| House sound | Synthetic and gritty: dry, punchy, very short (style guide, section 11). |
| Sprites | **48** (48 new, 0 reused) |
| Sound effects | **20** (16 new, 4 reused) |
| Music tracks | **2** (2 new, 0 reused) |
| Batches | 22 |

Everything here is new. Two families of enemy must read as different at a glance: **bugs** are organic, purple and pink with acid-green glow, all curves; **machines** are grey steel with amber stripes and red lights, all straight edges. The player is the palest body (a near-white suit), with blue trim and cyan light; bug shells are a pale lilac, lighter than every floor, so they never sink into it: cool colours are the player's, warm colours are warnings (amber) and enemies (red). Colour of energy says whose it is: cyan friendly, red hostile, green acid. The kit covers both room-clearing with a gun and the "horde survival" style (through `swarm-mite`, `xp-shard`, `orbit-blade` and the upgrade cards), so several assets are drawn small and simple on purpose, to be shown by the hundred.

Contents: [Asset list](#asset-list) · [Reused assets](#reused-assets) · [New sprites](#new-sprites) · [Sound effects](#sound-effects) · [Music](#music) · [Batch plan](#batch-plan)

## Asset list

| # | id | Name | type | role | view | Frame | Batch |
|---|---|---|---|---|---|---|---|
| 1 | `void-ranger` | Ranger | character | characters/player | top-down | 48x48 | S04 |
| 2 | `shield-trooper` | Shield trooper | character | characters/enemy | top-down | 48x48 | S05 |
| 3 | `vendor-bot` | Vendor bot | character | characters/npc | top-down | 48x48 | S05 |
| 4 | `crawler-bug` | Crawler | creature | characters/enemy | top-down | 48x48 | S06 |
| 5 | `swarm-mite` | Swarm mite | creature | characters/enemy | top-down | 32x32 | S06 |
| 6 | `spitter-bug` | Spitter | creature | characters/enemy | top-down | 48x48 | S07 |
| 7 | `scout-drone` | Scout drone | creature | characters/enemy | top-down | 48x48 | S07 |
| 8 | `security-bot` | Security bot | creature | characters/enemy | top-down | 48x48 | S08 |
| 9 | `hive-mother` | Hive mother | creature | characters/boss | top-down | 96x96 | S09 |
| 10 | `warden-mech` | Warden mech | creature | characters/boss | top-down | 96x96 | S10 |
| 11 | `tiles-station-floor` | Station floor | tileset | world/tile | top-down | 32x32 | S03 |
| 12 | `tiles-station-walls` | Station walls | tileset | world/tile | top-down | 32x32 | S11 |
| 13 | `tiles-hive` | Hive growth | tileset | world/tile | top-down | 32x32 | S12 |
| 14 | `tiles-pit` | Pits and the void | tileset | world/tile | top-down | 32x32 | S13 |
| 15 | `blast-door` | Blast door | prop | world/door | top-down | 64x48 | S11 |
| 16 | `supply-crate` | Supply crate | prop | world/prop | top-down | 32x32 | S14 |
| 17 | `fuel-barrel` | Fuel barrel | prop | world/hazard | top-down | 32x48 | S14 |
| 18 | `acid-pool` | Acid pool | prop | world/hazard | top-down | 48x32 | S12 |
| 19 | `laser-gate` | Laser gate | prop | world/hazard | top-down | 64x48 | S11 |
| 20 | `wall-terminal` | Terminal | prop | world/prop | top-down | 32x48 | S11 |
| 21 | `warp-pad` | Warp pad | prop | world/prop | top-down | 64x48 | S13 |
| 22 | `tech-chest` | Loot cache | prop | world/prop | top-down | 32x32 | S14 |
| 23 | `upgrade-pedestal` | Upgrade pedestal | prop | world/prop | top-down | 32x48 | S14 |
| 24 | `credit-chip` | Credit chip | pickup | items/pickup | front | 32x32 | S15 |
| 25 | `health-cell` | Health cell | pickup | items/food | front | 32x32 | S15 |
| 26 | `shield-cell` | Shield cell | pickup | items/pickup | front | 32x32 | S15 |
| 27 | `xp-shard` | XP shard | pickup | items/pickup | front | 16x16 | S15 |
| 28 | `keycard` | Keycard | pickup | items/key | front | 32x32 | S15 |
| 29 | `icons-upgrades` | Upgrade icons | icon | items/icon | none | 32x32 | S16 |
| 30 | `icons-weapons` | Weapon icons | icon | items/weapon | none | 32x32 | S16 |
| 31 | `blaster-bolt` | Blaster bolt | projectile | effects/projectile | top-down | 32x16 | S17 |
| 32 | `scatter-pellet` | Scatter pellet | projectile | effects/projectile | top-down | 16x16 | S17 |
| 33 | `micro-rocket` | Micro rocket | projectile | effects/projectile | top-down | 32x16 | S17 |
| 34 | `plasma-orb` | Enemy plasma orb | projectile | effects/projectile | top-down | 32x32 | S17 |
| 35 | `acid-glob` | Acid glob | projectile | effects/projectile | top-down | 32x32 | S17 |
| 36 | `orbit-blade` | Orbit blade | projectile | effects/projectile | top-down | 32x32 | S17 |
| 37 | `muzzle-flash` | Muzzle flash | effect | effects/spark | top-down | 32x32 | S18 |
| 38 | `hit-flash` | Energy hit | effect | effects/spark | none | 32x32 | S18 |
| 39 | `plasma-burst` | Small plasma blast | effect | effects/explosion | none | 48x48 | S18 |
| 40 | `explosion-large` | Large explosion | effect | effects/explosion | none | 96x96 | S18 |
| 41 | `dodge-trail` | Dodge trail | effect | effects/dust | top-down | 48x48 | S19 |
| 42 | `spawn-warp` | Spawn warning | effect | effects/magic | top-down | 48x48 | S19 |
| 43 | `debris-burst` | Debris | effect | effects/dust | top-down | 48x48 | S19 |
| 44 | `bg-starfield` | Starfield | background | environment/background | none | 320x180 | S13 |
| 45 | `ui-hud-roguelite` | Roguelite HUD | ui | interface/bar | none | 16x16 | S20 |
| 46 | `ui-bars-tech` | Tech bars | ui | interface/bar | none | 64x16 | S20 |
| 47 | `ui-upgrade-card` | Upgrade card | ui | interface/panel | none | 64x96 | S20 |
| 48 | `ui-crosshair` | Crosshair | ui | interface/cursor | none | 32x32 | S20 |

## Reused assets

No existing sprite fits this world, so none is reused. Four existing sounds are.


## New sprites

How to read a row. **Clips:** name, frame count, "loop" if it loops; fps and what must happen in each clip are in the style guide, section 4 (a label in brackets is the button text). **Parts:** each part with its selector's options, then its other settings. **Controls:** the sprite's own controls by key (labels and end words for standard keys are in the style guide, section 10; non-standard keys carry a note). **Sounds:** clip, frame, sound id and style; write the cue exactly so (the "style" is the cue's `preset`). **when:** a control or a cue followed by **when** and a `{ ... }` is in effect only for those values of other controls; copy it exactly into the control's options or the cue (style guide, sections 10 and 11). Default colours are names from the "Derelict" palette: "default deck" is `PALETTE.derelict.deck`.

### The player, enemies and bosses (top-down)

#### `void-ranger` · Ranger

- **Meta:** type `character`, role `characters/player`, view `top-down`, themes `sci-fi`, `space`. Batch **S04**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (12):** `idle_down`, `idle_up`, `idle_side` 8 loop each · `walk_down`, `walk_up`, `walk_side` 8 loop each · `shoot_down`, `shoot_up`, `shoot_side` 6 each · `dodge` 8 · `hurt` 4 · `die` 8.
- **Parts:** **weapon**: `weapon` (blaster | scatter | beam | none), `weaponLength`; **headgear**: `headgear` (helmet | visor | hood | none), `headgearSize`; **pack**: `pack` (none | tank | antenna | jet), `packSize`.
- **Controls (9 + 6 in parts):** `height`, `build`, `skin`, `outfit` (the suit: default suit), `trim` (stripes, gloves and boots: default signal), `glow` (the visor and the chest and shoulder lights of the suit, which show with every headgear and with none: default cyan), `bounce`, `stride`, `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-metal` style "Boots on deck", volume 0.45 · `shoot_*` frame 1 → `laser-shot` style "Pew", volume 0.85, **when** `{ weapon: ['blaster', 'beam'] }` · `shoot_*` frame 1 → `scatter-blast` style "Scatter gun", volume 0.85, **when** `{ weapon: ['scatter'] }` (with `weapon: none` the `shoot_*` clips are a shove and are silent) · `dodge` frame 1 → `dodge-dash` style "Dodge roll", volume 0.7 · `hurt` frame 0 → `ranger-hurt` style "Hit", volume 0.9 · `die` frame 0 → `ranger-hurt` style "Critical" · `die` frame 5 → `footstep-metal` style "Heavy mech", volume 0.8.
- **Look and motion:** The player: a salvager in a pale padded suit with blue stripes, gloves and boots (`signal`; nothing on the ranger is orange, which in this kit means hazard), on the top-down rig, level "Full" with `shoot_*` as the directed action. The near-white suit is the brightest body in the kit (brightness 0.92 against the bugs' 0.70), so the player is never lost on the dark floor. The helmet is open at the jaw, so skin always shows. The gun is held in both hands and points the way the body faces; the `muzzle` socket is its tip. `dodge` tucks into a roll with two afterimage streaks. Read `hero-walker` and its report first.

#### `shield-trooper` · Shield trooper

- **Meta:** type `character`, role `characters/enemy`, view `top-down`, themes `sci-fi`, `space`. Batch **S05**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (12):** `idle_down`, `idle_up`, `idle_side` 8 loop each · `walk_down`, `walk_up`, `walk_side` 8 loop each · `shoot_down`, `shoot_up`, `shoot_side` 6 each · `block` 6 · `hurt` 4 · `die` 8.
- **Parts:** **shield**: `shield` (riot | energy | round | none), `shieldSize`; **weapon**: `weapon` (rifle | pistol | baton | none), `weaponLength`; **headgear**: `headgear` (helmet | mask | none), `headgearSize`.
- **Controls (9 + 6 in parts):** `height`, `build`, `skin`, `outfit` (the armour: default hull), `trim` (default plate), `glow` (the visor or mask lights and the shield's edge: default red; **when** `[{ headgear: ['helmet', 'mask'] }, { shield: ['riot', 'energy', 'round'] }]`), `bounce`, `stride`, `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-metal` style "Boots on deck", volume 0.45 · `shoot_*` frame 1 → `laser-shot` style "Heavy cannon", volume 0.85, **when** `{ weapon: ['rifle', 'pistol'] }` · `shoot_*` frame 2 → `bolt-impact` style "On metal", volume 0.7, **when** `{ weapon: ['baton', 'none'] }` (a baton jab or a shove with the shield, not a shot) · `block` frame 1 → `bolt-impact` style "On metal", volume 0.7, **when** `{ shield: ['riot', 'energy', 'round'] }` · `hurt` frame 0 → `bolt-impact` style "On flesh", volume 0.9 · `die` frame 0 → `ranger-hurt` style "Critical".
- **Look and motion:** A human enemy in dark armour behind a shield as tall as its body. Stockier than the ranger, dark where the ranger is pale, red lights where the ranger's are cyan. The shield covers the front in `_down`, shows edge-on in `_side`, and is hidden behind the body in `_up`. `block` plants the shield and crouches behind it.

#### `vendor-bot` · Vendor bot

- **Meta:** type `character`, role `characters/npc`, view `top-down`, themes `sci-fi`, `space`. Batch **S05**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (3):** `idle` 8 loop · `talk` 8 loop · `sell` 8.
- **Parts:** **headgear**: `headgear` (antenna | dish | cap | none), `headgearSize`; **held**: `held` (none | sign | tray), `heldSize`.
- **Controls (9 + 4 in parts):** `size`, `shape` (choice of body: boxy | round | capsule), `eyes` (choice of screen face: smile | dots | visor | one eye), `arms` (toggle: two thin jointed arms), `body` (default panel), `accent` (default teal), `glow` (the screen: default cyan), `bob`, `speed`.
- **Sounds:** `talk` frame 0 and 4 → `tech-click` style "Hover", volume 0.6 · `sell` frame 3 → `credit-pickup` style "Credit chip", volume 0.7.
- **Look and motion:** A friendly shop robot that hovers in place, always facing the camera (no direction clips): a floating vending kiosk. By default a boxy cabinet body with rounded corners, a screen for a face in its upper half, a coin slot and a serving hatch below it, bobbing 2 px over a small thruster glow (not a smooth white egg with two blue eyes: style guide, section 13). `talk`: the face flickers between two expressions and an arm gestures. `sell`: a tray slides out with a glinting item on it.

#### `crawler-bug` · Crawler

- **Meta:** type `creature`, role `characters/enemy`, view `top-down`, themes `sci-fi`, `space`, `horror`. Batch **S06**.
- **Frame:** 48x48, pivot [24, 40].
- **Clips (9):** `idle_down` 8 loop · `walk_down`, `walk_up`, `walk_side` 8 loop each · `attack_down`, `attack_up`, `attack_side` 8 each (label "Bite") · `hurt` 4 · `die` 8.
- **Parts:** **horns**: `horns` (pincers | tusks | none), `hornLength`; **tail**: `tail` (none | stinger | club), `tailLength`.
- **Controls (10 + 4 in parts):** `size`, `legs` (slider: Short / Long), `length` (choice of body: short | medium | long: two, three or four segments), `spikes` (toggle: a row of back spikes), `body` (the shell: default chitin), `accent` (legs and underside: default flesh), `glow` (the eyes: default acid), `bounce`, `stride`, `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-metal` style "Light scuttle", volume 0.3 · `attack_*` frame 4 → `bolt-impact` style "On flesh", volume 0.85 · `hurt` frame 0 → `bolt-impact` style "On flesh", volume 0.9 · `die` frame 0 → `bug-splat` style "Crawler".
- **Look and motion:** The basic melee enemy: a segmented, six-legged bug the size of a dog, drawn in three directions without the body rig (its shapes are its own; anything generic it needs, such as a six-legged gait, is added to the framework, not kept in this file). `_down` shows the head, jaws and glowing eyes; `_up` the tail and back plates; `_side` the full length. Legs move in two alternating groups of three. The bite lunges 6 px in the facing direction with jaws wide. It dies on its back, legs curling in.

#### `swarm-mite` · Swarm mite

- **Meta:** type `creature`, role `characters/enemy`, view `top-down`, themes `sci-fi`, `space`, `horror`. Batch **S06**.
- **Frame:** 32x32, pivot [16, 28].
- **Clips (5):** `idle` 8 loop · `walk` 8 loop (label "Skitter") · `attack` 6 (label "Nip") · `hurt` 4 · `die` 6 (label "Pop").
- **Parts:** none.
- **Controls (8):** `size`, `legs` (choice: four | six | eight), `shape` (choice: round | long | spiky), `eyes` (choice: one | two | many), `body` (default flesh), `glow` (default acid), `bounce`, `speed`.
- **Sounds:** `die` frame 0 → `bug-splat` style "Mite pop", volume 0.7. Only `die` has a sound: fifty of these on screen must not make fifty footsteps.
- **Look and motion:** A tiny bug drawn for crowds of fifty: a 12 to 18 px body, 16 to 20 px across with its legs, one strong shape, bright eyes, no direction clips (the same from every side). Kept to eight colours. The skitter is fast and jittery, the body tilting left and right.

#### `spitter-bug` · Spitter

- **Meta:** type `creature`, role `characters/enemy`, view `top-down`, themes `sci-fi`, `space`, `horror`. Batch **S07**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (5):** `idle` 8 loop · `shoot` 8 (label "Spit") · `burrow` 8 · `hurt` 4 · `die` 8.
- **Parts:** **horns**: `horns` (none | crest | spines), `hornLength`.
- **Controls (8 + 2 in parts):** `size`, `bulk` (slider "Sac": Small / Bloated), `shape` (choice of mouth: round | three-way | slit), `body` (default chitin), `accent` (the sac: default flesh), `glow` (the acid inside: default acid), `bounce` (how much the sac pulses), `speed`.
- **Sounds:** `shoot` frame 4 → `laser-shot` style "Alien ray", volume 0.7 · `hurt` frame 0 → `bolt-impact` style "On flesh", volume 0.9 · `die` frame 0 → `bug-splat` style "Big burst".
- **Look and motion:** A ranged enemy that sits still: a squat body with a swollen, half see-through acid sac on its back that pulses with light. No direction clips. `shoot` (8 frames, longer than the standard 6 because the warning matters): the sac swells for three frames, the mouth opens, and it spits on frame 4. `burrow` sinks it into the floor in a ring of debris; **its last frame is never empty**: a ring of rubble round a dark hole, with the top 3 px of the glowing sac still showing in it. A game plays `burrow` backwards to bring it up again.

#### `scout-drone` · Scout drone

- **Meta:** type `creature`, role `characters/enemy`, view `top-down`, themes `sci-fi`, `space`. Batch **S07**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (5):** `idle` 8 loop (label "Hover") · `alert` 6 · `shoot` 6 · `hurt` 4 · `die` 8.
- **Parts:** **weapon**: `weapon` (blaster | stinger | none), `weaponLength`; **wings**: `wings` (rotors | fins | ring | none), `wingSpan`.
- **Controls (8 + 4 in parts):** `size`, `shape` (choice of body: round | wedge | box), `eyes` (choice of lens: single | visor | triple), `body` (default panel), `accent` (default amber), `glow` (default red), `bob`, `speed`.
- **Sounds:** `alert` frame 0 → `tech-click` style "Confirm", volume 0.6 · `shoot` frame 1 → `laser-shot` style "Pew", volume 0.7, **when** `{ weapon: ['blaster', 'stinger'] }` · `hurt` frame 0 → `bolt-impact` style "On metal", volume 0.9 · `die` frame 0 → `bot-shutdown` style "Drone down".
- **Look and motion:** A small flying machine with one red eye. It hovers with a steady bob, rotors a blur of two alternating frames. `alert`: the eye flares and the body tilts towards the player. It dies by sparking, spinning and breaking into three pieces, which stay in the last frame.

#### `security-bot` · Security bot

- **Meta:** type `creature`, role `characters/enemy`, view `top-down`, themes `sci-fi`, `space`. Batch **S08**.
- **Frame:** 48x48, pivot [24, 42].
- **Clips (12):** `idle_down` 8 loop · `walk_down`, `walk_up`, `walk_side` 8 loop each · `attack_down`, `attack_up`, `attack_side` 8 each (label "Charge") · `shoot_down`, `shoot_up`, `shoot_side` 6 each · `hurt` 4 · `die` 8.
- **Parts:** **weapon**: `weapon` (cannon | saw | claw | none), `weaponLength`; **pack**: `pack` (none | siren | exhaust), `packSize`.
- **Controls (9 + 4 in parts):** `size`, `bulk` (slider: Light / Heavy), `legs` (choice: treads | legs), `shape` (choice of head: dome | block | sensor), `body` (default hull), `accent` (hazard stripes: default amber), `glow` (default red), `bounce` (how much it rumbles), `speed`.
- **Sounds:** `walk_*` frame 0 and 4 → `footstep-metal` style "Heavy mech", volume 0.45 · `attack_*` frame 3 → `dodge-dash` style "Thruster dash", volume 0.7 · `attack_*` frame 5 → `bolt-impact` style "On metal", volume 0.85 · `shoot_*` frame 1 → `scatter-blast` style "Heavy slug", volume 0.85, **when** `{ weapon: ['cannon'] }` (only the cannon shoots; with a saw, a claw or nothing a game uses `attack_*`, and `shoot_*` is a silent feint) · `hurt` frame 0 → `bolt-impact` style "On metal", volume 0.9 · `die` frame 0 → `bot-shutdown` style "Bot shutdown".
- **Look and motion:** A heavy robot guard, wider than it is tall, in three directions, without the body rig (anything generic it needs, such as treads, is added to the framework). Boxy armour with hazard stripes, a small head with one red sensor, a weapon arm. The charge: it lowers itself for three frames (lights flashing), then rams 8 px forward and brakes.

#### `hive-mother` · Hive mother

- **Meta:** type `creature`, role `characters/boss`, view `top-down`, themes `sci-fi`, `space`, `horror`. Batch **S09**.
- **Frame:** 96x96, pivot [48, 88].
- **Clips (7):** `idle` 8 loop · `attack` 10 (label "Stab") · `shoot` 12 (label "Acid spray") · `spawn` 10 · `enrage` 10 · `hurt` 4 · `die` 12.
- **Parts:** **horns**: `horns` (crown | antlers | none), `hornLength`; **wings**: `wings` (none | stubs | veil), `wingSpan`.
- **Controls (9 + 4 in parts):** `size`, `bulk` (slider "Abdomen": Lean / Bloated), `legs` (choice: four | six | eight), `pieces` (slider "Egg sacs": Few / Many), `body` (default chitin), `accent` (sacs and soft parts: default flesh), `glow` (acid and eyes: default acid), `bounce` (how much she pulses), `speed`.
- **Sounds:** `attack` frame 6 → `bolt-impact` style "On flesh" · `shoot` frame 5 → `laser-shot` style "Alien ray" · `spawn` frame 4 → `bug-splat` style "Mite pop" · `enrage` frame 2 → `hive-shriek` style "Enraged" · `hurt` frame 0 → `bolt-impact` style "On flesh", volume 0.9 · `die` frame 0 → `hive-shriek` style "Hive mother" · `die` frame 7 → `bug-splat` style "Big burst".
- **Look and motion:** The first boss: a bloated queen that hardly moves, facing the camera, about two tiles across. A small armoured head with many eyes, long front legs, and a huge pale abdomen behind, studded with glowing egg sacs, that swells and sinks as she breathes. `spawn`: the abdomen squeezes and three sacs burst open at the sides (the game places mites there). `shoot`: she rears and sprays a fan of acid. `enrage`: she rears, shakes and every glow turns brighter. She dies by bursting from the abdomen forward, leaving a puddle and the head shell.

#### `warden-mech` · Warden mech

- **Meta:** type `creature`, role `characters/boss`, view `top-down`, themes `sci-fi`, `space`. Batch **S10**.
- **Frame:** 96x96, pivot [48, 88].
- **Clips (7):** `idle` 8 loop · `walk` 8 loop · `shoot` 12 (label "Missile volley") · `beam` 12 · `overheat` 10 · `hurt` 4 · `die` 12.
- **Parts:** **weapon**: `weapon` (cannon arms | claws | drills), `weaponLength`; **pack**: `pack` (missile pods | radiators | none), `packSize`.
- **Controls (9 + 4 in parts):** `size`, `bulk` (slider: Light / Heavy), `legs` (slider: Short / Long), `shape` (choice of head: cockpit | sensor | skull plate), `body` (default hull), `accent` (default amber), `glow` (the reactor and eyes: default red), `bounce` (how heavily it stomps), `speed`.
- **Sounds:** `walk` frame 0 and 4 → `footstep-metal` style "Heavy mech", volume 0.8 · `shoot` frame 4 → `rocket-launch` style "Missile volley" · `beam` frame 6 → `laser-shot` style "Heavy cannon" · `overheat` frame 0 → `door-hiss` style "Airlock" · `hurt` frame 0 → `bolt-impact` style "On metal", volume 0.9 · `die` frame 0 → `bot-shutdown` style "Mech collapse" · `die` frame 8 → `explosion` style "Grenade".
- **Look and motion:** The second boss: a walking war machine facing the camera, two thick legs, a broad chest with a glowing reactor (the weak point), heavy arms; the arms part cannot be removed. `walk` stomps on the spot, the body dropping 2 px on each step. `shoot`: four missiles fire upward in turn, from the pods of the pack when it is `missile pods` and from hatches that open in the shoulders otherwise, so the clip and its sound are the same with every `pack`. `beam`: the reactor charges for six frames (rings closing in), then a thick beam fires downward and sweeps. `overheat`: it slumps, vents steam from both shoulders and the reactor is exposed. It dies in a chain of small blasts and falls to its knees.

### Tilesets (top-down)

#### `tiles-station-floor` · Station floor

- **Meta:** type `tileset`, role `world/tile`, view `top-down`, themes `sci-fi`, `space`. Batch **S03**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (20):** `floor-fill` 1 · the 13-tile block `plate-*` · `floor-deco-a` 1 · `floor-deco-b` 8 loop · `floor-deco-c` 1 · `floor-deco-d` 1 · `floor-deco-e` 1 · `floor-deco-f` 8 loop.
- **Parts:** none.
- **Controls (9):** `floor` (colour: default deck), `plate` (colour: default plate), `accent` (hazard paint: default amber), `glow` (floor lights: default teal), `style` (choice: panels | grid | hex), `edge` (the width of the plate's rim), `texture` (rivets and scuffs), `wear` (scratches and stains), `speed`.
- **Sounds:** none.
- **Look and motion:** The floor of every room. `floor-fill`: dark plating with thin panel lines that fall on the tile edges, so a room reads as a grid. The plate block is a darker inset area with a lit rim, for walkways and room centres. Decals: `-a` a grate, `-b` a vent with a turning fan (8 frames), `-c` a hazard-stripe strip along one edge, `-d` a goo splat, `-e` a scorch mark, `-f` a floor light that pulses (8 frames). Low contrast overall: the floor must stay quieter than everything standing on it.

#### `tiles-station-walls` · Station walls

- **Meta:** type `tileset`, role `world/tile`, view `top-down`, themes `sci-fi`, `space`. Batch **S11**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (19):** the 13-tile block `wall-*` · `wall-deco-a` 1 · `wall-deco-b` 1 · `wall-deco-c` 1 · `wall-deco-d` 8 loop · `doorway-l` 1 · `doorway-r` 1.
- **Parts:** none.
- **Controls (9):** `hull` (colour of the wall face: default hull), `plate` (colour of the cap: default plate), `accent` (default amber), `glow` (wall lights: default teal), `style` (choice: panels | ribbed | plated), `edge` (the width of the cap's lit rim), `texture`, `wear`, `speed`.
- **Sounds:** none.
- **Look and motion:** Room walls as a block. The cap (the top of the wall) is dark with a lit rim; the bottom row is the wall face: panels, a pipe run and a thin light strip, ending in a base line and a floor shadow. Decals for face tiles: `-a` a window onto stars, `-b` a pipe junction, `-c` a warning sign (a picture, no words), `-d` a wall light that flickers. `doorway-l` and `doorway-r` are the door posts either side of a `blast-door`.

#### `tiles-hive` · Hive growth

- **Meta:** type `tileset`, role `world/tile`, view `top-down`, themes `sci-fi`, `space`, `horror`. Batch **S12**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (18):** `hive-fill` 1 · the 13-tile block `wall-*` · `hive-deco-a` 1 · `hive-deco-b` 8 loop · `hive-deco-c` 1 · `hive-deco-d` 1.
- **Parts:** none.
- **Controls (8):** `flesh` (colour of the floor: default membrane), `growth` (colour of the walls: default flesh), `glow` (default acid), `veins` (slider: Few / Many), `edge`, `texture`, `wet` (toggle: glossy highlights), `speed`.
- **Sounds:** none.
- **Look and motion:** The infested part of the station. `hive-fill`: a soft membrane floor with a few branching veins. The wall block (`wall-*`: a top-down wall always has the prefix `wall`, or a level cannot tell it from a second floor; style guide, section 6) is a wall of bulging organic mass: rounded cap lobes, and a dripping, ribbed face on the bottom row. No straight lines anywhere: the opposite of the station tiles. Decals: `-a` a cluster of eggs, `-b` a vein knot that pulses with glow (8 frames), `-c` an empty husk, `-d` a ragged creep patch for laying over station floor at the border.

#### `tiles-pit` · Pits and the void

- **Meta:** type `tileset`, role `world/tile`, view `top-down`, themes `sci-fi`, `space`. Batch **S13**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (15):** the 13-tile block `pit-*` (8 frames each, loop) · `pit-deco-a` 1 · `pit-deco-b` 8 loop.
- **Parts:** none.
- **Controls (7):** `below` (choice of what is down there: space | mist | reactor), `land` (colour of the floor's cut edge: default deck), `hull` (colour of the inner wall: default hull), `glow` (the warning light along the rim: default amber), `pieces` (slider "Specks": Few / Many: the stars, the wisps of mist or the sparks of the reactor, whatever `below` is), `height` (slider "Depth": Shallow / Deep: the inner wall is 6 to 14 px), `speed`.
- **Sounds:** none.
- **Look and motion:** Holes in the floor as a "hole" block, all tiles 8 frames. `pit-fill` is the depth: near-black `void` with a few stars drifting slowly (or mist, or a red reactor glow). The north edge shows the inner wall dropping away; the south edge is a thin lit lip. A dashed warning light runs along every rim. Decals: `-a` a broken girder jutting over the edge, `-b` cables that hang and sway.

### Props (top-down, three-quarter view)

#### `blast-door` · Blast door

- **Meta:** type `prop`, role `world/door`, view `top-down`, themes `sci-fi`, `space`. Batch **S11**.
- **Frame:** 64x48, pivot [32, 46].
- **Clips (3), in this order:** `closed` 1 · `open` 8 · `locked` 8 loop.
- **Parts:** none.
- **Controls (8):** `style` (choice: split | iris | shutter), `pieces` (slider "Panels": Few / Many seams), `stripes` (toggle: hazard stripes), `body` (default hull), `accent` (the hazard stripes: default amber; **when** `{ stripes: [true] }`), `glow` (the status light: default teal; `locked` and the first frame of `open` show it in the fixed palette colour red instead), `hull` (the frame: default plate), `speed`.
- **Sounds:** `open` frame 0 → `door-hiss` style "Blast door", volume 0.8.
- **Look and motion:** A heavy door two tiles wide, set in a wall face. `open`: a light turns from red to the glow colour, the two halves jolt and slide apart into the frame; the last frame is the open doorway. `locked`: the status light blinks red.

#### `supply-crate` · Supply crate

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `sci-fi`, `space`. Batch **S14**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (3):** `idle` 1 · `hurt` 4 · `break` 8.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: crate | canister | locker), `straps` (toggle), `mark` (choice of label: none | cross | bolt | skull), `pieces`, `body` (default hull), `accent` (the label: default amber; **when** `{ mark: ['cross', 'bolt', 'skull'] }`), `speed`.
- **Sounds:** `hurt` frame 0 → `bolt-impact` style "On metal", volume 0.9 · `break` frame 0 → `shield-break` style "Small crack", volume 0.8.
- **Look and motion:** A metal box to shoot open. Three-quarter view: lid on top, front face below. `break` pops the lid and splits the sides into four panels that spin away.

#### `fuel-barrel` · Fuel barrel

- **Meta:** type `prop`, role `world/hazard`, view `top-down`, themes `sci-fi`, `space`. Batch **S14**.
- **Frame:** 32x48, pivot [16, 46].
- **Clips (4):** `idle` 8 loop · `hurt` 4 · `fuse` 8 loop · `break` 8 (label "Explode").
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: barrel | tank | cell), `wear` (dents), `bands` (toggle), `body` (default red), `accent` (the hazard label: default amber), `glow` (default amber), `speed`.
- **Sounds:** `hurt` frame 0 → `bolt-impact` style "On metal", volume 0.9 · `break` frame 0 → `explosion` style "Grenade".
- **Look and motion:** A barrel that explodes when shot: the one bright red body in the kit, so it reads as danger. `idle`: a small warning light blinks. `hurt`: white flash, a leak starts. `fuse`: it swells and flashes faster and faster. `break`: it splits; the game plays `explosion-large` over it; the last frame is a scorch ring and two fragments.

#### `acid-pool` · Acid pool

- **Meta:** type `prop`, role `world/hazard`, view `top-down`, themes `sci-fi`, `space`, `horror`. Batch **S12**.
- **Frame:** 48x32, pivot [24, 16], `grounded: false`.
- **Clips (3), in this order:** `idle` 8 loop · `fade` 8 · `spawn` 8.
- **Parts:** none.
- **Controls (8):** `size`, `shape` (choice: round | splat | long), `pieces` (slider "Bubbles": Few / Many), `crust` (toggle: a darker rim), `body` (default acid), `glow` (the highlights: default cream), `wobble`, `speed`.
- **Sounds:** `idle` frame 0 → `bubbles` style "Boiling", volume 0.35.
- **Look and motion:** A flat puddle of acid on the floor, seen from above. Bubbles rise and pop, each on its own timing, and the edge wobbles. `fade` shrinks it to a dark stain, which stays in its last frame; `spawn` starts on a central splat the size of that stain (never an empty frame) and spreads to the full pool.

#### `laser-gate` · Laser gate

- **Meta:** type `prop`, role `world/hazard`, view `top-down`, themes `sci-fi`, `space`. Batch **S11**.
- **Frame:** 64x48, pivot [32, 46].
- **Clips (4), in this order:** `idle` 8 loop (label "On") · `open` 6 (label "Power down") · `off` 1 · `warn` 6 loop.
- **Parts:** none.
- **Controls (8):** `width` (the gap between the posts), `style` (choice of posts: pylon | orb | wall mount), `beams` (choice: one | two | three), `body` (default hull), `accent` (default amber), `glow` (the beam: default red), `flicker`, `speed`.
- **Sounds:** `idle` frame 0 → `spaceship-hum` style "Idle", volume 0.35 · `open` frame 0 → `tech-click` style "Confirm", volume 0.6.
- **Look and motion:** Two posts with a beam between them, across two tiles. The beam is drawn after the outline: a white core with a coloured rim, flickering in thickness. The clips are one cycle: on, powering down, off, about to switch on. `open`: the beam thins, breaks and goes out; the last frame equals `off`. `off` is the two posts with dark emitters (the posts are in every frame). `warn`: a thin, blinking line before it switches on.

#### `wall-terminal` · Terminal

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `sci-fi`, `space`. Batch **S11**.
- **Frame:** 32x48, pivot [16, 46].
- **Clips (3):** `idle` 8 loop · `activate` 8 · `off` 1.
- **Parts:** none.
- **Controls (8):** `style` (choice: console | kiosk | wall panel), `shape` (choice of what the screen shows: text | graph | map | skull), `keys` (toggle: a keyboard shelf), `body` (default hull), `accent` (default teal), `glow` (the screen: default cyan), `flicker`, `speed`.
- **Sounds:** `activate` frame 1 → `tech-click` style "Confirm", volume 0.6.
- **Look and motion:** A computer to use. The screen is the only bright thing on it: lines scroll, a cursor blinks. `activate`: the screen flashes white, shows a tick and the side lights turn on. `off` is dark.

#### `warp-pad` · Warp pad

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `sci-fi`, `space`. Batch **S13**.
- **Frame:** 64x48, pivot [32, 40].
- **Clips (3):** `idle` 8 loop · `charge` 8 loop · `activate` 10 (label "Warp").
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: round | hex | pylons), `rings` (choice: one | two | three), `body` (default hull), `accent` (default teal), `glow` (default cyan), `flicker`, `speed`.
- **Sounds:** `charge` frame 0 → `spaceship-hum` style "Cruise", volume 0.35 · `activate` frame 2 → `warp-out` style "Warp out".
- **Look and motion:** The exit to the next floor: a low round platform seen from above (an ellipse 56 px wide), with a ring of lights. `idle`: the lights chase round. `charge`: rings of light rise from it. `activate`: a column of light shoots up to 1 px below the top of the frame, flashes white, and collapses.

#### `tech-chest` · Loot cache

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `sci-fi`, `space`. Batch **S14**.
- **Frame:** 32x32, pivot [16, 30].
- **Clips (3):** `closed` 8 loop · `open` 8 · `empty` 1.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: cache | pod | locker), `lid` (slider: Flat / Domed), `stripes` (choice of rarity marks: none | one | two), `body` (default hull), `accent` (the rarity marks: default amber; **when** `{ stripes: ['one', 'two'] }`), `glow` (default cyan), `speed`.
- **Sounds:** `open` frame 0 → `door-hiss` style "Loot cache", volume 0.8 · `open` frame 5 → `credit-pickup` style "Big payout", volume 0.7.
- **Look and motion:** The sci-fi chest. `closed`: a status light blinks. `open`: the lid splits down the middle and slides apart with a hiss, and a beam of light rises with a small glinting shape in it. Same timing as `treasure-chest` in the platformer kit.

#### `upgrade-pedestal` · Upgrade pedestal

- **Meta:** type `prop`, role `world/prop`, view `top-down`, themes `sci-fi`, `space`. Batch **S14**.
- **Frame:** 32x48, pivot [16, 46].
- **Clips (3):** `idle` 8 loop · `activate` 8 · `taken` 1.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: pillar | ring | claw), `shape` (choice of hologram: cube | orb | arrow | star), `body` (default hull), `accent` (default teal), `glow` (default xp), `bob`, `speed`.
- **Sounds:** `activate` frame 1 → `upgrade-get` style "Upgrade".
- **Look and motion:** A stand offering an upgrade: a short pedestal with a hologram floating and turning above it, drawn after the outline in two tones of glow with a scan line moving up it. `activate`: the hologram streaks upward and is gone; the last frame equals `taken` (the bare, dark pedestal).

### Pickups and icons

#### `credit-chip` · Credit chip

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `sci-fi`, `space`. Batch **S15**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (10):** `size`, `shape` (choice: hex | round | bar), `thickness`, `mark` (choice: circuit | star | plain), `sparkle`, `metal` (default gold), `glow` (the lit circuit lines or star: default cyan; **when** `{ mark: ['circuit', 'star'] }`), `bob`, `pop`, `speed`.
- **Sounds:** `collect` frame 1 → `credit-pickup` style "Credit chip", volume 0.7.
- **Look and motion:** Money: the coin of this kit, and built the same way (it turns around its upright axis, edge-on in the middle of the loop), but six-sided with a lit circuit line on its face. Read `sprites/coin.js` first.

#### `health-cell` · Health cell

- **Meta:** type `pickup`, role `items/food`, view `front`, themes `sci-fi`, `space`. Batch **S15**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (9):** `size`, `shape` (choice: cell | syringe | cross pack), `level` (slider "Fill"), `sparkle`, `body` (the casing: default panel), `glow` (default heal), `bob`, `pop`, `speed`.
- **Sounds:** `collect` frame 1 → `upgrade-get` style "Health cell", volume 0.7.
- **Look and motion:** Health: a capsule with metal ends and a green glowing middle that beats twice per loop like the fantasy heart.

#### `shield-cell` · Shield cell

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `sci-fi`, `space`. Batch **S15**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (9):** `size`, `shape` (choice: hex | orb | ring), `rings` (choice of layers: one | two), `sparkle`, `body` (default panel), `glow` (default shield), `bob`, `pop`, `speed`.
- **Sounds:** `collect` frame 1 → `upgrade-get` style "Shield cell", volume 0.7.
- **Look and motion:** Shield energy: a blue six-sided shell that turns slowly, with a bright line running round its edge.

#### `xp-shard` · XP shard

- **Meta:** type `pickup`, role `items/pickup`, view `front`, themes `sci-fi`, `space`. Batch **S15**.
- **Frame:** 16x16, pivot [8, 8], `grounded: false`.
- **Clips (3):** `idle` 8 loop · `attract` 6 loop (label "Magnetise") · `collect` 6.
- **Parts:** none.
- **Controls (7):** `size`, `shape` (choice: shard | orb | star | cube), `sparkle`, `body` (default xp), `glow` (default cream), `bob`, `speed`.
- **Sounds:** `collect` frame 0 → `xp-blip` style "XP shard", volume 0.7.
- **Look and motion:** Experience, dropped by the hundred: tiny (8 to 12 px), one bright shape with a white centre, at most six colours. `attract`: it stretches into a streak pointing right (the game turns it towards the player). `collect` is a quick flash and three pixels.

#### `keycard` · Keycard

- **Meta:** type `pickup`, role `items/key`, view `front`, themes `sci-fi`, `space`. Batch **S15**.
- **Frame:** 32x32, pivot [16, 30], `grounded: false`.
- **Clips (2):** `idle` 8 loop · `collect` 8.
- **Parts:** none.
- **Controls (10):** `size`, `shape` (choice: card | chip | fob), `stripes` (choice: one | two | chevron), `sparkle`, `body` (default panel), `accent` (the stripe, which says which door: default red), `glow` (default cyan), `bob`, `pop`, `speed`.
- **Sounds:** `collect` frame 1 → `credit-pickup` style "Keycard", volume 0.7.
- **Look and motion:** A card that opens a locked door. Held at a slant, it bobs and rocks, and a glint slides along its stripe.

#### `icons-upgrades` · Upgrade icons

- **Meta:** type `icon`, role `items/icon`, view `none`, themes `sci-fi`, `space`. Batch **S16**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (10):** `damage` 1 · `fire-rate` 1 · `speed` 1 · `multishot` 1 · `pierce` 1 · `magnet` 1 · `shield` 1 · `crit` 1 · `regen` 1 · `dash` 1.
- **Parts:** none.
- **Controls (7):** `backing` (choice of plate: none | hex | circle), `bold` (toggle: thicker shapes), `shine`, `size`, `face` (the plate: default plate; **when** `{ backing: ['hex', 'circle'] }`), `body` (the picture: default cyan), `accent` (the second tone of each picture: default amber).
- **Sounds:** none.
- **Look and motion:** Pictures for upgrade cards: a burst, three stacked bolts, a winged boot, three arrows fanning, an arrow through a ring, a horseshoe magnet, a shield, a cross-hair star, a heart with a plus, a streak with an arrow. Flat two-tone shapes on a plate: simpler than the fantasy icons, like signs.

#### `icons-weapons` · Weapon icons

- **Meta:** type `icon`, role `items/weapon`, view `none`, themes `sci-fi`, `space`. Batch **S16**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (6):** `blaster` 1 · `scatter` 1 · `beam` 1 · `rocket` 1 · `orbit-blades` 1 · `mine` 1.
- **Parts:** none.
- **Controls (7):** `backing` (choice: none | hex | circle), `shine`, `tilt` (toggle), `size`, `face` (the plate: default plate; **when** `{ backing: ['hex', 'circle'] }`), `body` (the gun metal: default panel), `glow` (default cyan).
- **Sounds:** none.
- **Look and motion:** The weapons a run can find, each a side-on silhouette pointing right: a pistol, a wide double barrel, a long emitter with rings, a tube launcher, three blades round a core, a disc mine. The first three match the `void-ranger` weapon options.

### Projectiles

#### `blaster-bolt` · Blaster bolt

- **Meta:** type `projectile`, role `effects/projectile`, view `top-down`, themes `sci-fi`, `space`. Batch **S17**.
- **Frame:** 32x16, pivot [16, 8], `grounded: false`.
- **Clips (2):** `fly` 4 loop · `hit` 5.
- **Parts:** none.
- **Controls (8):** `length`, `thickness`, `style` (choice: bolt | pulse | needle), `trail` (toggle), `core` (default cream), `glow` (default cyan), `flicker`, `speed`.
- **Sounds:** none.
- **Look and motion:** The player's shot: a short bar of light, white core with a cyan rim, no ink outline, pointing right. It flickers in length by a pixel. `hit` flattens it into a small ring and four sparks. The same from above and from the side, so it can be turned to any angle.

#### `scatter-pellet` · Scatter pellet

- **Meta:** type `projectile`, role `effects/projectile`, view `top-down`, themes `sci-fi`, `space`. Batch **S17**.
- **Frame:** 16x16, pivot [8, 8], `grounded: false`.
- **Clips (2):** `fly` 4 loop · `hit` 4.
- **Parts:** none.
- **Controls (7):** `size`, `shape` (choice: round | shard | spark), `length` (the tail), `core` (default cream), `glow` (default signal, the player's blue), `flicker`, `speed`.
- **Sounds:** none.
- **Look and motion:** One of many pellets from the scatter gun: a 5 to 7 px dot with a short tail to the left, 8 to 12 px long in all. At most five colours.

#### `micro-rocket` · Micro rocket

- **Meta:** type `projectile`, role `effects/projectile`, view `top-down`, themes `sci-fi`, `space`. Batch **S17**.
- **Frame:** 32x16, pivot [16, 8], `grounded: false`.
- **Clips (2):** `fly` 8 loop · `hit` 6.
- **Parts:** none.
- **Controls (9):** `length`, `shape` (choice of nose: round | pointed | flat), `fins` (choice: none | small | swept), `smoke` (toggle: puffs trail behind), `body` (default panel), `accent` (a stripe: default teal), `glow` (the flame: default amber), `wobble`, `speed`.
- **Sounds:** `hit` frame 0 → `explosion` style "Fireworks pop", volume 0.8.
- **Look and motion:** A small missile with an inked metal body, a flame at the back (after the outline) and smoke puffs that fall behind and shrink. It wobbles a pixel from side to side. `hit` is a small flash; the game plays `plasma-burst` over it.

#### `plasma-orb` · Enemy plasma orb

- **Meta:** type `projectile`, role `effects/projectile`, view `top-down`, themes `sci-fi`, `space`. Batch **S17**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`.
- **Clips (2):** `fly` 8 loop · `hit` 6.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: orb | ring | spiky), `swirl` (toggle: a turning inner shape), `length` (the tail), `core` (default cream), `glow` (default red), `wobble`, `speed`.
- **Sounds:** none.
- **Look and motion:** What enemies shoot: bigger and slower than the player's bolt and always in hostile red, so a player can tell at a glance whose shot is whose. A wobbling ball with a darker turning swirl inside.

#### `acid-glob` · Acid glob

- **Meta:** type `projectile`, role `effects/projectile`, view `top-down`, themes `sci-fi`, `space`, `horror`. Batch **S17**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`.
- **Clips (2):** `fly` 8 loop · `hit` 8 (label "Splat").
- **Parts:** none.
- **Controls (7):** `size`, `shape` (choice: round | teardrop | cluster), `pieces` (slider "Drips": Few / Many), `body` (default acid), `glow` (default cream), `wobble`, `speed`.
- **Sounds:** `hit` frame 0 → `bug-splat` style "Mite pop", volume 0.7.
- **Look and motion:** A lobbed blob of acid: inked, glossy, stretching and squashing as it tumbles, shedding drips. `hit` flattens it into a splat with droplets flying out; the last frame is a small puddle (the game then places `acid-pool`).

#### `orbit-blade` · Orbit blade

- **Meta:** type `projectile`, role `effects/projectile`, view `top-down`, themes `sci-fi`, `space`. Batch **S17**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`.
- **Clips (2):** `fly` 8 loop (label "Spin") · `hit` 4.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: saw | star | crescent), `blades` (choice: two | three | four), `trail` (toggle: two motion arcs), `metal` (default steel), `glow` (the cutting edge: default cyan), `wobble`, `speed`.
- **Sounds:** none.
- **Look and motion:** A blade that circles the player. Seen from above: an inked metal disc with blades, turning one blade per loop, its edge lit. `hit` throws three sparks.

### Effects

#### `muzzle-flash` · Muzzle flash

- **Meta:** type `effect`, role `effects/spark`, view `top-down`, themes `sci-fi`, `space`. Batch **S18**.
- **Frame:** 32x32, pivot [8, 16], `grounded: false`.
- **Clips (1):** `burst` 4.
- **Parts:** none.
- **Controls (7):** `size`, `length`, `style` (choice: star | cone | ring), `pieces` (choice of prongs: one | three | five), `core` (default cream), `edge` (default cyan), `speed`.
- **Sounds:** none.
- **Look and motion:** The flash at a gun's tip, played at 20 fps. The pivot is the muzzle: the flash spreads to the right from it. Frame 0 fills most of the frame in white; by frame 3 only three pixels remain.

#### `hit-flash` · Energy hit

- **Meta:** type `effect`, role `effects/spark`, view `none`, themes `sci-fi`, `space`. Batch **S18**.
- **Frame:** 32x32, pivot [16, 16], `grounded: false`.
- **Clips (1):** `burst` 5.
- **Parts:** none.
- **Controls (7):** `size`, `pieces` (the number of shards), `style` (choice: ring | cross | splash), `twist` (slider: Straight / Turned), `core` (default cream), `edge` (default cyan), `speed`.
- **Sounds:** none.
- **Look and motion:** Where a shot lands. A white dot, then a thin ring opening with shards flying off it, then dots. The sci-fi partner of the platformer's `hit-spark`: rings and straight shards where that one has a star.

#### `plasma-burst` · Small plasma blast

- **Meta:** type `effect`, role `effects/explosion`, view `none`, themes `sci-fi`, `space`. Batch **S18**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (1):** `burst` 8.
- **Parts:** none.
- **Controls (8):** `size`, `pieces`, `spread`, `style` (choice: round | ring | shards), `smoke` (toggle), `core` (default cream), `edge` (default amber), `speed`.
- **Sounds:** `burst` frame 0 → `explosion` style "Fireworks pop", volume 0.8.
- **Look and motion:** A small explosion: rockets, drones, crates. White disc; a ball with a hard-edged rim; a ring that opens and breaks into arcs; a few sparks. Cleaner and more geometric than the fantasy `explosion-small`.

#### `explosion-large` · Large explosion

- **Meta:** type `effect`, role `effects/explosion`, view `none`, themes `sci-fi`, `space`. Batch **S18**.
- **Frame:** 96x96, pivot [48, 48], `grounded: false`.
- **Clips (2):** `burst` 12 · `smoke` 8 loop.
- **Parts:** none.
- **Controls (9):** `size`, `pieces`, `spread`, `lobes` (slider: Few / Many bulges in the fireball), `style` (choice: fire | plasma | shock ring), `soot` (toggle: dark smoke in the last frames), `core` (default cream), `edge` (default amber), `speed`.
- **Sounds:** `burst` frame 0 → `explosion` style "Grenade".
- **Look and motion:** Barrels and bosses. Frames 0 to 1 a white flash filling half the frame; 2 to 5 a fireball of overlapping lobes in three tones growing to 80 px; 6 to 8 it tears open from the middle into a ring; 9 to 11 dark smoke puffs and falling sparks. `smoke`: a loose column of puffs that rises and loops, for wreckage.

#### `dodge-trail` · Dodge trail

- **Meta:** type `effect`, role `effects/dust`, view `top-down`, themes `sci-fi`, `space`. Batch **S19**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (1):** `burst` 6.
- **Parts:** none.
- **Controls (7):** `size`, `length`, `pieces` (the number of streaks), `style` (choice: streaks | ghosts | sparks), `core` (default cream), `edge` (default cyan), `speed`.
- **Sounds:** none.
- **Look and motion:** Left behind by a dodge that travels to the right: three fading body-sized blurs stretching to the left, with speed lines. Each frame the oldest blur shrinks and darkens.

#### `spawn-warp` · Spawn warning

- **Meta:** type `effect`, role `effects/magic`, view `top-down`, themes `sci-fi`, `space`. Batch **S19**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (3):** `warn` 8 loop · `burst` 8 (label "Open") · `close` 6.
- **Parts:** none.
- **Controls (8):** `size`, `style` (choice: ring | hex | rift), `rings` (choice: one | two | three), `pieces` (slider "Ticks": Few / Many marks round the ring), `core` (default cream), `edge` (default red), `flicker`, `speed`.
- **Sounds:** `warn` frame 0 and 4 → `tech-click` style "Hover", volume 0.6 · `burst` frame 1 → `warp-out` style "Spawn in".
- **Look and motion:** Shows where an enemy is about to appear, flat on the floor seen from above. `warn`: a red ring with tick marks turning round it, pulsing: fair warning. `burst`: the ring snaps wide, a column of light flashes. `close`: it shrinks to a dot.

#### `debris-burst` · Debris

- **Meta:** type `effect`, role `effects/dust`, view `top-down`, themes `sci-fi`, `space`. Batch **S19**.
- **Frame:** 48x48, pivot [24, 24], `grounded: false`.
- **Clips (2):** `burst` 8 (label "Scrap") · `goo` 8.
- **Parts:** none.
- **Controls (8):** `size`, `pieces`, `spread`, `style` (choice of scrap: plates | shards | bolts), `spin` (toggle: pieces tumble), `body` (the scrap: default panel), `accent` (the goo: default acid), `speed`.
- **Sounds:** none.
- **Look and motion:** What flies off a dead enemy. `burst`: inked metal pieces fly outward, tumble and come to rest; the last frame keeps three on the floor. `goo`: blobs and droplets of slime splash out and flatten.

### Background and interface

#### `bg-starfield` · Starfield

- **Meta:** type `background`, role `environment/background`, view `none`, themes `sci-fi`, `space`. Batch **S13**.
- **Frame:** 320x180, pivot [160, 180].
- **Clips (3):** `far` 1 · `mid` 8 loop · `near` 1.
- **Parts:** none.
- **Controls (7):** `sky` (space: default plate; void is background only and never a swatch), `haze` (colour of the nebula: default nebula), `land` (colour of the `near` shape, planet or wreckage: default teal), `stars` (slider: Few / Many), `sparkle` (toggle: stars twinkle), `style` (choice of `near`: planet edge | ringed planet | wreckage), `speed`.
- **Sounds:** none.
- **Look and motion:** Space, for menus, station windows and the gaps between rooms. `far`: three bands of dark blue with dim one-pixel stars and soft nebula patches; opaque. `mid`: brighter stars of two or three pixels, some twinkling over the 8 frames; to span the full width it also carries a faint band of dust along its bottom rows. `near`: the curved edge of a planet along the bottom (or drifting wreckage). The one background where `near` may be lighter than `far`.

#### `ui-hud-roguelite` · Roguelite HUD

- **Meta:** type `ui`, role `interface/bar`, view `none`, themes `sci-fi`, `neutral`. Batch **S20**.
- **Frame:** 16x16, pivot [8, 8].
- **Clips (12):** `hp-full` 1 · `hp-half` 1 · `hp-empty` 1 · `shield-full` 1 · `shield-empty` 1 · `credit` 1 · `key` 1 · `room` 1 · `room-current` 1 · `room-boss` 1 · `room-shop` 1 · `room-unknown` 1.
- **Parts:** none.
- **Controls (7):** `shape` (choice of pip: block | diamond | cell), `bold` (toggle), `shine`, `body` (health: default heal), `glow` (shields: default shield), `accent` (empty and unknown: default hull), `metal` (credits and keys: default gold).
- **Sounds:** none.
- **Look and motion:** Small marks for the top of the screen: health and shield pips (full and empty share an outline), a credit and a key beside their counts, and squares for the floor map (a room, the current room lit, a skull for the boss, a chip for the shop, a question mark for unknown).

#### `ui-bars-tech` · Tech bars

- **Meta:** type `ui`, role `interface/bar`, view `none`, themes `sci-fi`, `neutral`. Batch **S20**.
- **Frame:** 64x16, pivot [32, 8].
- **Clips (5):** `frame` 1 · `fill` 1 · `fill-b` 1 · `fill-c` 1 · `flash` 4.
- **Parts:** none.
- **Controls (8):** `style` (choice: solid | segmented | slanted), `corner`, `border`, `ticks` (toggle: tick marks along the housing), `frame` (the housing: default hull), `fill` (health: default heal), `fillB` (shield: default shield), `fillC` (experience: default xp). No `speed`: `flash` has 4 frames and plays at a fixed 8 fps (style guide, section 10).
- **Sounds:** none.
- **Look and motion:** Bars as the style guide, section 8: a boss's health, the player's shield, the experience bar. Angular: cut corners instead of round ones.

#### `ui-upgrade-card` · Upgrade card

- **Meta:** type `ui`, role `interface/panel`, view `none`, themes `sci-fi`, `neutral`. Batch **S20**.
- **Frame:** 64x96, pivot [32, 48].
- **Clips (4):** `normal` 1 · `hover` 1 · `pressed` 1 · `disabled` 1.
- **Parts:** none.
- **Controls (8):** `style` (choice: plate | hologram | glass), `rarity` (choice: common | rare | epic: changes the frame's shape and the number of corner marks), `corner` (slider: Square / Cut), `border`, `lines` (toggle: thin tech lines across the face), `face` (default plate), `frame` (default hull), `glow` (the rarity light: default cyan).
- **Sounds:** `hover` frame 0 → `tech-click` style "Hover", volume 0.6 · `pressed` frame 0 → `tech-click` style "Select", volume 0.6.
- **Look and motion:** The card a player picks an upgrade from. Tall panel, a clear square near the top for an icon from `icons-upgrades` (32x32) and a clear area below for text. `hover` lifts it 2 px and lights the frame; `pressed` sinks it; `disabled` is grey.

#### `ui-crosshair` · Crosshair

- **Meta:** type `ui`, role `interface/cursor`, view `none`, themes `sci-fi`, `neutral`. Batch **S20**.
- **Frame:** 32x32, pivot [16, 16].
- **Clips (4):** `idle` 8 loop · `shoot` 4 (label "Firing") · `reload` 8 loop · `hit` 4.
- **Parts:** none.
- **Controls (8):** `style` (choice: cross | circle | brackets | chevrons), `size`, `gap` (slider: Tight / Open), `thickness`, `spin` (toggle: turns slowly in `idle`), `body` (default cream), `accent` (the hit marker: default red), `speed`.
- **Sounds:** none.
- **Look and motion:** The aiming cursor; the pivot is the exact centre, and so is its exported `tip` socket (the hot spot: style guide, section 8). `idle` breathes 1 px. `shoot` kicks the marks outward 3 px and back. `reload` sweeps an arc round once. `hit` flashes four diagonal ticks in the accent colour.

## Sound effects

Exactly 20. New sounds follow `../../skills/sprite-forge/SOUND.md` (the skill is at the workspace root) and the style guide, section 11. The style names are fixed: sprites cue them by name. Every new sound also has `meta.themes` and `meta.gameTypes` chosen by the style guide, section 13.

| # | id | Name | type | role | Batch | Pairs with |
|---|---|---|---|---|---|---|
| 1 | `laser-shot` | Laser shot | sfx | actions/shoot | reused (existing) | `void-ranger` `shoot_*` frame 1 with `muzzle-flash`; enemy shots use the styles "Heavy cannon" and "Alien ray" |
| 2 | `explosion` | Explosion | sfx | effects/explosion | reused (existing) | `fuel-barrel` `break`; `explosion-large`; `plasma-burst`; `micro-rocket` `hit` |
| 3 | `spaceship-hum` | Spaceship hum | sfx | world/machine | reused (existing) | every room, looped quietly; `laser-gate` `idle`; `warp-pad` `charge` |
| 4 | `bubbles` | Bubbles | ambience | environment/ambience | reused (existing) | `acid-pool` `idle`; hive rooms |
| 5 | `scatter-blast` | Scatter gun | sfx | actions/shoot | S01 | `void-ranger` `shoot_*` frame 1 **when** `{ weapon: ['scatter'] }`; `security-bot` `shoot_*` **when** `{ weapon: ['cannon'] }`. |
| 6 | `rocket-launch` | Rocket launch | sfx | actions/shoot | S01 | `micro-rocket` fired; `warden-mech` `shoot` frame 4. |
| 7 | `bolt-impact` | Bolt impact | sfx | actions/hit | S01 | every `hurt` frame 0 in this kit, with `hit-flash`; melee hits landing. |
| 8 | `footstep-metal` | Footstep on metal | sfx | characters/footstep | S01 | every `walk_*`, frames 0 and 4. |
| 9 | `dodge-dash` | Dodge dash | sfx | actions/dash | S01 | `void-ranger` `dodge` frame 1 with `dodge-trail`; `security-bot` `attack_*`. |
| 10 | `ranger-hurt` | Ranger hurt | sfx | characters/hurt | S01 | `void-ranger` `hurt` and `die`. |
| 11 | `shield-break` | Shield break | sfx | effects/impact | S01 | the player's shield reaching zero; `supply-crate` `break`. |
| 12 | `tech-click` | Tech click | sfx | interface/click | S01 | `ui-upgrade-card`; `wall-terminal`; `vendor-bot` `talk`; `spawn-warp` `warn`. |
| 13 | `bug-splat` | Bug splat | sfx | characters/death | S02 | `die` of every bug with `debris-burst` `goo`; `acid-glob` `hit`; `hive-mother` `spawn` and `die`. |
| 14 | `bot-shutdown` | Robot shutdown | sfx | characters/death | S02 | `die` of `scout-drone`, `security-bot`, `warden-mech`, with `debris-burst`. |
| 15 | `hive-shriek` | Hive shriek | sfx | characters/voice | S02 | `hive-mother` `enrage` frame 2 and `die` frame 0. |
| 16 | `credit-pickup` | Credit pickup | sfx | items/pickup | S02 | `credit-chip` and `keycard` `collect`; `tech-chest` `open` frame 5; `vendor-bot` `sell`. |
| 17 | `xp-blip` | XP blip | sfx | items/pickup | S02 | `xp-shard` `collect` frame 0. |
| 18 | `upgrade-get` | Upgrade | sfx | items/equip | S02 | `upgrade-pedestal` `activate`; a card chosen; `health-cell` and `shield-cell` `collect`. |
| 19 | `door-hiss` | Blast door | sfx | world/door | S02 | `blast-door` `open`; `tech-chest` `open` frame 0; `warden-mech` `overheat`. |
| 20 | `warp-out` | Warp | sfx | world/machine | S02 | `warp-pad` `activate` frame 2; `spawn-warp` `burst`. |

#### `scatter-blast` · Scatter gun

- **Meta:** type `sfx`, role `actions/shoot`. Batch **S01**.
- **Length:** 0.18 to 0.30 s.
- **What makes the sound, and how it moves:** A wide, blunt shot. A broad noise burst (band-pass 600 Hz to 3 kHz), a low thump (sine 120 Hz falling to 50 Hz), and a crushed click at the very start. All three start together; gone in a quarter of a second. Dry. Varies from take to take.
- **Controls (5):** `weight`, `spread` (slider "Width": Tight / Wide noise), `length`, `grit`, `bright`.
- **Styles:** "Scatter gun", "Heavy slug", "Sawed-off".
- **Pairs with:** `void-ranger` `shoot_*` frame 1 **when** `{ weapon: ['scatter'] }`; `security-bot` `shoot_*` **when** `{ weapon: ['cannon'] }`.

#### `rocket-launch` · Rocket launch

- **Meta:** type `sfx`, role `actions/shoot`. Batch **S01**.
- **Length:** 0.5 to 0.8 s.
- **What makes the sound, and how it moves:** A small rocket leaving. An ignition pop, then a rush of noise through a band-pass that climbs from 300 Hz to 2.5 kHz as it flies away, over a low burning tone (a saw at 80 Hz roughened by noise). Fades as it rises.
- **Controls (5):** `length`, `pitch`, `burn` (slider: the low burning tone), `snap` (the ignition pop), `bright`.
- **Styles:** "Micro rocket", "Missile volley", "Flare". "Missile volley" is four quick launches in a row.
- **Pairs with:** `micro-rocket` fired; `warden-mech` `shoot` frame 4.

#### `bolt-impact` · Bolt impact

- **Meta:** type `sfx`, role `actions/hit`. Batch **S01**.
- **Length:** 0.08 to 0.18 s.
- **What makes the sound, and how it moves:** A shot landing. A sharp falling blip (2 kHz to 400 Hz in 40 ms), a short inharmonic metal ping, and a noise tick. Very short and dry: it plays many times a second. Varies from take to take.
- **Controls (5):** `pitch`, `ring` (it sets the length), `snap`, `grit`, `weight`. Brightness: `grit` (this sound has no `bright`).
- **Styles:** "On metal", "On flesh", "Ricochet". "On flesh" has no ping and a wet thud instead; "Ricochet" lets the ping ring and slide up.
- **Pairs with:** every `hurt` frame 0 in this kit, with `hit-flash`; melee hits landing.

#### `footstep-metal` · Footstep on metal

- **Meta:** type `sfx`, role `characters/footstep`. Batch **S01**.
- **Length:** 0.08 to 0.16 s.
- **What makes the sound, and how it moves:** A boot on deck plating. A short, low, inharmonic `modal` clank with a fast decay, a heel thump under it and a tiny rattle after. Varies from take to take.
- **Controls (5):** `weight`, `ring`, `length`, `bright`, `rattle`.
- **Styles:** "Boots on deck", "Heavy mech", "Light scuttle". "Light scuttle" is a quick double tick for bug legs.
- **Pairs with:** every `walk_*`, frames 0 and 4.

#### `dodge-dash` · Dodge dash

- **Meta:** type `sfx`, role `actions/dash`. Batch **S01**.
- **Length:** 0.20 to 0.32 s.
- **What makes the sound, and how it moves:** A burst of speed. A fast airy sweep (noise through a band-pass that rises then falls) with a small thruster chirp inside it (a sine going 300 Hz to 1200 Hz and back down). Swells and fades; no hard start.
- **Controls (5):** `length`, `pitch`, `air` (slider: the noise), `chirp` (slider "Thruster"), `bright`.
- **Styles:** "Dodge roll", "Thruster dash", "Blink".
- **Pairs with:** `void-ranger` `dodge` frame 1 with `dodge-trail`; `security-bot` `attack_*`.

#### `ranger-hurt` · Ranger hurt

- **Meta:** type `sfx`, role `characters/hurt`. Batch **S01**.
- **Length:** 0.20 to 0.35 s.
- **What makes the sound, and how it moves:** The player is hit. A low thud, a distorted square buzz falling from 400 Hz to 150 Hz, and a short two-tone alarm blip at the end. Unpleasant on purpose, and unlike every enemy sound, so the player always knows it was them.
- **Controls (5):** `weight`, `pitch`, `grit`, `length`, `alarm` (slider: the alarm blip). Brightness: `grit` (this sound has no `bright`).
- **Styles:** "Hit", "Shield hit", "Critical". "Critical" is longer and lower with a falling tail: also the death sound.
- **Pairs with:** `void-ranger` `hurt` and `die`.

#### `shield-break` · Shield break

- **Meta:** type `sfx`, role `effects/impact`. Batch **S01**.
- **Length:** 0.5 to 0.8 s.
- **What makes the sound, and how it moves:** An energy shield failing. A crushed saw sweeping down from 1.5 kHz to 100 Hz, a spray of glassy `modal` shards on top, and a sub drop at the start.
- **Controls (5):** `pitch`, `length`, `shards` (slider: Few / Many), `grit`, `bright`.
- **Styles:** "Shield break", "Small crack", "Overload". "Small crack" is short and dry: also used for breaking crates.
- **Pairs with:** the player's shield reaching zero; `supply-crate` `break`.

#### `tech-click` · Tech click

- **Meta:** type `sfx`, role `interface/click`. Batch **S01**.
- **Length:** 0.03 to 0.08 s.
- **What makes the sound, and how it moves:** A clean interface blip. A short sine with a little FM on its first few milliseconds and a tiny high tick. Identical every time.
- **Controls (5):** `pitch`, `length`, `bright`, `snap`, `drop`.
- **Styles:** "Select", "Hover", "Confirm". "Confirm" is two quick rising blips.
- **Pairs with:** `ui-upgrade-card`; `wall-terminal`; `vendor-bot` `talk`; `spawn-warp` `warn`.

#### `bug-splat` · Bug splat

- **Meta:** type `sfx`, role `characters/death`. Batch **S02**.
- **Length:** 0.25 to 0.45 s.
- **What makes the sound, and how it moves:** A bug bursting. A wet squelch (noise through a low-pass that bubbles at 20 to 40 Hz), a falling squeal (2 kHz to 600 Hz), and a soft thump. Varies from take to take.
- **Controls (5):** `size`, `wet` (slider "Squelch"), `squeal`, `length`, `bright`.
- **Styles:** "Crawler", "Mite pop", "Big burst". "Mite pop" is very short (0.1 s) and quiet: it can play thirty times a second.
- **Pairs with:** `die` of every bug with `debris-burst` `goo`; `acid-glob` `hit`; `hive-mother` `spawn` and `die`.

#### `bot-shutdown` · Robot shutdown

- **Meta:** type `sfx`, role `characters/death`. Batch **S02**.
- **Length:** 0.5 to 0.9 s.
- **What makes the sound, and how it moves:** A machine dying. A pulse tone gliding down from 600 Hz to 40 Hz through a bit-crusher, its level chopped by a stutter that slows, ending in a crackle of sparks (`dust`).
- **Controls (5):** `pitch`, `length`, `stutter`, `sparks`, `grit`. Brightness: `grit` (this sound has no `bright`).
- **Styles:** "Drone down", "Bot shutdown", "Mech collapse".
- **Pairs with:** `die` of `scout-drone`, `security-bot`, `warden-mech`, with `debris-burst`.

#### `hive-shriek` · Hive shriek

- **Meta:** type `sfx`, role `characters/voice`. Batch **S02**.
- **Length:** 0.9 to 1.4 s.
- **What makes the sound, and how it moves:** An alien scream (stylised: synthesis cannot do a real animal). Two detuned pulse waves rising from 500 Hz to 1.8 kHz with a fast vibrato, through a band-pass that opens like a mouth, with rasping noise on top; it ends in a dry clicking rattle.
- **Controls (5):** `pitch`, `length`, `grit` (slider "Rasp"), `wobble` (slider "Vibrato"), `bright`.
- **Styles:** "Hive mother", "Small screech", "Enraged".
- **Pairs with:** `hive-mother` `enrage` frame 2 and `die` frame 0.

#### `credit-pickup` · Credit pickup

- **Meta:** type `sfx`, role `items/pickup`. Batch **S02**.
- **Length:** 0.15 to 0.30 s.
- **What makes the sound, and how it moves:** The coin sound of this kit. Two quick FM blips, the second higher, with a crushed sparkle on the second. Digital where the fantasy coin is a bell. Identical every time.
- **Controls (5):** `pitch`, `spread` (slider "Interval"), `speed`, `ring`, `grit`. Brightness: `grit` (this sound has no `bright`).
- **Styles:** "Credit chip", "Keycard", "Big payout". "Big payout" is a run of five rising blips.
- **Pairs with:** `credit-chip` and `keycard` `collect`; `tech-chest` `open` frame 5; `vendor-bot` `sell`.

#### `xp-blip` · XP blip

- **Meta:** type `sfx`, role `items/pickup`. Batch **S02**.
- **Length:** 0.05 to 0.10 s.
- **What makes the sound, and how it moves:** One shard collected. A tiny sine and triangle blip that chirps upward. Made to be chained: a game raises `pitch` a step for each shard in a streak. Identical every time at one pitch.
- **Controls (5):** `pitch`, `rise`, `length`, `bright`, `soft` (slider "Softness": the attack).
- **Styles:** "XP shard", "Tiny tick", "Combo high".
- **Pairs with:** `xp-shard` `collect` frame 0.

#### `upgrade-get` · Upgrade

- **Meta:** type `sfx`, role `items/equip`. Batch **S02**.
- **Length:** 0.7 to 1.1 s.
- **What makes the sound, and how it moves:** Power gained. Four rising synth notes, a saw swell rising under them through an opening filter, and a bright held chord at the end. The big reward sound of the kit.
- **Controls (5):** `pitch`, `speed`, `rise`, `bright`, `space`.
- **Styles:** "Upgrade", "Health cell", "Shield cell". The two "cell" styles are short (0.3 s): two notes, soft for health, glassy for shield.
- **Pairs with:** `upgrade-pedestal` `activate`; a card chosen; `health-cell` and `shield-cell` `collect`.

#### `door-hiss` · Blast door

- **Meta:** type `sfx`, role `world/door`. Batch **S02**.
- **Length:** 0.6 to 1.0 s.
- **What makes the sound, and how it moves:** A pressure door opening. A hiss of air (white noise above 3 kHz, instant start, slow fade), a servo whine (a saw gliding from 200 Hz to 500 Hz), and a clunk as it stops.
- **Controls (5):** `length`, `air` (slider "Hiss"), `whine` (slider "Servo"), `thump` (the final clunk), `bright`.
- **Styles:** "Blast door", "Loot cache", "Airlock". "Airlock" is mostly a long hiss: also steam venting.
- **Pairs with:** `blast-door` `open`; `tech-chest` `open` frame 0; `warden-mech` `overheat`.

#### `warp-out` · Warp

- **Meta:** type `sfx`, role `world/machine`. Batch **S02**.
- **Length:** 0.9 to 1.4 s.
- **What makes the sound, and how it moves:** Teleporting away. A stack of sines gliding up two octaves with a slow chorus, noise swelling under them, cut off suddenly with a sub thump. The pitch only rises; the end is abrupt on purpose (the checker will flag the cut-off: keep a 60 ms fade so it passes).
- **Controls (5):** `length`, `pitch`, `rise`, `shimmer`, `thump`. Brightness: `shimmer` (this sound has no `bright`).
- **Styles:** "Warp out", "Spawn in", "Teleport blink". "Spawn in" runs the other way: it starts with the thump and glides down.
- **Pairs with:** `warp-pad` `activate` frame 2; `spawn-warp` `burst`.

## Music

Exactly 2. New tracks follow the Music section of `SOUND.md` and the style guide, section 12 (fixed control ids `intensity`, `bpm`, `key`, `bars`, `inst`, `bright`, `space`; lengths 8, 16, 24, 32 bars; the five melody instruments).

#### `derelict-run` · Station run theme

- **Role:** `music/exploration`. Batch **S21**. **Use:** Room-to-room play. Intensity follows the floor number.
- **Tempo:** 126 bpm by default, range 112 to 140. **Key:** E minor (the F major chord in bar 8 gives a darker, Phrygian colour). **Mood:** Dark, steady and driving synthwave: alone in a dead station, moving forward anyway.
- **Chords (8 bars, one per bar):** Em, Em, C, D, Em, Em, G, F (i, i, VI, VII, i, i, III, flat II).
- **Layers:** (1) Bass: a saw in running 16ths with a filter that opens on each note. (2) Kick on every beat; an off-beat hat; a clap on 2 and 4. (3) Pad: wide detuned saws holding the chord, slow attack. (4) Arpeggio: a thin pulse climbing chord tones in 8ths with an echo. (5) Melody with a dotted-8th echo. (6) A noise riser in the last bar of each section.
- **Intensity:** 0 to 0.25: pad and the bass with its filter nearly shut. 0.25 to 0.5: add kick and hat; the bass filter opens. 0.5 to 0.75: add clap and arpeggio. 0.75 to 1: add the melody, its echo and the riser.
- **Length:** 8, 16, 24 or 32 bars; default 16. Sections are added from the front: pad and bass, then drums, then arpeggio, then everything.
- **Melody instrument:** The five standard choices; default "Synth lead".
- **Other controls:** `lead` (melody level) and `grit`, 9 controls in all.
- **Styles:** "Deck one", "Deep station", "Overrun".
- **Melody:** Sparse: a three-note figure that falls a step and a third, repeated two bars later a third higher, then one long note over bar 8's F chord that makes the loop want to start again.

#### `derelict-boss` · Station boss theme

- **Role:** `music/boss`. Batch **S22**. **Use:** The hive mother and the warden mech.
- **Tempo:** 164 bpm by default, range 150 to 180. **Key:** C minor. **Mood:** Relentless, distorted and alarm-like: no rest until it is over.
- **Chords (8 bars, one per bar):** Cm, Cm, Ab, Bb, Cm, Eb, F, G (i, i, VI, VII, i, III, IV, V).
- **Layers:** (1) Bass: a saw through a `shaper`, 8th notes jumping between the root and its octave. (2) Drums: kick and snare at half time, turning to a kick on every 8th; crushed noise hats in 16ths. (3) Alarm: a two-note stab a semitone apart on the first beat of every second bar. (4) Chords: short gated saw chords on the off-beats. (5) Melody. (6) A sub drop on the first beat of each section.
- **Intensity:** 0 to 0.3: bass and hats (the boss appears). 0.3 to 0.6: add half-time kick and snare, and the alarm. 0.6 to 0.85: the kick goes to every 8th and the gated chords come in. 0.85 to 1: add the melody and crush on the drums (the boss is enraged).
- **Length:** 8, 16, 24 or 32 bars; default 8. Longer versions open with bass and alarm, add drums, then chords, then the full band.
- **Melody instrument:** The five standard choices; default "Synth lead", voiced harsh.
- **Other controls:** `lead` (melody level) and `grit`, 9 controls in all.
- **Styles:** "Boss appears", "Phase two", "Enraged".
- **Melody:** Short stabbing phrases of two and three notes with gaps between, climbing a step each time over bars 5 to 8 to the G chord; clearly different from `battle-theme` and from `hearthvale-battle`.

## Batch plan

A batch starts when its helpers exist and every batch in its "Needs first" cell has passed review; batches of other kits (P.., R..) count too. **Order** is one more than the highest order among the batches it waits for. Sound batches come first because a sprite cannot cue a sound that does not exist. **This kit waits on the other two for conventions:** S04 (the player) starts after R03, the first top-down character; S03 (the floor) starts after R04, the first top-down tileset; its bosses, pickups, projectiles, effects and background start after the pathfinders P08, P11, P12 and P14.

| Order | Batch | Kind | Assets | Needs first |
|---|---|---|---|---|
| 1 | **S01** | sounds | `scatter-blast`, `rocket-launch`, `bolt-impact`, `footstep-metal`, `dodge-dash`, `ranger-hurt`, `shield-break`, `tech-click` | nothing |
| 1 | **S02** | sounds | `bug-splat`, `bot-shutdown`, `hive-shriek`, `credit-pickup`, `xp-blip`, `upgrade-get`, `door-hiss`, `warp-out` | nothing |
| 1 | **S16** | icons | `icons-upgrades`, `icons-weapons` | palettes |
| 1 | **S21** | music | `derelict-run` | compose-kit |
| 1 | **S22** | music | `derelict-boss` | compose-kit |
| 2 | **S07** | creatures | `spitter-bug`, `scout-drone` | palettes, S01, S02 |
| 2 | **S14** | props | `supply-crate`, `fuel-barrel`, `tech-chest`, `upgrade-pedestal` | palettes, S01, S02 |
| 2 | **S20** | interface | `ui-hud-roguelite`, `ui-bars-tech`, `ui-upgrade-card`, `ui-crosshair` | palettes, ui-helper, S01 |
| 3 | **S03** | tileset | `tiles-station-floor` | palettes, tile-helper, R04. The first sci-fi tileset: starts when the first top-down tileset (R04) has passed, and sets the look for S11 to S13 |
| 3 | **S04** | character | `void-ranger` | palettes, topdown-rig, S01, R03. Starts when the first top-down character (R03) has passed |
| 3 | **S06** | creatures | `crawler-bug`, `swarm-mite` | palettes, S01, S02, R03 |
| 3 | **S08** | creature | `security-bot` | palettes, S01, S02, R03 |
| 3 | **S09** | boss | `hive-mother` | palettes, S01, S02, P08. After P08, the pathfinder for bosses |
| 3 | **S10** | boss | `warden-mech` | palettes, S01, S02, P08. After P08, the pathfinder for bosses |
| 3 | **S15** | pickups | `credit-chip`, `health-cell`, `shield-cell`, `xp-shard`, `keycard` | palettes, S02, P11. After P11, the pathfinder for pickups |
| 3 | **S17** | projectiles | `blaster-bolt`, `scatter-pellet`, `micro-rocket`, `plasma-orb`, `acid-glob`, `orbit-blade` | palettes, fx-helper, S02, P12. After P12, the pathfinder for projectiles and effects |
| 3 | **S18** | effects | `muzzle-flash`, `hit-flash`, `plasma-burst`, `explosion-large` | palettes, fx-helper, P12. After P12, the pathfinder for projectiles and effects |
| 3 | **S19** | effects | `dodge-trail`, `spawn-warp`, `debris-burst` | palettes, fx-helper, S01, S02, P12. After P12, the pathfinder for projectiles and effects |
| 4 | **S05** | characters | `shield-trooper`, `vendor-bot` | palettes, topdown-rig, S01, S02, S04 |
| 4 | **S11** | tileset and props | `tiles-station-walls`, `blast-door`, `wall-terminal`, `laser-gate` | palettes, tile-helper, S01, S02, S03 |
| 4 | **S12** | tileset and props | `tiles-hive`, `acid-pool` | palettes, tile-helper, S03 |
| 4 | **S13** | tileset, prop and background | `tiles-pit`, `warp-pad`, `bg-starfield` | palettes, tile-helper, backdrop-helper, S02, S03, P14. After P14, the pathfinder for backgrounds |

### Helpers this bundle waits on

| Helper | What it must do | Batches that wait |
|---|---|---|
| `palettes` | The three palettes as named colours and swatch lists (style guide, sections 3 and 14). | S03, S04, S05, S06, S07, S08, S09, S10, S11, S12, S13, S14, S15, S16, S17, S18, S19, S20 |
| `tile-helper` | Draws the 13-tile block (top-down wall faces and holes included), thin pieces, slopes and decals so texture repeats and edges meet; renders a sample map. | S03, S11, S12, S13 |
| `topdown-rig` | The top-down body rig: three directions, the standard poses (`shoot` and `dodge` included), hooks in the right depth order, sockets with `muzzle`. | S04, S05 |
| `fx-helper` | Shared particles, twinkles, rings, shards, smoke and effect colour steps. **Required**: every effect and projectile is built from it, so all effects share one look. | S17, S18, S19 |
| `ui-helper` | Nine-slice panel, button states, bar housing and fill. | S20 |
| `backdrop-helper` | Wrapping outlines and scatter for 320x180 layers; `recede()`. | S13 |
| `compose-kit` | The clock, section gates, five melody instruments and limiter every track shares. | S21, S22 |
