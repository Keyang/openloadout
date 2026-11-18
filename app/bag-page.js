// The bag page (#/bag): everything the visitor collected, each drawn or played
// with its own settings and the bag's theme, and one download for all of it.
import { assetById, spriteNow, loadSprites, onCatalogChange } from './catalog.js';   // W2-G: which sprites exist comes from the catalogue; their programs are loaded when the bag needs them
import { defaultParams, cleanParams, clipFps } from '../engine/sprite.js';
import { artStyleOf, stylesOf, styleById, pixelsOf } from '../engine/styles.js';   // W6-A: an item is shown in its art style (Contract 12)
import { renderThemedFrame } from '../engine/theme.js';
import { applySound, themedSoundParams, soundSettingsFor } from '../sound/theme.js';
import { el, header, saveBlob, SPRITE_BG, SOUND_BG, TILE_BG, drawSpriteOnTile, reduceMotion } from './ui.js';
import { soundById, soundParams, rendered, renderAsync, playRendered, playLive, drawWave } from './audio.js';
import { bag, LINK_LIMIT } from './bag.js';
import { restoreRuntime, madeItemState } from './api.js';      // W5-A, W5-B: what the bag holds that was made on a visit is checked again, off the page, before it is shown
import { packageFiles, defaultCues, activeTheme, kindMatches } from './bundle.js';
import { zip } from './zip.js';
import { themeControls } from './theme-controls.js';   // W2-D2

const INK = '#231b33';
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
    if (sprite && artStyleOf(sprite, s.artStyle) !== stylesOf(sprite)[0]) q.set('artstyle', s.artStyle);
  } else {
    const patch = soundById[item.id];
    if (patch) {
      const p = soundParams(patch, s.style, s.params);
      if (s.style) q.set('style', s.style);
      if (!same(p, soundParams(patch, s.style))) for (const d of patch.params) q.set(d.id, String(p[d.id]));
    }
    if (item.kind === 'sound' && s.seed && s.seed !== 1) q.set('seed', String(s.seed));
  }
  q.set('bag', item.key);
  return `#/${item.kind}/${item.id}?${q}`;
}
const plainCues = (cues) => Object.fromEntries(Object.entries(cues).map(([k, l]) => [k, l.map(({ sound, frame, preset, params, volume, when }) => (when ? { sound, frame, preset, params, volume, when } : { sound, frame, preset, params, volume }))]));

// ---- pictures ------------------------------------------------------------------

/** An animated sprite tile drawn with the item's settings and the bag's theme. */
function spritePicture(sprite, settings, theme) {
  const tile = el('canvas', { class: 'tile', width: 80, height: 72, role: 'img', 'aria-label': `${sprite.name}, as you set it up` });
  const p = cleanParams(sprite, settings.params ?? {});
  const clip = sprite.preview, frames = new Map(), start = performance.now();
  // in the item's art style; one that is not the sprite's first may draw on another kind of surface, shown by its pixel picture
  const first = stylesOf(sprite)[0], style = artStyleOf(sprite, settings.artStyle);
  const frame = (f) => {
    let cv = frames.get(f);
    if (!cv) {
      const g = style === first && style === 'pixel' ? renderThemedFrame(sprite, clip, f, p, theme) : pixelsOf(renderThemedFrame(sprite, clip, f, p, theme, { style }), style);
      cv = document.createElement('canvas');
      cv.width = g.w; cv.height = g.h;
      cv.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
      frames.set(f, cv);
    }
    return cv;
  };
  const g = tile.getContext('2d');
  const c = sprite.clips[clip], fps = clipFps(sprite, clip, p);
  let last = -1;
  // W5-B: a sprite made on a visit is drawn in a worker and its frames arrive later: what was drawn meanwhile is dropped then
  const offFrames = typeof sprite.onFrames === 'function' ? sprite.onFrames(() => { frames.clear(); last = -1; }) : null;
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
      const [sky, ground, edge] = TILE_BG[assetById(sprite.id)?.type] ?? SPRITE_BG[sprite.kind] ?? SPRITE_BG.Character;
      g.fillStyle = sky; g.fillRect(0, 0, 80, 72);
      g.fillStyle = ground; g.fillRect(0, 60, 80, 12);
      g.fillStyle = edge; g.fillRect(0, 60, 80, 1);
      drawSpriteOnTile(g, sprite, frame(f), 40 + Math.round((sprite.pivot[0] - sprite.size[0] / 2) * 0.5), 60);
    },
  };
}

