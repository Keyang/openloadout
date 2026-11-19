// One bundle (#/bundle/<id>): one set of look controls, and under them every sprite,
// sound and music track in the bundle, live, all restyled together (features EDIT-6, BAG-6;
// architecture.md Contracts 4, 6, 7, 8). Then the whole bundle goes into the bag, the
// playground, or a zip.
//
// Built for big bundles (45 sprites, 20 sounds): a picture is only loaded, restyled and
// animated while it is on screen. A sprite's picture is the catalogue's strip of its
// preview animation, split into its few colours once, so a new look repaints it from a
// short list of colours instead of drawing it again. With "Also change shapes" the
// sprite's own program draws the frames it needs.
import { loadCatalog, bundleById, assetsOfBundle, loadSprite, loadSound } from './catalog.js';
import { normalizeTheme, renderThemedFrame, spriteMaterials } from '../engine/theme.js';
import { applySound, themedSoundParams, soundSettingsFor } from '../sound/theme.js';
import { el, header, saveBlob, reduceMotion, SOUND_BG, cap } from './ui.js';
import { soundById, soundParams, rendered, renderAsync, playRendered, playLive, drawWave } from './audio.js';
import { bag, cleanSettings } from './bag.js';
import { packageFiles, activeTheme } from './bundle.js';
import { zip } from './zip.js';
import { shelvesOf } from './shelves.js';
import { themeControls, themeFromQuery, lookSearch, queryHasLook, indexPixels, recolourIndexed } from './theme-controls.js';

const INK = '#231b33';
const PIC = 128;                 // the room for a sprite picture in its tile, in screen pixels (style.css .bundle-pic)
const MAX_ZOOM = 8;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const GAME_WORDS = { any: 'any game', platformer: 'platformer games', 'turn-based-rpg': 'turn-based role-playing games', 'roguelike-action': 'roguelike action games' };
const linkTo = (row) => `#/${row.kind}/${row.id}`;

function notHere(app, title, text) {
  document.title = 'Not here · Loadout';
  app.replaceChildren(header(''), el('main', { class: 'home' },
    el('h1', { class: 'small' }, title),
    el('p', { class: 'lede' }, text),
    el('p', {}, el('a', { class: 'btn', href: '#/' }, 'See everything'))));
  return () => {};
}

// ---- a sprite ------------------------------------------------------------------------------

/** Load an image and read its pixels. */
async function stripPixels(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, cv.width, cv.height).data;
}

/** The preview animation's frames side by side, drawn by the sprite's own program (when there is no strip). */
function programStrip(sprite) {
  const clip = sprite.preview, n = sprite.clips[clip].frames, [fw, fh] = sprite.size;
  const out = new Uint8ClampedArray(fw * n * fh * 4);
  for (let f = 0; f < n; f++) {
    const src = renderThemedFrame(sprite, clip, f, {}, null).bytes();
    for (let y = 0; y < fh; y++) out.set(src.subarray(y * fw * 4, (y + 1) * fw * 4), (y * fw * n + f * fw) * 4);
  }
  return out;
}

