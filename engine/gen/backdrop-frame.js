// The backdrop generators that work in frame pixels by design (build item B14), each with why. Kept in a module that
// imports nothing, so engine/gen/index.js can read it while engine/gen/backdrop.js is still loading: backdrop.js imports
// engine/resolve.js, which imports engine/gen/index.js, so a page or tool that imports backdrop.js first would otherwise
// make index.js read this list before backdrop.js had made it. engine/gen/backdrop.js exports it again.
//
// Pure data: runs unchanged in the browser and in Node.

/** The generators of engine/gen/backdrop.js that work in frame pixels by design (engine/gen/index.js FRAME_GENERATORS), each with why: "<id>@<v>" -> reason. */
export const BACKDROP_FRAME_GENERATORS = Object.freeze({
  'scatter@1': 'places things across the whole frame (a layer\'s width, a tile) and, in a layer, wraps them at its edges: name it in a layers or tiles body, not on a node',
  'sky.bands@1': 'fills the whole layer\'s width with the sky: name it in a layers body, not on a node',
  'ridge@1': 'an outline that repeats across the layer\'s width, filled to a frame row: name it in a layers body, not on a node',
  'swell@1': 'an outline that repeats across the layer\'s width, filled to a frame row: name it in a layers body, not on a node',
  'fill.below@1': 'fills whole columns of the layer under an outline: name it in a layers body, not on a node',
  'fill.between@1': 'fills whole columns of the layer between outlines: name it in a layers body, not on a node',
  'mist.band@1': 'fills whole columns of the layer under a waving line: name it in a layers body, not on a node',
  'treeline@1': 'trees across the layer\'s width on an outline that repeats: name it in a layers body, not on a node',
  'cloud@1': 'wraps at the layer\'s edges, so it works in frame columns: name it in a layers body, not on a node',
  'disc@1': 'wraps at the layer\'s edges, so it works in frame columns: name it in a layers body, not on a node',
  'stars@1': 'places stars across the layer\'s width and wraps them: name it in a layers body, not on a node',
  'nebula@1': 'wraps at the layer\'s edges, so it works in frame columns: name it in a layers body, not on a node',
  'canopy@1': 'wraps at the layer\'s edges, so it works in frame columns: name it in a layers body, not on a node',
  'sky.look@1': 'a colour rule: its sample is a swatch of the whole frame',
  'space.look@1': 'a colour rule: its sample is a swatch of the whole frame',
  'haze@1': 'a colour rule: its sample is a swatch of the whole frame',
  'lit.tone@1': 'a colour rule: its sample is a swatch of the whole frame',
  'clear.of@1': 'a colour rule: its sample is a swatch of the whole frame',
});
