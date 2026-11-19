// The playground reads a bag the way a person would (architecture.md, Contract 9):
//   - it opens in the view the bag's ground tiles were drawn for, else the view most of its things were drawn for,
//     and offers "Side view" / "Top-down" when the bag has things for both;
//   - nothing drawn for one view is ever placed in the other view's scene: it is listed under the scene instead;
//   - nothing in the side-view level is cut by the top of the picture;
//   - the interface pieces of a large bag stay in one row, so the scene stays on the first screen.
// Everything here is derived from the catalogue (generated/catalog.json): a new kit or a new asset needs no change.
import fs from 'node:fs';
import { test, expect, openRoute, hasHorizontalScroll } from '../helpers/test.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../../generated/catalog.json', import.meta.url), 'utf8'));
const rowOf = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
// every bundle in the catalogue: the three kits are the large ones, and a new bundle is picked up by itself
const kits = catalog.bundles;
const DRAWN_FOR = { side: 'side', top: 'top-down' }, OTHER = { side: 'top', top: 'side' }, NAME = { side: 'Side view', top: 'Top-down' };
const fits = (id, mode) => rowOf[id].view !== DRAWN_FOR[OTHER[mode]];
const isInterface = (a) => a.type === 'ui' || a.type === 'icon' || (a.role ?? '').startsWith('interface/') || a.role === 'items/icon';
const isTiles = (a) => a.type === 'tileset' || a.role === 'world/tile';

const item = (id) => {
  const kind = rowOf[id].kind;
  return { kind, id, settings: kind === 'sprite' ? { params: {}, cues: null, scale: 1 } : kind === 'sound' ? { params: {}, style: null, seed: 1 } : { params: {}, style: null } };
};
const wholeKit = (kit) => [...kit.sprites, ...(kit.sounds ?? []), ...(kit.music ?? [])].filter((id) => rowOf[id]).map(item);
const spritesOf = (items) => items.filter((it) => it.kind === 'sprite').map((it) => it.id);
/** The sprites of a bag that are part of the picture of the scene and were drawn for the other view. */
const leftOutOf = (items, mode) => spritesOf(items).filter((id) => !isInterface(rowOf[id]) && !fits(id, mode));

async function openPlay(page, items) {
  await openRoute(page, '/');
  await page.evaluate(async (list) => { const { bag } = await import('/app/bag.js'); bag.clear(); for (const it of list) bag.add(it); }, items);
  await page.goto('/index.html#/play');
  await ready(page);
}
const ready = (page) => page.waitForFunction(() => document.querySelector('main.play-page') && window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 60_000 });
const state = (page) => page.evaluate(() => window.__loadoutPlay.state());
const viewSwitch = (page) => page.locator('.play-view');
const leftOut = (page) => page.locator('.play-left-out');
/** Switch the view with the buttons under the scene, and wait for the scene to be rebuilt in it. */
async function switchTo(page, mode) {
  await viewSwitch(page).getByRole('button', { name: NAME[mode], exact: true }).click();
  await expect.poll(async () => (await state(page)).mode).toBe(mode);
  await ready(page);
}

/** Everything the page must get right for one bag in the view it is showing. */
async function checkScene(page, items, mode) {
  const s = await state(page);
  expect(s.mode).toBe(mode);
  // nothing in the scene was drawn for the other view: the player, every thing, the ground, the background
  const inScene = [...(s.player ? [s.player.id] : []), ...s.things.map((t) => t.id)];
  expect(inScene.length).toBeGreaterThan(0);
  for (const id of new Set(inScene)) expect(fits(id, mode), `${rowOf[id].name} (drawn for ${rowOf[id].view}) is in a ${NAME[mode]} scene`).toBe(true);
  expect(s.map.startsWith(`@ view = ${DRAWN_FOR[mode]}\n`)).toBe(true);
  const tilesetsUsed = (s.map.match(/@ tilesets = (.*)/)?.[1] ?? '').split(', ').filter(Boolean);
  for (const id of tilesetsUsed) expect(fits(id, mode), `the ground uses ${id}`).toBe(true);
  // what was left out is listed under the scene by name, with the reason and the way to see it
  const out = leftOutOf(items, mode);
  if (out.length) {
    const box = leftOut(page);
    await expect(box).toBeVisible();
    for (const id of out) await expect(box).toContainText(rowOf[id].name);
    await expect(box).toContainText(mode === 'top' ? 'drawn to be seen from the side' : 'drawn to be seen from above');
    await expect(box).toContainText(`Switch to ${NAME[OTHER[mode]]}`);
    await expect(box.getByRole('button', { name: `Switch to ${NAME[OTHER[mode]]}` })).toBeVisible();
    // and none of them has a row in the list of what is in the scene
    const rows = await page.locator('.play-things li .play-name').allTextContents();
    for (const id of out) expect(rows.map((r) => r.replace(/your version$/, '').trim())).not.toContain(rowOf[id].name);
    // the scene sits above the list: "under the scene"
    expect((await box.boundingBox()).y).toBeGreaterThan((await page.locator('canvas.play-stage').boundingBox()).y);
  } else await expect(leftOut(page)).toHaveCount(0);
  // every sprite in the bag is either in the page's list or in the left-out list: nothing vanishes without a word
  const listed = await page.locator('.play-things li .play-name').count();
  expect(listed + out.length).toBe(spritesOf(items).length);
  return s;
}

