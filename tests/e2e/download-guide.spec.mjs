// What a download tells a game developer (docs/architecture.md, Contract 8), checked on a real download of EVERY
// bundle the catalogue lists (read when the tests are collected, so a new bundle gets its own test with no edit
// here): one visitor opens the bundle, presses "Download this bundle" and unpacks it.
//   every sprite folder   the text is right for the kind of asset it is: a tileset is told as tiles, an interface
//                         piece as states with a stretch border, a background as layers, a still picture as a picture,
//                         and only something that faces a way is told to flip (tests/helpers/download-check.mjs).
//                         For a tileset the checker also reads the words back: each tile's line against its rules in
//                         the JSON, each tile's list of eight cells against its "patterns", the Godot terrain step
//                         pointing at that list (not at the first-match rules), and stacked layers in both engines
//                         where tiles lie over others. An effect is only told what to do IF it shows a direction.
//                         A sound on a still row (a button's state) is played when that row is shown, not on a frame;
//                         a thin platform is stood on from above only and both engines get the step for it; the
//                         states of an interface piece say when each is shown; a bar says how to cut its fill off
//   one sprite alone      "Download" on a sprite's own page gives the same text, for one sprite of
//                         every type the catalogue has (the first of each, so a new type is covered with no edit here)
//   the top of the zip    read-me.txt opens with a contents list (name, what it is, where), licence.txt lists what
//                         every asset records and invents no terms, manifest.json carries the same facts for tools
// Run with: npx playwright test tests/e2e/download-guide.spec.mjs
import { test, expect as baseExpect, openRoute, downloadFrom } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf, packageOf } from '../helpers/acceptance.mjs';
import { readZip } from '../helpers/zip-read.mjs';
import { guideFaults, packageFaults } from '../helpers/download-check.mjs';

// Many builders share this machine: anything the page is waited for gets 20 seconds, not the usual 5.
const expect = baseExpect.configure({ timeout: 20_000 });
test.use({ actionTimeout: 30_000 });

const CATALOG = readCatalogue();
const C = catalogueOf(CATALOG);

for (const bundle of CATALOG.bundles) {
  test(`${bundle.id}: every asset in the download is explained as the kind of thing it is`, async ({ page }) => {
    const big = bundle.sprites.length + bundle.sounds.length + 8 * bundle.music.length;
    test.setTimeout(240_000 + big * 8000);
    await openRoute(page, `/bundle/${bundle.id}`);
    const zip = packageOf(await downloadFrom(page, () => page.getByRole('button', { name: 'Download this bundle' }).click(), { timeout: 180_000 + big * 6000 }));
    await expect(page.locator('.bundle-actions .status')).toContainText('Downloaded');

    const manifest = zip.json('manifest.json');
    expect(manifest.assets.map((a) => a.id).sort(), 'everything the bundle lists is in the package').toEqual([...bundle.sprites, ...bundle.sounds, ...bundle.music].sort());

    // ---- every sprite: the text and the JSON next to its sheet
    const faults = [];
    const kinds = new Set();
    for (const id of bundle.sprites) {
      const row = C.byId[id];
      const entry = manifest.assets.find((a) => a.id === id);
      const folder = entry.folder;
      expect(zip.names, `${folder}how-to-use.txt`).toContain(`${folder}how-to-use.txt`);
      const json = zip.json(`${folder}${id}.json`);
      const text = zip.text(`${folder}how-to-use.txt`);
      faults.push(...guideFaults({ row, json, text }));
      kinds.add(row.type);
      // the name a person knows it by opens the text; the id is only the folder
      expect.soft(text.split('\n')[0], `${id}: the text opens with the asset's name`).toContain(row.name);
    }
    expect(faults, `${faults.length} fault(s) in the texts of ${bundle.id}`).toEqual([]);
    test.info().annotations.push({ type: 'kinds', description: `${bundle.sprites.length} sprites of ${kinds.size} kinds: ${[...kinds].sort().join(', ')}` });

    // ---- the top of the package
    const top = packageFaults({ manifest, readMe: zip.names.includes('read-me.txt') ? zip.text('read-me.txt') : null, licence: zip.names.includes('licence.txt') ? zip.text('licence.txt') : null, names: zip.names });
    expect(top, `the top of the ${bundle.id} package`).toEqual([]);
    // what the catalogue records is what the package says, asset by asset
    for (const a of manifest.assets) expect.soft(a.license ?? null, `${a.id}: the licence value in the package is the catalogue's`).toBe(C.byId[a.id].license ?? null);
  });
}

// one sprite of every type there is, downloaded on its own from its own page
const TYPES = [...new Set(C.sprites.map((a) => a.type))].sort();
for (const type of TYPES) {
  const row = C.sprites.filter((a) => a.type === type).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  test(`a ${type} downloaded on its own (${row.id}): the text is right for what it is, and names its licence value`, async ({ page }) => {
    await openRoute(page, `/sprite/${row.id}`);
    const { bytes } = await downloadFrom(page, () => page.locator('.rx-panel [data-act="download"]').click());
    const files = readZip(new Uint8Array(bytes));
    const text = (name) => new TextDecoder().decode(files.find((f) => f.name === name).data);
    const json = JSON.parse(text(`${row.id}.json`));
    expect(guideFaults({ row, json, text: text('how-to-use.txt') })).toEqual([]);
    expect(text('how-to-use.txt').split('\n')[0]).toContain(row.name);
    // nothing but the sheet, its facts, its sounds and the one text: the licence is said inside the text
    expect(files.map((f) => f.name).filter((n) => !n.startsWith('sounds/')).sort()).toEqual([`${row.id}.json`, `${row.id}.png`, 'how-to-use.txt'].sort());
  });
}
