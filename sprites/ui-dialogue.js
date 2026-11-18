// Dialogue box (kit-rpg-fantasy, batch R20): the speech box, a name tag, a choice box
// with one highlighted row, and the small "more text" arrow. Built on engine/ui.js.
//
// Stretching (`slice` below; the export writes it as `border` and `rect`, Contract 8):
//   box       fills the frame: 8 px corners, edges and middle repeat.
//   name-tag  sits in its own rectangle (`rect`), 7 px corners, so it can be as small as 14x14.
//   choice    the box again with one highlighted row to show the look. Its top border is 24 px,
//             so the row stays whole when the box is stretched (a game that wants its own rows
//             uses `box` and the `row` clip of ui-battle-menu).
// Text: white text keeps 4.5 to 1 on every face swatch and on the highlighted row, and every
// frame swatch keeps 3 to 1 against every face, under every whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave } from '../engine/motion.js';
import { ramp, tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { panel9, highlight, triangle, slice9, PANEL_STYLES } from '../engine/ui.js';

const P = PALETTE.hearthvale;
const SIZE = [96, 48];
const TAG = { x: 20, y: 14, w: 56, h: 20 };        // the name tag, centred in the frame
const ROW_H = 14;

const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

export default defineSprite({
  id: 'ui-dialogue',
  name: 'Dialogue box',
  kind: 'Item',
  blurb: 'A stretchable speech box with a name tag, a choice box and a bobbing "more" arrow; change its style, corners, border and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['fantasy', 'neutral'], gameTypes: ['turn-based-rpg', 'top-down-rpg', 'arcade'], view: 'none',
    words: ['dialogue', 'dialog', 'speech', 'textbox', 'talk', 'message', 'conversation', 'choice', 'name', 'window', 'panel', 'story'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 24],
  grounded: false,
  preview: 'box',
  slice: { box: slice9(), 'name-tag': slice9(TAG), choice: { left: 12, top: 24, right: 12, bottom: 8 } },
  params: {
    style: choice('Style', 'plain', PANEL_STYLES),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shadow: toggle('Shadow', false),
    // dark faces only: white text must keep its contrast on every one of them
    face: color('Face', P.panel, [P.panel, P.slate, P.bandit, '#3a3350']),
    // light frames only: each stands out from every face, whatever the look
    frame: color('Frame', P.cream, [P.cream, P.steel, P.thunder, P.skin, P.sky]),
    accent: color('Accent', P.gold, swatches('hearthvale', 'accent', { lead: 'gold' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    box: { frames: 1, fps: 8, loop: true },
    'name-tag': { frames: 1, fps: 8, loop: true, label: 'Name tag' },
    choice: { frames: 1, fps: 8, loop: true },
    next: { frames: 8, fps: fps(8), loop: true, label: 'More text' },
  },

  render(g, { clip, t, p }) {
    const look = { style: p.style, corner: p.corner, border: p.border, shadow: p.shadow, face: p.face, frame: p.frame, accent: p.accent };
    if (clip === 'box') { panel9(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, look); return; }
    if (clip === 'name-tag') { panel9(g, TAG.x, TAG.y, TAG.w, TAG.h, look); return; }
    if (clip === 'choice') {
      const { inner } = panel9(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, look);
      // the chosen row: a ring of the accent colour round a darker tone of the face, so white text still reads
      highlight(g, inner.x + 1, inner.y + 2, inner.w - 2, ROW_H, { colour: p.accent, fill: tone(p.face, -0.6), corner: p.corner });
      return;
    }
    // next: an arrow head that bobs 2 px
    const drop = Math.round(1 + wave(t));
    triangle(g, 48, 23 + drop, 9, 'down', ramp(p.accent), { shade: 1 });
    g.outline(INK);
  },
});
