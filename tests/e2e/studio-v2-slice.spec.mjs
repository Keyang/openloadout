// The studio's 9-slice editor for panel bodies (build item B19b; docs/data-sprites.md section 6, "Interface: 9-slice
// editor"; Contract 8 "Stretchable pieces"). On the Body tab of a panel draft it replaces the field tree:
//   - the panel's states as tabs; the export of the state (slice and text area) as the library download gives it;
//   - the slice lines and the text area dragged on a zoomed picture (and changed in number boxes, by keyboard), written
//     for the state or for every state, and taken back to what the piece measures;
//   - the piece stretched to several sizes side by side, following the slice as it is dragged;
//   - the skin piece reference (use, version, its slots mapped to the palette) and the piece's arguments;
//   - All fields still shows the whole definition; nothing scrolls sideways at phone width.
// Seen with ui-buttons-wood, ui-bars-neon and the panel template. Served from STUDIO_BASE_URL (default
// http://localhost:5199, the shared test server).
import fs from 'node:fs';
import { test, expect, hasHorizontalScroll, canvasStats } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

const lib = (id) => JSON.parse(fs.readFileSync(new URL(`../../sprites/${id}.json`, import.meta.url), 'utf8'));

/** A library sprite kept as a draft on this computer (the library's own file under another id), opened on Body. */
async function openDraft(page, id, draft) {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.v2')).toBeVisible();
  await page.evaluate(({ k, d }) => {
    localStorage.removeItem('loadout-bag');
    localStorage.setItem('loadout-studio-v1', JSON.stringify({ version: 1, drafts: { [k]: { definition: d, savedAt: Date.now() } } }));
  }, { k: draft, d: { ...lib(id), id: draft } });
  watchSounds(page);
  await page.evaluate((h) => { location.hash = h; }, `#/studio/${draft}?mode=body`);
  await ready(page);
}
/** The quality bar's worker reads the sound library once a page; each test waits for it, so no read is cut short. */
const sounds = new WeakMap();
const watchSounds = (page) => sounds.set(page, page.waitForResponse((r) => /generated\/sounds\.json$/.test(r.url()), { timeout: 45_000 }).then((r) => r.finished()).catch(() => {}));
const settle = (page) => sounds.get(page);
/** Waits until the slice editor has drawn its picture. */
async function ready(page) {
  await expect(page.locator('main.studio-v2[data-body="panel"]')).toBeVisible();
  await expect(page.locator('.v2-slice')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await canvasStats(page.locator('.v2-slice-pic'))).opaque, { timeout: 20_000 }).toBeGreaterThan(0);
}
/** The draft as saved on this computer. */
const saved = (page) => page.evaluate(() => {
  const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]);
  return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition;
});
/** The export the editor shows for the state. */
const shown = async (page) => JSON.parse(await page.locator('.v2-slice-export').textContent());
/** Where a frame pixel (x, y) of the zoomed picture is on the screen. */
async function at(page, x, y) {
  const pic = page.locator('.v2-slice-pic');
  const box = await pic.boundingBox();
  const k = box.width / Number(await pic.getAttribute('data-w'));
  return [box.x + x * k, box.y + y * k];
}
/** Drags on the zoomed picture from one frame pixel to another. */
async function drag(page, from, to) {
  const a = await at(page, ...from), b = await at(page, ...to);
  await page.mouse.move(...a);
  await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 3 });
  await page.mouse.move(...b, { steps: 3 });
  await page.mouse.up();
}
const tab = (page, name) => page.getByRole('tab', { name, exact: false }).filter({ hasText: name });

