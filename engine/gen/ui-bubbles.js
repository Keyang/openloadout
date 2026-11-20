// Speech, thought and emote generators of migration batch M9 (family "ui"; docs/data-sprites.md 3.3 `bubble`): the
// library's reaction marks, emote bubbles, speech and thought bubbles and name plates as port generators
// (engine/gen/port-sprite.js). Each draws what its code sprite drew, pixel for pixel: the sprite file's own drawing, moved
// here word for word inside its own block, on engine/emotes.js, engine/bubbles.js and their neighbours ported to paint
// refs in engine/gen/ports/. Every argument is one of the old sprite's settings under its own name (`glow`, a call
// field, is `lit`); `picture` is the clip. Pure: Node and browser.
import { share, px, word, flag, paint } from './args.js';
import { portGenerator } from './port-sprite.js';
import { Surface, rectIn, ellipseIn, polyIn } from './ports/surface.js';
import { tone, ramp, mix, pick, INK } from './ports/colour.js';
import { lerp, wave, fract, clamp, keys, easeOut, pulse, PI, TAU } from '../motion.js';
import { PALETTE } from '../palettes.js';
import { drawEmote, emotePop } from './ports/emotes.js';
import { SPEECH_STYLES, TAIL_DIRS, speechBubble, bubbleTail, bubbleGrow } from './ports/bubbles.js';
import { BUMP_TRAIL } from './ports/bump-cloud.js';
import { puffCloud } from './ports/puff-cloud.js';
import { drawSmallEmote } from './ports/emote-small.js';
import { drawAngerPinwheel } from './ports/anger-pinwheel.js';
import { drawDizzySwirl } from './ports/dizzy-swirl.js';
import { CLOUD_STYLES, CLOUD_TRAILS, scallopCloud, scallopPieces, cloudStars } from './ports/scallop-cloud.js';

// ---- emote.marks@1 (tests/fixtures/code-sprites/emote-marks.js) --------------------------------------------------------

/** emote.marks@1: Nine rimmed reaction marks that pop up over a character's head and keep moving while they show (surprise, question, love, anger, nerves, sleep, a tune, delight, dizziness) (port of tests/fixtures/code-sprites/emote-marks.js). */
export const emoteMarksPort = (() => {
  const P = PALETTE.thornwood;
  const CX = 16, BY = 26;                                  // the mark's centre column and its body's bottom row at rest
  const STROKED = ['exclaim', 'question', 'anger', 'sleep', 'music', 'spark', 'swirl'];

  const markSize = (p) => Math.round(lerp(12, 20, p.size));
  const mark = (g, p, size, dy, t) => drawEmote(g, p.emote, CX, BY + dy, size, {
    t, bounce: p.bounce, bold: p.bold, colour: p.body, edge: p.edge, rim: true, shadow: p.shadow,
  });
  return portGenerator({
    id: 'emote.marks', family: 'ui', units: 70, size: [32, 32], origin: [16, 16],
    states: { idle: { frames: 8 }, pop: { frames: 6, loop: false } },
    about: 'Nine rimmed reaction marks that pop up over a character\'s head and keep moving while they show (surprise, question, love, anger, nerves, sleep, a tune, delight, dizziness).',
    args: {
      emote: word(['exclaim', 'question', 'heart', 'anger', 'sweat', 'sleep', 'music', 'spark', 'swirl'], { default: 'exclaim', about: 'Emote' }),
      size: share({ default: 0.5, about: 'Size: Small to Big' }),
      bold: flag({ default: false, about: 'Bold' }),
      shadow: flag({ default: true, about: 'Shadow' }),
      body: paint({ about: 'Mark' }),
      edge: paint({ about: 'Rim' }),
      bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy' }),
    },
    draw(g, { clip, frame, t, p }) {
    const size = markSize(p);
    if (clip === 'idle') { mark(g, p, size, 0, t); return; }
    const pop = emotePop(frame, 6);
    if (pop.dot) {
      // what the mark grows from: a 3x3 dot of the mark's colour, inked, where its foot will stand
      g.rect(CX - 1, BY - 2, 3, 3, p.body, { outline: INK });
      return;
    }
    mark(g, p, Math.round(size * pop.size), pop.dy, 0);
  },
  });
})();


