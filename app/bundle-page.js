// One kit (#/bundle/<id>; a kit is a "bundle" in addresses and in the code). Top to bottom (docs/site-design.md, section 5):
// the kit as a living scene with its facts and its three actions (add it all, try it, download it); the look for
// the whole kit (named looks, Surprise me, fine-tuning); then everything in it as a grid of cards, grouped under
// everyday headings, every picture and sound restyled together by the look (features EDIT-6, BAG-6; architecture.md
// Contracts 4, 6, 7, 8).
//
// Built for big bundles (45 sprites, 20 sounds): a picture is only loaded, restyled and
// animated while it is on screen. A sprite's picture is the catalogue's strip of its
// preview animation, split into its few colours once, so a new look repaints it from a
// short list of colours instead of drawing it again. With "Also change shapes" the
// sprite's own program draws the frames it needs.
import { loadCatalog, bundleById, assetsOfBundle, loadSprite, loadSound } from './catalog.js';
import { normalizeTheme, renderThemedFrame, spriteMaterials } from '../engine/theme.js';
import { applySound, themedSoundParams, soundSettingsFor } from '../sound/theme.js';
import { el, header, saveBlob, reduceMotion, cap } from './ui.js';
import { kitScene } from './kit-scene.js';
import { soundById, soundParams, rendered, renderAsync, playRendered, playLive } from './audio.js';
import { bag, cleanSettings } from './bag.js';
import { packageFiles, activeTheme } from './bundle.js';
import { zip } from './zip.js';
import { shelvesOf } from './shelves.js';
import { labelFor } from '../catalog/schema.js';
import { themeControls, themeFromQuery, lookSearch, queryHasLook, indexPixels, recolourIndexed } from './theme-controls.js';

const PIC = 128;                 // the room for a sprite picture in its tile, in screen pixels (css/kits.css .bundle-pic: 132 high)
const MAX_ZOOM = 8;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const GAME_WORDS = { any: 'any game', platformer: 'platformer games', 'turn-based-rpg': 'turn-based role-playing games', 'roguelike-action': 'roguelike action games' };
const linkTo = (row) => `#/${row.kind}/${row.id}`;

function notHere(app, title, text) {
  document.title = 'Not here · Loadout';
  app.replaceChildren(header('bundles'), el('main', { class: 'v2 home kit-none' },
    el('h1', { class: 'h3' }, title),
    el('p', { class: 'lede' }, text),
    el('p', {}, el('a', { class: 'btn btn-primary', href: '#/bundles' }, 'See every kit'))));
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
  const node = el('li', { class: 'card bundle-card bundle-sprite' },
    el('a', { class: 'card-tile tile bundle-pic', href: linkTo(row), tabindex: '-1', 'aria-hidden': 'true' }, cv),
    el('div', { class: 'card-meta' },
      el('a', { class: 'card-title bundle-name', href: linkTo(row) }, row.name),
      el('span', { class: 'card-tag bundle-kind' }, labelFor('type', row.type) || cap(row.type ?? 'sprite'))));

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

const svgIcon = (d) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  n.setAttribute('viewBox', '0 0 16 16'); n.setAttribute('width', '28'); n.setAttribute('height', '28'); n.setAttribute('aria-hidden', 'true');
  n.setAttribute('fill', 'none'); n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', '1.2'); n.setAttribute('stroke-linecap', 'round'); n.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); n.append(p);
  return n;
};
const ICON = {
  sound: 'M2.5 6.2v3.6h2.3L8 12.6V3.4L4.8 6.2H2.5ZM10.4 5.8a3 3 0 0 1 0 4.4M12.2 4a5.5 5.5 0 0 1 0 8',
  music: 'M6 12V3.5l6-1.5v8.5M6 12a1.8 1.8 0 1 1-3.6 0A1.8 1.8 0 0 1 6 12Zm6-1.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z',
};

