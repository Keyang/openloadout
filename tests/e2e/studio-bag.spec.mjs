// Studio item S8 (docs/studio.md 5 journey d, 6; Contract 14 rules 4, 7, 9): a studio sprite in the bag is kept after a
// reload, drawn in the playground through engine/data-sprite.js (no worker, no quality bar), downloaded with its sheet
// and its library file (<id>.js, catalog/data-file.js, the published copy of tools/lib/data-file.mjs), and travels in a
// deflated link to another browser.
import { test, expect, openRoute, readZip, downloadFrom, quietNetwork, collectErrors } from '../helpers/test.mjs';

const ID = 'studio-bag-beast';

/** Put the Four legs template in the bag, from the page's own modules, as window.loadout.studio.toBag does. */
const putBeast = (page) => page.evaluate(async (id) => {
  const [{ bag }, { studioTemplate }] = await Promise.all([import('/app/bag.js'), import('/rigs/studio-templates.js')]);
  bag.clear();
  const data = { ...studioTemplate('four-legs'), id, name: 'Bag beast' };
  const key = bag.add({ kind: 'sprite', id, settings: {}, definition: { data }, draft: id });
  return { key, saved: bag.saved(), count: bag.count() };
}, ID);

const openPlay = async (page) => {
  await page.goto('/index.html#/play');
  await page.waitForFunction(() => document.querySelector('main.play-page') && window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
};
const playState = (page) => page.evaluate(() => window.__loadoutPlay.state());

/** The bag's zip, as the bag's Download makes it (app/bundle.js packageFiles, app/zip.js), saved as a real download. */
const downloadBag = async (page) => {
  const { name, bytes } = await downloadFrom(page, () => page.evaluate(async () => {
    const [{ bag }, { packageFiles }, { zip }, { saveBlob }] = await Promise.all([import('/app/bag.js'), import('/app/bundle.js'), import('/app/zip.js'), import('/app/ui.js')]);
    saveBlob(zip(await packageFiles({ items: bag.items(), theme: bag.theme(), scale: 1 })), 'loadout-package.zip');
  }), { timeout: 90_000 });
  return { name, files: readZip(new Uint8Array(bytes)) };
};
const text = (f) => new TextDecoder().decode(f.data);

test('a studio sprite in the bag: kept after a reload, played in the playground, downloaded with its sheet and library file', async ({ page }) => {
  test.setTimeout(120_000);
  await openRoute(page, '/');
  const put = await putBeast(page);
  expect(put).toMatchObject({ saved: true, count: 1 });

  // reload: the bag still holds it, with its definition and its draft link
  await page.waitForLoadState('networkidle');      // (a reload while the landing page's pictures load aborts them)
  await page.reload();
  await openRoute(page, '/');
  const kept = await page.evaluate(async () => (await import('/app/bag.js')).bag.items());
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({ key: put.key, kind: 'sprite', id: ID, draft: ID });
  expect(kept[0].definition.data.format).toBe('loadout-sprite');
  expect(kept[0].definition.data.name).toBe('Bag beast');

  // the site knows it like any sprite: a row, and dataSprite as its program (no worker)
  const known = await page.evaluate(async (id) => {
    const c = await import('/app/catalog.js');
    await c.loadCatalog();
    const sprite = await c.loadSprite(id);
    return { row: c.assetById(id), name: sprite.name, clips: Object.keys(sprite.clips), def: !!sprite.definition };
  }, ID);
  expect(known.row).toMatchObject({ id: ID, kind: 'sprite', studio: true, madeIn: 'studio', role: 'characters/enemy', view: 'side' });
  expect(known.name).toBe('Bag beast');
  expect(known.clips).toEqual(expect.arrayContaining(['idle', 'walk', 'attack']));
  expect(known.def).toBe(true);

  // the playground: it is in the scene (an enemy walks by itself)
  await openPlay(page);
  const s = await playState(page);
  expect(s.mode).toBe('side');
  expect(s.things.some((t) => t.id === ID)).toBe(true);

  // the zip: the sheet, the animation list and the library file side by side; the manifest says where it was made
  const { name, files } = await downloadBag(page);
  expect(name).toBe('loadout-package.zip');
  const names = files.map((f) => f.name);
  const folder = `sprites/${ID}/`;
  expect(names).toEqual(expect.arrayContaining([`${folder}${ID}.png`, `${folder}${ID}.json`, `${folder}${ID}.js`, `${folder}how-to-use.txt`, 'manifest.json']));
  const manifest = JSON.parse(text(files.find((f) => f.name === 'manifest.json')));
  expect(manifest.needsRemaking).toBeUndefined();
  expect(manifest.refused).toBeUndefined();
  expect(manifest.missing).toBeUndefined();
  expect(manifest.assets).toHaveLength(1);
  expect(manifest.assets[0]).toMatchObject({ id: ID, kind: 'sprite', name: 'Bag beast', madeIn: 'studio', source: `${folder}${ID}.js`, sheet: `${folder}${ID}.png` });
  const file = text(files.find((f) => f.name === `${folder}${ID}.js`));
  expect(file.split('\n')[0]).toMatch(/^\/\/ Made in the Loadout studio/);
  expect(file.split('\n')[1]).toBe("import { dataSprite } from '../engine/data-sprite.js';");
  // the library file reads back (tools/lib/data-file.mjs) to the definition the bag holds
  const back = await page.evaluate(async (t) => (await import('/tools/lib/data-file.mjs')).readDataFile(t), file);
  expect(back.ok).toBe(true);
  expect(back.value.id).toBe(ID);
  const png = files.find((f) => f.name === `${folder}${ID}.png`).data;
  expect([...png.slice(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG');
  const sheet = JSON.parse(text(files.find((f) => f.name === `${folder}${ID}.json`)));
  expect(Object.keys(sheet.animations)).toEqual(expect.arrayContaining(['idle', 'walk']));
});

test('a studio sprite follows later edits of its draft, and a frozen copy stays as it was', async ({ page }) => {
  await openRoute(page, '/');
  const { key } = await putBeast(page);
  const got = await page.evaluate(async ({ id, key }) => {
    const [{ bag }, c] = await Promise.all([import('/app/bag.js'), import('/app/catalog.js')]);
    const copy = bag.keepCopy(key);
    const data = { ...bag.get(key).definition.data, name: 'Edited beast' };
    bag.updateDefinition(key, { data });
    await c.studioSettled();
    return { followed: c.assetById(id)?.name, copy: bag.get(copy), copyRow: c.assetById(bag.get(copy).id)?.name };
  }, { id: ID, key });
  expect(got.followed).toBe('Edited beast');
  expect(got.copy).toMatchObject({ frozen: true, id: `${ID}-2` });
  expect(got.copy.definition.data.name).toBe('Bag beast');
  expect(got.copyRow).toBe('Bag beast');
});

test('a studio sprite travels in a deflated link and opens in another browser, checked again on the way in', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await openRoute(page, '/');
  await putBeast(page);
  const link = await page.evaluate(async () => {
    const { bag, LINK_LIMIT } = await import('/app/bag.js');
    const hash = await bag.toLinkAsync();
    return { url: `${location.origin}${location.pathname}${hash}`, limit: LINK_LIMIT, sync: bag.toLink().length };
  });
  expect(link.url).toMatch(/#\/bag\?load=z\./);
  expect(link.url.length).toBeLessThan(link.limit);
  expect(link.sync).toBeLessThan(link.limit);

  // another profile: nothing stored, the link alone
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await quietNetwork(page2);
  const errs = collectErrors(page2);
  await openRoute(page2, '/');
  const opened = await page2.evaluate(async (url) => {
    const { bag } = await import('/app/bag.js');
    const peek = await bag.peekLinkAsync(url);
    const n = await bag.fromLinkAsync(url);
    return { peek, n, items: bag.items() };
  }, link.url);
  expect(opened.peek).toEqual({ count: 1, made: 1, code: 0, studio: 1 });
  expect(opened.n).toBe(1);
  expect(opened.items[0]).toMatchObject({ id: ID, from: 'link' });
  expect(opened.items[0].draft).toBeUndefined();
  await openPlay(page2);
  expect((await playState(page2)).things.some((t) => t.id === ID)).toBe(true);
  errs.expectNone();
  await other.close();
});

// ---- review round 2 (issues 2, 4, 5): the journey on the bag page itself, and ids clear of the library ----

const rowOf = (page, name) => page.locator('.bag-item').filter({ hasText: name });

test('journey d on the bag page: shown, downloaded by its Download button, its link copied there and opened by #/bag?load=', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await openRoute(page, '/');
  await putBeast(page);

  // the bag page shows it like any sprite (a picture, never "Needs re-making")
  await openRoute(page, '/bag');
  await expect(rowOf(page, 'Bag beast').locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  await expect(rowOf(page, 'Bag beast')).toHaveCount(1);
  await expect(page.locator('.bag-item.remake')).toHaveCount(0);

  // its Download: the sheet and the library file side by side
  const dl = page.locator('.bag-export').getByRole('button', { name: 'Download', exact: true });
  await expect(dl).toBeEnabled();
  const { name, bytes } = await downloadFrom(page, () => dl.click(), { timeout: 90_000 });
  expect(name).toBe('loadout-package.zip');
  const files = readZip(new Uint8Array(bytes));
  const folder = `sprites/${ID}/`;
  expect(files.map((f) => f.name)).toEqual(expect.arrayContaining([`${folder}${ID}.png`, `${folder}${ID}.json`, `${folder}${ID}.js`, 'manifest.json']));
  const manifest = JSON.parse(text(files.find((f) => f.name === 'manifest.json')));
  expect(manifest.needsRemaking).toBeUndefined();
  expect(manifest.assets[0]).toMatchObject({ id: ID, madeIn: 'studio', source: `${folder}${ID}.js` });

  // its link, as the bag page copies it
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy link to this bag' }).first().click();
  await expect(page.locator('.bag-link-note')).toContainText(/Link copied|Select the link/);
  const url = await page.evaluate(async () => document.querySelector('.bag-link-text')?.value ?? navigator.clipboard.readText());
  expect(url).toMatch(/#\/bag\?load=z\./);
  const route = url.slice(url.indexOf('#') + 1);

  // another profile with an empty bag: the bag page opens it
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await quietNetwork(page2);
  const errs = collectErrors(page2);
  await openRoute(page2, route);
  await expect(page2.locator('.bag-link-note')).toContainText('Opened a shared bag with 1 item');
  await expect(rowOf(page2, 'Bag beast').locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  await expect(rowOf(page2, 'Bag beast')).toHaveCount(1);
  await expect(page2.locator('.bag-item.remake')).toHaveCount(0);

  // a profile whose bag holds something: it asks first, then adds it
  await page2.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.clear(); bag.add({ kind: 'sprite', id: 'knight', settings: {} }); });
  await openRoute(page2, route);
  await expect(page2.locator('.bag-offer')).toContainText('1 item');
  await page2.getByRole('button', { name: 'Add them to my bag' }).click();
  await expect(rowOf(page2, 'Bag beast').locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  await expect(page2.locator('.bag-item')).toHaveCount(2);
  await expect(page2.locator('.bag-item.remake')).toHaveCount(0);
  errs.expectNone();
  await other.close();
});

test('a studio sprite kept under a library id gets an id of its own once the catalogue is in, and the download never ships it under that id', async ({ page }) => {
  test.setTimeout(90_000);
  await openRoute(page, '/');
  // what an early add (before the catalogue loaded) leaves in storage: a studio sprite called "knight", the Hero's id
  await page.evaluate(async () => {
    const [{ BAG_KEY }, { studioTemplate }] = await Promise.all([import('/app/bag.js'), import('/rigs/studio-templates.js')]);
    const data = { ...studioTemplate('four-legs'), id: 'knight', name: 'Not the hero' };
    localStorage.setItem(BAG_KEY, JSON.stringify({ version: 1, items: [{ key: 'i1', kind: 'sprite', id: 'knight', settings: {}, definition: { data }, draft: 'not-the-hero', addedAt: 1 }], next: 2 }));
  });
  await page.waitForLoadState('networkidle');      // (a reload while the landing page's pictures load aborts them)
  await page.reload();
  await openRoute(page, '/');
  await page.waitForFunction(async () => (await import('/app/bag.js')).bag.items()[0]?.id === 'knight-2', null, { timeout: 30_000 });
  const got = await page.evaluate(async () => {
    const [{ bag }, c] = await Promise.all([import('/app/bag.js'), import('/app/catalog.js')]);
    await c.studioSettled();
    const it = bag.items()[0];
    return { id: it.id, dataId: it.definition.data.id, draft: it.draft, hero: c.assetById('knight')?.name, mine: c.assetById('knight-2')?.name };
  });
  expect(got).toEqual({ id: 'knight-2', dataId: 'knight-2', draft: 'not-the-hero', hero: 'Hero', mine: 'Not the hero' });

  // the last guard: handed a studio item under a library id anyway, the package refuses it and writes none of its files
  const out = await page.evaluate(async () => {
    const [{ packageFiles }, { studioTemplate }] = await Promise.all([import('/app/bundle.js'), import('/rigs/studio-templates.js')]);
    const data = { ...studioTemplate('four-legs'), id: 'knight', name: 'Not the hero' };
    const files = await packageFiles({ items: [{ key: 'i9', kind: 'sprite', id: 'knight', settings: {}, definition: { data } }], scale: 1 });
    return { names: files.map((f) => f.name), manifest: JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'manifest.json').data)) };
  });
  expect(out.names.filter((n) => n.startsWith('sprites/'))).toEqual([]);
  expect(out.manifest.refused).toEqual([expect.objectContaining({ key: 'i9', id: 'knight', reason: expect.stringMatching(/library/) })]);
});

test('a short deflated link of 100,000 items is not opened: the bag page says it is damaged and keeps answering (review round 3, issue 2)', async ({ browser }) => {
  const zlib = await import('node:zlib');
  const { studioTemplate } = await import('../../rigs/studio-templates.js');
  const data = { v: 1, i: [...Array.from({ length: 100_000 }, () => ['s', 'knight', {}]), ['s', 'bomb-beast', {}, { d: { ...studioTemplate('four-legs'), id: 'bomb-beast', name: 'Bomb' } }]] };
  const value = 'z.' + zlib.deflateRawSync(Buffer.from(JSON.stringify(data)), { level: 9 }).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  expect(value.length).toBeLessThan(20_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await openRoute(page, `/bag?load=${value}`);
  await expect(page.getByText('That bag link is damaged, so nothing was added.')).toBeVisible({ timeout: 20_000 });
  const t0 = Date.now();
  const state = await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); return { count: bag.count(), stored: (localStorage.getItem('loadout-bag-v1') ?? '').length }; });
  expect(Date.now() - t0).toBeLessThan(5_000);
  expect(state.count).toBe(0);
  expect(state.stored).toBeLessThan(10_000);
  await page.screenshot({ timeout: 10_000 });
  await ctx.close();
});
