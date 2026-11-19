// The four tabs of the studio's panel (docs/studio.md section 5; item S9): Body (bones, shapes, attach points), Move
// (key poses on the timeline's frames), Frames (frame count, speed, looping, one frame's adjustments, the anchor, the
// frame size) and Look & name (name, sentence, what it is, colours, sliders, parts, words). Each builds its pane from the
// editor's state; every change goes through E.commit(def), which validates it before it is kept. Every handle on the
// picture is also a row here with arrow buttons, so nothing needs a mouse (and a phone can do it all).
import { el } from '../ui.js';
import { CLOTH, SKIN, METAL, HAIR } from '../../engine/sprite.js';
import { EASES } from '../../rigs/keypose.js';
import * as X from './edit.js';
import { row, head, btn, icon, stepper, toggle, select, text, menuButton, fieldId } from './bits.js';
import { libraryBodyPane, mirrorButton, moveExtras, soundsSection, frameAdvice, fillNote, thinMark, adviceSection } from './more-panes.js';
import { libraryChanged } from './library-body.js';

const EASE_WORDS = { smooth: 'Smooth', linear: 'Steady', in: 'Speeds up', out: 'Slows down', hold: 'Holds still' };
const ARROWS = [['←', 'left', -1, 0], ['↑', 'up', 0, -1], ['↓', 'down', 0, 1], ['→', 'right', 1, 0]];

/** The handles of the frame as rows with arrow buttons (1 px a press, Shift 4 from the keyboard). keyed: handle ids the frame's key changes. */
function handleRows(E, list, keyed = new Set()) {
  if (!list.length) return null;
  const pos = E.positions();
  return el('div', { class: 'handle-list' }, list.map((h) => {
    const on = E.S.sel.handle === h.id;
    const at = pos.get(h.id);
    const turn = h.kind === 'bone' ? [
      icon('↺', `Turn ${h.label} back`, () => E.turn(h.id.slice(5), -5)),
      icon('↻', `Turn ${h.label} on`, () => E.turn(h.id.slice(5), 5)),
    ] : [];
    return el('div', { class: 'handle-row' + (on ? ' on' : ''), 'data-handle': h.id, 'data-at': at ? at.join(',') : '' },
      el('button', { type: 'button', class: 'handle-name', 'aria-pressed': String(on), 'data-k': `h-${h.id}`, title: 'Pick it, then use the arrow keys', onclick: () => E.select({ handle: h.id, bone: h.id.startsWith('bone:') ? h.id.slice(5) : E.S.sel.bone }), onfocus: () => { if (E.S.sel.handle !== h.id) E.select({ handle: h.id, bone: h.id.startsWith('bone:') ? h.id.slice(5) : E.S.sel.bone }, { keepFocus: true }); } },
        el('span', { class: 'dot' + (keyed.has(h.id) ? '' : ' off'), 'aria-hidden': 'true' }), el('span', { class: 'handle-label' }, h.label), keyed.has(h.id) ? el('span', { class: 'sr' }, ' (in this key)') : null),
      el('span', { class: 'handle-arrows' }, ARROWS.map(([g, word, dx, dy]) => icon(g, `Move ${h.label} ${word}`, () => E.nudge(h.id, dx, dy))), turn));
  }));
}

/** The clip picker every tab with frames shares. */
function clipPicker(E, extra = []) {
  const id = fieldId('clip');
  const names = Object.keys(E.S.def.clips);
  return row('Animation', [select({ id, label: 'Animation', value: E.S.clip, k: 'clip', options: names.map((n) => ({ value: n, label: E.S.def.clips[n].label || X.humanize(n) })), onchange: (v) => E.setClip(v) }), ...extra], { forId: id });
}

// ---- Body ---------------------------------------------------------------------------------------------------------

