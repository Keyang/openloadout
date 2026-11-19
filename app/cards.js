// Cards for sprites, sounds, music and kits, made from catalogue rows (generated/catalog.json), in the Catalogue look
// (docs/site-design.md): a shelf tile, the name, one tag, + to add it to the bag. Styles: app/css/library.css.
//
//   a sprite     its picture on the tile; on hover or keyboard focus its preview animation, played from the strip
//                picture; three version dots that add a ready-made version straight to the bag (app/versions.js), and
//                show that version on the tile while the pointer or the focus is on the dot
//   a sound      its icon on the tile, its length, a play button
//   a track      the same, with the music icon
//   a kit        a few of its sprites on a wide tile, what it is for, what is in it
//
// A card costs nothing until it is looked at: it shows the build's thumbnail, and only loads more (a strip picture to
// animate, one sound to play, the sprite's own program to show a version) when the visitor hovers or presses it.
// The one exception is an asset made on this visit (Contract 11): the build never saw it, so its row has no pictures
// (thumb: null) and its card draws from the sprite itself, which is already in memory.
//
// Every card is { node, stop(), tick() }. cardFor(row) picks the right one; cardFor(row, { layout: 'row' }) gives the
// same card laid out as a list row with more facts (the library's list view, the bag).
import { labelFor } from '../catalog/schema.js';
import { el, reduceMotion } from './ui.js';
import { assetById, bundlesOf, loadSound, loadSprite } from './catalog.js';
import { soundById, soundParams, renderAsync, playRendered, playLive } from './audio.js';
import { renderPixels, defaultParams, cleanParams } from '../engine/sprite.js';
import { bag } from './bag.js';
import { backdropFor } from './stage.js';
import { loadVersions, versionsFor } from './versions.js';
import { tileScale, rowCrop, rowFacts, lengthWords, dotColour, versionSettings, versionInBag } from './library-state.js';

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const DOTS = 3;          // ready-made versions offered on a card

/** A catalogue row for whatever was handed in: a row, an id, or an asset's own object (a sprite program or a patch). */
const rowOf = (x) => (typeof x === 'string' ? assetById(x) : x && x.kind && x.src ? x : (x && assetById(x.id)) || x);

// ---- icons: 1.5px strokes, like the rest of the site -------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
function icon(d, { size = 16, box = 16, fill = false } = {}) {
  const n = document.createElementNS(NS, 'svg');
  n.setAttribute('viewBox', `0 0 ${box} ${box}`); n.setAttribute('width', size); n.setAttribute('height', size); n.setAttribute('aria-hidden', 'true');
  if (fill) n.setAttribute('fill', 'currentColor');
  else { n.setAttribute('fill', 'none'); n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', '1.5'); n.setAttribute('stroke-linecap', 'round'); n.setAttribute('stroke-linejoin', 'round'); }
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); n.append(p);
  return n;
}
const PLUS = 'M8 3.5v9M3.5 8h9', CHECK = 'M3.5 8.5l3 3 6-7', PLAY = 'M5 3.2v9.6L13 8z', STOP = 'M4.5 4.5h7v7h-7z';
// What a sound is for, drawn on its tile (24 units): one picture per top-level use in the catalogue (catalog/schema.js, ROLE_TOPS).
const SOUND_ICONS = {
  characters: 'M4.5 5.5h15v10h-7.5l-4 3.5v-3.5h-3.5ZM9 10.5h.01M12 10.5h.01M15 10.5h.01',
  actions: 'M12 2.5v4.5M12 17v4.5M2.5 12H7M17 12h4.5M5.3 5.3l3.2 3.2M15.5 15.5l3.2 3.2M18.7 5.3l-3.2 3.2M8.5 15.5l-3.2 3.2',
  items: 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM12 9v6',
  world: 'M6.5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 17.5 5v15.5M4 20.5h16M14.25 12.5h.01',
  effects: 'M11 3l1.9 5.6L18.5 10.5l-5.6 1.9L11 18l-1.9-5.6L3.5 10.5l5.6-1.9ZM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z',
  environment: 'M3 9h10.5a2.75 2.75 0 1 0-2.75-2.75M3 13.5h15.25A2.75 2.75 0 1 1 15.5 16.25M3 18h6.5',
  interface: 'M5.5 4.5 19 10.5l-5.8 1.9-1.9 5.8ZM13.5 13.5l5 5',
  music: 'M9 17.5V5.5l10-2v12M9 17.5a2.75 2.75 0 1 1-5.5 0 2.75 2.75 0 0 1 5.5 0ZM19 15.5a2.75 2.75 0 1 1-5.5 0 2.75 2.75 0 0 1 5.5 0ZM9 9.5l10-2',
  any: 'M4 9.5v5h3.5l5 4v-13l-5 4ZM16 9a4.25 4.25 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
};
/** The icon of a sound or a track (an svg element, drawn in the current text colour): what it is for, from its catalogue row. For any page that lists sounds. */
export const soundIcon = (row, size = 40) => icon(SOUND_ICONS[row.kind === 'music' ? 'music' : String(row.role ?? '').split('/')[0]] ?? SOUND_ICONS.any, { size, box: 24 });

