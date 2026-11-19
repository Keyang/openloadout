// Playroom mock-up: the small script the three pages share.
// Icons, the bag (kept in this browser), plain-word labels, control builders and the little live scenes.
import { loadCatalog, looks, thumb, url } from '../shared/kit.js';
export { loadCatalog, looks, thumb, url };

// ---------------------------------------------------------------- icons
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path class="ic-fill" d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z"/>',
  pause: '<path class="ic-fill" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle class="ic-fill" cx="9" cy="9" r="1.3"/><circle class="ic-fill" cx="15" cy="15" r="1.3"/><circle class="ic-fill" cx="15" cy="9" r="1.3"/><circle class="ic-fill" cx="9" cy="15" r="1.3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  more: '<circle class="ic-fill" cx="5.5" cy="12" r="1.7"/><circle class="ic-fill" cx="12" cy="12" r="1.7"/><circle class="ic-fill" cx="18.5" cy="12" r="1.7"/>',
  undo: '<path d="M8 5L4 9l4 4"/><path d="M4 9h9.5a5.5 5.5 0 0 1 0 11H9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  grid: '<rect x="4.5" y="4.5" width="6" height="6" rx="1.5"/><rect x="13.5" y="4.5" width="6" height="6" rx="1.5"/><rect x="4.5" y="13.5" width="6" height="6" rx="1.5"/><rect x="13.5" y="13.5" width="6" height="6" rx="1.5"/>',
};
const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
defs.setAttribute('aria-hidden', 'true');
defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
defs.innerHTML = Object.entries(ICONS).map(([n, d]) => `<symbol id="i-${n}" viewBox="0 0 24 24">${d}</symbol>`).join('');
document.body.prepend(defs);
export const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- plain words
export const TYPE_WORD = {
  character: 'Character', creature: 'Creature', background: 'Background', tileset: 'Ground tiles', prop: 'Object',
  pickup: 'Pickup', projectile: 'Projectile', effect: 'Effect', ui: 'Menu piece', icon: 'Icons',
  sfx: 'Sound effect', ambience: 'Background sound', jingle: 'Jingle', music: 'Music',
};
export const TYPE_ORDER = ['character', 'creature', 'background', 'tileset', 'prop', 'pickup', 'projectile', 'effect', 'ui', 'icon', 'sfx', 'ambience', 'jingle', 'music'];
export const GAME_WORD = {
  platformer: 'Platformer', 'turn-based-rpg': 'Turn-based RPG', 'top-down-rpg': 'Top-down RPG', 'roguelike-action': 'Action roguelike',
  shooter: 'Shooter', arcade: 'Arcade', puzzle: 'Puzzle', 'card-game': 'Card game', 'farming-sim': 'Farming', racing: 'Racing',
};
export const THEME_WORD = {
  fantasy: 'Fantasy', forest: 'Forest', dungeon: 'Dungeon', farm: 'Farm', 'sci-fi': 'Sci-fi', space: 'Space',
  horror: 'Spooky', neutral: 'Any world', candy: 'Candy', underwater: 'Underwater', city: 'City',
};
export const KITS = {
  'kit-platformer-fantasy': { name: 'Thornwood Keep', kind: 'Side-view fantasy platformer', tone: 'leaf' },
  'kit-rpg-fantasy': { name: 'Hearthvale', kind: 'Turn-based fantasy RPG', tone: 'sun' },
  'kit-roguelite-scifi': { name: 'Derelict Station', kind: 'Top-down sci-fi action roguelike', tone: 'teal' },
};
/** British spelling and friendlier group names for what the engine calls things. */
export const word = (s) => String(s).replace(/\bColor(s?)\b/g, 'Colour$1').replace(/\bcolor(s?)\b/g, 'colour$1');
export const seconds = (s) => (s < 10 ? `${Math.round(s * 10) / 10} s` : `${Math.round(s)} s`);

/** Which colour field an asset sits on: the world it comes from. */
export function toneOf(a) {
  const t = a.themes ?? [];
  if (t.includes('sci-fi') || t.includes('space')) return 'teal';
  if (t.includes('farm')) return 'sun';
  if (t.includes('forest')) return 'leaf';
  if (t.includes('fantasy')) return 'sky';
  if (t.includes('dungeon') || t.includes('horror')) return 'dusk';
  return 'mist';
}

