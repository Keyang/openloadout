// The library, #/browse (docs/site-design.md, section 5; the picture to match is mocks/5-catalogue/library.html).
// Top to bottom: the search box with "Smarter search"; the kind tabs with their numbers (All, Sprites, Sounds, Music,
// Kits); one row of filters as small menus, where a chosen value becomes a black token with a × (the chosen kind shows
// as a token first in the row, and "Clear all", offered from the first choice, lets go of it too); the number of results,
// the sort and the grid or list switch; then the results, as cards or as rows with more facts.
//
// Everything is drawn from the catalogue: no asset file is loaded to list it, and a card is only made when its place
// scrolls near the screen (the library holds hundreds). The search, its levels and "Smarter search" are app/browse.js,
// unchanged; the address holds the search and filters as it always has, plus the Kits tab and the sort
// (app/library-state.js). Game type and View are remembered across visits (browse.js, styleMemory); grid or list is
// remembered too. The way back from an asset page finds its place by `ul.results > li[data-id]` (app/back.js).
import { matchesFilters } from '../search/core.js';
import { el, header } from './ui.js';
import { currentCatalog } from './catalog.js';
import { cardFor, bundleCard } from './cards.js';
import {
  STYLE_KEYS, Q_MAX, stateFromQuery, filtersFor, viewCounts, optionsFor, roleTree, activeFilters,
  pickResults, resultLine, styleMemory, finder, smart, setSmartSearch, smartNote, onSearchChange, onSmartChange,
} from './browse.js';
import { SORTS, extrasFromQuery, libraryHash, sortRows, kitsMatching, tabCounts, createLayoutMemory } from './library-state.js';
import { bagTray } from './tray.js';      // the bag at the right edge, filling up as things are added (app/tray.js)

const EAGER = 12;        // cards made straight away; the rest are made when they scroll near the screen
const NEAR = '500px';    // how near
const TABS = [['all', 'All'], ['sprite', 'Sprites'], ['sound', 'Sounds'], ['music', 'Music'], ['kits', 'Kits']];
// The filter row, in the order it is read. Kind is the tabs above it; the rest are the filters the site has always had.
const ROW = [
  { key: 'bundle', label: 'Kit' },
  { key: 'gameTypes', label: 'Game type' },
  { key: 'themes', label: 'Theme' },
  { key: 'type', label: 'Type' },
  // the two that are reached for least share one menu, so the row stays one row
  { key: 'more', label: 'More', parts: [{ key: 'role', label: 'Used for' }, { key: 'view', label: 'View', note: 'Sounds and music have no view, so they always stay.' }] },
];
const FILTER_KEYS = ROW.flatMap((f) => (f.parts ? f.parts.map((p) => p.key) : [f.key]));
const REMEMBERED = 'Remembered while you browse, so everything you find fits your game';

const NS = 'http://www.w3.org/2000/svg';
function icon(d, { fill = false } = {}) {
  const n = document.createElementNS(NS, 'svg');
  n.setAttribute('viewBox', '0 0 16 16'); n.setAttribute('width', '16'); n.setAttribute('height', '16'); n.setAttribute('aria-hidden', 'true');
  if (fill) n.setAttribute('fill', 'currentColor');
  else { n.setAttribute('fill', 'none'); n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', '1.5'); n.setAttribute('stroke-linecap', 'round'); n.setAttribute('stroke-linejoin', 'round'); }
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); n.append(p);
  return n;
}
const I = {
  search: 'M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10.5 10.5 14 14', down: 'M4 6l4 4 4-4', x: 'M4 4l8 8M12 4l-8 8',
  grid: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z', list: 'M2.5 4h11M2.5 8h11M2.5 12h11',
};

/** The browser's storage for the remembered layout (or nothing, in a private window). */
function layoutStorage() {
  try { const s = globalThis.localStorage; s.getItem('x'); return s; } catch { return { getItem: () => null, setItem() {} }; }
}
let layouts = null;