// ---- emote.bubbles@1 (tests/fixtures/code-sprites/emote-bubbles.js) ----------------------------------------------------

/** emote.bubbles@1: Nine reaction marks (surprise, question, love, anger, nerves, sleep, a tune, delight, dizziness) in a small pale balloon with a tail that pops open from its tip and shrinks back into it (port of tests/fixtures/code-sprites/emote-bubbles.js). */
export const emoteBubblesPort = (() => {
  const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
  const SIZE = [32, 32];
  const BOTTOM = 25;                                       // the balloon's bottom line (round, shout); the tail ends 5 rows lower
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
  return portGenerator({
    id: 'emote.bubbles', family: 'ui', units: 70, size: [32, 32], origin: [16, 16],
    states: { idle: { frames: 8 }, pop: { frames: 6, loop: false }, close: { frames: 6, loop: false } },
    about: 'Nine reaction marks (surprise, question, love, anger, nerves, sleep, a tune, delight, dizziness) in a small pale balloon with a tail that pops open from its tip and shrinks back into it.',
    args: {
      emote: word(['exclaim', 'question', 'heart', 'anger', 'sweat', 'sleep', 'music', 'spark', 'swirl'], { default: 'exclaim', about: 'Emote' }),
      style: word(['round', 'cloud', 'shout'], { default: 'round', about: 'Balloon' }),
      tail: word(['left', 'middle', 'right'], { default: 'middle', about: 'Tail' }),
      size: share({ default: 0.5, about: 'Size: Small to Big' }),
      body: paint({ about: 'Balloon' }),
      frame: paint({ about: 'Line' }),
      accent: paint({ about: 'Mark' }),
    },
    draw(g, { clip, frame, t, p }) {
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
})();


// ---- speech.bubble@1 (tests/fixtures/code-sprites/ui-speech-bubble.js) -------------------------------------------------

/** speech.bubble@1: A stretchable speech bubble with a tail pointing at whoever speaks, that pops open from its tail (port of tests/fixtures/code-sprites/ui-speech-bubble.js). */
export const speechBubblePort = (() => {
  const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
  const SIZE = [96, 48];
  const BOX = { x: 1, y: 1, w: 94, h: 46 };            // the frame minus its 1 px border
  const TAIL_TOP = 20;                                  // the tail clip: the row of its top
  const GROWN_TAIL = 12;                                // the opening draws the tail once the body is this wide

  const look = (p, tail) => ({ style: p.style, tail, face: p.face, frame: p.frame, border: p.border, corner: p.corner, shadow: p.shadow });
  const bubble = (g, p, tail, box = BOX) => speechBubble(g, box.x, box.y, box.w, box.h, look(p, tail));
  const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });

  // One frame of the opening: k 0 is a 2x2 at the tail's tip, k 1 the full bubble.
  function opening(g, p, k) {
    const full = bubble(new Surface(...SIZE), p, p.tail);
    if (k >= 1) return bubble(g, p, p.tail);
    const r = bubbleGrow(BOX, full.tip, k);
    if (k <= 0 || r.w < 6 || r.h < 6) { g.rect(r.x, r.y, r.w, r.h, p.frame); return null; }
    // the tail joins once the body is wide enough to carry it
    const s = new Surface(...SIZE), out = bubble(s, p, p.tail, r);
    if (out.body.w >= GROWN_TAIL && out.body.h >= 6) { g.blit(s); return out; }
    return bubble(g, p, 'none', r);
  }
  const tailAlone = (g, p) => bubbleTail(g, SIZE[0] >> 1, TAIL_TOP, { dir: 'down', size: 5, face: p.face, frame: p.frame });
  function oldTextArea(clip, p) {
    if (clip !== 'bubble' && clip !== 'plain') return null;
    const out = bubble(new Surface(...SIZE), p, clip === 'bubble' ? p.tail : 'none');
    return { ...out.inner, text: INK, edge: out.edge };
  }
  const oldSlice = (clip, p) => (clip === 'bubble' || clip === 'plain' ? plus1(bubble(new Surface(...SIZE), p, clip === 'bubble' ? p.tail : 'none').slice) : undefined);
  return portGenerator({
    id: 'speech.bubble', family: 'ui', units: 150, size: [96, 48], origin: [48, 24],
    states: { bubble: { frames: 1 }, plain: { frames: 1 }, open: { frames: 6, loop: false }, tail: { frames: 1 } },
    about: 'A stretchable speech bubble with a tail pointing at whoever speaks, that pops open from its tail.',
    args: {
      style: word(['round', 'box', 'shout'], { default: 'round', about: 'Style' }),
      tail: word(['down-left', 'down-right', 'up-left', 'up-right', 'left', 'right'], { default: 'down-left', about: 'Tail' }),
      corner: share({ default: 0.5, about: 'Corner: Square to Round' }),
      border: share({ default: 0.5, about: 'Border: Thin to Thick' }),
      shadow: flag({ default: true, about: 'Shadow' }),
      face: paint({ about: 'Bubble' }),
      frame: paint({ about: 'Line' }),
    },
    draw(g, { clip, t, p }) {
    if (clip === 'bubble') bubble(g, p, p.tail);
    else if (clip === 'plain') bubble(g, p, 'none');
    else if (clip === 'tail') tailAlone(g, p);
    // the opening: a quick start that slows into the full size (frames 1 to 4 grown, 5 full)
    else opening(g, p, t <= 0 ? 0 : t >= 1 ? 1 : keys(t, [[0, 0.12], [1, 0.92]], easeOut));
  },
    measure(clip, p) { return { textArea: oldTextArea(clip, p), slice: oldSlice(clip, p) }; },
    // the tail clip's point, where it meets whoever speaks (the old sockets(); review M9 round 2)
    points(clip, p) {
      if (clip !== 'tail') return {};
      const { tip } = tailAlone(new Surface(...SIZE), p);
      return { tip: { x: tip.x + 0.5, y: tip.y + 1, angle: 0 } };
    },
  });
})();


// ---- thought.bubble@1 (tests/fixtures/code-sprites/ui-thought-bubble.js) -----------------------------------------------

/** thought.bubble@1: A stretchable thought cloud with a trail of puffs back to the thinker, that grows out of its trail (port of tests/fixtures/code-sprites/ui-thought-bubble.js). */
export const thoughtBubblePort = (() => {
  const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
  const SIZE = [96, 48];
  const BOX = { x: 1, y: 1, w: 94, h: 46 };            // the frame minus its 1 px border
  const GROW = [0.45, 0.75];                            // how far the cloud has grown on frames 3 and 4

  const look = (p, trail) => ({ style: p.style, trail, face: p.face, frame: p.frame, border: p.border, shadow: p.shadow });
  // The cloud; a dream cloud's sparkles on its two top corners.
  function cloud(g, p, trail, box = BOX) {
    const out = scallopCloud(g, box.x, box.y, box.w, box.h, look(p, trail));
    if (p.style === 'dream') cloudStars(g, out, p.accent);
    return out;
  }
  const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
  // The stretch of a clip: the text area's border plus the frame's 1 px, and one whole lobe of the middle to repeat.
  function stretch(p, trail) {
    const out = cloud(new Surface(...SIZE), p, trail);
    return { ...plus1(out.slice), tile: out.tile };
  }

  // One frame of the opening.
  function opening(g, p, frame) {
    if (frame >= 5) { cloud(g, p, p.trail); return; }
    const k = scallopPieces(...SIZE, BOX.x, BOX.y, BOX.w, BOX.h, look(p, p.trail));
    if (frame >= 3) {
      // the cloud grows out of the largest puff, the puffs already in place on top of it
      const r = bubbleGrow(k.cloudBox, k.puffs[2].centre, GROW[frame - 3]);
      cloud(g, p, 'none', r);
    }
    for (const puff of k.puffs.slice(0, Math.min(3, frame + 1))) g.blit(puff.surface);
  }
  function oldTextArea(clip, p) {
    if (clip !== 'bubble' && clip !== 'plain') return null;
    const out = cloud(new Surface(...SIZE), p, clip === 'bubble' ? p.trail : 'none');
    return { ...out.inner, text: INK, edge: out.edge };
  }
  const oldSlice = (clip, p) => (clip === 'bubble' || clip === 'plain' ? stretch(p, clip === 'bubble' ? p.trail : 'none') : undefined);
  return portGenerator({
    id: 'thought.bubble', family: 'ui', units: 900, size: [96, 48], origin: [48, 24],
    states: { bubble: { frames: 1 }, plain: { frames: 1 }, open: { frames: 6, loop: false } },
    about: 'A stretchable thought cloud with a trail of puffs back to the thinker, that grows out of its trail.',
    args: {
      style: word(['cloud', 'puff', 'dream'], { default: 'cloud', about: 'Style' }),
      trail: word(['down-left', 'down-right', 'up-left', 'up-right'], { default: 'down-left', about: 'Trail' }),
      border: share({ default: 0.5, about: 'Border: Thin to Thick' }),
      shadow: flag({ default: true, about: 'Shadow' }),
      face: paint({ about: 'Bubble' }),
      frame: paint({ about: 'Line' }),
      accent: paint({ about: 'Sparkles' }),
    },
    draw(g, { clip, frame, p }) {
    if (clip === 'bubble') cloud(g, p, p.trail);
    else if (clip === 'plain') cloud(g, p, 'none');
    else opening(g, p, frame);
  },
    measure(clip, p) { return { textArea: oldTextArea(clip, p), slice: oldSlice(clip, p) }; },
  });
})();


// ---- name.plate@1 (tests/fixtures/code-sprites/ui-name-plate.js; review M9 round 1, issue 1) ---------------------------

import { PLATE_STYLES, namePlate, plateNotch } from './ports/bubbles.js';
import { dropShadow } from './ports/drop-shadow.js';
import { fixed } from './port-surface.js';
import { colourOf } from './pixels.js';

/** name.plate@1: A small stretchable plate for a name over a character, with a level badge, a lit state for the one targeted and a notch pointing down (port of tests/fixtures/code-sprites/ui-name-plate.js). */
export const namePlatePort = (() => {
  const SIZE = [64, 16];
  const BOX = { x: 1, y: 1, w: 62, h: 14 };            // the frame minus its 1 px border
  const NOTCH_TOP = 10;                                 // the pointer clip: the row of its top
  const TEXT = '#ffffff';                               // engine/ui-skins.js SKIN_TEXT.flat: the name is printed in white
  const PLATES = { plate: {}, 'plate-badge': { badge: true }, 'plate-lit': { lit: true } };

  // The targeted look, on the plate drawn with lit off: every band pixel turns the accent (lifted by litBand so it stands
  // off the plate and shows against every band), and an arrow head of the accent grows from the inner edge of the band at each end, on the plate's
  // middle row: columns 5, 5, 3 and 1 px tall on the face, its rim ink where it meets the face, so it stands off any face
  // (and the rim off any band swatch: ink is 9:1 or more against all five). Returns
  // the text area, narrowed if an arrow would reach it.
  const ARROW = [[0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [1, -2], [1, -1], [1, 0], [1, 1], [1, 2], [2, -1], [2, 0], [2, 1], [3, 0]];
  // The lit band's colour: the accent, lifted (lighter, same hue) until it keeps 3 to 1 against the plate under every
  // look and sits 0.1 or more apart in brightness from the band it replaces, so the change shows at 1x (magic on sky,
  // moss on green). A darker accent cannot hold 3 to 1 against the dark plates under the Spooky and Mono looks.
  // PORT CHANGE: the code searched the accent's tones itself (engine/ui.js worstContrast, engine/color.js brightness); a
  // paint ref has no numbers, so the band is the `lifted` colour rule, the same search (engine/look-tones.js lifted).
  const ref = (x) => colourOf(fixed(x));
  const litBand = (p) => ({ rule: 'lifted', of: ref(p.accent), against: ref(p.face), beside: ref(p.frame) });
  function litPlate(s, out, p) {
    const lit = litBand(p);
    const band = s.table.id(p.frame), face = s.table.id(p.face), acc = s.table.id(lit);   // PORT CHANGE: paint numbers, not packed colours
    for (let i = 0; i < s.data.length; i++) if (s.data[i] === band) s.data[i] = acc;
    const B = out.body, my = B.y + Math.floor((B.h - 1) / 2);
    let text = { ...out.text };
    for (const dir of [1, -1]) {
      // the first face column on the middle row, from this end: the arrow's 5 px base sits on it, against the band
      let x = dir > 0 ? B.x : B.x + B.w - 1;
      while (s.get(x, my) !== face && Math.abs(x - B.x - (dir > 0 ? 0 : B.w - 1)) < B.w >> 1) x += dir;
      const base = x;
      const core = ARROW.map(([u, v]) => [base + dir * u, my + v]);
      const inCore = (px, py) => core.some(([cx, cy]) => cx === px && cy === py);
      for (const [cx, cy] of core) for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!inCore(cx + ex, cy + ey) && s.get(cx + ex, cy + ey) === face) s.dot(cx + ex, cy + ey, INK);
      for (const [cx, cy] of core) if (s.get(cx, cy) && s.get(cx, cy) !== s.table.id(INK)) s.dot(cx, cy, p.accent);   // PORT CHANGE: the ink's paint number
      // the text keeps 1 px clear of the arrow's rim
      const reach = base + dir * 5;
      if (dir > 0 && text.x <= reach) { text.w -= reach + 1 - text.x; text.x = reach + 1; }
      if (dir < 0 && text.x + text.w > reach) text.w = reach - text.x;
    }
    return text;
  }

  const SHADOW = [-2, 1];                              // the drop shadow: 2 px left, 1 px down (16 rows cannot spare 2)
  // The plate with its shadow; returns the helper's rectangles and the slice from the box.
  function plate(g, clip, p) {
    const [sx, sy] = p.shadow ? SHADOW : [0, 0];
    const s = new Surface(...SIZE);
    const out = namePlate(s, BOX.x - sx, BOX.y, BOX.w + sx, BOX.h - sy, {
      style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner, shadow: false, ...PLATES[clip], lit: false,
    });
    if (PLATES[clip].lit) out.text = litPlate(s, out, p);
    if (p.shadow) dropShadow(g, s, { dx: sx, dy: sy, box: BOX });
    else g.blit(s);
    const t = out.text;
    return { ...out, slice: { left: t.x - BOX.x, top: t.y - BOX.y, right: BOX.x + BOX.w - (t.x + t.w), bottom: BOX.y + BOX.h - (t.y + t.h) } };
  }
  const notch = (g, p) => plateNotch(g, SIZE[0] >> 1, NOTCH_TOP, { size: 3, face: p.face, frame: p.frame });
  const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
  // Where the name goes (white text), and on the badge plate the level number too.
  function oldTextArea(clip, p) {
    if (!PLATES[clip]) return null;
    const out = plate(new Surface(...SIZE), clip, p);
    const main = { ...out.text, text: TEXT, edge: out.edge };
    return out.badgeText ? [main, { ...out.badgeText, text: TEXT, edge: out.edge }] : main;
  }
  const oldSlice = (clip, p) => (PLATES[clip] ? plus1(plate(new Surface(...SIZE), clip, p).slice) : undefined);
  return portGenerator({
    id: 'name.plate', family: 'ui', units: 90, size: SIZE, origin: [32, 8], work: 96,
    states: { plate: { frames: 1 }, 'plate-badge': { frames: 1 }, 'plate-lit': { frames: 1 }, pointer: { frames: 1 } },
    about: 'A small stretchable plate for a name over a character, with a level badge, a lit state for the one targeted and a notch pointing down.',
    args: {
      style: word([...PLATE_STYLES], { default: 'plain', about: 'Style: plain, ribbon or pointed' }),
      corner: share({ default: 0.5, about: 'Corner: Square to Round (plain only)' }),
      border: share({ default: 0.5, about: 'Border: Thin to Thick' }),
      shadow: flag({ default: true, about: 'A drop shadow 2 px left and 1 px down' }),
      face: paint({ about: 'The plate' }),
      frame: paint({ about: 'The band round it' }),
      accent: paint({ about: 'The badge and, targeted, the arrows and the lit band (lifted clear of the plate and the band)' }),
    },
    draw(g, { clip, p }) {
      if (clip === 'pointer') notch(g, p);
      else plate(g, clip, p);
    },
    measure(clip, p) { return { textArea: oldTextArea(clip, p), slice: oldSlice(clip, p) }; },
    // the pointer's tip, over the one named (the old sockets(); review M9 round 2)
    points(clip, p) {
      if (clip !== 'pointer') return {};
      const { tip } = notch(new Surface(...SIZE), p);
      return { tip: { x: tip.x + 0.5, y: tip.y + 1, angle: 0 } };
    },
  });
})();