for (const kit of kits) {
  test(`${kit.name}, added whole: it opens in the view of its ground, nothing is in the wrong scene, and the view can be switched and switched back`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const items = wholeKit(kit);
    await openPlay(page, items);
    const ids = spritesOf(items);
    const tileViews = new Set(ids.filter((id) => isTiles(rowOf[id])).map((id) => rowOf[id].view).filter((v) => Object.values(DRAWN_FOR).includes(v)));
    const has = { side: ids.some((id) => !isInterface(rowOf[id]) && rowOf[id].view === 'side'), top: ids.some((id) => !isInterface(rowOf[id]) && rowOf[id].view === 'top-down') };
    const first = (await state(page)).mode;
    if (tileViews.size === 1) expect(first, 'the view of the ground tiles').toBe(tileViews.has('top-down') ? 'top' : 'side');
    const before = await checkScene(page, items, first);
    const playable = (mode) => ids.some((id) => rowOf[id].role === 'characters/player' && fits(id, mode));
    expect(!!before.player, 'there is a character to play as when the bundle has one for this view').toBe(playable(first));
    // the choice is shown
    await expect(viewSwitch(page)).toContainText('View');
    await expect(viewSwitch(page)).toContainText(NAME[first]);
    if (has.side && has.top) {
      await expect(viewSwitch(page).getByRole('button', { name: NAME[first], exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(viewSwitch(page).getByRole('button', { name: NAME[OTHER[first]], exact: true })).toHaveAttribute('aria-pressed', 'false');
      await switchTo(page, OTHER[first]);
      await checkScene(page, items, OTHER[first]);
      await expect(viewSwitch(page).getByRole('button', { name: NAME[OTHER[first]], exact: true })).toHaveAttribute('aria-pressed', 'true');
      // and back, with the button in the list of what was left out: the same scene as at first
      await leftOut(page).getByRole('button', { name: `Switch to ${NAME[first]}` }).click();
      await expect.poll(async () => (await state(page)).mode).toBe(first);
      await ready(page);
      const after = await checkScene(page, items, first);
      expect(after.player?.id).toBe(before.player?.id);
      expect(after.things.map((t) => t.id).sort()).toEqual(before.things.map((t) => t.id).sort());
      expect(after.map).toBe(before.map);
    } else {
      // things for one view only: nothing to switch, and nothing left out
      await expect(viewSwitch(page).getByRole('button')).toHaveCount(0);
      await expect(leftOut(page)).toHaveCount(0);
    }
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
}

// ---- a small mixed bag: two characters for each view, a thing and a ground for one of them --------------------

const firstWhere = (test_, n = 1) => catalog.assets.filter((a) => a.kind === 'sprite' && test_(a)).slice(0, n).map((a) => a.id);
const sidePlayers = firstWhere((a) => a.role === 'characters/player' && a.view === 'side', 2);
const topPlayers = firstWhere((a) => a.role === 'characters/player' && a.view === 'top-down', 2);
const topProp = firstWhere((a) => a.role === 'world/prop' && a.view === 'top-down');
const topTiles = firstWhere((a) => isTiles(a) && a.view === 'top-down');
const sideCreature = firstWhere((a) => a.role === 'characters/enemy' && a.view === 'side');
const anyPickup = firstWhere((a) => a.type === 'pickup' && a.view !== 'side' && a.view !== 'top-down');
const mixedReady = sidePlayers.length === 2 && topPlayers.length === 2 && topProp.length && topTiles.length && sideCreature.length && anyPickup.length;

test('a small mixed bag: the ground decides the view, the other view\'s things are listed, and each view remembers who was picked', async ({ page }) => {
  test.skip(!mixedReady, 'the catalogue does not have two characters for each view, a top-down prop and ground, a side-view creature and a pickup');
  // the side-view things come first and there are as many of them: the top-down ground still decides
  const ids = [...sidePlayers, ...sideCreature, ...anyPickup, ...topPlayers, ...topProp, ...topTiles];
  const items = ids.map(item);
  await openPlay(page, items);
  let s = await checkScene(page, items, 'top');
  expect(s.player.id).toBe(topPlayers[0]);
  await expect(leftOut(page)).toContainText('The ground tiles in your bag are drawn from above, so the scene opened top-down.');
  // something that fits both views is in both scenes
  expect(s.things.some((t) => t.id === anyPickup[0])).toBe(true);
  // pick the second top-down character
  const playAs = page.getByRole('group', { name: 'Play as' });
  await expect(playAs.getByRole('button')).toHaveText(topPlayers.map((id) => rowOf[id].name));
  await playAs.getByRole('button', { name: rowOf[topPlayers[1]].name, exact: true }).click();
  await expect.poll(async () => (await state(page)).player.id).toBe(topPlayers[1]);
  // to side view: only side-view characters are offered; pick the second
  await switchTo(page, 'side');
  s = await checkScene(page, items, 'side');
  expect(s.player.id).toBe(sidePlayers[0]);
  expect(s.things.some((t) => t.id === anyPickup[0])).toBe(true);
  await expect(leftOut(page)).toContainText('You switched to side view.');
  await expect(page.getByRole('group', { name: 'Play as' }).getByRole('button')).toHaveText(sidePlayers.map((id) => rowOf[id].name));
  await page.getByRole('group', { name: 'Play as' }).getByRole('button', { name: rowOf[sidePlayers[1]].name, exact: true }).click();
  await expect.poll(async () => (await state(page)).player.id).toBe(sidePlayers[1]);
  // back and forth: each view still has the character that was picked in it
  await switchTo(page, 'top');
  expect((await checkScene(page, items, 'top')).player.id).toBe(topPlayers[1]);
  await switchTo(page, 'side');
  expect((await checkScene(page, items, 'side')).player.id).toBe(sidePlayers[1]);
  // the keys still move the character after all that
  const x0 = (await state(page)).player.x;
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(x0 + 3);
  await page.keyboard.up('ArrowRight');
});

test('a bag with things for one view only has nothing to switch and nothing left out', async ({ page }) => {
  test.skip(!sidePlayers.length || !anyPickup.length, 'no side-view character or pickup in the catalogue');
  const items = [sidePlayers[0], anyPickup[0]].map(item);
  await openPlay(page, items);
  await checkScene(page, items, 'side');
  await expect(viewSwitch(page)).toContainText('Side view');
  await expect(viewSwitch(page).getByRole('button')).toHaveCount(0);
});

// ---- the side-view level: nothing hangs from the top of the picture ----------------------------------------------

test('side view at rest: the top rows of the picture hold no ground, so nothing hangs from its top edge', async ({ page }) => {
  test.skip(!sidePlayers.length, 'no side-view character in the catalogue');
  await openPlay(page, [item(sidePlayers[0])]);
  const s = await state(page);
  expect(s.mode).toBe('side');
  // with no tiles and no background the playground paints the sky and the ground itself: sample the canvas along
  // its top edge and a little below it, across the whole width, and expect no ground colour there
  const colours = await page.locator('canvas.play-stage').evaluate((cv, zoom) => {
    const g = cv.getContext('2d'), seen = new Set();
    for (const y of [0, 2 * zoom, 5 * zoom, 9 * zoom]) {
      const d = g.getImageData(0, y, cv.width, 1).data;
      for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    }
    const ground = g.getImageData(4, cv.height - 3, 1, 1).data;
    return { seen: [...seen], ground: `${ground[0]},${ground[1]},${ground[2]}` };
  }, s.zoom);
  expect(colours.seen).not.toContain(colours.ground);
  // the level itself says the same: its first rows are empty down to the row the view rests on
  const rows = s.map.split('\n').filter((l) => l && !l.startsWith('@'));
  expect(rows.length).toBeGreaterThan(5);
  for (const row of rows.slice(0, 3)) expect(row.replace(/\./g, '')).toBe('');
});

// ---- the ground the playground paints itself: nothing hangs under a floating block ---------------------------------

test('side view with no ground tiles in the bag: nothing hangs under a floating block, not even a line at its corners', async ({ page }) => {
  test.skip(!sidePlayers.length, 'no side-view character in the catalogue');
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPlay(page, [item(sidePlayers[0])]);
  let s = await state(page);
  expect(s.mode).toBe('side');
  expect(s.map, 'the bag has no tiles, so the playground paints the ground itself').not.toContain('@ tilesets');
  const T = 32, rows = s.map.split('\n').filter((l) => l && !l.startsWith('@'));
  const solid = (c, r) => r >= 0 && r < rows.length && rows[r][c] === '#';
  // every block with nothing above it and nothing under it, taken from the map of the level
  const floating = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (solid(c, r) && !solid(c, r - 1) && !solid(c, r + 1) && r + 1 < rows.length) floating.push({ c, r }); }));
  expect(floating.length, 'the level has blocks one tile high that float').toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause' }).click();
  let checked = 0;
  // the steps along the level are measured from where the player starts, so they do not depend on reading the
  // player back while it is being moved
  const startX = s.player.x, step = s.view.w * 0.8;
  // look at them from where the player starts, then from further along, so each one is on the screen once
  for (let stop = 0; stop < 12 && checked < floating.length; stop++) {
    if (stop) await page.evaluate(({ x, y }) => window.__loadoutPlay.put(x, y), { x: Math.min(s.width - 40, startX + stop * step), y: 64 });
    await page.waitForTimeout(250);
    s = await state(page);
    const seen = floating.filter((b) => !b.done && b.c * T - 2 >= s.cam.x && (b.c + 1) * T + 2 <= s.cam.x + s.view.w && b.r * T >= s.cam.y && (b.r + 1) * T + 10 <= s.cam.y + s.view.h);
    if (!seen.length) continue;
    const found = await page.locator('canvas.play-stage').evaluate((cv, { blocks, cam, zoom, T: tile }) => {
      const g = cv.getContext('2d');
      const colours = (x, y, w, h) => { const d = g.getImageData(Math.round(x * zoom), Math.round(y * zoom), Math.round(w * zoom), Math.round(h * zoom)).data, set = new Set(); for (let i = 0; i < d.length; i += 4) set.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); return set; };
      return blocks.map((b) => {
        const x = b.c * tile - cam.x, y = b.r * tile - cam.y;
        const ground = colours(x, y, tile, tile);                       // the colours of the block itself: its dirt, its grass and their darker lines
        const under = colours(x - 2, y + tile, tile + 4, 10);           // the ten pixels of sky right under it, a little wider than the block
        return { ...b, ground: ground.size, hanging: [...under].filter((k) => ground.has(k)) };
      });
    }, { blocks: seen, cam: s.cam, zoom: s.zoom, T });
    for (const b of found) {
      expect(b.ground, 'the block is painted, in a few colours').toBeGreaterThanOrEqual(3);
      expect(b.hanging, `under the block at column ${b.c}, row ${b.r}: ground colours where the sky should be`).toEqual([]);
      floating.find((f) => f.c === b.c && f.r === b.r).done = true;
      checked++;
    }
  }
  expect(checked, 'every floating block was looked at').toBe(floating.length);
});

