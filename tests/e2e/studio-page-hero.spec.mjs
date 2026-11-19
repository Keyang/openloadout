// The studio page, part 2 (docs/studio.md section 5, journey b; build plan item S10).
//   Journey (b): start from the Hero, the 9 clips arrive baked; Move: "New animation" Wave (a new name) starts as a copy
//   of Idle; frame 3 the near hand dragged up (the arm follows), frame 5 down, frame 7 up; it loops; Frames: 8 frames,
//   speed 8. Around it: the Hero's proportions move every animation, the attach points are drawn, a clip starts over
//   from a pose of the body, the swing light's keys between frames are shown as ticks and can be removed, Mirror legs,
//   Sounds on this frame (by name, with play), and Keep a copy in the bag.
// The page is served from STUDIO_BASE_URL (default http://localhost:5199, the shared test server).
import { test, expect } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

async function newHero(page) {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Make a new one' }).click();
  await page.locator('[data-start="hero"]').click();
  await expect(page.locator('main.v2.rx.studio')).toBeVisible();
  await expect(page.locator('.studio-canvas')).toBeVisible();
}
/** Move a slider and let go (a range input cannot be typed into). */
const setRange = (loc, v) => loc.evaluate((n, x) => { n.value = String(x); n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const saved = (page) => page.locator('.rx-foot .saved');
const draft = async (page) => { await expect(saved(page)).toContainText(/Saved on this computer/); return page.evaluate(() => { const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]); return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition; }); };
const keyAt = (clip, f) => clip.keys.find((k) => Math.abs(k.t - (clip.loop === false ? f / (clip.frames - 1) : f / clip.frames)) < 1e-6);
/** Where a handle is drawn, in page pixels, from its row's data-at. */
async function handlePoint(page, id) {
  const row = page.locator(`.handle-row[data-handle="${id}"]`);
  await expect(row).toHaveCount(1);
  await expect(row).not.toHaveAttribute('data-at', '');
  const at = (await row.getAttribute('data-at')).split(',').map(Number);
  const box = await page.locator('.studio-canvas').boundingBox();
  return [box.x + at[0], box.y + at[1]];
}
/** Drag a handle by dx, dy pixels of the sprite. */
async function drag(page, id, dx, dy) {
  const z = Number.parseInt(await page.locator('.st-zoom').textContent(), 10);
  const [x, y] = await handlePoint(page, id);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (dx * z) / 2, y + (dy * z) / 2, { steps: 3 });
  await page.mouse.move(x + dx * z, y + dy * z, { steps: 3 });
  await page.mouse.up();
}

