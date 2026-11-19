// Candy panels (core-sprites-2, batch K12): pop-ups, result boxes and a shop window in boiled sugar, matching the
// candy buttons, built on engine/ui-skins.js (skin `candy`) rounded and marked by engine/ui-candy-slab.js.
//   panel         a deep sugar slab in a pale sugar rim, sprinkles scattered in the rim
//   panel-title   the same with a heading strip in the face's dark tone, under a line of the rim
//   inset         a list well: the face one tone darker
//   tooltip       a small slab (94x40 at the top of the frame) with a tail under its bottom left corner
// Corners: Corner 0.75 cuts 5, 3, 2 and 1 px (the tooltip's bottom left stays square: its tail hangs there).
// Styles: jelly (a 2 px glossy band under the top rim), striped (diagonal stripes 3 px apart all along the band, in a
// darker tone of the rim), frosted (the top rim iced down onto the face, drips in the top corners). No bubble.
// Sprinkles: a different scatter in each corner square, and along each side whose stretched run 16 divides (80 and
// 48 px; not the heading panel's or tooltip's sides) two per 16 px, the same in every 16, so a tiled side repeats.
//
// Stretching (`slice`; Contract 8): panel and inset nine-slice with 8 px; panel-title the same with its top border
// down to the line under the heading, so the heading keeps its height; tooltip 7 px round its own rectangle and 12
// at the bottom (the slab's bottom edge and the tail under it), the tail inside the left 8 px.
// Text: white on `inner` and on the heading strip; skinSwatches keeps only faces on which white holds 4.5 to 1 and
// rims that hold 3 to 1 against them, under every whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9 } from '../engine/ui.js';
import { skinPanel, skinTooltip, skinTones, skinSwatches, SKIN_STYLES, SKIN_TEXT } from '../engine/ui-skins.js';
import { tone } from '../engine/color.js';
import { roundSlab, candyCuts, candyStyle, candySprinkles, candyStripe } from '../engine/ui-candy-slab.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 64];
const TITLE = 11;                                    // rows of the heading strip
const TIP = { x: 1, y: 1, w: 94, h: 40 };            // the tooltip's rectangle, tail included
const SW = skinSwatches('candy', {
  face: [P.soil, P.cavern, H.bandit, D.plate],
  frame: [P.cream, P.skin, P.sky, P.goblin],
  accent: [P.magic, P.ember, P.steel, P.grass, P.moss],
});

const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner, cornerPx: 0, extras: false });
// Draws one clip with the helper (square corners, no marks of its own), then rounds it and adds the style's marks and
// the sprinkles (engine/ui-candy-slab.js), all outside the stretched middle except the rim stripes.
function piece(g, clip, p) {
  const tip = clip === 'tooltip';
  const out = tip ? skinTooltip(g, TIP.x, TIP.y, TIP.w, TIP.h, 'candy', look(p))
    : skinPanel(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, 'candy', { ...look(p), title: clip === 'panel-title' ? TITLE : 0, inset: clip === 'inset' });
  const body = tip ? { x: TIP.x, y: TIP.y, w: TIP.w, h: TIP.h - 5 } : out.body;
  // the tooltip's bottom left corner stays square: its tail hangs from it
  const slab = roundSlab(g, body, candyCuts(p.corner), { corners: [true, true, true, !tip] });
  const T = skinTones('candy', { face: p.face, frame: p.frame, accent: p.accent });
  const face = clip === 'inset' ? T.faceDark : T.face;
  // the stretched middle, as slice() gives it (the heading's rows do not stretch)
  const top = clip === 'panel-title' ? out.inner.y : body.y + 7;
  const keep = { x: body.x + 7, y: top, w: body.w - 14, h: body.y + body.h - 7 - top };
  candyStyle(g, slab, p.style, { keep, stripe: candyStripe(T.band), glossHi: tone(face, 0.85), glossLo: tone(face, 0.45), icing: T.bandLight });
  if (p.sprinkles) candySprinkles(g, slab, { colors: [T.accent, T.accentDark], keep });
  return { ...out, body };
}

