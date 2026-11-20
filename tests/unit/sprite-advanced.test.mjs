// Advanced editing on a sprite's page, the parts that are plain data (build item B18; app/sprite-advanced-model.js):
// which sprites get it (library data sprites only), the visitor's sliders as the copy's defaults, which draft is the
// copy to go on with, and the page's address while it is open.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ADVANCED, libraryDataRow, withSliderDefaults, findCopy, studioAddressParts, advancedAddress, simpleAddress, isAdvancedQuery,
} from '../../app/sprite-advanced-model.js';

const coin = JSON.parse(fs.readFileSync(new URL('../../sprites/coin.json', import.meta.url), 'utf8'));

test('only a library data sprite (a catalogue row whose file is sprites/<id>.json) gets Advanced', () => {
  assert.equal(ADVANCED, 'advanced');
  assert.equal(libraryDataRow({ id: 'coin', kind: 'sprite', src: 'sprites/coin.json' }), true);
  assert.equal(libraryDataRow({ id: 'knight', kind: 'sprite', src: 'sprites/knight.js' }), false, 'a sprite that is still code');
  assert.equal(libraryDataRow({ id: 'newt', kind: 'sprite', src: 'sprites/newt.json', studio: true }), false, 'a studio sprite in the bag');
  assert.equal(libraryDataRow({ id: 'zap', kind: 'sprite', src: 'sprites/zap.json', madeIn: 'visit' }), false, 'made on a visit');
  assert.equal(libraryDataRow({ id: 'blip', kind: 'sound', src: 'sounds/blip.json' }), false);
  assert.equal(libraryDataRow(null), false);
  assert.equal(libraryDataRow({ id: 'coin', kind: 'sprite' }), false);
});

test('the visitor\'s sliders become the copy\'s defaults: sliders, choices, on/offs and colours', () => {
  const { def, moved } = withSliderDefaults(coin, { size: 1, shape: 'square', rim: false, metal: '#112233', speed: 2, nothing: 3, thickness: 0.4 });
  const ctl = (k) => def.controls.find((c) => c.key === k);
  assert.equal(ctl('size').default, 1);
  assert.equal(ctl('shape').default, 'square');
  assert.equal(ctl('rim').default, false);
  assert.equal(def.palette.find((s) => s.id === 'metal').default, '#112233');
  assert.deepEqual(moved.sort(), ['metal', 'rim', 'shape', 'size'], 'unchanged values, speed and unknown keys are left alone');
  assert.equal(ctl('speed').default, undefined, 'the standard speed control has no default of its own');
  // the library's definition is not touched
  assert.equal(coin.controls.find((c) => c.key === 'size').default, 0.5);
  assert.notEqual(def, coin);
});

test('a value that does not fit its control is left out; a check that refuses one leaves just that one out', () => {
  const r = withSliderDefaults(coin, { size: 'big', shape: 'hexagon', rim: 'yes', metal: 'gold', bob: 7 });
  assert.deepEqual(r.moved, [], 'wrong types, unknown options, out of range');
  const refuseBob = (d) => ({ ok: d.controls.find((c) => c.key === 'bob').default !== 0.9 });
  const s = withSliderDefaults(coin, { bob: 0.9, size: 0.8 }, { check: refuseBob });
  assert.deepEqual(s.moved, ['size']);
  assert.equal(s.def.controls.find((c) => c.key === 'bob').default, 0.5);
  assert.equal(s.def.controls.find((c) => c.key === 'size').default, 0.8);
});

test('the copy to go on with: the one the address names, else the newest copy of that sprite, else none', () => {
  const v2 = (from) => ({ format: 'loadout-sprite', version: 2, made: { in: 'studio', from } });
  const list = [
    { id: 'coin-copy-2', savedAt: 30, definition: v2('library:coin') },
    { id: 'my-gem', savedAt: 20, definition: v2('template:v2-pictures') },
    { id: 'coin-copy', savedAt: 10, definition: v2('library:coin') },
    { id: 'crate-copy', savedAt: 5, definition: v2('library:crate') },
  ];
  assert.equal(findCopy(list, 'coin', 'coin-copy'), 'coin-copy');
  assert.equal(findCopy(list, 'coin'), 'coin-copy-2', 'newest first');
  assert.equal(findCopy(list, 'coin', 'crate-copy'), 'coin-copy-2', 'a copy of another sprite is not taken');
  assert.equal(findCopy(list, 'coin', 'gone'), 'coin-copy-2');
  assert.equal(findCopy(list, 'barrel'), null);
  assert.equal(findCopy([], 'coin'), null);
  assert.equal(findCopy(list, 'coin', '__proto__'), 'coin-copy-2', 'a hostile address word is not a draft');
  assert.equal(findCopy(list, 'coin', 'constructor'), 'coin-copy-2');
});

