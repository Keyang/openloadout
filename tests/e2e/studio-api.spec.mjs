// window.loadout.studio (docs/studio.md section 7, item S11), driven the way an agent would: from a page script that
// uses nothing but window.loadout. A Four legs creature from the template to a rendered sheet and the library file.
import { test, expect, openRoute } from '../helpers/test.mjs';

/** Decode a PNG data address in the page: its size and how many pixels are not see-through. */
const pngStats = (page, png) => page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
  return { width: img.width, height: img.height, opaque };
}, png);

test('an agent makes a Four legs creature with window.loadout.studio: create, change, render, file', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(() => { try { localStorage.removeItem('loadout-studio-v1'); } catch { /* nothing kept */ } });

  const members = await page.evaluate(() => Object.keys(window.loadout.studio).sort());
  expect(members).toEqual(['advice', 'create', 'file', 'get', 'list', 'remove', 'render', 'set', 'starts', 'toBag', 'validate']);

  const run = await page.evaluate(async () => {
    const s = window.loadout.studio;
    const starts = await s.starts();
    const created = await s.create({ from: 'template:four-legs', name: 'Moss beast' });
    const { definition } = await s.get(created.draft);
    // change it as a person would: a colour, the speed of the walk, the name
    const firstSlot = definition.body.rig.colours.find((c) => !c.detail).id;
    definition.colours[firstSlot] = '#4f9d57';
    definition.clips.walk.fps = 12;
    definition.blurb = 'A mossy four-legged beast that trots through the forest.';
    const set = await s.set(created.draft, definition);
    const sheet = await s.render(created.draft, { clip: 'walk', scale: 2 });
    const withBones = await s.render(created.draft, { clip: 'walk', frame: 0, scale: 4, bones: true });
    const file = await s.file(created.draft);
    const list = await s.list();
    const viaCall = await window.loadout.call('studio_validate', { definition: set.definition });
    const refused = await s.render(created.draft, { clip: 'fly' });
    const stored = JSON.parse(localStorage.getItem('loadout-studio-v1'));
    return { starts, created, set, sheet, withBones, file, list, viaCall, refused, stored, slot: firstSlot };
  });

  expect(run.starts.ok).toBe(true);
  expect(run.starts.starts.map((x) => x.from)).toEqual(expect.arrayContaining(['template:four-legs']));
  expect(run.starts.starts.some((x) => x.from.startsWith('library:') || x.body === 'library body'), 'no library body to start from (build item R1)').toBe(false);
  expect(run.created.ok, JSON.stringify(run.created.errors)).toBe(true);
  expect(run.created.draft).toBe('moss-beast');
  expect(run.created.saved).toBe(true);
  expect(run.set.ok, JSON.stringify(run.set.errors)).toBe(true);
  expect(run.set.definition.colours[run.slot]).toBe('#4f9d57');
  expect(run.stored.drafts['moss-beast'].definition.clips.walk.fps).toBe(12);
  expect(run.list.drafts.map((d) => [d.draft, d.state])).toEqual([['moss-beast', 'ready']]);
  expect(run.viaCall.ok).toBe(true);
  expect(run.refused.ok).toBe(false);
  expect(run.refused.errors[0]).toMatch(/walk/);

  // the sheet: every frame of the walk in one row, at twice the size, really drawn
  const frames = run.set.definition.clips.walk.frames;
  expect(run.sheet.ok, JSON.stringify(run.sheet.errors)).toBe(true);
  expect([run.sheet.width, run.sheet.height, run.sheet.frames]).toEqual([64 * 2 * frames, 48 * 2, frames]);
  const seen = await pngStats(page, run.sheet.png);
  expect([seen.width, seen.height]).toEqual([run.sheet.width, run.sheet.height]);
  expect(seen.opaque).toBe(run.sheet.opaque);
  expect(seen.opaque).toBeGreaterThan(400 * frames);
  const bones = await pngStats(page, run.withBones.png);
  expect([bones.width, bones.height]).toEqual([256, 192]);

  // the downloadable file for the library: the fixed form around the definition as JSON
  expect(run.file.ok, JSON.stringify(run.file.errors)).toBe(true);
  expect(run.file.name).toBe('moss-beast.js');
  const lines = run.file.text.split('\n');
  expect(lines[0]).toMatch(/^\/\/ Made in the Loadout studio\./);
  expect(lines[1]).toBe("import { dataSprite } from '../engine/data-sprite.js';");
  expect(lines[2]).toMatch(/^export default dataSprite\(/);
  const call = 'export default dataSprite(';
  const json = run.file.text.slice(run.file.text.indexOf(call) + call.length, run.file.text.lastIndexOf(');'));
  expect(JSON.parse(json)).toEqual(run.set.definition);

  // the bag cannot hold studio sprites yet (S8): a clear "not yet", nothing changed
  const bag = await page.evaluate(() => window.loadout.studio.toBag('moss-beast'));
  if (!bag.ok) expect(bag.errors[0]).toMatch(/not yet/i);

  // and the draft is gone when removed
  const removed = await page.evaluate(async () => ({ r: await window.loadout.studio.remove('moss-beast'), list: await window.loadout.studio.list() }));
  expect(removed.r.ok).toBe(true);
  expect(removed.list.drafts).toEqual([]);
});

test('drafts survive a reload, and a draft changed behind the studio\'s back is not drawn', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(() => { try { localStorage.removeItem('loadout-studio-v1'); } catch { /* nothing kept */ } });
  const made = await page.evaluate(() => window.loadout.studio.create('template:blob', 'Moss goo'));
  expect(made.ok).toBe(true);
  await page.reload();
  await openRoute(page, '/');
  const back = await page.evaluate(() => window.loadout.studio.get('moss-goo'));
  expect(back.ok).toBe(true);
  expect(back.definition.name).toBe('Moss goo');
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('loadout-studio-v1'));
    raw.drafts['moss-goo'].definition.body.rig.shapes[0].bone = '<img src=x onerror=alert(1)>';
    localStorage.setItem('loadout-studio-v1', JSON.stringify(raw));
  });
  const after = await page.evaluate(async () => ({ get: await window.loadout.studio.get('moss-goo'), render: await window.loadout.studio.render('moss-goo'), list: await window.loadout.studio.list() }));
  expect(after.get.ok).toBe(false);
  expect(after.render.ok).toBe(false);
  expect(after.list.drafts[0].state).toBe('damaged');
  await page.evaluate(() => window.loadout.studio.remove('moss-goo'));
});
