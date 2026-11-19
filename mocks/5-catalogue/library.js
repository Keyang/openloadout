// Catalogue (design 5): the library. Mock-up only. Search, kind tabs, filters, sort and the grid/list switch all work.
import { loadCatalog, bag, KITS, kitName, TYPE_LABEL, GAME_LABEL, THEME_LABEL, ICON, cardHTML, wireCards, picture, versionsOf, seconds, kitRowHTML, mountScenes, lazyPictures } from './common.js';
lazyPictures();

const { assets, bundles } = await loadCatalog();
const byId = new Map(assets.map((a) => [a.id, a]));
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- state (search, kind and kit can arrive in the address) ---------- */
const url = new URLSearchParams(location.search);
const state = {
  q: url.get('q') ?? '', kind: url.get('kind') ?? 'all', view: 'grid', sort: 'featured',
  kit: url.get('kit'), game: null, theme: null, type: url.get('type'),
};
const KINDS = [['all', 'All'], ['sprite', 'Sprites'], ['sound', 'Sounds'], ['music', 'Music'], ['kits', 'Kits']];
const FILTERS = [
  { key: 'kit', label: 'Kit', name: (v) => bundles.find((b) => b.id === v)?.name.replace(/ (platformer|roguelite|turn-based RPG) kit$/, '') ?? v, of: (a) => a.bundles ?? [], order: bundles.map((b) => b.id) },
  { key: 'game', label: 'Game type', name: (v) => GAME_LABEL[v] ?? v, of: (a) => a.gameTypes ?? [] },
  { key: 'theme', label: 'Theme', name: (v) => THEME_LABEL[v] ?? v, of: (a) => a.themes ?? [] },
  { key: 'type', label: 'Type', name: (v) => TYPE_LABEL[v] ?? v, of: (a) => [a.type], order: Object.keys(TYPE_LABEL) },
];

/* ---------- matching ---------- */
const hay = new Map(assets.map((a) => [a.id, [a.name, a.description, ...(a.words ?? []), TYPE_LABEL[a.type], ...(a.themes ?? []).map((t) => THEME_LABEL[t]), ...(a.gameTypes ?? []).map((t) => GAME_LABEL[t]), ...(a.bundles ?? []).map(kitName)].join(' ').toLowerCase()]));
const words = () => state.q.toLowerCase().split(/\s+/).filter(Boolean);
const matchQ = (a) => words().every((w) => hay.get(a.id).includes(w));
const matchKind = (a) => state.kind === 'all' || state.kind === 'kits' || a.kind === state.kind;
const matchFilters = (a, skip = null) => FILTERS.every((f) => f.key === skip || !state[f.key] || f.of(a).includes(state[f.key]));
const FRONT = ['knight', 'ember-wyrm', 'wizard', 'slime', 'void-ranger', 'moss-golem', 'treasure-chest', 'rogue-battler', 'hive-mother', 'campfire', 'warden-mech', 'coin'];
const TYPE_ORDER = Object.keys(TYPE_LABEL);
const rank = (a) => { const i = FRONT.indexOf(a.id); return i >= 0 ? i - 100 : TYPE_ORDER.indexOf(a.type); };
const SORTS = {
  featured: (a, b) => rank(a) - rank(b),
  name: (a, b) => a.name.localeCompare(b.name),
  controls: (a, b) => (b.tech.controls ?? 0) - (a.tech.controls ?? 0) || a.name.localeCompare(b.name),
  length: (a, b) => (b.tech.seconds ?? -1) - (a.tech.seconds ?? -1) || a.name.localeCompare(b.name),
};

/* ---------- kind tabs ---------- */
function paintKinds() {
  const pool = assets.filter((a) => matchQ(a) && matchFilters(a));
  const kits = bundles.filter((b) => words().every((w) => `${b.name} ${b.blurb}`.toLowerCase().includes(w)));
  const n = { all: pool.length, sprite: 0, sound: 0, music: 0, kits: kits.length };
  for (const a of pool) n[a.kind]++;
  $('#kinds').innerHTML = KINDS.map(([k, label]) => `<button type="button" class="tab" role="tab" aria-selected="${state.kind === k}" data-kind="${k}">${label}<span class="n">${n[k]}</span></button>`).join('');
}
$('#kinds').addEventListener('click', (e) => { const t = e.target.closest('[data-kind]'); if (t) { state.kind = t.dataset.kind; openMenu = null; if (state.type && !assets.some((a) => matchKind(a) && a.type === state.type)) state.type = null; render(); } });

