// Paper panels (core-sprites-2, batch K11): boxes for menus, notes, a quest log and a tooltip that match the paper
// buttons, built on engine/ui-skins.js (skin `paper`).
//   panel         a loose sheet ruled in ink, pinned at its top corners
//   panel-title   the same with a heading band: the paper's own colour between two ink rules
//   inset         a list well: the paper darkened by at most tone(face, -0.5), with a sunken ink line
//   tooltip       a small sheet (94x40 at the top of the frame) with a tail 6 px wide and 5 tall under its bottom
//                 left corner, opening out of the sheet's bottom rule
// Styles: sheet, torn (a deckled edge: 2 px bites spread along every side, engine/paper-tear.js), card (the top
// right corner folded down into a 7x7 flap of the paper's dark tone, a card edge along the bottom). With pins on a
// card, the right pin pins the folded flap down (2 px in and down from where it sits on a sheet), so the fold shows.
// The bites along the sides lie in the stretched middle too: a stretched torn panel stretches its bites with it.
//
// Stretching (`slice`; Contract 8): panel and inset nine-slice with 8 px; panel-title the same with its top border
// down to the rule under the heading, so the heading keeps its height; tooltip 7 px round its own rectangle, the
// tail inside the left 8 px.
// Text: dark (INK) on `inner` and on the heading band; skinSwatches keeps only papers on which INK holds 4.5 to 1
// and inks that hold 3 to 1 against them, under every whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9 } from '../engine/ui.js';
import { tone, INK } from '../engine/color.js';
import { skinPanel, skinTooltip, skinTones, skinSwatches, SKIN_STYLES, SKIN_TEXT } from '../engine/ui-skins.js';
import { tearEdges, deckleBites, foldCorner, moveMark, tooltipTail } from '../engine/paper-tear.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 64];
const TITLE = 11;                                    // rows of the heading band
const TIP = { x: 1, y: 1, w: 94, h: 40 };            // the tooltip's rectangle, tail included
const SW = skinSwatches('paper', {
  face: [P.cream, H.wheat, P.skin, P.steel, P.goblin],
  frame: [P.cavern, P.soil, D.plate, H.bandit],
  accent: [P.crimson, P.ember, P.gold, P.magic, P.moss, P.hero],
});

const TAIL = 5;                                      // rows of the tooltip's tail under its sheet
const FOLD = 6;                                      // the card fold: a 7x7 square with its crease, inside the slice
const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner, extras: p.pins });
function draw(g, clip, p, o) {
  if (clip === 'tooltip') return skinTooltip(g, TIP.x, TIP.y, TIP.w, TIP.h, 'paper', o);
  return skinPanel(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, 'paper', { ...o, title: clip === 'panel-title' ? TITLE : 0, inset: clip === 'inset' });
}
function piece(g, clip, p) {
  const card = p.style === 'card', pins = p.pins && card;
  // a pinned card draws its pins itself, after the fold: the right one moved onto the flap
  const out = draw(g, clip, p, { ...look(p), extras: p.pins && !card });
  const box = clip === 'tooltip' ? { x: TIP.x, y: TIP.y, w: TIP.w, h: TIP.h - TAIL } : out.body;
  if (clip === 'tooltip') tooltipTail(g, TIP.x, TIP.y + TIP.h - TAIL, { rows: TAIL, width: 6, open: 2, face: p.face });
  if (p.style === 'torn') tearEdges(g, box, deckleBites(box, { margin: clip === 'tooltip' ? 9 : 8 }));
  if (card) {
    const T = skinTones('paper', { face: p.face, frame: p.frame, style: p.style });
    foldCorner(g, box, FOLD, { flap: tone(clip === 'inset' ? T.faceDark : T.face, -1) });
  }
  if (pins) {
    // the pins as the helper draws them, copied over: the left in place, the right 2 px in and 2 px down
    const a = new Surface(g.w, g.h), b = new Surface(g.w, g.h);
    draw(a, clip, p, { ...look(p), style: 'sheet', extras: true });
    draw(b, clip, p, { ...look(p), style: 'sheet', extras: false });
    const half = box.w >> 1;
    moveMark(g, a, b, { x: box.x, y: box.y, w: half, h: 7 });
    moveMark(g, a, b, { x: box.x + half, y: box.y, w: box.w - half, h: 7 }, { dx: -2, dy: 2 });
  }
  return out;
}

function slice(clip, p) {
  if (clip === 'tooltip') return slice9(TIP);
  if (clip === 'panel-title') return { ...slice9(), top: piece(new Surface(...SIZE), clip, p).inner.y };
  return slice9();
}

export default defineSprite({
  id: 'ui-panel-paper',
  name: 'Paper panels',
  kind: 'Item',
  blurb: 'Stretchable paper boxes ruled in ink for menus and notes: a pinned sheet, a sheet with a heading, a list well and a tooltip; change the style, corners, rule, pins and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral'], gameTypes: ['arcade', 'puzzle', 'card-game', 'farming-sim'], view: 'none',
    words: ['panel', 'window', 'box', 'menu', 'paper', 'note', 'sheet', 'ink', 'pin', 'tooltip', 'quest log', 'list', 'popup', 'cosy'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 32],
  grounded: false,
  preview: 'panel',
  slice,
  params: {
    style: choice('Style', 'sheet', [...SKIN_STYLES.paper]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    pins: toggle('Pins', true),
    face: color('Paper', P.cream, SW.face, { material: 'paint' }),
    frame: color('Ink', P.cavern, SW.frame),
    accent: color('Pins', P.crimson, SW.accent, { when: { pins: [true] } }),
  },
  clips: {
    panel: { frames: 1, fps: 8, loop: true, label: 'Panel' },
    'panel-title': { frames: 1, fps: 8, loop: true, label: 'With heading' },
    inset: { frames: 1, fps: 8, loop: true, label: 'List well' },
    tooltip: { frames: 1, fps: 8, loop: true, label: 'Tooltip' },
  },
  versions: [
    { name: 'Notebook', params: {} },
    { name: 'Pinned card', params: { style: 'card', accent: P.gold, face: P.skin } },
    { name: 'Torn page', params: { style: 'torn', pins: false, frame: H.bandit } },
    { name: 'Old letter', params: { face: H.wheat, frame: P.soil } },
    { name: 'Mint memo', params: { face: P.goblin, accent: P.hero } },
  ],
  // Where text goes (dark text), and one pixel of the ruled line (or the well's sunken line) to check against.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p), text = SKIN_TEXT.paper;
    const main = { ...out.inner, text, edge: out.edge };
    return out.title ? [main, { ...out.title, text, edge: out.edge }] : main;
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
