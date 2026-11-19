// docs/studio.md section 8, item S11: "an agent builds the newt with actions only". Everything goes through
// window.loadout.call('studio_*', { ...flat inputs }), the shape generated/api.json gives an MCP server, never through
// window.loadout.studio's own methods: start from Four legs, put the newt (tests/fixtures/studio/newt.json) in, look
// at the walk, ask for advice, take the library file, try the bag, and remove the draft.
import fs from 'node:fs';
import { test, expect, openRoute } from '../helpers/test.mjs';

const NEWT = JSON.parse(fs.readFileSync(new URL('../fixtures/studio/newt.json', import.meta.url), 'utf8'));

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

test('an agent builds the newt with studio actions only (loadout.call), from Four legs to a rendered walk and the file', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(() => { try { localStorage.removeItem('loadout-studio-v1'); } catch { /* nothing kept */ } });

  const run = await page.evaluate(async (newt) => {
    const call = window.loadout.call;
    const out = {};
    out.starts = await call('studio_starts', {});
    out.created = await call('studio_create', { from: 'template:four-legs', name: 'Moss newt' });
    const draft = out.created.draft;
    out.got = await call('studio_get', { draft });
    out.checked = await call('studio_validate', { definition: newt });
    out.set = await call('studio_set', { draft, definition: newt });
    out.list = await call('studio_list', {});
    out.walk = await call('studio_render', { draftOrDefinition: draft, options: { clip: 'walk', scale: 2 } });
    out.bones = await call('studio_render', { draftOrDefinition: draft, options: { clip: 'walk', frame: 0, scale: 4, bones: true } });
    out.loose = await call('studio_render', { draftOrDefinition: newt, options: { clip: 'idle', frame: 0 } });
    out.advice = await call('studio_advice', { draftOrDefinition: draft });
    out.file = await call('studio_file', { draftOrDefinition: draft });
    out.bag = await call('studio_to_bag', { draft });
    // what an agent gets wrong is answered, not thrown
    out.wrongInput = await call('studio_render', { draft, clip: 'walk' });
    out.noDraft = await call('studio_get', { draft: 'no-such-draft' });
    out.badSet = await call('studio_set', { draft, definition: { ...newt, clips: {} } });
    out.stored = JSON.parse(localStorage.getItem('loadout-studio-v1'));
    out.removed = await call('studio_remove', { draft });
    out.after = await call('studio_list', {});
    return out;
  }, NEWT);

  expect(run.starts.ok).toBe(true);
  expect(run.starts.starts.map((s) => s.from)).toContain('template:four-legs');

  // the draft: made from Four legs, then the newt put in, and saved on this computer
  expect(run.created.ok, JSON.stringify(run.created.errors)).toBe(true);
  expect(run.created.draft).toBe('moss-newt');
  expect(run.created.definition.made).toEqual({ in: 'studio', from: 'template:four-legs' });
  expect(run.got.ok).toBe(true);
  expect(run.got.definition.size).toEqual([64, 48]);
  expect(run.checked.ok, JSON.stringify(run.checked.errors)).toBe(true);
  expect(run.set.ok, JSON.stringify(run.set.errors)).toBe(true);
  expect(run.set.saved).toBe(true);
  expect(run.set.definition.id).toBe('moss-newt');
  expect(run.set.definition.size).toEqual([48, 48]);
  expect(run.set.definition.body.rig.id).toBe('newt');
  expect(run.stored.drafts['moss-newt'].definition).toEqual(run.set.definition);
  expect(run.list.drafts.map((d) => [d.draft, d.name, d.state])).toEqual([['moss-newt', 'Moss newt', 'ready']]);

  // the walk: all 8 frames in one row at twice the size, really drawn, and the same in the page's own decoder
  expect(run.walk.ok, JSON.stringify(run.walk.errors)).toBe(true);
  expect([run.walk.width, run.walk.height, run.walk.frames, run.walk.clip]).toEqual([48 * 2 * 8, 48 * 2, 8, 'walk']);
  const seen = await pngStats(page, run.walk.png);
  expect([seen.width, seen.height]).toEqual([run.walk.width, run.walk.height]);
  expect(seen.opaque).toBe(run.walk.opaque);
  expect(seen.opaque).toBeGreaterThan(8 * 200);
  expect(run.bones.ok).toBe(true);
  const bones = await pngStats(page, run.bones.png);
  expect([bones.width, bones.height]).toEqual([192, 192]);
  expect(run.loose.ok, 'a definition given whole draws too').toBe(true);

  // advice is advice: always ok, with the bar's findings
  expect(run.advice.ok, JSON.stringify(run.advice.errors)).toBe(true);
  expect(typeof run.advice.passes).toBe('boolean');
  expect(Array.isArray(run.advice.problems)).toBe(true);

  // the library file: the fixed form around the definition as JSON
  expect(run.file.ok, JSON.stringify(run.file.errors)).toBe(true);
  expect(run.file.name).toBe('moss-newt.js');
  const head = 'export default dataSprite(';
  expect(JSON.parse(run.file.text.slice(run.file.text.indexOf(head) + head.length, run.file.text.lastIndexOf(');')))).toEqual(run.set.definition);

  // the bag: either it holds studio sprites (S8 has landed) and gives a key, or it says "not yet"
  if (run.bag.ok) expect(typeof run.bag.key).toBe('string');
  else expect(run.bag.errors[0]).toMatch(/not yet/i);

  // mistakes are answered in words
  expect(run.wrongInput.ok).toBe(false);
  expect(run.wrongInput.errors[0]).toMatch(/draftOrDefinition/);
  expect(run.noDraft.ok).toBe(false);
  expect(run.noDraft.errors[0]).toMatch(/moss-newt/);
  expect(run.badSet.ok).toBe(false);

  expect(run.removed.ok).toBe(true);
  expect(run.after.drafts).toEqual([]);
});
