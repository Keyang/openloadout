// Parts on the sprite page: each part is its own block of controls in the editing panel's Parts tab (app/panel.js),
// apart from the sprite's own controls (Shape, Colours, Motion).
import { test, expect, openRoute, canvasGroupStats, setRange, waitForDrawn, openTab, partBlock, control, downloadButton } from '../helpers/test.mjs';
import { CODE_STANDIN, codeStandInRow, serveCodeStandIn } from '../helpers/code-standin.mjs';

const strip = (page) => page.locator('.strip .cell canvas');
const stripHash = async (page) => (await canvasGroupStats(strip(page))).hash;
const block = partBlock;
const slider = (scope, name) => scope.getByRole('slider', { name, exact: true });
const hashNow = (page) => page.evaluate(() => location.hash);

test.describe('Hero parts', () => {
  test.beforeEach(async ({ page }) => { await openRoute(page, '/sprite/knight'); await openTab(page, 'parts'); });

  test('the Weapon block is in the Parts tab, apart from Shape, and has its own settings in everyday words', async ({ page }) => {
    const weapon = block(page, 'Weapon');
    await expect(weapon).toBeVisible();
    // selector first, then the settings
    await expect(weapon.getByRole('group', { name: 'Weapon' }).getByRole('button', { name: 'Sword' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Length', 'Hold angle', 'Swing']) await expect(slider(weapon, name)).toBeVisible();
    const tabs = (await page.locator('.rx-panel [role="tab"]').allTextContents()).map((t) => t.trim());
    expect(tabs).toEqual(['Shape', 'Parts', 'Colours', 'Motion', 'Sounds', 'Look']);
    const parts = (await page.locator('.rx-panel .part .ctl.is-main .ctl-label').allTextContents()).map((t) => t.trim());
    expect(parts).toEqual(expect.arrayContaining(['Hair', 'Headgear', 'Weapon', 'Cape']));
    // the weapon's controls are in its block, not among the sprite's own
    await expect(page.locator('.rx-panel [data-pane="shape"]').getByRole('group', { name: 'Weapon' })).toHaveCount(0);
    await expect(page.locator('.rx-panel [data-pane="shape"] [data-control="weaponLength"]')).toHaveCount(0);
    await expect(page.locator('.rx-panel')).not.toContainText(/param|socket/i);
  });

  test('choosing None hides the weapon settings, and picking a weapon brings them back', async ({ page }) => {
    const weapon = block(page, 'Weapon');
    const before = await stripHash(page);
    await weapon.getByRole('button', { name: 'None' }).click();
    for (const name of ['Length', 'Hold angle', 'Swing']) await expect(slider(weapon, name)).toBeHidden();
    await expect(weapon.getByRole('button', { name: 'None' })).toBeVisible();
    expect(await stripHash(page)).not.toBe(before);
    // other parts keep their settings
    await expect(block(page, 'Cape').getByRole('slider')).toBeVisible();
    await weapon.getByRole('button', { name: 'Spear' }).click();
    for (const name of ['Length', 'Hold angle', 'Swing']) await expect(slider(weapon, name)).toBeVisible();
  });

  test('moving Hold angle and Length changes the frame strip', async ({ page }) => {
    const weapon = block(page, 'Weapon');
    let last = await stripHash(page);
    for (const name of ['Hold angle', 'Length']) {
      await setRange(slider(weapon, name), 'max');
      const now = await stripHash(page);
      expect(now, name).not.toBe(last);
      last = now;
    }
    // Swing shows in the attack
    await page.getByRole('group', { name: 'Animation' }).getByRole('button', { name: 'Attack' }).click();
    const attack = await stripHash(page);
    await setRange(slider(weapon, 'Swing'), 'min');
    expect(await stripHash(page)).not.toBe(attack);
  });

  test('the address bar round-trips the part settings', async ({ page }) => {
    const weapon = block(page, 'Weapon');
    await weapon.getByRole('button', { name: 'Axe' }).click();
    await setRange(slider(weapon, 'Hold angle'), 'max');
    await setRange(slider(weapon, 'Length'), 'min');
    await setRange(block(page, 'Cape').getByRole('slider'), 'max');
    await expect.poll(() => hashNow(page)).toContain('weaponAngle=');
    const hash = await hashNow(page);
    for (const piece of ['weapon=axe', 'weaponLength=', 'capeLength=']) expect(hash).toContain(piece);
    const mine = await canvasGroupStats(strip(page));
    const angle = await slider(weapon, 'Hold angle').inputValue();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDrawn(page);
    await page.waitForSelector('.strip .cell canvas');
    expect(await hashNow(page)).toBe(hash);
    expect(await canvasGroupStats(strip(page))).toEqual(mine);
    await openTab(page, 'parts');
    await expect(block(page, 'Weapon').getByRole('button', { name: 'Axe' })).toHaveAttribute('aria-pressed', 'true');
    expect(await slider(block(page, 'Weapon'), 'Hold angle').inputValue()).toBe(angle);
  });

  test('a link with the weapon set to none opens with the weapon settings hidden', async ({ page }) => {
    await openRoute(page, '/sprite/knight?weapon=none&clip=attack');
    await openTab(page, 'parts');
    const weapon = block(page, 'Weapon');
    await expect(weapon.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    await expect(slider(weapon, 'Hold angle')).toBeHidden();
    expect((await canvasGroupStats(strip(page))).opaque).toBeGreaterThan(0);
  });

  test('Start over puts the weapon back with its settings, and Surprise me includes part settings', async ({ page }) => {
    const weapon = block(page, 'Weapon');
    const start = await stripHash(page);
    await weapon.getByRole('button', { name: 'None' }).click();
    await expect(slider(weapon, 'Length')).toBeHidden();
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(slider(weapon, 'Length')).toBeVisible();
    await expect.poll(() => stripHash(page)).toBe(start);

    // over a few tries, Surprise me moves at least one weapon setting
    const angle = weapon.locator('#c-weaponAngle');          // by id: a hidden slider has no role to find it by
    const startAngle = await angle.inputValue();
    let moved = false;
    for (let i = 0; i < 6 && !moved; i++) {
      await page.getByRole('button', { name: 'Surprise me' }).click();
      moved = (await angle.inputValue()) !== startAngle;
      // what is shown always matches the selector
      const none = (await weapon.getByRole('button', { name: 'None' }).getAttribute('aria-pressed')) === 'true';
      if (none) await expect(slider(weapon, 'Length')).toBeHidden(); else await expect(slider(weapon, 'Length')).toBeVisible();
    }
    expect(moved).toBe(true);
    await expect.poll(() => hashNow(page)).toContain('weaponAngle=');
  });
});

test.describe('Wizard parts', () => {
  test('the Wizard page shows Staff, Hat and Beard blocks, and the staff has Length and Hold angle', async ({ page }) => {
    await openRoute(page, '/sprite/wizard');
    await openTab(page, 'parts');
    for (const title of ['Staff', 'Hat', 'Beard']) await expect(block(page, title)).toBeVisible();
    const staff = block(page, 'Staff');
    const before = await stripHash(page);
    await setRange(slider(staff, 'Hold angle'), 'max');
    const tilted = await stripHash(page);
    expect(tilted).not.toBe(before);
    await setRange(slider(staff, 'Length'), 'min');
    expect(await stripHash(page)).not.toBe(tilted);
    await expect.poll(() => hashNow(page)).toContain('staffLength=');
  });
});

test.describe('sprites without parts', () => {
  test('the coin page has no part blocks and still shows its controls', async ({ page }) => {
    await openRoute(page, '/sprite/coin');
    await expect(page.locator('.rx-panel .part')).toHaveCount(0);
    await expect(page.locator('.rx-panel [role="tab"][data-tab="parts"]')).toHaveCount(0);
    expect(await page.locator('.rx-panel .ctl').count()).toBeGreaterThanOrEqual(1);
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('the Hero page with part blocks has no sideways scroll', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await page.waitForSelector('canvas.stage');
    await openTab(page, 'parts');
    await expect(block(page, 'Weapon')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  });
});

// ---- controls and sounds that only apply sometimes (`when`) ---------------------------------------

// A small data sprite served under an id no library sprite uses (tests/helpers/code-standin.mjs standInDef: the site loads no code
// sprites any more), so these tests do not depend on what any real sprite declares. Its controls: Size; Emblem (plain, star,
// heart); Emblem colour (with an emblem); Glow, Glow size and Metal (with a glow); Rim (on a star) and Rim width (with a rim).
const WHEN_ROW = codeStandInRow({ clips: [{ name: 'idle', frames: 4, fps: 6 }, { name: 'flip', frames: 4, fps: 8 }], controls: 8 });
const field = control;
/** Is the control offered at all, whichever tab is open? (A control that is not in effect is `hidden`.) */
const offered = (page, key, yes) => expect(field(page, key)).toHaveJSProperty('hidden', !yes);
const coloursTab = (page) => page.getByRole('tab', { name: 'Colours' });

test.describe('controls that only matter sometimes', () => {
  test.beforeEach(async ({ page }) => {
    await serveCodeStandIn(page, undefined, WHEN_ROW);
    await openRoute(page, `/sprite/${CODE_STANDIN}`);
    await expect(page.getByRole('heading', { name: 'Test badge' })).toBeVisible();
  });

  test('a control is hidden while it is not in effect and comes back when it is', async ({ page }) => {
    await expect(field(page, 'emblem')).toBeVisible();
    await expect(field(page, 'inlay')).toBeHidden();
    await expect(field(page, 'glowSize')).toBeHidden();
    // the Colours tab has nothing to show yet, so it is not offered either
    await expect(coloursTab(page)).toBeHidden();

    const before = await stripHash(page);
    await page.getByRole('group', { name: 'Emblem' }).getByRole('button', { name: 'Star' }).click();
    await offered(page, 'inlay', true);
    await expect(coloursTab(page)).toBeVisible();
    const star = await stripHash(page);
    expect(star).not.toBe(before);
    await coloursTab(page).click();
    await expect(field(page, 'inlay')).toBeVisible();
    await field(page, 'inlay').locator('button.swatch').nth(1).click();
    expect(await stripHash(page)).not.toBe(star);

    await openTab(page, 'shape');
    await page.getByRole('checkbox', { name: 'Glow', exact: true }).check({ force: true });
    await expect(field(page, 'glowSize')).toBeVisible();
    await offered(page, 'metal', true);
    await page.getByRole('checkbox', { name: 'Glow', exact: true }).uncheck({ force: true });
    await expect(field(page, 'glowSize')).toBeHidden();
    await offered(page, 'metal', false);

    await page.getByRole('group', { name: 'Emblem' }).getByRole('button', { name: 'Plain' }).click();
    await offered(page, 'inlay', false);
    await expect(coloursTab(page)).toBeHidden();
    await page.getByRole('button', { name: 'Start over' }).click();
    await offered(page, 'inlay', false);
    await expect.poll(() => stripHash(page)).toBe(before);
  });

  test('Surprise me never leaves a hidden control changed', async ({ page }) => {
    const seen = { shown: 0, hidden: 0 };
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: 'Surprise me' }).click();
      const plain = (await page.getByRole('group', { name: 'Emblem' }).getByRole('button', { name: 'Plain' }).getAttribute('aria-pressed')) === 'true';
      const glow = await page.locator('#c-glow').isChecked();
      await page.waitForTimeout(300);                       // the link is saved a moment after the change
      const hash = await hashNow(page);
      if (plain) { await offered(page, 'inlay', false); expect(hash).not.toContain('inlay='); seen.hidden++; }
      else { await offered(page, 'inlay', true); seen.shown++; }
      if (glow) await offered(page, 'glowSize', true);
      else { await offered(page, 'glowSize', false); expect(hash).not.toContain('glowSize='); expect(hash).not.toContain('metal='); }
    }
    expect(seen.shown + seen.hidden).toBe(10);
  });
});

test.describe('sounds that only play sometimes', () => {
  const rows = (page) => page.locator('.cues li.cue');
  const rowFor = (page, sound) => rows(page).filter({ has: page.locator(`select[aria-label="Sound"] option[value="${sound}"]:checked`) });

  test("the Hero's blade sound applies with a weapon and the unarmed sound without one", async ({ page }) => {
    await openRoute(page, '/sprite/knight?clip=attack');
    await openTab(page, 'parts');
    await expect(page.locator('.cues h2')).toHaveText('Sounds for Attack');
    await expect(rows(page)).toHaveCount(2);
    const blade = rowFor(page, 'sword-slash'), bare = rows(page).filter({ hasNot: page.locator('select[aria-label="Sound"] option[value="sword-slash"]:checked') });
    await expect(blade).toHaveCount(1);
    await expect(blade).not.toHaveClass(/\boff\b/);
    await expect(bare).toHaveClass(/\boff\b/);
    await expect(bare).toContainText('Does not play');
    await expect(blade).not.toContainText('Does not play');

    await block(page, 'Weapon').getByRole('button', { name: 'None' }).click();
    await expect(blade).toHaveClass(/\boff\b/);
    await expect(blade).toContainText('Does not play');
    await expect(bare).not.toHaveClass(/\boff\b/);
    // the frame that plays a sound is still marked on the strip
    await expect(page.locator('.strip .cell.has-sound')).toHaveCount(1);

    await block(page, 'Weapon').getByRole('button', { name: 'Axe' }).click();
    await expect(blade).not.toHaveClass(/\boff\b/);
  });

  test('the download leaves out a sound that does not play', async ({ page }) => {
    const { downloadFrom, readZip } = await import('../helpers/test.mjs');
    await openRoute(page, '/sprite/knight?weapon=none');
    const { bytes } = await downloadFrom(page, () => downloadButton(page).click());
    const files = readZip(new Uint8Array(bytes));
    const meta = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'knight.json').data));
    expect(meta.sounds.attack.map((c) => c.sound)).not.toContain('sword-slash');
    expect(meta.sounds.attack.length).toBe(1);
    expect(files.map((f) => f.name)).not.toContain('sounds/sword-slash.wav');
    expect(meta.parts.weapon.present).toBe(false);
    expect(meta.frames[0].sockets.hand).toBeTruthy();
  });

  test('an edited sound list keeps its conditions across a reload', async ({ page }) => {
    await openRoute(page, '/sprite/knight?clip=attack');
    await openTab(page, 'sounds');
    await rows(page).first().getByRole('button', { name: 'Duplicate' }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect.poll(() => hashNow(page)).toContain('sfx=');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDrawn(page);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('.cues li.cue.off')).toHaveCount(1);
    await openTab(page, 'parts');
    await block(page, 'Weapon').getByRole('button', { name: 'None' }).click();
    await expect(page.locator('.cues li.cue.off')).toHaveCount(2);
  });
});

