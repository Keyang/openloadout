// The studio page, part 2 (docs/studio.md section 5; build plan item S10): what the Move and Frames tabs add for every
// bone rig: Mirror legs, Sounds on this frame (by name, with play), and Keep a copy in the bag. These three were the
// tail of studio-page-hero.spec.mjs, which used the Hero (a library body) as its body; the Hero went with the library
// bodies (build item R1), so they run on a bone-rig template, Two legs. The rest of that file (the Hero's wave, its
// proportions and attach points, "Start this animation over from" a pose) was about the library body and is gone.
// The page is served from STUDIO_BASE_URL (default http://localhost:5199, the shared test server).
import { test, expect } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

async function newFrom(page, body = 'two-legs') {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Make a new one' }).click();
  await page.locator(`[data-start="${body}"]`).click();
  await expect(page.locator('main.v2.rx.studio')).toBeVisible();
  await expect(page.locator('.studio-canvas')).toBeVisible();
}
const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const saved = (page) => page.locator('.rx-foot .saved');
const draft = async (page) => { await expect(saved(page)).toContainText(/Saved on this computer/); return page.evaluate(() => { const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]); return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition; }); };

test('Mirror legs swaps the near and far foot on this frame', async ({ page }) => {
  await newFrom(page);
  const d0 = await draft(page);
  await tab(page, 'Move').click();
  await page.getByLabel('Animation', { exact: true }).selectOption('walk');
  await page.getByRole('button', { name: 'Mirror legs' }).click();
  await expect.poll(async () => (await draft(page)).clips.walk.keys[0].ik.footF).toEqual(d0.clips.walk.keys[0].ik.footN);
  expect((await draft(page)).clips.walk.keys[0].ik.footN).toEqual(d0.clips.walk.keys[0].ik.footF);
  // a body with no legs on two sides does not offer it
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Make a new one' }).click();
  await page.locator('[data-start="blob"]').click();
  await tab(page, 'Move').click();
  await expect(page.getByRole('button', { name: 'Mirror legs' })).toHaveCount(0);
});

test('Sounds on this frame: picked from the library by name, played, given a style, taken off', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newFrom(page);
  await tab(page, 'Frames').click();
  await page.getByLabel('Animation', { exact: true }).selectOption('walk');
  // frame 1 has the body's footstep
  await expect(page.locator('.cue-row')).toHaveCount(1);
  await expect(page.locator('.cue-row .cue-name')).toHaveText(/step/i);
  await page.locator('.timeline [data-frame="1"]').click();
  await expect(page.locator('.cue-row')).toHaveCount(0);
  const add = page.getByLabel('Add a sound on this frame');
  await expect(add).toBeVisible();
  await add.selectOption({ label: 'Jump' });
  await expect(page.locator('.cue-row')).toHaveCount(1);
  await expect.poll(async () => (await draft(page)).clips.walk.sounds.some((s) => s.sound === 'jump' && s.frame === 1)).toBe(true);
  await expect(page.locator('.studio-say')).toContainText('plays on frame 2');
  const row = page.locator('.cue-row');
  await expect(row.getByRole('button', { name: /^Play/ })).toBeEnabled();
  await row.getByRole('button', { name: /^Play/ }).click();
  const style = row.getByRole('combobox');
  const second = (await style.locator('option').allTextContents())[2];
  await style.selectOption({ label: second });
  await expect.poll(async () => (await draft(page)).clips.walk.sounds.find((s) => s.sound === 'jump').preset).toBe(second);
  await row.getByRole('button', { name: /off this frame/ }).click();
  await expect(page.locator('.cue-row')).toHaveCount(0);
  await expect.poll(async () => (await draft(page)).clips.walk.sounds.some((s) => s.sound === 'jump')).toBe(false);
  expect(errors).toEqual([]);
});

test('Keep a copy in the bag: a copy that stays as it is, beside the one that follows the draft', async ({ page }) => {
  await newFrom(page);
  await page.evaluate(async () => { await window.loadout.bag.clear(); });
  await page.locator('[data-act="to-bag"]').click();
  await expect(page.locator('[data-act="to-bag"]')).toHaveText('In your bag');
  const keep = page.locator('[data-act="keep-copy"]');
  await expect(keep).toBeVisible();
  await keep.click();
  await expect(page.locator('.studio-say')).toContainText('A copy that stays as it is now');
  const items = () => page.evaluate(async () => (await window.loadout.bag.items()).items.filter((i) => i.definition?.data).map((i) => i.definition.data.name).sort());
  await expect.poll(items).toEqual(['Two legs', 'Two legs']);
  await tab(page, 'Look & name').click();
  await page.getByLabel('Name', { exact: true }).fill('Sir Wave');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect.poll(items).toEqual(['Sir Wave', 'Two legs']);
});
