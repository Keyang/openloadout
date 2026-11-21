// The studio panel's part 2 (docs/studio.md sections 3 to 6; items S10 and S12): what the four tabs of app/studio/panes.js
// add. Move: Mirror legs, the keys between frames (the swing light) with a way to remove them. Frames: Sounds on
// this frame (the library's sound effects by name, with play), this frame's pixel warnings, the fill band. Look & name:
// the advice ("What the quality bar would ask": the quality bar in everyday words, in a background worker, never blocking)
// and the pixel-art warnings, each a button that selects what it is about. Every change goes through E.commit.
import { el } from '../ui.js';
import { row, head, btn, icon, select, fieldId } from './bits.js';
import * as C from './clip-tools.js';
import * as A from './advice.js';
import * as X from './edit.js';

/** A slider from 0 to 1 that commits when let go (not on every step). */
function slider({ id, label, value, min, max, step = 0.05, onchange, k }) {
  const p = (v) => `${((v - min) / (max - min || 1)) * 100}%`;
  const input = el('input', { id, type: 'range', min, max, step, value: String(value), 'aria-label': label, 'data-k': k ?? id, style: `--p:${p(value)}` });
  input.addEventListener('input', () => input.style.setProperty('--p', p(Number(input.value))));
  input.addEventListener('change', () => { const n = Number(input.value); if (Number.isFinite(n) && n !== value) onchange(n); });
  return input;
}

// ---- Move ---------------------------------------------------------------------------------------------------------

/** The Mirror legs button for the key actions, where the body has two sides ([] where it has not). */
export function mirrorButton(E) {
  const { def, clip, frame } = E.S;
  if (!C.canMirror(def, clip)) return [];
  return [btn('Mirror legs', () => E.commit(C.mirrorLegs(def, clip, frame), `Legs mirrored on frame ${frame + 1}: near and far swapped.`), { 'data-k': 'mirror-legs', title: 'Swap the near and far legs on this frame' })];
}

/** What Move adds under the key: the keys between frames (said once, with Remove). */
export function moveExtras(E) {
  const { def, clip } = E.S;
  const out = [];
  const light = C.lightKeys(def, clip);
  if (light.length) {
    out.push(el('div', { class: 'light-row', 'data-light': String(light.length) },
      el('span', { class: 'light-mark', 'aria-hidden': 'true' }),
      el('span', { class: 'light-text' }, el('strong', {}, `${C.lightLabel(def, clip)}: ${light.length} key${light.length === 1 ? '' : 's'} between frames`),
        el('span', { class: 'quiet' }, '. They sit between frames, where the light of the blow looks back to; the thin ticks on the timeline.')),
      btn('Remove', () => E.commit(C.removeLightKeys(def, clip), `${C.lightLabel(def, clip)} keys removed. Undo brings them back.`), { 'data-k': 'remove-light' })));
  }
  return out;
}

// ---- Frames: sounds on this frame ---------------------------------------------------------------------------------

// the sound library, loaded on first use (app/audio.js: generated/sounds.json) and kept for the page's life
const sounds = { state: 'idle', audio: null, waiting: new Set() };
function loadSounds(E) {
  sounds.waiting.add(E);
  if (sounds.state !== 'idle') return;
  sounds.state = 'loading';
  import('../audio.js').then(async (m) => { await m.loadSounds(); sounds.audio = m; sounds.state = 'ready'; })
    .catch(() => { sounds.state = 'failed'; })
    .finally(() => { for (const e of sounds.waiting) e.redraw?.(); sounds.waiting.clear(); });
}
const patches = () => (sounds.audio ? sounds.audio.sounds : []);

/** Play one sound of a frame as the library makes it (its style and loudness); said when it cannot play. */
function play(E, cue) {
  const m = sounds.audio, p = m?.soundById?.[cue.sound];
  if (!p) { E.say('That sound is not in the library on this site, so it cannot play here.'); return; }
  try { m.playRendered(m.rendered(p, m.soundParams(p, cue.preset)), { volume: cue.volume ?? 1, force: true }); } catch { E.say('The sound could not play in this browser.'); }
}

