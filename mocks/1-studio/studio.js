// Shared script for the "Studio" mock-up: plain-word labels, the bag (kept in this browser so a change
// made on one page is still there on the next), the one set of controls, small scenes and icons.
import { loadCatalog, looks, thumb, url } from '../shared/kit.js';
export { loadCatalog, looks, thumb, url };

/* ---------- tiny DOM helper ---------- */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

/* ---------- icons (16px, one stroke weight) ---------- */
const svg = (d, fill) => `<svg viewBox="0 0 16 16" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  play: svg('<path d="M5 3.2v9.6L13 8z"/>', true),
  pause: svg('<path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z"/>', true),
  plus: svg('<path d="M8 3.5v9M3.5 8h9"/>'),
  check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
  x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  search: svg('<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L13.5 13.5"/>'),
  chev: svg('<path d="M4 6l4 4 4-4"/>'),
  right: svg('<path d="M6 4l4 4-4 4"/>'),
  dice: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><circle cx="5.8" cy="5.8" r=".6" fill="currentColor"/><circle cx="10.2" cy="10.2" r=".6" fill="currentColor"/><circle cx="8" cy="8" r=".6" fill="currentColor"/>'),
  undo: svg('<path d="M4 6.5h5.5a3 3 0 010 6H6"/><path d="M6.5 4L4 6.5 6.5 9"/>'),
  down: svg('<path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10"/>'),
  bag: svg('<path d="M3.5 5.5h9l-.7 8h-7.6z"/><path d="M6 5.5V4.5a2 2 0 014 0v1"/>'),
  more: svg('<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>', true),
  prev: svg('<path d="M10 4L6 8l4 4"/>'),
  next: svg('<path d="M6 4l4 4-4 4"/>'),
  file: svg('<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/>'),
  note: svg('<path d="M6 11.5V3.5l6-1v8"/><circle cx="4.5" cy="11.5" r="1.5"/><circle cx="10.5" cy="10.5" r="1.5"/>'),
};
export const icon = (name) => h('span', { html: ICON[name], style: 'display:contents' });

/* ---------- plain words for the catalogue's labels ---------- */
export const TYPE = {
  character: 'Character', creature: 'Creature', tileset: 'Ground tiles', prop: 'Object', pickup: 'Pickup', projectile: 'Projectile',
  effect: 'Effect', background: 'Background', ui: 'Menus and screens', icon: 'Icon',
  sfx: 'Sound effect', ambience: 'Background sound', jingle: 'Jingle', music: 'Music',
};
export const GAME = {
  platformer: 'Platformer', 'turn-based-rpg': 'Turn-based RPG', 'roguelike-action': 'Action roguelike', 'top-down-rpg': 'Top-down RPG',
  shooter: 'Shooter', arcade: 'Arcade', puzzle: 'Puzzle', 'card-game': 'Card game', 'farming-sim': 'Farming', racing: 'Racing', any: 'Any game',
};
export const THEME = {
  fantasy: 'Fantasy', 'sci-fi': 'Sci-fi', space: 'Space', forest: 'Forest', dungeon: 'Dungeon', farm: 'Farm', horror: 'Spooky',
  neutral: 'Fits anything', candy: 'Candy', underwater: 'Underwater', city: 'City',
};
export const KITS = {
  'kit-platformer-fantasy': { name: 'Thornwood Keep', kind: 'Side-view fantasy platformer' },
  'kit-rpg-fantasy': { name: 'Hearthvale', kind: 'Turn-based fantasy RPG' },
  'kit-roguelite-scifi': { name: 'Derelict Station', kind: 'Top-down sci-fi action roguelike' },
};
/** British spelling and friendlier group names for the controls the engine hands over. */
export const plain = (s) => ({ Look: 'Body', Colors: 'Colours', Color: 'Colour' }[s] ?? s);
export const seconds = (s) => (s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`);