function spriteTile(row, page) {
  const [fw, fh] = row.tech.frame;
  const clipInfo = row.tech.clips.find((c) => c.name === row.stripClip) ?? row.tech.clips[0];
  const clipName = row.stripClip ?? clipInfo.name;
  const frames = row.stripFrames ?? clipInfo.frames, fps = row.stripFps ?? clipInfo.fps, loop = clipInfo.loop !== false;
  // The whole frame (so "Also change shapes" can never cut a sprite off), at the largest whole-number size that fits.
  const k = Math.max(1, Math.min(MAX_ZOOM, Math.floor(PIC / Math.max(fw, fh))));
  const cv = el('canvas', { class: 'bundle-sprite-pic', width: fw, height: fh, 'data-id': row.id, role: 'img', 'aria-label': `${row.name} with this look`, style: `width:${fw * k}px;height:${fh * k}px` });
  const g = cv.getContext('2d');
  const sheet = document.createElement('canvas');
  sheet.width = fw * frames; sheet.height = fh;
  const sg = sheet.getContext('2d');
  const node = el('li', { class: 'bundle-card bundle-sprite' },
    el('a', { class: 'bundle-pic', href: linkTo(row), title: `Open ${row.name} on its own page` }, cv),
    el('a', { class: 'bundle-name', href: linkTo(row) }, row.name),
    el('span', { class: 'bundle-kind' }, cap(row.type ?? 'sprite')));

  let indexed = null, sprite = null, loading = null, visible = false;
  let look = null, lookKey = null, painted = null, last = -1;
  const shaped = new Map();   // frame -> canvas, for "Also change shapes"

  function frameAt(now) {
    if (reduceMotion.matches) return 0;
    const n = Math.floor(((now - page.start) / 1000) * fps);
    return loop ? n % frames : Math.min(frames - 1, n % (frames + Math.round(fps * 0.6)));
  }
  function shapedFrame(f) {
    let c = shaped.get(f);
    if (!c) {
      const s = renderThemedFrame(sprite, sprite.clips[clipName] ? clipName : sprite.preview, f, {}, look);
      c = document.createElement('canvas');
      c.width = s.w; c.height = s.h;
      c.getContext('2d').putImageData(new ImageData(s.bytes(), s.w, s.h), 0, 0);
      shaped.set(f, c);
    }
    return c;
  }
  function draw(f) {
    g.clearRect(0, 0, fw, fh);
    if (look.shapes && sprite) g.drawImage(shapedFrame(f), 0, 0);
    else g.drawImage(sheet, f * fw, 0, fw, fh, 0, 0, fw, fh);
    last = f;
    if (cv.dataset.look !== lookKey) cv.dataset.look = lookKey;
  }
  /** Make the picture match the current look now (only when it is on screen and loaded). */
  function paint(now) {
    if (!visible || !indexed || !look || painted === lookKey) return;
    shaped.clear();
    if (!look.shapes || !sprite) sg.putImageData(new ImageData(recolourIndexed(indexed, look.colour, sprite ? () => spriteMaterials(sprite, {}) : null), fw * frames, fh), 0, 0);   // looks: with what each colour is of (Contract 7)
    painted = lookKey;
    draw(frameAt(now));
  }
  function load() {
    loading = loading ?? (async () => {
      sprite = await loadSprite(row.id).catch(() => null);
      let bytes = null;
      if (row.strip) bytes = await stripPixels(row.strip).catch(() => null);
      if (!bytes && sprite) bytes = programStrip(sprite);
      if (!bytes) throw new Error(`${row.id}: no picture`);
      indexed = indexPixels(bytes);
      paint(performance.now());
      // looks: what each colour of this sprite is of is found by drawing it a few times; do that now, between other
      // work, so the first look that is picked does not have to wait for it
      if (sprite) setTimeout(() => { try { spriteMaterials(sprite, {}); } catch { /* found again when a look needs it */ } }, 0);
    })().catch((e) => { console.warn(e); node.classList.add('broken'); });
    return loading;
  }
  return {
    node, watch: cv,
    setVisible(on) { visible = on; if (on) { if (!indexed) load(); else paint(performance.now()); } },
    restyle(t, key, now) { look = t; lookKey = key; paint(now); },
    tick(now) {
      if (!visible || painted !== lookKey) return;
      const f = frameAt(now);
      if (f !== last) draw(f);
    },
  };
}

// ---- a sound effect --------------------------------------------------------------------------

// Waveforms of a new look are worked out one at a time, between frames, so the controls never stall.
function idleQueue() {
  const jobs = [];
  let timer = 0;
  const pump = () => {
    timer = 0;
    const job = jobs.shift();
    if (!job) return;
    try { job(); } catch (e) { console.warn(e); }
    if (jobs.length) timer = setTimeout(pump, 0);
  };
  return {
    add(job) { if (!jobs.includes(job)) jobs.push(job); if (!timer) timer = setTimeout(pump, 0); },
    stop() { clearTimeout(timer); jobs.length = 0; },
  };
}

