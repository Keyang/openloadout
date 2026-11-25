# Craft: what makes a game sound good

This is a teaching document for makers and reviewers of Loadout sound effects, ambience loops and jingles. Music tracks have their own guide (`docs/craft/music.md`).

The other documents are rules to pass: `.claude/skills/sprite-forge/SOUND.md` (how to write a patch), `docs/style-guide.md` section 11 (house sound, controls, pairing), `docs/quality-bar.md` sections 2 to 4 (checker and rubric), `docs/review-protocol.md` section 3 (judging without hearing). This one explains **why** a sound works in a game, and how to get there with a Loadout patch. Where this document and a rule disagree, the rule wins, and the disagreement is listed in section 9 for the owner.

Three things to know before reading:

- **Nobody has listened to any Loadout sound yet.** Every claim here of the form "measure X, it means the sound is good" is a proxy taken from how sound designers describe their work. None has been checked against a human ear in this project. Treat them as the best available guess and say so in reports.
- Numbers come from the sources listed at the end. A number marked *(rule of thumb)* is common practice or general acoustics that I could not tie to one cited page.
- Patch field names and node types were checked against `node tools/sfx.mjs nodes` on 2026-11-25. If a name here is not in that list, the list is right.

Contents:

1. What a game sound is for
2. The principles (layers, attack, size and material, readability, repetition, loudness and phones, timing, reward and danger)
3. From principle to patch
4. Judging a sound you cannot hear
5. Kind by kind
6. Families: one game, one voice
7. Retro and chiptune conventions
8. One-page checklist for maker and reviewer
9. Where best practice and Loadout rules disagree
10. Sources

---

## 1. What a game sound is for

A film sound is heard once, in a mix someone balanced by hand. A game sound is heard hundreds of times, on top of music and twenty other sounds, in an order nobody planned, often through a phone speaker. That changes what "good" means.

A good game sound does four jobs, in this order:

1. **It tells the player something.** A hit landed. The coin was collected. The enemy is about to attack. The Overwatch audio team set themselves the goal that the game could be played by sound alone, and built every sound to carry gameplay information first (GDC 2016 talk; sources 14 to 16). If the sound carries no information, the game is better without it. Microsoft's interface guidance says the same: use a sound only when it has a clear benefit (source 1).
2. **It is told apart from every other sound in the game** within about a tenth of a second, while other sounds play.
3. **It survives being repeated.** The sounds heard most (steps, hits, menu moves, pickups) are the ones that become irritating first (source 27). The more often a sound plays, the less it should stick out (source 1).
4. **It feels good.** Weight, snap, sparkle. This comes last because a sound that feels great but fails 1 to 3 hurts the game.

A Loadout sound has one more job that a studio sound does not: **every slider position must be a usable sound**, because a visitor remixes it. So each principle below has to hold across the range of the controls, not only at the default.

---

## 2. The principles

### 2.1 Three layers: transient, body, tail

Almost every designer describes a one-shot sound as a stack of three parts (sources 6, 29, 30):

| Layer | What it is | What it tells the player | Typical length |
|---|---|---|---|
| **Transient** | The first few milliseconds: a click, crack, tick | *When* it happened, and how hard. This is the "punch" | 1 to 20 ms |
| **Body** | The main tone or noise | *What* it is: its size, material and weight | 30 to 300 ms |
| **Tail** | What is left ringing or fading | The space around it, and how big the event was | 0 to 1 s or more |

What follows from this:

- **Punch is in the front, not in the volume.** A blast feels powerful because of the sharp crack at its start, not because it is loud or bassy (source 30). A hit with no transient reads as a soft push.
- **Each layer sits in its own part of the spectrum.** A low body, a middle character, a high transient. Three layers in the same band sound like one muddy layer. Loadout's own "Common mistakes" list says the same.
- **Layers can start a few milliseconds apart.** Weapon designers shift layers by a few milliseconds so the peaks do not pile into one spike, which also changes how big the sound feels (source 6). The transient still goes at time 0. *(Rule of thumb: sounds that start within about 30 ms of each other fuse into one event for the ear; beyond that they start to read as two.)*
- **The tail is the cheapest part to cut.** In a busy game, tails pile up and smear the mix. Fast, frequent sounds get almost no tail. The game can add room later; it cannot remove a tail that is baked in.
- A sound with **one oscillator and one envelope sounds like a test tone**. Two or three layers is the floor.

### 2.2 The first 10 milliseconds

The ear locks on to the start of a sound. Two rules:

- **No silence before the event.** Even a few milliseconds of dead air at the start of a file makes the action feel late (source 29). Research on picture and sound says people notice sound that arrives about 45 ms early or about 125 ms late (ITU-R BT.1359, source 25), and a game already adds its own delay, so the patch must add none.
- **How fast the level rises says how hard the thing is.** Under 2 ms: metal, glass, a click. 2 to 10 ms: wood, a fist, a footstep. 10 to 50 ms: something soft or a "puff". Over 50 ms: a swell, a whoosh, a voice. *(Rule of thumb.)* Pick the rise time on purpose; do not leave every envelope at its default.

**Anticipation** is the exception. A sword swing, a charge-up or a creature's intake of breath starts soft and builds, so that the hit after it lands harder. God of War's axe was described as a heavy slam that ends in a high slash (source 39). In Loadout these are two sounds on two frames (swing on frame 3, impact on frame 4), not one patch with a slow start.

### 2.3 Pitch, brightness and length say size, material and weight

Players read physical facts from a sound without thinking:

| The player hears | They conclude |
|---|---|
| Lower pitch, longer, darker | Bigger, heavier |
| Higher pitch, shorter, brighter | Smaller, lighter, faster |
| Pitch falling | Losing energy: dropping, dying, powering down, failure |
| Pitch rising | Gaining energy: jumping, charging, reward, success |
| Harmonic overtones (whole-number ratios) | A tuned thing: a string, a bell tuned on purpose, a voice |
| Inharmonic overtones | Metal, glass, a struck bar |
| Short ring (30 to 100 ms), low | Wood, plastic |
| Long ring, bright | Metal, glass, crystal |
| Noise with no pitch | Air, cloth, sand, fire, water, debris |
| Rough, buzzing, wobbling tone | Aggressive, large, dangerous |

Two findings worth knowing:

- For voices, **the resonances of the throat tell size more reliably than the pitch does** (studies on body size and voice; source 23). A big creature is a low pitch *and* low, close-together resonant bands. Lowering only the oscillator gives "a small thing singing low".
- **Roughness makes a voice sound larger and more aggressive.** Adding fast wobble in level, a second tone below the main one, or noisy chaos to a call lowered its perceived pitch and made the caller sound bigger and more threatening (Anikin and colleagues 2021, source 23).

This is why Loadout's `weight` and `size` controls move pitch, length and brightness together: the three cues must agree, or the sound reads as a mistake.

### 2.4 Readability in a busy mix

The Overwatch team's working rules, as reported from their talk (sources 14 to 16):

- **Every important thing has its own sound signature.** Each hero's footsteps are different enough to recognise.
- **Danger is louder and clearer than safety.** Enemy footsteps are mixed above friendly ones; the most threatening sound wins.
- **Sound carries state.** A healing beam rises in pitch as the target's health fills.
- **Players learn sounds like reflexes**, so a sound's meaning must never change.
- **Enemy sounds are built to differ from the player's own** version of the same action (source 34). Hollow Knight's composer likewise speaks of giving each enemy and attack type its own sound (source 38).

For one sound in a kit, that means:

- **Give it a slot.** Decide which band it owns, and keep it out of the bands its neighbours own. A workable map for a small game *(rule of thumb)*:

  | Band | Who lives there |
  |---|---|
  | Below 150 Hz | Explosions, boss slams, rumble. Little else. Phones cannot play it |
  | 150 to 500 Hz | Body of hits, steps, doors, big creatures |
  | 500 Hz to 2 kHz | Voices, player actions (jump, dash), interface tones, the "character" of most sounds |
  | 2 to 5 kHz | Transients, clicks, pickups, danger cues. The ear is most sensitive here, so it cuts through and also tires fastest |
  | Above 5 kHz | Sparkle, air, hiss, glass. Decoration |

- **Make its shape in time different from its neighbours.** A pickup is two quick notes; a hit is one spike; a door is a slow scrape. Two sounds can share a band if their rhythm differs.
- **Leave room.** Non-player and background sounds stay out of the lowest band and get less detail, so the player's own actions stay clear (source 6).

### 2.5 Repetition: vary what repeats, fix what signals

- **Sounds made by the world vary.** Steps, hits, shots, splats, breaks. Studios keep several recordings of each and also nudge pitch and level at random on every play. A common safe range for pure variation is up to about two semitones; more than that starts to sound like a different object or a moving one (sources 5, 6, 8). Too much variation is also a failure: the player can no longer tell it is the same thing.
- **Sounds that are signals do not vary.** Interface clicks, pickups and jingles mean one thing each and should be the same every time, like a word.
- **Vary the body, keep the transient.** The click at the front is what the player's hands sync to; the body's pitch and colour can drift.
- **Rising pitch across a streak** is the standard reward trick: each coin or hit in a chain plays a step higher, one semitone per step being a natural size (source 8). Cap it, or a long streak turns shrill.

### 2.6 Loudness, fatigue and small speakers

