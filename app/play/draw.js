// Playground: drawing the scene. Everything is drawn in whole sprite pixels and the canvas is
// scaled by a whole number with smoothing off, so pixel art stays sharp.
// The bag's look (its colour settings) is applied to every sprite frame, and to the plain
// ground and sky the playground draws when the bag has no tiles or background.
import { renderFrame, clipFps } from '../../engine/sprite.js';
import { applyColour } from '../../engine/theme.js';
import { hexToRgb, rgbToHex, pack } from '../../engine/color.js';
import { hash } from '../../engine/motion.js';
import { levelTiles, surfaceBelow, CELL } from './level.js';
import { layerSpeed, layerShift } from './layers.js';

const mod = (a, n) => ((a % n) + n) % n;
// what is drawn first (behind) to last (in front) in side view
const LAYER = { prop: 0, effect: 0, pickup: 1, npc: 2, creature: 2, player: 3, projectile: 4 };

const PLAIN = {
  sky: '#bfe6f7', skyLow: '#d3eef9', cloud: '#ffffff', hill: '#a5dba6',
  grass: '#6cc06a', grassEdge: '#4f9d57', dirt: '#b07a50', dirtSpeck: '#8f5f3c',
  floor: '#d9dfc0', floorSpeck: '#c6cea9', wallTop: '#8a7fa8', wallFace: '#5d557f', wallEdge: '#231b33', outside: '#2d2646',
  shade: '#231b33',
};

/**
 * sprites: { key: { sprite, params } } for every sprite entry that is drawn.
 * colour: the bag look's colour settings (theme.colour).
 * tiles: what level.js tileIndex made of the bag's tilesets, or null with none.
 */
