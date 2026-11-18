// Moving platform: a floating deck the player rides, with a gear turning under it.
// The pivot is on the walking surface (row 8), not at the bottom: a game puts the pivot where the
// player's feet go. The deck is 10 px thick with its outline (rows 8 to 17 at rest); the bob only
// ever sinks it, so the chains above it (rows 1 to 7) and the top line never leave their place
// upward. `idle`: the gear turns one tooth per loop and the deck bobs. `move`: the gear turns three
// teeth per loop and the chains sway.
//
// Two layers, each with its own outline: the gear behind, then the deck with its fittings and
// chains in front, so the deck's lower edge is an ink line across the gear.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { lerp, pulse, wave, TAU } from '../engine/motion.js';
import { ramp, mix, tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { toothedIn, chain } from '../engine/mech.js';

const P = PALETTE.thornwood;
const W = 64, H = 32, CX = 32, TOP = 8;                        // TOP: the row of the walking surface (the deck's top outline)
// the fittings sit on the deck: the two lists share no colour
const DECK = [...swatches('thornwood', 'wood').slice(0, 4), P.stone, P.moss];
const METAL = swatches('thornwood', 'metal').filter((c) => !DECK.includes(c));
const TEETH = 8;

// What the deck is made of, from the Deck colour: the wood as picked, or the same colour turned
// half way to stone or to dark iron, so the control matters in every style.
const MATERIAL = { wood: (c) => c, stone: (c) => mix(c, P.stone, 0.6), metal: (c) => mix(c, P.slate, 0.7) };

// ---- the three decks: each draws rows y to y + 7 between columns x0 and x1 ----------------------
function deckWood(s, x0, x1, y, deck, metal) {
  const shade = mix(deck.base, deck.dark, 0.5);
  // planks laid across a beam; the planks overhang the beam at each end
  s.rect(x0, y, x1 - x0 + 1, 4, deck.base);
  s.rect(x0, y, x1 - x0 + 1, 1, deck.light);
  for (let x = x0 + 9; x < x1 - 4; x += 8) s.rect(x, y, 1, 3, deck.dark);                        // the joints between planks
  s.rect(x0, y + 3, x1 - x0 + 1, 1, deck.dark);
  s.rect(x0 + 4, y + 4, x1 - x0 - 7, 4, shade);
  s.rect(x0 + 4, y + 7, x1 - x0 - 7, 1, deck.dark);
  for (let x = x0 + 12; x < x1 - 12; x += 13) s.rect(x, y + 5, 5, 1, deck.dark);                  // grain on the beam
  // an iron strap round each end of the planks
  for (const x of [x0, x1 - 2]) { s.rect(x, y, 3, 4, metal.base); s.rect(x, y, 3, 1, metal.light); s.rect(x, y + 3, 3, 1, metal.dark); s.dot(x + 1, y + 2, metal.dark); }
}

function deckStone(s, x0, x1, y, deck, metal) {
  // a slab of two courses, its lower corners knocked off
  for (let r = 0; r < 8; r++) {
    const cut = Math.max(0, r - 4);
    s.rect(x0 + cut, y + r, x1 - x0 + 1 - 2 * cut, 1, r === 0 ? deck.light : r === 7 ? deck.dark : deck.base);
  }
  s.rect(x0, y + 4, x1 - x0 + 1, 1, deck.dark);                                                   // the bed joint
  for (let x = x0 + 7; x < x1 - 3; x += 12) s.rect(x, y + 1, 1, 3, deck.dark);                    // upright joints, upper course
  for (let x = x0 + 13; x < x1 - 5; x += 12) s.rect(x, y + 5, 1, 2, deck.dark);                   // and lower, half a stone along
  // two iron bands hold it together
  for (const x of [x0 + 3, x1 - 4]) { s.rect(x, y, 2, 6, metal.base); s.rect(x, y, 2, 1, metal.light); s.rect(x, y + 5, 2, 1, metal.dark); }
}

function deckMetal(s, x0, x1, y, deck, metal) {
  // a riveted plate on a girder; the girder's ends slope in
  s.rect(x0, y, x1 - x0 + 1, 3, deck.base);
  s.rect(x0, y, x1 - x0 + 1, 1, deck.light);
  s.rect(x0, y + 2, x1 - x0 + 1, 1, deck.dark);
  for (let r = 3; r < 8; r++) {
    const cut = 2 + (r - 3);
    s.rect(x0 + cut, y + r, x1 - x0 + 1 - 2 * cut, 1, r === 7 ? deck.base : deck.dark);
  }
  // the lattice of the girder: a zigzag of struts, eight pixels to a bay
  for (let x = x0 + 8; x < x1 - 7; x++) s.dot(x, y + 3 + [0, 1, 2, 3, 3, 2, 1, 0][(x - x0) % 8], deck.light);
  // bright rivets along the plate, and a cap on each end
  for (let x = x0 + 6; x < x1 - 5; x += 6) s.rect(x, y + 1, 2, 1, metal.base);
  for (const x of [x0, x1 - 1]) { s.rect(x, y, 2, 3, metal.base); s.rect(x, y, 2, 1, metal.light); }
}

const DRAW = { wood: deckWood, stone: deckStone, metal: deckMetal };

export default defineSprite({
  id: 'moving-platform',
  name: 'Moving platform',
  kind: 'Item',
  blurb: 'A floating platform to ride, with a gear turning underneath; change its width, what it is made of, the chains it hangs from, the colours and how much it bobs.',
  meta: {
    type: 'prop',
    role: 'world/platform',
    themes: ['fantasy', 'forest'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['platform', 'moving', 'lift', 'elevator', 'floating', 'ride', 'gear', 'chains', 'ledge', 'move', 'travel', 'wooden', 'stone'],
    license: 'draft',
  },
  size: [W, H],
  pivot: [CX, TOP],
  grounded: false,
  params: {
    width: range('Width', 48, { min: 40, max: 62, step: 2, lo: 'Narrow', hi: 'Wide' }),
    style: choice('Style', 'wood', ['wood', 'stone', 'metal']),
    chains: toggle('Chains', true),
    wood: color('Deck', P.wood, DECK),
    metal: color('Metal', P.steel, METAL),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    move: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
  },

  render(g, { clip, t, p }) {
    const deck = ramp(MATERIAL[p.style](p.wood)), metal = ramp(p.metal);
    const dy = Math.round(lerp(0, 2, p.bob) * pulse(t));       // the bob: it sinks and comes back
    const wide = Math.round(p.width);
    const x0 = CX - wide / 2 + 1, x1 = CX + wide / 2 - 2;       // the deck without its outline
    const y = TOP + 1 + dy;                                     // its first row

    // ---- behind: the gear, its top tucked behind the deck ----
    const turn = ((clip === 'move' ? 3 : 1) * TAU * t) / TEETH;
    const gy = y + 11;
    const below = (px, py) => py > y + 4;                       // only what hangs under the deck is drawn
    g.fill(0, 0, W, H, toothedIn(CX, gy, 7.5, TEETH, 2.5, turn), metal, { shade: 1, clip: below });
    g.ellipse(CX, gy, 2.5, 2.5, tone(p.metal, -1.6), { outline: metal.dark });   // the axle, in its collar: it does not turn
    g.outline(INK);

    // ---- in front: the deck, its fittings and the chains ----
    const s = new Surface(W, H);
    DRAW[p.style](s, x0, x1, y, deck, metal);
    if (p.chains) {
      const bow = clip === 'move' ? Math.round(1.4 * wave(t)) : 0;
      for (const x of [x0 + 3, x1 - 3]) {
        chain(s, x, 2, x, y - 2, { colour: p.metal, bow });           // its outline reaches row 1
        s.rect(x - 1, y - 1, 3, 1, metal.dark);                 // the shackle on the deck
      }
    }
    s.outline(INK);
    g.blit(s);
  },
});
