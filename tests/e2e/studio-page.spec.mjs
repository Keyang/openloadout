// The studio page, part 1 (docs/studio.md section 5, journeys a, c and d; build plan item S9).
//   Journey (a) by mouse and by keyboard: a new creature from a starting body, its body changed, named, posed, a new
//   animation added, every step saved. Journey (c): frame count and anchor. Journey (d): download the library file and a
//   sheet; put it in the bag (item S8), where it follows every edit (Q1), and every way that fails is said.
//   The frame: no page scroll at 1440x900 and 1024x768 in any tab, no sideways scroll at 375 px, autosave survives a
//   reload, undo and redo, a failed save is reported. Review S9: a change that would break the sprite is refused and
//   said; saved drafts that cannot be read whole are never saved over; clip names every object has are not clips; a
//   badly written address is a draft that is not here; Delete removes a shape, and a bone only on purpose.
// The page is served from STUDIO_BASE_URL (default http://localhost:5199, the shared test server):
//   STUDIO_BASE_URL=http://localhost:5211 npx playwright test tests/e2e/studio-page.spec.mjs
import { test, expect, hasHorizontalScroll, downloadFrom } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

const open = async (page, route = '/studio') => {
  await page.goto(`/index.html#${route}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.v2.studio-home, main.v2.studio')).toBeVisible();
};
/** Make a new draft from a starting body and wait for the editor. */
async function newFrom(page, body = 'four-legs') {
  await open(page);
  await page.getByRole('button', { name: 'Make a new one' }).click();
  await page.locator(`[data-start="${body}"]`).click();
  await expect(page.locator('main.v2.rx.studio')).toBeVisible();
  await expect(page.locator('.studio-canvas')).toBeVisible();
}
const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const saved = (page) => page.locator('.rx-foot .saved');
/** Where a handle is on the screen: its row says where it is drawn, in pixels of the picture box. */
async function handlePoint(page, id) {
  const row = page.locator(`.handle-row[data-handle="${id}"]`);
  await expect(row).toHaveCount(1);
  const at = (await row.getAttribute('data-at')).split(',').map(Number);
  const box = await page.locator('.studio-canvas').boundingBox();
  return [box.x + at[0], box.y + at[1]];
}
/** Drag a handle by dx, dy pixels of the sprite (the picture's zoom is read from the page). */
async function drag(page, id, dx, dy) {
  const z = Number.parseInt(await page.locator('.st-zoom').textContent(), 10);
  dx *= z; dy *= z;
  const [x, y] = await handlePoint(page, id);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
}
/** The draft as saved on this computer, once the footer says it is saved (a change is saved 500 ms after it). */
const draft = async (page) => { await expect(page.locator('.rx-foot .saved')).toContainText('Saved on this computer'); return savedDraft(page); };
const savedDraft = (page) => page.evaluate(() => {
  const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]);
  return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition;
});

test.describe('journey (a): a new creature', () => {
  test('by mouse: body, name, colours, posing, a new animation, all saved', async ({ page }) => {
    await newFrom(page, 'four-legs');
    await expect(tab(page, 'Body')).toHaveAttribute('aria-selected', 'true');
    // Body: the tail longer by dragging its tip
    const before = (await draft(page)).body.rig.bones.find((b) => b.id === 'tail1').length;
    await page.locator('[data-bone="tail1"]').click();
    await drag(page, 'bone:tail1', -3, -1);
    await expect.poll(async () => (await draft(page)).body.rig.bones.find((b) => b.id === 'tail1').length).toBeGreaterThan(before);
    // a bone on the head, dragged out into a crest, with a round shape on it
    await page.locator('[data-bone="head"]').click();
    await page.getByRole('button', { name: 'Add a bone' }).click();
    const bones = (await draft(page)).body.rig.bones;
    const crest = bones.find((b) => b.parent === 'head');
    expect(crest).toBeTruthy();
    await drag(page, `bone:${crest.id}`, 1, -3);
    await page.getByRole('button', { name: 'Add a shape' }).click();
    await page.getByRole('menuitem', { name: 'Round' }).click();
    await expect.poll(async () => (await draft(page)).body.rig.shapes.some((s) => s.bone === crest.id)).toBe(true);
    // Look & name
    await tab(page, 'Look & name').click();
    await page.getByLabel('Name', { exact: true }).fill('Moss newt');
    await page.getByLabel('Name', { exact: true }).press('Enter');
    await page.getByLabel('What is it?').selectOption('enemy');
    await expect(page.locator('.rx-head h1')).toHaveText('Moss newt');
    // Move: the walk exists; feet dragged on frames 0 and 4
    await tab(page, 'Move').click();
    await page.getByLabel('Animation', { exact: true }).selectOption('walk');
    for (const f of [0, 4]) {
      await page.locator(`.timeline [data-frame="${f}"]`).click();
      await drag(page, 'ik:foreN', 3, 0);
    }
    const walk = (await draft(page)).clips.walk;
    expect(walk.keys.find((k) => k.t === 0).ik.foreN[0]).toBe(7);
    // a new animation by its everyday name: Bite
    await page.getByLabel('Animation', { exact: true }).selectOption('attack');
    await page.locator('[data-act="remove-clip"]').click();
    await page.getByRole('button', { name: 'New animation' }).click();
    await page.getByLabel('Call it').fill('Bite');
    await page.getByRole('button', { name: 'Make it' }).click();
    await expect(page.getByLabel('Animation', { exact: true })).toHaveValue('attack');
    await page.locator('.timeline [data-frame="4"]').click();
    await drag(page, 'bone:head', 1, 1);
    await expect(page.locator('.key-state')).toContainText('frame 5');
    await expect(saved(page)).toContainText('Saved on this computer');
    const d = await draft(page);
    expect(d.name).toBe('Moss newt');
    expect(d.meta.role).toBe('characters/enemy');
    expect(d.clips.attack.label).toBe('Bite');
    // every step saved: a reload brings it back
    await page.reload();
    await expect(page.locator('.rx-head h1')).toHaveText('Moss newt');
    await expect(tab(page, 'Move')).toHaveAttribute('aria-selected', 'true');
  });

  test('by keyboard: modes 1 to 4, handles moved with arrows, a key added with K, undo', async ({ page }) => {
    await newFrom(page, 'blank');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('2');
    await expect(tab(page, 'Move')).toHaveAttribute('aria-selected', 'true');
    // a handle row takes the focus; arrows move the handle a pixel, Shift four
    const row = page.locator('.handle-row').first();
    await row.locator('.handle-name').focus();
    const id = await row.getAttribute('data-handle');
    const at0 = await row.getAttribute('data-at');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowUp');
    await expect(page.locator(`.handle-row[data-handle="${id}"]`)).not.toHaveAttribute('data-at', at0);
    // the frame: right arrow from the timeline, K adds a key there
    await page.locator('.timeline [data-frame="0"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.timeline [data-frame="1"]')).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('k');
    await expect(page.locator('.timeline [data-frame="1"]')).toHaveClass(/has-key/);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.timeline [data-frame="1"]')).not.toHaveClass(/has-key/);
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('.timeline [data-frame="1"]')).toHaveClass(/has-key/);
    await page.keyboard.press('4');
    await expect(tab(page, 'Look & name')).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('Name', { exact: true }).focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Pebble');
    await page.keyboard.press('Tab');
    await expect(page.locator('.rx-head h1')).toHaveText('Pebble');
  });
});

test('journey (c): fewer frames keep the motion; the anchor snaps to the feet', async ({ page }) => {
  await newFrom(page, 'two-legs');
  await tab(page, 'Frames').click();
  await page.getByLabel('Animation', { exact: true }).selectOption('walk');
  const frames = page.getByRole('spinbutton', { name: 'Frames', exact: true });
  await frames.fill('6');
  await frames.press('Enter');
  await expect(page.locator('.timeline [data-frame]')).toHaveCount(6);
  const d = await draft(page);
  expect(d.clips.walk.frames).toBe(6);
  for (const k of d.clips.walk.keys) expect(Math.abs(k.t * 6 - Math.round(k.t * 6))).toBeLessThan(1e-9);
  await page.getByLabel('Anchor across', { exact: true }).fill('3');
  await page.getByLabel('Anchor across', { exact: true }).press('Enter');
  await expect.poll(async () => (await draft(page)).pivot[0]).toBe(3);
  await page.getByRole('button', { name: 'Snap to the feet' }).click();
  await expect.poll(async () => (await draft(page)).pivot[0]).not.toBe(3);
  await page.getByLabel('Speed', { exact: true }).fill('8');
  await page.getByLabel('Speed', { exact: true }).press('Enter');
  await expect.poll(async () => (await draft(page)).clips.walk.fps).toBe(8);
});

test('journey (d): the studio file to keep and the sheet download', async ({ page }) => {
  await newFrom(page, 'blob');
  await page.getByRole('button', { name: 'Download' }).click();
  const file = await downloadFrom(page, () => page.getByRole('menuitem', { name: /Studio file to keep/ }).click());
  expect(file.name).toMatch(/^[a-z][a-z0-9-]*\.js$/);
  const text = file.bytes.toString('utf8');
  expect(text.split('\n')[0]).toContain('Made in the Loadout studio');
  expect(text).toContain("import { dataSprite } from '../engine/data-sprite.js';");
  await page.getByRole('button', { name: 'Download' }).click();
  const sheet = await downloadFrom(page, () => page.getByRole('menuitem', { name: 'Sheet picture (PNG)' }).click());
  expect(sheet.name).toMatch(/\.png$/);
  expect(sheet.bytes.subarray(1, 4).toString()).toBe('PNG');
  // the downloaded file opens in the studio again, as a new draft
  await open(page);
  await page.locator('.studio-home input[type="file"]').setInputFiles({ name: file.name, mimeType: 'text/javascript', buffer: file.bytes });
  await expect(page.locator('main.v2.rx.studio')).toBeVisible();
  await expect(tab(page, 'Look & name')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.rx-head h1')).toHaveText('Blob');
});

/** The bag's studio sprites, as window.loadout.bag lists them: [{ key, name }]. */
const bagSprites = (page) => page.evaluate(async () => (await window.loadout.bag.items()).items.filter((i) => i.definition?.data).map((i) => ({ key: i.key, name: i.definition.data.name })));
/** Rename the draft on the Look & name tab. */
async function rename(page, name) {
  await tab(page, 'Look & name').click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(page.locator('.rx-head h1')).toHaveText(name);
}

test('journey (d): put in my bag, and the bag item follows every edit (Q1)', async ({ page }) => {
  await newFrom(page, 'blob');
  await page.evaluate(async () => { await window.loadout.bag.clear(); });
  const toBag = page.locator('[data-act="to-bag"]');
  const play = page.locator('[data-act="play"]');
  await expect(toBag).toBeEnabled();
  await expect(page.locator('.bag-note')).toBeHidden();
  await expect(play).toBeDisabled();
  await toBag.click();
  await expect(toBag).toHaveText('In your bag');
  await expect(toBag).toBeDisabled();
  await expect(play).toBeEnabled();
  await expect(saved(page)).toContainText('In your bag');
  await expect.poll(() => bagSprites(page)).toEqual([{ key: expect.any(String), name: 'Blob' }]);
  // an edit reaches the bag item
  await rename(page, 'Puddle');
  await expect.poll(async () => (await bagSprites(page)).map((i) => i.name)).toEqual(['Puddle']);
  // the bag refuses an update: said, and the button offers to update it
  await page.evaluate(async () => { const m = await import('/app/bag.js'); m.bag.updateDefinition = () => { throw new Error('the bag is broken'); }; });
  await rename(page, 'Puddle two');
  await expect(page.locator('.studio-say')).toContainText('Your bag was not updated');
  await expect(saved(page)).toContainText('Your bag has an older copy');
  await expect(toBag).toHaveText('Update my bag');
  await expect(toBag).toBeEnabled();
  expect((await bagSprites(page)).map((i) => i.name)).toEqual(['Puddle']);
  await page.reload();
  await expect(page.locator('.rx-head h1')).toHaveText('Puddle two');
  // the item taken out of the bag: the draft says so and forgets it
  const [{ key }] = await bagSprites(page);
  await page.evaluate(async (k) => { await window.loadout.bag.remove(k); }, key);
  await rename(page, 'Puddle three');
  await expect(page.locator('.studio-say')).toContainText('no longer in your bag');
  await expect(toBag).toHaveText('Put in my bag');
  await expect(toBag).toBeEnabled();
  await expect(play).toBeDisabled();
  expect(await bagSprites(page)).toEqual([]);
  expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts).some((d) => d.bagKey))).toBe(false);
});

test('a change that would break the sprite is refused and said; the draft stays as it was', async ({ page }) => {
  // a stand-in for a bug in a change: "One sentence" with #break in it returns a definition the validator refuses
  await page.route('**/app/studio/edit.js', async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace('export function setBlurb(def, text) {', "export function setBlurb(def, text) { if (String(text).includes('#break')) return { ...cp(def), id: 'Not An Id' };");
    await route.fulfill({ response: res, body });
  });
  await newFrom(page, 'blob');
  await tab(page, 'Look & name').click();
  const blurb = page.getByLabel('One sentence', { exact: true });
  await blurb.fill('A small wobbly thing.');
  await blurb.press('Tab');
  await expect.poll(async () => (await draft(page)).blurb).toBe('A small wobbly thing.');
  await blurb.fill('This one breaks it #break');
  await blurb.press('Tab');
  await expect(page.locator('.studio-say')).toContainText('That change was not made');
  await expect(page.locator('[data-act="undo"]')).toBeEnabled();
  await page.waitForTimeout(700);
  const d = await draft(page);
  expect(d.blurb).toBe('A small wobbly thing.');
  expect(d.id).toMatch(/^[a-z][a-z0-9-]*$/);
  await expect(page.getByLabel('One sentence', { exact: true })).toHaveValue('A small wobbly thing.');
});

test('saved drafts that cannot be read whole are never saved over; download them, then start afresh', async ({ page }) => {
  await newFrom(page, 'blob');
  await expect(saved(page)).toContainText('Saved on this computer');
  const damaged = await page.evaluate(() => { const t = localStorage.getItem('loadout-studio-v1').slice(0, -2); localStorage.setItem('loadout-studio-v1', t); return t; });
  await open(page);
  const alert = page.locator('.st-trouble');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('could not be read');
  await expect(page.getByText('Nothing yet')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Make a new one' })).toBeDisabled();
  // opening a draft by its address does not save over them either
  await page.goto('/index.html#/studio/blob?mode=sprite');
  await expect(page.locator('.st-trouble')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('loadout-studio-v1'))).toBe(damaged);
  const file = await downloadFrom(page, () => page.locator('[data-act="download-saved"]').click());
  expect(file.bytes.toString('utf8')).toBe(damaged);
  await page.locator('[data-act="start-afresh"]').click();
  await expect(page.locator('.st-trouble')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Make a new one' })).toBeEnabled();
  await page.getByRole('button', { name: 'Make a new one' }).click();
  await page.locator('[data-start="blob"]').click();
  await expect(page.locator('main.v2.rx.studio')).toBeVisible();
});

test('an address naming a clip every object has, or badly written, is handled', async ({ page }) => {
  await newFrom(page, 'blob');
  const id = await page.evaluate(() => location.hash.split('/')[2].split('?')[0]);
  for (const clip of ['constructor', '__proto__', 'toString']) {
    await page.goto(`/index.html#/studio/${id}?mode=animate&clip=${clip}&frame=2`);
    await expect(page.locator('main.v2.rx.studio')).toBeVisible();
    await expect(page.locator('.st-clipname')).not.toContainText('undefined');
    await expect(page.locator('main')).not.toContainText('NaN');
    expect(await page.getByLabel('Animation', { exact: true }).inputValue()).not.toBe('');
  }
  await page.getByRole('button', { name: 'New animation' }).click();
  await page.getByLabel('Call it').fill('Constructor');
  await page.getByRole('button', { name: 'Make it' }).click();
  await expect(page.locator('.studio-say')).toContainText('keeps for itself');
  await page.goto('/index.html#/studio/%E0');
  await expect(page.getByRole('heading', { name: 'That draft is not here' })).toBeVisible();
});