- **Peak level is not loudness.** Two sounds with the same peak can differ by 10 dB or more in how loud they seem, because one is a thin spike and the other a thick slab. What the ear follows is closer to the average level. Game loudness standards are written in loudness units for this reason: about -24 for consoles and about -18 (Sony, ITU) or -16 (Meta) for handhelds, measured over the whole mix (sources 19 to 21).
- **Mobile mixes use a narrow range between quiet and loud**, because the room is noisy and the speaker is weak (source 11).
- **A phone speaker plays roughly 500 Hz to 10 kHz.** One measured phone fell away quickly below about 600 Hz (source 4); other sources put the bottom at 200 to 400 Hz (sources 18, 37). So a low sound must carry its message higher up: add overtones with gentle distortion, add a click, or double it an octave or two up. The ear rebuilds a missing low note from its overtones (source 4).
- **Phones are close to mono.** Anything that only exists as a left-right difference disappears.
- **What tires people:** the same sound again and again; constant level with no quiet; lots of energy between 2 and 5 kHz; harsh or buzzing sounds played often (sources 1, 27). Decorative sounds should play less often than useful ones (source 31). Frequent sounds should be softer, shorter and rounder than rare ones.

### 2.7 Timing with the picture

A sound is believed when it lands on the frame where the thing happens. The event goes at time 0 of the patch; the sprite cue chooses the frame. The sound must be over before the next cue of the same clip (a run cycle leaves under 0.3 s between steps). A sound for something slow (a gate, a door, a charge) should have its key moment (the clunk, the release) at a time the animation can match, and a control that moves that moment.

### 2.8 Good news and bad news: reward and danger

Players learn a game's sounds as signals, and two signals matter most.

**Reward** is rising, consonant, bright and brief: upward steps, notes of one major chord, a ring on the last note, energy in 800 Hz to 3 kHz. Bigger rewards get more notes, more ring and more sparkle, not more volume (5.4, 5.12).

**Danger** has been studied for alarms. Faster pulses, higher pitch and overtones that are not whole-number multiples each make a warning sound more urgent, and the amounts can be measured and stacked (Hellier, Edworthy and Dennis; source 24). Speed of repetition is the strongest lever in that line of work, and an uneven rhythm sounds less urgent than a regular one. Add what 2.3 says about roughness and falling pitch, and a danger cue is:

| Cue | Shape |
|---|---|
| Enemy alert, "it has seen you" | One short, sharp, rising or high event with a hard front, in 1 to 4 kHz, unlike anything friendly in the kit |
| Wind-up, "an attack is coming" | A short build (0.2 to 0.6 s) that rises or tightens and ends exactly where the hit lands |
| Low health, timer running out | A regular pulse. Urgency by rate: about 1 to 2 pulses a second is a reminder, 3 to 4 is urgent, faster is panic *(rule of thumb)*. Low or middle pitch, soft front, so it can loop for a minute without hurting |
| Alarm | Two alternating pitches or a rising sweep, slightly inharmonic or detuned |
| Failure, damage taken | Falling pitch, a sour step (one or six semitones), rough |

The trap is fatigue: the most urgent sound is also the most tiring, and a low-health loop may play for minutes. Make the *state* cue soft and regular and save the harsh version for the one-shot *event* (the alert, the hit). In a patch: a looping `clock` or `seq` for the pulse with a control for its rate (use `wrap` and whole pulses per loop, 3.6); `osc` pairs a semitone apart or `modal` with inharmonic `ratios` for sourness; `shaper` in `fold` mode for a rough edge. **Self-check for a danger loop:** the `pulse` line finds the rate you wrote; contour steps repeat evenly; centroid under about 2 kHz for a state loop and above it for an alert; an alert has onset under 2 ms and crest above 12 dB; reward and danger sounds of one kit never share both band and direction.

---

## 3. From principle to patch

How each principle becomes nodes, envelopes and controls.

### 3.1 Layers

A verified three-layer hit (checked on 2026-11-25: passes with no warnings; default 0.21 s, onset 0.1 ms, crest 13.5 dB, 75% above 300 Hz, takes differ by 2.0 dB):

```json
"duration": "length * (0.7 + weight * 0.6) + 0.03",
"nodes": [
  { "id": "n", "type": "noise" },
  { "id": "tickAmp", "type": "ad", "attack": 0.0003, "decay": 0.012, "curve": 3 },
  { "id": "tick", "type": "filter", "mode": "hp", "in": "n * tickAmp", "freq": "2500 + bright * 3000" },
  { "id": "drop", "type": "env", "points": [[0, "(240 - weight * 90) * rnd(0.94, 1.06)"], [0.05, "90 - weight * 35", "exp"]] },
  { "id": "thud", "type": "osc", "wave": "sine", "freq": "drop" },
  { "id": "thudAmp", "type": "ad", "attack": 0.001, "decay": "length * (0.7 + weight * 0.6)", "curve": 2.5 },
  { "id": "slapAmp", "type": "ad", "attack": 0.001, "decay": "0.04 + length * 0.3", "curve": 2 },
  { "id": "slap", "type": "filter", "mode": "bp", "in": "n * slapAmp", "freq": "(900 + bright * 2200) * rnd(0.9, 1.1)", "q": 0.9 },
  { "id": "knock", "type": "osc", "wave": "tri", "freq": "drop * 4.1" },
  { "id": "knockAmp", "type": "ad", "attack": 0.001, "decay": "length * (0.5 + weight * 0.5)", "curve": 2.2 },
  { "id": "sat", "type": "shaper", "in": "thud * thudAmp * (0.5 - weight * 0.2) + knock * knockAmp * (0.55 + weight * 0.5) + slap * 2.4", "drive": "1.5 + weight * 2.5", "mode": "tanh" },
  { "id": "clean", "type": "filter", "mode": "hp", "in": "sat + tick * (0.25 + snap * 1.2)", "freq": 30 }
],
"out": "clean"
```

Read it as the three layers:

- `tick`: the **transient**. White noise, high-passed, 12 ms. `snap` sets its level. It is added *after* the `shaper`, so distortion does not flatten it.
- `thud` + `knock` + `slap`: the **body**. A falling sine for weight (below 250 Hz), a triangle about two octaves up for the part a phone can play, band-passed noise for the "slap" of the surface.
- The **tail** is only the decay of `thudAmp`. A hit that repeats needs no more.

How it got there is the lesson. The first draft had only `tick`, `thud` and `slap`, and looked right on paper. It measured **3% of its energy above 300 Hz**: a phone would have played a faint tick and nothing else. Raising the noise got it to 26%. Only adding `knock`, a body layer in the 300 Hz to 1 kHz band that lasts as long as the thud, and making the low sine *quieter* as `weight` rises, got the default to 75% and the heavy style to 41%. A heavy sound is made heavy by its length, its falling pitch and its lower-middle body, not by pouring energy below 100 Hz.

General mapping:

| Layer | Nodes | Envelope |
|---|---|---|
| Transient: click | `noise` × `ad` (attack 0.0002 to 0.001, decay 0.003 to 0.02, curve 2 to 3) → `filter` hp or bp | The shortest in the patch |
| Transient: pitched tick | `osc` whose `freq` is an `env` falling an octave or more in 5 to 15 ms | `ad` decay 0.01 to 0.03 |
| Transient: struck object | a 2 to 20 ms noise burst into `modal` | `modal.decay` sets the ring |
| Body: tone | `osc` (sine, tri, square, pulse, saw), `pluck`, `modal` | `ad` or a 3 to 5 point `env` |
| Body: noise | `noise` → `filter` bp or lp; `dust` → `filter` for grains | `ad` or `env` |
| Body: grit | `shaper` (tanh warm, clip hard, fold buzzy), `crush` | none |
| Tail: ring | long `modal.decay`, `pluck.decay`, a slow `ad` | `curve` 2 to 4 |
| Tail: space | `reverb`, `delay` | add its length to `duration` |

Balance is by gain in the `out` expression or in a mixing `expr`. Because renders are peak-normalised, only the balance between layers matters. Read each layer's peak on the checker's `nodes` line and multiply by its gain: a layer 20 times quieter than the loudest is not heard. `modal` and resonant `filter` nodes often peak at 5 to 10; scale them by about 1 over the peak.

### 3.2 Attack and punch

- `ad.attack` is the rise time. Clicks 0.0002 to 0.001 s; bodies 0.001 to 0.005 s; soft things 0.01 to 0.05 s; swells use an `env` with points.
- `ad.curve` shapes the fall: 1 is a straight line (sounds held, then chopped), 2 to 4 falls fast then lingers (sounds struck). Hits want 2.5 to 4.
- A **pitch drop in the first 20 to 60 ms** is the cheapest punch there is: an `env` with `"exp"` from 2 to 4 times the resting pitch down to it. The ear hears it as impact, not as a slide.
- Put the transient **outside** `shaper`, `crush` and `reverb`, as in 3.1. Distortion and room both smear the front edge.
- The `snap` control (0 to 1) should scale the transient's level and can shorten its decay. Check that crest rises as `snap` rises.
- A sound that builds on purpose keeps an instant, quiet start (an `env` whose first point is `[0, 0.2]`, not `[0, 0]`, or a small click) so that the cue still feels on time.

### 3.3 Size, material, weight

- **`weight` / `size` (0 to 1)** multiplies into three places at once: lower the pitch (`pitch * semi(-12 * size)` or a lower `env` target), lengthen the decay (`length * (0.7 + size * 0.6)`), and darken (`filter` lp `freq` falling with size). Then compensate for phones: raise the middle layer as weight rises (3.1).
- **Material with `modal`:** `ratios` `[1, 2, 3, 4]` pitched and friendly; `[1, 2.76, 5.4, 8.93]` bell or bar; add more close inharmonic ratios for a clangy plate. `decay` 0.03 to 0.1 s at a low `freq` is wood; 0.3 to 1.5 s at a high `freq` is glass or metal. `tilt` near 1 makes the top die fast (dull, wooden); near 0.3 keeps it ringing (glassy). Feed it a shorter, brighter burst for a harder striker.
- **Material with `pluck`:** `damp` 0 bright and metallic, 0.9 dull and muted.
- **Material with noise:** white through a high band-pass is sand, gravel, glass dust; pink through a low-pass is cloth, grass; brown is rumble, stone. `dust` `density` sets grain: 20 to 200 per second reads as separate bits (crackle, debris, drips), 200 to 2000 as a texture (gravel, leaves).
- **Throat resonances for a voice:** two or three `filter` bp nodes in parallel over a buzzy source (`pulse`, `saw`), with `q` 2 to 8. Move them down and closer together for a bigger creature, as `elite-howl` does with bands at 700 and 1800 Hz.
- **Roughness:** multiply the voice by `(1 - depth * (0.5 + 0.5 * wobble))` where `wobble` is an `osc` at about 25 to 70 Hz *(rule of thumb for the rate; `elite-howl` uses 25 to 45)*; or add a second `osc` at `freq * 0.5`; or mix in `noise` through the same band-pass filters.

