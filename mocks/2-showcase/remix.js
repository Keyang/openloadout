// Remix page of the "Showcase" mock-up: a character-creation screen for the Hero.
// Every control comes from the real sprite (el.controls()); every choice is drawn as a small live Hero.
import { loadCatalog, looks, thumb } from '../shared/kit.js';
import { icon, bag, seconds, lazyPictures } from './site.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hero = $('hero'), stage = $('stage'), world = $('world');
await hero.ready;
const def = hero.def;
const { assets } = await loadCatalog();
const soundInfo = new Map(assets.map((a) => [a.id, a]));

/* ---------- what is kept: the Hero's settings live in this browser, so there is no save step ---------- */
const KEY = 'loadout-mock2-hero';
const kept = (() => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } })();
const state = { tab: 'body', scene: kept.scene ?? '', size: kept.size ?? '2x' };
if (kept.params) hero.setParams(kept.params);
if (kept.look) hero.setLook(kept.look);
if (kept.clip) hero.setClip(kept.clip);
function keep() {
  const changed = Object.fromEntries(hero.changed().map((k) => [k, hero.params[k]]));
  try { localStorage.setItem(KEY, JSON.stringify({ params: changed, look: hero.look, clip: hero.clip, scene: state.scene, size: state.size })); } catch { /* private window */ }
}
let savedTimer;
const savedWords = () => { $('saved-text').innerHTML = bag.has('knight') ? 'Saved<span class="long"> in your bag</span>' : 'Not in <span class="long">your </span>bag'; };
function flashSaved() {
  const box = $('saved');
  box.classList.add('busy');
  $('saved-text').textContent = 'Saving';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { box.classList.remove('busy'); savedWords(); }, 450);
}

/* ---------- the stage: one whole number scales the Hero, and the forest when it is switched on ---------- */
const TILE_SPAN = 12;
for (const k of [-1, 0, 1]) world.prepend(Object.assign(document.createElement('lo-sprite'), { className: 'bg' }));
[...world.querySelectorAll('.bg')].forEach((b, i) => { b.setAttribute('sprite', 'bg-forest'); b.setAttribute('layers', ''); b.style.setProperty('--k', i - 1); });
for (let r = 0; r < 4; r++) {
  for (let i = -TILE_SPAN; i < TILE_SPAN; i++) {
    const t = document.createElement('lo-sprite');
    t.className = 'tile';
    t.setAttribute('sprite', 'tiles-forest');
    t.setAttribute('clip', r === 0 ? 'grass-top' : ['grass-fill', 'grass-fill-b', 'grass-fill', 'grass-fill'][((i * 5 + r * 3) % 4 + 4) % 4]);
    t.setAttribute('paused', '');
    t.style.setProperty('--i', i);
    t.style.setProperty('--r', r);
    world.insertBefore(t, world.querySelector('.shadow'));
  }
}
function fitStage() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const small = h < 320;
  let s = small ? 3 : Math.max(2, Math.floor((h * 0.7) / 64));
  while (s > 2 && 64 * s > w * 0.85) s--;
  stage.style.setProperty('--s', s);
  stage.style.setProperty('--cx', `${Math.round(w / 2)}px`);
  stage.style.setProperty('--feet', `${Math.round(h * (small ? 0.78 : 0.7))}px`);
}
new ResizeObserver(fitStage).observe(stage);
fitStage();
function setScene(id) {
  state.scene = id;
  stage.classList.toggle('in-scene', !!id);
  for (const b of $('backdrop').children) b.setAttribute('aria-pressed', String(b.dataset.scene === id));
  keep();
}
for (const b of $('backdrop').children) b.onclick = () => setScene(b.dataset.scene);

