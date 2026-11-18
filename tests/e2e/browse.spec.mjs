// Finding things (W2-A; features FIND-2 to FIND-7): the site starts from the catalogue, cards cost nothing
// until looked at, and the home page and #/browse search and filter everything.
// Run with: npx playwright test tests/e2e/browse.spec.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test as plain } from '@playwright/test';
import { test, expect, openRoute, waitForDrawn, canvasStats, hasHorizontalScroll, quietNetwork } from '../helpers/test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GENERATED = path.join(ROOT, 'generated');
const STAND_IN_SRC = path.join(ROOT, 'tests', 'fixtures', 'search', 'catalog.json');
const STAND_IN_DIR = path.join(ROOT, 'tests', 'fixtures', 'browse');
const STAND_IN = 'tests/fixtures/browse/catalog.json';
let CATALOG = null, BIG = null, SMART_MB = 0;

/** Write a file in one step, so two test workers preparing it at once never read half of it. */
function writeOnce(file, make) {
  if (fs.existsSync(file) && fs.statSync(file).mtimeMs >= fs.statSync(STAND_IN_SRC).mtimeMs) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  return Promise.resolve(make(tmp)).then(() => fs.renameSync(tmp, file));
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  if (!['catalog.json', 'sounds.json', 'search.sqlite'].every((f) => fs.existsSync(path.join(GENERATED, f))) || !fs.existsSync(path.join(ROOT, 'vendor', 'sqlite'))) {
    execFileSync('node', ['tools/build.mjs', '--skip-quality'], { cwd: ROOT, stdio: 'ignore' });
  }
  CATALOG = JSON.parse(fs.readFileSync(path.join(GENERATED, 'catalog.json'), 'utf8'));
  // what switching smarter search on downloads, as the build's own list of vendor files states it
  const vendor = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'manifest.json'), 'utf8'));
  SMART_MB = Math.round(vendor.files.filter((f) => /^(transformers|ort|models)\//.test(f.to)).reduce((n, f) => n + f.bytes, 0) / 1e6);
  // the 490-entry stand-in catalogue (no art exists for it) and a keyword search file for it
  BIG = JSON.parse(fs.readFileSync(STAND_IN_SRC, 'utf8'));
  await writeOnce(path.join(STAND_IN_DIR, 'catalog.json'), (tmp) => fs.copyFileSync(STAND_IN_SRC, tmp));
  const { buildSearchIndex } = await import('../../tools/lib/search-index.mjs');
  await writeOnce(path.join(STAND_IN_DIR, 'generated', 'search.sqlite'), (tmp) => buildSearchIndex({ assets: BIG.assets, outFile: tmp }));
});

const box = (page) => page.getByRole('searchbox', { name: 'Search' });
const results = (page) => page.locator('ul.results > li');
const resultIds = (page) => results(page).evaluateAll((lis) => lis.map((li) => li.dataset.id));
const line = (page) => page.locator('.result-line');
const group = (page, name) => page.getByRole('group', { name, exact: true });
const option = (page, groupName, label) => group(page, groupName).getByRole('button', { name: new RegExp(`^${label}\\b`) });
const countOf = async (button) => Number((await button.locator('.n').textContent()).trim());
const chip = (page, label) => page.locator('.chips .chip').filter({ hasText: label });
const bagCount = (page) => page.locator('header .bag-count');
const hash = (page) => page.evaluate(() => location.hash);
const pathOf = (url) => new URL(url).pathname;

// ---- start-up ----------------------------------------------------------------------------

test('home loads from the catalogue: no errors, and no sprite program is requested', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await openRoute(page, '/');
  await expect(results(page)).toHaveCount(CATALOG.assets.length);
  await expect(page.locator('ul.results a.card[href^="#/sprite/"]').first()).toBeVisible();
  // the first thumbnails have arrived
  await expect.poll(() => page.locator('ul.results img.thumb').first().evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await page.waitForLoadState('networkidle');
  expect(asked.filter((p) => p.startsWith('/sprites/')), 'files under sprites/').toEqual([]);
  expect(asked.filter((p) => p.startsWith('/kits/')), 'files under kits/').toEqual([]);
  expect(asked.filter((p) => /^\/sounds\/.+\.json$/.test(p)), 'one request per sound').toEqual([]);
  expect(asked).toContain('/generated/catalog.json');
  expect(asked.filter((p) => p === '/generated/sounds.json').length).toBeLessThanOrEqual(1);
});

