# Loadout

Named Loadout on 2026-11-18 (it started as "Sprite Forge"). A loadout is the set of gear you choose and adjust before you play, which is what the site offers a game maker. The folder (`lab/sprite-forge`), the skill id (`sprite-forge`) and the preview server entry keep the old name: Keyang decided on 2026-11-18 to leave them as they are.

A personal lab experiment (not part of the Innovation Lab project): a catalogue website of game-ready **pixel-art sprites, sound effects and music that are made by code**. Each one is a small program with sliders, not a fixed file. A non-technical person picks a sprite or a sound, changes it, pairs sprites with sounds on the right animation frames, and downloads the result.

The sound side was merged in from `experiment/procedural-sfx/` on 2026-11-18 (engine, 19 sounds, checker and skill were copied; the original folder, including its game test, is unchanged). Its music foundation was merged later the same day: stereo output, `pattern` drum rows, `seq.every`, bar-exact `wrap` loops, the battle theme, and the `tools/compose/` scripts. Loadout's copy has since gained things the experiment does not have (choice parameters via `step` and `options`, a 120-second limit for music, and the battle theme's Length and Melody instrument; all marked in `sound/sfx-engine.js` and `tools/compose/battle_theme.py`), so a straight re-copy would undo them: merge by hand. If that folder changes again, re-copy `engine/` to `sound/`, `patches/` to `sounds/`, `tools/` to `tools/` (then fix the `../engine/` and `patches` paths), and the skill to `skills/sprite-forge/SOUND.md`.

**Where it is going:** `docs/features.md` holds the vision and the feature breakdown (status, size, dependencies, suggested order, open decisions). `docs/asset-taxonomy.md` is the specification for search and categories, and `docs/search-design.md` is how search will work on a static site (the site must run as static files, for example on GitHub Pages).

Questions this experiment tests:

1. **Is it technically possible?** Framework + browser viewer + agent-authored assets. See "Status" below.
2. **Do customers need it?** See `docs/demand-scan.md` (sprites) and the market notes in `experiment/procedural-sfx/README.md` (sounds).

## The site

