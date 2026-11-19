// Design 4, "Scene first": what the three pages share.
// One saved "your game" (the bag), the tray that shows it on every page, a scene that draws it,
// and a small popover for changing a thing right where it stands.

/* ---------- loading, patiently ----------
   The mock-ups are served by a very small local server that drops connections when several pages load at once.
   So every file is fetched here first (a few tries, a few at a time); the browser then has it at hand when the
   shared kit asks for it. This is only for the mock-up. */
const ROOT = new URL('../../', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let busy = 0; const waiting = [];
async function get(u, tries = 6) {
  if (busy >= 4) await new Promise((r) => waiting.push(r));
  busy++;
  try {
    for (let i = 0; ; i++) {
      try { const r = await fetch(u); if (r.ok) return r; throw new Error(`${r.status} ${u}`); }
      catch (err) { if (i >= tries) throw err; await sleep(120 * (i + 1) + Math.random() * 200); }
    }
  } finally { busy--; waiting.shift()?.(); }
}
const fetched = new Map();
const depsOf = (u) => {
  if (!fetched.has(u)) fetched.set(u, get(u).then((r) => r.text()).then((text) => [...text.matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => new URL(m[1], u).href), () => []));
  return fetched.get(u);
};
/** Fetch a script and everything it imports, so loading it afterwards cannot fail half way. */
async function warm(entry) {
  const seen = new Set([String(entry)]);
  let layer = [String(entry)];
  while (layer.length) {
    const next = (await Promise.all(layer.map(depsOf))).flat().filter((u) => !seen.has(u));
    layer = [...new Set(next)];
    layer.forEach((u) => seen.add(u));
  }
}
/** A picture's address, once it is known to load. */
export const picture = (u) => get(u).then(() => u, () => u);
/** Run fn the first time el comes near the window, or after a short while (so a full-page picture is complete too). */
let seenQueue = 0;
export function whenSeen(el, fn) {
  let done = false;
  const go = () => { if (!done) { done = true; io.disconnect(); fn(); } };
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) go(); }, { rootMargin: '300px' });
  io.observe(el);
  setTimeout(go, 700 + 300 * seenQueue++);
}

await warm(new URL('mocks/shared/kit.js', ROOT));
await get(new URL('generated/catalog.json', ROOT)).catch(() => {});
const kit = await import('../shared/kit.js');
export const { looks, thumb, url } = kit;

const cat = await kit.loadCatalog();
export const assets = cat.assets;
export const bundles = cat.bundles;
export const byId = Object.fromEntries(assets.map((a) => [a.id, a]));