test('home shows the search first, then game kits, then everything', async ({ page }) => {
  await openRoute(page, '/');
  await expect(page.locator('h1')).toBeVisible();
  const search = box(page);
  await expect(search).toBeVisible();
  const examples = page.getByRole('group', { name: 'Example searches' }).getByRole('button');
  expect(await examples.count()).toBeGreaterThanOrEqual(3);
  const kitsHeading = page.getByRole('heading', { name: 'Start from a kind of game' });
  await expect(kitsHeading).toBeVisible();
  const kits = CATALOG.bundles.filter((b) => b.level === 'kit');
  await expect(page.locator('a.card.kit')).toHaveCount(kits.length);
  for (const b of kits) await expect(page.locator(`a.card.kit[href="#/bundle/${b.id}"]`)).toContainText(b.name);
  // top to bottom: search, kits, results
  const y = async (loc) => (await loc.boundingBox()).y;
  expect(await y(search)).toBeLessThan(await y(kitsHeading));
  expect(await y(kitsHeading)).toBeLessThan(await y(line(page)));
  await expect(line(page)).toHaveText(`${CATALOG.assets.length} results`);

  // an example search fills the box and narrows the results
  await examples.first().click();
  await expect(search).not.toHaveValue('');
  await expect.poll(() => results(page).count()).toBeLessThan(CATALOG.assets.length);
  expect(await results(page).count()).toBeGreaterThanOrEqual(1);
});

plain('a site that cannot load its list of assets says so to the visitor, in plain words', async ({ page }) => {
  await quietNetwork(page);
  await page.route('**/generated/catalog.json', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  const said = [];
  page.on('console', (m) => said.push(m.text()));
  await page.goto('/index.html#/');
  // the page speaks to a visitor; the hint for whoever runs the site is in the console only
  await expect(page.locator('main')).toContainText('This page could not load its list of assets. Please try again later.');
  await expect(page.locator('main')).not.toContainText(/npm|build|catalog/i);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(said.some((t) => t.includes('npm run build'))).toBe(true);
});

// ---- search ------------------------------------------------------------------------------

test('typing "money" puts the coin sprite and the coin pickup sound near the top', async ({ page }) => {
  await openRoute(page, '/');
  await box(page).pressSequentially('money', { delay: 20 });
  await expect.poll(() => results(page).count()).toBeLessThan(CATALOG.assets.length);
  const top = (await resultIds(page)).slice(0, 4);
  expect(top).toContain('coin');
  expect(top).toContain('coin-pickup');
  await expect(line(page)).toContainText('for "money"');
  // both kinds of card are there to press
  await expect(page.locator('ul.results a.card[href="#/sprite/coin"]')).toBeVisible();
  await expect(page.locator('ul.results .card.sound a[href="#/sound/coin-pickup"]')).toBeVisible();
});

test('a misspelling still finds the Hero', async ({ page }) => {
  await openRoute(page, '/browse');
  await box(page).fill('herro');
  await expect.poll(async () => (await resultIds(page)).slice(0, 3)).toContain('knight');
  await box(page).fill('knigt');
  await expect.poll(async () => (await resultIds(page))[0]).toBe('knight');
  await expect(page.locator('ul.results a.card[href="#/sprite/knight"]')).toContainText('Hero');
});

test('when nothing matches the page says so and what to try; junk input is handled the same way', async ({ page }) => {
  await openRoute(page, '/browse');
  const all = await results(page).count();
  for (const junk of ['zzzqqq-nothing', '???', '  !!  ']) {
    await box(page).fill(junk);
    await expect(results(page)).toHaveCount(0);
    await expect(page.locator('.empty')).toBeVisible();
    await expect(page.locator('.empty')).toContainText(/try/i);
    await expect(line(page)).toContainText('Nothing matches');
  }
  await page.locator('.empty').getByRole('button', { name: 'Clear the search' }).click();
  await expect(box(page)).toHaveValue('');
  await expect(results(page)).toHaveCount(all);
  await expect(page.locator('.empty')).toBeHidden();
});

test('the search box takes exactly as much as is searched: 120 characters, typed, pasted or put in', async ({ page }) => {
  await openRoute(page, '/browse');
  const search = box(page);
  await expect(search).toHaveAttribute('maxlength', '120');
  const long = 'sword '.repeat(50);                     // 300 characters
  await search.fill(long);                              // put in all at once
  await expect(search).toHaveValue(long.slice(0, 120));
  const typedQ = () => page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] || '').get('q'));
  await expect.poll(typedQ).toBe(long.slice(0, 120));     // the address holds the same 120 characters
  expect((await resultIds(page))).toContain('sword-slash');
  const before = await resultIds(page);

  // a reload shows the same text and the same results: nothing was dropped out of sight
  await page.reload();
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue(long.slice(0, 120));
  await expect.poll(() => resultIds(page)).toEqual(before);

  // typing past the limit goes nowhere
  await box(page).fill('');
  await box(page).pressSequentially('z'.repeat(125));
  await expect(box(page)).toHaveValue('z'.repeat(120));
  // a link with a longer search is cut to the same length, and the box shows what is searched
  await openRoute(page, `/browse?q=${'coin '.repeat(40).trim().replace(/ /g, '+')}`);
  expect((await box(page).inputValue()).length).toBe(120);
  expect(await resultIds(page)).toContain('coin');
});

