// Bubbles taken apart for an opening clip (added with batch K23, bundles/specs/core-sprites-3.md). thoughtBubble
// (engine/bubbles.js) draws a cloud and its trail of puffs in one call; an opening that shows the puffs one by one,
// smallest first, and then grows the cloud from the largest needs them apart. Built only from what thoughtBubble
// draws and returns, so the pieces put back together are exactly the whole bubble.
//
//   const k = thoughtPieces(96, 48, 1, 1, 94, 46, { style, trail, face, frame, accent, border, shadow });
//   for (const p of k.puffs.slice(0, n)) g.blit(p.surface);      // the first n puffs, smallest first
//   const r = bubbleGrow(k.cloudBox, k.puffs[2].centre, 0.5);     // the cloud half grown from the largest puff
//   thoughtBubble(g, r.x, r.y, r.w, r.h, { ...opt, trail: 'none' });

import { Surface } from './surface.js';
import { col } from './color.js';
import { thoughtBubble } from './bubbles.js';

// The pixels where two surfaces differ, as indices.
function differ(a, b) {
  const out = [];
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) out.push(i);
  return out;
}

// The trail-less box that draws the same cloud body as the box (x, y, w, h) with its trail.
function cloudBoxOf(W, H, x, y, w, h, opt, body) {
  const none = { ...opt, trail: 'none' }, probe = thoughtBubble(new Surface(W, H), x, y, w, h, none).body;
  return { x: x + body.x - probe.x, y: y + body.y - probe.y, w: w + body.w - probe.w, h: h + body.h - probe.h };
}

/**
 * Draws a thought bubble on scratch surfaces and takes it apart: returns { full, cloud, cloudBox, puffs, out }; `puffs` are the trail's puffs smallest first, each { surface, centre } with its own drop shadow, and the cloud with every puff blitted on it is `full`.
 * Arguments: W, H (the frame size); x, y, w, h and opt (exactly as for thoughtBubble of engine/bubbles.js). `cloudBox` is the box that draws the same cloud with trail 'none'; `out` is what thoughtBubble returned.
 */
export function thoughtPieces(W, H, x, y, w, h, opt = {}) {
  const full = new Surface(W, H), out = thoughtBubble(full, x, y, w, h, opt);
  const cloudBox = cloudBoxOf(W, H, x, y, w, h, opt, out.body);
  const cloud = new Surface(W, H);
  thoughtBubble(cloud, cloudBox.x, cloudBox.y, cloudBox.w, cloudBox.h, { ...opt, trail: 'none' });
  if ((opt.trail ?? 'down-left') === 'none') return { full, cloud, cloudBox, puffs: [], out };
  // the puffs alone, without their shadow: the same body drawn with shadow off
  const SH = 2, sh = opt.shadow ? SH : 0;
  const bare = new Surface(W, H), bareCloud = new Surface(W, H), noShadow = { ...opt, shadow: false };
  thoughtBubble(bare, x + sh, y, w - sh, h - sh, noShadow);
  thoughtBubble(bareCloud, cloudBox.x + sh, cloudBox.y, cloudBox.w - sh, cloudBox.h - sh, { ...noShadow, trail: 'none' });
  const own = differ(bare, bareCloud), face = col(opt.face);
  // each puff's face, joined side by side; then every other pixel of it to the nearest face
  const label = new Int32Array(W * H).fill(-1), faces = [];
  for (const i of own) {
    if (bare.data[i] !== face || label[i] >= 0) continue;
    const n = faces.length, list = [i], stack = [i];
    label[i] = n;
    while (stack.length) {
      const j = stack.pop(), jx = j % W;
      for (const k of [jx > 0 ? j - 1 : -1, jx < W - 1 ? j + 1 : -1, j - W, j + W]) {
        if (k < 0 || k >= W * H || label[k] >= 0 || bare.data[k] !== face || !own.includes(k)) continue;
        label[k] = n; list.push(k); stack.push(k);
      }
    }
    faces.push(list);
  }
  const near = (i) => {
    const px = i % W, py = (i - px) / W;
    let best = 0, bd = Infinity;
    faces.forEach((list, n) => { for (const j of list) { const d = (j % W - px) ** 2 + (Math.floor(j / W) - py) ** 2; if (d < bd) { bd = d; best = n; } } });
    return best;
  };
  const owner = new Map();
  for (const i of own) owner.set(i, label[i] >= 0 ? label[i] : near(i));
  // the drop shadow: what the whole bubble adds beyond the bare puffs, given to the puff 2 px up and to the right
  for (const i of differ(full, cloud)) {
    if (owner.has(i) && full.data[i] === bare.data[i]) continue;
    const px = i % W, py = (i - px) / W, src = (py - SH) * W + px + SH;
    owner.set(i, (px + SH < W && owner.get(src)) ?? owner.get(i) ?? near(i));
  }
  const puffs = faces.map((list) => {
    let sx = 0, sy = 0;
    for (const j of list) { sx += j % W; sy += Math.floor(j / W); }
    const cx = Math.round(sx / list.length - 0.01), cy = Math.round(sy / list.length - 0.01);
    const c = list.reduce((b, j) => ((j % W - cx) ** 2 + (Math.floor(j / W) - cy) ** 2 < (b % W - cx) ** 2 + (Math.floor(b / W) - cy) ** 2 ? j : b), list[0]);
    return { surface: new Surface(W, H), centre: { x: c % W, y: Math.floor(c / W) }, n: list.length };
  });
  for (const i of differ(full, cloud)) puffs[owner.get(i)].surface.data[i] = full.data[i];
  // smallest first, by the size of the face (a shadow can be hidden under the cloud or the next puff)
  puffs.sort((a, b) => a.n - b.n);
  return { full, cloud, cloudBox, puffs: puffs.map(({ surface, centre }) => ({ surface, centre })), out };
}

/**
 * Turns the 2 px sparkles of a dream cloud (thoughtBubble style 'dream') into 5 px plus sparkles beside its top corners and adds a 2 px one beside each bottom corner, on empty pixels inside the box only: big enough to see at 1x.
 * Arguments: g; body (the `body` thoughtBubble returned); accent (the sparkle colour); box ({ x, y, w, h }: the box the cloud was drawn in; nothing is drawn outside it).
 */
export function dreamSparkles(g, body, accent, box) {
  const B = body, R = B.x + B.w - 1, Bt = B.y + B.h - 1;
  const inBox = (px, py) => px >= box.x && py >= box.y && px < box.x + box.w && py < box.y + box.h;
  const marks = [];
  for (const [cx, cy] of [[B.x - 3, B.y - 2], [R + 3, B.y - 2]]) for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) marks.push([cx + dx, cy + dy]);
  for (const [cx, cy, s] of [[B.x - 3, Bt + 3, 1], [R + 3, Bt + 3, -1]]) marks.push([cx, cy], [cx + s, cy - 1]);
  for (const [px, py] of marks) if (inBox(px, py) && (!g.get(px, py) || g.get(px, py) === col(accent))) g.dot(px, py, accent);
}