function soundTile(row, patch, queue) {
  const tile = el('canvas', { class: 'bundle-wave', width: 112, height: 56, 'aria-hidden': 'true' });
  const g = tile.getContext('2d');
  const btn = el('button', { type: 'button', class: 'mini play' });
  const node = el('li', { class: 'bundle-card bundle-sound', 'data-id': row.id, 'data-played': '0' },
    el('div', { class: 'bundle-pic sound', style: `background:${SOUND_BG[patch.category] ?? '#e6e9f2'}` }, tile, btn),
    el('a', { class: 'bundle-name', href: linkTo(row) }, row.name),
    el('span', { class: 'bundle-kind' }, cap(patch.category ?? 'sound') + (patch.loop ? ', loop' : '')));
  let look = null, key = null, r = null, rKey = null, handle = null, visible = false, drawn = null;
  const base = soundParams(patch);
  const make = () => {
    if (rKey !== key) {
      const t = activeTheme(look);
      const raw = rendered(patch, t ? themedSoundParams(patch, base, t) : base, 1);
      r = t ? applySound(raw, soundSettingsFor(patch, t)) : raw;
      rKey = key;
    }
    return r;
  };
  const sync = () => { const w = handle ? 'Stop' : 'Play'; btn.textContent = w; btn.setAttribute('aria-label', `${w} ${row.name}`); };
  const drawNow = () => {
    if (!visible) return;
    const res = make();
    g.clearRect(0, 0, 112, 56);
    g.fillStyle = 'rgba(35, 27, 51, 0.14)'; g.fillRect(4, 28, 104, 1);
    const played = handle ? Math.floor((((handle.now() - handle.startedAt) / handle.duration) % 1) * 104) : -1;
    drawWave(g, res.samples, 4, 28, 104, 48, INK, played, '#5a48e0');
    drawn = key;
  };
  btn.addEventListener('click', () => {
    if (handle) { handle.stop(); handle = null; sync(); drawNow(); return; }
    try {
      handle = playRendered(make(), { force: true, loop: !!patch.loop, onended: () => { handle = null; sync(); drawNow(); } });
      node.dataset.played = String(Number(node.dataset.played) + 1);
    } catch (e) { console.warn(e); node.dataset.played = 'error'; }
    sync(); drawNow();
  });
  sync();
  return {
    node, watch: node,
    setVisible(on) { visible = on; if (on && drawn !== key) queue.add(drawNow); },
    restyle(t, k) {
      look = t; key = k;
      if (handle) { handle.stop(); handle = null; sync(); }
      if (visible) queue.add(drawNow);
    },
    tick() { if (handle && visible) drawNow(); },
    stop() { if (handle) handle.stop(); handle = null; },
  };
}

// ---- a music track ---------------------------------------------------------------------------

