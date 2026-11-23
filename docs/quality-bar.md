# Loadout: the quality bar

Written 2026-11-18 (features ASSET-1, ASSET-12, ASSET-13). This is what "high fidelity and game ready" means for every asset Loadout publishes. It applies to assets made by an agent, into the site's source (route 1) or through the live site (route 2). What a person makes in the studio is theirs and is not held to it.

An asset passes the bar when **both** halves pass:

1. **Automatic checks.** Code in `quality/sprite.js` and `quality/sound.js`. Same code in the build, on the command line and in the browser. Pass = **zero errors**. Warnings do not fail an asset, but the reviewer reads every one.
2. **Judged checks.** A second agent who did not make the asset scores it against the rubric below, following `docs/review-protocol.md`. Pass = the rubric's pass rule.

The maker runs the automatic checks and fixes every error before asking for review. The maker never scores their own asset.

```
node tools/check.mjs [<id> ...] [--json] [--no-cache]                 sprites (no id: every sprite)
node tools/sfx.mjs check sounds/<id>.json ... [--json] [--no-cache]   sound effects, ambience, jingles, music
```

Both run on worker threads and keep each result in `.cache/quality.json`, keyed on the files that asset really loads: its own file, what draws it (for a sprite, which is data and loads no module of its own, the generators, pieces and colour rules it names, each by `id@v` with its code, and the framework code every data sprite runs; see the header of `tools/lib/quality-run.mjs`), the checker's own code (`quality/sprite.js` or `quality/sound.js` with what it imports, and `catalog/schema.js`), and for a sprite the sounds its cues name. So an edit to one generator checks only the sprites naming it again, an edit to the sound engine checks only the sounds, and an edit to a file nothing loads checks nothing (`tools/lib/quality-run.mjs`; the import lists come from `tools/lib/imports.mjs`). An unchanged asset costs nothing; `--no-cache` checks it again. The build (`node tools/build.mjs`) uses the same runner, runs it before it writes anything the site reads, and stops on any error saying which file, what is wrong and what to do.

Every threshold below is a named constant in `THRESHOLDS` in the library file. Change the constant and this document together.

---

## 1. Automatic checks: sprites (`quality/sprite.js`)

`checkSprite(def, { soundIndex, validateMeta }) -> { errors, warnings, metrics }`

### How the checker looks at a sprite

- **Tested settings.** The default; **all sliders low**; **all sliders high**; each option of every choice with everything else at its default; each on/off control flipped.
- **Looks.** The tested settings plus 12 seeded random looks (colours from the swatches). Every frame of every clip is drawn for every look.
- **The far ends** (frame edge only; not for tilesets, backgrounds, interface pieces or icons). All sliders low, and all sliders high, with each other option of each choice and each on/off control flipped, one at a time; and each option of each part with that part's own sliders low, and high, on the default sprite. Only what can matter is drawn: an option at the two ends only in the clips and towards the sides where it sticks out (reaches further than the least-reaching option of the same control), and of those clips only the frames that reach furthest that way with the option alone and with all sliders at that end.
- **Shapes seeds** (frame edge only; same exemptions). The settings a whole-bundle look gives the sprite when it also varies shapes: `themedParams(sprite, defaults, { seed, shapes: true })` in `engine/theme.js`, for seeds 0 to 11 (`shapeSeeds`). Of each clip, the frames that reach furthest at the default, all-low and all-high settings are drawn first; the rest of the clip when one of them comes within 2 pixels of the frame edge (`shapeNear`).
- **Sampled frames** (for what a control does): 4 per clip, at 0, 1/4, 1/2 and 3/4 of the clip.
- **In effect.** A control is in effect unless its part is removed (its selector at a `none` value) or its `when` does not match (Contract 3). The checker asks `inEffect()` in `engine/sprite.js`.
- **N, the visible change.** N = clamp(round(opaque pixels in the first frame of the first clip at the default look / 100), 2, 8). A 16 px icon gets 2; a 64 px hero about 6.
- **Type** comes from `meta.type`. A sprite with no `meta` falls back on `kind`: Character = character, Creature = creature, Item = pickup, Effect = effect.
- **One message per cause.** A fault seen in many frames or looks is reported once, naming the first clip, frame and look where it was seen, then "(and N more)".

A sprite file that cannot be loaded (for example a data definition the validator refuses, or one `engine/data-sprite.js` cannot build) is reported as that sprite's error: "cannot be loaded: ...".

### The checks

