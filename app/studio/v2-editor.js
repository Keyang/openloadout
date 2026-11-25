// The studio's editor for version 2 sprites, every body (build item B17; docs/data-sprites.md section 6; Contract 15
// rules 1, 6 and 7): #/studio/<draft>?mode=body|clips|look|check|all for a draft whose definition is `loadout-sprite`
// version 2 (app/studio/editor.js hands such a draft here; version 1 drafts keep their own editor).
//   Left: the live picture, drawn by the framework renderer (engine/data-sprite.js through app/studio/v2-check.js
//   spriteOf) at a whole zoom, the clip's frames under it, Play; drag the picked item on the picture to move it.
//   Right, five tabs:
//     Body        the body's lists of shapes, stamps and generator calls (the pictures editor: add, move, order, copy,
//                 delete; a stamp painted pixel by pixel; a generator's arguments from the registry's documented types),
//                 and everything else in the body as a tree of typed inputs (the dedicated tile, layer, 9-slice and
//                 particle editors are build item B19; an emitter list gets the particle editor, app/studio/v2-particles*.js, B19a)
//     Clips       each clip's frames, speed, looping, keys, frame edits and sounds (a tree), clips added and removed
//     Look & name name, words, palette slots (label, colour), the controls people get, parts (for a character that
//                 extends a base, picked from the library: app/studio/v2-parts-pane.js, B20), and a try-out of them
//     Check       the validator's errors and warnings (also shown beside the rows they are about) and the quality bar's
//                 findings, worked out in a background worker (advice only: Contract 14 rule 7)
//     All fields  the whole definition as one tree
//   Footer: saved state, Put in my bag (the bag item follows later edits: Keyang's Q1), Download <id>.json or a sheet.
// A change is kept even when it leaves mistakes (so a control can be added and then bound): it is saved as the draft,
// its errors are shown, and the picture, the bag and the file wait until it passes; Undo and Redo step through changes.
import { el, header, saveBlob, reduceMotion } from '../ui.js';
import * as bagModule from '../bag.js';
import { renderSheet, defaultParams, renderFrame, cleanParams, clipFps } from '../../engine/sprite.js';
import { createSaver } from './drafts.js';
import { bagTakes, followBag } from './keep.js';
import { menuButton } from './bits.js';
import * as M from './v2-model.js';
import { generatorsFor, newCall } from './v2-gen.js';
import { newStamp } from './v2-stamp.js';
import { checkFull, spriteOf, loadPiecesFor } from './v2-check.js';
import { fieldTree, genEditor, stampPainter, itemList, swatchOf } from './v2-fields.js';
import { layersEditor } from './v2-layers.js';
import { slicePane } from './v2-slice-pane.js';
import { partsPane } from './v2-parts-pane.js';
import { baseOf } from './v2-parts.js';
import { particleEditor } from './v2-particles-pane.js';
import { tilesPane } from './v2-tiles.js';
import { handlesUi } from './v2-handles-ui.js';

/** The tabs: their address word, key and name. */
export const V2_MODES = Object.freeze([
  { id: 'body', key: '1', label: 'Body' },
  { id: 'clips', key: '2', label: 'Clips' },
  { id: 'look', key: '3', label: 'Look & name' },
  { id: 'check', key: '4', label: 'Check' },
  { id: 'all', key: '5', label: 'All fields' },
]);

/** The most characters of a definition the undo stack keeps a snapshot of (a version 2 definition is at most 128 KB). */
const SNAPSHOT_CHARS = 128 * 1024;
const UNDO_STEPS = 200;
const ADVICE_DELAY = 1200;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isTyping = (t) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.classList.contains('v2-stampgrid')) && !(t instanceof HTMLInputElement && ['checkbox', 'radio', 'button'].includes(t.type));
const pathKey = (p) => (p ? p.join('.') : '');
const keyPath = (k) => (k ? k.split('.').map((x) => (/^\d+$/.test(x) ? Number(x) : x)) : null);
const siteStudio = { ready: () => typeof window.loadout?.studio?.toBag === 'function', toBag: (id) => window.loadout.studio.toBag(id) };

/** An undo stack of JSON snapshots: { push (false for the same definition again or one too big), undo, redo, canUndo, canRedo }. */
function undoStack(first) {
  const steps = [JSON.stringify(first)];
  let at = 0;
  return {
    push(def) {
      const t = JSON.stringify(def);
      if (t === steps[at] || t.length > SNAPSHOT_CHARS) return false;
      steps.splice(at + 1);
      steps.push(t);
      if (steps.length > UNDO_STEPS) steps.splice(0, steps.length - UNDO_STEPS);
      at = steps.length - 1;
      return true;
    },
    undo() { return at > 0 ? JSON.parse(steps[--at]) : null; },
    redo() { return at < steps.length - 1 ? JSON.parse(steps[++at]) : null; },
    canUndo: () => at > 0,
    canRedo: () => at < steps.length - 1,
  };
}

/** A Surface as a canvas of its own size. */
function canvasOf(g) {
  const c = document.createElement('canvas');
  c.width = g.w; c.height = g.h;
  c.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
  return c;
}

/**
 * Draws the version 2 editor for one draft into `app` and returns its teardown. Arguments: app, { id (the draft), entry
 * ({ definition, savedAt, bagKey? }), drafts (app/studio/drafts.js), kept, query, studio ({ ready, toBag }) }.
 */
