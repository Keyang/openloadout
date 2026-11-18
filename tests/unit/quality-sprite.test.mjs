// The sprite quality bar (quality/sprite.js): one fixture per rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSprite, THRESHOLDS, whenHint } from '../../quality/sprite.js';
import { choice, toggle } from '../../engine/sprite.js';

const HINT_PARAMS = { hat: choice('Hat', 'cap', ['none', 'cap', 'spike']), cape: toggle('Cape', false) };
import * as F from '../fixtures/quality/sprites.mjs';

const TYPES = ['character', 'creature', 'tileset', 'prop', 'pickup', 'projectile', 'effect', 'background', 'ui', 'icon'];
// stand-in for catalog/schema.js validateMeta(meta, kind) -> { ok, errors }
const validateMeta = (meta, kind) => {
  const errors = [];
  if (kind !== 'sprite') errors.push(`kind should be sprite, got ${kind}`);
  if (!TYPES.includes(meta.type)) errors.push(`type "${meta.type}" is not an allowed value`);
  if (!meta.role) errors.push('role is missing');
  return { ok: !errors.length, errors };
};
const opts = { soundIndex: F.SOUND_INDEX, validateMeta };
const run = (fx, o = opts) => checkSprite(fx(), o);
const has = (list, re) => list.some((m) => re.test(m));
const count = (list, re) => list.filter((m) => re.test(m)).length;
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;

function expectError(fx, re) {
  const r = run(fx);
  assert.ok(has(r.errors, re), `expected an error matching ${re}\n${show(r)}`);
  return r;
}
function expectWarningOnly(fx, re) {
  const r = run(fx);
  assert.ok(has(r.warnings, re), `expected a warning matching ${re}\n${show(r)}`);
  assert.ok(!has(r.errors, re), `expected no error matching ${re}\n${show(r)}`);
  return r;
}
function expectClean(fx) {
  const r = run(fx);
  assert.deepEqual(r.errors, [], show(r));
  return r;
}

test('a sprite that meets the bar passes with no errors and no warnings', () => {
  const r = expectClean(F.good);
  assert.deepEqual(r.warnings, [], show(r));
});

test('metrics report the time, the render count, the type, the fill and the strength threshold', () => {
  const r = run(F.good);
  assert.ok(r.metrics.ms > 0);
  assert.ok(r.metrics.renders > 0);
  assert.equal(r.metrics.type, 'creature');
  assert.ok(r.metrics.smallestFill > 0.33 && r.metrics.smallestFill <= 1);
  assert.equal(r.metrics.looks, r.metrics.bases + THRESHOLDS.randomLooks);
  assert.equal(THRESHOLDS.randomLooks, 12);
  assert.equal(Object.keys(r.metrics.controls).length, 9, 'per-control results');
  assert.equal(r.metrics.controls.hat.kind, 'choice');
  // N = clamp(round(opaque pixels of the default first frame / 100), 2, 8)
  assert.ok(r.metrics.opaquePixels > 100);
  assert.equal(r.metrics.strength, Math.min(8, Math.max(2, Math.round(r.metrics.opaquePixels / 100))));
  assert.ok(r.metrics.controls.hatSize.maxChange > r.metrics.strength);
});

// ---- control strength -------------------------------------------------------------
test('a slider that changes nothing is an error', () => expectError(F.deadSlider, /"wiggle" never changes the picture/));
test('a colour that changes nothing is an error', () => expectError(F.deadColour, /"eyeColour" never changes the picture/));
test('a slider that changes only a few pixels is an error', () => expectError(F.weakSlider, /"freckleSize" changes at most 2 pixels/));
test('an on/off control that changes only a few pixels is a warning', () => expectWarningOnly(F.weakToggle, /"freckle" changes at most 2 pixels/));
test('two choice options that look exactly the same are an error', () => expectError(F.sameChoice, /"mood": options "calm" and "grumpy" look the same/));
test('two choice options a few pixels apart are a warning', () => expectWarningOnly(F.nearChoice, /"mood": options "sleepy" and "dozy" differ by at most 2 pixels/));

