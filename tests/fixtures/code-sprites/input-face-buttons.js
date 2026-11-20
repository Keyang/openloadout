// FROZEN COPY, not a sprite: sprites/input-face-buttons.js as it was on 2026-11-20 (migration batch M9), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Face buttons (core-sprites-2, batch K16): the four action buttons of a game controller in a diamond, for "press
// this" prompts, the one to press lit in a single colour. All four alike: no symbols, no letters, no four colours.
//   idle    the lit button at rest
//   press   the lit button presses down on frames 4 and 5 (every button with "all")
// Style "single" is one big round button, always lit. Every button's side is the plastic (the Buttons colour), lit or
// not, so the plastic shows with every button lit too; the tops catch the light on their upper right (engine/pad-buttons.js). Text: the lit button's flat top is where a game prints its own
// letter if it wants one (dark text, INK); with "all", each of the four tops. Every Lit swatch holds INK at 5.39 to 1
// or more under every whole-bundle look.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { Surface } from '../../../engine/surface.js';
import { lerp } from '../../../engine/motion.js';
import { INK, tone } from '../../../engine/color.js';
import { PALETTE } from '../../../engine/palettes.js';
import { padCap, padDiamond } from '../../../engine/pad-buttons.js';

const P = PALETTE.thornwood, D = PALETTE.derelict;
// press: the lit button is down on frames 4 and 5
const PRESS = [false, false, false, false, true, true, false, false];
const PLACES = ['top', 'right', 'bottom', 'left'];

// Draws the buttons for one frame and returns the lit tops: shared by render() and textArea().
function buttons(g, clip, frame, p) {
  const depth = Math.round(lerp(1, 3, p.depth)), down = clip === 'press' && PRESS[frame];
  const side = tone(p.body, -0.5);   // every side is the plastic's, lit or not
  if (p.style === 'single') {
    const r = Math.round(lerp(9, 11, p.size));
    const { top } = padCap(g, 16, 16, r, { top: p.glow, side, depth, down });
    return [top];
  }
  const r = lerp(4, 5.5, Math.round(p.size * 3) / 3);
  const { tops } = padDiamond(g, 16, 16, { r, gap: 1, body: p.body, side, glow: p.glow, lit: p.button, depth, down });
  return p.button === 'all' ? PLACES.map((k) => tops[k]) : [tops[p.button]];
}

export default defineSprite({
  id: 'input-face-buttons',
  name: 'Face buttons',
  kind: 'Item',
  blurb: 'The four action buttons of a game controller in a diamond, the one to press lit and pressing down; change which button, one big button, size, depth and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'platformer', 'shooter', 'racing'], view: 'none',
    words: ['gamepad', 'controller', 'button', 'face button', 'action button', 'press', 'prompt', 'input', 'tutorial', 'control'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'press',
  params: {
    style: choice('Style', 'cluster', [{ value: 'cluster', label: 'Four buttons' }, { value: 'single', label: 'One button' }]),
    button: choice('Button', 'bottom', [
      { value: 'top', label: 'Top' }, { value: 'right', label: 'Right' }, { value: 'bottom', label: 'Bottom' },
      { value: 'left', label: 'Left' }, { value: 'all', label: 'All' },
    ], { when: { style: ['cluster'] } }),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    depth: range('Depth', 0.5, { lo: 'Flat', hi: 'Deep' }),
    body: color('Buttons', P.slate, [P.slate, P.cavern, P.steel, P.soil, D.plate], { material: 'paint' }),
    glow: color('Lit button', P.gold, [P.gold, P.magic, P.moss, P.sky, P.cream]),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    press: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Press' },
  },
  versions: [
    { name: 'Bottom button', params: {} },
    { name: 'Top button', params: { button: 'top', glow: P.magic } },
    { name: 'Right button', params: { button: 'right', glow: P.sky } },
    { name: 'One big button', params: { style: 'single' } },
    { name: 'Pale pad, all lit', params: { button: 'all', body: P.steel, glow: P.moss } },
  ],
  textArea(clip, p) {
    // press: where the text sits on its first frame (the button up)
    const areas = buttons(new Surface(32, 32), clip, 0, p).map(({ x, y, w, h }) => ({ x, y, w, h, text: INK }));
    return areas.length === 1 ? areas[0] : areas;
  },

  render(g, { clip, frame, p }) {
    buttons(g, clip, frame, p);
    g.outline(INK);
  },
});
