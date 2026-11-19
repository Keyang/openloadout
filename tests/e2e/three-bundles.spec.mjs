// Asset bundles for at least three game types (acceptance criterion 1; goal G1 in docs/progress.md).
//
// Which bundles are "the kits": the full game kits, which are the bundles that have a plan in
// bundles/specs/<id>.plan.json. Every bundle so far has level "kit" (the small starter bundles too), so the level
// alone does not single them out; and no kit is named in this file, so a new plan is a new kit under test with no
// change here. Everything else is read from the catalogue the site reads (tests/helpers/kits.mjs has the rules,
// tests/unit/build-kits-helper.test.mjs proves them on made-up catalogues).
//
// Across the kits: there are at least three, for at least three different kinds of game. For each of them: 40 to 50
// sprites, exactly 20 sounds and exactly 2 music tracks; it is in the catalogue as its plan describes it; every
// asset it lists is in the catalogue and opens on its own page without an error; and the kit opens in the
// playground with a character the keyboard moves.
//
// A kit whose bundle file has not been written yet (its assets are still being made) FAILS here, and the failure
// says how to get it into the catalogue; it is never skipped.
// Run with: npx playwright test tests/e2e/three-bundles.spec.mjs
// To check another copy of the project (one with a kit added, say): serve that copy, point a Playwright config's
// baseURL at it, and set LOADOUT_ROOT to its folder.
import path from 'node:path';
import { test, expect as baseExpect, openRoute, waitForDrawn, canvasStats, collectErrors } from '../helpers/test.mjs';
import { ROOT as HERE, readCatalogue, catalogueOf, playReady, playState } from '../helpers/acceptance.mjs';
import { kitsOf, kitProblems, setProblems, sizeProblems, MIN_KITS } from '../helpers/kits.mjs';
import { loadPlans } from '../../tools/lib/assets.mjs';

// Many builders share this machine: anything the page is waited for gets 20 seconds, not the usual 5.
const expect = baseExpect.configure({ timeout: 20_000 });
// ... and a press on something that is not there gives up after 30 seconds instead of holding the whole test.
test.use({ actionTimeout: 30_000 });

const ROOT = process.env.LOADOUT_ROOT ? path.resolve(process.env.LOADOUT_ROOT) : HERE;
/** The kits, from the plans on disk: one test below for each. */
const PLANS = loadPlans(ROOT);
const kitNamed = (catalog, id) => kitsOf(catalog, PLANS).find((k) => k.id === id);

test(`there are at least ${MIN_KITS} kits, for at least ${MIN_KITS} different kinds of game, and each is in the catalogue as its plan describes it`, () => {
  const catalog = readCatalogue(ROOT);
  const kits = kitsOf(catalog, PLANS);
  expect(setProblems(kits), 'the kits as a set').toEqual([]);
  expect(kits.flatMap((k) => kitProblems(k, catalog)), 'each kit against its plan and the catalogue').toEqual([]);
});

for (const { id } of PLANS) {
  test(`${id}: the size of a full kit, every asset in it opens, and the playground has a character the keyboard moves`, async ({ page }) => {
    const catalog = readCatalogue(ROOT);
    const kit = kitNamed(catalog, id);
    // not in the catalogue, not the size of a kit, or not what its plan and the catalogue's assets say: stop here, saying which
    expect(kitProblems(kit, catalog), `${id}: against its plan and the catalogue`).toEqual([]);
    const { bundle } = kit;
    expect(sizeProblems(bundle), `${id}: 40 to 50 sprites, 20 sounds and 2 music tracks`).toEqual([]);
    const { byId } = catalogueOf(catalog);
    test.setTimeout(180_000 + (bundle.sprites.length + bundle.sounds.length + bundle.music.length) * 8000);
    const listed = [...bundle.sprites.map((a) => ['sprite', a]), ...bundle.sounds.map((a) => ['sound', a]), ...bundle.music.map((a) => ['music', a])];

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
        // a sound or a track has its play button (and no picture: no waveforms on its page); a sprite is drawn
        if (kind !== 'sprite') await expect(page.locator('.stage-tools .tools-left button')).toHaveText(/^Play( loop)?$/);
        else await expect.poll(async () => (await canvasStats(page.locator('canvas.stage'))).opaque, { message: `${a} is drawn`, timeout: 20_000 }).toBeGreaterThan(0);
        await expect(page.locator('.rx-panel .add-btn')).toHaveText(/^Add to (my )?bag$/);      // every asset page has it in the editing panel's footer
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
