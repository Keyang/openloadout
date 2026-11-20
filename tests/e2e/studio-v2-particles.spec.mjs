// The particle editor (build item B19a; docs/data-sprites.md sections 2.5c, 6 and 9 row B19): an effect's emitters (and
// a picture's emitter list) in the studio's Body tab, in place of the field tree B17 gave them.
//   - the cost of a frame against the 4,000 budget, live, each emitter's share;
//   - an emitter's behaviour: its arguments by their documented types, another behaviour swapped in, a new emitter added;
//   - its keys over the clip: a lane of the clip's frames with each frame's amount and its keys, a key made on the frame
//     in hand, its amount and keyable arguments changed, moved a frame later, deleted;
//   - play, pause and scrub;
//   - its spawn point and box drawn on the picture and dragged there (whole pixels), the box's corner sized;
//   - the validator's errors beside the card they are about;
//   - effect ports (fx-fire-spell, explosion-large) opened from the library as copies; the All fields tree stays;
//     nothing scrolls sideways at phone width.
// The page is served from STUDIO_BASE_URL (default http://localhost:5199, the shared test server).
import { test, expect, hasHorizontalScroll } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

async function home(page) {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.removeItem('loadout-studio-v1'); localStorage.removeItem('loadout-bag'); });
  await page.goto('/index.html#/studio?new', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.v2.studio-home')).toBeVisible();
}
/** A new draft from the emitters template ("Spark burst": sparks and a flash, keyed in the clip "hit"). */
async function newEffect(page) {
  await home(page);
  await page.locator('[data-start="v2-emitters"]').click();
  await ready(page, 'emitters');
}
/** A library sprite opened as a copy. */
async function library(page, id) {
  await home(page);
  await page.getByLabel('Find a library sprite').fill(id);
  await page.locator(`[data-library="${id}"]`).click();
  await ready(page, 'emitters');
}
async function ready(page, body) {
  await expect(page.locator(`main.studio-v2[data-body="${body}"]`)).toBeVisible();
  await expect(page.locator('.v2-particles')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.v2-pt-total')).toContainText('of 4,000', { timeout: 20_000 });
}
const saved = (page) => page.evaluate(() => {
  const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]);
  return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition;
});
const card = (page, id) => page.locator(`.v2-pt-card[data-emitter="${id}"]`);
const pick = async (page, id) => {
  await card(page, id).locator('.v2-pt-name').click();
  await expect(card(page, id).locator('.v2-pt-edit')).toBeVisible();
};
const tab = (page, name) => page.getByRole('tab', { name, exact: false }).filter({ hasText: name });
/** Where a sprite pixel's middle is on the page: the stage draws the frame centred at a whole zoom. */
async function stagePoint(page, x, y) {
  const cv = page.locator('.studio-v2 .studio-canvas');
  const box = await cv.boundingBox();
  const z = Number((await page.locator('.st-zoom').textContent()).replace(/[^0-9]/g, ''));
  const [W, H] = (await saved(page)).size;
  const ox = Math.floor((Math.floor(box.width) - W * z) / 2), oy = Math.floor((Math.floor(box.height) - H * z) / 2);
  return { x: box.x + ox + (x + 0.5) * z, y: box.y + oy + (y + 0.5) * z, z };
}
async function drag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 3 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 3 });
  await page.mouse.up();
}

test('the emitters are cards with the cost against the 4,000 budget, in place of the field tree', async ({ page }) => {
  await newEffect(page);
  await expect(page.locator('.v2-pt-card')).toHaveCount(2);
  await expect(card(page, 'sparks')).toContainText('particles@1');
  await expect(card(page, 'flash')).toContainText('starburst@1');
  // no B17 rows for emitters: the cards replace them; the draw list (if any) and the All fields tree stay
  await expect(page.locator('.v2-list[data-list="body.emitters"] .v2-item')).toHaveCount(0);
  const meter = page.locator('.v2-pt-meter');
  await expect(meter).toHaveAttribute('aria-valuemax', '4000');
  const total = Number(await meter.getAttribute('aria-valuenow'));
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThan(4000);
  await expect(meter.locator('.v2-pt-seg')).toHaveCount(2);
  // each card shows its own price
  await expect(card(page, 'sparks').locator('.v2-pt-cost')).toHaveText(/\d/);
  await tab(page, 'All fields').click();
  await expect(page.locator('.v2-pane .v2-tree, .v2-pane details').first()).toBeVisible();
});

