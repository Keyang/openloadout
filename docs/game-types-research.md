# Which 2D game types should Loadout's first three bundles serve?

Written 2026-11-18. All sources were read on 2026-11-18.

## (a) Verdict

1. **Platformer is first by a wide margin: 25 of 100 games.** This is high confidence. Add metroidvania (5), run-and-gun (5) and beat-em-up (5), which use mostly the same side-view assets, and the side-view action family reaches 40.
2. **Turn-based RPG is second with 10.** Confidence is medium. Its overworld is **top-down** (9 of the 10), but the battle screen is usually side view, so half its sprites fit what we already make.
3. **Roguelike / roguelite action is third with 8.** Confidence is low to medium, because **adventure / visual novel ties it at 8**. Roguelike action wins the tie because it is rising: 6 of the 45 modern Steam rows against 2 of the 55 classic rows. It also needs many sprites, while adventure games are mostly bespoke backgrounds and portraits. 6 of the 8 are **top-down**.
4. **The honest top three includes two top-down types** (turn-based RPG and roguelike action). If we want to stay side view for now, the next side-view type is metroidvania (5), which in practice is a second platformer bundle.
5. The ranking depends on the list. Players' favourites on Steam spread across many types: platformer 6, roguelike action 6, adventure 6, strategy 5. The critics' list is dominated by classic platformers (19 of 55). Only "platformer first" holds in both.

## (b) Sources and method

