// Paper buttons (core-sprites-2, batch K11): a menu button cut from a sheet of paper and ruled in ink, one clip
// per state, plus a paper tab and an open tab, built on engine/ui-skins.js (skin `paper`).
//   normal    the sheet stands on a 2 px lip (or, with Shadow, on its drop shadow)
//   hover     the paper one tone lighter            pressed   2 px lower, down onto the lip or the shadow
//   disabled  no colour                             tab       a darker paper tab standing on a ruled line
//   tab-active  a full-height tab in the paper's own colour, open at the bottom so it joins a paper panel
// Styles: sheet (a double ruled line), torn (a deckled edge: 2 px bites spread along every side, engine/paper-tear.js;
// a bite shows the drop shadow behind it), card (the top right corner folded down into a 6x6 flap of the paper's
// dark tone, and a card edge along the bottom). Nothing but the rules crosses the clear middle 78x18 (2 px lower
// when pressed). The bites along the sides lie in the stretched middle columns and rows too: a stretched torn
// button stretches its bites with it.
//
// Stretching (`slice`; the export writes it as `border`, Contract 8): the helper's slice plus the frame's 1 px:
// 8 px on every side; pressed top 9 and the bottom down to the inner rule (5 at the default rule, 6 with a 2 px
// rule); tabs 8 left, right and top (the inactive tab 9: it stands 2 px lower), and 1 (open tab) or 2 (tab on
// its ruled line) at the bottom. The open tab's text starts under its top slice.
// Text: dark (INK). skinSwatches keeps only papers on which INK holds 4.5 to 1 and inks that hold 3 to 1 against
// every kept paper, under every whole-bundle look; the inactive tab is darkened by at most tone(face, -0.5).
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { BUTTON_STATES } from '../engine/ui.js';
import { desaturate, LIP } from '../engine/ui.js';
import { tone, INK } from '../engine/color.js';
import { skinButton, skinTab, skinTones, skinSwatches, SKIN_STYLES, SKIN_TEXT } from '../engine/ui-skins.js';
import { tearEdges, deckleBites, foldCorner } from '../engine/paper-tear.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 32];
const SW = skinSwatches('paper', { face: [P.cream, H.wheat, P.skin, P.steel, P.goblin], frame: [P.cavern, P.soil, D.plate, H.bandit] });

const FOLD = 5;                                     // the card fold: a flap 6x6 with its crease, inside the slice
const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, border: p.border, corner: p.corner, shadow: p.shadow });
// Draws one clip and returns what the helper says about it (text area, slice, band pixel), with the torn bites and
// the card fold drawn over the helper's corner marks.
function piece(g, clip, p) {
  const tab = clip === 'tab' || clip === 'tab-active';
  const out = tab ? skinTab(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip === 'tab-active', 'paper', look(p))
    : skinButton(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip, 'paper', look(p));
  const off = clip === 'disabled', grey = (c) => (off ? desaturate(c) : c);
  const shadowOn = !tab && p.shadow && clip !== 'pressed';
  const shadow = shadowOn ? { dx: -2, dy: 2, colour: grey(INK) } : null;
  // the piece as drawn: the body, and the lip under it when there is neither a shadow nor a press
  const b = out.body, lip = !tab && !p.shadow && clip !== 'pressed' ? LIP : 0;
  const box = tab ? { x: b.x, y: b.y, w: b.w, h: SIZE[1] - 1 - b.y } : { x: b.x, y: b.y, w: b.w, h: b.h + lip };
  if (p.style === 'torn') {
    // tabs: no bites along the open bottom (it joins the panel) or the ruled line it stands on
    const sides = tab ? ['top', 'left', 'right'] : undefined;
    const bites = deckleBites(tab ? { ...box, h: box.h - 3 } : box, { sides });
    tearEdges(g, tab && clip === 'tab' ? { ...box, h: box.h - 1 } : box, bites, { ink: grey(INK), shadow });
  }
  if (p.style === 'card') {
    const T = skinTones('paper', { face: p.face, frame: p.frame, style: p.style, state: tab ? 'normal' : clip });
    const face = tab && clip === 'tab' ? T.faceDark : T.face;
    foldCorner(g, box, FOLD, { flap: grey(tone(face, -1)), ink: grey(INK), shadow });
  }
  return out;
}
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
// The run of rows identical to the middle one, down column x: where a pressed sheet's flat middle ends.
function flatBottom(p) {
  const g = new Surface(...SIZE), out = skinButton(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, 'pressed', 'paper', { ...look(p), style: 'sheet' });
  const x = SIZE[0] >> 1, mid = out.text.y + (out.text.h >> 1), c = g.get(x, mid);
  let y = mid; while (y + 1 < SIZE[1] && g.get(x, y + 1) === c) y++;
  return SIZE[1] - 1 - y;
}
function slice(clip, p) {
  const s = plus1(piece(new Surface(...SIZE), clip, p).slice);
  if (clip === 'pressed') return { ...s, top: 9, bottom: flatBottom(p) };
  if (clip === 'tab-active') return { ...s, top: 8 };
  return s;
}
// The band pixel to check the ink against: the helper's, or, where a torn edge has bitten it away, the nearest pixel
// along the same row that the bites left as the untorn sheet drew it (with both its neighbours untouched too).
function steadyEdge(g, clip, p, edge) {
  if (g.get(edge.x, edge.y)) return edge;
  const ref = new Surface(...SIZE);
  piece(ref, clip, { ...p, style: 'sheet' });
  const same = (x) => x >= 0 && x < SIZE[0] && g.get(x, edge.y) === ref.get(x, edge.y);
  for (let d = 1; d < SIZE[0]; d++) for (const x of [edge.x - d, edge.x + d]) {
    if (g.get(x, edge.y) && same(x - 1) && same(x) && same(x + 1)) return { x, y: edge.y };
  }
  return edge;
}
// The open tab's text area starts under its 8 px top slice; every other clip keeps the helper's.
function textOf(clip, out) {
  if (clip !== 'tab-active') return out.text;
  const t = out.text, y = Math.max(t.y, 8);
  return { ...t, y, h: Math.min(t.h, SIZE[1] - 1 - 1 - y) };
}