// ---- review round ------------------------------------------------------------------------------

test.describe('a control that depends on a hidden control', () => {
  test('is hidden too, even while the hidden one is still switched on', async ({ page }) => {
    await serveCodeStandIn(page, undefined, WHEN_ROW);
    await openRoute(page, `/sprite/${CODE_STANDIN}`);
    await expect(field(page, 'rim')).toBeHidden();
    await expect(field(page, 'emblem')).toBeVisible();
    await page.getByRole('group', { name: 'Emblem' }).getByRole('button', { name: 'Star' }).click();
    await expect(field(page, 'rim')).toBeVisible();
    await expect(field(page, 'rimWidth')).toBeHidden();
    await page.getByRole('checkbox', { name: 'Rim', exact: true }).check({ force: true });
    await expect(field(page, 'rimWidth')).toBeVisible();
    // Rim stays switched on, but a heart has no rim: both go
    await page.getByRole('group', { name: 'Emblem' }).getByRole('button', { name: 'Heart' }).click();
    await expect(field(page, 'rim')).toBeHidden();
    await expect(field(page, 'rimWidth')).toBeHidden();
    await page.getByRole('group', { name: 'Emblem' }).getByRole('button', { name: 'Star' }).click();
    await expect(field(page, 'rimWidth')).toBeVisible();
  });
});

