// Three asset bundles for three game types (acceptance criterion 1; goal G1 in docs/progress.md).
//
// Which bundles are "the three": the full game kits, one per game type. Every bundle so far has level "kit" (the three
// small ones too), so the level alone does not single them out. The rule used here: a full kit is a bundle that has a
// plan in bundles/specs/<id>.plan.json, which today names exactly the three ids in docs/progress.md
// (kit-platformer-fantasy, kit-rpg-fantasy, kit-roguelite-scifi). Its plan says which game type it is for.
//
// For each of them: 40 to 50 sprites, exactly 20 sounds and exactly 2 music tracks; every asset it lists is in the
// catalogue and opens on its own page without an error; and the bundle opens in the playground with a character the
// keyboard moves. Across them: three different game types.
//
// The three bundle files (bundles/<id>.json) are written at the end of production. Until then these tests FAIL, and
// say exactly that; they are never skipped.
// Run with: npx playwright test tests/e2e/three-bundles.spec.mjs
import fs from 'node:fs';
import path from 'node:path';
import { test, expect as baseExpect, openRoute, waitForDrawn, canvasStats, collectErrors } from '../helpers/test.mjs';
import { ROOT, readCatalogue, catalogueOf, playReady, playState } from '../helpers/acceptance.mjs';

// Many builders share this machine: anything the page is waited for gets 20 seconds, not the usual 5.
const expect = baseExpect.configure({ timeout: 20_000 });

const NAMED = ['kit-platformer-fantasy', 'kit-rpg-fantasy', 'kit-roguelite-scifi'];      // docs/progress.md, "Decisions from Keyang"
const SPECS = path.join(ROOT, 'bundles', 'specs');

/** The plans of the full kits: [{ id, gameType, view }] from bundles/specs/*.plan.json. */
function plans() {
  if (!fs.existsSync(SPECS)) return [];
  return fs.readdirSync(SPECS).filter((f) => f.endsWith('.plan.json')).sort().map((f) => {
    const plan = JSON.parse(fs.readFileSync(path.join(SPECS, f), 'utf8'));
    return { id: plan.id ?? f.replace(/\.plan\.json$/, ''), gameType: plan.gameType ?? null, view: plan.view ?? null };
  });
}
const PLANS = plans();
/** The ids of the three kits: the planned ones, or the three named ones if the plans have been tidied away. */
const KITS = PLANS.length ? PLANS.map((p) => p.id) : NAMED;
const planOf = (id) => PLANS.find((p) => p.id === id) ?? null;

/** The bundle in today's catalogue, or a failure that says why it is not there. */
function kitBundle(catalog, id) {
  const bundle = catalog.bundles.find((b) => b.id === id);
  if (bundle) return bundle;
  const file = path.join('bundles', `${id}.json`);
  const there = catalog.bundles.map((b) => b.id).join(', ') || 'none';
  if (!fs.existsSync(path.join(ROOT, file))) {
    throw new Error(`The bundle file ${file} does not exist yet. The three kit bundle files (${KITS.map((k) => `bundles/${k}.json`).join(', ')}) are created at the end of production, `
      + `so the catalogue cannot list "${id}" (bundles in generated/catalog.json today: ${there}). This test passes once that file exists and "npm run build" has run.`);
  }
  throw new Error(`${file} exists, but generated/catalog.json does not list the bundle "${id}" (it lists: ${there}). Run "npm run build" so the catalogue takes it in.`);
}

test('the three kits are the planned ones: one each for three different game types', () => {
  expect(KITS.slice().sort(), 'the kits that have a plan in bundles/specs/ are the three named in docs/progress.md').toEqual(NAMED.slice().sort());
  const catalog = readCatalogue();
  const kits = KITS.map((id) => kitBundle(catalog, id));
  const types = kits.map((b) => b.gameType);
  expect(new Set(types).size, `three different game types (they are: ${types.join(', ')})`).toBe(3);
  for (const b of kits) {
    expect(b.gameType, `${b.id} is for one kind of game`).not.toBe('any');
    if (planOf(b.id)?.gameType) expect(b.gameType, `${b.id} is for the game type its plan says`).toBe(planOf(b.id).gameType);
    expect(b.level, `${b.id} is a game kit`).toBe('kit');
  }
});

