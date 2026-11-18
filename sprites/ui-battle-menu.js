// Battle menu (kit-rpg-fantasy, batch R20): the command panel, the highlight behind
// the chosen command, an arrow cursor and the marker that bounces over whoever acts
// next. The words (Attack, Magic, Item, Defend) are the game's.
// `panel` is the same panel as ui-dialogue's `box` at the same settings.
//
// Stretching (`slice` below; the export writes it as `border` and `rect`, Contract 8):
//   panel  fills the frame: 8 px corners.
//   row    sits in its own rectangle (`rect`) with 4 px corners, so it can be as small as 8x8.
// The cursor's point is exported on every frame as the `tip` socket (it slides with the arrow).
// Text: white text keeps 4.5 to 1 on the panel face and on the highlighted row under every look.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, wave, PI } from '../engine/motion.js';
import { ramp, tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { Surface } from '../engine/surface.js';
import { panel9, highlight, triangle, slice9, panelSwatches, borderPx, PANEL_STYLES } from '../engine/ui.js';

const P = PALETTE.hearthvale;
// Face and frame swatches come from the helper: it keeps only colours on which white text holds 4.5 to 1 and
// against which the frame holds 3 to 1 under every whole-bundle look (the defaults, panel and cream, stay as they are).
const SW = panelSwatches('hearthvale', { face: 'panel', frame: 'cream', faces: ['slate', 'bandit', 'mage', 'rogue'], frames: ['skin', 'steel', 'thunder', 'sky'] });
const SIZE = [96, 64];
const ROW = { x: 8, y: 25, w: 80, h: 14 };         // the highlight, centred in the frame
const CURSOR = { x: 38, y: 32, shaft: 9, head: 4 }; // the arrow: left end of its shaft, its middle row, and the diamond's reach

const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);
const slide = (t) => Math.round(1 + wave(t));      // 0..2 px towards the command and back

export default defineSprite({
  id: 'ui-battle-menu',
  name: 'Battle menu',
  kind: 'Item',
  blurb: 'A stretchable command panel with a highlight row, a diamond-headed arrow cursor and a bouncing turn marker; change its style, corners, border and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['fantasy', 'neutral'], gameTypes: ['turn-based-rpg', 'top-down-rpg', 'card-game'], view: 'none',
    words: ['menu', 'command', 'battle', 'cursor', 'arrow', 'pointer', 'select', 'choose', 'turn', 'marker', 'window', 'panel'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 32],
  grounded: false,
  preview: 'panel',
  slice: { panel: slice9(), row: { rect: ROW, left: 4, top: 4, right: 4, bottom: 4 } },
  // the cursor's hot spot: the middle of the pixel at its point (angle: it points the way it faces)
  sockets: (clip, t) => (clip === 'cursor' ? { tip: { x: CURSOR.x + slide(t) + CURSOR.shaft - 1 + 2 * CURSOR.head + 1.5, y: CURSOR.y + 0.5, angle: PI / 2 } } : {}),
  params: {
    style: choice('Style', 'plain', PANEL_STYLES),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    // dark faces and light frames only, as on ui-dialogue: text and frame keep their contrast under every look
    face: color('Face', P.panel, SW.face),
    frame: color('Frame', P.cream, SW.frame),
    accent: color('Accent', P.gold, swatches('hearthvale', 'accent', { lead: 'gold' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    panel: { frames: 1, fps: 8, loop: true },
    row: { frames: 1, fps: 8, loop: true, label: 'Highlight' },
    cursor: { frames: 8, fps: fps(8), loop: true, noText: true },
    'turn-marker': { frames: 8, fps: fps(8), loop: true, label: 'Turn marker', noText: true },
  },
  // where text goes on each clip, and one pixel of the frame band (the contrast rules are checked there)
  textArea(clip, p) {
    if (clip === 'row') return { x: ROW.x + 3, y: ROW.y + 3, w: ROW.w - 6, h: ROW.h - 6 };
    const out = panel9(new Surface(...SIZE), 1, 1, SIZE[0] - 2, SIZE[1] - 2, { style: p.style, corner: p.corner, border: p.border, face: p.face, frame: p.frame, accent: p.accent });
    return { ...out.inner, edge: { x: SIZE[0] >> 1, y: out.body.y + (p.style === 'scroll' ? 2 : borderPx(p.border)) } };
  },

  render(g, { clip, t, p }) {
    if (clip === 'panel') {
      panel9(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, { style: p.style, corner: p.corner, border: p.border, face: p.face, frame: p.frame, accent: p.accent });
      return;
    }
    if (clip === 'row') { highlight(g, ROW.x, ROW.y, ROW.w, ROW.h, { colour: p.accent, fill: tone(p.face, -0.6), corner: p.corner }); return; }
    if (clip === 'cursor') {
      // a short shaft in the frame colour and a diamond head in the accent colour, pointing right
      const x = CURSOR.x + slide(t), y = CURSOR.y, r = CURSOR.head, cx = x + CURSOR.shaft - 1 + r;
      g.rect(x, y - 1, CURSOR.shaft, 3, ramp(p.frame), { shade: 1 });
      g.fill(cx - r, y - r, cx + r + 1, y + r + 1, (px, py) => Math.abs(Math.floor(px) - cx) + Math.abs(Math.floor(py) - y) <= r, ramp(p.accent), { shade: 1, light: 1 });
      g.outline(INK);
      return;
    }
    // turn-marker: an arrow head that hops over the fighter: up fast, a moment at the top, down again
    const lift = Math.round(3 * Math.sin(PI * t));
    triangle(g, 48, 33 - lift, 11, 'down', ramp(p.accent), { shade: 1 });
    g.outline(INK);
  },
});
