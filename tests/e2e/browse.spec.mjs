// The library, #/browse (docs/site-design.md, section 5): the site starts from the catalogue, cards cost nothing
// until looked at, and the library searches, filters, sorts and lists everything, as cards or as rows.
// (The front page is the landing page now: its own tests are tests/e2e/smoke-home.spec.mjs.)
// Run with: npx playwright test tests/e2e/browse.spec.mjs
//
// The catalogue grows every day, so nothing here depends on how many assets there are or on their order:
//   - tests about ranking ("money" puts the coin first) use the 490-entry stand-in catalogue, a known set;
//   - tests on the live catalogue pick their assets from generated/catalog.json (PICK below), work out every
//     expected number from that file, and bring a card on screen (place) before touching it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test as plain } from '@playwright/test';
import { test, expect, openRoute, waitForDrawn, canvasStats, hasHorizontalScroll, quietNetwork } from '../helpers/test.mjs';
import { labelFor } from '../../catalog/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GENERATED = path.join(ROOT, 'generated');
const STAND_IN_SRC = path.join(ROOT, 'tests', 'fixtures', 'search', 'catalog.json');
const STAND_IN_DIR = path.join(ROOT, 'tests', 'fixtures', 'browse');
const STAND_IN = 'tests/fixtures/browse/catalog.json';
let CATALOG = null, BIG = null, SMART_MB = 0, PICK = null, VERSIONS = null;

/**
 * The assets and filter values the tests use, chosen from the catalogue as it is today. Where there is a
 * choice the last one in the catalogue is taken, so a test never passes only because its asset is near the top.
 */
function choose({ assets }) {
  const of = (kind) => assets.filter((a) => a.kind === kind);
  const sprites = of('sprite'), sounds = of('sound'), music = of('music');
  const tally = (list, values) => { const n = {}; for (const a of list) for (const v of values(a)) n[v] = (n[v] || 0) + 1; return Object.entries(n).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)); };
  const word = (a) => a.words.find((w) => /^[a-z]{4,}$/.test(w));          // a plain word people would type to find it
  const hasView = (a) => a.view && a.view !== 'none';
  const views = tally(sprites.filter(hasView), (a) => [a.view]);
  const view = views[0][0], otherView = views.length > 1 ? views.at(-1)[0] : null;
  const animated = sprites.filter((a) => a.thumb && a.strip && a.stripFrames > 1 && Math.max(...a.tech.frame) <= 64 && word(a));
  const sprite = animated.at(-1);
  const viewSprite = animated.filter((a) => a.view === view).at(-1);
  const sound = sounds.filter((a) => a.thumb && word(a)).at(-1);
  const longSound = [...sounds].sort((a, b) => b.tech.seconds - a.tech.seconds)[0];
  const soundTypes = tally(sounds, (a) => [a.type]);
  const gameTypes = tally(assets, (a) => a.gameTypes);
  const tops = tally(assets, (a) => [a.role.split('/')[0]]).map(([top]) => top);
  const kindsIn = (top) => new Set(assets.filter((a) => a.role.startsWith(top + '/')).map((a) => a.kind));
  const branch = tops.find((top) => kindsIn(top).has('sprite') && kindsIn(top).has('sound')) ?? tops[0];
  const leaf = tally(assets.filter((a) => a.role.startsWith(branch + '/')), (a) => [a.role])[0][0];
  return {
    sprite, viewSprite, sound, longSound, track: music.at(-1), word,
    view, otherView, viewLabel: labelFor('view', view), otherViewLabel: otherView && labelFor('view', otherView),
    soundType: soundTypes.at(-1)[0], soundTypeLabel: labelFor('type', soundTypes.at(-1)[0]),
    spriteTypeLabels: [...new Set(sprites.map((a) => labelFor('type', a.type)))], soundTypeLabels: [...new Set(sounds.map((a) => labelFor('type', a.type)))],
    gameType: gameTypes.at(-1)[0], gameTypeLabel: labelFor('gameType', gameTypes.at(-1)[0]),
    theme: sprite.themes[0], themeLabel: labelFor('themes', sprite.themes[0]),
    branch, branchLabel: labelFor('role', branch), leaf, leafLabel: labelFor('role', leaf), branchKinds: [...kindsIn(branch)].sort(),
  };
}

/** Write a file in one step, so two test workers preparing it at once never read half of it. */
function writeOnce(file, make) {
  if (fs.existsSync(file) && fs.statSync(file).mtimeMs >= fs.statSync(STAND_IN_SRC).mtimeMs) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  return Promise.resolve(make(tmp)).then(() => fs.renameSync(tmp, file));
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  if (!['catalog.json', 'sounds.json', 'search.sqlite'].every((f) => fs.existsSync(path.join(GENERATED, f))) || !fs.existsSync(path.join(ROOT, 'vendor', 'sqlite'))) {
    execFileSync('node', ['tools/build.mjs', '--skip-quality'], { cwd: ROOT, stdio: 'ignore' });
  }
  CATALOG = JSON.parse(fs.readFileSync(path.join(GENERATED, 'catalog.json'), 'utf8'));
  PICK = choose(CATALOG);
  VERSIONS = JSON.parse(fs.readFileSync(path.join(GENERATED, 'versions.json'), 'utf8'));
  // what switching smarter search on downloads, as the build's own list of vendor files states it
  const vendor = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'manifest.json'), 'utf8'));
  SMART_MB = vendor.meaning === false ? 0 : Math.round(vendor.files.filter((f) => /^(transformers|ort|models)\//.test(f.to)).reduce((n, f) => n + f.bytes, 0) / 1e6);
  // the 490-entry stand-in catalogue (no art exists for it) and a keyword search file for it
  BIG = JSON.parse(fs.readFileSync(STAND_IN_SRC, 'utf8'));
  await writeOnce(path.join(STAND_IN_DIR, 'catalog.json'), (tmp) => fs.copyFileSync(STAND_IN_SRC, tmp));
  const { buildSearchIndex } = await import('../../tools/lib/search-index.mjs');
  await writeOnce(path.join(STAND_IN_DIR, 'generated', 'search.sqlite'), (tmp) => buildSearchIndex({ assets: BIG.assets, outFile: tmp }));
});

/** Reload once the page has finished fetching: a reload in the middle of a download would show up as failed requests. */
async function reload(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  await page.reload();
}
const box = (page) => page.getByRole('searchbox', { name: 'Search' });
const results = (page) => page.locator('ul.results > li');
const resultIds = (page) => results(page).evaluateAll((lis) => lis.map((li) => li.dataset.id));
const line = (page) => page.locator('.result-line');
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A kind tab, by its word (a tab reads "Sounds 56"). */
const tab = (page, word) => page.getByRole('tab', { name: new RegExp(`^${word} \\d+$`) });
/** One filter of the row (its button or token, and its menu when open), by its name. */
const filter = (page, name) => page.locator('.lib-filters').getByRole('group', { name, exact: true });
/** "Used for" and "View" share the More menu, so the row stays one row; inside it each is a group of its own. */
const HOME = { 'Used for': 'More', View: 'More' };
/** Open a filter's menu (if it is not open already). */
async function openFilter(page, name) {
  const wrap = filter(page, HOME[name] ?? name), head = wrap.locator('[data-menu]').last();
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await expect(wrap.getByRole('menu')).toBeVisible();
}
/** One choice in an open filter menu, by its whole label (a choice reads "Label 12"). */
const option = (page, name, label) => filter(page, name).getByRole('menuitemradio', { name: new RegExp(`^${literal(label)} \\d+$`) });
/** Open a filter and press one of its choices. */
async function pick(page, name, label) { await openFilter(page, name); await option(page, name, label).click(); }
/** The token a chosen filter value becomes. */
const token = (page, label) => page.locator('.lib-filters .token').filter({ hasText: label });
const removeToken = (page, label) => token(page, label).getByRole('button', { name: /^Remove the filter / }).click();
/** A result's place in the list, brought on screen so that its card exists (cards are made only near the screen). */
async function place(page, id) {
  const li = page.locator(`ul.results > li[data-id="${id}"]`);
  await expect(li).toHaveCount(1);
  await li.scrollIntoViewIfNeeded();
  await expect(li.locator('.card').first()).toBeVisible();
  return li;
}
/** Look an asset up by typing its name; returns its place, on screen. */
async function lookUp(page, asset) {
  await box(page).fill(asset.name);
  await expect.poll(() => resultIds(page)).toContain(asset.id);
  return place(page, asset.id);
}
/** Open the site on the 490-entry stand-in catalogue: a known set, for tests about ranking and scale. */
async function openStandIn(page, route = '/browse') {
  await page.goto(`/index.html?catalog=${STAND_IN}#${route}`, { waitUntil: 'domcontentloaded' });
  await waitForDrawn(page);
  await expect(results(page).first()).toBeAttached();
}
const countOf = async (node) => Number((await node.locator('.n').textContent()).trim());
const bagCount = (page) => page.locator('header .bag-count');
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items().map((i) => [i.kind, i.id, i.settings]));
const hash = (page) => page.evaluate(() => location.hash);
const pathOf = (url) => new URL(url).pathname;
const ofKind = (kind) => CATALOG.assets.filter((a) => a.kind === kind);

