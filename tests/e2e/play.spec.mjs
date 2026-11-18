// The playground (#/play; feature BAG-3; architecture.md Contract 9): try what is in the bag before downloading it.
import fs from 'node:fs';
import { test, expect, openRoute, canvasStats, setRange, hasHorizontalScroll } from '../helpers/test.mjs';

const exists = (id) => fs.existsSync(new URL(`../../sprites/${id}.js`, import.meta.url));
/** Hand the playground real sprites straight from sprites/ (they may not be in the built catalogue yet). */
const addSprites = (page, ids) => page.evaluate(async (list) => {
  const defs = [];
  for (const id of list) defs.push((await import(`/sprites/${id}.js`)).default);
  await window.__loadoutPlay.addAssets(defs);
}, ids);

const SPRITE = (id) => ({ kind: 'sprite', id, settings: { params: {}, cues: null, scale: 1 } });
const SOUND = (id) => ({ kind: 'sound', id, settings: { params: {}, style: null, seed: 1 } });
const MUSIC = (id) => ({ kind: 'music', id, settings: { params: {}, style: null } });
const HERO = SPRITE('knight'), SLIME = SPRITE('slime'), COIN = SPRITE('coin');

/** Put things in the bag (from any page of the site), then open the playground and wait until it has drawn. */
async function openPlay(page, items = []) {
  await openRoute(page, '/');
  await page.evaluate(async (list) => { const { bag } = await import('/app/bag.js'); bag.clear(); for (const it of list) bag.add(it); }, items);
  await page.goto('/index.html#/play');
  await ready(page);
}
const ready = (page) => page.waitForFunction(() => document.querySelector('main.play-page') && window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
const state = (page) => page.evaluate(() => window.__loadoutPlay.state());
const stage = (page) => page.locator('canvas.play-stage');
const thing = (s, id) => s.things.find((t) => t.id === id && t.state !== 'gone');
/** Hand the playground assets that are not in the catalogue (the fixtures), as if they were in the bag. */
const addFixtures = (page, which) => page.evaluate(async (name) => {
  const fx = await import('/tests/fixtures/play/index.js');
  await window.__loadoutPlay.addAssets(fx[name]);
}, which);

test('a hero, a slime, a coin and a sound: the scene is drawn and says what the keys do', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN, SOUND('explosion')]);
  await expect(page.getByRole('heading', { name: 'Playground' })).toBeVisible();
  const { opaque, width, height } = await canvasStats(stage(page));
  expect(opaque).toBe(width * height);                     // the whole scene is painted: sky, ground, sprites
  const s = await state(page);
  expect(s.mode).toBe('side');
  expect(s.player.id).toBe('knight');
  expect(s.player.onGround).toBe(true);
  expect(thing(s, 'slime')).toBeTruthy();
  expect(s.things.filter((t) => t.id === 'coin').length).toBeGreaterThanOrEqual(2);
  expect(s.zoom).toBe(Math.round(s.zoom));                 // a whole-number scale keeps pixels sharp
  expect(await stage(page).evaluate((cv) => cv.getContext('2d').imageSmoothingEnabled)).toBe(false);
  await expect(page.locator('.play-keys')).toContainText(/arrow keys/i);
  await expect(page.locator('.play-keys')).toContainText(/jump/i);
  await expect(page.locator('.play-board').getByRole('button', { name: /Explosion/ })).toBeVisible();
  await expect(page.locator('.play-things')).toContainText('Slime');
  await expect(page.locator('.play-things')).toContainText('Coin');
});

test('holding the right arrow walks the player on its walk clip; letting go stands still', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN]);
  const before = await state(page);
  expect(before.player.clip).toBe('idle');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).player.clip).toBe('walk');
  await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(before.player.x + 4);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await state(page)).player.clip).toBe('idle');
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => { const s = await state(page); return s.player.clip === 'walk' && s.player.flip; }).toBe(true);
  await page.keyboard.up('ArrowLeft');
});

test('the jump key leaves the ground and the player lands again, with its sounds', async ({ page }) => {
  await openPlay(page, [HERO]);
  const ground = (await state(page)).player.y;
  await page.keyboard.down('Space');
  await expect.poll(async () => (await state(page)).player.onGround).toBe(false);
  expect((await state(page)).player.clip).toBe('jump');
  await page.keyboard.up('Space');
  await expect.poll(async () => (await state(page)).player.onGround).toBe(true);
  const s = await state(page);
  expect(s.player.y).toBe(ground);
  expect(s.heard.map((h) => h.sound)).toContain('jump');   // the take-off sound fired on its frame
});