/* ---------- small helpers ---------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (name === 'lo-sprite' && attrs?.sprite) { // give the sprite its id only once its files are at hand
    const { sprite, ...rest } = attrs; attrs = rest;
    warm(new URL(`sprites/${sprite}.js`, ROOT)).then(() => el.setAttribute('sprite', sprite));
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
const raf = () => new Promise((r) => requestAnimationFrame(r));
const svg = (d, extra = '') => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  plus: svg('<path d="M8 3v10M3 8h10"/>'),
  check: svg('<path d="M3 8.5l3.2 3.2L13 4.8"/>'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  down: svg('<path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10"/>'),
  play: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 3.2v9.6L13 8z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.5 3h2.6v10H4.5zM8.9 3h2.6v10H8.9z" fill="currentColor"/></svg>',
  search: svg('<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L13.5 13.5"/>'),
  dots: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="13" cy="8" r="1.4" fill="currentColor"/></svg>',
  note: svg('<path d="M6 12V3.5l6-1.2V10.5"/><circle cx="4.4" cy="12" r="1.7"/><circle cx="10.4" cy="10.5" r="1.7"/>'),
};

export const TYPE = {
  character: 'Character', creature: 'Creature', tileset: 'Ground tiles', prop: 'Object', pickup: 'Pickup', projectile: 'Projectile',
  effect: 'Effect', background: 'Background', ui: 'Interface', icon: 'Icons', sfx: 'Sound effect', ambience: 'Background sound', jingle: 'Jingle', music: 'Music',
};
export const secs = (n) => (n >= 10 ? `${Math.round(n)} s` : `${Number(n.toFixed(n < 1 ? 2 : 1))} s`);
export const fixLabel = (s) => String(s).replace(/\bColor/g, 'Colour').replace(/\bcolor/g, 'colour');

/* ---------- the three kits, and how each one is laid out as a scene ---------- */
export const KITS = {
  thornwood: {
    bundle: 'kit-platformer-fantasy', name: 'Thornwood Keep', kind: 'Side-view fantasy platformer', view: 'side', hero: 'knight',
    ground: { id: 'tiles-forest', clip: 'grass-top', h: 22 },
    starter: ['knight', 'slime', 'bat', 'coin', 'bg-forest', 'tiles-forest', 'ui-hud-platformer', 'jump', 'coin-pickup', 'thornwood-overworld'],
    place: { knight: { x: 0.27, clip: 'idle' }, slime: { x: 0.6 }, bat: { x: 0.8, y: 50 }, coin: { x: 0.44, y: 12 } },
    hud: { id: 'ui-hud-platformer', pieces: ['heart-full', 'heart-full', 'heart-half'] },
  },
  hearthvale: {
    bundle: 'kit-rpg-fantasy', name: 'Hearthvale', kind: 'Turn-based fantasy RPG', view: 'side', hero: 'knight',
    starter: ['knight', 'wizard', 'bone-soldier', 'ember-wyrm', 'bg-battle-field', 'ui-bars-rpg', 'sword-slash', 'magic-spell', 'hearthvale-battle'],
    place: { knight: { x: 0.3, clip: 'idle' }, wizard: { x: 0.14, clip: 'idle' }, 'bone-soldier': { x: 0.54, flip: true }, 'ember-wyrm': { x: 0.8, flip: true } },
    hud: { id: 'ui-bars-rpg', bars: [['fill', 0.72], ['fill-b', 0.45]] },
  },
  derelict: {
    bundle: 'kit-roguelite-scifi', name: 'Derelict Station', kind: 'Top-down sci-fi action roguelike', view: 'top', hero: 'void-ranger',
    floor: { id: 'tiles-station-floor', clip: 'floor-fill' }, wall: { id: 'tiles-station-walls', clip: 'wall-bottom' },
    starter: ['void-ranger', 'crawler-bug', 'security-bot', 'credit-chip', 'health-cell', 'tiles-station-floor', 'tiles-station-walls', 'ui-hud-roguelite', 'laser-shot', 'derelict-run'],
    place: { 'void-ranger': { x: 0.3, y: 26, clip: 'idle_down' }, 'crawler-bug': { x: 0.58, y: 10, flip: true }, 'security-bot': { x: 0.8, y: 34 }, 'credit-chip': { x: 0.45, y: 46 }, 'health-cell': { x: 0.68, y: 52 } },
    hud: { id: 'ui-hud-roguelite', pieces: ['hp-full', 'hp-full', 'hp-half', 'shield-full'] },
  },
};
const STARTER_IDS = new Set(Object.values(KITS).flatMap((k) => k.starter));
// backdrops: how far to sink them behind the ground, or where their own floor is (in art pixels from the bottom)
// a backdrop is 320 art pixels wide; wider scenes repeat it mirrored, so the joins match. 'left' starts it at the left edge instead of the middle
const BACKDROP = { 'bg-forest': { lift: 12 }, 'bg-castle': { lift: 8 }, 'bg-starfield': { lift: 0 }, 'bg-battle-field': { own: 20, left: true }, 'bg-battle-dungeon': { own: 20 } };
// the two or three controls shown in the small popover; anything not listed gets its first choice, colour and slider
const QUICK = {
  knight: ['hairStyle', 'weapon', 'outfit'], wizard: ['hat', 'robe', 'magic'], slime: ['body', 'size', 'eyes'], bat: ['body', 'wing', 'span'],
  coin: ['emblem', 'metal', 'size'], 'bg-forest': ['time', 'leaf', 'clouds'], 'bg-battle-field': ['time', 'land', 'clouds'], 'tiles-forest': ['grass', 'soil', 'edge'],
  'ui-hud-platformer': ['shape', 'body', 'metal'], 'ui-bars-rpg': ['style', 'fill', 'fillB'], 'ember-wyrm': ['body', 'wings', 'horns'],
  'void-ranger': ['weapon', 'headgear', 'trim'], 'crawler-bug': ['body', 'horns', 'size'], 'security-bot': ['shape', 'weapon', 'body'],
  'credit-chip': ['shape', 'metal', 'glow'], 'health-cell': ['shape', 'glow', 'level'], 'tiles-station-floor': ['style', 'floor', 'glow'], 'ui-hud-roguelite': ['shape', 'body', 'glow'],
};