// ---- start-up ----------------------------------------------------------------------------

test('the library loads from the catalogue: no errors, and no sprite program is requested', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await openRoute(page, '/browse');
  await expect(results(page)).toHaveCount(CATALOG.assets.length);
  await expect(line(page)).toHaveText(`${CATALOG.assets.length} results`);
  await expect(page.locator('ul.results .card').first()).toBeVisible();
  // the first thumbnails have arrived
  await expect.poll(() => page.locator('ul.results img.thumb').first().evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await page.waitForLoadState('networkidle');
  expect(asked.filter((p) => p.startsWith('/sprites/')), 'files under sprites/').toEqual([]);
  expect(asked.filter((p) => p.startsWith('/kits/')), 'files under kits/').toEqual([]);
  expect(asked.filter((p) => /^\/sounds\/.+\.json$/.test(p)), 'one request per sound').toEqual([]);
  expect(asked).toContain('/generated/catalog.json');
  expect(asked.filter((p) => p === '/generated/sounds.json').length).toBeLessThanOrEqual(1);
  expect(asked.filter((p) => p === '/generated/versions.json').length, 'the ready-made versions are one file, fetched once').toBe(1);
});

test('top to bottom: search, the kind tabs with their numbers, one row of filters, then the results', async ({ page }) => {
  await openRoute(page, '/browse');
  await expect(page.locator('main.v2')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Library');
  const y = async (loc) => (await loc.boundingBox()).y;
  const tabs = page.getByRole('tablist', { name: 'Kind' });
  expect(await y(box(page))).toBeLessThan(await y(tabs));
  expect(await y(tabs)).toBeLessThan(await y(page.locator('.lib-filters')));
  expect(await y(page.locator('.lib-filters'))).toBeLessThan(await y(results(page).first()));
  // every tab says how many it holds
  expect(await countOf(tab(page, 'All'))).toBe(CATALOG.assets.length);
  expect(await countOf(tab(page, 'Sprites'))).toBe(ofKind('sprite').length);
  expect(await countOf(tab(page, 'Sounds'))).toBe(ofKind('sound').length);
  expect(await countOf(tab(page, 'Music'))).toBe(ofKind('music').length);
  expect(await countOf(tab(page, 'Kits'))).toBe(CATALOG.bundles.length);
  await expect(tab(page, 'All')).toHaveAttribute('aria-selected', 'true');
  // the row of filters, each a small button until something is chosen
  for (const name of ['Kit', 'Game type', 'Theme', 'Type', 'More']) await expect(filter(page, name).locator('button.filter-btn')).toBeVisible();
  // and they are one row
  expect(new Set(await page.locator('.lib-filters .filter-btn').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)))).size).toBe(1);
  // the switch shows its name only; what it does is said when it is pointed at or focused
  if (SMART_MB) {
    await expect(page.locator('.smart-note')).toBeHidden();
    await page.getByRole('switch', { name: 'Smarter search' }).focus();
    await expect(page.locator('.smart-note')).toBeVisible();
  }
  await expect(page.locator('.lib-filters .menu')).toHaveCount(0);
  await expect(page.locator('header nav a[aria-current="page"]')).toHaveText('Library');
});

plain('a site that cannot load its list of assets says so to the visitor, in plain words', async ({ page }) => {
  await quietNetwork(page);
  await page.route('**/generated/catalog.json', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  const said = [];
  page.on('console', (m) => said.push(m.text()));
  await page.goto('/index.html#/browse');
  // the page speaks to a visitor; the hint for whoever runs the site is in the console only
  await expect(page.locator('main')).toContainText('This page could not load its list of assets. Please try again later.');
  await expect(page.locator('main')).not.toContainText(/npm|build|catalog/i);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(said.some((t) => t.includes('npm run build'))).toBe(true);
});

// ---- search ------------------------------------------------------------------------------

test('typing "money" puts the coin sprite and the coin pickup sound at the top (known set)', async ({ page }) => {
  await openStandIn(page);
  await box(page).pressSequentially('money', { delay: 20 });
  await expect.poll(() => results(page).count()).toBeLessThan(BIG.assets.length);
  const top = (await resultIds(page)).slice(0, 4);
  expect(top).toContain('coin');
  expect(top).toContain('coin-pickup');
  await expect(line(page)).toContainText('for "money"');
  // with words typed, the order is the search's own, and the sort says so
  await expect(page.locator('#lib-sort option:checked')).toHaveText('Best match');
  // both kinds of card are there to press
  await expect(page.locator('ul.results .card a[href="#/sprite/coin"]')).toBeVisible();
  await expect(page.locator('ul.results .card.sound a[href="#/sound/coin-pickup"]')).toBeVisible();
});

test('a misspelling still finds the Hero (known set)', async ({ page }) => {
  await openStandIn(page);
  await box(page).fill('herro');
  await expect.poll(async () => (await resultIds(page)).slice(0, 3)).toContain('knight');
  await box(page).fill('knigt');
  await expect.poll(async () => (await resultIds(page))[0]).toBe('knight');
  await expect(page.locator('ul.results .card a[href="#/sprite/knight"]')).toContainText(BIG.assets.find((a) => a.id === 'knight').name);
});

test('typing an asset\'s name or one of its words finds it, whatever kind it is and wherever it sits in the library', async ({ page }) => {
  await openRoute(page, '/browse');
  const all = CATALOG.assets.length;
  for (const asset of [PICK.sprite, PICK.sound, PICK.track]) {
    const li = await lookUp(page, asset);
    await expect(li.locator(`a[href="#/${asset.kind}/${asset.id}"]`)).toContainText(asset.name);
    expect(await results(page).count()).toBeLessThan(all);
    await expect(line(page)).toContainText(' for "');
  }
  // one of the words people type for it works too, and so does a slip of the finger in a long enough word
  const typed = PICK.word(PICK.sound);
  await box(page).fill(typed);
  await expect.poll(() => resultIds(page)).toContain(PICK.sound.id);
  await place(page, PICK.sound.id);
  const name = PICK.sprite.name.toLowerCase();
  if (/^[a-z]{6,}$/.test(name)) {
    await box(page).fill(name.slice(0, 2) + name.slice(3));            // one letter missing
    await expect.poll(() => resultIds(page)).toContain(PICK.sprite.id);
  }
});

test('the search box takes exactly as much as is searched: 120 characters, typed, pasted or put in', async ({ page }) => {
  await openRoute(page, '/browse');
  const search = box(page);
  await expect(search).toHaveAttribute('maxlength', '120');
  const word = PICK.word(PICK.sound);
  const long = `${word} `.repeat(Math.ceil(300 / (word.length + 1)));      // 300 characters or more
  await search.fill(long);                              // put in all at once
  await expect(search).toHaveValue(long.slice(0, 120));
  const typedQ = () => page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] || '').get('q'));
  await expect.poll(typedQ).toBe(long.slice(0, 120));     // the address holds the same 120 characters
  expect((await resultIds(page))).toContain(PICK.sound.id);
  // The order may still change once when the search file arrives (ties are settled by it), so compare that final order.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  const before = await resultIds(page);

  // a reload shows the same text and the same results: nothing was dropped out of sight
  await reload(page);
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue(long.slice(0, 120));
  await expect.poll(() => resultIds(page)).toEqual(before);

  // typing past the limit goes nowhere
  await box(page).fill('');
  await box(page).pressSequentially('z'.repeat(125));
  await expect(box(page)).toHaveValue('z'.repeat(120));
  // a link with a longer search is cut to the same length, and the box shows what is searched
  await openRoute(page, `/browse?q=${long.trim().replace(/ /g, '+')}`);
  expect((await box(page).inputValue()).length).toBe(120);
  expect(await resultIds(page)).toContain(PICK.sound.id);
});

test('a keyboard user can skip the tabs and filters and go straight to the results', async ({ page }) => {
  await openRoute(page, '/browse');
  const skip = page.getByRole('button', { name: 'Skip to results' });
  await box(page).focus();
  // after the search box and its switch, the next stop is the skip link, before any tab or filter
  await page.keyboard.press('Tab');
  if (SMART_MB) {            // the switch is only there when this build of the site has smarter search
    await expect(page.getByRole('switch', { name: 'Smarter search' })).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  // it lands on the first card's name, which is that card's link
  const first = page.locator('ul.results > li').first().locator('a.card-link');
  await expect(first).toBeFocused();
  // from the name, the keyboard reaches that card's versions and its +
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('ul.results > li:first-child') && document.activeElement.tagName === 'BUTTON')).toBe(true);
});

