// pairs.js: the six classic pairs of a music page (docs/site-design.md, the music page). A pair is a melody
// instrument and an instrument that plays along under it, set together with one tap. No page and no engine here: the
// music page (app/music-page.js) reads the names, and tests/unit/compose-ten-instruments.test.mjs checks that every
// name is a real choice and that each pair sounds sensible when measured (level, peak, chords).
//
// Why these six, of the sixteen that the ten instruments and the five that play along could make (2026-11-22):
// the tune sits on top and the chords or the bass sit under it. Guitar with Bass and Flute with Guitar are the
// folk and rock standards; Piano with Violin, Piano with Bass and Bell with Piano give a bright tune a chord bed;
// Trumpet with Piano is a call over comping. Two of the same instrument is not a pair (along would play nothing).

/** [{ label (what the chip says), inst (the melody instrument), along (the instrument that plays along) }], in the order the chips are shown. */
export const PAIRS = Object.freeze([
  { label: 'Guitar + Bass', inst: 'Guitar', along: 'Bass' },
  { label: 'Piano + Violin', inst: 'Piano', along: 'Violin' },
  { label: 'Piano + Bass', inst: 'Piano', along: 'Bass' },
  { label: 'Flute + Guitar', inst: 'Flute', along: 'Guitar' },
  { label: 'Trumpet + Piano', inst: 'Trumpet', along: 'Piano' },
  { label: 'Bell + Piano', inst: 'Bell', along: 'Piano' },
].map((p) => Object.freeze(p)));
