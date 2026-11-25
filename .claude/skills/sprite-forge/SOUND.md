<!-- Part of the sprite-forge skill: how to make a sound effect, ambience loop, jingle or music track for Loadout. -->

# Loadout: make a sound or a piece of music

First do Step 0 of `SKILL.md` (`node .claude/skills/sprite-forge/context.mjs`): the live contracts win over anything below.

A sound is **one JSON file**, `sounds/<id>.json`: a *patch* that says how to synthesise it, with 3 to 7 controls (music up to 10) a visitor can move. The engine renders it in the browser and in Node. The build finds the file by scanning `sounds/`: there is **nothing to register**. Paths and commands are relative to the repository root: `cd` there first.

You cannot hear. The checker measures the sound for you and draws it. Never hand over a patch the checker has not passed, and say plainly in your report that it was verified by measurement, not by ear.

## What is binding

1. **The specification row** for your sound in `bundles/specs/<bundle>.md` (search for `` `<id>` ``): type, role, length, what makes the sound and how it moves, controls, style names, what it pairs with. For music: tempo, key, chords, layers, intensity order, lengths, default instrument.
2. **`docs/style-guide.md`** §11 (house sound, standard controls, styles, pairing), §12 (music), §13 (metadata). The specification wins where they disagree.
3. `docs/quality-bar.md` §2 and §3 (what the checker and reviewer test).
4. **Craft, not rules:** `docs/craft/sounds.md` for effects, ambience and jingles (layers, the first 10 ms, size and material, judging a sound you cannot hear, per-kind advice, checklist §8) and `docs/craft/music.md` for tracks (the hook, phrases, one peak, question and answer, intensity layers, loop turns, per-moment advice, checklist §15). Read the one for your asset before you build. Where it and a rule document disagree, the rule wins (each guide lists those places).

## Two layers: the framework and your sound (Contract 11)

`docs/architecture.md` Contract 11 and `SKILL.md` ("Two layers") apply to sounds too. A patch holds only what is particular to this sound. When the engine lacks something generic, **add it to the framework, not to your patch**:

- **A node type or an expression function** the engine lacks: `sound/sfx-engine.js`, a new entry at the **end** of `NODE_TYPES` (with its `doc` and field docs, like its neighbours) or of `FUNCS`. A new function name becomes a reserved word, so first check no existing patch uses it as a control or node id (`grep -l '"<name>"' sounds/*.json`).
- **A music building block** (a voice, a drum, a fill, a measurement): a new export at the **end** of `tools/compose/kit.mjs`.
- The rules are those of `SKILL.md`: tests first (`tests/unit/engine-sound-<topic>.test.mjs` or `compose-kit-<topic>.test.mjs`), additive only, re-read the file right before editing, a one-line doc comment with the arguments, and a line in your report.
- **Prove every existing sound renders the same**: before your first edit and after, fingerprint every patch (about 20 s), then `diff out/sounds-before.txt out/sounds-after.txt` must print nothing except your new sound:

  ```
mkdir -p out && node --input-type=module -e "
import fs from 'node:fs'; import crypto from 'node:crypto'; import { renderPatch } from './sound/sfx-engine.js';
for (const f of fs.readdirSync('sounds').filter((f) => f.endsWith('.json')).sort()) {
  const r = renderPatch(JSON.parse(fs.readFileSync('sounds/' + f, 'utf8')), { seed: 1 });
  console.log(f, crypto.createHash('sha1').update(Buffer.from(r.samples.buffer)).digest('hex').slice(0, 12));
}" > out/sounds-<before|after>.txt
  ```

## Steps

