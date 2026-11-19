# Studio: design (route 3, sprites first)

Written 2026-11-19 for Keyang's request: "create studio page -- sprite: allowing create rig / animation / frame and sprites. we will add music & sound track editing in future." Status: **design only, nothing built.** The contract it adds is Contract 14 in `docs/architecture.md`. Every claim about existing code below was checked against the file named.

Keyang's decisions (binding): (1) rigs can be data, made in the browser; the code rigs stay and the studio can start from them. (2) A studio sprite goes to the bag (playground, zip, share links) and downloads as a file an agent drops into `sprites/`. (3) Animation is key poses in data, blended by the engine (R4 = yes). "Frame" = frame count, speed, looping, per-frame adjustments, anchor, attach points. (4) Non-technical creators, everyday words; not held to the quality bar, but safe: a definition is data, never code. (5) Sound and music editing later: leave room, build nothing.

## 1. The idea in five lines

- A **studio sprite is one JSON object** (`loadout-sprite`). It names a body and holds its colours, controls, parts, clips, sounds, anchor and metadata.
- A body is either a **bone rig** (`loadout-rig`, all data: bones, shapes on bones, joints, attach points) or a **library body** (a code rig with a data layer; first: the side-view person of `rigs/humanoid.js` through `rigs/humanoid-figure.js`).
- Every clip is **key poses**: a few numbers per key, blended by one framework function. Formulas in the code rigs are only where the first keys come from ("bake").
- The framework turns the JSON into an ordinary `defineSprite` result (`dataSprite(json)`), so the bag, playground, export and quality bar take it like any sprite. **No code from the definition ever runs**, so it needs no worker and can travel in a link.
- Download for the library = `sprites/<id>.js` that is a fixed two-line wrapper around the JSON. The build scans folders as today; the quality bar applies there (route 1), not in the studio.

## 2. Data formats

All three are JSON (no functions, no `undefined`, numbers finite). Angles are **whole or decimal degrees** in the rig convention of `engine/motion.js` (0 = down, 90 = forward/picture-right, 180 = up), because people type and read them; the engine converts to radians. Lengths are pixels of the frame. Ids are `^[a-z][a-z0-9-]{0,39}$`.

### 2.1 A rig as data (`loadout-rig`, version 1)

| Field | Type | Meaning |
|---|---|---|
| `format`, `version` | `"loadout-rig"`, `1` | |
| `id`, `name` | id, text ≤ 60 | "Newt" |
| `view` | `side` \| `front` \| `top-down` \| `none` | Side faces right, as every side-view sprite (style guide 1). Top-down rigs are in version 1 (section 9, Q4): see `directions` |
| `directions` | Top-down only, optional: `{ down?, up?, side? }` | A top-down rig (view "top-down") has an optional `directions` object with an overlay for any of down, up and side: `{ bones: { id: { angle, at (roots only), length, from (children only) } }, shapes: { id: { z, far, hidden, shade, light, plus the kind's geometry: width \| from, to, r, offset \| at, r \| points \| at, size } } }`. An overlay re-poses and re-proportions the same bones and shapes for that view; a direction without one draws the rig as written. Clips are named `<action>_<down\|up\|side>` (at most 40 characters), each with key poses in that direction's rig; a clip with no direction (hurt, die) faces down; side faces right. Numbers are clamped as the rig's own, and each direction as overlaid gets the rig's checks too. A rig that is not top-down has its `directions` dropped (a warning); direction clip names and meta view "top-down" need a top-down body (`catalog/studio-schema.js`) |
| `size` | `[w, h]` | Frame size: one of the style guide's frame sizes (section 1, "Frame sizes") |
| `colours` | list ≤ 8 of `{ id, label, default, material?, detail? }` | Colour slots. Shapes paint with a slot id, never a hex. `material` is an id of `engine/materials.js` (Contract 7). `detail: true` = eyes, teeth: no control, drawn flat |
| `bones` | list ≤ 48 of bone | A tree. Order = parents before children |
| `shapes` | list ≤ 160 of shape | What is drawn on the bones |
| `ik` | list ≤ 8 of `{ id, label, bones: [upper, lower], bend: 1 \| -1 }` | Two-bone chains whose end is placed by a target (a foot on the ground, a hand on a point) instead of by two angles |
| `points` | list ≤ 16 of `{ id, bone, at: [u, v], angle? }` or `{ id: "feet", ground: true }` | Attach points, exported per frame as Contract 3 `sockets`. Names from Contract 3 where they apply: `hand`, `offhand`, `head`, `back`, `feet`, `muzzle`, `tip` |

**Bone**: `{ id, parent (id or null), at: [x, y] (root only, frame px), from (0..1 along the parent, default 1), angle, length, min?, max?, label? }`. A root's `angle` is absolute; a child's is relative to its parent's direction (0 = straight on). `min`/`max` (degrees, relative) are the joint limits: blended poses are clamped to them and a drag in the studio stops at them. Depth ≤ 16, one or more roots allowed (a floating eye stalk).

**Shape** (in the bone's own frame: `u` along the bone from its start, `v` across it, positive `v` to the bone's left as you look along it, which is "up" for a bone pointing forward):

| Field | Meaning |
|---|---|
| `id`, `bone` | Its name; the bone it moves with |
| `kind` | `limb` (the whole bone, `width` whole px: `g.limb`), `capsule` (`from`, `to` 0..1 along, `r: [r0, r1]`, optional `offset` v), `ellipse` (`at: [u, v]`, `r: [along, across]`, turns with the bone through `shapes.js placedIn`), `poly` (≤ 24 points `[u, v]`), `dot` (`at`, `size` 1 or 2: a detail, **never turned**, only moved) |
| `paint` | A colour slot id |
| `z` | Drawing order, -100..100; ties broken by list order |
| `group` | Shapes with the same group and z are painted as **one** `g.blob` (one shade band, no seams), as the style guide asks of bodies |
| `far` | true: painted with `farRamp` (a step darker: the far legs, the far wing) |
| `shade`, `light` | Band depths as `Surface.fill` takes them (default 1 and 0; `light: 1` only for metal, glass, wet: style guide 2) |
| `glow` | true: drawn after the outline, not inked (light, sparks, an eye glow) |
| `hidden` | true: not drawn unless a key or frame edit shows it (a closed eye, an open mouth) |
| `part` | The part this shape belongs to (section 2.3), for parts that can be switched off |

