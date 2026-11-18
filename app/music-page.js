// One music track: play it live, move its sliders while it plays, download it.
import { kits } from '../kits/index.js';
import { el, header, saveBlob } from './ui.js';
import { soundParams, randomSoundParams, renderAsync, playRendered, playLive, wavBytes, toUnit, toValue, isChoice, choicesOf, lengthOf } from './audio.js';
import { addToBag, keepBag } from './add-to-bag.js';

const fmt = (d, v) => {
  const n = Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return d.unit ? `${n} ${d.unit}` : String(n);
};

export function musicPage(app, patch, query) {
  document.title = `${patch.name} · Loadout`;
  const presets = Object.keys(patch.presets ?? {});
  const fromLink = {};
  for (const d of patch.params) if (query[d.id] !== undefined && Number.isFinite(Number(query[d.id]))) fromLink[d.id] = Number(query[d.id]);
  const st = {
    preset: presets.includes(query.style) ? query.style : null,
    custom: patch.params.some((d) => !isChoice(d) && fromLink[d.id] !== undefined),
    p: null, voice: null, starting: false, gone: false,
  };
  st.p = soundParams(patch, st.preset, fromLink);

  const status = el('p', { class: 'status', role: 'status' });
  const say = (msg) => { status.textContent = msg; };

  const lengthNote = el('span', { class: 'hint' });
  // Length choices are shown in seconds at the current tempo, which is what a non-musician can judge.
  const lengthLabels = [];
  const syncLength = () => {
    lengthNote.textContent = `${Math.round(lengthOf(patch, st.p))} seconds long, then it repeats.`;
    for (const [d, value, btn] of lengthLabels) btn.textContent = `${Math.round(lengthOf(patch, { ...st.p, [d.id]: value }))} seconds`;
  };

  // ---- playing: live, so sliders are heard at once
  const playBtn = el('button', { type: 'button', class: 'btn', onclick: () => (st.voice || st.starting ? stop() : play()) });
  const syncPlay = () => { playBtn.textContent = st.starting ? 'Starting…' : st.voice ? 'Stop' : 'Play'; };
  function stop() { st.starting = false; if (st.voice) st.voice.stop(); st.voice = null; syncPlay(); }
  async function play() {
    st.starting = true; syncPlay();
    try {
      const voice = await playLive(patch, { ...st.p });
      if (st.gone || !st.starting) { voice.stop(); return; }
      st.voice = voice;
    } catch (e) {
      // no live audio in this browser: fall back to the rendered loop
      try {
        const r = await renderAsync(patch, { ...st.p });
        if (st.gone || !st.starting) return;
        const h = playRendered(r, { force: true, loop: true });
        st.voice = { set() {}, stop: () => h && h.stop() };
        say('This browser cannot change the music while it plays. Press Stop and Play again to hear a change.');
      } catch (e2) { say(`The music could not start: ${e2.message}.`); }
    }
    st.starting = false; syncPlay();
  }
  const push = (id) => { if (st.voice) st.voice.set(id, st.p[id]); };
  const pushAll = () => { for (const d of patch.params) push(d.id); };

  // ---- styles
  const styleBar = el('div', { class: 'pills', role: 'group', 'aria-label': 'Style' },
    el('button', { type: 'button', class: 'pill', 'data-v': '', onclick: () => setStyle(null) }, 'Standard'),
    presets.map((name) => el('button', { type: 'button', class: 'pill', 'data-v': name, onclick: () => setStyle(name) }, name)));
  const syncStyle = () => { for (const b of styleBar.children) b.setAttribute('aria-pressed', String(!st.custom && b.dataset.v === (st.preset ?? ''))); };
  // a style changes the sliders but keeps the choices already made (length, instrument)
  const choicesNow = () => Object.fromEntries(patch.params.filter(isChoice).map((d) => [d.id, st.p[d.id]]));
  function setStyle(name, keep = true) { st.preset = name; st.custom = false; st.p = soundParams(patch, name, keep ? choicesNow() : null); syncSliders(); pushAll(); changed(); }
  function changed() { syncStyle(); syncLength(); saveUrl(); }

  // ---- sliders
  const sliders = {};
  const sliderField = (d) => {
    const out = el('span', { class: 'end value' }, fmt(d, st.p[d.id]));
    const input = el('input', { id: `m-${d.id}`, type: 'range', min: 0, max: 1, step: 0.005, value: toUnit(d, st.p[d.id]),
      oninput: (e) => { st.p[d.id] = toValue(d, Number(e.target.value)); st.custom = true; out.textContent = fmt(d, st.p[d.id]); push(d.id); },
      onchange: () => changed() });
    sliders[d.id] = () => { input.value = toUnit(d, st.p[d.id]); out.textContent = fmt(d, st.p[d.id]); };
    return el('div', { class: 'field' }, el('label', { for: `m-${d.id}` }, d.label), el('div', { class: 'slider two' }, input, out));
  };
  const choiceField = (d) => {
    const row = el('div', { class: 'pills', role: 'group', 'aria-label': d.label },
      choicesOf(d).map((c) => {
        const b = el('button', { type: 'button', class: 'pill', 'data-v': c.value, onclick: () => { st.p[d.id] = c.value; sliders[d.id](); push(d.id); changed(); } }, c.label);
        if (d.unit === 'bars') lengthLabels.push([d, c.value, b]);
        return b;
      }));
    sliders[d.id] = () => { for (const b of row.children) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === st.p[d.id])); };
    sliders[d.id]();
    return el('div', { class: 'field' }, el('span', { class: 'label' }, d.label), row);
  };
  const choiceFields = patch.params.filter(isChoice).map(choiceField);
  const fields = patch.params.filter((d) => !isChoice(d)).map(sliderField);
  const syncSliders = () => { for (const k of Object.keys(sliders)) sliders[k](); };

  // ---- link and download
  let urlTimer = 0;
  function link() {
    const q = new URLSearchParams();
    if (st.custom) for (const d of patch.params) q.set(d.id, String(st.p[d.id]));
    else {
      if (st.preset) q.set('style', st.preset);
      for (const d of patch.params) if (isChoice(d) && st.p[d.id] !== d.default) q.set(d.id, String(st.p[d.id]));
    }
    const qs = q.toString();
    return `#/music/${patch.id}${qs ? '?' + qs : ''}`;
  }
  function saveUrl() { clearTimeout(urlTimer); urlTimer = setTimeout(() => history.replaceState(null, '', keepBag(link(), query)), 200); }
  const dlBtn = el('button', { type: 'button', class: 'btn big', onclick: async () => {
    dlBtn.disabled = true; say(`Building the music file. This takes about ${Math.max(10, Math.round(lengthOf(patch, st.p) * 0.6 / 5) * 5)} seconds…`);
    try {
      const r = await renderAsync(patch, { ...st.p });
      saveBlob(new Blob([wavBytes(r)], { type: 'audio/wav' }), `${patch.id}.wav`);
      say(`Downloaded ${patch.id}.wav: one loop, ${r.duration.toFixed(1)} seconds. Set it to repeat in your game.`);
    } catch (e) { say(`The download did not start: ${e.message}. Try again, or use a different browser.`); }
    dlBtn.disabled = false;
  } }, 'Download music');
  async function copyLink() {
    clearTimeout(urlTimer);
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}${link()}`); say('Link copied. Anyone who opens it hears this exact version.'); }
    catch { say('Copy the address in your browser bar to share this exact version.'); }
  }

  const inKits = kits.filter((k) => (k.music ?? []).includes(patch.id));
  syncPlay(); syncStyle(); syncLength();
  app.replaceChildren(
    header('music'),
    el('main', { class: 'editor' },
      el('div', { class: 'left' },
        el('div', { class: 'title-row' }, el('h1', {}, patch.name), el('p', { class: 'blurb' }, patch.description ?? '')),
        el('div', { class: 'stage-card' }, el('div', { class: 'stage-tools plain' }, el('div', { class: 'tools-left' }, playBtn, lengthNote))),
        el('div', { class: 'under' }, el('span', { class: 'label' }, 'Style'), styleBar),
        el('p', { class: 'used' }, 'Press Play, then move the sliders: the music changes while it plays, the way a game would change it during a fight. ',
          inKits.length ? ['In ', inKits.map((k, i) => [i ? ', ' : '', el('a', { href: `#/kit/${k.id}` }, k.name)]), '.'] : null)),
      el('div', { class: 'panel' },
        el('div', { class: 'panel-actions' },
          el('button', { type: 'button', class: 'btn', onclick: () => { const keep = Object.fromEntries(patch.params.filter((d) => d.step && !d.options).map((d) => [d.id, st.p[d.id]])); st.p = soundParams(patch, null, { ...randomSoundParams(patch), ...keep }); st.custom = true; syncSliders(); pushAll(); changed(); } }, 'Surprise me'),
          el('button', { type: 'button', class: 'ghost', onclick: () => setStyle(null, false) }, 'Start over')),
        choiceFields.length ? el('section', { class: 'group' }, el('h2', {}, 'Arrangement'), choiceFields) : null,
        el('section', { class: 'group' }, el('h2', {}, 'Sound'), fields)),
      el('div', { class: 'get' }, addToBag('music', patch.id, () => ({ params: { ...st.p }, style: st.preset }), query), dlBtn, el('button', { type: 'button', class: 'ghost', onclick: copyLink }, 'Copy link'), status)));

  return () => { st.gone = true; clearTimeout(urlTimer); stop(); };
}
