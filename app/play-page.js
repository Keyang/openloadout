// The playground (#/play; architecture.md, Contract 9): a sandbox where a visitor tries what is in
// their bag before downloading it. It is not a fixed game: it does something sensible with whatever
// is there. What each thing does comes from its metadata (app/play/roles.js); which clip plays comes
// from clip names (app/play/clips.js); the ground comes from tile names (app/play/level.js); the
// scene itself is app/play/world.js. This file only gathers the bag, builds the page and runs the loop.
import { el, header } from './ui.js';
import { bag } from './bag.js';
import { loadCatalog, currentCatalog, assetById, loadSprite, loadSound } from './catalog.js';
import { soundById, soundState, setSoundOn, toUnit, toValue, isChoice } from './audio.js';
import { cleanParams, clipFps, clipStretch } from '../engine/sprite.js';
import { normalizeTheme, themedParams } from '../engine/theme.js';
import { rowFromSprite, rowFromPatch, planScene, SCENE_ROLES } from './play/roles.js';
import { buildKind, soundIdsOf, isCustom } from './play/kinds.js';
import { extraActions, lookupClip } from './play/clips.js';
import { makeLevel, levelFeatures, tileIndex, levelText } from './play/level.js';
import { createWorld, resetWorld, step, spawn, removeOne, countOf, snapshot, activeLoops } from './play/world.js';
import { createPainter, cameraFor } from './play/draw.js';
import { createInput } from './play/input.js';
import { createSounds } from './play/sound.js';
import { displayPlan, fillSpan } from './play/display.js';
import { howTo, roleNote, keysLine } from './play/words.js';

const VIEW_H = 180;      // the scene is this many sprite pixels high: one background layer (320 x 180) fills it
const HEARD_MAX = 60;
const BOSS_HP = 8;

