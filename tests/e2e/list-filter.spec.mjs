// Search and quick filters in the bag's lists (app/list-filter.js): the tray beside the library, the bag page and the
// playground's list. Typing narrows the list by name or type; a type chip shows only that type. Only what is shown
// changes: nothing leaves the bag. A short bag (under 5 things) shows no search at all.
import { test, expect, openRoute } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf } from '../helpers/catalog.mjs';

const C = catalogueOf(readCatalogue());
const SPRITE = (id) => ({ kind: 'sprite', id, settings: { params: {}, cues: null, scale: 1 } });
const ITEMS = [SPRITE('knight'), SPRITE('slime'), SPRITE('coin'), SPRITE('wizard'),
  { kind: 'sound', id: 'coin-pickup', settings: { params: {}, style: null, seed: 1 } },
  { kind: 'music', id: 'battle-theme', settings: { params: {}, style: null } }];
const bagCount = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.count());

async function fill(page, items = ITEMS) {
  await openRoute(page, '/');
  await page.evaluate(async (list) => { const { bag } = await import('/app/bag.js'); bag.clear(); for (const it of list) bag.add(it); }, items);
}

/** The checks every list shares. rows: the visible rows' locator; box: the search box's container. */
async function checks(page, box, visibleNames) {
  const search = box.getByRole('searchbox');
  await expect(search).toBeVisible();
  // text: by name
  await search.fill('sli');
  await expect.poll(() => visibleNames()).toEqual([C.byId.slime.name]);
  // text: by type, and several words all have to match
  await search.fill('character');
  await expect.poll(async () => (await visibleNames()).sort()).toEqual([C.byId.knight.name, C.byId.wizard.name].sort());
  // nothing matches: it says so, with a way back
  await search.fill('zzzz');
  await expect.poll(() => visibleNames()).toEqual([]);
  await expect(box.locator('.list-find-none')).toBeVisible();
  await box.locator('.list-find-none').getByRole('button', { name: 'Show everything' }).click();
  await expect(search).toHaveValue('');
  await expect.poll(async () => (await visibleNames()).length).toBe(ITEMS.length);
  // quick filters: one chip per type in the bag, with how many; All is pressed to begin with
  const chips = box.getByRole('group', { name: 'Show only' });
  await expect(chips.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
  await chips.getByRole('button', { name: /^Character/ }).click();
  await expect(chips.getByRole('button', { name: /^Character/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(chips.getByRole('button', { name: /^Character/ })).toContainText('2');
  await expect.poll(async () => (await visibleNames()).sort()).toEqual([C.byId.knight.name, C.byId.wizard.name].sort());
  // text and chip together
  await search.fill('wiz');
  await expect.poll(() => visibleNames()).toEqual([C.byId.wizard.name]);
  // Escape clears the text; All shows everything again
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await chips.getByRole('button', { name: /^Music/ }).click();
  await expect.poll(() => visibleNames()).toEqual([C.byId['battle-theme'].name]);
  await chips.getByRole('button', { name: /^All/ }).click();
  await expect.poll(async () => (await visibleNames()).length).toBe(ITEMS.length);
  expect(await bagCount(page)).toBe(ITEMS.length);      // filtering never takes anything out of the bag
}

test.describe('the tray beside the library', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('search and quick filters narrow the tray\'s list', async ({ page }) => {
    await fill(page);
    await openRoute(page, '/browse');
    const tray = page.locator('aside.tray');
    await expect(tray.locator('.tray-list > li[data-key]')).toHaveCount(ITEMS.length);
    await checks(page, tray.locator('.list-find'), () => tray.locator('.tray-list > li[data-key]:visible .tray-name').allTextContents());
  });
});

test('search and quick filters narrow the bag page\'s list', async ({ page }) => {
  await fill(page);
  await openRoute(page, '/bag');
  await expect(page.locator('.bag-item')).toHaveCount(ITEMS.length);
  await checks(page, page.locator('.bag-page .list-find'), () => page.locator('.bag-item:visible .bag-name').allTextContents());
});

test('search and quick filters narrow the playground\'s list, and a section left empty is hidden', async ({ page }) => {
  await fill(page);
  await page.goto('/index.html#/play');
  await page.waitForFunction(() => window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
  const list = page.locator('.play-list');
  await checks(page, list.locator('.list-find'), () => list.locator('.play-row[data-key]:visible .play-name').allTextContents());
  await list.getByRole('searchbox').fill('slime');
  await expect(list.locator('section.play-music')).toBeHidden();
  await expect(list.locator('section.play-board')).toBeHidden();
  // the filter stays when the scene is built again (a change in the bag)
  await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.add({ kind: 'sprite', id: 'blast-door', settings: { params: {}, cues: null, scale: 1 } }); });
  await page.waitForFunction(() => window.__loadoutPlay.ready && document.querySelectorAll('.play-row[data-key]').length >= 7);
  await expect(list.getByRole('searchbox')).toHaveValue('slime');
  await expect.poll(() => list.locator('.play-row[data-key]:visible .play-name').allTextContents()).toEqual([C.byId.slime.name]);
});

test('a short bag shows no search', async ({ page }) => {
  await fill(page, ITEMS.slice(0, 3));
  await openRoute(page, '/bag');
  await expect(page.locator('.bag-item')).toHaveCount(3);
  await expect(page.locator('.list-find')).toBeHidden();
});
