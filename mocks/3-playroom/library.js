// Playroom library: search, kind tabs, three filter pills, cards, and the sheet that slides up from a card.
import { loadCatalog, thumb, url, icon, esc, bag, toneOf, seconds, word, reduced, barsOf, bindPlay,
  TYPE_WORD, TYPE_ORDER, GAME_WORD, THEME_WORD, KITS, SCENES, buildScene, controlHTML, bindControls, syncControls } from './app.js';

const { assets, bundles } = await loadCatalog();
const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
const $ = (s, r = document) => r.querySelector(s);

const TABS = [
  { id: 'sprite', label: 'Sprites', one: 'sprite', many: 'sprites' },
  { id: 'sound', label: 'Sounds', one: 'sound', many: 'sounds' },
  { id: 'music', label: 'Music', one: 'music track', many: 'music tracks' },
  { id: 'kits', label: 'Kits', one: 'kit', many: 'kits' },
];
const FILTERS = [
  { id: 'game', label: 'Game type', words: GAME_WORD, of: (a) => a.gameTypes ?? [] },
  { id: 'theme', label: 'Theme', words: THEME_WORD, of: (a) => a.themes ?? [] },
  { id: 'type', label: 'Kind of thing', words: TYPE_WORD, of: (a) => [a.type] },
];
const state = { tab: location.hash === '#kits' ? 'kits' : 'sprite', q: new URLSearchParams(location.search).get('q') ?? '', game: '', theme: '', type: '', smart: false, open: '' };

// ---------------------------------------------------------------- finding
const hay = new Map(assets.map((a) => [a.id, [a.name, a.description, TYPE_WORD[a.type], ...(a.words ?? []), ...(a.themes ?? []).map((t) => THEME_WORD[t] ?? t), ...(a.gameTypes ?? []).map((g) => GAME_WORD[g] ?? g)].join(' ').toLowerCase()]));
const matches = (tab) => { const words = state.q.toLowerCase().split(/\s+/).filter(Boolean); return assets.filter((a) => a.kind === tab && words.every((w) => hay.get(a.id).includes(w))); };
function find({ tab = state.tab, skip = '' } = {}) {
  const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  return assets.filter((a) => a.kind === tab
    && words.every((w) => hay.get(a.id).includes(w))
    && FILTERS.every((f) => f.id === skip || !state[f.id] || f.of(a).includes(state[f.id])))
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || (b.id === 'knight') - (a.id === 'knight') || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- the top rows
function drawKinds() {
  $('#kinds').innerHTML = TABS.map((t) => {
    const n = t.id === 'kits' ? bundles.length : matches(t.id).length;
    return `<button type="button" class="kind" role="tab" data-tab="${t.id}" aria-selected="${state.tab === t.id}">${t.label}<small>${n}</small></button>`;
  }).join('');
}
function drawFilters(n) {
  const tab = TABS.find((t) => t.id === state.tab);
  if (state.tab === 'kits') { $('#filters').innerHTML = `<span class="count">3 complete kits and 3 small sets</span>`; return; }
  const pills = FILTERS.filter((f) => !(f.id === 'type' && state.tab === 'music')).map((f) => {
    const pool = find({ skip: f.id });
    const counts = {};
    for (const a of pool) for (const v of f.of(a)) counts[v] = (counts[v] ?? 0) + 1;
    const opts = Object.keys(counts).sort((a, b) => (f.id === 'type' ? TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b) : counts[b] - counts[a]));
    const on = state[f.id];
    return `<div class="filter">
      <button type="button" class="chip" data-menu="${f.id}" aria-haspopup="true" aria-expanded="${state.open === f.id}" aria-pressed="${!!on}">${on ? esc(f.words[on] ?? on) : f.label}${icon('down')}</button>
      ${state.open === f.id ? `<div class="menu" role="menu" aria-label="${f.label}">
        <button type="button" role="menuitemradio" data-set="${f.id}" data-value="" aria-checked="${!on}">Any ${f.label.toLowerCase()}<span>${pool.length}</span></button>
        ${opts.map((v) => `<button type="button" role="menuitemradio" data-set="${f.id}" data-value="${v}" aria-checked="${on === v}">${esc(f.words[v] ?? v)}<span>${counts[v]}</span></button>`).join('')}
      </div>` : ''}
    </div>`;
  }).join('');
  const any = state.q || FILTERS.some((f) => state[f.id]);
  $('#filters').innerHTML = `${pills}
    <button type="button" class="switch smart" role="switch" aria-checked="${state.smart}" data-smart title="Understands descriptions like “something for when the player dies”"><i></i>Smarter search</button>
    ${any ? '<button type="button" class="link" data-clear style="border:0;background:none;padding:0 8px;font-size:15px">Clear</button>' : ''}
    <span class="count">${n} ${n === 1 ? tab.one : tab.many}</span>`;
}