test('a behaviour\'s arguments by their types, its price live, another behaviour swapped in, a new emitter', async ({ page }) => {
  await newEffect(page);
  await pick(page, 'flash');
  const meter = page.locator('.v2-pt-meter');
  const before = Number(await meter.getAttribute('aria-valuenow'));
  // the starburst's points: a whole number box from the registry's documented type
  const points = card(page, 'flash').locator('.v2-gen [data-arg="points"] input[type="number"]');
  await points.fill('12');
  await points.press('Enter');
  await expect.poll(async () => (await saved(page)).body.emitters[1].points).toBe(12);
  await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  // a number outside its type is kept, and the validator's error is shown on the card it is about
  await points.fill('999');
  await points.press('Enter');
  await expect(card(page, 'flash').locator('.v2-errs li').first()).toContainText('Emitter "flash"');
  await expect(card(page, 'flash')).toHaveClass(/has-error/);
  await page.locator('[data-act="undo"]').click();
  await expect(card(page, 'flash').locator('.v2-errs')).toHaveCount(0);
  // the flash becomes a glow: its id and keys stay
  await card(page, 'flash').locator('[data-act="pt-gen"]').selectOption('glow@1');
  await expect.poll(async () => (await saved(page)).body.emitters[1].gen).toBe('glow');
  const d = await saved(page);
  expect(d.body.emitters[1].id).toBe('flash');
  expect(d.clips.hit.keys[0].emit.flash.amount).toBe(1);
  // a new emitter from the registry's behaviours
  await page.locator('[data-act="pt-add"]').click();
  await page.locator('[data-act="pt-pick"]').selectOption('smoke@1');
  await page.locator('[data-act="pt-add-it"]').click();
  await expect.poll(async () => (await saved(page)).body.emitters.map((e) => e.id)).toEqual(['sparks', 'flash', 'smoke']);
  await expect(card(page, 'smoke').locator('.v2-pt-edit')).toBeVisible();
  await expect(page.locator('.v2-pt-meter .v2-pt-seg')).toHaveCount(3);
});

test('keys over the clip: a lane of amounts, a key made on the frame in hand, changed, moved and deleted', async ({ page }) => {
  await newEffect(page);
  await pick(page, 'flash');
  const lane = card(page, 'flash').locator('.v2-pt-lane');
  // the clip "hit" has 5 frames; the flash is keyed at frames 1 and 3 (t 0 and 0.5) and draws in the first two
  await expect(lane.locator('.v2-pt-cell')).toHaveCount(5);
  await expect(lane.locator('.v2-pt-cell.is-key')).toHaveCount(2);
  await expect(lane.locator('.v2-pt-cell.is-on')).toHaveCount(2);
  // scrub to frame 4 (index 3): the stage's frame follows
  await page.locator('[data-act="pt-scrub"]').fill('3');
  await expect(page.locator('.st-under .timeline [data-frame="3"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.v2-pt-frame')).toContainText('4 of 5');
  // make a key there: it is written at the frame's exact phase
  await card(page, 'flash').locator('[data-act="pt-key"]').click();
  await expect.poll(async () => (await saved(page)).clips.hit.keys.map((k) => k.t)).toEqual([0, 0.5, 0.75]);
  await expect(lane.locator('.v2-pt-cell.is-key')).toHaveCount(3);
  // its amount: half on, so the flash draws on that frame again
  const amount = card(page, 'flash').locator('[data-k="pt-amount"]');
  await amount.fill('0.5');
  await amount.dispatchEvent('change');
  await expect.poll(async () => (await saved(page)).clips.hit.keys[2].emit.flash.amount).toBe(0.5);
  await expect(lane.locator('.v2-pt-cell[data-frame="3"]')).toHaveClass(/is-on/);
  // a keyable argument of the starburst (turn) set in the key
  await card(page, 'flash').locator('[data-act="pt-set-turn"]').click();
  const turn = card(page, 'flash').locator('[data-k="pt-key-turn"]');
  await turn.fill('30');
  await turn.press('Enter');
  await expect.poll(async () => (await saved(page)).clips.hit.keys[2].emit.flash.turn).toBe(30);
  // moved a frame later, then deleted
  await card(page, 'flash').locator('[data-act="pt-key-later"]').click();
  await expect.poll(async () => (await saved(page)).clips.hit.keys.map((k) => k.t)).toEqual([0, 0.5, 1]);
  await expect(page.locator('.st-under .timeline [data-frame="4"]')).toHaveAttribute('aria-current', 'true');
  await card(page, 'flash').locator('[data-act="pt-unkey"]').click();
  await expect.poll(async () => (await saved(page)).clips.hit.keys.map((k) => k.t)).toEqual([0, 0.5]);
  // clicking a cell of the lane goes to that frame
  await lane.locator('.v2-pt-cell[data-frame="1"]').click();
  await expect(page.locator('.st-under .timeline [data-frame="1"]')).toHaveAttribute('aria-current', 'true');
});

test('play and pause from the particle editor', async ({ page }) => {
  await newEffect(page);
  const play = page.locator('[data-act="pt-play"]');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  const seen = new Set();
  await expect.poll(async () => { seen.add(await page.locator('[data-act="pt-scrub"]').inputValue()); return seen.size; }, { timeout: 5000 }).toBeGreaterThan(1);
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
});