/* ---------- "your game": saved by itself, shared by the three pages ---------- */
const KEY = 'loadout-mock-4-scene:v2';
const fresh = () => ({ kit: 'thornwood', look: 'original', items: [...KITS.thornwood.starter], params: {} });
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && KITS[s.kit] && Array.isArray(s.items)) return { ...fresh(), ...s, items: s.items.filter((id) => byId[id]) };
  } catch { /* first visit, or storage is off */ }
  return fresh();
}
export const store = {
  state: load(),
  subs: new Set(),
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); },
  emit(ev) {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* still works for this page */ }
    for (const fn of [...this.subs]) fn(this.state, ev);
  },
  has(id) { return this.state.items.includes(id); },
  changed(id) { return Object.keys(this.state.params[id] || {}).length > 0; },
  add(id) { if (!this.has(id)) { this.state.items.push(id); this.emit({ type: 'items', id, added: id }); } },
  addMany(ids) { const n = ids.filter((id) => byId[id] && !this.has(id)); if (n.length) { this.state.items.push(...n); this.emit({ type: 'items' }); } },
  remove(id) { if (this.has(id)) { this.state.items = this.state.items.filter((x) => x !== id); this.emit({ type: 'items', id }); } },
  toggle(id) { this.has(id) ? this.remove(id) : this.add(id); },
  setParams(id, changed, meta) {
    if (Object.keys(changed).length) this.state.params[id] = changed; else delete this.state.params[id];
    let added;
    if (!this.has(id) && Object.keys(changed).length) { this.state.items.push(id); added = id; } // a change is never lost: it puts the thing in your game
    this.emit({ type: 'params', id, meta, added });
    if (added) this.emit({ type: 'items', id, added });
  },
  setLook(look) { this.state.look = look; this.emit({ type: 'look' }); },
  setKit(kit) {
    const extra = this.state.items.filter((id) => !STARTER_IDS.has(id));
    this.state.kit = kit; this.state.items = [...KITS[kit].starter, ...extra];
    this.emit({ type: 'kit' });
  },
  reset() { this.state = fresh(); this.emit({ type: 'kit' }); },
};
addEventListener('storage', (e) => { if (e.key === KEY) { store.state = load(); for (const fn of [...store.subs]) fn(store.state, { type: 'kit' }); } });

/* ---------- live sprites that follow "your game" ---------- */
const setAttr = (el, k, v) => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
const paramsOf = (id) => JSON.stringify(store.state.params[id] || {});
/** A sprite that always shows the thing as it is in your game (its changes and the game's look). */
export function live(id, attrs = {}) {
  return h('lo-sprite', { sprite: id, 'data-live': id, params: paramsOf(id), look: store.state.look, ...attrs });
}
function syncLive() {
  for (const el of $$('lo-sprite[data-live]')) {
    setAttr(el, 'params', paramsOf(el.dataset.live));
    if (!el.hasAttribute('data-nolook')) setAttr(el, 'look', store.state.look);
  }
}
store.on((s, ev) => { if (ev.type !== 'settle') syncLive(); });

let backstage;
const stash = () => (backstage ??= document.body.appendChild(h('div.backstage', { 'aria-hidden': 'true' })));
const models = new Map();
/** One hidden sprite per id that answers "which controls exist right now" and works out what differs from the defaults. */
export function model(id) {
  if (!models.has(id)) {
    const el = h('lo-sprite', { sprite: id, paused: true, 'data-live': id, 'data-nolook': true, params: paramsOf(id) });
    stash().append(el);
    models.set(id, el.ready.then(() => el));
  }
  return models.get(id);
}
/** Change a thing. The result is kept in your game at once. */
export async function change(id, fn, meta) {
  const m = await model(id);
  fn(m);
  store.setParams(id, Object.fromEntries(m.changed().map((k) => [k, m.params[k]])), meta);
}
const tiles = new Map();
/** One ground tile as a picture, so a whole floor can be laid with it. */
function tileURL(id, clip, isLive) {
  const params = isLive ? paramsOf(id) : '{}', look = isLive ? store.state.look : 'original';
  const key = [id, clip, params, look].join('|');
  if (!tiles.has(key)) {
    tiles.set(key, (async () => {
      const el = h('lo-sprite', { sprite: id, clip, paused: true, params, look });
      stash().append(el);
      await el.ready;
      const out = el.shadowRoot.querySelector('canvas').toDataURL();
      el.remove();
      return out;
    })());
  }
  return tiles.get(key);
}
/** Where the drawn pixels of a sprite are inside its frame, so only the figure itself is clickable. */
async function inkBox(sp) {
  await sp.ready; await raf(); await raf();
  const cv = sp.shadowRoot?.querySelector('canvas');
  if (!cv || !cv.width) return null;
  const { width: w, height: hh } = cv;
  const d = cv.getContext('2d').getImageData(0, 0, w, hh).data;
  let x0 = w, y0 = hh, x1 = -1, y1 = -1;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  if (sp.hasAttribute('flip')) [x0, x1] = [w - 1 - x1, w - 1 - x0];
  return { x: Math.max(0, x0 - 2), y: Math.max(0, y0 - 2), w: Math.min(w, x1 - x0 + 5), h: Math.min(hh, y1 - y0 + 5) };
}

