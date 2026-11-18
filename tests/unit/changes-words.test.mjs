// What a visitor changed, in plain words (app/changes.js): the line a bag row shows instead of "Your own look".
// Built from each control's own label, its low and high end words, its option names and its colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, range, choice, color, toggle, defaultParams } from '../../engine/sprite.js';
import { spriteChanges, soundChanges, inWords, colourName, comparative } from '../../app/changes.js';

const hero = defineSprite({
  id: 'test-hero', name: 'Test hero', size: [8, 8], pivot: [4, 8],
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    head: range('Head', 0.55, { lo: 'Small', hi: 'Big' }),
    hair: color('Color', '#5a3a22', ['#5a3a22', '#e0b040']),
    hairStyle: choice('Hair', 'short', ['short', 'long', 'bald']),
    weapon: choice('Weapon', 'sword', ['sword', 'axe', 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, lo: 'Short', hi: 'Long' }),
    cape: choice('Cape', 'plain', ['plain', 'tattered', 'none']),
    trim: color('Cape', '#3f6fd1', ['#3f6fd1', '#c9423a']),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
    sparkle: toggle('Sparkle', false),
    plain: range('Texture', 0.5),                      // a slider whose ends have no words
  },
  parts: {
    hair: { label: 'Hair', params: ['hairStyle', 'hair'], none: 'bald' },
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none' },
  },
  clips: { idle: { frames: 1, fps: 1 } },
  render() {},
});
const set = (changes) => ({ ...defaultParams(hero), ...changes });

test('a sprite at its standard settings has nothing to say', () => {
  assert.deepEqual(spriteChanges(hero, defaultParams(hero)), []);
  assert.deepEqual(spriteChanges(hero, {}), []);
  assert.equal(inWords([]), '');
});

test('a slider is described by the end word it moved towards, and always names its control as the page does', () => {
  assert.deepEqual(spriteChanges(hero, set({ height: 1 })), ['height: taller']);
  assert.deepEqual(spriteChanges(hero, set({ height: 0 })), ['height: shorter']);
  assert.deepEqual(spriteChanges(hero, set({ build: 0.9, speed: 0.1 })), ['build: stockier', 'speed: slower']);
  // joined in one phrase where that reads well
  assert.deepEqual(spriteChanges(hero, set({ head: 1 })), ['bigger head']);
  assert.deepEqual(spriteChanges(hero, set({ bounce: 0 })), ['calmer bounce']);
  // and kept apart where joining would say it twice ("bouncier bounce") or oddly ("bigger steps stride")
  assert.deepEqual(spriteChanges(hero, set({ bounce: 1 })), ['bounce: bouncier']);
  assert.deepEqual(spriteChanges(hero, set({ stride: 1 })), ['stride: bigger steps']);
  // every phrase holds the label the visitor saw on the control
  const moved = { height: 1, build: 0, head: 1, bounce: 1, stride: 0, speed: 1, plain: 0 };
  for (const [key, value] of Object.entries(moved)) assert.match(spriteChanges(hero, set({ [key]: value }))[0], new RegExp(hero.params[key].label, 'i'), key);
  // a slider with no end words still says which way it went
  assert.deepEqual(spriteChanges(hero, set({ plain: 1 })), ['more texture']);
  assert.deepEqual(spriteChanges(hero, set({ plain: 0 })), ['less texture']);
});

test('a choice is its option name, a removed part is "no ...", a colour is named', () => {
  assert.deepEqual(spriteChanges(hero, set({ weapon: 'axe' })), ['axe weapon']);
  assert.deepEqual(spriteChanges(hero, set({ weapon: 'none' })), ['no weapon']);
  assert.deepEqual(spriteChanges(hero, set({ cape: 'none' })), ['no cape']);
  assert.deepEqual(spriteChanges(hero, set({ cape: 'tattered' })), ['tattered cape']);
  assert.deepEqual(spriteChanges(hero, set({ trim: '#c9423a' })), ['red cape']);
  assert.deepEqual(spriteChanges(hero, set({ hairStyle: 'bald' })), ['no hair']);
  // a control inside a part with a general label ("Length", "Color") is named after its part
  assert.deepEqual(spriteChanges(hero, set({ weaponLength: 1.35 })), ['weapon length: longer']);
  assert.deepEqual(spriteChanges(hero, set({ hair: '#e0b040' })), ['yellow hair']);
  assert.deepEqual(spriteChanges(hero, set({ sparkle: true })), ['sparkle on']);
});

test('controls that do nothing at these settings are left out', () => {
  // with no weapon its length cannot matter
  assert.deepEqual(spriteChanges(hero, set({ weapon: 'none', weaponLength: 1.35 })), ['no weapon']);
});

test('the line shows at most three changes, then how many more', () => {
  const words = spriteChanges(hero, set({ height: 1, trim: '#c9423a', weapon: 'none', speed: 1, bounce: 1 }));
  assert.deepEqual(words, ['height: taller', 'no weapon', 'red cape', 'bounce: bouncier', 'speed: faster']);
  assert.equal(inWords(words), 'Height: taller, no weapon, red cape and 2 more');
  assert.equal(inWords(words.slice(0, 3)), 'Height: taller, no weapon, red cape');
  assert.equal(inWords(words.slice(0, 4)), 'Height: taller, no weapon, red cape and 1 more');
  assert.equal(inWords(['height: taller']), 'Height: taller');
  assert.equal(inWords(words, 2), 'Height: taller, no weapon and 3 more');
});