test('walking into a coin raises the counter and plays its sound', async ({ page }) => {
  await openPlay(page, [HERO, COIN]);
  await expect(page.locator('.play-collected')).toContainText('0');
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).collected, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  await expect(page.locator('.play-collected')).not.toContainText(/\b0\b/);
  expect((await state(page)).heard.map((h) => h.sound)).toContain('coin-pickup');
});

test('the action key next to the slime hurts it', async ({ page }) => {
  await openPlay(page, [HERO, SLIME]);
  // run to the slime, facing it, and swing until it is hit (it wanders, so keep facing it)
  await page.keyboard.down('Shift');
  const hits = async () => thing(await state(page), 'slime').hits;
  let sawHurtClip = false;
  for (let i = 0; i < 80 && (await hits()) === 0; i++) {
    const s = await state(page), slime = thing(s, 'slime');
    const gap = slime.x - s.player.x, key = gap > 0 ? 'ArrowRight' : 'ArrowLeft';
    if (Math.abs(gap) > 26) { await page.keyboard.down(key); await page.waitForTimeout(Math.min(600, Math.abs(gap) * 8)); await page.keyboard.up(key); }
    else { await page.keyboard.press(key); await page.keyboard.press('KeyX'); await page.waitForTimeout(250); }
  }
  await page.keyboard.up('Shift');
  expect(await hits()).toBeGreaterThan(0);
  for (let i = 0; i < 20 && !sawHurtClip; i++) { sawHurtClip = (await state(page)).heard.some((h) => h.by === 'slime' && h.clip === 'hurt'); if (!sawHurtClip) await page.waitForTimeout(50); }
  expect(sawHurtClip).toBe(true);                          // its hurt clip played and its sound fired
  expect((await state(page)).heard.some((h) => h.by === 'knight' && h.clip === 'attack')).toBe(true);
});

test('an enemy hit enough times plays its end and is removed from the scene', async ({ page }) => {
  await openPlay(page, [HERO, SLIME]);
  await page.keyboard.down('Shift');
  for (let i = 0; i < 160; i++) {
    const s = await state(page), slime = s.things.find((t) => t.id === 'slime');
    if (!slime) break;
    const gap = slime.x - s.player.x, key = gap > 0 ? 'ArrowRight' : 'ArrowLeft';
    if (Math.abs(gap) > 26) { await page.keyboard.down(key); await page.waitForTimeout(Math.min(600, Math.abs(gap) * 8)); await page.keyboard.up(key); }
    else { await page.keyboard.press(key); await page.keyboard.press('KeyX'); await page.waitForTimeout(250); }
  }
  await page.keyboard.up('Shift');
  expect((await state(page)).things.filter((t) => t.id === 'slime').length).toBe(0);
  await expect(page.locator('.play-things li', { hasText: 'Slime' }).locator('.play-n')).toHaveText('0');
  await expect(page.locator('.play-health')).toContainText(/of 3/);
});

test('the look of the bag changes the pixels of the scene', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN]);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Reset the scene' }).click();
  await page.waitForTimeout(300);
  const a = await canvasStats(stage(page));
  await page.waitForTimeout(200);
  expect((await canvasStats(stage(page))).hash).toBe(a.hash);          // paused: the picture holds still
  await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.setTheme({ colour: { palette: 'Frost' } }); });
  await expect.poll(async () => (await canvasStats(stage(page))).hash, { timeout: 15_000 }).not.toBe(a.hash);
  await ready(page);
  await page.waitForTimeout(300);
  const b = await canvasStats(stage(page));
  await page.waitForTimeout(200);
  expect((await canvasStats(stage(page))).hash).toBe(b.hash);
  expect(b.hash).not.toBe(a.hash);
  expect((await state(page)).paused).toBe(true);
  // the colours on screen all come from the palette now: far fewer of them than before
  const colours = () => stage(page).evaluate((cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return s.size; });
  expect(await colours()).toBeLessThanOrEqual(16);
});

test('add one, remove one, reset and mute', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN]);
  const slimes = async () => (await state(page)).things.filter((t) => t.id === 'slime').length;
  expect(await slimes()).toBe(1);
  const row = page.locator('.play-things li', { hasText: 'Slime' });
  await row.getByRole('button', { name: /Add one/ }).click();
  expect(await slimes()).toBe(2);
  await row.getByRole('button', { name: /Remove one/ }).click();
  await row.getByRole('button', { name: /Remove one/ }).click();
  expect(await slimes()).toBe(0);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(50);
  await page.keyboard.up('ArrowRight');
  await page.getByRole('button', { name: 'Reset the scene' }).click();
  const s = await state(page);
  expect(s.things.filter((t) => t.id === 'slime').length).toBe(1);
  expect(s.player.x).toBeLessThan(50);
  expect(s.collected).toBe(0);
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  expect((await state(page)).muted).toBe(true);
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  expect((await state(page)).muted).toBe(false);
});