test('side view: the hero can run from the start to the cliff that ends the level, jumping what stands in the way', async ({ page }) => {
  test.skip(!sidePlayers.length, 'no side-view character in the catalogue');
  await openPlay(page, [item(sidePlayers[0])]);
  const s = await state(page);
  const rows = s.map.split('\n').filter((l) => l && !l.startsWith('@'));
  // the cliff: the columns at the far end that are rock from the top of the scene's ground rows up to its highest block
  const highest = rows.findIndex((row) => row.replace(/\./g, '') !== '');
  let cliff = rows[0].length;
  while (cliff > 0 && rows[highest][cliff - 1] !== '.') cliff--;
  expect(cliff).toBeGreaterThan(rows[0].length / 2);
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  let last = -1, stuck = 0, jumps = 0;
  for (let i = 0; i < 160 && stuck < 6; i++) {
    const p = (await state(page)).player;
    if (Math.abs(p.x - last) < 1) { stuck++; jumps++; await page.keyboard.press('Space'); } else stuck = 0;
    last = p.x;
    await page.waitForTimeout(200);
  }
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  const end = (await state(page)).player;
  expect(end.x, 'it reached the foot of the cliff').toBeGreaterThan((cliff - 1) * 32);
  expect(end.x, 'and the cliff is the end').toBeLessThan(cliff * 32);
  expect(end.hp).toBeGreaterThan(0);
});

