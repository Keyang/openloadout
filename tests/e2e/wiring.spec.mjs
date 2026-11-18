// How the pages are tied together (W2-G): the Play link in the header, and on every asset page what the
// asset goes with (the sounds a sprite uses, the sprites that use a sound, its bundles) and "More like this".
// All of it comes from the catalogue, so the assets are picked from the catalogue too.
// Run with: npx playwright test tests/e2e/wiring.spec.mjs
import { test, expect, openRoute, waitForDrawn, canvasStats, hasHorizontalScroll } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf } from '../helpers/catalog.mjs';

const C = catalogueOf(readCatalogue());
// a sprite that plays sounds and is in a bundle; a sound that sprites use and that is in a bundle; a track in a bundle
const SPRITE = C.sprites.find((a) => C.soundsOf(a.id).length >= 2 && a.bundles.length) ?? C.sprites.find((a) => C.soundsOf(a.id).length);
const QUIET = C.sprites.find((a) => !(a.tech.soundIds ?? []).length && !a.bundles.length);
const SOUND = C.sounds.find((a) => C.usersOf(a.id).length && a.bundles.length) ?? C.sounds.find((a) => C.usersOf(a.id).length);
const TRACK = C.music.find((a) => a.bundles.length) ?? C.music[0];

const related = (page) => page.locator('main .related');
const more = (page) => page.locator('main section.more-like');
const hash = (page) => page.evaluate(() => location.hash);

test('the catalogue says which sounds each sprite uses', () => {
  expect(SPRITE, 'a sprite that plays sounds (tech.soundIds in generated/catalog.json: run "npm run build")').toBeTruthy();
  expect(SOUND, 'a sound that a sprite plays').toBeTruthy();
  expect(TRACK, 'a music track').toBeTruthy();
});

