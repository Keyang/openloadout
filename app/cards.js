// Cards for sprites, sounds, music and bundles, made from catalogue rows (generated/catalog.json).
// A card costs nothing until it is looked at: it shows the build's thumbnail, and only loads more
// (a strip picture to animate, one sound to play) when the visitor hovers or presses it.
// No sprite program is ever loaded for a card.
// The one exception is an asset made on this visit (Contract 11): the build never saw it, so its row has no
// pictures (thumb: null) and its card draws from the sprite or the sound itself, which is already in memory.
import { labelFor } from '../catalog/schema.js';
import { el, TILE_BG, ROLE_BG } from './ui.js';
import { assetById, loadSound, loadSprite } from './catalog.js';
import { soundById, soundParams, renderAsync, playRendered, playLive, whenRendered, drawWave } from './audio.js';
import { renderPixels, defaultParams } from '../engine/sprite.js';
import { bag } from './bag.js';

// Pixel art is always shown at a whole-number scale: 3x on a wide screen, 2x on a phone, less when a frame is big.
const fit = (fw, fh, w, h, most) => { const f = Math.min(w / fw, h / fh); return f >= 1 ? Math.min(most, Math.floor(f)) : 1 / Math.ceil(1 / f); };
const sizes = (fw, fh) => `--fw:${fw};--fh:${fh};--k:${fit(fw, fh, 232, 192, 3)};--kp:${fit(fw, fh, 148, 128, 2)}`;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** A catalogue row for whatever was handed in: a row, an id, or an asset's own object (a sprite program or a patch). */
const rowOf = (x) => (typeof x === 'string' ? assetById(x) : x && x.kind && x.src ? x : (x && assetById(x.id)) || x);

// Only one card makes sound at a time.
let sounding = null;
function takeTurn(card) { if (sounding && sounding !== card) sounding.quiet(); sounding = card; }

/** The small "Add to bag" action every card has. The asset goes in with its standard settings. */
function addButton(row) {
  const word = el('span', { class: 'add-word' }, 'Add to bag');
  const btn = el('button', { type: 'button', class: 'card-add', 'aria-label': `Add ${row.name} to bag`, title: 'Add to your bag with its standard settings' },
    el('span', { class: 'add-plus', 'aria-hidden': 'true' }, '+'), word);
  let timer = 0;
  btn.addEventListener('click', () => {
    bag.add({ kind: row.kind, id: row.id, settings: {} });
    btn.classList.add('done');
    word.textContent = 'Added';
    clearTimeout(timer);
    timer = setTimeout(() => { btn.classList.remove('done'); word.textContent = 'Add to bag'; }, 1400);
  });
  return btn;
}

// a draft (made on this visit, not yet through the quality bar) cannot go in the bag, so its card has no button
const cell = (row, card) => el('div', { class: 'card-cell' }, card, row.runtime && row.ok === false ? null : addButton(row));
const text = (row, kind) => [el('span', { class: 'card-name' }, row.name), el('span', { class: 'card-kind' }, kind)];

