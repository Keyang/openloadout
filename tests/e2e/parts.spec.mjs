// Parts on the sprite page: each part is its own block of controls, one level below the sprite's own.
import { test, expect, openRoute, canvasGroupStats, setRange, waitForDrawn } from '../helpers/test.mjs';

const strip = (page) => page.locator('.strip .cell canvas');
const stripHash = async (page) => (await canvasGroupStats(strip(page))).hash;
const block = (page, title) => page.locator('.panel section.part').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const slider = (scope, name) => scope.getByRole('slider', { name, exact: true });
const hashNow = (page) => page.evaluate(() => location.hash);

test.describe('Hero parts', () => {
  test.beforeEach(async ({ page }) => { await openRoute(page, '/sprite/knight'); });

  test('the Weapon block sits below Look and has its own settings in everyday words', async ({ page }) => {
    const weapon = block(page, 'Weapon');
    await expect(weapon).toBeVisible();
    // selector first, then the settings
    await expect(weapon.getByRole('group', { name: 'Weapon' }).getByRole('button', { name: 'Sword' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Length', 'Hold angle', 'Swing']) await expect(slider(weapon, name)).toBeVisible();
    const order = await page.locator('.panel section.group h2').allTextContents();
    expect(order.indexOf('Weapon')).toBeGreaterThan(order.indexOf('Look'));
    expect(order).toEqual(expect.arrayContaining(['Look', 'Weapon', 'Headgear', 'Cape', 'Colors', 'Motion']));
    // the weapon's controls are in its block, not in Look
    const look = page.locator('.panel section.group').filter({ has: page.getByRole('heading', { name: 'Look', exact: true }) });
    await expect(look.getByRole('group', { name: 'Weapon' })).toHaveCount(0);
    await expect(page.locator('.panel')).not.toContainText(/param|socket/i);
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
    await expect(block(page, 'Weapon').getByRole('button', { name: 'Axe' })).toHaveAttribute('aria-pressed', 'true');
    expect(await slider(block(page, 'Weapon'), 'Hold angle').inputValue()).toBe(angle);
  });

  test('a link with the weapon set to none opens with the weapon settings hidden', async ({ page }) => {
    await openRoute(page, '/sprite/knight?weapon=none&clip=attack');
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
    await expect(page.locator('.panel section.part')).toHaveCount(0);
    expect(await page.locator('.panel section.group').count()).toBeGreaterThanOrEqual(1);
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('the Hero page with part blocks has no sideways scroll', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await page.waitForSelector('.strip .cell canvas');
    await expect(block(page, 'Weapon')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  });
});

// ---- controls and sounds that only apply sometimes (`when`) ---------------------------------------

// A small sprite served in place of sprites/coin.js, so these tests do not depend on what any real sprite declares.
const WHEN_SPRITE = `
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
export default defineSprite({
  id: 'coin', name: 'Test badge', kind: 'Item', blurb: 'A badge for tests.',
  size: [24, 24], pivot: [12, 22],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    emblem: choice('Emblem', 'plain', ['plain', 'star', 'heart']),
    inlay: color('Emblem colour', '#c9423a', ['#c9423a', '#3f6fd1', '#4f9d57'], { when: { emblem: ['star', 'heart'] } }),
    glow: toggle('Glow', false),
    glowSize: range('Glow size', 0.5, { lo: 'Thin', hi: 'Wide', when: { glow: [true] } }),
    metal: color('Metal', '#e6c545', ['#e6c545', '#c2c9d6', '#c98a4a'], { when: { glow: [true] } }),
    rim: toggle('Rim', false, { when: { emblem: ['star'] } }),
    rimWidth: range('Rim width', 0.5, { lo: 'Thin', hi: 'Thick', when: { rim: [true] } }),
  },
  clips: { idle: { frames: 4, fps: 6 }, flip: { frames: 4, fps: 8 } },
  render(g, { clip, t, p }) {
    const r = 5 + p.size * 3 + (clip === 'flip' ? Math.sin(t * 6.283) : 0);
    if (p.glow) g.ellipse(12, 12 + Math.sin(t * 6.283), r + 1 + p.glowSize * 2, r + 1 + p.glowSize * 2, p.metal);
    g.ellipse(12, 12 + Math.sin(t * 6.283), r, r, '#8f97a8');
    if (p.emblem === 'star') g.rect(10, 10, 4, 4, p.inlay);
    if (p.emblem === 'star' && p.rim) g.rect(8, 8 - Math.round(p.rimWidth * 2), 8, 1 + Math.round(p.rimWidth * 2), '#ffffff');
    if (p.emblem === 'heart') g.rect(9, 11, 6, 2, p.inlay);
  },
});`;
const field = (page, key) => page.locator(`.panel [data-control="${key}"]`);

test.describe('controls that only matter sometimes', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/sprites\/coin\.js(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: WHEN_SPRITE }));
    await openRoute(page, '/sprite/coin');
    await expect(page.getByRole('heading', { name: 'Test badge' })).toBeVisible();
  });

  test('a control is hidden while it is not in effect and comes back when it is', async ({ page }) => {
    await expect(field(page, 'emblem')).toBeVisible();
    await expect(field(page, 'inlay')).toBeHidden();
    await expect(field(page, 'glowSize')).toBeHidden();
    // the Colors group has nothing to show yet, so its title is not shown either
    await expect(page.getByRole('heading', { name: 'Colors', exact: true })).toBeHidden();

    const before = await stripHash(page);
    await page.getByRole('group', { name: 'Emblem' }).getByRole('button', { name: 'Star' }).click();
    await expect(field(page, 'inlay')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Colors', exact: true })).toBeVisible();
    const star = await stripHash(page);
    expect(star).not.toBe(before);
    await field(page, 'inlay').getByRole('button').nth(1).click();
    expect(await stripHash(page)).not.toBe(star);

    await page.getByRole('checkbox', { name: 'Glow' }).check({ force: true });
    await expect(field(page, 'glowSize')).toBeVisible();
    await expect(field(page, 'metal')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Glow' }).uncheck({ force: true });
    await expect(field(page, 'glowSize')).toBeHidden();

    await page.getByRole('group', { name: 'Emblem' }).getByRole('button', { name: 'Plain' }).click();
    await expect(field(page, 'inlay')).toBeHidden();
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(field(page, 'inlay')).toBeHidden();
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
      if (plain) { await expect(field(page, 'inlay')).toBeHidden(); expect(hash).not.toContain('inlay='); seen.hidden++; }
      else { await expect(field(page, 'inlay')).toBeVisible(); seen.shown++; }
      if (glow) await expect(field(page, 'glowSize')).toBeVisible();
      else { await expect(field(page, 'glowSize')).toBeHidden(); expect(hash).not.toContain('glowSize='); expect(hash).not.toContain('metal='); }
    }
    expect(seen.shown + seen.hidden).toBe(10);
  });
});

test.describe('sounds that only play sometimes', () => {
  const rows = (page) => page.locator('.cues li.cue');
  const rowFor = (page, sound) => rows(page).filter({ has: page.locator(`select[aria-label="Sound"] option[value="${sound}"]:checked`) });

  test("the Hero's blade sound applies with a weapon and the unarmed sound without one", async ({ page }) => {
    await openRoute(page, '/sprite/knight?clip=attack');
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
    const { bytes } = await downloadFrom(page, () => page.getByRole('button', { name: 'Download sprite and sounds' }).click());
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
    await rows(page).first().getByRole('button', { name: 'Duplicate' }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect.poll(() => hashNow(page)).toContain('sfx=');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDrawn(page);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('.cues li.cue.off')).toHaveCount(1);
    await block(page, 'Weapon').getByRole('button', { name: 'None' }).click();
    await expect(page.locator('.cues li.cue.off')).toHaveCount(2);
  });
});

// ---- review round ------------------------------------------------------------------------------

test.describe('a control that depends on a hidden control', () => {
  test('is hidden too, even while the hidden one is still switched on', async ({ page }) => {
    await page.route(/\/sprites\/coin\.js(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: WHEN_SPRITE }));
    await openRoute(page, '/sprite/coin');
    await expect(field(page, 'rim')).toBeHidden();
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
    await expect(field(page, 'metal')).toBeVisible();
    await block(page, 'Weapon').getByRole('button', { name: 'None' }).click();
    await expect(field(page, 'metal')).toBeVisible();                       // the helmet is still metal
    await block(page, 'Headgear').getByRole('button', { name: 'Crown' }).click();
    await expect(field(page, 'metal')).toBeHidden();
    await block(page, 'Weapon').getByRole('button', { name: 'Axe' }).click();
    await expect(field(page, 'metal')).toBeVisible();
  });

  test('Wizard: Hair and beard colour goes when the hood hides the hair and there is no beard', async ({ page }) => {
    await openRoute(page, '/sprite/wizard');
    await expect(field(page, 'beardColor')).toBeVisible();
    await block(page, 'Hat').getByRole('button', { name: 'Hood' }).click();
    await expect(field(page, 'beardColor')).toBeVisible();                  // the beard still shows
    await block(page, 'Beard').getByRole('button', { name: 'None' }).click();
    await expect(field(page, 'beardColor')).toBeHidden();
    await block(page, 'Hat').getByRole('button', { name: 'Wide' }).click();
    await expect(field(page, 'beardColor')).toBeVisible();
  });
});