// A sound: its icon on the tile and a button that plays it as this look makes it (no waveform pictures: a standing rule).
function soundTile(row, patch) {
  const btn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary play' });
  const node = el('li', { class: 'card bundle-card bundle-sound', 'data-id': row.id, 'data-played': '0' },
    el('div', { class: 'card-tile tile bundle-pic sound' }, svgIcon(ICON.sound), btn),
    el('div', { class: 'card-meta' },
      el('a', { class: 'card-title bundle-name', href: linkTo(row) }, row.name),
      el('span', { class: 'card-tag bundle-kind' }, cap(patch.category ?? 'sound') + (patch.loop ? ', loops' : ''))));
  let look = null, key = null, r = null, rKey = null, handle = null;
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
  const sync = () => { const w = handle ? 'Stop' : 'Play'; btn.textContent = w; btn.setAttribute('aria-label', `${w} ${row.name}`); node.classList.toggle('is-playing', !!handle); };
  btn.addEventListener('click', () => {
    if (handle) { handle.stop(); handle = null; sync(); return; }
    try {
      handle = playRendered(make(), { force: true, loop: !!patch.loop, onended: () => { handle = null; sync(); } });
      node.dataset.played = String(Number(node.dataset.played) + 1);
    } catch (e) { console.warn(e); node.dataset.played = 'error'; }
    sync();
  });
  sync();
  return {
    node, watch: node,
    setVisible() {},
    restyle(t, k) {
      look = t; key = k;
      if (handle) { handle.stop(); handle = null; sync(); }
    },
    tick() {},
    stop() { if (handle) handle.stop(); handle = null; },
  };
}

// ---- a music track ---------------------------------------------------------------------------

