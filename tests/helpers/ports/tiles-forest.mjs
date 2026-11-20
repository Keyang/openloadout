// Writer of sprites/tiles-forest.json (migration batch M5), kept for audit as B15b kept
// tests/helpers/ports/tiles-platforms.mjs: the code tileset tiles-forest.js (frozen in tests/fixtures/code-sprites/)
// redrawn as data. tests/unit/library-tiles-m5.test.mjs holds the library file to what this writes.
// Usage: node tests/helpers/ports/tiles-forest.mjs [--write]   (says whether the library file is what this writes; writes it)
//
// The material (edges, insets, ragged cap, roots, ledge underside) is written as band rules and profiles from reading
// the code; the fill versions' marks and the three decals are traced from the code's pixels into stamps keyed to
// palette slots, each mark behind the Texture threshold at which the code adds it.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const L = new URL('../../../', import.meta.url).href;   // the project folder
const { codeSprite } = await import(L + 'tests/helpers/library.mjs');
const { renderFrame, defaultParams } = await import(L + 'engine/sprite.js');
const { INK, col } = await import(L + 'engine/color.js');
const { edgeWave } = await import(L + 'engine/tiles.js');
const { resolvePalette, paintHex } = await import(L + 'engine/resolve.js');
const { fixtureText } = await import(L + 'tests/helpers/ports/tiles-platforms.mjs');
const code = await codeSprite('tiles-forest');
const D = defaultParams(code);

const DIPS = [0, 0, 0, 0.3, 0.67, 1, 1, 0.67, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.67, 1, 1, 0.67, 0.3, 0, 0, 0];
const HANG = [1, 2, 1, 0, 0, 1, 2, 3, 2, 0, 0, 1, 1, 0, 2, 3, 1, 0, 0, 1, 2, 1, 0, 0, 1, 3, 2, 1, 0, 0, 2, 1];
const UNDER = [0, 0, 1, 1, 2, 1, 0, 1, 2, 3, 2, 1, 1, 0, 0, 1, 2, 2, 1, 0, 1, 1, 2, 3, 2, 1, 0, 0, 1, 1, 0, 0];
const ROOTS = [{ u: 6, len: 9 }, { u: 13, len: 6 }, { u: 19, len: 10 }, { u: 27, len: 7 }];
const U = [...Array(32).keys()];

// a step table: the value at round(x) of a slider whose whole steps are lo..hi (code rounds the slider first)
const steps = (key, lo, hi, f, round = 'px') => {
  const m = [];
  for (let v = lo; v <= hi; v++) {
    if (v > lo) m.push([v - 0.5, f(v)]);
    if (v < hi) m.push([v + 0.4999, f(v)]);
  }
  m.unshift([lo, f(lo)]); m.push([hi, f(hi)]);
  const out = []; for (const p of m) if (!out.length || p[0] > out.at(-1)[0]) out.push(p);
  // drop runs of the same value in the middle (keep the ends of each run)
  const lean = out.filter((p, i) => i === 0 || i === out.length - 1 || !(out[i - 1][1] === p[1] && out[i + 1][1] === p[1]));
  return lean.every((p) => p[1] === lean[0][1]) ? lean[0][1] : { from: key, map: lean, round };
};

