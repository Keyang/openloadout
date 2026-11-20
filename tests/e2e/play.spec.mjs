// The playground (#/play; feature BAG-3; architecture.md Contract 9): try what is in the bag before downloading it.
import { test, expect, openRoute, canvasStats, setRange, hasHorizontalScroll } from '../helpers/test.mjs';
import { hasLibrarySprite, librarySpriteFile } from '../helpers/library.mjs';

// a library sprite is a code file or a data file (tests/helpers/library.mjs): either is there, either is handed over
const exists = hasLibrarySprite;
/** Hand the playground real sprites straight from sprites/ (they may not be in the built catalogue yet): a code file imported, a data file read as the site reads one. */
const addSprites = (page, ids) => page.evaluate(async (list) => {
  const defs = [];
  for (const src of list) defs.push(src.endsWith('.json') ? await (await import('/app/catalog.js')).loadDataFile(`/${src}`) : (await import(`/${src}`)).default);
  await window.__loadoutPlay.addAssets(defs);
}, ids.map((id) => librarySpriteFile(id) ?? `sprites/${id}.js`));

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
  // a colour set of the site, and how much of the picture is painted in its colours
  const set = await page.evaluate(async () => { const { PALETTES } = await import('/engine/theme.js'); const p = PALETTES.find((x) => x.name === 'Frost') ?? PALETTES[0]; return { name: p.name, colours: p.colours.map((c) => parseInt(c.slice(1), 16)) }; });
  const picture = () => stage(page).evaluate((cv, colours) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, inSet = new Set(colours), seen = new Set();
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) { const v = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; seen.add(v); if (inSet.has(v)) hit++; }
    return { share: hit / (d.length / 4), colours: [...seen] };
  }, set.colours);
  const plain = await picture();
  await page.evaluate(async (name) => { const { bag } = await import('/app/bag.js'); bag.setTheme({ colour: { palette: name } }); }, set.name);
  await expect.poll(async () => (await canvasStats(stage(page))).hash, { timeout: 15_000 }).not.toBe(a.hash);
  await ready(page);
  await page.waitForTimeout(300);
  const b = await canvasStats(stage(page));
  await page.waitForTimeout(200);
  expect((await canvasStats(stage(page))).hash).toBe(b.hash);
  expect(b.hash).not.toBe(a.hash);
  expect((await state(page)).paused).toBe(true);
  // The look reached the whole picture: the sky and ground the playground paints itself, and every sprite.
  // A colour set pulls each colour towards the set but a thing stays what it is (architecture.md, Contract 7: grass
  // stays green, skin stays skin), so not every colour on screen is one of the set: a good part of the picture is,
  // where next to none of it was before; hardly a colour of the plain picture is left; and there are no more
  // colours than before.
  const looked = await picture();
  expect(plain.share, `how much of the plain picture is in the ${set.name} colours`).toBeLessThan(0.05);
  expect(looked.share, `how much of the picture is in the ${set.name} colours with the look on`).toBeGreaterThan(plain.share + 0.1);
  const kept = looked.colours.filter((v) => plain.colours.includes(v));
  expect(kept.length, 'colours of the plain picture still on screen').toBeLessThan(plain.colours.length / 4);
  expect(looked.colours.length, 'colours on screen with the look on').toBeLessThanOrEqual(plain.colours.length);
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
  await expect(page.locator('.play-board').getByRole('heading', { name: 'Sounds' })).toBeVisible();
  const button = page.locator('.play-board').getByRole('button', { name: /Coin/ });
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(async () => (await state(page)).heard.map((h) => h.sound)).toContain('coin-pickup');
});

test('music in the bag can be started and stopped from its row; its settings are one Change away', async ({ page }) => {
  test.setTimeout(90_000);
  await openPlay(page, [HERO, MUSIC('battle-theme')]);
  const box = page.locator('.play-music');
  await expect(box).toContainText('Battle');
  await box.getByRole('button', { name: /Play music/ }).click();
  await expect(box.getByRole('button', { name: /Stop music/ })).toBeVisible({ timeout: 30_000 });
  await box.getByRole('button', { name: 'Change', exact: true }).click();
  await expect(page.locator('.play-side .rx-panel')).toHaveAttribute('aria-label', 'Change Battle theme');
  await setRange(page.locator('.play-side .rx-panel input[type=range]').first(), 'other');
  await page.locator('.play-side').getByRole('button', { name: /All things in your bag/ }).click();
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
  test.skip(!exists('tiles-forest') || !exists('bg-forest'), 'sprites/tiles-forest or bg-forest is not there yet');
  await openPlay(page, [HERO, SLIME, COIN]);
  await addSprites(page, ['tiles-forest', 'bg-forest', ...(exists('ui-bars-rpg') ? ['ui-bars-rpg'] : [])]);
  const s = await state(page);
  expect(s.mode).toBe('side');
  expect(s.plan.tilesets.length).toBe(1);
  expect(s.plan.background).toBeTruthy();
  const { opaque, width, height } = await canvasStats(stage(page));
  expect(opaque).toBe(width * height);
  await expect(page.locator('.play-things')).toContainText('Makes the ground');
  // the player still stands on the ground, walks up the slope and is stopped by nothing on the way
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).player.y, { timeout: 15_000 }).toBeLessThan(s.player.y - 20);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  expect((await state(page)).player.onGround).toBe(true);
});

