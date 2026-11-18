// Small shared pieces for every page.
import { renderFrame } from '../engine/sprite.js';

export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k);
  return n;
};

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Frames of one sprite at one set of parameters, rendered on demand and kept. */
export class Frames {
  constructor(sprite, p) { this.sprite = sprite; this.p = p; this.map = new Map(); }
  set(p) { this.p = p; this.map.clear(); }
  get(clip, f) {
    const key = clip + ':' + f;
    let cv = this.map.get(key);
    if (!cv) {
      const g = renderFrame(this.sprite, clip, f, this.p);
      cv = document.createElement('canvas');
      cv.width = g.w; cv.height = g.h;
      cv.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
      this.map.set(key, cv);
    }
    return cv;
  }
}

/** How fast the ground slides under a clip, in sprite pixels per second. */
export function travel(sprite, clip, p) {
  const c = sprite.clips[clip];
  const k = typeof p.speed === 'number' ? 0.65 + 0.8 * p.speed : 1;
  if (c.travel !== undefined) return (typeof c.travel === 'function' ? c.travel(p) : c.travel) * k;
  if (/run|gallop|dash|sprint/.test(clip)) return 62 * k;
  if (/walk/.test(clip)) return 26 * k;
  if (/hop|fly|move|slither|swim|crawl|roll/.test(clip)) return 20 * k;
  return 0;
}

/** Flying sprites anchor at their body centre, so lift them clear of the ground. */
export const hover = (sprite) => (sprite.grounded === false ? Math.round((sprite.size[1] - sprite.pivot[1]) * 0.75) : 0);

export function shadow(ctx, x, y, w) {
  ctx.fillStyle = 'rgba(35, 27, 51, 0.22)';
  ctx.fillRect(x - w, y + 1, w * 2, 1);
  ctx.fillRect(x - w + 2, y + 2, w * 2 - 4, 1);
  ctx.fillRect(x - w + 2, y, w * 2 - 4, 1);
}

export const SPRITE_BG = { Character: ['#bfe6f7', '#6cc06a', '#4f9d57'], Creature: ['#ffd9b8', '#c98a5c', '#a56a42'], Item: ['#cdeccf', '#8bc7a0', '#6aa884'], Effect: ['#2d2646', '#463e66', '#5d557f'] };
export const SOUND_BG = { music: '#ffe0ef', weapon: '#ffd9b8', impact: '#f6c9c9', pickup: '#fff0b8', movement: '#cdeccf', ui: '#d9dcff', magic: '#ecd3ff', vehicle: '#d5dbe6', ambience: '#bfe6f7' };
export const cap = (s) => (s === 'ui' ? 'Menu' : s[0].toUpperCase() + s.slice(1));

/** Draw one sprite frame standing on a ground line inside a tile. */
export function drawSpriteOnTile(ctx, sprite, frame, cx, gy) {
  const x = Math.round(cx - sprite.pivot[0]);
  const y = gy - sprite.pivot[1] - hover(sprite);
  shadow(ctx, cx, gy, Math.round(sprite.size[0] * 0.16));
  ctx.drawImage(frame, x, y);
}

export function saveBlob(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const store = {
  get(k) { try { return localStorage.getItem('sf-' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('sf-' + k, v); } catch { /* private window */ } },
};

/** The page header with the main navigation. */
export function header(current) {
  const link = (href, label, key) => el('a', { href, 'aria-current': current === key ? 'page' : null }, label);
  return el('header', { class: 'top' },
    el('a', { class: 'brand', href: '#/' }, 'Loadout'),
    el('nav', { 'aria-label': 'Main' },
      link('#/sprites', 'Sprites', 'sprites'),
      link('#/sounds', 'Sounds', 'sounds'),
      link('#/music', 'Music', 'music'),
      link('#/kits', 'Kits', 'kits')));
}