| Name | Rule | Threshold | Fails as |
|---|---|---|---|
| S-controls | Every control is made with `range`, `choice`, `color` or `toggle`, and has a label. A colour has at least 3 swatches; a choice at least 2 options | — | error |
| S-dark-swatch | No swatch almost as dark as the outline | brightness < 0.14 | warning |
| S-control-count | Enough to play with; not too many on the sprite's own panel; not too many in one part | fewer than 4 in all; more than 16 **outside parts**; more than 6 in one part (selector included) | warning |
| S-meta | `meta` exists and passes `validateMeta(meta, 'sprite')` from `catalog/schema.js` | — | error (skipped, with a notice, when the schema file is missing) |
| S-sounds | Every sound cue names a sound that exists, is not a music track, and names a style (preset) the sound has. Checked for every cue, whatever its `when`. A looping sound on a one-shot clip is flagged | — | error; looping-on-one-shot is a warning |
| S-renders | Every frame of every look draws without throwing | — | error, one per distinct exception |
| S-nothing-drawn | Every frame draws something. An effect's last frame may be empty | — | error; an effect's empty last frame is a warning |
| S-inside-frame | No drawn pixel on the outermost row or column, in any frame of any look, nor at the far ends (above: all sliders low or high with each other option of each choice and each on/off control flipped; each part's options with its own sliders low and high). Exempt: tilesets, backgrounds, interface pieces, icons | 0 pixels | error; with every other frame-edge fault it is one message, naming the first clip, frame and setting (`all-high + sign=banner`, `sign=banner + part "sign" sliders high`) |
| S-inside-frame-shapes | The same under a whole-bundle look that also varies shapes: seeds 0 to 11 of `themedParams` (above). The 50-seed sweep in `tests/unit/theme-colour.test.mjs` stays the wider net: a fault that one seed in 50 shows is mostly missed by 12 | 0 pixels | error, in the same one frame-edge message; it names the clip, the frame and the seed (`die frame 5 / shapes seed 8`) and gives the command that shows it: `node tools/render.mjs <id> --clip <clip> --set ...` with every setting that seed changed |
| S-repeatable | The default look drawn twice gives identical pixels | 0 pixels | error |
| S-colours | Colours in one clip of one look, within the type's budget (section 3) | above the budget | warning |
| S-moves | A clip with several frames is not one picture repeated. A character or creature has no one-frame clip | all frames identical; one frame | error for character and creature; one frame is a warning for pickup, projectile and effect, and allowed for prop, icon, tileset, interface piece and background |
| S-held-frames | Frames that repeat the previous one | more than half | warning |
| S-loop-seam | In a looping clip, the last frame leads into the first like any other step | last-to-first change > 2.5 x the average step + 8 pixels, or identical | warning |
| S-feet | In the first clip at the default look, the lowest pixel sits on the pivot line | more than 2 pixels away | warning (skipped when `grounded: false`, and for tilesets, backgrounds, interface pieces and icons) |
| S-smallest-look | With all sliders low, the sprite's longer side (median over the first clip's frames) fills enough of the frame's matching side | under 1/3 warns, under 1/4 fails | error / warning (skipped for tilesets and backgrounds) |
| S-control-visible | Each control's biggest change, over the tested settings where it is in effect, is **more than N pixels** in one sampled frame, or changes a clip's speed. Compared: a slider's lowest against its highest; on against off; a colour's two most different swatches; every pair of a choice's options | 0 pixels: error. 1 to N: error for a slider, warning for a choice, on/off or colour | error / warning |
| S-choice-distinct | Every pair of a choice's options differs at some tested setting | 0 pixels: error. 1 to N: warning | error / warning |
| S-never-dead | A control changes the picture at **every** tested setting where it is in effect. No change where it is not in effect is fine | dead somewhere other than all-low / all-high: error. Dead only at all-low or all-high: warning (a deliberate clamp) | error / warning |
| S-not-in-effect-is-quiet | A control declared not in effect changes nothing there (a removed part leaves nothing behind) | any pixel | warning |
| S-tile-opaque | Every fill tile (the fill and its other versions `-fill-b`, `-fill-c`) is fully opaque at every look the joins are tested at | 0 see-through pixels | error |
| S-tile-seams | Tiles that sit next to each other join: the outlines meet exactly, the edge band is as deep on both sides, and there is no brightness step (see below) | outline: 0 px. Edge band and brightness: see below | error; a stack (`-cap` / `-mid` / `-foot`) is a warning |
| S-tile-fill-versions | Another version of the fill (`-fill-b`, `-fill-c`) has the same four edge lines as the fill, so it can stand in for it anywhere | 0 px | error |
| S-tile-level | A thin platform's middle piece is level with the top of the block of the same prefix, so it can run into the block | first drawn row equal | error |
| S-tile-slope | The corner tile under a slope's foot (`-inner-tl`, `-inner-tr`) does not start with the outline colour at its corner: that leaves a nub on the slope's line | — | error |
| S-tile-decal | A decal placed `above` (or `below`) reaches the bottom (top) row of its cell, and the block's `-top` (`-bottom`) has pixels under every column it stands on | 0 px gap | error |
| S-tile-decal-place | A decal placed `on` (over a fill tile) is not drawn like one that stands on the block or hangs under it | touches the bottom (top) row and lies wholly in that half of its cell | warning |
| S-tile-rhythm | In a platform's middle piece (sideways) and a stack's middle piece (up and down), marks that repeat fit the tile a whole number of times | spacing does not divide the tile's length | warning |
| S-tile-texture | A fill's texture survives every whole-bundle look with every swatch of every colour control: no mark that is a tone of the fill colour turns into the fill colour | marks of 4 px or more, hue within 35 degrees of the fill (or both grey) | warning |
| S-tile-size | Tiles are 16x16 or 32x32 | — | warning |
| S-background-width | Every background layer covers the full width in every frame of every look | — | error, one per layer |
| S-background-wrap | Each layer's right edge continues into its own left edge (see below) | see below | error |
| S-background-solid | The farthest layer (first clip) has no see-through pixels | — | warning |
| S-survives-looks | Each clip still reads under every whole-bundle look (`THEME_PRESETS` in `engine/theme.js`: Sunset, Mono, Handheld and the rest). Measured at the default settings over all frames of the clip: of its edges (two neighbouring pixels that differ; the outline against see-through pixels counts and is always left), the share that still differ after the look | under 65% of the edges left (`lookEdgesWarn`) | warning, one per cause, from the clip where it is worst (an error level would be 50%) |

