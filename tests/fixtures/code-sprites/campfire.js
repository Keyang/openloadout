// FROZEN COPY, not a sprite: sprites/campfire.js as it was on 2026-11-20 (batch P4), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only as the reference its port (engine/gen/world-p4.js) is tested against
// (tests/unit/gen-p4-props.test.mjs); imports point at ../../../. Never edit it; the build never scans tests/.
// Campfire: a flame made of three stacked shapes (outer, middle, core) over a
// bed of logs or stones. No noise anywhere: every flame is a teardrop whose
// centre line and width ripple with sine waves that travel upward, and every
// wave runs a whole number of times per loop, so the loop closes exactly.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { lerp, keys, fract, hash, TAU, PI } from '../../../engine/motion.js';
import { ramp, tone, mix, hexToRgb, rgbToHsl, hsl, INK } from '../../../engine/color.js';
import { Surface } from '../../../engine/surface.js';

const W = 48, CX = 24, GROUND = 44;       // lowest drawn row is GROUND (the outline under the logs)
const FIRE = ['#f2701a', '#e8382c', '#f0b020', '#3f8fe8', '#4fc44a', '#a05ae0', '#e85a9c', '#2fc4b0'];
const WOOD = ['#8a5a34', '#5e4030', '#a9865a', '#6e6a70', '#3d3344'];
const STONE = '#8d93a3';

// Flame colours from one picked colour: hotter layers are lighter and lean toward yellow.
function flameColours(hex) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const toward = (deg) => { const d = ((55 - h + 540) % 360) - 180; return Math.abs(d) < deg ? 55 : h + Math.sign(d) * deg; };
  return {
    rim: tone(hex, -0.9),
    outer: hex,
    mid: hsl(toward(22), Math.min(1, s * 1.05), l + (0.92 - l) * 0.42),
    core: hsl(toward(40), s * 0.9, 0.9),
  };
}

// Width of a flame along its height: h = 0 at the base, 1 at the tip. Round bottom, pointed top.
const profile = (h) => Math.sin(PI * Math.sqrt(0.05 + 0.95 * h)) ** 0.75;

