// A sprite for tests that need one under an id no library sprite uses, so they do not depend on what any real sprite
// declares. Since build item Z1 it is a DATA sprite (sprites/<id>.json served by the test, never a file in sprites/):
// app/catalog.js no longer imports code sprites (the build refuses them, R4a), so there is no code stand-in any more; the
// file keeps its name and the CODE_STANDIN id so the tests that use it keep their words.
//
// In Node (unit tests that import app/catalog.js): standInFetch(fetch) wraps the test's fake fetch so that
// `sprites/<CODE_STANDIN>.json` answers with the stand-in's file. Nothing is written into sprites/.
// In a browser test: serveCodeStandIn(page, definition, row) adds a catalogue row for the id (src sprites/<id>.json) and
// answers sprites/<id>.json with the definition given (standInDef() when it is left out).

/** The stand-in sprite's id: no file in sprites/ has it, and no library sprite will. */
export const CODE_STANDIN = 'test-code-standin';

/** The name the stand-in is shown under. */
export const STANDIN_NAME = 'Test badge';

/**
 * The stand-in as a data definition: a round badge (Size) with an emblem (plain, star or heart), whose colour only
 * matters with an emblem, a glow (with its own size and Metal colour) and, on a star only, a rim with a width.
 * Controls that only apply sometimes, one depending on another that is itself hidden (`when`, docs/data-sprites.md).
 */
export function standInDef(id = CODE_STANDIN) {
  const SW = (...hex) => hex;
  return {
    format: 'loadout-sprite', version: 2, id, name: STANDIN_NAME, blurb: 'A badge for tests.', size: [24, 24], pivot: [12, 22], grounded: false,
    meta: { type: 'pickup', role: 'items/pickup', view: 'front', themes: [], gameTypes: [], words: ['badge', 'test'], license: 'draft' },
    palette: [
      { id: 'plate', derive: { rule: 'tone', of: 'metal', by: -0.4 }, material: 'metal' },      // derived: it has no control, so the Colours tab has nothing until an emblem is chosen
      { id: 'inlay', label: 'Emblem colour', default: '#c9423a', material: 'paint', swatches: SW('#c9423a', '#3f6fd1', '#4f9d57') },
      { id: 'metal', label: 'Metal', default: '#e6c545', material: 'metal', swatches: SW('#e6c545', '#c2c9d6', '#c98a4a') },
    ],
    controls: [
      { key: 'size', kind: 'range', label: 'Size', lo: 'Small', hi: 'Big', default: 0.5 },
      { key: 'emblem', kind: 'choice', label: 'Emblem', options: ['plain', 'star', 'heart'], default: 'plain' },
      { key: 'inlay', kind: 'colour', label: 'Emblem colour', when: { emblem: ['star', 'heart'] } },
      { key: 'glow', kind: 'toggle', label: 'Glow', default: false },
      { key: 'glowSize', kind: 'range', label: 'Glow size', lo: 'Thin', hi: 'Wide', default: 0.5, when: { glow: [true] } },
      { key: 'metal', kind: 'colour', label: 'Metal', when: { glow: [true] } },
      { key: 'rim', kind: 'toggle', label: 'Rim', default: false, when: { emblem: ['star'] } },
      { key: 'rimWidth', kind: 'range', label: 'Rim width', lo: 'Thin', hi: 'Thick', default: 0.5, when: { rim: [true] } },
    ],
    body: { pictures: {
      nodes: [{ id: 'disc', parent: null, at: [12, 12] }],
      draw: [
        { id: 'glowRing', kind: 'ellipse', on: 'disc', at: [0, 0], r: [{ from: 'glowSize', map: [[0, 8], [1, 11]] }, { from: 'glowSize', map: [[0, 8], [1, 11]] }], paint: 'metal', when: { glow: [true] } },
        { id: 'face', kind: 'ellipse', on: 'disc', at: [0, 0], r: [{ from: 'size', map: [[0, 5], [1, 8]] }, { from: 'size', map: [[0, 5], [1, 8]] }], paint: 'plate', shade: 1, light: 1 },
        { id: 'star', kind: 'rect', on: 'disc', at: [-2, -2], size: [4, 4], paint: 'inlay', when: { emblem: ['star'] } },
        { id: 'heart', kind: 'rect', on: 'disc', at: [-3, -1], size: [6, 2], paint: 'inlay', when: { emblem: ['heart'] } },
        { id: 'rimLine', kind: 'rect', on: 'disc', at: [-4, -5], size: [8, { from: 'rimWidth', map: [[0, 1], [1, 3]], round: 'px' }], paint: 'plate.light', when: { emblem: ['star'], rim: [true] } },
        { kind: 'outline', paint: 'ink' }] } },
    clips: {
      idle: { frames: 4, fps: 6, keys: [{ t: 0, root: [0, 0] }, { t: 0.5, root: [0, -1] }, { t: 1, root: [0, 0] }] },
      flip: { frames: 4, fps: 8, keys: [{ t: 0, root: [0, 0] }, { t: 0.5, root: [0, -2] }, { t: 1, root: [0, 0] }] },
    },
    preview: 'idle',
  };
}

/** The stand-in's file as the site fetches it (JSON text). */
export const standInFile = (def = standInDef()) => `${JSON.stringify(def, null, 2)}\n`;

/**
 * Node: a fetch that answers `sprites/<CODE_STANDIN>.json` with the stand-in's file and everything else as `inner` does.
 * A fake fetch returns { ok, status, json } only; the answer here also has text(), which loadDataFile reads.
 */
export function standInFetch(inner, def = standInDef()) {
  const file = new RegExp(`(^|/)sprites/${CODE_STANDIN}\\.json(\\?.*)?$`);
  return async (url, ...rest) => {
    if (file.test(String(url))) { const text = standInFile(def); return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text }; }
    return inner(url, ...rest);
  };
}

/**
 * A catalogue row for the stand-in, as the build writes one for a data file.
 * id, name: its id and name; clips: [{ name, frames, fps, loop }]; size, pivot: its frame and pivot.
 */
export function codeStandInRow({ id = CODE_STANDIN, name = STANDIN_NAME, clips, size = [24, 24], pivot = [12, 22], controls = 0 }) {
  return {
    id, kind: 'sprite', name, description: 'A sprite for tests.', type: 'pickup', role: 'items/pickup', themes: [], gameTypes: [], view: 'front',
    words: [], license: 'draft', styles: ['pixel'], bundles: [], src: `sprites/${id}.json`,
    tech: { frame: size, pivot, grounded: true, clips: clips.map((c) => ({ label: c.name[0].toUpperCase() + c.name.slice(1), loop: true, ...c })), controls, parts: [], sounds: 0, soundIds: [], versions: 0 },
    thumb: null, strip: null,
  };
}

/**
 * Browser tests: serve the stand-in under an id no library sprite uses. The page's catalogue gets `row` added
 * (codeStandInRow), and sprites/<row.id>.json answers with `definition` (standInDef(row.id) when left out).
 * Call before the page opens.
 */
export async function serveCodeStandIn(page, definition, row) {
  const text = standInFile(definition ?? standInDef(row.id));
  await page.route(/\/generated\/catalog\.json(\?.*)?$/, async (r) => {
    const res = await r.fetch();
    const body = await res.json();
    body.assets = [...body.assets.filter((a) => a.id !== row.id), row];
    await r.fulfill({ response: res, json: body });
  });
  await page.route(new RegExp(`/sprites/${row.id}\\.json(\\?.*)?$`), (r) => r.fulfill({ status: 200, contentType: 'application/json', body: text }));
}
