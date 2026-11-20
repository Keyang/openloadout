// Studio item S8 (docs/studio.md section 6; Contract 14 rule 9): a studio sprite travels in the bag's link as the
// entry { d: definition }. A typical definition is over LINK_LIMIT as plain base64, so a link that holds one is
// deflated ('#/bag?load=z.<base64url of raw deflate>'): toLinkAsync with the browser's CompressionStream, toLink with
// the plain-JS writer. Whatever arrives is checked again (validateDataSprite) before it goes in.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createBag, memoryStorage, LINK_LIMIT, loadStudioCheck } from '../../app/bag.js';
import { validateDataSprite } from '../../engine/data-sprite.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

const beast = (over = {}) => ({ ...studioTemplate('four-legs'), id: 'moss-beast', name: 'Moss beast', ...over });
const item = (data, over = {}) => ({ kind: 'sprite', id: data.id, settings: {}, definition: { data }, ...over });
const b64 = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const payload = (link) => new URLSearchParams(link.slice(link.indexOf('?') + 1)).get('load');
const unpack = (link) => JSON.parse(zlib.inflateRawSync(Buffer.from(payload(link).slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString('utf8'));

test('bag link: a definition is over LINK_LIMIT as plain base64, and under it deflated', async () => {
  const plain = b64(Buffer.from(JSON.stringify({ v: 1, i: [['s', 'moss-beast', {}, { d: beast() }]] })));
  assert.ok(plain.length > LINK_LIMIT, `plain: ${plain.length}`);
  const bag = createBag(memoryStorage());
  await loadStudioCheck();
  bag.add(item(beast()));
  const link = await bag.toLinkAsync();
  assert.match(link, /^#\/bag\?load=z\.[A-Za-z0-9_-]+$/);
  assert.ok(link.length < LINK_LIMIT / 2, `deflated: ${link.length}`);
  const sync = bag.toLink();
  assert.match(sync, /^#\/bag\?load=z\.[A-Za-z0-9_-]+$/);
  assert.ok(sync.length < LINK_LIMIT, `deflated by the plain-JS writer: ${sync.length}`);
  // inside: the studio entry is { d }
  const data = unpack(link);
  assert.equal(data.i[0][0], 's');
  assert.equal(data.i[0][1], 'moss-beast');
  assert.deepEqual(data.i[0][3], { d: bag.items()[0].definition.data });
  assert.deepEqual(unpack(sync), data);
});

test('bag link: a bag without a studio sprite makes the same link as before (not deflated)', async () => {
  const bag = createBag(memoryStorage());
  bag.add({ kind: 'sprite', id: 'knight', settings: { params: { armor: 0.5 } } });
  const link = bag.toLink();
  assert.doesNotMatch(link, /load=z\./);
  assert.equal(await bag.toLinkAsync(), link);
});

test('bag link: round trip, by the async and the plain way, into a new bag on another computer', async () => {
  await loadStudioCheck();
  const from = createBag(memoryStorage());
  from.add({ kind: 'sound', id: 'coin-pickup', settings: { params: { pitch: 900 }, style: 'Gem', seed: 1 } });
  from.add(item(beast(), { draft: 'moss-beast', settings: { params: { fur: '#446644' }, scale: 2 } }));
  for (const link of [await from.toLinkAsync(), from.toLink(), `https://example.test/index.html${await from.toLinkAsync()}`]) {
    const to = createBag(memoryStorage());
    assert.deepEqual(to.peekLink(link), { count: 2, made: 1, studio: 1 });
    assert.equal(to.fromLink(link), 2);
    const [s, d] = to.items();
    assert.equal(s.id, 'coin-pickup');
    assert.equal(d.id, 'moss-beast');
    assert.deepEqual(d.definition, from.items()[1].definition);
    assert.deepEqual(d.settings.params, { fur: '#446644' });
    assert.equal(d.settings.scale, 2);
    assert.equal(d.from, 'link');
    assert.equal('draft' in d, false, 'a link carries no draft: the opened item follows nothing');
    const to2 = createBag(memoryStorage());
    assert.equal(await to2.fromLinkAsync(link, { mode: 'add' }), 2);
    assert.deepEqual(to2.items().map((i) => i.id), ['coin-pickup', 'moss-beast']);
    assert.deepEqual(await to2.peekLinkAsync(link), { count: 2, made: 1, studio: 1 });
  }
});

test('bag link: a link is checked again on the way in: a definition that does not pass is left out', async () => {
  await loadStudioCheck();
  const broken = beast();
  broken.body.rig.shapes[0].bone = 'nope';
  const data = { v: 1, i: [['s', 'knight', {}], ['s', 'moss-beast', {}, { d: broken }], ['s', 'goo', {}, { d: { ...beast({ id: 'goo' }), extra: 'dropped' } }]] };
  const link = '#/bag?load=z.' + b64(zlib.deflateRawSync(Buffer.from(JSON.stringify(data))));
  const bag = createBag(memoryStorage());
  assert.equal(await bag.fromLinkAsync(link), 2);
  assert.deepEqual(bag.items().map((i) => i.id), ['knight', 'goo']);
  assert.equal('extra' in bag.items()[1].definition.data, false);
  assert.deepEqual(bag.items()[1].definition.data, validateDataSprite(beast({ id: 'goo' })).value);
  // the studio item with a broken definition never turns into a catalogue item of that id
  assert.equal(bag.items().some((i) => i.id === 'moss-beast'), false);
});

test('bag link: damaged and oversized deflated links are not bag links, and change nothing', async () => {
  const bag = createBag(memoryStorage());
  bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  for (const bad of ['#/bag?load=z.', '#/bag?load=z.AAAA', '#/bag?load=z.!!', 'z.' + b64(Buffer.from('not deflate at all')),
    '#/bag?load=z.' + b64(zlib.deflateRawSync(Buffer.from('not json'))),
    '#/bag?load=z.' + b64(zlib.deflateRawSync(Buffer.alloc(8_000_000, 32)))]) {
    assert.equal(bag.peekLink(bad), null, bad.slice(0, 40));
    assert.equal(bag.fromLink(bad), null);
    assert.equal(await bag.fromLinkAsync(bad), null);
  }
  assert.deepEqual(bag.items().map((i) => i.id), ['knight']);
  // a bare value works as before
  const other = createBag(memoryStorage());
  other.add(item(beast()));
  const value = payload(other.toLink());
  assert.equal(bag.peekLink(value).count, 1);
});
