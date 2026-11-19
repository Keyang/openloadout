// The record of a look (docs/architecture.md, Contract 7, "The record"): a bag keeps the settings its look actually
// drew each sprite with, so the bag keeps drawing (and downloading) the same pictures even when the rule behind
// "Also change shapes" changes later. Which sprites are used is found in the catalogue, never named here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage, BAG_KEY } from '../../app/bag.js';
import { defaultParams, cleanParams, renderFrame } from '../../engine/sprite.js';
import { themedParams, spriteLook, renderThemedFrame, shapeRecord, normalizeTheme, randomTheme, defaultTheme, THEME_PRESETS } from '../../engine/theme.js';
import { loadSprites } from '../../tools/lib/assets.mjs';

const sprites = (await loadSprites()).map((s) => s.def);
const SHAPED = normalizeTheme(randomTheme(7, { shapes: true }));
const OTHER_SEED = normalizeTheme(randomTheme(11, { shapes: true }));
const COLOUR_ONLY = normalizeTheme(THEME_PRESETS.find((p) => p.theme.colour.palette).theme);

/** What the look changed, worked out here the long way: { control: value } for each control whose value moved. */
const changedBy = (s, own, theme) => {
  const base = cleanParams(s, own);
  const p = themedParams(s, base, theme);
  return Object.fromEntries(Object.keys(s.params).filter((k) => p[k] !== base[k]).map((k) => [k, p[k]]));
};
const spriteOf = (id) => sprites.find((s) => s.id === id) ?? null;
const item = (s, params = {}) => ({ kind: 'sprite', id: s.id, settings: { params, cues: {}, scale: 1 } });

/** The same sprite under a later rule: "Also change shapes" now draws other values for it (its seed differs), as a changed rule would. */
const laterRule = (s) => ({ ...s, id: `${s.id}-later` });

// sprites whose shapes the look changes under both seeds, and differently under the later rule (found in the catalogue)
const moved = sprites.filter((s) => Object.keys(changedBy(s, {}, SHAPED)).length && Object.keys(changedBy(s, {}, OTHER_SEED)).length
  && JSON.stringify(changedBy(s, {}, SHAPED)) !== JSON.stringify(changedBy(laterRule(s), {}, SHAPED)));

test('there are sprites in the catalogue whose shapes a look changes (the tests below use them)', () => {
  assert.ok(moved.length >= 2, `found ${moved.length}`);
});

test('shapeRecord: the controls a look changed and the values it gave them; nothing without shapes', () => {
  for (const s of moved) {
    assert.deepEqual(shapeRecord(s, {}, SHAPED), changedBy(s, {}, SHAPED), s.id);
    assert.deepEqual(shapeRecord(s, {}, COLOUR_ONLY), {}, s.id);
    assert.deepEqual(shapeRecord(s, {}, defaultTheme()), {}, s.id);
    // the record on top of the sprite's own settings is exactly what the look draws with
    assert.deepEqual({ ...defaultParams(s), ...shapeRecord(s, {}, SHAPED) }, themedParams(s, defaultParams(s), SHAPED), s.id);
  }
});

test('spriteLook and renderThemedFrame draw from a record when they are given one, not from the rule', () => {
  for (const s of moved.slice(0, 6)) {
    const record = shapeRecord(s, {}, SHAPED);
    const later = laterRule(s);
    // under the later rule, the look itself would no longer change these controls
    assert.notDeepEqual(spriteLook(later, {}, SHAPED).params, spriteLook(s, {}, SHAPED).params, s.id);
    const used = spriteLook(later, {}, SHAPED, { record });
    assert.deepEqual(used.params, { ...defaultParams(s), ...record }, s.id);
    // with the sprite as it was, the record gives back the very picture the look drew
    const clip = s.preview, f = Math.floor(s.clips[clip].frames / 2);
    assert.deepEqual(renderThemedFrame(s, clip, f, {}, SHAPED, { record }).data, renderThemedFrame(s, clip, f, {}, SHAPED).data, s.id);
    assert.deepEqual(spriteLook(s, {}, SHAPED, { record }).changed, Object.keys(record), s.id);
    // a look without shapes ignores a record
    assert.deepEqual(spriteLook(s, {}, COLOUR_ONLY, { record }).params, defaultParams(s), s.id);
  }
});

