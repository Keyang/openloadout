// The playground on one screen (docs/playground-tray-workbench.md, section 1, Keyang 2026-11-19: "the playground is
// too large - make it one screen so user can easily see all assets. still show the list of assets in bag on the right
// so user can see different animations in the scene. also if user has background in the bag, the playground should
// just use them."):
//   - at 1440 x 900, 1024 x 768 and 900 x 700 the page does not scroll; the scene is on the left, the list of what is
//     in the bag on the right, and the list scrolls inside itself
//   - every thing of a full kit that belongs in the scene is in the picture on load, without walking
//   - a row picked in the list shows that thing's animations as chips under the scene; a chip plays that animation on
//     that thing, in the scene
//   - "Change" on the picked row opens the editing panel in the right column, in place of the list, and a colour picked
//     there shows in the scene; "All things in your bag" goes back
//   - the bag's background is the scene's background
//   - at 390 x 844 the scene stays pinned at the top while the rest scrolls under it
// Bags are made the way a creator makes them: a kit page's "Add the whole kit", or a shared bag link.
// Run with: npx playwright test tests/e2e/play-onescreen.spec.mjs
import fs from 'node:fs';
import { test, expect, canvasStats, hasHorizontalScroll } from '../helpers/test.mjs';

const LINK = fs.readFileSync(new URL('../fixtures/journeys/bag-link.txt', import.meta.url), 'utf8').trim();
const catalog = JSON.parse(fs.readFileSync(new URL('../../generated/catalog.json', import.meta.url), 'utf8'));
const rowOf = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
const KITS = ['kit-platformer-fantasy', 'kit-rpg-fantasy', 'kit-roguelite-scifi'].filter((id) => catalog.bundles.some((b) => b.id === id));
const DESKTOP = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 900, height: 700 }];

const ready = (page) => page.waitForFunction(() => document.querySelector('main.play-page') && window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 90_000 });
const state = (page) => page.evaluate(() => window.__loadoutPlay.state());
const stage = (page) => page.locator('canvas.play-stage');
const side = (page) => page.locator('.play-side');
const list = (page) => side(page).locator('.play-list');
const keyOf = (page, id) => page.evaluate(async (want) => (await import('/app/bag.js')).bag.items().find((i) => i.id === want)?.key, id);

/** An empty bag, then the kit page's own "Add the whole kit", then the playground. */
async function openKit(page, kitId) {
  await page.goto('/index.html#/');
  await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.clear(); });
  await page.goto(`/index.html#/bundle/${kitId}`);
  const kit = catalog.bundles.find((b) => b.id === kitId);
  const size = [...kit.sprites, ...(kit.sounds ?? []), ...(kit.music ?? [])].filter((id) => rowOf[id]).length;
  await page.getByRole('button', { name: /^Add the whole kit/ }).first().click();
  await expect.poll(() => page.evaluate(async () => (await import('/app/bag.js')).bag.items().length), { timeout: 30_000 }).toBe(size);
  await page.goto('/index.html#/play');
  await ready(page);
}
/** The shared bag link of the journeys (a hero with a look of its own, a sound and a track), plus anything else. */
async function openLink(page, extra = []) {
  await page.goto('/index.html' + LINK);
  await expect(page.locator('header .bag-count')).toHaveText('3', { timeout: 30_000 });
  if (extra.length) await page.evaluate(async (more) => { const { bag } = await import('/app/bag.js'); for (const it of more) bag.add(it); }, extra);
  await page.goto('/index.html#/play');
  await ready(page);
}

/** Does the page itself scroll, either way? */
const pageScrolls = (page) => page.evaluate(() => {
  const d = document.documentElement;
  return { down: d.scrollHeight > innerHeight + 1, sideways: d.scrollWidth > d.clientWidth + 1, height: d.scrollHeight };
});

/** Every thing in the scene (and the player) that is not wholly inside the picture, with where it is. */
async function outOfPicture(page) {
  const box = await stage(page).boundingBox();
  const all = await page.evaluate(() => window.__loadoutPlay.spots());
  return { count: all.length, out: all.filter((t) => t.x0 < box.x - 2 || t.y0 < box.y - 2 || t.x1 > box.x + box.width + 2 || t.y1 > box.y + box.height + 2) };
}

