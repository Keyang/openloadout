// Build item R1 (docs/data-sprites.md section 5): a saved version 1 studio draft that used a library body (a code rig
// with a data layer, removed) still opens: the studio's first page lists it with a note, #/studio/<draft> shows the note
// instead of "That draft is not here" or a crash, nothing in it is changed, and it can be downloaded or removed. The
// seed is tests/fixtures/studio/waving-hero.json, a draft the Hero preset made. No page error, no sideways scroll at
// 375 px.
// The page is served from STUDIO_BASE_URL (default http://localhost:5199, the shared test server).
import fs from 'node:fs';
import { test, expect, hasHorizontalScroll } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

const HERO = JSON.parse(fs.readFileSync(new URL('../fixtures/studio/waving-hero.json', import.meta.url), 'utf8'));
const NOTE = /This draft used a library body, which is gone: open the library sprite and edit a copy\./;

/** Seed the browser's saved drafts with the draft of a library body (and, beside it, an ordinary one), before the page's own code runs. */
async function seed(page, drafts) {
  await page.addInitScript(([key, text]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, text); sessionStorage.setItem('seeded', '1'); } }, ['loadout-studio-v1', JSON.stringify({ version: 1, drafts })]);
}

test('the first page lists the draft with the note; it can be downloaded and removed, and nothing else is lost', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, { 'sir-wave': { definition: HERO, savedAt: 5 } });
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  const card = page.locator('[data-gone-draft="sir-wave"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Waving hero');
  await expect(card.locator('[data-note="library-body-gone"]')).toHaveText(NOTE);
  await expect(page.locator('.st-broken')).toHaveCount(0);        // not counted as damage
  await expect(page.getByRole('button', { name: 'Make a new one' })).toBeEnabled();
  await expect(card.locator('[data-act="open-library-sprite"]')).toHaveAttribute('href', '#/sprite/knight');
  // what is saved is untouched
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts['sir-wave'].definition.body.library)).toBe('humanoid');
  const download = page.waitForEvent('download');
  await card.locator('[data-act="download-gone"]').click();
  expect((await download).suggestedFilename()).toBe('sir-wave.json');
  await card.locator('[data-act="remove-gone"]').click();
  await expect(page.locator('[data-gone-draft="sir-wave"]')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts))).toEqual([]);
  expect(errors).toEqual([]);
});

test('its own address shows the note, not "That draft is not here", and says where to go', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, { 'sir-wave': { definition: HERO, savedAt: 5 } });
  await page.goto('/index.html#/studio/sir-wave', { waitUntil: 'domcontentloaded' });
  const main = page.locator('main[data-gone-draft="sir-wave"]');
  await expect(main).toBeVisible();
  await expect(main.locator('[data-note="library-body-gone"]')).toHaveText(NOTE);
  await expect(page.getByText('That draft is not here')).toHaveCount(0);
  await expect(main.getByRole('link', { name: 'Open knight in the library' })).toHaveAttribute('href', '#/sprite/knight');
  await expect(main.getByRole('link', { name: 'Go to the studio' })).toBeVisible();
  await main.locator('[data-act="remove-gone"]').click();
  await expect(page).toHaveURL(/#\/studio$/);
  expect(errors).toEqual([]);
});

test('at phone width the note and its buttons fit and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, { 'sir-wave': { definition: HERO, savedAt: 5 } });
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-gone-draft="sir-wave"]')).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.goto('/index.html#/studio/sir-wave', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main[data-gone-draft="sir-wave"]')).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test('an ordinary draft beside it still opens and the library sprite page is where the note points', async ({ page }) => {
  const ordinary = JSON.parse(fs.readFileSync(new URL('../fixtures/studio/newt.json', import.meta.url), 'utf8'));
  await seed(page, { 'sir-wave': { definition: HERO, savedAt: 5 }, 'moss-newt': { definition: ordinary, savedAt: 9 } });
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.st-draft-pic[href="#/studio/moss-newt"]')).toBeVisible();
  await page.goto('/index.html#/studio/moss-newt', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.v2.rx.studio')).toBeVisible();
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-gone-draft="sir-wave"] [data-act="open-library-sprite"]').click();
  await expect(page).toHaveURL(/#\/sprite\/knight/);
});
