# Loadout: how to compose good game music

Written 2026-11-25 from the Loadout docs and code named below and from published talks, interviews and
teaching material (the Sources section at the end). **Nobody listened to anything for this guide.** It teaches
what composers and teachers say makes a game track good, and turns each point into something you can write
in a generator and check in the note data.

The other music docs are rules: `docs/style-guide.md` §12 (controls, lengths, instruments),
`docs/music-styles.md` (the twelve bands), `docs/quality-bar.md` §2 to §4 (checks and the rubric),
`.claude/skills/sprite-forge/SOUND.md` "Music" (the steps). This guide is craft. **Where craft and a rule disagree,
the rule wins**, and the disagreement is listed in section 16 for the owner.

How to read it: sections 1 to 9 are principles, each ending in "In Loadout". Section 10 is one page per game
moment. Section 11 is how a kit's tracks become one soundtrack. Section 12 is how to judge a track you
cannot hear. Section 13 is a worked example. Section 15 is the checklist.

---

## 0. What is fixed, and what is yours

Read this first: most of the advice on the internet assumes freedoms a Loadout track does not have.

| Fixed by the rules or the kit | Where it is said |
|---|---|
| One 16th-note clock; every bar has 16 steps. No 3/4, no 6/8, no true triplets; a shuffle comes only from `clock({ swing })` | music-styles §8 |
| The loop is 8 bars. Every row (drums, notes, tune, chords) is 1, 2, 4 or 8 bars long and must divide 128 steps | `sound/compose.js` header |
| **The tune is at most 8 bars.** The 16, 24 and 32-bar versions play the same 8 bars again with more layers; there is no second tune | `melody()`, `arrangement()` |
| One chord per bar, eight bars of chords at most; triads and sus chords only (`G`, `Em`, `dim`, `aug`, `sus2`, `sus4`) | `chords()` |
| Lengths 8, 16, 24, 32 bars. The 8-bar version is the full band (section 4); longer versions add earlier, thinner sections in front | style guide §12, `sectionAt()` |
| At most 120 s for 32 bars at the slowest tempo, so no tempo under 64 bpm | `MAX_SECONDS` |
| Ten melody instruments behind `inst`; the tune must be playable on all ten: C4 to F#6 as written, range at most two octaves | style guide §12, `INSTRUMENT_RANGES` |
| The tune is all there by Intensity 0.4; at Intensity 0 the track is still music | compose.js "learned the hard way" |
| The listener can change tempo, key (-5 to +6), brightness, room, instrument and a second instrument that plays along | style guide §12 |
| One tempo and one key for the whole loop: no speeding up, no slowing down, no key change inside a track | the kit has no such thing |
| No two tracks share a chord order, a tune, a run of 8 notes that move the same way, or more than one bar of tune rhythm | `tests/unit/compose-library.test.mjs` |
| Names and descriptions use no music-theory words | check A-words |

What is yours: the chords, the tune, the answer line, every drum and bass row, which band, which voice plays
each layer, the order layers enter, the mix, the three styles, and what happens in bars 4 and 8.
That is enough room for a track to be dull or to be good.

---

## 1. What "good" means for game music

A film cue is heard once. A game track is heard for as long as the player stays, which nobody controls. Darren
Korb, who scored *Hades*, makes this point about never knowing how long a player will hear a piece. So a good
game track does four jobs at once:

1. **It tells the player where they are and how to feel** within two bars: safe, curious, hunted.
2. **It has one idea worth remembering** (a hook), so the game has a sound of its own.
3. **It survives repetition.** Koji Kondo's own test is to lean back and listen to a finished track for hours;
   if he cannot, he treats the track as having a problem. He also checks whether he wants to move to its beat.
4. **It stays out of the way**: of sound effects, of the player's thinking, of the next track.

Kondo's 2007 talk named three things he composes for: **rhythm** (the music fits the timing of the character
and of the player's button presses), **balance** (music against sound effects, and the whole soundtrack as
one piece), and **interactivity** (the music answers what the player does). Sections 4, 8 and 11 are about
balance, sections 3 and 10 about rhythm, section 6 about interactivity.

**In Loadout.** The reviewer scores `brief`, `signal`, `structure`, `controls`, `ready` (quality-bar §4).
None of those rows says "has a hook" or "does not tire". A track can pass at 11 of 15 with a tune that is a
scale run. Jobs 2 and 3 above are therefore the composer's own responsibility, and section 12 gives the checks
that stand in for an ear.

---

## 2. The hook and the motif

### 2.1 A motif is small

A motif is the smallest idea a listener can recognise: **3 to 6 notes with one clear rhythm and one clear
shape**. A whole 8-bar tune is not a hook; the cell it is built from is. Winifred Phillips describes cutting a
long main theme down to a five-note fragment for menus and stingers because the fragment was what players
recognised. Analyses of *Undertale* make the same point: its motifs are simple, so they can be slowed down,
re-harmonised and passed between tracks and still be known.

What makes a cell stick, in checkable terms:

| Property | Rule of thumb |
|---|---|
| Rhythm first | The rhythm must be recognisable when tapped on a table. Use at least two note lengths (long + short). A row of equal 8ths has no rhythm to remember |
| One feature interval | One leap that is the cell's "face": a fourth, fifth, sixth or octave. Everything else moves by step or along the chord |
| A place to land | The cell ends on a longer note, on a chord tone, on a strong beat (beat 1 or 3) |
| Short | It fits in one bar, two at most, and leaves a gap after it |
| Sayable | You can describe it in one sentence: "up a fourth, two steps up, hold" |

### 2.2 Say it, say it again, change it

The most common mistake in generated tunes is eight bars of new material: nothing returns, so nothing is
remembered. The opposite mistake is the same bar eight times. Teaching material on melody agrees on the middle
road: state the idea, repeat it (exactly or moved to other notes), then vary or break it.

Ways to repeat without copying, all of which keep the rhythm and so keep the identity:

- **Sequence:** the same shape starting on another note (bar 1 on the first chord, bar 2 a step or a third
  lower or higher, fitted to the new chord).
- **Same rhythm, new notes:** keep the rhythm exactly, let the notes follow the chord.
- **Same start, new ending:** bars 1 and 5 open the same way and end differently (question, then answer).
- **Fragment:** use only the first half of the cell, twice as often, to push toward a cadence.
- **Turn it over:** where the cell went up, go down (inversion). *Celeste* uses a rising theme for the climb
  and a falling one for grief.
- **Stretch it:** the same notes at half speed, as a slow version for a calmer track (section 11).

A useful target for an 8-bar tune: **the main rhythm appears in 3 to 5 of the 8 bars, 1 or 2 bars vary it, and
1 or 2 bars contrast with it** (usually bars 4 and 8, which are long notes or space).

**In Loadout.** The tune is `TUNE`, a list of eight strings of 16 tokens, passed to `melody('l', TUNE)`. Write
bar 1, then build bars 2, 3, 5 and 6 from it by hand. `eightBars(bar, changes)` builds eight bars from one bar
with some replaced; it is meant for drum and note rows but takes melody tokens too, which is handy for an
ostinato. The comment above `TUNE` in every generator already describes each bar in words (see
`thornwood_keep.mjs`): write that comment **first**, as the plan, naming the cell.

---

## 3. Melody: contour, phrases, rhythm

### 3.1 Contour

Contour is the line the tune draws: up, down, arch.

- **One peak.** The highest note is heard once (or once per 8 bars), on a strong beat, somewhere between
  half-way and three-quarters through: bars 5 to 7 of 8. Ableton's melody guide and classroom texts both put
  it this way. A tune that touches its top note in bars 1, 3, 5 and 7 has no peak.
- **Balance.** What goes up comes down by about as much. After a leap, move by step in the other direction
  (leap up a sixth, step down). Leaps between notes of the chord are the exception: they sound complete as
  they are.
- **Mostly steps.** Aim for at least half of all moves being steps or repeated notes, most of the rest thirds
  along the chord, and one to three larger leaps. The style guide says "mostly steps and one leap" and allows a
  hook that runs up or down a chord when the specification asks for it.
- **Range.** Most tunes people can hum stay within a tenth (an octave and a third). Loadout allows two
  octaves; treat that as a wall, not a target. A narrow tune also keeps every one of the ten instruments in
  its good register.
- **A low start gives room.** Start in the lower half of the range so the peak is a real arrival.

### 3.2 Phrases: question and answer

Listeners hear tunes in 2- and 4-bar units that end in a **cadence** (a point of rest). Two classical shapes
fit 8 bars exactly, and both suit a loop:

| Shape | Bars 1-2 | Bars 3-4 | Bars 5-6 | Bars 7-8 | Feels like |
|---|---|---|---|---|---|
| **Period** (question, answer) | idea | contrast, ends **open** (on the V chord, or on a note that is not the home note) | idea again | contrast, ends **more closed** | balanced, song-like: title, village, overworld |
| **Sentence** (short, short, long) | idea | idea again (on the next chord) | fragments of the idea, faster chord changes | drive to a cadence | pushing forward: battle, boss, level |

"Open" and "closed" are about the last note and chord of the phrase. Ending a phrase on the home note over
the home chord is a full stop. Ending on the second, fifth or seventh note of the scale over the V chord is a
question mark. A question at bar 4 and an answer at bar 8 is the oldest trick there is for making 8 bars feel
like one thought.

**Call and response** is the same idea between two voices: the tune speaks for two beats to two bars and stops;
another voice replies in the gap. It does three jobs: it gives the tune air, it makes the second voice
audible, and it halves how often the listener hears the lead timbre.

### 3.3 Rhythm and syncopation