for (const size of DESKTOP) {
  for (const kitId of KITS) {
    test(`${size.width} x ${size.height}, ${kitId} added whole: one screen, every thing in the picture, the list scrolls inside itself`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(size);
      await openKit(page, kitId);
      const s = await state(page);
      // no page scroll, either way
      expect(await pageScrolls(page), 'the page fits the window').toMatchObject({ down: false, sideways: false });
      // the scene and the list side by side, both inside the window
      const scene = await stage(page).boundingBox(), right = await side(page).boundingBox();
      expect(scene.x + scene.width).toBeLessThanOrEqual(right.x + 1);
      expect(right.x + right.width).toBeLessThanOrEqual(size.width + 1);
      expect(scene.y + scene.height).toBeLessThanOrEqual(size.height);
      expect(scene.width, 'the scene takes most of the width').toBeGreaterThan(size.width * 0.5);
      // whole-number zoom: one sprite pixel is a square of whole screen pixels
      expect(Number.isInteger(s.zoom)).toBe(true);
      expect(Math.round(scene.width)).toBe(s.view.w * s.zoom);
      // every thing that belongs in the scene is in it, and in the picture, without walking
      const inScene = new Set([...(s.player ? [s.player.kind] : []), ...s.things.map((t) => t.kind)]);
      for (const key of s.plan.scene) expect(inScene.has(key), `${key} is in the scene`).toBe(true);
      const where = await outOfPicture(page);
      expect(where.count).toBeGreaterThan(5);
      expect(where.out, 'things outside the picture').toEqual([]);
      // the list of the bag: one row for every sprite in it, and it scrolls inside itself
      const rows = await list(page).locator('li.play-row:not(.is-sound)').count();
      const sprites = (await page.evaluate(async () => (await import('/app/bag.js')).bag.items())).filter((i) => i.kind === 'sprite').length;
      expect(rows).toBe(sprites);
      const scroller = await list(page).evaluate((n) => ({ sh: n.scrollHeight, ch: n.clientHeight, oy: getComputedStyle(n).overflowY }));
      expect(scroller.oy).toMatch(/auto|scroll/);
      expect(scroller.sh, 'a full kit is longer than the column').toBeGreaterThan(scroller.ch);
      // the bar under the scene is there and inside the window
      for (const name of ['Pause', 'Mute']) await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Reset the scene' })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'More' })).toBeInViewport();
      // and the score, health and interface pieces lie over the scene's top edge, not in a row above it
      const hud = page.locator('.play-hud');
      if (await hud.count()) {
        const h = await hud.boundingBox();
        expect(h.y).toBeGreaterThanOrEqual(scene.y - 1);
        expect(h.y).toBeLessThan(scene.y + 24);
      }
      await page.screenshot({ path: test.info().outputPath(`${kitId}-${size.width}.png`) });
    });
  }
}

test('a whole kit: its background is the scene\'s background, and another one in the bag can be chosen from its row', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKit(page, 'kit-platformer-fantasy');
  const forest = await keyOf(page, 'bg-forest'), castle = await keyOf(page, 'bg-castle');
  let s = await state(page);
  expect(s.plan.background).toBe(forest);
  expect(s.backdrop, 'drawn from the bag, not the plain sky').toBe('bag');
  const row = list(page).locator('li.play-row').filter({ has: page.getByRole('button', { name: rowOf['bg-castle'].name, exact: true }) });
  await row.getByRole('button', { name: rowOf['bg-castle'].name, exact: true }).click();
  await row.getByRole('button', { name: 'Use as background' }).click();
  await expect.poll(async () => (await state(page)).plan.background).toBe(castle);
  await ready(page);
  s = await state(page);
  expect(s.backdrop).toBe('bag');
});

test('a top-down kit with a background: the background fills the room round the scene', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKit(page, 'kit-roguelite-scifi');
  const s = await state(page);
  expect(s.mode).toBe('top');
  expect(s.plan.background).toBe(await keyOf(page, 'bg-starfield'));
  expect(s.backdrop).toBe('bag');
});