/* ---------- the bag: kept in this browser, saved on every change ---------- */
const KEY = 'loadout-mock-studio-bag';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const listeners = new Set();
export const bag = {
  all: read,
  has: (id) => id in read(),
  get: (id) => read()[id] ?? null,
  count: () => Object.keys(read()).length,
  put(id, data = {}) { const b = read(); b[id] = { ...(b[id] ?? {}), ...data }; this.write(b); },
  remove(id) { const b = read(); delete b[id]; this.write(b); },
  write(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* private window: keep going */ } listeners.forEach((f) => f()); },
  onChange: (f) => listeners.add(f),
};

/** Wire the header's bag button: live count and a small panel that lists what is in it. */
export async function mountBag() {
  const btn = document.querySelector('.bag-btn');
  if (!btn) return;
  const count = btn.querySelector('.count');
  const paint = () => { const n = bag.count(); count.textContent = n; count.classList.toggle('has', n > 0); };
  paint(); bag.onChange(paint);
  let pop = null;
  const close = () => { pop?.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); };
  const open = async () => {
    const { assets, bundles } = await loadCatalog();
    const items = Object.entries(bag.all());
    const row = ([id, it]) => {
      const a = assets.find((x) => x.id === id), k = bundles.find((x) => x.id === id);
      const name = a?.name ?? KITS[id]?.name ?? k?.name ?? id;
      const changed = it.params && Object.keys(it.params).length;
      const note = k ? `Whole kit${it.look && it.look !== 'original' ? `, ${looks.find((l) => l.id === it.look)?.name} look` : ''}` : changed ? `${changed} ${changed === 1 ? 'change' : 'changes'} kept` : 'As it comes';
      const pic = h('span', { class: 'pic', style: a?.thumb ? `background-image:url(${url(a.thumb)})` : '' });
      return h('li', {}, pic, h('span', {}, name, h('small', {}, note)),
        h('button', { class: 'icon-btn', 'aria-label': `Remove ${name} from your bag`, html: ICON.x, onclick: (e) => { e.stopPropagation(); bag.remove(id); close(); open(); } }));
    };
    pop = h('div', { class: 'pop', role: 'dialog', 'aria-label': 'Your bag' },
      h('h3', {}, items.length ? `In your bag: ${items.length}` : 'Your bag is empty'),
      items.length ? h('ul', { class: 'bag-list' }, items.map(row)) : h('p', { class: 'note' }, 'Add something from the library, or change the Hero: it is kept here by itself.'),
      h('div', { class: 'row' },
        h('span', { class: 'btn', 'aria-disabled': 'true' }, 'Try in the playground'),
        h('span', { class: 'btn', 'aria-disabled': 'true' }, 'Download all')),
      h('p', { class: 'note' }, 'The bag and playground pages are not part of this mock-up.'));
    btn.parentElement.append(pop);
    btn.setAttribute('aria-expanded', 'true');
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); pop ? close() : open(); });
  document.addEventListener('click', (e) => { if (pop && !pop.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/* ---------- one set of controls ---------- */
const pct = (i) => `${((i.value - i.min) / (i.max - i.min)) * 100}%`;
/** Build the control for one item of el.controls(). onInput(key, value) is called on every change. */
export function controlEl(item, onInput, { idPrefix = 'c' } = {}) {
  const id = `${idPrefix}-${item.key}`;
  const label = plain(item.label);
  if (item.kind === 'range') {
    const input = h('input', { type: 'range', id, min: item.min, max: item.max, step: item.step, value: item.value });
    input.style.setProperty('--pct', pct(item));
    input.addEventListener('input', () => { input.style.setProperty('--pct', pct({ ...item, value: Number(input.value) })); onInput(item.key, Number(input.value)); });
    return h('div', { class: 'ctl', 'data-key': item.key },
      h('label', { class: 'ctl-label', for: id }, label),
      h('div', { class: 'ctl-slider' }, h('span', { class: 'end' }, item.lo), input, h('span', { class: 'end' }, item.hi)));
  }
  if (item.kind === 'choice') {
    return h('div', { class: 'ctl', 'data-key': item.key, role: 'group', 'aria-label': label },
      h('span', { class: 'ctl-label' }, label),
      h('div', { class: 'seg' }, item.options.map((o) =>
        h('button', { type: 'button', 'aria-pressed': String(o.value === item.value), 'data-value': o.value, onclick: () => onInput(item.key, o.value) }, o.label))));
  }
  if (item.kind === 'color') {
    return h('div', { class: 'ctl', 'data-key': item.key, role: 'group', 'aria-label': label },
      h('span', { class: 'ctl-label' }, label),
      h('div', { class: 'swatches' }, item.swatches.map((c, i) =>
        h('button', { type: 'button', style: `--c:${c}`, 'aria-pressed': String(c === item.value), 'data-value': c, 'aria-label': `${label}, colour ${i + 1}`, onclick: () => onInput(item.key, c) }))));
  }
  // toggle
  const sw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!item.value), onclick: () => onInput(item.key, sw.getAttribute('aria-checked') !== 'true') }, h('i'), label);
  return h('div', { class: 'ctl', 'data-key': item.key }, sw);
}
/** Bring an existing control in line with a new value, without rebuilding it (so a slider keeps its drag). */
export function syncControl(root, item) {
  const el = root.querySelector(`.ctl[data-key="${item.key}"]`);
  if (!el) return false;
  if (item.kind === 'range') { const i = el.querySelector('input'); if (document.activeElement !== i || Number(i.value) !== item.value) i.value = item.value; i.style.setProperty('--pct', pct(item)); }
  else if (item.kind === 'toggle') el.querySelector('.switch').setAttribute('aria-checked', String(!!item.value));
  else el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(item.value))));
  return true;
}