test('Delete removes the shape in hand; a bone only when its handle is picked, twice when bones hang from it', async ({ page }) => {
  await newFrom(page, 'four-legs');
  const before = await draft(page);
  // the default pick is a bone, but no handle: Backspace does nothing
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(600);
  expect((await draft(page)).body.rig.bones.length).toBe(before.body.rig.bones.length);
  // a shape row in hand: Delete removes that shape
  await page.locator('[data-bone="head"]').click();
  const row = page.locator('.shape-row[data-shape]').first();
  const sid = await row.getAttribute('data-shape');
  await row.locator(`[data-k="bigger-${sid}"]`).focus();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await draft(page)).body.rig.shapes.some((s) => s.id === sid)).toBe(false);
  // a bone with bones under it: the first Delete asks, the second removes them
  const parent = before.body.rig.bones.find((b) => b.parent && before.body.rig.bones.some((c) => c.parent === b.id));
  await page.locator(`.handle-row[data-handle="bone:${parent.id}"] .handle-name`).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.studio-say')).toContainText('Press Delete again');
  expect((await draft(page)).body.rig.bones.some((b) => b.id === parent.id)).toBe(true);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await draft(page)).body.rig.bones.some((b) => b.id === parent.id)).toBe(false);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await draft(page)).body.rig.bones.some((b) => b.id === parent.id)).toBe(true);
});