test.describe('links from before the cape had styles', () => {
  test('cape=false opens with no cape and the address is rewritten', async ({ page }) => {
    await openRoute(page, '/sprite/knight?cape=false&weapon=axe');
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
    await expect(block(page, 'Cape').getByRole('button', { name: 'Plain' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => hashNow(page)).not.toContain('cape=true');
  });
});

test.describe('folding a part block', () => {
  test('the title folds the block shut and opens it again', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    const weapon = block(page, 'Weapon');
    const title = weapon.getByRole('button', { name: 'Weapon', exact: true });
    await expect(title).toHaveAttribute('aria-expanded', 'true');
    await title.click();
    await expect(title).toHaveAttribute('aria-expanded', 'false');
    await expect(weapon.locator('#c-weaponLength')).toBeHidden();
    await expect(weapon.getByRole('button', { name: 'Sword' })).toBeHidden();
    await expect(block(page, 'Cape').getByRole('slider')).toBeVisible();     // other blocks stay open
    // folding changes nothing about the sprite
    const before = await stripHash(page);
    await title.click();
    await expect(slider(weapon, 'Length')).toBeVisible();
    await expect(weapon.getByRole('button', { name: 'Sword' })).toBeVisible();
    expect(await stripHash(page)).toBe(before);
    // a folded block stays folded when its part is changed elsewhere (Start over)
    await title.click();
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(weapon.locator('#c-weaponLength')).toBeHidden();
  });
});

test.describe('phone width: the preview stays in view', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('scrolling down to the last controls keeps the preview on screen', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await page.waitForSelector('.strip .cell canvas');
    await page.locator('#c-speed').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await expect(page.locator('#c-speed')).toBeInViewport();
    await expect(page.locator('canvas.stage')).toBeInViewport({ ratio: 0.9 });
    // and it does not cover the control being used
    const stage = await page.locator('.stage-card').boundingBox(), speed = await page.locator('#c-speed').boundingBox();
    expect(speed.y).toBeGreaterThan(stage.y + stage.height);
    expect(stage.height).toBeLessThan(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  });
});