### 3.4 Variation with `rnd()`

`rnd(lo, hi)` is drawn once per take. Use it where a studio would use different recordings.

| Vary | How | Range that stays "the same thing" |
|---|---|---|
| Body pitch | `pitch * rnd(0.94, 1.06)` in an `env` point or `freq` | plus or minus one semitone (about 6%); up to two for loose things like debris *(sources 5, 8)* |
| Filter colour | `freq * rnd(0.9, 1.1)` | plus or minus 10 to 15% |
| Timing of a late layer | `"delay": "0.02 * rnd(0.7, 1.3)"` on its `clock` | plus or minus 30% of the gap |
| Level of a layer | a `rand` node with `lo` 0.8, `hi` 1.2, multiplied in | plus or minus 2 dB |
| Grain | `noise` and `dust` differ on every take without help | |
| Per-grain inside one take | `rand` with a `trig` | |

Rules:

- Do **not** put `rnd()` on the transient's timing or on the overall length. The front stays put.
- Use one `rnd()` per layer, not one shared value: independent layers give more distinct takes from the same ranges.
- Signals (interface, pickups, jingles) must measure `variation 0.0 dB`. If they use `noise` for a click, give it `"seed": <whole number>` so the noise is the same on every take.
- A `rnd()` range is also heard at the control ends. Check that pitch at its minimum times `rnd` low is still sensible.

### 3.5 Standard controls as craft tools

| Control | Good design |
|---|---|
| `pitch` (Hz, log) | Range of about two octaves around the default. Wider and the ends stop being the same object |
| `weight` / `size` | Moves pitch, length and brightness together (3.3). Check the phone share at the heavy end yourself; the checker tests the default and the styles, not single control ends |
| `length` (s, log) | Scales the body and tail, never the transient. `duration` is computed from it |
| `bright` | Opens a `filter` lp, raises the high layer, lowers `damp` or `tilt`. Should move the centroid by an octave or more end to end |
| `snap` | Transient level (3.2) |
| `grit` | `shaper.drive`, `crush.bits` down, noise mixed in. At 0 the sound should still have character |
| `ring` (s) | `modal.decay` or the last note's decay; add it to `duration` |
| `space` (0 to 0.5) | `reverb.mix`. Add tail time to `duration`. Keep it off sounds that repeat fast |
| `rise` / `drop` (semitones) | The far point of the pitch `env`. Leave it a slider (no `step`) |

Styles (`presets`) are the family's named members. Make them differ on at least two controls, so that each is a different use ("Light jab", "Heavy body blow"), not a different setting.

### 3.6 Loops: `loop` and `wrap`

The engine closes a loop in one of two ways. Choosing the wrong one is the commonest loop fault.

| | Default (`"loop": true`) | `"loop": true, "wrap": true` |
|---|---|---|
| What the engine does | Renders 0.3 s extra and fades the overrun under the start, equal power | Renders the loop twice, keeps the second pass, with an 8 ms join |
| Right for | Noise beds and anything random: wind, rain, fire, crowd, leaves | Steady tones, hums, drones, pulses, anything with a rhythm, anything with echo or reverb tails |
| Goes wrong when | The sound has a steady tone: the two copies add up and the level bumps by up to 3 dB at every repeat | A slow random value (`clock` → `rand` → `lag`) is somewhere else at the end than at the start: the level or colour steps at the join |
| So | Keep tones out, or keep them very quiet | Make **everything** complete whole cycles in `duration`: every `osc`, every wobble, every `clock` |

For slow movement in a `wrap` loop, do not use random drift. Use sums of slow sines that each complete a whole number of cycles, with numbers that share no factor:

```json
{ "id": "swell", "type": "expr", "expr": "0.6 + 0.2 * sin(tau * t * 2 / dur) + 0.13 * sin(tau * t * 3 / dur + 1.3) + 0.07 * sin(tau * t * 7 / dur + 4.1)" }
```

Two, three and seven cycles in the loop never line up inside it, so there is no beat to notice, yet the end meets the start exactly. This is the same idea as the studio trick of stacking loops of different lengths so the combination takes a long time to come round (source 22), folded into one fixed loop.

`"normalize": false` on a loop keeps its level tied to a control; then keep the raw peak between 0.4 and 0.7 at the loudest setting and under 0.95 everywhere.

---

## 4. Judging a sound you cannot hear

### 4.1 Write the sound in words first

Before any node, write the "sound sentence set". SOUND.md step 1 asks for it; this is how to do it well. Seven lines:

1. **Source:** what physical or imagined thing makes it. ("A small brass coin flicked against another.")
2. **Layers:** transient, body, tail, each with its band. ("Tick at 3 kHz and up; two notes around 900 Hz and 1.5 kHz; ring of 0.3 s on the second.")
3. **Time:** total length, rise time, where the loudest moment is, when it is over.
4. **Pitch:** where it starts, where it ends, how it gets there (step, slide, fall), in Hz or semitones.
5. **Brightness:** where the centre of the spectrum sits at the start, middle and end.
6. **Repeat:** how often the game plays it, and whether takes differ.
7. **Neighbours:** which other sounds in the kit it must not be confused with, and how it differs (band, rhythm, direction).

Then turn each line into a number the checker prints. If a line cannot be turned into a number ("menacing", "cute"), say which measurable things you are using to stand for it (menacing: low, rough, slow rise, falling end) and report low confidence.

A useful habit from procedural sound design: **model the behaviour, not the surface** (Farnell, sources 10, 33). Ask what the thing does (a gate is a chain passing over a ratchet, tooth by tooth, then a stop) and build that process (`clock` of teeth → clicks that climb → a clunk on a delayed `clock`), as `gate-rise` does. Controls then fall out naturally (number of teeth, how hard it stops) and every setting is believable.

### 4.2 The measurements and what they stand for

All from `node tools/sfx.mjs check` (text) or `render` with no output file (JSON).