// Only one card makes sound at a time.
let sounding = null;
function takeTurn(card) { if (sounding && sounding !== card) sounding.quiet(); sounding = card; }

// ---- the bag: the + on every card, and the version dots ----------------------------------------------
// One listener keeps every card on the page in step with the bag, whoever changed it.

/**
 * The + on a card: adds the asset with its standard settings. Once it is in the bag the button shows a tick and leads
 * to the bag (it never adds a second copy, and never throws away what was changed): the same two wordings as everywhere,
 * "Add to my bag" and "In your bag".
 */
function showInBag(btn, items) {
  const { kind, id, name } = btn.dataset;
  const yes = items.some((i) => i.kind === kind && i.id === id);
  if (btn.classList.contains('in-bag') === yes && btn.firstChild) return;
  btn.classList.toggle('in-bag', yes);
  btn.setAttribute('aria-label', yes ? `${name} is in your bag. Go to your bag` : `Add ${name} to my bag`);
  btn.title = yes ? 'In your bag. Go to your bag' : 'Add to your bag';
  // the words every "add" on the site uses, for anything that reads the button's own text
  btn.replaceChildren(icon(yes ? CHECK : PLUS), el('span', { class: 'add-word sr' }, yes ? 'In your bag' : 'Add to my bag'));
}
function showDot(dot, items) {
  const yes = versionInBag(items, dot.dataset.kind, dot.dataset.id, dot.version);
  dot.setAttribute('aria-pressed', String(yes));
}
function syncBag(root = document) {
  const items = bag.items();
  for (const btn of root.querySelectorAll('.card-add')) showInBag(btn, items);
  for (const dot of root.querySelectorAll('.vdot')) if (dot.version) showDot(dot, items);
}
bag.onChange(() => syncBag());

const mine = (row) => bag.items().filter((i) => i.kind === row.kind && i.id === row.id);

function addButton(row) {
  const btn = el('button', { type: 'button', class: 'tile-add card-add', 'data-kind': row.kind, 'data-id': row.id, 'data-name': row.name });
  showInBag(btn, bag.items());
  btn.addEventListener('click', () => {
    if (btn.classList.contains('in-bag')) location.hash = '#/bag'; else bag.add({ kind: row.kind, id: row.id, settings: {} });
  });
  // a card kept from before (the list was narrowed and widened again) may have missed a change to the bag
  btn.addEventListener('pointerenter', () => showInBag(btn, bag.items()));
  btn.addEventListener('focus', () => showInBag(btn, bag.items()));
  return btn;
}

