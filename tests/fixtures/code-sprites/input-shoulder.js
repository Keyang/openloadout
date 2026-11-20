// FROZEN COPY, not a sprite: sprites/input-shoulder.js as it was on 2026-11-20 (migration batch M9), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Shoulder button (core-sprites-2, batch K16): a button on top of a game controller, as a prompt: a long bumper seen
// from the front or a curved trigger seen from the side, hanging from a short pivot, its tip curling forward; left or
// right (the right one is the left mirrored to the pixel). No letters or numbers on it.
//   idle    at rest, lit in the Lit colour (off: the plain shape, for a settings list)
//   press   on frames 4 and 5 the face sinks 2 px onto its dark side; the bottom edge (and a trigger's pivot) stay put
// Every face has a 1 px light edge along its top (the light comes from above; a trigger's front hollow too), lit or not.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { lerp } from '../../../engine/motion.js';
import { INK } from '../../../engine/color.js';
import { PALETTE } from '../../../engine/palettes.js';
import { shoulderButton } from '../../../engine/inputs-shoulder.js';

const P = PALETTE.thornwood, D = PALETTE.derelict;
const PRESS = [false, false, false, false, true, true, false, false];
const STUB = 3;   // a trigger's pivot above its paddle; the face sits on a 3 px dark side and sinks 2 px onto it

export default defineSprite({
  id: 'input-shoulder',
  name: 'Shoulder button',
  kind: 'Item',
  blurb: 'A game controller\'s shoulder button as a prompt, a long bumper or a curved trigger that presses down; change the button, side, end shape, size, lighting and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'shooter', 'racing', 'platformer'], view: 'none',
    words: ['shoulder button', 'bumper', 'trigger', 'gamepad', 'controller', 'press', 'squeeze', 'prompt', 'input', 'tutorial'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'press',
  params: {
    button: choice('Button', 'bumper', [{ value: 'bumper', label: 'Bumper' }, { value: 'trigger', label: 'Trigger' }]),
    side: choice('Side', 'left', [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]),
    style: choice('Style', 'rounded', [{ value: 'rounded', label: 'Rounded' }, { value: 'angled', label: 'Angled' }], { when: { button: ['bumper'] } }),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    lit: toggle('Lit', true),
    body: color('Plastic', P.slate, [P.slate, P.cavern, P.steel, P.soil, D.plate], { material: 'paint' }),
    glow: color('Lit', P.gold, [P.gold, P.magic, P.moss, P.crimson, P.cream], { when: { lit: [true] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true, noText: true },
    press: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Press', noText: true },
  },
  versions: [
    { name: 'Left bumper', params: {} },
    { name: 'Right trigger', params: { button: 'trigger', side: 'right' } },
    { name: 'Left trigger, blue', params: { button: 'trigger', glow: P.magic } },
    { name: 'Angled right bumper', params: { side: 'right', style: 'angled' } },
    { name: 'Unlit pale', params: { lit: false, body: P.steel } },
  ],

  render(g, { clip, frame, p }) {
    // a bumper 26x9 and a trigger 14x22 at the default, each with its side and (trigger) pivot, centred in the frame
    const trigger = p.button === 'trigger';
    const w = Math.round(trigger ? lerp(12, 16, p.size) : lerp(24, 28, p.size));
    const h = Math.round(trigger ? lerp(19, 25, p.size) : lerp(8, 10, p.size));
    const x = 16 - Math.round(w / 2), y = 16 - Math.round(h / 2);
    shoulderButton(g, x, y, w, h, {
      kind: p.button, side: p.side, style: p.style, body: p.body, glow: p.glow, lit: p.lit,
      down: clip === 'press' && PRESS[frame],
      base: 'fixed', back: 'curved', end: 'stepped', rim: true, tidy: true, pivot: trigger ? STUB : 0, depth: 3, travel: 2,
    });
    g.outline(INK);
  },
});