test('the bag records what its look made of each sprite when the sprite is added', () => {
  const bag = createBag(memoryStorage(), { spriteOf });
  bag.setTheme(SHAPED);
  for (const s of moved) bag.add(item(s));
  for (const it of bag.items()) assert.deepEqual(it.settings.lookParams, changedBy(spriteOf(it.id), {}, SHAPED), it.id);
});

test('the bag records them when its look starts changing shapes, and again only when the shapes part of the look changes', () => {
  const bag = createBag(memoryStorage(), { spriteOf });
  for (const s of moved) bag.add(item(s));
  for (const it of bag.items()) assert.equal(it.settings.lookParams, undefined, `${it.id}: no record while the look leaves shapes alone`);
  bag.setTheme(SHAPED);
  const first = bag.items().map((it) => it.settings.lookParams);
  first.forEach((r, i) => assert.deepEqual(r, changedBy(moved[i], {}, SHAPED), moved[i].id));
  // a colour change keeps the shapes part: the records stay as they were, even if the rule now says otherwise
  const raw = JSON.parse(JSON.stringify(first));
  bag.setTheme({ ...SHAPED, colour: { ...SHAPED.colour, hue: 30 } });
  assert.deepEqual(bag.items().map((it) => it.settings.lookParams), raw);
  // another number behind "Surprise me": made again
  bag.setTheme({ ...SHAPED, seed: OTHER_SEED.seed });
  bag.items().forEach((it, i) => assert.deepEqual(it.settings.lookParams, changedBy(moved[i], {}, { ...SHAPED, seed: OTHER_SEED.seed }), it.id));
  // shapes off: no records
  bag.setTheme({ ...SHAPED, shapes: false });
  for (const it of bag.items()) assert.equal(it.settings.lookParams, undefined, it.id);
});

test('a record outlives a change of rule: a bag kept in storage draws what it drew, not what the rule now says', () => {
  const storage = memoryStorage();
  const bag = createBag(storage, { spriteOf });
  bag.setTheme(SHAPED);
  const s = moved[0];
  bag.add(item(s));
  const record = bag.items()[0].settings.lookParams;
  assert.ok(record && Object.keys(record).length, 'recorded');
  // the next visit runs a later rule
  const later = laterRule(s);
  const again = createBag(storage, { spriteOf: (id) => (id === s.id ? later : null) });
  const kept = again.items()[0];
  assert.deepEqual(kept.settings.lookParams, record, 'the stored record is not worked out again');
  const used = spriteLook(later, kept.settings.params, again.theme(), { record: kept.settings.lookParams });
  assert.deepEqual(used.params, { ...defaultParams(s), ...record });
  assert.notDeepEqual(spriteLook(later, kept.settings.params, again.theme()).params, used.params, 'without the record the later rule would draw something else');
});

test('changing an item\'s own settings records it again; changing only its sounds or size keeps the record', () => {
  const bag = createBag(memoryStorage(), { spriteOf });
  bag.setTheme(SHAPED);
  const s = moved.find((x) => Object.values(x.params).some((d) => d.kind === 'range'));
  const key = bag.add(item(s));
  const before = bag.get(key).settings.lookParams;
  bag.update(key, { ...bag.get(key).settings, scale: 2 });
  assert.deepEqual(bag.get(key).settings.lookParams, before);
  const k = Object.keys(s.params).find((x) => s.params[x].kind === 'range');
  const d = s.params[k];
  const own = { [k]: d.def === d.min ? d.max : d.min };
  bag.update(key, { ...bag.get(key).settings, params: own });
  assert.deepEqual(bag.get(key).settings.lookParams, changedBy(s, own, SHAPED));
});

