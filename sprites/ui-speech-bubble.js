// Speech bubble (core-sprites-3, batch K23, the pathfinder for bubbles): a pale bubble with a dark line and a tail
// pointing at whoever speaks, round, boxy or shouting, that a game stretches round one or two lines of dark text.
//   bubble   the bubble with its tail (a 5 px tail out of the named corner zone)
//   plain    the bubble with no tail
//   open     6 frames: a 2x2 at the tail's tip, the bubble grown from it (bubbleGrow), the tail drawn once the body is
//            12 px wide, then the full bubble
//   tail     a tail alone (bubbleTail, pointing down, centred, its top on row 20), for a game to set anywhere along a
//            bubble's bottom edge; its point is the `tip` socket
// Drawn by engine/bubbles.js into the frame minus its 1 px border and never outlined again. Text area: the helper's
// `inner`, dark text; slice: the helper's slice plus the frame's 1 px. No words are drawn: the game writes them.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { lerp, keys, easeOut } from '../engine/motion.js';
import { INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { skinSwatches } from '../engine/ui-skins.js';
import { SPEECH_STYLES, TAIL_DIRS, speechBubble, bubbleTail, bubbleGrow } from '../engine/bubbles.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 48];
const BOX = { x: 1, y: 1, w: 94, h: 46 };            // the frame minus its 1 px border
const TAIL_TOP = 20;                                  // the tail clip: the row of its top
const GROWN_TAIL = 12;                                // the opening draws the tail once the body is this wide
const SW = skinSwatches('paper', {
  face: [P.cream, H.wheat, P.skin, P.steel, P.goblin],
  frame: [P.cavern, P.soil, D.plate, H.bandit],
});

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

export default defineSprite({
  id: 'ui-speech-bubble',
  name: 'Speech bubble',
  kind: 'Item',
  blurb: 'A stretchable speech bubble with a tail pointing at whoever speaks, that pops open from its tail; change its style, tail, corners, line, shadow and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral'], gameTypes: ['arcade', 'top-down-rpg', 'turn-based-rpg', 'farming-sim'], view: 'none',
    words: ['speech', 'bubble', 'talk', 'dialogue', 'balloon', 'say', 'shout', 'chat'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 24],
  grounded: false,
  preview: 'bubble',
  slice: (clip, p) => (clip === 'bubble' || clip === 'plain' ? plus1(bubble(new Surface(...SIZE), p, clip === 'bubble' ? p.tail : 'none').slice) : undefined),
  params: {
    style: choice('Style', 'round', [...SPEECH_STYLES]),
    tail: choice('Tail', 'down-left', [...TAIL_DIRS]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round', when: { style: ['round', 'box'] } }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shadow: toggle('Shadow', true),
    face: color('Bubble', P.cream, SW.face, { material: 'paint' }),
    frame: color('Line', P.cavern, SW.frame),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    bubble: { frames: 1, fps: 8, loop: true, label: 'With a tail' },
    plain: { frames: 1, fps: 8, loop: true, label: 'No tail' },
    open: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Opening', noText: true },
    tail: { frames: 1, fps: 8, loop: true, label: 'Tail alone, for any point along an edge', noText: true },
  },
  sounds: {
    open: [{ sound: 'menu-bubble-open', preset: 'Pop-up', frame: 0, volume: 0.5 }],
  },
  versions: [
    { name: 'Speech', params: {} },
    { name: 'Shout', params: { style: 'shout', tail: 'down-right', face: P.skin } },
    { name: 'Box, tail up', params: { style: 'box', tail: 'up-left', corner: 0 } },
    { name: 'Note on wheat', params: { face: H.wheat, frame: P.soil, tail: 'left' } },
    { name: 'Thick blue line', params: { border: 1, frame: D.plate, face: P.steel, shadow: false } },
  ],
  // Where the game's words go: the flat face the helper returns, dark text, checked against the line beside it.
  textArea(clip, p) {
    if (clip !== 'bubble' && clip !== 'plain') return null;
    const out = bubble(new Surface(...SIZE), p, clip === 'bubble' ? p.tail : 'none');
    return { ...out.inner, text: INK, edge: out.edge };
  },
  sockets: (clip, t, p) => {
    if (clip !== 'tail') return {};
    const { tip } = tailAlone(new Surface(...SIZE), p);
    return { tip: { x: tip.x + 0.5, y: tip.y + 1, angle: 0 } };
  },

  render(g, { clip, t, p }) {
    if (clip === 'bubble') bubble(g, p, p.tail);
    else if (clip === 'plain') bubble(g, p, 'none');
    else if (clip === 'tail') tailAlone(g, p);
    // the opening: a quick start that slows into the full size (frames 1 to 4 grown, 5 full)
    else opening(g, p, t <= 0 ? 0 : t >= 1 ? 1 : keys(t, [[0, 0.12], [1, 0.92]], easeOut));
  },
});
