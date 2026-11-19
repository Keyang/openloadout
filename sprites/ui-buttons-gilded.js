// Stone and gold buttons (core-sprites-2, batch K14): a menu button of dark carved stone in a lit gold frame, one
// clip per state, plus a stone tab and an open tab, built on engine/ui-skins.js (skin `gilded`).
//   normal    the stone slab stands on a 2 px gold lip
//   hover     the gold band brightened, the stone lightened at most tone(face, 0.1) (white text keeps 5 to 1); the
//             pale band has no room left, so the dark gold (left and bottom band, lip) lifts and the gems light up
//   pressed   2 px lower, down onto the lip          disabled  no colour
//   tab       a darker stone tab standing on an ink line
//   tab-active  a full-height tab in the stone's own colour, open at the bottom so it joins a gilded panel
// Styles (engine/ui-gilded.js, over the helper): a gold corner plate in each corner with a 3x3 gem of the accent;
// temple (cut corners, a gold fillet inside the band, and a key pattern of 1 px steps carved along the top band and
// the lip, repeating every 4 px from the slice line: engine/ui-gilded-carve.js), royal (round corners, a three-dot
// scroll on each plate, a cushioned stone edge), ruin (dull gold, chipped corners, and two cracks from the left and
// right band into the stone beside the text). Nothing but the band and the ink crosses the clear middle 78x18.
//
// Stretching (`slice`; the export writes it as `border`, Contract 8): the helper's slice plus the frame's 1 px:
// 8 px on every side; pressed top 9 and bottom 6 (the helper's 5 plus the frame's row: see sliceOf); tabs 8 left and right, the top down to
// the text, and 1 (open tab) or 2 (tab on its line) at the bottom. The open tab's text starts under its top slice.
// Text: white. skinSwatches keeps only stones on which white holds 4.5 to 1 and golds that hold 3 to 1 against
// every kept stone, under every whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { BUTTON_STATES } from '../engine/ui.js';
import { skinButton, skinTab, skinSwatches, SKIN_STYLES, SKIN_TEXT } from '../engine/ui-skins.js';
import { gildedCorners, gildedLift } from '../engine/ui-gilded.js';
import { gildedKey, gildedCracks } from '../engine/ui-gilded-carve.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 32];
const SW = skinSwatches('gilded', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.cream, P.steel, P.skin, H.thunder, H.wheat],
  accent: [P.magic, P.crimson, P.moss, P.hero, P.ember],
});

