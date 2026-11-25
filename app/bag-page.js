// The bag page (#/bag): the library's list view with only the visitor's things (docs/site-design.md, section 5). A row
// per item: its picture as it was changed (with the bag's look), what was changed and how many things, its pixel size.
// Clicking a row opens the editing panel (app/panel.js) beside the list, editing that item where it is, with no trip to
// another page. One Download for everything; the bag's look; its link; the warning when the browser will not keep it.
import { assetById, spriteNow, loadSprites, onCatalogChange } from './catalog.js';   // W2-G: which sprites exist comes from the catalogue; their programs are loaded when the bag needs them
import { defaultParams, cleanParams, clipFps } from '../engine/sprite.js';
import { artStyleOf, stylesOf, styleById } from '../engine/styles.js';   // W6-A: an item is shown in its art style (Contract 12)
import { spriteLook } from '../engine/theme.js';
import { framePicture, sizeScene } from './art.js';      // pixel art crisp, a flat picture smooth (the header's art style)
import { applySound, themedSoundParams, soundSettingsFor } from '../sound/theme.js';
import { el, header, saveBlob, reduceMotion } from './ui.js';
import { itemEditor, changesOf } from './bag-edit.js';
import { surpriseButton, duplicateButton, removeButton, pageLink, playLink, playButton, setPlaying } from './row-tools.js';
import { listFilter, typeOf } from './list-filter.js';
import { soundById, soundParams, rendered, renderAsync, playRendered, playLive, drawWave } from './audio.js';
import { bag, LINK_LIMIT, NOT_KEPT, lookOf, themeFor, linkProblem } from './bag.js';
import { THEME_PRESETS } from '../engine/theme.js';
import { restoreRuntime, madeItemState } from './api.js';      // W5-A, W5-B: what the bag holds that was made on a visit is checked again, off the page, before it is shown
import { packageFiles, defaultCues, activeTheme, kindMatches } from './bundle.js';
import { zip } from './zip.js';
import { themeControls } from './theme-controls.js';   // W2-D2
import { spriteChanges, soundChanges, inWords, packageWords } from './changes.js';   // what was changed, in plain words

const INK = '#231b33', SHELF = '#f5f5f3', QUIET = '#b9b9b4';
const KIND_LABEL = { sprite: 'Sprite', sound: 'Sound', music: 'Music' };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- "Change": the asset's own page with these settings, in update mode ------------

/** Sprite sounds in the sprite page's link format: { clip: [[sound, frame, style, volume, changes, when?], ...] }. */
function packCues(cues) {
  const out = {};
  for (const [clip, list] of Object.entries(cues)) out[clip] = list.map((c) => { const r = [c.sound, c.frame, c.preset ?? 0, c.volume ?? 1, c.params ?? 0]; if (c.when) r.push(c.when); return r; });
  return JSON.stringify(out);
}

/** Each asset's standard settings, so bag links can leave them out (bag.toLink). */
function standardSettings(kind, id, settings) {
  if (kind === 'sprite') { const sprite = spriteNow(id); return sprite ? { params: defaultParams(sprite), cues: defaultCues(sprite), artStyle: stylesOf(sprite)[0] } : null; }
  const patch = soundById[id];
  return patch ? { params: soundParams(patch, settings && settings.style) } : null;
}
bag.setStandard(standardSettings);

/** The address of an item's page, carrying its settings and `bag=<key>`. */
export function changeLink(item) {
  const s = item.settings ?? {}, q = new URLSearchParams();
  if (item.kind === 'sprite') {
    const sprite = spriteNow(item.id);
    if (sprite) {
      const def = defaultParams(sprite), p = cleanParams(sprite, s.params ?? {});
      for (const [k, v] of Object.entries(p)) if (v !== def[k]) q.set(k, String(v));
      if (s.cues && !same(s.cues, plainCues(defaultCues(sprite)))) q.set('sfx', packCues(s.cues));
    }
    if (s.scale && s.scale !== 1) q.set('scale', String(s.scale));
    if (sprite && s.artStyle && artStyleOf(sprite, s.artStyle) !== stylesOf(sprite)[0]) q.set('artstyle', s.artStyle);      // (one that follows the site's art style names none)
  } else {
    const patch = soundById[item.id];
    if (patch) {
      const p = soundParams(patch, s.style, s.params);
      if (s.style) q.set('style', s.style);
      if (!same(p, soundParams(patch, s.style))) for (const d of patch.params) q.set(d.id, String(p[d.id]));
    }
    if (item.kind === 'sound' && s.seed && s.seed !== 1) q.set('seed', String(s.seed));
  }
  if (lookOf(s)) q.set('artlook', lookOf(s));      // its own look (the Look tab): the page opens wearing it
  q.set('bag', item.key);
  return `#/${item.kind}/${item.id}?${q}`;
}
const plainCues = (cues) => Object.fromEntries(Object.entries(cues).map(([k, l]) => [k, l.map(({ sound, frame, preset, params, volume, when }) => (when ? { sound, frame, preset, params, volume, when } : { sound, frame, preset, params, volume }))]));

// ---- pictures ------------------------------------------------------------------

