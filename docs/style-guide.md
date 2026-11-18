# Loadout: style guide

Written 2026-11-18 by the art director (task W3-S). **Every asset builder reads this before the bundle specification.** It is the set of rules that makes assets from forty builders look and sound like one library. Where this guide and a bundle specification (`bundles/specs/<id>.md`) disagree, the specification wins for that asset; where either disagrees with `docs/architecture.md` or `docs/quality-bar.md`, say so in your report and follow the contract.

All paths are relative to the project folder `lab/sprite-forge/`, with one exception: the skill lives at the workspace root, two folders up. How to write a sprite is in `../../skills/sprite-forge/SKILL.md` and how to write a sound or a track is in `../../skills/sprite-forge/SOUND.md` (both paths as seen from the project folder); this guide only fixes the choices those files leave open. An asset is one file and nothing else: there is no list to add it to and no registration step (the build finds assets by scanning `sprites/` and `sounds/`).

Revised 2026-11-18 after the independent review of the art direction. What changed: the palettes (section 3: seven hex values changed, seven named colours added), `when` on controls and sound cues (sections 9 to 11), the checker's real rule for a visible control (section 10), clip order for props with states and the never-empty-frame rule (section 4), the tile names a level is built from (section 6), jingles (sections 11 and 13) and originality (section 13).

