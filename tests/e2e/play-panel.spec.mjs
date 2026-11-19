// The playground's editing panel (docs/site-design.md, section 5, "Playground"; section 3, "Changes save themselves";
// docs/playground-tray-workbench.md, section 1): the scene on the left, and on the right the list of what is in the bag.
// "Change" on the picked row opens the same panel as an asset page in the right column, in place of the list; a click on
// a thing in the scene picks its row, or, with the panel open, puts that thing in the panel. A change made there is saved
// to the bag as it is made and the running scene takes it, without starting again; and keys pressed in the panel never
// move the character.
import { test, expect, openRoute, canvasStats, setRange, hasHorizontalScroll, showControl, savedState } from '../helpers/test.mjs';

const SPRITE = (id) => ({ kind: 'sprite', id, settings: { params: {}, cues: null, scale: 1 } });
const HERO = SPRITE('knight'), SLIME = SPRITE('slime'), COIN = SPRITE('coin');
const MUSIC = { kind: 'music', id: 'battle-theme', settings: { params: {}, style: null } };

async function openPlay(page, items = []) {
  await openRoute(page, '/');
  await page.evaluate(async (list) => { const { bag } = await import('/app/bag.js'); bag.clear(); for (const it of list) bag.add(it); }, items);
  await page.goto('/index.html#/play');
  await ready(page);
}
const ready = (page) => page.waitForFunction(() => document.querySelector('main.play-page') && window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
const state = (page) => page.evaluate(() => window.__loadoutPlay.state());
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());
const stage = (page) => page.locator('canvas.play-stage');
const side = (page) => page.locator('.play-side');
const keyOf = async (page, id) => (await bagItems(page)).find((i) => i.id === id).key;
const list = (page) => side(page).locator('.play-list');
/** Pick a thing's row in the list and press its "Change": the panel opens on it in place of the list. */
async function change(page, name) {
  const row = list(page).getByRole('button', { name, exact: true });
  if (await row.count()) {
    await row.click();
    await list(page).getByRole('button', { name: `Change ${name}` }).click();
  } else await list(page).locator('li.play-row', { has: page.locator('.play-name', { hasText: name }) }).getByRole('button', { name: 'Change', exact: true }).click();      // a sound or a track
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', `Change ${name}`);
}

