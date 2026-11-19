// Live sprites for the landing page: a sprite drawn by the real engine, frame by frame, on a canvas of its own size.
// One clock runs every live sprite on the page. A sprite that is off screen is not drawn, and with "reduce motion"
// each one shows a single frame. Nothing here is kept between visits: stop() ends everything a page started.
import { renderFrame, defaultParams, cleanParams, randomParams, clipFps } from '../engine/sprite.js';
import { renderThemedFrame } from '../engine/theme.js';
import { el, reduceMotion } from './ui.js';
import { loadSprite } from './catalog.js';

/**
 * A group of live sprites with one clock. Returns { sprite(row, opts), still(def, clip, theme, params), stop() }.
 *   sprite(row, { clip, params, scale, flip, layers, paused, frame, theme }) ->
 *     { node (canvas), ready (promise of the sprite's program, or null when it could not be loaded), def, params,
 *       set(part), setParams(all), surprise(), reset(), setTheme(theme | null), changed() }
 *   row: the catalogue row (the canvas takes its size from it at once, before the sprite's program arrives)
 *   layers: a background, every layer stacked into one picture, not animated
 */
export function liveGroup() {
  const all = new Set();
  let raf = 0, alive = true;
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) { const s = e.target.live; if (s) { s.visible = e.isIntersecting; if (s.visible) s.dirty = true; } }
    wake();
  }, { rootMargin: '80px' });

  const moving = (s) => s.def && s.visible && !s.paused && !s.layers && !reduceMotion.matches && s.def.clips[s.clip].frames > 1;
  function tick(now) {
    raf = 0;
    if (!alive) return;
    let more = false;
    for (const s of all) {
      if (!s.def || !s.visible) continue;
      if (moving(s)) { s.paint(now); s.moved = true; more = true; continue; }
      if (s.moved) { s.moved = false; s.dirty = true; }          // it has just stopped (reduce motion): back to its resting frame
      if (s.dirty) s.paint(now);
    }
    if (more) raf = requestAnimationFrame(tick);
  }
  function wake() { if (alive && !raf) raf = requestAnimationFrame(tick); }
  const onMotion = () => { for (const s of all) s.dirty = true; wake(); };
  reduceMotion.addEventListener('change', onMotion);

  function sprite(row, { clip = null, params = {}, scale = 2, flip = false, layers = false, paused = false, frame = 0, theme = null } = {}) {
    const [fw, fh] = row.tech?.frame ?? [64, 64];
    const node = el('canvas', { class: 'live', width: fw, height: fh, 'aria-hidden': 'true' });
    if (scale) { node.style.width = `${fw * scale}px`; node.style.height = `${fh * scale}px`; }      // scale 0: the page's own sheet sizes it
    if (flip) node.style.transform = 'scaleX(-1)';
    const g = node.getContext('2d');
    const frames = new Map();
    let tmp = null;
    const s = {
      node, def: null, params: {}, clip, layers, paused, visible: false, dirty: true, t0: performance.now(), shown: -1,
      image(name, f) {
        const key = `${name}:${f}`;
        if (!frames.has(key)) {
          const p = theme ? renderThemedFrame(s.def, name, f, s.params, theme) : renderFrame(s.def, name, f, s.params);
          frames.set(key, new ImageData(p.bytes(), p.w, p.h));
        }
        return frames.get(key);
      },
      paint(now) {
        const c = s.def.clips[s.clip];
        let f = frame % c.frames;
        if (moving(s)) {
          const fps = clipFps(s.def, s.clip, s.params), n = Math.floor((Math.max(0, now - s.t0) / 1000) * fps);
          // a clip that plays once holds its last frame for a moment, then starts again
          f = c.loop === false ? Math.min(n % (c.frames + Math.ceil(fps * 0.7)), c.frames - 1) : n % c.frames;
        }
        if (f === s.shown && !s.dirty) return;
        s.shown = f; s.dirty = false;
        try {
          if (layers) {
            tmp ??= el('canvas', { width: fw, height: fh });
            const tg = tmp.getContext('2d');
            g.clearRect(0, 0, fw, fh);
            for (const name of Object.keys(s.def.clips)) { tg.putImageData(s.image(name, 0), 0, 0); g.drawImage(tmp, 0, 0); }
          } else g.putImageData(s.image(s.clip, f), 0, 0);
        } catch (e) { console.warn(`Loadout: "${row.id}" could not be drawn.`, e); }
      },
      redraw() { frames.clear(); s.dirty = true; wake(); },
      set(part) { if (s.def) { s.params = cleanParams(s.def, { ...s.params, ...part }); s.redraw(); } },
      setParams(next) { if (s.def) { s.params = cleanParams(s.def, { ...defaultParams(s.def), ...next }); s.redraw(); } },
      surprise() { if (s.def) { s.params = randomParams(s.def, Math.floor(Math.random() * 1e9)); s.redraw(); } },
      reset() { if (s.def) { s.params = defaultParams(s.def); s.redraw(); } },
      setTheme(next) { theme = next; if (s.def) s.redraw(); },
      /** The settings that differ from the sprite's own. */
      changed() { const d = defaultParams(s.def); return Object.fromEntries(Object.keys(d).filter((k) => d[k] !== s.params[k]).map((k) => [k, s.params[k]])); },
    };
    node.live = s;
    all.add(s);
    s.ready = loadSprite(row.id).then((def) => {
      if (!alive) return null;
      s.def = def;
      s.params = cleanParams(def, { ...defaultParams(def), ...params });
      s.clip = clip && def.clips[clip] ? clip : def.preview && def.clips[def.preview] ? def.preview : Object.keys(def.clips)[0];
      seen.observe(node);
      return def;
    }).catch((e) => { console.warn(`Loadout: the sprite "${row.id}" could not be loaded.`, e); return null; });
    return s;
  }

  /** One frame of a loaded sprite as a picture address (ground tiles are laid as a repeating background). */
  function still(def, clip, theme = null, params = defaultParams(def)) {
    const p = theme ? renderThemedFrame(def, clip, 0, params, theme) : renderFrame(def, clip, 0, params);
    const cv = el('canvas', { width: p.w, height: p.h });
    cv.getContext('2d').putImageData(new ImageData(p.bytes(), p.w, p.h), 0, 0);
    return cv.toDataURL();
  }

  return {
    sprite, still,
    stop() { alive = false; cancelAnimationFrame(raf); seen.disconnect(); reduceMotion.removeEventListener('change', onMotion); all.clear(); },
  };
}
