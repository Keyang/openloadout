// Safety of sprites made on a visit, now that they are data (docs/data-sprites.md 3.4 and section 5, build item B11;
// Contract 15 rule 6; Keyang's DQ2). A definition is drawn on the page with no worker: the plain-data wall, the
// validator and the cost budget stand where the sandbox stood. What arrives in storage or in a link is checked the
// same way before it is drawn. A bag item or link entry holding source text (route 2 before B11) is never run: it is
// listed as made with an older version of Loadout. example.com stands for "another site": the test answers it itself
// and records every request that reaches it, so nothing leaves the machine.
import { test as base, expect } from '@playwright/test';
import { quietNetwork, openRoute, waitForDrawn } from '../helpers/browser.mjs';
import { goodData, noWords, deadControl, OLD_SOURCE, GOOD_SOUND } from '../fixtures/api/data.mjs';
import { readZip } from '../helpers/zip-read.mjs';

const BAG_KEY = 'loadout-bag-v1';
const OLD_MARKS = OLD_SOURCE.replace("render(g) {", "render(g) { globalThis.__ran = true; fetch('https://example.com/ran'); ");

// These tests hand the site hostile input on purpose, so they do not use the shared `test` that fails on any console
// error (a refused definition is reported on the console). What must never happen is an error thrown in the page.
const test = base.extend({
  page: async ({ page }, use) => {
    await quietNetwork(page);
    const thrown = [];
    page.on('pageerror', (e) => thrown.push(e.message));
    await use(page);
    expect(thrown, 'nothing was thrown in the page').toEqual([]);
  },
});

/** Answer example.com from here and keep a list of what was asked of it. Returns the list. */
async function watchOtherSite(context) {
  const reached = [];
  await context.route(/^(https?|wss?):\/\/([^/]*\.)?example\.com\//, (route) => { reached.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/javascript', body: 'globalThis.__remote = true; export default 1;' }); });
  return reached;
}
const storedBag = (items) => JSON.stringify({ version: 1, items: items.map((it, i) => ({ key: `i${i + 1}`, addedAt: 1, settings: {}, ...it })), next: items.length + 1 });

test('the page makes no worker or script from memory, and its content policy no longer allows one', async ({ page }) => {
  await openRoute(page, '/');
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  for (const part of ["default-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'"]) expect(policy).toContain(part);
  expect(policy).not.toMatch(/script-src[^;]*blob:/);
  expect(policy).not.toMatch(/worker-src[^;]*blob:/);
  const r = await page.evaluate(async (data) => {
    const made = await window.loadout.make.sprite(data);
    const drawn = await window.loadout.render(data.id, { frame: 0 });
    return { made, drawn, loaded: performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname) };
  }, goodData('rv-data'));
  expect(r.made).toMatchObject({ id: 'rv-data', ok: true, kept: true });
  expect(r.drawn.ok).toBe(true);
  for (const gone of ['/app/sandbox-worker.js', '/app/made.js', '/app/api-source.js']) expect(r.loaded).not.toContain(gone);
  // and a worker made from memory is refused by the browser
  const blocked = await page.evaluate(() => new Promise((resolve) => {
    try {
      const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' })), { type: 'module' });
      w.onmessage = () => resolve('ran');
      w.onerror = (e) => { e.preventDefault(); resolve('refused'); };
      setTimeout(() => resolve('refused'), 3000);
    } catch { resolve('refused'); }
  }));
  expect(blocked).toBe('refused');
});

