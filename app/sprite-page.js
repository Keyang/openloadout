// One sprite (docs/site-design.md, section 5, "Asset"): two columns that fill the window (app/asset-shell.js). Left: its
// name and line, its live picture on a shelf tile (plain, or in a scene that suits it), play and pause, its animations
// as chips and the frames of the one playing. Right: the editing panel (app/panel.js) with its versions, its controls in
// tabs, the sounds that play with each animation (Sounds), its looks (Look), and the download.
// Every change is saved to the bag as it is made (app/editing.js).
import { defaultParams, cleanParams, clipFps, cueInEffect, renderPixels } from '../engine/sprite.js';
import { stylesOf, styleById } from '../engine/styles.js';
import { bag, cleanSettings, lookOf } from './bag.js';     // W6-A: a sprite may offer more than one style (Contract 12)
import { drawStage, backdropFor, stagesFor, sceneFor, defaultStage } from './stage.js';
import { zip } from './zip.js';
import { el, header, Frames, travel, hover, shadow, saveBlob, store, cap } from './ui.js';
import { sounds, soundById, soundParams, rendered, playRendered, soundState, setSoundOn, toUnit, toValue } from './audio.js';
import { spriteFiles, defaultCues } from './bundle.js';
import { keepBag } from './add-to-bag.js';
import { createEdit } from './editing.js';      // changes save themselves (docs/site-design.md, section 3)
import { editPanel } from './panel.js';         // the right-hand column: versions, fine-tune tabs, the footer
import { assetShell, icon, ICON, setIcon } from './asset-shell.js';
import { lookTab, lookById, lookPainter } from './asset-look.js';      // the whole-set looks, on this one sprite
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
/** A sprite's sounds as the bag keeps them: what tells two lists apart, without what the page adds while it is open. */
const cueKey = (cues) => JSON.stringify(cleanSettings('sprite', { cues }).cues);

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

