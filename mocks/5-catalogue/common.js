// Catalogue (design 5): things every page shares. Mock-up only.
import { loadCatalog, looks, thumb, url } from '../shared/kit.js';
export { loadCatalog, looks, thumb, url };

/* ---------- loading, kept gentle ---------- */
/** Fetch sprite files a few at a time (and try again if the server drops one) before a page full of sprites asks for all of them at once. */
export async function warm(ids, lanes = 5) {
  const queue = [...new Set(ids)];
  const one = async (id) => {
    const u = new URL(`../../sprites/${id}.js`, import.meta.url).href;
    for (let t = 0; t < 4; t++) { try { await import(u); return; } catch { await new Promise((r) => setTimeout(r, 250 * (t + 1))); } }
  };
  await Promise.all(Array.from({ length: lanes }, async () => { while (queue.length) await one(queue.shift()); }));
}
// a still picture the server dropped is asked for again (up to three times), and stays out of sight meanwhile
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName !== 'IMG') return;
  const n = Number(img.dataset.again ?? 0);
  if (n >= 3) return;
  img.dataset.again = n + 1;
  img.style.visibility = 'hidden';
  img.addEventListener('load', () => { img.style.visibility = ''; }, { once: true });
  setTimeout(() => { img.src = img.src; }, 400 * (n + 1));
}, true);

/* ---------- words ---------- */
export const TYPE_LABEL = {
  character: 'Character', creature: 'Creature', tileset: 'Tiles', prop: 'Object', pickup: 'Pickup',
  projectile: 'Projectile', effect: 'Effect', background: 'Background', ui: 'Interface', icon: 'Icon',
  sfx: 'Sound effect', ambience: 'Background sound', jingle: 'Jingle', music: 'Music',
};
export const GAME_LABEL = {
  platformer: 'Platformer', 'turn-based-rpg': 'Turn-based RPG', 'top-down-rpg': 'Top-down RPG',
  'roguelike-action': 'Action roguelike', shooter: 'Shooter', arcade: 'Arcade', puzzle: 'Puzzle',
  'card-game': 'Card game', 'farming-sim': 'Farming', racing: 'Racing',
};
export const THEME_LABEL = {
  fantasy: 'Fantasy', 'sci-fi': 'Sci-fi', space: 'Space', forest: 'Forest', dungeon: 'Dungeon', neutral: 'Fits anything',
  farm: 'Farm', horror: 'Spooky', candy: 'Candy', underwater: 'Underwater', city: 'City',
};
export const KITS = [
  { id: 'kit-platformer-fantasy', name: 'Thornwood Keep', kind: 'Side-view fantasy platformer' },
  { id: 'kit-rpg-fantasy', name: 'Hearthvale', kind: 'Turn-based fantasy RPG' },
  { id: 'kit-roguelite-scifi', name: 'Derelict Station', kind: 'Top-down sci-fi action roguelike' },
];
export const kitName = (id) => KITS.find((k) => k.id === id)?.name ?? null;
export const seconds = (s) => (s < 10 ? `${Number(s.toFixed(2))} s` : `${Math.round(s)} s`);