/* ---------- tabs ---------- */
const TABS = [
  { id: 'body', label: 'Body', sub: 'Height, build and head', group: 'Look' },
  { id: 'hair', label: 'Hair', sub: 'Style and colour', group: 'Hair' },
  { id: 'headgear', label: 'Headgear', sub: 'What is worn on the head', group: 'Headgear' },
  { id: 'weapon', label: 'Weapon', sub: 'What is held, and how', group: 'Weapon' },
  { id: 'cape', label: 'Cape', sub: 'Style and length', group: 'Cape' },
  { id: 'colours', label: 'Colours', sub: 'Skin, outfit, trim and metal', group: 'Colors' },
  { id: 'motion', label: 'Motion', sub: 'How the Hero moves', group: 'Motion' },
  { id: 'look', label: 'Look', sub: 'Recolours everything at once', rule: true },
  { id: 'sounds', label: 'Sounds', sub: '' },
];
const tabOfKey = {};
for (const [key, p] of Object.entries(def.params)) {
  const part = Object.values(def.parts ?? {}).find((x) => x.params.includes(key));
  tabOfKey[key] = TABS.find((t) => t.group === (part ? part.label : p.group ?? 'Look'))?.id;
}
for (const t of TABS) {
  if (t.rule) $('tabs').append(document.createElement('hr'));
  const b = document.createElement('button');
  b.type = 'button'; b.id = `tab-${t.id}`; b.setAttribute('role', 'tab');
  b.innerHTML = `<span>${t.label}</span>${t.id === 'sounds' ? '<span class="n"></span>' : '<span class="dot"></span>'}`;
  b.onclick = () => { state.tab = t.id; built = ''; sync(); };
  $('tabs').append(b);
}

/* ---------- the nine animations as a filmstrip of small live Heroes ---------- */
for (const c of hero.clips) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.clip = c.name;
  b.innerHTML = `<span class="frame"><lo-sprite sprite="knight" clip="${c.name}" scale="1"></lo-sprite></span>${c.label}`;
  b.onclick = () => { hero.setClip(c.name); if (hero.hasAttribute('paused')) togglePlay(); };
  $('film').append(b);
}
function togglePlay() {
  const paused = hero.hasAttribute('paused');
  if (paused) hero.play(); else hero.pause();
  $('play').setAttribute('aria-pressed', String(paused));
}
$('play').onclick = togglePlay;

