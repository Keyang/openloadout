// One bag item in the editing panel (app/panel.js), for the pages that show the panel beside something else: the bag's
// list and the playground's scene (docs/site-design.md, section 5). The item is edited where it is: every change goes
// through an edit session (app/editing.js) that names the item by its key, so it is saved to that item as it is made.
// The panel shows the item itself at its top, as it is set (docs/user-journeys.md, J4.2 and rule R1): a sprite as a moving
// picture in its look, a sound or a track with a Play button, so a change is seen or heard where it is made.
//
//   const ed = itemEditor(item, asset, { onAct, head });      ed.node (the panel), ed.edit (the session), ed.play() (a sound), ed.close()
import { defaultParams, cleanParams, clipFps } from '../engine/sprite.js';
import { soundParams, rendered, renderAsync, playRendered, playLive } from './audio.js';
import { defaultCues, activeTheme } from './bundle.js';
import { createEdit, countChanges } from './editing.js';
import { bag, cleanSettings, lookOf, themeFor } from './bag.js';
import { artStyleOf, styleById } from '../engine/styles.js';
import { framePicture, showPicture } from './art.js';      // pixel art crisp, a flat picture smooth (the header's art style)
import { applySound, themedSoundParams, soundSettingsFor } from '../sound/theme.js';
import { el, reduceMotion } from './ui.js';
import { editPanel } from './panel.js';
import { lookTab } from './asset-look.js';
import { soundLookTab } from './sound-look.js';

/** An asset's own settings, complete, as an edit session wants them (the same as its own page starts from). */
export function standardOf(kind, asset) {
  if (kind === 'sprite') return { params: defaultParams(asset), cues: defaultCues(asset), scale: 1 };
  return kind === 'sound' ? { params: soundParams(asset), style: null, seed: 1 } : { params: soundParams(asset), style: null };
}

/**
 * What an item's settings leave out of its controls: a sprite's own values; a sound's or a track's version's (its named
 * style's), which a shared link leaves out (app/bag.js compact). Filled from the plain defaults they would read as
 * changed, and play wrong (J9.1).
 */
export function baseParams(kind, asset, settings) {
  return kind === 'sprite' ? defaultParams(asset) : soundParams(asset, settings && settings.style);
}

/** The largest whole-number scale (or whole-number fraction) at which a w × h picture fits a box of bw × bh. */
export function wholeScale(w, h, bw, bh, most = 8) {
  if (w <= 0 || h <= 0 || bw <= 0 || bh <= 0) return 1;
  const z = Math.min(bw / w, bh / h);
  return z >= 1 ? Math.min(most, Math.floor(z)) : 1 / Math.ceil(1 / z);
}

const NOTE = 'M6 12V3.5l6-1.5v8.5M6 12a1.8 1.8 0 1 1-3.6 0A1.8 1.8 0 0 1 6 12Zm6-1.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z';
const SPEAKER = 'M2.5 6h2.5l3.5-3v10l-3.5-3H2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8';
function icon(d, size) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'rx-preview-icon' })) n.setAttribute(k, v);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); n.append(p);
  return n;
}

/**
 * A sprite as it is set, moving, in its look: one canvas the size of what is ever drawn over its animation, shown at a
 * whole-number scale with crisp pixels (a vector style, flat, smooth: drawn for the size it is shown at, app/art.js).
 * read() -> { params, artStyle, theme, record }: what to draw, asked again whenever the item changes (redraw()). Still
 * while the visitor asked for less motion.
 */
