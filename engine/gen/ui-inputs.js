// Input-picture generators (family "ui"; docs/data-sprites.md 3.3 `key.cap`, `pad.button`, `stick`, `mouse`), made by
// migration batch M9: the library's keyboard keys, direction pad, face buttons, shoulder button, mouse and thumbstick as port generators
// (engine/gen/port-sprite.js). Each draws what its code sprite drew, pixel for pixel: the sprite file's own drawing,
// moved here, on the helpers of engine/inputs.js, engine/inputs-more.js, engine/input-rocker.js, engine/pad-buttons.js
// engine/inputs-shoulder.js and engine/mouse-light.js as ported to paint refs in engine/gen/ports/. Every argument is one of the old sprite's
// settings under its own name (but `light` and `glow`, which are call fields: `lights` and `lit`); `picture` is the clip. Pure: Node and browser.
import { share, word, flag, paint } from './args.js';
import { portGenerator } from './port-sprite.js';
import { pickP, toneP, INK_P as INK } from './port-surface.js';
import { lerp, wave, pulse, TAU } from '../motion.js';
import { keyCap, keyMark, dpadCross, mouseBody, motionMarks, stickTop } from './ports/inputs.js';
import { keyBevel, clickRays } from './ports/inputs-more.js';
import { padRocker } from './ports/input-rocker.js';
import { padCap, padDiamond } from './ports/pad-buttons.js';
import { mouseLight } from './ports/mouse-light.js';
import { shoulderButton } from './ports/inputs-shoulder.js';
import { PortSurface } from './port-surface.js';

const range = (about) => share({ default: 0.5, about });
const PRESS8 = [false, false, false, false, true, true, false, false];

// ---- key.cap@1 (tests/fixtures/code-sprites/input-key.js) -------------------------------------------------------------------------------

const TAP = ['up', 'up', 'up', 'up', 'down', 'down', 'up', 'up'];
const KEY_STATES = { up: { frames: 1 }, down: { frames: 1 }, tap: { frames: 8 } };
const keyArgs = {
  size: range('Small to big'), corner: range('Square to round corners'), depth: range('Flat to deep side'),
  lights: flag({ default: true, about: 'The top lights up in the lit colour when pressed (the sprite\'s Light up)' }),
  body: paint({ about: 'The key top' }), frame: paint({ about: 'The key side' }), lit: paint({ about: 'The light' }),
};

function oneKey(g, clip, frame, p) {
  const w = 20 + 2 * Math.round(3 * p.size), h = w - 2, depth = Math.round(lerp(1, 3, p.depth));
  const tap = clip === 'tap' ? TAP[frame] : null;
  const down = clip === 'down' || tap === 'down';
  const top = down && p.lights ? p.lit : p.body;
  const x = 16 - w / 2, y = 16 - h / 2;
  const cap = keyCap(g, x, y, w, h, { top, side: p.frame, corner: p.corner, depth, down });
  return { ...cap, colour: top, depth, corner: p.corner };
}
const markAt = (top) => [top.x + Math.floor((top.w - 1) / 2), top.y + Math.round(top.h * 0.6)];

/** key.cap@1: one square keyboard key with an arrow picture, sinking and lighting up when tapped (port of tests/fixtures/code-sprites/input-key.js on engine/inputs.js keyCap, keyMark and engine/inputs-more.js keyBevel). */
export const keyCapPort = portGenerator({
  id: 'key.cap', family: 'ui', units: 20, size: [32, 32], origin: [16, 16], states: KEY_STATES,
  about: 'A square keyboard key, a pale top over a darker side, with an arrow picture or none, that sinks and lights up when tapped.',
  args: { mark: word(['none', 'up', 'down', 'left', 'right'], { default: 'none', about: 'The arrow picture' }), ...keyArgs },
  draw(g, { clip, frame, p }) {
    const k = oneKey(g, clip, frame, p);
    keyBevel(g, k.top, { colour: k.colour, corner: k.corner });
    const [mx, my] = markAt(k.top);
    keyMark(g, p.mark, mx, my, 7, pickP(k.colour, '#ffffff', INK));
    g.outline(INK);
  },
  measure(clip, p) {
    const { top, text } = oneKey(new PortSurface(32, 32), clip, 0, p);
    if (p.mark === 'none') return { textArea: { ...text, text: INK } };
    const [, my] = markAt(top), above = my - Math.floor(7 / 2) - 1;
    return { textArea: { x: text.x, y: text.y, w: text.w, h: Math.max(1, above - text.y), text: INK } };
  },
});