**Why two-bone IK and nothing more.** Feet must stay planted while the body dips (`rigs/humanoid.js solve()` already does exactly this with `motion.js ik2`), and a creator thinks "put the foot here", not "turn the thigh 23 degrees". Two-bone IK is exact, has one answer once `bend` is fixed, costs nothing, and is deterministic (hard rule 7). Longer chains (tails, necks) stay plain angles: a solver for them (FABRIK and the like) is iterative, can flip between answers from frame to frame, which shows as pixel jumps, and is harder to explain. `bigbody.js chainJoints` shows chains read well as angles.

Worked example (trimmed: the back legs mirror the front ones with `far: true`):

```json
{ "format": "loadout-rig", "version": 1, "id": "newt", "name": "Newt", "view": "side", "size": [48, 48],
  "colours": [ { "id": "skin", "label": "Skin", "default": "#4f9d57", "material": "skin" },
               { "id": "belly", "label": "Belly", "default": "#e6c545", "material": "skin" },
               { "id": "eye", "label": "Eyes", "default": "#231b33", "detail": true } ],
  "bones": [ { "id": "body", "parent": null, "at": [22, 36], "angle": 90, "length": 12 },
             { "id": "head", "parent": "body", "angle": 0, "length": 7, "min": -30, "max": 30 },
             { "id": "tail1", "parent": "body", "from": 0, "angle": 180, "length": 6, "min": -45, "max": 45 },
             { "id": "tail2", "parent": "tail1", "angle": 0, "length": 5, "min": -60, "max": 60 },
             { "id": "thighF", "parent": "body", "from": 0.8, "angle": -90, "length": 4 },
             { "id": "shinF", "parent": "thighF", "angle": 20, "length": 3 } ],
  "shapes": [ { "id": "torso", "bone": "body", "kind": "capsule", "from": 0, "to": 1, "r": [4, 3.5], "paint": "skin", "z": 10, "group": "body" },
              { "id": "skull", "bone": "head", "kind": "ellipse", "at": [3.5, 0.5], "r": [4, 3], "paint": "skin", "z": 10, "group": "body" },
              { "id": "tail", "bone": "tail1", "kind": "capsule", "from": 0, "to": 1, "r": [3, 1.8], "paint": "skin", "z": 10, "group": "body" },
              { "id": "tailTip", "bone": "tail2", "kind": "capsule", "from": 0, "to": 1, "r": [1.8, 1], "paint": "skin", "z": 10, "group": "body" },
              { "id": "belly", "bone": "body", "kind": "capsule", "from": 0.1, "to": 0.9, "offset": -2, "r": [2, 2], "paint": "belly", "z": 11 },
              { "id": "legF1", "bone": "thighF", "kind": "limb", "width": 2, "paint": "skin", "z": 12 },
              { "id": "legF2", "bone": "shinF", "kind": "limb", "width": 2, "paint": "skin", "z": 12 },
              { "id": "eye", "bone": "head", "kind": "dot", "at": [5, 1.5], "size": 1, "paint": "eye", "z": 20 } ],
  "ik": [ { "id": "footF", "label": "Front foot", "bones": ["thighF", "shinF"], "bend": -1 } ],
  "points": [ { "id": "head", "bone": "head", "at": [7, 0] }, { "id": "feet", "ground": true } ] }
```

### 2.2 An animation as key poses (one clip)

| Field | Meaning |
|---|---|
| `label` | The everyday name shown ("Bite" for `attack`, style guide 4) |
| `frames` | 1..64 (`LIMITS.framesPerClip` in `app/api-source.js`) |
| `fps` | 1..30. Frames per second at speed 0.5 is fps x 1.05; the standard `speed` control scales it by `lerp(0.65, 1.45, speed)`, as every catalogue clip does. Without a speed control the clip plays at fps (`engine/data-sprite.js`; bone rigs and library bodies alike) |
| `loop` | true / false. Phase is `frame / frames` for a loop and `frame / (frames - 1)` for a one-shot, exactly as `engine/sprite.js` (`phase`) does |
| `keys` | List ≤ 64 of key poses, sorted by `t` |
| `frameEdits` | `{ "<frame>": { nudge: [dx, dy], show: [shape ids], hide: [...], flash: true } }`: adjustments to one frame after blending. `nudge` is whole pixels; `flash` tints white before the outline (style guide: `hurt` and `die` frame 0) |
| `sounds` | `[{ sound, frame, preset?, volume? }]`: the cue list `defineSprite` already takes, with ids from `sounds/` |
| `from` | Library bodies only: the rig pose the keys were baked from (`"walk"`), so "Start this clip over" can bake again |

**A key** is `{ t, ease?, ... }` where `t` is the phase 0..1 (kept as a phase, so changing the frame count keeps the motion; the studio shows keys on frames and snaps a dragged key to one). Every other field is optional: **a key holds only what it changes**, and each number is its own track, blended between the keys that set it, so a tail can sway on four keys while the legs use eight.

| Body | What a key can hold |
|---|---|
| Bone rig | `root: [dx, dy]` (whole body offset, px), `bones: { id: angle }` (relative degrees, may pass ±180 for a spin, at most ±720), `ik: { id: [x, y] }` (target, px from the ground point under the root, as `humanoid.pose` holds feet), `stretch: { id: 0.5..1.5 }` (bone length), `show` / `hide` (shape ids, stepped, not blended) |
| Library body (humanoid) | The fields of the pose object `rigs/humanoid.js pose()` returns and `humanoid-figure.js` adds: numbers `rootX`, `lift`, `crouch`, `lean`, `headTilt`, `item`, `item2`, `sway`, `glow`, `lie`, `headTurn`, `pull`, `fling`, `air`, `out`, `level2`; pairs `footF`/`footB` `{x, y}`, `armF`/`armB` `{a, e}`; flags `blink`, `flash`, `mouth`, `fire`. Angles in degrees. The list is checked against a new `poseFields` entry in `rigs/humanoid-describe.js`. Built (S6): the figure's own moves add `far` (0..1), `glint` (whole, 0..2), `prize` (flag) and `knife` (`"hand"`, `"air"` or null); `air` may be null; a foot may carry `up` (its knee bends up, lying). Checked as `HUMANOID_MOVE_FIELDS` in `catalog/studio-schema.js`, ranges in `rigs/humanoid-studio.js POSE_FIELDS`. The white flash of `hurt` and `die` is baked as `frameEdits {0: {flash: true}}`, never as a key, so deleting keys cannot spread it |

