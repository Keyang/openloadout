// The studio's live picture (docs/studio.md sections 4 and 5; item S9): the frame at a whole-number zoom on the shelf
// tile, pixels never smoothed, the bones as thin lines over it, handles to drag (a bone's tip, a foot, the whole body,
// the anchor), the attach points and the anchor cross. On "In a scene" the frame stands in the asset page's scene
// (app/stage.js). The stage draws what view() says and reports drags; the editor owns the definition.
import { el } from '../ui.js';
import { drawStage, sceneFor } from '../stage.js';
import { drawFrame, drawRest } from './draw.js';
import { handles, skeleton, isRig, dragHandle } from './edit.js';
import { rigPoints } from '../../rigs/bones.js';
import { librarySockets } from './library-body.js';
import { bandBox } from './advice.js';

const INK = '#000000';
const HIT = 14;                 // how near a pointer must be to a handle to take it, in CSS pixels
const HIT_TOUCH = 22;

/** A Surface as a canvas of its own size. */
function canvasOf(g) {
  const c = document.createElement('canvas');
  c.width = g.w; c.height = g.h;
  c.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
  return c;
}

/**
 * The stage: { node, canvas, draw(), positions(), zoom(), fit() } where positions() maps each handle id to where it is drawn
 * (CSS pixels from the canvas's top-left). Arguments: { view (() => the view: { def, mode, clip, frame, facing, bodyClip,
 * playing, bones, zoom, sel, onion, scene, label }), onLive (def while dragging), onCommit (def when a drag ends),
 * onSelect ({ handle, bone }), afterDraw (positions) }.
 */