// ---- key.wide@1 (tests/fixtures/code-sprites/input-key-wide.js) -------------------------------------------------------------------------

const WIDE = [64, 32], KEY_H = 22, WIDE_MARK = 9, LENGTH = { wide: 38, long: 54 };
const BACK_TAG = [
  [-4, 0], [-3, -1], [-3, 1], [-2, -2], [-2, 2],
  ...[-1, 0, 1, 2, 3, 4].flatMap((i) => [[i, -3], [i, 3]]), [4, -2], [4, -1], [4, 0], [4, 1], [4, 2],
  [0, -1], [2, -1], [1, 0], [0, 1], [2, 1],
];
function wideKey(g, clip, frame, p) {
  const w = LENGTH[p.shape] + 2 * Math.round(3 * p.size), depth = Math.round(lerp(1, 3, p.depth));
  const tap = clip === 'tap' ? TAP[frame] : null;
  const down = clip === 'down' || tap === 'down';
  const top = down && p.lights ? p.lit : p.body;
  const x = WIDE[0] / 2 - w / 2, y = WIDE[1] / 2 - KEY_H / 2;
  const cap = keyCap(g, x, y, w, KEY_H, { top, side: p.frame, corner: p.corner, depth, down });
  return { ...cap, colour: top, corner: p.corner, mark: p.shape === 'wide' ? p.mark : 'none' };
}
function wideMark(g, kind, cx, cy, colour) {
  if (kind !== 'back') return keyMark(g, kind, cx, cy, WIDE_MARK, colour);
  for (const [i, j] of BACK_TAG) g.dot(cx + i, cy + j, colour);
  return g;
}

/** key.wide@1: a wide keyboard key (return, back, tab or shift picture) or a space bar, sinking and lighting up when tapped (port of tests/fixtures/code-sprites/input-key-wide.js on engine/inputs.js keyCap and keyMark). */
export const keyWidePort = portGenerator({
  id: 'key.wide', family: 'ui', units: 40, size: WIDE, origin: [32, 16], states: KEY_STATES,
  about: 'A wide keyboard key with a return, back, tab or shift picture, or a long space bar, that sinks and lights up when tapped.',
  args: {
    shape: word(['wide', 'long'], { default: 'wide', about: 'A wide key or a long space bar' }),
    mark: word(['none', 'enter', 'back', 'tab', 'shift'], { default: 'enter', about: 'The picture on a wide key' }),
    ...keyArgs,
  },
  draw(g, { clip, frame, p }) {
    const k = wideKey(g, clip, frame, p);
    keyBevel(g, k.top, { colour: k.colour, corner: k.corner });
    const [mx, my] = markAt(k.top);
    wideMark(g, k.mark, mx, my, pickP(k.colour, '#ffffff', INK));
    g.outline(INK);
  },
  measure(clip, p) {
    const { top, text, mark } = wideKey(new PortSurface(...WIDE), clip, 0, p);
    if (mark === 'none') return { textArea: { ...text, text: INK } };
    const [, my] = markAt(top), above = my - Math.floor(WIDE_MARK / 2) - 1;
    return { textArea: { x: text.x, y: text.y, w: text.w, h: Math.max(1, above - text.y), text: INK } };
  },
});

// ---- pad.dpad@1 (tests/fixtures/code-sprites/input-dpad.js) -----------------------------------------------------------------------------

const TURN = ['up', 'right', 'down', 'left'];
const LIT = {
  up: ['up'], down: ['down'], left: ['left'], right: ['right'], 'up-down': ['up', 'down'], 'left-right': ['left', 'right'],
  all: ['up', 'right', 'down', 'left'], none: [],
};
const PRESS_STATES = { idle: { frames: 1 }, press: { frames: 8 } };

/** pad.dpad@1: a game controller's direction pad (a cross, a rocker disc or a round pad), the arms to press lit and pressing (port of tests/fixtures/code-sprites/input-dpad.js on engine/inputs.js dpadCross and engine/input-rocker.js padRocker). */
export const padDpadPort = portGenerator({
  id: 'pad.dpad', family: 'ui', units: 200, size: [32, 32], origin: [16, 16], states: PRESS_STATES,
  about: 'A controller\'s direction pad (cross, rocker or round), the arms to press lit and pressing down in turn.',
  args: {
    style: word(['cross', 'rocker', 'round'], { default: 'cross', about: 'The pad\'s shape' }),
    direction: word(Object.keys(LIT), { default: 'up', about: 'Which arms are lit' }),
    size: range('Small to big'), depth: range('Flat to deep side'),
    body: paint({ about: 'The pad' }), lit: paint({ about: 'The lit arms' }),
  },
  draw(g, { clip, frame, p }) {
    const depth = Math.round(lerp(1, 3, p.depth)), E = lerp(10.5, 13.5, p.size);
    let lit = LIT[p.direction], down = clip === 'press' && PRESS8[frame];
    if (clip === 'press' && p.direction === 'all') { lit = [TURN[frame >> 1]]; down = true; }
    if (p.style === 'rocker') padRocker(g, 16, 16, { reach: E, body: p.body, glow: p.lit, lit, depth, down });
    else dpadCross(g, 16, 16, { arm: E - 3.5, thick: 7, style: p.style, body: p.body, glow: p.lit, lit, depth, down });
    g.outline(INK);
  },
});