`ease` is how the motion leaves this key toward the next: `smooth` (default, `motion.smooth`), `linear`, `in` (`easeIn`), `out` (`easeOut`), `hold` (a step: stays until the next key). Loops close by blending the last key back to the first (`motion.loopKeys` does this today for one ease; the per-key ease needs one new function). Flags and `show`/`hide` are stepped, never blended.

Example, the newt's walk (contacts on frames 0 and 4, as style guide 4 asks):

```json
"walk": { "label": "Walk", "frames": 8, "fps": 10, "loop": true,
  "keys": [ { "t": 0,    "root": [0, 0],  "ik": { "footF": [4, 0], "footB": [-4, 0] }, "bones": { "tail1": 170 } },
            { "t": 0.25, "root": [0, -1], "ik": { "footF": [0, 0], "footB": [0, -2] }, "bones": { "tail1": 190 } },
            { "t": 0.5,  "root": [0, 0],  "ik": { "footF": [-4, 0], "footB": [4, 0] }, "bones": { "tail1": 170 } },
            { "t": 0.75, "root": [0, -1], "ik": { "footF": [0, -2], "footB": [0, 0] }, "bones": { "tail1": 190 } } ],
  "sounds": [ { "sound": "footstep-grass", "frame": 0, "volume": 0.4 }, { "sound": "footstep-grass", "frame": 4, "volume": 0.4 } ] }
```

### 2.3 A sprite definition that is data (`loadout-sprite`, version 1)

| Field | Meaning | Becomes, in `defineSprite` / catalogue / bag / export |
|---|---|---|
| `format`, `version` | `"loadout-sprite"`, `1` | Checked by the validator; a later version is converted on load |
| `id`, `name`, `blurb` | As every sprite | Same fields. The id may not be a catalogue id |
| `meta` | Contract 1, checked by `catalog/schema.js validateMeta` | Same. The studio fills `role` and `view` from two plain questions ("What is it?", "Seen from") |
| `body` | `{ rig: {...loadout-rig} }` or `{ library: "humanoid", figure: {...}, paint?: {...} }` (the figure is the definition `humanoid-figure.js` documents in its header: `body`, `stance`, `look`, `hair`, `held`, `headgear`, ...; `paint`: below) | `render` and `sockets` call the framework's renderer for that body |
| `size`, `pivot`, `grounded` | Frame (bone rig: from the rig; library body: fixed, `[64, 64]`), anchor, whether the anchor stands on the ground | Same fields; sheet JSON `grounded` (Contract 8) |
| `colours` | `{ slot: "#rrggbb" }` defaults | One `color()` control per non-detail slot, label from the slot, `material` from the slot |
| `controls` | ≤ 48 of `{ key, label, lo, hi, min, max, default, step?, group?, when?, scales: { bones: [...] } \| { shapes: [...] } }` (a slider), `{ key: "speed", standard: "speed" }`, and for a library body (F1) a slider with `sets` instead of `scales`, `{ key, kind: "choice", label, options: [value \| { value, label }], default, sets, map?, was?, group?, when? }` (`map`: an option that stands for another value of the field, `{ "helmet": "plumed helmet" }`) and, for either body, `{ key: <a colour slot>, kind: "colour", label?, swatches?, material?, group?, when? }` | `range()`, `choice()` and `color()` controls, in the order listed (colour slots with no colour control first). A control may only scale named bones or shapes, or, for a library body, set one field of the figure named from a fixed list (`catalog/studio-schema.js FIGURE_SETTINGS`: `height`, `build`, `head` and `"part.field"` such as `held.length`, `held.kind`, `headgear.size`, `motion.bounce`, `stance`), a slider within that field's own range, a choice among values the field takes: a fixed vocabulary, no free paths. `when` is Contract 3's (`{ key: [values] }` or a list of them), checked against the sprite's controls, no loops |
| `parts` | `{ name: { label, shapes: [...], default: true } }` (bone rig) or the figure's own parts (`held`, `headgear`, `scarf`, ...: on/off), or, for a library body (F1), a Contract 3 part under any name: `{ label, params: [the choice that picks it, its own controls...], none?, socket? }` (socket: `hand`, `offhand`, `head`, `back`, `feet`, and `muzzle` when the figure has `thrown`) | Contract 3 `parts` with a `toggle()` or `choice()` selector |
| `versions` | ≤ 24 of `{ name, params }` (F1): ready-made settings, each a control's key and a value it takes (an old value a choice's `was` maps is kept) | `versions` of Contract 1, checked by `engine/versions.js cleanVersions` like any sprite's |
| `body.paint` | Library body only (F1): `{ "part.field": colour }` for colour fields of the figure (`FIGURE_COLOURS`), each colour a `"#rrggbb"`, a colour slot's key, or `{ "rule": <name>, ...arguments }` naming a rule of the fixed registry `engine/data-rules.js COLOUR_RULES`: `tone { of, by }`, `mix { of, with, amount }`, `standOut { against, from }` (engine/color.js `pick`), `apart { of, from: [c \| [c, least]], least? }`, `bandTone { of, under, least? }`, `ramp { of, tone }`, `choose { when, then, else }`; nested at most 6 deep, at most 256 rules and colours in all of `paint` | `rigs/humanoid-studio.js figureFor` paints those fields (a frozen definition's paint is worked out once per settings, `engine/data-rules.js paintFigure`) from the settings through the named framework functions; with `paint` given, no other colour of the figure follows a slot (the default-matching rule below is off) |
| `clips` | `{ name: clip }` (section 2.2). Standard names (`idle`, `walk`, `attack`, ...) unless the action has none | `clips` (with `fps` as a function of `speed`), `sounds` from each clip's list |
| `preview` | A clip name | Same; the card strip |
| `made` | `{ in: "studio", from: "template:four-legs" \| "library:knight" \| "new", by? }` | Kept in the file and on `sprite.definition.made`; manifest says `madeIn: "studio"`. The sprite itself has no `made`: `sprite.made` means "made on this visit, drawn in a worker" (`app/made.js`), which `app/api-core.js` render and `engine/theme.js` read (review F1, issue 1) |