// ---------------------------------------------------------------- the bag (kept in this browser)
const KEY = 'loadout-playroom-bag';
export const bag = {
  all() { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } },
  get(id) { return this.all()[id] ?? null; },
  has(id) { return id in this.all(); },
  put(id, entry) { const b = this.all(); b[id] = { ...(b[id] ?? {}), ...entry }; saveBag(b); },
  remove(id) { const b = this.all(); delete b[id]; saveBag(b); },
};
function saveBag(b) {
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* private window: keep going */ }
  document.dispatchEvent(new CustomEvent('bag'));
}

function drawBag() {
  const host = document.querySelector('[data-bag]');
  if (!host) return;
  const items = Object.entries(bag.all());
  host.innerHTML = `
    <summary>Bag <span class="bag-count ${items.length ? 'has' : ''}">${items.length}</span></summary>
    <div class="pop">
      <h3>Your bag</h3>
      ${items.length
        ? `<ul class="bag-list">${items.map(([, e]) => `<li>${esc(e.name ?? 'Item')}<span>${e.changes ? `${e.changes} ${e.changes === 1 ? 'change' : 'changes'} kept` : 'as it comes'}</span></li>`).join('')}</ul>
           <button class="btn btn-ink" type="button">Try them in the playground</button>
           <button class="btn" type="button">Download all</button>`
        : '<p class="small quiet">Nothing here yet. Press the round plus on anything in the library, or change the Hero: it is kept by itself.</p>'}
    </div>`;
}
document.addEventListener('bag', drawBag);
drawBag();
// one open menu at a time; a click outside closes it
document.addEventListener('click', (e) => {
  for (const d of document.querySelectorAll('details[open]')) if (!d.contains(e.target)) d.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') for (const d of document.querySelectorAll('details[open]')) d.open = false;
});

// ---------------------------------------------------------------- controls
const attrJSON = (o) => esc(JSON.stringify(o));
const fillOf = (it, v) => `${Math.round(((v - it.min) / (it.max - it.min)) * 100)}%`;

/**
 * One control as HTML. `pics` (optional) turns a choice into picture buttons:
 * { sprite, params, k, cx, cy, clip } = the sprite, its current settings, the zoom and the art pixel to centre on.
 */
export function controlHTML(it, { pics = null, label = word(it.label) } = {}) {
  if (it.kind === 'range') {
    return `<div class="ctl"><span class="ctl-label">${esc(label)}</span>
      <label class="slider"><span>${esc(it.lo)}</span>
      <input type="range" data-key="${it.key}" min="${it.min}" max="${it.max}" step="${it.step}" value="${it.value}" style="--fill:${fillOf(it, it.value)}" aria-label="${esc(label)}, from ${esc(it.lo)} to ${esc(it.hi)}">
      <span>${esc(it.hi)}</span></label></div>`;
  }
  if (it.kind === 'color') {
    return `<div class="ctl"><span class="ctl-label">${esc(label)}</span><div class="swatches">${it.swatches.map((c, i) =>
      `<button type="button" class="swatch" style="--c:${c}" data-key="${it.key}" data-value="${c}" aria-pressed="${c === it.value}" aria-label="${esc(label)} ${i + 1} of ${it.swatches.length}"></button>`).join('')}</div></div>`;
  }
  if (it.kind === 'toggle') {
    return `<div class="ctl"><button type="button" class="switch" role="switch" data-key="${it.key}" data-toggle aria-checked="${!!it.value}"><i></i>${esc(label)}</button></div>`;
  }
  // choice
  if (pics) {
    return `<div class="ctl">${label ? `<span class="ctl-label">${esc(label)}</span>` : ''}<div class="pics" style="--n:${it.options.length}" role="group" aria-label="${esc(word(it.label))}">${it.options.map((o) =>
      `<button type="button" class="pic" data-key="${it.key}" data-value="${esc(o.value)}" aria-pressed="${o.value === it.value}">
        <span class="pic-win"><lo-sprite sprite="${pics.sprite}" clip="${pics.clip ?? ''}" paused data-pic data-extra='${attrJSON(pics.extra ?? {})}' params='${attrJSON({ ...pics.params, ...(pics.extra ?? {}), [it.key]: o.value })}'
          style="width:${pics.w * pics.k}px;height:${pics.h * pics.k}px;margin:${-pics.cy * pics.k}px 0 0 ${-pics.cx * pics.k}px"></lo-sprite></span>${esc(o.label)}</button>`).join('')}</div></div>`;
  }
  return `<div class="ctl"><span class="ctl-label">${esc(label)}</span><div class="choices">${it.options.map((o) =>
    `<button type="button" class="chip" data-key="${it.key}" data-value="${esc(o.value)}" aria-pressed="${o.value === it.value}">${esc(o.label)}</button>`).join('')}</div></div>`;
}

