# pieces/

Shared data that many sprites use by name: bases (whole rigs with clips), parts (hair, headgear), held things,
interface skins, tile materials, fonts and stamps (`docs/data-sprites.md` sections 1.2 and 3.3; Contract 15 rule 5).
Pieces are framework: they are reviewed like framework code, and an asset never brings one.

## One file per version

```
pieces/<kind>-<name>.v<v>.json        part-hair-bob.v1.json is the piece part:hair-bob, version 1
```

Kinds: `base`, `part`, `held`, `skin`, `material`, `font`, `stamp` (`engine/pieces.js PIECE_KINDS`). A name is
lowercase letters, digits and hyphens. Nothing else lives here except this file and `_pins.json`.

**A released version never changes.** A changed look is a new file with the next version; the old one stays until
no asset names it. `_pins.json` holds the hash of every released version, and `tests/unit/pieces-index.test.mjs`
fails when a pinned version's content changes or a version has no pin. Pin a version when it is released:

```
node tools/lib/pieces-index.mjs            check every piece and list them
node tools/lib/pieces-index.mjs --pin      pin the versions not pinned yet (never rewrites a pin)
node tools/lib/pieces-index.mjs --write    write generated/pieces.json (the build does this)
```

## What a piece file holds

```json
{ "format": "loadout-piece", "version": 1,
  "id": "part:hair-bob", "v": 1, "name": "Bob", "about": "One sentence that says what the piece is.",
  "slots": [ { "id": "hair", "label": "Hair", "default": "#5a3a22", "material": "plant" } ],
  "args":  { "length": { "type": "px", "lo": 1, "hi": 6, "default": 3 } },
  "made":  { "from": "rigs/humanoid.js" },
  "body":  { "draw": [ ... ] } }
```

`slots` are the piece's own colours. A use colours each one with its `paint` map first, else the sprite's
palette slot of the same id (so a knight that `extends` `base:person-side` with no paint map colours the base's
`skin` with its own `skin`), else the slot's `default`; a slot with none of these is an error (`bindSlots` in
`engine/pieces.js`). Slot ids, arg names and piece names may not be names every object already has (`toString`,
`valueOf`, `constructor`...). `args` are what a use may set. The body field each kind needs: `base` `rig`, `part`
and `held` `draw`, `font` `glyphs`, `stamp` `rows`; `skin` and `material` are checked by their layout's module.
The body's own rules (primitives, generators, paints) are checked by the v2 schema.

## How an asset uses one

```json
{ "id": "hair", "kind": "use", "use": "part:hair-bob", "v": 1, "on": "head", "args": { "length": 4 }, "paint": { "hair": "hair" } }
"extends": { "use": "base:person-side", "v": 1 }
"place": { "use": "stamp:clod", "v": 1, "paint": { "a": "soil.dark" } }
"font": "font:chunky@1"
```

A definition always names the version it was made with. At most 24 different pieces per definition, and at most
64 loaded with what they use in turn, at most 4 deep, with no loop (`engine/pieces.js PIECE_LIMITS`).

## The top-down person (B16b): `base:person-topdown`, `base:person-topdown-walker`, `part:topdown-*`, `held:topdown-*`

Made by `tools/bake-topdown.mjs` from `rigs/topdown.js`. **Both were deleted in R2 (2026-11-21)**: these files are
pinned data now, no baker rebuilds them and no test compares them with a code rig. A released version never changes
(Contract 15 rule 5): a change is a new version of the piece. Names: the top-down family's parts and held things are `part:topdown-<name>` and
`held:topdown-<name>`, apart from the side-view family's (`part:hair`, `held:sword` ..., B16a).