test('the kind tabs can be walked with the arrow keys', async ({ page }) => {
  await openRoute(page, '/browse');
  await tab(page, 'All').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Sprites')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tab(page, 'Sprites')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Sprites')).toBeFocused();
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sprite');
  await page.keyboard.press('End');
  await expect(tab(page, 'Kits')).toBeFocused();
});

// ---- tabs and filters ----------------------------------------------------------------------

test('choosing a kind and a type narrows the results, and the numbers next to the choices follow', async ({ page }) => {
  await openRoute(page, '/browse');
  const total = CATALOG.assets.length;
  const sounds = ofKind('sound');
  const ofType = sounds.filter((a) => a.type === PICK.soundType);
  await expect(results(page)).toHaveCount(total);

  await tab(page, 'Sounds').click();
  await expect(tab(page, 'Sounds')).toHaveAttribute('aria-selected', 'true');
  await expect(results(page)).toHaveCount(sounds.length);
  await expect(line(page)).toHaveText(`${sounds.length} results`);
  expect(await results(page).evaluateAll((lis) => lis.every((li) => li.dataset.kind === 'sound'))).toBe(true);
  // the types on offer are now only the ones sounds have
  await openFilter(page, 'Type');
  const offered = await filter(page, 'Type').locator('[role=menuitemradio] .fl').allTextContents();
  expect([...offered].sort()).toEqual([...PICK.soundTypeLabels].sort());

  await option(page, 'Type', PICK.soundTypeLabel).click();
  await expect(page.locator('.lib-filters .menu')).toHaveCount(0);          // choosing closes the menu
  await expect(results(page)).toHaveCount(ofType.length);
  expect((await resultIds(page)).sort()).toEqual(ofType.map((a) => a.id).sort());
  // the chosen value is now a token, with the filter's name and a way to take it off
  await expect(token(page, PICK.soundTypeLabel)).toContainText('Type');
  await expect.poll(() => hash(page)).toBe(`#/browse?kind=sound&type=${PICK.soundType}`);
  // other filters count what is left: every number is at most the results there are
  await openFilter(page, 'Theme');
  for (const n of await filter(page, 'Theme').locator('[role=menuitemradio] .n').allTextContents()) expect(Number(n)).toBeLessThanOrEqual(ofType.length);
  await page.keyboard.press('Escape');
  await expect(page.locator('.lib-filters .menu')).toHaveCount(0);
  // a kind's own number does not shrink because of the kind itself, but it does follow the type
  expect(await countOf(tab(page, 'Sounds'))).toBe(ofType.length);
  expect(await countOf(tab(page, 'Sprites'))).toBe(0);

  // pressing the chosen value again in the menu lets go of it; so does the token's ×
  await openFilter(page, 'Type');
  await expect(option(page, 'Type', PICK.soundTypeLabel)).toHaveAttribute('aria-checked', 'true');
  await option(page, 'Type', PICK.soundTypeLabel).click();
  await expect(results(page)).toHaveCount(sounds.length);
  await pick(page, 'Type', PICK.soundTypeLabel);
  await removeToken(page, PICK.soundTypeLabel);
  await expect(page.locator('.lib-filters .token')).toHaveCount(0);
  await expect(results(page)).toHaveCount(sounds.length);
  await tab(page, 'All').click();
  await expect(results(page)).toHaveCount(total);
  await expect.poll(() => hash(page)).toBe('#/browse');
});

test('two filters can be cleared in one press; a menu closes on Escape or a press elsewhere, and opens with the keyboard', async ({ page }) => {
  await openRoute(page, '/browse');
  const total = CATALOG.assets.length;
  await pick(page, 'Theme', PICK.themeLabel);
  await pick(page, 'Type', labelFor('type', PICK.sprite.type));
  await expect(page.locator('.lib-filters .token')).toHaveCount(2);
  const want = CATALOG.assets.filter((a) => a.themes.includes(PICK.theme) && a.type === PICK.sprite.type);
  await expect(results(page)).toHaveCount(want.length);
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('.lib-filters .token')).toHaveCount(0);
  await expect(results(page)).toHaveCount(total);

  // a press elsewhere closes an open menu
  await openFilter(page, 'Theme');
  await line(page).click();
  await expect(page.locator('.lib-filters .menu')).toHaveCount(0);
  // the keyboard: Down opens the menu on its first choice, the arrows move, Enter chooses, and the focus stays on the filter
  const head = filter(page, 'Theme').locator('[data-menu]');
  await head.focus();
  await page.keyboard.press('ArrowDown');
  const items = filter(page, 'Theme').getByRole('menuitemradio');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.lib-filters .menu')).toHaveCount(0);
  await expect(filter(page, 'Theme').locator('[data-menu]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(items.first()).toBeFocused();
  const label = await items.first().locator('.fl').textContent();
  await page.keyboard.press('Enter');
  await expect(token(page, label)).toBeVisible();
  await expect(filter(page, 'Theme').locator('[data-menu]')).toBeFocused();
});

test('the "used for" menu narrows to a group of uses, and to one use', async ({ page }) => {
  await openRoute(page, '/browse');
  const inBranch = CATALOG.assets.filter((a) => a.role.startsWith(PICK.branch + '/'));
  const inLeaf = inBranch.filter((a) => a.role === PICK.leaf);
  await pick(page, 'Used for', PICK.branchLabel);
  await expect(results(page)).toHaveCount(inBranch.length);
  // sprites and sounds with the same use sit together
  const kinds = await results(page).evaluateAll((lis) => [...new Set(lis.map((li) => li.dataset.kind))].sort());
  expect(kinds).toEqual(PICK.branchKinds);
  await pick(page, 'Used for', PICK.leafLabel);
  await expect(results(page)).toHaveCount(inLeaf.length);
  expect(await hash(page)).toContain(`role=${encodeURIComponent(PICK.leaf)}`);
});

test('the Kit filter lists the kits, and narrows to what one kit holds', async ({ page }) => {
  const kit = CATALOG.bundles.at(-1);
  const inKit = CATALOG.assets.filter((a) => (a.bundles ?? []).includes(kit.id));
  await openRoute(page, '/browse');
  await openFilter(page, 'Kit');
  await expect(filter(page, 'Kit').getByRole('menuitemradio')).toHaveCount(CATALOG.bundles.filter((b) => CATALOG.assets.some((a) => (a.bundles ?? []).includes(b.id))).length);
  await option(page, 'Kit', kit.name).click();
  await expect(results(page)).toHaveCount(inKit.length);
  await expect(token(page, kit.name)).toBeVisible();
  await expect.poll(() => hash(page)).toBe(`#/browse?bundle=${kit.id}`);
});

test('the address bar holds the search and filters, so a reload or a copied link shows the same results', async ({ page }) => {
  await openRoute(page, '/browse');
  const word = PICK.word(PICK.sound);
  await box(page).fill(word);
  await tab(page, 'Sounds').click();
  await expect.poll(() => hash(page)).toBe(`#/browse?q=${word}&kind=sound`);
  const before = await resultIds(page);
  expect(before).toContain(PICK.sound.id);

  await reload(page);
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue(word);
  await expect(tab(page, 'Sounds')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => resultIds(page)).toEqual(before);

  // a link written by hand works too
  await openRoute(page, `/browse?kind=sprite&theme=${PICK.theme}`);
  const want = CATALOG.assets.filter((a) => a.kind === 'sprite' && a.themes.includes(PICK.theme)).map((a) => a.id);
  await expect.poll(async () => (await resultIds(page)).sort()).toEqual(want.sort());
  await expect(token(page, PICK.themeLabel)).toBeVisible();
  await expect(tab(page, 'Sprites')).toHaveAttribute('aria-selected', 'true');
});

test('old addresses still work', async ({ page }) => {
  await openRoute(page, '/sprites');
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sprite');
  await expect(results(page)).toHaveCount(ofKind('sprite').length);
  await expect(tab(page, 'Sprites')).toHaveAttribute('aria-selected', 'true');
  await openRoute(page, '/sounds');
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sound');
  await expect(results(page)).toHaveCount(ofKind('sound').length);
  await openRoute(page, '/music');
  await expect.poll(() => hash(page)).toBe('#/browse?kind=music');
  await expect(results(page)).toHaveCount(ofKind('music').length);
});

// ---- sort, grid or list, the Kits tab -----------------------------------------------------------

test('results can be sorted, and the address keeps the sort', async ({ page }) => {
  await openRoute(page, '/browse?kind=sprite');
  const sprites = ofKind('sprite');
  const sort = page.getByLabel('Sort');
  await expect(sort).toHaveValue('featured');
  // (the list is drawn a moment after the page and after every change, so each order is waited for)
  await expect(results(page)).toHaveCount(sprites.length);
  const byId = (id) => sprites.find((a) => a.id === id);
  // featured starts with characters
  if (sprites.some((a) => a.type === 'character')) await expect.poll(async () => byId((await resultIds(page))[0])?.type).toBe('character');

  await sort.selectOption('name');
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sprite&sort=name');
  const sortedNames = sprites.map((a) => a.name).sort((a, b) => a.localeCompare(b));
  await expect.poll(async () => (await resultIds(page)).map((id) => byId(id).name)).toEqual(sortedNames);

  await sort.selectOption('controls');
  const most = sprites.map((a) => a.tech.controls ?? 0).sort((a, b) => b - a);
  await expect.poll(async () => (await resultIds(page)).map((id) => byId(id).tech.controls ?? 0)).toEqual(most);
  const order = await resultIds(page);

  await reload(page);
  await waitForDrawn(page);
  await expect(page.getByLabel('Sort')).toHaveValue('controls');
  await expect.poll(() => resultIds(page)).toEqual(order);

  // longest first is about sounds and music
  await openRoute(page, '/browse?kind=sound&sort=length');
  const longest = ofKind('sound').map((a) => a.tech.seconds).sort((a, b) => b - a);
  await expect.poll(async () => (await resultIds(page)).map((id) => CATALOG.assets.find((a) => a.id === id).tech.seconds)).toEqual(longest);
});

test('the list shows more facts in rows, and the choice of grid or list is remembered', async ({ page }) => {
  const { sprite, sound } = PICK;
  await openRoute(page, `/browse?q=${encodeURIComponent(sprite.name)}`);
  const grid = page.getByRole('button', { name: 'Grid', exact: true }), list = page.getByRole('button', { name: 'List with more facts' });
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('ul.results.card-grid')).toHaveCount(1);
  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('ul.results.rows')).toHaveCount(1);
  const row = (await place(page, sprite.id)).locator('.card.row');
  await expect(row.locator(`a[href="#/sprite/${sprite.id}"]`)).toHaveText(sprite.name);
  await expect(row.locator('.desc')).toHaveText(sprite.description);
  await expect(row.locator('.c-type')).toHaveText(labelFor('type', sprite.type));
  await expect(row.locator('.c-anim')).toHaveText(String(sprite.tech.clips.length));
  await expect(row.locator('.c-ctl')).toHaveText(String(sprite.tech.controls));
  await expect(row.locator('.c-len')).toHaveText('');
  await expect(row.getByRole('button', { name: `Add ${sprite.name} to my bag`, exact: true })).toBeVisible();
  // the column names are there on a wide screen
  await expect(page.locator('.rows-head')).toContainText('Animations');
  await expect(page.locator('.rows-head')).toContainText('Controls');
  // the picture is sharp at a whole-number size
  const shown = await row.locator('img.thumb').evaluate((img, fw) => ({ k: img.getBoundingClientRect().width / fw, rendering: getComputedStyle(img).imageRendering }), sprite.tech.frame[0]);
  expect(Number.isInteger(shown.k)).toBe(true);
  expect(shown.rendering).toMatch(/pixelated|crisp-edges/);

  // a sound's row has its length and a play button
  await box(page).fill(sound.name);
  await expect.poll(() => resultIds(page)).toContain(sound.id);
  const srow = (await place(page, sound.id)).locator('.card.row');
  const secs = sound.tech.seconds;
  await expect(srow.locator('.c-len')).toHaveText(secs < 10 ? `${Number(secs.toFixed(2))} s` : `${Math.round(secs)} s`);
  await expect(srow.locator('.c-anim')).toHaveText('');
  await expect(srow.getByRole('button', { name: `Play ${sound.name}`, exact: true })).toBeVisible();

  // remembered: a reload, and a new address, still show rows
  await reload(page);
  await waitForDrawn(page);
  await expect(page.locator('ul.results.rows')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'List with more facts' })).toHaveAttribute('aria-pressed', 'true');
  await openRoute(page, '/browse?kind=music');
  await expect(page.locator('ul.results.rows > li .card.row').first()).toBeVisible();
  // and back to the grid
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.locator('ul.results.card-grid > li .card').first()).toBeVisible();
  await expect(page.locator('.card.row')).toHaveCount(0);
  await reload(page);
  await waitForDrawn(page);
  await expect(page.locator('ul.results.card-grid')).toHaveCount(1);
});

