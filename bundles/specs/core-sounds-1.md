# Core sounds, part 1: specification

Written 2026-11-19 for the asset plan (`docs/asset-plan.md`, section 2: core libraries). These sounds belong to no single kit: any bundle may use them. 43 sounds in 8 batches (C01 to C08).

New sounds follow `.claude/skills/sprite-forge/SOUND.md` and `docs/style-guide.md` sections 11 and 13. Where this page and the style guide disagree, this page wins; where this page is silent, the style guide and the skill decide.

## What is different about core sounds

- **No house sound of their own.** A core sound must sit well beside all three kits. Its styles are where it leans: where a row says "kit styles", the three styles are **"Chiptune"** (leans to `kit-platformer-fantasy`: square, pulse, triangle, short and dry), **"Storybook"** (leans to `kit-rpg-fantasy`: soft, sine and bell-like, a little room) and **"Gritty"** (leans to `kit-roguelite-scifi`: dry, crushed, punchy). The default sits between them.
- **`meta.themes`:** `neutral` first, then the themes the sound plainly suits (for example `forest` for leaves). **`meta.gameTypes`:** `arcade` first for pickups, interface sounds and jingles, otherwise the type it suits best; then up to four more. **`meta.words`:** 6 to 14 words a person would type.
- **Originality** (style guide section 13): no sound may copy a famous game sound. Pickups and jingles are the risk: a coin of two notes a fourth apart, a level-up of a rising major arpeggio ending on a held top note and a "secret found" of four rising notes are all too close to well-known sounds. Write your own tune, and say in the report what it is.
- **Do not duplicate** an existing sound in `sounds/` (read the list first). Each row says which existing sound is nearest; yours must be clearly different from it in what it is, not only in settings.
- **Framework:** in this run, do **not** edit `sound/`, `quality/`, `tools/` or any file other than your own `sounds/<id>.json`. Several builders work at once. If the engine lacks something you need, make the nearest sound you can with what exists and say in the report what was missing.

## Footsteps (C01, C02)