/** The Body tab: the bones as a tree, the picked bone (name, length, turn, how far it bends), the shapes on it, its handles as rows, the attach points. Arguments: E (the editor). */
export function bodyPane(E) {
  const { def, sel } = E.S;
  const made = String(def.made?.from ?? '');
  const startedFrom = X.startingBodies().find((s) => made === `template:${s.id}` || (s.id === 'hero' && made.startsWith('library:')));
  const out = [el('p', { class: 'pane-note' }, startedFrom ? `Started from ${startedFrom.label}. ` : '', el('a', { class: 'link', href: '#/studio' }, 'Start another'))];
  if (!X.isRig(def)) {
    out.push(...libraryBodyPane(E));      // item S10: proportions, how it moves, attach points
    return out;
  }
  out.push(el('p', { class: 'st-phone' }, 'Easier on a bigger screen. Here, pick a bone and use the arrows.'));
  if (X.isTopDown(def)) {
    out.push(row('Facing', el('span', { class: 'seg', role: 'group', 'aria-label': 'Facing' }, ['side', 'down', 'up'].map((f) => el('button', { type: 'button', 'aria-pressed': String((E.S.facing ?? 'side') === f), 'data-k': `facing-${f}`, onclick: () => E.setFacing(f) }, X.humanize(f))))));
  }
  const tree = X.boneTree(def);
  out.push(head('Bones', btn('Add a bone', () => E.addBone(), { 'data-k': 'add-bone', title: sel.bone ? `On the end of ${X.boneLabel(def, sel.bone)}` : 'On the end of the body' })));
  out.push(el('ul', { class: 'bone-tree', 'aria-label': 'Bones' }, tree.map((b) => el('li', { style: `--depth:${b.depth}` },
    el('button', { type: 'button', class: 'bone-btn', 'data-bone': b.id, 'data-k': `bone-${b.id}`, 'aria-pressed': String(sel.bone === b.id), onclick: () => E.select({ bone: b.id, handle: `bone:${b.id}` }) }, b.label)))));
  const bone = def.body.rig.bones.find((b) => b.id === sel.bone);
  if (bone) {
    const rest = Number(X.rigFor(def, X.isTopDown(def) ? (E.S.facing ?? 'side') : null).bones.find((b) => b.id === bone.id)?.angle ?? bone.angle);
    const nameId = fieldId('bone-name');
    out.push(head(`Selected: ${bone.label || X.humanize(bone.id)}`, btn('Remove', () => E.removeBone(bone.id), { 'data-k': 'remove-bone', 'aria-label': `Remove the bone ${bone.label || bone.id}` })));
    out.push(row('Name', text({ id: nameId, value: bone.label ?? '', max: 60, onchange: (v) => E.commit(X.setBone(def, bone.id, { label: v })) }), { forId: nameId }));
    const len = Number(X.rigFor(def, X.isTopDown(def) ? (E.S.facing ?? 'side') : null).bones.find((b) => b.id === bone.id)?.length ?? bone.length);
    out.push(row('Length', stepper({ id: fieldId('len'), k: 'bone-len', label: 'Length', value: len, min: 1, max: Math.max(...def.size), step: 0.5, unit: 'px', onchange: (n) => E.commit(X.setBone(def, bone.id, { length: n }, E.S.facing)) })));
    out.push(row('Turn', stepper({ id: fieldId('turn'), k: 'bone-turn', label: 'Turn', value: Math.round(rest), min: -720, max: 720, step: 5, unit: '°', onchange: (n) => E.commit(X.setBone(def, bone.id, { angle: n }, E.S.facing)) })));
    if (bone.parent != null) {
      out.push(row('Bends from', [
        stepper({ id: fieldId('min'), k: 'bone-min', label: 'Bends back', value: bone.min ?? -180, min: -180, max: 0, step: 5, onchange: (n) => E.commit(X.setBone(def, bone.id, { min: n })) }),
        el('span', { class: 'st-unit' }, 'to'),
        stepper({ id: fieldId('max'), k: 'bone-max', label: 'Bends on', value: bone.max ?? 180, min: 0, max: 180, step: 5, unit: '°', onchange: (n) => E.commit(X.setBone(def, bone.id, { max: n })) }),
      ]));
    }
    const shapes = def.body.rig.shapes.filter((s) => s.bone === bone.id);
    out.push(head('Shapes on it', menuButton('Add a shape', X.SHAPE_CHOICES.map((c) => ({ label: c.label, onclick: () => E.addShape(c.id) })), { k: 'add-shape', right: true })));
    if (!shapes.length) out.push(el('p', { class: 'pane-note' }, 'Nothing is drawn on this bone yet.'));
    const slots = def.body.rig.colours.map((c) => ({ value: c.id, label: c.label || X.humanize(c.id) }));
    for (const s of shapes) {
      out.push(el('div', { class: 'shape-row', 'data-shape': s.id },
        el('span', { class: 'shape-name' }, X.shapeLabel(s, def).split(',')[0], thinMark(def, s.id)),
        select({ id: fieldId('paint'), k: `paint-${s.id}`, label: `Colour of ${X.shapeLabel(s, def)}`, value: s.paint, options: slots, onchange: (v) => E.commit(X.setShape(def, s.id, { paint: v })) }),
        el('span', { class: 'shape-acts' },
          icon('−', 'Smaller', () => E.commit(X.resizeShape(def, s.id, -1)), { 'data-k': `smaller-${s.id}` }),
          icon('+', 'Bigger', () => E.commit(X.resizeShape(def, s.id, 1)), { 'data-k': `bigger-${s.id}` }),
          icon('▼', 'Further back', () => E.commit(X.setShape(def, s.id, { z: (s.z ?? 0) - 1 })), { 'data-k': `back-${s.id}` }),
          icon('▲', 'Further forward', () => E.commit(X.setShape(def, s.id, { z: (s.z ?? 0) + 1 })), { 'data-k': `front-${s.id}` }),
          el('label', { class: 'st-check', title: 'Painted a step darker, as the far legs are' }, el('input', { type: 'checkbox', 'data-k': `far-${s.id}`, checked: !!s.far, onchange: (e) => E.commit(X.setShape(def, s.id, { far: e.target.checked })) }), 'Darker'),
          icon('×', `Remove ${X.shapeLabel(s, def)}`, () => E.commit(X.removeShape(def, s.id), 'Shape removed.'), { 'data-k': `rm-${s.id}` }))));
    }
  }
  out.push(head('Move with arrows'));
  out.push(handleRows(E, X.handles(def, E.ctx())));
  const points = def.body.rig.points;
  const free = X.freePoints(def);
  out.push(head('Attach points', menuButton('Add a point', () => free.map((n) => ({ label: X.humanize(n), note: n === 'feet' ? 'on the ground' : `on ${X.boneLabel(def, sel.bone ?? def.body.rig.bones[0].id)}`, onclick: () => E.commit(X.addPoint(def, n, sel.bone ?? def.body.rig.bones[0].id).def, `${X.humanize(n)} point added.`) })), { k: 'add-point', right: true })));
  out.push(el('p', { class: 'pane-note' }, 'Where a game hangs things on it: a held sword on the hand, a hat on the head.'));
  out.push(el('div', { class: 'chips' }, points.map((p) => el('span', { class: 'chip st-point' }, X.humanize(p.id), p.bone ? el('span', { class: 'quiet' }, ` on ${X.boneLabel(def, p.bone)}`) : null,
    el('button', { type: 'button', class: 'st-x', 'aria-label': `Remove the ${p.id} point`, onclick: () => E.commit(X.removePoint(def, p.id)) }, '×')))));
  return out;
}

