// The studio's starting points for version 2 sprites (build item B17; docs/data-sprites.md section 6): one small,
// valid template per body (rig, tiles, layers, panel, emitters, pictures), each showing what its body is made of (a
// node tree with shapes, a stamp and a generator call; emitters keyed on and off; layers of generators; a panel piece
// with its states; a tile group with its material and edges; bones with shapes and a stamp on them). They name no
// piece, so a new draft opens without waiting for one. tests/unit/studio-v2-templates.test.mjs holds each to the
// validator and draws every frame. Pure data: browser and Node.

const META = (type, role, view, words) => ({ type, role, view, themes: ['neutral'], gameTypes: ['platformer'], words, license: 'draft' });

/** The templates, by body: each a function of nothing giving a fresh definition (the id and name are set by v2Template). */
const TEMPLATES = {
  pictures: () => ({
    format: 'loadout-sprite', version: 2, id: 'gem', name: 'Gem', blurb: 'A bobbing gem with a glint: shapes, a stamp and a generator on a node.',
    size: [32, 32], pivot: [16, 30], grounded: false, preview: 'idle',
    meta: META('pickup', 'items/pickup', 'front', ['gem', 'jewel', 'pickup', 'treasure']),
    palette: [
      { id: 'gem', label: 'Gem', default: '#3fbf9b', material: 'magic' },
      { id: 'shine', label: 'Shine', default: '#ffffff', material: 'light', detail: true },
    ],
    controls: [
      { key: 'size', kind: 'range', label: 'Size', lo: 'Small', hi: 'Big', default: 0.5 },
      { key: 'glint', kind: 'toggle', label: 'Glint', default: true },
      { key: 'bob', kind: 'range', label: 'Float', lo: 'Still', hi: 'Floaty', default: 0.5, group: 'Motion' },
      { key: 'speed', standard: 'speed' },
    ],
    body: { pictures: {
      nodes: [{ id: 'gem', parent: null, at: [16, 16] }],
      draw: [
        { id: 'body', kind: 'ellipse', on: 'gem', at: [0, 0], r: [{ from: 'size', map: [[0, 5], [1, 9]] }, { from: 'size', map: [[0, 6], [1, 10]] }], paint: 'gem', shade: 1, light: 1 },
        { id: 'facet', kind: 'stamp', on: 'gem', at: [-3, -4], rows: ['.aa', 'ab.', 'b..'], key: { a: 'gem.light', b: 'shine' } },
        { kind: 'outline', paint: 'ink' },
        { id: 'glint', gen: 'glint', v: 2, on: 'gem', at: [0, 0], r: { from: 'size', map: [[0, 5], [1, 9]] }, paint: 'shine', when: { glint: [true] },
          within: [{ kind: 'ellipse', at: [0, 0], r: [{ from: 'size', map: [[0, 4], [1, 8]] }, { from: 'size', map: [[0, 5], [1, 9]] }], paint: 'gem' }] },
      ],
      motion: [{ gen: 'pickup.bob', v: 1, clip: ['idle'], height: { from: 'bob', map: [[0, 0], [1, 2]] } }],
      emitters: [{ id: 'burst', gen: 'pickup.burst', v: 1, on: 'gem', at: [0, 0], reach: { from: 'size', map: [[0, 8], [1, 12]] }, paint: 'gem', bright: 'gem.light', core: 'shine' }],
    } },
    clips: {
      idle: { label: 'Bob', frames: 8, fps: 10 },
      collect: { label: 'Collect', frames: 6, fps: 12, loop: false, keys: [{ t: 0, ease: 'hold', emit: { burst: { amount: 0 } } }, { t: 0.4, emit: { burst: { amount: 1 } } }] },
    },
  }),

  emitters: () => ({
    format: 'loadout-sprite', version: 2, id: 'spark', name: 'Spark burst', blurb: 'A burst of sparks: two emitters, keyed on and off in the clip.',
    size: [32, 32], pivot: [16, 16], grounded: false, preview: 'hit',
    meta: META('effect', 'effects/spark', 'none', ['spark', 'hit', 'burst', 'impact']),
    palette: [{ id: 'spark', label: 'Sparks', default: '#ffd060', material: 'fire' }],
    controls: [
      { key: 'sparks', kind: 'range', label: 'Sparks', lo: 'Few', hi: 'Many', default: 0.5 },
      { key: 'size', kind: 'range', label: 'Spread', lo: 'Tight', hi: 'Wide', default: 0.5 },
    ],
    body: { emitters: [
      { id: 'sparks', gen: 'particles', v: 1, at: [16, 16], count: { from: 'sparks', map: [[0, 4], [1, 12]], round: 'px' }, seed: 2, loop: false, arc: 360, dist: { from: 'size', map: [[0, 8], [1, 13]] }, size: 2, paints: ['spark.light', 'spark', 'spark.dark'], glow: true },
      { id: 'flash', gen: 'starburst', v: 1, at: [16, 16], points: 4, r: [3, 9], paints: ['spark.light'], glow: true },
    ] },
    clips: { hit: { label: 'Hit', frames: 5, fps: 18, loop: false, keys: [{ t: 0, emit: { flash: { amount: 1 }, sparks: { amount: 1 } } }, { t: 0.5, emit: { flash: { amount: 0 } } }] } },
  }),

  layers: () => ({
    format: 'loadout-sprite', version: 2, id: 'hills', name: 'Hills backdrop', blurb: 'Sky, mountains and hills with trees, in two scrolling layers of generators.',
    size: [320, 180], pivot: [160, 180],
    meta: META('background', 'environment/background', 'side', ['hills', 'sky', 'mountains', 'backdrop', 'parallax']),
    palette: [
      { id: 'sky', label: 'Sky', default: '#7fb8e0', material: 'sky' },
      { id: 'cloud', label: 'Clouds', default: '#f0f4f8', material: 'sky' },
      { id: 'rock', label: 'Mountains', default: '#6a7280', material: 'stone' },
      { id: 'back', label: 'Hills', default: '#4a7a4a', material: 'plant' },
      { id: 'leaf', label: 'Trees', default: '#2f5a32', material: 'plant' },
    ],
    controls: [
      { key: 'time', kind: 'range', label: 'Time of day', lo: 'Dawn', hi: 'Dusk', default: 0.5 },
      { key: 'clouds', kind: 'range', label: 'Clouds', lo: 'Few', hi: 'Many', default: 0.5 },
      { key: 'height', kind: 'range', label: 'Mountains', lo: 'Low', hi: 'High', default: 0.5 },
      { key: 'density', kind: 'range', label: 'Trees', lo: 'Sparse', hi: 'Dense', default: 0.5 },
    ],
    body: { layers: [
      { name: 'far', scroll: 0.1, draw: [
        { gen: 'sky.bands', v: 1, paint: { rule: 'sky.look', v: 1, of: 'sky', time: { from: 'time' } }, bands: 6 },
        { gen: 'scatter', v: 1, seed: 12, stable: true, count: { from: 'clouds', map: [[0, 2], [1, 8]], round: 'px' }, place: { gen: 'cloud', v: 1, paint: 'cloud' }, rows: [14, 59] },
        { gen: 'ridge', v: 1, base: 156, height: { from: 'height', map: [[0, 44], [1, 84]] }, seed: 3, peaks: 4, shape: 'jagged', rough: 0.55, paint: 'rock', litEdge: { depth: 0.75, paint: 'rock.light' } },
      ] },
      { name: 'mid', scroll: 0.4, draw: [
        { gen: 'ridge', v: 1, id: 'hill', base: 150, seed: 7, peaks: 3, paint: 'back' },
        { gen: 'treeline', v: 1, on: 'hill', clumps: { from: 'density', map: [[0, 4], [1, 11]], round: 'px' }, tall: 12, seed: 4, paint: 'leaf' },
      ] },
    ] },
  }),

  panel: () => ({
    format: 'loadout-sprite', version: 2, id: 'button', name: 'Button', blurb: 'A button in four states, drawn by one interface generator: change its corner, look and glint.',
    size: [64, 24], pivot: [32, 12], grounded: false, preview: 'normal',
    meta: META('ui', 'interface/button', 'none', ['button', 'menu', 'interface']),
    palette: [
      { id: 'face', label: 'Face', default: '#3f6fd1', material: 'paint' },
      { id: 'frame', label: 'Frame', default: '#f0ead8', material: 'paint' },
    ],
    controls: [
      { key: 'corner', kind: 'range', label: 'Corner', lo: 'Square', hi: 'Round', default: 0.5 },
      { key: 'glint', kind: 'toggle', label: 'Glint', default: true },
    ],
    body: { panel: {
      piece: { gen: 'ui.button', v: 1, clip: ['normal', 'hover', 'pressed', 'disabled'], at: [1, 1], size: [62, 22], bevel: 'lit', corner: { from: 'corner', map: [[0, 0], [1, 4]] }, glint: { from: 'glint' }, face: 'face', frame: 'frame' },
      states: { normal: {}, hover: {}, pressed: { lip: 0 }, disabled: { desaturate: 1 } },
    } },
    clips: { normal: { frames: 1, fps: 8 }, hover: { frames: 1, fps: 8 }, pressed: { frames: 1, fps: 8, sounds: [] }, disabled: { frames: 1, fps: 8 } },
  }),

  tiles: () => ({
    format: 'loadout-sprite', version: 2, id: 'ground', name: 'Grassy ground', blurb: 'Ground tiles that join in every direction: a fill, a grass edge of bands and a tuft.',
    size: [32, 32], pivot: [16, 16],
    meta: META('tileset', 'world/tile', 'side', ['grass', 'ground', 'soil', 'tiles', 'terrain']),
    palette: [
      { id: 'soil', label: 'Soil', default: '#7a5236', material: 'earth' },
      { id: 'grass', label: 'Grass', default: '#5aa040', material: 'plant' },
    ],
    controls: [
      { key: 'texture', kind: 'range', label: 'Clods', lo: 'Smooth', hi: 'Lumpy', default: 0.5 },
      { key: 'edge', kind: 'range', label: 'Grass depth', lo: 'Thin', hi: 'Deep', min: 5, max: 9, default: 7 },
    ],
    body: { tiles: {
      tile: 32,
      profiles: { hang: [1, 2, 1, 0, 0, 1, 2, 3, 2, 0, 0, 1, 1, 0, 2, 3, 1, 0, 0, 1, 2, 1, 0, 0, 1, 3, 2, 1, 0, 0, 2, 1] },
      groups: [{ name: 'grass', kind: 'block', use: 'ground', pieces: ['block', 'narrow', 'thin'], fills: 1,
        material: {
          fill: { base: 'soil', versions: [[{ gen: 'scatter', v: 1, seed: 41, count: { from: 'texture', map: [[0, 0], [1, 3]], round: 'px' }, margin: 4, gap: 10, place: { kind: 'stamp', rows: ['.a.', 'aa.'], key: { a: 'soil.dark' } } }]] },
          edges: {
            top: { depth: { from: 'edge', map: [[5, 5], [9, 9]] }, wrap: 4, tuck: true,
              bands: [{ rows: 'last', paint: 'soil.dark' }, { rows: [1, 1], paint: 'grass.light' }, { rows: 'last-1', paint: 'grass.dark' }, { rows: [3, 99], where: { profile: 'hang', in: [2, 3] }, paint: 'grass.dark' }, { rows: [1, 99], paint: 'grass' }] },
            left: { depth: 1, bands: [{ rows: [1, 1], paint: 'soil.dark' }] },
          } },
        decals: [{ name: 'a', place: 'above', label: 'Grass tuft', outline: false, draw: [{ kind: 'stamp', at: [10, 30], rows: ['...........b', '....b.b.....'], key: { b: 'grass.light' } }] }] }],
    } },
  }),

  rig: () => ({
    format: 'loadout-sprite', version: 2, id: 'blob', name: 'Blob', blurb: 'A blob on three bones that oozes, hops and squishes, with a stamp for its shine.',
    size: [48, 48], pivot: [24, 44], grounded: true, preview: 'idle',
    meta: META('creature', 'characters/enemy', 'side', ['blob', 'slime', 'goo', 'ooze']),
    palette: [
      { id: 'goo', label: 'Goo', default: '#5cbf60', material: 'water' },
      { id: 'eye', label: 'Eyes', default: '#231b33', detail: true },
      { id: 'shine', label: 'Shine', default: '#ffffff', material: 'light', detail: true },
    ],
    controls: [
      { key: 'size', kind: 'range', label: 'Size', lo: 'Small', hi: 'Big', default: 0.5, scales: { bones: ['base', 'front', 'back'], by: [0.8, 1.2] } },
      { key: 'speed', standard: 'speed' },
    ],
    body: { rig: {
      bones: [
        { id: 'base', parent: null, at: [24, 35], angle: 180, length: 8, label: 'Body' },
        { id: 'front', parent: 'base', from: 0, angle: -90, length: 3.5, label: 'Front' },
        { id: 'back', parent: 'base', from: 0, angle: 90, length: 3.5, label: 'Back' },
      ],
      shapes: [
        { id: 'dome', bone: 'base', kind: 'capsule', from: 0, to: 0.6, r: [7, 6], paint: 'goo', z: 10, group: 'goo', light: 1 },
        { id: 'lobeF', bone: 'front', kind: 'capsule', from: 0, to: 1, r: [4.5, 4.5], paint: 'goo', z: 10, group: 'goo', light: 1 },
        { id: 'lobeB', bone: 'back', kind: 'capsule', from: 0, to: 1, r: [4.5, 4.5], paint: 'goo', z: 10, group: 'goo', light: 1 },
        { id: 'eye', bone: 'base', kind: 'dot', at: [4, -0.5], size: 2, paint: 'eye', z: 30 },
        { id: 'eye2', bone: 'base', kind: 'dot', at: [4, -4.5], size: 2, paint: 'eye', z: 30 },
        { id: 'gleam', kind: 'stamp', on: 'base', at: [9, 4], rows: ['.a', 'a.'], key: { a: 'shine' }, z: 31 },
      ],
    } },
    clips: {
      idle: { label: 'Ooze', frames: 8, fps: 8, loop: true, keys: [{ t: 0, root: [0, 0], stretch: { base: 1 } }, { t: 0.5, root: [0, 1], stretch: { base: 0.9 } }] },
      hop: { label: 'Hop', frames: 8, fps: 10, loop: true, keys: [{ t: 0, root: [0, 0], stretch: { base: 0.85 } }, { t: 0.25, root: [0, -6], stretch: { base: 1.15 } }, { t: 0.5, root: [0, -8], stretch: { base: 1.05 } }, { t: 0.75, root: [0, -3], stretch: { base: 1 } }] },
      hurt: { label: 'Hurt', frames: 4, fps: 10, loop: false, keys: [{ t: 0, root: [0, 0] }, { t: 0.5, root: [-2, 0], stretch: { base: 0.8 } }, { t: 1, root: [0, 0] }], frameEdits: { 0: { flash: true } } },
    },
  }),
};

