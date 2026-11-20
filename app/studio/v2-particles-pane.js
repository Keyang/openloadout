// The studio's particle editor (build item B19a; docs/data-sprites.md section 6 "Effect, projectile: particle editor"
// and section 9 row B19): in the Body tab of the version 2 editor (app/studio/v2-editor.js), each emitter list (an
// effect's `body.emitters`, a picture's `body.pictures.emitters`) is shown here instead of B17's rows and field tree.
//   - The cost of a frame against the 4,000 budget, live: a meter with each emitter's share (catalog/sprite-schema.js
//     prices; app/studio/v2-particles.js costSummary), the validator's budget and stamp-pixel messages under it.
//   - Play, pause and scrub through the clip in hand, and its clips to pick.
//   - Each emitter a card: its behaviour, its price, Up, Down, Copy, Delete, and a lane of the clip's frames showing the
//     amount each frame draws and where its keys are (a press on a frame goes there). Picked, it opens:
//       Behaviour      another behaviour from the registry (the shared ones, then the effect ports, which draw one old
//                      effect whole), and its arguments by their documented types (app/studio/v2-fields.js genEditor:
//                      numbers in range, words, on/off, paints, points, bound to a control by a table, never code);
//       Over time      the key on the frame in hand: its amount (0 is off), its point and each argument the behaviour
//                      lets keys change (a size argument at most what the emitter sets), its ease; made, moved a frame
//                      earlier or later, deleted; the validator's messages about it beside it;
//       Where it starts its point moved a pixel at a time, its box given or taken away. On the picture the point, how
//                      far it reaches and its box are drawn; drag the point, the box's middle or its corner.
//   - The validator's messages about an emitter on its card.
// Every change goes through the editor (commit / change), so it is saved, undone and checked like any other.
import { el } from '../ui.js';
import { renderFrame, cleanParams } from '../../engine/sprite.js';
import { EASES } from '../../rigs/keypose.js';
import { getAt } from './v2-model.js';
import * as P from './v2-particles.js';
import { genEditor, swatchOf } from './v2-fields.js';
import { spriteOf } from './v2-check.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const pathKey = (p) => (p ? p.join('.') : '');
const fmt = (n) => Math.round(n).toLocaleString('en');
const mini = (label, onclick, more = {}) => el('button', { type: 'button', class: 'btn btn-sm v2-mini', onclick, ...more }, label);
/** How close (CSS pixels) a press must be to a point or a corner on the stage to take it. */
const NEAR_POINT = 10, NEAR_CORNER = 9;

/** A Surface as a canvas of its own size. */
function canvasOf(s) {
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  c.getContext('2d').putImageData(new ImageData(s.bytes(), s.w, s.h), 0, 0);
  return c;
}