test('comparatives of the words sprites use on their sliders', () => {
  const pairs = {
    Tall: 'taller', Short: 'shorter', Big: 'bigger', Small: 'smaller', Slim: 'slimmer', Stocky: 'stockier', Fast: 'faster', Slow: 'slower',
    Long: 'longer', Wide: 'wider', Narrow: 'narrower', Thin: 'thinner', Thick: 'thicker', Chunky: 'chunkier', Bouncy: 'bouncier', Calm: 'calmer',
    Many: 'more', Few: 'fewer', Worn: 'more worn', New: 'newer', Low: 'lower', High: 'higher', Wild: 'wilder', Steady: 'steadier', Flat: 'flatter',
    Round: 'rounder', Heavy: 'heavier', Light: 'lighter', 'Small steps': 'smaller steps', 'Wide sweep': 'wider sweep', Swaying: 'more swaying', Upright: 'more upright',
  };
  for (const [word, want] of Object.entries(pairs)) assert.equal(comparative(word), want, word);
});

test('colours get an everyday name', () => {
  const names = {
    '#c9423a': 'red', '#e08a2c': 'orange', '#e6c545': 'yellow', '#4f9d57': 'green', '#2f8f9d': 'teal', '#3f6fd1': 'blue', '#7a4fc4': 'purple',
    '#d65a9c': 'pink', '#6b7280': 'grey', '#3a3350': 'dark', '#f0ead8': 'cream', '#ffffff': 'white', '#000000': 'black', '#5a3a22': 'brown', '#c2c9d6': 'silver',
  };
  for (const [hex, want] of Object.entries(names)) assert.equal(colourName(hex), want, hex);
  assert.equal(colourName('not a colour'), 'new');
});

// ---- sounds and music ------------------------------------------------------------------------------

const slash = {
  id: 'slash', name: 'Slash', category: 'weapon',
  params: [
    { id: 'swing', label: 'Swing time', unit: 's', min: 0.08, max: 0.35, default: 0.16, scale: 'log' },
    { id: 'air', label: 'Air brightness', unit: 'Hz', min: 1500, max: 6000, default: 3200, scale: 'log' },
    { id: 'pitch', label: 'Blade pitch', unit: 'Hz', min: 700, max: 2400, default: 1300, scale: 'log' },
    { id: 'ringlvl', label: 'Ring amount', min: 0.05, max: 0.5, default: 0.2 },
  ],
  presets: { 'Heavy blade': { swing: 0.28, pitch: 800 } },
};
const tune = {
  id: 'tune', name: 'Tune', category: 'music',
  params: [
    { id: 'intensity', label: 'Intensity', min: 0, max: 1, default: 0.9 },
    { id: 'bpm', label: 'Tempo', min: 130, max: 190, default: 160, unit: 'bpm' },
    { id: 'key', label: 'Key', min: -5, max: 6, default: 0, unit: 'semitones' },
    { id: 'inst', label: 'Melody instrument', min: 0, max: 4, default: 0, options: ['Synth lead', 'Flute', 'Chiptune', 'Bell', 'Plucked string'] },
    { id: 'bars', label: 'Length', min: 8, max: 32, default: 16, unit: 'bars', step: 8 },
    { id: 'pitch', label: 'Pitch', min: 0, max: 1, default: 0.5 },
  ],
};

test('a sound says which way each slider went, in the words that fit what it measures', () => {
  assert.deepEqual(soundChanges(slash, null, {}), []);
  assert.deepEqual(soundChanges(slash, null, { pitch: 2000 }), ['higher blade pitch']);
  assert.deepEqual(soundChanges(slash, null, { pitch: 800 }), ['lower blade pitch']);
  assert.deepEqual(soundChanges(slash, null, { swing: 0.3 }), ['longer swing time']);
  assert.deepEqual(soundChanges(slash, null, { air: 5000 }), ['air brightness: brighter']);
  assert.deepEqual(soundChanges(slash, null, { air: 1600 }), ['air brightness: duller']);
  assert.deepEqual(soundChanges(slash, null, { ringlvl: 0.4 }), ['more ring amount']);
  assert.deepEqual(soundChanges(slash, null, { ringlvl: 0.1 }), ['less ring amount']);
  // every phrase holds the label the visitor saw on the slider
  for (const d of slash.params) assert.match(soundChanges(slash, null, { [d.id]: d.max })[0], new RegExp(d.label, 'i'), d.id);
  // a named style is the starting point: only what was changed after choosing it is listed
  assert.deepEqual(soundChanges(slash, 'Heavy blade', {}), []);
  assert.deepEqual(soundChanges(slash, 'Heavy blade', { pitch: 800, swing: 0.28 }), []);
  assert.deepEqual(soundChanges(slash, 'Heavy blade', { pitch: 1500 }), ['higher blade pitch']);
});

test('music: tempo, key, length and the instrument by name', () => {
  assert.deepEqual(soundChanges(tune, null, { bars: 8, inst: 1 }), ['flute', 'length: shorter']);
  assert.equal(inWords(soundChanges(tune, null, { bars: 8, inst: 1 })), 'Flute, length: shorter');
  assert.deepEqual(soundChanges(tune, null, { bars: 32 }), ['length: longer']);
  assert.deepEqual(soundChanges(tune, null, { bpm: 180 }), ['tempo: faster']);
  assert.deepEqual(soundChanges(tune, null, { bpm: 140 }), ['tempo: slower']);
  assert.deepEqual(soundChanges(tune, null, { key: 3 }), ['higher key']);
  assert.deepEqual(soundChanges(tune, null, { pitch: 0.9 }), ['higher pitch']);
  assert.deepEqual(soundChanges(tune, null, { intensity: 0.2 }), ['less intensity']);
  assert.equal(inWords(soundChanges(tune, null, { intensity: 0.2, bpm: 180, key: 3, inst: 3, bars: 32 })), 'Less intensity, tempo: faster, higher key and 2 more');
});