| Measurement | Stands for | Read it like this |
|---|---|---|
| `onset` (ms) | Is it on time | Under 2 ms for anything cued to a frame. The first sample within 20 dB of the peak, so a slow fade can still pass: also read the first steps of `loudness` |
| `attack` (ms) | Where the loudest moment is | Under 10 ms for hits. Long on purpose for swells, tunes and builds; then say so |
| `crest` (dB) | Punch: how far the peak stands above the average | Under 8: a slab (drones, explosions' bodies, heavy distortion). 10 to 16: a hit with body. Over 18: a thin spike or a sparse sound; may seem quiet next to others at the same peak |
| `rms` (dBFS) | How loud it will seem at the same peak | Compare across a family (6.3). 6 dB apart is clearly unequal |
| `loudness` contour (32 steps, 6 dB each) | The envelope | One-shot: top in the first step or two, then steadily down. A flat top then a cliff is a gated sound. A second hump is a second event: is it meant? |
| `sounding` and `end level` | Tail and padding | End below about -30 dB; no long silent run at the end |
| `centroid` start → middle → end | Brightness over time | Most natural one-shots get darker as they fade (high parts die first). A centroid that does not move over a long sound is static, like a held synth note. One that rises means a noise tail is outliving the body: is that meant (gravel) or a leak? |
| `strongest` start → middle → end | Pitch movement | Must match the pitch line of your sound sentence. If it reads the same for a "sweep", the sweep is too quiet or too short |
| `bands` | Slotting and phone survival | Compare with the slot you chose (2.4). Share above 300 Hz at least 40%; aim for real energy in 500 Hz to 4 kHz, because that is what phones play best (section 9, item 3) |
| `nodes` peaks | Is every layer alive | Peak × gain within about 20 times of the loudest |
| `params` (dB per control) | Does each control matter | At least 1.5 dB; 3 dB or more for a main control |
| `variation` (dB) | Do takes differ | World sounds: aim for 1 to 4 dB, not just the 0.2 dB floor. Above about 6 dB, check it is still the same object. Signals: 0.0 |
| `loop` seam and `pulse` | Loop join and hidden rhythm | Seam well under 8 times typical. For a bed, no beat much stronger than the rest |
| Spectrogram PNG | Everything at once | One vertical bar at the left for the transient; body as lines (tone) or fog (noise); the picture thinning from the top down as it fades |

Four proxies deserve a warning:

- **Crest is not quality.** A very high crest often means a click followed by something too quiet. Look at the contour: after the first step, is there still body within 12 to 18 dB (two or three steps) of the top for a few steps?
- **Share above 300 Hz is not "sounds good on a phone".** A sound can pass with all its energy at 8 kHz and be a thin hiss. Read the whole `bands` line.
- **`variation` measures difference, not good variation.** Check the pitch range you wrote, not only the number.
- **`params` measures change, not usefulness.** Render both ends and read them as two sounds, each against the sound sentences.

### 4.3 A routine that catches most faults

1. Check the default. Fix errors. Read every line of 4.2 against your seven sentences.
2. Render the PNG; look for the three layers.
3. Check each style the same way (the `styles` lines give length, phone share, onset, crest, end level).
4. For `weight`, `size`, `pitch` and `length`, render both ends (`--set id=value`) and read `bands`, `crest` and `end level` again. The heavy, low, long corner is where sounds fall apart.
5. For sounds that repeat, render three seeds (`--seed 1`, `2`, `3`) and compare `strongest` and `centroid`: they should differ a little, and `onset` not at all.
6. Place it in its family (6.3): `rms`, centroid and length next to its neighbours.
7. Report what was measured, what stands for what, and that nobody has listened.

---

## 5. Kind by kind

Each kind has: what good sounds like, common failures, and a self-check with numbers. Lengths are the general craft range; the bundle's specification row and the house table in the style guide decide the real limit.

### 5.1 Impacts and hits

*(roles `actions/hit`, `effects/impact`; punches, blade hits, arrows landing, bodies falling)*

**Good:** one clear event at time 0. A tick or crack on top (2 to 6 kHz, 5 to 20 ms), a falling low thump for weight (starting 150 to 250 Hz, dropping to 50 to 90 Hz within about 50 ms), and a band of noise or a short ring that says what was hit: flesh is a dull noise slap around 1 to 2 kHz; wood a short low `modal` knock; metal an inharmonic ring; stone a darker noise burst with a little `dust` after it. Heavier hits are longer and lower, with a *louder* middle layer, not just more bass. Total 0.08 to 0.35 s. Dry.

**Common failures:**
- All thump, no front: reads as a soft bump. Crest under 10 dB.
- All click: reads as a tap. Nothing left after 30 ms.
- The low sine carries all the energy and a phone plays nothing (the first draft in 3.1).
- Distortion over the whole sum, which flattens the transient.
- Every take identical, so a combo sounds like a machine.
- A reverb tail on something that fires five times a second.

**Self-check:** onset under 2 ms; attack under 10 ms; crest 10 to 16 dB; contour top in step 1 and falling every step; `strongest` falls from start to middle; at least 40% above 300 Hz at the default, in every style and at the heavy end of `weight`; three bands with real shares (low, lower-middle, 1 to 4 kHz); variation 1 to 4 dB; end level under -40 dB; shorter than the gap to the next hit of the fastest attack clip.

### 5.2 Footsteps

*(role `characters/footstep`)*

**Good:** quiet, short, and about the ground more than the foot. A real step is a heel strike followed by the ball of the foot; researchers who synthesise walking treat it as many tiny impacts driven by the force of the foot, and found that the timing between heel and toe changes what surface people think they are on (source 26). In a small game a step can be one event with a soft low thump (heel, 80 to 160 Hz, very short) and a surface layer: grains through a band-pass for gravel or sand, a short wooden `modal` knock for boards, a bright tick with a little ring for tile or metal, a low-passed squelch for mud, a noise burst with slow attack for snow or grass. 0.08 to 0.25 s. Celeste gave nearly every surface its own set of step sounds (source 12): the surface is the information.

**Common failures:**
- Too loud and too bright; steps are the most repeated sound in most games and tire the player first.
- Too long: at a run the tails overlap and turn into a continuous hiss.
- No variation, the classic "machine gun" walk.
- Too much variation, so each step seems to be a different shoe.
- A strong pitch, which turns walking into a tune.

**Self-check:** onset under 2 ms; sounding under 0.2 s at the default and under the run gap (about 0.28 s) at the long end of `length`; crest above 10 dB; variation 1.5 to 4 dB with `strongest` moving only a little between seeds; no single band above about 60%; centroid by surface (grass and snow 1 to 3 kHz and noisy; wood and stone under 1.5 kHz with a clear low peak; metal and tile above 2 kHz with a ring); a family of surfaces has near-equal `rms` (within 3 dB) so the cue volume of 0.45 fits all of them.

### 5.3 Jumps and movement

*(roles `actions/jump`, `actions/land`, `actions/dash`, `actions/swing`; hops, dashes, whooshes, wall grabs)*

**Good:** a jump is the player's own action, so it sits in the clear middle (500 Hz to 2 kHz) and is light. The retro form is a short tone that slides up: sfxr's jump preset is a square wave with an upward slide, no attack, and a hold and fade of roughly 20 to 350 ms and 20 to 200 ms (source 2). A rise of 7 to 12 semitones over 60 to 150 ms reads as a normal jump; smaller and shorter for a hop, larger and longer for a big leap. A softer world uses a sine or triangle with a puff of noise. A **landing** is a small hit (5.1) with more low and no pitch rise. A **dash or whoosh** is noise through a band-pass whose centre rises then falls, with the level following the same curve, 0.12 to 0.35 s; the peak comes at 30 to 40% of the length, where the fastest part of the movement is. A **swing** is a whoosh that ends just before the impact sound starts.

**Common failures:**
- A jump that slides down (reads as falling or failing).
- A jump so bright and loud that the hundredth one hurts.
- A whoosh with a hard start (it is air, it has no edge) or one that peaks at the very end and is cut off.
- A dash that is only white noise with no moving filter: reads as static.
- Movement sounds with long tails that blur the next action.

**Self-check:** jump: `strongest` rises start to end; onset under 5 ms even though it is not on the checker's 10 ms list; sounding 0.08 to 0.3 s; variation 0.0 for a retro blip (it is a signal of the player's input) or under 1 dB for a softer world. Whoosh: attack 30 to 100 ms on purpose and reported as such; contour rises for 3 to 10 steps, peaks, then falls to under -30 dB; centroid rises then falls (render the middle to see it); end level low. Landing: as 5.1 but centroid under about 800 Hz and still 40% above 300 Hz.

### 5.4 Pickups and rewards

*(roles `items/pickup`, `interface/reward`; coins, gems, hearts, keys, power-ups, achievements)*

**Good:** bright, pitched, quick, and unmistakably positive. The standard coin is two notes, the second higher, the second held: sfxr's coin preset has no attack, a hold under 25 ms, a fade of 20 to 550 ms, and half the time a single upward pitch jump partway through (source 2). Upward steps read as good and downward as bad. Notes that belong to one major chord sound settled: up a fourth (5 semitones), a fifth (7), a major third then a fifth (4, 7), or an octave (12) *(rule of thumb from common practice)*. The value of the pickup shows in the same three cues as size (2.3) plus the number of notes: a common coin is two notes and 0.15 to 0.3 s; a gem is higher, brighter and rings longer; a key or heart is three notes; a power-up is a rising run or slide of 0.4 to 0.8 s. Body in 800 Hz to 3 kHz, where it cuts through music.

A game will often play coin after coin. The patch stays identical each time; the game raises `pitch` a semitone per coin in a streak (source 8). So the `pitch` control must stay usable at least an octave above the default.

**Common failures:**
- One plain beep: reads as an interface sound.
- Notes too close in time (under about 35 ms) so they smear into one buzz, or too slow (over 120 ms) so it feels sluggish.
- An interval that is not from a chord (a semitone or six semitones up) which sounds wrong or sinister.
- Too much ring on something collected ten times a second.
- Random variation, so the reward feels inconsistent.
- So bright (all energy above 4 kHz) that it is piercing through a phone.

**Self-check:** onset under 2 ms; `strongest` at the end is higher than at the start by the interval you wrote (ratio 1.33 for a fourth, 1.5 for a fifth, 2.0 for an octave); variation 0.0 dB; crest above 10 dB; most energy in 300 Hz to 4 kHz with under about 30% above 4 kHz; sounding 0.15 to 0.5 s (power-ups to 0.8 s); in the PNG, clean stacked lines that step up; styles ordered by value differ in pitch, note count and ring together.

### 5.5 Interface sounds

*(roles `interface/click`, `interface/hover`, `interface/confirm`, `interface/error`; moves, toggles, opens, closes, buys, text blips)*

**Good:** small, soft and consistent. Guidance written for desktop interfaces asks for middle to high pitch (about 600 Hz to 2 kHz), under a second, moderate level, pleasant, and designed as one set that feels like variations on a theme (source 1). Games go much shorter: a move or hover is 20 to 60 ms, a click 30 to 100 ms, a confirm 100 to 250 ms, an open or close 100 to 300 ms, an error 150 to 300 ms. A set has a hierarchy: the more often a sound plays, the quieter, shorter and plainer it is; the rarer and more important, the richer. Meaning comes from direction and harmony:

| Action | Shape |
|---|---|
| Move, hover | One very short, soft tick or tone. The plainest sound in the set |
| Select, confirm | Up: one step up, or two notes rising |
| Back, cancel, close | Down: the confirm turned around, softer |
| Open / close | A matched pair: open rises or brightens, close falls or darkens |
| Toggle | Two states a step apart (on higher, off lower) |
| Buy | A confirm with a little extra: a third note, a coin-like ring |
| Error, not allowed | Low, short, slightly sour: two notes a semitone or six semitones apart, or a dull double knock. Not loud and not harsh: interface guidance warns against jarring error sounds (source 1), and Nintendo's developers have spoken of fine-tuning "too bad" sounds because players hear them every day (source 35) |

All sounds of a set share one sound source (all `modal` glass, or all `pluck`, or all square blips), one home pitch, and one small set of intervals, so they sound like one instrument. Reusing a layer across several actions makes a set clearer, not poorer (source 17).

**Common failures:**
- A move sound that is as loud and bright as the confirm: fifty of them in a row is tiring.
- Sounds from different worlds in one set (a wooden click, a synth beep, a bell).
- An error sound that is a loud buzzer.
- Confirm and back that differ only slightly; in a hurry they are the same.
- Long tails, so quick navigation becomes a wash.
- Lots of energy in 2 to 5 kHz on the most frequent sound.

