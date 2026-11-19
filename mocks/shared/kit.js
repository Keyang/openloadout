// Shared kit for the design mock-ups. NOT part of the site: mock-ups only.
// It lets a static mock page show real Loadout sprites, drawn live by the real engine,
// so a slider in a mock actually changes the picture.
//
// Use it from any mock page (pages live in mocks/<design>/):
//   <script type="module" src="../shared/kit.js"></script>
//   <lo-sprite sprite="knight" clip="walk" scale="4"></lo-sprite>
//
// See mocks/shared/README.md for the whole list of attributes, methods and helpers.

import { renderFrame, defaultParams, cleanParams, randomParams, clipFps, inEffect, partList, partOf } from '../../engine/sprite.js';
import { THEME_PRESETS, renderThemedFrame } from '../../engine/theme.js';

const ROOT = new URL('../../', import.meta.url);

/** Whole-set looks a person can pick: [{ id, name, blurb }]. 'original' is first. */
export const looks = THEME_PRESETS.map(({ id, name, blurb }) => ({ id, name, blurb }));
const themeOf = (id) => THEME_PRESETS.find((p) => p.id === id)?.theme ?? null;

let catalogPromise;
/** The real catalogue: { assets: [...], bundles: [...] }. Paths in it (thumb, strip) are relative to the site root: use url(). */
export function loadCatalog() {
  return (catalogPromise ??= fetch(new URL('generated/catalog.json', ROOT)).then((r) => r.json()));
}
/** Turn a catalogue path ("generated/thumbs/knight.png") into a URL that works from any mock page. */
export const url = (path) => new URL(path, ROOT).href;
/** URL of an asset's still picture (sprites: one frame at double size; sounds: a small drawn icon). */
export const thumb = (id) => url(`generated/thumbs/${id}.png`);

const spriteCache = new Map();
/** Load one sprite definition by id (the real source file). */
export function loadSprite(id) {
  if (!spriteCache.has(id)) spriteCache.set(id, import(new URL(`sprites/${id}.js`, ROOT).href).then((m) => m.default));
  return spriteCache.get(id);
}

/**
 * The controls a person sees for a sprite at these settings, grouped the way the site groups them.
 * Returns [{ group, part, items: [{ key, kind, label, value, def, min, max, step, lo, hi, options, swatches, isSelector }] }]
 *   kind: 'range' (slider; lo/hi are the plain words for its two ends), 'choice' (options: [{ value, label }]),
 *         'color' (swatches: ['#rrggbb', ...]), 'toggle' (on/off).
 *   part: set when the group is one wearable part (Hair, Weapon, ...): { name, label }. Its first item picks which (isSelector).
 * Controls that do nothing at the current settings are left out, exactly as on the site.
 */
export function controlsOf(sprite, params) {
  const groups = [];
  const groupFor = (name, part) => {
    let g = groups.find((x) => x.group === name);
    if (!g) groups.push((g = { group: name, part: part ? { name: part.name, label: part.label } : null, items: [] }));
    return g;
  };
  for (const [key, d] of Object.entries(sprite.params)) {
    if (!inEffect(sprite, key, params)) continue;
    const part = partOf(sprite, key);
    const g = part ? groupFor(part.label, part) : groupFor(d.group ?? 'Look', null);
    g.items.push({
      key, kind: d.kind, label: d.label, value: params[key], def: d.def,
      min: d.min, max: d.max, step: d.step, lo: d.lo, hi: d.hi,
      options: d.options, swatches: d.swatches, isSelector: !!part && key === part.selector,
    });
  }
  return groups;
}

const css = new CSSStyleSheet();
css.replaceSync(':host{display:inline-block;line-height:0}canvas{display:block;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}');