test('an old bag item made from source text is never run: it is listed as made with an older version, and left out of the download', async ({ page, context }) => {
  const reached = await watchOtherSite(context);
  await openRoute(page, '/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [BAG_KEY, storedBag([
    { kind: 'sprite', id: 'rv-old', definition: { source: OLD_MARKS } },
    { kind: 'sprite', id: 'coin' },
  ])]);
  await page.reload();
  await waitForDrawn(page);
  const a = await page.evaluate(async () => {
    const L = window.loadout;
    return { items: (await L.bag.items()).items.map((i) => [i.id, i.state ?? null, i.reason ?? null]), get: (await L.assets.get('rv-old')).ok, zip: await L.bag.download({ save: false }), ran: window.__ran ?? null };
  });
  expect(a.items[0][0]).toBe('rv-old');
  expect(a.items[0][1]).toBe('needs re-making');
  expect(a.items[0][2]).toMatch(/older version of Loadout/);
  expect(await page.evaluate(async () => (await import('/app/api.js')).madeItemState((await window.loadout.bag.items()).items[0]).say)).toBe('This was made with an older version of Loadout; ask for a new link.');
  expect(a.items[1]).toEqual(['coin', null, null]);
  expect(a.get).toBe(false);
  expect(a.zip.ok).toBe(true);
  expect(a.zip.needsRemaking).toEqual(['rv-old']);
  expect(a.zip.files.filter((f) => /rv-old/.test(f))).toEqual([]);
  expect(a.ran).toBe(null);
  await page.evaluate(() => window.loadout.go('/bag'));
  await expect(page.locator('.bag-item')).toHaveCount(2);
  await expect(page.locator('.bag-item.remake')).toHaveCount(1);
  await expect(page.locator('.bag-item.remake')).toContainText(/needs re-making/i);
  await expect(page.locator('.bag-item.remake details')).toContainText(/older version of Loadout/);
  await expect(page.locator('.bag-item.remake canvas')).toHaveCount(0);

  // the same in a link: it no longer asks to run anything, and nothing of it runs
  const link = await page.evaluate(async (src) => { const { createBag, memoryStorage } = await import('/app/bag.js'); const bag = createBag(memoryStorage()); bag.add({ kind: 'sprite', id: 'rv-old', settings: {}, definition: { source: src } }); return bag.toLink(); }, OLD_MARKS);
  const other = await (await context.browser().newContext()).newPage();
  const otherReached = await watchOtherSite(other.context());
  await other.goto(`/index.html${link}`);
  await expect(other.locator('.bag-offer')).toHaveCount(0);
  await expect(other.locator('.bag-item.remake')).toHaveCount(1);
  await expect(other.locator('.bag-item.remake')).toContainText('Ask the sender for a new one');
  await expect(other.locator('.bag-item.remake details')).toContainText(/older version of Loadout/);
  expect(await other.evaluate(() => window.__ran ?? null)).toBe(null);
  expect([...reached, ...otherReached]).toEqual([]);
  await other.context().close();
});

test('hostile data in storage is refused before anything draws, and the rest of the bag works', async ({ page }) => {
  await openRoute(page, '/');
  const tooBig = { ...goodData('rv-big'), blurb: 'x'.repeat(140 * 1024) };
  const codeText = { ...goodData('rv-code'), name: 'function () { globalThis.__ran = true }' };
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [BAG_KEY, storedBag([
    { kind: 'sprite', id: 'rv-dead', definition: { data: deadControl('rv-dead') } },
    { kind: 'sprite', id: 'rv-big', definition: { data: tooBig } },
    { kind: 'sprite', id: 'rv-code', definition: { data: codeText } },
    { kind: 'sprite', id: 'coin' },
  ]).replace('"id":"rv-dead"', '"__proto__":{"polluted":true},"id":"rv-dead"')]);
  await page.reload();
  await waitForDrawn(page);
  const r = await page.evaluate(async () => {
    const L = window.loadout;
    return { polluted: ({}).polluted ?? null, ran: window.__ran ?? null, dead: (await L.assets.get('rv-dead')).ok, big: (await L.assets.get('rv-big')).ok, code: await L.render('rv-code', { frame: 0 }), coin: (await L.render('coin', { frame: 0 })).ok };
  });
  expect(r.polluted).toBe(null);
  expect(r.ran).toBe(null);
  expect(r.dead).toBe(false);
  expect(r.big).toBe(false);
  expect(r.coin).toBe(true);
  // text in a field is only ever text: a name that reads like code is a name
  if (r.code.ok) expect(r.code.opaque).toBeGreaterThan(0);
  // make.sprite takes nothing of it either
  const made = await page.evaluate(async ([dead, big]) => ({ dead: await window.loadout.make.sprite(dead), big: await window.loadout.make.sprite(big), list: (await window.loadout.assets.list({ runtime: true })).assets.map((a) => a.id) }), [deadControl('rv-dead2'), tooBig]);
  expect(made.dead).toMatchObject({ ok: false, kept: false });
  expect(made.big.ok).toBe(false);
  expect(made.big.errors.join('\n')).toMatch(/128 KB/);
  expect(made.list).not.toContain('rv-dead2');
});

