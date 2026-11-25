// The bag tray (docs/playground-tray-workbench.md, section 2): the bag always on screen at the right edge, filling up as
// things are added. In the library (1024 px and wider) a panel about 320 px wide with the count, Download, a small live
// scene of the bag that opens the playground, and the list; on the asset pages (1280 px and wider) a slim column of
// pictures. Narrower than that it is not shown. It follows the bag live, also a change made in another tab.
// Run with: npx playwright test tests/e2e/tray.spec.mjs
import { test, expect, openRoute, hasHorizontalScroll } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf } from '../helpers/catalog.mjs';

const C = catalogueOf(readCatalogue());
const KIT = 'dungeon-starter';                 // a few sprites, sounds and a track: no background
const BIG = 'kit-platformer-fantasy';          // a big kit with backgrounds and ground tiles

const tray = (page) => page.locator('aside.tray');
const rows = (page) => tray(page).locator('.tray-list > li[data-key]');
const bagItems = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('loadout-bag-v1')).items ?? []; } catch { return []; } });

async function addKit(page, id) {
  await page.goto(`/index.html#/bundle/${id}`);
  await page.waitForSelector('main.bundle-page .kit-top');
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(page.locator('.bundle-actions .status')).toContainText('Added');
}
const openLibrary = async (page, q = '') => { await openRoute(page, `/browse${q}`); await expect(page.locator('ul.results > li').first()).toBeVisible(); };