/**
 * <lo-sprite>: one real sprite, drawn live.
 * Attributes (all optional except sprite):
 *   sprite="knight"       the sprite id (any id in the catalogue with kind "sprite")
 *   clip="walk"           which animation; default is the sprite's card animation
 *   scale="4"             whole-number zoom; the element is frame size x scale CSS pixels. Leave out and size it with CSS instead
 *                         (keep the frame's aspect ratio; whole multiples of the frame size look best)
 *   look="night"          one of the looks (see `looks`); default original
 *   params='{"hairStyle":"long"}'   settings that differ from the defaults (JSON)
 *   layers                for backgrounds: draw every layer (far, mid, near) stacked into one picture
 *   paused                show one frame and do not animate
 *   frame="3"             the frame to show when paused
 *   hover                 stay on one frame until the pointer is over the element (good for library cards)
 *   flip                  mirror left-right
 * Properties and methods (after the 'ready' event, or await el.ready):
 *   el.def                the sprite definition (name, clips, params, parts, size ...)
 *   el.params             current settings { key: value }
 *   el.clips              [{ name, label, frames, loop }]
 *   el.set(key, value)    change one setting; redraws at once
 *   el.setParams(obj)     change several
 *   el.setClip(name), el.setLook(id), el.surprise(), el.reset(), el.play(), el.pause()
 *   el.controls()         controlsOf(el.def, el.params)
 *   el.changed()          keys whose value differs from the default
 * Events: 'ready' once loaded; 'change' after any setting, clip or look change.
 */
