// Flat buttons (core-sprites-2, batch K13): the plain modern button of a mobile or casual game, one clip per state,
// plus a tab and an open tab, built on engine/ui-skins.js (skin `flat`).
//   normal    one flat colour in a band, standing on a 2 px lip of the face's own dark tone (or, with Shadow, on a
//             flat 2 px drop shadow down and to the left)
//   hover     the face lightened by at most tone(face, 0.1) and the band brightened: white text stays 5.0 to 1 or more
//   pressed   2 px lower, down onto the lip or the shadow       disabled  no colour
//   tab       a darker tab standing on an ink line             tab-active  a full-height tab in the face colour,
//                                                                          open at the bottom to join a flat panel
// Styles: solid (the band right inside the ink), outline (the band set 1 px in from the ink, a ring of face between),
// pill (soft round ends 5 px wide and 4 rows tall; Corner does nothing, so it is hidden for pill). No light, no bevel, no texture.
//
// Stretching (`slice`; the export writes it as `border`, Contract 8): the helper's slice plus the frame's 1 px:
// 8 px on every side; pressed top 9 and bottom 5 (as ui-buttons-wood), the pill included. The helper's own pill
// (skinButton style 'pill') has fully round ends 14 px wide that run into the stretched middle, so this file draws
// the pill itself (pillButton below): the same flat slab, band, lip and drop shadow, with soft round ends 5 px wide
// and 4 rows tall at each corner (Round on solid is 4 by 4 and steeper), all inside the 8 px slice: no curved pixel
// in a stretched column or row, checked for every state, border and shadow (out/ui-buttons-flat-slicecheck.mjs).
// Wider ends do not fit: with Shadow the body starts 2 px further in, and a pressed body has only 4 rows in its
// 5 px bottom slice. So the pill is not fully round, as the spec's 8 px slice requires. Tabs 8 left, right and top (the inactive tab 2 px lower), 1 or 2 at
// the open bottom.
// Text: white. skinSwatches keeps only faces on which white holds 4.5 to 1 and edges that hold 3 to 1 against
// every kept face, under every whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { BUTTON_STATES, LIP, borderPx, desaturate } from '../engine/ui.js';
import { INK } from '../engine/color.js';
import { skinButton, skinTab, skinSwatches, skinTones, SKIN_STYLES, SKIN_TEXT } from '../engine/ui-skins.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 32];
const SW = skinSwatches('flat', { face: [P.cavern, P.soil, D.plate, H.bandit], frame: [P.cream, P.sky, P.goblin, P.steel, P.skin] });

const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, border: p.border, corner: p.corner, shadow: p.shadow });
const isTab = (clip) => clip === 'tab' || clip === 'tab-active';

// The pill's round ends: how many pixels each of the 4 rows nearest the top and bottom edge is cut in from the side.
// 5 columns and 4 rows at each corner, so the ink and the band (up to 2 px) all stay inside the 8 px slice.
const PILL_CUTS = [5, 3, 2, 1];
const pillShape = (x, y, w, h) => (px, py) => {
  if (px < x || py < y || px >= x + w || py >= y + h) return false;
  const dx = Math.min(px - x, x + w - 1 - px), dy = Math.min(py - y, y + h - 1 - py);
  return !(dy < PILL_CUTS.length && dx < PILL_CUTS[dy]);
};
// Depth of every pixel of the shape: 0 outside, 1 its edge, 2 one in, ... (4-neighbour, as the skin's own slabs).
function depthOf(inside, x, y, w, h, max) {
  const d = new Map(), key = (px, py) => py * 4096 + px, at = (px, py) => d.get(key(px, py)) ?? 0;
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) if (inside(px, py)) d.set(key(px, py), 1);
  for (let k = 1; k < max; k++) {
    const next = [];
    for (const [n, v] of d) {
      const px = n % 4096, py = (n - px) / 4096;
      if (v === k && at(px - 1, py) >= k && at(px + 1, py) >= k && at(px, py - 1) >= k && at(px, py + 1) >= k) next.push(n);
    }
    for (const n of next) d.set(n, k + 1);
  }
  return at;
}
// A flat pill button in (x, y, w, h), as skinButton draws the flat skin (ink, band, face; a 2 px lip of the face's
// dark tone, or a flat drop shadow; pressed sits on the lip; disabled has no colour) but with PILL_CUTS ends.
// Returns what skinButton returns, its slice 7 on every side (pressed top 8 and bottom 4); with the frame's 1 px and
// slice() below that is the table's 8 (pressed top 9, bottom 5).
function pillButton(g, x, y, w, h, state, p) {
  const T = skinTones('flat', { style: 'pill', face: p.face, frame: p.frame, state });
  const off = state === 'disabled', pressed = state === 'pressed', grey = (c) => (off ? desaturate(c) : c);
  const ink = grey(INK), b = Math.max(1, Math.min(2, borderPx(p.border))), sh = p.shadow ? 2 : 0;
  const bx = x + sh, bw = w - sh, bh = h - LIP, by = pressed ? y + LIP : y;
  const s = new Surface(g.w, g.h);
  if (!pressed && !sh) {
    const lip = depthOf(pillShape(bx, y + LIP, bw, bh), bx, y + LIP, bw, bh, 2);
    for (let py = y + LIP; py < y + LIP + bh; py++) for (let px = bx; px < bx + bw; px++) { const d = lip(px, py); if (d) s.dot(px, py, d === 1 ? ink : T.lip); }
  }
  const at = depthOf(pillShape(bx, by, bw, bh), bx, by, bw, bh, 2 + b);
  for (let py = by; py < by + bh; py++) for (let px = bx; px < bx + bw; px++) {
    const d = at(px, py);
    if (d) s.dot(px, py, d === 1 ? ink : d <= 1 + b ? T.band : T.face);
  }
  if (!pressed && !sh) {
    // the body's own bottom line joins the lip, so the lip shows 2 px of colour
    const row = y + bh - 1, lipC = s.get(bx + (bw >> 1), row + 1);
    for (let px = bx + 1; px < bx + bw - 1; px++) if (s.get(px, row + 1) === lipC && at(px, row) === 1) s.dot(px, row, T.lip);
  }
  if (sh && !pressed) for (let py = 0; py < s.h; py++) for (let px = 0; px < s.w; px++) if (s.get(px, py)) g.dot(px - sh, py + sh, ink);
  g.blit(s);
  return {
    text: { x: x + 8, y: by + 5, w: w - 16, h: bh - 10 },
    body: { x: bx, y: by, w: bw, h: bh },
    slice: pressed ? { left: 7, top: 8, right: 7, bottom: 4 } : { left: 7, top: 7, right: 7, bottom: 7 },
    tones: T,
    edge: { x: bx + (bw >> 1), y: by + 1 },
  };
}

