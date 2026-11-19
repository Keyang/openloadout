// One sprite: preview, sliders, the sounds that play with each animation, download.
import { defaultParams, cleanParams, randomParams, clipFps, partList, partRemoved, inEffect, cueInEffect, renderPixels } from '../engine/sprite.js';
import { stylesOf, styleById } from '../engine/styles.js';
import { colorName } from '../engine/color.js';     // W6-A: a sprite may offer more than one style (Contract 12)
import { bag } from './bag.js';
import { drawStage, backdropFor, stagesFor } from './stage.js';
import { zip } from './zip.js';
import { el, header, Frames, travel, hover, shadow, saveBlob, store, cap } from './ui.js';
import { sounds, soundById, soundParams, rendered, playRendered, soundState, setSoundOn, toUnit, toValue } from './audio.js';
import { spriteFiles, defaultCues } from './bundle.js';
import { addToBag, keepBag } from './add-to-bag.js';
import { goesWith, moreLikeThis } from './related.js';
import { madeNote, assetById } from './catalog.js';      // W5-A: a sprite made on this visit says so, and a draft cannot go in the bag

/**
 * The sprite's own sounds, as defaultCues gives them, each keeping its `when` (the settings it plays at):
 * a blade sound that belongs to a held weapon must stay silent when the weapon is taken off.
 */
function spriteCues(sprite) {
  const out = defaultCues(sprite);
  for (const clip of Object.keys(out)) {
    const own = (sprite.sounds[clip] ?? []).filter((c) => soundById[c.sound]);
    out[clip].forEach((cue, i) => { if (own[i] && own[i].sound === cue.sound && own[i].when) cue.when = own[i].when; });
  }
  return out;
}
/** A `when` read from a link: kept only if it names real controls with lists of values. */
function linkWhen(sprite, when) {
  if (!when || typeof when !== 'object' || Array.isArray(when)) return null;
  const ok = Object.entries(when).every(([k, v]) => sprite.params[k] && Array.isArray(v));
  return ok && Object.keys(when).length ? when : null;
}

// Sounds travel in the link as a compact list: { clip: [[sound, frame, style, volume, changes, when], ...] }.
// Only animations whose sounds differ from the sprite's own are written.
const packClip = (list) => JSON.stringify(list.map((c) => { const row = [c.sound, c.frame, c.preset ?? 0, c.volume ?? 1, c.params ?? 0]; if (c.when) row.push(c.when); return row; }));
function packCues(sprite, cues) {
  const base = spriteCues(sprite), out = {};
  for (const clip of Object.keys(sprite.clips)) if (packClip(cues[clip] ?? []) !== packClip(base[clip] ?? [])) out[clip] = JSON.parse(packClip(cues[clip] ?? []));
  return Object.keys(out).length ? JSON.stringify(out) : '';
}
function unpackCues(sprite, text) {
  try {
    const raw = JSON.parse(text), out = spriteCues(sprite);
    for (const clip of Object.keys(sprite.clips)) {
      if (!Array.isArray(raw[clip])) continue;
      out[clip] = raw[clip].filter((c) => Array.isArray(c) && soundById[c[0]]).slice(0, MAX_CUES).map(([sound, frame, preset, volume, params, when]) => {
        const cue = {
          sound,
          frame: Math.max(0, Math.min(sprite.clips[clip].frames - 1, Math.round(Number(frame)) || 0)),
          preset: preset && soundById[sound].presets && soundById[sound].presets[preset] ? preset : null,
          volume: Math.max(0, Math.min(1, Number(volume) || 0)),
          params: params && typeof params === 'object' ? params : null,
        };
        if (linkWhen(sprite, when)) cue.when = when;
        return cue;
      });
    }
    return out;
  } catch { return null; }
}

const MAX_CUES = 8;   // sounds per animation; links keep at most this many

/** A colour's everyday name with a capital, for the page: '#f2a030' -> 'Orange'. */
const colourWord = (hex) => { const n = colorName(hex); return n ? n[0].toUpperCase() + n.slice(1) : 'Your own colour'; };
/** The names a row of swatches is read out by: two that share a name are told apart by their place ('Red, choice 2'). */
function swatchNames(list) {
  const words = list.map(colourWord);
  return words.map((w, i) => (words.filter((x) => x === w).length > 1 ? `${w}, choice ${i + 1}` : w));
}