for (const id of KITS) {
  test(`${id}: 40 to 50 sprites, 20 sounds and 2 tracks, every one of them opens, and the playground has a character the keyboard moves`, async ({ page }) => {
    const catalog = readCatalogue();
    const bundle = kitBundle(catalog, id);
    const { byId } = catalogueOf(catalog);
    test.setTimeout(180_000 + (bundle.sprites.length + bundle.sounds.length + bundle.music.length) * 8000);

    // ---- what is in it
    expect(bundle.sprites.length, `${id}: sprites`).toBeGreaterThanOrEqual(40);
    expect(bundle.sprites.length, `${id}: sprites`).toBeLessThanOrEqual(50);
    expect(bundle.sounds.length, `${id}: sounds`).toBe(20);
    expect(bundle.music.length, `${id}: music tracks`).toBe(2);
    const listed = [...bundle.sprites.map((a) => ['sprite', a]), ...bundle.sounds.map((a) => ['sound', a]), ...bundle.music.map((a) => ['music', a])];
    const ids = listed.map(([, a]) => a);
    expect(ids.filter((a, i) => ids.indexOf(a) !== i), `${id}: assets listed twice`).toEqual([]);
    const wrong = listed.filter(([kind, a]) => byId[a]?.kind !== kind).map(([kind, a]) => `${a} (listed as a ${kind}; ${byId[a] ? `the catalogue has it as a ${byId[a].kind}` : 'not in the catalogue'})`);
    expect(wrong, `${id}: listed assets that the catalogue does not have`).toEqual([]);
    for (const [, a] of listed) expect(byId[a].bundles, `${a} says it is in ${id}`).toContain(id);

    // ---- every asset opens on its own page, and nothing goes wrong there
    const watch = collectErrors(page);
    const broken = [];
    for (const [kind, a] of listed) {
      const row = byId[a];
      const problems = [];
      try {
        await openRoute(page, `/${kind}/${a}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(row.name, { timeout: 20_000 });
        await waitForDrawn(page);
        if (kind === 'music') await expect(page.locator('.stage-tools .tools-left button')).toHaveText('Play');
        else await expect.poll(async () => (await canvasStats(page.locator('canvas.stage'))).opaque, { message: `${a} is drawn`, timeout: 20_000 }).toBeGreaterThan(0);
        await expect(page.locator('.add-to-bag button')).toHaveText('Add to bag');
      } catch (e) { problems.push(String(e.message).split('\n')[0]); }
      problems.push(...watch.errors.splice(0));
      if (problems.length) broken.push(`${kind} ${a}: ${problems.join(' | ')}`);
    }
    expect(broken, `${id}: assets whose page did not open cleanly`).toEqual([]);

    // ---- the whole kit in the playground: a character to play, moved with the keyboard
    await openRoute(page, `/bundle/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(bundle.name);
    await page.getByRole('button', { name: 'Try it in the playground' }).click();
    await playReady(page, 180_000);
    const scene = page.locator('canvas.play-stage');
    await expect(scene).toBeVisible();
    await page.getByRole('button', { name: 'Mute', exact: true }).click();      // the music would start on the first key press; it is not what is tested here
    const start = await playState(page);
    expect(start.player, `${id}: the playground has a character to play`).toBeTruthy();
    expect(bundle.sprites, 'the character is one of the kit\'s sprites').toContain(start.player.id);
    expect(byId[start.player.id].role, `${start.player.id} is a player character`).toBe('characters/player');
    expect(start.mode, 'the scene is seen the way the character is drawn').toBe(byId[start.player.id].view === 'top-down' ? 'top' : 'side');
    await expect.poll(async () => { const s = await canvasStats(scene); return s.opaque === s.width * s.height; }, { message: 'the whole scene is painted', timeout: 30_000 }).toBe(true);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await playState(page)).player.x, { message: 'the right arrow key walks the character to the right', timeout: 30_000 }).toBeGreaterThan(start.player.x + 4);
    await page.keyboard.up('ArrowRight');
    if (start.mode === 'top') {
      const y = (await playState(page)).player.y;
      await page.keyboard.down('ArrowDown');
      await expect.poll(async () => (await playState(page)).player.y, { message: 'the down arrow key walks the character down', timeout: 30_000 }).toBeGreaterThan(y + 4);
      await page.keyboard.up('ArrowDown');
    }
    await page.getByRole('button', { name: 'Unmute', exact: true }).click();
    expect(watch.errors, 'errors in the playground').toEqual([]);
  });
}