const palette = [
  { id: 'grass', label: 'Grass', default: code.params.grass.def, material: 'plant', swatches: code.params.grass.swatches },
  { id: 'soil', label: 'Soil', default: code.params.soil.def, material: 'earth', swatches: code.params.soil.swatches },
  { id: 'stone', label: 'Stone', default: code.params.stone.def, material: 'stone', swatches: code.params.stone.swatches },
  { id: 'flowers', label: 'Flowers', default: code.params.flowers.def, material: 'plant', swatches: code.params.flowers.swatches },
  { id: 'clod', material: 'earth', derive: { rule: 'textureTone', of: 'soil' } },
  { id: 'pebble', material: 'stone', derive: { rule: 'textureTone', of: 'stone', against: 'soil' } },
  { id: 'pebble-lit', material: 'stone', derive: { rule: 'mix', of: 'stone', with: 'pebble', amount: 0.4 } },
  { id: 'root', material: 'wood', derive: { rule: 'mix', of: 'soil.light', with: 'soil', amount: 0.45 } },
  { id: 'petal-hi', material: 'plant', derive: { rule: 'mix', of: 'flowers.light', with: 'white', amount: 0.6 } },
];
const cp = code.params;
const controls = [
  { key: 'edge', kind: 'range', label: cp.edge.label, lo: cp.edge.lo, hi: cp.edge.hi, min: 5, max: 9, step: 1, default: 7 },
  { key: 'bumps', kind: 'range', label: cp.bumps.label, lo: cp.bumps.lo, hi: cp.bumps.hi, min: 0, max: 3, step: 1, default: 1 },
  { key: 'texture', kind: 'range', label: cp.texture.label, lo: cp.texture.lo, hi: cp.texture.hi, default: 0.5 },
  { key: 'roots', kind: 'toggle', label: cp.roots.label, default: false },
  { key: 'grass', kind: 'colour', label: 'Grass' }, { key: 'soil', kind: 'colour', label: 'Soil' },
  { key: 'stone', kind: 'colour', label: 'Stone' }, { key: 'flowers', kind: 'colour', label: 'Flowers' },
];

// ---- tracing pixels into stamps --------------------------------------------------------------------------------
const def0 = { format: 'loadout-sprite', version: 2, id: 'tiles-forest', palette, controls };
const pal = resolvePalette(def0, {});
const REFS = ['soil', 'clod', 'pebble', 'pebble-lit', 'grass', 'grass.light', 'grass.dark', 'flowers', 'flowers.light', 'flowers.dark', 'petal-hi', 'stone', 'stone.light', 'stone.dark', 'stone.deep'];
const hexMap = (refs) => { const m = new Map(); for (const r of refs) { const v = col(paintHex(r, pal, {})); if (!m.has(v)) m.set(v, r); } return m; };
const FILL_REFS = hexMap(['soil', 'clod', 'pebble', 'pebble-lit']);
const DECAL_REFS = hexMap(['grass', 'grass.light', 'grass.dark', 'flowers', 'flowers.light', 'flowers.dark', 'petal-hi', 'stone', 'stone.light', 'stone.dark', 'stone.deep']);
let byHex = FILL_REFS;
const ink = col(INK);
const KEYS = 'abcdefghijklmnop';
/** pixels (index -> packed colour) as one stamp, cut to their box */
function stampOf(px, extra = {}) {
  const idx = [...px.keys()];
  if (!idx.length) return null;
  const xs = idx.map((i) => i % 32), ys = idx.map((i) => Math.floor(i / 32));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const key = {}, letter = new Map(), rows = [];
  for (let y = y0; y <= y1; y++) {
    let row = '';
    for (let x = x0; x <= x1; x++) {
      const v = px.get(y * 32 + x);
      if (v === undefined) { row += '.'; continue; }
      const ref = byHex.get(v);
      if (!ref) throw new Error(`a colour that is no slot: #${(v >>> 0).toString(16)} at ${x},${y}`);
      if (!letter.has(ref)) { letter.set(ref, KEYS[letter.size]); key[KEYS[letter.size - 1]] = ref; }
      row += letter.get(ref);
    }
    rows.push(row);
  }
  return { kind: 'stamp', at: [x0, y0], rows, key, ...extra };
}
/** pixels split into marks: groups of pixels that touch (8 ways) */
function parts(px) {
  const left = new Set(px.keys()), out = [];
  while (left.size) {
    const first = left.values().next().value, group = new Map(), todo = [first];
    left.delete(first);
    while (todo.length) {
      const i = todo.pop(); group.set(i, px.get(i));
      const x = i % 32, y = Math.floor(i / 32);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * 32 + x + dx; if (x + dx >= 0 && x + dx < 32 && left.has(j)) { left.delete(j); todo.push(j); } }
    }
    out.push(group);
  }
  return out.sort((a, b) => Math.min(...a.keys()) - Math.min(...b.keys()));
}
const frame = (clip, over) => renderFrame(code, clip, 0, { ...D, ...over }).data;

