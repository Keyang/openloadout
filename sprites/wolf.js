// Wolf: a four-legged canine seen from the side. There is no four-legged rig,
// so the body is built here from shapes: one merged body shape, one merged head
// shape, a chain of capsules for the tail, and four two-bone legs solved with
// ik2 so the paws stay planted while the body moves above them.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, wave, keys, clamp, fract, smooth, ik2, reach, dir, PI } from '../engine/motion.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';

const W = 64, H = 48, GY = 43, CX = 27;
const FUR = ['#8a93a6', '#5b6272', '#d9772b', '#a8502a', '#8a5a3a', '#c9a26b', '#e8e6e0', '#3a3644'];
const MARK = ['#f0ead8', '#ffffff', '#c9ccd6', '#e6c796', '#3a3350', '#6b4a3a'];
const EYES = ['#f2c230', '#e08a2c', '#7fd0f0', '#8fd16a', '#e2574c', '#f0ead8'];
const NOSE = '#2a2030', MOUTH = '#8a2638', TOOTH = '#ffffff';

// ---- shape helpers (the framework has no way to merge shapes into one shaded
// ---- silhouette, so these build "inside" tests to pass to g.fill) ----------
const ell = (cx, cy, rx, ry) => (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
const cap = (x0, y0, x1, y1, r0, r1) => {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
  return (px, py) => {
    const k = clamp(((px - x0) * dx + (py - y0) * dy) / len2);
    const ex = px - (x0 + dx * k), ey = py - (y0 + dy * k), r = r0 + (r1 - r0) * k;
    return ex * ex + ey * ey <= r * r;
  };
};
const tri = (pts) => (px, py) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const any = (...fs) => (px, py) => { for (const f of fs) if (f(px, py)) return true; return false; };
const cyc = (t, ks) => keys(fract(t), ks);            // looping keyframes: first and last value must match

// ---- sizes ------------------------------------------------------------------
function dims(p) {
  const rc = lerp(4.2, 6.0, p.size);                   // chest radius
  const d = {
    rc, rh: rc * 0.84,                                 // haunch radius
    D: lerp(10, 13.5, p.size),                         // shoulder-to-hip distance
    H: lerp(9, 15.5, p.legs) * lerp(0.95, 1.05, p.size),   // shoulder joint height above the ground
    R: lerp(3.9, 5.0, p.size),                         // skull radius
    snout: lerp(2, 6.5, p.snout),
    neck: lerp(5.5, 7.2, p.size),
    fl: p.fluff,
    legW: p.size > 0.8 ? 3 : 2,
  };
  d.footY = GY - 1 - (d.legW % 2) * 0.5;
  d.shY = GY - d.H;                                    // rest height of the shoulder joint
  d.syc = d.shY - rc * 0.35;                           // rest chest centre
  d.hyc = d.syc - rc + d.rh + 0.5;                     // rest haunch centre (back slopes down a touch)
  d.hipY = d.hyc + d.rh * 0.3;
  d.frontLen = (d.footY - d.shY) / 0.985;            // front legs stand almost straight
  d.hindLen = (d.footY - d.hipY) / 0.92;             // hind legs keep a bent hock
  d.hindBack = d.hindLen * 0.27;                     // so the hind paw rests behind the hip
  return d;
}

// ---- poses ------------------------------------------------------------------
// Feet are [forward, lift] offsets from each paw's resting spot on the ground.
function pose(clip, t, p, d) {
  const P = {
    bx: 0, by: 0, hip: 0, sh: 0, stretch: 0, arch: 0,
    neck: 0.74 * PI, neckLen: 0, snout: -0.2, jaw: 0, ear: 0, flick: 0,
    tailA: 0, tailCurl: 0, blink: false, squint: false, flash: false, snap: false,
    nh: [0, 0], nf: [0, 0], fh: [0, 0], ff: [0, 0],
  };
  const bounce = lerp(0.5, 1.5, p.bounce);
  const wag = lerp(0.12, 1.5, p.wag), wagRate = p.wag > 0.6 ? 2 : 1;
  const reachK = (d.H / 11) * lerp(0.6, 1.3, p.stride);   // longer legs and bigger steps cover more ground

  if (clip === 'idle') {
    P.by = 0.55 + 0.55 * wave(t);
    P.neck += 0.035 * wave(t, -0.15);
    P.tailA = 0.24 * wag * wave(t * wagRate, -0.1);
    P.tailCurl = 0.05 * wag * wave(t * wagRate, -0.3);
    P.flick = t >= 0.5 && t < 0.62 ? 1 : 0;
    P.blink = t >= 0.75 && t < 0.87;
  } else if (clip === 'walk') {
    const s = 3.6 * reachK, up = lerp(2, 3.8, p.bounce);
    const step = (ph) => {
      const u = fract(t + ph), duty = 0.6;
      if (u < duty) return [lerp(s, -s, u / duty), 0];
      const v = (u - duty) / (1 - duty);
      return [lerp(-s, s, smooth(v)), Math.sin(PI * v) * up];
    };
    P.nh = step(0); P.nf = step(0.75); P.fh = step(0.5); P.ff = step(0.25);
    P.hip = 0.8 * bounce * wave(t * 2, 0.1);
    P.sh = 0.8 * bounce * wave(t * 2, 0.35);
    P.by = 0.6;
    P.neck = 0.66 * PI + 0.04 * wave(t * 2, 0.2);
    P.snout = -0.25;
    P.tailA = -0.1 + 0.16 * wag * wave(t, -0.1);
    P.tailCurl = 0.05 * wag * wave(t, -0.3);
  } else if (clip === 'run') {
    // rotary gallop: 0 gathered (hind paws land under the body) → 0.25 push off →
    // 0.5 stretched in the air, front paws reaching → 0.75 front paws carry the body
    const k = reachK;
    const front = (u) => [
      k * cyc(u, [[0, -4], [0.2, -1], [0.375, 6], [0.5, 11], [0.625, 7], [0.875, -3], [1, -4]]),
      cyc(u, [[0, 4.5], [0.25, 5], [0.5, 5], [0.62, 0], [0.85, 0], [1, 4.5]]),
    ];
    const hind = (u) => [
      k * cyc(u, [[0, 5.5], [0.125, 3], [0.3, -5], [0.5, -9], [0.7, -3], [0.9, 5], [1, 5.5]]),
      cyc(u, [[0, 0.5], [0.08, 0], [0.3, 0], [0.5, 3.5], [0.72, 5.5], [0.92, 2], [1, 0.5]]),
    ];
    P.nf = front(t); P.ff = front(t - 0.07); P.nh = hind(t); P.fh = hind(t - 0.07);
    P.by = bounce * cyc(t, [[0, 0.5], [0.25, -0.5], [0.5, -3], [0.75, -1], [1, 0.5]]);
    P.sh = cyc(t, [[0, -1], [0.25, -2], [0.5, 0], [0.75, 1.5], [1, -1]]);
    P.hip = cyc(t, [[0, 1], [0.25, 0.5], [0.5, 0], [0.75, -1.5], [1, 1]]);
    P.stretch = k * cyc(t, [[0, -3], [0.25, 0], [0.5, 3.5], [0.75, 0], [1, -3]]);
    P.arch = cyc(t, [[0, 1.6], [0.25, 0], [0.5, -0.6], [0.75, 0], [1, 1.6]]);
    P.neck = PI * cyc(t, [[0, 0.63], [0.25, 0.6], [0.5, 0.55], [0.75, 0.6], [1, 0.63]]);
    P.neckLen = cyc(t, [[0, -0.5], [0.5, 1], [1, -0.5]]);
    P.snout = -0.1;
    P.ear = 0.7;
    P.tailA = -0.5 + 0.2 * wag * wave(t, -0.2) + 0.15 * wave(t, 0.3);
    P.tailCurl = -0.04 + 0.06 * wave(t, 0.05);
  } else if (clip === 'attack') {
    const lunge = Math.min(4.5, d.H * 0.4);
    P.bx = keys(t, [[0, 0], [0.26, -2.5], [0.44, lunge], [0.6, lunge], [1, 0]]);
    P.by = 0.55 + keys(t, [[0, 0], [0.26, 2], [0.44, 0.5], [0.6, 0.5], [1, 0]]);
    P.sh = keys(t, [[0, 0], [0.26, 1.5], [0.44, -0.5], [0.62, 0.5], [1, 0]]);
    P.hip = keys(t, [[0, 0], [0.26, 0.5], [0.44, 0], [1, 0]]);
    P.neck = PI * keys(t, [[0, 0.74], [0.26, 0.66], [0.44, 0.54], [0.6, 0.55], [1, 0.74]]);
    P.neckLen = keys(t, [[0, 0], [0.26, -1.2], [0.44, 2], [0.6, 1.5], [1, 0]]);
    P.snout = keys(t, [[0, -0.2], [0.26, -0.3], [0.42, 0.25], [0.56, -0.05], [1, -0.2]]);
    P.jaw = keys(t, [[0, 0], [0.2, 0], [0.38, 1], [0.5, 1], [0.56, 0], [1, 0]]);
    P.stretch = keys(t, [[0, 0], [0.26, -2], [0.44, 2.5], [0.6, 1.5], [1, 0]]);
    P.snap = t > 0.52 && t < 0.66;
    P.ear = keys(t, [[0, 0], [0.26, 0.9], [0.62, 0.9], [1, 0]]);
    P.tailA = keys(t, [[0, 0], [0.26, -0.55], [0.44, -0.35], [0.7, -0.2], [1, 0]]);
    const fx = (o) => keys(t, [[0, 0], [0.3 + o, 0], [0.46 + o, lunge], [0.66, lunge], [0.9, 0], [1, 0]]);
    const fl = (o) => keys(t, [[0, 0], [0.3 + o, 0], [0.38 + o, 3], [0.48 + o, 0], [0.66, 0], [0.78, 2], [0.9, 0], [1, 0]]);
    P.nf = [fx(0), fl(0)]; P.ff = [fx(0.03), fl(0.03)];
  } else if (clip === 'hurt') {
    P.flash = t < 0.2;
    P.bx = keys(t, [[0, -1], [0.35, -4], [1, 0]]);
    P.by = 0.55 + keys(t, [[0, 1], [0.35, 2], [0.7, 0.5], [1, 0]]);
    P.sh = keys(t, [[0, -0.5], [0.35, -1.5], [1, 0]]);
    P.neck = PI * keys(t, [[0, 0.78], [0.35, 0.86], [1, 0.74]]);
    P.snout = keys(t, [[0, 0], [0.35, 0.3], [1, -0.2]]);
    P.jaw = keys(t, [[0, 0.3], [0.35, 0.55], [0.75, 0], [1, 0]]);
    P.ear = keys(t, [[0, 1], [0.7, 1], [1, 0]]);
    P.tailA = keys(t, [[0, 0.3], [0.35, 0.6], [1, 0]]);
    P.tailCurl = keys(t, [[0, 0.05], [0.35, 0.12], [1, 0]]);
    P.squint = t < 0.8;
  }
  return P;
}

export default defineSprite({
  id: 'wolf',
  name: 'Wolf',
  kind: 'Creature',
  blurb: 'A four-legged hunter. Reshape it into a wolf, a fox or a husky.',
  meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'turn-based-rpg'], view: 'side', words: ['wolf', 'fox', 'husky', 'dog', 'beast', 'animal', 'enemy', 'monster', 'hunter', 'predator', 'run', 'bite', 'pounce'], license: 'draft' },
  size: [W, H],
  pivot: [CX, GY],
  grounded: true,
  preview: 'run',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: { walk: [{ sound: 'footstep-gravel', frame: 0, preset: 'Sneaking' }, { sound: 'footstep-gravel', frame: 4, preset: 'Sneaking' }], run: [{ sound: 'footstep-gravel', frame: 1, preset: 'Boots' }, { sound: 'footstep-gravel', frame: 5, preset: 'Boots' }], attack: [{ sound: 'whoosh', frame: 2, preset: 'Quick swipe' }, { sound: 'punch', frame: 4, preset: 'Light jab' }], hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab' }] },
  params: {
    size: range('Body size', 0.55, { lo: 'Small', hi: 'Big' }),
    legs: range('Leg length', 0.55, { lo: 'Short', hi: 'Long' }),
    snout: range('Snout', 0.55, { lo: 'Short', hi: 'Long' }),
    ears: choice('Ears', 'pointy', ['pointy', 'tall', 'floppy']),
    tail: choice('Tail', 'hanging', ['hanging', 'brush', 'curled']),
    fluff: range('Fluffiness', 0.6, { lo: 'Sleek', hi: 'Fluffy' }),
    markings: choice('Markings', 'belly', ['plain', 'belly', 'socks', 'mask']),
    fur: color('Fur', FUR[0], FUR),
    belly: color('Belly and markings', MARK[0], MARK, { when: { markings: ['belly', 'socks', 'mask'] } }),
    eyes: color('Eyes', EYES[0], EYES),
    stride: range('Step size', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    bounce: range('Bounce', 0.5, { lo: 'Smooth', hi: 'Bouncy', group: 'Motion' }),
    wag: range('Tail wag', 0.4, { lo: 'Still', hi: 'Waggy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 6 * lerp(0.65, 1.45, p.speed), loop: true },
    walk: { frames: 8, fps: (p) => 9 * lerp(0.65, 1.45, p.speed), loop: true },
    run: { frames: 8, fps: (p) => 14 * lerp(0.65, 1.45, p.speed), loop: true },
    attack: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    hurt: { frames: 4, fps: (p) => 9 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, p }) {
    const d = dims(p);
    const P = pose(clip, t, p, d);
    const fur = ramp(p.fur), furFar = farRamp(p.fur);
    const mk = ramp(p.belly), mkFar = farRamp(p.belly);
    const hasBelly = p.markings !== 'plain';
    const hasSocks = p.markings === 'socks' || p.markings === 'mask';
    const hasMask = p.markings === 'mask';
    const { rc, rh, R, fl } = d;
    const full = (inside, paint, opt) => g.fill(0, 0, W, H, inside, paint, opt);

    // keep the nose inside the frame at the biggest sizes: hold the lunge back by whatever would not fit
    const noseX = CX + P.bx + d.D / 2 + P.stretch / 2 + rc * 0.3 + Math.sin(P.neck) * (d.neck + P.neckLen)
      + R * 0.35 + Math.sin(PI / 2 + P.snout) * (R * 0.5 + d.snout) + (P.snap ? 5.5 : 3.5);
    if (noseX > W - 1.5) P.bx -= noseX - (W - 1.5);

    // ---- skeleton ----
    const hx = CX + P.bx - d.D / 2 - P.stretch / 2, sx = CX + P.bx + d.D / 2 + P.stretch / 2;
    const syc = d.syc + P.by + P.sh, hyc = d.hyc + P.by + P.hip;
    const hipJ = [hx - 0.5, hyc + rh * 0.3], shJ = [sx + 0.5, syc + rc * 0.35];
    const restH = CX - d.D / 2, restS = CX + d.D / 2;
    const foot = (x, o) => [x + o[0], d.footY - o[1], o[1]];

    // ---- tail: a chain of capsules ----
    const style = p.tail;
    const tailLen = style === 'brush' ? lerp(9.5, 12, p.size) : style === 'curled' ? lerp(8, 10, p.size) : lerp(9.5, 12, p.size);
    const tailR = lerp(1.3, 2.7, fl) * lerp(0.9, 1.1, p.size) * (style === 'brush' ? 1.2 : 1);
    const prof = style === 'brush' ? [[0, 0.5], [0.6, 1.15], [1, 0.5]] : style === 'curled' ? [[0, 0.7], [0.5, 1], [1, 0.6]] : [[0, 0.6], [0.55, 1], [1, 0.45]];
    let ta = (style === 'brush' ? -1.25 : style === 'curled' ? -2.3 : -0.95) + P.tailA * (style === 'curled' ? 0.5 : 1);
    const tcurl = (style === 'brush' ? -0.06 : style === 'curled' ? -0.5 : 0.1) + P.tailCurl;
    const N = 6, ta0 = ta;
    let tp, tLen = tailLen;
    for (let tries = 0; tries < 4; tries++) {            // shorten the tail if it would leave the frame
      tp = [[hx - rh * 0.7, hyc - rh * 0.5]]; ta = ta0;
      for (let i = 0; i < N; i++) { const q = tp[i]; tp.push(reach(q[0], q[1], ta, tLen / N)); ta += tcurl; }
      const minX = Math.min(...tp.map((q) => q[0])) - tailR * 1.15, minY = Math.min(...tp.map((q) => q[1])) - tailR * 1.15;
      if (minX >= 2.5 && minY >= 2.5) break;
      tLen *= 0.85;
    }
    const segs = [];
    for (let i = 0; i < N; i++) segs.push(cap(tp[i][0], tp[i][1], tp[i + 1][0], tp[i + 1][1], tailR * keys(i / N, prof, (x) => x), tailR * keys((i + 1) / N, prof, (x) => x)));
    const tailShape = any(...segs), tipShape = any(segs[N - 1], segs[N - 2]);
    const drawTail = () => {
      full(tailShape, fur);
      if (hasSocks) full(tailShape, mk, { clip: tipShape });
    };

    // ---- legs ----
    // A planted leg stretches or shortens a little (like a real leg flexing) so the paw
    // stays on its spot and the leg keeps its standing shape while the body moves.
    const leg = (anchor, target, len, stand, bend, thick, upper, lower) => {
      const dist = Math.hypot(target[0] - anchor[0], target[1] - anchor[1]);
      const L = lerp(clamp(dist / stand, len * 0.86, len * 1.14), len, clamp(target[2] / 1.5));
      const k = ik2(anchor[0], anchor[1], target[0], target[1], L * 0.56, L * 0.44, bend);
      const w = d.legW;
      g.capsule(anchor[0], anchor[1], k.mid[0], k.mid[1], w / 2 + thick, w / 2 + 0.1, upper, { shade: 0 });
      g.limb(k.mid[0], k.mid[1], k.end[0], k.end[1], w, lower);
      const px = w % 2 ? Math.floor(k.end[0]) - 1 : Math.round(k.end[0]) - 1;
      const py = w % 2 ? Math.floor(k.end[1]) : Math.round(k.end[1]) - 1;
      g.rect(px, py, w + 1, 2, lower, { shade: 0 });
    };

    if (style !== 'curled') drawTail();
    // far legs, shifted a little forward so all four read
    leg([hipJ[0] + 2.5, hipJ[1] - 0.5], foot(restH + 3.5 - d.hindBack, P.fh), d.hindLen, 0.92, -1, 1.3, furFar, hasSocks ? mkFar : furFar);
    leg([shJ[0] + 2, shJ[1] - 0.5], foot(restS + 3.5, P.ff), d.frontLen, 0.985, 1, 0.5, furFar, hasSocks ? mkFar : furFar);

    // ---- body: haunch + waist + chest + neck as one shaded shape ----
    const nb = [sx + rc * 0.3, syc - rc * 0.45];
    const hc = reach(nb[0], nb[1], P.neck, d.neck + P.neckLen);
    const topH = hyc - rh, topS = syc - rc;
    const wr = rh * 0.74, wx = lerp(hx, sx, 0.42), wy = lerp(topH, topS, 0.42) + wr + 0.3 - P.arch;
    const parts = [
      ell(hx, hyc, rh + 0.8, rh), ell(sx, syc, rc, rc + 0.2),
      cap(hx, hyc - 0.3, wx, wy, rh * 0.9, wr), cap(wx, wy, sx, syc - 0.3, wr, rc * 0.95),
      cap(nb[0], nb[1], hc[0], hc[1], rc * 0.82 + fl * 0.7, R * 0.85 + fl * 0.6),
    ];
    if (fl > 0.15) {
      parts.push(tri([[sx + rc * 0.45, syc - rc * 0.2], [sx + rc * 0.9 + fl * 1.6, syc + rc * 0.45 + fl * 0.5], [sx + rc * 0.2, syc + rc * 0.9]]));
      parts.push(tri([[hx - rh * 0.6, hyc], [hx - rh - 0.8 - fl * 1.2, hyc + rh * 0.7 + fl], [hx - rh * 0.2, hyc + rh * 0.9]]));
    }
    const body = any(...parts);
    full(body, fur, { shade: 2, light: 1 });
    if (hasBelly) {
      const [nx, ny] = dir(P.neck);
      const inBelly = (px, py) => {
        if (px <= sx + rc * 0.25) return py > lerp(hyc + rh * 0.3, syc + rc * 0.35, clamp((px - (hx - rh)) / (sx - hx + rh)));
        return (px - nb[0]) * -ny + (py - nb[1]) * nx > rc * 0.3;      // the throat side of the neck
      };
      full(body, mk, { shade: 1, clip: inBelly });
    }
    if (style === 'curled') drawTail();

    // near legs
    leg(hipJ, foot(restH - 0.5 - d.hindBack, P.nh), d.hindLen, 0.92, -1, 1.3, fur, hasSocks ? mk : fur);
    leg(shJ, foot(restS + 0.5, P.nf), d.frontLen, 0.985, 1, 0.5, fur, hasSocks ? mk : fur);

    // ---- head ----
    const [hcx, hcy] = hc;
    const sa = PI / 2 + P.snout, [ux, uy] = dir(sa);
    const s0 = [hcx + R * 0.35, hcy + R * 0.2], sLen = R * 0.5 + d.snout;
    const s1 = [s0[0] + ux * sLen, s0[1] + uy * sLen];
    const r0 = R * 0.6, r1 = R * 0.4;
    const earA = PI + 0.15 + P.ear * 1.15 + P.flick * 0.45;
    const ear = (bx, by, paint, inner) => {
      if (p.ears === 'floppy') return;
      const h = p.ears === 'tall' ? R * 1.3 + 3 : R * 1.0 + 2, w = p.ears === 'tall' ? R * 0.55 : R * 0.5;
      const [ex, ey] = dir(earA);
      const tip = [bx + ex * h, by + ey * h];
      g.poly([[bx + ey * w, by - ex * w], [bx - ey * w, by + ex * w], tip], paint);
      if (inner) g.poly([[bx + ey * w * 0.4 + ex, by - ex * w * 0.4 + ey], [bx - ey * w * 0.4 + ex, by + ex * w * 0.4 + ey], [bx + ex * h * 0.65, by + ey * h * 0.65]], inner);
    };
    ear(hcx + R * 0.5, hcy - R * 0.7, furFar);                        // far ear

    // open mouth: dark inside, then the lower jaw
    const ja = sa - P.jaw * 0.9, [jx, jy] = dir(ja);
    const j0 = [hcx + R * 0.2, hcy + R * 0.55], j1 = [j0[0] + jx * (sLen - 0.5), j0[1] + jy * (sLen - 0.5)];
    if (P.jaw > 0.15) g.poly([s0, s1, j1, j0], MOUTH);
    g.capsule(j0[0], j0[1], j1[0], j1[1], 1.2, 0.9, hasBelly ? mk : fur, { shade: 0 });

    const headParts = [ell(hcx, hcy, R + 0.3, R - 0.2), cap(s0[0], s0[1], s1[0], s1[1], r0, r1)];
    if (fl > 0.15) headParts.push(tri([[hcx - R * 0.1, hcy + R * 0.55], [hcx - R * 0.9 - fl * 1.5, hcy + R * 0.75 + fl * 1.2], [hcx - R * 0.85, hcy - R * 0.1]]));
    const head = any(...headParts);
    full(head, fur);
    full(head, fur.base, { clip: (px, py) => px < hcx + R * 0.2 && py < hcy + R * 0.35 });   // no shadow line up the back of the head
    if (hasBelly) {
      const below = (px, py) => (px - s0[0]) * -uy + (py - s0[1]) * ux;   // distance below the snout line
      const chin = (px, py) => px > hcx - R * 0.2 && below(px, py) > 0.5;
      const mask = (px, py) => (px > hcx + R * 0.1 && below(px, py) > -0.3) || py > hcy + 0.6;
      full(head, mk, { clip: hasMask ? mask : chin });
    }
    if (P.jaw > 0.4) { g.dot(s1[0] - 1, s1[1] + r1 + 0.6, TOOTH); g.dot(j1[0] - 1.5, j1[1] - 1.6, TOOTH); }
    g.ellipse(s1[0] + r1 * 0.5, s1[1] - r1 * 0.3, 1.1, 1.1, NOSE);

    // eye
    const ex = Math.round(hcx + R * 0.3), ey = Math.round(hcy - R * 0.25);
    if (P.blink || P.squint) g.rect(ex, ey, 2, 1, fur.deep);
    else { g.dot(ex, ey, p.eyes); g.dot(ex + 1, ey, INK); g.rect(ex, ey - 1, 2, 1, fur.dark); }
    if (hasMask) g.dot(ex, ey - 2, mk.base);

    // near ear
    if (p.ears === 'floppy') {
      const a = -0.5 - P.ear * 0.5 - P.flick * 0.3, b = [hcx - R * 0.5, hcy - R * 0.55];
      const e = reach(b[0], b[1], a, R * 0.9 + 1.5);
      g.capsule(b[0], b[1], e[0], e[1], 2, 1.4, ramp(tone(p.fur, -0.6)), { outline: fur.dark });
    } else {
      ear(hcx - R * 0.5, hcy - R * 0.65, fur, tone(p.fur, -0.75));
    }

    if (P.flash) g.tint('#ffffff');
    g.outline(INK);

    // bite: a little snap mark in front of the teeth, not outlined
    if (P.snap) {
      g.dot(s1[0] + 3, s1[1] - 3, TOOTH); g.dot(s1[0] + 4, s1[1], TOOTH); g.dot(s1[0] + 3, s1[1] + 3, TOOTH);
    }
  },
});
