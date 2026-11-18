// One sound: hear it, change it with sliders, download it.
import { el, header, saveBlob, SOUND_BG, cap } from './ui.js';
import { soundParams, randomSoundParams, rendered, playRendered, wavBytes, toUnit, toValue, drawWave } from './audio.js';
import { addToBag, keepBag } from './add-to-bag.js';
import { goesWith, moreLikeThis } from './related.js';
import { madeNote } from './catalog.js';      // W5-A: a sound made on this visit says so, and a draft cannot go in the bag

const INK = '#231b33';
const fmt = (d, v) => {
  const n = Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return d.unit ? `${n} ${d.unit}` : String(n);
};

export function soundPage(app, patch, query) {
  document.title = `${patch.name} · Loadout`;
  const presets = Object.keys(patch.presets ?? {});
  const fromLink = {};
  for (const d of patch.params) if (query[d.id] !== undefined && Number.isFinite(Number(query[d.id]))) fromLink[d.id] = Number(query[d.id]);
  const st = {
    preset: presets.includes(query.style) ? query.style : null,
    p: null, seed: 1, r: null, handle: null,
  };
  st.p = soundParams(patch, st.preset, fromLink);
  st.custom = Object.keys(fromLink).length > 0;

  // ---- wave display
  const wave = el('canvas', { class: 'stage', role: 'img', 'aria-label': `${patch.name} waveform` });
  const wrap = el('div', { class: 'stage-wrap wave-wrap' }, wave);
  const g = wave.getContext('2d');
  let W = 176, H = 72, zoom = 4;
  const fit = () => {
    const cw = wrap.clientWidth;
    if (!cw) return;
    zoom = Math.max(2, Math.min(5, Math.floor(cw / 104)));
    W = Math.floor(cw / zoom);
    wave.width = W; wave.height = H;
    wave.style.width = W * zoom + 'px'; wave.style.height = H * zoom + 'px';
    draw();
  };
  function draw() {
    g.fillStyle = SOUND_BG[patch.category] ?? '#e6e9f2'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(35, 27, 51, 0.12)'; g.fillRect(6, H / 2 - 1, W - 12, 1);
    if (!st.r) return;
    const h = st.handle;
    let played = -1;
    if (h) { const u = (h.now() - h.startedAt) / h.duration; played = Math.floor((h.loop ? u % 1 : Math.min(1, u)) * (W - 12)); }
    drawWave(g, st.r.samples, 6, H / 2, W - 12, H - 16, INK, played, '#5a48e0');
  }

  const playBtn = el('button', { type: 'button', class: 'btn', onclick: () => (st.handle ? stop() : play()) });
  const lengthNote = el('span', { class: 'hint' });
  const syncPlay = () => { playBtn.textContent = st.handle ? 'Stop' : patch.loop ? 'Play loop' : 'Play'; };
  function stop() { if (st.handle) st.handle.stop(); st.handle = null; syncPlay(); draw(); }
  function render() {
    st.r = rendered(patch, st.p, st.seed);
    lengthNote.textContent = patch.loop ? `Loops every ${st.r.duration.toFixed(1)} seconds` : `${st.r.duration.toFixed(2)} seconds long`;
  }
  function play() {
    if (st.handle) st.handle.stop();
    render();
    st.handle = playRendered(st.r, { force: true, loop: !!patch.loop, onended: () => { st.handle = null; syncPlay(); draw(); } });
    syncPlay();
  }
  /** Something changed: redraw, and play it if the person just acted. */
  function changed(andPlay) {
    render(); draw(); syncStyle(); saveUrl();
    if (andPlay) play();
  }

  // ---- styles (named settings)
  const styleBar = el('div', { class: 'pills', role: 'group', 'aria-label': 'Style' },
    el('button', { type: 'button', class: 'pill', 'data-v': '', onclick: () => setStyle(null) }, 'Standard'),
    presets.map((name) => el('button', { type: 'button', class: 'pill', 'data-v': name, onclick: () => setStyle(name) }, name)));
  const syncStyle = () => { for (const b of styleBar.children) b.setAttribute('aria-pressed', String(!st.custom && b.dataset.v === (st.preset ?? ''))); };
  function setStyle(name) { st.preset = name; st.custom = false; st.p = soundParams(patch, name); syncSliders(); changed(true); }

  // ---- sliders
  const sliders = {};
  const fields = patch.params.map((d) => {
    const out = el('span', { class: 'end value' }, fmt(d, st.p[d.id]));
    const input = el('input', { id: `s-${d.id}`, type: 'range', min: 0, max: 1, step: 0.005, value: toUnit(d, st.p[d.id]),
      oninput: (e) => { st.p[d.id] = toValue(d, Number(e.target.value)); st.custom = true; out.textContent = fmt(d, st.p[d.id]); },
      onchange: () => changed(true) });
    sliders[d.id] = () => { input.value = toUnit(d, st.p[d.id]); out.textContent = fmt(d, st.p[d.id]); };
    return el('div', { class: 'field' }, el('label', { for: `s-${d.id}` }, d.label), el('div', { class: 'slider two' }, input, out));
  });
  const syncSliders = () => { for (const k of Object.keys(sliders)) sliders[k](); };

  // ---- link and download
  let urlTimer = 0;
  function link() {
    const q = new URLSearchParams();
    if (st.custom) for (const d of patch.params) q.set(d.id, String(st.p[d.id]));
    else if (st.preset) q.set('style', st.preset);
    const qs = q.toString();
    return `#/sound/${patch.id}${qs ? '?' + qs : ''}`;
  }
  function saveUrl() { clearTimeout(urlTimer); urlTimer = setTimeout(() => history.replaceState(null, '', keepBag(link(), query)), 200); }
  const status = el('p', { class: 'status', role: 'status' });
  const say = (msg) => { status.textContent = msg; };
  function download() {
    render();
    saveBlob(new Blob([wavBytes(st.r)], { type: 'audio/wav' }), `${patch.id}.wav`);
    say(`Downloaded ${patch.id}.wav. It works in Unity, Godot and any other game tool.`);
  }
  async function copyLink() {
    clearTimeout(urlTimer);
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}${link()}`); say('Link copied. Anyone who opens it hears this exact sound.'); }
    catch { say('Copy the address in your browser bar to share this exact sound.'); }
  }

  if (Number(query.seed) >= 1) st.seed = Math.round(Number(query.seed));   // a variation opened from the bag
  const made = madeNote(patch.id);
  const bagBox = made?.draft ? null : addToBag('sound', patch.id, () => ({ params: { ...st.p }, style: st.preset, seed: st.seed }), query);
  render(); syncPlay(); syncStyle();
  app.replaceChildren(
    header('sounds'),
    el('main', { class: 'editor' },
      el('div', { class: 'left' },
        el('div', { class: 'title-row' }, el('h1', {}, patch.name), el('p', { class: 'blurb' }, patch.description ?? '')),
        made ? el('p', { class: 'hint made-here' }, made.text) : null,
        el('div', { class: 'stage-card' }, wrap, el('div', { class: 'stage-tools' }, el('div', { class: 'tools-left' }, playBtn, lengthNote),
          el('button', { type: 'button', class: 'ghost', onclick: () => { st.seed = 1 + Math.floor(Math.random() * 9999); changed(true); } }, 'Play a variation'))),
        el('div', { class: 'under' }, el('span', { class: 'label' }, 'Style'), styleBar),
        goesWith(patch.id)),      // the sprites that use it and the bundles it is in, from the catalogue
      el('div', { class: 'panel' },
        el('div', { class: 'panel-actions' },
          el('button', { type: 'button', class: 'btn', onclick: () => { st.p = soundParams(patch, null, randomSoundParams(patch)); st.custom = true; syncSliders(); changed(true); } }, 'Surprise me'),
          el('button', { type: 'button', class: 'ghost', onclick: () => setStyle(null) }, 'Start over')),
        el('section', { class: 'group' }, el('h2', {}, cap(patch.category) + ' sound'), fields)),
      el('div', { class: 'get' },
        bagBox,
        el('button', { type: 'button', class: 'btn big', onclick: download }, 'Download sound'),
        el('button', { type: 'button', class: 'ghost', onclick: copyLink }, 'Copy link'),
        status),
      moreLikeThis(patch.id)));

  const ro = new ResizeObserver(fit);
  ro.observe(wrap);
  fit();
  let raf = 0;
  const loop = () => { if (st.handle) draw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); clearTimeout(urlTimer); if (st.handle) st.handle.stop(); };
}