export default defineSprite({
  id: 'campfire',
  name: 'Campfire',
  kind: 'Effect',
  blurb: 'A crackling fire. Change its colour for magic or poison flames.',
  meta: { type: 'prop', role: 'world/prop', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'turn-based-rpg'], view: 'side', words: ['campfire', 'fire', 'flame', 'bonfire', 'torch', 'burn', 'flicker', 'camp', 'checkpoint', 'rest', 'warmth', 'magic fire'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND],
  preview: 'burn',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: { burn: [{ sound: 'fire', frame: 0 }], ignite: [{ sound: 'whoosh', frame: 1, preset: 'Heavy swing' }, { sound: 'fire', frame: 0 }] },
  params: {
    height: range('Flame height', 0.5, { lo: 'Low', hi: 'Tall' }),
    width: range('Flame width', 0.5, { lo: 'Thin', hi: 'Wide' }),
    side: range('Side flames', 0.6, { lo: 'None', hi: 'Big' }),
    heat: range('Heat', 0.5, { lo: 'Cool', hi: 'White-hot' }),
    base: choice('Base', 'logs', ['logs', 'tipi', 'stones', 'none']),
    sparks: range('Sparks', 0.5, { lo: 'None', hi: 'Lots' }),
    colour: color('Flame colour', FIRE[0], FIRE),
    wood: color('Wood', WOOD[0], WOOD, { when: { base: ['logs', 'tipi'] } }),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    wind: range('Wind', 0.15, { lo: 'Still', hi: 'Windy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burn: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
    ignite: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, frame, p }) {
    const F = flameColours(p.colour);
    const wood = ramp(p.wood);
    const lit = { base: wood.base, dark: wood.dark, light: mix(wood.light, F.mid, 0.5) };   // tops catch the firelight
    // the log behind the flame: darker, and shaded toward the ink colour (farRamp turns brown shadows crimson)
    const back = tone(p.wood, -0.7);
    const far = { base: back, dark: mix(back, INK, 0.5), light: wood.base };

    // ignite grows the same flame from nothing; its last frame is burn's first
    const grow = clip === 'ignite' ? keys(t, [[0, 0], [0.14, 0.34], [0.45, 0.66], [0.7, 1.14], [0.86, 0.95], [1, 1]]) : 1;
    const wide = clip === 'ignite' ? keys(t, [[0, 0.3], [0.14, 0.5], [0.45, 0.9], [0.7, 1.1], [1, 1]]) : 1;
    const s = (cycles, phase = 0) => Math.sin(TAU * (cycles * t + phase));   // whole cycles per loop only

    const wob = lerp(0.6, 2.6, p.flicker);            // sideways ripple at the tip, in pixels
    const beat = lerp(0.05, 0.16, p.flicker);         // how much the height pumps
    const lean = lerp(0, 7, p.wind) * (1 + 0.25 * s(1, 0.2));
    const H = lerp(15, 28, p.height) * grow;
    const Wd = lerp(5, 9.5, p.width) * wide;
    const yb = { logs: 40.5, tipi: 42, stones: 41, none: 43 }[p.base];

    // ---- behind the flame ----
    if (p.base === 'logs') {
      // two crossed logs: this one runs up to the right, behind the flame
      g.limb(11, 42, 36, 37, 4, far);
      g.rect(10, 41, 2, 2, tone(p.wood, 0.5));
    } else if (p.base === 'tipi') {
      g.limb(29, 42, 23, 32, 3, far);
    } else if (p.base === 'stones') {
      const rock = ramp(tone(STONE, -0.8));
      for (let i = 0; i < 4; i++) g.ellipse(15.5 + i * 5.6, 38.7 + (i % 3 ? 0 : 0.6), 2.7, 1.9, rock, { outline: INK });
      g.limb(16, 40, 32, 40, 3, far);
    } else {
      g.ellipse(CX, 42.6, lerp(5, 9.5, p.width) + 3.5, 1.4, '#3d3344');
    }
    g.outline(INK);

    // ---- the flame ----
    // one tongue: base (x0, yb), height h, half-width w, its own phase
    const tongue = (x0, h, w, ph, push) => ({ x0, h, w, ph, push });
    const tongues = [tongue(CX, H * (1 + beat * (0.6 * s(1) + 0.4 * s(2, 0.3))), Wd, 0, 0)];
    const sideH = H * p.side;
    if (sideH > 5) {
      tongues.push(tongue(CX - Wd * 0.5, sideH * 0.64 * (1 + 1.5 * beat * s(2, 0.45)), Wd * 0.55, 0.37, -1.5));
      tongues.push(tongue(CX + Wd * 0.52, sideH * 0.5 * (1 + 1.5 * beat * s(3, 0.1)), Wd * 0.5, 0.71, 1.5));
    }
    const centre = (T, h) => T.x0 + (lean + T.push) * h ** 1.6 + wob * h * Math.sin(TAU * (1.3 * h - t + T.ph));
    // a layer is every tongue shrunk toward its base; inner layers ride the outer layer's centre line
    // with crossed logs the flame's foot follows the sloping near log, so nothing peeks out under it
    const foot = p.base === 'logs' ? (px) => 39 + (px - CX) * 0.2 : () => W;
    const layer = (kh, kw) => (px, py) => {
      if (py > foot(px)) return false;
      for (const T of tongues) {
        if (T.h < 2) continue;
        const h = (yb - py) / T.h;
        if (h < 0 || h > 1) continue;
        const hk = h / kh;
        if (hk > 1) continue;
        const w = Math.max(0.55, T.w * kw * profile(hk) * (1 + 0.15 * Math.sin(TAU * (2 * h - 2 * t + 3 * T.ph))));
        if (Math.abs(px - centre(T, h)) <= w) return true;
      }
      return false;
    };
    const main = tongues[0];
    const outer = layer(1, 1);
    const box = [2, 2, W - 2, yb];
    if (main.h >= 2) {
      g.fill(...box, outer, F.outer, { outline: F.rim });
      // a lick of flame that breaks off the tip and shrinks as it rises: a tiny teardrop
      const life = fract(t + 0.35);
      if (grow > 0.9 && p.flicker > 0.15 && life < 0.6) {
        const k = 1 - life / 0.6;
        const lh = 1.5 + 3 * k, lw = 0.5 + 1.1 * k;
        const lx = centre(main, 1) + (lean * 0.15 + 1) * life, ly = yb - main.h - 2 - life * 9;
        const lick = (px, py) => { const h = (ly - py) / lh; return h >= 0 && h <= 1 && Math.abs(px - lx) <= Math.max(0.55, lw * profile(h)); };
        if (ly - lh > 4) g.fill(lx - 4, ly - lh - 1, lx + 4, ly + 1, lick, F.outer, k > 0.55 ? { outline: F.rim } : {});   // too small for a rim later on
      }
      const inside1 = (px, py) => outer(px - 1, py) && outer(px + 1, py) && outer(px, py - 1);
      const mid = layer(lerp(0.56, 0.78, p.heat), lerp(0.52, 0.72, p.heat));
      g.fill(...box, mid, F.mid, { clip: inside1 });
      const inside2 = (px, py) => mid(px - 1, py) && mid(px + 1, py) && mid(px, py - 1) && inside1(px, py);
      tongues.length = 1;                                // only the main tongue has a core
      g.fill(...box, layer(lerp(0.26, 0.5, p.heat), lerp(0.24, 0.42, p.heat)), F.core, { clip: inside2 });
    }

    // ---- in front of the flame (its own surface, so only the logs get the ink outline) ----
    const fg = new Surface(W, W);
    if (p.base === 'logs') {
      // the near log runs down to the right, across the flame's foot, and shows its cut end
      fg.limb(12, 36, 37, 41, 5, lit, { light: 1 });
      fg.ellipse(37.5, 41.5, 1.7, 1.7, tone(p.wood, 1.2));
      fg.dot(37, 41, wood.base);
    } else if (p.base === 'tipi') {
      // two poles that cross near the top
      fg.limb(34, 42, 22, 31, 3, lit, { light: 1 });
      fg.limb(14, 42, 26, 31, 3, lit, { light: 1, outline: INK });
    } else if (p.base === 'stones') {
      const rock = ramp(STONE);
      const glow = { base: rock.base, dark: rock.dark, light: mix(rock.light, F.mid, 0.4) };
      const stones = [[10.5, 3, 2.4], [24.5, 3.3, 2.5], [37.5, 2.9, 2.3], [17.5, 3.9, 3], [31, 4, 3.1]];   // big ones last, in front
      for (const [x, rx, ry] of stones) fg.ellipse(x, 43.9 - ry, rx, ry, glow, { light: 1, outline: INK });
    }
    // embers: a few hot pixels in the wood under the flame that take turns glowing
    if (p.base !== 'stones') {
      for (let i = 0; i < 4; i++) {
        const ex = Math.round(CX - 5 + i * 3.4 + hash(i, 3)), ey = p.base === 'none' ? 42 : Math.round(39 + 2 * hash(i, 9));
        const on = p.base === 'none' ? g.get(ex, ey) : fg.get(ex, ey);
        const hot = (frame + i * 3) % 4;
        if (on && hot < 2) (p.base === 'none' ? g : fg).dot(ex, ey, hot === 0 ? F.mid : F.outer);
      }
    }
    fg.outline(INK);
    g.blit(fg);

    // ignite: three sparks jump out of the wood as it catches
    if (clip === 'ignite') {
      for (let i = 0; i < 3; i++) {
        const life = (t - 0.04 - i * 0.07) / 0.4;
        if (life < 0 || life > 1) continue;
        const x = CX + (i - 1) * (3 + 6 * life), y = yb - 4 - 11 * Math.sin(life * PI * 0.6) - i;
        g.dot(x, y, life < 0.5 ? F.core : F.mid);
        if (life < 0.5) g.dot(x, y + 1, F.mid);
      }
    }

    // ---- sparks: each one rises, drifts and cools on its own repeating timer ----
    const n = Math.round(lerp(0, 8, p.sparks));
    for (let i = 0; i < n; i++) {
      const life = fract(t + hash(i, 11));
      const last = lerp(0.5, 0.85, hash(i, 2));
      if (life > last) continue;
      if (clip === 'ignite' && life > t - 0.15) continue;          // not lit yet
      const x = CX + (hash(i, 5) - 0.5) * 2 * Wd + 1.8 * Math.sin(TAU * (life + hash(i, 3))) + lean * life;
      const y = yb - main.h * 0.45 - life * (main.h * 0.8 + 8);
      if (y < 2 || x < 2 || x > W - 3) continue;
      g.dot(x, y, life < last * 0.5 ? F.mid : F.outer);
    }
  },
});
