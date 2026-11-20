// The studio's tile editor (build item B19d; docs/data-sprites.md section 6, "Tileset: tile grid painter").
//   - The Body tab of a tileset is the tile editor (All fields keeps the whole tree): a test map painted with the
//     tileset's brushes, each cell's tile picked by the join rules (engine/tile-rules.js) and drawn by the framework.
//   - Groups and their pieces, fills and material edited by their documented types (a number in its range, a word
//     from its list, on/off, a paint from the palette, band rules as rows with colour swatches); a new group added.
//   - A decal placed on its tile by a click and its pixels painted with the stamp painter.
//   - Library tilesets open as copies (tiles-forest side view, tiles-shore top-down) and paint; nothing scrolls sideways
//     at phone width.
// The page is served from STUDIO_BASE_URL (default http://localhost:5199, the shared test server).
import { test, expect, hasHorizontalScroll, canvasStats } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

async function home(page) {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.removeItem('loadout-studio-v1'); localStorage.removeItem('loadout-bag'); });
  await page.goto('/index.html#/studio?new', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.v2.studio-home')).toBeVisible();
}
const drawn = async (loc) => (await canvasStats(loc)).opaque;
/** The tile editor is up and its map drawn. */
async function ready(page) {
  await expect(page.locator('main.studio-v2[data-body="tiles"]')).toBeVisible();
  await expect.poll(() => drawn(page.locator('.studio-v2 .studio-canvas')), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.locator('.v2-tiles .v2-tilemap-canvas')).toBeVisible();
  await expect.poll(() => drawn(page.locator('.v2-tilemap-canvas')), { timeout: 20_000 }).toBeGreaterThan(0);
}
async function template(page) {
  await home(page);
  await page.locator('[data-start="v2-tiles"]').click();
  await ready(page);
}
async function library(page, id) {
  await home(page);
  await page.getByLabel('Find a library sprite').fill(id);
  await page.locator(`[data-library="${id}"]`).click();
  await ready(page);
}
const saved = (page) => page.evaluate(() => {
  const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]);
  return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition;
});
const mapText = (page) => page.locator('.v2-tilemap-canvas').getAttribute('data-map');
const mapTiles = (page) => page.locator('.v2-tilemap-canvas').getAttribute('data-tiles');
/** Click one cell of the test map. */
async function cell(page, c, r) {
  const cv = page.locator('.v2-tilemap-canvas');
  const box = await cv.boundingBox();
  const cols = Number(await cv.getAttribute('data-cols')), rows = Number(await cv.getAttribute('data-rows'));
  await cv.click({ position: { x: ((c + 0.5) / cols) * box.width, y: ((r + 0.5) / rows) * box.height } });
}

test('the tile editor replaces the tree; the map paints and the join rules pick the tiles', async ({ page }) => {
  await template(page);
  await expect(page.locator('.v2-pane')).toContainText('The tileset');
  // the brushes are the join rules' groups and the decals
  await expect(page.locator('.v2-brush[data-brush="block:grass"]')).toBeVisible();
  await expect(page.locator('.v2-brush[data-brush="platform:grass"]')).toBeVisible();
  await expect(page.locator('.v2-brush[data-brush="decal:grass-deco-a"]')).toBeVisible();
  // start from a clear map, paint a 3 x 2 block: its tiles are the corners and edges the rules give
  await page.locator('[data-act="map-clear"]').click();
  await expect.poll(() => mapText(page)).toMatch(/^\.+(\n\.+)+$/);
  await page.locator('.v2-brush[data-brush="block:grass"]').click();
  for (const [c, r] of [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]]) await cell(page, c, r);
  await expect.poll(() => mapText(page)).toContain('.###');
  const tiles = await mapTiles(page);
  for (const want of ['1,1=grass-left', '2,1=grass-top', '3,1=grass-right', '1,2=grass-bottom-l', '2,2=grass-bottom', '3,2=grass-bottom-r']) expect(tiles).toContain(want);
  // the status line says which tile and which rule
  await expect(page.locator('.v2-tilemap-say')).toContainText('grass-bottom-r');
  // rub one out: the neighbours change
  await page.locator('.v2-brush[data-brush=""]').click();
  await cell(page, 3, 1);
  await expect.poll(() => mapTiles(page)).toContain('2,1=grass-right');
  // Look: a cell's tile becomes the clip on the stage
  await page.getByRole('button', { name: 'Look', exact: true }).click();
  await cell(page, 1, 2);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('clip=grass-bottom-l');
  // a decal in a cell its place does not suit is noted
  await page.getByRole('button', { name: 'Paint', exact: true }).click();
  await page.locator('.v2-brush[data-brush="decal:grass-deco-a"]').click();
  await cell(page, 6, 4);
  await expect(page.locator('.v2-tilemap-notes')).toContainText('grass-deco-a at 6,4');
  // All fields still holds the whole tree
  await page.getByRole('tab', { name: 'All fields' }).click();
  await expect(page.locator('.v2-pane .v2-tree').first()).toBeVisible();
  await expect(page.locator('.v2-pane .v2-tilemap')).toHaveCount(0);
});

