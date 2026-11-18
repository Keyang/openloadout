# 2D game assets: what devs make, and how to categorize a library

Written 2026-11-18. Reference notes for organizing a sprite / sound effect / music library site so game devs can find what they need.

Contents:

1. [What a 2D game needs](#1-what-a-2d-game-needs) (platformer or top-down action)
2. [What changes for a farming / life sim](#2-what-changes-for-a-farming--life-sim) (Stardew Valley style)
3. [How to categorize a library site](#3-how-to-categorize-a-library-site)

---

## 1. What a 2D game needs

Sprites and sounds are made as pairs: most animations have a sound that fires on a specific frame.

### Sprites

| Group | What it is | Examples |
|---|---|---|
| Characters | The player, enemies and NPCs, each with a set of animations | Idle (4–6 frames), run (6–8), jump, fall, attack, hurt, die |
| Environment | Tiles that snap together to build levels | Ground, walls, platforms, ladders, water, spikes |
| Props | Objects placed in the level | Chests, doors, crates, torches, signs, levers |
| Pickups | Things the player collects | Coins, gems, hearts, keys, potions |
| Projectiles | Things that fly | Arrows, bullets, fireballs |
| Effects (VFX) | Short one-shot animations | Explosion, dust puff on landing, hit spark, sparkle on pickup |
| Backgrounds | Layers that scroll at different speeds for depth (parallax) | Sky, distant mountains, near trees |
| UI | Menus and on-screen display | Buttons, health bar, icons, panels, cursor |

A character is usually delivered as a **sprite sheet**: one image with every frame laid out in a grid, one row per animation.

### Sound effects

| Group | Examples |
|---|---|
| Movement | Footsteps (often 3–4 variants so they don't sound robotic), jump, land, dash |
| Combat | Sword swing, hit impact, enemy hurt, enemy death, explosion |
| Pickups and rewards | Coin, power-up, key, level-up jingle |
| World | Door open, chest open, lever click, breaking crate |
| UI | Button hover, click, confirm, cancel, error |
| Ambience (loops) | Wind, cave drips, crackling torch, rain |
| Stingers | Short musical cues: victory, game over, checkpoint |

Music is usually treated separately from sound effects: a few looping tracks (menu, level, boss).

### How they pair up

| Animation | Sound | Fires on |
|---|---|---|
| Run | Footstep | The frames where a foot touches the ground |
| Jump | Whoosh or "hup" | First frame |
| Land | Thud, plus a dust puff effect | First frame |
| Sword attack | Swing | The frame the blade moves fastest |
| Attack connects | Impact, plus a hit spark effect | The moment of the hit |
| Coin spin | Chime | When collected, not during the spin |
| Chest open | Creak, then a reward jingle | First frame, then the last frame |

### A realistic small-game list

A simple platformer needs roughly:

- **Sprites:** 1 player (6 animations), 3 enemy types (3–4 animations each), 1 tileset (about 50 tiles), 10 props and pickups, 5 effects, 3 background layers, 1 UI set.
- **Sounds:** 25–40 effects, 2–3 ambience loops, 3 music tracks.

This is why sprite-plus-sound bundles are useful: a "coin" is really a spin animation, a sparkle effect and a chime that all belong together.

---

## 2. What changes for a farming / life sim

A game like Stardew Valley uses the same groups, but the balance shifts: far fewer combat assets, far more tiles, items and "state" sprites (the same object drawn at many stages or seasons). It is also top-down, which multiplies character work by four directions.

### Sprites

| Group | What's different | Examples |
|---|---|---|
| Player | Every animation is drawn in 4 directions, and there is one per tool | Walk ×4, hoe, water, axe, pickaxe, scythe, fishing cast and reel, eat, carry item overhead |
| Player customization | Body, hair, shirt, pants and hats are separate layers stacked at runtime | 30+ hairstyles, each drawn for 4 directions |
| NPCs | Many villagers, each with a walk cycle plus **portraits** for dialogue | 30+ villagers, each with 4–6 portrait expressions (neutral, happy, sad, angry) |
| Crops | Each crop is a strip of growth stages | Seed, sprout, 3–4 growing stages, ripe, plus a harvested item icon |
| Tilesets | Each outdoor tileset is drawn once per season | Grass, trees and paths in spring, summer, fall, winter |
| Ground states | The same tile changes with player actions | Untilled, tilled, watered, fertilized |
| Animals | 4-direction walk plus idle behaviours, baby and adult versions | Chicken, cow, sheep: walk, eat, sleep |
| Buildings and furniture | Large sprites, often with interior tilesets | Farmhouse, barn, coop, shop interiors, placeable furniture |
| Item icons | The largest count by far: one small icon per item | Hundreds of crops, fish, minerals, cooked dishes, tools, crafting goods |
| Machines | Idle and "working" states | Furnace lit/unlit, keg, sprinkler spray |
| Weather and time | Overlay effects and lighting | Rain, snow, falling leaves, fireflies, night tint |
| UI | Much heavier than a platformer | Inventory grid, toolbar, clock and calendar, shop menu, dialogue box, relationship hearts |

### Sounds

| Group | Examples |
|---|---|
| Tools | Hoe hitting dirt, watering can splash, axe chop, pickaxe on stone, scythe swish |
| Surface footsteps | Different steps for grass, dirt, wood floor, stone, snow, sand |
| Farming | Seed planted, crop harvested "pop", tree falling, rock breaking |
| Animals | Cluck, moo, baa, pet "happy" sound |
| Fishing | Cast, bobber plop, bite alert, reel tension, catch jingle |
| Items and inventory | Pickup pop, item placed, chest open, coins on a sale, crafting complete |
| Dialogue and UI | Text blip per letter, menu open/close, tab switch, purchase |
| Ambience | Birds by day, crickets at night, rain, wind, ocean, different per season |
| Jingles | New day, level-up, quest complete, rare item found |
| Music | Many tracks: several per season, plus town, mines, festivals, night |

### Pairing examples

| Animation | Sound | Fires on |
|---|---|---|
| Hoe swing | Thud into dirt | The frame the hoe hits the ground, when the tile also changes to "tilled" |
| Watering | Splash | The frame the water appears, when the tile darkens |
| Axe on tree | Chop, then a creak and crash on the last hit | Impact frame; the tree shakes on the same frame |
| Harvest | Pop, then the item arcs to the player | When the crop sprite disappears |
| Fishing bite | Alert sound with an "!" bubble | The moment the bite starts, because the player must react to it |
| Walking | Footstep chosen by the tile under the player | Foot-down frames |

### Rough scale

The count is what makes this genre expensive. Stardew Valley has on the order of thousands of individual sprites and several hundred sound effects, most of them small. The work is less about elaborate animation and more about volume and consistency: hundreds of 16×16 item icons, every crop in 5–6 stages, every outdoor tile in four seasons.

For a small game in this style, a sensible starting set is 1 player with 5 tools in 4 directions, 5 crops, 1 seasonal tileset, 3 NPCs with portraits, 40 item icons, and about 40 sounds.

---

## 3. How to categorize a library site

Use **facets (independent filters) rather than one folder tree**. A game dev arrives with a need like "footsteps on snow" or "top-down farmer with tool animations", and a single tree forces you to guess which question they ask first. Give each asset a few tags from separate dimensions, and let people combine them.

### The facets

| Facet | Answers | Values |
|---|---|---|
| **Asset type** | What kind of file is it? | Sprite, tileset, effect (VFX), UI, background, sound effect, ambience loop, music, jingle |
| **Role** | What is it for in the game? | The main browsing tree, below |
| **Theme** | What world does it belong to? | Fantasy, sci-fi, farm, dungeon, city, horror, space, underwater |
| **Game type** | What game am I making? | Platformer, top-down RPG, farming sim, shooter, puzzle, card game |
| **Style** | Will it match my other assets? | Sprites: pixel size (16, 32, 64), palette, outline or none, view (side, top-down, isometric). Audio: 8-bit chiptune, realistic, cartoon, orchestral |
| **Technical** | Will it work in my project? | Sprites: frame count, directions (1, 4, 8), animated or static. Audio: length, loopable, number of variants. Music: tempo, mood, intensity |
| **License** | Can I ship it? | Free, attribution, commercial |

### The role tree

Role is the facet most people browse by, so it deserves a real hierarchy. Keeping the same top-level names for sprites and sounds means a dev who finds a chest sprite can find the chest sound in the same place.

| Role | Sprites | Sounds |
|---|---|---|
| **Characters** | Player, enemies, NPCs, animals, portraits | Footsteps, voice grunts, hurt, death |
| **Actions** | Attack, tool use, jump, cast | Swing, hit, jump, land, dash |
| **Items and pickups** | Coins, food, weapons, keys, icons | Pickup, equip, consume, drop |
| **World** | Tiles, props, buildings, crops, doors | Door, chest, lever, break, footstep surfaces |
| **Effects** | Explosions, sparks, dust, magic | Explosion, magic, impact |
| **Environment** | Backgrounds, weather, lighting | Ambience loops, rain, wind |
| **Interface** | Buttons, panels, bars, cursors | Click, hover, confirm, error, text blip |
| **Music** | — | Menu, exploration, battle, boss, shop, victory and game-over jingles |

### Three things that matter more than the tree

1. **Search by the dev's words, including verbs.** People type "jump", "coin", "chop", "level up", not "movement SFX". Tag every asset with the action or event it represents, plus synonyms (coin, gold, money, pickup).
2. **Make style the stickiest filter.** The biggest problem with asset libraries is that pieces from different sources don't match. Let a user pick "16px, top-down, 4 directions" once and keep it applied while they browse everything.
3. **Link assets that belong together.** Offer packs at three levels:

   | Level | Example |
   |---|---|
   | Object bundle | Chest: open animation, sparkle effect, creak sound, reward jingle |
   | Character bundle | Farmer: all tool animations in 4 directions, plus each tool's sound |
   | Game kit | "Farming sim starter": player, crops, tileset, UI, 40 sounds, 3 music tracks |

   On each asset page, show "goes with" links, such as the sounds that pair with an animation and the frame each fires on.

### Suggested navigation

- **Top bar:** Sprites, Sounds, Music, Packs.
- **Left sidebar:** the role tree, then filters for theme, style and technical specs.
- **Home page:** entry by game type ("Building a platformer? Start here"), which leads to a checklist of what that kind of game needs. This is the most helpful view for newer devs, who don't yet know what they're missing.