test('making a bagged asset again with a failing definition is refused, and the bag exports what it stored', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async ([good, bad, better]) => {
    const L = window.loadout;
    const first = await L.make.sprite(good);
    const add = await L.bag.add('rv-swap');
    const remake = await L.make.sprite(bad);
    const after = { items: await L.bag.items(), row: (await L.assets.get('rv-swap')).asset };
    const zip = await L.bag.download({ save: false });
    // a passing new version is taken, and the bag follows it
    const again = await L.make.sprite(better);
    return { first, add, remake, after, zip, again, name: (await L.bag.items()).items[0].definition.data.name };
  }, [goodData('rv-swap'), noWords('rv-swap'), { ...goodData('rv-swap'), name: 'Better gem' }]);
  expect(r.first.ok).toBe(true);
  expect(r.add.ok).toBe(true);
  expect(r.remake.ok).toBe(false);
  expect(r.remake.kept).toBe(false);
  expect(r.remake.errors.join('\n')).toMatch(/meta\.words/);
  expect(r.remake.errors.join('\n')).toMatch(/in the bag/);
  expect(r.after.items.items[0].definition.data.meta.words).toBeTruthy();
  expect(r.after.row).toMatchObject({ ok: true, name: 'Test gem' });
  expect(r.zip.ok).toBe(true);
  expect(r.zip.files).toEqual(expect.arrayContaining(['sprites/rv-swap/rv-swap.png', 'sprites/rv-swap/rv-swap.sprite.json']));
  expect(r.again).toMatchObject({ ok: true, replaced: true });
  expect(r.name).toBe('Better gem');
});

// review of B11, issue 4: a made sprite added twice keeps its id in both items, as a library asset does
test('a made sprite added twice keeps its id in both items; both follow a re-make, through a reload, and assets.remove names both', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async ([good, better]) => {
    const L = window.loadout;
    await L.make.sprite(good);
    const x = await L.bag.add('dup-gem'), y = await L.bag.add('dup-gem', { params: { shape: 'square' } });
    const again = await L.make.sprite(better);
    const items = (await L.bag.items()).items;
    return { ids: [x.item.id, y.item.id], again: again.ok, items: items.map((i) => [i.id, typeof i.made === 'string' && i.made === items[0].made, i.definition.data.name]), remove: await L.assets.remove('dup-gem'), keys: [x.key, y.key] };
  }, [goodData('dup-gem'), { ...goodData('dup-gem'), name: 'Better gem' }]);
  expect(r.ids).toEqual(['dup-gem', 'dup-gem']);
  expect(r.again).toBe(true);
  expect(r.items).toEqual([['dup-gem', true, 'Better gem'], ['dup-gem', true, 'Better gem']]);
  expect(r.remove.ok).toBe(false);
  expect(r.remove.errors[0]).toContain(`item ${r.keys.join(', ')}`);
  // after a reload the ids stay, the download holds the sprite twice (each with its own settings), and its page says where it came from
  await page.reload();
  await waitForDrawn(page);
  const back = await page.evaluate(async () => {
    const L = window.loadout;
    const zip = await L.bag.download({ save: false });
    return { ids: (await L.bag.items()).items.map((i) => i.id), files: zip.files.filter((f) => f.endsWith('.sprite.json')) };
  });
  expect(back.ids).toEqual(['dup-gem', 'dup-gem']);
  expect(back.files).toEqual(['sprites/dup-gem/dup-gem.sprite.json', 'sprites/dup-gem-2/dup-gem.sprite.json']);
  await page.evaluate(() => window.loadout.go('/sprite/dup-gem'));
  await waitForDrawn(page);
  // (the sprite page keeps the note in .made-here; whether it shows it is the page's own choice)
  await expect(page.locator('.made-here')).toContainText(/Made with window\.loadout on an earlier visit and kept in your bag/);
});