test('a top-down body can be started from; the Hero (a library body) is not offered any more (build item R1)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Make a new one' }).click();
  await expect(page.locator('[data-start="topdown-person"]')).toBeVisible();
  await expect(page.locator('[data-start="hero"]')).toHaveCount(0);
  await newFrom(page, 'topdown-person');
  await tab(page, 'Move').click();
  await expect(page.getByLabel('Animation', { exact: true })).toContainText('Walk (down)');
});

test('undo and redo from the buttons; autosave survives a reload; drafts are listed and removed', async ({ page }) => {
  await newFrom(page, 'crawler');
  await tab(page, 'Look & name').click();
  const name = page.getByLabel('Name', { exact: true });
  await name.fill('Rock beetle');
  await name.press('Enter');
  await expect(page.locator('.rx-head h1')).toHaveText('Rock beetle');
  await page.locator('[data-act="undo"]').click();
  await expect(page.locator('.rx-head h1')).not.toHaveText('Rock beetle');
  await page.locator('[data-act="redo"]').click();
  await expect(page.locator('.rx-head h1')).toHaveText('Rock beetle');
  await expect(saved(page)).toContainText('Saved on this computer');
  await page.reload();
  await expect(page.locator('.rx-head h1')).toHaveText('Rock beetle');
  await open(page);
  const card = page.locator('.draft', { hasText: 'Rock beetle' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Remove/ }).click();
  await expect(page.locator('.draft', { hasText: 'Rock beetle' })).toHaveCount(0);
});

