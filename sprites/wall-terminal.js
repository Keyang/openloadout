// Terminal: a computer of the Derelict Station to walk up to and use, seen from the south. It stands at the foot of
// a wall's face. Three builds: a console (a monitor on a cabinet), a kiosk (a slim pillar with an upright screen) and
// a wall panel (a wide plate on the wall with a cable duct down to the floor). The screen is the only bright thing
// on it, and it shows text that scrolls, a bar graph, a floor map or a skull (screenIn in engine/bulkhead.js). Its
// body is boxes seen from the south (drawCasing) in the tones of one colour (machineTones), both in that module too.
//   idle       waiting: the picture moves (text scrolls over a prompt with a blinking cursor, bars rise and fall, a
//              marker blinks on the map, the skull flashes) and a refresh line runs down the screen; the Flicker
//              control makes it glitch on some frames. The side lights are dim
//   activate   the screen flashes white (the click), shows a tick that blinks twice, and the side lights come on;
//              the last frame is the accepted screen, which a game holds
//   off        dark: no picture, no lights, a faint reflection on the glass
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { tone, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { drawGrate } from '../engine/plating.js';
import { lamp } from '../engine/fx.js';
import { screenIn, machineTones, drawCasing } from '../engine/bulkhead.js';

const D = PALETTE.derelict;
const W = 32, H = 48, CX = 16, GROUND = 45;      // the lowest body row; its outline lands on the pivot row
const BODIES = [D.hull, D.panel, D.steel, D.deck, D.nebula, D.membrane];
const GLASS = mix(D.void, D.plate, 0.25);        // an unlit screen

// Where everything is, by build. box: [x, y, w, h]. screen: the glass. lamps: the side lights. shelf: the keyboard.
const BUILDS = {
  console: { screen: [7, 14, 18, 11], lamps: [[6, 27], [24, 27]], trim: [10, 27, 12, 2], shelf: [4, 30, 24] },
  kiosk: { screen: [11, 14, 10, 12], lamps: [[11, 29], [19, 29]], trim: [14, 29, 4, 2], shelf: [6, 33, 20] },
  'wall panel': { screen: [5, 14, 16, 11], lamps: [[24, 15], [24, 19]], trim: [5, 28, 16, 2], shelf: [3, 33, 26] },
};
// idle: the frames on which the screen glitches, and how much Flicker each needs
const GLITCH = { 2: 0.15, 6: 0.5, 5: 0.8 };
// activate, frame by frame. flash: the whole screen is white. tick: 'hot' white on the Screen colour, 'on' the
// Screen colour on dark glass. lights: the side lights (0.5 dim, 1 on, 2 flaring)
const ACT = [
  { lights: 0.5 },
  { flash: true, lights: 2 },                  // the click
  { tick: 'hot', lights: 2 },
  { tick: 'on', lights: 1 },
  { tick: 'hot', lights: 1 },
  { tick: 'on', lights: 1 },
  { tick: 'on', lights: 2 },
  { tick: 'on', lights: 1 },                   // accepted
];

// The glass in its dark bezel.
function bezel(g, T, [x, y, w, h]) {
  g.rect(x - 2, y - 2, w + 4, h + 4, T.dark);
  g.rect(x - 2, y + h + 1, w + 4, 1, T.darkLit);
  g.rect(x, y, w, h, GLASS);
}
// The keyboard shelf: its top face with rows of keys, and its front edge.
function shelf(g, T, p, [x, y, w]) {
  g.rect(x, y, w, 3, T.soft); g.rect(x, y, w, 1, T.lit);
  for (let i = 2; i < w - 3; i += 3) { g.rect(x + i, y + 1, 2, 1, T.dark); if ((i / 3) % 4 === 1) g.rect(x + i, y + 1, 2, 1, p.accent); }
  g.rect(x, y + 3, w, 2, T.base); g.rect(x, y + 4, w, 1, T.seam);
}

function body(g, p, T, B) {
  if (p.style === 'console') {
    // a monitor leaning on a cabinet that stands on a plinth
    drawCasing(g, T, 8, 31, 16, 12, 0);
    drawGrate(g, 11, 33, 10, 8, { frame: T.seam, bar: T.base, slot: T.dark, lit: T.soft, pitch: 2 });
    drawCasing(g, T, 6, 41, 20, 5, 1);
    drawCasing(g, T, 4, 10, 24, 20, 2);
  } else if (p.style === 'kiosk') {
    // a pillar, wider at the foot, with a hood over the screen
    drawCasing(g, T, 9, 12, 14, 30, 0);
    drawCasing(g, T, 8, 9, 16, 4, 2);
    drawCasing(g, T, 6, 40, 20, 6, 2);
    g.rect(12, 36, 8, 1, T.seam); g.rect(12, 37, 8, 1, T.soft);                    // a card slot
  } else {
    // a plate on the wall, and a cable duct from it down to a box on the floor
    drawCasing(g, T, 14, 31, 4, 12, 0);
    g.rect(14, 37, 4, 1, T.seam);
    drawCasing(g, T, 10, 41, 12, 5, 1);
    drawCasing(g, T, 2, 11, 28, 21, 1);
    g.rect(23, 13, 5, 11, T.dark); g.rect(23, 24, 5, 1, T.darkLit);                // the strip the side lights sit in
    for (const y of [26, 28]) g.rect(24, y, 3, 1, T.seam);                         // two buttons under them
  }
  bezel(g, T, B.screen);
  g.rect(...B.trim, p.accent);
  if (p.keys) shelf(g, T, p, B.shelf);
}

// What the lit screen shows this frame. dim: the picture is in the dark tone of the Screen colour; shove: it has
// slipped that many px sideways (a glitch). scan: the row of the refresh line, counted from the top of the glass.
// beat: 0 or 1, the half of the loop (a cursor blinks under text, a skull flashes white). Text leaves the two rows at
// the foot of the glass to a prompt and its cursor, so no line scrolls behind them; the other pictures have the whole glass.
function picture(g, p, [x, y, w, h], t, { dim = false, shove = 0, scan = -1, beat = 0 } = {}) {
  const text = p.shape === 'text', top = text ? h - 4 : h - 2;
  const ink = dim ? tone(p.glow, -0.9) : p.shape === 'skull' && beat ? '#ffffff' : p.glow;
  if (scan >= 0 && scan < h) g.rect(x, y + scan, w, 1, mix(GLASS, p.glow, 0.3));
  g.fill(x, y, x + w, y + h, screenIn(p.shape, x + 1 + shove, y + 1, w - 2, top, t), ink);
  if (!text) return;
  g.rect(x + 1, y + h - 2, 3, 1, ink);
  if (!beat) g.rect(x + 5, y + h - 3, 2, 2, '#ffffff');
}

export default defineSprite({
  id: 'wall-terminal',
  name: 'Terminal',
  kind: 'Item',
  blurb: 'A station computer to walk up to and use: its screen scrolls, flashes and shows a tick when it is used, or stands dark. Make it a console, a kiosk or a wall panel, choose what the screen shows, and change the keyboard, lights and colours.',
  meta: {
    type: 'prop',
    role: 'world/prop',
    themes: ['sci-fi', 'space'],
    gameTypes: ['roguelike-action', 'shooter'],
    view: 'top-down',
    words: ['terminal', 'computer', 'console', 'screen', 'monitor', 'kiosk', 'keyboard', 'hack', 'activate', 'use', 'interact', 'switch', 'data'],
    license: 'draft',
  },
  size: [W, H],
  pivot: [CX, GROUND + 1],
  params: {
    style: choice('Style', 'console', [{ value: 'console', label: 'Console' }, { value: 'kiosk', label: 'Kiosk' }, { value: 'wall panel', label: 'Wall panel' }]),
    shape: choice('Screen shows', 'text', [{ value: 'text', label: 'Text' }, { value: 'graph', label: 'Graph' }, { value: 'map', label: 'Map' }, { value: 'skull', label: 'Skull' }]),
    keys: toggle('Keyboard', true),
    body: color('Body', D.hull, BODIES),
    accent: color('Trim', D.teal, swatches('derelict', 'accent', { lead: 'teal' })),
    glow: color('Screen', D.cyan, swatches('derelict', 'glow')),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    activate: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    off: { frames: 1, fps: 8, loop: true },
  },
  sounds: {
    activate: [{ sound: 'tech-click', preset: 'Confirm', frame: 1, volume: 0.6 }],
  },

  render(g, { clip, frame, t, p }) {
    const T = machineTones(p.body), B = BUILDS[p.style], [x, y, w, h] = B.screen;
    body(g, p, T, B);
    g.outline(INK);

    // everything that is light goes on after the outline
    const a = clip === 'activate' ? ACT[frame] ?? ACT[7] : null;
    const lights = clip === 'off' ? 0 : a ? a.lights : 0.5;
    for (const [lx, ly] of B.lamps) lamp(g, lx, ly, 2, 2, p.accent, lights);
    if (clip === 'off') {
      const sheen = mix(GLASS, T.soft, 0.3);
      for (let i = 0; i < 4; i++) g.rect(x + w - 6 + i, y + 4 - i, 2, 1, sheen);                 // the room, faintly, on dark glass
      return;
    }
    if (clip === 'idle' || (a && !a.flash && !a.tick)) {
      const glitch = clip === 'idle' && p.flicker >= (GLITCH[frame] ?? 9);
      picture(g, p, B.screen, clip === 'idle' ? t : 0, { dim: glitch, shove: glitch ? (frame % 2 ? -1 : 1) : 0, scan: clip === 'idle' ? Math.floor((t * h + 2) % h) : -1, beat: (frame >> 2) % 2 });
      return;
    }
    if (a.flash) {
      // white-hot glass with a halo of the Screen colour round it
      g.rect(x - 1, y - 1, w + 2, h + 2, p.glow);
      g.rect(x, y, w, h, '#ffffff');
      return;
    }
    const hot = a.tick === 'hot';
    if (hot) g.rect(x, y, w, h, p.glow);
    g.fill(x, y, x + w, y + h, screenIn('tick', x + 1, y + 1, w - 2, h - 2), hot ? '#ffffff' : p.glow);
  },
});