test('a group\'s pieces, fills and kind by their documented types; a group added', async ({ page }) => {
  await template(page);
  const g = page.locator('.v2-group[data-group="grass"]');
  await expect(g).toBeVisible();
  // fills: a number from 1 to 6; three fills give the material three fill versions
  const fills = g.locator('[data-k="tg-grass-fills"]');
  await expect(fills).toHaveAttribute('min', '1');
  await expect(fills).toHaveAttribute('max', '6');
  await fills.fill('3');
  await fills.press('Enter');
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].fills).toBe(3);
  expect((await saved(page)).body.tiles.groups[0].material.fill.versions.length).toBe(3);
  // pieces: the narrow set off, then the slope set on: the tiles follow and the map gains a slope brush
  await g.locator('[data-piece="narrow"]').uncheck();
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].pieces).toEqual(['block', 'thin']);
  await g.locator('[data-piece="slope"]').check();
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].pieces).toEqual(['block', 'thin', 'slope']);
  await expect(page.locator('.v2-brush[data-brush="slope:grass"]')).toBeVisible();
  await expect(g.locator('.v2-group-tiles [data-clip="grass-slope-up"]')).toBeVisible();
  // a tile of the group picked from its strip is the clip on the stage
  await g.locator('.v2-group-tiles [data-clip="grass-inner-tl"]').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('clip=grass-inner-tl');
  // the use: a word from its list
  await g.locator('[data-k="tg-grass-use"]').selectOption('wall');
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].use).toBe('wall');
  // a new group: a floor
  await page.locator('[data-act="add-group"]').click();
  await page.getByRole('menuitem', { name: /floor/i }).click();
  await expect.poll(async () => (await saved(page)).body.tiles.groups.map((x) => x.kind)).toEqual(['block', 'floor']);
  await expect(page.locator('.v2-group[data-group="floor"]')).toBeVisible();
  await expect(page.locator('.v2-brush[data-brush="floor:floor"]')).toBeVisible();
  await expect(page.locator('.adv-status, .v2-stagenote')).not.toContainText('to fix');
});

test('the material: fill colour, an edge\'s depth, band rules as rows with swatches', async ({ page }) => {
  await template(page);
  const m = page.locator('.v2-group[data-group="grass"] .v2-material');
  await expect(m).toBeVisible();
  // the base colour of the middle: a paint from the palette
  await m.locator('[data-k="tm-grass-base"]').selectOption('soil.dark');
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].material.fill.base).toBe('soil.dark');
  // the top edge's band rules: each a row with its swatch; change one rule's paint and say its rows another way
  const top = m.locator('.v2-edge[data-edge="top"]');
  await expect(top.locator('.v2-band')).toHaveCount(5);
  await expect(top.locator('.v2-band').first().locator('.v2-chip').first()).toBeVisible();
  await top.locator('.v2-band').nth(1).locator('select.v2-paint').selectOption('grass.dark');
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].material.edges.top.bands[1].paint).toBe('grass.dark');
  await top.locator('.v2-band').nth(1).locator('[data-k$="-rows"]').selectOption('last-1');
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].material.edges.top.bands[1].rows).toBe('last-1');
  await top.locator('[data-act="add-band"]').click();
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].material.edges.top.bands.length).toBe(6);
  // the left edge's depth: a number in its range
  const depth = m.locator('.v2-edge[data-edge="left"] [data-k="te-grass-left-depth"]');
  await depth.fill('2');
  await depth.press('Enter');
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].material.edges.left.depth).toBe(2);
  // a bottom edge added
  await m.locator('[data-act="add-edge-bottom"]').click();
  await expect.poll(async () => Object.keys((await saved(page)).body.tiles.groups[0].material.edges)).toContain('bottom');
  // the fill's scatter is edited by its documented arguments
  await expect(m.locator('.v2-gen[data-gen="scatter@1"]')).toBeAttached();
});