// ---- pad.face@1 (tests/fixtures/code-sprites/input-face-buttons.js) ---------------------------------------------------------------------

const PLACES = ['top', 'right', 'bottom', 'left'];
function faceButtons(g, clip, frame, p) {
  const depth = Math.round(lerp(1, 3, p.depth)), down = clip === 'press' && PRESS8[frame];
  const side = toneP(p.body, -0.5);
  if (p.style === 'single') {
    const r = Math.round(lerp(9, 11, p.size));
    const { top } = padCap(g, 16, 16, r, { top: p.lit, side, depth, down });
    return [top];
  }
  const r = lerp(4, 5.5, Math.round(p.size * 3) / 3);
  const { tops } = padDiamond(g, 16, 16, { r, gap: 1, body: p.body, side, glow: p.lit, lit: p.button, depth, down });
  return p.button === 'all' ? PLACES.map((k) => tops[k]) : [tops[p.button]];
}

/** pad.face@1: a game controller's four face buttons in a diamond or one big button, the one to press lit and pressing (port of tests/fixtures/code-sprites/input-face-buttons.js on engine/pad-buttons.js padCap and padDiamond). */
export const padFacePort = portGenerator({
  id: 'pad.face', family: 'ui', units: 40, size: [32, 32], origin: [16, 16], states: PRESS_STATES,
  about: 'A controller\'s four face buttons in a diamond, or one big button, the one to press lit and pressing down.',
  args: {
    style: word(['cluster', 'single'], { default: 'cluster', about: 'Four buttons or one' }),
    button: word([...PLACES, 'all'], { default: 'bottom', about: 'Which button is lit' }),
    size: range('Small to big'), depth: range('Flat to deep side'),
    body: paint({ about: 'The buttons' }), lit: paint({ about: 'The lit button' }),
  },
  draw(g, { clip, frame, p }) {
    faceButtons(g, clip, frame, p);
    g.outline(INK);
  },
  measure(clip, p) {
    const areas = faceButtons(new PortSurface(32, 32), clip, 0, p).map(({ x, y, w, h }) => ({ x, y, w, h, text: INK }));
    return { textArea: areas.length === 1 ? areas[0] : areas };
  },
});

// ---- mouse@1 (tests/fixtures/code-sprites/input-mouse.js) -------------------------------------------------------------------------------

const cableLen = (h) => Math.min(8, 28 - h);
const BEND = [0, 0, 1, 1, 0, -1, -1, 0];
const BUTTON = { left: 'left', right: 'right', middle: 'middle', wheel: 'middle', move: 'none' };
const CLICK = [false, false, true, false, false, true, false, false];
const ROLL = [0, 1, 2, 3, 2, 1, 0, -1];
const RAYS = [null, null, 0, 0.5, 1, 0, 0.5, 1];
function mouseAt(clip, frame, t, p) {
  const h = Math.round(lerp(16, 22, p.size)), w = Math.round(h * 0.75), cable = p.cable ? cableLen(h) : 0;
  const show = clip === 'show';
  const slide = w >= 17 ? 1 : 2;
  const cx = 16 + (show && p.action === 'move' ? Math.round(slide * wave(t)) : 0), cy = 16 + cable / 2;
  const clicks = show && ['left', 'right', 'middle'].includes(p.action);
  const down = clicks && CLICK[frame], rays = clicks ? RAYS[frame] : null;
  const wheel = show && p.action === 'wheel' ? ((ROLL[frame] % 3) + 3) % 3 - 1 : 0;
  return { h, w, cx, cy, cable, down, wheel, rays };
}
function wheelArrows(g, m, p, buttons, t) {
  const bw = p.shape === 'slim' ? Math.max(12, m.w - 2) : m.w;
  const edge = Math.round(m.cx - bw / 2) + bw;
  const fits = edge + 6 <= 30;
  const size = fits ? 3 : 2, x = Math.min(m.cx + Math.ceil(m.w / 2) + 5, 30 - (size - 1));
  motionMarks(g, x, buttons.wheel.y + 2, 'up-down', { reach: 6, size, colour: p.lit, t, box: [1, 1, 31, 31] });
}

