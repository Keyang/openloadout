// The handles on the version 2 editor's picture (app/studio/v2-handles.js, v2-handles-ui.js): a copy of the knight opened
// in the studio; the anchor dragged on the picture, nudged with the arrow keys and snapped to the feet; a foot's IK handle
// dragged in a frame of a clip (the clip, the base's, becomes keys of the sprite's own); undo; the bones drawn over the
// picture and shown or hidden; desktop and phone width.
// A scratch copy of the tree is built and served on its own port (never the real folder). Screenshots go to
// HANDLES_SHOTS (default: the system temp folder). Run: npx playwright test tests/e2e/studio-v2-handles.spec.mjs
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { test, expect, hasHorizontalScroll } from '../helpers/test.mjs';
import { ROOT } from '../helpers/catalog.mjs';

let scratch = null, server = null, BASE = null;
const SHOTS = process.env.HANDLES_SHOTS || os.tmpdir();
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(900_000);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-handles-'));
  const tree = path.join(scratch, 'tree');
  fs.mkdirSync(tree);
  const r = spawnSync('rsync', ['-a', '--exclude', '.git', '--exclude', 'node_modules', '--exclude', 'generated', '--exclude', 'out', `${ROOT}/`, `${tree}/`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`rsync failed: ${r.stderr}`);
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tree, 'node_modules'), 'dir');
  const built = spawnSync(process.execPath, ['tools/build.mjs', '--skip-quality', '--no-meaning', '--skip-vendor'], { cwd: tree, encoding: 'utf8', timeout: 840_000 });
  if (built.status !== 0) throw new Error(`the build of the copy failed:\n${built.stdout}${built.stderr}`);
  const port = await freePort();
  server = spawn(process.execPath, ['tools/serve.mjs', '--port', String(port)], { cwd: tree, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`the server stopped (${code})`)));
    server.stdout.on('data', (d) => { if (String(d).includes('Loadout is at')) resolve(); });
  });
  BASE = `http://localhost:${port}`;
});
test.afterAll(() => {
  if (server) server.kill();
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

async function openKnight(page) {
  await page.goto(`${BASE}/index.html#/studio`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.removeItem('loadout-studio-v1'); localStorage.removeItem('loadout-bag'); });
  await page.goto(`${BASE}/index.html#/studio?new`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.v2.studio-home')).toBeVisible();
  await page.getByLabel('Find a library sprite').fill('knight');
  await page.locator('[data-library="knight"]').click();
  await expect(page.locator('main.studio-v2[data-body="rig"]')).toBeVisible();
  await expect(page.locator('.v2-handlebar')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.v2-handlebar [data-k="handle-pick"] option')).not.toHaveCount(1, { timeout: 30_000 });
}
const saved = () => `(() => { const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]); return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition; })()`;
const def = (page) => page.evaluate(saved());
/** Where a point of the frame is on the page (the stage draws the frame centred at a whole zoom); a pixel's middle with half = 0.5. */
async function stagePoint(page, x, y, half = 0) {
  const box = await page.locator('.studio-v2 .studio-canvas').boundingBox();
  const z = Number((await page.locator('.st-zoom').textContent()).replace(/[^0-9]/g, ''));
  const [W, H] = (await def(page)).size;
  const ox = Math.floor((Math.floor(box.width) - W * z) / 2), oy = Math.floor((Math.floor(box.height) - H * z) / 2);
  return { x: box.x + ox + (x + half) * z, y: box.y + oy + (y + half) * z, z };
}
async function drag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 3 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 3 });
  await page.mouse.up();
}
const readout = async (page) => {
  const t = await page.locator('.v2-hread').textContent();
  const m = /: (-?\d+), (-?\d+)$/.exec(t);
  return m ? [Number(m[1]), Number(m[2])] : null;
};
const pickHandle = async (page, id) => { await page.locator('[data-k="handle-pick"]').selectOption(id); await expect.poll(() => readout(page)).not.toBeNull(); };

