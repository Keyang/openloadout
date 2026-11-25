// The studio's layer editor for backgrounds (build item B19c; docs/data-sprites.md section 6, "Background: layer
// editor"): what the Body tab shows for a `layers` body, in place of the structured tree (All fields still has every
// field). app/studio/v2-editor.js hands it the definition, the drawn sprite and its own pieces (the pictures editor of
// a draw list, commit, the settings being tried) and draws it again after every change.
//   - The scrolling preview: the layers drawn back to front, each slid by the camera times its speed and repeated
//     sideways, Play/Pause, a camera speed slider, a layer's wrap seam marked and put in the middle of the view (two
//     copies side by side). Hidden layers are left out of the preview only (the definition keeps them).
//   - The Time and colour controls, tried live on the preview and the stage (the definition is left as it was); the
//     background's other settings folded under them.
//   - The layers, back to front: show/hide, pick, speed (parallax, tried on the preview while dragged and kept on
//     release), wraps, further back / nearer, copy, remove; Add a layer. The validator's messages about a layer beside it.
//   - The picked layer: its name and label, and its draw list in the pictures editor (B17's rows, item editors,
//     generator picker), handed in by the editor as listSection.
// The changes themselves are app/studio/v2-layers-model.js; nothing here is code from a definition.
import { el, reduceMotion } from '../ui.js';
import { cleanParams, clipFps } from '../../engine/sprite.js';
import { framePicture, drawPicture, pictureScale, shownStyle, sizeScene } from '../art.js';
import * as LM from './v2-layers-model.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const mini = (label, onclick, more = {}) => el('button', { type: 'button', class: 'btn btn-sm', onclick, ...more }, label);

/** The camera speed slider's range and starting value, in sprite pixels a second. */
export const CAMERA_SPEED = Object.freeze({ min: 0, max: 240, step: 10, start: 60 });

/** The state the editor keeps between redraws of the pane (the object it hands in as `ui`), filled in once. */
function settle(ui) {
  ui.hidden ??= new Set();
  ui.camera ??= 0;
  ui.time ??= 0;
  ui.speed ??= CAMERA_SPEED.start;
  ui.playing ??= !reduceMotion.matches;
  ui.seam ??= false;
  ui.cache ??= new Map();
  return ui;
}

/**
 * The layer editor's nodes for the Body tab. Arguments: { def (the definition as it is now), sprite (the last that
 * drew, or null), params (the settings being tried), errors (the validator's messages), stale (the definition has
 * mistakes: the sprite is the last that drew), clip (the clip in hand), sel (the picked item's path key), ui (an object
 * the editor keeps between redraws), listSection (list => the pictures editor's section for a draw list, as
 * v2-model.js itemListsOf gives it), onCommit (def, note), onParams (params: tried, not kept), onPick (layer name),
 * say (text), redraw () }.
 */
