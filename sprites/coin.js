// Coin: a flat disc that turns around its upright axis. No skeleton.
// The disc is one shape squeezed sideways by cos(angle); its thickness shows
// as a band on the side that is turning away. With other settings it reads as
// a token (octagon, hole) or a gem medal (square, gem).
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, keys, clamp, fract, easeOut, PI } from '../engine/motion.js';
import { ramp, tone, mix, hexToRgb, INK } from '../engine/color.js';

const W = 32, GROUND = 30;
const METALS = ['#f2c230', '#c9ced9', '#cf8a4a', '#6f7a94', '#5fc4a0', '#e8dca8'];
const INLAYS = ['#c76a16', '#fff0a0', '#e2473f', '#3f86e0', '#3fbf6b', '#a45ee0', '#3a3350'];

// Outlines in unit space: (u, v) with the rim at about 1.
const SHAPES = {
  round: (u, v) => u * u + v * v <= 1,
  octagon: (u, v) => { u = Math.abs(u); v = Math.abs(v); return Math.max(u, v, (u + v) * 0.72) <= 0.98; },
  square: (u, v) => Math.abs(u) ** 5 + Math.abs(v) ** 5 <= 0.62,
};

// Emblems are written in units of the sunken middle: (0, 0) is its centre, 1 its edge.
const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = -PI / 2 + (i * PI) / 5, r = i % 2 ? 0.45 : 1;
  return [Math.cos(a) * r, Math.sin(a) * r + 0.05];
});
const inPoly = (pts, x, y) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const HOLE = 0.36;                        // in units of the whole face
const EMBLEMS = {
  star: (u, v) => inPoly(STAR, u, v),
  // two round lobes on a triangle, with the notch cut by hand so it survives at 5 pixels wide
  heart: (u, v) => {
    u = Math.abs(u) / 0.72; v = (v - 0.02) / 0.72;
    if (u < 0.25 && v < -0.5) return false;
    return (u - 0.5) ** 2 + (v + 0.35) ** 2 <= 0.27 || (v >= -0.35 && v <= 0.95 && u <= 1 - (v + 0.35) / 1.3);
  },
  gem: (u, v) => Math.abs(u) / 0.62 + Math.abs(v) / 0.88 <= 1,
};
const lum = (hex) => { const [r, g, b] = hexToRgb(hex); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };

// A small four-point sparkle. size 0 = one pixel, 1 = plus, 2 = big plus.
function twinkle(g, x, y, size, c) {
  x = Math.floor(x); y = Math.floor(y);
  for (let i = 1; i <= size; i++) { g.dot(x - i, y, c); g.dot(x + i, y, c); g.dot(x, y - i, c); g.dot(x, y + i, c); }
  g.dot(x, y, size ? '#ffffff' : c);
}

// One coin. R / Ry are the face radii, T the thickness, ang the turn (0 = facing us).
function drawCoin(g, p, { cx, cy, R, Ry, T, ang, glint, bare }) {
  const m = ramp(p.metal);
  const sh = SHAPES[p.shape];
  const c = Math.cos(ang), sn = Math.sin(ang);
  const Rx = Math.max(R * Math.abs(c), 0.01);
  const front = cx + (T / 2) * sn, back = cx - (T / 2) * sn;
  const fx = c >= 0 ? front : back, hx = c >= 0 ? back : front;     // the face we see, the face we do not
  const lo = Math.min(front, back), hi = Math.max(front, back);
  const hole = p.emblem === 'hole';
  const holeIn = (x0, px, py) => ((px - x0) / (Rx * HOLE)) ** 2 + ((py - cy) / (Ry * HOLE)) ** 2 <= 1;
  const body = (px, py) => sh((px - clamp(px, lo, hi)) / Rx, (py - cy) / Ry) && !(hole && holeIn(fx, px, py) && holeIn(hx, px, py));
  const face = (px, py) => sh((px - fx) / Rx, (py - cy) / Ry) && !(hole && holeIn(fx, px, py));
  const x0 = lo - Rx - 2, x1 = hi + Rx + 2, y0 = cy - Ry - 2, y1 = cy + Ry + 2;

  // the edge (and the wall of the hole), then the face on top of it
  g.fill(x0, y0, x1, y1, body, { base: m.dark, dark: m.deep, light: m.base }, { shade: 1, light: 1 });
  g.fill(x0, y0, x1, y1, face, m, { shade: 1, light: 1 });

  // sunken middle: shadow under the top-right rim, so flip the light for this one shape
  const k = (R - (p.rim ? 2 : 1)) / R;
  const field = p.rim ? tone(p.metal, -0.25) : p.metal;
  const inner = (px, py) => face(px, py) && sh((px - fx) / (Rx * k), (py - cy) / (Ry * k));
  const sunk = p.rim && Rx > 2.5;
  if (sunk) {
    const keep = g.shadow; g.shadow = [1, -1];
    g.fill(x0, y0, x1, y1, inner, { base: field, dark: m.dark, light: m.light }, { shade: 1 });
    g.shadow = keep;
  }

  // the glint: a slanted bright band that slides across the face
  const band = (px, py) => Math.abs((px - fx) / R + (0.5 * (py - cy)) / R - glint) < 0.15;
  g.fill(x0, y0, x1, y1, (px, py) => face(px, py) && band(px, py), mix(m.light, '#ffffff', 0.6));
  if (sunk) g.fill(x0, y0, x1, y1, (px, py) => inner(px, py) && band(px, py), m.light);

  const E = EMBLEMS[p.emblem];
  if (E && Rx > 2 && !bare) {
    // keep the emblem readable on any metal: push it darker or lighter when it is too close to the face
    let inlay = p.inlay;
    const gap = lum(inlay) - lum(field);
    if (Math.abs(gap) < 0.2) inlay = tone(inlay, gap > 0 ? 1.2 : -1.2);
    const ink = ramp(inlay);
    const gem = p.emblem === 'gem';
    const em = (px, py) => E((px - fx) / (Rx * k), (py - cy) / (Ry * k));
    g.fill(x0, y0, x1, y1, em, ink, { shade: gem ? 1 : 0, light: gem ? 1 : 0, clip: inner });
    if (gem && Rx > 3.5) g.dot(fx + Rx * 0.1, cy - Ry * 0.3, '#ffffff');
  }
}

