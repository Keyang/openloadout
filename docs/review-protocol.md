# Loadout: how an independent reviewer judges an asset

Written 2026-11-18 (feature ASSET-13). This is the judged half of the quality bar (`docs/quality-bar.md`). The agent that made an asset never judges it. A second agent, with no access to the maker's reasoning, follows these steps and returns a short JSON verdict that the maker can act on without guessing.

All paths are relative to `lab/sprite-forge/`. Run commands from there.

## 0. What you are given, and what you must not use

You get: the asset id, its kind (sprite, sound or music), and its **brief**: `name`, `blurb` or `description`, and `meta` from the asset file. That is all you judge against.

Do not read the maker's report, notes or chat before you have scored. Do not edit the asset. Do not run `git` write commands. Write rendered files only under `out/`.

## 1. Run the automatic checks

| Kind | Command |
|---|---|
| Sprite | `node tools/check.mjs <id> --json` |
| Sound or music | `node tools/sfx.mjs check sounds/<id>.json --json` |

Then run the same command without `--json` for the human-readable measurement lines. The second run comes from the cache (`.cache/quality.json`) and is instant, so a music track is rendered only once even though you run the command twice. Do not pass `--no-cache` unless you suspect the cache.

- If `errors` is not empty, the verdict is **fail**. Copy every error into `required_fixes` (see step 5 for the form: each fix must start with the control, clip or sound control the builder has to change; checker messages already name it, so keep that name at the front). You may skip the judged steps; set every score you did not judge to `null`.
- Read every warning. A warning is not a failure, but it is evidence for the scores (a loop-seam warning lowers Motion; a "little audible effect" warning lowers Range of controls; a "differ by at most N pixels" warning lowers Range of looks).
- Keep `metrics` open: you will quote numbers from it.

## 2. Sprites: render and look

Render in this order. `render.mjs` always writes the clips sheet to `out/<id>-clips.png`, so a later run with `--scale` or `--set` overwrites it: copy each sheet you want to keep before the next run.

```
node tools/render.mjs <id> --scale 1     && cp out/<id>-clips.png out/<id>-1x.png        game size: one pixel per pixel
node tools/render.mjs <id>               && cp out/<id>-clips.png out/<id>-clips-default.png
                                                                                          also writes out/<id>-variants.png and out/<id>-choices.png
node tools/render.mjs <id> --clip <clip>                                                  one clip at 8x -> out/<id>-<clip>.png, for each clip with action
node tools/render.mjs <id> --set key=value ...  && cp out/<id>-clips.png out/<id>-clips-<what>.png
                                                                                          chosen settings: a part set to none, the extremes
```

Open each PNG with the Read tool. The script prints which row is which. Look at each sheet for these things, in this order:

| Sheet | What it shows | Look for |
|---|---|---|
| `out/<id>-1x.png` | Every frame of every clip at 1x, the size a player sees | **Reads** at game size: is it still the thing it is? Do the eyes, the held item and the states survive at 1x? Judge criterion 1 here, not on the big sheets |
| `out/<id>-clips-default.png` | Every frame of every clip, default look, 4x. Rows = clips, columns = frames | **Reads:** squint at the first idle frame. Would a stranger name it? **Craft:** outline unbroken; light from one side; parts told apart by value (light against dark); no orphan pixels; no flat unshaded areas. **Motion:** does each row show the action's arc? Anticipation before the hit, follow-through after? Feet stay on one line; nothing pops, vanishes or detaches for a frame |
| `out/<id>-<clip>.png` | One clip at 8x | Frame-to-frame detail: limbs keep their length, held items stay in the hand, the last frame of a loop leads into the first |
| `out/<id>-variants.png` | Rows: default, all sliders low, all sliders high, five random looks; two frames per clip | **Range:** every row is the same thing and still reads; nothing clipped, merged or detached; the all-low row is not a speck; the all-high row is not cramped |
| `out/<id>-choices.png` | One row per choice, one cell per option, first frame of the first clip | **Range:** every option looks clearly different, and the difference is in the silhouette where possible |
| `out/<id>-clips-<what>.png` (`--set <part>=none`) | The clips sheet with a part removed | **Parts:** nothing left behind (no hand held out for a missing sword, no gap in the outline) |