- **The rhythm of the tune must differ from the rhythm of the backing.** If the arpeggio runs 16ths and the
  bass 8ths, a tune in straight 8ths disappears. Give it longer notes and off-beat starts.
- **Syncopation** is a note that starts off the beat and is held over the next beat. It is what makes a tune
  feel alive. Common cells on a 16-step bar: **3 + 3 + 2** (steps 0, 3, 6: the "tresillo"); a note pushed an
  8th early (step 14 tied over the bar line, step 6 tied over beat 3); starting each phrase on the "and" of 1
  (step 2), as `thornwood_keep` does.
- **Anchor it.** Two or three of the four beats in a bar should still carry a note or a held note; a line
  that is off the beat everywhere stops sounding syncopated and starts sounding wrong.
- **Space is rhythm.** Half a bar with no new note is not a hole, it is where the answer, the drum fill or a
  sound effect goes.
- **Note length matters as much as pitch.** One long note per phrase gives the ear a place to rest. A phrase
  of only short notes is a run, not a tune.

**In Loadout.**

- One token per 16th: a note name starts a note, `_` lets it ring. There is no rest token: a note rings until
  its envelope ends (the `length` option of `instruments()`; the kit's own note says slow tunes want 1.3 to
  1.6). "Space" means steps with no new note.
- A note marked `-` is softer (0.7), `--` softer still (0.4). Use them for pickups and passing notes so the
  strong notes stand out; this is the only dynamics a tune has.
- Strong beats are steps 0 and 8; beats 2 and 4 are steps 4 and 12. `lint` counts notes that **start** on
  steps 0, 4, 8, 12 and wants at least half of them in the bar's chord (`CHORD_SHARE_MIN`); tunes written to
  their chords score 0.8 to 1.
- Call and response is how every band track is already built: the tune on `instruments('l')`, the answer on
  the band's own voice, `melody('e', ANSWER, { voice: B.range })` into `B.lead('e', ...)`, usually in the
  second half of bars 4 and 8, or of every even bar (`menu_folk.mjs`). This also solves the limit named in
  music-styles §4.3: the tune sounds like one of ten instruments in every band, so the answer is where the
  band's character lives.
- `melody('e', TUNE, { shift, transpose, vel: false })` plays the tune late and moved: an echo line.

---

## 4. Harmony: chords, moods, modes, voice leading

### 4.1 What chords do

Three families, by their job (in C major: I = C, ii = Dm, iii = Em, IV = F, V = G, vi = Am):

- **Home** (I, and its softer stand-ins vi and iii): rest.
- **Away** (IV, ii): motion, opening out.
- **Pull** (V, and vii dim): wants to go home.

A progression is a walk from home to away to pull and back. Counts of chords in popular songs show I, IV, V
and vi doing almost all the work, and show where chords like to go (iii is followed by vi or IV nine times in
ten). That is a description of what sounds normal, which is what you want under an unusual tune and what you
want to break, once, for colour.

### 4.2 Moods as recipes

Roman numerals are counted from the home chord; lower case is minor; "b" means the chord a semitone lower
than in the major scale. Each row gives the idea, not a chord order to copy: **the library test refuses a
chord order another track already has**, so combine halves and run the test.

| Mood | Harmony that makes it | Tune habits | Tempo feel |
|---|---|---|---|
| **Heroic, adventurous** | Major. I, IV, V strong; **bVII and bVI borrowed from minor** for the "big" sound (in C: Bb, Ab); a V chord at bar 8 | Leaps of a fourth and fifth, dotted rhythms, a rising first phrase | medium-fast, marching or galloping |
| **Bright, playful** | Major; I, IV, V, ii; a II major chord for a lifted, floating colour (in C: D) | Short notes, syncopation, repeated notes, grace notes | fast, bouncy; swing helps |
| **Cosy, safe** | Major; I, IV, vi, iii; plagal moves (IV to I) instead of V to I; added sevenths | Steps, small range (a sixth to an octave), long notes at phrase ends | slow to medium |
| **Wistful, bittersweet** | Major that leans on vi and iii; or minor with a major IV | Falling phrases; hold the sixth or seventh note of the scale | slow |
| **Mysterious** | Minor home with chords a third apart that share one note (i to bVI, i to III); sus chords that do not say major or minor; a single aug or dim bar | Few notes, wide gaps, a note held over a chord change so it changes meaning | slow |
| **Tense, wary** | Minor; i held for 2 bars; bII (a semitone above home) or a dim chord before V; chords that change but a bass that does not | Narrow, circling a few notes a semitone apart; off-beat starts | medium-fast with a steady pulse |
| **Battle** | Minor; i, bVI, bVII (the "climb": in Am: F, G, Am) and a **major V** at the end (in Am: E) | Driving 8ths, sequences, a strong cell repeated | fast |
| **Boss** | Minor; the same plus dim chords, the bII, chromatic bass steps; home chord held under changes | Short brutal cell, low register, wide leaps (octave, tritone) used once | fast, or heavy half-time |
| **Triumphant** | Major; IV to V to I arrival; bVI, bVII, I as a fanfare ending | Rising to the home note at the top | medium |

### 4.3 Modes and their colours

A mode is a major or minor scale with one note changed. That one note is the colour; use it on purpose, on a
strong beat, and give it a chord.

| Mode | It is | Colour note (in C / A) | Chord that carries it | Mood |
|---|---|---|---|---|
| Ionian (major) | major | none | I, IV, V | plain bright |
| **Lydian** | major, 4th raised | F# in C | **II major** (D in C) | wonder, floating, sky, magic |
| **Mixolydian** | major, 7th lowered | Bb in C | **bVII** (Bb in C) | heroic, folk, rustic, confident |
| **Dorian** | minor, 6th raised | F# in A minor | **IV major** in a minor key (D in Am) | minor but hopeful: adventure, towns at dusk, wary but moving |
| Aeolian (natural minor) | minor | none | bVI, bVII | sad, serious |
| **Phrygian** | minor, 2nd lowered | Bb in A minor | **bII** (Bb in Am) | dark, ancient, threatening, desert |
| Harmonic minor | minor, 7th raised | G# in A minor | **major V** (E in Am) | drama, a strong pull home: battle, boss |
| Locrian | minor, 2nd and 5th lowered | | i dim | unstable; use a bar of it, not a track |

The library already does this: `menu_folk` is A major with a G chord (Mixolydian), `thornwood_keep` is E minor
with an A major chord in bar 2 (Dorian) and a B major chord in bar 8 (harmonic minor's V), `hearthvale_battle`
is A minor with both D and E major.

### 4.4 Voice leading and the bass line

Voice leading means each note of one chord moves to the nearest note of the next. Two chords that share notes
(C and Am share two) sound smooth; two that share none (C and D) sound like a step or a jolt. Use smooth moves
for calm music and jolts for energy.

- **The bass line is the second tune.** A bass that walks by step (down from the home note, or up toward the
  V) holds a progression together even when the chords are plain. Check the roots of your eight bars as a
  line: does it have a direction?
- **Contrary motion:** when the tune rises, let the bass fall, and the other way round. Tune and bass moving
  the same way in octaves or fifths for more than two notes sounds thin.
- **Pedal:** hold the bass on the home note or on the fifth while the chords above change. It is the cheapest
  tension there is (hold the fifth before a return) and the cheapest calm (hold the home note under I and IV).
- **Root and fifth** is the default bass for a reason: it states the chord without thirds, so it cannot clash
  with a tune that leans on a non-chord note.

**In Loadout.**

- `chords('Em A Em D | C G Am B', { tonic: 'E' })`: one name per bar. A comma after a name drops that root an
  octave and an apostrophe raises it (`D,` `D'`); by default roots sit within a fourth below and a fifth
  above the home note (`low`). **Use the commas to draw the bass line**: this is the only control you have
  over where each root sits.
- A mode is made by its chord. The tune's colour note **must also be in a written chord**: `tuneFit` counts
  the scale as "every note the chords use", `lint` wants three quarters of the tune's notes in it, and the
  checker's M-in-key warning fires when more than a fifth of the pitched sound is on notes no written chord
  uses. A Lydian tune over chords that never include the II major chord will be flagged as out of key.
- No seventh chords in `chords()`. The bands whose chord voice takes `extra` (music-styles §4.2: `lofi` and
  others; `takesExtra` says which) add sevenths and ninths as a semitone row. The checker still looks for the
  triad.
- The bass is a drum row for the rhythm and a `noteRow` of semitones above the root for the notes
  (`'0 0 7 0 12 0 7 0'` is root, root, fifth, root, octave...), into `B.bass('b', { trig, semis })`. A pedal
  on the fifth is a row of `7`s. A walking line uses passing numbers (0, 2, 4 or 3, 5, 7) but remember the
  same row plays under every chord, major and minor, so thirds in a fixed row will be wrong in some bars:
  stick to 0, 5, 7, 12 and steps you have checked against every chord, or use `chordTone(id, pick)`, which
  turns chord-tone numbers (0 root, 1 third, 2 fifth, 3 octave) into the right semitones for each bar.
- Each band has a bass habit (music-styles §3: `chip` walks root, fifth, octave in quarters; `steelpan` plays
  3 + 3 + 2; `lofi` plays beat 1 and the "and" of 2). Start from it; it is half of what makes the band.
- M-chords needs two of each bar's three strongest notes to be in the bar's chord. A tune that sits for most
  of a bar on a non-chord note, over a thin backing, can fail the bar. SOUND.md's lesson also applies: the
  check uses one window per bar, so a single note on beat 1 barely counts.

---

## 5. Counter-melody and the second voice

A counter-melody is a second line that is worth hearing but never competes. The rules that keep it out of the
way:

1. **Move when the tune holds; hold when the tune moves.**
2. **Different register:** a third to an octave away. Above the tune it sparkles and draws the ear; below it
   warms and supports.
3. **Different rhythm:** if the tune is syncopated 8ths, the counter-line is long notes, or the reverse.
4. **Simpler than the tune.** Three or four notes per bar at most.
5. **Land on chord notes** that the tune is not playing (if the tune holds the third, take the root or fifth).
6. **Enter late.** A counter-line that is there from bar 1 is just a thicker tune. Bring it in at the top of
   Intensity or in the last section.

**In Loadout.** The answer line (`melody('e', ...)` on `B.lead`) is the counter-melody. Its layer usually
sits at the top of Intensity (`[0.75, 0.85]`, section 4). Write it after the tune, looking at the tune's
tokens: put its notes where the tune has `_`. It is not covered by the library's tune tests (they read the
`l` line only), which matters in section 11. `doubling(id, { pitch })` adds an octave copy of the tune tuned a
few cents off; `lint` warns about an exact multiple, which cancels part of an instrument.

