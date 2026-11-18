// The front door: the home page, the results view (search and filters over the whole catalogue),
// and the list of bundles. Everything here is drawn from the catalogue; no asset file is loaded to list it.
import { labelFor, BUNDLE_LEVELS } from '../catalog/schema.js';
import { matchesFilters } from '../search/core.js';
import { el, header, markNav } from './ui.js';
import { currentCatalog } from './catalog.js';
import { cardFor, bundleCard } from './cards.js';
import {
  FILTER_GROUPS, STYLE_KEYS, Q_MAX, stateFromQuery, queryFromState, hashFromState, filtersFor, viewCounts, optionsFor, roleTree, activeFilters,
  pickResults, resultLine, shelfTitle, styleMemory, finder, smart, setSmartSearch, smartNote, onSearchChange, onSmartChange,
} from './browse.js';

const EXAMPLES = ['coin', 'sword', 'jump', 'magic', 'footsteps', 'explosion', 'battle music'];
const EAGER = 12;        // cards made straight away; the rest are made when they scroll near the screen
const NEAR = '500px';    // how near
const SHOWN = 6;         // choices a filter lists before "Show more"
const NAV = { sprite: 'sprites', sound: 'sounds', music: 'music' };

/** A list whose cards are only made when their place scrolls near the screen. */
function lazyGallery(list, rowOf) {
  const cells = new Map();          // id -> <li>, kept so a card is made once
  let shown = [];
  const fill = (li) => {
    watch.unobserve(li);
    if (li.firstChild) return;
    li.card = cardFor(rowOf(li.dataset.id));
    li.append(li.card.node);
  };
  const watch = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) fill(e.target); }, { rootMargin: `${NEAR} 0px` });
  return {
    set(ids) {
      if (ids.length === shown.length && ids.every((id, i) => id === shown[i])) return;
      const next = new Set(ids);
      for (const id of shown) if (!next.has(id)) cells.get(id)?.card?.stop();        // a card that leaves goes quiet
      shown = ids;
      const lis = ids.map((id) => {
        let li = cells.get(id);
        if (!li) { li = el('li', { 'data-id': id, 'data-kind': rowOf(id).kind }); cells.set(id, li); }
        return li;
      });
      list.replaceChildren(...lis);
      watch.disconnect();
      lis.slice(0, EAGER).forEach(fill);
      for (const li of lis) if (!li.firstChild) watch.observe(li);
    },
    stop() { watch.disconnect(); for (const li of cells.values()) li.card?.stop(); },
  };
}

/**
 * The results view: one search box, filters built from what the catalogue holds, and the matching cards.
 * Returns { box (the search box and its switch), node (filters and results), search(words), stop() }.
 * The address bar follows the search and filters, so a link shows the same results.
 */