// ---------------------------------------------------------------- cards
/** A sprite picture at a whole multiple of its size that fits the tile. Backgrounds fill the tile at 1x. */
function fit(a, boxW = 200, boxH = 150, cap = 4) {
  const [w, h] = a.tech.frame;
  if (a.type === 'background') return 1;
  if (w === 64 && h === 64 && boxW >= 200) return 3;   // these frames keep wide empty margins
  return Math.max(1, Math.min(w <= 16 ? 6 : cap, Math.floor(Math.min(boxW / w, boxH / h))));
}
const stripStyle = (a, k, lazy = false) => `width:${a.tech.frame[0] * k}px;height:${a.tech.frame[1] * k}px;${lazy ? '' : `background-image:url(${url(a.strip)});`}background-size:${a.stripFrames * a.tech.frame[0] * k}px ${a.tech.frame[1] * k}px`;
// pictures load as their card comes near the window, and try again if the server drops one
function loadPicture(el, tries = 4) {
  const src = el.dataset.src, im = new Image();
  im.onload = () => { if (el.tagName === 'IMG') el.src = src; else el.style.backgroundImage = `url(${src})`; };
  im.onerror = () => { if (tries > 1) setTimeout(() => loadPicture(el, tries - 1), 700); };
  im.src = src;
}
const near = new IntersectionObserver((list) => { for (const e of list) if (e.isIntersecting) { near.unobserve(e.target); loadPicture(e.target); } }, { rootMargin: '400px' });
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const addBtn = (a) => { const on = bag.has(a.id); return `<button type="button" class="round add" data-add="${a.id}" aria-pressed="${on}" aria-label="${on ? `Take ${esc(a.name)} out of your bag` : `Add ${esc(a.name)} to your bag`}">${icon(on ? 'check' : 'plus')}</button>`; };

const small = matchMedia('(max-width: 760px)');
if (small.matches) document.getElementById('q').placeholder = 'Search the library';
function card(a) {
  const tone = toneOf(a);
  if (a.kind === 'sprite') {
    const k = small.matches ? fit(a, 160, 144) : fit(a);
    return `<li class="card">
      <button type="button" class="card-open" data-open="${a.id}">
        <span class="tile" data-tone="${tone}"><span class="strip" data-strip="${a.id}" data-k="${k}" data-src="${url(a.strip)}" style="${stripStyle(a, k, true)}${a.tech.frame[1] * k > 180 ? ';margin-top:-14px' : ''}"></span></span>
        <span><span class="card-name">${esc(a.name)}</span><span class="card-tag">${TYPE_WORD[a.type]}</span></span>
      </button>${addBtn(a)}</li>`;
  }
  const music = a.kind === 'music';
  return `<li class="card">
    <button type="button" class="card-open" data-open="${a.id}">
      <span class="tile" data-tone="${tone === 'mist' ? 'dusk' : tone}">
        ${music ? `<span class="wave" aria-hidden="true">${barsOf(a.id, 36)}</span>` : `<img class="px" src="${BLANK}" data-src="${thumb(a.id)}" width="128" height="80" alt="">`}
        <span class="len">${seconds(a.tech.seconds)}${a.tech.loop ? ' loop' : ''}</span>
      </span>
      <span><span class="card-name">${esc(a.name)}</span><span class="card-tag">${TYPE_WORD[a.type]}</span></span>
    </button>
    <button type="button" class="play" data-seconds="${a.tech.seconds}" aria-pressed="false" aria-label="Play ${esc(a.name)}">${icon('play')}</button>
    ${addBtn(a)}</li>`;
}