test('the list first; a click on a thing in the scene picks its row; Change opens the panel, and with it open a click puts that thing in it', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN]);
  const hero = await keyOf(page, 'knight'), slime = await keyOf(page, 'slime'), coin = await keyOf(page, 'coin');
  await expect(side(page)).toBeVisible();
  await expect(list(page)).toBeVisible();
  await expect(side(page).locator('.rx-panel')).toHaveCount(0);
  expect((await state(page)).chosen).toBe(null);

  // the slime, clicked where it stands in the scene: its row is picked
  await page.getByRole('button', { name: 'Pause' }).click();
  const at = await page.evaluate((k) => window.__loadoutPlay.spot(k), slime);
  await page.mouse.click(at.x, at.y);
  expect((await state(page)).chosen).toBe(slime);
  await expect(list(page).getByRole('button', { name: 'Slime', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // its Change opens the panel, versions first, then the tabs
  await list(page).getByRole('button', { name: 'Change Slime' }).click();
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Slime');
  await expect(side(page).getByRole('button', { name: 'Surprise me' })).toBeVisible();
  expect((await state(page)).panel).toBe(slime);

  // with the panel open, a click on the hero in the scene puts the hero in it
  const h = await page.evaluate((k) => window.__loadoutPlay.spot(k), hero);
  await page.mouse.click(h.x, h.y);
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Hero');
  expect((await state(page)).chosen).toBe(hero);

  // back to the list, and the coin's Change
  await side(page).getByRole('button', { name: /All things in your bag/ }).click();
  await change(page, 'Coin');
  expect((await state(page)).chosen).toBe(coin);
  // a click on empty sky changes nothing
  const box = await stage(page).boundingBox();
  await page.mouse.click(box.x + box.width - 4, box.y + 4);
  expect((await state(page)).chosen).toBe(coin);
});

test('a change in the panel is saved to the bag and drawn in the running scene, which does not start again; it is still there after a reload', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN]);
  const hero = await keyOf(page, 'knight');
  // walk a little, so the scene is not at its start
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(70);
  await page.keyboard.up('ArrowRight');
  await page.getByRole('button', { name: 'Pause' }).click();
  const before = await state(page);
  const picture = (await canvasStats(stage(page))).hash;
  await expect(page.locator('.play-tag')).toHaveCount(0);
  await change(page, 'Hero');

  const weapon = await showControl(page, 'weapon');
  await weapon.getByRole('button', { name: 'Axe' }).click();

  await expect(savedState(page)).toContainText('Saved in your bag');
  await expect.poll(async () => (await bagItems(page)).find((i) => i.key === hero).settings.params.weapon).toBe('axe');
  expect((await bagItems(page)).length, 'the item was changed, not copied').toBe(3);
  await expect.poll(async () => (await canvasStats(stage(page))).hash, { message: 'the scene shows the axe' }).not.toBe(picture);
  const after = await state(page);
  expect(after.player.x, 'the character is where it was').toBe(before.player.x);
  expect(after.things.length, 'nothing in the scene was put back').toBe(before.things.length);
  expect(after.chosen).toBe(hero);
  await expect(page.locator('.play-things li', { hasText: 'Hero' }).locator('.play-tag')).toHaveText(/your version/i);      // in the list, behind the panel
  await expect(stage(page)).toHaveCount(1);

  // a slider, dragged: saved as well, and the scene still runs on
  await setRange((await showControl(page, 'height')).locator('input[type=range]'), 'max');
  await expect.poll(async () => (await bagItems(page)).find((i) => i.key === hero).settings.params.height).toBe(1);
  expect((await state(page)).player.x).toBe(before.player.x);

  await page.reload();
  await ready(page);
  const kept = (await bagItems(page)).find((i) => i.id === 'knight');
  expect(kept.settings.params.weapon).toBe('axe');
  expect(kept.settings.params.height).toBe(1);
  await expect((await showControl(page, 'weapon')).getByRole('button', { name: 'Axe' })).toHaveAttribute('aria-pressed', 'true');
});

test('a ready-made version and Start over change the character in the scene, and the bag with it', async ({ page }) => {
  await openPlay(page, [HERO]);
  await page.getByRole('button', { name: 'Pause' }).click();
  await change(page, 'Hero');
  const plain = (await canvasStats(stage(page))).hash;
  const version = side(page).locator('.vbtn').nth(1);
  await version.click();
  await expect(version).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await canvasStats(stage(page))).hash).not.toBe(plain);
  await expect(savedState(page)).toContainText('Saved in your bag');
  await side(page).locator('.rx-block').getByRole('button', { name: 'Start over' }).click();
  await expect.poll(async () => (await canvasStats(stage(page))).hash, { message: 'Start over draws the original again' }).toBe(plain);
  expect((await bagItems(page)).length, 'Start over keeps it in the bag').toBe(1);
});

test('keys pressed in the panel are the panel\'s: they never move the character, and a click on the scene gives the keys back', async ({ page }) => {
  await openPlay(page, [HERO, SLIME]);
  await change(page, 'Hero');
  const x0 = (await state(page)).player.x;
  const slider = (await showControl(page, 'height')).locator('input[type=range]');
  await slider.focus();
  const v0 = Number(await slider.inputValue());
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect(Number(await slider.inputValue()), 'the arrow key moved the slider').toBeGreaterThan(v0);
  expect((await state(page)).player.x, 'and not the character').toBe(x0);

  // a tab, reached with the keyboard: the arrow keys move between tabs
  await side(page).getByRole('tab', { name: 'Shape' }).focus();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  expect((await state(page)).player.x).toBe(x0);
  // Space on a button of the panel presses that button and does not jump
  await side(page).getByRole('button', { name: 'Surprise me' }).focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  expect((await state(page)).player.onGround).toBe(true);

  // back in the scene: the same key walks
  const box = await stage(page).boundingBox();
  await page.mouse.click(box.x + box.width - 4, box.y + 4);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).player.x, { message: 'the scene is playable while the panel is open' }).toBeGreaterThan(x0 + 10);
  await page.keyboard.up('ArrowRight');
});

