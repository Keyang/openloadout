// What an agent hands to window.loadout on route 2 since build item B11 (docs/data-sprites.md section 5; Contract 15):
// a sprite is a `loadout-sprite` version 2 definition (plain JSON data, drawn by framework code on the page, no worker),
// a sound is a patch. The sprites start from the redrawn coin (tests/fixtures/v2/pictures/coin.json, a `pictures` body
// that names the pickup generators) under ids and words of their own.
// tests/unit/api-data.test.mjs keeps goodData() and starData() passing the quality bar in Node, noWords() failing it
// and deadControl() refused by the validator, so the browser tests (tests/e2e/api.spec.mjs, route2*.spec.mjs) fail
// only for reasons of their own.
import fs from 'node:fs';

const read = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const COIN = read('../v2/pictures/coin.json');
const copy = (v) => JSON.parse(JSON.stringify(v));

export const GOOD_ID = 'api-test-gem';

/** A small pickup that passes the quality bar: the coin under an id, a name and words of its own. */
export function goodData(id = GOOD_ID) {
  const d = copy(COIN);
  d.id = id;
  d.name = 'Test gem';
  d.blurb = 'A cut gem that floats, spins and bursts when taken.';
  d.meta.words = ['gem', 'jewel', 'crystal', 'treasure', 'loot', 'collect', 'pickup', 'spin'];
  return d;
}

/** The good pickup with no search words: it is drawn and kept, and the quality bar says what is missing (a draft). */
export function noWords(id = 'api-test-nowords') {
  const d = goodData(id);
  delete d.meta.words;
  return d;
}

/** A slider that nothing names: the validator refuses the definition, so nothing is drawn or kept. */
export function deadControl(id = 'api-test-dead') {
  const d = goodData(id);
  d.controls.splice(2, 0, { key: 'weight', kind: 'range', label: 'Weight', lo: 'Light', hi: 'Heavy', default: 0.5 });
  return d;
}

/** Sprite source text as route 2 took it before B11 (an ES module): no longer taken anywhere. */
export const OLD_SOURCE = `// A cut gem, as route 2 took it before data sprites.
import { defineSprite, range } from '../engine/sprite.js';
export default defineSprite({ id: 'old-gem', name: 'Old gem', size: [16, 16], pivot: [8, 14], params: { size: range('Size', 0.5) }, clips: { idle: { frames: 2 } }, render(g) { g.dot(8, 8, '#ffffff'); } });
`;

/** A short blip that passes the sound quality bar (the quality tests' own fixture, under an id of its own). */
export function goodSound(id = 'api-test-blip') {
  const patch = read('../quality/sounds/good-blip.json');
  return { ...patch, id, name: 'Test blip' };
}
export const GOOD_SOUND = goodSound();

// ---- route 2: what an agent makes during one visit (tests/e2e/route2.spec.mjs) ---------------------------------

export const STAR_ID = 'route2-star', CHIME_ID = 'route2-chime';

/**
 * A star pickup with a spin clip and a collect clip. broken: the first try, which has no search words, so the quality
 * bar fails it (it is kept as a draft); cue: the id of the sound its collect clip plays (the catalogue's coin-pickup
 * unless given).
 */
export function starData({ id = STAR_ID, broken = false, cue = null } = {}) {
  const d = goodData(id);
  d.name = 'Wish star';
  d.blurb = 'A star to collect: it floats, spins and bursts into sparks when taken.';
  d.meta.words = ['star', 'wish', 'collect', 'pickup', 'bonus', 'sparkle', 'spin'];
  if (broken) delete d.meta.words;
  if (cue) d.clips.collect.sounds = [{ sound: cue, frame: 1 }];
  return d;
}

/** A two-note chime for the star, as a patch written for the visit. */
export function chimePatch(id = CHIME_ID) {
  const patch = read('../../../sounds/coin-pickup.json');
  return { ...patch, id, name: 'Wish chime', description: 'A two-note chime for a collected star.', meta: { ...patch.meta, words: ['star', 'wish', 'chime', 'collect', 'pickup', 'bonus', 'ding'] } };
}