for (const [w, h] of [[1440, 900], [1024, 768]]) {
  test.describe(`library at ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('an empty bag: the tray is there and says what to do', async ({ page }) => {
      await openLibrary(page);
      await expect(tray(page)).toBeVisible();
      await expect(tray(page).getByRole('heading', { name: 'Your bag' })).toBeVisible();
      await expect(tray(page).locator('.tray-count')).toContainText('0');
      await expect(tray(page).locator('.tray-empty')).toHaveText('Press + on anything and it lands here.');
      await expect(rows(page)).toHaveCount(0);
      await expect(tray(page).locator('.tray-scene')).toBeHidden();
      // the full height under the header, at the right edge, about 320 px wide, beside the results (not over them)
      const box = await tray(page).boundingBox();
      const head = await page.locator('header.top').boundingBox();
      expect(Math.round(box.x + box.width)).toBe(w);
      expect(box.width).toBeGreaterThanOrEqual(280);
      expect(box.width).toBeLessThanOrEqual(340);
      expect(Math.round(box.y)).toBe(Math.round(head.y + head.height));
      expect(Math.round(box.y + box.height)).toBe(h);
      const results = await page.locator('ul.results').boundingBox();
      expect(results.x + results.width).toBeLessThanOrEqual(box.x + 1);
      expect(await hasHorizontalScroll(page)).toBe(false);
    });

    test('the tray lists the bag: count and rows match it; + adds a row at once and nothing else moves; × takes it out', async ({ page }) => {
      await addKit(page, KIT);
      await openLibrary(page, '?kind=sprite');
      const items = await bagItems(page);
      await expect(tray(page).locator('.tray-count')).toContainText(String(items.length));
      await expect(rows(page)).toHaveCount(items.length);
      for (const [i, it] of items.entries()) {
        const row = rows(page).nth(i);
        await expect(row).toHaveAttribute('data-key', it.key);
        await expect(row.locator('.tray-name')).toHaveText(C.byId[it.id].name);
        await expect(row.locator('.tray-type')).not.toBeEmpty();
      }
      // a row opens that thing's page with its bag item
      await expect(rows(page).first().locator('a.tray-row')).toHaveAttribute('href', `#/${items[0].kind}/${items[0].id}?bag=${items[0].key}`);

      // + on a card that is not in the bag: a row at once, and the results stay where they were
      const held = new Set(items.map((i) => i.id));
      const card = page.locator('ul.results > li').filter({ has: page.locator('.card-add:not(.in-bag)') }).first();
      const id = await card.getAttribute('data-id');
      expect(held.has(id)).toBe(false);
      const places = () => page.locator('ul.results > li').evaluateAll((lis) => lis.slice(0, 12).map((li) => { const r = li.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); }));
      const before = await places();
      const scroll = await page.evaluate(() => scrollY);
      await card.locator('.card-add').click();
      await expect(rows(page)).toHaveCount(items.length + 1, { timeout: 1000 });
      await expect(rows(page).last().locator('.tray-name')).toHaveText(C.byId[id].name);
      await expect(tray(page).locator('.tray-count')).toContainText(String(items.length + 1));
      expect(await places()).toEqual(before);
      expect(await page.evaluate(() => scrollY)).toBe(scroll);

      // × takes it out of the bag
      const last = rows(page).last();
      await last.getByRole('button', { name: `Take ${C.byId[id].name} out of your bag` }).click();
      await expect(rows(page)).toHaveCount(items.length);
      expect((await bagItems(page)).some((i) => i.id === id)).toBe(false);
      await expect(card.locator('.card-add')).not.toHaveClass(/in-bag/);
    });

    test('each row has the bag list\'s icon buttons: Surprise me changes it at once, Duplicate puts a copy after it, Remove takes it out', async ({ page }) => {
      await openRoute(page, '/');
      await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.clear();
        for (const id of ['knight', 'slime']) bag.add({ kind: 'sprite', id, settings: { params: {}, cues: null, scale: 1 } });
        bag.add({ kind: 'sound', id: 'coin-pickup', settings: { params: {}, style: null, seed: 1 } }); });
      await openLibrary(page);
      await expect(rows(page)).toHaveCount(3);
      const hero = rows(page).first(), name = C.byId.knight.name;
      // icons only: every button in the row is named for a screen reader and has no words on it
      const words = await hero.locator('button').evaluateAll((bs) => bs.map((b) => b.textContent.trim()).join(''));
      expect(words).toBe('');
      const magic = hero.getByRole('button', { name: `Surprise me: ${name}` });
      await expect(magic).toHaveClass(/btn-magic/);
      const before = JSON.stringify((await bagItems(page))[0].settings.params);
      await magic.click();
      await expect.poll(async () => JSON.stringify((await bagItems(page))[0].settings.params)).not.toBe(before);
      await expect(page).toHaveURL(/#\/browse/);                                    // it changed the item; it did not open its page
      await rows(page).first().getByRole('button', { name: `Duplicate ${name}` }).click();
      await expect(rows(page)).toHaveCount(4);
      expect((await bagItems(page)).map((i) => i.id)).toEqual(['knight', 'knight', 'slime', 'coin-pickup']);
      await rows(page).nth(1).getByRole('button', { name: `Take ${name} out of your bag` }).click();
      await expect(rows(page)).toHaveCount(3);
      // a sound's row has them too (its patch may not be loaded yet: Surprise me brings it)
      const snd = rows(page).last();
      const was = JSON.stringify((await bagItems(page))[2].settings.params);
      await snd.getByRole('button', { name: /^Surprise me: / }).click();
      await expect.poll(async () => JSON.stringify((await bagItems(page))[2].settings.params)).not.toBe(was);
      expect(await hasHorizontalScroll(page)).toBe(false);
    });

    test('a row\'s playground icon opens the playground with that thing picked', async ({ page }) => {
      await openRoute(page, '/');
      const keys = await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.clear();
        return ['knight', 'slime', 'coin'].map((id) => bag.add({ kind: 'sprite', id, settings: { params: {}, cues: null, scale: 1 } })); });
      await openLibrary(page);
      const go = rows(page).nth(1).getByRole('link', { name: `Try ${C.byId.slime.name} in the playground` });
      await expect(go).toHaveAttribute('title', 'Open in the playground');
      expect((await go.textContent()).trim()).toBe('');
      await go.click();
      await page.waitForFunction(() => window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
      await expect(page.locator(`.play-things li[data-key="${keys[1]}"]`)).toHaveClass(/is-picked/);
      await expect(page.locator('.play-inspector')).toContainText(C.byId.slime.name);
      await expect(page).toHaveURL(/#\/play$/);                      // the address is tidied: a reload does not pick it again
    });

    test('Download in the tray saves the whole bag as one package', async ({ page }) => {
      await addKit(page, KIT);
      await openLibrary(page);
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), tray(page).getByRole('button', { name: 'Download' }).click()]);
      expect(download.suggestedFilename()).toBe('loadout-package.zip');
    });

    test('the small live scene draws the bag\'s background, and opens the playground', async ({ page }) => {
      await addKit(page, BIG);
      await openLibrary(page);
      const items = await bagItems(page);
      const backgrounds = items.filter((i) => C.byId[i.id]?.type === 'background').map((i) => i.id);
      expect(backgrounds.length).toBeGreaterThan(0);
      const scene = tray(page).locator('.tray-scene');
      await expect(scene).toBeVisible();
      await expect(scene).toHaveAttribute('data-background', backgrounds[0], { timeout: 30_000 });
      await expect.poll(() => scene.getAttribute('data-standing').then(Number)).toBeGreaterThan(0);
      // painted, with many colours: not an empty box
      const colours = await scene.locator('canvas').evaluate((cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, s = new Set(); for (let i = 0; i < d.length; i += 16) if (d[i + 3]) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return s.size; });
      expect(colours).toBeGreaterThan(12);
      await scene.click();
      await expect(page).toHaveURL(/#\/play$/);
    });
  });
}

