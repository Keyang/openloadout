// The scenery generators that work in frame pixels by design (migration batch M10, engine/gen/scenery.js), each with why.
// Kept in a module that imports nothing, as engine/gen/backdrop-frame.js is, so engine/gen/index.js can read it while
// engine/gen/scenery.js is still loading (scenery.js imports backdrop.js, which imports engine/resolve.js, which imports
// index.js).
//
// Pure data: runs unchanged in the browser and in Node.

const WRAPS = 'places things across the layer\'s width and wraps them at its edges: name it in a layers body, not on a node';
const FILLS = 'fills whole columns of the layer and repeats across its width: name it in a layers body, not on a node';

/** The generators of engine/gen/scenery.js that work in frame pixels by design (engine/gen/index.js FRAME_GENERATORS), each with why: "<id>@<v>" -> reason. */
export const SCENERY_FRAME_GENERATORS = Object.freeze({
  'tidy@1': 'takes off single pixels across the layer\'s width, wrapping at its edges: name it in a layers body, not on a node',
  'tall.trees@1': WRAPS,
  'round.trees@1': WRAPS,
  'towers@1': WRAPS,
  'far.house@1': 'wraps at the layer\'s edges, so it works in frame columns: name it in a layers body, not on a node',
  'castle.wall@1': FILLS,
  'battlements@1': FILLS,
  'arcade@1': FILLS,
  'pillars@1': WRAPS,
  'banners@1': WRAPS,
  'wall.torches@1': WRAPS,
  'ground.marks@1': WRAPS,
  'paved.course@1': FILLS,
  'rail.fence@1': FILLS,
  'castle.columns@1': WRAPS,
  'edge.band@1': FILLS,
  'tufts@1': FILLS,
  'towers@2': WRAPS,
  'banners@2': WRAPS,
  'stand.apart@1': 'a colour rule: its sample is a swatch of the whole frame',
});