export function createPainter({ sprites, colour, tiles: tileSets = null }) {
  const cache = new Map();
  const tinted = new Map();
  /** A plain colour with the bag's look applied. */
  const look = (hex) => {
    let v = tinted.get(hex);
    if (!v) {
      const px = new Uint32Array([pack(...hexToRgb(hex))]);
      applyColour(px, colour);
      v = rgbToHex(px[0] & 255, (px[0] >>> 8) & 255, (px[0] >>> 16) & 255);
      tinted.set(hex, v);
    }
    return v;
  };
  const C = Object.fromEntries(Object.entries(PLAIN).map(([k, hex]) => [k, look(hex)]));

  /** One frame of one sprite as a small canvas, with the look applied. Made once and kept. */
  function frame(key, clip, f) {
    const id = key + '|' + clip + '|' + f;
    let cv = cache.get(id);
    if (!cv) {
      const { sprite, params } = sprites[key];
      const g = renderFrame(sprite, clip, f, params);
      applyColour(g.data, colour);
      cv = document.createElement('canvas');
      cv.width = g.w; cv.height = g.h;
      cv.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
      cache.set(id, cv);
    }
    return cv;
  }

  /** Every frame the scene can show, so they can be made a few at a time before they are needed. */
  function allFrames(keys) {
    const out = [];
    for (const key of keys) {
      const s = sprites[key];
      if (!s) continue;
      for (const [clip, c] of Object.entries(s.sprite.clips)) for (let f = 0; f < c.frames; f++) out.push([key, clip, f]);
    }
    return out;
  }

  // ---- the ground: made once for a level (again when a moving tile such as water changes frame), then copied each frame

  let groundFor = null, groundCanvas = null, laid = null;
  function ground(level, time) {
    if (!laid || laid.level !== level) {
      laid = { level, ...levelTiles(level, tileSets) };
      laid.moving = laid.tiles.some((t) => sprites[t.key].sprite.clips[t.clip].frames > 1);
      groundFor = null;
    }
    const beat = laid.moving ? Math.floor(time * 12) : 0;
    if (groundFor === beat) return groundCanvas;
    const cv = groundCanvas ?? document.createElement('canvas');
    if (cv.width !== level.width || cv.height !== level.height) { cv.width = level.width; cv.height = level.height; }
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const tile = (t) => {
      const { sprite, params } = sprites[t.key], c = sprite.clips[t.clip];
      g.drawImage(frame(t.key, t.clip, c.frames > 1 ? Math.floor(time * clipFps(sprite, t.clip, params)) % c.frames : 0), t.x, t.y);
    };
    // what the bag has no tiles for is drawn plainly: the cells the tile helper left bare, and only those
    if (laid.plain.includes('floor')) plainFloor(g, level);
    if (laid.plain.includes('ground')) plainGround(g, level, laid.bare);
    if (laid.plain.includes('thin')) plainThin(g, level);
    for (const t of laid.tiles) if (!t.over) tile(t);
    if (laid.plain.includes('wall')) plainWalls(g, level, laid.bare);
    for (const t of laid.tiles) if (t.over) tile(t);
    groundFor = beat; groundCanvas = cv;
    return cv;
  }

  function plainGround(g, level, bare) {
    const T = level.tile;
    const at = (c, r) => (r < 0 ? CELL.EMPTY : r >= level.rows || c < 0 || c >= level.cols ? CELL.SOLID : level.cells[r * level.cols + c]);
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
      const v = at(c, r), x = c * T, y = r * T;
      if (v === CELL.EMPTY || !bare.has(`${c},${r}`)) continue;
      if (v !== CELL.SOLID) {
        // a slope: one column at a time
        for (let i = 0; i < T; i++) {
          const top = v === CELL.UP ? T - 1 - i : i;
          g.fillStyle = C.dirt; g.fillRect(x + i, y + top, 1, T - top);
          g.fillStyle = C.grass; g.fillRect(x + i, y + top, 1, Math.min(5, T - top));
          g.fillStyle = C.grassEdge; if (T - top > 5) g.fillRect(x + i, y + top + 5, 1, 1);
        }
        continue;
      }
      g.fillStyle = C.dirt; g.fillRect(x, y, T, T);
      g.fillStyle = C.dirtSpeck;
      for (let i = 0; i < 3; i++) g.fillRect(x + 3 + Math.floor(hash(c * 5 + i, r) * (T - 8)), y + 8 + Math.floor(hash(c, r * 5 + i) * (T - 12)), 2, 1);
      if (at(c, r - 1) === CELL.EMPTY) {
        g.fillStyle = C.grass; g.fillRect(x, y, T, 5);
        g.fillStyle = C.grassEdge; g.fillRect(x, y + 5, T, 1);
        for (let i = 0; i < T; i++) if (hash(x + i, 1) < 0.09) g.fillRect(x + i, y - 2, 1, 2);
      }
      g.fillStyle = C.dirtSpeck;
      if (at(c - 1, r) === CELL.EMPTY) g.fillRect(x, y + (at(c, r - 1) === CELL.EMPTY ? 6 : 0), 1, T);
      if (at(c + 1, r) === CELL.EMPTY) g.fillRect(x + T - 1, y + (at(c, r - 1) === CELL.EMPTY ? 6 : 0), 1, T);
      if (at(c, r + 1) === CELL.EMPTY) g.fillRect(x, y + T - 2, T, 2);
    }
  }

  function plainThin(g, level) {
    for (const p of level.thins) {
      const w = p.x1 - p.x0;
      g.fillStyle = C.dirt; g.fillRect(p.x0 + 1, p.y + 3, w - 2, 7);
      g.fillStyle = C.dirtSpeck; g.fillRect(p.x0 + 2, p.y + 9, w - 4, 1);
      g.fillStyle = C.grass; g.fillRect(p.x0, p.y, w, 4);
      g.fillStyle = C.grassEdge; g.fillRect(p.x0, p.y + 4, w, 1);
    }
  }

  function plainFloor(g, level) {
    const T = level.tile;
    g.fillStyle = C.floor; g.fillRect(0, 0, level.width, level.height);
    g.fillStyle = C.floorSpeck;
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) if ((r + c) % 2) g.fillRect(c * T, r * T, T, T);
  }

  /** Plain walls, seen from the south: a lit top, and a darker front face on the cells with floor below them. */
  function plainWalls(g, level, bare) {
    const T = level.tile;
    const wall = (c, r) => c < 0 || r < 0 || c >= level.cols || r >= level.rows || level.cells[r * level.cols + c] === CELL.WALL;
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
      if (level.cells[r * level.cols + c] !== CELL.WALL || !bare.has(`${c},${r}`)) continue;
      const x = c * T, y = r * T;
      g.fillStyle = C.wallTop; g.fillRect(x, y, T, T);
      if (!wall(c, r + 1)) {
        g.fillStyle = C.wallFace; g.fillRect(x, y + Math.round(T * 0.3), T, T - Math.round(T * 0.3));
        g.fillStyle = C.wallEdge; g.fillRect(x, y + T - 2, T, 2);
      }
    }
  }

  // ---- behind the scene (side view)

  let skyTop = null;
  function backdrop(g, view, cam, level, backgroundKey, time, rise) {
    if (backgroundKey) {
      // The background's clips are its layers, far first. Each is one screen (320 x 180) that repeats sideways and
      // slides at its own share of the camera's speed; when the view climbs, the layers sink a little and the top
      // of the sky carries on above them.
      const { sprite, params } = sprites[backgroundKey];
      const layers = Object.keys(sprite.clips), n = layers.length;
      if (!skyTop) {
        const px = frame(backgroundKey, layers[0], 0).getContext('2d').getImageData(0, 0, 1, 1).data;
        skyTop = px[3] ? rgbToHex(px[0], px[1], px[2]) : C.sky;
      }
      g.fillStyle = skyTop; g.fillRect(0, 0, view.w, view.h);
      layers.forEach((clip, i) => {
        const c = sprite.clips[clip];
        const f = c.frames > 1 ? Math.floor(time * clipFps(sprite, clip, params)) % c.frames : 0;
        const img = frame(backgroundKey, clip, f);
        const speed = layerSpeed(clip, i, n);
        const y = view.h - img.height + Math.round(rise * speed);
        for (let x = -layerShift(cam.x, speed, img.width); x < view.w; x += img.width) g.drawImage(img, x, y);
      });
      return;
    }
    g.fillStyle = C.sky; g.fillRect(0, 0, view.w, view.h);
    const gy = level.groundY - Math.round(cam.y);
    g.fillStyle = C.skyLow; g.fillRect(0, gy - 40, view.w, 40);
    g.fillStyle = C.cloud;
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor(mod(i * 97 + hash(i, 1) * 40 - cam.x * 0.12, view.w + 90)) - 45;
      const cy = gy - 130 + Math.floor(hash(i, 2) * 50) + Math.round(rise * 0.5), w = 18 + Math.floor(hash(i, 3) * 14);
      g.fillRect(cx, cy, w, 4); g.fillRect(cx + 4, cy - 3, w - 10, 3); g.fillRect(cx + 2, cy + 4, w - 6, 2);
    }
    g.fillStyle = C.hill;
    const hs = Math.floor(cam.x * 0.3);
    for (let x = 0; x < view.w; x++) {
      const h = Math.round(18 + 9 * Math.sin((x + hs) / 31) + 6 * Math.sin((x + hs) / 13 + 1));
      g.fillRect(x, gy - h, 1, h);
    }
  }

  // ---- things

  // With a palette every pixel on screen should be one of its colours, so the shadow is a
  // checker of one solid colour there, and a soft see-through shadow otherwise.
  const strict = !!(colour && colour.palette);
  function shadow(g, x, y, w) {
    if (strict) {
      g.fillStyle = C.shade;
      for (let dy = 0; dy < 3; dy++) {
        const inset = dy === 1 ? 0 : 2;
        for (let px = x - w + inset; px < x + w - inset; px++) if ((px + y + dy) % 2 === 0) g.fillRect(px, y + dy, 1, 1);
      }
      return;
    }
    g.fillStyle = 'rgba(35, 27, 51, 0.22)';
    g.fillRect(x - w, y + 1, w * 2, 1);
    g.fillRect(x - w + 2, y + 2, w * 2 - 4, 1);
    g.fillRect(x - w + 2, y, w * 2 - 4, 1);
  }

  function thing(g, world, t, cam) {
    if (t.state === 'gone') return;
    const k = world.kinds[t.kind];
    const blink = Math.floor(world.time * 16) % 2 === 0;
    if (t.flash > 0 && blink && !/^(hurt|die|break)/.test(t.anim.clip)) return;      // no hurt or die clip: it blinks instead
    if (t.role === 'player' && t.busy && t.busy.type === 'die' && !t.busy.clip && blink) return;
    const x = Math.round(t.x - cam.x), y = Math.round(t.y - cam.y);
    const bob = k.flying && !t.passing && t.state !== 'dying' ? Math.round(Math.sin(world.time * 3 + t.n) * 2) : 0;
    if (!t.passing && t.role !== 'effect' && t.state !== 'dying') {
      // the shadow lies on whatever is underneath, so it stays down while the player is in the air
      const floor = world.level.mode === 'side' && t.role === 'player' && !t.onGround ? Math.round(surfaceBelow(world.level, t.x, t.y).y - cam.y) : y;
      shadow(g, x, floor, Math.max(3, Math.round((k.box.l + k.box.r) * (t.lift || floor !== y ? 0.35 : 0.5))));
    }
    const img = frame(t.kind, t.anim.clip, t.anim.frame);
    const top = y - k.pivot[1] - t.lift - bob;
    const faded = t.role === 'player' && t.invuln > 0 && blink && !strict;
    if (faded) g.globalAlpha = 0.55;
    if (t.anim.flip) {
      g.save(); g.translate(x, 0); g.scale(-1, 1);
      g.drawImage(img, -k.pivot[0], top);
      g.restore();
    } else g.drawImage(img, x - k.pivot[0], top);
    if (faded) g.globalAlpha = 1;
  }

  /**
   * Draw one picture of the scene. view: { w, h, zoom } in sprite pixels; cam: { x, y } the top-left corner shown.
   * plan: { tiles, background } keys in use.
   */
  function draw(g, { world, view, cam, plan }) {
    const { level } = world;
    g.setTransform(view.zoom, 0, 0, view.zoom, 0, 0);
    g.imageSmoothingEnabled = false;
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    const c = { x: cx, y: cy };
    if (level.mode === 'top') { g.fillStyle = C.outside; g.fillRect(0, 0, view.w, view.h); } else backdrop(g, view, c, level, plan.background, world.time, Math.max(0, cameraFloor(level, view) - cy));
    g.drawImage(ground(level, world.time), -cx, -cy);
    const list = world.player ? [...world.things, world.player] : [...world.things];
    if (level.mode === 'top') list.sort((a, b) => a.y - b.y || a.n - b.n);
    else list.sort((a, b) => (a.passing ? 5 : LAYER[a.role]) - (b.passing ? 5 : LAYER[b.role]) || a.n - b.n);
    for (const t of list) thing(g, world, t, c);
  }

  return { frame, allFrames, draw, look };
}

/** Side view: the lowest the view goes. It rests showing the top row of the ground and a little of what is under it. */
export function cameraFloor(level, view) {
  return level.mode === 'side' ? Math.max(0, Math.min(level.height - view.h, level.groundY + 40 - view.h)) : Math.max(0, level.height - view.h);
}

/** Where the view sits: on the player, kept inside the scene (a scene smaller than the view is centred). */
export function cameraFor(level, view, focus) {
  const axis = (at, size, shown) => (size <= shown ? -Math.round((shown - size) / 2) : Math.max(0, Math.min(size - shown, Math.round(at - shown / 2))));
  if (level.mode === 'side') return { x: axis(focus.x, level.width, view.w), y: Math.max(0, Math.min(cameraFloor(level, view), Math.round(focus.y - view.h * 0.62))) };
  return { x: axis(focus.x, level.width, view.w), y: axis(focus.y - 24, level.height, view.h) };
}
