// Market stall: a wooden counter under a cloth awning on four poles, for the Hearthvale village square, seen from
// the south in three-quarter view. Every piece comes from engine/stalls.js (awning, poles, counter, goods); this
// file only says where the pieces of THIS stall go (plan) and how its awning flaps.
//
// Scale: `merchant` stands behind it. Put the merchant's pivot 8 px above the stall's (a game that sorts by the pivot
// row then draws the merchant first): the counter hides the legs, the goods lie in front of the apron, and the face
// shows between the goods and the awning's front edge (a tall turban tucks up behind the cloth).
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { INK } from '../engine/color.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import { AWNING_STYLES, GOODS, awning, pole, counter, layGoods } from '../engine/stalls.js';

const P = PALETTE.hearthvale;
const CX = 32, GROUND = 60;                    // the lowest body row is GROUND - 1; the outline lands on GROUND
const TOP = 6;                                 // the awning's back edge
const ROOF = 9, VALANCE = 6;                   // rows of sloping cloth, rows of hanging front
const COUNTER = { y: 40, depth: 6 };           // the counter's top starts 20 px above the ground
// what the goods are made of: fixed palette colours, the same whatever the stall's own colours
const WARES = { a: P.crimson, b: P.gold, c: P.leaf, basket: P.wheat, crust: P.path, glass: P.cream, cork: P.wood, metal: P.steel, trim: P.gold, grip: P.wood };

/** Where everything is for these settings: shared by both clips. */
function plan(p) {
  const w = 2 * Math.round(lerp(21, 28, p.width)), x0 = CX - w / 2;         // the awning's front edge: 42 to 56 px
  return {
    awning: { x: x0, y: TOP, w, rise: ROOF, drop: VALANCE, inset: 4 },
    // the front poles stand under the awning's front corners; the back ones a little further in and behind the counter
    front: [x0 + 2, x0 + w - 4], back: [x0 + 8, x0 + w - 10],
    counter: { x: x0 + 5, w: w - 10, ...COUNTER, h: GROUND - COUNTER.y - COUNTER.depth },
  };
}

export default defineSprite({
  id: 'market-stall',
  name: 'Market stall',
  kind: 'Item',
  blurb: 'A wooden counter under a cloth awning on four poles, with goods laid out and room for a merchant behind it. Change the awning, the goods, the width and the colours.',
  meta: {
    type: 'prop', role: 'world/building', themes: ['fantasy', 'farm'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['stall', 'market', 'shop', 'stand', 'booth', 'awning', 'counter', 'goods', 'buy', 'sell', 'trade', 'flap', 'village', 'fair'], license: 'draft',
  },
  size: [64, 64],
  pivot: [CX, GROUND],
  preview: 'flap',
  params: {
    style: choice('Style', 'striped', AWNING_STYLES),
    shape: choice('Goods', 'fruit', GOODS),
    width: range('Width', 0.5, { lo: 'Narrow', hi: 'Wide' }),
    // the cloth is dark and the accent light, so stripes and edging show whatever is picked, under every look
    cloth: color('Cloth', P.roof, swatchesBetween('hearthvale', ['outfit'], { lead: 'roof', max: 0.5 })),
    accent: color('Stripes and edging', P.cream, swatchesBetween('hearthvale', ['accent', 'core', 'sky'], { lead: 'cream', min: 0.7 }), { material: 'cloth' }),
    wood: color('Wood', P.wood, swatches('hearthvale', 'wood')),
    sway: range('Sway', 0.5, { lo: 'Still', hi: 'Swaying', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    flap: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },

  render(g, { clip, t, p }) {
    const L = plan(p), under = TOP + ROOF;
    // from the back to the front: back poles, counter, goods, front poles, and the cloth over all
    for (const x of L.back) pole(g, { x, y: under, h: COUNTER.y - under, wood: p.wood, far: true });
    const top = counter(g, { ...L.counter, wood: p.wood });
    layGoods(g, p.shape, { ...top.span, colours: WARES });
    for (const x of L.front) pole(g, { x, y: under, h: GROUND - under, wood: p.wood });
    // `flap`: a ripple runs along the valance's lower edge, one wave passing per loop
    awning(g, { ...L.awning, style: p.style, cloth: p.cloth, accent: p.accent, t, sway: clip === 'flap' ? lerp(0.8, 2, p.sway) : 0 });
    g.outline(INK);
  },
});