/* ---------- the options of the open tab ---------- */
const mini = (over, extra = '') => `<lo-sprite sprite="knight" clip="idle" paused data-over='${JSON.stringify(over)}' ${extra}></lo-sprite>`;
const nice = (label) => (label === 'Color' ? 'Colour' : label);
function controlHtml(item, withPics, tab) {
  if (item.kind === 'choice') {
    // hair is shown without headgear so the style can be seen; hair and headgear are shown close up
    const close = tab === 'hair' || tab === 'headgear', bare = tab === 'hair' ? { headgear: 'none' } : {};
    const hidden = tab === 'hair' && hero.params.headgear !== 'none' && hero.params.hairStyle !== 'bald';
    return `<div><div class="picks${close ? ' close' : ''}" role="group" aria-label="${esc(item.label)}">${item.options.map((o) =>
      `<button class="pick" type="button" data-key="${item.key}" data-value="${esc(o.value)}"><span class="frame">${mini({ ...bare, [item.key]: o.value })}</span>${esc(o.label)}</button>`).join('')}</div>
      ${hidden ? `<p class="note" style="margin-top:8px">Shown without the ${esc(hero.params.headgear)}, which covers most of the hair.</p>` : ''}</div>`;
  }
  if (item.kind === 'color') {
    return `<div><p class="ctl-label">${esc(nice(item.label))}</p><div class="swatches" role="group" aria-label="${esc(nice(item.label))}">${item.swatches.map((c, i) =>
      `<button class="sw" type="button" style="--c:${c}" data-key="${item.key}" data-value="${c}" aria-label="${esc(nice(item.label))} ${i + 1}"></button>`).join('')}
      <label class="sw sw-own" title="Any other colour">+<input type="color" data-key="${item.key}" aria-label="${esc(nice(item.label))}: any other colour"></label></div></div>`;
  }
  if (item.kind === 'range') {
    const ends = withPics
      ? [`<span class="end">${mini({ [item.key]: item.min }, 'scale="1"')}</span>`, `<span class="end">${mini({ [item.key]: item.max }, 'scale="1"')}</span>`]
      : [`<span class="end">${esc(item.lo ?? '')}</span>`, `<span class="end">${esc(item.hi ?? '')}</span>`];
    return `<div><p class="ctl-label"><span>${esc(item.label)}</span>${withPics ? `<span class="note">${esc(item.lo)} to ${esc(item.hi.toLowerCase())}</span>` : ''}</p>
      <div class="slider${withPics ? ' pics' : ''}">${ends[0]}<input type="range" data-key="${item.key}" min="${item.min}" max="${item.max}" step="${item.step}" aria-label="${esc(item.label)}, from ${esc(item.lo)} to ${esc(item.hi)}">${ends[1]}</div></div>`;
  }
  return `<div><button class="btn btn-sm" type="button" data-key="${item.key}" data-toggle>${esc(item.label)}</button></div>`;
}
const SHOWN_LOOKS = ['original', 'sunset', 'frost', 'night', 'candy', 'handheld', 'golden', 'spooky', 'mono'];
function lookHtml() {
  const rest = looks.filter((l) => !SHOWN_LOOKS.includes(l.id));
  return `<div><div class="picks" role="group" aria-label="Look">${SHOWN_LOOKS.map((id) => looks.find((l) => l.id === id)).map((l) =>
    `<button class="pick" type="button" data-look="${l.id}" title="${esc(l.blurb)}"><span class="frame">${mini({}, `look="${l.id}" data-fixed-look`)}</span>${l.name}</button>`).join('')}</div></div>
    <div><p class="ctl-label">More looks</p><div class="swatches">${rest.map((l) => `<button class="btn btn-sm" type="button" data-look="${l.id}" title="${esc(l.blurb)}">${l.name}</button>`).join('')}</div></div>`;
}
function clipSounds() {
  const rows = [];
  for (const s of def.sounds?.[hero.clip] ?? []) {
    if (s.when && !Object.entries(s.when).every(([k, ok]) => ok.includes(hero.params[k]))) continue;
    const row = rows.find((r) => r.sound === s.sound && r.preset === s.preset);
    if (row) row.frames.push(s.frame); else rows.push({ sound: s.sound, preset: s.preset, frames: [s.frame] });
  }
  return rows;
}
function soundsHtml() {
  const clip = hero.clips.find((c) => c.name === hero.clip), rows = clipSounds();
  if (!rows.length) return `<p class="note">${clip.label} is silent. Pick another animation under the picture to see what it plays.</p>`;
  const list = rows.map((r) => {
    const a = soundInfo.get(r.sound);
    const on = r.frames.map((f) => f + 1);
    const ticks = Array.from({ length: clip.frames }, (_, i) => `<i class="${r.frames.includes(i) ? 'hit' : ''}"></i>`).join('');
    return `<li class="snd" data-plays>
      <button class="playbtn" type="button" data-seconds="${a.tech.seconds}" aria-pressed="false" aria-label="Play ${esc(a.name)} (no sound in this mock-up)">${icon.play}${icon.stop}</button>
      <span class="wave" data-pic="${thumb(r.sound)}"></span>
      <p class="nm">${esc(a.name)}<span>${esc(r.preset)} style, ${seconds(a.tech.seconds)}</span></p>
      <div class="when"><div class="ruler" style="--n:${clip.frames}" aria-hidden="true">${ticks}</div>Plays on frame ${on.join(' and ')} of ${clip.frames}</div>
    </li>`;
  }).join('');
  return `<ul>${list}</ul><p class="note">Sounds follow the animation and come along in the download. Change the weapon and the swing changes its sound.</p>`;
}

let built = '';
function buildPanel() {
  const tab = TABS.find((t) => t.id === state.tab);
  const groups = hero.controls();
  const items = tab.group ? groups.find((g) => g.group === tab.group)?.items ?? [] : [];
  const sig = `${tab.id}|${items.map((i) => i.key).join(',')}|${tab.id === 'sounds' ? `${hero.clip}:${hero.params.weapon}` : tab.id === 'hair' ? `${hero.params.headgear}:${hero.params.hairStyle === 'bald'}` : ''}`;
  $('panel-title').textContent = tab.label;
  $('panel-sub').textContent = tab.id === 'sounds' ? `During ${hero.clips.find((c) => c.name === hero.clip).label.toLowerCase()}` : tab.sub;
  if (sig === built) return;
  built = sig;
  const body = $('panel-body');
  if (tab.id === 'look') body.innerHTML = lookHtml();
  else if (tab.id === 'sounds') body.innerHTML = soundsHtml();
  else body.innerHTML = items.map((i) => controlHtml(i, tab.id === 'body', tab.id)).join('') || '<p class="note">Nothing to change here right now.</p>';
  body.scrollTop = 0;
  lazyPictures(body);
}