test('an empty bag explains what to do', async ({ page }) => {
  await openPlay(page, []);
  await expect(page.getByRole('heading', { name: 'Playground' })).toBeVisible();
  await expect(page.locator('main')).toContainText(/bag is empty/i);
  await expect(stage(page)).toHaveCount(0);
  await expect(page.locator('main a[href="#/"]')).toBeVisible();
  await expect(page.locator('main a[href^="#/bundle/"]')).toBeVisible();
});

test('a bag with only a sound shows the sound board and no scene', async ({ page }) => {
  await openPlay(page, [SOUND('coin-pickup')]);
  await expect(stage(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sound board' })).toBeVisible();
  const button = page.locator('.play-board').getByRole('button', { name: /Coin/ });
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(async () => (await state(page)).heard.map((h) => h.sound)).toContain('coin-pickup');
});

test('music in the bag can be started and stopped, with its main sliders', async ({ page }) => {
  test.setTimeout(90_000);
  await openPlay(page, [HERO, MUSIC('battle-theme')]);
  const box = page.locator('.play-music');
  await expect(box).toContainText('Battle');
  const sliders = box.locator('input[type=range]');
  expect(await sliders.count()).toBeGreaterThanOrEqual(1);
  await expect(box.getByLabel(/Intensity/)).toBeVisible();
  await box.getByRole('button', { name: /Play music/ }).click();
  await expect(box.getByRole('button', { name: /Stop music/ })).toBeVisible({ timeout: 30_000 });
  await setRange(sliders.first(), 'other');
  await box.getByRole('button', { name: /Stop music/ }).click();
  await expect(box.getByRole('button', { name: /Play music/ })).toBeVisible();
});

test('music starts on the first key press, and Mute stops it', async ({ page }) => {
  test.setTimeout(90_000);
  await openPlay(page, [HERO, MUSIC('battle-theme')]);
  const box = page.locator('.play-music');
  await expect(box.getByRole('button', { name: /Play music/ })).toBeVisible();
  expect((await state(page)).music).toBe(false);
  await page.keyboard.press('ArrowRight');
  await expect(box.getByRole('button', { name: /Stop music/ })).toBeVisible({ timeout: 30_000 });
  expect((await state(page)).music).toBe(true);
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(box.getByRole('button', { name: /Play music/ })).toBeVisible();
  expect((await state(page)).muted).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await expect(box.getByRole('button', { name: /Play music/ })).toBeVisible();      // it does not start again by itself
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
});

test('the bag page has a way into the playground', async ({ page }) => {
  await openPlay(page, [HERO, COIN]);
  await openRoute(page, '/bag');
  await page.getByRole('link', { name: 'Try these in the playground' }).click();
  await ready(page);
  await expect(stage(page)).toBeVisible();
  expect((await state(page)).player.id).toBe('knight');
});

test('top-down: the room is walled and the walker cannot leave it', async ({ page }) => {
  await openPlay(page, []);
  await addFixtures(page, 'topDown');
  const s = await state(page);
  expect(s.plan.tilesets.length).toBe(1);
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('Shift');
  const after = await state(page);
  expect(after.player.x).toBeGreaterThan(32);          // stopped by the west wall, one tile thick
  expect(after.player.x).toBeLessThan(s.player.x);
  await page.keyboard.press('KeyX');
  await expect.poll(async () => (await state(page)).player.clip).toBe('attack_side');
});

test('top-down: the four direction keys choose the four direction clips', async ({ page }) => {
  await openPlay(page, []);
  await addFixtures(page, 'topDown');
  await expect(stage(page)).toBeVisible();
  let s = await state(page);
  expect(s.mode).toBe('top');
  expect(s.player.id).toBe('play-walker');
  const start = { x: s.player.x, y: s.player.y };
  const walk = async (key) => {
    await page.keyboard.down(key);
    await expect.poll(async () => (await state(page)).player.clip.startsWith('walk')).toBe(true);
    await page.waitForTimeout(250);
    const now = await state(page);
    await page.keyboard.up(key);
    return now.player;
  };
  const down = await walk('ArrowDown');
  expect([down.clip, down.flip]).toEqual(['walk_down', false]);
  expect(down.y).toBeGreaterThan(start.y);
  const up = await walk('ArrowUp');
  expect([up.clip, up.flip]).toEqual(['walk_up', false]);
  expect(up.y).toBeLessThan(down.y);
  const right = await walk('ArrowRight');
  expect([right.clip, right.flip]).toEqual(['walk_side', false]);
  expect(right.x).toBeGreaterThan(start.x);
  const left = await walk('ArrowLeft');
  expect([left.clip, left.flip]).toEqual(['walk_side', true]);
  expect(left.x).toBeLessThan(right.x);
  await expect(page.locator('.play-keys')).not.toContainText(/jump/i);     // no jumping when seen from above
  const { opaque, width, height } = await canvasStats(stage(page));
  expect(opaque).toBe(width * height);
});

test('fixture tiles and background layers replace the plain ground and sky', async ({ page }) => {
  await openPlay(page, [HERO, COIN]);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Reset the scene' }).click();
  await page.waitForTimeout(300);
  const plain = await canvasStats(stage(page));
  await addFixtures(page, 'sideExtras');
  await expect.poll(async () => (await canvasStats(stage(page))).hash).not.toBe(plain.hash);
  await expect(page.locator('.play-things')).toContainText('Test tiles');
  await expect(page.locator('.play-things')).toContainText('Test hills');
  expect((await state(page)).mode).toBe('side');
});

test('the first real tileset, background and bar build a side-view scene', async ({ page }) => {
  test.skip(!exists('tiles-forest') || !exists('bg-forest'), 'sprites/tiles-forest.js or bg-forest.js is not there yet');
  await openPlay(page, [HERO, SLIME, COIN]);
  await addSprites(page, ['tiles-forest', 'bg-forest', ...(exists('ui-bars-rpg') ? ['ui-bars-rpg'] : [])]);
  const s = await state(page);
  expect(s.mode).toBe('side');
  expect(s.plan.tilesets.length).toBe(1);
  expect(s.plan.background).toBeTruthy();
  const { opaque, width, height } = await canvasStats(stage(page));
  expect(opaque).toBe(width * height);
  await expect(page.locator('.play-things')).toContainText('Makes the ground.');
  // the player still stands on the ground, walks up the slope and is stopped by nothing on the way
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).player.y, { timeout: 15_000 }).toBeLessThan(s.player.y - 20);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  expect((await state(page)).player.onGround).toBe(true);
});

