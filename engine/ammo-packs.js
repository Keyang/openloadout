// Ammo packs: ammunition drawn face-on at pickup size with readable silhouettes (added with core-sprites-1,
// batch K02, fix round 1: the ammo pack). It draws the same three kinds as drawAmmo in engine/munitions.js
// (box, clip, shells), with two of them redrawn so they read at 1x: the box has its lid thrown back, standing
// up behind the rounds in a darker value, and the clip is a magazine (a narrow body that curves forward, a base
// plate that steps out at the front, and a brass round lying proud of the feed lips with its tip pointing
// forward). Shells are drawAmmo's. Nothing here turns: to tilt a pack, draw it on a scratch layer and slide
// its top a whole pixel with lean() from engine/surface.js, so its hard edges step once and never notch.
// Colours are arguments; nothing here outlines the whole (call g.outline(INK) once afterwards).
//
//   import { AMMO_PACK_KINDS, ammoPackReach, drawAmmoPack } from '../engine/ammo-packs.js';
//   const o = { kind: p.shape, k, load: p.load, colour: p.body, metal: p.metal };
//   const r = ammoPackReach(o);
//   const layer = new Surface(32, 32), { body } = drawAmmoPack(layer, 16, at.y, { ...o, sx: at.sx, sy: at.sy });
//   g.blit(lean(layer, at.y + 9, 1 / 18));              // the top half slides one pixel right
//
// drawAmmoPack returns { body } (the silhouette as a shape test in frame pixels, for a glint band).
//
// Styles: shapes go through fill tests; ammoPackReach measures on a scratch layer.

import { ramp, mix } from './color.js';
import { Surface, polyIn, rectIn } from './surface.js';
import { placedIn } from './shapes.js';
import { stripesIn } from './solids.js';
import { drawAmmo } from './munitions.js';

const anyOf = (...tests) => (px, py) => { for (const f of tests) if (f(px, py)) return true; return false; };

/** The ammunition drawAmmoPack can draw, in the order a choice control lists them: box (a box with its lid thrown back and rounds standing in it), clip (a magazine with a round on top), shells (fat shotgun shells side by side). No arguments: a frozen list. */
export const AMMO_PACK_KINDS = Object.freeze(['box', 'clip', 'shells']);

const REACHED = new Map();

/**
 * How far an ammo pack reaches from its centre with the given settings, so a pickup can keep its float and pop inside the frame: { up, down, side } in whole pixels, outline not included.
 * Arguments: o: the options drawAmmoPack takes (kind, k, load; colours do not matter).
 */
export function ammoPackReach(o = {}) {
  const key = JSON.stringify([o.kind ?? 'box', o.k ?? 1, o.load ?? 4]);
  if (REACHED.has(key)) return { ...REACHED.get(key) };
  const g = new Surface(96, 96);
  drawAmmoPack(g, 48, 48, { ...o, sx: 1, sy: 1 });
  const b = g.bounds(), r = b ? { up: 48 - b.y0, down: b.y1 + 1 - 48, side: Math.max(48 - b.x0, b.x1 + 1 - 48) } : { up: 0, down: 0, side: 0 };
  if (REACHED.size > 256) REACHED.clear();
  REACHED.set(key, r);
  return { ...r };
}

/**
 * Draw an ammo pack face-on, upright and centred on (cx, cy): a box with its lid thrown back and brass rounds standing in it, a magazine with a round on top and a window of rounds, or a row of shotgun shells; returns { body }.
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of AMMO_PACK_KINDS), load (rounds shown, 2 to 6, default 4), k (scale, 1 is about 18 px across), sx, sy (squash), colour (the box, magazine or shell cases), metal (the brass), bare (true: leave small details out) }.
 */
