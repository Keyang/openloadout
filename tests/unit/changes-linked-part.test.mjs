// A general colour control (its label is "Color") that a part cannot list but whose `when` names a part's choice
// is read as being about that part: the Hero's hair colour says "red hair", as the code sprite did (app/changes.js, item HL).
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, range, choice, color, toggle, defaultParams } from '../../engine/sprite.js';
import { spriteChanges } from '../../app/changes.js';
import { librarySprite } from '../helpers/library.mjs';

const RED = '#c9423a';

test('the Hero\'s hair colour (a general colour with a `when` on the hair style) reads "red hair"', async () => {
  const knight = await librarySprite('knight');
  assert.equal(knight.params.hair.label, 'Color', 'the premise: a general label');
  assert.ok(knight.params.hair.when && 'hairStyle' in (Array.isArray(knight.params.hair.when) ? knight.params.hair.when[0] : knight.params.hair.when), 'the premise: its when names the hair style');
  assert.ok(!knight.parts.hair.params.includes('hair'), 'the premise: the hair part does not list it');
  assert.deepEqual(spriteChanges(knight, { ...defaultParams(knight), hair: RED }), ['red hair']);
  // with no hair the colour does nothing and is not mentioned
  assert.deepEqual(spriteChanges(knight, { ...defaultParams(knight), hair: RED, hairStyle: 'bald' }), ['no hair']);
  // a colour with its own name keeps it
  assert.deepEqual(spriteChanges(knight, { ...defaultParams(knight), outfit: RED }), ['red outfit']);
});

const make = (extra = {}, parts = {}) => defineSprite({
  id: 'test-link', name: 'Test link', size: [8, 8], pivot: [4, 8],
  params: {
    hairStyle: choice('Hair', 'short', ['short', 'bald']),
    hat: choice('Hat', 'cap', ['cap', 'none']),
    mood: choice('Mood', 'calm', ['calm', 'angry']),
    ...extra,
  },
  parts: { hair: { label: 'Hair', params: ['hairStyle'], none: 'bald' }, hat: { label: 'Hat', params: ['hat'], none: 'none' }, ...parts },
  clips: { idle: { frames: 1, fps: 1 } },
  render() {},
});
const chg = (s, over) => spriteChanges(s, { ...defaultParams(s), ...over });

test('a general colour with no link to a part keeps "colour"', () => {
  const s = make({ tint: color('Color', '#5a3a22', ['#5a3a22', RED]) });
  assert.deepEqual(chg(s, { tint: RED }), ['red colour']);
});

test('a general colour whose `when` names no part\'s control keeps "colour"', () => {
  const s = make({ tint: color('Color', '#5a3a22', ['#5a3a22', RED], { when: { mood: ['angry'] } }) });
  assert.deepEqual(chg(s, { tint: RED, mood: 'angry' }), ['angry mood', 'red colour']);
});

test('a `when` that names two different parts does not pick one: it keeps "colour"', () => {
  const s = make({ tint: color('Color', '#5a3a22', ['#5a3a22', RED], { when: [{ hairStyle: ['short'] }, { hat: ['cap'] }] }) });
  assert.deepEqual(chg(s, { tint: RED }), ['red colour']);
});

test('a `when` on one part\'s selector, in either written form, names that part', () => {
  const one = make({ tint: color('Color', '#5a3a22', ['#5a3a22', RED], { when: { hat: ['cap'] } }) });
  assert.deepEqual(chg(one, { tint: RED }), ['red hat']);
  const list = make({ tint: color('Color', '#5a3a22', ['#5a3a22', RED], { when: [{ hairStyle: ['short'] }, { hairStyle: ['bald'] }] }) });
  assert.deepEqual(chg(list, { tint: RED }), ['red hair']);
});

test('a `when` on another control of a part (not its selector) names that part too', () => {
  const s = make({ size: range('Size', 1.3, { min: 0.5, max: 1.5, lo: 'Small', hi: 'Big' }), tint: color('Color', '#5a3a22', ['#5a3a22', RED], { when: { size: [{ atLeast: 1.2 }] } }) },
    { hat: { label: 'Hat', params: ['hat', 'size'], none: 'none' } });
  assert.deepEqual(chg(s, { tint: RED }), ['red hat']);
});

test('a colour with its own specific label is not renamed by its `when`', () => {
  const s = make({ tint: color('Ribbon', '#5a3a22', ['#5a3a22', RED], { when: { hat: ['cap'] } }) });
  assert.deepEqual(chg(s, { tint: RED }), ['red ribbon']);
});

test('a general slider linked to a part by its `when` is named after it, apart from the word', () => {
  const s = make({ reach: range('Length', 0.5, { lo: 'Short', hi: 'Long', when: { hairStyle: ['short'] } }) });
  assert.deepEqual(chg(s, { reach: 1 }), ['hair length: longer']);
});

test('a general toggle linked to a part reads as that part', () => {
  const s = make({ shine: toggle('Color', false, { when: { hat: ['cap'] } }) });
  assert.deepEqual(chg(s, { shine: true }), ['hat on']);
});