---

## 6. Arrangement and adaptive intensity

### 6.1 Vertical layering, as the industry describes it

Adaptive music has two families. **Horizontal**: the game jumps between different segments. **Vertical
layering**: one piece keeps playing and parts are added or removed. Loadout tracks are vertical: `intensity`
is the fader the game moves.

What composers who use it say:

- **Design the layers before writing them.** Phillips's advice is to arrange the piece so groups of
  instruments separate cleanly. Unlike mix stems, her layers are "not always meant to play simultaneously":
  every combination the game can reach must be good music.
- **Each stage must stand alone.** The bottom is not "the track with things missing"; it is the calm version.
- **Start sparse and add.** More layers as the situation heats up; layers can also mark progress or place.
  Kondo's examples: percussion that switches on when Mario rides Yoshi; a thin group at the edge of a town and
  the full band at its centre.
- **Layering reacts at once**, which is its strength over jumping between segments.
- **Change density and brightness, not only loudness.** A layer that just makes the track louder is a volume
  knob. Good steps add a new register (bass, then highs), a new rhythm (8ths, then 16ths), or a new role
  (pulse, then backbeat, then counter-line).

### 6.2 What to add first

A general-purpose order, from calm to full, with what each step does to the listener:

| Step | Add | Effect |
|---|---|---|
| 0 | A **bed** that already says the key and the mood: chords or arpeggio, perhaps bass | "you are here" |
| 1 | **Bass** (if not in the bed), or a soft pulse (shaker, hat) | grounding, gentle motion |
| 2 | **The tune** | identity |
| 3 | **Kick** / main drum | body, tempo you can feel |
| 4 | **Snare or backbeat**, fuller hats | drive |
| 5 | **Answer / counter-line**, fills, octave doubling, busier bass | excitement, "everything is happening" |

For action tracks the pulse can come first (`thornwood_keep` has its hat at every Intensity): a battle with no
pulse at low Intensity is not a battle.

### 6.3 Length versions as form

Because the tune is 8 bars, the long versions get their shape from the arrangement, not from new tunes. The
32-bar version is: section 1 (bed only, an introduction), section 2 (the tune enters), section 3 (drums),
section 4 (everything). Then it loops from the fullest point back to the thinnest. That drop **is** the
track's release; it is why a long version tires more slowly than the 8-bar one (section 7).

**In Loadout.**

- `arrangement(LAYERS)` gives each layer a gate `g<Name>` (0 to 1). Each layer has `section` (1 to 4: where it
  first plays in the 32-bar version), `intensity: [from, to]` (the window in which it fades in) and `floor`
  (its level at the bottom of the window instead of silence).
- **The tune's window must end by 0.4** (whole-bundle looks set Intensity as low as 0.4 to 0.5 and must keep
  the melody). So in Loadout the tune enters early, before most drums. This is a real difference from common
  practice; see section 16.
- Windows should not all open at once. Spread them: for example bed `[0, 0.3]` with a floor, bass
  `[0.1, 0.2]`, tune `[0.25, 0.38]`, drums `[0.5, 0.6]`, answer `[0.75, 0.85]` (`menu_folk.mjs`). Leave a
  flat stretch between windows so the three styles (presets) sit on stable ground, not half-way through a
  fade.
- A layer can also **switch a row**, not only fade a voice: `{ id: 'sT', type: 'expr', expr: 'gBusy > 0.5 ?
  sFill : sPlain' }` in `thornwood_keep.mjs` swaps the snare row for one with fills at the top of Intensity.
  Use this to make the top level busier in rhythm, not just louder. `arrangement` also gives `a<Name>`, the
  section gate alone, for switching by section.
- The `lift` layer (`{ intensity: [0.4, 1], floor: 0.8 }`, "not a layer") makes the tune and drums lean in as
  Intensity climbs. Keep it: it makes the stretch from 0.4 to 1 feel continuous.
- **Pull the backing back under the tune.** The tune must lead between 300 and 1200 Hz by at least 3 dB
  (music-styles §7). `arpDip` in `thornwood_keep.mjs` and the `dip` option of the chord voice in seven bands
  do it. `--measure` with `PARTS` prints the numbers.
- At Intensity 0 the track must still be music. Design the bed as a piece you would accept as the "quiet
  room" version: it needs the chords and some motion.
- The three styles are three points on this ladder named for game moments (a calm one near 0.45 to 0.5, the
  default near 0.85, a full one at 1 with a faster tempo). Keep the fast style 5% under the track's top tempo.
- `along: Drums` adds a plain beat beside the track's own drums (hat from the start, kick from 0.3, snare
  from 0.65). Leave room for it: a track whose own kit already fills every 16th turns to mush when a listener
  switches it on.

---

## 7. Loop design and listener fatigue

### 7.1 How often the listener hears your tune

`seconds = bars x 240 / bpm`.

| Tempo | 8 bars | 16 bars | 32 bars | Times the 8-bar tune is heard in 5 minutes |
|---|---|---|---|---|
| 72 bpm | 27 s | 53 s | 107 s | 11 |
| 100 bpm | 19 s | 38 s | 77 s | 16 |
| 140 bpm | 14 s | 27 s | 55 s | 22 |
| 164 bpm | 12 s | 23 s | 47 s | 26 |

Twenty-two hearings in five minutes is the fact every other decision must respect. Research on players
(Huddersfield and York theses, section Sources) finds players tolerate repetition well but do become
over-familiar, and that small variation changes how repetitive a track feels even when players do not
consciously notice it during play. Nobody has published a number of minutes.

### 7.2 What makes a loop tire, and what to do

| Cause | Remedy inside 8 bars |
|---|---|
| A tune that plays in every bar | Leave bars or half-bars without new notes (bars 4 and 8 at least). Let the answer take them, at the top Intensity only, so at lower levels they are air |
| A hook that is too insistent for a track heard for an hour | Scale the hook to the moment: strongest for title and boss (heard briefly), gentler and more step-wise for overworld, puzzle and village |
| A "signpost": one unmistakable event per loop (a crash, a big fill, a high held note) | The ambience rule in quality-bar §3 applies to music too: no event so distinctive that the repeat is obvious. Keep fills small; do not crash on every bar 1 |
| A full stop at the loop point | Section 7.3 |
| Every bar the same thickness | Thin out bars 4 and 8 or drop the kick for a bar before a return |
| Harsh or high timbres all the time | Keep the tune mostly under C6; keep hats and bright arps low in the mix; default Brightness near 0.5 to 0.6 |
| Loudness that never moves | Use `-` marks, the dip under the tune, and the section drop of long versions |
| 8 bars is simply short | Make 16 bars the default length (most kit tracks already do), so the listener hears a thinner section then the full one |

Kondo's answer to field-music fatigue in *Ocarina of Time* was about twenty 8-bar segments on one chord
progression, played in random order, each ending on a chord that can lead into any other. Loadout cannot do
that (section 16), but the lesson transfers: **8-bar units that all end open**, and variety from what is
layered on a constant harmonic frame.

### 7.3 The loop point

A loop has no ending, so the last bar's job is to make bar 1 feel wanted.

- **End on the pull, not on home.** Put the V chord (or bVII in a modal piece) in bar 8. The ear expects home
  and bar 1 gives it. Many library tracks do this already.
- **Avoid V to I inside bars 7 and 8 with the tune landing on the home note.** That is a full stop; what
  follows sounds like the track starting again. Use it only where stopping is the mood (results, credits, a
  music box winding down), and even there put the full stop in bar 7 and let bar 8 lift away again.
- **Softer ways home:** bar 8 on IV (a plagal return, calm); bar 8 on a sus chord (it resolves into bar 1);
  two bars of V at 7 and 8 (a long breath in: `menu_folk`).
- **Carry the tune across.** A pickup: one to three short notes at the end of bar 8 that lead by step into
  bar 1's first note. Or hold a note that wants to move: `thornwood_keep` holds the note a semitone under
  home through bar 8.
- **Do not start bar 1 with the biggest hit in the piece.** The join is smoothest when bar 8 already has
  motion and bar 1 continues it.
- **Bars 1 and 8 should not be the same chord** unless the track is a drone: two bars of home in a row across
  the join feel like a stall.

**In Loadout.**

- The seam itself is the engine's job (`"wrap": true`, A-loop-seam). `melody()` helps too: a hold at the
  start of bar 1 rings on from the last note of bar 8. Musical seamlessness is yours.
- Vary bar 8 against bar 4 with `eightBars`: the same drum bar with a small push in bar 4 and a fill in bar 8
  (`eightBars('X.....x.X.......', { 8: 'X.....x.X...x.x.' })`).
