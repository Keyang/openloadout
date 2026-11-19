// Studio item F1: sprites/rogue-battler.js and sprites/road-bandit.js are studio library files (data). On the site they
// are the sprites they were: the same parts in the Parts tab with their own settings, a part's settings hidden when
// it is taken off, an old link opening the same settings, and window.loadout.render drawing it (a data sprite is not
// one made on this visit, so it is drawn on the page). The `test` of the helpers fails on any console error.
import { test, expect, openRoute, canvasGroupStats, openTab, partBlock } from '../helpers/test.mjs';

const strip = (page) => page.locator('.strip .cell canvas');
const slider = (scope, name) => scope.getByRole('slider', { name, exact: true });

for (const [id, parts, weapon, other] of [['rogue-battler', ['Weapon', 'Headgear', 'Scarf'], 'Daggers', 'Claws'], ['road-bandit', ['Weapon', 'Headgear', 'Pack'], 'Club', 'Cutlass']]) {
  test.describe(`converted ${id}`, () => {
    test('draws, lists its parts with their own settings, and hides a part\'s settings when it is taken off', async ({ page }) => {
      await openRoute(page, `/sprite/${id}`);
      const st = await canvasGroupStats(strip(page));
      expect(st.opaque).toBeGreaterThan(20);
      await openTab(page, 'parts');
      for (const name of parts) await expect(partBlock(page, name)).toBeVisible();
      const w = partBlock(page, 'Weapon');
      await expect(w.getByRole('group', { name: 'Weapon' }).getByRole('button', { name: weapon })).toHaveAttribute('aria-pressed', 'true');
      for (const name of ['Length', 'Hold angle']) await expect(slider(w, name)).toBeVisible();
      const before = (await canvasGroupStats(strip(page))).hash;
      await w.getByRole('button', { name: 'None' }).click();
      for (const name of ['Length', 'Hold angle']) await expect(slider(w, name)).toBeHidden();
      expect((await canvasGroupStats(strip(page))).hash).not.toBe(before);
      await w.getByRole('button', { name: other }).click();
      for (const name of ['Length', 'Hold angle']) await expect(slider(w, name)).toBeVisible();
    });

    test('window.loadout.render draws it, plain and with a look (review F1, issue 1; how a look recolours it is checked in tests/unit/conversion-f1.test.mjs)', async ({ page }) => {
      await openRoute(page, '/');
      const r = await page.evaluate(async (id) => {
        const L = window.loadout;
        const keep = (x) => ({ ok: x.ok, errors: x.errors, opaque: x.opaque, png: x.png });
        return { plain: keep(await L.render(id, { clip: 'idle', frame: 0 })), look: keep(await L.render(id, { clip: 'idle', frame: 0, look: { colour: { hue: 120 } } })), knight: keep(await L.render('knight', { clip: 'idle', frame: 0 })) };
      }, id);
      expect(r.knight.ok).toBe(true);
      expect(r.plain).toMatchObject({ ok: true });
      expect(r.look).toMatchObject({ ok: true });
      expect(r.plain.opaque).toBeGreaterThan(100);
      expect(r.look.png).not.toBe(r.plain.png);
    });

    test('an address made for the code file opens the same settings', async ({ page }) => {
      await openRoute(page, `/sprite/${id}?weapon=${encodeURIComponent(other.toLowerCase())}&headgear=none&weaponLength=1.2`);
      await openTab(page, 'parts');
      const w = partBlock(page, 'Weapon');
      await expect(w.getByRole('group', { name: 'Weapon' }).getByRole('button', { name: other })).toHaveAttribute('aria-pressed', 'true');
      await expect(slider(w, 'Length')).toHaveValue('1.2');
      await expect(partBlock(page, 'Headgear').getByRole('group', { name: 'Headgear' }).getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
}
