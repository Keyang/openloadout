// One music track (docs/site-design.md, section 5, "Sound, music"): the same two columns as a sprite (app/asset-shell.js).
// Left: its name and line, a big play button and how long it is. Right: the editing panel (app/panel.js) with its
// versions (its named styles first), its sliders and its choices (how long it is, which instrument leads, which plays along) in tabs, the
// classic pairs of instruments as one-tap chips under the play button, and
// a look of its own (Look), and the download. It plays live, so a slider is heard while it moves. Every change is saved to the bag as it is made.
import { el, header, saveBlob } from './ui.js';
import { soundParams, renderAsync, playRendered, wavBytes, isChoice, lengthOf } from './audio.js';
import { createPlayer } from '../sound/player.js';
import { createLimiter } from '../sound/limiter.js';
import { typicalHz } from '../sound/theme.js';
import { keepBag } from './add-to-bag.js';
import { madeNote } from './catalog.js';      // W5-A: a track made on this visit says so, and a draft cannot go in the bag
import { createEdit } from './editing.js';
import { editPanel } from './panel.js';
import { soundModel } from './panel-model.js';
import { assetShell, icon, ICON } from './asset-shell.js';
import { bagTray } from './tray.js';      // the bag's slim tray at the right edge (1280 px and wider)
import { lookOf } from './bag.js';
import { applySound } from '../sound/theme.js';
import { soundLookTab, heardIn, liveBrightness, matchGain } from './sound-look.js';      // the whole-set looks, on this one track
import { THEME_PRESETS } from '../engine/theme.js';