/**
 * The version dots of one card. `show(version | null)`: what the card does while the pointer or the focus is on a dot.
 * Pressing a dot puts that version in the bag: the asset's own item is changed to it if there is one, otherwise it is added.
 */
function versionDots(row, show) {
  const box = el('div', { class: 'card-dots', role: 'group', 'aria-label': `Ready-made versions of ${row.name}`, hidden: true });
  const fill = (list) => {
    const versions = (list ?? []).slice(0, DOTS);
    if (!versions.length) return;
    box.replaceChildren(...versions.map((v, i) => {
      const dot = el('button', { type: 'button', class: 'vdot', 'data-kind': row.kind, 'data-id': row.id, style: `--dot:${dotColour(v, i)}`, title: `${v.name}: add this version`, 'aria-label': `Add the ${v.name} version of ${row.name}`, 'aria-pressed': 'false' });
      dot.version = v;
      const on = () => show(v), off = () => show(null);
      dot.addEventListener('pointerenter', on);
      dot.addEventListener('pointerleave', off);
      dot.addEventListener('focus', on);
      dot.addEventListener('blur', off);
      dot.addEventListener('click', () => {
        const settings = versionSettings(row.kind, v), own = mine(row).pop();
        if (own) bag.update(own.key, { ...own.settings, ...settings }); else bag.add({ kind: row.kind, id: row.id, settings });
      });
      return dot;
    }));
    box.hidden = false;
    syncBag(box);
  };
  return { node: box, fill };
}

// ---- pieces every card shares -------------------------------------------------------------------------

const draft = (row) => row.runtime && row.ok === false;       // made on this visit and not yet through the quality bar: it cannot go in the bag
const href = (row) => `#/${row.kind}/${row.id}`;
/** The name, as the card's one link: it covers the whole card (library.css), so the picture opens the page too, with one stop for the keyboard. */
const title = (row) => el('a', { class: 'card-title card-link', href: href(row) }, row.name);
const tagOf = (row) => labelFor('type', row.type);
const kitsOf = (row) => bundlesOf(row.id).map((b) => b.name).join(', ');

/** A list row's cells after the tile: name and line, type, kits, animations, controls, length. */
function facts(row, link, tag) {
  const f = rowFacts(row);
  return [
    el('div', { class: 'row-name' }, link, el('span', { class: 'desc' }, row.description ?? '')),
    el('span', { class: 'cell c-type' }, tag),
    el('span', { class: 'cell c-kit' }, kitsOf(row) || 'No kit'),
    el('span', { class: 'cell num c-anim' }, f.animations),
    el('span', { class: 'cell num c-ctl' }, f.controls),
    el('span', { class: 'cell num c-len' }, f.length),
  ];
}

// ---- a sprite -------------------------------------------------------------------------------------------

/**
 * A sprite: its thumbnail; on hover or focus its preview animation played from the strip picture; version dots.
 * opts.layout: 'row' for a list row.
 */
