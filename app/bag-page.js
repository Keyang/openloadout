// The bag page (#/bag): everything the visitor collected, each drawn or played
// with its own settings and the bag's theme, and one download for all of it.
import { byId as spriteById } from '../sprites/index.js';
import { defaultParams, cleanParams, clipFps } from '../engine/sprite.js';
import { renderThemedFrame } from '../engine/theme.js';
import { applySound, themedSoundParams, soundSettingsFor } from '../sound/theme.js';
import { el, header, saveBlob, SPRITE_BG, SOUND_BG, drawSpriteOnTile, reduceMotion } from './ui.js';
import { soundById, soundParams, rendered, renderAsync, playRendered, playLive, drawWave } from './audio.js';
import { bag } from './bag.js';
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
  if (kind === 'sprite') { const sprite = spriteById[id]; return sprite ? { params: defaultParams(sprite), cues: defaultCues(sprite) } : null; }
  const patch = soundById[id];
  return patch ? { params: soundParams(patch, settings && settings.style) } : null;
}
bag.setStandard(standardSettings);

/** The address of an item's page, carrying its settings and `bag=<key>`. */
export function changeLink(item) {
  const s = item.settings ?? {}, q = new URLSearchParams();
  if (item.kind === 'sprite') {
    const sprite = spriteById[item.id];
    if (sprite) {
      const def = defaultParams(sprite), p = cleanParams(sprite, s.params ?? {});
      for (const [k, v] of Object.entries(p)) if (v !== def[k]) q.set(k, String(v));
      if (s.cues && !same(s.cues, plainCues(defaultCues(sprite)))) q.set('sfx', packCues(s.cues));
    }
    if (s.scale && s.scale !== 1) q.set('scale', String(s.scale));
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
  const frame = (f) => {
    let cv = frames.get(f);
    if (!cv) {
      const g = renderThemedFrame(sprite, clip, f, p, theme);
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
  return {
    node: tile,
    tick(now) {
      let f = 0;
      if (!reduceMotion.matches) {
        const n = Math.floor(((now - start) / 1000) * fps);
        f = c.loop ? n % c.frames : Math.min(c.frames - 1, n % (c.frames + Math.round(fps * 0.6)));
      }
      if (f === last) return;
      last = f;
      const [sky, ground, edge] = SPRITE_BG[sprite.kind] ?? SPRITE_BG.Character;
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
    const sprite = spriteById[item.id];
    const own = sprite && !same(cleanParams(sprite, s.params ?? {}), defaultParams(sprite));
    return [own ? 'Your own look' : 'Standard look', s.scale > 1 ? `pixel size ${s.scale}×` : null].filter(Boolean).join(', ');
  }
  const patch = soundById[item.id];
  const own = patch && !same(soundParams(patch, s.style, s.params), soundParams(patch, s.style));
  return [s.style ? `${s.style} style` : 'Standard style', own ? 'your own changes' : null].filter(Boolean).join(', ');
}

export function bagPage(app, query = {}) {
  document.title = 'Your bag · Loadout';
  let pictures = [], raf = 0, confirming = false, busy = false;
  const status = el('p', { class: 'status', role: 'status' });
  const say = (msg) => { status.textContent = msg; };
  const linkNote = el('p', { class: 'hint bag-link-note', role: 'status' });

  // A shared bag arrived in the address.
  let offer = null;
  if (query.load) {
    const peek = bag.peekLink(query.load);
    if (!peek) linkNote.textContent = 'That bag link is damaged, so nothing was added.';
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
      offer = null;
      linkNote.textContent = n === null ? 'That bag link is damaged, so nothing was added.' : mode === 'add' ? `Added ${n} item${n === 1 ? '' : 's'} from the shared bag.` : `Your bag now holds the shared bag's ${n} item${n === 1 ? '' : 's'}.`;
      build();
    };
    return el('div', { class: 'bag-offer' },
      el('p', {}, `This link holds a bag with ${offer.count} item${offer.count === 1 ? '' : 's'}. Your own bag already has things in it.`),
      el('button', { type: 'button', class: 'btn', onclick: () => take('add') }, 'Add them to my bag'),
      el('button', { type: 'button', class: 'ghost', onclick: () => take('replace') }, 'Replace my bag'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { offer = null; build(); } }, 'Ignore the link'));
  }

  function row(item, theme) {
    const sprite = item.kind === 'sprite' ? spriteById[item.id] : null;
    const patch = item.kind !== 'sprite' ? soundById[item.id] : null;
    // a crafted link can name a sound as music (or the reverse): such an item is treated as missing
    const gone = !kindMatches(item.kind, item.id, spriteById);
    let pic = null;
    if (!gone && sprite) pic = spritePicture(sprite, item.settings, theme);
    else if (!gone) pic = item.kind === 'music' ? musicPicture(patch, item.settings, theme) : soundPicture(patch, item.settings, theme);
    if (pic) pictures.push(pic);
    const name = sprite?.name ?? patch?.name ?? item.id;
    return el('li', { class: 'bag-item', 'data-key': item.key },
      pic ? pic.node : el('div', { class: 'bag-pic gone' }),
      el('div', { class: 'bag-text' },
        el('span', { class: 'bag-name' }, name),
        el('span', { class: 'bag-kind' }, KIND_LABEL[item.kind]),
        el('span', { class: 'hint' }, gone ? 'This is no longer on the site and will be left out of the download.' : describe(item)),
        flash && flash.key === item.key ? el('span', { class: 'row-note', role: 'status' }, flash.text) : null),
      el('div', { class: 'bag-actions' },
        gone ? null : el('a', { class: 'btn plain', href: changeLink(item) }, 'Change'),
        gone ? null : el('button', { type: 'button', class: 'ghost', onclick: () => {
          // copies go at the end of the bag; the note goes on the new row
          flash = { key: null, text: `Added another copy of ${name}.` };
          flash.key = bag.add({ kind: item.kind, id: item.id, settings: item.settings });
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
    dlBtn, status);
  const exportable = () => bag.items().filter((i) => kindMatches(i.kind, i.id, spriteById)).length;
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
    if (!items.length) confirming = false;
    const counts = ['sprite', 'sound', 'music'].map((k) => [k, items.filter((i) => i.kind === k).length]).filter(([, c]) => c);
    main.replaceChildren(...[
      el('h1', { class: 'small' }, 'Your bag'),
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
  return () => { off(); cancelAnimationFrame(raf); stopPictures(); };
}