export default defineSprite({
  id: 'coin',
  name: 'Coin',
  kind: 'Item',
  blurb: 'A spinning pickup. Make it a gold coin, a shop token or a gem medal.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['fantasy', 'neutral'], gameTypes: ['platformer', 'turn-based-rpg', 'arcade', 'puzzle'], view: 'front', words: ['coin', 'gold', 'money', 'cash', 'currency', 'treasure', 'loot', 'token', 'gem', 'medal', 'collect', 'pickup', 'spin', 'score'], license: 'draft' },
  size: [W, W],
  pivot: [16, GROUND],
  grounded: false,
  preview: 'spin',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: { collect: [{ sound: 'coin-pickup', frame: 1 }] },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    thickness: range('Thickness', 0.4, { lo: 'Thin', hi: 'Chunky' }),
    shape: choice('Shape', 'round', ['round', 'octagon', 'square']),
    emblem: choice('Emblem', 'star', ['star', 'heart', 'plain', 'hole', 'gem']),
    rim: toggle('Raised rim', true),
    sparkle: toggle('Sparkle', true),
    metal: color('Metal', METALS[0], METALS),
    inlay: color('Emblem colour', INLAYS[0], INLAYS, { when: { emblem: ['star', 'heart', 'gem'] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    spin: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
    collect: { frames: 8, fps: (p) => 14 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, p }) {
    // whole-pixel sizes: an odd width sits on a pixel centre, an even one on a pixel corner
    const n = Math.round(lerp(10, 19, p.size));
    const R = n / 2 + 0.1;
    const cx = n % 2 ? 16.5 : 16, cy0 = n % 2 ? 16.5 : 17;
    const T = Math.round(lerp(2, 5, p.thickness));
    const m = ramp(p.metal);

    if (clip === 'spin') {
      // the two faces match, so half a turn is one loop
      const cy = cy0 - Math.round(lerp(0, 2, p.bob) * wave(t));
      drawCoin(g, p, { cx, cy, R, Ry: R, T, ang: PI * t, glint: lerp(-1.6, 1.6, fract(t + 0.5)) });
      g.outline(INK);
      if (p.sparkle) {
        const d = Math.min(t, 1 - t);                       // distance from the face-on frame
        if (d < 0.15) twinkle(g, cx + R * 0.78, cy - R * 0.78, d < 0.05 ? 2 : 1, m.light);
      }
      return;
    }

    // collect: dip, pop up while flipping, flash, shrink into sparkles
    const pop = Math.min(lerp(3, 7, p.pop), cy0 - R - 4);
    const lift = keys(t, [[0, 0], [0.14, -1], [0.45, pop], [0.6, pop + 1], [1, pop + 1]]);
    const sq = keys(t, [[0, 0], [0.14, 0.2], [0.3, -0.18], [0.5, 0], [1, 0]]);
    const scale = keys(t, [[0, 1], [0.5, 1], [0.58, 1.12], [0.75, 0.5], [0.86, 0]]);
    const ang = PI * keys(t, [[0.14, 0], [0.29, 0.34], [0.43, 0.5], [0.57, 1]], (x) => x);
    const cy = Math.round(cy0 - lift);
    const r = R * scale;
    if (r > 2.4) {
      drawCoin(g, p, { cx, cy, R: r * (1 + sq), Ry: r * (1 - sq), T: Math.max(1, Math.round(T * scale)), ang, glint: 0, bare: scale < 0.9 });
      if (t > 0.5 && t < 0.65) g.tint('#ffffff');
      g.outline(INK);
    }
    const b = clamp((t - 0.55) / 0.45);
    if (b <= 0) return;
    const far = Math.min(R + 3, cy - 3);
    if (p.sparkle && b > 0.2) {
      const d = lerp(3, far, easeOut(b));
      for (let i = 0; i < 6; i++) {
        const a = (i + 0.5) * (PI / 3);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9;
        if (b < 0.8) twinkle(g, x, y, i % 2 ? 0 : 1, i % 2 ? m.light : m.base);
        else if (i % 2 === 0) g.dot(x, y, m.light);
      }
    }
    if (b > 0.2 && b < 0.8) twinkle(g, cx, cy, b < 0.5 ? 2 : 1, m.light);
    else if (b >= 0.8 && !p.sparkle) g.dot(cx, cy, m.light);
  },
});
