// Tiny sprites for the "survives every look" check (quality/sprite.js, S-survives-looks).
// Each export is a function that returns a fresh defineSprite() result.
//
// A "look" here is a whole-bundle look: one of THEME_PRESETS in engine/theme.js.
import { defineSprite, range, color } from '../../../engine/sprite.js';

const META = { type: 'prop', role: 'environment/prop', themes: ['neutral'], gameTypes: ['platformer'], view: 'side', words: ['crate', 'box', 'stripes'], license: 'draft' };

// Two colours of the same lightness and different hue: every grey and every one-hue palette makes them one colour.
export const RED = '#c05a5a', GREEN = '#5a9a5a';
// Two colours of one hue, far apart in lightness: they stay apart under every look.
export const DARK = '#3a5a8a', LIGHT = '#c9d8ee';

// A striped crate: a 24 x 20 block at (4, 6) in 3-pixel stripes of two materials, a and b.
// Edges: 88 around the outside (see-through beside drawn), 7 x 20 = 140 between stripes.
export const STRIPES = { outline: 88, inside: 140 };
function crateDef({ a, b, base = false, clips = { closed: { frames: 1, fps: 1, loop: false } } }) {
  return {
    id: 'q-crate', name: 'Striped crate', kind: 'Item', blurb: 'Test crate.',
    meta: { ...META },
    size: [32, 32], pivot: [16, 26], grounded: false,
    params: {
      lift: range('Lift', 0, { lo: 'Down', hi: 'Up' }),
      trim: color('Trim', a, [a, '#888888', '#444444']),
    },
    clips,
    render(g, { clip }) {
      for (let s = 0; s < 8; s++) g.rect(4 + s * 3, 6, 3, 20, s % 2 ? b : a);
      if (base && clip === 'closed') g.rect(4, 26, 24, 2, DARK);   // a dark base under the stripes: 28 more edges, all of them left
    },
  };
}

// (warns) two materials told apart only by hue
export const hueOnly = () => defineSprite(crateDef({ a: RED, b: GREEN }));
// (clean) two materials told apart by lightness
export const lightnessApart = () => defineSprite(crateDef({ a: DARK, b: LIGHT }));
// (clean, must not crash) one colour only: nothing can merge
export const oneColour = () => defineSprite(crateDef({ a: RED, b: RED }));
// (warns once) the same two materials in two clips: one cause, one message
export const hueOnlyTwoClips = () => defineSprite(crateDef({ a: RED, b: GREEN, clips: { closed: { frames: 1, fps: 1, loop: false }, open: { frames: 1, fps: 1, loop: false } } }));
// (warns once, naming `open`) the same fault in two clips, worse in the second: 45% of the edges left in `closed`, 39% in `open`
export const hueOnlyWorseSecond = () => defineSprite(crateDef({ a: RED, b: GREEN, base: true, clips: { closed: { frames: 1, fps: 1, loop: false }, open: { frames: 1, fps: 1, loop: false } } }));

// A backdrop layer that fills its frame: a sky and a ridge in front of it. No see-through
// pixels, so there is no outline: the edge between the two colours is all there is.
function layerDef({ sky, ridge, id = 'q-layer' }) {
  return {
    id, name: 'Test layer', kind: 'Effect', blurb: 'Test layer.',
    meta: { ...META, type: 'background', role: 'environment/background', words: ['sky', 'ridge', 'backdrop'] },
    size: [48, 24], pivot: [24, 23], grounded: false,
    params: { lift: range('Lift', 0, { lo: 'Down', hi: 'Up' }) },
    clips: { far: { frames: 1, fps: 1, loop: false } },
    render(g) {
      for (let x = 0; x < 48; x++) {
        const top = 14 + Math.round(4 * Math.sin((2 * Math.PI * x) / 24));
        for (let y = 0; y < 24; y++) g.dot(x, y, ridge && y >= top ? ridge : sky);
      }
    },
  };
}
// (warns) a ridge a little greyer than the sky behind it and hardly darker: the known fault of a real backdrop
export const SKY = '#7fb0d8', RIDGE = '#8fb6c8';
export const ridgeLikeSky = () => defineSprite(layerDef({ sky: SKY, ridge: RIDGE }));
// (clean) the same ridge, clearly darker than the sky
export const ridgeDarker = () => defineSprite(layerDef({ sky: '#a9d6ee', ridge: '#3d6698' }));
// (clean, must not crash) a frame filled with one colour: no edges at all
export const flatFill = () => defineSprite(layerDef({ sky: SKY, ridge: null, id: 'q-flat' }));