**Self-check:** variation 0.0 dB (any `noise` has a fixed `seed`); onset under 2 ms; move and hover under 0.06 s sounding, everything else under 0.3 s; across the set, `strongest` at the start sits on the home pitch or a chord note of it for every sound; confirm's `strongest` rises, back's falls, error's is the lowest of the set; `rms` ordered by importance (move lowest, confirm and error highest) or, since Loadout normalises every sound, a note in the report saying which cues need a lower `volume`; centroid of the move sound is the lowest or second lowest in the set; no reverb above `space` 0.1 on move, hover, click.

### 5.6 Weapons and projectiles

*(roles `actions/shoot`, `actions/swing`; lasers, blasters, bows, throws, slashes)*

**Good:** the player's weapon is the sound they hear most in an action game, so it must be satisfying and still bearable the thousandth time. Studio weapon sounds are built from a body, a mechanical layer, a low layer and a tail, with player weapons given more low end and detail than enemy ones (source 6). The Loadout house rule for sci-fi shots is the same idea in small: every shot has a click, a body and a thump. The retro laser is a tone that falls fast: sfxr's laser preset drops the pitch steeply with no attack and a hold and fade of roughly 20 to 200 ms and 0 to 360 ms (source 2). A fall of one to three octaves in 50 to 150 ms reads as a zap; a shorter, smaller fall with more noise reads as a bullet. A **bow** is a `pluck` twang plus a short whoosh. A **slash** is a bright, narrow whoosh (centre 2 to 6 kHz) with a metallic edge from a quiet inharmonic `modal`. A **throw** is a low, soft whoosh.

Bigger weapons: lower start, longer, more thump, more grit. Faster weapons: shorter, brighter, drier. Total at most 0.3 s for anything that can fire many times a second.

**Common failures:**
- No click: the shot feels late. No thump: it feels like a toy (fine in a chiptune kit, wrong in a gritty one).
- A fall so slow it sounds like a siren.
- Identical takes on a rapid-fire weapon; or pitch varied so much that the gun seems to change.
- A tail longer than the gap between shots, so rapid fire becomes one noise.
- Player and enemy shots that sound alike.

**Self-check:** onset under 2 ms; crest above 10 dB; `strongest` falls start to end for lasers (ratio 2 or more); three layers alive in `nodes`; sounding under 0.3 s and end level under -40 dB; variation 0.5 to 3 dB with onset unchanged; phone share at least 40% (the thump must not dominate); styles for player and enemy differ by at least an octave of centroid or by clear length.

### 5.7 Magic and energy

*(roles `actions/cast`, `effects/magic`; spells, heals, shields, charges, warps)*

**Good:** magic has no real-world sound, so it is defined by **movement over time** and by **having parts**: a gather (rise or swell), a release (the transient), and a tail (shimmer or ring). A sound-pack maker describes retro spells as 3 to 8 stacked layers, typically chimes and synth tones, and stresses keeping low, middle and high in balance and letting the spell die away gradually with a delay instead of stopping dead (source 7). Element sets the material: fire is band-passed noise with crackle (`dust`) and a low roar; ice is high inharmonic `modal` glass with a brittle tick; lightning is a noise crack with a fast falling buzz; healing is rising chord notes on soft sine or bell tones; dark magic is low, rough, detuned and falling; a shield is a short ringing tone with a hum. Sparkle is many short, quiet, high notes at slightly irregular times (`clock` with `jitter` → `rand` → sine → short `ad`). 0.4 to 1.4 s, the one family where a real tail (`space` 0.15 to 0.3) belongs.

**Common failures:**
- A single sweep with reverb: reads as a generic "synth swoosh".
- No release moment, so the spell has no point where it "happens" for the cast frame.
- All sparkle (above 4 kHz) with no body: vanishes under music and on phones turns to hiss.
- Good and bad magic that sound alike. Good rises and is consonant; harmful falls and is rough.
- A reverb or delay tail cut off by `duration`.

**Self-check:** the contour shows the parts (a rise or a transient, then a long even fall); the release is at time 0 or, for a gather-then-release spell, at a time the `cast` frame can match, and the report says where; centroid moves by at least an octave across the sound; three or more layers alive; body energy in 300 Hz to 2 kHz at least 30%; for a tonal spell `strongest` rises (heal, buff) or falls (curse, drain) as written; end level under -30 dB with the tail inside `duration`; sparkle layers are visible in the PNG as separate dots, not a smear.

### 5.8 Creatures and voices

*(roles `characters/voice`, `characters/hurt`, `characters/death`; roars, growls, squeaks, calls, hurt cries)*

Synthesis is poor at voices (SOUND.md step 2). Studios build monster voices from human and animal recordings layered with odd objects (source 12). So aim for a **clearly stylised voice with the right behaviour**, not a real animal.

**Good:** a voice has three things an object does not. (1) **A pitch contour with intent:** a scoop up at the start, then a glide; never a flat tone. (2) **Throat resonances:** a buzzy source through two or three band-pass filters (3.3). (3) **Life:** a slow wobble in pitch (4 to 7 times a second) that grows during the call, a little breath noise, a soft start of 10 to 40 ms. Size follows 2.3: big creatures are low, long and rough, with low, close resonances; small ones are high, short and clean. Emotion: a hurt cry starts high and falls fast (0.15 to 0.4 s); an alert rises; a threat is low, rough and sustained; a death falls and slows (0.5 to 1.4 s). A chiptune kit can use pulse waves and `crush` and still follow all of this, as `elite-howl` does.

**Common failures:**
- A plain sine or saw glide: reads as a siren or a slide whistle, not a living thing.
- Pitch lowered but resonances left high: a small thing pretending.
- No roughness on a creature meant to threaten.
- A hard, instant start on something meant to be a voice (it reads as a horn).
- Identical takes: a pack of enemies sounds like one enemy copied.

**Self-check:** `strongest` moves across start → middle → end in the direction written; the PNG shows bent lines, not straight ones, with the wobble visible as ripples; the `bands` line shows two humps (the resonances) and not one; attack 10 to 60 ms on purpose, but onset still under 10 ms (start the envelope above zero, as `gull-call` and `elite-howl` do); variation 1 to 4 dB with pitch `rnd()` of plus or minus 3 to 6%; hurt cries under 0.4 s; phone share at least 40% even for a big creature (the resonant bands carry it); confidence reported as low or medium, because character cannot be measured.

### 5.9 Doors and mechanisms

*(roles `world/door`, `world/lever`, `world/chest`, `world/machine`; gates, locks, levers, chests, switches)*

**Good:** a mechanism is a **sequence of small events that tells a short story**: start, travel, stop. A lock: tick, tick, clunk. A gate: ratchet clicks that climb, then a heavy stop. A stone door: a low scrape with grit, then a thud. A chest: a creak that rises, then a soft knock or a sparkle. Doors are a favourite of sound designers because opening one is a small reward and a promise of something new (source 12), so the last event should feel like an arrival. Material by `modal` and noise (3.3). The stop is a small impact (5.1) and is the frame the animation syncs to. 0.3 to 1.8 s by the specification.

**Common failures:**
- One event only (a single clunk): no travel, so it does not read as opening.
- Perfectly even clicks at one pitch: reads as a machine gun or a timer. Give the `clock` a little `jitter` (0.05 to 0.1) and let pitch or level drift across the run.
- The stop comes at an awkward time that no animation frame can match, or moves when `length` changes in a way the cue cannot follow.
- Travel layer (scrape, hum) so quiet in `nodes` that only the clicks are heard.
- A creak made from a pure tone; it needs a rough, wandering pitch (a `pulse` or `saw` through a resonant `filter` whose `freq` wobbles).

**Self-check:** the contour shows the events (count the humps: they should match the number written); onset under 2 ms for the first event; the final event is the loudest or second loudest step and the report gives its time as a share of `length`; `strongest` or centroid drifts across the run (a gate climbs, a closing door falls); variation 1 to 5 dB; end level under -40 dB; the travel layer's peak × gain within 10 times of the clicks; every style keeps the same story with different proportions.

### 5.10 Explosions

*(role `effects/explosion`; also big breaks, boss slams, thunder)*

**Good:** the biggest sound in the game, and so the rarest. Layers (source 30): a **crack** at time 0 (a bright noise burst, 10 to 40 ms), which is what makes it feel powerful; a **boom** (a sine falling from about 150 Hz to 40 Hz over 100 to 300 ms, plus low-passed noise whose cutoff falls from several kHz to a few hundred Hz); a **roar** of middle noise so that small speakers have something to play; and **debris** (sparse `dust` through a band-pass, starting 50 to 150 ms late and thinning out). If only the lowest band says "big", the design is unfinished (source 30). Distance removes the top first: a far blast is a soft low roll with no front. sfxr's explosion is simply noise with a falling pitch, a hold of 20 to 350 ms and a fade up to about 550 ms (source 2): enough for a chiptune kit. 0.6 to 2 s.

**Common failures:**
- No crack: a rumble that fades in. Feels weak however loud.
- All sub-bass: silent on a phone, and the checker's rumble exemption hides it.
- A slab of flat noise that stops: no falling filter, no thinning debris.
- So dense (crest under 6 dB) and long that it masks everything else for a second.
- No variation on something a player triggers in chains.

**Self-check:** onset under 2 ms; centroid falls steeply start → middle → end (the existing `explosion` goes 1.6 kHz → 412 Hz → 102 Hz); contour falls steadily after the first quarter, no cliff; crest 8 to 12 dB (lower than a hit is normal here); at least 40% above 300 Hz at the default and in every style, and do not add the word `rumble` to dodge the phone check unless the brief really is a rumble; debris layer alive in `nodes` and visible as specks in the PNG after the first 100 ms; variation above 1 dB; length within the checker's 2 s unless the specification says more.

### 5.11 Ambience loops

