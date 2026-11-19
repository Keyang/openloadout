// Faults the final review found on the site, each written as a person would meet it.
// Assets and bundles are taken from the built catalogue, so a new asset or bundle needs no change here.
import { test as playwrightTest } from '@playwright/test';
import { test, expect, openRoute, waitForDrawn, hasHorizontalScroll, quietNetwork, collectErrors } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf } from '../helpers/catalog.mjs';

const C = catalogueOf(readCatalogue());
const spriteOfType = (pred) => C.sprites.find(pred);
const firstSprite = C.sprites.find((a) => a.type === 'character') ?? C.sprites[0];
const bigBundle = [...C.catalog.bundles].sort((a, b) => b.sprites.length - a.sprites.length)[0];

/** The browser refuses its storage, as in a private window or with site data blocked. */
const blockStorage = (context) => context.addInitScript(() => {
  for (const k of ['localStorage', 'sessionStorage']) Object.defineProperty(window, k, { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
});

// ---- 1. a bag the browser does not keep ------------------------------------------------------------------------

// With storage blocked the search library's own start-up (vendor/sqlite) logs that it could not reach storage, and search
// carries on without its index. That message is not this page's to fix; any other error still fails the test.
const blockedTest = playwrightTest.extend({
  page: async ({ page }, use) => {
    await quietNetwork(page);
    const errs = collectErrors(page);
    await use(page);
    expect(errs.errors.filter((e) => !/sqlite3/.test(e)), 'the page should log no errors').toEqual([]);
  },
});

blockedTest.describe('storage blocked', () => {
  const test = blockedTest;
  test.beforeEach(async ({ context }) => { await blockStorage(context); });

  test('adding on an asset page says the bag will not be kept, and what to do', async ({ page }) => {
    await openRoute(page, `/sprite/${firstSprite.id}`);
    // (the editing panel's footer: where "Saved in your bag" would be, the warning stands instead)
    const note = page.locator('.rx-panel .saved');
    await expect(note).not.toContainText(/not keeping/i);      // nothing to lose yet
    await page.getByRole('button', { name: 'Add to my bag' }).click();
    await expect(note).not.toContainText(/^Saved/);
    await expect(note).toContainText(/not keeping/i);
    await expect(note).toContainText(/download/i);
    await expect(note).toContainText(/link/i);
  });

  test('adding from a card says it too (the site-wide note appears once there is something to lose)', async ({ page }) => {
    await openRoute(page, '/browse?kind=sprite');
    await expect(page.locator('.not-kept')).toHaveCount(0);
    await page.locator('.card-add').first().click();
    const note = page.locator('.not-kept');
    await expect(note).toBeVisible();
    await expect(note).toContainText(/download/i);
    await expect(note.getByRole('link', { name: /bag/i })).toHaveAttribute('href', '#/bag');
  });

  test('the bag page says plainly that it will be gone on reload, with download and link right there', async ({ page }) => {
    await openRoute(page, `/sprite/${firstSprite.id}`);
    await page.getByRole('button', { name: 'Add to my bag' }).click();
    await page.evaluate(() => { location.hash = '#/bag'; });
    await waitForDrawn(page);
    const alert = page.locator('main [role=alert]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/reload|close/i);
    await expect(alert).not.toContainText(/full/i);
    await expect(alert.getByRole('button', { name: /download/i })).toBeVisible();
    await expect(alert.getByRole('button', { name: /copy.*link/i })).toBeVisible();
  });
});

test('with storage working, no "not kept" words appear anywhere', async ({ page }) => {
  await openRoute(page, `/sprite/${firstSprite.id}`);
  await page.getByRole('button', { name: 'Add to my bag' }).click();
  await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
  await expect(page.locator('.not-kept')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/not keeping/i);
  await page.evaluate(() => { location.hash = '#/bag'; });
  await waitForDrawn(page);
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
});

// ---- 2. bundle pages grouped under everyday headings ------------------------------------------------------------

test('a big bundle page groups its sprites under everyday headings with counts that add up', async ({ page }) => {
  await openRoute(page, `/bundle/${bigBundle.id}`);
  // a kind split into more than one group has a heading per group (one group alone needs none)
  const groups = page.locator('.bundle-kind-sprite .bundle-group').filter({ has: page.locator('h3') });
  const n = await groups.count();
  expect(n, `${bigBundle.sprites.length} sprites in one flat grid`).toBeGreaterThanOrEqual(4);
  let total = 0;
  const ids = new Set(C.catalog.assets.map((a) => a.id));
  for (let i = 0; i < n; i++) {
    const g = groups.nth(i);
    const heading = (await g.locator('h3').innerText()).trim();
    const shown = Number(heading.match(/(\d+)\s*$/)?.[1]);
    const tiles = await g.locator('.bundle-card').count();
    expect(shown, `"${heading}" ends with its count`).toBe(tiles);
    expect(heading).not.toMatch(/[-_/]/);
    expect(ids.has(heading.toLowerCase())).toBe(false);
    total += tiles;
  }
  expect(total).toBe(await page.locator('.bundle-sprite').count());
  const kindHeading = (await page.locator('.bundle-kind-sprite h2').innerText()).trim();
  expect(Number(kindHeading.match(/(\d+)\s*$/)?.[1]), kindHeading).toBe(total);
  expect(total).toBe(bigBundle.sprites.filter((id) => C.byId[id]).length);
});

test('every bundle page: each sprite sits under exactly one heading', async ({ page }) => {
  test.setTimeout(120_000);
  for (const b of C.catalog.bundles.filter((x) => x.sprites.length)) {
    await openRoute(page, `/bundle/${b.id}`);
    const inGroups = await page.locator('.bundle-group .bundle-sprite').count();
    expect(inGroups, b.id).toBe(await page.locator('.bundle-sprite').count());
    expect(inGroups, b.id).toBe(b.sprites.filter((id) => C.byId[id]).length);
  }
});

test('the bundle page groups are listed at the top and a press there moves to the group, by keyboard too', async ({ page }) => {
  await openRoute(page, `/bundle/${bigBundle.id}`);
  const jumps = page.locator('.bundle-jump button');
  expect(await jumps.count()).toBeGreaterThanOrEqual(4);
  const last = jumps.last();
  const label = (await last.innerText()).replace(/\s*\d+\s*$/, '').trim();
  await last.focus();
  await page.keyboard.press('Enter');
  const heading = page.locator(':focus');
  await expect(heading).toHaveText(new RegExp(`^${label}\\s*\\d+$`));
  expect(await heading.evaluate((n) => /^H[23]$/.test(n.tagName))).toBe(true);
  await expect(heading).toBeInViewport();
});

// ---- 3. colour names --------------------------------------------------------------------------------------------

async function spriteWithColour(page) {
  for (const a of C.sprites.slice(0, 40)) {
    const has = await page.evaluate(async (src) => Object.values((await import('/' + src)).default.params ?? {}).some((d) => d.kind === 'color'), a.src).catch(() => false);
    if (has) return a;
  }
  return null;
}

test('colour choices are named in words; the code is still there for whoever wants it', async ({ page }) => {
  await openRoute(page, '/');
  const a = await spriteWithColour(page);
  test.skip(!a, 'no sprite with a colour control');
  await openRoute(page, `/sprite/${a.id}`);
  const hexNamed = await page.locator('[aria-label^="#"]').count();
  expect(hexNamed, 'swatches are named by code').toBe(0);
  await page.getByRole('tab', { name: 'Colours' }).click();
  const field = page.locator('.swatches').first().locator('xpath=..');
  const name = field.locator('.colour-word');
  await expect(name).toHaveText(/^[A-Z][a-z]+( [a-z]+)*$/);
  const code = field.locator('.colour-code');
  await expect(code).toHaveText(/^#[0-9a-f]{6}$/);
  // choosing another swatch changes the name shown
  const swatches = field.locator('button.swatch');
  if (await swatches.count() > 1) {
    const second = swatches.nth(1);
    const label = await second.getAttribute('aria-label');
    await second.click();
    await expect(name).toHaveText(label.replace(/, choice \d+$/, ''));
  }
});

// ---- 4. "not here" pages have their own tab title ---------------------------------------------------------------

test('a page that does not exist does not keep the previous page\'s tab title', async ({ page }) => {
  await openRoute(page, `/sprite/${firstSprite.id}`);
  await expect(page).toHaveTitle(new RegExp(firstSprite.name));
  for (const route of ['/sprite/no-such-sprite-here', '/sound/no-such-sound', '/bundle/no-such-bundle', '/no-such-page']) {
    await openRoute(page, `/sprite/${firstSprite.id}`);
    await page.evaluate((r) => { location.hash = '#' + r; }, route);
    await expect(page.locator('main h1')).toContainText(/not here/i);
    await expect(page, route).not.toHaveTitle(new RegExp(firstSprite.name));
    await expect(page, route).toHaveTitle(/not here/i);
  }
});

// ---- 5. first paint on a slow connection ------------------------------------------------------------------------

test('on a slow connection the page frame and a loading line show long before the catalogue has arrived', async ({ page, context }) => {
  test.setTimeout(120_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 51200, uploadThroughput: 51200 });
  let catalogueAt = 0;
  page.on('requestfinished', (r) => { if (r.url().includes('generated/catalog.json')) catalogueAt = Date.now(); });
  const t0 = Date.now();
  await page.goto('/index.html#/', { waitUntil: 'commit' });
  await page.locator('header.top .brand').waitFor({ state: 'visible', timeout: 60_000 });
  const frameAt = Date.now();
  await expect(page.locator('main')).toContainText('Loading');
  expect(frameAt - t0, 'the frame shows within 4 seconds at 400 kbit/s').toBeLessThan(4000);
  await page.locator('main .card').first().waitFor({ timeout: 90_000 });
  expect(catalogueAt, 'the catalogue arrived').toBeGreaterThan(0);
  expect(frameAt).toBeLessThan(catalogueAt);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
});

test('the front page does not fetch the search index until a typed search needs it', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => asked.push(r.url()));
  await openRoute(page, '/');
  await page.waitForTimeout(1500);
  expect(asked.filter((u) => /search\.sqlite/.test(u))).toEqual([]);
  // a search uses the index; it answers from the catalogue at once and the index comes after (Contract 5)
  await page.locator('main input').first().fill('coin');
  await page.keyboard.press('Enter');
  await expect(page.locator('main .finder .card').first()).toBeVisible();
  await expect.poll(() => asked.filter((u) => /search\.sqlite/.test(u)).length, { message: 'a typed search then fetches the index' }).toBe(1);
});

// ---- 6. backdrops that suit the kind of sprite ------------------------------------------------------------------

/** Count stage pixels in the meadow's grass and sky colours. */
const meadowPixels = (page) => page.locator('canvas.stage').evaluate((cv) => {
  const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
  let grass = 0, sky = 0;
  for (let i = 0; i < data.length; i += 4) {
    const hex = ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]).toString(16).padStart(6, '0');
    if (hex === '6cc06a') grass++;
    if (hex === 'bfe6f7') sky++;
  }
  return { grass, sky, w: cv.width, h: cv.height };
});