test('a decal placed on its tile by a click, its pixels painted', async ({ page }) => {
  await template(page);
  const d = page.locator('.v2-group[data-group="grass"] .v2-decal[data-decal="a"]');
  await d.locator('[data-act="pick-decal"]').click();
  const place = d.locator('.v2-decal-place');
  await expect(place).toBeVisible();
  await expect.poll(() => drawn(place)).toBeGreaterThan(0);
  // the placing picture: the decal's cell over its host tile (above the top); a click puts the stamp's corner there
  const box = await place.boundingBox();
  const cells = Number(await place.getAttribute('data-cells'));
  await place.click({ position: { x: box.width * (4.5 / 32), y: (box.height / cells) * (20.5 / 32) } });
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].decals[0].draw[0].at).toEqual([4, 20]);
  // the stamp painter paints its pixels
  await d.getByRole('button', { name: /Paint the pixels of Pixels/ }).click();
  const grid = d.locator('.v2-painting .v2-stampgrid');
  await expect(grid).toBeVisible();
  const before = (await saved(page)).body.tiles.groups[0].decals[0].draw[0].rows.join('');
  const cell = Number(await grid.getAttribute('data-cell'));
  await grid.click({ position: { x: cell * 0.5, y: cell * 0.5 } });
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].decals[0].draw[0].rows.join('')).not.toBe(before);
  // a new decal
  await page.locator('.v2-group[data-group="grass"] [data-act="add-decal"]').click();
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].decals.map((x) => x.name)).toEqual(['a', 'b']);
  await expect(page.locator('.v2-brush[data-brush="decal:grass-deco-b"]')).toBeVisible();
});

test('library tilesets: tiles-forest (side view) and tiles-shore (top-down) paint as copies', async ({ page }) => {
  await library(page, 'tiles-forest');
  expect((await saved(page)).id).toBe('tiles-forest-copy');
  await expect(page.locator('.v2-group[data-group="grass"] .v2-edge[data-edge="top"]')).toBeVisible();
  await expect(page.locator('.v2-profile[data-profile="dips"] canvas')).toBeVisible();
  await page.locator('[data-act="map-clear"]').click();
  await page.locator('.v2-brush[data-brush="block:grass"]').click();
  for (let c = 0; c < 4; c++) await cell(page, c, 3);
  await page.locator('.v2-brush[data-brush="platform:grass"]').click();
  for (const c of [5, 6]) await cell(page, c, 1);
  await expect.poll(() => mapTiles(page)).toContain('5,1=grass-thin-l');
  expect(await mapTiles(page)).toContain('6,1=grass-thin-r');
  // the profile curve: a click sets one column's value
  const prof = page.locator('.v2-profile[data-profile="dips"] canvas');
  const pb = await prof.boundingBox();
  const before = (await saved(page)).body.tiles.profiles.dips[0];
  await prof.click({ position: { x: 2, y: 2 } });
  await expect.poll(async () => (await saved(page)).body.tiles.profiles.dips[0]).not.toBe(before);
  void pb;

  await library(page, 'tiles-shore');
  expect((await saved(page)).meta.view).toBe('top-down');
  await expect(page.locator('.v2-brush[data-brush="block:water"]')).toBeVisible();
  await expect(page.locator('.v2-brush[data-brush="tile:bridge-h"]')).toBeVisible();
  await page.locator('[data-act="map-clear"]').click();
  await page.locator('.v2-brush[data-brush="block:water"]').click();
  for (const [c, r] of [[1, 1], [2, 1], [1, 2], [2, 2]]) await cell(page, c, r);
  await expect.poll(() => mapTiles(page)).toContain('1,1=water-left');
  // a group drawn by hand (pictures) shows its pictures; its decals are generator calls edited by their arguments
  await page.locator('.v2-group[data-group="water"] .v2-decal[data-decal="a"] [data-act="pick-decal"]').click();
  await expect(page.locator('.v2-group[data-group="water"] .v2-decal[data-decal="a"] .v2-gen[data-gen^="tile.shore@"]')).toBeAttached();
});