/* ---------- controls ---------- */
function controlEl(id, item, { pictures = false } = {}) {
  const label = fixLabel(item.label);
  const set = (v, kind) => change(id, (m) => m.set(item.key, v), { key: item.key, kind });
  const head = h('div.ctl-l', {}, h('span', { text: label }), item.value !== item.def && h('i.dot', { title: 'Changed' }));
  if (item.kind === 'range') {
    const input = h('input', { type: 'range', min: item.min, max: item.max, step: item.step ?? (item.max - item.min) / 100, value: item.value, 'aria-label': label, 'data-fk': item.key });
    input.addEventListener('input', () => set(Number(input.value), 'range'));
    input.addEventListener('change', () => store.emit({ type: 'settle', id }));
    return h('div.ctl', {}, head, input, h('div.ends', {}, h('span', { text: item.lo ?? '' }), h('span', { text: item.hi ?? '' })));
  }
  if (item.kind === 'choice') {
    const asPictures = pictures && item.isSelector;
    return h('div.ctl', { role: 'group', 'aria-label': label }, head, h(asPictures ? 'div.picks' : 'div.chips', {}, item.options.map((o) => h('button.' + (asPictures ? 'pick' : 'chip'), {
      type: 'button', 'aria-pressed': String(o.value === item.value), 'data-fk': `${item.key}:${o.value}`, onclick: () => set(o.value, 'choice'),
    }, asPictures && h('span.pick-pic', {}, h('lo-sprite', { sprite: id, paused: true, scale: 1, look: store.state.look, params: JSON.stringify({ ...(store.state.params[id] || {}), [item.key]: o.value }) })), h('span', { text: o.label ?? o.value })))));
  }
  if (item.kind === 'color') {
    return h('div.ctl', { role: 'group', 'aria-label': label }, head, h('div.swatches', {}, item.swatches.map((c) => h('button.swatch', {
      type: 'button', style: `--c:${c}`, 'aria-pressed': String(c.toLowerCase() === String(item.value).toLowerCase()), 'aria-label': `${label} ${c}`, 'data-fk': `${item.key}:${c}`, onclick: () => set(c, 'color'),
    }))));
  }
  return h('div.ctl.ctl-row', {}, head, h('button.switch', { type: 'button', role: 'switch', 'aria-checked': String(!!item.value), 'aria-label': label, 'data-fk': item.key, onclick: () => set(!item.value, 'toggle') }));
}
/**
 * The controls of one thing, kept in step with your game.
 * keys: just these (the quick popover). group: just this group (one inspector tab).
 */
export function editor(host, id, { keys = null, group = null, pictures = false, onRender } = {}) {
  let m;
  const render = async () => {
    m ??= await model(id);
    const groups = m.controls();
    let items = groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
    if (keys === 'quick') {
      const want = QUICK[id] ?? [items.find((i) => i.kind === 'choice'), items.find((i) => i.kind === 'color'), items.find((i) => i.kind === 'range')].filter(Boolean).map((i) => i.key);
      items = want.map((k) => items.find((i) => i.key === k)).filter(Boolean);
    }
    if (group) items = items.filter((i) => i.group === group);
    const fk = host.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
    host.replaceChildren(...items.map((it) => controlEl(id, it, { pictures })));
    if (fk) host.querySelector(`[data-fk="${CSS.escape(fk)}"]`)?.focus();
    onRender?.(groups, m);
  };
  const off = store.on((s, ev) => {
    if (ev.id && ev.id !== id) return;
    if (ev.type === 'params' && ev.meta?.kind === 'range') return void onRender?.(m.controls(), m); // do not rebuild a slider while it is being dragged
    if (['params', 'settle', 'kit'].includes(ev.type) || (ev.type === 'look' && pictures)) render();
  });
  render();
  return { render, destroy: off, set group(g) { group = g; render(); } };
}