async function drawKits() {
  const full = Object.keys(KITS).map((id) => bundles.find((b) => b.id === id));
  const small = bundles.filter((b) => !KITS[b.id]);
  $('#results').innerHTML = `
    <div class="kit-cards">${full.map((b) => { const k = KITS[b.id]; return `
      <article class="kit-card field" data-tone="${k.tone}">
        <div class="scene" data-scene="${b.id}" role="img" aria-label="A scene from ${esc(k.name)}"></div>
        <div class="kit-copy"><h2 class="h-sub" style="font-size:36px">${esc(k.name)}</h2><p class="kit-kind small">${esc(k.kind)}</p>
          <ul class="kit-stats"><li>${b.sprites.length} sprites</li><li>${b.sounds.length} sounds</li><li>${b.music.length} music tracks</li></ul></div>
        <button type="button" class="btn btn-white" data-kit="${b.id}">${icon('plus')}Add the whole kit</button>
      </article>`; }).join('')}</div>
    <h2 class="h-sub" style="margin-bottom:24px">Small sets</h2>
    <div class="sets">${small.map((b) => `
      <article class="set">
        <div class="set-art">${b.sprites.slice(0, 4).map((id) => { const a = byId[id]; const k = Math.max(1, Math.floor(64 / Math.max(...a.tech.frame))); return `<span class="strip" style="${stripStyle(a, k)}"></span>`; }).join('')}</div>
        <h3 class="h-sub" style="font-size:22px">${esc(b.name)}</h3>
        <p class="small quiet">${esc(b.blurb)}</p>
        <button type="button" class="btn btn-white btn-sm" data-kit="${b.id}">${icon('plus')}Add the set</button>
      </article>`).join('')}</div>`;
  for (const el of document.querySelectorAll('#results .scene')) buildScene(el, SCENES[el.dataset.scene], assets);
}

const elsewhere = () => (state.q ? TABS.filter((t) => t.id !== 'kits' && t.id !== state.tab && matches(t.id).length) : []);
function draw() {
  drawKinds();
  if (state.tab === 'kits') { drawFilters(0); drawKits(); return; }
  const list = find();
  drawFilters(list.length);
  $('#results').innerHTML = list.length
    ? `<ul class="grid ${state.tab === 'music' ? 'grid-music' : ''}">${list.map(card).join('')}</ul>`
    : `<div class="grid"><div class="empty"><h2 class="h-sub">No ${TABS.find((t) => t.id === state.tab).many} match that.</h2>
        <p>${elsewhere().length ? 'There is something under another kind, though.' : 'Try fewer or plainer words, or take a filter off.'}</p>
        <div class="sheet-foot">${elsewhere().map((t) => `<button type="button" class="btn btn-ink" data-tab="${t.id}">Show ${matches(t.id).length} ${matches(t.id).length === 1 ? t.one : t.many}</button>`).join('')}
        <button type="button" class="btn btn-white" data-clear>Clear the search</button></div></div></div>`;
  near.disconnect();
  for (const el of document.querySelectorAll('#results [data-src]')) near.observe(el);
}
$('#q').value = state.q;
draw();