export function drawAmmoPack(g, cx, cy, o = {}) {
  const kind = o.kind ?? 'box';
  if (!AMMO_PACK_KINDS.includes(kind)) throw new Error(`ammo-packs: unknown kind "${kind}"; kinds: ${AMMO_PACK_KINDS.join(', ')}`);
  if (kind === 'shells') return drawAmmo(g, cx, cy, { ...o, angle: 0 });
  const { colour = '#3f8a4f', metal = '#f2c230', bare = false, k = 1, sx = 1, sy = 1 } = o;
  const n = Math.max(2, Math.min(6, Math.round(o.load ?? 4)));
  const place = (test) => placedIn(test, cx, cy, { sx: k * sx, sy: k * sy });
  const C = ramp(colour), M = ramp(metal), B = [0, 0, g.w, g.h];
  const tip = mix(M.light, '#ffffff', 0.25);
  if (kind === 'clip') {
    // a narrow magazine that curves forward as it goes down; longer the more rounds it holds
    const H = Math.round(7 + 1.5 * n), top = -Math.round(H / 2) + 2, bend = 1.8, w = 3.5;
    const fwd = (y) => bend * ((y - top) / H) ** 2;
    const side = (x) => Array.from({ length: 7 }, (_, i) => { const y = top + (H * i) / 6; return [x + fwd(y), y]; });
    const shell = polyIn([...side(-w), ...side(w).reverse()]);
    // the base plate juts out a pixel each side
    const foot = top + H, plate = rectIn(-w - 1 + bend, foot - 1, 2 * w + 2, 2.5);
    // feed lips: two small hooks at the mouth; the top round lies on them, case behind, tip pointing forward
    const lips = anyOf(rectIn(-w - 0.5, top - 1, 2, 1.5), rectIn(w - 1.5, top - 1, 2, 1.5));
    const round = rectIn(-w, top - 4, 5.5, 3), point = polyIn([[1.5, top - 4], [3.2, top - 4], [5.6, top - 2.5], [3.2, top - 1], [1.5, top - 1]]);
    g.fill(...B, place(round), M, { shade: 1, light: 1 });
    if (!bare) g.fill(...B, place(rectIn(-w, top - 4, 1, 3)), M.dark, { shade: 0 });     // the case's rim
    g.fill(...B, place(point), tip, { shade: 0 });
    g.fill(...B, place(anyOf(shell, lips)), C, { shade: 1, light: 1 });
    g.fill(...B, place(plate), C.dark, { shade: 0 });
    if (!bare) {
      // a slot down its side with a brass line for each round showing through
      const slot = (px, py) => py >= top + 2 && py < top + 2 + 2 * n - 1 && Math.abs(px - fwd(py) + 0.5) < 1.6;
      g.fill(...B, place(slot), C.deep, { shade: 0 });
      g.fill(...B, place((px, py) => slot(px, py) && Math.floor(py - top) % 2 === 0), M.base, { shade: 0 });
    }
    return { body: place(anyOf(shell, plate, lips, round, point)) };
  }
  // a box with its lid thrown back: the lid's inside stands up behind the rounds, darker than the box
  const span = 3 * n - 1, x0 = -span / 2;
  const lid = polyIn([[-9, -2], [9, -2], [8, -10], [-8, -10]]), front = rectIn(-9, -2, 18, 10);
  g.fill(...B, place(lid), C.deep, { shade: 0 });
  g.fill(...B, place(rectIn(-8, -10, 16, 1)), C.dark, { shade: 0 });          // the lid's edge
  const rounds = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + 3 * i;
    rounds.push(polyIn([[x, -1], [x, -5], [x + 1, -6.6], [x + 2, -5], [x + 2, -1]]));
    g.fill(...B, place(rounds[i]), M, { shade: 1, light: 1 });
    g.fill(...B, place(rectIn(x, -7, 2, 2)), tip, { shade: 0, clip: place(rounds[i]) });
  }
  g.fill(...B, place(front), C, { shade: 2 });
  g.fill(...B, place(rectIn(-9, -2, 18, 1)), C.light, { shade: 0 });
  if (!bare) {
    const band = rectIn(-8, 2, 16, 3);
    g.fill(...B, place(band), C.light, { shade: 0 });
    g.fill(...B, place(stripesIn(band, { pitch: 4, slant: 1, duty: 0.5 })), C.dark, { shade: 0 });
    for (const x of [-7, 5]) g.fill(...B, place(rectIn(x, -1, 2, 2)), M, { shade: 0, light: 1 });
  }
  return { body: place(anyOf(lid, front, ...rounds)) };
}