/** A sound effect: its waveform, and a button that plays it with its settings and the theme. */
function soundPicture(patch, settings, theme) {
  const tile = el('canvas', { class: 'tile', width: 80, height: 72, 'aria-hidden': 'true' });
  const t = activeTheme(theme);
  const params = soundParams(patch, settings.style, settings.params);
  let r = null, handle = null, dirty = true;
  const make = () => {
    if (!r) {
      const raw = rendered(patch, t ? themedSoundParams(patch, params, t) : params, settings.seed ?? 1);
      r = t ? applySound(raw, soundSettingsFor(patch, t)) : raw;
    }
    return r;
  };
  const timer = setTimeout(() => { try { make(); dirty = true; } catch (e) { console.error(`sound ${patch.id}:`, e); } }, 0);
  const btn = el('button', { type: 'button', class: 'mini play', 'aria-label': `Play ${patch.name}` }, 'Play');
  const sync = () => { btn.textContent = handle ? 'Stop' : 'Play'; btn.setAttribute('aria-label', `${handle ? 'Stop' : 'Play'} ${patch.name}`); };
  btn.addEventListener('click', () => {
    if (handle) { handle.stop(); handle = null; sync(); dirty = true; return; }
    handle = playRendered(make(), { force: true, loop: !!patch.loop, onended: () => { handle = null; sync(); dirty = true; } });
    sync(); dirty = true;
  });
  const g = tile.getContext('2d');
  return {
    node: el('div', { class: 'bag-pic' }, tile, btn),
    stop() { clearTimeout(timer); if (handle) handle.stop(); },
    tick() {
      if (!dirty && !handle) return;
      dirty = false;
      g.fillStyle = SOUND_BG[patch.category] ?? '#e6e9f2'; g.fillRect(0, 0, 80, 72);
      g.fillStyle = 'rgba(35, 27, 51, 0.12)'; g.fillRect(8, 36, 64, 1);
      if (r) {
        const played = handle ? Math.floor((((handle.now() - handle.startedAt) / handle.duration) % 1) * 64) : -1;
        drawWave(g, r.samples, 8, 36, 64, 44, INK, played, '#5a48e0');
      }
    },
  };
}

/** A music track: a button that plays it live with its settings and the theme's tempo, key and intensity. */
function musicPicture(patch, settings, theme) {
  const tile = el('canvas', { class: 'tile', width: 80, height: 72, 'aria-hidden': 'true' });
  const params = themedSoundParams(patch, soundParams(patch, settings.style, settings.params), theme);
  let voice = null, starting = false, gone = false, dirty = true;
  const btn = el('button', { type: 'button', class: 'mini play', 'aria-label': `Play ${patch.name}` }, 'Play');
  // ==== W2-D2: music under a look that changes brightness ====
  // Live play can follow speed, key and intensity but not brightness, so then the rendered loop is
  // played with the look applied (applySound): what is heard is what the download holds.
  const rendersFirst = soundSettingsFor(patch, theme).brightness !== 0;
  const sync = () => { const w = voice || starting ? 'Stop' : 'Play'; btn.textContent = starting ? (rendersFirst ? 'Getting the track ready…' : 'Starting…') : w; btn.setAttribute('aria-label', `${w} ${patch.name}`); dirty = true; };
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
      g.fillStyle = SOUND_BG.music; g.fillRect(0, 0, 80, 72);
      // a pixel note, bouncing while it plays
      const y = voice ? 2 * Math.round(Math.sin(performance.now() / 120)) : 0;
      g.fillStyle = INK;
      g.fillRect(44, 18 + y, 3, 28); g.fillRect(47, 18 + y, 10, 3); g.fillRect(54, 21 + y, 3, 6);
      g.fillRect(34, 42 + y, 12, 9);
      g.fillStyle = '#ffcf3f'; g.fillRect(36, 44 + y, 8, 5);
      if (voice) dirty = true;
    },
  };
}

// ---- the page ----------------------------------------------------------------------

