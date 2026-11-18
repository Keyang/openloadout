// Home page: loads clean, shows every kind of card, search and kind filters work.
// (The finer points of searching and filtering are in browse.spec.mjs.)
import { test, expect, openRoute } from '../helpers/test.mjs';

const shelf = (page) => page.locator('ul.results > li');
const places = (page, kind) => page.locator(`ul.results > li[data-kind="${kind}"]`);
const spriteCards = (page) => page.locator('ul.results a.card[href^="#/sprite/"]');
const soundCards = (page) => page.locator('ul.results .card.sound a[href^="#/sound/"]');
const musicCards = (page) => page.locator('ul.results .card.sound a[href^="#/music/"]');
const kitCards = (page) => page.locator('a.card.kit');
const group = (page, name) => page.getByRole('group', { name, exact: true });
const choices = (page, name) => group(page, name).locator('.fopt');
const kindsOf = (page) => shelf(page).evaluateAll((lis) => [...new Set(lis.map((li) => li.dataset.kind))]);

test.beforeEach(async ({ page }) => { await openRoute(page, '/'); });

test('home loads and shows sprites, sounds, music and kits', async ({ page }) => {
  await expect(page.locator('h1')).toBeVisible();
  expect(await places(page, 'sprite').count()).toBeGreaterThanOrEqual(7);
  expect(await places(page, 'sound').count()).toBeGreaterThanOrEqual(10);
  expect(await places(page, 'music').count()).toBeGreaterThanOrEqual(1);
  expect(await kitCards(page).count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Sprites', 'Sounds', 'Music', 'Bundles', 'Play']);
  // a card is made when its place comes near the screen: one of each kind is really there
  for (const [kind, cards] of [['sprite', spriteCards], ['sound', soundCards], ['music', musicCards]]) {
    await places(page, kind).last().scrollIntoViewIfNeeded();
    await expect(cards(page).last()).toBeVisible();
  }
  await shelf(page).last().scrollIntoViewIfNeeded();
  // by the end every place has its card
  for (const li of await shelf(page).all()) await li.scrollIntoViewIfNeeded();
  await expect(page.locator('ul.results > li > .card-cell')).toHaveCount(await shelf(page).count());
  expect(await spriteCards(page).count()).toBeGreaterThanOrEqual(7);
  expect(await soundCards(page).count()).toBeGreaterThanOrEqual(10);
  expect(await musicCards(page).count()).toBeGreaterThanOrEqual(1);
});

test('the search box narrows the cards and says so when nothing matches', async ({ page }) => {
  const all = await shelf(page).count();
  const search = page.getByRole('searchbox', { name: 'Search' });
  await search.fill('wolf');
  await expect.poll(() => shelf(page).count()).toBeLessThan(all);
  expect(await shelf(page).count()).toBeGreaterThanOrEqual(1);
  await expect(spriteCards(page).filter({ hasText: 'Wolf' })).toHaveCount(1);
  await search.fill('zzzqqq-nothing');
  await expect(shelf(page)).toHaveCount(0);
  await expect(page.locator('.empty')).toBeVisible();
  await search.fill('');
  await expect(shelf(page)).toHaveCount(all);
  await expect(page.locator('.empty')).toBeHidden();
});

test('kind and type choices narrow the shelf, and letting go brings everything back', async ({ page }) => {
  const all = await shelf(page).count();
  const kinds = choices(page, 'Kind');
  expect(await kinds.count()).toBeGreaterThanOrEqual(3);
  await expect(group(page, 'Kind').locator('.fopt[aria-pressed="true"]')).toHaveCount(0);      // nothing chosen: everything shows

  const music = kinds.filter({ hasText: /^Music/ });
  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => shelf(page).count()).toBeLessThan(all);
  expect(await kindsOf(page)).toEqual(['music']);
  expect(await musicCards(page).count()).toBe(await shelf(page).count());
  await music.click();
  await expect(shelf(page)).toHaveCount(all);

  const character = choices(page, 'Type').filter({ hasText: /^Character/ });
  await character.click();
  await expect(character).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => kindsOf(page)).toEqual(['sprite']);
  expect(await shelf(page).count()).toBeGreaterThanOrEqual(1);
  expect(await spriteCards(page).count()).toBe(await shelf(page).count());
  await character.click();
  await expect(shelf(page)).toHaveCount(all);

  // every kind and every type leaves at least one card, and says how many
  for (const name of ['Kind', 'Type']) {
    const more = group(page, name).getByRole('button', { name: /^Show \d+ more$/ });
    if (await more.count()) await more.click();
    const labels = await choices(page, name).locator('.fl').allTextContents();
    expect(labels.length).toBeGreaterThanOrEqual(3);
    for (const label of labels) {
      const one = choices(page, name).filter({ has: page.locator('.fl', { hasText: new RegExp(`^${label}$`) }) });
      const promised = Number(await one.locator('.n').textContent());
      await one.click();
      await expect(one).toHaveAttribute('aria-pressed', 'true');
      await expect(shelf(page), `${name}: ${label}`).toHaveCount(promised);
      expect(promised, `${name}: ${label}`).toBeGreaterThanOrEqual(1);
      await one.click();
      await expect(shelf(page)).toHaveCount(all);
    }
  }
});

test('the browse pages show one type each', async ({ page }) => {
  await openRoute(page, '/sprites');
  await expect.poll(() => kindsOf(page)).toEqual(['sprite']);
  expect(await spriteCards(page).count()).toBeGreaterThanOrEqual(7);
  expect(await soundCards(page).count()).toBe(0);
  await openRoute(page, '/sounds');
  await expect.poll(() => kindsOf(page)).toEqual(['sound']);
  expect(await places(page, 'sound').count()).toBeGreaterThanOrEqual(10);
  expect(await soundCards(page).count()).toBeGreaterThanOrEqual(6);
  expect(await spriteCards(page).count()).toBe(0);
  await openRoute(page, '/music');
  await expect.poll(() => kindsOf(page)).toEqual(['music']);
  expect(await musicCards(page).count()).toBeGreaterThanOrEqual(1);
});
