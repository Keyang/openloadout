// FROZEN COPY, not a sprite: sprites/input-key.js as it was on 2026-11-20 (migration batch M9), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Keyboard key (core-sprites-2, batch K15): one square key of a keyboard for "press" prompts and control-settings
// screens, a pale top face over a darker side, with an optional arrow picture and never a letter.
//   up     the key at rest                  down   the top face sunk onto its side, in the Light colour when lit
//   tap    up on frames 0 to 3 and 6 to 7, down on 4 and 5
// Text: the flat middle of the top face is where a game prints its own letter (dark text, INK); with an arrow it is
// the strip of the top face above the arrow. Every top and light swatch holds INK text at 5.39 to 1 or more under
// every whole-bundle look (moss is the lowest).
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { Surface } from '../../../engine/surface.js';
import { lerp } from '../../../engine/motion.js';
import { pick, INK } from '../../../engine/color.js';
import { PALETTE } from '../../../engine/palettes.js';
import { keyCap, keyMark } from '../../../engine/inputs.js';
import { keyBevel } from '../../../engine/inputs-more.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const MARK = 7;
// tap: up on frames 0 to 3 and 6 to 7, down (and lit) on 4 and 5; every frame matches the up or the down clip
const TAP = ['up', 'up', 'up', 'up', 'down', 'down', 'up', 'up'];

// The key's box and its top face for one state: shared by render() and textArea().
function key(g, clip, frame, p) {
  const w = 20 + 2 * Math.round(3 * p.size), h = w - 2, depth = Math.round(lerp(1, 3, p.depth));
  const tap = clip === 'tap' ? TAP[frame] : null;
  const down = clip === 'down' || tap === 'down';
  const top = down && p.light ? p.glow : p.body;
  const x = 16 - w / 2, y = 16 - h / 2;
  const cap = keyCap(g, x, y, w, h, { top, side: p.frame, corner: p.corner, depth, down });
  return { ...cap, colour: top, depth, corner: p.corner };
}
// Where the picture's centre pixel goes: across the middle and a little below it, so the strip above it is tall
// enough for a game's letter.
const markAt = (top) => [top.x + Math.floor((top.w - 1) / 2), top.y + Math.round(top.h * 0.6)];

export default defineSprite({
  id: 'input-key',
  name: 'Keyboard key',
  kind: 'Item',
  blurb: 'A keyboard key for "press this" prompts that sinks and lights up when tapped; change its arrow picture, size, corners, depth and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'platformer', 'puzzle', 'shooter'], view: 'none',
    words: ['key', 'keyboard', 'keycap', 'button', 'press', 'tap', 'prompt', 'control', 'arrow key', 'input', 'tutorial'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'tap',
  params: {
    mark: choice('Picture', 'none', [
      { value: 'none', label: 'None' }, { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' },
      { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
    ]),
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
    { name: 'Key', params: {} },
    { name: 'Arrow up', params: { mark: 'up' } },
    { name: 'Arrow right, flat', params: { mark: 'right', depth: 0, corner: 0 } },
    { name: 'Dark keys', params: { body: P.steel, frame: D.plate, glow: P.magic } },
    { name: 'Big round key', params: { size: 1, corner: 1 } },
  ],
  textArea(clip, p) {
    const { top, text } = key(new Surface(32, 32), clip, 0, p);   // tap: where the text sits on its first frame
    if (p.mark === 'none') return { ...text, text: INK };
    const [, my] = markAt(top), above = my - Math.floor(MARK / 2) - 1;
    return { x: text.x, y: text.y, w: text.w, h: Math.max(1, above - text.y), text: INK };
  },

  render(g, { clip, frame, p }) {
    const k = key(g, clip, frame, p);
    keyBevel(g, k.top, { colour: k.colour, corner: k.corner });
    const [mx, my] = markAt(k.top);
    keyMark(g, p.mark, mx, my, MARK, pick(k.colour, '#ffffff', INK));
    g.outline(INK);
  },
});