/* ---------- twelve ready-made Heroes ---------- */
export const HERO_VERSIONS = [
  { id: 'classic', name: 'Classic', dot: '#3f6fd1', params: {} },
  { id: 'ranger', name: 'Ranger', dot: '#4f9d57', params: { hairStyle: 'long', hair: '#a8612a', headgear: 'none', weapon: 'spear', cape: 'tattered', outfit: '#4f9d57', trim: '#3a3350', skin: '#e8b088', build: 0.25, height: 0.75 } },
  { id: 'royal', name: 'Royal', dot: '#7a4fc4', params: { headgear: 'crown', hairStyle: 'long', hair: '#e0b040', capeLength: 1.6, outfit: '#7a4fc4', trim: '#e6c545', metal: '#e6c545' } },
  { id: 'raider', name: 'Raider', dot: '#6b7280', params: { build: 1, hairStyle: 'ponytail', hair: '#c9423a', headgear: 'none', weapon: 'axe', weaponLength: 1.3, cape: 'none', outfit: '#6b7280', trim: '#e08a2c', metal: '#8f97a8' } },
  { id: 'shadow', name: 'Shadow', dot: '#3a3350', params: { hairStyle: 'spiky', hair: '#2b2233', headgear: 'none', weaponLength: 0.7, cape: 'tattered', outfit: '#3a3350', trim: '#3a3350', metal: '#5d6475', skin: '#c98a5c', build: 0.2 } },
  { id: 'swamp', name: 'Swamp guard', dot: '#e08a2c', params: { skin: '#9bd18a', hairStyle: 'bald', headgearSize: 1.4, weapon: 'spear', outfit: '#e08a2c', trim: '#4f9d57', cape: 'none', height: 0.2, metal: '#c98a4a' } },
  { id: 'brawler', name: 'Brawler', dot: '#e08a2c', params: { hairStyle: 'bald', headgear: 'none', weapon: 'none', cape: 'none', outfit: '#e08a2c', skin: '#9a6240', build: 0.9, bounce: 0.9 } },
  { id: 'frost', name: 'Frost guard', dot: '#2f8f9d', params: { outfit: '#2f8f9d', trim: '#f0ead8', hairStyle: 'long', hair: '#d8d8e0', capeLength: 1.5, weapon: 'spear', weaponLength: 1.2 } },
  { id: 'gold', name: 'Gold knight', dot: '#e6c545', params: { headgearSize: 1.3, metal: '#e6c545', outfit: '#f0ead8', trim: '#e6c545', weaponLength: 1.3 } },
  { id: 'squire', name: 'Squire', dot: '#c9423a', params: { height: 0, head: 1, hairStyle: 'spiky', hair: '#e0b040', headgear: 'none', weaponLength: 0.65, cape: 'none', outfit: '#c9423a', bounce: 1 } },
  { id: 'spirit', name: 'Spirit', dot: '#b9a7e0', params: { skin: '#b9a7e0', hairStyle: 'long', hair: '#d8d8e0', headgear: 'none', cape: 'tattered', capeLength: 1.8, outfit: '#f0ead8', trim: '#7a4fc4', weapon: 'none' } },
  { id: 'rose', name: 'Rose captain', dot: '#d65a9c', params: { hairStyle: 'ponytail', hair: '#e670b0', headgear: 'crown', outfit: '#d65a9c', trim: '#f0ead8', weapon: 'axe', metal: '#e6c545', skin: '#6e4428' } },
];
/** The three versions offered on any other sprite card: whole-set looks. */
export const LOOK_VERSIONS = [
  { id: 'frost', name: 'Frost', dot: '#9fcdea' },
  { id: 'sunset', name: 'Sunset', dot: '#ef8f55' },
  { id: 'night', name: 'Night', dot: '#3b3f73' },
];

/* ---------- icons (16px, drawn with one stroke weight) ---------- */
const svg = (d, extra = '') => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  plus: svg('<path d="M8 3.5v9M3.5 8h9"/>'),
  check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
  play: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M5 3.2v9.6L13 8z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z"/></svg>',
  x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  down: svg('<path d="M4 6l4 4 4-4"/>'),
};

/* ---------- the bag: kept in this browser, shared by the three pages ---------- */
const KEY = 'lo5-bag';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private window */ } paintBag(); };
export const bag = {
  items: read,
  has: (id) => read().some((x) => x.id === id),
  add(id, version = null) { const list = read().filter((x) => x.id !== id); list.push({ id, version }); write(list); },
  remove(id) { write(read().filter((x) => x.id !== id)); },
  toggle(id) { this.has(id) ? this.remove(id) : this.add(id); return this.has(id); },
};
function paintBag() {
  const n = read().length;
  for (const el of document.querySelectorAll('[data-bag-count]')) el.textContent = n;
  const pop = document.querySelector('.bag-pop');
  if (pop && !pop.hidden) fillBag(pop);
}
async function fillBag(pop) {
  const { assets } = await loadCatalog();
  const list = read();
  pop.innerHTML = list.length
    ? `<p class="bag-title">In your bag</p>
       <ul class="bag-list">${list.map((x) => { const a = assets.find((y) => y.id === x.id); return a ? `<li><span>${a.name}</span><span class="quiet">${x.version ?? TYPE_LABEL[a.type]}</span></li>` : ''; }).join('')}</ul>
       <div class="bag-actions"><button class="btn btn-sm btn-secondary" type="button">Try in the playground</button><button class="btn btn-sm btn-primary" type="button">Download</button></div>`
    : `<p class="bag-title">Your bag is empty</p><p class="quiet">Press + on anything in the library. Changes you make are kept here by themselves.</p>`;
}
function wireBag() {
  const btn = document.querySelector('.bag-btn');
  if (!btn) return;
  const pop = document.createElement('div');
  pop.className = 'bag-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Your bag');
  btn.after(pop);
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => { if (pop.hidden) { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); fillBag(pop); } else close(); });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  paintBag();
}
wireBag();

