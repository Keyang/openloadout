// Home page: loads clean, shows every kind of card, search and kind filters work.
// (The finer points of searching and filtering are in browse.spec.mjs.)
// Nothing here depends on how many assets the library has or on their order: numbers come from the
// catalogue file, and a card is brought on screen before it is looked at (cards are made only near the screen).
import fs from 'node:fs';
import { test, expect, openRoute } from '../helpers/test.mjs';

const CATALOG = () => JSON.parse(fs.readFileSync(new URL('../../generated/catalog.json', import.meta.url), 'utf8'));
const count = (kind) => CATALOG().assets.filter((a) => a.kind === kind).length;

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
  for (const kind of ['sprite', 'sound', 'music']) {
    expect(count(kind), `the library has at least one ${kind}`).toBeGreaterThanOrEqual(1);
    await expect(places(page, kind)).toHaveCount(count(kind));
  }
  await expect(kitCards(page)).toHaveCount(CATALOG().bundles.filter((b) => b.level === 'kit').length);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Library', 'Kits', 'Play']);
  // a card is made when its place comes near the screen: the last of each kind is really there once scrolled to
  for (const [kind, cards] of [['sprite', spriteCards], ['sound', soundCards], ['music', musicCards]]) {
    const last = places(page, kind).last();
    await last.scrollIntoViewIfNeeded();
    await expect(last.locator('.card').first()).toBeVisible();
    expect(await cards(page).count()).toBeGreaterThanOrEqual(1);
  }
  // walking down the whole page, every place gets its card, of the right kind
  for (const li of await shelf(page).all()) await li.scrollIntoViewIfNeeded();
  await expect(page.locator('ul.results > li > .card-cell')).toHaveCount(await shelf(page).count());
  expect(await spriteCards(page).count()).toBe(count('sprite'));
  expect(await soundCards(page).count()).toBe(count('sound'));
  expect(await musicCards(page).count()).toBe(count('music'));
});

test('the search box narrows the cards and says so when nothing matches', async ({ page }) => {
  const all = await shelf(page).count();
  const search = page.getByRole('searchbox', { name: 'Search' });
  const sprite = CATALOG().assets.filter((a) => a.kind === 'sprite').at(-1);         // the last sprite: far down the page
  await search.fill(sprite.name);
  await expect.poll(() => shelf(page).count()).toBeLessThan(all);
  const place = page.locator(`ul.results > li[data-id="${sprite.id}"]`);
  await expect(place).toHaveCount(1);
  await place.scrollIntoViewIfNeeded();
  await expect(place.locator(`a.card[href="#/sprite/${sprite.id}"]`)).toContainText(sprite.name);
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
  await expect(musicCards(page).first()).toBeVisible();
  expect(await page.locator('ul.results .card').count()).toBe(await musicCards(page).count());      // every card made is a music card
  await music.click();
  await expect(shelf(page)).toHaveCount(all);

  const character = choices(page, 'Type').filter({ hasText: /^Character/ });
  await character.click();
  await expect(character).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => kindsOf(page)).toEqual(['sprite']);
  expect(await shelf(page).count()).toBeGreaterThanOrEqual(1);
  await expect(spriteCards(page).first()).toBeVisible();
  expect(await page.locator('ul.results .card').count()).toBe(await spriteCards(page).count());     // every card made is a sprite card
  await character.click();
  await expect(shelf(page)).toHaveCount(all);

  // every kind and every type leaves at least one card, and says how many
  for (const name of ['Kind', 'Type']) {
    const more = group(page, name).getByRole('button', { name: /^Show \d+ more$/ });
    if (await more.count()) await more.click();
    const labels = await choices(page, name).locator('.fl').allTextContents();
    expect(labels.length).toBeGreaterThanOrEqual(3);
    for (const label of labels) {
      const one = choices(page, name).filter({ has: page.locator('.fl', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
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
  for (const [route, kind, cards] of [['/sprites', 'sprite', spriteCards], ['/sounds', 'sound', soundCards], ['/music', 'music', musicCards]]) {
    await openRoute(page, route);
    await expect.poll(() => kindsOf(page)).toEqual([kind]);
    await expect(shelf(page)).toHaveCount(count(kind));
    await expect(cards(page).first()).toBeVisible();
    // every card that has been made is of this kind
    expect(await page.locator('ul.results .card').count()).toBe(await cards(page).count());
  }
});