// review of B11 round 2, issue 1: the `made` token is a claim, so items share an id only when they hold the same definition
test('a link that marks two different sprites as one made sprite opens as two: the bag shows and exports each as it is', async ({ page }) => {
  await openRoute(page, '/');
  const gold = { ...goodData('twin-gem'), name: 'Gold twin' }, blue = { ...goodData('twin-gem'), name: 'Other twin' };
  const link = '#/bag?load=' + await page.evaluate((text) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    JSON.stringify({ v: 1, i: [['s', 'twin-gem', {}, { d: gold, m: 'twintoken1' }], ['s', 'twin-gem', {}, { d: blue, m: 'twintoken1' }]] }));
  const other = await (await page.context().browser().newContext()).newPage();
  await quietNetwork(other);
  await other.goto(`/index.html${link}`);
  await expect(other.locator('.bag-item')).toHaveCount(2);
  await expect(other.locator('.bag-item').nth(0)).toContainText('Gold twin');
  await expect(other.locator('.bag-item').nth(1)).toContainText('Other twin');
  const r = await other.evaluate(async () => {
    const L = window.loadout;
    const zip = await L.bag.download({ save: false });
    return {
      items: (await L.bag.items()).items.map((i) => [i.id, i.made ?? null, i.definition.data.name]),
      gold: (await L.assets.get('twin-gem')).asset.name, blue: (await L.assets.get('twin-gem-2')).asset.name,
      files: zip.files.filter((x) => x.endsWith('.sprite.json')),
    };
  });
  expect(r.items).toEqual([['twin-gem', 'twintoken1', 'Gold twin'], ['twin-gem-2', null, 'Other twin']]);
  expect([r.gold, r.blue]).toEqual(['Gold twin', 'Other twin']);
  expect(r.files).toEqual(['sprites/twin-gem/twin-gem.sprite.json', 'sprites/twin-gem-2/twin-gem-2.sprite.json']);
  // the page of the linked one says it came in a link, not that it was made here on an earlier visit
  await other.evaluate(() => window.loadout.go('/sprite/twin-gem'));
  await waitForDrawn(other);
  await expect(other.locator('.made-here')).toContainText(/by whoever shared the bag link/);
  await other.context().close();
});

test('adding a shared bag whose made sprite has my made sprite\'s id gives theirs an id of its own', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async ([mine, theirs]) => {
    const L = window.loadout;
    const { bag, createBag, memoryStorage, madeToken } = await import('/app/bag.js');
    await L.make.sprite(mine);
    await L.bag.add('pair-gem');
    const from = createBag(memoryStorage());
    from.add({ kind: 'sprite', id: 'pair-gem', settings: {}, definition: { data: theirs }, made: madeToken(theirs) });
    // the bag page's "Add n items from the shared bag"
    const added = await bag.fromLinkAsync(from.toLink(), { mode: 'add' });
    await new Promise((done) => setTimeout(done, 300));
    return {
      added,
      items: (await L.bag.items()).items.map((i) => [i.id, typeof i.made === 'string', i.definition.data.name]),
      mine: (await L.assets.get('pair-gem')).asset.name, theirs: (await L.assets.get('pair-gem-2')).asset?.name ?? null,
    };
  }, [{ ...goodData('pair-gem'), name: 'Mine' }, { ...goodData('pair-gem'), name: 'Stranger' }]);
  expect(r.added).toBe(1);
  expect(r.items).toEqual([['pair-gem', true, 'Mine'], ['pair-gem-2', false, 'Stranger']]);
  expect([r.mine, r.theirs]).toEqual(['Mine', 'Stranger']);
});

