// The handles on the version 2 editor's picture (the model is app/studio/v2-handles.js): the anchor as a crosshair, for a
// rig the solved skeleton (bones as lines, joints as dots, a "Show bones" switch) with a handle at the tip of each bone and
// at the end of each IK chain. Drag one on the picture, or Tab to it (Shift+Tab goes back), nudge it with the arrow keys
// (Shift: 4 pixels), Escape lets go. The Body tab edits the rest pose (anchor, rest angle and length of the sprite's own
// bones); the Clips tab edits the frame in hand (its key for a bone's angle or an IK target). Each change goes through
// the editor's commit, so Undo, saving and the check treat it like any other.
import { el } from '../ui.js';
import { sitePieces } from '../../engine/pieces.js';
import { cleanParams } from '../../engine/sprite.js';
import { spriteOf } from './v2-check.js';
import * as HM from './v2-handles.js';

const HIT = 10;      // how near (screen px) a press must be to take a handle

/**
 * One handles overlay for one editor page: { bar (the controls row), drawOver(g, layout, sprite), pointerDown(e, layout) }.
 * Arguments: { state () -> the editor state S, commit (def, note), say (text), drawStage (), setLive (sprite | null: the picture while dragging), canvas }.
 */
export function handlesUi({ state, commit, say, drawStage, setLive, canvas }) {
  let sel = null;                    // the handle id in hand
  let showBones = true;
  let drag = null;                   // { id, def (when it started), moved, note }
  let liveDef = null;                // the definition while dragging
  let layoutNow = null;
  let cache = { def: null, key: '', R: null };

  const S = () => state();
  const active = () => { const s = S(); return (s.tab === 'body' || s.tab === 'clips') && !!s.def; };
  const mode = () => (S().tab === 'clips' ? 'clips' : 'body');

  /** The resolved sprite of a definition for the settings in hand, kept for the same definition and settings. */
  function resolved(def) {
    const s = S();
    const key = JSON.stringify(s.params ?? {});
    if (cache.def === def && cache.key === key) return cache.R;
    let R = null;
    try {
      const settings = s.sprite ? cleanParams(s.sprite, s.params ?? {}) : (s.params ?? {});
      R = HM.resolvedOf(def, { pieces: sitePieces(), settings });
    } catch { R = null; }
    cache = { def, key, R };
    return R;
  }
  const ctxOf = (def) => ({ mode: mode(), clip: S().clip, frame: S().frame, resolved: resolved(def), settings: S().params });
  const defNow = () => liveDef ?? S().def;
  const list = () => (active() ? HM.handles(defNow(), ctxOf(defNow())) : []);
  const isRig = (hs) => hs.some((h) => h.id !== 'pivot');

  // ---- the controls row under the picture ----
  const bones = el('input', { type: 'checkbox', checked: true, 'data-k': 'show-bones', onchange: (e) => { showBones = e.target.checked; drawStage(); } });
  const bonesLabel = el('label', { class: 'v2-hbones', title: 'Draw the bones over the picture, with a handle at the tip of each' }, bones, ' Show bones');
  const pick = el('select', { class: 'st-select', 'aria-label': 'Handle', 'data-k': 'handle-pick', onchange: (e) => { sel = e.target.value || null; drawStage(); refreshBar(true); } });
  const arrow = (label, word, dx, dy) => el('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Nudge the handle ${word} one pixel`, 'data-act': `handle-${word}`, onclick: () => nudge(dx, dy) }, label);
  const snap = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'snap-feet', title: 'Put the anchor under the body, on the ground row', onclick: () => snapFeet() }, 'Snap to the feet');
  const readout = el('span', { class: 'quiet small v2-hread', 'aria-live': 'polite' });
  const bar = el('div', { class: 'v2-handlebar', role: 'group', 'aria-label': 'Handles on the picture', hidden: true }, el('span', { class: 'st-lbl' }, 'Handle '), pick,
    el('span', { class: 'v2-move' }, arrow('←', 'left', -1, 0), arrow('↑', 'up', 0, -1), arrow('↓', 'down', 0, 1), arrow('→', 'right', 1, 0)), bonesLabel, snap, readout);
  let barKey = '';
  function refreshBar(force = false) {
    const on = active();
    bar.hidden = !on;
    if (!on) return;
    const hs = list();
    const rig = isRig(hs);
    const key = `${mode()}|${hs.map((h) => h.id).join(',')}|${sel}|${showBones}`;
    bonesLabel.hidden = !rig; snap.hidden = !rig;
    if (key !== barKey || force) {
      barKey = key;
      pick.replaceChildren(el('option', { value: '' }, 'None'), ...hs.map((h) => el('option', { value: h.id }, h.label)));
      pick.value = hs.some((h) => h.id === sel) ? sel : '';
    }
    const h = hs.find((x) => x.id === sel);
    readout.textContent = h ? `${h.label}: ${Math.round(h.at[0])}, ${Math.round(h.at[1])}` : 'Drag the anchor or a bone tip on the picture, or Tab to one.';
  }

  const noteFor = (h, def, next) => {
    const s = S();
    const took = mode() === 'clips' && def.clips?.[s.clip]?.from !== undefined && next.clips?.[s.clip]?.from === undefined;
    const what = h.id === 'pivot' ? `Anchor moved to ${next.pivot[0]}, ${next.pivot[1]}.` : mode() === 'clips' ? `${h.label} moved on frame ${s.frame + 1} of ${s.clip}.` : `${h.label} changed in the body.`;
    return took ? `${what} The ${s.clip} clip now has keys of its own, so it no longer follows its base.` : what;
  };

  function apply(id, make) {
    const def = S().def;
    const hs = HM.handles(def, ctxOf(def));
    const h = hs.find((x) => x.id === id);
    if (!h) return;
    const next = make(def, ctxOf(def));
    if (JSON.stringify(next) === JSON.stringify(def)) { say(h.id === 'pivot' ? 'The anchor stays inside the frame.' : `${h.label} cannot go there.`); return; }
    commit(next, noteFor(h, def, next));
  }
  function nudge(dx, dy) {
    if (!sel) { say('Pick a handle first: press on one, or choose it in the list.'); return; }
    apply(sel, (def, ctx) => HM.nudgeHandle(def, ctx, sel, dx, dy));
  }
  function snapFeet() {
    const def = S().def;
    const at = HM.feetPivot(def, { ...ctxOf(def), mode: 'body' });
    if (at[0] === def.pivot[0] && at[1] === def.pivot[1]) { say('The anchor is already at the feet.'); return; }
    sel = 'pivot';
    commit(HM.setPivot(def, at), `Anchor snapped to the feet, ${at[0]}, ${at[1]}.`);
  }

  // ---- drawing over the picture ----
  const sx = (x) => layoutNow.ox + x * layoutNow.z, sy = (y) => layoutNow.oy + y * layoutNow.z;
  const screenOf = (h) => (h.kind === 'pivot' ? [sx(h.at[0] + 0.5), sy(h.at[1] + 0.5)] : [sx(h.at[0]), sy(h.at[1])]);

  function drawOver(g, layout) {
    layoutNow = layout;
    refreshBar();
    if (!layout || !active()) return;
    const def = defNow();
    const ctx = ctxOf(def);
    const hs = HM.handles(def, ctx);
    g.save();
    g.lineJoin = 'round';
    if (showBones && isRig(hs)) {
      const sk = HM.skeleton(def, ctx);
      if (sk) {
        const lines = sk.J.order.filter((id) => sk.show.has(id)).map((id) => sk.J.bones[id]).filter((B) => Math.hypot(B.end[0] - B.start[0], B.end[1] - B.start[1]) >= 0.5);
        for (const pass of [0, 1]) {
          g.strokeStyle = pass ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)';
          g.lineWidth = pass ? 1 : 3;
          g.beginPath();
          for (const B of lines) { g.moveTo(sx(B.start[0]), sy(B.start[1])); g.lineTo(sx(B.end[0]), sy(B.end[1])); }
          g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1;
        for (const B of lines) { g.beginPath(); g.arc(sx(B.start[0]), sy(B.start[1]), 2.5, 0, 6.2832); g.fill(); g.stroke(); }
      }
    }
    for (const h of hs) {
      if (h.id !== 'pivot' && !showBones) continue;
      const [x, y] = screenOf(h);
      const on = h.id === sel;
      if (h.kind === 'pivot') {
        g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 4;
        for (const pass of [0, 1]) {
          if (pass) { g.strokeStyle = on ? '#ff5a1f' : '#ffd400'; g.lineWidth = 2; }
          g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke();
          g.beginPath(); g.arc(x, y, 5, 0, 6.2832); g.stroke();
        }
      } else {
        g.fillStyle = on ? '#ff5a1f' : h.kind === 'ik' ? '#2fd37a' : h.kind === 'root' ? '#b86bff' : '#2aa8ff';
        g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 1.5;
        g.beginPath();
        if (h.kind === 'ik') g.rect(x - 5, y - 5, 10, 10); else g.arc(x, y, on ? 6 : 4.5, 0, 6.2832);
        g.fill(); g.stroke();
      }
    }
    g.restore();
  }

  // ---- pointer ----
  const near = (e, layout) => {
    if (!layout || !active() || S().playing) return null;
    layoutNow = layout;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best = null, bd = HIT * HIT;
    for (const h of list()) {
      if (h.id !== 'pivot' && !showBones) continue;
      const [x, y] = screenOf(h);
      const d = (x - px) ** 2 + (y - py) ** 2;
      // a bone tip sitting on the anchor or a foot: the smaller handle wins a tie, so each can still be reached
      if (d < bd || (d === bd && best && h.id !== 'pivot')) { best = h; bd = d; }
    }
    return best ? { h: best, px, py } : null;
  };
  const pointOf = (h, e, layout) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left - layout.ox) / layout.z, y = (e.clientY - r.top - layout.oy) / layout.z;
    return h.id === 'pivot' ? [x - 0.5, y - 0.5] : [x, y];
  };

  function pointerDown(e, layout) {
    if (e.button !== undefined && e.button !== 0) return false;
    const n = near(e, layout);
    if (!n) return false;
    sel = n.h.id;
    drag = { id: n.h.id, def: S().def, moved: null, label: n.h };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.classList.add('is-dragging');
    canvas.focus?.({ preventScroll: true });
    refreshBar(true);
    drawStage();
    return true;
  }
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      const n = layoutNow ? near(e, layoutNow) : null;
      canvas.style.cursor = n ? 'grab' : '';
      return;
    }
    const def = drag.def;
    const next = HM.dragHandle(def, ctxOf(def), drag.id, pointOf(drag.label, e, layoutNow));
    if (JSON.stringify(next) === JSON.stringify(drag.moved ?? def)) return;
    drag.moved = next;
    liveDef = next;
    const m = spriteOf(next);
    setLive(m.ok ? m.sprite : null);
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null; liveDef = null;
    canvas.classList.remove('is-dragging');
    setLive(null);
    if (d.moved && JSON.stringify(d.moved) !== JSON.stringify(d.def)) commit(d.moved, noteFor(d.label, d.def, d.moved));
    else drawStage();
    refreshBar(true);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---- keyboard: Tab and Shift+Tab walk the handles, arrows nudge, Escape lets go ----
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (!active() || e.ctrlKey || e.metaKey || e.altKey) return;
    const hs = list();
    if (e.key === 'Tab') {
      if (!hs.length) return;
      const i = hs.findIndex((h) => h.id === sel);
      const j = e.shiftKey ? (i < 0 ? hs.length - 1 : i - 1) : i + 1;
      if (j < 0 || j >= hs.length) { sel = null; refreshBar(true); drawStage(); return; }    // past the ends: focus moves on
      e.preventDefault(); e.stopPropagation();
      sel = hs[j].id;
      say(hs[j].label);
      refreshBar(true); drawStage();
      return;
    }
    if (e.key === 'Escape' && sel) { e.preventDefault(); e.stopPropagation(); sel = null; refreshBar(true); drawStage(); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d && sel) {
      e.preventDefault(); e.stopPropagation();
      const k = e.shiftKey ? 4 : 1;
      nudge(d[0] * k, d[1] * k);
    }
  });
  canvas.addEventListener('blur', () => { /* the handle stays picked: the list and the arrow buttons still work */ });
  return { bar, drawOver, pointerDown };
}