*(role `environment/ambience`, `environment/weather`; wind, rain, forest, cave, machine room, crowd)*

**Good:** a bed is felt, not noticed. It sets the place and then gets out of the way of every other sound. Studio practice (sources 5, 22): build a steady bed with anything that stands out removed; keep the stand-out sounds (a bird call, a drip, a creak) as separate one-shots the game plays at random times with small pitch and level changes; stack layers whose loop lengths differ so the mix does not repeat for a long time; make the bed long (10 to 30 s is a common starting point), though steady sounds like rivers, fire and rain tolerate much shorter loops.

Listeners tolerate a loop about twice; from the third to the fifth repeat it starts to grate (source 9, written about music, but the point carries). An 8 s bed repeats seven times a minute.

Loadout loops are 4 to 8 s and one buffer, so the craft is making repetition **impossible to notice inside a short loop**:

- **No landmarks.** Nothing may happen once. Any event (a drip, a creak, a gust) either happens many times at irregular spacing with varying pitch and level (`dust`, or a `clock` with `jitter` 0.5 or more driving `rand`), or is left out. One gull cry in an 8 s loop is a gull every 8 seconds, forever.
- **Slow movement without a beat.** Level and colour should drift, or the bed sounds like a noise generator. In a default loop use `clock` (0.3 to 2 per second, `jitter` 0.5) → `rand` → `lag` (0.3 to 1 s). In a `wrap` loop use the whole-cycle sines of 3.6. Keep the swing modest: about 6 dB of level and half an octave of colour.
- **Layers by band:** a low wash (below 400 Hz, quiet), a middle texture (the identity: leaves, rain, hum), a high detail (specks, hiss). Stereo: use two separate `noise` nodes for left and right, never the same noise with opposite sign, so the mono sum on a phone is still whole.
- **Leave the middle for the game.** A bed with strong energy in 1 to 4 kHz fights voices, pickups and interface sounds. Keep the bed's peak band away from where the kit's signals live, and keep it steady and quiet (the pairing table cues loops at 0.35).
- **Pick the right join** (3.6): noise beds default, tonal beds `wrap` with whole cycles.

**Common failures:**
- An audible bump or click every loop (wrong join type, or a tone that does not complete whole cycles).
- A recognisable event once per loop.
- A regular throb: a wobble at a steady rate reads as a machine. Right for a machine room, wrong for a forest.
- Static noise with no movement at all.
- So loud or so wide in band that it masks the game.
- A slow fade in or out inside the loop, which becomes a pulse every 8 seconds.

**Self-check:** seam well under 8 times typical; the 32-step contour is flat within one step (6 dB), with no single step standing above its neighbours and with the first and last steps equal; centroid and `strongest` nearly equal at start, middle and end; on the `pulse` line no one beat much stronger than the others, unless a rhythm is the point; in the PNG no feature that appears exactly once; crest not above about 20 dB unless the bed is sparse on purpose (drips); with `"normalize": false`, raw peak 0.4 to 0.7 at the loudest setting; render it twice end to end if in doubt and look at the join in the picture; variation above 0.2 dB so two seeds give two beds. Say in the report what the loop's most noticeable feature is and how many times it occurs.

### 5.12 Jingles and stingers

*(type `jingle`; roles under `music/`: victory, game over, level up, item get, secret found)*

**Good:** a jingle is a sentence in music: it must be understood in one hearing and it must **end**. Game victory jingles are short, loud fanfares of a few seconds (source 36). The craft *(common practice in tonal music, not from one cited page)*:

- **Three to eight notes, one clear rhythm.** Something a person could hum after one hearing.
- **Direction is the meaning.** Win, level up, item: rising, in a major key, ending on a high home note. Lose, game over: falling, minor or with a sour step, slowing down, ending low. Secret or mystery: an unusual step and an unresolved-sounding colour that still lands on the home note.
- **The ending is the point.** The last note is the home note (or the home chord), it is the longest note, and it rings. The note before it should "lean" into home: the note a fifth above home, or the note just below it. Stopping anywhere else sounds unfinished.
- **Rhythm sells it.** A short-short-long pattern, or a pick-up note before a strong beat, sounds like a fanfare; even notes sound like a scale exercise.
- **Same instrument family as the kit's interface and pickup sounds**, so it belongs to the game; richer, because it is rare.
- **The first note starts at time 0** and the whole thing fits its moment: 1 to 3 s in Loadout.

**Common failures:**
- Ends on the wrong note (not home), or the last note is cut short.
- A run of even notes up a scale: reads as a power-up effect, not a tune.
- Victory and game over that differ only in pitch.
- Too many notes for the length (under about 70 ms each), which blurs.
- A long reverb tail cut by `duration`, or a tail so long the next screen's sounds collide with it.
- Takes that differ.

**Self-check:** variation 0.0 dB; type and category `jingle`, no `loop`; onset under 5 ms; contour shows the notes as humps and the last hump is the longest, falling smoothly to under -40 dB; `strongest` at the end equals the home pitch (the `pitch` control, or an octave of it) and is the same in every style; for a win the highest `strongest` is in the middle or end, for a loss at the start; note starts are at least 70 ms apart; write the notes as semitones from home in the report (for example 0, 4, 7, 12 held) so a reviewer can check them against the `seq` steps; length 1 to 3 s at the default and in every style.

---

## 6. Families: one game, one voice

A kit sounds professional when its sounds belong together. Kevin Regamey of Power Up Audio describes starting from the game's creative direction and fixing the emotional range of the audio before making any single sound (source 12). Microsoft's guidance calls a good set variations on a theme (source 1). The house-sound table in the style guide is Loadout's version of this.

### 6.1 What a family shares

| Shared thing | In Loadout terms |
|---|---|
| A small set of sound sources | The house table's "built from" column: chiptune kits use square, pulse, triangle and noise bursts; storybook uses sine, triangle, `modal`, `pluck`; sci-fi uses saw, FM (`osc.pm`), `crush`, `shaper` |
| One treatment of space | The same `space` ceiling across the kit; dry kits stay dry |
| One home pitch and a set of related pitches | Interface sounds, pickups and jingles of a kit tuned to the same home note or its chord notes, and to the key of the kit's music where the specification gives one |
| One envelope character | All snappy (curve 3, short) or all soft (curve 2, longer) |
| One amount of grit | `grit` defaults in the same region |

### 6.2 What must differ inside a family

Each sound needs its own slot (2.4): its own band, rhythm or direction. Before making a sound, list its three nearest neighbours in the kit and write how a player tells them apart in a tenth of a second. Typical pairs that get confused: coin and menu confirm; jump and small pickup; player hit and enemy hit; door stop and footstep on wood.

### 6.3 Measuring a family

Nobody can listen to the kit together, so line the numbers up. For every sound in the bundle take from `render` (JSON) the length, `rmsDb`, `crestDb`, the three centroids and the band shares, and put them in one table sorted by role. Then check:

- **Loudness order.** All renders share one peak, so `rmsDb` shows which will seem loud. A dense explosion (crest about 9 dB) will seem some 10 dB louder than a sparse gate (crest about 21 dB) at the same cue volume. Rare, important sounds may be louder; frequent ones must not be. Where the order is wrong, the fix is the cue's `volume`, never the patch: say so in the report.
- **Slots.** No two sounds of different meaning with the same centroid (within about a third of an octave), the same length (within about 30%) and the same pitch direction.
- **The frequent sounds are the modest ones.** Steps, moves and hovers have the lowest `rmsDb` and no dominant 2 to 5 kHz energy.
- **Signals agree in pitch.** `strongest` at the start of each interface and pickup sound is a chord note of the home pitch.

---

## 7. Retro and chiptune conventions

Two Loadout kits lean chiptune. The style has rules that come from the old hardware, and following them is what makes it sound "right" and not just "cheap".

- **Four voices, four colours.** The NES had two pulse channels, one triangle, one noise channel and a sample channel (source 13). Pulse does tunes and zaps; triangle does bass and soft tones; noise does all drums, hits and explosions, differing only in pitch setting, loudness shape and length (source 28).
- **Pulse width is the timbre knob.** The hardware offered 12.5%, 25%, 50% and 75% (source 13). In a patch: `osc` `wave: "pulse"` with `width` 0.125 (thin, nasal), 0.25 (bright, classic lead), 0.5 (hollow, round). Stepping the width during a note animates it.
- **The triangle has no volume control** on the real chip (source 13): it is on or off. A triangle voice with a hard gate, not a smooth fade, sounds authentic.
- **Pitch slides are the effects language.** Up is jump or power-up; down is laser, hurt or fall; a long slide is a siren. A tutorial zap slides from a high note to one more than two octaves below (source 28).
- **Fast note changes fake chords.** Cycling two or three notes fast enough (about 15 to 60 changes a second) reads as a chord or a shimmer; slower reads as a little tune (source 28). The coin sound is the slowest case: one jump. In a patch: `clock` → `seq` → `osc.freq`.
- **Noise with a falling "pitch"** is the explosion and the hit: `noise` → `filter` lp or bp whose `freq` falls, or `crush` with a falling `rate`.
- **Envelopes are plain:** instant attack, short hold, straight or stepped fade. sfxr, which defined the modern retro effect, builds every sound from one wave, one loudness shape (attack, hold, punch, fade), a pitch slide, an optional single pitch jump, and simple filters (source 2). Its author made it so that people with 48 hours and no sound designer could have basic effects, and expected many to use them as placeholders (source 3). Its successor Bfxr notes that the preset buttons reach only a small part of what the tool can do (source 32). Take the hint: **the sfxr recipe alone is placeholder quality.** What lifts a chiptune effect to shippable is what this guide asks for anyway: a second layer (a noise tick on a blip, a triangle thump under a pulse zap), a slot in the kit, a tuned pitch, and variation where the thing is physical.
- **Low resolution is a colour, not a fault to add everywhere.** `crush` with `bits` 4 to 8 and `rate` 6000 to 12000 gives the grain; use it on one layer.
- **Dry and short.** No reverb to speak of (`space` at most 0.1), lengths 0.08 to 0.5 s.
- **Tuned.** Because chip sounds are pure tones, wrong notes are obvious. Pickups, interface sounds and jingles should sit on notes of the kit's key.

