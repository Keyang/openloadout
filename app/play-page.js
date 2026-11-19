// The playground (#/play; architecture.md, Contract 9): a sandbox where a visitor tries what is in
// their bag before downloading it. It is not a fixed game: it does something sensible with whatever
// is there. What each thing does comes from its metadata (app/play/roles.js); which clip plays comes
// from clip names (app/play/clips.js); the ground comes from tile names (app/play/level.js); the
// scene itself is app/play/world.js. This file only gathers the bag, builds the page and runs the loop.
//
// One screen (docs/playground-tray-workbench.md, section 1): the page fills the window under the header and does not
// scroll. Left: the scene, as large as the room allows, with the whole level in view (a level the size of the picture,
// at a whole-number zoom: level.js makes it for the room there is), the score, health and the bag's interface pieces
// over its top edge, the animations of the picked thing as chips under it, and one compact bar (Pause, Mute, Reset, the
// view, the keys, More). Right: the list of what is in the bag, scrolling inside itself. Picking a row marks that thing
// in the scene and shows its animations; a chip plays that animation on it, in place. "Change" on the picked row opens
// the editing panel (app/bag-edit.js) in the right column, in place of the list. A change made there is saved to the
// bag as it is made, and the scene takes it without starting again. Anything else that changes the bag (a thing added
// or removed, a new look for everything) builds the scene again. At 390 px the scene is pinned at the top and the rest
// scrolls under it.
import { el, header, store } from './ui.js';
import { bag, lookOf, themeFor } from './bag.js';
import { loadCatalog, currentCatalog, assetById, loadSprite, loadSound } from './catalog.js';
import { soundById, soundState, stopAll } from './audio.js';
import { clipFps, clipStretch } from '../engine/sprite.js';
import { normalizeTheme, spriteLook, THEME_PRESETS } from '../engine/theme.js';
import { rowFromSprite, rowFromPatch, planScene, SCENE_ROLES, MODES } from './play/roles.js';
import { buildKind, soundIdsOf, isCustom, harmfulLiquid } from './play/kinds.js';
import { lookupClip } from './play/clips.js';
import { makeLevel, levelFeatures, tileIndex, levelText, UNIT } from './play/level.js';
import { createWorld, resetWorld, step, spawn, removeOne, countOf, snapshot, activeLoops, startCount, showClip, rectOf } from './play/world.js';
import { createPainter } from './play/draw.js';
import { createInput } from './play/input.js';
import { createSounds } from './play/sound.js';
import { displayPlan, fillSpan } from './play/display.js';
import { itemEditor } from './bag-edit.js';
import { themeControls } from './theme-controls.js';
import { howTo, roleNote, roleShort, keysLine, keysShort, viewName, leftOutNote, viewReason } from './play/words.js';

const HEARD_MAX = 60;
const BOSS_HP = 8;
const ZOOMS = [3, 2, 1];                  // the picture is drawn at the largest of these that holds the whole level
const MANY = 6;                           // with more sorts of thing than this, the scene starts with one of each pickup
const PIC = 40;                           // the live pictures in the list are this many pixels square

