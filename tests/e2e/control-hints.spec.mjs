// Each Fine-tune control has a small ? that opens a hint under it (app/hints.js): what it is, its ends or choices, and what
// its value stands for now, kept in step as the value moves. It sits on sprite and sound pages alike.
import { test, expect, openRoute } from '../helpers/test.mjs';

test('a sprite control opens a hint that follows its value', async ({ page }) => {
  await openRoute(page, '/sprite/knight');
  const row = page.locator('[data-control="height"]');
  const hint = row.locator('.ctl-help');
  await expect(hint).toBeHidden();
  await row.getByRole('button', { name: 'What Height does' }).click();
  await expect(hint).toContainText('How tall it is.');
  await expect(hint).toContainText('Slide from Short to Tall.');
  await row.locator('input[type=range]').fill('1');
  await expect(hint).toContainText('Now: all the way to Tall.');
  await row.getByRole('button', { name: 'What Height does' }).click();
  await expect(hint).toBeHidden();
  await expect(row.locator('.ctl-label').first()).toHaveText('Height');      // the ? adds no words to the name
});

test('a choice and a colour say what they are and what is picked', async ({ page }) => {
  await openRoute(page, '/sprite/knight');
  await page.getByRole('tab', { name: 'Colours' }).click();
  const skin = page.locator('[data-control="skin"]');
  await skin.getByRole('button', { name: /^What .* does$/ }).click();
  await expect(skin.locator('.ctl-help')).toContainText('Pick a swatch, or any colour you like.');
  await expect(skin.locator('.ctl-help .help-now')).toContainText(/^Now: \w/);
});

test('a sound control has its hint too', async ({ page }) => {
  await openRoute(page, '/sound/achievement-pop');
  const row = page.locator('[data-control="pitch"]');
  await row.getByRole('button', { name: 'What Pitch does' }).click();
  await expect(row.locator('.ctl-help')).toContainText('How high or low the note is.');
  await expect(row.locator('.ctl-help .help-now')).toContainText('Now:');
});