export default defineSprite({
  id: 'ui-buttons-paper',
  name: 'Paper buttons',
  kind: 'Item',
  blurb: 'A stretchable menu button and tab cut from paper and ruled in ink, in four states (normal, hover, pressed, disabled) plus a tab and an open tab; change its style, corners, rule, shadow and colours.',
  meta: {
    type: 'ui', role: 'interface/button', themes: ['neutral'], gameTypes: ['arcade', 'puzzle', 'card-game', 'farming-sim'], view: 'none',
    words: ['button', 'menu', 'paper', 'ink', 'tab', 'sheet', 'card', 'press', 'click', 'hover', 'start', 'cosy', 'notebook', 'torn'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 16],
  grounded: false,
  preview: 'normal',
  slice,
  params: {
    style: choice('Style', 'sheet', [...SKIN_STYLES.paper]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shadow: toggle('Shadow', true),
    face: color('Paper', P.cream, SW.face, { material: 'paint' }),
    frame: color('Ink', P.cavern, SW.frame),
  },
  clips: {
    ...Object.fromEntries(BUTTON_STATES.map((s) => [s, { frames: 1, fps: 8, loop: true }])),
    tab: { frames: 1, fps: 8, loop: true, label: 'Tab, for a page that is not open' },
    'tab-active': { frames: 1, fps: 8, loop: true, label: 'Open tab, for the page on view' },
  },
  versions: [
    { name: 'Notebook', params: {} },
    { name: 'Torn page', params: { style: 'torn', face: P.skin } },
    { name: 'Index card', params: { style: 'card', face: H.wheat } },
    { name: 'Blue print', params: { face: P.steel, frame: D.plate } },
    { name: 'Red ink note', params: { shadow: false, corner: 0, border: 1, frame: H.bandit } },
  ],
  // Where the label goes in each clip, and one pixel of the ruled line to check the ink against the paper (beside a
  // torn bite, never in one).
  textArea(clip, p) {
    const g = new Surface(...SIZE), out = piece(g, clip, p);
    return { ...textOf(clip, out), text: SKIN_TEXT.paper, edge: steadyEdge(g, clip, p, out.edge) };
  },
  sounds: {
    pressed: [{ sound: 'ui-click', preset: 'Soft tap', frame: 0, volume: 0.6 }],
    'tab-active': [{ sound: 'menu-move', preset: 'Page turn', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