test('a bag link carries the records; adding a link made under another look leaves its records behind', () => {
  const bag = createBag(memoryStorage(), { spriteOf });
  bag.setTheme(SHAPED);
  for (const s of moved.slice(0, 3)) bag.add(item(s));
  const records = bag.items().map((it) => it.settings.lookParams);
  const link = bag.toLink();
  // opened where the rule is a later one: the records in the link are used, not worked out again
  const there = createBag(memoryStorage(), { spriteOf: (id) => laterRule(spriteOf(id)) });
  there.fromLink(link);
  assert.deepEqual(there.items().map((it) => it.settings.lookParams), records);
  // added to a bag whose own look is another one: the link's records do not fit that look
  const mine = createBag(memoryStorage(), { spriteOf });
  mine.setTheme(OTHER_SEED);
  mine.fromLink(link, { mode: 'add' });
  mine.items().forEach((it, i) => assert.deepEqual(it.settings.lookParams, changedBy(moved[i], {}, OTHER_SEED), it.id));
});

test('a sprite whose program is not loaded yet is recorded later, by fillLooks, without telling the page to draw again', () => {
  const loaded = new Set();
  const bag = createBag(memoryStorage(), { spriteOf: (id) => (loaded.has(id) ? spriteOf(id) : null) });
  bag.setTheme(SHAPED);
  const s = moved[0];
  bag.add(item(s));
  assert.equal(bag.items()[0].settings.lookParams, undefined, 'not known yet');
  let told = 0;
  bag.onChange(() => told++);
  loaded.add(s.id);
  assert.equal(bag.fillLooks(), 1);
  assert.deepEqual(bag.items()[0].settings.lookParams, changedBy(s, {}, SHAPED));
  assert.equal(told, 0);
  assert.equal(bag.fillLooks(), 0, 'nothing left to record');
});

test('a record is plain data, checked when it comes in: anything else is dropped', () => {
  const bag = createBag(memoryStorage(), { spriteOf: () => null });
  bag.setTheme(SHAPED);
  const s = moved[0];
  bag.add({ kind: 'sprite', id: s.id, settings: { params: {}, lookParams: { a: 1, b: 'x', c: true } } });
  assert.deepEqual(bag.items()[0].settings.lookParams, { a: 1, b: 'x', c: true });
  for (const bad of [{ a: { nested: 1 } }, [1, 2], 'text', { a: Infinity }]) {
    bag.add({ kind: 'sprite', id: s.id, settings: { params: {}, lookParams: bad } });
    assert.equal(bag.items().at(-1).settings.lookParams, undefined, JSON.stringify(bad));
  }
  // a sound has no shapes record
  bag.add({ kind: 'sound', id: 'x-sound', settings: { params: {}, lookParams: { a: 1 } } });
  assert.equal(bag.items().at(-1).settings.lookParams, undefined);
  // a bag without shapes in its look keeps no record, also from storage
  const storage = memoryStorage();
  storage.setItem(BAG_KEY, JSON.stringify({ items: [{ key: 'i1', kind: 'sprite', id: s.id, settings: { params: {}, lookParams: { a: 1 } } }], theme: COLOUR_ONLY, next: 2 }));
  assert.equal(createBag(storage).items()[0].settings.lookParams, undefined);
});

test('a record of a sprite drawn with it is still the sprite drawn plainly with the same values', () => {
  for (const s of moved.slice(0, 4)) {
    const record = shapeRecord(s, {}, SHAPED);
    const clip = s.preview;
    assert.deepEqual(renderFrame(s, clip, 0, { ...defaultParams(s), ...record }).data, renderFrame(s, clip, 0, spriteLook(s, {}, SHAPED).params).data, s.id);
  }
});
