// Vine checkboxes and cursor (core-sprites-3, batch K27): the small pieces of a settings screen in the grove skin,
// matching ui-buttons-grove.
//   check-on, check-off   a 20x20 bark box in the vine, ticked in the Tick colour or empty (one outline for both)
//   radio-on, radio-off   a round option in the vine, with a dot of the Tick colour or empty
//   switch-on, switch-off a 28x16 switch: the knob right on a lit track of the Tick colour, or left on the dark bark
//   pointer               a leaf, 20 px long, its vein in the Tick colour, that nudges 2 px towards what it points at;
//                         its hot spot is the `tip` socket (angle PI/2: pointing right). Never a hand. It is drawn
//                         here, not with moreSkinPointer: that helper's grove leaf is a lens, the same both ways, and
//                         points nowhere at game size. This leaf has a stalk and a broad round base on the left, its
//                         widest 4 px in, and tapers to one sharp tip on the right where the socket is
//   selector              four vine brackets round the whole frame: L corners with arms of 7 px (8 when they reach),
//                         2 px thick, drawn here because skinSelector's arms stop at 4 px and read as stray leaves.
//                         They step in 2 px, reach along the slot, bud at their ends and step back out, so stepping
//                         in (no buds) and stepping out (budded) differ and every frame differs from the one before
// Each piece is drawn by the flat helper of engine/ui-skins.js (style from moreSkinBase) and finished by groveMarks
// (engine/ui-grove-vine.js: moreSkinMarks with pieces 'check', 'radio', 'switch', 'selector', then the striped twist
// and the bloom's rimmed flower). As ui-controls-neon settled, they are not re-cut with roundSlab: a
// 20 px box has no room for its 7 px corner square, and the flat helpers round these pieces themselves from Corner.
// Border: the flat box and option stop at a 2 px band; Thick grows it one ring inwards with thickenBand
// (engine/ui-skins-more-kit.js), so the bark ring and the twist have a third pixel to lie on.
// A deliberate deviation from style guide section 8, as part 2 settled: a sheet of controls has no `idle` clip;
// `check-on` comes first and the cursor clip is named `pointer`. `selector` nine-slices round any slot (slice9); no
// other clip stretches. No clip carries text.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, pulse, fract } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9, borderPx } from '../engine/ui.js';
import { Surface } from '../engine/surface.js';
import { skinCheck, skinRadio, skinSwitch, skinSwatches, skinTones } from '../engine/ui-skins.js';
import { MORE_SKIN_STYLES, moreSkinBase } from '../engine/ui-skins-more.js';
import { tone, INK } from '../engine/color.js';
import { groveMarks } from '../engine/ui-grove-vine.js';
import { thickenBand } from '../engine/ui-skins-more-kit.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [32, 32], C = 16;
const BOX = 20, SWITCH = { x: 2, y: 8, w: 28, h: 16 }, POINTER = { x: 4, y: 16, len: 20 };
const SW = skinSwatches('flat', {
  face: [P.soil, P.cavern, H.bandit, D.plate],
  frame: [P.goblin, H.heal, H.wheat, P.cream],
  accent: [P.grass, P.crimson, P.ember, P.thorn, P.hero],
});
const look = (p) => ({ style: moreSkinBase('grove', p.style).style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner });
// No keep: these pieces never stretch (only the selector nine-slices, and its brackets are all corner), so the vine
// twists all the way round (a stripe of its dark tone every 2 px straight across the band and 1 px on over the
// bark, so a 2 px band reads as a twisted vine: groveMarks of engine/ui-grove-vine.js), the knots and the bloom's
// rimmed flower in the corners
const marks = (g, body, piece, p) => groveMarks(g, body, p.style, { piece, face: p.face, frame: p.frame, accent: p.accent, rect: body, twistIn: 1 });
const thick = (p) => borderPx(p.border) >= 3;
// The pointer's loop starts a quarter in, so its first and last frames differ: 1, 2, 2, 2, 1, 0, 0, 0 px.
const bob = (t) => Math.round(2 * pulse(fract(t + 0.25)));
// Draws the pointer and returns its hot spot (shared by render and sockets, so the socket follows the arrow).
// The leaf: a stalk (2 px), then a body 16 px long whose half-height rises round to 5 px at a quarter of its length
// and falls in a concave curve to a single pixel on the middle row, the vein along that row.
const pointer = (g, t, p) => {
  const { x, y, len } = POINTER, R = p.frame, A = p.accent, L = len - 2;
  const x0 = x + 1 + bob(t), lx = x0 + 2, tipX = x0 + L - 1, n = tipX - lx + 1, hh = 5, kw = 0.27;
  const s = new Surface(g.w, g.h);
  const half = (px) => {
    const k = (px + 0.5 - lx) / n;
    if (k < 0 || k > 1) return -1;
    if (k < kw) return hh * Math.sqrt(1 - ((kw - k) / kw) ** 2) + 0.4;
    return hh * (1 - (k - kw) / (1 - kw)) ** 1.35 + 0.3;
  };
  s.fill(lx, y - hh, tipX + 1, y + hh + 1, (cx, cy) => { const px = Math.floor(cx), py = Math.floor(cy); return px === tipX ? py === y : Math.abs(py - y) <= half(px); }, R);
  // the underside in shade at the back, the vein along the middle, the stalk curling down at its end
  for (let px = lx; px < lx + 7; px++) for (let py = y + 1; py <= y + hh; py++) if (s.get(px, py) && !s.get(px, py + 1)) s.dot(px, py, tone(R, -0.6));
  for (let px = lx; px < tipX - 1; px++) s.dot(px, y, A);
  s.rect(x0, y, 2, 1, tone(R, -1));
  s.dot(x0, y + 1, tone(R, -1));
  s.outline(INK);
  g.blit(s);
  let tx = 0;
  for (let px = g.w - 1; px >= 0; px--) if (s.get(px, y)) { tx = px; break; }
  return { tip: { x: tx, y } };
};
// The selector's eight poses: how far in (px), arm length, bud size at the arm ends.
const SEL = [[0, 7, 0], [1, 7, 0], [2, 7, 0], [2, 8, 0], [2, 8, 2], [1, 7, 2], [0, 7, 2], [0, 7, 1]];
const selector = (g, t, p) => {
  const [inn, arm, bud] = SEL[Math.floor(fract(t) * 8 + 1e-6) % 8];
  const T = skinTones('flat', look(p)), s = new Surface(g.w, g.h);
  for (const [cx, cy, sx, sy] of [[2, 2, 1, 1], [29, 2, -1, 1], [29, 29, -1, -1], [2, 29, 1, -1]]) {
    const ox = cx + sx * inn, oy = cy + sy * inn;
    for (let i = 0; i < arm; i++) for (let j = 0; j < 2; j++) { s.dot(ox + sx * i, oy + sy * j, T.band); s.dot(ox + sx * j, oy + sy * i, T.band); }
    // a bud of the Tick colour on each arm end as the brackets let go (2 px, then 1 px as it closes)
    for (let j = 0; j < bud; j++) { s.dot(ox + sx * arm, oy + sy * j, p.accent); s.dot(ox + sx * j, oy + sy * arm, p.accent); }
  }
  s.outline(INK);
  g.blit(s);
};
const fps = (p) => 8 * lerp(0.65, 1.45, p.speed);