function musicTile(row, patch) {
  const btn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary music-play' });
  const about = el('span', { class: 'card-tag bundle-tempo' });
  const node = el('li', { class: 'card bundle-card bundle-music', 'data-id': row.id },
    el('div', { class: 'card-tile tile bundle-pic music' }, svgIcon(ICON.music), btn),
    el('div', { class: 'card-meta' },
      el('a', { class: 'card-title bundle-name', href: linkTo(row) }, row.name),
      about));
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
      const bpm = params.bpm ? `Music, ${Math.round(params.bpm)} beats a minute` : 'Music';
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
  if (!bundle) return notHere(app, 'That kit is not here', 'The link may be old or mistyped. Everything that exists is on the front page.');
  document.title = `${bundle.name} · Loadout`;

  const rows = assetsOfBundle(bundle);
  const original = normalizeTheme(bundle.theme);
  let theme = queryHasLook(query) ? themeFromQuery(query) : original;
  const keyOf = (t) => (JSON.stringify(t) === JSON.stringify(original) ? 'original' : lookSearch(t) || 'look=original');

  const page = { start: performance.now() };
  const tiles = [];
  const tileOf = new Map();       // catalogue row -> its tile
  for (const row of rows) {
    if (row.kind === 'sprite') tiles.push(spriteTile(row, page));
    else {
      const patch = soundById[row.id] ?? await loadSound(row.id).catch(() => null);
      if (!still()) { for (const t of tiles) if (t.stop) t.stop(); return null; }
      if (!patch) continue;
      tiles.push(row.kind === 'music' ? musicTile(row, patch) : soundTile(row, patch));
    }
    tileOf.set(row, tiles.at(-1));
  }

  const main = el('main', { class: 'v2 bundle-page' });
  const scene = kitScene(bundle, { theme });

  function setLook(t, { address = true } = {}) {
    theme = normalizeTheme(t);
    const key = keyOf(theme);
    main.dataset.look = key;
    const now = performance.now();
    const t0 = performance.now();
    for (const tile of tiles) tile.restyle(theme, key, now);
    scene.setLook(theme);
    main.dataset.lookMs = (performance.now() - t0).toFixed(2);
    if (address) {
      const search = key === 'original' ? '' : key;
      history.replaceState(null, '', `#/bundle/${bundle.id}${search ? '?' + search : ''}`);
    }
  }

  const controls = themeControls({ theme, original, open: window.matchMedia('(min-width: 901px)').matches, title: 'Give the whole kit a look', onChange: (t) => setLook(t) });      // on a phone the fine-tuning starts folded, so the grid is near

  // ---- actions
  const status = el('p', { class: 'status', role: 'status' });
  const say = (text) => { status.textContent = text; };
  const ask = el('div', { class: 'bundle-ask', hidden: true });
  const goBag = el('a', { class: 'link go-bag', href: '#/bag', hidden: true }, 'Go to bag');
  const n = rows.length;
  const items = () => rows.map((r, i) => ({ key: `b${i + 1}`, kind: r.kind, id: r.id, settings: cleanSettings(r.kind, {}) }));

  // what of the kit is not in the bag yet: an asset that is there as the kit would add it (its standard settings) is not added again
  const plainSettings = (s) => { const c = cleanSettings('sprite', s); delete c.lookParams; return JSON.stringify(c.params) === '{}' && !c.cues && c.scale === 1 && !c.artStyle && !c.look; };
  const plainSound = (s) => JSON.stringify(s?.params ?? {}) === '{}' && !s?.style && (s?.seed ?? 1) === 1 && !s?.look;
  const inBag = (it, held) => held.some((h) => h.kind === it.kind && h.id === it.id && (it.kind === 'sprite' ? plainSettings(h.settings) : plainSound(h.settings)));
  function fresh() {
    const held = bag.items(), seen = new Set();
    return items().filter((it) => { const k = it.kind + ':' + it.id; if (seen.has(k) || inBag(it, held)) return false; seen.add(k); return true; });
  }
  const notKeptNote = () => (bag.kept() ? '' : ' This browser is not keeping your bag: it will be gone when you reload or close the page. Download it or copy its link from your bag before you leave.');
  function put(mode, then, keepLook = false) {     // looks: keepLook leaves the bag the look it already has
    ask.hidden = true;
    if (mode === 'replace') bag.clear();
    const add = fresh();
    for (const it of add) bag.add({ kind: it.kind, id: it.id, settings: it.settings });
    if (!keepLook) bag.setTheme(theme);
    const what = mode === 'replace' ? `Your bag now holds ${plural(add.length, 'thing')} from ${bundle.name}`
      : add.length ? `Added ${plural(add.length, 'thing')} from ${bundle.name} to your bag` : `Everything from ${bundle.name} was already in your bag`;
    const lookSaid = keepLook ? (add.length ? '. They take the look your bag already has' : '. It keeps the look your bag already has') : ', and the whole bag has this look';
    say(`${what}${lookSaid}. It holds ${plural(bag.count(), 'thing')}.` + notKeptNote());
    goBag.hidden = false;
    if (then) then();
  }
  function addAll(then) {
    if (!bag.count()) { put('add', then); return; }
    const m = bag.count();
    // the whole kit is in the bag already: there is nothing to add, so nothing is asked on the way to the playground,
    // and nothing at all when the bag wears this look too
    const sameLook = JSON.stringify(normalizeTheme(bag.theme())) === JSON.stringify(normalizeTheme(theme));
    if (!fresh().length && (then || sameLook)) {
      ask.hidden = true;
      say(`Everything from ${bundle.name} is already in your bag. It holds ${plural(m, 'thing')}.` + notKeptNote());
      goBag.hidden = false;
      if (then) then();
      return;
    }
    // the same look: the same colours, sound and music, and the same shapes (the number behind "Surprise me" only matters with shapes)
    const lookOf = (t) => { const x = normalizeTheme(t); return JSON.stringify([x.colour, x.sound, x.music, x.shapes, x.shapes ? x.seed : 0]); };
    const ownLook = lookOf(bag.theme()) !== lookOf({}) && lookOf(bag.theme()) !== lookOf(theme);
    ask.replaceChildren(
      // looks: a bag that has a look of its own, different from the one shown here, never loses it without being asked
      ...(ownLook ? [
        el('p', {}, `Your bag already has ${plural(m, 'thing')} in it, with a look of its own. Add this kit and keep your bag's look, add it and give everything this look, or replace what is in your bag (the bag then takes this look)?`),
        el('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => put('add', then, true) }, 'Add, and keep my bag\'s look'),
        el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => put('add', then) }, 'Add, and give everything this look'),
      ] : [
        el('p', {}, `Your bag already has ${plural(m, 'thing')} in it. Add this kit to them, or replace them? Either way, the whole bag takes this look.`),
        el('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => put('add', then) }, 'Add to what is in my bag'),
      ]),
      el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => put('replace', then) }, 'Replace what is in my bag'),
      el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { ask.hidden = true; say(''); } }, 'Cancel'));
    ask.hidden = false;
    ask.querySelector('button').focus();
  }
  let busy = false;
  const dlBtn = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Download this kit');
  dlBtn.addEventListener('click', async () => {
    if (busy) return;
    busy = true; dlBtn.disabled = true;
    say(rows.some((r) => r.kind === 'music') ? 'Putting the kit together. Music takes a few seconds…' : 'Putting the kit together…');
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
    const h2 = el('h2', { class: 'h4 bundle-shelf', tabindex: '-1' }, counted(title, total));
    const list = [];
    const sections = groups.map((g) => {
      const h3 = groups.length > 1 ? el('h3', { class: 'bundle-group-name', tabindex: '-1' }, counted(g.label, g.rows.length)) : null;
      if (h3) list.push(el('li', {}, el('button', { type: 'button', class: 'chip', onclick: goTo(h3), 'aria-label': `${g.label}: ${plural(g.rows.length, word)}` }, counted(g.label, g.rows.length))));
      return el('section', { class: 'bundle-group', 'data-group': g.key }, h3, el('ul', { class: `bundle-grid ${kind === 'music' ? kind : kind + 's'}` }, g.rows.map((r) => tileOf.get(r).node)));
    });
    if (!list.length) list.push(el('li', {}, el('button', { type: 'button', class: 'chip', onclick: goTo(h2), 'aria-label': `${title}: ${plural(total, word)}` }, counted(title, total))));
    jumps.push(el('div', { class: 'bundle-jump-row' }, el('span', { class: 'label' }, title), el('ul', {}, list)));
    return el('section', { class: `bundle-kind-${kind}` }, h2, sections);
  }
  const shelves = [kindSection('Sprites', 'sprite', 'sprite'), kindSection('Sounds', 'sound', 'sound'), kindSection('Music', 'music', 'track')];
  const jumpNav = jumps.length && tiles.length > 12 ? el('nav', { class: 'bundle-jump', 'aria-label': 'What is in this bundle' }, jumps) : null;

  const fact = (k, word, many = word + 's') => { const c = rows.filter((r) => r.kind === k).length; return c ? el('span', {}, el('b', { class: 'num' }, String(c)), c === 1 ? word : many) : null; };
  main.append(
    el('section', { class: 'kit-top' },
      scene.node,
      el('div', { class: 'kit-body' },
        el('p', { class: 'kit-kind bundle-kicker' }, `Kit for ${GAME_WORDS[bundle.gameType] ?? bundle.gameType.replace(/-/g, ' ') + ' games'}`),
        el('h1', { class: 'h3' }, bundle.name),
        el('p', { class: 'kit-blurb' }, bundle.blurb),
        el('div', { class: 'facts', 'aria-label': counts.join(', ') }, fact('sprite', 'sprite'), fact('sound', 'sound'), fact('music', 'music track')),
        el('div', { class: 'bundle-actions' },
          el('button', { type: 'button', class: 'btn btn-primary', onclick: () => addAll() }, 'Add the whole kit to my bag'),
          el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => addAll(() => { location.hash = '#/play'; }) }, 'Try it in the playground'),
          dlBtn, ask, status, goBag))),
    el('aside', { class: 'bundle-look' }, controls.node),
    el('div', { class: 'bundle-assets' },
      jumpNav,
      shelves,
      n ? null : el('p', { class: 'quiet' }, 'This kit is empty.')));
  app.replaceChildren(header('bundles'), main);

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
    scene.stop();
    for (const t of tiles) if (t.stop) t.stop();
  };
}