test('the wooden buttons: the slice editor replaces the field tree and shows the export as the download gives it', async ({ page }) => {
  await openDraft(page, 'ui-buttons-wood', 'wood-slice');
  // no tree of the rest of the body: the editor is in its place, the states are tabs
  await expect(page.locator('.v2-pane h3', { hasText: 'The rest of the body' })).toHaveCount(0);
  await expect(page.locator('.v2-slice-states [data-state]')).toHaveCount(4);
  await expect(page.locator('.v2-slice-states [data-state="normal"]')).toHaveAttribute('aria-selected', 'true');
  expect(await shown(page)).toEqual({ border: { left: 8, bottom: 7, right: 8, top: 7 }, textArea: { x: 8, y: 7, w: 80, h: 18, colour: 'light' } });
  await expect(page.locator('.v2-slice-source')).toContainText('measured');
  // the pressed state has its own measure (its lip moves the face down)
  await page.locator('.v2-slice-states [data-state="pressed"]').click();
  await expect.poll(async () => (await shown(page)).border).toEqual({ left: 8, bottom: 5, right: 8, top: 9 });
  await expect(page.locator('.st-under .chip[data-clip="pressed"]')).toHaveAttribute('aria-pressed', 'true');
  // several stretched sizes, side by side, each drawn
  const previews = page.locator('.v2-slice-preview canvas');
  expect(await previews.count()).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < await previews.count(); i++) expect((await canvasStats(previews.nth(i))).opaque).toBeGreaterThan(0);
  // the piece's arguments and the skin are here too
  await expect(page.locator('.v2-slice .v2-gen[data-gen="ui.button@1"]')).toBeVisible();
  await expect(page.getByLabel('Skin piece')).toHaveValue('skin:wood');
  // All fields still holds the whole definition
  await tab(page, 'All fields').click();
  await expect(page.locator('.v2-pane .v2-sub[data-path="body"]')).toBeAttached();
  await expect(page.locator('.v2-slice')).toHaveCount(0);
  await settle(page);
});

test('drag a slice line and the text area; the preview and the export follow; back to the measured', async ({ page }) => {
  await openDraft(page, 'ui-buttons-wood', 'wood-drag');
  const preview = page.locator('.v2-slice-preview canvas').nth(1);
  const before = (await canvasStats(preview)).hash;
  // the left line, from 8 to 14, above the text area
  await drag(page, [8, 2], [14, 2]);
  await expect.poll(async () => (await saved(page)).slice).toEqual({ normal: { left: 14, top: 7, right: 8, bottom: 7 } });
  await expect.poll(async () => (await shown(page)).border).toEqual({ left: 14, bottom: 7, right: 8, top: 7 });
  await expect(page.locator('.v2-slice-source')).toContainText('yours');
  await expect.poll(async () => (await canvasStats(page.locator('.v2-slice-preview canvas').nth(1))).hash).not.toBe(before);
  // the bottom line, down two
  await drag(page, [50, 25], [50, 27]);
  await expect.poll(async () => (await saved(page)).slice.normal.bottom).toBe(5);
  // the text area moved two right and one down, then made narrower by its corner
  await drag(page, [48, 16], [50, 17]);
  await expect.poll(async () => (await saved(page)).textArea).toEqual({ normal: { x: 10, y: 8, w: 80, h: 18 } });
  await drag(page, [90, 26], [80, 26]);
  await expect.poll(async () => (await saved(page)).textArea?.normal?.w).toBe(70);
  await expect.poll(async () => (await shown(page)).textArea).toEqual({ x: 10, y: 8, w: 70, h: 18, colour: 'light' });
  // the other states keep what the piece measures
  await page.locator('.v2-slice-states [data-state="hover"]').click();
  await expect.poll(async () => (await shown(page)).border).toEqual({ left: 8, bottom: 7, right: 8, top: 7 });
  await page.locator('.v2-slice-states [data-state="normal"]').click();
  // back to the measured
  await page.locator('[data-act="slice-measured"]').click();
  await expect.poll(async () => 'slice' in (await saved(page))).toBe(false);
  await page.locator('[data-act="area-measured"]').click();
  await expect.poll(async () => 'textArea' in (await saved(page))).toBe(false);
  await expect.poll(async () => (await shown(page)).border).toEqual({ left: 8, bottom: 7, right: 8, top: 7 });
  // undo brings the text area back
  await page.locator('[data-act="undo"]').click();
  await expect.poll(async () => (await saved(page)).textArea?.normal?.w).toBe(70);
  await settle(page);
});