/** Each body's start in everyday words: [{ id ('v2-<body>'), body, label, blurb }]. */
export function v2Starts() {
  return [
    { id: 'v2-pictures', body: 'pictures', label: 'Prop, pickup or icon', blurb: 'Shapes, stamps and generators on a few nodes.' },
    { id: 'v2-rig', body: 'rig', label: 'Character on bones', blurb: 'Bones, shapes on them, stamps, key poses.' },
    { id: 'v2-emitters', body: 'emitters', label: 'Effect', blurb: 'Emitters of sparks, smoke and the like, keyed in time.' },
    { id: 'v2-panel', body: 'panel', label: 'Interface piece', blurb: 'A button, bar or panel in its states.' },
    { id: 'v2-layers', body: 'layers', label: 'Background', blurb: 'Layers that scroll, each a list of generators.' },
    { id: 'v2-tiles', body: 'tiles', label: 'Tileset', blurb: 'Ground that joins up: a material, edges and decals.' },
  ];
}

/**
 * A fresh template definition for a body, named `name` (its id is set by whoever keeps it), made { in: 'studio', from:
 * 'template:v2-<body>' }; null for a body that has none. Arguments: body ('pictures', 'rig', ...), { name }.
 */
export function v2Template(body, { name } = {}) {
  if (!Object.hasOwn(TEMPLATES, body)) return null;
  const d = TEMPLATES[body]();
  if (typeof name === 'string' && name.trim()) d.name = name.trim().slice(0, 60);
  d.made = { in: 'studio', from: `template:v2-${body}` };
  return d;
}
