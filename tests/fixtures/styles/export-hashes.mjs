// Used by tests/e2e/styles.spec.mjs, and by the one-off capture that wrote before-export.json.
// exportHashesInPage runs INSIDE the page (it is handed to page.evaluate), so it uses nothing from this file.

/**
 * For each sprite id: what the site's own export (app/bundle.js spriteFiles) makes, as SHA-1 hashes.
 *   png, json    the sheet at 1x with the default settings
 *   png2, json2  the sheet at 2x with seeded random settings and the "Frost" look
 * The JSON is hashed without its "sounds" block, so editing a sound never changes these.
 * Returns { browser, sprites: { id: { png, json, png2, json2, files: [names] } } }.
 */
export async function exportHashesInPage(ids) {
  const sha = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const [bundle, catalog, audio, S] = await Promise.all([import('/app/bundle.js'), import('/app/catalog.js'), import('/app/audio.js'), import('/engine/sprite.js')]);
  await catalog.loadCatalog();
  await audio.loadSounds();
  const dec = new TextDecoder(), enc = new TextEncoder();
  const out = { browser: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? navigator.userAgent, sprites: {} };
  for (const id of ids) {
    const sprite = await catalog.loadSprite(id);
    const pick = async (files) => {
      const png = files.find((f) => f.name === `${id}.png`), json = files.find((f) => f.name === `${id}.json`);
      const meta = JSON.parse(dec.decode(json.data));
      delete meta.sounds;
      return [await sha(png.data), await sha(enc.encode(JSON.stringify(meta, null, 2))), files.map((f) => f.name).filter((n) => !n.startsWith('sounds/'))];
    };
    const [png, json, files] = await pick(await bundle.spriteFiles(sprite, S.defaultParams(sprite), bundle.defaultCues(sprite), 1));
    const [png2, json2] = await pick(await bundle.spriteFiles(sprite, S.randomParams(sprite, 4242), bundle.defaultCues(sprite), 2, { colour: { palette: 'Frost' } }));
    out.sprites[id] = { png, json, png2, json2, files };
  }
  return out;
}
