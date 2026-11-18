// Bat: a round furry body between two wings. No skeleton. Each wing is one
// polygon (shoulder -> wrist -> finger tips -> hip) that swings about the
// shoulder; the finger tips swing a little later than the arm, which gives the
// whip of a real wing beat. The body bobs the opposite way to the wings.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, clamp, wave, pulse, keys } from '../engine/motion.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';

const W = 48, CX = 25, CY = 25;
const FUR = ['#5b4a78', '#3a3350', '#6b4a3a', '#8a93a6', '#c9423a', '#3f7a5e', '#e9e2d0', '#3f5fa8'];
const SKIN = ['#8a4a6e', '#4a3a6a', '#a8553a', '#5d6475', '#7a2f3a', '#3f8f7a', '#d9a8b0', '#d8d2c4'];
const EYES = ['#ffd84a', '#ff5a4a', '#7ae0ff', '#9aff6a', '#ffffff', '#ff8ad8'];

// Wing outlines, in units of the wing length. x = out from the shoulder, y = up.
// `tips` are the finger tips, from the leading one round to the trailing one.
// `scallop` is how deep the membrane curves in between two tips (0 = straight);
// `bones` says which tips get a finger bone drawn to them from the wrist.
const WINGS = {
  classic: { wrist: [0.4, 0.34], tips: [[1.0, 0.12], [0.84, -0.36], [0.5, -0.5]], scallop: 0.3, bones: [0, 1, 2] },
  sharp: { wrist: [0.33, 0.46], tips: [[1.02, 0.36], [0.95, -0.2], [0.6, -0.56]], scallop: 0.46, bones: [0, 1, 2] },
  round: { wrist: [0.32, 0.36], tips: [[0.72, 0.5], [0.98, 0.2], [1.0, -0.16], [0.8, -0.44], [0.46, -0.52]], scallop: 0, bones: [2, 4], spot: [0.7, -0.04] },
};

/** Rough brightness of a colour, 0..1 (not in engine/color.js, so worked out here). */
const brightness = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; };
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const inPoly = (pts, px, py) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/** One wing. S = shoulder, H = hip (both on the body), side = -1 left / +1 right. */
function wing(g, S, H, side, L, a, flex, shape, paint) {
  const sh = WINGS[shape];
  const at = (lx, ly) => [S[0] + side * lx * L, S[1] - ly * L];
  const [wx, wy] = rot(sh.wrist[0], sh.wrist[1], a);
  const wrist = at(wx, wy);
  const tips = sh.tips.map(([x, y]) => {
    const [qx, qy] = rot(x - sh.wrist[0], y - sh.wrist[1], a + flex);
    return at(wx + qx, wy + qy);
  });
  const hull = [S, wrist, ...tips, H];
  // scallops: a circle through two neighbouring tips, centred outside the wing, bites an arc out of the edge
  const bites = [];
  if (sh.scallop) {
    const ends = [...tips, H];
    for (let i = 0; i + 1 < ends.length; i++) {
      const [ax, ay] = ends[i], [bx, by] = ends[i + 1];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, d = Math.hypot(bx - ax, by - ay);
      let nx = mx - wrist[0], ny = my - wrist[1];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const k = (1 - sh.scallop) * 0.9 * d;            // how far outside the centre sits
      bites.push([mx + nx * k, my + ny * k, (d / 2) ** 2 + k * k]);
    }
  }
  const inside = (px, py) => inPoly(hull, px, py) && !bites.some(([x, y, r2]) => (px - x) ** 2 + (py - y) ** 2 < r2);
  const xs = hull.map((q) => q[0]), ys = hull.map((q) => q[1]);
  g.fill(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), inside, paint, { shade: 0 });
  const k = sh.scallop ? 1 : 0.8;                             // on a smooth wing the bones stop short of the edge
  for (const i of sh.bones) {
    g.line(wrist[0], wrist[1], lerp(wrist[0], tips[i][0], k), lerp(wrist[1], tips[i][1], k), i === 0 && sh.scallop ? paint.light : paint.dark);
  }
  if (sh.spot && L > 11) {                                    // moth-style eye spot
    const [qx, qy] = rot(sh.spot[0] - sh.wrist[0], sh.spot[1] - sh.wrist[1], a + flex);
    const [px, py] = at(wx + qx, wy + qy);
    g.ellipse(px, py, L * 0.15, L * 0.15, paint.light, { clip: inside });
    g.dot(px, py, paint.deep);
  }
  g.line(S[0], S[1], wrist[0], wrist[1], paint.light);
  g.dot(wrist[0], wrist[1] - 1, paint.light);                 // thumb claw
}