/** Wire every control inside `root`: onSet(key, value) is called as the person drags or presses. */
export function bindControls(root, onSet) {
  root.addEventListener('input', (e) => {
    const r = e.target.closest('input[type="range"][data-key]');
    if (!r) return;
    r.style.setProperty('--fill', `${Math.round(((r.value - r.min) / (r.max - r.min)) * 100)}%`);
    onSet(r.dataset.key, Number(r.value));
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-key]');
    if (!b || !root.contains(b)) return;
    if (b.hasAttribute('data-toggle')) return onSet(b.dataset.key, b.getAttribute('aria-checked') !== 'true');
    onSet(b.dataset.key, b.dataset.value);
  });
}

/** After a change: move the selected marks and redraw the picture buttons with the new settings. */
export function syncControls(root, params) {
  for (const b of root.querySelectorAll('button[data-key][data-value]')) b.setAttribute('aria-pressed', String(String(params[b.dataset.key]) === b.dataset.value));
  for (const b of root.querySelectorAll('button[data-toggle]')) b.setAttribute('aria-checked', String(!!params[b.dataset.key]));
  for (const r of root.querySelectorAll('input[type="range"][data-key]')) {
    if (document.activeElement !== r) r.value = params[r.dataset.key];
    r.style.setProperty('--fill', `${Math.round(((r.value - r.min) / (r.max - r.min)) * 100)}%`);
  }
  for (const p of root.querySelectorAll('lo-sprite[data-pic]')) {
    const b = p.closest('button[data-key]');
    p.setAttribute('params', JSON.stringify({ ...params, ...JSON.parse(p.dataset.extra || '{}'), [b.dataset.key]: b.dataset.value }));
  }
}

// ---------------------------------------------------------------- pixels
let holder;
/** One frame of a sprite as a picture URL, so ground tiles can repeat as a CSS background. */
export async function frameURL(sprite, clip, look = 'original') {
  if (!holder) { holder = document.createElement('div'); holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'; document.body.append(holder); }
  const el = document.createElement('lo-sprite');
  el.setAttribute('sprite', sprite); el.setAttribute('clip', clip); el.setAttribute('paused', '');
  if (look !== 'original') el.setAttribute('look', look);
  holder.append(el);
  await el.ready;
  const u = el.shadowRoot.querySelector('canvas').toDataURL();
  el.remove();
  return u;
}

/** Deterministic bar heights for a track picture (music has no drawn icon in the catalogue). */
export function barsOf(id, n = 28) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const wave = 0.55 + 0.45 * Math.sin((i / n) * Math.PI * 3 + (h & 7));
    out.push(Math.round(22 + 78 * wave * (0.45 + ((h >>> 8) & 255) / 465)));
  }
  return out.map((v) => `<i style="--v:${Math.min(100, v)}"></i>`).join('');
}

/** A mock play button: it shows the playing state for the length of the sound. No audio in the mock-up. */
export function bindPlay(root) {
  let timer = 0, on = null;
  const stop = () => { if (on) { on.setAttribute('aria-pressed', 'false'); on.innerHTML = icon('play'); on = null; } clearTimeout(timer); };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button.play');
    if (!b) return;
    e.stopPropagation();
    const same = b === on;
    stop();
    if (same) return;
    on = b; b.setAttribute('aria-pressed', 'true'); b.innerHTML = icon('pause');
    timer = setTimeout(stop, Math.max(700, Math.min(6000, Number(b.dataset.seconds ?? 1) * 1000)));
  });
}