// a fill version: the base soil, then the marks each Texture level adds (busy = round(texture * 3))
const LEVELS = [[0, 0], [1, 1 / 6], [2, 0.5], [3, 5 / 6]];
function fillVersion(clip) {
  const soil = col(D.soil), out = [];
  let prev = new Uint32Array(1024).fill(soil);
  for (const [b, at] of LEVELS) {
    const g = frame(clip, { texture: b / 3 });
    const px = new Map();
    for (let i = 0; i < 1024; i++) if (g[i] !== prev[i]) px.set(i, g[i]);
    for (const part of parts(px)) out.push(stampOf(part, b ? { when: { texture: [{ atLeast: at }] } } : {}));
    prev = g;
  }
  return out;
}
// a decal: every pixel but the outline (the layout outlines it when the decal says outline: true)
function decal(clip) {
  byHex = DECAL_REFS;
  const g = frame(clip, {}), px = new Map();
  for (let i = 0; i < 1024; i++) if ((g[i] >>> 24) && g[i] !== ink) px.set(i, g[i]);
  return [stampOf(px)];
}

// ---- the material ---------------------------------------------------------------------------------------------
// the ragged cap: min(3 - HANG, edge - 4) px shorter. As profile x amount (rounded): 3 - HANG with 3 written 2.5, so
// amount 1 gives 0..3, 0.9 caps it at 2 (edge 6) and 0.55 at 1 (edge 5)
const RAG = HANG.map((h) => (h === 0 ? 2.5 : 3 - h));
const leftDent = U.map((u) => (edgeWave(u, 23, [2, 3]) > 0.8 ? 1 : 0));
const rightDent = U.map((u) => (edgeWave(u, 29, [2, 3]) > 0.8 ? 1 : 0));
const underRoots = U.map((u) => (ROOTS.some((r) => Math.abs(u - r.u) <= 1) ? 0 : UNDER[u]));
// UNDER for the bottom inset, scaled so that x 1 gives UNDER and x 0.8 gives UNDER with the root columns at 0
const UNDER_P = U.map((u) => (underRoots[u] === 0 && UNDER[u] === 1 ? 0.55 : underRoots[u] === 0 ? 0 : UNDER[u] === 3 ? 3.2 : UNDER[u]));
for (const u of U) { if (Math.round(UNDER_P[u]) !== UNDER[u] || Math.round(UNDER_P[u] * 0.8) !== underRoots[u]) throw new Error('UNDER_P at ' + u); }
const rootCol = U.map((u) => { const k = ROOTS.findIndex((r) => r.u === u); return k + 1; });
const rootKink = U.map((u) => { const k = ROOTS.findIndex((r) => r.u + 1 === u); return k + 1; });
const bumps = steps('bumps', 0, 3, (v) => v);
const anyBumps = steps('bumps', 0, 3, (v) => (v ? 1 : 0));
const material = {
  fill: { base: 'soil', versions: ['grass-fill', 'grass-fill-b', 'grass-fill-c'].map(fillVersion) },
  round: 1,
  edges: {
    top: {
      depth: steps('edge', 5, 9, (v) => v), wrap: 4, tuck: true,
      inset: { profile: 'dips', amount: bumps },
      ragged: { profile: 'rag', amount: steps('edge', 5, 9, (v) => (v === 5 ? 0.55 : v === 6 ? 0.9 : 1), 'none') },
      bands: [
        { rows: 'last', paint: 'soil.dark' },
        { rows: [1, 1], paint: 'grass.light' },
        { rows: 'last-1', paint: 'grass.dark' },
        { rows: [2, 2], where: { profile: 'hang', in: [0] }, paint: 'grass.light' },
        // the hanging clumps in shade: from row max(3, here - 3), here being the cap's depth at that column
        // the hanging clumps in shade: from row max(3, here - 3), here being the cap's depth at that column (edge - 1
        // where hang is 2, edge where it is 3); rows above that start stay grass, deeper Edge first
        ...[[2, 4], [3, 3]].flatMap(([h, back]) => [9, 8, 7, 6].filter((e) => e - back > 3).map((e) => (
          { rows: [3, e - back - 1], where: { profile: 'hang', in: [h] }, paint: 'grass', when: { edge: [{ atLeast: e - 0.5 }] } }))),
        { rows: [3, 99], where: { profile: 'hang', in: [2, 3] }, paint: 'grass.dark' },
        { rows: [1, 99], paint: 'grass' },
      ],
    },
    left: { depth: 1, inset: { profile: 'dent-l', amount: anyBumps }, bands: [{ rows: [1, 99], paint: 'soil.dark' }] },
    right: { inset: { profile: 'dent-r', amount: anyBumps } },
    bottom: {
      depth: { from: 'roots', pick: { true: 11, false: 2 } }, tuck: 2,
      // UNDER, but 0 round a root when roots are on: as profile x amount (rounded), 1 off and 0.8 on
      inset: { profile: 'under', amount: { from: 'roots', pick: { true: 0.8, false: 1 } } },
      bands: [
        ...ROOTS.flatMap((r, k) => [
          { rows: [1, r.len - 3], where: { profile: 'root', in: [k + 1] }, paint: 'root', when: { roots: [true] } },
          { rows: [r.len - 2, r.len], where: { profile: 'root-kink', in: [k + 1] }, paint: 'root', when: { roots: [true] } },
        ]),
        { rows: [1, 2], paint: 'soil.dark' },
      ],
    },
  },
};