const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed) * lerp(1.12, 0.88, p.span);   // big wings beat slower

export default defineSprite({
  id: 'bat',
  name: 'Bat',
  kind: 'Creature',
  blurb: 'A flapping cave bat. Change the wings, ears and colours to make imps, moths and other flyers.',
  meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'dungeon', 'horror'], gameTypes: ['platformer', 'turn-based-rpg'], view: 'side', words: ['bat', 'vampire', 'imp', 'moth', 'flyer', 'flying', 'fly', 'flap', 'wings', 'cave', 'enemy', 'monster', 'swoop'], license: 'draft' },
  size: [W, W],
  pivot: [CX, CY],
  grounded: false,
  preview: 'fly',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: { fly: [{ sound: 'whoosh', frame: 1, preset: 'Quick swipe', volume: 0.5 }], attack: [{ sound: 'whoosh', frame: 2, preset: 'Heavy swing' }], hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab' }], die: [{ sound: 'enemy-squish', frame: 0, preset: 'Pop', volume: 1 }] },
  params: {
    size: range('Body size', 0.5, { lo: 'Small', hi: 'Chubby' }),
    span: range('Wing span', 0.5, { lo: 'Stubby', hi: 'Wide' }),
    wing: choice('Wing shape', 'classic', ['classic', 'sharp', 'round']),
    ears: range('Ear size', 0.5, { lo: 'Tiny', hi: 'Huge' }),
    eyes: choice('Eyes', 'glow', ['glow', 'cute', 'angry', 'one']),
    fangs: toggle('Fangs', true),
    body: color('Body', FUR[0], FUR),
    membrane: color('Wings', SKIN[0], SKIN),
    eye: color('Eyes', EYES[0], EYES),
    flap: range('Flap size', 0.5, { lo: 'Flutter', hi: 'Big beats', group: 'Motion' }),
    bob: range('Bob', 0.5, { lo: 'Steady', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { label: 'Glide', frames: 8, fps: fps(8), loop: true },
    fly: { frames: 8, fps: fps(14), loop: true },
    attack: { frames: 8, fps: fps(12), loop: false },
    hurt: { frames: 4, fps: fps(9), loop: false },
    die: { frames: 8, fps: fps(10), loop: false },
  },

  render(g, { clip, t, p }) {
    const r = lerp(4.5, 8, p.size);
    const L = lerp(10, 16, p.span);
    const earH = lerp(3, 9.5, p.ears);
    const amp = lerp(0.5, 0.95, p.flap);                   // wing swing, in radians
    const bob = lerp(1, 3, p.bob) * lerp(0.85, 1.2, p.span);

    // a: wing angle (0 = level, + up, - down). flex: extra angle of the finger tips.
    const glideA = (u) => 0.1 + 0.3 * amp * wave(u);
    const glideF = (u) => 0.36 * amp * wave(u, -0.16);
    const a0 = glideA(0), f0 = glideF(0);
    let fold = 0;                                         // 0 = wing fully stretched, 1 = pulled in
    let a = a0, flex = f0, dx = 0, dy = 0, open = 0, sq = 0, mood = p.eyes, flash = false;
    let tuck = 0;                                         // 0..1: wings folded right in against the body (die)
    if (clip === 'idle') {
      a = glideA(t); flex = glideF(t);
      dy = Math.max(1, bob * 0.6) * wave(t, -0.1);          // wings up -> body down
    } else if (clip === 'fly') {
      a = 0.05 + amp * wave(t);
      const hand = wave(t, -0.07);                          // the hand swings a moment after the arm,
      flex = amp * (hand > 0 ? 0.45 : 0.2) * hand;           // and further on the way up than on the way down
      fold = pulse(t, 0.5) ** 2;                            // pulled in on the way up, stretched on the way down
      dy = bob * wave(t, -0.08);
    } else if (clip === 'attack') {
      // push down and rise back, fold the wings up and dive, snap them down on the bite, flap back
      a = keys(t, [[0, a0], [0.15, -0.55], [0.3, 1.1], [0.46, 1.2], [0.58, -0.6], [0.8, 0.55], [1, a0]]);
      flex = keys(t, [[0, f0], [0.15, -0.2], [0.3, 0.3], [0.46, 0.35], [0.58, -0.25], [0.8, 0.2], [1, f0]]);
      dx = keys(t, [[0, 0], [0.2, -3], [0.5, 4], [0.6, 4], [0.76, 1], [1, 0]]);
      dy = keys(t, [[0, 0], [0.2, -4], [0.5, 5], [0.62, 4], [1, 0]]);
      open = keys(t, [[0, 0], [0.25, 0.4], [0.42, 1], [0.55, 1], [0.62, 0], [1, 0]]);
      sq = keys(t, [[0, 0], [0.2, -0.08], [0.45, 0.14], [0.65, 0], [1, 0]]);
      fold = keys(t, [[0, 0], [0.3, 0.7], [0.48, 0.8], [0.58, 0], [1, 0]]);
      if (t > 0.15 && t < 0.8) mood = p.eyes === 'one' ? 'one' : 'angry';
    } else if (clip === 'hurt') {
      a = keys(t, [[0, 0.8], [0.35, 0.95], [0.7, -0.25], [1, a0]]);
      flex = keys(t, [[0, 0.3], [0.35, 0.3], [0.7, -0.2], [1, f0]]);
      dx = keys(t, [[0, -1], [0.35, -5], [1, 0]]);
      dy = keys(t, [[0, 0], [0.35, -2], [1, 0]]);
      sq = keys(t, [[0, 0.2], [0.4, -0.1], [1, 0]]);
      fold = keys(t, [[0, 0.5], [0.35, 0.8], [0.7, 0], [1, 0]]);
      flash = t < 0.2;
      if (t < 0.9) mood = 'hurt';
    } else if (clip === 'die') {
      // 0 the hit (white, wings thrown up), 1 the wings fold, 2 to 4 it drops like a stone, 5 it pops, 6 the puff spreads, 7 a few specks are left
      tuck = keys(t, [[0, 0], [0.143, 0.6], [0.286, 1], [1, 1]]);
      a = keys(t, [[0, 0.9], [0.143, -0.4], [0.286, -1.25], [0.571, -1.4], [1, -1.4]]);
      flex = keys(t, [[0, 0.3], [0.143, -0.2], [0.286, -0.35], [1, -0.35]]);
      fold = tuck;
      // as far down as the frame allows for this body and these wings
      const room = W - 3 - CY - Math.max(r * 1.06 + 3, L * 0.55 * 0.9 + r * 0.3 + 2);
      const drop = Math.min(13, room);
      dy = keys(t, [[0, -1], [0.143, 0], [0.286, drop * 0.3], [0.429, drop * 0.66], [0.571, drop], [1, drop]], (x) => x);
      dx = keys(t, [[0, -1], [0.143, -3], [0.571, -4], [1, -4]]);
      sq = keys(t, [[0, 0.2], [0.143, -0.05], [0.429, -0.14], [0.571, -0.14]]);        // stretched by the fall
      flash = t < 0.1;
      mood = 'hurt';
    }

    const cx = Math.round(CX + dx), cy = Math.round(CY + dy);
    const rx = r * (1 + sq), ry = r * 1.06 * (1 - sq);
    const fur = ramp(p.body), skin = ramp(p.membrane);

    if (clip === 'die' && t > 0.64) {
      // the pop: a white flash and a ring of fur puffs (frame 5), the ring thins as it spreads and bits of wing fall (6),
      // then a few fading specks (7). Kept inside the frame whatever the size.
      const u = clamp((t - 0.64) / 0.36), last = t > 0.93;          // frames 5, 6, 7 are u = 0.2, 0.6, 1
      const reachX = Math.min(lerp(5, 11, u) + r * 0.3, cx - 3, W - 4 - cx), up = Math.min(lerp(5, 11, u) + r * 0.3, cy - 3), down = Math.min(lerp(4, 8, u), W - 4 - cy);
      const bits = [];
      for (let i = 0; i < 8; i++) {
        const ang = (i + 0.5) * Math.PI / 4, sx = Math.sin(ang), sy = -Math.cos(ang);
        bits.push([cx + 0.5 + sx * reachX, cy + 0.5 + sy * (sy < 0 ? up : down) + u * u * 3 * (i % 2), i]);
      }
      if (last) {
        // what is left: single pixels, not outlined, darker as they fade
        for (const [x, y, i] of bits) if (i % 2 === 0 || i === 3) g.dot(x, Math.min(y, W - 3), i % 4 === 0 ? fur.base : i === 3 ? skin.dark : fur.dark);
        return;
      }
      for (const [x, y, i] of bits) {
        const big = lerp(2.1, 0.9, u) * (i % 2 ? 0.8 : 1);
        if (i % 3 === 1 && u > 0.4) g.poly([[x - 2, y], [x + 1.5, y - 1], [x + 0.5, y + 2]], skin, { shade: 0 });   // a scrap of wing
        else g.ellipse(x, y, big, big, fur, { shade: 0 });
      }
      if (u < 0.4) {
        g.ellipse(cx + 0.5, cy + 0.5, r * 0.55, r * 0.55, fur.light, { shade: 0 });
      }
      g.outline(INK);
      if (u < 0.4) {
        // the flash in the middle, drawn after the outline so it is light, not ink
        g.ellipse(cx + 0.5, cy + 0.5, Math.max(1.5, r * 0.4), Math.max(1.5, r * 0.4), '#ffffff', { shade: 0 });
        for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.line(cx + sx * (r * 0.4 + 1), cy + sy * (r * 0.4 + 1), cx + sx * (r * 0.4 + 2.5), cy + sy * (r * 0.4 + 2.5), '#ffffff');
      }
      return;
    }

    const Ln = L * (1 - 0.2 * fold) * (1 - 0.3 * tuck);
    // wings: far one (on the right, the way it faces) first and darker
    wing(g, [cx + rx * 0.5, cy - ry * 0.25], [cx + rx * 0.35, cy + ry * 0.6], 1, Ln * 0.88, a, flex, p.wing, farRamp(p.membrane));
    wing(g, [cx - rx * 0.6, cy - ry * 0.25], [cx - rx * 0.45, cy + ry * 0.6], -1, Ln, a, flex, p.wing, skin);

    // ears: behind the top of the body, tips lag the bob a little
    const lag = clip === 'fly' || clip === 'idle' ? Math.round(wave(t, -0.3)) : 0;
    const earW = lerp(1.8, 3.2, p.ears);
    const ear = (side, paint, k) => {
      const bx = cx + side * rx * 0.55 + 0.5, by = cy - ry * 0.6;
      const tip = [bx + side * (0.5 + earH * 0.2), by - earH * k + lag * 0.6];
      g.poly([[bx - earW, by + 1.5], [bx + earW, by + 1.5], tip], paint, { outline: INK, shade: 0 });
      if (earH > 5) g.poly([[bx - earW * 0.35, by], [bx + earW * 0.45, by], [tip[0], tip[1] + 2.5]], skin.light);
    };
    ear(1, tone(p.body, -0.6), 0.9);
    ear(-1, fur, 1);

    // feet
    const fy = Math.round(cy + ry);
    g.rect(cx - 2, fy, 1, 2, skin.dark); g.rect(cx + 2, fy, 1, 2, skin.dark);

    // body
    g.ellipse(cx + 0.5, cy + 0.5, rx, ry, fur, { shade: r > 6 ? 2 : 1, light: 1 });

    // face, turned a little to the right
    const ex = cx + Math.round(rx * 0.2), ey = Math.round(cy - ry * 0.15);
    const big = r >= 6;
    const eyeHi = tone(p.eye, 0.9);
    if (mood === 'one') {
      g.ellipse(ex + 1.5, ey + 0.5, 2.6, 2.6, p.eye, { outline: fur.deep });
      g.rect(ex + 1, ey - 1, 1, 3, INK); g.dot(ex + 2, ey - 1, eyeHi);
    } else {
      const lx = ex - 2, rxs = ex + (big ? 2 : 1);
      for (const x of [lx, rxs]) {
        if (mood === 'hurt') {            // squeezed shut: > <
          const o = x === lx ? 0 : 1;
          g.rect(x - 1, ey - 1, 4, 3, fur.deep);
          g.dot(x + o, ey - 1, p.eye); g.dot(x + 1 - o, ey, p.eye); g.dot(x + o, ey + 1, p.eye);
          continue;
        }
        if (mood === 'cute') {
          // tall dark eye with a sparkle on top and a glint of the eye colour below
          g.rect(x, ey - 1, 2, 3, INK, { outline: brightness(p.body) > 0.55 ? fur.dark : fur.light });
          g.dot(x + 1, ey - 1, '#ffffff'); g.dot(x, ey + 1, p.eye);
          continue;
        }
        g.rect(x, ey, 2, 2, p.eye, { outline: fur.deep });
        g.dot(x + 1, ey, eyeHi);
        if (mood === 'angry') {            // slanted brows: inner ends low
          const inner = x === lx ? x + 1 : x, outer = x === lx ? x : x + 1;
          g.dot(inner, ey, INK); g.dot(outer, ey - 1, INK); g.dot(inner, ey - 1, INK);
        }
      }
    }
    // mouth and fangs
    const mx = ex + 1, my = ey + (mood === 'one' ? 4 : 3);
    const fang = big ? 2 : 1;
    if (open > 0.3) {
      const oh = Math.round(lerp(1, big ? 3 : 2, open));
      g.rect(mx - 2, my, 4, oh, '#5a1626');
      if (oh > 1) g.rect(mx - 1, my + oh - 1, 2, 1, '#e0607a');
      if (p.fangs) { g.rect(mx - 2, my, 1, Math.min(oh, fang), '#ffffff'); g.rect(mx + 1, my, 1, Math.min(oh, fang), '#ffffff'); }
    } else {
      g.rect(mx - 1, my, 2, 1, fur.deep);
      if (p.fangs) {
        if (fang > 1) g.rect(mx - 1, my + 1, 2, 1, fur.dark);       // keeps pale fangs visible on pale fur
        g.rect(mx - 2, my, 1, fang, '#ffffff'); g.rect(mx + 1, my, 1, fang, '#ffffff');
      }
    }

    if (flash) g.tint('#ffffff');
    g.outline(INK);

    // bite snap
    if (clip === 'attack' && t > 0.52 && t < 0.64) {
      const sx = cx + Math.round(rx) + 2, sy = my;
      g.line(sx, sy - 2, sx + 2, sy - 3, '#ffffff'); g.line(sx + 1, sy, sx + 3, sy, '#ffffff'); g.line(sx, sy + 2, sx + 2, sy + 3, '#ffffff');
    }
  },
});
