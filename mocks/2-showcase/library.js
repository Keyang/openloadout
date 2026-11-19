// Library page of the "Showcase" mock-up. Real catalogue; the kind switch, search and all four filters work.
import { loadCatalog, thumb, url } from '../shared/kit.js';
import { icon, bag, bars, seconds, KITS, lazyPictures } from './site.js';

const $ = (id) => document.getElementById(id);
const { assets, bundles } = await loadCatalog();
const byId = new Map(assets.map((a) => [a.id, a]));
const kitName = (id) => KITS.find((k) => k.id === id)?.name ?? bundles.find((b) => b.id === id)?.name ?? id;

const TYPES = {
  sprite: [['character', 'Characters', 'Character'], ['creature', 'Creatures', 'Creature'], ['tileset', 'Ground and walls', 'Ground and walls'], ['prop', 'Objects', 'Object'],
    ['pickup', 'Pickups', 'Pickup'], ['projectile', 'Projectiles', 'Projectile'], ['effect', 'Effects', 'Effect'], ['background', 'Backgrounds', 'Background'],
    ['ui', 'Menus and screens', 'Menu piece'], ['icon', 'Icons', 'Icon']],
  sound: [['sfx', 'Sound effects', 'Sound effect'], ['ambience', 'Background sounds', 'Background sound'], ['jingle', 'Jingles', 'Jingle']],
  music: [['music', 'Music', 'Music']],
};
const TAG = Object.fromEntries(Object.values(TYPES).flat().map(([id, , one]) => [id, one]));
const GAMES = { platformer: 'Platformer', 'turn-based-rpg': 'Turn-based RPG', 'top-down-rpg': 'Top-down RPG', 'roguelike-action': 'Action roguelike', shooter: 'Shooter', arcade: 'Arcade', puzzle: 'Puzzle', 'card-game': 'Card game', 'farming-sim': 'Farming', racing: 'Racing' };
const THEMES = { fantasy: 'Fantasy', forest: 'Forest', dungeon: 'Dungeon', farm: 'Farm', 'sci-fi': 'Sci-fi', space: 'Space', horror: 'Horror', neutral: 'Fits anything', candy: 'Candy', underwater: 'Underwater', city: 'City' };
const KINDS = [['sprite', 'Sprites'], ['sound', 'Sounds'], ['music', 'Music'], ['kit', 'Kits']];
const NOUN = { sprite: ['sprite', 'sprites'], sound: ['sound', 'sounds'], music: ['music track', 'music tracks'] };

const params = new URLSearchParams(location.search);
const state = {
  kind: KINDS.some(([k]) => k === params.get('kind')) ? params.get('kind') : 'sprite',
  q: params.get('q') ?? '', type: params.get('type') ?? '', kit: params.get('kit') ?? '', game: '', theme: '',
};

/* ---------- finding ---------- */
const hay = new Map(assets.map((a) => [a.id, [a.name, a.description, TAG[a.type], ...(a.words ?? []), ...(a.themes ?? []), ...(a.gameTypes ?? []).map((g) => GAMES[g] ?? g)].join(' ').toLowerCase()]));
const matchesQ = (a) => state.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.get(a.id).includes(w));
const passes = (a, skip) =>
  (skip === 'type' || !state.type || a.type === state.type) &&
  (skip === 'kit' || !state.kit || a.bundles.includes(state.kit)) &&
  (skip === 'game' || !state.game || a.gameTypes.includes(state.game)) &&
  (skip === 'theme' || !state.theme || a.themes.includes(state.theme));
const ofKind = (kind) => assets.filter((a) => a.kind === kind && matchesQ(a));
const found = () => ofKind(state.kind).filter((a) => passes(a));
const filtered = () => !!(state.q || state.type || state.kit || state.game || state.theme);