const labels = Object.fromEntries(Object.entries(code.clips).map(([n, c]) => [n, { label: c.label }]));
const def = {
  format: 'loadout-sprite', version: 2, id: 'tiles-forest', name: code.name, blurb: code.blurb,
  size: [32, 32], pivot: [16, 16], grounded: false, preview: code.preview, styles: ['pixel'],
  meta: code.meta, palette, controls,
  body: { tiles: { tile: 32,
    profiles: { dips: DIPS, hang: HANG, rag: RAG, 'dent-l': leftDent, 'dent-r': rightDent, under: UNDER_P,
                'under-ledge': UNDER.map((v) => Math.min(1, v)), root: rootCol, 'root-kink': rootKink },
    groups: [ { name: 'grass', kind: 'block', use: 'ground', pieces: ['block', 'narrow', 'thin', 'slope'], fills: 3, thickness: 12,
      under: { depth: 1, inset: { profile: 'under-ledge', amount: 1 }, bands: [{ rows: [1, 99], paint: 'soil.dark' }] },
      material,
      decals: [
        { name: 'a', place: 'above', label: code.clips['grass-deco-a'].label, outline: false, draw: decal('grass-deco-a') },
        { name: 'b', place: 'above', label: code.clips['grass-deco-b'].label, outline: false, draw: decal('grass-deco-b') },
        { name: 'c', place: 'above', label: code.clips['grass-deco-c'].label, outline: true, draw: decal('grass-deco-c') },
      ] } ] } },
  clips: labels,
};

/** The library file this writes. */
export const LIBRARY_FILE = fileURLToPath(new URL('../../../sprites/tiles-forest.json', import.meta.url));
/** The text of sprites/tiles-forest.json as this writes it. */
export const written = () => fixtureText(def);

// node tests/helpers/ports/tiles-forest.mjs [--write]: says whether sprites/tiles-forest.json is what this writes (--write writes it)
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const text = written();
  if (process.argv.includes('--write')) { fs.writeFileSync(LIBRARY_FILE, text); console.log('wrote', LIBRARY_FILE, Buffer.byteLength(text), 'bytes'); }
  else { const same = fs.existsSync(LIBRARY_FILE) && fs.readFileSync(LIBRARY_FILE, 'utf8') === text; console.log(same ? 'the library file is what this writes' : 'the library file differs from what this writes (--write to write it)'); process.exitCode = same ? 0 : 1; }

}