test('a character stands on the meadow by default', async ({ page }) => {
  await openRoute(page, `/sprite/${firstSprite.id}`);
  expect((await meadowPixels(page)).grass).toBeGreaterThan(0);
});

const uiPiece = spriteOfType((a) => a.type === 'ui' || String(a.role).startsWith('interface/'));
const background = spriteOfType((a) => a.type === 'background');

test('an interface piece is previewed on a plain panel, never on grass, with panel choices', async ({ page }) => {
  test.skip(!uiPiece, 'no interface piece in the catalogue');
  await openRoute(page, `/sprite/${uiPiece.id}`);
  const px = await meadowPixels(page);
  expect(px.grass + px.sky, `${uiPiece.id} on the meadow`).toBe(0);
  await expect(page.getByRole('button', { name: /meadow/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /panel backdrop/i }).first()).toBeVisible();
});

test('a background fills the preview frame, with no ground under it', async ({ page }) => {
  test.skip(!background, 'no background in the catalogue');
  await openRoute(page, `/sprite/${background.id}`);
  const px = await meadowPixels(page);
  expect(px.grass, `${background.id} on grass`).toBe(0);
  const covered = await page.locator('canvas.stage').evaluate((cv) => {
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 255) opaque++;
    return opaque / (cv.width * cv.height);
  });
  expect(covered).toBe(1);
  await expect(page.locator('.scene-btn')).toHaveCount(0);
});

test('interface pieces and backgrounds are off the grass on their cards too', async ({ page }) => {
  test.skip(!uiPiece, 'no interface piece in the catalogue');
  await openRoute(page, `/browse?q=${encodeURIComponent(uiPiece.name)}`);
  const card = page.locator(`a.card[href="#/sprite/${uiPiece.id}"] .pic-tile`);
  await expect(card).toHaveCount(1);
  await expect(card).not.toHaveClass(/on-ground/);
  await expect(card).toHaveClass(/on-panel/);
});

// ---- at phone width -----------------------------------------------------------------------------------------------

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('bundle groups, colour names and the panel backdrop fit without sideways scrolling', async ({ page }) => {
    await openRoute(page, `/bundle/${bigBundle.id}`);
    expect(await page.locator('.bundle-kind-sprite .bundle-group').count()).toBeGreaterThanOrEqual(4);
    expect(await hasHorizontalScroll(page)).toBe(false);
    if (uiPiece) {
      await openRoute(page, `/sprite/${uiPiece.id}`);
      expect(await hasHorizontalScroll(page)).toBe(false);
    }
    await openRoute(page, `/sprite/${firstSprite.id}`);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
