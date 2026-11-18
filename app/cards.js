// Catalogue cards for sprites, sounds and kits, and the loop that animates them.
import { defaultParams, clipFps } from '../engine/sprite.js';
import { byId as spriteById } from '../sprites/index.js';
import { el, Frames, SPRITE_BG, SOUND_BG, cap, drawSpriteOnTile, reduceMotion } from './ui.js';
import { soundParams, rendered, playRendered, playLive, whenRendered, drawWave } from './audio.js';

const INK = '#231b33';

function frameAt(c, now) {
  const { sprite } = c;
  const clip = sprite.clips[c.clip];
  const fps = clipFps(sprite, c.clip, c.frames.p);
  const n = Math.floor(((now - c.start) / 1000) * fps);
  if (reduceMotion.matches && !c.hot) return 0;
  if (clip.loop) return n % clip.frames;
  const span = clip.frames + Math.round(fps * 0.6);
  return Math.min(clip.frames - 1, n % span);
}

export function spriteCard(sprite) {
  const tile = el('canvas', { class: 'tile', width: 80, height: 72, 'aria-hidden': 'true' });
  const node = el('a', { class: 'card', href: `#/sprite/${sprite.id}` },
    tile,
    el('span', { class: 'card-text' }, el('span', { class: 'card-name' }, sprite.name), el('span', { class: 'card-kind' }, sprite.kind)));
  const clips = Object.keys(sprite.clips);
  const c = { sprite, frames: new Frames(sprite, defaultParams(sprite)), clip: sprite.preview, hot: false, start: 0 };
  const alt = clips.find((x) => /attack|cast|collect|ignite|open/.test(x)) ?? clips[clips.length - 1];
  const enter = () => { c.hot = true; c.clip = alt; c.start = performance.now(); };
  const leave = () => { c.hot = false; c.clip = sprite.preview; c.start = performance.now(); };
  node.addEventListener('pointerenter', enter); node.addEventListener('pointerleave', leave);
  node.addEventListener('focus', enter); node.addEventListener('blur', leave);
  const g = tile.getContext('2d');
  return {
    node,
    tick(now) {
      const [sky, ground, edge] = SPRITE_BG[sprite.kind] ?? SPRITE_BG.Character;
      g.fillStyle = sky; g.fillRect(0, 0, 80, 72);
      g.fillStyle = ground; g.fillRect(0, 60, 80, 12);
      g.fillStyle = edge; g.fillRect(0, 60, 80, 1);
      const cx = 40 + Math.round((sprite.pivot[0] - sprite.size[0] / 2) * 0.5);
      drawSpriteOnTile(g, sprite, c.frames.get(c.clip, frameAt(c, now)), cx, 60);
    },
  };
}

/** A music track: no picture, just a tile that plays the track live when pressed. */
export function musicCard(patch) {
  const tile = el('canvas', { class: 'tile', width: 80, height: 72, 'aria-hidden': 'true' });
  const btn = el('button', { class: 'tile-btn', type: 'button', 'aria-label': `Play ${patch.name}` }, tile);
  const node = el('div', { class: 'card sound' }, btn,
    el('a', { class: 'card-text', href: `#/music/${patch.id}` }, el('span', { class: 'card-name' }, patch.name), el('span', { class: 'card-kind' }, 'Music')));
  const g = tile.getContext('2d');
  let voice = null, starting = false, gone = false, dirty = true;
  btn.addEventListener('click', async () => {
    if (voice) { voice.stop(); voice = null; dirty = true; return; }
    if (starting) return;
    starting = true; dirty = true;
    try {
      const v = await playLive(patch, soundParams(patch));
      if (gone) v.stop(); else voice = v;
    } catch (e) { console.error(`music ${patch.id}:`, e); }
    starting = false; dirty = true;
  });
  return {
    node,
    stop() { gone = true; if (voice) voice.stop(); voice = null; },
    tick() {
      if (!dirty) return;
      dirty = false;
      g.fillStyle = SOUND_BG.music; g.fillRect(0, 0, 80, 72);
      // one large play / stop mark in the middle
      g.fillStyle = INK; g.fillRect(27, 23, 26, 26);
      g.fillStyle = '#ffcf3f'; g.fillRect(29, 25, 22, 22);
      g.fillStyle = INK;
      if (voice || starting) g.fillRect(35, 31, 10, 10);
      else for (let i = 0; i < 8; i++) g.fillRect(36 + i, 29 + i, 1, 15 - i * 2);
    },
  };
}