**The S-never-dead message names the remedy.** It lists the settings where the control did nothing, and, when another control explains it, the `when` to declare with the values where the control did work: `"inlay" does nothing when emblem=plain, emblem=hole ...; make it do something when emblem=plain, emblem=hole, or declare when: { emblem: ['star', 'heart', 'gem'] }`.

**Fixing S-survives-looks.** A look turns every colour into one other colour, and most looks keep lightness and replace hue. Two neighbouring materials that are about equally light therefore become the same colour, and the shape between them is gone: a ridge melts into the sky, a canopy turns into one flat blob. The warning names the clip, the look, the two colours that merged (with their brightness, 0 to 1) and the other looks that do the same. Make neighbouring materials differ in lightness, not only in hue: move one of the two named colours clearly lighter or darker (measured on the sprites of 2026-11-18 under the palette looks: neighbours 0.2 or more apart in brightness almost never merged, 0.12 to 0.2 apart merged in about 1 case in 20, under 0.06 apart in nearly half), then run the checker again. Shading bands inside one material are held to the same rule, because a look that merges all of them leaves the material flat. It is a warning because the line is not sharp: clips that still read scored 60% and up, clips that had merged 63% and down, so look at the picture under the named look before changing anything. `metrics.themes` holds the looks tested, the lowest share found and its clip and look.

**Seam test (S-tile-seams, S-background-wrap).** For two frames A (left, or above) and B (right, or below), take A's last column (row) and B's first. Count *gaps*: positions where one side is drawn and the other is see-through. Measure the *brightness step*: the mean difference in brightness (0 to 1) where both are drawn. Do the same for every pair of neighbouring columns (rows) inside the tile, and keep the *largest* inside step. A background layer passes when its gaps and brightness step are no bigger than the largest inside step, with floors of 1 gap and 0.08; tested at the default, all-low and all-high looks, frame by frame.

**Tiles are held to more (S-tile-seams), because texture inside a tile must not hide a seam.** Three tests per join:

