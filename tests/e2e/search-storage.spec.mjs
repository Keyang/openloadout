// Search when the browser blocks storage (a private window, or site data switched off): the index file is
// opened in memory, so search must reach its keywords level with nothing logged as an error.
// Also everyday words on the real site. Run with: npx playwright test tests/e2e/search-storage.spec.mjs
import { test, expect } from '../helpers/test.mjs';

// What a browser does when it refuses storage: reading localStorage or sessionStorage throws.
// Defined the way a page script would, not configurable, so nothing can quietly put it back.
const blockStorage = () => {
  for (const k of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(window, k, { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
  }
};

async function watchConsole(page) {
  const seen = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') seen.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
  return seen;
}

for (const blocked of [true, false]) {
  test(`search reaches the keywords level with no console errors or warnings (storage ${blocked ? 'blocked' : 'allowed'})`, async ({ page }) => {
    if (blocked) await page.addInitScript(blockStorage);
    const seen = await watchConsole(page);
    await page.goto('/index.html#/');
    const result = await page.evaluate(async () => {
      const { createSearch } = await import('/search/client.js');
      const catalog = await (await fetch('/generated/catalog.json')).json();
      const s = await createSearch({ catalog, dbUrl: '/generated/search.sqlite', vendorBase: '/vendor/' });
      const reached = await s.whenLevel('keywords');
      const status = s.status;
      const name = catalog.assets[0].name;
      const found = (await s.search(name, { limit: 5 })).map((r) => r.id);
      s.close();
      return { reached, keywords: status.keywords, error: status.error, found, first: catalog.assets[0].id };
    });
    expect(result.error).toBeNull();
    expect(result.reached).toBe(true);
    expect(result.keywords).toBe('ready');
    expect(result.found).toContain(result.first);
    expect(seen).toEqual([]);
  });
}

test('with storage blocked the search page shows results and logs nothing', async ({ page }) => {
  await page.addInitScript(blockStorage);
  const seen = await watchConsole(page);
  const catalog = await (await page.request.get('/generated/catalog.json')).json();
  const name = catalog.assets.find((a) => a.kind === 'sprite').name;
  await page.goto(`/index.html#/browse?q=${encodeURIComponent(name)}`);
  await expect(page.locator('main a.card', { hasText: name }).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);                 // give the index file time to load (or to fail loudly)
  expect(seen).toEqual([]);
});

test('typing "bad guy" in the search box shows only enemies and bosses', async ({ page }) => {
  const catalog = await (await page.request.get('/generated/catalog.json')).json();
  const hostile = (a) => a.kind === 'sprite' && /^characters\/(enemy|boss)(\/|$)/.test(a.role || '');
  test.skip(!catalog.assets.some(hostile), 'the catalogue has no enemies');
  const byId = new Map(catalog.assets.map((a) => [a.id, a]));
  await page.goto('/index.html#/');
  const box = page.getByRole('searchbox', { name: 'Search' });
  await box.fill('bad guy');
  await page.waitForTimeout(1500);
  // every result card links to its asset page: #/sprite/<id>, #/sound/<id> or #/music/<id>
  const shown = await page.locator('main .card:not(.kit)').evaluateAll((cards) => cards.map((c) => {
    const a = c.matches('a') ? c : c.querySelector('a[href]');
    return a ? decodeURIComponent((a.getAttribute('href').match(/^#\/(?:sprite|sound|music)\/([^?]+)/) || [])[1] || '') : '';
  }).filter(Boolean));
  expect(shown.length).toBeGreaterThan(0);
  const wrong = shown.filter((id) => !byId.has(id) || !hostile(byId.get(id))).map((id) => (byId.get(id) || { name: id }).name);
  expect(wrong).toEqual([]);
});