function musicTile(row, patch) {
  const btn = el('button', { type: 'button', class: 'btn music-play' });
  const about = el('span', { class: 'hint bundle-tempo' });
  const node = el('li', { class: 'bundle-card bundle-music', 'data-id': row.id },
    el('div', { class: 'bundle-pic music', style: `background:${SOUND_BG.music}` }, btn, about),
    el('a', { class: 'bundle-name', href: linkTo(row) }, row.name),
    el('span', { class: 'bundle-kind' }, 'Music'));
  const base = soundParams(patch);
  let look = null, params = base, voice = null, starting = false, gone = false, run = 0;
  // Live play can change speed, key and intensity as it goes, but not brightness. When the look
  // changes brightness, play the rendered loop with the look applied: what the download holds.
  const needsRender = () => soundSettingsFor(patch, look).brightness !== 0;
  const sync = () => {
    const w = voice || starting ? 'Stop' : 'Play';
    btn.textContent = starting ? (needsRender() ? 'Getting the track ready…' : 'Starting…') : w;
    btn.setAttribute('aria-label', `${w} ${row.name}`);
  };
  async function playRenderedLoop(mine) {
    const r = applySound(await renderAsync(patch, { ...params }), soundSettingsFor(patch, look));
    if (gone || mine !== run) return;
    const h = playRendered(r, { force: true, loop: true });
    voice = h && { stop: () => h.stop(), rendered: true };
  }
  async function start() {
    const mine = ++run;
    starting = true; sync();
    try {
      if (needsRender()) await playRenderedLoop(mine);
      else {
        try {
          const v = await playLive(patch, { ...params });
          if (gone || mine !== run) v.stop(); else voice = v;
        } catch {
          await playRenderedLoop(mine);   // no live audio here: the rendered loop instead
        }
      }
    } catch (e) { console.warn(`music ${row.id}:`, e); }
    if (mine === run) { starting = false; sync(); }
  }
  function stop() { run++; starting = false; if (voice) voice.stop(); voice = null; sync(); }
  btn.addEventListener('click', () => { if (voice || starting) stop(); else start(); });
  return {
    node, watch: node,
    setVisible() {},
    restyle(t) {
      const wasRendered = !!(voice && voice.rendered) || (starting && look && needsRender());
      const playing = !!voice || starting;
      const next = themedSoundParams(patch, base, t);
      const changed = Object.keys(next).filter((k) => next[k] !== params[k]);
      look = t; params = next;
      if (playing && (wasRendered || needsRender())) { stop(); start(); }   // a new rendered loop for the new look
      else if (voice && voice.set) for (const k of changed) voice.set(k, next[k]);
      const bpm = params.bpm ? `${Math.round(params.bpm)} beats a minute` : '';
      const pace = t.music.tempo !== 1 ? ` (${Math.round(t.music.tempo * 100)}% speed)` : '';
      about.textContent = bpm + pace;
      if (!playing) sync();
    },
    tick() {},
    stop() { gone = true; stop(); },
  };
}

// ---- the page --------------------------------------------------------------------------------