// ---------------------------------------------------------------- events
$('#q').addEventListener('input', (e) => { state.q = e.target.value.trim(); draw(); });
$('#kinds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab; state.type = ''; state.open = '';
  history.replaceState(null, '', state.tab === 'kits' ? '#kits' : location.pathname);
  draw();
});
addEventListener('hashchange', () => { if (location.hash === '#kits') { state.tab = 'kits'; draw(); } });
$('#filters').addEventListener('click', (e) => {
  const m = e.target.closest('[data-menu]'), s = e.target.closest('[data-set]');
  if (m) { state.open = state.open === m.dataset.menu ? '' : m.dataset.menu; draw(); $(`[data-menu="${m.dataset.menu}"]`)?.focus(); e.stopPropagation(); }
  else if (s) { state[s.dataset.set] = s.dataset.value; state.open = ''; draw(); $(`[data-menu="${s.dataset.set}"]`)?.focus(); }
  else if (e.target.closest('[data-smart]')) { state.smart = !state.smart; draw(); }
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-clear]')) { state.q = ''; $('#q').value = ''; for (const f of FILTERS) state[f.id] = ''; state.open = ''; draw(); return; }
  if (state.open && !e.target.closest('.filter')) { state.open = ''; draw(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (state.open) { const id = state.open; state.open = ''; draw(); $(`[data-menu="${id}"]`)?.focus(); }
  else if (!$('#sheet-host').hidden) closeSheet();
});

const results = $('#results');
bindPlay(results);
results.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; for (const f of FILTERS) state[f.id] = ''; draw(); return; }
  const add = e.target.closest('[data-add]'), open = e.target.closest('[data-open]'), kit = e.target.closest('[data-kit]');
  if (add) { toggleBag(byId[add.dataset.add]); }
  else if (open) openSheet(byId[open.dataset.open], open);
  else if (kit) {
    const b = bundles.find((x) => x.id === kit.dataset.kit);
    for (const id of [...b.sprites, ...b.sounds, ...b.music]) if (!bag.has(id)) bag.put(id, { name: byId[id].name });
    kit.innerHTML = `${icon('check')}In your bag`;
  }
});
function toggleBag(a) {
  if (bag.has(a.id)) bag.remove(a.id); else bag.put(a.id, { name: a.name });
  for (const b of document.querySelectorAll(`[data-add="${a.id}"]`)) b.outerHTML = addBtn(a);
}

// cards animate under the pointer by stepping through their row of pictures
let anim = 0;
results.addEventListener('pointerover', (e) => {
  const c = e.target.closest('.card');
  const s = c?.querySelector('[data-strip]');
  if (!s || s.dataset.on || reduced()) return;
  const a = byId[s.dataset.strip], k = Number(s.dataset.k);
  if (a.stripFrames < 2) return;
  s.dataset.on = '1';
  let f = 0;
  clearInterval(anim);
  anim = setInterval(() => { f = (f + 1) % a.stripFrames; s.style.backgroundPositionX = `${-f * a.tech.frame[0] * k}px`; }, 1000 / (a.stripFps || 8));
  c.addEventListener('pointerleave', () => { clearInterval(anim); s.style.backgroundPositionX = '0'; delete s.dataset.on; }, { once: true });
});

// ---------------------------------------------------------------- the sheet
const host = $('#sheet-host'), sheet = $('#sheet');
let opener = null;

function pick3(el) {
  const all = el.controls().flatMap((g) => g.items.map((it) => ({ ...it, group: g.group, part: g.part })));
  const first = ['choice', 'color', 'range'].map((kind) => all.find((it) => it.kind === kind)).filter(Boolean);
  for (const it of all) if (first.length < 3 && !first.includes(it)) first.push(it);
  return first.slice(0, 3);
}
const ctlLabel = (it) => word(it.isSelector ? it.part.label : it.part && it.kind !== 'choice' ? `${it.part.label} ${it.label.toLowerCase()}` : it.label);

