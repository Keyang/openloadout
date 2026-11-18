// Boulder: a rock that blocks a path on the map until it is broken, seen from above and in front. One big stone,
// a low slab, or a cluster of three stacked against each other; moss on its top, cracks that grow with Wear.
//   idle    the resting state
//   hurt    the hit: white on the first frame, squashed and knocked aside, then it settles
//   break   it splits from its middle along the lines its cracks follow; the pieces fly out, tumble, wear down to
//           rubble and stay where they come to rest, in a little dust
// The stones are rock() and rockBreak() of engine/fx.js, with the seams and cracks of engine/rock.js: the pieces of
// the break keep the stone's own outline, chips and moss.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { lerp, PI, TAU } from '../engine/motion.js';
import { ramp, tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { rock, rockIn, rockBreak, puffs } from '../engine/fx.js';
import { seam, crack } from '../engine/rock.js';
import { hitWobble } from '../engine/breaking.js';
import { boundsOf } from '../engine/shapes.js';

const HV = PALETTE.hearthvale;
const W = 48, CX = 24, GROUND = 43;       // the lowest body row; its outline lands on the pivot row
const BOX = [1, 1, W - 1, GROUND + 1];
const TURN = 0.45;                        // the angle of the first line the main stone breaks on

// The stones of each shape, the main one first: dx, dy (where its middle is, as a share of the boulder's radius),
// k (its own radius as a share of it), squash (its height as a share of its width), and what makes its outline.
// moss: where on the stone the moss lies (radians: -PI / 2 is its top); share: its share of the pieces when it breaks.
const SHAPES = {
  round: [{ dx: 0, dy: 0, k: 1, squash: 0.86, seed: 5, sides: 8, jag: 0.2, moss: -1.9, share: 1 }],
  slab: [{ dx: 0, dy: 0, k: 1.1, squash: 0.58, seed: 11, sides: 7, jag: 0.12, moss: -1.9, share: 1 }],
  cluster: [
    { dx: -0.22, dy: -0.25, k: 0.78, squash: 0.9, seed: 5, sides: 8, jag: 0.16, moss: -2.0, share: 0.6 },
    { dx: 0.58, dy: 0.22, k: 0.5, squash: 0.85, seed: 23, sides: 7, jag: 0.14, moss: -1.2, share: 0.25 },
    { dx: -0.62, dy: 0.34, k: 0.38, squash: 0.8, seed: 31, sides: 6, jag: 0.12, moss: -2.4, share: 0.15 },
  ],
};

// Where each stone is this frame: standing on the ground line, centred. squash, shift: the wobble of a hit.
function layout(p, { squash = 0, shift = 0 } = {}) {
  const R = lerp(12, 17, p.size) + squash * 0.5;
  const parts = SHAPES[p.shape].map((s) => ({ ...s, x: CX + s.dx * R, y: 24 + s.dy * R, r: R * s.k, squash: s.squash * (1 - squash * 0.06) }));
  const b = boundsOf(parts.map((s) => rockIn(s.x, s.y, s.r, s)), W);
  const dx = Math.round(CX - (b.x0 + b.x1 + 1) / 2) + shift, dy = GROUND - b.y1;
  return parts.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy }));
}
// What rock() and rockBreak() are both given for one stone, so the pieces are the stone.
const look = (p, s, i) => ({
  x: s.x, y: s.y, r: s.r, squash: s.squash, seed: s.seed, sides: s.sides, jag: s.jag, colour: p.stone,
  chips: i === 0 ? Math.round(p.wear * 2) : 0,
  patch: p.mossy ? { colour: p.accent, size: i ? 0.5 : 0.42, at: s.moss } : null,
  box: BOX,
});
// How many pieces each stone breaks into: the main stone takes most of them.
const piecesOf = (p, s) => Math.max(2, Math.round(lerp(3, 7, p.pieces) * s.share));

function drawWhole(g, p, parts) {
  const stone = ramp(p.stone), cracks = Math.round(p.wear * 3);
  // the far stones first: each one's seam darkens what it leans on
  parts.forEach((s, i) => {
    const body = rock(g, look(p, s, i));
    if (i) seam(g, body, stone.deep);
    if (i) return;
    // cracks on the main stone, from its middle out along the lines it will break on
    const n = piecesOf(p, s);
    for (let c = 0; c < Math.min(cracks, n); c++) {
      const a = TURN + (TAU * c) / n, away = Math.atan2(Math.cos(a), Math.sin(a) * s.squash);
      crack(g, s.x + Math.cos(a) * s.r * 0.18, s.y + Math.sin(a) * s.r * 0.18 * s.squash, away, Math.round(s.r * 0.7), stone.dark, { seed: 3 + c, clip: body, jag: 0.5, branch: p.wear >= 0.8 });
    }
  });
}

export default defineSprite({
  id: 'boulder',
  name: 'Boulder',
  kind: 'Item',
  blurb: 'A boulder that blocks the way until it is smashed to rubble. Make it round, a slab or a cluster, mossy or bare, cracked or whole, and change its size and colours.',
  meta: { type: 'prop', role: 'world/prop', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['boulder', 'rock', 'stone', 'obstacle', 'rubble', 'block', 'break', 'smash', 'hit', 'blocked path', 'mossy', 'heavy'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND + 1],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', [{ value: 'round', label: 'Round' }, { value: 'slab', label: 'Slab' }, { value: 'cluster', label: 'Cluster' }]),
    mossy: toggle('Mossy', true),
    wear: range('Wear', 0.5, { lo: 'New', hi: 'Worn' }),
    pieces: range('Pieces', 0.5, { lo: 'Few', hi: 'Many' }),
    stone: color('Stone', HV.cobble, swatches('hearthvale', 'stone')),
    accent: color('Moss', HV.leaf, swatches('hearthvale', 'growth'), { when: { mossy: [true] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    hurt: { frames: 4, fps: (p) => 9 * lerp(0.65, 1.45, p.speed), loop: false },
    break: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: {
    hurt: [{ sound: 'punch', preset: 'Light jab', frame: 0, volume: 0.9 }],
    break: [{ sound: 'stone-door', preset: 'Secret wall', frame: 0, volume: 0.7 }],
  },

  render(g, { clip, frame, t, p }) {
    if (clip === 'break') {
      // every stone comes apart on a layer of its own, so each piece gets its own line where two overlap
      const parts = layout(p), R = parts[0].r;
      parts.forEach((s, i) => {
        const bits = new Surface(W, W);
        rockBreak(bits, { ...look(p, s, i), t, pieces: piecesOf(p, s), turn: TURN + i, uneven: 0, dist: R * (i ? 0.45 : 0.6), gravity: 3, spin: 0.18, shrink: 0.55, seam: '#ffffff' });
        g.blit(bits.outline(INK));
      });
      // dust, after the outline: thick as the stone parts, a few wisps at the end
      const stone = ramp(p.stone);
      if (frame >= 1) puffs(g, { t: (frame - 1) / 6, x: CX, y: GROUND - 3, count: 3, seed: 4, angle: PI, arc: 2.6, dist: R * 0.9, rise: 3, size: 2.2, floor: GROUND, colours: [tone(p.stone, 0.45), p.stone, stone.dark], box: BOX });
      return;
    }
    const [squash, shift] = clip === 'hurt' ? hitWobble(frame) : [0, 0];
    drawWhole(g, p, layout(p, { squash, shift }));
    if (clip === 'hurt' && frame === 0) g.tint('#ffffff');
    g.outline(INK);
  },
});