test('the Kits tab lists the kits as cards that lead to their pages', async ({ page }) => {
  await openRoute(page, '/browse');
  await tab(page, 'Kits').click();
  await expect.poll(() => hash(page)).toBe('#/browse?kind=kits');
  await expect(tab(page, 'Kits')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('a.card.kit')).toHaveCount(CATALOG.bundles.length);
  for (const b of CATALOG.bundles) {
    const card = page.locator(`a.card.kit[href="#/bundle/${b.id}"]`);
    await expect(card).toContainText(b.name);
    await expect(card).toContainText(`${b.sprites.length} sprite`);
  }
  await expect(line(page)).toHaveText(`${CATALOG.bundles.length} kits`);
  // nothing that only makes sense for a list of assets is offered here
  await expect(page.getByLabel('Sort')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Grid', exact: true })).toBeHidden();
  expect(await hasHorizontalScroll(page)).toBe(false);

  // the search narrows kits by their name, and the link opens on this tab
  const kit = CATALOG.bundles[0];
  const word = kit.name.split(' ')[0];
  await openRoute(page, `/browse?q=${encodeURIComponent(word)}&kind=kits`);
  await expect(tab(page, 'Kits')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`a.card.kit[href="#/bundle/${kit.id}"]`)).toBeVisible();
  const want = CATALOG.bundles.filter((b) => `${b.name} ${b.blurb}`.toLowerCase().includes(word.toLowerCase()));
  await expect(page.locator('a.card.kit')).toHaveCount(want.length);
  // a word no kit has: the page says so and offers the way out
  await box(page).fill('zzzqqq');
  await expect(page.locator('a.card.kit')).toHaveCount(0);
  await expect(page.locator('.empty')).toContainText('Nothing matches "zzzqqq"');
  await page.getByRole('button', { name: 'Clear the search' }).click();
  await expect(page.locator('a.card.kit')).toHaveCount(CATALOG.bundles.length);
  // the number on the Kits tab follows the filters in use: a kit counts while something in it passes them
  const theme = PICK.theme, holds = (b) => [...b.sprites, ...b.sounds, ...b.music].some((id) => CATALOG.assets.find((a) => a.id === id)?.themes.includes(theme));
  await openRoute(page, `/browse?theme=${theme}`);
  expect(await countOf(tab(page, 'Kits'))).toBe(CATALOG.bundles.filter(holds).length);
  await tab(page, 'Kits').click();
  await expect(page.locator('a.card.kit')).toHaveCount(CATALOG.bundles.filter(holds).length);
  await expect(token(page, PICK.themeLabel)).toBeVisible();
  await removeToken(page, PICK.themeLabel);
  await expect(page.locator('a.card.kit')).toHaveCount(CATALOG.bundles.length);
  // a kit card opens the kit's page
  await page.locator(`a.card.kit[href="#/bundle/${kit.id}"]`).click();
  await expect.poll(() => hash(page)).toBe(`#/bundle/${kit.id}`);
});