/* ---------- cards ---------- */
/** Whole-number zoom for a sprite in a card tile (about 136px of room). Backgrounds fill the tile. */
export function cardScale(a) {
  if (a.type === 'background') return 2;
  return Math.max(1, Math.min(3, Math.floor(136 / Math.max(...a.tech.frame))));
}
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
/** A small drawn picture for a music track (the catalogue has none): a row of square-topped bars. */
export function musicBars(id, n = 9) {
  let h = hash(id);
  const bars = Array.from({ length: n }, () => { h = (h * 1103515245 + 12345) >>> 0; return 3 + ((h >>> 16) % 8); });
  return `<span class="bars" aria-hidden="true">${bars.map((b) => `<i style="--n:${b}"></i>`).join('')}</span>`;
}
let lazy = '';
/** The library shows 199 pictures: ask only for the ones in view. */
export const lazyPictures = () => { lazy = ' loading="lazy"'; };
export function picture(a, k = null) {
  if (a.kind === 'sprite') {
    const s = k ?? cardScale(a), [w, h] = a.tech.frame;
    return `<img class="px" src="${thumb(a.id)}" width="${w * s}" height="${h * s}" alt=""${lazy}>`;
  }
  if (a.thumb) return `<img class="px wave" src="${url(a.thumb)}" width="128" height="80" alt=""${lazy}>`;
  return musicBars(a.id);
}
export const versionsOf = (a) => (a.id === 'knight' ? [HERO_VERSIONS[1], HERO_VERSIONS[2], HERO_VERSIONS[4]] : LOOK_VERSIONS);

export function cardHTML(a) {
  const isSprite = a.kind === 'sprite';
  const tag = TYPE_LABEL[a.type] ?? a.type;
  const inBag = bag.has(a.id);
  const dots = isSprite
    ? `<div class="card-dots" role="group" aria-label="Ready-made versions of ${a.name}">${versionsOf(a).map((v, i) => `<button type="button" class="vdot" data-v="${i}" style="--dot:${v.dot}" aria-label="Add the ${v.name} version of ${a.name}"></button>`).join('')}</div>`
    : `<button type="button" class="play" aria-label="Play ${a.name}" aria-pressed="false">${ICON.play}</button>`;
  return `<article class="card" data-id="${a.id}" data-kind="${a.kind}">
    <div class="card-tile tile${a.type === 'background' ? ' is-cover' : ''}">
      <a class="card-pic" href="remix.html" aria-label="${isSprite ? 'Change' : 'Open'} ${a.name}" tabindex="-1">${picture(a)}</a>
      ${dots}
      <button type="button" class="add" aria-pressed="${inBag}" aria-label="${inBag ? 'Take' : 'Add'} ${a.name} ${inBag ? 'out of' : 'to'} your bag">${inBag ? ICON.check : ICON.plus}</button>
      ${isSprite ? '' : '<span class="progress" aria-hidden="true"></span>'}
    </div>
    <div class="card-meta">
      <a class="card-name" href="remix.html">${a.name}</a>
      <span class="card-tag"><span data-tag>${tag}</span>${isSprite ? '' : `<span class="num">${seconds(a.tech.seconds)}</span>`}</span>
    </div>
  </article>`;
}

