// Emote balloons (core-sprites-3, batch K24): the nine marks of engine/emotes.js inside a small pale balloon with a
// tail, for games where a reaction should read as speech.
//   idle   8 frames, loop: the mark's own motion inside a still balloon
//   pop    6 frames: 0 to 2 the balloon grown from its tail's tip (bubbleGrow), 3 the mark at 0.6, 4 at 1.15, 5 at rest
//   close  6 frames: the mark gone on frame 1, the balloon shrinking back into its tip; the last frame a 2x2 dot
// The balloon: speechBubble round or shout with no tail and a bubbleTail under it, all at border 0 (a 1 px line band)
// and `tight` (the balloon is never stretched), its bottom line on row 25 and the tail's point on row 30 (the pivot's
// row); or a cloud, puffCloud of engine/puff-cloud.js (round bumps 2 px deep on every edge, with bumpCloud's trail of
// three separate puffs stepping down and out under the left half, from the right half to the middle, or under the
// right half), its bottom row on 22 and its last puff's ink on row 30.
// SIZE (the spec row gives each style its range): the round balloon 22 to 28 px wide and 20 to 24 tall. A shout's
// spikes reach 3 px out of its body on each side, so its body is 22 to 24 wide and 20 to 22 tall. A cloud, bumps
// included, is 22 to 28 wide and always 22 tall: its trail needs the 8 rows under it, and a shorter cloud has no
// room for a size 10 mark and its motion (sleep and swirl are 14 to 15 px tall with their ink).
// The mark: drawSmallEmote of engine/emote-small.js with bounce 0 (the body in the Mark colour, a 1 px ink line):
// delight redrawn so it reads at 10 to 14 px (a four-point star with four rays clear of it), anger drawn by drawAngerPinwheel of engine/anger-pinwheel.js (four bent 1 px vein strokes in
// a pinwheel round a plus-shaped gap, arms 3 px or longer on every frame, throbbing by each stroke stepping 1 px round
// the gap, never by thickening: no 2x2 block of colour, so it never reads as four dots), dizzy by drawDizzySwirl of
// engine/dizzy-swirl.js (the spiral held with its outer end on the left, wrapping its curl, wobbling instead of
// turning: the spiral and the star each bob 1 px in turn; turned with its end up it read as the digit 6), the other six drawEmote's,
// the same nine marks as emote-marks; sleep also takes the helper's `apart`, so its small Zs do not run together.
// Size M of the spec's Fit, lowered while any frame (the idle motion and the pop's 0.6 and 1.15 sizes) would come
// within 1 px of the line band; where a mark has no bigger shape that fits (the Zs of sleep keep their letters over a
// size or two), the pop's frame 4 is the mark at rest risen 1 px.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { lerp } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { skinSwatches } from '../engine/ui-skins.js';
import { speechBubble, bubbleTail, bubbleGrow } from '../engine/bubbles.js';
import { BUMP_TRAIL } from '../engine/bump-cloud.js';
import { puffCloud } from '../engine/puff-cloud.js';
import { drawSmallEmote } from '../engine/emote-small.js';
import { drawAngerPinwheel } from '../engine/anger-pinwheel.js';
import { drawDizzySwirl } from '../engine/dizzy-swirl.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [32, 32];
const BOTTOM = 25;                                       // the balloon's bottom line (round, shout); the tail ends 5 rows lower
const SW = skinSwatches('paper', {
  face: [P.cream, P.skin, P.steel, P.goblin, H.wheat],
  frame: [P.cavern, P.soil, D.plate, H.bandit],
});
const DIR = { left: 'down-left', middle: 'down', right: 'down-right' };
const CLOUD_BOTTOM = SIZE[1] - 2 - BUMP_TRAIL.rows;      // a cloud's bottom row: its trail's last ink row on 30

