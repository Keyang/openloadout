// One music track (docs/site-design.md, section 5, "Sound, music"): the same two columns as a sprite (app/asset-shell.js).
// Left: its name and line, a big play button and how long it is. Right: the editing panel (app/panel.js) with its
// versions (its named styles first), its sliders and its choices (how long it is, which instrument leads) in tabs, and
// a look of its own (Look), and the download. It plays live, so a slider is heard while it moves. Every change is saved to the bag as it is made.
import { el, header, saveBlob } from './ui.js';
import { soundParams, renderAsync, playRendered, playLive, wavBytes, isChoice, lengthOf } from './audio.js';
import { keepBag } from './add-to-bag.js';
import { madeNote } from './catalog.js';      // W5-A: a track made on this visit says so, and a draft cannot go in the bag
import { createEdit } from './editing.js';
import { editPanel } from './panel.js';
import { soundModel } from './panel-model.js';
import { assetShell, icon, ICON } from './asset-shell.js';
import { lookOf } from './bag.js';
import { applySound } from '../sound/theme.js';
import { soundLookTab, heardIn } from './sound-look.js';      // the whole-set looks, on this one track
import { THEME_PRESETS } from '../engine/theme.js';

export function musicPage(app, patch, query) {
  document.title = `${patch.name} · Loadout`;
  const presets = Object.keys(patch.presets ?? {});
  const fromLink = {};
  for (const d of patch.params) if (query[d.id] !== undefined && Number.isFinite(Number(query[d.id]))) fromLink[d.id] = Number(query[d.id]);
  const style0 = presets.includes(query.style) ? query.style : null;
  const made = madeNote(patch.id);

  let saveTimer = 0;
  const edit = createEdit({
    kind: 'music', id: patch.id, defaults: { params: soundParams(patch, null), style: null }, key: query.bag ?? null, canSave: !made?.draft,
    start: { params: soundParams(patch, style0, fromLink), style: style0, ...(lookOf({ look: query.artlook }) ? { look: query.artlook } : {}) },      // a look of its own, carried by the link as `artlook`
    schedule: (fn) => { clearTimeout(saveTimer); saveTimer = setTimeout(fn, 150); },
  });
  const now = () => edit.settings();
  // what the track is heard with: its settings, in its own look when it has one (tempo, key, calm; brightness is a filter)
  const heard = () => heardIn(patch, now().params, lookOf(now()));
  // a look that changes brightness cannot be played live: the loop is rendered first, then filtered (as in the bag)
  const filtered = (h) => !!(h.sound && h.sound.brightness);
  const st = { voice: null, starting: false, gone: false, sent: { ...heard().params }, look: lookOf(now()) };

  // How long the track is at some settings, in seconds (worked out once for each tempo and length).
  const lengths = new Map();
  const secondsAt = (params) => {
    const key = patch.params.map((d) => params[d.id]).join(',');
    if (!lengths.has(key)) { if (lengths.size > 400) lengths.clear(); lengths.set(key, Math.round(lengthOf(patch, params))); }
    return lengths.get(key);
  };
  // The panel's model, with the length choices said in seconds at the current tempo, which is what a non-musician can judge.
  const model = soundModel(patch);
  const controlsOf = model.controls;
  const byId = Object.fromEntries(patch.params.map((d) => [d.id, d]));
  model.controls = (s) => controlsOf(s).map((c) => (c.kind === 'choice' && byId[c.key].unit === 'bars'
    ? { ...c, options: c.options.map((o) => ({ ...o, label: `${secondsAt({ ...s.params, [c.key]: o.value })} seconds` })) } : c));

  const lengthNote = el('span', { class: 'hint' });
  const syncLength = () => { lengthNote.textContent = `${secondsAt(heard().params)} seconds long, then it repeats.`; };

  let panel = null;
  const say = (text) => panel && panel.say(text);

  // ---- playing: live, so sliders are heard at once
  const playBtn = el('button', { type: 'button', class: 'play-big', onclick: () => (st.voice || st.starting ? stop() : play()) });
  const syncPlay = () => {
    const word = st.starting ? 'Starting…' : st.voice ? 'Stop' : 'Play';
    playBtn.replaceChildren(icon(st.voice || st.starting ? ICON.stop : ICON.play, { fill: true }), el('span', { class: 'sr' }, word));
    playBtn.title = word;
  };
  function stop() { st.starting = false; if (st.voice) st.voice.stop(); st.voice = null; syncPlay(); }
  async function play() {
    st.starting = true; syncPlay();
    const h = heard(), params = h.params;
    st.look = lookOf(now());
    try {
      if (filtered(h)) throw new Error('rendered first');      // (caught below: the rendered loop, filtered)
      const voice = await playLive(patch, { ...params });
      if (st.gone || !st.starting) { voice.stop(); return; }
      st.voice = voice; st.sent = { ...params };
      push();      // whatever moved while it was starting
    } catch (e) {
      // no live audio in this browser: fall back to the rendered loop
      try {
        const raw = await renderAsync(patch, { ...params });
        if (st.gone || !st.starting) return;
        const loop = playRendered(filtered(h) ? applySound(raw, h.sound) : raw, { force: true, loop: true });
        st.voice = { set() {}, stop: () => loop && loop.stop(), rendered: true };
        if (!filtered(h)) say('This browser cannot change the music while it plays. Press Stop and Play again to hear a change.');
      } catch (e2) { say(`The music could not start: ${e2.message}.`); }
    }
    st.starting = false; syncPlay();
  }
  /** Tell the playing track every setting that changed since it was last told. */
  function push() {
    // a new look while it plays: it starts again in the new look (a filtered loop cannot change as it plays)
    if ((st.voice || st.starting) && lookOf(now()) !== st.look) { stop(); play(); return; }
    if (st.voice?.rendered && filtered(heard())) return;
    const p = heard().params;
    if (st.voice) for (const d of patch.params) if (p[d.id] !== st.sent[d.id]) st.voice.set(d.id, p[d.id]);
    st.sent = { ...p };
  }

  // ---- the address and the file
  let urlTimer = 0;
  function link() {
    const s = now(), q = new URLSearchParams(), own = soundParams(patch, s.style);
    // a slider moved by hand: every setting travels. Otherwise the style's name, and the choices that are not the usual ones
    if (patch.params.some((d) => !isChoice(d) && s.params[d.id] !== own[d.id])) for (const d of patch.params) q.set(d.id, String(s.params[d.id]));
    else {
      if (s.style) q.set('style', s.style);
      for (const d of patch.params) if (isChoice(d) && s.params[d.id] !== d.default) q.set(d.id, String(s.params[d.id]));
    }
    if (lookOf(s)) q.set('artlook', lookOf(s));
    const qs = q.toString();
    return `#/music/${patch.id}${qs ? '?' + qs : ''}`;
  }
  function saveUrl() { clearTimeout(urlTimer); urlTimer = setTimeout(() => { urlTimer = 0; history.replaceState(null, '', keepBag(link(), { bag: edit.key() })); }, 200); }
  let building = false;
  async function download() {
    if (building) return '';
    building = true;
    const h = heard(), params = h.params;
    const look = THEME_PRESETS.find((p) => p.id === lookOf(now()) && p.id !== 'original');
    say(`Building the music file. This takes about ${Math.max(10, Math.round(lengthOf(patch, params) * 0.6 / 5) * 5)} seconds…`);
    try {
      const raw = await renderAsync(patch, { ...params });
      const r = h.sound ? applySound(raw, h.sound) : raw;
      saveBlob(new Blob([wavBytes(r)], { type: 'audio/wav' }), `${patch.id}.wav`);
      return `Downloaded ${patch.id}.wav${look ? `, in the ${look.name} look` : ''}: one loop, ${r.duration.toFixed(1)} seconds. Set it to repeat in your game.`;
    } catch (e) { return `The download did not start: ${e.message}. Try again, or use a different browser.`; }
    finally { building = false; }
  }
  async function copyLink() {
    clearTimeout(urlTimer); urlTimer = 0;
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}${link()}`); return 'Link copied. Anyone who opens it hears this exact version.'; }
    catch { return 'Copy the address in your browser bar to share this exact version.'; }
  }

  // the looks (the panel's Look tab): a look of its own, saved with it like any setting
  const look = soundLookTab({ patch, now: () => lookOf(now()), pick: (id) => edit.set({ look: id ?? null }), say });

  let shell = null;
  panel = editPanel({
    kind: 'music', asset: patch, edit, model,
    tabs: [{ id: 'look', label: 'Look', node: look.node, changed: look.changed }],
    onDownload: download, onCopyLink: copyLink,
    onMore: () => shell && shell.openMore(),
  });
  const offEdit = edit.onChange(() => { look.sync(); push(); syncLength(); if (!urlTimer) saveUrl(); });
  const flush = () => edit.flush();
  window.addEventListener('pagehide', flush);
  syncPlay(); syncLength();
  if (edit.inBag()) saveUrl();

  const card = el('div', { class: 'stage-card tile sound-card' },
    el('span', { class: 'sound-icon' }, icon(ICON.note, { size: 18 }), 'Music'),
    el('div', { class: 'stage-tools' }, el('div', { class: 'tools-left' }, playBtn, lengthNote)));
  const under = el('div', { class: 'sound-under' }, el('p', {}, 'Press Play, then move the sliders: the music changes while it plays, the way a game would change it during a fight.'));
  shell = assetShell({ kind: 'music', id: patch.id, name: patch.name, line: patch.description ?? '', made, edit, stage: card, under: [under], panel });
  app.replaceChildren(header('music'), shell.main);

  return () => {
    st.gone = true; clearTimeout(urlTimer); stop();
    offEdit(); panel.close(); shell.close(); edit.close(); clearTimeout(saveTimer);      // leaving saves whatever was still waiting
    window.removeEventListener('pagehide', flush);
  };
}
