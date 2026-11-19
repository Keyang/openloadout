// One bag item in the editing panel (app/panel.js), for the pages that show the panel beside something else: the bag's
// list and the playground's scene (docs/site-design.md, section 5). The item is edited where it is: every change goes
// through an edit session (app/editing.js) that names the item by its key, so it is saved to that item as it is made.
//
//   const ed = itemEditor(item, asset, { onAct });      ed.node (the panel), ed.edit (the session), ed.play() (a sound), ed.close()
import { defaultParams } from '../engine/sprite.js';
import { soundParams, rendered, renderAsync, playRendered, playLive } from './audio.js';
import { defaultCues } from './bundle.js';
import { createEdit, countChanges } from './editing.js';
import { cleanSettings, lookOf } from './bag.js';
import { THEME_PRESETS } from '../engine/theme.js';
import { el } from './ui.js';
import { editPanel } from './panel.js';

/** An asset's own settings, complete, as an edit session wants them (the same as its own page starts from). */
export function standardOf(kind, asset) {
  if (kind === 'sprite') return { params: defaultParams(asset), cues: defaultCues(asset), scale: 1 };
  return kind === 'sound' ? { params: soundParams(asset), style: null, seed: 1 } : { params: soundParams(asset), style: null };
}

/**
 * item: a bag item { key, kind, id }. asset: its sprite program, or its sound or track patch.
 * onAct(what): after the visitor does something in the panel (see app/panel.js). versions: how many version tiles.
 * tabs: extra tabs for the panel. A sound plays after each change, so the change is heard; a track is played with play().
 */
export function itemEditor(item, asset, { onAct = () => {}, versions = 12, tabs = [] } = {}) {
  const { kind } = item;
  let timer = 0, heard = 0, voice = null, closed = false;
  const edit = createEdit({
    kind, id: item.id, key: item.key, defaults: standardOf(kind, asset),
    schedule: (fn) => { clearTimeout(timer); timer = setTimeout(fn, 150); },      // a slider being dragged is a few saves, not hundreds
  });

  const stop = () => { if (voice) voice.stop(); voice = null; };
  /** Play it as it is set now (a sound once, a track until stopped). Returns a promise of true while it sounds. */
  async function play() {
    if (voice) { stop(); return false; }
    const s = edit.settings();
    const params = soundParams(asset, s.style, s.params);
    try {
      if (kind === 'sound') { const h = playRendered(rendered(asset, params, s.seed ?? 1), { force: true, loop: !!asset.loop, onended: () => { if (voice === h) voice = null; } }); voice = h; }
      else {
        let v;
        try { v = await playLive(asset, { ...params }); } catch { const h = playRendered(await renderAsync(asset, { ...params }), { force: true, loop: true }); v = h && { stop: () => h.stop() }; }
        if (closed) { if (v) v.stop(); return false; }
        voice = v;
      }
    } catch (e) { console.warn(`${kind} ${item.id}:`, e); }
    return !!voice;
  }
  // a short sound is heard again a moment after it was changed (not a loop, not a track: those are played on purpose)
  const hearSoon = () => {
    if (kind !== 'sound' || asset.loop) return;
    clearTimeout(heard);
    heard = setTimeout(() => { if (closed) return; stop(); play(); }, 220);
  };

  // ---- the item's own look: one of the named looks, worn whatever the bag's look is; or none, and it follows the bag
  const lookChips = el('span', { class: 'chips', role: 'group', 'aria-label': 'Its own look' },
    el('button', { type: 'button', class: 'chip', 'data-look': '', onclick: () => edit.set({ look: null }) }, 'Follows the bag'),
    THEME_PRESETS.map((p) => el('button', { type: 'button', class: 'chip', 'data-look': p.id, title: p.blurb, onclick: () => edit.set({ look: p.id }) }, p.name)));
  const syncLook = () => { const now = lookOf(edit.settings()) ?? ''; for (const b of lookChips.children) b.setAttribute('aria-pressed', String(b.dataset.look === now)); };
  syncLook();
  const lookTab = { id: 'look', label: 'Look', changed: () => !!lookOf(edit.settings()),
    node: el('div', { class: 'item-look' }, el('p', { class: 'pane-note' }, 'A look for this one thing. It keeps it whatever look the rest of your bag takes.'), lookChips) };

  const panel = editPanel({
    kind, asset, edit, versions, tabs: [lookTab, ...tabs],
    sizeNote: kind === 'sprite' ? (scale) => `${asset.size[0] * scale} × ${asset.size[1] * scale}` : null,
    onAct: (what) => { if (what === 'control' || what === 'version' || what === 'surprise' || what === 'startover') hearSoon(); onAct(what); },
  });
  const offLook = edit.onChange(syncLook);
  const flush = () => edit.flush();
  window.addEventListener('pagehide', flush);      // closing the tab mid-drag still saves the last change

  return {
    node: panel.node, panel, edit, key: item.key, kind, id: item.id,
    play, stop, playing: () => !!voice,
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(heard); stop();
      window.removeEventListener('pagehide', flush);
      offLook(); panel.close(); edit.close(); clearTimeout(timer);      // leaving saves whatever was still waiting
    },
  };
}

/** How many things a bag item changes from its asset's own settings (what the panel's footer counts, for a list's row). */
export function changesOf(item, asset) {
  const std = standardOf(item.kind, asset), s = item.settings ?? {};
  const whole = (x) => { const c = cleanSettings(item.kind, { ...std, ...x, params: { ...std.params, ...(x.params ?? {}) } }); if (item.kind === 'sprite' && !c.cues) c.cues = cleanSettings('sprite', std).cues; delete c.lookParams; return c; };
  return countChanges(item.kind, whole(s), whole(std));
}