/** A number box committed on Enter or on leaving it. */
function numberBox({ k, value, min, max, step = 'any', label, onchange }) {
  const box = el('input', { type: 'number', class: 'st-num v2-num', value: String(value), min: min ?? null, max: max ?? null, step, 'aria-label': label, 'data-k': k, inputmode: 'decimal' });
  const commit = () => { const n = Number(box.value); if (box.value !== '' && Number.isFinite(n) && n !== value) onchange(n); };
  box.addEventListener('change', commit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  return box;
}

/**
 * The particle editor of one version 2 editor page: { section(list), drawOver(g, layout, sprite), pointerDown(e,
 * layout) }. section draws an emitter list's editor for the Body tab; drawOver draws the emitters' points, reach and
 * boxes over the picture (and, while one is dragged, the picture as it will be); pointerDown takes a press on the
 * picture that lands on them (true when it did). Arguments: ctx { state () (the editor's state: def, sprite, clip,
 * frame, playing, sel, tab, params, errors), change (path, value, note), commit (def, note), say, drawStage, drawPane,
 * setClip, setFrame, togglePlay, pick (path or null), canvas, onStamp }.
 */
export function particleEditor(ctx) {
  let adding = null;          // the list (path key) whose "Add an emitter" picker is open
  let drag = null;            // { path, what, x, y, z, dx, dy, def, sprite }
  let root = null;            // the last section drawn, kept for the transport's updates while playing

  const S = () => ctx.state();
  const keyOf = (S0) => ({ clip: S0.clip, frame: S0.frame });
  const commit = (def, note) => { if (def) return ctx.commit(def, note); ctx.say('That change could not be made.'); return false; };

  // ---- the meter ----
  function meter(def, list) {
    const c = P.costSummary(def);
    const state = c.over ? 'over' : c.total > c.budget * 0.9 ? 'near' : 'ok';
    const scale = c.total > c.budget ? c.budget / c.total : 1;
    const sel = S().sel;
    const width = (n) => `width:${Math.max(0, Math.min(100, (n / c.budget) * 100 * scale)).toFixed(2)}%`;
    const segs = c.emitters.filter((e) => pathKey(e.path.slice(0, -1)) === pathKey(list.path)).map((e) => el('span', { class: `v2-pt-seg${pathKey(e.path) === sel ? ' on' : ''}`, style: width(e.cost), title: `${e.id ?? 'emitter'}: ${fmt(e.cost)}` }));
    const others = c.total - c.emitters.filter((e) => pathKey(e.path.slice(0, -1)) === pathKey(list.path)).reduce((a, e) => a + e.cost, 0);
    const errs = P.budgetErrors(S().errors);
    return el('div', { class: 'v2-pt-meter', role: 'meter', 'aria-label': 'What a frame costs, of the 4,000 budget', 'aria-valuemin': '0', 'aria-valuemax': String(c.budget), 'aria-valuenow': String(Math.round(c.total)), 'aria-valuetext': `${fmt(c.total)} of ${fmt(c.budget)}`, 'data-state': state },
      el('div', { class: 'v2-pt-bar', 'aria-hidden': 'true' }, segs, others > 0 ? el('span', { class: 'v2-pt-rest', style: width(others), title: `Everything else: ${fmt(others)}` }) : null),
      el('p', { class: 'v2-pt-total' }, el('strong', {}, `${fmt(c.total)} of ${fmt(c.budget)} a frame`),
        el('span', { class: 'quiet small' }, c.over ? ' · over the budget: it will not draw until it is smaller' : state === 'near' ? ' · close to the budget' : ' · the price the check charges (each emitter at its largest)')),
      errs.length ? el('ul', { class: 'v2-errs' }, errs.map((m) => el('li', {}, m))) : null);
  }

  // ---- play, pause, scrub, clips ----
  function transport(def) {
    const s = S();
    const info = P.clipInfo(def, s.clip, s.sprite);
    const names = [...new Set([...Object.keys(isObj(s.sprite?.clips) ? s.sprite.clips : {}), ...Object.keys(isObj(def.clips) ? def.clips : {})])];
    const play = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'pt-play', 'aria-pressed': String(!!s.playing), onclick: () => togglePlay(play) }, s.playing ? 'Pause' : 'Play');
    const n = info?.frames ?? 1;
    const scrub = el('input', { type: 'range', class: 'v2-pt-scrub', min: '0', max: String(Math.max(0, n - 1)), step: '1', value: String(Math.min(s.frame, n - 1)), 'data-act': 'pt-scrub', 'aria-label': `Frame of ${s.clip ?? 'the clip'}`, disabled: !info });
    scrub.addEventListener('input', () => { ctx.setFrame(Number(scrub.value)); sync(); });
    scrub.addEventListener('change', () => { ctx.setFrame(Number(scrub.value)); ctx.drawPane(); });
    const label = el('span', { class: 'v2-pt-frame num', 'aria-live': 'polite' }, info ? `Frame ${Math.min(s.frame, n - 1) + 1} of ${n}` : 'No clip');
    const chips = el('div', { class: 'chips v2-pt-clips', role: 'group', 'aria-label': 'Clip to key' }, names.map((c) => el('button', { type: 'button', class: 'chip', 'data-pt-clip': c, 'aria-pressed': String(c === s.clip), onclick: () => { ctx.setClip(c); ctx.drawPane(); } }, s.sprite?.clips?.[c]?.label || c)));
    return el('div', { class: 'v2-pt-transport' }, el('div', { class: 'v2-pt-play' }, play, scrub, label), chips);
  }
  function togglePlay(btn) {
    const y = window.scrollY, pane = btn.closest('.st-pane'), top = pane?.scrollTop ?? 0;
    ctx.togglePlay();
    btn.focus({ preventScroll: true });
    window.scrollTo(window.scrollX, y);
    if (pane) pane.scrollTop = top;
    sync();
  }
  /** The transport and the lanes follow the frame in hand (while playing, the stage calls this every frame). */
  function sync() {
    if (!root || !root.isConnected) return;
    const s = S();
    const scrub = root.querySelector('[data-act="pt-scrub"]');
    if (scrub && Number(scrub.value) !== s.frame && document.activeElement !== scrub) scrub.value = String(s.frame);
    const label = root.querySelector('.v2-pt-frame');
    if (label && scrub && !scrub.disabled) label.textContent = `Frame ${s.frame + 1} of ${Number(scrub.max) + 1}`;
    const play = root.querySelector('[data-act="pt-play"]');
    if (play && play.getAttribute('aria-pressed') !== String(!!s.playing)) { play.setAttribute('aria-pressed', String(!!s.playing)); play.textContent = s.playing ? 'Pause' : 'Play'; }
    for (const c of root.querySelectorAll('.v2-pt-cell')) {
      const now = Number(c.dataset.frame) === s.frame;
      c.classList.toggle('is-now', now);
      c.setAttribute('aria-current', String(now));
    }
  }

  // ---- one emitter ----
  function lane(def, e) {
    const s = S();
    const info = P.clipInfo(def, s.clip, s.sprite);
    if (!info) return null;
    const a = P.amountsOf(def, s.clip, e.id, s.sprite);
    const keys = new Map(P.emitterTrack(def, s.clip, e.id).filter((k) => k.frame !== null).map((k) => [k.frame, k]));
    return el('div', { class: 'v2-pt-lane', role: 'group', 'aria-label': `${e.id ?? 'Emitter'} in ${s.clip}: how much draws on each frame` },
      a.frames.map((f) => {
        const k = keys.get(f.frame);
        const words = `Frame ${f.frame + 1}: ${!f.on ? 'off' : f.amount === null ? 'on' : `amount ${Math.round(f.amount * 100) / 100}`}${k ? ', a key' : ''}`;
        return el('button', { type: 'button', class: `v2-pt-cell${f.on ? ' is-on' : ''}${k ? ' is-key' : ''}${f.frame === s.frame ? ' is-now' : ''}`, 'data-frame': String(f.frame), 'aria-current': String(f.frame === s.frame), 'aria-label': words, title: words,
          onclick: () => { ctx.setFrame(f.frame); if (pathKey(e.path) !== s.sel) ctx.pick(e.path); else ctx.drawPane(); } },
        el('span', { class: 'v2-pt-amt', style: `height:${f.on ? (f.amount === null ? 100 : Math.max(8, f.amount * 100)) : 0}%` }),
        k ? el('span', { class: 'v2-pt-key', 'aria-hidden': 'true' }) : null);
      }));
  }

  function card(def, list, e, items, cost) {
    const s = S();
    const on = pathKey(e.path) === s.sel;
    const errs = P.emitterErrors(s.errors, def, e.path);
    const i = e.index;
    const name = e.id ?? `Emitter ${i + 1}`;
    const paint = Array.isArray(e.call.paints) && typeof e.call.paints[0] === 'string' ? e.call.paints[0] : typeof e.call.paint === 'string' ? e.call.paint : typeof e.call.core === 'string' ? e.call.core : null;
    const hex = paint ? swatchOf(paint, def) : null;
    const move = (j) => { const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; ctx.change(list.path, n); };
    const out = !P.inClip(e, s.clip) && s.clip ? el('p', { class: 'v2-pt-out quiet small' }, `Not in ${s.clip}: it draws only in ${e.clip.join(', ')}.`) : null;
    return el('div', { class: `v2-pt-card${on ? ' on' : ''}${errs.length ? ' has-error' : ''}`, 'data-emitter': e.id ?? '', 'data-path': pathKey(e.path) },
      el('div', { class: 'v2-pt-head' },
        el('button', { type: 'button', class: 'v2-pt-name', 'aria-pressed': String(on), 'aria-expanded': String(on), onclick: () => ctx.pick(on ? null : e.path) },
          el('span', { class: `v2-chip${hex ? '' : ' is-gen'}`, style: hex ? `background:${hex}` : null, 'aria-hidden': 'true' }),
          el('strong', { class: 'v2-pt-id' }, name), el('span', { class: 'quiet v2-pt-gen' }, e.key ?? 'no behaviour'),
          e.port ? el('span', { class: 'v2-pt-tag' }, 'port') : null),
        el('span', { class: 'v2-pt-cost num', title: 'What it costs a frame, at its largest' }, cost === null ? '?' : fmt(cost)),
        el('span', { class: 'v2-acts' },
          mini('↑', () => move(i - 1), { 'aria-label': `Draw emitter ${name} earlier (under)`, disabled: i === 0 }),
          mini('↓', () => move(i + 1), { 'aria-label': `Draw emitter ${name} later (over)`, disabled: i === items.length - 1 }),
          mini('Copy', () => { const r = P.copyEmitter(def, e.path); if (r && commit(r.def, `${name} copied: the copy has no keys, so it always draws until it is keyed.`)) ctx.pick(r.path); }, { 'aria-label': `Copy emitter ${name}` }),
          mini('Delete', () => commit(P.deleteEmitter(def, e.path), `${name} deleted, with its keys. Undo brings it back.`), { 'aria-label': `Delete emitter ${name}` }))),
      out, lane(def, e),
      errs.length ? el('ul', { class: 'v2-errs' }, errs.map((m) => el('li', {}, m))) : null,
      on ? editor(def, e) : null);
  }

  // ---- a picked emitter: behaviour, keys, where it starts ----
  function editor(def, e) {
    // the behaviour picked first, then its keys and its place (short), then its arguments (often a long list)
    return el('div', { class: 'v2-pt-edit' }, behaviourBlock(def, e), timeBlock(def, e), spawnBlock(def, e), settingsBlock(def, e));
  }

  function settingsBlock(def, e) {
    if (!isObj(e.call) || typeof e.call.gen !== 'string') return null;
    return el('section', { class: 'v2-pt-block', 'aria-label': 'Its settings' }, el('h4', {}, 'Its settings'),
      genEditor({ def, call: e.call, path: e.path, place: 'emitter', onChange: (p, v) => ctx.change(p, v), onStamp: ctx.onStamp }));
  }

  function behaviourBlock(def, e) {
    const b = P.behaviours();
    const option = (g) => el('option', { value: g.key, title: g.about, selected: g.key === e.key }, `${g.key}: ${g.about.slice(0, 60)}`);
    const known = [...b.shared, ...b.ports].some((g) => g.key === e.key);
    const name = e.id ?? 'this emitter';
    const sel = el('select', { class: 'st-select v2-pt-genpick', 'data-act': 'pt-gen', 'data-k': `pt-gen-${pathKey(e.path)}`, 'aria-label': `Behaviour of ${name}` },
      known ? null : el('option', { value: e.key ?? '', selected: true }, e.key ?? 'none'),
      el('optgroup', { label: 'Behaviours' }, b.shared.map(option)),
      el('optgroup', { label: 'Effect ports (one old effect each, drawn whole)' }, b.ports.map(option)));
    sel.addEventListener('change', () => {
      const g = [...b.shared, ...b.ports].find((x) => x.key === sel.value);
      if (g) commit(P.changeBehaviour(def, e.path, g.id, g.v), `${name} is now ${g.key}: its id, place, clips and the keys that still fit are kept.`);
    });
    return el('section', { class: 'v2-pt-block', 'aria-label': 'Behaviour' },
      el('h4', {}, 'Behaviour'), el('label', { class: 'v2-pt-row' }, el('span', { class: 'st-lbl' }, 'It is '), sel),
      e.port ? el('p', { class: 'v2-pt-port quiet small' }, 'An effect port: it draws one old effect whole, so only its sliders (its settings below) change it. Keys can still turn it on and off and move it.') : null);
  }

  function timeBlock(def, e) {
    const s = S();
    const head = el('h4', {}, `Over time in ${s.clip ?? 'the clip'}`);
    const info = P.clipInfo(def, s.clip, s.sprite);
    if (!info || !e.id) return el('section', { class: 'v2-pt-block' }, head, el('p', { class: 'quiet small' }, e.id ? 'Pick a clip first.' : 'Give it an id (its other fields) to key it.'));
    const a = P.amountsOf(def, s.clip, e.id, s.sprite);
    const mode = el('p', { class: 'quiet small' }, a.keyed ? 'Keyed on and off: it draws where its keys give it an amount above 0, blended between them.' : 'Always on: no key gives it an amount. Give a key an amount to start, swell and stop it (it is then off wherever no key gives it one).');
    if (!info.own) return el('section', { class: 'v2-pt-block' }, head, mode, el('p', { class: 'quiet small' }, 'The body writes this clip. Give it settings of its own under Clips to key it.'));
    if (!P.inClip(e, s.clip)) return el('section', { class: 'v2-pt-block' }, head, el('p', { class: 'quiet small' }, `It does not draw in ${s.clip}.`));
    const frame = Math.min(s.frame, info.frames - 1);
    const k = P.keyAt(def, s.clip, frame, e.id);
    const out = [head, mode];
    if (k < 0) {
      const now = a.frames[frame]?.amount;
      const sp = P.spawnOf(def, e.path, { clip: s.clip, frame, params: s.params });
      const fields = a.keyed ? { amount: fin(now) ? now : 0 } : { at: sp.local };
      out.push(el('div', { class: 'v2-pt-row' }, mini(`Key frame ${frame + 1}`, () => commit(P.setKey(def, s.clip, e.id, frame, fields), `A key on frame ${frame + 1} of ${s.clip}${a.keyed ? `, amount ${Math.round(fields.amount * 100) / 100}` : ', at its place now'}.`), { 'data-act': 'pt-key' }),
        el('span', { class: 'quiet small' }, `No key of ${e.id} on frame ${frame + 1}. Pick a frame in the lane or scrub to another.`)));
      return el('section', { class: 'v2-pt-block' }, out);
    }
    out.push(keyEditor(def, e, k, frame, info, a));
    return el('section', { class: 'v2-pt-block' }, out);
  }

  function keyEditor(def, e, k, frame, info, a) {
    const s = S();
    const clip = s.clip;
    const key = def.clips[clip].keys[k];
    const entry = key.emit[e.id];
    const setField = (f, v, note) => commit(P.setKeyField(def, clip, k, e.id, f, v), note);
    const rows = [];
    for (const kf of P.keyableFields(def, e.path)) {
      const has = Object.hasOwn(entry, kf.name);
      const label = el('span', { class: 'v2-argname', title: kf.about }, kf.name);
      let body;
      if (!has) {
        body = mini('Set', () => setField(kf.name, startValue(def, e, kf, frame, a)), { 'data-act': `pt-set-${kf.name}`, 'aria-label': `Set ${kf.name} in this key` });
      } else if (kf.name === 'amount') {
        const v = fin(entry.amount) ? entry.amount : 0;
        const range = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(v), 'data-k': 'pt-amount', 'aria-label': `Amount of ${e.id} on frame ${frame + 1}` });
        const shown = el('output', { class: 'num v2-pt-amtword' }, String(v));
        range.addEventListener('input', () => { shown.textContent = range.value; });
        range.addEventListener('change', () => setField('amount', Number(range.value)));
        body = el('span', { class: 'v2-pt-amount' }, range, shown);
      } else if (Array.isArray(entry[kf.name]) && entry[kf.name].length === 2) {
        const [x, y] = entry[kf.name];
        body = el('span', { class: 'v2-point' }, 'x ', numberBox({ k: `pt-key-${kf.name}-x`, value: x, label: `${kf.name} across, in this key`, onchange: (n) => setField(kf.name, [n, y]) }),
          ' y ', numberBox({ k: `pt-key-${kf.name}-y`, value: y, label: `${kf.name} down, in this key`, onchange: (n) => setField(kf.name, [x, n]) }));
      } else if (fin(entry[kf.name])) {
        const hi = kf.sized && fin(kf.most) ? kf.most : kf.type?.hi;
        body = el('span', { class: 'v2-pt-num' }, numberBox({ k: `pt-key-${kf.name}`, value: entry[kf.name], min: kf.type?.lo, max: hi, label: `${kf.name} in this key`, onchange: (n) => setField(kf.name, n) }),
          kf.sized && fin(kf.most) ? el('span', { class: 'quiet small' }, ` at most ${kf.most} (what the emitter sets)`) : null);
      } else body = el('span', { class: 'quiet small' }, JSON.stringify(entry[kf.name]).slice(0, 40));
      const drop = has ? mini('×', () => setField(kf.name, undefined, `${kf.name} taken out of the key.`), { 'aria-label': `Take ${kf.name} out of this key` }) : null;
      rows.push(el('div', { class: 'v2-arg v2-pt-keyrow', 'data-field': kf.name }, label, el('span', { class: 'v2-argin' }, body, drop), kf.about ? el('span', { class: 'v2-argabout' }, kf.about) : null));
    }
    const ease = el('select', { class: 'st-select', 'data-k': 'pt-ease', 'aria-label': 'How it leaves this key, toward the next' }, EASES.map((x) => el('option', { value: x, selected: (key.ease ?? 'smooth') === x }, x)));
    ease.addEventListener('change', () => ctx.change(['clips', clip, 'keys', k, 'ease'], ease.value === 'smooth' ? undefined : ease.value));
    const moveTo = (f) => { if (commit(P.moveKey(def, clip, k, e.id, f), `The key moved to frame ${f + 1}.`)) { ctx.setFrame(f); ctx.drawPane(); } };
    const errs = P.keyErrors(s.errors, clip, k, e.id);
    return el('div', { class: `v2-pt-keyed${errs.length ? ' has-error' : ''}` },
      el('p', { class: 'v2-pt-row' }, el('strong', {}, `Key on frame ${frame + 1}`),
        mini('← Earlier', () => moveTo(frame - 1), { 'data-act': 'pt-key-earlier', disabled: frame === 0, 'aria-label': 'Move this key a frame earlier' }),
        mini('Later →', () => moveTo(frame + 1), { 'data-act': 'pt-key-later', disabled: frame >= info.frames - 1, 'aria-label': 'Move this key a frame later' }),
        mini('Delete key', () => commit(P.removeKey(def, clip, k, e.id), `The key of ${e.id} on frame ${frame + 1} is gone.`), { 'data-act': 'pt-unkey' })),
      rows,
      el('div', { class: 'v2-arg' }, el('span', { class: 'v2-argname' }, 'ease'), el('span', { class: 'v2-argin' }, ease), el('span', { class: 'v2-argabout' }, 'How every track leaves this key toward the next (the whole key, every emitter in it).')),
      errs.length ? el('ul', { class: 'v2-errs' }, errs.map((m) => el('li', {}, m))) : null);
  }

  /** The value a key field starts at when it is set: the amount drawn now (1 when none), the point now, the emitter's own value (or its default). */
  function startValue(def, e, kf, frame, a) {
    const s = S();
    if (kf.name === 'amount') { const now = a.frames[frame]?.amount; return a.keyed && fin(now) ? now : 1; }
    if (kf.name === 'at') return P.spawnOf(def, e.path, { clip: s.clip, frame, params: s.params }).local;
    const own = e.call[kf.name];
    const v = fin(own) ? own : Array.isArray(own) && own.every(fin) ? own : kf.type?.default;
    if (fin(v) || Array.isArray(v)) return kf.sized && fin(kf.most) && fin(v) ? Math.min(v, kf.most) : v;
    if (kf.sized && fin(kf.most)) return kf.most;
    return fin(kf.type?.lo) ? Math.max(kf.type.lo, 0) : 0;
  }

  function spawnBlock(def, e) {
    const s = S();
    const sp = P.spawnOf(def, e.path, { clip: s.clip, frame: s.frame, params: s.params });
    if (!sp) return null;
    const out = [el('h4', {}, 'Where it starts')];
    const go = (dx, dy) => commit(P.moveSpawn(def, e.path, 'at', dx, dy, keyOf(s)));
    if (sp.movable) {
      out.push(el('div', { class: 'v2-move v2-pt-row', role: 'group', 'aria-label': 'Move its point' }, el('span', { class: 'st-lbl' }, `Point ${sp.local.map((n) => Math.round(n * 100) / 100).join(', ')} `),
        mini('←', () => go(-1, 0), { 'aria-label': 'Move the point left one pixel' }), mini('↑', () => go(0, -1), { 'aria-label': 'Move the point up one pixel' }),
        mini('↓', () => go(0, 1), { 'aria-label': 'Move the point down one pixel' }), mini('→', () => go(1, 0), { 'aria-label': 'Move the point right one pixel' })),
      el('p', { class: 'quiet small' }, sp.keyed ? `This clip's keys move it: a move goes into the key on frame ${s.frame + 1} (one is made there if none is). Drag it on the picture.` : `Drag it on the picture${e.on ? ` (it sits on ${e.on})` : ''}.`));
    } else out.push(el('p', { class: 'quiet small' }, sp.why));
    if (sp.boxable) {
      const [W, H] = Array.isArray(def.size) ? def.size : [32, 32];
      if (!isObj(e.call.area)) out.push(el('div', { class: 'v2-pt-row' }, mini('Give it a box', () => commit(P.setArea(def, e.path, { x0: 2, y0: 2, x1: W - 2, y1: H - 2 }), 'A box: what it draws stays inside it. Drag its middle or its corner on the picture.'), { 'data-act': 'pt-box' }),
        el('span', { class: 'quiet small' }, 'Without one it may draw anywhere in the frame.')));
      else out.push(el('div', { class: 'v2-pt-row' }, el('span', { class: 'st-lbl' }, sp.area ? `Box ${sp.area.x0}, ${sp.area.y0} to ${sp.area.x1}, ${sp.area.y1}` : 'Box (set by a control)'),
        mini('No box', () => commit(P.setArea(def, e.path, null), 'The box is gone.'), { 'data-act': 'pt-unbox' }),
        el('span', { class: 'quiet small' }, sp.areaMovable ? 'Drag its middle to move it, its corner to size it.' : 'Its numbers are set by a control: change them in its table.')));
    }
    return el('section', { class: 'v2-pt-block', 'aria-label': 'Where it starts' }, out);
  }

  // ---- the section for one emitter list ----
  function adder(def, list) {
    const b = P.behaviours();
    const sel = el('select', { class: 'st-select', 'data-act': 'pt-pick', 'data-k': 'pt-pick', 'aria-label': 'Behaviour to add' },
      el('optgroup', { label: 'Behaviours' }, b.shared.map((g) => el('option', { value: g.key, title: g.about }, `${g.key}: ${g.about.slice(0, 70)}`))),
      el('optgroup', { label: 'Effect ports (one old effect each, drawn whole)' }, b.ports.map((g) => el('option', { value: g.key, title: g.about }, `${g.key}: ${g.about.slice(0, 70)}`))));
    const about = el('p', { class: 'quiet small v2-about' }, b.shared[0]?.about ?? '');
    sel.addEventListener('change', () => { about.textContent = [...b.shared, ...b.ports].find((g) => g.key === sel.value)?.about ?? ''; });
    const go = () => {
      const g = [...b.shared, ...b.ports].find((x) => x.key === sel.value);
      const r = g && P.newEmitter(def, list.path, g.id, g.v);
      if (!r) { ctx.say('That behaviour could not be added here.'); return; }
      adding = null;
      if (commit(r.def, `${getAt(r.def, r.path).id} added: it always draws until a key gives it an amount.`)) ctx.pick(r.path);
    };
    return el('div', { class: 'v2-genpick' }, el('label', { class: 'st-lbl' }, 'Add: '), sel, mini('Add it', go, { 'data-act': 'pt-add-it' }), mini('Cancel', () => { adding = null; ctx.drawPane(); }), about);
  }

  /** An emitter list's editor, for the Body tab. Arguments: list ({ path, label, place, word }, app/studio/v2-model.js itemListsOf). */
  function section(list) {
    const s = S();
    const def = s.def;
    const items = getAt(def, list.path) ?? [];
    const cost = new Map(P.costSummary(def).emitters.map((x) => [pathKey(x.path), x.cost]));
    const ems = P.emittersOf(def).filter((e) => pathKey(e.list) === pathKey(list.path));
    const add = mini('Add an emitter', () => { adding = adding === pathKey(list.path) ? null : pathKey(list.path); ctx.drawPane(); root?.querySelector('[data-act="pt-pick"]')?.focus(); }, { 'data-act': 'pt-add', 'aria-expanded': String(adding === pathKey(list.path)) });
    root = el('section', { class: 'v2-list v2-particles', 'data-list': pathKey(list.path), 'aria-label': `${list.label}: the particle editor` },
      el('div', { class: 'st-head' }, el('h3', {}, list.label), add),
      adding === pathKey(list.path) ? adder(def, list) : null,
      meter(def, list),
      transport(def),
      ems.length ? ems.map((e) => card(def, list, e, items, cost.get(pathKey(e.path)) ?? null)) : el('p', { class: 'quiet small' }, 'No emitters yet: Add an emitter puts in a behaviour from the list.'));
    return root;
  }

  // ---- the stage: points, reach and boxes drawn; pressed and dragged ----
  /** The emitters drawn in the clip in hand, the picked one first. */
  function onStage(def) {
    const s = S();
    const ems = P.emittersOf(def).filter((e) => P.inClip(e, s.clip));
    return ems.sort((a, b) => (pathKey(b.path) === s.sel) - (pathKey(a.path) === s.sel));
  }
  const ink = (g, draw, { dash = [], width = 1 } = {}) => {
    g.setLineDash(dash.map((d) => d + 1));
    g.lineWidth = width + 2; g.strokeStyle = 'rgba(255,255,255,0.9)'; draw(); g.stroke();
    g.setLineDash(dash);
    g.lineWidth = width; g.strokeStyle = 'rgba(0,0,0,0.85)'; draw(); g.stroke();
    g.setLineDash([]);
  };

  /** Draws the emitters' points, reach and boxes over the picture on the Body tab (and the dragged picture). Arguments: g (the stage's 2D context, in CSS pixels), layout ({ ox, oy, z }), sprite (drawn). */
  function drawOver(g, layout, sprite) {
    sync();
    const s = S();
    if (!layout || s.tab !== 'body' || !sprite) return;
    const def = drag?.def ?? s.def;
    const { ox, oy, z } = layout;
    const [W, H] = sprite.size;
    if (drag?.sprite) {
      try {
        const pic = canvasOf(renderFrame(drag.sprite, s.clip, Math.min(s.frame, drag.sprite.clips[s.clip].frames - 1), cleanParams(drag.sprite, s.params)));
        g.clearRect(ox, oy, W * z, H * z);
        g.imageSmoothingEnabled = false;
        g.drawImage(pic, ox, oy, W * z, H * z);
      } catch { /* the stage keeps the last picture */ }
    }
    let ems;
    try { ems = onStage(def); } catch { return; }
    g.save();
    for (const e of ems.slice().reverse()) {
      const sp = P.spawnOf(def, e.path, { clip: s.clip, frame: s.frame, params: s.params });
      if (!sp) continue;
      const on = pathKey(e.path) === s.sel;
      const x = ox + (sp.at[0] + 0.5) * z, y = oy + (sp.at[1] + 0.5) * z;
      if (sp.area && on) {
        const a = sp.area;
        ink(g, () => { g.beginPath(); g.rect(ox + a.x0 * z + 0.5, oy + a.y0 * z + 0.5, (a.x1 - a.x0) * z - 1, (a.y1 - a.y0) * z - 1); }, { dash: [5, 3] });
        if (sp.areaMovable) { g.fillStyle = '#fff'; g.fillRect(ox + a.x1 * z - 4, oy + a.y1 * z - 4, 8, 8); ink(g, () => { g.beginPath(); g.rect(ox + a.x1 * z - 3.5, oy + a.y1 * z - 3.5, 7, 7); }); }
      }
      if (on && fin(sp.reach)) ink(g, () => { g.beginPath(); g.arc(x, y, sp.reach * z, 0, Math.PI * 2); }, { dash: [2, 3] });
      const r = on ? 7 : 4;
      ink(g, () => { g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); }, { width: on ? 2 : 1 });
      if (on) ink(g, () => { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); });
    }
    g.restore();
  }

  /** Takes a press on the picture that lands on an emitter's point, the picked one's box or its corner (or, with an emitter picked, anywhere: its point moves); true when it did. Arguments: e (pointer event), layout. */
  function pointerDown(ev, layout) {
    const s = S();
    if (!layout || s.tab !== 'body' || !s.sprite || !ctx.canvas) return false;
    const ems = onStage(s.def);
    const picked = ems.find((e) => pathKey(e.path) === s.sel) ?? null;
    if (!ems.length) return false;
    const r = ctx.canvas.getBoundingClientRect();
    const cx = ev.clientX - r.left, cy = ev.clientY - r.top;
    const { ox, oy, z } = layout;
    const near = (x, y, d) => Math.hypot(cx - x, cy - y) <= d;
    let hit = null;
    for (const e of ems) {
      const sp = P.spawnOf(s.def, e.path, { clip: s.clip, frame: s.frame, params: s.params });
      if (!sp) continue;
      if (e === picked && sp.area && sp.areaMovable && near(ox + sp.area.x1 * z, oy + sp.area.y1 * z, NEAR_CORNER)) { hit = { e, what: 'corner' }; break; }
      if (sp.movable && near(ox + (sp.at[0] + 0.5) * z, oy + (sp.at[1] + 0.5) * z, Math.max(NEAR_POINT, z * 0.75))) { hit = { e, what: 'at' }; break; }
    }
    if (!hit && picked) {
      const sp = P.spawnOf(s.def, picked.path, { clip: s.clip, frame: s.frame, params: s.params });
      const px = (cx - ox) / z, py = (cy - oy) / z;
      if (sp?.area && sp.areaMovable && px >= sp.area.x0 && px <= sp.area.x1 && py >= sp.area.y0 && py <= sp.area.y1) hit = { e: picked, what: 'area' };
      else if (sp?.movable) hit = { e: picked, what: 'at' };
      else { ctx.say(sp?.why ?? 'It cannot be moved.'); return true; }
    }
    if (!hit) return false;
    if (hit.e !== picked) ctx.pick(hit.e.path);
    drag = { path: hit.e.path, what: hit.what, x: ev.clientX, y: ev.clientY, z, dx: 0, dy: 0, def: null, sprite: null };
    ctx.canvas.setPointerCapture?.(ev.pointerId);
    ctx.canvas.classList.add('is-dragging');
    ev.preventDefault?.();
    return true;
  }
  if (ctx.canvas) {
    ctx.canvas.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const dx = Math.round((ev.clientX - drag.x) / drag.z), dy = Math.round((ev.clientY - drag.y) / drag.z);
      if (dx === drag.dx && dy === drag.dy) return;
      drag.dx = dx; drag.dy = dy;
      const s = S();
      drag.def = dx || dy ? P.moveSpawn(s.def, drag.path, drag.what, dx, dy, { ...keyOf(s), space: 'frame' }) : null;
      const m = drag.def ? spriteOf(drag.def) : null;
      drag.sprite = m?.ok ? m.sprite : null;
      ctx.drawStage();
    });
    const end = () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      ctx.canvas.classList.remove('is-dragging');
      const words = { at: 'The point moved', area: 'The box moved', corner: 'The box was sized' }[d.what];
      if (d.def) ctx.commit(d.def, `${words} ${d.dx} across and ${d.dy} down.`);
      else ctx.drawStage();
    };
    ctx.canvas.addEventListener('pointerup', end);
    ctx.canvas.addEventListener('pointercancel', end);
  }

  return { section, drawOver, pointerDown };
}