- In the 16-, 24- and 32-bar versions the real loop point is "full band back to thin section". Run
  `--measure`: `measureSections` must show each section louder than the one before. Then read the first
  section alone: is it still a track? If it is only a bass note, the drop will sound like a fault.
- The kit lacks any random or once-every-other-time variation of a row (section 17).

---

## 8. Tension and release

Music keeps attention by making the listener expect something and then delaying or granting it. With no
tempo changes and no key changes, the tools left are:

| Tool | Tension | Release |
|---|---|---|
| Harmony | V, dim, sus, bII; a chord held longer than expected | home chord on bar 1 or 5 |
| Tune | rising line, notes outside the chord on strong beats, the note under home held | falling line onto a chord note |
| Rhythm | syncopation, 16ths, a fill, a bar with the kick removed | plain beat back on beat 1 |
| Register | climbing; top voice entering | drop back to the middle |
| Density | layers added (Intensity, sections) | the thin first section of the loop |
| Pedal bass | bass stays while chords change | bass moves |

Shape over 8 bars: tension should **rise across bars 5 to 8**, peak in bar 6 or 7 (the tune's top note), and
bar 8 hands over to bar 1. Bars 1 to 4 are the calmer half. Over 32 bars the sections do the same job at a
larger scale. A track with the same tension in every bar has none.

**In Loadout.** `riser(id, { noise })` is a noise sweep over a section (written for `derelict-run`).
`subDrop` is a falling low note at section changes. `halfTimeBeat({ driving, fill })` gives drum rows with
the snare on beat 3 only, so a fast piece feels half as fast and twice as heavy, with fills in bars 4 and 8.
A sus4 chord in bar 7 resolving to the plain chord in bar 8 (`credits_organ`: `Asus4 A`) is tension and
release in two tokens.

---

## 9. Chiptune idioms, and the other bands

The composer of *Shovel Knight* describes every trait of chiptune as a trick for working round a limit.
The old chips had three to five voices, so one voice had to sound like several. The tricks, and what the
`chip` band gives you:

| Idiom | What it is | In the `chip` band |
|---|---|---|
| **Fast arpeggio** | Chord notes cycled so fast on one voice that the ear hears a chord | `B.chords('a', { trig, pick })` (`chipArp`): `pick` is a `noteRow` of chord-tone numbers. `'0 1 2 3 2 1 0 1'` on 16ths is the classic up-and-back. Change the pattern, not just the chords: `'0 2 1 2'`, `'0 1 2 0 1 2 0 1'` (a 3-against-4 pattern) |
| **Duty cycle** | The width of the pulse wave is the tone: 12.5% thin and nasal, 25% bright, 50% hollow | `chipLead` switches 12.5% and 25% per note; the "Chiptune" melody instrument is the default `inst` |
| **Triangle bass** | The soft third voice plays the bass | `B.bass` (`triBass`), instant on and off, walking root, fifth, octave |
| **Noise drums** | Short bursts of noise are snare and hat; a fast falling tone is the kick | `B.drums({ kick, snare, hat, noise })`: `chipKick`, `chipSnare`, `chipHat` |
| **Echo on a spare voice** | The tune again, later and quieter | `melody('e', TUNE, { shift: 3, transpose: 0, vel: false })` into `B.lead` at a low level; shift 3 is a dotted 8th |
| **Octave jumps and grace notes** | A 16th an octave up or a step below before a long note gives it a snap | write the grace note as a `--` token one step before the note; the kit has `glide` but no per-note ornament |
| **Few voices, each busy** | Bass and drums interlock; the tune rests so the arpeggio is heard | write as if you had four voices: tune, arp or answer, bass, noise. If two layers are doing the same job, cut one |
| **Fast tempos, short notes** | Pulse waves do not swell, so energy comes from rhythm | band tempo 120 to 168; phrases in 8ths and 16ths, long notes kept for cadences |

Music-styles §8 is firm that this is chip-like, not a console's chip: no channel limits, no hardware quirks,
and never a console or brand name in what a visitor reads.

The same thinking applies to every band: **find the two or three habits that are the band, and write for
them.** `synthwave`: 16th-note bass on root and octave, long pad chords, a gated snare on 2 and 4, a slow tune
with echo. `folk`: strum on the 8ths, bass on root then fifth, a dotted "lilt" figure in the tune. `orchestra`:
whole-note low strings, a held brass answer, timpani on the root, snare rolls into bar 1. `musicbox`: no real
bass, broken chords, a tune of even notes. `lofi`: sevenths in `extra`, a lazy swung kick, the tune behind
the beat. `darkambient`: almost no tune, a drone and a heartbeat. `rock`: power chords in 8ths (no thirds), bass
with the kick, the tune as a riff. `twang`: walking bass, off-beat muted strum, a tune with slides
(`glide`). `steelpan` and `marimba`: off-beat comping, the 3 + 3 + 2 bass, rolled long notes. `organ`: held
chords, a moving pedal bass, drums only at the top. The band table in music-styles §3 gives each one's bass
rhythm and kit; do not fight it.

**One thing bands change for the tune.** The tune must work on ten instruments. Some ring on (Violin,
Trumpet, Synth lead, Flute), some die away (Bell, Plucked string, Guitar, Piano), one sounds an octave low
(Bass). So: no note that must sustain for more than about a bar to make sense; no run of 16ths so fast that
slow-speaking voices smear; no tune that depends on being high (it will also be heard an octave down).
`--match` levels them; `--measure` shows each one. This is a Loadout constraint with no outside equivalent:
most composers write for one instrument.

---

## 10. By game moment

Tempos are starting points drawn from the library's own tracks, the band table and the sources' general
advice (fast percussion for action; nobody publishes reliable bpm tables). The band's tempo range is a hard
limit: `B.checkTempo` refuses a tempo outside it. Fastest bands: `rock` 176, `twang` 172, `chip` 168,
`orchestra` 150. Slowest: 64, for four bands (`musicbox`, `organ`, `lofi`, `darkambient`).

### 10.1 Title and menu

- **Job:** the game's signature. Heard for seconds to a few minutes, with full attention and no sound
  effects. This is where the hook should be strongest and the main motif of the kit stated most plainly.
- **Tempo:** 72 to 112 for most; up to 140 for arcade and chip. Calm but expectant, not sleepy.
- **Harmony:** the kit's home colour, stated simply. A period (question, answer). End bar 8 on V: a title
  screen is a promise.
- **Tune:** the motif in bar 1, unhidden, in the middle register, with a real peak in bar 6 or 7.
- **Layers:** bed with chords, tune early, light percussion, answer at the top. Menus are often played at low
  Intensity under button sounds: the bed plus tune must be complete.
- **Avoid:** battle energy (nothing has happened yet); a full stop at bar 8.
- **Library:** `menu_<band>.mjs` for every band; `gridline_title`.

### 10.2 Overworld and level

- **Job:** motion and optimism for the longest stretch of play. Heard for many minutes with constant sound
  effects. It must be liked on the hundredth loop.
- **Tempo:** match the character. Walking top-down adventure 96 to 124; side-view platformer 120 to 156.
  Kondo's rule is that the music's rhythm fits how the character moves and how the player presses buttons:
  ask the brief for the walk or run speed and set the beat near the footfall rate or twice it.
- **Harmony:** major, Mixolydian or Dorian. Motion in the bass. V or bVII at bar 8.
- **Tune:** the motif, but gentler than the title: more steps, clear gaps (half of bars 4 and 8 with no new
  notes). Syncopation carries the bounce. Range about a ninth.
- **Layers:** bed and bass, tune, kick, snare, answer. Default Intensity 0.85, default length 16.
- **Avoid:** a busy tune in every bar; bright 16th hats loud in the mix (effects live up there).
- **Library:** `thornwood_overworld` (G major, 138, bouncy), `hearthvale_overworld` (D major, 112),
  `cloudreach_isles` (G major, 108).

### 10.3 Dungeon and cave

- **Job:** unease and attention. The player is listening for threats, so the music leaves the most room of
  any moment.
- **Tempo:** 72 to 104 with a steady soft pulse; or the level tempo with a sparser beat if it is an action
  dungeon (`thornwood_keep`, 148).
- **Harmony:** minor. Home chord held for two bars; bVI and bII for darkness; one borrowed major chord for a
  cold light; sus chords. Phrygian or Dorian. Fewer chord changes than the overworld.
- **Tune:** sparse. Two to four notes a bar, long holds, a small range low in the allowed register (C4 to
  about E5), semitone steps. It can be the overworld motif slowed or put in minor (section 11).
- **Layers:** drone or arpeggio bed with a pulse the tempo check can find (music-styles §7: `darkambient`'s
  heartbeat on every beat exists for this), then tune by 0.4, then low drums, then a high sparse answer.
- **Room:** more `space` than other moments (the band default, or a specification that asks for more).
- **Avoid:** silence at low Intensity (the rule); a tune so sparse that M-tempo locks to the wrong beat
  (SOUND.md's lesson: empty beats 2 and 4 once read as 68.5 bpm).
- **Library:** `hearthvale_dungeon` (E minor, 80), `hearthvale_cave` (B minor, 92), `menu_darkambient`.

### 10.4 Battle

- **Job:** adrenaline at once, from the first beat, and it must hold for one to five minutes under the
  densest sound effects in the game.
- **Tempo:** 140 to 172. The pulse is in from Intensity 0.
- **Harmony:** minor with the bVI, bVII, i climb and a major V at bar 8 (the strongest pull back to bar 1 a
  minor key has). Changes every bar; hold the home chord for bars 1 and 2 to plant the key.
- **Tune:** a sentence: a short cell (4 to 6 notes), said twice, then broken into pieces. Driving 8ths with
  one syncopation per bar. Leaps of a fourth and fifth. Peak in bar 6 or 7.
- **Rhythm section:** bass in 8ths or 16ths locked to the kick; snare on 2 and 4 (or a gallop: an 8th and two
  16ths); fills into bars 5 and 1.
- **Layers:** pulse and bass bed, tune and kick together (by 0.4), snare, then answer and fills. The top
  level adds rhythm (the `gBusy` row switch), not just volume.
- **Avoid:** an introduction (the fight has started); all layers hitting every 16th (leave the effects a
  rhythm to sit in: section 14).
- **Library:** `hearthvale_battle` (A minor, 152), `thornwood_keep` (E minor, 148), `gridline_rush` (156),
  `battle-theme` (160, the old Python one: do not copy its code).

### 10.5 Boss

- **Job:** this enemy matters. Bigger and heavier than battle, and distinct from it.
- **How to be bigger without being merely faster:**
  - **Weight:** half-time drums at a fast tempo (`halfTimeBeat`), low register, power chords or low brass.
  - **Harmony:** dim chords, the bII, a chromatic bass step, the home chord held under changes
    (`derelict_boss`: `Cm Cm Fm, Gm, | Cm Eb F#dim G`).
  - **The villain's motif:** if the kit has an enemy theme, this is its strongest statement. The usual trick,
    named in boss-music guides, is the main or title theme turned to minor.
  - **Unique colour:** save one sound for the boss that no other track in the kit uses (`alarmTone`, a
    distorted lead, an organ).
- **Tempo:** 150 to 180 in the fast bands; or 100 to 130 felt heavy.
- **Tune:** a short brutal cell, lower than the kit's other tunes; one wide leap (octave or the six-semitone
  leap) used once per loop.
- **Phases:** multi-phase fights are scored by adding layers, changing key or raising the tempo. In Loadout
  the game does this with the controls: Intensity per phase, and the three styles should be the three phases
  (for example Intensity 0.6, 0.85 and 1 with the tempo rising 5% each). A key lift for the last phase is the
  game moving `key` up 1 or 2; say so in the description in plain words.
- **Avoid:** being the battle theme plus distortion; a tune so busy the cell is lost.
- **Library:** `derelict_boss` (C minor, 164).

### 10.6 Rest, village, safe room

- **Job:** safety and warmth; the player's shoulders drop. Often long visits with menus and talking.
- **Tempo:** 72 to 108. A lilt (swing 0.3 to 0.4) helps where the band allows.
- **Harmony:** major; I, IV, vi, iii; IV to I returns; sevenths where the band takes `extra`. Mixolydian for
  rustic. Bar 8 on IV or V, lightly.
- **Tune:** steps, a sixth to an octave of range, a long note at the end of every 2-bar phrase, the kit's
  motif stretched out. Soft marks (`-`) on passing notes.
- **Rhythm section:** no kick-snare backbeat at the default; hand drum, shaker, brush, or none. Bass in half
  notes.
- **Layers:** chords, bass, tune, light percussion, answer. Even the top level is gentle.
- **Avoid:** sadness by accident (too much vi and iii, a falling tune that never rises again);
  a waltz or a 6/8 lullaby, which the kit cannot play (section 16); write the lilt with swing or with a
  dotted-8th-and-16th figure.
- **Library:** `hearthvale_village` (F major, 92), `thornwood_rest` (D major, 100), `gridline_calm`.

### 10.7 Results and victory

- **Job:** reward, then waiting. Two different assets:
  - the **sting** at the moment of winning is a **jingle** (1 to 6 s, ends on a resolved chord, does not
    loop; quality-bar §3), not a music track;
  - the **results loop** under the score screen is a track: pleased, settled, lower energy than the level.
- **Tempo:** 84 to 120.
- **Harmony:** major; arrivals on I are welcome here (IV, V, I). This is the one moment where a full stop
  inside the loop suits the mood; still let bar 8 lift (V) so the loop turns.
- **Tune:** the level or title motif with its ending turned upward to the home note: the question from the
  title screen finally answered.
- **Layers:** start fuller than other tracks' low end (the player has just won); modest top.
- **Library:** `gridline_results` (Eb major, 92).

### 10.8 Credits

- **Job:** looking back. The player is relaxed and listening; there are no sound effects. It is the only
  track heard as music for its own sake.
- **Tempo:** 64 to 100 for most bands; faster for rock and chip endings.
- **Harmony:** the kit's home key or its warmer relative; the richest progression in the kit; a sus chord
  resolving near the end.
- **Tune:** the main motif in its most complete, singing form, and, in the answer line, pieces of the other
  tracks' cells (the *Celeste* credits bring back each chapter's motif in turn). Default length 32, so the
  build from one voice to the full band is the story.