/** mouse@1: a computer mouse seen from above showing a left, right or middle click, a scroll or a move (port of tests/fixtures/code-sprites/input-mouse.js on engine/inputs.js mouseBody and motionMarks, engine/mouse-light.js and engine/inputs-more.js clickRays). */
export const mousePort = portGenerator({
  id: 'mouse', family: 'ui', units: 25, size: [32, 32], origin: [16, 16], states: { idle: { frames: 1 }, show: { frames: 8 } },
  about: 'A computer mouse seen from above, its lit button clicking with rays, its wheel scrolling or the mouse sliding side to side.',
  args: {
    action: word(['left', 'right', 'middle', 'wheel', 'move'], { default: 'left', about: 'What it shows' }),
    shape: word(['oval', 'slim'], { default: 'oval', about: 'The body' }),
    size: range('Small to big'),
    cable: flag({ default: false, about: 'A short cable from the front' }),
    body: paint({ about: 'The plastic' }), lit: paint({ about: 'The lit button and the marks' }),
  },
  draw(g, { clip, frame, t, p }) {
    const m = mouseAt(clip, frame, t, p);
    const lit = m.down ? toneP(p.lit, -1) : p.lit;
    const look = { w: m.w, h: m.h, shape: p.shape, body: p.body, lit, button: BUTTON[p.action], down: m.down, wheel: m.wheel };
    const { buttons } = mouseBody(g, m.cx, m.cy, look);
    mouseLight(g, m.cx, m.cy, { ...look, lit: p.lit });
    const { left } = buttons, sx = left.x + left.w;
    for (let k = 0; k < m.cable; k++) g.dot(sx + BEND[k], left.y - 1 - k, p.body);
    g.outline(INK);
    if (clip !== 'show') {
      if (p.action === 'wheel') wheelArrows(g, m, p, buttons, 0);
      return;
    }
    if (m.rays !== null) {
      const { left: l, right } = buttons, o = { len: 3, gap: 2, phase: m.rays, colour: p.lit, box: [1, 1, 31, 31] };
      if (p.action !== 'right') clickRays(g, l.x + 1, l.y + 1, { ...o, side: 'left' });
      if (p.action !== 'left') clickRays(g, right.x + right.w - 2, right.y + 1, { ...o, side: 'right' });
    } else if (p.action === 'wheel') {
      wheelArrows(g, m, p, buttons, t);
    } else if (p.action === 'move') {
      const big = m.w >= 16;
      motionMarks(g, 16 + (m.w % 2) / 2, m.cy, 'left-right', { reach: big ? 14 : 15, size: big ? 2 : 3, colour: p.lit, t, box: [1, 1, 31, 31] });
    }
  },
});

// ---- stick@1 (tests/fixtures/code-sprites/input-stick.js) -------------------------------------------------------------------------------

const STICK_RAYS = [null, null, null, null, 0, 0.5, 1, null];
const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const START = TAU / 8;
const BOX = [1, 1, 31, 31];
function stickAt(clip, t, frame, p) {
  const r = Math.round(lerp(10, 12, p.size)), push = Math.round(lerp(2, 4, p.reach)), move = clip === 'move';
  let tilt = [0, 0], down = false;
  if (DIR[p.motion]) {
    const k = move ? pulse(t) : 1;
    tilt = DIR[p.motion].map((v) => Math.round(v * push * k));
  } else if ((p.motion === 'any' && !move) || (move && (p.motion === 'any' || p.motion === 'spin'))) {
    const a = START + (move ? TAU * t : 0);
    tilt = [Math.round(Math.sin(a) * push), Math.round(-Math.cos(a) * push)];
  } else if (p.motion === 'press') down = move && PRESS8[frame];
  return { r, tilt, down };
}
function stickArrow(g, a, r, t, colour) {
  const c = a === 'left' || a === 'up' ? 15 : 16, cx = DIR[a][1] ? 16 : c, cy = DIR[a][0] ? 16 : c;
  motionMarks(g, cx, cy, a, { reach: Math.min(r + 3, 14), size: 2, colour, t, box: BOX });
}