export async function playPage(app) {
  document.title = 'Playground · Loadout';
  // col: the scene and what is under it, made again with every build. side: the list, or the editing panel; it stays.
  const col = el('div', { class: 'play-main' }, el('p', { class: 'lede' }, 'Loading the playground…'));
  const side = el('aside', { class: 'play-side', hidden: true, 'aria-label': 'What is in your bag' });
  const main = el('main', { class: 'v2 play-page' }, col, side);
  const top = header('play');
  app.replaceChildren(top, main);
  // the page fills the window under the header, whatever the header holds (a warning, the way back)
  const fitTop = () => main.style.setProperty('--play-top', `${Math.ceil(top.getBoundingClientRect().height)}px`);
  fitTop();
  const topWatch = new ResizeObserver(fitTop);
  topWatch.observe(top);

  const guests = [];                 // assets handed over directly instead of through the bag (see addAssets)
  // The visitor's choices: the view, and for each view its own player and background, so that switching the view
  // and back brings back exactly what was there (a pick made in one view is never used in the other).
  const picks = { mode: null, side: {}, top: {} };
  const keep = { paused: false, music: false, started: false, allPieces: false };    // survives a rebuild
  const heard = [];                  // the last sounds that fired, for the browser tests
  let heardTotal = 0;
  let scene = null, gone = false, builds = 0;
  let picked = null;                 // the key of the row picked in the list (marked in the scene, its chips shown)
  let chosen = null;                 // the thing in the editing panel: { key, editor, off }
  let mode = 'list';                 // what the right column shows: 'list', 'item' (the panel) or 'look'
  // Mute belongs to the playground: it is not remembered and nothing else on the site inherits it. The site's own
  // sound setting (the switch on a sprite page) is taken as found, and put back when the playground is left.
  const siteSound = soundState.on;
  const hear = (h) => { heard.push(h); heardTotal++; if (heard.length > HEARD_MAX) heard.shift(); };

  // ---- gather: every bag item with its catalogue row and its own file ---------------------------

  async function gather() {
    let catalog = null;
    try { catalog = await loadCatalog(); } catch { /* no catalogue: rows are read from the assets themselves */ }
    const entries = [];
    let missing = 0;
    for (const item of bag.items()) {
      const row = assetById(item.id);
      if (catalog && !row) { missing++; continue; }
      try {
        if (item.kind === 'sprite') {
          const sprite = await loadSprite(item.id);
          entries.push({ key: item.key, row: row ?? rowFromSprite(sprite), sprite, settings: item.settings ?? {} });
        } else {
          const patch = soundById[item.id] ?? await loadSound(item.id);
          entries.push({ key: item.key, row: row ?? rowFromPatch(patch), patch, settings: item.settings ?? {} });
        }
      } catch { missing++; }
    }
    guests.forEach((def, i) => {
      if (typeof def.render === 'function') entries.push({ key: 'guest-' + i, row: rowFromSprite(def), sprite: def, settings: {} });
      else entries.push({ key: 'guest-' + i, row: rowFromPatch(def), patch: def, settings: {} });
    });
    return { entries, missing };
  }

  async function build() {
    const mine = ++builds;
    api.ready = false;
    const got = await gather();
    if (gone || mine !== builds) return;
    const resume = keep.music;         // music that was playing carries on after the page is rebuilt
    if (scene) scene.stop();
    scene = show(got.entries, got.missing, resume);
    afterBuild(got.entries);
    api.ready = true;
  }

  // ---- the right column: the list, the editing panel for one thing, or the look of the whole bag --------------

  // The look of the whole bag: its own control, apart from any one thing's panel (J5.4), so it is never mistaken for a
  // setting of that one thing. "Look of the whole bag" at the top of the column shows it in place of the list or panel.
  const look = themeControls({ theme: bag.theme(), live: false, open: false, title: 'The look of your whole bag', onChange: (t) => bag.setTheme(t) });
  const lookBack = el('p', { class: 'play-look-back' });
  const lookBox = el('div', { class: 'play-look', role: 'region', 'aria-label': 'The look of your whole bag' },
    lookBack, look.node,
    el('p', { class: 'hint play-look-note' }, 'Everything in your bag takes this look, here, in your bag and in the download. A thing with a look of its own keeps it.'));
  let sideEntries = [], restored = false;
  let lookFrom = 'list';             // where "Back to ..." in the look goes

  const entryOf = (key) => sideEntries.find((x) => x.key === key) ?? null;

  function closeChosen() {
    if (!chosen) return;
    chosen.off();
    chosen.editor.close();
    chosen = null;
  }
  /** Open the editing panel on a bag item, in place of the list ("Change"). */
  function openPanel(key) {
    const e = entryOf(key);
    const item = bag.get(key);
    if (!e || !item) return false;
    picked = key;
    store.set('play-chosen', key);   // remembered, so a reload goes on with the same thing
    if (!chosen || chosen.key !== key) {
      closeChosen();
      const editor = itemEditor(item, e.sprite ?? e.patch, { versions: 6 });
      chosen = { key, editor, off: ownLookNote(editor) };
    }
    mode = 'item';
    drawSide();
    if (scene) scene.picked();
    return true;
  }
  /** Back to the list of everything in the bag. */
  function backToList() {
    closeChosen();
    store.set('play-chosen', '');
    mode = 'list';
    drawSide();
    if (scene) scene.picked();
  }
  /** Pick a row: the thing is marked in the scene and its animations are shown under it. With the panel open, the panel follows. */
  function pick(key, { reveal = false } = {}) {
    if (chosen && mode === 'item' && key !== chosen.key && bag.get(key)) return openPanel(key);
    picked = key;
    if (scene) scene.picked({ reveal });
    return true;
  }
  /**
   * A thing that wears a look of its own is drawn in it: a colour picked for it is changed by that look. Its Colours tab
   * says so, so a picked green that shows as blue is explained (J5.2). Returns the function that stops following it.
   */
  function ownLookNote(editor) {
    const pane = editor.node.querySelector('[data-pane="colours"]');
    if (!pane) return () => {};
    const note = el('p', { class: 'pane-note play-own-look', hidden: true });
    pane.prepend(note);
    const sync = () => {
      const id = lookOf(editor.edit.settings());
      const name = id ? THEME_PRESETS.find((p) => p.id === id)?.name : null;
      note.hidden = !name || id === 'original';
      note.textContent = name ? `Shown in the ${name} look (its own, in the Look tab), so the colours you pick come out changed by it.` : '';
    };
    sync();
    return editor.edit.onChange(sync);
  }
  function drawSide() {
    const count = bag.items().length;
    const showing = mode === 'look' ? 'look' : mode === 'item' && chosen ? 'item' : 'list';
    const lookBtn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-look-open', 'aria-pressed': String(showing === 'look'), 'aria-expanded': String(showing === 'look'),
      onclick: () => {
        if (mode === 'look') { mode = lookFrom; drawSide(); return; }
        lookFrom = showing; mode = 'look'; drawSide();
        lookBox.querySelector('.look-title')?.focus?.({ preventScroll: true });
      } }, 'Look of the whole bag');
    const head = el('div', { class: 'play-side-head' },
      el('h2', { class: 'play-side-title' }, 'In your bag', el('span', { class: 'quiet' }, ` · ${count} ${count === 1 ? 'thing' : 'things'}`)),
      el('div', { class: 'play-side-links' }, lookBtn, el('a', { class: 'link play-side-bag', href: '#/bag' }, 'Back to your bag')));
    const backName = lookFrom === 'item' && chosen ? entryOf(chosen.key)?.row.name : null;
    lookBack.replaceChildren(el('button', { type: 'button', class: 'link play-look-close', onclick: () => { mode = lookFrom === 'item' && chosen ? 'item' : 'list'; drawSide(); } },
      el('span', { 'aria-hidden': 'true' }, '‹ '), backName ? `Back to ${backName}` : 'Back to all things in your bag'));
    let body;
    if (showing === 'look') body = lookBox;
    else if (showing === 'item') {
      const e = entryOf(chosen.key);
      body = el('div', { class: 'play-edit-view' },
        el('div', { class: 'play-edit-top' },
          el('button', { type: 'button', class: 'link play-back', onclick: backToList }, el('span', { 'aria-hidden': 'true' }, '‹ '), 'All things in your bag'),
          e ? el('a', { class: 'link play-side-page', href: `#/${e.row.kind}/${e.row.id}?bag=${chosen.key}`, onclick: () => chosen && chosen.editor.edit.flush() }, 'Open its page') : null),
        chosen.editor.node);
    } else body = null;
    // the list stays where it is while the panel or the look is shown, so it keeps its place when the creator comes back
    const listNode = scene?.list ?? null;
    if (side.firstElementChild) side.firstElementChild.replaceWith(head); else side.append(head);
    if (listNode && side.children[1] !== listNode) { if (side.children[1]) side.children[1].replaceWith(listNode); else side.append(listNode); }
    while (side.children.length > (listNode ? 2 : 1)) side.lastElementChild.remove();
    if (body) side.append(body);
    if (listNode) listNode.hidden = showing !== 'list';
    side.dataset.showing = showing;
    side.hidden = !sideEntries.length && !scene?.list;
  }
  /** After a build: the panel keeps the thing it had if that is still in the bag; after a reload it reopens on it. */
  function afterBuild(entries) {
    sideEntries = entries.filter((e) => !String(e.key).startsWith('guest-') && bag.get(e.key));
    look.set(bag.theme());
    if (picked && !entries.some((e) => e.key === picked)) picked = null;
    if (!entries.length) { closeChosen(); mode = 'list'; side.hidden = true; side.replaceChildren(); return; }
    if (chosen && sideEntries.some((e) => e.key === chosen.key)) { chosen.editor.panel.sync(); drawSide(); scene.picked(); return; }
    if (chosen) { closeChosen(); if (mode === 'item') mode = 'list'; }
    const before = !restored ? store.get('play-chosen') : null;
    restored = true;
    if (before && sideEntries.some((e) => e.key === before) && openPanel(before)) return;
    drawSide();
    scene.picked();
  }

  // ---- the page for one state of the bag -----------------------------------------------------------

  function show(entries, missing, resumeMusic) {
    const theme = normalizeTheme(bag.theme());
    const patches = Object.fromEntries(entries.filter((e) => e.patch).map((e) => [e.patch.id, e.patch]));
    const patchOf = (id) => soundById[id] ?? patches[id];
    // every sprite as it is drawn: the visitor's settings, varied by the look when the look says so
    const drawn = {};
    for (const e of entries) {
      if (!e.sprite) continue;
      // looks: from what the bag recorded its look made of the sprite, when it has a record (Contract 7, "The record")
      // (a sprite that wears a look of its own is drawn in that look, whatever the bag's is)
      const own = lookOf(e.settings) ? themeFor(e.settings, theme) : null;
      drawn[e.key] = { sprite: e.sprite, params: spriteLook(e.sprite, e.settings.params ?? {}, own ?? theme, { record: own ? undefined : e.settings.lookParams }).params, artStyle: e.settings.artStyle, colour: own ? own.colour : undefined };
      e.soundIds = soundIdsOf(e.sprite, e.settings.cues ?? null, drawn[e.key].params).filter((id) => patchOf(id));
    }
    const plan = planScene(entries, picks);
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    const stops = [];

    if (plan.empty) {
      col.replaceChildren(...emptyView(missing));
      main.classList.remove('has-scene');
      return { stop() {}, state: () => blankState(), soft: () => false, picked() {}, list: null };
    }

    const sounds = createSounds({ theme, patchOf });
    stops.push(() => sounds.destroy());
    const tracks = [], boards = [];
    const muteBtn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-mute', onclick: () => setMuted(soundState.on) });
    const syncMute = () => { muteBtn.textContent = soundState.on ? 'Mute' : 'Unmute'; muteBtn.setAttribute('aria-pressed', String(!soundState.on)); };
    function setMuted(muted) {
      if (muted) { for (const t of tracks) t.stop(); for (const b of boards) b.stop(); sounds.stopLoops(); }
      soundState.on = !muted;            // for this visit to the playground only: nothing is stored
      if (muted) stopAll();
      syncMute();
    }
    syncMute();

    const painter = createPainter({ sprites: drawn, colour: theme.colour, tiles: plan.soundsOnly ? null : tileIndex(plan.tilesets.map((key) => ({ key, names: Object.keys(drawn[key].sprite.clips), size: drawn[key].sprite.size[0], clips: drawn[key].sprite.clips }))) });
    const hasPlayer = !!plan.player;
    // each track's settings as it plays them (its own look's, when it wears one), by its key
    const trackState = () => Object.fromEntries(plan.music.map((key, i) => [key, tracks[i] ? { ...tracks[i].params } : null]));
    let stateOf = () => blankState();
    let putPlayer = () => false;
    let spotOf = () => null, spotsAll = () => [];
    let world = null, level = null, mapText = '';
    let onPicked = () => {};
    // what a change made in the panel does to the running scene, by the key of the bag item it changed
    const softSprite = {}, softSound = {};
    const counters = [], tags = {};
    const syncCounts = () => { for (const [key, node] of counters) node.textContent = world ? String(countOf(world, key)) : '0'; };
    let pendingPlay = null;             // a clip of the player's, to play once (its chip)

    // ---- the list of what is in the bag (the right column) ---------------------------------------------------

    const rows = {};                    // key -> { li, pick, acts, draw }
    let ids = 0;
    /** A live picture of a sprite, at a whole-number scale (or a whole-number share of it, for a big one). */
    function livePicture(e) {
      const cv = el('canvas', { class: 'play-pic-live', width: PIC, height: PIC, 'aria-hidden': 'true' });
      const g = cv.getContext('2d');
      const sprite = e.sprite, role = plan.roles[e.key];
      const clipNow = () => {
        const shown = world?.show?.[e.key];
        if (shown) return shown;
        const thing = world && (world.player?.kind === e.key ? world.player : world.things.find((t) => t.kind === e.key && !t.passing && t.state !== 'gone'));
        if (thing) return thing.anim.clip;
        return sprite.clips[sprite.preview] ? sprite.preview : Object.keys(sprite.clips)[0];
      };
      let last = '';
      const draw = (time) => {
        const layers = role === 'background' ? Object.keys(sprite.clips) : [clipNow()];
        const frames = layers.map((clip) => {
          const c = sprite.clips[clip];
          const fps = clipFps(sprite, clip, drawn[e.key].params);
          return [clip, role === 'tiles' || c.frames < 2 ? 0 : Math.floor(time * fps) % c.frames];
        });
        const id = frames.flat().join('|');
        if (id === last) return;
        last = id;
        const [w, h] = sprite.size, big = Math.max(w, h);
        const s = big <= PIC ? Math.max(1, Math.floor(PIC / big)) : 1 / Math.ceil(big / PIC);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, PIC, PIC);
        g.imageSmoothingEnabled = false;
        const dw = Math.round(w * s), dh = Math.round(h * s);
        for (const [clip, f] of frames) g.drawImage(painter.frame(e.key, clip, f), Math.floor((PIC - dw) / 2), Math.floor((PIC - dh) / 2), dw, dh);
      };
      return { node: el('span', { class: 'play-pic-tile tile' }, cv), draw, forget: () => { last = ''; } };
    }
    /** One row of the list: picture, name and what it does (a button that picks it), the change dot, − count +. */
    function spriteRow(e, { out = false } = {}) {
      const role = plan.roles[e.key], name = e.row.name, noteId = `play-does-${++ids}`;
      const pic = livePicture(e);
      // a sprite the visitor changed says so, so it is clear this is their version and not the one in the catalogue
      const tagBox = el('span', { class: 'play-tag-box' });
      const tag = () => tagBox.replaceChildren(...(isCustom(e.sprite, e.settings) ? [el('span', { class: 'play-tag', title: 'You changed this one' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), 'your version')] : []));
      tag();
      tags[e.key] = tag;
      const does = out ? 'Drawn for the other view' : roleShort(role, { player: hasPlayer });
      const pickBtn = el('button', { type: 'button', class: 'play-row-pick', 'aria-label': name, 'aria-describedby': noteId, 'aria-pressed': 'false', disabled: out, onclick: () => pick(e.key) },
        pic.node, el('span', { class: 'play-row-text' }, el('span', { class: 'play-name' }, name, tagBox), el('span', { class: 'play-does', id: noteId }, does)));
      const li = el('li', { class: `play-row${out ? ' is-out' : ''}`, 'data-key': e.key }, pickBtn);
      if (!out && SCENE_ROLES.includes(role)) {
        const n = el('span', { class: 'play-n', 'aria-label': `${name} in the scene` });
        counters.push([e.key, n]);
        li.append(el('span', { class: 'play-more' },
          el('button', { type: 'button', class: 'play-step', 'aria-label': `Remove one ${name}`, title: 'Remove one', onclick: () => { if (world) removeOne(world, e.key); syncCounts(); } }, '−'),
          n,
          el('button', { type: 'button', class: 'play-step', 'aria-label': `Add one ${name}`, title: 'Add one', onclick: () => { if (world) spawn(world, e.key); syncCounts(); } }, '+')));
      }
      const acts = el('div', { class: 'play-row-acts', hidden: true });
      li.append(acts);
      rows[e.key] = { li, pick: pickBtn, acts, draw: pic.draw, forget: pic.forget, name, role };
      return li;
    }
    /** "Change" on a sound's or a track's row: its panel, in place of the list. Named by its row (labelId). */
    const changeBtn = (key, labelId) => (bag.get(key) ? el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-edit', 'aria-describedby': labelId, onclick: () => openPanel(key) }, 'Change') : null);
    /** A sound's row: its name, Play and Change. */
    function soundRow(key, note) {
      const e = byKey[key], name = e.row.name, noteId = `play-does-${++ids}`;
      const play = el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-sound', 'aria-label': `Play ${name}`, 'aria-pressed': 'false' }, 'Play');
      softSound[key] = () => {};      // the button reads the settings each time it is pressed
      const b = sounds.boardSound(e.patch, () => e.settings, () => play.setAttribute('aria-pressed', String(b.playing() && !!e.patch.loop)));
      boards.push(b);
      play.addEventListener('click', () => {
        if (!soundState.on) setMuted(false);
        const wasOn = b.playing() && e.patch.loop;
        b.play();
        if (!wasOn) hear({ sound: e.patch.id, by: 'board', clip: null });
      });
      // (a sound has no moves to pick: its row is its name, Play and Change; the only button named after it is Play)
      const li = el('li', { class: 'play-row is-sound', 'data-key': key },
        el('span', { class: 'play-row-main' }, el('span', { class: 'play-pic-tile tile is-sound', 'aria-hidden': 'true' }, '♪'),
          el('span', { class: 'play-row-text' }, el('span', { class: 'play-name', id: noteId }, name), el('span', { class: 'play-does' }, note))),
        el('span', { class: 'play-more' }, play, changeBtn(key, noteId)));
      return li;
    }
    /** A track's row: its name, Play music / Stop music and Change. */
    function musicRow(key) {
      const e = byKey[key], patch = e.patch, name = e.row.name, noteId = `play-does-${++ids}`;
      const note = el('p', { class: 'hint play-track-note', role: 'status' });
      const btn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => {
        if (t.playing() || t.starting()) { t.stop(); return; }
        if (!soundState.on) setMuted(false);
        for (const other of tracks) if (other !== t) other.stop();
        t.start();
      } });
      const anyOn = () => tracks.some((x) => x.playing() || x.starting());
      const sync = () => {
        const word = t.starting() ? 'Starting…' : t.playing() ? 'Stop music' : 'Play music';
        btn.textContent = t.starting() ? 'Starting…' : t.playing() ? 'Stop' : 'Play';
        btn.setAttribute('aria-label', `${word}: ${name}`);
        note.textContent = t.note();
        keep.music = anyOn();
      };
      const t = sounds.track(patch, e.settings, sync);
      tracks.push(t);
      sync();
      // the track was changed in the panel: it is heard at once
      softSound[key] = () => { t.retune(e.settings); };
      const li = el('li', { class: 'play-row is-sound', 'data-key': key },
        el('span', { class: 'play-row-main' }, el('span', { class: 'play-pic-tile tile is-sound', 'aria-hidden': 'true' }, '♫'),
          el('span', { class: 'play-row-text' }, el('span', { class: 'play-name', id: noteId }, name), el('span', { class: 'play-does' }, 'Starts with your first key press'))),
        el('span', { class: 'play-more' }, btn, changeBtn(key, noteId)), note);
      return li;
    }

    const groups = [];
    const placed = entries.filter((e) => e.sprite && !plan.leftOut.includes(e.key));
    if (placed.length) groups.push(el('section', { class: 'play-things', 'aria-label': 'In the scene' }, el('h3', {}, 'In the scene'), el('ul', {}, placed.map((e) => spriteRow(e)))));
    // sounds: the ones no sprite plays, then the ones a sprite in the bag plays on its moves
    const playedBy = (key) => entries.filter((x) => x.sprite && (x.soundIds ?? []).includes(byKey[key].row.id)).map((x) => x.row.name);
    if (plan.board.length || plan.attached.length) {
      groups.push(el('section', { class: 'play-board', 'aria-label': 'Sounds' }, el('h3', {}, 'Sounds'),
        el('ul', {}, [...plan.board.map((key) => soundRow(key, 'Press Play to hear it')), ...plan.attached.map((key) => soundRow(key, `${playedBy(key).slice(0, 2).join(' and ') || 'A sprite'} plays it on a move`))])));
    }
    if (plan.music.length) groups.push(el('section', { class: 'play-music', 'aria-label': 'Music' }, el('h3', {}, 'Music'), el('ul', {}, plan.music.map(musicRow))));
    // what was drawn for the other view: in the list, greyed, with why and the way to switch
    const otherMode = MODES.find((m) => m !== plan.mode);
    const setView = (m) => { if (m === plan.mode) return; picks.mode = m; build(); };
    if (plan.leftOut.length) {
      groups.push(el('section', { class: 'play-left-out', 'aria-label': 'Left out of this scene' }, el('h3', {}, 'Drawn for the other view'),
        el('p', { class: 'hint' }, leftOutNote(plan.leftOut.map((key) => byKey[key].row.name), plan.mode)),
        el('p', { class: 'play-left-out-do' },
          el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => setView(otherMode) }, `Switch to ${viewName(otherMode)}`),
          el('span', { class: 'hint' }, viewReason(plan.why, plan.mode))),
        el('ul', {}, plan.leftOut.map((key) => spriteRow(byKey[key], { out: true })))));
    }
    const notes = [];
    if (!plan.soundsOnly) {
      // a character drawn for the other view is in the bag: say so, instead of sending the visitor off to find one
      const playerElsewhere = plan.leftOut.some((key) => byKey[key].row.role === 'characters/player');
      if (!hasPlayer && playerElsewhere) notes.push(el('p', { class: 'hint' }, `There is no character drawn for this view to play as. Switch to ${viewName(otherMode)} to play as the one in your bag.`));
      else if (!hasPlayer) notes.push(el('p', { class: 'hint' }, 'There is no character to play as in your bag. ', el('a', { href: '#/browse?kind=sprite' }, 'Find a character')));
      if (plan.mode === 'top' && plan.backgrounds.length) notes.push(el('p', { class: 'hint' }, 'Seen from above, the background lies round the room and under it: it shows through a pit you can see into.'));
    }
    if (missing) notes.push(el('p', { class: 'hint' }, `${missing} thing${missing === 1 ? '' : 's'} in your bag could not be found, so ${missing === 1 ? 'it is' : 'they are'} not here.`));
    if (notes.length) groups.push(el('section', { class: 'play-notes' }, notes));
    const list = el('div', { class: 'play-list', role: 'region', 'aria-label': 'Everything in your bag', tabindex: '-1' }, groups);

    // ---- the scene (the left column) -------------------------------------------------------------------------

    const anims = el('div', { class: 'play-anims', 'aria-live': 'polite' });
    let bar, stick = null, hud = null, syncPieces = () => {};
    let canvasStage = null;
    let sceneStart = null;              // lays the picture out for the room it has, once the page is in place

    if (!plan.soundsOnly) {
      const isLoop = (id) => !!patchOf(id)?.loop;
      const kindOf = (e) => {
        const role = plan.roles[e.key];
        const kind = buildKind({ key: e.key, sprite: e.sprite, row: e.row, settings: { params: drawn[e.key].params, cues: e.settings.cues ?? null } }, role,
          { isLoop, hostile: role === 'creature' && e.row.role !== 'characters/animal', hp: e.row.role === 'characters/boss' ? BOSS_HP : undefined });
        for (const clip of kind.clipNames) kind.cues[clip] = kind.cues[clip].filter((c) => patchOf(c.sound));
        return kind;
      };
      const kinds = entries.filter((e) => e.key === plan.player || e.key === plan.projectile || plan.scene.includes(e.key)).map(kindOf);
      // every tileset in the bag is read together: one may hold the floor, another the walls
      const tiles = tileIndex(plan.tilesets.map((key) => ({ key, names: Object.keys(drawn[key].sprite.clips), size: drawn[key].sprite.size[0], clips: drawn[key].sprite.clips })));
      const features = levelFeatures(tiles, plan.mode);
      const startWith = kinds.filter((k) => SCENE_ROLES.includes(k.role)).length > MANY ? { pickup: 1 } : null;
      const need = startCount(kinds, plan.player, startWith);
      sounds.warm(kinds.flatMap((k) => Object.values(k.cues).flat()));
      // the background lies round a top-down room: the room is whole tiles, and the room to spare round it is background
      const roomInset = plan.mode === 'top' && !!plan.background;

      const stage = el('canvas', { class: 'play-stage', tabindex: '0', role: 'img', 'aria-label': 'The playground scene. Click a thing in it to pick it.' });
      canvasStage = stage;
      const wrap = el('div', { class: 'play-stage-wrap' }, stage);
      const ctx = stage.getContext('2d');
      const view = { w: 320, h: 180, zoom: 2 };
      let made = '';                      // the size the level was made for: zoom, columns, rows
      let cam = { x: 0, y: 0 };

      /** A new level and a new scene for the room there is (on the first picture, and when the room changes). */
      function makeScene(lv) {
        level = lv;
        if (features.pool) {
          // a pool of lava or acid hurts; water does not (kinds.js harmfulLiquid: told by the liquid's words and settings)
          const from = drawn[tiles.tiles.blocks.find((b) => b.prefix === features.pool)?.set];
          level.harmful = harmfulLiquid(features.pool, from?.sprite ?? null, from?.params ?? {});
        }
        // the level as text: a creator can copy it and open it in their own tool (engine/maptext.js reads it back)
        mapText = levelText(level, plan.tilesets.map((key) => byKey[key].row.id));
        const shownBefore = world ? { ...world.show } : {};
        world = createWorld({ mode: plan.mode, level, kinds, player: plan.player, start: startWith });
        for (const [key, clip] of Object.entries(shownBefore)) showClip(world, key, clip);
        syncCounts();
      }
      /** Fit the picture to the room: the largest whole-number zoom at which a level that fills it holds everything. */
      const fit = () => {
        const W = wrap.clientWidth, H = Math.min(wrap.clientHeight, Math.round(wrap.clientWidth * 0.8));      // never taller than it is wide
        if (!W || !H) return;
        let choice = null;
        for (const z of ZOOMS) {
          const vw = Math.floor(W / z), vh = Math.floor(H / z);
          const cols = roomInset ? Math.floor(vw / UNIT) : Math.ceil(vw / UNIT), rows = roomInset ? Math.floor(vh / UNIT) : Math.ceil(vh / UNIT);
          if (z > 1 && (cols < 8 || rows < 7)) continue;      // the smallest level worth it: a room with walls round it, a row of platforms
          const id = `${z}:${cols}:${rows}`;
          const lv = id === made && level ? level : makeLevel(plan.mode, { ...features, screen: { cols, rows } });
          choice = { z, vw, vh, lv, id };
          if (lv.spots.all.length >= need) break;
        }
        if (!choice) return;
        Object.assign(view, { w: choice.vw, h: choice.vh, zoom: choice.z });
        stage.width = view.w * view.zoom; stage.height = view.h * view.zoom;
        stage.style.width = stage.width + 'px'; stage.style.height = stage.height + 'px';
        if (choice.id !== made || !world) { made = choice.id; makeScene(choice.lv); }
        // the level fills the picture: a side view rests on its ground, a room is in the middle
        cam = { x: Math.round((level.width - view.w) / 2), y: plan.mode === 'side' ? level.height - view.h : Math.round((level.height - view.h) / 2) };
      };

      const top = plan.mode === 'top';
      const player = plan.player ? kinds.find((k) => k.key === plan.player) : null;
      const has = (action) => !!(player && lookupClip(player.clipNames, action, { mode: plan.mode, view: player.view }));

      // on-screen buttons (shown on a phone)
      const hold = (name, label, text) => el('button', { type: 'button', class: 'play-key', 'data-hold': name, 'aria-label': label }, text ?? label);
      const pad = player ? el('div', { class: 'play-pad' },
        el('div', { class: 'play-pad-group' }, hold('left', 'Left', '◀'), top ? hold('up', 'Up', '▲') : null, top ? hold('down', 'Down', '▼') : null, hold('right', 'Right', '▶')),
        el('div', { class: 'play-pad-group' }, top ? null : hold('jump', 'Jump'), has('block') ? hold('block', 'Block') : null, hold('action', 'Action'))) : el('div', { class: 'play-pad', hidden: true });
      const input = createInput({ pad, ignore: '.play-side' });      // keys pressed in the right column are its own: they never move the character
      stops.push(() => input.destroy());

      // score and health over the top edge of the scene: what was collected (when there is something to collect) and
      // the player's health, then the bag's interface pieces and icons
      const countText = el('strong', {}, '0'), healthText = el('strong', {}, '');
      const firstPickup = kinds.find((k) => k.role === 'pickup');
      const count = firstPickup ? el('span', { class: 'play-count play-collected' }, picture(painter, firstPickup.key, drawn[firstPickup.key].sprite, firstPickup.rest), 'Collected: ', countText) : null;
      const health = player ? el('span', { class: 'play-count play-health' }, 'Health: ', healthText) : null;
      const healthNow = () => (world?.player ? { hp: world.player.hp, max: player.hp } : { hp: 3, max: 3 });
      const pieces = plan.display.map((key) => displayPiece(painter, key, byKey[key].row.name, drawn[key].sprite, drawn[key].params, healthNow));
      // The bag's interface pieces are ONE ROW that scrolls sideways inside itself, however many there are. "Show all"
      // folds the row open (the pieces wrap, to be looked at together) and "Show one row" folds it away again; the
      // button is there only when the row overflows.
      const strip = pieces.length ? el('div', { class: 'play-pieces', role: 'group', tabindex: '0', 'aria-label': 'Interface pieces from your bag' }, pieces.map((p) => p.node)) : null;
      const more = strip ? el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-pieces-more', hidden: true, onclick: () => { keep.allPieces = !keep.allPieces; syncPieces(); } }) : null;
      syncPieces = () => {
        if (!strip) return;
        strip.classList.toggle('open', keep.allPieces);
        more.setAttribute('aria-expanded', String(keep.allPieces));
        more.textContent = keep.allPieces ? 'Show one row' : `Show all ${pieces.length}`;
        more.hidden = !keep.allPieces && strip.scrollWidth <= strip.clientWidth + 1;
      };
      hud = count || health || pieces.length
        ? el('div', { class: 'play-hud', 'aria-label': 'Score and health' }, el('span', { class: 'play-hud-title' }, 'Score and health'), count, health, more, strip)
        : null;

      // the bar under the scene
      const pauseBtn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { keep.paused = !keep.paused; syncPause(); } });
      const syncPause = () => { pauseBtn.textContent = keep.paused ? 'Resume' : 'Pause'; };
      syncPause();
      const viewPick = el('span', { class: 'play-view' }, el('span', { class: 'label' }, 'View'),
        plan.modes.length > 1
          ? el('span', { class: 'seg', role: 'group', 'aria-label': 'View' }, MODES.filter((m) => plan.modes.includes(m)).map((m) => el('button', { type: 'button', 'aria-pressed': String(m === plan.mode), onclick: () => setView(m) }, viewName(m))))
          : el('span', { class: 'play-view-now' }, viewName(plan.mode)));
      // "Copy this level": the map text on the clipboard; where the browser will not allow that, in a box to copy from
      const copyNote = el('p', { class: 'hint play-copied', role: 'status' });
      async function copyLevel() {
        try {
          await navigator.clipboard.writeText(mapText);
          copyNote.replaceChildren('Copied. This is the level as text: the letters are tiles, one for each square. Paste it into a text file or your own level tool.');
        } catch {
          const box = el('textarea', { class: 'play-map', readonly: true, rows: Math.min(12, mapText.split('\n').length), 'aria-label': 'This level as text' }, mapText);
          copyNote.replaceChildren('Your browser did not allow copying. Select the text in this box and copy it: ', box);
          box.select();
        }
      }
      const moreMenu = el('div', { class: 'menu up right play-more-menu', hidden: true, role: 'menu' },
        el('button', { type: 'button', role: 'menuitem', class: 'play-copy', onclick: copyLevel }, 'Copy this level'), copyNote);
      const moreBtn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-more-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => {
        const open = moreMenu.hidden;
        moreMenu.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open));
        if (!open) copyNote.replaceChildren();
      } }, 'More');
      const closeMore = (ev) => { if (!moreMenu.hidden && !(ev.target instanceof Element && ev.target.closest('.play-more-wrap'))) { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); } };
      document.addEventListener('pointerdown', closeMore);
      stops.push(() => document.removeEventListener('pointerdown', closeMore));
      const keysFull = keysLine({ mode: plan.mode, player: !!player, block: has('block'), dodge: has('dodge') });
      bar = el('div', { class: 'play-bar' },
        el('div', { class: 'play-tools' }, pauseBtn, muteBtn,
          el('button', { type: 'button', class: 'btn btn-sm btn-secondary', 'aria-label': 'Reset the scene', title: 'Put everything back where it started', onclick: () => { if (world) { resetWorld(world); syncCounts(); } } }, 'Reset'),
          viewPick),
        el('p', { class: 'play-keys', title: keysFull }, keysShort({ mode: plan.mode, player: !!player, block: has('block'), dodge: has('dodge') }) || 'Pick a thing on the right to see its moves.'),
        el('div', { class: 'menu-wrap play-more-wrap' }, moreBtn, moreMenu));

      // one line for someone who has never played on a keyboard, from what is really in the scene
      const nameOf = (test) => { const k = kinds.find(test); return k ? byKey[k.key].row.name : null; };
      const tip = howTo({
        mode: plan.mode, player: !!player, ledges: !top,
        pickup: nameOf((k) => k.role === 'pickup'), enemy: nameOf((k) => k.hittable && k.key !== plan.player), prop: nameOf((k) => k.role === 'prop'),
      });

      // ---- the chips under the scene: the animations of the picked thing
      onPicked = ({ reveal = false } = {}) => {
        for (const [key, r] of Object.entries(rows)) {
          const on = key === picked;
          r.pick.setAttribute('aria-pressed', String(on));
          r.li.classList.toggle('is-picked', on);
          r.acts.hidden = !on || r.li.classList.contains('is-out');
          if (on) fillActs(key, r);
        }
        if (reveal && picked && rows[picked]) rows[picked].li.scrollIntoView({ block: 'nearest' });
        drawChips();
      };
      function fillActs(key, r) {
        const out = [];
        if (bag.get(key)) out.push(el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-edit', 'aria-label': `Change ${r.name}`, 'aria-pressed': String(!!chosen && chosen.key === key), onclick: () => openPanel(key) }, 'Change'));
        if (plan.players.includes(key) && key !== plan.player) out.push(el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-as', onclick: () => { picks[plan.mode].player = key; build(); } }, 'Play as this'));
        if (plan.backgrounds.includes(key) && key !== plan.background) out.push(el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-bg', onclick: () => { picks[plan.mode].background = key; build(); } }, 'Use as background'));
        if (key === plan.background && plan.backgrounds.length) out.push(el('span', { class: 'hint' }, 'The background of the scene now'));
        r.acts.replaceChildren(...out);
      }
      function drawChips() {
        const e = picked ? byKey[picked] : null;
        if (!e || !rows[picked]) {
          anims.replaceChildren(el('p', { class: 'play-howto-line' }, tip ? el('span', { class: 'play-howto' }, tip) : null, el('span', { class: 'quiet' }, `${tip ? ' ' : ''}Pick a thing on the right to see its moves here.`)));
          return;
        }
        const name = e.row.name, inScene = !!(world && world.kinds[picked]) && plan.projectile !== picked;
        if (!e.sprite || !inScene) {
          const role = plan.roles[picked];
          const text = !e.sprite ? (e.row.kind === 'music' ? 'music. Play and Stop are on its row.' : 'a sound. Press Play on its row to hear it.')
            : plan.leftOut.includes(picked) ? `drawn for the other view. Switch to ${viewName(otherMode)} to see it.` : roleNote(role, { player: hasPlayer }).replace(/\.$/, '').toLowerCase() + '.';
          anims.replaceChildren(el('p', { class: 'play-anims-note' }, el('strong', {}, `${name}: `), text));
          return;
        }
        const isPlayer = picked === plan.player;
        const shown = world.show[picked] ?? null;
        const chip = (clip) => el('button', { type: 'button', class: 'chip', 'data-clip': clip, 'aria-pressed': String(!isPlayer && shown === clip),
          onclick: () => {
            if (isPlayer) { pendingPlay = clip; return; }
            showClip(world, picked, world.show[picked] === clip ? null : clip);
            drawChips();
          } }, (e.sprite.clips[clip].label ?? clip).replace(/\s*\(.*\)$/, ''));
        const own = isPlayer ? null : el('button', { type: 'button', class: 'chip play-own', 'aria-pressed': String(!shown), onclick: () => { showClip(world, picked, null); drawChips(); } }, 'As in the game');
        anims.replaceChildren(el('span', { class: 'play-anims-name' }, name),
          el('span', { class: 'chips', role: 'group', 'aria-label': `Moves of ${name}` }, own, Object.keys(e.sprite.clips).map(chip)),
          el('span', { class: 'quiet play-anims-hint' }, isPlayer ? 'A move plays once.' : ''));
      }

      // ---- the loop
      const jobs = painter.allFrames(Object.keys(drawn));
      let raf = 0, last = performance.now(), shown = -1, shownHp = -1, picsAt = 0;
      const onEvent = (e) => {
        if (e.type === 'collect' || e.type === 'die') syncCounts();
        if (e.type !== 'sound') return;
        sounds.cue(e.cue);
        hear({ sound: e.sound, by: world.kinds[e.kind].id, clip: e.clip });
      };
      const tick = (now) => {
        raf = requestAnimationFrame(tick);
        if (!world) return;
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        const inp = input.state(plan.mode);
        if (!keep.paused) {
          if (pendingPlay) { inp.play = pendingPlay; pendingPlay = null; }
          const before = world.things.length;
          for (const e of step(world, inp, dt)) onEvent(e);
          if (world.things.length !== before) syncCounts();
        }
        sounds.syncLoops(keep.paused || !soundState.on ? [] : activeLoops(world));
        // make a few frames ahead of need, so nothing stutters the first time a clip plays
        for (const t0 = performance.now(); jobs.length && performance.now() - t0 < 3;) painter.frame(...jobs.pop());
        painter.draw(ctx, { world, view, cam, plan });
        if (picked && world.kinds[picked]) painter.mark(ctx, { world, view, cam, key: picked });      // what the visitor picked is marked in the scene
        if (world.collected !== shown) { shown = world.collected; countText.textContent = String(shown); }
        if (world.player && world.player.hp !== shownHp) { shownHp = world.player.hp; healthText.textContent = `${Math.max(0, shownHp)} of ${player.hp}`; }
        for (const p of pieces) p.tick(world.time);
        if (now - picsAt > 90) { picsAt = now; for (const r of Object.values(rows)) if (r.draw) r.draw(world.time); }
      };
      const ro = new ResizeObserver(() => { fit(); syncPieces(); });
      stops.push(() => { cancelAnimationFrame(raf); ro.disconnect(); });
      stateOf = () => ({
        ...snapshot(world), paused: keep.paused, muted: !soundState.on, zoom: view.zoom, view: { w: view.w, h: view.h },
        cam: { x: Math.round(cam.x), y: Math.round(cam.y) },        // the corner of the scene the picture shows
        heard: [...heard], heardTotal, music: tracks.some((t) => t.playing() || t.starting()), tracks: trackState(),
        map: mapText, shown: { ...world.show },
        level: { cols: level.cols, rows: level.rows, tile: level.tile, groundY: level.groundY ?? null },
        backdrop: plan.background ? 'bag' : 'plain',
        plan: { mode: plan.mode, modes: plan.modes, why: plan.why, leftOut: plan.leftOut, player: plan.player, tilesets: plan.tilesets, background: plan.background, scene: plan.scene, display: plan.display, board: plan.board, music: plan.music },
      });
      // ---- a thing in the scene is clicked: it is picked (or, with the panel open, put in the panel)
      const thingAt = (wx, wy) => {
        let best = null;
        for (const t of world.player ? [...world.things, world.player] : world.things) {
          if (t.state === 'gone' || t.passing) continue;
          const k = world.kinds[t.kind], x0 = t.x - k.pivot[0], y0 = t.y - k.pivot[1] - t.lift;
          if (wx < x0 - 2 || wx > x0 + k.size[0] + 2 || wy < y0 - 2 || wy > y0 + k.size[1] + 2) continue;
          const d = Math.hypot(wx - (x0 + k.size[0] / 2), wy - (y0 + k.size[1] / 2));
          if (!best || d < best.d) best = { key: t.kind, d };
        }
        return best ? best.key : null;
      };
      stage.addEventListener('pointerdown', (ev) => {
        stage.focus({ preventScroll: true });      // the keyboard comes to the scene
        if (!world) return;
        const box = stage.getBoundingClientRect();
        const wx = cam.x + (ev.clientX - box.left) / view.zoom, wy = cam.y + (ev.clientY - box.top) / view.zoom;
        // a thing first; else the ground, wall or platform laid there; else what is behind the scene
        const key = thingAt(wx, wy) ?? painter.tileAt(wx, wy) ?? plan.background ?? null;
        if (key !== null && rows[key]) pick(key, { reveal: true });
      });
      // where things are on the page now (for the browser tests): the middle of a kind's first one, or every one's box
      const boxOf = (t, box) => {
        const k = world.kinds[t.kind], x0 = box.left + (t.x - k.pivot[0] - cam.x) * view.zoom, y0 = box.top + (t.y - k.pivot[1] - t.lift - cam.y) * view.zoom;
        return { x0, y0, x1: x0 + k.size[0] * view.zoom, y1: y0 + k.size[1] * view.zoom };
      };
      spotOf = (key) => {
        if (!world) return null;
        const t = world.player && world.player.kind === key ? world.player : world.things.find((x) => x.kind === key && x.state !== 'gone' && !x.passing);
        if (!t) return null;
        const b = boxOf(t, stage.getBoundingClientRect());
        return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
      };
      // every thing's body (the part that is drawn, without its empty margin), for the browser tests
      spotsAll = () => {
        if (!world) return [];
        const box = stage.getBoundingClientRect();
        return (world.player ? [world.player, ...world.things] : world.things).filter((t) => t.state !== 'gone' && !t.passing).map((t) => {
          const r = rectOf(world, t);
          return { key: t.kind, id: world.kinds[t.kind].id, x0: box.left + (r.x0 - cam.x) * view.zoom, y0: box.top + (r.y0 - cam.y) * view.zoom, x1: box.left + (r.x1 - cam.x) * view.zoom, y1: box.top + (r.y1 - cam.y) * view.zoom };
        });
      };

      // ---- a sprite was changed in the panel: it is drawn the new way from the next picture on, where it stands
      for (const e of entries) {
        if (!e.sprite) continue;
        softSprite[e.key] = () => {
          const kind = world?.kinds[e.key];
          if (kind) {
            const fresh = kindOf(e);
            Object.assign(kind, fresh);
            sounds.warm(Object.values(fresh.cues).flat());
          }
          painter.forget(e.key);
          for (const p of pieces) p.again();
          if (tags[e.key]) tags[e.key]();
          if (rows[e.key]?.forget) rows[e.key].forget();
          for (const [clip, c] of Object.entries(e.sprite.clips)) for (let f = 0; f < c.frames; f++) jobs.push([e.key, clip, f]);
        };
      }

      putPlayer = (x, y) => { if (!world?.player) return false; Object.assign(world.player, { x, y, vx: 0, vy: 0, onGround: plan.mode === 'top' }); return true; };
      const sceneBox = el('div', { class: 'play-scene' }, wrap, hud);
      stick = el('div', { class: 'play-stick' }, sceneBox, pad);
      // start once the page is in place, so the scene knows how much room it has
      queueMicrotask(() => { if (gone) return; ro.observe(wrap); if (strip) ro.observe(strip); fit(); syncPieces(); raf = requestAnimationFrame(tick); });
      // the first picture's size is known as soon as the page is laid out (below), so the state is ready with build()
      sceneStart = () => { fit(); syncPieces(); };
    } else {
      bar = el('div', { class: 'play-bar' }, el('div', { class: 'play-tools' }, muteBtn));
      stateOf = () => ({ ...blankState(), music: tracks.some((t) => t.playing() || t.starting()), tracks: trackState() });
      onPicked = () => {
        for (const [key, r] of Object.entries(rows)) {
          const on = key === picked;
          r.pick.setAttribute('aria-pressed', String(on)); r.li.classList.toggle('is-picked', on); r.acts.hidden = !on;
          if (on) r.acts.replaceChildren(...(bag.get(key) ? [el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-edit', 'aria-label': `Change ${r.name}`, onclick: () => openPanel(key) }, 'Change')] : []));
        }
      };
    }

    // ---- music: it starts on the visitor's first key press or tap
    if (plan.music.length) {
      const anyOn = () => tracks.some((t) => t.playing() || t.starting());
      // Browsers only let sound start after a key press or a tap, so the first one starts the music
      // (unless it was a press on the music's own buttons or on Mute, which say what the visitor wants).
      const first = (ev) => {
        if (keep.started) return;
        keep.started = true;
        const on = ev.target instanceof Element ? ev.target : null;
        if (on && (on.closest('.play-music') || on.closest('.play-mute') || on.closest('a'))) return;
        if (soundState.on && !anyOn()) tracks[0].start();
      };
      if (resumeMusic && soundState.on) tracks[0].start();
      else if (!keep.started) {
        window.addEventListener('keydown', first, true);
        window.addEventListener('pointerdown', first, true);
        stops.push(() => { window.removeEventListener('keydown', first, true); window.removeEventListener('pointerdown', first, true); });
      }
      stops.push(() => { const was = keep.music; for (const t of tracks) t.stop(); keep.music = was; });
    }
    stops.push(() => { for (const b of boards) b.stop(); });

    col.replaceChildren(
      el('div', { class: 'play-head' }, el('h1', { class: 'h3' }, 'Playground'),
        el('p', { class: 'lede' }, plan.soundsOnly ? 'Your bag has sounds but nothing to draw yet, so here they are to listen to. Add a character or a creature to see a scene.' : 'Everything in your bag, together. Pick a thing on the right to see its moves.')),
      ...(stick ? [stick, anims] : []),
      bar);
    main.classList.add('has-scene');
    main.classList.toggle('sounds-only', !!plan.soundsOnly);
    // lay the page out now, so the picture knows its size and the scene is there when build() says it is ready
    side.hidden = false;
    if (sceneStart) sceneStart();

    /**
     * The bag changed. When all that changed is the settings of things already here (what the panel does), the scene
     * takes them as it runs and this returns true. Anything else (a thing added or taken out, another look, a sprite
     * whose sounds are now others) returns false, and the page builds the scene again.
     */
    const madeOf = { items: entries.filter((e) => !String(e.key).startsWith('guest-')).map((e) => `${e.key}:${e.row.kind}:${e.row.id}`).join(), theme: JSON.stringify(theme), missing };
    function soft() {
      const items = bag.items();
      const here = items.filter((i) => byKey[i.key]);
      if (items.length - here.length !== madeOf.missing || here.map((i) => `${i.key}:${i.kind}:${i.id}`).join() !== madeOf.items) return false;
      if (JSON.stringify(normalizeTheme(bag.theme())) !== madeOf.theme) return false;
      for (const item of here) {
        const e = byKey[item.key], next = item.settings ?? {};
        if (JSON.stringify(next) === JSON.stringify(e.settings)) continue;
        if (e.sprite) {
          if (!softSprite[e.key]) return false;
          const own = lookOf(next) ? themeFor(next, theme) : null;
          const params = spriteLook(e.sprite, next.params ?? {}, own ?? theme, { record: own ? undefined : next.lookParams }).params;
          const ids2 = soundIdsOf(e.sprite, next.cues ?? null, params).filter((id) => patchOf(id));
          if (ids2.join() !== (e.soundIds ?? []).join() || (next.artStyle ?? null) !== (e.settings.artStyle ?? null)) return false;      // the sound list may differ now
          e.settings = next;
          drawn[e.key].params = params;
          drawn[e.key].colour = own ? own.colour : undefined;
          softSprite[e.key]();
        } else {
          e.settings = next;
          if (softSound[e.key]) softSound[e.key]();
        }
      }
      return true;
    }
    return {
      stop() { for (const s of stops) s(); }, state: () => stateOf(), put: (x, y) => putPlayer(x, y), soft, list,
      spot: (key) => spotOf(key), spots: () => spotsAll(), picked: (o) => onPicked(o ?? {}), stage: () => canvasStage,
      play: (key, clip) => {
        if (!world) return false;
        if (key === plan.player) { pendingPlay = clip; return true; }
        const ok = showClip(world, key, clip ?? null);
        onPicked();
        return ok;
      },
    };
  }

  function blankState() {
    return { mode: null, player: null, things: [], collected: 0, paused: keep.paused, muted: !soundState.on, heard: [...heard], heardTotal, music: false };
  }

  function emptyView(missing = 0) {
    const bundles = currentCatalog()?.bundles ?? [];
    const playable = (b) => b.sprites.some((id) => assetById(id)?.role === 'characters/player');
    const bundle = bundles.find(playable) ?? bundles[0];
    if (missing) {
      // the bag is not empty: what is in it is no longer on the site (an old link, a renamed asset)
      return [
        el('h1', { class: 'h3' }, 'Playground'),
        el('p', { class: 'lede' }, `${missing === 1 ? 'The one thing' : `None of the ${missing} things`} in your bag could be found on the site any more, so there is nothing to try here. Take ${missing === 1 ? 'it' : 'them'} out of your bag and add something from the catalogue.`),
        el('p', { class: 'play-foot' }, el('a', { class: 'btn btn-primary', href: '#/bag' }, 'Open your bag'), el('a', { class: 'btn btn-secondary', href: '#/' }, 'Browse everything')),
      ];
    }
    return [
      el('h1', { class: 'h3' }, 'Playground'),
      el('p', { class: 'lede' }, 'Your bag is empty, so there is nothing to try yet. Put a character, some creatures, things to collect, sounds or music in your bag, then come back here to see and hear them together before you download them.'),
      el('p', { class: 'play-foot' }, el('a', { class: 'btn btn-primary', href: '#/' }, 'Browse everything'),
        bundle ? el('a', { class: 'btn btn-secondary', href: `#/bundle/${bundle.id}` }, `Start with the ${bundle.name} set`) : null),
    ];
  }

  // ---- what the page shows the browser tests (and anyone curious in the console) ---------------------

  const api = {
    ready: false,
    /** The scene as plain data: mode, player, things, collected, paused, muted, the sounds that fired; picked, panel. */
    state: () => ({ ...(scene ? scene.state() : blankState()), chosen: picked, panel: mode === 'item' && chosen ? chosen.key : null }),
    /** Open the editing panel on a bag item (by its key), as "Change" on its row does. */
    choose: (key) => openPanel(key),
    /** Pick a row (by its key): it is marked in the scene and its moves are shown under it. */
    pick: (key) => pick(key),
    /** Play one clip on the things of a kind (a key), as its chip does; null gives them back their own behaviour. */
    play: (key, clip) => (scene && scene.play ? scene.play(key, clip) : false),
    /** Where a kind of thing (a bag item's key) is on the page now: { x, y } in window pixels, or null. */
    spot: (key) => (scene && scene.spot ? scene.spot(key) : null),
    /** Every thing in the scene and the player: { key, id, x0, y0, x1, y1 }, their bodies in window pixels. */
    spots: () => (scene && scene.spots ? scene.spots() : []),
    /** Put the player somewhere in the scene (for the browser tests and for taking pictures). Returns false with no player. */
    put: (x, y) => (scene && scene.put ? scene.put(x, y) : false),
    /** Try assets that are not in the catalogue: sprite definitions or sound patches. They are treated like bag items. */
    async addAssets(list) { guests.push(...list); await build(); },
  };
  window.__loadoutPlay = api;

  // a mouse click leaves the button focused, and Space would then press it again instead of jumping
  const unfocus = (e) => { if (e.detail > 0) e.target.closest?.('button')?.blur(); };
  main.addEventListener('click', unfocus);

  await build();
  // the bag changed: a change of settings is taken by the running scene (what the panel does); anything else builds it again
  const off = bag.onChange(() => {
    if (api.ready && scene && scene.soft && scene.soft()) { look.set(bag.theme()); const c = side.querySelector('.play-side-title .quiet'); if (c) c.textContent = ` · ${bag.items().length} things`; return; }
    build();
  });
  return () => {
    gone = true; off();
    topWatch.disconnect();
    closeChosen();
    soundState.on = siteSound;
    main.removeEventListener('click', unfocus);
    if (scene) scene.stop();
    if (window.__loadoutPlay === api) delete window.__loadoutPlay;
  };
}

// ---- small pictures for the on-screen display ----------------------------------------------------------

/** One still frame of a sprite, at a whole-number size. */
function picture(painter, key, sprite, clip) {
  const scale = sprite.size[1] <= 20 ? 2 : 1;
  const cv = el('canvas', { class: 'play-pic', width: sprite.size[0] * scale, height: sprite.size[1] * scale, 'aria-hidden': 'true' });
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(painter.frame(key, clip, 0), 0, 0, cv.width, cv.height);
  return cv;
}

const pieceScale = (sprite) => (Math.max(sprite.size[0], sprite.size[1]) <= 24 ? 2 : 1);     // always a whole number

/**
 * An interface piece or icon in the "Score and health" strip over the scene. What it shows comes from its clip names
 * (app/play/display.js): a bar filled to the player's health inside its opening, glyphs for each point of health, a
 * button with its states, or a set: every clip side by side. Each clip is its own small canvas: in the strip's one row
 * they stay side by side (the row scrolls), and when the row is folded open ("Show all") a long set wraps.
 * health(): { hp, max } now.
 */
function displayPiece(painter, key, name, sprite, params, health) {
  const plan = displayPlan(sprite.clips);
  const s = pieceScale(sprite), [w, h] = sprite.size;
  const node = el('span', { class: 'play-piece', role: 'img', 'aria-label': name, title: name });
  const cell = () => { const cv = el('canvas', { class: 'play-pic', width: w * s, height: h * s }); node.append(cv); return cv.getContext('2d'); };
  const frameOf = (clip, time) => {
    const c = sprite.clips[clip], fps = clipFps(sprite, clip, params);
    return c.frames > 1 ? (c.loop ? Math.floor(time * fps) % c.frames : Math.min(c.frames - 1, Math.floor(time * fps) % (c.frames + fps))) : 0;
  };
  // draw columns x .. x + cw of one frame (the whole frame when not given)
  const paint = (g, clip, f, x = 0, cw = w) => {
    g.imageSmoothingEnabled = false;
    if (cw > 0) g.drawImage(painter.frame(key, clip, f), x, 0, cw, h, x * s, 0, cw * s, h * s);
  };
  const wipe = (g) => g.clearRect(0, 0, w * s, h * s);
  let shown = null;
  const changed = (id) => { if (id === shown) return false; shown = id; return true; };

  if (plan.kind === 'bar') {
    // the housing says where its trough is (the sprite's `slice`, Contract 8); the fill strip is cut to the health
    const opening = clipStretch(sprite, plan.frame, params)?.opening ?? null;
    const g = cell();
    return { node, tick() {
      const { hp, max } = health();
      if (!changed(hp + '/' + max)) return;
      const span = fillSpan(opening, w, Math.max(0, hp) / Math.max(1, max));
      wipe(g); paint(g, plan.frame, 0); paint(g, plan.fill, 0, span.x, span.w);
    }, again() { shown = null; } };
  }
  if (plan.kind === 'glyphs') {
    const cells = Array.from({ length: health().max }, cell);
    return { node, tick() {
      const { hp } = health();
      if (!changed(hp)) return;
      cells.forEach((g, i) => { wipe(g); paint(g, i < hp ? plan.full : plan.empty, 0); });
    }, again() { shown = null; } };
  }
  if (plan.kind === 'button') {
    const g = cell();
    let clip = plan.rest, over = false;
    const pickNow = (pressed) => { clip = pressed && plan.pressed ? plan.pressed : over && plan.hover ? plan.hover : plan.rest; };
    node.addEventListener('pointerenter', () => { over = true; pickNow(false); });
    node.addEventListener('pointerleave', () => { over = false; pickNow(false); });
    node.addEventListener('pointerdown', () => pickNow(true));
    node.addEventListener('pointerup', () => pickNow(false));
    return { node, tick(time) {
      const f = frameOf(clip, time);
      if (!changed(clip + ':' + f)) return;
      wipe(g); paint(g, clip, f);
    }, again() { shown = null; } };
  }
  // a set: every clip (none left out), each on its own canvas; the ones that move, move
  const cells = plan.clips.map((clip) => ({ clip, g: cell(), f: -1 }));
  return { node, tick(time) {
    for (const c of cells) {
      const f = frameOf(c.clip, time);
      if (f === c.f) continue;
      c.f = f;
      wipe(c.g); paint(c.g, c.clip, f);
    }
  }, again() { for (const c of cells) c.f = -1; } };
}