test('two makes of one id at once end as one asset, the later one', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async (data) => {
    const L = window.loadout;
    const [x, y] = await Promise.all([L.make.sprite(data), L.make.sprite({ ...data, name: 'Test gem two' })]);
    return { x: [x.ok, x.replaced], y: [y.ok, y.replaced], name: (await L.assets.get('rv-race')).asset.name, list: (await L.assets.list({ runtime: true })).assets.map((a) => a.id) };
  }, goodData('rv-race'));
  expect(r).toEqual({ x: [true, false], y: [true, true], name: 'Test gem two', list: ['rv-race'] });
});

test('when the browser cannot save the bag, bag.add says so, nothing is half-added, and the bag page says so too', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(async ([a, b, sound]) => { const L = window.loadout; await L.make.sound(sound); await L.make.sprite(a); await L.make.sprite(b); await L.bag.add('coin'); }, [goodData('rv-p1'), goodData('rv-p2'), GOOD_SOUND]);
  // fill what is left of this site's storage
  await page.evaluate(() => { for (const size of [1024 * 1024, 1024, 16]) { const chunk = 'x'.repeat(size); try { for (let i = 0; ; i++) localStorage.setItem(`junk-${size}-${i}`, chunk); } catch { /* full at this size */ } } });
  const adds = await page.evaluate(async (ids) => { const out = []; for (const id of ids) out.push(await window.loadout.bag.add(id)); return { out, now: await window.loadout.bag.items() }; }, ['rv-p1', 'rv-p2', GOOD_SOUND.id]);
  for (const r of adds.out) { expect(r.ok).toBe(false); expect(r.errors[0]).toMatch(/could not be saved/); expect(r.errors[0]).toMatch(/storage .* full|full/i); }
  expect(adds.now.items.map((i) => i.id), 'what the bag says it holds is what is saved').toEqual(['coin']);
  // the page's own "Add to bag" keeps the item for this visit and the bag page warns that it is not saved
  await page.evaluate(() => window.loadout.go('/sprite/knight'));
  await page.getByRole('button', { name: 'Add to my bag' }).click();
  await page.evaluate(() => window.loadout.go('/bag'));
  await expect(page.locator('.bag-item')).toHaveCount(2);
  await expect(page.locator('.bag-unsaved')).toContainText(/could not be saved/);
  await page.reload();
  await waitForDrawn(page);
  await expect(page.locator('.bag-item')).toHaveCount(1);
  expect((await page.evaluate(() => window.loadout.bag.items())).items.map((i) => i.id)).toEqual(['coin']);
});

// ---- B11b: identity in the bag (review of B11 round 3, issues 1 to 3) ---------------------------------------------
// A made sprite's items carry the `made` token of its make call. make.sprite changes only those: a studio sprite, a
// studio draft's item or another made sprite under the id is never overwritten (the id is refused), and the bag page,
// assets.get and the download all show the same sprite for every id.

/** What the bag page, assets.get and the download say each bag item is: [id, page row name, assets.get name, the name in its <id>.sprite.json]. */
async function threeWays(page) {
  const r = await page.evaluate(async () => {
    const L = window.loadout;
    const items = (await L.bag.items()).items;
    const zip = await L.bag.download({ save: false, data: true });
    return { items: await Promise.all(items.map(async (i) => [i.id, (await L.assets.get(i.id)).asset?.name ?? null])), zip: zip.zip ?? null, files: zip.files ?? [] };
  });
  const files = readZip(Buffer.from(r.zip.split(',')[1], 'base64'));
  const sheet = (id) => { const f = files.find((x) => x.name.endsWith('.sprite.json') && x.name.startsWith(`sprites/${id}/`)); return f ? JSON.parse(new TextDecoder().decode(f.data)).name : null; };
  await page.evaluate(() => window.loadout.go('/bag'));
  await expect(page.locator('.bag-item')).toHaveCount(r.items.length);
  const shown = await page.locator('.bag-item .bag-name').allTextContents();
  return r.items.map(([id, got], n) => [id, shown[n], got, sheet(id)]);
}

