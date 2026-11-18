// Upgrade card (kit-roguelite-scifi, batch S20): the card a player picks an upgrade from.
// A tall slab built on techPanel (engine/ui.js): cut corners, a lit edge, a lip under it. From the top:
// a head with a sunk square that holds a 32x32 icon (icons-upgrades), vents beside it, a bar of the
// rarity light, then a flat clear area for the name and the text.
//
// States: `normal` stands on a 2 px lip. `hover` rises 2 px (the lip grows to 4) and its frame and
// lights turn bright. `pressed` sinks 2 px onto the lip. `disabled` is grey. The bottom edge never moves.
// Rarity changes the outline and the corner lights: common is a plain cut rectangle with one light,
// rare has two deep-cut corners with a light in each, epic four and a raised tab along the top.
//
// What the export says (Contract 8):
//   border   left and right 24: columns 24 to 39 are the same all the way down, so the card can be made
//            wider (the icon square widens with it). top: everything down to the text area, never
//            stretched. bottom: the lip, the frame, and a deep-cut corner with its light (8 to 15 px).
//            Between top and bottom the text area repeats, so the card can be made any taller.
//   sockets  `icon`: the middle of the icon square (put the icon's pivot there); `text`: the top left
//            corner of the text area. Both move with the card when it rises or sinks.
// Text: white keeps 4.5 to 1 on the text area for every face and glow, and the lit edge keeps 3 to 1
// against it for every frame colour, under every whole-bundle look (the faces offered are all dark).
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { tone, mix, INK } from '../engine/color.js';
import { Surface } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { techPanel, scanLines, desaturate, cutPx, TECH_STYLES } from '../engine/ui.js';

const P = PALETTE.derelict;
const SIZE = [64, 96];
const ICON = 32;                                     // the clear square
// Where the body's top edge is in each state, and how much lip shows under it. Body 90 px, bottom edge on row 94.
const STATES = { normal: { top: 3, lip: 2 }, hover: { top: 1, lip: 4 }, pressed: { top: 5, lip: 0 }, disabled: { top: 3, lip: 2 } };
const HEAD = 51;                                     // rows from the body's top edge down to the text area
const WELL = { x: 14, dy: 9, size: ICON + 4 };       // the icon square with its two rims, from the body's top edge
const DEEP = 4;                                      // how much deeper a rarity's cut corners are

/** Corners that carry a light, per rarity: top left, top right, bottom right, bottom left. */
const LIGHTS = { common: [1, 0, 0, 0], rare: [1, 0, 1, 0], epic: [1, 1, 1, 1] };

function shapeOf(p) {
  const k = cutPx(p.corner), deep = k + DEEP;
  return {
    cutPx: p.rarity === 'common' ? k : p.rarity === 'rare' ? [deep, k, deep, k] : deep,
    tab: p.rarity === 'epic' ? { inset: 12, rise: 3 } : undefined,
  };
}

/** Where things are in a state: the icon square's middle, the text area. Used by render, slice and sockets. */
function layout(clip) {
  const { top } = STATES[clip];
  return { top, icon: { x: SIZE[0] / 2, y: top + WELL.dy + 2 + ICON / 2 }, text: { x: 8, y: top + HEAD, w: 48, h: 90 - HEAD - 7 } };
}

/** The card itself, drawn by the helper; everything else is laid over it. */
function slab(g, clip, p) {
  const st = STATES[clip];
  return techPanel(g, 1, st.top, SIZE[0] - 2, SIZE[1] - 1 - st.top, {
    style: p.style, face: p.face, frame: p.frame, glow: p.glow, border: p.border, ...shapeOf(p), lip: st.lip, lights: LIGHTS[p.rarity], lit: clip === 'hover', off: clip === 'disabled',
  });
}

// The bottom border is the helper's: it covers the lip, the frame, a deep-cut corner and its light.
const slice = (clip, p) => ({ left: 24, right: 24, top: layout(clip).text.y, bottom: 1 + slab(new Surface(...SIZE), clip, p).slice.bottom });

export default defineSprite({
  id: 'ui-upgrade-card',
  name: 'Upgrade card',
  kind: 'Item',
  blurb: 'A tall sci-fi card with a square for an icon and a clear area for text, in normal, hover, pressed and disabled states; change its style, rarity, cut corners, border, tech lines and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['sci-fi', 'neutral'], gameTypes: ['roguelike-action', 'card-game', 'arcade'], view: 'none',
    words: ['card', 'upgrade', 'perk', 'choice', 'pick', 'reward', 'level up', 'rarity', 'panel', 'select', 'hover', 'hologram'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 48],
  grounded: false,
  preview: 'normal',
  slice,
  sockets: (clip) => { const L = layout(clip); return { icon: { ...L.icon, angle: 0 }, text: { x: L.text.x, y: L.text.y, angle: 0 } }; },
  params: {
    style: choice('Style', 'plate', TECH_STYLES),
    rarity: choice('Rarity', 'common', ['common', 'rare', 'epic']),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Cut' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    lines: toggle('Tech lines', true),
    // dark faces only: white text must keep its contrast on every one of them, and every lit edge must stand out
    face: color('Face', P.plate, [P.plate, mix(INK, P.teal, 0.35), mix(INK, P.flesh, 0.4), mix(INK, P.signal, 0.45), mix(P.plate, INK, 0.35)]),
    frame: color('Frame', P.hull, swatches('derelict', 'frame', { lead: 'hull' })),
    glow: color('Glow', P.cyan, swatches('derelict', 'glow', { lead: 'cyan' })),
  },
  clips: {
    normal: { frames: 1, fps: 8, loop: true },
    hover: { frames: 1, fps: 8, loop: true },
    pressed: { frames: 1, fps: 8, loop: true },
    disabled: { frames: 1, fps: 8, loop: true },
  },
  sounds: {
    hover: [{ sound: 'tech-click', preset: 'Hover', frame: 0, volume: 0.6 }],
    pressed: [{ sound: 'tech-click', preset: 'Select', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, p }) {
    const st = STATES[clip], L = layout(clip), off = clip === 'disabled';
    const card = slab(g, clip, p);
    const T = card.tones, grey = (c) => (off ? desaturate(c) : c);

    // the head: one tone lighter than the text area, from the frame down to the rarity light
    const wx = WELL.x, wy = st.top + WELL.dy;
    scanLines(g, card.face.x, st.top, card.face.w, L.text.y - 4 - st.top, tone(T.face, 0.3), { pitch: 1, over: T.face });

    // the icon square: a rim in the tone of the lit edge, an ink line, a dark clear middle
    g.rect(wx, wy, WELL.size, WELL.size, T.edge);
    g.rect(wx + 1, wy + 1, WELL.size - 2, WELL.size - 2, INK);
    g.rect(wx + 2, wy + 2, ICON, ICON, grey(mix(INK, p.face, 0.5)));

    // vents: thin lines across the head, beside the icon square
    if (p.lines) scanLines(g, L.text.x, wy + 2, L.text.w, WELL.size - 3, T.face, { pitch: 3, skip: { x: wx - 1, y: wy, w: WELL.size + 2, h: WELL.size } });

    // the rarity light: a bar across the card between the head and the text
    g.rect(card.face.x, L.text.y - 4, card.face.w, 1, T.glow);
    g.rect(card.face.x, L.text.y - 3, card.face.w, 1, T.glowLow);
  },
});
