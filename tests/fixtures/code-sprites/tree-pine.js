// FROZEN COPY, not a sprite: sprites/tree-pine.js as it was on 2026-11-20 (batch P4), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only as the reference its port (engine/gen/world-p4.js) is tested against
// (tests/unit/gen-p4-props.test.mjs); imports point at ../../../. Never edit it; the build never scans tests/.
// Pine tree: a pointed fir for the Hearthvale map, seen from the south (three-quarter view). Its trunk stands on the
// pivot and its tiers rise above, so a game that sorts sprites by their pivot row lets a character walk behind it.
// The tiers, the trunk and the falling needles are the framework's (engine/foliage.js) and the lean is the Surface's
// own (lean in engine/surface.js); this file says how many tiers there are, how each is lit, and how the tree moves.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { Surface, lean } from '../../../engine/surface.js';
import { lerp, wave, TAU } from '../../../engine/motion.js';
import { ramp, INK } from '../../../engine/color.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { tierIn, trunkIn, leafFall } from '../../../engine/foliage.js';

const HV = PALETTE.hearthvale;
const W = 48, H = 80, CX = 24, GROUND = 76;                // the lowest trunk row is GROUND - 1; the outline lands on GROUND
const TIERS = { short: 3, medium: 4, tall: 5 };
const STEP = 11, STUB = 6, TOP = 24;                       // px between tiers, of bare trunk, and from the top tier's hem to its tip, at Size "Big"

/** The tiers this frame, bottom first: { top, bottom, half, seed }. `bounce` lifts and drops them in turn (shake). */
function tiers(p, bounce = () => 0) {
  const s = lerp(0.6, 1, p.size), n = TIERS[p.shape], half = lerp(13, 21, p.width) * (0.62 + 0.38 * s);
  const out = [];
  for (let i = 0; i < n; i++) {
    const bottom = Math.round(GROUND - STUB * s - i * STEP * s) + bounce(i);
    // every tier reaches up to the tip of the one above it, so no gap can open; each is narrower than the one below
    const top = Math.round(GROUND - STUB * s - (i + 1) * STEP * s - (i === n - 1 ? (TOP - STEP) * s : 8 * s));
    out.push({ top, bottom, half: half * (1 - (0.62 * i) / n), seed: i + 1, teeth: Math.max(3, 6 - i) });
  }
  return { list: out, s, height: GROUND - out[n - 1].top };
}

