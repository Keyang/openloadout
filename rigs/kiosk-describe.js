// What the kiosk robot rig (rigs/kiosk.js) has, as plain data a program can read: its poses, bodies, screen faces, the
// parts it can wear, what it can hold and its attach points, each with the function that draws it and the options
// that function takes. First step of Contract 13 (docs/architecture.md): a rig that lists itself.
//
//   import { RIG } from '../rigs/kiosk-describe.js';      // or (await loadout.framework).kioskDescribe.RIG, or generated/api.json -> rigs
//   node tools/rig.mjs kiosk                               // the same as tables; --sheet draws every part
//
// Names are '<module>.<export>' with the module's name on window.loadout.framework (kiosk = rigs/kiosk.js).
// tests/unit/rig-describe-*.test.mjs prove every line: each thing listed is drawn through the function named, and
// every export and every name list of rigs/kiosk.js is listed here. Add to the rig, add here, or those tests fail.
// The shape of a description is written out in docs/framework-api.md, section "Rigs".

const num = (min, max, def, what) => ({ min, max, default: def, ...(what ? { what } : {}) });
const GEAR = num(0.65, 1.35, 1, 'its Size setting; 1 = standard');
const FRONT = ['front'];

/** The kiosk robot rig described as data: id, view, frame, poses, body, parts, held kinds, sockets, and what overlaps. No arguments: a constant. */
export const RIG = {
  id: 'kiosk',
  name: 'Kiosk robot',
  about: 'A service machine that hovers in place over a jet and always faces the camera (a shop, a bank, a repair point), for top-down games. One drawing, no direction clips.',
  view: 'top-down',
  size: [48, 48],
  pivot: [24, 42],
  ground: 42,
  directions: FRONT,
  directionClips: false,
  modules: { kiosk: 'rigs/kiosk.js' },

  frames: [
    { fn: 'kiosk.frame', args: ['clip', 't', 'p', 'options'], what: 'One frame, posed and fitted once: F.draw(g, look), F.finish(g, look) (the outline, then the lights), F.sockets(). options: { shape, face, arms, headgear: { kind, size }, held: { kind, size }, frame }.' },
    { fn: 'kiosk.clips', what: 'The clip table for the poses a sprite uses, with the standard frames, speed and looping.' },
  ],
  // no hooks: draw() paints everything in this order, and what is worn or held is an option of frame()
  layers: [
    { name: 'body', what: 'the nozzle, the cabinet with its lit top, the screen and its face, the accent band, the hatch and coin slot, the tray' },
    { name: 'top', what: 'what stands on the cabinet' },
    { name: 'arms', what: 'the two arms' },
    { name: 'held', what: 'what is held out at its side' },
  ],

  poses: [
    { name: 'idle', fn: 'kiosk.pose', list: 'kiosk.POSES', table: 'kiosk.clips', frames: 8, fps: 7, loop: true, directions: FRONT, standardFor: ['idle'], options: { bob: num(0, 1, 0.5, 'the Float slider: how far it bobs') }, what: 'Hovering, with one blink.' },
    { name: 'talk', fn: 'kiosk.pose', list: 'kiosk.POSES', table: 'kiosk.clips', frames: 8, fps: 7, loop: true, directions: FRONT, standardFor: ['talk'], options: { bob: num(0, 1, 0.5) }, what: 'The face flickers between two expressions and the free arm waves.' },
    { name: 'sell', fn: 'kiosk.pose', list: 'kiosk.POSES', table: 'kiosk.clips', frames: 8, fps: 10, loop: false, directions: FRONT, standardFor: ['sell'], options: { bob: num(0, 1, 0.5) }, what: 'The hatch opens and a tray slides out towards the camera with something on it.' },
  ],

  body: {
    fn: 'kiosk.draw',
    dims: 'kiosk.dims',
    solve: 'kiosk.solve',
    controls: { size: num(0, 1, 0.5, 'the Size slider: the cabinet from 0.84 to 1.16 of its standard size') },
    look: { body: '#9aa6c0', accent: '#2fb3a8', glow: '#5fe0f0', metal: '#c2c9d6', dark: '#434d6d', goods: '#f2c230', sign: '#f0ead8', core: '#f0ead8' },
    kinds: [
      { name: 'boxy', list: 'kiosk.SHAPES', what: 'A cabinet with rounded corners.' },
      { name: 'round', list: 'kiosk.SHAPES', what: 'A wide drum.' },
      { name: 'capsule', list: 'kiosk.SHAPES', what: 'A tall narrow pill.' },
    ],
    features: [
      { name: 'face', option: 'face', choices: ['smile', 'dots', 'visor', 'one eye'], list: 'kiosk.FACES', what: 'What the screen shows; frame() takes it as `face`. It changes with the pose (rest, blink, a second expression).' },
    ],
  },

  hair: [],

  parts: [
    { name: 'antenna', fn: 'kiosk.draw', via: { option: 'headgear' }, list: 'kiosk.HEADGEAR', layer: 'top', socket: 'head', directions: FRONT, options: { size: GEAR }, what: 'A rod with a ball on top of the cabinet; it lags as the machine bobs.' },
    { name: 'dish', fn: 'kiosk.draw', via: { option: 'headgear' }, list: 'kiosk.HEADGEAR', layer: 'top', socket: 'head', directions: FRONT, options: { size: GEAR }, what: 'A small dish on a mast.' },
    { name: 'cap', fn: 'kiosk.draw', via: { option: 'headgear' }, list: 'kiosk.HEADGEAR', layer: 'top', socket: 'head', directions: FRONT, options: { size: GEAR }, what: "A shopkeeper's peaked cap." },
    { name: 'arms', fn: 'kiosk.draw', via: { option: 'arms', value: true, bare: false }, layer: 'arms', socket: 'offhand', directions: FRONT, options: {}, what: 'Two thin arms; the free one waves in talk and points at the hatch in sell. Without them a held thing sits on a bracket.' },
  ],

  held: [
    { name: 'sign', fn: 'kiosk.draw', via: { option: 'held' }, list: 'kiosk.HELD', layer: 'held', socket: 'hand', directions: FRONT, length: GEAR, clips: ['idle', 'talk', 'sell'], what: 'A plate on a pole with a coin on it.' },
    { name: 'tray', fn: 'kiosk.draw', via: { option: 'held' }, list: 'kiosk.HELD', layer: 'held', socket: 'hand', directions: FRONT, length: GEAR, clips: ['idle', 'talk', 'sell'], what: 'A tray of goods.' },
  ],

  effects: [
    { name: 'jet and sparkle', fn: 'kiosk.lights', via: { finish: {}, bareFinish: { lights: false } }, layer: 'after', directions: FRONT, shownWith: { pose: 'sell', t: 4 / 7 }, what: 'The jet under the nozzle, which always reaches the floor and flickers, and the sparkle on what lies on the tray. Drawn after the outline by frame().finish.' },
  ],

  sockets: [
    { name: 'head', what: 'the top of the cabinet' },
    { name: 'hand', what: 'what it holds, or its hand on that side' },
    { name: 'offhand', what: 'the free hand' },
    { name: 'feet', what: 'the floor under it' },
    { name: 'hatch', what: 'where what it sells appears' },
  ],

  helpers: {
    'kiosk.SIZE': 'the frame', 'kiosk.GROUND': 'the ground row', 'kiosk.CX': 'the pivot column', 'kiosk.PIVOT': 'the pivot',
    'kiosk.hands': 'where the two hands are, for a part of your own',
    'kiosk.sockets': 'the attach points of a solved pose (frame().sockets() calls it)',
  },
  drawingHelpers: {},

  duplicates: [],
  inSprites: [],
};
