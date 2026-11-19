// Playroom remix page: the picture stays put, a dock of tabs holds every control, changes keep themselves.
import { loadCatalog, looks, icon, esc, bag, word, toneOf, TYPE_WORD, KITS, frameURL, controlHTML, bindControls, syncControls, bindPlay } from './app.js';

const { assets, bundles } = await loadCatalog();
const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
const $ = (s) => document.querySelector(s);
const want = new URLSearchParams(location.search).get('sprite');
const A = byId[want]?.kind === 'sprite' ? byId[want] : byId.knight;

// ---------------------------------------------------------------- the page around the picture
document.title = `${A.name}: Loadout`;
$('#name').textContent = A.name;
$('#blurb').textContent = A.description;
$('#alike').href = `library.html?q=${encodeURIComponent(TYPE_WORD[A.type].toLowerCase())}`;
const stage = $('#stage'), hero = $('#hero'), backdrop = $('#backdrop'), ground = $('#ground'), floor = $('#floor'), podium = $('#podium');
stage.dataset.tone = toneOf(A) === 'mist' ? 'dusk' : toneOf(A);
if (A.type === 'background') hero.setAttribute('layers', '');
hero.setAttribute('sprite', A.id);
await hero.ready;
const def = hero.def, [FW, FH] = def.size, [PX, PY] = A.tech.pivot;

const mine = bundles.filter((b) => A.bundles.includes(b.id));
$('#kits').hidden = !mine.length;
$('#kits-say').textContent = mine.length === 1 ? 'In 1 kit' : `In ${mine.length} kits`;
$('#kits-list').innerHTML = `<p>${esc(A.name)} is part of</p>` + mine.map((b) => `<a href="library.html#kits">${esc(KITS[b.id]?.name ?? b.name)}</a>`).join('');

// ---------------------------------------------------------------- what is kept
const state = { cat: 0, look: 'original', scene: false, size: 1, sig: '' };
const hash = new URLSearchParams(location.hash.slice(1));
const kept = bag.get(A.id);
let touched = false;
try {
  if (hash.get('p')) { hero.setParams(JSON.parse(hash.get('p'))); state.look = hash.get('look') || 'original'; touched = true; }
  else if (kept?.params) { hero.setParams(kept.params); state.look = kept.look || 'original'; }
} catch { /* a broken link opens the Hero as it comes */ }
if (state.look !== 'original') hero.setLook(state.look);