test('make.sprite never overwrites or shadows a studio sprite in the bag: refused, and the bag page, assets.get and the download agree', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [BAG_KEY, storedBag([
    { kind: 'sprite', id: 'probe-gem', definition: { data: { ...goodData('probe-gem'), name: 'Studio mine' } } },
    { kind: 'sprite', id: 'probe-gem3', draft: 'dr1', definition: { data: { ...goodData('probe-gem3'), name: 'Studio drafted' } } },
  ])]);
  await page.reload();
  await waitForDrawn(page);
  const r = await page.evaluate(async ([a, b]) => {
    const L = window.loadout;
    return { a: await L.make.sprite(a), b: await L.make.sprite(b), items: (await L.bag.items()).items.map((i) => [i.id, i.definition.data.name, i.draft ?? null]) };
  }, [{ ...goodData('probe-gem'), name: 'Agent' }, { ...goodData('probe-gem3'), name: 'Agent' }]);
  for (const x of [r.a, r.b]) { expect(x).toMatchObject({ ok: false, kept: false }); expect(x.errors[0]).toMatch(/in the bag as another sprite/); }
  expect(r.items).toEqual([['probe-gem', 'Studio mine', null], ['probe-gem3', 'Studio drafted', 'dr1']]);
  expect(await threeWays(page)).toEqual([['probe-gem', 'Studio mine', 'Studio mine', 'Studio mine'], ['probe-gem3', 'Studio drafted', 'Studio drafted', 'Studio drafted']]);
});

test('my made sprite from an earlier visit, then a stranger\'s of the same id added from a link: two ids, each shown and downloaded as it is', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(async (data) => { await window.loadout.make.sprite(data); await window.loadout.bag.add(data.id); }, { ...goodData('earlier-gem'), name: 'Mine' });
  await page.reload();
  await waitForDrawn(page);
  const r = await page.evaluate(async ([theirs, other]) => {
    const L = window.loadout;
    const { bag, createBag, memoryStorage, madeToken } = await import('/app/bag.js');
    const from = createBag(memoryStorage());
    from.add({ kind: 'sprite', id: theirs.id, settings: {}, definition: { data: theirs }, made: madeToken(theirs) });
    const added = await bag.fromLinkAsync(from.toLink(), { mode: 'add' });      // the bag page's "Add n items from the shared bag"
    await new Promise((done) => setTimeout(done, 300));
    // a new make call of that id on this visit is not my earlier make: it is refused, and neither item changes
    const remake = await L.make.sprite(other);
    return { added, remake, items: (await L.bag.items()).items.map((i) => [i.id, i.definition.data.name, i.from ?? null]) };
  }, [{ ...goodData('earlier-gem'), name: 'Stranger' }, { ...goodData('earlier-gem'), name: 'Agent again' }]);
  expect(r.added).toBe(1);
  expect(r.remake).toMatchObject({ ok: false, kept: false });
  expect(r.items).toEqual([['earlier-gem', 'Mine', null], ['earlier-gem-2', 'Stranger', 'link']]);
  expect(await threeWays(page)).toEqual([['earlier-gem', 'Mine', 'Mine', 'Mine'], ['earlier-gem-2', 'Stranger', 'Stranger', 'Stranger']]);
});

test('after a reload, the version the bag holds handed back to make.sprite is the same make: a new version then reaches its items', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(async (data) => { await window.loadout.make.sprite(data); await window.loadout.bag.add(data.id); await window.loadout.bag.add(data.id); }, { ...goodData('again-gem'), name: 'First' });
  await page.reload();
  await waitForDrawn(page);
  const r = await page.evaluate(async (better) => {
    const L = window.loadout;
    const back = await L.make.sprite((await L.assets.get('again-gem')).asset.definition);
    const next = await L.make.sprite(better);
    return { back: back.ok, next: next.ok, items: (await L.bag.items()).items.map((i) => [i.id, i.definition.data.name]) };
  }, { ...goodData('again-gem'), name: 'Second' });
  expect(r).toEqual({ back: true, next: true, items: [['again-gem', 'Second'], ['again-gem', 'Second']] });
  expect(await threeWays(page)).toEqual([['again-gem', 'Second', 'Second', 'Second'], ['again-gem', 'Second', 'Second', 'Second']]);
});