/* ---------- cards ---------- */
function zoom(w, h) { let z = 4; while (z > 1 && (w * z > 160 || h * z > 160)) z--; return z; }
function art(a) {
  if (a.type === 'background') return `<lo-sprite sprite="${a.id}" layers scale="1"></lo-sprite>`;
  const [w, h] = a.tech.frame, n = a.stripFrames ?? 1;
  return `<span class="art${n > 1 ? ' moves' : ''}" style="--w:${w};--h:${h};--n:${n};--fps:${a.stripFps ?? 8};--z:${zoom(w, h)}" data-pic="${url(a.strip)}"></span>`;
}
function card(a) {
  const inBag = bag.has(a.id);
  const acts = `<div class="card-acts">
      <button class="btn ${inBag ? '' : 'btn-primary'} add" type="button" data-add="${a.id}">${inBag ? 'In your bag' : 'Add to bag'}</button>
      <a class="btn" href="remix.html" title="${a.id === 'knight' ? '' : 'In this mock-up only the Hero has its own page'}">Change it</a>
    </div>
    <span class="bag-mark" aria-hidden="true">${icon.check}</span>`;
  if (a.kind === 'sprite') {
    return `<article class="card${inBag ? ' in-bag' : ''}" data-id="${a.id}">
      <a class="card-stage" href="remix.html" aria-label="Change ${a.name}">${art(a)}</a>${acts}
      <h3>${a.name}</h3><p class="tag">${TAG[a.type]}</p></article>`;
  }
  const music = a.kind === 'music';
  const len = `${seconds(a.tech.seconds)}${a.tech.loop ? ', loops' : ''}`;
  return `<article class="card${inBag ? ' in-bag' : ''}" data-id="${a.id}" data-plays>
    <div class="card-stage ${music ? 'music' : 'sound'}">${music ? bars(a.id, 44, 56) : `<span class="wave x2" data-pic="${thumb(a.id)}"></span>`}</div>
    <button class="playbtn" type="button" data-seconds="${a.tech.seconds}" aria-pressed="false" aria-label="Play ${a.name} (no sound in this mock-up)">${icon.play}${icon.stop}</button>
    <span class="len">${len}</span>${acts}
    <h3>${a.name}</h3><p class="tag">${TAG[a.type]}</p></article>`;
}
const shelf = (title, sub, list, total, see) => `<section class="shelf">
    <div class="shelf-head"><h2>${title}</h2><p>${sub}</p><button class="btn btn-ghost btn-sm" type="button" data-see='${JSON.stringify(see)}'>See all ${total}</button></div>
    <div class="shelf-row" tabindex="0" aria-label="${title}">${list.map(card).join('')}</div>
  </section>`;

/* ---------- what the page shows ---------- */
function shelves(kind) {
  const all = assets.filter((a) => a.kind === kind);
  const seen = new Set();
  let out = '';
  for (const k of KITS) {
    const b = bundles.find((x) => x.id === k.id);
    const ids = kind === 'sprite' ? b.sprites : b.sounds;
    const fresh = ids.filter((id) => !seen.has(id) && byId.has(id)).slice(0, 12);
    fresh.forEach((id) => seen.add(id));
    out += shelf(k.name, k.kind, fresh.map((id) => byId.get(id)), ids.length, { kit: k.id });
  }
  const more = kind === 'sprite' ? [['creature', 'Creatures', 'Enemies, bosses and animals'], ['effect', 'Effects', 'Hits, sparks, spells and explosions']]
    : [['ambience', 'Background sounds', 'Loops that sit under a scene'], ['jingle', 'Jingles', 'Short tunes for a win or a save']];
  for (const [type, title, sub] of more) {
    const list = all.filter((a) => a.type === type);
    out += shelf(title, sub, list.slice(0, 12), list.length, { type });
  }
  return out;
}
function kitsView() {
  const big = KITS.map((k) => {
    const b = bundles.find((x) => x.id === k.id);
    const thumbs = k.faces.map((id) => byId.get(id)).filter(Boolean)
      .map((a) => `<span class="art" title="${a.name}" style="--w:${a.tech.frame[0]};--h:${a.tech.frame[1]};--n:${a.stripFrames ?? 1};--z:2" data-pic="${url(a.strip)}"></span>`).join('');
    const all = [...b.sprites, ...b.sounds, ...b.music];
    const has = all.every((id) => bag.has(id));
    return `<article class="kit-card">
      <lo-sprite class="kit-cover" sprite="${k.bg}" layers scale="1"></lo-sprite>
      <div>
        <h2>${k.name}</h2>
        <p class="has">${k.kind}. ${b.sprites.length} sprites, ${b.sounds.length} sounds, ${b.music.length} music tracks.</p>
        <p class="blurb">${b.blurb}</p>
        <div class="acts">
          <button class="btn" type="button" data-addkit="${k.id}">${has ? 'Whole kit is in your bag' : 'Add the whole kit to your bag'}</button>
          <button class="btn btn-ghost" type="button" data-see='${JSON.stringify({ kit: k.id })}'>See what is inside</button>
        </div>
        <div class="kit-thumbs">${thumbs}</div>
      </div></article>`;
  }).join('');
  const small = bundles.filter((b) => !KITS.some((k) => k.id === b.id)).map((b) => `<article class="set">
      <h3>${b.name}</h3><p>${b.blurb}</p>
      <p class="small quiet">${[b.sprites.length && `${b.sprites.length} ${b.sprites.length === 1 ? 'sprite' : 'sprites'}`, b.sounds.length && `${b.sounds.length} sounds`, b.music.length && `${b.music.length} music track`].filter(Boolean).join(', ')}</p>
      <div><button class="btn btn-sm" type="button" data-addkit="${b.id}">Add to bag</button></div></article>`).join('');
  return `${big}<h2 class="sets-head">Smaller sets</h2><div class="sets">${small}</div>`;
}