/** Sounds on this frame (Frames tab): each with its style, how loud, Play and Remove, and a list of the library's sound effects by name to add one. */
export function soundsSection(E) {
  const { def, clip, frame } = E.S;
  const cues = C.cuesAt(def, clip, frame);
  if (sounds.state === 'idle') loadSounds(E);
  const out = [head(`Sounds on frame ${frame + 1}`)];
  for (const cue of cues) {
    const p = sounds.audio?.soundById?.[cue.sound];
    const styles = C.presetsOf(p);
    const vid = fieldId('vol');
    out.push(el('div', { class: 'cue-row', 'data-sound': cue.sound },
      icon('▶', `Play ${C.soundName(cue.sound, patches())}`, () => play(E, cue), { 'data-k': `play-${cue.index}`, disabled: sounds.state !== 'ready' || !p }),
      el('span', { class: 'cue-name' }, C.soundName(cue.sound, patches())),
      styles.length ? select({ id: fieldId('style'), k: `style-${cue.index}`, label: `How ${C.soundName(cue.sound, patches())} sounds`, value: cue.preset ?? '', options: [{ value: '', label: 'As it is' }, ...styles.map((s) => ({ value: s, label: s }))], onchange: (v) => E.commit(C.setCue(def, clip, cue.index, { preset: v || null })) }) : el('span'),
      el('label', { class: 'cue-vol', for: vid }, el('span', { class: 'sr' }, 'How loud'), slider({ id: vid, label: `How loud ${C.soundName(cue.sound, patches())} is`, value: cue.volume ?? 1, min: 0, max: 1, step: 0.05, k: `vol-${cue.index}`, onchange: (v) => E.commit(C.setCue(def, clip, cue.index, { volume: v })) })),
      icon('×', `Take ${C.soundName(cue.sound, patches())} off this frame`, () => E.commit(C.removeCue(def, clip, cue.index), 'Sound taken off this frame. Undo brings it back.'), { 'data-k': `rm-sound-${cue.index}` })));
  }
  if (sounds.state === 'ready') {
    const aid = fieldId('add-sound');
    const pickBox = el('select', { id: aid, class: 'st-select', 'data-k': 'add-sound', 'aria-label': 'Add a sound on this frame' },
      el('option', { value: '' }, 'Add a sound…'),
      C.soundChoices(patches()).map((g) => el('optgroup', { label: g.label }, g.sounds.map((s) => el('option', { value: s.id }, s.name)))));
    pickBox.addEventListener('change', () => {
      const id = pickBox.value;
      if (!id) return;
      const r = C.addCue(E.S.def, clip, frame, id);
      if (r.error) { E.say(r.error); pickBox.value = ''; return; }
      if (E.commit(r.def, `${C.soundName(id, patches())} plays on frame ${frame + 1}.`)) play(E, { sound: id });
    });
    out.push(el('div', { class: 'st-inline cue-add' }, pickBox));
  } else {
    out.push(el('p', { class: 'pane-note' }, sounds.state === 'failed' ? 'The sound library could not be read on this site, so sounds cannot be added here.' : 'Loading the sound library…'));
  }
  if (!cues.length && sounds.state === 'ready') out.push(el('p', { class: 'pane-note' }, 'Nothing plays on this frame. A step, a swing or a hit usually has a sound.'));
  return out;
}

// ---- pixel warnings next to what they are about ---------------------------------------------------------------------

/** The mark an advice line starts with (ink, never the orange of "changed"). */
const mark = () => el('span', { class: 'adv-mark', 'aria-hidden': 'true' }, '!');

/** This frame's pixel warnings (Frames tab), under "This frame". */
export function frameAdvice(E) {
  const { def, clip, frame } = E.S;
  let list = [];
  try { list = A.frameWarnings(def, clip).filter((w) => w.frame === frame); } catch { list = []; }
  return list.map((w) => el('p', { class: 'st-advice', 'data-advice': w.kind }, mark(), el('span', {}, w.text)));
}

/** The fill band under the frame size (Frames tab, bone rigs): how much of its frame it fills, and what to do when it is outside. */
export function fillNote(E) {
  let f = null;
  try { f = A.fillBand(E.S.def); } catch { f = null; }
  if (!f) return null;
  return el('p', { class: `st-advice${f.state === 'fits' ? ' is-fine' : ''}`, 'data-advice': 'fill' }, f.state === 'fits' ? null : mark(), el('span', {}, `${f.text} The dashed boxes on the picture show the band.`));
}

/** A small mark beside a shape that is too thin to draw (Body tab), saying why. Null when it is fine. */
export function thinMark(def, shapeId) {
  const w = A.thinShapes(def).find((x) => x.shape === shapeId);
  if (!w) return null;
  return el('span', { class: 'thin-mark', title: w.text, 'data-advice': w.kind }, mark(), el('span', { class: 'sr' }, ` ${w.text}`), el('span', { 'aria-hidden': 'true' }, w.kind === 'thin' ? ' Thin' : ' Too thin'));
}

/** Frames of the clip in hand with a pixel warning: Map frame -> [texts] (for the timeline's marks). */
export function framesWithAdvice(def, clip) {
  const m = new Map();
  try { for (const w of A.frameWarnings(def, clip)) { if (!m.has(w.frame)) m.set(w.frame, []); m.get(w.frame).push(w.text); } } catch { /* advice only: a frame that cannot be measured has none */ }
  return m;
}

// ---- Look & name: the advice ------------------------------------------------------------------------------------------