test('the header has a Play link to the playground, styled like the other links', async ({ page }) => {
  await openRoute(page, '/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const play = nav.getByRole('link', { name: 'Play', exact: true });
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute('href', '#/play');
  const looks = await nav.getByRole('link').evaluateAll((as) => as.map((a) => { const s = getComputedStyle(a); return [s.fontWeight, s.fontSize, s.padding, s.color, s.textDecorationLine].join(' '); }));
  expect(new Set(looks).size, 'every link in the header looks the same').toBe(1);
  // it is there on the other pages too
  for (const route of [`/sprite/${SPRITE.id}`, `/sound/${SOUND.id}`, '/bag']) {
    await openRoute(page, route);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Play', exact: true })).toHaveAttribute('href', '#/play');
  }
});

test('a sprite page lists the sounds it uses and its bundles, each a link, and more sprites like it', async ({ page }) => {
  await openRoute(page, `/sprite/${SPRITE.id}`);
  const sounds = related(page).locator('[data-rel="sounds"]');
  await expect(sounds).toContainText('Sounds it uses');
  const want = C.soundsOf(SPRITE.id);
  await expect(sounds.getByRole('link')).toHaveCount(want.length);
  for (const s of want) await expect(sounds.locator(`a[href="#/${s.kind}/${s.id}"]`)).toHaveText(s.name);
  const bundles = related(page).locator('[data-rel="bundles"]');
  if (SPRITE.bundles.length) {
    await expect(bundles).toContainText('In these bundles');
    for (const id of SPRITE.bundles) await expect(bundles.locator(`a[href="#/bundle/${id}"]`)).toHaveText(C.bundle(id).name);
  } else await expect(bundles).toHaveCount(0);

  // more like this: cards of other assets, never itself
  await expect(more(page).getByRole('heading', { name: 'More like this' })).toBeVisible();
  await expect.poll(() => more(page).locator('.card').count()).toBeGreaterThanOrEqual(1);
  await expect(more(page).locator(`a[href="#/sprite/${SPRITE.id}"]`)).toHaveCount(0);

  // a sound link opens that sound's page
  await sounds.getByRole('link').first().click();
  await expect.poll(() => hash(page)).toBe(`#/${want[0].kind}/${want[0].id}`);
  await expect(page.locator('h1')).toHaveText(want[0].name);
});

test('a sprite that plays no sound and is in no bundle has no such lines', async ({ page }) => {
  test.skip(!QUIET, 'every sprite in the catalogue plays a sound or is in a bundle');
  await openRoute(page, `/sprite/${QUIET.id}`);
  await expect(page.locator('canvas.stage')).toBeVisible();
  await expect(related(page)).toHaveCount(0);
});

test('a sound page says which sprites use it and which bundles it is in, and shows more like it', async ({ page }) => {
  await openRoute(page, `/sound/${SOUND.id}`);
  const users = related(page).locator('[data-rel="sprites"]');
  await expect(users).toContainText('Used by');
  const want = C.usersOf(SOUND.id);
  await expect(users.getByRole('link')).toHaveCount(want.length);
  for (const s of want) await expect(users.locator(`a[href="#/sprite/${s.id}"]`)).toHaveText(s.name);
  const bundles = related(page).locator('[data-rel="bundles"]');
  await expect(bundles).toContainText('In these bundles');
  await expect(bundles.getByRole('link')).toHaveCount(SOUND.bundles.length);
  for (const id of SOUND.bundles) await expect(bundles.locator(`a[href="#/bundle/${id}"]`)).toHaveText(C.bundle(id).name);
  await expect(page.locator('main a[href^="#/kit/"]'), 'no link to an old kit address').toHaveCount(0);

  await expect(more(page).getByRole('heading', { name: 'More like this' })).toBeVisible();
  await expect.poll(() => more(page).locator('.card').count()).toBeGreaterThanOrEqual(1);
  await expect(more(page).locator(`a[href="#/sound/${SOUND.id}"]`)).toHaveCount(0);

  // a bundle link opens the bundle
  const first = C.bundle(SOUND.bundles[0]);
  await bundles.locator(`a[href="#/bundle/${first.id}"]`).click();
  await expect.poll(() => hash(page)).toBe(`#/bundle/${first.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(first.name);
});

test('a music page says which bundles the track is in, and shows more like it', async ({ page }) => {
  await openRoute(page, `/music/${TRACK.id}`);
  await expect(page.locator('h1')).toHaveText(TRACK.name);
  const bundles = related(page).locator('[data-rel="bundles"]');
  if (TRACK.bundles.length) {
    await expect(bundles).toContainText('In these bundles');
    for (const id of TRACK.bundles) await expect(bundles.locator(`a[href="#/bundle/${id}"]`)).toHaveText(C.bundle(id).name);
  } else await expect(bundles).toHaveCount(0);
  await expect(page.locator('main a[href^="#/kit/"]')).toHaveCount(0);
  await expect(more(page).getByRole('heading', { name: 'More like this' })).toBeVisible();
  await expect.poll(() => more(page).locator('.card').count()).toBeGreaterThanOrEqual(1);
  await expect(more(page).locator(`a[href="#/music/${TRACK.id}"]`)).toHaveCount(0);
});

test('a sprite in the bag is loaded only when the bag page needs it; leaving before it arrives harms nothing', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(async (id) => (await import('/app/bag.js')).bag.add({ kind: 'sprite', id, settings: {} }), SPRITE.id);
  // hold the sprite's own file back until the test lets it through
  let release;
  const gate = new Promise((r) => { release = r; });
  const file = `**/sprites/${SPRITE.id}.js`;
  await page.route(file, async (route) => { await gate; await route.continue(); });

  await page.locator('header a.bag-link').click();
  const row = page.locator('.bag-item');
  await expect(row).toHaveCount(1);
  // while it loads the row is there with its name, not called missing, and cannot be changed yet
  await expect(row).toContainText(SPRITE.name);
  await expect(row).not.toContainText('no longer on the site');
  await expect(row.locator('canvas.tile')).toHaveCount(0);
  await expect(row.getByRole('link', { name: 'Change' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();

  // leave for another page, then let the file arrive
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Music' }).click();
  await expect.poll(() => hash(page)).toBe('#/browse?kind=music');
  await expect(page.locator('ul.results > li').first()).toBeVisible();
  const arrived = page.waitForResponse((r) => new URL(r.url()).pathname === `/sprites/${SPRITE.id}.js`);
  release();
  await arrived;
  await page.waitForTimeout(300);
  await expect(page.locator('main.bag-page')).toHaveCount(0);
  await expect(page.locator('ul.results > li').first()).toBeVisible();

  // back in the bag it is drawn, and can be changed
  await page.unroute(file);
  await page.locator('header a.bag-link').click();
  await expect(row.locator('canvas.tile')).toHaveCount(1);
  await waitForDrawn(page);
  expect((await canvasStats(row.locator('canvas.tile'))).opaque).toBeGreaterThan(0);
  await expect(row.getByRole('link', { name: 'Change' })).toHaveAttribute('href', new RegExp(`^#/sprite/${SPRITE.id}\\?`));
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('asset pages with their "goes with" lines and "More like this" have no sideways scroll', async ({ page }) => {
    for (const route of [`/sprite/${SPRITE.id}`, `/sound/${SOUND.id}`, `/music/${TRACK.id}`]) {
      await openRoute(page, route);
      await expect.poll(() => more(page).locator('.card').count()).toBeGreaterThanOrEqual(1);
      expect(await hasHorizontalScroll(page), route).toBe(false);
    }
  });
});
