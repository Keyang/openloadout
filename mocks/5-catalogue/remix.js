// Catalogue (design 5): the page for one asset, shown with the Hero. Mock-up only.
import { loadCatalog, looks, bag, HERO_VERSIONS, ICON, frameURL, playMock, seconds, warm } from './common.js';

const $ = (s) => document.querySelector(s);
const hero = $('#hero');
await hero.ready;
const { assets } = await loadCatalog();
const byId = new Map(assets.map((a) => [a.id, a]));

/* ---------- what is kept (in this browser), so nothing has to be saved by hand ---------- */
const KEY = 'lo5-hero';
const kept = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const view = { tab: 'shape', scene: kept.scene ?? 'plain', px: kept.px ?? 2, touched: !!kept.params };
const wanted = new URLSearchParams(location.search).get('v');
const fromLink = HERO_VERSIONS.find((v) => v.id === wanted);
if (fromLink) { hero.setParams(fromLink.params); view.touched = true; }
else if (kept.params) hero.setParams(kept.params);
if (kept.look) hero.setLook(kept.look);
if (kept.clip) hero.setClip(kept.clip);

const changedParams = () => Object.fromEntries(hero.changed().map((k) => [k, hero.params[k]]));
let saveTimer;
function keep() {
  const n = hero.changed().length + (hero.look !== 'original' ? 1 : 0);
  try { localStorage.setItem(KEY, JSON.stringify({ params: changedParams(), look: hero.look, clip: hero.clip, scene: view.scene, px: view.px })); } catch { /* private window */ }
  if (!view.touched) return;
  bag.add('knight', n ? `${n} ${n === 1 ? 'change' : 'changes'}` : null);
  const box = $('#saved');
  box.classList.remove('is-idle'); box.classList.add('is-saving'); $('#saved-text').textContent = 'Saving';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { box.classList.remove('is-saving'); $('#saved-text').textContent = 'Saved in your bag'; $('#saved-n').textContent = n ? `${n} ${n === 1 ? 'change' : 'changes'}` : 'as the original'; }, 350);
}
const touch = () => { view.touched = true; };

/* ---------- the stage: whole-number zoom that fits, plain shelf or a forest scene ---------- */
const stage = $('#stage'), art = $('#art'), bg = art.querySelector('.stage-bg'), ground = $('#ground'), shelf = $('#shelf');
frameURL('tiles-forest', 'grass-top').then((u) => { ground.style.backgroundImage = `url(${u})`; });
function fit() {
  const w = art.clientWidth, h = art.clientHeight;
  if (!w || !h) return;
  const plain = Math.max(2, Math.min(8, Math.floor(Math.min((w - 16) / 52, (h - 56) / 46))));
  const scene = view.scene === 'forest';
  const s = scene ? Math.max(2, Math.ceil(w / 320), Math.ceil((h - 16) / 180)) : plain;
  hero.style.width = hero.style.height = `${64 * s}px`;
  hero.style.left = `${Math.round(w / 2 - 30 * s)}px`;
  if (scene) {
    const gh = 20 * s;
    bg.style.cssText = `width:${320 * s}px;height:${180 * s}px;left:${Math.round((w - 320 * s) / 2)}px;bottom:${gh - 4 * s}px`;
    ground.style.height = `${gh}px`; ground.style.backgroundSize = `${32 * s}px ${32 * s}px`;
    ground.style.backgroundPosition = `${Math.round(w / 2)}px 0`;
    hero.style.top = `${h - gh - 58 * s + 2 * s}px`;
  } else {
    const top = Math.round((h + 28) / 2 - 39 * s);
    hero.style.top = `${top}px`;
    shelf.style.cssText = `left:${Math.round(w / 2 - 22 * s)}px;width:${44 * s}px;top:${top + 59 * s}px`;
  }
}
new ResizeObserver(fit).observe(art);
function setScene(name) {
  view.scene = name; stage.dataset.scene = name;
  for (const b of document.querySelectorAll('[data-scene]')) if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', b.dataset.scene === name);
  fit();
}
document.querySelector('.stage-tools .seg').addEventListener('click', (e) => { const b = e.target.closest('[data-scene]'); if (b) { setScene(b.dataset.scene); keep(); } });
setScene(view.scene);