Contents: [1 Pixel scale](#1-pixel-scale) · [2 Line and light](#2-line-and-light) · [3 Colour](#3-colour) · [4 Animation](#4-animation) · [5 Top-down direction clips](#5-top-down-direction-clips) · [6 Tilesets](#6-tilesets) · [7 Backgrounds](#7-backgrounds) · [8 Interface pieces and icons](#8-interface-pieces-and-icons) · [9 Parts](#9-parts) · [10 Controls](#10-controls) · [11 Sound](#11-sound) · [12 Music](#12-music) · [13 Metadata](#13-metadata) · [14 Shared helpers](#14-shared-helpers) · [15 Before you ask for review](#15-before-you-ask-for-review)

---

## 1. Pixel scale

**One pixel is one pixel everywhere.** Nothing is drawn at double size, nothing is scaled inside a sprite, and every pixel is fully solid or fully see-through (no soft edges, no half-transparent pixels).

**The world tile is 32x32.** Half a tile (16) is the grid for small things.

**New assets follow the existing characters: a person is about 35 px tall in a 64x64 frame.** Reasons: the five reused characters and creatures already set that scale and cannot be redrawn; the shared body rig (`rigs/humanoid.js`) is the fastest route to good motion; and at 35 px a face, a weapon and a hat all read. With 32 px tiles that makes a person **about one tile tall** (1.1 tiles), the proportion of a classic platformer hero, a room-based roguelite and a tile-step RPG. A 16 px tile would repeat twice inside one character and make every floor look busy.

### Frame sizes

Use exactly these. `pivot` is where a game anchors the sprite. For anything that stands, the lowest body pixels sit on row `pivot y - 1` and their outline lands on row `pivot y`. Leave a 1 px empty border all round (the checker fails a pixel on the outermost row or column), except tilesets and backgrounds, which must fill the frame.

| Kind | Frame | Pivot | Drawn size at the default look | In tiles |
|---|---|---|---|---|
| Character, side view (humanoid rig) | 64x64 | [28, 58] | 35 px tall; no look taller than 46 px with headgear | 1.1 tall |
| Character, top-down (top-down rig) | 48x48 | [24, 42] | 30 px tall, 16 to 18 px wide; head 12 to 13 px across | 1 tall, half wide |
| Small creature | 48x48 | [24, 42]; flyers [24, 24] with `grounded: false` | body 16 to 28 px | half to 0.9 |
| Four-legged or long creature | 64x48 | [28, 43] | body 40 to 50 px long | 1.5 long |
| Swarm creature | 32x32 | [16, 28] | 16 to 20 px across with its legs (body 12 to 18 px) | half |
| Boss, side view | 96x96 (long body: 128x96) | [44, 90] ([56, 90]) | 56 to 72 px tall | 2 tall |
| Boss, top-down | 96x96 | [48, 88] | 60 to 76 px across | 2 across |
| Tile | 32x32 | [16, 16] | fills the frame | 1 |
| Prop, one tile | 32x32 | [16, 30] | up to 30x28 | 1 |
| Prop, tall | 32x48 or 32x64 | [16, 46] or [16, 62] | | 1 wide, 1.5 or 2 tall |
| Prop, medium | 48x48 or 64x48 | [24, 46] or [32, 46] | | |
| Prop, large | 64x64, 64x80, 96x96, 128x96 | centre x, height - 4 | | 2 to 4 |
| Pickup | 32x32 (tiny: 16x16) | [16, 30] with `grounded: false` (tiny: frame centre) | 16 to 22 px along its longer side (tiny: 8 to 12 px) | half |
| Projectile | 32x16, 16x16 or 32x32 | frame centre, `grounded: false` | long axis, tail included, 16 to 24 px (16x16 frame: 8 to 12 px) | |
| Effect | 32x32, 48x48, 64x64, 96x96 | frame centre; ground effects: bottom centre | | |
| Background layer | 320x180 | [160, 180] | fills the frame | 10 wide |
| Button | 96x32 | frame centre | 94x30 | |
| Panel | 96x64 or 64x96 | frame centre | to the 1 px border | |
| Bar | 64x16 | frame centre | 62x14 | |
| Interface glyph (hearts, pips, status marks, digits) | 16x16 | frame centre | up to 14x14 | |
| Cursor or crosshair | 32x32 | frame centre; the hot spot is its `tip` socket (section 8) | | |
| Icon (inventory, upgrade, weapon) | 32x32 | [16, 16] | 20 to 26 px | 1 slot |
| Portrait | 48x48 | [24, 24] | to the 1 px border | |

Other rules of scale:

- **Fill the frame: one rule for every kind.** At the default look the whole drawing (the body with its parts, tail and trail) spans **half to three quarters of its frame along its longer side**. Every size in the table above sits inside that rule (a pickup is 16 to 22 px of a 32 px frame, never 12); where the table gives a body size, the parts make up the rest. With all sliders low the drawing must still span a third (the checker warns under a third and fails under a quarter). If your thing is too small for its frame, use the next frame size down. Tilesets and backgrounds fill the frame; interface pieces and portraits go to the 1 px border.
- **Fit the tallest look.** All sliders high, mid-jump and mid-attack must stay inside the frame. Scale the motion down for big looks; do not shrink the default look.
- **No baked shadows.** No sprite draws a shadow on the ground under itself; the game adds its own. (A wall's shadow on its own floor tile is part of the tile and is fine.)
- **Side view faces right. Top-down `_side` clips face right.** Games mirror them.
- **Top-down means three-quarter view.** The camera looks from the south, tilted down: you see the top of a thing and its south face. Characters, trees, chests and doors stand up the screen; floors are seen flat. Nothing is drawn as a pure overhead plan except floor decals, pits and pads.

---

## 2. Line and light

| Rule | What to do |
|---|---|
| Outline | Every character, creature, prop, pickup, projectile, icon and interface piece gets `g.outline(INK)` once, after the whole body is drawn. `INK` is `#231b33` from `engine/color.js`. Never choose another outline colour in a sprite (the bundle theme can recolour it later) |
| No outline | Backgrounds have **no** outline anywhere: that is what keeps them behind the game. Glow, fire, sparks, smoke, trails, beams and other light are drawn **after** `g.outline` and are rimmed with a darker tone of their own colour instead (`tone(colour, -1)`), as `campfire` does |
| Tiles | The inside of a tile has no ink. The exposed edge of solid ground or a wall (where it meets air or floor) gets a 1 px `INK` line: **things you can bump into are inked**. A floor-on-floor change (path on grass) uses the material's `deep` tone instead |
| Light | From the top right, always: the engine default (`g.shadow = [-1, 1]`). Do not change it, except for one recessed shape at a time as `coin` does. Top-down sprites use the same light in all three directions |
| Shading depth | Three tones per material from `ramp(colour)`: `light`, `base`, `dark`. `deep` is only for creases and for things on the far side (`farRamp`). Shadow band 1 px (`shade: 2` on shapes wider than 14 px). A highlight band (`light: 1`) only on metal, glass, wet or round glossy things |
| Forbidden | Dithering, gradients, anti-aliasing, single stray pixels, pure black, pure white as a body colour (white is for glints, eyes and flashes) |
| Bodies | Several shapes that make one body are painted with `g.blob`, so the body has one shadow band and no seams |
| Colour count | Colours in one clip at the default look, by kind (the number in brackets is where the checker warns, `THRESHOLDS.colours` in `quality/sprite.js`). Character, creature, boss: 8 to 20 (32), at most five materials. Prop: 6 to 16 (24). Tileset: at most 12 per block (24 per tile). **Pickup: 6 to 12 (16); a tiny 16x16 pickup 4 to 6.** **Projectile: 3 to 8 (12).** Effect: 3 to 12 (24). Background: at most 8 per layer for the landscape, lights not counted (32). Icon and interface piece: at most 10 (16). A specification may ask for fewer (things shown by the hundred), never for more |
| Readability | Parts are told apart by value (light against dark), not only by hue. Eyes, teeth and markings use `pick(bodyColour, '#ffffff', INK)` so they survive any colour the user chooses |

---

## 3. Colour

### How a sprite's colour controls relate to its bundle's palette

Each bundle has one named palette (the tables below). They live in `engine/palettes.js` (helper `palettes`, section 14), and **a colour is always written `PALETTE.<palette>.<name>`**: `PALETTE.thornwood.grass`, `PALETTE.hearthvale.wheat`, `PALETTE.derelict.cyan`. The palette keys are `thornwood`, `hearthvale` and `derelict`. The code also accepts the bundle ids (`PALETTE['kit-platformer-fantasy']`) and the short names `platformer`, `rpg`, `roguelite` and `scifi` as aliases for the same three objects; this guide and the specifications use only the palette keys, and so should a sprite. A specification that says "default grass" means `PALETTE.<that bundle's palette>.grass`.

1. **Defaults come from the bundle palette.** The default of every colour control is a palette colour **by name**, and the specification says which. A specification never asks for "a darker slate" or "a dull purple": if a default is not in the table, the table gets a new named row first.
2. **Swatches start with the palette.** A colour control offers 4 to 8 swatches from `swatches(palette, material, { lead })` (below). The first three or more are palette colours that suit that material; the rest may come from the engine lists (`SKIN`, `HAIR`, `CLOTH`, `METAL`). Every swatch must look right with every other control's swatches, because random looks combine them.
3. **Fixed colours come only from the palette.** A colour that is not a control (a wooden handle, a boot, a rivet) is a palette colour by name, never a new hex.
4. **Tones are derived, never typed.** Use `ramp`, `farRamp`, `tone` and `mix` on the base colour. Do not type a shadow hex. On a base darker than brightness 0.35 (`slate`, `cavern`, `panel`, `plate`, `deck`, `chitin`, `membrane`) the `dark` tone comes close to the outline: carry the form with `light` and `base`, and keep `dark` for creases one pixel wide.
5. **No swatch darker than brightness 0.18** (the checker warns under 0.14: the shape turns into a black blob). Palette colours marked "background only" are never swatches.
6. **2 to 5 colour controls per sprite.**
7. **The same four colours mean the same thing in every bundle:** ink `#231b33`; reward gold `#f2c230`; steel `#c2c9d6`; skin `#f6d3b0`. Danger is always a red, healing always a green, friendly energy always a cyan, and the player's own cloth is the same blue `#3f6fd1` in all three (`hero` in the fantasy palettes, `signal` in Derelict).
8. **Neighbouring materials differ in value, not only in hue.** Two materials that touch on a sprite (cloth against skin, a shell against its legs, a shape against the band behind it in a background) must be told apart by how light or dark they are, so that a whole-bundle look (`THEME_PRESETS` in `engine/theme.js`, which shifts, tints or removes hue) cannot merge them. Check by rendering under at least the looks Sunset, Night, Handheld and Mono. The default colours in the specifications are chosen this way; keep it true for every swatch you offer.

### What `swatches` accepts

`swatches(palette, material, { lead })` returns a new list of 4 to 8 distinct colours for a colour control, palette colours first. It never returns the outline colour, a "background only" colour, or anything darker than brightness 0.18.

| Argument | What to pass |
|---|---|
| `palette` | `'thornwood'`, `'hearthvale'` or `'derelict'` (the aliases above also work) |
| `material` | One word saying what is coloured. `materials(palette)` lists every word that palette accepts. **In every palette:** the colour keys of section 10 (`skin`, `hair`, `outfit`, `trim`, `metal`, `wood`, `stone`, `body`, `accent`, `glow`, `core`, `edge`, `sky`, `land`, `haze`), plus `gem`, `shell`, `grass`, `leaf`, `ground`, `water`, `face`, `frame`. **Only in Hearthvale:** `roof`. **Only in Derelict:** `floor`, `wall`, `flesh`. **Other words for the same lists:** `rock` and `wall` (= `stone`), `cloth` (= `outfit`), `fur` (= `body`), `light` and `energy` (= `glow`), `crystal` (= `gem`), `liquid` (= `water`), `growth` and `foliage` (= `leaf`), `earth`, `dirt` and `floor` (= `ground`). **Or any colour name of that palette** (`'crimson'`, `'acid'`): that colour comes first, then the lists it belongs to. Any other word throws an error that lists the accepted ones |
| `lead` | Optional: the control's default, as a palette colour name (`{ lead: 'goblin' }`) or a hex. It is put first. Pass it whenever the default is not already the first colour of the material's list |

```js
import { PALETTE, swatches } from '../engine/palettes.js';
const P = PALETTE.thornwood;
metal: color('Metal', P.steel, swatches('thornwood', 'metal')),                    // steel is first in the metal list
body:  color('Shell', P.thorn, swatches('thornwood', 'shell')),                    // a material word
shade: color('Back wall', P.cavern, swatches('thornwood', 'stone', { lead: 'cavern' })),   // a default that is not first in its list
```

### Palette "Thornwood" (`kit-platformer-fantasy`)

Storybook forest and castle: saturated greens and earth, with red and gold accents.

| Name | Hex | Used for |
|---|---|---|
| ink | `#231b33` | outlines |
| grass | `#6aa83e` | grass tops, sunlit leaves |
| leaf | `#3f8a4f` | tree canopies, vines, bushes |
| moss | `#a4c44a` | moss, lichen, growth highlights |
| soil | `#7a4f33` | earth fill, roots, dark wood |
| wood | `#a06a3c` | planks, crates, handles, signposts |
| stone | `#8f97a8` | castle and cave stone, pebbles |
| slate | `#5d6475` | back walls, cave rock, stone in shadow |
| cavern | `#3f5068` | the deep-cave back fill and far cave walls (flat fills behind the play area) |
| water | `#3f9fd1` | water |
| sky | `#8fd0f0` | sky (backgrounds) |
| dusk | `#8696dc` | the evening sky of the castle backdrop: `sky` mixed 45% towards `thorn` (backgrounds) |
| haze | `#7fb0b8` | far hills (backgrounds) |
| cream | `#f0ead8` | clouds, bone, parchment, teeth |
| hero | `#3f6fd1` | the hero's cloth; friendly things |
| crimson | `#c9423a` | capes, banners, hearts, danger |
| gold | `#f2c230` | coins, keys, rewards, shine |
| steel | `#c2c9d6` | blades, armour, spikes, fittings |
| thorn | `#7a4fc4` | enemy accent: shells, spores, poison |
| goblin | `#9bd18a` | goblin and monster skin |
| ember | `#e08a2c` | fire, torches, lava |
| magic | `#4fd8ee` | spell glow, gems, checkpoints |
| skin | `#f6d3b0` | human skin |

### Palette "Hearthvale" (`kit-rpg-fantasy`)

The same people as Thornwood in a softer, warmer world: meadow, wheat, terracotta, with one clear colour per spell.

| Name | Hex | Used for |
|---|---|---|
| ink | `#231b33` | outlines |
| meadow | `#7fbf5a` | grass |
| leaf | `#4f9d57` | trees, hedges |
| pine | `#357a4c` | fir trees and other dark foliage |
| wheat | `#e6c96a` | thatch, fields, straw, sand |
| path | `#c9a06a` | dirt paths, sandy banks |
| wood | `#9a6a3e` | timber, fences, furniture |
| cobble | `#a8a4a0` | village stone, plaster in shadow |
| slate | `#5a5f7a` | dungeon walls |
| flagstone | `#7e84a0` | dungeon floors: lighter than the walls round them |
| roof | `#c8553a` | terracotta roofs, awnings |
| water | `#4fa8d8` | water |
| sky | `#9fd8f4` | sky (backgrounds) |
| haze | `#a8c8d8` | far hills (backgrounds) |
| cream | `#f0ead8` | plaster, bone, paper, clouds |
| hero | `#3f6fd1` | the hero |
| mage | `#7a4fc4` | the mage; imps; curses |
| rogue | `#2f8f9d` | the rogue |
| crimson | `#c9423a` | capes, the wyrm, danger |
| bandit | `#8e3a4a` | bandits and other human enemies |
| gold | `#f2c230` | gold, rewards |
| steel | `#c2c9d6` | metal |
| rust | `#a8806a` | rusty metal: the skeleton's blade and armour, old fittings |
| fire | `#e8662c` | fire spell, torches |
| ice | `#7aa0f4` | ice spell: a frost blue clearly darker and bluer than `sky`, so the spell shows against a battle backdrop |
| thunder | `#f4e06a` | thunder spell |
| heal | `#7fe0a0` | healing, buffs |
| magic | `#4fd8ee` | save crystal, spell glow |
| panel | `#3f5490` | interface panel faces |
| skin | `#f6d3b0` | human skin |

### Palette "Derelict" (`kit-roguelite-scifi`)

Cold steel station, lit by small strong lights. Bodies are dark and desaturated; **only energy is saturated**, and its colour says whose it is. **Cool colours are the player's** (pale suit, blue trim, cyan light); **warm colours are warnings** (amber) **and enemies** (red). Nothing the player wears or fires is orange.

| Name | Hex | Used for |
|---|---|---|
| ink | `#231b33` | outlines |
| void | `#141a33` | space, pits (background only, never a swatch) |
| plate | `#434d6d` | inset floor, wall caps: the darkest steel that is still clearly lighter than the outline |
| deck | `#566182` | floor plating |
| hull | `#6b7896` | wall faces, machines, crates |
| panel | `#9aa6c0` | light panels, robot bodies |
| steel | `#c2c9d6` | bright metal |
| suit | `#e8ecf2` | the ranger's suit |
| signal | `#3f6fd1` | the ranger's trim (stripes, gloves, boots) and scatter shot: a strong blue, never to be mistaken for hazard amber |
| cyan | `#5fe0f0` | **friendly energy**: player shots, visors, terminals, interface |
| teal | `#2fb3a8` | station lights and trim, the vendor |
| amber | `#f2a030` | hazard stripes, warnings, explosives, rocket flame |
| red | `#e2473f` | **hostile energy**: enemy lights and shots, locked doors |
| flesh | `#b04a8a` | hive bodies and growth |
| membrane | `#803668` | hive floors: darker and duller than the growth and the bugs on it |
| chitin | `#74489c` | bug shells |
| acid | `#9fe040` | acid, goo, bug glow |
| gold | `#f2c230` | credits |
| heal | `#5fd47a` | health |
| shield | `#4f9ff0` | shields |
| xp | `#b48af8` | experience, rare things |
| nebula | `#6660b6` | nebula clouds in space (backgrounds) |
| cream | `#f0ead8` | the white-hot core of shots, flashes and explosions |
| skin | `#f6d3b0` | human skin |

### What changed in the palettes on 2026-11-18 (after review)

`engine/palettes.js` follows these tables (a unit test reads them). Sprites built before the change pick the new values up through `PALETTE`, because no sprite types a palette hex.

| Palette | Name | Was | Now | Why |
|---|---|---|---|---|
| Thornwood | cavern | (new) | `#3f5068` | named the "darker slate" the cave tileset asked for |
| Thornwood | dusk | (new) | `#8696dc` | named the "dusk" sky the castle backdrop asked for |
| Hearthvale | ice | `#8fd8f0` | `#7aa0f4` | was almost the sky colour: the ice spell vanished against the battle sky |
| Hearthvale | panel | `#2b3a67` | `#3f5490` | its `dark` tone was darker than the outline |
| Hearthvale | pine | (new) | `#357a4c` | named the "darker leaf" of the pine tree |
| Hearthvale | flagstone | (new) | `#7e84a0` | named the "lighter slate" of dungeon floors |
| Hearthvale | rust | (new) | `#a8806a` | named the "rusty steel" of the skeleton |
| Derelict | signal | `#f08a2c` | `#3f6fd1` | was almost hazard amber; the hue wheel has no free warm slot between amber and hostile red, so the player's trim moved to the cool side |
| Derelict | plate | `#353d57` | `#434d6d` | its `dark` tone was as dark as the outline |
| Derelict | deck | `#4a5470` | `#566182` | moved up with `plate`, so the inset plating still reads darker than the floor |
| Derelict | chitin | `#6a3a7a` | `#74489c` | its `dark` tone was close to the outline; also moved away from `flesh` |
| Derelict | membrane | (new) | `#803668` | named the "darker flesh" of the hive floor |
| Derelict | nebula | (new) | `#6660b6` | named the "dull xp" of the starfield's nebula |

---

## 4. Animation

**Clip names are fixed and shared.** The playground and games pick clips by name (Contract 9). Use the names in this table for these actions and no synonyms (`attack`, never `slash`, `bite` or `strike`; `die`, never `death` or `collapse`). When the everyday word differs, set the clip's `label` (`attack: { label: 'Bite', ... }`). A sprite may add extra clips for moves this table does not have: name them with one lowercase verb (`slam`, `roar`, `steal`, `spawn`).

Frames per second are at `speed` 0.5. **Every animated clip's `fps` is `(p) => base * lerp(0.65, 1.45, p.speed)`.** "Cue" is the frame (counted from 0) on which the clip's sound starts.

### Characters and creatures

| Clip | Frames | fps | Loop | What must happen | Cue |
|---|---|---|---|---|---|
| `idle` | 8 | 7 | yes | Breathing moves something 1 to 2 px; one blink (frames 6 to 7); hair, cape or tail lags the body | none |
| `walk` | 8 | 10 | yes | Feet touch down on **frames 0 and 4**; body dips on contact; arms swing opposite the legs | footstep on 0 and 4 |
| `run` | 8 | 14 | yes | Contacts on **frames 0 and 4**; forward lean; a moment with both feet off the ground | footstep on 0 and 4 |
| `hop` (things that hop instead of walking) | 8 | 11 | yes | Squash 0 to 1, leave the ground 2, top 4, land and squash 6 | jump on 1, landing on 6 |
| `fly` (things that fly instead of walking) | 8 | 12 | yes | One full wing beat; the body rises as the wings go down | optional soft whoosh on the down-beat, volume 0.35 |
| `jump` | 8 | 11 | no | 0 idle, 1 crouch, 2 take-off, 3 to 4 rise and top, 5 fall, 6 land and squash, 7 idle. The body rises 4 to 8 px inside the frame | jump on 2, landing on 6 |
| `attack` | 8 | 13 | no | 0 idle, 1 to 2 wind-up **away** from the target, 3 the fast move, 4 the hit lands (furthest reach), 5 to 6 follow-through, 7 idle | swing on 3; an impact, if any, on 4 |
| `shoot` | 6 | 14 | no | 0 aim, 1 fire (flash at the `muzzle` socket), 2 recoil 2 px, 3 to 4 recover, 5 idle | shot on 1 |
| `cast` | 8 | 10 | no | 1 to 2 raise, glow grows, 4 brightest, 5 release, 7 idle | cast on 2 |
| `block` | 6 | 10 | no | 1 guard up, 2 to 4 held braced, 5 back to idle | on 1 |
| `hurt` | 4 | 9 | no | **Frame 0 is the recoil pose tinted white** (`g.tint('#ffffff')` before the outline); ends on the idle pose | on 0 |
| `die` | 8 | 10 | no | 0 white recoil, 1 to 4 fall, crumble or burst, 5 to 6 settle, 7 what is left (a body, a pile, a puddle or at least three fading pixels: **the last frame is never empty**, the checker fails an empty frame). The game holds the last frame | on 0; a heavy body also thuds on 5 |
| `victory` | 8 | 8 | yes | A cheer that reads in silhouette (weapon raised, hop) | none |
| `talk` | 8 | 7 | yes | Head nods, a hand gestures; mouth or face changes on 2 and 6 | none |
| `dodge` | 8 | 14 | no | 1 crouch, 2 to 5 tucked roll or streak, 6 rise, 7 idle | dash on 1 |
| Boss moves (`slam`, `roar`, `breath`, ...) | 10 or 12 | 10 to 12 | no | At least three frames of wind-up that a player can read as a warning; the hit lands about 60% through; ends on idle | on the wind-up and on the hit |

Every enemy has at least `idle`, one way of moving (`walk`, `hop` or `fly`), `attack` (or `shoot` or `cast`), `hurt` and `die`. Every player character has at least `idle`, `walk`, `attack` (or `shoot` or `cast`), `hurt` and `die`; side-view players also `run` and `jump`. Clips start from and end on the idle pose, except `hurt` (starts on the recoil) and `die` (ends on the remains).

### Everything else

| Kind | Clip | Frames | fps | Loop | What must happen | Cue |
|---|---|---|---|---|---|---|
| Pickup | `idle` | 8 | 10 | yes | The motion that catches the eye: spin, bob, pulse or glint. Whatever it is, the clip is called `idle` (`coin` predates this and keeps `spin`; a game falls back on the sprite's `preview` clip) | none |
| Pickup | `collect` | 8 | 14 | no | Dip, pop up, white flash on 4, shrink into sparkles; the last frame keeps two or more sparkle pixels | pickup sound on 1 |
| Prop, resting state | an adjective, or `idle` for the state the prop starts in: `closed`, `locked`, `off`, `on`, `up`, `empty` | 1 (or 8 when it is alive: a glint, a flicker) | 8 | yes | One frame per state; states must differ at a glance. **`idle` is only ever the first clip** (a game and the playground rest a prop on a clip called `idle` when there is one) | a looping sound on 0 if it hums or burns |
| Prop, change of state | a verb: `open`, `pull`, `raise`, `activate` | 6 or 8 | 12 | no | Starts on the old state; **the last frame is the new resting state** (a game holds it; it plays the clip backwards to undo). Order in the file: see "Props with states" below | on 0; a reward sound may be part of the same sound |
| Prop that can be hit | `hurt`, `break` | 4, 8 | 9, 12 | no | `hurt`: white on frame 0 and a wobble. `break`: pieces fly, the last frame keeps a few crumbs | on 0 |
| Projectile | `fly` | 4 or 8 | 12 | yes | Travels to the right; flicker, spin or trail shows the direction | none (the shooter's `shoot` clip has the sound) |
| Projectile | `hit` | 4 to 8 | 16 | no | Bursts where it lands; the last frame keeps two or more pixels | impact on 0 |
| Effect, one-shot | `burst` | 4 to 12 | 14 to 20 | no | Frame 0 is the brightest and biggest idea (a white core); then it spreads, thins and ends on a few pixels. Other variants get their own clip names | paired by the sprite that causes it |
| Effect, looping | `loop` | 8 | 10 | yes | Every particle has its own life phase so the loop closes | a looping sound on 0 |
| Tile | the tile names of section 6 | 1; animated tiles 8 | 6 | yes | All animated tiles of one block have the same frame count | none |
| Background layer | `far`, `mid`, `near` | 1 (8 if something drifts or twinkles) | 4 | yes | Section 7 | none |
| Interface piece | states `normal`, `hover`, `pressed`, `disabled`; or one clip per piece | 1 (8 for a bouncing arrow or cursor) | 8 | yes | Section 8 | click on `pressed` frame 0 |
| Icon set | one clip per icon, named for the thing | 1 | 1 | yes | Section 8 | none |

Motion rules that builders most often miss:

- Loops close: the pose at the end equals the pose at the start. Build them only from things periodic in `t`.
- A move smaller than one pixel is invisible. Idle moves 1 to 2 px, hits and jumps 3 or more.
- When something gets shorter it gets wider (squash and stretch).
- Tails, hair, capes and antennae lag the body by a phase offset.
- Sprites stay in place; the game moves them. A lunge may travel up to 8 px inside the frame and must return.
- **The first clip in the file is the one the checker measures** for size and ground line. List the resting clip first (`idle`, `closed`, `idle_down`), and for an effect the main `burst`. A one-shot effect must still span a third of its frame in at least half of its frames at the smallest size, so let it thin out before it shrinks.
- "To the top of the frame" always means to row 1: nothing touches the outermost row or column.

### No frame is ever empty

**Every frame of every clip, at every setting, draws something: at least two pixels.** The checker draws every frame at the default, with all sliders low, all high, every choice option, every toggle flipped and twelve random looks, and a frame with nothing in it is an error ("nothing drawn"). The one exception it allows is the last frame of an `effect`, which only gets a warning; this guide does not use that exception: an effect ends on two or more pixels too.

The frames that go empty by accident are always the same three, so design them on purpose:

| Trap | What to draw instead |
|---|---|
| The last frame of a clip in which something **leaves**: `die`, `break`, `collect`, `burrow`, `retract`, `fade`, `close`, a power-down | What is left behind: a body, a pile, crumbs, a puddle, a stain, a hole with a rim, a dust wisp, two or three sparkle pixels. Whatever it is, it does not depend on a toggle |
| The first frame of a clip in which something **arrives**: `respawn`, `spawn`, `raise`, `ignite`, a power-up | The thing it grows from: the crumbs or hole the leaving clip ended on, a seed dot, a dotted outline, the unlit base |
| A toggle or a `none` that removes the only thing left in a frame (the base plate of retracted spikes, the pedestal under a crystal that has flashed away) | Make the frame's remains independent of the toggle, or keep a few pixels of the moving thing itself in view (spike tips, a shadow line on the ground) |

Check it the way the checker does: render the clip with every toggle off, every part at `none` and all sliders low, and look at the first and last frames.

### Props with states: the order of clips is the order of events

A game steps a prop from one clip to the next. The playground does exactly that: each time the player acts next to a prop it plays **the next clip in file order**, and after the last clip it goes back to the first. So the clips of a prop that has states are listed as one walk through its life, and the walk must make sense when it wraps round:

1. **First: the state the prop starts in** (also the clip the checker measures, and the sprite's `preview`).
2. Then the change that leaves that state, then the state it arrives in, and so on round the cycle. A change clip ends on the picture of the state that follows it.
3. **Last: clips that are not part of the cycle** (a `locked` rattle, a `hurt` flash, a `wobble`, a `sealed` or `lit` variant).

These orders are fixed; the specifications and the plan files list the clips in the same order:

| Prop | Clips in file order | How it reads when stepped |
|---|---|---|
| `lever` | `off`, `pull`, `on` | off → pulled across → on → (back to off) |
| `wooden-door`, `blast-door` | `closed`, `open`, `locked` | closed → swings open → (shut again and rattling: locked) → closed |
| `dungeon-door` | `closed`, `open`, `locked`, `sealed` | as a door, then the sealed variant |
| `treasure-chest`, `chest-topdown`, `tech-chest` | `closed`, `open`, `empty` | closed → opens, glowing → emptied → closed |
| `checkpoint-banner` | `down`, `raise`, `up` | furled → runs up → flying |
| `wall-torch` | `idle` (burning), `out`, `ignite` | burning → snuffed → catches light → burning |
| `spike-trap` | `idle` (out), `retract`, `warn`, `attack` | out → sinks → tips twitch → snaps out |
| `crumble-block` | `idle`, `shake`, `break`, `respawn` | whole → shaking → gone to crumbs → grows back |
| `laser-gate` | `idle` (on), `open` (power down), `off`, `warn` | on → powers down → off → about to switch on → on |
| `wall-terminal` | `idle`, `activate`, `off` | waiting → used → dark |
| `upgrade-pedestal` | `idle`, `activate`, `taken` | offering → taken with a flash → empty |
| `warp-pad` | `idle`, `charge`, `activate` | resting → charging → warps |
| `acid-pool` | `idle`, `fade`, `spawn` | bubbling → dries to a stain → spreads again |
| `fuel-barrel` | `idle`, `hurt`, `fuse`, `break` | whole → hit → about to blow → blown |
| `cottage`, `inn` | `closed`, `open`, `lit` | door shut → door open → the night variant |
| `crate`, `supply-crate`, `boulder` | `idle`, `hurt`, `break` | whole → hit → broken |

A new prop with states follows the same three steps, and its specification writes the order out.

---

## 5. Top-down direction clips

A top-down character or walking creature is drawn in **three directions; the fourth is mirrored by the game.**

| Suffix | Faces | Drawn? |
|---|---|---|
| `_down` | towards the camera (south) | drawn: both eyes visible |
| `_up` | away from the camera (north) | drawn: no face; hair, pack and cape visible |
| `_side` | **right** (east) | drawn: one eye |
| (left, west) | | **not drawn**: the game mirrors `_side` |

Rules:

1. A direction clip is named `<action>_<direction>`: `idle_down`, `walk_up`, `attack_side`. The action is a name from section 4. The underscore is used **only** for directions; every other clip name uses dashes.
2. Frame counts, fps and cue frames are those of the action in section 4, the same in all three directions (footsteps on 0 and 4 in `walk_down`, `walk_up` and `walk_side`).
3. Order in the file: `idle_down`, `idle_up`, `idle_side`, `walk_down`, `walk_up`, `walk_side`, then the directed action (`attack_*` or `shoot_*`), then clips with no direction. `preview: 'walk_down'`. Labels: `'Walk (down)'`, `'Walk (up)'`, `'Walk (side)'`.
4. A clip with no suffix in a top-down sprite (`hurt`, `die`, `dodge`, `talk`, `cast`) is drawn facing down and is used for every direction.
5. A game looks a clip up in this order: `<action>_<direction>`, then `<action>_down`, then `<action>`, then `idle_down`. So a sprite never needs to repeat a clip that looks the same in every direction.
6. Three levels, set per asset by the specification:

   | Level | Clips | For |
   |---|---|---|
   | Full | `idle_*`, `walk_*`, one directed action (`attack_*` or `shoot_*`), `hurt`, `die`: 11 clips | players and enemies that walk |
   | Walker | `idle_*`, `walk_*`, and listed extras: 6 or more clips | townsfolk, party members on the map |
   | No direction | the side-view names with no suffix (`idle`, `walk`, `shoot`, `hurt`, `die`) | things that look the same from every side or always face the camera: blobs, drones, turrets, swarms, bosses |

7. The held item is drawn **behind** the body in `_up` clips and **in front** in `_down` and `_side`; the off-hand item swaps sides. The top-down rig does this for you.
8. Diagonals are not drawn.

---

## 6. Tilesets

A tileset is one sprite with `meta.type: 'tileset'` and one clip per tile, 32x32, `pivot: [16, 16]`. Tiles fill the frame. Draw them with the tile helper (`engine/tiles.js`, section 14), which makes texture that repeats every 32 px and edges that meet.

### The block: 13 tiles under one prefix

Every terrain and every wall, in both views, is a **block** of 13 clips sharing a prefix (`grass`, `stone`, `wall`, `path`, `water`, `pit`). The names are fixed because three things read them and must agree: the quality checker (it tests a clip ending `-fill`, `-top`, `-left` or `-right` against its neighbours), the tile helper (`BLOCK_PIECES` in `engine/tiles.js` are these 13 names) and the playground, which builds its levels from them ("How a level is built from these names", below).

```
<p>-left       <p>-top       <p>-right            outside the block: air (side view) or the ground around it (top-down)
<p>-side-l     <p>-fill      <p>-side-r
<p>-bottom-l   <p>-bottom    <p>-bottom-r

inner corners, for where the block turns inwards:   <p>-inner-tl   <p>-inner-tr   <p>-inner-bl   <p>-inner-br
```

| Clip | What it is | Must join (checked by the checker where marked) |
|---|---|---|
| `<p>-fill` | The inside. Fully opaque | itself on all four sides (**checked**) |
| `<p>-top` | The top edge. Side view: the surface you stand on. Top-down: the north edge | itself sideways (**checked**); `-fill` below (**checked**) |
| `<p>-left`, `<p>-right` | The **top corners** (top-left and top-right), not the sides | `-top` beside them (**checked**); `-side-l` / `-side-r` below |
| `<p>-side-l`, `<p>-side-r` | The left and right edges | `-fill` beside them; themselves up and down |
| `<p>-bottom` | The bottom edge. Side view: the underside. Top-down wall: **the wall's front face** (below) | itself sideways; `-fill` above |
| `<p>-bottom-l`, `<p>-bottom-r` | The bottom corners | `-bottom` beside; `-side-l` / `-side-r` above |
| `<p>-inner-tl`, `-tr`, `-bl`, `-br` | `-fill` with one corner cut away, for a step or an L-shape. `tl` means the outside shows at the top left | `-fill` on the two solid sides; `-top`, `-side-*` or `-bottom` on the other two |

Rules for a block:

- **The block's outline runs along the tile boundary**, pulled in by at most 3 px for bumps, ragged edges and rounded corners. **Whatever is outside the outline is see-through**, so an edge tile sits over sky, or over any ground in a top-down game. A hole's edge tiles are the exception: they draw the bank or inner wall right up to the tile boundary.
- **The edge band is at the same place on every tile of a block**, so edges continue from tile to tile: the top edge (grass cap, trim course, lit rim) occupies rows 0 to `edge` of `-top`, `-left` and `-right`; the side edge occupies the outer `edge` columns of the side and corner tiles. `edge` is a control (3 to 9 px).
- **Never name a tile `-top`, `-left`, `-right` or `-fill` unless it is that tile of a block.** The checker will test it against the block and fail it. A column's capital is `pillar-cap`, not `pillar-top`.
- **One fill per block.** Variety comes from decal clips (`<p>-deco-a`, `-b`, ...: see-through pictures placed over a fill tile), never from a second fill that would have to join the first.
- **Calm texture.** At most six small marks per fill tile, none on the outer 2 px, nothing brighter than `light` or darker than `dark`. A screen of fill must not show a blotch repeating every 32 px.
- A block is at least two tiles wide and two high when used. One-tile-wide strips are covered only by the `thin` pieces below.
- Animated blocks (water, void): all 13 clips have 8 frames.

### What a tileset must contain

**Side view** (platformer):

| Clips | Count | Notes |
|---|---|---|
| One block, 13 clips | 13 | The ground. `-bottom` row is the underside of a floating island |
| `<p>-thin-l`, `<p>-thin-m`, `<p>-thin-r` | 3 | A platform one tile wide and 12 px thick, in the top of the tile; see-through below. `-thin-m` repeats sideways |
| `<p>-slope-up`, `<p>-slope-down` | 2, optional | 45 degrees, rising and falling to the right |
| `<p>-deco-a` ... | 2 to 4 | Decals: tufts, stones, cracks |
| Named extras the specification lists | | For example `pillar-cap`, `pillar-mid`, `pillar-foot`, `window` |

**Top-down** (RPG map, roguelite room):

| Clips | Count | Notes |
|---|---|---|
| A ground: `<p>-fill` alone | 1 | The base everything else sits on (`grass-fill`, `floor-fill`) |
| A second ground as a block (path on grass, plating on floor) | 13 | Edge tiles are see-through outside, so they overlay the base |
| A wall as a block | 13 | A raised mass seen from the south. `-fill`, `-top`, `-left`, `-right`, `-side-*` are its **cap** (the top surface, lit). **`-bottom`, `-bottom-l`, `-bottom-r` are its front face**: one full tile of wall face, darker than the cap, ending in a base line and a 2 px shadow on the floor |
| A hole as a block (`pit`, `water`) | 13 | `-fill` is the depth. `-top` shows the inner wall going down (6 to 14 px); `-bottom` is only a thin lip |
| `<p>-deco-a` ... | 3 to 6 | Floor decals: cracks, grates, flowers, splats |

A tileset holds one or two blocks and at most 32 clips.

### How a level is built from these names

This is what the playground does (`app/play/level.js`) and what a game is expected to do. A tileset that follows it can be dropped into a level with no set-up; a tile with any other name is never placed automatically.

**The exact piece names** (the same list as `BLOCK_PIECES` in `engine/tiles.js`; `<p>` is the block's prefix):

| Name | Placed where |
|---|---|
| `<p>-fill` | a cell with the block on all four sides (and all four diagonals) |
| `<p>-top` | nothing above; the block to the left and to the right |
| `<p>-left`, `<p>-right` | nothing above and nothing to the left (`-left`) or to the right (`-right`): the two **top corners** |
| `<p>-side-l`, `<p>-side-r` | the block above and below; nothing to the left (`-side-l`) or to the right (`-side-r`) |
| `<p>-bottom` | nothing below; the block to the left and to the right. **In a top-down wall this is the wall's front face** |
| `<p>-bottom-l`, `<p>-bottom-r` | nothing below and nothing to the left or to the right: the two **bottom corners** (the ends of a top-down wall's front face) |
| `<p>-inner-tl`, `-inner-tr`, `-inner-bl`, `-inner-br` | the block on all four sides, and only the one diagonal cell missing (`tl`: the cell up and to the left) |
| `<p>-thin-l`, `<p>-thin-m`, `<p>-thin-r` | a platform one tile high that is stood on from above: left end, repeating middle, right end |
| `<p>-slope-up`, `<p>-slope-down` | a 45 degree slope rising or falling to the right |
| `<p>-deco-a`, `-deco-b`, ... | decals, scattered over fill tiles of the same prefix (the tile helper's `place` says `on` a fill tile, `above` a top tile or `below` a bottom tile) |

"Nothing above" is checked first, then "nothing below", then the sides, then the diagonals. A piece that a tileset does not have is replaced by the nearest one (a corner by its edge, an edge by the fill), so a block with all 13 is never patched.

**Which block is used for what**, read from the prefix:

| View | Part of the level | The block that is used |
|---|---|---|
| Side | ground | the first block in the file that has both `-top` and `-fill` |
| Side | floating platforms | the first prefix that has `-thin-m` (the ground's own, if it has one) |
| Side | slopes | the first prefix that has both slopes |
| Top-down | floor | a prefix that has **only** `-fill` (`grass-fill`, `floor-fill`): it is laid under everything |
| Top-down | wall | a block whose prefix contains `wall`. **Name every top-down wall block `wall`** (or `<something>-wall`) |
| Top-down | hole | a block whose prefix starts with `pit`, `water`, `hole`, `void`, `lava`, `acid` or `pool`. It blocks the way |
| Top-down | second ground | any other block (`path`, `cobble`, `plate`): laid over the floor |

So: never give a top-down wall another prefix (a hive wall is `wall-*`, not `growth-*`), never start the prefix of walkable ground with one of the hole words, and in a side-view tileset list the ground block before anything else that has a `-top` and a `-fill`. Things that repeat up and down use `-cap`, `-mid`, `-foot` (`ladder-cap`, `pillar-mid`); those, and every other name (`bridge-h`, `stairs-down`, `window`), are placed by hand.

---

## 7. Backgrounds

A background is one sprite with `meta.type: 'background'`, frame 320x180, drawn with the backdrop helper (`engine/backdrop.js`, section 14).

| Rule | What to do |
|---|---|
| Clips | `far`, `mid`, `near`, **in that order** (the first clip is the farthest). One frame each, or 8 frames at 4 fps when clouds drift or stars twinkle |
| `far` | Fully opaque: sky or back wall in three or four flat bands (lightest at the horizon), plus the most distant shapes |
| `mid`, `near` | See-through above their shapes. Shapes rise from the bottom edge. Each layer draws a strip at least 8 rows high across its whole bottom edge, so it spans the full width (the checker fails a layer that does not reach column 0 and column 319) |
| Wrapping | The right edge continues into the left edge (checked). Build every outline from waves with a whole number of cycles across 320 px, and place scattered things at positions taken modulo 320 |
| Receding | `far` is the lightest, coolest and flattest (the tones of its land shapes within 15% brightness of each other); `near` is the darkest. Each land shape uses at most three tones. **The step in value from `far` to `mid` is about as large as the step from `mid` to `near`**: a pale `mid` merges with the mountains behind it (the first forest did) |
| Colours per layer | **At most 8 per layer for the landscape** (sky bands, land, trees, buildings). Stars, the moon, the sun and lit windows do not count. The checker only warns above 32 |
| Staying behind | No outline. No pure palette colours: mix every colour 35% or more towards the air colour (`recede()` in the helper). Nothing as dark as `INK`. **Nothing in `mid` or `near` is brighter than the horizon band of the sky**, except small lights (windows, a moon) that cover under 2% of the layer. Clouds may be lighter than the sky band they sit in |
| Smallest detail | 3 px, so nothing flickers when the layer scrolls. **Stars and lights may be 2x2 px**, but never an isolated single pixel |
| Value, not hue | **Every shape differs in value (light against dark) from the band behind it by enough to survive every whole-bundle look** (`THEME_PRESETS` in `engine/theme.js`). Check by rendering the stacked layers under at least the looks Sunset, Night, Handheld and Mono: a shape that was told apart only by its hue disappears in one of them (the general rule is in section 3) |
| Not repeating too soon | **`mid` and `near` do not repeat a shape more often than every 160 px**: at most two of the same tower, arch or tree clump across the 320 px, or the scroll reads as a pattern |
| Repeating | No landmark so distinctive that the 320 px repeat is obvious: no single castle, moon or tree in `mid` or `near`. One sun, moon or far landmark is allowed in `far`, which scrolls slowest |
| Scroll speeds | Say them in the `blurb`: far 0.1, mid 0.4, near 0.7 of the camera's speed |
| Battle backdrops | `near` is the ground the fighters stand on: opaque from row 132 down; fighters' feet stand on row 150 |
| Controls | 6 to 8: see section 10 |

**How to build one** (from the builder of the first two; the worked examples are `sprites/bg-forest.js` and `sprites/bg-castle.js`, the helper is `engine/backdrop.js`):

1. **Every edge is an outline function, filled with `fillBelow`** (or `fillBetween`). Use `ridge`, `treeline`, `battlements`, `highest` and `shifted`; never draw a shape across to x = 320 by hand, because that is where the wrap breaks.
2. **Scatter with `scatter(count, seed, { stable: true })`**, so a Density or Clouds slider adds things to the ones already there instead of reshuffling them all.
3. **Every colour goes through `recede(c, hazed(depth, p.haze), sky.air)`**, where `sky = skyLook(p.sky, p.time)`. No colour reaches the surface straight from a control or the palette.
4. **Buildings and other repeating things stand on spacings of 320 / n**, so the last one meets the first across the wrap. In `mid` and `near` the spacing is 160 px or 320 px (the rule above); a finer rhythm of 80 px is for `far` and for details that differ from bay to bay.
5. **Judge the three layers stacked, with a character standing in front** at the feet row, at day, dusk and night, and under the looks Sunset, Night, Handheld and Mono. A layer that looks right alone can still swallow the hero.

---

## 8. Interface pieces and icons

| Kind | Frame | Clips | Rules |
|---|---|---|---|
| Button | 96x32 | `normal`, `hover`, `pressed`, `disabled` | `hover`: face one tone lighter. `pressed`: the face moves 2 px down and the bottom bevel disappears. `disabled`: no saturation, no shine. The middle 78x18 px is kept flat and clear for text. Stretchable: corners and border fit inside 8 px, so a game can nine-slice it |
| Panel | 96x64 (card: 64x96) | one clip per variant (`panel`, `panel-title`, ...) or states as a button | 8 px nine-slice border; flat clear middle |
| Bar | 64x16 | `frame` (the empty housing), `fill` (the full-length strip a game crops to the value), `fill-b`, `fill-c` (second and third resources), `flash` (4 frames, the strip turning white when the value changes) | The fill strip fits exactly inside the housing's opening |
| Glyph set | 16x16 | one clip per glyph, named for the thing and its state (`heart-full`, `heart-half`, `heart-empty`) | Up to 14x14 px of art. Full and empty versions have the same outline |
| Cursor, crosshair | 32x32 | `idle` and named states | The hot spot is exported as a **`tip` socket**; the pivot stays where the helper puts it (the frame centre for a crosshair, whose `tip` is then the centre too) |
| Icon set | 32x32 | one clip per icon | One idea per icon, 20 to 26 px, drawn tilted the same way (handle bottom left, point top right). Every icon in a set has a different silhouette. 6 to 10 icons per set |
| Portrait set | 48x48 | `<who>-<mood>` (`hero-neutral`, `hero-happy`) | Head and shoulders, facing three-quarters right, the same colours as that character's sprite |

All of them: `INK` outline; 1 px empty border; no words or letters drawn (digits are their own asset; the one exception is a "miss" mark, below); at most 10 colours; `meta.view: 'none'` (portraits: `'front'`).

### What the review of the first interface sprites settled

The helper is `engine/ui.js`; the worked examples are `sprites/ui-dialogue.js`, `sprites/ui-battle-menu.js`, `sprites/ui-bars-rpg.js` and `sprites/ui-damage-digits.js`.

| Subject | Rule |
|---|---|
| Bevel | From the outside in: an ink line, a band 1 to 3 px wide (the `border` control) lit on the top and the right, an ink line, then the face |
| Drop shadow | 2 px, falling down and to the left, and inside the 8 px border (it never widens the piece) |
| Button | Its band is 1 to 2 px, and it stands on a 2 px coloured lip along the bottom; `pressed` moves the face down onto the lip |
| Stretchable pieces | A piece a game may stretch declares **`slice` per clip**. The export then writes `border: { left, bottom, right, top }` for that clip, in Unity's order. It also writes `rect` when the piece does not fill its frame, and `opening: { x, y, w, h }` for a bar's housing and its fills |
| A middle that is not uniform | A piece whose middle repeats a pattern (a segmented bar) cannot be stretched: it exports a **tile pitch** (the width of one repeat) instead of a border |
| Cursor | Exports a `tip` socket at its hot spot. The pivot is not moved to the hot spot |
| Digits | Their sizes come from the helper. **Every digit differs from every other by more than 2 body pixels at 1x** (ink not counted), or two of them will be misread |
| "Miss" mark | Must read as a dodge at 1x: a swoosh with motion lines, or the word itself (the one place a word may be drawn) |
| Contrast | **A text area keeps at least 4.5 to 1 contrast against white text, and the frame at least 3 to 1 against the face, under every whole-bundle look** (`THEME_PRESETS`; section 3, rule 8). No face swatch may be so light that white text fails on it |

How to build one:

1. **Pass the helper the frame minus 1 px on every side** (`panel9(g, 1, 1, w - 2, h - 2, ...)`): the helper draws its own ink line, so do not outline the piece again.
2. **Put text areas and rows only inside the box the helper returns** (`inner` for a panel, `text` for a button). That box is the flat, one-colour middle.
3. **Keep decoration within 5 px of the edges** (`EDGE` in the helper), so it stays inside the nine-slice border and never reaches the text.
4. **Give the housing and its fills the same `barOpening` options**, so the strip fits the trough exactly at every setting.
5. **Judge glyphs at 1x by contrast, not by pixel count**: a mark with enough pixels can still vanish if its value is close to the plate behind it.

---

## 9. Parts

Parts are Contract 3: what a sprite holds or wears, each with settings of its own. `sprites/knight.js` is the worked example.

**Who must declare parts**

| Kind | Rule |
|---|---|
| Character (any view) | At least two parts: one held (`weapon` or `held`) and one worn (`headgear`, `cape`, `hair`, `pack`...) |
| Boss | At least one part |
| Creature | Declare a part for anything that could be taken off or swapped: horns, tail, wings, something carried. A creature with nothing of the kind has none |
| Prop | Only where the specification lists one (a lock, a sign, fruit on a tree) |
| Everything else | No parts |

**Standard part names, sockets and settings.** Use these names. A part's first setting is its selector (a choice), named exactly as the part; include `'none'` unless the specification says the part cannot be removed.

| Part | Socket | Selector | Other settings (use these keys) |
|---|---|---|---|
| `weapon` | `hand` | `weapon` | `weaponLength`, `weaponAngle` (side view), `weaponSwing` (optional) |
| `held` (a thing that is not a weapon: lantern, cane, basket) | `hand` | `held` | `heldSize` |
| `shield` | `offhand` | `shield` | `shieldSize` |
| `headgear` | `head` | `headgear` | `headgearSize` |
| `hair` | `head` | `hairStyle` (none value: `'bald'`) | `hair` (the colour) |
| `beard` | `head` | `beard` | `beardLength` |
| `horns` | `head` | `horns` | `hornLength` |
| `cape`, `scarf` | `back` | `cape`, `scarf` | `capeLength`, `scarfLength` |
| `pack` | `back` | `pack` | `packSize` |
| `wings` | `back` | `wings` | `wingSpan` |
| `tail` | `tail` | `tail` | `tailLength` |
| Anything else the specification names | | the part's name | `<part>Size` or `<part>Length`, `<part>Colour` |

Rules:

- Size and length settings are multipliers with default 1 (`range('Length', 1, { min: 0.65, max: 1.35, step: 0.05 })`), as on `knight`. Labels inside a part are short ("Length", "Size"), because the site shows the part's name above them.
- Each part is drawn by its own function from an attach point, a direction and its settings, and is attached to a joint every frame.
- A part set to `none` leaves nothing behind: no empty hand held out, no gap in the outline, **and no frame left empty** (section 4).
- **A part's sound goes with the part, and that takes a `when` on the cue.** Taking a part off hides its settings by itself (the part's `none` does that), but it does nothing to the sprite's sounds: a blade's slash would still play over a bare fist. Every cue that belongs to a part, or to one option of it, carries `when` (section 11), and the specification writes it out.
- A part gets its own colour setting (`<part>Colour`) only when no sprite colour already covers it. `metal` covers weapons, shields and helmets; `trim` covers capes and scarves. **A sprite colour that only shows on parts is not in effect when all of those parts are off, and must say so with `when`** (section 10): `metal` on a character whose only metal is a weapon and a helmet is the standard case, and `sprites/knight.js` shows it.
- Headgear either leaves the things other controls change in view (a helmet open at the face shows skin; a hat sits above the fringe), or the hidden control declares `when`. A control that is hidden and does not say so is reported by the checker as dead.
- A sprite with parts exports `sockets(clip, t, p)`. Socket names: `hand`, `offhand`, `head`, `back`, `feet`, plus `tail` where there is one and **`muzzle`** on anything that shoots (where the projectile and the muzzle flash appear).

---

## 10. Controls

**How many.** Count the sprite's own controls and its part settings separately, as the checker does.

| What is counted | Rule | The checker |
|---|---|---|
| **The sprite's own controls** (everything in `params` that is not listed in a part) | **6 to 12, for every kind, bosses included.** Icon sets, glyph sets and bars may have as few as 6 | warns under 4 in all, and above 16 outside parts |
| **Settings of one part** (its selector included) | 2 to 4 | warns above 6 |
| **In total**, with part settings | Character: up to 20, as `knight`. **Boss: 13 to 16** (9 or 10 of its own plus two or three parts; the four bosses of the three kits have 13, 13, 14 and 15). Any other creature with parts: up to 16. A prop with a part: up to 12. Everything without parts: its own 6 to 12 | no check on the total |

Part settings do not count towards the 12. No asset in the three kits has more than 11 controls of its own, so the checker's "more than 16 outside parts" warning should never appear; if it does, a control belongs in a part.

**The same control has the same key, label and end words everywhere:**

| Key | Kind | Label | Ends | Notes |
|---|---|---|---|---|
| `size` | slider | Size | Small / Big | The whole thing |
| `height` | slider | Height | Short / Tall | |
| `build` | slider | Build | Slim / Stocky | |
| `head` | slider | Head | Small / Big | |
| `length`, `width`, `thickness` | slider | Length, Width, Thickness | Short / Long, Narrow / Wide, Thin / Chunky | |
| `style`, `shape` | choice | Style, Shape | | The main silhouette choice of a prop or creature |
| `eyes` | choice | Eyes | | The eye style |
| `pieces` | slider | Pieces | Few / Many | How many bits fly off |
| `spread` | slider | Spread | Tight / Wide | |
| `texture` | slider | Texture | Plain / Busy | Tiles and walls |
| `edge` | slider | Edge | Thin / Deep | Tiles: the depth of grass, trim or rim |
| `wear` | slider | Wear | New / Worn | Cracks, scratches, chips |
| `sparkle`, `shine` | toggle | Sparkle, Shine | | |
| `bounce` | slider, Motion | Bounce | Calm / Bouncy | |
| `stride` | slider, Motion | Stride | Small steps / Big steps | |
| `hop` | slider, Motion | Hop height | Low / High | |
| `flap` | slider, Motion | Flap | Small / Wide | |
| `bob` | slider, Motion | Float | Still / Floaty | |
| `pop` | slider, Motion | Pop height | Low / High | Pickups' `collect` |
| `sway` | slider, Motion | Sway | Still / Swaying | |
| `wobble` | slider, Motion | Wobble | Firm / Wobbly | |
| `flicker` | slider, Motion | Flicker | Steady / Wild | |
| `speed` | slider, Motion | Speed | Slow / Fast | **Every sprite with an animated clip has it, wired into every clip's fps.** One exception: an interface piece or icon set whose animated clips all have 4 frames or fewer (a bar's `flash`, a portrait's `talk`) needs no `speed`; those clips then play at a fixed 8 fps. The specification says which: the two bar sets and the two portrait sets have none |

**Colour keys are nouns for the thing coloured**, labelled with that noun: `skin`, `hair`, `outfit` (main cloth), `trim` (second cloth, capes), `metal`, `wood`, `stone`, `body` (a creature's or object's main colour), `accent` (its second colour), `glow` (anything that gives light: eyes, screens, magic, energy), `core` and `edge` (the inside and outside colours of an effect). A colour key never contains the word "colour", except when a choice already has the noun (`roof` the choice, `roofColour` the colour).

**Standard set per kind.** The specification lists every control of every asset; this is what the lists are built from.

| Kind | Always | Usually |
|---|---|---|
| Character (either rig) | `height`, `build`, `skin`, `outfit`, `trim`, `bounce`, `speed` | `head`, `metal`, `stride`, a hair part |
| Creature | `size`, one body-shape slider, one silhouette choice, `body`, `accent`, one Motion control for how it moves, `speed` | `eyes`, `glow` |
| Boss | as creature, plus a second silhouette choice | |
| Tileset | two or three material colours, `edge`, `texture`, `wear` | a `style` choice, `speed` if animated |
| Prop | `size` (or `width` / `height`), `style`, two colours | `wear`, `glow` and `flicker` if it gives light, `speed` if animated |
| Pickup | `size`, `shape`, `sparkle`, `body`, `bob`, `pop`, `speed` | `glow` |
| Projectile | `size` or `length`, `style`, `core` or `body`, `glow`, `speed` | `trail` (toggle), `wobble` |
| Effect | `size`, `pieces` (or a count named for the thing), `style`, `core`, `edge`, `speed` | `spread` |
| Background | `sky`, `land`, `height`, `density`, `haze` | `time` (day, dusk, night), `clouds` |
| Button, panel, bar | `style`, `corner` (Square / Round), `border` (Thin / Thick), `face`, `frame` | `shine`, `accent` |
| Icon and glyph sets | `shine`, `size`, two or three colours named for materials | `backing` (a plate behind the icon), `tilt` |

### How big a change must be: the checker's rule

"Every control changes the picture" is measured, and the amount depends on the size of the drawing. This is exactly what `quality/sprite.js` does (`THRESHOLDS.strengthPer`, `strengthMin`, `strengthMax`; check S-control-visible in `docs/quality-bar.md`):

1. **N** = the number of opaque pixels in frame 0 of the **first clip** at the default look, divided by 100 and rounded, then kept between **2 and 8**.
2. Each control is tried at its two ends: a slider at its lowest and highest, a toggle off and on, a colour at its two most different swatches, a choice at every pair of options. The two pictures are compared on **four frames of every clip** (the frames at 0, 1/4, 1/2 and 3/4 of the clip: frames 0, 2, 4, 6 of an 8-frame clip; 0, 1, 3, 4 of a 6-frame clip; 0, 3, 6, 9 of a 12-frame clip) and the biggest count of changed pixels in any one frame is kept. A control that changes a clip's frame rate counts as visible without changing a pixel (that is how `speed` passes).
3. This is repeated at every **tested setting**: the default, all sliders low, all sliders high, each option of every choice, and each toggle flipped.
4. **The control must change more than N pixels in one frame.** A change of 1 to N pixels is an **error for a slider** and a warning for a toggle, a colour or a choice. No change at all, at any tested setting where the control is in effect, is an error for every kind of control (a clamp at all-low or all-high only is a warning).

| What you are making | Opaque pixels of its first frame | N | So a control must change at least |
|---|---|---|---|
| 16x16 glyph, tiny pickup, small projectile | under 250 | 2 | 3 pixels |
| 32x32 pickup, prop or icon | 150 to 440 | 2 to 4 | 3 to 5 pixels |
| 48x48 creature | 300 to 600 | 3 to 6 | 4 to 7 pixels |
| **64x64 character** (35 px tall) | 500 to 750 | 5 to 8 | **6 to 9 pixels** |
| Interface piece (button, panel, bar) | 800 and more | 8 | 9 pixels |
| **Tile** (32x32, the first clip fills most of the frame) | about 1,000 | 8 | **9 pixels in some tile** |
| **Boss** (96x96 and larger) | 2,500 and more | 8 | **9 pixels** |
| **Background** (`far` is opaque: 57,600) | 57,600 | 8 | **9 pixels** in some layer |

What follows from it:

- **Aim for 12 or more changed pixels from every control**, whatever the kind, so that none sits on the line. A toggle for freckles, one rivet or a 2x2 dot fails on anything bigger than a glyph; say in the control's note how big the thing it adds is ("at least six spots", "a 4x4 ball").
- N comes from the **first clip**, another reason to list the resting clip first: an effect whose first frame is its big white burst gets a higher N than one that opens on a spark.
- A control that shows in only one clip is fine (the biggest change over all clips counts), **but it must show on one of that clip's four sampled frames**. A glint that exists only on frame 5 of an 8-frame clip is never seen by the checker.
- On a tileset, a control may change only one tile (the flower colour changes only the flower decal): that passes, as long as that tile changes by more than 8 pixels. On a background the bar is the same 9 pixels, which any real control clears; the risk there is a slider that is clamped at one end.
- Everything said here about pixels applies **whenever the control is in effect**. When it is not, see `when` below.

### Controls that only matter sometimes: `when`

A control that does nothing at some setting of another control is an error ("does nothing when weapon=none"), unless it says so. **Do not bend the design to make it matter everywhere, and do not move it into a part it does not belong to: declare `when`** (Contract 3 in `docs/architecture.md`). The site then hides the control while it is not in effect, and the checker accepts that it changes nothing there.

```js
// An object: every key in it must match (all of). In effect only while the hub plate is on.
accent: color('Hub', P.crimson, swatches('thornwood', 'accent'), { when: { hub: [true] } }),

// A list of objects: any one of them is enough (any of). In effect while a weapon is held OR a helmet or crown is worn.
metal: color('Metal', P.steel, swatches('hearthvale', 'metal'), { when: [{ weapon: ['sword', 'axe', 'spear'] }, { headgear: ['helmet', 'crown'] }] }),
```

- **An object means all of:** `{ weapon: ['sword'], headgear: ['helmet'] }` holds only with a sword **and** a helmet. Each key is another control; its value is the **list** of that control's values for which this one is in effect (always a list, even for one value; a toggle's values are `true` and `false`).
- **A list of objects means any of:** the control is in effect when at least one object holds.
- **A control named in a `when` must itself be in effect.** If `emblemColour` says `when: { emblem: ['star', 'sun'] }` and `emblem` belongs to a part that is taken off, then `emblem` is not in effect, so `emblemColour` is not either. A `when` that leads back to itself is refused when the sprite is defined.
- A part's own settings need no `when` for their part: the part's `none` already hides them. Use `<part>Colour` inside a part when the colour belongs to that one part only; use `when` when the control belongs to the sprite and only shows through some options or some parts.
- List the values where the control **works**, not the ones where it does not. When the checker finds a control dead somewhere, its message suggests the `when` to write.
- A control with a `when` must still change more than N pixels at every tested setting where it is in effect, and must change **nothing** where it is not (a warning otherwise: something was left behind).
- The specification writes every `when` out, after the control or the cue it belongs to. Copy it exactly. If you find a control that needs one and has none, add it and say so in your report.

### Other rules

- Choices change the **silhouette** wherever possible (ears, horns, hats, weapons, tails), and every option must differ from every other.
- Look sliders change the animation too: longer legs take longer steps, a bigger tail swings wider.
- Labels and end words are everyday words. No "amplitude", "params", "offset".
- Group order in `params`: Look sliders and choices, then each part's settings together, then colours, then Motion.

---

## 11. Sound

### The house sound of each bundle

| Bundle | House sound | Built from | Length and space |
|---|---|---|---|
| `kit-platformer-fantasy` | **Chiptune-leaning.** Bright, pitched, bouncy, a little toy-like. A jump is a rising blip, a pickup is a tune of two or three notes | Square, pulse and triangle oscillators; short noise bursts for hits and breaks; simple pitch slides | Short: 0.08 to 0.5 s. Almost no reverb (`space` at most 0.1). Only the boss is big |
| `kit-rpg-fantasy` | **Storybook.** Soft, warm, bell-like. Menus tick quietly, spells bloom and ring | Sine and triangle tones, `modal` bells and glass, `pluck`, filtered noise for cloth, grass and stone | Interface 0.03 to 0.25 s. Spells 0.6 to 1.4 s with a real tail (`space` 0.15 to 0.3) |
| `kit-roguelite-scifi` | **Synthetic and gritty.** Dry, punchy, electric. Every shot has a click, a body and a low thump | Saw and FM tones, `crush`, `shaper`, resonant noise sweeps, inharmonic `modal` metal | Very short and dry so twenty can play per second: shots and hits at most 0.3 s, no reverb on anything that repeats |

A sound shared by two bundles gets one style per bundle.

### Standard controls and styles

- **4 to 6 controls** per sound effect (the checker warns above 7), named for what a listener hears. Use these ids where they apply, so the same slider has the same name everywhere:

  | id | Label | Unit and scale | Means |
  |---|---|---|---|
  | `pitch` | Pitch | Hz, log | How high |
  | `weight` or `size` | Weight, Size | 0 to 1 | One control that lowers pitch, lengthens and darkens together |
  | `length` | Length | s, log | How long; `duration` is computed from it |
  | `bright` | Brightness | 0 to 1 | How much high end |
  | `grit` | Grit | 0 to 1 | Noise, distortion, crush |
  | `snap` | Snap | 0 to 1 | How hard the first few milliseconds hit |
  | `ring` | Ring | s | The length of a pitched tail |
  | `space` | Room | 0 to 0.5 | Reverb |
  | `rise`, `drop` | Rise, Drop | semitones | How far the pitch moves |
  | `speed` | Speed | s or notes per second | How fast a little tune plays |

  **Every sound has three things a listener can change: how long, how high, and how bright.**
  - *How long:* `length`, or the control that sets the length in that sound (`ring`, `speed`, or one the specification names, such as a chest's `creak`).
  - *How high:* one of `pitch`, `weight` or `size`.
  - *How bright:* `bright`, **unless the specification names another control that sets that sound's high end**: `shine`, `shimmer` or `sparkle` for bells and chimes, `grit` for sounds whose top is noise or distortion. A sound never has both `bright` and its stand-in. Nine sounds of the three kits use a stand-in, and each says "Brightness:" in its specification; every other sound has `bright`.

  The other one to three controls are the sound's own character. The specification's control list is exact: build those ids, no more and no fewer.
- No volume control: renders are normalised and the game sets volume.
- **2 or 3 styles** (`presets`), named in Title case for a use, not a setting ("Heavy landing", not "Low and long"). The specification fixes the names, because sprites refer to them. Do not rename them.
- **Sounds that repeat vary.** Footsteps, hits, shots, splats and breaks use `rnd()`, `noise` or `dust` so two takes differ by more than 0.2 dB. Interface sounds, pickups and jingles are identical every time.
- **Phone speakers.** At least 40% of the energy above 300 Hz. A heavy sound still needs a mid-range crack so it survives small speakers.
- **Shape.** Starts within 5 ms (hits, clicks, shots, steps: under 10 ms attack and a crest above 10 dB). Has died away by the end. Not padded.
- Ambience loops: 4 to 8 s, `"loop": true`, no single event so distinctive that the repeat is obvious.
- **Jingles: 1 to 3 s** (inside the quality bar's 1 to 6 s), a clear tune that ends on the home note, never looping. **A jingle's patch says `"category": "jingle"` and its `meta.type` is `'jingle'`, never `"music"`**, even when its role is under `music/` (`music/victory`) and even though it is a tune. The reason: a patch whose category or type is `music` becomes a music track. The build then lists it under music, the checker demands a tempo, a `bars` control and a melody-instrument control from it, no sprite may cue it, and the bundle has three tracks instead of the two it must have. A jingle is one of the bundle's 20 sounds.

### How sprite animations pair with sounds

| Event | Frame | Volume to write in the cue |
|---|---|---|
| Footstep (`walk`, `run`, every direction) | 0 and 4 | 0.45 (small creatures 0.3) |
| `hop` | take-off 1, landing 6 | 0.5 |
| `fly` down-beat | 1 | 0.35 |
| `jump` | take-off 2, landing 6 | 0.7 |
| `attack` | swing on 3, impact on 4 | 0.7, 0.85 |
| `shoot` | 1 | 0.85 |
| `cast` | 2 | 0.8 |
| `block` | 1 | 0.7 |
| `dodge` | 1 | 0.7 |
| `hurt` | 0 | 0.9 |
| `die` | 0 (a heavy body: also 5) | 1 |
| Boss move | the first wind-up frame and the hit frame | 1 |
| Pickup `collect` | 1 | 0.7 |
| Prop change of state (`open`, `pull`, `break`) | 0 | 0.8 |
| Looping prop (`idle` of a torch, a pool, a gate) | 0, a looping sound | 0.35 |
| Interface `pressed` | 0 | 0.6 |

Rules: every action clip has a sound at the default look and `idle` is silent (except looping props). A cue names a sound that exists and one of its styles exactly (the specification's "style" is the cue's `preset`); **the sound batches of a bundle are built before the sprite batches that cue them**. A looping sound goes only on a looping clip. Use the sounds the specification lists for your sprite; do not invent pairings.

**Sounds that only apply sometimes: `when` on the cue.** A cue plays whatever the look, unless it says otherwise. A sound that belongs to a part, or to one option of a control, carries the same `when` as a control does (section 10: an object is all of, a list is any of, and a control it names must itself be in effect). The site, the playground and the export leave the cue out while its `when` does not hold; the checker still checks that its sound and style exist.

```js
sounds: {
  attack: [
    { sound: 'sword-slash', preset: 'Quick dagger', frame: 3, volume: 0.7, when: { weapon: ['sword', 'axe', 'spear'] } },   // a blade is held
    { sound: 'whoosh', preset: 'Quick swipe', frame: 3, volume: 0.7, when: { weapon: ['none'] } },                           // a bare fist
  ],
},
```

- Two cues on the same frame with `when`s that never hold together are how a clip changes its sound with a part (a blaster's shot or a scatter gun's blast).
- **Taking a part off does not silence its sound by itself.** Only `when` does. A clip may be silent for the looks in which the thing that made the noise is gone.
- The specification writes each cue's `when` after the cue. A cue with none plays for every look.

**Loudness between sounds** is set only by the cue's `volume` (table above), because every render is normalised to the same peak. Do not try to make a sound quiet inside the patch.

---

## 12. Music

Every track is a patch with `"category": "music"`, built like `sounds/battle-theme.json`, with these controls. The ids are fixed: the bundle theme changes a track's pitch through `key` and its tempo through `bpm`.

| id | Label | Range | Notes |
|---|---|---|---|
| `intensity` | Intensity | 0 to 1 | Brings the layers in, in the order the specification gives. At 0 the track is still music (never silence); at 1 everything plays |
| `bpm` | Tempo | the track's range | The written tempo is the default; the checker detects it |
| `key` | Key | -5 to 6 semitones | |
| `bars` | Length | 8, 16, 24, 32 (`"step": 8`) | **Every track offers these four lengths.** A longer version builds up section by section (8 bars each) and its last section is the full band; it is never the short version repeated |
| `inst` | Melody instrument | `"options"`, 5 names | **Every track offers these five, in this order: "Synth lead", "Flute", "Chiptune", "Bell", "Plucked string".** The specification gives the default. All five are level-matched by measurement |
| `bright` | Brightness | 0 to 1 | |
| `space` | Room | 0 to 0.5 | |
| one or two more | | | The track's own (melody level `lead`, `grit`, `swing`) |

At most 10 controls. Stereo, looping, `"wrap": true`. Three styles per track, named for game moments.

| Bundle | Track | Role | Tempo (range, default) | Key | Mood |
|---|---|---|---|---|---|
| Platformer | `thornwood-overworld` (new) | music/exploration | 120 to 156, 138 | G major | Bright, bouncy, adventurous: chiptune-leaning |
| Platformer | `battle-theme` (existing) | music/battle, used for the boss | 130 to 190, 160 | D minor | Fast and tense |
| RPG | `hearthvale-village` (new) | music/exploration | 80 to 108, 92 | F major | Warm, gentle, homely: plucked strings and flute |
| RPG | `hearthvale-battle` (new) | music/battle | 140 to 172, 152 | A minor (Dorian) | Heroic, galloping, urgent |
| Roguelite | `derelict-run` (new) | music/exploration | 112 to 140, 126 | E minor | Dark, driving synthwave; tension that builds with the floor number |
| Roguelite | `derelict-boss` (new) | music/boss | 150 to 180, 164 | C minor | Relentless, distorted, alarm-like |

Rules for every new track: one 16th-note clock drives everything; the chords the specification writes are the chords the checker must find in each bar; kick, bass and snare are the same in both channels; the melody is worth humming (a phrase of 2 or 4 bars that returns, mostly steps, one leap); no two tracks in the library share a melody or a chord order.

---

## 13. Metadata

Contract 1. `catalog/schema.js` is the authority; `validateMeta` must pass.

| Field | How to choose |
|---|---|
| `type` | What kind of thing it is: `character` (a person or anything on a body rig), `creature` (an animal, monster or robot), `tileset`, `prop` (sits in the level), `pickup` (collected by touching), `projectile` (flies and hits), `effect` (a short burst or loop of light, smoke or debris), `background`, `ui`, `icon`. Sounds: `sfx`, `ambience` (a loop), `jingle` (a short tune: `meta.type: 'jingle'` and `"category": "jingle"` in the patch, never `music`; section 11 says why). Music: `music`, for the two looping tracks of a bundle only. Portrait sets are `icon` (they have one-frame clips, which a `character` may not) |
| `role` | What a game uses it for. The specification gives it; it must be a path in the role tree. A sprite and the sound it makes sit under the same top level where possible (a chest is `world/prop`, its creak `world/chest`). **The role also decides what the playground does with a sprite, before its type:** `characters/player` is moved with the keyboard, so only a character a person plays has that role. A picture of the player (a portrait, a HUD face) is `interface/icon` |
| `themes` | The bundle's world first, then at most two more that truly fit. Platformer kit: `fantasy`, plus `forest` or `dungeon`. RPG kit: `fantasy`, plus `forest`, `farm` (village things) or `dungeon`. Roguelite kit: `sci-fi`, `space`, plus `horror` for hive things. Interface sounds and anything with no world: `neutral` |
| `gameTypes` | The bundle's game type first (`platformer`, `turn-based-rpg`, `roguelike-action`), then other types it suits without change: top-down fantasy things also `top-down-rpg`; sci-fi shots and explosions also `shooter`; pickups and interface also `arcade` |
| `view` | `side` or `top-down`: the kind of screen it was drawn for. `front`: drawn face-on and usable in both (pickups, portraits). `none`: interface pieces, icons, and effects with no ground or direction |
| `words` | 6 to 14 lowercase words a person would type: two or three nouns for what it is with synonyms (`chest`, `treasure`, `loot`), two or three verbs for what it does (its clip names: `open`, `collect`, `break`), the game event it belongs to (`reward`, `checkpoint`, `game over`), and one or two words for material or mood (`wooden`, `spooky`). Do not repeat the bundle name, the type or the theme |
| `license` | `'draft'` |

`name` is two or three everyday words. `blurb` or `description` is one sentence saying what it is and what can be changed.

### Originality

**Everything is original.** No name, character, creature, item, interface piece, tune or sound is taken from an existing game, film or book, and none may be close enough that a player would name the source. A common idea is free to use (a slime, a skeleton, a heart for health, a red barrel that explodes, a chest that shines when it opens). **One particular famous design is not**, and a design is recognised by a combination, not by one feature. The test: describe your asset in one sentence; if that sentence also describes a famous one, change at least two of its marks (silhouette, colour pairing, face, the one telling detail), and for a tune change the contour and the rhythm, not only the key.

Combinations that are ruled out, because each one is a famous design (this list is not complete):

| Do not make | Make instead |
|---|---|
| A walking mushroom: a cap (above all red with pale spots) on a pale stalk with a face and stub feet | A plant enemy with another body: a hopping seed pod, a thistle, a walking root |
| A plump five-pointed star with two eyes as a power-up | A star with sharp points and no face, or another charm altogether |
| A teardrop blob with a wide smile; a round pink thing that puffs up; a yellow disc with a wedge mouth | A blob with its own outline and face |
| A victory tune made of quick repeated pick-up notes rising to long held brass chords, or one ending flat-six, flat-seven, home | A tune with another contour, another rhythm and another instrument family |
| A rising four-note brass "item found" flourish; a two-note square-wave "coin" ping whose second note is a fourth above the first | Bell or plucked arpeggios of the kit's own house sound, with their own intervals (the existing `coin-pickup` is that ping and is to be changed: see the platformer specification) |
| A white-gloved pointing hand as a menu cursor; a revive item that is a long feather; a wooden crate stamped with an arrow that bounces the player | A plain arrow or diamond cursor; another object; another stamp |
| A plumber's cap, a green pointed cap and tunic with a sword, an orange armoured suit with a round visor and an arm cannon | The kit's own heroes, as specified |

When a specification's wording is close to something famous, say so in your report and build the safer reading. A reviewer fails an asset that a player would name as someone else's, however well it is drawn.

`kind` (the older field on sprites) is set to the nearest of `'Character'`, `'Creature'`, `'Item'`, `'Effect'`; `meta.type` is what counts.

---

## 14. Shared helpers

Written once (task W3-H) before the batches that need them. Builders use them and do not edit them; if one is missing something, write it in your own file and report it.

| Helper | File | What it must do | Needed by |
|---|---|---|---|
| `palettes` | `engine/palettes.js` | Export the three palettes of section 3 as `PALETTE.thornwood.<name>`, `PALETTE.hearthvale.<name>` and `PALETTE.derelict.<name>` (the bundle ids and `platformer`, `rpg`, `roguelite`, `scifi` are aliases), exactly as the tables of section 3 write them (a unit test reads the tables); `swatches(palette, material, { lead })` returning the swatch list for a colour control (palette colours first) and `materials(palette)` listing the material words it accepts (section 3) | every sprite batch |
| `tile-helper` | `engine/tiles.js` | `TILE = 32`. `blockClips(prefix, { frames })` returns the 13 clip entries; `drawBlock(g, piece, material, t)` draws any piece of a block from one material description (a fill pattern that repeats every 32 px, an edge with a profile that repeats along its length, the ink line on exposed edges, the front face for top-down walls); `tileNoise(x, y, seed)` repeating every 32 px; `thin`, `slope` and decal helpers. Plus `tools/tilemap.mjs <id>`: renders a sample map (a 5x4 block with an inner corner, a thin platform, decals) so joins can be seen | every tileset batch |
| `topdown-rig` | `rigs/topdown.js` | The top-down partner of `rigs/humanoid.js`: 48x48, `PIVOT [24, 42]`; `clips(speedOf, { action, extra })` returning the section 5 table; `dims(p)` from `height`, `build`, `head`; `pose(action, direction, t, m, d)` for idle, walk, run, attack, shoot, cast, block, dodge, talk, hurt, die in three directions; `draw(g, direction, P, d, look, hooks)` with the same hooks as the side rig, called in the right depth order for each direction; `sockets(...)` with `hand`, `offhand`, `head`, `back`, `feet`, `muzzle`; held-item helpers that take a direction | every top-down character |
| `humanoid-poses` | `rigs/humanoid.js` (extended) | Add the section 4 poses the side rig lacks: `die`, `block`, `victory`, `talk`, `shoot`, and a thrusting `attack` variant, with their standard clip entries, so no two characters invent their own fall | new side-view characters; the changes to `knight` and `wizard` |
| `backdrop-helper` | `engine/backdrop.js` | `LAYER = [320, 180]`; ridge and treeline outlines that wrap at 320 px; `scatter(count, seed)` wrapping positions; `recede(colour, depth, sky)`; `layerClips()` | every background |
| `ui-helper` | `engine/ui.js` | `panel9(g, x, y, w, h, { face, frame, border, corner })` with the section 8 bevel; the button states; the bar housing and fill | interface batches |
| `fx-helper` | `engine/fx.js` | Looping and one-shot particles (`life = fract(t + hash(i))`), `twinkle`, rings, shards, smoke puffs, the white-core-to-dark-rim colour steps of an effect (`steps`, `particles`, `sparkles`, `ring`, `shards`, `smoke`, `glow`, `twinkle`). Its one-shot helpers keep every piece inside the frame, so no frame comes out empty | **required** by every effect and projectile batch (it is in their `needs`): an effect is built from these helpers, so all effects of all three kits share one look. What a helper cannot do is written in the sprite's own file and reported |
| `compose-kit` | `tools/compose/kit.py` (or `.mjs`) | The parts of `battle_theme.py` every track repeats: the 16th clock, the bar counter and section gates for `bars`, the five level-matched melody instruments behind `inst`, the limiter and stereo bus, `key` and `bpm` wiring | every music batch |

---

## 15. Before you ask for review

1. `node tools/check.mjs <id>` or `node tools/sfx.mjs check sounds/<id>.json`: zero errors, every warning read.
2. Frame size, pivot, clip names, frame counts and cue frames are exactly the specification's.
3. Default colours are palette colours; no hex typed for a shadow.
4. Rendered sheets opened and looked at: default, all-low, all-high, every choice, every part set to `none`. With everything off and low, the first and last frame of every clip still draw something (section 4).
5. Tilesets: `node tools/tilemap.mjs <id>` looked at. Backgrounds: two copies side by side looked at.
6. `meta` passes; words are what a person would type.
7. Every control and cue that only matters sometimes has the `when` the specification gives; you added one wherever the checker asked for it.
8. Looked at under the whole-bundle looks Sunset, Night, Handheld and Mono: neighbouring materials still differ.
9. Described in one sentence, the asset is not a famous character, item or tune (section 13).
10. Your report says: what the specification got wrong or left open, and what you decided.