test('Back from a search started on the front page returns to the front page as it was', async ({ page }) => {
  await openRoute(page, '/bundles');
  await page.locator('a.brand').click();
  await waitForDrawn(page);
  const all = await results(page).count();
  await expect(page.getByRole('heading', { name: 'Start from a kind of game' })).toBeVisible();

  await box(page).pressSequentially('fire', { delay: 10 });
  await expect.poll(() => hash(page)).toBe('#/browse?q=fire');
  await option(page, 'Kind', 'Sounds').click();
  await expect.poll(() => hash(page)).toBe('#/browse?q=fire&kind=sound');
  await expect(page.getByRole('heading', { name: 'Start from a kind of game' })).toBeHidden();

  await page.goBack();                                   // one step back, however much was typed and filtered
  await expect.poll(() => hash(page)).toBe('#/');
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Start from a kind of game' })).toBeVisible();
  await expect(results(page)).toHaveCount(all);
  await expect(page.locator('.chips .chip')).toHaveCount(0);

  await page.goBack();                                   // and the page before the front page is still there
  await expect.poll(() => hash(page)).toBe('#/bundles');
  await page.goForward();
  await page.goForward();                                // forward again: the search, on the results page
  await expect.poll(() => hash(page)).toBe('#/browse?q=fire&kind=sound');
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue('fire');
  await expect(option(page, 'Kind', 'Sounds')).toHaveAttribute('aria-pressed', 'true');
});