Ten surfaces. All: type `sfx`, role `characters/footstep`, category `movement`, varies from take to take, event at time 0, **default length 0.10 to 0.20 s and never over 0.28 s at any control setting** (a run at 14 frames a second leaves under 0.3 s between steps). Controls, exactly: `weight` (Weight, 0.5 to 2, default 1: heavier is lower, longer and darker), `length` (Length, s, log), `bright` (Brightness, 0 to 1), and the one surface control in the row. Styles, exactly: **"Soft shoes"**, **"Heavy boots"**, **"Bare feet"** (bare feet are soft, short and skin-like, with little of the surface's crunch). Nearest existing: `footstep-grass`, `footstep-gravel`, `footstep-metal`: read all three first.

| # | id | Name | Batch | The surface, as sound | Surface control |
|---|---|---|---|---|---|
| 1 | `footstep-stone` | Footstep on stone | C01 | A hard, short knock on a stone floor, a dry click on top, a hint of a hall; no crunch | `scuff` (Scuff: a short scrape after the knock) |
| 2 | `footstep-wood` | Footstep on wood | C01 | A hollow knock on floorboards with a short low resonance under it, the sound of a board with air below | `creak` (Creak: a faint short board creak after some steps) |
| 3 | `footstep-sand` | Footstep on sand | C01 | A soft, dry, fine-grained hiss with almost no thump, slightly longer than grass | `dry` (Dryness: from damp packed sand to loose dry sand) |
| 4 | `footstep-snow` | Footstep on snow | C01 | A muffled squeak and crunch of packed snow: a low soft thump and a short squeaky crunch | `crunch` (Crunch) |
| 5 | `footstep-mud` | Footstep in mud | C01 | A wet, sticky squelch with a low body and a short suck as the foot lifts | `wet` (Wetness) |
| 6 | `footstep-water` | Footstep in shallow water | C02 | A splash: a short bright spray of droplets over a low slap | `depth` (Depth: from a puddle to ankle-deep) |
| 7 | `footstep-leaves` | Footstep on dry leaves | C02 | A crisp crackle of dry leaves, brighter and more broken-up than grass | `crisp` (Crispness) |
| 8 | `footstep-tile` | Footstep on tiles | C02 | A sharp, bright click on a smooth hard floor with a short glassy edge; the indoor heel click | `hard` (Hardness: from rubber sole to hard heel) |
| 9 | `footstep-carpet` | Footstep on carpet | C02 | A soft, dull, close pad with almost no high end; the quietest of the set but still clear on a phone | `pile` (Thickness: from a thin rug to deep carpet) |
| 10 | `footstep-ice` | Footstep on ice | C02 | A hard, glassy tap with a faint high ring and a short skid | `slide` (Slide: a short skid after the step) |

## Hits and breaks (C03)

All: type `sfx`, vary from take to take, attack under 10 ms, crest above 10 dB.

| # | id | Name | role, category | Length (default; range) | What makes the sound | Controls, exactly | Styles, exactly | Nearest existing |
|---|---|---|---|---|---|---|---|---|
| 11 | `wood-knock` | Wooden hit | actions/hit, impact | 0.15 s; 0.08 to 0.35 | A blunt hit on a wooden thing (a staff, a crate, a shield): a dry, hollow knock with a short resonant body | `size`, `length`, `bright`, `snap` | "Staff strike", "Crate bump", "Shield block" | `punch`, `crate-break` |
| 12 | `stone-hit` | Stone hit | effects/impact, impact | 0.2 s; 0.1 to 0.5 | A rock striking rock: a hard dry crack with a few small chips falling after it | `size`, `length`, `bright`, `chips` (Chips) | "Pebble", "Rock", "Boulder" | `golem-slam`, `land-thud` |
| 13 | `glass-break` | Glass break | world/break, impact | 0.6 s; 0.3 to 1.2 | Glass shattering: a bright crack, then a shower of tinkling shards that settle | `size`, `length`, `bright`, `shards` (Shards) | "Bottle", "Window", "Crystal" | `ice-shatter` (must be clearly glass, not ice: less crunch, more ringing shards) |
| 14 | `pot-smash` | Pot smash | world/break, impact | 0.4 s; 0.2 to 0.8 | A clay pot breaking: a dull ceramic crack and a scatter of heavy pieces; the "break the pot to find something" moment | `size`, `length`, `bright`, `pieces` (Pieces) | "Small jar", "Clay pot", "Big urn" | `crate-break` |
| 15 | `arrow-thunk` | Arrow hit | actions/hit, impact | 0.25 s; 0.12 to 0.5 | An arrow or bolt striking a target: a sharp thunk with a short twang of the shaft quivering | `pitch`, `length`, `bright`, `quiver` (Quiver) | "Into wood", "Into a target", "Glancing off" | none |
| 16 | `body-fall` | Body fall | characters/death, impact | 0.35 s; 0.2 to 0.7 | A body dropping to the floor: a heavy soft thud, a short bump of limbs after it, cloth | `weight`, `length`, `bright`, `bounce` (Bounce: the second bump) | "Small creature", "Person", "Armoured knight" | `land-thud` |

## Swings and throws (C04)

All: type `sfx`, vary from take to take.

| # | id | Name | role, category | Length (default; range) | What makes the sound | Controls, exactly | Styles, exactly | Nearest existing |
|---|---|---|---|---|---|---|---|---|
| 17 | `swing-heavy` | Heavy swing | actions/swing, weapon | 0.45 s; 0.25 to 0.8 | A big slow weapon cutting the air: a deep, wide whoosh that swells and falls, a hammer or great-axe | `weight`, `length`, `bright`, `rush` (Rush: how sudden the peak is) | "War hammer", "Great axe", "Club" | `whoosh` |
| 18 | `swish-light` | Light swish | actions/swing, weapon | 0.15 s; 0.08 to 0.3 | A thin fast blade or stick through the air: a high, short whistle-swish | `pitch`, `length`, `bright`, `whistle` (Whistle) | "Dagger", "Rapier", "Stick" | `whoosh`, `sword-slash` |
| 19 | `cloth-flap` | Cloth flap | actions/dash, movement | 0.3 s; 0.15 to 0.6 | A cape, flag or wing of cloth snapping in a turn or a jump: a soft papery flutter with one sharper snap | `size`, `length`, `bright`, `flutter` (Flutter: how many flaps) | "Cape twirl", "Flag snap", "Bird wings" | `dodge-dash` |
| 20 | `throw-toss` | Throw | actions/shoot, movement | 0.3 s; 0.15 to 0.5 | Something thrown by hand: a short grunt-free arm whoosh with a small release click; for grenades, rocks, bottles | `weight`, `length`, `bright`, `spin` (Spin: a whirring of a spinning object) | "Rock", "Bottle", "Throwing star" | `whoosh` |
| 21 | `bow-release` | Bow release | actions/shoot, weapon | 0.35 s; 0.2 to 0.6 | A bowstring released: a taut twang, a soft thump of the limbs and a quick hiss of the arrow leaving | `pitch`, `length`, `bright`, `tension` (Tension) | "Short bow", "Long bow", "Crossbow" | none |
| 22 | `whip-crack` | Whip crack | actions/swing, weapon | 0.3 s; 0.15 to 0.5 | A whip or lash: a rising swish ending in a very sharp crack | `pitch`, `length`, `bright`, `swish` (Swish: how long the build-up is) | "Whip", "Lasso", "Energy lash" | `thunder-crack` (much smaller and drier) |

## Pickups (C05)

All: type `sfx`, role `items/pickup` unless the row says otherwise, category `pickup`, **identical every take**, event at time 0, length 0.15 to 0.6 s, kit styles ("Chiptune", "Storybook", "Gritty") unless the row says otherwise. Controls, exactly: `pitch`, `speed` (Speed), `bright`, and the row's own. Each has its own short tune of 2 to 4 notes, rising (a good thing), clearly different from `coin-pickup`, `gem-pickup`, `credit-pickup`, `powerup`, `xp-blip` and `upgrade-get` and from each other: the report states the notes as steps up or down.

| # | id | Name | What it is | Own control |
|---|---|---|---|---|
| 23 | `heart-pickup` | Heart pickup | Health restored: warm, round, soft; a gentle rise with a soft swell | `glow` (Glow: a soft shimmer after the notes) |
| 24 | `key-pickup` | Key pickup | A key collected: a small metallic jingle of a key ring under a short rising tune | `jingle` (Jingle: how much key-ring rattle) |
| 25 | `star-pickup` | Star pickup | A star or a big collectable: bright, sparkling, the most exciting pickup of the set but still under 0.6 s | `sparkle` (Sparkle; this sound's brightness stand-in, so **no `bright` control**: controls are `pitch`, `speed`, `sparkle`, `notes`) and `notes` (Notes: 3 or 4, stepped) |
| 26 | `ammo-pickup` | Ammo pickup | Ammunition or arrows collected: a mechanical clack-clack of a magazine or a quiver, with a short two-note blip. Styles exactly: **"Arrows"**, **"Bullets"**, **"Energy cells"** | `clack` (Clack) |
| 27 | `item-get` | Item get | Any ordinary item put in the bag: a short neutral "got it" of two notes and a soft pop, the plainest pickup | `pop` (Pop) |
| 28 | `potion-drink` | Potion drink | role `items/consume`. A potion swallowed: two or three quick glugs, then a short rising bubbly shimmer. Not a tune. Styles exactly: **"Health"**, **"Magic"**, **"Poison"** (poison ends with a falling shimmer) | `glugs` (Glugs: 1 to 4, stepped) |

## Alerts (C06)

| # | id | Name | type, role, category | Length (default; range) | What makes the sound | Controls, exactly | Styles, exactly | Notes |
|---|---|---|---|---|---|---|---|---|
| 29 | `alarm-siren` | Alarm | ambience, world/machine, ambience | 4 s loop | A base or ship alarm: a rising-and-falling siren or a two-tone horn, looping | `pitch`, `speed`, `bright`, `grit` | "Siren", "Two-tone horn", "Klaxon" | `"loop": true`; the wobble completes whole cycles in the loop |
| 30 | `warning-beep` | Warning beep | sfx, interface/error, ui | 0.4 s; 0.2 to 0.8 | A short urgent alert: two or three quick identical beeps, for "danger near", "low fuel", "enemy spotted" | `pitch`, `beeps` (Beeps: 1 to 4, stepped), `speed`, `bright` | "Danger near", "Low fuel", "Spotted" | Identical every take. Clearly different from `error-buzz` (a beep, not a buzz) |
| 31 | `low-health` | Low health | sfx, interface/error, ui | 0.6 s; 0.4 to 1.0 | The low-health warning: a double heartbeat thump with a faint high tone; it is played over and over by the game, so it must be calm, not shrill | `pitch`, `speed`, `bright`, `tone` (Tone: the high tone's level) | "Heartbeat", "Soft beep", "Danger pulse" | Identical every take |
| 32 | `timer-tick` | Timer tick | sfx, interface/click, ui | 0.05 s; 0.03 to 0.12 | One tick of a countdown clock: a dry clean click, played once a second | `pitch`, `length`, `bright`, `tock` (Tock: from tick to wooden tock) | "Clock", "Bomb timer", "Stopwatch" | Identical every take |

## Rewards and jingles (C07)

Identical every take. Jingles: `"category": "jingle"`, `meta.type: 'jingle'`, 1 to 3 s, a clear original tune that ends on the home note, no loop. Kit styles unless the row says otherwise.

| # | id | Name | type, role | Length | What it is | Controls, exactly |
|---|---|---|---|---|---|---|
| 33 | `countdown-go` | Countdown go | sfx, interface/confirm | 0.5 s; 0.3 to 0.9 | The "go!" at the end of a 3-2-1 countdown: a higher, longer, brighter version of a countdown beep with a quick lift; pairs with `timer-tick` style "Stopwatch" for the 3-2-1 | `pitch`, `length`, `bright`, `lift` (Lift) |
| 34 | `notify-ping` | Notification | sfx, interface/reward | 0.4 s; 0.2 to 0.8 | A message, quest update or friend online: a soft two-note ping, friendly, never urgent | `pitch`, `length`, `bright`, `ring` (Ring) |
| 35 | `secret-found` | Secret found | jingle, interface/reward | 1.2 s | A hidden room or a puzzle solved: a short mysterious-then-bright little tune. Must not resemble the well-known four-note rising "secret" sting | `pitch`, `speed`, `bright`, `space` |
| 36 | `level-up` | Level up | jingle, interface/reward | 1.6 s | A character gains a level: a confident rising tune with a small flourish; triumphant but short | `pitch`, `speed`, `bright`, `space` |
| 37 | `quest-complete` | Quest complete | jingle, music/victory | 2.4 s | A task done: a warm, satisfied, slightly longer tune that resolves; calmer than `victory-fanfare` | `pitch`, `speed`, `bright`, `space` |
| 38 | `game-over` | Game over | jingle, music/gameover | 2.2 s | The player lost: a short falling, sad but gentle tune that ends on the home note; not comic | `pitch`, `speed`, `bright`, `space` |

## World (C08)

All: type `sfx`, vary from take to take unless the row says otherwise.

| # | id | Name | role, category | Length (default; range) | What makes the sound | Controls, exactly | Styles, exactly | Nearest existing |
|---|---|---|---|---|---|---|---|---|
| 39 | `water-splash` | Splash | effects/impact, impact | 0.6 s; 0.3 to 1.2 | Something falling into water: a deep plop, a spray of droplets, a short gurgle | `size`, `length`, `bright`, `spray` (Spray) | "Pebble", "Diver", "Big crate" | `bubbles` |
| 40 | `rock-crumble` | Rock crumble | world/break, impact | 0.9 s; 0.5 to 1.8 | A wall or ledge breaking up: a low crack, then a run of rocks tumbling and settling | `size`, `length`, `bright`, `rubble` (Rubble) | "Cracked wall", "Falling ledge", "Cave-in" | `stone-door`, `golem-slam` |
| 41 | `wood-crack` | Wood crack | world/break, impact | 0.5 s; 0.25 to 1.0 | A plank or branch snapping: a sharp splintering crack with fibrous tearing after it | `size`, `length`, `bright`, `splinter` (Splinter) | "Twig", "Plank", "Tree branch" | `crate-break` |
| 42 | `bush-rustle` | Bush rustle | environment/ambience, movement | 0.5 s; 0.25 to 1.0 | Something moving through a bush or tall grass: a burst of leafy rustling that rises and falls; also for searching a bush | `size`, `length`, `bright`, `shake` (Shake) | "Small bush", "Tall grass", "Big hedge" | `footstep-grass` |
| 43 | `shop-bell` | Shop bell | world/door, ui | 0.9 s; 0.5 to 1.6 | The bell over a shop door: a small bright bell rung twice by the door, ringing out. Identical every take | `pitch`, `ring`, `shine` (Shine: brightness stand-in, so **no `bright`**), `swing` (Swing: how many strikes, 1 to 3, stepped) | "Shop door", "Inn door", "Counter bell" | `save-chime` (a door bell, not a chime) |

## Batch plan

| Batch | Sounds |
|---|---|
| C01 | `footstep-stone`, `footstep-wood`, `footstep-sand`, `footstep-snow`, `footstep-mud` |
| C02 | `footstep-water`, `footstep-leaves`, `footstep-tile`, `footstep-carpet`, `footstep-ice` |
| C03 | `wood-knock`, `stone-hit`, `glass-break`, `pot-smash`, `arrow-thunk`, `body-fall` |
| C04 | `swing-heavy`, `swish-light`, `cloth-flap`, `throw-toss`, `bow-release`, `whip-crack` |
| C05 | `heart-pickup`, `key-pickup`, `star-pickup`, `ammo-pickup`, `item-get`, `potion-drink` |
| C06 | `alarm-siren`, `warning-beep`, `low-health`, `timer-tick` |
| C07 | `countdown-go`, `notify-ping`, `secret-found`, `level-up`, `quest-complete`, `game-over` |
| C08 | `water-splash`, `rock-crumble`, `wood-crack`, `bush-rustle`, `shop-bell` |