The sfxr presets are a useful sanity table for the retro form (source 2; times converted from its code, where a stage lasts its setting squared times 100,000 samples at 44.1 kHz):

| Preset | Wave | Pitch | Loudness shape |
|---|---|---|---|
| Pickup / coin | saw | middle to high start; half the time one upward jump | no attack; hold under 25 ms; fade 20 to 550 ms; strong "punch" |
| Laser / shoot | square, saw or sine | high start, steep fall | no attack; hold 20 to 200 ms; fade up to 360 ms |
| Explosion | noise | low, usually falling | no attack; hold 20 to 350 ms; fade up to 550 ms; strong "punch" |
| Power-up | square or saw | low to middle start, rising, often repeating | no attack; hold up to 350 ms; fade 20 to 550 ms |
| Hit / hurt | square, saw or noise | steep fall | no attack; hold under 25 ms; fade 20 to 200 ms |
| Jump | square | middle start, rising | no attack; hold 20 to 350 ms; fade 20 to 200 ms |
| Blip / select | square or saw | fixed | no attack; hold 20 to 90 ms; fade up to 90 ms |

Every one has **no attack time at all**, and the direction of the pitch is the whole meaning.

---

## 8. One-page checklist for maker and reviewer

Mapped to the five criteria of the sound rubric (`docs/quality-bar.md` section 4). A 2 needs the first group of each block; a 3 needs the second as well.

**1. Matches the brief** (`brief`)

- [ ] The seven sound sentences (4.1) are written, and each has a measurement next to it.
- [ ] Pitch direction in `strongest` matches; brightness in `centroid` matches; length matches the specification row.
- [ ] The kind's self-check in section 5 passes.
- For a 3: [ ] every layer named in the brief is alive in `nodes` (peak × gain within 20 times of the loudest) and can be pointed to in the PNG. [ ] The sound models what the thing does (4.1), so the controls are things about the object.

**2. Clean signal** (`signal`)

- [ ] No errors; no DC warning; A-peak safe; no dead node.
- [ ] Energy in at least two bands; at least 40% above 300 Hz at the default, in every style, and at the heavy, low end of `weight`, `size` or `pitch` (measured by hand).
- For a 3: [ ] three layers in three bands (low body, middle character, high transient), none wasted. [ ] The transient is outside the distortion and the room. [ ] Real energy between 500 Hz and 4 kHz, not just "above 300 Hz". [ ] The mono sum is whole (no layer that exists only as a left-right difference).

**3. Shape and timing** (`shape`)

- [ ] Event at time 0: onset under 2 ms for anything cued to a frame (the rule is 10 ms).
- [ ] Contour right for the kind: hit falls from step 1; whoosh rises and falls; mechanism shows its events; loop is flat; jingle's last hump is the longest.
- [ ] Dies away by the end; no padding; tail inside `duration`; shorter than the gap to the next cue of its clip.
- For a 3: [ ] hits: attack under 10 ms and crest 10 to 16 dB with body still present two or three contour steps down. [ ] Loops: right join type (3.6), nothing that happens exactly once, no dominant beat. [ ] Jingles: end on the home pitch in every style, last note longest. [ ] Centroid moves over time the way a real object's would (darker as it fades), unless the brief says otherwise.

**4. Range of controls** (`controls`)

- [ ] Every control at least 1.5 dB (or heard as timing or random takes); no end silent, cut off, clipped or blown up.
- [ ] Both ends of every control read as the same object and still pass section 5's self-check for the kind.
- [ ] World sounds vary (aim for 1 to 4 dB between seeds, onset unchanged); signals are 0.0 dB.
- For a 3: [ ] `weight` / `size` move pitch, length and brightness together. [ ] `rnd()` is on body pitch, colour or late-layer timing, never on the transient or total length. [ ] The controls together reach a family of related sounds (a pickup from dull token to gem; a hit from tap to slam).

**5. Game ready** (`ready`)

- [ ] Type, role, category, length, control ids and style names exactly as the specification row.
- [ ] Styles named for uses and each passes on its own (the `styles` lines).
- [ ] Words pass A-words; `meta.words` are what a person would type.
- For a 3: [ ] styles cover the obvious uses and differ on at least two controls. [ ] The sound has a slot in its kit: its three nearest neighbours are named and differ in band, rhythm or direction (6.2). [ ] Signals are tuned to the kit's home pitch. [ ] The report gives `rmsDb` and says if its cue needs a `volume` different from the pairing table.

**Always, both roles**

- [ ] The report or verdict says the sound was judged by measurement, not by ear, and gives a confidence. Character words ("cute", "menacing", "satisfying") get medium or low.
- [ ] Reviewer: score from evidence you can point to; between two scores give the lower and say what would raise it.

---

## 9. Where best practice and Loadout rules disagree

In every case below, **follow the Loadout rule**. These are flagged for the owner to decide.

| # | Topic | Loadout rule (where) | What the sources say | Suggested question for the owner |
|---|---|---|---|---|
| 1 | Ambience loop length | 4 to 8 s (`docs/style-guide.md` §11 "Ambience loops"; SOUND.md "Ambience") | A common starting point is 10 to 30 s; only steady sounds tolerate short loops; variety comes from layers of different lengths plus random one-shots (sources 5, 22) | Allow 12 to 30 s for beds with events (forest, tavern, cave drips)? Or ship a bed plus separate one-shot patches the game scatters? |
| 2 | Loudness between sounds | No volume control; every render peak-normalised to 0.89; loudness set only by cue `volume` from a per-event table (style guide §11 "Standard controls" and "Loudness between sounds") | Loudness follows average level, not peak; standards are in loudness units (sources 19 to 21). At equal peak, existing sounds differ by over 10 dB in `rms` (explosion -9.6 dBFS, gate-rise -22.4 dBFS) | Normalise to a loudness target instead of peak, or have the checker print a suggested cue volume from `rmsDb`? |
| 3 | Phone speakers | At least 40% of energy above 300 Hz (style guide §11; A-phone in `docs/quality-bar.md` §2) | Measured phones fall away below about 500 to 600 Hz, some sources say 200 to 400 Hz (sources 4, 18, 37). Energy between 300 and 500 Hz may not be played | Move the line to 500 Hz, or add a second measure for the 500 Hz to 4 kHz share? Also: the `rumble` word switches the check off, which invites misuse |
| 4 | Phone check coverage | Checker tests the default and styles, not control ends (SOUND.md "Phone speakers") | The heavy end of `weight` is where it fails (the 3.1 example went from 75% to 41%) | Have the checker test the ends of `weight`, `size` and `pitch` too? |
| 5 | Variation threshold | Repeating sounds differ by more than 0.2 dB between two seeds (style guide §11; SOUND.md) | Practice is pitch changes up to about two semitones plus level changes, judged over many repeats (sources 5, 6, 8). 0.2 dB proves "not identical", not "audibly varied" | Raise the floor to about 1 dB and add a ceiling (about 6 dB) so the object stays the same? |
| 6 | Interface sounds never vary | "Interface sounds, pickups and jingles are identical every time" (style guide §11) | Sources agree signals should be consistent, but middleware practice often adds slight variation to very frequent interface sounds to reduce fatigue (source 17). Also the existing `sounds/ui-click.json` measures 3.1 dB between seeds, against the rule | Keep the rule and fix `ui-click`, or allow tiny variation on `interface/hover` and text blips? |
| 7 | Hard attack on clicks | Clicks: onset under 10 ms and crest above 10 dB (style guide §11 "Shape") | Desktop guidance prefers soft edges and gentle tones for interface sounds to avoid a jarring, percussive feel (source 1) | None needed for games (snappy is the convention); note that "soft" interface families (storybook) should take the 10 ms rule lightly |
| 8 | Sound-effect length ceiling | A-length warns above 2 s (`docs/quality-bar.md` §2) while SOUND.md's explosion recipe says 1 to 3 s and Thornwood rows run long | Big explosions and magic commonly run 1.5 to 3 s | Align the recipe and the checker (one says 3 s, the other 2 s) |
| 9 | Jingle length | 1 to 3 s in the style guide §11, inside the quality bar's 1 to 6 s | Victory fanfares in shipped games are commonly a few seconds; a 4.5 s example turned up (source 36) | Is 3 s firm, or may a "Grand finale" style reach 4 to 5 s? |
| 10 | Rising pickups | Pickups identical every time (style guide §11) | Rising pitch across a streak is a standard reward trick (source 8) | No change to the rule; state in the export notes that the game should step `pitch` per streak, and require pickup `pitch` ranges to reach an octave above the default |
| 11 | Categories for voices | `category` is one of weapon, impact, pickup, movement, ui, magic, vehicle, ambience, jingle, music (SOUND.md "The patch") | Creature voices are their own kind; today `gull-call` is filed under `magic` and `elite-howl` under `impact` | Add a `creature` (or `voice`) category? |
| 12 | Kit-level mix | No rule on overall loudness or on how sounds sit together | Standards give whole-mix targets and a narrower loud-to-quiet range for mobile (sources 11, 19 to 21) | Out of scope for a single patch; a kit-level check (the family table of 6.3) would be the place |

Not conflicts, but worth knowing: the engine's default loop join (0.3 s, equal power) is the right choice for noise and the wrong one for tones, which SOUND.md already records; and all of this guide's measurement proxies still need the human listening pass that `docs/quality-bar.md` calls BASE-6.

