# Loadout craft: how to make a good sprite

Written 2026-11-25. For makers (the `loadout-maker` agent) and reviewers.

**What this is.** The other documents are rules to pass: `docs/style-guide.md` (sizes, outline, colours, clips), `docs/quality-bar.md` (the checker and the rubric) and the skill (`.claude/skills/sprite-forge/SKILL.md`, how to write the file). This one teaches what makes a sprite *good*, and how to get it out of a Loadout data file. It adds no rule. Where it and a rule document disagree, the rule document wins; section 15 lists every place where common advice from outside and Loadout's rules pull apart.

**Why it exists.** Most assets pass review at 11 of 15: four criteria at 2 and one at 3. A 2 means "nothing wrong". A 3 means "someone chose this on purpose". The rubric's own words for a 3 are *a character of its own*, *deliberate clusters*, *weight and personality*, *reads in silhouette alone*, *a level built from it looks finished*. Those are craft, and no checker can measure them. This guide is about those words.

All paths are relative to `lab/sprite-forge/`.

Contents: [1 Five ideas](#1-the-five-ideas-that-do-most-of-the-work) · [2 Reading at 1x](#2-reading-at-1x-silhouette-shape-appeal) · [3 Value](#3-value-comes-before-colour) · [4 Colour](#4-colour-ramps-hue-shift-harmony) · [5 Pixel craft](#5-pixel-craft-clusters-lines-outline) · [6 Animation](#6-animation) · [7 Game feel](#7-game-feel-what-the-sprite-owes-the-game) · [8 Characters](#8-characters) · [9 Creatures and bosses](#9-creatures-and-bosses) · [10 Props, pickups, projectiles](#10-props-pickups-and-projectiles) · [11 Effects](#11-effects) · [12 Tilesets](#12-tilesets) · [13 Backgrounds](#13-backgrounds) · [14 Interface and icons](#14-interface-pieces-and-icons) · [15 Conflicts](#15-where-outside-advice-and-loadouts-rules-disagree) · [16 Flat and vector](#16-flat-and-vector-styles) · [17 Checklist](#17-the-one-page-checklist) · [18 Sources](#18-sources)

---

## 1. The five ideas that do most of the work

If you read nothing else, read this section.

1. **Silhouette first.** Fill the sprite with one flat colour. If a stranger cannot name it, no shading will save it. Put what makes the thing *that thing* on the outside edge: ears, a hat brim, a weapon held clear of the body, a tail.
2. **Value before hue.** Light against dark is what the eye reads at game size. Hue is decoration on top. Two parts that touch must differ in lightness, or they are one part.
3. **Few big shapes, then a little detail.** At 35 px there is room for three or four masses and two or three accents. Every extra detail takes room from a shape that was doing more.
4. **Uneven timing.** Good motion is slow, then fast, then slow: wind up, strike, settle. A clip whose pose changes by the same amount every frame looks like a machine.
5. **Judge at 1x, on a background, in motion.** The 4x sheet flatters. The player sees one pixel per pixel, over a tile, for a few frames.

Each idea maps to a rubric criterion: 1 and 3 are *Reads*, 2 and 3 are *Craft*, 4 is *Motion*, 5 is how a reviewer scores all of them.

---

## 2. Reading at 1x: silhouette, shape, appeal

### 2.1 The silhouette test

Yacht Club Games describe their character process as: check the silhouette, and if it is generic, add one element that changes the outline (a prop, an apron, a posture). Do the same.

How to test in Loadout: the first frame of `hurt` is the pose tinted white. `node tools/render.mjs <id> --clip hurt` gives you a ready-made silhouette at 8x. For other poses, squint at the `--scale 1` sheet.

What to check:

| Check | Pass looks like |
|---|---|
| Name it | A stranger says "bird", "knight", "chest" from the flat shape |
| Negative space | There are gaps of background between arm and body, between legs, under a wing. A gap must be 2 px or wider to survive at 1x |
| The telling feature is on the edge | The beak, the horn, the blade stick out of the mass. A feature drawn inside the body is not in the silhouette |
| Held things clear of the torso | A sword across the chest is noise; a sword beside or above the body is a shape |
| Different from its neighbours | Next to the other assets of its kit, no two share an outline. Two enemies that differ only in colour are one enemy |

A worked example from this library: `gale-gull` reads from its white `hurt` frame alone, because the wing, the beak and the tail each leave the body in a different direction. `keep-runner` is harder to read in `idle`: the bow, the blade and the front arm all cross the torso, so the middle of the figure is a knot of thin lines. Its `attack` reads far better, because the blade leaves the body.

### 2.2 Shape language

Shapes carry meaning before detail does. This is a convention of character design, not a law, but players read it without thinking:

| Shape | Reads as | Use for |
|---|---|---|
| Round | soft, friendly, harmless | heroes' heads, pickups, healing, small pets |
| Square | heavy, steady, slow | guards, golems, crates, shields, walls |
| Pointed | fast, sharp, dangerous | enemies, hazards, weapons, spikes, warnings |

Pick one main shape per asset and repeat it. A round creature with round eyes, round feet and a round tail hangs together. Then break the rule once, on purpose: one pointed horn on a round body says "cute, but it bites".

In data, shape language is your choice of primitive. `ellipse` and `capsule` give round; `rect` and `poly` with square corners give square; `poly` with sharp corners and `taper@1` give pointed. A body built from one kind looks designed; a body that mixes all three looks accidental.

### 2.3 Proportion and exaggeration

Small sprites need big features. Realistic proportions at 35 px give a 4 px head with no room for a face.

- **Heads are big.** On Loadout's people the head is roughly a third of the height. That is where the eye goes, so that is where the pixels go.
- **Hands, feet and weapons are oversized.** A blade 1 px wide flickers; 2 to 3 px holds.
- **Pick one thing to exaggerate** and push it further than feels safe: the beak, the shoulders, the hat. Then look at 1x. It is usually still not enough.
- **Nothing important is 1 px.** A 1 px line can vanish under a whole-bundle look or against the wrong tile. Eyes are the exception, and they are stamps placed by hand.

### 2.4 Appeal

Appeal is not "cute". It is a design that is clear and that someone would look at twice. The twelfth of the classic animation principles says clear, readable designs work best, and complicated faces work against it. In practice:

- **One idea.** Say the asset in five words: "a gull with pink wingtips". If you need fifteen, there are two ideas; drop one.
- **A focal point.** One spot has the highest contrast: usually the eye, or the glint on a pickup. Everything else is quieter.
- **Asymmetry.** A perfectly mirrored creature looks stamped. Tilt the head, raise one shoulder, give one ear a notch.
- **A pose with intent.** `idle` is not "standing". It is leaning, guarding, hovering, sulking. The idle frame is the one a reviewer scores *Reads* on.
- **Originality** (style guide section 13). Famous games are named in this guide only as reference points for a principle. Never copy a design. Describe yours in one sentence; if that sentence also describes a famous character, change two of its marks.

### 2.5 Self-check: reads

- [ ] The white `hurt` frame, or a squint at 1x, can be named.
- [ ] At least one gap of background inside the figure's bounding box.
- [ ] The telling feature breaks the outline.
- [ ] One main shape, repeated; one deliberate exception at most.
- [ ] One focal point, and it is the brightest or highest-contrast spot.
- [ ] Next to the kit's other assets it has its own outline.

---

## 3. Value comes before colour

**Value** is how light or dark a colour is. Loadout measures it as brightness, 0 to 1 (`brightness()` in `engine/color.js`).

### 3.1 The grey test

Derek Yu's tutorial says to remove the saturation and see whether the shading still reads. A Game Developer article on visual confusion gives the same test for a whole screen: desaturate it, and check that you can still tell characters, enemies and ground apart.

Loadout has this test built in: the Mono and Handheld looks. Run `node .claude/skills/sprite-forge/sheets.mjs looks <id>` and look at the Mono row. If the sprite turns into one grey blob there, it was held together by hue alone. The checker's S-survives-looks warning measures the same thing.

### 3.2 A value plan for one sprite

Decide three bands before picking any colour:

| Band | Share of the sprite | What goes there |
|---|---|---|
| Dark | about a quarter | the outline, the shadow side, hair or boots, the far limb |
| Middle | about a half | the main body material |
| Light | about a quarter | the face, the lit side, metal, the focal point |

Then assign materials to bands so that **neighbours are in different bands**. Skin (light) next to hair (dark) next to cloth (middle) reads. Cloth next to leather next to wood, all in the middle, does not.

The numbers the library has measured (quality bar, "Fixing S-survives-looks"): neighbours 0.2 or more apart in brightness almost never merge under a look; 0.12 to 0.2 apart merge about once in twenty; under 0.06 apart merge nearly half the time. **Aim for 0.2.**

In data: declare a derived slot with the `apart` rule (`{ "rule": "apart", "of": ..., "from": [[slot, 0.2]], "least": 0.2 }`), or `standOut`, or the generator `clear.of@1`, so the gap holds for every swatch a visitor picks, not only the default. The coin's `inlay-ink` slot is the worked example.

### 3.3 A value plan for a whole screen

A sprite is never seen alone. Decide where each *kind* of asset sits, and stay there:

| Layer | Value and contrast | Saturation |
|---|---|---|
| Background | narrow range, pushed toward the air colour | low |
| Tiles | middle range, calm; only the walkable edge is crisp | middle |
| Characters, enemies, pickups | full range, with the ink outline | high at the focal point |
| Effects and projectiles | the brightest things on screen, briefly | highest |

The same article makes the point that contrast is a budget: strong contrast everywhere competes with itself, so spend it where the player must look. Riot's effects guide says the same of saturation: environment muted, effects the most saturated.

This is why a background that looks dull alone is correct, and why a tile with lovely texture is wrong.

### 3.4 Self-check: value

- [ ] Mono look: every part is still a part.
- [ ] Touching materials are 0.2 or more apart in brightness, at every swatch.
- [ ] One light area, one dark area, and a larger middle; not three equal greys.
- [ ] The focal point holds the sprite's strongest light-against-dark step.
- [ ] Placed on its kit's tiles (`node tools/scene.mjs`), it does not sink into the ground.

---

## 4. Colour: ramps, hue shift, harmony

### 4.1 What a ramp is, and why you never type a shadow

A **ramp** is one material's tones from light to dark. Loadout uses three per material (`light`, `base`, `dark`; `deep` for creases and far limbs).

Pixel artists do not darken a colour by only lowering its brightness. That gives a "straight ramp", which Slynyrd's palette tutorial calls flat and prone to clashing. They also turn the hue: lights drift warm, toward yellow; shadows drift cool, toward blue or violet. Slynyrd shifts about 20 degrees of hue per step and treats that as the upper limit. Saturation peaks in the middle of the ramp and falls at both ends; bright colours lose saturation so they do not glare.

**Loadout's engine already does this.** `tone()` in `engine/color.js` moves lights toward yellow (up to 16 degrees per step) and shadows toward blue-violet (13 degrees per step) while holding colourfulness about steady. So `"metal.light"` and `"metal.dark"` are hue-shifted for free.

What this means for a maker:

- **Never type a shadow or highlight hex.** A typed one is almost always a straight ramp, and it breaks when the visitor picks another swatch. Use `"slot.light"`, `"slot.dark"`, `"slot.deep"`, or a `derive` slot with `tone`, `mix` or `ramp`.
- **Choose base colours that leave room.** A base that is already very light has no room for a `light` tone; a very dark base has a `dark` tone that touches the ink (style guide section 3, rule 4). Bases between about 0.35 and 0.7 brightness shade best.
- **Shadows on warm things should feel cool, and that is correct.** A red cape with a violet-red shadow looks richer than one with a brown shadow. Do not "fix" it.

### 4.2 Harmony inside one sprite

- **One dominant hue, one supporting hue, one accent.** Roughly 60 / 30 / 10 by area. Riot's guide puts it as letting one hue dominate and keeping its complement for small highlights.
- **The accent goes on the focal point or the telling feature.** `gale-gull` is grey and cream with a small orange beak and pink only on the wingtips, and the eye follows the wingtips through the whole `fly` clip. That is an accent doing its job.
- **Complementary pairs pop.** Orange against blue, red against green, yellow against violet. Use the pair once, at the focal point. Yacht Club's example is an orange character against blue.
- **Saturation is a budget too.** If everything is saturated, nothing is. Keep large areas calmer and let the accent be the most saturated colour.
- **Colours mean things** (style guide section 3, rule 7): gold is reward, red is danger, green heals, cyan is friendly energy, the player's cloth is blue. A red pickup that heals is a small lie the player pays for.

### 4.3 How many colours

Classic 8-bit practice is very tight: Shovel Knight held most sprites to four or five colours, and its makers found that a sprite with too many stuck out and was hard to animate. Slynyrd suggests about six for an item. Loadout's ranges are wider (a character 8 to 20, a pickup 6 to 12; style guide section 2), because three tones per material add up fast: five materials are fifteen colours before the ink.

The useful lesson survives the difference: **count materials, not colours.** Five materials is the ceiling for a character. If you want a sixth, one of the five is not earning its place. Fewer materials, each with a clear job and its three tones, beats many materials at one tone each.

### 4.4 Self-check: colour

- [ ] No hex outside `palette`; every tone is `slot.tone` or derived.
- [ ] One dominant hue, one support, one accent, and the accent is at the focal point.
- [ ] At most five materials on a character or creature.
- [ ] Every swatch of every colour control looks right with every other (the variants sheet's random rows).
- [ ] Colours follow the library's meanings (gold, red, green, cyan, hero blue).

---

## 5. Pixel craft: clusters, lines, outline

### 5.1 Clusters

A **cluster** is a group of touching pixels of one colour. Pedro Medeiros's glossary defines it as two or more; pixels side by side connect strongly, pixels touching only at a corner connect weakly. Good pixel art is a small number of well-shaped clusters. Bad pixel art is many small ones.

| Fault | What it is | Fix in Loadout |
|---|---|---|
| **Orphan pixel** | One pixel touching no cluster of its colour. It draws the eye and reads as noise. Allowed for a purpose: an eye, a glint, a star, a spark | Style guide forbids "single stray pixels". Make the detail 2 px, or make it a deliberate `stamp`. On backgrounds, `tidy@1` removes them |
| **Noise** | Many tiny clusters: scattered dots as "texture" | Fewer, larger marks. A tile fill has at most six |
| **Jaggies** | A line whose steps are uneven: 3, 1, 2, 1, 4. A clean line steps evenly: 2, 2, 2 or 3, 2, 1 | Shapes are rasterised for you, so most lines are clean. Jaggies appear when a shape lands on half pixels: use `"round": "px"` in bindings, and angles that step evenly (0, 45, 90, and slopes of 1:2) |
| **Banding** | Two tones whose edges run parallel, one hugging the other. The eye sees stripes and the form goes flat | Do not stack a `shade` band, a `light` band and a stamp line all following the same edge. Offset one of them, or drop it |
| **Pillow shading** | Dark all round the edge, light in the middle, as if lit from the camera. The Pixel Joint tutorial calls it banding that follows the outline | Light comes from the top right. `shade` puts the band on the far side only. Never add a dark ring inside the ink outline |
| **Doubles** | A line 2 px thick at a step where it should be 1 | Check corners of `line` and `arc` at 8x (`--clip`); thin with `"thick": 1` |
| **Flat blob** | An area wider than about 8 px with one tone | Add `shade: 1` (2 on shapes wider than 14 px), or split it with a second material |

**Deliberate clusters** is the rubric's phrase for a craft score of 3. It means: every area of a tone has a shape you could describe ("a crescent of shadow under the belly", "a wedge of light on the helmet"), and none is a leftover.

### 5.2 Light and shadow at three tones

- **One light, top right.** Top and right faces get `light` or `base`; left and under faces get `dark`.
- **Think in solids.** Derek Yu's advice is to treat the character as clay and carve it with shadow. A head is a ball: its shadow is a crescent on the lower left, not a ring. A crate is a box: one face lit, one face base, one face dark.
- **The shadow edge is hard.** Medeiros notes pixel art prefers a sharp edge between lit and shadowed sides, because a soft one becomes banding. Three flat tones with clean borders are the style, not a limit to work around.
- **Highlights are small and rare.** `light: 1` only on metal, glass, wet and glossy things. A glossy surface has a small tight highlight; a rough one has none. A highlight on cloth makes it look like plastic.
- **Cast shadows inside the sprite sell depth.** A 1 px `dark` line under a hat brim, under a chin, where an arm crosses the chest. These are the cheapest depth cues there are. (No shadow on the ground: the game adds it.)
- **Group shapes that are one body.** Shapes in one `group` get one shadow band and no seams. An arm drawn as two capsules in different groups has a shadow at the elbow that should not exist.

### 5.3 The outline

Loadout's rule: one ink outline (`#231b33`) round everything solid, drawn after the body; light (glow, fire, sparks) is drawn after the outline and rimmed with its own darker tone; tiles are inked only where you can bump into them; backgrounds have none.

Why this rule is a good one for a library: Lospec's outline articles point out that a dark full outline is the only kind that separates a sprite from *any* background, and Loadout cannot know what a customer's background is. It also makes "inked = solid, uninked = scenery" a language the player learns.

What the outline costs, and how to pay it:

- **It eats pixels.** A 1 px outline takes 2 px from every dimension. A 16 px pickup has 14 px of art. Plan shapes for the space inside.
- **It closes gaps.** A 1 px gap between arm and body is filled by the two outlines meeting. Leave 3 px if you want daylight.
- **It thickens thin things.** A 1 px blade becomes 3 px of ink with a 1 px core. Make it 2 or 3 px wide and shade it (`"shade": 0` on a 1 to 2 px metal shape, or it comes out all dark; skill, section 2).
- **Inside the outline, separate with value, not lines.** Lospec calls outlining only the outside "selective" and notes it keeps small sprites clean. Loadout's single outline pass does exactly that. Where two inner parts have the same value (head and neck), change one of the values instead of drawing a line.
- **Do not draw your own ink rim.** A shape painted `ink` under another gets a second ring from the outline pass and doubles (skill, section 10).

### 5.4 What Loadout does not do, and what to do instead

Outside tutorials teach three techniques that Loadout forbids. Follow Loadout. Section 15 lists them as questions for the owner.

| Technique | What it is for | Loadout's way |
|---|---|---|
| Anti-aliasing | Softening jaggies with in-between colours | Forbidden: every pixel is solid, and the background is unknown (both Derek Yu and Pixel Parmesan warn against outer-edge AA for that reason). Use even steps and angles that rasterise cleanly |
| Dithering | Blending two tones with a pattern | Forbidden. Use a third tone with a hard edge, or a few deliberate marks as texture |
| Coloured or light-following outline ("sel-out") | A softer look; outline lightened where lit | One ink colour. Lospec's own caveat is that a lightened outline vanishes on the wrong background |

### 5.5 Self-check: craft

- [ ] At 8x, every tone area has a describable shape; none is a leftover.
- [ ] No single pixels except eyes, glints and sparks placed on purpose.
- [ ] Shadow is on the lower left of every form; no dark ring inside the outline.
- [ ] No two tone edges run parallel for more than a few pixels.
- [ ] No unshaded area wider than about 8 px.
- [ ] Highlights only on shiny materials.
- [ ] Thin parts are 2 px or more and still show a core inside the ink.

---

## 6. Animation

Loadout clips are short (4 to 12 frames) and played at one frame rate each. With so few frames, every one is a decision. The twelve classic principles of animation still apply; this section takes the ones that matter at this size and says how to get each from a data file.

### 6.1 Key poses first

Thomas Vasseur's account of animating Dead Cells: block the key poses, get the timing right with as few frames as possible, and only then add in-betweens. Slynyrd says the same from the pixel side: the motion should read from the keys alone, and too many in-betweens make it sluggish.

For any action clip, name the keys before writing anything:

| Key | Job | In Loadout's `attack` (8 frames) |
|---|---|---|
| Rest | where it starts | frame 0 |
| Anticipation | the opposite of the action | frames 1 to 2 |
| Action | the fast part; often one frame | frame 3 |
| Contact | furthest reach; the hit | frame 4 |
| Follow-through | past the target, slowing | frames 5 to 6 |
| Settle | back to rest | frame 7 |

**The test:** look only at frames 0, 2, 4 and 7. If those four pictures tell the story, the clip works. If frame 2 and frame 4 look alike, there is no anticipation. Each key pose must pass the silhouette test of section 2 on its own; that is what "every clip reads in silhouette alone" means in the rubric.

In data: a rig clip's `keys` set `bones` (angles), `ik` (hand and foot targets), `root` and `stretch`; a pictures clip's keys set `nodes` (`turn`, `move`, `scale`), `root`, `show`, `hide`, `swap`, `emit`. Write a key for each pose above, not one per frame. The engine blends between keys.

### 6.2 Timing and spacing

**Timing** is how many frames an action takes. **Spacing** is how far things move between frames. Wide spacing is fast; tight spacing is slow. Life comes from changing the spacing inside one clip.

- A clip where the sword tip moves 3 px every frame is even, and dead.
- A clip where it moves 1, 1, 9, 6, 2, 1, 1 px is a swing.

Loadout plays every frame of a clip for the same time, so **spacing is your only timing tool**, and you set it with where you put keys and how each one eases:

| `ease` on a key | Motion out of that key | Use for |
|---|---|---|
| `smooth` | slow, fast, slow | most things: breathing, arms, settling |
| `in` | starts slow, ends fast | falling, a wind-up tipping into a strike |
| `out` | starts fast, ends slow | a jump rising, a recoil, a follow-through |
| `linear` | even | spinning, scrolling, conveyor motion; rarely a living thing |
| `hold` | stays put, then jumps at the next key | a held pose, a snap, a value that must not drift |

Put keys close together in `t` where the motion is fast and far apart where it is slow. A hold of one or two frames on the contact pose gives a hit weight; Slynyrd advises holding the follow-through a little longer than the other frames and keeping recovery short so the character does not feel stuck. Keep holds short: the checker warns (S-held-frames) when more than half the frames of a clip repeat the one before.

Slow in and slow out applies to living things. The exceptions are impacts: a thing that hits the ground stops in one frame.

### 6.3 Anticipation

Before a move, go the other way. Crouch before a jump. Draw the arm back before a punch. It is what lets the eye catch a 75-millisecond action, and it is what a player dodges.

- **Size:** the wind-up should be visible at 1x: 2 px or more for a body, more for a limb.
- **Length:** at 13 frames a second, two frames of wind-up are about 150 ms. For a player's attack that is near the limit before it feels slow. For an enemy it is the least a player can react to; the style guide's boss rule (three or more wind-up frames, the hit about 60% through) exists for this.
- **Even pickups anticipate.** The collect clip dips before it pops. `pickup.collect.whole@1` has no lift at the start, so a frame edit's `nudge` of 1 px down gives the dip (skill, section 10).

### 6.4 Follow-through and overlap

When the body stops, loose things keep going, then come back. When the body starts, they start late. This is the cheapest way to add life: hair, capes, tails, ears, antennae, scarves, plumes, a held lantern.

- The loose part reaches its far point one or two frames after the body does.
- It overshoots by 1 to 2 px, then settles.
- In a loop, give it a phase offset from the body (style guide section 4: "tails, hair, capes and antennae lag the body").

In data: key the loose part's bone or node at a later `t` than the body's key for the same move. On the person bases, capes and plumes are shared pieces: look at the clip sheet to see how much they already lag before adding more. On your own creature, do it yourself.

Slynyrd's overshoot trick works at any size: on the frame after an impact, shift the whole sprite 1 px in the direction of travel for one frame, then back. In data that is one `frameEdits` entry with `nudge`.

### 6.5 Squash and stretch

A thing going fast gets longer along its path; a thing that hits gets shorter and wider. **Volume stays the same**: taller means thinner. Squash without the matching widening reads as shrinking.

At Loadout's size, 1 to 2 px is a full squash. More than that reads as rubber, which is right for a slime and wrong for a knight.

| Where | How in data |
|---|---|
| A pickup or prop on one node | `node.size@1` with `wide` and `tall` (wider when shorter); `pickup.collect.whole@1` squashes on frame 1 and stretches on frame 2 for you |
| A node in a pictures body | a key's `nodes.<id>.scale`, or a two-axis size through `node.size@1`. Do not scale a node that carries 1 px stamps: they are resampled |
| A rig | a key's `stretch` on a bone (held to 0.5 to 1.5), with `root` lowered so the feet stay on the ground |
| A person on a baked base | Only deepen the crouch; never straighten a planted leg (skill, section 2, `travel`). Squash shows as a lower `root`, bent knees and arms out |

The `coin` shows it in two frames: frame 1 of `collect` is wide and flat, frame 2 tall and thin, then the flash.

Rigid things do not squash. A crate tilts and bounces (`prop.rock@1`); an anvil does neither.

### 6.6 Arcs

Limbs swing round joints, so hands, feet and weapon tips travel on curves. Thrown things follow a parabola. A tip that travels in a straight line between two keys looks mechanical, and one that leaves its arc for a frame looks broken.

A rig gives arcs for free when you key bone **angles**. You lose them when you key only `ik` targets at the two ends: the hand then slides in a straight line. Add a middle key that lifts the target onto the curve.

Check: on the 8x clip sheet, trace the weapon tip from frame to frame. It should be a smooth curve with no kink.

### 6.7 Smear frames

When something crosses a third of the frame in one step, the eye cannot connect the two positions. Classic animation solves this with a **smear**: for one or two frames the moving thing is stretched along its path, or leaves a trail. Slynyrd's advice for pixel attacks: one smear frame is usually enough, keep it fast, and it must follow the same path as the motion.

At 8 frames, the smear frame is the action or contact frame. Ways to make one in data:

- **An arc of light on the hit frame.** An `arc` shape shown for the contact frame only, or `crescent@1` as an emitter keyed on for that frame. `keep-runner`'s `attack` frame 4 does this with `arc` shapes: a white arc from where the blade was to where it is.
- **A stretch.** Lengthen the weapon or limb for the one fast frame (a rig key's `stretch`), back to normal on the next.
- **A trail.** `effect.dodge-trail@1` or `trail.puffs@1` behind a body that moves; speed lines behind a dash.
- **A swap.** `show` a drawn smear shape and `hide` the limb for one frame.

Rules: a smear lasts one frame, two at most. It is the colour of the thing or white, never a new colour. It sits along the arc of section 6.6. A smear that lingers reads as a second object.

### 6.8 Loops

- **Close the loop.** The last frame leads into the first by a step the same size as the others (the checker's S-loop-seam).
- **Give each part its own phase.** If the body, the tail and the ears all peak on frame 4, the loop pulses like a lamp. Offset them.
- **Idle is alive but calm.** Breathing 1 to 2 px, one blink, one loose part lagging. Slynyrd's point about idles: it only needs some movement. An idle that draws the eye more than `walk` is too busy.
- **Walk and run carry weight.** The body is lowest on the contact frames (0 and 4) and highest between them. Without that 1 px dip the feet slide. Arms swing against the legs.
- **Fliers bob against the wings.** The body rises as the wings go down.

### 6.9 Sub-pixel motion

Outside tutorials teach "sub-pixel animation": moving something less than a pixel by shifting its shading with in-between colours. Loadout has no in-between colours, so it is not available here. A move smaller than a pixel does not exist. Make idle motion a full 1 px, and get subtlety from *how few* pixels change (a 1 px rise of the chest, not of the whole body), not from how little they change.

### 6.10 Self-check: motion

- [ ] Frames 0, 2, 4 and 7 of an action clip tell its story alone.
- [ ] Each key pose reads as a silhouette.
- [ ] The step sizes in a clip are uneven: small, small, big, medium, small.
- [ ] There is a wind-up the opposite way, 2 px or more.
- [ ] Something loose arrives late and overshoots.
- [ ] Squash is matched by widening; rigid things do not squash.
- [ ] Tips of limbs and weapons trace a curve.
- [ ] The fastest step has a smear, an arc or a trail, for one frame.
- [ ] The loop closes, and its parts peak on different frames.
- [ ] Feet stay on the ground line; nothing detaches or pops.

---

## 7. Game feel: what the sprite owes the game

"Game feel" is what makes an action satisfying: the game answers the player at once and a little louder than real life. Much of it is the game's work (screen shake, pausing on a hit, sound). Jan Willem Nijman's well-known talk improves a dull shooter with about thirty small tweaks. Write-ups of it list many that an asset library supplies: animation, bigger bullets, muzzle flash, impact effects, bigger explosions, things that stay behind. (The talk is a video; this guide read reports of it, not the talk itself.)

What the sprite must bring so a game can feel good:

| The game needs | The asset supplies | Loadout rule or tool |
|---|---|---|
| **Hit flash**: the thing hit turns white for a frame | `hurt` frame 0 in the recoil pose, tinted white | a frame edit `"0": { "flash": true }`. It whitens what is drawn before the last outline; emitters and `glow` items keep their colour |
| **Impact frame**: the single strongest picture of a hit | The contact pose at full reach, with the arc or spark on the same frame, and the sound cue there | `attack` frame 4; impact cue on 4 (style guide section 11) |
| **Hit stop**: the game freezes both sides for a few frames on contact | A contact pose worth freezing on. Fighting games hold about 9 to 13 frames at 60 a second depending on strength; without it hits seem to pass through | The pause is the game's. Your job is that frame 4 is a clear, balanced picture, not an in-between |
| **Telegraph**: the player sees an attack coming | A wind-up that changes the silhouette, and for hazards a `warn` clip | boss moves: three or more wind-up frames; props: `warn` |
| **Recoil** | `shoot` frame 2 moves back 2 px; a `muzzle` socket for the flash | style guide section 4 |
| **Reward** | `collect`: dip, pop, white flash on 4, sparkles | `pickup.collect.whole@1`, `pickup.burst@1` |
| **Permanence**: something stays behind | The last frame of `die`, `break` and every burst is never empty: a body, crumbs, two or more pixels | "No frame is ever empty" |
| **Variety**: repeated things differ | Fill versions on tiles, random takes on sounds, several clips for one event | `-fill-b`, `-fill-c`; `rnd()` in sounds |

Three habits follow:

1. **Exaggerate the moment, not the whole clip.** The flash is one frame. The arc is one frame. The stretch is one frame. Then get out of the way.
2. **Put the sound on the picture.** The cue frame is the contact frame. A slash one frame early feels like lag. The rubric's *Game ready* 3 is "sounds that land exactly on the hit".
3. **Leave the clip quickly.** A long recovery makes a player character feel stuck in glue. An enemy can linger; that is its opening.

---

## 8. Characters

Loadout scale: about 35 px tall in a 64x64 frame, side view; about 30 px in 48x48, top-down. Built on a base piece (`base:person-side`, `base:person-topdown`) with parts.

Because every person shares one rig, the body is the same for all of them. **A character's identity is therefore its parts, its colours and its pose.** That is where the craft goes.

### What good looks like

- **Named from the idle frame by the head and the held thing.** Hair, hat, hood and weapon are the silhouette. Choose headgear that changes the outline (a brim, a plume, horns, a hood's point), not one that hugs the skull.
- **The weapon is clear of the body in `idle`.** Held out, down, or over the shoulder; not across the chest.
- **Three value bands**: light face, middle outfit, dark hair or boots, or another split that puts the face in its own band.
- **One accent colour** on the thing that says who this is: a scarf, a plume, a visor.
- **The face survives 1x.** An eye is one or two pixels chosen to stand out from the skin. Check `--scale 1`.
- **Every clip has a pose you could describe.** "Leaning back, blade behind the head" is a pose. "Arm slightly raised" is not.
- **Parts move with the body and lag it**: cape, hair and plume a frame behind.
- **Top-down: the three directions are plainly one person.** The same accent is visible from the front, the back and the side. The back view shows what the front cannot: pack, cape, hair shape.

### Common failures

| Failure | Why it happens | Fix |
|---|---|---|
| A knot in the middle | Bow, sword, arm and belt all cross the torso | Move held things outside the body's outline in `idle`; drop one item |
| Looks like every other person | Same base, same proportions, a hat that adds no outline | A part that breaks the silhouette; a `height` or `build` default away from the middle; a posture |
| Face lost | Eye the same value as skin or hair shadow | A `detail` slot chosen to stand out from the skin (`standOut`), placed as a stamp |
| Attack with no weight | Even spacing; no wind-up | Section 6.1: check frames 0, 2, 4, 7 |
| Floaty walk | No dip on contact frames | Lower `root` 1 px on frames 0 and 4 |
| Part left behind | Weapon `none` still holds a hand out | Check `--set weapon=none`; the clip `from` picks the unarmed version |
| Limbs merge | Near and far limbs the same tone | Far limbs use the `.far` tone |

### Self-check before review

- [ ] White `hurt` frame: head shape and held item both visible in the outline.
- [ ] `--scale 1`: face, weapon and accent all still there.
- [ ] Each of `idle`, `walk`, `attack`, `hurt`, `die` has a pose you can put in words.
- [ ] `attack`: frames 0, 2, 4, 7 tell the story; the tip follows an arc; frame 4 has reach.
- [ ] `die` ends face up, lying on the ground line, and is not empty.
- [ ] Every part set to `none`, and every option, in every direction: attached, nothing left behind.
- [ ] Variants sheet: every row is the same person.

---

## 9. Creatures and bosses

Frames: 48x48 small, 64x48 long, 32x32 swarm, 96x96 boss. Built from the creature and robot generators or a rig of your own.

A creature has more freedom than a person, so the silhouette can do everything. The quality bar says it plainly: a bat is wings and ears; a wolf is snout, ears and tail.

### What good looks like

- **Two or three telling features, exaggerated, on the outline.** List them before drawing. If you cannot list them, the creature is a blob with eyes.
- **A shape language that says how dangerous it is.** Round and small: harmless. Pointed: it hurts. Square and big: slow and strong.
- **Its way of moving is its character.** A hop with a real squash (2 px wide and flat on landing). A slither with a wave down the body. A flap where the body bobs against the wings. The move clip is on screen far more than the attack.
- **An attack the player can read.** The wind-up changes the outline: rears up, opens its mouth, glows. A player should know what is coming from the shape alone.
- **`hurt` and `die` have comedy or drama.** A recoil that bends the body. A `die` that falls, pops or deflates in its own way, ending on remains that say what it was.
- **Swarm creatures are simpler on purpose.** Shown by the dozen at 16 to 20 px: two materials, one accent, one clear motion. Detail turns to noise when multiplied.
- **Bosses read from across the screen.** One huge shape, one weak point or face as the focal point, and a wind-up of three frames or more that a player can react to. Detail goes round the focal point; the rest stays broad.

### Common failures

| Failure | Fix |
|---|---|
| A ball with eyes and stubs | Add the two features that make it this animal, and push them out of the mass |
| Symmetry | Tilt, lean, one raised limb |
| Recolour of another creature | Change the silhouette, not the hue |
| Idle and move clips look the same | Idle: breathing and a look-around. Move: the whole body travels through a cycle |
| Attack is the move clip, faster | Give it a wind-up the other way and a contact pose at full reach |
| Boss is a big version of a small enemy, with small-enemy detail everywhere | Broad forms, one focal point, long wind-up |
| Wings, tail or legs detach for a frame | Check the 8x clip; in a rig, parent them to the body bone |

### Self-check before review

- [ ] I can name its two or three telling features, and each breaks the outline.
- [ ] Its white `hurt` frame is not a ball.
- [ ] The move clip shows weight: squash on landing, bob against wings, or a wave.
- [ ] The attack's wind-up frame is a different silhouette from idle.
- [ ] `die` ends on remains that belong to this creature.
- [ ] At 1x beside the hero it is clearly an enemy (shape, accent colour) and clearly not the hero.
- [ ] Every silhouette choice (ears, horns, tail) gives a different outline.

---

## 10. Props, pickups and projectiles

### 10.1 Props

A prop sits in the level. It must be read in passing and it must say what it does.

**What good looks like**

- **The simplest true picture of the object.** Slynyrd calls reducing an object to a simple iconic image the key skill for items. A chest is a box with a curved lid and a lock. A lever is a base, a stick and a knob.
- **It looks like you can use it.** The part that moves (lid, handle, door) is a different value from the part that does not.
- **States differ in silhouette, not in a detail.** Open is a different outline from closed: the lid is up, the door leaves a dark gap, the lever points the other way. A state that differs only by a small light fails at 1x.
- **It sits.** The base is flat on the pivot line and at least as wide as the top, unless it is meant to look unsteady.
- **Change clips have anticipation and settle**: a chest lid dips 1 px, flies open past its rest, drops back. A broken crate swells a pixel before it bursts.
- **Wear is a few marks, not a texture.** Two cracks and a chipped corner say "old". Twenty dots say "noisy".

**Common failures**: a state change you must zoom in to see; a prop drawn from the wrong angle for its view (top-down is three-quarter view, section 1 of the style guide); so much detail that it outshouts the characters; a `break` that just vanishes.

**Self-check**

- [ ] Named at 1x in two seconds.
- [ ] Each state has its own outline, or a large value change.
- [ ] Stepped through its clips in file order, the story makes sense and wraps round.
- [ ] Stands on the pivot line; fills half to three quarters of its frame.
- [ ] The change clip overshoots and settles; `break` ends on crumbs.

### 10.2 Pickups

A pickup must be seen from the edge of the eye, on any background, and must feel good to take.

**What good looks like**

- **One bold shape**, 16 to 22 px in a 32 px frame. A coin, a heart, a gem, a key. Familiar objects are read at once, so the player knows what they do without being told.
- **It pops off any background**: the ink outline, a saturated body, and one white glint. The quality bar's words are "strong outline and highlight".
- **One idle motion, chosen for what the thing is.** Slynyrd's guidance: shine suits currency and looks odd on food; a bob suits floating things; combining them gets noisy. Use one system across a kit (currency glints, power-ups bob) so the player learns it.
- **The idle catches the eye without shouting.** A 1 to 2 px bob, or one glint sweep per loop (`pickup.sheen@1` with `glint@2`, or `gleam@1`), with rest between.
- **The collect clip is a small celebration**: dip, squash, pop up stretched, white flash, sparkles that spread and thin. That is anticipation, squash and stretch, an impact frame and follow-through in eight frames.
- **Light on light vanishes.** A sparkle in the body's own `light` tone over the body is invisible. Use the `shine` slot, or place the glint where it meets the outline.

**Common failures**: too small (12 px in a 32 px frame); a glint that is always on, so it is part of the picture and not a motion; a collect clip that only shrinks; value too close to common tile colours; a shape another famous game owns (style guide section 13).

**Self-check**

- [ ] Reads at 1x over light and dark tiles.
- [ ] One glint, not always on.
- [ ] Idle has rest in it.
- [ ] Collect: frame 1 squashes, frame 4 flashes, the last frame keeps two or more sparkle pixels.
- [ ] Every shape choice has its own outline.

### 10.3 Projectiles

**What good looks like**

- **The brightest, most saturated thing on screen.** Slynyrd's shooter notes: projectiles should be the most vivid objects and stand out from every background.
- **Direction is obvious from one frame**: a bright head and a tail that thins and cools. Riot's guide: make the leading tip the brightest, sharpest part so the eye follows it.
- **Its colour says whose it is.** Match the shooter. In Loadout cyan is the player's and red is hostile.
- **Bigger than is realistic.** Small bullets are missed. Fill the frame as the size table says.
- **It flickers or pulses.** Two alternating frames are enough to make it feel alive; high contrast between them is stronger but harder to track at speed.
- **`hit` is a burst, biggest first**, ending on a few pixels.

Slynyrd outlines projectiles in white, or bright inside and dark outside, so they stand apart from dark-outlined sprites. Loadout does it differently: solid shots get the ink outline, and energy is drawn after the outline with a rim of its own darker tone. Follow Loadout (see section 15).

**Self-check**

- [ ] Paused on any frame, you can tell which way it flies.
- [ ] White or near-white core, coloured body, darker rim.
- [ ] Reads at 1x over the kit's lightest and darkest tiles.
- [ ] `fly` loops with a visible flicker; `hit` starts big and ends on two or more pixels.

---

## 11. Effects

An effect is a short event made of light, smoke or bits. It has no outline; its shape and timing are everything. Built in an `emitters` body from the fx generators (`glow@1`, `ring@1`, `particles@1`, `shards@1`, `puffs@1`, `smoke@1`, `embers@1`, `crescent@1`, `flame@1` and the `effect.*` family; `node tools/gen.mjs` lists them all).

### 11.1 The life of a burst

Riot's effects guide times every effect in three unequal stages. Slynyrd describes the same curve for explosions. Loadout's rule ("frame 0 is the brightest and biggest idea") is the same thing compressed.

| Stage | Share of the clip | What happens |
|---|---|---|
| **Pop** | the first frame or two | A white core at near full size. Peak brightness and saturation. Riot puts the peak inside the first quarter of the effect's life |
| **Spread** | the next third | It grows fast, then slows. The solid shape opens into a ring; the ring breaks into arcs or blobs. Colour cools: white, then the `core` colour, then the `edge` colour |
| **Fade** | the last half | Pieces thin, drift (smoke rises, sparks fall), shrink a pixel at a time and end as two or more pixels. Smoke goes grey |

Expansion is never even. The first step is the biggest and each one after is smaller. An explosion that grows 4 px every frame looks like a balloon.

A build-up effect (`charge-up`, a spawn warning) runs the other way: gathering slowly, then a pop.

### 11.2 Primary and secondary

Riot splits each effect into a **primary** element (bright, sharp, one focal point) and **secondary** elements (dimmer, simpler, slower) that never compete with it.

- Primary: the core flash, the ring, the bolt, the blade of light.
- Secondary: sparks, smoke, embers, dust.
- If the secondary bits are as bright and as many as the primary, the effect is confetti. Fewer and dimmer.

### 11.3 Shape and colour

- **A strong simple shape**: a ball, a ring, a star, a crescent, a column. It should read as a silhouette on frame 0.
- **Three nested tones**: white-hot core, the `core` colour, the `edge` colour as a darker rim. That rim is what makes it show on a light background. The quality bar asks for "glows against dark and light backgrounds".
- **Whole pixels only.** No soft edges, no half-transparent pixels. Glow is concentric hard discs (`glow@1`). Fading is done by getting smaller and sparser, not by getting fainter.
- **Smallest piece 2x2** while it matters; single pixels only as the very last embers.
- **Short.** Riot's rule is that an effect should not outstay its use: it hides what the player needs to see. 4 to 12 frames at 14 to 20 a second is a quarter to three quarters of a second.

### 11.4 Loops

Every particle has its own life phase, so the loop closes and never pulses as one. Keep density steady. A looping effect is background to something else, so it sits lower in contrast than a burst.

### Common failures

| Failure | Fix |
|---|---|
| Starts small and grows to its peak | Put the biggest, whitest frame first |
| Even growth | First step biggest; ease `out` |
| Fades by vanishing all at once | Thin and shrink over the last half; end on a few pixels |
| Invisible on a pale background | Add the darker rim tone |
| Confetti: forty equal sparks | One primary shape; a handful of secondary bits |
| All particles in step | Give each its own phase or `seed` |
| Emitter off in the wrong clip | An emitter keyed with an `amount` in one clip is off wherever its amount is 0; key it in every clip that needs it |

### Self-check before review

- [ ] Frame 0 is the brightest and has a nameable shape.
- [ ] Steps of growth get smaller, not equal.
- [ ] Core, body, rim: three tones, nested.
- [ ] Reads over the kit's lightest and darkest tiles at 1x.
- [ ] Ends on two or more pixels, not on nothing and not on a lingering cloud.
- [ ] It is over in under a second unless it loops.

---

## 12. Tilesets

A tile is seen hundreds of times at once. Its job is to be the stage: to say clearly where you can stand, and otherwise to be quiet. The rules (the block, the 13 pieces, the joins) are in style guide section 6 and the checker tests them exactly. This section is about what the checker cannot see.

### 12.1 Readable ground

- **The walkable edge is the highest-contrast line in the tileset.** In side view: a light cap (grass, a trim course, a lit rim) on a darker body, with the ink line on top. A player's eye should be able to trace every platform in a screenshot at a glance.
- **Things you can bump into are inked; things you cannot are not.** Keep that language pure. An inked decal looks like an obstacle.
- **The fill is calmer than the edge.** If the inside is as busy as the cap, the cap is lost.
- **Solid and background tiles differ in value by a clear step.** A back wall (`brick-fill`) sits well away from the ground block in brightness, so nobody tries to stand on it.
- **Do not make a flat top look cut with a ruler.** Slynyrd's side-view advice: break the top with tufts and plants that overlap the surface while the collision line stays straight. In Loadout that is the `above` decals and the edge `inset` profile, pulled in by 3 px at most.

### 12.2 Hiding the grid

The enemy is the 32 px lattice. A tile that looks fine alone shows a dot every 32 px across a field.

Outside advice, and how Loadout does each:

| Advice | Loadout's way |
|---|---|
| Spread visual weight evenly; let no spot dominate (Slynyrd) | At most six small marks per fill, nothing brighter than `light` or darker than `dark` |
| Alternate textured patches with plain ones; leave open space | Version 0 of the fill is bare. The picker places it in four cells of ten, so the field has rest |
| A few variants for tiles that repeat in a row | `-fill-b`, `-fill-c` (up to `-fill-f`), mixed by the cell's position |
| Repeat a few key shapes for unity; let them touch at corners, never along sides | One or two mark shapes per material (a clod, a crack), placed with `scatter` and a `gap` |
| Do not put two busy textures side by side | A busy path needs a calm grass, and the other way round |
| Add occasional features | `on` decals: a flower, a pebble, a crack, scattered by position |
| Let clusters cross the tile edge and wrap to the far side | **Not in Loadout**: marks stay off the outer 2 px (3 px for fill versions), because any version must stand next to any other. See section 15 |

**The 10x6 test.** `node tools/tilemap.mjs <id>` and `node tools/scene.mjs`. Look at a field at 1x and let your eyes relax. If you can count the tiles, something repeats: a mark too dark, too large, or at the same place in two versions. The first fix is always *less*.

### 12.3 Texture that reads as material

A material is said with one or two marks, repeated, not with a picture of the material. Kenney's advice for simple game art: build texture by repeating one tiny motif; scatter it for natural stuff, put it on a grid for man-made stuff.

| Material | Mark | Placement |
|---|---|---|
| Earth | small clods, a pebble | scattered |
| Stone | short cracks, a chipped corner | scattered, few |
| Brick, paving | joints | on a grid that divides 32 evenly |
| Wood | plank lines, a knot | lines along the grain; knots rare |
| Metal plating | seams, rivets (2x2) | on a grid |
| Grass (top-down) | 2 to 3 px blades | scattered, in the `dark` tone |

Marks are in the ramp's `dark` tone (softer tones vanish under a look). Anything that repeats along a platform or a column fits the tile a whole number of times (the checker's S-tile-rhythm).

### 12.4 Depth

- **Side view:** the cap is lit, the body under it is `base`, and a 1 px `dark` row sits right under the cap as its shadow. The underside of a floating island is darker than its top.
- **Top-down walls:** the cap is the lightest, the front face clearly darker, then a base line and a 2 px shadow on the floor. That step in value *is* the wall's height. Too small a step and the wall is a floor pattern.
- **Holes:** the inner wall under the north edge is the cue for depth; the fill is the darkest thing in the set.
- **Floors are lighter than the walls round them** in a dungeon (Hearthvale's `flagstone` against `slate`), so characters stand out from both.

### Common failures

| Failure | Fix |
|---|---|
| A dot lattice across a field | Take marks off version 0; fewer and smaller marks on the others |
| Texture as busy as the characters | Lower the contrast of marks to `dark` on `base` only |
| Cannot tell platform from back wall | Raise the value step; ink only the solid one |
| A wall that reads as floor | Darken the front face; add the shadow |
| Ragged edge that reads as noise | Fewer, longer bumps in the edge profile |
| Fill versions that are the same marks, moved | Different marks, or different counts |
| Hero vanishes on the ground | Check with `tools/scene.mjs` under Mono; move the ground's value away from the hero's |

### Self-check before review

- [ ] In the tilemap at 1x I can trace every standable edge at a glance.
- [ ] Relaxed eyes on a 10x6 field: I cannot count tiles.
- [ ] Version 0 of every fill is bare.
- [ ] One or two mark shapes per material, in the `dark` tone.
- [ ] Solid and non-solid surfaces differ by a clear value step and by ink.
- [ ] Top-down: walls stand up (cap light, face dark, shadow); a room with a doorway looks like a room.
- [ ] A character from the kit stands on it under Original, Mono, Night and Handheld, and stays visible.

---

## 13. Backgrounds

A background's job is to give place and depth and then stay out of the way. 320x180, three layers (`far`, `mid`, `near`), no outline, built in a `layers` body from the backdrop generators (`sky.bands@1`, `ridge@1`, `treeline@1`, `cloud@2`, `mist.band@1` and others).

### 13.1 Staying behind

Everything that makes a sprite pop is turned down here, on purpose:

| Sprites have | Backgrounds have |
|---|---|
| An ink outline | No outline at all |
| The full value range | A narrow range inside each layer |
| Saturated accents | Every colour mixed 35% or more toward the air colour |
| Small sharp detail | Nothing smaller than 3 px (lights 2x2) |
| A focal point | No focal point in `mid` or `near` |

The test is the reverse of every other asset: **a good background is a little boring alone.** Judge it only with a character standing in front, as the style guide says. If your eye goes to the background first, it is too strong.

### 13.2 Depth: atmospheric perspective

Things far away are lighter, bluer, lower in contrast and less detailed. Each layer is one clear step from the next:

- `far`: lightest and coolest; land shapes nearly flat (tones within 15% of each other).
- `mid`: a full step darker and a little warmer, with broader shapes.
- `near`: the darkest, with the most shape in its outline.
- **Equal steps.** The value step from `far` to `mid` is about the same as from `mid` to `near`. A pale `mid` melts into the mountains.
- **Dark interiors run the other way**: the far wall sinks into dark and the floor under the fighters is the lightest thing.
- **Mist is a tool.** A `mist.band@1` at the foot of a layer separates it from the one in front for free.

Slynyrd makes the point that parallax only works if the still image already reads as deep. Look at the three layers stacked and not moving. If they read as one flat picture, scrolling will not save them.

Shovel Knight used five or six parallax layers and its makers said the many layers made the play layer *easier* to read. Loadout uses three; that is enough when each is a clear value step.

### 13.3 Shapes

- **Big simple outlines.** A ridge, a treeline, a row of towers. The skyline is the design.
- **Vary the rhythm.** Hills of different heights and widths; trees in clumps with gaps. An even picket fence of trees is a pattern.
- **Three tones per land shape at most**: a body, a lit edge (`ridge@1`'s `litEdge`), a shadow.
- **Sky in flat bands**, lightest at the horizon. No gradient, no dither.

### 13.4 Hiding the repeat

The layer repeats every 320 px. Slynyrd's rule for scrolling layers: "balanced layers without dominant points of interest help hide the loop."

- No single castle, moon or odd tree in `mid` or `near`. One landmark is allowed in `far`, which moves slowest.
- No shape repeated more often than every 160 px.
- Spread weight evenly: no heavy left half and empty right half.
- Look at two copies side by side. If you can point at the seam, or at a twin, fix it.

### Common failures

| Failure | Fix |
|---|---|
| Hero lost against `near` | `near` too close to the hero's value, or too detailed at the feet rows. Darken or lighten it a full step; keep the standing band calm |
| Layers merge | Unequal value steps; push `mid` |
| A postcard: lovely, and it steals the eye | Lower contrast and saturation; remove the focal point |
| Flicker when scrolling | Detail under 3 px; single pixels (`tidy@1` removes them) |
| The repeat is obvious | A landmark in `mid` or `near`; even spacing |
| Shape vanishes under a look | It differed from the band behind by hue only; give it 0.2 of brightness |

### Self-check before review

- [ ] Stacked, with a kit character at the feet row: the character is the first thing I see.
- [ ] Three clear, roughly equal value steps from `far` to `near`.
- [ ] Nothing in `mid` or `near` is brighter than the horizon band, except small lights.
- [ ] Two copies side by side: no seam, no twins.
- [ ] Skyline has uneven rhythm.
- [ ] Day, dusk and night, and the looks Sunset, Night, Handheld, Mono: every layer still separate.

---

## 14. Interface pieces and icons

Interface art is read, not looked at. Slynyrd's interface notes put function first: readable in every situation, without pulling the eye from play. Pedro Medeiros's piece on consistency treats the interface as its own "world" with its own style, kept apart from the game world. That is why Loadout's interface pieces carry no scenery, and why a status mark over a character belongs to the interface set.

### 14.1 Buttons, panels and bars

**What good looks like**

- **The frame frames; the middle is empty.** All decoration stays within 5 px of the edge. The text area is one flat colour.
- **Text will sit on it.** The face keeps 4.5 to 1 contrast against white text and the frame 3 to 1 against the face, under every look.
- **States differ by more than colour.** `pressed` moves the face 2 px down onto its lip and loses the bottom bevel: the button changes *shape*. `hover` is lighter; `disabled` is grey and flat. Cover the labels: can you still tell which is which at 1x?
- **The bevel obeys the light**: lit on the top and right, shadowed bottom and left, like everything else in the library.
- **A bar reads at a glance.** Fill and trough differ strongly in value; the fill is the saturated one. Health is the stat players check most, so it must be readable without looking straight at it. Segments or a notch help judge "about a third left".
- **One system.** Same corner, same border, same bevel across every piece of a set. Do not mix a horizontal gauge and a vertical one for the same kind of thing without a reason.
- **Quiet motion.** A cursor bobs 1 px. A bar flashes for four frames. Interface animation that outshines the hero is a fault.

**Common failures**: ornament creeping into the text area; `hover` that differs by one tone on a 1 px border; a face so light that white text fails; a fill strip that does not fit its housing; corners too big to nine-slice.

### 14.2 Icons and glyphs

An icon is the silhouette test with nothing else to lean on.

**What good looks like**

- **One idea, one object.** A sword. Not a sword on a shield with a ribbon.
- **The silhouette is the icon.** Fill it flat: still named? General icon practice puts a distinct silhouette above colour and every other property.
- **Drawn at its size.** A 16 px glyph is designed at 16 px with every pixel placed, never a 32 px drawing made small. Features are 2 px or more.
- **Uses the frame.** 20 to 26 px in a 32 px slot; up to 14 in 16.
- **One tilt for the whole set** (handle bottom left, point top right), so the set looks like a set.
- **Every icon in a set has its own outline.** Line them up as flat shapes. Any two alike? Change one. Two potions that differ only in colour will be confused by anyone who cannot tell red from green, and by everyone under the Mono look.
- **Three or four colours do it.** A body, its shadow, a highlight, the ink. An accent if it carries meaning.
- **Full and empty versions share an outline**, so a row of hearts does not jiggle as it drains.
- **Digits differ by more than 2 body pixels at 1x** from every other digit.

**Common failures**: too much detail for the size, so it greys out at 1x; two icons in a set with the same outline; inconsistent tilt or weight (one icon bold, the next spindly); meaning carried by colour alone; a glyph with enough pixels but too little contrast against its plate.

### Self-check before review

- [ ] Buttons: with labels covered, the four states are told apart at 1x.
- [ ] The text area is flat and clear; contrast holds under every look.
- [ ] Bars: the fill fits the opening at every setting; fill and trough are far apart in value.
- [ ] Icons: each one is named from its flat silhouette at 1x.
- [ ] The set, as silhouettes in a row: no two alike.
- [ ] Same tilt, same visual weight, same outline treatment across the set.
- [ ] Under Mono, every icon still means what it meant.

---

## 15. Where outside advice and Loadout's rules disagree

Follow Loadout's rule in every case. These are listed so a maker does not "improve" an asset into a failure, and so the owner can decide whether any rule should change. None is a recommendation to change.

| # | Outside advice | Loadout's rule (where) | What to do | Question for the owner |
|---|---|---|---|---|
| 1 | **Dithering** blends two tones and softens bands (Derek Yu; Pixel Joint tutorial). Yu also says avoiding it altogether is a valid choice | Forbidden (style guide section 2, "Forbidden") | Hard-edged tones; marks as texture | The data format has a `dither` primitive and `bands` with `edges: "dither"` (`docs/data-sprites.md` 2.7; skill section 2). The style guide forbids what the format offers. Should the guide say when, if ever, they may be used (a finish setting, another style)? |
| 2 | **Anti-aliasing** inside a sprite smooths curves (Pixel Parmesan; Derek Yu) | Forbidden; every pixel fully solid (style guide sections 1 and 2) | Even steps; clean angles | Inner AA does not depend on the background, so the usual objection does not apply to it. Worth a trial on large sprites (bosses, portraits)? |
| 3 | **Sub-pixel animation** gives motion finer than a pixel | Follows from 2: not possible. "A move smaller than one pixel is invisible" (style guide section 4) | Move a full pixel; move fewer pixels | Same as 2 |
| 4 | **Coloured or light-following outlines** look softer and richer (Lospec; Derek Yu) | One ink colour, `#231b33`, for everything solid (style guide section 2, "Outline") | Ink outline; separate inner parts by value | Lospec itself says a dark full outline is the safe choice for unknown backgrounds, which is Loadout's case. A lighter outline on the lit side could be a finish setting (`docs/sprite-styles.md`, level 1) |
| 5 | **Leave the outline off where an object meets the ground**, so it does not float (Lospec) | The outline goes all the way round and lands on the pivot row (style guide section 1, "Frame sizes") | Keep it; the game adds a ground shadow | Tiles already ink only exposed edges. Should grounded props drop the bottom line? |
| 6 | **White or double outlines on projectiles** set them apart from dark-outlined sprites (Slynyrd) | Solid shots get ink; light is drawn after the outline with a rim of its own darker tone (style guide section 2, "No outline") | Loadout's way; the white core does the same job | None; noted because makers copy the outside habit |
| 7 | **Very few colours per sprite**: 4 to 5 (Shovel Knight), about 6 per item (Slynyrd) | Character 8 to 20, pickup 6 to 12; the quality bar says fewer than the low end "usually reads flat" (style guide section 2; quality bar section 3) | Stay in Loadout's range; limit *materials* | The low end pushes toward more colours. Is "8 or more" right for a swarm creature shown by the dozen? |
| 8 | **Uneven frame times**: hold the contact frame longer; vary each frame's length (Slynyrd; animation practice) | One `fps` per clip (style guide section 4; clip format in the skill) | Use spacing: key positions and `ease`, and short holds | Holds repeat frames, and S-held-frames warns above half. A per-frame duration in the clip format would give real timing control |
| 9 | **Hit stop and screen shake** make hits land (Nijman; fighting-game practice) | Not part of a sprite; a game's job | Make the contact frame worth freezing | Should a clip carry a suggested hold (a `hitstop` hint per cue) for the playground and exports to use? |
| 10 | **Enemy attacks telegraph longer than player attacks**; player moves stay short for response | One `attack` row for both: 8 frames, wind-up on 1 to 2 (style guide section 4). Only bosses get "three or more wind-up frames" | Follow the table | Should ordinary enemies get a longer wind-up than players? |
| 11 | **Light from straight above** lets a sprite be flipped without the light changing (Kenney) | Light from the top right, always; and games mirror side-view sprites (style guide sections 1 and 2) | Top right | A mirrored sprite is lit from the top left while tiles stay lit from the right. Accepted, or worth a note in the guide? |
| 12 | **Let clusters cross tile edges and wrap**, which hides seams best (Slynyrd) | Marks stay off the outer 2 px, 3 px for fill versions (style guide section 6, "Calm texture" and the fill versions row) | Hide the grid with fill versions and decals | The margin makes versions interchangeable. It can also leave a faint clean line at every tile border on busy materials. Worth checking on the densest fills |
| 13 | **16x16 tiles**; above 32 is "overkill" (Slynyrd) | 32x32 (style guide section 1) | 32 | None. A 32 px fill has four times the area to keep calm, which is why section 12 leans so hard on "less" |
| 14 | **Five or six parallax layers** (Shovel Knight) | Three: `far`, `mid`, `near` (style guide section 7) | Three, with equal value steps | None |
| 15 | **Two-frame idles** (Yacht Club; 8-bit practice) | `idle` is 8 frames with breath and a blink (style guide section 4) | 8 | None |

---

## 16. Flat and vector styles

Loadout is pixel art only today (`"styles": ["pixel"]`). `docs/sprite-styles.md` plans a second renderer that draws the same shapes smoothly ("level 2"). Nothing here is built. This section is so that sprites made now carry over, and so the first flat assets start from good habits.

### 16.1 What carries over, and what does not

Everything in sections 1 to 4 and 6 to 7 carries over unchanged: silhouette, shape language, value, colour harmony, animation, game feel. They are about design, not pixels.

Section 5 does not. There are no clusters, jaggies or orphan pixels in a flat style. In their place:

| Pixel craft | Flat craft |
|---|---|
| Clean clusters | Clean curves: few points, smooth joins |
| Three hard tones | One or two flat shadow shapes per form, hard-edged |
| 1 px ink outline | A stroke of one even weight, or none at all, for the whole set |
| A 1 px eye stamp | A drawn eye shape (the stamp's `alt`, as `docs/data-sprites.md` 2.8 describes) |
| Detail by single pixels | Detail by small shapes; fewer than you think |

### 16.2 Principles for flat art

- **The shape is everything.** With no texture and little shading, a weak silhouette has nowhere to hide. Flat art needs *more* exaggeration than pixel art.
- **Commit to one shape language** for a whole kit. Geometric backgrounds with curvy characters look like two games.
- **Build from simple shapes.** Kenney's method: combine, turn and scale a few basic shapes; picture the object as a solid to place its shadow.
- **Shade from one side.** The same pillow-shading fault exists: do not darken every edge. One shadow shape on the side away from the light.
- **A small palette.** A handful of colours a picture is usual for flat work. Value still separates parts; hue only decorates.
- **Colour says material.** With no texture, the same shape in brown is wood and in grey is stone.
- **Texture is one repeated motif**, scattered for nature and on a grid for made things, and used sparingly.
- **Decide the outline once.** All stroked, or all unstroked. Unstroked art leans entirely on value to separate things from the background, so the value plan of section 3.3 becomes strict.
- **Smooth does not mean slow.** A flat renderer can play at 60 frames a second from the same keys. Timing and spacing still need to be uneven; more frames of even motion are still dead.

### 16.3 What to do today so a sprite can go flat later

These are already rules (style guide section 2, Contract 12); here is why they matter:

- **The body is shapes; the detail is stamps.** A stamp cannot be drawn smoothly. Anything that defines the silhouette must be a shape.
- **Do not lean on a single pixel to carry meaning.** If the design fails without one stamp, give that stamp a shape it could become.
- **Use `group` for bodies.** A flat renderer needs to know which shapes are one form.
- **Make the silhouette strong enough to work with no shading at all.** That is the flat style's entry test, and it is also the best thing you can do for the pixel version.

---

## 17. The one-page checklist

For makers before review, and for reviewers when scoring. Grouped by the rubric's five criteria (`docs/quality-bar.md` section 4). The left column is what earns a **2**; the right column is what earns a **3**.

Run first: `node tools/check.mjs <id> --no-cache` (zero errors), then `node tools/render.mjs <id> --scale 1`, the default sheet, each action clip with `--clip`, and `node .claude/skills/sprite-forge/sheets.mjs looks <id>`. Tilesets: `tools/tilemap.mjs`. Sets: `tools/scene.mjs`.

### Criterion 1: Reads as what it is (`reads`)

| For a 2 | For a 3 |
|---|---|
| Named in two seconds at 1x | Named from the flat silhouette alone |
| Fills half to three quarters of its frame | Its telling features break the outline |
| One focal point | A pose or attitude you can put in words |
| | One idea, said in five words; its own outline among its kit |
| | Not describable by a sentence that also fits a famous design |

### Criterion 2: Pixel-art craft (`craft`)

| For a 2 | For a 3 |
|---|---|
| Unbroken ink outline; light from the top right | Every tone area has a shape you can describe |
| Touching parts differ in value | Touching parts 0.2 or more apart in brightness at **every** swatch |
| Colours within the type's range | One dominant hue, one support, one accent at the focal point |
| No stray pixels; no flat areas over about 8 px | No parallel tone edges; no dark ring inside the outline |
| | Highlights only where the material is shiny |
| | Mono look: every part still a part |

### Criterion 3a: Motion (`motion`), for things that move

| For a 2 | For a 3 |
|---|---|
| Key poses clear; anticipation and follow-through present | Frames 0, 2, 4, 7 tell the story; each is a readable silhouette |
| Loops close; feet on the ground | Uneven spacing: slow, fast, slow |
| Nothing pops or detaches | Squash and stretch with volume kept; tips on arcs |
| | A one-frame smear, arc or trail on the fastest step |
| | Loose parts lag and overshoot; parts of a loop peak on different frames |
| | It moves like *this* creature and no other |

### Criterion 3b: States and use (`states`), for still things

| For a 2 | For a 3 |
|---|---|
| States clear at 1x | States differ in outline, not in a detail |
| Tiles join with no seam | A 10x6 field at 1x: tiles cannot be counted; standable edges traced at a glance |
| Layers recede | Three equal value steps; a character in front is seen first; no twins, no seam |
| Text area clear | States told apart with labels covered; contrast holds under every look |
| Icons: one idea each | The set as flat shapes: no two alike; one tilt, one weight |

### Criterion 4: Range of looks (`range`)

| For a 2 | For a 3 |
|---|---|
| Every row of the variants and choices sheets works | Each choice changes the **silhouette** |
| Each control does something visible (aim for 12 pixels or more) | All-low and all-high are both good assets, not a speck and a cramp |
| The same thing in every look | Every swatch pairing keeps the value plan (derived slots with `apart`, `standOut`) |
| | Sliders change the motion too: longer legs, longer steps |
| | Parts change alone and stay attached in every clip and direction |

### Criterion 5: Game ready (`ready`)

| For a 2 | For a 3 |
|---|---|
| Right frame, pivot, clips, frame counts | Sound cues on the exact contact frames |
| Required clips and states for its type | `hurt` starts on a white recoil frame; `attack` frame 4 is a contact pose worth freezing on |
| Sounds on the right frames | Last frames leave something behind; first frames grow from something |
| | Clips start and end on idle so a game can chain them |
| | Sockets (`hand`, `muzzle`, `tip`) where a game needs them; props step through their states in file order |

### By kind: the one question to ask

| Kind | Ask |
|---|---|
| Character | Would I know who this is from the head and the held thing alone? |
| Creature | Can I name its two telling features, and are they on the outline? |
| Boss | Can a player see the hit coming from across the screen? |
| Prop | Does it look usable, and is "open" a different shape from "closed"? |
| Pickup | Would I notice it at the edge of my eye, and is taking it a small celebration? |
| Projectile | Paused on one frame, which way is it going and whose is it? |
| Effect | Is frame 0 the biggest and brightest, and is it gone before it is in the way? |
| Tileset | Can I trace where to stand, and can I *not* count the tiles? |
| Background | With a character in front, is the character what I see first? |
| Interface piece | Is the middle empty, and do states differ by shape? |
| Icon | Is it named from its flat shape, and unlike its neighbours? |

### For reviewers: writing the fix that lifts a 2 to a 3

A total of 10 is a fail with nothing broken. The fix names the criterion closest to a 3 and a result the maker can check (`docs/review-protocol.md`, step 5). The right-hand columns above are those results. Examples of fixes worth writing:

- *reads*: "idle frame 0: the bow, blade and arm all cross the torso; move the blade outside the body's outline; target: the white `hurt` frame shows the blade as its own shape."
- *craft*: "outfit and belt are 0.07 apart in brightness; derive the belt with `apart` at 0.2; target: no S-survives-looks warning and the Mono row shows the belt."
- *motion*: "attack: the tip moves 4 px every frame; ease the wind-up `in` and add an arc on frame 4; target: steps of 1, 2, 9 or more, then smaller."
- *states*: "open differs from closed by a 3 px gap; raise the lid past the top of the box; target: the two states have different outlines at 1x."

---

## 18. Sources

Read on 2026-11-25. Everything above is paraphrased; the one direct quotation is marked in section 13.4. Advice from video-only teachers (MortMort, Brandon James Greer, AdamCYounis) could not be read as text and is not cited; the principles they teach are covered by the written sources below.

**Pixel-art craft**

- Derek Yu, "Pixel Art Tutorial". https://www.derekyu.com/makegames/pixelart.html : treat the form as clay and carve with shadow; squint for big light and dark shapes; the desaturate and flip checks; when dithering, AA and selective outlining are used and their risks.
- cure, "The Pixel Art Tutorial" (Pixel Joint forum). https://pixeljoint.com/forum/forum_posts.asp?TID=11299 : definitions and fixes for jaggies, banding (hugging, skip-one), pillow shading, noise, single pixels; hue-shifted ramps; value range.
- Pedro Medeiros (saint11), pixel art glossary. https://saint11.art/blog/glossary/ : clusters, orphan pixels, sharp shadow edges, specular highlights by material.
- Pedro Medeiros, "Consistency". https://saint11.art/blog/consistency/ : one pixel size, no scaled or freely rotated sprites, shared palette, the interface as a separate "world".
- Pedro Medeiros, pixel art tutorials index. https://saint11.art/blog/pixel-art-tutorials/ : the range of topics a sprite maker must cover (silhouette, outlines, squash, impact, smears, tiles, nine-slice), used to check this guide's coverage.
- Lospec, "Pixel Art Outlines". https://lospec.com/articles/pixel-art-outlines : what outlines are for; full, outer-only and partial inner lines; the pixel cost on small sprites; dropping the line at the ground.
- Lospec, "Pixel Art Outlines Part 2: Using Color". https://lospec.com/articles/pixel-art-outlines-part-2-using-color : coloured and selective outlines, and why dark full outlines are safest on unknown backgrounds.
- Pixel Parmesan, "Anti-Aliasing Fundamentals for Pixel Artists". https://pixelparmesan.com/anti-aliasing-fundamentals-for-pixel-artists : when AA helps, why outer-edge AA fails on unknown backgrounds, banding from parallel tangents.

**Colour and light**

- Raymond Schlitter (Slynyrd), "Pixelblog 1: Color Palettes". https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes : hue shifting (about 20 degrees a step as the limit), saturation peaking mid-ramp, why straight ramps look flat.
- Slynyrd, "Pixelblog 6: Light and Shadow". https://www.slynyrd.com/blog/2018/6/15/pixelblog-6-light-and-shadow : fix the light first; top-right or top-left light; a few cast shadows make a small piece vivid.

**Animation**

- "Twelve basic principles of animation" (Wikipedia, after Thomas and Johnston). https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation : squash and stretch with constant volume, anticipation, follow-through and overlap, slow in and out, arcs, timing, exaggeration, appeal.
- "Smear frame" (Wikipedia). https://en.wikipedia.org/wiki/Smear_frame : kinds of smear (stretched in-between, multiples, trails) and that they last one or two frames.
- Slynyrd, "Pixelblog 8: Intro to Animation". https://www.slynyrd.com/blog/2018/8/19/pixelblog-8-intro-to-animation : strong key frames over smooth in-betweens; energy over smoothness; simple idles.
- Slynyrd, "Pixelblog 9: Melee Attacks". https://www.slynyrd.com/blog/2018/9/8/pixelblog-9-melee-attacks : hold the follow-through, keep recovery short, one fast smear on the motion's path, a one-pixel overshoot, slight stretch at full reach.
- Thomas Vasseur, "Art Design Deep Dive: Using a 3D pipeline for 2D animation in Dead Cells" (Game Developer). https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i- : keys and timing first with the fewest frames; effects carry the sense of impact when poses are sparse.

**Game feel and readability**

- Game Developer, "Vlambeer co-founder shares advice on building better action games" (report on Jan Willem Nijman's "The Art of Screenshake"). https://www.gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games : game feel as about thirty small tweaks. The list of tweaks in section 7 comes from search summaries of other write-ups of the talk, not from this article or the talk itself; treat it as indicative.
- Maj, "Impact Freeze" (Sonic Hurricane). https://sonichurricane.com/?p=1043 : what hit stop is, why hits look like misses without it, typical lengths of about 9 to 13 frames.
- Game Developer, "How to reduce visual confusion in your game". https://www.gamedeveloper.com/design/how-to-reduce-visual-confusion-in-your-game : the desaturate test for a screen; play elements as the lightest or darkest things; contrast as a budget.
- VFX Apprentice, "10 Design Tips from the League of Legends VFX Style Guide" (summary of Riot Games' guide). https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips : primary and secondary elements; the pop within the first quarter; one dominant hue; brightest leading tip; short effects.
- Yacht Club Games, "Breaking the NES". https://www.yachtclubgames.com/blog/breaking-the-nes/ : four to five colours a sprite, why too much detail hurts and is hard to animate, parallax layers aiding readability.
- Yacht Club Games, "Creating a Shovel Knight Character Sprite". https://old.yachtclubgames.com/2020/03/creating-a-shovel-knight-character-sprite : silhouette check and adding one outline-changing element; complementary colours; consistent scale across a cast.

**By kind of asset**

- Slynyrd, "Pixelblog 20: Top Down Tiles". https://www.slynyrd.com/blog/2019/8/27/pixelblog-20-top-down-tiles : even weight, open space, busy beside calm, repeated key shapes, occasional variants.
- Slynyrd, "Pixelblog 28: Side View Tiles". https://slynyrd.com/blog/2020/5/21/pixelblog-28-side-view-tiles : breaking a flat top while collision stays straight; a variant or two for repeated tiles; simple light background layers.
- Slynyrd, "Pixelblog 23: Parallax Scrolling". https://www.slynyrd.com/blog/2019/11/12/pixelblog-23-parallax-scrolling : depth must read in the still image; balanced layers hide the loop (quoted once in section 13.4).
- Slynyrd, "Pixelblog 24: Items". https://www.slynyrd.com/blog/2019/12/21/pixelblog-24-items : iconic simplification, about six colours, one idle motion suited to the item, one system across a set.
- Slynyrd, "Pixelblog 26: UX/UI Design Basics". https://www.slynyrd.com/blog/2020/2/23/pixelblog-26-uxui-design-basics : function before decoration, readable health, consistent rules, quiet interface motion.
- Slynyrd, "Pixelblog 31: Shmup Design Part 1". https://www.slynyrd.com/blog/2020/12/14/pixelblog-31-shmup-sprite-design : projectiles as the most vivid things on screen; two-frame flicker; explosions that expand fast then slow, white to warm to grey.
- Kenney, "Improving 2D vector art". https://kenney.nl/knowledge-base/learning/improving-2d-vector-art : building from basic shapes, one light direction, texture from one repeated motif, colour as material.