// ---- a large bag: the interface pieces stay in one row --------------------------------------------------------

const everything = [...new Map(kits.flatMap(wholeKit).map((it) => [it.id, it])).values()];
const pieceCount = everything.filter((it) => it.kind === 'sprite' && isInterface(rowOf[it.id])).length;
const noPieces = everything.filter((it) => !(it.kind === 'sprite' && isInterface(rowOf[it.id])));
const ONE_ROW = 120;                // the tallest interface piece is drawn 96 px high: a row of them, its scroll bar, and the gap under it

for (const size of [{ width: 1280, height: 800 }, { width: 375, height: 740 }]) {
  test(`every kit together at ${size.width} x ${size.height}: the interface pieces are one row that scrolls, and the scene stays on the first screen`, async ({ page }) => {
    test.skip(kits.length < 2 || pieceCount < 8, 'not enough kits or interface pieces to make a large bag');
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    // where the scene is on the page (not on the screen: a click may scroll the page)
    const stageBox = () => page.locator('canvas.play-stage').evaluate((cv) => ({ y: cv.getBoundingClientRect().top + window.scrollY, h: cv.getBoundingClientRect().height }));
    // the same bag without its interface pieces: where the scene sits when the band is at its smallest
    await openPlay(page, noPieces);
    const bare = await stageBox();
    await openPlay(page, everything);
    const s = await state(page);
    expect(s.plan.display.length).toBe(pieceCount);
    const strip = page.locator('.play-pieces');
    await expect(strip.locator('.play-piece')).toHaveCount(pieceCount);
    const full = await stageBox();
    // the band of pieces adds one row at most, however many pieces there are
    expect(full.y - bare.y).toBeLessThanOrEqual(ONE_ROW);
    expect(full.y, 'the top of the scene is on the first screen').toBeLessThan(size.height - 120);
    test.info().annotations.push({ type: 'measured', description: `the scene starts at ${Math.round(bare.y)} px without interface pieces and at ${Math.round(full.y)} px with ${pieceCount}; it is ${Math.round(full.h)} px high` });
    const m = await strip.evaluate((n) => ({ h: n.getBoundingClientRect().height, w: n.clientWidth, sw: n.scrollWidth, right: n.getBoundingClientRect().right, tops: [...n.querySelectorAll('.play-piece')].map((p) => Math.round(p.getBoundingClientRect().top + p.getBoundingClientRect().height / 2)) }));
    expect(m.h).toBeLessThanOrEqual(ONE_ROW);
    expect(m.sw, 'the row scrolls sideways inside itself').toBeGreaterThan(m.w);
    expect(Math.max(...m.tops) - Math.min(...m.tops), 'every piece is on the same line').toBeLessThanOrEqual(2);
    expect(m.right).toBeLessThanOrEqual(size.width);
    expect(await hasHorizontalScroll(page)).toBe(false);
    // the row can be scrolled with the keyboard, and says what it is
    await expect(strip).toHaveAttribute('tabindex', '0');
    await expect(page.getByRole('group', { name: 'Interface pieces from your bag' })).toBeVisible();
    // "Show all" folds the row open so every piece can be looked at; "Show one row" folds it away again
    const more = page.locator('.play-pieces-more');
    await expect(more).toHaveText(`Show all ${pieceCount}`);
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(more).toHaveText('Show one row');
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    const open = await strip.evaluate((n) => ({ w: n.clientWidth, sw: n.scrollWidth, widest: Math.max(...[...n.querySelectorAll('*')].map((p) => p.getBoundingClientRect().right)) }));
    expect(open.sw).toBeLessThanOrEqual(open.w + 1);
    expect(open.widest).toBeLessThanOrEqual(size.width);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    expect((await stageBox()).y).toBe(full.y);
    // the scene is still a scene: the view offered, a character that moves
    await expect(viewSwitch(page).getByRole('button')).toHaveCount(2);
    const before = (await state(page)).player;
    expect(before).toBeTruthy();
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(before.x + 3);
    await page.keyboard.up('ArrowRight');
  });
}

test('a few interface pieces that fit in the row: no button to show more', async ({ page }) => {
  const piece = catalog.assets.find((a) => a.kind === 'sprite' && isInterface(a) && a.tech.clips.length <= 5);
  test.skip(!piece || !sidePlayers.length, 'no small interface piece or side-view character in the catalogue');
  await openPlay(page, [sidePlayers[0], piece.id].map(item));
  await expect(page.locator('.play-pieces .play-piece')).toHaveCount(1);
  await expect(page.locator('.play-pieces-more')).toBeHidden();
});