function spriteStage(sprite, read) {
  const cv = el('canvas', { width: 1, height: 1, role: 'img', 'aria-label': `${sprite.name}, as it is set here` });
  const tile = el('div', { class: 'rx-preview-tile' }, cv);
  const clip = sprite.preview, c = sprite.clips[clip];
  let sig = '', frames = new Map(), box = null, now = null, fps = 8, last = -1, start = performance.now(), raf = 0, k = 1, vector = false;
  // grid: the frame-size grid, which says where a vector frame draws; the picture itself is drawn for the scale shown (k)
  const frame = (f, grid = false) => {
    const id = `${f}|${grid}`;
    let pic = frames.get(id);
    if (!pic) {
      pic = framePicture(sprite, clip, f, now.params, { style: now.artStyle, theme: now.theme, record: now.record, grid, zoom: Math.max(2, k) });
      frames.set(id, pic);
    }
    return pic;
  };
  // the smallest box that holds every drawn pixel of every frame (in frame pixels), so the picture does not jump while it moves
  function drawnBox() {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let f = 0; f < c.frames; f++) {
      const f0 = frame(f, vector).canvas, d = f0.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, f0.width, f0.height).data;
      for (let y = 0; y < f0.height; y++) for (let x = 0; x < f0.width; x++) if (d[(y * f0.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const [fw, fh] = sprite.size;
    if (x1 < 0) return { x: 0, y: 0, w: fw, h: fh };
    // (a vector picture's soft edge reaches a little past the grid's pixels)
    if (vector) { x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(fw - 1, x1 + 1); y1 = Math.min(fh - 1, y1 + 1); }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function fit() {
    if (!box) return;
    const w = tile.clientWidth - 8, h = tile.clientHeight - 8;
    if (w <= 0 || h <= 0) return;
    const was = k;
    k = wholeScale(box.w, box.h, w, h);
    cv.style.width = `${box.w * k}px`; cv.style.height = `${box.h * k}px`;
    // a vector picture shown larger or smaller is drawn again for its new size
    if (vector && k !== was && now) { for (const id of [...frames.keys()]) if (id.endsWith('|false')) frames.delete(id); if (last >= 0) { const f = last; last = -1; draw(f); last = f; } }
  }
  function draw(f) {
    const pic = frame(f), q = pic.k;
    const w = Math.round(box.w * q), h = Math.round(box.h * q);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; showPicture(cv, q); }
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = q > 1;
    if (q > 1) g.imageSmoothingQuality = 'high';
    g.drawImage(pic.canvas, box.x * q, box.y * q, w, h, 0, 0, w, h);
  }
  function redraw() {
    const next = read(), s = JSON.stringify(next);
    if (s === sig) return;
    sig = s; now = next; frames = new Map(); last = -1;
    try {
      vector = (styleById(artStyleOf(sprite, now.artStyle))?.pictureScale ?? 1) > 1;
      fps = clipFps(sprite, clip, cleanParams(sprite, now.params));
      box = drawnBox();
      fit();
      draw(still());
    } catch (e) { console.error(`picture of ${sprite.id}:`, e); }
  }
  // the still frame: the first of a loop, the middle of a one-shot
  const still = () => (c.loop === false ? Math.floor(c.frames / 2) : 0);
  const tick = (t) => {
    raf = requestAnimationFrame(tick);
    if (!box) return;
    let f = still();
    if (!reduceMotion.matches) {
      const n = Math.floor(((t - start) / 1000) * fps);
      f = c.loop === false ? Math.min(c.frames - 1, n % (c.frames + Math.round(fps * 0.6))) : n % c.frames;
    }
    if (f === last) return;
    last = f;
    draw(f);
  };
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
  if (watch) watch.observe(tile);
  // W5-B: a sprite made on a visit is drawn in a worker and its frames arrive later: what was drawn meanwhile is dropped then
  const offFrames = typeof sprite.onFrames === 'function' ? sprite.onFrames(() => { sig = ''; redraw(); }) : null;
  redraw();
  raf = requestAnimationFrame(tick);
  return { node: el('div', {}, tile), redraw, stop() { cancelAnimationFrame(raf); if (watch) watch.disconnect(); if (offFrames) offFrames(); } };
}

/**
 * item: a bag item { key, kind, id }. asset: its sprite object, or its sound or track patch.
 * onAct(what): after the visitor does something in the panel (see app/panel.js). versions: how many version tiles.
 * tabs: extra tabs for the panel. head: the panel's title row (the bag's: name, its page, Close).
 * A sound plays after each change, so the change is heard; a track is played with play() (the Play button on its picture).
 */
export function itemEditor(item, asset, { onAct = () => {}, versions = 12, tabs = [], head = null, onCopyLink = null } = {}) {
  const { kind } = item;
  let timer = 0, heard = 0, voice = null, closed = false, starting = false;
  const edit = createEdit({
    kind, id: item.id, key: item.key, defaults: standardOf(kind, asset),
    baseFor: kind === 'sprite' ? null : (s) => baseParams(kind, asset, s),
    schedule: (fn) => { clearTimeout(timer); timer = setTimeout(fn, 150); },      // a slider being dragged is a few saves, not hundreds
  });
  // the look it is drawn and played in: its own, or the bag's
  const themeNow = () => themeFor(edit.settings(), bag.theme());

  const stop = () => { if (voice) voice.stop(); voice = null; syncPlay(); };
  /** Play it as it is set now, in its look (a sound once, a track until stopped). Returns a promise of true while it sounds. */
  async function play() {
    if (voice || starting) { starting = false; stop(); return false; }
    const s = edit.settings(), theme = themeNow(), t = activeTheme(theme);
    const params = soundParams(asset, s.style, s.params);
    try {
      if (kind === 'sound') {
        const raw = rendered(asset, t ? themedSoundParams(asset, params, t) : params, s.seed ?? 1);
        const h = playRendered(t ? applySound(raw, soundSettingsFor(asset, t)) : raw, { force: true, loop: !!asset.loop, onended: () => { if (voice === h) { voice = null; syncPlay(); } } });
        voice = h;
      } else {
        starting = true; syncPlay();
        const heardParams = themedSoundParams(asset, params, theme);
        // a look that changes brightness is heard from the rendered loop (live play cannot follow it), as in the bag's list
        const rendersFirst = soundSettingsFor(asset, theme).brightness !== 0;
        const loop = async () => { const r = await renderAsync(asset, { ...heardParams }); const h = playRendered(rendersFirst ? applySound(r, soundSettingsFor(asset, theme)) : r, { force: true, loop: true }); return h && { stop: () => h.stop() }; };
        let v;
        if (rendersFirst) v = await loop();
        else { try { v = await playLive(asset, { ...heardParams }); } catch { v = await loop(); } }
        const wanted = starting;
        starting = false;
        if (closed || !wanted) { if (v) v.stop(); syncPlay(); return false; }
        voice = v;
      }
    } catch (e) { starting = false; console.warn(`${kind} ${item.id}:`, e); }
    syncPlay();
    return !!voice;
  }
  // a short sound is heard again a moment after it was changed (not a loop, not a track: those are played on purpose)
  const hearSoon = () => {
    if (kind !== 'sound' || asset.loop) return;
    clearTimeout(heard);
    heard = setTimeout(() => { if (closed) return; if (voice) { voice.stop(); voice = null; } play(); }, 220);
  };

  // ---- the item itself, at the top of the panel ----
  let stage = null, playBtn = null, preview;
  if (kind === 'sprite') {
    stage = spriteStage(asset, () => {
      const s = edit.settings(), own = !!lookOf(s), there = bag.get(item.key);
      return { params: cleanParams(asset, s.params ?? {}), artStyle: s.artStyle, theme: themeNow(), record: own ? undefined : there?.settings?.lookParams };
    });
    preview = stage.node;
  } else {
    playBtn = el('button', { type: 'button', class: 'btn btn-secondary play', onclick: () => play() }, 'Play');
    preview = el('div', {}, el('div', { class: 'rx-preview-tile is-sound' }, icon(kind === 'music' ? NOTE : SPEAKER, 48), playBtn));
  }
  function syncPlay() {
    if (!playBtn) return;
    const w = voice ? 'Stop' : starting ? 'Starting…' : 'Play';
    playBtn.textContent = w;
    playBtn.setAttribute('aria-label', `${voice || starting ? 'Stop' : 'Play'} ${asset.name} as it is set here`);
  }
  syncPlay();

  // ---- the item's own look: one of the named looks, worn whatever the bag's look is; or none, and it follows the bag.
  // The same tab, with the same pictures, as on the asset's own page (app/asset-look.js, app/sound-look.js).
  let panel = null;
  const say = (text) => { if (panel) panel.say(text); };
  const pick = (id) => { edit.set({ look: id }); if (kind !== 'sprite') { if (voice) { voice.stop(); voice = null; } play(); } };
  const looks = kind === 'sprite'
    ? lookTab({ sprite: asset, now: () => { const s = edit.settings(); return { params: cleanParams(asset, s.params ?? {}), style: artStyleOf(asset, s.artStyle), look: lookOf(s) }; }, pick, say })
    : soundLookTab({ patch: asset, now: () => lookOf(edit.settings()), pick, say });
  const lookPane = { id: 'look', label: 'Look', changed: () => !!lookOf(edit.settings()), node: el('div', { class: 'item-look' }, looks.node) };

  panel = editPanel({
    kind, asset, edit, versions, tabs: [lookPane, ...tabs], head, preview, onCopyLink,
    sizeNote: kind === 'sprite' ? (scale) => `${asset.size[0] * scale} × ${asset.size[1] * scale}` : null,
    onAct: (what) => { if (what === 'control' || what === 'version' || what === 'surprise' || what === 'startover') hearSoon(); onAct(what); },
    onTab: (id) => { if (!looks.show) return; if (id === 'look') looks.show(); else looks.hide(); },
  });
  // every change (here, in the bag's look, in another tab) is drawn on the picture at once
  const offChange = edit.onChange(() => { looks.sync(); if (stage) stage.redraw(); });
  const flush = () => edit.flush();
  window.addEventListener('pagehide', flush);      // closing the tab mid-drag still saves the last change

  return {
    node: panel.node, panel, edit, key: item.key, kind, id: item.id,
    play, stop, playing: () => !!voice || starting,
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(heard); starting = false; stop();
      window.removeEventListener('pagehide', flush);
      if (stage) stage.stop();
      if (looks.close) looks.close();
      offChange(); panel.close(); edit.close(); clearTimeout(timer);      // leaving saves whatever was still waiting
    },
  };
}

/** How many things a bag item changes from its asset's own settings (what the panel's footer counts, for a list's row). */
export function changesOf(item, asset) {
  const std = standardOf(item.kind, asset), s = item.settings ?? {};
  const whole = (x) => { const c = cleanSettings(item.kind, { ...std, ...x, params: { ...std.params, ...baseParams(item.kind, asset, x), ...(x.params ?? {}) } }); if (item.kind === 'sprite' && !c.cues) c.cues = cleanSettings('sprite', std).cues; delete c.lookParams; return c; };
  return countChanges(item.kind, whole(s), whole(std));
}
