// Oak tree: a broad tree for the Hearthvale map, seen from the south (three-quarter view). Its trunk stands on the
// pivot and its crown rises above, so a game that sorts sprites by their pivot row lets a character walk behind it.
// The crown, its leaf marks, the trunk and the falling leaves are the framework's (engine/foliage.js); this file
// says how big each is, where the fruit hangs and how the tree sways and shakes.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { ramp, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { crownLobes, crownTufts, crownIn, leafMarks, trunkIn, leafFall } from '../engine/foliage.js';

const HV = PALETTE.hearthvale;
const W = 64, H = 80, CX = 32, GROUND = 76;                // the lowest trunk row is GROUND - 1; the outline lands on GROUND
// Each crown at Size "Big": its box in px, and how much trunk shows under it.
const CROWN = {
  round: { w: 54, h: 42, trunk: 18 },
  wide: { w: 56, h: 32, trunk: 22 },
  layered: { w: 48, h: 52, trunk: 14 },
};
// Where fruit hangs: [leaf mass, x, y] with x, y in that mass's own radii. Apples take the first seven.
const FRUIT = [[1, -0.1, 0.3], [2, 0.3, 0.35], [0, -0.35, 0.1], [3, 0.15, 0.35], [2, -0.3, -0.25], [1, -0.5, -0.35], [3, -0.5, -0.1], [0, 0.4, -0.3], [3, 0.55, -0.2], [1, -0.45, -0.2], [0, 0.0, -0.55], [2, 0.5, -0.1]];

/** Where everything is this frame: the leaf masses, the trunk and how far the shake has got. */
function tree(clip, t, p) {
  const s = lerp(0.62, 1, p.size), c = CROWN[p.shape];
  const w = c.w * s, h = c.h * s, bottom = GROUND - c.trunk * s, cy = bottom - h / 2;
  // sway: a slow lean, the masses out of step. shake: a fast rustle that dies away
  const sway = clip === 'sway' ? lerp(1, 2.6, p.sway) : clip === 'shake' ? lerp(2.2, 3.4, p.sway) * (1 - t) ** 1.3 : 0;
  const lobes = crownLobes({ cx: CX, cy, w, h, shape: p.shape, sway, t: clip === 'shake' ? t + 0.1 : t, cycles: clip === 'shake' ? 2.5 : 1 });
  // a big crown has no room to lean in the frame: hold each mass inside it
  for (const l of lobes) { l.x = Math.min(W - 4 - l.rx, Math.max(4 + l.rx, l.x)); l.y = Math.max(4 + l.ry, l.y); }
  // tufts of leaves round the outside, behind the masses, so the outline is leafy; they ride on their mass
  const all = [...crownTufts(lobes, { size: 2.5 + 2 * s }), ...lobes];
  for (const l of all) { l.x = Math.min(W - 2 - l.rx, Math.max(2 + l.rx, l.x)); l.y = Math.max(2 + l.ry, l.y); }
  const tw = Math.max(4, Math.round(lerp(6, 13, p.thickness) * (0.6 + 0.4 * s)));
  return { lobes, all, tw, cy, bottom, s };
}

export default defineSprite({
  id: 'tree-oak',
  name: 'Oak tree',
  kind: 'Item',
  blurb: 'A broad leafy tree for a top-down map that sways in the wind and drops leaves when shaken; change its size, crown, trunk, fruit and colours.',
  meta: {
    type: 'prop', role: 'world/prop', themes: ['fantasy', 'forest'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['tree', 'oak', 'apple tree', 'forest', 'woods', 'leaves', 'trunk', 'orchard', 'sway', 'shake', 'shade', 'nature'], license: 'draft',
  },
  size: [W, H],
  pivot: [CX, GROUND],
  preview: 'sway',
  sounds: { shake: [{ sound: 'footstep-grass', frame: 0, preset: 'Tall grass', volume: 0.6 }] },
  params: {
    size: range('Size', 0.8, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', ['round', 'wide', 'layered']),
    thickness: range('Thickness', 0.5, { lo: 'Thin', hi: 'Chunky' }),
    // fruit
    fruit: choice('Fruit', 'none', ['none', 'apples', 'blossom']),
    fruitColour: color('Colour', HV.roof, swatches('hearthvale', 'accent', { lead: 'roof' })),
    leaf: color('Leaves', HV.leaf, swatches('hearthvale', 'leaf').filter((c) => c !== HV.roof)),
    wood: color('Wood', HV.wood, swatches('hearthvale', 'wood').filter((c) => c !== HV.wheat)),   // wheat is a leaf colour: bark never matches the leaves
    sway: range('Sway', 0.5, { lo: 'Still', hi: 'Swaying', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: { fruit: { label: 'Fruit', params: ['fruit', 'fruitColour'], none: 'none' } },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    sway: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    shake: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, p }) {
    const { lobes, all, tw, cy, bottom } = tree(clip, t, p);
    const leaf = ramp(p.leaf), wood = ramp(p.wood);
    const box = [0, 0, W, H];

    // the trunk, up into the crown; its top is in the crown's shade, and the bark has a few dark seams
    const trunk = trunkIn(CX, GROUND, tw, GROUND - cy, { flare: Math.max(2, Math.round(tw * 0.5)), foot: Math.max(4, Math.round(tw * 0.7)) });
    g.fill(...box, trunk, wood, { shade: tw > 7 ? 2 : 1 });
    g.fill(CX - tw, bottom - 2, CX + tw, bottom + 4, (px, py) => trunk(px, py) && py < bottom + 3, wood.dark, { shade: 0 });
    if (tw >= 6) for (const [dx, y0, len] of [[1, bottom + 5, 5], [-1, bottom + 9, 4]]) {
      const x = CX + dx * Math.round(tw / 4);
      for (let y = y0; y < Math.min(GROUND - 3, y0 + len); y++) g.dot(x, y, wood.dark);
    }

    // the crown: every leaf mass painted as one body, rimmed where it hangs over the trunk, then lit mass by mass
    g.fill(...box, crownIn(all, 1), INK, { clip: trunk });
    g.fill(...box, crownIn(all), leaf, { shade: 2 });
    leafMarks(g, all, { light: leaf.light, dark: leaf.dark });

    // fruit hangs in the masses and moves with them
    if (p.fruit !== 'none') {
      const fruit = ramp(p.fruitColour), petal = mix(fruit.light, '#ffffff', 0.5);
      const n = p.fruit === 'apples' ? 7 : FRUIT.length;
      FRUIT.slice(0, n).forEach(([m, fx, fy]) => {
        const l = lobes[m % lobes.length], x = Math.round(l.x + fx * l.rx), y = Math.round(l.y + fy * l.ry);
        if (p.fruit === 'apples') {
          // an apple, 4 px across: round, lit at the top right, dark underneath
          g.rect(x - 1, y - 2, 2, 4, fruit.base); g.rect(x - 2, y - 1, 4, 2, fruit.base);
          g.dot(x - 2, y, fruit.dark); g.rect(x - 1, y + 1, 2, 1, fruit.dark);
          g.dot(x, y - 1, fruit.light);
        } else {
          g.rect(x - 1, y, 3, 1, petal); g.rect(x, y - 1, 1, 3, petal);
          g.dot(x, y, fruit.base);
        }
      });
    }
    g.outline(INK);

    // shake: four leaves come down and lie at the foot of the tree
    if (clip === 'shake') leafFall(g, { t, count: 4, x: CX, y: bottom - 3, spread: 20 * lerp(0.62, 1, p.size), floor: GROUND - 1, colours: [leaf.light, leaf.base], box: [2, 2, W - 3, GROUND] });
  },
});