/* ---------- the scene ---------- */
const STAND = ['character', 'creature', 'prop', 'pickup'];
export class Scene {
  /**
   * o.scale(width, height) -> whole-number zoom; o.height(width, zoom) -> height in art pixels (leave out to fill the host's own height)
   * o.source() -> { kit, items } to show something other than your game (then nothing in it is live)
   * o.focus -> id shown large in the middle with the rest faded; o.plain -> no backdrop; o.onPick(id, anchor, scene)
   */
  constructor(host, o = {}) {
    this.host = host;
    this.o = { scale: (w) => (w >= 1080 ? 3 : 2), height: null, source: null, focus: null, plain: false, onPick: null, clip: {}, max: 8, ...o };
    this.u = 0;
    host.classList.add('scene');
    this.fit();
    new ResizeObserver(() => this.fit()).observe(host);
    this.build();
    if (!this.o.source) store.on((s, ev) => this.onStore(ev));
  }
  get live() { return !this.o.source; }
  get data() { return this.o.source ? this.o.source() : store.state; }
  sprite(id, attrs) { return this.live ? live(id, attrs) : h('lo-sprite', { sprite: id, ...attrs }); }
  fit() {
    const w = this.host.clientWidth, hh = this.host.clientHeight;
    if (!w) return;
    const u = Math.max(1, this.o.scale(w, hh));
    if (this.o.height) this.host.style.height = `${this.o.height(w, u) * u}px`;
    if (this.o.plain && this.u && (u !== this.u || hh !== this.h)) { this.u = u; this.h = hh; this.host.style.setProperty('--u', u); return this.build(); }
    this.h = hh;
    if (u === this.u) return;
    this.u = u;
    this.host.style.setProperty('--u', u);
    for (const sp of $$('lo-sprite', this.host)) sp.setAttribute('scale', u);
  }
  onStore(ev) {
    if (ev.type === 'items' || ev.type === 'kit') return this.build(ev.added);
    if (ev.type === 'params' || ev.type === 'look') { this.paintTiles(); if (ev.meta?.kind !== 'range') this.measure(ev.id); }
    if (ev.type === 'settle') this.measure(ev.id);
  }
  set(o) { Object.assign(this.o, o); this.build(); }
  build(dropped) {
    const s = this.data, kit = KITS[s.kit], host = this.host, u = this.u || 1, o = this.o;
    const has = (id) => s.items.includes(id);
    host.replaceChildren();
    host.dataset.view = kit.view;
    host.classList.toggle('plain', !!o.plain);
    host.classList.remove('nobg');
    host.classList.toggle('focusing', !!o.focus);
    let floor = 14;
    this.tileEls = [];
    if (!o.plain) {
      if (kit.view === 'top') {
        floor = 0;
        if (has(kit.floor.id)) this.tileEls.push([host.appendChild(this.hit('sc-floor', kit.floor.id)), kit.floor]);
        if (has(kit.wall.id)) this.tileEls.push([host.appendChild(this.hit('sc-wall', kit.wall.id)), kit.wall]);
      } else {
        const bg = s.items.find((id) => byId[id].type === 'background');
        const b = BACKDROP[bg] ?? { lift: 0 };
        const ground = kit.ground && has(kit.ground.id) ? kit.ground : null;
        floor = b.own ?? (ground ? ground.h : 14);
        if (bg) {
          const wrap = this.hit('sc-bg', bg);
          wrap.style.bottom = `calc(var(--u) * ${b.own != null ? 0 : floor - b.lift}px)`;
          wrap.append(h(b.left ? 'span.sc-bgrow.left' : 'span.sc-bgrow', {}, (b.left ? [false, true, false] : [true, false, true]).map((flip) => this.sprite(bg, { layers: true, scale: u, flip }))));
          host.append(wrap);
        } else host.classList.add('nobg');
        if (ground) this.tileEls.push([host.appendChild(this.hit('sc-ground', ground.id, `height:calc(var(--u) * ${ground.h}px)`)), ground]);
        else if (b.own == null) host.append(h('div.sc-ground.flat', { style: `height:calc(var(--u) * ${floor}px)` }));
      }
    }
    this.paintTiles();

    // who stands where
    let cast = s.items.filter((id) => STAND.includes(byId[id].type));
    if (o.focus) cast = [o.focus, ...cast.filter((id) => id !== o.focus)].slice(0, o.plain ? 1 : 5);
    cast = cast.slice(0, o.max);
    const free = kit.view === 'top'
      ? [[0.52, 30], [0.7, 14], [0.88, 44], [0.36, 50], [0.16, 16], [0.62, 54], [0.24, 40], [0.93, 12]]
      : [[0.58, 0], [0.76, 0], [0.42, 0], [0.9, 0], [0.1, 0], [0.68, 0], [0.5, 0], [0.35, 0]];
    const sides = [0.13, 0.87, 0.3, 0.72];
    const heroX = kit.place[kit.hero]?.x ?? 0.27;
    cast.forEach((id, i) => {
      const a = byId[id], [w, hh] = a.tech.frame, [px, py] = a.tech.pivot;
      const p = { ...(kit.place[id] ?? (() => { const f = free.shift() ?? [0.5, 0]; return { x: f[0], y: f[1] }; })()) };
      if (kit.place[id]) { const k = free.findIndex((f) => Math.abs(f[0] - p.x) < 0.07); if (k >= 0) free.splice(k, 1); }
      if (p.y == null) p.y = a.type === 'pickup' ? 12 : a.tech.grounded === false ? 46 : 0;
      if (o.focus) p.x = id === o.focus ? 0.5 : sides[i - 1];
      const flip = p.flip ?? (o.focus ? p.x > 0.5 : p.x > heroX && id !== kit.hero && (a.type === 'creature' || a.type === 'character'));
      const clip = o.clip[id] ?? p.clip ?? a.stripClip;
      if (o.plain) { p.y = 0; floor = Math.max(4, Math.round((host.clientHeight / u - hh) / 2)) + (hh - py); }
      const sp = this.sprite(id, { scale: u, clip, flip, paused: !!o.focus && id !== o.focus, layers: a.type === 'background' });
      const btn = h('button.sc-hit', { type: 'button', 'aria-label': `Change the ${a.name.toLowerCase()}`, onclick: () => this.pick(id, btn) }, h('span.sc-tag', { text: o.focus && id !== o.focus ? `Open the ${a.name.toLowerCase()}` : a.name }));
      const el = h('div.sc-item', {
        'data-id': id,
        style: `left:calc(${(p.x * 100).toFixed(1)}% - var(--u) * ${flip ? w - px : px}px);bottom:calc(var(--u) * ${floor + p.y - (hh - py)}px);z-index:${id === o.focus ? 300 : 200 - Math.round(p.y)}`,
      }, sp, btn);
      if (o.focus) el.classList.add(id === o.focus ? 'focus' : 'faded');
      if (id === dropped) el.classList.add('drop');
      host.append(el);
    });

    // the interface piece, top left
    const hud = kit.hud;
    if (hud && has(hud.id) && !o.plain) {
      const box = this.hit('sc-hud', hud.id);
      if (hud.pieces) box.append(...hud.pieces.map((clip) => this.sprite(hud.id, { clip, scale: u, paused: true })));
      if (hud.bars) box.append(...hud.bars.map(([clip, fill]) => h('span.sc-bar', {}, this.sprite(hud.id, { clip: 'frame', scale: u, paused: true }), h('span.sc-fill', { style: `clip-path:inset(0 ${Math.round((1 - fill) * 100)}% 0 0)` }, this.sprite(hud.id, { clip, scale: u, paused: true })))));
      box.classList.toggle('bars', !!hud.bars);
      if (o.focus) box.classList.add('faded');
      host.append(box);
    }
    this.measure();
    o.onBuild?.(this);
  }
  /** A flat clickable part of the scene: the backdrop, the ground, the interface piece. */
  hit(cls, id, style) {
    const a = byId[id];
    const what = { background: 'Change the background', tileset: 'Change the ground', ui: 'Change the interface' }[a.type] ?? `Change the ${a.name}`;
    const btn = h(`button.sc-flat.${cls}`, { type: 'button', 'data-id': id, 'aria-label': what, style });
    btn.addEventListener('click', (e) => {
      // anchor the popover where the person pointed, not at the middle of the sky
      const r = e.clientX || e.clientY ? { left: e.clientX - 8, right: e.clientX + 8, top: e.clientY - 8, bottom: e.clientY + 8, width: 16, height: 16 } : null;
      this.pick(id, btn, r);
    });
    return btn;
  }
  pick(id, anchor, rect) {
    if (!this.o.onPick) return;
    this.select(id);
    this.o.onPick(id, anchor, this, rect);
  }
  select(id) {
    for (const el of $$('.sel', this.host)) el.classList.remove('sel');
    if (id) $(`[data-id="${id}"]`, this.host)?.classList.add('sel');
    this.host.classList.toggle('picked', !!id);
  }
  async paintTiles() {
    for (const [el, t] of this.tileEls ?? []) el.style.backgroundImage = `url(${await tileURL(t.id, t.clip, this.live)})`;
  }
  async measure(only) {
    for (const el of $$('.sc-item', this.host)) {
      if (only && el.dataset.id !== only) continue;
      const box = await inkBox($('lo-sprite', el));
      const btn = $('.sc-hit', el);
      if (box && btn) btn.style.cssText = `left:calc(var(--u) * ${box.x}px);top:calc(var(--u) * ${box.y}px);width:calc(var(--u) * ${box.w}px);height:calc(var(--u) * ${box.h}px)`;
    }
  }
}