function fillSelect(sel, any, entries, key) {
  const pool = ofKind(state.kind).filter((a) => passes(a, key));
  const count = (v) => pool.filter((a) => (key === 'type' ? a.type === v : key === 'kit' ? a.bundles.includes(v) : key === 'game' ? a.gameTypes.includes(v) : a.themes.includes(v))).length;
  sel.innerHTML = `<option value="">${any}</option>` + entries.map(([v, label]) => [v, label, count(v)]).filter(([v, , n]) => n || v === state[key])
    .map(([v, label, n]) => `<option value="${v}"${state[key] === v ? ' selected' : ''}>${label} (${n})</option>`).join('');
  sel.parentElement.classList.toggle('on', !!state[key]);
  sel.parentElement.hidden = entries.length < 2;
}

function render() {
  for (const b of $('kind').children) {
    const k = b.dataset.kind;
    b.setAttribute('aria-pressed', String(k === state.kind));
    b.querySelector('span').textContent = k === 'kit' ? 3 : ofKind(k).length;
  }
  const res = $('results');
  $('filters').hidden = state.kind === 'kit';
  if (state.kind === 'kit') { res.innerHTML = kitsView(); lazyPictures(res); return; }

  fillSelect($('f-type'), 'Any type', TYPES[state.kind].map(([v, l]) => [v, l]), 'type');
  fillSelect($('f-kit'), 'Any kit', KITS.map((k) => [k.id, k.name]), 'kit');
  fillSelect($('f-game'), 'Any game type', Object.entries(GAMES), 'game');
  fillSelect($('f-theme'), 'Any theme', Object.entries(THEMES), 'theme');
  $('clear').hidden = !filtered();

  const list = found(), [one, many] = NOUN[state.kind];
  const n = `<b>${list.length}</b> ${list.length === 1 ? one : many}`;
  $('count').innerHTML = state.q ? `${n} for “${state.q.replace(/</g, '&lt;')}”` : state.kit && !state.type ? `${n} in ${kitName(state.kit)}` : n;

  if (!filtered() && state.kind !== 'music') res.innerHTML = shelves(state.kind);
  else if (!list.length) {
    res.innerHTML = `<div class="empty"><b>Nothing matches yet</b><p>Try fewer words or take a filter off. Smarter search can also find things from a description.</p><button class="btn" type="button" data-clear>Clear search and filters</button></div>`;
  } else res.innerHTML = `<div class="grid${state.kind === 'music' ? ' wide' : ''}">${list.map(card).join('')}</div>`;
  lazyPictures(res);
}
function clear() { Object.assign(state, { q: '', type: '', kit: '', game: '', theme: '' }); $('q').value = ''; render(); }

/* ---------- wiring ---------- */
for (const [k, label] of KINDS) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.kind = k; b.innerHTML = `${label}<span></span>`;
  b.onclick = () => { Object.assign(state, { kind: k, type: '' }); render(); };
  $('kind').append(b);
}
$('q').value = state.q;
$('q').oninput = (e) => { state.q = e.target.value.trim(); render(); };
const narrow = matchMedia('(max-width: 720px)');
const hint = () => { $('q').placeholder = $('smart').checked ? (narrow.matches ? 'Describe what you need' : 'Describe it, like “something for when the player dies”') : narrow.matches ? 'Search' : 'Search sprites, sounds and music'; };
$('smart').onchange = hint;
narrow.addEventListener('change', hint);
hint();
for (const [id, key] of [['f-type', 'type'], ['f-kit', 'kit'], ['f-game', 'game'], ['f-theme', 'theme']]) $(id).onchange = (e) => { state[key] = e.target.value; render(); };
$('clear').onclick = clear;
document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) {
    const on = bag.toggle(add.dataset.add);
    for (const c of document.querySelectorAll(`.card[data-id="${add.dataset.add}"]`)) {
      c.classList.toggle('in-bag', on);
      const b = c.querySelector('.add');
      b.textContent = on ? 'In your bag' : 'Add to bag';
      b.classList.toggle('btn-primary', !on);
    }
    return;
  }
  const see = e.target.closest('[data-see]');
  if (see) { Object.assign(state, { type: '', kit: '', ...JSON.parse(see.dataset.see) }); if (state.kind === 'kit') state.kind = 'sprite'; render(); scrollTo({ top: 0 }); return; }
  const kit = e.target.closest('[data-addkit]');
  if (kit) { const b = bundles.find((x) => x.id === kit.dataset.addkit); bag.add([...b.sprites, ...b.sounds, ...b.music]); kit.textContent = 'In your bag'; return; }
  if (e.target.closest('[data-clear]')) clear();
});
render();
