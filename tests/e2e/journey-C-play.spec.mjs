// Journey J5 (docs/user-journeys.md, "Change an item from inside the playground"): the fixes for the testers'
// "Playground and kits" defects in the playground's panel.
//   J5.2  the panel never scrolls inside itself and no row of options is cut off, at 1440 x 900 and 1024 x 768
//   J5.4  the look of the whole bag is its own control, outside the chosen thing's panel, and says it is for the whole bag
//   J5.2  a thing that wears a look of its own says so beside its colours ("Shown in the Night look")
//   J5.2  a colour picked in the panel shows on the sprite in the scene within 1 s
// Run with: npx playwright test tests/e2e/journey-C-play.spec.mjs
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, canvasStats } from '../helpers/test.mjs';
import { ROOT } from '../helpers/catalog.mjs';

const LINK = fs.readFileSync(path.join(ROOT, 'tests/fixtures/journeys/bag-link.txt'), 'utf8').trim();
const side = (page) => page.locator('.play-side');
const panel = (page) => side(page).locator('.rx-panel');
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());

async function openPlay(page, extra = []) {
  await page.goto('/index.html' + LINK);
  await expect(page.locator('header .bag-count')).toHaveText('3', { timeout: 30_000 });
  if (extra.length) await page.evaluate(async (list) => { const { bag } = await import('/app/bag.js'); for (const it of list) bag.add(it); }, extra);
  await page.goto('/index.html#/play');
  await page.waitForFunction(() => window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
}
const choose = (page, id) => page.evaluate(async (want) => { const { bag } = await import('/app/bag.js'); window.__loadoutPlay.choose(bag.items().find((i) => i.id === want).key); }, id);

/** Every pane of the open panel, shown in turn: does it or the panel scroll inside itself, and is any row of chips cut? */
async function tidyPanes(page) {
  const out = [];
  for (const tab of await panel(page).getByRole('tab').all()) {
    await tab.click();
    const name = await tab.getAttribute('data-tab');
    out.push(await side(page).evaluate((s, tabName) => {
      const pane = s.querySelector('.pane:not([hidden])');
      const scrolls = (n) => n && n.scrollHeight > n.clientHeight + 1 && getComputedStyle(n).overflowY !== 'visible';
      const cut = [...pane.querySelectorAll('.chips, .swatches')].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.getAttribute('aria-label'));
      const inner = [s, ...s.querySelectorAll('*')].filter((n) => scrolls(n) && getComputedStyle(n).overflowY !== 'hidden').map((n) => n.className);
      return { tab: tabName, inner, cut };
    }, name));
  }
  return out;
}

for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
  test(`J5.2 ${size.width} x ${size.height}: the panel does not scroll inside itself and no chips are cut`, async ({ page }) => {
    await page.setViewportSize(size);
    await openPlay(page, [{ kind: 'sprite', id: 'slime', settings: {} }]);
    for (const id of ['knight', 'slime', 'coin-pickup', 'battle-theme']) {
      await choose(page, id);
      for (const r of await tidyPanes(page)) {
        expect(r.inner, `${id}, ${r.tab}: nothing scrolls inside the panel`).toEqual([]);
        expect(r.cut, `${id}, ${r.tab}: no row of options is cut`).toEqual([]);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
}

test('J5.4: the look of the whole bag is its own control, outside the chosen thing\'s panel', async ({ page }) => {
  await openPlay(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  // the chosen thing's own tabs do not hold it
  await expect(panel(page).getByRole('tab', { name: 'Everything' })).toHaveCount(0);
  const open = side(page).getByRole('button', { name: /whole bag/i });
  await expect(open).toBeVisible();
  expect(await open.evaluate((n) => !n.closest('.rx-panel')), 'outside the thing\'s own panel').toBe(true);
  const plain = (await canvasStats(page.locator('canvas.play-stage'))).hash;
  await open.click();
  const look = side(page).locator('.play-look');
  await expect(look).toBeVisible();
  await expect(look.getByRole('heading').first()).toContainText(/whole bag/i);
  await look.getByRole('button', { name: 'Frost', exact: true }).click();
  await expect.poll(async () => (await canvasStats(page.locator('canvas.play-stage'))).hash).not.toBe(plain);
  expect(await page.evaluate(async () => (await import('/app/bag.js')).bag.theme().colour.palette)).toBe('Frost');
  // still open after the scene takes the look; and the way back to the thing
  await expect(look).toBeVisible();
  await side(page).getByRole('button', { name: /^Back to/ }).click();
  await expect(panel(page)).toBeVisible();
  await expect(look).toBeHidden();
});

test('J5.2: a thing with a look of its own says so beside its colours', async ({ page }) => {
  await openPlay(page);
  const hero = (await bagItems(page)).find((i) => i.id === 'knight');
  expect(hero.settings.look).toBe('night');
  await choose(page, 'knight');
  await panel(page).getByRole('tab', { name: /^Colours/ }).click();
  await expect(side(page).locator('[data-pane="colours"] .play-own-look')).toContainText('Shown in the Night look');
  // follows the bag again: the note goes
  await panel(page).getByRole('tab', { name: /^Look/ }).click();
  await panel(page).getByRole('button', { name: 'Follows the bag' }).click();
  await panel(page).getByRole('tab', { name: /^Colours/ }).click();
  await expect(side(page).locator('[data-pane="colours"] .play-own-look')).toBeHidden();
});

test('J5.2: a colour picked in the panel shows in the scene within 1 s', async ({ page }) => {
  await openPlay(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await choose(page, 'knight');
  await panel(page).getByRole('tab', { name: /^Colours/ }).click();
  const before = (await canvasStats(page.locator('canvas.play-stage'))).hash;
  const swatch = side(page).locator('[data-pane="colours"] .swatches').first().locator('button.swatch:not([aria-pressed="true"])').last();
  const t0 = Date.now();
  await swatch.click();
  await expect.poll(async () => (await canvasStats(page.locator('canvas.play-stage'))).hash, { timeout: 1000, intervals: [50] }).not.toBe(before);
  expect(Date.now() - t0).toBeLessThan(1500);
});