function describe(item) {
  const s = item.settings ?? {};
  if (item.kind === 'sprite') {
    const sprite = spriteNow(item.id);
    const own = sprite && !same(cleanParams(sprite, s.params ?? {}), defaultParams(sprite));
    const style = sprite ? artStyleOf(sprite, s.artStyle) : null;
    return [own ? 'Your own look' : 'Standard look', style && style !== stylesOf(sprite)[0] ? `${styleById(style).label} style` : null, s.scale > 1 ? `pixel size ${s.scale}×` : null].filter(Boolean).join(', ');
  }
  const patch = soundById[item.id];
  const own = patch && !same(soundParams(patch, s.style, s.params), soundParams(patch, s.style));
  return [s.style ? `${s.style} style` : 'Standard style', own ? 'your own changes' : null].filter(Boolean).join(', ');
}

export function bagPage(app, query = {}, isCurrent = () => true) {
  document.title = 'Your bag · Loadout';
  // ==== W2-G: sprite programs are loaded when the bag first shows them (app/catalog.js) ====
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
  const say = (msg) => { status.textContent = msg; };
  const linkNote = el('p', { class: 'hint bag-link-note', role: 'status' });

  // A shared bag arrived in the address.
  let offer = null;
  if (query.load) {
    const peek = bag.peekLink(query.load);
    if (!peek) linkNote.textContent = 'That bag link is damaged, so nothing was added.';
    // W5-A: a sprite made on someone's visit is a small program. It is not run until the visitor says so.
    else if (peek.code) offer = { text: query.load, count: peek.count, code: peek.code, alone: !bag.count() };
    else if (!bag.count()) {
      const n = bag.fromLink(query.load);
      linkNote.textContent = `Opened a shared bag with ${n} item${n === 1 ? '' : 's'}.`;
    } else offer = { text: query.load, count: peek.count };
    history.replaceState(null, '', '#/bag');
  }
  // what the last row action did, shown next to that row: { key | at, text }
  let flash = null;

  const main = el('main', { class: 'home bag-page' });
  app.replaceChildren(header('bag'), main);

  // ==== W2-D2: the bag's look, with the same controls as a bundle page (app/theme-controls.js) ====
  // Changing it sets bag.setTheme, and the page rebuilds its pictures with it. Sliders report when let go, and
  // focus is put back after the rebuild. The controls follow the bag when it changes elsewhere (a shared link, another tab).
  const look = themeControls({ theme: bag.theme(), live: false, open: false, onChange: (t) => { const f = document.activeElement; bag.setTheme(t); if (f && lookBox.contains(f) && document.activeElement !== f) f.focus(); } });
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
      build();
    };
    const made = offer.code ? el('p', {}, `${offer.code === 1 ? 'One of them was' : `${offer.code} of them were`} made by whoever shared the link, and ${offer.code === 1 ? 'is a small program that runs' : 'are small programs that run'} in this page once the bag is opened. Open it only if you trust who sent it.`) : null;
    if (offer.alone) return el('div', { class: 'bag-offer' },
      el('p', {}, `This link holds a bag with ${offer.count} item${offer.count === 1 ? '' : 's'}.`), made,
      el('button', { type: 'button', class: 'btn', onclick: () => take('replace') }, 'Open the bag'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { offer = null; build(); } }, 'Ignore the link'));
    return el('div', { class: 'bag-offer' },
      el('p', {}, `This link holds a bag with ${offer.count} item${offer.count === 1 ? '' : 's'}. Your own bag already has things in it.`), made,
      el('button', { type: 'button', class: 'btn', onclick: () => take('add') }, 'Add them to my bag'),
      el('button', { type: 'button', class: 'ghost', onclick: () => take('replace') }, 'Replace my bag'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { offer = null; build(); } }, 'Ignore the link'));
  }

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
      el('div', { class: 'bag-pic gone' }),
      el('div', { class: 'bag-text' },
        el('span', { class: 'bag-name' }, again.name && again.name !== item.id ? `${again.name} (${item.id})` : item.id),
        el('span', { class: 'bag-kind' }, KIND_LABEL[item.kind]),
        el('span', { class: 'hint' }, `Needs re-making. It was made on a visit and did not pass when it was checked again, so it is not shown and will be left out of the download. ${again.reason ?? ''}`)),
      el('div', { class: 'bag-actions' }, el('button', { type: 'button', class: 'ghost', onclick: () => { bag.remove(item.key); } }, 'Remove')));
    if (pending) return el('li', { class: 'bag-item', 'data-key': item.key },
      el('div', { class: 'bag-pic pending' }),
      el('div', { class: 'bag-text' }, el('span', { class: 'bag-name' }, assetById(item.id)?.name ?? item.id), el('span', { class: 'bag-kind' }, KIND_LABEL[item.kind]), el('span', { class: 'hint' }, pendingMade(item) ? 'Checking… It was made on a visit, so it is checked again before it is shown.' : 'Loading…')),
      el('div', { class: 'bag-actions' }, el('button', { type: 'button', class: 'ghost', onclick: () => { bag.remove(item.key); } }, 'Remove')));
    if (!gone && sprite) pic = spritePicture(sprite, item.settings, theme);
    else if (!gone) pic = item.kind === 'music' ? musicPicture(patch, item.settings, theme) : soundPicture(patch, item.settings, theme);
    if (pic) pictures.push(pic);
    const name = sprite?.name ?? patch?.name ?? item.id;
    return el('li', { class: 'bag-item', 'data-key': item.key },
      pic ? pic.node : el('div', { class: 'bag-pic gone' }),
      el('div', { class: 'bag-text' },
        el('span', { class: 'bag-name' }, name),
        el('span', { class: 'bag-kind' }, KIND_LABEL[item.kind]),
        el('span', { class: 'hint' }, gone ? (item.definition ? 'This was made on another visit and could not be brought back. It will be left out of the download.' : 'This is no longer on the site and will be left out of the download.') : describe(item)),
        flash && flash.key === item.key ? el('span', { class: 'row-note', role: 'status' }, flash.text) : null),
      el('div', { class: 'bag-actions' },
        gone ? null : el('a', { class: 'btn plain', href: changeLink(item) }, 'Change'),
        gone ? null : el('button', { type: 'button', class: 'ghost', onclick: () => {
          // copies go at the end of the bag; the note goes on the new row
          flash = { key: null, text: `Added another copy of ${name}.` };
          flash.key = bag.add({ kind: item.kind, id: item.id, settings: item.settings, definition: item.definition });
          build();
        } }, 'Add another copy'),
        el('button', { type: 'button', class: 'ghost', onclick: () => {
          flash = { at: bag.items().findIndex((i) => i.key === item.key), text: `Removed ${name}.` };
          bag.remove(item.key);
        } }, 'Remove')));
  }

  // ---- export
  const zipChoice = el('input', { type: 'radio', name: 'package', value: 'zip', id: 'pkg-zip', checked: true });
  const unityChoice = el('input', { type: 'radio', name: 'package', value: 'unity', id: 'pkg-unity', disabled: true });
  const dlBtn = el('button', { type: 'button', class: 'btn big', onclick: download }, 'Download');
  const exportBox = el('section', { class: 'bag-export' },
    el('h2', {}, 'Download everything'),
    el('fieldset', { class: 'bag-choice' },
      el('legend', {}, 'Package'),
      el('label', { for: 'pkg-zip' }, zipChoice, ' Zip package'),
      el('label', { for: 'pkg-unity', class: 'soon' }, unityChoice, ' Unity package (coming later)')),
    el('p', { class: 'hint' }, 'One zip with every sprite sheet, sound and music track in your bag, a list of what is in it, and a short guide. It works in Unity, Godot and web games.'),
    dlBtn,
    el('a', { class: 'btn plain play-try', href: '#/play' }, 'Try these in the playground'),   // W2-E: the playground (app/play-page.js)
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
    const items = bag.items();
    say(items.some((i) => i.kind === 'music') ? 'Putting your package together. Music takes a few seconds…' : 'Putting your package together…');
    try {
      const files = await packageFiles({ items, theme: bag.theme(), scale: 1, onProgress: say });
      saveBlob(zip(files), 'loadout-package.zip');
      const n = (ext) => files.filter((f) => f.name.endsWith(ext)).length;
      say(`Downloaded loadout-package.zip: ${n('.png')} sprite sheet${n('.png') === 1 ? '' : 's'}, ${n('.wav')} sound file${n('.wav') === 1 ? '' : 's'}, a list of everything and a guide.`);
    } catch (e) {
      console.warn(e);
      say(`The download did not start: ${e.message}. Try again, or use a different browser.`);
    }
    busy = false; syncDownload();
  }

  async function copyLink() {
    const url = `${location.origin}${location.pathname}${bag.toLink()}`;
    // W5-A: an item made on a visit travels with its whole source, which can make the link longer than a link can safely be
    if (bag.madeCount() && url.length > LINK_LIMIT) {
      linkNote.textContent = `This bag is too long for a link: it holds ${bag.madeCount() === 1 ? 'something' : 'things'} made on a visit, which travel${bag.madeCount() === 1 ? 's' : ''} with ${bag.madeCount() === 1 ? 'its' : 'their'} whole source, and the link would be ${url.length.toLocaleString('en')} characters long. Chat and mail apps cut links over ${LINK_LIMIT.toLocaleString('en')} characters short, so no link was made. Download the package instead: it holds everything, the source too.`;
      return;
    }
    try { await navigator.clipboard.writeText(url); linkNote.textContent = 'Link copied. Anyone who opens it gets a bag with these same items and settings.'; }
    catch { linkNote.textContent = 'Your browser did not allow copying. Select the link below and copy it.'; linkNote.append(el('input', { class: 'bag-link-text', readonly: true, value: url, 'aria-label': 'Link to this bag' })); }
  }

  function tools(n) {
    if (confirming) {
      return el('div', { class: 'bag-tools confirm' },
        el('span', { class: 'label' }, `Take all ${n} item${n === 1 ? '' : 's'} out of the bag? This cannot be undone.`),
        el('button', { type: 'button', class: 'btn', onclick: () => { confirming = false; bag.clear(); say(''); } }, 'Yes, empty it'),
        el('button', { type: 'button', class: 'ghost', onclick: () => { confirming = false; build(); } }, 'Keep them'));
    }
    return el('div', { class: 'bag-tools' },
      el('button', { type: 'button', class: 'ghost', onclick: copyLink }, 'Copy link to this bag'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { confirming = true; build(); } }, 'Empty the bag'));
  }

  function listRows(items, theme) {
    const rows = items.map((it) => row(it, theme));
    if (flash && flash.at !== undefined && flash.at >= 0) {
      rows.splice(Math.min(flash.at, rows.length), 0, el('li', { class: 'bag-removed' }, el('span', { class: 'row-note', role: 'status' }, flash.text)));
    }
    return rows;
  }

  function stopPictures() { for (const p of pictures) if (p.stop) p.stop(); pictures = []; }

  function build() {
    stopPictures();
    const items = bag.items(), theme = bag.theme();
    fetchSprites(items);   // W2-G
    if (items.some(pendingMade)) restoreRuntime(true).then(() => { if (here() && !bag.items().some(pendingMade)) build(); });      // W5-B: drawn again once each is back, or known to need re-making
    if (!items.length) confirming = false;
    const counts = ['sprite', 'sound', 'music'].map((k) => [k, items.filter((i) => i.kind === k).length]).filter(([, c]) => c);
    main.replaceChildren(...[
      el('h1', { class: 'small' }, 'Your bag'),
      // W5-B: a save the browser refused is said, not swallowed
      bag.saved() ? null : el('p', { class: 'status bag-unsaved', role: 'alert' }, 'Your bag could not be saved: this browser\'s storage for the site is full. What is in it now will be gone when you reload or close the page. Download it now, or take things out until this message goes away.'),
      offerBox(),
      items.length
        ? [
          el('p', { class: 'lede' }, `${items.length} item${items.length === 1 ? '' : 's'}: ${counts.map(([k, c]) => `${c} ${k === 'music' ? (c === 1 ? 'music track' : 'music tracks') : k + (c === 1 ? '' : 's')}`).join(', ')}. Change any of them, then download everything as one package.`),
          linkNote,
          tools(items.length),
          lookBox,   // W2-D2
          el('ul', { class: 'bag-list' }, listRows(items, theme)),
          exportBox,
        ]
        : [
          el('p', { class: 'lede' }, 'Your bag is empty. Open any sprite, sound or music track, change it until you like it, and press Add to bag. Everything you add waits here, with your changes, until you download it as one package.'),
          linkNote,
          el('p', {}, el('a', { class: 'btn', href: '#/' }, 'Browse the catalogue')),
        ]].flat(Infinity).filter((k) => k != null && k !== false));
    syncDownload();
  }

  const loop = (now) => { for (const p of pictures) p.tick(now); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  build();
  const off = bag.onChange(build);
  const offMade = onCatalogChange(() => { if (here()) build(); });      // W5-A: an asset made on a visit has been brought back (or made again)
  return () => { left = true; off(); offMade(); cancelAnimationFrame(raf); stopPictures(); };
}
