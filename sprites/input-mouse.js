// Mouse (core-sprites-2, batch K15): a computer mouse seen from above, for "click", "scroll" and "move" prompts.
//   idle   the chosen action's button lit (the wheel for a scroll; nothing for a move)
//   show   left, right, middle: the button clicks down on frames 2 and 5, with short rays off its front corner
//          (both corners for the middle button); wheel: the ridges roll with up and down
//          arrows beside it (smaller heads beside the widest oval mouse, so they stay whole); move: the mouse slides 2 px left and right between left and right arrows (1 px for the widest mouse)
// The plastic is lit from the top right, as input-key's bevel is: a light rim along the top and right edge and a
// darker one along the bottom and left, on the body and on the lit button alike. A pressed button turns a shade
// darker across its whole face (the lit button's dark rim tone) and loses its light rim. The scroll's idle shows its up and down arrows, so it
// never looks like a middle click. The arrows are light, drawn after the outline. With the cable on, the mouse and
// its cable are centred together.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave } from '../engine/motion.js';
import { INK, tone } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { mouseBody, motionMarks } from '../engine/inputs.js';
import { clickRays } from '../engine/inputs-more.js';
import { mouseLight } from '../engine/mouse-light.js';

const P = PALETTE.thornwood;
// the cable is 8 px above a mouse up to 20 px tall, then 1 px shorter for each px more (6 px at 22), so mouse, cable
// and outline always keep inside the 1 px border and the whole size range still changes the mouse
const cableLen = (h) => Math.min(8, 28 - h);
const BEND = [0, 0, 1, 1, 0, -1, -1, 0];
const BUTTON = { left: 'left', right: 'right', middle: 'middle', wheel: 'middle', move: 'none' };
// show, clicks: the button is down on frames 2 and 5; wheel: the ridges step up four times, then back down
const CLICK = [false, false, true, false, false, true, false, false];
const ROLL = [0, 1, 2, 3, 2, 1, 0, -1];
// click rays after each click: they spring out on the click frame and drift off over the next two (none on 0 and 1)
const RAYS = [null, null, 0, 0.5, 1, 0, 0.5, 1];

// Where the mouse is this frame: shared by every drawing step.
function mouse(clip, frame, t, p) {
  // 16 to 22 px tall at every cable setting; the cable shortens instead (cableLen)
  const h = Math.round(lerp(16, 22, p.size)), w = Math.round(h * 0.75), cable = p.cable ? cableLen(h) : 0;
  const show = clip === 'show';
  // the move slides 2 px each way; the widest mouse (17 px) slides 1 px, so its arrows keep a 1 px gap from the outline
  const slide = w >= 17 ? 1 : 2;
  const cx = 16 + (show && p.action === 'move' ? Math.round(slide * wave(t)) : 0), cy = 16 + cable / 2;
  const clicks = show && ['left', 'right', 'middle'].includes(p.action);
  const down = clicks && CLICK[frame], rays = clicks ? RAYS[frame] : null;
  const wheel = show && p.action === 'wheel' ? ((ROLL[frame] % 3) + 3) % 3 - 1 : 0;   // -1, 0 or 1: the ridges a step up or down
  return { h, w, cx, cy, cable, down, wheel, rays };
}

// The scroll's up and down arrows beside the wheel: whole, symmetric heads at least 1 px clear of the outline and inside
// the 1 px border. They sit 4 px right of the body (as the small mice always had); a wide mouse leaves no room for a
// 5 px head there, so its arrows shrink to 3 px heads (as the move marks do beside a big mouse).
function wheelArrows(g, m, p, buttons, t) {
  const bw = p.shape === 'slim' ? Math.max(12, m.w - 2) : m.w;               // mouseBody's own width
  const edge = Math.round(m.cx - bw / 2) + bw;                                  // the outline's column, right of the body
  const fits = edge + 6 <= 30;                                                  // a 1 px gap, then a 5 px head ending by x 30
  const size = fits ? 3 : 2, x = Math.min(m.cx + Math.ceil(m.w / 2) + 5, 30 - (size - 1));
  motionMarks(g, x, buttons.wheel.y + 2, 'up-down', { reach: 6, size, colour: p.glow, t, box: [1, 1, 31, 31] });
}