/** An animated sprite tile drawn with the item's settings and the bag's theme. */
function spritePicture(sprite, settings, theme) {
  const tile = el('canvas', { class: 'tile', width: 80, height: 72, role: 'img', 'aria-label': `${sprite.name}, as you set it up` });
  const p = cleanParams(sprite, settings.params ?? {});
  const clip = sprite.preview, pictures = new Map(), start = performance.now();
  // in the item's art style (the site's when it names none): pixel art on the frame's grid, crisp; a vector style (flat)
  // drawn at the size it is shown, smooth, on a tile with a backing store for the screen (app/art.js)
  const style = artStyleOf(sprite, settings.artStyle), vector = (styleById(style)?.pictureScale ?? 1) > 1;
  if (vector) sizeScene(tile, 80, 72, 1, style);
  const record = lookOf(settings) ? undefined : settings.lookParams;      // the bag's record of its look is not this item's when it has a look of its own
  let zoom = 4;       // CSS px a frame px the frames are drawn for (a vector picture's size; known once what is drawn is)
  // looks: drawn from what the bag recorded its look made of the sprite (Contract 7, "The record")
  // grid: the frame-size grid, which says where a vector frame draws
  const picture = (f, grid = false) => {
    const id = `${f}|${grid}`;
    let pic = pictures.get(id);
    if (!pic) {
      pic = framePicture(sprite, clip, f, p, { style, theme, record, grid, zoom: Math.max(2, zoom) });
      pictures.set(id, pic);
    }
    return pic;
  };
  const g = tile.getContext('2d');
  const c = sprite.clips[clip], fps = clipFps(sprite, clip, p);
  let last = -1, box = null;
  /** The smallest box that holds every drawn pixel of every frame of the clip, in frame pixels: { x, y, w, h }. */
  function drawnBox() {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let f = 0; f < c.frames; f++) {
      const cv = picture(f, vector).canvas, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const [fw, fh] = sprite.size;
    if (x1 < 0) return { x: 0, y: 0, w: fw, h: fh };
    // (a vector picture's soft edge reaches a little past the grid's pixels)
    if (vector) { x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(fw - 1, x1 + 1); y1 = Math.min(fh - 1, y1 + 1); }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  // W5-B: a sprite made on a visit is drawn in a worker and its frames arrive later: what was drawn meanwhile is dropped then
  const offFrames = typeof sprite.onFrames === 'function' ? sprite.onFrames(() => { pictures.clear(); last = -1; box = null; }) : null;
  return {
    node: tile,
    stop() { if (offFrames) offFrames(); },
    tick(now) {
      let f = 0;
      if (!reduceMotion.matches) {
        const n = Math.floor(((now - start) / 1000) * fps);
        f = c.loop ? n % c.frames : Math.min(c.frames - 1, n % (c.frames + Math.round(fps * 0.6)));
      }
      if (f === last) return;
      last = f;
      // on the shelf, at the largest whole-number size that fits (a big one is cut to the tile, never squeezed; a vector
      // one is fitted to it, smooth at any size)
      // only the part of the frame that is ever drawn on (over the whole animation, so it does not jump), so a small
      // thing in a big frame is shown large
      const b = (box ??= drawnBox());
      const k = vector ? Math.min(4, 76 / b.w, 68 / b.h) : Math.max(1, Math.min(4, Math.floor(Math.min(76 / b.w, 68 / b.h))));
      zoom = k;
      const pic = picture(f), q = pic.k;
      g.fillStyle = SHELF; g.fillRect(0, 0, 80, 72);
      g.imageSmoothingEnabled = q > 1;
      if (q > 1) g.imageSmoothingQuality = 'high';
      g.drawImage(pic.canvas, b.x * q, b.y * q, b.w * q, b.h * q, Math.round((80 - b.w * k) / 2), Math.round((72 - b.h * k) / 2), b.w * k, b.h * k);
    },
  };
}

/** A sound effect: its waveform, and a button that plays it with its settings and the theme. */
function soundPicture(patch, settings, theme) {
  const tile = el('canvas', { class: 'tile', width: 80, height: 72, 'aria-hidden': 'true' });
  const t = activeTheme(theme);
  const params = soundParams(patch, settings.style, settings.params);
  let r = null, handle = null, dirty = true, held = false;      // held: it shows the picture it had before, until the new waveform is ready
  const make = () => {
    if (!r) {
      const raw = rendered(patch, t ? themedSoundParams(patch, params, t) : params, settings.seed ?? 1);
      r = t ? applySound(raw, soundSettingsFor(patch, t)) : raw;
    }
    return r;
  };
  const timer = setTimeout(() => { try { make(); dirty = true; } catch (e) { held = false; console.error(`sound ${patch.id}:`, e); } }, 0);
  const btn = playButton(patch.name);
  const sync = () => setPlaying(btn, handle ? 'stop' : 'play', patch.name);
  btn.addEventListener('click', () => {
    if (handle) { handle.stop(); handle = null; sync(); dirty = true; return; }
    handle = playRendered(make(), { force: true, loop: !!patch.loop, onended: () => { handle = null; sync(); dirty = true; } });
    sync(); dirty = true;
  });
  const g = tile.getContext('2d');
  return {
    node: el('div', { class: 'bag-pic' }, tile, btn),
    stop() { clearTimeout(timer); if (handle) handle.stop(); },
    hold() { held = true; },
    tick() {
      if (held && !r) return;
      if (!dirty && !handle) return;
      dirty = false;
      g.fillStyle = SHELF; g.fillRect(0, 0, 80, 72);
      g.fillStyle = 'rgba(35, 27, 51, 0.12)'; g.fillRect(8, 36, 64, 1);
      if (r) {
        const played = handle ? Math.floor((((handle.now() - handle.startedAt) / handle.duration) % 1) * 64) : -1;
        drawWave(g, r.samples, 8, 36, 64, 44, INK, played, QUIET);
      }
    },
  };
}

/** A music track: a button that plays it live with its settings and the theme's tempo, key and intensity. */
function musicPicture(patch, settings, theme) {
  const tile = el('canvas', { class: 'tile', width: 80, height: 72, 'aria-hidden': 'true' });
  const params = themedSoundParams(patch, soundParams(patch, settings.style, settings.params), theme);
  let voice = null, starting = false, gone = false, dirty = true;
  const btn = playButton(patch.name);
  // ==== W2-D2: music under a look that changes brightness ====
  // Live play can follow speed, key and intensity but not brightness, so then the rendered loop is
  // played with the look applied (applySound): what is heard is what the download holds.
  const rendersFirst = soundSettingsFor(patch, theme).brightness !== 0;
  const sync = () => { setPlaying(btn, starting ? 'busy' : voice ? 'stop' : 'play', patch.name); dirty = true; };
  const playLoop = async () => {
    const r = await renderAsync(patch, { ...params });
    if (!gone && starting) { const h = playRendered(rendersFirst ? applySound(r, soundSettingsFor(patch, theme)) : r, { force: true, loop: true }); voice = h && { stop: () => h.stop() }; }
  };
  btn.addEventListener('click', async () => {
    if (voice) { voice.stop(); voice = null; sync(); return; }
    if (starting) return;
    starting = true; sync();
    try {
      if (rendersFirst) await playLoop();
      else {
        try {
          const v = await playLive(patch, { ...params });
          if (gone || !starting) v.stop(); else voice = v;
        } catch {
          await playLoop();   // no live audio here: play the rendered loop instead
        }
      }
    } catch (e) { console.error(`music ${patch.id}:`, e); }
    starting = false; sync();
  });
  // ==== end W2-D2 ====
  const g = tile.getContext('2d');
  return {
    node: el('div', { class: 'bag-pic' }, tile, btn),
    stop() { gone = true; starting = false; if (voice) voice.stop(); voice = null; },
    tick() {
      if (!dirty) return;
      dirty = false;
      g.fillStyle = SHELF; g.fillRect(0, 0, 80, 72);
      // a pixel note, bouncing while it plays
      const y = voice ? 2 * Math.round(Math.sin(performance.now() / 120)) : 0;
      g.fillStyle = INK;
      g.fillRect(44, 18 + y, 3, 28); g.fillRect(47, 18 + y, 10, 3); g.fillRect(54, 21 + y, 3, 6);
      g.fillRect(34, 42 + y, 12, 9);
      g.fillStyle = SHELF; g.fillRect(36, 44 + y, 8, 5);
      if (voice) dirty = true;
    },
  };
}

// ---- the page ----------------------------------------------------------------------

/**
 * What a row says about its item, in plain words: what was changed (at most three things, then how many more),
 * built from each control's own words (app/changes.js). Returns { text, all }: `all` lists every change, for the row's tooltip.
 */
function describe(item, theme = null) {
  const s = item.settings ?? {};
  let changes = [], parts;
  if (item.kind === 'sprite') {
    const sprite = spriteNow(item.id);
    // looks: under a look that also changes shapes, the row says what the sprite is really drawn with (Contract 7)
    const used = sprite && theme ? spriteLook(sprite, s.params ?? {}, theme, { record: lookOf(s) ? undefined : s.lookParams }) : null;
    if (sprite) changes = spriteChanges(sprite, used ? used.params : s.params ?? {});
    const style = sprite ? artStyleOf(sprite, s.artStyle) : null;
    // (what it is as it comes is left unsaid: "look" means a colour look such as Night, and only a change is named)
    parts = [changes.length ? inWords(changes) : null, used && used.changed.length ? 'shapes changed by the bag\'s look' : null, s.artStyle && style !== stylesOf(sprite)[0] ? `${styleById(style).label} style` : null, s.scale > 1 ? `pixel size ${s.scale}×` : null];
  } else {
    const patch = soundById[item.id];
    if (patch) changes = soundChanges(patch, s.style, soundParams(patch, s.style, s.params));
    parts = [s.style ? `${s.style} version` : null, changes.length ? inWords(changes).toLowerCase() : null];
  }
  // an item that wears a look of its own, whatever the bag's look is, says which
  const own = lookOf(s);
  if (own) parts.push(own === 'original' ? 'keeps its own colours' : `${THEME_PRESETS.find((p) => p.id === own).name} look`);
  const text = parts.filter(Boolean).join(', ');
  return { text: text ? text[0].toUpperCase() + text.slice(1) : 'No changes yet', all: changes.length > 3 ? inWords(changes, changes.length) : null };
}

export function bagPage(app, query = {}, isCurrent = () => true) {
  document.title = 'Your bag · Loadout';
  // ==== W2-G: sprite objects are loaded when the bag first shows them (app/catalog.js) ====
  // asked: sprites sent for; lost: ones whose file did not load (shown as missing). here(): false once the page is left.
  const asked = new Set(), lost = new Set();
  let left = false;
  const here = () => !left && isCurrent();
  // W5-A: an item made on a visit whose definition is still being brought back is on its way too, not missing
  // W5-B: an item made on a visit is "checking" until it has been loaded and checked again in a worker; one that fails "needs re-making"
  const pendingMade = (item) => madeItemState(item)?.state === 'checking';
  const remake = (item) => { const st = madeItemState(item); return st && st.state === 'needs re-making' ? st : null; };
  const pendingSprite = (item) => pendingMade(item) || (item.kind === 'sprite' && kindMatches(item.kind, item.id) && !spriteNow(item.id) && !lost.has(item.id));
  function fetchSprites(items) {
    const ids = [...new Set(items.filter((i) => pendingSprite(i) && !pendingMade(i)).map((i) => i.id))].filter((id) => !asked.has(id));
    if (!ids.length) return;
    for (const id of ids) asked.add(id);
    loadSprites(ids).then((got) => {
      for (const id of ids) { asked.delete(id); if (!got[id]) lost.add(id); }
      if (here()) build();       // late: the visitor may have gone elsewhere, and then nothing is drawn
    });
  }
  // ==== end W2-G ====
  let pictures = [], raf = 0, confirming = false, busy = false;
  const status = el('p', { class: 'status', role: 'status' });
  // What a status line says is about the bag as it was then ("Link copied", "Opened a shared bag", "Downloaded …"): once
  // the bag holds something else, it no longer applies and goes (build() clears it).
  // (what the look recorded of a sprite is filled in as its program arrives: that is not the bag changing)
  const bagNow = () => JSON.stringify([bag.items().map((i) => { const { lookParams, ...rest } = i.settings ?? {}; return [i.key, rest]; }), bag.theme()]);
  let statusFor = '', noteFor = '';
  const say = (msg) => { status.textContent = msg; statusFor = bagNow(); };
  const linkNote = el('p', { class: 'bag-link-note', role: 'status' });
  const noted = () => { noteFor = bagNow(); };

  // A shared bag arrived in the address.
  let offer = null;
  if (query.load) {
    const peek = bag.peekLink(query.load);
    if (!peek) { linkNote.textContent = 'That bag link is damaged, so nothing was added.'; noted(); }
    // W5-A: a sprite made on someone's visit is a small program. It is not run until the visitor says so.
    else if (peek.code) offer = { text: query.load, count: peek.count, code: peek.code, alone: !bag.count() };
    else if (!bag.count()) {
      const n = bag.fromLink(query.load);
      linkNote.textContent = `Opened a shared bag with ${n} item${n === 1 ? '' : 's'}.`;
      noted();
    } else offer = { text: query.load, count: peek.count };
    history.replaceState(null, '', '#/bag');
  }
  // what the last row action did, shown next to that row: { key | at, text }
  let flash = null;

  // The page: the list on the left (rebuilt whenever the bag changes), the editing panel on the right (kept while its item is there).
  const list = el('div', { class: 'bag-main' });
  const side = el('aside', { class: 'bag-side', hidden: true, 'aria-label': 'Change the chosen item' });
  const main = el('main', { class: 'v2 bag-page' }, list, side);
  app.replaceChildren(header('bag'), main);

  // ---- the editing panel beside the list: one bag item, edited where it is (app/bag-edit.js)
  let open = null;      // { key, editor, head }
  // Where there is no room for two columns the panel covers the page (css/bag.css): what is behind it then cannot be
  // reached with the keyboard or read out, until the panel is closed.
  const covers = window.matchMedia('(max-width: 1000px)');
  const behind = (on) => {
    const hide = on && covers.matches;
    for (const n of [list, app.querySelector('header.top')]) if (n) n.inert = hide;
  };
  const onResize = () => { behind(!!open); fitSide(); };
  covers.addEventListener('change', onResize);
  // Beside the list the panel fills the window below whatever of the header is still in view, so its footer is never
  // below the window's edge, whether the page is scrolled or not.
  let fitting = 0;
  function fitSide() {
    if (!open || covers.matches) { side.style.height = ''; return; }
    side.style.height = `${Math.round(window.innerHeight - Math.max(0, main.getBoundingClientRect().top))}px`;
  }
  const onScroll = () => { if (!fitting && open) fitting = requestAnimationFrame(() => { fitting = 0; fitSide(); }); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  // An open panel is a step of its own for the browser's Back: Back closes it and stays on the bag, a second Back leaves.
  // (The address stays #/bag; the step carries the item's key, so coming back to it opens the same panel.)
  const ours = () => !!(history.state && history.state.bagPanel);
  let popping = false;      // a Back asked for by closing the panel by hand, not yet arrived
  function closePanel({ focus = false, pop = true } = {}) {
    if (!open) return;
    if (side.contains(document.activeElement)) focus = true;
    const key = open.key;
    open.editor.close();
    open = null;
    if (pop && ours() && !popping) { popping = true; history.back(); }      // closed by hand: the step that opened it goes too
    side.hidden = true; side.replaceChildren();
    main.classList.remove('has-panel');
    side.style.height = '';
    behind(false);
    for (const li of list.querySelectorAll('.bag-item[aria-current]')) li.removeAttribute('aria-current');
    if (focus) (list.querySelector(`.bag-item[data-key="${key}"] .bag-open`) ?? list.querySelector('.bag-open, a, button'))?.focus();
  }
  function openPanel(key, { step = true } = {}) {
    if (open && open.key === key) return;
    const item = bag.get(key);
    if (!item) return;
    const asset = item.kind === 'sprite' ? spriteNow(item.id) : soundById[item.id];
    if (!asset || !kindMatches(item.kind, item.id) || remake(item)) return;
    // the row that was clicked stays where it was on screen, although the list beside the panel is narrower
    const rowAt = (k) => list.querySelector(`.bag-item[data-key="${k}"]`)?.getBoundingClientRect().top ?? null;
    const was = rowAt(key);
    const wasOpen = !!open;
    closePanel({ pop: false });
    const pageLink = el('a', { class: 'btn btn-sm btn-secondary', href: changeLink(item), onclick: (e) => { editor.edit.flush(); e.currentTarget.setAttribute('href', changeLink(bag.get(key) ?? item)); } }, 'Open its page');
    const head = el('div', { class: 'bag-side-head' },
      el('div', { class: 'bag-side-title' }, el('h2', { class: 'h4', tabindex: '-1' }, asset.name), el('span', { class: 'quiet' }, KIND_LABEL[item.kind])),
      pageLink,
      el('button', { type: 'button', class: 'icon-btn bag-side-close', 'aria-label': 'Close the panel', onclick: () => closePanel({ focus: true }) }, '×'));
    const editor = itemEditor(item, asset, { head, onCopyLink: copyBagLink });
    // the way to its page carries the item as it is now (its look too)
    const offLink = editor.edit.onChange(() => { const now = bag.get(key); if (now) pageLink.setAttribute('href', changeLink(now)); });
    const shut = editor.close;
    editor.close = () => { offLink(); shut(); };
    open = { key, editor, head };
    side.replaceChildren(editor.node);
    side.hidden = false;
    main.classList.add('has-panel');
    behind(true);
    // (while a Back asked for by a close is still on its way, the new step is added once it has arrived: see onPop)
    if (step && !popping) { if (wasOpen && ours()) history.replaceState({ bagPanel: key }, ''); else history.pushState({ bagPanel: key }, ''); }
    for (const li of list.querySelectorAll('.bag-item')) { if (li.dataset.key === key) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current'); }
    const now = rowAt(key);
    if (was !== null && now !== null && Math.abs(now - was) > 1 && !covers.matches) window.scrollBy(0, now - was);
    fitSide();
    head.querySelector('h2').focus({ preventScroll: true });      // the keyboard goes into the panel; closing it gives it back to the row
  }
  // Back (or Forward) to a step: the panel that step had open, or none
  const onPop = () => {
    if (popping) { popping = false; if (open) history.pushState({ bagPanel: open.key }, ''); return; }
    const want = history.state && history.state.bagPanel;
    if (want && bag.get(want)) { if (!open || open.key !== want) openPanel(want, { step: false }); }
    else closePanel({ pop: false, focus: !!open });
  };
  window.addEventListener('popstate', onPop);
  const onKey = (e) => { if (e.key === 'Escape' && open && !e.defaultPrevented && !side.querySelector('.menu:not([hidden])')) closePanel({ focus: true }); };
  document.addEventListener('keydown', onKey);

  // ==== W2-D2: the bag's look, with the same controls as a kit's page (app/theme-controls.js) ====
  // Changing it sets bag.setTheme, and the page rebuilds its pictures with it. Sliders report when let go, and
  // focus is put back after the rebuild. The controls follow the bag when it changes elsewhere (a shared link, another tab).
  const look = themeControls({ theme: bag.theme(), live: false, open: false, title: 'Give everything a look', onChange: (t) => { const f = document.activeElement; bag.setTheme(t); if (f && lookBox.contains(f) && document.activeElement !== f) f.focus(); } });
  const lookBox = el('section', { class: 'bag-look' }, look.node);
  const offLook = bag.onChange(() => { if (!main.isConnected) offLook(); else look.set(bag.theme()); });
  // ==== end W2-D2 ====

  function offerBox() {
    if (!offer) return null;
    const take = (mode) => {
      const n = bag.fromLink(offer.text, { mode });
      const alone = offer.alone;
      offer = null;
      linkNote.textContent = n === null ? 'That bag link is damaged, so nothing was added.' : alone ? `Opened a shared bag with ${n} item${n === 1 ? '' : 's'}.` : mode === 'add' ? `Added ${n} item${n === 1 ? '' : 's'} from the shared bag.` : `Your bag now holds the shared bag's ${n} item${n === 1 ? '' : 's'}.`;
      noted();
      build();
    };
    const ignore = el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { offer = null; build(); } }, 'Ignore the link');
    // W5-B: what is true now, in plain words: it holds something a helper made, and that is checked in a closed box before anything of it is shown
    const made = offer.code ? el('p', {}, `${offer.code === 1 ? 'One of them was' : `${offer.code} of them were`} made by whoever shared the link, with a helper, and ${offer.code === 1 ? 'is' : 'are'} not from this site. ${offer.code === 1 ? 'It is' : 'They are'} checked in a closed box before anything of ${offer.code === 1 ? 'it' : 'them'} is shown. Open the bag only if you trust who sent it.`) : null;
    if (offer.alone) return el('div', { class: 'bag-offer' },
      el('p', {}, `This link holds a bag with ${offer.count} item${offer.count === 1 ? '' : 's'}.`), made,
      el('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => take('replace') }, 'Open the bag'), ignore);
    return el('div', { class: 'bag-offer' },
      el('p', {}, `This link holds a bag with ${offer.count} item${offer.count === 1 ? '' : 's'}. Your own bag already has things in it.`), made,
      el('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => take('add') }, 'Add them to my bag'),
      el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => take('replace') }, 'Replace my bag'), ignore);
  }

  const removeBtn = (item, name) => removeButton(name ? `Remove ${name}` : 'Remove', () => {
    if (name) flash = { at: bag.items().findIndex((i) => i.key === item.key), text: `Removed ${name}.` };
    bag.remove(item.key);
  });

  // the whole row opens the panel (its picture, its words, the space between); the row's button is what the keyboard and
  // a screen reader use. Its own buttons and links (Play, Open its page, Remove) do what they say instead.
  function picBox(pic) {
    const box = pic.node.matches('canvas') ? el('div', { class: 'bag-pic' }, pic.node) : pic.node;
    box.classList.add('opens');
    return box;
  }
  const opensRow = (li, key) => {
    li.classList.add('opens');
    li.addEventListener('click', (e) => { if (!e.target.closest('a, button:not(.bag-open), input, label, summary, details') && !getSelection().toString()) openPanel(key); });
    return li;
  };

  function row(item, theme) {
    const sprite = item.kind === 'sprite' ? spriteNow(item.id) : null;
    const patch = item.kind !== 'sprite' ? soundById[item.id] : null;
    const pending = pendingSprite(item);      // W2-G: its own file is on its way; the row is drawn again when it arrives
    // a crafted link can name a sound as music (or the reverse): such an item is treated as missing
    const gone = !pending && (!kindMatches(item.kind, item.id) || (item.kind === 'sprite' && !sprite));
    let pic = null;
    // W5-B: it did not pass when it was checked again (or took too long): it is named, with why, and nothing of it is drawn
    const again = remake(item);
    if (again) return el('li', { class: 'bag-item remake', 'data-key': item.key },
      el('div', { class: 'bag-pic gone tile' }),
      el('div', { class: 'bag-text' },
        el('span', { class: 'bag-name' }, again.name && again.name !== item.id ? `${again.name} (${item.id})` : item.id),
        el('span', { class: 'bag-kind' }, KIND_LABEL[item.kind]),
        el('span', { class: 'hint' },
          el('strong', {}, 'Needs re-making. '),
          again.say ?? (item.from === 'link' ? 'This came broken from the link. Ask the sender for a new one.' : 'This was kept from an earlier visit and is broken now. Make it again, or remove it.'),
          ' It is not shown and will be left out of the download.'),
        // what the check found is for whoever can re-make it, so it stays folded away
        again.reason ? el('details', { class: 'hint remake-why' }, el('summary', {}, 'Details'), again.reason) : null),
      el('div', { class: 'bag-actions' }, removeBtn(item)));
    if (pending) return el('li', { class: 'bag-item', 'data-key': item.key },
      el('div', { class: 'bag-pic pending tile' }),
      el('div', { class: 'bag-text' }, el('span', { class: 'bag-name' }, assetById(item.id)?.name ?? item.id), el('span', { class: 'bag-kind' }, KIND_LABEL[item.kind]), el('span', { class: 'hint' }, pendingMade(item) ? 'Checking… It was made on a visit, so it is checked again before it is shown.' : 'Loading…')),
      el('div', { class: 'bag-actions' }, removeBtn(item)));
    if (!gone && sprite) pic = spritePicture(sprite, item.settings, theme);
    else if (!gone) pic = item.kind === 'music' ? musicPicture(patch, item.settings, theme) : soundPicture(patch, item.settings, theme);
    if (pic) pictures.push(pic);
    const name = sprite?.name ?? patch?.name ?? item.id;
    const said = gone ? null : describe(item, theme);
    const playBtn = pic && !pic.node.matches('canvas') ? pic.node.querySelector('button.play') : null;
    const words = [
      el('span', { class: 'bag-name' }, name),
      el('span', { class: 'bag-kind' }, KIND_LABEL[item.kind]),
      el('span', { class: 'hint', title: said && said.all ? said.all : null }, gone ? (item.definition ? 'This was made on another visit and could not be brought back. It will be left out of the download.' : 'This is no longer on the site and will be left out of the download.') : said.text),
    ];
    // how much was changed (the change dot and a count, as in the panel's footer), and the size it will be downloaded at
    const n = gone ? 0 : changesOf(item, sprite ?? patch);
    const scale = item.settings?.scale ?? 1;
    const facts = gone ? null : el('div', { class: 'bag-facts' },
      // (an unchanged one says so once, in its words beside the name: "Standard look")
      n ? el('span', { class: 'bag-changes is-changed' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), `${n} ${n === 1 ? 'change' : 'changes'}`) : null,
      sprite ? el('span', { class: 'bag-size num' }, `${sprite.size[0] * scale} × ${sprite.size[1] * scale}`, el('small', {}, ` pixel size ${scale}×`)) : null);
    const li = el('li', { class: 'bag-item' + (gone ? ' is-gone' : ''), 'data-key': item.key, 'aria-current': open && open.key === item.key ? 'true' : null },
      pic ? picBox(pic) : el('div', { class: 'bag-pic gone tile' }),
      gone ? el('div', { class: 'bag-text' }, words)
        : el('button', { type: 'button', class: 'bag-text bag-open', 'aria-label': `Change ${name}`, 'aria-haspopup': 'true', onclick: () => openPanel(item.key) }, words),
      facts,
      flash && flash.key === item.key ? el('span', { class: 'row-note', role: 'status' }, flash.text) : null,
      el('div', { class: 'bag-actions' },
        playBtn,      // a sound's or a track's Play: beside its picture, never on it
        gone ? null : surpriseButton(item, sprite ?? patch, name),      // a random version of it, at once (the bag's change rebuilds the row)
        gone ? null : pageLink(changeLink(item), name),
        gone ? null : playLink(item, name),
        // the copy goes right after the original; the note goes on the new row
        gone ? null : duplicateButton(item, name, { onDone: (key) => { flash = { key, text: `Duplicated ${name}.` }; build(); } }),
        removeBtn(item, name)));
    return gone ? li : opensRow(li, item.key);
  }

  // ---- export: one Download for everything
  const zipChoice = el('input', { type: 'radio', name: 'package', value: 'zip', id: 'pkg-zip', checked: true });
  const unityChoice = el('input', { type: 'radio', name: 'package', value: 'unity', id: 'pkg-unity', disabled: true });
  const dlBtn = el('button', { type: 'button', class: 'btn btn-primary', onclick: download }, 'Download');
  const exportBox = el('section', { class: 'bag-export', 'aria-label': 'Download everything' },
    el('div', { class: 'bag-export-words' },
      el('h2', { class: 'h5' }, 'Download everything'),
      el('p', { class: 'quiet' }, 'One zip with every sprite sheet, sound and music track in your bag, a list of what is in it, and a short guide. It works in Unity, Godot and web games.')),
    el('fieldset', { class: 'bag-choice' },
      el('legend', { class: 'sr' }, 'Package'),
      el('label', { for: 'pkg-zip' }, zipChoice, ' Zip package'),
      el('label', { for: 'pkg-unity', class: 'soon' }, unityChoice, ' Unity package (coming later)')),
    el('a', { class: 'btn btn-secondary play-try', href: '#/play' }, 'Try these in the playground'),   // W2-E: the playground (app/play-page.js)
    dlBtn,
    status);
  const exportable = () => bag.items().filter((i) => kindMatches(i.kind, i.id) && !lost.has(i.id) && !remake(i)).length;
  const syncDownload = () => {
    const n = exportable();
    dlBtn.disabled = busy || !n;
    if (!busy && !n) say('Nothing in your bag can be downloaded: everything in it is no longer on the site. Remove it and add something else.');
    else if (!busy && /^Nothing in your bag/.test(status.textContent)) say('');
  };

  async function download() {
    if (busy) return;
    busy = true; dlBtn.disabled = true;
    if (open) open.editor.edit.flush();      // a change still on its way to the bag goes in the package
    bag.fillLooks();      // looks: the package holds what the bag shows
    const items = bag.items();
    say(items.some((i) => i.kind === 'music') ? 'Putting your package together. Music takes a few seconds…' : 'Putting your package together…');
    try {
      const files = await packageFiles({ items, theme: bag.theme(), scale: 1, onProgress: say });
      saveBlob(zip(files), 'loadout-package.zip');
      say(`Downloaded loadout-package.zip: ${packageWords(files.map((f) => f.name))}.`);
    } catch (e) {
      console.warn(e);
      say(`The download did not start: ${e.message}. Try again, or use a different browser.`);
    }
    busy = false; syncDownload();
  }

  /** Copy the bag's link, for the panel's footer (when the browser will not keep the bag): what to say. */
  async function copyBagLink() {
    const url = `${location.origin}${location.pathname}${bag.toLink()}`;
    if (linkProblem(bag, url)) { await copyLink(); return 'This bag is too long for a link. Download it instead.'; }
    try { await navigator.clipboard.writeText(url); return 'Link to your bag copied. Open it later to get these same things back.'; }
    catch { await copyLink(); return 'Your browser did not allow copying. The link is under the bag\'s heading.'; }
  }
  async function copyLink() {
    const url = `${location.origin}${location.pathname}${bag.toLink()}`;
    // W5-A, S8: an item made on a visit travels with its whole source, a studio sprite with its definition, which can make
    // the link longer than a link can safely be; and a link carries at most MAX_LINK_ITEMS items (app/bag.js linkProblem)
    const why = linkProblem(bag, url);
    if (why) {
      linkNote.textContent = why;
      noted();
      return;
    }
    try { await navigator.clipboard.writeText(url); linkNote.textContent = 'Link copied. Anyone who opens it gets a bag with these same items and settings.'; }
    catch { linkNote.textContent = 'Your browser did not allow copying. Select the link below and copy it.'; linkNote.append(el('input', { class: 'bag-link-text', readonly: true, value: url, 'aria-label': 'Link to this bag' })); }
    noted();
  }

  function notKept(n) {
    if (bag.kept()) return null;
    const why = bag.saved() ? NOT_KEPT
      : 'Your bag could not be saved: this browser\'s storage for the site is full. What is in it now will be gone when you reload or close the page. Download it now, copy its link, or take things out until this message goes away.';
    return el('div', { class: 'bag-unsaved', role: 'alert' },
      el('p', {}, el('strong', {}, n ? 'This bag is for this visit only. ' : 'Anything you add is for this visit only. '), why),
      n ? el('div', { class: 'bag-unsaved-do' },
        el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { exportBox.scrollIntoView({ block: 'nearest' }); download(); } }, 'Download it now'),
        el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: copyLink }, 'Copy the link to this bag')) : null);
  }

  function tools(n) {
    if (confirming) {
      return el('div', { class: 'bag-tools confirm' },
        el('span', { class: 'label' }, `Take all ${n} item${n === 1 ? '' : 's'} out of the bag? This cannot be undone.`),
        el('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => { confirming = false; bag.clear(); say(''); } }, 'Yes, empty it'),
        el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { confirming = false; build(); } }, 'Keep them'));
    }
    return el('div', { class: 'bag-tools' },
      el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: copyLink }, 'Copy link to this bag'),
      el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { confirming = true; build(); } }, 'Empty the bag'));
  }

  function listRows(items, theme) {
    const rows = items.map((it) => row(it, themeFor(it.settings, theme)));      // each in its own look, or the bag's
    if (flash && flash.at !== undefined && flash.at >= 0) {
      rows.splice(Math.min(flash.at, rows.length), 0, el('li', { class: 'bag-removed' }, el('span', { class: 'row-note', role: 'status' }, flash.text)));
    }
    return rows;
  }

  // ---- search and quick filters above the list (app/list-filter.js): they hide rows, never take anything out
  const find = listFilter({ onChange: () => filterRows() });
  const infoOf = (item) => ({ name: spriteNow(item.id)?.name ?? soundById[item.id]?.name ?? assetById(item.id)?.name ?? item.id, type: typeOf(item), id: item.id });
  function filterRows() {
    let shown = 0;
    for (const li of list.querySelectorAll('.bag-item[data-key]')) {
      const item = bag.get(li.dataset.key);
      if (!item) continue;
      li.hidden = !find.test(infoOf(item));
      if (!li.hidden) shown++;
    }
    find.result(shown);
  }

  function stopPictures() { for (const p of pictures) if (p.stop) p.stop(); pictures = []; }

  function build() {
    // the pictures on screen now, by item: a row that is rebuilt (a look change, a copy added, a change in the panel) starts
    // from the picture it had, so nothing goes blank while the new one is being made
    const shown = new Map();
    for (const li of list.querySelectorAll('.bag-item[data-key]')) { const cv = li.querySelector('canvas.tile'); if (cv) shown.set(li.dataset.key, cv); }
    // a row's button that had the keyboard keeps it over the rebuild
    const held = list.contains(document.activeElement) ? document.activeElement.closest('.bag-item')?.dataset.key : null;
    const heldOpen = held && document.activeElement.classList.contains('bag-open');
    stopPictures();
    bag.fillLooks();      // looks: sprites whose programs have come in since get their record now, and are drawn from it
    const items = bag.items(), theme = bag.theme();
    if (open && !items.some((i) => i.key === open.key)) closePanel();      // its item was taken out (here, in the panel's menu, or in another tab)
    fetchSprites(items);   // W2-G
    if (items.some(pendingMade)) restoreRuntime(true).then(() => { if (here() && !bag.items().some(pendingMade)) build(); });      // W5-B: drawn again once each is back, or known to need re-making
    if (!items.length) confirming = false;
    // status lines about a bag that has changed since go (a copied link of a bag that is now emptied, an old download)
    const sig = bagNow();
    if (linkNote.textContent && sig !== noteFor) linkNote.replaceChildren();
    if (status.textContent && sig !== statusFor && !busy) status.textContent = '';
    const counts = ['sprite', 'sound', 'music'].map((k) => [k, items.filter((i) => i.kind === k).length]).filter(([, c]) => c);
    list.replaceChildren(...[
      el('div', { class: 'bag-head' },
        el('div', {},
          el('h1', { class: 'h3' }, 'Your bag'),
          items.length
            ? el('p', { class: 'lede' }, `${items.length} item${items.length === 1 ? '' : 's'}: ${counts.map(([k, c]) => `${c} ${k === 'music' ? (c === 1 ? 'music track' : 'music tracks') : k + (c === 1 ? '' : 's')}`).join(', ')}. Click one to change it here, then download everything as one package.`)
            : el('p', { class: 'lede' }, 'Your bag is empty. Open any sprite, sound or music track and change it until you like it: every change is saved here by itself, and waits until you download everything as one package.')),
        items.length ? tools(items.length) : null),
      // W5-B: a save the browser refused is said, not swallowed; and a browser that keeps nothing (a private window,
      // blocked site data) is said too, with the two ways to keep the bag right there
      notKept(items.length),
      offerBox(),
      linkNote,
      items.length
        ? [
          exportBox,
          find.node,
          el('ul', { class: 'bag-list' }, listRows(items, theme)),
          lookBox,   // W2-D2
        ]
        : el('p', { class: 'bag-empty-go' }, el('a', { class: 'btn btn-primary', href: '#/browse' }, 'Browse the catalogue')),
    ].flat(Infinity).filter((k) => k != null && k !== false));
    for (const pic of pictures) {
      const cv = pic.node.matches('canvas.tile') ? pic.node : pic.node.querySelector('canvas.tile');
      const old = shown.get(cv?.closest('.bag-item')?.dataset.key);
      if (!cv || !old || old === cv || old.width !== cv.width || old.height !== cv.height) continue;
      const g = cv.getContext('2d');
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(old, 0, 0); g.restore();      // (a flat tile's context is scaled to its backing store)
      if (pic.hold) pic.hold();
    }
    find.setItems(items.map(infoOf));
    filterRows();
    if (heldOpen) list.querySelector(`.bag-item[data-key="${held}"] .bag-open`)?.focus({ preventScroll: true });
    syncDownload();
  }

  const loop = (now) => { for (const p of pictures) p.tick(now); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  build();
  const off = bag.onChange(build);
  const offMade = onCatalogChange(() => { if (here()) build(); });      // W5-A: an asset made on a visit has been brought back (or made again)
  // coming back (Back, Forward, a reload) to a step that had a panel open opens it again
  const back = history.state && history.state.bagPanel;
  if (back && bag.get(back)) openPanel(back, { step: false });
  return () => { left = true; off(); offMade(); cancelAnimationFrame(raf); stopPictures(); document.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); cancelAnimationFrame(fitting); covers.removeEventListener('change', onResize); closePanel({ pop: false }); };
}