test.describe('controls with either-or conditions on the shipped characters', () => {
  test('Hero: Metal is shown only while a weapon or the helmet is there to colour', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await openTab(page, 'parts');
    await offered(page, 'metal', true);
    await block(page, 'Weapon').getByRole('button', { name: 'None' }).click();
    await offered(page, 'metal', true);                                     // the helmet is still metal
    await block(page, 'Headgear').getByRole('button', { name: 'Crown' }).click();
    await offered(page, 'metal', false);
    await block(page, 'Weapon').getByRole('button', { name: 'Axe' }).click();
    await offered(page, 'metal', true);
    await openTab(page, 'colours');
    await expect(field(page, 'metal')).toBeVisible();
  });

  test('Wizard: Hair and beard colour goes when the hood hides the hair and there is no beard', async ({ page }) => {
    await openRoute(page, '/sprite/wizard');
    await openTab(page, 'parts');
    await offered(page, 'beardColor', true);
    await block(page, 'Hat').getByRole('button', { name: 'Hood' }).click();
    await offered(page, 'beardColor', true);                                // the beard still shows
    await block(page, 'Beard').getByRole('button', { name: 'None' }).click();
    await offered(page, 'beardColor', false);
    await block(page, 'Hat').getByRole('button', { name: 'Wide' }).click();
    await offered(page, 'beardColor', true);
  });
});

