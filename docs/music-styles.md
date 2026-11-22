# Music styles: a design

Status (2026-11-19): **built and unit-tested, not yet checked by the slow step or by ear.** `sound/voices.js` (54 voices), `sound/bands.js` (all twelve bands, `bandProbe`, the `startGains` table) and `tests/unit/compose-bands.test.mjs` exist and all 21 tests in that file pass; `tools/compose/kit.mjs` has its one appended line, and every existing track still regenerates byte for byte (section 5). Still open: the slow `tools/sfx.mjs check` and `verify_music.mjs` run on each band's probe (section 6), and listening by a person (section 8). All twelve bands were built at once, not in the staged order of section 9 (eight, then a review, then four), so the listening gate covers all twelve: no band is used for a track that ships until a person has listened to its probe. Asked for by `docs/asset-plan.md` in the main checkout (section 9, "Music styles": "from one synthesiser voice set to about 12 styles ... each with its own drums and bass"). Written 2026-11-19 against `sound/compose.js`, `tools/compose/kit.mjs`, `tools/compose/thornwood_overworld.mjs`, `docs/style-guide.md` section 12 and the Music section of `skills/sprite-forge/SOUND.md`.

## 1. The problem, and what this addition is

Every track in the library today plays its tune on one of the same ten melody instruments (`instruments()`, behind the `inst` control; five until 2026-11-22, see section 4.3), and its drums and bass come from one family of voices (`kickDrum`, `snareDrum`, `hatDrum`, `sawBass`, `roundBass` ...). Six tracks get away with it because each composer also wrote some voices by hand. Hundreds of tracks would not: the 200th overworld theme would be a new tune on the 200th copy of the same band.

The addition is a **band**: a named set of voices (a signature melody voice, a chord voice, a bass, a drum kit) with a typical tempo and room, chosen once in a generator. Twelve bands are listed in section 3. A generator picks one with `band('folk')` and plays its rows through the band's voices instead of writing voices by hand.

### A word on names

"Style" already means two other things here: the **three styles of a track** are its presets, named for game moments (style guide §12; `lint` warns when a track has more or fewer than three), and **Contract 12 styles** are the visual style registry in `engine/styles.js`. A third meaning would confuse every reader of `check` output ("renders ... with every style"). So:

- in prose and on the site: **music style** (the asset plan's word);
- in code: **band** (`band('folk')`, `BANDS`, `sound/bands.js`). A band is what plays; a style (preset) is how the track is set for a moment.

## 2. Rules this design keeps

1. **Additive only.** No existing function, export, default or node changes. `sound/compose.js` is not edited at all. `tools/compose/kit.mjs` gets one re-export line at its end and nothing else: in particular `run()` is not given a `start` option, so `--match` keeps starting from `DEFAULT_GAINS` (section 7 says what that means for bands). Every existing track regenerates byte for byte (section 5).
2. **The ten `inst` options are the same in every track**, old and new: "Synth lead", "Flute", "Chiptune", "Bell", "Plucked string", then "Guitar", "Piano", "Violin", "Trumpet", "Bass" (the last five appended on 2026-11-22 by the owner's decision; the first five keep their indices and, with Plays along at None, their sound sample for sample), from `instruments()`, level-matched by `--match`. A band never wraps, re-voices or replaces `instruments()` (compose.js's header already says it cannot be re-voiced from outside without breaking its level matching).
3. **No new engine node types.** Every band voice is built from the nodes the engine already has, which are exactly the list `node tools/sfx.mjs nodes` prints: `osc`, `noise`, `dust`, `clock`, `env`, `ad`, `seq`, `pattern`, `rand`, `sah`, `filter`, `delay`, `pluck`, `modal`, `shaper`, `crush`, `reverb`, `lag`, `expr`. `modal` (a bank of resonators at given partial ratios, which compose.js's `struckBell` is built on) carries the struck and bar-like voices: `tine`, `lowTine`, `steelPan`, `bassPan`, `marimba`, `bassBar`, `metalHit`, `clave`, `woodblock` and `logDrum`. A voice that would need a new node type is out of this addition (section 8).
4. **The kit's convention holds** (compose.js header): voices are `name(id, { options })`, options keep their one name and one meaning (`trig`, `pitch`, `note`, `semis` always a count of semitones, `pick` always a chord-tone number as in compose.js's `chordTone(id, pick)`, `input`, `noise`, `attack`, `decay`, `cutoff`, `open`, `q`, `freq`), the finished sound is `<id>O` (or `<id>L` / `<id>R` when wide), `<id>A` the envelope, and a finished voice's level is about 1.
5. **A band is chosen when the track is written, not by a control.** A `band` control would put twelve bands' nodes into every patch: the six current tracks have 85 to 114 nodes and already render at only about 1.4 to 2.2 times real time (measured with `renderPatch` at 44.1 kHz over 8 bars on 2026-11-19; the figures are in the node budget row of section 6), and the ten-control limit is nearly used up. A track is one band; a bundle can mix tracks of different bands.

## 3. The twelve bands

Columns: the band's **lead** (its signature melody voice: plays the counter-line, echo or answer, and is what the track sounds like, see section 4.3 for the tune itself); the **chord** voice (pad, comping or arpeggio); the **bass**; the **drum kit** (its roles; a role a band lacks is refused by name); **tempo** as [slowest, fastest, typical] in bpm; **room** as the `space` default and the bus reverb's `size` / `damp`; and the default `inst` for the tune.

The slowest tempo of any track is 64 bpm (32 bars at the slowest tempo must last at most 120 s: `MAX_SECONDS`, enforced by `assemble`). Each fastest tempo leaves the 5% the whole-bundle looks need.

Existing voices are named as they are in compose.js; **bold** marks a voice this addition writes in `sound/voices.js` (all of them are listed in section 9). Every drum is marked **(p)** if it is pitched, in which case it follows `tr` to a chord tone as `kickDrum` does, or **(u)** if it is unpitched, with no stable fundamental. Section 6 tests both.

| Band | Lead | Chord voice | Bass | Drum kit | Tempo | Room | Default `inst` |
|---|---|---|---|---|---|---|---|
| `chip` (chiptune) | **chipLead**: 12.5% / 25% pulse, duty switched per note, no vibrato, short notes | **chipArp**: pulse running chord tones in 16ths (what thornwood writes by hand) | **triBass**: stepped triangle (an `osc` tri through `crush`), instant on and off; quarter notes walking root, fifth, octave | **chipKick** (p): sine falling from the fifth to the root; **chipSnare** (u): short white noise; **chipHat** (u): noise through `crush` (few bits, low rate) for the metallic grain | 120, 168, 144 | dry: 0.03, 0.4 / 0.2 | Chiptune |
| `synthwave` | **sawLead**: detuned saw pair with slow vibrato, into `tempoEcho` (dotted 8th) | `sawPad`, wide, through `chorus` | `sawBass` (its own default `drive`), a saw plucked by its filter envelope; straight 16ths, root with the octave on the off-16ths | kickDrum (p, long), **gatedSnare** (u: snare into its own short `reverb` cut by an `ad`), clap (u), hatDrum (u) | 80, 118, 100 | large: 0.25, 0.85 / 0.35 | Synth lead |
| `orchestra` (synth orchestra: strings and brass) | **brassSection**: sustained, swelling saws with a filter that opens on the attack (brassStab, held) | **stringSection**: four detuned saws, slow attack, vibrato, low-pass; spread left and right | **lowStrings**: detuned saw pair with a bowed swell (100 to 300 ms attack) and a fixed low-pass, no filter pluck; whole notes, changing with the chord | **timpani** (p: its own voice, a sine that falls onto the chord root between C2 and B2, with band-passed skin noise; it takes `semis` for a fifth, but the band plays it on the root only), **cymbalSwell** (u: noise, hp, rising `env`), snareDrum (u) rolls in 16ths | 70, 150, 112 | hall: 0.3, 0.9 / 0.5 | Flute |
| `folk` (plucked folk) | `pluckedString`, bright and short (a mandolin-like tremolo in 16ths when the row asks) | **strum**: the chord's three or four strings plucked 10 to 25 ms apart, down and up strokes | `roundBass` (sine plus triangle edge, 8 ms attack); half notes on 1 and 3, root then fifth | handDrum (p: frame drum on the root), shaker (u), **tambourine** (u: band-passed noise jingle around 7 kHz, two quick hits) | 84, 132, 108 | room: 0.12, 0.6 / 0.4 | Plucked string |
| `musicbox` | **tine**: `modal` with the ratios of a clamped tine (1, 6.27, 17.55), struck by a 1 ms click; long ring | the same tine, broken chords, sparse | **lowTine**: the tine two octaves down, quiet (a music box has no real bass); one note on beat 1 of each bar, left to ring | **mechanism** (u): a soft click, noise through a low-q band-pass, on every beat at every intensity (section 7) | 64, 100, 80 | small and bright: 0.15, 0.5 / 0.2 | Bell |
| `organ` | **drawbarOrgan**: five or six sines at 1x, 2x, 3x, 4x, 6x, 8x the pitch, mixed by Brightness, a short key click, through **rotary** (tremolo plus `chorus`) | the same organ, held chords | **pedalBass**: the organ's low registers (sines at 1x, 2x, 3x, gated on and off with the key click, no swell); a dotted half note and a quarter-note passing tone per bar | none for slow pieces; at higher intensity a light kit: **brushSnare** (u: swished noise), **ride** (u: band-passed noise, long decay), kickDrum (p) with a short decay | 64, 140, 96 | chapel: 0.35, 0.95 / 0.45 | Synth lead |
| `twang` (western and surf) | **twangGuitar**: bright `pluck` through a `shaper` and a bar tremolo, into **spring** (its own short `delay` with feedback before the bus reverb) | **mutedStrum**: damped short plucks on the off-beats | **uprightBass**: low `pluck`, heavily damped, with a low-passed thump on the attack; walking quarters through chord tones and passing notes | train beat: kickDrum (p) on 1 and 3, brushSnare (u) on 8ths, **rimClick** (u: 15 ms noise burst through a band-pass with q under 1.5) | 100, 172, 140 | spring: 0.15, 0.5 / 0.3 | Plucked string |
| `steelpan` (island) | **steelPan**: `modal` with harmonic partials 1, 2, 3, excited by a smooth 3 ms strike (no noise), ring about 1.2 s | the same pan, comping on the off-beats, lower | **bassPan**: the pan two octaves down; tresillo (3 + 3 + 2 eighths) per bar | handDrum (p: conga on the chord root only, between A2 and G#3), shaker (u), **clave** (p: one-partial `modal` on the chord root, two octaves above middle C), **cowbell** (p: two squares on the chord's root and fifth around 520 and 780 Hz, through a band-pass) | 96, 132, 116 | open air: 0.06, 0.4 / 0.3 | Bell |
| `lofi` (lo-fi keys) | **electricPiano**: FM sine at 1:1 with a fast-falling index and a brief high tine; slow pitch wobble of a few cents | the same piano, chords with added sevenths (a semitone row the composer writes, section 4.2) | **warmBass**: a triangle rounded by a low-pass near 400 Hz, slow attack (40 to 60 ms), a pitch wobble of a few cents; laid back: beat 1 and the "and" of 2, swung | **dustyKick** (p), **dustySnare** (u: snare through low-pass and `crush`), **dustyHat** (u: closed hat, low-passed); strong swing; **crackle** (u: `dust` through a band-pass) as a bed | 64, 96, 80 | small, dull: 0.12, 0.5 / 0.7; plus a **tape** finish on the whole mix (section 4.4) | Bell |
| `darkambient` | **glass**: FM with an inharmonic ratio, sparse and slow | **drone**: two detuned saws through a slowly swept band-pass, plus **wind** (pink noise, swept band-pass); attack of seconds | **subDrone**: a pure sine on the root (or the tone a `semis` row names, as every band's bass takes) that swells over seconds, tied across bar lines and changing only when the chord or that row does; `subDrop` at section changes | **heartbeat** (p: a soft kick on every beat at every intensity, the row `X...X...X...X...`, which the tempo checker needs, section 7); from intensity 0.5, tomDrum (p) and a low **metalHit** (p: inharmonic `modal`, lowest partial on the root) | 64, 96, 72 | huge: 0.45, 0.97 / 0.6 | Flute |
| `rock` (arcade rock) | **driveLead**: saw plus square through `shaper` (drive 4 to 8) and a low-pass "cabinet" near 3 kHz, with glide | **powerChord**: root, fifth and octave, palm-muted 8ths, through the same drive (no thirds: a distorted triad is mud) | **rockBass**: square plus saw through a `shaper` and a fixed cabinet low-pass near 800 Hz, a short noise pick click on each note; picked 8ths, accented with the kick | rock kit: kickDrum (p), snareDrum (u, heavier body), hatDrum (u) open and closed, **crash** (u: noise, hp, 1.2 s), tomDrum (p) fills on chord tones | 112, 176, 150 | medium, dry: 0.1, 0.6 / 0.4 | Synth lead |
| `marimba` (wooden bars) | **marimba**: `modal` with ratios 1, 3.9, 9.2 struck by a mallet (a smooth 1.6 ms `ad` tap, roughened by band-passed noise at 1.5 times the pitch), short decay (about 0.35 s at A4, shorter higher up) | the same bars, broken chords in 8ths, long notes rolled | **bassBar**: `modal` with ratios 1, 3.9, the same kind of roughened mallet but a 5 ms tap, decay about 0.8 s; half notes played as 16th-note rolls | **woodblock** (p: `modal` with ratios 1, 2.8 on the chord root folded into C6 to B6, so 1047 to 1976 Hz (A6, 1760 Hz, under A minor), decay 40 ms), **guiro** (u: a scrape of about 8 noise ticks in 0.12 s, one per cycle of a 68 Hz square `osc` (not a `clock`: a piece has exactly one clock), through a band-pass), **logDrum** (p: two-partial `modal` on root and fifth, low) | 72, 120, 92 | wooden hall: 0.2, 0.75 / 0.55 | Flute |

Every band has its own bass, differing from every other band's in waveform or excitation, and in rhythm. Two pairs are close in waveform and are kept on purpose: `orchestra`'s `lowStrings` and `synthwave`'s `sawBass` are both saws, but one is bowed (a slow swell, fixed filter, whole notes) and the other plucked by a filter envelope in 16ths; `folk`'s `roundBass` and `lofi`'s `warmBass` are both soft, but `roundBass` has a sine body and an 8 ms attack on half notes, `warmBass` is a low-passed triangle with a 40 to 60 ms attack and a wobble on a swung, syncopated row. `steelpan` and `marimba` share no voice, no drum, no partial ratios, no typical tempo, no room and no default `inst`. Their strikes are close in kind (both are a short smooth `ad` tap into a `modal` resonator) but not the same: the pan's is a clean 3 ms tap with no noise, the bars' a 1.6 ms tap roughened by band-passed noise, so every bar hit differs a little.

Twelve is the asset plan's number. If the build is staged, the first eight cover the most game moods: `chip`, `synthwave`, `orchestra`, `folk`, `musicbox`, `lofi`, `darkambient`, `rock`. The other four (`organ`, `twang`, `steelpan`, `marimba`) follow, and the review after the first eight decides whether they are worth it.

Brand names stay out of labels, descriptions and code names: "electric piano", "drawbar organ", "rotary", "808-style cowbell" is already too close; write "cowbell". Style guide §13 (original, never borrowed) applies to sound as well as tunes.

## 4. How a generator uses a band

### 4.1 The call

```js
import { band, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, main } from './kit.mjs';

const B = band('folk');   // an unknown name throws a KitError that lists the twelve

export function build(gains = GAINS) {
  return assemble({
    id: 'mossbank-market', name: 'Market day', tags: ['music', ...B.tags], meta: { ...,  words: [...B.words, 'market'] },
    tempo: [92, 124, 108],                         // inside B.tempo; the track's own range
    defaults: { ...B.defaults, intensity: 0.85, bars: 16 },   // B.defaults: { inst, space, bright }
    nodes: [
      clock({ swing: 'swing' }), chords('D G | A D | Bm G | A D', { tonic: 'D' }), arrangement(LAYERS),
      { id: 'nz', type: 'noise' },
      drumRow('dT', 'X.....x.X.....x.'), drumRow('kT', '..x...x...x...x.'), drumRow('tT', '....X.......X...'),
      B.drums({ hand: 'dT', shaker: 'kT', tambourine: 'tT', noise: 'nz' }),   // -> dO, kO, tO (and dA for ducking)
      drumRow('bG', 'X.......x.......'), noteRow('bS', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'),
      B.bass('b', { trig: 'bG', semis: 'bS' }),                             // -> bO, follows the chords and Key
      drumRow('sG', 'X.x.X.x.X.x.X.x.'),
      B.chords('p', { trig: 'sG' }),                                        // -> pL, pR: strummed chord tones
      melody('l', TUNE), instruments('l', { gains, noise: 'nz' }),          // the tune: ten options and Plays along
      melody('e', ANSWER, { voice: B.range }), B.lead('e', { trig: 'eG', pitch: 'eP' }),   // -> eO: the band's own voice
      bus({ centre: '...', left: '...', right: '...', duck: 'dA*gBeat', ...B.room }),       // B.room: { size, damp }
    ],
    presets: { ... },
  });
}
main(build, import.meta.url, { node: B.matchNode, layers: PARTS });
```

What `band(name)` returns, all plain data and functions:

| Field | What it is |
|---|---|
| `name`, `label` | `'folk'`, `'Plucked folk'` |
| `tempo` | `[slowest, fastest, typical]` from the table; a track's own range must lie inside it (`band.checkTempo(tempo)` throws otherwise) |
| `defaults` | `{ inst, space, bright }`: spread into `assemble`'s defaults; the track may override any |
| `room` | `{ size, damp }`: spread into `bus()`, which already takes both |
| `range` | the lead's playable notes `[low, high]` as MIDI numbers, in the form `melody()`'s `voice` option already accepts, so a line written too high or low for the band's lead is refused at build time with the note to write instead |
| `drums({ role: row, ..., noise })` | the kit: one voice per role given, each `<role-id>O`; refuses a role the band has not got ("musicbox has no kick: its roles are mechanism") |
| `bass(id, { trig, semis, note })` | `<id>O`, follows `tr` (chords and Key) like `roundBass`; `semis` is semitones above the root (a number or a noteRow's id), as in compose.js |
| `chords(id, { trig, pick, extra, dip })` | `<id>L`, `<id>R` (or `<id>O`); plays root, third, fifth from `chords()`; `pick` is the id of a noteRow of chord-tone numbers (0 root, 1 third, 2 fifth, 3 octave, as `chordTone(id, pick)` takes them), required by the four bands whose chord voice plays one note at a time (`chip`'s `chipArp`, `musicbox`, `steelpan`, `marimba`); `extra` is a semitone row for added notes (sevenths), `dip` an expression (0 to 1) that pulls the chord voice back (section 7); each of the three is refused by a band whose chord voice would ignore it (`takesPick`, `takesExtra`, `takesDip` say which). No chord voice takes `semis`, so every band refuses it rather than read a semitone row as chord-tone numbers or drop it |
| `lead(id, { trig, pitch, vel })` | `<id>O`: the band's signature voice on any melody line |
| `colour(id, { input })` | optional: nodes that colour the tune after `instruments()` (section 4.3); `null` for bands without one |
| `finish({ left, right })` | optional: nodes after the bus, and the `out` pair for `assemble` (only `lofi` has one: section 4.4) |
| `matchNode` | the node `--match` must level: `'lF'`, or the colour chain's last node |
| `startGains` | fifteen gains (the ten instruments, then the five that play along) measured on the band's probe track (section 6): what a new track's `GAINS` starts as, and the `start` the band test gives `matchGains`. `--match` itself does not use them (section 7) |
| `mix` | suggested part levels (drums, bass, chords, lead) measured on the probe, so the tune leads in 300 to 1200 Hz |
| `tags`, `words` | for the patch's `tags` and `meta.words`: the band's name and what a person would type ("folk", "plucked", "strummed", "village"...); never a word from the banned list of section 8, which a test checks (section 6) |


Every voice the band uses is also exported by itself from `sound/voices.js` (`strum`, `tine`, `drawbarOrgan`, `steelPan` ...), so a composer can borrow one voice from another band without taking the band.

### 4.2 Chords with sevenths

`chords()` knows triads and sus chords only, and the library test counts chord order from `root`, `third` and `fifth`. A band does not change that. `lofi` (and anyone else) adds sevenths and ninths through the chord voice's `extra` row, a `noteRow` of semitones above the root the composer writes per bar. The chord the checker looks for is still the triad, which the seventh does not hide (two of the bar's three strongest notes still belong to it).

### 4.3 The tune, and the five instruments

The tune is played by `instruments()`, so the `inst` control works the same in every track: the ten names, in order, level-matched. (Guitar, Piano, Violin, Trumpet and Bass, and the `along` control that lets one of them play the chords under the tune, were added on 2026-11-22; they are synthesiser sketches like everything else here, and no name, tag or description may promise a real instrument or a voice. The sixth option sketched below, "Band", is still not made.) A band changes the tune's sound in only two ways, both of which the kit already allows:

- **its default `inst`** (the table's last column), which the specification may override;
- **an optional colour chain after `lF`**, which compose.js names as the way to shape the tune without breaking level matching ("shape what comes after it instead ... name the node you end on and run `--match` again"). Bands that have one: `lofi` (pitch wobble by a short modulated `delay`, then `crush` and a low-pass), `twang` (the spring), `synthwave` (`tempoEcho`), `darkambient` (a long `tempoEcho` with a dark tone), `rock` (light drive and cabinet low-pass). `B.matchNode` names the end of that chain.

This leaves one real limit: **the tune itself, the loudest and most remembered part, is still one of the same ten timbres in every band.** A folk track's tune on "Plucked string" and a music-box track's tune on "Bell" will sound like each other's tunes more than their bands do. The design that would fix it is a sixth `inst` option, **"Band"**, appended at index 5: the band's lead playing the tune. It is additive (indices 0 to 4 keep their meaning, `quality/sound.js` accepts any option count of two or more, the engine checks `max = options.length - 1`, old tracks keep five), but it **changes a rule of style guide §12** ("exactly these five, in this order"), and `instruments()`, `matchGains` and `measureInstruments` would need a six-gain path. That is a decision for the owner of the style guide, recorded here, and not part of this addition. Until it is made, a band track puts the band's lead on the counter-line, echo or answer phrase, so the signature voice is heard in every track at intensity 1.

### 4.4 The lo-fi finish

`bus()` ends in the limiter (`mL`, `mR`), and `assemble` already takes `out`. `lofi.finish({ left: 'mL', right: 'mR' })` returns a `crush` (about 11 bits, 18 kHz) and a 5 kHz low-pass per channel and the `out` pair to pass to `assemble` (`['tpL', 'tpR']`). Nothing in `bus()` changes. No other band needs a finish.

### 4.5 Where a band is recorded

In `tags` (the band's name) and `meta.words`. A `musicStyle` facet in `catalog/schema.js`, so the site can filter by band, is worth adding once there are enough tracks to filter, as its own small change: `validateMeta` would refuse an unknown field today, so it cannot ride on this addition.

## 5. Keeping every existing track byte-identical

The guarantee already exists: `tests/unit/compose-tracks.test.mjs` regenerates each kit track and compares it with `sounds/<id>.json` byte for byte, runs `battle_theme.py` the same way, and pins every music track's SHA-1 in `PINNED`. This addition adds no exception to it and keeps it green unchanged. On top of that:

1. **Before the first line of code**, record the fingerprint of every file in `sounds/` (not only music: it costs nothing) and of `sound/compose.js`:
   ```
   shasum sounds/*.json sound/compose.js > <scratch>/before.sha
   ```
2. **After the change**, regenerate all six music tracks into a scratch folder and compare each with the file in `sounds/`; then repeat the fingerprints. The five `.mjs` generators take `--out`. `battle_theme.py` has no `--out` (it always writes `../../sounds/battle-theme.json` next to itself), so it is copied into a scratch tree and run there, which is what `compose-tracks.test.mjs` does:
   ```
   for f in tools/compose/*.mjs; do grep -q 'export function build' $f && node $f --out <scratch>/$(basename $f .mjs | tr _ -).json; done
   mkdir -p <scratch>/py/tools/compose <scratch>/py/sounds
   cp tools/compose/battle_theme.py <scratch>/py/tools/compose/ && python3 <scratch>/py/tools/compose/battle_theme.py
   cp <scratch>/py/sounds/battle-theme.json <scratch>/battle-theme.json
   ls <scratch>/*.json | wc -l          # 6
   for f in <scratch>/*.json; do cmp $f sounds/$(basename $f); done
   shasum sounds/*.json sound/compose.js | diff - <scratch>/before.sha
   ```
   The count must be 6 and the `cmp` and `diff` lines silent. `node --test tests/unit/*.test.mjs` must pass with no test edited.
3. **What the diff may contain:** two new files (`sound/voices.js`, `sound/bands.js`), one new test file, this document, and one appended line at the end of `kit.mjs`:
   ```js
   export * from '../../sound/bands.js';
   ```
   (`bands.js` re-exports `voices.js`.) That is the only edit to `kit.mjs`: no `start` option for `run()` (section 7). `git diff --stat` on any other existing file must be empty.
4. **Name clashes.** Two silent failures, one loud one:
   - a name exported through `export *` by two modules (say `compose.js` and `bands.js` both exporting `shaker`) is ambiguous and is **dropped from `kit.mjs`'s exports** without an error. `import * as kit` simply lacks it. Only a generator that imports that name explicitly (`import { shaker } from './kit.mjs'`) fails, with a SyntaxError at load time;
   - a name that `kit.mjs` exports itself (`writePatch`, `run`, `main`) **shadows** any star export of the same name, again with no error, so a `run` in `bands.js` would never be reached through the kit;
   - the same holds one level down: a name that `bands.js` defines and `voices.js` also exports is shadowed inside `bands.js`'s own `export *`.
   So `voices.js` and `bands.js` export no name that `compose.js` or `kit.mjs` exports (no second `chorus`, `clap`, `shaker`, `run`, `main`, `writePatch`...) and none that the other exports, and a test says so (section 6).
5. **No shared state.** `bands.js` and `voices.js` import from `compose.js` (`KitError`, `param`, the exported constants) but never change what they import: no pushing onto `INSTRUMENTS`, no editing `DEFAULT_GAINS` or `INSTRUMENT_RANGES`. compose.js's small private helpers (`num`, `inParens`, `voiceId`, the option checks) are copied into `voices.js`, not exported from compose.js, because exporting them would be an edit to compose.js.

When a band track is later added to `sounds/`, it gets its `PINNED` row and its name in the generator list of `compose-tracks.test.mjs` in that track's own change, as every new track does.

## 6. Tests

A new file, `tests/unit/compose-bands.test.mjs`, plus one slow manual step. Each test renders at a low sample rate where it can, like `--measure` does, so the file runs in a couple of minutes.

**The probe.** `bands.js` exports `bandProbe(name, gains)`: one fixed 8-bar track (chords `C Am | F G | C Am | F G`, a drum row per role, a bass row, a tune, an answer line on the band's lead) built with that band, with three presets (`calm`, `busy`, `full`, at intensity 0.3, 0.7 and 1) as style guide §12 asks of every track. It returns `{ patch, parts }`, where `parts` is `{ drums, bass, chords, lead }`: one expression per part over the probe's nodes, in the shape of thornwood's `PARTS`, for `measureLayers` and the per-part test below. It is a function in `sound/`, not a generator in `tools/compose/` (the generator list test would catch an `export function build` there), and the site's band demo can use it later.

**Drum pitch lists.** The test file holds two lists, and a test checks that they are disjoint and that together they are exactly the drum voices of section 9 plus the existing drums the bands use:
- **pitched** (follow `tr` to a chord tone): `kickDrum`, `tomDrum`, `handDrum`, `chipKick`, `timpani`, `dustyKick`, `heartbeat`, `metalHit`, `clave`, `cowbell`, `woodblock`, `logDrum`;
- **unpitched** (no stable fundamental): `snareDrum`, `hatDrum`, `clap`, `shaker`, `chipSnare`, `chipHat`, `gatedSnare`, `cymbalSwell`, `tambourine`, `mechanism`, `brushSnare`, `ride`, `rimClick`, `dustySnare`, `dustyHat`, `crackle`, `crash`, `guiro`.

| Test | What it proves |
|---|---|
| The registry | `BANDS` lists the twelve; every band has every field of section 4.1; `tempo` is in order, slowest ≥ 64, typical inside; `band('nope')` throws a KitError naming all twelve |
| The probe builds | For every band, `bandProbe(name)` passes `assemble` and `validatePatch`, and `lint` gives nothing at all (the probe has the three presets) |
| Fair names | Every band's `label`, `tags` and `words` avoid a banned list, matched as whole words and case-insensitively: "acoustic", "authentic", "orchestral", "real", "live", "vocal", "choir", "voice", and a list of brand names (instrument makers, consoles, products, and model numbers such as drum-machine names) kept in the test. This is what makes section 8's "nothing promises real instruments or vocals" a check and not a hope |
| Every voice | Each voice of `voices.js` by itself: silent before its trigger, sounds after it, no NaN or infinity, finished level within 0.5 to 1.5 peak, DC under 2% of RMS, no energy left 2 s after a one-shot drum |
| Pitched voices land on pitch | Each pitched melodic voice played at A3 and A4: fundamental within 15 cents (autocorrelation; for `modal` voices, the lowest partial), and moved by exactly the Key control's semitones. Each drum in the **pitched** list, played under a C chord and then an A minor chord, at Key 0 and Key +3: its fundamental (lowest partial) is a tone of the sounding chord within 15 cents, and moves with the chord and the Key (compose.js's rule: a drum that rings on a note of its own is heard as a wrong note in every bar) |
| Unpitched drums have no pitch | Each drum in the **unpitched** list: no stable fundamental (its autocorrelation peak stays under a threshold set in the test), so it cannot clash with any chord |
| The convention | Every voice is `name(id, { options })`, its finished sound is `<id>O` / `<id>L`,`<id>R`, `<id>A` its envelope, option names from the convention list (the pattern of `compose-convention.test.mjs`, run over `voices.js`) |
| No name clashes | The own exports of `voices.js` and of `bands.js` share no name with `compose.js`'s exports, with `kit.mjs`'s own exports (`writePatch`, `run`, `main`), or with each other. Every name `kit.mjs` exported before the change is still exported and is the same function (`kit.instruments === compose.instruments` ...), and every name of `voices.js` and `bands.js` is exported by `kit.mjs` and is the same function. The last two catch what the first misses: a name dropped by an ambiguous `export *` or shadowed by a local export raises no error, it is just absent or different |
| No shared state touched | `INSTRUMENTS`, `DEFAULT_GAINS`, `INSTRUMENT_RANGES`, `LENGTHS`, `KEY_RANGE` deep-equal their values before importing `bands.js` |
| `instruments()` is untouched | `instruments('l', { gains })` gives the same nodes, byte for byte as JSON, with and without `bands.js` imported |
| The ten still level, and the five that play along sit 4 dB under the tune | For every band, the test calls `matchGains((g) => bandProbe(name, g).patch, { node: B.matchNode, start: B.startGains })` directly (not through `--match`, which cannot take a start, section 7); it leaves the five within 1 dB, and `startGains` stays within 1.5 dB of what is measured, so a stale table fails |
| The bands differ | The point of the work, tested **per part**, so two bands cannot pass on their lead alone while sharing a bass or a kit. Each probe at the same tune, chords, tempo, `inst` and intensity 1 (the test sets Speed to 100 bpm and `inst` to "Synth lead" for every probe, widening the probe's Speed range in the test where 100 bpm is outside the band's own, so no band passes on its tempo or its default instrument) is rendered once per part of its `parts` (drums, bass, chords, lead), by the test's own step, not by `measureLayers`: the test appends an `expr` node for the part's expression, points the patch's `out` at that node and renders the result with `renderPatch`. (`measureLayers`, through `layerLevels` in `sound/compose.js`, also appends `expr` nodes, named `zzLayer<i>`, but it never changes `out`: it ticks a `createVoice` and reads those nodes' values sample by sample to get a level, so it produces no render that `fingerprint` could take.) Each part's render gets `fingerprint` from `sound/analyze.js` plus its share of energy in eight octave bands. For every part, every pair of bands must be further apart (`fingerprintDistance`) than either band is from itself rendered with a second seed, by a margin set from the first measurement and written into the test. The full mix is compared the same way. Excused by name: the drums part of `musicbox` (its only drum is the quiet `mechanism` click), and, at the probe's `calm` preset if the test is ever extended to it, the drums of `organ` (none) and `darkambient` (only `heartbeat`) |
| The voices differ by sound alone | The probe test still lets two bands pass on rhythm alone: a band whose bass is replaced by another band's keeps its own bass row, and that row alone kept the two apart. So each band's own voices are also played with every band's rows taken away: its bass, its lead (on G4, inside every band's range), its chord voice (the bands that play chords one note at a time on the same chord-tone picks) and its whole kit (every role at its kit level), each from one shared row of four beats, in C, at 100 bpm, rendered at 16 kHz for 4 s with seeds 1 and 2. For each of the four, every pair of bands must be further apart (`fingerprintDistance`) than either is from itself with the second seed, by a margin set from the first measurement and written into the test. This is what makes section 3's "every band's bass differs from every other band's in waveform or excitation" a check, for the lead, chord voice and kit too. Excused: the kit of `musicbox`, as above |
| Ranges | A line outside `B.range` is refused by `melody(..., { voice: B.range })` with the note to write |
| Room and finish | `B.room` spreads into `bus()` without error; `lofi.finish` returns two nodes per channel and an `out` pair that `assemble` accepts |
| Node budget | Every probe has at most 140 nodes, counting every per-voice `reverb` and `delay` (`synthwave`'s `gatedSnare` reverb, `twang`'s `spring`, the `chorus` inside `rotary`) as well as the bus's own; at most one per-voice `reverb` per band (only `synthwave` has one); and renders no slower than the slowest of the six existing music tracks rendered on the same machine in the same test run, which is where a reverb's real cost shows. The test renders the first 1.5 s of each probe and each track with `renderPatch` (its default 44.1 kHz, `maxSeconds: 1.5`); speed is per sample, so those 1.5 s stand for 8 bars. A looped music patch is rendered twice over (two passes, the second kept, as `renderPatch` does with `wrap`), so the test counts twice the rendered duration, 3 s of sound, against the wall-clock time. The tracks and the probes take turns, three rounds, and each keeps its fastest render, so a busy machine slows them all alike and one stall does not fail the test. The bar is relative because a fixed speed floor does not hold: measured separately on 2026-11-19 (`renderPatch`, 44.1 kHz, 8 bars, not the test's method), `thornwood-overworld` has 91 nodes and renders at 2.23 times real time, `battle-theme` 85 nodes at 2.17, `hearthvale-village` 114 at 1.51, `hearthvale-battle` 113 at 1.44, `derelict-run` 110 at 1.57 and `derelict-boss` 112 at 1.51, so four of the six would already miss a 2 times floor; `reportPlan` in `sound/compose.js` likewise says a 90-node track renders at 1 to 2.5 times real time |

The existing tests run unchanged and must pass: `compose-tracks` (byte identity and pins), `compose-library` (no shared chord order or tune; a band track is just another track to it), `compose-convention`, `compose-kit`, `quality-sound-*`.

**The slow step, not a unit test:** `node tools/sfx.mjs check` on each band's probe written with `--out` to a scratch file (about 6 CPU-minutes each, about 70 for twelve), and `node tools/compose/verify_music.mjs` for the chords per bar. Its result goes in the change's report. The bands most likely to fail it are named in section 7.

## 7. Level matching per band (`--match`)

Nothing new in the mechanism. `--match` runs `run()` in `kit.mjs`, which calls `matchGains(build, { node })`: it measures the node it is given for each of the ten instruments and returns fifteen gains: the ten that level them to "Synth lead", then the five that set Guitar, Piano, Violin, Trumpet and Bass 4 dB under the tune when they play along. `run()` passes no `start`, and `main(build, url, opts)` passes only `{ node, layers }` on to it, so **`--match` always starts from `DEFAULT_GAINS`**, whatever the track's `GAINS` are. This addition leaves that as it is (giving `run()` a `start` option would be a second edit to `kit.mjs`, against section 2 rule 1). Per band:

1. The generator passes `node: B.matchNode` to `main()`: `lF` for bands with no colour chain, the chain's last node otherwise. Levels are matched where the listener hears them, after the colour.
2. A new band track's `GAINS` starts as `B.startGains`, so its first `--measure` already shows the ten close to level. `--match` then measures from `DEFAULT_GAINS`; when the chain after `lF` is linear the gains it returns do not depend on where it started, so one pass is enough. `startGains` is used as a `start` only by the band test (section 6), which calls `matchGains(build, { node, start })` directly.
3. When the colour chain is not linear (`lofi`'s crush, `twang` and `rock`'s drive), compose.js says to run `--match` again, but with the kit as it is a second `--match` starts from `DEFAULT_GAINS` again and returns the same gains. The second pass is therefore done with a two-line script that imports the generator's `build` and calls `matchGains(build, { node: B.matchNode, start: firstPassGains })`, and its gains are written in. If that proves common, a `start` option for `run()` is a small later change to `kit.mjs`, with its own review.
4. Matching stays **per track**: level depends on the tune's register and rhythm, which is why the kit never had one table for all tracks. `startGains` is a start, not an answer.
5. Beyond the ten, a band brings its own balance problem: its chord voice and lead sit in the tune's 300 to 1200 Hz band (strums, organ, pans, marimba). `B.mix` gives starting part levels from the probe, and the `--measure` layer report (`PARTS` in the generator, as in thornwood) must show the tune at least 3 dB over the backing in that band for every instrument, at intensity 1. Thornwood's `arpDip` (the arpeggio pulled back while the tune plays) is the pattern; bands with busy chord voices (`folk`, `steelpan`, `marimba`, `organ`) expose a `dip` option on their chord voice that does the same, and so do `synthwave`, `orchestra` and `darkambient`, whose held chords sit in that band too. `band().chords` refuses `dip` for the other five (`chip`, `musicbox`, `twang`, `lofi`, `rock`), as it refuses `extra` where the voice would ignore it, and a test checks that a full dip silences the chord voice of each of the seven.

**Bands that need care with the checker:**

- `darkambient` and `musicbox` have little or no beat, and `check` requires the detected pulse within 2 bpm of the written tempo. Both bands therefore keep a soft pulse on every beat at every intensity (`darkambient`'s **heartbeat**, on the row `X...X...X...X...`, and `musicbox`'s **mechanism** click, `x...x...x...x...`, at a level that reads as texture). On `darkambient`'s probe at its 72 bpm, `pulse()` from `sound/analyze.js` (22.05 kHz, 8 bars, 2026-11-19) reads 72 bpm first at intensity 0.3 and 1, at strength 0.46 to 0.47; an earlier heartbeat row with hits on beats 1 and 3 only (`X.x.....X.x.....`) also read 72 first but at only 0.27 to 0.32, with 143.5 bpm close behind at 0.23. That is the unit-level measure only: `check` itself has not yet run on the probe (section 6). If that is not enough, the alternative is a checker change for beatless music, which is a quality-bar decision, not this addition.
- `orchestra`'s slow string attack and `darkambient`'s drone can push the chord check (two of a bar's three strongest notes in its chord) late into each bar; their chord voices start each bar with a short attack component so the bar's chord is clear early.
- `lofi`'s crush and `rock`'s drive add harmonics that the "pitched energy outside the written chords" warning may count; measure on the probe first and report.

## 8. What synthesis cannot do here, and must not be promised

Say these plainly in the asset plan, the site and every track description.

- **Real instruments.** No band sounds like a recorded violin section, trumpet, nylon guitar, piano, pipe organ, steel band or drum kit. Each is a synthesiser's sketch of one: "synth orchestra", "plucked folk", "electric piano" are fair names; "orchestral", "acoustic", "authentic", "real", "live" are not. Descriptions say "synthesised". The banned words (these, plus "vocal", "choir", "voice" and brand names) are checked by the "Fair names" test of section 6 on every band's `label`, `tags` and `words`.
- **Voices of any kind**: no singing, no choir, no "ooh" or "aah" pads presented as voices, no words.
- **Expressive playing.** Melodies are monophonic rows on a 16th-note grid, with velocity and a short glide. There are no bowing changes, breath, string bends beyond the glide, vibrato that swells per note, rubato, accelerando, or dynamics beyond layers, velocity and the Intensity control.
- **Other meters.** Every bar has 16 steps and every row divides 128: no 3/4 waltz, no 6/8 or 12/8 jig, no true triplets. A shuffle comes only from the clock's swing. Folk and twang bands will feel "straight-ish"; that is a limit of the kit, not of the band.
- **Tempos under 64 bpm** (the 120 s limit at 32 bars), so true slow ambient and ballads sit at 64 bpm or above, written half-time if needed.
- **Spaces.** There is one algorithmic reverb on the bus, and "hall", "chapel" and "spring" are settings of it, not convincing rooms. A voice can have its own `reverb` or `delay` (`synthwave`'s `gatedSnare` runs its snare into its own short reverb; `twang`'s `spring` is a per-voice feedback delay), but each costs nodes and render time and is counted in the node budget (section 6). There is no convolution, so no measured room or real spring can be reproduced.
- **Authentic machine sounds.** "Chiptune" is chip-like, not a console's sound chip: no periodic-noise generator, no exact channel limits, no hardware quirks. The rotary organ is a tremolo and chorus, not a rotating speaker. Tape and vinyl are a crusher, a low-pass, a wobble and crackle.
- **Brand and artist likeness.** No band is named after or presented as a product, console, instrument maker or artist, and tracks are never described as "in the style of" a real composer or game.
- **Judgement by ear.** Every claim in this design is checked by measurement: levels, pitch, spectra, the distance between bands. None of it says a band sounds good or sounds like its name. The probe of each band must be listened to by a person before the band is used for a track that ships, and the review protocol should say so.
- **Speed in the browser.** Bands with many oscillators (`orchestra`'s string section, `organ`'s drawbars) cost more to render; the node budget in section 6 keeps them near today's tracks (85 to 114 nodes, about 1.4 to 2.2 times real time when measured on 2026-11-19), and a band whose probe renders slower than the slowest existing track on the same machine is cut down, not shipped.

## 9. Where the code goes

| File | New or changed | What is in it |
|---|---|---|
| `sound/voices.js` | new | Every new voice of section 3, by band: `chipLead`, `chipArp`, `triBass`, `chipKick`, `chipSnare`, `chipHat` (chip); `sawLead`, `gatedSnare` (synthwave); `brassSection`, `stringSection`, `lowStrings`, `timpani`, `cymbalSwell` (orchestra); `strum`, `tambourine` (folk); `tine`, `lowTine`, `mechanism` (musicbox); `drawbarOrgan`, `rotary`, `pedalBass`, `brushSnare`, `ride` (organ); `twangGuitar`, `spring`, `mutedStrum`, `uprightBass`, `rimClick` (twang); `steelPan`, `bassPan`, `clave`, `cowbell` (steelpan); `electricPiano`, `warmBass`, `dustyKick`, `dustySnare`, `dustyHat`, `crackle`, `tape` (lofi); `glass`, `drone`, `wind`, `subDrone`, `heartbeat`, `metalHit` (darkambient); `driveLead`, `powerChord`, `rockBass`, `crash` (rock); `marimba`, `bassBar`, `woodblock`, `guiro`, `logDrum` (marimba). In the kit's convention. No name is shared with `compose.js`, `kit.mjs` (`writePatch`, `run`, `main`) or `sound/analyze.js` (which is why darkambient's beat is `heartbeat`, not `pulse`). Browser-safe, imports only from `compose.js` and `sfx-engine.js` |
| `sound/bands.js` | new | `BANDS`, `band(name)`, `bandProbe(name, gains)`, each band's table row, `startGains` and `mix`; re-exports `voices.js` |
| `tools/compose/kit.mjs` | one line appended | `export * from '../../sound/bands.js';` |
| `tests/unit/compose-bands.test.mjs` | new | Section 6 |
| `sound/compose.js` | **not changed** | Its header's voice list could later point at `bands.js`; that is a separate edit, after this one is reviewed |
| `skills/sprite-forge/SOUND.md`, style guide §12 | not changed by this addition | After review: one paragraph in each saying "pick a band", and the "Band" sixth option if the owner agrees to it (section 4.3) |

Order of work: fingerprints first (section 5, step 1); `voices.js` and its voice tests; `bands.js` with the first eight bands and the probe; the distinctness test, whose margin is set from the first measurement; the slow `check` step on eight probes; listening by a person; then the remaining four bands.