export function soundCard(patch) {
  const tile = el('canvas', { class: 'tile', width: 80, height: 72, 'aria-hidden': 'true' });
  const btn = el('button', { class: 'tile-btn', type: 'button', 'aria-label': `Play ${patch.name}` }, tile);
  const node = el('div', { class: 'card sound' }, btn,
    el('a', { class: 'card-text', href: `#/sound/${patch.id}` }, el('span', { class: 'card-name' }, patch.name), el('span', { class: 'card-kind' }, cap(patch.category) + (patch.loop ? ', loop' : ''))));
  const g = tile.getContext('2d');
  let r = null, handle = null, dirty = true;
  whenRendered(patch, (res) => { r = res; dirty = true; });
  btn.addEventListener('click', () => {
    if (handle) { handle.stop(); handle = null; dirty = true; return; }
    r = r ?? rendered(patch, soundParams(patch));
    handle = playRendered(r, { force: true, onended: () => { handle = null; dirty = true; } });
    dirty = true;
  });
  return {
    node,
    stop() { if (handle) handle.stop(); },
    tick() {
      if (!dirty && !handle) return;
      dirty = false;
      g.fillStyle = SOUND_BG[patch.category] ?? '#e6e9f2'; g.fillRect(0, 0, 80, 72);
      g.fillStyle = 'rgba(35, 27, 51, 0.12)'; g.fillRect(8, 33, 64, 1);
      if (r) {
        const played = handle ? Math.floor(Math.min(1, (handle.now() - handle.startedAt) / handle.duration) * 64) : -1;
        drawWave(g, r.samples, 8, 34, 64, 40, INK, played, '#5a48e0');
      }
      // play / stop mark in the corner
      g.fillStyle = INK; g.fillRect(4, 58, 11, 11);
      g.fillStyle = '#ffcf3f'; g.fillRect(5, 59, 9, 9);
      g.fillStyle = INK;
      if (handle) g.fillRect(7, 61, 5, 5);
      else for (let i = 0; i < 4; i++) g.fillRect(8 + i, 60 + i, 1, 7 - i * 2);
    },
  };
}

export function kitCard(kit) {
  const tile = el('canvas', { class: 'tile wide', width: 164, height: 72, 'aria-hidden': 'true' });
  const members = kit.sprites.map((id) => spriteById[id]).filter(Boolean);
  const node = el('a', { class: 'card kit', href: `#/kit/${kit.id}` },
    tile,
    el('span', { class: 'card-text' }, el('span', { class: 'card-name' }, kit.name), el('span', { class: 'card-kind' }, `${members.length} sprite${members.length === 1 ? '' : 's'}, ${kit.sounds.length} sounds${(kit.music ?? []).length ? `, ${kit.music.length} track${kit.music.length === 1 ? '' : 's'}` : ''}`)));
  const cs = members.map((sprite) => ({ sprite, frames: new Frames(sprite, defaultParams(sprite)), clip: sprite.preview, hot: false, start: 0 }));
  const g = tile.getContext('2d');
  return {
    node,
    tick(now) {
      g.fillStyle = '#bfe6f7'; g.fillRect(0, 0, 164, 72);
      g.fillStyle = '#6cc06a'; g.fillRect(0, 60, 164, 12);
      g.fillStyle = '#4f9d57'; g.fillRect(0, 60, 164, 1);
      cs.forEach((c, i) => {
        const cx = Math.round((164 / (cs.length + 1)) * (i + 1));
        drawSpriteOnTile(g, c.sprite, c.frames.get(c.clip, frameAt(c, now)), cx, 60);
      });
    },
  };
}

/** Animate a set of cards until the returned function is called. */
export function runCards(cards) {
  let raf = 0;
  const loop = (now) => { for (const c of cards) c.tick(now); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); for (const c of cards) if (c.stop) c.stop(); };
}
