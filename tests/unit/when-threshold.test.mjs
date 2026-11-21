// The threshold `when` (build item B15b; docs/architecture.md Contract 3, docs/data-sprites.md 2.6): an entry of a `when`
// list may be a threshold on a slider, { atLeast?, above?, atMost?, below? } (at least one bound; every bound given must
// hold), beside plain values: `"when": { "wear": [{ "atLeast": 0.35 }] }` is "wear >= 0.35". One rule, read the same by:
//   - engine/data-rules.js whenMatches (the `choose` colour rule, engine/gen/backdrop.js) and whenValueHolds;
//   - engine/resolve.js whenHolds / splitWhen (shapes, stamps, generator calls, band rules, outside rules, layer
//     items, a piece's args), so an item below its threshold is dropped from the frame;
//   - catalog/sprite-schema.js checkWhen: a threshold names a slider (or a number arg of a piece), its bounds inside the
//     slider's range, with at most one lower and one upper bound, and it must be able to hold;
//   - engine/sprite.js inEffect, cueInEffect and cleanWhen (build item F3): a control's own `when` and a sound cue's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { whenMatches, whenValueHolds, WHEN_BOUNDS } from '../../engine/data-rules.js';
import { whenHolds, resolvePalette } from '../../engine/resolve.js';
import { validateSprite, checkMaterialPiece } from '../../catalog/sprite-schema.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defineSprite, range, toggle, choice, inEffect, cueInEffect, defaultParams } from '../../engine/sprite.js';

// the keys of the controls in effect at these settings, in the order of sprite.params (what engine/sprite.js activeParams was, built from inEffect, the one rule)
const activeParams = (sprite, p) => Object.keys(sprite.params).filter((k) => inEffect(sprite, k, p));