export function v2EditorPage(app, { id, entry, drafts, kept, query = {}, studio = siteStudio }) {
  const first = entry.definition;
  const S = {
    def: first, live: null, tab: V2_MODES.some((m) => m.id === query.mode) ? query.mode : 'body',
    clip: typeof query.clip === 'string' ? query.clip : null, frame: Math.max(0, Number.parseInt(query.frame, 10) || 0), playing: false,
    sel: null, stamp: null, stampState: { paint: undefined, tool: 'pencil', variant: '' }, zoom: null, params: {},
    errors: [], warnings: [], sprite: null, clean: null, cleanFor: null, stale: false, checking: true, adding: null, newClip: false,
    saveState: kept ? { kind: 'saved', at: entry.savedAt } : { kind: 'memory' }, changes: 0, bagKey: entry.bagKey ?? null, bagError: null,
    advice: null, adviceBusy: false,
  };
  const history = undoStack(first);
  const saver = createSaver({ save: (def) => saveNow(def) });

  // ---- checking and drawing: the pieces it names loaded, the full check, then the framework's sprite ----
  let checkRun = 0;
  async function refresh() {
    const run = ++checkRun;
    S.checking = true;
    const def = S.def;
    await loadPiecesFor(def);
    if (run !== checkRun) return;
    const v = checkFull(def);
    S.errors = v.errors ?? [];
    S.warnings = v.warnings ?? [];
    if (v.ok) {
      const m = spriteOf(v.value);
      if (m.ok) { S.sprite = m.sprite; S.clean = v.value; S.cleanFor = def; S.stale = false; }
      else { S.errors = m.errors; S.stale = true; }
    } else S.stale = true;
    S.checking = false;
    if (S.sprite) {
      const names = Object.keys(S.sprite.clips);
      if (!names.includes(S.clip)) { S.clip = names.includes(S.sprite.preview) ? S.sprite.preview : names[0]; S.frame = 0; }
      S.frame = Math.min(S.frame, S.sprite.clips[S.clip].frames - 1);
    }
    thumbs = new Map();
    drawAll();
    if (!S.stale) { scheduleAdvice(); if (S.bagKey && !saver.pending()) followNow(); }
  }

  // ---- saving: kept as it is (mistakes and all); the bag follows only a definition that passes ----
  function saveNow(def) {
    const r = drafts.put(id, def);
    S.saveState = !r.ok ? { kind: 'error', error: r.error } : kept ? { kind: 'saved', at: Date.now() } : { kind: 'memory' };
    const latest = drafts.get(id);
    S.bagKey = latest?.bagKey ?? S.bagKey;
    // the bag item follows only a definition that passes: one with mistakes leaves the bag on the last that passed
    if (S.bagKey && S.clean && S.cleanFor === def && !S.stale) {
      const f = followBag(bagModule, S.bagKey, S.clean);
      if (f.state === 'updated') S.bagError = null;
      else if (f.state === 'gone') { S.bagKey = null; S.bagError = null; drafts.put(id, def, { bagKey: null }); say(f.message); }
      else { S.bagError = f.message; say(f.message); }
    }
    drawFoot();
    return r;
  }

  /** The bag item given the definition that passed (when its check ended after the save). */
  function followNow() {
    const f = followBag(bagModule, S.bagKey, S.clean);
    if (f.state === 'updated') S.bagError = null;
    else if (f.state === 'gone') { S.bagKey = null; S.bagError = null; drafts.put(id, S.def, { bagKey: null }); say(f.message); }
    else { S.bagError = f.message; say(f.message); }
    drawFoot();
  }

  /** Keep a change: on the undo stack, saved shortly, checked and drawn again. */
  function commit(def, note) {
    if (JSON.stringify(def) === JSON.stringify(S.def)) return false;
    history.push(def);
    S.def = def;
    S.live = null;
    S.changes++;
    if (S.sel && M.getAt(def, keyPath(S.sel)) === undefined) S.sel = null;
    if (S.stamp && M.getAt(def, keyPath(S.stamp))?.kind !== 'stamp') S.stamp = null;
    saver.schedule(def);
    if (note) say(note);
    drawAll();
    refresh();
    return true;
  }
  /** A change at a path (value undefined removes it). */
  function change(path, value, note) {
    let next;
    try { next = M.setAt(S.def, path, value); } catch (e) { say(`That change was not made: ${String(e?.message ?? e)}`); return false; }
    return commit(next, note);
  }
  function undo() { const d = history.undo(); if (d) { S.def = d; saver.schedule(d); say('Undone.'); drawAll(); refresh(); } }
  function redo() { const d = history.redo(); if (d) { S.def = d; saver.schedule(d); say('Done again.'); drawAll(); refresh(); } }

  // ---- the left column: the picture, its tools, the frames ----
  const title = el('h1', {}, first.name ?? id);
  const sub = el('p', { class: 'blurb' });
  const canvas = el('canvas', { class: 'studio-canvas', role: 'img', 'aria-label': 'The sprite' });
  const card = el('div', { class: 'stage-card tile studio-card v2-card' }, el('div', { class: 'stage-wrap' }, canvas));
  const stageNote = el('p', { class: 'v2-stagenote', role: 'status', 'aria-live': 'polite' });
  const zoomWord = el('span', { class: 'st-zoom num', 'aria-live': 'polite' });
  const undoBtn = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'undo', title: 'Undo (Ctrl+Z)', onclick: () => undo() }, 'Undo');
  const redoBtn = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'redo', title: 'Redo (Shift+Ctrl+Z)', onclick: () => redo() }, 'Redo');
  const zoomBox = el('span', { class: 'st-zoombox' }, el('button', { type: 'button', class: 'icon-btn st-icon', 'aria-label': 'Zoom out', onclick: () => zoomBy(-1) }, '−'), zoomWord, el('button', { type: 'button', class: 'icon-btn st-icon', 'aria-label': 'Zoom in', onclick: () => zoomBy(1) }, '+'));
  const tools = el('div', { class: 'st-tools' }, zoomBox, el('span', { class: 'st-gap' }), undoBtn, redoBtn);
  const under = el('div', { class: 'st-under' });
  const stageCol = el('section', { class: 'rx-stage studio-stage', 'aria-label': 'The picture' },
    el('div', { class: 'rx-head' }, el('a', { class: 'st-back', href: '#/studio' }, el('span', { 'aria-hidden': 'true' }, '‹ '), 'All drafts'), title, sub),
    card, tools, under, stageNote);

  let layout = null;          // where the frame was drawn: { ox, oy, z }
  const fitZoom = (cw, ch, w, h) => Math.max(1, Math.floor(Math.min((cw - 8) / w, (ch - 8) / h)));
  function drawStage() {
    const box = card.getBoundingClientRect();
    const cw = Math.max(1, Math.floor(box.width)), ch = Math.max(1, Math.floor(box.height));
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) { canvas.width = cw * dpr; canvas.height = ch * dpr; }
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const sprite = liveSprite ?? S.sprite;
    if (!sprite) { layout = null; zoomWord.textContent = ''; return; }
    const [W, H] = sprite.size;
    const fit = fitZoom(cw, ch, W, H);
    const z = Math.max(1, Math.min(fit, S.zoom ?? Math.min(fit, 12)));
    zoomWord.textContent = `${z}×`;
    const ox = Math.floor((cw - W * z) / 2), oy = Math.floor((ch - H * z) / 2);
    layout = { ox, oy, z };
    let pic;
    try { pic = canvasOf(renderFrame(sprite, S.clip, Math.min(S.frame, sprite.clips[S.clip].frames - 1), cleanParams(sprite, S.params))); } catch (e) { stageNote.textContent = `This frame could not be drawn: ${String(e?.message ?? e).slice(0, 200)}`; return; }
    g.imageSmoothingEnabled = false;
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.strokeRect(ox - 0.5, oy - 0.5, W * z + 1, H * z + 1);
    g.drawImage(pic, ox, oy, W * z, H * z);
    if (S.stale) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(ox, oy, W * z, H * z); }
    particles.drawOver(g, layout, sprite);
    handles.drawOver(g, layout, sprite);
  }
  function zoomBy(n) {
    const b = card.getBoundingClientRect();
    const sprite = S.sprite;
    if (!sprite) return;
    const fit = fitZoom(b.width, b.height, sprite.size[0], sprite.size[1]);
    S.zoom = Math.max(1, Math.min(fit, (layout?.z ?? 1) + n));
    drawStage();
  }

  // drag the picked item on the picture: its points move by whole sprite pixels; the change is kept when the press ends
  let liveSprite = null, drag = null;
  // the anchor, and a rig's bones and IK ends, as handles on the picture (app/studio/v2-handles-ui.js)
  const handles = handlesUi({ state: () => S, commit, say: (t) => say(t), drawStage: () => drawStage(), setLive: (sp) => { liveSprite = sp; drawStage(); }, canvas });
  stageCol.insertBefore(handles.bar, under);
  canvas.addEventListener('pointerdown', (e) => {
    if (particles.pointerDown(e, layout)) return;
    if (handles.pointerDown(e, layout)) return;
    if (!S.sel || !layout || S.stale) return;
    const item = M.getAt(S.def, keyPath(S.sel));
    if (!M.moveItem(item, 0, 0)) return;
    drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, item, path: keyPath(S.sel) };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = Math.round((e.clientX - drag.x) / layout.z), dy = Math.round((e.clientY - drag.y) / layout.z);
    if (dx === drag.dx && dy === drag.dy) return;
    drag.dx = dx; drag.dy = dy;
    const moved = M.setAt(S.def, drag.path, M.moveItem(drag.item, dx, dy));
    const m = spriteOf(moved);
    liveSprite = m.ok ? m.sprite : null;
    drawStage();
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null; liveSprite = null;
    canvas.classList.remove('is-dragging');
    if (d.dx || d.dy) change(d.path, M.moveItem(d.item, d.dx, d.dy), `Moved ${d.dx} across and ${d.dy} down.`);
    else drawStage();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // the frames of the clip in hand, small, under the picture
  let thumbs = new Map();
  function thumbOf(f) {
    const k = `${S.clip}:${f}`;
    if (!thumbs.has(k)) {
      let c;
      try { c = canvasOf(renderFrame(S.sprite, S.clip, f, cleanParams(S.sprite, S.params))); } catch { c = document.createElement('canvas'); }
      thumbs.set(k, c);
    }
    return thumbs.get(k);
  }
  function drawUnder() {
    const sp = S.sprite;
    if (!sp) { under.replaceChildren(); return; }
    const names = Object.keys(sp.clips);
    const chips = el('div', { class: 'chips clips', role: 'group', 'aria-label': 'Clips' }, names.map((n) => el('button', { type: 'button', class: 'chip', 'data-clip': n, 'aria-pressed': String(n === S.clip), onclick: () => setClip(n) }, sp.clips[n].label || n)));
    const n = sp.clips[S.clip].frames;
    const strip = el('div', { class: 'timeline', role: 'group', 'aria-label': `Frames of ${S.clip}` }, Array.from({ length: n }, (_, f) => el('button', { type: 'button', class: 'frame', 'data-frame': f, 'aria-current': String(f === S.frame), 'aria-label': `Frame ${f + 1}`, tabindex: f === S.frame ? '0' : '-1', onclick: () => setFrame(f),
      onkeydown: (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setFrame((S.frame + (e.key === 'ArrowRight' ? 1 : -1) + n) % n, true); } } }, thumbOf(f), el('span', { class: 'frame-n', 'aria-hidden': 'true' }, String(f + 1)))));
    const play = el('button', { type: 'button', class: 'btn btn-sm st-play', 'data-act': 'play-pause', 'aria-pressed': String(S.playing), onclick: () => togglePlay() }, S.playing ? 'Pause' : 'Play');
    under.replaceChildren(el('div', { class: 'st-timebar' }, play, chips), strip);
    strip.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function setClip(n) { S.clip = n; S.frame = 0; drawUnder(); drawStage(); saveUrl(); if (S.tab === 'clips') drawPane(); }
  function setFrame(f, focus = false) {
    S.frame = f; S.playing = false;
    drawStage(); drawUnder(); saveUrl();
    if (focus) under.querySelector(`.timeline [data-frame="${f}"]`)?.focus();
  }

  // ---- playing ----
  let raf = 0, started = 0;
  function loop() {
    cancelAnimationFrame(raf);
    if (!S.playing || !S.sprite) return;
    const tick = (now) => {
      if (!S.playing || !S.sprite) return;
      const c = S.sprite.clips[S.clip];
      const fps = clipFps(S.sprite, S.clip, cleanParams(S.sprite, S.params)) || 10;
      const f = Math.floor(((now - started) / 1000) * fps) % c.frames;
      if (f !== S.frame) {
        S.frame = f;
        drawStage();
        for (const b of under.querySelectorAll('.timeline .frame')) b.setAttribute('aria-current', String(Number(b.dataset.frame) === f));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function togglePlay() {
    S.playing = !S.playing && !!S.sprite;
    started = performance.now();
    drawUnder(); loop();
    under.querySelector('[data-act="play-pause"]')?.focus();
  }

  // ---- the right column ----
  const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Studio' }, V2_MODES.map((m) => el('button', { type: 'button', class: 'tab', role: 'tab', id: `v2-tab-${m.id}`, 'data-mode': m.id, 'aria-controls': 'st-pane', title: `${m.label} (${m.key})`, onclick: () => setTab(m.id) }, m.label)));
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault(); e.stopPropagation();
    const i = V2_MODES.findIndex((m) => m.id === S.tab);
    setTab(V2_MODES[(i + (e.key === 'ArrowRight' ? 1 : V2_MODES.length - 1)) % V2_MODES.length].id);
    tabs.querySelector('[aria-selected="true"]').focus();
  });
  const pane = el('div', { class: 'pane st-pane v2-pane', id: 'st-pane', role: 'tabpanel' });
  const sayLine = el('p', { class: 'studio-say', role: 'status', 'aria-live': 'polite' });
  const savedBox = el('p', { class: 'saved' });
  const bagNote = el('p', { class: 'bag-note' });
  const playBtn = el('button', { type: 'button', class: 'btn', 'data-act': 'play', onclick: () => { location.hash = '#/play'; } }, 'Play');
  const toBagBtn = el('button', { type: 'button', class: 'btn btn-primary add-btn', 'data-act': 'to-bag', onclick: () => putInBag() }, 'Put in my bag');
  const download = menuButton('Download', () => [
    { label: `File for the library (${S.def.id}.json)`, onclick: () => downloadFile(), disabled: S.stale },
    { label: 'Sheet picture (PNG)', onclick: () => downloadSheet(), disabled: S.stale },
  ], { up: true, right: true, cls: 'btn', act: 'download' });
  const foot = el('div', { class: 'rx-foot st-foot' }, savedBox, playBtn, toBagBtn, download, bagNote);
  const panel = el('section', { class: 'rx-panel studio-panel', 'aria-label': 'Change it' }, el('div', { class: 'tune' }, el('div', { class: 'tune-head' }, tabs), pane), sayLine, foot);

  function setTab(t) { if (S.tab === t) return; S.tab = t; pane.scrollTop = 0; drawPane(); drawStage(); saveUrl(); }

  let sayTimer = null;
  function say(text) {
    sayLine.textContent = text ?? '';
    clearTimeout(sayTimer);
    if (text) sayTimer = setTimeout(() => { sayLine.textContent = ''; }, 8000);
  }

  // ---- the panes ----
  const mini = (label, onclick, more = {}) => el('button', { type: 'button', class: 'btn btn-sm', onclick, ...more }, label);
  const tree = (value, path, more = {}) => fieldTree({ def: S.def, value, path, onChange: (p, v) => change(p, v), onStamp: (p) => openStamp(p), ...more });
  const errorBox = (list) => (list.length ? el('ul', { class: 'v2-errs' }, list.map((m) => el('li', {}, m))) : null);
  // the particle editor (B19a, app/studio/v2-particles-pane.js): each emitter list's cards, and their points on the picture
  const particles = particleEditor({ state: () => S, change, commit, say, drawStage: () => drawStage(), drawPane: () => drawPane(), setClip: (n) => setClip(n), setFrame: (f) => setFrame(f),
    togglePlay: () => togglePlay(), pick: (p) => { S.sel = p ? pathKey(p) : null; drawPane(); drawStage(); }, canvas, onStamp: (p) => openStamp(p) });
  function openStamp(p) {
    S.stamp = pathKey(p);
    // a stamp that is an item of a draw list is painted in its row
    if (M.itemListsOf(S.def).some((l) => pathKey(l.path) === pathKey(p.slice(0, -1)))) S.sel = pathKey(p);
    if (S.tab !== 'body') S.tab = 'body';
    drawPane();
    pane.querySelector('.v2-stamp')?.scrollIntoView?.({ block: 'nearest' });
  }

  /** The menu that adds to a draw list: shapes, a stamp, or a generator (picked from the registry). */
  function adderFor(list) {
    const nodes = M.nodesOf(S.def);
    const on = nodes[0];
    const rig = list.place === 'shapes';
    const paint = M.paintRefs(S.def)[0] ?? 'ink';
    const taken = M.itemIds(S.def);
    const items = [];
    if (list.place === 'draw' || list.place === 'shapes') {
      for (const k of M.SHAPE_KINDS) items.push({ label: M.SHAPE_WORDS[k], onclick: () => addItem(list, k === 'stamp' ? newStamp({ w: 4, h: 4, paint, ...(rig ? { bone: on } : on ? { on } : {}), at: on ? [-2, -2] : [Math.round((S.def.size?.[0] ?? 32) / 2) - 2, Math.round((S.def.size?.[1] ?? 32) / 2) - 2], id: M.uniqueId('pixels', taken) }) : M.newShape(k, { ...(rig ? { bone: on } : on ? { on } : {}), paint, taken })) });
    }
    items.push({ label: list.place === 'emitter' ? 'An emitter…' : list.place === 'motion' ? 'A motion…' : 'A generator…', onclick: () => { S.adding = pathKey(list.path); drawPane(); pane.querySelector('.v2-genpick select')?.focus(); } });
    return menuButton('Add', items, { k: `add-${pathKey(list.path)}`, act: `add-${pathKey(list.path)}` });
  }
  function addItem(list, item) {
    const items = M.getAt(S.def, list.path) ?? [];
    // a new shape goes before the first outline, so it is inked with the rest
    const ol = items.findIndex((x) => isObj(x) && x.kind === 'outline');
    const at = item.kind === 'outline' || ol < 0 ? items.length : ol;
    const p = [...list.path, at];
    if (commit(M.insertAt(S.def, list.path, at, item), `${M.itemLabel(item)} added.`)) {
      S.sel = pathKey(p);
      if (item.kind === 'stamp') S.stamp = pathKey(p);
      drawPane();
    }
  }
  /** The generator picker of a list: the registry's generators for its place, by family. */
  function genPicker(list) {
    const gens = generatorsFor(list.place);
    const fams = [...new Set(gens.map((g) => g.family))];
    const sel = el('select', { class: 'st-select', 'aria-label': 'Generator to add', 'data-k': 'gen-pick' }, fams.map((f) => el('optgroup', { label: f }, gens.filter((g) => g.family === f).map((g) => el('option', { value: g.key, title: g.about }, `${g.key}: ${g.about.slice(0, 70)}`)))));
    const about = el('p', { class: 'quiet small v2-about' }, gens[0]?.about ?? '');
    sel.addEventListener('change', () => { about.textContent = gens.find((g) => g.key === sel.value)?.about ?? ''; });
    const go = () => {
      const g = gens.find((x) => x.key === sel.value);
      if (!g) return;
      const nodes = M.nodesOf(S.def);
      const ids = M.itemIds(S.def);
      const call = newCall(g, { on: list.place === 'motion' || list.place === 'emitter' && !nodes.length ? undefined : nodes[0], node: nodes[0], paints: M.paintRefs(S.def), frame: S.def.size ?? [32, 32] });
      if (list.place === 'emitter') { call.id = M.uniqueId(g.id.split('.')[0], ids); if (!Object.hasOwn(call, 'at') && nodes.length === 0) call.at = [16, 16]; }
      S.adding = null;
      addItem(list, call);
    };
    return el('div', { class: 'v2-genpick' }, el('label', { class: 'st-lbl' }, `Add to ${list.label.toLowerCase()}: `), sel, mini('Add it', go, { 'data-act': 'add-gen' }), mini('Cancel', () => { S.adding = null; drawPane(); }), about);
  }
  /** What is shown under a picked item: move arrows, then its editor (stamp painter, generator arguments, or its fields). */
  function itemEditor(list, path) {
    const it = M.getAt(S.def, path);
    if (!isObj(it)) return null;
    const can = !!M.moveItem(it, 0, 0);
    const move = (dx, dy) => change(path, M.moveItem(it, dx, dy));
    const arrows = can ? el('span', { class: 'v2-move', role: 'group', 'aria-label': 'Move it' }, el('span', { class: 'st-lbl' }, 'Move '),
      mini('←', () => move(-1, 0), { 'aria-label': 'Move left one pixel' }), mini('↑', () => move(0, -1), { 'aria-label': 'Move up one pixel' }),
      mini('↓', () => move(0, 1), { 'aria-label': 'Move down one pixel' }), mini('→', () => move(1, 0), { 'aria-label': 'Move right one pixel' }),
      el('span', { class: 'quiet small' }, ' or drag it on the picture')) : null;
    let body;
    if (typeof it.gen === 'string') body = genEditor({ def: S.def, call: it, path, place: list.place, onChange: (p, v) => change(p, v), onStamp: (p) => openStamp(p) });
    else if (it.kind === 'stamp') {
      body = [stampPainter({ def: S.def, stamp: it, path, state: S.stampState, onChange: (p, v) => change(p, v), onState: (st) => { S.stampState = st; drawPane(); } }),
        el('details', { class: 'v2-sub' }, el('summary', {}, 'Its other fields (where, anchor, variants, when …)'), tree(Object.fromEntries(Object.entries(it).filter(([k]) => k !== 'rows' && k !== 'key')), path, { open: 1 }))];
    } else body = tree(it, path, { open: 2, lockKeys: ['kind'] });
    return el('div', { class: 'v2-itemedit' }, arrows, body);
  }

  function bodyPane() {
    const kind = M.bodyKind(S.def);
    const out = [];
    if (!kind) return [el('p', { class: 'pane-note' }, 'This draft has no body the studio knows. Change it under All fields.')];
    // a tileset: the tile editor (B19d, app/studio/v2-tiles.js) in place of the tree; All fields keeps the tree
    if (kind === 'tiles') return [tilesPane({ def: S.def, sprite: S.sprite, params: S.params, errors: S.errors, clip: S.clip, ui: (S.tilesUi ??= {}), change: (p, v, note) => change(p, v, note), commit: (d, note) => commit(d, note), say, redraw: () => drawPane(),
      setClip: (n) => { if (S.sprite?.clips?.[n]) setClip(n); }, stampPath: keyPath(S.stamp), stampState: S.stampState, onStampState: (st) => { S.stampState = st; drawPane(); }, onStamp: (p) => openStamp(p), closeStamp: () => { S.stamp = null; drawPane(); } })];
    out.push(el('p', { class: 'pane-note' }, `${M.BODY_LABELS[kind]}. `, 'Pick a row to change it; Add puts in a shape, a stamp or a generator.'));
    // a stamp opened from a tree (a decal, a generator's place) is painted at the top
    const stampPath = keyPath(S.stamp);
    const inList = stampPath && M.itemListsOf(S.def).some((l) => pathKey(l.path) === pathKey(stampPath.slice(0, -1)));
    if (stampPath && !inList && M.getAt(S.def, stampPath)?.kind === 'stamp') {
      out.push(el('section', { class: 'v2-list v2-painting' }, el('div', { class: 'st-head' }, el('h3', {}, `Painting ${M.itemLabel(M.getAt(S.def, stampPath))}`), mini('Done', () => { S.stamp = null; drawPane(); })),
        stampPainter({ def: S.def, stamp: M.getAt(S.def, stampPath), path: stampPath, state: S.stampState, onChange: (p, v) => change(p, v), onState: (st) => { S.stampState = st; drawPane(); } })));
    }
    const lists = M.itemListsOf(S.def);
    const nested = M.nestedStamps(S.def);
    if (nested.length) {
      out.push(el('section', { class: 'v2-list' }, el('div', { class: 'st-head' }, el('h3', {}, 'Stamps in it')),
        nested.map((n) => el('div', { class: 'v2-item', 'data-path': pathKey(n.path) }, el('span', { class: 'v2-itemname' }, el('span', { class: 'v2-itemlabel' }, n.label)),
          el('span', { class: 'v2-acts' }, mini('Paint', () => openStamp(n.path), { 'aria-label': `Paint the pixels of ${n.label}` }))))));
    }
    const listSection = (list) => {
      const sec = itemList({ def: S.def, list, selected: S.sel, errors: S.errors, word: list.word, onPick: (p) => { S.sel = pathKey(p); const it = p && M.getAt(S.def, p); if (it?.kind === 'stamp') S.stamp = pathKey(p); drawPane(); drawStage(); }, onChange: (p, v) => change(p, v), adder: adderFor(list) });
      if (S.adding === pathKey(list.path)) sec.querySelector('.st-head').after(genPicker(list));
      const row = S.sel ? sec.querySelector(`.v2-item[data-path="${CSS.escape(S.sel)}"]`) : null;
      if (row) row.append(itemEditor(list, keyPath(S.sel)));
      return sec;
    };
    // a background: the layer editor (B19c, app/studio/v2-layers.js), each layer's draw list in the pictures editor
    if (kind === 'layers') out.push(layersEditor({ def: S.def, sprite: S.sprite, params: S.params, errors: S.errors, stale: S.stale, clip: S.clip, sel: S.sel, ui: (S.layersUi ??= {}), listSection, say, redraw: () => drawPane(),
      onCommit: (d, note) => commit(d, note), onParams: (p) => { S.params = p; thumbs = new Map(); drawStage(); drawUnder(); }, onPick: (n) => { if (S.sprite?.clips?.[n]) setClip(n); } }));
    else for (const list of lists) out.push(list.place === 'emitter' ? particles.section(list) : listSection(list));
    // the rest of the body, as typed fields
    const listed = new Set(lists.map((l) => pathKey(l.path)));
    const rest = kind === 'emitters' ? Object.fromEntries(Object.entries(S.def.body).filter(([k]) => !listed.has(`body.${k}`)))
      : isObj(S.def.body[kind]) ? Object.fromEntries(Object.entries(S.def.body[kind]).filter(([k]) => !listed.has(`body.${kind}.${k}`))) : null;
    const restPath = kind === 'emitters' ? ['body'] : ['body', kind];
    // an interface piece: the 9-slice editor (B19b, app/studio/v2-slice-pane.js) in place of the tree, first after the note
    if (kind === 'panel') out.splice(1, 0, slicePane({ def: S.def, sprite: S.sprite, stale: S.stale, clip: S.clip, frame: S.frame, params: S.params, ui: (S.sliceUi ??= {}),
      onChange: (p, v) => change(p, v), onCommit: (d, note) => commit(d, note), onClip: (n) => { setClip(n); if (S.tab === 'body') drawPane(); }, onStamp: (p) => openStamp(p) }));
    else if (rest && Object.keys(rest).length) out.push(el('section', { class: 'v2-list' }, el('div', { class: 'st-head' }, el('h3', {}, kind === 'rig' ? 'Bones, nodes and the rest of the rig' : 'The rest of the body')), tree(rest, restPath, { open: 1 })));
    return out;
  }

  function clipsPane() {
    const out = [];
    const names = [...new Set([...Object.keys(S.sprite?.clips ?? {}), ...Object.keys(isObj(S.def.clips) ? S.def.clips : {})])];
    out.push(el('div', { class: 'st-head' }, el('h3', {}, 'Clips'), mini('New clip', () => { S.newClip = !S.newClip; drawPane(); pane.querySelector('[data-k="clip-name"]')?.focus(); }, { 'data-act': 'new-clip' })));
    if (S.newClip) {
      const nameIn = el('input', { type: 'text', class: 'st-text', 'data-k': 'clip-name', 'aria-label': 'Name of the new clip', placeholder: 'wave' });
      const add = () => {
        const next = M.addClip(S.def, nameIn.value.trim());
        if (!next) { say('A clip name is one lowercase word (letters, digits and dashes) that no clip has yet.'); return; }
        S.newClip = false;
        if (commit(next, `Clip ${nameIn.value.trim()} added: 8 frames at 10 a second.`)) S.clip = nameIn.value.trim();
      };
      nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      out.push(el('div', { class: 'new-clip' }, el('label', { class: 'st-lbl' }, 'Call it ', nameIn), mini('Add', add, { 'data-act': 'add-clip' })));
    }
    out.push(el('div', { class: 'chips', role: 'group', 'aria-label': 'Clips to change' }, names.map((n) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(n === S.clip), onclick: () => setClip(n) }, n))));
    const n = S.clip;
    if (!n) return out;
    const own = isObj(S.def.clips) && Object.hasOwn(S.def.clips, n);
    const errs = M.errorsFor(S.errors, { word: 'Clip', id: n });
    out.push(el('div', { class: 'st-head' }, el('h3', {}, `Clip "${n}"`), own ? mini('Remove', () => { change(['clips', n], undefined, `Clip ${n} removed. Undo brings it back.`); }, { 'aria-label': `Remove the clip ${n}` }) : null));
    if (S.sprite?.clips[n]) out.push(el('p', { class: 'quiet small' }, `${S.sprite.clips[n].frames} frames${S.sprite.clips[n].loop === false ? ', once' : ', looping'}.`));
    out.push(errorBox(errs));
    if (own) out.push(tree(S.def.clips[n], ['clips', n], { open: 1 }));
    else out.push(el('p', { class: 'pane-note' }, 'The body writes this clip for you (its layout names it). Give it settings of its own to change its frames, speed or sounds. '),
      mini('Give it settings of its own', () => change(['clips', n], { frames: S.sprite?.clips[n]?.frames ?? 1, fps: 8 }), { 'data-act': 'own-clip' }));
    return out;
  }

  function lookPane() {
    const d = S.def;
    const out = [];
    const nameIn = el('input', { type: 'text', class: 'st-text', id: 'v2-name', 'data-k': 'v2-name', maxlength: 60, value: d.name ?? '' });
    nameIn.addEventListener('change', () => change(['name'], nameIn.value.trim().slice(0, 60) || d.name));
    const blurbIn = el('textarea', { class: 'st-text st-area', id: 'v2-blurb', 'data-k': 'v2-blurb', maxlength: 300, rows: 2 });
    blurbIn.value = d.blurb ?? '';
    blurbIn.addEventListener('change', () => change(['blurb'], blurbIn.value.trim().slice(0, 300)));
    out.push(el('div', { class: 'ctl' }, el('label', { class: 'ctl-label', for: 'v2-name' }, 'Name'), el('div', { class: 'ctl-body' }, nameIn), el('span')));
    out.push(el('div', { class: 'ctl' }, el('label', { class: 'ctl-label', for: 'v2-blurb' }, 'One sentence'), el('div', { class: 'ctl-body' }, blurbIn), el('span')));
    out.push(el('p', { class: 'quiet small' }, `Id ${d.id}: the file is ${d.id}.json.`));
    // the palette
    const pal = Array.isArray(d.palette) ? d.palette : [];
    out.push(el('div', { class: 'st-head' }, el('h3', {}, 'Colours'), mini('Add a colour', () => commit(M.addPaletteSlot(S.def, { label: 'Colour' }), 'Colour added: paint something with it.'), { 'data-act': 'add-colour' })));
    pal.forEach((s, i) => {
      if (!isObj(s)) return;
      const errs = M.errorsFor(S.errors, { word: 'Colour', id: s.id });
      const hex = typeof s.default === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.default) ? s.default : null;
      const colourIn = hex ? el('input', { type: 'color', class: 'v2-colour', value: hex, 'aria-label': `${s.label ?? s.id} colour`, 'data-k': `colour-${s.id}` }) : el('span', { class: 'quiet small' }, s.derive ? 'worked out from another colour' : 'no colour of its own');
      if (hex) colourIn.addEventListener('change', () => change(['palette', i, 'default'], colourIn.value));
      const labelIn = el('input', { type: 'text', class: 'st-text v2-slotlabel', value: s.label ?? '', maxlength: 60, 'aria-label': `Name of the colour ${s.id}`, 'data-k': `label-${s.id}` });
      labelIn.addEventListener('change', () => change(['palette', i, 'label'], labelIn.value.trim() || undefined));
      out.push(el('div', { class: `v2-slot${errs.length ? ' has-error' : ''}`, 'data-slot': s.id },
        el('span', { class: 'v2-chip', style: swatchOf(s.id, d) ? `background:${swatchOf(s.id, d)}` : null, 'aria-hidden': 'true' }), el('code', {}, s.id), labelIn, colourIn,
        mini('×', () => change(['palette', i], undefined, `Colour ${s.id} removed.`), { 'aria-label': `Remove the colour ${s.id}` }),
        errorBox(errs),
        el('details', { class: 'v2-sub' }, el('summary', {}, 'More (material, swatches, worked out …)'), tree(s, ['palette', i], { open: 1, lockKeys: ['id'] }))));
    });
    // the controls people get
    const ctl = Array.isArray(d.controls) ? d.controls : [];
    out.push(el('div', { class: 'st-head' }, el('h3', {}, 'Sliders people get'),
      menuButton('Add a control', [{ label: 'A slider', onclick: () => commit(M.addControl(S.def, 'range', { label: 'Setting' }), 'Slider added. It does nothing until something is set by it: pick "Set by" on an argument.') },
        { label: 'A choice', onclick: () => commit(M.addControl(S.def, 'choice', { label: 'Look' }), 'Choice added. Name its options, then use it in a "when" or a binding.') },
        { label: 'An on/off', onclick: () => commit(M.addControl(S.def, 'toggle', { label: 'Shown' }), 'On/off added. Use it in a "when" or a binding.') }], { act: 'add-control' })));
    ctl.forEach((c, i) => {
      if (!isObj(c)) return;
      const errs = M.errorsFor(S.errors, { word: 'Control', id: c.key });
      out.push(el('div', { class: `v2-ctlrow${errs.length ? ' has-error' : ''}`, 'data-control': c.key ?? '' },
        el('details', { class: 'v2-sub' }, el('summary', {}, el('strong', {}, c.label ?? c.key ?? c.standard ?? 'Control'), el('span', { class: 'quiet' }, ` ${c.standard ? 'standard' : c.kind ?? ''} · ${c.key}`),
          el('span', { class: 'v2-acts' }, mini('×', () => change(['controls', i], undefined, 'Control removed.'), { 'aria-label': `Remove the control ${c.key}` }))), tree(c, ['controls', i], { open: 1 })),
        errorBox(errs)));
    });
    // the parts: for a character that extends a base, picked from the library (B20, app/studio/v2-parts-pane.js), the
    // fields under its More; for any other body, the fields
    const partsFields = () => [tree(isObj(d.parts) ? d.parts : {}, ['parts'], { open: 1 }), isObj(d.parts) ? null : mini('Give it parts', () => change(['parts'], {}), {})];
    if (M.bodyKind(d) === 'rig' && baseOf(d)) {
      out.push(partsPane({ def: d, sprite: S.sprite, clip: S.clip, params: S.params, ui: (S.partsUi ??= {}), more: el('div', { class: 'v2-partfields-raw' }, ...partsFields().filter(Boolean)),
        onCommit: (next, note, p) => { if (p) { S.params = p; thumbs = new Map(); } commit(next, note); },
        onParams: (p) => { S.params = p; thumbs = new Map(); drawStage(); drawUnder(); drawPane(); }, redraw: () => drawPane() }));
    } else {
      const [fields, give] = partsFields();
      out.push(el('div', { class: 'st-head' }, el('h3', {}, 'Parts that can be switched off')), fields);
      if (give) out.push(give);
    }
    out.push(el('details', { class: 'v2-sub' }, el('summary', {}, 'What it is, and words to find it (meta)'), isObj(d.meta) ? tree(d.meta, ['meta'], { open: 1 }) : null));
    // trying the controls on the picture
    if (S.sprite) {
      out.push(el('div', { class: 'st-head' }, el('h3', {}, 'Try the controls'), mini('Back to the defaults', () => { S.params = {}; thumbs = new Map(); drawPane(); drawStage(); drawUnder(); })));
      const p = cleanParams(S.sprite, S.params);
      for (const [k, spec] of Object.entries(S.sprite.params)) {
        const set = (v) => { S.params = { ...S.params, [k]: v }; thumbs = new Map(); drawStage(); drawUnder(); };
        let input;
        const lab = spec.label ?? k;
        if (spec.kind === 'range') { input = el('input', { type: 'range', min: spec.min ?? 0, max: spec.max ?? 1, step: spec.step ?? 0.01, value: String(p[k]), 'aria-label': `Try ${lab}`, 'data-try': k }); input.addEventListener('input', () => set(Number(input.value))); }
        else if (spec.kind === 'choice') { input = el('select', { class: 'st-select', 'aria-label': `Try ${lab}`, 'data-try': k }, (spec.options ?? []).map((o) => { const v = isObj(o) ? o.value : o; return el('option', { value: String(v), selected: String(v) === String(p[k]) }, isObj(o) ? o.label ?? String(v) : String(v)); })); input.addEventListener('change', () => set(input.value)); }
        else if (spec.kind === 'toggle') { input = el('input', { type: 'checkbox', 'aria-label': `Try ${lab}`, 'data-try': k }); input.checked = !!p[k]; input.addEventListener('change', () => set(input.checked)); }
        else if (spec.kind === 'color') { input = el('input', { type: 'color', value: String(p[k]), 'aria-label': `Try ${lab}`, 'data-try': k }); input.addEventListener('input', () => set(input.value)); }
        else continue;
        out.push(el('div', { class: 'ctl v2-try' }, el('span', { class: 'ctl-label' }, lab), el('div', { class: 'ctl-body' }, input), el('span')));
      }
    }
    return out;
  }

  function checkPane() {
    const out = [];
    if (S.checking) out.push(el('p', { class: 'adv-status' }, 'Checking…'));
    else if (S.errors.length) out.push(el('p', { class: 'adv-status v2-bad', 'data-state': 'errors' }, `${S.errors.length} thing${S.errors.length === 1 ? '' : 's'} to fix before it draws, goes in the bag or downloads. Each is also shown beside what it is about.`));
    else out.push(el('p', { class: 'adv-status is-fine', 'data-state': 'ok' }, 'It passes the checks: it draws, goes in your bag and downloads.'));
    if (S.errors.length) out.push(el('ul', { class: 'v2-errs v2-all-errs' }, S.errors.map((m) => el('li', {}, m))));
    if (S.warnings.length) out.push(el('div', { class: 'st-head' }, el('h3', {}, 'Notes from the check')), el('ul', { class: 'v2-notes' }, S.warnings.map((m) => el('li', {}, m))));
    out.push(el('div', { class: 'st-head' }, el('h3', {}, 'What the library would ask (the quality bar)'), mini('Ask again', () => runAdvice(), { 'data-act': 'advice', disabled: S.stale })));
    out.push(el('p', { class: 'quiet small' }, 'Advice only: a studio sprite goes in the bag and downloads whatever this says. A file for the library must pass it.'));
    if (S.stale) out.push(el('p', { class: 'adv-status' }, 'Fix the things above first.'));
    else if (S.adviceBusy || !S.advice) out.push(el('p', { class: 'adv-status', 'data-advice': 'busy' }, 'Looking at every clip…'));
    else if (S.advice.error) out.push(el('p', { class: 'adv-status' }, `The quality bar could not look at it: ${S.advice.error}`));
    else {
      const { problems = [], suggestions = [] } = S.advice;
      out.push(el('p', { class: `adv-status${problems.length ? '' : ' is-fine'}`, 'data-advice': problems.length ? 'problems' : 'passes' }, problems.length ? `${problems.length} thing${problems.length === 1 ? '' : 's'} the library would not take.` : 'The library would take it as it is.'));
      out.push(el('div', { class: 'adv-list v2-findings' }, [...problems.map((m) => ['problem', m]), ...suggestions.map((m) => ['tip', m])].map(([k, m]) => el('div', { class: `adv adv-${k}` }, el('p', { class: 'adv-btn' }, el('span', { class: 'adv-mark', 'aria-hidden': 'true' }, k === 'problem' ? '!' : 'i'), el('span', {}, m))))));
    }
    return out;
  }

  function allPane() {
    return [el('p', { class: 'pane-note' }, 'Every field of the definition. Numbers, words and on/off are typed boxes; nothing here is code.'), tree(S.def, [], { open: 1, lockKeys: ['format', 'version', 'id', 'body'] })];
  }

  const PANES = { body: bodyPane, clips: clipsPane, look: lookPane, check: checkPane, all: allPane };
  function drawPane() {
    const k = document.activeElement?.closest?.('#st-pane') ? document.activeElement.dataset.k ?? null : null;
    const scroll = pane.scrollTop;
    for (const b of tabs.children) {
      const on = b.dataset.mode === S.tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (b.dataset.mode === 'check') b.textContent = S.errors.length ? `Check (${S.errors.length})` : 'Check';
    }
    pane.setAttribute('aria-labelledby', `v2-tab-${S.tab}`);
    pane.replaceChildren(...[PANES[S.tab]()].flat(Infinity).filter(Boolean));
    pane.scrollTop = scroll;
    if (k) pane.querySelector(`[data-k="${CSS.escape(k)}"]`)?.focus({ preventScroll: true });
  }

  function drawFoot() {
    const st = S.saveState;
    const keepBtn = el('button', { type: 'button', class: 'btn btn-sm', onclick: () => downloadFile() }, 'Download the file');
    if (st.kind === 'error') {
      savedBox.className = 'saved is-warn';
      savedBox.replaceChildren(el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'saved-text' }, 'Could not be saved'), el('small', {}, st.error), keepBtn);
    } else if (st.kind === 'memory') {
      savedBox.className = 'saved is-warn';
      savedBox.replaceChildren(el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'saved-text' }, 'Not kept after this tab closes'), el('small', {}, 'This browser is not saving for this site. Download the file to keep it.'), keepBtn);
    } else {
      savedBox.className = 'saved' + (saver.pending() ? ' is-saving' : '');
      savedBox.replaceChildren(el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'saved-text' }, saver.pending() ? 'Saving…' : 'Saved on this computer'),
        el('small', {}, S.stale && S.bagKey ? 'Your bag keeps the last version that passed' : S.bagKey && S.bagError ? 'Your bag has an older copy' : S.bagKey ? 'In your bag · updates as you work' : S.changes ? `${S.changes} change${S.changes === 1 ? '' : 's'} this visit` : 'Every change is kept as you go'));
      if (S.bagKey && !S.bagError) savedBox.append(el('button', { type: 'button', class: 'link st-keep', 'data-act': 'keep-copy', onclick: () => keepCopy() }, 'Keep a copy in the bag'));
    }
    const takes = !S.stale && !!S.clean && studio.ready() && bagTakes(bagModule, S.clean);
    toBagBtn.disabled = !takes || (!!S.bagKey && !S.bagError);
    toBagBtn.textContent = S.bagKey && S.bagError ? 'Update my bag' : S.bagKey ? 'In your bag' : 'Put in my bag';
    playBtn.disabled = !S.bagKey;
    playBtn.title = S.bagKey ? 'Try it in the playground' : 'Put it in your bag first';
    bagNote.hidden = !S.stale;
    bagNote.textContent = S.stale ? 'Fix what Check lists to put it in your bag or download it.' : '';
  }

  function drawHead() {
    title.textContent = S.def.name ?? id;
    sub.textContent = `${M.BODY_LABELS[M.bodyKind(S.def)] ?? 'A sprite'}${S.def.made?.from?.startsWith?.('library:') ? ` · a copy of the library's ${S.def.made.from.slice(8)}` : ''}`;
    document.title = `${S.def.name ?? id} · Studio · Loadout`;
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
    stageNote.textContent = S.checking && !S.sprite ? 'Drawing…' : S.stale ? (S.sprite ? `Not drawn as changed: ${S.errors.length} thing${S.errors.length === 1 ? '' : 's'} to fix (see Check). This is the last version that drew.` : `It does not draw yet: ${S.errors[0] ?? 'see Check'}`) : '';
    stageNote.classList.toggle('v2-bad', S.stale);
  }

  function drawAll() { drawHead(); drawStage(); drawUnder(); drawPane(); drawFoot(); }

  // ---- the quality bar, in a background worker (advice only) ----
  let worker = null, adviceTimer = null, adviceAsk = 0;
  function scheduleAdvice() { clearTimeout(adviceTimer); S.adviceBusy = true; adviceTimer = setTimeout(runAdvice, ADVICE_DELAY); }
  async function runAdvice() {
    if (!S.clean) return;
    const ask = ++adviceAsk;
    S.adviceBusy = true;
    if (S.tab === 'check') drawPane();
    const soundsUrl = new URL('../../generated/sounds.json', import.meta.url).href;
    let result;
    try {
      if (typeof Worker === 'function') {
        worker ??= new Worker(new URL('./v2-advice-worker.js', import.meta.url), { type: 'module' });
        result = await new Promise((resolve) => {
          const on = (e) => { if (e.data?.ask !== ask) return; worker.removeEventListener('message', on); resolve(e.data.error ? { error: e.data.error } : e.data.result); };
          worker.addEventListener('message', on);
          worker.postMessage({ ask, def: S.clean, soundsUrl });
        });
      } else {
        const m = await import('./v2-advice-worker.js');
        result = await m.runV2Advice(S.clean, soundsUrl);
      }
    } catch (e) { result = { error: String(e?.message ?? e).slice(0, 200) }; }
    if (ask !== adviceAsk) return;
    S.advice = result; S.adviceBusy = false;
    if (S.tab === 'check') drawPane();
  }

  // ---- the bag and the downloads ----
  async function putInBag() {
    if (S.stale || !S.clean) { say('Fix what Check lists first: only a sprite that passes goes in your bag.'); return; }
    const f = saver.flush();
    if ((f && !f.ok) || drafts.pending()) { say('It could not go in your bag: your latest change is not saved yet. Download the file to keep it.'); return; }
    toBagBtn.disabled = true;
    let r;
    try { r = await studio.toBag(id); } catch (e) { r = { ok: false, errors: [String(e?.message ?? e)] }; }
    if (!r?.ok) { say(`It could not go in your bag: ${(r?.errors ?? [])[0] ?? 'the bag did not take it'}`); drawFoot(); return; }
    S.bagKey = r.key ?? S.bagKey;
    S.bagError = null;
    say(r.added === false ? 'Your bag has this version now.' : 'In your bag. It updates as you work; Play tries it in the playground.');
    drawFoot();
  }
  function keepCopy() {
    if (!S.bagKey) return;
    let k = null;
    try { k = typeof bagModule.bag.keepCopy === 'function' ? bagModule.bag.keepCopy(S.bagKey) : null; } catch (e) { say(`No copy was made: ${String(e?.message ?? e).slice(0, 160)}`); return; }
    say(k ? 'A copy that stays as it is now is in your bag. The other one keeps following your changes.' : 'No copy was made: it is no longer in your bag. Put it in again first.');
  }
  function downloadFile() {
    if (S.stale || !S.clean) { say(`The file is made from a sprite that passes the checks: fix what Check lists first (${S.errors.length}).`); return; }
    const f = M.fileOf(S.clean);
    saveBlob(new Blob([f.text], { type: f.type }), f.name);
    say(`${f.name} downloaded. A file for the library goes in its sprites folder and through the quality bar and a review.`);
  }
  async function downloadSheet() {
    if (!S.sprite || S.stale) { say('Fix what Check lists first.'); return; }
    const sheet = renderSheet(S.sprite, defaultParams(S.sprite), { scale: 1 });
    const cv = document.createElement('canvas');
    cv.width = sheet.w; cv.height = sheet.h;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(sheet.data.buffer, sheet.data.byteOffset, sheet.data.length * 4), sheet.w, sheet.h), 0, 0);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    saveBlob(blob, `${S.def.id}.png`);
    say(`${S.def.id}.png downloaded: every clip a row, every frame a cell.`);
  }

  // ---- the address and the keyboard ----
  function saveUrl() {
    const q = new URLSearchParams({ mode: S.tab });
    if (S.clip) { q.set('clip', S.clip); q.set('frame', String(S.frame)); }
    const hash = `#/studio/${encodeURIComponent(id)}?${q}`;
    if (location.hash !== hash) window.history.replaceState(window.history.state, '', hash);
  }
  function onKey(e) {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
      if (isTyping(e.target)) return;
      e.preventDefault();
      if (e.key === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (mod || e.altKey || isTyping(e.target) || (e.target instanceof HTMLElement && e.target.closest('.menu'))) return;
    const m = V2_MODES.find((x) => x.key === e.key);
    if (m) { e.preventDefault(); setTab(m.id); return; }
    if (e.key === ' ' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement) && !(e.target instanceof HTMLElement && e.target.closest('summary'))) { e.preventDefault(); togglePlay(); }
    if (e.key === 'Escape' && S.sel) { S.sel = null; drawPane(); }
  }
  document.addEventListener('keydown', onKey);

  // ---- the page ----
  const main = el('main', { class: 'v2 rx studio studio-v2', 'data-draft': id, 'data-body': M.bodyKind(first) ?? '' }, stageCol, panel);
  app.replaceChildren(header('studio'), main);
  const ro = new ResizeObserver(() => drawStage());
  ro.observe(card);
  const flush = () => { saver.flush(); };
  window.addEventListener('pagehide', flush);
  drawAll();
  saveUrl();
  refresh();
  if (!reduceMotion.matches) { /* the picture waits still until Play: the person is editing */ }

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(sayTimer);
    clearTimeout(adviceTimer);
    worker?.terminate();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', flush);
    ro.disconnect();
    saver.flush();
  };
}