// one worker for the page's life (app/studio/advice-worker.js); the page itself does the work where workers cannot load modules
let worker = null, jobs = 0;
const waiting = new Map();
function adviceFor(def) {
  const soundsUrl = new URL('../../generated/sounds.json', import.meta.url).href;
  const id = ++jobs;
  return new Promise((resolve, reject) => {
    const onPage = () => import('./advice-worker.js').then((m) => m.runAdvice(def, soundsUrl)).then(resolve, reject);
    try {
      if (!worker) {
        worker = new Worker(new URL('./advice-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => { const w = waiting.get(e.data?.id); if (!w) return; waiting.delete(e.data.id); clearTimeout(w.timer); if (e.data.error) w.reject(new Error(e.data.error)); else w.resolve(e.data.result); };
        worker.onerror = () => { const all = [...waiting.values()]; waiting.clear(); worker?.terminate(); worker = null; for (const w of all) { clearTimeout(w.timer); w.fallback(); } };
      }
      const timer = setTimeout(() => { waiting.delete(id); worker?.terminate(); worker = null; reject(new Error('it took too long')); }, 90_000);
      waiting.set(id, { resolve, reject, timer, fallback: onPage });
      worker.postMessage({ id, def: JSON.parse(JSON.stringify(def)), soundsUrl });
    } catch { onPage(); }
  });
}

/** Ask for advice on the definition as it is now: E.S.advice goes working, then done (or failed), and the pane is drawn again. */
export function askAdvice(E) {
  const def = E.S.def;
  E.S.advice = { state: 'working', def };
  E.redraw();
  adviceFor(def).then((result) => { if (E.S.advice?.def === def) E.S.advice = { state: 'done', def, result }; })
    .catch((e) => { if (E.S.advice?.def === def) E.S.advice = { state: 'failed', def, message: `The advice could not be worked out: ${String(e?.message ?? e).slice(0, 160)}.` }; })
    .finally(() => E.redraw());
}

/** One advice line as a button that selects what it is about (a shape, a frame of an animation, the frame size), or as text when it is about the whole sprite. */
function adviceItem(E, it) {
  const go = it.shape ? () => E.goShape(it.shape, it.bone) : it.kind === 'fill' ? () => E.goFrame(it.clip, 0, 'frame-size') : it.clip ? () => E.goFrame(it.clip, it.frame ?? 0) : null;
  const where = it.shape ? 'Show the shape' : it.kind === 'fill' ? 'Show the frame size' : it.clip ? `Show ${it.frame !== undefined ? `frame ${it.frame + 1} of ` : ''}${E.S.def.clips[it.clip]?.label || X.humanize(it.clip)}` : null;
  const body = [mark(), el('span', { class: 'adv-text' }, it.text), where ? el('span', { class: 'adv-go' }, where) : null];
  return el('li', { class: `adv adv-${it.level ?? 'pixel'}`, 'data-advice': it.kind ?? it.level }, go ? el('button', { type: 'button', class: 'adv-btn', onclick: go }, body) : el('div', { class: 'adv-btn is-still' }, body));
}

/** The advice section of Look & name: "What the quality bar would ask", run on request; the pixel warnings with it. */
export function adviceSection(E) {
  const { def } = E.S;
  const a = E.S.advice ?? { state: 'idle' };
  const fresh = a.def === def;
  const out = [head('What the quality bar would ask', btn(a.state === 'working' && fresh ? 'Checking…' : a.state === 'idle' ? 'Check it' : 'Check again', () => askAdvice(E), { 'data-k': 'check-it', 'data-act': 'advice', disabled: a.state === 'working' && fresh }))];
  out.push(el('p', { class: 'pane-note' }, 'Advice only: it goes in your bag, plays and downloads whatever this says. These are what the quality bar a library sprite is held to would ask, and the pixel-art rules it keeps. A studio file is not a library file: the library takes only data sprites made with the /sprite-forge skill.'));
  // the shapes too thin to draw are known at once; the rest is worked out on request
  const thin = A.thinShapes(def).map((w) => ({ ...w, level: 'pixel' }));
  const list = el('ul', { class: 'adv-list', 'aria-live': 'polite' });
  if (a.state === 'working') out.push(el('p', { class: 'adv-status', role: 'status' }, 'Looking at every animation and setting… this takes a few seconds.'));
  if (a.state === 'failed' && fresh) out.push(el('p', { class: 'adv-status', role: 'status' }, a.message));
  if (a.state === 'done') {
    if (!fresh) out.push(el('p', { class: 'adv-status' }, 'You have changed it since this advice. Check again to see it for the sprite as it is now.'));
    const bar = a.result?.bar;
    const pixels = (a.result?.pixels ?? []).filter((p) => !(p.kind === 'thin' || p.kind === 'too-thin')).map((p) => ({ ...p, level: 'pixel' }));
    const items = [...(fresh ? thin : []), ...pixels, ...(bar?.ok ? bar.items : [])];
    if (bar && !bar.ok) out.push(el('p', { class: 'adv-status' }, bar.message));
    if (!items.length) out.push(el('p', { class: 'adv-status is-fine', role: 'status' }, 'Nothing to ask: the quality bar finds nothing to change.'));
    else {
      const asks = bar?.ok ? bar.asks : 0;
      out.push(el('p', { class: 'adv-status', role: 'status' }, `${items.length} thing${items.length === 1 ? '' : 's'} to look at${asks ? `, ${asks} the quality bar would ask to be changed` : ''}. Pick one to see it.`));
      list.replaceChildren(...items.map((it) => adviceItem(E, it)));
    }
  } else if (thin.length) list.replaceChildren(...thin.map((it) => adviceItem(E, it)));
  out.push(list);
  return out;
}