async function openSheet(a, from) {
  opener = from;
  const tone = a.kind === 'sprite' ? toneOf(a) : toneOf(a) === 'mist' ? 'dusk' : toneOf(a);
  const isSprite = a.kind === 'sprite';
  const room = small.matches ? 192 : 288;
  const k = isSprite ? (a.type === 'background' ? 1 : Math.max(1, Math.floor(Math.min(room / a.tech.frame[0], room / a.tech.frame[1])))) : 0;
  sheet.innerHTML = `
    <div class="tile sheet-art" data-tone="${tone}">
      ${isSprite ? `<lo-sprite id="sheet-sprite" sprite="${a.id}" scale="${k}" ${a.type === 'background' ? 'layers' : ''}></lo-sprite>
                   <button type="button" class="round" id="sheet-dice" style="position:absolute;right:16px;bottom:16px" aria-label="Surprise me">${icon('dice')}</button>`
        : a.kind === 'music' ? `<span class="wave" aria-hidden="true">${barsOf(a.id, 36)}</span>` : `<img class="px" src="${thumb(a.id)}" width="256" height="160" alt="">`}
      ${isSprite ? '' : `<button type="button" class="play" style="position:absolute;left:16px;bottom:16px" data-seconds="${a.tech.seconds}" aria-pressed="false" aria-label="Play ${esc(a.name)}">${icon('play')}</button>
                         <span class="len">${seconds(a.tech.seconds)}${a.tech.loop ? ' loop' : ''}</span>`}
    </div>
    <div class="sheet-body">
      <div class="sheet-top">
        <div><h2 id="sheet-name">${esc(a.name)}</h2><p class="small quiet" style="font-weight:600;margin-top:4px">${TYPE_WORD[a.type]}</p></div>
        <button type="button" class="round" style="background:var(--mist)" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <p>${esc(a.description)}</p>
      <div class="sheet-ctls" id="sheet-ctls">${isSprite ? '' : `<div class="ctl"><span class="ctl-label">Style</span><div class="choices">${a.tech.styles.map((s, i) => `<button type="button" class="chip" data-style aria-pressed="${i === 0}">${esc(s)}</button>`).join('')}</div></div>`}</div>
      <div class="sheet-foot">
        <button type="button" class="btn btn-primary" id="sheet-add"></button>
        <a class="btn" href="${isSprite ? `remix.html?sprite=${a.id}` : '#'}" id="sheet-all">Change everything${a.tech.controls ? ` (${a.tech.controls} controls)` : ''}</a>
        <span class="saved" id="sheet-saved"></span>
      </div>
    </div>`;
  const addB = $('#sheet-add'), saved = $('#sheet-saved');
  const paint = () => {
    const e = bag.get(a.id);
    addB.innerHTML = e ? `${icon('check')}In your bag` : `${icon('plus')}Add to bag`;
    addB.className = e ? 'btn btn-ink' : 'btn btn-primary';
    saved.className = `saved ${e?.changes ? 'on' : ''}`;
    saved.innerHTML = e?.changes ? `${icon('check')}Your changes are saved in your bag` : '';
  };
  paint();
  addB.onclick = () => { toggleBag(a); paint(); };
  bindPlay(sheet);

  host.hidden = false;
  $('#main').inert = true; $('.top').inert = true;
  requestAnimationFrame(() => host.classList.add('open'));
  $('[data-close]', sheet).focus();

  if (!isSprite) {
    $('#sheet-ctls').onclick = (e) => { const b = e.target.closest('[data-style]'); if (b) for (const x of sheet.querySelectorAll('[data-style]')) x.setAttribute('aria-pressed', String(x === b)); };
    return;
  }
  const el = $('#sheet-sprite');
  await el.ready;
  const kept = bag.get(a.id)?.params;
  if (kept) el.setParams(kept);
  const box = $('#sheet-ctls');
  let keys = '';
  const drawCtls = () => {
    const items = pick3(el);
    const sig = items.map((it) => it.key).join();
    if (sig === keys) return syncControls(box, el.params);
    keys = sig;
    box.innerHTML = items.length ? items.map((it) => controlHTML(it, { label: ctlLabel(it) })).join('') : '<p class="small quiet">This one has no controls of its own. It still changes with a look.</p>';
  };
  drawCtls();
  bindControls(box, (key, value) => el.set(key, value));
  const link = $('#sheet-all');
  el.addEventListener('change', () => {
    drawCtls();
    const changed = Object.fromEntries(el.changed().map((key) => [key, el.params[key]]));
    bag.put(a.id, { name: a.name, params: changed, changes: el.changed().length });   // kept without asking
    for (const b of document.querySelectorAll(`[data-add="${a.id}"]`)) b.outerHTML = addBtn(a);
    paint();
  });
  $('#sheet-dice').onclick = () => el.surprise();
}
function closeSheet() {
  host.classList.remove('open');
  $('#main').inert = false; $('.top').inert = false;
  setTimeout(() => { host.hidden = true; sheet.innerHTML = ''; }, reduced() ? 0 : 280);
  opener?.focus();
}
host.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
