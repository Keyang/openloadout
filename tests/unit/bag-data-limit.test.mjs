// Studio item S8 (docs/studio.md section 8, row S8: "over-limit message"; review round 2, issues 3 and 8): a bag of
// studio sprites can still make a link over LINK_LIMIT (about three deflated creatures), and identical copies deflate to
// almost nothing, so a link could carry hundreds. linkProblem(bag, link) says, in plain words that fit what the bag holds
// (a studio sprite travels with its definition, which is data; something made with a helper travels with its source), why
// no link was made; and a deflated link carries at most MAX_LINK_STUDIO studio sprites: one with more is not opened
// (a bag with more writes its link plainly, so every link the site makes opens).
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createBag, memoryStorage, LINK_LIMIT, MAX_LINK_STUDIO, linkProblem, loadStudioCheck } from '../../app/bag.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

const beast = (id, from = 'four-legs') => ({ ...studioTemplate(from), id, name: `Beast ${id}` });
const item = (data) => ({ kind: 'sprite', id: data.id, settings: {}, definition: { data } });
const SOURCE = "import { defineSprite } from '../engine/sprite.js';\nexport default defineSprite({ id: 'gem' });\n";
const b64 = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deflatedLink = (data) => `#/bag?load=z.${b64(zlib.deflateRawSync(Buffer.from(JSON.stringify(data))))}`;

test('link limit: a few different studio sprites are over LINK_LIMIT, and the message speaks of studio sprites and their definitions', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  const kinds = ['four-legs', 'two-legs', 'topdown-beast', 'crawler', 'topdown-person', 'flyer'];
  for (let i = 0; i < kinds.length; i++) bag.add(item(beast(`beast-${i}`, kinds[i])));
  const link = await bag.toLinkAsync();
  assert.ok(link.length > LINK_LIMIT, `six different creatures: ${link.length}`);
  const words = linkProblem(bag, link);
  assert.equal(typeof words, 'string');
  assert.match(words, /too long for a link/);
  assert.match(words, /6 sprites made in the studio/);
  assert.match(words, /definition/);
  assert.doesNotMatch(words, /source/, 'a studio sprite has no source: it is data');
  assert.match(words, new RegExp(link.length.toLocaleString('en')));
  assert.match(words, new RegExp(LINK_LIMIT.toLocaleString('en')));
  assert.match(words, /Download/);
  // one creature fits: no problem
  const one = createBag(memoryStorage());
  one.add(item(beast('lone-beast')));
  assert.equal(linkProblem(one, await one.toLinkAsync()), null);
});

test('link limit: the words fit a bag that also holds something made with a helper, and one with only those', async () => {
  const bag = createBag(memoryStorage());
  bag.add(item(beast('one-beast')));
  bag.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { source: SOURCE } });
  const long = '#/bag?load=' + 'x'.repeat(LINK_LIMIT + 1);
  const both = linkProblem(bag, long);
  assert.match(both, /1 sprite made in the studio and 1 thing made on a visit/);
  assert.match(both, /definition/);
  assert.match(both, /source/);
  const made = createBag(memoryStorage());
  made.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { source: SOURCE } });
  const m = linkProblem(made, long);
  assert.match(m, /made on a visit/);
  assert.doesNotMatch(m, /studio/);
  assert.equal(linkProblem(made, '#/bag?load=abc'), null);
  // the last sentence can be another (window.loadout says what to call instead)
  assert.match(linkProblem(made, long, { instead: 'Share the download instead (loadout.bag.download()).' }), /loadout\.bag\.download\(\)\)\.$/);
});

test(`link limit: a deflated link carries at most ${MAX_LINK_STUDIO} studio sprites; one with more is not opened. A bag with more makes a plain link, which opens (review round 3, issue 4)`, async () => {
  await loadStudioCheck();
  assert.equal(MAX_LINK_STUDIO, 16);
  const d = beast('copy-beast', 'blank');
  const entry = (n) => ['s', `copy-beast-${n}`, {}, { d: { ...d, id: `copy-beast-${n}` } }];
  const ok = deflatedLink({ v: 1, i: Array.from({ length: MAX_LINK_STUDIO }, (_, n) => entry(n)) });
  const over = deflatedLink({ v: 1, i: Array.from({ length: MAX_LINK_STUDIO + 1 }, (_, n) => entry(n)) });
  assert.ok(over.length < LINK_LIMIT, `copies deflate to almost nothing: ${over.length}`);
  const bag = createBag(memoryStorage());
  bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  assert.equal(bag.peekLink(over), null);
  assert.equal(await bag.peekLinkAsync(over), null);
  assert.equal(bag.fromLink(over), null);
  assert.equal(await bag.fromLinkAsync(over, { mode: 'add' }), null);
  assert.equal(bag.count(), 1, 'the bag is unchanged');
  assert.equal((await bag.peekLinkAsync(ok)).studio, MAX_LINK_STUDIO);
  assert.equal(await bag.fromLinkAsync(ok), MAX_LINK_STUDIO);
  assert.match(bag.toLink(), /load=z\./, 'up to the cap: deflated');
  // one more than a deflated link carries: the bag writes its link plainly (no amplification: it is as long as what it
  // holds), so whatever the page then decides by its length, a link the site hands out always opens
  bag.add(item({ ...d, id: 'one-more' }));
  for (const link of [bag.toLink(), await bag.toLinkAsync()]) {
    assert.doesNotMatch(link, /load=z\./, 'plain');
    assert.ok(link.length > LINK_LIMIT, `17 creatures written plainly are long: ${link.length}`);
    assert.equal((await bag.peekLinkAsync(link)).studio, MAX_LINK_STUDIO + 1, 'and it opens');
    assert.match(linkProblem(bag, link), /17 sprites made in the studio/);
  }
  const other = createBag(memoryStorage());
  assert.equal(await other.fromLinkAsync(bag.toLink()), MAX_LINK_STUDIO + 1);
  assert.deepEqual(other.items().map((i) => i.definition.data), bag.items().map((i) => i.definition.data));
});