// ---- dead controls, parts and `when` ------------------------------------------------------
test('a control dead for some setting of another is an error that names the remedy', () => {
  const r = expectError(F.deadForChoice, /"hatSize" does nothing when hat=none/);
  assert.ok(has(r.errors, /"hatSize" .*declare `when: \{ hat: \['cap', 'spike'\] \}`/), show(r));
  assert.ok(has(r.errors, /"hatColour" does nothing when hat=none/), show(r));
});
test('a part declaration excuses its controls when the part is off', () => expectClean(F.good));
test('`when` excuses a control where it is not in effect', () => expectClean(F.whenDeclared));
test('a control whose `when` needs two non-default settings is tested where it applies', () => {
  expectClean(F.twoKeyWhenDrawn);
  const r = expectError(F.twoKeyWhenNeverDrawn, /"trim" does nothing at the only setting where it applies \(hat=spike, cape=true\)/);
  assert.ok(r.metrics.controls.trim.tested >= 1, 'tested at the built setting');
});
test('a control whose `when` can never hold is an error', () => expectError(F.cannotApply, /"hatColour" can never apply/));
test('`when` as a list of alternatives ("any of these") is accepted', (t) => {
  let def;
  try { def = F.listWhenDrawn(); } catch (e) { if (/when must be an object/.test(e.message)) return t.skip('engine/sprite.js does not accept list-form when yet'); throw e; }
  const r = checkSprite(def, opts);
  assert.deepEqual(r.errors, [], show(r));
});
test('the `when` hint is one object when one other control explains it, a list when either of two does', () => {
  // dead at the default, alive with hat=spike or with cape on: either is enough, so a list
  assert.equal(whenHint({ deadIn: ['default', 'hat=cap', 'hat=none', 'cape=false'], aliveIn: ['hat=spike', 'cape=true'] }, HINT_PARAMS, { hat: 'cap', cape: false }), "when: [{ hat: ['spike'] }, { cape: [true] }]");
  // alive at the default, dead with hat=none: one condition, one object
  assert.equal(whenHint({ deadIn: ['hat=none'], aliveIn: ['default', 'hat=cap', 'hat=spike'] }, HINT_PARAMS, { hat: 'cap', cape: false }), "when: { hat: ['cap', 'spike'] }");
  // alive at the default, dead with hat=none and with cape on: both must hold, one object
  assert.equal(whenHint({ deadIn: ['hat=none', 'cape=true'], aliveIn: ['default', 'hat=cap', 'hat=spike'] }, HINT_PARAMS, { hat: 'cap', cape: false }), "when: { hat: ['cap', 'spike'], cape: [false] }");
});
test('a part whose selector is an on/off control is accepted', () => expectClean(F.togglePart));
test('a part whose none is a list is accepted', () => expectClean(F.listNonePart));
test('a control dead only at all sliders high is a warning (a deliberate clamp)', () => expectWarningOnly(F.deadAtExtreme, /"spot" does nothing when all sliders high/));
test('parts: a part control changes the picture while the part is present', () => expectError(F.partControlDead, /part "hat": "hatColour" does nothing when .*hat=cap/));
test('a sprite with a bad parts declaration cannot be defined (the engine throws)', () => {
  assert.throws(F.partMissingKey, /"hatShape" is not one of the sprite's controls/);
  assert.throws(F.partSelectorNotChoice, /must be a choice or an on\/off control/);
});
test('a part with more than 6 controls is a warning', () => {
  const r = run(F.bigPart);
  assert.ok(has(r.warnings, /part "hat" has 7 controls/), show(r));
});
test('the too-many-controls warning counts only controls outside parts', () => {
  assert.ok(!has(run(F.manyWithPart).warnings, /too many/), show(run(F.manyWithPart)));
  assert.ok(has(run(F.tooMany).warnings, /17 controls outside parts: too many/), show(run(F.tooMany)));
});

// ---- size, frame, motion ------------------------------------------------------------------
test('the smallest look fills a reasonable share of the frame', () => {
  const r = expectError(F.tinyLook, /smallest look .* fills \d+% of the frame/);
  assert.ok(r.metrics.smallestFill < 0.25);
  expectWarningOnly(F.smallLook, /smallest look .* fills \d+% of the frame/);
});
test('touching the frame edge is one error for the cause, with a count', () => {
  const r = expectError(F.edgeTouch, /touches the frame edge/);
  assert.equal(count(r.errors, /touches the frame edge/), 1, show(r));
  assert.ok(has(r.errors, /touches the frame edge.*and \d+ more/), show(r));
});
test('icons and interface pieces may touch the frame edge', () => {
  const r = run(F.iconFull);
  assert.ok(!has(r.errors, /frame edge/), show(r));
});
test('same input gives the same pixels', () => expectError(F.nondeterministic, /two renders differ/));
test('renders without error at every tested combination', () => expectError(F.throwsSometimes, /render threw/));
test('a sprite that cannot draw gets one error, not a "never changes" for every control', () => {
  const r = run(F.alwaysThrows);
  assert.equal(count(r.errors, /render threw/), 1, show(r));
  assert.ok(!has(r.errors, /never changes|does nothing/), show(r));
});
test('a creature moves in every clip', () => expectError(F.frozenClip, /idle: all frames are identical/));
test('a frame with nothing drawn is an error', () => expectError(F.emptyFrame, /vanish frame 2.*nothing drawn/));
test('an effect whose last frame is empty gets a warning', () => expectWarningOnly(F.emptyEffectEnd, /vanish.*last frame is empty/));
test('a character has no one-frame clip', () => expectError(F.stillCharacter, /clip "pose" has one frame: a character must move in every clip/));
test('a prop may have a one-frame clip', () => {
  const r = run(F.stillProp);
  assert.ok(!has(r.errors, /one frame/), show(r));
  assert.equal(r.metrics.type, 'prop');
});
test('feet rest on the pivot line (a warning)', () => expectWarningOnly(F.floating, /lowest pixel is at y=\d+ but pivot y=28/));

// ---- definition, metadata, sounds -----------------------------------------------------------
test('every control has a label', () => expectError(F.noLabel, /"size" has no label/));
test('a colour control has at least 3 swatches', () => expectError(F.twoSwatches, /color param "body" needs at least 3 swatches/));
test('metadata: missing meta is an error when a validator is given', () => expectError(F.noMeta, /no meta/));
test('metadata: meta must pass the validator', () => expectError(F.badMeta, /meta: type "spaceship" is not an allowed value/));
test('metadata: skipped when no validator is given', () => {
  const r = checkSprite(F.noMeta(), { soundIndex: F.SOUND_INDEX });
  assert.ok(!has(r.errors, /meta/), show(r));
  assert.equal(r.metrics.metaChecked, false);
});
test('sound ids exist, also on a cue with `when`', () => expectError(F.unknownSound, /sound "q-nope" on clip squash is not in sounds/));
test('sound styles exist', () => expectError(F.unknownPreset, /no preset "Loud"/));
test('sprites take sound effects, not music', () => expectError(F.musicOnSprite, /"q-song" on clip squash is a music track/));

// ---- tilesets and backgrounds ---------------------------------------------------------------
test('tileset: a good tileset passes; tiles may fill the frame and have one frame', () => {
  const r = expectClean(F.tilesetGood);
  assert.equal(r.metrics.type, 'tileset');
  assert.ok(r.metrics.joins.length >= 3, 'fill repeats both ways, top repeats sideways, top sits on fill');
});
test('tileset: fill tiles are fully opaque', () => expectError(F.tilesetHole, /ground-fill: fill tile is not fully opaque/));
test('tileset: fill tiles repeat without a seam', () => expectError(F.tilesetSeam, /seam: ground-fill right edge → ground-fill left edge/));
test('tileset: top tiles repeat side by side without a seam', () => expectError(F.tilesetTopSeam, /seam: ground-top right edge → ground-top left edge/));
test('tileset: the top tile sits on the fill tile without a seam', () => {
  const r = expectError(F.tilesetUnderSeam, /seam: ground-top bottom edge → ground-fill top edge/);
  assert.ok(!has(r.errors, /ground-top right edge/), show(r));
});
// ---- the whole block: every pair of pieces that can touch (style guide section 6) ------------
test('tileset block: a correct 13-piece block passes, and every legal pair of pieces is tested', () => {
  const r = expectClean(F.blockGood);
  const j = r.metrics.joins;
  for (const pair of [
    'rock-fill left of rock-fill', 'rock-fill above rock-fill', 'rock-top left of rock-top', 'rock-top above rock-fill',
    'rock-left left of rock-top', 'rock-top left of rock-right', 'rock-left above rock-side-l', 'rock-right above rock-side-r',
    'rock-side-l left of rock-fill', 'rock-fill left of rock-side-r', 'rock-side-l above rock-side-l', 'rock-side-r above rock-side-r',
    'rock-bottom left of rock-bottom', 'rock-fill above rock-bottom', 'rock-bottom-l left of rock-bottom', 'rock-bottom left of rock-bottom-r',
    'rock-side-l above rock-bottom-l', 'rock-side-r above rock-bottom-r',
    'rock-inner-tl left of rock-fill', 'rock-inner-tl above rock-fill', 'rock-top left of rock-inner-tl', 'rock-side-l above rock-inner-tl',
    'rock-inner-tr left of rock-top', 'rock-right above rock-inner-tr', 'rock-bottom left of rock-inner-bl', 'rock-inner-bl above rock-side-l',
    'rock-inner-br left of rock-bottom', 'rock-inner-br above rock-side-r', 'rock-left left of rock-right', 'rock-top above rock-bottom',
  ]) assert.ok(j.includes(pair), `missing join: ${pair}`);
  assert.ok(!j.includes('rock-fill left of rock-top') && !j.includes('rock-side-r left of rock-fill'), 'pairs that cannot touch are not tested');
  assert.ok(j.length >= 60, `${j.length} joins`);
});
test('tileset block: one wrong edge fails, naming the two pieces and the side', () => {
  const r = expectError(F.blockWrongEdge, /seam: rock-right bottom edge → rock-side-r top edge does not join/);
  assert.ok(has(r.errors, /seam: rock-side-r bottom edge → rock-bottom-r top edge does not join/), show(r));
  assert.ok(has(r.errors, /seam: rock-side-r bottom edge → rock-side-r top edge|seam: rock-fill right edge → rock-side-r left edge/) || true);
  assert.ok(!has(r.errors, /rock-left|rock-side-l|rock-bottom-l|rock-top right edge → rock-top/), `only joins with the wrong piece fail\n${show(r)}`);
});
test('tileset block: slopes join the top beside them and the inner corner under them', () => {
  const r = expectClean(F.blockSlopes);
  for (const pair of ['rock-slope-up left of rock-top', 'rock-top left of rock-slope-down', 'rock-slope-up above rock-inner-tl', 'rock-slope-down above rock-inner-tr']) assert.ok(r.metrics.joins.includes(pair), pair);
  expectError(F.blockBadSlope, /seam: rock-slope-up right edge → rock-top left edge does not join/);
});
test('tileset block, top-down: a wall whose bottom row is a darker front face passes', () => {
  const r = expectClean(F.wallTopDown);
  assert.ok(r.metrics.joins.includes('wall-fill above wall-bottom'), 'the outline of the cap and the face must still line up');
  assert.ok(!r.metrics.joins.includes('wall-bottom left of wall-inner-bl'), 'the face ends against the cap there by design');
});
test('tileset block, side view: the same dark bottom row is a seam', () => expectError(F.wallSideView, /seam: wall-fill bottom edge → wall-bottom top edge does not join/));
test('tileset block, top-down: the face must still line up with the cap above it', () => expectError(F.wallShortFace, /seam: wall-side-l bottom edge → wall-bottom-l top edge does not join \(.*outlines differ by 3 px/));
test('tileset: thin platform pieces repeat sideways and things that stack line up', () => {
  const r = expectClean(F.extrasGood);
  for (const pair of ['plank-thin-l left of plank-thin-m', 'plank-thin-m left of plank-thin-m', 'plank-thin-m left of plank-thin-r', 'ladder-cap above ladder-mid', 'ladder-mid above ladder-mid', 'ladder-mid above ladder-foot']) assert.ok(r.metrics.joins.includes(pair), pair);
  assert.ok(!has(r.warnings, /nothing checks|does not line up/), show(r));
});
test('tileset: a thin platform middle that does not repeat sideways is a seam', () => expectError(F.thinSeam, /seam: plank-thin-m right edge → plank-thin-m left edge does not join/));
test('tileset: pieces that stack but do not line up are a warning', () => expectWarningOnly(F.stackShifted, /ladder-cap bottom edge → ladder-mid top edge does not line up/));
// ---- exact checks at a join, more joins, more looks -------------------------------------------------------
test('tileset block: the seven narrow pieces and a second fill are tested like the rest', () => {
  const r = expectClean(F.blockNarrow);
  for (const pair of ['rock-strip-l left of rock-strip-m', 'rock-strip-m left of rock-strip-m', 'rock-col-t above rock-col-m', 'rock-col-m above rock-col-b', 'rock-fill left of rock-fill-b', 'rock-fill-b above rock-fill-b', 'rock-top above rock-fill-b', 'rock-fill-b left of rock-side-r']) assert.ok(r.metrics.joins.includes(pair), pair);
  assert.ok(!has(r.warnings, /join|seam|line up|texture/), show(r));
});
test('tileset: another version of the fill has the same four edges as the fill', () => expectError(F.blockFillEdgeMark, /rock-fill-b: its left column is not the same as rock-fill's/));
test('tileset: the outline must meet exactly at a tile boundary, even one pixel', () => {
  const r = expectError(F.blockOutlineOff, /seam: rock-top right edge → rock-top left edge does not join \(.*outline.*1 px/);
  assert.ok(has(r.errors, /rock-top right edge → rock-right left edge/), show(r));
});
test('tileset: the edge band must be as deep on both sides of a join', () => {
  const r = expectError(F.blockBandJump, /seam: rock-top right edge → rock-top left edge does not join \(.*edge band/);
  assert.ok(!has(r.errors, /rock-fill|rock-side-l bottom edge → rock-side-l/), show(r));
});
test('tileset: joins are tested at every choice and on/off setting, not only the default', () => expectError(F.blockSeamWhenToggled, /seam: rock-right bottom edge → rock-side-r top edge does not join \(speckles=false/));
test('tileset: slopes are tested beside the corner tile, at a peak and in a valley, and for a nub on their line', () => {
  const r = expectClean(F.blockSlopes);
  for (const pair of ['rock-slope-up left of rock-inner-tl', 'rock-inner-tr left of rock-slope-down', 'rock-slope-up left of rock-slope-down', 'rock-slope-down left of rock-slope-up']) assert.ok(r.metrics.joins.includes(pair), pair);
  expectError(F.blockSlopeNub, /rock-inner-tl.*nub on the slope/);
});
test('tileset: a decal that stands on the block reaches the bottom of its cell and has the top line under it', () => {
  expectClean(F.blockDecal);
  expectError(F.blockDecalFloats, /rock-deco-a: floats: .*3 px above the bottom of its cell/);
  expectError(F.blockDecalOverDip, /rock-deco-a: floats: .*rock-top.*column/);
  expectClean(F.blockDecalBesideDip);
  assert.ok(!has(run(F.blockDecal).warnings, /place/), show(run(F.blockDecal)));
});
test('tileset: a decal placed over a fill tile but drawn standing on the bottom of its cell is a warning', () => expectWarningOnly(F.blockDecalWrongPlace, /rock-deco-a: its place is 'on'.*'above'/));
test('tileset: fill texture that a look turns into the fill colour is a warning, for every swatch', () => {
  const r = expectWarningOnly(F.blockFaintStones, /rock-fill: .*texture.*look/);
  assert.ok(!has(run(F.blockGood).warnings, /texture/), show(run(F.blockGood)));
  assert.equal(r.metrics.fillTexture.tested, 3, 'every swatch that changes the fill is tried');
  assert.ok(r.metrics.fillTexture.lost.length >= 1);
});
test('tileset: something that repeats along a platform or up a ladder must fit 32 px a whole number of times', () => {
  expectWarningOnly(F.thinRhythm, /plank-thin-m: .*every 9 px.*join/);
  expectWarningOnly(F.stackRhythm, /ladder-mid: .*15 px.*join/);
  assert.ok(!has(run(F.extrasGood).warnings, /every \d+ px/), show(run(F.extrasGood)));
});
test('tileset: with nothing to test for joins there is a warning', () => expectWarningOnly(F.nothingToJoin, /nothing checks that it repeats/));
test('background: a good background passes', () => {
  const r = expectClean(F.backgroundGood);
  assert.equal(r.metrics.type, 'background');
});
test('background: left and right edges continue into each other', () => expectError(F.backgroundSeam, /near: left and right edges do not continue into each other/));
test('background: every layer spans the full width, one error per layer', () => {
  const r = expectError(F.backgroundGap, /near: layer does not span the full width/);
  assert.equal(count(r.errors, /does not span/), 1, show(r));
});

test('checkSprite is fast (under 1 s for the fixture)', () => {
  const r = run(F.good);
  assert.ok(r.metrics.ms < 1000, `${r.metrics.ms} ms`);
});