test('the anchor is dragged on the picture, nudged with the arrow keys, snapped to the feet, and undone', async ({ page }) => {
  await openKnight(page);
  const start = (await def(page)).pivot;
  const at = await stagePoint(page, start[0], start[1], 0.5);
  await drag(page, at, 3 * at.z, -2 * at.z);
  await expect.poll(async () => (await def(page)).pivot).toEqual([start[0] + 3, start[1] - 2]);
  await page.locator('[data-act="undo"]').click();
  await expect.poll(async () => (await def(page)).pivot).toEqual(start);
  // Tab walks to the anchor, an arrow nudges it by a pixel, Shift+arrow by four; Escape lets go
  await page.locator('.studio-v2 .studio-canvas').focus();
  await page.keyboard.press('Escape');          // the press that dragged it left it in hand
  await page.keyboard.press('Tab');
  await expect(page.locator('.v2-hread')).toContainText('Anchor');
  await page.keyboard.press('Tab');
  await expect(page.locator('.v2-hread')).toContainText('Lift');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.v2-hread')).toContainText('Anchor');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await def(page)).pivot).toEqual([start[0] + 1, start[1]]);
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await def(page)).pivot).toEqual([start[0] + 1, start[1] - 4]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.v2-hread')).toContainText('Drag the anchor');
  await page.locator('[data-act="snap-feet"]').click();
  await expect.poll(async () => (await def(page)).pivot).toEqual(start);
});

test('a foot dragged in a frame of a clip sets that frame\'s IK key; undo gives the clip back to its base; bones can be hidden', async ({ page }) => {
  await openKnight(page);
  await page.getByRole('tab', { name: 'Clips' }).click();
  await page.locator('.chip[data-clip="walk"]').click();
  await page.locator('.timeline .frame[data-frame="2"]').click();
  await pickHandle(page, 'ik:legF');
  const foot = await readout(page);
  const at = await stagePoint(page, foot[0], foot[1]);
  expect((await def(page)).clips.walk.keys).toBeUndefined();
  await page.screenshot({ path: path.join(SHOTS, 'handles-desktop-clips.png') });
  await drag(page, at, 4 * at.z, -3 * at.z);
  await expect.poll(async () => (await def(page)).clips.walk.keys?.length ?? 0).toBeGreaterThanOrEqual(8);
  const d = await def(page);
  expect(d.clips.walk.from).toBeUndefined();
  const key = d.clips.walk.keys.find((k) => Math.abs(k.t - 0.25) < 0.001);
  expect(key.ik.legF.every(Number.isInteger)).toBe(true);
  // the foot lands where it was dragged, to a pixel (an IK target is whole pixels from where the leg rests)
  await expect.poll(async () => { const n = await readout(page); return Math.max(Math.abs(n[0] - foot[0] - 4), Math.abs(n[1] - foot[1] + 3)); }).toBeLessThanOrEqual(1);
  await page.screenshot({ path: path.join(SHOTS, 'handles-desktop-dragged.png') });
  await page.locator('[data-act="undo"]').click();
  await expect.poll(async () => (await def(page)).clips.walk.keys).toBeUndefined();
  expect((await def(page)).clips.walk.from).toBeDefined();
  // a bone tip: its key for the frame turns it
  await pickHandle(page, 'bone:armF');
  await page.locator('[data-act="handle-right"]').click();
  await expect.poll(async () => (await def(page)).clips.walk.keys?.length ?? 0).toBeGreaterThan(0);
  // hiding the bones leaves only the anchor
  await page.locator('[data-k="show-bones"]').uncheck();
  await page.screenshot({ path: path.join(SHOTS, 'handles-desktop-nobones.png') });
});

test('the Body tab edits the rest pose; phone width keeps the handles and does not scroll sideways', async ({ page }) => {
  await openKnight(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.v2-handlebar')).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.locator('.v2-handlebar').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, 'handles-phone-body.png') });
  await page.getByRole('tab', { name: 'Clips' }).click();
  await pickHandle(page, 'ik:legB');
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.screenshot({ path: path.join(SHOTS, 'handles-phone-clips.png') });
});