Type-specific looks (section 3 of the bar):

- **Tileset:** imagine the tiles in a 4 x 2 block. The automatic seam test checks the edges; you judge whether a field of the fill tile would show an obvious repeated blotch, and whether edges read as solid ground.
- **Background:** the layers should recede: far layers lower contrast and cooler than near ones. Picture it scrolling: is any feature so distinctive that the repeat is obvious?
- **Interface piece:** states (normal, hover, pressed) must differ at 1x; the text area is clear.
- **Icon, pickup, projectile, effect:** judge at 1x, the size a player sees. Effects should start and end cleanly.

Also check that sounds attached to clips (`sounds` in the file) sit on the frame where the action lands (a footstep on the contact frame, a slash on the swing frame).

## 3. Sounds and music: judge without hearing

You cannot listen. Judge from the checker's measurements and the picture.

```
node tools/sfx.mjs render sounds/<id>.json --png out/<id>.png                                    default
node tools/sfx.mjs render sounds/<id>.json --png out/<id>-<style>.png --preset "<style>"   each style
node tools/sfx.mjs render sounds/<id>.json --png out/<id>-<c>-lo.png --set <c>=<min>      control ends, for any control you doubt
node tools/sfx.mjs render sounds/<id>.json --png out/<id>-<c>-hi.png --set <c>=<max>
node tools/compose/verify_music.mjs sounds/<id>.json <bars> intensity              music only: notes per bar, mix across intensity
```

**Reading the picture.** Top band: the waveform (loudness over time, left to right). Bottom band: the spectrogram, 40 Hz at the bottom to 20 kHz at the top on a log scale, brighter = louder.

| In the picture | Means |
|---|---|
| Thin horizontal lines, evenly stacked | A pitched tone and its harmonics |
| Lines that slope | Pitch moving: down = falling (a laser zap, a drop), up = rising (a power-up, a jump) |
| A vertical bright bar | A transient: a click, hit or attack. A hit should start with one |
| Diffuse fog across a wide band | Noise: wind, fire, hiss, explosions, whooshes |
| Fog that slides up or down | A filtered noise sweep: a whoosh |
| Everything in the bottom quarter | Low and heavy; thin on phone speakers |
| A waveform that ends at full height | Cut off |
| A long flat tail in the waveform | Padded with silence |

**Brief words to measurements.** Translate each adjective in the brief into a measurable claim, then check it:

| Brief says | Expect in the measurements |
|---|---|
| punchy, snappy, hit, impact | attack under 10 ms; crest above 10 dB; contour starts at the top and falls |
| heavy, deep, big, rumble | centroid under about 600 Hz; most energy in sub and low bands, but some above 300 Hz |
| bright, sparkly, glassy, shiny | centroid above about 3 kHz; real share in high and air bands |
| falling, dropping, zap | strongest frequency start > middle > end |
| rising, charging, power-up | strongest frequency start < middle < end |
| short, tick, blip, click | sounding under 0.15 s |
| long, swell, drone | attack long on purpose; sounding most of the length |
| gritty, noisy, crunchy | wide bands; fog in the spectrogram |
| footsteps, hits, shots (things that repeat) | variation (seed 1 vs seed 2) above 0.2 dB, so takes differ |
| loop, ambience, hum | loop seam well under 8x; level steady across the contour; no single loud event |

**Node levels.** The `nodes` line lists each layer's peak. A node at 0.00 is dead. A layer whose peak times its gain in `out` is 20x below the others is inaudible: if the brief names that layer, criterion 1 cannot score 3.

**Music.** Check: the detected pulse matches the written tempo (also an automatic check); `verify_music.mjs` lists the strongest pitch classes per bar, so compare them with the chords the description names; loudness and bands rise as intensity rises; the loop seam is clean; each melody instrument's level is close to the others.

State your **confidence** in each sound score: `high` when the measurements settle it, `medium` when the picture and numbers agree but the brief is about character ("menacing", "cute"), `low` when it rests on taste you cannot measure.

