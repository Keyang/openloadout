// One sprite: preview, sliders, the sounds that play with each animation, download.
import { defaultParams, cleanParams, randomParams, clipFps } from '../engine/sprite.js';
import { drawStage, STAGES } from './stage.js';
import { zip } from './zip.js';
import { el, header, Frames, travel, hover, shadow, saveBlob, store, cap } from './ui.js';
import { sounds, soundById, soundParams, rendered, playRendered, soundState, setSoundOn, toUnit, toValue } from './audio.js';
import { spriteFiles, defaultCues } from './bundle.js';

// Sounds travel in the link as a compact list: { clip: [[sound, frame, style, volume, changes], ...] }.
// Only animations whose sounds differ from the sprite's own are written.
const packClip = (list) => JSON.stringify(list.map((c) => [c.sound, c.frame, c.preset ?? 0, c.volume ?? 1, c.params ?? 0]));
function packCues(sprite, cues) {
  const base = defaultCues(sprite), out = {};
  for (const clip of Object.keys(sprite.clips)) if (packClip(cues[clip] ?? []) !== packClip(base[clip] ?? [])) out[clip] = JSON.parse(packClip(cues[clip] ?? []));
  return Object.keys(out).length ? JSON.stringify(out) : '';
}
function unpackCues(sprite, text) {
  try {
    const raw = JSON.parse(text), out = defaultCues(sprite);
    for (const clip of Object.keys(sprite.clips)) {
      if (!Array.isArray(raw[clip])) continue;
      out[clip] = raw[clip].filter((c) => Array.isArray(c) && soundById[c[0]]).slice(0, MAX_CUES).map(([sound, frame, preset, volume, params]) => ({
        sound,
        frame: Math.max(0, Math.min(sprite.clips[clip].frames - 1, Math.round(Number(frame)) || 0)),
        preset: preset && soundById[sound].presets && soundById[sound].presets[preset] ? preset : null,
        volume: Math.max(0, Math.min(1, Number(volume) || 0)),
        params: params && typeof params === 'object' ? params : null,
      }));
    }
    return out;
  } catch { return null; }
}

const MAX_CUES = 8;   // sounds per animation; links keep at most this many