1. *Outline, exact.* 0 gaps: the two outlines meet pixel for pixel. An outline may wander up to 3 px inside a tile but is on the tile boundary at both ends of every edge (the tile helper pins it).
2. *Edge band.* For two pieces of a block that has a fill, the band is every pixel that differs from the fill tile at the same place. Its depth, counted in from each end of the boundary line, may differ between A's last line and B's first by no more than it changes between neighbouring lines inside either tile (the smaller of the two tiles' largest changes; often 0 to 2 px). Not tested where a piece is an inner corner: a band may end or turn there.
3. *Brightness step*, as above (floor 0.08).

Tiles are tested at every tested setting (default, all-low, all-high, each option of every choice, each on/off control flipped) and at 6 of the random looks, frame by frame. The brightness step is judged only at the tested settings (the colours the tiles were designed in); the two exact tests also run at the random looks, which change the colours.

**Which tiles are neighbours.** Taken from clip names by `classifyTiles` in `engine/tiles.js`, the same reading the map tool and the playground use (style guide, section 6):

- *A block* is the 13 pieces under one prefix, plus the optional 7 narrow pieces (`-strip-l/m/r`, `-col-t/m/b`, `-single`), the optional 9 lane pieces (`-elbow-tl/tr/bl/br`, `-tee-t/r/b/l`, `-cross`: where a lane one tile wide bends, forks and crosses; the edge band test is what catches a bend whose rim stops short of the cut corner) and other versions of the fill (`-fill-b`, `-fill-c`). Every pair of pieces that can touch is a join (64 pairs for the 13; `blockJoins`), and every version of the fill stands in wherever the fill does, against every other version too. A `-top`, `-left` or `-right` with no partner under its own prefix is tested against the first fill or top there is.
- *Top-down* (`meta.view: 'top-down'`): the bottom row (`-bottom*`, and `-col-b`, `-strip-*`, `-single`) may be a wall's front face, darker than the cap by design. Between that row and the rows above it only the outline is tested; beside an inner corner the face simply ends, and that pair is not tested.
- *A thin platform*: `-thin-l` beside `-thin-m`, `-thin-m` beside itself and beside `-thin-r`, `-thin-l` beside `-thin-r`; and S-tile-level against the block's `-top`.
- *Slopes*: `-slope-up` beside `-top`, `-top` beside `-slope-down`; each slope above its corner tile and beside it (two slopes corner to corner); `-slope-up` beside `-slope-down` (a peak) and the other way round (a valley).
- *A liquid that lands* (a prefix with only `-top` and `-fill`, and a lone `-foot`: a waterfall): each fill and the top above the foot, and the foot beside itself, as a warning.
- *A stack* (`-cap` above `-mid`, `-mid` above itself and above `-foot`): outline and brightness, as a warning, because these names are not fixed by the style guide.

A tileset with nothing the checker knows by name gets a warning.

### Metrics

`metrics` holds `ms` (time for this sprite), `renders`, `bases` (tested settings), `looks`, `type`, `typeFrom`, `metaChecked`, `opaquePixels`, `strength` (N), `smallestFill`, `maxColours`, `parts`, `joins` and `fillTexture` (tilesets: every join tested; how many fill-and-swatch settings were tried and which lost their texture), and `controls`: keyed by control, its kind, the largest change found (capped at N + 1), the number of tested settings where it was in effect, and the settings where it was dead and alive. `edgeEnds` (`looks`, `renders`, `touched`, `first`: the setting, clip and frame of the first frame on the edge, `ms`) and `shapes` (`seeds`, `renders`, `touched`, `first`: the seed, clip and frame, `ms`) say what the far ends and the shapes seeds drew and found, whichever frame-edge message was printed.

---

## 2. Automatic checks: sound effects, ambience, jingles and music (`quality/sound.js`)

`checkSound(patch, { validateMeta }) -> { errors, warnings, notes, metrics }`

The checker renders the patch at its defaults, at the lowest and highest value of every control, with a second random seed, and with every style (preset).

| Name | Rule | Threshold | Fails as |
|---|---|---|---|
| A-valid | The patch passes the engine's validator (`validatePatch`), which also renders every control's ends and refuses non-finite output | — | error |
| A-meta | `meta` exists and passes `validateMeta(meta, 'sound' or 'music')` | — | error (skipped when the schema file is missing) |
| A-silent | The default render is not silent | peak below -40 dBFS | error |
| A-finite | No non-finite samples | 0 | error |
| A-starts | A one-shot starts at once | more than 30 ms of silence first | warning |
| A-onset | A hit, click, shot, step or pickup has started within 10 ms. Measured as **onset**: the first sample within 20 dB of the peak, not the time to the loudest moment. Checked at the default and in every style | onset above 10 ms (`onsetDb`, `onsetMaxMs`) | warning |
| A-length | A one-shot's length suits its type, at the default and in every style | sound effect outside 0.03 to 2 s; jingle outside 1 to 6 s (`lengthRange`) | warning |
| A-peak | The level heard (`heardPeak`: the raw peak of a patch that says `"normalize": false`, 0.89 for a normalised one) stays a little under full scale at the default, in every style and at both ends of every control (since 2026-11-18; it was a warning on the default and styles only) | above 0.95 (`peakMax`; full scale is `clipPeak`, 1) | error |
| A-words | What a visitor reads (name, description, control labels, choices, style names) has no units, synthesizer terms or music theory (`TECHNICAL_WORDS`, `technicalWords`; the list and why each word is on it are in `quality/sound.js`). Text only, no render | any word on the list | error |
| A-tail | A one-shot is not padded with silence | last 150 ms and 25% of the length silent | warning |
| A-cut-off | A one-shot has died away by its end | last 1/32 louder than -18 dB re. the loudest | warning |
| A-dc | No DC offset | mean above 0.05 | warning |
| A-small-speakers | Energy a phone can play | over 60% below 80 Hz: warning; over 80% below 300 Hz: note | warning / note |
| A-phone | Enough of the energy is above 300 Hz for a phone or laptop speaker, at the default and in every style. Skipped for a patch that says it is a rumble (the word `rumble` in `tags` or `meta.words`), and for music | under 40% above 300 Hz (`phoneShareMin`) | warning; a declared rumble gets a note with the number |
| A-loop-seam | A loop does not click where it wraps | jump > 8 x the typical sample step **and** > 0.05 | error |
| A-control-alive | Each control changes the sound at all between its ends | fingerprint distance below 0.01 dB | error |
| A-control-audible | Each control's ends differ audibly. A control under 1.5 dB with seed 1 is tested twice more before it is flagged (the next two rows) | fingerprint distance below 1.5 dB, and not heard as timing or as random takes | warning |
| A-control-timing | A control that moves notes in time counts as audible: the note starts of its two ends are paired, nearest to nearest | one note start in ten moves 10 ms or more (`onsetShiftMs`) | lifts the A-control-audible warning |
| A-control-random | A control that widens a random pick counts as audible: both ends are rendered with 5 seeds (2 when the sound has no randomness) | the typical take (median over the seeds) differs by 1.5 dB or more between the ends, or takes differ from each other by 1.5 dB more at one end than at the other (`randomSeeds`) | lifts the A-control-audible warning |
| A-control-choice | A control that changes nothing at the defaults is measured again with each choice control (one with `options`) on its other choices, each one's last choice first, before it is called dead: it may set a layer that the default choice leaves silent (the music kit's `alongLevel` under `along`: None) | fingerprint distance of 0.01 dB or more under some choice; the highest among that control's choices is kept, stopping at the first of 1.5 dB or more (`heardWith`) | lifts the A-control-alive error; A-control-audible is then judged on that measurement |
| A-control-safe | No control end makes the sound silent or non-finite | — | error |
| A-control-cut-off | No control end cuts a one-shot off | last 1/32 louder than -12 dB | warning |
| A-presets | No style (preset) is silent | peak below -40 dBFS | error |
| A-styles | Every style passes the one-shot checks the default gets: not cut off, A-length, A-peak, A-phone, A-onset, no non-finite samples. One message per rule, naming the styles | cut off: last 1/32 louder than -18 dB (`styleCutOffDb`); the others as in their own rows | warning |
| A-control-count | Something to remix, not too much | none; more than 7 (10 for music) | warning |
| M-tempo | The strongest detected beat matches the written tempo (the `bpm` control's default), or half or double it | within 2 bpm | error; also an error when there is no written tempo or no steady beat |
| M-length | A length control exists (`id: "bars"` or `unit: "bars"`) and is used in `duration` | — | error; a length control without `step` is a warning |
| M-instrument | A melody-instrument control exists: a named choice (`options`) whose label says instrument, or `id: "inst"` | — | error |
| M-loops | Music loops and is stereo | — | warning |
| M-chords | Each bar sounds the chord the patch writes for it. A bar counts when at least 2 of its 3 strongest notes (pitch classes) belong to its chord | under 75% of the bars (`chordBarsMin`) | error; a track that does not write its chords gets a warning |
| M-in-key | Little of the pitched sound is on notes that none of the written chords use: a tune or a layer a semitone off its chords puts a third of it there | over 20% (`outOfKeyMax`) | warning |
| A-jingle | A jingle (`meta.type: 'jingle'`) does not loop; its patch says `"category": "jingle"` | — | error if it loops; warning for another category |
| A-ambience | An ambience (`meta.type: 'ambience'`, or `"category": "ambience"`) loops | — | error |

The type comes from `meta.type`, else from the category. M- checks apply to type `music` only. A short musical sting (victory, game over, level up) is a **jingle**: `meta.type: 'jingle'` and `"category": "jingle"` in the patch, no `loop`. It gets the one-shot A- checks and none of the M- checks, so it is never judged as a looping track. Music also gets every A- check; A-loop-seam is an error for every loop. `battle-theme.json` is the worked example of M-length and M-instrument. Music takes minutes per track to check; the cache keeps the result until the patch or the code changes.

### The checks added on 2026-11-18

Each closes a gap that reviewers had been measuring by hand. All are warnings except M-chords. The numbers come from every patch in `sounds/` that day: 56 effects, ambiences and jingles (211 looks: each default and each style) and 2 tracks.

**A-onset: where a sound starts, not when it is loudest.** `attack` is the time to the loudest sample, so a chime whose last note is the loudest, or anything that swells, reads as a slow attack although it starts at once (coin-pickup 57 ms, credit-pickup 202 ms in one style). `onset` is the first sample within 20 dB of the peak (a tenth of the peak), counted from the start of the render. The 10 ms rule of the style guide is applied to onset, and only to the kinds the guide names, taken from `meta.role`: hit (`actions/hit`, `effects/impact`), click (`interface/click`), shot (`actions/shoot`), step (`characters/footstep`) and pickup (`items/pickup`). All 18 sounds of those kinds start within 1.5 ms in every style; sounds that swell in on purpose (whoosh, sword-slash, door-creak) read 31 to 104 ms and are not held to the rule. Both numbers are printed. Limit: a straight fade-in crosses a tenth of its peak after a tenth of its length, so a 60 ms fade still passes; read the loudness contour for those.

**A-phone: energy above 300 Hz.** The style guide asks for at least 40% of the energy above 300 Hz. The checker measures it at the default and in every style (`analysis.above300`) and warns under 40%. A patch that is meant to be a low rumble says so with the word `rumble` in `tags` or in `meta.words` (stone-door, thunder-crack and wyrm-roar already do); it gets a note with the number instead. Music is not held to it: the two tracks measure 57% and 75%, but a low-intensity style is mostly bass and kick by design. The older A-small-speakers warning and note are unchanged.

**A-styles, A-length, A-peak: a style is checked like the default.** Styles used to be tested for silence only. Each style's render is now also measured for: cut off at the end (the same -18 dB line as the default), length inside its type's range, level above full scale when the patch is not normalised, energy above 300 Hz, and onset for the five kinds. The message names the style, or the styles when several break the same rule. It costs no extra render: the style was already rendered and measured for the silence check.

**A-control-random: a control that widens a random pick.** With seed 1 the engine's first `rnd(-1, 1)` is 0.03, almost the centre of any random pick, so a control that only widens the pick (a `spread` on a text blip) barely changes the seed-1 render and was flagged inaudible. A control under 1.5 dB is now rendered with seeds 1 to 5 at both ends. It counts as audible when the median distance between its ends is 1.5 dB or more, or when takes differ from each other by 1.5 dB more at one end than at the other. If seed 2 changes nothing at either end, the sound has no randomness and the test stops there. Cost: 2 to 8 extra renders, only for a control that failed.

**A-control-timing: a control that moves notes in time.** The fingerprint averages over time, so `swing` on thornwood-overworld scored 0.4 dB while moving every off-beat note by 38 ms. For a control under 1.5 dB the note starts of its two ends (`onsets` in `sound/analyze.js`: peaks of spectral flux) are paired nearest to nearest; when one in ten moves by 10 ms or more the control is audible as timing. It uses the two renders the control already had. It is only run on a control under 1.5 dB, because a control that reshapes the sound also moves the detected note starts; the report prints the shift so a reviewer can judge a borderline case.

**A-control-choice: a control that only acts under another choice.** The music kit writes two controls for the instrument that plays along: `along` (which one, default None) and `alongLevel` (how loud). With None the layer is silent by design, so `alongLevel` measured 0.0 dB at the defaults on every track and failed A-control-alive. A control under 0.01 dB is now rendered again, both ends, with each other control that has `options` set to each of its non-default choices in turn (every such control's last choice first, then each one's next to last, and so on), until one changes the sound; it then goes on through that control's remaining choices only, and stops at the first that scores 1.5 dB or more, keeping the highest (on cloudreach-gale: Bass 1.2 dB, then Trumpet 1.8 dB). `metrics.params[]` then holds that distance in `distance` and `heardWith: { id, value, choice, distanceAtDefaults }`, the report prints the choice, and a control still under 1.5 dB there gets the A-control-audible warning. The extra renders happen only for a control that is dead at the defaults; one that is dead under every choice is still an error.

**M-chords and M-in-key: each bar sounds its written chord.** The chords are read from the patch as the music kit's `chords()` writes them: the nodes `root`, `third` and `fifth` (semitones, one step per bar) and `tonic` (the home note, semitones above C), moved by the `key` control's default. An older patch with no `tonic` node (battle-theme) takes its tonic from the bass: the lowest number added to `tr` inside `midi()`. The default render is cut into bars and each bar's pitch classes are measured the way `tools/compose/verify_music.mjs` does (`barPitchClasses`: spectral peaks from 100 Hz to 2 kHz over the whole bar). A bar matches when at least 2 of its 3 strongest notes belong to its chord; under 75% of bars is an error that names the bars. battle-theme matches 8 of 8 and thornwood-overworld 16 of 16; with their chords written one or three bars late 38% to 50% match, and with the tune a semitone off 0% to 75%. M-in-key is the share of pitched energy on notes that no written chord uses: 9% and 12% for the two tracks (drums and overtones), 28% to 33% with the tune moved a semitone. Both use the default render, so they add under 0.2 s to a track. A track that does not write its chords gets a warning that says which nodes to add.

**Crest factor.** The report prints crest (peak over average level, dB) on the `render` line, with the style guide's "above 10 dB" beside it for the five kinds, and per style. It is printed, not checked.

### Metrics

`metrics` holds `ms`, `renderMs`, `realtime`, `type`, `valid`, `metaChecked`, `analysis` (length, peak, loudness, crest, lead and tail silence, attack, end level, a 32-step loudness contour, spectral centroid and strongest frequency at start, middle and end, energy per band), `rawPeak`, `stereo`, `nodes` (peak level of every node), `loopSeam` and `pulse` (loops), `params` (per control: distance in dB and flags; for a control under 1.5 dB also `onsetShiftMs`, `seeds: { count, distance, takesAtMin, takesAtMax }` and `audibleBy`: `'timing'` or `'random takes'`), `variation` (seed 1 against seed 2, dB), `presets`, `styles` (per style: `seconds`, `rawPeak`, `endLevelDb`, `above300`, `onsetMs`, `crestDb`, `flags`), `kind` (hit, click, shot, step, pickup or null), `rumble`, `extraControlMs` (time spent on the extra control tests), and for music `music: { writtenBpm, detectedBpm, tempoOk, lengthControl, instrumentControl, chords: { tonic, tonicFrom, bars: [{ bar, written, top, topShares, chordShare, match }], counted, matched, share, outOfKey }, chordsMs }`. `analysis` also holds `onsetMs` and `above300`. The reviewer judges sound from these (it cannot listen).

---

## 3. What each type must be

"High fidelity" means it would not look or sound out of place in a small commercial pixel-art game. "Game ready" means a developer can drop it in and use it without editing it.

### Sprites

| Type | High fidelity and game ready means | Required clips (recommended) | Colour budget per clip | Automatic rules specific to it |
|---|---|---|---|---|
| **Character** (side view) | Named at a glance from the idle frame. Clear head, body and held item. Every clip has readable key poses (anticipation, action, follow-through) and stays on the ground line. Every look, smallest to largest, is the same character. Parts (weapon, hat, cape) attach to a joint every frame and can be changed or removed | `idle`, `walk`, `hurt`, and one action: `attack` or `cast` (`run`, `jump`) | 8 to 32 | Moves in every clip; feet on the pivot line; inside the frame |
| **Top-down character** | As a side-view character, readable from above; the four directions are clearly the same character | `idle_down`, `walk_down`, `walk_up`, `walk_side` (side faces right; games mirror it) (`idle_up`, `idle_side`, an action per direction) | 8 to 32 | As character; `meta.view: 'top-down'` |
| **Creature** | Silhouette says what it is (a bat is wings and ears; a wolf is snout, ears and tail). Motion has weight and a clear rhythm; attack and hurt read instantly | `idle`, one way of moving (`walk`, `run`, `fly`, `hop`), `attack`, `hurt` | 8 to 32 | As character |
| **Tileset** | Tiles snap together with no visible seam or repeated blotch; edges read as solid ground; texture calm enough that a screen of it does not buzz | at least one `<name>-fill` and one `<name>-top` (`-left`, `-right` ledges, corners, `wall`) | 4 to 24 per tile | Fill tiles opaque; joins exact (outline, edge band, brightness); platform level; slope line; decals stand; rhythm; fill texture survives the looks; 16 or 32 px square; may fill the frame; one-frame tiles allowed |
| **Prop** | Reads as its object at game size; sits on the ground line; states differ clearly | one clip (a second state when it has one: `closed` / `open`) | 4 to 24 | One-frame clips allowed |
| **Pickup** | Pops against any background (strong outline and highlight); idle motion catches the eye; the collect clip is a clear reward | `idle` (spin or bob), `collect` | 4 to 16 | One-frame clip warns |
| **Projectile** | Direction of travel obvious; reads at speed; small and bright | `fly` (looping) (`hit`) | 3 to 12 | One-frame clip warns |
| **Effect** | Strong shape that reads in a few frames; starts and ends cleanly; glows against dark and light backgrounds | one clip that plays (looping for a steady effect, one-shot for a burst) | 3 to 24 | One-frame clip warns; an empty last frame warns |
| **Background** | Layers recede (far layers lower contrast and cooler); repeats sideways with no seam; does not compete with the sprites in front | at least one layer, ideally `far`, `mid`, `near` | 4 to 32 per layer | Layers span the full width; wrap seam; may fill the frame; farthest layer solid |
| **Interface piece** | Clean and readable at 1x; states differ clearly; text area left clear | buttons: `normal`, `hover`, `pressed`; panels and bars: one clip | 3 to 16 | May touch the frame edge; one-frame clips allowed |
| **Icon** | One idea, readable at 16 or 32 px; a silhouette distinct from the other icons in its set | one clip | 3 to 16 | May touch the frame edge; one-frame clips allowed |

The lower end of each colour range is for the judged rubric (fewer colours than that usually reads flat); the upper end is the checker's warning.

### Sounds and music

| Type | High fidelity and game ready means | Shape | Automatic rules specific to it |
|---|---|---|---|
| **Sound effect** (`meta.type: 'sfx'`) | Sounds like its brief from the first millisecond; short and dry enough to fire many times; every control gives a usable sound; repeated sounds (steps, hits, shots) vary from take to take | one-shot: starts at once, dies away, not padded; under 2 s unless the brief says otherwise | A- checks |
| **Ambience loop** | A bed that can play for minutes: no click at the seam, no event so distinctive that the repeat is obvious, steady level | loop, steady contour | Must loop (A-ambience); A-loop-seam is an error |
| **Jingle** | A short musical sting (victory, game over, level up) that resolves cleanly and is unmistakable in its mood | one-shot, 1 to 6 s, ends on a resolved chord, no loop | `meta.type: 'jingle'`, `"category": "jingle"`; must not loop (A-jingle); A- checks (one-shot shape); tempo, length and instrument controls are not required |
| **Music track** | Steady tempo, coherent harmony, a melody worth humming, a build-up that suits its game moment; loops seamlessly; has length and melody-instrument choices | loop, bar-exact, stereo | M- checks; A-loop-seam |

---

## 4. Judged checks: the rubric

The judged half is done by an independent reviewer agent (`docs/review-protocol.md`). It scores **five criteria, 0 to 3 each**.

**Pass rule: every criterion scores at least 2, and the total is at least 11 of 15.** Anything else fails, with numbered fixes. Any automatic error is a fail whatever the scores. Five scores of 2 (total 10) is a fail: competent everywhere, outstanding nowhere. The required fix then names the criterion closest to a 3 and exactly what would lift it there (`docs/review-protocol.md`, step 5).

### Sprites

Criterion 3 is **Motion** for types that move (character, creature, pickup, projectile, effect) and **States and use** for still types (tileset, prop, background, interface piece, icon). Score whichever applies.

| Criterion | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **1. Reads as what it is** | Cannot tell what it is | Guessable with the name in hand | A stranger names it in two seconds at 1x | Instantly recognisable, with a character of its own |
| **2. Pixel-art craft** | Noise, stray pixels, flat unshaded blobs, colours that clash | Shading present but muddy; outline broken; parts merge into each other | Clean outline, light from one side, parts told apart by value, colours within the type's range (section 3) | Could sit in a shipped game: deliberate clusters, no orphan pixels, palette that holds together in every swatch |
| **3a. Motion** (types that move) | Frames pop, parts detach, feet slide, or the clip shows no action | Moves, but key poses are unclear or timing is even and lifeless | Clear key poses with anticipation and follow-through; loops close; stays grounded | Weight and personality; every clip reads in silhouette alone |
| **3b. States and use** (still types) | States look the same, tiles show seams, layers flatten into one, or it cannot be placed in a level as is | States differ only in detail; a tile field shows an obvious repeated blotch; layers barely recede | States are clear at 1x; tiles snap with no visible seam; layers recede; an interface piece leaves its text area clear | A level built from it looks finished: tile fields read as one surface, layers give real depth, states are unmistakable at a glance |
| **4. Range of looks** | Some looks are broken (clipped, detached, unreadable) | Most looks work, but some controls barely matter or some combinations look wrong | Every look on the variants and choices sheets works and is the same thing; each control does something a person notices | The controls make genuinely different, equally good assets; parts change independently and stay attached |
| **5. Game ready for its type** | Wrong size, wrong ground line, required clips missing (section 3) | Usable after editing | Drop-in: right size, pivot, required clips and states for its type, sounds on the right frames | Drop-in and pleasant to build with: clip names and timings a game expects, sounds that land exactly on the hit |

### Sound effects, ambience and jingles

| Criterion | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **1. Matches the brief** | The measurements contradict the brief (a "laser" with no pitch movement; a "rumble" that is all highs) | Some of the brief shows in the numbers, key traits missing | Contour, spectrum and pitch movement all match what the brief describes | Matches, and the layers named in the brief are each visible in the node levels and the picture |
| **2. Clean signal** | Clipping, DC, non-finite samples, click at the seam | Muddy (everything in one band) or harsh, or a dead layer | Balanced bands for its purpose, no dead layers, safe peak and crest | Clear separation of body, character and transient; nothing wasted |
| **3. Shape and timing** | Starts late, is cut off, or is padded with silence | Envelope roughly right for the use, timing off for the frame it is attached to | Attack, length and tail fit its use (section 3) | Shape is exactly what a game needs (a hit under 10 ms attack; a loop with no distinctive repeat; a jingle that resolves) |
| **4. Range of controls** | Controls silent or broken at their ends | Some controls barely change the sound (under 1.5 dB) | Every control audibly changes the sound and every end is usable | Controls map to things a listener hears, together cover a family of sounds; repeated sounds vary between takes |
| **5. Game ready** | Wrong type (a one-shot that loops; a loop that clicks) | Usable after editing | Drop-in: right length, normalised, named styles that make sense | Drop-in, with styles that cover the obvious uses |

### Music tracks

Same pass rule. Criteria 2, 4 and 5 are as above; 1 and 3 are:

| Criterion | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **1. Matches the brief** | Mood and tempo wrong for its game moment | Tempo right, energy or character wrong | Tempo, energy and character fit the moment named in the brief | Fits, and the intensity control takes it convincingly from calm to full |
| **3. Musical structure** | No steady beat; pitch classes per bar contradict the written chords | Beat steady but harmony or melody incoherent | Beat steady, chords per bar match the written ones, length versions build section by section | As 2, and each melody instrument is balanced by measurement and sits in its own space |

The reviewer cannot hear. Sound and music scores rest on measurements and pictures, so the verdict carries a **confidence** (low, medium, high). From time to time a person listens to a sample of passed sounds to check the bar against human judgement (BASE-6).

---

## 5. The existing assets

The assets made before this bar are not edited to meet it by the quality work. What they fail is reported by the checkers (`node tools/check.mjs`, `node tools/sfx.mjs check sounds/*.json`) and recorded in `docs/progress.md` by the orchestrator.
