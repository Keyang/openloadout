// Studio item S8, review round 3 (issue 2): a deflated link ('z.') can hold far more than its length suggests. A short
// link of 150,000 copies of one library item filled the bag (17.7 MB of storage) and froze the bag page. So:
//  - a link carries at most MAX_LINK_ITEMS items, deflated or not; one with more is not a bag link (peekLink, fromLink and
//    the async forms give null and the bag is unchanged), and the bag says no link can be made for a bag that big;
//  - a 'z.' link is made only for a bag that holds a studio sprite, so one that holds none is not opened;
//  - what a deflated link inflates to is capped at LINK_INFLATE bytes (room for MAX_LINK_STUDIO studio sprites at most).
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createBag, memoryStorage, MAX_LINK_ITEMS, MAX_LINK_STUDIO, LINK_INFLATE, STUDIO_JSON_BYTES, linkProblem, loadStudioCheck } from '../../app/bag.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

const b64 = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deflated = (data) => `#/bag?load=z.${b64(zlib.deflateRawSync(Buffer.from(JSON.stringify(data)), { level: 9 }))}`;
const plain = (data) => `#/bag?load=${b64(Buffer.from(JSON.stringify(data)))}`;
const beast = (id) => ({ ...studioTemplate('four-legs'), id, name: `Beast ${id}` });
const knights = (n) => Array.from({ length: n }, () => ['s', 'knight', {}]);

test('bomb: a short deflated link of 150,000 items is not opened, and the bag is unchanged', async () => {
  await loadStudioCheck();
  const link = deflated({ v: 1, i: [...knights(150_000), ['s', 'bomb-beast', {}, { d: beast('bomb-beast') }]] });
  assert.ok(link.length < 20_000, `short: ${link.length}`);
  const bag = createBag(memoryStorage());
  bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  assert.equal(bag.peekLink(link), null);
  assert.equal(await bag.peekLinkAsync(link), null);
  assert.equal(bag.fromLink(link), null);
  assert.equal(await bag.fromLinkAsync(link, { mode: 'add' }), null);
  assert.equal(bag.count(), 1, 'unchanged');
});

test(`bomb: a link carries at most ${MAX_LINK_ITEMS} items, plain or deflated`, async () => {
  assert.ok(MAX_LINK_ITEMS >= 400 && MAX_LINK_ITEMS <= 2000, `${MAX_LINK_ITEMS}: more than the library holds, few enough to draw`);
  const bag = createBag(memoryStorage());
  assert.equal(bag.peekLink(plain({ v: 1, i: knights(MAX_LINK_ITEMS) }))?.count, MAX_LINK_ITEMS, 'at the cap: opened');
  assert.equal(bag.peekLink(plain({ v: 1, i: knights(MAX_LINK_ITEMS + 1) })), null, 'one over: not opened');
  const studio = ['s', 'cap-beast', {}, { d: beast('cap-beast') }];
  assert.equal((await bag.peekLinkAsync(deflated({ v: 1, i: [...knights(MAX_LINK_ITEMS - 1), studio] })))?.count, MAX_LINK_ITEMS);
  assert.equal(await bag.peekLinkAsync(deflated({ v: 1, i: [...knights(MAX_LINK_ITEMS), studio] })), null);
  assert.equal(bag.fromLink(plain({ v: 1, i: knights(MAX_LINK_ITEMS + 1) })), null);
  assert.equal(bag.count(), 0);
});

test('bomb: a deflated link that holds no studio sprite is not opened (the site makes one only for a studio sprite)', () => {
  const bag = createBag(memoryStorage());
  const data = { v: 1, i: knights(3) };
  assert.equal(bag.peekLink(plain(data))?.count, 3, 'the same items, plain: opened');
  assert.equal(bag.peekLink(deflated(data)), null);
  assert.equal(bag.fromLink(deflated(data)), null);
  assert.equal(bag.count(), 0);
});

test('bomb: what a deflated link inflates to is capped (room for the studio sprites a link may carry, and their settings)', () => {
  assert.ok(LINK_INFLATE >= MAX_LINK_STUDIO * STUDIO_JSON_BYTES, 'room for the most studio sprites a link carries');
  assert.ok(LINK_INFLATE <= 4 * 1024 * 1024);
  const pad = 'x'.repeat(LINK_INFLATE);
  const bag = createBag(memoryStorage());
  const link = deflated({ v: 1, i: [['s', 'pad-beast', { params: { pad } }, { d: beast('pad-beast') }]] });
  assert.ok(link.length < 10_000);
  assert.equal(bag.peekLink(link), null);
});

test(`bomb: a bag of more than ${MAX_LINK_ITEMS} items makes no link the site hands out (linkProblem says why)`, () => {
  const bag = createBag(memoryStorage());
  for (let i = 0; i <= MAX_LINK_ITEMS; i++) bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  const words = linkProblem(bag, bag.toLink());
  assert.match(words, new RegExp(`${(MAX_LINK_ITEMS + 1).toLocaleString('en')} things`));
  assert.match(words, new RegExp(`at most ${MAX_LINK_ITEMS.toLocaleString('en')}`));
  assert.match(words, /Download/);
  bag.remove(bag.items()[0].key);
  assert.equal(linkProblem(bag, 100), null, 'at the cap and short: fine');
});