export default defineSprite({
  id: 'input-mouse',
  name: 'Mouse',
  kind: 'Item',
  blurb: 'A computer mouse seen from above for click, scroll and move prompts, its button lit; change the action, shape, size, cable and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'shooter', 'puzzle', 'card-game'], view: 'none',
    words: ['mouse', 'click', 'left click', 'right click', 'scroll', 'wheel', 'move', 'prompt', 'control', 'input', 'tutorial', 'computer'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'show',
  params: {
    action: choice('Action', 'left', [
      { value: 'left', label: 'Left click' }, { value: 'right', label: 'Right click' }, { value: 'middle', label: 'Middle click' },
      { value: 'wheel', label: 'Scroll' }, { value: 'move', label: 'Move' },
    ]),
    shape: choice('Shape', 'oval', [{ value: 'oval', label: 'Oval' }, { value: 'slim', label: 'Slim' }]),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    cable: toggle('Cable', false),
    body: color('Plastic', P.steel, [P.steel, P.cream, P.slate, P.hero, P.crimson], { material: 'paint' }),
    glow: color('Lit button', P.gold, [P.gold, P.magic, P.moss, P.ember]),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true, noText: true },
    show: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Show it', noText: true },
  },
  versions: [
    { name: 'Left click', params: {} },
    { name: 'Right click', params: { action: 'right' } },
    { name: 'Scroll', params: { action: 'wheel', glow: P.magic } },
    { name: 'Move, corded', params: { action: 'move', cable: true } },
    { name: 'Dark slim', params: { shape: 'slim', body: P.slate } },
  ],

  render(g, { clip, frame, t, p }) {
    const m = mouse(clip, frame, t, p);
    // a pressed button is a shade darker over its whole face: the lit button's own dark rim tone, so pressing adds no
    // colour (the clip keeps within the spec's 10)
    const lit = m.down ? tone(p.glow, -1) : p.glow;
    const look = { w: m.w, h: m.h, shape: p.shape, body: p.body, lit, button: BUTTON[p.action], down: m.down, wheel: m.wheel };
    const { buttons } = mouseBody(g, m.cx, m.cy, look);
    // light from the top right: a light top and right rim and a dark bottom and left rim, on the plastic and the lit
    // button. The pressed button is lit with the unpressed colours, so its rim is the same dark tone as its face: one
    // flat dark face with no light rim and no extra rim colour.
    mouseLight(g, m.cx, m.cy, { ...look, lit: p.glow });
    // the S-bent cable from the middle of the front, drawn here so its length can follow the mouse's size
    const { left } = buttons, sx = left.x + left.w;
    for (let k = 0; k < m.cable; k++) g.dot(sx + BEND[k], left.y - 1 - k, p.body);
    g.outline(INK);
    if (clip !== 'show') {
      // the scroll's idle keeps its up and down arrows (still, stepped in), so it reads apart from a middle click
      if (p.action === 'wheel') wheelArrows(g, m, p, buttons, 0);
      return;
    }
    if (m.rays !== null) {
      // "click" rays off the front corner of the clicked button: both corners for the middle button
      const { left, right } = buttons, o = { len: 3, gap: 2, phase: m.rays, colour: p.glow, box: [1, 1, 31, 31] };
      if (p.action !== 'right') clickRays(g, left.x + 1, left.y + 1, { ...o, side: 'left' });
      if (p.action !== 'left') clickRays(g, right.x + right.w - 2, right.y + 1, { ...o, side: 'right' });
    } else if (p.action === 'wheel') {
      wheelArrows(g, m, p, buttons, t);
    } else if (p.action === 'move') {
      // left and right arrows either side of the mouse's resting place; smaller beside a big mouse
      const big = m.w >= 16;
      motionMarks(g, 16 + (m.w % 2) / 2, m.cy, 'left-right', { reach: big ? 14 : 15, size: big ? 2 : 3, colour: p.glow, t, box: [1, 1, 31, 31] });
    }
  },
});