const saved = $('#saved');
let saveTimer = 0;
function say(mode) {
  saved.className = `saved ${mode === 'saved' ? 'on' : ''}`;
  saved.innerHTML = mode === 'saved' ? `${icon('check')}Saved in your bag` : mode === 'saving' ? 'Saving…' : '<span class="long">Changes are kept in your bag</span><span class="short">Saves to your bag</span>';
}
function keep() {
  const params = Object.fromEntries(hero.changed().map((k) => [k, hero.params[k]]));
  bag.put(A.id, { name: A.name, params, look: state.look, changes: hero.changed().length + (state.look !== 'original' ? 1 : 0) });
  say('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => say('saved'), 450);
}
say(kept ? 'saved' : 'idle');
if (touched) keep();

// ---------------------------------------------------------------- the picture
const SCENE = ['background', 'tileset', 'ui', 'icon'].includes(A.type) ? null : A.view === 'side' ? { bg: 'bg-forest', ground: ['tiles-forest', 'grass-top'] }
  : A.view === 'top-down' ? { floor: toneOf(A) === 'teal' ? ['tiles-station-floor', 'floor-fill'] : ['tiles-meadow', 'grass-fill'] } : null;
$('#scene').hidden = !SCENE;
if (SCENE?.bg) { backdrop.setAttribute('layers', ''); backdrop.setAttribute('sprite', SCENE.bg); }

const place = (el, x, y, w, h) => { el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.width = `${w}px`; el.style.height = `${h}px`; };
function layout() {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  const room = H < 320 ? 16 : 64;
  const k = Math.max(1, Math.min(12, Math.floor(Math.min((W - 32) / FW, (H - room) / FH))));
  const inScene = state.scene && SCENE;
  backdrop.hidden = !(inScene && SCENE.bg); ground.hidden = !(inScene && SCENE.ground); floor.hidden = !(inScene && SCENE.floor);
  podium.hidden = inScene || !A.tech.grounded;
  if (!inScene) {
    const x = Math.round((W - FW * k) / 2);
    // centred, but the feet stay clear of the buttons along the bottom of the picture
    const y = Math.min(Math.round((H - FH * k) / 2), A.tech.grounded ? H - 58 - (PY + 2) * k : Infinity);
    place(hero, x, y, FW * k, FH * k);
    const pw = Math.min(FW * 0.5, 40) * k, ph = pw * 0.16;
    place(podium, x + (PX + 2) * k - pw / 2, y + PY * k - ph / 2, pw, ph);
    return;
  }
  let s = Math.max(2, Math.ceil(k / 2));
  if (SCENE.bg) {
    while (320 * s < W || 208 * s < H) s++;
    const gy = H - 32 * s;
    place(backdrop, Math.round((W - 320 * s) / 2), gy - 176 * s, 320 * s, 180 * s);
    ground.style.height = `${32 * s}px`; ground.style.backgroundSize = `${32 * s}px ${32 * s}px`;
    ground.style.backgroundPositionX = `${Math.round(W / 2)}px`;
    place(hero, Math.round(W / 2 - PX * s), gy + s - PY * s, FW * s, FH * s);
  } else {
    floor.style.backgroundSize = `${32 * s}px ${32 * s}px`;
    floor.style.backgroundPosition = `${Math.round(W / 2)}px ${Math.round(H / 2)}px`;
    place(hero, Math.round(W / 2 - FW * s / 2), Math.round(H / 2 - FH * s / 2), FW * s, FH * s);
  }
}
async function paintScene() {
  if (!SCENE) return;
  if (SCENE.bg) backdrop.setAttribute('look', state.look);
  if (SCENE.ground) ground.style.backgroundImage = `url(${await frameURL(...SCENE.ground, state.look)})`;
  if (SCENE.floor) floor.style.backgroundImage = `url(${await frameURL(...SCENE.floor, state.look)})`;
}
new ResizeObserver(layout).observe(stage);
layout();

$('#scene').addEventListener('click', async (e) => {
  state.scene = !state.scene;
  e.currentTarget.setAttribute('aria-checked', String(state.scene));
  if (state.scene) await paintScene();
  layout();
});

// animations: a row of chips right under the picture
const clips = $('#clips');
function drawClips() {
  clips.innerHTML = hero.clips.map((c) => `<button type="button" class="chip" data-clip="${c.name}" aria-pressed="${c.name === hero.clip}">${esc(c.label.replace(/_/g, ' '))}</button>`).join('');
}
drawClips();
clips.addEventListener('click', (e) => {
  const b = e.target.closest('[data-clip]');
  if (!b) return;
  clipOnly = true; hero.setClip(b.dataset.clip);
  for (const x of clips.children) x.setAttribute('aria-pressed', String(x === b));
  b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
let playing = true;
$('#playpause').addEventListener('click', (e) => {
  playing = !playing;
  playing ? hero.play() : hero.pause();
  e.currentTarget.innerHTML = icon(playing ? 'pause' : 'play');
  e.currentTarget.setAttribute('aria-label', playing ? 'Pause the animation' : 'Play the animation');
});

// ---------------------------------------------------------------- the dock
const tabs = $('#tabs'), panel = $('#panel');
const CAT_WORD = { Look: ['character', 'creature'].includes(A.type) ? 'Body' : 'Shape', Colors: 'Colours' };
// where to look, per part of the Hero: zoom and the art pixel to centre on (other sprites show the whole frame)
const CROPS = A.id === 'knight' ? {
  hairStyle: { k: 3, cx: 28, cy: 29, extra: { headgear: 'none' } }, headgear: { k: 3, cx: 28, cy: 27 },
  weapon: { k: 2, cx: 31, cy: 38 }, cape: { k: 2, cx: 25, cy: 39 },
} : {};
const wholeCrop = () => ({ k: Math.max(1, Math.floor(84 / Math.max(FW, FH))), cx: FW / 2, cy: FH / 2 });
const SHOWN_LOOKS = ['original', 'sunset', 'frost', 'night', 'candy', 'handheld'];
const hasSounds = Object.keys(def.sounds ?? {}).length > 0;

function cats() {
  const list = hero.controls().map((g) => ({ id: g.group, label: CAT_WORD[g.group] ?? word(g.group), items: g.items, part: g.part }));
  if (hasSounds) list.push({ id: 'Sounds', label: 'Sounds', items: [] });
  return list;
}

function soundsHTML() {
  const clip = hero.clip, c = def.clips[clip], label = hero.clips.find((x) => x.name === clip).label;
  const cues = (def.sounds?.[clip] ?? []).filter((q) => !q.when || Object.entries(q.when).every(([k, vs]) => vs.includes(hero.params[k])));
  const k = Math.max(1, Math.floor(64 / Math.max(FW, FH)));
  const frames = `<ol class="frames" aria-label="The ${c.frames} pictures of ${esc(label)}">${Array.from({ length: c.frames }, (_, i) =>
    `<li class="${cues.some((q) => q.frame === i) ? 'hit' : ''}"><span class="frame-win"><lo-sprite sprite="${A.id}" clip="${clip}" paused frame="${i}" data-framepic style="width:${FW * k}px;height:${FH * k}px" params='${esc(JSON.stringify(hero.params))}' look="${state.look}"></lo-sprite></span><i></i></li>`).join('')}</ol>`;
  if (!cues.length) return `${frames}<p class="note">${esc(label)} is silent for now. Choose another animation under the picture, such as ${esc(hero.clips.find((x) => def.sounds?.[x.name]?.length)?.label ?? 'Walk')}, to see its sounds.</p>`;
  return `${frames}<ul class="cues">${cues.map((q) => {
    const s = byId[q.sound];
    return `<li class="cue-row"><button type="button" class="play" data-seconds="${s?.tech.seconds ?? 0.5}" aria-pressed="false" aria-label="Play ${esc(s?.name ?? q.sound)}">${icon('play')}</button>
      <span><b>${esc(s?.name ?? q.sound)}</b><small>${esc(q.preset ?? 'Standard')} style</small></span>
      <span class="cue-when">on picture ${q.frame + 1}</span></li>`;
  }).join('')}</ul>`;
}

function drawLooks() {
  const c = CROPS.weapon ?? wholeCrop();
  $('#look-say').textContent = `Look: ${looks.find((x) => x.id === state.look).name}`;
  $('#look-list').innerHTML = `<div class="pics" style="--n:3">${SHOWN_LOOKS.map((id) => {
    const l = looks.find((x) => x.id === id);
    return `<button type="button" class="pic" data-look="${id}" aria-pressed="${state.look === id}" title="${esc(l.blurb ?? '')}">
      <span class="pic-win"><lo-sprite sprite="${A.id}" paused look="${id}" data-lookpic params='${esc(JSON.stringify(hero.params))}'
        style="width:${FW * c.k}px;height:${FH * c.k}px;margin:${-c.cy * c.k}px 0 0 ${-c.cx * c.k}px"></lo-sprite></span>${esc(l.name)}</button>`;
  }).join('')}</div><p class="small quiet">6 of the 14 looks. A look restyles a whole kit the same way.</p>`;
}
drawLooks();
$('#look').addEventListener('toggle', (e) => { if (e.target.open) for (const p of document.querySelectorAll('[data-lookpic]')) p.setAttribute('params', JSON.stringify(hero.params)); });
$('#look-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-look]');
  if (!b) return;
  state.look = b.dataset.look;
  hero.setLook(state.look);
  for (const x of document.querySelectorAll('#look-list [data-look]')) x.setAttribute('aria-pressed', String(x === b));
  $('#look-say').textContent = `Look: ${looks.find((x) => x.id === state.look).name}`;
  if (state.scene) paintScene();
});

function drawDock(force = false) {
  const list = cats();
  state.cat = Math.min(state.cat, list.length - 1);
  const cur = list[state.cat];
  const sig = `${list.map((c) => c.id).join()}|${cur.id}|${cur.items.map((it) => it.key).join()}|${cur.id === 'Sounds' ? hero.clip + JSON.stringify(hero.params) : ''}`;
  if (!force && sig === state.sig) {
    syncControls(panel, hero.params);
    return;
  }
  state.sig = sig;
  tabs.innerHTML = list.map((c, i) => `<button type="button" class="dock-tab" role="tab" data-cat="${i}" aria-selected="${i === state.cat}">${esc(c.label)}</button>`).join('');
  tabs.children[state.cat].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  moreTabs();
  const body = cur.id === 'Sounds' ? soundsHTML() : cur.items.map((it) => controlHTML(it, {
    label: it.isSelector ? '' : word(it.label),
    pics: it.kind === 'choice' && it.options.length <= 6 ? { sprite: A.id, clip: def.clips.idle ? 'idle' : '', params: hero.params, w: FW, h: FH, ...(CROPS[it.key] ?? wholeCrop()) } : null,
  })).join('');
  panel.innerHTML = cur.id === 'Sounds' ? `<h2>Sounds for ${esc(hero.clips.find((x) => x.name === hero.clip).label)}</h2>${body}` : body || '<p class="note">Nothing to change here.</p>';
  panel.setAttribute('aria-label', cur.label);
  panel.scrollTop = 0;
  $('#next-name').textContent = list[state.cat + 1] ? `: ${list[state.cat + 1].label}` : '';
  $('#back').disabled = state.cat === 0;
  $('#next').disabled = state.cat === list.length - 1;
}
const moreTabs = () => tabs.classList.toggle('more', tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 8);
tabs.addEventListener('scroll', moreTabs, { passive: true });
drawDock(true);
bindControls(panel, (key, value) => hero.set(key, value));
bindPlay(panel);
tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { state.cat = Number(b.dataset.cat); drawDock(true); tabs.children[state.cat].focus(); } });
$('#back').addEventListener('click', () => { state.cat = Math.max(0, state.cat - 1); drawDock(true); });
$('#next').addEventListener('click', () => { state.cat += 1; drawDock(true); });