// The track plays live through filters of its own, so a look is heard while it plays and its sliders still move it:
// the live player -> the look's brightness (sound-look.js liveBrightness: the download's filters) -> the site's level
// (0.8, as app/audio.js) -> the limiter. Made at the first Play, and kept for the visit.
let rig = null;
function liveRig() {
  if (!rig) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const post = ctx.createGain(); post.gain.value = 0.8; post.connect(createLimiter(ctx));
    const pre = ctx.createGain(); pre.connect(post);
    rig = { ctx, pre, post, filters: [], player: createPlayer({ context: ctx, destination: pre, volume: 1 }) };
  }
  if (rig.ctx.state === 'suspended') rig.ctx.resume();
  return rig;
}
/** Put a look's brightness on the live output: filters (an empty list for none) and the gain that keeps it as loud. */
function setLiveLook(r, coefs, gain = 1) {
  r.pre.disconnect();
  for (const f of r.filters) f.disconnect();
  r.filters = coefs.map((c) => r.ctx.createIIRFilter(c.feedforward, c.feedback));
  [r.pre, ...r.filters].reduce((a, b) => { a.connect(b); return b; }).connect(r.post);
  r.post.gain.setTargetAtTime(0.8 * gain, r.ctx.currentTime, 0.02);
}

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
  const filtered = (h) => !!(h.sound && h.sound.brightness);
  const st = { voice: null, starting: false, gone: false, sent: { ...heard().params }, look: lookOf(now()), typical: 0, measuring: 0, told: false };

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

  // The classic pairs (sound/pairs.js): one tap sets the melody instrument and the instrument that plays along together.
  // Only a track that has both choices shows them. When the two are the same instrument nothing is added (the melody wins), and the page says so.
  const pairNote = el('span', { class: 'hint', 'aria-live': 'polite' });
  const pairButtons = model.pairs.map((q) => el('button', { type: 'button', class: 'chip', 'data-pair': q.label, onclick: () => pickPair(q) }, q.label));
  const pairBox = pairButtons.length
    ? el('div', { class: 'pairs' }, el('span', { class: 'hint' }, 'Pairs that go well together'), el('span', { class: 'chips', role: 'group', 'aria-label': 'Pairs that go well together' }, pairButtons), pairNote)
    : null;
  const syncPairs = () => {
    if (!pairBox) return;
    const s = now();
    model.pairs.forEach((q, i) => pairButtons[i].setAttribute('aria-pressed', String(model.pairOn(s, q))));
    const inst = byId.inst.options[s.params.inst], along = byId.along.options[s.params.along];
    pairNote.textContent = along !== 'None' && along === inst ? `${inst} is already playing the tune, so playing along adds nothing. Pick another.` : '';
  };
  function pickPair(q) {
    edit.set(model.setPair(now(), q));
    say(`${q.label}: ${byId.inst.options[q.params.inst]} plays the tune and ${byId.along.options[q.params.along]} plays along.`);
  }

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
  function stop() { st.starting = false; st.measuring++; if (st.voice) st.voice.stop(); st.voice = null; syncPlay(); }
  /** The look's brightness on the live output: at once with what is known, then exactly once the loop's sound is measured. */
  function liveLook() {
    if (!rig || !st.voice || st.voice.rendered) return;
    const h = heard(), b = filtered(h) ? h.sound.brightness : 0;
    setLiveLook(rig, liveBrightness(b, rig.ctx.sampleRate, st.typical));
    const id = ++st.measuring;
    if (!b) return;
    // (its typical frequency and the gain that keeps it as loud come from the rendered loop, as the download's do)
    renderAsync(patch, { ...h.params }).then((raw) => {
      if (id !== st.measuring || !st.voice || st.gone) return;
      const chans = raw.channels?.length ? raw.channels : [raw.samples];
      st.typical = typicalHz(chans, raw.sampleRate);
      setLiveLook(rig, liveBrightness(b, rig.ctx.sampleRate, st.typical), matchGain(chans, liveBrightness(b, raw.sampleRate, st.typical)));
    }).catch(() => {});
  }
  async function play() {
    st.starting = true; syncPlay();
    const h = heard(), params = h.params;
    st.look = lookOf(now());
    try {
      const r = liveRig();
      if (!r.ctx.audioWorklet) throw new Error('no live audio');
      const voice = await r.player.live(patch, { ...params });
      if (st.gone || !st.starting) { voice.stop(); return; }
      st.voice = voice; st.sent = { ...params };
      liveLook();
      push();      // whatever moved while it was starting
    } catch (e) {
      // no live audio in this browser: fall back to the rendered loop
      try {
        const raw = await renderAsync(patch, { ...params });
        if (st.gone || !st.starting) return;
        const loop = playRendered(filtered(h) ? applySound(raw, h.sound) : raw, { force: true, loop: true });
        st.voice = { set() {}, stop: () => loop && loop.stop(), rendered: true };
      } catch (e2) { say(`The music could not start: ${e2.message}.`); }
    }
    st.starting = false; syncPlay();
  }
  /** Tell the playing track every setting that changed since it was last told, and a new look at once. */
  function push() {
    if (st.voice?.rendered) {
      // (a rendered loop cannot change as it plays: a new look starts it again; a slider is heard at the next Play)
      if (lookOf(now()) !== st.look) { stop(); play(); return; }
      if (!st.told) { st.told = true; say('This browser cannot change the music while it plays. Press Stop and Play again to hear a change.'); }
      return;
    }
    if (st.voice && lookOf(now()) !== st.look) { st.look = lookOf(now()); liveLook(); }
    const p = heard().params;
    if (st.voice) for (const d of patch.params) if (p[d.id] !== st.sent[d.id]) st.voice.set(d.id, p[d.id]);
    st.sent = { ...p };
  }

  // ---- the address and the file
  let urlTimer = 0;
  function link() {
    const s = now(), q = new URLSearchParams(), own = soundParams(patch, s.style);
    // the style's name always (it is the version it started from); a slider moved by hand: every setting travels too.
    // Otherwise the choices that are not the usual ones
    if (s.style) q.set('style', s.style);
    if (patch.params.some((d) => !isChoice(d) && s.params[d.id] !== own[d.id])) for (const d of patch.params) q.set(d.id, String(s.params[d.id]));
    else for (const d of patch.params) if (isChoice(d) && s.params[d.id] !== d.default) q.set(d.id, String(s.params[d.id]));
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
  const offEdit = edit.onChange(() => { look.sync(); push(); syncLength(); syncPairs(); if (!urlTimer) saveUrl(); });
  const flush = () => edit.flush();
  window.addEventListener('pagehide', flush);
  syncPlay(); syncLength(); syncPairs();
  if (edit.inBag()) saveUrl();

  const card = el('div', { class: 'stage-card tile sound-card' },
    el('span', { class: 'sound-icon' }, icon(ICON.note, { size: 18 }), 'Music'),
    el('div', { class: 'stage-tools' }, el('div', { class: 'tools-left' }, playBtn, lengthNote)));
  const under = el('div', { class: 'sound-under' }, el('p', {}, 'Press Play, then move the sliders: the music changes while it plays, the way a game would change it during a fight.'));
  shell = assetShell({ kind: 'music', id: patch.id, name: patch.name, line: patch.description ?? '', made, edit, stage: card, under: [pairBox, under].filter(Boolean), panel });
  // the bag, slim, as the page's third column: this music is marked in it while it is in the bag
  const tray = bagTray({ size: 'slim', current: { kind: 'music', id: patch.id, key: edit.key() } });
  const offTray = edit.onChange(() => tray.setCurrent({ kind: 'music', id: patch.id, key: edit.key() }));
  shell.main.append(tray.node);
  app.replaceChildren(header('music'), shell.main);
  tray.placed();

  return () => {
    st.gone = true; clearTimeout(urlTimer); stop();
    offEdit(); offTray(); tray.stop(); panel.close(); shell.close(); edit.close(); clearTimeout(saveTimer);      // leaving saves whatever was still waiting
    window.removeEventListener('pagehide', flush);
  };
}