test.describe('narrower than 1024', () => {
  test.use({ viewport: { width: 900, height: 700 } });
  test('the library shows no tray; the header\'s Bag stays', async ({ page }) => {
    await addKit(page, KIT);
    await openLibrary(page);
    await expect(tray(page)).toBeHidden();
    await expect(page.locator('header .bag-link')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});

test.describe('asset pages at 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a slim tray: the count, Download, the pictures; the thing on the page is marked; +N more when they do not fit', async ({ page }) => {
    await addKit(page, BIG);
    const items = await bagItems(page);
    const hero = items.find((i) => i.id === 'knight') ?? items.find((i) => i.kind === 'sprite');
    await openRoute(page, `/sprite/${hero.id}`);
    await expect(tray(page)).toBeVisible();
    const box = await tray(page).boundingBox();
    expect(box.width).toBeLessThanOrEqual(110);
    expect(Math.round(box.x + box.width)).toBe(1440);
    await expect(tray(page).locator('.tray-count')).toContainText(String(items.length));
    await expect(tray(page).getByRole('button', { name: 'Download' })).toBeVisible();
    await expect(rows(page)).toHaveCount(items.length);
    const shown = await rows(page).evaluateAll((lis) => lis.filter((li) => li.getBoundingClientRect().height > 0).length);
    expect(shown).toBeGreaterThan(3);
    expect(shown).toBeLessThan(items.length);
    await expect(tray(page).locator('.tray-more')).toHaveText(`+${items.length - shown} more`);
    // the thing on the page is marked
    await expect(tray(page).locator(`li[data-key="${hero.key}"]`)).toHaveAttribute('aria-current', 'true');
    // everything in sight, and the page keeps its no-scroll rule
    const last = await rows(page).evaluateAll((lis) => Math.max(...lis.filter((li) => li.getBoundingClientRect().height > 0).map((li) => li.getBoundingClientRect().bottom)));
    expect(last).toBeLessThanOrEqual(900);
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([1440, 900]);
    // a sound's page too
    const sound = items.filter((i) => i.kind === 'sound').at(-1);
    await openRoute(page, `/sound/${sound.id}`);
    await expect(tray(page)).toBeVisible();
    await expect(tray(page).locator(`li[data-key="${sound.key}"]`)).toHaveAttribute('aria-current', 'true');
    await expect(tray(page).locator(`li[data-key="${sound.key}"]`), 'the thing on the page is in sight, even far down the bag').toBeVisible();
  });

  test('a few things: every picture shows, no "+N more"', async ({ page }) => {
    await addKit(page, 'menu-sounds');      // a pickup and five sounds
    const items = await bagItems(page);
    expect(items.length).toBeLessThanOrEqual(8);
    await openRoute(page, `/sound/${items.find((i) => i.kind === 'sound').id}`);
    await expect(rows(page)).toHaveCount(items.length);
    await expect(tray(page).locator('.tray-more')).toBeHidden();
  });
});

test.describe('asset pages at 1024x768', () => {
  test.use({ viewport: { width: 1024, height: 768 } });
  test('no tray', async ({ page }) => {
    await addKit(page, KIT);
    await openRoute(page, '/sprite/knight');
    await expect(tray(page)).toBeHidden();
  });
});

test.describe('another tab', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the tray follows a change made in a second tab', async ({ page, context }) => {
    await openLibrary(page);
    await expect(rows(page)).toHaveCount(0);
    const other = await context.newPage();
    await other.goto('/index.html#/browse?kind=sprite');
    await other.locator('ul.results > li .card-add').first().click();
    await expect(rows(page)).toHaveCount(1);
    await expect(tray(page).locator('.tray-count')).toContainText('1');
    await other.close();
  });
});
