// PORT (creature batch C1): the drawing of the code sprite sprites/slime.js (its constants, helpers, sockets and render), word
// for word, with its imports pointed at the port shims (engine/gen/ports/colour.js through ./colour.js, ./surface.js) and at
// the E2 copies of the engine helpers (engine/gen/ports/e2/) or C1's own copies here, so it draws paint refs on an
// engine/gen/port-surface.js grid. It is the drawing of the creature generator creature.slime@1 (engine/gen/creature-c1.js),
// which sprites/slime.json names; it goes only with the last version that draws with it. Its settings (p) are that
// generator's arguments; its colours are the paint refs the data file names. The defineSprite block's metadata (name,
// params, clips, sounds) lives in the data file now. A HAND CHANGE note says where it differs from its source; never
// change what a released generator version draws through it.
// Slime: a squashy blob. No skeleton — the whole body is one shape whose
// width and height trade off (squash and stretch) so its volume looks constant.
import { lerp, wave, pulse, keys, clamp } from '../../../motion.js';
import { ramp, tone, INK } from './colour.js';
import { Surface, blitInside } from './surface.js';

const W = 48, GROUND = 42, CX = 22;
const HEADROOM = 14;       // rows of spare room above the frame while drawing: the tallest, bounciest slime with something on top needs them
const GOO = ['#5fc46b', '#3fb3c9', '#4f7fe0', '#9a62d6', '#e0609a', '#e2574c', '#e89a35', '#e6cf4a', '#8a93a6'];

