// Migration batch M9: the interface pieces redrawn as data (sprites/<id>.json), each naming a port generator (or, for
// the dialogue box, the panel layout of build item B13), held pixel for pixel to the frozen code sprite it replaces
// (tests/fixtures/code-sprites/<id>.js) at every setting tests/helpers/m9-ports.mjs tries, in every clip and frame, with
// the same slice and text area (Contract 8). The records the library-redraws test holds them to are in
// tests/fixtures/redraws/<id>.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { portDifferences, measureDifferences, socketDifferences } from '../helpers/m9-ports.mjs';

/** The M9 redraws held here, in the order they were made. */
export const M9_IDS = Object.freeze(['font-chunky', 'font-rounded', 'font-serif', 'font-slim', 'ui-dialogue', 'input-dpad', 'input-mouse', 'input-stick', 'input-key', 'input-key-wide', 'input-face-buttons', 'input-shoulder', 'ui-damage-digits', 'ui-status-icons', 'ui-crosshair', 'ui-score-pop', 'ui-word-pop', 'emote-marks', 'ui-hud-platformer', 'ui-hud-roguelite', 'ui-battle-menu', 'ui-score-counter', 'ui-timer', 'ui-upgrade-card', 'emote-bubbles', 'ui-speech-bubble', 'ui-thought-bubble', 'ui-name-plate']);

/**
 * Where a redraw is held near, not pixel for pixel: { id: { clip: n } }, each colour channel within n. None since review
 * M9 round 1: the upgrade card's disabled state (upgrade.card@2) greys each colour with the grey colour rule before its
 * tones are worked out, as the code did, where round 1 greyed the whole frame (within 24 levels).
 */
const NEAR = {};

/**
 * Settings where a redraw may differ, each with why and at most how many pixels: { id: [{ label, clip, pixels, why }] }.
 * The upgrade card's code laid its head's scan lines `over` every pixel of the face's colour, comparing colours: where
 * the frame (or the glow's tone) greys to the very grey the face does (#8a3b12 and the default face #434d6d both grey to
 * #4e4e4e), the code relit the band as if it were face. Paint refs keep the band and the face apart, so the data card
 * keeps its band grey there: 54 and 15 pixels, one tone (24 levels) apart. Any other difference fails.
 */
const COINCIDE = {
  'ui-upgrade-card': [
    { label: 'frame=#8a3b12', clip: 'disabled', pixels: 54, why: 'the frame greys to the face\'s grey' },
    { label: 'glow=#8a3b12', clip: 'disabled', pixels: 15, why: 'the glow\'s tone greys to the face\'s grey' },
  ],
};
const allowed = (id, d) => (COINCIDE[id] ?? []).some((c) => c.label === d.label && c.clip === d.clip && d.pixels <= c.pixels);

/** More settings for one redraw: the shoulder button at every near-black the review found (round 1, issue 6) and the colours whose brightness is 0.76 to within float error, as body and as light. */
const SHOULDER = ['#050505', '#060606', '#080808', '#090909', '#0b0b0b', '#0c0c0c', '#081000', '#000000', '#000002', '#3afef0', '#40f9fa', '#45ffce', '#49f5f7', '#4bfad8'];
const MORE = { 'input-shoulder': SHOULDER.flatMap((c) => [{ label: `body=${c} unlit`, params: { lit: false, body: c } }, { label: `glow=${c}`, params: { lit: true, glow: c } }]) };

for (const id of M9_IDS) {
  test(`${id}: the data file draws what the code sprite drew, pixel for pixel, with the same slice and text area`, async () => {
    assert.deepEqual((await portDifferences(id, { near: NEAR[id] ?? {}, more: MORE[id] ?? [] })).filter((d) => !allowed(id, d)), []);
    assert.deepEqual(await measureDifferences(id), []);
  });
}

// A clip the code marked noText (an arrow, a cursor, a pointer, a mark with no room for words) keeps the mark in the data
// file, so the whole-bundle contrast check (engine/ui.js contrastFaults, tests/unit/ui-contrast.test.mjs) skips it as it
// skipped the code's: review M9 round 1 found ui-contrast failing on eight redraws that had lost it (issue 11).
test('every clip the code marked noText is marked so in the data file, and no redraw has a contrast fault its code had not', async () => {
  const { codeSprite, librarySprite } = await import('../helpers/library.mjs');
  const { contrastFaults } = await import('../../engine/ui.js');
  for (const id of M9_IDS) {
    const old = await codeSprite(id), now = await librarySprite(id);
    for (const [clip, c] of Object.entries(old.clips)) assert.equal(!!now.clips[clip]?.noText, !!c.noText, `${id} ${clip}: noText`);
    if (old.meta?.type !== 'ui' || old.params.face?.kind !== 'color') continue;
    const had = new Set(contrastFaults(old));
    assert.deepEqual(contrastFaults(now).filter((f) => !had.has(f)), [], id);
  }
});

// A redraw keeps the code sprite's attach points (Contract 3; design section 7: a redraw keeps the sprite's contract):
// the crosshair's `tip` (its hot spot), the battle menu cursor's `tip` on every frame, the speech bubble's and the name
// plate's `tip` on their tail and pointer clips, the upgrade card's `icon` and `text` in every state. Review M9 round 2,
// issue 2 found all five dropped. A sprite whose code had none has none.
for (const id of ['ui-crosshair', 'ui-battle-menu', 'ui-speech-bubble', 'ui-name-plate', 'ui-upgrade-card']) {
  test(`${id}: the data file has the code sprite's attach points in every clip and frame, at every setting`, async () => {
    assert.deepEqual(await socketDifferences(id), []);
  });
}
test('no other M9 redraw gains or loses attach points', async () => {
  const { codeSprite, librarySprite } = await import('../helpers/library.mjs');
  for (const id of M9_IDS) assert.equal(typeof (await librarySprite(id)).sockets, typeof (await codeSprite(id)).sockets, id);
});