export default defineSprite({
  id: 'tree-pine',
  name: 'Pine tree',
  kind: 'Item',
  blurb: 'A pointed fir tree for a top-down map, in tiers that sway from the tip; change its size, height, width, snow and colours.',
  meta: {
    type: 'prop', role: 'world/prop', themes: ['fantasy', 'forest'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['tree', 'pine', 'fir', 'evergreen', 'conifer', 'forest', 'woods', 'snow', 'winter', 'sway', 'shake', 'needles'], license: 'draft',
  },
  size: [W, H],
  pivot: [CX, GROUND],
  preview: 'sway',
  sounds: { shake: [{ sound: 'footstep-grass', frame: 0, preset: 'Tall grass', volume: 0.6 }] },
  params: {
    size: range('Size', 0.6, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'medium', ['short', 'medium', 'tall']),
    width: range('Width', 0.5, { lo: 'Narrow', hi: 'Wide' }),
    snowy: toggle('Snowy', false),
    leaf: color('Needles', HV.pine, swatches('hearthvale', 'leaf', { lead: 'pine' }).filter((c) => c !== HV.wheat && c !== HV.roof)),
    wood: color('Wood', HV.wood, swatches('hearthvale', 'wood').filter((c) => c !== HV.wheat)),
    sway: range('Sway', 0.5, { lo: 'Still', hi: 'Swaying', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    sway: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    shake: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, p }) {
    const leaf = ramp(p.leaf), wood = ramp(p.wood), snow = ramp(HV.cream);
    const fade = clip === 'shake' ? (1 - t) ** 1.2 : 0;
    // shake: the tiers hop one after another, lowest first
    const { list, s, height } = tiers(p, (i) => (fade ? Math.round(1.4 * fade * Math.sin(TAU * (2.5 * t + 0.1 - 0.16 * i))) : 0));
    const body = new Surface(W, H), box = [0, 0, W, H];

    const tw = Math.max(3, Math.round(6 * s));
    const trunk = trunkIn(CX, GROUND, tw, STUB * s + 8, { flare: 1 + Math.round(s), foot: 3 });
    body.fill(...box, trunk, wood, { shade: 1 });
    body.fill(...box, (px, py) => trunk(px, py) && py < GROUND - Math.round(STUB * s) + 1, wood.dark, { shade: 0 });   // in the shade of the lowest tier

    const drawn = [trunk];                                   // every shape so far: what a tier's shadow and ink line may fall on
    list.forEach((tier, i) => {
      const shape = tierIn(CX, tier.top, tier.bottom, tier.half, { teeth: tier.teeth, jag: Math.max(2, Math.round(3.4 * s)), droop: 0.22, seed: tier.seed });
      const under = drawn.slice(), onTree = (px, py) => under.some((f) => f(px, py));
      // the shadow this tier casts on the one below, then the tier itself over an ink line of its own
      if (i > 0) body.fill(...box, (px, py) => shape(px, py - 3) || shape(px + 1, py - 2), leaf.dark, { clip: (px, py) => onTree(px, py) && py > tier.bottom - 8 });
      body.fill(...box, shape, leaf, { shade: 2, outline: i > 0 ? INK : undefined, clip: i > 0 ? (px, py) => py >= tier.top + 1 && (shape(px, py) || onTree(px, py)) : undefined });
      drawn.push(shape);
      // lit boughs down the right-hand slope, where the light falls
      const hgt = tier.bottom - tier.top;
      for (const [u, v, len] of [[0.3, 0.5, 3], [0.5, 0.72, 4], [0.12, 0.74, 3], [0.68, 0.86, 3]]) {
        const x0 = Math.round(CX + u * tier.half), y0 = Math.round(tier.top + v * hgt * 0.8);
        for (let k = 0; k < len; k++) if (shape(x0 + k + 0.5, y0 + Math.floor(k / 2) + 0.5) && shape(x0 + k + 2.5, y0 + Math.floor(k / 2) + 0.5)) body.dot(x0 + k, y0 + Math.floor(k / 2), leaf.light);
      }
      if (p.snowy) {
        // snow lies on the tier and leaves a fringe of needles showing under it
        const fringe = Math.max(3, Math.round(4 * s));
        const lying = (px, py) => shape(px, py) && shape(px, py + fringe) && shape(px - 2, py + fringe - 1) && shape(px + 2, py + fringe - 1);
        body.fill(...box, lying, snow, { shade: 2 });
      }
    });

    // the whole tree leans from its foot, so the tip sways most; the lean is in whole pixels per row
    const reach = clip === 'sway' ? lerp(1, 2.8, p.sway) * wave(t) : clip === 'shake' ? lerp(2, 3.2, p.sway) * fade * Math.sin(TAU * (2.5 * t + 0.1)) : 0;
    g.blit(reach ? lean(body, GROUND, reach / height) : body);
    g.outline(INK);

    // shake: needles (or snow) come down and lie at the foot of the tree. Needles are in the tree's two darker tones:
    // they fall beside the tree, over the ground, and a pine's light tone is the colour of meadow grass
    if (clip === 'shake') leafFall(g, { t, count: 4, x: CX, y: GROUND - height * 0.55, spread: list[0].half * 0.9, floor: GROUND - 1, colours: p.snowy ? [snow.base, snow.light] : [leaf.base, leaf.dark], box: [2, 2, W - 3, GROUND] });
  },
});