**Bases.** `base:person-topdown` holds every standard clip of the code rig: `idle`, `walk`, `run`, `attack` (with
nothing held the code rig punches), `shoot`, `cast`, `block`, `dodge`, `talk` as `<action>_<down|up|side>`, and `hurt`
and `die` facing down (the code rig's plain names). `base:person-topdown-walker` is the same rig with `idle_*`,
`walk_*` and `talk` only. A sprite takes every clip of the base it extends (there is no `extends.clips` yet), so a
villager who never fights extends the walker. A sprite that wants a plain clip (`cast`, `block`) names
`{ "from": "cast_down" }`. `die` from its third frame shows `dieTip` / `dieLie`, stamps of the code rig's own
drawing (the code rig tips and turns its whole picture), with every other base shape hidden; the bones are still
laid on the tipped or lying body, so attach points and parts follow it, but a part's stamps do not turn.

**Keys are sparse.** A track (a bone's angle or stretch, the root, a stamp variant, a shape shown) is written only on
the frames where it changes and the frame before, so blending gives every frame its exact value; a track at the rest
or the direction's own value on every frame is left out. Angles are written to 0.01 degree, stretches to 0.0001 (a
coarser stretch moves a sleeve's shade band). Helper bones that only carry a shape the frame hides are free on that
frame. That is what lets 29 clips fit one file (128 KB): 116 KB now, so a later clip set (armed carries) goes in a
base of its own built from the same rig, not into this one.

**Where to hang parts** (bones and screen-aligned nodes; F is the weapon side, B the other):

| Id | What it is | Hang |
|---|---|---|
| `root` | node on the ground under the body; keys move it | things planted on the ground (`held:topdown-cane`) |
| `hip` | bone from the ground up to the hip line; Height and Stoop scale it | a robe (`part:topdown-robe`: it shortens in a crouch) |
| `waist`, `chest` | nodes at the hip line and the top of the torso | belts, collars, the stooped back (`part:topdown-hunch`) |
| `spine`, `neck`, `nape` | torso and the two bones that carry the head (it sinks into the chest in a crouch) | |
| `head` | node at the middle of the head | hair, beards, headgear |
| `shoulderF/B` | bone out to the shoulder (Build scales it: the arm moves in and out) | |
| `armTopF/B` | node at the top of the sleeve | epaulettes |
| `armF/B`, `armIF/B` | the sleeve, long and short (each frame shows the one that reaches) | |
| `elbF/B`, `wriF/B` | elbow and wrist (not drawn): carry the hand | |
| `cuffF/B` | node at the hand, screen-aligned | things that hang (`held:topdown-lantern`) |
| `handF/B` | node at the hand, turned the way a held thing points (F; the carry 'up' angle at rest) or along the arm (B) | held things |
| `grpF/B`, `fistF/B` | bone to the fist's corner and the node there (the fist stamp) | cuffs |
| `rimSF/B`, `rimAF/B`, `rimIF/B` | the sleeve's rim: the sleeve a pixel nearer the body (helpers) | |
| `hipF/B`, `thiF/B`, `shnF/B`, `toeF/B`, `footF/B` | out to the leg, thigh and shin to the sole (it ends on the ground, so scaling the hip with them keeps the feet down), the boot's corner node | boots, greaves |
| `ankF/B`, `legF/B`, `legIF/B` | from the boot to the ankle, and the side view's leg up to the hip (long, short) | |

The base's shapes keep their z per direction: legs 10 to 13, torso 20, sleeves, rims and fists 30 to 35 (down and
up; fists 60 and 62 facing down), the near arm 70 to 72 from the side, the head 50, face 52 and 53. A garment the code
rig draws over the arms (its `torso` hook) uses z 40 or more facing down and up, which also covers the sleeves' rims.

**Numbers in node frames.** A point on a node or bone is `[u, v]`: u along it (down the screen on a screen-aligned
node), v across (right on a node; on the hip bone, which points up, v is to the screen's left). An ellipse's radii in
such a frame are written the same way round: `r: [along u, along v]`, so `[vertical, horizontal]` on a node.
`extends.paint` maps the base's slots (`skin`, `top`, `bottom`, `boots`, `topFar`, `bottomFar`) to the sprite's.

### Migration batch M7: the nine top-down people (`tools/bake-topdown-m7.mjs`, deleted in R2)

**R2 (2026-11-21) deleted the baker and the rigs it read: everything in this section is pinned data now, and the `node
tools/bake-topdown-m7.mjs ...` commands below are history, kept to say how each file was made.** Made by `tools/bake-topdown-m7.mjs` from `rigs/topdown.js`, `rigs/topdown-riot.js` and `rigs/topdown-sneak.js` (it
loads a copy of `tools/bake-topdown.mjs` with three hooks; that file is unchanged). `node tools/bake-topdown-m7.mjs
--write` writes version 1 of its pieces and bases, `--lying` the version 2 pieces below; neither rewrites a file, and
no mode writes a version in the baker's `REPLACED` list (versions replaced before release; see "Replaced before
release" below).

**Bases with carries.** `base:person-topdown-{sword,guard,mage,child,rogue,merchant,ranger,trooper}@1` are
`base:person-topdown-walker@1`'s rig (byte for byte) with the clips a character who carries something needs, keyed from
the code rig's pose with that carry (a sword up, a pole at attention, a staff as a walking stick, a gun in both hands,
a body shield, the rogue's dash, the child's rock and flail, the merchant's count and wave). They are eight files
because one piece holds at most 128 KB and their clips are 417 KB (`base:person-topdown@1` alone is 116 KB), and a
base cannot extend another base; a fix to the rig is a rerun of the baker, which bakes all eight. A clip a sprite's
`from` picks by a setting is named with a dash before its direction (`swing-down`, `idle-pole-side`): without pieces
loaded the validator checks a picked name against `CLIP_NAME` (`catalog/sprite-schema.js`), which has no underscore.

**`reachF`, `reachB`** (these eight bases only): bones from `handF` / `handB` along what that hand holds, 10 px at rest,
stretched by the pose's reach (the code rig draws a held thing pointing at the camera shorter), so a held piece on one
turns and foreshortens as the code rig draws it. `held:topdown-weapon`, `-polearm`, `-stick`, `-flower`, `-magic`,
`-blades`, `-guns` hang on `reachF` (u along the thing), `-blades-off` on `reachB`; `held:topdown-basket` and
`-trade-goods` hang from `cuffF`. B16b's `held:topdown-cane` and `-lantern` keep `root` and `cuffF` on the walker base.

**Worn pieces at version 2: `pose`.** The base's `die` shows its own pictures from frame 2 (`dieTip`, `dieLie`), and
a worn piece's stamps cannot turn. `part:topdown-hair`, `-cape`, `-suit-pack`, `-body-shield`, `-helmet`, `-crown`,
`-visor-helmet`, `-visor`, `-hood` and `-lens-mask` at version 2 take `pose`: `stand` (version 1's drawing), `f2`, `f3`
(the tipping frames) or `lie` (frames 4 to 7), which draws only the thing's picture in that frame, on the `root` node.
A dying sprite uses each such piece standing and once per pose (`hairLie2`, `hairLie3`, `hairLie`, hidden), its `die`
frame edits hide the standing use and show that frame's, and it gives its own `dieTip` and `dieLie` (same ids, so they
replace the base's) with what it always wears. `part:topdown-scarf@2` takes `pose` `rest` or `run0` to `run7`: the
tail whipped out behind the rogue's dash in that run frame, one use per frame shown by the run clips' frame edits.

**Bases at version 2: keyed at the code sprite's defaults** (`node tools/bake-topdown-m7.mjs --bases2`; second review
of M7). Version 1 keyed every clip with the code rig fitted to the biggest headgear and the longest weapon, where the
code rig crouches the body or moves it aside, so the mage stood 4 px shorter at every setting and the guard 7 px off the
pivot from the side. `base:person-topdown-{guard,mage,child,rogue,merchant,ranger,trooper}@2` key the same clips (same
names) at the code sprite's own defaults (`AT_DEFAULTS` in the baker: its headgear and weapon at size 1, the child's
Bounce 0.7 and slight build); the ranger's adds `shoot-beam-*`, `die-beam` and `dodge-beam` for the longer beam gun, and
the trooper's `shoot-jab-*` stays fitted to the longest baton (the trooper's in use is `@3`, below). The few settings that then reach the frame's edge are held
in by each sprite's own tables (a top end that stops growing, a Height range a pixel or two short; the batch's report
lists them). `base:person-topdown-sword` stays at version 1. Version 1 of the seven was never released and nothing
used it: it was removed with its pins (M7b). The child's smock is farm-kid's own stamps (`m7ChildGarments`), read on
the code child, not the adult garment pieces.