test('storage blocked: drafts live as long as the tab, are listed, open again and go in the bag', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // a private window or blocked site data: reading localStorage throws
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }); });
  await open(page);
  await expect(page.locator('.studio-home p.not-kept')).toContainText('not saving for this site');
  await page.getByRole('button', { name: 'Make a new one' }).click();
  await page.locator('[data-start="blob"]').click();
  await expect(page.locator('main.v2.rx.studio')).toBeVisible();
  await expect(saved(page)).toContainText('Not kept after this tab closes');
  await rename(page, 'Tab slime');
  // back to the studio's first page (a hash change, not a reload): the draft is listed and opens again
  await page.evaluate(() => { location.hash = '#/studio'; });
  const card = page.locator('.draft', { hasText: 'Tab slime' });
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: 'Open Tab slime' }).click();
  await expect(page.locator('.rx-head h1')).toHaveText('Tab slime');
  await expect(saved(page)).toContainText('Not kept after this tab closes');
  // Put in my bag finds the draft made here, and the bag item follows an edit
  await page.evaluate(async () => { await window.loadout.bag.clear(); });
  const toBag = page.locator('[data-act="to-bag"]');
  await expect(toBag).toBeEnabled();
  await toBag.click();
  await expect(toBag).toHaveText('In your bag');
  await expect.poll(() => bagSprites(page)).toEqual([{ key: expect.any(String), name: 'Tab slime' }]);
  await expect(page.locator('.studio-say')).not.toContainText('studio_file');
  await rename(page, 'Tab slime two');
  await expect.poll(async () => (await bagSprites(page)).map((i) => i.name)).toEqual(['Tab slime two']);
  expect(errors).toEqual([]);
});