export function spriteCard(asset, { layout = 'card' } = {}) {
  const row = rowOf(asset), inRow = layout === 'row';
  const [fw, fh] = row.tech?.frame ?? [64, 64];
  const cover = backdropFor(row) === 'fill';                 // a background fills its tile
  const crop = inRow && !cover ? rowCrop(row) : null;
  const k = cover ? (inRow ? 1 : 2) : crop ? 1 : tileScale(fw, fh, inRow ? 64 : 136);
  const size = `width:${fw * k}px;height:${fh * k}px`;
  const thumb = row.thumb ? el('img', { class: 'thumb px', src: row.thumb, alt: '', width: fw, height: fh, style: size, loading: 'lazy', decoding: 'async', draggable: 'false' }) : null;
  const canvas = el('canvas', { class: 'anim px', width: fw, height: fh, style: size, hidden: true, 'aria-hidden': 'true' });
  const pic = el('span', { class: `card-pic${crop ? ' is-crop' : ''}`, style: crop ? `--ox:${crop.x}px;--oy:${crop.y}px` : null }, thumb, canvas);
  const tag = el('span', { 'data-tag': '' }, tagOf(row));
  const link = title(row);
  const dots = draft(row) ? null : versionDots(row, (v) => { want.version = v; sync(); });
  const add = draft(row) ? null : addButton(row);
  const tile = el('div', { class: `card-tile tile${cover ? ' is-cover' : ''}` }, pic, inRow ? null : dots?.node, inRow ? null : add);
  const node = inRow
    ? el('div', { class: 'card card-cell row', 'data-kind': 'sprite' }, tile, facts(row, link, tag), dots ? dots.node : el('span', {}), add ?? el('span', {}))
    // the name comes first for the keyboard and for screen readers; the sheet shows the tile above it
    : el('div', { class: 'card card-cell', 'data-kind': 'sprite' }, el('div', { class: 'card-meta' }, link, el('span', { class: 'card-tag' }, tag)), tile);

  const frames = row.stripFrames || 1, fps = row.stripFps || 10;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  let strip = null, raf = 0, playing = null, shown = -1, t0 = 0, gone = false;
  // no built picture (made on this visit): the canvas is the picture, drawn from the sprite itself, frame by frame as needed
  const live = !row.thumb && row.runtime === true;
  let sprite = null, loading = null;
  const program = () => (loading ??= loadSprite(row.id).then((s) => { sprite = s; return s; }));
  const cells = new Map();          // version name ('' for the sprite as it is) -> its frames, drawn as needed
  const clipOf = () => row.stripClip ?? sprite.preview;
  const frameOf = (v, f) => {
    const key = v ? v.name : '';
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    if (!list[f]) {
      const params = v ? cleanParams(sprite, { ...defaultParams(sprite), ...(v.params ?? {}) }) : defaultParams(sprite);
      const count = sprite.clips[clipOf()]?.frames ?? 1;
      list[f] = new ImageData(new Uint8ClampedArray(renderPixels(sprite, clipOf(), f % count, params).data.buffer), fw, fh);
    }
    return list[f];
  };
  const showCanvas = (yes) => { canvas.hidden = !yes; if (thumb) thumb.hidden = yes; };
  const still = () => { if (sprite) { g.putImageData(frameOf(null, 0), 0, 0); shown = 0; } };
  if (live) {
    canvas.hidden = false;
    program().then(() => { if (gone) return; still(); if (dots) versionsFor('sprite', sprite, DOTS).then(dots.fill); })
      .catch((e) => console.warn(`Loadout: the card for "${row.id}" could not be drawn.`, e));
  } else if (dots) loadVersions().then((file) => { if (!gone) dots.fill(file[row.id]); });

  const want = { hover: false, focus: false, version: null };
  // what plays now: a version (drawn by the sprite's program), the sprite's own animation (from the strip picture), or nothing
  const modeOf = () => (want.version ? `v:${want.version.name}` : want.hover || want.focus ? 'own' : null);
  const draw = (now) => {
    const f = Math.floor((Math.max(0, now - t0) / 1000) * fps) % frames;      // a frame's clock can read a little before t0
    if (f !== shown) {
      shown = f;
      if (want.version) g.putImageData(frameOf(want.version, f), 0, 0);
      else if (live) g.putImageData(frameOf(null, f), 0, 0);
      else { g.clearRect(0, 0, fw, fh); g.drawImage(strip, f * fw, 0, fw, fh, 0, 0, fw, fh); }
    }
    raf = requestAnimationFrame(draw);
  };
  const rest = () => {
    playing = null; cancelAnimationFrame(raf);
    tag.textContent = tagOf(row);
    if (live) { still(); return; }
    showCanvas(false);
  };
  async function sync() {
    const mode = modeOf();
    if (mode === playing) return;
    cancelAnimationFrame(raf);
    if (!mode) { rest(); return; }
    playing = mode;
    const version = want.version;
    tag.textContent = version ? `${version.name} version` : tagOf(row);
    try {
      if (version || live) await program();
      else if (!strip && row.strip && frames > 1 && !reduceMotion.matches) {
        const img = new Image();
        img.src = row.strip;
        await img.decode();
        strip = img;
      }
    } catch { if (playing === mode) playing = null; return; }      // nothing more to show: the still picture stays
    if (playing !== mode || gone) return;                            // moved on while it loaded
    if (version) {
      // a version is shown at once, and moves like the sprite does unless the visitor asked for less motion
      g.putImageData(frameOf(version, 0), 0, 0);
      showCanvas(true);
      if (frames < 2 || reduceMotion.matches) return;
    } else if (live ? frames < 2 || reduceMotion.matches : !strip) { if (live) still(); else showCanvas(false); return; }
    t0 = performance.now(); shown = -1;
    showCanvas(true);
    draw(t0);
  }
  node.addEventListener('pointerenter', () => { want.hover = true; sync(); });
  node.addEventListener('pointerleave', () => { want.hover = false; want.version = null; sync(); });
  link.addEventListener('focus', () => { want.focus = true; sync(); });
  link.addEventListener('blur', () => { want.focus = false; sync(); });
  return { node, stop() { gone = true; want.hover = want.focus = false; want.version = null; rest(); }, tick() {} };
}