test('the real top-down hero walks its direction clips', async ({ page }) => {
  test.skip(!exists('hero-walker'), 'sprites/hero-walker is not there yet');
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

test('the two real tilesets together: the second one\'s platform and its ladder, vine and post are in the scene', async ({ page }) => {
  test.skip(!exists('tiles-forest') || !exists('tiles-platforms'), 'the two real tilesets are not both there yet');
  await openPlay(page, [HERO]);
  await page.getByRole('button', { name: 'Pause' }).click();
  await addSprites(page, ['tiles-forest']);
  await page.waitForTimeout(300);
  const one = await canvasStats(stage(page));
  await addSprites(page, ['tiles-platforms']);
  await expect.poll(async () => (await canvasStats(stage(page))).hash).not.toBe(one.hash);       // the column next to the start is on screen
  expect((await state(page)).plan.tilesets.length).toBe(2);
});

test('interface pieces: a set shows every clip, a panel set its clips side by side, a bar is filled inside its opening', async ({ page }) => {
  await openPlay(page, [HERO]);
  await addFixtures(page, 'display');
  const hud = page.locator('.play-hud');
  await expect(hud).toContainText('Score and health');
  await expect(hud.getByRole('img', { name: 'Test icons' }).locator('canvas')).toHaveCount(10);
  const menu = hud.getByRole('img', { name: 'Test menu' }).locator('canvas');
  await expect(menu).toHaveCount(2);
  for (let i = 0; i < 2; i++) expect((await canvasStats(menu.nth(i))).opaque).toBeGreaterThan(50);
  expect((await canvasStats(menu.nth(0))).hash).not.toBe((await canvasStats(menu.nth(1))).hash);
  // full health: the fill covers the whole opening (50 of the bar's 64 columns) and nothing outside it
  const fillColumns = await hud.getByRole('img', { name: 'Test bar' }).locator('canvas').evaluate((cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, cols = new Set();
    for (let i = 0; i < d.length; i += 4) if (d[i] === 0x3f && d[i + 1] === 0xbf && d[i + 2] === 0x6f) cols.add((i / 4) % cv.width);
    return [cols.size, Math.min(...cols), cv.width];
  });
  expect(fillColumns).toEqual([50, 6, 64]);
});

test('the page says only what can happen, and marks a sprite the visitor changed', async ({ page }) => {
  await openPlay(page, [HERO, SLIME, COIN]);
  await expect(page.locator('.play-howto')).toHaveText('Jump onto the ledges, collect the coins, press X next to the slime.');
  await expect(page.locator('.play-keys')).toContainText('X to attack or use things');
  await expect(page.locator('.play-collected')).toHaveCount(1);
  await expect(page.locator('.play-things li', { hasText: 'Slime' })).toContainText('you can hit it');
  await expect(page.locator('.play-tag')).toHaveCount(0);

  // no pickups: no "Collected"; a changed Hero is marked as the visitor's version
  await openPlay(page, [{ kind: 'sprite', id: 'knight', settings: { params: { weapon: 'axe' }, cues: null, scale: 1 } }]);
  await expect(page.locator('.play-collected')).toHaveCount(0);
  await expect(page.locator('.play-health')).toBeVisible();
  await expect(page.locator('.play-things li', { hasText: 'Hero' }).locator('.play-tag')).toHaveText(/your version/i);
  await expect(page.locator('.play-howto')).toHaveText('Jump onto the ledges.');

  // nobody to play: nothing is said about attacking, and there is no line about keys to press
  await openPlay(page, [SLIME]);
  await expect(page.locator('.play-things li', { hasText: 'Slime' })).not.toContainText(/hurt|attack/);
  await expect(page.locator('.play-howto')).toHaveCount(0);
  await expect(page.locator('.play-health')).toHaveCount(0);
});

test('a bag whose things can no longer be found does not say it is empty', async ({ page }) => {
  await openPlay(page, [SPRITE('no-such-sprite'), SOUND('no-such-sound')]);
  await expect(page.locator('main')).not.toContainText(/bag is empty/i);
  await expect(page.locator('main')).toContainText(/could be found/);
  await expect(page.locator('main a[href="#/bag"]')).toBeVisible();
});

test.describe('the level as text', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('"Copy this level" puts the map text on the clipboard', async ({ page }) => {
    await openPlay(page, [HERO, COIN]);
    await addFixtures(page, 'sideExtras');
    const map = (await state(page)).map;
    expect(map.startsWith('@ view = side\n')).toBe(true);
    expect(map).toContain('@ tilesets = play-tiles');
    expect(map).toContain('#'.repeat((await state(page)).level.cols));      // the ground, all the way across
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Copy this level' }).click();
    await expect(page.locator('.play-copied')).toContainText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(map);
  });
});

const PLATFORMER = ['tiles-forest', 'tiles-platforms', 'tiles-cave', 'tiles-water', 'tiles-castle', 'bg-forest', 'knight', 'spear-goblin', 'thorn-beetle', 'slime', 'coin', 'gem', 'heart', 'treasure-chest', 'lever', 'crate', 'spring-pad', 'hit-spark'];
const RPG = ['tiles-meadow', 'tiles-village', 'tiles-shore', 'hero-walker', 'merchant', 'village-elder', 'town-guard', 'cottage', 'inn', 'market-stall', 'tree-oak', 'tree-pine', 'save-crystal'];

test('the platformer assets together: every side-view tileset builds one scene, and the level reads back', async ({ page }) => {
  test.skip(!PLATFORMER.every(exists), 'not every platformer sprite is there yet');
  await openPlay(page, []);
  await addSprites(page, PLATFORMER);
  const s = await state(page);
  expect(s.mode).toBe('side');
  expect(s.player.id).toBe('knight');
  expect(s.plan.tilesets.length).toBe(5);
  const cols = s.map.split('\n').filter((row) => row && !row.startsWith('@'))[0].length;
  expect(s.width).toBe(cols * 32);
  expect(cols, 'one screen: the level is as wide as the picture').toBe(s.level.cols);
  expect(cols * 32 - s.view.w).toBeLessThan(32);
  expect(s.map).toContain('liquid:water');
  expect(s.map).toContain('liquid:fall');
  expect(s.map).toMatch(/back:/);                          // a hall with a back wall behind it
  const { opaque, width, height } = await canvasStats(stage(page));
  expect(opaque).toBe(width * height);
  // the hero can run from the start to the far side of the picture: over the mound, past the hall, through the pool
  const far = (cols - 3) * 32;
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  let last = -1, stuck = 0;
  for (let i = 0; i < 120 && stuck < 6; i++) {
    const p = (await state(page)).player;
    if (p.x > far) break;
    if (Math.abs(p.x - last) < 1) { stuck++; await page.keyboard.press('Space'); } else stuck = 0;
    last = p.x;
    await page.waitForTimeout(250);
  }
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  expect((await state(page)).player.x).toBeGreaterThan(far);
});

test('side view: the hero wades in the pool, with the water drawn in front of its legs', async ({ page }) => {
  test.skip(!['tiles-forest', 'tiles-water'].every(exists), 'the forest and water tilesets are not both there yet');
  await openPlay(page, [HERO]);
  await addSprites(page, ['tiles-forest', 'tiles-water']);
  const s0 = await state(page);
  expect(s0.map).toContain('liquid:water');
  // where the pool is: the '~' cells of the map, in the ground's top row
  const rowsOfMap = s0.map.split('\n').filter((row) => row && !row.startsWith('@'));
  const groundY = s0.level.groundY, poolRow = rowsOfMap[groundY / 32];
  const poolCols = [...poolRow].map((ch, c) => (ch === '~' ? c : -1)).filter((c) => c >= 0);
  expect(poolCols.length).toBeGreaterThan(1);
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  let stuck = 0, last = -1;
  for (let i = 0; i < 160; i++) {
    const p = (await state(page)).player;
    if (p.wading) break;
    if (Math.abs(p.x - last) < 1 && ++stuck % 2) await page.keyboard.press('Space');
    last = p.x;
    await page.waitForTimeout(120);
  }
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  await expect.poll(async () => { const p = (await state(page)).player; return p.wading && p.onGround; }).toBe(true);
  const p = (await state(page)).player;
  expect(p.y).toBe(groundY + 20);                          // legs under the surface, body above it
  expect(p.hp).toBe(3);                                    // water does no harm
  // The liquid is drawn in front of what stands in it: under the surface line the picture is the same with the hero
  // there as with the hero gone, and above it the hero shows. (Paused, so the water itself holds still.)
  await page.getByRole('button', { name: 'Pause' }).click();
  const region = (x0, y0, w, h) => stage(page).evaluate((cv, r) => {
    const s = window.__loadoutPlay.state(), z = s.zoom;
    const d = cv.getContext('2d').getImageData((r.x0 - s.cam.x) * z, (r.y0 - s.cam.y) * z, r.w * z, r.h * z).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
    return h >>> 0;
  }, { x0, y0, w, h });
  // a cell of the pool clear of the waterfall (which is drawn in front of everything)
  const clear = poolCols.find((c) => rowsOfMap[groundY / 32 - 1][c] !== 'V' && rowsOfMap[groundY / 32][c] === '~');
  const mid = (clear + 0.5) * 32;
  await page.evaluate(([x, y]) => window.__loadoutPlay.put(x, y), [mid, groundY + 20]);
  const x0 = Math.round(mid) - 6;
  await page.waitForTimeout(200);
  const legs = await region(x0, groundY + 9, 12, 10), head = await region(x0, groundY - 20, 12, 14);
  await page.evaluate(([x, y]) => window.__loadoutPlay.put(x, y), [32 * 1.5, groundY]);
  await page.waitForTimeout(200);
  expect(await region(x0, groundY + 9, 12, 10)).toBe(legs);
  expect(await region(x0, groundY - 20, 12, 14)).not.toBe(head);
});

test('top-down: trees and houses block the way at their base, and the hero walks behind them', async ({ page }) => {
  test.skip(!['hero-walker', 'tree-oak', 'tiles-meadow'].every(exists), 'the meadow, the hero and the oak are not all there yet');
  await openPlay(page, []);
  await addSprites(page, ['tiles-meadow', 'hero-walker', 'tree-oak']);
  const tree = (await state(page)).things.find((t) => t.id === 'tree-oak');
  expect(tree).toBeTruthy();
  // walk at the trunk from below: the hero stops at its foot
  const walkTo = async (key, done, ms = 6000) => {
    await page.keyboard.down('Shift'); await page.keyboard.down(key);
    const t0 = Date.now(); let last = null, still = 0;
    while (Date.now() - t0 < ms) {
      const p = (await state(page)).player;
      if (done(p)) break;
      still = last && Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 0.5 ? still + 1 : 0;
      if (still > 4) break;
      last = p; await page.waitForTimeout(80);
    }
    await page.keyboard.up(key); await page.keyboard.up('Shift');
    return (await state(page)).player;
  };
  // line up under the trunk, south of it
  let p = (await state(page)).player;
  if (p.y < tree.y + 30) p = await walkTo('ArrowDown', (q) => q.y >= tree.y + 30);
  p = await walkTo(p.x < tree.x ? 'ArrowRight' : 'ArrowLeft', (q) => Math.abs(q.x - tree.x) < 3);
  expect(Math.abs(p.x - tree.x)).toBeLessThan(6);
  p = await walkTo('ArrowUp', (q) => q.y < tree.y - 20, 4000);
  expect(p.y).toBeGreaterThan(tree.y);                     // stopped below the trunk: it did not walk through the tree
  expect(p.y).toBeLessThan(tree.y + 12);
});

test('the role-playing assets together: a top-down village where water blocks the way', async ({ page }) => {
  test.skip(!RPG.every(exists), 'not every role-playing sprite is there yet');
  await openPlay(page, []);
  await addSprites(page, RPG);
  const s = await state(page);
  expect(s.mode).toBe('top');
  expect(s.player.id).toBe('hero-walker');
  expect(s.plan.tilesets.length).toBe(3);
  expect(s.map.startsWith('@ view = top-down\n')).toBe(true);
  expect(s.map).toContain('bridge-h');
  expect(s.things.filter((t) => t.id === 'tree-oak').length).toBe(1);
  const { opaque, width, height } = await canvasStats(stage(page));
  expect(opaque).toBe(width * height);
  await expect(page.locator('.play-things')).toContainText('Cottage');
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

  test('a long icon or glyph set stays in its one row, and wraps when the row is folded open; the page never scrolls sideways', async ({ page }) => {
    await openPlay(page, [HERO, COIN]);
    await addFixtures(page, 'display');
    if (exists('ui-damage-digits')) await addSprites(page, ['ui-damage-digits']);
    await expect(page.locator('.play-hud').getByRole('img', { name: 'Test icons' }).locator('canvas')).toHaveCount(10);
    expect(await hasHorizontalScroll(page)).toBe(false);
    // the row itself is no wider than the screen: what does not fit is reached by scrolling inside it
    const row = await page.locator('.play-pieces').evaluate((n) => ({ right: n.getBoundingClientRect().right, inner: n.scrollWidth, shown: n.clientWidth }));
    expect(row.right).toBeLessThanOrEqual(375);
    expect(row.inner).toBeGreaterThan(row.shown);
    // folded open, every piece is on the screen: a long set wraps onto the next line
    await page.locator('.play-pieces-more').click();
    const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.play-hud *')].map((n) => n.getBoundingClientRect().right)));
    expect(widest).toBeLessThanOrEqual(375);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