test('a track changed in the panel is saved, and the scene\'s track takes it at once', async ({ page }) => {
  await openPlay(page, [HERO, MUSIC]);
  const track = await keyOf(page, 'battle-theme');
  await change(page, 'Battle theme');
  const was = JSON.stringify((await state(page)).tracks[track]);
  const x = (await state(page)).player.x;
  await side(page).locator('.rx-panel').getByRole('button', { name: 'Surprise me' }).click();
  await expect.poll(async () => JSON.stringify((await bagItems(page)).find((i) => i.key === track).settings.params)).not.toBe('{}');
  await expect.poll(async () => JSON.stringify((await state(page)).tracks[track]), { message: 'the playing track has the new settings' }).not.toBe(was);
  await expect(stage(page)).toHaveCount(1);
  expect((await state(page)).player.x).toBe(x);
});

test('the look of everything is one button away beside the panel: it restyles the scene and stays open', async ({ page }) => {
  // J5.4: no longer an "Everything" tab of the thing's panel, but its own "Look of the whole bag" control
  await openPlay(page, [HERO, SLIME, COIN]);
  await page.getByRole('button', { name: 'Pause' }).click();
  const plain = (await canvasStats(stage(page))).hash;
  const open = side(page).getByRole('button', { name: 'Look of the whole bag' });
  await open.click();
  const look = side(page).locator('.play-look');
  await look.getByRole('button', { name: 'Frost', exact: true }).click();
  await ready(page);
  await expect.poll(async () => (await canvasStats(stage(page))).hash).not.toBe(plain);
  await expect(look.getByRole('button', { name: 'Frost', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(look).toBeVisible();
  await expect(open).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(async () => (await import('/app/bag.js')).bag.theme().colour.palette)).toBe('Frost');
});

for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 900, height: 700 }, { width: 390, height: 844 }]) {
  test(`${size.width} x ${size.height}: the scene and the panel are both there and nothing scrolls sideways`, async ({ page }) => {
    await page.setViewportSize(size);
    await openPlay(page, [HERO, SLIME, COIN, MUSIC]);
    await expect(stage(page)).toBeVisible();
    await change(page, 'Hero');
    await expect(side(page).locator('.rx-panel')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    // every tab of the panel is whole and in view, and so is the way to the look of the whole bag (J5.4: its own
    // button, no longer an "Everything" tab); and nothing in its head is cut off
    const panelBox = await side(page).boundingBox();
    const tabs = await side(page).getByRole('tab').all();
    const whole = side(page).getByRole('button', { name: 'Look of the whole bag' });
    await expect(whole).toBeVisible();
    const wb = await whole.boundingBox();
    expect(wb.x).toBeGreaterThanOrEqual(panelBox.x);
    expect(wb.x + wb.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
    expect(await whole.evaluate((n) => n.scrollWidth <= n.clientWidth + 1), 'the button\'s words are not cut off').toBe(true);
    for (const tab of tabs) {
      await expect(tab).toBeVisible();
      const b = await tab.boundingBox();
      expect(b.x, await tab.textContent()).toBeGreaterThanOrEqual(panelBox.x);
      expect(b.x + b.width, await tab.textContent()).toBeLessThanOrEqual(panelBox.x + panelBox.width);
      expect(await tab.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    }
    expect(await side(page).getByRole('tablist').evaluate((n) => n.scrollWidth <= n.clientWidth + 1), 'the row of tabs does not scroll').toBe(true);
    if (size.width > 720) {
      // two columns, one screen: the panel is beside the scene; the page does not scroll, the column scrolls as one
      // (nothing inside the panel scrolls on its own), and the scene stays in view at the end of the panel
      const s = await stage(page).boundingBox(), p = await side(page).boundingBox();
      expect(p.x).toBeGreaterThanOrEqual(s.x + s.width - 1);
      expect(p.y).toBeLessThan(size.height);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'the page does not scroll').toBe(true);
      const scrollers = await side(page).evaluate((n) => [n, ...n.querySelectorAll('*')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).map((e) => e.className));
      expect(scrollers.every((c) => /play-edit-view/.test(c)), `only the column scrolls: ${scrollers}`).toBe(true);
      await side(page).locator('.play-edit-view').evaluate((n) => n.scrollTo(0, n.scrollHeight));
      expect(await stage(page).evaluate((n) => { const r = n.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }), 'the scene is still in view at the end of the panel').toBe(true);
    } else {
      // a phone: the scene is pinned at the top while the page scrolls down the panel
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      expect(await stage(page).evaluate((n) => { const r = n.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight; }), 'the scene is pinned in view').toBe(true);
    }
  });
}

test('an empty bag has no panel', async ({ page }) => {
  await openPlay(page, []);
  await expect(side(page)).toBeHidden();
});

test('the ground and the background can be clicked too, and what was picked is marked in the scene', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, SPRITE('tiles-forest'), SPRITE('bg-forest')]);
  const slime = await keyOf(page, 'slime'), tiles = await keyOf(page, 'tiles-forest'), bg = await keyOf(page, 'bg-forest');
  await page.getByRole('button', { name: 'Pause' }).click();
  const box = await stage(page).boundingBox();
  // the bottom row of the picture is ground; its top corner is sky
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 6);
  expect((await state(page)).chosen).toBe(tiles);
  await expect(list(page).getByRole('button', { name: 'Forest ground tiles', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(box.x + box.width - 4, box.y + 4);
  expect((await state(page)).chosen).toBe(bg);
  await expect(list(page).getByRole('button', { name: 'Forest backdrop', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // a thing that was picked gets a mark around it; picking something else takes the mark off it
  const unmarked = (await canvasStats(stage(page))).hash;
  const at = await page.evaluate((k) => window.__loadoutPlay.spot(k), slime);
  await page.mouse.click(at.x, at.y);
  expect((await state(page)).chosen).toBe(slime);
  await expect.poll(async () => (await canvasStats(stage(page))).hash, { message: 'the slime is marked' }).not.toBe(unmarked);
  await page.mouse.click(box.x + box.width - 4, box.y + 4);
  await expect.poll(async () => (await canvasStats(stage(page))).hash, { message: 'the mark is gone' }).toBe(unmarked);
});

test('a sprite that wears a look of its own is drawn in it in the scene', async ({ page }) => {
  await openPlay(page, [HERO]);
  await page.getByRole('button', { name: 'Pause' }).click();
  await change(page, 'Hero');
  const plain = (await canvasStats(stage(page))).hash;
  await side(page).getByRole('tab', { name: 'Look' }).click();
  await side(page).getByRole('group', { name: 'Its own look' }).getByRole('button', { name: 'Frost' }).click();
  await expect.poll(async () => (await bagItems(page))[0].settings.look).toBe('frost');
  await expect.poll(async () => (await canvasStats(stage(page))).hash).not.toBe(plain);
  expect(await page.evaluate(async () => (await import('/app/bag.js')).bag.theme().colour.palette), 'the bag keeps its own look').toBeNull();
  await side(page).getByRole('group', { name: 'Its own look' }).getByRole('button', { name: 'Follows the bag' }).click();
  await expect.poll(async () => (await canvasStats(stage(page))).hash).toBe(plain);
});

test('a sound and a track that wear a look of their own are played in it, not in the bag\'s', async ({ page }) => {
  const heard = () => page.evaluate(() => (window.__played ?? []).length);
  await page.addInitScript(() => {
    window.__played = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { const d = this.buffer.getChannelData(0); let h = 2166136261; for (let i = 0; i < d.length; i += 7) h = Math.imul(h ^ Math.round(d[i] * 32767), 16777619); window.__played.push(`${this.buffer.length}:${h >>> 0}`); return start.apply(this, a); };
  });
  const play = async (items, name) => {
    await openPlay(page, items);
    const n = await heard();
    await page.locator('.play-board').getByRole('button', { name: `Play ${name}` }).click();
    await expect.poll(heard).toBeGreaterThan(n);
    return page.evaluate(() => window.__played.at(-1));
  };
  const coin = (settings = {}) => ({ kind: 'sound', id: 'explosion', settings: { params: {}, style: null, seed: 1, ...settings } });
  const plain = await play([coin()], 'Explosion');
  const frost = await play([coin({ look: 'frost' })], 'Explosion');
  expect(frost, 'Frost pitches it up').not.toBe(plain);
  // under a bag look, "original" keeps it as made
  await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); const { THEME_PRESETS } = await import('/engine/theme.js'); bag.setTheme(THEME_PRESETS.find((p) => p.id === 'frost').theme); });
  const held = await play([coin({ look: 'original' })], 'Explosion');
  expect(held).toBe(plain);
  // (openPlay empties the bag, not its look: put the look back for the next test's bag)
  await page.evaluate(async () => (await import('/app/bag.js')).bag.setTheme({}));

  // a track: its tempo under its own look is that look's, whatever the bag's is
  const speed = async (settings) => {
    await openPlay(page, [HERO, { kind: 'music', id: 'battle-theme', settings: { params: {}, style: null, ...settings } }]);
    const key = await keyOf(page, 'battle-theme');
    return (await state(page)).tracks[key].bpm;
  };
  expect(await speed({ look: 'sunset' }), 'Sunset slows the music').not.toBe(await speed({}));
});

test('after a reload the panel reopens on the thing that was being changed', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN]);
  const slime = await keyOf(page, 'slime');
  await change(page, 'Slime');
  expect((await state(page)).panel).toBe(slime);
  await page.reload();
  await ready(page);
  expect((await state(page)).panel).toBe(slime);
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Slime');
  // taken out of the bag meanwhile: the list of what is in the bag again
  await page.evaluate(async (k) => (await import('/app/bag.js')).bag.remove(k), slime);
  await ready(page);
  await page.reload();
  await ready(page);
  await expect(list(page)).toBeVisible();
  expect((await state(page)).panel).toBe(null);
  // and "All things in your bag" is remembered too: a reload does not reopen the panel
  await change(page, 'Coin');
  await side(page).getByRole('button', { name: /All things in your bag/ }).click();
  await page.reload();
  await ready(page);
  expect((await state(page)).panel).toBe(null);
});

test('the scene takes the keyboard: Tab reaches it, it shows where the keyboard is, and the arrow keys then walk', async ({ page }) => {
  await openPlay(page, [HERO, SLIME]);
  await change(page, 'Hero');
  await expect(stage(page)).toHaveAttribute('tabindex', '0');
  // from the panel, where the arrow keys are the panel's, to the scene with the keyboard alone
  const slider = (await showControl(page, 'height')).locator('input[type=range]');
  await slider.focus();
  await stage(page).focus();
  await expect(stage(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');      // arrived by keyboard: the focus is shown
  await expect(stage(page)).toBeFocused();
  expect(await stage(page).evaluate((n) => getComputedStyle(n).outlineStyle)).not.toBe('none');
  const x0 = (await state(page)).player.x;
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(x0 + 10);
  await page.keyboard.up('ArrowRight');
});
