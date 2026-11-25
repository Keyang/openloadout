// The bag as a small live scene (docs/playground-tray-workbench.md, sections 2 and 3): its background, its ground tiles
// and a few of its sprites standing on that ground, in the bag's look, the way the playground puts them together
// (app/play/: planScene sorts the bag, makeLevel lays the ground, createPainter draws). Nobody plays it: the things
// stand where they are put and play their animation. Two pages use it:
//   the tray in the library     bagScene(): a short picture of the whole bag that opens the playground
//   the sprite page's workbench bagBackdrop({ id }): the bag's scene drawn behind the sprite on the page, with up to six
//                               other things from the bag standing around it, quieter
// Both follow the bag as it changes (also from another tab). Sprite objects are loaded only for what is drawn.
import { el, reduceMotion, hover } from './ui.js';
import { bag, lookOf, themeFor } from './bag.js';
import { assetById, loadSprite } from './catalog.js';
import { cleanParams, clipFps } from '../engine/sprite.js';
import { spriteLook } from '../engine/theme.js';
import { drawPicture, showPicture } from './art.js';      // a flat thing smooth, the scene's pixel art crisp
import { planScene, fitsMode } from './play/roles.js';
import { makeLevel, levelFeatures, tileIndex, surfaceBelow } from './play/level.js';
import { createPainter, cameraFor } from './play/draw.js';

/** Roles that stand in a small scene of the bag (an effect or a projectile only means something when it is used). */
const STANDING = ['player', 'npc', 'creature', 'pickup', 'prop'];

/** The scene's mode a sprite drawn for `view` needs ('side', 'top'), or null when it fits both. */
export const modeFor = (view) => (view === 'side' ? 'side' : view === 'top-down' ? 'top' : null);

/**
 * Who stands in the scene: the player first, then the rest of the scene's things in bag order, at most `max`, leaving
 * out the keys in `skip`. plan: what planScene made of the bag.
 */
export function castOf(plan, max, skip = new Set()) {
  const keys = [plan.player, ...plan.scene].filter((k) => k && !skip.has(k) && STANDING.includes(plan.roles[k]));
  return [...new Set(keys)].slice(0, Math.max(0, max));
}

/** Where n things stand along a scene, as shares of its width, evenly from 0.12 to 0.88. */
export function spread(n) {
  if (n <= 0) return [];
  if (n === 1) return [0.5];
  return Array.from({ length: n }, (_, i) => 0.12 + (0.76 * i) / (n - 1));
}

/** Where up to six things stand around one in the middle, as offsets from it in shares of the width: near ones first. */
export const AROUND = [-0.27, 0.27, -0.41, 0.41, -0.15, 0.15];

/** The clip a thing rests on in the scene: idle when it has one, else its preview. */
const restClip = (sprite) => (sprite.clips.idle ? 'idle' : sprite.preview);

/**
 * The bag as a scene, ready to draw: { plan, level, painter, drawn, cast, rows, background (asset id or ''),
 * ground (true when the bag's own tiles make it), scene (true when the bag has a background or ground of its own) }, or
 * null when the bag has no sprite for a scene.
 *   max      how many things stand in it at most
 *   skipId   an asset that is not to stand in it (the sprite on the page, which draws itself)
 *   mode     the view the scene must be in ('side', 'top'), or null for the bag's own
 */
export async function bagModel({ max = 7, skipId = null, mode = null } = {}) {
  const items = bag.items().filter((i) => i.kind === 'sprite');
  const entries = items.map((i) => ({ key: i.key, row: assetById(i.id), settings: i.settings ?? {}, id: i.id })).filter((e) => e.row);
  if (!entries.length) return null;
  const plan = planScene(entries, mode ? { mode } : {});
  // a scene in the other view than the one asked for is no scene for this sprite: only the things that fit it stand
  const wrongView = mode && plan.mode !== mode;
  const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
  const skip = new Set(entries.filter((e) => e.id === skipId || (mode && !fitsMode(e.row.view, mode))).map((e) => e.key));
  const cast = castOf(plan, max, skip);
  const tilesets = wrongView ? [] : plan.tilesets;
  const background = wrongView ? null : plan.background;
  const need = [...new Set([...cast, ...tilesets, ...(background ? [background] : [])])];
  const loaded = await Promise.all(need.map((key) => loadSprite(byKey[key].id).then((sprite) => [key, sprite]).catch(() => null)));
  const theme = bag.theme();
  const drawn = {};
  for (const got of loaded) {
    if (!got) continue;
    const [key, sprite] = got, s = byKey[key].settings;
    // as the playground draws it: the visitor's settings, in the bag's look (or the item's own look)
    const own = lookOf(s) ? themeFor(s, theme) : null;
    let params;
    try { params = spriteLook(sprite, s.params ?? {}, own ?? theme, { record: own ? undefined : s.lookParams }).params; } catch { params = cleanParams(sprite, s.params ?? {}); }
    drawn[key] = { sprite, params, artStyle: s.artStyle, colour: own ? own.colour : undefined };
  }
  const tilesHere = tilesets.filter((k) => drawn[k]);
  const tiles = tileIndex(tilesHere.map((key) => ({ key, names: Object.keys(drawn[key].sprite.clips), size: drawn[key].sprite.size[0], clips: drawn[key].sprite.clips })));
  const level = makeLevel(wrongView ? mode : plan.mode, levelFeatures(tiles, wrongView ? mode : plan.mode));
  const bg = background && drawn[background] ? background : null;
  // (the ground and the sky stay the frame-size grid; a thing in a vector style, flat, is its own smooth picture: app/play/draw.js)
  const painter = createPainter({ sprites: drawn, colour: theme.colour, tiles, scenery: [...tilesHere, ...(bg ? [bg] : [])] });
  return {
    plan: { ...plan, background: bg, tilesets: tilesHere }, level, painter, drawn,
    cast: cast.filter((k) => drawn[k]), rows: byKey,
    background: bg ? byKey[bg].id : '', ground: tilesHere.length > 0,
    scene: !!bg || tilesHere.length > 0,
  };
}