test('nothing found: the page says what was searched and offers the ways out', async ({ page }) => {
  await openRoute(page, `/browse?q=zzzqqq&theme=${PICK.theme}`);
  await expect(results(page)).toHaveCount(0);
  await expect(line(page)).toHaveText('Nothing matches "zzzqqq"');
  const empty = page.locator('.empty');
  await expect(empty).toBeVisible();
  // it is said once on the page, and there is nothing to sort or lay out
  expect(await page.getByText('Nothing matches "zzzqqq"').evaluateAll((ns) => ns.filter((n) => n.getBoundingClientRect().width > 2).length)).toBe(1);
  await expect(page.getByLabel('Sort')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Grid', exact: true })).toBeHidden();
  await expect(empty).toContainText('Nothing matches "zzzqqq"');
  await expect(empty).toContainText('A filter may also be hiding what you want.');
  await empty.getByRole('button', { name: `Remove "${PICK.themeLabel}"` }).click();
  await expect(page.locator('.lib-filters .token')).toHaveCount(0);
  await expect(empty).toBeVisible();
  await empty.getByRole('button', { name: 'Clear the search' }).click();
  await expect(empty).toBeHidden();
  await expect(results(page)).toHaveCount(CATALOG.assets.length);
  await expect(box(page)).toBeFocused();
});

// ---- the style filter that stays --------------------------------------------------------------

test('a view chosen in the library stays after visiting a sprite page, and can be removed', async ({ page }) => {
  test.skip(!PICK.otherView, 'every sprite in the catalogue has the same view, so a view cannot narrow anything');
  await openRoute(page, '/browse');
  const all = await results(page).count();
  expect(all).toBe(CATALOG.assets.length);
  const V = PICK.viewLabel, other = PICK.otherViewLabel;
  // what choosing a view hides: sprites that have a different view (things with no view always stay)
  const hidden = CATALOG.assets.filter((a) => a.view && a.view !== 'none' && a.view !== PICK.view);
  const aSound = CATALOG.assets.find((a) => a.kind === 'sound');

  // the number next to a view is the number of results choosing it gives: its sprites and everything that has no view
  await openFilter(page, 'View');
  await expect(filter(page, 'More').getByRole('menu')).toContainText('Sounds and music have no view, so they always stay.');
  const promised = {};
  for (const label of [V, other]) promised[label] = await countOf(option(page, 'View', label));
  expect(promised[V]).toBe(all - hidden.length);
  await option(page, 'View', other).click();
  await expect(results(page)).toHaveCount(promised[other]);
  await pick(page, 'View', V);
  await expect(results(page)).toHaveCount(promised[V]);
  await expect(token(page, V)).toBeVisible();
  // sounds have no view, so they stay
  expect((await resultIds(page))).toContain(aSound.id);
  expect((await resultIds(page))).not.toContain(hidden[0].id);
  // the view is not written over a link that names none... but it is in the address for this page
  expect(await hash(page)).toContain(`view=${PICK.view}`);

  // go and look at a sprite, then come back to the library by its plain address
  await (await lookUp(page, PICK.viewSprite)).locator('a.card-link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PICK.viewSprite.name);
  await openRoute(page, '/browse');
  await expect(token(page, V)).toBeVisible();
  await expect(results(page)).toHaveCount(all - hidden.length);

  // it is also there with a kind chosen and after a reload (a later visit)
  await openRoute(page, '/browse?kind=sprite');
  await expect(token(page, V)).toBeVisible();
  expect(await resultIds(page)).not.toContain(hidden[0].id);
  await reload(page);
  await waitForDrawn(page);
  await expect(token(page, V)).toBeVisible();

  // taking the token off brings the other views back, and it stays off
  await removeToken(page, V);
  await expect(token(page, V)).toHaveCount(0);
  expect(await resultIds(page)).toContain(hidden[0].id);
  await openRoute(page, '/browse');
  await expect(results(page)).toHaveCount(all);
  await expect(page.locator('.lib-filters .token')).toHaveCount(0);
});

test('the numbers next to the views follow a search and the other filters', async ({ page }) => {
  await openRoute(page, `/browse?q=${PICK.word(PICK.viewSprite)}`);      // a word that finds at least one sprite with a view
  await openFilter(page, 'View');
  const labels = await filter(page, 'View').locator('[role=menuitemradio] .fl').allTextContents();
  expect(labels.length).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Escape');
  for (const label of labels) {
    await openFilter(page, 'View');
    const promised = await countOf(option(page, 'View', label));
    await option(page, 'View', label).click();
    await expect(results(page), label).toHaveCount(promised);
    await removeToken(page, label);
  }
  // with only sounds showing no view is on offer: nothing a view could narrow
  await box(page).fill('');
  await tab(page, 'Sounds').click();
  await expect(results(page)).toHaveCount(ofKind('sound').length);
  await openFilter(page, 'Used for');
  await expect(filter(page, 'View')).toHaveCount(0);
});

test('a game type is kept the same way', async ({ page }) => {
  await openRoute(page, '/browse');
  const fits = CATALOG.assets.filter((a) => a.gameTypes.includes(PICK.gameType));
  await pick(page, 'Game type', PICK.gameTypeLabel);
  await expect(results(page)).toHaveCount(fits.length);
  await openRoute(page, '/bag');
  await openRoute(page, '/browse');
  await expect(token(page, PICK.gameTypeLabel)).toBeVisible();
  await expect(results(page)).toHaveCount(fits.length);
});

// ---- cards -------------------------------------------------------------------------------

test('a sound card shows its icon and its length, and its play button plays it, loading just that sound', async ({ page }) => {
  const long = PICK.longSound;               // long enough to still be playing when the test looks
  await openRoute(page, `/browse?q=${encodeURIComponent(long.name)}&kind=sound`);
  const card = await place(page, long.id);
  const play = card.getByRole('button', { name: `Play ${long.name}`, exact: true });
  await expect(play).toBeVisible();
  // an icon on the tile, never a waveform picture
  await expect(card.locator('.card-tile .sound-pic svg')).toBeVisible();
  await expect(card.locator('.card-tile img, .card-tile canvas')).toHaveCount(0);
  await expect(card.locator('.card-tag')).toContainText(labelFor('type', long.type));
  await expect(card.locator('.card-tag .num')).toContainText(`${Math.round(long.tech.seconds) >= 10 ? Math.round(long.tech.seconds) : Number(long.tech.seconds.toFixed(2))} s`);
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await play.click();
  const stop = card.getByRole('button', { name: `Stop ${long.name}`, exact: true });
  await expect(stop).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('.card')).toHaveClass(/playing/);
  expect(asked.filter((p) => /^\/sounds\/.+\.json$/.test(p)).length).toBeLessThanOrEqual(1);
  await stop.click();
  await expect(play).toBeVisible();
  await expect(card.locator('.card')).not.toHaveClass(/playing/);
  // the name is still the way to its page
  await expect(card.locator(`a[href="#/sound/${long.id}"]`)).toHaveText(long.name);
});

test('a music card plays the track and pressing again stops it', async ({ page }) => {
  const track = PICK.track;
  await openRoute(page, '/browse?kind=music');
  const card = await place(page, track.id);
  await expect(card.locator('.card-tile .sound-pic svg')).toBeVisible();
  await card.getByRole('button', { name: `Play ${track.name}`, exact: true }).click();
  const stop = card.getByRole('button', { name: `Stop ${track.name}`, exact: true });
  await expect(stop).toBeVisible({ timeout: 30_000 });
  await stop.click();
  await expect(card.getByRole('button', { name: `Play ${track.name}`, exact: true })).toBeVisible();
});

test('only one card sounds at a time', async ({ page }) => {
  const [a, b] = ofKind('music');
  test.skip(!b, 'the catalogue has one track');
  await openRoute(page, '/browse?kind=music');
  await (await place(page, a.id)).getByRole('button', { name: `Play ${a.name}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Stop ${a.name}`, exact: true })).toBeVisible({ timeout: 30_000 });
  await (await place(page, b.id)).getByRole('button', { name: `Play ${b.name}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Stop ${b.name}`, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: `Play ${a.name}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Stop ${b.name}`, exact: true }).click();
});

test('hovering a sprite card plays its animation from the strip picture; nothing is drawn by a sprite program', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  const sprite = PICK.sprite;                 // an animated sprite, wherever it sits in the list
  await openRoute(page, '/browse?kind=sprite');
  const card = await place(page, sprite.id);
  await expect(card.locator('img.thumb')).toBeVisible();
  await expect(card.locator('canvas.anim')).toBeHidden();
  await expect(card.locator('.card-tag')).toHaveText(labelFor('type', sprite.type));
  // the pointer over the picture (the card's link lies over the whole card, so the mouse is moved there by its place)
  const tile = await card.locator('.card-tile').boundingBox();
  await page.mouse.move(tile.x + 20, tile.y + 20);
  const cv = card.locator('canvas.anim');
  await expect(cv).toBeVisible();
  const first = await canvasStats(cv);
  expect(first.opaque).toBeGreaterThan(50);
  expect([first.width, first.height]).toEqual(sprite.tech.frame);
  await expect.poll(async () => (await canvasStats(cv)).hash, { timeout: 5000 }).not.toBe(first.hash);
  // sharp pixels: a whole-number scale and no smoothing
  const shown = await cv.evaluate((c) => ({ scale: c.getBoundingClientRect().width / c.width, rendering: getComputedStyle(c).imageRendering }));
  expect(Number.isInteger(shown.scale)).toBe(true);
  expect(shown.rendering).toMatch(/pixelated|crisp-edges/);
  // moving away puts the still picture back
  await line(page).hover();
  await expect(cv).toBeHidden();
  await expect(card.locator('img.thumb')).toBeVisible();
  const thumb = await card.locator('img.thumb').evaluate((img, fw) => ({ k: img.getBoundingClientRect().width / fw, rendering: getComputedStyle(img).imageRendering }), sprite.tech.frame[0]);
  expect(thumb.rendering).toMatch(/pixelated|crisp-edges/);
  expect(Number.isInteger(thumb.k)).toBe(true);
  // keyboard focus animates it too
  await card.locator('a.card-link').focus();
  await expect(cv).toBeVisible();
  expect(asked.filter((p) => p.startsWith('/sprites/'))).toEqual([]);
  expect(asked).toContain(`/${sprite.strip}`);
  // the whole card is the way to the sprite's page: a press on the picture opens it
  await page.mouse.click(tile.x + 20, tile.y + 20);
  await expect.poll(() => hash(page)).toBe(`#/sprite/${sprite.id}`);
});