test('journey (b): the Hero gets a new animation, Wave, posed by dragging the hand; it loops, 8 frames at speed 8', async ({ page }) => {
  await newHero(page);
  const d0 = await draft(page);
  expect(Object.keys(d0.clips)).toEqual(['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'die', 'block', 'victory']);
  for (const c of Object.values(d0.clips)) expect(c.keys.length).toBeGreaterThanOrEqual(c.frames);
  await tab(page, 'Move').click();
  await page.getByRole('button', { name: 'New animation' }).click();
  await page.getByLabel('Call it').fill('Wave');
  await page.getByRole('button', { name: 'Make it' }).click();
  await expect(page.getByLabel('Animation', { exact: true })).toHaveValue('wave');
  // the handles of a library body are on the picture and in the list
  for (const id of ['lib:hip', 'lib:armF', 'lib:armB', 'lib:footF', 'lib:footB', 'lib:head']) await expect(page.locator(`.handle-row[data-handle="${id}"]`)).toHaveCount(1);
  const z = Number.parseInt(await page.locator('.st-zoom').textContent(), 10);
  // frames 3 and 7: the near hand up (the arm follows); frame 5: down and forward, the arm hanging again
  const handY = {};
  for (const [f, dx, dy] of [[2, 0, -8], [4, 3, 1], [6, 0, -8]]) {
    await page.locator(`.timeline [data-frame="${f}"]`).click();
    const before = await handlePoint(page, 'lib:armF');
    await drag(page, 'lib:armF', dx, dy);
    if (dy < 0) await expect.poll(async () => (await handlePoint(page, 'lib:armF'))[1] - before[1]).toBeLessThan((dy * z) / 2);
    else await expect.poll(async () => (await handlePoint(page, 'lib:armF'))[0] - before[0]).toBeGreaterThan(z);
    await expect(page.locator('.key-state')).toContainText(`frame ${f + 1}`);
    await expect(page.locator('.key-state')).toContainText('Near arm');
    handY[f] = (await handlePoint(page, 'lib:armF'))[1];
  }
  expect(handY[4]).toBeGreaterThan(handY[2] + 4 * z);
  expect(handY[4]).toBeGreaterThan(handY[6] + 4 * z);
  // Frames: it loops; 8 frames at 8 a second
  await tab(page, 'Frames').click();
  await expect(page.getByRole('switch', { name: 'Loop' })).toBeChecked();
  const frames = page.getByRole('spinbutton', { name: 'Frames', exact: true });
  await frames.fill('8');
  await frames.press('Enter');
  await page.getByLabel('Speed', { exact: true }).fill('8');
  await page.getByLabel('Speed', { exact: true }).press('Enter');
  await expect.poll(async () => (await draft(page)).clips.wave.fps).toBe(8);
  const d = await draft(page);
  const wave = d.clips.wave;
  expect(wave).toMatchObject({ label: 'Wave', frames: 8, fps: 8, loop: true, from: 'idle' });
  const idle = d.clips.idle;
  for (const f of [2, 4, 6]) expect(keyAt(wave, f).armF).not.toEqual(keyAt(idle, f).armF);
  expect(keyAt(wave, 2).armF.a).not.toBe(keyAt(idle, 2).armF.a);
  expect(keyAt(wave, 2).armF.e).not.toBe(keyAt(idle, 2).armF.e);
  // kept: a reload brings it back
  await page.reload();
  await expect(page.getByLabel('Animation', { exact: true })).toHaveValue('wave');
});

test('the Hero\'s body: proportions move every animation, his attach points are drawn where he puts them', async ({ page }) => {
  await newHero(page);
  await expect(tab(page, 'Body')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.st-pane .chip[data-point]')).toHaveCount(5);
  await expect(page.locator('.st-pane')).toContainText('Liveliness');
  const height = page.getByRole('slider', { name: 'Height' });
  await setRange(height, 0.9);
  await expect.poll(async () => (await draft(page)).body.figure.body.height).toBe(0.9);
  const d = await draft(page);
  expect(d.controls.find((c) => c.key === 'height').default).toBe(0.9);
  await expect(page.locator('.studio-say')).toContainText('every animation moved');
  await setRange(page.getByRole('slider', { name: 'Liveliness' }), 1);
  await expect.poll(async () => (await draft(page)).body.figure.motion.bounce).toBe(1);
  await page.locator('[data-act="undo"]').click();
  await expect.poll(async () => (await draft(page)).body.figure.motion.bounce).toBe(0.5);
});

test('start a clip over from a pose of the body; the swing light\'s keys between frames are ticks, and can go', async ({ page }) => {
  await newHero(page);
  const d0 = await draft(page);
  await tab(page, 'Move').click();
  await page.getByLabel('Animation', { exact: true }).selectOption('walk');
  await page.locator('.timeline [data-frame="2"]').click();
  await page.locator('.handle-row[data-handle="lib:footF"]').getByRole('button', { name: /Move Near foot right/ }).click();
  await expect.poll(async () => JSON.stringify((await draft(page)).clips.walk.keys)).not.toBe(JSON.stringify(d0.clips.walk.keys));
  await page.getByLabel('Start this animation over from').selectOption('walk');
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.locator('.studio-say')).toContainText('started over');
  await expect.poll(async () => JSON.stringify((await draft(page)).clips.walk.keys)).toBe(JSON.stringify(d0.clips.walk.keys));
  // the attack: 14 keys for 8 frames, 6 of them between frames, shown as thin ticks, said once
  await page.getByLabel('Animation', { exact: true }).selectOption('attack');
  await expect(page.locator('.timeline .light-tick')).not.toHaveCount(0);
  await expect(page.locator('.light-row')).toContainText('Swing light: 6 keys between frames');
  await expect(page.locator('.timeline .frame.has-key')).toHaveCount(8);
  await page.locator('.light-row').getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.timeline .light-tick')).toHaveCount(0);
  await expect(page.locator('.light-row')).toHaveCount(0);
  await expect.poll(async () => (await draft(page)).clips.attack.keys.length).toBe(8);
  // and back, from the body's swing: 14 keys again
  await page.getByLabel('Start this animation over from').selectOption('attack');
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect.poll(async () => (await draft(page)).clips.attack.keys.length).toBe(14);
});

test('Mirror legs swaps the near and far foot on this frame', async ({ page }) => {
  await newHero(page);
  const d0 = await draft(page);
  await tab(page, 'Move').click();
  await page.getByLabel('Animation', { exact: true }).selectOption('walk');
  await page.getByRole('button', { name: 'Mirror legs' }).click();
  await expect.poll(async () => (await draft(page)).clips.walk.keys[0].footF).toEqual(d0.clips.walk.keys[0].footB);
  expect((await draft(page)).clips.walk.keys[0].footB).toEqual(d0.clips.walk.keys[0].footF);
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
  await newHero(page);
  await tab(page, 'Frames').click();
  await page.getByLabel('Animation', { exact: true }).selectOption('walk');
  // frame 1 has the Hero's footstep
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
  await newHero(page);
  await page.evaluate(async () => { await window.loadout.bag.clear(); });
  await page.locator('[data-act="to-bag"]').click();
  await expect(page.locator('[data-act="to-bag"]')).toHaveText('In your bag');
  const keep = page.locator('[data-act="keep-copy"]');
  await expect(keep).toBeVisible();
  await keep.click();
  await expect(page.locator('.studio-say')).toContainText('A copy that stays as it is now');
  const items = () => page.evaluate(async () => (await window.loadout.bag.items()).items.filter((i) => i.definition?.data).map((i) => i.definition.data.name).sort());
  await expect.poll(items).toEqual(['Hero', 'Hero']);
  await tab(page, 'Look & name').click();
  await page.getByLabel('Name', { exact: true }).fill('Sir Wave');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect.poll(items).toEqual(['Hero', 'Sir Wave']);
});