/** stick@1: a controller's thumbstick seen from above, pushed one way, any way, round or clicked in, with arrows (port of tests/fixtures/code-sprites/input-stick.js on engine/inputs.js stickTop and motionMarks and engine/inputs-more.js clickRays). */
export const stickPort = portGenerator({
  id: 'stick', family: 'ui', units: 50, size: [32, 32], origin: [16, 16], states: { idle: { frames: 1 }, move: { frames: 8 } },
  about: 'A controller\'s thumbstick seen from above in its ring, pushed one way, any way, round or clicked in, with arrows showing how.',
  args: {
    motion: word(['up', 'down', 'left', 'right', 'any', 'press', 'spin'], { default: 'any', about: 'How it moves' }),
    style: word(['domed', 'ridged', 'flat'], { default: 'domed', about: 'The cap' }),
    size: range('Small to big'), reach: range('How far it is pushed'),
    body: paint({ about: 'The stick' }), accent: paint({ about: 'The base ring' }), lit: paint({ about: 'The arrows' }),
  },
  draw(g, { clip, t, frame, p }) {
    const s = stickAt(clip, t, frame, p);
    const { cap } = stickTop(g, 16, 16, { r: s.r, style: p.style, body: p.body, ring: p.accent, tilt: s.tilt, down: s.down });
    const well = s.r - 2;
    g.arc(cap.cx, cap.cy, cap.r + 0.5, 0, TAU, 1, INK, { clip: (px, py) => (px + 0.5 - 16) ** 2 + (py + 0.5 - 16) ** 2 < well * well });
    g.outline(INK);
    if (clip !== 'move') return;
    if (DIR[p.motion]) stickArrow(g, p.motion, s.r, t, p.lit);
    else if (p.motion === 'any') for (const a of ['up', 'right', 'down', 'left']) stickArrow(g, a, s.r, t, p.lit);
    else if (p.motion === 'spin') motionMarks(g, 16, 16, 'spin', { reach: Math.min(s.r + 4, 16), size: 2, colour: p.lit, t, box: BOX });
    else if (STICK_RAYS[frame] !== null) {
      const d = Math.round((s.r + 1) * Math.SQRT1_2), o = { len: 3, gap: 2, phase: STICK_RAYS[frame], colour: p.lit, box: BOX };
      clickRays(g, 15 - d, 15 - d, { ...o, side: 'left' });
      clickRays(g, 16 + d, 15 - d, { ...o, side: 'right' });
    }
  },
});

// ---- pad.shoulder@1 (tests/fixtures/code-sprites/input-shoulder.js) ---------------------------------------------------------------------

const STUB = 3;

/** pad.shoulder@1: a controller's shoulder button, a long bumper from the front or a curved trigger from the side, left or right, pressing down (port of tests/fixtures/code-sprites/input-shoulder.js on engine/inputs-shoulder.js shoulderButton). */
export const padShoulderPort = portGenerator({
  id: 'pad.shoulder', family: 'ui', units: 50, size: [32, 32], origin: [16, 16], states: PRESS_STATES,
  about: 'A controller\'s shoulder button: a long bumper seen from the front or a curved trigger from the side, left or right, that presses down.',
  args: {
    button: word(['bumper', 'trigger'], { default: 'bumper', about: 'A bumper or a trigger' }),
    side: word(['left', 'right'], { default: 'left', about: 'Which side (the right is the left mirrored)' }),
    style: word(['rounded', 'angled'], { default: 'rounded', about: 'A bumper\'s outer end' }),
    size: range('Small to big'),
    lit: flag({ default: true, about: 'The face in the lamp colour' }),
    body: paint({ about: 'The plastic' }), lamp: paint({ about: 'The lit face\'s colour (the sprite\'s Lit colour)' }),
    face: paint({ about: 'The face\'s tone: the face colour, or a shade darker when it is pale (the redraw works it out)' }),
    shine: paint({ about: 'The face\'s light top edge: a tone lighter, or the face colour itself when it is pale' }),
  },
  draw(g, { clip, frame, p }) {
    const trigger = p.button === 'trigger';
    const w = Math.round(trigger ? lerp(12, 16, p.size) : lerp(24, 28, p.size));
    const h = Math.round(trigger ? lerp(19, 25, p.size) : lerp(8, 10, p.size));
    const x = 16 - Math.round(w / 2), y = 16 - Math.round(h / 2);
    shoulderButton(g, x, y, w, h, {
      kind: p.button, side: p.side, style: p.style, body: p.body, glow: p.lamp, lit: p.lit, face: p.face, shine: p.shine,
      down: clip === 'press' && PRESS8[frame],
      base: 'fixed', back: 'curved', end: 'stepped', rim: true, tidy: true, pivot: trigger ? STUB : 0, depth: 3, travel: 2,
    });
    g.outline(INK);
  },
});