// ---- a sound, a track ---------------------------------------------------------------------------------

/** What a sound and a music card share: the icon on the tile, Play and Stop, one thing sounding at a time. */
function audioCard(row, { tag, length, begin, loops }, { layout = 'card' } = {}) {
  const inRow = layout === 'row';
  const play = el('button', { class: 'tile-play', type: 'button', 'aria-label': `Play ${row.name}` }, icon(PLAY, { fill: true }));
  const progress = el('span', { class: 'tile-progress', 'aria-hidden': 'true' });
  const link = title(row);
  const add = draft(row) ? null : addButton(row);
  const tile = el('div', { class: 'card-tile tile' }, el('span', { class: 'card-pic sound-pic' }, soundIcon(row, inRow ? 24 : 40)), inRow ? null : play, inRow ? null : add, progress);
  const node = inRow
    ? el('div', { class: 'card card-cell row sound', 'data-kind': row.kind }, tile, facts(row, link, tag), play, add ?? el('span', {}))
    : el('div', { class: 'card card-cell sound', 'data-kind': row.kind },
      el('div', { class: 'card-meta' }, link, el('span', { class: 'card-tag' }, el('span', { 'data-tag': '' }, tag), length ? el('span', { class: 'num' }, length) : null)), tile);
  let voice = null, busy = false, turn = 0;
  const show = () => {
    node.classList.toggle('playing', !!voice);
    node.classList.toggle('loading', busy);
    play.setAttribute('aria-label', `${voice ? 'Stop' : 'Play'} ${row.name}`);
    play.replaceChildren(icon(voice ? STOP : PLAY, { fill: true }));
    // the line along the foot of the tile: it runs the length of a one-shot sound, and stays for something that loops
    progress.classList.remove('run', 'on');
    if (voice && loops) progress.classList.add('on');
    else if (voice) {
      progress.style.setProperty('--ms', `${Math.max(120, Math.round((row.tech?.seconds ?? 0.6) * 1000))}ms`);
      void progress.offsetWidth;
      progress.classList.add('run');
    }
  };
  // quiet(): stop what plays, and drop anything still loading
  const me = { quiet() { turn++; if (voice) voice.stop(); voice = null; show(); } };
  play.addEventListener('click', async () => {
    if (voice) { me.quiet(); return; }
    if (busy) return;
    const mine = ++turn;
    busy = true; show();
    try {
      const patch = soundById[row.id] ?? await loadSound(row.id);       // just this one sound
      takeTurn(me);
      const v = await begin(patch, () => { voice = null; show(); });
      if (mine === turn) voice = v; else if (v) v.stop();               // stopped, or the page moved on, while it loaded
      play.removeAttribute('title');
    } catch (e) {
      console.error(`${row.kind} ${row.id}:`, e);
      play.setAttribute('title', 'This could not be played. Reload the page and try again.');
    }
    busy = false; show();
  });
  return { node, stop: me.quiet, tick() {} };
}