/** A sprite: its thumbnail, and on hover or focus its preview animation played from the strip picture. */
export function spriteCard(asset) {
  const row = rowOf(asset);
  const [fw, fh] = row.tech?.frame ?? [64, 64];
  const [sky, ground, edge] = TILE_BG[row.type] ?? TILE_BG.character;
  const thumb = row.thumb ? el('img', { class: 'thumb pic', src: row.thumb, alt: '', width: fw, height: fh, decoding: 'async', draggable: 'false' }) : null;
  const canvas = el('canvas', { class: 'anim pic', width: fw, height: fh, hidden: true, 'aria-hidden': 'true' });
  const tile = el('span', { class: 'pic-tile on-ground', style: `${sizes(fw, fh)};--sky:${sky};--ground:${ground};--edge:${edge}` }, thumb, canvas);
  const card = el('a', { class: 'card', href: `#/sprite/${row.id}` }, tile, el('span', { class: 'card-text' }, text(row, labelFor('type', row.type))));

  const frames = row.stripFrames || 1, fps = row.stripFps || 10;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  let strip = null, raf = 0, playing = false, shown = -1, t0 = 0;
  // no built picture (made on this visit): the canvas is the picture, drawn from the sprite itself, frame by frame as needed
  const live = !row.thumb && row.runtime === true;
  let sprite = null;
  const cells = [];
  const liveFrame = (f) => (cells[f] ??= new ImageData(new Uint8ClampedArray(renderPixels(sprite, row.stripClip ?? sprite.preview, f, defaultParams(sprite)).data.buffer), fw, fh));
  const still = () => { if (sprite) { g.putImageData(liveFrame(0), 0, 0); shown = 0; } };
  if (live) {
    canvas.hidden = false;
    loadSprite(row.id).then((s) => { sprite = s; still(); }).catch((e) => console.warn(`Loadout: the card for "${row.id}" could not be drawn.`, e));
  }
  const want = { hover: false, focus: false };
  const draw = (now) => {
    const f = Math.floor((Math.max(0, now - t0) / 1000) * fps) % frames;      // a frame's clock can read a little before t0
    if (f !== shown) {
      shown = f;
      if (live) g.putImageData(liveFrame(f), 0, 0);
      else { g.clearRect(0, 0, fw, fh); g.drawImage(strip, f * fw, 0, fw, fh, 0, 0, fw, fh); }
    }
    raf = requestAnimationFrame(draw);
  };
  const rest = () => { playing = false; cancelAnimationFrame(raf); if (live) { still(); return; } canvas.hidden = true; if (thumb) thumb.hidden = false; };
  async function sync() {
    const on = want.hover || want.focus;
    if (!on) { rest(); return; }
    if (playing || (live ? !sprite : !row.strip) || frames < 2) return;
    playing = true;
    if (!live && !strip) {
      const img = new Image();
      img.src = row.strip;
      try { await img.decode(); } catch { playing = false; return; }     // no strip: the still picture stays
      strip = img;
    }
    if (!playing) return;                                                  // left while the picture loaded
    t0 = performance.now(); shown = -1;
    canvas.hidden = false; if (thumb) thumb.hidden = true;
    draw(t0);
  }
  card.addEventListener('pointerenter', () => { want.hover = true; sync(); });
  card.addEventListener('pointerleave', () => { want.hover = false; sync(); });
  card.addEventListener('focus', () => { want.focus = true; sync(); });
  card.addEventListener('blur', () => { want.focus = false; sync(); });
  return { node: cell(row, card), stop() { want.hover = want.focus = false; rest(); }, tick() {} };
}

/** What a sound or music card shares: a tile that is a button, Play and Stop, one thing sounding at a time. */
function audioCard(row, { tile, href, kind, begin }) {
  const btn = el('button', { class: 'tile-btn', type: 'button', 'aria-label': `Play ${row.name}` }, tile);
  const card = el('div', { class: 'card sound' }, btn, el('a', { class: 'card-text', href }, text(row, kind)));
  let voice = null, busy = false, turn = 0;
  const show = () => {
    card.classList.toggle('playing', !!voice);
    card.classList.toggle('loading', busy);
    btn.setAttribute('aria-label', `${voice ? 'Stop' : 'Play'} ${row.name}`);
  };
  // quiet(): stop what plays, and drop anything still loading
  const me = { quiet() { turn++; if (voice) voice.stop(); voice = null; show(); } };
  btn.addEventListener('click', async () => {
    if (voice) { me.quiet(); return; }
    if (busy) return;
    const mine = ++turn;
    busy = true; show();
    try {
      const patch = soundById[row.id] ?? await loadSound(row.id);       // just this one sound
      takeTurn(me);
      const v = await begin(patch, () => { voice = null; show(); });
      if (mine === turn) voice = v; else if (v) v.stop();               // stopped, or the page moved on, while it loaded
      btn.removeAttribute('title');
    } catch (e) {
      console.error(`${row.kind} ${row.id}:`, e);
      btn.setAttribute('title', 'This could not be played. Reload the page and try again.');
    }
    busy = false; show();
  });
  return { node: cell(row, card), stop: me.quiet, tick() {} };
}