test('the real top-down hero walks its direction clips', async ({ page }) => {
  test.skip(!exists('hero-walker'), 'sprites/hero-walker.js is not there yet');
  await openPlay(page, []);
  await addSprites(page, ['hero-walker']);
  await addFixtures(page, 'topDown');
  const s = await state(page);
  expect(s.mode).toBe('top');
  expect(s.player.id).toBe('hero-walker');
  expect(s.player.clip).toBe('idle_down');
  for (const [key, clip, flip] of [['ArrowUp', 'walk_up', false], ['ArrowLeft', 'walk_side', true], ['ArrowDown', 'walk_down', false], ['ArrowRight', 'walk_side', false]]) {
    await page.keyboard.down(key);
    await expect.poll(async () => { const p = (await state(page)).player; return [p.clip, p.flip]; }).toEqual([clip, flip]);
    await page.keyboard.up(key);
  }
  await expect.poll(async () => (await state(page)).player.clip).toBe('idle_side');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true });

  test('the on-screen buttons move the player and nothing scrolls sideways', async ({ page }) => {
    await openPlay(page, [HERO, SLIME, COIN, SOUND('explosion'), MUSIC('battle-theme')]);
    const pad = page.locator('.play-pad');
    for (const name of ['Left', 'Right', 'Jump', 'Action']) await expect(pad.getByRole('button', { name, exact: true })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    const x0 = (await state(page)).player.x;
    const right = pad.getByRole('button', { name: 'Right', exact: true });
    await right.dispatchEvent('pointerdown', { pointerId: 1, bubbles: true });
    await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(x0 + 3);
    await right.dispatchEvent('pointerup', { pointerId: 1, bubbles: true });
    await expect.poll(async () => (await state(page)).player.clip).toBe('idle');
    await pad.getByRole('button', { name: 'Jump', exact: true }).dispatchEvent('pointerdown', { pointerId: 2, bubbles: true });
    await expect.poll(async () => (await state(page)).player.onGround).toBe(false);
    await pad.getByRole('button', { name: 'Jump', exact: true }).dispatchEvent('pointerup', { pointerId: 2, bubbles: true });
    const box = await stage(page).boundingBox();
    expect(box.width).toBeLessThanOrEqual(375);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