/* ---------- keep every small picture, slider and mark in step with the Hero ---------- */
function sync() {
  buildPanel();
  const p = hero.params, changed = hero.changed();
  const changedJson = (over) => JSON.stringify({ ...Object.fromEntries(changed.map((k) => [k, p[k]])), ...over });
  for (const m of document.querySelectorAll('#panel-body lo-sprite')) {
    const next = changedJson(JSON.parse(m.dataset.over ?? '{}'));
    if (m.getAttribute('params') !== next) m.setAttribute('params', next);
    if (!m.hasAttribute('data-fixed-look') && m.getAttribute('look') !== hero.look) m.setAttribute('look', hero.look);
  }
  for (const m of document.querySelectorAll('#film lo-sprite')) {
    const next = changedJson({});
    if (m.getAttribute('params') !== next) m.setAttribute('params', next);
    if (m.getAttribute('look') !== hero.look) m.setAttribute('look', hero.look);
  }
  for (const m of world.querySelectorAll('.bg, .tile')) if ((m.getAttribute('look') ?? 'original') !== hero.look) m.setAttribute('look', hero.look);
  for (const b of document.querySelectorAll('#panel-body [data-value]')) b.setAttribute('aria-pressed', String(String(p[b.dataset.key]).toLowerCase() === b.dataset.value.toLowerCase()));
  for (const b of document.querySelectorAll('#panel-body [data-look]')) b.setAttribute('aria-pressed', String(b.dataset.look === hero.look));
  for (const r of document.querySelectorAll('#panel-body input[type="range"]')) {
    if (document.activeElement !== r || Number(r.value) !== p[r.dataset.key]) r.value = p[r.dataset.key];
    r.style.setProperty('--v', `${((p[r.dataset.key] - r.min) / (r.max - r.min)) * 100}%`);
  }
  for (const c of document.querySelectorAll('#panel-body input[type="color"]')) c.value = p[c.dataset.key];
  for (const b of $('film').children) b.setAttribute('aria-pressed', String(b.dataset.clip === hero.clip));
  for (const t of TABS) {
    const b = $(`tab-${t.id}`);
    b.setAttribute('aria-selected', String(t.id === state.tab));
    b.classList.toggle('changed', t.id === 'look' ? hero.look !== 'original' : changed.some((k) => tabOfKey[k] === t.id));
    if (t.id === 'sounds') b.querySelector('.n').textContent = clipSounds().length || '';
  }
}
hero.addEventListener('change', () => {
  if (!bag.has('knight')) { bag.toggle('knight'); $('remove').textContent = 'Take out of bag'; } // changing it is what puts it in the bag
  sync(); keep(); flashSaved();
});

$('panel-body').addEventListener('click', (e) => {
  const look = e.target.closest('[data-look]');
  if (look) return hero.setLook(look.dataset.look);
  const b = e.target.closest('button[data-key]');
  if (!b) return;
  if (b.hasAttribute('data-toggle')) return hero.set(b.dataset.key, !hero.params[b.dataset.key]);
  hero.set(b.dataset.key, b.dataset.value);
});
$('panel-body').addEventListener('input', (e) => {
  const i = e.target;
  if (!i.dataset.key) return;
  hero.set(i.dataset.key, i.type === 'range' ? Number(i.value) : i.value);
});

/* ---------- top bar ---------- */
const act = { surprise: () => hero.surprise(), reset: () => { hero.reset(); hero.setLook('original'); } };
$('surprise').onclick = act.surprise;
$('reset').onclick = act.reset;
for (const b of document.querySelectorAll('[data-do]')) b.onclick = act[b.dataset.do];
for (const b of $('size').children) {
  b.setAttribute('aria-pressed', String(b.textContent === state.size));
  b.onclick = () => { state.size = b.textContent; for (const x of $('size').children) x.setAttribute('aria-pressed', String(x === b)); keep(); };
}
$('download').onclick = () => {
  const b = $('download');
  b.textContent = `Zipping at ${state.size}`;
  setTimeout(() => { b.textContent = 'Download'; }, 1400);
};
$('copy').onclick = () => { navigator.clipboard?.writeText(location.href).catch(() => {}); $('copy').textContent = 'Link copied'; setTimeout(() => { $('copy').textContent = 'Copy link'; $('more').open = false; }, 900); };
$('remove').onclick = () => { const on = bag.toggle('knight'); $('remove').textContent = on ? 'Take out of bag' : 'Put back in bag'; savedWords(); $('more').open = false; };
document.addEventListener('click', (e) => { if (!e.target.closest('#more')) $('more').open = false; });

if (!bag.has('knight')) $('remove').textContent = 'Put back in bag';
savedWords();
setScene(state.scene);
sync();
