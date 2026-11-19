// Direction pad (core-sprites-2, batch K16): a game controller's direction pad for "move" prompts, its pressed arms
// lit in one colour.
//   idle    the chosen arms lit, at rest
//   press   the lit arms press down on frames 4 and 5; with "all", each arm in turn (up, right, down, left), lit and
//           pressed, one per two frames
// Styles: one plus-shaped piece (cross), a round rocker disc with four raised wedges round a centre dimple (rocker), or a
// round pad with a plus cut into it.
// "None" is the plain pad, for a settings list.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { dpadCross } from '../engine/inputs.js';
import { padRocker } from '../engine/input-rocker.js';

const P = PALETTE.thornwood, D = PALETTE.derelict;
const PRESS = [false, false, false, false, true, true, false, false];
const TURN = ['up', 'right', 'down', 'left'];
const LIT = {
  up: ['up'], down: ['down'], left: ['left'], right: ['right'], 'up-down': ['up', 'down'], 'left-right': ['left', 'right'],
  all: ['up', 'right', 'down', 'left'], none: [],
};

export default defineSprite({
  id: 'input-dpad',
  name: 'Direction pad',
  kind: 'Item',
  blurb: 'A game controller\'s direction pad for "move" prompts, the arms to press lit and pressing down; change the direction, style, size, depth and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'platformer', 'puzzle', 'top-down-rpg'], view: 'none',
    words: ['d-pad', 'direction pad', 'cross pad', 'arrows', 'gamepad', 'controller', 'move', 'press', 'prompt', 'input', 'tutorial'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'press',
  params: {
    style: choice('Style', 'cross', [{ value: 'cross', label: 'Cross' }, { value: 'rocker', label: 'Rocker' }, { value: 'round', label: 'Round' }]),
    direction: choice('Direction', 'up', [
      { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
      { value: 'up-down', label: 'Up and down' }, { value: 'left-right', label: 'Left and right' }, { value: 'all', label: 'All' },
      { value: 'none', label: 'None' },
    ]),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    depth: range('Depth', 0.5, { lo: 'Flat', hi: 'Deep' }),
    body: color('Pad', P.slate, [P.slate, P.cavern, P.steel, P.soil, D.plate], { material: 'paint' }),
    glow: color('Lit', P.gold, [P.gold, P.magic, P.moss, P.crimson, P.cream],
      { when: { direction: ['up', 'down', 'left', 'right', 'up-down', 'left-right', 'all'] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true, noText: true },
    press: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Press', noText: true },
  },
  versions: [
    { name: 'Up', params: {} },
    { name: 'Left and right', params: { direction: 'left-right', glow: P.magic } },
    { name: 'Rocker', params: { style: 'rocker', direction: 'all' } },
    { name: 'Round pad', params: { style: 'round', direction: 'down' } },
    { name: 'Pale, unlit', params: { direction: 'none', body: P.steel } },
  ],

  render(g, { clip, frame, p }) {
    // the pad reaches E px from the middle: 24 px across at the default
    const depth = Math.round(lerp(1, 3, p.depth)), E = lerp(10.5, 13.5, p.size);
    let lit = LIT[p.direction], down = clip === 'press' && PRESS[frame];
    if (clip === 'press' && p.direction === 'all') { lit = [TURN[frame >> 1]]; down = true; }
    // one rocker disc with four raised wedges (engine/input-rocker.js), or one plus-shaped piece (engine/inputs.js)
    if (p.style === 'rocker') padRocker(g, 16, 16, { reach: E, body: p.body, glow: p.glow, lit, depth, down });
    else dpadCross(g, 16, 16, { arm: E - 3.5, thick: 7, style: p.style, body: p.body, glow: p.glow, lit, depth, down });
    g.outline(INK);
  },
});
