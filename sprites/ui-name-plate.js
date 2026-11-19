// Name plate (core-sprites-3, batch K23): a small dark plate for a name over a character, stretched sideways to the
// name's length.
//   plate        the plate
//   plate-badge  with a round level badge at its left end (its inside the plate's colour: a second text area)
//   plate-lit    while targeted: the band turns the accent, and an arrow head of the accent (5 px tall, with an ink rim
//                where it meets the face) grows from the band at each end, pointing in at the name (litPlate)
//   pointer      a notch (plateNotch), its top on row 10, for a game to set under the plate's middle; its point is the
//                `tip` socket
// Drawn by engine/bubbles.js into the frame minus its 1 px border and never outlined again, its shadow off; the drop
// shadow is cast by dropShadow (engine/drop-shadow.js) 2 px left and 1 px down, so the plate keeps 13 rows and its text
// 7 (a medium cap) at the default band. Text areas: the helper's `text` (and `badgeText`), white text; slice: the text
// area's distance from each side of the box, plus the frame's 1 px (on plate-lit the text area stops short of the
// arrows). No words are drawn.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { worstContrast } from '../engine/ui.js';
import { PALETTE } from '../engine/palettes.js';
import { col, INK, tone, brightness } from '../engine/color.js';
import { skinSwatches, SKIN_TEXT } from '../engine/ui-skins.js';
import { PLATE_STYLES, namePlate, plateNotch } from '../engine/bubbles.js';
import { dropShadow } from '../engine/drop-shadow.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [64, 16];
const BOX = { x: 1, y: 1, w: 62, h: 14 };            // the frame minus its 1 px border
const NOTCH_TOP = 10;                                 // the pointer clip: the row of its top
const SW = skinSwatches('flat', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.cream, P.sky, P.goblin, P.steel, P.skin],
  accent: [P.gold, P.crimson, P.magic, P.moss, P.ember],
});
const PLATES = { plate: {}, 'plate-badge': { badge: true }, 'plate-lit': { lit: true } };

// The targeted look, on the plate drawn with lit off: every band pixel turns the accent (lifted by litBand so it stands
// off the plate and shows against every band), and an arrow head of the accent grows from the inner edge of the band at each end, on the plate's
// middle row: columns 5, 5, 3 and 1 px tall on the face, its rim ink where it meets the face, so it stands off any face
// (and the rim off any band swatch: ink is 9:1 or more against all five). Returns
// the text area, narrowed if an arrow would reach it.
const ARROW = [[0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [1, -2], [1, -1], [1, 0], [1, 1], [1, 2], [2, -1], [2, 0], [2, 1], [3, 0]];
// The lit band's colour: the accent, lifted (lighter, same hue) until it keeps 3 to 1 against the plate under every
// look and sits 0.1 or more apart in brightness from the band it replaces, so the change shows at 1x (magic on sky,
// moss on green). A darker accent cannot hold 3 to 1 against the dark plates under the Spooky and Mono looks.
function litBand(p) {
  let fallback = null;
  for (let t = 0; t <= 2.4; t += 0.15) {
    const c = tone(p.accent, t);
    if (worstContrast(c, p.face) < 3) continue;
    fallback ??= c;
    if (Math.abs(brightness(c) - brightness(p.frame)) >= 0.1) return c;
  }
  return fallback ?? p.accent;
}
function litPlate(s, out, p) {
  const lit = litBand(p);
  const band = col(p.frame), face = col(p.face), acc = col(lit);
  for (let i = 0; i < s.data.length; i++) if (s.data[i] === band) s.data[i] = acc;
  const B = out.body, my = B.y + Math.floor((B.h - 1) / 2);
  let text = { ...out.text };
  for (const dir of [1, -1]) {
    // the first face column on the middle row, from this end: the arrow's 5 px base sits on it, against the band
    let x = dir > 0 ? B.x : B.x + B.w - 1;
    while (s.get(x, my) !== face && Math.abs(x - B.x - (dir > 0 ? 0 : B.w - 1)) < B.w >> 1) x += dir;
    const base = x;
    const core = ARROW.map(([u, v]) => [base + dir * u, my + v]);
    const inCore = (px, py) => core.some(([cx, cy]) => cx === px && cy === py);
    for (const [cx, cy] of core) for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!inCore(cx + ex, cy + ey) && s.get(cx + ex, cy + ey) === face) s.dot(cx + ex, cy + ey, INK);
    for (const [cx, cy] of core) if (s.get(cx, cy) && s.get(cx, cy) !== col(INK)) s.dot(cx, cy, p.accent);
    // the text keeps 1 px clear of the arrow's rim
    const reach = base + dir * 5;
    if (dir > 0 && text.x <= reach) { text.w -= reach + 1 - text.x; text.x = reach + 1; }
    if (dir < 0 && text.x + text.w > reach) text.w = reach - text.x;
  }
  return text;
}