const pp = $('#playpause');
const paintPlay = () => { const paused = hero.hasAttribute('paused'); pp.innerHTML = paused ? ICON.play : ICON.pause; pp.setAttribute('aria-label', paused ? 'Play the animation' : 'Pause the animation'); pp.setAttribute('aria-pressed', paused); };
pp.addEventListener('click', () => { hero.hasAttribute('paused') ? hero.play() : hero.pause(); paintPlay(); });
paintPlay();

/* ---------- animations ---------- */
const clips = $('#clips');
clips.innerHTML = hero.clips.map((c) => `<button type="button" class="chip" role="radio" data-clip="${c.name}">${c.label}</button>`).join('');
clips.addEventListener('click', (e) => { const b = e.target.closest('[data-clip]'); if (b) hero.setClip(b.dataset.clip); });
const paintClips = () => { for (const b of clips.children) b.setAttribute('aria-checked', b.dataset.clip === hero.clip); };

/* ---------- start from a version ---------- */
const vstrip = $('#versions');
vstrip.innerHTML = HERO_VERSIONS.map((v) => `<button type="button" class="vbtn" data-v="${v.id}" aria-pressed="false">
  <span class="hv tile"><lo-sprite sprite="knight" clip="idle" hover params='${JSON.stringify(v.params)}'></lo-sprite></span><span class="name">${v.name}</span></button>`).join('');
const same = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };
const versionParams = new Map();   // what each version looks like once the engine has cleaned it
vstrip.addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  touch(); hero.reset(); hero.setParams(HERO_VERSIONS.find((v) => v.id === b.dataset.v).params);
  versionParams.set(b.dataset.v, changedParams());
});
function paintVersions() {
  const now = changedParams();
  let name = null;
  for (const b of vstrip.children) {
    const v = HERO_VERSIONS.find((x) => x.id === b.dataset.v);
    const on = same(now, versionParams.get(v.id) ?? v.params);
    b.setAttribute('aria-pressed', on);
    if (on) name = v.name;
  }
  document.querySelector('.block-head .hint').textContent = name ? `${name}. One click sets everything.` : 'Your own mix. One click sets everything.';
}
$('#surprise').addEventListener('click', () => { touch(); hero.surprise(); });
$('#startover').addEventListener('click', () => { touch(); hero.setLook('original'); hero.reset(); });

/* ---------- fine-tune: every control of the Hero, in six tabs that each fit the panel ---------- */
const TABS = [['shape', 'Shape'], ['parts', 'Parts'], ['colours', 'Colours'], ['motion', 'Motion'], ['sounds', 'Sounds'], ['look', 'Look']];
const tabOf = (g, it) => (it.kind === 'color' ? 'colours' : g.part ? 'parts' : g.group === 'Motion' ? 'motion' : 'shape');
const COLOUR_LABEL = { hair: 'Hair', skin: 'Skin', outfit: 'Outfit', trim: 'Cape and trim', metal: 'Metal' };
const pane = $('#pane'), tabs = $('#tabs');
tabs.addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { view.tab = t.dataset.tab; paint(true); } });

