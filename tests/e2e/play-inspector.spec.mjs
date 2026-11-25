// The playground's picked-thing card, dragging things in the scene, and choosing the ground and sky when the bag has several.
import { test, expect, openRoute } from '../helpers/test.mjs';
import { hasLibrarySprite, librarySpriteFile } from '../helpers/library.mjs';

const SPRITE = (id) => ({ kind: 'sprite', id, settings: { params: {}, cues: null, scale: 1 } });
const HERO = SPRITE('knight'), SLIME = SPRITE('slime'), COIN = SPRITE('coin');
const addSprites = (page, ids) => page.evaluate(async (list) => {
  const defs = [];
  for (const src of list) defs.push(await (await import('/app/catalog.js')).loadDataFile(`/${src}`));
  await window.__loadoutPlay.addAssets(defs);
}, ids.map((id) => librarySpriteFile(id)));
async function openPlay(page, items) {
  await openRoute(page, '/');
  await page.evaluate(async (list) => { const { bag } = await import('/app/bag.js'); bag.clear(); for (const it of list) bag.add(it); }, items);
  await page.goto('/index.html#/play');
  await page.waitForFunction(() => document.querySelector('main.play-page') && window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
}
const state = (page) => page.evaluate(() => window.__loadoutPlay.state());
const spot = (page, key) => page.evaluate((k) => window.__loadoutPlay.spot(k), key);

test('a picked thing gets a card: its name, Surprise me, Customise and its animations to try', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN]);
  const card = page.locator('.play-inspector');
  await expect(card).toContainText('Pick a thing');
  await page.locator('.play-things li', { hasText: 'Slime' }).locator('.play-row-pick').click();
  await expect(card.locator('.play-anims-name')).toHaveText('Slime');
  await expect(card.getByRole('button', { name: /Surprise me, picked in the scene/ })).toHaveClass(/btn-magic/);
  await expect(card.getByRole('button', { name: 'Customise Slime' })).toBeVisible();
  await expect(card.locator('.play-insp-label')).toHaveText('Animations');
  expect(await card.locator('.chip').count()).toBeGreaterThan(1);
  await expect(card).toContainText('Drag the thing in the scene to move it');
});

test('a thing is dragged across the scene and put down on the ground; a click that does not move only picks it', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN]);
  await page.waitForTimeout(800);                         // the scene is laid out once more as the page settles
  const before = (await state(page)).things.find((t) => t.id === 'slime');
  const p = await spot(page, before.kind);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x - 60, p.y - 50, { steps: 6 });
  const mid = (await state(page)).things.find((t) => t.id === 'slime');
  expect(mid.x, 'it follows the pointer').toBeLessThan(before.x - 10);
  expect(mid.y, 'and is held in the air').toBeLessThan(before.y - 10);
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).things.find((t) => t.id === 'slime').y).toBeGreaterThan(before.y - 2);
  const after = (await state(page)).things.find((t) => t.id === 'slime');
  expect(after.x).toBeLessThan(before.x - 10);
  // a click without a move leaves it where it is
  const q = await spot(page, after.kind);
  await page.mouse.click(q.x, q.y);
  const still = (await state(page)).things.find((t) => t.id === 'slime');
  expect(Math.abs(still.x - after.x)).toBeLessThan(2);
  await expect(page.locator('.play-inspector .play-anims-name')).toHaveText('Slime');
});

test('with two tilesets and two backgrounds in the bag, the ground and the sky can each be chosen', async ({ page }) => {
  test.skip(!['tiles-forest', 'tiles-platforms', 'bg-forest', 'bg-castle'].every(hasLibrarySprite), 'the tilesets and backgrounds are not all there');
  await openPlay(page, [HERO, SLIME, COIN]);
  await expect(page.locator('.play-env')).toBeHidden();                    // nothing to choose yet
  await addSprites(page, ['tiles-forest', 'tiles-platforms', 'bg-forest', 'bg-castle']);
  const env = page.locator('.play-env');
  await expect(env).toBeVisible();
  const ground = env.getByRole('group', { name: 'Ground' }), sky = env.getByRole('group', { name: 'Sky and background' });
  await expect(ground.getByRole('button', { name: 'All together' })).toHaveAttribute('aria-pressed', 'true');
  expect((await state(page)).plan.tilesets.length).toBe(2);
  await ground.locator('.play-env-opt').nth(1).click();
  await expect(ground.locator('.play-env-opt').nth(1)).toHaveAttribute('aria-pressed', 'true');
  expect((await state(page)).plan.tilesets.length, 'one ground now').toBe(1);
  await ground.getByRole('button', { name: 'All together' }).click();
  expect((await state(page)).plan.tilesets.length).toBe(2);
  const first = (await state(page)).plan.background;
  await sky.locator('.play-env-opt[aria-pressed="false"]').first().click();
  expect((await state(page)).plan.background).not.toBe(first);
});