test.describe('links from before the cape had styles', () => {
  test('cape=false opens with no cape and the address is rewritten', async ({ page }) => {
    await openRoute(page, '/sprite/knight?cape=false&weapon=axe');
    await openTab(page, 'parts');
    await expect(block(page, 'Cape').getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    await expect(block(page, 'Cape').getByRole('slider')).toBeHidden();
    await expect.poll(() => hashNow(page)).toContain('cape=none');
    const hash = await hashNow(page);
    expect(hash).not.toContain('cape=false');
    expect(hash).toContain('weapon=axe');
    const withNoCape = await stripHash(page);
    await openRoute(page, '/sprite/knight?cape=none&weapon=axe');
    expect(await stripHash(page)).toBe(withNoCape);
  });

  test('cape=true opens with the plain cape and leaves no old value in the address', async ({ page }) => {
    await openRoute(page, '/sprite/knight?cape=true');
    await openTab(page, 'parts');
    await expect(block(page, 'Cape').getByRole('button', { name: 'Plain' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => hashNow(page)).not.toContain('cape=true');
  });
});

test.describe('the Fine-tune tabs', () => {
  // (the old page folded a part's block shut to shorten one long column; the panel has tabs instead, each short enough to see whole)
  test('one tab shows at a time, its controls are reachable, and changing tab changes nothing about the sprite', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    const tab = (name) => page.getByRole('tab', { name, exact: true });
    await expect(tab('Shape')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#c-height')).toBeVisible();
    await expect(page.locator('#c-weaponLength')).toBeHidden();
    const before = await stripHash(page);
    await tab('Parts').click();
    await expect(tab('Parts')).toHaveAttribute('aria-selected', 'true');
    await expect(tab('Shape')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#c-weaponLength')).toBeVisible();
    await expect(page.locator('#c-height')).toBeHidden();
    await expect(block(page, 'Cape').getByRole('slider')).toBeVisible();
    expect(await stripHash(page)).toBe(before);
    // the tab that is open stays open when the sprite is changed from elsewhere (Start over)
    await block(page, 'Weapon').getByRole('button', { name: 'None' }).click();
    await expect(tab('Parts').locator('.dot')).toBeVisible();      // the change dot: something in this tab is changed
    await expect(block(page, 'Weapon').locator('.ctl.is-main')).toHaveClass(/is-changed/);
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(tab('Parts')).toHaveAttribute('aria-selected', 'true');
    await expect(tab('Parts').locator('.dot')).toBeHidden();
    await expect(page.locator('#c-weaponLength')).toBeVisible();
  });

  test('every changed control has its own Reset, which puts back that control alone', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await openTab(page, 'parts');
    const weapon = field(page, 'weapon'), cape = field(page, 'cape');
    await expect(weapon.getByRole('button', { name: 'Put Weapon back' })).toBeHidden();
    await weapon.getByRole('button', { name: 'Axe' }).click();
    await cape.getByRole('button', { name: 'Tattered' }).click();
    await weapon.getByRole('button', { name: 'Put Weapon back' }).click();
    await expect(weapon.getByRole('button', { name: 'Sword' })).toHaveAttribute('aria-pressed', 'true');
    await expect(weapon).not.toHaveClass(/is-changed/);
    await expect(cape.getByRole('button', { name: 'Tattered' })).toHaveAttribute('aria-pressed', 'true');
    await expect(cape).toHaveClass(/is-changed/);
  });
});

test.describe('phone width: the preview stays in view', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('scrolling down to the last controls keeps the preview on screen', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await page.waitForSelector('canvas.stage');
    await openTab(page, 'motion');
    // bring the last control to the bottom of the screen (the page continues below it with related assets)
    await page.locator('#c-speed').evaluate((e) => e.scrollIntoView({ block: 'end' }));
    await expect(page.locator('#c-speed')).toBeInViewport();
    await expect(page.locator('canvas.stage')).toBeInViewport({ ratio: 0.9 });
    // and it does not cover the control being used
    const stage = await page.locator('.stage-card').boundingBox(), speed = await page.locator('#c-speed').boundingBox();
    expect(speed.y).toBeGreaterThan(stage.y + stage.height);
    expect(stage.height).toBeLessThan(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  });
});
