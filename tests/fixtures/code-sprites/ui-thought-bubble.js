// FROZEN COPY, not a sprite: sprites/ui-thought-bubble.js as it was on 2026-11-20 (migration batch M9), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Thought bubble (core-sprites-3, batch K23): a cloud of thought with a trail of three puffs back to the thinker, that
// a game stretches round one or two lines of dark text.
//   bubble   the cloud with its trail (out of the named corner zone)
//   plain    the cloud with no trail
//   open     6 frames: the three puffs appear, smallest first (0 to 2); the cloud grown from the largest puff with
//            bubbleGrow (3, 4); the full cloud (5). A dream cloud's sparkles are 5x5 pluses with an ink rim on the face
//            of its two top corner lobes (cloudStars), clear of the text
// Drawn by scallopCloud (engine/scallop-cloud.js: thoughtBubble's rules, scalloped with round lobes along every edge,
// and a trail of puffs that touch neither each other nor the cloud) into the frame minus its 1 px border and never
// outlined again; the opening takes it apart with scallopPieces. Styles differ in outline: cloud (lobes every 9 px),
// puff (fewer, bigger lobes), dream (small ripples between round corners, and sparkles). Text area: the helper's
// `inner`, dark text; slice: the helper's slice plus the frame's 1 px, and `tile`: one repeat of the scalloped middle,
// to lengthen the cloud by whole lobes. No trail in the middle (`down`): it would repeat when stretched sideways.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { Surface } from '../../../engine/surface.js';
import { lerp } from '../../../engine/motion.js';
import { INK } from '../../../engine/color.js';
import { PALETTE } from '../../../engine/palettes.js';
import { skinSwatches } from '../../../engine/ui-skins.js';
import { bubbleGrow } from '../../../engine/bubbles.js';
import { CLOUD_STYLES, CLOUD_TRAILS, scallopCloud, scallopPieces, cloudStars } from '../../../engine/scallop-cloud.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 48];
const BOX = { x: 1, y: 1, w: 94, h: 46 };            // the frame minus its 1 px border
const GROW = [0.45, 0.75];                            // how far the cloud has grown on frames 3 and 4
const SW = skinSwatches('paper', {
  face: [P.cream, H.wheat, P.skin, P.steel, P.goblin],
  frame: [P.cavern, P.soil, D.plate, H.bandit],
});

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

export default defineSprite({
  id: 'ui-thought-bubble',
  name: 'Thought bubble',
  kind: 'Item',
  blurb: 'A stretchable thought cloud with a trail of puffs back to the thinker, that grows out of its trail; change its style, trail, line, shadow and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral'], gameTypes: ['arcade', 'top-down-rpg', 'farming-sim', 'puzzle'], view: 'none',
    words: ['thought', 'bubble', 'think', 'cloud', 'dream', 'wonder', 'idea', 'balloon'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 24],
  grounded: false,
  preview: 'bubble',
  slice: (clip, p) => (clip === 'bubble' || clip === 'plain' ? stretch(p, clip === 'bubble' ? p.trail : 'none') : undefined),
  params: {
    style: choice('Style', 'cloud', [...CLOUD_STYLES]),
    trail: choice('Trail', 'down-left', [...CLOUD_TRAILS]),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shadow: toggle('Shadow', true),
    face: color('Bubble', P.cream, SW.face, { material: 'paint' }),
    frame: color('Line', P.cavern, SW.frame),
    accent: color('Sparkles', P.thorn, [P.thorn, P.crimson, P.hero, P.leaf, P.ember], { when: { style: ['dream'] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    bubble: { frames: 1, fps: 8, loop: true, label: 'With a trail' },
    plain: { frames: 1, fps: 8, loop: true, label: 'No trail' },
    open: { frames: 6, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Opening', noText: true },
  },
  sounds: {
    open: [{ sound: 'menu-bubble-open', preset: 'Pop-up', frame: 0, volume: 0.5 }],
  },
  versions: [
    { name: 'Thought', params: {} },
    { name: 'Puff', params: { style: 'puff', trail: 'down-right' } },
    { name: 'Dream', params: { style: 'dream', face: P.goblin, accent: P.hero } },
    { name: 'Wheat cloud', params: { face: H.wheat, frame: P.soil, trail: 'up-left' } },
    { name: 'Bold wine line', params: { border: 1, shadow: false, frame: H.bandit, trail: 'up-right' } },
  ],
  // Where the game's words go: the flat face the helper returns, dark text, checked against the line beside it.
  textArea(clip, p) {
    if (clip !== 'bubble' && clip !== 'plain') return null;
    const out = cloud(new Surface(...SIZE), p, clip === 'bubble' ? p.trail : 'none');
    return { ...out.inner, text: INK, edge: out.edge };
  },

  render(g, { clip, frame, p }) {
    if (clip === 'bubble') cloud(g, p, p.trail);
    else if (clip === 'plain') cloud(g, p, 'none');
    else opening(g, p, frame);
  },
});