**A library body's colours, sliders and parts (built in S6: `rigs/humanoid-studio.js figureFor(def, p)`).** The figure drawn at settings `p` is `body.figure` as stored with: (1) each slider's value in the body field it `sets`; (2) every colour of the figure that is a slot's default, or one of its tones (`tone(c, -0.6)`, a ramp's light `tone(c, 0.85)` and dark `tone(c, -1)`), recoloured by that slot the same way (the first slot in the list wins when two share a default); so the Hero's `outfit` moves his tunic and, through tone -0.6, his trousers, `trim` his cape, belt and plume, `metal` his blade, helmet and (light tone) buckle; (3) each part switched off set to kind `"none"` (`held`, `headgear`, `scarf`, `pack`, `cape`) or left out (`belt`, `coat`, `mask`); (4) a clip with no keys but a `from` drawn by that pose's formula; plus `keys` (the clips' keys in radians, frame flashes folded in) and `keysFor` (the stored figure, section 3). When the studio changes a slot's default it stores `figureFor(def, { [slot]: colour })` (without keys and keysFor) as the new figure, so the figure's colours stay the slot defaults. Known gap: with nothing metal worn or held and the metal recoloured, `knight.js` gives the buckle plain steel's light tone and the slot rule the metal's (1 pixel).

**The library's rig sprites as data (built in F1, 2026-11-19; Q3: convert all of them).** A figure sprite in code (`sprites/rogue-battler.js`) is a function from settings to a figure; as data it is the figure at the defaults plus what moves with the settings: each choice and slider `sets` one field, and `body.paint` says how each colour that follows the settings is worked out. Example (the Rogue's trim, which F.apart keeps clear of his tunic when both are one colour): `"paint": { "look.top": "outfit", "look.bottom": { "rule": "tone", "of": "outfit", "by": -0.6 }, "belt.colour": { "rule": "apart", "of": "trim", "from": ["outfit"], "least": 0.05 } }`. The rules are named, never written (Contract 14 rule 2, amended): a rule is a framework function in a fixed registry, and a definition holds only its name and data arguments. `sprites/rogue-battler.js` and `sprites/road-bandit.js` are library files of this form, drawing pixel for pixel as the code files did at every setting the conversion guard (`tests/unit/conversion-c1.test.mjs`, `conversion-f1.test.mjs`) draws. Clips with no keys are drawn by the rig's formula, as before; a clip's `frameEdits` flash on such a clip only says what the formula already does.

Rules the F1 review settled: a control's `"part.field"` puts its value in the figure even when the settings do not give one (missing settings are the control's default), so the stored figure's value of that field is not what is drawn: whoever edits the stored figure (`refigure`, a figure editor in S10) changes the control's `default` instead, as `app/studio/library-body.js setProportion` does. A control never brings in a part the stored figure has not (`held`, `headgear`, `cape`, ...; `body.paint` never does either), and the validator warns that it "changes nothing"; the blocks read with defaults when absent (`FIGURE_BLOCKS`: `body`, `motion`, `look`, `hair`) are the exception. A converted sprite is drawn with a look (Contract 7) as its code file was: `conversion-f1.test.mjs` compares `renderThemedFrame` under three looks.

`engine/data-sprite.js` (new) exports `dataSprite(json)`: validate, then `defineSprite({...})` with a `render(g, { clip, t, frame, p })` that is framework code. So `renderSheet`, `describeSheet`, the theme (Contract 7), styles (Contract 12, pixel only) and the quality bar work unchanged. The catalogue row is derived from that result as for any sprite (Contract 4).

### 2.4 From the studio to `sprites/`: a `.js` file that is data

**Choice: `sprites/<id>.js`, generated, of exactly this form**, not a `.json` file:

```js
// Made in the Loadout studio. This file is data: open it in the studio (#/studio, "Open a file") to change it.
import { dataSprite } from '../engine/data-sprite.js';
export default dataSprite({ ...the definition, as JSON... });
```

Why: the site and the tools load a sprite as the module `sprites/<id>.js` (checked: `app/catalog.js loadSprite` imports `../sprites/${id}.js`; `tools/lib/assets.mjs` imports every `.js` in `sprites/`; `app/api-core.js`, `tools/render.mjs`, `scene.mjs`, `tilemap.mjs`, `bundles-from-plans.mjs` and `lib/quality-run.mjs` build that path). A `.json` sprite means changing all of them, the catalogue's `src`, the quality cache key and the "new file is found" test. The wrapper changes none. It stays data: `tools/lib/data-file.mjs` (new) reads the middle back as JSON and the build refuses a file that claims the header but is not exactly this form (so nobody hand-edits code into it). It also answers R2 for every future data sprite: "a JSON object inside one fixed call".

## 3. The code rigs and the studio

What `rigs/humanoid.js` really is (read 2026-11-19): `pose(clip, t, m, d)` returns about 23 fields; `solve(P, d)` turns them into joints (hip from crouch and lift, neck along the lean, shoulder 16% down the torso, **arms forward kinematics** from `a` and `e`, **legs two-bone IK** with `ik2` toward the foot targets); `draw()` paints about nine shapes (`limb` per leg and arm segment, an ellipse hip, a capsule torso, an ellipse head, eye dots, hair by a shape test) and calls six hooks (`behind`, `offhand`, `torso`, `head`, `item`, `front`) where every part is drawn. A turned head is drawn on a 96 px layer and stamped back pixel by pixel (`stampTurned`). Around it: `fit()`, trails, about 40 part and held-thing functions in `humanoid.js` and `humanoid-figure.js` (2,389 lines together). Many clips are already key lists (`motion.keys` in `jump`, `attack`, `die`).

| Path | What | Cost | Verdict |
|---|---|---|---|
| A. Re-express the humanoid in the bone format | The skeleton fits (hip, spine, head, two FK arms, two IK legs). The parts do not: each is code drawn against `J`, `P`, `d`. Either port them (≈2,400 lines, every side-view sprite re-reviewed) or bridge them, and a bridge needs a bone rig that produces humanoid `J`/`P`, which is the code rig again | L+, risk to every reviewed sprite on the rig | No |
| B. **Wrap: a data layer over the code rig** | Body proportions, stance, parts, colours from `humanoid-figure.js`'s definition (already data, used by `sprites/rogue-battler.js` and `road-bandit.js`); clips as key poses of the pose fields; attach-point offsets `{ hand: { dx, dy, angle } }` | S–M: one seam (below), a key blender, a Hero preset | **Yes** |

