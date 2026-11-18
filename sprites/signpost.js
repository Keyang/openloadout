// Signpost: a wooden board on a post, with a picture instead of words. Three builds (an arrow
// board, a plain board nailed off-centre, a board hanging from an arm), each pointing right,
// left or both ways. The sign is drawn upright on its own layer; `wobble` leans that layer row
// by row with lean(), so the post stays one clean line, and a hanging board swings a step behind.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { ramp, tone, pick, INK } from '../engine/color.js';
import { Surface, polyIn, rectIn, tilt, lean, leanRoom } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { markIn } from '../engine/marks.js';
import { capIn, crack } from '../engine/rock.js';

const P = PALETTE.thornwood;
const W = 32, H = 48, GROUND = 45;        // the lowest body row; its outline lands on the pivot row
const SWING = [0, 0.13, -0.09, 0.05, -0.02, 0];   // wobble: knocked right, back past upright, settle

// Where everything is, for one look. `side` is +1 when the sign points right, -1 left, 0 both.
function layout(p) {
  const tall = Math.round(lerp(22, 38, p.height)), top = GROUND + 1 - tall;
  const side = p.points === 'right' ? 1 : p.points === 'left' ? -1 : 0;
  const flip = (x, w = 0) => (side < 0 ? W - x - w : x);          // mirror a column (or a box w wide) for "left"
  if (p.style === 'hanging') {
    const post = side === 0 ? 15 : flip(7, 3);
    const arm = side === 0 ? [6, 20] : [flip(7, 19), 19];
    const board = side === 0 ? [8, 16] : [flip(11, 15), 15];
    return { tall, top, side, post, arm, bx: board[0], bw: board[1], by: top + 6, bh: 10, mark: 7 };
  }
  if (p.style === 'board') {
    const bx = side > 0 ? 9 : 5, bw = side === 0 ? 22 : 18;
    return { tall, top, side, post: 15, bx, bw, by: top + 2, bh: 11, mark: 9 };
  }
  return { tall, top, side, post: 15, bx: side > 0 ? 5 : side < 0 ? 9 : 9, bw: side === 0 ? 14 : 18, by: top + 2, bh: 9, mark: 7 };
}

// The outline of the board, as a shape test.
function boardIn(p, L) {
  const { bx, bw, by, bh, side } = L, x1 = bx + bw, y1 = by + bh, yc = by + bh / 2;
  if (p.style !== 'arrow') {
    // a plank with its corners knocked off
    return (px, py) => px >= bx && px < x1 && py >= by && py < y1 && !((px < bx + 1 || px >= x1 - 1) && (py < by + 1 || py >= y1 - 1));
  }
  if (side > 0) return polyIn([[bx, by], [x1, by], [x1 + 4.5, yc], [x1, y1], [bx, y1], [bx + 2.5, yc]]);     // a point, and a notched tail
  if (side < 0) return polyIn([[x1, by], [bx, by], [bx - 4.5, yc], [bx, y1], [x1, y1], [x1 - 2.5, yc]]);
  return polyIn([[bx, by], [x1, by], [x1 + 4.5, yc], [x1, y1], [bx, y1], [bx - 4.5, yc]]);                   // a point at each end
}

// The picture on the board. An arrow follows the way the sign points.
function pictureIn(p, L) {
  const cx = Math.floor(L.bx + L.bw / 2), cy = L.by + (L.bh >> 1);
  if (p.mark !== 'arrow') return markIn(p.mark, cx, cy, L.mark);
  if (L.side !== 0) return markIn('arrow', cx, cy, L.mark, { flip: L.side < 0 });
  // both ways: two small arrows back to back, sharing one shaft
  const half = L.mark >= 9 ? 7 : 5, off = L.mark >= 9 ? 2 : 1;
  const right = markIn('arrow', cx + off, cy, half), left = markIn('arrow', cx - off, cy, half, { flip: true });
  return (px, py) => right(px, py) || left(px, py);
}