/** A list whose cards are only made when their place scrolls near the screen. `make(id)` gives a card ({ node, stop() }). */
function lazyGallery(list, make, kindOf) {
  let cells = new Map();          // id -> <li>, kept so a card is made once
  let shown = [];
  const fill = (li) => {
    watch.unobserve(li);
    if (li.firstChild) return;
    li.card = make(li.dataset.id);
    li.append(li.card.node);
  };
  const watch = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) fill(e.target); }, { rootMargin: `${NEAR} 0px` });
  const quiet = () => { for (const li of cells.values()) li.card?.stop(); };
  return {
    set(ids) {
      if (ids.length === shown.length && ids.every((id, i) => id === shown[i])) return;
      const next = new Set(ids);
      for (const id of shown) if (!next.has(id)) cells.get(id)?.card?.stop();        // a card that leaves goes quiet
      shown = ids;
      const lis = ids.map((id) => {
        let li = cells.get(id);
        if (!li) { li = el('li', { 'data-id': id, 'data-kind': kindOf(id) }); cells.set(id, li); }
        return li;
      });
      list.replaceChildren(...lis);
      watch.disconnect();
      lis.slice(0, EAGER).forEach(fill);
      for (const li of lis) if (!li.firstChild) watch.observe(li);
    },
    /** Every card is made again (the layout changed). */
    remake() { quiet(); cells = new Map(); const ids = shown; shown = []; this.set(ids); },
    stop() { watch.disconnect(); quiet(); },
  };
}