- **Avoid:** a new unrelated tune. Credits that share nothing with the game are a missed chance.
- **Library:** `credits_<band>.mjs` for every band.

---

## 11. Making a kit's tracks one soundtrack

Kondo judges a soundtrack by playing four or five of its tracks together to his director: do they belong to
one game? The tools:

### 11.1 A shared motif (leitmotif)

Pick the kit's cell (section 2.1) before writing any track. State it plainly in the title track. Then carry
it, changed, into the others. The changes that the *Undertale* and Phillips analyses list:

| Change | How | Fits |
|---|---|---|
| Slower / faster | same notes, note lengths doubled or halved | rest, credits / battle |
| Other mode | same shape on the minor (or major) scale | dungeon, boss |
| Other rhythm | keep the pitches, change the rhythm (swing it, straighten it, syncopate it) | village, battle |
| Fragment | first 3 notes only, repeated | battle, stingers |
| Upside down | rising becomes falling | boss, sad scenes |
| Other voice | in the bass, or in the answer line, under a new tune | any |
| Other instrument and band | the tune unchanged, the band around it changed | menu versus level |

**In Loadout, mind the library test.** It reads each track's `l` tune as the steps between its notes and
fails two tracks when **7 or more steps in a row are the same** (that is 8 notes moving the same way), or
when their tunes share **more than one bar of rhythm** (bars with more than one note). So:

- a shared cell of **4 to 6 notes is safe** as long as what follows it differs;
- the test ignores rhythm when comparing notes, so a slowed-down copy of a whole tune still fails: share the
  cell, not the tune;
- a cell moved to minor changes its steps, so it counts as different, while the ear still knows it;
- share at most one bar's rhythm between any two tunes;
- **the answer line is not tested.** A track can quote another track's cell on the band's lead in bars 4
  and 8. This is the cleanest place for a leitmotif in Loadout. It follows the letter of the rule; whether it
  follows its spirit is a question for the owner (section 16).

### 11.2 Related keys

Tracks follow each other in a game, sometimes cross-faded. Keys that share most of their notes join
smoothly:

| Relation | Example from G major | Use |
|---|---|---|
| Relative minor (same notes) | E minor | overworld to dungeon or keep |
| A fifth up or down (one note differs) | D major, C major | overworld to village or rest |
| Same home note, other mode | G minor | level to its boss: same place, darker |
| A third away, shared home chord note | Eb major, B minor | a deliberate change of world |

The Thornwood kit already does this: overworld G major, keep E minor (its relative), rest D major (a fifth
up), battle D minor (the rest theme's home note, darkened). Write the plan as a table in the kit's
specification before the first track. Remember the listener can move `key`; the relations hold when the game
moves all tracks together, which is what the bundle theme does.

### 11.3 Other threads

- **Tempo family.** Tracks at tempos in simple ratios (2:3, 3:4, or equal with half-time feel) sit together
  better than random ones. A rest theme at 100 and a level at 150 share a pulse.
- **One band, or neighbours.** A kit in one band is unified for free; a kit that changes band per track
  needs the motif and key plan more.
- **A signature rhythm.** A drum or bass figure (a 3 + 3 + 2, a gallop) that turns up in several tracks.
- **A signature chord move.** The same two-chord colour (I to bVII, i to IV major) somewhere in every track.
  Two chords are far from a shared chord order, which the test forbids only over the whole 8 bars.
- **Energy ladder.** Order the kit's tracks by energy (rest < title < overworld < dungeon tension < battle <
  boss) and check that tempo, drum weight and register follow the ladder with no two tracks on the same rung.

---

## 12. Judging a track you cannot hear

You cannot listen, and neither can the reviewer. Measure the notes, then measure the sound.

### 12.1 From the tune's tokens (no render)

Count these from `TUNE`. The kit has no tool that prints them (section 17); a ten-line scratch script over
the token list does it. Treat the targets as alarms, not laws: break one on purpose, never by accident.

| Measure | How to count | Healthy | Alarm |
|---|---|---|---|
| **Range** | highest minus lowest note, semitones | 9 to 16 | under 7 (a drone, unless dungeon); over 19; over 24 is refused |
| **Register** | lowest and highest written note | inside C4 to F#6; mostly G4 to C6 | `melody()` refuses notes the Key control would push out of range |
| **Peak** | how many times the top note occurs; which bar; which step | once or twice; bars 5 to 7; step 0 or 8 | top note in three or more bars; peak in bar 1 |
| **Moves** | share of steps (0 to 2 semitones), thirds (3 to 4), larger | steps 50% or more; larger leaps 3 or fewer | steps under 40% (jagged); steps 100% (a scale exercise) |
| **Leap recovery** | after each leap of 5 or more semitones, does the next move go the other way by step? | most do | two big leaps the same way in a row |
| **Rhythm repetition** | group the 8 bars by their rhythm (which steps start a note) | 2 to 4 distinct rhythms; the main one in 3 to 5 bars | 8 distinct rhythms (no motif); 1 rhythm (a machine) |
| **Pitch repetition** | does bar 1's shape return (same steps between notes) in bar 3 or 5? | yes, at least once | no bar relates to another |
| **Density** | new notes per bar | 3 to 6 on average; at least two bars with 2 or fewer | every bar 7 or more; every bar the same count |
| **Long notes** | notes held 4 steps or more | at least one per 2-bar phrase | none |
| **Space** | bars whose second half has no new note | 2 or more of 8 | 0 |
| **Syncopation** | notes starting on odd steps or on steps 2, 6, 10, 14 and held across a beat | 1 to 3 a bar for lively tracks; 0 to 1 for calm | every note off the beat |
| **Strong-beat chord notes** | notes starting on steps 0 and 8 that are in the bar's chord | 80% or more, with one or two leaning notes | under 50% is a `lint` warning |
| **Phrase endings** | last long note of bars 4 and 8, against the chord and the home note | bar 4: a chord note that is not the home note; bar 8: leads to bar 1 | both end on the home note over the home chord |
| **Seam** | step from the last note of bar 8 to the first of bar 1 | a step, a third, or a held note that resolves | a leap of more than a fifth with no pickup |
| **Colour note** | the mode's note (section 4.3): is it on a strong beat at least once, and in a written chord? | yes | used but never in a chord (flagged out of key) |

