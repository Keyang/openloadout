// A code sprite for tests that need one, under an id no library sprite uses, so they keep working while the library's
// code sprites are redrawn as data (docs/data-sprites.md section 7: every one of them, in batches M1 to M40) and after.
//
// In Node (unit tests that import app/catalog.js): useCodeStandIn() makes `import('../sprites/<CODE_STANDIN>.js')`
// load the frozen copy of the old code coin (tests/fixtures/code-sprites/coin.js) with its id set to CODE_STANDIN.
// Nothing is written into sprites/.
// In a browser test: serveCodeStandIn(page, source) adds a catalogue row for the id (src sprites/<id>.js, so the site
// imports it as a code file) and answers sprites/<id>.js with the source given.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

/** The stand-in code sprite's id: no file in sprites/ has it, and no library sprite will. */
export const CODE_STANDIN = 'test-code-standin';

/** The frozen old code coin the stand-in is made from (its drawing is the pre-P1 sprites/coin.js). */
export const CODE_STANDIN_SOURCE = path.join(ROOT, 'tests', 'fixtures', 'code-sprites', 'coin.js');

let hooked = false;
/** Node only: from now on, sprites/<CODE_STANDIN>.js imports as the frozen code coin with id CODE_STANDIN (once per process). */
export function useCodeStandIn() {
  if (hooked) return;
  hooked = true;
  const url = pathToFileURL(CODE_STANDIN_SOURCE).href + '?standin';
  const file = new RegExp(`(^|/)sprites/${CODE_STANDIN}\\.js(\\?.*)?$`);
  registerHooks({
    resolve(specifier, context, next) {
      if (file.test(specifier)) return { url, format: 'module', shortCircuit: true };
      return next(specifier, context);
    },
    load(u, context, next) {
      if (u !== url) return next(u, context);
      const text = fs.readFileSync(CODE_STANDIN_SOURCE, 'utf8');
      if (!text.includes("id: 'coin',")) throw new Error(`${CODE_STANDIN_SOURCE}: its id line moved; update tests/helpers/code-standin.mjs`);
      return { format: 'module', source: text.replace("id: 'coin',", `id: '${CODE_STANDIN}',`), shortCircuit: true };
    },
  });
}

/**
 * A catalogue row for a stand-in code sprite, as the build writes one for a code file.
 * id, name: its id and name; clips: [{ name, frames, fps, loop }]; size, pivot: its frame and pivot.
 */
export function codeStandInRow({ id = CODE_STANDIN, name = 'Test badge', clips, size = [24, 24], pivot = [12, 22], controls = 0 }) {
  return {
    id, kind: 'sprite', name, description: 'A sprite for tests.', type: 'pickup', role: 'items/pickup', themes: [], gameTypes: [], view: 'front',
    words: [], license: 'draft', styles: ['pixel'], bundles: [], src: `sprites/${id}.js`,
    tech: { frame: size, pivot, grounded: true, clips: clips.map((c) => ({ label: c.name[0].toUpperCase() + c.name.slice(1), loop: true, ...c })), controls, parts: [], sounds: 0, soundIds: [], versions: 0 },
    thumb: null, strip: null,
  };
}

/**
 * Browser tests: serve a code sprite under an id no library sprite uses. The page's catalogue gets `row` added
 * (codeStandInRow), and sprites/<row.id>.js answers with `source` (a module whose default export is the sprite).
 * Call before the page opens.
 */
export async function serveCodeStandIn(page, source, row) {
  await page.route(/\/generated\/catalog\.json(\?.*)?$/, async (r) => {
    const res = await r.fetch();
    const body = await res.json();
    body.assets = [...body.assets.filter((a) => a.id !== row.id), row];
    await r.fulfill({ response: res, json: body });
  });
  await page.route(new RegExp(`/sprites/${row.id}\\.js(\\?.*)?$`), (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: source }));
}