/** #/browse: the library. Returns the function that stops it. */
export function libraryPage(app, query) {
  document.title = 'Library · Loadout';
  const catalog = currentCatalog();
  const byId = new Map(catalog.assets.map((a) => [a.id, a]));
  const memory = styleMemory();
  layouts ??= createLayoutMemory(layoutStorage());
  let state = memory.apply(stateFromQuery(query));
  let extras = extrasFromQuery(query);
  if (extras.kits) state = { ...state, kind: null };
  let seq = 0, alive = true, painted = false, lastCounts = null, openKey = null, firstDraw = true;

  // ---- the search box and the "Smarter search" switch (the same search, the same stored choice, as always)
  // the box takes exactly as much as the search does (Q_MAX), so what is shown is what is searched
  const input = el('input', { type: 'search', class: 'find', placeholder: 'Search sprites, sounds and music', 'aria-label': 'Search', maxlength: String(Q_MAX), autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  input.value = state.q;
  input.addEventListener('input', () => {
    if (input.value.length > Q_MAX) input.value = input.value.slice(0, Q_MAX);       // text put in by something other than typing or pasting
    state = { ...state, q: input.value };
    changed(performance.now());
  });
  const smartInput = el('input', { type: 'checkbox', role: 'switch', id: 'smart-search', 'aria-label': 'Smarter search', 'aria-describedby': 'smart-note' });
  const note = el('span', { class: 'smart-note', id: 'smart-note', role: 'status' });
  // only the name shows; what it does (and what it downloads) is said when the switch is on, focused or pointed at
  const smartBox = el('div', { class: 'smart' },
    el('span', { class: 'switch' }, smartInput, el('span', { class: 'knob' })),
    el('span', { class: 'smart-text' }, el('label', { class: 'smart-name', for: 'smart-search' }, 'Smarter search'), note));
  smartInput.addEventListener('change', () => { setSmartSearch(smartInput.checked); });
  function syncSmart() {
    smartBox.hidden = smart.sized && smart.bytes === 0;        // this copy of the site was built without it: nothing to offer
    smartInput.checked = smart.on;
    smartBox.dataset.state = smart.state;
    const text = smartNote(smart);
    if (note.textContent !== text) note.textContent = text;
    input.placeholder = smart.on && smart.state === 'ready' ? 'Describe it, like "something for when the player dies"' : 'Search sprites, sounds and music';
  }
  const searchRow = el('div', { class: 'lib-search' }, el('div', { class: 'search', role: 'search' }, icon(I.search), input), smartBox);

  // ---- tabs, the bar, results
  const tabs = el('div', { class: 'tabs lib-tabs', role: 'tablist', 'aria-label': 'Kind' });
  const filters = el('div', { class: 'lib-filters', role: 'group', 'aria-label': 'Filters' });
  const line = el('p', { class: 'result-line', role: 'status' }, 'Loading…');
  const sort = el('select', { id: 'lib-sort', onchange: () => { extras = { ...extras, sort: sort.value }; changed(); } },
    SORTS.map((s) => el('option', { value: s.id }, s.label)));
  sort.value = extras.sort;
  const sortBox = el('span', { class: 'lib-sort' }, el('label', { for: 'lib-sort' }, 'Sort'), sort);
  const layoutBtn = (id, label, d, fill) => el('button', { type: 'button', 'data-layout': id, 'aria-label': label, title: label, 'aria-pressed': 'false', onclick: () => setLayout(id) }, icon(d, { fill }));
  const layoutBox = el('span', { class: 'seg lib-layout', role: 'group', 'aria-label': 'Layout' },
    layoutBtn('grid', 'Grid', I.grid, true), layoutBtn('list', 'List with more facts', I.list));
  const bar = el('div', { class: 'lib-bar' }, filters, el('span', { class: 'lib-bar-end' }, line, sortBox, layoutBox));

  const head = el('div', { class: 'rows-head', 'aria-hidden': 'true', hidden: true });
  const list = el('ul', { class: 'results card-grid' });
  const empty = el('div', { class: 'empty', hidden: true });
  const kitsBox = el('ul', { class: 'lib-kits', hidden: true });
  const panel = el('div', { class: 'lib-results', role: 'tabpanel', 'aria-label': 'Results' }, head, list, kitsBox, empty);
  // for keyboard users: one press jumps over the tabs and filters to the results
  const skip = el('button', { type: 'button', class: 'skip-link', onclick: () => {
    const first = (extras.kits ? kitsBox : list).querySelector('a[href], button');
    if (first) first.focus(); else { line.setAttribute('tabindex', '-1'); line.focus(); }
  } }, 'Skip to results');

  const gallery = lazyGallery(list, (id) => cardFor(byId.get(id), { layout: layouts.get() === 'list' ? 'row' : 'card' }), (id) => byId.get(id).kind);
  let kitCards = [];

  // ---- changes
  function writeAddress() {
    const target = libraryHash(state, extras);
    if (location.hash !== target) history.replaceState(null, '', target);      // the address follows along; it is not a new step for Back
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
  /** Every filter and the kind go; the words typed stay. */
  function clearAll() {
    extras = { ...extras, kits: false };
    clearFilters([...FILTER_KEYS, 'kind']);
    tabs.querySelector('[data-kind="all"]')?.focus();       // the button pressed is gone: the focus waits on All
  }
  function search(text) { input.value = text; state = { ...state, q: text }; changed(); }
  function setKind(kind) {
    openKey = null;
    extras = { ...extras, kits: kind === 'kits' };
    const next = kind === 'all' || kind === 'kits' ? null : kind;
    state = { ...state, kind: next };
    // a type that nothing of the new kind has would only empty the page: let go of it
    if (next && state.type && !catalog.assets.some((a) => a.kind === next && a.type === state.type)) state = { ...state, type: null };
    changed();
  }
  function setLayout(id) {
    if (layouts.get() === id) return;
    layouts.set(id);
    showLayout();
    gallery.remake();
  }
  function showLayout() {
    const rows = layouts.get() === 'list';
    for (const b of layoutBox.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.layout === layouts.get()));
    list.className = rows ? 'results rows' : 'results card-grid';
    drawHead();
  }
  function drawHead() {
    const rows = layouts.get() === 'list' && !extras.kits;
    head.hidden = !rows || list.childElementCount === 0;
    if (!rows) return;
    const k = state.kind, audio = k === 'sound' || k === 'music';
    head.replaceChildren(...['', 'Name', 'Type', 'Kit', audio ? '' : 'Animations', 'Controls', k === 'sprite' ? '' : 'Length', audio ? 'Listen' : k === 'sprite' ? 'Versions' : '', '']
      .map((t, i) => el('span', { class: ['', '', 'c-type', 'c-kit', 'c-anim', 'c-ctl', 'c-len', '', ''][i] }, t)));
  }

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
    const filters_ = filtersFor(state), typed = state.q.trim() !== '';
    const found = pickResults({ ranked, direct });
    const counts = await finder.counts(filters_, typed ? found : null);
    if (mine !== seq || !alive) return;
    // a view's number counts what choosing it leaves, which includes everything that has no view
    counts.view = viewCounts(typed ? found.map((id) => byId.get(id)) : catalog.assets, state);
    const rows = found.filter((id) => byId.has(id) && matchesFilters(byId.get(id), filters_)).map((id) => byId.get(id));
    const ids = sortRows(rows, extras.sort, { typed }).map((r) => r.id);
    // a kit is counted while something in it passes the filters in use (the kind aside: a kit is not of one kind)
    const kitFilters = filtersFor({ ...state, kind: null }), narrowed = Object.keys(kitFilters).length > 0;
    const kits = kitsMatching(catalog.bundles, state.q).filter((b) => !narrowed
      || [...(b.sprites ?? []), ...(b.sounds ?? []), ...(b.music ?? [])].some((id) => byId.has(id) && matchesFilters(byId.get(id), kitFilters)));

    drawTabs(tabCounts(counts, kits.length));
    drawFilters(counts);
    sort.options[0].textContent = typed ? SORTS[0].typed : SORTS[0].label;
    sort.value = extras.sort;
    // sort and grid or list are only offered while there is something to sort or lay out
    sortBox.hidden = layoutBox.hidden = extras.kits || ids.length === 0;
    // nothing found is said once, large, where the results would be (the line stays for screen readers)
    line.classList.toggle('sr', (extras.kits ? kits.length : ids.length) === 0);
    list.hidden = extras.kits;
    kitsBox.hidden = !extras.kits;
    if (extras.kits) {
      line.textContent = kits.length ? `${kits.length} ${kits.length === 1 ? 'kit' : 'kits'}${typed ? ` for "${state.q.trim().slice(0, 40)}"` : ''}` : resultLine(0, state);
      gallery.set([]);
      drawKits(kits);
      drawEmpty(kits.length === 0, true);
    } else {
      line.textContent = resultLine(ids.length, state);
      gallery.set(ids);
      drawKits([]);
      drawEmpty(ids.length === 0, false);
    }
    showLayout();
    if (firstDraw) { firstDraw = false; panel.removeAttribute('aria-busy'); }

    // for the speed tests: when the first results were on screen, and how long the last key press took
    const after = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
    if (!painted) { painted = true; after(() => performance.mark('loadout-results')); }
    if (typedAt != null) after(() => { performance.clearMeasures('loadout-typed'); performance.measure('loadout-typed', { start: typedAt, end: performance.now() }); });
  }

  function drawTabs(n) {
    const now = extras.kits ? 'kits' : state.kind ?? 'all';
    const at = document.activeElement, held = at && tabs.contains(at) ? at.dataset.kind : null;
    tabs.replaceChildren(...TABS.map(([kind, label]) => el('button', {
      type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(kind === now), tabindex: kind === now ? '0' : '-1', 'data-kind': kind, onclick: () => setKind(kind),
    }, label, ' ', el('span', { class: 'n' }, String(n[kind])))));
    if (held) tabs.querySelector(`[data-kind="${held}"]`)?.focus();
  }
  tabs.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    const all = [...tabs.querySelectorAll('.tab')], i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    all[e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + step + all.length) % all.length].focus();
  });

  let kitsShown = '';
  function drawKits(kits) {
    const key = kits.map((b) => b.id).join(' ');
    if (key === kitsShown) return;
    kitsShown = key;
    kitCards = kits.map((b) => bundleCard(b));
    kitsBox.replaceChildren(...kits.map((b, i) => el('li', { 'data-id': b.id }, kitCards[i].node)));
  }

  function drawEmpty(show, kits) {
    empty.hidden = !show;
    if (!show) return;
    const q = state.q.trim(), on = activeFilters(state, catalog.bundles).filter((c) => !(kits && c.key === 'kind'));
    const tips = [];
    if (q) tips.push(kits ? 'No kit has these words in its name or its line. The other tabs search everything.' : 'Try a shorter or more common word, like "coin" or "jump", and check the spelling.');
    if (!kits && q && /\s/.test(q) && !smart.on && smart.bytes > 0) tips.push('Describing what you need? Switch on Smarter search above.');      // only when this build offers it
    if (on.length) tips.push(q ? 'A filter may also be hiding what you want.' : 'Try removing a filter.');
    if (!q && !on.length) tips.push('The library has nothing in it yet.');
    empty.replaceChildren(
      el('p', { class: 'empty-title', 'aria-hidden': 'true' }, resultLine(0, state)),
      el('p', {}, tips.join(' ')),
      el('p', { class: 'empty-do' },
        q ? el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { search(''); input.focus(); } }, 'Clear the search') : null,
        on.length ? el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => clearFilters(on.map((c) => c.key)) }, on.length === 1 ? `Remove "${on[0].label}"` : 'Remove all filters') : null));
  }

  // ---- the filter row: a button until a value is chosen, then a token that can be taken away
  /** The choices of one filter: [{ value, label, count, on, leaf }]. */
  function choices(key, counts) {
    if (key !== 'role') return optionsFor(key, counts, state, catalog.bundles);
    return roleTree(counts.role, state.role).flatMap((t) => [
      { value: t.id, label: t.label, count: t.count, on: t.on },
      ...t.children.map((c) => ({ value: c.id, label: c.label, count: c.count, on: c.on, leaf: true })),
    ]);
  }
  function drawFilters(counts, focus = null) {
    lastCounts = counts;
    const chosen = activeFilters(state, catalog.bundles);
    const nodes = [];
    const item = (key, o) => el('button', {
      type: 'button', role: 'menuitemradio', class: o.leaf ? 'leaf' : null, 'aria-checked': String(!!o.on), 'data-fkey': key, 'data-fval': o.value,
      onclick: () => { openKey = null; pendingFocus = key; setFilter(key, o.value); },
    }, el('span', { class: 'fl' }, o.label), el('span', { class: 'n' }, String(o.count)));
    const remembered = (f) => (STYLE_KEYS.includes(f.key) ? el('p', { class: 'menu-note' }, f.note ? `${f.note} ` : '', 'Remembered for your next visit.') : null);
    for (const f of ROW) {
      // one filter, or the few that share the "More" menu: each has its own choices and, once chosen, its own token
      const parts = (f.parts ?? [f]).map((p) => ({ ...p, opts: choices(p.key, counts), on: chosen.find((c) => c.key === p.key) })).filter((p) => p.opts.length || p.on);
      if (!parts.length) { if (openKey === f.key) openKey = null; continue; }
      const open = openKey === f.key;
      const attrs = { type: 'button', 'data-menu': f.key, 'aria-haspopup': 'menu', 'aria-expanded': String(open), onclick: (e) => toggleMenu(f.key, e.detail === 0) };
      const heads = parts.filter((p) => p.on).map((p) => el('span', { class: 'token', 'data-token': p.key, title: STYLE_KEYS.includes(p.key) ? REMEMBERED : null },
        el('button', { ...attrs, class: 'what' }, el('small', {}, p.label), p.on.label),
        el('button', { type: 'button', class: 'x', 'aria-label': `Remove the filter ${p.label}: ${p.on.label}`, onclick: () => { openKey = null; clearFilters([p.key]); } }, icon(I.x))));
      if (f.parts ? parts.some((p) => !p.on) : !heads.length) heads.push(el('button', { ...attrs, class: 'filter-btn' }, f.label, icon(I.down)));
      const menu = !open ? null : el('div', { class: 'menu', role: 'menu', 'aria-label': f.label },
        f.parts
          ? parts.map((p) => el('div', { class: 'menu-part', role: 'group', 'aria-label': p.label }, el('p', { class: 'menu-head', 'aria-hidden': 'true' }, p.label), p.opts.map((o) => item(p.key, o)), remembered(p)))
          : [parts[0].opts.map((o) => item(f.key, o)), remembered(f)]);
      nodes.push(el('div', { class: 'menu-wrap filter', role: 'group', 'aria-label': f.label, 'data-filter': f.key }, heads, menu));
    }
    // the kind chosen with the tabs is a choice too: it shows as a token first in the row, and Clear all lets go of it
    const kindLabel = extras.kits ? 'Kits' : TABS.find(([k]) => k === state.kind)?.[1] ?? null;
    if (kindLabel) {
      nodes.unshift(el('span', { class: 'kind-token', 'data-kind-token': '' },
        el('span', { class: 'what' }, el('small', {}, 'Kind'), kindLabel),
        el('button', { type: 'button', class: 'x', 'aria-label': `Remove the filter Kind: ${kindLabel}`, onclick: () => { openKey = null; setKind('all'); tabs.querySelector('[data-kind="all"]')?.focus(); } }, icon(I.x))));
    }
    if (kindLabel || chosen.some((c) => c.key !== 'kind')) {
      nodes.push(el('button', { type: 'button', class: 'lib-clear', onclick: () => { openKey = null; clearAll(); } }, 'Clear all'));
    }
    // what had the focus keeps it when the row is drawn again (results arriving while a menu is open)
    const at = document.activeElement, held = at instanceof HTMLElement && filters.contains(at) ? { ...at.dataset } : null;
    filters.replaceChildren(...nodes);
    if (held && focus == null && pendingFocus == null) {
      (held.fkey ? [...filters.querySelectorAll('[data-fkey]')].find((b) => b.dataset.fkey === held.fkey && b.dataset.fval === held.fval) : held.menu ? filters.querySelector(`[data-menu="${held.menu}"]`) : null)?.focus();
    }
    // an open menu stays inside the window
    const menu = filters.querySelector('.menu');
    if (menu) {
      const r = menu.getBoundingClientRect();
      if (r.right > document.documentElement.clientWidth - 8) menu.classList.add('right');
      if (menu.getBoundingClientRect().left < 8) { menu.classList.remove('right'); menu.style.left = `${8 - menu.parentElement.getBoundingClientRect().left}px`; }
    }
    const want = focus ?? pendingFocus;
    pendingFocus = null;
    if (want === 'items') (menu?.querySelector('[aria-checked="true"]') ?? menu?.querySelector('button'))?.focus();
    else if (want) filters.querySelector(`[data-token="${want}"] [data-menu], [data-menu="${want}"]`)?.focus();
  }
  let pendingFocus = null;
  function toggleMenu(key, byKeyboard) {
    openKey = openKey === key ? null : key;
    drawFilters(lastCounts, openKey && byKeyboard ? 'items' : key);
  }
  function closeMenu(refocus) {
    if (!openKey) return;
    const key = openKey;
    openKey = null;
    drawFilters(lastCounts, refocus ? key : null);
  }
  filters.addEventListener('keydown', (e) => {
    const menu = filters.querySelector('.menu');
    if (!menu) {
      // Down on a closed filter opens it, as menus do
      const opener = e.key === 'ArrowDown' && e.target instanceof Element ? e.target.closest('[data-menu]') : null;
      if (opener) { e.preventDefault(); openKey = opener.dataset.menu; drawFilters(lastCounts, 'items'); }
      return;
    }
    const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    const go = { ArrowDown: i < 0 ? 0 : (i + 1) % items.length, ArrowUp: i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[e.key];
    if (go != null && items.length) { e.preventDefault(); items[go].focus(); }
  });
  const onDocClick = (e) => { if (openKey && !(e.target instanceof Element && e.target.closest('.filter'))) closeMenu(false); };
  const onDocKey = (e) => { if (e.key === 'Escape' && openKey) { e.stopPropagation(); closeMenu(true); } };
  // leaving the row with the keyboard closes what is open
  filters.addEventListener('focusout', (e) => { if (openKey && e.relatedTarget instanceof Element && !e.relatedTarget.closest(`.filter[data-filter="${openKey}"]`)) closeMenu(false); });
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKey);

  panel.setAttribute('aria-busy', 'true');
  // the bag's tray beside the results (1024 px and wider: app/css/tray.css); it stays while the results scroll
  const tray = bagTray({ size: 'full' });
  app.replaceChildren(header('library'), el('main', { class: 'v2 lib' },
    el('h1', { class: 'sr' }, 'Library'), searchRow, skip, tabs, bar, panel), tray.node);
  tray.placed();
  showLayout();
  drawTabs({ all: '', sprite: '', sound: '', music: '', kits: '' });

  const unwatch = [onSearchChange(() => { if (alive) update(); }), onSmartChange(() => { if (alive) syncSmart(); })];
  syncSmart();
  update();
  return function stop() {
    alive = false;
    for (const off of unwatch) off();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKey);
    gallery.stop();
    for (const c of kitCards) c.stop();
    tray.stop();
  };
}

/** The name the router knows the page by. */
export const browsePage = libraryPage;