test('the + on a card adds it to the bag with its standard settings; once it is there the button leads to the bag', async ({ page }) => {
  await openRoute(page, '/browse');
  await expect(bagCount(page)).toHaveText('0');
  const { sprite, sound } = PICK;
  // by scrolling to it
  const first = (await place(page, sprite.id)).locator('.card-add');
  await expect(first).toHaveAccessibleName(`Add ${sprite.name} to my bag`);
  await expect(first.locator('.add-word')).toHaveText('Add to my bag');
  await first.click();
  await expect(bagCount(page)).toHaveText('1');
  await expect(first).toHaveClass(/in-bag/);
  await expect(first).toHaveAccessibleName(`${sprite.name} is in your bag. Go to your bag`);
  await expect(first.locator('.add-word')).toHaveText('In your bag');
  // and by looking it up
  await (await lookUp(page, sound)).getByRole('button', { name: `Add ${sound.name} to my bag`, exact: true }).click();
  await expect(bagCount(page)).toHaveText('2');
  // each goes in with its standard settings
  expect(await bagItems(page)).toEqual([
    ['sprite', sprite.id, { params: {}, cues: null, scale: 1 }],
    ['sound', sound.id, { params: {}, style: null, seed: 1 }],
  ]);
  // a card made before the bag changed is right when it comes back on screen
  await box(page).fill('');
  await expect((await place(page, sprite.id)).locator('.card-add')).toHaveClass(/in-bag/);
  // once it is there the card does not add it again: it leads to the bag
  await (await place(page, sprite.id)).locator('.card-add').click();
  await expect.poll(() => hash(page)).toBe('#/bag');
  await expect(bagCount(page)).toHaveText('2');
});