And for the chords: write the eight roots as a line; count how many bars are the home chord (2 to 3 of 8 is
usual; 5 is static; 1 is lost); check bar 8 is not the home chord (or that you chose that on purpose); check
bars 1 and 8 differ.

For the answer line: its notes fall on the tune's `_` steps; it shares no strong-beat start with the tune in
the same bar; it is at least a third away from the tune's held note.

For the drums and bass: kick and bass start together on beat 1; the bass rhythm is the band's; bars 4 and 8
differ from the plain bar (a push, a fill); no row is identical on all 16 steps unless it is a hat or shaker.

### 12.2 With the kit's measure tools

| Tool | What it tells you | What to look for |
|---|---|---|
| `node tools/compose/<track>.mjs --dry` | builds, prints the summary and `lint` | no `lint` line. `lint` covers controls, styles, the two tune shares, locked doublings |
| `tuneFit(patch)` | per tune line: `chordShare` (strong-beat notes in the chord), `scaleShare` (notes in the chords' scale) | 0.8 to 1 and 0.85 or more. 1.0 with no leaning note at all is safe but plain |
| `--match` | gains that level the ten instruments and the six that play along | paste them in; repeat when the chain after `lF` is not linear (music-styles §7) |
| `--measure` (quick) | instrument levels, section levels, Intensity levels, layer levels whole-band and 300 to 1200 Hz | the ten within 1 dB; **sections climb**; **loudness rises with Intensity**; tune at least 3 dB over `backing` in 300 to 1200 Hz for every instrument |
| `measureIntensity` (inside `--measure`) | level at 0, 0.25, 0.5, 0.75, 1 | rising at every step, and no step more than about 6 dB (a cliff means two windows open together) |
| `measureSections` | level of each 8-bar section at each length | each section louder than the last; the last equals the 8-bar version |
| `measureLayers(patch, PARTS)` | any part against any other | drums not over the tune; bass and kick "lower than feels natural"; raw peak 0.7 to 0.9 |
| `node tools/compose/verify_music.mjs <file> <bars> intensity` | strongest notes per bar; loudness and six bands at five Intensity values; seam; pulse | each bar's top notes are its chord; **the bands should shift as well as the level** (more low end when bass and kick enter, more highs at the top): proof that layers add colour, not only volume |
| `node tools/sfx.mjs check <file>` | every A- and M- check | no errors; read M-chords bar by bar and M-in-key |
| `node tools/compose/render_ramp.mjs <file> intensity <wav>` | the loop with Intensity climbing, as a game drives it | for a person to hear; ask the owner to listen |
| `node --test tests/unit/compose-library.test.mjs` | no shared chord order, tune, 8-note run, or two bars of rhythm | passes |
| `sectionAt(bar, bars)`, `layerPlays(layer, bar, bars)` | the arrangement as plain functions | check in a test which layers play in which section at each length |

### 12.3 What measurement cannot tell you

Whether the hook is good; whether the mood word is true; whether it tires. Say so in the report, as SOUND.md
asks ("verified by measurement, never by ear"), and put the three or four craft facts a listener could confirm
in the report: the cell in words, where the peak is, how the loop turns, which layer enters where.

---

## 13. Worked example: an 8-bar overworld tune

A sketch to show the reasoning. It is original, it is not in the library, and it has not been built or
heard: run the checks before using any of it.

**Brief:** overworld for a bright adventure; walking pace; hopeful with a little grit. Folk or chip band.

**Decisions before any note:**

- Key D major with one borrowed chord, C major (the bVII: Mixolydian, the "heroic folk" colour of 4.3).
- Tempo 116: a walk. 16 bars last 33 s.
- Shape: a period. Bars 1 to 4 ask, bars 5 to 8 answer, bar 8 stays open on V.
- The cell: **up a fourth, step, step, hold**, in a 3 + 3 + 2 rhythm (steps 0, 3, 6, then beat 3). Sayable,
  one feature leap, syncopated, lands on a strong beat.

**Chords:** `D G D A | Bm G C A` with `{ tonic: 'D' }`

Scale degrees: I IV I V | vi IV bVII V. Home twice in the first half to plant the key; the second half
starts on vi (same family as home, darker: "the same question, more serious"); the borrowed C in bar 7 is the
surprise, placed late; A (V) in bars 4 and 8 makes both phrase endings open and pulls bar 8 into bar 1. Bass
roots: D G D A, then B G and C A: two falling thirds, the second one a step higher than the first.

**The tune** (one token per 16th; scale degrees of D major underneath; `b7` is the borrowed C):

```
bar chord  tokens                                     degrees          what it does
1   D      A4 _ _ D5 _ _ E5 _ F#5 _ _ _ _ _ _ _       5 1 2 3          the cell: up a fourth, two steps, hold the third
2   G      B4 _ _ D5 _ _ E5 _ D5 _ _ _ _ _ _ _        6 1 2 1          same rhythm, starts a step higher, turns back down
3   D      D5 _ _ F#5 _ _ G5 _ A5 _ _ _ _ _ F#5- _    1 3 4 5 (3)      same rhythm, higher: climbing; a soft pickup
4   A      F#5 _ _ _ E5 _ C#5 _ E5 _ _ _ _ _ _ _      3 2 7 2          leans, settles on E: an open ending; second half free
5   Bm     B4 _ _ D5 _ _ E5 _ F#5 _ _ _ _ _ _ _       6 1 2 3          bar 1 again, one note changed, over a minor chord
6   G      G5 _ _ F#5 _ _ G5 _ B5 _ _ _ _ _ _ _       4 3 4 6          same rhythm; leaps to B5, the only time: the peak
7   C      G5 _ _ E5 _ _ D5 _ C5 _ _ _ _ _ E5- _      4 2 1 b7 (2)     falls from the peak onto the borrowed note
8   A      E5 _ _ _ _ _ _ _ C#5 _ _ _ _ _ _ _         2 7              two long notes; the 7th wants the D in bar 1
```

**Why each choice:**

- **Bar 1** opens on A4, the fifth of the chord, low in the range, so there is room to rise. The fourth up to
  D5 is the feature leap. It ends on F#5, the third of D, on beat 3: a chord note on a strong beat, held for
  half a bar. Second half empty: air from the first bar.
- **Bar 2** is the cell's rhythm exactly, on the G chord. It starts on B4 (the chord's third) and ends by
  stepping back down to D5 (the chord's fifth). Bar 1 rose and held; bar 2 rises and falls: a small question
  and answer inside the larger one.
- **Bar 3** is a sequence: the rhythm again, starting on the home note and reaching A5, a third above where
  bar 1 landed. Three statements of one
  rhythm is the limit before it becomes a machine, so it adds a soft pickup (F#5-) into bar 4.
- **Bar 4** breaks the rhythm: longer notes. It begins on F#5, which is **not** in the A chord, on beat 1: a
  leaning note, the one deliberate rub in the tune, which resolves down a step to E5. It ends on E5, the
  second note of the scale, over V: a question mark. Steps 10 to 15 have no new note: room for the answer.
- **Bar 5** is bar 1 with its first note raised from A4 to B4. Over B minor the same cell sounds more
  serious. The listener recognises the return (that is what makes it a tune) and hears that something changed.
- **Bar 6** keeps the rhythm a fifth time (5 bars of 8 share it; with bars 3 and 7's pickups that is two
  close variants). It circles G5 and then leaps a third to **B5, the highest note, once, on beat 3, in bar 6 of
  8**.
- **Bar 7** comes down from the peak by small moves (leap recovery) and lands on **C5 on beat 3 over the C
  chord**: the colour note of the mode, on a strong beat, inside a written chord, so `tuneFit` counts it in
  the scale. A soft pickup lifts into bar 8.
- **Bar 8** is the thinnest bar: E5 then C#5, both notes of the A chord. C#5 is the note a semitone under
  home; it is left hanging, and bar 1's second note is D5. The loop turns on an unanswered pull, not on a
  full stop.

**The numbers (section 12.1):** range A4 to B5, 14 semitones. Peak once, bar 6, step 8. Of 32 moves
(counting the loop back): 17 are steps or repeats (53%), 12 are thirds, 3 are larger, and two of those three
fall between phrases. Four rhythms: the cell in bars 1, 2, 5, 6; the cell plus pickup in 3 and 7; two
contrast bars. Density 4, 4, 5, 4, 4, 4, 5, 2. A long note in every bar. Strong-beat starts: 16 of 17 are
chord notes; the one that is not is bar 4's leaning F#. Bars 4 and 8 end on notes of V that are not the
home note.

**The answer** (the band's lead, top of Intensity, in the gaps):

```
4   A      _ _ _ _ _ _ _ _ _ _ C#6 _ B5 _ A5 _        falls to A5 while the tune holds E5
8   A      _ _ _ _ _ _ _ _ _ _ E5 _ F#5 _ G5 _        climbs by step toward bar 1; under it the tune holds C#5
```

Simple, in the tune's silences, a different register in bar 4, moving against the held note.

**The rest, in Loadout terms** (folk band; names as in `menu_folk.mjs`):

- Layers: `strum: [0, 0.3]` with a floor (the bed: chords at every Intensity), `bass: [0.1, 0.2]`,
  `tune: { section: 2, intensity: [0.25, 0.38] }`, `drums: { section: 3, intensity: [0.5, 0.6] }`,
  `answer: { section: 4, intensity: [0.75, 0.85] }`, `lift`.
- Bass: half notes, root then fifth (`'0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'`): the band's habit, and it leaves
  the 3 + 3 + 2 of the tune as the only syncopation low in the texture.
- Drums: hand drum on 1 and 3 with a push before 3; shaker on the off-beats; a small fill in bar 8 only
  (`eightBars`), nothing special in bar 4, where the answer already speaks.
- Strum with `dip` so the tune leads between 300 and 1200 Hz.
- Styles: "Setting out" (0.5, 108 bpm), "Open road" (0.85, 116), "Downhill run" (1, 124).
- Before writing anything into `sounds/`: `--dry`, the library test (this chord order and these rhythms must
  not already exist), `--match`, `--measure`, `verify_music.mjs`, `sfx.mjs check`.

---

## 14. Leaving room for sound effects

Kondo's "balance" starts here: music against effects, by frequency, by level and by position. Sound effects
win; a game will turn the music down before it lets a hit go unheard. Advice from game-audio practice (forum
and guide level, not measured research): leave a hole where the important effects sit, thin the low end if
the effects are heavy, and do not fill every moment.

In Loadout terms:

- **In time:** effects read in gaps. A battle track with a note on every 16th in every layer leaves none.
  Keep one layer per register busy and the others sparse.
- **In frequency:** the tune owns 300 to 1200 Hz. Most short effects (hits, pickups, clicks) are brighter
  than that. So keep hats, shakers, bright arps and the answer line modest: they are the layers that collide.
  Do not raise the default Brightness above the band's own to make a track "pop".
- **Low end:** SOUND.md's rule, kick and bass lower than feels natural, is also what leaves room for
  explosions and thuds.
- **Level:** raw peak 0.7 to 0.9 into the limiter; do not lean on `drive`.
- **Position:** kick, bass and snare identical in both channels (a rule); spread chords and echoes. Effects
  usually sit in the centre, so width in the backing is free room.
- **Moment:** the more effects a moment has (battle, level), the sparser the top layers should be at the
  default Intensity. Title and credits have none: they can be the fullest.
- The game ducks music under effects, not the track. The kit's `duck` is the kick ducking the music.

---

## 15. Checklist

For the composer before review and for the reviewer. Each line maps to a rubric row (quality-bar §4:
`brief`, `signal`, `structure`, `controls`, `ready`). Lines marked ★ go beyond what the rubric asks: they are
what lifts a 2 to a 3, or what the rubric cannot see at all.

**Plan (before notes)**

- [ ] `brief` The game moment, its mood word and its tempo are written down, with the section 10 recipe used.
- [ ] `brief` ★ The cell is written in one sentence (interval, rhythm, landing note).
- [ ] `brief` ★ The kit's key plan and shared cell exist (section 11), and this track's place on the energy ladder.
- [ ] `structure` Chords: 8 bars, home chord in 2 to 3 of them, the mode's colour chord present, bar 8 not a full stop, roots drawn as a line with commas and apostrophes.

**Tune**

- [ ] `structure` ★ Main rhythm in 3 to 5 bars; 1 to 2 variants; 1 to 2 contrast bars.
- [ ] `structure` ★ One peak, bars 5 to 7, on step 0 or 8.
- [ ] `structure` Range 9 to 16 semitones, inside C4 to F#6; never over two octaves.
- [ ] `structure` Steps at least half of all moves; 3 or fewer large leaps; leaps recovered.
- [ ] `structure` Strong-beat notes 80% or more in the chord (`tuneFit` `chordShare`), `scaleShare` 0.85 or more; no `lint` line.
- [ ] `structure` ★ Bar 4 ends open; bar 8 leads into bar 1 (pickup, held leading note, or V).
- [ ] `structure` ★ At least two bars leave their second half without new notes.
- [ ] `controls` The tune makes sense on a voice that dies away and on one that sustains, and an octave down.

**Arrangement**

- [ ] `brief` Intensity 0 is a complete calm piece; Intensity 1 is the full band. (Rubric 3 for `brief`: "takes it convincingly from calm to full".)
- [ ] `brief` ★ Each Intensity step adds a role or a register, not only level: `verify_music` bands shift.
- [ ] `structure` Tune window ends by 0.4; windows spread with flat ground between; the three styles sit on flat ground.
- [ ] `structure` Sections climb (`measureSections`); section 1 alone is still music.
- [ ] `structure` ★ An answer or counter-line on the band's lead, in the tune's gaps, in a different register.
- [ ] `structure` ★ Bars 4 and 8 differ from the plain bar in drums or bass; no signpost event every loop.
- [ ] `signal` Tune 3 dB over the backing in 300 to 1200 Hz for all ten instruments; backing dipped under the tune.
- [ ] `signal` Kick, bass, snare centred; raw peak 0.7 to 0.9; no dead layer; no locked doubling.
- [ ] `signal` ★ Bright, busy layers kept modest where the moment has many sound effects.

**Checks**

- [ ] `structure` M-tempo, M-chords (bar by bar), M-in-key read and clean; `verify_music` output in the report.
- [ ] `controls` Ten instruments within 1 dB after `--match`; every control audible at both ends; fast style 5% under top tempo.
- [ ] `ready` Three styles named for game moments; lengths 8 to 32 build; description in plain words with no theory terms and no promise of real instruments.
- [ ] `ready` Library test passes: chord order, tune, 8-note runs, rhythm bars.
- [ ] `ready` Report says "verified by measurement, never by ear" and asks the owner to listen (`render_ramp.mjs`).

**Reviewer's extra questions** (cannot fail a track under today's rubric; put them in `notes`, and use them to
choose between 2 and 3)

- [ ] Can you state the tune's cell in one sentence from the generator's `TUNE`? If not, there is no hook.
- [ ] Does any bar's rhythm return? Does the top note occur once?
- [ ] Do bars 7 and 8 make a full stop?
- [ ] Is the answer line doing something the tune is not?
- [ ] Does the track share a cell or key relation with its kit?

---

## 16. Where good practice and Loadout rules disagree

In every case this guide follows Loadout. Each row is a question for the owner.

| # | Common practice | Loadout rule, and where | What the guide does |
|---|---|---|---|
| 1 | A tune has two or more sections (A and B, verse and bridge) so repetition is broken by contrast | The tune is at most 8 bars: `melody()` takes 1, 2, 4 or 8 bars and every row must divide 128 steps (`sound/compose.js`); longer versions repeat it under more layers (style guide §12 `bars`) | Contrast inside 8 bars (period form, bars 4 and 8) and from layers. Biggest single limit on quality |
| 2 | Fatigue is fought with long loops (2 to 4 minutes) and random or varied phrase order (Kondo's twenty shuffled 8-bar segments) | 32 bars and 120 s at most (`MAX_SECONDS`); rows are fixed; no random order | Open phrase endings, space, 16-bar default |
| 3 | In layered scores the melody is often held back for the high-energy states; the calm state has none | The tune must be all there by Intensity 0.4 (compose.js "learned the hard way"; style guide §12 "melody stays audible under every look") | Tune enters second, after the bed; energy above 0.4 comes from rhythm section and answer |
| 4 | A kit's tracks share a leitmotif, sometimes a whole theme re-set | "No two tracks share a melody or a chord order" (style guide §12); the test fails 8 notes in a row moving alike or two shared rhythm bars (`tests/unit/compose-library.test.mjs`) | Share a 4 to 6 note cell; quote in the untested answer line. Owner to confirm that quoting in the answer line is wanted, and whether tracks of one kit should be exempt from part of the test |
| 5 | Waltzes (3/4), jigs and lullabies (6/8), triplets and shuffles are standard for cosy, folk and boss music | 16 steps per bar, no other meters, swing only (music-styles §8) | Dotted figures and swing; says so in 10.6 |
| 6 | Sevenths, ninths and two chords in a bar near cadences are normal harmony | `chords()`: triads and sus, one chord per bar; the checker reads one chord per bar (quality-bar M-chords). `extra` adds sevenths on some bands only. (`chords()` has an `every` option; nothing in the library or the checker has been shown to work with two chords a bar) | One chord per bar; colour from borrowed chords and the tune |
| 7 | Composers write for one instrument's strengths | The tune must work on ten instruments, including one an octave lower (style guide §12 `inst`) | Neutral tunes; character from the band's answer line |
| 8 | Hooks often rest on a bold leap or a run up a chord | "Mostly steps and one leap" as the default (style guide §12, SOUND.md) | One feature leap in the cell; the rule already allows a chord-run hook when the specification asks |
| 9 | Melody range: no fixed limit, but most singable tunes stay within a tenth | At most two octaves (style guide §12) | No conflict in practice: the guide recommends 9 to 16 semitones, tighter than the rule |
| 10 | Boss and final-phase music speeds up or changes key inside the piece | One tempo and key per render; only the game can move `bpm` and `key` | Phases as the three styles; key lift left to the game |
| 11 | Slow ambient, ballad and rest music sits at 50 to 60 bpm | No tempo under 64 (music-styles §3 and §8); the tempo check also needs a findable pulse | 64 and up, written half-time; a soft pulse on every beat |
| 12 | Dungeon and stealth music may drop to near silence | At Intensity 0 the track is still music (style guide §12) | A complete calm bed |
| 13 | Track descriptions name the key, mode and form | A-words refuses music-theory words in anything a visitor reads (quality-bar §2) | Theory stays in the generator's comments |
| 14 | A results or ending cue resolves and stops | Music tracks always loop; a sting that resolves is a **jingle**, a different asset (quality-bar §3) | 10.7 splits the two |

Also seen while reading, not craft conflicts but worth a look: style guide §12's control table labels `bpm`
"Tempo" and `key` "Key", while SOUND.md's table says the labels are "Speed" and "Pitch"; and the comment on
`melody()` in `sound/compose.js` still says "every one of the five melody instruments".

---

## 17. What the kit lacks (suggestions, not instructions)

None of these exist. Do not write code as if they did.

1. **A tune report.** Nothing prints range, peak count and position, move sizes, rhythm groups, density or
   phrase endings (section 12.1). `tuneFit` gives only the two shares. A `tuneShape(patch)` next to it, shown
   by `--dry`, would give every composer and reviewer the same numbers.
2. **A second tune or a varied repeat.** No way to give sections 2 and 4 different tunes, or to play bar 8
   differently every other time. (`instruments()` does accept `pitch`, `gate` and `vel` from nodes other than
   `melody()`'s, and layers can switch drum rows with an expression, so a switch between two tune lines by
   section looks possible in principle; nobody has done it, and `tuneFit`, `lint`, `--match` and the library
   test all assume one `l` line. It needs a kit decision, not a clever generator.)
3. **Random or shuffled phrases**, as in Kondo's field music.
4. **Two chords in a bar**, with the checker reading them.
5. **Seventh chords in `chords()`**, so the checker and `along` know about them.
6. **Other meters**: 3/4, 6/8, triplets.
7. **Per-note ornaments**: grace-note octave blips, slides into a note, a vibrato that grows on long notes.
   Only `glide` and three loudness marks exist.
8. **A rest token** in `melody()`, to cut a note short for staccato phrasing.
9. **A key or tempo change inside the loop** (a last-section lift).
10. **A rubric row for the tune.** The music rubric scores structure by chords, beat and balance. Nothing
    scores hook, contour or loop turn, which is why tracks pass at 11 to 12 with forgettable tunes. The
    reviewer's extra questions in section 15 could become criterion 3's score-3 text.
11. **A kit-aware library test**, so tracks of one kit may share a longer cell on purpose while tracks of
    different kits may not.
12. **A check for a signpost event** (one loud unique moment per loop) and for bar-to-bar sameness, using the
    loudness contour the checker already measures.

---

## Sources

Read in November 2026. Web pages were read through a summarising tool, and a few (Korb, Kaufman, the
*Celeste* commentary, Berklee, Soundfly, LANDR, the three theses) only as search-result summaries, so details
are paraphrased and should be checked before being quoted; secondary reports of talks are marked. Game titles are named only to describe techniques.

**Loadout (primary for every "In Loadout" paragraph)**

- `docs/style-guide.md` §12; `docs/music-styles.md`; `docs/quality-bar.md` §2 to §4; `docs/review-protocol.md` §3 to §5; `.claude/skills/sprite-forge/SOUND.md` "Music" and "Lessons".
- `sound/compose.js` (header, `chords`, `arrangement`, `melody`, `instruments`, `tuneFit`, `lint`, measure functions); `sound/bands.js`; `tools/compose/kit.mjs`; `tools/compose/verify_music.mjs`.
- `tools/compose/thornwood_keep.mjs`, `menu_folk.mjs`, and the `CHORDS` and tempo lines of all 40 generators; `tests/unit/compose-library.test.mjs`.

**Composers on their own work**

- Koji Kondo, GDC 2007 talk, as reported (rhythm, balance, interactivity; examples of layers): https://www.gamedeveloper.com/game-platforms/gdc-koji-kondo-s-interactive-musical-landscapes
- Koji Kondo on listening for hours and moving to the beat (Iwata Asks, reported): https://www.siliconera.com/how-does-koji-kondo-make-his-tunes-catchy/
- Koji Kondo on about twenty shuffled 8-bar field segments and gradual battle transitions (Iwata Asks): https://iwataasks.nintendo.com/interviews/3ds/zelda-ocarina-of-time/0/1
- Koji Kondo on music people do not tire of (2014 interview, reported): https://www.nintendolife.com/news/2014/12/koji_kondo_discusses_music_creation_for_iconic_mario_and_legend_of_zelda_games
- Darren Korb on not controlling how long a player hears a piece, and boss identities: https://www.lacedrecords.com/blogs/blog/how-rock-band-influenced-hades-soundtrack
- Lena Raine on building pieces to be dynamic (interview): https://gamemusic.net/?p=4506
- Lena Raine on why an adaptive score suits games (interview): https://gamingtrend.com/feature/podcasts/gaming-trend-podcast-behind-the-music-of-celeste-lena-raine-interview
- Lena Raine's commentary on rising and falling motifs (fan-kept archive of her notes): https://celeste.hsmusic.wiki/commentary/album/underlying-motifs/
- Jake Kaufman on chiptune traits as tricks around limits (interview): https://www.nintendolife.com/features/mega-man-shovel-knight-and-save-me-mr-tako-composers-on-getting-that-retro-sound

**Adaptive music and themes**

- Winifred Phillips, pure vertical layering (GDC 2021 series): https://www.gamedeveloper.com/game-platforms/pure-vertical-layering-for-game-music-composers-from-spyder-to-sackboy-gdc-2021-
- Winifred Phillips, hybrid horizontal and vertical structure: https://www.gamedeveloper.com/game-platforms/hybrid-horizontal-vertical-structure-for-game-music-composers-from-spyder-to-sackboy-gdc-2021-
- Winifred Phillips, variation and fragmentation of themes: https://gamedeveloper.com/audio/variation-and-fragmentation-in-game-music-game-composers-and-the-importance-of-themes-pt-3-
- Epic Games documentation, horizontal and vertical composition defined: https://dev.epicgames.com/documentation/fortnite/horizontal-composition
- Leitmotifs in *Undertale*, part 1 (how motifs are changed between tracks): https://www.gamedeveloper.com/audio/an-examination-of-leitmotifs-and-their-use-to-shape-narrative-in-undertale-part-1-of-2
- Boss music guide (tiers, villain motif, main theme in minor): https://www.gamedeveloper.com/audio/getting-making-game-music-that-fits-classic-genre-series-boss-music
- Ostinato and repetition in game music: https://pillowmath.github.io/musings/ostinato-repetition.html

**Melody, phrase and harmony**

- Ableton, "Creating Melodies 1: Contour" (one peak, balance, leap recovery): https://makingmusic.ableton.com/creating-melodies-1-contour
- Berklee Online, tools for better melodies: https://online.berklee.edu/takenote/simple-tools-for-better-melodies/
- Soundfly, motivic development techniques: https://flypaper.soundfly.com/write/7-melody-writing-and-motivic-development-techniques-for-songwriters/
- Sentences and periods (8-bar phrase shapes): https://milnepublishing.geneseo.edu/fundamentals-function-form/chapter/35-sentences-and-periods/
- Period (music), definition and cadences: https://en.wikipedia.org/wiki/Period_(music)
- Splice, music modes and their moods (its Mixolydian entry has an error; the lowered 7th is the standard definition used here): https://splice.com/blog/music-modes/
- Thinkspace, a lesson in modes from a game series: https://thinkspace.ac.uk/blog/a-lesson-in-modes-from-the-legend-of-zelda/
- Hooktheory, chord counts across 1300 popular songs: https://www.hooktheory.com/blog/i-analyzed-the-chords-of-1300-popular-songs-for-patterns-this-is-what-i-found/

**Chiptune**

- MusicRadar, A to Z of chiptune (arpeggios, echo on a spare voice, noise and "zap" drums, octave blips): https://www.musicradar.com/news/tech/a-z-of-chiptune-252264
- NESdev tracker tips (triangle and noise for bass and drums, percussive attacks): http://www.nesdev.org/nt2/tips-tricks.htm
- LANDR, how to make chiptune music (channel roles, duty cycle): https://blog.landr.com/how-to-make-chiptune-music

**Repetition, fatigue and mix**

- Dutta, thesis on repetition of game music and enjoyment (Huddersfield, 2020): https://eprints.hud.ac.uk/id/eprint/35234/
- Worrall, thesis on expressive variation and perceived repetition (York, 2025): https://etheses.whiterose.ac.uk/id/eprint/38684/1/Worrall%20PhD%20Thesis%202025.pdf
- Forum discussion on effects clashing with music (make a hole, thin the low end; practice-level advice): https://comic.gamedev.net/forums/topic/650494-about-sfx-clashing-music
- Leeds thesis chapter on dynamic music techniques (overview of vertical and horizontal): https://etheses.whiterose.ac.uk/27365/1/Chapters/Chapter%203/Chapter%203.html

Not reached (pages refused the reader), so not used for any claim: Michael Sweet's *Writing Interactive Music
for Video Games* chapter on loops; Open Music Theory's phrase chapter; the Medium article on *Celeste*'s
adaptive layers. The advice on loop endings in section 7.3 therefore rests on general cadence theory and on
what the library's own tracks do, not on a cited game-audio text; a person who can listen should test it.