const SHADOW = [-2, 1];                              // the drop shadow: 2 px left, 1 px down (16 rows cannot spare 2)
// The plate with its shadow; returns the helper's rectangles and the slice from the box.
function plate(g, clip, p) {
  const [sx, sy] = p.shadow ? SHADOW : [0, 0];
  const s = new Surface(...SIZE);
  const out = namePlate(s, BOX.x - sx, BOX.y, BOX.w + sx, BOX.h - sy, {
    style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner, shadow: false, ...PLATES[clip], lit: false,
  });
  if (PLATES[clip].lit) out.text = litPlate(s, out, p);
  if (p.shadow) dropShadow(g, s, { dx: sx, dy: sy, box: BOX });
  else g.blit(s);
  const t = out.text;
  return { ...out, slice: { left: t.x - BOX.x, top: t.y - BOX.y, right: BOX.x + BOX.w - (t.x + t.w), bottom: BOX.y + BOX.h - (t.y + t.h) } };
}
const notch = (g, p) => plateNotch(g, SIZE[0] >> 1, NOTCH_TOP, { size: 3, face: p.face, frame: p.frame });
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });

export default defineSprite({
  id: 'ui-name-plate',
  name: 'Name plate',
  kind: 'Item',
  blurb: 'A small stretchable plate for a name over a character, with a level badge, a lit state for the one targeted and a notch pointing down; change its style, corners, band, shadow and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral'], gameTypes: ['arcade', 'top-down-rpg', 'turn-based-rpg', 'roguelike-action'], view: 'none',
    words: ['name', 'plate', 'label', 'tag', 'nameplate', 'level', 'target', 'banner'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 15],
  grounded: false,
  preview: 'plate',
  slice: (clip, p) => (PLATES[clip] ? plus1(plate(new Surface(...SIZE), clip, p).slice) : undefined),
  params: {
    style: choice('Style', 'plain', [...PLATE_STYLES]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round', when: { style: ['plain'] } }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shadow: toggle('Shadow', true),
    face: color('Plate', P.cavern, SW.face),
    frame: color('Band', P.cream, SW.frame, { material: 'paint' }),
    accent: color('Badge and arrows', P.gold, SW.accent),
  },
  clips: {
    plate: { frames: 1, fps: 8, loop: true, label: 'Name' },
    'plate-badge': { frames: 1, fps: 8, loop: true, label: 'Name and level badge' },
    'plate-lit': { frames: 1, fps: 8, loop: true, label: 'Name, while targeted' },
    pointer: { frames: 1, fps: 8, loop: true, label: "Notch, set under the plate's middle", noText: true },
  },
  versions: [
    { name: 'Name plate', params: {} },
    { name: 'Ribbon', params: { style: 'ribbon', face: H.bandit } },
    { name: 'Pointed sky', params: { style: 'pointed', frame: P.sky, accent: P.crimson } },
    { name: 'Soil and green', params: { face: P.soil, frame: P.goblin, shadow: false } },
    { name: 'Square steel', params: { corner: 0, frame: P.steel, border: 1 } },
  ],
  // Where the name goes (white text), and on the badge plate the level number too, each checked against the band.
  textArea(clip, p) {
    if (!PLATES[clip]) return null;
    const out = plate(new Surface(...SIZE), clip, p), text = SKIN_TEXT.flat;
    const main = { ...out.text, text, edge: out.edge };
    return out.badgeText ? [main, { ...out.badgeText, text, edge: out.edge }] : main;
  },
  sockets: (clip, t, p) => {
    if (clip !== 'pointer') return {};
    const { tip } = notch(new Surface(...SIZE), p);
    return { tip: { x: tip.x + 0.5, y: tip.y + 1, angle: 0 } };
  },

  render(g, { clip, p }) {
    if (clip === 'pointer') notch(g, p);
    else plate(g, clip, p);
  },
});