/** A sound effect: its waveform on a light tile. Pressing it loads that one sound and plays it. */
export function soundCard(asset) {
  const row = rowOf(asset);
  const top = String(row.role ?? '').split('/')[0];
  // no built waveform (made on this visit): draw it from the sound itself, when the page has a quiet moment
  let wave = null;
  if (!row.thumb && row.runtime === true && soundById[row.id]) {
    wave = el('canvas', { class: 'thumb pic wave', width: 64, height: 40, 'aria-hidden': 'true' });
    whenRendered(soundById[row.id], (r) => drawWave(wave.getContext('2d'), r.samples, 0, 20, 64, 36, row.thumbInk ?? '#231b33'));
  }
  const tile = el('span', { class: 'pic-tile', style: `${sizes(64, 40)};--sky:${ROLE_BG[top] ?? '#e6e9f2'}` },
    row.thumb ? el('img', { class: 'thumb pic wave', src: row.thumb, alt: '', width: 64, height: 40, decoding: 'async', draggable: 'false' }) : wave,
    el('span', { class: 'play-mark', 'aria-hidden': 'true' }));
  const loops = row.tech?.loop && row.type === 'sfx';
  return audioCard(row, {
    tile, href: `#/sound/${row.id}`, kind: labelFor('type', row.type) + (loops ? ', loops' : ''),
    begin: async (patch, ended) => playRendered(await renderAsync(patch, soundParams(patch)), { force: true, onended: ended }),
  });
}

/** A music track: no picture, a tile that plays the track when pressed. */
export function musicCard(asset) {
  const row = rowOf(asset);
  const tile = el('span', { class: 'pic-tile music', style: `--sky:${ROLE_BG.music}` }, el('span', { class: 'play-mark big', 'aria-hidden': 'true' }));
  const bpm = row.tech?.bpm ? `, ${row.tech.bpm} beats a minute` : '';
  return audioCard(row, {
    tile, href: `#/music/${row.id}`, kind: labelFor('type', row.type) + bpm,
    begin: (patch) => playLive(patch, soundParams(patch)),
  });
}

/** The right card for a catalogue row. Returns { node, stop() }. */
export const cardFor = (row) => (row.kind === 'sprite' ? spriteCard(row) : row.kind === 'music' ? musicCard(row) : soundCard(row));

/** A bundle (a game kit, a character set, an object set): a few of its sprites, what it is for, and what is in it. */
export function bundleCard(bundle) {
  const pics = [];
  let width = 0;
  for (const id of bundle.sprites ?? []) {
    const row = assetById(id);
    if (!row || !row.thumb) continue;
    const [fw, fh] = row.tech?.frame ?? [64, 64];
    if (fh > 96) continue;                                   // tall pictures (backgrounds) do not sit on the ground line
    width += fw * 2 + 6;
    if (width > 340) break;                                  // what fits the narrowest card on a wide screen
    pics.push(el('img', { class: 'pic', src: row.thumb, alt: '', width: fw * 2, height: fh * 2, loading: 'lazy', decoding: 'async', draggable: 'false' }));
  }
  const n = { sprites: (bundle.sprites ?? []).length, sounds: (bundle.sounds ?? []).length, music: (bundle.music ?? []).length };
  const holds = [n.sprites && plural(n.sprites, 'sprite'), n.sounds && plural(n.sounds, 'sound'), n.music && plural(n.music, 'track')].filter(Boolean).join(', ');
  const [sky, ground, edge] = TILE_BG.character;
  const node = el('a', { class: 'card kit', href: `#/bundle/${bundle.id}` },
    el('span', { class: 'pic-tile wide on-ground', style: `--sky:${sky};--ground:${ground};--edge:${edge}` }, pics),
    el('span', { class: 'kit-text' },
      bundle.gameType ? el('span', { class: 'kit-for' }, bundle.gameType === 'any' ? 'For any game' : labelFor('gameType', bundle.gameType)) : null,
      el('span', { class: 'card-name' }, bundle.name),
      bundle.blurb ? el('span', { class: 'kit-blurb' }, bundle.blurb) : null,
      el('span', { class: 'card-kind' }, holds)));
  return { node, stop() {}, tick() {} };
}
export const kitCard = bundleCard;

/** Kept for pages written against the first cards: cards now run themselves. Returns a function that stops them. */
export function runCards(cards) {
  return () => { for (const c of cards) if (c && c.stop) c.stop(); };
}