/** Draws one frame as sprites/slime.js did (g a PortSurface, p the settings with colours as paint refs). */
export function render(frame, { clip, t, p }) {
  // Drawn on a layer with room above the frame, then set into the frame. A picture that fits lands exactly where it was
  // drawn; one that would leave the top (the biggest slime at the top of its highest hop) is lowered by the rows it needs.
  const g = new Surface(W, W + HEADROOM), FLOOR = GROUND + HEADROOM;
  const r = lerp(6, 11, p.size);                 // base radius
  const tall = lerp(0.72, 1.12, p.shape);
  const wob = lerp(0.5, 1.6, p.wobble);
  // squash: >0 flatter and wider, <0 taller and thinner
  let squash = 0, lift = 0, dx = 0, flash = false, mood = p.eyes, lean = 0, burst = 0;
  if (clip === 'idle') {
    squash = 0.1 * wob * wave(t);
  } else if (clip === 'hop') {
    const top = lerp(4, 11, p.hop);
    lift = top * keys(t, [[0, 0], [0.2, 0], [0.5, 1], [0.8, 0], [1, 0]], (x) => x) ;
    lift = top * Math.max(0, Math.sin(Math.PI * clamp((t - 0.2) / 0.6)));
    squash = keys(t, [[0, 0.1], [0.12, 0.3 * wob], [0.3, -0.28 * wob], [0.5, -0.05], [0.7, -0.22 * wob], [0.86, 0.34 * wob], [1, 0.1]]);
  } else if (clip === 'attack') {
    squash = keys(t, [[0, 0], [0.25, 0.3 * wob], [0.45, -0.2], [0.6, -0.25], [0.8, 0.2 * wob], [1, 0]]);
    dx = keys(t, [[0, 0], [0.25, -2], [0.5, 9], [0.62, 9], [1, 0]]);
    lift = 3 * pulse(clamp((t - 0.25) / 0.45));
    lean = keys(t, [[0, 0], [0.25, -0.15], [0.5, 0.45], [0.7, 0.2], [1, 0]]);
    if (t > 0.3 && t < 0.75) mood = 'angry';
  } else if (clip === 'hurt') {
    squash = keys(t, [[0, 0.35], [0.4, -0.15 * wob], [0.7, 0.12 * wob], [1, 0]]);
    dx = keys(t, [[0, -1], [0.4, -4], [1, -1]]);
    flash = t < 0.2;
    mood = 'hurt';
  } else if (clip === 'die') {
    // 0 the hit (white), 1 to 3 it sags flatter and flatter, 4 it bursts and droplets fly, 5 to 6 they fall, 7 a puddle is left
    squash = keys(t, [[0, 0.35], [0.143, 0.2], [0.286, 0.5], [0.429, lerp(0.64, 0.74, p.wobble)], [1, 0.74]]);
    dx = keys(t, [[0, -1], [0.143, -3], [0.429, -2], [1, -2]]);
    flash = t < 0.1;
    mood = 'hurt';
    burst = clamp((t - 0.43) / 0.57);              // 0 until it bursts, then 0..1 over frames 4 to 7
  }

  const cx = CX + dx, base = FLOOR - lift;
  const wide = clip === 'die' ? cx - 3 : Infinity;      // dying, it spreads out: never past the frame edge
  // after the burst the body is a puddle: a low dome that spreads and settles
  const puddle = burst > 0;
  const rx = puddle ? Math.min(r * lerp(1.45, 1.85, Math.sqrt(burst)), wide) : Math.min(r * (1 + squash), wide);
  const ry = puddle ? Math.max(2.4, r * tall * lerp(0.36, 0.22, burst)) : r * tall * (1 - squash) * 1.0;
  const cy = puddle ? base : base - ry * 0.82;     // centre sits a little below the middle: flat-ish bottom
  const goo = ramp(p.body);
  const body = (px, py) => {
    if (py > base) return false;
    const sx = px - cx - lean * (base - py);       // lean shears the top forward
    const k = py > cy ? 1.25 : 1;                  // lower half is squarer
    return Math.abs(sx / rx) ** (2 * k) + Math.abs((py - cy) / ry) ** (2 * k) <= 1;
  };
  g.fill(cx - rx - 8, cy - ry - 2, cx + rx + 8, base, body, goo, { shade: 2, light: 0 });
  // darker foot line
  for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (body(x + 0.5, base - 0.5) && body(x + 1.5, base - 0.5) && body(x - 0.5, base - 0.5)) g.dot(x, base - 1, goo.dark);

  const topY = cy - ry, faceX = cx + rx * 0.22 + lean * ry * 0.8, faceY = cy - ry * 0.05;
  if (p.shine) {
    const hx = Math.round(cx + rx * 0.45 + lean * ry), hy = puddle ? Math.round(base - ry * 0.55) - 1 : Math.round(cy - ry * 0.55);
    g.rect(hx, hy, 2, 1, goo.light);
    if (!puddle) g.dot(hx + 1, hy + 1, goo.light);            // the puddle is too thin for the second row
    if (r > 8) g.dot(hx - 2, puddle ? hy : hy - 1, goo.light);
  }

  // droplets thrown out by the burst: each flies its own arc, lands, and stays as a speck beside the puddle
  if (puddle) {
    const apex = r * 0.8 + lerp(3, 8, p.hop);
    // [side: -1 back .. 1 front, how high, size, when it lands (0..1 of the burst)]
    for (const [side, high, big, lands] of [[-1, 0.8, 1.6, 1], [-0.6, 1.2, 1.2, 0.8], [-0.2, 1.45, 1.0, 1], [0.3, 1.5, 1.2, 0.8], [0.68, 1.15, 1.6, 1], [1, 0.75, 1.0, 0.8]]) {
      const far = Math.min(rx + 6, side < 0 ? cx - 4 : W - 5 - cx);
      const u = clamp(burst / lands);
      const x = cx + side * far * lerp(0.35, 1, u);
      if (u >= 1) { g.rect(Math.round(x) - 1, base - 1, big > 1.4 ? 3 : 2, 1, goo.base); continue; }
      const y = base - ry - 1 - apex * high * (1 - (2 * u - 1) ** 2) * 0.9;
      g.ellipse(x, y, big, big, goo, { shade: 0 });
      g.dot(x, y - 0.5, goo.light);
    }
  }

  // face (the puddle has none)
  const gap = Math.max(2, Math.round(rx * 0.42));
  const ex = Math.round(faceX), ey = Math.round(faceY);
  const noFace = clip === 'die' && (puddle || ry < 3.2);      // too flat to hold a face
  const eye = (x) => {
    if (mood === 'hurt') { g.dot(x - 1, ey - 1, INK); g.dot(x, ey, INK); g.dot(x - 1, ey + 1, INK); return; }
    if (mood === 'sleepy') { g.rect(x - 1, ey, 2, 1, INK); return; }
    if (mood === 'dots') { g.dot(x, ey, INK); return; }
    g.rect(x - 1, ey - 1, 2, 3, INK);
    if (mood === 'cute') g.dot(x, ey - 1, '#ffffff');
    if (mood === 'angry') { g.dot(x - 1, ey - 1, goo.base); g.dot(x - 1, ey - 2, INK); g.dot(x, ey - 2, INK); }
  };
  if (noFace) {
    // nothing
  } else if (mood === 'one') {
    g.ellipse(ex + 0.5, ey, 2.5, 2.5, '#ffffff'); g.rect(ex, ey - 1, 2, 2, INK);
  } else {
    eye(ex - Math.floor(gap / 2)); eye(ex + Math.ceil(gap / 2) + 1);
    if (mood === 'cute' || mood === 'hurt') g.dot(ex + 1, ey + 2, tone(p.body, -1.6));
  }

  // toppings sit on the crown of the head and ride the squash
  const tx = Math.round(cx + lean * ry * 1.6), ty = Math.round(topY);
  if (p.topping === 'crown') {
    const gold = ramp('#e6c545');
    g.rect(tx - 3, ty - 2, 6, 2, gold); g.dot(tx - 3, ty - 3, gold.light); g.dot(tx, ty - 3, gold.light); g.dot(tx + 2, ty - 3, gold.light);
  } else if (p.topping === 'sprout') {
    const leaf = ramp('#4f9d57');
    g.line(tx, ty, tx, ty - 3, leaf.dark);
    g.ellipse(tx + 2, ty - 4, 2.2, 1.3, leaf, { shade: 0 }); g.ellipse(tx - 2, ty - 3, 2, 1.2, leaf.dark);
  } else if (p.topping === 'horns') {
    const horn = ramp('#f0ead8');
    const o = Math.round(rx * 0.5);
    g.poly([[tx - o - 1.5, ty + 2.5], [tx - o + 1.5, ty + 1.5], [tx - o - 1, ty - 2.5]], horn);
    g.poly([[tx + o - 1.5, ty + 1.5], [tx + o + 1.5, ty + 2.5], [tx + o + 1, ty - 2.5]], horn);
  } else if (p.topping === 'bow') {
    const bow = ramp('#e0609a');
    g.poly([[tx, ty], [tx - 4, ty - 3], [tx - 4, ty + 1]], bow); g.poly([[tx, ty], [tx + 4, ty - 3], [tx + 4, ty + 1]], bow);
    g.dot(tx, ty - 1, bow.dark);
  }

  if (flash) g.tint('#ffffff');
  g.outline(INK);

  // landing splat drops, drawn after the outline so they stay crisp single pixels
  if (clip === 'hop' && t > 0.84) {
    g.dot(cx - rx - 2, FLOOR - 2, goo.base); g.dot(cx + rx + 2, FLOOR - 2, goo.base);
  }
  blitInside(frame, g, 1, { dy: -HEADROOM });
}
