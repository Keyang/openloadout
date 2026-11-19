// The playground (#/play; architecture.md, Contract 9): a sandbox where a visitor tries what is in
// their bag before downloading it. It is not a fixed game: it does something sensible with whatever
// is there. What each thing does comes from its metadata (app/play/roles.js); which clip plays comes
// from clip names (app/play/clips.js); the ground comes from tile names (app/play/level.js); the
// scene itself is app/play/world.js. This file only gathers the bag, builds the page and runs the loop.
//
// The page is two columns (docs/site-design.md, section 5): the scene on the left, and on the right the editing panel
// (app/panel.js) for whichever thing was clicked in the scene or picked from the list of what is in the bag. A change
// made there is saved to the bag as it is made, and the scene takes it without starting again: the same character, in
// the same place, drawn the new way. Anything else that changes the bag (a thing added or removed, a new look for
// everything) builds the scene again.
import { el, header, store } from './ui.js';
import { bag, lookOf, themeFor } from './bag.js';
import { loadCatalog, currentCatalog, assetById, loadSprite, loadSound } from './catalog.js';
import { soundById, soundState, stopAll, toUnit, toValue, isChoice } from './audio.js';
import { cleanParams, clipFps, clipStretch } from '../engine/sprite.js';
import { normalizeTheme, spriteLook, THEME_PRESETS } from '../engine/theme.js';
import { rowFromSprite, rowFromPatch, planScene, SCENE_ROLES, MODES } from './play/roles.js';
import { buildKind, soundIdsOf, isCustom, harmfulLiquid } from './play/kinds.js';
import { extraActions, lookupClip } from './play/clips.js';
import { makeLevel, levelFeatures, tileIndex, levelText } from './play/level.js';
import { createWorld, resetWorld, step, spawn, removeOne, countOf, snapshot, activeLoops } from './play/world.js';
import { createPainter, cameraFor, VIEW_H } from './play/draw.js';
import { createInput } from './play/input.js';
import { createSounds } from './play/sound.js';
import { displayPlan, fillSpan } from './play/display.js';
import { itemEditor } from './bag-edit.js';
import { themeControls } from './theme-controls.js';
import { howTo, roleNote, keysLine, viewName, leftOutNote, viewReason } from './play/words.js';

const HEARD_MAX = 60;
const BOSS_HP = 8;

