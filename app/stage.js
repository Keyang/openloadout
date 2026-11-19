// The little scene behind the sprite in the preview. Drawn in sprite pixels so
// the backdrop and the sprite share one pixel grid. Which backdrops suit a sprite depends on what it is
// (backdropFor): a character stands on the ground, an interface piece sits on a panel, a background is the frame.
import { hash } from '../engine/motion.js';

export const STAGES = [
  { id: 'meadow', label: 'Meadow' },
  { id: 'cave', label: 'Cave' },
  { id: 'plain', label: 'Plain' },
];
/** Backdrops for an interface piece: a plain panel, as a menu or a game screen would sit on. */
export const PANELS = [
  { id: 'panel-light', label: 'Light panel' },
  { id: 'panel-dark', label: 'Dark panel' },
];

/**
 * What a sprite is previewed on, from its catalogue row or its meta ({ type, role }):
 *   'panel'  an interface piece (role under interface/, or type ui or icon): a plain panel, no ground, centred
 *   'fill'   a background (role environment/background, or type background): the picture fills the frame
 *   'ground' everything else stands on the ground of a scene (meadow, cave, plain)
 */
export function backdropFor(meta) {
  const role = String(meta?.role ?? ''), type = String(meta?.type ?? '');
  if (role.startsWith('interface/')) return 'panel';
  if (role === 'environment/background') return 'fill';
  if (type === 'ui' || type === 'icon') return 'panel';
  if (type === 'background') return 'fill';
  return 'ground';
}

/** The backdrop choices that suit a kind from backdropFor: scenes, panels, or none (a background is its own backdrop). */
export const stagesFor = (backdrop) => (backdrop === 'panel' ? PANELS : backdrop === 'fill' ? [] : STAGES);

const mod = (a, n) => ((a % n) + n) % n;

export function drawStage(ctx, W, H, groundY, kind, scroll = 0) {
  const s = Math.floor(scroll);
  if (kind === 'panel-light' || kind === 'panel-dark') {
    // a plain panel with a faint grid, nothing to stand on
    const [face, line] = kind === 'panel-light' ? ['#eef0f7', '#e1e5f0'] : ['#2b2440', '#342c4d'];
    ctx.fillStyle = face; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = line;
    for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 1);
    return;
  }
  if (kind === 'plain') {
    for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
      ctx.fillStyle = ((x + y) / 8) % 2 ? '#e6e9f2' : '#f4f6fb';
      ctx.fillRect(x, y, 8, 8);
    }
    ctx.fillStyle = '#c3c9dc';
    for (let x = 0; x < W; x++) if (mod(x + s, 8) < 4) ctx.fillRect(x, groundY, 1, 1);
    return;
  }
  if (kind === 'cave') {
    ctx.fillStyle = '#2d2646'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#251f3b';
    const bs = Math.floor(scroll * 0.5);
    for (let y = 4; y < groundY; y += 10) {
      ctx.fillRect(0, y, W, 1);
      const off = (y / 10) % 2 ? 10 : 0;
      for (let x = 0; x < W; x++) if (mod(x + bs + off, 20) === 0) ctx.fillRect(x, y - 9, 1, 9);
    }
    ctx.fillStyle = '#3a3257';
    for (let x = 0; x < W; x++) { const wx = x + bs; if (hash(Math.floor(wx / 20), 7) < 0.25 && mod(wx, 20) > 3 && mod(wx, 20) < 9) ctx.fillRect(x, 16 + Math.floor(hash(Math.floor(wx / 20), 9) * 4) * 10, 1, 2); }
    ctx.fillStyle = '#5d557f'; ctx.fillRect(0, groundY, W, 2);
    ctx.fillStyle = '#463e66'; ctx.fillRect(0, groundY + 2, W, H - groundY - 2);
    ctx.fillStyle = '#39325a';
    for (let x = 0; x < W; x++) { if (mod(x + s, 24) === 0) ctx.fillRect(x, groundY + 2, 1, H - groundY - 2); }
    return;
  }
  // meadow
  ctx.fillStyle = '#bfe6f7'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d3eef9'; ctx.fillRect(0, groundY - 34, W, 34);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) {
    const cx = Math.floor(mod(i * 83 + hash(i, 1) * 40 - scroll * 0.12, W + 90)) - 45;
    const cy = 8 + Math.floor(hash(i, 2) * 22), w = 18 + Math.floor(hash(i, 3) * 14);
    ctx.fillRect(cx, cy, w, 4); ctx.fillRect(cx + 4, cy - 3, w - 10, 3); ctx.fillRect(cx + 2, cy + 4, w - 6, 2);
  }
  ctx.fillStyle = '#a5dba6';
  const hs = scroll * 0.3;
  for (let x = 0; x < W; x++) {
    const h = Math.round(13 + 8 * Math.sin((x + hs) / 27) + 5 * Math.sin((x + hs) / 12 + 1));
    ctx.fillRect(x, groundY - h, 1, h);
  }
  ctx.fillStyle = '#6cc06a'; ctx.fillRect(0, groundY, W, 5);
  ctx.fillStyle = '#4f9d57'; ctx.fillRect(0, groundY + 5, W, 1);
  ctx.fillStyle = '#b07a50'; ctx.fillRect(0, groundY + 6, W, H - groundY - 6);
  for (let x = 0; x < W; x++) {
    const wx = x + s;
    if (hash(wx, 1) < 0.09) { ctx.fillStyle = '#4f9d57'; ctx.fillRect(x, groundY - 2, 1, 2); if (hash(wx, 4) < 0.5) ctx.fillRect(x + 1, groundY - 1, 1, 1); }
    if (hash(wx, 5) < 0.012) { ctx.fillStyle = hash(wx, 6) < 0.5 ? '#ffffff' : '#ffd94a'; ctx.fillRect(x, groundY - 3, 1, 1); ctx.fillStyle = '#4f9d57'; ctx.fillRect(x, groundY - 2, 1, 2); }
    if (hash(wx, 2) < 0.05) { ctx.fillStyle = '#8f5f3c'; ctx.fillRect(x, groundY + 8 + Math.floor(hash(wx, 3) * Math.max(1, H - groundY - 10)), 2, 1); }
  }
}