export default defineSprite({
  id: 'ui-controls-grove',
  name: 'Vine checkboxes and cursor',
  kind: 'Item',
  blurb: 'The small pieces of a settings screen in bark and living vine: a ticked and an empty box, a round option, an on/off switch, a leaf pointer that nudges and vine brackets round a chosen slot; change the style, corners, vine, colours and speed.',
  meta: {
    type: 'ui', role: 'interface/cursor', themes: ['neutral', 'forest', 'farm'], gameTypes: ['arcade', 'farming-sim', 'top-down-rpg', 'puzzle'], view: 'none',
    words: ['checkbox', 'radio', 'switch', 'cursor', 'pointer', 'toggle', 'selector', 'vine', 'leaf', 'bark'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [16, 16],
  grounded: false,
  preview: 'check-on',
  slice: { selector: slice9() },
  params: {
    style: choice('Style', 'vine', [...MORE_SKIN_STYLES.grove]),
    corner: range('Corner', 0.75, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    face: color('Bark', P.soil, SW.face, { material: 'wood' }),
    frame: color('Vine', P.goblin, SW.frame, { material: 'plant' }),
    accent: color('Tick', P.grass, SW.accent, { material: 'plant' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    'check-on': { frames: 1, fps: 8, loop: true, label: 'Ticked box, while the option is on', noText: true },
    'check-off': { frames: 1, fps: 8, loop: true, label: 'Empty box, while the option is off', noText: true },
    'radio-on': { frames: 1, fps: 8, loop: true, label: 'Chosen dot, for the one option picked', noText: true },
    'radio-off': { frames: 1, fps: 8, loop: true, label: 'Empty dot, for each option not picked', noText: true },
    'switch-on': { frames: 1, fps: 8, loop: true, label: 'Switch, while the setting is on', noText: true },
    'switch-off': { frames: 1, fps: 8, loop: true, label: 'Switch, while the setting is off', noText: true },
    pointer: { frames: 8, fps, loop: true, label: 'Pointer, beside the item the player is on', noText: true },
    selector: { frames: 8, fps, loop: true, label: 'Selector, round the slot the player is on', noText: true },
  },
  versions: [
    { name: 'Vine', params: {} },
    { name: 'Bloom', params: { style: 'bloom', accent: P.crimson } },
    { name: 'Bark', params: { style: 'bark', frame: H.wheat } },
    { name: 'Birch night', params: { face: P.cavern, frame: P.cream, accent: P.hero } },
    { name: 'Mint berry', params: { face: H.bandit, frame: H.heal, accent: P.ember } },
  ],
  sounds: {
    'check-on': [{ sound: 'menu-wood-toggle', preset: 'Switch on', frame: 0, volume: 0.6 }],
    'switch-on': [{ sound: 'menu-wood-toggle', preset: 'Switch on', frame: 0, volume: 0.6 }],
  },
  sockets: (clip, t, p) => {
    if (clip !== 'pointer') return {};
    const { tip } = pointer(new Surface(...SIZE), t, p);
    return { tip: { x: tip.x, y: tip.y + 0.5, angle: Math.PI / 2 } };
  },
  render(g, { clip, t, p }) {
    const [kind, state] = clip.split('-'), on = state === 'on';
    if (kind === 'check' || kind === 'radio') {
      const { box } = (kind === 'check' ? skinCheck : skinRadio)(g, C, C, BOX, on, 'flat', look(p));
      if (thick(p)) thickenBand(g, box);
      marks(g, box, kind, p);
    } else if (kind === 'switch') {
      skinSwitch(g, SWITCH.x, SWITCH.y, SWITCH.w, SWITCH.h, on, 'flat', look(p));
      marks(g, SWITCH, 'switch', p);
    } else if (clip === 'pointer') pointer(g, t, p);
    else { selector(g, t, p); marks(g, { x: 1, y: 1, w: 30, h: 30 }, 'selector', p); }
  },
});