// The balloon at full size for this look: where it goes, and a function that draws it (with its tail) into any box.
function layout(p) {
  const round = p.style === 'round';
  // see SIZE in the header: a shout's body is at most 24 wide and 22 tall in this frame
  const bw = Math.round(lerp(22, round ? 28 : 24, p.size));
  const bh = Math.round(lerp(20, round ? 24 : 22, p.size));
  const cw = Math.round(lerp(23, 28, p.size)), ch = 22;    // a cloud: see SIZE in the header
  const col = { face: p.body, frame: p.frame, border: 0, tight: true };
  if (p.style === 'cloud') {
    // the cloud, bumps included, 23 to 28 wide and 22 tall, its bottom row on CLOUD_BOTTOM; the trail's three puffs
    // hang in the 8 rows under it: down-left from the left half (its last puff by the frame's left edge), down-left
    // from the right half to end under the middle (first puff at column 26, last at 16), or down-right
    const box = { x: 16 - (cw >> 1), y: CLOUD_BOTTOM + 1 - ch, w: cw, h: ch + BUMP_TRAIL.rows };
    const trail = { left: { trail: 'down-left' }, middle: { trail: 'down-left', trailX: 26 }, right: { trail: 'down-right' } }[p.tail];
    const draw = (g, r, withTrail = true) => withTrail
      ? puffCloud(g, r.x, r.y, r.w, r.h - BUMP_TRAIL.rows, { ...col, ...trail })
      // growing, with no trail yet: the cloud's share of the box
      : puffCloud(g, r.x, r.y, r.w, Math.max(1, Math.round((r.h * ch) / box.h)), { ...col, trail: 'none' });
    return { box, draw };
  }
  // a shout's spikes reach 3 px out of its body's corners: the body stays in columns 4 to 27 and rows 4 to 25
  const shout = p.style === 'shout', pad = shout ? 3 : 0;
  const box = { x: 16 - (bw >> 1) - pad, y: BOTTOM + 1 - bh - pad, w: bw + 2 * pad, h: bh + 2 * pad };
  const draw = (g, r, tail = true) => {
    const out = speechBubble(g, r.x, r.y, r.w, r.h, { ...col, style: p.style, tail: 'none' });
    if (!tail) return out;
    // under the body's left quarter, middle or right quarter; a shout's quarter clears its corner spikes
    const B = out.body, q = Math.max(Math.round(B.w / 4), shout ? 9 : 0);
    const cx = p.tail === 'left' ? B.x + q : p.tail === 'right' ? B.x + B.w - 1 - q : B.x + (B.w >> 1);
    const t = bubbleTail(g, cx, B.y + B.h - 2, { dir: DIR[p.tail], size: 5, face: p.body, frame: p.frame });
    return { ...out, tip: t.tip };
  };
  return { box, draw };
}

// ---- the marks ------------------------------------------------------------------------------------------------------
// The mark centred on cx, its bottom row on by: drawSmallEmote (the body in colour and a 1 px ink line), bounce 0,
// and `apart` (the helper's option for rimless sleep: an ink pixel where two Zs touch, so the small Zs stay three letters).
const drawMark = (g, kind, cx, by, size, t, colour) => (kind === 'anger'
  ? drawAngerPinwheel(g, cx, by, size, { t, colour })
  : kind === 'swirl'
    ? drawDizzySwirl(g, cx, by, size, { t, colour })
    : drawSmallEmote(g, kind, cx, by, size, { t, bounce: 0, apart: true, colour }));
// How far the mark reaches from (cx, by) over a set of shots [size, t]: { left, right, up, down }.
function reach(kind, shots) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [sz, t] of shots) {
    const g = new Surface(64, 64);
    drawMark(g, kind, 32, 48, sz, t, '#808080');
    const b = g.bounds();
    if (b) { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  }
  return { left: 32 - x0, right: x1 - 32, up: 48 - y0, down: y1 - 48 };
}
const IDLE = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 8);
// The mark for a balloon's inner rectangle: its size (the spec's M, lowered until the idle motion and the pop's small
// frame keep 1 px of face inside inner), where it stands (that reach centred in inner), and the pop's overshoot: the
// biggest size up to 1.15 times that is taller and fits standing 1 px higher (or level, or a step aside), else the mark
// at rest risen 1 px (or, with no row to rise into, level: frame 4 then repeats frame 5).
function fitMark(kind, inner) {
  const W = inner.w - 2, H = inner.h - 2;
  const fits = (r) => r.left + r.right + 1 <= W && r.up + r.down + 1 <= H;
  const inside = (q, x, y) => x - q.left >= inner.x + 1 && x + q.right <= inner.x + inner.w - 2 && y - q.up >= inner.y + 1 && y + q.down <= inner.y + inner.h - 2;
  const M = Math.max(10, Math.min(Math.floor((inner.h - 4) / 1.15), Math.floor((inner.w - 6) / 1.15)));
  for (let s = M; s >= 10; s--) {
    const small = Math.max(10, Math.round(s * 0.6)), r = reach(kind, [...IDLE.map((t) => [s, t]), [small, 0]]);
    if (!fits(r)) continue;
    const cx = inner.x + 1 + r.left + Math.floor((W - (r.left + r.right + 1)) / 2);
    const by = inner.y + 1 + r.up + Math.round((H - (r.up + r.down + 1)) / 2);
    const rest = reach(kind, [[s, 0]]);
    for (let o = Math.round(s * 1.15); o > s; o--) {
      const q = reach(kind, [[o, 0]]);
      if (q.up + q.down <= rest.up + rest.down) continue;           // not taller than the mark at rest: no overshoot
      for (const [dx, dy] of [[0, -1], [0, 0], [-1, -1], [1, -1], [-1, 0], [1, 0], [0, 1]]) {
        if (inside(q, cx + dx, by + dy)) return { size: s, small, cx, by, over: { size: o, cx: cx + dx, by: by + dy } };
      }
    }
    return { size: s, small, cx, by, over: { size: s, cx, by: inside(rest, cx, by - 1) ? by - 1 : by } };
  }
  throw new Error(`emote-bubbles: no room for the ${kind} mark and its pop in ${inner.w}x${inner.h}`);
}
const FITS = new Map();
function fitFor(kind, inner) {
  const key = `${kind} ${inner.x} ${inner.y} ${inner.w} ${inner.h}`;
  if (!FITS.has(key)) FITS.set(key, fitMark(kind, inner));
  return FITS.get(key);
}