test('three version dots on a sprite card: one shows its version on the tile, a press adds that version to the bag', async ({ page }) => {
  // a sprite whose first three versions each change something
  const sprite = [PICK.sprite, ...ofKind('sprite')].find((a) => a.thumb && (VERSIONS[a.id] ?? []).slice(0, 3).filter((v) => Object.keys(v.params ?? {}).length).length >= 2);
  const versions = VERSIONS[sprite.id].slice(0, 3);
  const [i, j] = versions.map((v, n) => (Object.keys(v.params ?? {}).length ? n : -1)).filter((n) => n >= 0);
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await openRoute(page, `/browse?q=${encodeURIComponent(sprite.name)}&kind=sprite`);
  const card = await place(page, sprite.id);
  const dots = card.getByRole('group', { name: `Ready-made versions of ${sprite.name}` }).getByRole('button');
  await expect(dots).toHaveCount(versions.length);
  for (const [n, v] of versions.entries()) await expect(dots.nth(n)).toHaveAccessibleName(`Add the ${v.name} version of ${sprite.name}`);
  expect(asked.filter((p) => p.startsWith('/sprites/')), 'no sprite program until a version is looked at').toEqual([]);

  // the pointer on a dot: the tile shows that version, drawn by the sprite itself, and the tag names it
  const still = card.locator('img.thumb'), cv = card.locator('canvas.anim');
  await dots.nth(i).hover();
  await expect(card.locator('.card-tag')).toHaveText(`${versions[i].name} version`);
  await expect(cv).toBeVisible();
  await expect(still).toBeHidden();
  const one = await canvasStats(cv);
  expect(one.opaque).toBeGreaterThan(20);
  expect(asked).toContain(`/${sprite.src}`);
  // another dot shows another picture
  await dots.nth(j).hover();
  await expect(card.locator('.card-tag')).toHaveText(`${versions[j].name} version`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // away from the card: the sprite as it is, and its own tag
  await line(page).hover();
  await expect(card.locator('.card-tag')).toHaveText(labelFor('type', sprite.type));
  await expect(still).toBeVisible();
  // keyboard focus on a dot shows it too
  await dots.nth(i).focus();
  await expect(card.locator('.card-tag')).toHaveText(`${versions[i].name} version`);
  await expect(cv).toBeVisible();

  // a press adds that version, as its settings; the dot and the + show it
  await expect(bagCount(page)).toHaveText('0');
  await dots.nth(i).click();
  await expect(bagCount(page)).toHaveText('1');
  expect(await bagItems(page)).toEqual([['sprite', sprite.id, expect.objectContaining({ params: versions[i].params, scale: 1 })]]);
  await expect(dots.nth(i)).toHaveAttribute('aria-pressed', 'true');
  await expect(dots.nth(j)).toHaveAttribute('aria-pressed', 'false');
  await expect(card.locator('.card-add')).toHaveClass(/in-bag/);
  // another version changes that item: one sprite, not two
  await dots.nth(j).click();
  await expect(bagCount(page)).toHaveText('1');
  expect((await bagItems(page))[0][2].params).toEqual(versions[j].params);
  await expect(dots.nth(j)).toHaveAttribute('aria-pressed', 'true');
  await expect(dots.nth(i)).toHaveAttribute('aria-pressed', 'false');
  // the list view has the same dots
  await page.getByRole('button', { name: 'List with more facts' }).click();
  const row = await place(page, sprite.id);
  await expect(row.getByRole('group', { name: `Ready-made versions of ${sprite.name}` }).getByRole('button')).toHaveCount(versions.length);
  await expect(row.locator('.vdot').nth(j)).toHaveAttribute('aria-pressed', 'true');
});

test('Back from an asset page returns to the same results at the same place', async ({ page }) => {
  await openRoute(page, '/browse?kind=sound');
  const ids = await resultIds(page);
  const id = ids.at(-1), asset = CATALOG.assets.find((a) => a.id === id);
  const li = await place(page, id);
  const top = Math.round((await li.boundingBox()).y);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await li.locator('a.card-link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(asset.name);
  await expect(page.locator('header a.back-link')).toContainText('Back to results');
  await page.locator('header a.back-link').click();
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sound');
  await expect(results(page)).toHaveCount(ids.length);
  await expect.poll(async () => Math.abs(Math.round((await page.locator(`ul.results > li[data-id="${id}"]`).boundingBox()).y) - top)).toBeLessThanOrEqual(2);
});

test('similar assets can be dropped into any page with one call', async ({ page }) => {
  const id = PICK.sound.id;
  await openRoute(page, '/browse?kind=kits');
  await page.evaluate(async (asset) => {
    const { similarAssets } = await import('/app/browse.js');
    document.querySelector('main').append(similarAssets(asset));
  }, id);
  const section = page.locator('section.similar');
  await expect(section.getByRole('heading')).toBeVisible();
  await expect.poll(() => section.locator('.card').count()).toBeGreaterThanOrEqual(1);
  expect(await section.locator('.card').count()).toBeLessThanOrEqual(6);
  await expect(section.locator(`a[href="#/sound/${id}"]`)).toHaveCount(0);            // never the asset itself
  // every one of them is a real asset with a page of its own
  const hrefs = await section.locator('.card a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const href of hrefs) expect(CATALOG.assets.some((a) => href === `#/${a.kind}/${a.id}`), href).toBe(true);
});

// ---- kits were bundles' first name ----------------------------------------------------------------

plain('an old #/kit/<id> address lands on the bundle route, and #/kits on the list of bundles', async ({ page }) => {
  await quietNetwork(page);
  const kit = CATALOG.bundles[0];       // old kit addresses used the ids bundles have now
  await page.goto(`/index.html#/kit/${kit.id}`);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#/bundle/${kit.id}`);
  await page.goto('/index.html#/kits');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundles');
});

// ---- smarter search is a choice ----------------------------------------------------------------

plain('a site built without smarter search does not offer it', async ({ page }) => {
  plain.skip(SMART_MB > 0, 'this build of the site has smarter search (see the next two tests)');
  await quietNetwork(page);
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await page.goto('/index.html#/browse');
  await waitForDrawn(page);
  await expect(page.locator('ul.results > li').first()).toBeAttached();
  await expect(page.getByRole('switch', { name: 'Smarter search' })).toBeHidden();
  // and nothing on the page points at a switch that is not there
  await box(page).fill('zzzqqq xxyyzz qqqzzz');      // several words, none of them real: where the tip about describing would go
  await expect(page.locator('.empty')).toBeVisible();
  await expect(page.locator('.empty')).not.toContainText(/smarter search/i);
  expect(asked.filter((p) => p.startsWith('/vendor/models/') || p.startsWith('/vendor/ort/') || p.startsWith('/vendor/transformers/'))).toEqual([]);
});

plain('smarter search is off until asked for, then loads, and the choice is remembered', async ({ page }) => {
  plain.skip(SMART_MB === 0, 'this build of the site was made without smarter search (vendor/manifest.json: "meaning": false)');
  plain.setTimeout(300_000);
  await quietNetwork(page);
  // as the shared `test` does: any console error, page error or failed request fails this test. One exception:
  // the model library cancels and repeats one of its own small requests while it starts, which is not a fault.
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!(r.failure()?.errorText === 'net::ERR_ABORTED' && pathOf(r.url()).startsWith('/vendor/models/'))) errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`); });
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  const heavy = () => asked.filter((p) => p.startsWith('/vendor/models/') || p.startsWith('/vendor/ort/'));
  const word = PICK.word(PICK.sound), finds = PICK.sound.id;
  const description = `something that sounds like a ${PICK.sound.name.toLowerCase()} for my game`;

  await openRoute(page, '/browse');
  const sw = page.getByRole('switch', { name: 'Smarter search' });
  await expect(sw).toBeVisible();
  await expect(sw).not.toBeChecked();
  await expect(page.locator('.smart-note')).toHaveText(`Understands descriptions like "something for when the player dies". Downloads about ${SMART_MB} MB once.`);
  await box(page).fill(description);
  await expect.poll(() => results(page).count()).toBeGreaterThanOrEqual(1);
  await box(page).fill(word);
  await expect.poll(() => resultIds(page)).toContain(finds);
  await page.waitForLoadState('networkidle');
  expect(heavy(), 'nothing big is downloaded while the switch is off').toEqual([]);

  // while it downloads the line says how much has arrived
  await page.locator('.smart-note').evaluate((note) => { window.__notes = []; new MutationObserver(() => window.__notes.push(note.textContent)).observe(note, { childList: true, characterData: true, subtree: true }); });
  await sw.click();
  await expect(sw).toBeChecked();
  await expect.poll(() => heavy().some((p) => p.startsWith('/vendor/ort/')), { timeout: 120_000 }).toBe(true);
  await expect.poll(() => heavy().some((p) => p.startsWith('/vendor/models/')), { timeout: 120_000 }).toBe(true);
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'ready', { timeout: 240_000 });
  const notes = await page.evaluate(() => window.__notes);
  const progress = notes.map((t) => /^Downloading: (\d+) of (\d+) MB$/.exec(t)).filter(Boolean);
  expect(progress.length, `progress lines among: ${notes.join(' | ')}`).toBeGreaterThanOrEqual(2);
  for (const m of progress) { expect(Number(m[2])).toBe(SMART_MB); expect(Number(m[1])).toBeLessThanOrEqual(SMART_MB); }
  expect(progress.map((m) => Number(m[1]))).toEqual(progress.map((m) => Number(m[1])).sort((a, b) => a - b));       // it only goes up
  expect(notes).toContain('Getting smarter search ready…');
  await expect(page.locator('.smart-note')).toHaveText('On. Describe what you need in your own words.');
  await box(page).fill(description);
  await expect.poll(() => results(page).count()).toBeGreaterThanOrEqual(1);
  // typing still answers
  await box(page).fill(word);
  await expect.poll(() => resultIds(page)).toContain(finds);

  // the choice survives a reload (the browser keeps the download, so it is ready again without fetching it twice)
  await reload(page);
  await waitForDrawn(page);
  await expect(page.getByRole('switch', { name: 'Smarter search' })).toBeChecked();
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'ready', { timeout: 240_000 });
  // and switching it off is remembered too
  await page.waitForLoadState('networkidle');
  await page.getByRole('switch', { name: 'Smarter search' }).click();
  await expect(page.getByRole('switch', { name: 'Smarter search' })).not.toBeChecked();
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'off');
  await expect(page.locator('.smart')).toContainText(`${SMART_MB} MB`);
  await reload(page);
  await waitForDrawn(page);
  asked.length = 0;
  await expect(page.getByRole('switch', { name: 'Smarter search' })).not.toBeChecked();
  await box(page).fill(word);
  await expect.poll(() => resultIds(page)).toContain(finds);
  await page.waitForLoadState('networkidle');
  expect(heavy()).toEqual([]);
  expect(errors, 'the page should log no errors').toEqual([]);
});

plain('if smarter search cannot load, the page says so in one line, switches it back off, and normal search carries on', async ({ page }) => {
  plain.skip(SMART_MB === 0, 'this build of the site was made without smarter search');
  plain.setTimeout(120_000);
  const word = PICK.word(PICK.sound), finds = PICK.sound.id;
  const ids = () => page.locator('ul.results > li').evaluateAll((lis) => lis.map((li) => li.dataset.id));
  await quietNetwork(page);
  await page.route('**/vendor/models/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  await page.goto('/index.html#/browse');
  await waitForDrawn(page);
  const sw = page.getByRole('switch', { name: 'Smarter search' });
  await sw.click();
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'failed', { timeout: 90_000 });
  await expect(page.locator('.smart-note')).toHaveText('Smarter search could not be loaded, so it is switched off. Normal search still works.');
  await expect(sw).not.toBeChecked();
  await box(page).fill(word);
  await expect.poll(ids).toContain(finds);

  // it is not tried again on the next visit
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await reload(page);
  await waitForDrawn(page);
  await expect(page.getByRole('switch', { name: 'Smarter search' })).not.toBeChecked();
  await expect(page.locator('.smart')).toHaveAttribute('data-state', 'off');
  await box(page).fill(word);
  await expect.poll(ids).toContain(finds);
  await page.waitForTimeout(500);
  expect(asked.filter((p) => p.startsWith('/vendor/models/') || p.startsWith('/vendor/ort/') || p.startsWith('/vendor/transformers/'))).toEqual([]);
});

// ---- scale -------------------------------------------------------------------------------

// Budgets. Measured alone on the test machine with the 490-entry stand-in: first results at about 70 ms, a key press
// about 6 ms (the slowest, the first key, about 35 ms). The budgets leave room for a slow machine and for other
// tests running beside this one.
const PAINT_MS = 2000;           // from opening the address to the first results on screen
const KEYSTROKE_MS = 50;         // a typical key press: from the press to the frame that shows its results
const SLOWEST_KEY_MS = 400;      // the slowest single key press
const FILL_MS = 1000;            // after a jump down the page: until every place on screen has its card

/** When the first results were on screen (the page notes it), and the browser's own first paint. */
const paintTimes = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
  const first = performance.getEntriesByName('loadout-results')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  resolve({ results: first ? first.startTime : null, fcp: fcp ? fcp.startTime : null });
})));
/** Type a word one key at a time; the page notes how long each key took, from the press to the frame that shows its results. */
async function typeTimed(page, word) {
  await box(page).click();
  const typed = [];
  for (const key of word) {
    await page.evaluate(() => performance.clearMeasures('loadout-typed'));
    await page.keyboard.type(key);
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName('loadout-typed').length)).toBe(1);
    typed.push(await page.evaluate(() => performance.getEntriesByName('loadout-typed')[0].duration));
  }
  return { worst: Math.max(...typed), median: [...typed].sort((x, y) => x - y)[typed.length >> 1] };
}
/** For each place in the list that is on screen now: does it have its card? */
const onScreen = (page) => page.evaluate(() => [...document.querySelectorAll('ul.results > li')]
  .filter((li) => { const r = li.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map((li) => !!li.querySelector('.card')));
const filled = async (page) => { const here = await onScreen(page); return here.length > 0 && here.every(Boolean); };

test.describe('with the 490-entry stand-in catalogue', () => {
  test('the page paints and a keystroke updates the results within budget; cards are made only near the screen', async ({ page }) => {
    await page.goto(`/index.html?catalog=${STAND_IN}#/browse`, { waitUntil: 'domcontentloaded' });
    await expect(results(page)).toHaveCount(BIG.assets.length);
    await expect(line(page)).toHaveText(`${BIG.assets.length} results`);
    const paint = await paintTimes(page);
    expect(paint.results).not.toBeNull();
    expect(paint.results).toBeLessThan(PAINT_MS);

    // only the cards near the screen exist
    const made = await page.locator('ul.results .card').count();
    expect(made).toBeGreaterThanOrEqual(3);
    expect(made).toBeLessThan(BIG.assets.length / 4);
    await results(page).last().scrollIntoViewIfNeeded();
    await expect(results(page).last().locator('.card')).toBeVisible();
    expect(await page.locator('ul.results .card').count()).toBeLessThan(BIG.assets.length / 2);
    await page.evaluate(() => window.scrollTo(0, 0));

    // type a word one key at a time
    const { worst, median } = await typeTimed(page, 'door open');
    expect(median).toBeLessThan(KEYSTROKE_MS);
    expect(worst).toBeLessThan(SLOWEST_KEY_MS);
    expect((await resultIds(page)).slice(0, 5)).toContain('door-open');
    expect(await results(page).count()).toBeLessThan(BIG.assets.length);

    // tabs work at this size too, and their numbers match the catalogue
    await box(page).fill('');
    await tab(page, 'Music').click();
    await expect(results(page)).toHaveCount(BIG.assets.filter((a) => a.kind === 'music').length);
    // the list view is lazy in the same way
    await tab(page, 'All').click();
    await page.getByRole('button', { name: 'List with more facts' }).click();
    await expect(results(page)).toHaveCount(BIG.assets.length);
    await expect(page.locator('ul.results .card.row').first()).toBeVisible();
    expect(await page.locator('ul.results .card.row').count()).toBeLessThan(BIG.assets.length / 4);
    console.log(`[scale] ${BIG.assets.length} stand-in assets: first results at ${Math.round(paint.results)} ms (first paint ${Math.round(paint.fcp ?? 0)} ms); keystroke to painted results: median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
  });
});

test.describe('with the library as it is today', () => {
  test('the library paints fast, answers each key fast, and fills in cards when scrolled quickly to the bottom and back', async ({ page }) => {
    const total = CATALOG.assets.length;
    await page.goto('/index.html#/browse', { waitUntil: 'domcontentloaded' });
    await expect(results(page)).toHaveCount(total);
    const paint = await paintTimes(page);
    expect(paint.results).not.toBeNull();
    expect(paint.results).toBeLessThan(PAINT_MS);
    const madeAtFirst = await page.locator('ul.results .card').count();
    expect(madeAtFirst).toBeGreaterThanOrEqual(1);
    if (total > 100) expect(madeAtFirst, 'only cards near the screen are made').toBeLessThan(total / 2);
    expect(await filled(page) || !(await onScreen(page)).length, 'what is on screen at first has its cards').toBe(true);

    // a jump to the middle of the page: how long until every place on screen has its card
    const fillMs = await page.evaluate(() => new Promise((resolve) => {
      const t0 = performance.now();
      window.scrollTo(0, document.documentElement.scrollHeight / 2);
      const look = () => {
        const here = [...document.querySelectorAll('ul.results > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
        if (here.length && here.every((li) => li.querySelector('.card'))) resolve(performance.now() - t0); else requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    }));
    expect(fillMs).toBeLessThan(FILL_MS);

    // quickly to the bottom and back, several times, without waiting in between
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((r) => requestAnimationFrame(r));
        window.scrollTo(0, 0);
        await new Promise((r) => requestAnimationFrame(r));
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    // at the bottom: the last place has its card, and so does everything on screen
    await expect(results(page).last().locator('.card').first()).toBeVisible();
    await expect.poll(() => filled(page)).toBe(true);
    // back at the top: the same, and the first card is the one that was there before
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(results(page).first().locator('.card').first()).toBeVisible();
    await results(page).first().scrollIntoViewIfNeeded();
    await expect.poll(() => filled(page)).toBe(true);
    // no card was made twice, and no place holds a card for another asset
    const wrong = await page.evaluate(() => [...document.querySelectorAll('ul.results > li')].filter((li) => li.querySelectorAll('.card').length > 1
      || (li.querySelector('.card') && !li.querySelector(`a[href$="/${li.dataset.id}"]`))).map((li) => li.dataset.id));
    expect(wrong).toEqual([]);
    const madeAfter = await page.locator('ul.results .card').count();

    // type a word one key at a time
    const { worst, median } = await typeTimed(page, PICK.word(PICK.sound));
    expect(median).toBeLessThan(KEYSTROKE_MS);
    expect(worst).toBeLessThan(SLOWEST_KEY_MS);
    expect(await resultIds(page)).toContain(PICK.sound.id);
    console.log(`[live] the library, ${total} assets: first results at ${Math.round(paint.results)} ms (first paint ${Math.round(paint.fcp ?? 0)} ms); ${madeAtFirst} cards made at first, ${madeAfter} after scrolling; jump to the middle filled in ${Math.round(fillMs)} ms; keystroke to painted results: median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
  });
});

// ---- the four window sizes ---------------------------------------------------------------------

for (const [w, h] of [[1440, 900], [1024, 768], [900, 700]]) {
  test.describe(`${w} by ${h}`, () => {
    test.use({ viewport: { width: w, height: h } });
    test('grid, list and kits fit the window, and nothing in the bar overlaps', async ({ page }) => {
      await openRoute(page, `/browse?theme=${PICK.theme}`);
      expect(await hasHorizontalScroll(page)).toBe(false);
      // the bar's pieces do not sit on top of each other
      const boxes = await page.locator('.lib-filters > *, .lib-bar-end > *').evaluateAll((ns) => ns.filter((n) => n.offsetParent).map((n) => { const r = n.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
        const [l1, t1, r1, b1] = boxes[a], [l2, t2, r2, b2] = boxes[b];
        expect(l1 < r2 - 1 && l2 < r1 - 1 && t1 < b2 - 1 && t2 < b1 - 1, `bar pieces ${a} and ${b} overlap`).toBe(false);
      }
      // every picture on screen is inside its tile
      const out = await page.locator('ul.results .card-tile').evaluateAll((tiles) => tiles.filter((t) => !t.classList.contains('is-cover')).map((t) => { const p = t.querySelector('img.thumb'); if (!p) return null; const a = t.getBoundingClientRect(), b = p.getBoundingClientRect(); return b.left >= a.left - 0.5 && b.right <= a.right + 0.5 && b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5; }).filter((x) => x === false).length);
      expect(out).toBe(0);
      await page.getByRole('button', { name: 'List with more facts' }).click();
      await expect(page.locator('ul.results .card.row').first()).toBeVisible();
      expect(await hasHorizontalScroll(page)).toBe(false);
      await tab(page, 'Kits').click();
      await expect(page.locator('a.card.kit').first()).toBeVisible();
      expect(await hasHorizontalScroll(page)).toBe(false);
    });
  });
}

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the library has no sideways scroll; tabs and filters can be used, and a menu stays inside the window', async ({ page }) => {
    await openRoute(page, '/browse');
    expect(await hasHorizontalScroll(page)).toBe(false);
    await expect(box(page)).toBeVisible();
    const all = await results(page).count();

    // every filter's menu opens inside the window, with choices big enough for a thumb
    expect(new Set(await page.locator('.lib-filters .filter-btn').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)))).size, 'the filters are one row').toBe(1);
    for (const name of ['Kit', 'Game type', 'Theme', 'Type', 'More']) {
      await openFilter(page, name);
      const menu = await filter(page, name).getByRole('menu').boundingBox();
      expect(menu.x, name).toBeGreaterThanOrEqual(0);
      expect(menu.x + menu.width, name).toBeLessThanOrEqual(390);
      expect((await filter(page, name).getByRole('menuitemradio').first().boundingBox()).height).toBeGreaterThanOrEqual(32);
      expect(await hasHorizontalScroll(page), name).toBe(false);
      await page.keyboard.press('Escape');
    }
    await tab(page, 'Sounds').click();
    await expect.poll(() => results(page).count()).toBeLessThan(all);
    await pick(page, 'Theme', labelFor('themes', ofKind('sound')[0].themes[0]));
    await expect(page.locator('.lib-filters .token')).toHaveCount(1);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.locator('.lib-filters .token .x').click();

    // cards fit two to a row
    await tab(page, 'All').click();
    const boxes = await page.locator('ul.results > li').evaluateAll((lis) => lis.slice(0, 2).map((li) => { const r = li.getBoundingClientRect(); return [r.left, r.right, r.top]; }));
    expect(boxes[0][2]).toBe(boxes[1][2]);
    expect(boxes[1][1]).toBeLessThanOrEqual(390);
    // the + and the play button are big enough to press
    for (const sel of ['.card-add', '.vdot', '.lib-layout button']) { const b = await page.locator(sel).first().boundingBox(); expect(b.height, sel).toBeGreaterThanOrEqual(28); expect(b.width, sel).toBeGreaterThanOrEqual(24); }

    // the list and the kits fit too
    await page.getByRole('button', { name: 'List with more facts' }).click();
    await expect(page.locator('ul.results .card.row').first()).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    await tab(page, 'Kits').click();
    await expect(page.locator('a.card.kit').first()).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test('a long run of text with no spaces does not push the page sideways', async ({ page }) => {
    await openRoute(page, '/browse');
    const long = 'supercalifragilisticexpialidocious'.repeat(9);       // 306 characters, no spaces
    await box(page).fill(long);
    await expect(line(page)).toContainText('Nothing matches');
    await expect(line(page)).toHaveText(`Nothing matches "${long.slice(0, 40)}…"`);
    expect(await hasHorizontalScroll(page)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // the same when it does match something and a filter is on
    await box(page).fill('coin' + 'x'.repeat(100));
    expect(await hasHorizontalScroll(page)).toBe(false);
    await openRoute(page, `/browse?q=${'w'.repeat(120)}&kind=sound&view=side`);
    await expect(line(page)).toContainText('Nothing matches');
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