// The whole sign on its own layer, not yet outlined. swing: px the hanging board lags to the side.
function sign(p, swing = 0) {
  const L = layout(p), s = new Surface(W, H);
  const wood = ramp(p.wood), moss = ramp(P.moss);
  const behind = ramp(tone(p.wood, -0.5));                                   // the post stands behind the board: half a tone down
  const worn = p.wear;

  // ---- the post ----
  s.rect(L.post, L.top, 3, GROUND + 1 - L.top, behind, { light: 1 });
  s.rect(L.post, L.top, 3, 1, wood.light);                                   // the sawn top catches the light
  if (worn > 0.7) crack(s, L.post + 1, GROUND - 3, Math.PI, 6, wood.deep, { seed: 5, clip: rectIn(L.post, L.top, 3, 99), branch: false });
  if (p.style === 'hanging') {
    const [ax, aw] = L.arm, ay = L.top + 2;
    s.rect(ax, ay, aw, 2, wood, { light: 1 });
    // a brace under the arm, on each side that carries it
    for (const dir of L.side === 0 ? [-1, 1] : [L.side]) s.limb(L.post + 1 + dir * 2, ay + 6, L.post + 1 + dir * 6, ay + 2, 1, wood.dark);
    // two short chains down to the board
    for (const cx of [L.bx + 2, L.bx + L.bw - 3]) s.rect(cx + swing, ay + 2, 1, 2, P.slate);
  }

  // ---- the board, on its own layer so an old sign can hang crooked ----
  let b = new Surface(W, H);
  const whole = boardIn(p, L);
  const chip = worn > 0.45 ? polyIn([[L.bx + L.bw - 4, L.by + L.bh + 1], [L.bx + L.bw + 1, L.by + L.bh - 4], [L.bx + L.bw + 6, L.by + L.bh + 1]]) : null;   // a bite out of a lower corner
  const board = chip && p.style !== 'arrow' ? (px, py) => whole(px, py) && !chip(px, py) : whole;
  b.fill(L.bx - 6, L.by, L.bx + L.bw + 6, L.by + L.bh, board, wood, { shade: 1, light: 1 });
  if (p.style === 'board') b.fill(L.bx, L.by + 5, L.bx + L.bw, L.by + 6, (px, py) => py >= L.by + 5 && py < L.by + 6 && board(px, py), wood.dark);   // two planks
  if (worn > 0.15) crack(b, L.bx + Math.round(L.bw * 0.3), L.by, 0.3, lerp(2, 7, worn), wood.dark, { seed: 2, clip: board, branch: worn > 0.6 });
  if (worn > 0.5) crack(b, L.bx + L.bw - 5, L.by + L.bh - 1, Math.PI - 0.3, lerp(2, 6, worn), wood.deep, { seed: 4, clip: board, branch: false });
  if (worn > 0.45 && p.style === 'arrow') b.fill(L.bx, L.by + L.bh - 2, L.bx + L.bw, L.by + L.bh, (px, py) => board(px, py) && py >= L.by + L.bh - 1 && Math.abs(px - (L.bx + L.bw * 0.62)) < 1.5, wood.deep);   // a split in its lower edge
  if (p.mark !== 'none') b.fill(L.bx, L.by, L.bx + L.bw, L.by + L.bh, pictureIn(p, L), pick(p.wood, P.cream, tone(p.wood, -2.2)), { clip: board });
  if (p.mossy) {
    b.fill(L.bx - 6, L.by - 2, L.bx + L.bw + 6, L.by + L.bh, capIn(board, [L.bx - 6, L.by - 1, L.bx + L.bw + 6, L.by + L.bh], { depth: 2, rise: 1, ragged: 2, seed: 3 }), moss);
  }
  if (worn > 0.6) b = tilt(b, L.bx + L.bw / 2, L.by + L.bh / 2, lerp(0.04, 0.1, (worn - 0.6) / 0.4) * (L.side < 0 ? -1 : 1));
  s.blit(b, p.style === 'hanging' ? swing : 0, 0);
  if (p.style !== 'hanging') s.rect(L.post + 1, L.by + 2, 1, 1, wood.deep).rect(L.post + 1, L.by + L.bh - 3, 1, 1, wood.deep);   // two nails through the board into the post

  // ---- moss at the foot and on the top of the post ----
  if (p.mossy) {
    s.rect(L.post - 2, GROUND - 1, 7, 2, moss).rect(L.post - 1, GROUND - 3, 2, 2, moss).rect(L.post + 2, GROUND - 2, 2, 1, moss);
    if (p.style !== 'hanging') s.rect(L.post, L.top - 1, 2, 1, moss.base);
  }
  return s;
}

export default defineSprite({
  id: 'signpost',
  name: 'Signpost',
  kind: 'Item',
  blurb: 'A wooden sign on a post with a picture mark and no words. Change its build, which way it points, its picture, height, moss and wear.',
  meta: { type: 'prop', role: 'world/prop', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side',
    words: ['sign', 'signpost', 'post', 'board', 'arrow', 'direction', 'point', 'wobble', 'warning', 'tutorial', 'hint', 'wooden', 'mossy'], license: 'draft' },
  size: [W, H],
  pivot: [16, GROUND + 1],
  params: {
    style: choice('Style', 'arrow', ['arrow', 'board', 'hanging']),
    points: choice('Points', 'right', ['right', 'left', 'both']),
    mark: choice('Picture', 'none', ['none', 'arrow', 'skull', { value: 'exclaim', label: 'Warning' }]),
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    mossy: toggle('Mossy', false),
    wood: color('Wood', P.wood, swatches('thornwood', 'wood')),
    wear: range('Wear', 0.25, { lo: 'New', hi: 'Worn' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    wobble: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, frame, p }) {
    if (clip === 'idle') { g.blit(sign(p)); g.outline(INK); return; }
    // wobble: the whole sign sways from the foot of its post, as far as the widest look has room for
    const sway = SWING[frame] ?? 0;
    const slope = sway * Math.min(1, leanRoom(sign(p), GROUND + 1) / 0.13);   // 0.13 is the widest sway: less when the top has no room to travel
    const s = sign(p, -Math.sign(sway) * (Math.abs(sway) > 0.06 ? 1 : 0));   // a hanging board lags behind
    g.blit(slope ? lean(s, GROUND + 1, slope) : s);
    g.outline(INK);
  },
});
