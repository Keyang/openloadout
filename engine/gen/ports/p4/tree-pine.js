// PORT (migration batch P4): the drawing of the code sprite sprites/tree-pine.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims (engine/gen/ports/colour.js) and at the ported engine helpers
// (engine/gen/ports/p4/, engine/gen/ports/e2/), so it draws paint refs on an engine/gen/port-surface.js grid. It is the
// drawing of the generator tree.pine@1 (engine/gen/world-p4.js), which sprites/tree-pine.json names; it goes only with the last
// version that draws with it. Its settings (p) are that generator's arguments; its colours are the paint refs the data
// file names. A HAND CHANGE note says where it differs from its source (the frozen copy
// tests/fixtures/code-sprites/tree-pine.js); never change what a released generator version draws through it.
// Pine tree: a pointed fir for the Hearthvale map, seen from the south (three-quarter view). Its trunk stands on the
// pivot and its tiers rise above, so a game that sorts sprites by their pivot row lets a character walk behind it.
// The tiers, the trunk and the falling needles are the framework's (engine/foliage.js) and the lean is the Surface's
// own (lean in engine/surface.js); this file says how many tiers there are, how each is lit, and how the tree moves.
import { Surface, lean } from './surface.js';
import { lerp, wave, TAU } from '../../../motion.js';
import { ramp, INK } from '../colour.js';
import { PALETTE, swatches } from '../e2/palettes.js';
import { tierIn, trunkIn, leafFall } from '../e2/foliage.js';

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

/** The old sprite's render: draws one frame of clip `clip` at phase t (frame `frame`) with settings p on the grid g. */
export function render(g, { clip, t, p }) {
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
}