test('a keyboard user can skip the choices and go straight to the results', async ({ page }) => {
  await openRoute(page, '/browse');
  const skip = page.getByRole('button', { name: 'Skip to results' });
  await box(page).focus();
  // after the search box and its switch, the next stop is the skip link, before any filter choice
  await page.keyboard.press('Tab');
  await expect(page.getByRole('switch', { name: 'Smarter search' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  const firstChoice = await option(page, 'Kind', 'Sprites').boundingBox();
  expect((await skip.boundingBox()).y).toBeLessThan(firstChoice.y);
  await page.keyboard.press('Enter');
  const inResults = await page.evaluate(() => !!document.activeElement.closest('ul.results'));
  expect(inResults).toBe(true);
  await expect(page.locator('ul.results > li').first().locator('a, button').first()).toBeFocused();
});

// ---- filters -----------------------------------------------------------------------------

test('choosing a kind and a type narrows the results, and the numbers next to the choices follow', async ({ page }) => {
  await openRoute(page, '/browse');
  const total = CATALOG.assets.length;
  const sounds = CATALOG.assets.filter((a) => a.kind === 'sound');
  const ambience = sounds.filter((a) => a.type === 'ambience');
  await expect(results(page)).toHaveCount(total);
  expect(await countOf(option(page, 'Kind', 'Sounds'))).toBe(sounds.length);
  expect(await countOf(option(page, 'Kind', 'Sprites'))).toBe(CATALOG.assets.filter((a) => a.kind === 'sprite').length);
  const typesBefore = await group(page, 'Type').locator('.fopt').count();

  await option(page, 'Kind', 'Sounds').click();
  await expect(option(page, 'Kind', 'Sounds')).toHaveAttribute('aria-pressed', 'true');
  await expect(results(page)).toHaveCount(sounds.length);
  await expect(line(page)).toHaveText(`${sounds.length} results`);
  // the types on offer are now only the ones sounds have
  expect(await group(page, 'Type').locator('.fopt').count()).toBeLessThan(typesBefore);
  await expect(option(page, 'Type', 'Character')).toHaveCount(0);

  await option(page, 'Type', 'Background loop').click();
  await expect(results(page)).toHaveCount(ambience.length);
  for (const id of await resultIds(page)) expect(ambience.map((a) => a.id)).toContain(id);
  // other groups count what is left: only themes of background loops
  const themeCount = await countOf(group(page, 'Theme').locator('.fopt').first());
  expect(themeCount).toBeLessThanOrEqual(ambience.length);
  // a kind's own number does not shrink because of the kind filter itself, but it does follow the type
  expect(await countOf(option(page, 'Kind', 'Sounds'))).toBe(ambience.length);

  // pressing a chosen value again lets go of it
  await option(page, 'Type', 'Background loop').click();
  await expect(results(page)).toHaveCount(sounds.length);
  await chip(page, 'Sounds').getByRole('button').click();
  await expect(results(page)).toHaveCount(total);
});

test('the "used for" tree opens a branch and narrows to one use', async ({ page }) => {
  await openRoute(page, '/browse');
  const characters = CATALOG.assets.filter((a) => a.role.startsWith('characters/'));
  const players = characters.filter((a) => a.role === 'characters/player');
  await option(page, 'Used for', 'Characters').click();
  await expect(results(page)).toHaveCount(characters.length);
  // sprites and sounds for characters sit together
  const kinds = await results(page).evaluateAll((lis) => [...new Set(lis.map((li) => li.dataset.kind))]);
  expect(kinds).toContain('sprite');
  expect(kinds).toContain('sound');
  await option(page, 'Used for', 'Player').click();
  await expect(results(page)).toHaveCount(players.length);
  expect(await hash(page)).toContain('role=characters%2Fplayer');
});

test('the address bar holds the search and filters, so a reload or a copied link shows the same results', async ({ page }) => {
  await openRoute(page, '/');
  await box(page).fill('fire');
  await option(page, 'Kind', 'Sounds').click();
  await expect.poll(() => hash(page)).toBe('#/browse?q=fire&kind=sound');
  const before = await resultIds(page);
  expect(before.length).toBeGreaterThanOrEqual(1);

  await page.reload();
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue('fire');
  await expect(option(page, 'Kind', 'Sounds')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => resultIds(page)).toEqual(before);

  // a link written by hand works too
  await openRoute(page, '/browse?kind=sprite&theme=forest');
  const want = CATALOG.assets.filter((a) => a.kind === 'sprite' && a.themes.includes('forest')).map((a) => a.id);
  await expect.poll(async () => (await resultIds(page)).sort()).toEqual(want.sort());
  await expect(chip(page, 'Forest')).toBeVisible();
});

test('old addresses still work', async ({ page }) => {
  await openRoute(page, '/sprites');
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sprite');
  await expect(results(page)).toHaveCount(CATALOG.assets.filter((a) => a.kind === 'sprite').length);
  await openRoute(page, '/sounds');
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sound');
  await openRoute(page, '/knight');
  await expect(page.locator('canvas.stage')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Hero');
});

// ---- the style filter that stays --------------------------------------------------------------

test('a style chosen on the home page stays after visiting a sprite page, and can be removed', async ({ page }) => {
  await openRoute(page, '/');
  const all = await results(page).count();
  const notSide = CATALOG.assets.filter((a) => a.kind === 'sprite' && a.view !== 'side' && a.view !== 'none');
  expect(notSide.length, 'the catalogue has a sprite that is not side view').toBeGreaterThanOrEqual(1);

  // the number next to a view is the number of results choosing it gives: its sprites and everything that has no view
  await expect(group(page, 'View')).toContainText('Sounds and music have no view, so they always stay.');
  const promised = {};
  for (const label of ['Side view', 'Front view']) promised[label] = await countOf(option(page, 'View', label));
  expect(promised['Side view']).toBe(all - notSide.length);
  await option(page, 'View', 'Front view').click();
  await expect(results(page)).toHaveCount(promised['Front view']);
  expect(await countOf(option(page, 'View', 'Front view'))).toBe(promised['Front view']);
  await option(page, 'View', 'Side view').click();
  await expect(results(page)).toHaveCount(promised['Side view']);
  expect(await countOf(option(page, 'View', 'Side view'))).toBe(promised['Side view']);
  await expect(chip(page, 'Side view')).toBeVisible();
  // a remembered style hides some assets, so the heading no longer says "Everything"
  await expect(page.getByRole('heading', { name: 'Everything that fits your game' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Everything', exact: true })).toHaveCount(0);
  // sounds have no view, so they stay
  expect((await resultIds(page))).toContain('coin-pickup');
  expect((await resultIds(page))).not.toContain(notSide[0].id);

  // go and look at a sprite, then come back to the front page
  await page.locator('ul.results a.card[href="#/sprite/knight"]').click();
  await expect(page.locator('canvas.stage')).toBeVisible();
  await page.locator('a.brand').click();
  await waitForDrawn(page);
  await expect(chip(page, 'Side view')).toBeVisible();
  await expect(option(page, 'View', 'Side view')).toHaveAttribute('aria-pressed', 'true');
  await expect(results(page)).toHaveCount(all - notSide.length);

  // it is also there on the results page and after a reload (a later visit)
  await openRoute(page, '/browse?kind=sprite');
  await expect(chip(page, 'Side view')).toBeVisible();
  expect(await resultIds(page)).not.toContain(notSide[0].id);
  await page.reload();
  await waitForDrawn(page);
  await expect(chip(page, 'Side view')).toBeVisible();

  // removing the chip brings the other views back, and it stays removed
  await chip(page, 'Side view').getByRole('button').click();
  await expect(chip(page, 'Side view')).toHaveCount(0);
  expect(await resultIds(page)).toContain(notSide[0].id);
  await openRoute(page, '/');
  await expect(results(page)).toHaveCount(all);
  await expect(page.locator('.chips .chip')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Everything', exact: true })).toBeVisible();
});

test('the numbers next to the views follow a search and the other filters', async ({ page }) => {
  await openRoute(page, '/browse?q=coin');
  const views = group(page, 'View').locator('.fopt');
  expect(await views.count()).toBeGreaterThanOrEqual(1);
  for (const label of await views.locator('.fl').allTextContents()) {
    const promised = await countOf(option(page, 'View', label));
    await option(page, 'View', label).click();
    await expect(results(page), label).toHaveCount(promised);
    await option(page, 'View', label).click();
  }
  // with only sounds showing no view is on offer: nothing a view could narrow
  await option(page, 'Kind', 'Sounds').click();
  await expect(group(page, 'View')).toHaveCount(0);
});

test('a game type is kept the same way', async ({ page }) => {
  await openRoute(page, '/browse');
  const arcade = CATALOG.assets.filter((a) => a.gameTypes.includes('arcade'));
  // long lists show their first few choices; the rest are one press away
  await group(page, 'Game type').getByRole('button', { name: /^Show \d+ more$/ }).click();
  await option(page, 'Game type', 'Arcade').click();
  await expect(results(page)).toHaveCount(arcade.length);
  await openRoute(page, '/bag');
  await openRoute(page, '/');
  await expect(chip(page, 'Arcade')).toBeVisible();
  await expect(results(page)).toHaveCount(arcade.length);
});

// ---- cards -------------------------------------------------------------------------------

test('pressing a sound card plays it, loading just that sound', async ({ page }) => {
  const long = CATALOG.assets.filter((a) => a.kind === 'sound').sort((a, b) => b.tech.seconds - a.tech.seconds)[0];
  await openRoute(page, `/browse?q=${encodeURIComponent(long.name)}&kind=sound`);
  const card = page.locator(`ul.results li[data-id="${long.id}"]`);
  const play = card.getByRole('button', { name: `Play ${long.name}` });
  await expect(play).toBeVisible();
  // the waveform picture is the catalogue's thumbnail, on a light tile
  await expect.poll(() => card.locator('img.thumb').evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await play.click();
  const stop = card.getByRole('button', { name: `Stop ${long.name}` });
  await expect(stop).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('.card')).toHaveClass(/playing/);
  expect(asked.filter((p) => /^\/sounds\/.+\.json$/.test(p)).length).toBeLessThanOrEqual(1);
  await stop.click();
  await expect(play).toBeVisible();
  await expect(card.locator('.card')).not.toHaveClass(/playing/);
});

test('pressing a music card plays the track and pressing again stops it', async ({ page }) => {
  const track = CATALOG.assets.find((a) => a.kind === 'music');
  await openRoute(page, '/browse?kind=music');
  const card = page.locator(`ul.results li[data-id="${track.id}"]`);
  await card.getByRole('button', { name: `Play ${track.name}` }).click();
  const stop = card.getByRole('button', { name: `Stop ${track.name}` });
  await expect(stop).toBeVisible({ timeout: 30_000 });
  await stop.click();
  await expect(card.getByRole('button', { name: `Play ${track.name}` })).toBeVisible();
});

test('hovering a sprite card plays its animation from the strip picture; nothing is drawn by a sprite program', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await openRoute(page, '/browse?kind=sprite');
  const card = page.locator('ul.results li[data-id="knight"]');
  await expect(card.locator('img.thumb')).toBeVisible();
  await expect(card.locator('canvas.anim')).toBeHidden();
  await card.locator('a.card').hover();
  const cv = card.locator('canvas.anim');
  await expect(cv).toBeVisible();
  const first = await canvasStats(cv);
  expect(first.opaque).toBeGreaterThan(50);
  expect([first.width, first.height]).toEqual(CATALOG.assets.find((a) => a.id === 'knight').tech.frame);
  await expect.poll(async () => (await canvasStats(cv)).hash, { timeout: 5000 }).not.toBe(first.hash);
  // sharp pixels: a whole-number scale and no smoothing
  const shown = await cv.evaluate((c) => ({ scale: c.getBoundingClientRect().width / c.width, rendering: getComputedStyle(c).imageRendering }));
  expect(Number.isInteger(shown.scale)).toBe(true);
  expect(shown.rendering).toMatch(/pixelated|crisp-edges/);
  const thumb = await card.locator('img.thumb').evaluate((img) => getComputedStyle(img).imageRendering);
  expect(thumb).toMatch(/pixelated|crisp-edges/);
  // moving away puts the still picture back
  await line(page).hover();
  await expect(cv).toBeHidden();
  await expect(card.locator('img.thumb')).toBeVisible();
  // keyboard focus animates it too
  await card.locator('a.card').focus();
  await expect(cv).toBeVisible();
  expect(asked.filter((p) => p.startsWith('/sprites/'))).toEqual([]);
  expect(asked).toContain('/generated/strips/knight.png');
});

test('"Add to bag" on a card raises the bag count in the header', async ({ page }) => {
  await openRoute(page, '/');
  await expect(bagCount(page)).toHaveText('0');
  await page.locator('ul.results li[data-id="knight"]').getByRole('button', { name: 'Add Hero to bag' }).click();
  await expect(bagCount(page)).toHaveText('1');
  await box(page).fill('coin pickup');
  await page.locator('ul.results li[data-id="coin-pickup"]').getByRole('button', { name: /^Add .* to bag$/ }).click();
  await expect(bagCount(page)).toHaveText('2');
  // each goes in with its standard settings
  const items = await page.evaluate(async () => (await import('/app/bag.js')).bag.items().map((i) => [i.kind, i.id, i.settings]));
  expect(items).toEqual([
    ['sprite', 'knight', { params: {}, cues: null, scale: 1 }],
    ['sound', 'coin-pickup', { params: {}, style: null, seed: 1 }],
  ]);
  // and the bag page shows them
  await openRoute(page, '/bag');
  await expect(page.locator('.bag-item')).toHaveCount(2);
});

test('similar assets can be dropped into any page with one call', async ({ page }) => {
  await openRoute(page, '/sound/coin-pickup');
  await page.evaluate(async () => {
    const { similarAssets } = await import('/app/browse.js');
    document.querySelector('main').append(similarAssets('coin-pickup'));
  });
  const section = page.locator('section.similar');
  await expect(section.getByRole('heading')).toBeVisible();
  await expect.poll(() => section.locator('.card').count()).toBeGreaterThanOrEqual(3);
  expect(await section.locator('.card').count()).toBeLessThanOrEqual(6);
  await expect(section.locator('a[href="#/sound/coin-pickup"]')).toHaveCount(0);
});

// ---- kits become bundles -----------------------------------------------------------------------

plain('#/kit/dungeon-starter lands on the bundle route, and #/kits on the list of bundles', async ({ page }) => {
  await quietNetwork(page);
  await page.goto('/index.html#/kit/dungeon-starter');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundle/dungeon-starter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(CATALOG.bundles.find((b) => b.id === 'dungeon-starter').name);
  await page.goto('/index.html#/kits');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundles');
  for (const b of CATALOG.bundles) await expect(page.locator(`a.card.kit[href="#/bundle/${b.id}"]`)).toContainText(b.name);
  // Back does not bounce through the old address
  await page.locator('a.card.kit[href="#/bundle/wizard-camp"]').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundle/wizard-camp');
  await page.goBack();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundles');
});

// ---- smarter search is a choice ----------------------------------------------------------------

plain('smarter search is off until asked for, then loads, and the choice is remembered', async ({ page }) => {
  plain.setTimeout(300_000);
  await quietNetwork(page);
  // as the shared `test` does: any console error, page error or failed request fails this test. One exception:
  // the model library cancels and repeats one of its own small requests while it starts, which is not a fault.
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!(r.failure()?.errorText === 'net::ERR_ABORTED' && pathOf(r.url()).startsWith('/vendor/models/'))) errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`); });
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  const heavy = () => asked.filter((p) => p.startsWith('/vendor/models/') || p.startsWith('/vendor/ort/'));
  const description = 'something for when the player dies';

  await openRoute(page, '/');
  const sw = page.getByRole('switch', { name: 'Smarter search' });
  await expect(sw).toBeVisible();
  await expect(sw).not.toBeChecked();
  await expect(page.locator('.smart-note')).toHaveText(`Understands descriptions like "something for when the player dies". Downloads about ${SMART_MB} MB once.`);
  await box(page).fill(description);
  await expect.poll(() => results(page).count()).toBeGreaterThanOrEqual(1);
  await box(page).fill('coin');
  await expect.poll(async () => (await resultIds(page))[0]).toMatch(/^coin/);
  await page.waitForLoadState('networkidle');
  expect(heavy(), 'nothing big is downloaded while the switch is off').toEqual([]);

  // while it downloads the line says how much has arrived
  await page.locator('.smart-note').evaluate((note) => { window.__notes = []; new MutationObserver(() => window.__notes.push(note.textContent)).observe(note, { childList: true, characterData: true, subtree: true }); });
  await sw.click();
  await expect(sw).toBeChecked();
  await expect.poll(() => heavy().some((p) => p.startsWith('/vendor/ort/')), { timeout: 120_000 }).toBe(true);
  await expect.poll(() => heavy().some((p) => p.startsWith('/vendor/models/')), { timeout: 120_000 }).toBe(true);
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'ready', { timeout: 240_000 });
  const notes = await page.evaluate(() => window.__notes);
  const progress = notes.map((t) => /^Downloading: (\d+) of (\d+) MB$/.exec(t)).filter(Boolean);
  expect(progress.length, `progress lines among: ${notes.join(' | ')}`).toBeGreaterThanOrEqual(2);
  for (const m of progress) { expect(Number(m[2])).toBe(SMART_MB); expect(Number(m[1])).toBeLessThanOrEqual(SMART_MB); }
  expect(progress.map((m) => Number(m[1]))).toEqual(progress.map((m) => Number(m[1])).sort((a, b) => a - b));       // it only goes up
  expect(notes).toContain('Getting smarter search ready…');
  await expect(page.locator('.smart-note')).toHaveText('On. Describe what you need in your own words.');
  await box(page).fill(description);
  await expect.poll(() => results(page).count()).toBeGreaterThanOrEqual(1);
  // typing still answers
  await box(page).fill('money');
  await expect.poll(async () => (await resultIds(page)).slice(0, 4)).toContain('coin');

  // the choice survives a reload (the browser keeps the download, so it is ready again without fetching it twice)
  await page.waitForLoadState('networkidle');       // a reload in the middle of a download would show up as a failed request
  await page.reload();
  await waitForDrawn(page);
  await expect(page.getByRole('switch', { name: 'Smarter search' })).toBeChecked();
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'ready', { timeout: 240_000 });
  // and switching it off is remembered too
  await page.waitForLoadState('networkidle');
  await page.getByRole('switch', { name: 'Smarter search' }).click();
  await expect(page.getByRole('switch', { name: 'Smarter search' })).not.toBeChecked();
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'off');
  await expect(page.locator('.smart')).toContainText(`${SMART_MB} MB`);
  await page.waitForLoadState('networkidle');
  await page.reload();
  await waitForDrawn(page);
  asked.length = 0;
  await expect(page.getByRole('switch', { name: 'Smarter search' })).not.toBeChecked();
  await box(page).fill('coin');
  await expect.poll(async () => (await resultIds(page))[0]).toMatch(/^coin/);
  await page.waitForLoadState('networkidle');
  expect(heavy()).toEqual([]);
  expect(errors, 'the page should log no errors').toEqual([]);
});

plain('if smarter search cannot load, the page says so in one line, switches it back off, and normal search carries on', async ({ page }) => {
  plain.setTimeout(120_000);
  await quietNetwork(page);
  await page.route('**/vendor/models/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  await page.goto('/index.html#/');
  await waitForDrawn(page);
  const sw = page.getByRole('switch', { name: 'Smarter search' });
  await sw.click();
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'failed', { timeout: 90_000 });
  await expect(page.locator('.smart-note')).toHaveText('Smarter search could not be loaded, so it is switched off. Normal search still works.');
  await expect(sw).not.toBeChecked();
  await box(page).fill('money');
  await expect.poll(async () => (await page.locator('ul.results > li').evaluateAll((lis) => lis.map((li) => li.dataset.id))).slice(0, 4)).toContain('coin');

  // it is not tried again on the next visit
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await page.reload();
  await waitForDrawn(page);
  await expect(page.getByRole('switch', { name: 'Smarter search' })).not.toBeChecked();
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'off');
  await box(page).fill('money');
  await expect.poll(async () => (await page.locator('ul.results > li').evaluateAll((lis) => lis.map((li) => li.dataset.id))).slice(0, 4)).toContain('coin');
  await page.waitForTimeout(500);
  expect(asked.filter((p) => p.startsWith('/vendor/models/') || p.startsWith('/vendor/ort/') || p.startsWith('/vendor/transformers/'))).toEqual([]);
});

// ---- scale -------------------------------------------------------------------------------

test.describe('with the 490-entry stand-in catalogue', () => {
  // Budgets. Measured alone on the test machine: first results at about 70 ms, a key press about 6 ms (the slowest,
  // the first key, about 35 ms). The budgets leave room for a slow machine and for other tests running beside this one.
  const PAINT_MS = 2000;           // from opening the address to the first results on screen
  const KEYSTROKE_MS = 50;         // a typical key press: from the press to the frame that shows its results
  const SLOWEST_KEY_MS = 400;      // the slowest single key press

  test('the page paints and a keystroke updates the results within budget; cards are made only near the screen', async ({ page }) => {
    await page.goto(`/index.html?catalog=${STAND_IN}#/`, { waitUntil: 'domcontentloaded' });
    await expect(results(page)).toHaveCount(BIG.assets.length);
    await expect(line(page)).toHaveText(`${BIG.assets.length} results`);
    const paint = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
      const first = performance.getEntriesByName('loadout-results')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      resolve({ results: first ? first.startTime : null, fcp: fcp ? fcp.startTime : null });
    })));
    expect(paint.results).not.toBeNull();
    expect(paint.results).toBeLessThan(PAINT_MS);

    // only the cards near the screen exist
    const made = await page.locator('ul.results .card').count();
    expect(made).toBeGreaterThanOrEqual(3);
    expect(made).toBeLessThan(60);
    await results(page).last().scrollIntoViewIfNeeded();
    await expect(results(page).last().locator('.card')).toBeVisible();
    expect(await page.locator('ul.results .card').count()).toBeLessThan(BIG.assets.length / 2);
    await page.evaluate(() => window.scrollTo(0, 0));

    // type a word one key at a time
    await box(page).click();
    const word = 'door open', typed = [];
    for (const key of word) {
      await page.evaluate(() => performance.clearMeasures('loadout-typed'));
      await page.keyboard.type(key);
      // the page notes how long each key press took, from the press to the frame that shows its results
      await expect.poll(() => page.evaluate(() => performance.getEntriesByName('loadout-typed').length)).toBe(1);
      typed.push(await page.evaluate(() => performance.getEntriesByName('loadout-typed')[0].duration));
    }
    const worst = Math.max(...typed), median = [...typed].sort((a, b) => a - b)[typed.length >> 1];
    expect(median).toBeLessThan(KEYSTROKE_MS);
    expect(worst).toBeLessThan(SLOWEST_KEY_MS);
    expect((await resultIds(page)).slice(0, 5)).toContain('door-open');
    expect(await results(page).count()).toBeLessThan(BIG.assets.length);

    // filters work at this size too, and their numbers match the catalogue
    await box(page).fill('');
    await option(page, 'Kind', 'Music').click();
    await expect(results(page)).toHaveCount(BIG.assets.filter((a) => a.kind === 'music').length);
    console.log(`[scale] ${BIG.assets.length} assets: first results at ${Math.round(paint.results)} ms (first paint ${Math.round(paint.fcp ?? 0)} ms); keystroke to painted results: median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
  });
});

// ---- phone -------------------------------------------------------------------------------

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('home and results have no sideways scroll, and the filters can be opened and used', async ({ page }) => {
    await openRoute(page, '/');
    expect(await hasHorizontalScroll(page)).toBe(false);
    await expect(box(page)).toBeVisible();
    const all = await results(page).count();

    // filters are tucked behind one button
    const toggle = page.getByRole('button', { name: /^Narrow down/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(group(page, 'Kind')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(group(page, 'Kind')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    const sounds = option(page, 'Kind', 'Sounds');
    const size = await sounds.boundingBox();
    expect(size.height).toBeGreaterThanOrEqual(32);     // big enough for a thumb
    await sounds.click();
    await expect.poll(() => results(page).count()).toBeLessThan(all);
    await expect(chip(page, 'Sounds')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    // closing the filters leaves the chip, so what is applied stays visible
    await toggle.click();
    await expect(group(page, 'Kind')).toBeHidden();
    await expect(chip(page, 'Sounds')).toBeVisible();
    await expect(toggle).toContainText('1');

    // cards fit two to a row
    await box(page).fill('');
    await chip(page, 'Sounds').getByRole('button').click();
    const boxes = await page.locator('ul.results > li').evaluateAll((lis) => lis.slice(0, 2).map((li) => { const r = li.getBoundingClientRect(); return [r.left, r.right, r.top]; }));
    expect(boxes[0][2]).toBe(boxes[1][2]);
    expect(boxes[1][1]).toBeLessThanOrEqual(375);
  });

  test('a long run of text with no spaces does not push the page sideways', async ({ page }) => {
    await openRoute(page, '/');
    const long = 'supercalifragilisticexpialidocious'.repeat(9);       // 306 characters, no spaces
    await box(page).fill(long);
    await expect(line(page)).toContainText('Nothing matches');
    await expect(line(page)).toHaveText(`Nothing matches "${long.slice(0, 40)}…"`);
    expect(await hasHorizontalScroll(page)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    // the same when it does match something and a filter is on
    await box(page).fill('coin' + 'x'.repeat(100));
    await page.getByRole('button', { name: /^Narrow down/ }).click();
    expect(await hasHorizontalScroll(page)).toBe(false);
    await openRoute(page, `/browse?q=${'w'.repeat(120)}&kind=sound&view=side`);
    await expect(line(page)).toContainText('Nothing matches');
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test('the list of bundles has no sideways scroll', async ({ page }) => {
    await openRoute(page, '/bundles');
    await expect(page.locator('a.card.kit').first()).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