// every change: redraw what depends on it, and keep it. Changing only the animation keeps nothing new.
let clipOnly = false;
hero.addEventListener('change', () => {
  drawDock();
  if (clipOnly) { clipOnly = false; return; }
  keep();
});

$('#surprise').addEventListener('click', () => hero.surprise());
$('#reset').addEventListener('click', () => { state.look = 'original'; hero.setLook('original'); hero.reset(); drawLooks(); if (state.scene) paintScene(); });

// ---------------------------------------------------------------- download and the small menu
const sizeSay = () => { $('#size-say').textContent = `${FW * state.size} × ${FH * state.size} pixels`; };
sizeSay();
$('#size').addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]');
  if (!b) return;
  state.size = Number(b.dataset.size);
  for (const x of $('#size').children) x.setAttribute('aria-pressed', String(x === b));
  sizeSay();
});
const dl = $('#download');
dl.addEventListener('click', () => {
  const was = dl.innerHTML;
  dl.innerHTML = `${icon('check')}Zip ready`;
  setTimeout(() => { dl.innerHTML = was; }, 1800);
});
$('#copy').addEventListener('click', async (e) => {
  const params = Object.fromEntries(hero.changed().map((k) => [k, hero.params[k]]));
  const link = `${location.origin}${location.pathname}${location.search}#p=${encodeURIComponent(JSON.stringify(params))}${state.look !== 'original' ? `&look=${state.look}` : ''}`;
  try { await navigator.clipboard.writeText(link); } catch { /* no clipboard here: the mock-up still says what would happen */ }
  e.currentTarget.querySelector('span').textContent = 'Link copied';
});