test('the spawn point and box are drawn on the picture and dragged there', async ({ page }) => {
  await newEffect(page);
  await pick(page, 'sparks');
  // drag the point 3 pixels right and 2 up
  const p = await stagePoint(page, 16, 16);
  await drag(page, p, 3 * p.z, -2 * p.z);
  await expect.poll(async () => (await saved(page)).body.emitters[0].at).toEqual([19, 14]);
  // the arrows move it by one pixel too
  await card(page, 'sparks').getByRole('button', { name: 'Move the point left one pixel' }).click();
  await expect.poll(async () => (await saved(page)).body.emitters[0].at).toEqual([18, 14]);
  // a box: given, then sized from its corner on the picture
  await card(page, 'sparks').locator('[data-act="pt-box"]').click();
  await expect.poll(async () => (await saved(page)).body.emitters[0].area).toEqual({ x0: 2, y0: 2, x1: 30, y1: 30 });
  const c = await stagePoint(page, 29.6, 29.6);
  await drag(page, { x: c.x, y: c.y }, -4 * c.z, -6 * c.z);
  await expect.poll(async () => (await saved(page)).body.emitters[0].area).toEqual({ x0: 2, y0: 2, x1: 26, y1: 24 });
  // and moved by its middle
  const m = await stagePoint(page, 6, 20);
  await drag(page, m, 2 * m.z, 0);
  await expect.poll(async () => (await saved(page)).body.emitters[0].area).toEqual({ x0: 4, y0: 2, x1: 28, y1: 24 });
  await card(page, 'sparks').locator('[data-act="pt-unbox"]').click();
  await expect.poll(async () => (await saved(page)).body.emitters[0].area).toBeUndefined();
});

test('fx-fire-spell from the library: effect ports, priced, kept to their clips', async ({ page }) => {
  await library(page, 'fx-fire-spell');
  await expect(page.locator('.v2-pt-total')).toContainText('2,428 of 4,000');
  await expect(page.locator('.v2-pt-card')).toHaveCount(2);
  await expect(card(page, 'burst').locator('.v2-pt-cost')).toContainText('1,214');
  await pick(page, 'burst');
  await expect(card(page, 'burst').locator('.v2-pt-port')).toBeVisible();
  // its sliders are its arguments
  await expect(card(page, 'burst').locator('.v2-gen[data-gen="effect.fx-fire-spell@1"]')).toBeVisible();
  // in the clip "cast" the burst does not draw
  await page.locator('[data-pt-clip="cast"]').click();
  await expect(card(page, 'burst').locator('.v2-pt-out')).toBeVisible();
  await expect(card(page, 'cast').locator('.v2-pt-out')).toHaveCount(0);
});

test('explosion-large from the library: near the budget', async ({ page }) => {
  await library(page, 'explosion-large');
  await expect(page.locator('.v2-pt-total')).toContainText('3,810 of 4,000');
  await expect(page.locator('.v2-pt-meter')).toHaveAttribute('data-state', 'near');
});

test('a picture\'s emitter list gets the particle editor; its draw list keeps its rows', async ({ page }) => {
  await home(page);
  await page.locator('[data-start="v2-pictures"]').click();
  await expect(page.locator('main.studio-v2[data-body="pictures"]')).toBeVisible();
  await expect(page.locator('.v2-particles[data-list="body.pictures.emitters"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.v2-list[data-list="body.pictures.draw"] .v2-item').first()).toBeVisible();
  await expect(card(page, 'burst')).toContainText('pickup.burst@1');
});

test('nothing scrolls sideways at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await newEffect(page);
  await pick(page, 'flash');
  await page.locator('[data-act="pt-scrub"]').fill('3');
  await card(page, 'flash').locator('[data-act="pt-key"]').click();
  await expect(card(page, 'flash').locator('[data-k="pt-amount"]')).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);
  await library(page, 'fx-fire-spell');
  await pick(page, 'burst');
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test('a clip given far more than 64 frames: the lanes stay at the drawn frames, no error, no wait', async ({ page }) => {
  await newEffect(page);
  // the editor keeps a draft the validator refuses, so the count reaches the Body tab as typed (Contract 1: capped)
  for (const n of ['100000', '4294967296']) {
    await tab(page, 'Clips').click();
    const box = page.locator('[id="f-clips.hit.frames"]');
    await box.fill(n);
    await box.press('Enter');
    await expect.poll(async () => (await saved(page)).clips.hit.frames).toBe(Number(n));
    const t0 = Date.now();
    await tab(page, 'Body').click();
    await expect(page.locator('.v2-particles')).toBeVisible();
    await expect(page.locator('.v2-pt-card')).toHaveCount(2);
    // the drawn sprite (the last one the validator passed) has 5 frames in "hit": each card's lane shows those
    await expect(card(page, 'flash').locator('.v2-pt-cell')).toHaveCount(5);
    expect(await page.locator('.v2-pt-cell').count()).toBeLessThanOrEqual(2 * 64);
    expect(Number(await page.locator('[data-act="pt-scrub"]').getAttribute('max'))).toBe(4);
    expect(Date.now() - t0).toBeLessThan(5_000);
  }
});