export function layersEditor({ def, sprite, params = {}, errors = [], stale = false, clip, sel, ui: keep, listSection, onCommit, onParams, onPick, say = () => {}, redraw = () => {} }) {
  const ui = settle(keep ?? {});
  const rows = LM.layersOf(def);
  if (!rows.length) return el('p', { class: 'pane-note v2-layers' }, 'This background has no layers. Add one under All fields.');
  const picked = LM.pickedLayer(def, { pick: ui.pick, clip, sel });
  const P = rows[picked];
  let tried = params;
  let live = null;            // { index, scroll } while a speed slider is dragged

  // ---- the preview ----
  const cv = el('canvas', { class: 'v2-layers-canvas', role: 'img', 'aria-label': 'The layers scrolling, back to front', 'data-camera': '0', 'data-seams': '', 'data-shown': '' });
  const camNote = el('span', { class: 'quiet small v2-layers-cam num', 'aria-live': 'off' });
  const playBtn = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'layers-play', 'aria-pressed': String(ui.playing), onclick: () => setPlaying(!ui.playing) }, ui.playing ? 'Pause' : 'Play');
  const speedIn = el('input', { type: 'range', class: 'v2-layers-speed', min: CAMERA_SPEED.min, max: CAMERA_SPEED.max, step: CAMERA_SPEED.step, value: String(ui.speed), 'aria-label': 'Camera speed', 'data-k': 'layers-speed' });
  const speedN = el('output', { class: 'v2-layers-speed-n num quiet small' }, `${ui.speed} px a second`);
  speedIn.addEventListener('input', () => { ui.speed = Number(speedIn.value); speedN.textContent = `${ui.speed} px a second`; });
  const seamIn = el('input', { type: 'checkbox', 'data-k': 'layers-seam', checked: ui.seam });
  seamIn.addEventListener('change', () => { ui.seam = seamIn.checked; paint(); });
  const seamMid = mini('Seam to the middle', () => seamToMiddle(), { 'data-act': 'layers-seam-middle', title: `Stop and put the seam of ${P.name} in the middle: the end of one copy beside the start of the next` });
  const note = stale ? el('p', { class: 'quiet small v2-bad' }, sprite ? 'Showing the last version that drew: fix what Check lists to see your changes.' : '') : null;
  const previewSec = el('section', { class: 'v2-list v2-layers-preview', 'aria-label': 'Scrolling preview' },
    el('div', { class: 'st-head' }, el('h3', {}, 'Scrolling preview'), camNote),
    el('div', { class: 'v2-layers-view' }, cv),
    el('div', { class: 'v2-layers-bar' }, playBtn,
      el('label', { class: 'st-lbl v2-layers-speedbox' }, el('span', {}, 'Camera '), speedIn, speedN),
      el('label', { class: 'st-lbl v2-layers-seam' }, seamIn, ` Mark the seam of ${P.name}`), seamMid),
    note,
    sprite ? null : el('p', { class: 'pane-note' }, 'It does not draw yet: fix what Check lists.'));

  /** A layer's frame as a picture in the site's art style (app/art.js), drawn `zoom` CSS pixels a frame pixel; kept per sprite and settings. */
  function framePic(name, f, zoom) {
    const key = JSON.stringify(tried);
    if (ui.cacheSprite !== sprite || ui.cacheKey !== key) { ui.cache = new Map(); ui.cacheSprite = sprite; ui.cacheKey = key; }
    const k = `${name}:${f}:${pictureScale(shownStyle(sprite), zoom, Math.max(...sprite.size))}`;
    if (!ui.cache.has(k)) {
      let c = null;
      try { c = framePicture(sprite, name, f, cleanParams(sprite, tried), { zoom }); } catch { c = null; }
      ui.cache.set(k, c);
    }
    return ui.cache.get(k);
  }

  // the preview is drawn in frame pixels; for a flat picture its canvas is bigger than the frame (app/art.js sizeScene)
  let sized = '';
  /** Draws the preview at the camera as it is now. */
  function paint() {
    if (!sprite) return;
    const [W, H] = sprite.size;
    const style = shownStyle(sprite);
    // CSS pixels a frame pixel where it is shown (the preview is as wide as the pane), a guess before it is on the page
    const zoom = cv.clientWidth > 0 ? cv.clientWidth / W : Math.max(1, Math.min(4, 400 / W));
    const sk = pictureScale(style, zoom, Math.max(W, H));
    const want = `${W}x${H}:${style}:${sk}`;
    if (sized !== want || cv.width !== W * sk || cv.height !== H * sk) { sizeScene(cv, W, H, zoom, style); sized = want; }
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    const shown = [];
    let seams = [];
    const p = cleanParams(sprite, tried);
    for (const r of rows) {
      const c = sprite.clips[r.name];
      if (!c || ui.hidden.has(r.name)) continue;
      const n = Math.max(1, c.frames | 0);
      const fps = n > 1 ? clipFps(sprite, r.name, p) || 8 : 0;
      const f = n > 1 ? Math.floor(ui.time * fps) % n : 0;
      const pic = framePic(r.name, f, zoom);
      if (!pic) continue;
      const scroll = live && live.index === r.index ? live.scroll : r.scroll;
      const off = LM.layerOffset(ui.camera, scroll, W);
      for (const x of LM.copiesFor(off, W, W)) drawPicture(g, pic, x, 0, W, H);
      shown.push(r.name);
      if (r.index === P.index && ui.seam) seams = LM.seamsIn(off, W, W);
    }
    // the seam: a dashed line, dark and light, so it shows on any colour
    for (const x of seams) for (let y = 0; y < H; y += 4) { g.fillStyle = '#000'; g.fillRect(x, y, 1, 2); g.fillStyle = '#fff'; g.fillRect(x, y + 2, 1, 2); }
    cv.dataset.camera = String(Math.round(ui.camera));
    cv.dataset.seams = seams.join(',');
    cv.dataset.shown = shown.join(' ');
    camNote.textContent = `Camera at ${Math.round(ui.camera)} px`;
  }

  let last = 0;
  function tick(now) {
    if (!cv.isConnected || !ui.playing) { ui.raf = 0; return; }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    ui.camera += ui.speed * dt;
    ui.time += dt;
    paint();
    ui.raf = requestAnimationFrame(tick);
  }
  function run() {
    if (ui.raf) cancelAnimationFrame(ui.raf);
    ui.raf = 0;
    last = 0;
    if (ui.playing && sprite) ui.raf = requestAnimationFrame(tick);
  }
  function setPlaying(on) {
    ui.playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(on));
    run();
    paint();
  }
  function seamToMiddle() {
    if (!sprite) return;
    const cam = LM.cameraForSeam(P.scroll, sprite.size[0], sprite.size[0]);
    if (cam === null) { say(`${P.name} does not move (speed 0), so its seam never comes into view.`); return; }
    ui.camera = cam;
    ui.seam = true;
    seamIn.checked = true;
    setPlaying(false);
    say(P.wraps ? `The seam of ${P.name} is in the middle: the end of one copy beside the start of the next.` : `The seam of ${P.name} is in the middle. It does not wrap, so its things are cut at its edges.`);
  }

  // ---- the Time and colour controls, tried live ----
  function tryRows() {
    if (!sprite) return null;
    const keys = LM.liveControlKeys(def);
    const p = cleanParams(sprite, tried);
    const input = (k) => {
      const spec = sprite.params[k];
      if (!spec) return null;
      const lab = spec.label ?? k;
      const set = (v) => { tried = { ...tried, [k]: v }; onParams?.(tried); paint(); };
      let i;
      if (spec.kind === 'range') { i = el('input', { type: 'range', min: spec.min ?? 0, max: spec.max ?? 1, step: spec.step ?? 0.01, value: String(p[k]), 'aria-label': `Try ${lab}`, 'data-try-layer': k, 'data-k': `layers-try-${k}` }); i.addEventListener('input', () => set(Number(i.value))); }
      else if (spec.kind === 'choice') { i = el('select', { class: 'st-select', 'aria-label': `Try ${lab}`, 'data-try-layer': k, 'data-k': `layers-try-${k}` }, (spec.options ?? []).map((o) => { const v = isObj(o) ? o.value : o; return el('option', { value: String(v), selected: String(v) === String(p[k]) }, isObj(o) ? o.label ?? String(v) : String(v)); })); i.addEventListener('change', () => set(i.value)); }
      else if (spec.kind === 'toggle') { i = el('input', { type: 'checkbox', 'aria-label': `Try ${lab}`, 'data-try-layer': k, 'data-k': `layers-try-${k}` }); i.checked = !!p[k]; i.addEventListener('change', () => set(i.checked)); }
      else if (spec.kind === 'color' || spec.kind === 'colour') { i = el('input', { type: 'color', class: 'v2-colour', value: String(p[k]), 'aria-label': `Try ${lab}`, 'data-try-layer': k, 'data-k': `layers-try-${k}` }); i.addEventListener('input', () => set(i.value)); }
      else return null;
      return el('div', { class: 'ctl v2-try' }, el('span', { class: 'ctl-label' }, lab), el('div', { class: 'ctl-body' }, i), el('span'));
    };
    const main = [...keys.time, ...keys.colours].map(input).filter(Boolean);
    const more = keys.other.map(input).filter(Boolean);
    if (!main.length && !more.length) return null;
    return el('section', { class: 'v2-list v2-layers-try', 'aria-label': 'Try the time and colours' },
      el('div', { class: 'st-head' }, el('h3', {}, keys.time.length ? 'Time and colours' : 'Colours'),
        mini('Back to the defaults', () => { tried = {}; onParams?.({}); redraw(); }, { 'data-act': 'layers-defaults' })),
      el('p', { class: 'quiet small' }, 'Tried on the preview and the picture: the background keeps its own defaults.'),
      main.length ? el('div', { class: 'v2-layers-trymain' }, main) : null,
      more.length ? el('details', { class: 'v2-sub' }, el('summary', {}, `Its other settings (${more.length})`), more) : null);
  }

  // ---- the layers, back to front ----
  const keepAs = (next, note) => { if (next) onCommit(next, note); };
  function layerRow(r) {
    const on = r.index === P.index;
    const errs = LM.layerErrors(errors, r.name);
    const show = el('input', { type: 'checkbox', 'aria-label': `Show ${r.name} in the preview`, 'data-k': `layer-show-${r.index}`, checked: !ui.hidden.has(r.name) });
    show.addEventListener('change', () => { if (show.checked) ui.hidden.delete(r.name); else ui.hidden.add(r.name); row.classList.toggle('is-hidden', !show.checked); paint(); });
    const speed = el('input', { type: 'range', min: LM.SCROLL_RANGE[0], max: LM.SCROLL_RANGE[1], step: 0.01, value: String(r.scroll), 'aria-label': `Speed of ${r.name}`, 'data-k': `layer-scroll-${r.index}` });
    const speedN = el('output', { class: 'num v2-layer-speedn' }, r.scroll.toFixed(2));
    const words = el('span', { class: 'quiet small v2-layer-words' }, LM.scrollWords(r.scroll));
    speed.addEventListener('input', () => { const v = Number(speed.value); live = { index: r.index, scroll: v }; speedN.textContent = v.toFixed(2); words.textContent = LM.scrollWords(v); paint(); });
    speed.addEventListener('change', () => { const v = Number(speed.value); live = null; if (v !== r.scroll) keepAs(LM.setScroll(def, r.index, v), `${r.name} now slides at ${v.toFixed(2)} of the camera.`); });
    const wraps = el('input', { type: 'checkbox', 'aria-label': `${r.name} wraps`, 'data-k': `layer-wraps-${r.index}`, checked: r.wraps });
    wraps.addEventListener('change', () => keepAs(LM.setWraps(def, r.index, wraps.checked), wraps.checked ? `${r.name} wraps: things over one edge come back on the other.` : `${r.name} does not wrap: its things are cut at its edges, so its seam can show.`));
    const row = el('div', { class: `v2-layer${on ? ' on' : ''}${ui.hidden.has(r.name) ? ' is-hidden' : ''}${errs.length ? ' has-error' : ''}`, 'data-layer': r.name },
      el('label', { class: 'v2-layer-show', title: 'Show it in the preview' }, show),
      el('button', { type: 'button', class: 'v2-layer-pick', 'aria-pressed': String(on), onclick: () => pick(r.name) },
        el('strong', {}, r.name), r.label ? el('span', { class: 'quiet' }, ` ${r.label}`) : null, el('span', { class: 'quiet small' }, ` · ${plural(r.count, 'thing')}`)),
      el('span', { class: 'v2-layer-speed' }, el('span', { class: 'st-lbl' }, 'Speed '), speed, speedN, words),
      el('label', { class: 'st-lbl v2-layer-wraps' }, wraps, ' Wraps'),
      el('span', { class: 'v2-acts' },
        mini('Back', () => keepAs(LM.moveLayer(def, r.index, r.index - 1), `${r.name} is drawn further back.`), { 'aria-label': `Move ${r.name} further back`, disabled: r.index === 0 }),
        mini('Front', () => keepAs(LM.moveLayer(def, r.index, r.index + 1), `${r.name} is drawn nearer.`), { 'aria-label': `Move ${r.name} nearer`, disabled: r.index === rows.length - 1 }),
        mini('Copy', () => copy(r), { 'aria-label': `Copy the layer ${r.name}`, disabled: rows.length >= LM.LAYER_MOST }),
        mini('Remove', () => remove(r), { 'aria-label': `Remove the layer ${r.name}`, disabled: rows.length <= 1 })),
      errs.length ? el('ul', { class: 'v2-errs' }, errs.map((m) => el('li', {}, m))) : null);
    return row;
  }
  function pick(name) { ui.pick = name; onPick?.(name); redraw(); }
  function copy(r) {
    const next = LM.copyLayer(def, r.index);
    if (!next) { say(`A background has at most ${LM.LAYER_MOST} layers.`); return; }
    ui.pick = next.body.layers[r.index + 1].name;
    onCommit(next, `${r.name} copied as ${ui.pick}.`);
  }
  function remove(r) {
    const next = LM.removeLayer(def, r.index);
    if (!next) { say('A background keeps at least one layer.'); return; }
    ui.hidden.delete(r.name);
    if (ui.pick === r.name) ui.pick = undefined;
    onCommit(next, `The layer ${r.name} removed. Undo brings it back.`);
  }
  function add() {
    const next = LM.addLayer(def);
    if (!next) { say(`A background has at most ${LM.LAYER_MOST} layers.`); return; }
    ui.pick = next.body.layers.at(-1).name;
    onCommit(next, `The layer ${ui.pick} added in front: change its things below.`);
  }
  const listSec = el('section', { class: 'v2-list v2-layers-list', 'aria-label': 'The layers' },
    el('div', { class: 'st-head' }, el('h3', {}, 'Layers, back to front'),
      mini('Add a layer', () => add(), { 'data-act': 'add-layer', disabled: rows.length >= LM.LAYER_MOST })),
    el('p', { class: 'quiet small' }, 'Speed is how far a layer slides for each pixel the camera moves: far layers slowly, near ones faster. A layer that wraps repeats sideways with no seam.'),
    rows.map(layerRow));

  // ---- the picked layer: its name, label and things ----
  function nameBox() {
    const box = el('input', { type: 'text', class: 'st-text', value: P.name, maxlength: 40, 'aria-label': `Name of the layer ${P.name}`, 'data-k': 'layer-name' });
    const keepName = () => {
      const v = box.value.trim();
      if (v === P.name) return;
      const next = LM.renameLayer(def, P.index, v);
      if (!next) { say('A layer name is one lowercase word (letters, digits and dashes) that no other layer has.'); box.value = P.name; return; }
      if (ui.hidden.delete(P.name)) ui.hidden.add(v);
      ui.pick = v;
      onCommit(next, `The layer is called ${v} now (its clip too).`);
    };
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); keepName(); } });
    box.addEventListener('change', keepName);
    return box;
  }
  function labelBox() {
    const box = el('input', { type: 'text', class: 'st-text', value: P.label ?? '', maxlength: 60, placeholder: 'Far', 'aria-label': `Label of the layer ${P.name}`, 'data-k': 'layer-label' });
    const keepLabel = () => { if (box.value.trim() !== (P.label ?? '')) keepAs(LM.setLabel(def, P.index, box.value), 'Label kept.'); };
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); keepLabel(); } });
    box.addEventListener('change', keepLabel);
    return box;
  }
  const list = { path: ['body', 'layers', P.index, 'draw'], label: `What ${P.name} draws`, place: 'draw', word: `Layer "${P.name}", item` };
  const pickedSec = el('section', { class: 'v2-list v2-layer-detail', 'data-layer': P.name },
    el('div', { class: 'st-head' }, el('h3', {}, `Layer "${P.name}"`), el('span', { class: 'quiet small' }, `${LM.scrollWords(P.scroll)}${P.wraps ? ', wraps' : ', does not wrap'}`)),
    el('div', { class: 'v2-layer-names' },
      el('label', { class: 'st-lbl' }, el('span', {}, 'Name '), nameBox()),
      el('label', { class: 'st-lbl' }, el('span', {}, 'Label '), labelBox())),
    LM.layerErrors(errors, P.name).length ? el('ul', { class: 'v2-errs' }, LM.layerErrors(errors, P.name).map((m) => el('li', {}, m))) : null);
  const things = Array.isArray(def.body.layers[P.index]?.draw) && listSection ? listSection(list) : null;

  // draw the preview once the nodes are in the page, then keep it moving while it plays
  queueMicrotask(() => { paint(); run(); });
  return el('div', { class: 'v2-layers', 'data-picked': P.name }, previewSec, tryRows(), listSec, pickedSec, things);
}