/**
 * Frames of one sprite in one of its styles, drawn on demand and kept: what app/ui.js Frames is, for a sprite that
 * offers a choice of style. A style that does not draw on the pixel grid is shown by its pixel picture.
 */
class StyleFrames {
  constructor(sprite, p, style) { this.sprite = sprite; this.p = p; this.style = style; this.map = new Map(); }
  set(p) { this.p = p; this.map.clear(); }
  setStyle(style) { this.style = style; this.map.clear(); }
  get(clip, f) {
    const key = clip + ':' + f;
    let cv = this.map.get(key);
    if (!cv) {
      const g = renderPixels(this.sprite, clip, f, this.p, { style: this.style });
      cv = document.createElement('canvas');
      cv.width = g.w; cv.height = g.h;
      cv.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
      this.map.set(key, cv);
    }
    return cv;
  }
}

export function spritePage(app, sprite, query) {
  document.title = `${sprite.name} · Loadout`;
  // what the preview stands on suits what the sprite is (app/stage.js): a scene with ground, a plain panel for an
  // interface piece, or nothing at all for a background, which fills the frame itself
  const backdrop = backdropFor(sprite.meta ?? assetById(sprite.id));
  const stageChoices = stagesFor(backdrop);
  const stageKey = backdrop === 'panel' ? 'stage-panel' : 'stage';      // a chosen panel and a chosen scene are remembered apart
  const clipNames = Object.keys(sprite.clips);
  // The styles this sprite can be drawn in (Contract 12). With one, nothing on this page is different. With more, the
  // page opens in the style its link names; opened from the bag ("Change"), in the item's style; otherwise the first.
  const styles = stylesOf(sprite).filter((id) => styleById(id));
  if (!styles.length) styles.push('pixel');
  const choice = styles.length > 1;
  const held = choice && query.bag ? bag.get(query.bag) : null;
  // (the link's key is `artstyle`: `style` may be one of the sprite's own controls)
  const askedStyle = choice ? query.artstyle ?? (held && held.kind === 'sprite' && held.id === sprite.id ? held.settings.artStyle : undefined) : undefined;
  const st = {
    style: styles.includes(askedStyle) ? askedStyle : styles[0],
    p: cleanParams(sprite, query),
    clip: clipNames.includes(query.clip) ? query.clip : sprite.preview,
    cues: (query.sfx && unpackCues(sprite, query.sfx)) || spriteCues(sprite),
    playing: true,
    stage: stageChoices.some((s) => s.id === store.get(stageKey)) ? store.get(stageKey) : stageChoices[0]?.id ?? null,
    scale: [1, 2, 4].includes(Number(query.scale)) ? Number(query.scale) : 1, start: performance.now(), frame: 0, lastFrame: -1, scroll: 0,
  };
  const frames = choice ? new StyleFrames(sprite, st.p, st.style) : new Frames(sprite, st.p);
  // W5-B: a sprite made on a visit is drawn in a worker of its own, and its frames for new settings arrive a moment later:
  // what was drawn meanwhile (the last look) is dropped then, and the stage and the strip draw again
  const offFrames = typeof sprite.onFrames === 'function' ? sprite.onFrames((e) => { if (sprite.isFor(e, st.p, st.style)) { frames.set(st.p); buildStrip(); } }) : null;
  // and what one more click could ask for (each option, each switch, each other style) is brought ahead, so a click draws at once
  // (a click starts that at once; while a slider is being dragged it waits until the drag rests)
  let aheadTimer = 0, aheadAt = -1e9;
  const ahead = () => {
    if (typeof sprite.prepareAround !== 'function') return;
    const go = () => sprite.prepareAround(st.p, { style: st.style });
    const now = performance.now(), dragging = now - aheadAt < 60;
    aheadAt = now;
    clearTimeout(aheadTimer);
    if (dragging) aheadTimer = setTimeout(go, 120); else go();
  };
  ahead();

  // A link from before an option was renamed (cape=false) opens with the new option; put the new name in the address too.
  {
    const [path, qs = ''] = location.hash.split('?');
    const q = new URLSearchParams(qs), def = defaultParams(sprite);
    let renamed = false;
    for (const [k, d] of Object.entries(sprite.params)) {
      if (!d.was || !q.has(k) || !Object.hasOwn(d.was, q.get(k)) || d.options.some((o) => o.value === q.get(k))) continue;
      if (st.p[k] === def[k]) q.delete(k); else q.set(k, String(st.p[k]));
      renamed = true;
    }
    if (renamed) history.replaceState(null, '', `${path}${q.toString() ? '?' + q : ''}`);
  }

  // ---- sound playback
  let loops = [];
  const cueRender = (cue, vary) => {
    const patch = soundById[cue.sound];
    cue.n = ((cue.n ?? 0) + 1) % 3;
    return rendered(patch, soundParams(patch, cue.preset, cue.params), vary ? 1 + cue.n : 1);
  };
  const playCue = (cue, force) => playRendered(cueRender(cue, true), { volume: cue.volume, force });
  // a sound may belong to some settings only (a blade sound needs a weapon): it is silent at the others
  const applies = (cue) => cueInEffect(sprite, cue, st.p);
  const cueSig = () => (st.cues[st.clip] ?? []).map((c) => (applies(c) ? '1' : '0')).join('');
  let shownSig = '';
  function fire(frame, force) {
    for (const cue of st.cues[st.clip] ?? []) {
      const patch = soundById[cue.sound];
      if (patch && !patch.loop && cue.frame === frame && applies(cue)) playCue(cue, force);
    }
  }
  function syncLoops() {
    for (const h of loops) h.stop();
    loops = [];
    if (!st.playing || !soundState.on) return;
    for (const cue of st.cues[st.clip] ?? []) {
      const patch = soundById[cue.sound];
      if (!patch || !patch.loop || !applies(cue)) continue;
      const h = playRendered(cueRender(cue, false), { loop: true, volume: cue.volume });
      if (h) loops.push(h);
    }
  }
  window.addEventListener('sf-audio-ready', syncLoops);

  // ---- stage
  const stage = el('canvas', { class: 'stage', role: 'img', 'aria-label': `${sprite.name} animation preview` });
  const stageWrap = el('div', { class: 'stage-wrap' }, stage);
  const strip = el('div', { class: 'strip' });
  const clipBar = el('div', { class: 'pills', role: 'group', 'aria-label': 'Animation' });
  const playBtn = el('button', { class: 'ghost', type: 'button', onclick: () => {
    st.playing = !st.playing;
    if (st.playing) { st.start = performance.now() - (st.frame / clipFps(sprite, st.clip, st.p)) * 1000; st.lastFrame = st.frame; }
    syncPlay(); syncLoops();
  } });
  const syncPlay = () => { playBtn.textContent = st.playing ? 'Pause' : 'Play'; };
  syncPlay();

  const setClip = (name) => {
    st.clip = name; st.start = performance.now(); st.playing = true; st.lastFrame = -1; syncPlay();
    for (const b of clipBar.children) b.setAttribute('aria-pressed', String(b.dataset.clip === name));
    buildStrip(); buildCues(); syncLoops(); saveUrl();
  };
  for (const name of clipNames) clipBar.append(el('button', { type: 'button', class: 'pill', 'data-clip': name, 'aria-pressed': String(name === st.clip), onclick: () => setClip(name) }, sprite.clips[name].label));

  const sceneBar = stageChoices.length < 2 ? el('span', { class: 'scene-none' }) : el('div', { class: 'scene', role: 'group', 'aria-label': 'Backdrop' },
    stageChoices.map((s) => el('button', { type: 'button', class: 'scene-btn scene-' + s.id, title: s.label, 'aria-label': `${s.label} backdrop`, 'aria-pressed': String(s.id === st.stage), onclick: (e) => {
      st.stage = s.id; store.set(stageKey, s.id);
      for (const b of sceneBar.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    } })));

  function buildStrip() {
    const n = sprite.clips[st.clip].frames;
    const marked = new Set((st.cues[st.clip] ?? []).filter((c) => soundById[c.sound] && !soundById[c.sound].loop && applies(c)).map((c) => c.frame));
    strip.replaceChildren(...Array.from({ length: n }, (_, f) => {
      const c = el('canvas', { width: sprite.size[0], height: sprite.size[1] });
      c.getContext('2d').drawImage(frames.get(st.clip, f), 0, 0);
      return el('button', { type: 'button', class: 'cell' + (marked.has(f) ? ' has-sound' : ''), 'aria-label': `Frame ${f + 1}${marked.has(f) ? ', plays a sound' : ''}`, onclick: () => {
        st.playing = false; st.frame = f; st.lastFrame = f; syncPlay(); syncLoops(); fire(f, true);
      } }, c);
    }));
  }

  // ---- sounds for the current animation
  const cueBox = el('section', { class: 'cues' });
  const cuesChanged = (rebuild) => { if (rebuild) buildCues(); buildStrip(); syncLoops(); saveUrl(); };

  function cueRow(cue, list) {
    const patch = soundById[cue.sound];
    const n = sprite.clips[st.clip].frames;
    const soundSel = el('select', { 'aria-label': 'Sound', onchange: (e) => { cue.sound = e.target.value; cue.preset = null; cue.params = null; cuesChanged(true); playCue(cue, true); } },
      [...new Set(sounds.map((s) => s.category))].map((cat) => el('optgroup', { label: cap(cat) }, sounds.filter((s) => s.category === cat).map((s) => el('option', { value: s.id, selected: s.id === cue.sound }, s.name)))));
    const when = patch.loop
      ? el('span', { class: 'hint' }, 'plays for the whole animation')
      : el('label', { class: 'inline' }, 'on frame ', el('select', { onchange: (e) => { cue.frame = Number(e.target.value); cuesChanged(false); } },
        Array.from({ length: n }, (_, f) => el('option', { value: f, selected: f === cue.frame }, String(f + 1)))));
    const presets = Object.keys(patch.presets ?? {});
    const styleSel = el('select', { 'aria-label': 'Style', onchange: (e) => { cue.preset = e.target.value === '' || e.target.value === '*' ? null : e.target.value; if (e.target.value !== '*') cue.params = null; cuesChanged(true); playCue(cue, true); } },
      el('option', { value: '', selected: !cue.preset && !cue.params }, 'Standard'),
      presets.map((name) => el('option', { value: name, selected: cue.preset === name && !cue.params }, name)),
      cue.params ? el('option', { value: '*', selected: true }, 'Your own') : null);
    const head = el('div', { class: 'cue-head' },
      el('button', { type: 'button', class: 'mini', 'aria-label': `Play ${patch.name}`, onclick: () => playCue(cue, true) }, 'Play'),
      soundSel, when,
      el('label', { class: 'inline' }, 'style ', styleSel),
      el('button', { type: 'button', class: 'ghost', 'aria-expanded': String(!!cue.open), onclick: () => { cue.open = !cue.open; buildCues(); } }, cue.open ? 'Done' : 'Adjust'),
      el('button', { type: 'button', class: 'ghost', disabled: list.length >= MAX_CUES, title: list.length >= MAX_CUES ? `An animation can have up to ${MAX_CUES} sounds` : null, onclick: () => {
        // a copy with the same sound, style, changes and volume, on the next frame that has no sound yet
        const copy = { sound: cue.sound, frame: cue.frame, preset: cue.preset, params: cue.params ? { ...cue.params } : null, volume: cue.volume, open: false };
        if (cue.when) copy.when = cue.when;
        if (!patch.loop) {
          const taken = new Set(list.filter((c) => soundById[c.sound] && !soundById[c.sound].loop).map((c) => c.frame));
          for (let i = 1; i < n; i++) { const f = (cue.frame + i) % n; if (!taken.has(f)) { copy.frame = f; break; } }
        }
        list.splice(list.indexOf(cue) + 1, 0, copy);
        cuesChanged(true); playCue(copy, true);
      } }, 'Duplicate'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { list.splice(list.indexOf(cue), 1); cuesChanged(true); } }, 'Remove'));
    const on = applies(cue);
    if (!on) head.append(el('span', { class: 'cue-note' }, 'Does not play with the current look.'));
    if (!cue.open) return el('li', { class: on ? 'cue' : 'cue off' }, head);
    const vals = soundParams(patch, cue.preset, cue.params);
    const sliders = [
      el('div', { class: 'field' }, el('label', {}, 'Volume'), el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: cue.volume, 'aria-label': 'Volume', oninput: (e) => { cue.volume = Number(e.target.value); }, onchange: () => { cuesChanged(false); playCue(cue, true); } })),
      ...patch.params.map((d) => el('div', { class: 'field' }, el('label', {}, d.label),
        el('input', { type: 'range', min: 0, max: 1, step: 0.005, value: toUnit(d, vals[d.id]), 'aria-label': d.label,
          oninput: (e) => { cue.params = { ...soundParams(patch, cue.preset, cue.params), [d.id]: toValue(d, Number(e.target.value)) }; },
          onchange: () => { cuesChanged(false); playCue(cue, true); if (styleSel.value !== '*') buildCues(); } }))),
    ];
    return el('li', { class: on ? 'cue open' : 'cue open off' }, head, el('div', { class: 'cue-sliders' }, sliders));
  }

  function buildCues() {
    const list = st.cues[st.clip] ?? (st.cues[st.clip] = []);
    shownSig = cueSig();
    const soundSwitch = el('input', { id: 'sound-on', type: 'checkbox', onchange: (e) => { setSoundOn(e.target.checked); syncLoops(); } });
    soundSwitch.checked = soundState.on;
    cueBox.replaceChildren(
      el('div', { class: 'cues-top' },
        el('h2', {}, `Sounds for ${sprite.clips[st.clip].label}`),
        el('div', { class: 'field toggle' }, el('label', { for: 'sound-on' }, 'Sound'), el('span', { class: 'switch' }, soundSwitch, el('span', { class: 'knob', 'aria-hidden': 'true' })))),
      list.length ? el('ul', { class: 'cue-list' }, list.filter((c) => soundById[c.sound]).map((c) => cueRow(c, list)))
        : el('p', { class: 'hint' }, 'This animation is silent. Add a sound and choose the frame it starts on.'),
      el('button', { type: 'button', class: 'btn', disabled: list.length >= MAX_CUES, onclick: () => {
        const used = new Set(list.map((c) => c.sound));
        const pick = ['whoosh', 'punch', 'ui-click'].map((id) => soundById[id]).find((s) => s && !used.has(s.id)) ?? sounds.find((s) => !s.loop && !used.has(s.id)) ?? sounds[0];
        const cue = { sound: pick.id, frame: st.playing ? 0 : st.frame, preset: null, params: null, volume: 1, open: false };
        list.push(cue); cuesChanged(true); playCue(cue, true);
      } }, 'Add a sound'),
      list.length >= MAX_CUES ? el('span', { class: 'hint' }, ` An animation can have up to ${MAX_CUES} sounds. Remove one to add another.`) : '');
  }

  // ---- look and motion controls, and one block per part (what the sprite holds or wears)
  const panel = el('div', { class: 'panel' });
  const controls = {};
  const parts = partList(sprite);
  const fields = {};          // control key -> its element in the panel
  const sections = [];        // { box, keys, part }: the titled groups and part blocks
  // A control that does nothing right now is hidden: a part's settings while the part is taken off, and any control
  // whose `when` does not hold. A block with nothing left to show hides its title too.
  const syncShown = () => {
    for (const [key, node] of Object.entries(fields)) node.hidden = !inEffect(sprite, key, st.p);
    for (const { box, keys, part } of sections) {
      box.hidden = keys.every((k) => fields[k].hidden);
      if (part) box.classList.toggle('off', partRemoved(sprite, part.name, st.p));
    }
  };
  const changed = () => {
    syncShown(); frames.set(st.p); buildStrip(); saveUrl(); ahead();
    // sounds that depend on the settings: refresh the list and anything looping when what applies has changed
    if (cueSig() !== shownSig) { buildCues(); syncLoops(); }
  };
  const keep = (key, node) => { node.setAttribute('data-control', key); fields[key] = node; return node; };

  // `title`: the control is the first one in a block that already carries its name, so the name is not shown twice
  function control(key, d, title) { return keep(key, controlBody(key, d, title)); }
  function controlBody(key, d, title) {
    const id = `c-${key}`;
    if (d.kind === 'range') {
      const input = el('input', { id, type: 'range', min: d.min, max: d.max, step: d.step, value: st.p[key], oninput: (e) => { st.p[key] = Number(e.target.value); changed(); } });
      controls[key] = () => { input.value = st.p[key]; };
      return el('div', { class: 'field' }, el('label', { for: id }, d.label),
        el('div', { class: 'slider' }, el('span', { class: 'end' }, d.lo), input, el('span', { class: 'end' }, d.hi)));
    }
    if (d.kind === 'choice') {
      const row = el('div', { class: 'pills', role: 'group', 'aria-label': d.label },
        d.options.map((o) => el('button', { type: 'button', class: 'pill', 'data-v': o.value, onclick: () => { st.p[key] = o.value; controls[key](); changed(); } }, o.label)));
      controls[key] = () => { for (const b of row.children) b.setAttribute('aria-pressed', String(b.dataset.v === st.p[key])); };
      controls[key]();
      return el('div', { class: 'field' }, title ? null : el('span', { class: 'label' }, d.label), row);
    }
    if (d.kind === 'toggle') {
      const input = el('input', { id, type: 'checkbox', 'aria-label': title ? d.label : null, onchange: (e) => { st.p[key] = e.target.checked; changed(); } });
      input.checked = st.p[key];
      controls[key] = () => { input.checked = st.p[key]; };
      return el('div', { class: 'field toggle' }, el('label', { for: id }, title ? 'Show' : d.label), el('span', { class: 'switch' }, input, el('span', { class: 'knob', 'aria-hidden': 'true' })));
    }
    // each colour is named in words (engine/color.js colorName); its code is kept in the tooltip and, small, beside the name
    const custom = el('input', { type: 'color', value: st.p[key], 'aria-label': `${d.label}: pick any colour`, oninput: (e) => { st.p[key] = e.target.value.toLowerCase(); controls[key](); changed(); } });
    const names = swatchNames(d.swatches);
    const row = el('div', { class: 'swatches', role: 'group', 'aria-label': d.label },
      d.swatches.map((c, i) => el('button', { type: 'button', class: 'swatch', style: `--c:${c}`, 'data-v': c, 'aria-label': names[i], title: `${colourWord(c)} (colour code ${c})`, onclick: () => { st.p[key] = c; controls[key](); changed(); } })),
      el('span', { class: 'swatch any', title: 'Pick any colour' }, custom));
    const word = el('span', { class: 'colour-word' });
    const code = el('span', { class: 'colour-code', title: 'The colour code, for drawing programs and game engines' });
    controls[key] = () => {
      let hit = false;
      for (const b of row.querySelectorAll('button')) { const on = b.dataset.v === st.p[key]; hit = hit || on; b.setAttribute('aria-pressed', String(on)); }
      custom.value = st.p[key];
      custom.parentElement.classList.toggle('on', !hit);
      custom.parentElement.style.setProperty('--c', st.p[key]);
      word.textContent = colourWord(st.p[key]);
      code.textContent = st.p[key];
    };
    controls[key]();
    return el('div', { class: 'field' }, el('span', { class: 'label' }, d.label), row, el('p', { class: 'colour-now', 'aria-live': 'polite' }, word, ' ', code));
  }
  const syncControls = () => { for (const k of Object.keys(controls)) controls[k](); };

  // the sprite's own controls, in their three groups; a control that belongs to a part is shown in that part's block
  const inPart = new Set(parts.flatMap((part) => part.params));
  const group = (gname) => {
    const entries = Object.entries(sprite.params).filter(([key, d]) => d.group === gname && !inPart.has(key));
    if (!entries.length) return null;
    const box = el('section', { class: 'group' }, el('h2', {}, gname), entries.map(([key, d]) => control(key, d)));
    sections.push({ box, keys: entries.map(([key]) => key) });
    return box;
  };
  // one level below: a titled block per part, selector first, then the part's own settings
  const partBlock = (part) => {
    // the title is a button that folds the block shut, so a long panel can be tidied (handy on a phone)
    const title = el('button', { type: 'button', class: 'fold', 'aria-expanded': 'true', onclick: () => {
      title.setAttribute('aria-expanded', String(!box.classList.toggle('folded')));
    } }, part.label, el('span', { class: 'fold-mark', 'aria-hidden': 'true' }));
    const box = el('section', { class: 'group part', 'data-part': part.name },
      el('h2', {}, title),
      control(part.selector, sprite.params[part.selector], true),
      part.controls.map((key) => control(key, sprite.params[key])));
    sections.push({ box, keys: part.params, part });
    return box;
  };
  // "Surprise me" changes only what can be seen: a control that ends up not in effect goes back to its usual value,
  // so nothing hidden is left changed (in the picture or in the link)
  const surprise = () => {
    const p = randomParams(sprite, Math.floor(Math.random() * 1e9)), def = defaultParams(sprite);
    for (let pass = 0, again = true; again && pass < 8; pass++) {
      again = false;
      for (const k of Object.keys(p)) if (p[k] !== def[k] && !inEffect(sprite, k, p)) { p[k] = def[k]; again = true; }
    }
    return p;
  };

  // the style choice, above every other control: only for a sprite that can be drawn in more than one style
  let setStyle = () => {};
  const styleBlock = () => {
    const about = el('p', { class: 'hint style-about' }, styleById(st.style).about);
    const row = el('div', { class: 'pills', role: 'group', 'aria-label': 'Style' },
      styles.map((id) => el('button', { type: 'button', class: 'pill', 'data-style': id, 'aria-pressed': String(id === st.style), onclick: () => setStyle(id) }, styleById(id).label)));
    setStyle = (id) => {
      st.style = id;
      frames.setStyle(id); ahead();
      for (const b of row.children) b.setAttribute('aria-pressed', String(b.dataset.style === id));
      about.textContent = styleById(id).about;
      buildStrip(); saveUrl();
    };
    return el('section', { class: 'group style-choice' }, el('h2', {}, 'Style'), el('div', { class: 'field' }, row), about);
  };

  panel.replaceChildren(
    ...[choice ? styleBlock() : null,
      el('div', { class: 'panel-actions' },
        el('button', { type: 'button', class: 'btn', onclick: () => { st.p = surprise(); syncControls(); changed(); } }, 'Surprise me'),
        el('button', { type: 'button', class: 'ghost', onclick: () => { st.p = defaultParams(sprite); st.cues = spriteCues(sprite); setStyle(styles[0]); syncControls(); changed(); cuesChanged(true); } }, 'Start over')),
      group('Look'), ...parts.map(partBlock), group('Colors'), group('Motion')].filter(Boolean));
  syncShown();

  // ---- link and download
  let urlTimer = 0;
  function link() {
    const def = defaultParams(sprite), q = new URLSearchParams();
    for (const [k, v] of Object.entries(st.p)) if (v !== def[k]) q.set(k, typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));
    if (st.clip !== sprite.preview) q.set('clip', st.clip);
    if (st.scale !== 1) q.set('scale', String(st.scale));
    if (st.style !== styles[0]) q.set('artstyle', st.style);     // like any other setting: only when it is not the usual one
    const packed = packCues(sprite, st.cues);
    if (packed) q.set('sfx', packed);
    const qs = q.toString();
    return `#/sprite/${sprite.id}${qs ? '?' + qs : ''}`;
  }
  function saveUrl() { clearTimeout(urlTimer); urlTimer = setTimeout(() => history.replaceState(null, '', keepBag(link(), query)), 200); }

  const status = el('p', { class: 'status', role: 'status' });
  const say = (msg) => { status.textContent = msg; };
  const sizeText = () => `Each frame is ${sprite.size[0] * st.scale} × ${sprite.size[1] * st.scale} pixels.`;
  const sizeNote = el('span', { class: 'hint' }, sizeText());
  const sizeBar = el('div', { class: 'pills small', role: 'group', 'aria-label': 'Pixel size' },
    [1, 2, 4].map((s) => el('button', { type: 'button', class: 'pill', 'aria-pressed': String(s === st.scale), onclick: (e) => {
      st.scale = s;
      for (const b of sizeBar.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      sizeNote.textContent = sizeText();
      saveUrl();
    } }, `${s}×`)));

  async function download() {
    try {
      // only the sounds that play at these settings go in the package
      const playing = Object.fromEntries(Object.entries(st.cues).map(([clip, list]) => [clip, list.filter(applies)]));
      const files = await spriteFiles(sprite, st.p, playing, st.scale, null, st.style);
      const nSounds = files.filter((f) => f.name.endsWith('.wav')).length;
      saveBlob(zip(files), `${sprite.id}-sprite-and-sounds.zip`);
      // what the pictures are depends on the style: a sheet for pixel art, perhaps one file per frame for another
      const sheet = files.some((f) => f.name === `${sprite.id}.png`);
      const nPictures = files.filter((f) => !f.name.endsWith('.wav') && !f.name.endsWith('.json') && !f.name.endsWith('.txt')).length;
      const pictures = sheet ? 'the sprite sheet' : `${nPictures} picture${nPictures === 1 ? '' : 's'} in the "${styleById(st.style).label}" style`;
      say(`Downloaded ${sprite.id}-sprite-and-sounds.zip: ${pictures}, ${nSounds} sound${nSounds === 1 ? '' : 's'}, the animation list, and a short guide.`);
    } catch (e) {
      say(`The download did not start: ${e.message}. Try again, or use a different browser.`);
    }
  }
  async function copyLink() {
    clearTimeout(urlTimer);
    const url = `${location.origin}${location.pathname}${link()}`;
    try { await navigator.clipboard.writeText(url); say('Link copied. Anyone who opens it sees this exact sprite with these sounds.'); }
    catch { say('Copy the address in your browser bar to share this exact sprite.'); }
  }

  buildStrip();
  buildCues();

  const made = madeNote(sprite.id);
  app.replaceChildren(
    header('sprites'),
    el('main', { class: 'editor' },
      el('div', { class: 'left' },
        el('div', { class: 'title-row' }, el('h1', {}, sprite.name), el('p', { class: 'blurb' }, sprite.blurb ?? '')),
        made ? el('p', { class: 'hint made-here' }, made.text) : null,
        el('div', { class: 'stage-card' }, stageWrap, el('div', { class: 'stage-tools' }, sceneBar, playBtn)),
        el('div', { class: 'under' }, el('span', { class: 'label' }, 'Animation'), clipBar),
        strip,
        cueBox,
        goesWith(sprite.id)),     // the sounds it uses and the bundles it is in, from the catalogue
      panel,
      el('div', { class: 'get' },
        made?.draft ? null : addToBag('sprite', sprite.id, () => ({ params: { ...st.p }, cues: st.cues, scale: st.scale, ...(st.style !== styles[0] ? { artStyle: st.style } : {}) }), query),
        el('button', { type: 'button', class: 'btn big', onclick: download }, 'Download sprite and sounds'),
        el('button', { type: 'button', class: 'ghost', onclick: copyLink }, 'Copy link'),
        el('div', { class: 'size' }, el('span', { class: 'label' }, 'Pixel size'), sizeBar, sizeNote),
        status),
      moreLikeThis(sprite.id)));

  // ---- animation loop
  const ctx = stage.getContext('2d');
  let W = 160, H = 104, zoom = 4, raf = 0, last = performance.now();
  const fit = () => {
    const cw = stageWrap.clientWidth;
    if (!cw) return;
    if (backdrop === 'fill') {
      // a background is the whole frame: the canvas is exactly the sprite, at the largest whole size that fits (or shrunk to fit)
      [W, H] = sprite.size;
      zoom = Math.max(1, Math.min(5, Math.floor(cw / W)));
      const k = W * zoom > cw ? cw / W : zoom;
      stage.width = W; stage.height = H;
      stage.style.width = Math.floor(W * k) + 'px'; stage.style.height = Math.floor(H * k) + 'px';
      return;
    }
    zoom = Math.max(2, Math.min(5, Math.floor(cw / 104)));
    W = Math.floor(cw / zoom);
    H = Math.max(72, sprite.size[1] + 24);
    stage.width = W; stage.height = H;
    stage.style.width = W * zoom + 'px'; stage.style.height = H * zoom + 'px';
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stageWrap);
  fit();

  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const clip = sprite.clips[st.clip];
    const fps = clipFps(sprite, st.clip, st.p);
    if (st.playing) {
      const n = Math.floor(((now - st.start) / 1000) * fps);
      const rest = Math.round(fps * 0.5);               // one-shot clips hold their last frame briefly, then replay
      const pos = clip.loop ? n % clip.frames : n % (clip.frames + rest);
      st.frame = Math.min(clip.frames - 1, pos);
      if (pos !== st.lastFrame) { st.lastFrame = pos; if (pos < clip.frames) fire(pos, false); }
      st.scroll += travel(sprite, st.clip, st.p) * dt;
    }
    const gy = H - 18;
    let px, py;
    if (backdrop === 'fill') {
      // behind a layer that is see-through in places: the light panel, so the gaps show as gaps, not as a scene
      drawStage(ctx, W, H, H, 'panel-light', 0);
      px = 0; py = 0;
    } else if (backdrop === 'panel') {
      drawStage(ctx, W, H, H, st.stage, 0);         // nothing to stand on: the piece sits in the middle of the panel
      px = Math.round((W - sprite.size[0]) / 2); py = Math.round((H - sprite.size[1]) / 2);
    } else {
      drawStage(ctx, W, H, gy, st.stage, st.scroll);
      px = Math.round(W * 0.5 - sprite.size[0] / 2 + (sprite.size[0] / 2 - sprite.pivot[0]) * 0.5);
      py = gy - sprite.pivot[1] - hover(sprite);
      if (st.stage !== 'plain') shadow(ctx, px + sprite.pivot[0], gy, Math.round(sprite.size[0] * 0.17));
    }
    ctx.drawImage(frames.get(st.clip, st.frame), px, py);
    const cells = strip.children;
    for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('on', i === st.frame);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  syncLoops();
  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); clearTimeout(urlTimer);
    if (offFrames) offFrames();
    clearTimeout(aheadTimer);
    window.removeEventListener('sf-audio-ready', syncLoops);
    for (const h of loops) h.stop();
  };
}