// Draws one clip and returns what the helper says about it (text area, slice, band pixel).
function piece(g, clip, p) {
  if (isTab(clip)) return skinTab(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip === 'tab-active', 'flat', look(p));
  if (p.style === 'pill') return pillButton(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip, p);
  return skinButton(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip, 'flat', look(p));
}
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
function slice(clip, p) {
  const s = plus1(piece(new Surface(...SIZE), clip, p).slice);
  // pressed: top 9 and bottom 5 as ui-buttons-wood. The flat body's last row of face sits 6 rows up, so row 26 of
  // the frame is still a plain face row and stretches like the middle (checked for every style, border, corner, shadow).
  if (clip === 'pressed') return { ...s, top: 9, bottom: 5 };
  if (clip === 'tab-active') return { ...s, top: Math.max(8, s.top) };
  return s;
}
// The open tab's text area starts under its 8 px top slice; every other clip keeps the helper's.
function textOf(clip, out) {
  if (clip !== 'tab-active') return out.text;
  const t = out.text, y = Math.max(t.y, 8);
  return { ...t, y, h: Math.min(t.h, SIZE[1] - 2 - y) };
}

export default defineSprite({
  id: 'ui-buttons-flat',
  name: 'Flat buttons',
  kind: 'Item',
  blurb: 'A stretchable flat menu button with no light or bevel, in four states (normal, hover, pressed, disabled) plus a tab and an open tab; change its style, corners, edge, shadow and colours.',
  meta: {
    type: 'ui', role: 'interface/button', themes: ['neutral', 'city'], gameTypes: ['arcade', 'puzzle', 'card-game', 'racing'], view: 'none',
    words: ['button', 'menu', 'flat', 'modern', 'mobile', 'tab', 'pill', 'press', 'click', 'hover', 'start', 'clean', 'minimal', 'casual'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 16],
  grounded: false,
  preview: 'normal',
  slice,
  params: {
    style: choice('Style', 'solid', [...SKIN_STYLES.flat]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round', when: { style: ['solid', 'outline'] } }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shadow: toggle('Shadow', false),
    face: color('Face', P.cavern, SW.face),
    frame: color('Edge', P.cream, SW.frame),
  },
  clips: {
    ...Object.fromEntries(BUTTON_STATES.map((s) => [s, { frames: 1, fps: 8, loop: true }])),
    tab: { frames: 1, fps: 8, loop: true, label: 'Tab' },
    'tab-active': { frames: 1, fps: 8, loop: true, label: 'Open tab' },
  },
  versions: [
    { name: 'Blue button', params: {} },
    { name: 'Outline', params: { style: 'outline', border: 1 } },
    { name: 'Wine pill', params: { style: 'pill', face: H.bandit } },
    { name: 'Brown with shadow', params: { face: P.soil, shadow: true } },
    { name: 'Night square', params: { face: D.plate, corner: 0, frame: P.sky } },
  ],
  // Where the label goes in each clip (white text), and one pixel of the band to check it against the face.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p);
    return { ...textOf(clip, out), text: SKIN_TEXT.flat, edge: out.edge };
  },
  sounds: {
    pressed: [{ sound: 'tech-click', preset: 'Select', frame: 0, volume: 0.6 }],
    'tab-active': [{ sound: 'menu-move', preset: 'Tab', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
