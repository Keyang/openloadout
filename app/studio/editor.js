// The studio's editing page, #/studio/<draft>?mode=rig|animate|frames|sprite&clip=walk&frame=3 (docs/studio.md section
// 5; item S9). Design 5's remix layout (app/css/asset.css, main.rx): the live picture on the left with its tools and
// the timeline under it, the panel on the right with four tabs (Body, Move, Frames, Look & name) and the footer (saved
// state, Play, Put in my bag, Download). Every finished change is validated, pushed on the undo stack and saved 500 ms
// later (app/studio/keep.js, history.js, drafts.js); a draft in the bag keeps its bag item up to date (keep.js followBag). Keyboard: 1 to 4 tabs, Space play, arrows frames or the picked handle,
// [ ] keys, K add a key, Delete, R turn, Esc, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y.
import { el, header, saveBlob, reduceMotion } from '../ui.js';
import { assetById } from '../catalog.js';
import * as bagModule from '../bag.js';
import { zip } from '../zip.js';
import { createHistory } from './history.js';
import { createSaver, slugOf } from './drafts.js';
import { acceptChange, bagTakes, followBag } from './keep.js';
import { makeStage } from './stage.js';
import { drawFrame, libraryFile, sheetOf } from './draw.js';
import * as X from './edit.js';
import { icon, menuButton } from './bits.js';
import { bodyPane, movePane, framesPane, lookPane } from './panes.js';
import { lightKeys, lightLabel } from './clip-tools.js';
import { framesWithAdvice } from './more-panes.js';
import { v2EditorPage } from './v2-editor.js';

/** The four tabs: their address word (docs/studio.md), their key and their name. */
export const MODES = Object.freeze([
  { id: 'rig', mode: 'body', key: '1', label: 'Body' },
  { id: 'animate', mode: 'move', key: '2', label: 'Move' },
  { id: 'frames', mode: 'frames', key: '3', label: 'Frames' },
  { id: 'sprite', mode: 'look', key: '4', label: 'Look & name' },
]);
const PANES = { body: bodyPane, move: movePane, frames: framesPane, look: lookPane };

const isTyping = (t) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) && !(t instanceof HTMLInputElement && ['checkbox', 'radio', 'button'].includes(t.type));

/** What 'Put in my bag' calls when the page does not say: window.loadout.studio. */
const siteStudio = { ready: () => typeof window.loadout?.studio?.toBag === 'function', toBag: (id) => window.loadout.studio.toBag(id) };
/** Is the bag item `key` still in the bag? */
function inBag(key) {
  try { return bagModule.bag.items().some((i) => i.key === key); } catch { return false; }
}

/**
 * Draws the editor for one draft into `app` and returns its teardown.
 * Arguments: app (the page's root), { id (the draft), entry ({ definition, savedAt, bagKey? }), drafts (app/studio/drafts.js), kept (does the browser keep them), query,
 * studio ({ ready, toBag }: what 'Put in my bag' calls, on the same drafts; default window.loadout.studio) }.
 */