// still(): handed over by the router (lazyPage in app.js); false once the visitor has gone elsewhere.
// It is checked after every wait, so a bundle page that finishes loading late never draws over the page they went to.
export async function bundlePage(app, id, query = {}, still = () => true) {
  try { await loadCatalog(); } catch (e) {
    if (!still()) return null;
    return notHere(app, 'The catalogue is not built yet', 'This page needs the catalogue file. Run "npm run build", then reload.');
  }
  if (!still()) return null;
  const bundle = bundleById(id);
  if (!bundle) return notHere(app, 'That bundle is not here', 'The link may be old or mistyped. Everything that exists is on the front page.');
  document.title = `${bundle.name} · Loadout`;

  const rows = assetsOfBundle(bundle);
  const original = normalizeTheme(bundle.theme);
  let theme = queryHasLook(query) ? themeFromQuery(query) : original;
  const keyOf = (t) => (JSON.stringify(t) === JSON.stringify(original) ? 'original' : lookSearch(t) || 'look=original');

  const page = { start: performance.now() };
  const queue = idleQueue();
  const tiles = [];
  const tileOf = new Map();       // catalogue row -> its tile
  for (const row of rows) {
    if (row.kind === 'sprite') tiles.push(spriteTile(row, page));
    else {
      const patch = soundById[row.id] ?? await loadSound(row.id).catch(() => null);
      if (!still()) { queue.stop(); for (const t of tiles) if (t.stop) t.stop(); return null; }
      if (!patch) continue;
      tiles.push(row.kind === 'music' ? musicTile(row, patch) : soundTile(row, patch, queue));
    }
    tileOf.set(row, tiles.at(-1));
  }

  const main = el('main', { class: 'home bundle-page' });

  function setLook(t, { address = true } = {}) {
    theme = normalizeTheme(t);
    const key = keyOf(theme);
    main.dataset.look = key;
    const now = performance.now();
    const t0 = performance.now();
    for (const tile of tiles) tile.restyle(theme, key, now);
    main.dataset.lookMs = (performance.now() - t0).toFixed(2);
    if (address) {
      const search = key === 'original' ? '' : key;
      history.replaceState(null, '', `#/bundle/${bundle.id}${search ? '?' + search : ''}`);
    }
  }

  const wide = window.matchMedia('(min-width: 901px)').matches;   // on a phone the fine-tuning starts folded, so the assets are near
  const controls = themeControls({ theme, original, open: wide, onChange: (t) => setLook(t) });

  // ---- actions
  const status = el('p', { class: 'status', role: 'status' });
  const say = (text) => { status.textContent = text; };
  const ask = el('div', { class: 'bundle-ask', hidden: true });
  const goBag = el('a', { class: 'ghost go-bag', href: '#/bag', hidden: true }, 'Go to bag');
  const n = rows.length;
  const items = () => rows.map((r, i) => ({ key: `b${i + 1}`, kind: r.kind, id: r.id, settings: cleanSettings(r.kind, {}) }));

  function put(mode, then, keepLook = false) {     // looks: keepLook leaves the bag the look it already has
    ask.hidden = true;
    if (mode === 'replace') bag.clear();
    const seen = new Set();
    for (const it of items()) {
      if (seen.has(it.kind + ':' + it.id)) continue;
      seen.add(it.kind + ':' + it.id);
      bag.add({ kind: it.kind, id: it.id, settings: it.settings });
    }
    if (!keepLook) bag.setTheme(theme);
    say(`${mode === 'replace' ? 'Your bag now holds' : 'Added'} ${plural(seen.size, 'thing')} from ${bundle.name}${mode === 'replace' ? '' : ' to your bag'}${keepLook ? '. They take the look your bag already has' : ', and the whole bag has this look'}. It holds ${plural(bag.count(), 'thing')}.`
      + (bag.kept() ? '' : ' This browser is not keeping your bag: it will be gone when you reload or close the page. Download it or copy its link from your bag before you leave.'));
    goBag.hidden = false;
    if (then) then();
  }
  function addAll(then) {
    if (!bag.count()) { put('add', then); return; }
    const m = bag.count();
    // the same look: the same colours, sound and music, and the same shapes (the number behind "Surprise me" only matters with shapes)
    const lookOf = (t) => { const x = normalizeTheme(t); return JSON.stringify([x.colour, x.sound, x.music, x.shapes, x.shapes ? x.seed : 0]); };
    const ownLook = lookOf(bag.theme()) !== lookOf({}) && lookOf(bag.theme()) !== lookOf(theme);
    ask.replaceChildren(
      // looks: a bag that has a look of its own, different from the one shown here, never loses it without being asked
      ...(ownLook ? [
        el('p', {}, `Your bag already has ${plural(m, 'thing')} in it, with a look of its own. Add this bundle and keep your bag's look, add it and give everything this look, or replace what is in your bag (the bag then takes this look)?`),
        el('button', { type: 'button', class: 'btn', onclick: () => put('add', then, true) }, 'Add, and keep my bag\'s look'),
        el('button', { type: 'button', class: 'ghost', onclick: () => put('add', then) }, 'Add, and give everything this look'),
      ] : [
        el('p', {}, `Your bag already has ${plural(m, 'thing')} in it. Add this bundle to them, or replace them? Either way, the whole bag takes this look.`),
        el('button', { type: 'button', class: 'btn', onclick: () => put('add', then) }, 'Add to what is in my bag'),
      ]),
      el('button', { type: 'button', class: 'ghost', onclick: () => put('replace', then) }, 'Replace what is in my bag'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { ask.hidden = true; say(''); } }, 'Cancel'));
    ask.hidden = false;
    ask.querySelector('button').focus();
  }
  let busy = false;
  const dlBtn = el('button', { type: 'button', class: 'btn plain' }, 'Download this bundle');
  dlBtn.addEventListener('click', async () => {
    if (busy) return;
    busy = true; dlBtn.disabled = true;
    say(rows.some((r) => r.kind === 'music') ? 'Putting the bundle together. Music takes a few seconds…' : 'Putting the bundle together…');
    try {
      const files = await packageFiles({ items: items(), theme, scale: 1, onProgress: say });
      saveBlob(zip(files), `${bundle.id}.zip`);
      const count = (ext) => files.filter((f) => f.name.endsWith(ext)).length;
      say(`Downloaded ${bundle.id}.zip: ${plural(count('.png'), 'sprite sheet')}, ${plural(count('.wav'), 'sound file')}, a list of everything and a guide, all with this look.`);
    } catch (e) {
      console.warn(e);
      say(`The download did not start: ${e.message}. Try again, or use a different browser.`);
    }
    busy = false; dlBtn.disabled = false;
  });

  const counts = [['sprite', 'sprite'], ['sound', 'sound'], ['music', 'music track']]
    .map(([k, word]) => [rows.filter((r) => r.kind === k).length, word]).filter(([c]) => c).map(([c, w]) => plural(c, w));
  // Sprites, sounds and music, each split into groups under everyday headings with counts (app/shelves.js: from each
  // asset's type and role, so any bundle is grouped the same way). A list of the groups at the top moves to each one.
  const jumps = [];
  const counted = (label, count) => [label, ' ', el('span', { class: 'n' }, String(count))];
  const goTo = (heading) => () => { heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' }); };
  function kindSection(title, kind, word) {
    const groups = shelvesOf(rows.filter((r) => r.kind === kind && tileOf.has(r)));
    if (!groups.length) return null;
    const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
    const h2 = el('h2', { class: 'bundle-shelf', tabindex: '-1' }, counted(title, total));
    const list = [];
    const sections = groups.map((g) => {
      const h3 = groups.length > 1 ? el('h3', { class: 'bundle-group-name', tabindex: '-1' }, counted(g.label, g.rows.length)) : null;
      if (h3) list.push(el('li', {}, el('button', { type: 'button', class: 'pill', onclick: goTo(h3), 'aria-label': `${g.label}: ${plural(g.rows.length, word)}` }, counted(g.label, g.rows.length))));
      return el('section', { class: 'bundle-group', 'data-group': g.key }, h3, el('ul', { class: `bundle-grid ${kind === 'music' ? kind : kind + 's'}` }, g.rows.map((r) => tileOf.get(r).node)));
    });
    if (!list.length) list.push(el('li', {}, el('button', { type: 'button', class: 'pill', onclick: goTo(h2), 'aria-label': `${title}: ${plural(total, word)}` }, counted(title, total))));
    jumps.push(el('div', { class: 'bundle-jump-row' }, el('span', { class: 'label' }, title), el('ul', {}, list)));
    return el('section', { class: `bundle-kind-${kind}` }, h2, sections);
  }
  const shelves = [kindSection('Sprites', 'sprite', 'sprite'), kindSection('Sounds', 'sound', 'sound'), kindSection('Music', 'music', 'track')];
  const jumpNav = jumps.length && tiles.length > 12 ? el('nav', { class: 'bundle-jump', 'aria-label': 'What is in this bundle' }, jumps) : null;

  main.append(
    el('p', { class: 'bundle-kicker' }, `Bundle for ${GAME_WORDS[bundle.gameType] ?? bundle.gameType.replace(/-/g, ' ') + ' games'} · ${counts.join(', ')}`),
    el('h1', { class: 'small' }, bundle.name),
    el('p', { class: 'lede' }, bundle.blurb),
    el('div', { class: 'bundle-actions' },
      el('button', { type: 'button', class: 'btn', onclick: () => addAll() }, 'Add the whole bundle to my bag'),
      el('button', { type: 'button', class: 'btn plain', onclick: () => addAll(() => { location.hash = '#/play'; }) }, 'Try it in the playground'),
      dlBtn, ask, status, goBag),
    el('div', { class: 'bundle-layout' },
      el('aside', { class: 'bundle-look' }, controls.node),
      el('div', { class: 'bundle-assets' },
        jumpNav,
        shelves,
        n ? null : el('p', { class: 'empty' }, 'This bundle is empty.'))));
  app.replaceChildren(header(''), main);

  // ---- only what is on screen is drawn
  const watched = new Map(tiles.map((t) => [t.watch, t]));
  const io = new IntersectionObserver((entries) => { for (const e of entries) watched.get(e.target)?.setVisible(e.isIntersecting); }, { rootMargin: '200px 0px' });
  for (const w of watched.keys()) io.observe(w);

  setLook(theme, { address: false });
  let raf = 0;
  const loop = (now) => { for (const t of tiles) t.tick(now); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    queue.stop();
    for (const t of tiles) if (t.stop) t.stop();
  };
}
