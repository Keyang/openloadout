// FROZEN COPY, not a sprite: sprites/ui-score-counter.js as it was on 2026-11-20 (migration batch M9), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Score counter (core-sprites-3, batch K22): a HUD strip one row of digits tall. A case with a picture at its left
// and a row of digit windows (engine/counters.js), showing a sample score:
//   idle   the sample score at rest
//   roll   the last digit rolling up to the next one, like an odometer (rollDigit)
//   bump   points arrive: the digits flash white, then the digits and the picture hop 1 px and settle
//   frame  the empty case, for the game's own digits: its windows are the text areas (white text)
// The case never moves: counterPlate always gets the frame less its 1 px border (x 1 to 94, y 1 to 22). Only the
// digits and the picture move, inside the case. Digits are drawn here on purpose (a deviation from style guide
// section 8): idle, roll and bump are samples (noText); the frame clip draws none.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { Surface } from '../../../engine/surface.js';
import { starIn, heartIn } from '../../../engine/shapes.js';
import { lerp } from '../../../engine/motion.js';
import { ramp, INK } from '../../../engine/color.js';
import { PALETTE } from '../../../engine/palettes.js';
import { skinSwatches, SKIN_TEXT } from '../../../engine/ui-skins.js';
import { fontMetrics } from '../../../engine/pixel-font.js';
import { COUNTER_STYLES, rollDigit } from '../../../engine/counters.js';
import { windowDigit } from '../../../engine/counter-digits.js';
import { styledCounterPlate } from '../../../engine/counter-styles.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 24];
const CASE = { x: 1, y: 1, w: 94, h: 22 };     // the frame less its 1 px border, in every clip
const BORDER = 0.5;                            // a 2 px band
const INSIDE = 1 + (1 + Math.round(BORDER)) + 1;   // ink, band, ink: where the case's inside starts
const LEAD = 13;                               // the picture (12 px with its ink) and 1 px before the windows
const SAMPLE = 1250;
const FACES = skinSwatches('flat', { face: [P.cavern, P.soil, D.plate, H.bandit] }).face;

// The sample as the windows show it: the last `digits` places, padded with zeros or left empty (null).
function sample(n, p) {
  const s = String(n).slice(-p.digits), pad = p.digits - s.length;
  return [...Array(pad).fill(p.zeros ? '0' : null), ...s];
}

// The case and its windows, the same in every clip.
function plate(g, p) {
  return styledCounterPlate(g, CASE.x, CASE.y, CASE.w, CASE.h, {
    count: p.digits, metrics: fontMetrics(p.size, 'chunky'), style: p.style, face: p.face, frame: p.frame,
    border: BORDER, lead: p.icon === 'none' ? 0 : LEAD,
  });
}

// The picture just left of the first window (2 px of case between their inks): 10 px of fixed colour inside a
// 1 px ink line, lifted `dy` px.
function picture(g, kind, first, dy) {
  if (kind === 'none') return;
  const s = new Surface(...SIZE), cx = first.x - 8, cy = CASE.y + INSIDE + 7;
  if (kind === 'star') s.fill(cx - 6, cy - 6, cx + 6, cy + 6, starIn(cx, cy + 0.6, 5.6, 5, { inner: 0.45 }), ramp(P.gold), { light: 1 });
  else if (kind === 'heart') s.fill(cx - 6, cy - 6, cx + 6, cy + 6, heartIn(cx, cy, 10, 9), ramp(P.crimson), { light: 1 });
  else {
    s.ellipse(cx, cy, 5, 5, ramp(P.gold), { light: 1 });
    s.ellipse(cx, cy, 3, 3, ramp(P.gold).dark, { shade: 0 });
    s.ellipse(cx, cy, 2, 2, ramp(P.gold).light, { shade: 0 });
  }
  s.outline(INK);
  g.blit(s, 0, dy);
}

export default defineSprite({
  id: 'ui-score-counter',
  name: 'Score counter',
  kind: 'Item',
  blurb: 'A score plate for the top of the screen: a case with a picture and a row of digit windows, a digit that rolls up like an odometer and a bump when points arrive, plus the empty plate for the game\'s own digits; change the style, number of digits, size, picture, leading zeros and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral'], gameTypes: ['arcade', 'platformer', 'shooter', 'puzzle'], view: 'none',
    words: ['score', 'counter', 'points', 'digits', 'hud', 'odometer', 'count', 'coins'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 12],
  grounded: false,
  params: {
    style: choice('Style', 'plate', [...COUNTER_STYLES]),
    digits: range('Digits', 6, { min: 3, max: 7, step: 1, lo: 'Few', hi: 'Many' }),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    icon: choice('Picture', 'star', ['none', 'star', 'coin', 'heart']),
    zeros: toggle('Leading zeros', true, { when: { digits: [5, 6, 7] } }),
    face: color('Windows', P.cavern, FACES),
    frame: color('Case', P.cream, [P.cream, P.sky, P.goblin, P.steel, P.skin], { material: 'paint' }),
    glow: color('Digits', P.magic, [P.magic, P.gold, P.moss, D.cyan, H.heal], { material: 'light' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true, label: 'Showing a score', noText: true },
    roll: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Count up by one', noText: true },
    bump: { frames: 4, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Score up', noText: true },
    frame: { frames: 1, fps: 8, loop: true, label: "Empty, for the game's own digits" },
  },
  sounds: {
    roll: [{ sound: 'xp-blip', preset: 'Tiny tick', frame: 1, volume: 0.5 }],
    bump: [{ sound: 'xp-blip', preset: 'Combo high', frame: 0, volume: 0.6 }],
  },
  versions: [
    { name: 'Score', params: {} },
    { name: 'Coins', params: { icon: 'coin', digits: 4, face: P.soil } },
    { name: 'Drum', params: { style: 'drum', glow: D.cyan, frame: P.steel } },
    { name: 'Big strip', params: { style: 'strip', size: 1, digits: 5, icon: 'none' } },
    { name: 'Hearts, no zeros', params: { icon: 'heart', zeros: false, face: H.bandit, glow: H.heal } },
  ],
  // The empty windows of the frame clip: where a game prints its digits, white, checked against the band.
  textArea(clip, p) {
    if (clip !== 'frame') return null;
    const out = plate(new Surface(...SIZE), p);
    return out.text.map((r) => ({ ...r, text: SKIN_TEXT.flat, edge: out.edge }));
  },

  render(g, { clip, frame, p }) {
    const { windows } = plate(g, p), metrics = fontMetrics(p.size, 'chunky');
    const lift = clip === 'bump' && frame === 1 ? -1 : 0;
    picture(g, p.icon, windows[0], lift);
    if (clip === 'frame') return;
    const now = sample(SAMPLE, p), next = sample(SAMPLE + 1, p), last = windows.length - 1;
    const colour = clip === 'bump' && frame === 0 ? '#ffffff' : p.glow;
    windows.forEach((win, i) => {
      if (clip === 'roll' && i === last && frame > 0) {
        // frames 1 to 4 the last digit on its way up, 5 the next digit at rest
        rollDigit(g, win, Number(now[i]), Number(next[i]), Math.min(1, frame / 5), metrics, { colour });
      } else if (now[i] !== null) windowDigit(g, win, now[i], metrics, { colour, dy: lift });
    });
  },
});