export function editorPage(app, { id, entry, drafts, kept, query, studio = siteStudio }) {
  // build item B17: a version 2 draft (every body) has its own editor; version 1 drafts open here as before
  if (entry.definition?.version === 2) return v2EditorPage(app, { id, entry, drafts, kept, query, studio });
  /** Does the bag take studio sprites (item S8)? The same test toBag makes, and toBag is there. */
  const bagTakesStudio = (def) => studio.ready() && bagTakes(bagModule, def);
  const startMode = MODES.find((m) => m.id === query.mode)?.mode ?? 'body';
  const first = entry.definition;
  const firstClip = X.hasClip(first, query.clip) ? query.clip : (X.hasClip(first, 'walk') ? 'walk' : X.hasClip(first, first.preview) ? first.preview : Object.keys(first.clips)[0]);
  const S = {
    def: first, live: null, mode: startMode, clip: firstClip,
    frame: Math.max(0, Math.min(first.clips[firstClip].frames - 1, Number.parseInt(query.frame, 10) || 0)),
    facing: 'side', bodyClip: null, lookClip: X.hasClip(first, first.preview) ? first.preview : firstClip,
    sel: { bone: X.isRig(first) ? first.body.rig.bones[0]?.id : undefined, handle: null },
    bones: true, grid: true, zoom: null, onion: false, playing: false, scene: 'scene', clipboard: null, newClipOpen: false,
    saveState: kept ? { kind: 'saved', at: entry.savedAt } : { kind: 'memory' }, changes: 0, bagKey: entry.bagKey ?? null, bagError: null,
  };
  // a bag item taken out since the draft was last open: the draft no longer says it is in the bag
  if (S.bagKey && bagTakes(bagModule, first) && !inBag(S.bagKey)) S.bagKey = null;
  if (S.mode === 'look' && !reduceMotion.matches) S.playing = true;
  const history = createHistory(first);
  const saver = createSaver({ save: (def) => saveNow(def) });
  const taken = (name) => { const s = slugOf(name); return s && assetById(s) ? [s] : []; };

  // ---- saving ----
  function saveNow(def) {
    const r = drafts.put(id, def);
    if (!r.ok) S.saveState = { kind: 'error', error: r.error };
    else S.saveState = kept ? { kind: 'saved', at: Date.now() } : { kind: 'memory' };
    const latest = drafts.get(id);
    S.bagKey = latest?.bagKey ?? S.bagKey;
    // a draft in the bag gives its bag item every change (Q1: follow edits); a failure is said, never swallowed
    if (S.bagKey) {
      const f = followBag(bagModule, S.bagKey, def);
      if (f.state === 'updated') S.bagError = null;
      else if (f.state === 'gone') { S.bagKey = null; S.bagError = null; drafts.put(id, def, { bagKey: null }); say(f.message); }
      else { S.bagError = f.message; say(f.message); }
    }
    drawFoot();
    return r;
  }

  // ---- what the stage and the panes read ----
  const ctx = () => ({ mode: S.mode, clip: S.clip, frame: S.frame, facing: S.facing });
  const view = () => ({ def: S.live ?? S.def, mode: S.mode, clip: S.mode === 'look' ? S.lookClip : S.clip, frame: S.frame, facing: S.facing, bodyClip: S.bodyClip, playing: S.playing, bones: S.bones, grid: S.grid, zoom: S.zoom, sel: S.sel, onion: S.onion, scene: S.scene });

  const stage = makeStage({
    view,
    onLive: (def) => { S.live = def; stage.draw(); },
    onCommit: (def) => { S.live = null; commit(def); },
    onSelect: (sel) => select(sel),
    afterDraw: (pos) => { for (const r of pane.querySelectorAll('.handle-row[data-handle]')) { const at = pos.get(r.dataset.handle); r.dataset.at = at ? at.join(',') : ''; } },
  });

  // ---- the left column ----
  const title = el('h1', {}, first.name);
  const sub = el('p', { class: 'blurb' });
  const zoomWord = el('span', { class: 'st-zoom num', 'aria-live': 'polite' });
  const showSeg = el('span', { class: 'seg', role: 'group', 'aria-label': 'Show' },
    el('button', { type: 'button', 'data-show': 'pixels', onclick: () => { S.bones = false; drawStageTools(); stage.draw(); } }, 'Pixels'),
    el('button', { type: 'button', 'data-show': 'bones', onclick: () => { S.bones = true; drawStageTools(); stage.draw(); } }, 'Bones'));
  const sceneSeg = el('span', { class: 'seg', role: 'group', 'aria-label': 'Backdrop' },
    el('button', { type: 'button', 'data-scene': 'plain', onclick: () => { S.scene = 'plain'; drawStageTools(); stage.draw(); } }, 'Plain'),
    el('button', { type: 'button', 'data-scene': 'scene', onclick: () => { S.scene = 'scene'; drawStageTools(); stage.draw(); } }, 'In a scene'));
  const undoBtn = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'undo', title: 'Undo (Ctrl+Z)', onclick: () => undo() }, 'Undo');
  const redoBtn = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'redo', title: 'Redo (Shift+Ctrl+Z)', onclick: () => redo() }, 'Redo');
  const zoomBox = el('span', { class: 'st-zoombox' }, icon('−', 'Zoom out', () => zoomBy(-1)), zoomWord, icon('+', 'Zoom in', () => zoomBy(1)));
  const tools = el('div', { class: 'st-tools' }, showSeg, sceneSeg, zoomBox, el('span', { class: 'st-gap' }), undoBtn, redoBtn);
  const under = el('div', { class: 'st-under' });
  const stageCol = el('section', { class: 'rx-stage studio-stage', 'aria-label': 'The picture' },
    el('div', { class: 'rx-head' }, el('a', { class: 'st-back', href: '#/studio' }, el('span', { 'aria-hidden': 'true' }, '‹ '), 'All drafts'), title, sub),
    stage.node, tools, under);

  function zoomBy(n) {
    S.zoom = Math.max(1, Math.min(stage.fit(), stage.zoom() + n));
    drawStageTools(); stage.draw();
  }
  function drawStageTools() {
    for (const b of showSeg.children) b.setAttribute('aria-pressed', String((b.dataset.show === 'bones') === S.bones));
    for (const b of sceneSeg.children) b.setAttribute('aria-pressed', String(b.dataset.scene === S.scene));
    showSeg.hidden = S.mode === 'look' || !X.isRig(S.def);
    sceneSeg.hidden = S.mode !== 'look';
    zoomWord.textContent = `${stage.zoom()}×`;
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
  }

  // the timeline: every frame of the clip as a small picture, a mark under the frames that have a key
  const thumbs = new WeakMap();
  function thumbOf(def, clip, f) {
    let m = thumbs.get(def);
    if (!m) { m = new Map(); thumbs.set(def, m); }
    const k = `${clip}:${f}`;
    if (!m.has(k)) {
      const g = drawFrame(def, clip, f);
      const c = document.createElement('canvas');
      c.width = g.w; c.height = g.h;
      c.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
      m.set(k, c);
    }
    return m.get(k);
  }
  function drawUnder() {
    const def = S.def;
    const chipsOf = (names, current, pick, rest) => el('div', { class: 'chips clips', role: 'group', 'aria-label': 'Animations' },
      rest ? el('button', { type: 'button', class: 'chip', 'aria-pressed': String(current === null), onclick: () => pick(null) }, 'Rest pose') : null,
      names.map((n) => el('button', { type: 'button', class: 'chip', 'data-clip': n, 'aria-pressed': String(current === n), onclick: () => pick(n) }, def.clips[n].label || X.humanize(n))));
    const names = Object.keys(def.clips);
    if (S.mode === 'body') {
      under.replaceChildren(...[chipsOf(names, S.bodyClip, (n) => { S.bodyClip = n; S.frame = 0; S.playing = !!n && !reduceMotion.matches; S.started = performance.now(); drawUnder(); stage.draw(); loop(); }, true),
        S.bodyClip ? el('p', { class: 'st-hint' }, `Showing ${def.clips[S.bodyClip].label}. Pick Rest pose to change the body.`) : null].filter(Boolean));
      return;
    }
    if (S.mode === 'look') {
      under.replaceChildren(el('div', { class: 'st-timebar' }, playButton(), chipsOf(names, S.lookClip, (n) => { S.lookClip = n; S.frame = 0; S.started = performance.now(); drawUnder(); stage.draw(); })));
      return;
    }
    const c = def.clips[S.clip];
    const keys = X.keyFrames(def, S.clip);
    const n = c.frames;
    // item S10: keys between frames are thin ticks between two frames, never a frame's key; item S12: frames with a pixel warning are marked
    const ticks = new Map();
    for (const k of lightKeys(def, S.clip)) ticks.set(k.after, (ticks.get(k.after) ?? 0) + 1);
    const adv = framesWithAdvice(def, S.clip);
    const box = el('div', { class: 'timeline', role: 'group', 'aria-label': `Frames of ${c.label}` }, Array.from({ length: n }, (_, f) => {
      const tick = ticks.has(f) ? el('span', { class: 'light-tick', 'data-after': f, title: `${lightLabel(def, S.clip)}: ${ticks.get(f)} key${ticks.get(f) === 1 ? '' : 's'} between frames ${f + 1} and ${(f + 1) % n + 1}`, 'aria-hidden': 'true' }) : null;
      const b = el('button', { type: 'button', class: 'frame' + (keys.has(f) ? ' has-key' : '') + (adv.has(f) ? ' has-advice' : ''), 'data-frame': f, 'aria-current': String(f === S.frame), 'aria-label': `Frame ${f + 1}${keys.has(f) ? ', has a key' : ''}${adv.has(f) ? `. ${adv.get(f).join(' ')}` : ''}`, title: adv.has(f) ? adv.get(f).join('\n') : null, tabindex: f === S.frame ? '0' : '-1',
        onclick: () => setFrame(f),
        onkeydown: (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setFrame((S.frame + (e.key === 'ArrowRight' ? 1 : -1) + n) % n, true); }
        } }, thumbOf(def, S.clip, f), el('span', { class: 'frame-n', 'aria-hidden': 'true' }, String(f + 1)));
      return [b, tick];
    }));
    const onion = el('label', { class: 'st-check', title: 'The frame before, faint, under this one' }, el('input', { type: 'checkbox', checked: S.onion, onchange: (e) => { S.onion = e.target.checked; stage.draw(); } }), 'Onion skin');
    under.replaceChildren(el('div', { class: 'st-timebar' }, playButton(), el('span', { class: 'st-clipname' }, c.label, el('span', { class: 'quiet num' }, ` · ${n} frames · ${c.fps} a second${c.loop === false ? ' · once' : ''}`)), S.mode === 'move' ? onion : null), box);
    // the frame strip scrolls so the frame in hand is in view
    box.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function playButton() {
    return el('button', { type: 'button', class: 'btn btn-sm st-play', 'data-act': 'play-pause', 'aria-pressed': String(S.playing), onclick: () => togglePlay() }, S.playing ? 'Pause' : 'Play');
  }

  // ---- the right column: tabs, the pane, what was just done, the footer ----
  const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Studio' }, MODES.map((m) => el('button', { type: 'button', class: 'tab', role: 'tab', id: `st-tab-${m.id}`, 'data-mode': m.id, 'aria-controls': 'st-pane', title: `${m.label} (${m.key})`, onclick: () => setMode(m.mode) }, m.label)));
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault(); e.stopPropagation();
    const i = MODES.findIndex((m) => m.mode === S.mode);
    setMode(MODES[(i + (e.key === 'ArrowRight' ? 1 : MODES.length - 1)) % MODES.length].mode);
    tabs.querySelector('[aria-selected="true"]').focus();
  });
  const pane = el('div', { class: 'pane st-pane', id: 'st-pane', role: 'tabpanel' });
  const sayLine = el('p', { class: 'studio-say', role: 'status', 'aria-live': 'polite' });
  const savedBox = el('p', { class: 'saved' });
  const bagNote = el('p', { class: 'bag-note' });
  const playBtn = el('button', { type: 'button', class: 'btn', 'data-act': 'play', onclick: () => { location.hash = '#/play'; } }, 'Play');
  const toBagBtn = el('button', { type: 'button', class: 'btn btn-primary add-btn', 'data-act': 'to-bag', onclick: () => putInBag() }, 'Put in my bag');
  const download = menuButton('Download', () => [
    { label: 'Sheet picture (PNG)', onclick: () => downloadSheet() },
    { label: `File for the library (${S.def.id}.js)`, onclick: () => downloadFile() },
    { label: 'Sheet and its animation list (ZIP)', onclick: () => downloadZip() },
  ], { up: true, right: true, cls: 'btn', act: 'download' });
  const foot = el('div', { class: 'rx-foot st-foot' }, savedBox, playBtn, toBagBtn, download, bagNote);
  const panel = el('section', { class: 'rx-panel studio-panel', 'aria-label': 'Change it' }, el('div', { class: 'tune' }, el('div', { class: 'tune-head' }, tabs), pane), sayLine, foot);

  function drawFoot() {
    const st = S.saveState;
    const keepBtn = el('button', { type: 'button', class: 'btn btn-sm', onclick: () => downloadFile() }, 'Download the file');
    if (st.kind === 'error') {
      savedBox.className = 'saved is-warn';
      savedBox.replaceChildren(el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'saved-text' }, 'Could not be saved'), el('small', {}, st.error.replace(/^Your draft could not be saved: (.)/, (_, c) => c.toUpperCase())), keepBtn);
    } else if (st.kind === 'memory') {
      savedBox.className = 'saved is-warn';
      savedBox.replaceChildren(el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'saved-text' }, 'Not kept after this tab closes'), el('small', {}, 'This browser is not saving for this site. Download the file to keep it.'), keepBtn);
    } else {
      savedBox.className = 'saved' + (saver.pending() ? ' is-saving' : '');
      savedBox.replaceChildren(el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'saved-text' }, saver.pending() ? 'Saving…' : 'Saved on this computer'),
        el('small', {}, S.bagKey && S.bagError ? 'Your bag has an older copy' : S.bagKey ? 'In your bag · updates as you work' : S.changes ? `${S.changes} change${S.changes === 1 ? '' : 's'} this visit` : 'Every change is kept as you go'));
      // item S10 (Q1): a copy that stays as it is now, beside the bag item that follows the draft
      if (S.bagKey && !S.bagError) savedBox.append(el('button', { type: 'button', class: 'link st-keep', 'data-act': 'keep-copy', onclick: () => keepCopy() }, 'Keep a copy in the bag'));
    }
    const takes = bagTakesStudio(S.def);
    toBagBtn.disabled = !takes || (!!S.bagKey && !S.bagError);
    toBagBtn.textContent = S.bagKey && S.bagError ? 'Update my bag' : S.bagKey ? 'In your bag' : 'Put in my bag';
    toBagBtn.title = S.bagError ?? '';
    playBtn.disabled = !S.bagKey;
    playBtn.title = S.bagKey ? 'Try it in the playground' : 'Put it in your bag first';
    bagNote.hidden = takes;
    bagNote.textContent = takes ? '' : 'The bag and the playground take studio sprites soon. For now, download the file or the sheet.';
  }

  function drawPane() {
    const k = document.activeElement?.closest?.('#st-pane') ? document.activeElement.dataset.k ?? document.activeElement.id : null;
    const scroll = pane.scrollTop;
    for (const b of tabs.children) { const on = MODES.find((m) => m.id === b.dataset.mode).mode === S.mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
    pane.setAttribute('aria-labelledby', `st-tab-${MODES.find((m) => m.mode === S.mode).id}`);
    pane.replaceChildren(...[PANES[S.mode](E)].flat(Infinity).filter(Boolean));
    pane.scrollTop = scroll;
    if (k) (pane.querySelector(`[data-k="${CSS.escape(k)}"]`) ?? pane.querySelector(`#${CSS.escape(k)}`))?.focus({ preventScroll: true });
    // where each handle is drawn, for the rows (and for whoever drives the page)
    const pos = stage.positions();
    for (const r of pane.querySelectorAll('.handle-row[data-handle]')) { const at = pos.get(r.dataset.handle); r.dataset.at = at ? at.join(',') : ''; }
  }

  function drawAll() {
    title.textContent = S.def.name;
    sub.textContent = S.def.blurb || 'A studio draft. Change it on the right; it is kept as you go.';
    document.title = `${S.def.name} · Studio · Loadout`;
    drawStageTools();
    stage.draw();
    drawUnder();
    drawPane();
    drawFoot();
  }

  // ---- changes ----
  let sayTimer = null;
  function say(text) {
    sayLine.textContent = text ?? '';
    clearTimeout(sayTimer);
    if (text) sayTimer = setTimeout(() => { sayLine.textContent = ''; }, 6000);
  }
  /** Keep a change: validated, on the undo stack, saved shortly; a change that would break it is refused and said. */
  function commit(def, note) {
    const v = acceptChange(def);
    if (!v.ok) { S.live = null; say(v.message); drawAll(); return false; }
    if (!history.push(v.def)) { if (JSON.stringify(v.def) === JSON.stringify(S.def)) { stage.draw(); return false; } }
    setDef(v.def);
    S.changes++;
    if (note) say(note);
    return true;
  }
  function setDef(def) {
    S.def = def;
    S.live = null;
    // whatever was picked may be gone
    if (!X.hasClip(def, S.clip)) S.clip = Object.keys(def.clips)[0];
    if (!X.hasClip(def, S.lookClip)) S.lookClip = X.hasClip(def, def.preview) ? def.preview : S.clip;
    if (S.bodyClip && !X.hasClip(def, S.bodyClip)) S.bodyClip = null;
    S.frame = Math.min(S.frame, def.clips[S.clip].frames - 1);
    if (X.isRig(def) && !def.body.rig.bones.some((b) => b.id === S.sel.bone)) S.sel = { bone: def.body.rig.bones[0]?.id, handle: null };
    if (S.sel.handle && !X.handles(def, ctx()).some((h) => h.id === S.sel.handle)) S.sel = { ...S.sel, handle: null };
    saver.schedule(def);
    drawAll();
    saveUrl();
  }
  function undo() { const d = history.undo(); if (d) { setDef(d); say('Undone.'); } }
  function redo() { const d = history.redo(); if (d) { setDef(d); say('Done again.'); } }

  function saveUrl() {
    const mode = MODES.find((m) => m.mode === S.mode).id;
    const q = new URLSearchParams({ mode });
    if (S.mode === 'move' || S.mode === 'frames') { q.set('clip', S.clip); q.set('frame', String(S.frame)); }
    const hash = `#/studio/${encodeURIComponent(id)}?${q}`;
    if (location.hash !== hash) history_.replaceState(history_.state, '', hash);
  }
  const history_ = window.history;

  function setMode(mode) {
    if (S.mode === mode) return;
    S.mode = mode;
    S.playing = mode === 'look' && !reduceMotion.matches;
    S.started = performance.now();
    S.newClipOpen = false;
    if (S.sel.handle && !X.handles(S.def, ctx()).some((h) => h.id === S.sel.handle)) S.sel = { ...S.sel, handle: null };
    drawAll(); saveUrl(); loop();
  }
  function setClip(name) {
    if (!X.hasClip(S.def, name)) return;
    S.clip = name; S.frame = 0; S.playing = false; S.sel = { ...S.sel, handle: null };
    drawAll(); saveUrl();
  }
  function setFrame(f, focus = false) {
    S.frame = f; S.playing = false;
    stage.draw(); drawUnder(); drawPane(); saveUrl();
    if (focus) under.querySelector(`.timeline [data-frame="${f}"]`)?.focus();
  }
  function select(sel, { keepFocus = false } = {}) {
    S.sel = { bone: sel.bone ?? S.sel.bone, handle: sel.handle ?? null };
    stage.draw();
    if (!keepFocus) drawPane();
    else for (const r of pane.querySelectorAll('.handle-row[data-handle]')) { const on = r.dataset.handle === S.sel.handle; r.classList.toggle('on', on); r.querySelector('.handle-name')?.setAttribute('aria-pressed', String(on)); }
  }

  // ---- the moves the panes and the keyboard make ----
  const E = {
    S, ctx, say, select, setMode, setClip, positions: () => stage.positions(),
    // item S10 and S12 (app/studio/more-panes.js): the pane drawn again when something it waited for arrives; an
    // advice line selects what it is about (a frame of an animation, or a shape on its bone)
    redraw: () => { drawPane(); drawUnder(); },
    goFrame: (clip, frame, focus) => {
      if (!X.hasClip(S.def, clip)) return;
      setMode('frames');
      if (S.clip !== clip) setClip(clip);
      setFrame(Math.max(0, Math.min(S.def.clips[clip].frames - 1, frame | 0)));
      (focus ? pane.querySelector(`[data-k="${CSS.escape(focus)}"]`) : under.querySelector(`.timeline [data-frame="${S.frame}"]`))?.focus();
    },
    goShape: (shape, bone) => {
      if (!X.isRig(S.def)) return;
      setMode('body');
      S.bodyClip = null;
      select({ bone, handle: `bone:${bone}` });
      drawUnder();
      const r = pane.querySelector(`.shape-row[data-shape="${CSS.escape(shape)}"]`);
      r?.scrollIntoView?.({ block: 'nearest' });
      r?.querySelector('select, button')?.focus({ preventScroll: true });
    },
    commit: (def, note) => commit(def, note),
    rename: (name) => commit(X.setName(S.def, name, taken(name))),
    setFacing: (f) => { S.facing = f; S.sel = { ...S.sel, handle: null }; drawAll(); },
    nudge: (hid, dx, dy) => { S.sel = { ...S.sel, handle: hid, bone: hid.startsWith('bone:') ? hid.slice(5) : S.sel.bone }; commit(X.nudgeHandle(S.def, ctx(), hid, dx, dy)); focusRow(hid); },
    turn: (bone, deg) => { commit(X.turnBone(S.def, ctx(), bone, deg)); focusRow(`bone:${bone}`); },
    addBone: () => {
      const r = X.addBone(S.def, S.sel.bone ?? S.def.body.rig.bones[0].id);
      if (r.error) return say(r.error);
      if (commit(r.def, `${X.boneLabel(r.def, r.id)} added on the end of ${X.boneLabel(r.def, r.def.body.rig.bones.find((b) => b.id === r.id).parent)}. Drag its tip to shape it.`)) select({ bone: r.id, handle: `bone:${r.id}` });
    },
    removeShape: (sid) => {
      const s = X.isRig(S.def) ? S.def.body.rig.shapes.find((x) => x.id === sid) : null;
      if (!s) return;
      if (commit(X.removeShape(S.def, sid), `${X.shapeLabel(s, S.def).split(',')[0]} removed. Undo brings it back.`)) pane.querySelector('[data-k="add-shape"]')?.focus({ preventScroll: true });
    },
    removeBoneByKey: (bid) => {
      const under = S.def.body.rig.bones.filter((b) => b.parent === bid).length;
      if (under && armed !== bid) { armed = bid; say(`${X.boneLabel(S.def, bid)} has bones hanging from it. Press Delete again to remove it with them.`); return; }
      armed = null;
      E.removeBone(bid);
    },
    removeBone: (bid) => {
      const r = X.removeBone(S.def, bid);
      if (r.error) return say(r.error);
      commit(r.def, `Removed ${r.removed.bones} bone${r.removed.bones === 1 ? '' : 's'} and ${r.removed.shapes} shape${r.removed.shapes === 1 ? '' : 's'}. Undo brings them back.`);
    },
    addShape: (kind) => {
      const r = X.addShape(S.def, S.sel.bone, kind);
      if (r.error) return say(r.error);
      commit(r.def, 'Shape added. Change its colour, size and front or back in its row.');
    },
    addClip: (name, label) => {
      const r = X.addClip(S.def, name, { label });
      if (r.error) return say(r.error);
      S.newClipOpen = false;
      if (commit(r.def, `${label} added as a copy of Idle. Pose it frame by frame.`)) setClip(r.names[0]);
    },
    removeClip: (name) => { if (commit(X.removeClip(S.def, name), `${X.hasClip(S.def, name) ? S.def.clips[name].label : 'The animation'} removed. Undo brings it back.`)) setClip(Object.keys(S.def.clips)[0]); },
    toggleNewClip: () => { S.newClipOpen = !S.newClipOpen; drawPane(); if (S.newClipOpen) pane.querySelector('[data-k="call-it"]')?.focus(); },
    addKey: () => commit(X.addKey(S.def, S.clip, S.frame), `Key added on frame ${S.frame + 1}.`),
    deleteKey: () => commit(X.deleteKey(S.def, S.clip, S.frame), `Key on frame ${S.frame + 1} deleted.`),
    copyKey: () => { S.clipboard = X.copyKey(S.def, S.clip, S.frame); say(S.clipboard ? `Key of frame ${S.frame + 1} copied.` : 'There is no key on this frame to copy.'); drawPane(); },
    pasteKey: () => { if (S.clipboard) commit(X.pasteKey(S.def, S.clip, S.frame, S.clipboard), `Key pasted on frame ${S.frame + 1}.`); },
    setFrames: (n) => {
      const r = X.setFrames(S.def, S.clip, n);
      const merged = r.merged.length ? ` Keys that landed on one frame became one (frame${r.merged.length === 1 ? '' : 's'} ${r.merged.map((m) => m.frame + 1).join(', ')}).` : '';
      commit(r.def, r.error ?? `${r.def.clips[S.clip].frames} frames: the keys kept their place in the motion.${merged}`);
    },
    setLoop: (on) => { const r = X.setLoop(S.def, S.clip, on); commit(r.def, r.merged.length ? 'Keys that landed on one frame became one.' : null); },
    addSlider: () => {
      const r = X.addSlider(S.def, { label: X.boneLabel(S.def, S.sel.bone), bone: S.sel.bone });
      if (r.error) return say(r.error);
      commit(r.def, 'Slider added: people who use it can make it longer or shorter.');
    },
    addPart: () => {
      const r = X.addPart(S.def, { label: X.boneLabel(S.def, S.sel.bone), shapes: S.def.body.rig.shapes.filter((s) => s.bone === S.sel.bone).map((s) => s.id) });
      if (r.error) return say(r.error);
      commit(r.def, 'Part made: people can switch it off.');
    },
  };
  function focusRow(hid) { pane.querySelector(`.handle-row[data-handle="${CSS.escape(hid)}"] .handle-name`)?.focus({ preventScroll: true }); }

  // ---- playing ----
  let raf = 0;
  S.started = performance.now();
  function playingClip() { return S.mode === 'look' ? S.lookClip : S.mode === 'body' ? S.bodyClip : S.clip; }
  function loop() {
    cancelAnimationFrame(raf);
    if (!S.playing) return;
    const tick = (now) => {
      const name = playingClip();
      const c = X.hasClip(S.def, name) ? S.def.clips[name] : null;
      if (!S.playing || !c) return;
      const f = Math.floor(((now - S.started) / 1000) * c.fps * 1.05) % c.frames;
      if (f !== S.frame) {
        S.frame = f;
        stage.draw();
        for (const b of under.querySelectorAll('.timeline .frame')) b.setAttribute('aria-current', String(Number(b.dataset.frame) === f));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function togglePlay() {
    S.playing = !S.playing;
    S.started = performance.now() - (S.frame / ((X.hasClip(S.def, playingClip()) && S.def.clips[playingClip()].fps) || 10) / 1.05) * 1000;
    if (!S.playing) { drawPane(); }
    drawUnder(); stage.draw(); loop();
    under.querySelector('[data-act="play-pause"]')?.focus();
  }

  // ---- the bag, the downloads ----
  async function putInBag() {
    if (!bagTakesStudio(S.def)) return;
    // the bag takes the draft as it is saved, so the latest change is saved first
    const f = saver.flush();
    if ((f && !f.ok) || drafts.pending()) { say('It could not go in your bag: your latest change is not saved yet. Download the file to keep it.'); return; }
    toBagBtn.disabled = true;
    let r;
    try { r = await studio.toBag(id); } catch (e) { r = { ok: false, errors: [String(e?.message ?? e)] }; }
    if (!r?.ok) { say(`It could not go in your bag: ${(r?.errors ?? [])[0] ?? 'the bag did not take it'}`); drawFoot(); return; }
    S.bagKey = r.key ?? S.bagKey;
    S.bagError = null;
    const warn = (r.warnings ?? [])[0];
    say(r.added === false ? 'Your bag has this version now.' : `In your bag. It updates as you work; Play tries it in the playground.${warn ? ` ${warn}` : ''}`);
    drawFoot();
  }
  /** Keep a frozen copy of the bag item beside it (app/bag.js keepCopy): the copy stays as the sprite is now; the item keeps following the draft. */
  function keepCopy() {
    if (!S.bagKey) return;
    const f = saver.flush();
    if ((f && !f.ok) || drafts.pending()) { say('No copy was made: your latest change is not saved yet. Download the file to keep it.'); return; }
    let k = null;
    try { k = typeof bagModule.bag.keepCopy === 'function' ? bagModule.bag.keepCopy(S.bagKey) : null; } catch (e) { say(`No copy was made: ${String(e?.message ?? e).slice(0, 160)}`); return; }
    say(k ? 'A copy that stays as it is now is in your bag. The other one keeps following your changes.' : 'No copy was made: it is no longer in your bag. Put it in again first.');
  }
  async function downloadFile() {
    const f = await libraryFile(S.def, assetById(S.def.id) ? [S.def.id] : undefined);
    if (!f.ok) { say(`The file could not be made: ${f.errors[0]}`); return; }
    saveBlob(new Blob([f.text], { type: 'text/javascript' }), f.name);
    say(`${f.name} downloaded. Put it in the library's sprites folder to add it there.`);
  }
  async function sheetPng() {
    const s = sheetOf(S.def);
    if (s.error) { say(`The sheet could not be made: ${s.error}`); return null; }
    const cv = document.createElement('canvas');
    cv.width = s.w; cv.height = s.h;
    cv.getContext('2d').putImageData(new ImageData(s.rgba, s.w, s.h), 0, 0);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    return { blob, meta: s.meta };
  }
  async function downloadSheet() {
    const s = await sheetPng();
    if (!s) return;
    saveBlob(s.blob, `${S.def.id}.png`);
    say(`${S.def.id}.png downloaded: every animation a row, every frame a cell.`);
  }
  async function downloadZip() {
    const s = await sheetPng();
    if (!s) return;
    const enc = new TextEncoder();
    const files = [{ name: `${S.def.id}.png`, data: new Uint8Array(await s.blob.arrayBuffer()) }, { name: `${S.def.id}.json`, data: enc.encode(JSON.stringify(s.meta, null, 2)) }];
    const f = await libraryFile(S.def);
    if (f.ok) files.push({ name: f.name, data: enc.encode(f.text) });
    saveBlob(zip(files), `${S.def.id}.zip`);
    say(`${S.def.id}.zip downloaded: the sheet, its animation list and the file for the library.`);
  }

  // ---- the keyboard (docs/studio.md section 5) ----
  // Delete removes a bone only when its handle is picked, and asks for a second press when bones hang from it
  let armed = null;
  function onKey(e) {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && !e.altKey && (k === 'z' || k === 'Z' || k === 'y')) {
      if (isTyping(e.target)) return;      // a text box has its own undo
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (mod || e.altKey || isTyping(e.target)) return;
    if (e.target instanceof HTMLElement && e.target.closest('.menu')) return;
    const mode = MODES.find((m) => m.key === k);
    if (mode) { e.preventDefault(); setMode(mode.mode); return; }
    const framed = S.mode === 'move' || S.mode === 'frames';
    const n = S.def.clips[S.clip].frames;
    if (k === ' ' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) { e.preventDefault(); togglePlay(); return; }
    if (k === 'Escape') { if (S.sel.handle || S.newClipOpen) { S.newClipOpen = false; select({ handle: null }); } return; }
    if (S.sel.handle && k.startsWith('Arrow') && !(e.target instanceof HTMLElement && e.target.closest('.timeline, .tabs, .chips, .seg'))) {
      e.preventDefault();
      const step = e.shiftKey ? 4 : 1;
      const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      E.nudge(S.sel.handle, dx, dy);
      return;
    }
    if (framed && (k === 'ArrowLeft' || k === 'ArrowRight') && !(e.target instanceof HTMLElement && e.target.closest('.tabs, .chips, .seg'))) { e.preventDefault(); setFrame((S.frame + (k === 'ArrowRight' ? 1 : -1) + n) % n); return; }
    if (S.mode === 'move' && (k === '[' || k === ']')) {
      const ks = [...X.keyFrames(S.def, S.clip)].sort((a, b) => a - b);
      if (!ks.length) return;
      e.preventDefault();
      const next = k === ']' ? ks.find((f) => f > S.frame) ?? ks[0] : [...ks].reverse().find((f) => f < S.frame) ?? ks.at(-1);
      setFrame(next);
      return;
    }
    if (S.mode === 'move' && (k === 'k' || k === 'K')) { e.preventDefault(); E.addKey(); return; }
    if ((k === 'r' || k === 'R') && S.sel.bone && (S.mode === 'body' || S.mode === 'move')) { e.preventDefault(); E.turn(S.sel.bone, e.shiftKey ? -5 : 5); return; }
    if (k === 'Delete' || k === 'Backspace') {
      const shapeRow = e.target instanceof HTMLElement ? e.target.closest('.shape-row[data-shape]') : null;
      if (S.mode === 'move' && X.keyIndexAt(S.def, S.clip, S.frame) >= 0) { e.preventDefault(); E.deleteKey(); }
      else if (S.mode === 'body' && shapeRow) { e.preventDefault(); E.removeShape(shapeRow.dataset.shape); }
      else if (S.mode === 'body' && S.sel.handle?.startsWith('bone:')) { e.preventDefault(); E.removeBoneByKey(S.sel.handle.slice(5)); }
    } else armed = null;
  }
  document.addEventListener('keydown', onKey);

  // ---- the page ----
  const main = el('main', { class: 'v2 rx studio', 'data-draft': id }, stageCol, panel);
  app.replaceChildren(header('studio'), main);
  const ro = new ResizeObserver(() => { drawStageTools(); stage.draw(); });
  ro.observe(stage.node);
  const flush = () => { saver.flush(); };
  window.addEventListener('pagehide', flush);
  drawAll();
  loop();
  saveUrl();

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(sayTimer);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', flush);
    ro.disconnect();
    saver.flush();
  };
}