// ---------------------------------------------------------------- little live scenes
// Everything is placed in art pixels (a scene is 320 x 180) and scaled by the CSS variable --s on .scene.
export const SCENES = {
  'kit-platformer-fantasy': {
    bg: 'bg-forest', ground: ['tiles-forest', 'grass-top'], groundY: 148,
    actors: [
      { id: 'knight', clip: 'walk', x: 46 },
      { id: 'coin', clip: 'spin', x: 96, y: 118 },
      { id: 'coin', clip: 'spin', x: 120, y: 104 },
      { id: 'slime', clip: 'hop', x: 150, flip: true },
      { id: 'bat', clip: 'fly', x: 196, y: 70, flip: true },
      { id: 'spear-goblin', clip: 'idle', x: 222, flip: true },
      { id: 'moss-golem', clip: 'idle', x: 280, flip: true },
    ],
  },
  'kit-rpg-fantasy': {
    bg: 'bg-battle-field', groundY: 158,
    actors: [
      { id: 'wizard', clip: 'idle', x: 36, y: 150 },
      { id: 'knight', clip: 'idle', x: 78, y: 160 },
      { id: 'rogue-battler', clip: 'idle', x: 116, y: 148 },
      { id: 'bone-soldier', clip: 'idle', x: 190, y: 152, flip: true },
      { id: 'ember-wyrm', clip: 'idle', x: 258, y: 162, flip: true },
    ],
  },
  'kit-roguelite-scifi': {
    floor: ['tiles-station-floor', 'floor-fill'],
    actors: [
      { id: 'blast-door', clip: 'closed', x: 160, y: 46, still: true },
      { id: 'wall-terminal', clip: 'idle', x: 96, y: 46 },
      { id: 'fuel-barrel', clip: 'idle', x: 236, y: 52, still: true },
      { id: 'supply-crate', clip: 'idle', x: 268, y: 60, still: true },
      { id: 'vendor-bot', clip: 'idle', x: 40, y: 86 },
      { id: 'scout-drone', clip: 'idle', x: 210, y: 78 },
      { id: 'void-ranger', clip: 'shoot_side', x: 120, y: 128 },
      { id: 'blaster-bolt', x: 160, y: 108 },
      { id: 'crawler-bug', clip: 'walk_side', x: 204, y: 132, flip: true },
      { id: 'spitter-bug', clip: 'idle', x: 244, y: 104 },
      { id: 'security-bot', clip: 'idle_down', x: 62, y: 152 },
      { id: 'warden-mech', clip: 'idle', x: 268, y: 170 },
    ],
  },
};

/** Fill a .scene element from a spec. Returns { setLook(id) }. */
export async function buildScene(el, spec, assets) {
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
  const parts = [];
  if (spec.bg) parts.push(`<lo-sprite class="bg" sprite="${spec.bg}" layers></lo-sprite>`);
  if (spec.floor) parts.push('<div class="floor"></div>');
  for (const a of spec.actors) {
    const t = byId[a.id].tech, [w, h] = t.frame, [px, py] = t.pivot;
    const y = (a.y ?? spec.groundY + 1) - py, x = a.x - (a.flip ? w - px : px);
    parts.push(`<lo-sprite class="actor" sprite="${a.id}" ${a.clip ? `clip="${a.clip}"` : ''} ${a.flip ? 'flip' : ''} ${a.still ? 'paused' : ''} style="--x:${x};--y:${y};--w:${w};--h:${h}"></lo-sprite>`);
  }
  if (spec.ground) parts.push('<div class="ground"></div>');
  el.innerHTML = parts.join('');
  const paint = async (look) => {
    if (spec.ground) el.querySelector('.ground').style.backgroundImage = `url(${await frameURL(...spec.ground, look)})`;
    if (spec.floor) el.querySelector('.floor').style.backgroundImage = `url(${await frameURL(...spec.floor, look)})`;
  };
  await paint('original');
  return {
    setLook(id) {
      for (const s of el.querySelectorAll('lo-sprite')) s.setAttribute('look', id);
      return paint(id);
    },
  };
}