const SOIL = '#7a5236', GRASS = '#5aa040';
const WEAR = { key: 'wear', kind: 'range', label: 'Wear', lo: 'New', hi: 'Worn', default: 0.35 };
const EDGE = { key: 'edge', kind: 'range', label: 'Edge', lo: 'Thin', hi: 'Deep', min: 3, max: 9, step: 1, default: 5 };
const DAMP = { key: 'damp', kind: 'toggle', label: 'Damp', default: false };
function tileset(group, { controls = [WEAR, EDGE, DAMP], palette = [] } = {}) {
  return {
    format: 'loadout-sprite', version: 2, id: 'tiles-test', name: 'Test tiles', blurb: 'Tiles for a test.', size: [32, 32], pivot: [16, 16], grounded: false,
    meta: { type: 'tileset', role: 'world/tile', view: 'side', themes: ['forest'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [{ id: 'soil', label: 'Soil', default: SOIL, material: 'earth' }, { id: 'grass', label: 'Grass', default: GRASS, material: 'plant' }, ...palette],
    controls,
    body: { tiles: { tile: 32, groups: [group] } },
  };
}
const crack = (when) => ({ kind: 'rect', at: [10, 12], size: [6, 1], paint: 'soil.dark', when });
// every control is used somewhere (the validator refuses one nothing names): edge sets the cap's depth, damp and wear a
// rule beyond the outline that a fill tile never shows
const KEEP = [{ y: [0, 0], paint: 'grass.dark', when: { damp: [true], wear: [1] } }];
const withFill = (list, edges) => tileset({ name: 'g', kind: 'block', fills: 1, material: { fill: { base: 'soil', versions: [list] }, edges: edges ?? { top: { depth: { from: 'edge', map: [[3, 3], [9, 9]] }, bands: [{ rows: [1, 99], paint: 'grass' }] } }, outside: KEEP } });
const errorsOf = (d) => validateSprite(d).errors.join('\n');

// ---- the rule ------------------------------------------------------------------------------------------------------

test('the bounds are atLeast (>=), above (>), atMost (<=) and below (<), and a threshold holds when every bound given does', () => {
  assert.deepEqual([...WHEN_BOUNDS], ['atLeast', 'above', 'atMost', 'below']);
  assert.equal(whenValueHolds({ atLeast: 0.35 }, 0.35), true);
  assert.equal(whenValueHolds({ atLeast: 0.35 }, 0.3499), false);
  assert.equal(whenValueHolds({ above: 0.35 }, 0.35), false);
  assert.equal(whenValueHolds({ above: 0.35 }, 0.36), true);
  assert.equal(whenValueHolds({ atMost: 0.6 }, 0.6), true);
  assert.equal(whenValueHolds({ below: 0.6 }, 0.6), false);
  assert.equal(whenValueHolds({ atLeast: 0.3, below: 0.6 }, 0.45), true);
  assert.equal(whenValueHolds({ atLeast: 0.3, below: 0.6 }, 0.6), false);
  assert.equal(whenValueHolds({ atLeast: 0.3, below: 0.6 }, 0.2), false);
  // never for a value that is not a number, an empty threshold, or a bound that is not a number
  assert.equal(whenValueHolds({ atLeast: 0 }, '1'), false);
  assert.equal(whenValueHolds({ atLeast: 0 }, true), false);
  assert.equal(whenValueHolds({}, 0.5), false);
  assert.equal(whenValueHolds({ atLeast: '0' }, 0.5), false);
  assert.equal(whenValueHolds({ nope: 0 }, 0.5), false);
  // a plain value is matched as before (colours without regard to case)
  assert.equal(whenValueHolds(0.5, 0.5), true);
  assert.equal(whenValueHolds('#AABBCC', '#aabbcc'), true);
  assert.equal(whenValueHolds(true, true), true);
});

test('whenMatches (choose, backdrops) reads thresholds beside values, in a list or alone, and in alternatives', () => {
  assert.equal(whenMatches({ wear: [{ atLeast: 0.35 }] }, { wear: 0.5 }), true);
  assert.equal(whenMatches({ wear: [{ atLeast: 0.35 }] }, { wear: 0.2 }), false);
  assert.equal(whenMatches({ wear: { atLeast: 0.35 } }, { wear: 0.5 }), true, 'one threshold not in a list');
  assert.equal(whenMatches({ wear: [0, { atLeast: 0.8 }] }, { wear: 0 }), true, 'a value or a threshold');
  assert.equal(whenMatches({ wear: [0, { atLeast: 0.8 }] }, { wear: 0.5 }), false);
  assert.equal(whenMatches({ wear: [{ atLeast: 0.35 }], damp: [true] }, { wear: 0.5, damp: false }), false, 'every key must match');
  assert.equal(whenMatches([{ wear: [{ atLeast: 0.9 }] }, { damp: [true] }], { wear: 0.5, damp: true }), true, 'any alternative');
  assert.equal(whenMatches({ wear: [{ atLeast: 0.35 }] }, {}), false, 'a setting not given is not a number');
});

test('engine/resolve.js whenHolds reads the same rule, with the slider\'s default when the setting is left out', () => {
  const d = tileset({ name: 'g', kind: 'block', material: { fill: { base: 'soil' } } });
  assert.equal(whenHolds(d, { wear: [{ atLeast: 0.35 }] }, {}), true, 'the default 0.35 is at least 0.35');
  assert.equal(whenHolds(d, { wear: [{ above: 0.35 }] }, {}), false);
  assert.equal(whenHolds(d, { wear: [{ atLeast: 0.35 }] }, { wear: 0.2 }), false);
  assert.equal(whenHolds(d, { edge: [{ atLeast: 6, atMost: 7 }] }, { edge: 7 }), true);
  assert.equal(whenHolds(d, { edge: [3, { above: 8 }] }, { edge: 9 }), true);
  assert.equal(whenHolds(d, [{ damp: [true] }, { wear: { below: 0.1 } }], { wear: 0 }), true);
  assert.equal(whenHolds(d, { wear: [{ atLeast: 0.35 }], clip: ['g-fill'] }, { wear: 1 }), null, 'a clip left to decide');
  // whenHolds and whenMatches agree everywhere on a grid of settings
  for (const wear of [0, 0.1, 0.35, 0.5, 0.75, 1]) for (const w of [{ atLeast: 0.35 }, { above: 0.35 }, { atMost: 0.5 }, { below: 0.5 }, { atLeast: 0.1, below: 0.75 }]) {
    assert.equal(whenHolds(d, { wear: [w] }, { wear }), whenMatches({ wear: [w] }, { wear }), `${JSON.stringify(w)} at ${wear}`);
  }
});

// ---- drawn -------------------------------------------------------------------------------------------------------

test('a mark under a threshold is drawn at or past it and dropped below it (the dungeon\'s long cracks at wear >= 0.35)', () => {
  const s = dataSprite(withFill([crack({ wear: [{ atLeast: 0.6 }] })]));
  const at = (wear) => renderFrame(s, 'g-fill', 0, { wear });
  const none = renderFrame(dataSprite(withFill([])), 'g-fill', 0, {});
  assert.deepEqual([...at(0.59).data], [...none.data], 'below: not drawn');
  assert.notDeepEqual([...at(0.6).data], [...none.data], 'at: drawn');
  assert.deepEqual([...at(0.6).data], [...at(1).data]);
});

test('a band rule with a threshold is dropped below it, so the next rule decides', () => {
  const edges = { top: { depth: { from: 'edge', map: [[3, 3], [9, 9]] }, bands: [{ rows: [1, 1], paint: 'soil.dark', when: { wear: [{ above: 0.5 }] } }, { rows: [1, 99], paint: 'grass' }] } };
  const s = dataSprite(withFill([], edges));
  const row1 = (wear) => { const f = renderFrame(s, 'g-top', 0, { wear }); return [...f.data.slice(32 * 1 + 4, 32 * 1 + 28)]; };
  assert.notDeepEqual(row1(0.5), row1(0.51));
  assert.deepEqual(row1(0), row1(0.5));
});

test('a choose rule may take a threshold, in a derived slot', () => {
  const d = withFill([{ kind: 'rect', at: [4, 4], size: [2, 2], paint: 'worn' }]);
  d.palette.push({ id: 'worn', material: 'earth', derive: { rule: 'choose', when: { wear: [{ atLeast: 0.5 }] }, then: 'soil.dark', else: 'soil.light' } });
  const r = validateSprite(d);
  assert.deepEqual(r.errors, []);
  assert.notEqual(resolvePalette(d, { wear: 0.4 }).worn.hex, resolvePalette(d, { wear: 0.5 }).worn.hex);
  assert.equal(resolvePalette(d, { wear: 0.5 }).worn.hex, resolvePalette(d, { wear: 1 }).worn.hex);
});

// ---- checked ------------------------------------------------------------------------------------------------------

test('the validator passes a threshold on a slider in a shape, a band rule and an outside rule, and keeps it as written', () => {
  const d = withFill([crack({ wear: [{ atLeast: 0.35 }, 0] })], { top: { depth: { from: 'edge', map: [[3, 3], [9, 9]] }, bands: [{ rows: [1, 1], paint: 'soil', when: { edge: { atLeast: 6 } } }, { rows: [1, 99], paint: 'grass' }] } });
  d.body.tiles.groups[0].material.outside = [{ y: [0, 2], paint: 'grass.dark', when: { wear: [{ atLeast: 0.2, below: 0.8 }] } }, ...KEEP];
  const r = validateSprite(d);
  assert.deepEqual(r.errors, []);
  const m = r.value.body.tiles.groups[0].material;
  assert.deepEqual(m.fill.versions[0][0].when, { wear: [{ atLeast: 0.35 }, 0] });
  assert.deepEqual(m.outside[0].when, { wear: [{ atLeast: 0.2, below: 0.8 }] });
});

test('the validator refuses a threshold that names no slider, reaches outside its range, cannot hold, or has unknown words', () => {
  const bad = (when) => errorsOf(withFill([crack(when)]));
  assert.match(bad({ damp: [{ atLeast: 0.5 }] }), /threshold.*"damp".*slider/s);
  assert.match(bad({ wear: [{ atLeast: 1.5 }] }), /atLeast 1\.5.*"wear".*0 to 1/s);
  assert.match(bad({ edge: [{ below: 2 }] }), /below 2.*"edge".*3 to 9/s);
  assert.match(bad({ wear: [{ atLeast: 0.8, below: 0.5 }] }), /can never hold/);
  assert.match(bad({ wear: [{ above: 1 }] }), /can never hold/);
  assert.match(bad({ wear: [{ below: 0 }] }), /can never hold/);
  assert.match(bad({ wear: [{ atLeast: 0.2, above: 0.3 }] }), /one lower bound/);
  assert.match(bad({ wear: [{ atMost: 0.2, below: 0.3 }] }), /one upper bound/);
  assert.match(bad({ wear: [{}] }), /threshold.*atLeast, above, atMost or below/s);
  assert.match(bad({ wear: [{ least: 0.5 }] }), /atLeast, above, atMost or below.*"least" is not one/s);
  assert.match(bad({ wear: [{ atLeast: '0.5' }] }), /atLeast.*number/);
});

// build item F3: engine/sprite.js reads these with whenValueHolds, so the validator no longer refuses them
test('a threshold may stand in a control\'s own when and in a sound cue\'s, as on any other when', () => {
  const d = withFill([]);
  d.controls = [WEAR, EDGE, { ...DAMP, when: { wear: [{ atLeast: 0.5 }] } }];
  assert.deepEqual(validateSprite(d).errors, []);
  assert.deepEqual(validateSprite(d).value.controls.find((c) => c.key === 'damp').when, { wear: [{ atLeast: 0.5 }] }, 'kept as written');
  // still checked as a threshold: on a slider, inside its range, able to hold
  const onToggle = withFill([]);
  onToggle.controls = [WEAR, { ...EDGE, when: { damp: [{ atLeast: 0.5 }] } }, DAMP];
  assert.match(errorsOf(onToggle), /Control "edge".*threshold is for a slider/s);
  const outside = withFill([]);
  outside.controls = [WEAR, EDGE, { ...DAMP, when: { edge: [{ atLeast: 12 }] } }];
  assert.match(errorsOf(outside), /Control "damp".*outside its range/s);
  const plainValue = withFill([]);
  plainValue.controls = [WEAR, EDGE, { ...DAMP, when: { wear: [0.35, 1] } }];
  assert.deepEqual(validateSprite(plainValue).errors, [], 'values are fine there');
  const cue = (when) => { const x = withFill([]); x.clips = { 'g-fill': { frames: 1, sounds: [{ sound: 'coin-pickup', frame: 0, when }] } }; return x; };
  assert.deepEqual(validateSprite(cue({ wear: [{ atLeast: 0.5 }] })).errors, [], 'a sound cue\'s when with a threshold passes');
  assert.match(errorsOf(cue({ wear: [{ atLeast: 0.5, above: 0.6 }] })), /one lower bound/);
  assert.deepEqual(validateSprite(cue({ wear: [1] })).errors, [], 'a sound cue\'s when with values passes');
});

test('a material piece\'s when may hold a threshold on its number args', () => {
  const piece = {
    id: 'material:test-worn', v: 1, slots: [{ id: 'm', default: SOIL, material: 'earth' }],
    args: { wear: { type: 'share', default: 0.5 }, look: { type: 'word', options: ['a', 'b'], default: 'a' } },
    body: { fill: { base: 'm', versions: [[{ kind: 'rect', at: [10, 12], size: [4, 1], paint: 'm.dark', when: { wear: [{ atLeast: 0.35 }] } }]] } },
  };
  assert.deepEqual(checkMaterialPiece(piece).errors, []);
  const onWord = { ...piece, body: { fill: { base: 'm', versions: [[{ kind: 'rect', at: [10, 12], size: [4, 1], paint: 'm.dark', when: { look: [{ atLeast: 0.35 }] } }]] } } };
  assert.match(checkMaterialPiece(onWord).errors.join('\n'), /threshold.*"look"/s);
});

test('emitters whose thresholds can hold together are summed for the stamp budget, and those they keep apart are not', () => {
  const glow = { gen: 'glow', v: 1, at: [64, 48], r: 30, paints: ['spark', 'spark'] };
  const two = (w0, w1) => ({
    format: 'loadout-sprite', version: 2, id: 'two-glows', name: 'Two glows', blurb: 'x', size: [128, 96], pivot: [64, 48], grounded: false,
    meta: { type: 'effect', role: 'effects/spark', view: 'none', themes: ['neutral'], gameTypes: ['arcade'], words: ['x'], license: 'draft' },
    palette: [{ id: 'spark', label: 'Spark', default: '#ffd060', material: 'fire' }],
    controls: [{ key: 'size', kind: 'range', label: 'Size', lo: 'a', hi: 'b', default: 0.5 }],
    body: { emitters: [{ id: 'e0', ...glow, when: w0 }, { id: 'e1', ...glow, when: w1 }] },
    clips: { a: { frames: 4, fps: 8, loop: true } },
  });
  // 0.3..1 and 0..0.7 overlap: both glows draw at 0.5, so they are summed and refused (as two unconditional ones are)
  assert.match(validateSprite(two({ size: [{ atLeast: 0.3 }] }, { size: [{ atMost: 0.7 }] })).errors.join(' '), /The emitters can paint up to/);
  // plain values the whens keep apart are still not summed
  assert.doesNotMatch(validateSprite(two({ size: [0] }, { size: [1] })).errors.join(' '), /The emitters can paint up to/);
  // thresholds that keep them apart (review B15b issue 2): below 0.5 and at least 0.5 never hold together, so not summed
  assert.deepEqual(validateSprite(two({ size: [{ below: 0.5 }] }, { size: [{ atLeast: 0.5 }] })).errors, []);
  assert.deepEqual(validateSprite(two({ size: [{ atMost: 0.2 }] }, { size: [{ above: 0.2 }, 0] })).errors.filter((e) => /emitters can paint/.test(e)).length, 1, 'size 0 is listed beside above 0.2, and 0 <= 0.2: both on');
  assert.deepEqual(validateSprite(two({ size: [{ above: 0.2, below: 0.4 }] }, { size: [{ atLeast: 0.4 }, 0.1] })).errors, []);
  // where they do overlap, the message names a setting, never a threshold object
  const msg = validateSprite(two({ size: [{ atLeast: 0.3 }] }, { size: [{ atMost: 0.7 }] })).errors.join(' ');
  assert.doesNotMatch(msg, /\{"/);
  assert.match(msg, /with size 0\.\d+/);
});

// review B15b round 3, issue 2: the stretch past the last number named (and before the first) is inside a 0..1 slider,
// so it is tried at the slider's own ends, not one step past the number (which the range drops)
test('emitters on together only past a strict bound, or between two named numbers, are summed', () => {
  const glow = { gen: 'glow', v: 1, at: [64, 48], r: 30, paints: ['spark', 'spark'] };   // 4,225 px each: two are over 8,192
  const two = (w0, w1, control = {}) => ({
    format: 'loadout-sprite', version: 2, id: 'two-glows', name: 'Two glows', blurb: 'x', size: [128, 96], pivot: [64, 48], grounded: false,
    meta: { type: 'effect', role: 'effects/spark', view: 'none', themes: ['neutral'], gameTypes: ['arcade'], words: ['x'], license: 'draft' },
    palette: [{ id: 'spark', label: 'Spark', default: '#ffd060', material: 'fire' }],
    controls: [{ key: 'size', kind: 'range', label: 'Size', lo: 'a', hi: 'b', default: 0.5, ...control }],
    body: { emitters: [{ id: 'e0', ...glow, when: w0 }, { id: 'e1', ...glow, when: w1 }] },
    clips: { a: { frames: 4, fps: 8, loop: true } },
  });
  const budget = (d) => validateSprite(d).errors.filter((e) => /emitters can paint/.test(e));
  // past a strict bound: only the slider's end reaches it (the reviewer's probe7)
  assert.equal(budget(two({ size: [{ above: 0.2 }] }, { size: [{ above: 0.2 }] })).length, 1, 'both above 0.2: both on at 1');
  assert.equal(budget(two({ size: [{ below: 0.5 }] }, { size: [{ below: 0.5 }] })).length, 1, 'both below 0.5: both on at 0');
  assert.equal(budget(two({ size: [{ above: 0.2 }] }, { size: [{ above: 0.4 }] })).length, 1, 'above 0.2 and above 0.4: both on at 1');
  assert.equal(budget(two({ size: [{ atLeast: 0.5 }] }, { size: [{ atLeast: 0.5 }] })).length, 1, 'both at least 0.5 (control)');
  // a slider with its own range: the ends are its min and max
  assert.equal(budget(two({ size: [{ above: 6 }] }, { size: [{ above: 6 }] }, { min: 3, max: 9, step: 1, default: 5 })).length, 1, 'both above 6 on 3..9');
  assert.equal(budget(two({ size: [{ below: 6 }] }, { size: [{ atLeast: 6 }] }, { min: 3, max: 9, step: 1, default: 5 })).length, 0, 'below 6 and at least 6 on 3..9 never meet');
  // a stretch only a point between two named numbers reaches (review issue 4)
  assert.equal(budget(two({ size: [{ above: 0.2, below: 0.4 }] }, { size: [{ above: 0.2, below: 0.4 }] })).length, 1, 'both 0.2 < size < 0.4: both on at 0.3');
  assert.equal(budget(two({ size: [{ above: 0.2 }] }, { size: [{ below: 0.4 }] })).length, 1, 'above 0.2 and below 0.4: both on at 0.3');
  assert.equal(budget(two({ size: [{ above: 0.2 }] }, { size: [{ atMost: 0.2 }] })).length, 0, 'above 0.2 and at most 0.2 never meet');
});

// review B15b issue 3, done in build item F3: inEffect, cueInEffect and cleanWhen read entries with whenValueHolds
test('engine/sprite.js reads a threshold in a control\'s own when and a sound cue\'s when', () => {
  // a data sprite: damp shows at wear >= 0.5; the sound plays at wear 0 or above 0.8
  const d = withFill([]);
  d.controls = [WEAR, EDGE, { ...DAMP, when: { wear: [{ atLeast: 0.5 }] } }];
  d.clips = { 'g-fill': { frames: 1, sounds: [{ sound: 'coin-pickup', frame: 0, when: { wear: [0, { above: 0.8 }] } }] } };
  const s = dataSprite(d);
  const at = (wear) => ({ ...defaultParams(s), wear });
  assert.equal(inEffect(s, 'damp', at(0.35)), false, 'below the threshold: hidden');
  assert.equal(inEffect(s, 'damp', at(0.5)), true, 'at it');
  assert.equal(inEffect(s, 'damp', at(0.9)), true, 'past it');
  assert.equal(activeParams(s, at(0.2)).includes('damp'), false);
  assert.equal(activeParams(s, at(0.7)).includes('damp'), true);
  const cue = s.sounds['g-fill'][0];
  assert.deepEqual(cue.when, { wear: [0, { above: 0.8 }] });
  assert.deepEqual([0, 0.5, 0.8, 0.81, 1].map((w) => cueInEffect(s, cue, at(w))), [true, false, false, true, true]);
  assert.equal(cueInEffect(s, { sound: 'x', frame: 0, when: [{ wear: [{ below: 0.1 }] }, { edge: [{ atLeast: 8 }] }] }, { ...at(0.5), edge: 9 }), true, 'alternatives: any one enough');

  // a code sprite (defineSprite) reads them the same way, and a control hidden by a threshold cannot switch another on
  const code = (moss, extra = {}) => defineSprite({
    id: 'test-moss', name: 'Test moss', size: [8, 8], pivot: [4, 7],
    params: { wear: range('Wear', 0.2), moss: toggle('Moss', true, { when: moss }), tuft: choice('Tuft', 'a', ['a', 'b'], { when: { moss: [true] } }) },
    clips: { idle: { frames: 2, fps: 4 } }, sounds: { idle: [{ sound: 'x', frame: 0, when: { wear: [{ above: 0.25, atMost: 0.75 }] } }] },
    render() {}, ...extra,
  });
  const m = code({ wear: [{ atLeast: 0.5 }] });
  assert.deepEqual(m.params.moss.when, { wear: [{ atLeast: 0.5 }] });
  assert.equal(inEffect(m, 'tuft', { wear: 0.3, moss: true, tuft: 'a' }), false, 'moss is below its threshold, so it cannot show tuft');
  assert.equal(inEffect(m, 'tuft', { wear: 0.6, moss: true, tuft: 'a' }), true);
  assert.deepEqual([0.25, 0.5, 0.75, 0.8].map((w) => cueInEffect(m, m.sounds.idle[0], { wear: w })), [false, true, true, false]);
  // a threshold is checked as engine/sprite.js defines the sprite: for a slider, known words, numbers in its range, able to hold
  assert.throws(() => code({ tuft: [{ atLeast: 0.5 }] }), /threshold.*slider/);
  assert.throws(() => code({ wear: [{ least: 0.5 }] }), /atLeast, above, atMost or below/);
  assert.throws(() => code({ wear: [{}] }), /atLeast, above, atMost or below/);
  assert.throws(() => code({ wear: [{ atLeast: '0.5' }] }), /number/);
  assert.throws(() => code({ wear: [{ atLeast: 2 }] }), /outside/);
  assert.throws(() => code({ wear: [{ above: 0.6, below: 0.4 }] }), /can never hold/);
  assert.throws(() => code({ wear: [{ atLeast: 0.5, above: 0.6 }] }), /one lower bound/);
  assert.throws(() => code({ wear: [0.5] }, { sounds: { idle: [{ sound: 'x', frame: 0, when: { wear: [{ atMost: -1 }] } }] } }), /sound x on clip idle.*outside/);
});

// F3 review fix: one checker for a threshold (engine/sprite.js thresholdProblem), used by the validator and by
// defineSprite, so their rules cannot drift apart; and a number that meets a threshold (whenEntryValue), which the
// quality bar uses to build a setting where a control limited to a band of a slider is in effect.
test('thresholdProblem is the one check of a threshold: the validator and defineSprite report the same words', async () => {
  const { thresholdProblem } = await import('../../engine/sprite.js');
  const slider = { kind: 'range', min: 0, max: 1, step: 0.01 };
  assert.equal(thresholdProblem({ atLeast: 0.4, atMost: 0.6 }, slider, 'wear'), '');
  assert.equal(thresholdProblem({ above: 0.99 }, slider, 'wear'), '');
  const cases = [
    [{ atLeast: 0.5 }, { kind: 'toggle' }, /threshold.*"damp".*slider/s, 'damp'],
    [{}, slider, /atLeast, above, atMost or below/],
    [{ least: 0.5 }, slider, /atLeast, above, atMost or below.*"least" is not one/s],
    [{ atLeast: '0.5' }, slider, /atLeast.*number/],
    [{ atLeast: 1.5 }, slider, /atLeast 1\.5.*"wear".*0 to 1/s],
    [{ atLeast: 0.2, above: 0.3 }, slider, /one lower bound/],
    [{ atMost: 0.2, below: 0.3 }, slider, /one upper bound/],
    [{ atLeast: 0.8, below: 0.5 }, slider, /can never hold/],
    [{ above: 1 }, slider, /can never hold/],
  ];
  for (const [x, d, re, key = 'wear'] of cases) {
    const said = thresholdProblem(x, d, key);
    assert.match(said, re, JSON.stringify(x));
    // the validator says the same words (in a shape's when, after its place)
    const withD = d.kind === 'range' ? { wear: [x] } : { damp: [x] };
    assert.ok(errorsOf(withFill([crack(withD)])).includes(said), `validator: ${said}`);
    // and so does defineSprite, for a control's own when
    const params = { wear: range('Wear', 0.2), damp: toggle('Damp', false), moss: toggle('Moss', true, { when: withD }) };
    assert.throws(() => defineSprite({ id: 'test-t', name: 'T', size: [8, 8], pivot: [4, 7], params, clips: { idle: { frames: 1, fps: 4 } }, render() {} }),
      (e) => e.message.includes(said), `defineSprite: ${said}`);
  }
});

test('whenEntryValue gives a setting that meets a when entry: a value as it is, a threshold at the middle of its bounds on the slider\'s step', async () => {
  const { whenEntryValue } = await import('../../engine/sprite.js');
  const wear = range('Wear', 0.2), edge = range('Edge', 5, { min: 3, max: 9, step: 1 });
  assert.equal(whenEntryValue(0.5, wear), 0.5);
  assert.equal(whenEntryValue('a', choice('Tuft', 'a', ['a', 'b'])), 'a');
  assert.equal(whenEntryValue({ atLeast: 0.4, atMost: 0.6 }, wear), 0.5);
  assert.equal(whenEntryValue({ above: 5, below: 7 }, edge), 6);
  assert.equal(whenEntryValue({ atLeast: 4, below: 5 }, edge), 4, 'on the step when one fits');
  for (const [x, d] of [[{ above: 0.6 }, wear], [{ below: 0.1 }, wear], [{ atLeast: 1 }, wear], [{ above: 0.4, below: 0.41 }, wear], [{ atMost: 3 }, edge], [{ above: 8 }, edge], [{ above: 5.2, below: 5.8 }, edge]]) {
    const v = whenEntryValue(x, d);
    assert.ok(whenValueHolds(x, v) && v >= d.min && v <= d.max, `${JSON.stringify(x)} -> ${v}`);
  }
});

test('the quality bar finds where a control limited to a band of a slider applies (a two-sided threshold in its when)', async () => {
  const { checkSprite } = await import('../../quality/sprite.js');
  const mk = (when) => defineSprite({
    id: 'test-moss', name: 'Test moss', blurb: 'A test.', size: [16, 16], pivot: [8, 15],
    params: { wear: range('Wear', 0.2), moss: toggle('Moss', true, { when }) },
    clips: { idle: { frames: 1, fps: 4 } },
    render(g, { p }) {
      g.rect(2, 2 + Math.round(p.wear * 10), 12, 3, '#7a5236');
      if (p.wear >= 0.4 && p.wear <= 0.6 && p.moss) g.rect(2, 10, 12, 4, '#5aa040');
    },
  });
  const mossSays = (r) => [...(r.errors ?? []), ...(r.warnings ?? [])].filter((e) => /moss/i.test(e));
  const byValue = checkSprite(mk({ wear: [0.5] }));
  const byBand = checkSprite(mk({ wear: [{ atLeast: 0.4, atMost: 0.6 }] }));
  assert.deepEqual((byBand.errors ?? []).filter((e) => /moss/i.test(e)), [], 'no "can never apply" error');
  assert.deepEqual(mossSays(byBand).map((e) => e.replace(/wear=[\d.]+/g, 'wear=x')), mossSays(byValue).map((e) => e.replace(/wear=[\d.]+/g, 'wear=x')), 'says what it says for the plain value');
});