const CRACKS = [{ side: 'left', at: 0.3, dir: 1, length: 8 }, { side: 'right', at: 0.65, dir: -1, length: 8, jog: 2 }];
const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner, extras: false });
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
// pressed keeps bottom 6, not wood's 5: under the ink line this skin has one more row (the temple fillet, the royal
// cushion, the key's inner step) and the bottom gems reach it, row 26; a bottom of 5 would stretch that row and crop
// the gems to 3x2 (spec core-sprites-2, this row's "Stretch and text").
const sliceOf = (clip, out) => {
  const s = plus1(out.slice);
  return clip === 'tab-active' ? { ...s, top: Math.max(8, s.top) } : s;
};
// Draws one clip and returns what the helper says about it (text area, slice, band pixel). The helper draws the
// slab; engine/ui-gilded.js then sets a gold plate with the style's motif and a gem in each corner, outside the
// stretched middle and the text. Hover also lifts the dark gold (the left and bottom band and the lip) from
// tone(frame, -1) to tone(frame, -0.35), and lights the gems: the pale gold band has no room left to brighten.
function piece(g, clip, p) {
  const tab = clip === 'tab' || clip === 'tab-active';
  const out = tab ? skinTab(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip === 'tab-active', 'gilded', look(p))
    : skinButton(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip, 'gilded', look(p));
  const hover = clip === 'hover';
  const s = sliceOf(clip, out);
  const keep = { x: s.left, y: s.top, w: SIZE[0] - s.left - s.right, h: SIZE[1] - s.top - s.bottom };
  gildedCorners(g, out.body, p.style, {
    face: p.face, frame: p.frame, accent: p.accent, corner: p.corner, border: p.border, bandCap: 2, state: tab ? 'normal' : clip, gems: p.gems, lit: hover,
    keep, openBottom: tab, skip: [out.text], corners: tab ? ['tl', 'tr'] : undefined,
  });
  // temple: the key of 1 px steps carved along the top band and the lip, repeating every 4 px from the slice line;
  // ruin: two cracks from the gold into the stone (top band, and the right band where the stone runs past the text)
  if (p.style === 'temple') gildedKey(g, out.body, { sides: tab ? ['top'] : ['top', 'bottom'], keep, skip: [out.text] });
  if (p.style === 'ruin') gildedCracks(g, out.body, CRACKS, { skip: [out.text] });
  if (hover) gildedLift(g, { x: 0, y: 0, w: SIZE[0], h: SIZE[1] }, p.frame);
  return out;
}
function slice(clip, p) {
  return sliceOf(clip, piece(new Surface(...SIZE), clip, p));
}
// The open tab's text area starts under its 8 px top slice; every other clip keeps the helper's.
function textOf(clip, out) {
  if (clip !== 'tab-active') return out.text;
  const t = out.text, y = Math.max(t.y, 8);
  return { ...t, y, h: Math.min(t.h, SIZE[1] - 1 - 1 - y) };
}

export default defineSprite({
  id: 'ui-buttons-gilded',
  name: 'Stone and gold buttons',
  kind: 'Item',
  blurb: 'A stretchable menu button and tab of dark carved stone in a lit gold frame with gems, in four states (normal, hover, pressed, disabled) plus a tab and an open tab; change its style, corners, band, gems and colours.',
  meta: {
    type: 'ui', role: 'interface/button', themes: ['neutral', 'fantasy', 'dungeon'], gameTypes: ['arcade', 'turn-based-rpg', 'top-down-rpg', 'card-game'], view: 'none',
    words: ['button', 'menu', 'stone', 'gold', 'gem', 'tab', 'temple', 'royal', 'press', 'click', 'hover', 'start', 'carved', 'ornate'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 16],
  grounded: false,
  preview: 'normal',
  slice,
  params: {
    style: choice('Style', 'temple', [...SKIN_STYLES.gilded]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    gems: toggle('Gems', true),
    face: color('Stone', P.cavern, SW.face),
    frame: color('Gold', P.cream, SW.frame, { material: 'metal' }),
    accent: color('Gems', P.magic, SW.accent, { when: { gems: [true] } }),
  },
  clips: {
    ...Object.fromEntries(BUTTON_STATES.map((s) => [s, { frames: 1, fps: 8, loop: true }])),
    tab: { frames: 1, fps: 8, loop: true, label: 'Tab, for a page that is not open' },
    'tab-active': { frames: 1, fps: 8, loop: true, label: 'Open tab, for the page on view' },
  },
  versions: [
    { name: 'Temple gold', params: {} },
    { name: 'Royal', params: { style: 'royal', accent: P.crimson, face: H.bandit } },
    { name: 'Ruin', params: { style: 'ruin', gems: false, face: P.soil, frame: H.wheat } },
    { name: 'Silver and night', params: { face: D.plate, frame: P.steel } },
    { name: 'Bright gold', params: { frame: H.thunder, accent: P.moss } },
  ],
  // Where the label goes in each clip (white text), and one pixel of the gold band to check against the stone.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p);
    return { ...textOf(clip, out), text: SKIN_TEXT.gilded, edge: out.edge };
  },
  sounds: {
    pressed: [{ sound: 'menu-confirm', preset: 'Confirm', frame: 0, volume: 0.6 }],
    'tab-active': [{ sound: 'menu-move', preset: 'Tab', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