| Page | What it does |
|---|---|
| Home (`#/`) | What it is, three steps, kits, and one searchable shelf of every sprite and sound. |
| Sprites, Sounds, Music (`#/sprites`, `#/sounds`, `#/music`) | The shelf filtered to one type, with kind filters and search. A sound or music card plays when pressed. |
| A sprite (`#/sprite/<id>`) | Live preview, Look / Colors / Motion sliders, and **Sounds for each animation**: pick a sound, the frame it starts on, a style, and adjust its own sliders. Sounds play in time with the preview. Download gives a zip: sprite sheet, WAV files, a JSON list that says which sound plays on which frame, and a guide. |
| A sound (`#/sound/<id>`) | Waveform, play, named styles, sliders, "Play a variation", WAV download. |
| A music track (`#/music/<id>`) | Plays live through an audio worklet, so Intensity, Tempo, Key and the other sliders change the music while it plays. Two choices sit above the sliders: **Melody instrument** (synth lead, flute, chiptune, bell, plucked string) and **Length** (8, 16, 24 or 32 bars, shown in seconds; longer versions build up section by section). Named styles, stereo WAV download of one loop. There is no waveform picture for music (removed at Keyang's request); only the download renders the whole loop, on a background thread, in about 10 seconds for the 12-second battle theme. |
| Kits (`#/kits`, `#/kit/<id>`) | Sprites, sounds and music that belong together, downloadable as one zip. Defined in `kits/index.js`. |

Every page keeps its settings in the link, so a copied link reproduces the exact sprite, sounds or sound.

## Status (2026-11-18)

**Technically possible: yes, for side-view pixel art.** Seven sprites are in the gallery: Hero, Wizard, Wolf, Slime, Bat, Coin, Campfire. All pass `tools/check.mjs` (about 50 parameter combinations each) and run in the browser with live sliders and sprite-sheet download.

The skill was tested by giving it to four fresh agents with no other context. Each wrote its sprite file only, looked at its own renders, and iterated:

| Sprite | Made by | Render rounds | Time | Tokens |
|---|---|---|---|---|
| Hero, Slime | written with the framework | n/a | n/a | n/a |
| Wizard (on the humanoid rig) | agent, from the skill | 5 | 11 min | 238k |
| Wolf (four legs, no rig) | agent, from the skill | 6 | 12 min | 214k |
| Bat (flyer) | agent, from the skill | 9 | 11 min | 215k |
| Coin + Campfire | one agent, from the skill | 4 + 5 | 13 min | 206k |

Their feedback was folded back into the engine (`g.blob` for merged bodies, `loopKeys`, `pick`/`brightness`, `--clip` close-ups, a choices sheet) and the skill text.

Not verified: the browser download button was not clicked in testing (the zip writer and sheet export were tested in Node with the same code); the sheets were not imported into Unity or Godot; no non-technical person has tried the site; art quality was judged only by me and the authoring agents.

Known weak spots: the smallest slider settings give small sprites in the frame; the wolf's near and far legs merge where they cross; the wizard's walk is a shuffle; some parameters do nothing for some choices (coin emblem colour when the emblem is plain).

**Sprites with sounds (added 2026-11-18): working.** Every sprite has default sounds per animation; in the browser the run animation fired a footstep every 4 frames (about 267 ms apart at 15 fps) and the campfire started its fire loop. Bundles were built in the browser and inspected (sheet, WAVs, frame-timed sound list). Not verified: nobody has listened. The sounds were tuned by measurement only, and whether each default sound suits its animation, and lands on the right frame, has not been judged by ear.

**Music (added 2026-11-18): working, one track.** The battle theme passes the sound checker (159 bpm detected against 160 written, clean loop seam, stereo). In the browser it played live, and the output level fell from about 0.20 to 0.12 RMS when Intensity was moved to zero mid-play. Length and melody instrument were added later that day: rendered at 8 / 16 / 24 / 32 bars the sections measure -15.3, -13.0, -12.5 and -10.5 dB RMS (quiet opening to full band, the last equal to the original eight bars), and four of the five instruments are level-matched within 0.3 dB (the plucked string is about 7 dB lower in RMS because its notes die away). A 32-bar download takes roughly half a minute to build. Not verified: nobody has listened to it; the music skill text has not been tested with a fresh agent; live playback was tried only in the Browser pane's Chromium.

**Customer need: weak evidence for this exact form.** See `docs/demand-scan.md`. The old name clashed with an unrelated open-source skill, `agent-sprite-forge`, which is one reason for the rename.

## Run it

```bash
python3 -m http.server 5178 --directory lab/sprite-forge
```

Then open http://localhost:5178. No build step and no dependencies. (In Claude Code, the `sprite-forge` entry in `.claude/launch.json` starts the same server.)

## How it works

| Folder | What it holds |
|---|---|
| `engine/surface.js` | A pixel grid with hard-edged shape calls (`rect`, `ellipse`, `capsule`, `limb`, `poly`, `arc`, `outline`). Shapes are redrawn from joint positions every frame, so nothing is ever rotated or resampled: every frame is clean pixel art. |
| `engine/color.js` | `ramp(hex)`: light / base / dark tones with pixel-art hue shifts, from one user-picked colour. |
| `engine/motion.js` | Animation as functions of the clip phase `t`: `wave`, `pulse`, `keys` (keyframes), `ik2` (two-bone IK so feet stay planted), `hash`. |
| `engine/sprite.js` | `defineSprite`, the four parameter kinds (`range`, `choice`, `color`, `toggle`), `renderFrame`, `renderSheet` (PNG pixels + JSON metadata). Pure JS: the same code runs in the browser and in Node. |
| `rigs/humanoid.js` | Shared two-legged rig: body sizes from sliders, poses for idle / walk / run / jump / attack / cast / hurt, hooks for hats, capes, weapons. |
| `sprites/*.js` | One file per sprite. `sprites/index.js` is the gallery list. |
| `sound/` | The sound engine, merged from procedural-sfx: `sfx-engine.js` (pure-JS synthesis: a sound is a JSON patch of DSP nodes and named parameters), `player.js` and `worklet.js` (what a web game imports), `wav.js`, `analyze.js`. |
| `sounds/*.json` | One patch per sound, 1 to 3 KB each; a music track is the same kind of patch with `"category": "music"` (the battle theme is 6.6 KB). `sounds/index.json` is the list the site loads (rebuild with `node tools/sfx.mjs index`). |
| `kits/index.js` | Kits: lists of sprite ids and sound ids. |
| `app/` | The website: `app.js` (routes), `home.js` (catalogue), `cards.js`, `sprite-page.js`, `sound-page.js`, `kit-page.js`, `audio.js` (playback and waveforms), `bundle.js` (what gets downloaded), `stage.js`, `zip.js`. |
| `tools/sfx.mjs` | Sound checker and renderer for agents: `check`, `render` (WAV + waveform/spectrogram PNG), `nodes`, `index`. |
| `tools/compose/` | Music helpers: `battle_theme.py` writes `sounds/battle-theme.json` bar by bar, `verify_music.mjs` lists the notes sounding in each bar, `render_ramp.mjs` renders a loop while one slider climbs. |
| `tools/render.mjs` | Renders contact sheets to `out/` so an agent (or you) can look at a sprite without a browser. |
| `tools/check.mjs` | Renders 50+ parameter combinations per sprite and fails on clipping, empty frames, non-repeatable output; warns on loop seams and colour count. |

## Adding a sprite or a sound

Use the workspace skill `skills/sprite-forge/` ("make a sprite ...", "make a sound ..."). It is written for an agent with no other context.

- Sprite (`SKILL.md`): write `sprites/<id>.js`, run the checker, look at the rendered sheets, repeat, register in `sprites/index.js`. A sprite lists the sounds that go with its animations in a `sounds` field.
- Sound or music (`SOUND.md`): write `sounds/<id>.json`, run `node tools/sfx.mjs check`, look at the rendered spectrogram, repeat, then `node tools/sfx.mjs index`. Its "Music" section covers clocks, drum rows, melodies, chords and intensity layers.

## Export format

`<id>.png` has one row per animation and one column per frame. `<id>.json` lists frame size, pivot, each animation's row / frame count / fps / loop flag, a rectangle per frame, and the parameter values that made it. Sprites face right.

When the sprite has sounds, the zip also holds `sounds/*.wav` (16-bit mono, 44.1 kHz) and the JSON gains a `sounds` block: for each animation, a list of `{ sound, file, frame, timeMs, loop, volume, settings }`.

## Not done yet

- Other art styles (only pixel art exists).
- Unity package export, GIF export, other sheet layouts.
- Top-down (4 or 8 direction) sprites: everything is side view.
- Rigs for four-legged and winged creatures (they are drawn from raw shapes today).