## 4. Score

Use the rubric in `docs/quality-bar.md` section 4: five criteria, 0 to 3, with the descriptions given there. Score each criterion from evidence you can point to (a sheet and a row, a measurement, a frame number). When unsure between two scores, give the lower one and say what would raise it.

**Pass rule: every criterion at least 2, and total at least 11 of 15. Any automatic error is a fail.**

Score keys:

| Kind | Keys, in order |
|---|---|
| Sprite that moves | `reads`, `craft`, `motion`, `range`, `ready` |
| Still sprite (tileset, prop, background, interface piece, icon) | `reads`, `craft`, `states`, `range`, `ready` |
| Sound effect, ambience, jingle (`meta.type: 'jingle'`: judged as a one-shot sting, not as a track) | `brief`, `signal`, `shape`, `controls`, `ready` |
| Music | `brief`, `signal`, `structure`, `controls`, `ready` |

## 5. Write the verdict

Return exactly one JSON object, nothing else:

```json
{
  "asset": "knight",
  "kind": "sprite",
  "type": "character",
  "verdict": "fail",
  "automatic": { "errors": 1, "warnings": 2 },
  "scores": { "reads": 3, "craft": 2, "motion": 2, "range": 1, "ready": 3 },
  "total": 11,
  "confidence": "high",
  "required_fixes": [
    "1. \"hair\" (colour control): does nothing when headgear=helmet (S-never-dead; out/knight-variants.png rows 1-3 show no hair). Declare when: { headgear: ['none', 'crown'] } as the checker suggests, or let hair show below the helmet rim; target: node tools/check.mjs knight shows no S-never-dead error.",
    "2. attack clip, frames 2-3 (out/knight-attack.png): the sword tip jumps 6 px between frames with no in-between pose. Add a wind-up frame or ease the swing; target: no frame-to-frame step above 3 px at the tip."
  ],
  "notes": [
    "Non-blocking: the idle loop is calm; a slightly larger breath would read better at 1x."
  ]
}
```

Rules for the verdict:

- `verdict` is `"pass"` or `"fail"`, and follows the pass rule. `total` is the sum of the scores (`null` scores count as 0).
- `confidence` is `"high"`, `"medium"` or `"low"`: how sure you are of the **verdict**, as your lowest confidence across the scores you gave. Sprites are usually `high`. A fail that rests on automatic errors is certain, so it is `high` even when you scored nothing; when you did score sounds as well, still report the lowest confidence of those scores, and say in `notes` which part of the verdict rests on the errors.
- `required_fixes` is empty on a pass and never empty on a fail. Number them. Each fix has three parts:
  1. **Where:** first words of the fix, the thing the builder changes: the control (`"hair"`), the clip and frame (`attack frame 3`), the part, the tile or layer, or the sound control and setting. A fix copied from a checker error keeps the control or clip the error names at the front; if an error names none (a look-wide problem such as "touches the frame edge"), add the clip and frame it names and the control that causes it.
  2. **Evidence:** what is wrong, with the check name (section 1 of the bar) or the measurement, and the file or sheet that shows it.
  3. **Target:** a change the builder can make and then verify, stated as a result (a number, a pixel distance, a check that passes), not as taste ("make it better"). For a checker error, the target is that the check passes; when the message names a remedy (such as declaring `when`), repeat it.
- **All scores 2 (total 10).** That is a fail with no single broken thing. Write one required fix: the criterion closest to a 3 (the one where you saw the most of the score-3 description), what the score-3 description asks for that is missing, and a check the builder can run to show it (for example: "1. motion, attack clip: the swing reads but has no anticipation; add a wind-up of at least 2 frames before frame 3 so criterion 3 meets 'weight and personality'; target: out/<id>-attack.png shows the blade drawn back before the hit"). One fix is enough: lifting one criterion to 3 makes the total 11.
- One fix per problem. Order them by how much they lower the score, biggest first. At most ten; if there are more, the asset needs a rethink and fix 1 says so.
- `notes` are optional and never block a pass.
