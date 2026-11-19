// Thumbstick (core-sprites-2, batch K16): a game controller's thumbstick seen from above, showing which way to push
// it, to click it in or to turn it round.
//   idle   the cap tilted the chosen way (any: up and to the right, where its circle starts); press and spin centred
//   move   up, down, left, right: the cap tilts out and back with an arrow on that side; any: the cap circles once
//          with arrows on all four sides; spin: the cap circles once inside a dotted ring with an arrow running
//          round it; press: the cap presses in on frames 4 and 5 and click rays spring off the ring's upper corners
// The arrows and rays are light, drawn after the outline, in the gap between the ring's outline and the frame's
// border. The left and up arrows are placed from the pixel left of and above the middle, so each arrow mirrors its
// opposite exactly.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, pulse, TAU } from '../engine/motion.js';
import { INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { stickTop, motionMarks } from '../engine/inputs.js';
import { clickRays } from '../engine/inputs-more.js';

const P = PALETTE.thornwood;
const PRESS = [false, false, false, false, true, true, false, false];
// click rays after the press: out on frame 4, drifting off over 5 and 6
const RAYS = [null, null, null, null, 0, 0.5, 1, null];
const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const START = TAU / 8;                    // any and spin circle from up and to the right
const BOX = [1, 1, 31, 31];

// Where the cap is this frame: shared by every drawing step.
function stick(clip, t, frame, p) {
  const r = Math.round(lerp(10, 12, p.size)), push = Math.round(lerp(2, 4, p.reach)), move = clip === 'move';
  let tilt = [0, 0], down = false;
  if (DIR[p.motion]) {
    const k = move ? pulse(t) : 1;
    tilt = DIR[p.motion].map((v) => Math.round(v * push * k));
  } else if ((p.motion === 'any' && !move) || (move && (p.motion === 'any' || p.motion === 'spin'))) {
    const a = START + (move ? TAU * t : 0);
    tilt = [Math.round(Math.sin(a) * push), Math.round(-Math.cos(a) * push)];
  } else if (p.motion === 'press') down = move && PRESS[frame];
  return { r, tilt, down };
}

// One arrow head beside the ring on side `a`, stepping out and back with t.
function arrow(g, a, r, t, colour) {
  const c = a === 'left' || a === 'up' ? 15 : 16, cx = DIR[a][1] ? 16 : c, cy = DIR[a][0] ? 16 : c;
  motionMarks(g, cx, cy, a, { reach: Math.min(r + 3, 14), size: 2, colour, t, box: BOX });
}

export default defineSprite({
  id: 'input-stick',
  name: 'Thumbstick',
  kind: 'Item',
  blurb: 'A game controller\'s thumbstick seen from above, its cap pushed, clicked in or turned round with arrows to show how; change the motion, cap style, size, push and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'shooter', 'platformer', 'racing'], view: 'none',
    words: ['thumbstick', 'joystick', 'analog stick', 'stick', 'gamepad', 'controller', 'move', 'push', 'rotate', 'prompt', 'input', 'tutorial'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'move',
  params: {
    motion: choice('Motion', 'any', [
      { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
      { value: 'any', label: 'Any way' }, { value: 'press', label: 'Click in' }, { value: 'spin', label: 'Turn round' },
    ]),
    style: choice('Style', 'domed', [{ value: 'domed', label: 'Domed' }, { value: 'ridged', label: 'Ridged' }, { value: 'flat', label: 'Flat' }]),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    reach: range('Push', 0.5, { lo: 'Small', hi: 'Far', when: { motion: ['up', 'down', 'left', 'right', 'any', 'spin'] } }),
    body: color('Stick', P.slate, [P.slate, P.cavern, P.steel, P.soil, PALETTE.derelict.plate], { material: 'paint' }),
    accent: color('Base ring', P.stone, [P.stone, P.cream, P.wood, '#6b7280']),
    glow: color('Arrows', P.gold, [P.gold, P.magic, P.moss, P.crimson]),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true, noText: true },
    move: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Move it', noText: true },
  },
  versions: [
    { name: 'Any way', params: {} },
    { name: 'Push up', params: { motion: 'up', glow: P.magic } },
    { name: 'Click in', params: { motion: 'press', style: 'ridged' } },
    { name: 'Spin', params: { motion: 'spin', reach: 1 } },
    { name: 'Pale flat stick', params: { style: 'flat', body: P.steel, accent: P.wood } },
  ],

  render(g, { clip, t, frame, p }) {
    const s = stick(clip, t, frame, p);
    const { cap } = stickTop(g, 16, 16, { r: s.r, style: p.style, body: p.body, ring: p.accent, tilt: s.tilt, down: s.down });
    // an ink gap round the cap, inside the well only, so the cap stands off the well whatever the two colours
    const well = s.r - 2;
    g.arc(cap.cx, cap.cy, cap.r + 0.5, 0, TAU, 1, INK, { clip: (px, py) => (px + 0.5 - 16) ** 2 + (py + 0.5 - 16) ** 2 < well * well });
    g.outline(INK);
    if (clip !== 'move') return;
    if (DIR[p.motion]) arrow(g, p.motion, s.r, t, p.glow);
    else if (p.motion === 'any') for (const a of ['up', 'right', 'down', 'left']) arrow(g, a, s.r, t, p.glow);
    else if (p.motion === 'spin') motionMarks(g, 16, 16, 'spin', { reach: Math.min(s.r + 4, 16), size: 2, colour: p.glow, t, box: BOX });
    else if (RAYS[frame] !== null) {
      // click rays off the ring's two upper corners
      const d = Math.round((s.r + 1) * Math.SQRT1_2), o = { len: 3, gap: 2, phase: RAYS[frame], colour: p.glow, box: BOX };
      clickRays(g, 15 - d, 15 - d, { ...o, side: 'left' });
      clickRays(g, 16 + d, 15 - d, { ...o, side: 'right' });
    }
  },
});