export async function playPage(app) {
  document.title = 'Playground · Loadout';
  // col: the scene and what is under it, made again with every build. side: the editing panel, which stays.
  const col = el('div', { class: 'play-main' }, el('p', { class: 'lede' }, 'Loading the playground…'));
  const side = el('aside', { class: 'play-side', hidden: true, 'aria-label': 'Change what is in the scene' });
  const main = el('main', { class: 'v2 play-page' }, col, side);
  app.replaceChildren(header('play'), main);

  const guests = [];                 // assets handed over directly instead of through the bag (see addAssets)
  // The visitor's choices: the view, and for each view its own player and background, so that switching the view
  // and back brings back exactly what was there (a pick made in one view is never used in the other).
  const picks = { mode: null, side: {}, top: {} };
  const keep = { paused: false, music: false, started: false, allPieces: false };    // survives a rebuild
  const heard = [];                  // the last sounds that fired, for the browser tests
  let heardTotal = 0;
  let scene = null, gone = false, builds = 0;
  let chosen = null;                 // the thing in the panel: { key, editor }
  let pickedByHand = false;          // the visitor chose it (the scene's own first choice gives way to a new scene's)
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
    showSide(got.entries);
    api.ready = true;
  }

  // ---- the editing panel beside the scene ----------------------------------------------------------
  // One bag item at a time (app/bag-edit.js). What it changes is saved to the bag, and the bag tells the scene (soft, below).

  // The look of the whole bag: its own control, apart from the chosen thing's panel (J5.4), so it is never mistaken for
  // a setting of that one thing. "Look of the whole bag" in the head of the column shows it in place of the thing's
  // panel; "Back to <thing>" (or picking a thing) goes back. With nothing to pick it is all the column shows.
  const look = themeControls({ theme: bag.theme(), live: false, open: false, title: 'The look of your whole bag', onChange: (t) => bag.setTheme(t) });
  const lookBack = el('p', { class: 'play-look-back' });
  const lookBox = el('div', { class: 'play-look', role: 'region', 'aria-label': 'The look of your whole bag' },
    lookBack, look.node,
    el('p', { class: 'hint play-look-note' }, 'Everything in your bag takes this look, here, in your bag and in the download. A thing with a look of its own keeps it.'));
  let lookOpen = false;
  const pickBox = el('div', { class: 'play-side-head' });
  let sideEntries = [], restored = false;

  function closeChosen() {
    if (!chosen) return;
    chosen.off();
    chosen.editor.close();
    chosen = null;
  }
  /** Put a bag item in the panel. byHand: the visitor asked for it (a click in the scene, the list, "Change"). */
  function choose(key, byHand = false) {
    const e = sideEntries.find((x) => x.key === key);
    if (!e) return false;
    if (byHand) { pickedByHand = true; lookOpen = false; store.set('play-chosen', key); }      // remembered, so a reload goes on with the same thing
    if (chosen && chosen.key === key) { drawSide(); return true; }
    closeChosen();
    const item = bag.get(key);
    if (!item) return false;
    const editor = itemEditor(item, e.sprite ?? e.patch, { versions: 6 });
    chosen = { key, editor, off: ownLookNote(editor) };
    drawSide();
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
    const e = chosen ? sideEntries.find((x) => x.key === chosen.key) : null;
    const select = el('select', { id: 'play-choose', onchange: (ev) => { choose(ev.target.value, true); } },
      [['sprite', 'Sprites'], ['sound', 'Sounds'], ['music', 'Music']].map(([kind, label]) => {
        const list = sideEntries.filter((x) => x.row.kind === kind);
        return list.length ? el('optgroup', { label }, list.map((x) => el('option', { value: x.key, selected: !!chosen && x.key === chosen.key }, x.row.name))) : null;
      }));
    const showLook = lookOpen || !chosen;
    pickBox.replaceChildren(
      el('div', { class: 'play-side-pick' },
        el('label', { for: 'play-choose' }, 'Change'), select,
        el('span', { class: 'quiet play-side-hint' }, 'or click it in the scene')),
      el('div', { class: 'play-side-links' },
        e && !showLook ? el('a', { class: 'link play-side-page', href: `#/${e.row.kind}/${e.row.id}?bag=${chosen.key}`, onclick: () => chosen && chosen.editor.edit.flush() }, 'Open its page') : null,
        chosen ? el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-look-open', 'aria-pressed': String(showLook), 'aria-expanded': String(showLook), onclick: () => { lookOpen = !lookOpen; drawSide(); (lookOpen ? lookBox.querySelector('.look-title') : chosen?.editor.node.querySelector('h2'))?.focus?.({ preventScroll: true }); } }, 'Look of the whole bag') : null));
    lookBack.replaceChildren(chosen && e ? el('button', { type: 'button', class: 'link play-look-close', onclick: () => { lookOpen = false; drawSide(); } }, el('span', { 'aria-hidden': 'true' }, '‹ '), `Back to ${e.row.name}`) : '');
    lookBack.hidden = !(chosen && e);
    if (!sideEntries.length && !chosen) side.replaceChildren(lookBox);
    else side.replaceChildren(pickBox, showLook ? lookBox : chosen.editor.node);
    side.dataset.showing = showLook ? 'look' : 'item';
    side.hidden = false;
    for (const b of col.querySelectorAll('.play-edit')) b.setAttribute('aria-pressed', String(!!chosen && b.dataset.key === chosen.key));
  }
  /** After a build: the panel keeps the thing it had if that is still in the bag; else it takes the scene's main thing. */
  function showSide(entries) {
    sideEntries = entries.filter((e) => !String(e.key).startsWith('guest-') && bag.get(e.key));
    look.set(bag.theme());
    if (!entries.length) { closeChosen(); side.hidden = true; side.replaceChildren(); return; }
    if (chosen && sideEntries.some((e) => e.key === chosen.key) && (pickedByHand || chosen.key === (scene.first?.() ?? chosen.key))) { chosen.editor.panel.sync(); drawSide(); return; }
    closeChosen();
    pickedByHand = false;
    // after a reload: the thing that was being changed, if it is still in the bag
    const before = !restored ? store.get('play-chosen') : null;
    restored = true;
    if (before && sideEntries.some((e) => e.key === before) && choose(before, true)) return;
    const first = scene.first?.();
    const key = sideEntries.some((e) => e.key === first) ? first : (sideEntries.find((e) => e.sprite) ?? sideEntries[0])?.key;
    if (key === undefined || !choose(key)) drawSide();
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
      return { stop() {}, state: () => blankState(), soft: () => false };
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

    const blocks = [];
    let card = null;
    let stateOf = () => blankState();
    let putPlayer = () => false;
    // what a change made in the panel does to the running scene, by the key of the bag item it changed
    const softSprite = {}, softSound = {};
    let firstKey = plan.player ?? plan.scene[0] ?? null;
    let spotOf = () => null;

    // ---- the scene
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
      const level = makeLevel(plan.mode, features);
      // a pool of lava or acid hurts; water does not (kinds.js harmfulLiquid: told by the liquid's words and settings)
      if (features.pool) {
        const from = drawn[tiles.tiles.blocks.find((b) => b.prefix === features.pool)?.set];
        level.harmful = harmfulLiquid(features.pool, from?.sprite ?? null, from?.params ?? {});
      }
      // the level as text: a creator can copy it and open it in their own tool (engine/maptext.js reads it back)
      const mapText = levelText(level, plan.tilesets.map((key) => byKey[key].row.id));
      const world = createWorld({ mode: plan.mode, level, kinds, player: plan.player });
      const painter = createPainter({ sprites: drawn, colour: theme.colour, tiles });
      sounds.warm(kinds.flatMap((k) => Object.values(k.cues).flat()));

      const stage = el('canvas', { class: 'play-stage', tabindex: '0', role: 'img', 'aria-label': 'The playground scene. Click a thing in it to change it.' });
      const wrap = el('div', { class: 'play-stage-wrap' }, stage);
      const ctx = stage.getContext('2d');
      const view = { w: 320, h: Math.min(VIEW_H, level.height), zoom: 2 };
      const fit = () => {
        const cw = wrap.clientWidth;
        if (!cw) return;
        view.zoom = cw >= 880 ? 3 : cw >= 250 ? 2 : 1;               // always a whole number
        view.w = Math.max(96, Math.floor(cw / view.zoom));
        stage.width = view.w * view.zoom; stage.height = view.h * view.zoom;
        stage.style.width = stage.width + 'px'; stage.style.height = stage.height + 'px';
      };

      const top = plan.mode === 'top';
      const player = plan.player ? kinds.find((k) => k.key === plan.player) : null;
      const has = (action) => !!(player && lookupClip(player.clipNames, action, { mode: plan.mode, view: player.view }));

      // on-screen buttons (shown on a phone)
      const hold = (name, label, text) => el('button', { type: 'button', class: 'play-key', 'data-hold': name, 'aria-label': label }, text ?? label);
      const pad = el('div', { class: 'play-pad' },
        el('div', { class: 'play-pad-group' }, hold('left', 'Left', '◀'), top ? hold('up', 'Up', '▲') : null, top ? hold('down', 'Down', '▼') : null, hold('right', 'Right', '▶')),
        player ? el('div', { class: 'play-pad-group' }, top ? null : hold('jump', 'Jump'), has('block') ? hold('block', 'Block') : null, hold('action', 'Action')) : null);
      const input = createInput({ pad, ignore: '.play-side' });      // keys pressed in the editing panel are the panel's: they never move the character
      stops.push(() => input.destroy());

      // score and health: what was collected (when there is something to collect) and the player's health,
      // then the bag's interface pieces and icons
      const countText = el('strong', {}, '0'), healthText = el('strong', {}, '');
      const firstPickup = kinds.find((k) => k.role === 'pickup');
      const count = firstPickup ? el('span', { class: 'play-count play-collected' }, picture(painter, firstPickup.key, drawn[firstPickup.key].sprite, firstPickup.rest), 'Collected: ', countText) : null;
      const health = player ? el('span', { class: 'play-count play-health' }, 'Health: ', healthText) : null;
      const healthNow = () => (world.player ? { hp: world.player.hp, max: player.hp } : { hp: 3, max: 3 });
      const pieces = plan.display.map((key) => displayPiece(painter, key, byKey[key].row.name, drawn[key].sprite, drawn[key].params, healthNow));
      // The bag's interface pieces are ONE ROW that scrolls sideways inside itself, however many there are, so a
      // large bag does not push the scene down the page. "Show all" folds the row open (the pieces wrap, to be
      // looked at together) and "Show one row" folds it away again; the button is there only when the row overflows,
      // and it comes before the row, so it stays in the same place, on the first line, when the row is folded open.
      const strip = pieces.length ? el('div', { class: 'play-pieces', role: 'group', tabindex: '0', 'aria-label': 'Interface pieces from your bag' }, pieces.map((p) => p.node)) : null;
      const more = strip ? el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-pieces-more', hidden: true, onclick: () => { keep.allPieces = !keep.allPieces; syncPieces(); } }) : null;
      const syncPieces = () => {
        if (!strip) return;
        strip.classList.toggle('open', keep.allPieces);
        more.setAttribute('aria-expanded', String(keep.allPieces));
        more.textContent = keep.allPieces ? 'Show one row' : `Show all ${pieces.length}`;
        more.hidden = !keep.allPieces && strip.scrollWidth <= strip.clientWidth + 1;
      };
      const hud = count || health || pieces.length
        ? el('div', { class: 'play-hud', 'aria-label': 'Score and health' }, el('span', { class: 'play-hud-title' }, 'Score and health'), count, health, more, strip)
        : null;

      // tools
      const pauseBtn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { keep.paused = !keep.paused; syncPause(); } });
      const syncPause = () => { pauseBtn.textContent = keep.paused ? 'Resume' : 'Pause'; };
      syncPause();
      let pendingClip = null;
      const extras = player ? extraActions(player.clipNames, plan.mode) : [];
      const labelOf = (action) => {
        const sel = lookupClip(player.clipNames, action, { mode: plan.mode, view: player.view });
        return (sel ? player.clips[sel.clip].label : action).replace(/\s*\(.*\)$/, '');
      };
      // The view: which one the scene is in, and, when the bag has things for both, the way to the other one.
      const setView = (mode) => { if (mode === plan.mode) return; picks.mode = mode; build(); };
      const viewPick = el('span', { class: 'play-extras play-view' }, el('span', { class: 'label' }, 'View'),
        plan.modes.length > 1
          ? el('span', { class: 'seg', role: 'group', 'aria-label': 'View' }, MODES.filter((m) => plan.modes.includes(m)).map((m) => el('button', { type: 'button', 'aria-pressed': String(m === plan.mode), onclick: () => setView(m) }, viewName(m))))
          : el('span', { class: 'play-view-now' }, viewName(plan.mode)));
      const tools = el('div', { class: 'play-tools' },
        muteBtn, pauseBtn,
        el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { resetWorld(world); free.x = level.start.x; free.y = level.start.y; cam = null; syncCounts(); } }, 'Reset the scene'),
        el('button', { type: 'button', class: 'btn btn-sm btn-secondary play-copy', onclick: copyLevel }, 'Copy this level'),
        viewPick,
        extras.length ? el('span', { class: 'play-extras' }, el('span', { class: 'label' }, 'Other moves'),
          el('span', { class: 'chips' }, extras.map((action) => el('button', { type: 'button', class: 'chip', onclick: () => { pendingClip = action; } }, labelOf(action))))) : null);

      // "Copy this level": the map text on the clipboard; where the browser will not allow that, in a box to copy from
      const copyNote = el('p', { class: 'hint play-copied', role: 'status' });
      async function copyLevel() {
        try {
          await navigator.clipboard.writeText(mapText);
          copyNote.replaceChildren('Copied. This is the level as text: the letters are tiles, one for each square. Paste it into a text file or your own level tool.');
        } catch {
          const box = el('textarea', { class: 'play-map', readonly: true, rows: Math.min(16, mapText.split('\n').length), 'aria-label': 'This level as text' }, mapText);
          copyNote.replaceChildren('Your browser did not allow copying. Select the text in this box and copy it: ', box);
          box.select();
        }
      }
      const keysNote = el('p', { class: 'play-keys' }, keysLine({ mode: plan.mode, player: !!player, block: has('block'), dodge: has('dodge') }));
      // one line for someone who has never played on a keyboard, from what is really in the scene
      const nameOf = (test) => { const k = kinds.find(test); return k ? byKey[k.key].row.name : null; };
      const tip = howTo({
        mode: plan.mode, player: !!player, ledges: !top,
        pickup: nameOf((k) => k.role === 'pickup'), enemy: nameOf((k) => k.hittable && k.key !== plan.player), prop: nameOf((k) => k.role === 'prop'),
      });
      const howNote = tip ? el('p', { class: 'play-howto' }, tip) : null;

      // what is in the scene, with add one / remove one
      const counters = [];
      const tags = {};
      const syncCounts = () => { for (const [key, node] of counters) node.textContent = String(countOf(world, key)); };
      // (what was drawn for the other view is not in the scene: it is listed on its own, under the scene)
      const rows = entries.filter((e) => e.sprite && !plan.leftOut.includes(e.key)).map((e) => {
        const role = plan.roles[e.key];
        // a sprite the visitor changed says so, so it is clear this is their version and not the one in the catalogue
        const tagBox = el('span', { class: 'play-tag-box' });
        const tag = () => tagBox.replaceChildren(...(isCustom(e.sprite, e.settings) ? [el('span', { class: 'play-tag' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), 'your version')] : []));
        tag();
        tags[e.key] = tag;
        const row = el('li', {}, el('span', { class: 'play-name' }, e.row.name, tagBox), el('span', { class: 'hint' }, roleNote(role, { player: !!player })));
        if (bag.get(e.key)) row.append(el('button', { type: 'button', class: 'play-edit', 'data-key': e.key, 'aria-pressed': 'false', 'aria-label': `Change ${e.row.name}`, onclick: () => choose(e.key, true) }, 'Change'));
        if (SCENE_ROLES.includes(role)) {
          const n = el('span', { class: 'play-n', 'aria-label': `${e.row.name} in the scene` });
          counters.push([e.key, n]);
          row.append(el('span', { class: 'play-more' },
            el('button', { type: 'button', class: 'play-step', 'aria-label': `Remove one ${e.row.name}`, title: 'Remove one', onclick: () => { removeOne(world, e.key); syncCounts(); } }, '−'),
            n,
            el('button', { type: 'button', class: 'play-step', 'aria-label': `Add one ${e.row.name}`, title: 'Add one', onclick: () => { spawn(world, e.key); syncCounts(); } }, '+')));
        }
        return row;
      });
      syncCounts();
      const choice = (label, field, list) => (list.length < 2 ? null : el('div', { class: 'play-pick' }, el('span', { class: 'label' }, label),
        el('span', { class: 'chips', role: 'group', 'aria-label': label }, list.map((key) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(plan[field] === key), onclick: () => { picks[plan.mode][field] = key; build(); } }, byKey[key].row.name)))));
      const notes = [];
      const otherMode = MODES.find((m) => m !== plan.mode);
      // a character drawn for the other view is in the bag: say so, instead of sending the visitor off to find one
      const playerElsewhere = plan.leftOut.some((key) => byKey[key].row.role === 'characters/player');
      if (!player && playerElsewhere) notes.push(el('p', { class: 'hint' }, `There is no character drawn for this view to play as, so the arrow keys only move the view. Switch to ${viewName(otherMode)} to play as the one in your bag.`));
      else if (!player) notes.push(el('p', { class: 'hint' }, 'There is no character to play as in your bag, so the arrow keys only move the view. ', el('a', { href: '#/browse?kind=sprite' }, 'Find a character')));
      if (top && plan.backgrounds.length) notes.push(el('p', { class: 'hint' }, 'Seen from above, the background lies under the room: it only shows through a pit you can see into.'));
      if (missing) notes.push(el('p', { class: 'hint' }, `${missing} thing${missing === 1 ? '' : 's'} in your bag could not be found, so ${missing === 1 ? 'it is' : 'they are'} not here.`));

      blocks.push(el('div', { class: 'play-card' }, hud, wrap, pad, tools, copyNote, howNote, keysNote));
      card = blocks.at(-1);
      // Under the scene: what was left out of it because it was drawn for the other view, why, and the way to see it.
      if (plan.leftOut.length) {
        blocks.push(el('section', { class: 'play-left-out', 'aria-label': 'Left out of this scene' }, el('h2', {}, 'Left out of this scene'),
          el('p', {}, leftOutNote(plan.leftOut.map((key) => byKey[key].row.name), plan.mode)),
          el('p', { class: 'play-left-out-do' },
            el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => setView(otherMode) }, `Switch to ${viewName(otherMode)}`),
            el('span', { class: 'hint' }, viewReason(plan.why, plan.mode)))));
      }
      blocks.push(el('section', { class: 'play-things' }, el('h2', {}, 'In the scene'),
        choice('Play as', 'player', plan.players), choice('Background', 'background', plan.backgrounds),
        el('ul', {}, rows), notes));

      // ---- the loop
      const free = { x: level.start.x, y: level.start.y };       // where the view looks when there is no player
      const jobs = painter.allFrames(Object.keys(drawn));
      let raf = 0, last = performance.now(), shown = -1, shownHp = -1, cam = null;
      const onEvent = (e) => {
        if (e.type === 'collect' || e.type === 'die') syncCounts();
        if (e.type !== 'sound') return;
        sounds.cue(e.cue);
        hear({ sound: e.sound, by: world.kinds[e.kind].id, clip: e.clip });
      };
      const tick = (now) => {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        const inp = input.state(plan.mode);
        if (!keep.paused) {
          if (pendingClip) { inp.clip = pendingClip; pendingClip = null; }
          if (!world.player) {
            free.x = Math.max(0, Math.min(level.width, free.x + ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * 140 * dt));
            free.y = Math.max(0, Math.min(level.height, free.y + ((inp.down ? 1 : 0) - (inp.up ? 1 : 0)) * 140 * dt));
          }
          const before = world.things.length;
          for (const e of step(world, inp, dt)) onEvent(e);
          if (world.things.length !== before) syncCounts();
        }
        sounds.syncLoops(keep.paused || !soundState.on ? [] : activeLoops(world));
        // make a few frames ahead of need, so nothing stutters the first time a clip plays
        for (const t0 = performance.now(); jobs.length && performance.now() - t0 < 3;) painter.frame(...jobs.pop());
        // the view follows the player at once sideways, and gently up and down so a jump does not shake it
        const want = cameraFor(level, view, world.player ?? free);
        cam = cam && !keep.paused ? { x: want.x, y: Math.abs(want.y - cam.y) < 0.5 ? want.y : cam.y + (want.y - cam.y) * Math.min(1, dt * 7) } : want;
        painter.draw(ctx, { world, view, cam, plan });
        if (pickedByHand && chosen && world.kinds[chosen.key]) painter.mark(ctx, { world, view, cam, key: chosen.key });      // what the visitor picked is marked in the scene
        if (world.collected !== shown) { shown = world.collected; countText.textContent = String(shown); }
        if (world.player && world.player.hp !== shownHp) { shownHp = world.player.hp; healthText.textContent = `${Math.max(0, shownHp)} of ${player.hp}`; }
        for (const p of pieces) p.tick(world.time);
        raf = requestAnimationFrame(tick);
      };
      const ro = new ResizeObserver(() => { fit(); syncPieces(); });
      stops.push(() => { cancelAnimationFrame(raf); ro.disconnect(); });
      stateOf = () => ({
        ...snapshot(world), paused: keep.paused, muted: !soundState.on, zoom: view.zoom, view: { w: view.w, h: view.h },
        cam: cam ? { x: Math.round(cam.x), y: Math.round(cam.y) } : null,        // the corner of the scene the picture shows, as it was last drawn
        heard: [...heard], heardTotal, music: tracks.some((t) => t.playing() || t.starting()),
        map: mapText,
        plan: { mode: plan.mode, modes: plan.modes, why: plan.why, leftOut: plan.leftOut, player: plan.player, tilesets: plan.tilesets, background: plan.background, scene: plan.scene, display: plan.display, board: plan.board, music: plan.music },
      });
      // ---- a thing in the scene is clicked: it goes in the panel. And the keyboard comes back to the scene.
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
        if (!cam) return;
        const box = stage.getBoundingClientRect();
        const wx = cam.x + (ev.clientX - box.left) / view.zoom, wy = cam.y + (ev.clientY - box.top) / view.zoom;
        // a thing first; else the ground, wall or platform laid there; else what is behind the scene
        const key = thingAt(wx, wy) ?? painter.tileAt(wx, wy) ?? plan.background ?? null;
        if (key !== null && bag.get(key)) choose(key, true);
      });
      // where a kind of thing is on the page now (for the browser tests): the middle of its first one, in window pixels
      spotOf = (key) => {
        const t = world.player && world.player.kind === key ? world.player : world.things.find((x) => x.kind === key && x.state !== 'gone' && !x.passing);
        if (!t || !cam) return null;
        const k = world.kinds[t.kind], box = stage.getBoundingClientRect();
        return { x: box.left + (t.x - k.pivot[0] + k.size[0] / 2 - cam.x) * view.zoom, y: box.top + (t.y - k.pivot[1] - t.lift + k.size[1] / 2 - cam.y) * view.zoom };
      };

      // ---- a sprite was changed in the panel: it is drawn the new way from the next picture on, where it stands
      for (const e of entries) {
        if (!e.sprite) continue;
        softSprite[e.key] = () => {
          const kind = world.kinds[e.key];
          if (kind) {
            const fresh = kindOf(e);
            Object.assign(kind, fresh);
            sounds.warm(Object.values(fresh.cues).flat());
          }
          painter.forget(e.key);
          for (const p of pieces) p.again();
          if (tags[e.key]) tags[e.key]();
          for (const [clip, c] of Object.entries(e.sprite.clips)) for (let f = 0; f < c.frames; f++) jobs.push([e.key, clip, f]);
        };
      }

      putPlayer = (x, y) => { if (!world.player) return false; Object.assign(world.player, { x, y, vx: 0, vy: 0, onGround: plan.mode === 'top' }); cam = null; return true; };
      // start once the page is in place, so the scene knows how wide it can be
      queueMicrotask(() => { if (gone) return; ro.observe(wrap); if (strip) ro.observe(strip); fit(); syncPieces(); raf = requestAnimationFrame(tick); });
    } else {
      blocks.push(el('p', { class: 'lede' }, 'Your bag has sounds but nothing to draw yet, so here they are to listen to. Add a character or a creature to see a scene.'),
        el('div', { class: 'play-tools' }, muteBtn));
      firstKey = null;
      stateOf = () => ({ ...blankState(), music: tracks.some((t) => t.playing() || t.starting()) });
    }

    // ---- the sound board: one button for each sound that no sprite in the bag plays
    if (plan.board.length || plan.attached.length) {
      const buttons = plan.board.map((key) => {
        const e = byKey[key];
        const btn = el('button', { type: 'button', class: 'chip play-sound', 'aria-pressed': 'false' }, e.row.name);
        softSound[key] = () => {};      // the button reads the settings each time it is pressed
        const b = sounds.boardSound(e.patch, () => e.settings, () => btn.setAttribute('aria-pressed', String(b.playing() && !!e.patch.loop)));
        boards.push(b);
        btn.addEventListener('click', () => {
          if (!soundState.on) setMuted(false);
          const wasOn = b.playing() && e.patch.loop;
          b.play();
          if (!wasOn) hear({ sound: e.patch.id, by: 'board', clip: null });
        });
        return btn;
      });
      const attached = plan.attached.map((key) => byKey[key].row.name);
      blocks.push(el('section', { class: 'play-board' }, el('h2', {}, 'Sound board'),
        buttons.length ? el('div', { class: 'play-sounds' }, buttons) : null,
        attached.length ? el('p', { class: 'hint' }, `${attached.join(', ')} ${attached.length === 1 ? 'is' : 'are'} not here because a sprite in your bag already plays ${attached.length === 1 ? 'it' : 'them'}.`) : null));
    }

    // ---- music: it starts on the visitor's first key press or tap; play and stop, and its main sliders
    if (plan.music.length) {
      const anyOn = () => tracks.some((t) => t.playing() || t.starting());
      const musicBox = el('section', { class: 'play-music' }, el('h2', {}, 'Music'), plan.music.map((key) => {
        const e = byKey[key], patch = e.patch, name = e.row.name;
        const note = el('p', { class: 'hint', role: 'status' });
        const btn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => {
          if (t.playing() || t.starting()) { t.stop(); return; }
          if (!soundState.on) setMuted(false);
          for (const other of tracks) if (other !== t) other.stop();
          t.start();
        } });
        const sync = () => {
          const word = t.starting() ? 'Starting…' : t.playing() ? 'Stop music' : 'Play music';
          btn.textContent = word; btn.setAttribute('aria-label', `${word}: ${name}`);
          note.textContent = t.note();
          keep.music = anyOn();
        };
        const t = sounds.track(patch, e.settings, sync);
        tracks.push(t);
        sync();
        const inputs = [];
        // the track was changed in the panel: it is heard at once, and these sliders follow
        softSound[key] = () => { t.retune(e.settings); for (const [d, input, fill] of inputs) { input.value = toUnit(d, t.params[d.id]); fill(); } };
        const sliders = patch.params.filter((d) => !isChoice(d) && d.id !== 'key');
        const lead = ['intensity', 'bpm'].map((id) => sliders.find((d) => d.id === id)).filter(Boolean);
        const mainOnes = [...lead, ...sliders.filter((d) => !lead.includes(d))].slice(0, 3);
        return el('div', { class: 'play-track' }, el('div', { class: 'play-track-top' }, el('span', { class: 'play-name' }, name), btn),
          mainOnes.map((d) => {
            const id = `play-${key}-${d.id}`;
            const input = el('input', { id, type: 'range', min: 0, max: 1, step: 0.005, value: toUnit(d, t.params[d.id]), oninput: (ev) => { t.set(d.id, toValue(d, Number(ev.target.value))); fill(); } });
            const fill = () => input.style.setProperty('--p', `${Number(input.value) * 100}%`);
            fill();
            inputs.push([d, input, fill]);
            return el('div', { class: 'field' }, el('label', { for: id }, d.label), input);
          }), note);
      }), el('p', { class: 'hint' }, 'The music starts when you first press a key or tap the scene. Mute is under the scene.'));
      blocks.push(musicBox);
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
        el('p', { class: 'lede' }, 'Try the things in your bag together. Click one in the scene to change it: the change is saved in your bag and the scene takes it as you go.')),
      ...blocks,
      el('p', { class: 'play-foot' }, el('a', { class: 'btn btn-secondary', href: '#/bag' }, 'Back to your bag'), el('span', { class: 'hint' }, 'The look you set for your bag is used here too: colours, sound and music.')));
    if (card) main.classList.add('has-scene'); else main.classList.remove('has-scene');

    /**
     * The bag changed. When all that changed is the settings of things already here (what the panel does), the scene
     * takes them as it runs and this returns true. Anything else (a thing added or taken out, another look, a sprite
     * whose sounds are now others) returns false, and the page builds the scene again.
     */
    const made = { items: entries.filter((e) => !String(e.key).startsWith('guest-')).map((e) => `${e.key}:${e.row.kind}:${e.row.id}`).join(), theme: JSON.stringify(theme), missing };
    function soft() {
      const items = bag.items();
      const here = items.filter((i) => byKey[i.key]);
      if (items.length - here.length !== made.missing || here.map((i) => `${i.key}:${i.kind}:${i.id}`).join() !== made.items) return false;
      if (JSON.stringify(normalizeTheme(bag.theme())) !== made.theme) return false;
      for (const item of here) {
        const e = byKey[item.key], next = item.settings ?? {};
        if (JSON.stringify(next) === JSON.stringify(e.settings)) continue;
        if (e.sprite) {
          if (!softSprite[e.key]) return false;
          const own = lookOf(next) ? themeFor(next, theme) : null;
          const params = spriteLook(e.sprite, next.params ?? {}, own ?? theme, { record: own ? undefined : next.lookParams }).params;
          const ids = soundIdsOf(e.sprite, next.cues ?? null, params).filter((id) => patchOf(id));
          if (ids.join() !== (e.soundIds ?? []).join() || (next.artStyle ?? null) !== (e.settings.artStyle ?? null)) return false;      // the sound board may differ now
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
    return { stop() { for (const s of stops) s(); }, state: () => stateOf(), put: (x, y) => putPlayer(x, y), soft, first: () => firstKey, spot: (key) => spotOf(key) };
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
    /** The scene as plain data: mode, player, things, collected, paused, muted, the sounds that fired. */
    state: () => ({ ...(scene ? scene.state() : blankState()), chosen: chosen ? chosen.key : null }),
    /** Put a bag item (by its key) in the editing panel, as a click on it in the scene does. */
    choose: (key) => choose(key, true),
    /** Where a kind of thing (a bag item's key) is on the page now: { x, y } in window pixels, or null. */
    spot: (key) => (scene && scene.spot ? scene.spot(key) : null),
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
  const off = bag.onChange(() => { if (api.ready && scene && scene.soft && scene.soft()) { look.set(bag.theme()); return; } build(); });
  return () => {
    gone = true; off();
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

const pieceScale = (sprite) => (Math.max(sprite.size[0], sprite.size[1]) <= 32 ? 2 : 1);     // always a whole number

/**
 * An interface piece or icon in the "Score and health" strip. What it shows comes from its clip names
 * (app/play/display.js): a bar filled to the player's health inside its opening, glyphs for each point of
 * health, a button with its states, or a set: every clip side by side. Each clip is its own small canvas: in the
 * strip's one row they stay side by side (the row scrolls), and when the row is folded open ("Show all") a long
 * set wraps onto the next line instead of pushing the page wider than the screen.
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