// A text area kept clear of marks drawn over its corner (the frosted rim's icing and drips): while an edge row or column of the area holds a
// colour other than the one at its middle, that row or column is left out: first the side that loses the fewest
// pixels of that colour.
function clearArea(g, a) {
  let { x, y, w, h } = a;
  const c = g.get(x + (w >> 1), y + (h >> 1));
  // how many pixels of the middle colour a row or column holds, or -1 when it holds nothing else
  const row = (py) => { let n = 0; for (let px = x; px < x + w; px++) if (g.get(px, py) === c) n++; return n === w ? -1 : n; };
  const column = (px) => { let n = 0; for (let py = y; py < y + h; py++) if (g.get(px, py) === c) n++; return n === h ? -1 : n; };
  while (w > 0 && h > 0) {
    const cuts = [[row(y), () => { y++; h--; }], [row(y + h - 1), () => { h--; }], [column(x), () => { x++; w--; }], [column(x + w - 1), () => { w--; }]].filter(([n]) => n >= 0);
    if (!cuts.length) break;
    cuts.sort((m, n) => m[0] - n[0])[0][1]();
  }
  return { ...a, x, y, w, h };
}

function slice(clip, p) {
  // slice9(TIP), with the bottom 5 px deeper: the tail's 5 rows lie under the slab's own 7 px bottom border
  if (clip === 'tooltip') return { ...slice9(TIP), bottom: slice9(TIP).bottom + 5 };
  if (clip === 'panel-title') return { ...slice9(), top: piece(new Surface(...SIZE), clip, p).inner.y };
  return slice9();
}

export default defineSprite({
  id: 'ui-panel-candy',
  name: 'Candy panels',
  kind: 'Item',
  blurb: 'Stretchable glossy sugar boxes for pop-ups, results and shops: a panel, a panel with a heading, a list well and a tooltip, a deep candy slab in a pale sugar rim with sprinkles; change the style, corners, rim, sprinkles and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral', 'candy'], gameTypes: ['arcade', 'puzzle', 'card-game', 'racing'], view: 'none',
    words: ['panel', 'window', 'box', 'popup', 'menu', 'candy', 'sweet', 'sugar', 'sprinkles', 'tooltip', 'shop', 'results', 'list', 'glossy'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 32],
  grounded: false,
  preview: 'panel',
  slice,
  params: {
    style: choice('Style', 'jelly', [...SKIN_STYLES.candy]),
    corner: range('Corner', 0.75, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    sprinkles: toggle('Sprinkles', true),
    face: color('Candy', P.soil, SW.face, { material: 'paint' }),
    frame: color('Sugar', P.cream, SW.frame, { material: 'paint' }),
    accent: color('Sprinkles', P.magic, SW.accent, { when: { sprinkles: [true] } }),
  },
  clips: {
    panel: { frames: 1, fps: 8, loop: true, label: 'Panel' },
    'panel-title': { frames: 1, fps: 8, loop: true, label: 'With heading' },
    inset: { frames: 1, fps: 8, loop: true, label: 'List well' },
    tooltip: { frames: 1, fps: 8, loop: true, label: 'Tooltip' },
  },
  versions: [
    { name: 'Toffee box', params: {} },
    { name: 'Cherry stripe', params: { style: 'striped', face: H.bandit } },
    { name: 'Frosted blueberry', params: { style: 'frosted', face: P.cavern, sprinkles: false } },
    { name: 'Liquorice', params: { face: D.plate, accent: P.grass } },
    { name: 'Caramel', params: { frame: P.skin, accent: P.ember } },
  ],
  // Where text goes (white text), and one pixel of the sugar rim to check against. Frosted, the areas stop short of
  // the icing and the drips that hang onto the face.
  textArea(clip, p) {
    const g = new Surface(...SIZE), out = piece(g, clip, p), text = SKIN_TEXT.candy;
    const clear = (a) => (p.style === 'frosted' ? clearArea(g, a) : a);
    const main = { ...clear(out.inner), text, edge: out.edge };
    return out.title ? [main, { ...clear(out.title), text, edge: out.edge }] : main;
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