test('nothing scrolls sideways at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await template(page);
  expect(await hasHorizontalScroll(page)).toBe(false);
  const box = await page.locator('.v2-tilemap-canvas').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await page.locator('.v2-group[data-group="grass"] .v2-decal[data-decal="a"] [data-act="pick-decal"]').click();
  expect(await hasHorizontalScroll(page)).toBe(false);
  await library(page, 'tiles-forest');
  expect(await hasHorizontalScroll(page)).toBe(false);
  // under the pinned stage there is room for the brushes (one row that scrolls on its own), the tools and the whole map
  const fit = await page.evaluate(() => {
    const st = document.querySelector('.studio-v2 .rx-stage').getBoundingClientRect();
    const b = document.querySelector('.v2-brushes').getBoundingClientRect();
    window.scrollBy(0, b.top - st.bottom - 8);
    const s2 = document.querySelector('.studio-v2 .rx-stage').getBoundingClientRect();
    return { brushesTop: document.querySelector('.v2-brushes').getBoundingClientRect().top, stageBottom: s2.bottom, mapBottom: document.querySelector('.v2-tilemap-canvas').getBoundingClientRect().bottom, h: innerHeight };
  });
  expect(fit.brushesTop).toBeGreaterThanOrEqual(fit.stageBottom);
  expect(fit.mapBottom).toBeLessThanOrEqual(fit.h);
});

// ---- after review (B19d, round 2) ----------------------------------------------------------------------------------

test('the test map follows a group renamed or given another kind', async ({ page }) => {
  await template(page);
  const before = await mapText(page);
  expect(before).toContain('#');
  const name = page.locator('[data-k="tg-grass-name"]');
  await name.fill('moss');
  await name.press('Enter');
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].name).toBe('moss');
  await expect(page.locator('.v2-brush[data-brush="block:moss"]')).toBeVisible();
  await expect.poll(() => mapText(page)).toBe(before);
  expect(await mapTiles(page)).toContain('=moss-top');
  await expect(page.locator('.v2-tilemap-notes')).not.toContainText('nothing called that');
  // painting goes on with the renamed group's brush
  await page.locator('.v2-brush[data-brush="block:moss"]').click();
  await cell(page, 0, 0);
  await expect.poll(() => mapText(page)).toMatch(/^#/);
  // another kind: its cells take the group's liquid brush
  await page.locator('[data-k="tg-moss-kind"]').selectOption('liquid');
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].kind).toBe('liquid');
  await expect(page.locator('.v2-brush[data-brush="liquid:moss"]')).toBeVisible();
  await expect.poll(() => mapText(page)).toContain('~');
  expect(await mapText(page)).not.toContain('?');
  await expect(page.locator('.v2-tilemap-notes')).not.toContainText('nothing called that');
});

test('a decal drawn below its group is placed by a click in the lower cell', async ({ page }) => {
  await template(page);
  const d = page.locator('.v2-group[data-group="grass"] .v2-decal[data-decal="a"]');
  await d.locator('[data-act="pick-decal"]').click();
  await d.locator('[data-k="td-grass-a-place"]').selectOption('below');
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].decals[0].place).toBe('below');
  const place = d.locator('.v2-decal-place');
  await expect(place).toHaveAttribute('data-cells', '2');
  await expect.poll(() => drawn(place)).toBeGreaterThan(0);
  const box = await place.boundingBox();
  // the decal's cell is the lower one: pixel 6, 9 of it
  await place.click({ position: { x: box.width * (6.5 / 32), y: (box.height / 2) * ((32 + 9.5) / 32) } });
  await expect.poll(async () => (await saved(page)).body.tiles.groups[0].decals[0].draw[0].at).toEqual([6, 9]);
});

test('a profile\'s curve reaches past its numbers with a wider scale', async ({ page }) => {
  await template(page);
  await page.locator('[data-act="add-profile"]').click();
  await expect.poll(async () => Object.keys((await saved(page)).body.tiles.profiles ?? {})).toContain('profile');
  const row = page.locator('.v2-profile[data-profile="profile"]');
  const scale = row.locator('[data-k="tp-profile-scale"]');
  await expect(scale).toHaveValue('0,3');
  await scale.selectOption('-64,64');
  const cv = row.locator('canvas');
  const box = await cv.boundingBox();
  await cv.click({ position: { x: 1, y: 1 } });
  await expect.poll(async () => (await saved(page)).body.tiles.profiles.profile[0]).toBeGreaterThan(60);
  await cv.click({ position: { x: box.width - 1, y: box.height - 1 } });
  await expect.poll(async () => (await saved(page)).body.tiles.profiles.profile.at(-1)).toBeLessThan(-60);
  expect((await saved(page)).body.tiles.profiles.profile.length).toBe(32);
});