/* ---------- the small popover: change a thing right where it is ---------- */
let pop = null;
export function closePop() {
  if (!pop) return;
  pop.ed?.destroy(); pop.off?.(); pop.el.remove();
  removeEventListener('scroll', pop.move, true); removeEventListener('resize', pop.move);
  const done = pop.onClose; pop = null; done?.();
}
function placePop(el, r) {
  const pw = el.offsetWidth, ph = el.offsetHeight, railW = $('.rail')?.getBoundingClientRect().left ?? innerWidth;
  const vw = Math.min(innerWidth, railW > 200 ? railW : innerWidth), top = ($('.top')?.offsetHeight ?? 0) + 8;
  let x = r.right + 12, y = r.top + r.height / 2 - ph / 2;
  if (x + pw > vw - 8) x = r.left - 12 - pw;
  if (x < 8) { x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), innerWidth - pw - 8); y = r.bottom + 10; if (y + ph > innerHeight - 8) y = r.top - ph - 10; }
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(Math.min(Math.max(top, y), Math.max(top, innerHeight - ph - 8)))}px`;
}
/** Open the popover for one thing next to `anchor`. */
export function openPop(id, anchor, { preview = false, onClose, rect } = {}) {
  closePop();
  const a = byId[id], isSprite = a.kind === 'sprite';
  const el = h('div.pop', { role: 'dialog', 'aria-label': `Change ${a.name}` });
  const body = h('div.pop-body');
  const foot = h('div.pop-foot');
  const drawFoot = () => {
    const inGame = store.has(id);
    foot.replaceChildren(...[
      inGame
        ? h('span.kept', {}, h('span.kept-i', { html: ICON.check }), store.changed(id) ? 'Kept in your game' : 'In your game')
        : h('button.btn.sm.primary', { type: 'button', onclick: () => store.add(id) }, 'Add to your game'),
      isSprite && h('a.link', { href: `remix.html?id=${id}` }, 'Open it fully'),
    ].filter(Boolean));
  };
  el.append(...[
    h('div.pop-head', {}, h('div', {}, h('strong', { text: a.name }), h('span.tag', { text: TYPE[a.type] })), h('button.icon', { type: 'button', 'aria-label': 'Close', html: ICON.close, onclick: closePop })),
    preview && isSprite && h('div.pop-pic', {}, live(id, { ...(a.type === 'background' ? { layers: true } : {}), scale: Math.max(1, Math.min(3, Math.floor(120 / a.tech.frame[1]), Math.floor(260 / a.tech.frame[0]))) })),
    body, foot,
  ].filter(Boolean));
  document.body.append(el);
  let ed = null;
  if (isSprite) ed = editor(body, id, { keys: 'quick', onRender: () => pop?.move() });
  else {
    const cur = store.state.params[id]?.style ?? a.tech.styles?.[0];
    body.append(...[
      h('p.pop-text', { text: a.description }),
      a.tech.styles?.length > 1 && h('div.ctl', { role: 'group', 'aria-label': 'Style' }, h('div.ctl-l', {}, h('span', { text: 'Style' })), h('div.chips', {}, a.tech.styles.map((st) => h('button.chip', {
        type: 'button', 'aria-pressed': String(st === cur),
        onclick: (e) => { store.setParams(id, st === a.tech.styles[0] ? {} : { style: st }); for (const b of $$('.chip', e.target.parentNode)) b.setAttribute('aria-pressed', String(b === e.target)); },
      }, st)))),
      h('div.pop-play', {}, playButton(a), h('span', { text: `${secs(a.tech.seconds)}${a.tech.loop ? ', loops' : ''}` })),
    ].filter(Boolean));
  }
  drawFoot();
  const getRect = () => rect ?? anchor.getBoundingClientRect();
  const move = () => placePop(el, getRect());
  pop = { el, ed, onClose, move, anchor, off: store.on((s, ev) => { if (!ev.id || ev.id === id) drawFoot(); }) };
  move();
  addEventListener('scroll', move, true); addEventListener('resize', move);
  $('button, input, a', body)?.focus({ preventScroll: true });
}
addEventListener('pointerdown', (e) => { if (pop && !pop.el.contains(e.target) && !pop.anchor.contains(e.target)) closePop(); }, true);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) { const a = pop.anchor; closePop(); a?.focus?.(); } });

/** A play button for a sound. No audio in the mock: it shows the sound running for its real length. */
export function playButton(a, cls = '') {
  const b = h(`button.play${cls}`, { type: 'button', 'aria-label': `Play ${a.name}`, html: ICON.play });
  let t;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(t);
    if (b.classList.toggle('on')) {
      b.innerHTML = ICON.pause;
      b.style.setProperty('--dur', `${Math.max(0.4, a.tech.seconds)}s`);
      t = setTimeout(() => { b.classList.remove('on'); b.innerHTML = ICON.play; }, Math.max(400, Math.min(a.tech.seconds, 6) * 1000));
    } else b.innerHTML = ICON.play;
  });
  return b;
}
/** The picture of a sound or a track for a small tile. */
export function soundPic(a, scale = 1) {
  if (a.thumb) { const im = h('img.wave', { width: 64 * scale, height: 40 * scale, alt: '' }); picture(thumb(a.id)).then((u) => (im.src = u)); return im; }
  // music has no drawn picture in the catalogue: a few bars, always the same for the same track
  let n = [...a.id].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
  const bars = Array.from({ length: 14 }, () => { n = (n * 1103515245 + 12345) >>> 0; return 4 + ((n >>> 16) % 9) * 3; });
  return h('span.bars', { style: `--s:${scale}`, 'aria-hidden': 'true' }, bars.map((v) => h('i', { style: `height:${v * scale}px` })));
}
/** A small picture of anything, as it is in your game. */
export function tilePic(id, bw = 72, bh = 52) {
  const a = byId[id];
  if (a.kind !== 'sprite') return soundPic(a);
  const [w, hh] = a.tech.frame;
  const fill = a.type === 'background' || a.type === 'tileset'; // these cover the tile; everything else is shown whole
  const k = fill ? Math.ceil(bw / w) : Math.max(1, Math.min(3, Math.floor((bh - 2) / hh), Math.floor(bw / w)));
  return live(id, { scale: k, hover: true, ...(a.type === 'background' ? { layers: true } : {}) });
}

/* ---------- the tray: "your game", on every page ---------- */
const phone = matchMedia('(max-width: 720px)');
export function mountRail({ expanded = false } = {}) {
  const rail = $('#rail');
  rail.classList.toggle('open', expanded);
  const count = h('b');
  const things = h('span');
  const list = h('ul.rail-list');
  const more = h('p.rail-more');
  const dl = h('button.btn.light.rail-dl', { type: 'button', onclick: () => downloadNote(dl) }, h('span', { html: ICON.down }), h('span', { text: 'Download' }));
  const sceneHost = expanded ? h('div.rail-scene') : null;
  rail.replaceChildren(
    h('div.rail-head', {}, h('h2', { text: 'Your game' }), h('p.rail-count', {}, count, things), dl),
    ...[sceneHost, list, more].filter(Boolean),
  );
  let scene = null;
  if (sceneHost) scene = new Scene(sceneHost, { scale: () => 1, height: () => 132, max: 7, onPick: (id, anchor, sc) => openPop(id, sceneHost, { onClose: () => sc.select(null) }) });

  const row = (id) => {
    const a = byId[id];
    const open = (e) => openPop(id, e.currentTarget.closest('li'), { preview: true });
    const tile = h('button.tile', { type: 'button', title: a.name, 'aria-label': `${a.name}${store.changed(id) ? ', changed' : ''}. Change it`, onclick: open }, tilePic(id, phone.matches ? 48 : 72, phone.matches || expanded ? 44 : 52), store.changed(id) && h('i.dot'));
    if (!expanded) return h('li', { 'data-id': id }, tile);
    return h('li', { 'data-id': id }, tile,
      h('button.rail-name', { type: 'button', onclick: open }, h('strong', { text: a.name }), h('span', { text: a.kind === 'sprite' ? TYPE[a.type] : `${TYPE[a.type]}, ${secs(a.tech.seconds)}` })),
      h('button.icon.on-dark', { type: 'button', 'aria-label': `Take ${a.name} out of your game`, title: 'Take out', html: ICON.close, onclick: () => store.remove(id) }));
  };
  const fitList = () => {
    if (expanded && !phone.matches) { [...list.children].forEach((li) => (li.hidden = false)); return void (more.hidden = true); }
    const rows = [...list.children];
    rows.forEach((li) => (li.hidden = false));
    if (!rows.length) return void (more.hidden = true);
    const horizontal = getComputedStyle(list).flexDirection === 'row';
    more.hidden = true;
    const room = horizontal ? rail.clientWidth - list.offsetLeft - 128 : rail.clientHeight - list.offsetTop - 44;
    const step = horizontal ? rows[0].offsetWidth + 6 : rows[0].offsetHeight + 6;
    const fits = Math.max(1, Math.floor((room + 6) / step));
    rows.forEach((li, i) => (li.hidden = i >= fits));
    more.hidden = rows.length <= fits;
    more.textContent = `+${rows.length - fits} more`;
  };
  const draw = () => {
    const ids = store.state.items;
    count.textContent = ids.length;
    things.textContent = ids.length === 1 ? ' thing' : ' things';
    list.replaceChildren(...ids.map(row));
    if (!ids.length) list.append(h('li.rail-empty', { text: expanded ? 'Nothing picked yet. Press + on anything and it lands here.' : 'Empty' }));
    fitList();
  };
  store.on((s, ev) => {
    if (ev.type === 'items' || ev.type === 'kit') draw();
    else if (ev.type === 'params' && ev.id) { // only the dot can change; the pictures follow by themselves
      const li = $(`li[data-id="${ev.id}"]`, list), tile = li && $('.tile', li);
      if (tile) { const dot = $('.dot', tile); if (store.changed(ev.id) && !dot) tile.append(h('i.dot')); if (!store.changed(ev.id) && dot) dot.remove(); }
    }
  });
  new ResizeObserver(fitList).observe(rail);
  draw();
  return { scene };
}
function downloadNote(anchor) {
  const s = store.state, n = (f) => s.items.filter((id) => f(byId[id])).length;
  const sprites = n((a) => a.kind === 'sprite'), music = n((a) => a.type === 'music'), sounds = n((a) => a.kind === 'sound') - music;
  say(`This is a mock-up. It would download your-game.zip: ${sprites} sprite sheets (PNG plus a data file), ${sounds} sounds and ${music} tracks (WAV), with your changes.`);
}
let sayT;
export function say(text) {
  let el = $('.say');
  if (!el) el = document.body.appendChild(h('div.say', { role: 'status' }));
  el.textContent = text; el.classList.add('on');
  clearTimeout(sayT); sayT = setTimeout(() => el.classList.remove('on'), 5200);
}

/** A look picker as a row of chips. */
export function lookChips(host, ids) {
  const draw = () => host.replaceChildren(...ids.map((id) => h('button.chip', { type: 'button', 'aria-pressed': String(store.state.look === id), title: looks.find((l) => l.id === id).blurb, onclick: () => store.setLook(id) }, looks.find((l) => l.id === id).name)));
  store.on((s, ev) => { if (ev.type === 'look' || ev.type === 'kit') draw(); });
  draw();
}
export const kitCounts = (k) => { const b = bundles.find((x) => x.id === KITS[k].bundle); return { b, text: `${b.sprites.length} sprites, ${b.sounds.length} sounds, ${b.music.length} tracks` }; };
