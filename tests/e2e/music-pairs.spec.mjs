// The classic pairs on a music page: six one-tap chips that set the melody instrument and the instrument that plays along
// together (sound/pairs.js, app/music-page.js). A track without the "Plays along" choice (the older Python-made battle-theme) shows none.
import { test, expect, openRoute, showControl, setRange } from '../helpers/test.mjs';

const hashNow = (page) => page.evaluate(() => location.hash);
const pairs = (page) => page.getByRole('group', { name: 'Pairs that go well together' }).getByRole('button');
const choice = (page, name) => page.getByRole('group', { name, exact: true }).getByRole('button');

test.describe('music pairs', () => {
  test('six chips; a tap sets the melody instrument and the instrument that plays along, the link and the saved state follow', async ({ page }) => {
    await openRoute(page, '/music/menu-folk');
    await expect(pairs(page)).toHaveText(['Guitar + Bass', 'Piano + Violin', 'Piano + Bass', 'Flute + Guitar', 'Trumpet + Piano', 'Bell + Piano']);
    for (const chip of await pairs(page).all()) await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await pairs(page).first().click();
    await expect(pairs(page).first()).toHaveAttribute('aria-pressed', 'true');
    await showControl(page, 'inst');
    await expect(choice(page, 'Melody instrument').nth(5)).toHaveAttribute('aria-pressed', 'true');
    await expect(choice(page, 'Melody instrument')).toHaveCount(10);
    await expect(choice(page, 'Plays along')).toHaveText(['None', 'Guitar', 'Piano', 'Violin', 'Trumpet', 'Bass']);
    await expect(choice(page, 'Plays along').nth(5)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => hashNow(page)).toContain('inst=5');
    await expect.poll(() => hashNow(page)).toContain('along=5');
    await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
    // another pair moves both; the first goes back to unpressed
    await pairs(page).nth(4).click();
    await expect(pairs(page).nth(4)).toHaveAttribute('aria-pressed', 'true');
    await expect(pairs(page).first()).toHaveAttribute('aria-pressed', 'false');
    await expect(choice(page, 'Melody instrument').nth(8)).toHaveAttribute('aria-pressed', 'true');
    await expect(choice(page, 'Plays along').nth(2)).toHaveAttribute('aria-pressed', 'true');
    // choosing an instrument by hand leaves the pair: the chip lets go
    await choice(page, 'Melody instrument').nth(1).click();
    await expect(pairs(page).nth(4)).toHaveAttribute('aria-pressed', 'false');
  });

  test('Plays along volume is a slider right after Melody, and moving it changes the link', async ({ page }) => {
    await openRoute(page, '/music/menu-folk');
    await showControl(page, 'alongLevel');
    const keys = await page.locator('.rx-panel .ctl input[type=range]').evaluateAll((els) => els.map((e) => e.dataset.key));
    expect(keys.indexOf('alongLevel')).toBe(keys.indexOf('lead') + 1);
    await expect(page.locator('.rx-panel .ctl', { has: page.locator('input[data-key=alongLevel]') })).toContainText('Plays along volume');
    await setRange(page.locator('input[data-key=alongLevel]'), 'max');
    await expect.poll(() => hashNow(page)).toContain('alongLevel=1');
  });

  test('the same instrument as the melody and along says it adds nothing', async ({ page }) => {
    await openRoute(page, '/music/menu-folk');
    await showControl(page, 'inst');
    await choice(page, 'Melody instrument').nth(5).click();
    await choice(page, 'Plays along').nth(1).click();
    await expect(page.locator('.pairs .hint').last()).toContainText('Guitar is already playing the tune');
    await choice(page, 'Plays along').nth(5).click();
    await expect(page.locator('.pairs .hint').last()).toHaveText('');
  });

  test('a track that has no Plays along choice shows no pairs', async ({ page }) => {
    await openRoute(page, '/music/battle-theme');
    await expect(page.locator('main.v2.rx .stage-card')).toBeVisible();
    await expect(page.locator('.pairs')).toHaveCount(0);
  });

  test('the chips wrap on a phone without scrolling the page sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openRoute(page, '/music/menu-folk');
    await expect(pairs(page)).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