/** The visitor asked for less motion: pictures do not move by themselves. */
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function spritePage(app, sprite, query) {
  document.title = `${sprite.name} · Loadout`;
  // what the preview stands on suits what the sprite is (app/stage.js): a scene with ground, a plain panel for an
  // interface piece, or nothing at all for a background, which fills the frame itself
  const about = sprite.meta ?? assetById(sprite.id);
  const backdrop = backdropFor(about);
  const scene = sceneFor(about);      // the scene "In a scene" means for this sprite: the meadow, or the cave
  const stageChoices = stagesFor(backdrop);
  // (a choice kept from before the two scenes became one "In a scene")
  const keptStage = (v) => (v === 'meadow' || v === 'cave' ? 'scene' : v);
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
  // The edit session (app/editing.js): what the address carries is where it starts; a bag item of this sprite (the one
  // the address names, or the visitor's own when the address carries no settings) is what it edits. From here on the
  // session holds the settings, and every change to them is saved to the bag.
  const made = madeNote(sprite.id);
  const usual = { params: defaultParams(sprite), cues: spriteCues(sprite), scale: 1 };
  let saveTimer = 0;
  const edit = createEdit({
    kind: 'sprite', id: sprite.id, defaults: usual, key: query.bag ?? null, canSave: !made?.draft,
    start: {
      params: cleanParams(sprite, query), cues: (query.sfx && unpackCues(sprite, query.sfx)) || spriteCues(sprite),
      scale: [1, 2, 4].includes(Number(query.scale)) ? Number(query.scale) : 1,
      ...(styles.includes(askedStyle) && askedStyle !== styles[0] ? { artStyle: askedStyle } : {}),      // only when it is not the sprite's first style
      ...(lookOf({ look: query.artlook }) ? { look: query.artlook } : {}),      // a look of its own (the Look tab), carried by the link as `artlook`
    },
    schedule: (fn) => { clearTimeout(saveTimer); saveTimer = setTimeout(fn, 150); },      // a slider being dragged is a few saves, not hundreds
  });
  const styleOf = (s) => (styles.includes(s.artStyle) ? s.artStyle : styles[0]);
  const s0 = edit.settings();
  const st = {
    style: styleOf(s0),
    p: cleanParams(sprite, s0.params),
    clip: clipNames.includes(query.clip) ? query.clip : sprite.preview,
    cues: s0.cues ?? spriteCues(sprite),
    // (with reduced motion asked for, it stands still until Play is pressed: J13.2)
    playing: !still(),
    // (the visitor's last choice; without one, a character or a creature stands in its scene and anything else is shown plain)
    stage: stageChoices.some((s) => s.id === keptStage(store.get(stageKey))) ? keptStage(store.get(stageKey)) : backdrop === 'ground' ? defaultStage(about) : stageChoices[0]?.id ?? null,
    look: lookOf(s0),      // its own look (the Look tab): one of the named whole-set looks, saved with it like any setting; null while it follows the bag
    scale: s0.scale, start: performance.now(), frame: 0, lastFrame: -1, scroll: 0,
  };
  const frames = choice ? new StyleFrames(sprite, st.p, st.style) : new Frames(sprite, st.p);
  // W5-B: a sprite made on a visit is drawn in a worker of its own, and its frames for new settings arrive a moment later:
  // what was drawn meanwhile (the last look) is dropped then, and the stage and the strip draw again
  const offFrames = typeof sprite.onFrames === 'function' ? sprite.onFrames((e) => { if (sprite.isFor(e, st.p, st.style)) { frames.set(st.p); repaint(); buildStrip(); } }) : null;
  // a frame as it is shown: in the look chosen, when there is one (each drawn frame is recoloured once and kept)
  let painter = null;
  const painted = new Map();
  function repaint() {
    painted.clear();
    const look = lookById(st.look);
    try { painter = look ? lookPainter(sprite, st.p, st.style, look) : null; } catch (e) { console.error('look:', e); painter = null; }
  }
  const pic = (clip, f) => {
    const cv = frames.get(clip, f);
    if (!painter) return cv;
    let out = painted.get(cv);
    if (!out) { try { out = painter(cv); } catch (e) { console.error('look:', e); out = cv; } painted.set(cv, out); }
    return out;
  };
  repaint();
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

  // ---- stage: the live picture on a shelf tile, with where it stands and play/pause on it
  const stage = el('canvas', { class: 'stage', role: 'img', 'aria-label': `${sprite.name} animation preview` });
  const shelf = el('span', { class: 'stage-shelf', 'aria-hidden': 'true' });      // the line a sprite stands on when it is shown plain
  const stageWrap = el('div', { class: 'stage-wrap' }, stage, shelf);
  const strip = el('div', { class: 'strip', role: 'group', 'aria-label': 'Frames' });
  const clipBar = el('div', { class: 'clips chips', role: 'group', 'aria-label': 'Animation' });
  const playBtn = el('button', { class: 'icon-btn', type: 'button', onclick: () => {
    st.playing = !st.playing;
    if (st.playing) { st.start = performance.now() - (st.frame / clipFps(sprite, st.clip, st.p)) * 1000; st.lastFrame = st.frame; }
    syncPlay(); syncLoops();
  } });
  const syncPlay = () => { playBtn.setAttribute('aria-label', st.playing ? 'Pause' : 'Play'); playBtn.title = st.playing ? 'Pause the animation' : 'Play the animation'; setIcon(playBtn, st.playing ? 'pause' : 'play'); };
  syncPlay();

  const setClip = (name) => {
    // (another animation plays from its start; with reduced motion it shows its first frame until Play is pressed)
    st.clip = name; st.start = performance.now(); st.playing = !still(); st.lastFrame = -1; st.frame = 0; syncPlay();
    for (const b of clipBar.children) b.setAttribute('aria-pressed', String(b.dataset.clip === name));
    buildStrip(); buildCues(); syncLoops(); saveUrl();
  };
  for (const name of clipNames) clipBar.append(el('button', { type: 'button', class: 'chip', 'data-clip': name, 'aria-pressed': String(name === st.clip), onclick: () => setClip(name) }, sprite.clips[name].label));

  // where it stands: plain or in a scene (a thing that stands on the ground), a light or a dark panel (an interface
  // piece); a background is its own backdrop and has no choice
  const stageWord = (s) => (backdrop === 'panel' ? s.label.replace(/ panel$/, '') : s.label);
  const stageCard = el('div', { class: 'stage-card tile', 'data-backdrop': backdrop, 'data-stage': st.stage ?? '' });
  const sceneBar = stageChoices.length < 2 ? el('span', { class: 'scene-none' }) : el('span', { class: 'seg', role: 'group', 'aria-label': 'Backdrop' },
    (backdrop === 'ground' ? [...stageChoices].reverse() : stageChoices).map((s) => el('button', { type: 'button', 'data-stage': s.id, title: s.id === 'scene' ? `In a scene: the ${scene}` : null, 'aria-label': s.id === 'scene' ? null : `${s.label} backdrop`, 'aria-pressed': String(s.id === st.stage), onclick: () => {
      st.stage = s.id; store.set(stageKey, s.id);
      stageCard.dataset.stage = s.id;
      for (const b of sceneBar.children) b.setAttribute('aria-pressed', String(b.dataset.stage === s.id));
    } }, stageWord(s))));
  stageCard.append(stageWrap, el('div', { class: 'stage-tools' }, sceneBar, playBtn));

  let stripRoom = 0;
  function buildStrip() {
    const n = sprite.clips[st.clip].frames;
    // every frame in one row inside the column: cells of 40px, smaller (down to 26) when the row would not fit; more
    // frames than that wrap onto a second row
    const room = strip.clientWidth - 4, cell = room > 0 ? Math.max(26, Math.min(40, Math.floor((room - 4 * (n - 1)) / n))) : 40;
    strip.style.setProperty('--cell', `${cell}px`);
    stripRoom = strip.clientWidth;
    const marked = new Set((st.cues[st.clip] ?? []).filter((c) => soundById[c.sound] && !soundById[c.sound].loop && applies(c)).map((c) => c.frame));
    strip.replaceChildren(...Array.from({ length: n }, (_, f) => {
      const c = el('canvas', { width: sprite.size[0], height: sprite.size[1] });
      c.getContext('2d').drawImage(pic(st.clip, f), 0, 0);
      // in its cell at a whole-number size, or a whole-number fraction when the frame is larger than the cell
      const z = (cell - 4) / Math.max(sprite.size[0], sprite.size[1]), k = z >= 1 ? Math.floor(z) : 1 / Math.ceil(1 / z);
      c.style.width = `${sprite.size[0] * k}px`; c.style.height = `${sprite.size[1] * k}px`;
      return el('button', { type: 'button', class: 'cell' + (marked.has(f) ? ' has-sound' : ''), 'aria-label': `Frame ${f + 1}${marked.has(f) ? ', plays a sound' : ''}`, onclick: () => {
        st.playing = false; st.frame = f; st.lastFrame = f; syncPlay(); syncLoops(); fire(f, true);
      } }, c);
    }));
  }

  // ---- the Sounds tab: for the animation that is playing, which sound, on which frame, play it, change it
  const cueBox = el('section', { class: 'cues' });
  const cuesChanged = (rebuild) => { if (rebuild) buildCues(); buildStrip(); syncLoops(); edit.set({ cues: st.cues }); saveUrl(); };
  const act = (label, onclick, more = {}) => el('button', { type: 'button', class: 'cue-act', onclick, ...more }, label);

  function cueRow(cue, list) {
    const patch = soundById[cue.sound];
    const n = sprite.clips[st.clip].frames;
    const soundSel = el('select', { 'aria-label': 'Sound', onchange: (e) => { cue.sound = e.target.value; cue.preset = null; cue.params = null; cuesChanged(true); playCue(cue, true); } },
      [...new Set(sounds.map((s) => s.category))].map((cat) => el('optgroup', { label: cap(cat) }, sounds.filter((s) => s.category === cat).map((s) => el('option', { value: s.id, selected: s.id === cue.sound }, s.name)))));
    // the frame it starts on: one square per frame of the animation, the one it plays on filled
    let when;
    if (patch.loop) when = el('span', { class: 'cue-when' }, el('span', { class: 'ruler-word' }, 'Plays for the whole animation'));
    else {
      const word = el('span', { class: 'ruler-word' }, `Frame ${cue.frame + 1} of ${n}`);
      const ruler = el('span', { class: 'ruler', role: 'group', 'aria-label': 'The frame it plays on' },
        Array.from({ length: n }, (_, f) => el('button', { type: 'button', 'data-frame': f, 'aria-label': `Move to frame ${f + 1}`, 'aria-pressed': String(f === cue.frame), onclick: () => {
          cue.frame = f;
          for (const b of ruler.children) b.setAttribute('aria-pressed', String(Number(b.dataset.frame) === f));
          word.textContent = `Frame ${f + 1} of ${n}`;
          cuesChanged(false); playCue(cue, true);
        } })));
      when = el('span', { class: 'cue-when' }, ruler, word);
    }
    const presets = Object.keys(patch.presets ?? {});
    const styleSel = el('select', { 'aria-label': 'Style', onchange: (e) => { cue.preset = e.target.value === '' || e.target.value === '*' ? null : e.target.value; if (e.target.value !== '*') cue.params = null; cuesChanged(true); playCue(cue, true); } },
      el('option', { value: '', selected: !cue.preset && !cue.params }, 'Standard'),
      presets.map((name) => el('option', { value: name, selected: cue.preset === name && !cue.params }, name)),
      cue.params ? el('option', { value: '*', selected: true }, 'Your own') : null);
    const head = el('div', { class: 'cue-head' },
      el('button', { type: 'button', class: 'icon-btn cue-play', 'aria-label': `Play ${patch.name}`, onclick: () => playCue(cue, true) }, icon(ICON.play, { fill: true })),
      soundSel, when, styleSel,
      el('span', { class: 'cue-acts' },
        act(cue.open ? 'Done' : 'Adjust', () => { cue.open = !cue.open; buildCues(); }, { 'aria-expanded': String(!!cue.open) }),
        act('Duplicate', () => {
          // a copy with the same sound, style, changes and volume, on the next frame that has no sound yet
          const copy = { sound: cue.sound, frame: cue.frame, preset: cue.preset, params: cue.params ? { ...cue.params } : null, volume: cue.volume, open: false };
          if (cue.when) copy.when = cue.when;
          if (!patch.loop) {
            const taken = new Set(list.filter((c) => soundById[c.sound] && !soundById[c.sound].loop).map((c) => c.frame));
            for (let i = 1; i < n; i++) { const f = (cue.frame + i) % n; if (!taken.has(f)) { copy.frame = f; break; } }
          }
          list.splice(list.indexOf(cue) + 1, 0, copy);
          cuesChanged(true); playCue(copy, true);
        }, { disabled: list.length >= MAX_CUES, title: list.length >= MAX_CUES ? `An animation can have up to ${MAX_CUES} sounds` : null }),
        act('Remove', () => { list.splice(list.indexOf(cue), 1); cuesChanged(true); })));
    const on = applies(cue);
    const note = on ? null : el('p', { class: 'cue-note' }, 'Does not play with the current look.');
    if (!cue.open) return el('li', { class: on ? 'cue' : 'cue off' }, head, note);
    const vals = soundParams(patch, cue.preset, cue.params);
    const field = (label, input) => el('label', { class: 'cue-field' }, el('span', {}, label), input);
    const sliders = [
      field('Volume', el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: cue.volume, 'aria-label': 'Volume', oninput: (e) => { cue.volume = Number(e.target.value); fill(e.target); }, onchange: () => { cuesChanged(false); playCue(cue, true); } })),
      ...patch.params.map((d) => field(d.label,
        el('input', { type: 'range', min: 0, max: 1, step: 0.005, value: toUnit(d, vals[d.id]), 'aria-label': d.label,
          oninput: (e) => { cue.params = { ...soundParams(patch, cue.preset, cue.params), [d.id]: toValue(d, Number(e.target.value)) }; fill(e.target); },
          onchange: () => { cuesChanged(false); playCue(cue, true); if (styleSel.value !== '*') buildCues(); } }))),
    ];
    for (const f of sliders) fill(f.querySelector('input'));
    return el('li', { class: on ? 'cue open' : 'cue open off' }, head, note, el('div', { class: 'cue-sliders' }, sliders));
  }
  // a slider's filled part follows its thumb (the track is drawn from --p, app/css/base.css)
  function fill(input) { input.style.setProperty('--p', `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min) || 1)) * 100}%`); }

  function buildCues() {
    const list = st.cues[st.clip] ?? (st.cues[st.clip] = []);
    shownSig = cueSig();
    const soundSwitch = el('input', { id: 'sound-on', type: 'checkbox', onchange: (e) => { setSoundOn(e.target.checked); syncLoops(); } });
    soundSwitch.checked = soundState.on;
    const full = list.length >= MAX_CUES;
    cueBox.replaceChildren(
      el('div', { class: 'cues-top' },
        el('h2', {}, `Sounds for ${sprite.clips[st.clip].label}`),
        el('span', { class: 'cues-about' }, 'They come along when you download.'),
        el('span', { class: 'cues-switch' }, el('label', { for: 'sound-on' }, 'Sound'), el('span', { class: 'switch' }, soundSwitch, el('span', { class: 'knob', 'aria-hidden': 'true' })))),
      list.length ? el('ul', { class: 'cue-list' }, list.filter((c) => soundById[c.sound]).map((c) => cueRow(c, list)))
        : el('p', { class: 'hint pane-note' }, 'This animation is silent. Add a sound and choose the frame it starts on.'),
      el('p', { class: 'cues-add' },
        el('button', { type: 'button', class: 'btn btn-sm btn-secondary', disabled: full, onclick: () => {
          const used = new Set(list.map((c) => c.sound));
          const pick = ['whoosh', 'punch', 'ui-click'].map((id) => soundById[id]).find((s) => s && !used.has(s.id)) ?? sounds.find((s) => !s.loop && !used.has(s.id)) ?? sounds[0];
          const cue = { sound: pick.id, frame: st.playing ? 0 : st.frame, preset: null, params: null, volume: 1, open: false };
          list.push(cue); cuesChanged(true); playCue(cue, true);
        } }, 'Add a sound'),
        full ? el('span', { class: 'hint' }, `An animation can have up to ${MAX_CUES} sounds. Remove one to add another.`) : null));
  }

  // ---- the settings changed (in the panel, or the bag item was changed elsewhere): draw what the session now holds
  const changed = () => {
    frames.set(st.p); repaint(); buildStrip(); ahead(); look.sync();
    // sounds that depend on the settings: refresh the list and anything looping when what applies has changed
    if (cueSig() !== shownSig) { buildCues(); syncLoops(); }
  };
  let syncStyle = () => {}, urlTimer = 0;
  function pull() {
    const s = edit.settings();
    st.scale = s.scale;
    if (styleOf(s) !== st.style) { st.style = styleOf(s); if (choice) frames.setStyle(st.style); repaint(); ahead(); buildStrip(); syncStyle(); look.sync(); }
    if (JSON.stringify(s.params) !== JSON.stringify(st.p)) { st.p = cleanParams(sprite, s.params); changed(); }
    if (lookOf(s) !== st.look) { st.look = lookOf(s); repaint(); buildStrip(); look.sync(); }
    if (cueKey(s.cues) !== cueKey(st.cues)) { st.cues = s.cues ?? spriteCues(sprite); buildCues(); buildStrip(); syncLoops(); }
    // the address follows; a save that is already on its way is left to land when it was due (it reads the item's key then)
    if (!urlTimer) saveUrl();
  }

  // the style choice (the panel's Look tab): only for a sprite that can be drawn in more than one style
  const styleBlock = () => {
    const about = el('p', { class: 'pane-note style-about' }, styleById(st.style).about);
    const row = el('span', { class: 'chips', role: 'group', 'aria-label': 'Style' },
      styles.map((id) => el('button', { type: 'button', class: 'chip', 'data-style': id, 'aria-pressed': String(id === st.style), onclick: () => edit.set({ artStyle: id === styles[0] ? undefined : id }) }, styleById(id).label)));
    syncStyle = () => {
      for (const b of row.children) b.setAttribute('aria-pressed', String(b.dataset.style === st.style));
      about.textContent = styleById(st.style).about;
    };
    return el('div', { class: 'style-choice' }, el('div', { class: 'ctl is-main', 'data-control-style': '' }, el('span', { class: 'ctl-label' }, 'Style'), row), about);
  };

  // the looks (the panel's Look tab): a look of its own for this sprite, saved with it like any setting (app/asset-look.js)
  let panel = null;
  const setLook = (id) => edit.set({ look: id ?? null });
  const look = lookTab({ sprite, now: () => ({ params: st.p, style: st.style, look: st.look }), pick: setLook, say: (text) => panel && panel.say(text), before: choice ? styleBlock() : null });

  // ---- link and download
  function link() {
    const def = defaultParams(sprite), q = new URLSearchParams();
    for (const [k, v] of Object.entries(st.p)) if (v !== def[k]) q.set(k, typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));
    if (st.clip !== sprite.preview) q.set('clip', st.clip);
    if (st.scale !== 1) q.set('scale', String(st.scale));
    if (st.style !== styles[0]) q.set('artstyle', st.style);     // like any other setting: only when it is not the usual one
    if (st.look) q.set('artlook', st.look);
    const packed = packCues(sprite, st.cues);
    if (packed) q.set('sfx', packed);
    const qs = q.toString();
    return `#/sprite/${sprite.id}${qs ? '?' + qs : ''}`;
  }
  // the address carries the settings, and the bag item they are saved to, so a reload goes on editing the same item
  function saveUrl() { clearTimeout(urlTimer); urlTimer = setTimeout(() => { urlTimer = 0; history.replaceState(null, '', keepBag(link(), { bag: edit.key() })); }, 200); }

  async function download() {
    try {
      // only the sounds that play at these settings go in the package
      const playing = Object.fromEntries(Object.entries(st.cues).map(([clip, list]) => [clip, list.filter(applies)]));
      const inLook = lookById(st.look);
      const files = await spriteFiles(sprite, st.p, playing, st.scale, inLook ? inLook.theme : null, st.style);
      const nSounds = files.filter((f) => f.name.endsWith('.wav')).length;
      saveBlob(zip(files), `${sprite.id}-sprite-and-sounds.zip`);
      // what the pictures are depends on the style: a sheet for pixel art, perhaps one file per frame for another
      const sheet = files.some((f) => f.name === `${sprite.id}.png`);
      const nPictures = files.filter((f) => !f.name.endsWith('.wav') && !f.name.endsWith('.json') && !f.name.endsWith('.txt')).length;
      const pictures = sheet ? 'the sprite sheet' : `${nPictures} picture${nPictures === 1 ? '' : 's'} in the "${styleById(st.style).label}" style`;
      return `Downloaded ${sprite.id}-sprite-and-sounds.zip${inLook ? `, in the ${inLook.name} look` : ''}: ${pictures}, ${nSounds} sound${nSounds === 1 ? '' : 's'}, the animation list, and a short guide.`;
    } catch (e) {
      return `The download did not start: ${e.message}. Try again, or use a different browser.`;
    }
  }
  async function copyLink() {
    clearTimeout(urlTimer); urlTimer = 0;
    const url = `${location.origin}${location.pathname}${link()}`;
    try { await navigator.clipboard.writeText(url); return 'Link copied. Anyone who opens it sees this exact sprite with these sounds.'; }
    catch { return 'Copy the address in your browser bar to share this exact sprite.'; }
  }

  buildStrip();
  buildCues();

  // ---- the editing panel: versions, the controls in tabs (with this page's sounds and looks as two more), the footer
  let shell = null;
  panel = editPanel({
    kind: 'sprite', asset: sprite, edit,
    tabs: [
      { id: 'sounds', label: 'Sounds', node: cueBox, changed: () => cueKey(st.cues) !== cueKey(usual.cues) },
      { id: 'look', label: 'Look', node: look.node, changed: () => st.style !== styles[0] || !!lookOf(edit.settings()) },      // a look of its own is a change, saved like any other
    ],
    sizeNote: (scale) => `${sprite.size[0] * scale} × ${sprite.size[1] * scale}`,
    onDownload: download, onCopyLink: copyLink,
    onMore: () => shell && shell.openMore(),
    onTab: (id) => { if (id === 'look') look.show(); else look.hide(); },
  });
  const offEdit = edit.onChange(pull);
  const flush = () => edit.flush();
  window.addEventListener('pagehide', flush);      // closing the tab mid-drag still saves the last change
  if (edit.inBag()) saveUrl();

  shell = assetShell({ kind: 'sprite', id: sprite.id, name: sprite.name, line: sprite.blurb ?? '', made, edit, stage: stageCard, under: [clipBar, strip], panel });
  app.replaceChildren(header('sprites'), shell.main);
  // (the animation the page opens on is in sight among its chips, also when a tileset has rows of them)
  { const on = clipBar.querySelector('[aria-pressed="true"]'); const top = on ? on.offsetTop - clipBar.offsetTop : 0; if (on && top + on.offsetHeight > clipBar.clientHeight) clipBar.scrollTop = top - 4; }

  // ---- animation loop
  const ctx = stage.getContext('2d');
  let W = 160, H = 104, gy = 80, raf = 0, last = performance.now();
  // The picture fills its tile at a whole-number size: the canvas is as many sprite pixels as fit, the sprite in the
  // middle of it. (A sprite larger than the tile is shown at a whole-number fraction instead.)
  const place = (k) => {
    const cw = stageWrap.clientWidth, ch = stageWrap.clientHeight;
    const left = Math.floor((cw - W * k) / 2), top = Math.floor((ch - H * k) / 2);
    stage.style.width = `${W * k}px`; stage.style.height = `${H * k}px`;
    stage.style.left = `${left}px`; stage.style.top = `${top}px`;
    return { left, top };
  };
  const fit = () => {
    const cw = stageWrap.clientWidth, ch = stageWrap.clientHeight;
    if (!cw || !ch) return;
    const [sw, sh] = sprite.size;
    if (backdrop === 'fill') {
      // a background is the whole frame: the canvas is exactly the sprite, at the largest whole size that fits
      [W, H] = sprite.size;
      const z = Math.min(cw / W, ch / H);
      stage.width = W; stage.height = H;
      place(z >= 1 ? Math.min(6, Math.floor(z)) : 1 / Math.ceil(1 / z));
      return;
    }
    const z = Math.min(cw / (sw + 24), ch / (sh + (backdrop === 'panel' ? 16 : 36)));
    const k = z >= 1 ? Math.min(6, Math.floor(z)) : 1 / Math.ceil(1 / z);
    W = Math.ceil(cw / k); H = Math.ceil(ch / k);
    stage.width = W; stage.height = H;
    // the ground: under the middle of the tile, never so high that the sprite's top is cut, never off the bottom
    const lift = hover(sprite);
    gy = Math.min(H - 8, Math.max(sprite.pivot[1] + lift + 6, Math.round(H / 2 + (sprite.pivot[1] + lift) / 2 + 4)));
    const at = place(k);
    shelf.style.top = `${at.top + gy * k}px`;
  };
  const ro = new ResizeObserver(() => { fit(); if (strip.clientWidth !== stripRoom) buildStrip(); });
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
    let px, py;
    if (backdrop === 'fill') {
      // behind a layer that is see-through in places: the light panel, so the gaps show as gaps, not as a scene
      drawStage(ctx, W, H, H, 'panel-light', 0);
      px = 0; py = 0;
    } else if (backdrop === 'panel') {
      drawStage(ctx, W, H, H, st.stage, 0);         // nothing to stand on: the piece sits in the middle of the panel
      px = Math.round((W - sprite.size[0]) / 2); py = Math.round((H - sprite.size[1]) / 2);
    } else {
      drawStage(ctx, W, H, gy, st.stage === 'scene' ? scene : st.stage, st.scroll);
      px = Math.round(W * 0.5 - sprite.size[0] / 2 + (sprite.size[0] / 2 - sprite.pivot[0]) * 0.5);
      py = gy - sprite.pivot[1] - hover(sprite);
      if (st.stage !== 'plain') shadow(ctx, px + sprite.pivot[0], gy, Math.round(sprite.size[0] * 0.17));
    }
    ctx.drawImage(pic(st.clip, st.frame), px, py);
    const cells = strip.children;
    for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('on', i === st.frame);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  syncLoops();
  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); clearTimeout(urlTimer);
    offEdit(); panel.close(); look.close(); shell.close(); edit.close(); clearTimeout(saveTimer);      // leaving saves whatever was still waiting
    window.removeEventListener('pagehide', flush);
    if (offFrames) offFrames();
    clearTimeout(aheadTimer);
    window.removeEventListener('sf-audio-ready', syncLoops);
    for (const h of loops) h.stop();
  };
}