const dpr = () => (window.devicePixelRatio > 0 ? window.devicePixelRatio : 1);

/**
 * One thing standing in the scene: its frame at this time, its foot on (x, y) of the canvas, faced left when flip.
 * zoom: CSS pixels a scene pixel, the size a smooth picture (flat) is made for; pixel art is its frame, drawn 1:1.
 */
function stand(g, m, key, x, y, time, flip = false, zoom = 1) {
  const { sprite, params } = m.drawn[key];
  const clip = restClip(sprite), c = sprite.clips[clip];
  const f = c.frames > 1 && !reduceMotion.matches ? Math.floor(time * clipFps(sprite, clip, params) + key.length) % c.frames : 0;
  const pic = m.painter.picture ? m.painter.picture(key, clip, f, zoom) : null;
  const put = (px, py) => (pic ? drawPicture(g, pic, px, py, pic.w, pic.h) : g.drawImage(m.painter.frame(key, clip, f), px, py));
  const top = Math.round(y - sprite.pivot[1] - hover(sprite));
  if (flip) { g.save(); g.translate(Math.round(x), 0); g.scale(-1, 1); put(-sprite.pivot[0], top); g.restore(); }
  else put(Math.round(x - sprite.pivot[0]), top);
}

/** The ground's height under x, near y (a level point); y itself over a pit or past the level. */
function groundAt(level, x, y) {
  if (level.mode !== 'side') return y;
  const s = surfaceBelow(level, Math.max(0, Math.min(level.width - 1, x)), y - 48).y;
  return s > y + 64 || s >= level.height ? y : s;
}

/** The scene's background and ground, as the playground paints them (nothing stands in it yet). */
function paintGround(g, m, view, cam, time) {
  m.painter.draw(g, { world: { level: m.level, time, things: [], player: null }, view, cam, plan: m.plan });
}

/**
 * The tray's picture of the bag: a canvas that fills its box, the whole bag in it, live. A link to the playground.
 * Returns { node, stop() }. node.dataset: background (the asset id of the background drawn, '' with none), standing
 * (how many things stand in it), drawn (set once it was painted).
 */