test('a failed save is reported, with a way to keep the work', async ({ page }) => {
  await newFrom(page, 'blank');
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'loadout-studio-v1') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return set.call(this, k, v); };
  });
  await tab(page, 'Look & name').click();
  await page.getByLabel('Name', { exact: true }).fill('Will not fit');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(saved(page)).toContainText(/could not be saved/i);
  await expect(page.locator('.rx-foot').getByRole('button', { name: 'Download the file' })).toBeVisible();
});

for (const [w, h] of [[1440, 900], [1024, 768]]) {
  test(`${w}x${h}: the page does not scroll in any tab`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await newFrom(page, 'four-legs');
    for (const name of ['Body', 'Move', 'Frames', 'Look & name']) {
      await tab(page, name).click();
      const m = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight]);
      expect(m[0], `${name}: no sideways scroll`).toBeLessThanOrEqual(m[2]);
      expect(m[1], `${name}: no page scroll`).toBeLessThanOrEqual(m[3]);
      const foot = await page.locator('.rx-foot').boundingBox();
      expect(foot.y + foot.height, `${name}: the footer is in the window`).toBeLessThanOrEqual(h + 1);
    }
  });
}

test('375 px: no sideways scroll; the picture stays pinned; handles are a list with arrows', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await newFrom(page, 'four-legs');
  for (const name of ['Body', 'Move', 'Frames', 'Look & name']) {
    await tab(page, name).click();
    expect(await hasHorizontalScroll(page), `${name}: no sideways scroll`).toBe(false);
  }
  await tab(page, 'Move').click();
  const row = page.locator('.handle-row').first();
  await expect(row.getByRole('button', { name: /right/i })).toBeVisible();
  const at0 = await row.getAttribute('data-at');
  await row.getByRole('button', { name: /right/i }).click();
  await expect(page.locator(`.handle-row[data-handle="${await row.getAttribute('data-handle')}"]`)).not.toHaveAttribute('data-at', at0);
  await page.evaluate(() => window.scrollTo(0, 600));
  const stage = await page.locator('.studio-canvas').boundingBox();
  expect(stage.y).toBeGreaterThanOrEqual(-1);
});