**The seam (B).** In `humanoid-figure.js poseAt(F, t)`, one additive branch: when `def.keys?.[clip]` exists, the pose is blended from those keys instead of `pose()`/`move()`, then goes through `H.fit` as today. Keys hold the final pose (stance and held-angle offsets already in it): what a person drags is what is drawn. A definition without `keys` renders byte for byte as now (test). ~~Consequences said in the studio: the "Liveliness" and "Stride" sliders and a change of stance only move clips that have not been changed by hand.~~ **Changed in S6 (keysFor).** Keys are the final pose for the figure *as stored* (`body.figure`); the drawn figure is that figure with the controls, colours and parts applied (`figureFor`, section 2.3). Where the two differ (a visitor's Height slider, a part switched off), each key of a clip with `from` moves by what the formula of `from` moves between the two figures at its `t`: a value nobody changed is exactly the formula at the new settings, a value changed by hand keeps its distance from it. Without this the Hero preset was 12–94% off at the slider ends and 127% with no weapon; with it, at most 0.33%. In the studio, a change to the stored figure (stance, Liveliness, Stride, a body field's default) calls `refigure(def, figure)`, which moves every keyed clip the same way and stores the result: so these change hand-made clips too, keeping the hand changes as offsets. A clip without `from` is drawn as keyed. The studio says: "Changes to the body move every animation; what you posed by hand moves with it."

**Baking.** "Start from the Hero's walk" samples the rig's pose at every frame's phase into keys (8 keys for 8 frames), so the first render is the same picture at every frame. The person then deletes or moves keys. **Built (S6), two differences.** (1) A pose whose light looks back between frames (the swing's trail, the punch, the stab, the dart: 0.15–0.16 of the clip) also gets a key at each phase it looks back to, so the Hero's attack has 14 keys for 8 frames; without them the trail differs by 64 px. `bake(..., { between: false })` keys the frames only. S10 shows these "light keys" as a thin tick between two frame thumbnails, not in the frame's key list; they are listed once under the clip ("Swing light: 6 keys between frames", [Remove]); a frame-count change merges them into the next frame (`snapKeys`, the frame's own key wins). (2) `frames` is capped to 1..64 and must be a finite number (`bake` throws otherwise). The white flash goes to `frameEdits`, not keys (section 2.2).

**The Hero.** `sprites/knight.js` draws on `humanoid.js` directly and keeps its own cape, headgear and nape hair (`drawCape`, `drawHeadgear`, `drawNapeHair`; Contract 13 says these belong in the rig). Work item S6 moves them into the rig as new exports and adds a `hero` preset definition; `knight.js` itself is not changed (R3 stays open). The preset must match the Hero closely enough to be "the Hero" (test: at most 2% of drawn pixels differ, every clip, default settings). Built: the figure gains `cape { kind: plain | tattered | none, length 0.3..1.8, colour }` (a library part), headgear kinds `"plumed helmet"` and `"gold crown"` (the rig's `helmet` and `crown` are other drawings), `belt.style: "hero"` and `held.swing` (0.5..1.3); the validator knows them. The preset is pixel-identical at the defaults and within 0.33% at every slider end, part off and other colours. Known limit: the cape hangs from the neck's x (as in `knight.js`), so a lean posed past the formula's range hides it behind the torso (+15°: 37 to 22 cloth pixels; +30°: gone); a todo test records it, fix when `knight.js` is converted.

**Library bodies in `dataSprite` (hand-off to S4).** S4 draws every library body through `rigs/humanoid-studio.js`: `drawSprite(g, def, { clip, frame, t, p })` in `render` and `spriteSockets(def, { clip, frame, t, p })` in `sockets`, never through `rigs/humanoid-figure.js` directly. Only these apply the Hero's parts and keep his headgear in the frame on keyed clips, `figureFor` (sliders, colours, parts, keysFor) and the frame edits (flash through the keys, nudge on the pixels and sockets). Parameters: one `color()` per colour slot keyed by the slot id, one `range()` per slider keyed by its `key`, one `toggle()` per part keyed by the part name. Not drawn yet with the Hero's parts: a scarf, a second held thing, and the props of the figure's moves (a figure that needs them and wears none of the Hero's parts is drawn by the figure module, which has them).

**The other code rigs** (`topdown`, `quadruped`, `crawler`, `bigbody`, `creature-topdown`, the bosses) have no definition renderer; a data layer for each costs what `humanoid-figure.js` cost. Version 1 offers **bone-rig templates shaped like them** instead: Two legs, Four legs (after `quadruped`), Crawler (after `crawler`: low body, three pairs of legs), Flyer (body and two wings), Blob (one body, no legs), Blank. `crawler.js place()` already proves the method a bone rig uses: shapes written in a body's own frame, moved and turned each frame.

## 4. Pixels: how a bone rig stays pixel art

Bones turn freely; pixels must not smear. The library already solves this for its rigs: **nothing is a turned bitmap; every frame redraws shapes from joint positions, sampled at pixel centres with hard edges** (`engine/surface.js` header). A bone rig uses exactly those calls.

| Rule | How |
|---|---|
| Shapes, not pictures | Each shape becomes a shape test (`capsuleIn`, `ellipseIn` turned by `placedIn`, `polyIn`) or `g.limb`, in world coordinates computed from the bone. `Surface.fill` samples centres: no blur at any angle |
| Steady thickness | `limb` widths are whole pixels and `g.limb` snaps ends by width parity (no shimmer); bone joints are rounded to half pixels, as `humanoid.draw` rounds hip, neck and head |
| One body, one band | Same `group` + `z` → one `g.blob`; light stays top-right at every angle because the band test is in screen space (`g.shadow = [-1, 1]`) |
| Details never turn | `dot` shapes (eyes, teeth) are moved to the rounded point, never rotated: a one-pixel eye stays one pixel |
| Outline once | `g.outline(INK)` after all non-`glow` shapes; `glow` shapes after it (style guide 2) |
| Three tones | `ramp(slot colour)` for near shapes, `farRamp` for `far`; `shade` 1 (2 over 14 px) |
| Minimum sizes | The validator warns under 2 px thick (a 1 px rotated capsule breaks into stairs) and errors under 1 |
| No stray pixels | Advice in the studio: pixels that appear for one frame only ("speckle"), measured on the strip |
| Frame and fill | Size from the style guide table; the studio shows the 1 px border and the "half to three quarters" fill band, and warns, never blocks (route 3) |
| Colour count | ≤ 8 slots, each three tones plus outline: at most 25 colours, under the checker's warning of 32 for characters |

What a person sees: the picture at whole zoom with `image-rendering: pixelated`, bones as thin lines over it, and a "Pixels" switch that hides the bones to judge the art.

## 5. The page