// ---- Move ---------------------------------------------------------------------------------------------------------

/** The Move tab: which animation, a new one, the key on this frame (add, delete, copy, paste, how it eases), and what can be moved as rows with arrows. Arguments: E (the editor). */
export function movePane(E) {
  const { def, clip, frame } = E.S;
  const out = [];
  const removeClip = icon('×', 'Remove this animation', () => E.removeClip(clip), { 'data-act': 'remove-clip', 'data-k': 'remove-clip', disabled: Object.keys(def.clips).length <= 1 });
  out.push(clipPicker(E, [btn('New animation', () => E.toggleNewClip(), { 'data-k': 'new-clip', 'aria-expanded': String(!!E.S.newClipOpen) }), removeClip]));
  if (E.S.newClipOpen) {
    const callId = fieldId('call');
    const call = el('input', { id: callId, type: 'text', class: 'st-text', maxlength: 20, placeholder: 'Bite, wave, roar', 'data-k': 'call-it' });
    const make = () => {
      const c = X.clipFromWords(def, call.value);
      if (!c) { E.say(X.whyNotClip(def, call.value) ?? 'Use one word for a new animation, one this sprite does not have yet.'); return; }
      E.addClip(c.name, c.label);
    };
    call.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); make(); } });
    out.push(el('div', { class: 'new-clip' },
      el('p', { class: 'pane-note' }, 'It starts as a copy of Idle. Pick one, or call it what it is:'),
      el('div', { class: 'chips' }, X.newClipChoices(def).map((c) => el('button', { type: 'button', class: 'chip', onclick: () => E.addClip(c.name, c.label) }, c.label))),
      el('div', { class: 'st-inline' }, el('label', { for: callId, class: 'st-lbl' }, 'Call it'), call, btn('Make it', make, { class: 'btn btn-sm btn-secondary' }))));
  }
  const i = X.keyIndexAt(def, clip, frame);
  const key = i >= 0 ? def.clips[clip].keys[i] : null;
  out.push(el('p', { class: 'key-state' }, key ? el('strong', {}, `Key on frame ${frame + 1}`) : `No key on frame ${frame + 1}. Moving something here adds one.`,
    key && X.keyChanges(def, clip, frame).length ? el('span', { class: 'quiet' }, ` · changes ${X.keyChanges(def, clip, frame).join(', ')}`) : null));
  const acts = [
    key ? btn('Delete key', () => E.deleteKey(), { 'data-k': 'del-key' }) : btn('Add a key here', () => E.addKey(), { 'data-k': 'add-key', title: 'K' }),
    btn('Copy key', () => E.copyKey(), { disabled: !key, 'data-k': 'copy-key' }),
    btn('Paste key', () => E.pasteKey(), { disabled: !E.S.clipboard, 'data-k': 'paste-key' }),
    ...mirrorButton(E),
  ];
  if (key) {
    const easeId = fieldId('ease');
    out.push(row('Leaves this key', select({ id: easeId, k: 'ease', label: 'How the motion leaves this key', value: key.ease ?? 'smooth', options: EASES.map((e) => ({ value: e, label: EASE_WORDS[e] })), onchange: (v) => E.commit(X.setKeyEase(def, clip, frame, v)) }), { forId: easeId }));
  }
  out.push(el('div', { class: 'st-actions' }, acts));
  out.push(...moveExtras(E));      // item S10: keys between frames, start this clip over
  if (X.isRig(def)) {
    const keyed = new Set();
    if (key) {
      if (key.root) keyed.add('root');
      for (const id of Object.keys(key.ik ?? {})) keyed.add(`ik:${id}`);
      for (const id of Object.keys(key.bones ?? {})) keyed.add(`bone:${id}`);
    }
    out.push(head('What you can move'), el('p', { class: 'pane-note' }, 'Drag on the picture, or pick one here and use the arrows. A dot marks what this frame\'s key changes.'));
    out.push(handleRows(E, X.handles(def, E.ctx()), keyed));
  } else {
    out.push(head('What you can move'), el('p', { class: 'pane-note' }, 'Drag on the picture, or pick one here and use the arrows. Move a hand and the arm follows. A dot marks what this frame\'s key changes.'));
    out.push(handleRows(E, X.handles(def, E.ctx()), new Set(libraryChanged(def, clip, frame))));
    out.push(head('The numbers'), el('p', { class: 'pane-note' }, 'The same pose as numbers, each a little at a time.'));
    out.push(el('div', { class: 'handle-list' }, X.libraryRows(def, clip, frame).map((r) => {
      const two = r.kind === 'point' || r.kind === 'arm';
      const value = r.kind === 'point' ? `${Math.round(r.value.x)}, ${Math.round(r.value.y)}` : r.kind === 'arm' ? `${Math.round(r.value.a)}°, ${Math.round(r.value.e)}°` : r.kind === 'angle' ? `${Math.round(r.value)}°` : `${Math.round(r.value)} px`;
      const arrows = r.kind === 'arm'
        ? [icon('↺', `Swing ${r.label} back`, () => E.nudgeLib(r.id, -1, 0)), icon('↻', `Swing ${r.label} forward`, () => E.nudgeLib(r.id, 1, 0)), icon('⤵', `Bend ${r.label} less`, () => E.nudgeLib(r.id, 0, -1)), icon('⤴', `Bend ${r.label} more`, () => E.nudgeLib(r.id, 0, 1))]
        : two ? ARROWS.map(([g, word, dx, dy]) => icon(g, `Move ${r.label} ${word}`, () => E.nudgeLib(r.id, dx, dy)))
          : [icon('←', `Less ${r.label.toLowerCase()}`, () => E.nudgeLib(r.id, -1, 0)), icon('→', `More ${r.label.toLowerCase()}`, () => E.nudgeLib(r.id, 1, 0))];
      return el('div', { class: 'handle-row lib-row', 'data-field': r.id },
        el('span', { class: 'handle-name' }, el('span', { class: 'dot' + (r.keyed ? '' : ' off'), 'aria-hidden': 'true' }), el('span', { class: 'handle-label' }, r.label), el('span', { class: 'quiet num' }, ` ${value}`)),
        el('span', { class: 'handle-arrows' }, arrows));
    })));
  }
  return out;
}