export function makeStage({ view, onLive, onCommit, onSelect, afterDraw }) {
  const canvas = el('canvas', { class: 'studio-canvas', role: 'img', 'aria-label': 'The sprite' });
  const wrap = el('div', { class: 'stage-wrap' }, canvas);
  const node = el('div', { class: 'stage-card tile studio-card' }, wrap);
  const pics = new WeakMap();           // def -> Map("clip:frame" -> canvas)
  let layout = null;                    // where the frame was last drawn: { ox, oy, z }
  let spots = [];                       // handles as drawn: [{ id, x, y, kind }]
  let drag = null;
  let hover = null;

  function picture(def, key, make) {
    let m = pics.get(def);
    if (!m) { m = new Map(); pics.set(def, m); }
    let c = m.get(key);
    if (!c) { c = canvasOf(make()); m.set(key, c); }
    return c;
  }

  /** The largest whole zoom at which the frame fits the box, and the zoom used: the person's, else that (at most 12; 4 in a scene, so the scene reads). */
  const fitFor = (v, cw, ch) => { const m = Math.min(24, Math.round(Math.min(cw, ch) * 0.06)); return Math.max(1, Math.floor(Math.min((cw - m) / v.def.size[0], (ch - m) / v.def.size[1]))); };
  const zoomFor = (v, cw, ch) => { const fit = fitFor(v, cw, ch); return Math.max(1, Math.min(fit, v.zoom ?? Math.min(fit, v.mode === 'look' ? 4 : 12))); };
  const boxOf = () => { const b = node.getBoundingClientRect(); return [Math.max(1, Math.floor(b.width)), Math.max(1, Math.floor(b.height))]; };
  const ctxOf = (v) => ({ mode: v.mode, clip: v.clip, frame: v.frame, facing: v.facing });
  const editing = (v) => !v.playing && (v.mode === 'move' || v.mode === 'frames' || (v.mode === 'body' && !v.bodyClip));

  function draw() {
    const v = view();
    const def = v.def;
    const box = node.getBoundingClientRect();
    const cw = Math.max(1, Math.floor(box.width)), ch = Math.max(1, Math.floor(box.height));
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) { canvas.width = cw * dpr; canvas.height = ch * dpr; }
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    if (!def) return;
    const [W, H] = def.size;
    const z = zoomFor(v, cw, ch);
    // the picture in sprite pixels, with the scene behind it, then scaled up whole
    const sw = Math.ceil(cw / z), sh = Math.ceil(ch / z);
    const fx = Math.floor((sw - W) / 2), fy = Math.floor((sh - H) / 2);
    const low = document.createElement('canvas');
    low.width = sw; low.height = sh;
    const lc = low.getContext('2d');
    const inScene = v.scene === 'scene' && v.mode === 'look';
    if (inScene) drawStage(lc, sw, sh, fy + def.pivot[1] + (def.grounded === false ? Math.round((H - def.pivot[1]) * 0.75) : 0) + 1, sceneFor(def.meta), 0);
    const restPose = v.mode === 'body' && !v.bodyClip;
    const clip = v.mode === 'body' ? v.bodyClip : v.clip;
    if (!restPose && v.onion && !v.playing && def.clips[clip]?.frames > 1 && v.mode === 'move') {
      const n = def.clips[clip].frames;
      const prev = (v.frame - 1 + n) % n;
      lc.globalAlpha = 0.28;
      lc.drawImage(picture(def, `${clip}:${prev}`, () => drawFrame(def, clip, prev)), fx, fy);
      lc.globalAlpha = 1;
    }
    const pic = restPose ? picture(def, `rest:${v.facing ?? 'side'}`, () => drawRest(def, v.facing ?? 'side')) : picture(def, `${clip}:${v.frame}`, () => drawFrame(def, clip, v.frame));
    lc.drawImage(pic, fx, fy);
    const offX = Math.round((cw - sw * z) / 2), offY = Math.round((ch - sh * z) / 2);
    g.imageSmoothingEnabled = false;
    g.drawImage(low, offX, offY, sw * z, sh * z);
    const ox = offX + fx * z, oy = offY + fy * z;
    layout = { ox, oy, z };
    const X = (x) => ox + x * z, Y = (y) => oy + y * z;

    // the frame's edge and, close up, its pixel grid
    if (!inScene) {
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1;
      g.strokeRect(ox - 0.5, oy - 0.5, W * z + 1, H * z + 1);
      if (z >= 6 && v.grid) {
        g.strokeStyle = 'rgba(0,0,0,0.05)';
        g.beginPath();
        for (let x = 1; x < W; x++) { g.moveTo(X(x) + 0.5, oy); g.lineTo(X(x) + 0.5, oy + H * z); }
        for (let y = 1; y < H; y++) { g.moveTo(ox, Y(y) + 0.5); g.lineTo(ox + W * z, Y(y) + 0.5); }
        g.stroke();
      }
    }
    spots = [];
    if (v.mode === 'look' || inScene) { afterDraw?.(positions()); return; }

    // the anchor: a cross where the sprite stands
    const showAnchor = v.mode === 'frames' || restPose;
    if (showAnchor) {
      const px = X(def.pivot[0] + 0.5), py = Y(def.pivot[1] + 0.5), r = Math.max(6, z * 1.5);
      g.strokeStyle = INK; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px - r, py); g.lineTo(px + r, py); g.moveTo(px, py - r); g.lineTo(px, py + r); g.stroke();
      g.beginPath(); g.arc(px, py, 3, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.stroke();
    }

    // item S12: on Frames, the fill band (half to three quarters of the frame) as two dashed boxes, and the 1 px border
    if (v.mode === 'frames' && !v.playing) {
      const band = bandBox(def);
      g.save(); g.setLineDash([4, 4]); g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.28)';
      for (const [x, y, w, h] of [band.inner, band.outer]) g.strokeRect(X(x) + 0.5, Y(y) + 0.5, w * z - 1, h * z - 1);
      g.setLineDash([]); g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.strokeRect(X(1) + 0.5, Y(1) + 0.5, (W - 2) * z - 1, (H - 2) * z - 1);
      g.restore();
    }
    // item S10: a library body's attach points on its rest pose, where the body puts them
    if (restPose && !isRig(def) && v.bones) {
      g.font = '500 11px Geist, system-ui, sans-serif';
      const named = [];
      for (const p of librarySockets(def)) {
        const x = X(p.x), y = Y(p.y);
        // two points close together (the hands at rest) are both marked, the second without its name over the first
        const crowded = named.some(([a, b]) => Math.hypot(a - x, b - y) < 28);
        if (!crowded) named.push([x, y]);
        g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.closePath();
        g.fillStyle = '#fff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
        if (z >= 4 && !crowded) { g.fillStyle = '#5c5c5c'; g.fillText(p.label.toLowerCase(), x + 6, y - 5); }
      }
    }
    // a library body (item S10) has handles on Move: hips, hands, feet, head, upper body, the held thing
    const libMove = !isRig(def) && v.mode === 'move';
    if (!editing(v) || !(isRig(def) || libMove) || !v.bones) {
      if (v.mode === 'frames' && editing(v) && isRig(def)) spots = [{ id: 'pivot', kind: 'pivot', x: X(def.pivot[0] + 0.5), y: Y(def.pivot[1] + 0.5) }];
      afterDraw?.(positions());
      return;
    }
    const ctx = ctxOf(v);
    const sk = skeleton(def, ctx);
    const selBone = v.sel?.bone;
    if (sk && v.mode !== 'frames') {
      // bones: a thin line each, the selected one darker
      for (const id of sk.J.order) {
        const B = sk.J.bones[id];
        const on = id === selBone;
        g.strokeStyle = on ? INK : 'rgba(0,0,0,0.45)';
        g.lineWidth = on ? 2.5 : 1.25;
        g.beginPath(); g.moveTo(X(B.start[0]), Y(B.start[1])); g.lineTo(X(B.end[0]), Y(B.end[1])); g.stroke();
        g.beginPath(); g.arc(X(B.start[0]), Y(B.start[1]), on ? 2.5 : 2, 0, Math.PI * 2); g.fillStyle = on ? INK : 'rgba(0,0,0,0.55)'; g.fill();
      }
      // attach points (Body): a small open diamond with its name
      if (restPose) {
        const pts = rigPoints(sk.rig, sk.J);
        g.font = '500 11px Geist, system-ui, sans-serif';
        for (const [name, p] of Object.entries(pts)) {
          if (name === 'feet') continue;
          const x = X(p.x), y = Y(p.y);
          g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.closePath();
          g.fillStyle = '#fff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
          if (z >= 4) { g.fillStyle = '#5c5c5c'; g.fillText(name, x + 6, y - 5); }
        }
      }
    }
    for (const h of handles(def, ctx)) {
      spots.push({ id: h.id, kind: h.kind, x: X(h.at[0]), y: Y(h.at[1]), label: h.label });
      // a library body has no bones to draw: a thin line from where each handle hangs shows what it moves
      if (libMove && h.from) { g.strokeStyle = v.sel?.handle === h.id ? INK : 'rgba(0,0,0,0.4)'; g.lineWidth = 1.25; g.beginPath(); g.moveTo(X(h.from[0]), Y(h.from[1])); g.lineTo(X(h.at[0]), Y(h.at[1])); g.stroke(); }
    }
    const k = cw < 420 ? 0.75 : 1;        // a small picture (a phone): smaller handles, so the sprite still shows
    for (const s of spots) {
      const on = v.sel?.handle === s.id, near = hover === s.id;
      g.lineWidth = 1.5; g.strokeStyle = INK; g.fillStyle = on ? INK : '#fff';
      g.beginPath();
      if (s.kind === 'ik') g.rect(s.x - 5 * k, s.y - 5 * k, 10 * k, 10 * k);
      else if (s.kind === 'root') { g.arc(s.x, s.y, 7 * k, 0, Math.PI * 2); }
      else if (s.kind === 'pivot') g.arc(s.x, s.y, 6 * k, 0, Math.PI * 2);
      else g.arc(s.x, s.y, 5 * k, 0, Math.PI * 2);
      g.fill(); g.stroke();
      if (s.kind === 'root') { g.beginPath(); g.moveTo(s.x - 3, s.y); g.lineTo(s.x + 3, s.y); g.moveTo(s.x, s.y - 3); g.lineTo(s.x, s.y + 3); g.strokeStyle = on ? '#fff' : INK; g.stroke(); }
      if (near && !on) { g.beginPath(); g.arc(s.x, s.y, 10, 0, Math.PI * 2); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke(); }
    }
    afterDraw?.(positions());
  }

  /** Where each handle is, in CSS pixels from the canvas's top-left. */
  function positions() {
    const m = new Map();
    for (const s of spots) m.set(s.id, [Math.round(s.x), Math.round(s.y)]);
    return m;
  }

  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const toFrame = ([x, y]) => [(x - layout.ox) / layout.z, (y - layout.oy) / layout.z];
  function hit([x, y], touch) {
    const v = view();
    let best = null, bd = touch ? HIT_TOUCH : HIT;
    // the selected handle wins a tie, so a handle on top of another can still be taken
    for (const s of spots) { const d = Math.hypot(s.x - x, s.y - y) - (v.sel?.handle === s.id ? 3 : 0); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function boneAt([x, y]) {
    const v = view();
    if (!layout || !isRig(v.def) || v.mode === 'frames') return null;
    const sk = skeleton(v.def, ctxOf(v));
    if (!sk) return null;
    let best = null, bd = 8;
    for (const id of sk.J.order) {
      const B = sk.J.bones[id];
      const ax = layout.ox + B.start[0] * layout.z, ay = layout.oy + B.start[1] * layout.z, bx = layout.ox + B.end[0] * layout.z, by = layout.oy + B.end[1] * layout.z;
      const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2));
      const d = Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !layout) return;
    const v = view();
    if (!editing(v)) return;
    const p = local(e);
    const s = hit(p, e.pointerType === 'touch');
    if (!s) { const b = boneAt(p); onSelect?.({ handle: null, bone: b ?? undefined }); return; }
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const bone = s.id.startsWith('bone:') ? s.id.slice(5) : undefined;
    onSelect?.({ handle: s.id, bone });
    drag = { id: s.id, base: v.def, ctx: ctxOf(v), live: v.def, grab: [p[0] - s.x, p[1] - s.y] };
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!drag) {
      const s = layout && editing(view()) ? hit(p, e.pointerType === 'touch') : null;
      const id = s?.id ?? null;
      canvas.style.cursor = id ? 'grab' : '';
      if (id !== hover) { hover = id; draw(); }
      return;
    }
    const pt = toFrame([p[0] - drag.grab[0], p[1] - drag.grab[1]]);
    drag.live = dragHandle(drag.base, drag.ctx, drag.id, pt);
    onLive?.(drag.live);
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    canvas.classList.remove('is-dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (d.live !== d.base) onCommit?.(d.live);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; draw(); } });

  return { node, canvas, draw, positions, dragging: () => !!drag, zoom: () => zoomFor(view(), ...boxOf()), fit: () => fitFor(view(), ...boxOf()) };
}