export async function playPage(app) {
  document.title = 'Playground · Loadout';
  const main = el('main', { class: 'home play-page' }, el('p', { class: 'lede' }, 'Loading the playground…'));
  app.replaceChildren(header('play'), main);

  const guests = [];                 // assets handed over directly instead of through the bag (see addAssets)
  const picks = {};                  // the visitor's choice of player and background
  const keep = { paused: false, music: false, started: false };    // survives a rebuild
  const heard = [];                  // the last sounds that fired, for the browser tests
  let heardTotal = 0;
  let scene = null, gone = false, builds = 0;
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
    api.ready = true;
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
      drawn[e.key] = { sprite: e.sprite, params: themedParams(e.sprite, cleanParams(e.sprite, e.settings.params ?? {}), theme), artStyle: e.settings.artStyle };
      e.soundIds = soundIdsOf(e.sprite, e.settings.cues ?? null, drawn[e.key].params).filter((id) => patchOf(id));
    }
    const plan = planScene(entries, picks);
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    const stops = [];

    if (plan.empty) {
      main.replaceChildren(...emptyView(missing));
      return { stop() {}, state: () => blankState() };
    }

    const sounds = createSounds({ theme, patchOf });
    stops.push(() => sounds.destroy());
    const tracks = [], boards = [];
    const muteBtn = el('button', { type: 'button', class: 'btn plain play-mute', onclick: () => setMuted(soundState.on) });
    const syncMute = () => { muteBtn.textContent = soundState.on ? 'Mute' : 'Unmute'; muteBtn.setAttribute('aria-pressed', String(!soundState.on)); };
    function setMuted(muted) {
      if (muted) { for (const t of tracks) t.stop(); for (const b of boards) b.stop(); sounds.stopLoops(); }
      setSoundOn(!muted);
      syncMute();
    }
    syncMute();

    const blocks = [];
    let stateOf = () => blankState();

    // ---- the scene
    if (!plan.soundsOnly) {
      const isLoop = (id) => !!patchOf(id)?.loop;
      const kinds = entries.filter((e) => e.key === plan.player || e.key === plan.projectile || plan.scene.includes(e.key)).map((e) => {
        const role = plan.roles[e.key];
        const kind = buildKind({ key: e.key, sprite: e.sprite, row: e.row, settings: { params: drawn[e.key].params, cues: e.settings.cues ?? null } }, role,
          { isLoop, hostile: role === 'creature' && e.row.role !== 'characters/animal', hp: e.row.role === 'characters/boss' ? BOSS_HP : undefined });
        for (const clip of kind.clipNames) kind.cues[clip] = kind.cues[clip].filter((c) => patchOf(c.sound));
        return kind;
      });
      // every tileset in the bag is read together: one may hold the floor, another the walls
      const tiles = tileIndex(plan.tilesets.map((key) => ({ key, names: Object.keys(drawn[key].sprite.clips), size: drawn[key].sprite.size[0], clips: drawn[key].sprite.clips })));
      const level = makeLevel(plan.mode, levelFeatures(tiles, plan.mode));
      // the level as text: a creator can copy it and open it in their own tool (engine/maptext.js reads it back)
      const mapText = levelText(level, plan.tilesets.map((key) => byKey[key].row.id));
      const world = createWorld({ mode: plan.mode, level, kinds, player: plan.player });
      const painter = createPainter({ sprites: drawn, colour: theme.colour, tiles });
      sounds.warm(kinds.flatMap((k) => Object.values(k.cues).flat()));

      const stage = el('canvas', { class: 'play-stage', role: 'img', 'aria-label': 'The playground scene' });
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
      const input = createInput({ pad });
      stops.push(() => input.destroy());

      // score and health: what was collected (when there is something to collect) and the player's health,
      // then the bag's interface pieces and icons
      const countText = el('strong', {}, '0'), healthText = el('strong', {}, '');
      const firstPickup = kinds.find((k) => k.role === 'pickup');
      const count = firstPickup ? el('span', { class: 'play-count play-collected' }, picture(painter, firstPickup.key, drawn[firstPickup.key].sprite, firstPickup.rest), 'Collected: ', countText) : null;
      const health = player ? el('span', { class: 'play-count play-health' }, 'Health: ', healthText) : null;
      const healthNow = () => (world.player ? { hp: world.player.hp, max: player.hp } : { hp: 3, max: 3 });
      const pieces = plan.display.map((key) => displayPiece(painter, key, byKey[key].row.name, drawn[key].sprite, drawn[key].params, healthNow));
      const hud = count || health || pieces.length
        ? el('div', { class: 'play-hud', 'aria-label': 'Score and health' }, el('span', { class: 'play-hud-title' }, 'Score and health'), count, health, pieces.map((p) => p.node))
        : null;

      // tools
      const pauseBtn = el('button', { type: 'button', class: 'ghost', onclick: () => { keep.paused = !keep.paused; syncPause(); } });
      const syncPause = () => { pauseBtn.textContent = keep.paused ? 'Resume' : 'Pause'; };
      syncPause();
      let pendingClip = null;
      const extras = player ? extraActions(player.clipNames, plan.mode) : [];
      const labelOf = (action) => {
        const sel = lookupClip(player.clipNames, action, { mode: plan.mode, view: player.view });
        return (sel ? player.clips[sel.clip].label : action).replace(/\s*\(.*\)$/, '');
      };
      const tools = el('div', { class: 'play-tools' },
        muteBtn, pauseBtn,
        el('button', { type: 'button', class: 'ghost', onclick: () => { resetWorld(world); free.x = level.start.x; free.y = level.start.y; cam = null; syncCounts(); } }, 'Reset the scene'),
        el('button', { type: 'button', class: 'ghost play-copy', onclick: copyLevel }, 'Copy this level'),
        extras.length ? el('span', { class: 'play-extras' }, el('span', { class: 'label' }, 'Other moves'),
          el('span', { class: 'pills small' }, extras.map((action) => el('button', { type: 'button', class: 'pill', onclick: () => { pendingClip = action; } }, labelOf(action))))) : null);

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
      const syncCounts = () => { for (const [key, node] of counters) node.textContent = String(countOf(world, key)); };
      const rows = entries.filter((e) => e.sprite).map((e) => {
        const role = plan.roles[e.key];
        // a sprite the visitor changed says so, so it is clear this is their version and not the one in the catalogue
        const mine = isCustom(e.sprite, e.settings) ? el('span', { class: 'play-tag' }, 'your version') : null;
        const unused = plan.otherTiles.includes(e.key) ? `Made for ${top ? 'side view' : 'top-down'}, so it is not used in this scene.` : null;
        const row = el('li', {}, el('span', { class: 'play-name' }, e.row.name, mine), el('span', { class: 'hint' }, unused ?? roleNote(role, { player: !!player })));
        if (SCENE_ROLES.includes(role)) {
          const n = el('span', { class: 'play-n', 'aria-label': `${e.row.name} in the scene` });
          counters.push([e.key, n]);
          row.append(el('span', { class: 'play-more' },
            el('button', { type: 'button', class: 'mini', 'aria-label': `Remove one ${e.row.name}`, onclick: () => { removeOne(world, e.key); syncCounts(); } }, 'Remove one'),
            n,
            el('button', { type: 'button', class: 'mini', 'aria-label': `Add one ${e.row.name}`, onclick: () => { spawn(world, e.key); syncCounts(); } }, 'Add one')));
        }
        return row;
      });
      syncCounts();
      const choice = (label, field, list) => (list.length < 2 ? null : el('div', { class: 'play-pick' }, el('span', { class: 'label' }, label),
        el('span', { class: 'pills small', role: 'group', 'aria-label': label }, list.map((key) => el('button', { type: 'button', class: 'pill', 'aria-pressed': String(plan[field] === key), onclick: () => { picks[field] = key; build(); } }, byKey[key].row.name)))));
      const notes = [];
      if (!player) notes.push(el('p', { class: 'hint' }, 'There is no character to play as in your bag, so the arrow keys only move the view. ', el('a', { href: '#/browse?kind=sprite' }, 'Find a character')));
      if (top && plan.backgrounds.length) notes.push(el('p', { class: 'hint' }, 'Seen from above, the background lies under the room: it only shows through a pit you can see into.'));
      if (missing) notes.push(el('p', { class: 'hint' }, `${missing} thing${missing === 1 ? '' : 's'} in your bag could not be found, so ${missing === 1 ? 'it is' : 'they are'} not here.`));

      blocks.push(el('div', { class: 'play-card' }, hud, wrap, pad, tools, copyNote, howNote, keysNote));
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
        if (world.collected !== shown) { shown = world.collected; countText.textContent = String(shown); }
        if (world.player && world.player.hp !== shownHp) { shownHp = world.player.hp; healthText.textContent = `${Math.max(0, shownHp)} of ${player.hp}`; }
        for (const p of pieces) p.tick(world.time);
        raf = requestAnimationFrame(tick);
      };
      const ro = new ResizeObserver(fit);
      stops.push(() => { cancelAnimationFrame(raf); ro.disconnect(); });
      stateOf = () => ({
        ...snapshot(world), paused: keep.paused, muted: !soundState.on, zoom: view.zoom, view: { w: view.w, h: view.h },
        heard: [...heard], heardTotal, music: tracks.some((t) => t.playing() || t.starting()),
        map: mapText,
        plan: { mode: plan.mode, player: plan.player, tilesets: plan.tilesets, background: plan.background, scene: plan.scene, display: plan.display, board: plan.board, music: plan.music },
      });
      // start once the page is in place, so the scene knows how wide it can be
      queueMicrotask(() => { if (gone) return; ro.observe(wrap); fit(); raf = requestAnimationFrame(tick); });
    } else {
      blocks.push(el('p', { class: 'lede' }, 'Your bag has sounds but nothing to draw yet, so here they are to listen to. Add a character or a creature to see a scene.'),
        el('div', { class: 'play-tools' }, muteBtn));
      stateOf = () => ({ ...blankState(), music: tracks.some((t) => t.playing() || t.starting()) });
    }

    // ---- the sound board: one button for each sound that no sprite in the bag plays
    if (plan.board.length || plan.attached.length) {
      const buttons = plan.board.map((key) => {
        const e = byKey[key];
        const btn = el('button', { type: 'button', class: 'btn plain play-sound', 'aria-pressed': 'false' }, e.row.name);
        const b = sounds.boardSound(e.patch, e.settings, () => btn.setAttribute('aria-pressed', String(b.playing() && !!e.patch.loop)));
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
        const btn = el('button', { type: 'button', class: 'btn', onclick: () => {
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
        const sliders = patch.params.filter((d) => !isChoice(d) && d.id !== 'key');
        const lead = ['intensity', 'bpm'].map((id) => sliders.find((d) => d.id === id)).filter(Boolean);
        const mainOnes = [...lead, ...sliders.filter((d) => !lead.includes(d))].slice(0, 3);
        return el('div', { class: 'play-track' }, el('div', { class: 'play-track-top' }, el('span', { class: 'play-name' }, name), btn),
          mainOnes.map((d) => {
            const id = `play-${key}-${d.id}`;
            return el('div', { class: 'field' }, el('label', { for: id }, d.label),
              el('input', { id, type: 'range', min: 0, max: 1, step: 0.005, value: toUnit(d, t.params[d.id]), oninput: (ev) => t.set(d.id, toValue(d, Number(ev.target.value))) }));
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

    main.replaceChildren(
      el('div', { class: 'play-head' }, el('h1', { class: 'small' }, 'Playground'),
        el('p', { class: 'lede' }, 'Try the things in your bag together before you download them. Each one does what its kind does: a character is yours to move, creatures wander, pickups can be collected, sounds play when they should.')),
      ...blocks,
      el('p', { class: 'play-foot' }, el('a', { class: 'btn plain', href: '#/bag' }, 'Back to your bag'), el('span', { class: 'hint' }, 'The look you set for your bag is used here too: colours, sound and music.')));
    return { stop() { for (const s of stops) s(); }, state: () => stateOf() };
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
        el('h1', { class: 'small' }, 'Playground'),
        el('p', { class: 'lede' }, `${missing === 1 ? 'The one thing' : `None of the ${missing} things`} in your bag could be found on the site any more, so there is nothing to try here. Take ${missing === 1 ? 'it' : 'them'} out of your bag and add something from the catalogue.`),
        el('p', { class: 'play-foot' }, el('a', { class: 'btn', href: '#/bag' }, 'Open your bag'), el('a', { class: 'btn plain', href: '#/' }, 'Browse everything')),
      ];
    }
    return [
      el('h1', { class: 'small' }, 'Playground'),
      el('p', { class: 'lede' }, 'Your bag is empty, so there is nothing to try yet. Put a character, some creatures, things to collect, sounds or music in your bag, then come back here to see and hear them together before you download them.'),
      el('p', { class: 'play-foot' }, el('a', { class: 'btn', href: '#/' }, 'Browse everything'),
        bundle ? el('a', { class: 'btn plain', href: `#/bundle/${bundle.id}` }, `Start with the ${bundle.name} set`) : null),
    ];
  }

  // ---- what the page shows the browser tests (and anyone curious in the console) ---------------------

  const api = {
    ready: false,
    /** The scene as plain data: mode, player, things, collected, paused, muted, the sounds that fired. */
    state: () => (scene ? scene.state() : blankState()),
    /** Try assets that are not in the catalogue: sprite definitions or sound patches. They are treated like bag items. */
    async addAssets(list) { guests.push(...list); await build(); },
  };
  window.__loadoutPlay = api;

  // a mouse click leaves the button focused, and Space would then press it again instead of jumping
  const unfocus = (e) => { if (e.detail > 0) e.target.closest?.('button')?.blur(); };
  main.addEventListener('click', unfocus);

  await build();
  const off = bag.onChange(() => { build(); });
  return () => {
    gone = true; off();
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
 * health, a button with its states, or a set: every clip side by side. Each clip is its own small canvas,
 * so a long set wraps onto the next line instead of pushing the page wider than the screen.
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
    } };
  }
  if (plan.kind === 'glyphs') {
    const cells = Array.from({ length: health().max }, cell);
    return { node, tick() {
      const { hp } = health();
      if (!changed(hp)) return;
      cells.forEach((g, i) => { wipe(g); paint(g, i < hp ? plan.full : plan.empty, 0); });
    } };
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
    } };
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
  } };
}