// The full balloon with its tail, and where its mark goes.
function balloon(g, p) {
  const L = layout(p), out = L.draw(g, L.box);
  return { ...out, fit: fitFor(p.emote, out.inner) };
}
const markAt = (g, p, at, size, t) => drawMark(g, p.emote, at.cx, at.by, size, t, p.accent);

// One frame of the balloon growing out of its tail's tip: k 0 is a 2x2 dot there, k 1 the full balloon.
function grown(g, p, k) {
  const L = layout(p), full = L.draw(new Surface(...SIZE), L.box);
  if (k >= 1) return L.draw(g, L.box);
  const r = bubbleGrow(L.box, full.tip, k);
  if (r.w < 6 || r.h < 6) { g.rect(r.x, r.y, r.w, r.h, p.frame); return null; }
  // too small for spikes or bumps: it opens as a plain round balloon and takes its own shape once it has room
  if (r.w < 16 || r.h < 14) return speechBubble(g, r.x, r.y, r.w, r.h, { style: 'round', tail: 'none', face: p.body, frame: p.frame, border: 0, corner: 0.5 });
  return L.draw(g, r, false);
}

const OPEN = [0, 0.4, 0.8];                              // pop frames 0 to 2
const SHUT = [1, 1, 0.7, 0.4, 0.15, 0];                  // close frames 0 to 5

export default defineSprite({
  id: 'emote-bubbles',
  name: 'Emote balloons',
  kind: 'Item',
  blurb: 'Nine reaction marks (surprise, question, love, anger, nerves, sleep, a tune, delight, dizziness) in a small pale balloon with a tail that pops open from its tip and shrinks back into it; change the mark, the balloon\'s shape, tail and size, and the colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'top-down-rpg', 'farming-sim', 'puzzle'], view: 'none',
    words: ['emote', 'balloon', 'bubble', 'reaction', 'heart', 'question', 'angry', 'dizzy', 'chat'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [16, 30],
  grounded: false,
  params: {
    emote: choice('Emote', 'exclaim', [
      { value: 'exclaim', label: '!' }, { value: 'question', label: '?' }, 'heart', 'anger', 'sweat', 'sleep', 'music',
      { value: 'spark', label: 'Delight' }, { value: 'swirl', label: 'Dizzy' },
    ]),
    style: choice('Balloon', 'round', ['round', 'cloud', 'shout']),
    tail: choice('Tail', 'middle', ['left', 'middle', 'right']),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    body: color('Balloon', P.cream, SW.face, { material: 'paint' }),
    frame: color('Line', P.cavern, SW.frame),
    accent: color('Mark', P.hero, [P.hero, P.crimson, P.thorn, P.leaf, P.water]),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Showing' },
    pop: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Popping up' },
    close: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Closing' },
  },
  sounds: {
    pop: [{ sound: 'menu-bubble-open', preset: 'Pop-up', frame: 0, volume: 0.5 }],
    close: [{ sound: 'menu-bubble-close', preset: 'Pop-up', frame: 0, volume: 0.5 }],
  },
  versions: [
    { name: 'Surprise balloon', params: {} },
    { name: 'Love', params: { emote: 'heart', tail: 'right', accent: P.crimson } },
    { name: 'Dizzy cloud', params: { emote: 'swirl', style: 'cloud', accent: P.thorn } },
    { name: 'Angry shout', params: { emote: 'anger', style: 'shout', body: P.skin } },
    { name: 'Nervous', params: { emote: 'sweat', accent: P.water, body: P.steel, tail: 'left' } },
  ],

  render(g, { clip, frame, t, p }) {
    if (clip === 'idle') { const b = balloon(g, p); markAt(g, p, b.fit, b.fit.size, t); return; }
    if (clip === 'pop') {
      if (frame < 3) { grown(g, p, OPEN[frame]); return; }
      const b = balloon(g, p);
      const f = b.fit;
      if (frame === 4) markAt(g, p, f.over, f.over.size, 0);   // the overshoot, 1 px higher where it fits
      else markAt(g, p, f, frame === 3 ? f.small : f.size, 0);
      return;
    }
    // close: the mark at rest, then gone; the balloon shrinks back into its tip
    if (frame === 0) { const b = balloon(g, p); markAt(g, p, b.fit, b.fit.size, 0); return; }
    grown(g, p, SHUT[frame]);
  },
});