function controlHTML(it, label, main = false) {
  let body;
  if (it.kind === 'range') {
    body = `<span class="slide"><span class="lo">${it.lo ?? ''}</span><input type="range" data-key="${it.key}" min="${it.min}" max="${it.max}" step="${it.step}" value="${it.value}" aria-label="${label}, from ${it.lo} to ${it.hi}"><span class="hi">${it.hi ?? ''}</span></span>`;
  } else if (it.kind === 'choice') {
    body = `<span class="chips" role="radiogroup" aria-label="${label}">${it.options.map((o) => `<button type="button" class="chip" role="radio" data-key="${it.key}" data-v="${o.value}" aria-checked="${o.value === it.value}">${o.label}</button>`).join('')}</span>`;
  } else if (it.kind === 'color') {
    body = `<span class="swatches" role="radiogroup" aria-label="${label}">${it.swatches.map((c, i) => `<button type="button" class="swatch" role="radio" data-key="${it.key}" data-v="${c}" style="--c:${c}" aria-checked="${c === it.value}" aria-label="${label} colour ${i + 1}"></button>`).join('')}</span>`;
  } else {
    body = `<button type="button" class="switch" role="switch" data-key="${it.key}" aria-checked="${!!it.value}" aria-label="${label}"></button>`;
  }
  return `<div class="ctl${main ? ' is-main' : ''}${it.value !== it.def ? ' is-changed' : ''}" data-ctl="${it.key}">
    <span class="ctl-label"><span>${label}</span><span class="dot" title="Changed"></span></span>${body}
    <button type="button" class="reset" data-reset="${it.key}" aria-label="Put ${label} back">Reset</button></div>`;
}
function soundsHTML() {
  const clip = hero.clips.find((c) => c.name === hero.clip);
  const all = (hero.def.sounds?.[hero.clip] ?? []).filter((s) => !s.when || Object.entries(s.when).every(([k, vals]) => vals.includes(hero.params[k])));
  const rows = new Map();
  for (const s of all) { const k = `${s.sound}|${s.preset}`; rows.has(k) ? rows.get(k).frames.push(s.frame) : rows.set(k, { ...s, frames: [s.frame] }); }
  if (!rows.size) return `<p class="pane-note">${clip.label} is silent. Pick Walk, Jump or Attack on the left to see the sounds that play with it.</p>`;
  return `<p class="pane-note">These play with ${clip.label}, on the frames marked. They come along when you download.</p><ul class="srows sounds">${[...rows.values()].map((s) => {
    const a = byId.get(s.sound);
    return `<li class="srow" data-id="${s.sound}">
      <button type="button" class="play" aria-label="Play ${a.name}" aria-pressed="false">${ICON.play}</button>
      <span><span class="name">${a.name}</span><br><span class="what">${s.preset} style, ${seconds(a.tech.seconds)}</span></span>
      <span class="ruler-wrap"><span class="ruler" role="img" aria-label="Plays on frame ${s.frames.map((f) => f + 1).join(' and ')} of ${clip.frames}">${Array.from({ length: clip.frames }, (_, f) => `<i class="${s.frames.includes(f) ? 'on' : ''}"></i>`).join('')}</span><span>Frame ${s.frames.map((f) => f + 1).join(' and ')} of ${clip.frames}</span></span>
      <span class="progress" aria-hidden="true"></span></li>`;
  }).join('')}</ul>`;
}
const LOOKS = looks;   // all 14 fit
function looksHTML() {
  const p = JSON.stringify(changedParams());
  return `<p class="pane-note">A look recolours the Hero in one go. The same 14 looks work on a whole kit.</p><div class="looks">${LOOKS.map((l) => `<button type="button" class="vbtn" data-look="${l.id}" aria-pressed="${hero.look === l.id}" title="${l.blurb ?? ''}">
    <span class="hv tile"><lo-sprite sprite="knight" clip="idle" paused look="${l.id}" params='${p}'></lo-sprite></span><span class="name">${l.name}</span></button>`).join('')}</div>`;
}
let shape = '';
function paint(force = false) {
  const groups = hero.controls();
  const dots = new Set();
  for (const g of groups) for (const it of g.items) if (it.value !== it.def) dots.add(tabOf(g, it));
  if (hero.look !== 'original') dots.add('look');
  tabs.innerHTML = TABS.map(([id, label]) => `<button type="button" class="tab" role="tab" data-tab="${id}" aria-selected="${view.tab === id}">${label}${dots.has(id) ? '<span class="dot" title="Something here is changed"></span>' : ''}</button>`).join('');

  // rebuild the pane only when what it shows has changed shape (so a slider being dragged is left alone)
  const items = groups.flatMap((g) => g.items.filter((it) => tabOf(g, it) === view.tab).map((it) => [g, it]));
  const sig = view.tab === 'sounds' ? `s|${hero.clip}|${hero.params.weapon}` : view.tab === 'look' ? `l|${JSON.stringify(changedParams())}|${hero.look}` : `${view.tab}|${items.map(([, it]) => `${it.key}${it.kind === 'range' ? '' : `=${it.value}`}`).join(',')}`;
  if (force || sig !== shape) {
    shape = sig;
    if (view.tab === 'sounds') pane.innerHTML = soundsHTML();
    else if (view.tab === 'look') pane.innerHTML = looksHTML();
    else if (view.tab === 'parts') {
      pane.innerHTML = `<div class="parts">${groups.filter((g) => g.part).map((g) => `<div class="part">${g.items.filter((it) => it.kind !== 'color').map((it) => controlHTML(it, it.isSelector ? g.group : it.label, it.isSelector)).join('')}</div>`).join('')}</div>`;
    } else pane.innerHTML = items.map(([g, it]) => controlHTML(it, view.tab === 'colours' ? (COLOUR_LABEL[it.key] ?? it.label) : it.label)).join('');
  }
  for (const [, it] of items) {
    const row = pane.querySelector(`[data-ctl="${it.key}"]`);
    if (!row) continue;
    row.classList.toggle('is-changed', it.value !== it.def);
    const r = row.querySelector('input[type=range]');
    if (r) { if (document.activeElement !== r) r.value = it.value; r.style.setProperty('--p', `${((it.value - it.min) / (it.max - it.min)) * 100}%`); }
  }
}
pane.addEventListener('input', (e) => { const r = e.target.closest('input[type=range]'); if (r) { touch(); hero.set(r.dataset.key, Number(r.value)); } });
pane.addEventListener('click', (e) => {
  const reset = e.target.closest('[data-reset]'), pick = e.target.closest('[data-key][data-v]'), look = e.target.closest('[data-look]'), play = e.target.closest('.play'), sw = e.target.closest('.switch[data-key]');
  if (reset) { touch(); hero.set(reset.dataset.reset, hero.def.params[reset.dataset.reset].def); }
  else if (pick) { touch(); hero.set(pick.dataset.key, pick.dataset.v); }
  else if (sw) { touch(); hero.set(sw.dataset.key, sw.getAttribute('aria-checked') !== 'true'); }
  else if (look) { touch(); hero.setLook(look.dataset.look); }
  else if (play) { const row = play.closest('.srow'); playMock(play, row.querySelector('.progress'), byId.get(row.dataset.id).tech.seconds); }
});

/* ---------- pixel size, download, copy link ---------- */
const paintPx = () => { for (const b of $('#px').children) b.setAttribute('aria-pressed', Number(b.dataset.px) === view.px); $('#px-out').textContent = `${64 * view.px} × ${64 * view.px}`; };
$('#px').addEventListener('click', (e) => { const b = e.target.closest('[data-px]'); if (b) { view.px = Number(b.dataset.px); paintPx(); keep(); } });
paintPx();
$('#download').addEventListener('click', (e) => { const b = e.currentTarget; b.textContent = 'Packed as hero.zip'; setTimeout(() => { b.textContent = 'Download'; }, 1600); });
$('#copy').addEventListener('click', (e) => { const b = e.currentTarget; b.textContent = 'Link copied'; setTimeout(() => { b.textContent = 'Copy link'; }, 1400); });

hero.addEventListener('change', () => { paintClips(); paintVersions(); paint(); keep(); });
paintClips(); paintVersions(); paint(true);
if (view.touched) keep();
if (bag.has('knight') && !view.touched) { $('#saved').classList.remove('is-idle'); $('#saved-text').textContent = 'In your bag'; }
warm(['knight']);