test('a row picked in the list shows its animations as chips; a chip plays that animation on that thing in the scene', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLink(page, [{ kind: 'sprite', id: 'slime', settings: {} }]);
  const slime = await keyOf(page, 'slime');
  const chips = page.locator('.play-anims');
  // the slime's row: it is marked, and its animations are under the scene
  await list(page).getByRole('button', { name: 'Slime', exact: true }).click();
  expect((await state(page)).chosen).toBe(slime);
  await expect(chips).toContainText('Slime');
  const names = await page.evaluate(async () => Object.keys((await import('/sprites/slime.js')).default.clips));
  await expect(chips.locator('button[data-clip]')).toHaveCount(names.length);
  // pick one that is not what it does by itself, and it plays that, and keeps playing it
  const pick = names.find((n) => /hurt|die|attack|jump/.test(n)) ?? names.at(-1);
  await chips.locator(`button[data-clip="${pick}"]`).click();
  await expect(chips.locator(`button[data-clip="${pick}"]`)).toHaveAttribute('aria-pressed', 'true');
  const playing = async () => (await state(page)).things.filter((t) => t.kind === slime).every((t) => t.clip === pick);
  await expect.poll(playing).toBe(true);
  await page.waitForTimeout(1500);
  expect(await playing(), 'it keeps playing while chosen').toBe(true);
  // the character the player moves: a chip plays the move once
  const hero = await keyOf(page, 'knight');
  await list(page).getByRole('button', { name: 'Hero', exact: true }).click();
  expect((await state(page)).chosen).toBe(hero);
  const heroClip = await chips.locator('button[data-clip]').evaluateAll((bs) => bs.map((b) => b.dataset.clip).find((c) => /attack|slash|cast/.test(c)));
  expect(heroClip).toBeTruthy();
  await chips.locator(`button[data-clip="${heroClip}"]`).click();
  await expect.poll(async () => (await state(page)).player.clip).toBe(heroClip);
  await expect.poll(async () => (await state(page)).player.clip, { timeout: 10_000 }).toMatch(/^idle/);
});

test('Change on the picked row opens the panel in place of the list; a colour picked there shows in the scene; and back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLink(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(list(page)).toBeVisible();
  await expect(side(page).locator('.rx-panel')).toHaveCount(0);
  await list(page).getByRole('button', { name: 'Hero', exact: true }).click();
  await list(page).getByRole('button', { name: 'Change Hero' }).click();
  const panel = side(page).locator('.rx-panel');
  await expect(panel).toBeVisible();
  await expect(list(page)).toBeHidden();
  await panel.getByRole('tab', { name: /^Colours/ }).click();
  const before = (await canvasStats(stage(page))).hash;
  await side(page).locator('[data-pane="colours"] .swatches').first().locator('button.swatch:not([aria-pressed="true"])').last().click();
  await expect.poll(async () => (await canvasStats(stage(page))).hash, { timeout: 1500, intervals: [50] }).not.toBe(before);
  // the page still does not scroll: the panel scrolls inside the column
  expect(await pageScrolls(page)).toMatchObject({ down: false, sideways: false });
  await side(page).getByRole('button', { name: /All things in your bag/ }).click();
  await expect(list(page)).toBeVisible();
  await expect(panel).toHaveCount(0);
  // the look of the whole bag is at the top of the column, apart from any one thing
  await expect(side(page).getByRole('button', { name: /whole bag/i })).toBeVisible();
});

test('sounds have a Play button and music Play and Stop, in the list', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openLink(page);
  const items = await page.evaluate(async () => (await import('/app/bag.js')).bag.items());
  const sound = items.find((i) => i.kind === 'sound'), track = items.find((i) => i.kind === 'music');
  await expect(list(page).locator('.play-board').getByRole('button', { name: `Play ${rowOf[sound.id].name}` })).toBeVisible();
  const music = list(page).locator('.play-music');
  await music.scrollIntoViewIfNeeded();
  await music.getByRole('button', { name: /^Play music/ }).click();
  await expect(music.getByRole('button', { name: /^Stop music/ })).toBeVisible({ timeout: 30_000 });
  await music.getByRole('button', { name: /^Stop music/ }).click();
  await expect(music.getByRole('button', { name: /^Play music/ })).toBeVisible();
  expect(rowOf[track.id]).toBeTruthy();
});

test('390 x 844: the scene stays pinned at the top while the rest scrolls under it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openKit(page, 'kit-platformer-fantasy');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const box = await stage(page).evaluate((n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  expect(box.top).toBeGreaterThanOrEqual(-1);
  expect(box.bottom).toBeLessThanOrEqual(844);
  expect(await hasHorizontalScroll(page)).toBe(false);
  const where = await outOfPicture(page);
  expect(where.out).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('platformer-390.png') });
});