---

## 10. Sources

"Read" means the page itself was read for this guide. "Summary" means the page could not be opened (blocked or behind a paywall) and only a search summary of it was used; treat those numbers with more care.

1. Microsoft, "Sound" (Windows user experience guidelines). Read. Interface sounds: 600 Hz to 2 kHz, under a second, restrained, designed as a set. <https://learn.microsoft.com/en-us/windows/win32/uxguide/vis-sound>
2. jsfxr source code (`sfxr.js`), a port of sfxr. Read. Exact preset recipes and the unit conversions used in section 7. <https://github.com/chr15m/jsfxr/blob/master/sfxr.js>
3. Tomas Pettersson (DrPetter), "sfxr". Read. Why sfxr exists: quick basic effects for a 48-hour contest, often placeholders. <https://www.drpetter.se/project_sfxr.html>
4. Sonarworks, "Make your mix sound great on small speakers". Read. Measured phone range about 500 Hz to 10 kHz; carry bass by overtones, layers and a click; check in mono. <https://www.sonarworks.com/blog/learn/make-your-mix-sound-great-on-small-speakers>
5. Splice, "How to create an audio soundscape for video games". Read. Beds with stand-out sounds removed and replayed as random one-shots; 10 to 30 s loops; variation within about two semitones. <https://splice.com/blog/audio-soundscape-for-video-games>
6. Splice, "How to design a weapon sound for video games". Read. Weapon layers (body, mechanics, low end, tail), layer offsets of a few milliseconds, player versus non-player detail. <https://splice.com/blog/?p=16617>
7. Game Developer, "Making of RPG Magic 2 Sound Pack". Read. Spells as 3 to 8 layers, balance across low, middle and high, tails by delay. <https://www.gamedeveloper.com/audio/making-of-rpg-magic-2-sound-pack>
8. Game Developer, "The Power of Pitch Shifting". Read. Random pitch against repetition; a semitone per step for combos; pitch as information. <https://www.gamedeveloper.com/audio/the-power-of-pitch-shifting>
9. Game Developer, "Rethinking the audio loop in games". Read. How many repeats listeners tolerate; ways to break up a loop. <https://www.gamedeveloper.com/audio/rethinking-the-audio-loop-in-games>
10. Designing Sound, "Procedural Audio: Interview with Andy Farnell". Read. Sound as a process to model, not data to copy. <https://designingsound.org/2012/01/18/procedural-audio-interview-with-andy-farnell/>
11. Designing Sound, "Different Loudness Ranges for Console and Mobile Games". Read. Narrow loud-to-quiet range for mobile; ducking beds under key sounds. <https://designingsound.org/2013/02/20/different-loudness-ranges-for-console-and-mobile-games>
12. Nintendo Life, interview with Kevin Regamey (Power Up Audio, Celeste). Read. Audio direction first; per-surface movement sounds; doors as rewards; how monster voices are built. <https://www.nintendolife.com/features/the-secrets-of-sounds-and-the-joy-of-door-noises-an-interview-with-celestes-audio-designer>
13. NESdev Wiki, "APU basics". Read. The NES channels, the four pulse widths, the triangle's lack of volume control. <https://www.nesdev.org/wiki/APU_basics>
14. PC Gamer, "How Overwatch uses sound to pinpoint threats you can't see". Summary. Play by sound; a mix that favours the biggest threat; pitch carrying state. <https://www.pcgamer.com/how-overwatch-uses-sound-to-pinpoint-threats-you-cant-see/>
15. GDC Vault, Scott Lawlor and Tomas Neumann, "Overwatch: The Elusive Goal: Play by Sound" (GDC 2016). Summary. The talk the Overwatch points come from. <https://gdcvault.com/play/1023010/Overwatch-The-Elusive-Goal-Play>
16. Audiokinetic blog, "Overwatch: Game Audio Using Wwise". Summary. The five pillars: voice, clear mix, pinpoint accuracy, gameplay information, learned response. <https://blog.audiokinetic.com/overwatch-game-audio-using-wwise-1/>
17. Audiokinetic, "Approaching UI Audio from a UI Design Perspective, Part 2". Summary. Reuse layers across interface actions for clarity; randomise to avoid tiring repetition. <https://www.audiokinetic.com/en/approaching-ui-audio-ui-design-perspective-2>
18. Audiokinetic blog, "Loudness and frequency response on popular smart phones". Summary. Phone speakers' weak low end and falling top above about 10 kHz. <https://www.audiokinetic.com/en/blog/loudness-and-frequency-response-on-popular-smart-phones>
19. Audiokinetic, "Mastering a Game with Wwise, Part 1". Summary. Sony targets: about -24 for home, about -18 for portable, in loudness units. <https://www.audiokinetic.com/en/mastering-a-game-with-wwise-part1>
20. ITU-R Report BS.2434 (2018). Summary. Typical game loudness: -24 ± 2 for consoles, -18 ± 2 for portables. <https://www.itu.int/dms_pub/itu-r/opb/rep/R-REP-BS.2434-2018-PDF-E.pdf>
21. Meta, "Audio loudness meter overview". Summary. A -16 target for standalone headsets, -18 for linked PC. <https://developers.meta.com/horizon/documentation/unity/audio-loudness-meter-overview/>
22. ZapSplat, "The secret of looping no one told me for ages". Summary. Layers with different loop lengths; which sounds tolerate short loops. <https://zapsplat.com/the-secret-of-looping-no-one-told-me-for-ages>
23. Anikin and colleagues, "Harsh is large: nonlinear vocal phenomena lower voice pitch and exaggerate body size" (2021), with related work on throat resonances and body size. Summary. Roughness makes a voice seem bigger and more aggressive; resonances signal size better than pitch. <https://pmc.ncbi.nlm.nih.gov/articles/PMC8261225/>
24. Hellier, Edworthy and Dennis, "Improving auditory warning design: quantifying and predicting the effects of different warning parameters on perceived urgency". Abstract read. Speed, pitch, repetition and inharmonic overtones all raise urgency, by different amounts. <https://researchportal.plymouth.ac.uk/en/publications/improving-auditory-warning-design-quantifying-and-predicting-the-/>
25. ITU-R Recommendation BT.1359-1. Summary. People notice sound about 45 ms early or about 125 ms late against picture. <https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1359-1-199811-I!!PDF-E.pdf>
26. Serafin, Turchet and Nordahl, work on synthesised footsteps (DAFx 2010 and related). Summary. Steps as many small impacts driven by foot force; heel-to-toe timing changes the surface people hear. <https://vbn.aau.dk/files/37619408/Serafin_Turchet_Nordahl_DAFx10_P82.pdf>
27. A Sound Effect, article on game audio immersion. Summary. The most repeated sounds irritate first; control repetition. <https://www.asoundeffect.com/game-audio-immersion/>
28. NES and FamiStudio tutorials on chip sound (as summarised from tracker documentation). Summary. Noise for all percussion and explosions; slides for zaps; fast note cycling as chords. <https://djkokumoproductions.netlify.app/tut-fami>
29. SFX Engine, "Impact sound effect", and Violet Recording, "How to design sound effects for games". Summary. Transient, body and tail roles; no silence at the start of a file. <https://sfxengine.com/blog/impact-sound-effect> and <https://violetrecording.com/how-to-design-sound-effects-for-games/>
30. Pixflow, "Explosion sound effects: a complete guide", with Sonilo's explosion guide. Summary. Crack, body, debris; the crack carries the power; a design that only works on a subwoofer is unfinished. <https://pixflow.net/blog/explosion-sound-effects-a-complete-guide> and <https://sonilo.com/ai-music/explosion-sound-effect-guide>
31. Google, Material Design, "Applying sound to UI". Summary. Limit how often decorative sounds play. <https://m2.material.io/design/sound/applying-sound-to-ui.html>
32. Stephen Lavelle, Bfxr. Summary. The sfxr descendant; its presets cover only a small part of what the tool can make. <https://www.bfxr.net>
33. Andy Farnell, *Designing Sound* (MIT Press, 2010), companion material. Summary. The standard book on building sounds from models of what makes them. <https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical31.html>
34. Blizzard, "From Zero Hour to Hero: Inside Echo's Audio". Summary. Enemy sounds are built to differ from the player's own. <https://overwatch.blizzard.com/en-us/news/23411614/from-zero-hour-to-hero-inside-echos-audio/>
35. Nintendo, "Iwata Asks: Wii Fit". Summary. Failure sounds were tuned with care because players hear them daily. <https://iwataasks.nintendo.com/interviews/wii/wii_fit/3/1>
36. GamesRadar, "Gaming's greatest victory jingles", with a 4.5 s example on Freesound. Summary. Victory jingles as short fanfares of a few seconds. <https://www.gamesradar.com/gamings-greatest-victory-jingles/> and <https://freesound.org/people/Sheyvan/sounds/470083>
37. LANDR, "How to make bass audible on phone speakers". Summary. Most phone speakers struggle below about 200 Hz and are gone by 100 Hz. <https://blog.landr.com/make-bass-audible-phone-speakers>
38. Bandcamp Daily, interview with Christopher Larkin (Hollow Knight). Summary. Distinct sounds per enemy and attack, tied to the music. <https://daily.bandcamp.com/features/christopher-larkin-hollow-knight-silksong-interview>
39. PlayStation Blog, developers on God of War (2018) combat. Summary. The axe as a heavy slam ending in a high slash. <https://blog.playstation.com/?p=370399>

Searched for but not found in a usable form: design write-ups on the hit and movement sounds of Hades and Hollow Knight, a sound-focused account of Nintendo's menu sounds, and the audio advice in the "Juice it or lose it" and "The art of screenshake" talks. Nothing in this guide rests on them.