Route `#/studio` (list of drafts, "Make a new one") and `#/studio/<draft>?mode=rig|animate|frames|sprite&clip=walk&frame=3`. It follows design 5's remix page (`mocks/5-catalogue/remix.html`, `style.css` `.rx`): two fixed columns (stage 5fr, panel 7fr), no page scroll at 1440×900 and 1024×768, one radius, black for the one primary action, the orange dot only for "changed" and "saved". Mode tabs are the panel's `.tabs`; Sound and Music arrive later as two more tabs on the same bar, using the same stage, timeline and footer (nothing is built for them).

```
RIG (1440)
+- Loadout  Library  Kits  Studio ---------------------------------------------------- [Bag 3] -+
| Moss newt  (rename)                       |  Body   Move   Frames   Look & name                |
| +--------------------------------------+  |  Starting body: Four legs (change)                 |
| |   live picture, 6x, pixel grid       |  |  Bones                     [+ Add a bone]          |
| |   bones drawn over it; click one     |  |   body  > head  > tail > tail tip  ...  (tree)     |
| |   o = joint, drag to bend/move       |  |  Selected: tail                                    |
| |   anchor + attach points shown       |  |   Length [----o---]  Bends from [-45] to [45]       |
| +--------------------------------------+  |   Shapes on it: Tail (round, Skin)  [+ Add a shape] |
| [Pixels | Bones]  [zoom - +]  Undo Redo   |   Front/back [--o--]  Colour [Skin v]  Darker side  |
| Rest pose . idle . walk . bite ...        |  Attach points: head, feet        [+ Add a point]   |
+-------------------------------------------+---------------------------------------------------+
| . Saved on this computer        Put in my bag (primary)      Download v                       |

ANIMATE ("Move")
| (stage as above; handles: drag a foot, a hand,   |  Clip: Walk v   [+ New animation]             |
|  the hip, the head, a held thing)               |  Key at frame 2   Ease: Smooth v  [Delete key] |
| Onion skin [x]  Play/pause  Speed 1x            |  What this key changes: Front foot, Tail       |
| +- timeline: frames 0..7 as thumbnails --------+ |   (list of handles = keyboard access)         |
| | [0]*  1  [2]*  3  [4]*  5  [6]*  7   + key   | |  [Copy key] [Paste key] [Mirror legs]         |
| +--------------------------------------------+ |  Start this clip over from: the library's Walk |

FRAMES
| (stage: one frame large, anchor cross, points) |  Walk: Frames [8]  Speed [10 a second]  Loop [x]  |
| timeline as above, click a frame               |  This frame (3): Move whole picture [arrows]     |
|                                                |    Show/hide: Mouth open [ ] Eye closed [ ]       |
|                                                |    White flash [ ]   Sounds on this frame: (+)    |
|                                                |  Anchor point: x [24] y [42]  [Snap to the feet]  |
|                                                |  Frame size: 48 x 48 v (sizes the library uses)   |

LOOK & NAME ("Sprite")
| (stage, any clip, Plain | In a scene, as the   |  Name, one sentence, What is it? (Player, Enemy, |
|  remix page)                                   |  Creature, Animal ...), Seen from (side, front),  |
|                                                |  Colours (slots), Sliders people get (+ Add),     |
|                                                |  Parts that can be switched off, Words to find it |
|                                                |  [Try it as a visitor]: the remix panel preview   |

PHONE (375)
| stage pinned, 208 px, Play, frame dots        |
| mode tabs scroll sideways                      |
| panel scrolls under it; handles become a list |
| with arrow buttons (1 px per tap)             |
| footer: Saved . Put in bag . menu             |
```

