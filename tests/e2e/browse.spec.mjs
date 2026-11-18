// Finding things (W2-A; features FIND-2 to FIND-7): the site starts from the catalogue, cards cost nothing
// until looked at, and the home page and #/browse search and filter everything.
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
let CATALOG = null, BIG = null, SMART_MB = 0, PICK = null;

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
const group = (page, name) => page.getByRole('group', { name, exact: true });
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** One choice in a filter, by its whole label (a button reads "Label 12"). */
const option = (page, groupName, label) => group(page, groupName).getByRole('button', { name: new RegExp(`^${literal(label)} \\d+$`) });
/** Press "Show N more" in a filter when its list is cut short. */
async function showAll(page, groupName) {
  const more = group(page, groupName).getByRole('button', { name: /^Show \d+ more$/ });
  if (await more.count()) await more.click();
}
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
async function openStandIn(page, route = '/') {
  await page.goto(`/index.html?catalog=${STAND_IN}#${route}`, { waitUntil: 'domcontentloaded' });
  await waitForDrawn(page);
  await expect(results(page).first()).toBeAttached();
}
const countOf = async (button) => Number((await button.locator('.n').textContent()).trim());
const chip = (page, label) => page.locator('.chips .chip').filter({ hasText: label });
const bagCount = (page) => page.locator('header .bag-count');
const hash = (page) => page.evaluate(() => location.hash);
const pathOf = (url) => new URL(url).pathname;

// ---- start-up ----------------------------------------------------------------------------

test('home loads from the catalogue: no errors, and no sprite program is requested', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await openRoute(page, '/');
  await expect(results(page)).toHaveCount(CATALOG.assets.length);
  await expect(page.locator('ul.results .card').first()).toBeVisible();
  // the first thumbnails have arrived
  await expect.poll(() => page.locator('ul.results img.thumb').first().evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await page.waitForLoadState('networkidle');
  expect(asked.filter((p) => p.startsWith('/sprites/')), 'files under sprites/').toEqual([]);
  expect(asked.filter((p) => p.startsWith('/kits/')), 'files under kits/').toEqual([]);
  expect(asked.filter((p) => /^\/sounds\/.+\.json$/.test(p)), 'one request per sound').toEqual([]);
  expect(asked).toContain('/generated/catalog.json');
  expect(asked.filter((p) => p === '/generated/sounds.json').length).toBeLessThanOrEqual(1);
});

test('home shows the search first, then game kits, then everything', async ({ page }) => {
  await openRoute(page, '/');
  await expect(page.locator('h1')).toBeVisible();
  const search = box(page);
  await expect(search).toBeVisible();
  const examples = page.getByRole('group', { name: 'Example searches' }).getByRole('button');
  expect(await examples.count()).toBeGreaterThanOrEqual(3);
  const kitsHeading = page.getByRole('heading', { name: 'Start from a kind of game' });
  await expect(kitsHeading).toBeVisible();
  const kits = CATALOG.bundles.filter((b) => b.level === 'kit');
  await expect(page.locator('a.card.kit')).toHaveCount(kits.length);
  for (const b of kits) await expect(page.locator(`a.card.kit[href="#/bundle/${b.id}"]`)).toContainText(b.name);
  // top to bottom: search, kits, results
  const y = async (loc) => (await loc.boundingBox()).y;
  expect(await y(search)).toBeLessThan(await y(kitsHeading));
  expect(await y(kitsHeading)).toBeLessThan(await y(line(page)));
  await expect(line(page)).toHaveText(`${CATALOG.assets.length} results`);

  // an example search fills the box and narrows the results
  await examples.first().click();
  await expect(search).not.toHaveValue('');
  await expect.poll(() => results(page).count()).toBeLessThan(CATALOG.assets.length);
  expect(await results(page).count()).toBeGreaterThanOrEqual(1);
});