export function spritePage(app, sprite, query) {
  document.title = `${sprite.name} · Loadout`;
  const clipNames = Object.keys(sprite.clips);
  const st = {
    p: cleanParams(sprite, query),
    clip: clipNames.includes(query.clip) ? query.clip : sprite.preview,
    cues: (query.sfx && unpackCues(sprite, query.sfx)) || defaultCues(sprite),
    playing: true,
    stage: STAGES.some((s) => s.id === store.get('stage')) ? store.get('stage') : 'meadow',
    scale: 1, start: performance.now(), frame: 0, lastFrame: -1, scroll: 0,
  };
  const frames = new Frames(sprite, st.p);

  // ---- sound playback
  let loops = [];
  const cueRender = (cue, vary) => {
    const patch = soundById[cue.sound];
    cue.n = ((cue.n ?? 0) + 1) % 3;
    return rendered(patch, soundParams(patch, cue.preset, cue.params), vary ? 1 + cue.n : 1);
  };
  const playCue = (cue, force) => playRendered(cueRender(cue, true), { volume: cue.volume, force });
  function fire(frame, force) {
    for (const cue of st.cues[st.clip] ?? []) {
      const patch = soundById[cue.sound];
      if (patch && !patch.loop && cue.frame === frame) playCue(cue, force);
    }
  }
  function syncLoops() {
    for (const h of loops) h.stop();
    loops = [];
    if (!st.playing || !soundState.on) return;
    for (const cue of st.cues[st.clip] ?? []) {
      const patch = soundById[cue.sound];
      if (!patch || !patch.loop) continue;
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

  const sceneBar = el('div', { class: 'scene', role: 'group', 'aria-label': 'Backdrop' },
    STAGES.map((s) => el('button', { type: 'button', class: 'scene-btn scene-' + s.id, title: s.label, 'aria-label': `${s.label} backdrop`, 'aria-pressed': String(s.id === st.stage), onclick: (e) => {
      st.stage = s.id; store.set('stage', s.id);
      for (const b of sceneBar.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    } })));

  function buildStrip() {
    const n = sprite.clips[st.clip].frames;
    const marked = new Set((st.cues[st.clip] ?? []).filter((c) => soundById[c.sound] && !soundById[c.sound].loop).map((c) => c.frame));
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
        if (!patch.loop) {
          const taken = new Set(list.filter((c) => soundById[c.sound] && !soundById[c.sound].loop).map((c) => c.frame));
          for (let i = 1; i < n; i++) { const f = (cue.frame + i) % n; if (!taken.has(f)) { copy.frame = f; break; } }
        }
        list.splice(list.indexOf(cue) + 1, 0, copy);
        cuesChanged(true); playCue(copy, true);
      } }, 'Duplicate'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { list.splice(list.indexOf(cue), 1); cuesChanged(true); } }, 'Remove'));
    if (!cue.open) return el('li', { class: 'cue' }, head);
    const vals = soundParams(patch, cue.preset, cue.params);
    const sliders = [
      el('div', { class: 'field' }, el('label', {}, 'Volume'), el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: cue.volume, 'aria-label': 'Volume', oninput: (e) => { cue.volume = Number(e.target.value); }, onchange: () => { cuesChanged(false); playCue(cue, true); } })),
      ...patch.params.map((d) => el('div', { class: 'field' }, el('label', {}, d.label),
        el('input', { type: 'range', min: 0, max: 1, step: 0.005, value: toUnit(d, vals[d.id]), 'aria-label': d.label,
          oninput: (e) => { cue.params = { ...soundParams(patch, cue.preset, cue.params), [d.id]: toValue(d, Number(e.target.value)) }; },
          onchange: () => { cuesChanged(false); playCue(cue, true); if (styleSel.value !== '*') buildCues(); } }))),
    ];
    return el('li', { class: 'cue open' }, head, el('div', { class: 'cue-sliders' }, sliders));
  }

  function buildCues() {
    const list = st.cues[st.clip] ?? (st.cues[st.clip] = []);
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
      list.length >= MAX_CUES ? el('span', { class: 'hint' }, ` An animation can have up to ${MAX_CUES} sounds. Remove one to add another.`) : null);
  }

  // ---- look and motion controls
  const panel = el('div', { class: 'panel' });
  const controls = {};
  const changed = () => { frames.set(st.p); buildStrip(); saveUrl(); };

  function control(key, d) {
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
      return el('div', { class: 'field' }, el('span', { class: 'label' }, d.label), row);
    }
    if (d.kind === 'toggle') {
      const input = el('input', { id, type: 'checkbox', onchange: (e) => { st.p[key] = e.target.checked; changed(); } });
      input.checked = st.p[key];
      controls[key] = () => { input.checked = st.p[key]; };
      return el('div', { class: 'field toggle' }, el('label', { for: id }, d.label), el('span', { class: 'switch' }, input, el('span', { class: 'knob', 'aria-hidden': 'true' })));
    }
    const custom = el('input', { type: 'color', value: st.p[key], 'aria-label': `${d.label}: pick any colour`, oninput: (e) => { st.p[key] = e.target.value.toLowerCase(); controls[key](); changed(); } });
    const row = el('div', { class: 'swatches', role: 'group', 'aria-label': d.label },
      d.swatches.map((c) => el('button', { type: 'button', class: 'swatch', style: `--c:${c}`, 'data-v': c, 'aria-label': c, onclick: () => { st.p[key] = c; controls[key](); changed(); } })),
      el('span', { class: 'swatch any', title: 'Pick any colour' }, custom));
    controls[key] = () => {
      let hit = false;
      for (const b of row.querySelectorAll('button')) { const on = b.dataset.v === st.p[key]; hit = hit || on; b.setAttribute('aria-pressed', String(on)); }
      custom.value = st.p[key];
      custom.parentElement.classList.toggle('on', !hit);
      custom.parentElement.style.setProperty('--c', st.p[key]);
    };
    controls[key]();
    return el('div', { class: 'field' }, el('span', { class: 'label' }, d.label), row);
  }
  const syncControls = () => { for (const k of Object.keys(controls)) controls[k](); };

  panel.replaceChildren(
    el('div', { class: 'panel-actions' },
      el('button', { type: 'button', class: 'btn', onclick: () => { st.p = randomParams(sprite, Math.floor(Math.random() * 1e9)); syncControls(); changed(); } }, 'Surprise me'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { st.p = defaultParams(sprite); st.cues = defaultCues(sprite); syncControls(); changed(); cuesChanged(true); } }, 'Start over')),
    ...['Look', 'Colors', 'Motion'].map((gname) => {
      const entries = Object.entries(sprite.params).filter(([, d]) => d.group === gname);
      return entries.length ? el('section', { class: 'group' }, el('h2', {}, gname), entries.map(([key, d]) => control(key, d))) : null;
    }).filter(Boolean));

  // ---- link and download
  let urlTimer = 0;
  function link() {
    const def = defaultParams(sprite), q = new URLSearchParams();
    for (const [k, v] of Object.entries(st.p)) if (v !== def[k]) q.set(k, typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));
    if (st.clip !== sprite.preview) q.set('clip', st.clip);
    const packed = packCues(sprite, st.cues);
    if (packed) q.set('sfx', packed);
    const qs = q.toString();
    return `#/sprite/${sprite.id}${qs ? '?' + qs : ''}`;
  }
  function saveUrl() { clearTimeout(urlTimer); urlTimer = setTimeout(() => history.replaceState(null, '', link()), 200); }

  const status = el('p', { class: 'status', role: 'status' });
  const say = (msg) => { status.textContent = msg; };
  const sizeText = () => `Each frame is ${sprite.size[0] * st.scale} × ${sprite.size[1] * st.scale} pixels.`;
  const sizeNote = el('span', { class: 'hint' }, sizeText());
  const sizeBar = el('div', { class: 'pills small', role: 'group', 'aria-label': 'Pixel size' },
    [1, 2, 4].map((s) => el('button', { type: 'button', class: 'pill', 'aria-pressed': String(s === 1), onclick: (e) => {
      st.scale = s;
      for (const b of sizeBar.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      sizeNote.textContent = sizeText();
    } }, `${s}×`)));

  async function download() {
    try {
      const files = await spriteFiles(sprite, st.p, st.cues, st.scale);
      const nSounds = files.filter((f) => f.name.endsWith('.wav')).length;
      saveBlob(zip(files), `${sprite.id}-sprite-and-sounds.zip`);
      say(`Downloaded ${sprite.id}-sprite-and-sounds.zip: the sprite sheet, ${nSounds} sound${nSounds === 1 ? '' : 's'}, the animation list, and a short guide.`);
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

  app.replaceChildren(
    header('sprites'),
    el('main', { class: 'editor' },
      el('div', { class: 'left' },
        el('div', { class: 'title-row' }, el('h1', {}, sprite.name), el('p', { class: 'blurb' }, sprite.blurb ?? '')),
        el('div', { class: 'stage-card' }, stageWrap, el('div', { class: 'stage-tools' }, sceneBar, playBtn)),
        el('div', { class: 'under' }, el('span', { class: 'label' }, 'Animation'), clipBar),
        strip,
        cueBox),
      panel,
      el('div', { class: 'get' },
        el('button', { type: 'button', class: 'btn big', onclick: download }, 'Download sprite and sounds'),
        el('button', { type: 'button', class: 'ghost', onclick: copyLink }, 'Copy link'),
        el('div', { class: 'size' }, el('span', { class: 'label' }, 'Pixel size'), sizeBar, sizeNote),
        status)));

  // ---- animation loop
  const ctx = stage.getContext('2d');
  let W = 160, H = 104, zoom = 4, raf = 0, last = performance.now();
  const fit = () => {
    const cw = stageWrap.clientWidth;
    if (!cw) return;
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
    drawStage(ctx, W, H, gy, st.stage, st.scroll);
    const px = Math.round(W * 0.5 - sprite.size[0] / 2 + (sprite.size[0] / 2 - sprite.pivot[0]) * 0.5);
    const py = gy - sprite.pivot[1] - hover(sprite);
    if (st.stage !== 'plain') shadow(ctx, px + sprite.pivot[0], gy, Math.round(sprite.size[0] * 0.17));
    ctx.drawImage(frames.get(st.clip, st.frame), px, py);
    const cells = strip.children;
    for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('on', i === st.frame);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  syncLoops();
  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); clearTimeout(urlTimer);
    window.removeEventListener('sf-audio-ready', syncLoops);
    for (const h of loops) h.stop();
  };
}