test('a version 1 draft is never the copy, even one made from the library sprite (the old studio\'s Hero start names library:knight)', () => {
  const hero = { id: 'hero', savedAt: 50, definition: { version: 1, name: 'Hero', made: { in: 'studio', from: 'library:knight' }, body: { rig: {} } } };
  const noFormat = { id: 'odd', savedAt: 40, definition: { version: 2, made: { in: 'studio', from: 'library:knight' } } };
  const copy = { id: 'knight-copy', savedAt: 10, definition: { format: 'loadout-sprite', version: 2, made: { in: 'studio', from: 'library:knight' } } };
  assert.equal(findCopy([hero], 'knight'), null, 'the version 1 Hero is not a copy: a new copy is made');
  assert.equal(findCopy([hero], 'knight', 'hero'), null, 'not even when the address names it');
  assert.equal(findCopy([noFormat], 'knight', 'odd'), null, 'a version 2 draft must say it is a sprite ("format": "loadout-sprite")');
  assert.equal(findCopy([hero, noFormat, copy], 'knight', 'hero'), 'knight-copy', 'the version 2 copy is taken instead');
});

test('the address: the editor\'s studio address becomes the sprite page\'s, which names the copy; leaving forgets it', () => {
  assert.deepEqual(studioAddressParts('#/studio/coin-copy?mode=clips&clip=spin&frame=3'), { draft: 'coin-copy', mode: 'clips', clip: 'spin' });
  assert.deepEqual(studioAddressParts('#/studio/my%2Dgem?mode=body'), { draft: 'my-gem', mode: 'body', clip: null });
  assert.equal(studioAddressParts('#/sprite/coin?size=1'), null);
  assert.equal(studioAddressParts('#/studio'), null);
  const a = advancedAddress('#/sprite/coin?size=1&bag=i3', { id: 'coin', copy: 'coin-copy', pane: 'clips', clip: 'spin' });
  const q = new URLSearchParams(a.split('?')[1]);
  assert.ok(a.startsWith('#/sprite/coin?'));
  assert.equal(q.get('size'), '1');
  assert.equal(q.get('bag'), 'i3', 'the page\'s own settings and its bag item stay');
  assert.equal(q.get('edit'), 'advanced');
  assert.equal(q.get('copy'), 'coin-copy');
  assert.equal(q.get('pane'), 'clips');
  assert.equal(q.get('aclip'), 'spin', 'the editor\'s clip has a key of its own');
  assert.equal(q.get('clip'), null, 'the page\'s own clip key is not the editor\'s');
  assert.ok(isAdvancedQuery(Object.fromEntries(q)));
  // from another page's address (the studio's), the sprite's path is used
  assert.ok(advancedAddress('#/studio/coin-copy?mode=body', { id: 'coin', copy: 'coin-copy' }).startsWith('#/sprite/coin?'));
  const back = simpleAddress(a);
  assert.equal(back, '#/sprite/coin?size=1&bag=i3', 'leaving drops edit, copy, pane and the editor\'s clip');
  // the page's own clip stays as the page had it, whatever clip the editor shows
  const both = advancedAddress('#/sprite/coin?clip=collect', { id: 'coin', copy: 'coin-copy', pane: 'body', clip: 'spin' });
  assert.equal(new URLSearchParams(both.split('?')[1]).get('clip'), 'collect');
  assert.equal(simpleAddress(both), '#/sprite/coin?clip=collect');
  assert.equal(simpleAddress('#/sprite/coin?clip=collect&edit=advanced&aclip=spin&pane=clips'), '#/sprite/coin?clip=collect');
  assert.equal(simpleAddress('#/sprite/coin?edit=advanced&copy=coin-copy'), '#/sprite/coin');
  assert.equal(isAdvancedQuery({ edit: 'advanced' }), true);
  assert.equal(isAdvancedQuery({ size: '1' }), false);
});