export function bagScene({ max = 7, height = 132 } = {}) {
  const canvas = el('canvas', { width: 288, height, 'aria-hidden': 'true' });
  const node = el('a', { class: 'tray-scene tile', href: '#/play', 'aria-label': 'Your bag as a scene. Open it in the playground', title: 'Open your bag in the playground', 'data-background': '', 'data-standing': '0' }, canvas);
  const g = canvas.getContext('2d');
  let m = null, raf = 0, gone = false, seen = false, builds = 0, timer = 0;
  const start = performance.now();

  function paint(now) {
    raf = 0;
    if (gone || !m) return;
    const w = Math.max(96, node.clientWidth || 288), h = height;
    // with a thing in a vector style (flat) the canvas has a backing store for the screen: its things smooth, the
    // ground and the background as crisp as before
    const z = m.painter.vector ? Math.max(1, Math.ceil(dpr())) : 1;
    if (canvas.width !== w * z || canvas.height !== h * z) { canvas.width = w * z; canvas.height = h * z; showPicture(canvas, z); }
    const view = { w, h, zoom: 1, scale: z }, time = (now - start) / 1000;
    const L = m.level;
    // side: the start of the level, a little in from its left edge; top-down: the room around where the player starts
    const cam = L.mode === 'side' ? cameraFor(L, view, { x: L.start.x + w * 0.35, y: L.start.y }) : cameraFor(L, view, L.start);
    paintGround(g, m, view, cam, time);
    const shares = spread(m.cast.length);
    m.cast.forEach((key, i) => {
      const x = cam.x + shares[i] * w;
      const y = L.mode === 'side' ? groundAt(L, x, L.start.y) : cam.y + h * (0.55 + (i % 2) * 0.18);
      stand(g, m, key, x - cam.x, y - cam.y, time, m.plan.roles[key] === 'creature' && shares[i] > 0.5, 1);
    });
    node.dataset.drawn = 'true';
    if (seen && !reduceMotion.matches) raf = requestAnimationFrame(paint);
  }
  const run = () => { if (!raf && m && !gone && seen) raf = requestAnimationFrame(paint); };

  async function build() {
    const mine = ++builds;
    let made = null;
    try { made = await bagModel({ max }); } catch (e) { console.warn('bag scene:', e); }
    if (gone || mine !== builds) return;
    m = made;
    node.hidden = !m;
    node.dataset.background = m ? m.background : '';
    node.dataset.standing = String(m ? m.cast.length : 0);
    delete node.dataset.drawn;
    if (m) { cancelAnimationFrame(raf); raf = 0; seen = isShown(); if (seen) paint(performance.now()); }
  }
  const isShown = () => node.isConnected && node.offsetParent !== null;
  const later = () => { clearTimeout(timer); timer = setTimeout(build, 120); };
  const off = bag.onChange(later);
  const io = new IntersectionObserver((es) => { seen = es.some((e) => e.isIntersecting) && isShown(); run(); });
  io.observe(node);
  node.hidden = true;
  build();
  return {
    node,
    stop() { gone = true; off(); io.disconnect(); clearTimeout(timer); cancelAnimationFrame(raf); },
  };
}

/**
 * The workbench: the bag's scene behind one sprite (the sprite page draws the sprite itself, in front).
 *   id     the sprite on the page: it is not drawn among the others
 *   view   its view (catalogue `view`): the scene is in that view when the bag has things for it
 *   onChange(info)   called when what is drawn changed: { background, others: [asset ids] }
 * Returns { draw(g, W, H, gy, time, fallback) -> { gy } , info(), stop() }.
 *   draw paints the canvas (W x H sprite pixels, the sprite's foot at height gy): the bag's background and ground
 *   when it has them (else fallback(), the page's own scene), and the others, faded. It returns where the sprite's foot
 *   goes on the bag's ground.
 */
export function bagBackdrop({ id, view = null, onChange = () => {} }) {
  let m = null, gone = false, builds = 0, timer = 0;
  const mode = modeFor(view);
  const info = () => ({ background: m && m.scene ? m.background : '', others: m ? m.cast.map((k) => m.rows[k].id) : [] });
  async function build() {
    const mine = ++builds;
    let made = null;
    try { made = await bagModel({ max: AROUND.length, skipId: id, mode }); } catch (e) { console.warn('bag scene:', e); }
    if (gone || mine !== builds) return;
    m = made;
    onChange(info());
  }
  const off = bag.onChange(() => { clearTimeout(timer); timer = setTimeout(build, 120); });
  build();

  function draw(g, W, H, gy, time, fallback) {
    let foot = gy, cam = null;
    // the page's own scale (canvas pixels a sprite pixel: more than 1 when its canvas has a backing store for the screen)
    const t = g.getTransform(), z = t.a > 0 ? t.a : 1;
    if (m && m.scene) {
      const L = m.level, view = { w: W, h: H, zoom: z, scale: z };
      const x = L.mode === 'side' ? L.start.x + 40 : L.start.x;
      const y = groundAt(L, x, L.start.y);
      // the sprite's foot on the ground at gy; never below the bottom of the level (nothing is drawn there)
      cam = { x: Math.round(Math.max(0, Math.min(L.width - W, x - W / 2))), y: Math.round(Math.min(y - gy, L.height - H)) };
      paintGround(g, m, view, cam, time);
      g.setTransform(t);
      foot = y - cam.y;
    } else fallback();
    if (!m || !m.cast.length) return { gy: foot };
    // the others stand around the middle, quieter, behind the sprite on the page
    g.save();
    g.globalAlpha = 0.5;
    m.cast.forEach((key, i) => {
      const off = AROUND[i] * W, cx = W / 2 + off;
      let fy = foot;
      if (cam && m.level.mode === 'side') fy = groundAt(m.level, cam.x + cx, foot + cam.y) - cam.y;
      stand(g, m, key, cx, fy, time, off > 0, z / dpr());
    });
    g.restore();
    return { gy: foot };
  }
  return { draw, info, stop() { gone = true; off(); clearTimeout(timer); } };
}
