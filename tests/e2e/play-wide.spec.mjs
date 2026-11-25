// The playground's panel made big (app/play-page.js): the icon at the top of the panel moves the same panel into a window
// over the page, with room for its controls. Nothing is lost or started again: the tab, what was changed and the scene
// carry on. Escape, the Make smaller icon or a click outside the window put it back in the column.
import { test, expect, openRoute, setRange } from '../helpers/test.mjs';

const SPRITE = (id) => ({ kind: 'sprite', id, settings: { params: {}, cues: null, scale: 1 } });
const state = (page) => page.evaluate(() => window.__loadoutPlay.state());
const side = (page) => page.locator('.play-side');
const big = (page) => page.locator('dialog.play-wide');

test.use({ viewport: { width: 1440, height: 900 } });

test('the panel made big keeps what was changed, and goes back to the column the way it came', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(async (list) => { const { bag } = await import('/app/bag.js'); bag.clear(); for (const it of list) bag.add(it); }, [SPRITE('knight'), SPRITE('slime'), SPRITE('coin')]);
  await page.goto('/index.html#/play');
  await page.waitForFunction(() => window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
  const list = side(page).locator('.play-list');
  await list.locator('li', { hasText: 'Hero' }).locator('.play-row-pick').click();
  await page.locator('.play-inspector').getByRole('button', { name: 'Customise Hero' }).click();
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Hero');
  // no way off to the asset's page here any more: the panel is made big instead
  await expect(side(page).getByRole('link', { name: 'Open its page' })).toHaveCount(0);

  // a change, and another tab, before it is made big
  const panel = page.locator('.rx-panel[aria-label="Change Hero"]');
  await panel.getByRole('tab', { name: /Colours/ }).click();
  await panel.getByRole('tab', { name: /Shape/ }).click();
  const slider = panel.locator('input[type=range]').first();
  await setRange(slider, 'other');
  const v1 = await slider.inputValue();
  const saved = () => page.evaluate(async () => { const { bag } = await import('/app/bag.js'); return JSON.stringify(bag.items().find((i) => i.id === 'knight').settings); });
  await expect.poll(saved).not.toBe(JSON.stringify(SPRITE('knight').settings));
  const before = await saved();
  const panelNode = await panel.elementHandle();

  await side(page).getByRole('button', { name: 'Make the panel for Hero bigger' }).click();
  await expect(big(page)).toBeVisible();
  expect((await state(page)).big).toBe(true);
  // the very same panel, moved: its tab and what was changed are still there
  expect(await panelNode.evaluate((n) => !!n.closest('dialog.play-wide'))).toBe(true);
  await expect(big(page).getByRole('tab', { name: /Shape/ })).toHaveAttribute('aria-selected', 'true');
  await expect(big(page).locator('input[type=range]').first()).toHaveValue(v1);
  expect(await saved()).toBe(before);
  const wide = await big(page).boundingBox();
  expect(wide.width).toBeGreaterThan(800);
  await expect(big(page).getByRole('button', { name: 'Make the panel for Hero smaller' })).toBeFocused();
  // keys pressed in it are its own (Escape aside): they never move the hero
  const x0 = (await state(page)).player.x;
  await big(page).locator('input[type=range]').first().focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press(Number(v1) > 0 ? 'ArrowLeft' : 'ArrowRight');
  await page.waitForTimeout(300);
  expect(await big(page).locator('input[type=range]').first().inputValue(), 'the arrow keys moved the slider').not.toBe(v1);
  expect((await state(page)).player.x, 'and not the hero').toBe(x0);
  const changedInBig = await saved();

  // Escape puts it back in the column, still the same panel; the bag kept every change
  await page.keyboard.press('Escape');
  await expect(big(page)).toBeHidden();
  expect((await state(page)).big).toBe(false);
  expect((await state(page)).panel).not.toBe(null);
  expect(await panelNode.evaluate((n) => !!n.closest('.play-side'))).toBe(true);
  await expect(side(page).getByRole('button', { name: 'Make the panel for Hero bigger' })).toBeFocused();
  await expect.poll(saved).toBe(changedInBig);
  await expect(panel.locator('input[type=range]').first()).not.toHaveValue(v1);

  // made big again; its Make smaller icon, then a click outside the window, each put it back
  await side(page).getByRole('button', { name: 'Make the panel for Hero bigger' }).click();
  await big(page).getByRole('button', { name: 'Make the panel for Hero smaller' }).click();
  await expect(big(page)).toBeHidden();
  await side(page).getByRole('button', { name: 'Make the panel for Hero bigger' }).click();
  await page.mouse.click(8, 450);
  await expect(big(page)).toBeHidden();
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Hero');

  // "All things in your bag" from the big panel closes it and shows the list
  await side(page).getByRole('button', { name: 'Make the panel for Hero bigger' }).click();
  await big(page).getByRole('button', { name: /All things in your bag/ }).click();
  await expect(big(page)).toBeHidden();
  await expect(list).toBeVisible();
  expect((await state(page)).panel).toBe(null);
});