function resultsView(query, { home = false, onSearching = () => {} } = {}) {
  const catalog = currentCatalog();
  const byId = new Map(catalog.assets.map((a) => [a.id, a]));
  const memory = styleMemory();
  let state = memory.apply(stateFromQuery(query));
  let seq = 0, alive = true, painted = false, lastCounts = null, pushed = false;
  const more = new Set();           // filters showing every choice

  // ---- the search box and the "Smarter search" switch
  // the box takes exactly as much as the search does (Q_MAX), so what is shown is what is searched
  const input = el('input', { type: 'search', class: 'search find', placeholder: 'Search sprites, sounds and music', 'aria-label': 'Search', maxlength: String(Q_MAX), autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  input.value = state.q;
  input.addEventListener('input', () => {
    if (input.value.length > Q_MAX) input.value = input.value.slice(0, Q_MAX);       // text put in by something other than typing or pasting
    state = { ...state, q: input.value };
    changed(performance.now());
  });
  const smartInput = el('input', { type: 'checkbox', role: 'switch', id: 'smart-search', 'aria-label': 'Smarter search', 'aria-describedby': 'smart-note' });
  const note = el('span', { class: 'smart-note', id: 'smart-note', role: 'status' });
  const smartBox = el('div', { class: 'smart' },
    el('label', { class: 'switch' }, smartInput, el('span', { class: 'knob' })),
    el('span', { class: 'smart-text' }, el('label', { class: 'smart-name', for: 'smart-search' }, 'Smarter search'), note));
  smartInput.addEventListener('change', () => { setSmartSearch(smartInput.checked); });
  function syncSmart() {
    smartBox.hidden = smart.sized && smart.bytes === 0;        // this copy of the site was built without it: nothing to offer
    smartInput.checked = smart.on;
    smartBox.dataset.state = smart.state;
    const text = smartNote(smart);
    if (note.textContent !== text) note.textContent = text;
  }
  const box = el('div', { class: 'find-box' }, input, smartBox);

  // ---- filters and results
  const line = el('p', { class: 'result-line', role: 'status' });
  const chips = el('div', { class: 'chips', hidden: true });
  const list = el('ul', { class: 'gallery results' });
  const empty = el('div', { class: 'empty', hidden: true });
  const panel = el('div', { class: 'filter-panel', id: 'filter-panel' });
  const toggleCount = el('span', { class: 'n', hidden: true });
  const toggle = el('button', { type: 'button', class: 'filters-toggle', 'aria-expanded': 'false', 'aria-controls': 'filter-panel', onclick: () => {
    const open = !side.classList.contains('open');
    side.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  } }, 'Narrow down', toggleCount);
  const side = el('aside', { class: 'finder-side', 'aria-label': 'Narrow down' }, toggle, panel);
  // for keyboard users: one press jumps over all the choices to the results
  const skip = el('button', { type: 'button', class: 'skip-link', onclick: () => {
    const first = list.querySelector('a[href], button');
    if (first) first.focus(); else { line.setAttribute('tabindex', '-1'); line.focus(); }
  } }, 'Skip to results');
  const node = el('section', { class: 'finder' }, skip, side, el('div', { class: 'finder-main' }, line, chips, list, empty));
  const gallery = lazyGallery(list, (id) => byId.get(id));

  // ---- changes
  function writeAddress() {
    const target = queryFromState(state) ? hashFromState(state) : home ? '#/' : '#/browse';
    if (location.hash === target || (target === '#/' && location.hash === '')) return;
    // the first search or filter from the front page is a new step, so Back returns to the front page as it was;
    // after that the address just follows along
    if (home && !pushed && target !== '#/') { history.pushState(null, '', target); pushed = true; } else history.replaceState(null, '', target);
  }
  function changed(typedAt) { writeAddress(); update(typedAt); }
  function setFilter(key, value) {
    state = { ...state, [key]: state[key] === value ? null : value };
    if (STYLE_KEYS.includes(key)) memory.remember(state);
    changed();
  }
  function clearFilters(keys) {
    state = { ...state, ...Object.fromEntries(keys.map((k) => [k, null])) };
    if (keys.some((k) => STYLE_KEYS.includes(k))) memory.remember(state);
    changed();
  }
  function search(text) { input.value = text; state = { ...state, q: text }; changed(); }

  // ---- drawing
  async function update(typedAt) {
    const mine = ++seq;
    const q = state.q, typed = q.trim() !== '';
    const direct = await finder.direct(q);                                           // at once
    if (mine !== seq || !alive) return;
    await draw(mine, direct, direct, typedAt);
    if (mine !== seq || !alive || !typed || !finder.deeper()) return;
    const ranked = await finder.ranked(q);                                           // smarter search: more, in a better order, follows
    if (mine !== seq || !alive) return;
    await draw(mine, ranked, direct);
  }

  async function draw(mine, ranked, direct, typedAt) {
    const filters = filtersFor(state), typed = state.q.trim() !== '';
    const found = pickResults({ ranked, direct });
    const counts = await finder.counts(filters, typed ? found : null);
    if (mine !== seq || !alive) return;
    // a view's number counts what choosing it leaves, which includes everything that has no view
    counts.view = viewCounts(typed ? found.map((id) => byId.get(id)) : catalog.assets, state);
    const main = found.filter((id) => byId.has(id) && matchesFilters(byId.get(id), filters));

    line.textContent = resultLine(main.length, state);
    gallery.set(main);
    drawEmpty(main.length === 0);
    drawFilters(counts);
    drawChips();
    const searching = typed || FILTER_GROUPS.some((g) => !g.sticky && state[g.key]);
    markNav(state.kind ? NAV[state.kind] : '');
    onSearching(searching, state);

    // for the speed tests: when the first results were on screen, and how long the last key press took
    const after = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
    if (!painted) { painted = true; after(() => performance.mark('loadout-results')); }
    if (typedAt != null) after(() => { performance.clearMeasures('loadout-typed'); performance.measure('loadout-typed', { start: typedAt, end: performance.now() }); });
  }

  function drawEmpty(show) {
    empty.hidden = !show;
    if (!show) return;
    const q = state.q.trim(), on = activeFilters(state, catalog.bundles);
    const tips = [];
    if (q) tips.push('Try a shorter or more common word, like "coin" or "jump", and check the spelling.');
    if (q && /\s/.test(q) && !smart.on) tips.push('Describing what you need? Switch on Smarter search above.');
    if (on.length) tips.push(q ? 'A filter may also be hiding what you want.' : 'Try removing a filter.');
    if (!q && !on.length) tips.push('The library has nothing in it yet.');
    empty.replaceChildren(
      el('p', {}, tips.join(' ')),
      el('p', { class: 'empty-do' },
        q ? el('button', { type: 'button', class: 'btn plain', onclick: () => { search(''); input.focus(); } }, 'Clear the search') : null,
        on.length ? el('button', { type: 'button', class: 'btn plain', onclick: () => clearFilters(on.map((c) => c.key)) }, on.length === 1 ? `Remove "${on[0].label}"` : 'Remove all filters') : null));
  }

  const choice = (key, o, extra = '') => el('button', {
    type: 'button', class: `fopt ${extra}`.trim(), 'aria-pressed': String(o.on), 'data-fkey': key, 'data-fval': o.value, onclick: () => setFilter(key, o.value),
  }, el('span', { class: 'fl' }, o.label), el('span', { class: 'n' }, String(o.count)));

  function groupNode(g, counts) {
    let rows;
    if (g.key === 'role') {
      rows = roleTree(counts.role, state.role).flatMap((t) => [
        choice('role', { value: t.id, label: t.label, count: t.count, on: t.on }, t.open ? 'branch open' : 'branch'),
        ...(t.open ? t.children.map((c) => choice('role', { value: c.id, label: c.label, count: c.count, on: c.on }, 'leaf')) : []),
      ]);
    } else {
      const all = optionsFor(g.key, counts, state, catalog.bundles);
      const cut = more.has(g.key) || all.length <= SHOWN + 1 ? all : all.filter((o, i) => i < SHOWN || o.on);
      rows = cut.map((o) => choice(g.key, o));
      if (cut.length < all.length) rows.push(el('button', { type: 'button', class: 'ghost fmore', onclick: () => { more.add(g.key); drawFilters(lastCounts); } }, `Show ${all.length - cut.length} more`));
    }
    if (!rows.length) return null;
    return el('div', { class: g.sticky ? 'fgroup sticky' : 'fgroup', role: 'group', 'aria-label': g.label },
      el('h3', { class: 'fname' }, g.label, g.sticky ? el('span', { class: 'kept' }, 'remembered') : null),
      el('ul', { class: 'fopts' }, rows.map((r) => el('li', {}, r))),
      g.note ? el('p', { class: 'fnote' }, g.note) : null);
  }

  function drawFilters(counts) {
    lastCounts = counts;
    const at = document.activeElement, hold = at && panel.contains(at) && at.dataset.fkey ? at.dataset : null;
    const groups = FILTER_GROUPS.map((g) => groupNode(g, counts)).filter(Boolean);
    panel.replaceChildren(...(groups.length ? groups : [el('p', { class: 'hint' }, 'Nothing to narrow down.')]));
    if (hold) [...panel.querySelectorAll('.fopt')].find((b) => b.dataset.fkey === hold.fkey && b.dataset.fval === hold.fval)?.focus();
    const n = activeFilters(state).length;
    toggleCount.textContent = String(n);
    toggleCount.hidden = n === 0;
  }

  function drawChips() {
    const on = activeFilters(state, catalog.bundles);
    chips.hidden = on.length === 0;
    const made = on.map((c) => el('span', { class: c.sticky ? 'chip sticky' : 'chip', title: c.sticky ? 'Remembered while you browse, so everything you find matches your game' : null },
      c.sticky ? el('span', { class: 'chip-kept' }, 'Your game') : null,
      el('span', { class: 'chip-label' }, c.label),
      el('button', { type: 'button', 'aria-label': `Remove ${c.label}`, onclick: () => clearFilters([c.key]) }, '×')));
    if (on.length > 1) made.push(el('button', { type: 'button', class: 'ghost', onclick: () => clearFilters(on.map((c) => c.key)) }, 'Remove all'));
    chips.replaceChildren(...made);
  }

  const unwatch = [onSearchChange(() => { if (alive) update(); }), onSmartChange(() => { if (alive) syncSmart(); })];
  syncSmart();
  update();
  return {
    box, node, search,
    stop() { alive = false; for (const off of unwatch) off(); gallery.stop(); },
  };
}

/** Home: the search box with a few example searches, game kits to start from, then everything. */
export function homePage(app, query) {
  document.title = 'Loadout';
  const catalog = currentCatalog();
  const kits = catalog.bundles.filter((b) => b.level === 'kit');
  const kitShelf = kits.length ? el('section', { class: 'kit-shelf' },
    el('h2', { class: 'shelf' }, 'Start from a kind of game'),
    el('p', { class: 'shelf-note' }, 'Sprites, sounds and music that already belong together. Open one to restyle it as a whole, try it out and download it.'),
    el('ul', { class: 'gallery kits' }, kits.map((b) => el('li', {}, bundleCard(b).node)))) : null;
  const shelf = el('h2', { class: 'shelf' }, 'Everything');
  const view = resultsView(query, { home: true, onSearching(on, state) {
    if (kitShelf) kitShelf.hidden = on;
    shelf.textContent = shelfTitle(state);          // "Everything" only when nothing is held back
  } });
  const examples = el('div', { class: 'examples', role: 'group', 'aria-label': 'Example searches' },
    el('span', { class: 'hint' }, 'Try'),
    EXAMPLES.map((text) => {
      const btn = el('button', { type: 'button', class: 'pill', onclick: () => view.search(text) }, text);
      finder.direct(text).then((ids) => { if (!ids.length) btn.remove(); }).catch(() => {});      // only examples that find something
      return btn;
    }));
  app.replaceChildren(header('home'), el('main', { class: 'home front' },
    el('h1', {}, 'Pixel sprites, sound effects and music you can make your own'),
    el('p', { class: 'lede' }, 'Find what your game needs, change it with a few sliders, and download it ready to use. No drawing, no recording, no code.'),
    view.box, examples, kitShelf, shelf, view.node));
  return view.stop;
}

/** #/browse: the results view by itself. */
export function browsePage(app, query) {
  document.title = 'Find · Loadout';
  const view = resultsView(query);
  app.replaceChildren(header(''), el('main', { class: 'home browse' },
    el('h1', { class: 'small' }, 'Find sprites, sounds and music'),
    view.box, view.node));
  return view.stop;
}

/** #/bundles: every bundle, game kits first. */
export function bundlesPage(app) {
  document.title = 'Bundles · Loadout';
  const { bundles } = currentCatalog();
  const levels = [...BUNDLE_LEVELS].reverse();               // kit, character, object
  const groups = [...levels.map((level) => [`${labelFor('level', level)}s`, bundles.filter((b) => b.level === level)]),
    ['Other bundles', bundles.filter((b) => !levels.includes(b.level))]].filter(([, list]) => list.length);
  app.replaceChildren(header('bundles'), el('main', { class: 'home' },
    el('h1', { class: 'small' }, 'Bundles'),
    el('p', { class: 'lede' }, 'Sprites, sounds and music that belong together. Open a bundle to restyle everything in it at once, try it out, and download it or add it to your bag.'),
    groups.length ? groups.map(([title, list]) => [
      groups.length > 1 ? el('h2', { class: 'shelf' }, title) : null,
      el('ul', { class: 'gallery kits' }, list.map((b) => el('li', {}, bundleCard(b).node)))])
      : el('p', { class: 'empty' }, 'There are no bundles yet.')));
  return () => {};
}