// ---- Frames -------------------------------------------------------------------------------------------------------

/** The Frames tab: frame count, speed, looping; this frame's nudge, flash and shapes shown or hidden; the anchor, standing, the frame size. Arguments: E (the editor). */
export function framesPane(E) {
  const { def, clip, frame } = E.S;
  const c = def.clips[clip];
  const out = [clipPicker(E)];
  const fid = fieldId('frames'), sid = fieldId('fps'), lid = fieldId('loop');
  out.push(row('Frames', stepper({ id: fid, k: 'frames', label: 'Frames', value: c.frames, min: 1, max: 64, onchange: (n) => E.setFrames(n) }), { forId: fid }));
  out.push(row('Speed', stepper({ id: sid, k: 'fps', label: 'Speed', value: c.fps, min: 1, max: 30, unit: 'frames a second', onchange: (n) => E.commit(X.setFps(def, clip, n)) }), { forId: sid }));
  out.push(row('Loop', [toggle({ id: lid, label: 'Loop', checked: c.loop !== false, onchange: (v) => E.setLoop(v) }), el('span', { class: 'st-unit' }, c.loop !== false ? 'Plays round and round' : 'Plays once')], { forId: lid }));
  const e = c.frameEdits?.[String(frame)] ?? {};
  const nudge = e.nudge ?? [0, 0];
  out.push(head(`This frame (${frame + 1} of ${c.frames})`));
  const say = nudge[0] || nudge[1] ? [nudge[0] ? `${Math.abs(nudge[0])} px ${nudge[0] > 0 ? 'right' : 'left'}` : '', nudge[1] ? `${Math.abs(nudge[1])} px ${nudge[1] > 0 ? 'down' : 'up'}` : ''].filter(Boolean).join(', ') : 'Where the keys put it';
  out.push(row('Move the picture', [el('span', { class: 'handle-arrows' }, ARROWS.map(([g, word, dx, dy]) => icon(g, `Move this frame ${word}`, () => E.commit(X.setFrameEdit(def, clip, frame, { nudge: [nudge[0] + dx, nudge[1] + dy] }))))), el('span', { class: 'st-unit' }, say)],
    { changed: !!(nudge[0] || nudge[1]), reset: () => E.commit(X.setFrameEdit(def, clip, frame, { nudge: null })) }));
  const flashId = fieldId('flash');
  out.push(row('White flash', toggle({ id: flashId, label: 'White flash', checked: !!e.flash, onchange: (v) => E.commit(X.setFrameEdit(def, clip, frame, { flash: v })) }), { forId: flashId, note: 'A hit: the first frame of Hurt and Die flashes white.' }));
  for (const s of X.switchableShapes(def)) {
    const now = (e.show ?? []).includes(s.id) ? 'show' : (e.hide ?? []).includes(s.id) ? 'hide' : null;
    out.push(row(s.label, el('span', { class: 'seg', role: 'group', 'aria-label': s.label }, [[null, 'As the keys say'], ['show', 'Show'], ['hide', 'Hide']].map(([v, w]) => el('button', { type: 'button', 'aria-pressed': String(now === v), onclick: () => E.commit(X.setFrameShape(def, clip, frame, s.id, v)) }, w))), { changed: now !== null }));
  }
  out.push(...frameAdvice(E), ...soundsSection(E));      // items S12 and S10: this frame's pixel warnings, its sounds
  out.push(head('Anchor', btn('Snap to the feet', () => E.commit(X.setPivot(def, X.feetPivot(def)), 'The anchor is under the feet.'), { 'data-k': 'snap-feet', disabled: !X.isRig(def) })));
  out.push(el('p', { class: 'pane-note' }, X.isRig(def) ? 'The point a game places: under the feet for anything that stands. Drag the cross on the picture or use the boxes.' : 'A library body always stands on the same point.'));
  const ax = fieldId('ax'), ay = fieldId('ay'), gid = fieldId('ground'), zid = fieldId('size');
  if (X.isRig(def)) {
    out.push(row('Anchor across', stepper({ id: ax, k: 'anchor-x', label: 'Anchor across', value: def.pivot[0], min: 0, max: def.size[0] - 1, unit: 'px from the left', onchange: (n) => E.commit(X.setPivot(def, [n, def.pivot[1]])) }), { forId: ax }));
    out.push(row('Anchor down', stepper({ id: ay, k: 'anchor-y', label: 'Anchor down', value: def.pivot[1], min: 0, max: def.size[1] - 1, unit: 'px from the top', onchange: (n) => E.commit(X.setPivot(def, [def.pivot[0], n])) }), { forId: ay }));
    out.push(row('Stands', [toggle({ id: gid, label: 'Stands on the ground', checked: def.grounded !== false, onchange: (v) => E.commit(X.setGrounded(def, v)) }), el('span', { class: 'st-unit' }, def.grounded !== false ? 'On the ground' : 'In the air, as a flyer')], { forId: gid }));
    out.push(row('Frame size', select({ id: zid, k: 'frame-size', label: 'Frame size', value: def.size.join('x'), options: X.frameSizes(def).map(([w, h]) => ({ value: `${w}x${h}`, label: `${w} × ${h}` })), onchange: (v) => E.commit(X.setFrameSize(def, v.split('x').map(Number)), 'Frame size changed: the body moved with it.') }), { forId: zid, note: 'The sizes the library uses.' }));
    out.push(fillNote(E));      // item S12: the fill band
    out.push(handleRows(E, X.handles(def, E.ctx())));
  }
  return out;
}