**Held things drawn at the bone's angle (M7b, M7c).** A held thing on `reachF` or `reachB` is the code's own drawing
calls written in the bone's frame ([u along the thing from the hand, v across it]: a code point `to(dist, turn)` is
`[dist cos(turn), dist sin(turn)]`), its lengths bound to the piece's `length`, so the renderer draws it at the bone's
angle as the code does. The first versions were pixel read-backs taken with the thing pointing down and turned with the
bone, which broke into single pixels and outline gaps at an angle. On a bone stretched by the pose's reach the
stretch scales every u, where the code keeps its fixed offsets: the parts may slide up to a pixel against each other.
- `held:topdown-polearm@4`: the halberd (shaft, a clipped disc of a blade as a polygon, hook, spike) or the pike (shaft,
  leaf head, socket) as shapes at the reachF bone's angle (`tests/unit/m7-topdown-pieces.test.mjs` `polearm()`).
- `held:topdown-blades@2`, `-blades-off@2`: the rogue's dagger, short sword or claws, and the second of a pair on
  `reachB` (from the side the far one in the metal's `far` ramp); `held:topdown-guns@2`: the ranger's blaster, scatter
  and beam (the cell lit) and the trooper's rifle, pistol and baton, with `view: "end"` for a gun the code sees end on
  (reach under 0.7, facing down, pointing within 17.5 degrees of the camera: the sprites show it by frame edits on those
  frames); `held:topdown-stick@2`; `held:topdown-flower@2` (the bloom a stamp on the tip, upright on the pixel the
  code centres it on); `held:topdown-magic@3`: the staff and the wand without the lit end, which the sprite draws (an
  orb is only light: nothing). Made by `tests/unit/m7-topdown-held.test.mjs` (`M7_PIECES=write`), which also holds each
  against the code at every frame a clip turns it to. A sprite whose slot for a held thing is a detail slot (flat)
  maps it to a derived slot (`tone` by 0) so the thing is shaded as the code shades it.
- `part:topdown-belt@2`: version 1 with its colour as given (key `c: belt`), not its shadow tone.
- `held:topdown-magic@2` (version 1 without the lit end, still a read-back) is replaced by `@3`.

**`base:person-topdown-walker@2`** (M7c): version 1 with its `talk` keyed again with the free hand raised as the code
elder raises it (`node tools/bake-topdown-m7.mjs --walker2`; a sprite's own keys cannot swap the base's stamps, so the
gesture is the base's). village-elder extends it.

**`base:person-topdown-trooper@3`** (M7c review): version 2's clips byte for byte, and the same clips again for a
baton (`idle-baton-*`, `walk-baton-*`, `block-baton`, `hurt-baton`, `die-baton`), and `idle_*`, `walk_*` again as
`idle-gun-*`, `walk-gun-*` (a name a setting picks has no underscore): the code carries a baton raised
(`carry: 'up'`) and a gun at the hip (`'ready'`), and version 2 keyed all but the jab for the gun, so the baton hung tip
down. shield-trooper picks them for a baton (`node tools/bake-topdown-m7.mjs --trooper3`; `trooperV3`).

**Replaced before release.** Never released and named by nothing, removed with their pins: `held:topdown-polearm@1` to `@3`, `held:topdown-magic@1` and `@2`, `held:topdown-blades@1`,
`-blades-off@1`, `-guns@1`, `-stick@1`, `-flower@1`, `part:topdown-{body-shield,cape,collar,crown,lens-mask,scarf,
suit-pack,visor-helmet,visor}@1` and `base:person-topdown-{child,guard,mage,merchant,ranger,rogue,trooper}@1`. To look
at one again: `node tools/bake-topdown-m7.mjs --replaced <dir>` writes every version in the baker's `REPLACED` list into
a folder outside `pieces/`, byte for byte as removed (checked against the removed files in M7c); the three the baker
never made (`held:topdown-polearm@2`, `@3`, `held:topdown-magic@2`) are kept in `tests/fixtures/m7-replaced/`. Their
pin lines were taken out by hand (M7b, M7c), against `_pins.json`'s "never remove a line": that note is for released
versions, and these never were (docs/data-sprites.md 3.1: a version stays until nothing names it); from M7c on a
replaced M7 version that is pinned keeps its pin and its file. Old base versions kept that no sprite uses:
`base:person-topdown@1` and `base:person-topdown-walker@1` (B16b's, released; B16b's fixtures and tests use them),
and `base:person-topdown-trooper@2` (pinned, replaced by `@3`, which holds its clips; `KEPT` in
`tests/unit/m7-topdown-pieces.test.mjs`).

## The side-view person (B16a): `base:person-side`, `part:*`, `held:*`

Made by `tools/bake-person-side.mjs` from `rigs/humanoid.js` and the code Hero's parts (temporary, deleted with the
code rigs); never edit these files by hand: change the baker and run `node tools/bake-person-side.mjs --write`, then
`node tools/bake-person-side.mjs` (all `unchanged`) and `node --test tests/unit/pieces-person-side.test.mjs`. A changed
piece goes to the next version by itself (a pinned one is never rewritten); pin it when it is released. `--sheet`
writes `out/person-side-knight.png`: the Hero rebuilt from the pieces (`tests/fixtures/person-side/knight.json`, the
worked example) beside the frozen code Hero (`tests/fixtures/code-sprites/knight.js`), every clip, and the difference.
Latest versions: `base:person-side@6`, `part:hair@2`, `part:hair-long@1`, `part:ponytail@1`, `part:hair-nape@2`,
`part:helmet@3`, `part:plume@1`, `part:crown@4`, `part:cape@1`, `part:cape-ground@2`, `part:belt@1`, `held:sword@1`,
`held:axe@1`, `held:spear@1`. Older versions are kept only for their pins; nothing uses them.

**The base.** A person seen from the side, facing right, on 64x64 (pivot `[28, 58]`, the ground row 58), at the code
rig's defaults. Slots: `skin`, `top`, `bottom` (trousers), `boots`, `shine` (the eye's glint): `extends.paint` maps them
to the sprite's (the Hero: `{ "top": "outfit", "bottom": "trousers" }`). Clips, as the code rig names them: `idle`,
`walk`, `run`, `jump`, `attack` (a sword swing), `shoot`, `cast`, `block`, `hurt`, `die`, `victory`, `talk`; every frame
one key, flash as a frame edit on `hurt` and `die` 0. The base is within 2 % of the code rig's pixels at every frame,
but `die` 1 to 3 (6 to 7 %: the code turns the head's bitmap part way, data turns its shapes; accepted). Proportions are
not args: a sprite scales the base with its sliders' `scales` (the baker's `SCALES`: Height the body's and limbs' bones,
Build `pelvis`, `torso`, `thighF`, `thighB`, Head `skull`, to which a sprite adds the ids of its head parts).

