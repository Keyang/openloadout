// The kits (#/bundles; docs/site-design.md, section 5, "Kits"): every kit as a living scene made of its own things, with
// its facts and the way in; one row of looks gives every scene that look, and a kit opened from here opens with it.
// And a kit's own page starts with the same scene, which follows the kit's look.
import { test, expect, openRoute, canvasStats, hasHorizontalScroll } from '../helpers/test.mjs';
import { readCatalogue } from '../helpers/catalog.mjs';

const { bundles } = readCatalogue();
const BIG = bundles.filter((b) => b.sprites.length >= 20);
const kit = (page, id) => page.locator(`article.kit[data-id="${id}"]`);
const drawn = async (cv) => { const s = await canvasStats(cv); return s.opaque > s.width * s.height * 0.5; };

test('every kit is listed with its facts and the way in; the big kits are scenes that are drawn and move', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 4200 });      // every kit on screen, so every scene is drawn
  await openRoute(page, '/bundles');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kits');
  await expect(page.locator('article.kit')).toHaveCount(bundles.length);
  for (const b of bundles) {
    const row = kit(page, b.id);
    await expect(row.locator(`a.card.kit[href="#/bundle/${b.id}"]`)).toHaveText(b.name);
    await expect(row.locator('.facts')).toContainText(String(b.sprites.length));
    if (b.sounds.length) await expect(row.locator('.facts')).toContainText(`${b.sounds.length}sound`);
    await expect(row.getByRole('link', { name: `See the kit: ${b.name}` })).toHaveAttribute('href', `#/bundle/${b.id}`);
  }
  expect(BIG.length).toBeGreaterThanOrEqual(3);
  for (const b of BIG) {
    const cv = kit(page, b.id).locator('canvas.kit-scene-pic');
    await expect(cv).toHaveAttribute('aria-label', `A scene made only from ${b.name}`);
    await expect.poll(() => drawn(cv), { message: `${b.name}: its scene is drawn`, timeout: 30_000 }).toBe(true);
    const first = (await canvasStats(cv)).hash;
    await expect.poll(async () => (await canvasStats(cv)).hash, { message: `${b.name}: its scene moves`, timeout: 15_000 }).not.toBe(first);
  }
});

test.describe('holding still', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a look picked over the list restyles every scene, and a kit opened from there opens with that look', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 4200 });
    await openRoute(page, '/bundles');
    const b = BIG[0];
    const cv = kit(page, b.id).locator('canvas.kit-scene-pic');
    await expect.poll(() => drawn(cv), { timeout: 30_000 }).toBe(true);
    await expect(kit(page, b.id).locator('.kit-scene')).toHaveAttribute('data-drawn', /./);
    const plain = (await canvasStats(cv)).hash;
    const looks = page.getByRole('group', { name: 'Look for every kit' });
    await expect(looks.getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true');
    await looks.getByRole('button', { name: 'Frost' }).click();
    await expect(looks.getByRole('button', { name: 'Frost' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await canvasStats(cv)).hash, { message: 'the scene takes the look' }).not.toBe(plain);
    await looks.getByRole('button', { name: 'Original' }).click();
    await expect.poll(async () => (await canvasStats(cv)).hash, { message: 'and gives it back' }).toBe(plain);

    await looks.getByRole('button', { name: 'Frost' }).click();
    await kit(page, b.id).locator('a.card.kit').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(b.name);
    await expect(page).toHaveURL(new RegExp(`#/bundle/${b.id}\\?look=frost$`));
    await expect(page.locator('.bundle-look').getByRole('button', { name: 'Frost', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a kit\'s own page starts with its scene, its facts and its three actions, and the scene follows the look', async ({ page }) => {
    const b = BIG[0];
    await openRoute(page, `/bundle/${b.id}`);
    const cv = page.locator('.kit-top canvas.kit-scene-pic');
    await expect.poll(() => drawn(cv), { timeout: 30_000 }).toBe(true);
    await expect(page.locator('.kit-top .facts')).toContainText(`${b.sprites.length}sprites`);
    for (const name of ['Add the whole kit to my bag', 'Try it in the playground', 'Download this kit']) await expect(page.locator('.kit-top').getByRole('button', { name })).toBeVisible();
    const plain = (await canvasStats(cv)).hash;
    await page.locator('.bundle-look').getByRole('button', { name: 'Night', exact: true }).click();
    await expect.poll(async () => (await canvasStats(cv)).hash, { message: 'the scene takes the look' }).not.toBe(plain);
    await page.locator('.bundle-look').getByRole('button', { name: 'Start over' }).click();
    await expect.poll(async () => (await canvasStats(cv)).hash, { message: 'Start over gives the original back' }).toBe(plain);
    // what is in it: a grid of cards under everyday headings
    await expect(page.locator('.bundle-kind-sprite .bundle-group h3').first()).toBeVisible();
    await expect(page.locator('.bundle-sprite.card')).toHaveCount(b.sprites.length);
  });
});

for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 900, height: 700 }, { width: 390, height: 844 }]) {
  test(`${size.width} x ${size.height}: the list of kits and a kit's page do not scroll sideways`, async ({ page }) => {
    await page.setViewportSize(size);
    await openRoute(page, '/bundles');
    await expect(page.locator('article.kit').first()).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    await openRoute(page, `/bundle/${BIG[0].id}`);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
}
