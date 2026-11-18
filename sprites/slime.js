// Slime: a squashy blob. No skeleton — the whole body is one shape whose
// width and height trade off (squash and stretch) so its volume looks constant.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, pulse, keys, clamp } from '../engine/motion.js';
import { ramp, tone, INK } from '../engine/color.js';

const W = 48, GROUND = 42, CX = 22;
const GOO = ['#5fc46b', '#3fb3c9', '#4f7fe0', '#9a62d6', '#e0609a', '#e2574c', '#e89a35', '#e6cf4a', '#8a93a6'];

export default defineSprite({
  id: 'slime',
  name: 'Slime',
  kind: 'Creature',
  blurb: 'A bouncy blob. Pick a colour, a face and something to wear.',
  meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'dungeon', 'candy'], gameTypes: ['platformer', 'turn-based-rpg'], view: 'side', words: ['slime', 'blob', 'goo', 'jelly', 'ooze', 'gel', 'enemy', 'monster', 'bounce', 'hop', 'squish', 'jump'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND],
  preview: 'hop',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: { hop: [{ sound: 'jump', frame: 1, preset: 'Tiny hop' }, { sound: 'footstep-gravel', frame: 6, preset: 'Sneaking' }], attack: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe' }], hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab' }] },
  params: {
    size: range('Size', 0.5, { lo: 'Tiny', hi: 'Huge' }),
    shape: range('Shape', 0.5, { lo: 'Flat', hi: 'Tall' }),
    eyes: choice('Eyes', 'cute', ['cute', 'dots', 'angry', 'sleepy', 'one']),
    topping: choice('On top', 'none', ['none', 'crown', 'sprout', 'horns', 'bow']),
    shine: toggle('Shine', true),
    body: color('Colour', GOO[0], GOO),
    wobble: range('Wobble', 0.5, { lo: 'Firm', hi: 'Jelly', group: 'Motion' }),
    hop: range('Hop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    hop: { frames: 8, fps: (p) => 11 * lerp(0.65, 1.45, p.speed), loop: true },
    attack: { frames: 8, fps: (p) => 13 * lerp(0.65, 1.45, p.speed), loop: false },
    hurt: { frames: 4, fps: (p) => 9 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, p }) {
    const r = lerp(6, 11, p.size);                 // base radius
    const tall = lerp(0.72, 1.12, p.shape);
    const wob = lerp(0.5, 1.6, p.wobble);
    // squash: >0 flatter and wider, <0 taller and thinner
    let squash = 0, lift = 0, dx = 0, flash = false, mood = p.eyes, lean = 0;
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
    }

    const rx = r * (1 + squash) , ry = r * tall * (1 - squash) * 1.0;
    const cx = CX + dx, base = GROUND - lift;
    const cy = base - ry * 0.82;                     // centre sits a little below the middle: flat-ish bottom
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
      const hx = Math.round(cx + rx * 0.45 + lean * ry), hy = Math.round(cy - ry * 0.55);
      g.rect(hx, hy, 2, 1, goo.light); g.dot(hx + 1, hy + 1, goo.light);
      if (r > 8) g.dot(hx - 2, hy - 1, goo.light);
    }

    // face
    const gap = Math.max(2, Math.round(rx * 0.42));
    const ex = Math.round(faceX), ey = Math.round(faceY);
    const eye = (x) => {
      if (mood === 'hurt') { g.dot(x - 1, ey - 1, INK); g.dot(x, ey, INK); g.dot(x - 1, ey + 1, INK); return; }
      if (mood === 'sleepy') { g.rect(x - 1, ey, 2, 1, INK); return; }
      if (mood === 'dots') { g.dot(x, ey, INK); return; }
      g.rect(x - 1, ey - 1, 2, 3, INK);
      if (mood === 'cute') g.dot(x, ey - 1, '#ffffff');
      if (mood === 'angry') { g.dot(x - 1, ey - 1, goo.base); g.dot(x - 1, ey - 2, INK); g.dot(x, ey - 2, INK); }
    };
    if (mood === 'one') {
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
      g.dot(cx - rx - 2, GROUND - 2, goo.base); g.dot(cx + rx + 2, GROUND - 2, goo.base);
    }
  },
});