**The ground cut is the base's.** The base's last shape is `groundCut` (a cut on node `ground`: every pixel from the
ground row down cleared, 1000 rows deep and 1000 px either side, so past the edges of any frame, as the code cuts its
turned head). A sprite may take a larger `size`: the body keeps its rows (the ground row stays 58) and the cut still
clears everything under it. `engine/resolve.js` puts a base's operations (cut,
outline, tint) after everything the sprite adds, so the cut reaches the sprite's parts too and the base and parts
still paint in z order. **A sprite writes no cut of its own**; `extends.drop: ["groundCut"]` removes it (then the
head's parts may pass under the ground as the body falls; the `lay` node's parts still show only where the body lies).

**Where to hang parts.** A part piece is drawn on the node its use names with `on` (a part piece's own shapes take
the use's node). F is the near side (in front of the body), B the far side.

| Node | What it is | Hang (the Hero's) |
|---|---|---|
| `headwear` | one pixel above the middle of the head, upright, turning with the head as the body falls | hair caps, helmets, crowns, a helmet's nape hair (`part:hair`, `part:helmet`, `part:crown`, `part:hair-nape`) |
| `skull` | the middle of the head, upright (x forward, y up), turning with it | faces, eyes (the base's eye and mouth stamps) |
| `brow`, `top`, `nape` | bones from the middle of the head: one pixel up, to half a pixel over the top, to the back (0.75 of its radius) | |
| `hang` | the back of the head, pointing down the head, swung by the clip's sway | long hair, a ponytail, a hood's tail (`part:hair-long`, `part:ponytail`) |
| `plume` | the top of the head, pointing back, swung | a plume, a feather, a tassel (`part:plume`) |
| `back` | the neck, pointing straight down the screen whatever the body does (as the code hangs a cape), swung; stretched while the body falls so a cape's hem stays where the code's is | a cape, a pack, a scarf (`part:cape`) |
| `lay` | upright, two rows above the ground under the front of the shoulders when the body lies flat (`die` 4 to 7), parked 1000 px under the ground, off any frame, in every other frame; in a `die` played at other frames it rises straight up from there to the strip between the two (v6: v5's chain swung up through the frame) | what shows along the ground under a lying body (`part:cape-ground`, used beside `part:cape` with the same `when`) |
| `chest` | the neck end of the spine, upright | armour, a collar |
| `waist` | one pixel under the hips, upright | a belt, a coat's skirt (`part:belt`) |
| `handF` | the near hand, pointing the way the held thing points | swords, axes, spears, staffs (`held:*`) |
| `handB` | the far hand, along the forearm | a shield, a lantern |
| `ground` | on the ground row whatever the pose, upright | the base's ground cut |
| `ankleF/B`, `plantF/B` | the ankles; the planted feet, upright | boots, greaves |

Body bones (`stand`, `spine`, `neck`, `face`, `seat`, `loin`, `trunk`, `hipF/B`, `thighF/B`, `shinF/B`, `armF/B`,
`foreF/B`, the drawn limbs `<limb>a`/`<limb>d`, the feet's `step`, `heel`, `toe`, and `floor`, `layD`, `layR`, `layF`) carry the
body; hang nothing on them but by id when replacing a base shape. Base z: far arm 10, far leg 20, near leg 30, pelvis
40, torso 50, head 60 (eye 62, mouth 63), near arm and fist 90. The Hero's parts: cape 2 (and `far`, behind
everything), belt 55, hair 64, helmet, plume and crown 65, nape hair 66, held things 80 (under the fist), the cape on the ground 95.

**Parts turn with what they hang on.** Rects and stamps are moved but never turned, so a part that must tilt with the
head (a crown's band, a visor) is a poly or dots. Every head part turns rigidly with the head as the body falls and
lies down, as the code turns the head's layer; what passes the ground is cut by the base's cut.

**Not yet (an S4 sprite must not rely on these).**
- The variant clips (`walk-unarmed`, `run-unarmed`, `talk-unarmed`, `punch`, `thrust`, `shoot-bow`: what the code
  draws with nothing held, a spear or a bow) are baked and tested but not in the published base. They would fit (the
  base with them is 127,833 of the 131,072 bytes a piece may hold), but with no clip list on `extends` every sprite on
  the base would inherit all six (the Hero would punch with its sword held), and they are only useful with a `from`
  that picks by a setting (both below). The code sprites that need them all pick by their Weapon control:
  `knight` (none: `punch` and the unarmed walk, run and talk), `bone-soldier` (none: `punch`; spear: `thrust`) and
  `spear-goblin` (none: `punch`; spear: `thrust`). The other four on `rigs/humanoid.js` use none of them:
  `wizard` and `thicket-imp` draw their own poses ("punch" there is a sound), and `rogue-battler` and `road-bandit`
  are already data on the humanoid library figure (a crouched or slouched stance; the rogue's stab, throw and toss
  moves are clips this base does not have). So until schema B1 and resolver B4 add
  the two items below and the variants are published (in this base or a second piece), those three can be redrawn
  only with a weapon always held (no Weapon none, no spear thrust); no code sprite uses `shoot-bow`.
- A sprite gets every clip of the base: there is no clip list on `extends` (`catalog/sprite-schema.js` takes only
  `use`, `v`, `drop` and `paint` there, and `engine/resolve.js clipNames` adds every base clip). The Hero has `shoot`,
  `cast` and `talk` it never had in code.
- A clip's `from` names one base clip by a string; it cannot pick by a setting (Weapon none: punch), in the schema
  or in `engine/resolve.js clipsOf`. The Hero with no weapon swings an empty hand.
- No Bounce or Stride slider (clips are baked at the middle), no slash trail, no tunic skirt.