test('by keyboard: number boxes for the lines and the text area; one slice for every state', async ({ page }) => {
  await openDraft(page, 'ui-buttons-wood', 'wood-keys');
  await page.getByLabel('Same for every state').check();
  const left = page.getByLabel('Slice left');
  await left.fill('10');
  await left.press('Enter');
  await expect.poll(async () => (await saved(page)).slice).toEqual({ left: 10, top: 7, right: 8, bottom: 7 });
  const w = page.getByLabel('Text area width');
  await w.fill('60');
  await w.press('Enter');
  await expect.poll(async () => (await saved(page)).textArea).toEqual({ x: 8, y: 7, w: 60, h: 18 });
  // a text colour from the palette
  await page.getByLabel('Text colour').selectOption('ink');
  await expect.poll(async () => (await saved(page)).textArea.colour).toBe('ink');
  await expect.poll(async () => (await shown(page)).textArea.colour).toBe('#231b33');
  // every state says it
  await page.locator('.v2-slice-states [data-state="disabled"]').click();
  await expect.poll(async () => (await shown(page)).border).toEqual({ left: 10, bottom: 7, right: 8, top: 7 });
  // the check still passes
  await tab(page, 'Check').click();
  await expect(page.locator('.adv-status[data-state="ok"]')).toBeVisible();
  await settle(page);
});

test('the skin piece: its reference and version, its slots mapped to the palette', async ({ page }) => {
  await openDraft(page, 'ui-buttons-wood', 'wood-skin');
  await expect(page.getByLabel('Skin version')).toHaveValue('1');
  const nail = page.getByLabel('Skin colour nail');
  await expect(nail).toBeVisible();
  await nail.selectOption('frame');
  await expect.poll(async () => (await saved(page)).body.panel.skin.paint.nail).toBe('frame');
  await nail.selectOption('');
  await expect.poll(async () => (await saved(page)).body.panel.skin.paint.nail).toBeUndefined();
  // another skin by its reference
  const use = page.getByLabel('Skin piece');
  await use.fill('skin:plain');
  await use.press('Enter');
  await expect.poll(async () => (await saved(page)).body.panel.skin.use).toBe('skin:plain');
  await expect(page.getByLabel('Skin colour accent')).toBeVisible({ timeout: 20_000 });
  await settle(page);
});

test('neon bars: the opening and a knob\'s rect are shown; a knob does not stretch', async ({ page }) => {
  await openDraft(page, 'ui-bars-neon', 'neon-slice');
  await expect(page.locator('.v2-slice-states [data-state]')).toHaveCount(7);
  expect(await shown(page)).toEqual({ border: { left: 8, bottom: 4, right: 8, top: 4 }, opening: { x: 5, y: 5, w: 54, h: 6 } });
  await expect(page.locator('.v2-slice-legend')).toContainText('opening');
  await page.locator('.v2-slice-states [data-state="knob"]').click();
  await expect.poll(async () => shown(page)).toEqual({ rect: { x: 26, y: 1, w: 12, h: 14 } });
  await expect(page.locator('.v2-slice-preview canvas')).toHaveCount(1);
  await expect(page.locator('.v2-slice-previews')).toContainText('does not stretch');
  // writing a slice for a bar says what it drops
  await page.locator('.v2-slice-states [data-state="fill"]').click();
  await expect(page.locator('.v2-slice-lost')).toContainText('opening');
  await settle(page);
});

test('the panel template: no skin, a slice editor all the same, and a skin put on', async ({ page }) => {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.removeItem('loadout-studio-v1'); localStorage.removeItem('loadout-bag'); });
  await page.goto('/index.html#/studio?new', { waitUntil: 'domcontentloaded' });
  watchSounds(page);
  await page.locator('[data-start="v2-panel"]').click();
  await ready(page);
  await expect(page.locator('.v2-slice-skin')).toContainText('no skin');
  expect((await shown(page)).border).toBeTruthy();
  await page.locator('[data-act="use-skin"]').click();
  await expect.poll(async () => (await saved(page)).body.panel.skin?.use).toBe('skin:plain');
  await expect(page.getByLabel('Skin piece')).toHaveValue('skin:plain');
  await settle(page);
});

test('phone width: the slice editor fits, nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDraft(page, 'ui-buttons-wood', 'wood-phone');
  expect(await hasHorizontalScroll(page)).toBe(false);
  const pic = await page.locator('.v2-slice-pic').boundingBox();
  expect(pic.width).toBeLessThanOrEqual(375);
  await drag(page, [8, 2], [12, 2]);
  await expect.poll(async () => (await saved(page)).slice?.normal?.left).toBe(12);
  for (const t of ['All fields', 'Body']) {
    await tab(page, t).click();
    expect(await hasHorizontalScroll(page), t).toBe(false);
  }
  await settle(page);
});