/* ---------- a tile picture as an image, so ground can repeat ---------- */
const tiles = new Map();
export function tileURL(sprite, clip, look = 'original') {
  const key = `${sprite}/${clip}/${look}`;
  if (!tiles.has(key)) tiles.set(key, (async () => {
    const el = h('lo-sprite', { sprite, clip, paused: true, look: look === 'original' ? null : look, style: 'position:absolute;left:-999px;top:0;width:32px' });
    document.body.append(el);
    await el.ready;
    const data = el.shadowRoot.querySelector('canvas').toDataURL();
    el.remove();
    return data;
  })());
  return tiles.get(key);
}

/* ---------- the three kits as small living scenes (positions in art pixels on a 320 x 180 picture) ---------- */
/* ---------- the three kits as small living scenes (positions in art pixels on a 320 x 180 picture) ---------- */
// A scene is shown through a window about 150 to 200 art pixels wide, centred, so everyone stands between x 80 and 240.
const SCENES = {
  'kit-platformer-fantasy': {
    bg: 'bg-forest',
    ground: [{ sprite: 'tiles-forest', clip: 'grass-top', y: 148, h: 32 }],
    actors: [
      { id: 'wizard', x: 96, y: 151, clip: 'idle' }, { id: 'knight', x: 134, y: 151, clip: 'walk' },
      { id: 'coin', x: 168, y: 120 }, { id: 'slime', x: 186, y: 151 }, { id: 'bat', x: 212, y: 94 }, { id: 'spear-goblin', x: 234, y: 151, flip: true },
    ],
  },
  'kit-rpg-fantasy': {
    bg: 'bg-battle-field',
    ground: [],
    actors: [
      { id: 'rogue-battler', x: 84, y: 165, clip: 'idle' }, { id: 'wizard', x: 104, y: 154, clip: 'idle' }, { id: 'knight', x: 130, y: 163, clip: 'idle' },
      { id: 'ember-wyrm', x: 206, y: 162, flip: true },
    ],
  },
  'kit-roguelite-scifi': {
    bg: 'bg-starfield',
    ground: [{ sprite: 'tiles-station-walls', clip: 'wall-bottom', y: 44, h: 32 }, { sprite: 'tiles-station-floor', clip: 'floor-fill', y: 76, h: 104 }],
    actors: [
      { id: 'blast-door', x: 160, y: 76 }, { id: 'wall-terminal', x: 108, y: 78 }, { id: 'supply-crate', x: 212, y: 98 }, { id: 'fuel-barrel', x: 230, y: 102 },
      { id: 'scout-drone', x: 196, y: 116 }, { id: 'shield-trooper', x: 112, y: 132 }, { id: 'void-ranger', x: 148, y: 150 },
      { id: 'crawler-bug', x: 194, y: 160 }, { id: 'spitter-bug', x: 226, y: 146 }, { id: 'security-bot', x: 94, y: 164 },
    ],
  },
};
/** A live scene for one kit, drawn at k screen pixels per art pixel. scene.setLook(id) restyles all of it. */
export function sceneEl(kitId, k = 2) {
  const def = SCENES[kitId];
  const inner = h('div', { class: 'scene-inner' });
  const root = h('div', { class: 'scene', style: `--k:${k}`, role: 'img', 'aria-label': `${KITS[kitId].name}: a small scene from the kit` }, inner);
  const sprites = [];
  const bgEl = h('lo-sprite', { sprite: def.bg, layers: true, scale: k, style: 'left:0;top:0' });
  inner.append(bgEl); sprites.push(bgEl);
  const grounds = def.ground.map((g) => {
    const el = h('div', { class: 'ground', style: `top:${g.y * k}px;height:${g.h * k}px;background-size:${32 * k}px ${32 * k}px` });
    inner.append(el);
    return [el, g];
  });
  loadCatalog().then(({ assets }) => {
    for (const a of def.actors) {
      const row = assets.find((x) => x.id === a.id);
      if (!row) continue;
      const [fw] = row.tech.frame, [px, py] = row.tech.pivot;
      const left = a.flip ? a.x - (fw - px) : a.x - px;
      const el = h('lo-sprite', { sprite: a.id, scale: k, clip: a.clip ?? null, flip: a.flip ?? null, style: `left:${left * k}px;top:${(a.y - py) * k}px` });
      inner.append(el); sprites.push(el);
    }
  });
  root.setLook = (look) => {
    sprites.forEach((s) => (s.def ? s.setLook(look) : s.setAttribute('look', look)));
    grounds.forEach(([el, g]) => tileURL(g.sprite, g.clip, look).then((u) => (el.style.backgroundImage = `url(${u})`)));
  };
  grounds.forEach(([el, g]) => tileURL(g.sprite, g.clip).then((u) => (el.style.backgroundImage = `url(${u})`)));
  return root;
}

/* ---------- a small picture for a music track: its tune as a pixel piano roll (drawn here; music has no icon in the catalogue) ---------- */
export function rollEl(id, w = 96, hh = 40, k = 2) {
  const c = h('canvas', { class: 'roll', width: w, height: hh, style: `width:${w * k}px;height:${hh * k}px`, 'aria-hidden': 'true' });
  const g = c.getContext('2d');
  let s = 0; for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = '#231b33';
  let y = 8 + Math.floor(rnd() * 16);
  for (let x = 2; x < w - 4;) {
    const len = 3 + Math.floor(rnd() * 3) * 2;
    y = Math.max(3, Math.min(hh - 14, y + Math.round((rnd() - 0.5) * 12)));
    g.fillRect(x, y, Math.min(len, w - 2 - x), 2);
    x += len + 1;
  }
  g.globalAlpha = 0.45;
  for (let x = 2; x < w - 4; x += 8) g.fillRect(x, hh - 6 - (Math.floor(rnd() * 2) * 3), 6, 2);
  return c;
}

/** The whole-number zoom that fits a w x h frame into a box. */
export const fit = (w, hgt, boxW, boxH, max = 8) => Math.max(1, Math.min(max, Math.floor(Math.min(boxW / w, boxH / hgt))));