/* ---------- filters: a button until chosen, then a token that can be taken away ---------- */
let openMenu = null;
function paintFilters() {
  const kits = state.kind === 'kits';
  $('#filters').innerHTML = kits ? '<span class="quiet" style="font-size:13px">Three complete kits and three smaller sets.</span>' : FILTERS.map((f) => {
    const v = state[f.key];
    const pool = assets.filter((a) => matchQ(a) && matchKind(a) && matchFilters(a, f.key));
    const counts = new Map();
    for (const a of pool) for (const x of f.of(a)) counts.set(x, (counts.get(x) ?? 0) + 1);
    const opts = [...counts.entries()].sort((a, b) => (f.order ? f.order.indexOf(a[0]) - f.order.indexOf(b[0]) : b[1] - a[1]));
    const menu = openMenu === f.key ? `<div class="menu" role="menu" aria-label="${f.label}">${opts.map(([x, n]) => `<button type="button" role="menuitemradio" aria-checked="${v === x}" data-set="${f.key}" data-v="${esc(x)}"><span>${esc(f.name(x))}</span><span class="n">${n}</span></button>`).join('') || '<p class="quiet" style="padding:8px 10px;font-size:13px">Nothing to choose here.</p>'}</div>` : '';
    const head = v
      ? `<span class="token"><button type="button" class="what" data-menu="${f.key}" aria-haspopup="menu" aria-expanded="${openMenu === f.key}"><small>${f.label}</small>${esc(f.name(v))}</button><button type="button" class="x" data-clear="${f.key}" aria-label="Remove the filter ${f.label}: ${esc(f.name(v))}">${ICON.x}</button></span>`
      : `<button type="button" class="filter-btn" data-menu="${f.key}" aria-haspopup="menu" aria-expanded="${openMenu === f.key}">${f.label}${ICON.down}</button>`;
    return `<span class="filter">${head}${menu}</span>`;
  }).join('') + (FILTERS.filter((f) => state[f.key]).length > 1 ? '<button type="button" class="clear" data-clear="all">Clear all</button>' : '');
}
$('#filters').addEventListener('click', (e) => {
  const m = e.target.closest('[data-menu]'), s = e.target.closest('[data-set]'), c = e.target.closest('[data-clear]');
  if (m) { openMenu = openMenu === m.dataset.menu ? null : m.dataset.menu; paintFilters(); $(`#filters [data-menu="${m.dataset.menu}"]`)?.focus(); return; }
  if (s) { state[s.dataset.set] = state[s.dataset.set] === s.dataset.v ? null : s.dataset.v; openMenu = null; }
  else if (c) { if (c.dataset.clear === 'all') for (const f of FILTERS) state[f.key] = null; else state[c.dataset.clear] = null; openMenu = null; }
  else return;
  render();
});
document.addEventListener('click', (e) => { if (openMenu && !e.target.closest('.filter')) { openMenu = null; paintFilters(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenu) { const k = openMenu; openMenu = null; paintFilters(); $(`#filters [data-menu="${k}"]`)?.focus(); } });

/* ---------- results ---------- */
const kitsOf = (a) => (a.bundles ?? []).map(kitName).filter(Boolean).join(', ');
// a sprite bigger than the 64px row tile is shown as a close-up around where it stands, never shrunk
function crop(a) {
  if (a.kind !== 'sprite' || a.type === 'background') return '';
  const [w, h] = a.tech.frame, [px, py] = a.tech.pivot ?? [w / 2, h / 2];
  if (w <= 64 && h <= 64) return '';
  const ox = Math.max(64 - w, Math.min(0, 32 - px)), oy = Math.max(64 - h, Math.min(0, a.tech.grounded ? 60 - py : 32 - py));
  return `style="--ox:${ox}px;--oy:${oy}px"`;
}
function rowHTML(a) {
  const isSprite = a.kind === 'sprite', inBag = bag.has(a.id);
  return `<article class="card row" data-id="${a.id}" data-kind="${a.kind}">
    <div class="card-tile tile${a.type === 'background' ? ' is-cover' : ''}"><a class="card-pic${crop(a) ? ' is-crop' : ''}" ${crop(a)} data-scale="1" href="remix.html" tabindex="-1" aria-hidden="true">${isSprite ? picture(a, 1) : picture(a).replace('width="128" height="80"', 'width="64" height="40"')}</a>${isSprite ? '' : '<span class="progress" aria-hidden="true"></span>'}</div>
    <div style="min-width:0"><a class="card-name" href="remix.html">${a.name}</a><span class="desc">${esc(a.description)}</span></div>
    <span class="cell" data-tag>${TYPE_LABEL[a.type]}</span>
    <span class="cell">${kitsOf(a) || 'No kit'}</span>
    <span class="cell num">${isSprite ? a.tech.clips.length : ''}</span>
    <span class="cell num">${a.tech.controls ?? ''}</span>
    <span class="cell num">${isSprite ? '' : seconds(a.tech.seconds)}</span>
    ${isSprite
      ? `<div class="card-dots" role="group" aria-label="Ready-made versions of ${a.name}">${versionsOf(a).map((v, i) => `<button type="button" class="vdot" data-v="${i}" style="--dot:${v.dot}" aria-label="Add the ${v.name} version of ${a.name}"></button>`).join('')}</div>`
      : `<button type="button" class="play" aria-label="Play ${a.name}" aria-pressed="false">${ICON.play}</button>`}
    <button type="button" class="add" aria-pressed="${inBag}" aria-label="${inBag ? 'Take' : 'Add'} ${a.name} ${inBag ? 'out of' : 'to'} your bag">${inBag ? ICON.check : ICON.plus}</button>
  </article>`;
}
function kitsHTML() {
  const full = KITS.map((k) => kitRowHTML(k, bundles.find((b) => b.id === k.id), `<button type="button" class="btn btn-primary" data-addkit="${k.id}">Add the whole kit</button><button type="button" class="btn btn-secondary" data-openkit="${k.id}">See what is inside</button>`)).join('');
  const small = bundles.filter((b) => !KITS.some((k) => k.id === b.id)).map((b) => {
    const pics = b.sprites.slice(0, 4).map((id) => picture(byId.get(id), 2)).join('') + (b.sprites.length < 3 ? b.sounds.slice(0, 2).map((id) => picture(byId.get(id)).replace('width="128" height="80"', 'width="64" height="40"')).join('') : '');
    const n = [[b.sprites.length, 'sprite'], [b.sounds.length, 'sound'], [b.music.length, 'music track']].filter(([c]) => c).map(([c, w]) => `${c} ${w}${c > 1 ? 's' : ''}`).join(', ');
    return `<article class="kit-card"><div class="tile"><div class="thumbs">${pics}</div></div><h3>${b.name}</h3><p>${esc(b.blurb)}</p>
      <div class="kit-row"><span class="quiet" style="font-size:13px">${n}</span><span style="display:flex;gap:8px"><button type="button" class="btn btn-sm btn-secondary" data-openkit="${b.id}">See inside</button><button type="button" class="btn btn-sm btn-secondary" data-addkit="${b.id}">Add all</button></span></div></article>`;
  }).join('');
  return `<div class="kits">${full}</div><h2 class="h3" style="margin:64px 0 24px">Smaller sets</h2><div class="kit-grid">${small}</div>`;
}
function paintResults() {
  const kits = state.kind === 'kits';
  $('#sort-wrap').hidden = kits; $('#view-wrap').hidden = kits;
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', b.dataset.view === state.view);
  const out = $('#results');
  if (kits) { $('#count').textContent = ''; out.innerHTML = kitsHTML(); mountScenes(out, byId); return; }
  const list = assets.filter((a) => matchQ(a) && matchKind(a) && matchFilters(a)).sort(SORTS[state.sort]);
  $('#count').textContent = `${list.length} ${list.length === 1 ? 'result' : 'results'}`;
  if (!list.length) {
    out.innerHTML = `<div class="empty"><b>Nothing matches${state.q ? ` “${esc(state.q)}”` : ''}.</b>Try a plainer word, take a filter away, or turn on smarter search and describe what you need.</div>`;
  } else if (state.view === 'list') {
    const sprites = state.kind === 'sprite', sounds = state.kind === 'sound' || state.kind === 'music';
    out.innerHTML = `<div class="rows"><div class="rows-head" aria-hidden="true"><span></span><span>Name</span><span>Type</span><span>Kit</span><span>${sounds ? '' : 'Animations'}</span><span>Controls</span><span>${sprites ? '' : 'Length'}</span><span>${sounds ? 'Listen' : 'Versions'}</span><span></span></div>${list.map(rowHTML).join('')}</div>`;
  } else {
    out.innerHTML = `<div class="grid">${list.map(cardHTML).join('')}</div>`;
  }
}
wireCards($('#results'), byId);
$('#results').addEventListener('click', (e) => {
  const add = e.target.closest('[data-addkit]'), open = e.target.closest('[data-openkit]');
  if (add) { const b = bundles.find((x) => x.id === add.dataset.addkit); for (const id of [...b.sprites, ...b.sounds, ...b.music]) bag.add(id); add.textContent = 'In your bag'; }
  if (open) { state.kind = 'all'; state.kit = open.dataset.openkit; render(); scrollTo(0, 0); }
});

/* ---------- search, sort, layout, smarter search ---------- */
const q = $('#q');
q.value = state.q;
q.addEventListener('input', () => { state.q = q.value.trim(); render(); });
$('#search-form').addEventListener('submit', (e) => e.preventDefault());
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; paintResults(); });
document.querySelector('.view').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) { state.view = b.dataset.view; paintResults(); } });
$('#smart').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
  e.currentTarget.setAttribute('aria-checked', on);
  q.placeholder = on ? 'Describe it, like “something for when the player dies”' : 'Search sprites, sounds and music';
  q.focus();
});

function render() { paintKinds(); paintFilters(); paintResults(); }
render();
