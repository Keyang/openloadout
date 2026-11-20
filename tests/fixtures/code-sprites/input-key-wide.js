// FROZEN COPY, not a sprite: sprites/input-key-wide.js as it was on 2026-11-20 (migration batch M9), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Wide keyboard key (core-sprites-2, batch K15): the long keys of a keyboard (return, back, tab, shift and the space
// bar) for "press" prompts and control-settings screens, with pictures and never words. The sibling of input-key:
// the same 22 px tall key and the same three states, so the two stand on one line when a game sets them side by side.
//   up     the key at rest                  down   the top face sunk onto its side, in the Light colour when lit
//   tap    up on frames 0 to 3 and 6 to 7, down on 4 and 5
// Frame 64x32, not the style guide's 32x32 for input pictures: a wide key is 38 to 44 px long and the space bar
// 54 to 60 px, and no 32 px frame holds them at the square key's height (core-sprites-2.md, input-key-wide).
// Text: the flat middle of the top face is where a game prints its own word (dark text, INK); with a picture it is
// the strip of the top face above the picture. Every top and light swatch holds INK at 5.39 to 1 or more under every
// whole-bundle look (moss is the lowest).
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { Surface } from '../../../engine/surface.js';
import { lerp } from '../../../engine/motion.js';
import { pick, INK } from '../../../engine/color.js';
import { PALETTE } from '../../../engine/palettes.js';
import { keyCap, keyMark } from '../../../engine/inputs.js';
import { keyBevel } from '../../../engine/inputs-more.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [64, 32], KEY_H = 22, MARK = 9;
// tap: up on frames 0 to 3 and 6 to 7, down (and lit) on 4 and 5; every frame matches the up or the down clip
const TAP = ['up', 'up', 'up', 'up', 'down', 'down', 'up', 'up'];
const LENGTH = { wide: 38, long: 54 };   // the shortest of each shape; size adds 0 to 6 px

// The key's box and its top face for one state: shared by render() and textArea().
function key(g, clip, frame, p) {
  const w = LENGTH[p.shape] + 2 * Math.round(3 * p.size), depth = Math.round(lerp(1, 3, p.depth));
  const tap = clip === 'tap' ? TAP[frame] : null;
  const down = clip === 'down' || tap === 'down';
  const top = down && p.light ? p.glow : p.body;
  const x = SIZE[0] / 2 - w / 2, y = SIZE[1] / 2 - KEY_H / 2;
  const cap = keyCap(g, x, y, w, KEY_H, { top, side: p.frame, corner: p.corner, depth, down });
  return { ...cap, colour: top, corner: p.corner, mark: p.shape === 'wide' ? p.mark : 'none' };
}
// Where the picture's centre pixel goes: across the middle and a little below it, so the strip above it is tall
// enough for a game's letter.
const markAt = (top) => [top.x + Math.floor((top.w - 1) / 2), top.y + Math.round(top.h * 0.6)];
// Back (backspace): a hollow tag pointing left with a cross in it, 9x7 round the centre pixel. keyMark's 'back' is a
// small left arrow with a bar that is only 4 px from its 'enter' arrow, too close to tell apart at 1x.
const BACK_TAG = [
  [-4, 0], [-3, -1], [-3, 1], [-2, -2], [-2, 2],                               // the point
  ...[-1, 0, 1, 2, 3, 4].flatMap((i) => [[i, -3], [i, 3]]), [4, -2], [4, -1], [4, 0], [4, 1], [4, 2],   // top, bottom, end
  [0, -1], [2, -1], [1, 0], [0, 1], [2, 1],                                    // the cross
];
function drawMark(g, kind, cx, cy, colour) {
  if (kind !== 'back') return keyMark(g, kind, cx, cy, MARK, colour);
  for (const [i, j] of BACK_TAG) g.dot(cx + i, cy + j, colour);
  return g;
}

export default defineSprite({
  id: 'input-key-wide',
  name: 'Wide keyboard key',
  kind: 'Item',
  blurb: 'A wide keyboard key or a space bar for "press this" prompts that sinks and lights up when tapped; change its shape, picture (return, back, tab, shift), length, corners, depth and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'platformer', 'puzzle', 'shooter'], view: 'none',
    words: ['key', 'keyboard', 'space bar', 'enter', 'return', 'shift', 'tab', 'backspace', 'press', 'tap', 'prompt', 'input'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 16],
  grounded: false,
  preview: 'tap',
  params: {
    shape: choice('Shape', 'wide', [{ value: 'wide', label: 'Wide' }, { value: 'long', label: 'Long' }]),
    mark: choice('Picture', 'enter', [
      { value: 'none', label: 'None' }, { value: 'enter', label: 'Return' }, { value: 'back', label: 'Back' },
      { value: 'tab', label: 'Tab' }, { value: 'shift', label: 'Shift' },
    ], { when: { shape: ['wide'] } }),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    depth: range('Depth', 0.5, { lo: 'Flat', hi: 'Deep' }),
    light: toggle('Light up', true),
    body: color('Key top', P.cream, [P.cream, P.steel, P.skin, P.goblin, H.wheat], { material: 'paint' }),
    frame: color('Key side', P.slate, [P.slate, P.soil, P.cavern, P.thorn, D.plate]),
    glow: color('Light', P.gold, [P.gold, P.magic, P.moss, P.sky], { when: { light: [true] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    up: { frames: 1, fps: 8, loop: true },
    down: { frames: 1, fps: 8, loop: true },
    tap: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Tap' },
  },
  versions: [
    { name: 'Enter key', params: {} },
    { name: 'Space bar', params: { shape: 'long' } },
    { name: 'Shift', params: { mark: 'shift' } },
    { name: 'Back, dark', params: { mark: 'back', body: P.steel, frame: D.plate } },
    { name: 'Tab, flat', params: { mark: 'tab', depth: 0, corner: 0 } },
  ],
  textArea(clip, p) {
    const { top, text, mark } = key(new Surface(...SIZE), clip, 0, p);   // tap: where the text sits on its first frame
    if (mark === 'none') return { ...text, text: INK };
    const [, my] = markAt(top), above = my - Math.floor(MARK / 2) - 1;
    return { x: text.x, y: text.y, w: text.w, h: Math.max(1, above - text.y), text: INK };
  },

  render(g, { clip, frame, p }) {
    const k = key(g, clip, frame, p);
    keyBevel(g, k.top, { colour: k.colour, corner: k.corner });
    const [mx, my] = markAt(k.top);
    drawMark(g, k.mark, mx, my, pick(k.colour, '#ffffff', INK));
    g.outline(INK);
  },
});
