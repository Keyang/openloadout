// A kit as a living scene (docs/site-design.md, section 5, "Kits"): a few of the kit's own things put together the way
// the playground would put them (app/play/: the ground from its tiles, its background behind, its character standing,
// its creatures wandering), drawn on a canvas that takes the kit's look in one click. Nobody plays it: it only moves.
// Only a handful of the kit's sprites are loaded for it, and only when the scene is first on screen.
//
//   const scene = kitScene(bundle, { theme });   page.append(scene.node);   scene.setLook(theme);   scene.stop();
import { el, reduceMotion } from './ui.js';
import { assetsOfBundle, loadSprite } from './catalog.js';
import { defaultParams } from '../engine/sprite.js';
import { normalizeTheme, spriteLook } from '../engine/theme.js';
import { roleOf, planScene, chooseMode, fitsMode } from './play/roles.js';
import { buildKind } from './play/kinds.js';
import { makeLevel, levelFeatures, tileIndex } from './play/level.js';
import { createWorld, step } from './play/world.js';
import { createPainter, cameraFor, VIEW_H } from './play/draw.js';

// how many of each kind of thing a scene shows: enough to say what the kit is, few enough to load at once
const MOST = { player: 1, creature: 3, npc: 1, pickup: 2, prop: 3, tiles: 4, background: 1 };

/** The rows of a kit that make its scene: [catalogue row], in the kit's own order, at most MOST of each role, all drawn for one view. */
export function sceneRows(rows) {
  const sprites = rows.filter((r) => r.kind === 'sprite').map((row) => ({ row, role: roleOf(row) })).filter((x) => MOST[x.role]);
  const { mode } = chooseMode(sprites.map((x) => ({ view: x.row.view, role: x.role })));
  const taken = {};
  return sprites.filter((x) => fitsMode(x.row.view, mode) && (taken[x.role] = (taken[x.role] ?? 0) + 1) <= MOST[x.role]).map((x) => x.row);
}

/**
 * bundle: a catalogue bundle. theme: the look to start in. label: what the picture is called.
 * fallback(): what to show instead when the kit has nothing to stand in a scene (a kit of sounds).
 * Returns { node, setLook(theme), stop(), ready (a promise: true when there is a scene, false when the kit has nothing to stand in one) }.
 */
export function kitScene(bundle, { theme = null, label = `A scene made only from ${bundle.name}`, fallback = null } = {}) {
  const canvas = el('canvas', { class: 'kit-scene-pic', role: 'img', 'aria-label': label, width: 320, height: 180 });
  const node = el('div', { class: 'kit-scene tile', 'data-kit': bundle.id }, canvas);
  const ctx = canvas.getContext('2d');
  const view = { w: 320, h: VIEW_H, zoom: 1 };
  let look = normalizeTheme(theme ?? {}), made = null, raf = 0, gone = false, visible = false, last = 0, drawnOnce = false;

  const fit = () => {
    const cw = node.clientWidth;
    if (!cw || !made) return;
    view.h = Math.min(VIEW_H, made.level.height);
    view.zoom = Math.max(1, Math.min(3, Math.floor(cw / 300)));
    view.w = Math.max(96, Math.min(made.level.width, Math.floor(cw / view.zoom)));
    canvas.width = view.w * view.zoom; canvas.height = view.h * view.zoom;
    canvas.style.width = canvas.width + 'px'; canvas.style.height = canvas.height + 'px';
    drawnOnce = false;
  };
  const paint = () => {
    const cam = cameraFor(made.level, view, made.world.player ?? made.level.start);
    made.painter.draw(ctx, { world: made.world, view, cam, plan: made.plan });
    drawnOnce = true;
    node.dataset.drawn = made.lookKey;
  };
  const tick = (now) => {
    raf = 0;
    if (gone || !made) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!reduceMotion.matches) step(made.world, {}, dt);
    if (!reduceMotion.matches || !drawnOnce) paint();
    if (visible && !reduceMotion.matches) raf = requestAnimationFrame(tick);
  };
  const run = () => { if (!raf && made && !gone) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  /** The painter for a look: every sprite as that look draws it (its shapes too, when the look says so). */
  function dress() {
    const drawn = {};
    for (const e of made.entries) drawn[e.key] = { sprite: e.sprite, params: spriteLook(e.sprite, defaultParams(e.sprite), look).params };
    made.painter = createPainter({ sprites: drawn, colour: look.colour, tiles: made.tiles });
    made.lookKey = JSON.stringify(look);
    drawnOnce = false;
  }

  async function build() {
    const rows = sceneRows(assetsOfBundle(bundle));
    const entries = (await Promise.all(rows.map((row) => loadSprite(row.id).then((sprite) => ({ key: row.id, row, sprite, settings: {} })).catch(() => null)))).filter(Boolean);
    if (gone) return false;
    const plan = planScene(entries, {});
    const placed = entries.filter((e) => e.key === plan.player || plan.scene.includes(e.key));
    if (plan.empty || plan.soundsOnly || (!placed.length && !plan.tilesets.length && !plan.background)) return false;
    const kinds = placed.map((e) => buildKind({ key: e.key, sprite: e.sprite, row: e.row, settings: { params: defaultParams(e.sprite), cues: {} } }, plan.roles[e.key],
      { hostile: false }));
    for (const k of kinds) for (const clip of k.clipNames) k.cues[clip] = [];      // a picture: nothing sounds
    const tiles = tileIndex(plan.tilesets.map((key) => { const s = entries.find((e) => e.key === key).sprite; return { key, names: Object.keys(s.clips), size: s.size[0], clips: s.clips }; }));
    const level = makeLevel(plan.mode, levelFeatures(tiles, plan.mode));
    const world = createWorld({ mode: plan.mode, level, kinds, player: plan.player });
    made = { entries, plan, tiles, level, world };
    dress();
    fit();
    run();
    return true;
  }

  let asked = null;
  const start = () => (asked ??= build().catch((e) => { console.warn(`kit scene ${bundle.id}:`, e); return false; }).then((ok) => { if (!ok && !gone) { node.classList.add('is-empty'); if (fallback) node.replaceChildren(fallback()); } return ok; }));
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) { start(); run(); }
  }, { rootMargin: '200px 0px' });
  io.observe(node);
  const ro = new ResizeObserver(() => { fit(); run(); });
  ro.observe(node);

  let ready = null;
  return {
    node,
    get ready() { return (ready ??= start()); },
    setLook(t) { look = normalizeTheme(t ?? {}); if (made) { dress(); run(); } },
    stop() { gone = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); },
  };
}