| Journey | Steps |
|---|---|
| (a) New creature from scratch | Studio → "Make a new one" → pick "Four legs" (or Blank) → **Body**: click the tail bone, drag its tip longer; "+ Add a bone" on the head, drag out a crest; "+ Add a shape" (Round / Long / Pointed / Dot), pick its colour slot → **Look & name**: name it, "What is it? Enemy", colours → **Move**: Walk exists from the template; change it by dragging feet on frames 0 and 4; "+ New animation" → choose "Bite" (`attack`, label Bite) → drag head forward on frame 4, add a key → done; every step saved |
| (b) Hero + a new animation | Studio → "Start from the library" → Hero → the 9 clips arrive baked → **Move** → "+ New animation" → "Wave" (a new name, one lowercase verb) starts as a copy of Idle → frame 2: drag the near hand up (the arm follows by IK), frame 4: down, frame 6: up → set Loop → **Frames**: 8 frames, speed 8 |
| (c) Pivot and frame count | **Frames** → Walk: Frames 8 → 6 (keys keep their place in the motion and snap to frames; a key that lands on another is merged, with a note) → Anchor: drag the cross or "Snap to the feet" |
| (d) Bag, play, download | Footer "Put in my bag" → it becomes "In your bag · updates as you work" (later edits reach the bag item) → "Try it" opens `#/play` with it → footer Download: "Zip for my game" (the bag's zip, just this sprite) or "File for the library" (`<id>.js`, section 2.4) |

**Undo and redo**: every finished change (drag end, field commit) pushes a snapshot of the definition (≤ 64 KB) on a stack of 200, in memory only; a reload starts a fresh stack. Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl+Y.

**Autosave**: `localStorage` key `loadout-studio-v1`: `{ drafts: { <draft>: { definition, savedAt, bagKey? } } }`, saved 500 ms after a change, at most 40 drafts and 2 MB. The footer says "Saved on this computer"; a failed save says so and offers "Download the file" (Contract 11: never swallowed). Private window or blocked storage: `pickStorage` already falls back to memory; the footer then says "Not kept after this tab closes". Everything read back is validated before it is drawn (Contract 11).

**Keyboard**: 1–4 modes; Space play/pause; ← → frame; [ ] previous/next key; K add a key here; Delete removes the selected key, shape or bone (with undo); Tab moves through handles (the same order as the handle list); arrows move the selected handle 1 px (Shift: 4); R / Shift+R turn the selected bone 5° ; Esc deselects. Every handle is also a row in the panel list, so nothing needs a mouse.

**Phone, honestly**: picking a body, colours, names, sliders, frame counts, speed, anchor, sounds, and nudging a pose with arrow buttons all work at 375 px. Building a rig (adding bones and shapes by dragging) and posing by drag are possible but cramped; the Body tab says "Easier on a bigger screen" and offers the list-and-arrows way. Nothing is hidden from phone users.

## 6. Safety, limits, validation

A studio definition is data drawn by framework code, so the worker of Contract 11 is not needed. What is needed is that **no data can make the framework hang, run out of memory, draw outside its frame, or put text where markup goes**.

| Check (`catalog/studio-schema.js`, pure, Node and browser) | Limit |
|---|---|
| JSON text | ≤ 64 KB; parsed with a reviver that drops `__proto__`, `constructor`, `prototype`; unknown fields dropped |
| Ids, names, words | id pattern above; names ≤ 60, blurb ≤ 300 (`LIMITS.textChars` is 2000), words ≤ 30; shown with `textContent` only |
| Numbers | finite, clamped to each field's range (angles ±720, px within frame ±frame size, radii ≤ 32) |
| Counts | bones 48, depth 16, shapes 160, poly points 24, IK 8, points 16, colours 8, controls 48, clips 32, frames per clip 64, frames in all 256, keys per clip 64 (clips, frames and controls as in `LIMITS`) |
| Frame size | one of the style guide's sizes, at most 128×96 |
| References | every bone, slot, shape, part, IK and sound id resolves; no cycles; standard clip names checked against style guide 4 (a warning) |
| Cost | worst case 160 shapes × 12,288 px = 2 M centre tests a frame (a few ms); no worker or time limit needed. Tested with a maximal definition |

The validator returns `{ ok, errors, warnings, value }` (the cleaned copy). Errors block drawing and the bag; warnings are advice. The quality bar is offered as advice only ("What the library would ask before taking it"), in everyday words.

| Place | Change |
|---|---|
| `app/bag.js` | `cleanDefinition` accepts `{ data }` (validated); link entry `{ d: ... }`; data definitions are deflated (`CompressionStream('deflate-raw')`, async `toLinkAsync`) because a typical creature is 7–10 KB of JSON, over `LINK_LIMIT` (8,000) as plain base64. `bag.add` does not ask the bar for `data` items (Contract 14 amends Contract 11's rule for them) |
| `app/catalog.js` | `addRuntimeAsset(row, { data })` registers it; `loadSprite(id)` returns `dataSprite(data)` |
| `app/bundle.js` | A `data` item is drawn on the page and not refused by the bar; `<id>.js` (the data form) goes next to its sheet as a made source does today; `manifest.json` entry `madeIn: "studio"` |
| Playground | No code change expected: it takes sprites by role and view from the registered row. A test proves it |
| Link opening | Asks first in plain words, as today; nothing runs |

## 7. `window.loadout` additions

All under `loadout.studio`, plain data in and out, never throwing (`{ ok: false, errors }`). Each is also an action in `app/api-actions.js` so `generated/api.json` lists it. The framework modules (`dataSprite`, the bone renderer, the key blender, the validator) appear on `loadout.framework` by the folder scan with no extra work.

| Member | Action | Does |
|---|---|---|
| `studio.starts()` | `studio_starts` | The bodies one can start from: templates, library bodies, library sprites with a preset (Hero) |
| `studio.create({ from, name })` | `studio_create` | A new draft; returns `{ ok, draft, definition }` |
| `studio.list()`, `.get(draft)`, `.remove(draft)` | `studio_list`, `studio_get`, `studio_remove` | Drafts in storage |
| `studio.set(draft, definition)` | `studio_set` | Replace a draft's definition after validation; returns `{ ok, errors, warnings }` |
| `studio.validate(definition)` | `studio_validate` | The validator alone |
| `studio.bake(draft, clip, from)` | `studio_bake` | Keys from a library body's pose (section 3) |
| `studio.render(draftOrDefinition, { clip, frame, params, scale, bones })` | `studio_render` | PNG data address of a frame or strip; `bones: true` draws the skeleton over it |
| `studio.advice(draft)` | `studio_advice` | The quality bar's findings, as advice |
| `studio.toBag(draft)` | `studio_to_bag` | Put in the bag (linked: later sets update it) |
| `studio.file(draft)` | `studio_file` | `{ name: "<id>.js", text }`: the library file |
| `studio.open(draft, mode)` | (`go`) | Opens the page |

An agent can therefore build the whole newt with `create` + `set` + `render` + `toBag` + `file`, the same as a person.

## 8. Build plan

Every item: tests first (`tests/unit/<area>-*.test.mjs`, `tests/e2e/<area>.spec.mjs`), owned files only, additive (Contract 11). **★ = the first slice Keyang can try**: a bone-rig creature from a template, posed by key, put in the bag, played, downloaded, and the downloaded file built into the catalogue.

| Id | Work item | Owns | Tests first | Needs | Parallel with |
|---|---|---|---|---|---|
| S1 ★ | Validator and formats | `catalog/studio-schema.js`, `tests/fixtures/studio/*.json` | `studio-schema-*.test.mjs`: every field, every cap, hostile JSON (prototype keys, huge numbers, cycles, 10 MB text), the newt passes | — | S2, S3 |
| S2 ★ | Key blender | `rigs/keypose.js` | `keypose-*.test.mjs`: per-track blending, five eases, loop closure, stepped flags, `t` at frame phases equals `engine/sprite.js` phase | — | S1, S3 |
| S3 ★ | Bone renderer | `rigs/bones.js` | `bones-*.test.mjs`: FK, IK (equals `motion.ik2`), limits, every shape kind, groups as one blob, details unturned, outline and glow order, deterministic, a 360° turn stays clean (no pixel outside the shape's own ring), maximal definition under 50 ms a frame | — | S1, S2 |
| S4 ★ | `dataSprite` | `engine/data-sprite.js` | `data-sprite-*.test.mjs`: newt → `defineSprite` result; `renderSheet` and `describeSheet` work; controls, parts, sounds, sockets map as in 2.3; `checkSprite` runs | S1–S3 | S5 |
| S4b | Join the pieces | `engine/data-sprite.js` (library bodies drawn through `rigs/humanoid-studio.js drawSprite` / `spriteSockets`), `catalog/studio-schema.js` (absorbs the top-down format S4 introduced: view `top-down`, `directions`, clip names `<action>_<down\|up\|side>`; exports its plain-copy wall as `plainStudioData`, so `validateDataSprite` is `validateStudioSprite` with its messages capped), the newt fixture | `data-sprite-library.test.mjs` (the Hero preset as a sprite: controls, clips, every frame equals `drawSprite`, equals `knight.js` at the defaults, sockets, sheet), `data-sprite-bar.test.mjs` (newt, beetle, every template and the Hero pass `checkSprite` with no errors), `studio-schema-topdown.test.mjs` | S1, S4, S5, S6 | S7–S11 |
| S5 ★ | Templates | `rigs/studio-templates.js` (Two legs, Four legs, Crawler, Flyer, Blob, Blank, each with idle, walk, attack, hurt, die keyed; and top-down templates, Top-down person and Top-down beast: one rig with down and up overlays plus idle_, walk_ and attack_ in each direction, modelled on `tests/fixtures/data-sprite/beetle-topdown.json`) | `studio-templates.test.mjs`: each validates and renders every frame non-empty; contacts on 0 and 4 | S1, S3 | S4 |
| S6 | Hero and library bodies | `rigs/humanoid-studio.js` (Hero preset, cape and headgear moved in as new exports, `bake`), `poseFields` added to `rigs/humanoid-describe.js`, the seam in `rigs/humanoid-figure.js` | `humanoid-studio-*.test.mjs`: no `keys` = byte-identical for rogue-battler and road-bandit; baked clip = same frames; Hero preset ≤ 2% pixels off `knight.js`; describe tests still pass | S2 | S1–S5 (coordinate the two rig files with their owners) |
| S7 ★ | Library file form | `tools/lib/data-file.mjs`, a check in the build | `data-file.test.mjs`: write → read back equal; a file with extra code is refused; e2e: a generated newt file dropped in `sprites/` is found and reaches the zip (as `newasset.spec.mjs`) | S4 | S8 |
| S8 ★ | Bag, catalogue, export, playground | `app/bag.js`, `app/catalog.js`, `app/bundle.js` (small additions) | `bag-data-*.test.mjs` (clean, link round trip, deflate, over-limit message), `studio-bag.spec.mjs` (bag → play → zip with `<id>.js`, link opens on another profile) | S4 | S7, S9 |
| S9 ★ | Studio page, part 1 | `app/studio-page.js`, `app/studio/*.js`, `app/studio.css`, route line in `app/app.js` | `studio.spec.mjs`: journey (a) by mouse and by keyboard; no page scroll at 1440×900 and 1024×768; 375 px no sideways scroll; autosave survives reload; undo/redo; failed save reported | S4, S5, S8; design 5 stylesheet from the redesign session | S7 |
| S10 | Studio page, part 2 | `app/studio/library-body.js` | `studio-hero.spec.mjs`: journey (b) | S6, S9 | S11 |
| S11 | `window.loadout.studio` | `app/api-studio.js`, entries in `app/api-actions.js` | `api-studio.test.mjs`, `route-studio.spec.mjs`: an agent builds the newt with actions only | S4, S8 | S10 |
| S12 | Advice | `app/studio/advice.js` (bar in the existing worker, speckle measure) | `studio-advice.test.mjs` | S9 | S10, S11 |
| F1 | The library's rig sprites as data (Q3), proven on two | `catalog/studio-schema.js` (choice and colour controls, `sets` on `FIGURE_SETTINGS`, `when`, Contract 3 parts, `versions`, `body.paint`), `engine/data-rules.js` (new: the named registry `COLOUR_RULES`), `engine/data-sprite.js`, `rigs/humanoid-studio.js figureFor`, `sprites/rogue-battler.js` and `sprites/road-bandit.js` as library files, Contract 14 rule 2 and this section 2.3 | `data-rules.test.mjs`, `studio-schema-library-format.test.mjs`, `data-sprite-library-format.test.mjs`, `conversion-f1.test.mjs` (the C1 guard's settings plus same-colour pairs, off-swatch colours and three looks; no `sprite.made`), `converted-sprites.spec.mjs` (parts, old links, `window.loadout.render`); `conversion-c1.test.mjs` passes for both | S4b, S6, S7, C1's guard | the other 25 conversions (next waves: per rig family, the needs listed in F1's report) |
| S13 | Docs and skill | `docs/framework-api.md` "Studio", the skill's note on data files | review only | S7, S11 | — |

Order: S1, S2, S3 together → S4, S5 → S7, S8, S9 (★ ends here) → S6, S10, S11, S12 → S13. Biggest unknown: the redesign's shared stylesheet must exist before S9 looks like design 5; until then S9 builds on `mocks/5-catalogue/style.css` copied into `app/studio.css` and merges later.

**Page conventions (from the redesign session, 2026-11-19).** The Catalogue redesign is committed (`b0dd99b`, `ab38294`; `app/style.css` is gone). The studio page puts class `v2` on its `<main>`, uses the tokens and components in `app/css/base.css` (`.btn`, `.chip`, `.tabs`/`.tab`, `.seg`, `.tile`, `.card`, the editing panel `.rx-panel`/`.rx-block`/`.vstrip`/`.vbtn`/`.pane`/`.ctl`/`.rx-foot`/`.saved`), and adds one sheet, `app/css/studio.css` (not `app/studio.css`), linked in `index.html` after the other page sheets, with `'studio'` added to `PAGES` in `tests/unit/site-css.test.mjs`. Two columns follow the remix layout in `app/css/asset.css`; the rules are in `docs/site-design.md`, "The look". Seam edits to `app/bag.js`, `app/bundle.js` and `app/app.js` wait until the redesign session says its journey-fix wave is committed; `app/catalog.js` and `app/api-actions.js` are free.

## 9. Open questions for Keyang

| Id | Question | Recommendation |
|---|---|---|
| Q1 | **Answered 2026-11-19 (Keyang): follow edits.** When a studio sprite is in the bag and you keep editing, should the bag item follow your edits (as the remix page saves into the bag), or stay as it was when you put it in? | Follow, with "In your bag · updates as you work" in the footer. A copy can be made with "Keep a copy in the bag" |
| Q2 | **Answered 2026-11-19 (Keyang): templates now.** Should the library's other bodies (top-down person, four-legged beast, crawler, big body) get a data layer like the person, or are bone-rig templates that look like them enough for now? | Templates now; a data layer only for the top-down person, after the side-view one has been used |
| Q3 | **Answered 2026-11-19 (Keyang): convert all 17, against the recommendation.** Every rig sprite becomes a data definition the studio can open; each must draw as today within the preset test. Are the 17 rig sprites in `sprites/` converted to data files (R3), or only new ones? | Only new ones. Convert the Hero to a data file once the preset matches it within the 2% test, as the proof |
| Q4 | **Answered 2026-11-19 (Keyang): in version 1, against the recommendation.** Top-down templates and key poses per direction are part of the first version. Top-down creatures in the studio (three directions each, Contract 2): in version 1 or later? | Later. Side, front and no-view sprites first |
| Q5 | Not asked yet; the recommendation stands (not now). Should a studio creation be able to go into a shared, public gallery one day? That needs hosting and moderation, which a static site does not have | Not now; the link and the file are the ways to share |
