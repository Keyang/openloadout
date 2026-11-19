// One sound (docs/site-design.md, section 5, "Sound, music"): the same two columns as a sprite (app/asset-shell.js).
// Left: its name and line, a big play button and how long it is. Right: the editing panel (app/panel.js) with its
// versions (its named styles first), its sliders in tabs, and the download. Every change is saved to the bag as it is
// made (app/editing.js) and heard a moment after it. No waveform picture (a standing rule of the site).
import { el, header, saveBlob, cap } from './ui.js';
import { soundParams, rendered, playRendered, wavBytes } from './audio.js';
import { keepBag } from './add-to-bag.js';
import { madeNote } from './catalog.js';      // W5-A: a sound made on this visit says so, and a draft cannot go in the bag
import { createEdit } from './editing.js';
import { editPanel } from './panel.js';
import { assetShell, icon, ICON } from './asset-shell.js';

export function soundPage(app, patch, query) {
  document.title = `${patch.name} · Loadout`;
  const presets = Object.keys(patch.presets ?? {});
  const fromLink = {};
  for (const d of patch.params) if (query[d.id] !== undefined && Number.isFinite(Number(query[d.id]))) fromLink[d.id] = Number(query[d.id]);
  const style0 = presets.includes(query.style) ? query.style : null;
  const made = madeNote(patch.id);

  // The edit session: what the address carries is where it starts; a bag item of this sound (the one the address names,
  // or the visitor's own when the address carries no settings) is what it edits. Every change is saved to the bag.
  let saveTimer = 0;
  const edit = createEdit({
    kind: 'sound', id: patch.id, defaults: { params: soundParams(patch, null), style: null, seed: 1 }, key: query.bag ?? null, canSave: !made?.draft,
    start: { params: soundParams(patch, style0, fromLink), style: style0, seed: Number(query.seed) >= 1 ? Math.round(Number(query.seed)) : 1 },      // (a seed: a variation opened from the bag)
    schedule: (fn) => { clearTimeout(saveTimer); saveTimer = setTimeout(fn, 150); },      // a slider being dragged is a few saves, not hundreds
  });
  const now = () => edit.settings();

  // ---- playing
  let r = null, handle = null, raf = 0;
  const lengthNote = el('span', { class: 'hint' });
  const progress = el('span', { class: 'tile-progress', 'aria-hidden': 'true' });
  const playBtn = el('button', { type: 'button', class: 'play-big', onclick: () => (handle ? stop() : play()) });
  const syncPlay = () => {
    const word = handle ? 'Stop' : patch.loop ? 'Play loop' : 'Play';
    playBtn.replaceChildren(icon(handle ? ICON.stop : ICON.play, { fill: true }), el('span', { class: 'sr' }, word));
    playBtn.title = word;
  };
  function render() {
    const s = now();
    r = rendered(patch, s.params, s.seed);
    lengthNote.textContent = patch.loop ? `Loops every ${r.duration.toFixed(1)} seconds` : `${r.duration.toFixed(2)} seconds long`;
    return r;
  }
  // the line along the bottom of the tile follows the sound while it plays
  const follow = () => {
    const h = handle;
    if (!h) { progress.style.width = '0'; raf = 0; return; }
    const u = (h.now() - h.startedAt) / h.duration;
    progress.style.width = `${Math.max(0, Math.min(1, h.loop ? u % 1 : u)) * 100}%`;
    raf = requestAnimationFrame(follow);
  };
  function stop() { if (handle) handle.stop(); handle = null; syncPlay(); }
  function play() {
    if (handle) handle.stop();
    handle = playRendered(render(), { force: true, loop: !!patch.loop, onended: () => { handle = null; syncPlay(); } });
    syncPlay();
    if (handle && !raf) raf = requestAnimationFrame(follow);
  }

  // ---- the address and the files
  let urlTimer = 0;
  function link() {
    const s = now(), q = new URLSearchParams();
    // a style as it comes travels by its name; anything moved by hand travels as every slider's value
    const own = soundParams(patch, s.style);
    if (patch.params.some((d) => s.params[d.id] !== own[d.id])) for (const d of patch.params) q.set(d.id, String(s.params[d.id]));
    else if (s.style) q.set('style', s.style);
    if (s.seed !== 1) q.set('seed', String(s.seed));
    const qs = q.toString();
    return `#/sound/${patch.id}${qs ? '?' + qs : ''}`;
  }
  // the address carries the settings, and the bag item they are saved to, so a reload goes on editing the same item
  function saveUrl() { clearTimeout(urlTimer); urlTimer = setTimeout(() => { urlTimer = 0; history.replaceState(null, '', keepBag(link(), { bag: edit.key() })); }, 200); }
  function download() {
    saveBlob(new Blob([wavBytes(render())], { type: 'audio/wav' }), `${patch.id}.wav`);
    return `Downloaded ${patch.id}.wav. It works in Unity, Godot and any other game tool.`;
  }
  async function copyLink() {
    clearTimeout(urlTimer); urlTimer = 0;
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}${link()}`); return 'Link copied. Anyone who opens it hears this exact sound.'; }
    catch { return 'Copy the address in your browser bar to share this exact sound.'; }
  }

  // ---- a change: drawn and saved in the address a moment after the last one, and played when the visitor made it here
  let soon = 0, wantPlay = false;
  const changed = () => {
    clearTimeout(soon);
    soon = setTimeout(() => { render(); syncVariation(); if (!urlTimer || wantPlay) saveUrl(); if (wantPlay) { wantPlay = false; play(); } }, 140);
  };
  const acted = () => { wantPlay = true; changed(); };

  const variationNote = el('p', {});
  const syncVariation = () => { const n = now().seed; variationNote.textContent = n === 1 ? 'A variation is the same sound, a little different each time, the way a game varies it.' : `Variation ${n}. Start over goes back to the first.`; };
  const variation = el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { edit.set({ seed: 1 + Math.floor(Math.random() * 9999) }); acted(); } }, 'Play a variation');

  let shell = null;
  const panel = editPanel({
    kind: 'sound', asset: patch, edit,
    onDownload: download, onCopyLink: copyLink,
    onMore: () => shell && shell.openMore(),
    onAct: (what) => { if (what === 'version' || what === 'surprise' || what === 'control' || what === 'startover') acted(); },
  });
  const offEdit = edit.onChange(changed);
  const flush = () => edit.flush();
  window.addEventListener('pagehide', flush);      // closing the tab mid-drag still saves the last change
  render(); syncPlay(); syncVariation();
  if (edit.inBag()) saveUrl();

  const card = el('div', { class: 'stage-card tile sound-card' },
    el('span', { class: 'sound-icon' }, icon(ICON.speaker, { size: 18 }), `${cap(patch.category)} sound`),
    el('div', { class: 'stage-tools' }, el('div', { class: 'tools-left' }, playBtn, lengthNote)),
    progress);
  shell = assetShell({ kind: 'sound', id: patch.id, name: patch.name, line: patch.description ?? '', made, edit, stage: card, under: [el('div', { class: 'sound-under' }, variation, variationNote)], panel });
  app.replaceChildren(header('sounds'), shell.main);

  return () => {
    cancelAnimationFrame(raf); clearTimeout(urlTimer); clearTimeout(soon);
    if (handle) handle.stop();
    offEdit(); panel.close(); shell.close(); edit.close(); clearTimeout(saveTimer);      // leaving saves whatever was still waiting
    window.removeEventListener('pagehide', flush);
  };
}