/** Make cards (and list rows) inside `root` work: live animation under the pointer, versions, add, play. */
export function wireCards(root, byId) {
  const live = (card, attrs = {}) => {
    const a = byId.get(card.dataset.id);
    const pic = card.querySelector('.card-pic');
    if (!a || a.kind !== 'sprite' || !pic) return null;
    let el = pic.querySelector('lo-sprite');
    if (!el) {
      el = document.createElement('lo-sprite');
      el.setAttribute('sprite', a.id);
      el.setAttribute('scale', pic.dataset.scale ?? cardScale(a));
      if (a.type === 'background') el.setAttribute('layers', '');
      el.addEventListener('ready', () => pic.classList.add('is-live'), { once: true });
      pic.append(el);
    }
    attrs.look ? el.setAttribute('look', attrs.look) : el.removeAttribute('look');
    el.setAttribute('params', JSON.stringify(attrs.params ?? {}));
    return el;
  };
  const still = (card) => { const pic = card.querySelector('.card-pic'); pic?.querySelector('lo-sprite')?.remove(); pic?.classList.remove('is-live'); };
  const versionAt = (dot) => { const card = dot.closest('.card'); return [card, versionsOf(byId.get(card.dataset.id))[Number(dot.dataset.v)]]; };
  const preview = (dot) => {
    const [card, v] = versionAt(dot);
    live(card, v.params ? { params: v.params } : { look: v.id });
    const tag = card.querySelector('[data-tag]');
    if (tag) { tag.dataset.was ??= tag.textContent; tag.textContent = `${v.name} version`; }
  };
  const unpreview = (dot) => {
    const card = dot.closest('.card');
    const tag = card.querySelector('[data-tag]');
    if (tag?.dataset.was) { tag.textContent = tag.dataset.was; delete tag.dataset.was; }
    card.matches(':hover') ? live(card) : still(card);
  };
  root.addEventListener('pointerover', (e) => {
    const dot = e.target.closest?.('.vdot');
    if (dot) return preview(dot);
    const card = e.target.closest?.('.card');
    if (card && !card.contains(e.relatedTarget)) live(card);
  });
  root.addEventListener('pointerout', (e) => {
    const dot = e.target.closest?.('.vdot');
    if (dot && !dot.contains(e.relatedTarget)) unpreview(dot);
    const card = e.target.closest?.('.card');
    if (card && !card.contains(e.relatedTarget)) still(card);
  });
  root.addEventListener('focusin', (e) => { const dot = e.target.closest?.('.vdot'); if (dot) preview(dot); });
  root.addEventListener('focusout', (e) => { const dot = e.target.closest?.('.vdot'); if (dot) unpreview(dot); });
  root.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const a = byId.get(card.dataset.id);
    const add = e.target.closest('.add'), dot = e.target.closest('.vdot'), play = e.target.closest('.play');
    const mark = (on) => {
      const b = card.querySelector('.add');
      b.setAttribute('aria-pressed', on); b.innerHTML = on ? ICON.check : ICON.plus;
      b.setAttribute('aria-label', `${on ? 'Take' : 'Add'} ${a.name} ${on ? 'out of' : 'to'} your bag`);
    };
    if (add) mark(bag.toggle(a.id));
    else if (dot) { const [, v] = versionAt(dot); bag.add(a.id, `${v.name} version`); mark(true); }
    else if (play) playMock(play, card.querySelector('.progress'), a.tech.seconds);
  });
}

/** A pretend play button: no audio in the mock-up, the button and the progress line show the length. */
export function playMock(btn, line, secs) {
  const on = btn.getAttribute('aria-pressed') !== 'true';
  for (const other of document.querySelectorAll('.play[aria-pressed="true"]')) { other.setAttribute('aria-pressed', 'false'); other.innerHTML = ICON.play; clearTimeout(other._t); other._line?.classList.remove('run'); }
  if (!on) return;
  const ms = Math.max(600, Math.min(6000, secs * 1000));
  btn.setAttribute('aria-pressed', 'true'); btn.innerHTML = ICON.pause; btn._line = line;
  if (line) { line.style.setProperty('--ms', `${ms}ms`); line.classList.remove('run'); void line.offsetWidth; line.classList.add('run'); }
  btn._t = setTimeout(() => { btn.setAttribute('aria-pressed', 'false'); btn.innerHTML = ICON.play; line?.classList.remove('run'); }, ms);
}

/** One frame of a sprite as a picture URL (used to lay ground tiles as a repeating background). */
export async function frameURL(sprite, clip, params = null, look = null) {
  const el = document.createElement('lo-sprite');
  el.setAttribute('sprite', sprite); el.setAttribute('paused', '');
  if (clip) el.setAttribute('clip', clip);
  if (params) el.setAttribute('params', JSON.stringify(params));
  if (look) el.setAttribute('look', look);
  el.style.cssText = 'position:fixed;left:-999px;top:0;width:32px';
  document.body.append(el);
  await el.ready;
  const u = el.shadowRoot.querySelector('canvas').toDataURL();
  el.remove();
  return u;
}

/**
 * A small living scene, laid out in art pixels and shown at a whole-number zoom (--s on the element).
 * spec: { bg, ground: { sprite, clip, top, height }, actors: [[id, x, y, { clip, flip, params }]] }
 * x, y are where the sprite's feet (its pivot) stand.
 */
export async function buildScene(el, spec, byId) {
  if (spec.bg) el.insertAdjacentHTML('beforeend', `<lo-sprite class="scene-bg" sprite="${spec.bg}" layers></lo-sprite>`);
  for (const g of spec.ground ?? []) {
    const d = document.createElement('div');
    d.className = 'scene-ground';
    d.style.cssText = `--top:${g.top};--h:${g.height};--tw:${g.size ?? 32}`;
    el.append(d);
    frameURL(g.sprite, g.clip).then((u) => { d.style.backgroundImage = `url(${u})`; });
  }
  for (const [id, x, y, o = {}] of spec.actors) {
    const a = byId.get(id);
    const [w, h] = a.tech.frame, [px, py] = a.tech.pivot;
    const s = document.createElement('lo-sprite');
    s.setAttribute('sprite', id);
    if (o.clip) s.setAttribute('clip', o.clip);
    if (o.flip) s.setAttribute('flip', '');
    if (o.params) s.setAttribute('params', JSON.stringify(o.params));
    s.style.cssText = `--x:${x - (o.flip ? w - px : px)};--y:${y - py};--w:${w}`;
    s.className = 'actor';
    el.append(s);
  }
}