// ---- Look & name ----------------------------------------------------------------------------------------------------

/** The Look & name tab: name, one sentence, what it is, which way it is seen, colours, sliders, parts, words, the file name. Arguments: E (the editor). */
export function lookPane(E) {
  const { def } = E.S;
  const out = [];
  const nid = fieldId('name'), bid = fieldId('blurb'), wid = fieldId('what'), vid = fieldId('view'), kid = fieldId('words');
  out.push(row('Name', text({ id: nid, value: def.name, max: 60, onchange: (v) => E.rename(v) }), { forId: nid }));
  out.push(row('One sentence', text({ id: bid, value: def.blurb ?? '', max: 300, multi: true, placeholder: 'What it is and what it does', onchange: (v) => E.commit(X.setBlurb(def, v)) }), { forId: bid }));
  out.push(row('What is it?', select({ id: wid, k: 'what', label: 'What is it?', value: X.whatOf(def) ?? '', options: [...(X.whatOf(def) ? [] : [{ value: '', label: 'Choose…' }]), ...X.WHAT_IS_IT.map((w) => ({ value: w.id, label: w.label }))], onchange: (v) => E.commit(X.setWhat(def, v)) }), { forId: wid }));
  if (X.isTopDown(def)) out.push(row('Seen from', el('span', { class: 'st-unit' }, 'Above, facing down, up and to the side')));
  else if (X.isRig(def)) out.push(row('Seen from', select({ id: vid, k: 'view', label: 'Seen from', value: def.meta?.view ?? 'side', options: [{ value: 'side', label: 'The side' }, { value: 'front', label: 'The front' }, { value: 'none', label: 'No way in particular' }], onchange: (v) => E.commit(X.setView(def, v)) }), { forId: vid }));
  out.push(head('Colours'));
  for (const s of X.colourSlots(def)) {
    const list = [...new Set([s.value, ...(/skin/i.test(s.id) ? SKIN : /hair/i.test(s.id) ? HAIR : /metal/i.test(s.id) ? METAL : CLOTH)])].slice(0, 10);
    const any = el('input', { type: 'color', value: s.value, 'aria-label': `Any colour for ${s.label}`, onchange: (e) => E.commit(X.setColour(def, s.id, e.target.value)) });
    out.push(row(s.label, el('span', { class: 'swatches', role: 'group', 'aria-label': s.label },
      list.map((c) => el('button', { type: 'button', class: 'swatch', style: `--c:${c}`, 'aria-label': `${s.label}: ${c}`, 'aria-pressed': String(c === s.value), onclick: () => E.commit(X.setColour(def, s.id, c)) })),
      el('span', { class: 'swatch any', title: 'Any colour' }, any))));
  }
  if (X.isRig(def)) {
    const bone = E.S.sel.bone;
    out.push(head('Sliders people get', btn('Add a slider', () => E.addSlider(), { 'data-k': 'add-slider', disabled: !bone, title: bone ? `Makes ${X.boneLabel(def, bone)} longer or shorter` : 'Pick a bone under Body first' })));
    out.push(el('p', { class: 'pane-note' }, bone ? `A new slider makes ${X.boneLabel(def, bone)} longer or shorter.` : 'Pick a bone under Body, then add a slider that makes it longer or shorter.'));
    for (const c of def.controls) {
      out.push(el('div', { class: 'list-row' }, el('span', {}, c.standard === 'speed' ? 'Speed' : c.label), el('span', { class: 'quiet' }, c.standard === 'speed' ? 'Slow to fast' : `${c.lo ?? 'Less'} to ${c.hi ?? 'More'}`),
        icon('×', `Remove the ${c.label ?? 'Speed'} slider`, () => E.commit(X.removeControl(def, c.key)))));
    }
    out.push(head('Parts that can be switched off', btn('Make a part', () => E.addPart(), { 'data-k': 'add-part', disabled: !bone, title: bone ? `The shapes on ${X.boneLabel(def, bone)}` : 'Pick a bone under Body first' })));
    const parts = Object.entries(def.parts ?? {});
    if (!parts.length) out.push(el('p', { class: 'pane-note' }, bone ? `A part made now holds the shapes on ${X.boneLabel(def, bone)}.` : 'Pick a bone under Body, then make a part of the shapes on it.'));
    for (const [k, p] of parts) {
      const pid = fieldId('part');
      out.push(el('div', { class: 'list-row' }, el('label', { for: pid }, p.label), el('span', { class: 'quiet' }, `${p.shapes.length} shape${p.shapes.length === 1 ? '' : 's'}, on at first`),
        toggle({ id: pid, label: `${p.label} is on at first`, checked: p.default !== false, onchange: (v) => E.commit(X.setPartDefault(def, k, v)) }),
        icon('×', `Remove the part ${p.label}`, () => E.commit(X.removePart(def, k)))));
    }
  }
  out.push(row('Words to find it', text({ id: kid, value: (def.meta?.words ?? []).join(', '), max: 400, placeholder: 'newt, lizard, swamp', onchange: (v) => E.commit(X.setWords(def, v)) }), { forId: kid }));
  out.push(row('File name', el('code', { class: 'st-file' }, `${def.id}.js`), { note: 'What the download for the library is called. It follows the name.' }));
  out.push(...adviceSection(E));      // item S12: what the library would ask, as advice
  return out;
}