class LoSprite extends HTMLElement {
  static observedAttributes = ['sprite', 'clip', 'look', 'params', 'scale', 'paused', 'frame', 'layers', 'flip'];
  #cv = document.createElement('canvas');
  #g = this.#cv.getContext('2d');
  #frames = new Map();
  #raf = 0; #t0 = 0; #visible = true; #over = false; #token = 0;
  def = null; params = {}; clip = null; look = 'original';
  ready;
  #resolveReady;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [css];
    root.append(this.#cv);
    this.ready = new Promise((r) => (this.#resolveReady = r));
  }
  connectedCallback() {
    this.#io = new IntersectionObserver(([e]) => { this.#visible = e.isIntersecting; this.#tick(); });
    this.#io.observe(this);
    this.addEventListener('pointerenter', () => { this.#over = true; this.#t0 = performance.now(); this.#tick(); });
    this.addEventListener('pointerleave', () => { this.#over = false; this.#draw(0); });
    this.#load();
  }
  disconnectedCallback() { this.#io?.disconnect(); cancelAnimationFrame(this.#raf); }
  #io;
  attributeChangedCallback(name, was, now) {
    if (was === now || !this.isConnected) return;
    if (name === 'sprite') return void this.#load();
    if (!this.def) return;
    if (name === 'clip' && now && this.def.clips[now]) this.clip = now;
    if (name === 'look') this.look = now || 'original';
    if (name === 'params') this.params = cleanParams(this.def, { ...defaultParams(this.def), ...this.#attrParams() });
    if (name === 'scale') this.#size();
    if (name === 'flip') this.#cv.style.transform = this.hasAttribute('flip') ? 'scaleX(-1)' : '';
    this.#restart();
  }
  #attrParams() { try { return JSON.parse(this.getAttribute('params') || '{}'); } catch { return {}; } }
  async #load() {
    const id = this.getAttribute('sprite');
    if (!id) return;
    const token = ++this.#token;
    const def = await loadSprite(id);
    if (token !== this.#token) return;
    this.def = def;
    this.params = cleanParams(def, { ...defaultParams(def), ...this.#attrParams() });
    const want = this.getAttribute('clip');
    this.clip = want && def.clips[want] ? want : def.preview && def.clips[def.preview] ? def.preview : Object.keys(def.clips)[0];
    this.look = this.getAttribute('look') || 'original';
    this.#cv.width = def.size[0]; this.#cv.height = def.size[1];
    this.#cv.style.transform = this.hasAttribute('flip') ? 'scaleX(-1)' : '';
    this.#size();
    this.#restart();
    this.#resolveReady(this);
    this.dispatchEvent(new CustomEvent('ready', { bubbles: true }));
  }
  #size() {
    const s = Number(this.getAttribute('scale'));
    if (s && this.def) { this.style.width = `${this.def.size[0] * s}px`; this.style.height = `${this.def.size[1] * s}px`; }
    else if (this.def && !this.style.aspectRatio) this.style.aspectRatio = `${this.def.size[0]} / ${this.def.size[1]}`;
  }
  get clips() { return Object.entries(this.def?.clips ?? {}).map(([name, c]) => ({ name, label: c.label ?? name[0].toUpperCase() + name.slice(1), frames: c.frames, loop: !!c.loop })); }
  #image(clip, f) {
    const key = `${clip}:${f}`;
    if (!this.#frames.has(key)) {
      const theme = themeOf(this.look);
      const g = theme && this.look !== 'original' ? renderThemedFrame(this.def, clip, f, this.params, theme) : renderFrame(this.def, clip, f, this.params);
      this.#frames.set(key, new ImageData(g.bytes(), g.w, g.h));
    }
    return this.#frames.get(key);
  }
  #draw(f) {
    if (!this.def) return;
    try {
      if (this.hasAttribute('layers')) {
        // backgrounds: every layer on top of the last
        const tmp = (this.#tmp ??= new OffscreenCanvas(this.def.size[0], this.def.size[1]));
        const tg = tmp.getContext('2d');
        this.#g.clearRect(0, 0, this.#cv.width, this.#cv.height);
        for (const name of Object.keys(this.def.clips)) {
          tg.putImageData(this.#image(name, f % this.def.clips[name].frames), 0, 0);
          this.#g.drawImage(tmp, 0, 0);
        }
      } else {
        this.#g.putImageData(this.#image(this.clip, f % this.def.clips[this.clip].frames), 0, 0);
      }
    } catch (err) { console.warn(`lo-sprite ${this.def.id}:`, err.message); }
  }
  #tmp;
  #animating() {
    if (this.hasAttribute('paused') || this.hasAttribute('layers')) return false;
    if (this.hasAttribute('hover') && !this.#over) return false;
    return this.#visible && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  #tick() {
    cancelAnimationFrame(this.#raf);
    if (!this.def) return;
    if (!this.#animating()) return void this.#draw(Number(this.getAttribute('frame')) || 0);
    const c = this.def.clips[this.clip], fps = clipFps(this.def, this.clip, this.params);
    const step = (now) => {
      const n = Math.floor(((now - this.#t0) / 1000) * fps);
      // one-shot clips hold their last frame for a moment, then start again
      const f = c.loop ? n % c.frames : Math.min(n % (c.frames + Math.ceil(fps * 0.7)), c.frames - 1);
      this.#draw(f);
      if (this.#animating()) this.#raf = requestAnimationFrame(step);
    };
    this.#raf = requestAnimationFrame(step);
  }
  #restart() { this.#frames.clear(); this.#t0 = performance.now(); this.#tick(); }
  #changed() { this.#restart(); this.dispatchEvent(new CustomEvent('change', { bubbles: true })); }

  set(key, value) { this.params = cleanParams(this.def, { ...this.params, [key]: value }); this.#changed(); }
  setParams(obj) { this.params = cleanParams(this.def, { ...this.params, ...obj }); this.#changed(); }
  setClip(name) { if (this.def.clips[name]) { this.clip = name; this.#changed(); } }
  setLook(id) { this.look = id || 'original'; this.#changed(); }
  surprise() { this.params = randomParams(this.def, Math.floor(Math.random() * 1e9)); this.#changed(); }
  reset() { this.params = defaultParams(this.def); this.#changed(); }
  play() { this.removeAttribute('paused'); this.#restart(); }
  pause() { this.setAttribute('paused', ''); this.#tick(); }
  controls() { return controlsOf(this.def, this.params); }
  changed() { const d = defaultParams(this.def); return Object.keys(d).filter((k) => d[k] !== this.params[k]); }
  parts() { return partList(this.def); }
}
customElements.define('lo-sprite', LoSprite);