plain('a site that cannot load its list of assets says so to the visitor, in plain words', async ({ page }) => {
  await quietNetwork(page);
  await page.route('**/generated/catalog.json', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  const said = [];
  page.on('console', (m) => said.push(m.text()));
  await page.goto('/index.html#/');
  // the page speaks to a visitor; the hint for whoever runs the site is in the console only
  await expect(page.locator('main')).toContainText('This page could not load its list of assets. Please try again later.');
  await expect(page.locator('main')).not.toContainText(/npm|build|catalog/i);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(said.some((t) => t.includes('npm run build'))).toBe(true);
});

// ---- search ------------------------------------------------------------------------------

test('typing "money" puts the coin sprite and the coin pickup sound at the top (known set)', async ({ page }) => {
  await openStandIn(page, '/');
  await box(page).pressSequentially('money', { delay: 20 });
  await expect.poll(() => results(page).count()).toBeLessThan(BIG.assets.length);
  const top = (await resultIds(page)).slice(0, 4);
  expect(top).toContain('coin');
  expect(top).toContain('coin-pickup');
  await expect(line(page)).toContainText('for "money"');
  // both kinds of card are there to press
  await expect(page.locator('ul.results a.card[href="#/sprite/coin"]')).toBeVisible();
  await expect(page.locator('ul.results .card.sound a[href="#/sound/coin-pickup"]')).toBeVisible();
});

test('a misspelling still finds the Hero (known set)', async ({ page }) => {
  await openStandIn(page, '/browse');
  await box(page).fill('herro');
  await expect.poll(async () => (await resultIds(page)).slice(0, 3)).toContain('knight');
  await box(page).fill('knigt');
  await expect.poll(async () => (await resultIds(page))[0]).toBe('knight');
  await expect(page.locator('ul.results a.card[href="#/sprite/knight"]')).toContainText(BIG.assets.find((a) => a.id === 'knight').name);
});

test('typing an asset\'s name or one of its words finds it, whatever kind it is and wherever it sits in the library', async ({ page }) => {
  await openRoute(page, '/');
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

test('Back from a search started on the front page returns to the front page as it was', async ({ page }) => {
  await openRoute(page, '/bundles');
  await page.locator('a.brand').click();
  await waitForDrawn(page);
  const all = await results(page).count();
  await expect(page.getByRole('heading', { name: 'Start from a kind of game' })).toBeVisible();

  const word = PICK.word(PICK.sound);
  await box(page).pressSequentially(word, { delay: 10 });
  await expect.poll(() => hash(page)).toBe(`#/browse?q=${word}`);
  await option(page, 'Kind', 'Sounds').click();
  await expect.poll(() => hash(page)).toBe(`#/browse?q=${word}&kind=sound`);
  await expect(page.getByRole('heading', { name: 'Start from a kind of game' })).toBeHidden();

  await page.goBack();                                   // one step back, however much was typed and filtered
  await expect.poll(() => hash(page)).toBe('#/');
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Start from a kind of game' })).toBeVisible();
  await expect(results(page)).toHaveCount(all);
  await expect(page.locator('.chips .chip')).toHaveCount(0);

  await page.goBack();                                   // and the page before the front page is still there
  await expect.poll(() => hash(page)).toBe('#/bundles');
  await page.goForward();
  await page.goForward();                                // forward again: the search, on the results page
  await expect.poll(() => hash(page)).toBe(`#/browse?q=${word}&kind=sound`);
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue(word);
  await expect(option(page, 'Kind', 'Sounds')).toHaveAttribute('aria-pressed', 'true');
});

test('a keyboard user can skip the choices and go straight to the results', async ({ page }) => {
  await openRoute(page, '/browse');
  const skip = page.getByRole('button', { name: 'Skip to results' });
  await box(page).focus();
  // after the search box and its switch, the next stop is the skip link, before any filter choice
  await page.keyboard.press('Tab');
  if (SMART_MB) {            // the switch is only there when this build of the site has smarter search
    await expect(page.getByRole('switch', { name: 'Smarter search' })).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  const firstChoice = await option(page, 'Kind', 'Sprites').boundingBox();
  expect((await skip.boundingBox()).y).toBeLessThan(firstChoice.y);
  await page.keyboard.press('Enter');
  const inResults = await page.evaluate(() => !!document.activeElement.closest('ul.results'));
  expect(inResults).toBe(true);
  await expect(page.locator('ul.results > li').first().locator('a, button').first()).toBeFocused();
});

// ---- filters -----------------------------------------------------------------------------

test('choosing a kind and a type narrows the results, and the numbers next to the choices follow', async ({ page }) => {
  await openRoute(page, '/browse');
  const total = CATALOG.assets.length;
  const sounds = CATALOG.assets.filter((a) => a.kind === 'sound');
  const ofType = sounds.filter((a) => a.type === PICK.soundType);
  await expect(results(page)).toHaveCount(total);
  expect(await countOf(option(page, 'Kind', 'Sounds'))).toBe(sounds.length);
  expect(await countOf(option(page, 'Kind', 'Sprites'))).toBe(CATALOG.assets.filter((a) => a.kind === 'sprite').length);

  await option(page, 'Kind', 'Sounds').click();
  await expect(option(page, 'Kind', 'Sounds')).toHaveAttribute('aria-pressed', 'true');
  await expect(results(page)).toHaveCount(sounds.length);
  await expect(line(page)).toHaveText(`${sounds.length} results`);
  // the types on offer are now only the ones sounds have
  await showAll(page, 'Type');
  const offered = await group(page, 'Type').locator('.fopt .fl').allTextContents();
  expect([...offered].sort()).toEqual([...PICK.soundTypeLabels].sort());
  for (const label of PICK.spriteTypeLabels.filter((l) => !PICK.soundTypeLabels.includes(l))) await expect(option(page, 'Type', label)).toHaveCount(0);

  await option(page, 'Type', PICK.soundTypeLabel).click();
  await expect(results(page)).toHaveCount(ofType.length);
  expect((await resultIds(page)).sort()).toEqual(ofType.map((a) => a.id).sort());
  // other groups count what is left: every number is at most the results there are
  for (const n of await group(page, 'Theme').locator('.fopt .n').allTextContents()) expect(Number(n)).toBeLessThanOrEqual(ofType.length);
  // a kind's own number does not shrink because of the kind filter itself, but it does follow the type
  expect(await countOf(option(page, 'Kind', 'Sounds'))).toBe(ofType.length);

  // pressing a chosen value again lets go of it
  await option(page, 'Type', PICK.soundTypeLabel).click();
  await expect(results(page)).toHaveCount(sounds.length);
  await chip(page, 'Sounds').getByRole('button').click();
  await expect(results(page)).toHaveCount(total);
});

test('the "used for" tree opens a branch and narrows to one use', async ({ page }) => {
  await openRoute(page, '/browse');
  const inBranch = CATALOG.assets.filter((a) => a.role.startsWith(PICK.branch + '/'));
  const inLeaf = inBranch.filter((a) => a.role === PICK.leaf);
  await option(page, 'Used for', PICK.branchLabel).click();
  await expect(results(page)).toHaveCount(inBranch.length);
  // sprites and sounds with the same use sit together
  const kinds = await results(page).evaluateAll((lis) => [...new Set(lis.map((li) => li.dataset.kind))].sort());
  expect(kinds).toEqual(PICK.branchKinds);
  await option(page, 'Used for', PICK.leafLabel).click();
  await expect(results(page)).toHaveCount(inLeaf.length);
  expect(await hash(page)).toContain(`role=${encodeURIComponent(PICK.leaf)}`);
});

test('the address bar holds the search and filters, so a reload or a copied link shows the same results', async ({ page }) => {
  await openRoute(page, '/');
  const word = PICK.word(PICK.sound);
  await box(page).fill(word);
  await option(page, 'Kind', 'Sounds').click();
  await expect.poll(() => hash(page)).toBe(`#/browse?q=${word}&kind=sound`);
  const before = await resultIds(page);
  expect(before).toContain(PICK.sound.id);

  await reload(page);
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue(word);
  await expect(option(page, 'Kind', 'Sounds')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => resultIds(page)).toEqual(before);

  // a link written by hand works too
  await openRoute(page, `/browse?kind=sprite&theme=${PICK.theme}`);
  const want = CATALOG.assets.filter((a) => a.kind === 'sprite' && a.themes.includes(PICK.theme)).map((a) => a.id);
  await expect.poll(async () => (await resultIds(page)).sort()).toEqual(want.sort());
  await expect(chip(page, PICK.themeLabel)).toBeVisible();
});

test('old addresses still work', async ({ page }) => {
  await openRoute(page, '/sprites');
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sprite');
  await expect(results(page)).toHaveCount(CATALOG.assets.filter((a) => a.kind === 'sprite').length);
  await openRoute(page, '/sounds');
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sound');
  await openRoute(page, `/${PICK.sprite.id}`);            // a sprite's address from before sounds were added
  await expect(page.locator('canvas.stage')).toBeVisible();
  await expect(page.locator('h1')).toHaveText(PICK.sprite.name);
});

// ---- the style filter that stays --------------------------------------------------------------

test('a style chosen on the home page stays after visiting a sprite page, and can be removed', async ({ page }) => {
  test.skip(!PICK.otherView, 'every sprite in the catalogue has the same view, so a view cannot narrow anything');
  await openRoute(page, '/');
  const all = await results(page).count();
  expect(all).toBe(CATALOG.assets.length);
  const V = PICK.viewLabel, other = PICK.otherViewLabel;
  // what choosing a view hides: sprites that have a different view (things with no view always stay)
  const hidden = CATALOG.assets.filter((a) => a.view && a.view !== 'none' && a.view !== PICK.view);
  const aSound = CATALOG.assets.find((a) => a.kind === 'sound');

  // the number next to a view is the number of results choosing it gives: its sprites and everything that has no view
  await expect(group(page, 'View')).toContainText('Sounds and music have no view, so they always stay.');
  const promised = {};
  for (const label of [V, other]) promised[label] = await countOf(option(page, 'View', label));
  expect(promised[V]).toBe(all - hidden.length);
  await option(page, 'View', other).click();
  await expect(results(page)).toHaveCount(promised[other]);
  expect(await countOf(option(page, 'View', other))).toBe(promised[other]);
  await option(page, 'View', V).click();
  await expect(results(page)).toHaveCount(promised[V]);
  expect(await countOf(option(page, 'View', V))).toBe(promised[V]);
  await expect(chip(page, V)).toBeVisible();
  // a remembered style hides some assets, so the heading no longer says "Everything"
  await expect(page.getByRole('heading', { name: 'Everything that fits your game' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Everything', exact: true })).toHaveCount(0);
  // sounds have no view, so they stay
  expect((await resultIds(page))).toContain(aSound.id);
  expect((await resultIds(page))).not.toContain(hidden[0].id);

  // go and look at a sprite, then come back to the front page
  await (await place(page, PICK.viewSprite.id)).locator('a.card').click();
  await expect(page.locator('canvas.stage')).toBeVisible();
  await page.locator('a.brand').click();
  await waitForDrawn(page);
  await expect(chip(page, V)).toBeVisible();
  await expect(option(page, 'View', V)).toHaveAttribute('aria-pressed', 'true');
  await expect(results(page)).toHaveCount(all - hidden.length);

  // it is also there on the results page and after a reload (a later visit)
  await openRoute(page, '/browse?kind=sprite');
  await expect(chip(page, V)).toBeVisible();
  expect(await resultIds(page)).not.toContain(hidden[0].id);
  await reload(page);
  await waitForDrawn(page);
  await expect(chip(page, V)).toBeVisible();

  // removing the chip brings the other views back, and it stays removed
  await chip(page, V).getByRole('button').click();
  await expect(chip(page, V)).toHaveCount(0);
  expect(await resultIds(page)).toContain(hidden[0].id);
  await openRoute(page, '/');
  await expect(results(page)).toHaveCount(all);
  await expect(page.locator('.chips .chip')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Everything', exact: true })).toBeVisible();
});

test('the numbers next to the views follow a search and the other filters', async ({ page }) => {
  await openRoute(page, `/browse?q=${PICK.word(PICK.viewSprite)}`);      // a word that finds at least one sprite with a view
  const views = group(page, 'View').locator('.fopt');
  expect(await views.count()).toBeGreaterThanOrEqual(1);
  for (const label of await views.locator('.fl').allTextContents()) {
    const promised = await countOf(option(page, 'View', label));
    await option(page, 'View', label).click();
    await expect(results(page), label).toHaveCount(promised);
    await option(page, 'View', label).click();
  }
  // with only sounds showing no view is on offer: nothing a view could narrow
  await box(page).fill('');
  await option(page, 'Kind', 'Sounds').click();
  await expect(group(page, 'View')).toHaveCount(0);
});

test('a game type is kept the same way', async ({ page }) => {
  await openRoute(page, '/browse');
  const fits = CATALOG.assets.filter((a) => a.gameTypes.includes(PICK.gameType));
  await showAll(page, 'Game type');          // long lists show their first few choices; the rest are one press away
  await option(page, 'Game type', PICK.gameTypeLabel).click();
  await expect(results(page)).toHaveCount(fits.length);
  await openRoute(page, '/bag');
  await openRoute(page, '/');
  await expect(chip(page, PICK.gameTypeLabel)).toBeVisible();
  await expect(results(page)).toHaveCount(fits.length);
});

// ---- cards -------------------------------------------------------------------------------

test('pressing a sound card plays it, loading just that sound', async ({ page }) => {
  const long = PICK.longSound;               // long enough to still be playing when the test looks
  await openRoute(page, `/browse?q=${encodeURIComponent(long.name)}&kind=sound`);
  const card = await place(page, long.id);
  const play = card.getByRole('button', { name: `Play ${long.name}`, exact: true });
  await expect(play).toBeVisible();
  // the waveform picture is the catalogue's thumbnail, on a light tile
  await expect.poll(() => card.locator('img.thumb').evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
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
});

test('pressing a music card plays the track and pressing again stops it', async ({ page }) => {
  const track = PICK.track;
  await openRoute(page, '/browse?kind=music');
  const card = await place(page, track.id);
  await card.getByRole('button', { name: `Play ${track.name}`, exact: true }).click();
  const stop = card.getByRole('button', { name: `Stop ${track.name}`, exact: true });
  await expect(stop).toBeVisible({ timeout: 30_000 });
  await stop.click();
  await expect(card.getByRole('button', { name: `Play ${track.name}`, exact: true })).toBeVisible();
});

test('hovering a sprite card plays its animation from the strip picture; nothing is drawn by a sprite program', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  const sprite = PICK.sprite;                 // an animated sprite, wherever it sits in the list
  await openRoute(page, '/browse?kind=sprite');
  const card = await place(page, sprite.id);
  await expect(card.locator('img.thumb')).toBeVisible();
  await expect(card.locator('canvas.anim')).toBeHidden();
  await card.locator('a.card').hover();
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
  const thumb = await card.locator('img.thumb').evaluate((img) => getComputedStyle(img).imageRendering);
  expect(thumb).toMatch(/pixelated|crisp-edges/);
  // moving away puts the still picture back
  await line(page).hover();
  await expect(cv).toBeHidden();
  await expect(card.locator('img.thumb')).toBeVisible();
  // keyboard focus animates it too
  await card.locator('a.card').focus();
  await expect(cv).toBeVisible();
  expect(asked.filter((p) => p.startsWith('/sprites/'))).toEqual([]);
  expect(asked).toContain(`/${sprite.strip}`);
});

test('"Add to my bag" on a card raises the bag count in the header', async ({ page }) => {
  await openRoute(page, '/');
  await expect(bagCount(page)).toHaveText('0');
  const { sprite, sound } = PICK;
  // by scrolling to it
  await (await place(page, sprite.id)).getByRole('button', { name: `Add ${sprite.name} to my bag`, exact: true }).click();
  await expect(bagCount(page)).toHaveText('1');
  // and by looking it up
  await (await lookUp(page, sound)).getByRole('button', { name: `Add ${sound.name} to my bag`, exact: true }).click();
  await expect(bagCount(page)).toHaveText('2');
  // each goes in with its standard settings
  const items = await page.evaluate(async () => (await import('/app/bag.js')).bag.items().map((i) => [i.kind, i.id, i.settings]));
  expect(items).toEqual([
    ['sprite', sprite.id, { params: {}, cues: null, scale: 1 }],
    ['sound', sound.id, { params: {}, style: null, seed: 1 }],
  ]);
  // and the bag page shows them
  await openRoute(page, '/bag');
  await expect(page.locator('.bag-item')).toHaveCount(2);
});

test('similar assets can be dropped into any page with one call', async ({ page }) => {
  const id = PICK.sound.id;
  await openRoute(page, `/sound/${id}`);
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
  const hrefs = await section.locator('.card-cell a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const href of hrefs) expect(CATALOG.assets.some((a) => href === `#/${a.kind}/${a.id}`), href).toBe(true);
});

// ---- kits become bundles -----------------------------------------------------------------------

plain('an old #/kit/<id> address lands on the bundle route, and #/kits on the list of bundles', async ({ page }) => {
  await quietNetwork(page);
  const kit = CATALOG.bundles[0], another = CATALOG.bundles.at(-1);       // old kit addresses used the ids bundles have now
  await page.goto(`/index.html#/kit/${kit.id}`);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#/bundle/${kit.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(kit.name);
  await page.goto('/index.html#/kits');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundles');
  for (const b of CATALOG.bundles) await expect(page.locator(`a.card.kit[href="#/bundle/${b.id}"]`)).toContainText(b.name);
  // Back does not bounce through the old address
  await page.locator(`a.card.kit[href="#/bundle/${another.id}"]`).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#/bundle/${another.id}`);
  await page.goBack();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundles');
});

// ---- smarter search is a choice ----------------------------------------------------------------

plain('a site built without smarter search does not offer it', async ({ page }) => {
  plain.skip(SMART_MB > 0, 'this build of the site has smarter search (see the next two tests)');
  await quietNetwork(page);
  const asked = [];
  page.on('request', (r) => asked.push(pathOf(r.url())));
  await page.goto('/index.html#/');
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

  await openRoute(page, '/');
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
  await page.goto('/index.html#/');
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
    await page.goto(`/index.html?catalog=${STAND_IN}#/`, { waitUntil: 'domcontentloaded' });
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

    // filters work at this size too, and their numbers match the catalogue
    await box(page).fill('');
    await option(page, 'Kind', 'Music').click();
    await expect(results(page)).toHaveCount(BIG.assets.filter((a) => a.kind === 'music').length);
    console.log(`[scale] ${BIG.assets.length} stand-in assets: first results at ${Math.round(paint.results)} ms (first paint ${Math.round(paint.fcp ?? 0)} ms); keystroke to painted results: median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
  });
});

test.describe('with the library as it is today', () => {
  for (const [name, route] of [['home', '/'], ['the results page', '/browse']]) {
    test(`${name} paints fast, answers each key fast, and fills in cards when scrolled quickly to the bottom and back`, async ({ page }) => {
      const total = CATALOG.assets.length;
      await page.goto(`/index.html#${route}`, { waitUntil: 'domcontentloaded' });
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
      const wrong = await page.evaluate(() => [...document.querySelectorAll('ul.results > li')].filter((li) => li.querySelectorAll('.card-cell').length > 1
        || (li.querySelector('.card-cell') && !li.querySelector(`a[href$="/${li.dataset.id}"]`))).map((li) => li.dataset.id));
      expect(wrong).toEqual([]);
      const madeAfter = await page.locator('ul.results .card').count();

      // type a word one key at a time
      const { worst, median } = await typeTimed(page, PICK.word(PICK.sound));
      expect(median).toBeLessThan(KEYSTROKE_MS);
      expect(worst).toBeLessThan(SLOWEST_KEY_MS);
      expect(await resultIds(page)).toContain(PICK.sound.id);
      console.log(`[live] ${name}, ${total} assets: first results at ${Math.round(paint.results)} ms (first paint ${Math.round(paint.fcp ?? 0)} ms); ${madeAtFirst} cards made at first, ${madeAfter} after scrolling; jump to the middle filled in ${Math.round(fillMs)} ms; keystroke to painted results: median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
    });
  }
});

// ---- phone -------------------------------------------------------------------------------

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('home and results have no sideways scroll, and the filters can be opened and used', async ({ page }) => {
    await openRoute(page, '/');
    expect(await hasHorizontalScroll(page)).toBe(false);
    await expect(box(page)).toBeVisible();
    const all = await results(page).count();

    // filters are tucked behind one button
    const toggle = page.getByRole('button', { name: /^Narrow down/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(group(page, 'Kind')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(group(page, 'Kind')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    const sounds = option(page, 'Kind', 'Sounds');
    const size = await sounds.boundingBox();
    expect(size.height).toBeGreaterThanOrEqual(32);     // big enough for a thumb
    await sounds.click();
    await expect.poll(() => results(page).count()).toBeLessThan(all);
    await expect(chip(page, 'Sounds')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);

    // closing the filters leaves the chip, so what is applied stays visible
    await toggle.click();
    await expect(group(page, 'Kind')).toBeHidden();
    await expect(chip(page, 'Sounds')).toBeVisible();
    await expect(toggle).toContainText('1');

    // cards fit two to a row
    await box(page).fill('');
    await chip(page, 'Sounds').getByRole('button').click();
    const boxes = await page.locator('ul.results > li').evaluateAll((lis) => lis.slice(0, 2).map((li) => { const r = li.getBoundingClientRect(); return [r.left, r.right, r.top]; }));
    expect(boxes[0][2]).toBe(boxes[1][2]);
    expect(boxes[1][1]).toBeLessThanOrEqual(375);
  });

  test('a long run of text with no spaces does not push the page sideways', async ({ page }) => {
    await openRoute(page, '/');
    const long = 'supercalifragilisticexpialidocious'.repeat(9);       // 306 characters, no spaces
    await box(page).fill(long);
    await expect(line(page)).toContainText('Nothing matches');
    await expect(line(page)).toHaveText(`Nothing matches "${long.slice(0, 40)}…"`);
    expect(await hasHorizontalScroll(page)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    // the same when it does match something and a filter is on
    await box(page).fill('coin' + 'x'.repeat(100));
    await page.getByRole('button', { name: /^Narrow down/ }).click();
    expect(await hasHorizontalScroll(page)).toBe(false);
    await openRoute(page, `/browse?q=${'w'.repeat(120)}&kind=sound&view=side`);
    await expect(line(page)).toContainText('Nothing matches');
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test('the list of bundles has no sideways scroll', async ({ page }) => {
    await openRoute(page, '/bundles');
    await expect(page.locator('a.card.kit').first()).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
