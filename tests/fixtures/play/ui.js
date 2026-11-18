// Fixtures for the playground tests: interface pieces with the clip names of docs/style-guide.md section 8.
//   icons  a set of ten icons, one clip each (wide enough to push a phone page sideways if drawn in one row)
//   bar    a housing (`frame`) and a fill strip (`fill`); `slice` says where the housing's opening is (Contract 8)
//   menu   a panel set: a still panel and a cursor that moves
import { defineSprite, color } from '../../../engine/sprite.js';
import { INK } from '../../../engine/color.js';

const one = (label) => ({ frames: 1, fps: 1, loop: true, ...(label ? { label } : {}) });
const meta = (role, words) => ({ type: role === 'interface/icon' ? 'icon' : 'ui', role, themes: ['neutral'], gameTypes: ['platformer'], view: 'none', words, license: 'draft' });
const NAMES = ['sword', 'shield', 'potion', 'key', 'bomb', 'bow', 'boot', 'ring', 'scroll', 'gem'];

export const icons = defineSprite({
  id: 'play-icons', name: 'Test icons', kind: 'Item', blurb: 'Ten plain icons, used by the playground tests.',
  meta: meta('interface/icon', ['icons', 'inventory', 'items', 'sword', 'potion', 'key']),
  size: [32, 32], pivot: [16, 16], preview: 'sword',
  params: { tint: color('Colour', '#e6c545', ['#e6c545', '#c9423a', '#3f6fd1']) },
  clips: Object.fromEntries(NAMES.map((n) => [n, one()])),
  render(g, { clip, p }) {
    const i = NAMES.indexOf(clip);
    g.rect(6 + i, 6, 20 - i, 8 + i, p.tint);         // every icon has its own outline
    g.rect(14, 14 + (i % 4), 4, 10 - (i % 4), '#8a5a34');
    g.outline(INK);
  },
});

export const BAR_OPENING = { x: 6, y: 4, w: 50, h: 8 };
export const BAR_FILL = '#3fbf6f';
export const bar = defineSprite({
  id: 'play-bar', name: 'Test bar', kind: 'Item', blurb: 'A health bar in two pieces, used by the playground tests.',
  meta: meta('interface/bar', ['bar', 'health', 'meter', 'gauge', 'life', 'interface']),
  size: [64, 16], pivot: [32, 8], preview: 'frame',
  slice: { frame: { left: 8, top: 4, right: 8, bottom: 4, opening: BAR_OPENING }, fill: { opening: BAR_OPENING } },
  params: { frame: color('Frame', '#c2c9d6', ['#c2c9d6', '#e6c545']) },
  clips: { frame: one('Housing'), fill: one('Health') },
  render(g, { clip, p }) {
    const o = BAR_OPENING;
    if (clip === 'frame') { g.rect(2, 2, 60, 12, p.frame); g.rect(o.x, o.y, o.w, o.h, '#2a2238'); g.outline(INK); } else g.rect(o.x, o.y, o.w, o.h, BAR_FILL);
  },
});

export const menu = defineSprite({
  id: 'play-menu', name: 'Test menu', kind: 'Item', blurb: 'A panel and its moving cursor, used by the playground tests.',
  meta: meta('interface/panel', ['menu', 'panel', 'cursor', 'window', 'box', 'interface']),
  size: [96, 64], pivot: [48, 32], preview: 'panel',
  params: { face: color('Face', '#3f6fd1', ['#3f6fd1', '#4f9d57']) },
  clips: { panel: one(), cursor: { frames: 8, fps: 8, loop: true } },
  render(g, { clip, frame, p }) {
    if (clip === 'panel') { g.rect(2, 2, 92, 60, p.face); g.rect(6, 6, 84, 52, '#f0ead8'); } else g.rect(40 + (frame % 4), 26, 12, 10, '#e6c545');
    g.outline(INK);
  },
});