| # | Source | What "top" means there | Rows taken |
|---|---|---|---|
| A | [Steam250, "2D" tag ranking](https://steam250.com/tag/2d) | Steam games tagged 2D, ranked by Steam250's rating built from Steam user reviews. The free page shows the top 150 | Ranks 1 to 45 (45 rows) |
| B | [Wikipedia, "List of video games considered the best"](https://en.wikipedia.org/wiki/List_of_video_games_considered_the_best) | Games that appear on many published "best games of all time" lists, compiled by Wikipedia editors (critic consensus, all eras) | Every 2D game released 1985 or later that is not already in A (55 rows) |
| C (cross-check only) | [Wikipedia, "List of best-selling video games"](https://en.wikipedia.org/wiki/List_of_best-selling_video_games) | Top 50 by units sold | Not added. Used to mark which rows are also best-sellers |
| D (cross-check only) | [Retro Dodo, "10 Best 2D Video Games Of All Time"](https://retrododo.com/best-2d-video-games/) (updated 2022-10-28) | One writer's top 10 | Not added. Of its 10, Cuphead is in A, Donkey Kong Jr. (1982) falls before the cutoff, Street Fighter II Turbo is counted as Street Fighter II, and the other 7 are in B |

How the 100 rows were built:

- **A covers modern players' taste and B covers critics' taste across eras.** That gives 45 + 55 = 100 rows, and every row comes from a list read today.
- **Overlap.** Eight games in A are also in B: Stardew Valley, Hollow Knight, Undertale, Plants vs. Zombies, Celeste, Hotline Miami, Papers, Please and Phoenix Wright. Each is counted once, in A, and the table marks them "A+B".
- **The 1985 cutoff for B.** List B also holds about 20 pre-1985 2D arcade games (Space Invaders, Asteroids, Pac-Man, Galaga, Defender and others). I left them out because single-screen arcade games are a poor guide to what people build today. Counting them would move shoot-em-up from 3 to about 15 and maze games from 0 to about 3. Platformer would still be first.
- **What counts as 2D in B is my judgement**, based on gameplay plane and sprite art. I left out 2.5D games with 3D-rendered worlds, such as Inside, Viewtiful Joe and Return of the Obra Dinn. For A, I took Steam's 2D tag as given, even for two games that are mostly 3D (MiSide, Inscryption). They appear as view "other".
- **Type, view and art style come from my own knowledge of the games, not from the sources.** The sources give only the name, year and their own tag or genre. Treat the type, view and pixel columns as unverified classification. The genres the sources print agree with my types in nearly every case, for example "Platform", "Top-down shooter" and "Role-playing" in B, and "Metroidvania" and "Action Roguelike" in A.
- **Type vocabulary.** I used the brief's list plus four extra types the data needed: beat-em-up, action-adventure / action RPG (Zelda-like), adventure / visual novel (point-and-click and narrative), and simulation / management and other (idle, party).
- **Primary vs. second type.** Where a game spans two types, it is counted under its primary type, and the second type is noted in the table. For example, Dead Cells is roguelike action with metroidvania second, and Spelunky is roguelike action with platformer second.
- **Not used:** SteamDB's [2D top-rated list](https://steamdb.info/stats/gameratings/?tagid=3871) returned HTTP 403, so A comes from Steam250 instead. There is also no mobile source (see f).

## (c) The 100 games

Source: A = Steam250 2D rank, B = critics' list, A+B = in both, C = also in the best-selling top 50. View: side, top-down, iso (isometric), fixed (fixed screen), other (mostly 3D). Pixel: Y, N, or "sprite" for pre-rendered or digitised sprites. **Type, view and pixel are unverified classification (see b).**

| # | Game | Year | Src | Type (primary) | 2nd type | View | Pixel |
|---|---|---|---|---|---|---|---|
| 1 | Stardew Valley | 2016 | A1+B, C | farming / life sim | | top-down | Y |
| 2 | Terraria | 2011 | A2, C | sandbox / survival-crafting | | side | Y |
| 3 | Hollow Knight | 2017 | A3+B | metroidvania | | side | N (hand-drawn) |
| 4 | The Binding of Isaac: Rebirth | 2014 | A4 | roguelike action | shooter | top-down | Y |
| 5 | Bloons TD 6 | 2018 | A5 | strategy / tower defence | | top-down | N (3D-rendered) |
| 6 | Vampire Survivors | 2022 | A6 | roguelike action | | top-down | Y |
| 7 | People Playground | 2019 | A7 | sandbox / survival-crafting | physics toy | side | N |
| 8 | RimWorld | 2018 | A8 | strategy (colony sim) | management | top-down | N |
| 9 | Undertale | 2015 | A9+B | turn-based RPG | bullet-hell combat | top-down | Y |
| 10 | Balatro | 2024 | A10 | card / deckbuilder | roguelike | fixed | Y |
| 11 | Factorio | 2020 | A11 | strategy (automation) | | top-down | N |
| 12 | DELTARUNE | 2025 | A12 | turn-based RPG | | top-down | Y |
| 13 | Plants vs. Zombies | 2009 | A13+B | strategy / tower defence | | fixed | N |
| 14 | Dead Cells | 2018 | A14 | roguelike action | metroidvania | side | Y |
| 15 | MiSide | 2024 | A15 | adventure / visual novel | horror | other | N |
| 16 | Celeste | 2018 | A16+B | platformer | | side | Y |
| 17 | Cuphead | 2017 | A17 | run-and-gun | boss rush | side | N (hand-drawn) |
| 18 | Helltaker | 2020 | A18 | puzzle | visual novel | fixed | N |
| 19 | Geometry Dash | 2014 | A19 | platformer | rhythm | side | N |
| 20 | Inscryption | 2021 | A20 | card / deckbuilder | adventure | other | N (mostly 3D) |
| 21 | Dave the Diver | 2023 | A21 | simulation / management | roguelite action | side | Y |
| 22 | Oxygen Not Included | 2019 | A22 | strategy (colony sim) | | side | N |
| 23 | Ori and the Will of the Wisps | 2020 | A23 | metroidvania | | side | N |
| 24 | Among Us | 2018 | A24 | other (party / social) | | top-down | N |
| 25 | Hotline Miami | 2012 | A25+B | shoot-em-up / shooter (top-down) | | top-down | Y |
| 26 | Castle Crashers | 2012 | A26 | beat-em-up | | side | N |
| 27 | Pizza Tower | 2023 | A27 | platformer | | side | Y |
| 28 | Bongo Cat | 2025 | A28 | other (idle) | | fixed | N |
| 29 | Katana ZERO | 2019 | A29 | platformer (action) | | side | Y |
| 30 | The Henry Stickmin Collection | 2020 | A30 | adventure / visual novel | | side | N |
| 31 | OneShot | 2016 | A31 | adventure / visual novel | puzzle | top-down | Y |
| 32 | Cult of the Lamb | 2022 | A32 | roguelike action | management | top-down | N |
| 33 | OMORI | 2020 | A33 | turn-based RPG | | top-down | N (hand-drawn) |
| 34 | Papers, Please | 2013 | A34+B | puzzle | simulation | fixed | Y |
| 35 | South Park: The Stick of Truth | 2014 | A35 | turn-based RPG | | side | N |
| 36 | Brotato | 2023 | A36 | roguelike action | | top-down | N |
| 37 | Cookie Clicker | 2021 | A37 | other (idle) | | fixed | N |
| 38 | BattleBlock Theater | 2014 | A38 | platformer | | side | N |
| 39 | GRIS | 2018 | A39 | platformer | puzzle | side | N (painted) |
| 40 | HoloCure | 2023 | A40 | roguelike action | | top-down | Y |
| 41 | To the Moon | 2011 | A41 | adventure / visual novel | | top-down | Y |
| 42 | Volcano Princess | 2023 | A42 | farming / life sim (raising) | | fixed | N |
| 43 | Broforce | 2015 | A43 | run-and-gun | | side | Y |
| 44 | Firework | 2021 | A44 | adventure / visual novel | horror | side (unverified) | N |
| 45 | Phoenix Wright: Ace Attorney Trilogy | 2019 (orig. 2001) | A45+B | adventure / visual novel | | fixed | N |
| 46 | Ghosts 'n Goblins | 1985 | B | platformer | | side | Y |
| 47 | Super Mario Bros. | 1985 | B, C | platformer | | side | Y |
| 48 | Tetris | 1985 | B, C | puzzle | | fixed | Y |
| 49 | Bubble Bobble | 1986 | B | platformer | | side (single screen) | Y |
| 50 | Castlevania | 1986 | B | platformer | | side | Y |
| 51 | The Legend of Zelda | 1986 | B | action-adventure / action RPG | | top-down | Y |
| 52 | Metroid | 1986 | B | metroidvania | | side | Y |
| 53 | Arkanoid | 1986 | B | puzzle (block breaker) | | fixed | Y |
| 54 | Contra | 1987 | B | run-and-gun | | side | Y |
| 55 | Double Dragon | 1987 | B | beat-em-up | | side | Y |
| 56 | R-Type | 1987 | B | shoot-em-up / shooter | | side | Y |
| 57 | Mega Man 2 | 1988 | B | platformer | run-and-gun | side | Y |
| 58 | Ninja Gaiden | 1988 | B | platformer | | side | Y |
| 59 | Super Mario Bros. 3 | 1988 | B | platformer | | side | Y |
| 60 | Final Fight | 1989 | B | beat-em-up | | side | Y |
| 61 | Golden Axe | 1989 | B | beat-em-up | | side | Y |
| 62 | Prince of Persia | 1989 | B | platformer | | side | Y |
| 63 | The Secret of Monkey Island | 1990 | B | adventure / visual novel | | side | Y |
| 64 | Super Mario World | 1990 | B | platformer | | side | Y |
| 65 | Another World | 1991 | B | platformer | | side | N (vector) |
| 66 | Final Fantasy IV | 1991 | B | turn-based RPG | | top-down | Y |
| 67 | The Legend of Zelda: A Link to the Past | 1991 | B | action-adventure / action RPG | | top-down | Y |
| 68 | Lemmings | 1991 | B | puzzle | | side | Y |
| 69 | Sonic the Hedgehog | 1991 | B, C | platformer | | side | Y |
| 70 | Street Fighter II | 1991 | B | fighting | | side | Y |
| 71 | Super Castlevania IV | 1991 | B | platformer | | side | Y |
| 72 | Contra III: The Alien Wars | 1992 | B | run-and-gun | | side | Y |
| 73 | Flashback | 1992 | B | platformer | | side | sprite (rotoscoped) |
| 74 | Mortal Kombat | 1992 | B | fighting | | side | sprite (digitised) |
| 75 | Sonic the Hedgehog 2 | 1992 | B | platformer | | side | Y |
| 76 | Streets of Rage 2 | 1992 | B | beat-em-up | | side | Y |
| 77 | Day of the Tentacle | 1993 | B | adventure / visual novel | | side | Y |
| 78 | Gunstar Heroes | 1993 | B | run-and-gun | | side | Y |
| 79 | The Legend of Zelda: Link's Awakening | 1993 | B | action-adventure / action RPG | | top-down | Y |
| 80 | Mega Man X | 1993 | B | platformer | run-and-gun | side | Y |
| 81 | Secret of Mana | 1993 | B | action-adventure / action RPG | | top-down | Y |
| 82 | Donkey Kong Country | 1994 | B | platformer | | side | sprite (pre-rendered) |
| 83 | EarthBound | 1994 | B | turn-based RPG | | top-down | Y |
| 84 | Final Fantasy VI | 1994 | B | turn-based RPG | | top-down | Y |
| 85 | Super Metroid | 1994 | B | metroidvania | | side | Y |
| 86 | Chrono Trigger | 1995 | B | turn-based RPG | | top-down | Y |
| 87 | Yoshi's Island | 1995 | B | platformer | | side | Y |
| 88 | Worms | 1995 | B | strategy (artillery) | | side | Y |
| 89 | Pokémon Red and Blue | 1996 | B, C | turn-based RPG | | top-down | Y |
| 90 | Castlevania: Symphony of the Night | 1997 | B | metroidvania | action RPG | side | Y |
| 91 | Pokémon Gold and Silver | 1999 | B, C | turn-based RPG | | top-down | Y |
| 92 | Street Fighter III: 3rd Strike | 1999 | B | fighting | | side | Y |
| 93 | Advance Wars | 2001 | B | strategy (turn-based tactics) | | top-down | Y |
| 94 | Ikaruga | 2001 | B | shoot-em-up / shooter | | top-down (vertical) | N (3D-rendered) |
| 95 | Peggle | 2007 | B | puzzle | | fixed | N |
| 96 | Braid | 2008 | B | platformer | puzzle | side | N (painted) |
| 97 | Spelunky | 2008 | B | roguelike action | platformer | side | Y |
| 98 | Angry Birds | 2009 | B | puzzle (physics) | | side | N |
| 99 | Shovel Knight | 2014 | B | platformer | | side | Y |
| 100 | Hades | 2020 | B | roguelike action | | iso | N (painted) |

**Verified:** all 100 rows are on list A or list B as read today (game name and year from the source). **Unverified:** the type, second type, view and pixel columns, which are my classification.

## (d) Counts

### By primary type

| Type | A (Steam, 45) | B (critics, 55) | Total | Main view |
|---|---|---|---|---|
| **Platformer** | 6 | 19 | **25** | side 25/25 |
| **Turn-based RPG** | 4 | 6 | **10** | top-down 9, side 1 |
| **Roguelike / roguelite action** | 6 | 2 | **8** | top-down 5, side 2, iso 1 |
| Adventure / visual novel | 6 | 2 | 8 | side 4, top-down 2, fixed 1, other 1 |
| Puzzle | 2 | 5 | 7 | fixed 5, side 2 |
| Strategy / tower defence | 5 | 2 | 7 | top-down 4, side 2, fixed 1 |
| Metroidvania | 2 | 3 | 5 | side 5/5 |
| Run-and-gun | 2 | 3 | 5 | side 5/5 |
| Beat-em-up | 1 | 4 | 5 | side 5/5 |
| Action-adventure / action RPG | 0 | 4 | 4 | top-down 4/4 |
| Fighting | 0 | 3 | 3 | side |
| Shoot-em-up / shooter | 1 | 2 | 3 | top-down 2, side 1 |
| Farming / life sim | 2 | 0 | 2 | top-down 1, fixed 1 |
| Sandbox / survival-crafting | 2 | 0 | 2 | side |
| Card / deckbuilder | 2 | 0 | 2 | fixed 1, other 1 |
| Simulation / management | 1 | 0 | 1 | side |
| Other (idle, party) | 3 | 0 | 3 | |
| **Total** | 45 | 55 | 100 | |

Points to read the table by:

- **Third place is a tie.** Roguelike action and adventure / visual novel both have 8. Puzzle and strategy / tower defence are one behind at 7.
- **Counting second types does not break the tie.** Balatro and Dave the Diver add a roguelike element, and Inscryption and Helltaker add an adventure or visual-novel element, so each side reaches 10.
- **Families.** The side-view action family (platformer, metroidvania, run-and-gun, beat-em-up) totals 40. The top-down RPG family (turn-based RPG plus action-adventure / action RPG) totals 14.
- **Era skew.** Platformers are 35% of the critics' list (19/55) but only 13% of the Steam list (6/45). On Steam, players' favourites spread evenly over platformer, roguelike, adventure and strategy.
- **Farming / life sim scores low (2), but it is the #1 game on Steam.** Stardew Valley is A1 and also a top-50 best-seller. Demand is concentrated in one game rather than spread across many.

### By camera view

| View | A | B | Total |
|---|---|---|---|
| Side | 19 | 39 | **58** |
| Top-down | 16 | 12 | **28** |
| Fixed screen | 8 | 3 | **11** |
| Isometric | 0 | 1 | 1 |
| Other (mostly 3D) | 2 | 0 | 2 |

Modern games are much more often top-down: 16 of 45 on Steam against 12 of 55 in the critics' list. Roughly 68 of the 100 are pixel art or pixel-era sprites (unverified count).

## (e) Three bundle outlines

The outlines follow Contract 1 (`meta.type`, `meta.role`, `meta.view`) and Contract 2 (tilesets have one clip per tile; top-down characters have `idle_down`, `walk_down`, `walk_up` and `walk_side`; interface pieces have clips per state). **Reuse** marks an existing Loadout asset. Everything else is new and original: generic fantasy and sci-fi archetypes, with no names, characters, art or music taken from any game in the table.

Sizes: bundle 1 has 47 sprites, bundle 2 has 48, and bundle 3 has 47. Each has 20 sound effects and 2 music tracks.

Some assets are shared between bundles: `chest-open`, `door-creak` and `explosion-small` are each made once and used twice. Building all three bundles means about 125 new sprites, 37 new sounds and 3 new music tracks.

### Bundle 1: `kit-platformer-fantasy`, "Thornwood Keep platformer kit"

Theme: fantasy (forest and castle). View: **side**. This bundle fits what we can make today.

**Sprites (47)**

| # | id | Name | type | role | Clips / tiles |
|---|---|---|---|---|---|
| 1 | `knight` (reuse) | Knight hero | character | characters/player | idle, run, jump, fall, attack, hurt, die (add `land`, `climb` if missing) |
| 2 | `slime` (reuse) | Slime | creature | characters/enemy | idle, hop, hurt, die |
| 3 | `bat` (reuse) | Bat | creature | characters/enemy | fly, swoop, hurt, die |
| 4 | `wolf` (reuse) | Wolf | creature | characters/enemy | idle, run, bite, hurt, die |
| 5 | `wizard` (reuse) | Wizard guide | character | characters/npc | idle, talk, cast |
| 6 | `thorn-beetle` | Thorn beetle | creature | characters/enemy | walk, turn, curl (cannot be hurt), hurt, die |
| 7 | `spear-goblin` | Spear goblin | character | characters/enemy | idle, walk, thrust, hurt, die |
| 8 | `spore-hopper` | Spore hopper | creature | characters/enemy | idle, hop, puff, die |
| 9 | `crow-scout` | Crow scout | creature | characters/enemy | fly, dive, die |
| 10 | `moss-golem` | Moss golem (boss) | creature | characters/boss | idle, walk, slam, roar, stagger, die |
| 11 | `tiles-forest` | Forest ground tiles | tileset | world/tile | ground-top, ground-fill, ledge-left, ledge-right, corner-inner-l/r, slope-up, slope-down, wall-l/r |
| 12 | `tiles-castle` | Castle stone tiles | tileset | world/tile | floor-top, fill, brick-wall, pillar, window, battlement, arch |
| 13 | `tiles-cave` | Cave rock tiles | tileset | world/tile | ground-top, fill, ceiling, stalactite, ledge-left, ledge-right |
| 14 | `tiles-water` | Water and falls | tileset | world/tile | surface (animated), body, waterfall-top, waterfall (animated) |
| 15 | `ladder-vine` | Vine ladder | tileset | world/tile | top, mid, bottom |
| 16 | `wood-platform` | One-way wood platform | prop | world/platform | left, mid, right |
| 17 | `moving-platform` | Moving platform | prop | world/platform | idle, move |
| 18 | `crumble-block` | Crumbling block | prop | world/platform | idle, shake, crumble, respawn |
| 19 | `spring-pad` | Spring pad | prop | world/platform | idle, bounce |
| 20 | `spike-row` | Spikes | prop | world/hazard | idle, extend, retract |
| 21 | `saw-blade` | Saw blade | prop | world/hazard | spin |
| 22 | `wooden-door` | Wooden door | prop | world/door | closed, open, locked |
| 23 | `treasure-chest` | Treasure chest | prop | world/prop | closed, open, empty |
| 24 | `lever` | Lever | prop | world/prop | off, on |
| 25 | `checkpoint-banner` | Checkpoint banner | prop | world/prop | down, raise, wave |
| 26 | `crate` | Breakable crate | prop | world/prop | idle, hit, break |
| 27 | `campfire` (reuse) | Campfire rest spot | prop | world/prop | burn |
| 28 | `wall-torch` | Wall torch | prop | world/prop | flicker |
| 29 | `signpost` | Signpost | prop | world/prop | static |
| 30 | `coin` (reuse) | Coin | pickup | items/pickup | spin |
| 31 | `gem` | Gem (colour slider) | pickup | items/pickup | sparkle |
| 32 | `heart` | Heart | pickup | items/pickup | pulse |
| 33 | `gold-key` | Key | pickup | items/key | bob |
| 34 | `potion` | Potion | pickup | items/food | bob |
| 35 | `star-charm` | Star charm power-up | pickup | items/pickup | glow |
| 36 | `arrow` | Arrow | projectile | effects/projectile | fly, stuck |
| 37 | `fireball` | Fireball | projectile | effects/projectile | fly, fizzle |
| 38 | `boulder-chunk` | Boss rock | projectile | effects/projectile | spin, shatter |
| 39 | `dust-puff` | Dust puff | effect | effects/dust | land, run-kick, wall-slide |
| 40 | `hit-spark` | Hit spark | effect | effects/spark | burst |
| 41 | `pickup-sparkle` | Pickup sparkle | effect | effects/spark | sparkle |
| 42 | `enemy-poof` | Defeat poof | effect | effects/dust | poof |
| 43 | `explosion-small` | Small explosion | effect | effects/explosion | burst |
| 44 | `bg-forest` | Forest parallax | background | environment/background | far (sky), mid (hills), near (trees) |
| 45 | `bg-castle` | Castle parallax | background | environment/background | far, mid, near |
| 46 | `ui-hud-platformer` | Platformer HUD | ui | interface/bar | heart-full, heart-half, heart-empty, coin-counter, key-slot |
| 47 | `ui-buttons-wood` | Menu buttons | ui | interface/button | normal, hover, pressed |

**Sound effects (20)**

| # | id | Name | type | role | Pairs with |
|---|---|---|---|---|---|
| 1 | `jump` (reuse) | Jump | sfx | actions/jump | knight `jump`, first frame |
| 2 | `footstep-gravel` (reuse) | Footstep | sfx | characters/footstep | knight `run`, foot-down frames |
| 3 | `land-thud` | Land | sfx | actions/land | knight `land` + `dust-puff:land` |
| 4 | `sword-slash` (reuse) | Sword swing | sfx | actions/swing | knight `attack`, fastest frame |
| 5 | `metal-hit` (reuse) | Hit | sfx | actions/hit | attack connects + `hit-spark` |
| 6 | `hero-hurt` | Hero hurt | sfx | characters/hurt | knight `hurt` |
| 7 | `enemy-squish` | Enemy defeat | sfx | characters/death | slime / spore-hopper `die` + `enemy-poof` |
| 8 | `whoosh` (reuse) | Swoop | sfx | actions/dash | bat `swoop`, crow `dive` |
| 9 | `golem-slam` | Ground slam | sfx | effects/impact | moss-golem `slam`, impact frame |
| 10 | `coin-pickup` (reuse) | Coin | sfx | items/pickup | coin collected |
| 11 | `gem-pickup` | Gem | sfx | items/pickup | gem collected + `pickup-sparkle` |
| 12 | `powerup` (reuse) | Power-up | sfx | items/consume | heart, potion or star-charm collected |
| 13 | `chest-open` | Chest open | sfx | world/chest | treasure-chest `open`, first frame |
| 14 | `door-creak` | Door creak | sfx | world/door | wooden-door `open` |
| 15 | `lever-clank` | Lever | sfx | world/lever | lever `on` |
| 16 | `crate-break` | Crate break | sfx | world/break | crate `break` |
| 17 | `spring-boing` | Spring | sfx | world/machine | spring-pad `bounce` |
| 18 | `chime-success` (reuse) | Checkpoint | jingle | interface/reward | checkpoint-banner `raise` |
| 19 | `wind` (reuse) | Forest wind | ambience | environment/ambience | bg-forest loop |
| 20 | `ui-click` (reuse) | Click | sfx | interface/click | ui-buttons-wood `pressed` |

**Music (2)**

| id | Name | role | Use |
|---|---|---|---|
| `thornwood-overworld` | Forest level theme | music/exploration | Levels; upbeat, loopable |
| `battle-theme` (reuse) | Battle theme | music/boss | Moss golem fight; intensity rises with the boss's damage |

### Bundle 2: `kit-rpg-fantasy`, "Hearthvale turn-based RPG kit"

Theme: fantasy (village, fields, dungeon). View: **top-down** for the overworld and **side** for the battle screen. This bundle is a mix, and that keeps it affordable: only the 7 overworld characters need 4-direction clips. The battle sprites are side view, so the knight, wizard, slime, bat and wolf can be reused.

**Sprites (48)**

| # | id | Name | type | role | view | Clips / tiles |
|---|---|---|---|---|---|---|
| 1 | `hero-walker` | Hero (overworld) | character | characters/player | top-down | idle_down, walk_down, walk_up, walk_side |
| 2 | `mage-walker` | Mage ally (overworld) | character | characters/player | top-down | idle_down, walk_down, walk_up, walk_side |
| 3 | `rogue-walker` | Rogue ally (overworld) | character | characters/player | top-down | idle_down, walk_down, walk_up, walk_side |
| 4 | `village-elder` | Elder | character | characters/npc | top-down | idle_down, walk_down, walk_up, walk_side, talk |
| 5 | `merchant` | Merchant | character | characters/npc | top-down | idle_down, talk, wave |
| 6 | `town-guard` | Guard | character | characters/npc | top-down | idle_down, walk_down, walk_up, walk_side |
| 7 | `farm-kid` | Village child | character | characters/npc | top-down | idle_down, walk_down, walk_up, walk_side, run |
| 8 | `knight` (reuse) | Hero battler | character | characters/player | side | idle, attack, hurt, die; add `defend`, `victory` |
| 9 | `wizard` (reuse) | Mage battler | character | characters/player | side | idle, cast, hurt, die; add `victory` |
| 10 | `rogue-battler` | Rogue battler | character | characters/player | side | idle, stab, throw, hurt, ko, victory |
| 11 | `slime` (reuse) | Slime | creature | characters/enemy | side | idle, attack, hurt, die |
| 12 | `bat` (reuse) | Bat | creature | characters/enemy | side | fly, swoop, hurt, die |
| 13 | `wolf` (reuse) | Wolf | creature | characters/enemy | side | idle, bite, hurt, die |
| 14 | `bone-soldier` | Skeleton soldier | creature | characters/enemy | side | idle, attack, hurt, collapse |
| 15 | `thicket-imp` | Thicket imp | creature | characters/enemy | side | idle, cast, hurt, die |
| 16 | `road-bandit` | Bandit | character | characters/enemy | side | idle, attack, steal, hurt, die |
| 17 | `ember-wyrm` | Ember wyrm (boss) | creature | characters/boss | side | idle, breath, wing-buffet, hurt, die |
| 18 | `portraits-party` | Party portraits | character | characters/player | front | per hero: neutral, happy, sad, angry, surprised |
| 19 | `portraits-village` | Villager portraits | character | characters/npc | front | per NPC: neutral, happy, worried |
| 20 | `tiles-grass` | Grass and paths | tileset | world/tile | top-down | grass, grass-alt, flowers, path (16-piece edge set) |
| 21 | `tiles-shore` | Water and shore | tileset | world/tile | top-down | water (animated), shore edges and corners, bridge |
| 22 | `tiles-village` | Village ground and walls | tileset | world/tile | top-down | cobble, wood-floor, wall, roof-edge, fence |
| 23 | `tiles-dungeon` | Dungeon tiles | tileset | world/tile | top-down | floor, wall-top, wall-face, stairs-down, stairs-up, pit |
| 24 | `tree-oak` | Oak tree | prop | world/prop | top-down | static, sway |
| 25 | `tree-pine` | Pine tree | prop | world/prop | top-down | static, sway |
| 26 | `boulder` | Boulder | prop | world/prop | top-down | static |
| 27 | `cottage` | Cottage | prop | world/building | top-down | closed, door-open |
| 28 | `inn` | Inn | prop | world/building | top-down | closed, door-open, lit (night) |
| 29 | `market-stall` | Market stall | prop | world/building | top-down | static, awning-flap |
| 30 | `chest-topdown` | Chest | prop | world/prop | top-down | closed, open |
| 31 | `dungeon-door` | Dungeon door | prop | world/door | top-down | closed, open, sealed |
| 32 | `save-crystal` | Save crystal | prop | world/prop | top-down | glow, activate |
| 33 | `campfire` (reuse) | Camp rest point | prop | world/prop | side | burn |
| 34 | `icons-consumables` | Consumable icons | icon | items/icon | none | potion, ether, antidote, bread, phoenix-feather, tent |
| 35 | `icons-gear` | Equipment icons | icon | items/weapon | none | sword, staff, dagger, shield, helm, armour, ring, boots |
| 36 | `icons-key-items` | Key item icons | icon | items/key | none | key, map, letter, crystal-shard |
| 37 | `coin` (reuse) | Gold | pickup | items/pickup | side | spin |
| 38 | `fx-slash` | Slash | effect | effects/spark | side | slash, cross-slash |
| 39 | `fx-fire-spell` | Fire spell | effect | effects/magic | side | cast, burst |
| 40 | `fx-ice-spell` | Ice spell | effect | effects/magic | side | cast, shatter |
| 41 | `fx-thunder-spell` | Thunder spell | effect | effects/magic | side | strike |
| 42 | `fx-heal` | Heal | effect | effects/magic | side | sparkle-up |
| 43 | `bg-battle-field` | Field battle backdrop | background | environment/background | side | far, mid, ground |
| 44 | `bg-battle-dungeon` | Dungeon battle backdrop | background | environment/background | side | far, mid, ground |
| 45 | `ui-dialogue` | Dialogue box | ui | interface/panel | none | box, name-tag, next-arrow (animated) |
| 46 | `ui-battle-menu` | Battle menu | ui | interface/panel | none | command-panel, cursor (animated), hp-bar, mp-bar, turn-marker |
| 47 | `ui-status-icons` | Status icons | ui | interface/icon | none | poison, sleep, stun, attack-up, defence-down |
| 48 | `ui-damage-digits` | Damage numbers | ui | interface/icon | none | 0–9, miss, crit, heal-digits |

**Sound effects (20)**

| # | id | Name | type | role | Pairs with |
|---|---|---|---|---|---|
| 1 | `footstep-gravel` (reuse) | Path footstep | sfx | characters/footstep | hero-walker `walk_*` on path/cobble |
| 2 | `footstep-grass` | Grass footstep | sfx | characters/footstep | hero-walker `walk_*` on grass |
| 3 | `text-blip` | Text blip | sfx | interface/click | ui-dialogue, each letter |
| 4 | `ui-click` (reuse) | Cursor move | sfx | interface/hover | ui-battle-menu cursor |
| 5 | `menu-confirm` | Confirm | sfx | interface/confirm | ui-battle-menu select |
| 6 | `error-buzz` (reuse) | Can't do that | sfx | interface/error | not enough MP, invalid target |
| 7 | `sword-slash` (reuse) | Sword attack | sfx | actions/swing | knight `attack` + `fx-slash` |
| 8 | `metal-hit` (reuse) | Weapon hit | sfx | actions/hit | physical hit connects |
| 9 | `punch` (reuse) | Monster strike | sfx | actions/hit | wolf `bite`, bandit `attack` |
| 10 | `magic-spell` (reuse) | Cast | sfx | actions/cast | wizard `cast`, first frame |
| 11 | `fire` (reuse) | Fire spell | sfx | effects/magic | `fx-fire-spell:burst` |
| 12 | `ice-shatter` | Ice spell | sfx | effects/magic | `fx-ice-spell:shatter` |
| 13 | `thunder-crack` | Thunder spell | sfx | effects/magic | `fx-thunder-spell:strike` |
| 14 | `heal-shimmer` | Heal | sfx | effects/magic | `fx-heal` |
| 15 | `monster-fade` | Enemy defeated | sfx | characters/death | enemy `die` / `collapse` |
| 16 | `chest-open` (shared with bundle 1) | Chest open | sfx | world/chest | chest-topdown `open` |
| 17 | `door-creak` (shared with bundle 1) | Door | sfx | world/door | cottage / dungeon-door `open` |
| 18 | `coin-pickup` (reuse) | Gold | sfx | items/pickup | gold gained, shop purchase |
| 19 | `chime-success` (reuse) | Save | jingle | interface/reward | save-crystal `activate` |
| 20 | `victory-fanfare` | Victory | jingle | music/victory | battlers' `victory` clips at battle end |

**Music (2)**

| id | Name | role | Use |
|---|---|---|---|
| `hearthvale-village` | Village and fields theme | music/exploration | Overworld and town; calm, loopable |
| `battle-theme` (reuse) | Battle theme | music/battle | Every battle; raise intensity for the wyrm |

### Bundle 3: `kit-roguelite-scifi`, "Derelict Station roguelite kit"

Theme: sci-fi (a derelict space station with an alien hive). View: **top-down**. This is the costlier bundle. The player and the 4 walking enemies need 4-direction clips. The others hover or are symmetrical, so they need only one view. The kit covers twin-stick room-clearing and the "survivors" horde style, through `swarm-mite`, `xp-shard` and the upgrade cards.

**Sprites (47)**

| # | id | Name | type | role | Clips / tiles |
|---|---|---|---|---|---|
| 1 | `void-ranger` | Ranger | character | characters/player | idle_down, walk_down, walk_up, walk_side, dodge, hurt, die (arm/gun as a part that rotates to aim) |
| 2 | `crawler-bug` | Crawler | creature | characters/enemy | walk_down, walk_up, walk_side, bite, die |
| 3 | `spitter-bug` | Spitter | creature | characters/enemy | idle, spit, die |
| 4 | `swarm-mite` | Swarm mite | creature | characters/enemy | skitter, die (small, drawn for crowds) |
| 5 | `scout-drone` | Scout drone | creature | characters/enemy | hover, shoot, die |
| 6 | `security-bot` | Security bot | creature | characters/enemy | walk_down, walk_up, walk_side, charge, shoot, die |
| 7 | `shield-trooper` | Shield trooper | character | characters/enemy | walk_down, walk_up, walk_side, block, shoot, die |
| 8 | `hive-mother` | Hive mother (boss) | creature | characters/boss | idle, spawn, spray, enrage, die |
| 9 | `warden-mech` | Warden mech (boss) | creature | characters/boss | walk, missile-volley, beam-sweep, overheat, die |
| 10 | `vendor-bot` | Vendor bot | character | characters/npc | idle, talk, sell |
| 11 | `tiles-station-floor` | Station floor | tileset | world/tile | floor, panel, grate, vent (animated), hazard-stripe, blood-goo decal |
| 12 | `tiles-station-walls` | Station walls | tileset | world/tile | wall-top, wall-face, corner-in, corner-out, door-frame |
| 13 | `tiles-hive` | Hive tiles | tileset | world/tile | floor, wall, goo (animated), egg-cluster |
| 14 | `tiles-pit` | Pit edges | tileset | world/tile | edges and corners, void (animated stars) |
| 15 | `blast-door` | Blast door | prop | world/door | closed, opening, open, locked |
| 16 | `supply-crate` | Supply crate | prop | world/prop | idle, hit, break |
| 17 | `fuel-barrel` | Explosive barrel | prop | world/hazard | idle, hit-flash, explode |
| 18 | `acid-pool` | Acid pool | prop | world/hazard | bubble |
| 19 | `laser-gate` | Laser gate | prop | world/hazard | on, off |
| 20 | `wall-terminal` | Terminal | prop | world/prop | idle, active |
| 21 | `warp-pad` | Warp pad | prop | world/prop | idle, charge, warp |
| 22 | `tech-chest` | Loot cache | prop | world/prop | closed, open |
| 23 | `upgrade-pedestal` | Upgrade pedestal | prop | world/prop | idle, taken |
| 24 | `credit-chip` | Credit chip | pickup | items/pickup | spin |
| 25 | `health-cell` | Health cell | pickup | items/food | pulse |
| 26 | `shield-cell` | Shield cell | pickup | items/pickup | pulse |
| 27 | `xp-shard` | XP shard | pickup | items/pickup | glow, magnetize |
| 28 | `keycard` | Keycard | pickup | items/key | bob |
| 29 | `icons-upgrades` | Upgrade icons | icon | items/icon | damage, fire-rate, speed, multishot, pierce, magnet, shield, crit, regen, dash |
| 30 | `icons-weapons` | Weapon icons | icon | items/weapon | blaster, scatter, beam, rocket, orbit-blades |
| 31 | `blaster-bolt` | Blaster bolt | projectile | effects/projectile | fly, impact |
| 32 | `scatter-pellet` | Scatter pellet | projectile | effects/projectile | fly, impact |
| 33 | `micro-rocket` | Micro rocket | projectile | effects/projectile | fly (with trail) |
| 34 | `plasma-orb` | Enemy plasma orb | projectile | effects/projectile | fly, pop |
| 35 | `acid-glob` | Acid glob | projectile | effects/projectile | arc, splat |
| 36 | `orbit-blade` | Orbit blade | projectile | effects/projectile | spin |
| 37 | `muzzle-flash` | Muzzle flash | effect | effects/spark | flash |
| 38 | `hit-flash` | Hit flash | effect | effects/spark | burst |
| 39 | `explosion-small` (shared with bundle 1) | Small explosion | effect | effects/explosion | burst |
| 40 | `explosion-large` | Large explosion | effect | effects/explosion | burst, smoke |
| 41 | `dodge-trail` | Dodge afterimage | effect | effects/dust | trail |
| 42 | `spawn-warp` | Enemy spawn warning | effect | effects/magic | telegraph, open, close |
| 43 | `debris-burst` | Debris | effect | effects/dust | scrap, goo |
| 44 | `bg-starfield` | Starfield | background | environment/background | far, mid (menus and station windows) |
| 45 | `ui-hud-roguelite` | Roguelite HUD | ui | interface/bar | hp-pip, shield-pip, credit-counter, xp-bar, room-map icons |
| 46 | `ui-upgrade-card` | Upgrade card | ui | interface/panel | normal, hover, pressed; frames common, rare, epic |
| 47 | `ui-crosshair` | Crosshair | ui | interface/cursor | idle, firing, reload |

**Sound effects (20)**

| # | id | Name | type | role | Pairs with |
|---|---|---|---|---|---|
| 1 | `laser-shot` (reuse) | Blaster | sfx | actions/shoot | `blaster-bolt` fire + `muzzle-flash` |
| 2 | `scatter-blast` | Scatter gun | sfx | actions/shoot | `scatter-pellet` fire |
| 3 | `rocket-launch` | Rocket | sfx | actions/shoot | `micro-rocket` fire |
| 4 | `metal-hit` (reuse) | Bolt hits armour | sfx | actions/hit | bolt impact on bots + `hit-flash` |
| 5 | `explosion` (reuse) | Explosion | sfx | effects/explosion | `fuel-barrel:explode`, `explosion-large` |
| 6 | `whoosh` (reuse) | Dodge | sfx | actions/dash | void-ranger `dodge` + `dodge-trail` |
| 7 | `footstep-metal` | Metal footstep | sfx | characters/footstep | void-ranger `walk_*` foot-down frames |
| 8 | `ranger-hurt` | Ranger hurt | sfx | characters/hurt | void-ranger `hurt` |
| 9 | `bug-splat` | Bug death | sfx | characters/death | crawler / spitter / mite `die` + `debris-burst:goo` |
| 10 | `bot-shutdown` | Robot death | sfx | characters/death | drone / security-bot `die` + `debris-burst:scrap` |
| 11 | `hive-shriek` | Boss shriek | sfx | characters/voice | hive-mother `enrage` |
| 12 | `shield-break` | Shield break | sfx | effects/impact | shield reaches 0 |
| 13 | `coin-pickup` (reuse) | Credits | sfx | items/pickup | credit-chip collected |
| 14 | `xp-blip` | XP collect | sfx | items/pickup | xp-shard `magnetize` end (pitch rises in a streak) |
| 15 | `powerup` (reuse) | Upgrade | sfx | items/equip | upgrade card chosen, health/shield cell |
| 16 | `door-hiss` | Blast door | sfx | world/door | blast-door `opening` (room cleared) |
| 17 | `warp-out` | Warp | sfx | world/machine | warp-pad `warp` (next floor) |
| 18 | `spaceship-hum` (reuse) | Station hum | ambience | environment/ambience | every station room, looped |
| 19 | `bubbles` (reuse) | Acid bubbling | ambience | environment/ambience | acid-pool, tiles-hive goo |
| 20 | `ui-click` (reuse) | Card select | sfx | interface/click | ui-upgrade-card `pressed` |

**Music (2)**

| id | Name | role | Use |
|---|---|---|---|
| `derelict-run` | Station run theme | music/exploration | Room-to-room play; synth, driving, intensity rises with the floor number |
| `battle-theme` (reuse) | Battle theme | music/boss | Boss rooms (pick the lead instrument closest to synth) |

## (f) What I could not verify

- **The type, view and pixel columns are my own classification** from prior knowledge of the games, not taken from the sources. The same applies to the roughly 68 pixel-art figure. Firework's view is the least certain row.
- **List B uses Wikipedia's own inclusion rule**, which requires appearing on several published best-of lists. I did not open the underlying publications. Which B games count as 2D, and the 1985 cutoff, are my choices.
- **Steam250's exact ranking formula** was not checked. I describe it only as a ranking built from Steam user reviews, as the page states. SteamDB's equivalent 2D list was blocked (HTTP 403), so the two Steam rankings were not compared.
- **No mobile source was used.** Mobile app-store charts are dominated by free-to-play titles and are not split by 2D vs 3D, and I found no reliable "top 2D mobile games" ranking. Angry Birds (from list B) is the only mobile-first game in the 100. Adding a mobile list would probably raise puzzle, idle and casual strategy / tower defence.
- **No console-specific or sales-weighted 2D list was used**, except the best-seller cross-check (C). That list is not filtered to 2D, and only 7 of the 100 games appear in its top 50.
- **The bundle sizes are planning estimates.** I did not check whether the reused sprites already have every clip listed (for example `knight:land` or `wizard:victory`). The "add ... if missing" notes mark the likely gaps.