/* ---------- the three complete kits as large rows with a living scene ---------- */
export const SCENES = {
  'kit-platformer-fantasy': {
    bg: 'bg-forest', ground: [{ sprite: 'tiles-forest', clip: 'grass-top', top: 150, height: 32 }],
    actors: [['knight', 58, 152, { clip: 'run' }], ['coin', 108, 124], ['coin', 128, 114], ['slime', 160, 152, { flip: true }], ['treasure-chest', 204, 152], ['bat', 226, 70, { flip: true }], ['moss-golem', 268, 153, { flip: true }]],
  },
  'kit-rpg-fantasy': {
    bg: 'bg-battle-field',
    actors: [['wizard', 62, 150, { clip: 'cast' }], ['rogue-battler', 34, 164, { clip: 'idle' }], ['knight', 104, 162, { clip: 'idle' }], ['road-bandit', 180, 158, { flip: true, clip: 'idle' }], ['ember-wyrm', 262, 166, { flip: true }]],
  },
  'kit-roguelite-scifi': {
    ground: [{ sprite: 'tiles-station-floor', clip: 'floor-fill', top: 0, height: 180 }, { sprite: 'tiles-station-walls', clip: 'wall-fill', top: 0, height: 20 }, { sprite: 'tiles-station-walls', clip: 'wall-bottom', top: 20, height: 32 }],
    actors: [['blast-door', 160, 50], ['wall-terminal', 64, 50], ['fuel-barrel', 284, 78], ['supply-crate', 256, 84], ['void-ranger', 84, 118, { clip: 'shoot_side' }], ['shield-trooper', 48, 150, { clip: 'idle_side' }], ['credit-chip', 132, 150], ['crawler-bug', 186, 112, { clip: 'walk_side', flip: true }], ['spitter-bug', 232, 156, { flip: true }], ['scout-drone', 228, 92], ['security-bot', 286, 134, { flip: true }]],
  },
};
const KIT_BLURB = {
  'kit-platformer-fantasy': 'A hero, enemies and a boss, forest, cave and castle ground, platforms, traps, pickups and a wooden interface.',
  'kit-rpg-fantasy': 'A party seen on the map and in battle, villagers, enemies and a dragon, a village, a dungeon, spells and menus.',
  'kit-roguelite-scifi': 'A ranger, troopers, bugs, robots and two bosses, station floors and doors, pickups, shots and a tech interface.',
};
export function kitRowHTML(k, b, actions) {
  return `<article class="kit">
    <div class="kit-scene"><div class="scene" data-kit="${k.id}" role="img" aria-label="A scene made only from ${k.name}"></div></div>
    <div class="kit-body">
      <p class="kit-kind">${k.kind}</p>
      <h3>${k.name}</h3>
      <p class="kit-blurb">${KIT_BLURB[k.id]}</p>
      <div class="facts"><span><b>${b.sprites.length}</b>sprites</span><span><b>${b.sounds.length}</b>sounds</span><span><b>${b.music.length}</b>music tracks</span></div>
      <div class="kit-actions">${actions}</div>
    </div>
  </article>`;
}
const groundSpecs = new WeakMap();
export async function mountScenes(root, byId) {
  const els = [...root.querySelectorAll('.scene[data-kit]')];
  await warm(els.flatMap((el) => { const sc = SCENES[el.dataset.kit]; return [sc.bg, ...(sc.ground ?? []).map((g) => g.sprite), ...sc.actors.map((a) => a[0])].filter(Boolean); }));
  for (const el of els) {
    await buildScene(el, SCENES[el.dataset.kit], byId);
    [...el.querySelectorAll('.scene-ground')].forEach((g, i) => groundSpecs.set(g, SCENES[el.dataset.kit].ground[i]));
  }
}
/** Give every scene under `root` a look. Ground tiles are pictures, so they are drawn again. */
export function lookScenes(root, look) {
  for (const s of root.querySelectorAll('.scene lo-sprite')) s.setAttribute('look', look);
  for (const g of root.querySelectorAll('.scene-ground')) {
    const spec = groundSpecs.get(g);
    if (spec) frameURL(spec.sprite, spec.clip, null, look).then((u) => { g.style.backgroundImage = `url(${u})`; });
  }
}