1. **Restate the brief as sound**, one sentence each: what makes it, how long, how pitch moves, how loudness moves, how bright, which layers (body, character, transient).
2. **Check the fit.** Synthesis is good at stylised, abstract and mechanical sounds (interface, arcade, sci-fi, impacts, whooshes, bells, engines, wind, fire, water) and synthesiser music. It is poor at voices, animals, speech and photoreal foley. If the brief needs one of those, say so and make the nearest stylised version.
3. **Start from the nearest file** in `sounds/` (read one before you write your first): `coin-pickup`, `jump`, `laser-shot`, `punch`, `explosion`, `metal-hit`, `whoosh`, `footstep-gravel`, `magic-spell`, `fire`, `wind`; for music `tools/compose/thornwood_overworld.mjs` (never `battle_theme.py`).
4. **Write `sounds/<id>.json`.**
5. **Check:** `node tools/sfx.mjs check sounds/<id>.json --no-cache`. Under a second for an effect; **about 6 CPU-minutes for a music track** (it renders every control's ends; run it in the background). Fix every ERROR, read every WARN and NOTE ("Reading the checker").
6. **Look:** `mkdir -p out && node tools/sfx.mjs render sounds/<id>.json --png out/<id>.png` and open the PNG with the Read tool. Top: waveform. Bottom: spectrogram, 40 Hz at the bottom to 20 kHz at the top (log), time left to right. Also render each style (`--preset "<Style name>"`) and any control end you doubt (`--set <id>=<value>`).
7. **Iterate** until every measurement matches step 1. Two to four rounds is normal.
8. Tick "Before you ask for review", then report.

Do not edit `sound/`, `quality/`, `tools/` or another asset.

## The patch

This passes the checker with no warnings:

```json
{
  "format": "sfxpatch/0.1",
  "id": "hop-blip",
  "name": "Hop blip",
  "category": "movement",
  "description": "A rising, buzzy blip with a soft click, for small jumps. Change its pitch, rise, length, brightness and grit.",
  "meta": { "type": "sfx", "role": "actions/jump", "themes": ["fantasy", "neutral"], "gameTypes": ["platformer", "arcade"],
    "words": ["jump", "hop", "bounce", "blip", "boing", "leap", "spring"], "license": "draft" },
  "duration": "length + 0.02",
  "params": [
    { "id": "pitch", "label": "Pitch", "unit": "Hz", "min": 200, "max": 1200, "default": 420, "scale": "log" },
    { "id": "rise", "label": "Rise", "unit": "semitones", "min": 3, "max": 19, "default": 12 },
    { "id": "length", "label": "Length", "unit": "s", "min": 0.08, "max": 0.4, "default": 0.16, "scale": "log" },
    { "id": "bright", "label": "Brightness", "min": 0, "max": 1, "default": 0.5 },
    { "id": "grit", "label": "Grit", "min": 0, "max": 1, "default": 0.2 }
  ],
  "nodes": [
    { "id": "sweep", "type": "env", "points": [[0, "pitch * rnd(0.97, 1.03)"], ["length * 0.7", "pitch * semi(rise)", "exp"]] },
    { "id": "body", "type": "osc", "wave": "square", "freq": "sweep" },
    { "id": "tone", "type": "filter", "mode": "lp", "in": "body", "freq": "800 + bright * 7000" },
    { "id": "amp", "type": "ad", "attack": 0.002, "decay": "length", "curve": 1.8 },
    { "id": "hiss", "type": "noise" },
    { "id": "click", "type": "ad", "attack": 0.0005, "decay": 0.02, "curve": 3 },
    { "id": "dirty", "type": "shaper", "in": "tone + hiss * grit * 0.3", "drive": "1 + grit * 8", "mode": "fold" }
  ],
  "out": "dirty * amp + hiss * click * 0.3",
  "presets": { "Tiny hop": { "pitch": 700, "rise": 7, "length": 0.1 }, "Big leap": { "pitch": 300, "rise": 17, "length": 0.3, "bright": 0.7 } }
}
```

- `id`: lowercase with hyphens, the file name. `name`: two or three everyday words. `description`: one sentence, what it is and what can be changed.
- **Words a visitor reads** (name, description, control labels, choices, style names) are everyday words for people who make games but do not program synthesizers: what is heard, not how it is made. "Ringing metal", not "modal resonator"; "a soft pure tone", not "a sine with a little FM"; "deep", not "80 Hz". No units (Hz, dB, ms, bpm, octaves, semitones), no synth parts (sine, saw, pulse width, filter, noise, reverb, detune, sub) and no music theory (key names, intervals, arpeggio, bars; "Key" and "Tempo" are "Pitch" and "Speed", on a jingle or effect as on a track, so "change the pitch", never "change the key"). The checker's A-words error quotes the word and what to write instead (`TECHNICAL_WORDS` in `quality/sound.js`). Name a control by what it changes, with its low end on the left: "Pitch", "Speed", "Length", "Brightness"; a time per note is "Time between notes", not "Speed". A control that runs both ways from zero and names a move gets a generated version name from its label and a direction word (`soundVersionsOf`, `sound/words.js`): label it "Drop" or "Glide", never "Fall" (the version would read "fall falls", which `tests/unit/versions-sprites.test.mjs` refuses as an echo of its own control). `unit` stays for the code (the pages show a word such as "high" or "fast", never the unit).
- `category` groups it on the site and must be set: `weapon`, `impact`, `pickup`, `movement`, `ui`, `magic`, `vehicle`, `ambience`; `"jingle"` for a jingle; `"music"` for a track (this also allows up to 120 s instead of 30 s).
- `duration`: seconds, a number or an expression of controls, just long enough for the tail. `"loop": true` makes a continuous sound; `duration` is then the loop length.
- `params`: `{ id, label, min, max, default, unit, scale, step, options, hint }`. `"scale": "log"` for frequencies and times. `"step": n` turns a control into a few buttons (`min`, `min + n`, ...); `"options": ["A", "B", ...]` makes named buttons with values `0` to `n - 1` (`min: 0`, `max: n - 1`). Both switch at once instead of gliding. **Never put `step` on a control whose `unit` is `semitones`** (a pitch rise, drop or glide): the page then draws buttons labelled "N semitones", which `tests/e2e/sound-words.spec.mjs` refuses as a unit word; leave it a slider, as `coin-pickup`'s is. Use `step` for counts (notes, layers, repeats).
- `nodes` run in order, once per sample. Each `id` is also the name of its output. Ids are identifiers (letters, digits, `_`), unique across nodes and controls, and **not one of the reserved names**: `t dur sr pi tau rnd sin cos tan abs sqrt floor ceil round sign tanh exp log min max pow clamp mix db midi semi step smooth`. The checker prints `node 'mix': 'mix' is a reserved name` (or `param '...'`). Node type names (`dust`, `noise`, `delay` ...) are not reserved.
- `out` mixes node outputs: one expression (mono) or `["left", "right"]` (stereo). Renders are peak-normalised, so only the balance between layers matters. `"normalize": false` only for loops whose loudness must follow a control, and for music; then the level heard at the defaults, in every style and at both ends of every control must stay at or under 0.95 (A-peak, an error), so lower `gain` until it does.
- `presets` are the **styles**: 2 or 3 (music 3), named exactly as the specification says, because sprites cue them by name. A style can only set declared controls (`preset 'Key': unknown parameter 'notes'` otherwise): a style that needs another note count or an extra layer needs a control for it, usually a stepped one (`{ "id": "notes", "label": "Notes", "min": 2, "max": 3, "default": 3, "step": 1 }`) or a 0-to-1 layer level.

### `meta` (Contract 1, style guide §13)

`{ type, role, themes, gameTypes, words, license: "draft" }` (no `view` on sounds), checked by `catalog/schema.js`, whose message says what to write.

- `type`: `sfx`; `ambience` (must loop); `jingle` (a short sting: also `"category": "jingle"`, no `loop`); `music` (with `"category": "music"`).
- `role` from the specification; it must be in the role tree (`actions/jump`, `items/pickup`, `world/chest`, `interface/click`, `music/battle` ...).
- `themes`: the bundle's world first (`fantasy`, `sci-fi`, `space` ...); interface sounds and anything with no world: `neutral`. `gameTypes`: the bundle's type first, then others it suits (`arcade` for pickups and interface, `shooter` for sci-fi shots).
- `words`: 6 to 14 lowercase words a person would type: what it is and its synonyms, what causes it (`jump`, `open`, `hit`), the game event (`reward`, `game over`), a word for its character (`chiptune`, `creaky`). Not the bundle name or the type.

## The house sound and the standard controls (style guide §11)

| Bundle | Sound | Length and space |
|---|---|---|
| `kit-platformer-fantasy` | Chiptune-leaning: square, pulse, triangle; short noise bursts; simple pitch slides. A jump is a rising blip, a pickup two or three notes | 0.08 to 0.5 s; `space` at most 0.1; only the boss is big |
| `kit-roguelike-thornwood` | Chiptune-leaning like `kit-platformer-fantasy`, but its spec rows may run longer (a gate up to 1.8 s, a howl up to 1.4 s, `space` about 0.1): the spec row wins over this table's lengths | as the spec row says |
| `kit-rpg-fantasy` | Storybook: sine and triangle, `modal` bells and glass, `pluck`, filtered noise for cloth, grass, stone | interface 0.03 to 0.25 s; spells 0.6 to 1.4 s with a tail (`space` 0.15 to 0.3) |
| `kit-roguelite-scifi` | Synthetic and gritty: saw and FM, `crush`, `shaper`, resonant noise sweeps, inharmonic `modal` metal; every shot a click, a body and a thump | shots and hits at most 0.3 s; no reverb on anything that repeats |

A sound shared by two bundles gets one style per bundle.

- **4 to 6 controls**, named for what a listener hears, with these ids where they apply: `pitch` (Pitch, Hz, log), `weight` or `size` (one control that lowers, lengthens and darkens together), `length` (Length, s, log), `bright` (Brightness), `grit` (Grit), `snap` (Snap: how hard the first milliseconds hit), `ring` (Ring, s), `space` (Room, 0 to 0.5), `rise` / `drop` (semitones), `speed` (s or notes per second). Every sound has `length` (or `ring` / `speed` when that sets the length), `bright`, and one of `pitch`, `weight`, `size`; the other one to three are the specification's.
- No volume control. Every slider position gives a usable sound: narrow a range until both ends are good (the checker renders both).
- **Sounds that repeat vary**: footsteps, hits, shots, splats and breaks use `rnd()`, `noise` or `dust`, so two takes differ by more than 0.2 dB. Interface sounds, pickups and jingles are identical every time.
- **Phone speakers**: at least 40% of the energy above 300 Hz **at the default and in every style**; give heavy sounds a mid-range crack. The checker now prints `above 300 Hz N% (at least 40%)` on the `bands` line and for every style, and warns when a style is under; it does not test a single control end (a low `pitch` can fall under with no warning), so measure those ends yourself:

  ```
  node --input-type=module -e "
  import fs from 'node:fs'; import { renderPatch, defaultParams } from './sound/sfx-engine.js'; import { analyze } from './sound/analyze.js';
  const p = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  for (const [name, set] of [['default', {}], ...Object.entries(p.presets || {})]) { const r = renderPatch(p, { seed: 1, params: { ...defaultParams(p), ...set } }), b = analyze(r.samples, r.sampleRate).bands, k = Object.keys(b);
    const up = 1 - b[k[0]] - b[k[1]]; console.log(name.padEnd(16), Math.round(up * 100) + '% above 300 Hz', up >= 0.4 ? 'ok' : 'TOO LOW'); }
  " sounds/<id>.json
  ```
- **Shape**: starts within 5 ms (hits, clicks, shots, steps: attack under 10 ms, crest above 10 dB); has died away by the end; not padded with silence.
- **Ambience**: 4 to 8 s, `"loop": true`, no event so distinctive that the repeat is heard. **Jingle**: 1 to 3 s, a clear tune that ends on the home note, no loop; `meta.type: 'jingle'` and `"category": "jingle"` even when its role is under `music/` (style guide §11 says why).

### Pairing with animation frames

A sprite starts your sound on the first moment of a frame (each clip's `sounds` list in the sprite's data file, `"collect": { ..., "sounds": [{ "sound": "<id>", "frame": 1, "preset": "<style>", "volume": 0.7 }] }`; style guide §11 table). So:

- Put the event at time 0: the hit, the step, the click. No lead-in silence (the checker warns after 30 ms).
- Keep it shorter than the gap to the next cue of the same clip. A walk at 10 fps with footsteps on frames 0 and 4 has 0.4 s between steps; a run at 14 fps has under 0.3 s.
- A sound for a looping clip (a torch's `idle`) is an ambience-style loop; a one-shot clip never takes a loop.
- Loudness between sounds is set only by the cue's `volume`; never try to make a sound quiet inside the patch.
- The style names you write are the ones sprites cue: they must match the specification exactly, including capitals.

## Expressions

Any field marked *sig* or *con* (`node tools/sfx.mjs nodes` prints every field with its kind and default) takes a number or an expression string.

- Names: any control id, any node id (its current output), `t` (seconds), `dur`, `sr`, `pi`, `tau`. Operators: `+ - * / % ^`, comparisons, `&& ||`, `cond ? a : b`.
- Functions: `sin cos tan abs sqrt floor ceil round sign tanh exp log min max pow clamp(x,lo,hi) mix(a,b,t) db(dB) midi(note) semi(semitones) step(edge,x) smooth(e0,e1,x)`, and `rnd(lo, hi)`: a random constant, drawn again for each take (seed).
- *sig* fields may read node outputs and change every sample. *con* fields read controls only: env point times and values, `ad` times, `clock.count` and `clock.delay`, `seq.steps`, `rand.lo`/`hi`, `delay.max` (`node tools/sfx.mjs nodes` marks each). A node output there fails with `... must use parameters only (no node outputs, no t)`. `rnd(lo, hi)` does work inline in a *con* field (`"delay": "rnd(0, 0.03)"`, an env point `"pitch * rnd(0.97, 1.03)"`). To vary a signal from take to take otherwise, add a `rand` node (no `trig`: one value per take) and multiply it into the signal path: `"expr": "body * r"`.
- Wiring is by expression: `"in": "osc1*0.6 + noise*0.2"`. There is no mixer node; a gain is a multiplication.

## Nodes

| Type | Use | Main fields |
|---|---|---|
| `osc` | tones | `wave` sine, tri, saw, square, pulse; `freq`; `pm` (FM, in cycles); `width` 0 to 1 (0.5 = square) |
| `noise` | hiss, air, grit | `color` white, pink, brown |
| `dust` | random impulses: crackle, debris, rain | `density` per second; `spread` |
| `clock` | regular trigger | `rate`; `jitter` 0 to 1; `count` (ticks before it stops); `delay` (s) |
| `env` | any contour: pitch sweeps, swells | `points` [[time, value, curve?]]; curve `"lin"`, `"exp"` (pitch sweeps), `"hold"` or a number; `trig` |
| `ad` | attack and decay, 0 to 1 to 0 | `attack`; `hold`; `decay`; `curve`; `trig` |
| `seq` | note sequences, chord roots | `steps` [...] or `"0 _ 3 _"`; `rate` or `trig`; `every`; `loop` |
| `pattern` | drum-machine row on a clock | `trig`; `steps` `"X..x..o."`; `every` |
| `rand`, `sah` | new random value per trigger; sample and hold | `lo`, `hi`, `trig`; `in`, `trig` |
| `filter` | tone shaping | `mode` lp, hp, bp, notch; `in`; `freq`; `q` |
| `delay` | echo, flange, comb | `in`; `time`; `feedback`; `mix`; `max` |
| `pluck` | strings, twangs, pings | `freq`; `decay`; `damp`; `trig` |
| `modal` | struck bell, metal, glass, wood | `in` (a click or noise burst); `freq`; `ratios`; `decay` (to -60 dB); `tilt` |
| `shaper` | distortion | `in`; `drive`; `mode` tanh, clip, fold |
| `crush` | lo-fi grit | `in`; `bits`; `rate` |
| `reverb` | room, tail | `in`; `size`; `damp`; `mix` |
| `lag` | smoothing, slow random motion | `in`; `time` |
| `expr` | name a sub-mix | `expr` |

Without `trig`, `ad`, `env`, `rand` and `pluck` fire once at time 0; with `trig` they wait for each rising edge. For a second event later, give it its own `{"type": "clock", "rate": 1, "count": 1, "delay": "<seconds>"}` and use that as its `trig`. `noise` and `dust` have no `trig` and run from time 0: a layer of them that starts late is multiplied by an `ad` triggered by such a delayed clock (`"out": "... + debris * debrisGate"`).

## Recipes

Layer two or three; one oscillator sounds like a test tone.

- **Zap, laser, retro jump:** saw, square or pulse `osc` whose `freq` is an `env` falling (laser) or rising (jump) with `"exp"`; `ad` amplitude; a 20 to 30 ms `noise` click at the start.
- **Impact, punch, thud:** sine falling from about 200 Hz to 60 Hz in 50 ms (weight); band-passed `noise` burst, 1 to 4 kHz, 20 to 60 ms (slap); `shaper` over the sum.
- **Explosion:** the impact stretched to 1 to 3 s; low-passed `noise` whose cutoff falls from several kHz to a few hundred Hz; brown noise rumble; `dust` through a band-pass for debris.
- **Coin, pickup, confirm:** `clock` with `count` 2 to 4 → `seq` of notes (`semi()`) → square or triangle `osc`; `ad` triggered by the clock. Rising intervals read as good, falling as bad.
- **Bell, metal, glass, wood:** a 2 to 20 ms noise burst into `modal`. Ratios `[1,2,3,4]` are pitched; `[1,2.76,5.4,8.93]` is a bell or bar; low pitch with `decay` 0.03 to 0.1 s is wood. Read the modal node's peak in the checker and scale it by about 1/peak in `out`. The audible ring is about half of `decay`: budget `decay*0.6` in `duration`.
- **Whoosh, swing, dash:** `noise` → band-pass `filter` whose `freq` follows a rise-and-fall `env`; the same `env` as amplitude.
- **Footsteps, cloth, gravel:** `dust` (200 to 2000 per second) under a short `env`, through a band-pass; a quiet low sine thump; `rnd()` so takes differ.
- **Magic, sparkle:** fast jittered `clock` → `rand` → sine at harmonic multiples of a gliding base → short `ad` → `reverb`.
- **Engine:** saw at `rpm/30` Hz plus a pulse at half; noise times the saw; a low-pass that opens with throttle; `shaper`. Loop, `"normalize": false`.
- **Wind, fire, rain, water:** filtered `noise`; slow random motion from `clock` → `rand` → `lag`; `dust` for crackle or drops. Loop. A periodic wobble joins best when it completes whole cycles in `duration`; with `"normalize": false` aim for a raw peak of 0.4 to 0.7 at the loudest setting.
- **Alarm, buzzer, error:** square or saw, two alternating pitches from a looping `seq`, or two oscillators a semitone apart.

## Music

A track is a patch with `"category": "music"` and `meta.type: "music"`, **written by a generator script on the music kit** `tools/compose/kit.mjs`: read its header (it shows a whole tiny piece) and the worked example `tools/compose/thornwood_overworld.mjs`. The kit supplies the 16th-note clock, the chords, the bar counter and the section gates behind `bars` and `intensity`, drum and note rows, melodies in note names, the ten level-matched melody instruments behind `inst` (and `along`, a second voice that plays the chords, the bass or a plain drum beat under the tune), the bus with ducking, room and limiter, and `assemble`, which writes the standard controls and refuses rows that do not divide the loop. You write the music: chords, tune, drum rows, the voice of each layer, the mix. Some kit calls are still in review: take them from the file, not from memory.

- Specs now name a **band** (`band(name)`, `B.drums / bass / chords / lead / room / defaults`, `docs/music-styles.md`): copy the nearest band's generator (`menu_<band>.mjs`) as the template, not `thornwood_overworld.mjs`. Copy it to `tools/compose/<id_with_underscores>.mjs` as your template. **Never start from `battle_theme.py`**: it predates the kit.
- `node tools/compose/<file>.mjs --match` prints the sixteen gains that level the ten instruments and set the six that play along (Guitar, Piano, Violin, Trumpet, Bass, Drums) (paste them in; a run takes about two minutes); `--measure` prints instrument, section and intensity levels; with no flag it writes `sounds/<id>.json`. `--out <file>` and `--dry` exist: write drafts to a scratch file with `--out` and only the final version into `sounds/`. `node tools/compose/kit.mjs measure sounds/<id>.json` measures any track.
- Pure composing functions are moving to `sound/compose.js`; the kit re-exports them, so keep importing from `kit.mjs`. What the kit lacks, add to it (Contract 11), not to your generator.
- Timing: a track renders at about 1.8 to 2.4 times real time; `--measure` and the checker take minutes.

**Fixed controls (style guide §12), at most 11 in all (the standard nine and at most two of the track's own, `alongLevel` included):**

| id | Label | Range | Notes |
|---|---|---|---|
| `intensity` | Intensity | 0 to 1 | Brings layers in in the specification's order; still music at 0, everything at 1 |
| `bpm` | Speed | the specification's range, `"unit": "bpm"` | The default is the written tempo the checker compares with; the label says Speed, not Tempo |
| `key` | Pitch | -5 to 6, `"unit": "semitones"` | Transposes everything; the label says Pitch, not Key |
| `bars` | Length | `"min": 8, "max": 32, "step": 8, "unit": "bars"` | 8, 16, 24 or 32 bars; default from the specification |
| `inst` | Melody instrument | `"min": 0, "max": 9, "options": ["Synth lead", "Flute", "Chiptune", "Bell", "Plucked string", "Guitar", "Piano", "Violin", "Trumpet", "Bass"]` | Exactly these ten, in this order (the last five were appended on 2026-11-22 by the owner's decision); default from the specification |
| `along` | Plays along | `"min": 0, "max": 6, "options": ["None", "Guitar", "Piano", "Violin", "Trumpet", "Bass", "Drums"]` | Exactly these seven (Drums added 2026-11-23, along only), default None; `assemble` writes it after `inst`, and a track's own controls are at most two |
| `alongLevel` | Plays along volume | `0` to `1`, default `0.6` | `assemble` writes it (after your `lead` slider if you have one); at most 11 controls in all |
| `bright` | Brightness | 0 to 1 | |
| `space` | Room | 0 to 0.5 | |
| one or two more | | | the specification's (`lead` melody level, `grit`, `swing`) |

What the kit does not decide for you:

- **Arrangement:** layers enter in the specification's intensity order and, for longer lengths, section by section; the 8-bar version is the full band, a long version is never the short one repeated, and 32 bars at the lowest tempo stays under 120 s.
- **Stereo and mix:** kick, bass and snare identical in both channels; spread chord tones, detuned copies and echoes. Bass and kick lower than feels natural; aim for a raw peak of 0.7 to 0.9.
- **Writing:** the chords the specification writes are the chords the checker must find per bar; the melody is a 2- or 4-bar phrase that returns, mostly steps, one leap; original, never borrowed (style guide §13).

**Verify by measurement:**

- `node tools/sfx.mjs check sounds/<id>.json` (about 6 CPU-minutes): detected pulse within 2 bpm of the written tempo (half or double also pass), loop seam, length and instrument controls found.
- `node tools/compose/verify_music.mjs sounds/<id>.json <bars> intensity`: `<bars>` is your `bars` default; it lists the strongest pitch classes per bar (compare with your chords) and the loudness and bands at five intensity settings (they should rise).
- `node tools/compose/render_ramp.mjs sounds/<id>.json intensity out/<id>-ramp.wav` renders the loop several times with intensity climbing, as a game drives it.

Limits: synthesiser music only (chiptune, electronic, synthwave, arcade, "synth orchestra"); no real instruments or vocals.

## Reading the checker

`check` renders the patch at its defaults, at both ends of every control, with a second seed and with every style, and prints:

| Line | What to look for |
|---|---|
| ERROR | Must be fixed: a validator problem, `meta`, silence, non-finite output, a control that changes nothing or is silent at an end, a silent style, a loop seam that clicks, an ambience that does not loop, a jingle that loops, and for music: tempo, length or instrument control |
| `loudness` | 32 steps over time. A one-shot starts at or near the top in the first step or two and falls away; ending high means cut off (warns) |
| `timing` | attack (today: time from the first sound to the loudest moment, so a sound that builds on purpose reads slow, and that is fine; hits under 10 ms), sounding length, end level (below about -30 dB for one-shots). A warning about silence at the end: shorten `duration` by that much |
| `spectrum` | brightness and strongest frequency at start, middle, end: a falling laser shows falling numbers |
| `bands` | energy per band; over 60% below 80 Hz warns; you want 40% or more above 300 Hz |
| `nodes` | peak of every node: 0.00 is a dead layer; a layer 20 times quieter than the rest (peak times its gain in `out`) is inaudible |
| `styles` | one line per style: length, share above 300 Hz, onset, crest, end level, raw peak. Read it for the phone-speaker rule |
| `params` | change between each control's ends. A control that changes notes or timing prints `heard as timing: note starts move N ms` (10 or more is heard) instead of the 1.5 dB warning. Under 1.5 dB warns ("little audible effect"): widen the range, raise that layer, or drop the control. A slow vibrato or tremolo scores low even when audible: compare renders of both ends |
| `variation` | seed 1 against seed 2: above 0.2 dB for sounds that repeat, 0.0 for interface, pickups and jingles |

Other commands: `render <patch> -o out/<id>.wav` writes a WAV; `--set id=value`, `--preset "<Style>"` and `--seed n` choose what to render; `render <patch>` alone prints the measurements as JSON; `node tools/sfx.mjs nodes` prints every node field. `check` takes several files and `--json`.

## Common mistakes

- A node output in a *con* field (`ad.decay`, env point times, `seq.steps`).
- A node that reads a node defined later gets last sample's value: order nodes source to processor.
- An `ad` or `env` with a `trig` waits for it: if it is silent, check the trigger node's peak.
- `delay.feedback` or `filter.q` that blows up at a control end ("blows up").
- DC from pulse waves or asymmetric shaping: finish with a `filter` in `hp` mode at 30 Hz.
- A reverb or delay tail cut off by `duration`: add the tail.
- Everything in one band: a convincing effect has a low body, a mid character and a high transient.

## Before you ask for review

1. `node tools/sfx.mjs check sounds/<id>.json`: zero errors, every warning read and fixed or explained.
2. Type, role, length, controls (ids and labels) and style names are exactly the specification's.
3. The picture and the numbers match your step 1 sentences (pitch direction, length, layers in `nodes`, bands).
4. Each style rendered (`--preset`) and looked at; for music, `verify_music.mjs` run and its chords compared with the specification's.
5. `meta` passes; the words are what a person would type.

## Report

Say: the file; its controls and what each does; its styles; the checker's final lines (warnings and why they remain); the measurements that show it matches the brief (attack, length, spectrum direction, variation; for music the detected tempo, the chords found per bar and the intensity ramp); what the specification got wrong or left open and what you decided; anything this skill or a helper got wrong or lacked, quoting the line; and plainly that it was verified by measurement, not by ear, so a person should listen before it ships.


## Lessons from the Cloudreach and Thornwood kits (2026-11-25)

- **A steady tonal loop needs `"wrap": true`.** The default loop seam is an equal-power crossfade over 0.3 s, which bumps a hum or drone by up to 3 dB at every repeat. Write `"wrap": true` and let every tone complete whole cycles in `duration`, not only the wobble.
- **The standard control set has one exception:** a named stand-in such as `grit` may replace `bright` (style guide §10); a row that says so is right.
- **Music tempo check:** a sparse piece with empty beats 2 and 4 can lock to the wrong tempo (68.5 bpm once), and `pulse()` never reports 50 bpm because its scan starts there, so half of 100 cannot pass. A clock `on: 8` gives a lilt on pieces written in 8ths. The per-bar chord read uses one window per bar, so a note on beat 1 barely counts there.
- **Audible check:** every sound so far was verified by measurement, never by ear. Say so in the report, and ask the owner to listen before it ships.