/** A sound effect: its icon on the tile, its length. Pressing play loads that one sound and plays it. */
export function soundCard(asset, opts) {
  const row = rowOf(asset);
  const loops = !!row.tech?.loop;
  return audioCard(row, {
    tag: tagOf(row), length: lengthWords(row.tech?.seconds, loops), loops,
    begin: async (patch, ended) => playRendered(await renderAsync(patch, soundParams(patch)), { force: true, loop: false, onended: ended }),
  }, opts);
}

/** A music track: the music icon on the tile, its length. Pressing play plays the track until it is stopped. */
export function musicCard(asset, opts) {
  const row = rowOf(asset);
  return audioCard(row, {
    tag: tagOf(row), length: lengthWords(row.tech?.seconds), loops: true,
    begin: (patch) => playLive(patch, soundParams(patch)),
  }, opts);
}

/** The right card for a catalogue row. opts.layout: 'card' (the default) or 'row'. Returns { node, stop(), tick() }. */
export const cardFor = (row, opts) => (row.kind === 'sprite' ? spriteCard(row, opts) : row.kind === 'music' ? musicCard(row, opts) : soundCard(row, opts));

// ---- a kit ------------------------------------------------------------------------------------------------

/** A kit (a game kit, a character set, an object set): a few of its sprites, what it is for, and what is in it. The whole card is the link to its page. */
export function bundleCard(bundle) {
  const pics = [];
  let width = 0;
  for (const id of bundle.sprites ?? []) {
    const row = assetById(id);
    if (!row || !row.thumb) continue;
    const [fw, fh] = row.tech?.frame ?? [64, 64];
    if (fh > 72 || fw > 96) continue;                        // big pictures (backgrounds, bosses) do not sit in a row of small ones
    width += fw * 2;
    if (width > 384 || pics.length === 4) break;             // what fits the narrowest card
    pics.push(el('img', { class: 'px', src: row.thumb, alt: '', width: fw * 2, height: fh * 2, loading: 'lazy', decoding: 'async', draggable: 'false' }));
  }
  const first = !pics.length ? [...(bundle.sounds ?? []), ...(bundle.music ?? [])].map(assetById).find(Boolean) : null;
  const n = { sprites: (bundle.sprites ?? []).length, sounds: (bundle.sounds ?? []).length, music: (bundle.music ?? []).length };
  const holds = [n.sprites && plural(n.sprites, 'sprite'), n.sounds && plural(n.sounds, 'sound'), n.music && plural(n.music, 'music track')].filter(Boolean).join(', ');
  const node = el('a', { class: 'card kit', href: `#/bundle/${bundle.id}` },
    el('span', { class: 'card-tile tile kitcard-tile' }, el('span', { class: 'kitcard-pics' }, pics.length ? pics : first ? soundIcon(first, 40) : null)),
    el('span', { class: 'card-meta' },
      el('span', { class: 'card-title' }, bundle.name),
      bundle.blurb ? el('span', { class: 'kitcard-blurb' }, bundle.blurb) : null,
      el('span', { class: 'card-tag' },
        el('span', {}, holds),
        bundle.gameType ? el('span', { class: 'kitcard-for' }, bundle.gameType === 'any' ? 'For any game' : labelFor('gameType', bundle.gameType)) : null)));
  return { node, stop() {}, tick() {} };
}
export const kitCard = bundleCard;

/** Kept for pages written against the first cards: cards now run themselves. Returns a function that stops them. */
export function runCards(cards) {
  return () => { for (const c of cards) if (c && c.stop) c.stop(); };
}
