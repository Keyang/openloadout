// Home and the catalogue: everything on one searchable shelf.
import { sprites } from '../sprites/index.js';
import { kits } from '../kits/index.js';
import { el, header, cap } from './ui.js';
import { sounds, music } from './audio.js';
import { spriteCard, soundCard, musicCard, kitCard, runCards } from './cards.js';

/** type: 'all' | 'sprites' | 'sounds' | 'music'. Returns a teardown function. */
export function catalogue(app, type, query) {
  const isHome = type === 'all';
  document.title = isHome ? 'Loadout' : `${cap(type)} · Loadout`;

  const items = [
    ...sprites.map((s) => ({ type: 'sprites', group: s.kind, text: `${s.name} ${s.kind} ${s.blurb ?? ''}`.toLowerCase(), make: () => spriteCard(s) })),
    ...sounds.map((p) => ({ type: 'sounds', group: cap(p.category), text: `${p.name} ${p.category} ${(p.tags ?? []).join(' ')} ${p.description ?? ''}`.toLowerCase(), make: () => soundCard(p) })),
    ...music.map((p) => ({ type: 'music', group: 'Music', text: `${p.name} music ${(p.tags ?? []).join(' ')} ${p.description ?? ''}`.toLowerCase(), make: () => musicCard(p) })),
  ].filter((it) => type === 'all' || it.type === type);

  const state = { type: 'all', group: 'All', q: query.q ?? '' };
  const grid = el('ul', { class: 'gallery' });
  const empty = el('p', { class: 'empty', hidden: true });
  const groups = ['All', ...new Set(items.map((it) => it.group))];
  const groupBar = el('div', { class: 'pills', role: 'group', 'aria-label': 'Kind' },
    groups.map((gname) => el('button', { type: 'button', class: 'pill', 'aria-pressed': String(gname === 'All'), onclick: (e) => {
      state.group = gname;
      for (const b of groupBar.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      show();
    } }, gname)));
  const search = el('input', { type: 'search', class: 'search', placeholder: isHome ? 'Search sprites, sounds and music' : `Search ${type}`, 'aria-label': 'Search', value: state.q, oninput: (e) => { state.q = e.target.value; show(); } });

  let stop = () => {};
  function show() {
    stop();
    const q = state.q.trim().toLowerCase();
    const hits = items.filter((it) => (state.group === 'All' || it.group === state.group) && (!q || q.split(/\s+/).every((w) => it.text.includes(w))));
    const cards = hits.map((it) => it.make());
    grid.replaceChildren(...cards.map((c) => el('li', {}, c.node)));
    empty.hidden = hits.length > 0;
    empty.textContent = hits.length ? '' : `Nothing matches "${state.q}". Try a shorter word, or clear the search to see everything.`;
    stop = runCards(cards);
  }

  const kitCards = isHome ? kits.map(kitCard) : [];
  const stopKits = runCards(kitCards);

  const intro = isHome
    ? [
      el('h1', {}, 'Pixel sprites, sound effects and music you can make your own'),
      el('p', { class: 'lede' }, 'Everything here is a small program, not a fixed file. Pick a sprite, a sound or a music track, move a few sliders, pair them up, and download the result ready for your game. No drawing, no recording, no code.'),
      el('p', { class: 'cta' },
        el('a', { class: 'btn big', href: '#/sprites' }, `Browse ${sprites.length} sprites`),
        el('a', { class: 'btn big plain', href: '#/sounds' }, `Browse ${sounds.length} sounds`),
        music.length ? el('a', { class: 'btn big plain', href: '#/music' }, music.length === 1 ? 'Hear the music' : `Browse ${music.length} tracks`) : null),
      el('ol', { class: 'steps' },
        el('li', {}, el('strong', {}, 'Pick'), ' a sprite, a sound, a music track, or a kit that has all three.'),
        el('li', {}, el('strong', {}, 'Change'), ' its shape, colours, motion or tone with sliders. Every frame and every sound redraws to match.'),
        el('li', {}, el('strong', {}, 'Download'), ' a sprite sheet with its sounds attached to the right animation frames.')),
      el('h2', { class: 'shelf' }, 'Kits'),
      el('p', { class: 'shelf-note' }, 'Sprites, sounds and music that belong together, in one download.'),
      el('ul', { class: 'gallery kits' }, kitCards.map((c) => el('li', {}, c.node))),
      el('h2', { class: 'shelf' }, 'Everything'),
    ]
    : [
      el('h1', { class: 'small' }, cap(type)),
      el('p', { class: 'lede' }, type === 'sprites'
        ? 'Animated pixel characters, creatures, items and effects. Open one to change how it looks and moves, and to choose its sounds.'
        : type === 'sounds'
          ? 'Sound effects made by a small synthesiser, not recordings. Press a card to hear it, or open it to change its tone.'
          : 'Looping game music played by the same synthesiser. Open a track to change its tempo, key and intensity while it plays.'),
    ];

  app.replaceChildren(
    header(isHome ? 'home' : type),
    el('main', { class: 'home' }, intro, el('div', { class: 'filters' }, groups.length > 2 ? groupBar : el('span'), search), grid, empty));
  show();
  return () => { stop(); stopKits(); };
}

export function kitsPage(app) {
  document.title = 'Kits · Loadout';
  const cards = kits.map(kitCard);
  app.replaceChildren(
    header('kits'),
    el('main', { class: 'home' },
      el('h1', { class: 'small' }, 'Kits'),
      el('p', { class: 'lede' }, 'Sprites, sounds and music that belong together. Download a whole kit at once, or open any piece to change it first.'),
      el('ul', { class: 'gallery kits' }, cards.map((c) => el('li', {}, c.node)))));
  return runCards(cards);
}