// ---- B19b review round 1 ----

test('the stretched previews follow a drag while it happens, before the press ends', async ({ page }) => {
  await openDraft(page, 'ui-buttons-wood', 'wood-live');
  const preview = () => page.locator('.v2-slice-preview canvas').nth(1);
  const before = (await canvasStats(preview())).hash;
  const a = await at(page, 8, 2), b = await at(page, 20, 2);
  await page.mouse.move(...a);
  await page.mouse.down();
  await page.mouse.move(...b, { steps: 4 });
  // still pressed: nothing is written yet, yet the preview has changed
  await expect.poll(async () => (await canvasStats(preview())).hash).not.toBe(before);
  expect('slice' in (await saved(page))).toBe(false);
  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).slice?.normal?.left).toBe(20);
  await settle(page);
});

test('the piece is picked from the interface pieces: ui.button to ui.slab, what it does not take is said', async ({ page }) => {
  await openDraft(page, 'ui-buttons-wood', 'wood-piece');
  const pick = page.getByLabel('Interface piece', { exact: true });
  await expect(pick).toHaveValue('ui.button');
  await pick.selectOption('ui.slab');
  await expect.poll(async () => (await saved(page)).body.panel.piece.gen).toBe('ui.slab');
  expect((await saved(page)).body.panel.piece.size).toEqual([94, 30]);
  await expect(page.locator('.v2-slice .v2-gen[data-gen="ui.slab@1"]')).toBeVisible();
  await expect(page.locator('.st-say, [role="status"]').filter({ hasText: 'ui.slab' }).first()).toContainText('nails');
  await ready(page);
  await pick.selectOption('ui.trough');
  await expect.poll(async () => (await saved(page)).body.panel.piece.gen).toBe('ui.trough');
  await ready(page);
  await settle(page);
});

test('a draft with mistakes: the editor works in the frame of the picture it shows, at a bounded size', async ({ page }) => {
  await openDraft(page, 'ui-buttons-wood', 'wood-stale');
  await tab(page, 'All fields').click();
  const w = page.locator('.v2-numbers[data-path="size"] input').first();
  await w.fill('5000');
  await w.press('Enter');
  await expect.poll(async () => (await saved(page)).size?.[0]).toBe(5000);
  await tab(page, 'Body').click();
  await expect(page.locator('.v2-slice')).toContainText('last version that drew');
  const pic = page.locator('.v2-slice-pic');
  await expect(pic).toHaveAttribute('data-w', '96');
  expect(Number(await pic.getAttribute('width'))).toBeLessThanOrEqual(2048);
  await expect(page.getByLabel('Slice right')).toHaveValue('8');
  // a line dragged now is measured in that frame
  await drag(page, [8, 2], [12, 2]);
  await expect.poll(async () => (await saved(page)).slice?.normal).toEqual({ left: 12, top: 7, right: 8, bottom: 7 });
  await settle(page);
});

test('a text colour no paint of the sprite has: said, and kept by adding it to the palette', async ({ page }) => {
  await openDraft(page, 'ui-name-plate', 'plate-colour');
  expect((await shown(page)).textArea.colour).toBe('#ffffff');
  const note = page.locator('.v2-slice-colour-lost');
  await expect(note).toContainText('#ffffff');
  await expect(page.getByLabel('Text colour').locator('option:checked')).toContainText('#ffffff');
  await page.locator('[data-act="add-text-colour"]').click();
  await expect.poll(async () => (await saved(page)).palette.at(-1)?.default).toBe('#ffffff');
  const slot = (await saved(page)).palette.at(-1).id;
  await expect(note).toHaveCount(0);
  const x = page.getByLabel('Text area x');
  await x.fill('10');
  await x.press('Enter');
  await expect.poll(async () => (await saved(page)).textArea?.plate?.colour).toBe(slot);
  await expect.poll(async () => (await shown(page)).textArea.colour).toBe('#ffffff');
  await settle(page);
});
